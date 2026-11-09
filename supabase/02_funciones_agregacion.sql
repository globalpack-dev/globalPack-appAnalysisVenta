-- ============================================================================
--  Funciones de agregación para el Dashboard
--
--  Por qué en SQL y no en JavaScript: el prototipo calculaba los KPIs y rankings
--  recorriendo el array completo en el navegador (23 `reduce` en Dashboard,
--  26 en Marketing). Con los 8.705 registros reales eso significa descargar toda
--  la tabla para pintar un gráfico.
--
--  Todas aceptan los mismos 7 filtros del panel "Filtros globales", que en el
--  prototipo eran decorativos: cambiaban el estado del <select> pero ningún
--  número se movía. Ahora cada función aplica los 7.
--
--  `security invoker` (no definer): las políticas RLS del usuario se siguen
--  aplicando. Con `definer` las funciones se saltarían RLS.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  Helper: predicado de filtro reutilizable
-- ----------------------------------------------------------------------------
--  Nota: se aplica sobre la vista v_ventas_detalle. Se deja como función para
--  que los 7 filtros estén escritos una sola vez y no se desincronicen entre
--  funciones.

CREATE OR REPLACE FUNCTION fn_ventas_filtradas(
    p_anio        int  DEFAULT NULL,
    p_mes         int  DEFAULT NULL,
    p_cliente     int  DEFAULT NULL,
    p_localidad   int  DEFAULT NULL,
    p_marca       int  DEFAULT NULL,
    p_encargado   int  DEFAULT NULL,
    p_canal       text DEFAULT NULL
)
RETURNS SETOF v_ventas_detalle
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT d.*
    FROM v_ventas_detalle d
    JOIN clientes c ON c.id_cliente = d.id_cliente
    WHERE (p_anio      IS NULL OR d.anio = p_anio)
      AND (p_mes       IS NULL OR d.mes = p_mes)
      AND (p_cliente   IS NULL OR d.id_cliente = p_cliente)
      AND (p_localidad IS NULL OR c.id_localidad = p_localidad)
      AND (p_marca     IS NULL OR d.id_producto IN (
              SELECT pr.id_producto FROM productos pr WHERE pr.id_marca = p_marca))
      AND (p_encargado IS NULL OR d.id_encargado_venta = p_encargado)
      AND (p_canal     IS NULL OR d.canal_ajustado = p_canal);
$$;


-- ----------------------------------------------------------------------------
--  1. fn_dashboard_kpis — los 8 KPI del Dashboard en una sola fila
-- ----------------------------------------------------------------------------
--  Es una sola llamada y no 8: con los filtros aplicados, 8 requests separadas
--  multiplicarían el trabajo de la base sin necesidad.
--
--  COALESCE en los SUM: un filtro que no matchea nada devuelve 0 y no NULL,
--  que en la UI se vería como $NaN o un KPI en blanco.
--
--  `clientes_activos` usa la regla de los últimos 30 días. La base no guarda
--  fechas por venta: el período es (anio, mes). Como un mes ≈ 30 días, la regla
--  se traduce como "compró en el último período con ventas dentro del filtro".
--  La referencia NO es el último período del filtro sino el último período que
--  tiene movimientos: si se filtra por una marca que no vendió este mes, el
--  cliente debe seguir contando como activo.

CREATE OR REPLACE FUNCTION fn_dashboard_kpis(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    total_neto         numeric,
    total_bruto        numeric,
    total_final        numeric,
    total_bultos       numeric,
    total_hl           numeric,
    operaciones        bigint,
    clientes_activos   bigint,
    productos_vendidos bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    ),
    ref AS (
        -- Último período (anio, mes) con ventas dentro del filtro.
        SELECT MAX(anio) AS anio, MAX(mes) AS mes FROM f
    )
    SELECT
        COALESCE(SUM(f.importe_neto), 0),
        COALESCE(SUM(f.importe_bruto), 0),
        COALESCE(SUM(f.importe_final), 0),
        COALESCE(SUM(f.cantidad_bultos), 0),
        COALESCE(SUM(f.cantidad_hl), 0),
        COUNT(*),
        COUNT(DISTINCT CASE
            WHEN f.anio = ref.anio AND f.mes = ref.mes THEN f.id_cliente
        END),
        COUNT(DISTINCT f.id_producto)
    FROM f, ref;
$$;


-- ----------------------------------------------------------------------------
--  2. fn_ventas_mensuales — la serie del gráfico de evolución
-- ----------------------------------------------------------------------------
--  El prototipo la sacaba de `ventasMensuales`, un array con los 10 meses ya
--  calculados. Acá se calcula desde los hechos, así que refleja los filtros.
--
--  No devuelve `objetivo`: las metas no están en el Excel, las define el negocio
--  y viven en `localStorage` (ver plan/adaptacion-prototipo-a-base.md §10.1).

CREATE OR REPLACE FUNCTION fn_ventas_mensuales(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    anio        int,
    mes         int,
    nombre_mes  text,
    mes_corto   text,
    importe_neto   numeric,
    importe_bruto  numeric,
    importe_final  numeric,
    cantidad_bultos numeric,
    cantidad_hl     numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        f.anio,
        f.mes,
        MIN(f.nombre_mes),
        LEFT(MIN(f.nombre_mes), 3),
        SUM(f.importe_neto),
        SUM(f.importe_bruto),
        SUM(f.importe_final),
        SUM(f.cantidad_bultos),
        SUM(f.cantidad_hl)
    FROM fn_ventas_filtradas(
        p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
    ) f
    GROUP BY f.anio, f.mes
    ORDER BY f.anio, f.mes;
$$;


-- ----------------------------------------------------------------------------
--  3. fn_top_clientes — ranking de clientes por venta
-- ----------------------------------------------------------------------------
--  Usa COALESCE(nombre_fantasia, razon_social): en la base real 2 de cada 4
--  clientes tienen `nombre_fantasia` en NULL, y el prototipo hacía
--  `nombreFantasia.charAt(0)` sin protección.

CREATE OR REPLACE FUNCTION fn_top_clientes(
    p_limite    int  DEFAULT 10,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_cliente    int,
    cliente_nombre text,
    ventas        numeric,
    participacion numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    ),
    agg AS (
        SELECT
            f.id_cliente,
            COALESCE(c.nombre_fantasia, c.razon_social) AS cliente_nombre,
            SUM(f.importe_neto) AS ventas
        FROM f
        JOIN clientes c ON c.id_cliente = f.id_cliente
        GROUP BY f.id_cliente, c.nombre_fantasia, c.razon_social
    )
    SELECT
        a.id_cliente,
        a.cliente_nombre,
        a.ventas,
        CASE WHEN SUM(a.ventas) OVER () > 0
             THEN ROUND(a.ventas * 100 / SUM(a.ventas) OVER (), 2)
             ELSE 0 END
    FROM agg a
    ORDER BY a.ventas DESC
    LIMIT p_limite;
$$;


-- ----------------------------------------------------------------------------
--  4. fn_ventas_por_encargado — "Ventas por Sector" del Dashboard
-- ----------------------------------------------------------------------------
--  Cambio de significado: el prototipo agrupaba por zona geográfica
--  ("Zona Norte GBA"). El esquema real trata el sector de venta como la
--  *persona* encargada, así que el ranking ahora muestra nombres de personas.

CREATE OR REPLACE FUNCTION fn_ventas_por_encargado(
    p_limite    int  DEFAULT 10,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_encargado    int,
    encargado_nombre text,
    supervisor_nombre text,
    ventas          numeric,
    clientes        bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    )
    SELECT
        f.id_encargado_venta,
        MIN(f.encargado_nombre),
        MIN(f.supervisor_nombre),
        SUM(f.importe_neto),
        COUNT(DISTINCT f.id_cliente)
    FROM f
    GROUP BY f.id_encargado_venta
    ORDER BY SUM(f.importe_neto) DESC
    LIMIT p_limite;
$$;


-- ----------------------------------------------------------------------------
--  5. fn_ventas_por_localidad — "Distribución Geográfica" del Dashboard
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_ventas_por_localidad(
    p_limite    int  DEFAULT 10,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_localidad int,
    localidad_nombre text,
    ventas       numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT f.*, c.id_localidad
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        ) AS f
        JOIN clientes c ON c.id_cliente = f.id_cliente
    )
    SELECT
        f.id_localidad,
        MIN(l.nombre),
        SUM(f.importe_neto)
    FROM f
    JOIN localidades l ON l.id_localidad = f.id_localidad
    GROUP BY f.id_localidad
    ORDER BY SUM(f.importe_neto) DESC
    LIMIT p_limite;
$$;


-- ----------------------------------------------------------------------------
--  6. fn_ventas_por_unidad_negocio — gráfico de barras "Ventas por UN"
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_ventas_por_unidad_negocio(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_unidad_negocio int,
    unidad_nombre    text,
    ventas           numeric,
    bultos           numeric,
    hl               numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    )
    SELECT
        un.id_unidad_negocio,
        un.nombre,
        SUM(f.importe_neto),
        SUM(f.cantidad_bultos),
        SUM(f.cantidad_hl)
    FROM f
    JOIN productos pr        ON pr.id_producto = f.id_producto
    JOIN familias fa         ON fa.id_familia = pr.id_familia
    JOIN divisiones di       ON di.id_division = fa.id_division
    JOIN unidades_negocio un ON un.id_unidad_negocio = di.id_unidad_negocio
    GROUP BY un.id_unidad_negocio, un.nombre
    ORDER BY SUM(f.importe_neto) DESC;
$$;


-- ----------------------------------------------------------------------------
--  7. fn_ventas_por_marca — pie "Ventas por Marca" del Dashboard
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_ventas_por_marca(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_marca     int,
    marca_nombre text,
    ventas       numeric,
    unidades     numeric,
    hl           numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    )
    SELECT
        m.id_marca,
        m.nombre,
        SUM(f.importe_neto),
        SUM(f.cantidad_bultos),
        SUM(f.cantidad_hl)
    FROM f
    JOIN productos pr ON pr.id_producto = f.id_producto
    LEFT JOIN marcas m ON m.id_marca = pr.id_marca
    GROUP BY m.id_marca, m.nombre
    ORDER BY SUM(f.importe_neto) DESC NULLS LAST;
$$;


-- ----------------------------------------------------------------------------
--  8. fn_marketing_por — drill-down de 4 niveles de Marketing.tsx
-- ----------------------------------------------------------------------------
--  El prototipo encadenaba 4 `reduce` sobre el array de canales para ir
--  drill-downendo: canal ajustado → segmento → canal → subcanal.
--
--  Devuelve las CUATRO dimensiones juntas, una fila por combinación. El
--  frontend elige con cuál agrupar al mostrar, y encadena la selección
--  pasando el nivel anterior como filtro (`p_canal`, `p_segmento`, `p_canal_mkt`).
--
--  Por qué NO se agrupa por una columna dinámica:
--  la versión anterior usaba `EXECUTE format(..., %I)` con el nombre de la
--  columna. Eso obliga a construir el WHERE fuera del EXECUTE (donde
--  PL/pgSQL lo concatena como texto crudo y opens injection), y además
--  `RETURN QUERY WITH ... EXECUTE` es sintaxis inválida en PL/pgSQL.
--
--  Sin SQL dinámico los parámetros los bindea Postgres y no hay superficie de
--  ataque. El costo es nulo: el resultado tiene una fila por combinación de
--  clasificación, no una por venta.

CREATE OR REPLACE FUNCTION fn_marketing_por(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_segmento  text DEFAULT NULL,
    p_canal_mkt text DEFAULT NULL
)
RETURNS TABLE (
    canal_ajustado text,
    segmento_mkt   text,
    canal_mkt      text,
    subcanal_mkt   text,
    ventas         numeric,
    bultos         numeric,
    hl             numeric,
    clientes       bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
        WHERE (p_segmento  IS NULL OR segmento_mkt = p_segmento)
          AND (p_canal_mkt IS NULL OR canal_mkt    = p_canal_mkt)
    )
    SELECT
        canal_ajustado,
        segmento_mkt,
        canal_mkt,
        subcanal_mkt,
        SUM(importe_neto),
        SUM(cantidad_bultos),
        SUM(cantidad_hl),
        COUNT(DISTINCT id_cliente)
    FROM f
    WHERE canal_ajustado IS NOT NULL
    GROUP BY canal_ajustado, segmento_mkt, canal_mkt, subcanal_mkt
    ORDER BY SUM(importe_neto) DESC;
$$;


-- ----------------------------------------------------------------------------
--  9. fn_filtros_disponibles — alimenta los <select> del panel de filtros
-- ----------------------------------------------------------------------------
--  El prototipo tenía los años (2025/2024/2023) y los canales
--  (Off-Trade/On-Trade/Institucional) hardcodeados, y ya no coinciden con los
--  datos reales (REF / K+T / AS). Ahora salen de la base.

CREATE OR REPLACE FUNCTION fn_filtros_disponibles()
RETURNS TABLE (
    tipo   text,
    id     int,
    nombre text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    -- En Postgres el ORDER BY va al final del UNION, no dentro de cada rama.
    -- `NULL::int` es explícito porque si no el NULL queda sin tipo y el UNION
    -- no puede resolverlo.
    SELECT tipo, id, nombre FROM (
        SELECT 'periodo'::text AS tipo, p.id_periodo AS id,
               p.nombre_mes || ' ' || p.anio::text AS nombre,
               p.anio AS orden1, p.mes AS orden2
        FROM periodos p
        UNION ALL
        SELECT 'cliente', c.id_cliente,
               COALESCE(c.nombre_fantasia, c.razon_social), 1, 0
        FROM clientes c
        UNION ALL
        SELECT 'localidad', l.id_localidad, l.nombre, 1, 0
        FROM localidades l
        UNION ALL
        SELECT 'marca', m.id_marca, m.nombre, 1, 0
        FROM marcas m
        UNION ALL
        SELECT 'encargado', e.id_encargado_venta, e.nombre_completo, 1, 0
        FROM encargados_ventas e
        UNION ALL
        SELECT 'canal', NULL::int, cm.canal_ajustado, 1, 0
        FROM clasificaciones_marketing cm
        WHERE cm.canal_ajustado IS NOT NULL
        GROUP BY cm.canal_ajustado
    ) t
    ORDER BY t.orden1, t.orden2, t.nombre;
$$;