-- ============================================================================
--  43b — Verificación de fn_clientes con filtro por promotor
--
--  Ejecutar DESPUÉS de `43_clientes_promotor.sql`.
-- ============================================================================

-- 1. Tiene que haber UNA sola firma de fn_clientes (9 argumentos).
SELECT p.oid::regprocedure::text AS firma
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'fn_clientes';

-- 2. La lista completa tiene que seguir trayendo todos los clientes.
SELECT jsonb_array_length(public.fn_clientes()) AS clientes;

-- 3. Las claves nuevas tienen que existir en cada fila.
SELECT
    (public.fn_clientes() -> 0 ->> 'id_encargado_venta') AS id_encargado_venta,
    (public.fn_clientes() -> 0 ->> 'encargado_nombre')    AS encargado_nombre;

-- 4. Por cada promotor de la cartera, el filtro tiene que devolver exactamente
--    sus clientes de `clientes_operativa`.
WITH cartera AS (
    SELECT id_encargado_venta, COUNT(*) AS clientes_operativa
    FROM public.clientes_operativa
    WHERE id_encargado_venta IS NOT NULL
    GROUP BY id_encargado_venta
)
SELECT
    ev.nombre_completo,
    c.clientes_operativa,
    jsonb_array_length(public.fn_clientes(p_promotor => c.id_encargado_venta)) AS clientes_fn
FROM cartera c
JOIN public.encargados_ventas ev
  ON ev.id_encargado_venta = c.id_encargado_venta
WHERE jsonb_array_length(public.fn_clientes(p_promotor => c.id_encargado_venta))
      <> c.clientes_operativa
ORDER BY ev.nombre_completo;

-- 5. Los clientes filtrados tienen que traer el nombre del promotor.
SELECT
    count(*) FILTER (WHERE (f ->> 'encargado_nombre') IS NULL) AS sin_nombre
FROM jsonb_array_elements(
    public.fn_clientes(p_promotor => (
        SELECT id_encargado_venta
        FROM public.clientes_operativa
        WHERE id_encargado_venta IS NOT NULL
        LIMIT 1
    ))
) f;

-- 6. Plan de la consulta sin filtro y con filtro.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT public.fn_clientes();

EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT public.fn_clientes(p_promotor => (
    SELECT id_encargado_venta
    FROM public.clientes_operativa
    WHERE id_encargado_venta IS NOT NULL
    LIMIT 1
));
