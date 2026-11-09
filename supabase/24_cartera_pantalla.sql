-- ============================================================================
--  Funciones para la pantalla de Supervisores
--
--  Complementa `fn_supervisores_cartera` (archivo 23), que ya da la lista.
--  Acá van las tres que hacen falta para el detalle:
--    · fn_cartera_marcas    → cuántos clientes compraron cada marca
--    · fn_cartera_clientes  → los clientes, con lo que les falta ofrecer
--    · fn_cliente_compras   → la matriz de un cliente
--
--  `fn_cartera_clientes` devuelve **jsonb** y no una tabla a propósito: son
--  hasta 1.434 clientes y PostgREST corta la respuesta a 1.000 filas
--  (`db-max-rows`). Con una sola fila nunca se trunca. Es el mismo problema que
--  se rompió con `fn_clientes` y con el catálogo de filtros.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. fn_cartera_marcas — la matriz por marca de un supervisor
-- ----------------------------------------------------------------------------
--  Por marca: cuántos clientes del supervisor la compraron y cuántos no. El
--  "no" es lo que se puede ofertar.
--
--  `faltantes` se limita a clientes con FLAG ALCOHOL: la búsqueda es
--  "es de alcohol y no compró". Un cliente sin alcohol no entra en el embudo,
--  aunque no haya comprado ninguna marca.

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
        WHERE p_supervisor IS NULL OR sc.id_supervisor IS NOT DISTINCT FROM p_supervisor
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
--  2. fn_cartera_clientes — los clientes de un supervisor
-- ----------------------------------------------------------------------------
--  Devuelve jsonb con un array de clientes. Cada uno trae:
--    · sus datos (código, razón social, fantasía, localidad)
--    · es_alcohol  → el FLAG del archivo
--    · compro_algo → compró alguna de las 9 marcas
--    · compradas    → cuántas compró (para el texto de la ficha)
--    · faltantes   → las que NO compró, si es de alcohol
--
--  El filtro es por `codigo_cliente`, no por `id_cliente`: es la clave natural
--  del Excel y la que usan `supervisores_cartera` y `cliente_producto`. Además
--  el 49% de los clientes del archivo no estaba en `clientes` antes de la
--  carga, así que el LEFT JOIN tiene que tolerar ausencias.

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
        WHERE p_supervisor IS NULL OR sc.id_supervisor IS NOT DISTINCT FROM p_supervisor
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
--  3. fn_cliente_compras — la matriz de un cliente
-- ----------------------------------------------------------------------------
--  Para la ficha del cliente: qué compró, qué no, y si tiene alcohol pendiente.

CREATE OR REPLACE FUNCTION fn_cliente_compras(
    p_cliente varchar
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH datos AS (
        SELECT
            c.codigo_cliente,
            COALESCE(cl.razon_social, c.codigo_cliente) AS razon_social,
            cl.nombre_fantasia,
            COALESCE(ca.es_alcohol, false)               AS es_alcohol,
            (SELECT COUNT(*) FROM cliente_producto cp
              WHERE cp.codigo_cliente = c.codigo_cliente AND cp.compro) AS compradas,
            COALESCE((
                SELECT jsonb_agg(m.nombre ORDER BY m.nombre)
                FROM cliente_producto cp
                JOIN marcas m ON m.id_marca = cp.id_marca
                WHERE cp.codigo_cliente = c.codigo_cliente AND NOT cp.compro
            ), '[]'::jsonb) AS faltantes
        FROM supervisores_cartera c
        LEFT JOIN clientes cl ON cl.codigo_cliente = c.codigo_cliente
        LEFT JOIN cliente_alcohol ca ON ca.codigo_cliente = c.codigo_cliente
        WHERE c.codigo_cliente = p_cliente
    )
    SELECT COALESCE((
        SELECT jsonb_build_object(
            'codigo_cliente',  d.codigo_cliente,
            'razon_social',    d.razon_social,
            'nombre_fantasia', d.nombre_fantasia,
            'es_alcohol',      d.es_alcohol,
            'compradas',       d.compradas,
            'faltantes',       d.faltantes,
            'marcas',          COALESCE((
                SELECT jsonb_agg(to_jsonb(x) ORDER BY x.compro DESC, x.marca_nombre)
                FROM (
                    SELECT m.nombre AS marca_nombre, COALESCE(cp.compro, false) AS compro
                    FROM marcas_alcohol ma
                    JOIN marcas m ON m.id_marca = ma.id_marca
                    LEFT JOIN cliente_producto cp
                        ON cp.codigo_cliente = d.codigo_cliente AND cp.id_marca = ma.id_marca
                ) x
            ), '[]'::jsonb)
        )
        FROM datos d
    ), 'null'::jsonb);
$$;


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------
--  9 filas, una por marca. Los `compraron` tienen que coincidir con lo que dice
--  el archivo del cliente.

SELECT * FROM fn_cartera_marcas();

SELECT nombre, clientes, alcohol, oportunidad FROM fn_supervisores_cartera();

-- Cuántos clientes trae la cartera completa
SELECT jsonb_array_length(fn_cartera_clientes()) AS todos;

-- Un cliente real, para ver el formato
SELECT jsonb_pretty(fn_cliente_compras(
    (SELECT codigo_cliente FROM cliente_alcohol WHERE es_alcohol LIMIT 1)
));