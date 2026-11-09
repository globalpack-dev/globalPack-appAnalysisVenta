-- ============================================================================
--  Filtro por Unidad de Negocio — 8vo parámetro
--
--  Por qué: el panel "Filtros globales" tenía 7 filtros y el reporte comercial
--  necesita 8. `unidad_negocio` no figuraba porque las funciones de agregación
--  se escribieron pensadas para los KPIs del Dashboard, donde la UN no se
--  cruzaba. Ahora el reporte la filtra de verdad, así que el parámetro tiene que
--  existir en la capa SQL.
--
--  Ojo: agregar un parámetro a `fn_ventas_filtradas` NO rompe las funciones que
--  ya la llaman. Es un `DEFAULT NULL`, así que las 15 funciones existentes
--  siguen funcionando sin cambios y sin el filtro aplicado.
--
--  Los JOIN a `productos` y `clientes` que ya tenía el helper se conservan: el
--  filtro por marca sigue necesitando bajar a productos, y el de localidad
--  leer la localidad desde el cliente.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  fn_ventas_filtradas — se agrega p_unidad_negocio
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ventas_filtradas(
    p_anio            int  DEFAULT NULL,
    p_mes             int  DEFAULT NULL,
    p_cliente         int  DEFAULT NULL,
    p_localidad       int  DEFAULT NULL,
    p_marca           int  DEFAULT NULL,
    p_encargado       int  DEFAULT NULL,
    p_canal           text DEFAULT NULL,
    p_unidad_negocio  int  DEFAULT NULL
)
RETURNS SETOF v_ventas_detalle
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    -- La unidad de negocio NO está en `ventas`: sale por la cadena
    -- producto -> familia -> división -> unidad de negocio. La vista expone el
    -- nombre pero no el id, y `01_v_ventas_detalle.sql` no se toca porque otras
    -- 15 funciones dependen de su forma. Por eso el filtro se resuelve acá, con
    -- un EXISTS sobre la cadena, en vez de una columna del SELECT.
    --
    -- EXISTS y no JOIN: filtrar por UN con un JOIN obligaría a elegir entre
    -- reiterar la fila (INNER) o dejarla con id NULL (LEFT). EXISTS no cambia
    -- la cantidad de filas, así que el resto de los filtros y los SUM no se
    -- ven afectados.
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
      AND (p_canal     IS NULL OR d.canal_ajustado = p_canal)
      AND (
          p_unidad_negocio IS NULL
          OR EXISTS (
              SELECT 1
              FROM productos pr2
              JOIN familias f2   ON f2.id_familia   = pr2.id_familia
              JOIN divisiones d2 ON d2.id_division  = f2.id_division
              WHERE pr2.id_producto = d.id_producto
                AND d2.id_unidad_negocio = p_unidad_negocio
          )
      );
$$;


-- ----------------------------------------------------------------------------
--  fn_filtros_disponibles — agrega la unidad de negocio al catálogo
-- ----------------------------------------------------------------------------
--  Es la función que alimenta los <select> del panel. Sin esto, el filtro de UN
--  no tendría de dónde sacar sus opciones y el menú quedaría vacío.
--
--  Se reescribe entera porque el cuerpo es un UNION: agregar una rama al medio
--  es más claro que editarla en los bordes.

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
    -- LIMIT explícito por el límite de filas de PostgREST (1.000 por defecto en
    -- supabase-js). El proyecto tiene 1.542 clientes: sin este límite la función
    -- se corta a 1.000 filas y deja fuera el final del UNION, que es donde caen
    -- los períodos. Pasó: el selector de fecha llegaba vacío con datos cargados.
    --
    -- El orden pone los períodos primero (orden1 = anio), así que aunque someday
    -- se llegara al límite, lo que se pierde es el último tipo del catálogo, no
    -- las fechas.
    SELECT tipo, id, nombre FROM (
        SELECT 'periodo'::text AS tipo, p.id_periodo AS id,
               p.nombre_mes || ' ' || p.anio::text AS nombre,
               p.anio AS orden1, p.mes AS orden2
        FROM periodos p
        UNION ALL
        SELECT 'cliente', c.id_cliente,
               COALESCE(c.nombre_fantasia, c.razon_social), 2, 0
        FROM clientes c
        UNION ALL
        SELECT 'localidad', l.id_localidad, l.nombre, 3, 0
        FROM localidades l
        UNION ALL
        SELECT 'marca', m.id_marca, m.nombre, 4, 0
        FROM marcas m
        UNION ALL
        SELECT 'encargado', e.id_encargado_venta, e.nombre_completo, 5, 0
        FROM encargados_ventas e
        UNION ALL
        SELECT 'canal', NULL::int, cm.canal_ajustado, 6, 0
        FROM clasificaciones_marketing cm
        WHERE cm.canal_ajustado IS NOT NULL
        GROUP BY cm.canal_ajustado
        UNION ALL
        SELECT 'unidad_negocio', u.id_unidad_negocio, u.nombre, 7, 0
        FROM unidades_negocio u
    ) t
    ORDER BY t.orden1, t.orden2, t.nombre
    LIMIT 5000;
$$;


-- ----------------------------------------------------------------------------
--  fn_dashboard_kpis — acepta el 8vo parámetro
-- ----------------------------------------------------------------------------
--  Se reescribe para que el filtro de UN llegue a `fn_ventas_filtradas`. Las
--  demás funciones del Dashboard que ya usaban `fn_ventas_filtradas` siguen
--  funcionando igual por el DEFAULT NULL.

CREATE OR REPLACE FUNCTION fn_dashboard_kpis(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
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
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio
        )
    ),
    ref AS (
        -- Último período que tiene movimientos, sin filtros. Ver fn_dashboard_kpis
        -- original: agrupar y ordenar por (anio, mes), nunca MAX() por separado.
        SELECT anio, mes FROM v_ventas_detalle
        GROUP BY anio, mes ORDER BY anio DESC, mes DESC LIMIT 1
    ),
    activos AS (
        SELECT COUNT(DISTINCT f.id_cliente) AS n
        FROM f
        JOIN ref r ON r.anio = f.anio AND r.mes = f.mes
    )
    SELECT
        COALESCE(SUM(f.importe_neto), 0),
        COALESCE(SUM(f.importe_bruto), 0),
        COALESCE(SUM(f.importe_final), 0),
        COALESCE(SUM(f.cantidad_bultos), 0),
        COALESCE(SUM(f.cantidad_hl), 0),
        COUNT(*),
        (SELECT n FROM activos),
        COUNT(DISTINCT f.id_producto)
    FROM f;
$$;


-- ----------------------------------------------------------------------------
--  fn_dashboard_variaciones — acepta el 8vo parámetro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_dashboard_variaciones(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS TABLE (
    variacion_neto        numeric,
    variacion_bruto       numeric,
    variacion_final       numeric,
    variacion_bultos      numeric,
    variacion_hl          numeric,
    variacion_operaciones numeric,
    anio_ref              integer,
    mes_ref               integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT *
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio
        )
    ),
    por_periodo AS (
        SELECT
            anio,
            mes,
            SUM(importe_neto)  AS neto,
            SUM(importe_bruto) AS bruto,
            SUM(importe_final) AS final,
            SUM(cantidad_bultos) AS bultos,
            SUM(cantidad_hl)     AS hl,
            COUNT(*)             AS operaciones
        FROM f
        GROUP BY anio, mes
    ),
    ultimos AS (
        SELECT * FROM por_periodo ORDER BY anio DESC, mes DESC LIMIT 2
    ),
    ref AS (
        SELECT
            MAX(CASE WHEN rn = 1 THEN neto        END) AS neto,
            MAX(CASE WHEN rn = 1 THEN bruto       END) AS bruto,
            MAX(CASE WHEN rn = 1 THEN final       END) AS final,
            MAX(CASE WHEN rn = 1 THEN bultos      END) AS bultos,
            MAX(CASE WHEN rn = 1 THEN hl          END) AS hl,
            MAX(CASE WHEN rn = 1 THEN operaciones END) AS operaciones,
            MAX(CASE WHEN rn = 1 THEN anio        END) AS anio,
            MAX(CASE WHEN rn = 1 THEN mes         END) AS mes,
            MAX(CASE WHEN rn = 2 THEN neto        END) AS neto_prev,
            MAX(CASE WHEN rn = 2 THEN bruto       END) AS bruto_prev,
            MAX(CASE WHEN rn = 2 THEN final       END) AS final_prev,
            MAX(CASE WHEN rn = 2 THEN bultos      END) AS bultos_prev,
            MAX(CASE WHEN rn = 2 THEN hl          END) AS hl_prev,
            MAX(CASE WHEN rn = 2 THEN operaciones END) AS operaciones_prev
        FROM (
            SELECT ultimos.*,
                   ROW_NUMBER() OVER (ORDER BY anio DESC, mes DESC) AS rn
            FROM ultimos
        ) t
    )
    SELECT
        CASE WHEN ref.neto_prev > 0
             THEN ROUND(((ref.neto - ref.neto_prev) / ref.neto_prev) * 100, 1) END,
        CASE WHEN ref.bruto_prev > 0
             THEN ROUND(((ref.bruto - ref.bruto_prev) / ref.bruto_prev) * 100, 1) END,
        CASE WHEN ref.final_prev > 0
             THEN ROUND(((ref.final - ref.final_prev) / ref.final_prev) * 100, 1) END,
        CASE WHEN ref.bultos_prev > 0
             THEN ROUND(((ref.bultos - ref.bultos_prev) / ref.bultos_prev) * 100, 1) END,
        CASE WHEN ref.hl_prev > 0
             THEN ROUND(((ref.hl - ref.hl_prev) / ref.hl_prev) * 100, 1) END,
        CASE WHEN ref.operaciones_prev > 0
             THEN ROUND(((ref.operaciones - ref.operaciones_prev) / ref.operaciones_prev) * 100, 1) END,
        ref.anio,
        ref.mes
    FROM ref;
$$;


-- ----------------------------------------------------------------------------
--  fn_clientes — acepta el 8vo parámetro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_clientes(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS TABLE (
    id_cliente      integer,
    codigo_cliente  varchar,
    razon_social    varchar,
    nombre_fantasia varchar,
    id_localidad    integer,
    localidad_nombre varchar,
    ventas_total    numeric,
    ventas_neto     numeric,
    bultos          numeric,
    hl              numeric,
    encargado_count bigint,
    ultima_venta    text,
    activo          boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio
        )
    ),
    ultimo_periodo AS (
        SELECT anio, mes FROM v_ventas_detalle
        GROUP BY anio, mes ORDER BY anio DESC, mes DESC LIMIT 1
    ),
    por_cliente AS (
        SELECT
            id_cliente,
            SUM(importe_bruto)    AS ventas_total,
            SUM(importe_neto)     AS ventas_neto,
            SUM(cantidad_bultos)  AS bultos,
            SUM(cantidad_hl)      AS hl,
            COUNT(DISTINCT id_encargado_venta) AS encargados,
            MAX(anio * 100 + mes)  AS ultima_venta
        FROM f
        GROUP BY id_cliente
    ),
    activos AS (
        SELECT DISTINCT v.id_cliente
        FROM v_ventas_detalle v
        JOIN ultimo_periodo u ON u.anio = v.anio AND u.mes = v.mes
    )
    SELECT
        c.id_cliente,
        c.codigo_cliente,
        c.razon_social,
        c.nombre_fantasia,
        c.id_localidad,
        l.nombre,
        COALESCE(pc.ventas_total, 0),
        COALESCE(pc.ventas_neto, 0),
        COALESCE(pc.bultos, 0),
        COALESCE(pc.hl, 0),
        COALESCE(pc.encargados, 0),
        CASE WHEN pc.ultima_venta IS NULL THEN NULL
             ELSE to_char(pc.ultima_venta / 100, 'FM0000') || '-' ||
                  to_char(pc.ultima_venta % 100, 'FM00')
        END,
        (a.id_cliente IS NOT NULL)
    FROM clientes c
    LEFT JOIN por_cliente pc ON pc.id_cliente = c.id_cliente
    LEFT JOIN localidades l  ON l.id_localidad = c.id_localidad
    LEFT JOIN activos a      ON a.id_cliente = c.id_cliente
    ORDER BY COALESCE(pc.ventas_total, 0) DESC, c.razon_social;
$$;


-- ----------------------------------------------------------------------------
--  fn_cliente_detalle — acepta el 8vo parámetro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cliente_detalle(
    p_cliente   int,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS TABLE (
    anio            integer,
    mes             integer,
    nombre_mes      text,
    mes_corto       text,
    ventas          numeric,
    neto            numeric,
    bultos          numeric,
    hl              numeric,
    encargado_nombre text,
    supervisor_nombre text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT *
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio
        )
    )
    SELECT
        f.anio, f.mes,
        MIN(f.nombre_mes),
        LEFT(MIN(f.nombre_mes), 3),
        SUM(f.importe_final),
        SUM(f.importe_neto),
        SUM(f.cantidad_bultos),
        SUM(f.cantidad_hl),
        MIN(f.encargado_nombre),
        MIN(f.supervisor_nombre)
    FROM f
    GROUP BY f.anio, f.mes
    ORDER BY f.anio, f.mes;
$$;


-- ----------------------------------------------------------------------------
--  fn_marcas — acepta el 8vo parámetro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_marcas(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS TABLE (
    id_marca       integer,
    marca_nombre   varchar,
    ventas         numeric,
    unidades       bigint,
    hl             numeric,
    clientes       bigint,
    crecimiento    numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio
        )
    ),
    -- El crecimiento usa DISTINCT ON sobre el par (id_marca, período) ordenado
    -- del más nuevo al más viejo. Es la misma lógica de 06_fn_marcas.sql; sólo
    -- se le pasa el 8vo parámetro. Reemplazarla por un `MAX(...) OVER` daría
    -- un número distinto.
    base AS (
        SELECT
            pr.id_marca,
            f.anio,
            f.mes,
            f.importe_neto,
            f.cantidad_bultos,
            f.cantidad_hl
        FROM f
        JOIN productos pr ON pr.id_producto = f.id_producto
        WHERE pr.id_marca IS NOT NULL
    ),
    por_marca_periodo AS (
        SELECT
            b.id_marca, b.anio, b.mes,
            SUM(b.importe_neto)    AS ventas,
            SUM(b.cantidad_bultos) AS bultos,
            SUM(b.cantidad_hl)     AS hl
        FROM base b
        GROUP BY b.id_marca, b.anio, b.mes
    ),
    dos_ultimos AS (
        SELECT DISTINCT ON (id_marca) id_marca, ventas
        FROM por_marca_periodo
        ORDER BY id_marca, anio DESC, mes DESC
    ),
    dos_anteriores AS (
        SELECT DISTINCT ON (id_marca) id_marca, ventas
        FROM por_marca_periodo
        ORDER BY id_marca, anio DESC, mes DESC
        OFFSET 1
    ),
    totales AS (
        SELECT
            id_marca,
            SUM(ventas) AS ventas,
            SUM(bultos) AS unidades,
            SUM(hl)     AS hl
        FROM por_marca_periodo
        GROUP BY id_marca
    ),
    catalogo_productos AS (
        SELECT id_marca, COUNT(*) AS productos
        FROM productos
        WHERE id_marca IS NOT NULL
        GROUP BY id_marca
    )
    SELECT
        m.id_marca,
        m.nombre,
        COALESCE(t.ventas, 0),
        COALESCE(cp.productos, 0),
        COALESCE(t.unidades, 0),
        COALESCE(t.hl, 0),
        CASE
            WHEN COALESCE(da.ventas, 0) = 0 THEN 0
            ELSE ROUND((COALESCE(dv.ventas, 0) - da.ventas) * 100.0 / da.ventas, 1)
        END
    FROM marcas m
    LEFT JOIN totales t             ON t.id_marca = m.id_marca
    LEFT JOIN dos_ultimos dv        ON dv.id_marca = m.id_marca
    LEFT JOIN dos_anteriores da     ON da.id_marca = m.id_marca
    LEFT JOIN catalogo_productos cp ON cp.id_marca = m.id_marca
    ORDER BY COALESCE(t.ventas, 0) DESC, m.nombre;
$$;


-- ----------------------------------------------------------------------------
--  fn_marketing_por — acepta el 8vo parámetro
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_marketing_por(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_segmento  text DEFAULT NULL,
    p_canal_mkt text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
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
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio
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


COMMENT ON FUNCTION fn_ventas_filtradas IS
'Venta con su detalle, acepando los 8 filtros. Las llamadas viejas omiten p_unidad_negocio y siguen igual.';