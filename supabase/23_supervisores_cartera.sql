-- ============================================================================
--  Cartera por supervisor y matriz de compras por producto
--
--  Qué resuelve: el archivo "Sub Base Consulta.xlsx" tiene 2.989 clientes con
--  un flag SI/NO por producto. Sirve para responder "este cliente es de
--  alcohol pero no compró nada → ofertele". Eso no sale de `ventas`: un cliente
--  que no compró no tiene ninguna fila ahí.
--
--  La clave es `codigo_cliente`, NO `id_cliente`, a propósito:
--    · es el identificador natural del Excel, estable entre recargas
--    · la carga se puede repetir (truncar y volver a insertar) sin romper nada
--    · no obliga a que el cliente exista antes de armar la cartera
--
--  PERALTA SOLANA es un supervisor nuevo: no existe en el Excel de ventas
--  (desactualizado) pero sí en el archivo del cliente. Se agrega acá.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. El supervisor que falta
-- ----------------------------------------------------------------------------
--  El archivo trae dos supervisores, más 182 clientes sin SDV (se guardan con
--  id NULL).

INSERT INTO supervisores (nombre_completo)
VALUES ('PERALTA SOLANA')
ON CONFLICT (nombre_completo) DO NOTHING;


-- ----------------------------------------------------------------------------
--  2. Cartera por supervisor
-- ----------------------------------------------------------------------------
--  Fuente de VERDAD de a quién supervisa cada cliente. Pisa lo que se podría
--  deducir del Excel de ventas, que está desactualizado: ahí los 1.434
--  clientes de PERALTA SOLANA aparecen colgados de encargados de NACUL SOL o
--  sin supervisor. Mostrar las dos cosas a la vez se contradice en pantalla.

CREATE TABLE IF NOT EXISTS supervisores_cartera (
    codigo_cliente varchar  NOT NULL,
    id_supervisor   integer NULL REFERENCES supervisores(id_supervisor) ON DELETE SET NULL,

    PRIMARY KEY (codigo_cliente)
);

COMMENT ON TABLE supervisores_cartera IS
'Qué clientes maneja cada supervisor. Fuente de verdad: el archivo del cliente.';


-- ----------------------------------------------------------------------------
--  3. Matriz de compras
-- ----------------------------------------------------------------------------
--  `compro` en true/false, no sólo los que compró: la recomendación necesita
--  saber tanto los que compró como los que NO, que es la lista para trabajar.

CREATE TABLE IF NOT EXISTS cliente_producto (
    codigo_cliente varchar NOT NULL,
    id_marca       integer NOT NULL REFERENCES marcas(id_marca) ON DELETE CASCADE,
    compro         boolean NOT NULL DEFAULT false,

    PRIMARY KEY (codigo_cliente, id_marca)
);

COMMENT ON TABLE cliente_producto IS
'Qué marcas compró cada cliente. El 1/0 viene del archivo, no se calcula.';


-- ----------------------------------------------------------------------------
--  4. El flag "es cliente de alcohol"
-- ----------------------------------------------------------------------------
--  Va en su propia tabla porque NO es un producto: es una clasificación del
--  cliente. "Es de alcohol" y "compró cerveza" son dos hechos distintos, y la
--  oportunidad se construye con los dos juntos:
--
--      oportunidad = es_alcohol Y no compró NINGUNA marca de alcohol
--
CREATE TABLE IF NOT EXISTS cliente_alcohol (
    codigo_cliente varchar NOT NULL,
    es_alcohol     boolean NOT NULL DEFAULT false,

    PRIMARY KEY (codigo_cliente)
);

COMMENT ON TABLE cliente_alcohol IS
'FLAG ALCOHOL del archivo: el cliente compra alcohol.';


-- Índices: la pantalla filtra por supervisor y por marca, no por cliente.
CREATE INDEX IF NOT EXISTS idx_cartera_supervisor ON supervisores_cartera(id_supervisor);
CREATE INDEX IF NOT EXISTS idx_cp_marca          ON cliente_producto(id_marca);
CREATE INDEX IF NOT EXISTS idx_cp_compro         ON cliente_producto(id_marca, compro);


-- ----------------------------------------------------------------------------
--  5. Las marcas de alcohol del archivo
-- ----------------------------------------------------------------------------
--  Las 9 del mapeo acordado. VALUE NO entra: es la categoría "cerveza
--  económica" (bajo cero y 1890 son ejemplos), no una marca.
--
--  Se guardan en una tabla para no repetir los ids en cada función.
CREATE TABLE IF NOT EXISTS marcas_alcohol (
    id_marca integer PRIMARY KEY REFERENCES marcas(id_marca) ON DELETE CASCADE
);

-- Mapeo verificado contra la base el 2026-10-16:
--   QUILMES  103  ·  BUDWEISER 115  ·  CORONA   124  ·  RED BULL 118
--   H2OH     112  ·  STELLA→108 STELLA ARTOIS        ·  MICHELOB→126 MICHELOB ULTRA
--   BLACK→98 PEPSI BLACK    ·  AO→110 ANDES ORIGEN RUBIA
INSERT INTO marcas_alcohol (id_marca) VALUES
    (103), (115), (124), (118), (112), (108), (126), (98), (110)
ON CONFLICT DO NOTHING;


-- ----------------------------------------------------------------------------
--  6. RLS — mismas reglas que el resto de las tablas de negocio
-- ----------------------------------------------------------------------------

ALTER TABLE supervisores_cartera ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cartera_select ON supervisores_cartera;
CREATE POLICY cartera_select ON supervisores_cartera
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cartera_insert ON supervisores_cartera;
CREATE POLICY cartera_insert ON supervisores_cartera
    FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS cartera_update ON supervisores_cartera;
CREATE POLICY cartera_update ON supervisores_cartera
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS cartera_delete ON supervisores_cartera;
CREATE POLICY cartera_delete ON supervisores_cartera
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM empleados e WHERE e.id = auth.uid() AND e.rol = 'admin')
    );

ALTER TABLE cliente_producto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cp_select ON cliente_producto;
CREATE POLICY cp_select ON cliente_producto
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cp_insert ON cliente_producto;
CREATE POLICY cp_insert ON cliente_producto
    FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS cp_update ON cliente_producto;
CREATE POLICY cp_update ON cliente_producto
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS cp_delete ON cliente_producto;
CREATE POLICY cp_delete ON cliente_producto
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM empleados e WHERE e.id = auth.uid() AND e.rol = 'admin')
    );

ALTER TABLE cliente_alcohol ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ca_select ON cliente_alcohol;
CREATE POLICY ca_select ON cliente_alcohol
    FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ca_insert ON cliente_alcohol;
CREATE POLICY ca_insert ON cliente_alcohol
    FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS ca_update ON cliente_alcohol;
CREATE POLICY ca_update ON cliente_alcohol
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS ca_delete ON cliente_alcohol;
CREATE POLICY ca_delete ON cliente_alcohol
    FOR DELETE TO authenticated
    USING (
        EXISTS (SELECT 1 FROM empleados e WHERE e.id = auth.uid() AND e.rol = 'admin')
    );


-- ----------------------------------------------------------------------------
--  7. La pantalla de Supervisores
-- ----------------------------------------------------------------------------

-- Lista de supervisores con la opportunity a la vista.
--
-- `oportunidad` = clientes con FLAG ALCOHOL = SI que no compraron NINGUNA de
-- las 9 marcas. Son los que hay que llamar.
--
-- Un cliente cuenta como "compró" si compró alguna vez alguna de las 9. Se
-- cuenta con EXISTS y no con COUNT para no multiplicar filas por el JOIN con
-- cliente_producto: un cliente que compró 4 marcas aparecería 4 veces.

CREATE OR REPLACE FUNCTION fn_supervisores_cartera()
RETURNS TABLE (
    nombre      text,
    clientes    bigint,
    con_compra  bigint,
    alcohol     bigint,
    oportunidad bigint
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
        COUNT(*) FILTER (WHERE es_alcohol AND NOT compro_algo) AS oportunidad
    FROM por_cliente pc
    LEFT JOIN supervisores s ON s.id_supervisor = pc.id_supervisor
    GROUP BY COALESCE(s.nombre_completo, 'Sin supervisor asignado'), s.id_supervisor
    ORDER BY oportunidad DESC, clientes DESC;
$$;


-- ----------------------------------------------------------------------------
--  Verificación (después de correr la carga)
-- ----------------------------------------------------------------------------

SELECT * FROM fn_supervisores_cartera();

SELECT COUNT(*) AS cartera FROM supervisores_cartera;
SELECT COUNT(*) AS compras FROM cliente_producto;
SELECT COUNT(*) AS flags_alcohol FROM cliente_alcohol;

SELECT nombre_completo FROM supervisores ORDER BY nombre_completo;

-- Las 9 marcas de alcohol tienen que estar todas
SELECT m.nombre FROM marcas_alcohol ma JOIN marcas m ON m.id_marca = ma.id_marca ORDER BY m.nombre;