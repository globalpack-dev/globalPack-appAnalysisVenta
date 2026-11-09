-- ============================================================================
--  44 — Gestión de usuarios desde Configuración
--
--  Permite que un administrador activo cambie el rol y el estado de OTROS
--  empleados. No crea cuentas: eso sigue haciéndose desde Supabase
--  (Authentication → Users), y el trigger `on_auth_user_created` crea la fila
--  correspondiente en `empleados`.
--
--  Por qué un RPC y no un UPDATE directo:
--    · la política RLS de `empleados` deja escribir al admin, pero no puede
--      impedir que se desactive a sí mismo ni que el sistema quede sin ningún
--      admin activo;
--    · esta función valida esas dos reglas en la base, no sólo en la interfaz.
--
--  No toca el nombre ni el email. El nombre propio lo sigue cambiando cada
--  usuario con `actualizar_mi_nombre` (archivo 40).
-- ============================================================================

-- Se retira el UPDATE genérico sobre `empleados` que creó el archivo 04. La RLS
-- no puede distinguir qué columnas se tocan, así que esa política permitía
-- cambiar `rol`/`activo` por REST sin pasar por las validaciones de abajo. A
-- partir de acá, las dos únicas vías de escritura son los RPC SECURITY DEFINER:
-- `actualizar_mi_nombre` (sólo el nombre propio) y `fn_actualizar_empleado`.
DROP POLICY IF EXISTS "empleados: el admin puede editar" ON public.empleados;

CREATE OR REPLACE FUNCTION public.fn_actualizar_empleado(
    p_id     uuid,
    p_rol    text,
    p_activo boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_otros_admins integer;
BEGIN
    -- Sólo un admin activo puede administrar usuarios.
    IF NOT public.es_admin() THEN
        RAISE EXCEPTION 'Sólo un administrador activo puede gestionar usuarios';
    END IF;

    -- Evita que el admin se quite a sí mismo el acceso por error.
    IF p_id = auth.uid() THEN
        RAISE EXCEPTION 'No podés cambiar tu propio rol ni tu estado';
    END IF;

    IF p_id IS NULL THEN
        RAISE EXCEPTION 'Falta el empleado a actualizar';
    END IF;

    IF p_rol IS NULL OR p_rol NOT IN ('admin', 'consulta') THEN
        RAISE EXCEPTION 'El rol debe ser admin o consulta';
    END IF;

    IF p_activo IS NULL THEN
        RAISE EXCEPTION 'El estado activo no puede ser nulo';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.empleados WHERE id = p_id) THEN
        RAISE EXCEPTION 'El empleado no existe';
    END IF;

    -- Admins activos que quedarían si este empleado deja de serlo.
    SELECT count(*) INTO v_otros_admins
      FROM public.empleados
     WHERE id <> p_id
       AND rol = 'admin'
       AND activo;

    IF (p_rol <> 'admin' OR NOT p_activo) AND v_otros_admins = 0 THEN
        RAISE EXCEPTION 'Debe quedar al menos un administrador activo';
    END IF;

    UPDATE public.empleados
       SET rol = p_rol,
           activo = p_activo
     WHERE id = p_id;
END $$;

COMMENT ON FUNCTION public.fn_actualizar_empleado(uuid, text, boolean) IS
'Cambia rol y estado de otro empleado. Sólo admin activo; no permite autodesactivarse ni dejar el sistema sin admins.';

-- La función no debe quedar ejecutable por anon ni por PUBLIC.
REVOKE ALL ON FUNCTION public.fn_actualizar_empleado(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_actualizar_empleado(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_actualizar_empleado(uuid, text, boolean) TO authenticated;

-- PostgREST cachea las funciones: sin esto el RPC puede tardar en aparecer.
NOTIFY pgrst, 'reload schema';
