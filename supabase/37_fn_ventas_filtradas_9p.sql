-- ============================================================================
--  37 — fn_ventas_filtradas: la versión VIVA (9 parámetros), ahora inlineable
--
--  Este archivo corrige dos cosas del 36:
--
--   1. El 36 creó una sobrecarga de **7 parámetros**, pero la función que usan
--      las ~20 agregadoras es la de **9 parámetros** que dejó
--      `22_categorias.sql` (los 7 filtros + `p_unidad_negocio` + `p_categoria`).
--      Como las dos quedaron con argumentos `DEFAULT`, cualquier llamada con 7
--      argumentos o menos pasó a ser ambigua:
--
--          ERROR 42725: function public.fn_ventas_filtradas() is not unique
--
--      Por eso el 36 no cambió nada en Reportes y su verificación no corría.
--
--   2. La versión de 9 parámetros seguía con `SET search_path = public`, que es
--      lo que impide que el planificador inlinee la función. Sin inlining, cada
--      RPC resuelve las 30+ columnas de `v_ventas_detalle` (14 joins por fila)
--      aunque la agregación use sólo 8: 7,5–8,4 s con 25.004 ventas, justo en el
--      `statement_timeout` de 8 s.
--
--  Qué hace este archivo:
--
--   · DROP de la sobrecarga de 7 parámetros que agregó el 36. Queda una sola
--     función, así que desaparece la ambigüedad (las llamadas de 7 argumentos
--     siguen funcionando: los dos últimos parámetros tienen DEFAULT).
--   · CREATE OR REPLACE de la versión de 9 parámetros, con la MISMA lógica de
--     filtros (incluido el `EXISTS` de unidad de negocio y el de categoría),
--     pero sin `SET search_path` y con todo calificado como `public.`.
--   · Se quita el `JOIN clientes` redundante: la vista ya joinea `clientes`, y
--     el filtro de localidad se resuelve con un `IN` sobre la PK.
--
--  La firma y el tipo de retorno siguen iguales: las agregadoras no se tocan.
--
--  Ejecutar en el SQL Editor de supabase.com. Después, `37b_verificacion.sql`.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Fuera la sobrecarga que dejó el 36
-- ----------------------------------------------------------------------------
--  La firma va explícita: un DROP por nombre sería ambiguo con dos versiones.

DROP FUNCTION IF EXISTS public.fn_ventas_filtradas(
    integer, integer, integer, integer, integer, integer, text
);


-- ----------------------------------------------------------------------------
--  2. La versión de 9 parámetros, sin SET y sin el join redundante
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_ventas_filtradas(
    p_anio            int  DEFAULT NULL,
    p_mes             int  DEFAULT NULL,
    p_cliente         int  DEFAULT NULL,
    p_localidad       int  DEFAULT NULL,
    p_marca           int  DEFAULT NULL,
    p_encargado       int  DEFAULT NULL,
    p_canal           text DEFAULT NULL,
    p_unidad_negocio  int  DEFAULT NULL,
    p_categoria       text DEFAULT NULL
)
RETURNS SETOF public.v_ventas_detalle
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT d.*
    FROM public.v_ventas_detalle d
    WHERE (p_anio      IS NULL OR d.anio = p_anio)
      AND (p_mes       IS NULL OR d.mes = p_mes)
      AND (p_cliente   IS NULL OR d.id_cliente = p_cliente)
      AND (p_localidad IS NULL OR d.id_cliente IN (
              SELECT c.id_cliente
              FROM public.clientes c
              WHERE c.id_localidad = p_localidad))
      AND (p_marca     IS NULL OR d.id_producto IN (
              SELECT pr.id_producto
              FROM public.productos pr
              WHERE pr.id_marca = p_marca))
      AND (p_encargado IS NULL OR d.id_encargado_venta = p_encargado)
      AND (p_canal     IS NULL OR d.canal_ajustado = p_canal)
      AND (
          p_unidad_negocio IS NULL
          OR EXISTS (
              SELECT 1
              FROM public.productos pr2
              LEFT JOIN public.divisiones d2 ON d2.id_division = pr2.id_division
              WHERE pr2.id_producto = d.id_producto
                AND d2.id_unidad_negocio = p_unidad_negocio
          )
      )
      AND (
          p_categoria IS NULL
          -- Comparación por texto porque el filtro manda el nombre que ve el
          -- usuario. `cat.nombre OR padre.nombre`: elegir "Marketplace" trae
          -- Mercadería, Alimentos y Yerbas.
          OR EXISTS (
              SELECT 1
              FROM public.productos pr3
              JOIN public.divisiones d3   ON d3.id_division  = pr3.id_division
              JOIN public.categorias cat  ON cat.id_categoria = d3.id_categoria
              LEFT JOIN public.categorias padre ON padre.id_categoria = cat.id_padre
              WHERE pr3.id_producto = d.id_producto
                AND (cat.nombre = p_categoria OR padre.nombre = p_categoria)
          )
      );
$$;

COMMENT ON FUNCTION public.fn_ventas_filtradas(int, int, int, int, int, int, text, int, text) IS
'Ventas con los 9 filtros globales. Sin SET search_path a propósito: así el planificador la inlinea y puede podar columnas y joins de v_ventas_detalle (ver 37_*).';
