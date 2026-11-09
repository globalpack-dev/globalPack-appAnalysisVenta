-- ============================================================================
--  Verificación del archivo 28
--
--  Va APARTE a propósito: el SQL Editor envuelve todo en una transacción, así
--  que si una consulta de control falla, revierte también el DDL del archivo
--  28. Con las verificaciones en su propio archivo, un error acá no tira abajo
--  el trabajo.
--
--  Ejecutar DESPUÉS de `28_benchmark.sql`.
--  Los números esperados están comentados en cada consulta.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Las tarjetas con el público y la penetración
-- ----------------------------------------------------------------------------
--      nombre          clientes  alcohol  con_alcohol  oportunidad  publico  pen.
--      NACUL SOL          1373      965         553          475       1028   53,8
--      PERALTA SOLANA     1434     1002         632          433       1065   59,3
--      Sin supervisor      182      115          79           42        121   65,3
SELECT nombre, clientes, alcohol, con_alcohol, oportunidad, publico_alcohol, penetracion
FROM fn_supervisores_cartera();


-- ----------------------------------------------------------------------------
--  2. La partición tiene que cerrar en 100
-- ----------------------------------------------------------------------------
--  El público de alcohol se divide EXACTAMENTE en los que compraron y los que
--  no. Si `público - con_alcohol - oportunidad` no da 0, la definición de
--  "público" y la de "oportunidad" no están de acuerdo y el gráfico de
--  benchmark mentiría.
--
--  Tiene que dar 0 en las tres filas.
SELECT
    nombre,
    publico_alcohol,
    con_alcohol,
    oportunidad,
    publico_alcohol - con_alcohol - oportunidad AS descuadre
FROM fn_supervisores_cartera();


-- ----------------------------------------------------------------------------
--  3. La penetración tiene que ser con_alcohol / publico_alcohol
-- ----------------------------------------------------------------------------
--  Con un decimal. Si difiere, el cálculo está mal.
SELECT
    nombre,
    penetracion,
    ROUND(100.0 * con_alcohol / NULLIF(publico_alcohol, 0), 1) AS esperada
FROM fn_supervisores_cartera();


-- ----------------------------------------------------------------------------
--  4. penetrating + oportunidad = 100
-- ----------------------------------------------------------------------------
--  Es la propiedad que hace legible el gráfico: dos barras que suman 100%.
--  Tiene que dar 100,0 en las tres filas.
SELECT
    nombre,
    penetracion,
    ROUND(100.0 * oportunidad / NULLIF(publico_alcohol, 0), 1) AS pct_oportunidad,
    penetracion
        + ROUND(100.0 * oportunidad / NULLIF(publico_alcohol, 0), 1) AS total
FROM fn_supervisores_cartera();


-- ----------------------------------------------------------------------------
--  5. El público tiene que coincidir con la matriz por marca
-- ----------------------------------------------------------------------------
--  `fn_cartera_marcas` mide sobre el mismo público. Si los dos gráficos
--  dibujaran poblaciones distintas, la comparación entre ellos no valdría.
--
--  Los dos `clientes_alcohol` tienen que dar el mismo número.
SELECT
    (SELECT clientes_alcohol FROM fn_cartera_marcas(36) LIMIT 1) AS de_la_matriz,
    (SELECT publico_alcohol FROM fn_supervisores_cartera()
      WHERE id_supervisor = 36) AS de_la_tarjeta;
