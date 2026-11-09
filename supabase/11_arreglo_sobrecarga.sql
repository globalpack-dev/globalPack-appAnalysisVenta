-- ============================================================================
--  Corrección: fn_ventas_filtradas quedó sobrecargada
--
--  Qué pasó: al agregarle el 8º parámetro con DEFAULT, quedaron dos funciones
--  con el mismo nombre:
--
--    fn_ventas_filtradas(…7 args)             la anterior
--    fn_ventas_filtradas(…8 args, DEFAULT)    la nueva
--
--  Como el 8º tiene DEFAULT, Postgres deja llamar a la nueva pasando 7
--  argumentos. Entonces cualquier llamada de 7 argumentos —que es lo que hacen
--  las 15 funciones ya existentes— matchea las dos, y Postgres rechaza con
--  "function name is not unique".
--
--  La solución NO es otra sobrecarga: es borrar la de 7. Con una sola función
--  de 8 parámetros, las llamadas de 7 argumentos siguen funcionando porque el
--  último tiene DEFAULT NULL.
--
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS de haber corrido
--  10_filtro_unidad_negocio.sql.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. Se elimina la versión de 7 parámetros
-- ----------------------------------------------------------------------------
--  La firma va explícita: si se omitiera, el nombre solo sería ambiguo y el
--  DROP fallaría con el mismo error.
--
--  Sin CASCADE: si alguna función dependiera de esta, el error lo diría y se
--  ajusta el caso. Con CASCADE se llevarían por delante funciones que no
--  queremos tocar.
--
--  No hay dependencia dura porque el cuerpo de las funciones está escrito como
--  texto delimitado por signos de dólar, no como cuerpo nuevo de Postgres 14+
--  (BEGIN ATOMIC), que sí registraría dependencias.

DROP FUNCTION IF EXISTS public.fn_ventas_filtradas(
    integer, integer, integer, integer, integer, integer, text
);


-- ----------------------------------------------------------------------------
--  2. Se crea de nuevo, ahora con 8 parámetros y sin ambigüedad
-- ----------------------------------------------------------------------------
--  Es la misma del archivo 10. Se repite acá para que este archivo se pueda
--  ejecutar solo, sin depender del orden en que se corrieron los anteriores.
--
--  La unidad de negocio NO está en `ventas`: sale por la cadena
--  producto -> familia -> división -> unidad de negocio. La vista expone el
--  nombre pero no el id, y `01_v_ventas_detalle.sql` no se toca porque otras
--  15 funciones dependen de su forma. Por eso el filtro se resuelve con un
--  EXISTS sobre la cadena en vez de una columna del SELECT.
--
--  EXISTS y no JOIN: filtrar por UN con JOIN obligaría a elegir entre reiterar
--  la fila (INNER) o dejarla con id NULL (LEFT). EXISTS no cambia la cantidad
--  de filas, así que los demás filtros y los SUM no se ven afectados.

CREATE OR REPLACE FUNCTION fn_ventas_filtradas(
    p_anio            int  DEFAULT NULL,
    p_mes             int  DEFAULT NULL,
    p_cliente         int  DEFAULT NULL,
    p_localidad       int  DEFAULT NULL,
    p_marca           int  DEFAULT NULL,
    p_encargado       int  DEFAULT NULL,
    p_canal           text DEFAULT NULL,
    p_unidad_negocio  int  DEFAULT NULL
)
RETURNS SETOF v_ventas_detalle
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT d.*
    FROM v_ventas_detalle d
    JOIN clientes c ON c.id_cliente = d.id_cliente
    WHERE (p_anio      IS NULL OR d.anio = p_anio)
      AND (p_mes       IS NULL OR d.mes = p_mes)
      AND (p_cliente   IS NULL OR d.id_cliente = p_cliente)
      AND (p_localidad IS NULL OR c.id_localidad = p_localidad)
      AND (p_marca     IS NULL OR d.id_producto IN (
              SELECT pr.id_producto FROM productos pr WHERE pr.id_marca = p_marca))
      AND (p_encargado IS NULL OR d.id_encargado_venta = p_encargado)
      AND (p_canal     IS NULL OR d.canal_ajustado = p_canal)
      AND (
          p_unidad_negocio IS NULL
          OR EXISTS (
              SELECT 1
              FROM productos pr2
              JOIN familias f2   ON f2.id_familia   = pr2.id_familia
              JOIN divisiones d2 ON d2.id_division  = f2.id_division
              WHERE pr2.id_producto = d.id_producto
                AND d2.id_unidad_negocio = p_unidad_negocio
          )
      );
$$;


-- ----------------------------------------------------------------------------
--  3. Verificación
-- ----------------------------------------------------------------------------
--  Las llamadas viejas con 7 argumentos tienen que seguir funcionando. Esta
--  comprobación devuelve 0 filas si el filtro está mal (no debería: devuelve
--  todo), y falla si Postgres no puede resolver la firma.
--
--  Se ejecutan las dos: la de 7 argumentos y la de 8, para confirmar que
--  conviven sin ambigüedad.

-- Debe devolver el total de ventas de la base (sin filtro de UN).
SELECT COUNT(*) AS con_7_argumentos FROM fn_ventas_filtradas(NULL, NULL, NULL, NULL, NULL, NULL, NULL);

-- Debe devolver sólo las ventas de la unidad indicada.
SELECT COUNT(*) AS con_8_argumentos FROM fn_ventas_filtradas(NULL, NULL, NULL, NULL, NULL, NULL, NULL, 29);


COMMENT ON FUNCTION fn_ventas_filtradas IS
'Venta con su detalle, aceptando los 8 filtros. La 8º versión reemplaza a la de 7: no pueden coexistir.';