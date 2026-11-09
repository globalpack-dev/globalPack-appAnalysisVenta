-- ============================================================================
--  Verificación del archivo 32 (BAJA y CONSUMO PERSONAL)
--
--  Va APARTE a propósito: el SQL Editor envuelve todo en una transacción, así
--  que si una consulta de control falla, revierte también el DDL de arriba.
--
--  Ejecutar DESPUÉS de `32_estados_especiales.sql` y de la recarga:
--      npx tsx scripts/cargar-promotores.ts --aplicar
--
--  Los números esperados están comentados en cada consulta.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Los valores del FLAG ALCOHOL quedaron cargados
-- ----------------------------------------------------------------------------
--  Esperado: SI 2.081 · NO 761 · CONSUMO_PERSONAL 127 · BAJA 14
--  (NO incluye los 494 "NO" + 263 vacíos + 4 ceros del archivo.)
SELECT flag_estado, COUNT(*) AS clientes
FROM cliente_alcohol
GROUP BY flag_estado
ORDER BY clientes DESC;


-- ----------------------------------------------------------------------------
--  2. Las dos funciones exponen el estado
-- ----------------------------------------------------------------------------
--  Tiene que devolver 0 filas: ningún cliente sin `es_baja` o
--  `consumo_personal` en el JSON.
WITH todos AS (
    SELECT jsonb_array_elements(fn_actividad_promotor(id_encargado_venta)) AS c
    FROM (
        SELECT DISTINCT id_encargado_venta
        FROM clientes_operativa
        WHERE id_encargado_venta IS NOT NULL
    ) e
)
SELECT c
FROM todos
WHERE (c ->> 'es_baja') IS NULL
   OR (c ->> 'consumo_personal') IS NULL
   OR (c ->> 'flag_estado') IS NULL;


-- ----------------------------------------------------------------------------
--  3. Los totales: 14 bajas y 127 de consumo personal
-- ----------------------------------------------------------------------------
WITH todos AS (
    SELECT jsonb_array_elements(fn_actividad_promotor(id_encargado_venta)) AS c
    FROM (
        SELECT DISTINCT id_encargado_venta
        FROM clientes_operativa
        WHERE id_encargado_venta IS NOT NULL
    ) e
)
SELECT
    COUNT(*) FILTER (WHERE (c ->> 'es_baja')::boolean)          AS bajas,
    COUNT(*) FILTER (WHERE (c ->> 'consumo_personal')::boolean) AS consumo_personal
FROM todos;


-- ----------------------------------------------------------------------------
--  4. Ni las bajas ni el consumo propio son oportunidad ni reciben oferta
-- ----------------------------------------------------------------------------
--  Tiene que devolver 0 filas.
WITH todos AS (
    SELECT jsonb_array_elements(fn_actividad_promotor(id_encargado_venta)) AS c
    FROM (
        SELECT DISTINCT id_encargado_venta
        FROM clientes_operativa
        WHERE id_encargado_venta IS NOT NULL
    ) e
)
SELECT c
FROM todos
WHERE (c ->> 'flag_estado') IN ('BAJA', 'CONSUMO_PERSONAL')
  AND ((c ->> 'oportunidad')::boolean
       OR jsonb_array_length(c -> 'faltantes') > 0);


-- ----------------------------------------------------------------------------
--  5. La oportunidad sigue siendo 640 (no la movió ningún estado nuevo)
-- ----------------------------------------------------------------------------
WITH todos AS (
    SELECT jsonb_array_elements(fn_actividad_promotor(id_encargado_venta)) AS c
    FROM (
        SELECT DISTINCT id_encargado_venta
        FROM clientes_operativa
        WHERE id_encargado_venta IS NOT NULL
    ) e
)
SELECT COUNT(*) FILTER (WHERE (c ->> 'oportunidad')::boolean) AS oportunidad
FROM todos;


-- ----------------------------------------------------------------------------
--  6. Un ejemplo de cada estado, para ver el formato real
-- ----------------------------------------------------------------------------
WITH todos AS (
    SELECT jsonb_array_elements(fn_actividad_promotor(id_encargado_venta)) AS c
    FROM (
        SELECT DISTINCT id_encargado_venta
        FROM clientes_operativa
        WHERE id_encargado_venta IS NOT NULL
    ) e
)
SELECT jsonb_pretty(c)
FROM todos
WHERE (c ->> 'flag_estado') IN ('BAJA', 'CONSUMO_PERSONAL')
LIMIT 2;
