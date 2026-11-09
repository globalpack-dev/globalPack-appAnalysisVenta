-- ============================================================================
--  v_ventas_detalle
--
--  Por qué existe: la tabla `ventas` es normalizada y guarda sólo FKs. El
--  prototipo (Sales.tsx) necesita mostrar y ordenar por nombres: cliente,
--  sucursal, producto, marca, familia, canal. Esta vista reune todo por joins.
--
--  Provee las 13 columnas que usa Sales.tsx más las FKs para los filtros.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================

CREATE OR REPLACE VIEW v_ventas_detalle AS
SELECT
    v.id_venta,
    v.id_periodo,
    v.id_cliente,
    v.id_sucursal,
    v.id_encargado_venta,
    v.id_producto,
    v.id_clasificacion_marketing,

    -- Período
    p.anio,
    p.mes,
    p.nombre_mes,
    p.nombre_mes || ' ' || p.anio::text AS periodo_label,

    -- Cliente
    c.codigo_cliente,
    COALESCE(c.nombre_fantasia, c.razon_social) AS cliente_nombre,

    -- Sucursal
    su.nombre AS sucursal_nombre,

    -- Encargado de venta (el prototipo lo llamaba "sector")
    ev.codigo_sector_venta,
    ev.nombre_completo AS encargado_nombre,

    -- Supervisor del encargado
    sv.nombre_completo AS supervisor_nombre,

    -- Producto y su jerarquía
    pr.codigo_producto,
    pr.nombre AS producto_nombre,
    m.nombre AS marca_nombre,
    f.nombre AS familia_nombre,
    d.nombre AS division_nombre,
    un.nombre AS unidad_negocio_nombre,
    cal.nombre AS calibre_nombre,

    -- Clasificación de marketing
    cm.canal_ajustado,
    cm.segmento_mkt,
    cm.canal_mkt,
    cm.subcanal_mkt,

    -- Importes y cantidades
    v.importe_neto,
    v.importe_bruto,
    v.importe_final,
    v.cantidad_bultos,
    v.cantidad_hl
FROM ventas v
JOIN periodos p
    ON p.id_periodo = v.id_periodo
JOIN clientes c
    ON c.id_cliente = v.id_cliente
JOIN sucursales su
    ON su.id_sucursal = v.id_sucursal
JOIN encargados_ventas ev
    ON ev.id_encargado_venta = v.id_encargado_venta
LEFT JOIN supervisores sv
    ON sv.id_supervisor = ev.id_supervisor
JOIN productos pr
    ON pr.id_producto = v.id_producto
LEFT JOIN marcas m
    ON m.id_marca = pr.id_marca
JOIN familias f
    ON f.id_familia = pr.id_familia
JOIN divisiones d
    ON d.id_division = f.id_division
JOIN unidades_negocio un
    ON un.id_unidad_negocio = d.id_unidad_negocio
LEFT JOIN calibres cal
    ON cal.id_calibre = pr.id_calibre
LEFT JOIN clasificaciones_marketing cm
    ON cm.id_clasificacion_marketing = v.id_clasificacion_marketing;


COMMENT ON VIEW v_ventas_detalle IS
'Ventas con todos los nombres resueltos. Base de la tabla de Sales.tsx.';