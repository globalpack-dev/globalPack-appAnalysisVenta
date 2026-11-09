-- ============================================================================
--  fn_actividad_promotor — la lista de trabajo de un promotor
--
--  Es la consulta del panel "Ver actividad" de la pantalla de Promotores: para
--  un promotor (encargado de venta), devuelve sus clientes con todo lo que
--  hace falta para decidir la visita:
--
--    · visitas / subcanal / tier   → cuándo ir y cómo está segmentado
--    · tareas pendientes           → qué quedó por hacer (RED BULL, LATÓN, CVZA)
--    · es_alcohol / compras        → si ya compró y qué marcas
--    · faltantes                   → las marcas de alcohol que le faltan
--    · oportunidad                 → cliente de alcohol que no compró alcohol
--
--  ── La definición de "compró" no se repite acá ────────────────────────────
--
--  Se copia exactamente la de `fn_cartera_clientes` (27_alcohol_ico.sql):
--
--    · compras           → nombres de las 9 marcas del archivo que compró
--    · compradas_alcohol → cuántas de las 6 alcohólicas compró
--    · faltantes         → marcas alcohólicas que le faltan (sólo si es
--                          público de alcohol: flag o ya compró alguna)
--    · oportunidad       → es_alcohol AND compradas_alcohol = 0
--
--  Si mañana cambia la definición, cambia en los dos lados. No hay una tercera
--  versión escondida acá.
--
--  ── Por qué devuelve jsonb ────────────────────────────────────────────────
--
--  Mismo motivo que `fn_cartera_clientes` y `fn_operativos`: PostgREST corta
--  las respuestas de tabla a 1.000 filas (`db-max-rows`). Hoy el promotor más
--  grande tiene 238 clientes, pero el patrón no depende de ese número.
--
--  El filtro es por `id_encargado_venta`, que en `clientes_operativa` viene del
--  archivo de promotores (fuente de verdad actual), no de la carga vieja de
--  ventas.
--
--  Este archivo se puede volver a correr entero sin efectos secundarios.
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS de 30_operativos.sql.
--
--  ── Verificación ──────────────────────────────────────────────────────────
--
--  Las consultas de control están en `31b_verificacion.sql`, aparte. Motivo:
--  el SQL Editor envuelve todo el archivo en UNA transacción, así que un error
--  en una consulta de control revertiría también el DDL de arriba.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_actividad_promotor(p_encargado integer)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH compras AS (
        SELECT
            cp.codigo_cliente,
            COUNT(*) FILTER (WHERE cp.compro) AS compradas,
            COUNT(*) FILTER (WHERE cp.compro AND ma.es_alcoholica) AS compradas_alcohol,
            COALESCE(
                jsonb_agg(m.nombre ORDER BY m.nombre) FILTER (WHERE cp.compro),
                '[]'::jsonb
            ) AS compras,
            COALESCE(
                jsonb_agg(m.nombre ORDER BY m.nombre)
                    FILTER (WHERE NOT cp.compro AND ma.es_alcoholica),
                '[]'::jsonb
            ) AS faltantes_alc
        FROM cliente_producto cp
        JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
        JOIN marcas m ON m.id_marca = cp.id_marca
        WHERE cp.codigo_cliente IN (
            SELECT codigo_cliente FROM clientes_operativa
            WHERE id_encargado_venta = p_encargado
        )
        GROUP BY cp.codigo_cliente
    )
    SELECT COALESCE((
        SELECT jsonb_agg(
            to_jsonb(f)
            ORDER BY f.oportunidad DESC,
                     (f.tarea_redbull OR f.tarea_laton OR f.tarea_cvza) DESC,
                     f.razon_social
        )
        FROM (
            SELECT
                co.codigo_cliente,
                COALESCE(cl.razon_social, co.codigo_cliente) AS razon_social,
                cl.nombre_fantasia,
                l.nombre                                     AS localidad_nombre,
                COALESCE(co.visitas, '{}')                   AS visitas,
                co.subcanal,
                co.tier,
                co.tarea_redbull,
                co.tarea_laton,
                co.tarea_cvza,
                -- El FLAG del archivo: "es cliente de alcohol".
                COALESCE(ca.es_alcohol, false)               AS es_alcohol,
                (COALESCE(k.compradas_alcohol, 0) > 0)       AS compro_algo,
                COALESCE(k.compradas, 0)                     AS compradas,
                COALESCE(k.compradas_alcohol, 0)             AS compradas_alcohol,
                COALESCE(k.compras, '[]'::jsonb)             AS compras,
                CASE
                    WHEN COALESCE(ca.es_alcohol, false)
                      OR COALESCE(k.compradas_alcohol, 0) > 0
                        THEN COALESCE(k.faltantes_alc, '[]'::jsonb)
                    ELSE '[]'::jsonb
                END                                          AS faltantes,
                -- La misma definición de oportunidad que la cartera.
                (COALESCE(ca.es_alcohol, false)
                 AND COALESCE(k.compradas_alcohol, 0) = 0)   AS oportunidad
            FROM clientes_operativa co
            LEFT JOIN clientes cl
                ON cl.codigo_cliente = co.codigo_cliente
            LEFT JOIN localidades l
                ON l.id_localidad = cl.id_localidad
            LEFT JOIN cliente_alcohol ca
                ON ca.codigo_cliente = co.codigo_cliente
            LEFT JOIN compras k
                ON k.codigo_cliente = co.codigo_cliente
            WHERE co.id_encargado_venta = p_encargado
        ) f
    ), '[]'::jsonb);
$$;
