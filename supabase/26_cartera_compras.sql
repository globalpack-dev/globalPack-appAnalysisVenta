-- ============================================================================
--  La cartera ahora sabe QUÉ compró cada cliente, no sólo cuánto
--
--  `fn_cartera_clientes` devolvía `compradas` (el conteo) y `faltantes` (las
--  marcas que no compró), pero no el nombre de las que sí compró. La pantalla
--  necesita las dos listas:
--
--    · sin ninguna compra → alerta de oportunidad
--    · con al menos una   → "compró QUILMES, STELLA" y el alert desaparece
--
--  Es el mismo `jsonb_agg` con dos filtros distintos sobre `cliente_producto`.
--  El tipo de retorno no cambia (jsonb), así que `CREATE OR REPLACE` alcanza.
--
--  Ejecutar en el SQL Editor de supabase.com. Se puede re-ejecutar.
-- ============================================================================

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
                    FILTER (WHERE cp.compro),
                '[]'::jsonb
            ) AS compras,
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
                COALESCE(k.compradas, 0)                      AS compradas,
                COALESCE(k.compras, '[]'::jsonb)              AS compras,
                COALESCE(k.faltantes, '[]'::jsonb)            AS faltantes
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
--  Un cliente con compras y uno sin compras. El primero tiene que traer
--  nombres en `compras` y el segundo un array vacío.

SELECT jsonb_pretty(
    (fn_cartera_clientes(0) -> 0)
);

SELECT
    COUNT(*) FILTER (WHERE (c ->> 'compras') <> '[]')             AS con_compras,
    COUNT(*) FILTER (WHERE (c ->> 'compras') = '[]')              AS sin_compras,
    COUNT(*) FILTER (WHERE (c ->> 'es_alcohol')::boolean
                       AND (c ->> 'compras') = '[]')              AS oportunidad
FROM jsonb_array_elements(fn_cartera_clientes(NULL)) c;
