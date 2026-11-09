-- ============================================================================
--  fn_dashboard_todo — las ocho consultas del Dashboard en una sola
--
--  Por qué: con los 8.705 registros reales, el Dashboard hacía ocho llamadas a
--  la base y medía esto:
--
--      SECUENCIAL (de a una):   16.415 ms   0 errores
--      LOTES DE 2:              10.817 ms   0 errores
--      8 EN PARALELO:            9.395 ms   7 errores  <- statement timeout
--
--  El timeout no era lentitud: era contención de CPU del plan gratuito. Pero
--  tampoco era una consulta lenta en sí: cada función cuesta lo mismo (~2s)
--  sin importar qué tan compleja sea.
--
--  La causa es que TODAS pagan el mismo precio: `fn_ventas_filtradas` deriva
--  de `v_ventas_detalle`, que son 8.705 filas × 33 columnas × 12 JOINs. Ocho
--  llamadas = ocho barridos de esa vista.
--
--  Acá se barre UNA vez. El CTE `f` se materializa una sola vez y las ocho
--  agregaciones salen de ahí. Se espera pasar de ~16s a un solo barrido, más un
--  viaje a la base en vez de ocho.
--
--  La latencia de red NO se arregla: cada viaje a Supabase cuesta ~250-490ms
--  desde Argentina. Con una sola llamada, ese costo se paga una vez.
--
--  Las agregaciones reproducen LITERALMENTE la lógica de cada función original,
--  para que los números del Dashboard no cambien:
--    · kpis             → fn_dashboard_kpis
--    · variaciones      → fn_dashboard_variaciones
--    · serie            → fn_ventas_mensuales
--    · top_clientes     → fn_top_clientes
--    · por_encargado    → fn_ventas_por_encargado
--    · por_localidad    → fn_ventas_por_localidad
--    · por_unidad       → fn_ventas_por_unidad_negocio
--    · por_marca        → fn_ventas_por_marca
--
--  Devuelve jsonb y no una fila con columnas sueltas: cada sub-objeto puede
--  tener distinta cantidad de filas, y además una sola fila nunca se trunca por
--  el `db-max-rows` de PostgREST (ver 18_catalogo_jsonb.sql).
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


CREATE OR REPLACE FUNCTION fn_dashboard_todo(
    p_anio            int  DEFAULT NULL,
    p_mes             int  DEFAULT NULL,
    p_cliente         int  DEFAULT NULL,
    p_localidad       int  DEFAULT NULL,
    p_marca           int  DEFAULT NULL,
    p_encargado       int  DEFAULT NULL,
    p_canal           text DEFAULT NULL,
    p_unidad_negocio  int  DEFAULT NULL,
    p_limite          int  DEFAULT 8
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
            p_unidad_negocio
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
--  Verificación: los números tienen que coincidir con las funciones sueltas
-- ----------------------------------------------------------------------------

-- 1 sola fila, 8 claves
SELECT jsonb_object_keys(fn_dashboard_todo()) AS clave;

-- Los KPIs tienen que dar lo mismo que fn_dashboard_kpis
SELECT
    (fn_dashboard_todo() -> 'kpis' ->> 'total_neto')    AS todo_neto,
    (SELECT total_neto::text FROM fn_dashboard_kpis())   AS kpis_neto,
    (fn_dashboard_todo() -> 'kpis' ->> 'operaciones')   AS todo_ops,
    (SELECT operaciones::text FROM fn_dashboard_kpis()) AS kpis_ops;

-- Cuántas filas trae cada parte
SELECT
    jsonb_array_length(fn_dashboard_todo() -> 'serie')         AS serie,
    jsonb_array_length(fn_dashboard_todo() -> 'top_clientes')  AS clientes,
    jsonb_array_length(fn_dashboard_todo() -> 'por_encargado') AS encargados,
    jsonb_array_length(fn_dashboard_todo() -> 'por_localidad') AS localidades,
    jsonb_array_length(fn_dashboard_todo() -> 'por_unidad')    AS unidades,
    jsonb_array_length(fn_dashboard_todo() -> 'por_marca')     AS marcas;

-- Las marcas y las unidades tienen que coincidir con sus funciones sueltas
SELECT
    (fn_dashboard_todo() -> 'por_unidad' -> 0 ->> 'unidad_nombre') AS todo_un,
    (SELECT unidad_nombre FROM fn_ventas_por_unidad_negocio() LIMIT 1) AS un_suelta,
    (fn_dashboard_todo() -> 'por_marca' -> 0 ->> 'marca_nombre')  AS todo_marca,
    (SELECT marca_nombre FROM fn_ventas_por_marca() LIMIT 1)        AS marca_suelta;