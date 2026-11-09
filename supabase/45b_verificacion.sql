-- ============================================================================
--  Verificación del archivo 45 (catálogo de períodos)
--  Va aparte: el SQL Editor envuelve todo en una transacción y un error acá
--  revertiría la función.
-- ============================================================================

-- 1. Cada período del catálogo debe traer mes y año numéricos, y sólo deben
--    aparecer los que tienen ventas.
SELECT e ->> 'nombre' AS periodo,
       (e ->> 'mes')::int AS mes,
       (e ->> 'anio')::int AS anio
FROM jsonb_array_elements(fn_filtros_disponibles() -> 'periodo') e
ORDER BY anio, mes;

-- 2. La cantidad del catálogo debe coincidir con los períodos que tienen ventas.
SELECT jsonb_array_length(fn_filtros_disponibles() -> 'periodo') AS periodos_catalogo,
       (SELECT COUNT(DISTINCT id_periodo) FROM ventas) AS periodos_con_ventas;

-- 3. El resto del catálogo no debe cambiar.
SELECT jsonb_array_length(fn_filtros_disponibles() -> 'cliente') AS clientes,
       jsonb_array_length(fn_filtros_disponibles() -> 'localidad') AS localidades,
       jsonb_array_length(fn_filtros_disponibles() -> 'marca') AS marcas;
