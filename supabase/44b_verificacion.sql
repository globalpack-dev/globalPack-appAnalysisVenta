-- ============================================================================
--  44b — Verificación de la gestión de usuarios
--
--  Archivo aparte a propósito: si una consulta falla, el SQL Editor revierte
--  todo el archivo. Así el 44 queda aplicado y este se puede reintentar.
-- ============================================================================

-- 1. La función existe una sola vez, con la firma esperada.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef                                AS security_definer,
       p.proconfig                                AS configuracion
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'fn_actualizar_empleado';

-- 2. Permisos: authenticated puede ejecutarla; anon no.
SELECT r.rolname AS rol,
       has_function_privilege(
           r.rolname,
           'public.fn_actualizar_empleado(uuid, text, boolean)',
           'EXECUTE'
       ) AS puede_ejecutar
  FROM pg_roles r
 WHERE r.rolname IN ('authenticated', 'anon', 'public')
 ORDER BY r.rolname;

-- 3. Políticas de `empleados`: ya no debe existir una de UPDATE. Las escrituras
--    pasan por `actualizar_mi_nombre` y `fn_actualizar_empleado`.
SELECT policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename = 'empleados'
 ORDER BY cmd, policyname;

SELECT NOT EXISTS (
           SELECT 1
             FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'empleados'
              AND cmd = 'UPDATE'
       ) AS update_directo_bloqueado;

-- 4. Estado actual de los usuarios (foto antes de probar desde la app).
SELECT nombre, email, rol, activo, created_at
  FROM public.empleados
 ORDER BY rol DESC, nombre;

-- 5. Tiene que haber al menos un admin activo para poder administrar.
SELECT count(*) AS admins_activos
  FROM public.empleados
 WHERE rol = 'admin' AND activo;

-- 6. Sin sesión (SQL Editor, auth.uid() nulo) la función debe rechazar.
--    Se captura la excepción para que el archivo no aborte.
DO $$
DECLARE
    v_id  uuid;
    v_msg text;
BEGIN
    SELECT id INTO v_id FROM public.empleados LIMIT 1;

    IF v_id IS NULL THEN
        RAISE NOTICE 'No hay empleados para probar; se omite el control.';
    ELSE
        BEGIN
            PERFORM public.fn_actualizar_empleado(v_id, 'consulta', true);
            RAISE EXCEPTION 'FALLO: la función permitió ejecutarse sin ser admin';
        EXCEPTION WHEN OTHERS THEN
            v_msg := SQLERRM;
            IF v_msg LIKE 'FALLO:%' THEN
                RAISE;
            END IF;
            IF v_msg NOT LIKE '%Sólo un administrador activo%' THEN
                RAISE EXCEPTION 'FALLO: mensaje inesperado: %', v_msg;
            END IF;
        END;
    END IF;
END $$;
