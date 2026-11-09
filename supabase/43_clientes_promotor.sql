-- ============================================================================
--  43 — Clientes: filtro por promotor y nombre del encargado
--
--  La pantalla de Clientes necesita dos cosas que `fn_clientes` todavía no
--  devuelve:
--
--    1. Poder listar sólo los clientes asignados a un promotor.
--    2. Mostrar el nombre de ese promotor en la columna "Promotor".
--
--  La relación cliente → promotor sale de `clientes_operativa` (archivo 30),
--  que es la cartera vigente cargada desde el Excel de promotores/supervisores.
--  NO se usa `ventas.id_encargado_venta`: ese archivo está desactualizado y un
--  cliente puede haber comprado a varios encargados históricos. El nombre sale
--  de `encargados_ventas.nombre_completo`.
--
--  `p_promotor` filtra SÓLO la lista de clientes. Las ventas agregadas siguen
--  siendo el histórico completo del cliente: si se filtra por un promotor, la
--  columna "Ventas Totales" no se recorta a lo que vendió ese promotor.
--
--  La firma cambia (8 → 9 argumentos), así que hace falta DROP previo: con
--  `CREATE OR REPLACE` quedarían las dos versiones conviviendo y PostgREST no
--  podría elegir cuál llamar.
--
--  Ejecutar en el SQL Editor de supabase.com. Después, `43b_verificacion.sql`.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fn_clientes(
    int, int, int, int, int, int, text, int
);

CREATE OR REPLACE FUNCTION public.fn_clientes(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL,
    p_promotor  int  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    -- Mismos filtros que `fn_ventas_filtradas`, pero sin joins: los indirectos
    -- van con `IN` sobre la PK de la tabla chica.
    WITH f AS (
        SELECT
            v.id_cliente,
            v.importe_bruto,
            v.importe_neto,
            v.cantidad_bultos,
            v.cantidad_hl,
            v.id_encargado_venta,
            p.anio,
            p.mes
        FROM public.ventas v
        JOIN public.periodos p ON p.id_periodo = v.id_periodo
        WHERE (p_anio      IS NULL OR p.anio = p_anio)
          AND (p_mes       IS NULL OR p.mes = p_mes)
          AND (p_cliente   IS NULL OR v.id_cliente = p_cliente)
          AND (p_localidad IS NULL OR v.id_cliente IN (
                  SELECT c.id_cliente FROM public.clientes c
                  WHERE c.id_localidad = p_localidad))
          AND (p_marca     IS NULL OR v.id_producto IN (
                  SELECT pr.id_producto FROM public.productos pr
                  WHERE pr.id_marca = p_marca))
          AND (p_encargado IS NULL OR v.id_encargado_venta = p_encargado)
          AND (p_canal     IS NULL OR v.id_clasificacion_marketing IN (
                  SELECT cm.id_clasificacion_marketing
                  FROM public.clasificaciones_marketing cm
                  WHERE cm.canal_ajustado = p_canal))
          AND (
              p_unidad_negocio IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM public.productos pr2
                  LEFT JOIN public.divisiones d2 ON d2.id_division = pr2.id_division
                  WHERE pr2.id_producto = v.id_producto
                    AND d2.id_unidad_negocio = p_unidad_negocio
              )
          )
    ),
    -- Último período con ventas en toda la base, sin filtros.
    ultimo_periodo AS (
        SELECT p.anio, p.mes
        FROM public.ventas v
        JOIN public.periodos p ON p.id_periodo = v.id_periodo
        GROUP BY p.anio, p.mes
        ORDER BY p.anio DESC, p.mes DESC
        LIMIT 1
    ),
    por_cliente AS (
        SELECT
            id_cliente,
            SUM(importe_bruto)    AS ventas_total,
            SUM(importe_neto)     AS ventas_neto,
            SUM(cantidad_bultos)  AS bultos,
            SUM(cantidad_hl)      AS hl,
            COUNT(DISTINCT id_encargado_venta) AS encargados,
            MAX(anio * 100 + mes) AS ultima_venta
        FROM f
        GROUP BY id_cliente
    ),
    activos AS (
        SELECT DISTINCT v.id_cliente
        FROM public.ventas v
        JOIN public.periodos p ON p.id_periodo = v.id_periodo
        JOIN ultimo_periodo u ON u.anio = p.anio AND u.mes = p.mes
    ),
    -- LEFT JOIN contra el agregado: un cliente sin ventas en el período
    -- filtrado aparece con 0 en vez de desaparecer de la lista.
    --
    -- El promotor sale de la cartera vigente (`clientes_operativa`), no de las
    -- ventas. Los 61 clientes que no están en la cartera quedan con NULL y la
    -- pantalla los muestra como "—".
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
            co.id_encargado_venta,
            ev.nombre_completo          AS encargado_nombre,
            CASE WHEN pc.ultima_venta IS NULL THEN NULL
                 ELSE to_char(pc.ultima_venta / 100, 'FM0000') || '-' ||
                      to_char(pc.ultima_venta % 100, 'FM00')
            END AS ultima_venta,
            (a.id_cliente IS NOT NULL)   AS activo
        FROM public.clientes c
        LEFT JOIN por_cliente pc ON pc.id_cliente = c.id_cliente
        LEFT JOIN public.localidades l ON l.id_localidad = c.id_localidad
        LEFT JOIN activos a ON a.id_cliente = c.id_cliente
        LEFT JOIN public.clientes_operativa co ON co.codigo_cliente = c.codigo_cliente
        LEFT JOIN public.encargados_ventas ev
               ON ev.id_encargado_venta = co.id_encargado_venta
        WHERE (p_promotor IS NULL OR co.id_encargado_venta = p_promotor)
    )
    SELECT COALESCE((
        SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ventas_total DESC, b.razon_social)
        FROM base b
    ), '[]'::jsonb);
$$;

COMMENT ON FUNCTION public.fn_clientes(int, int, int, int, int, int, text, int, int) IS
'Clientes con su agregado de ventas (jsonb). p_promotor filtra por la cartera vigente (clientes_operativa) y devuelve encargado_nombre (ver 43_*).';
