-- ============================================================================
--  fn_clientes devuelve jsonb para no perder clientes
--
--  Qué pasaba: con los datos reales hay 1.542 clientes y la función devolvía
--  exactamente 1.000 filas. El corte lo hace `db-max-rows` de PostgREST (1.000
--  por defecto en Supabase Cloud), NO el SQL: un `LIMIT` mayor no sirve porque
--  el motor nunca ve más de 1.000.
--
--  Consecuencia: la página de Clientes mostraba los 1.000 con más venta y
-- _callaba_ los 542 restantes, sin ningún error visible. Y como el orden es por
--  venta descendente, los que faltan son los que no compran o compran poco: es
--  justo el grupo que se necesita para el filtro Activo/Inactivo.
--
--  Mismo arreglo que el catálogo (ver 18_catalogo_jsonb.sql): devolver UNA fila
--  con la lista completa adentro. 1 fila nunca se trunca.
--
--  Requiere DROP: Postgres no deja cambiar el tipo de retorno.
-- ============================================================================


DROP FUNCTION IF EXISTS public.fn_clientes(
    integer, integer, integer, integer, integer, integer, text, integer
);


CREATE OR REPLACE FUNCTION fn_clientes(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT * FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio
        )
    ),
    -- Último período con ventas en toda la base, sin filtros. Agrupar y ordenar
    -- por el par (anio, mes): con MAX(anio) y MAX(mes) por separado, al cruzar
    -- el cambio de año se armaría un período que no existe.
    ultimo_periodo AS (
        SELECT anio, mes FROM v_ventas_detalle
        GROUP BY anio, mes ORDER BY anio DESC, mes DESC LIMIT 1
    ),
    por_cliente AS (
        SELECT
            id_cliente,
            SUM(importe_bruto)    AS ventas_total,
            SUM(importe_neto)     AS ventas_neto,
            SUM(cantidad_bultos)  AS bultos,
            SUM(cantidad_hl)      AS hl,
            COUNT(DISTINCT id_encargado_venta) AS encargados,
            MAX(anio * 100 + mes)  AS ultima_venta
        FROM f
        GROUP BY id_cliente
    ),
    activos AS (
        SELECT DISTINCT v.id_cliente
        FROM v_ventas_detalle v
        JOIN ultimo_periodo u ON u.anio = v.anio AND u.mes = v.mes
    ),
    -- LEFT JOIN contra el agregado: un cliente sin ventas en el período
    -- filtrado aparece con 0 en vez de desaparecer de la lista.
    base AS (
        SELECT
            c.id_cliente,
            c.codigo_cliente,
            c.razon_social,
            c.nombre_fantasia,
            c.id_localidad,
            l.nombre AS localidad_nombre,
            COALESCE(pc.ventas_total, 0) AS ventas_total,
            COALESCE(pc.ventas_neto, 0)  AS ventas_neto,
            COALESCE(pc.bultos, 0)       AS bultos,
            COALESCE(pc.hl, 0)           AS hl,
            COALESCE(pc.encargados, 0)   AS encargado_count,
            CASE WHEN pc.ultima_venta IS NULL THEN NULL
                 ELSE to_char(pc.ultima_venta / 100, 'FM0000') || '-' ||
                      to_char(pc.ultima_venta % 100, 'FM00')
            END AS ultima_venta,
            (a.id_cliente IS NOT NULL)   AS activo
        FROM clientes c
        LEFT JOIN por_cliente pc ON pc.id_cliente = c.id_cliente
        LEFT JOIN localidades l  ON l.id_localidad = c.id_localidad
        LEFT JOIN activos a      ON a.id_cliente = c.id_cliente
    )
    SELECT COALESCE((
        SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ventas_total DESC, b.razon_social)
        FROM base b
    ), '[]'::jsonb);
$$;


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------
--  Tiene que devolver 1 sola fila, y el array debe tener los 1.542 clientes.

SELECT jsonb_array_length(fn_clientes()) AS clientes;

SELECT jsonb_array_length(fn_clientes(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 29)) AS clientes_un29;

-- Los primeros, para ver el formato.
SELECT e ->> 'razon_social' AS cliente,
       e ->> 'ventas_total'  AS ventas,
       e ->> 'activo'        AS activo
FROM jsonb_array_elements(fn_clientes()) e
LIMIT 3;