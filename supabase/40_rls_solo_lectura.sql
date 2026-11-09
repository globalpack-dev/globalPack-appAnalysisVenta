-- ============================================================================
--  40 — RLS de sólo lectura: escribir es cosa del admin
--
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS del 39.
--  La verificación va aparte, en `40b_verificacion.sql`.
--
--  ── Por qué existe este archivo ─────────────────────────────────────────────
--  El 04 dejó el sistema como "gestión comercial": los dos roles podían dar de
--  alta y modificar cualquier tabla de negocio. El 23, el 33 y el 34 repitieron
--  ese criterio. Con la decisión de producto del 02/11/2026 la app es de SÓLO
--  LECTURA: el único que escribe es el admin, y sólo a través del importador
--  de Excel. Este archivo cierra la escritura sin tocar el borrado (que ya era
--  sólo del admin) ni la lectura (que sigue abierta a cualquier autenticado).
--
--  ── Qué cambia ──────────────────────────────────────────────────────────────
--   1. Las 14 tablas del núcleo (04): INSERT y UPDATE pasan a `es_admin()`.
--   2. `categorias` (22): idem.
--   3. Cartera (23): `supervisores_cartera`, `cliente_producto` y
--      `cliente_alcohol`: idem.
--   4. `clientes_operativa` (30): no tenía RLS. Se activa con el mismo criterio.
--   5. `importaciones` (33) y `cartera_historial` (34): INSERT y UPDATE a admin.
--   6. `marcas_alcohol` (23/27): no tenía RLS. Se activa.
--   7. RPC `actualizar_mi_nombre(text)`: el único dato que un usuario común
--      puede cambiar es su propio nombre. Va por función SECURITY DEFINER para
--      no abrir un UPDATE general sobre `empleados` (eso permitiría cambiarse
--      el rol).
--
--  ── Qué NO cambia ───────────────────────────────────────────────────────────
--   · SELECT: sigue abierto a `authenticated`. La app necesita leer todo.
--   · DELETE: sigue restringido a `es_admin()` donde ya lo estaba.
--   · El importador no se rompe: siempre corre con la sesión del admin, así que
--     `es_admin()` devuelve true en cada INSERT/UPDATE.
--
--  El SQL Editor envuelve todo en una transacción: si una sentencia falla, no
--  queda nada a medias.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Núcleo: las 14 tablas del 04
-- ----------------------------------------------------------------------------
--  Se recrean las dos políticas de escritura. La de lectura ("negocio: lectura")
--  y la de borrado ("negocio: borrado solo admin") quedan como están.

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
        EXECUTE format('DROP POLICY IF EXISTS "negocio: alta" ON %I', t);
        EXECUTE format($p$CREATE POLICY "negocio: alta" ON %I
            FOR INSERT TO authenticated WITH CHECK (es_admin())$p$, t);

        EXECUTE format('DROP POLICY IF EXISTS "negocio: edicion" ON %I', t);
        EXECUTE format($p$CREATE POLICY "negocio: edicion" ON %I
            FOR UPDATE TO authenticated
            USING (es_admin()) WITH CHECK (es_admin())$p$, t);
    END LOOP;
END $$;


-- ----------------------------------------------------------------------------
--  2. Categorías (22)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS categorias_insert ON categorias;
CREATE POLICY categorias_insert ON categorias
    FOR INSERT TO authenticated WITH CHECK (es_admin());

DROP POLICY IF EXISTS categorias_update ON categorias;
CREATE POLICY categorias_update ON categorias
    FOR UPDATE TO authenticated
    USING (es_admin()) WITH CHECK (es_admin());


-- ----------------------------------------------------------------------------
--  3. Cartera (23)
-- ----------------------------------------------------------------------------

-- supervisores_cartera
DROP POLICY IF EXISTS cartera_insert ON supervisores_cartera;
CREATE POLICY cartera_insert ON supervisores_cartera
    FOR INSERT TO authenticated WITH CHECK (es_admin());

DROP POLICY IF EXISTS cartera_update ON supervisores_cartera;
CREATE POLICY cartera_update ON supervisores_cartera
    FOR UPDATE TO authenticated
    USING (es_admin()) WITH CHECK (es_admin());

-- cliente_producto
DROP POLICY IF EXISTS cp_insert ON cliente_producto;
CREATE POLICY cp_insert ON cliente_producto
    FOR INSERT TO authenticated WITH CHECK (es_admin());

DROP POLICY IF EXISTS cp_update ON cliente_producto;
CREATE POLICY cp_update ON cliente_producto
    FOR UPDATE TO authenticated
    USING (es_admin()) WITH CHECK (es_admin());

-- cliente_alcohol
DROP POLICY IF EXISTS ca_insert ON cliente_alcohol;
CREATE POLICY ca_insert ON cliente_alcohol
    FOR INSERT TO authenticated WITH CHECK (es_admin());

DROP POLICY IF EXISTS ca_update ON cliente_alcohol;
CREATE POLICY ca_update ON cliente_alcohol
    FOR UPDATE TO authenticated
    USING (es_admin()) WITH CHECK (es_admin());


-- ----------------------------------------------------------------------------
--  4. clientes_operativa (30): no tenía RLS
-- ----------------------------------------------------------------------------

ALTER TABLE clientes_operativa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operativa_select ON clientes_operativa;
CREATE POLICY operativa_select ON clientes_operativa
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS operativa_insert ON clientes_operativa;
CREATE POLICY operativa_insert ON clientes_operativa
    FOR INSERT TO authenticated WITH CHECK (es_admin());

DROP POLICY IF EXISTS operativa_update ON clientes_operativa;
CREATE POLICY operativa_update ON clientes_operativa
    FOR UPDATE TO authenticated
    USING (es_admin()) WITH CHECK (es_admin());

DROP POLICY IF EXISTS operativa_delete ON clientes_operativa;
CREATE POLICY operativa_delete ON clientes_operativa
    FOR DELETE TO authenticated USING (es_admin());


-- ----------------------------------------------------------------------------
--  5. Importaciones (33) y cartera_historial (34)
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS importaciones_insert ON importaciones;
CREATE POLICY importaciones_insert ON importaciones
    FOR INSERT TO authenticated WITH CHECK (es_admin());

DROP POLICY IF EXISTS importaciones_update ON importaciones;
CREATE POLICY importaciones_update ON importaciones
    FOR UPDATE TO authenticated
    USING (es_admin()) WITH CHECK (es_admin());

DROP POLICY IF EXISTS cartera_historial_insert ON cartera_historial;
CREATE POLICY cartera_historial_insert ON cartera_historial
    FOR INSERT TO authenticated WITH CHECK (es_admin());

DROP POLICY IF EXISTS cartera_historial_update ON cartera_historial;
CREATE POLICY cartera_historial_update ON cartera_historial
    FOR UPDATE TO authenticated
    USING (es_admin()) WITH CHECK (es_admin());


-- ----------------------------------------------------------------------------
--  6. marcas_alcohol (23/27): no tenía RLS
-- ----------------------------------------------------------------------------
--  La lee `fn_supervisores_cartera` y los KPIs. La escribe el importador cuando
--  crea una marca nueva con el checkbox «¿es alcohol?».

ALTER TABLE marcas_alcohol ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marcas_alcohol_select ON marcas_alcohol;
CREATE POLICY marcas_alcohol_select ON marcas_alcohol
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS marcas_alcohol_insert ON marcas_alcohol;
CREATE POLICY marcas_alcohol_insert ON marcas_alcohol
    FOR INSERT TO authenticated WITH CHECK (es_admin());

DROP POLICY IF EXISTS marcas_alcohol_update ON marcas_alcohol;
CREATE POLICY marcas_alcohol_update ON marcas_alcohol
    FOR UPDATE TO authenticated
    USING (es_admin()) WITH CHECK (es_admin());

DROP POLICY IF EXISTS marcas_alcohol_delete ON marcas_alcohol;
CREATE POLICY marcas_alcohol_delete ON marcas_alcohol
    FOR DELETE TO authenticated USING (es_admin());


-- ----------------------------------------------------------------------------
--  7. RPC: cada usuario puede cambiar su propio nombre
-- ----------------------------------------------------------------------------
--  No se abre un UPDATE sobre `empleados` porque la misma política dejaría
--  tocar `rol` y `activo`. La función sólo toca `nombre` y sólo la fila de
--  `auth.uid()`.

CREATE OR REPLACE FUNCTION actualizar_mi_nombre(nuevo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    limpio text := btrim(coalesce(nuevo, ''));
BEGIN
    IF limpio = '' THEN
        RAISE EXCEPTION 'El nombre no puede estar vacío';
    END IF;

    IF char_length(limpio) > 80 THEN
        RAISE EXCEPTION 'El nombre no puede superar los 80 caracteres';
    END IF;

    UPDATE empleados
       SET nombre = limpio
     WHERE id = auth.uid();

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No hay un empleado asociado al usuario actual';
    END IF;
END $$;

COMMENT ON FUNCTION actualizar_mi_nombre(text) IS
'Cambia el nombre del empleado logueado. Es el único dato editable por un usuario consulta.';

REVOKE ALL ON FUNCTION actualizar_mi_nombre(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION actualizar_mi_nombre(text) FROM anon;
GRANT EXECUTE ON FUNCTION actualizar_mi_nombre(text) TO authenticated;


-- ============================================================================
--  DESPUÉS DE APLICAR
-- ============================================================================
--
--  1. Correr `40b_verificacion.sql` y revisar que ninguna política de INSERT o
--     UPDATE quede con `with_check = true`.
--  2. Probar en la app:
--       · admin → Cargar datos sigue funcionando.
--       · consulta → Guardar el nombre en Configuración ahora persiste.
--       · consulta → cualquier intento de escritura directa por la API da 401.
--  3. Si algo falla, el rollback es volver a correr el 04, el 22, el 23, el 33
--     y el 34 (no editar este archivo).
-- ============================================================================
