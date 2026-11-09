-- ============================================================================
--  Corrección 3: fn_ventas_por_encargado quedó sobrecargada
--
--  Qué pasó: en el archivo 13, el DROP de la versión vieja se escribió con la
--  firma asumida (p_limite al final, junto a los otros filtros). La función
--  original tenía p_limite PRIMERO:
--
--    vieja:  (p_limite, p_anio, p_mes, p_cliente, p_localidad, p_marca,
--             p_encargado, p_canal)
--    nueva:  (p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado,
--             p_canal, p_limite, p_unidad_negocio)
--
--  Como el DROP no coincidió y llevaba `IF EXISTS`, falló en silencio: no dio
--  error, no borró nada, y la versión vieja siguió ahí. Con las dos conviviendo,
--  cualquier llamada quedó ambigua.
--
--  Por qué importa más de lo que parece: `DROP FUNCTION IF EXISTS` es una
--  cortina de humo. Si la firma está mal, el `IF EXISTS` se come el error y
--  parece que el DROP funcionó.
--
--  La solución de este archivo es no adivinar la firma: se borran TODAS las
--  sobrecargas que tengan ese nombre, sin importar cuántos parámetros tengan.
--
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS de 13.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  Se borran todas las versiones de fn_ventas_por_encargado
-- ----------------------------------------------------------------------------
--  El DO recorre pg_proc y ejecuta un DROP por cada overload. Se collecta el
--  texto y se ejecuta con EXECUTE: no se puede hacer DROP dentro del bloque
--  porque las utilidades de PL/pgSQL no aceptan DDL directo.
--
--  Se filtra por `proname` y por el esquema 'public', así que no toca nada más.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS firma
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'fn_ventas_por_encargado'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s', r.firma);
    END LOOP;
END $$;


-- ----------------------------------------------------------------------------
--  Se crea la versión correcta, una sola vez
-- ----------------------------------------------------------------------------
--  Misma definición que en el archivo 13, con p_limite antes de
--  p_unidad_negocio para que las llamadas por nombre sigan siendo válidas.

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
--  Verificación
-- ----------------------------------------------------------------------------

-- Debe devolver exactamente UNA fila. Si aparecen dos, quedó una sobrecarga.
SELECT COUNT(*) AS versiones_actuales
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_ventas_por_encargado';

SELECT p.proname AS funcion, pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'fn_ventas_por_encargado';

-- Y las llamadas tienen que devolver filas, con y sin filtro de unidad.
SELECT 'sin filtro' AS caso, COUNT(*) AS filas, SUM(ventas) AS total
FROM fn_ventas_por_encargado(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10);

SELECT 'UN29' AS caso, COUNT(*) AS filas, SUM(ventas) AS total
FROM fn_ventas_por_encargado(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, 29);