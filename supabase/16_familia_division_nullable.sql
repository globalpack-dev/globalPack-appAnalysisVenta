-- ============================================================================
--  familias.id_division pasa a ser nullable
--
--  Por qué: con el cambio de la opción A (ver 15_division_en_producto.sql) la
--  división cuelga del PRODUCTO, no de la familia. Una misma familia aparece en
--  hasta 8 divisiones distintas en el Excel real ("REGULAR" está en GASEOSAS,
--  CERVEZAS, VINOS…), así que la familia ya no puede tener una sola división.
--
--  Qué se hace: se le saca el NOT NULL para poder dejarla en NULL cuando no hay
--  una división única que asignarle.
--
--  Por qué NO se le pone una división "por defecto": sería inventar el dato. La
--  columna queda en NULL y `productos.id_division` es la que manda. Las
--  funciones que la leen (`fn_jerarquia_comercial`, `fn_productos`) ya usan
--  `p.id_division` y hacen LEFT JOIN, así que tolerate el NULL.
--
--  La restricción UNIQUE (id_division, nombre) se queda: con id_division en
--  NULL no puede colisionar, porque en Postgres NULL no compara igual a NULL.
--
--  Ejecutar en el SQL Editor de supabase.com, DESPUÉS de 15.
-- ============================================================================


ALTER TABLE familias ALTER COLUMN id_division DROP NOT NULL;


-- ----------------------------------------------------------------------------
--  Verificación
-- ----------------------------------------------------------------------------
--  No puede consultar information_schema por PostgREST, así que la prueba la
--  hace la carga: si la columna siguiera siendo NOT NULL, el INSERT de familias
--  fallaría con el mismo error de antes.

SELECT nombre, id_division FROM familias ORDER BY nombre;