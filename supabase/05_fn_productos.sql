-- ============================================================================
--  fn_productos y fn_jerarquia_comercial
--
--  Por qué hacen falta: la tabla `productos` tiene sólo 6 columnas (código,
--  nombre y 3 FKs). No tiene `ventas`, `cantidad_vendida`, `bultos` ni `hl`.
--  Esas métricas salen de agregar `ventas`, y el prototipo las daba ya
--  calculadas desde el array en memoria.
--
--  Las dos se apoyan en `fn_ventas_filtradas`, así que respetan los 7 filtros.
--
--  Decisión de diseño: LEFT JOIN sobre el agregado. Un producto sin ventas en el
--  período filtrado aparece igual, con métricas en 0. Con INNER JOIN desaparecería
--  de la lista, y el usuario pensaría que el producto no existe.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  fn_productos — vista de lista, con métricas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_productos(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_producto     integer,
    codigo_producto varchar,
    nombre          varchar,
    id_marca        integer,
    marca_nombre    varchar,
    id_calibre      integer,
    calibre_nombre  varchar,
    id_familia      integer,
    familia_nombre  varchar,
    ventas          numeric,
    bultos          numeric,
    hl              numeric,
    unidades        numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH agg AS (
        SELECT
            id_producto,
            SUM(importe_neto)    AS ventas,
            SUM(cantidad_bultos) AS bultos,
            SUM(cantidad_hl)     AS hl,
            COUNT(*)             AS unidades
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
        GROUP BY id_producto
    )
    SELECT
        p.id_producto,
        p.codigo_producto,
        p.nombre,
        m.id_marca,
        m.nombre,
        cal.id_calibre,
        cal.nombre,
        f.id_familia,
        f.nombre,
        COALESCE(agg.ventas, 0),
        COALESCE(agg.bultos, 0),
        COALESCE(agg.hl, 0),
        COALESCE(agg.unidades, 0)
    FROM productos p
    LEFT JOIN marcas m     ON m.id_marca = p.id_marca
    LEFT JOIN calibres cal ON cal.id_calibre = p.id_calibre
    JOIN familias f        ON f.id_familia = p.id_familia
    LEFT JOIN agg          ON agg.id_producto = p.id_producto
    -- `p_marca` también filtra la lista, no sólo las métricas: si el usuario elige
    -- una marca, quiere ver sus productos, no todos con la de arriba en cero.
    WHERE (p_marca IS NULL OR p.id_marca = p_marca)
    ORDER BY COALESCE(agg.ventas, 0) DESC, p.nombre;
$$;


-- ----------------------------------------------------------------------------
--  fn_jerarquia_comercial — el árbol UN → División → Familia → Producto
-- ----------------------------------------------------------------------------
--  Devuelve una fila por producto (la hoja del árbol) con los ids de sus tres
--  ancestros y las métricas a nivel de hoja. El frontend arma el árbol agrupando:
--  son una fila por producto, no una por venta.
--
--  Devolver el árbol anidado en JSON desde Postgres es más elegante en el papel,
--  pero más difícil de filtrar y ordenar desde la UI, y el filtro de búsqueda
--  tendría que aplicarse después de construir la estructura.

CREATE OR REPLACE FUNCTION fn_jerarquia_comercial(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_unidad_negocio integer,
    nombre_unidad     varchar,
    id_division       integer,
    nombre_division   varchar,
    id_familia        integer,
    nombre_familia    varchar,
    id_producto       integer,
    codigo_producto   varchar,
    nombre_producto   varchar,
    ventas            numeric,
    bultos            numeric,
    hl                numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH agg AS (
        SELECT
            id_producto,
            SUM(importe_neto)    AS ventas,
            SUM(cantidad_bultos) AS bultos,
            SUM(cantidad_hl)     AS hl
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
        GROUP BY id_producto
    )
    SELECT
        un.id_unidad_negocio,
        un.nombre,
        d.id_division,
        d.nombre,
        f.id_familia,
        f.nombre,
        p.id_producto,
        p.codigo_producto,
        p.nombre,
        COALESCE(agg.ventas, 0),
        COALESCE(agg.bultos, 0),
        COALESCE(agg.hl, 0)
    FROM productos p
    JOIN familias f          ON f.id_familia = p.id_familia
    JOIN divisiones d        ON d.id_division = f.id_division
    JOIN unidades_negocio un ON un.id_unidad_negocio = d.id_unidad_negocio
    LEFT JOIN marcas m       ON m.id_marca = p.id_marca
    LEFT JOIN agg            ON agg.id_producto = p.id_producto
    WHERE (p_marca IS NULL OR p.id_marca = p_marca)
    ORDER BY un.nombre, d.nombre, f.nombre, p.nombre;
$$;


COMMENT ON FUNCTION fn_productos IS
'Productos con métricas de venta agregadas y aplicados los filtros.';
COMMENT ON FUNCTION fn_jerarquia_comercial IS
'Árbol comercial aplanado: una fila por producto con sus ancestros y métricas.';

-- ----------------------------------------------------------------------------
--  Catalogos simples para los <select> de Products.tsx
-- ----------------------------------------------------------------------------
--  Son catalogos puros: no dependen de los filtros ni de las ventas. Es mas
--  simple y rapido leer la tabla directo que envolverla en una funcion.

CREATE OR REPLACE FUNCTION fn_calibres()
RETURNS TABLE (id integer, nombre varchar)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT id_calibre, nombre FROM calibres ORDER BY nombre $$;

CREATE OR REPLACE FUNCTION fn_familias()
RETURNS TABLE (id integer, nombre varchar)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT id_familia, nombre FROM familias ORDER BY nombre $$;
