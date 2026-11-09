-- ============================================================================
--  Tipos de importación: de tres a dos
--
--  `33_importaciones.sql` declaró el CHECK con tres tipos:
--
--      ('ventas', 'supervisores', 'promotores')
--
--  El cliente aclaró que «promotores» y «supervisores» son el mismo archivo en
--  distinto momento, no dos cargas distintas. El importador ahora usa un solo
--  tipo, `cartera`, así que el CHECK tiene que aceptarlo.
--
--  ── Por qué se hace en dos pasos ─────────────────────────────────────────
--  Primero se quita el CHECK viejo, después se migran las filas históricas (si
--  hubiera alguna) y recién al final se agrega el nuevo. Si se agregara antes,
--  las filas con los valores viejos no pasarían la validación.
--
--  ── Orden de ejecución ────────────────────────────────────────────────────
--  Ejecutar DESPUÉS de `33_importaciones.sql` y `34_cartera_historial.sql`.
--  Se puede re-ejecutar: el DROP es condicional y el ADD se ignora si ya existe.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- 1. Quitar el CHECK anterior (Postgres lo nombró solo, sin nombre explícito).
ALTER TABLE importaciones
    DROP CONSTRAINT IF EXISTS importaciones_tipo_check;


-- 2. Migrar las filas históricas a los dos tipos nuevos.
--    Como no hubo cargas reales antes de este cambio, normalmente no afecta a
--    ninguna fila; se deja por si la tabla ya tiene registros.
UPDATE importaciones
   SET tipo = 'cartera'
 WHERE tipo IN ('supervisores', 'promotores');


-- 3. Nuevo CHECK con dos tipos.
ALTER TABLE importaciones
    DROP CONSTRAINT IF EXISTS importaciones_tipo_check;
ALTER TABLE importaciones
    ADD CONSTRAINT importaciones_tipo_check
    CHECK (tipo IN ('ventas', 'cartera'));

COMMENT ON COLUMN importaciones.tipo IS
'Qué archivo se cargó: ventas o cartera (promotores y supervisores son el mismo archivo).';
