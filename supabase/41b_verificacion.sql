-- ============================================================================
--  41b — Verificación de fn_cliente_productos
--
--  Todo es de sólo lectura. El SQL Editor corre como `postgres`, así que estas
--  consultas prueban la lógica, no los permisos: la prueba real es abrir la
--  ficha del cliente en la app.
-- ============================================================================

-- ----------------------------------------------------------------------------
--  1. La función existe una sola vez, con la firma esperada
-- ----------------------------------------------------------------------------
SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS argumentos,
    p.provolatile,
    p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_cliente_productos';

-- Esperado: 1 fila, 7 argumentos, `s` (STABLE) y `f` (SECURITY INVOKER).

-- ----------------------------------------------------------------------------
--  2. Un cliente real con más de un período (id 1649, código 6437)
-- ----------------------------------------------------------------------------
SELECT anio, mes, COUNT(*) AS productos, SUM(neto) AS neto
FROM public.fn_cliente_productos(1649)
GROUP BY anio, mes
ORDER BY anio, mes;

-- Esperado: 2 filas (2026/10 y 2026/11) con neto > 0.

-- ----------------------------------------------------------------------------
--  3. Los totales por mes coinciden con fn_cliente_detalle
-- ----------------------------------------------------------------------------
WITH hist AS (
    SELECT anio, mes, neto
    FROM public.fn_cliente_detalle(1649)
), prod AS (
    SELECT anio, mes, SUM(neto) AS neto
    FROM public.fn_cliente_productos(1649)
    GROUP BY anio, mes
)
SELECT
    h.anio,
    h.mes,
    h.neto AS neto_historial,
    p.neto AS neto_productos,
    ROUND(h.neto - p.neto, 2) AS diferencia
FROM hist h
LEFT JOIN prod p USING (anio, mes)
WHERE p.neto IS NULL
   OR ROUND(h.neto - p.neto, 2) <> 0
ORDER BY h.anio, h.mes;

-- Esperado: 0 filas. Si aparece alguna, la función está perdiendo o duplicando
-- importes respecto del historial.

-- ----------------------------------------------------------------------------
--  4. Un cliente inexistente no devuelve filas
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS filas
FROM public.fn_cliente_productos(-1);

-- Esperado: 0.

-- ----------------------------------------------------------------------------
--  5. La función aparece en el esquema con el comentario correcto
-- ----------------------------------------------------------------------------
SELECT obj_description(p.oid, 'pg_proc') AS comentario
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_cliente_productos';
