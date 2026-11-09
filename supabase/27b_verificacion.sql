-- ============================================================================
--  Verificación del archivo 27
--
--  Va APARTE a propósito: el SQL Editor envuelve todo en una transacción, así
--  que si una consulta de control falla, revierte también el DDL del archivo
--  27. Con las verificaciones en su propio archivo, un error acá no tira abajo
--  el trabajo.
--
--  Ejecutar DESPUÉS de `27_alcohol_ico.sql`.
--  Los números esperados están comentados en cada consulta.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Las 9 marcas, con la nueva columna
-- ----------------------------------------------------------------------------
--  Tiene que decir FALSE en PEPSI BLACK, H2Oh y RED BULL, y TRUE en las 6
--  alcoholicás: QUILMES, BUDWEISER, CORONA, MICHELOB ULTRA, STELLA ARTOIS y
--  ANDES ORIGEN RUBIA.
SELECT ma.id_marca, m.nombre, ma.es_alcoholica
FROM marcas_alcohol ma JOIN marcas m ON m.id_marca = ma.id_marca
ORDER BY ma.es_alcoholica DESC, m.nombre;


-- ----------------------------------------------------------------------------
--  2. Las tarjetas de cada supervisor
-- ----------------------------------------------------------------------------
--  oportunidad tiene que sumar 950 y con_alcohol 1.264.
--
--      NACUL SOL          1373   965 alcohol   553 con_alcohol   475 oportunidad
--      PERALTA SOLANA     1434  1002 alcohol   632 con_alcohol   433 oportunidad
--      Sin supervisor      182   115 alcohol    79 con_alcohol    42 oportunidad
SELECT nombre, clientes, alcohol, con_alcohol, oportunidad, id_supervisor
FROM fn_supervisores_cartera();


-- ----------------------------------------------------------------------------
--  3. Los cuatro grupos del filtro
-- ----------------------------------------------------------------------------
--  sin_compra 950 · compro_alcohol 1264 · no_es_cliente 775 · total 2989
--
--  `jsonb_array_elements` devuelve un jsonb, NO una tabla: los campos se leen
--  con `->>`. El alias `c` es el valor jsonb entero, no una fila con columnas
--  — por eso `WHERE oportunidad` no funciona y hay que usar `c->>'oportunidad'`.
SELECT
    COUNT(*) FILTER (WHERE (c->>'oportunidad')::boolean)                     AS sin_compra,
    COUNT(*) FILTER (WHERE NOT (c->>'oportunidad')::boolean
                        AND (c->>'compro_algo')::boolean)                     AS compro_alcohol,
    COUNT(*) FILTER (WHERE NOT (c->>'oportunidad')::boolean
                        AND NOT (c->>'compro_algo')::boolean)                 AS no_es_cliente,
    COUNT(*)                                                                  AS total
FROM jsonb_array_elements(fn_cartera_clientes(NULL)) c;


-- ----------------------------------------------------------------------------
--  4. La matriz de marcas de NACUL SOL
-- ----------------------------------------------------------------------------
--  El público de alcohol son 1.028 clientes. `compraron` nunca puede pasar
--  `clientes_alcohol`, y `compraron + sin_comprar` tiene que dar el público.
--
--      QUILMES        500   48,6 %
--      BUDWEISER      287   27,9 %
--      STELLA ARTOIS  188   18,3 %
--      ANDES ORIGEN   116   11,3 %
--      MICHELOB ULTRA  87    8,5 %
--      CORONA          70    6,8 %
SELECT marca_nombre, es_alcoholica, compraron, clientes_alcohol, penetracion, sin_comprar
FROM fn_cartera_marcas(36)
ORDER BY es_alcoholica DESC, penetracion DESC;


-- ----------------------------------------------------------------------------
--  5. El caso que D1 arregla
-- ----------------------------------------------------------------------------
--  Los 105 clientes que compraron SÓLO bebidas (H2Oh, Red Bull, Pepsi Black)
--  tienen que seguir siendo oportunidad: no compraron alcohol.
--
--  Tiene que dar 105.
SELECT COUNT(*) AS solo_bebidas_siguen_siendo_oportunidad
FROM jsonb_array_elements(fn_cartera_clientes(NULL)) c
WHERE (c->>'es_alcohol')::boolean
  AND (c->>'compradas_alcohol')::int = 0
  AND jsonb_array_length(c->'compras') > 0
  AND (c->>'oportunidad')::boolean;


-- ----------------------------------------------------------------------------
--  6. Y el caso inverso
-- ----------------------------------------------------------------------------
--  Los 132 clientes que compraron cerveza con el flag en NO: la pantalla los
--  tiene que mostrar como "ya compró alcohol", no como "no compra alcohol".
--
--  Tiene que dar 132.
SELECT COUNT(*) AS compro_alcohol_con_flag_no
FROM jsonb_array_elements(fn_cartera_clientes(NULL)) c
WHERE NOT (c->>'es_alcohol')::boolean
  AND (c->>'compro_algo')::boolean;
