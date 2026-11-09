-- ============================================================================
--  37b — Verificación del arreglo de fn_ventas_filtradas (versión de 9 params)
--
--  Se corre DESPUÉS de `37_fn_ventas_filtradas_9p.sql`.
--
--  Va en archivo aparte por la regla del proyecto: el SQL Editor envuelve todo
--  en una transacción y `EXPLAIN ANALYZE` ejecuta las consultas; si algo falla,
--  no queremos que se revierta el arreglo.
--
--  Qué mirar:
--    · Que exista UNA sola firma de fn_ventas_filtradas (sin el error 42725).
--    · Que la función aparezca INLINEADA en el plan (Subquery Scan sobre la
--      vista o los joins de `ventas`), sin "Function Scan".
--    · Que `LIMIT 50` corte temprano.
--    · Que las RPC que se cortaban por timeout terminen.
-- ============================================================================

-- 1. Tiene que haber exactamente una firma.
SELECT p.oid::regprocedure::text AS firma
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_ventas_filtradas';

-- 2. Devuelve lo mismo que antes (25.004 filas).
SELECT count(*) AS filas FROM public.fn_ventas_filtradas();

-- 3. Plan sin filtros.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT * FROM public.fn_ventas_filtradas();

-- 4. Plan con período (el filtro más común en Reportes).
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT * FROM public.fn_ventas_filtradas(2026, 10);

-- 5. La paginación de Ventas: con el arreglo tiene que cortar temprano.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT * FROM public.fn_ventas_filtradas()
ORDER BY id_venta DESC
LIMIT 50;

-- 6. Las agregadoras que se cortaban: ahora tienen que terminar.
SELECT 'kpis'      AS caso, total_neto, operaciones FROM public.fn_dashboard_kpis();
SELECT 'marcas'    AS caso, COUNT(*) AS filas FROM public.fn_marcas();
SELECT 'clientes'  AS caso, COUNT(*) AS filas FROM public.fn_clientes();
SELECT 'top'       AS caso, COUNT(*) AS filas FROM public.fn_top_clientes(8);
SELECT 'localidad' AS caso, COUNT(*) AS filas FROM public.fn_ventas_por_localidad(10);
