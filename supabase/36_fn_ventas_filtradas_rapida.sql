-- ============================================================================
--  36 — fn_ventas_filtradas sin `SET search_path` (y sin join redundante)
--
--  Síntoma: con 25.004 ventas, TODAS las RPC de Reportes tardaban 7,5–8,4 s y
--  varias se cortaban con `canceling statement due to statement timeout`
--  (SQLSTATE 57014, límite de 8 s del plan gratuito de Supabase). Con 8.705
--  ventas tardaban 2,2 s: el costo crece lineal con las filas.
--
--  Lo que se midió (sólo lectura, vía PostgREST):
--
--    · v_ventas_detalle, 1.000 filas completas ............ 0,8–1,3 s
--    · count(*) sobre v_ventas_detalle (25.004 filas) ..... 0,55 s
--    · fn_ventas_filtradas() devolviendo 1.000 filas ...... 7,8 s
--    · cualquier agregadora (fn_marcas, fn_clientes, …) ... 7,5–8,4 s
--
--  Es decir: la vista y los índices del archivo 19 están bien. La diferencia
--  aparece al pasar por la función.
--
--  Causa: una función SQL que devuelve `SETOF` sólo se **inlinea** en la
--  consulta que la llama si el planificador puede copiar su cuerpo, y entre
--  las condiciones que lo impiden está tener cláusulas `SET` (`proconfig`).
--  `fn_ventas_filtradas` tenía `SET search_path = public`, así que nunca se
--  inlineaba: cada RPC ejecutaba la función como un scan aparte y materializaba
--  el JOIN completo de la vista antes de aplicar límites u órdenes. El
--  `LIMIT` de Reportes/Ventas no podía bajar.
--
--  Arreglo:
--
--    1. Se quita `SET search_path` y se califica cada objeto con su esquema.
--       La función es `SECURITY INVOKER` (no hay escalada de privilegios) y
--       PostgREST fija el search_path de la conexión; no se pierde seguridad.
--    2. Se elimina el `JOIN clientes` redundante: la vista ya joinea `clientes`,
--       así que el filtro de localidad pasa a un `IN (SELECT …)` indexado.
--
--  La firma y el tipo de retorno no cambian: las ~20 funciones que la llaman
--  siguen funcionando sin tocarlas.
--
--  Ejecutar en el SQL Editor de supabase.com. Después correr
--  `36b_verificacion.sql` para ver el plan y los tiempos.
-- ============================================================================


CREATE OR REPLACE FUNCTION public.fn_ventas_filtradas(
    p_anio        int  DEFAULT NULL,
    p_mes         int  DEFAULT NULL,
    p_cliente     int  DEFAULT NULL,
    p_localidad   int  DEFAULT NULL,
    p_marca       int  DEFAULT NULL,
    p_encargado   int  DEFAULT NULL,
    p_canal       text DEFAULT NULL
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
      AND (p_canal     IS NULL OR d.canal_ajustado = p_canal);
$$;

COMMENT ON FUNCTION public.fn_ventas_filtradas(int, int, int, int, int, int, text) IS
'Ventas con los 7 filtros globales. Sin SET search_path a propósito: así el planificador la inlinea y los filtros/LIMIT bajan a la vista (ver 36_*).';
