-- ============================================================================
--  fn_ventas_pagina — tabla de Ventas con filtros y paginación
--
--  Por qué hace falta y no se usa la vista directamente:
--  `v_ventas_detalle` resuelve los nombres pero NO aplica los 7 filtros. Uno de
--  ellos (p_localidad) es indirecto: pasa por clientes.id_localidad, así que no
--  se puede escribir como un filtro simple de PostgREST.
--
--  Además hace falta el total de filas para el paginado, y `count: 'exact'` de
--  PostgREST contaría la vista completa sin los filtros.
--
--  Devuelve `total_filas` en cada fila (repetición deliberada: es la forma
--  habitual de devolver un total junto con un conjunto paginado).
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_ventas_pagina(
    integer, integer, integer, integer, integer, integer, text, integer, integer
);


CREATE OR REPLACE FUNCTION fn_ventas_pagina(
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
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            NULL, p_categoria
        )
    ),
    total AS (
        SELECT COUNT(*) AS n FROM f
    )
    SELECT
        f.id_venta, f.id_periodo, f.id_cliente, f.id_sucursal,
        f.id_encargado_venta, f.id_producto, f.id_clasificacion_marketing,
        f.anio, f.mes, f.nombre_mes, f.periodo_label,
        f.codigo_cliente, f.cliente_nombre, f.sucursal_nombre,
        f.codigo_sector_venta, f.encargado_nombre, f.supervisor_nombre,
        f.codigo_producto, f.producto_nombre, f.marca_nombre,
        f.familia_nombre, f.division_nombre, f.unidad_negocio_nombre,
        f.calibre_nombre,
        f.canal_ajustado, f.segmento_mkt, f.canal_mkt, f.subcanal_mkt,
        f.importe_neto, f.importe_bruto, f.importe_final,
        f.cantidad_bultos, f.cantidad_hl,
        total.n,
        f.categoria_nombre
    FROM f
    CROSS JOIN total
    ORDER BY f.anio, f.mes, f.cliente_nombre, f.id_venta
    LIMIT p_cantidad
    OFFSET p_desde;
$$;


COMMENT ON FUNCTION fn_ventas_pagina IS
'Ventas filtradas y paginadas, con el total de filas del filtro.';