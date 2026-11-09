-- ============================================================================
--  Verificación del archivo 31 (fn_actividad_promotor)
--
--  Va APARTE a propósito: el SQL Editor envuelve todo en una transacción, así
--  que si una consulta de control falla, revierte también la función.
--
--  Ejecutar DESPUÉS de `31_actividad.sql` y de haber cargado `clientes_operativa`
--  (`npx tsx scripts/cargar-promotores.ts --aplicar`).
--
--  Los números esperados están comentados en cada consulta.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Cada promotor devuelve exactamente el tamaño de su cartera
-- ----------------------------------------------------------------------------
--  Los conteos de la derecha son los del archivo de promotores.
--  CASTILLO NELSON 238 · PIAZZETA 200 · PUYO 197 · ALBORNOZ 191 · SOSA 190
--  FERNANDEZ MARTIN 68 · CASTILLO JAVIER 49 · total 2.983
--
--  Tiene que devolver 0 filas.
WITH promotores AS (
    SELECT id_encargado_venta, COUNT(*) AS clientes_operativa
    FROM clientes_operativa
    WHERE id_encargado_venta IS NOT NULL
    GROUP BY id_encargado_venta
)
SELECT
    p.id_encargado_venta,
    ev.nombre_completo,
    p.clientes_operativa,
    jsonb_array_length(fn_actividad_promotor(p.id_encargado_venta)) AS clientes_actividad
FROM promotores p
JOIN encargados_ventas ev ON ev.id_encargado_venta = p.id_encargado_venta
WHERE jsonb_array_length(fn_actividad_promotor(p.id_encargado_venta))
      <> p.clientes_operativa;


-- ----------------------------------------------------------------------------
--  2. El promotor más grande: CASTILLO NELSON (id 84) = 238 clientes
-- ----------------------------------------------------------------------------
SELECT
    jsonb_array_length(fn_actividad_promotor(84)) AS castillo_nelson,
    jsonb_array_length(fn_actividad_promotor(68)) AS fernandez_martin,
    jsonb_array_length(fn_actividad_promotor(83)) AS ruiz_david;


-- ----------------------------------------------------------------------------
--  3. Los totales siguen cerrando contra la cartera
-- ----------------------------------------------------------------------------
--      clientes 2.983 · oportunidad 640 · tareas 720 / 627 / 322
WITH todos AS (
    SELECT jsonb_array_elements(fn_actividad_promotor(id_encargado_venta)) AS c
    FROM (
        SELECT DISTINCT id_encargado_venta
        FROM clientes_operativa
        WHERE id_encargado_venta IS NOT NULL
    ) e
)
SELECT
    COUNT(*)                                                        AS clientes,
    COUNT(*) FILTER (WHERE (c ->> 'oportunidad')::boolean)          AS oportunidad,
    COUNT(*) FILTER (WHERE (c ->> 'tarea_redbull')::boolean)        AS red_bull,
    COUNT(*) FILTER (WHERE (c ->> 'tarea_laton')::boolean)          AS laton_quilmes,
    COUNT(*) FILTER (WHERE (c ->> 'tarea_cvza')::boolean)           AS cvza
FROM todos;


-- ----------------------------------------------------------------------------
--  4. Todos tienen día de visita y la forma del JSON es la esperada
-- ----------------------------------------------------------------------------
--  Tiene que devolver 0 filas.
SELECT c
FROM jsonb_array_elements(fn_actividad_promotor(84)) AS c
WHERE jsonb_array_length(c -> 'visitas') = 0
   OR (c ->> 'compras') IS NULL
   OR (c ->> 'faltantes') IS NULL
   OR (c ->> 'oportunidad') IS NULL;


-- ----------------------------------------------------------------------------
--  5. Un cliente de ejemplo, para ver el formato real
-- ----------------------------------------------------------------------------
--  Prioriza oportunidad y tareas pendientes: es el orden que usa el panel.
SELECT jsonb_pretty(fn_actividad_promotor(68) -> 0);


-- ----------------------------------------------------------------------------
--  6. Los faltantes sólo existen para el público de alcohol
-- ----------------------------------------------------------------------------
--  Un cliente que no es de alcohol y no compró alcohol no puede tener
--  faltantes. Tiene que devolver 0.
WITH todos AS (
    SELECT jsonb_array_elements(fn_actividad_promotor(id_encargado_venta)) AS c
    FROM (
        SELECT DISTINCT id_encargado_venta
        FROM clientes_operativa
        WHERE id_encargado_venta IS NOT NULL
    ) e
)
SELECT COUNT(*) AS faltantes_fuera_del_publico
FROM todos
WHERE NOT (c ->> 'es_alcohol')::boolean
  AND (c ->> 'compradas_alcohol')::int = 0
  AND jsonb_array_length(c -> 'faltantes') > 0;
