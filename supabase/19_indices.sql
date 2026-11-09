-- ============================================================================
--  Índices para las consultas de agregación
--
--  Por qué: con 8.705 ventas, `fn_dashboard_kpis` tardaba ~2s y las ocho
--  consultas del Dashboard en paralelo caían todas por `statement timeout`.
--  La causa no es la cantidad de filas sino que `ventas` no tenía NINGÚN
--  índice en sus columnas foráneas.
--
--  Postgres crea índice automático para las PRIMARY KEY, pero NO para las
--  FOREIGN KEY. Sin ellos, `fn_ventas_filtradas` hace un seq scan de
--  `productos` por cada una de las 8.705 ventas al resolver el filtro de marca:
--
--    d.id_producto IN (SELECT pr.id_producto FROM productos pr WHERE pr.id_marca = p_marca)
--
--  Lo mismo con el encargado, el período y el producto en cada JOIN de la
--  vista `v_ventas_detalle`, que arrastran las 14 funciones.
--
--  Es seguro: son índices adicionales, no cambian ninguna consulta ni dato.
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  ventas: los JOIN y filtros de la vista y de fn_ventas_filtradas
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ventas_periodo     ON ventas(id_periodo);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente     ON ventas(id_cliente);
CREATE INDEX IF NOT EXISTS idx_ventas_producto    ON ventas(id_producto);
CREATE INDEX IF NOT EXISTS idx_ventas_encargado   ON ventas(id_encargado_venta);
CREATE INDEX IF NOT EXISTS idx_ventas_sucursal    ON ventas(id_sucursal);
CREATE INDEX IF NOT EXISTS idx_ventas_marketing   ON ventas(id_clasificacion_marketing);


-- ----------------------------------------------------------------------------
--  productos: los tres filtros del catálogo de productos
-- ----------------------------------------------------------------------------
--  id_marca es el que más duele: es el subquery del filtro de marca.

CREATE INDEX IF NOT EXISTS idx_productos_marca    ON productos(id_marca);
CREATE INDEX IF NOT EXISTS idx_productos_familia  ON productos(id_familia);
CREATE INDEX IF NOT EXISTS idx_productos_division ON productos(id_division);


-- ----------------------------------------------------------------------------
--  Compositos: para el caso más común (filtrar por período)
-- ----------------------------------------------------------------------------
--  Casi todos los reportes filtran por período, y los rankings agrupan por
--  producto o cliente. Un índice compuesto cubre el filtro y evita el sort.

CREATE INDEX IF NOT EXISTS idx_ventas_periodo_producto  ON ventas(id_periodo, id_producto);
CREATE INDEX IF NOT EXISTS idx_ventas_periodo_cliente  ON ventas(id_periodo, id_cliente);
CREATE INDEX IF NOT EXISTS idx_ventas_periodo_encargado ON ventas(id_periodo, id_encargado_venta);


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------

-- Cuántos índices hay ahora en cada tabla.
SELECT 'ventas'    AS tabla, COUNT(*) AS indices FROM pg_indexes WHERE tablename = 'ventas'
UNION ALL
SELECT 'productos', COUNT(*) FROM pg_indexes WHERE tablename = 'productos';

-- Las consultas tienen que seguir devolviendo lo mismo.
SELECT 'kpis' AS caso, total_neto, operaciones FROM fn_dashboard_kpis();
SELECT 'serie' AS caso, COUNT(*) AS periodos FROM fn_ventas_mensuales();
SELECT 'marcas' AS caso, COUNT(*) AS filas FROM fn_marcas();
SELECT 'clientes' AS caso, COUNT(*) AS filas FROM fn_clientes();
SELECT 'marketing' AS caso, COUNT(*) AS filas FROM fn_marketing_por();