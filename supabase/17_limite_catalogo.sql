-- ============================================================================
--  fn_filtros_disponibles: LIMIT para no perder los períodos
--
--  Qué pasó: con los datos reales cargados (1.542 clientes), la función devolvió
--  exactamente 1.000 filas — el límite por defecto de supabase-js — y truncó el
--  final del UNION. El orden era `orden1` = 1 para todo menos los períodos, así
--  que los períodos, que iban al principio, se perdieron igual: el selector de
--  fecha del reporte y el filtro de año del Dashboard llegaban vacíos sin
--  ningún error visible.
--
--  Dos arreglos:
--    1. `LIMIT 5000` explícito, con un margen holgado sobre el catálogo real.
--    2. El `orden1` de cada tipo se numera en orden (2=cliente, 3=localidad…),
--       así el orden del resultado agrupa por tipo y es legible.
--
--  El SELECT no cambia: es el mismo que creó 10_filtro_unidad_negocio.sql.
--
--  Ejecutar en el SQL Editor de supabase.com.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_filtros_disponibles()
RETURNS TABLE (
    tipo   text,
    id     int,
    nombre text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    -- En Postgres el ORDER BY va al final del UNION, no dentro de cada rama.
    -- `NULL::int` es explícito porque si no el NULL queda sin tipo y el UNION
    -- no puede resolverlo.
    --
    -- El LIMIT es necesario: sin él, con 1.542 clientes la respuesta se corta a
    -- 1.000 filas y se pierden los períodos, que quedan al principio del UNION.
    -- Ver el encabezado de este archivo.
    SELECT tipo, id, nombre FROM (
        SELECT 'periodo'::text AS tipo, p.id_periodo AS id,
               p.nombre_mes || ' ' || p.anio::text AS nombre,
               p.anio AS orden1, p.mes AS orden2
        FROM periodos p
        UNION ALL
        SELECT 'cliente', c.id_cliente,
               COALESCE(c.nombre_fantasia, c.razon_social), 2, 0
        FROM clientes c
        UNION ALL
        SELECT 'localidad', l.id_localidad, l.nombre, 3, 0
        FROM localidades l
        UNION ALL
        SELECT 'marca', m.id_marca, m.nombre, 4, 0
        FROM marcas m
        UNION ALL
        SELECT 'encargado', e.id_encargado_venta, e.nombre_completo, 5, 0
        FROM encargados_ventas e
        UNION ALL
        SELECT 'canal', NULL::int, cm.canal_ajustado, 6, 0
        FROM clasificaciones_marketing cm
        WHERE cm.canal_ajustado IS NOT NULL
        GROUP BY cm.canal_ajustado
        UNION ALL
        SELECT 'unidad_negocio', u.id_unidad_negocio, u.nombre, 7, 0
        FROM unidades_negocio u
    ) t
    ORDER BY t.orden1, t.orden2, t.nombre
    LIMIT 5000;
$$;


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------
--  Tiene que devolver TODOS los períodos, no 0.

SELECT 'total' AS caso, COUNT(*) AS filas FROM fn_filtros_disponibles();
SELECT 'periodos' AS caso, COUNT(*) AS filas FROM fn_filtros_disponibles() WHERE tipo = 'periodo';
SELECT 'tipos' AS caso, COUNT(DISTINCT tipo) AS filas FROM fn_filtros_disponibles();

-- Los períodos tienen que salir con "Mes Año".
SELECT nombre FROM fn_filtros_disponibles() WHERE tipo = 'periodo' ORDER BY nombre;