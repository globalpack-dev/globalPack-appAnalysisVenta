-- ============================================================================
--  fn_filtros_disponibles: períodos con ventas + mes/año numéricos
--
--  Dos problemas que se veían juntos en el Dashboard:
--
--  1. El catálogo devolvía TODOS los períodos de `periodos`, incluidos los que
--     no tienen ventas (2025). Elegir uno dejaba todos los indicadores en cero.
--     Ahora sólo aparecen los períodos con al menos una venta.
--
--  2. El Dashboard y Reportes mandaban `p_mes = periodos.id_periodo`, pero
--     `fn_ventas_filtradas` compara `p_mes` contra `d.mes` (1..12). Por eso
--     cualquier selección de mes devolvía 0 filas. El catálogo ahora expone
--     `mes` y `anio` para que las páginas manden el mes real y el año juntos.
--
--  No cambia la firma ni el tipo de retorno (jsonb): no requiere DROP.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_filtros_disponibles()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        -- Sólo períodos con ventas: un filtro que garantiza cero resultados no
        -- sirve. El orden sigue siendo cronológico.
        'periodo', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', p.id_periodo,
                    'nombre', p.nombre_mes || ' ' || p.anio::text,
                    'mes', p.mes,
                    'anio', p.anio
                )
                ORDER BY p.anio, p.mes
            )
            FROM periodos p
            WHERE EXISTS (
                SELECT 1 FROM ventas v WHERE v.id_periodo = p.id_periodo
            )
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
