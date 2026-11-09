-- ============================================================================
--  D1 — Qué es "alcohol" de verdad
--
--  La tabla `marcas_alcohol` tiene las 9 marcas del archivo del cliente, pero
--  TRES de ellas no son alcohol:
--
--      RED BULL · H2Oh · PEPSI BLACK
--
--  Son bebidas, no alcohol. La tabla mentía con el nombre y arrastró el error a
--  todas las funciones: un cliente que sólo tomó H2Oh contaba como "compró
--  alcohol" y por lo tanto **no** aparecía en la lista de oportunidad.
--
--  Consecuencia medida contra la base:
--
--      · 105 clientes con FLAG ALCOHOL = SI compraron SOLO marcas no
--        alcohólicas. No compraron una gota de alcohol: siguen siendo
--        oportunidad.
--      · 132 clientes con FLAG ALCOHOL = NO sí compraron cerveza o cerveza
--        premium. El flag del archivo no los refleja.
--
--  Con la definición nueva:
--
--      oportunidad = FLAG ALCOHOL = SI Y no compró ninguna marca ALCOHÓLICA
--      → 950 clientes (antes 845)
--
--  La definición de "oportunidad" queda en UN solo lugar, la función
--  `fn_cartera_clientes`, y el resto la deriva. Antes cada función repetía su
--  propia versión del "y" y por eso no coincidían entre sí.
--
--  Este archivo se puede volver a correr entero sin efectos secundarios.
--  Ejecutar en el SQL Editor de supabase.com.
--
--  ── Verificación ──────────────────────────────────────────────────────────
--
--  Las consultas de verificación están en `27b_verificacion.sql`, aparte.
--
--  Motivo: el SQL Editor de Supabase envuelve todo el archivo en UNA
--  transacción. Si una consulta de verificación falla, revierte TAMBIÉN el
--  DDL de arriba. Con las verificaciones aparte, un error en una consulta de
--  control no tira abajo el trabajo.
--
--  Ejecutar este archivo y después `27b_verificacion.sql`.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. La columna que faltaba
-- ----------------------------------------------------------------------------
--  `es_alcoholica` va en la tabla de marcas, no en el código: si mañana entra
--  una marca nueva, la decisión se toma en un UPDATE y no editando tres
--  funciones.

ALTER TABLE marcas_alcohol
    ADD COLUMN IF NOT EXISTS es_alcoholica boolean NOT NULL DEFAULT true;

-- Las tres no alcohólicas. Se identifican por id, que es lo que se mapeó y
-- verificó contra el archivo:
--     PEPSI BLACK 98 · H2Oh 112 · RED BULL 118
UPDATE marcas_alcohol SET es_alcoholica = false
WHERE id_marca IN (98, 112, 118);

-- Las seis ＞alcohólicas quedan en true por el DEFAULT. Se dejan
-- explícitas para que la lista se lea completa y un error de mapeo se vea.
UPDATE marcas_alcohol SET es_alcoholica = true
WHERE id_marca IN (103, 115, 124, 108, 126, 110);


-- ----------------------------------------------------------------------------
--  2. fn_cartera_clientes — la definición de oportunidad, en un solo lugar
-- ----------------------------------------------------------------------------
--  Campos nuevos respecto de la versión del archivo 25:
--
--    · compras_alcohol   → cuántas de las 6 marcasiançaPivot compró
--    · faltantes         → las marcas ALCOHÓLICAS que NO compró (antes eran
--                          las 9 no compradas)
--    · oportunidad       → boolean, ya calculado
--
--  `faltantes` ahora lista sólo las 6 CEST结果是Xs, y se llena para cualquier
--  cliente que toque alcohol: los que tienen FLAG = SI y los que compraron
--  alcohol con FLAG = NO. Son los dos públicos a los que tiene sentido
--  ofrecerle otra marca.
--
--  El tipo de retorno no cambia (jsonb), así que `CREATE OR REPLACE` alcanza.

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
            COUNT(*) FILTER (WHERE cp.compro AND ma.es_alcoholica) AS compradas_alcohol,
            COALESCE(
                jsonb_agg(m.nombre ORDER BY m.nombre)
                    FILTER (WHERE NOT cp.compro AND ma.es_alcoholica),
                '[]'::jsonb
            ) AS faltantes_alc
        FROM cliente_producto cp
        JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
        JOIN marcas m ON m.id_marca = cp.id_marca
        JOIN cartera c ON c.codigo_cliente = cp.codigo_cliente
        GROUP BY cp.codigo_cliente
    )
    SELECT COALESCE((
        SELECT jsonb_agg(to_jsonb(f) ORDER BY f.oportunidad DESC, f.es_alcohol DESC, f.razon_social)
        FROM (
            SELECT
                c.codigo_cliente,
                COALESCE(cl.razon_social, c.codigo_cliente) AS razon_social,
                cl.nombre_fantasia,
                l.nombre                                        AS localidad_nombre,
                -- El FLAG del archivo: "es cliente de alcohol".
                c.es_alcohol,
                -- Compró alguna de las 6 marcas genuinamenteFk.
                (COALESCE(k.compradas_alcohol, 0) > 0)        AS compro_algo,
                -- Cuántas de las 9 marcas del archivo compró (cualquiera).
                COALESCE(k.compradas, 0)                      AS compradas,
                -- Cuántas de las 6 alcohólicas compró.
                COALESCE(k.compradas_alcohol, 0)              AS compradas_alcohol,
                COALESCE(k.compras, '[]'::jsonb)              AS compras,
                -- Las要高 Estate las Marche.
                CASE
                    WHEN c.es_alcohol OR COALESCE(k.compradas_alcohol, 0) > 0
                        THEN COALESCE(k.faltantes_alc, '[]'::jsonb)
                    ELSE '[]'::jsonb
                END                                           AS faltantes,
                -- LA DEFINICIÓN DE OPORTUNIDAD. Un solo lugar.
                (c.es_alcohol AND COALESCE(k.compradas_alcohol, 0) = 0) AS oportunidad
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
--  3. fn_cartera_marcas — la matriz por marca
-- ----------------------------------------------------------------------------
--  Cambia el tipo de retorno, así que necesita DROP previo. `CREATE OR
--  REPLACE` no alcanza cuando cambia la lista de columnas.
--
--  Cada fila:
--
--    · compraron        → clientes del PÚBLICO DE ALCOHOL que compraron la
--                         marca. El numerador de la penetración.
--    · clientes_alcohol → el tamaño de ese público, el denominador.
--    · penetracion      → compraron / clientes_alcohol, en porcentaje.
--    · sin_comprar      → clientes del público que NO compraron la marca.
--                         A estos se les puede ofrecer.
--
--  El "público de alcohol" es FLAG ALCOHOL = SI **o** haber comprado alguna
--  marca alcohólica. No es lo mismo que el FLAG: hay 132 clientes que
--  compraron cerveza con el flag en NO, y si el denominador fuera sólo el
--  flag quedarían fuera de la matriz que justamente sirve para verlos.
--
--  Y no es la cartera entera: la penetración de una marca se mide sobre el
--  público que podría tomarla, no sobre los 1.373 clientes del supervisor.

DROP FUNCTION IF EXISTS fn_cartera_marcas(integer);

CREATE FUNCTION fn_cartera_marcas(
    p_supervisor integer DEFAULT NULL
)
RETURNS TABLE (
    id_marca         integer,
    marca_nombre     text,
    es_alcoholica    boolean,
    compraron        bigint,
    clientes_alcohol bigint,
    penetracion      numeric,
    sin_comprar      bigint
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
    ),
    -- El público de alcohol: el flag O una compra de marca alcohólica.
    --
    -- Se calcula antes de agrupar porque `cliente_producto` tiene una fila
    -- por (cliente, marca): sin el filtro de alcohol, un cliente que compró
    -- QUILMES pero no las otras 8 aparecería 8 veces en el conteo de "sin
    -- comprar". Por eso el LEFT JOIN va contra `publico`, no al revés.
    publico AS (
        SELECT DISTINCT c.codigo_cliente
        FROM cartera c
        WHERE c.es_alcohol
           OR EXISTS (
                SELECT 1
                FROM cliente_producto cp
                JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
                WHERE cp.codigo_cliente = c.codigo_cliente
                  AND cp.compro
                  AND ma.es_alcoholica
           )
    ),
    por_marca AS (
        SELECT
            ma.id_marca,
            COUNT(*) FILTER (WHERE cp.compro) AS compraron,
            COUNT(*) FILTER (WHERE NOT cp.compro) AS sin_comprar
        FROM publico a
        JOIN cliente_producto cp
            ON cp.codigo_cliente = a.codigo_cliente
        JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
        GROUP BY ma.id_marca
    )
    SELECT
        ma.id_marca,
        m.nombre,
        ma.es_alcoholica,
        COALESCE(pm.compraron, 0)   AS compraron,
        (SELECT COUNT(*) FROM publico) AS clientes_alcohol,
        ROUND(
            100.0 * COALESCE(pm.compraron, 0)
            / NULLIF((SELECT COUNT(*) FROM publico), 0),
            1
        ) AS penetracion,
        COALESCE(pm.sin_comprar, 0) AS sin_comprar
    FROM marcas_alcohol ma
    JOIN marcas m ON m.id_marca = ma.id_marca
    LEFT JOIN por_marca pm ON pm.id_marca = ma.id_marca
    ORDER BY ma.es_alcoholica DESC, COALESCE(pm.compraron, 0) DESC, m.nombre;
$$;


-- ----------------------------------------------------------------------------
--  4. fn_supervisores_cartera — la tarjeta de cada supervisor
-- ----------------------------------------------------------------------------
--  `con_compra` pasa a significar "compró alcohol" (una de las 6), no "compró
--  alguna de las 9". `oportunidad` usa la definición de D1.
--
--  Cambia el tipo de retorno: DROP + CREATE.
--
--  Los tres grupos que se muestran en la tarjeta salen de estos números:
--    · oportunidad    = alcohol Y sin alcohol comprada
--    · con_alcohol    = compró ≥1 marca alcohólica
--    · no es cliente  = clientes - oportunidad - con_alcohol

-- Sin paréntesis: la lista de argumentos es opcional cuando la función no
-- tiene ninguno. `fn_supervisores_cartera()` también es válida, pero así la
-- acepta el validador de sintaxis.
DROP FUNCTION IF EXISTS fn_supervisores_cartera;

CREATE FUNCTION fn_supervisores_cartera()
RETURNS TABLE (
    nombre      text,
    clientes    bigint,
    alcohol     bigint,
    con_alcohol bigint,
    oportunidad bigint,
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
            COALESCE((
                SELECT COUNT(*)
                FROM cliente_producto cp
                JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
                WHERE cp.codigo_cliente = sc.codigo_cliente
                  AND cp.compro
                  AND ma.es_alcoholica
            ), 0) AS compradas_alcohol
        FROM supervisores_cartera sc
        LEFT JOIN cliente_alcohol ca ON ca.codigo_cliente = sc.codigo_cliente
    )
    SELECT
        COALESCE(s.nombre_completo, 'Sin supervisor asignado')  AS nombre,
        COUNT(*)                                       AS clientes,
        COUNT(*) FILTER (WHERE es_alcohol)             AS alcohol,
        COUNT(*) FILTER (WHERE compradas_alcohol > 0)  AS con_alcohol,
        COUNT(*) FILTER (WHERE es_alcohol AND compradas_alcohol = 0) AS oportunidad,
        pc.id_supervisor
    FROM por_cliente pc
    LEFT JOIN supervisores s ON s.id_supervisor = pc.id_supervisor
    GROUP BY COALESCE(s.nombre_completo, 'Sin supervisor asignado'), pc.id_supervisor
    ORDER BY oportunidad DESC, clientes DESC;
$$;


-- ----------------------------------------------------------------------------
--  5. fn_cliente_compras — la ficha de un cliente
-- ----------------------------------------------------------------------------
--  Misma lógica que `fn_cartera_clientes` pero para un solo cliente.
--  Devuelve jsonb, así que `CREATE OR REPLACE` alcanza.

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
            COALESCE((
                SELECT COUNT(*)
                FROM cliente_producto cp
                JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
                WHERE cp.codigo_cliente = c.codigo_cliente
                  AND cp.compro
                  AND ma.es_alcoholica
            ), 0) AS compradas_alcohol,
            COALESCE((
                SELECT jsonb_agg(m.nombre ORDER BY m.nombre)
                FROM cliente_producto cp
                JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
                JOIN marcas m ON m.id_marca = cp.id_marca
                WHERE cp.codigo_cliente = c.codigo_cliente
                  AND NOT cp.compro
                  AND ma.es_alcoholica
            ), '[]'::jsonb) AS faltantes,
            COALESCE((
                SELECT jsonb_agg(m.nombre ORDER BY m.nombre)
                FROM cliente_producto cp
                JOIN marcas_alcohol ma ON ma.id_marca = cp.id_marca
                JOIN marcas m ON m.id_marca = cp.id_marca
                WHERE cp.codigo_cliente = c.codigo_cliente
                  AND cp.compro
            ), '[]'::jsonb) AS compras
        FROM supervisores_cartera c
        LEFT JOIN clientes cl ON cl.codigo_cliente = c.codigo_cliente
        LEFT JOIN cliente_alcohol ca ON ca.codigo_cliente = c.codigo_cliente
        WHERE c.codigo_cliente = p_cliente
    )
    SELECT COALESCE((
        SELECT jsonb_build_object(
            'codigo_cliente',     d.codigo_cliente,
            'razon_social',       d.razon_social,
            'nombre_fantasia',    d.nombre_fantasia,
            'es_alcohol',         d.es_alcohol,
            'compradas_alcohol',  d.compradas_alcohol,
            'compras',            d.compras,
            'faltantes',          d.faltantes,
            'oportunidad',        (d.es_alcohol AND d.compradas_alcohol = 0),
            'marcas',             COALESCE((
                SELECT jsonb_agg(to_jsonb(x) ORDER BY x.compro DESC, x.marca_nombre)
                FROM (
                    SELECT m.nombre AS marca_nombre, ma.es_alcoholica,
                           COALESCE(cp.compro, false) AS compro
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

