-- ============================================================================
--  Datos operativos por cliente: visitas, tareas, subcanal, tier
--
--  Complementa el archivo "base de sectores (promotores).xlsx" (el que ahora es
--  la fuente de verdad de la supervisión) con la capa operativa que todavía no
--  estaba en la base y que la pantalla de Promotores necesita para el panel
--  "Ver actividad":
--
--    · visitas            → días de visita: 'LUN', 'JUE', 'LUN JUE', 'MAR VIE',
--                           'MIE SAB', etc. (9 combinaciones posibles).
--    · subcanal           → subcanal comercial del cliente.
--    · tier               → 'A' o 'B' (el Excel marca el tier con 'SI').
--    · id_encargado_venta → el promotor del cliente según ESTE archivo, no
--                           según la carga vieja de ventas.
--    · tareas             → tareas pendientes por familia: RED BULL, LATON
--                           QUILMES y CVZA. En el Excel la celda dice 'TAREA'.
--
--  No toca la cartera ni la definición de alcohol: es una capa más.
--
--  ── Por qué la función devuelve jsonb ─────────────────────────────────────
--
--  Un supervisor tiene hasta 1.610 clientes y PostgREST corta las respuestas
--  de tabla a 1.000 filas (`db-max-rows`). Igual que `fn_cartera_clientes`, la
--  función devuelve UN objeto jsonb con el array adentro: así nunca se trunca.
--
--  Este archivo se puede volver a correr entero sin efectos secundarios.
--  Ejecutar en el SQL Editor de supabase.com.
--
--  ── Verificación ──────────────────────────────────────────────────────────
--
--  Las consultas de control están en `30b_verificacion.sql`, aparte.
--  Motivo: el SQL Editor envuelve todo el archivo en UNA transacción, así que
--  un error en una consulta de control revertiría también el DDL de arriba.
-- ============================================================================

CREATE TABLE IF NOT EXISTS clientes_operativa (
    codigo_cliente text PRIMARY KEY REFERENCES clientes (codigo_cliente) ON DELETE CASCADE,
    id_encargado_venta integer REFERENCES encargados_ventas (id_encargado_venta) ON DELETE SET NULL,
    visitas text[] NOT NULL DEFAULT '{}',
    subcanal text,
    tier text,
    tarea_redbull boolean NOT NULL DEFAULT false,
    tarea_laton boolean NOT NULL DEFAULT false,
    tarea_cvza boolean NOT NULL DEFAULT false
);

-- ----------------------------------------------------------------------------
--  1. fn_operativos — la capa operativa de los clientes
--
--     Filtros opcionales:
--       p_supervisor → todos los clientes de ese supervisor
--       p_encargado  → los de ese promotor (el panel "Ver actividad")
--       ambos NULL   → todos
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
                co.tarea_cvza
            FROM clientes_operativa co
            LEFT JOIN supervisores_cartera sc ON sc.codigo_cliente = co.codigo_cliente
            LEFT JOIN supervisores s ON s.id_supervisor = sc.id_supervisor
            WHERE (p_supervisor IS NULL OR sc.id_supervisor = p_supervisor)
              AND (p_encargado IS NULL OR co.id_encargado_venta = p_encargado)
        ) f
    ), '[]'::jsonb);
$$;
