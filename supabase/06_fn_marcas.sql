-- ============================================================================
--  fn_marcas, fn_marca_serie y fn_marca_detalle
--
--  Por qué hacen falta: la tabla `marcas` tiene sólo DOS columnas,
--  `id_marca` y `nombre`. El prototipo mostraba seis datos por marca:
--  ventas, productos, unidades, hl, crecimiento y color.
--
--    · `color`  → lo deriva el frontend (hash del id). No es dato de negocio.
--    · el resto → salen de agregar `ventas`.
--
--  Crecimiento: variación entre el último mes con ventas y el anterior.
--  Se eligió esa medida y no "contra el mismo mes del año anterior" porque con
--  los períodos disponibles el año previo no siempre existe, y porque mes a mes
--  es la lectura que sigue un supervisor comercial.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. fn_marcas — todas las marcas con métricas y crecimiento
-- ----------------------------------------------------------------------------
--  `unidades` = cantidad de operaciones (bultos), que es lo que el prototipo
--  llamaba así. La tabla `ventas` no tiene una columna de "unidades vendidas":
--  la unidad de venta es el bulto.
--
--  El crecimiento se calcula con dos CTEs: uno agrupa por marca y por período,
--  otro toma los dos últimos períodos de cada marca. Se hace por marca y no con
--  LAG sobre el total para que el "mes anterior" sea el anterior *de esa marca*:
--  si una marca no vendió el mes previo, su crecimiento es 0 y no se compara
--  contra un mes de hace seis meses.

CREATE OR REPLACE FUNCTION fn_marcas(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_marca      integer,
    marca_nombre  varchar,
    ventas        numeric,
    productos     bigint,
    unidades      numeric,
    hl            numeric,
    crecimiento   numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH base AS (
        SELECT
            f.id_producto,
            pr.id_marca,
            f.anio,
            f.mes,
            f.importe_neto,
            f.cantidad_bultos,
            f.cantidad_hl
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        ) f
        JOIN productos pr ON pr.id_producto = f.id_producto
        WHERE pr.id_marca IS NOT NULL
    ),
    por_marca_periodo AS (
        SELECT
            b.id_marca,
            b.anio,
            b.mes,
            SUM(b.importe_neto)    AS ventas,
            SUM(b.cantidad_bultos) AS bultos,
            SUM(b.cantidad_hl)     AS hl
        FROM base b
        GROUP BY b.id_marca, b.anio, b.mes
    ),
    dos_ultimos AS (
        SELECT DISTINCT ON (id_marca)
            id_marca,
            ventas
        FROM por_marca_periodo
        ORDER BY id_marca, anio DESC, mes DESC
    ),
    dos_anteriores AS (
        SELECT DISTINCT ON (id_marca)
            id_marca,
            ventas
        FROM por_marca_periodo
        -- OFFSET 1 saltea el más reciente y toma el que le sigue.
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
        -- División por cero si el mes anterior no tuvo ventas: se devuelve 0.
        CASE
            WHEN COALESCE(da.ventas, 0) = 0 THEN 0
            ELSE ROUND(
                (COALESCE(dv.ventas, 0) - da.ventas) * 100.0 / da.ventas, 1)
        END
    FROM marcas m
    LEFT JOIN totales t              ON t.id_marca = m.id_marca
    LEFT JOIN dos_ultimos dv         ON dv.id_marca = m.id_marca
    LEFT JOIN dos_anteriores da      ON da.id_marca = m.id_marca
    LEFT JOIN catalogo_productos cp  ON cp.id_marca = m.id_marca
    ORDER BY COALESCE(t.ventas, 0) DESC, m.nombre;
$$;


-- ----------------------------------------------------------------------------
--  2. fn_marca_serie — evolución mensual de UNA marca
-- ----------------------------------------------------------------------------
--  El prototipo tenía `marcaVentasMensuales` con series de 3 marcas hardcodeadas
--  (Quilmes, Brahma, Stella Artois). Las otras 5 no tenían evolución.
--  Con esta función, las 8 tienen.

CREATE OR REPLACE FUNCTION fn_marca_serie(
    p_marca      int,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    anio            integer,
    mes             integer,
    nombre_mes      text,
    mes_corto       text,
    importe_neto    numeric,
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
        SUM(f.cantidad_bultos),
        SUM(f.cantidad_hl)
    FROM fn_ventas_filtradas(
        p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
    ) f
    GROUP BY f.anio, f.mes
    ORDER BY f.anio, f.mes;
$$;


-- ----------------------------------------------------------------------------
--  3. fn_marca_detalle — ficha de una marca
-- ----------------------------------------------------------------------------
--  Devuelve los productos y los clientes de esa marca, con sus ventas.
--  Los clientes salen de `ventas`: en el esquema no hay relación directa
--  marca→cliente, porque un cliente compra varias marcas.

CREATE OR REPLACE FUNCTION fn_marca_detalle(
    p_marca      int,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    tipo       text,
    id         integer,
    codigo     varchar,
    nombre     text,
    ventas     numeric,
    unidades   numeric,
    hl         numeric
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
    -- Cada rama del UNION va envuelta en un subquery con SU propio ORDER BY.
    -- En Postgres el ORDER BY tiene que estar al final del UNION completo:
    -- ponerlo en cada rama es error de sintaxis.
    SELECT * FROM (
        SELECT
            'producto'::text       AS tipo,
            p.id_producto          AS id,
            p.codigo_producto      AS codigo,
            p.nombre               AS nombre,
            COALESCE(SUM(f.importe_neto), 0)    AS ventas,
            COALESCE(SUM(f.cantidad_bultos), 0) AS unidades,
            COALESCE(SUM(f.cantidad_hl), 0)     AS hl
        FROM productos p
        LEFT JOIN f ON f.id_producto = p.id_producto
        WHERE p.id_marca = p_marca
        GROUP BY p.id_producto, p.codigo_producto, p.nombre
        ORDER BY COALESCE(SUM(f.importe_neto), 0) DESC
        LIMIT 100
    ) productos

    UNION ALL

    SELECT * FROM (
        SELECT
            'cliente'::text AS tipo,
            c.id_cliente    AS id,
            c.codigo_cliente AS codigo,
            COALESCE(c.nombre_fantasia, c.razon_social) AS nombre,
            SUM(f.importe_neto)    AS ventas,
            SUM(f.cantidad_bultos) AS unidades,
            SUM(f.cantidad_hl)     AS hl
        FROM f
        JOIN clientes c ON c.id_cliente = f.id_cliente
        GROUP BY c.id_cliente, c.codigo_cliente, c.nombre_fantasia, c.razon_social
        ORDER BY SUM(f.importe_neto) DESC
        LIMIT 100
    ) clientes

    -- Orden final del conjunto completo.
    ORDER BY tipo DESC, ventas DESC;
$$;;


COMMENT ON FUNCTION fn_marcas IS
'Marcas con métricas y crecimiento vs. el mes anterior.';
COMMENT ON FUNCTION fn_marca_serie IS
'Evolución mensual de una marca.';
COMMENT ON FUNCTION fn_marca_detalle IS
'Productos y clientes de una marca, en un solo conjunto de filas.';