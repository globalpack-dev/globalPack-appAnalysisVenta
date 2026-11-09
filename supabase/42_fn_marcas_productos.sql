-- ============================================================================
--  42 — fn_marcas vuelve a devolver `productos`
--
--  El archivo 10 redefinió `fn_marcas` para agregar el 8.º parámetro
--  (`p_unidad_negocio`), pero en el `RETURNS TABLE` cambió la columna
--  `productos` por `clientes`. El `SELECT` siguió devolviendo
--  `COALESCE(cp.productos, 0)`, así que la columna `clientes` terminó con el
--  conteo de productos del catálogo.
--
--  El frontend (`Brands.tsx` y el tipo `FilaMarca`) espera `productos`. Al
--  entrar a la ficha de una marca, `marca.productos` llegaba `undefined` y
--  reventaba con:
--      TypeError: Cannot read properties of undefined (reading 'toString')
--
--  Esta función restaura la forma original de 06 sin tocar la lógica ni la
--  firma de 8 parámetros. Cambiar un `RETURNS TABLE` no es posible con
--  `CREATE OR REPLACE`: hace falta DROP antes.
--
--  Ejecutar en el SQL Editor de Supabase y después `42b_verificacion.sql`.
-- ============================================================================

-- Idempotente: si se vuelve a correr, no quedan sobrecargas con DEFAULT.
DROP FUNCTION IF EXISTS public.fn_marcas(
    integer, integer, integer, integer, integer, integer, text, integer
);

CREATE OR REPLACE FUNCTION public.fn_marcas(
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
    id_marca      integer,
    marca_nombre  varchar,
    ventas        numeric,
    productos     bigint,
    unidades      bigint,
    hl            numeric,
    crecimiento   numeric
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

COMMENT ON FUNCTION public.fn_marcas(
    integer, integer, integer, integer, integer, integer, text, integer
) IS
'Marcas con métricas, cantidad de productos del catálogo y crecimiento vs. el mes anterior.';
