-- ============================================================================
--  La división pasa a estar en el producto
--
--  Por qué: el Excel real no respeta la jerarquía familia → división. Se comprobó
--  sobre "Base Plana JDV (1).xlsx":
--
--    REGULAR     → GASEOSAS, CERVEZAS, ISOTONICAS, AGUAS, MERCHAND MKTPLACE,
--                  BEBIDAS SABORIZADAS, VINOS, ALIMENTOS MKTPLACE  (8 divisiones)
--    SIN AZUCAR  → BEBIDAS SABORIZADAS, GASEOSAS, ISOTONICAS       (3 divisiones)
--
--  En el Excel la DIVISIÓN manda sobre la FAMILIA: "REGULAR CERVEZAS" y
--  "REGULAR VINOS" son productos distintos que el archivo colapsa en la misma
--  familia. El modelo de la base es al revés, así que sin este cambio cada
--  venta se imputaría a la división de la primera fila donde aparece su
--  familia, y "Ventas por Unidad de Negocio" mostraría datos falsos.
--
--  Qué hace: `productos` recibe su propia `id_division`, y las 4 funciones que
--  bajaban por la familia pasan a leerla del producto. Ninguna cambia de firma,
--  así que no hay riesgo de sobrecarga (el problema de los archivos 11 a 14).
--
--  Ejecutar en el SQL Editor de supabase.com.
--
--  IMPORTANTE — el SQL Editor envuelve todo el archivo en UNA transacción. Si
--  una sola sentencia falla, se revierte TODO, incluidas las anteriores. Por eso
--  un error a mitad de camino no deja el esquema a medio cambiar: o se aplicó
--  entero o no se aplicó nada. Se puede volver a correr el archivo completo sin
--  riesgo.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  1. La columna
-- ----------------------------------------------------------------------------
--  NULLABLE a propósito: hasta que se carguen los productos reales, los del
--  seed pueden quedar sin división. Las funciones usan LEFT JOIN para que
--  esos productos no desaparezcan de los listados.

ALTER TABLE productos ADD COLUMN IF NOT EXISTS id_division integer
    REFERENCES divisiones(id_division);


-- ----------------------------------------------------------------------------
--  2. Backfill para lo que ya existe
-- ----------------------------------------------------------------------------
--  Los productos del seed sí respetan la jerarquía (el seed se generó con el
--  modelo viejo), así que su división se puede derivar de la familia.
--  Los que no tienen familia quedan en NULL y se completarán con la carga real.

UPDATE productos p
SET id_division = f.id_division
FROM familias f
WHERE f.id_familia = p.id_familia
  AND p.id_division IS NULL;


-- ----------------------------------------------------------------------------
--  3. v_ventas_detalle — la división sale del producto
-- ----------------------------------------------------------------------------
--  Se recrea con las MISMAS columnas en el mismo orden: `CREATE OR REPLACE
--  VIEW` falla si cambia la lista de columnas, y esta vista la usan 15 funciones.
--
--  `LEFT JOIN` en divisiones y unidades a propósito: con INNER, un producto sin
--  divisions cargada haría desaparecer sus ventas de todos los reportes. Es
--  peor mostrar una venta sin división que no mostrarla.

CREATE OR REPLACE VIEW v_ventas_detalle AS
SELECT
    v.id_venta,
    v.id_periodo,
    v.id_cliente,
    v.id_sucursal,
    v.id_encargado_venta,
    v.id_producto,
    v.id_clasificacion_marketing,

    -- Período
    p.anio,
    p.mes,
    p.nombre_mes,
    p.nombre_mes || ' ' || p.anio::text AS periodo_label,

    -- Cliente
    c.codigo_cliente,
    COALESCE(c.nombre_fantasia, c.razon_social) AS cliente_nombre,

    -- Sucursal
    su.nombre AS sucursal_nombre,

    -- Encargado de venta (el prototipo lo llamaba "sector")
    ev.codigo_sector_venta,
    ev.nombre_completo AS encargado_nombre,

    -- Supervisor del encargado
    sv.nombre_completo AS supervisor_nombre,

    -- Producto y su jerarquía.
    -- La división viene del PRODUCTO, no de la familia: ver la nota del
    -- encabezado de este archivo.
    pr.codigo_producto,
    pr.nombre AS producto_nombre,
    m.nombre AS marca_nombre,
    f.nombre AS familia_nombre,
    d.nombre AS division_nombre,
    un.nombre AS unidad_negocio_nombre,
    cal.nombre AS calibre_nombre,

    -- Clasificación de marketing
    cm.canal_ajustado,
    cm.segmento_mkt,
    cm.canal_mkt,
    cm.subcanal_mkt,

    -- Importes y cantidades
    v.importe_neto,
    v.importe_bruto,
    v.importe_final,
    v.cantidad_bultos,
    v.cantidad_hl
FROM ventas v
JOIN periodos p
    ON p.id_periodo = v.id_periodo
JOIN clientes c
    ON c.id_cliente = v.id_cliente
JOIN sucursales su
    ON su.id_sucursal = v.id_sucursal
JOIN encargados_ventas ev
    ON ev.id_encargado_venta = v.id_encargado_venta
LEFT JOIN supervisores sv
    ON sv.id_supervisor = ev.id_supervisor
JOIN productos pr
    ON pr.id_producto = v.id_producto
LEFT JOIN marcas m
    ON m.id_marca = pr.id_marca
JOIN familias f
    ON f.id_familia = pr.id_familia
LEFT JOIN divisiones d
    ON d.id_division = pr.id_division
LEFT JOIN unidades_negocio un
    ON un.id_unidad_negocio = d.id_unidad_negocio
LEFT JOIN calibres cal
    ON cal.id_calibre = pr.id_calibre
LEFT JOIN clasificaciones_marketing cm
    ON cm.id_clasificacion_marketing = v.id_clasificacion_marketing;


-- ----------------------------------------------------------------------------
--  4. fn_ventas_filtradas — el filtro por unidad usa la división del producto
-- ----------------------------------------------------------------------------
--  Misma firma que en 11_arreglo_sobrecarga.sql: sólo cambia el cuerpo. Por eso
--  no hace falta DROP previo.

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
              LEFT JOIN divisiones d2 ON d2.id_division = pr2.id_division
              WHERE pr2.id_producto = d.id_producto
                AND d2.id_unidad_negocio = p_unidad_negocio
          )
      );
$$;


-- ----------------------------------------------------------------------------
--  5. fn_ventas_por_unidad_negocio
-- ----------------------------------------------------------------------------
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
    JOIN productos pr        ON pr.id_producto = di.id_producto
    LEFT JOIN divisiones d   ON d.id_division = pr.id_division
    LEFT JOIN unidades_negocio un ON un.id_unidad_negocio = d.id_unidad_negocio
    GROUP BY un.id_unidad_negocio, un.nombre
    ORDER BY SUM(di.importe_neto) DESC;
$$;


-- ----------------------------------------------------------------------------
--  6. fn_jerarquia_comercial — el árbol comercial
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_jerarquia_comercial(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_unidad_negocio integer,
    nombre_unidad     varchar,
    id_division       integer,
    nombre_division   varchar,
    id_familia        integer,
    nombre_familia    varchar,
    id_producto       integer,
    codigo_producto   varchar,
    nombre_producto   varchar,
    ventas            numeric,
    bultos            numeric,
    hl                numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH agg AS (
        SELECT
            id_producto,
            SUM(importe_neto)    AS ventas,
            SUM(cantidad_bultos) AS bultos,
            SUM(cantidad_hl)     AS hl
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
        GROUP BY id_producto
    )
    SELECT
        un.id_unidad_negocio,
        un.nombre,
        d.id_division,
        d.nombre,
        f.id_familia,
        f.nombre,
        p.id_producto,
        p.codigo_producto,
        p.nombre,
        COALESCE(agg.ventas, 0),
        COALESCE(agg.bultos, 0),
        COALESCE(agg.hl, 0)
    FROM productos p
    JOIN familias f            ON f.id_familia = p.id_familia
    LEFT JOIN divisiones d     ON d.id_division = p.id_division
    LEFT JOIN unidades_negocio un ON un.id_unidad_negocio = d.id_unidad_negocio
    LEFT JOIN marcas m         ON m.id_marca = p.id_marca
    LEFT JOIN agg              ON agg.id_producto = p.id_producto
    WHERE (p_marca IS NULL OR p.id_marca = p_marca)
    ORDER BY un.nombre, d.nombre, f.nombre, p.nombre;
$$;


-- ----------------------------------------------------------------------------
--  7. fn_productos — expone la división del producto
-- ----------------------------------------------------------------------------
--  ACÁ HACE FALTA EL DROP, Y NO ES OPCIONAL.
--
--  Postgres NO admite cambiar el tipo de retorno con CREATE OR REPLACE, y
--  "cambiar el tipo de retorno" incluye AGREGAR columnas, aunque sean al final
--  y en el mismo orden. El tipo de retorno es la fila completa: sumar una
--  columna la cambia igual. Por eso `CREATE OR REPLACE` falla con 42P13 y el
--  propio mensaje pide el DROP.
--
--  Por el mismo motivo el cuerpo se reescribe por completo y no se intenta
--  conservar nada: una vez dropeada, la función deja de existir y se crea de
--  cero con las 17 columnas.
--
--  El SELECT conserva el original (`ventas, bultos, hl, unidades` con
--  COUNT(*) como unidades) y le agrega la división al final. Lo único que cambia
--  en el criterio es que la división sale del PRODUCTO (`p.id_division`) en vez
--  de salir de la familia (`f.id_division`).

DROP FUNCTION IF EXISTS public.fn_productos(
    integer, integer, integer, integer, integer, integer, text
);


CREATE OR REPLACE FUNCTION fn_productos(
    p_anio      int  DEFAULT NULL,
    p_mes       int  DEFAULT NULL,
    p_cliente   int  DEFAULT NULL,
    p_localidad int  DEFAULT NULL,
    p_marca     int  DEFAULT NULL,
    p_encargado int  DEFAULT NULL,
    p_canal     text DEFAULT NULL
)
RETURNS TABLE (
    id_producto     integer,
    codigo_producto varchar,
    nombre          varchar,
    id_marca        integer,
    marca_nombre    varchar,
    id_calibre      integer,
    calibre_nombre  varchar,
    id_familia      integer,
    familia_nombre  varchar,
    ventas          numeric,
    bultos          numeric,
    hl              numeric,
    unidades        numeric,
    -- Nuevas, al final para no romper el tipo de retorno:
    id_division       integer,
    division_nombre   varchar,
    id_unidad_negocio integer,
    unidad_nombre     varchar
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH agg AS (
        SELECT
            id_producto,
            SUM(importe_neto)    AS ventas,
            SUM(cantidad_bultos) AS bultos,
            SUM(cantidad_hl)     AS hl,
            COUNT(*)             AS unidades
        FROM fn_ventas_filtradas(
            p_anio, p_mes, p_cliente, p_localidad, p_marca, p_encargado, p_canal
        )
        GROUP BY id_producto
    )
    SELECT
        p.id_producto,
        p.codigo_producto,
        p.nombre,
        m.id_marca,
        m.nombre,
        cal.id_calibre,
        cal.nombre,
        f.id_familia,
        f.nombre,
        COALESCE(agg.ventas, 0),
        COALESCE(agg.bultos, 0),
        COALESCE(agg.hl, 0),
        COALESCE(agg.unidades, 0),
        -- La división viene del producto, no de la familia.
        d.id_division,
        d.nombre,
        un.id_unidad_negocio,
        un.nombre
    FROM productos p
    LEFT JOIN marcas m     ON m.id_marca = p.id_marca
    LEFT JOIN calibres cal ON cal.id_calibre = p.id_calibre
    JOIN familias f        ON f.id_familia = p.id_familia
    LEFT JOIN divisiones d ON d.id_division = p.id_division
    LEFT JOIN unidades_negocio un ON un.id_unidad_negocio = d.id_unidad_negocio
    LEFT JOIN agg          ON agg.id_producto = p.id_producto
    WHERE (p_marca IS NULL OR p.id_marca = p_marca)
    ORDER BY COALESCE(agg.ventas, 0) DESC, p.nombre;
$$;


-- ----------------------------------------------------------------------------
--  8. Verificación
-- ----------------------------------------------------------------------------
--  Las funciones tienen que seguir respondiendo. Si alguna quedó ambigua o con
--  error, es que el cambio de cuerpo no aplicó.

SELECT 'vista' AS caso, COUNT(*) AS filas FROM v_ventas_detalle;

SELECT 'productos sin division' AS caso, COUNT(*) AS filas
FROM productos WHERE id_division IS NULL;

SELECT 'UN' AS caso, COUNT(*) AS filas FROM fn_ventas_por_unidad_negocio();
SELECT 'jerarquia' AS caso, COUNT(*) AS filas FROM fn_jerarquia_comercial();
SELECT 'productos' AS caso, COUNT(*) AS filas FROM fn_productos();
SELECT 'kpis' AS caso, total_neto FROM fn_dashboard_kpis();