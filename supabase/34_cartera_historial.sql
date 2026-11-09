-- ============================================================================
--  Histórico de la cartera
--
--  La cartera (supervisores_cartera, cliente_alcohol, cliente_producto y
--  clientes_operativa) es una FOTO del archivo del cliente: no tiene período.
--  Cada carga la reemplaza completa. Sin este histórico, la foto anterior se
--  pierde y no se puede responder "¿quién tenía a este cliente en septiembre?".
--
--  Cómo funciona: ANTES de borrar, el importador copia la cartera vigente acá,
--  en una fila por cliente y por carga. Las pantallas siguen leyendo las tablas
--  actuales (no cambia ninguna consulta); este histórico es sólo de consulta.
--
--  Una tabla ancha en vez de copiar las cuatro: reconstruir cualquier vista
--  (cartera, alcohol, marcas, operativa) es un SELECT sobre una sola tabla y
--  cada carga suma ~3.000 filas, no 35.000.
--
--  `id_importacion` apunta a la carga que archivó esta foto. `fecha_carga` es
--  el momento del respaldo, para poder ordenar aunque falte el registro.
--
--  ── Orden de ejecución ────────────────────────────────────────────────────
--  Requiere `33_importaciones.sql` aplicado antes (por la clave foránea).
--
--  Ejecutar en el SQL Editor de supabase.com. Se puede re-ejecutar.
-- ============================================================================


CREATE TABLE IF NOT EXISTS cartera_historial (
    id_historial       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    id_importacion     bigint NULL
                       REFERENCES importaciones (id_importacion) ON DELETE SET NULL,

    fecha_carga        timestamptz NOT NULL DEFAULT now(),

    codigo_cliente     text NOT NULL,

    id_supervisor      integer NULL
                       REFERENCES supervisores (id_supervisor) ON DELETE SET NULL,
    -- El nombre se copia aparte a propósito: si mañana se borra el supervisor,
    -- la foto histórica tiene que seguir diciendo quién era.
    nombre_supervisor  text,

    codigo_encargado   text,
    nombre_encargado   text,

    flag_estado        text,
    subcanal           text,
    tier               text,
    visitas            text[] NOT NULL DEFAULT '{}',
    tarea_redbull      boolean NOT NULL DEFAULT false,
    tarea_laton        boolean NOT NULL DEFAULT false,
    tarea_cvza         boolean NOT NULL DEFAULT false,

    -- Nombres de las marcas con `compro = true` en la foto.
    marcas             text[] NOT NULL DEFAULT '{}'
);

COMMENT ON TABLE cartera_historial IS
'Foto de la cartera antes de cada reemplazo. Una fila por cliente y por carga.';

CREATE INDEX IF NOT EXISTS idx_cartera_historial_importacion
    ON cartera_historial (id_importacion);
CREATE INDEX IF NOT EXISTS idx_cartera_historial_cliente
    ON cartera_historial (codigo_cliente);
CREATE INDEX IF NOT EXISTS idx_cartera_historial_fecha
    ON cartera_historial (fecha_carga DESC);


-- ----------------------------------------------------------------------------
--  RLS — mismo patrón que el resto de las tablas de negocio:
--    SELECT / INSERT / UPDATE → cualquier autenticado
--    DELETE                   → sólo admin
-- ----------------------------------------------------------------------------

ALTER TABLE cartera_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cartera_historial_select ON cartera_historial;
CREATE POLICY cartera_historial_select ON cartera_historial
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS cartera_historial_insert ON cartera_historial;
CREATE POLICY cartera_historial_insert ON cartera_historial
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS cartera_historial_update ON cartera_historial;
CREATE POLICY cartera_historial_update ON cartera_historial
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS cartera_historial_delete ON cartera_historial;
CREATE POLICY cartera_historial_delete ON cartera_historial
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM empleados e WHERE e.id = auth.uid() AND e.rol = 'admin')
    );
