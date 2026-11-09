-- ============================================================================
--  42b — Verificación de fn_marcas
--
--  Ejecutar después de `42_fn_marcas_productos.sql`. Las tres consultas tienen
--  que devolver resultados.
-- ============================================================================

-- 1) La función debe devolver `productos` y ya no `clientes`.
SELECT pg_get_function_result(
    'public.fn_marcas(integer,integer,integer,integer,integer,integer,text,integer)'::regprocedure
) AS resultado;

-- 2) Tiene que existir UNA sola sobrecarga de fn_marcas.
SELECT
    p.proname AS funcion,
    pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_marcas';

-- 3) Ninguna marca puede tener `productos` NULL, y el ranking sigue ordenado
--    por ventas descendentes.
SELECT id_marca, marca_nombre, ventas, productos, unidades, hl, crecimiento
FROM public.fn_marcas()
ORDER BY ventas DESC
LIMIT 10;
