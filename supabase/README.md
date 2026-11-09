# SQL de la capa de datos

> ## ⚠️ Este README es el original de las 2 primeras migraciones
>
> El proyecto ya tiene **59 archivos SQL aplicados**. El orden vigente, qué hace cada
> uno y las trampas que costaron caro están en **[`ESTADO.md`](ESTADO.md)**. Empezá
> por ahí. La tabla de "Orden de ejecución" de más abajo quedó chica y no debe usarse
> como guía.

Funciones y vistas que unen el modelo normalizado de la base con lo que espera
el prototipo.

> **No se ejecutan desde la app.** Se ejecutan a mano en el
> **SQL Editor de supabase.com** → proyecto → **SQL Editor** → New query.
> Los archivos quedan versionados acá porque el SQL Editor no guarda historial:
> el repo es el respaldo.

---

## Orden de ejecución

| # | Archivo | Qué crea | Depende de |
| --- | --- | --- | --- |
| 1 | `01_v_ventas_detalle.sql` | La vista `v_ventas_detalle` | `database.sql` |
| 2 | `02_funciones_agregacion.sql` | 10 funciones | Del archivo 1 |

Ejecutá el 1 primero. El 2 falla sin la vista, porque `fn_ventas_filtradas` devuelve
`SETOF v_ventas_detalle`.

Cada `CREATE` es `OR REPLACE`, así que podés volver a correrlos sin error.

---

## Qué hay en cada archivo

### `01_v_ventas_detalle.sql`

Una vista. Reúne por joins los 40 campos que necesita `Sales.tsx`.

Por qué: tu tabla `ventas` es normalizada y guarda sólo FKs, pero el prototipo
muestra y ordena por nombres (`clienteNombre`, `marcaNombre`, `productoNombre`…). Sin
esta vista, la tabla de Ventas mostraría IDs.

Una decisión que quedó documentada en el SQL: usa
`COALESCE(c.nombre_fantasia, c.razon_social)` como nombre del cliente, porque en tu
muestra **2 de cada 4 clientes tienen `nombre_fantasia` en NULL** y el prototipo hacía
`nombreFantasia.charAt(0)` sin protección (eso rompe la app).

### `02_funciones_agregacion.sql`

10 funciones. Todas aceptan los mismos 7 filtros que el panel "Filtros globales",
que en el prototipo eran decorativos: cambiaban el color del `<select>` pero ningún
número se movía.

| Función | Devuelve | Reemplaza |
| --- | --- | --- |
| `fn_ventas_filtradas` | Helper. Aplicar los 7 filtros | — |
| `fn_dashboard_kpis` | Los 8 KPIs en **una** fila | 7 `reduce` de `Dashboard.tsx` |
| `fn_ventas_mensuales` | Serie mes a mes | `ventasMensuales` |
| `fn_top_clientes` | Ranking | `clientes.sort()` |
| `fn_ventas_por_encargado` | Ranking por persona | `sectores.sort()` |
| `fn_ventas_por_localidad` | Distribución geográfica | `localidades.sort()` |
| `fn_ventas_por_unidad_negocio` | Gráfico de UN | `unidadesNegocio.map()` |
| `fn_ventas_por_marca` | Pie de marcas | `marcas` directo |
| `fn_marketing_por` | Las 4 dimensiones de marketing | 26 `reduce` de `Marketing.tsx` |
| `fn_filtros_disponibles` | Opciones de los `<select>` | Años y canales hardcodeados |

### `fn_marketing_por` devuelve las 4 dimensiones, no una

No recibe un parámetro de nivel. Devuelve una fila por **combinación** de
clasificación, con las 4 dimensiones y sus métricas:

```
canal_ajustado | segmento_mkt | canal_mkt | subcanal_mkt | ventas | bultos | hl | clientes
```

El drill-down se hace en el frontend: se agrupa por la dimensión que se está
mostrando, y la selección se encadena pasando el nivel anterior como filtro
(`p_canal`, `p_segmento`, `p_canal_mkt`).

El resultado es diminuto: una fila por combinación de clasificación, no una por
venta. Con las 25.004 ventas actuales la lógica es la misma (esta nota se escribió con
8.705 registros cargados).

**Por qué sin SQL dinámico:** la primera versión usaba
`EXECUTE format(..., %I)` con el nombre de la columna. Eso obligaba a construir el
`WHERE` fuera del `EXECUTE`, donde PL/pgSQL concatena texto crudo — un vector de
inyección. Además `RETURN QUERY WITH ... EXECUTE` es sintaxis inválida en PL/pgSQL.
Las 10 funciones son ahora `LANGUAGE sql`, sin `EXECUTE` ni `format()`.

---

## Cuatro decisiones que conviene conocer antes de ejecutar

**1. `SECURITY INVOKER`, no `DEFINER`.** Con `DEFINER` las funciones se ejecutarían
como el dueño y **se saltarían las políticas RLS**. La decisión se tomó **antes** de
que existiera RLS, para no tener que auditar 10 funciones después. Hoy RLS está
activo en las 15 tablas y las funciones siguen siendo `INVOKER`.

**2. `SET search_path = public`.** Medida estándar: evita que alguien pueda redefinir
una función y cambiarle el comportamiento.

**3. Las 10 funciones son `LANGUAGE sql`, sin `EXECUTE` ni `format()`.** No hay SQL
dinámico, así que no hay superficie de inyección. Los 9 parámetros los bindea Postgres.

**4. `fn_ventas_mensuales` no devuelve `objetivo`.** Las metas no están en el Excel:
las define el negocio y todavía no están implementadas.

---

## Cómo verificar que funcionaron

Después de ejecutar, corré estas consultas en el SQL Editor. Deberían devolver filas.

```sql
-- 1. La vista trae los nombres resueltos
SELECT cliente_nombre, producto_nombre, marca_nombre, periodo_label, importe_neto
FROM v_ventas_detalle
LIMIT 5;

-- 2. Los KPIs devuelven una fila con 8 columnas
SELECT * FROM fn_dashboard_kpis();

-- 3. La serie mensual agrupa por período
SELECT anio, mes, nombre_mes, importe_neto
FROM fn_ventas_mensuales()
ORDER BY anio, mes;

-- 4. El ranking trae participación
SELECT cliente_nombre, ventas, participacion
FROM fn_top_clientes(5);

-- 5. Marketing devuelve las 4 dimensiones juntas
SELECT * FROM fn_marketing_por();

-- 6. Drill-down: filtrando por canal, sólo sale ese canal
SELECT * FROM fn_marketing_por(p_canal => 'K+T');

-- 7. Los filtros salen de la base, no hardcodeados
SELECT tipo, nombre FROM fn_filtros_disponibles();
```

### Probar los filtros de verdad

```sql
-- Con filtro de marca, los KPIs tienen que dar DISTINTOS a los sin filtro
SELECT total_neto FROM fn_dashboard_kpis();
SELECT total_neto FROM fn_dashboard_kpis(p_marca => (SELECT id_marca FROM marcas LIMIT 1));

-- Filtro que no matchea nada: debe dar 0, no NULL ni error
SELECT total_neto FROM fn_dashboard_kpis(p_canal => 'CANAL_INEXISTENTE');
```

### Confirmar que las 10 funciones existen

El editor corta la ejecución en el primer error, así que si algo falló, las funciones
posteriores pueden no haberse creado.

```sql
SELECT proname FROM pg_proc WHERE proname LIKE 'fn_%' ORDER BY proname;
```

---

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| `relation "v_ventas_detalle" does not exist` | Corriste el archivo 2 antes del 1 |
| `structure of query does not match function result type` | Falta regenerar el archivo 1 después de cambiarla |
| `must appear in GROUP BY` | `fn_ventas_por_encargado`: agrupá por la columna, no por `MIN()` de otra |
| Todo devuelve 0 filas | La base está vacía. Cargá los datos reales con `npx tsx scripts/cargar-excel.ts --aplicar` o desde **«Cargar datos»** en la app |

**Antes de reportar un error**, verificá que la conexión anda: `npm run verificar`
corre 90 pruebas contra la base real. Si eso pasa, el problema está en el SQL que
acabás de ejecutar.

> ℹ️ **El seed fue eliminado el 04/11/2026** junto con `src/data/mockData.ts`. Ya no
> existe un comando que borre las tablas. Los datos reales se cargan desde la app o
> con `npx tsx scripts/cargar-excel.ts --aplicar`.

---

## Verificación de sintaxis

Ambos archivos fueron validados con un parser de Postgres (`pgsql-ast-parser`)
instalado fuera del proyecto, en un directorio temporal.

- `01_v_ventas_detalle.sql`: **sintaxis correcta**
- `02_funciones_agregacion.sql`: **9 de 10 sentencias correctas**. La décima
  (`fn_ventas_filtradas`) usa `RETURNS SETOF <nombre_de_vista>`, que el parser no
  soporta pero Postgres sí. Se verificó que la construcción es válida aislada.

### Tres errores reales que la validación estática NO detectó

Salieron al ejecutar contra la base. Quedan documentados porque son la clase de
error que se repite:

| # | Error | Por qué no lo vio el parser |
| --- | --- | --- |
| 1 | `GROUP BY f.id_cliente, cliente_nombre` (alias de una expresión) | Sintácticamente válido. Postgres lo rechaza al ejecutar: sólo admite un alias de salida en `GROUP BY` si es una columna simple, y `COALESCE(...)` es una expresión |
| 2 | `RETURN QUERY WITH ... EXECUTE` | Es sintaxis inválida en PL/pgSQL: el `EXECUTE` tiene que ir inmediatamente después de `RETURN QUERY` |
| 3 | `ORDER BY` dentro de cada rama de un `UNION` | El parser acepta la estructura; en Postgres el `ORDER BY` va al final del `UNION` |

El parser valida **sintaxis**, no **semántica**. Estas tres reglas sólo se comprueban
con una base real.

### Un error de seguridad que sí funcionaba

La primera versión de `fn_marketing_por` construía el `WHERE` **fuera** del
`EXECUTE`, donde PL/pgSQL concatena texto crudo en vez de bindear:

```sql
WHERE (p_segmento IS NULL OR segmento_mkt = p_segmento)   -- interpolado
```

Un valor como `'; DROP TABLE ventas; --` habría creado inyección de SQL. El código
**funcionaba** y aun así era vulnerable. Se eliminó todo el SQL dinámico.