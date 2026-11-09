-- ============================================================================
--  Fix de la pantalla de Supervisores: el id y el grupo sin supervisor
--
--  Corrige dos errores del archivo 24 que hacían que sólo "Sin supervisor"
--  mostrara clientes:
--
--    1. `fn_supervisores_cartera` no devolvía `id_supervisor`, así que la
--       pantalla no tenía con qué filtrar y usaba un 1 hardcodeado. Ninguno de
--       los dos supervisores tiene ese id → detalle vacío.
--
--    2. `p_supervisor = NULL` significaba "todos" en el WHERE, no "sin
--       supervisor". Al entrar a ese grupo se veía la cartera completa
--       (2.989), no los 182 clientes sin SDV.
--
--  Nueva convención, en las tres funciones:
--      p_supervisor IS NULL  → todos
--      p_supervisor = 0      → sin supervisor (id_supervisor IS NULL)
--      p_supervisor = n      → ese supervisor
--
--  El 0 es seguro como centinela: `supervisores.id_supervisor` es serial y
--  arranca en 1, nunca vale 0.
--
--  Este archivo se puede volver a correr entero sin efectos secundarios.
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. fn_supervisores_cartera — ahora devuelve el id
-- ----------------------------------------------------------------------------
--  Cambia el RETURNS TABLE, así que `CREATE OR REPLACE` no alcanza: hay que
--  dropear primero. La columna nueva va al final para que los SELECT * que
--  esperan el orden viejo no se rompan.
--
--  `id_supervisor` sale NULL para el grupo sin supervisor. La pantalla lo
--  traduce a 0, que es el centinela que entienden las funciones del 24.
--
--  Se sigue agrupando por el nombre y el id juntos: si hubiera dos
--  supervisores homónimos, no se mezclan.

DROP FUNCTION IF EXISTS fn_supervisores_cartera();

CREATE FUNCTION fn_supervisores_cartera()
RETURNS TABLE (
    nombre        text,
    clientes      bigint,
    con_compra    bigint,
    alcohol       bigint,
    oportunidad   bigint,
    id_supervisor integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH por_cliente AS (
        SELECT
            sc.codigo_cliente,
            sc.id_supervisor,
            COALESCE(ca.es_alcohol, false) AS es_alcohol,
            EXISTS (
                SELECT 1 FROM cliente_producto cp
                JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
                WHERE cp.codigo_cliente = sc.codigo_cliente AND cp.compro
            ) AS compro_algo
        FROM supervisores_cartera sc
        LEFT JOIN cliente_alcohol ca ON ca.codigo_cliente = sc.codigo_cliente
    )
    SELECT
        COALESCE(s.nombre_completo, 'Sin supervisor asignado')  AS nombre,
        COUNT(*)                                       AS clientes,
        COUNT(*) FILTER (WHERE compro_algo)            AS con_compra,
        COUNT(*) FILTER (WHERE es_alcohol)             AS alcohol,
        COUNT(*) FILTER (WHERE es_alcohol AND NOT compro_algo) AS oportunidad,
        pc.id_supervisor
    FROM por_cliente pc
    LEFT JOIN supervisores s ON s.id_supervisor = pc.id_supervisor
    GROUP BY COALESCE(s.nombre_completo, 'Sin supervisor asignado'), pc.id_supervisor
    ORDER BY oportunidad DESC, clientes DESC;
$$;


-- ----------------------------------------------------------------------------
--  2. fn_cartera_marcas — el filtro arreglado
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_cartera_marcas(
    p_supervisor integer DEFAULT NULL
)
RETURNS TABLE (
    id_marca     integer,
    marca_nombre text,
    compraron    bigint,
    faltantes    bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH cartera AS (
        SELECT sc.codigo_cliente, COALESCE(ca.es_alcohol, false) AS es_alcohol
        FROM supervisores_cartera sc
        LEFT JOIN cliente_alcohol ca ON ca.codigo_cliente = sc.codigo_cliente
        WHERE p_supervisor IS NULL
           OR (p_supervisor = 0 AND sc.id_supervisor IS NULL)
           OR sc.id_supervisor = p_supervisor
    )
    SELECT
        m.id_marca,
        m.nombre,
        COUNT(*) FILTER (WHERE cp.compro) AS compraron,
        COUNT(*) FILTER (WHERE NOT cp.compro AND c.es_alcohol) AS faltantes
    FROM marcas_alcohol ma
    JOIN marcas m ON m.id_marca = ma.id_marca
    CROSS JOIN cartera c
    LEFT JOIN cliente_producto cp
        ON cp.codigo_cliente = c.codigo_cliente AND cp.id_marca = ma.id_marca
    GROUP BY m.id_marca, m.nombre
    ORDER BY compraron DESC, m.nombre;
$$;


-- ----------------------------------------------------------------------------
--  3. fn_cartera_clientes — el mismo filtro
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_cartera_clientes(
    p_supervisor integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH cartera AS (
        SELECT sc.codigo_cliente, COALESCE(ca.es_alcohol, false) AS es_alcohol
        FROM supervisores_cartera sc
        LEFT JOIN cliente_alcohol ca ON ca.codigo_cliente = sc.codigo_cliente
        WHERE p_supervisor IS NULL
           OR (p_supervisor = 0 AND sc.id_supervisor IS NULL)
           OR sc.id_supervisor = p_supervisor
    ),
    compras AS (
        SELECT
            cp.codigo_cliente,
            COUNT(*) FILTER (WHERE cp.compro) AS compradas,
            COALESCE(
                jsonb_agg(m.nombre ORDER BY m.nombre)
                    FILTER (WHERE NOT cp.compro AND c.es_alcohol),
                '[]'::jsonb
            ) AS faltantes
        FROM cliente_producto cp
        JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
        JOIN marcas m ON m.id_marca = cp.id_marca
        JOIN cartera c ON c.codigo_cliente = cp.codigo_cliente
        GROUP BY cp.codigo_cliente
    )
    SELECT COALESCE((
        SELECT jsonb_agg(to_jsonb(f) ORDER BY f.es_alcohol DESC, f.razon_social)
        FROM (
            SELECT
                c.codigo_cliente,
                COALESCE(cl.razon_social, c.codigo_cliente) AS razon_social,
                cl.nombre_fantasia,
                l.nombre                                        AS localidad_nombre,
                c.es_alcohol,
                (COALESCE(k.compradas, 0) > 0)                AS compro_algo,
                COALESCE(k.compradas, 0)                       AS compradas,
                COALESCE(k.faltantes, '[]'::jsonb)             AS faltantes
            FROM cartera c
            LEFT JOIN clientes cl
                ON cl.codigo_cliente = c.codigo_cliente
            LEFT JOIN localidades l
                ON l.id_localidad = cl.id_localidad
            LEFT JOIN compras k
                ON k.codigo_cliente = c.codigo_cliente
        ) f
    ), '[]'::jsonb);
$$;


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------
--  1. Tres filas, una por supervisor, y el id visible (NULL en el grupo sin
--     supervisor).
SELECT * FROM fn_supervisores_cartera();

--  2. Los conteos por grupo tienen que dar 1.373 / 1.434 / 182.
--     COALESCE(id_supervisor, 0) es clave: el grupo sin supervisor tiene id
--     NULL, y NULL en estas funciones significa "todos".
SELECT
    nombre AS grupo,
    jsonb_array_length(fn_cartera_clientes(COALESCE(id_supervisor, 0))) AS clientes
FROM fn_supervisores_cartera()
UNION ALL
SELECT 'todos', jsonb_array_length(fn_cartera_clientes(NULL))
ORDER BY clientes DESC;
