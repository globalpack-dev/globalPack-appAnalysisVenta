-- ============================================================================
--  El 8º filtro en las 3 funciones que faltaban
--
--  Los archivos 10 y 12 agregaron `p_unidad_negocio` a 7 funciones, pero quedaron
--  3 que el reporte también usa y que no lo aceptan:
--
--    fn_ventas_mensuales            (evolución mensual del reporte de ventas)
--    fn_ventas_por_encargado        (ranking del reporte de sectores)
--    fn_ventas_por_unidad_negocio   (desglose por UN del reporte de ventas)
--
--  Con esas tres, el selector "Unidad de negocio" del reporte de ventas o de
--  sectores fallaría con "could not find the function". Las demás (fn_marcas,
--  fn_clientes, fn_marketing_por, fn_dashboard_kpis) ya lo aceptan.
--
--  OJO con la sobrecarga: al cambiar la firma, la versión vieja queda conviviendo
--  y Postgres rechaza las llamadas. Por eso este archivo borra explícitamente la
--  versión anterior de cada una ANTES de crear la nueva. Es el mismo error que
--  corrigieron los archivos 11 y 12.
--
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS de 12.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  Se borran las versiones viejas primero
-- ----------------------------------------------------------------------------
--  Sin CASCADE: si algo dependiera, es mejor que lo diga el error.

DROP FUNCTION IF EXISTS public.fn_ventas_mensuales(
    integer, integer, integer, integer, integer, integer, text
);

DROP FUNCTION IF EXISTS public.fn_ventas_por_encargado(
    integer, integer, integer, integer, integer, integer, text, integer
);

DROP FUNCTION IF EXISTS public.fn_ventas_por_unidad_negocio(
    integer, integer, integer, integer, integer, integer, text
);


-- ----------------------------------------------------------------------------
--  1. fn_ventas_mensuales — evolución mes a mes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_ventas_mensuales(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS TABLE (
    anio           integer,
    mes            integer,
    nombre_mes     text,
    mes_corto      text,
    importe_neto   numeric,
    importe_bruto  numeric,
    importe_final  numeric,
    cantidad_bultos numeric,
    cantidad_hl    numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        f.anio,
        f.mes,
        MIN(f.nombre_mes),
        LEFT(MIN(f.nombre_mes), 3),
        SUM(f.importe_neto),
        SUM(f.importe_bruto),
        SUM(f.importe_final),
        SUM(f.cantidad_bultos),
        SUM(f.cantidad_hl)
    FROM fn_ventas_filtradas(
        p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
        p_unidad_negocio
    ) f
    GROUP BY f.anio, f.mes
    ORDER BY f.anio, f.mes;
$$;


-- ----------------------------------------------------------------------------
--  2. fn_ventas_por_encargado — ranking de encargados
-- ----------------------------------------------------------------------------
--  El p_limite va AL FINAL para no romper las llamadas viejas por posición: el
--  parámetro nuevo tiene DEFAULT, así que `fn_ventas_por_encargado(NULL×6,
--  NULL, 10)` sigue funcionando.

CREATE OR REPLACE FUNCTION fn_ventas_por_encargado(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_limite    int  DEFAULT 8,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS TABLE (
    id_encargado_venta integer,
    encargado_nombre   text,
    supervisor_nombre  text,
    ventas             numeric,
    clientes           bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        e.id_encargado_venta,
        e.nombre_completo,
        s.nombre_completo,
        SUM(f.importe_neto),
        COUNT(DISTINCT f.id_cliente)
    FROM fn_ventas_filtradas(
        p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
        p_unidad_negocio
    ) f
    JOIN encargados_ventas e ON e.id_encargado_venta = f.id_encargado_venta
    LEFT JOIN supervisores s   ON s.id_supervisor = e.id_supervisor
    GROUP BY e.id_encargado_venta, e.nombre_completo, s.nombre_completo
    ORDER BY SUM(f.importe_neto) DESC
    LIMIT p_limite;
$$;


-- ----------------------------------------------------------------------------
--  3. fn_ventas_por_unidad_negocio — desglose por unidad
-- ----------------------------------------------------------------------------
--  El filtro por UN y el desglose por UN son la misma dimensión: si se elige
--  una unidad, esta función devuelve una sola fila. Es lo esperable.

CREATE OR REPLACE FUNCTION fn_ventas_por_unidad_negocio(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL,
    p_unidad_negocio int DEFAULT NULL
)
RETURNS TABLE (
    id_unidad_negocio integer,
    unidad_nombre     text,
    ventas            numeric,
    bultos            numeric,
    hl                numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT
        un.id_unidad_negocio,
        un.nombre,
        SUM(di.importe_neto),
        SUM(di.cantidad_bultos),
        SUM(di.cantidad_hl)
    FROM fn_ventas_filtradas(
        p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal,
        p_unidad_negocio
    ) di
    JOIN productos pr     ON pr.id_producto = di.id_producto
    JOIN familias f       ON f.id_familia  = pr.id_familia
    JOIN divisiones d     ON d.id_division = f.id_division
    JOIN unidades_negocio un ON un.id_unidad_negocio = d.id_unidad_negocio
    GROUP BY un.id_unidad_negocio, un.nombre
    ORDER BY SUM(di.importe_neto) DESC;
$$;


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------
--  Los números tienen que variar al filtrar por unidad de negocio.

SELECT 'serie sin filtro' AS caso, COUNT(*) AS periodos, SUM(importe_neto) AS neto
FROM fn_ventas_mensuales();

SELECT 'serie UN29' AS caso, COUNT(*) AS periodos, SUM(importe_neto) AS neto
FROM fn_ventas_mensuales(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 29);

SELECT 'encargados sin filtro' AS caso, COUNT(*) AS filas, SUM(ventas) AS total
FROM fn_ventas_por_encargado(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10);

SELECT 'encargados UN29' AS caso, COUNT(*) AS filas, SUM(ventas) AS total
FROM fn_ventas_por_encargado(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, 29);

-- Que no queden vestigios: tiene que devolver UNA sola firma por función.
SELECT p.proname AS funcion, pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'fn_ventas_mensuales',
      'fn_ventas_por_encargado',
      'fn_ventas_por_unidad_negocio'
  )
ORDER BY p.proname, argumentos;