-- ============================================================================
--  Auditoría de importaciones
--
--  Guarda una fila por cada carga hecha desde "Cargar datos". Sirve para saber
--  quién subió qué archivo, cuándo y con qué resultado, sin depender de la
--  consola del navegador ni de los logs de Supabase.
--
--  Se escribe desde la app con la sesión del usuario (no con `service_role`):
--  el importador abre la fila al empezar y la cierra al terminar.
--
--  Estados:
--    en_curso → la carga empezó
--    ok       → terminó bien
--    error    → se cortó; `error` guarda el mensaje
--
--  `detalle` es jsonb libre (conteos por supervisor, flags, etc.). No se usa
--  para consultas: es contexto para revisar una carga puntual.
--
--  ── Orden de ejecución ────────────────────────────────────────────────────
--  Ejecutar ESTE archivo antes de `34_cartera_historial.sql`, que lo referencia.
--
--  Ejecutar en el SQL Editor de supabase.com. Se puede re-ejecutar.
-- ============================================================================


CREATE TABLE IF NOT EXISTS importaciones (
    id_importacion     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    usuario            uuid NULL DEFAULT auth.uid()
                       REFERENCES empleados (id) ON DELETE SET NULL,

    tipo               text NOT NULL
                       CHECK (tipo IN ('ventas', 'supervisores', 'promotores')),

    archivo            text NOT NULL,

    estado             text NOT NULL DEFAULT 'en_curso'
                       CHECK (estado IN ('en_curso', 'ok', 'error')),

    filas_ok           integer NOT NULL DEFAULT 0,
    filas_descartadas  integer NOT NULL DEFAULT 0,

    error              text,

    detalle            jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at         timestamptz NOT NULL DEFAULT now(),
    finalizado_en      timestamptz
);

COMMENT ON TABLE importaciones IS
'Una fila por carga desde "Cargar datos": quién, qué archivo, cuándo y cómo terminó.';

CREATE INDEX IF NOT EXISTS idx_importaciones_fecha
    ON importaciones (created_at DESC);


-- ----------------------------------------------------------------------------
--  RLS — mismo patrón que el resto de las tablas de negocio:
--    SELECT / INSERT / UPDATE → cualquier autenticado
--    DELETE                   → sólo admin
--
--  El INSERT exige que `usuario` sea el usuario de la sesión: nadie puede
--  registrar una carga a nombre de otro.
-- ----------------------------------------------------------------------------

ALTER TABLE importaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS importaciones_select ON importaciones;
CREATE POLICY importaciones_select ON importaciones
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS importaciones_insert ON importaciones;
CREATE POLICY importaciones_insert ON importaciones
    FOR INSERT TO authenticated
    WITH CHECK (usuario IS NULL OR usuario = auth.uid());

DROP POLICY IF EXISTS importaciones_update ON importaciones;
CREATE POLICY importaciones_update ON importaciones
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS importaciones_delete ON importaciones;
CREATE POLICY importaciones_delete ON importaciones
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM empleados e WHERE e.id = auth.uid() AND e.rol = 'admin')
    );
