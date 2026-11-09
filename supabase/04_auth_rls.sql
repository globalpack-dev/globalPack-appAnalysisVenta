-- ============================================================================
--  F6.1 — Tabla de empleados, RLS y trigger de registro
--
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS de 01, 02 y 03.
--  (Este archivo no depende de las vistas ni funciones anteriores, pero conviene
--   correrlo al final para no dejar la base a medio cerrar.)
--
--  ── Qué se define ───────────────────────────────────────────────────────────
--  · empleados: quién entra al sistema y qué rol tiene
--  · RLS: qué puede hacer cada rol
--  · trigger: crea la fila de `empleados` al registrarse un usuario
--
--  ── Roles ────────────────────────────────────────────────────────────────────
--  admin    : ve todo, edita todo el negocio, elimina en el negocio y gestiona
--             empleados
--  consulta : ve todo y edita (alta y modificación) en el negocio
--
--  Diferencias entre los dos roles:
--    · El DELETE sobre datos de negocio es sólo del admin. Un borrado en Postgres
--      no deja rastro y no hay "deshacer": no puede ser acción de un supervisor.
--    · Sólo el admin gestiona `empleados`.
--
--  Lo que SÍ puede hacer un `consulta`: dar de alta clientes, productos, marcas y
--  ventas, y corregir sus datos. Es un sistema de gestión comercial, no un
--  tablero de sólo lectura.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Tabla de empleados
-- ----------------------------------------------------------------------------
--  El id es el mismo que `auth.users.id`. Así un usuario de acceso es
--  exactamente un empleado, sin tabla puente ni columnas que sincronizar.
--
--  Esta tabla NO guarda contraseñas. El email y el hash viven en `auth.users`,
--  que administra Supabase y que no se ve desde el SQL Editor.

CREATE TABLE IF NOT EXISTS empleados (
    id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre     text NOT NULL,
    email      text NOT NULL,
    rol        text NOT NULL DEFAULT 'consulta'
               CHECK (rol IN ('admin', 'consulta')),
    activo     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE empleados IS
'Personal con acceso al sistema. El id coincide con auth.users.id.';

CREATE INDEX IF NOT EXISTS idx_empleados_rol ON empleados (rol);


-- ----------------------------------------------------------------------------
--  2. Función auxiliar: ¿es administrador?
-- ----------------------------------------------------------------------------
--  Se usa en las políticas de RLS.
--
--  SECURITY DEFINER + search_path fijo: sin esto, la función se ejecutaría con los
--  permisos del usuario y no podría leer `empleados` (que tiene RLS activa),
--  generando recursión. Es el error clásico al montar esto por primera vez.

CREATE OR REPLACE FUNCTION es_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM empleados e
        WHERE e.id = auth.uid() AND e.rol = 'admin' AND e.activo
    );
$$;

COMMENT ON FUNCTION es_admin() IS
'true si el usuario actual es un empleado activo con rol admin.';


-- ----------------------------------------------------------------------------
--  3. RLS sobre empleados
-- ----------------------------------------------------------------------------
--  Leen todos los autenticados (necesitan saber quién es cada uno para atribuir
--  reportes y para la administración). Escribe sólo el admin.

ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empleados: cualquier autenticado puede leer"
    ON empleados FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "empleados: el admin puede crear"
    ON empleados FOR INSERT
    TO authenticated
    WITH CHECK (es_admin());

CREATE POLICY "empleados: el admin puede editar"
    ON empleados FOR UPDATE
    TO authenticated
    USING (es_admin())
    WITH CHECK (es_admin());

-- Borrar empleados: también sólo admin, porque un borrado acá quita el acceso
-- de una persona. Es distinto a borrar un cliente.
CREATE POLICY "empleados: el admin puede eliminar"
    ON empleados FOR DELETE
    TO authenticated
    USING (es_admin());


-- ----------------------------------------------------------------------------
--  4. RLS sobre las 15 tablas de negocio
-- ----------------------------------------------------------------------------
--  Los dos roles pueden leer, insertar, actualizar y eliminar. Es lo que se
--  decidió: el sistema es de gestión comercial, no un tablero de sólo lectura.

ALTER TABLE periodos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE localidades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sucursales              ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE encargados_ventas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades_negocio        ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisiones              ENABLE ROW LEVEL SECURITY;
ALTER TABLE familias                ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibres                ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos               ENABLE ROW LEVEL SECURITY;
ALTER TABLE clasificaciones_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas                  ENABLE ROW LEVEL SECURITY;

-- Cuatro políticas por tabla, en vez de una sola `FOR ALL`:
--   · SELECT, INSERT, UPDATE  → cualquier autenticado
--   · DELETE                  → sólo admin
--
-- Por qué separarlas: un `FOR ALL ... USING (true)` le daría también el borrado
-- al rol `consulta`, y en Postgres un borrado no se puede deshacer.
--
-- `WITH CHECK (true)` en insert y update: no se restringen los valores que se
-- pueden escribir. Hoy las reglas de negocio se validan en el Excel y en la UI.

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'periodos', 'localidades', 'sucursales', 'supervisores',
        'encargados_ventas', 'clientes', 'unidades_negocio', 'divisiones',
        'familias', 'marcas', 'calibres', 'productos',
        'clasificaciones_marketing', 'ventas'
    ]
    LOOP
        EXECUTE format($p$CREATE POLICY "negocio: lectura" ON %I
            FOR SELECT TO authenticated USING (true)$p$, t);

        EXECUTE format($p$CREATE POLICY "negocio: alta" ON %I
            FOR INSERT TO authenticated WITH CHECK (true)$p$, t);

        EXECUTE format($p$CREATE POLICY "negocio: edicion" ON %I
            FOR UPDATE TO authenticated USING (true) WITH CHECK (true)$p$, t);

        EXECUTE format($p$CREATE POLICY "negocio: borrado solo admin" ON %I
            FOR DELETE TO authenticated USING (es_admin())$p$, t);
    END LOOP;
END $$;


-- ----------------------------------------------------------------------------
--  5. Trigger: crear el empleado al registrarse un usuario
-- ----------------------------------------------------------------------------
--  Sin este trigger, un usuario puede autenticarse pero no tiene fila en
--  `empleados`, así que `es_admin()` devuelve false y `empleados` le aparece
--  vacía. Es el fallo más común al montar esto.
--
--  El rol por defecto es 'consulta'. Nadie nace admin: hay que promoverlo a
--  mano con un UPDATE. Así nadie se auto-asigna permisos.

CREATE OR REPLACE FUNCTION crear_empleado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO empleados (id, nombre, email, rol)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'nombre', NEW.email),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data ->> 'rol', 'consulta')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION crear_empleado();


-- ----------------------------------------------------------------------------
--  6. La vista v_ventas_detalle también necesita RLS
-- ----------------------------------------------------------------------------
--  Las vistas en Postgres se ejecutan con los permisos de quien consulta, así
--  que heredan el RLS de las tablas de base. No hace falta una política propia.
--  Se anota acá para que quede registrado y nadie se pregunte por qué falta.


-- ============================================================================
--  NOTA SOBRE EL BORRADO
-- ============================================================================
--
--  El DELETE sobre datos de negocio quedo restringido al admin. Un borrado en
--  Postgres no deja rastro y no hay "deshacer", asi que no es una accion que
--  deba quedar en manos de un supervisor.
--
--  Aun asi, el admin puede borrar una venta por error y no recuperarla. Eso
--  sigue siendo un riesgo con los 8.705 registros reales.
--
--  Mitigaciones, de menor a mayor esfuerzo:
--   1. Confirmacion en la UI antes de borrar. Es UI, no seguridad: evita el
--      borrado por error de dedo, no el intencional.
--   2. Tabla historial_cambios + trigger de auditoria. Es lo que Global Pack
--      pidio: saber quien cambio que. No esta implementado todavia.
--   3. Borrado logico (archivado boolean) en vez de fisico. Nunca se pierde la
--      fila, pero cambia el modelo de datos.
--
--  La 2 es la que resuelve el problema real que la empresa reporto. Queda
--  anotada aca para que no se pierda de vista.
-- ============================================================================
