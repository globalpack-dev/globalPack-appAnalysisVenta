-- ============================================================================
--  fn_clientes y fn_cliente_detalle
--
--  Por qué hacen falta: la tabla `clientes` tiene 5 columnas (codigo_cliente,
--  razon_social, nombre_fantasia, id_localidad, id_cliente). El prototipo
--  mostraba 8 datos por cliente: ventas totales, ventas netas, cantidad de
--  sucursales, última venta, activos, y su encargado.
--
--    · `cantSucursales` → se elimina. La sucursal es de la empresa
--      (GLOBAL PACK), no del cliente: no hay relación.
--    · `ultimaVenta`    → sale de MAX(período) sobre las ventas del cliente.
--    · `activo`         → derivado (ver abajo).
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  fn_clientes — listado con métricas
-- ----------------------------------------------------------------------------
--  `activo` se calcula contra el ÚLTIMO PERÍODO QUE TIENE VENTAS en toda la base,
--  no contra el filtro.
--
--  Por qué: si la referencia saliera del conjunto filtrado, al elegir una marca
--  que no vendió este mes todos los clientes pasarían a "inactivo", cuando en
--  realidad lo que falta son ventas de esa marca. El estado comercial de un
--  cliente no depende de qué marca estés mirando.
--
--  La regla es "compró en el último mes con movimientos". Como la base no guarda
--  fechas sino períodos mensuales, eso equivale a los últimos 30 días.

CREATE OR REPLACE FUNCTION fn_clientes(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
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
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    ),
    -- Último período con ventas en toda la base, sin filtros.
    --
    -- Se agrupa por el par (anio, mes) y se ordena, en vez de usar MAX(anio) y
    -- MAX(mes) por separado: al cruzar el cambio de año eso combinaría el año
    -- más alto con el mes más alto de cualquier año, y armaría un período que
    -- no existe.
    ultimo_periodo AS (
        SELECT anio, mes
        FROM v_ventas_detalle
        GROUP BY anio, mes
        ORDER BY anio DESC, mes DESC
        LIMIT 1
    ),
    por_cliente AS (
        SELECT
            id_cliente,
            -- `bruto` es el total transaccionado antes de descuentos, y `neto`
            -- el de después de impuestos. Por eso `ventas_total` toma el bruto
            -- y `ventas_neto` el neto: si se invirtieran, "netas" mostraría una
            -- cifra mayor que "totales".
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
        SELECT DISTINCT id_cliente
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
    LEFT JOIN por_cliente pc   ON pc.id_cliente = c.id_cliente
    LEFT JOIN localidades l    ON l.id_localidad = c.id_localidad
    LEFT JOIN activos a        ON a.id_cliente = c.id_cliente
    ORDER BY COALESCE(pc.ventas_total, 0) DESC, c.razon_social;
$$;


-- ----------------------------------------------------------------------------
--  fn_cliente_detalle — historial de un cliente
-- ----------------------------------------------------------------------------
--  Una fila por período con las ventas de ese cliente. Es lo que muestra la
--  pestaña "Historial" con la variación mes a mes.
--
--  El prototipo usaba `clienteVentasMensuales`, un diccionario en memoria con
--  sólo 3 clientes y un array inventado como fallback para el resto. Acá todos
--  los clientes tienen serie real.

CREATE OR REPLACE FUNCTION fn_cliente_detalle(
    p_cliente   int,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
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
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    )
    SELECT
        f.anio,
        f.mes,
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


COMMENT ON FUNCTION fn_clientes IS
'Clientes con métricas, última venta y estado activo derivado del último período.';
COMMENT ON FUNCTION fn_cliente_detalle IS
'Historial mensual de un cliente, con su encargado y supervisor.';