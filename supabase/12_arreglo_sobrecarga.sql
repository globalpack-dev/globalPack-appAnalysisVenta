-- ============================================================================
--  Corrección 2: sobrecarga en las 6 funciones que consumen p_unidad_negocio
--
--  El archivo 11 arregló `fn_ventas_filtradas`, pero el mismo defecto quedó en
--  las 6 funciones que el archivo 10 reescribió con un parámetro más: la versión
--  vieja (sin p_unidad_negocio) y la nueva conviven bajo el mismo nombre.
--
--  Como el parámetro nuevo tiene DEFAULT NULL, Postgres acepta llamar a la
--  nueva pasando los argumentos viejos, así que cualquier llamada con la firma
--  corta matchea las dos y falla con:
--
--      ERROR: could not choose the best candidate function between
--
--  Qué hace este archivo: borra las 6 versiones viejas. Se quedan las nuevas,
--  que aceptan las llamadas viejas porque el último parámetro tiene DEFAULT.
--
--  No hace falta recrear nada: las versiones de 8 parámetros ya existen y son
--  correctas (las creó el archivo 10).
--
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS de 10 y de 11.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  Las 6 versiones viejas, con su firma explícita
-- ----------------------------------------------------------------------------
--  La firma va explícita porque si se omitiera el nombre solo sería ambiguo y
--  el propio DROP fallaría con el mismo error que estamos corrigiendo.
--
--  Sin CASCADE: si algo dependiera de estas funciones, es mejor que el error lo
--  diga que borrar en cascada funciones que no queremos tocar.

-- Firma: (p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal)
DROP FUNCTION IF EXISTS public.fn_dashboard_kpis(
    integer, integer, integer, integer, integer, integer, text
);

DROP FUNCTION IF EXISTS public.fn_dashboard_variaciones(
    integer, integer, integer, integer, integer, integer, text
);

DROP FUNCTION IF EXISTS public.fn_clientes(
    integer, integer, integer, integer, integer, integer, text
);

-- Mismos tipos que las anteriores. El orden de los argumentos NO forma parte de
-- la firma: Postgres identifica la función por el tipo de cada parámetro, así
-- que este DROP también la alcanza aunque p_cliente venga primero.
DROP FUNCTION IF EXISTS public.fn_cliente_detalle(
    integer, integer, integer, integer, integer, integer, text
);

DROP FUNCTION IF EXISTS public.fn_marcas(
    integer, integer, integer, integer, integer, integer, text
);

-- Esta tenía 9 parámetros: los 6 filtros + p_canal, p_segmento y p_canal_mkt.
DROP FUNCTION IF EXISTS public.fn_marketing_por(
    integer, integer, integer, integer, integer, integer, text, text, text
);


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------
--  Cada consulta tiene que devolver filas. Si alguna devuelve el error
--  "could not choose the best candidate", quedó alguna versión vieja.
--
--  Los números también tienen que variar con p_unidad_negocio: si dieran
--  siempre lo mismo, el filtro no se estaría aplicando.

SELECT 'fn_dashboard_kpis' AS funcion, total_neto, operaciones
FROM fn_dashboard_kpis();

SELECT 'fn_dashboard_kpis UN29' AS funcion, total_neto, operaciones
FROM fn_dashboard_kpis(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 29);

SELECT 'fn_clientes' AS funcion, COUNT(*) AS filas, SUM(ventas_total) AS total
FROM fn_clientes();

SELECT 'fn_clientes UN29' AS funcion, COUNT(*) AS filas, SUM(ventas_total) AS total
FROM fn_clientes(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 29);

SELECT 'fn_marcas' AS funcion, COUNT(*) AS filas
FROM fn_marcas();

SELECT 'fn_marcas UN29' AS funcion, COUNT(*) AS filas
FROM fn_marcas(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 29);

SELECT 'fn_marketing_por' AS funcion, COUNT(*) AS filas
FROM fn_marketing_por();

SELECT 'fn_marketing_por UN29' AS funcion, COUNT(*) AS filas
FROM fn_marketing_por(NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 29);


-- ----------------------------------------------------------------------------
--  Que no queden vestigios de las versiones viejas
-- ----------------------------------------------------------------------------
--  Esta consulta lista las sobrecargas que quedaron. Tiene que devolver 0
--  filas para todas las funciones que saja aceptan p_unidad_negocio.
--  Si alguna aparece con dos firmas, es que un DROP quedó sin aplicar.

SELECT
    p.proname AS funcion,
    pg_get_function_arguments(p.oid) AS argumentos
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'fn_ventas_filtradas',
      'fn_dashboard_kpis',
      'fn_dashboard_variaciones',
      'fn_clientes',
      'fn_cliente_detalle',
      'fn_marcas',
      'fn_marketing_por'
  )
ORDER BY p.proname, argumentos;