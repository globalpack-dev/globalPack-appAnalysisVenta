-- ============================================================================
--  fn_encargado_marcas — marcas que maneja un encargado
--
--  Para la ficha de "Ventas por Sector" (Sectors.tsx). El prototipo mostraba
--  "Marcas en el sector", pero en el esquema no hay relación directa entre un
--  encargado y una marca: un encargado vende productos de varias marcas, y un
--  producto pertenece a una marca.
--
--  La relación sale de `ventas`: encargado → producto → marca.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_encargado_marcas(
    p_encargado int,
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_marca     integer,
    marca_nombre varchar,
    ventas       numeric,
    unidades     numeric,
    hl           numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        m.id_marca,
        m.nombre,
        COALESCE(SUM(f.importe_neto), 0),
        COALESCE(SUM(f.cantidad_bultos), 0),
        COALESCE(SUM(f.cantidad_hl), 0)
    FROM fn_ventas_filtradas(
        p_anio, p_mes, p_cliente, p_localidad, NULL, p_encargado, p_canal
    ) f
    JOIN productos pr ON pr.id_producto = f.id_producto
    LEFT JOIN marcas m ON m.id_marca = pr.id_marca
    WHERE pr.id_marca IS NOT NULL
    GROUP BY m.id_marca, m.nombre
    ORDER BY SUM(f.importe_neto) DESC;
$$;


COMMENT ON FUNCTION fn_encargado_marcas IS
'Marcas que vende un encargado de ventas, con sus métricas.';