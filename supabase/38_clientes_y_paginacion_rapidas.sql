-- ============================================================================
--  38 — fn_clientes y fn_ventas_pagina: dejar de resolver todo el rowtype
--
--  El 37 hizo que `fn_ventas_filtradas` se inlinee y las RPC de Reportes
--  bajaron de 7,5–8,4 s a 3,1–3,6 s. Pero estas dos seguían cortándose:
--
--    · fn_clientes()          ~8,2 s → timeout (Clientes no carga)
--    · fn_ventas_pagina(0,50) ~8,2 s → timeout (Ventas no carga)
--
--  Motivo distinto en cada una, en los dos casos por pedir columnas de más:
--
--  1. fn_clientes arranca con `SELECT * FROM fn_ventas_filtradas(...)`: pide
--     las 35 columnas de la vista cuando la agregación usa 7. Si se piden
--     todas, no hay poda de columnas y se resuelven todos los joins de texto
--     de las 25.004 filas.
--
--  2. fn_ventas_pagina guarda ese `SELECT *` en un CTE que se usa DOS veces
--     (para el total y para la página), así que Postgres lo materializa
--     completo, y encima ordena por `cliente_nombre`, que sale de un join.
--
--  Arreglo:
--
--  · fn_clientes: el CTE pide sólo las 7 columnas que usa la agregación.
--  · fn_ventas_pagina: la página se elige sobre una proyección angosta
--    (id_venta, anio, mes, cliente_nombre → ~3 joins) y recién después se
--    resuelven las 50 filas contra la vista completa. El total se cuenta en
--    una llamada aparte, que también puede descartar las columnas que no usa.
--
--  Firmas y tipos de retorno no cambian: el cliente no se toca.
--
--  Ejecutar en el SQL Editor de supabase.com. Después, `38b_verificacion.sql`.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. fn_clientes — agregar sólo lo que se usa
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_clientes(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    -- Proyección explícita: estas 7 columnas son las únicas que usa el
    -- agregado de abajo. Pedir `*` obligaba a resolver los 14 joins de la
    -- vista para cada una de las 25.004 ventas.
    WITH f AS (
        SELECT
            g.id_cliente,
            g.importe_bruto,
            g.importe_neto,
            g.cantidad_bultos,
            g.cantidad_hl,
            g.id_encargado_venta,
            g.anio,
            g.mes
        FROM public.fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio
        ) g
    ),
    -- Último período con ventas en toda la base, sin filtros. Agrupar y ordenar
    -- por el par (anio, mes): con MAX(anio) y MAX(mes) por separado, al cruzar
    -- el cambio de año se armaría un período que no existe.
    ultimo_periodo AS (
        SELECT anio, mes FROM public.v_ventas_detalle
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
        FROM public.v_ventas_detalle v
        JOIN ultimo_periodo u ON u.anio = v.anio AND u.mes = v.mes
    ),
    -- LEFT JOIN contra el agregado: un cliente sin ventas en el período
    -- filtrado aparece con 0 en vez de desaparecer de la lista.
    base AS (
        SELECT
            c.id_cliente,
            c.codigo_cliente,
            c.razon_social,
            c.nombre_fantasia,
            c.id_localidad,
            l.nombre AS localidad_nombre,
            COALESCE(pc.ventas_total, 0) AS ventas_total,
            COALESCE(pc.ventas_neto, 0)  AS ventas_neto,
            COALESCE(pc.bultos, 0)       AS bultos,
            COALESCE(pc.hl, 0)           AS hl,
            COALESCE(pc.encargados, 0)   AS encargado_count,
            CASE WHEN pc.ultima_venta IS NULL THEN NULL
                 ELSE to_char(pc.ultima_venta / 100, 'FM0000') || '-' ||
                      to_char(pc.ultima_venta % 100, 'FM00')
            END AS ultima_venta,
            (a.id_cliente IS NOT NULL)   AS activo
        FROM public.clientes c
        LEFT JOIN por_cliente pc  ON pc.id_cliente = c.id_cliente
        LEFT JOIN public.localidades l ON l.id_localidad = c.id_localidad
        LEFT JOIN activos a       ON a.id_cliente = c.id_cliente
    )
    SELECT COALESCE((
        SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ventas_total DESC, b.razon_social)
        FROM base b
    ), '[]'::jsonb);
$$;

COMMENT ON FUNCTION public.fn_clientes(int, int, int, int, int, int, text, int) IS
'Clientes con su agregado de ventas, como jsonb de una fila. Proyecta sólo las columnas que agrega (ver 38_*).';


-- ----------------------------------------------------------------------------
--  2. fn_ventas_pagina — paginar la proyección angosta y resolver las 50 filas
-- ----------------------------------------------------------------------------
--  Misma firma y mismo RETURNS TABLE que 03: no hace falta DROP.

CREATE OR REPLACE FUNCTION public.fn_ventas_pagina(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_categoria text DEFAULT NULL,
    p_desde     int  DEFAULT 0,
    p_cantidad  int  DEFAULT 50
)
RETURNS TABLE (
    -- Columnas de v_ventas_detalle
    id_venta                   bigint,
    id_periodo                 integer,
    id_cliente                 integer,
    id_sucursal                integer,
    id_encargado_venta         integer,
    id_producto                integer,
    id_clasificacion_marketing integer,
    anio                       integer,
    mes                        integer,
    nombre_mes                 text,
    periodo_label              text,
    codigo_cliente             varchar,
    cliente_nombre             text,
    sucursal_nombre            varchar,
    codigo_sector_venta        varchar,
    encargado_nombre           varchar,
    supervisor_nombre          varchar,
    codigo_producto            varchar,
    producto_nombre            varchar,
    marca_nombre               varchar,
    familia_nombre             varchar,
    division_nombre            varchar,
    unidad_negocio_nombre      varchar,
    calibre_nombre             varchar,
    canal_ajustado             varchar,
    segmento_mkt               varchar,
    canal_mkt                  varchar,
    subcanal_mkt               varchar,
    importe_neto               numeric,
    importe_bruto              numeric,
    importe_final              numeric,
    cantidad_bultos            numeric,
    cantidad_hl                numeric,
    -- Total de filas que pasan el filtro, sin paginar.
    total_filas                bigint,
    categoria_nombre           text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    -- 1) Se ordena y pagina sobre 4 columnas: resuelve el join de período y el
    --    de cliente, no los 14 de la vista.
    WITH pagina AS (
        SELECT g.id_venta, g.anio, g.mes, g.cliente_nombre
        FROM public.fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            NULL, p_categoria
        ) g
        ORDER BY g.anio, g.mes, g.cliente_nombre, g.id_venta
        LIMIT p_cantidad
        OFFSET p_desde
    ),
    -- 2) El total va aparte: al no compartir el CTE paginado, el planificador
    --    puede descartar las columnas que COUNT no necesita.
    total AS (
        SELECT COUNT(*) AS n
        FROM public.fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            NULL, p_categoria
        )
    )
    -- 3) Los 14 joins de la vista se pagan sólo por las filas de la página.
    SELECT
        d.id_venta, d.id_periodo, d.id_cliente, d.id_sucursal,
        d.id_encargado_venta, d.id_producto, d.id_clasificacion_marketing,
        d.anio, d.mes, d.nombre_mes, d.periodo_label,
        d.codigo_cliente, d.cliente_nombre, d.sucursal_nombre,
        d.codigo_sector_venta, d.encargado_nombre, d.supervisor_nombre,
        d.codigo_producto, d.producto_nombre, d.marca_nombre,
        d.familia_nombre, d.division_nombre, d.unidad_negocio_nombre,
        d.calibre_nombre,
        d.canal_ajustado, d.segmento_mkt, d.canal_mkt, d.subcanal_mkt,
        d.importe_neto, d.importe_bruto, d.importe_final,
        d.cantidad_bultos, d.cantidad_hl,
        total.n,
        d.categoria_nombre
    FROM pagina pg
    JOIN public.v_ventas_detalle d ON d.id_venta = pg.id_venta
    CROSS JOIN total
    ORDER BY pg.anio, pg.mes, pg.cliente_nombre, d.id_venta;
$$;

COMMENT ON FUNCTION public.fn_ventas_pagina(int, int, int, int, int, int, text, text, int, int) IS
'Ventas filtradas y paginadas, con el total del filtro. Pagina sobre una proyección angosta y resuelve la vista para las filas de la página (ver 38_*).';
