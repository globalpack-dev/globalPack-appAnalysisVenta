-- ============================================================================
--  fn_filtros_disponibles devuelve UN JSONB en vez de una fila por opción
--
--  Qué pasaba: con los datos reales (1.542 clientes) la función devolvía
--  exactamente 1.000 filas. El corte NO lo hace el `LIMIT` del SQL sino
--  `db-max-rows` de PostgREST, que en Supabase Cloud viene en 1.000 por
--  defecto. El `LIMIT 5000` que se agreó en 17_limite_catalogo.sql no sirve
--  para nada: el motor nunca ve más de 1.000 filas.
--
--  Con el orden anterior, los períodos caían al final del UNION y se perdían.
--  Peor: con el orden nuevo (orden1 = 1..6 para el resto, anio para período) los
--  períodos quedaron PRIMERO porque 2026 > 6, y las 1.000 filas fueron todas de
--  tipo cliente. El catálogo quedó peor que antes.
--
--  La solución que no depende de la configuración del proyecto: devolver una
--  SOLA fila con todo el catálogo adentro, como jsonb.
--
--    · 1 fila = nunca hay truncado, sin importar cuántos clientes haya
--    · no depende de `db-max-rows`, que es un ajuste del dashboard
--    · supabase-js devuelve el jsonb ya parseado como objeto
--
--  El shape es el mismo de antes (lista por tipo), así que `agruparOpciones` y
--  las páginas no cambian salvo el hook, que aplana el objeto a la lista de
--  siempre.
--
--  Requiere DROP: Postgres no deja cambiar el tipo de retorno.
-- ============================================================================


DROP FUNCTION IF EXISTS public.fn_filtros_disponibles();


CREATE OR REPLACE FUNCTION fn_filtros_disponibles()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'periodo', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', p.id_periodo, 'nombre', p.nombre_mes || ' ' || p.anio::text)
                ORDER BY p.anio, p.mes
            )
            FROM periodos p
        ), '[]'::jsonb),

        -- `nombre_fantasia` es NULL en parte de los clientes: se cae a la razón
        -- social, igual que en `fn_clientes`.
        'cliente', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', c.id_cliente,
                    'nombre', COALESCE(c.nombre_fantasia, c.razon_social)
                )
                ORDER BY COALESCE(c.nombre_fantasia, c.razon_social)
            )
            FROM clientes c
        ), '[]'::jsonb),

        'localidad', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', l.id_localidad, 'nombre', l.nombre) ORDER BY l.nombre)
            FROM localidades l
        ), '[]'::jsonb),

        'marca', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', m.id_marca, 'nombre', m.nombre) ORDER BY m.nombre)
            FROM marcas m
        ), '[]'::jsonb),

        'encargado', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', e.id_encargado_venta, 'nombre', e.nombre_completo)
                ORDER BY e.nombre_completo
            )
            FROM encargados_ventas e
        ), '[]'::jsonb),

        -- Los canales no tienen id propio en `clasificaciones_marketing`: el id es
        -- NULL y hay que deduplicar por nombre.
        --
        -- La deduplicación va en un subquery interno, no con DISTINCT en el
        -- `jsonb_agg`. Con DISTINCT, Postgres exige que las expresiones del
        -- ORDER BY aparezcan en la lista de argumentos del agregado
        -- (42P10), y acá la expresión está dentro del jsonb_build_object.
        --
        -- Tampoco puede ser `GROUP BY cm.canal_ajustado`: con GROUP BY el
        -- jsonb_agg devuelve una fila por grupo, el subquery devolvía 5 y el
        -- COALESCE lo rechazaba con "more than one row returned by a subquery".
        'canal', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', NULL, 'nombre', c.nombre)
                ORDER BY c.nombre
            )
            FROM (
                SELECT DISTINCT cm.canal_ajustado AS nombre
                FROM clasificaciones_marketing cm
                WHERE cm.canal_ajustado IS NOT NULL
            ) c
        ), '[]'::jsonb),

        'unidad_negocio', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('id', u.id_unidad_negocio, 'nombre', u.nombre)
                ORDER BY u.nombre
            )
            FROM unidades_negocio u
        ), '[]'::jsonb)
    );
$$;


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------
--  Tiene que devolver 1 sola fila con las 7 claves y todos los períodos.

SELECT jsonb_typeof(fn_filtros_disponibles()) AS tipo;

SELECT jsonb_object_keys(fn_filtros_disponibles()) AS clave;

SELECT jsonb_array_length(fn_filtros_disponibles() -> 'periodo') AS periodos,
       jsonb_array_length(fn_filtros_disponibles() -> 'cliente') AS clientes,
       jsonb_array_length(fn_filtros_disponibles() -> 'canal')    AS canales;

SELECT e ->> 'nombre' AS periodo
FROM jsonb_array_elements(fn_filtros_disponibles() -> 'periodo') e;