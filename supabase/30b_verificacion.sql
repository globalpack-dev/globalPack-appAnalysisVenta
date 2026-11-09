-- ============================================================================
--  Verificación del archivo 30
--
--  Va APARTE a propósito: el SQL Editor envuelve todo en una transacción, así
--  que si una consulta de control falla, revierte también el DDL del archivo
--  30. Con las verificaciones en su propio archivo, un error acá no tira abajo
--  el trabajo.
--
--  Ejecutar DESPUÉS de `30_operativos.sql` y de la carga del script
--  `npx tsx scripts/cargar-promotores.ts --aplicar` (que llena la tabla).
--
--  Los números esperados están comentados en cada consulta.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Clientes operativos por supervisor
-- ----------------------------------------------------------------------------
--      NACUL SOL          1373
--      FERNANDEZ EDUARDO  1610
SELECT c ->> 'promotor' AS promotor, COUNT(*) AS clientes
FROM jsonb_array_elements(fn_operativos(NULL)) AS c
GROUP BY c ->> 'promotor'
ORDER BY clientes DESC;


-- ----------------------------------------------------------------------------
--  2. Todos los clientes tienen día de visita
-- ----------------------------------------------------------------------------
--  El Excel trae VISITA en las 2.983 filas. Tiene que dar 0.
SELECT COUNT(*) AS sin_visita
FROM jsonb_array_elements(fn_operativos(NULL)) AS c
WHERE jsonb_array_length(c -> 'visitas') = 0;


-- ----------------------------------------------------------------------------
--  3. Los 9 combos de visita
-- ----------------------------------------------------------------------------
--    MIE 448 | MAR 410 | LUN 358 | JUE 354 | VIE 348
--    LUN JUE 336 | MAR VIE 307 | MIE SAB 251 | SAB 171
--
--  Se agrupa por el array tal cual: el resultado se lee como ["LUN","JUE"].
SELECT (c ->> 'visitas') AS visita, COUNT(*) AS clientes
FROM jsonb_array_elements(fn_operativos(NULL)) AS c
GROUP BY c ->> 'visitas'
ORDER BY clientes DESC;


-- ----------------------------------------------------------------------------
--  4. Las tareas pendientes por familia
-- ----------------------------------------------------------------------------
--      720 RED BULL · 627 LATON QUILMES · 322 CVZA
SELECT
    COUNT(*) FILTER (WHERE (c ->> 'tarea_redbull')::boolean) AS red_bull,
    COUNT(*) FILTER (WHERE (c ->> 'tarea_laton')::boolean)   AS laton_quilmes,
    COUNT(*) FILTER (WHERE (c ->> 'tarea_cvza')::boolean)    AS cvza
FROM jsonb_array_elements(fn_operativos(NULL)) AS c;


-- ----------------------------------------------------------------------------
--  5. El filtro por promotor devuelve el tamaño de su cartera
-- ----------------------------------------------------------------------------
--  FERNANDEZ MARTIN (id 68) tiene 68 clientes en el archivo.
SELECT COUNT(*) AS de_fernandez_martin
FROM jsonb_array_elements(fn_operativos(NULL, 68)) AS c;


-- ----------------------------------------------------------------------------
--  6. El filtro por supervisor coincide con la tarjeta de la cartera
-- ----------------------------------------------------------------------------
--  NACUL SOL (id 36) tiene 1.373 clientes en `fn_supervisores_cartera`.
SELECT
    (SELECT COUNT(*) FROM jsonb_array_elements(fn_operativos(36)) AS c)                  AS de_operativos,
    (SELECT clientes FROM fn_supervisores_cartera() WHERE id_supervisor = 36)            AS de_la_tarjeta;
