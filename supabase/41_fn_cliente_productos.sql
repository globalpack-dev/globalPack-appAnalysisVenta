-- ============================================================================
--  41 — fn_cliente_productos: qué productos compró un cliente, por período
--
--  La pestaña «Historial» de la ficha del cliente muestra una fila por mes con
--  ventas, neto, bultos y HL. `fn_cliente_detalle` no devuelve el detalle de
--  productos, y `fn_productos` agrega todos los períodos en una sola fila. Para
--  poder expandir cada mes hacía falta una función nueva que corte por
--  (período, producto).
--
--  Devuelve una fila por producto y período. `fn_ventas_filtradas` ya aplica
--  los 7 filtros que acepta esta firma; `p_cliente` es obligatorio.
--
--  No cambia ninguna función existente. Ejecutar en el SQL Editor y después
--  correr `41b_verificacion.sql`.
-- ============================================================================

-- Idempotente: si se vuelve a correr, no quedan sobrecargas con DEFAULT.
DROP FUNCTION IF EXISTS public.fn_cliente_productos(
    integer, integer, integer, integer, integer, integer, text
);

CREATE OR REPLACE FUNCTION public.fn_cliente_productos(
    p_cliente   int,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    anio                  integer,
    mes                   integer,
    nombre_mes            text,
    id_producto           integer,
    codigo_producto       text,
    producto_nombre       text,
    marca_nombre          text,
    calibre_nombre        text,
    division_nombre       text,
    unidad_negocio_nombre text,
    bultos                numeric,
    hl                    numeric,
    neto                  numeric,
    ventas                numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT *
        FROM public.fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    )
    SELECT
        f.anio,
        f.mes,
        MIN(f.nombre_mes),
        f.id_producto,
        f.codigo_producto,
        f.producto_nombre,
        f.marca_nombre,
        f.calibre_nombre,
        f.division_nombre,
        f.unidad_negocio_nombre,
        SUM(f.cantidad_bultos),
        SUM(f.cantidad_hl),
        SUM(f.importe_neto),
        SUM(f.importe_final)
    FROM f
    GROUP BY
        f.anio,
        f.mes,
        f.id_producto,
        f.codigo_producto,
        f.producto_nombre,
        f.marca_nombre,
        f.calibre_nombre,
        f.division_nombre,
        f.unidad_negocio_nombre
    ORDER BY f.anio, f.mes, SUM(f.importe_final) DESC;
$$;

COMMENT ON FUNCTION public.fn_cliente_productos(int, int, int, int, int, int, text) IS
    'Productos comprados por un cliente en cada período, para expandir el historial mensual.';
