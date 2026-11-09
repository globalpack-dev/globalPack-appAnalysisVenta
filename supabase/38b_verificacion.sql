-- ============================================================================
--  38b — Verificación de fn_clientes y fn_ventas_pagina
--
--  Se corre DESPUÉS de `38_clientes_y_paginacion_rapidas.sql`.
--
--  Qué mirar:
--    · Que fn_clientes() devuelva los mismos clientes que antes (3.051 en la
--      base actual; el jsonb tiene una sola fila).
--    · Que fn_ventas_pagina(0, 50) devuelva 50 filas y termine rápido.
--    · En los planes: que el CTE paginado haga un Sort + Limit chico y que los
--      joins de la vista aparezcan sólo del lado de las 50 filas.
-- ============================================================================

-- 1. Clientes: una fila jsonb con la lista completa.
SELECT jsonb_array_length(public.fn_clientes()) AS clientes;

-- 2. La primera página de Ventas: 50 filas, total 25.004.
SELECT COUNT(*) AS filas, MAX(total_filas) AS total
FROM public.fn_ventas_pagina(0, 50);

-- 3. Plan de la paginación.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT * FROM public.fn_ventas_pagina(0, 50);

-- 4. Plan de clientes.
EXPLAIN (ANALYZE, BUFFERS, TIMING OFF)
SELECT public.fn_clientes();

-- 5. Un caso con filtros (período), para confirmar que siguen funcionando.
SELECT COUNT(*) AS filas, MAX(total_filas) AS total
FROM public.fn_ventas_pagina(2026, 10, NULL, NULL, NULL, NULL, NULL, NULL, 0, 50);
