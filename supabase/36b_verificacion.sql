-- ============================================================================
--  36b — Verificación del arreglo de fn_ventas_filtradas
--
--  Se corre DESPUÉS de `36_fn_ventas_filtradas_rapida.sql`.
--
--  Va en archivo aparte por la regla del proyecto: el SQL Editor envuelve todo
--  en una transacción y `EXPLAIN ANALYZE` ejecuta la consulta; si algo falla,
--  se revierte el archivo completo y no queremos que eso arrastre al 36.
--
--  Qué mirar:
--    · Que la función aparezca INLINEADA en el plan (el cuerpo de la vista
--      aparece como "Subquery Scan on d" o directamente como los joins de
--      `ventas`), sin un nodo "Function Scan on fn_ventas_filtradas".
--    · Que el `LIMIT` baje: la consulta de 50 filas no debe leer 25.004.
--    · Los tiempos: cada bloque debería quedar por debajo de ~2 s.
-- ============================================================================

-- 1. La función sin filtros: tiene que devolver lo mismo que antes (25.004).
SELECT count(*) AS filas
FROM public.fn_ventas_filtradas();

-- 2. Plan de la función sin filtros.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT *
FROM public.fn_ventas_filtradas();

-- 3. Plan con un filtro de período: el más común en Reportes.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT *
FROM public.fn_ventas_filtradas(2026, 10);

-- 4. La paginación de Ventas: con el arreglo tiene que cortar temprano.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT *
FROM public.fn_ventas_filtradas()
ORDER BY id_venta DESC
LIMIT 50;

-- 5. Las agregadoras que se cortaban por timeout: ahora tienen que terminar.
--    (Devuelven filas; el objetivo es que no aparezca el error 57014.)
SELECT 'kpis'     AS caso, * FROM public.fn_dashboard_kpis();
SELECT 'marcas'   AS caso, COUNT(*) AS filas FROM public.fn_marcas();
SELECT 'clientes' AS caso, COUNT(*) AS filas FROM public.fn_clientes();
SELECT 'top'      AS caso, COUNT(*) AS filas FROM public.fn_top_clientes(8);
SELECT 'localidad' AS caso, COUNT(*) AS filas FROM public.fn_ventas_por_localidad(10);
