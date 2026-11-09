-- ============================================================================
--  39b — Verificación de fn_dashboard_todo (con p_categoria) y fn_clientes
--
--  Se corre DESPUÉS de `39_reportes_una_llamada_y_clientes.sql`.
-- ============================================================================

-- 1. Tiene que haber UNA sola firma de fn_dashboard_todo (10 argumentos).
SELECT p.oid::regprocedure::text AS firma
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'fn_dashboard_todo';

-- 2. El jsonb tiene las 8 claves de siempre.
SELECT jsonb_object_keys(public.fn_dashboard_todo()) AS claves;

-- 3. Los números del reporte tienen que coincidir con los de la función suelta.
SELECT (public.fn_dashboard_todo() -> 'kpis' ->> 'operaciones')  AS todo_ops,
       (SELECT operaciones FROM public.fn_dashboard_kpis())       AS kpis_ops,
       (public.fn_dashboard_todo() -> 'kpis' ->> 'total_neto')    AS todo_neto,
       (SELECT total_neto FROM public.fn_dashboard_kpis())        AS kpis_neto;

-- 4. fn_clientes: una fila jsonb con la lista completa (3.051 en la base actual).
SELECT jsonb_array_length(public.fn_clientes()) AS clientes;

-- 5. Filtrada por cliente: tiene que seguir devolviendo la lista completa.
SELECT jsonb_array_length(public.fn_clientes(NULL, NULL, 1)) AS clientes_con_filtro;

-- 6. Planes.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT public.fn_clientes();

EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT public.fn_dashboard_todo();
