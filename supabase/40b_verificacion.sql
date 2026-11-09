-- ============================================================================
--  40b — Verificación de `40_rls_solo_lectura.sql`
--
--  Ejecutar en el SQL Editor DESPUÉS del 40. Es sólo lectura: no modifica nada.
--  Todo lo que importa acá son las columnas `cmd`, `qual` y `with_check` de
--  `pg_policies` y el estado de RLS de cada tabla.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. ¿Todas las tablas de public tienen RLS activo?
-- ----------------------------------------------------------------------------
--  Esperado: las 23 tablas con `rls = true` y `n_policies > 0`.
--  Si alguna dice `false`, no se le aplicó el 40 o el CREATE TABLE original.

SELECT c.relname                    AS tabla,
       c.relrowsecurity             AS rls,
       count(p.polname)             AS n_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;


-- ----------------------------------------------------------------------------
--  2. Escrituras: toda policy de INSERT/UPDATE/DELETE, con su condición
-- ----------------------------------------------------------------------------
--  Esperado: ninguna INSERT/UPDATE con `with_check = true`; todas deben decir
--  `es_admin()`. Las de DELETE también.

SELECT tablename,
       policyname,
       cmd,
       qual,
       with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
ORDER BY tablename, cmd, policyname;


-- ----------------------------------------------------------------------------
--  3. Las que quedaron flojas (debería devolver 0 filas)
-- ----------------------------------------------------------------------------

SELECT tablename, policyname, cmd, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'UPDATE')
  AND with_check = 'true'
ORDER BY tablename, policyname;


-- ----------------------------------------------------------------------------
--  4. Tablas que no deberían existir con escritura abierta
-- ----------------------------------------------------------------------------
--  Recordatorio de las que se cerraron: marcas_alcohol y clientes_operativa
--  antes no tenían RLS. Esta consulta las muestra explícitamente.

SELECT c.relname AS tabla, c.relrowsecurity AS rls, count(p.polname) AS n_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relname IN ('marcas_alcohol', 'clientes_operativa', 'categorias',
                    'importaciones', 'cartera_historial')
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;


-- ----------------------------------------------------------------------------
--  5. La función del nombre
-- ----------------------------------------------------------------------------
--  Esperado: `security_definer = true`, `proconfig` con search_path=public,
--  `anon_puede = false`, `authenticated_puede = true`.

SELECT p.proname,
       p.prosecdef                                   AS security_definer,
       p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_puede,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_puede
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'actualizar_mi_nombre';


-- ----------------------------------------------------------------------------
--  6. Prueba funcional del RPC (opcional, fuera de la app)
-- ----------------------------------------------------------------------------
--  El SQL Editor corre como `postgres`, así que `auth.uid()` es NULL y el RPC
--  lanza «No hay un empleado asociado al usuario actual». Es lo correcto.
--
--  Para probarlo de verdad hay que hacerlo desde la app con la sesión de un
--  usuario `consulta`: Configuración → cambiar el nombre → Guardar cambios.
--  Antes del 40 la UI decía «Guardado» sin escribir nada; ahora tiene que
--  persistir y seguir mostrándolo después de recargar.
