-- ============================================================================
--  fn_dashboard_variaciones
--
--  Por qué hace falta: los KPI del Dashboard mostraban en el prototype un
--  incremento escrito a mano ("+14.3%", "+8.2%", "+11.7%", "+3 nuevos"). Con
--  datos reales esos números conviven con importes ciertos y se contradicen.
--  Esta función calcula la variación real.
--
--  La regla es la misma que usa el crecimiento de marca en `fn_marcas`:
--  último período con ventas contra el período inmediatamente anterior.
--
--  Casos en que devuelve NULL:
--    · el filtro no deja datos                     -> no hay con qué comparar
--    · hay un solo período con ventas              -> no hay anterior
--    · el valor anterior es 0                      -> el porcentaje no
--                                                     significa nada (x/0)
--  La página muestra "—" en vez de 0% para no sugerir caída cuando no se sabe.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  fn_dashboard_variaciones
-- ----------------------------------------------------------------------------
--  Devuelve una sola fila. Se llama junto a `fn_dashboard_kpis`, que devuelve
--  los montos: acá van los porcentajes.
--
--  Ojo con el período de referencia: es el último período **con ventas dentro
--  del conjunto filtrado**, no el último de toda la base. Si el usuario filtra
--  por una marca que no vendió en el mes más reciente, el "último período" de
--  esa marca es otro, y compararla contra el mes global no diría nada sobre
--  esa marca.

CREATE OR REPLACE FUNCTION fn_dashboard_variaciones(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    variacion_neto        numeric,
    variacion_bruto       numeric,
    variacion_final       numeric,
    variacion_bultos      numeric,
    variacion_hl          numeric,
    variacion_operaciones numeric,
    anio_ref              integer,
    mes_ref               integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH f AS (
        SELECT *
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
    ),
    -- Una fila por período. Se agrupa por el par (anio, mes) y se ordena, en vez
    -- de MAX(anio) y MAX(mes) por separado: al cruzar el cambio de año eso
    -- combinaría el año más alto con el mes más alto de cualquier año, y
    -- armaría un período que no existe.
    por_periodo AS (
        SELECT
            anio,
            mes,
            SUM(importe_neto)  AS neto,
            SUM(importe_bruto) AS bruto,
            SUM(importe_final) AS final,
            SUM(cantidad_bultos) AS bultos,
            SUM(cantidad_hl)     AS hl,
            COUNT(*)             AS operaciones
        FROM f
        GROUP BY anio, mes
    ),
    ultimos AS (
        SELECT *
        FROM por_periodo
        ORDER BY anio DESC, mes DESC
        LIMIT 2
    ),
    -- La fila más reciente es el primero del `ORDER BY ... LIMIT 2`.
    ref AS (
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
                   -- El ORDER BY es obligatorio: `ROW_NUMBER() OVER ()` a secas
                   -- numera las filas en el orden que devuelva el plan, que no
                   -- es el de `ultimos`. Con los datos reales el "más reciente"
                   -- caería en el rn equivocado y la variación saldría al revés.
                   ROW_NUMBER() OVER (ORDER BY anio DESC, mes DESC) AS rn
            FROM ultimos
        ) t
    )
    -- Cada variación es NULL si no es comparable. Se usa CASE en vez de
    -- dividir a pelo: con el denominador en 0 la división daría Infinity o
    -- error, y mostrar 0% sugeriría una caída donde en realidad no se sabe.
    SELECT
        CASE WHEN ref.neto_prev > 0
             THEN ROUND(((ref.neto - ref.neto_prev) / ref.neto_prev) * 100, 1)
        END,
        CASE WHEN ref.bruto_prev > 0
             THEN ROUND(((ref.bruto - ref.bruto_prev) / ref.bruto_prev) * 100, 1)
        END,
        CASE WHEN ref.final_prev > 0
             THEN ROUND(((ref.final - ref.final_prev) / ref.final_prev) * 100, 1)
        END,
        CASE WHEN ref.bultos_prev > 0
             THEN ROUND(((ref.bultos - ref.bultos_prev) / ref.bultos_prev) * 100, 1)
        END,
        CASE WHEN ref.hl_prev > 0
             THEN ROUND(((ref.hl - ref.hl_prev) / ref.hl_prev) * 100, 1)
        END,
        CASE WHEN ref.operaciones_prev > 0
             THEN ROUND(((ref.operaciones - ref.operaciones_prev) / ref.operaciones_prev) * 100, 1)
        END,
        ref.anio,
        ref.mes
    FROM ref;
$$;


COMMENT ON FUNCTION fn_dashboard_variaciones IS
'Variación porcentual del último período con ventas contra el anterior. NULL si no es comparable.';