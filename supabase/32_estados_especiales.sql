-- ============================================================================
--  32_estados_especiales.sql — BAJA y CONSUMO PERSONAL
--
--  La columna "FLAG ALCOHOL" del archivo de promotores no es un sí/no: trae
--  cuatro valores reales.
--
--      SI               2.081   cliente de alcohol (es_alcohol = true)
--      NO                 494   no es cliente de alcohol
--      CONSUMO PERSONAL   127   compra para consumo propio, no para reventa
--      BAJA                14   dado de baja / ya no se visita
--
--  (Los vacíos y los "0" del archivo se cargan como NO.)
--
--  Hasta ahora el cargador hacía `startsWith('S')`, así que BAJA y CONSUMO
--  PERSONAL se perdían como "NO". Acá se guarda el valor textual y se expone
--  en las dos funciones de actividad.
--
--  ── Lo que NO cambia ──────────────────────────────────────────────────────
--
--  `es_alcohol` sigue siendo sólo el SI. Penetración, público de alcohol,
--  oportunidad y la matriz por marca no se tocan: los 141 clientes nuevos son
--  una capa informativa, no entran en esos denominadores.
--
--  Lo que sí cambia:
--
--    · `oportunidad` nunca incluye BAJA ni CONSUMO PERSONAL (no son SI, así
--      que la definición ya los dejaba afuera).
--    · `faltantes` queda vacío para BAJA y CONSUMO PERSONAL: no corresponde
--      ofrecerles marcas.
--
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS de 31_actividad.sql.
--  Después, recargar: `npx tsx scripts/cargar-promotores.ts --aplicar`.
--  Los controles están en `32b_verificacion.sql`.
--
--  Este archivo se puede volver a correr entero sin efectos secundarios.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. El valor textual del FLAG ALCOHOL
-- ----------------------------------------------------------------------------

ALTER TABLE cliente_alcohol
    ADD COLUMN IF NOT EXISTS flag_estado text NOT NULL DEFAULT 'NO';

ALTER TABLE cliente_alcohol
    DROP CONSTRAINT IF EXISTS cliente_alcohol_flag_estado_check;
ALTER TABLE cliente_alcohol
    ADD CONSTRAINT cliente_alcohol_flag_estado_check
    CHECK (flag_estado IN ('SI', 'NO', 'CONSUMO_PERSONAL', 'BAJA'));

COMMENT ON COLUMN cliente_alcohol.flag_estado IS
    'Valor textual del FLAG ALCOHOL del archivo: SI, NO, CONSUMO_PERSONAL o BAJA.';

-- Puente para las filas que ya existen: lo que estaba en SI sigue en SI.
-- Los BAJA y CONSUMO PERSONAL aparecen con la próxima carga del archivo.
UPDATE cliente_alcohol
SET flag_estado = 'SI'
WHERE es_alcohol AND flag_estado <> 'SI';


-- ----------------------------------------------------------------------------
--  2. fn_operativos — agrega el estado a la capa operativa
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_operativos(
    p_supervisor integer DEFAULT NULL,
    p_encargado integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT COALESCE((
        SELECT jsonb_agg(to_jsonb(f) ORDER BY f.codigo_cliente)
        FROM (
            SELECT
                co.codigo_cliente,
                co.id_encargado_venta,
                COALESCE(s.nombre_completo, 'Sin supervisor asignado') AS promotor,
                COALESCE(co.visitas, '{}') AS visitas,
                co.subcanal,
                co.tier,
                co.tarea_redbull,
                co.tarea_laton,
                co.tarea_cvza,
                COALESCE(ca.flag_estado, 'NO')                          AS flag_estado,
                (COALESCE(ca.flag_estado, 'NO') = 'BAJA')               AS es_baja,
                (COALESCE(ca.flag_estado, 'NO') = 'CONSUMO_PERSONAL')   AS consumo_personal
            FROM clientes_operativa co
            LEFT JOIN supervisores_cartera sc ON sc.codigo_cliente = co.codigo_cliente
            LEFT JOIN supervisores s ON s.id_supervisor = sc.id_supervisor
            LEFT JOIN cliente_alcohol ca ON ca.codigo_cliente = co.codigo_cliente
            WHERE (p_supervisor IS NULL OR sc.id_supervisor = p_supervisor)
              AND (p_encargado IS NULL OR co.id_encargado_venta = p_encargado)
        ) f
    ), '[]'::jsonb);
$$;


-- ----------------------------------------------------------------------------
--  3. fn_actividad_promotor — agrega el estado y limpia los faltantes
-- ----------------------------------------------------------------------------

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
                COALESCE(ca.flag_estado, 'NO')               AS flag_estado,
                (COALESCE(ca.flag_estado, 'NO') = 'BAJA')              AS es_baja,
                (COALESCE(ca.flag_estado, 'NO') = 'CONSUMO_PERSONAL')  AS consumo_personal,
                (COALESCE(k.compradas_alcohol, 0) > 0)       AS compro_algo,
                COALESCE(k.compradas, 0)                     AS compradas,
                COALESCE(k.compradas_alcohol, 0)             AS compradas_alcohol,
                COALESCE(k.compras, '[]'::jsonb)             AS compras,
                CASE
                    -- Ni las bajas ni el consumo propio reciben recomendación.
                    WHEN COALESCE(ca.flag_estado, 'NO') IN ('BAJA', 'CONSUMO_PERSONAL')
                        THEN '[]'::jsonb
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
