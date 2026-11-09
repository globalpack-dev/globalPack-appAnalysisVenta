-- ============================================================================
--  39 — Reportes en UNA llamada y Clientes sin barrer la vista
--
--  Después del 37 (y del 38) medido sobre 25.004 ventas:
--
--    · Reportes dispara 4 RPC EN PARALELO (kpis, variaciones, serie, por_unidad)
--      y juntas saturan la CPU del plan gratuito: 4 de 4 terminan en
--      `statement timeout` a los 8,6 s, aunque solas tarden 3,3–4,2 s.
--      (Es el mismo problema que ya se había resuelto en el Dashboard con
--      `fn_dashboard_todo`, archivo 21.)
--
--    · `fn_clientes()` sin filtros seguía en 8,4 s: incluso proyectando sólo
--      8 columnas, tiene que resolver la agregación de las 25.004 filas y
--      además barrer la vista dos veces más (último período y clientes
--      activos). Con un filtro por cliente baja a 0,8 s, así que el costo es
--      el barrido completo, no la poda.
--
--  Qué hace este archivo:
--
--  1. `fn_dashboard_todo` suma `p_categoria` (al final, para no mover los
--     argumentos existentes) y se recrea. Así Reportes puede reutilizarla para
--     el "Resumen de ventas" con una sola llamada, igual que el Dashboard.
--     CAMBIA LA FIRMA: hace falta DROP previo (regla del proyecto).
--
--  2. `fn_clientes` deja de pasar por `v_ventas_detalle`: agrega directo sobre
--     `ventas` + `periodos`, que es de donde salen todas las columnas que usa.
--     Los filtros indirectos (localidad, marca, canal, unidad de negocio) se
--     resuelven con subconsultas indexadas. Misma firma y mismo `RETURNS jsonb`.
--
--  Ejecutar en el SQL Editor de supabase.com. Después, `39b_verificacion.sql`.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. fn_dashboard_todo + p_categoria
-- ----------------------------------------------------------------------------
--  Sin DROP, `CREATE OR REPLACE` dejaría la versión de 9 parámetros convivendo
--  con la de 10 y cualquier llamada quedaría ambigua.

DROP FUNCTION IF EXISTS public.fn_dashboard_todo(
    integer, integer, integer, integer, integer, integer, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.fn_dashboard_todo(
    p_anio            int  DEFAULT NULL,
    p_mes             int  DEFAULT NULL,
    p_cliente         int  DEFAULT NULL,
    p_localidad       int  DEFAULT NULL,
    p_marca           int  DEFAULT NULL,
    p_encargado       int  DEFAULT NULL,
    p_canal           text DEFAULT NULL,
    p_unidad_negocio  int  DEFAULT NULL,
    p_limite          int  DEFAULT 8,
    p_categoria       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    -- `f` se materializa UNA vez. Las ocho agregaciones leen de acá.
    WITH f AS MATERIALIZED (
        SELECT *
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
            p_unidad_negocio, p_categoria
        )
    ),
    -- Cada venta con el nombre de su cliente y el de su localidad, para no
    -- volver a pegarse a esas tablas en cada agregación. `v_ventas_detalle`
    -- resuelve el cliente pero NO la localidad: esa vive en `clientes`.
    f_join AS MATERIALIZED (
        SELECT f.*,
               c.id_localidad,
               c.nombre_fantasia,
               c.razon_social,
               l.nombre AS nombre_localidad
        FROM f
        JOIN clientes c    ON c.id_cliente = f.id_cliente
        LEFT JOIN localidades l ON l.id_localidad = c.id_localidad
    ),
    -- Sólo hace falta el `id_marca`, que la vista NO expone. El nombre de la
    -- marca (`marca_nombre`) ya viene resuelto en `v_ventas_detalle`, así que
    -- no hay que volver a pegarse a `marcas`: hacerlo creaba una segunda
    -- columna con el mismo nombre y Postgres rechazaba el query con
    -- "column reference marca_nombre is ambiguous".
    f_prod AS MATERIALIZED (
        SELECT f_join.*, pr.id_marca
        FROM f_join
        JOIN productos pr ON pr.id_producto = f_join.id_producto
    ),

    -- Último período con ventas en toda la base, SIN filtros. Agrupar y
    -- ordenar por el par (anio, mes): con MAX(anio) y MAX(mes) por separado, al
    -- cruzar el cambio de año se armaría un período que no existe.
    ref AS (
        SELECT anio, mes FROM v_ventas_detalle
        GROUP BY anio, mes ORDER BY anio DESC, mes DESC LIMIT 1
    ),

    -- ── 1. KPIs ─────────────────────────────────────────────────────────────
    activos AS (
        SELECT COUNT(DISTINCT f.id_cliente) AS n
        FROM f JOIN ref r ON r.anio = f.anio AND r.mes = f.mes
    ),
    kpis AS (
        SELECT to_jsonb(s) AS valor FROM (
            SELECT
                COALESCE(SUM(f.importe_neto), 0)    AS total_neto,
                COALESCE(SUM(f.importe_bruto), 0)   AS total_bruto,
                COALESCE(SUM(f.importe_final), 0)   AS total_final,
                COALESCE(SUM(f.cantidad_bultos), 0) AS total_bultos,
                COALESCE(SUM(f.cantidad_hl), 0)     AS total_hl,
                COUNT(*)                            AS operaciones,
                (SELECT n FROM activos)             AS clientes_activos,
                COUNT(DISTINCT f.id_producto)       AS productos_vendidos
            FROM f
        ) s
    ),

    -- ── 2. Variación contra el período anterior ────────────────────────────
    por_periodo AS (
        SELECT
            anio, mes,
            SUM(importe_neto) AS neto,
            SUM(importe_bruto) AS bruto,
            SUM(importe_final) AS final,
            SUM(cantidad_bultos) AS bultos,
            SUM(cantidad_hl) AS hl,
            COUNT(*) AS operaciones
        FROM f
        GROUP BY anio, mes
    ),
    ultimos AS (
        SELECT * FROM por_periodo ORDER BY anio DESC, mes DESC LIMIT 2
    ),
    variaciones AS (
        SELECT COALESCE((
            SELECT jsonb_build_object(
                'variacion_neto', CASE WHEN ref.neto_prev > 0
                    THEN ROUND(((ref.neto - ref.neto_prev) / ref.neto_prev) * 100, 1) END,
                'variacion_bruto', CASE WHEN ref.bruto_prev > 0
                    THEN ROUND(((ref.bruto - ref.bruto_prev) / ref.bruto_prev) * 100, 1) END,
                'variacion_final', CASE WHEN ref.final_prev > 0
                    THEN ROUND(((ref.final - ref.final_prev) / ref.final_prev) * 100, 1) END,
                'variacion_bultos', CASE WHEN ref.bultos_prev > 0
                    THEN ROUND(((ref.bultos - ref.bultos_prev) / ref.bultos_prev) * 100, 1) END,
                'variacion_hl', CASE WHEN ref.hl_prev > 0
                    THEN ROUND(((ref.hl - ref.hl_prev) / ref.hl_prev) * 100, 1) END,
                'variacion_operaciones', CASE WHEN ref.operaciones_prev > 0
                    THEN ROUND(((ref.operaciones - ref.operaciones_prev) / ref.operaciones_prev) * 100, 1) END,
                'anio_ref', ref.anio,
                'mes_ref', ref.mes
            )
            FROM (
                SELECT
                    MAX(CASE WHEN rn = 1 THEN neto        END) AS neto,
                    MAX(CASE WHEN rn = 1 THEN bruto       END) AS bruto,
                    MAX(CASE WHEN rn = 1 THEN final       END) AS final,
                    MAX(CASE WHEN rn = 1 THEN bultos      END) AS bultos,
                    MAX(CASE WHEN rn = 1 THEN hl          END) AS hl,
                    MAX(CASE WHEN rn = 1 THEN operaciones END) AS operaciones,
                    MAX(CASE WHEN rn = 1 THEN anio        END) AS anio,
                    MAX(CASE WHEN rn = 1 THEN mes         END) AS mes,
                    MAX(CASE WHEN rn = 2 THEN neto        END) AS neto_prev,
                    MAX(CASE WHEN rn = 2 THEN bruto       END) AS bruto_prev,
                    MAX(CASE WHEN rn = 2 THEN final       END) AS final_prev,
                    MAX(CASE WHEN rn = 2 THEN bultos      END) AS bultos_prev,
                    MAX(CASE WHEN rn = 2 THEN hl          END) AS hl_prev,
                    MAX(CASE WHEN rn = 2 THEN operaciones END) AS operaciones_prev
                FROM (
                    SELECT ultimos.*,
                           -- El ORDER BY es obligatorio: `ROW_NUMBER() OVER ()` a
                           -- secas numera en el orden del plan y la variación
                           -- saldría al revés.
                           ROW_NUMBER() OVER (ORDER BY anio DESC, mes DESC) AS rn
                    FROM ultimos
                ) t
            ) ref
        ), 'null'::jsonb) AS valor
    ),

    -- ── 3. Serie mensual ───────────────────────────────────────────────────
    serie AS (
        SELECT COALESCE((
            SELECT jsonb_agg(to_jsonb(s) ORDER BY s.anio, s.mes)
            FROM (
                SELECT
                    anio, mes,
                    MIN(nombre_mes)                          AS nombre_mes,
                    LEFT(MIN(nombre_mes), 3)                 AS mes_corto,
                    SUM(importe_neto)                       AS importe_neto,
                    SUM(importe_bruto)                      AS importe_bruto,
                    SUM(importe_final)                      AS importe_final,
                    SUM(cantidad_bultos)                    AS cantidad_bultos,
                    SUM(cantidad_hl)                        AS cantidad_hl
                FROM f GROUP BY anio, mes
            ) s
        ), '[]'::jsonb) AS valor
    ),

    -- ── 4. Top clientes ────────────────────────────────────────────────────
    agg_clientes AS (
        SELECT
            id_cliente,
            COALESCE(nombre_fantasia, razon_social) AS cliente_nombre,
            SUM(importe_neto) AS ventas
        FROM f_join
        GROUP BY id_cliente, nombre_fantasia, razon_social
    ),
    top_clientes AS (
        SELECT COALESCE((
            SELECT jsonb_agg(to_jsonb(t) - 'total' ORDER BY t.ventas DESC)
            FROM (
                SELECT
                    a.id_cliente, a.cliente_nombre, a.ventas,
                    CASE WHEN SUM(a.ventas) OVER () > 0
                         THEN ROUND(a.ventas * 100 / SUM(a.ventas) OVER (), 2)
                         ELSE 0 END AS participacion,
                    SUM(a.ventas) OVER () AS total
                FROM agg_clientes a
                ORDER BY a.ventas DESC
                LIMIT p_limite
            ) t
        ), '[]'::jsonb) AS valor
    ),

    -- ── 5. Por encargado ───────────────────────────────────────────────────
    por_encargado AS (
        SELECT COALESCE((
            SELECT jsonb_agg(to_jsonb(e) ORDER BY e.ventas DESC)
            FROM (
                SELECT
                    id_encargado_venta,
                    MIN(encargado_nombre)  AS encargado_nombre,
                    MIN(supervisor_nombre) AS supervisor_nombre,
                    SUM(importe_neto)      AS ventas,
                    COUNT(DISTINCT id_cliente) AS clientes
                FROM f
                GROUP BY id_encargado_venta
                ORDER BY SUM(importe_neto) DESC
                LIMIT p_limite
            ) e
        ), '[]'::jsonb) AS valor
    ),

    -- ── 6. Por localidad ───────────────────────────────────────────────────
    por_localidad AS (
        SELECT COALESCE((
            SELECT jsonb_agg(to_jsonb(l) ORDER BY l.ventas DESC)
            FROM (
                SELECT
                    id_localidad,
                    MIN(nombre_localidad) AS localidad_nombre,
                    SUM(importe_neto)     AS ventas
                FROM f_join
                GROUP BY id_localidad
                ORDER BY SUM(importe_neto) DESC
                LIMIT p_limite
            ) l
        ), '[]'::jsonb) AS valor
    ),

    -- ── 7. Por unidad de negocio ───────────────────────────────────────────
    -- La división sale del PRODUCTO, no de la familia (ver 15_division_en_producto).
    por_unidad AS (
        SELECT COALESCE((
            SELECT jsonb_agg(to_jsonb(u) ORDER BY u.ventas DESC)
            FROM (
                SELECT
                    un.id_unidad_negocio,
                    un.nombre                  AS unidad_nombre,
                    SUM(fp.importe_neto)       AS ventas,
                    SUM(fp.cantidad_bultos)    AS bultos,
                    SUM(fp.cantidad_hl)        AS hl
                FROM f_prod fp
                JOIN productos pr        ON pr.id_producto = fp.id_producto
                LEFT JOIN divisiones d   ON d.id_division = pr.id_division
                LEFT JOIN unidades_negocio un ON un.id_unidad_negocio = d.id_unidad_negocio
                GROUP BY un.id_unidad_negocio, un.nombre
                ORDER BY SUM(fp.importe_neto) DESC
            ) u
        ), '[]'::jsonb) AS valor
    ),

    -- ── 8. Por marca ───────────────────────────────────────────────────────
    por_marca AS (
        SELECT COALESCE((
            SELECT jsonb_agg(to_jsonb(m) ORDER BY m.ventas DESC)
            FROM (
                SELECT
                    id_marca,
                    marca_nombre,
                    SUM(importe_neto)    AS ventas,
                    SUM(cantidad_bultos) AS unidades,
                    SUM(cantidad_hl)     AS hl
                FROM f_prod
                GROUP BY id_marca, marca_nombre
                ORDER BY SUM(importe_neto) DESC NULLS LAST
            ) m
        ), '[]'::jsonb) AS valor
    )

    SELECT jsonb_build_object(
        'kpis',          (SELECT valor FROM kpis),
        'variaciones',   (SELECT valor FROM variaciones),
        'serie',         (SELECT valor FROM serie),
        'top_clientes',  (SELECT valor FROM top_clientes),
        'por_encargado', (SELECT valor FROM por_encargado),
        'por_localidad', (SELECT valor FROM por_localidad),
        'por_unidad',    (SELECT valor FROM por_unidad),
        'por_marca',     (SELECT valor FROM por_marca)
    );
$$;


-- ----------------------------------------------------------------------------
--  2. fn_clientes — agregar sobre `ventas`, no sobre la vista
-- ----------------------------------------------------------------------------
--  Las 8 columnas que necesita están en `ventas` y `periodos`. Pasar por
--  `v_ventas_detalle` obligaba a resolver 14 joins por fila sólo para descartar
--  casi todas sus columnas.

CREATE OR REPLACE FUNCTION public.fn_clientes(
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
        FROM public.clientes c
        LEFT JOIN por_cliente pc ON pc.id_cliente = c.id_cliente
        LEFT JOIN public.localidades l ON l.id_localidad = c.id_localidad
        LEFT JOIN activos a ON a.id_cliente = c.id_cliente
    )
    SELECT COALESCE((
        SELECT jsonb_agg(to_jsonb(b) ORDER BY b.ventas_total DESC, b.razon_social)
        FROM base b
    ), '[]'::jsonb);
$$;

COMMENT ON FUNCTION public.fn_clientes(int, int, int, int, int, int, text, int) IS
'Clientes con su agregado de ventas (jsonb). Agrega sobre ventas+periodos, no sobre la vista (ver 39_*).';
