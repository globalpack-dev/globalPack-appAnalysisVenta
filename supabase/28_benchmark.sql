-- ============================================================================
--  Penetración de alcohol por supervisor — para el gráfico de benchmark
--
--  El gráfico C de la pantalla de Supervisores compara a los supervisores
--  entre sí: "¿estoy bien o mal respecto del equipo?".
--
--  Para eso hacía falta el tamaño del PÚBLICO DE ALCOHOL de cada supervisor:
--  el FLAG ALCOHOL = SI **o** haber comprado alguna marca alcohólica. Es el
--  mismo público que usa la matriz por marca (`fn_cartera_marcas`), para que
--  los dos gráficos hablen de la misma población.
--
--  Con esa partición, el público se divide EXACTAMENTE en dos:
--
--      NACUL SOL          público 1.028 = 553 que compraron + 475 sin compra
--      PERALTA SOLANA     público 1.065 = 632 que compraron + 433 sin compra
--      Sin supervisor      público  121 =  79 que compraron +  42 sin compra
--
--  Y por eso la penetración y la oportunidad suman 100%:
--
--      NACUL SOL          penetración 53,8 %   oportunidad 46,2 %
--      PERALTA SOLANA     penetración 59,3 %   oportunidad 40,7 %
--      Sin supervisor      penetración 65,3 %   oportunidad 34,7 %
--
--  Ojo con el denominador. Si se dividiera por `alcohol` (el FLAG = SI) en
--  vez de por el público, la cuenta no cerraría: el numerador cuenta los
--  clientes que compraron alcohol con CUALQUIER flag, incluidos 63 con el
--  flag en NO. El público es el denominador correcto y el que hace que
--  penetración + oportunidad dé 100.
--
--  `NULLIF(..., 0)` evita la división por cero si un supervisor no tuviera
--  clientes de alcohol. No hay ninguno hoy, pero un `NULL` es un número
--  honesto y un error no lo es.
--
--  Este archivo se puede volver a correr entero sin efectos secundarios.
--  Ejecutar en el SQL Editor de supabase.com.
--
--  ── Verificación ──────────────────────────────────────────────────────────
--
--  Las consultas de verificación están en `28b_verificacion.sql`, aparte.
--  Motivo: el SQL Editor envuelve todo el archivo en UNA transacción, así que
--  un error en una consulta de control revertiría también el DDL de arriba.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. fn_supervisores_cartera — con el público de alcohol y la penetración
-- ----------------------------------------------------------------------------
--  Agrega dos columnas:
--
--    · publico_alcohol → el tamaño del público (flag SI o compró alcohol)
--    · penetracion     → qué % de ese público ya compró alcohol
--
--  Cambia el tipo de retorno, así que necesita `DROP` previo. `CREATE OR
--  REPLACE` no alcanza cuando cambia la lista de columnas.
--
--  El orden de las columnas se mantiene: las dos nuevas van al final, así que
--  un `SELECT *` que esperaba el orden viejo sigue leyendo lo mismo.
--
--  `alcohol` sigue siendo el FLAG del archivo. No se renombra: es otra
--  pregunta ("¿cuántos de tus clientes son clientes de alcohol?") y el
--  público es otra ("¿a cuántos les podrías ofrecer alcohol?").

DROP FUNCTION IF EXISTS fn_supervisores_cartera;

CREATE FUNCTION fn_supervisores_cartera()
RETURNS TABLE (
    nombre         text,
    clientes       bigint,
    alcohol        bigint,
    con_alcohol    bigint,
    oportunidad    bigint,
    id_supervisor  integer,
    publico_alcohol bigint,
    penetracion    numeric
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
        pc.id_supervisor,
        -- El público: el flag en SI o una compra de alcohol.
        COUNT(*) FILTER (WHERE es_alcohol OR compradas_alcohol > 0) AS publico_alcohol,
        ROUND(
            100.0 * COUNT(*) FILTER (WHERE compradas_alcohol > 0)
            / NULLIF(
                COUNT(*) FILTER (WHERE es_alcohol OR compradas_alcohol > 0),
                0
            ),
            1
        ) AS penetracion
    FROM por_cliente pc
    LEFT JOIN supervisores s ON s.id_supervisor = pc.id_supervisor
    GROUP BY COALESCE(s.nombre_completo, 'Sin supervisor asignado'), pc.id_supervisor
    ORDER BY oportunidad DESC, clientes DESC;
$$;
