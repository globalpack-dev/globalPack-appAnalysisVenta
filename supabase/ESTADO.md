# Estado del proyecto

Resumen para retomar sin releer la conversación. Última actualización: **8 de
noviembre de 2026** (filtros del Dashboard: mes real y períodos con ventas); los
conteos siguen siendo la foto del 02/11/2026.

> **Los conteos de este archivo son una foto.** Se midieron contra la base real el
> 02/11/2026. Cambian con cada carga de Excel.

---

## Dónde estamos

**Migración completa.** Todas las pantallas leen de Supabase y ninguna página ni hook
importa `mockData` (el fixture se eliminó el 04/11/2026). Los datos que hoy se ven
**no** son un seed: entraron por el importador de la app y quedaron registrados en
`importaciones`.

| | |
|---|---|
| Ventas en la base | **25.004** (octubre 2026) + 1 fila descartada |
| Clientes | **3.051** · 38 altas nuevas en las cargas del 31/10 (22 del Excel de ventas + 16 de la cartera) |
| Cartera por supervisor | **2.990** clientes · 2.075 con `es_alcohol` · **518 de oportunidad** · 14 bajas · 126 consumo personal |
| Productos | 143 · Marcas 48 (9 en `marcas_alcohol`) · Localidades 56 |
| Encargados | 20 · Supervisores 3 (2 con cartera: NACUL SOL y FERNANDEZ EDUARDO) · Unidades de negocio 6 |
| Período | 1 con ventas: 2026/10. La tabla `periodos` tiene 11 filas (2025/02–2025/10 y 2026/10) |
| Pruebas | `tsc` y `build` limpios (08/11/2026). El `90/90` de `verificar` es histórico y **no se repitió** |

## Infraestructura

- **Supabase Cloud**, proyecto `uubzvrkqkzcuiqffrgus`. Plan **gratuito**; el pase a
  **Pro** está en trámite. La cuenta es personal y se transfiere a Global Pack antes
  de la entrega.
- **Auth**: tabla `empleados` con `id = auth.users.id`, roles `admin` | `consulta`.
- **RLS** activo en las 15 tablas de negocio.
- **Decisión de negocio: la app es de solo lectura.** Nadie edita datos de negocio
  desde la interfaz; el único camino de escritura es el importador de Excel, y sólo
  para `admin` (verificado a nivel de base con `es_admin()`).
- **Nuance de RLS**: las políticas actuales permiten `INSERT`/`UPDATE` a cualquier
  usuario autenticado y reservan `DELETE` a `admin`. La interfaz no ofrece esas
  operaciones, pero endurecerlo a `admin` para escritura sigue pendiente (ver «Otros
  pendientes»).
- Tipos escritos a mano en `src/types/database.types.ts` (no hay CLI de Supabase).

---

## ✅ Resuelto: rendimiento del Dashboard

Durante la etapa de 8.705 ventas el Dashboard tardaba ~11 s porque el hook hacía
ocho llamadas y el plan gratuito no aguantaba 8 consultas pesadas a la vez.

**Solución aplicada (archivo 21 `fn_dashboard_todo.sql`):** una sola RPC devuelve
todo en `jsonb`, así que el hook hace **un solo viaje** a la base. El 39 le sumó
`p_categoria` (con `DROP` previo) y Reportes la reutiliza también en una sola
llamada.

| | Antes | Ahora |
|---|---|---|
| Viajes a la base | 8 | **1** |
| Consultas compitiendo | 8 | **1** |

**Lo que sigue siendo cierto:** ~260 ms de latencia por viaje y ~1,6 s de cómputo.
Con una sola llamada el Dashboard entra en 2–3 s. El límite real es la **CPU del
plan gratuito**: cuatro RPC pesadas en paralelo vuelven a pasar los 8 s. Por eso el
patrón es siempre «todo en una RPC».

> Nota histórica: React Query **v5 sacó** la opción `concurrency` (en v4 era
> `maxQueries`). No existe; no intentar.

---

## Otros pendientes

### Importador de Excel (TopBar "Cargar datos")

El botón se renombró de "Exportar" a **"Cargar datos"** (icono de subida; sólo
habilitado para `admin`). El modal ya no es una demo:

**Ventas y cartera están implementados** (etapas 1 y 2). El flujo es: especificación
en **PDF** generada con `jsPDF` → elegir tipo → requisitos + archivo → **vista
previa** con lo que se va a escribir → progreso → resultado con resumen copiable.

- `src/lib/importacion/leerExcel.ts` lee el `.xlsx` con `xlsx` (import diferido,
  fuera del bundle inicial) y **detecta sola la hoja y la fila de encabezado**
  buscando las columnas clave. Por eso entran tanto los exports viejos como los
  nuevos aunque cambie el nombre de la hoja (`Hoja1` / `CLIENTES`) o haya filas de
  banner de más.
- `src/lib/importacion/config.ts` es la fuente única de columnas **obligatorias**
  / **opcionales** / **ignoradas** y de alias (`VISITA` → `Días de Visita`,
  `TAREA LATON` → `TAREA LATON QUILMES`). La usan la interfaz, la validación y
  el PDF.
- `src/lib/importacion/nombres.ts` normaliza nombres de personas para comparar
  (`EDUARDO FERNANDEZ` = `FERNANDEZ EDUARDO`) sin duplicar supervisores.
- `src/lib/importacion/validarVentas.ts` valida **sin tocar la base**: 26 columnas
  por nombre exacto, período `AAAA/MM`, filas sin códigos se descartan con motivo,
  y avisa las **marcas del archivo que no están en la base** (no bloquean).
- `src/lib/importacion/ventas.ts` ejecuta: dimensiones con **get-or-create**,
  borrado de `ventas` **sólo de los períodos del archivo** e inserción en lotes de
  1.000. No vacía las 13 tablas como `scripts/cargar-excel.ts`.
- `src/lib/importacion/validarCartera.ts` valida cartera y **compara contra la
  cartera vigente** (cambios de supervisor, clientes nuevos, clientes que
  desaparecen, encargados que faltan). También detecta columnas sin destino. El
  nombre del encargado se toma de `PROMOTOR` **o** de `Descripción Vendedor`; si no
  viene ninguno de los dos, avisa pero deja cargar.
- `src/lib/importacion/cartera.ts` ejecuta el reemplazo completo: archiva la foto
  anterior en `cartera_historial`, borra las cuatro tablas de cartera, verifica el
  borrado y vuelve a insertar. El encargado se resuelve por **`Vnd.` →
  `codigo_sector_venta`** (verificado: los 19 códigos coinciden con
  `encargados_ventas`); los supervisores se buscan por nombre normalizado.
- Corre con la sesión del usuario (RLS), no con `service_role`: el borrado exige
  `admin` a nivel de base, no sólo en la interfaz.
- `src/lib/importacion/importaciones.ts` registra cada carga en `importaciones`
  (quién, archivo, estado, filas, detalle) con la sesión del usuario.
- `src/hooks/useImportar.ts` orquesta los **dos** tipos (`ventas` y `cartera`).
- `src/pages/Cargas.tsx` — **historial de cargas** (Sidebar → HERRAMIENTAS →
  Cargas): lee `importaciones`, muestra fecha, tipo, archivo, filas ok/descartadas,
  estado y duración, y al expandir el detalle que dejó cada carga (supervisores,
  flags, dimensiones creadas, períodos) con botón «Copiar resumen».

**Refresco después de cargar.** `invalidateQueries()` sin filtro despertaba todas
las queries del caché a la vez; recién insertadas 25.000 filas, el dashboard se
cortaba por `statement timeout` (57014) y aparecía la caja roja. Ahora se invalidan
sólo las queries activas, el dashboard se refresca 4 s después, y tanto
`useDashboard` como el `queryClient` reintentan **sólo** el timeout con espera
creciente (`src/lib/errores.ts`).

**Reportes lentos / `statement timeout`.** Con 25.004 ventas, todas las RPC de
Reportes tardaban 7,5–8,4 s y algunas se cortaban (`57014`). Medido: leer
`v_ventas_detalle` con `count(*)` tarda 0,5 s, pero cualquier consulta que resuelva
**todas** las columnas de la vista tarda ~7 s, porque la vista joinea 14 tablas por
fila. La causa era que `fn_ventas_filtradas` tenía `SET search_path = public`, y las
funciones SQL con cláusulas `SET` **no se inlinean**: cada RPC materializaba el
rowtype completo (30+ columnas) en vez de dejar que el planificador podara columnas
y eliminara joins que la agregación no usa. `36_fn_ventas_filtradas_rapida.sql`
quita el `SET` (calificando los objetos con `public.`) y elimina el `JOIN clientes`
redundante; con la función inlineada, las agregadoras dejan de resolver la vista
entera. Verificación en `36b_verificacion.sql` (`EXPLAIN ANALYZE` + las RPC que se
cortaban).

**Marcas nuevas en cartera: resuelto (02/11/2026).** Si el archivo trae una columna
que coincide con una marca de la tabla `marcas` (comparando el nombre normalizado), se
usa su id. Si no coincide pero sólo trae ceros y unos, se toma como **marca nueva**:
la vista previa la muestra con un checkbox «¿es alcohol?» (por defecto desmarcado) y
la carga la crea en `marcas` + `marcas_alcohol`, y después entra a la matriz
`cliente_producto` como cualquier otra. Las columnas que no son marca siguen
avisándose como «sin destino». En **ventas** las marcas nuevas ya se creaban solas
(get-or-create).

Queda como endurecimiento futuro una RPC transaccional (hoy la carga no es atómica;
re-subir el mismo archivo es idempotente, y en cartera la foto anterior queda en
`cartera_historial`).

**SQL nuevo de esta etapa:**

1. `33_importaciones.sql` — tabla de auditoría `importaciones` + RLS.
2. `34_cartera_historial.sql` — histórico `cartera_historial` + RLS (FK a
   `importaciones`, por eso va segundo).
3. `35_tipos_importacion.sql` — cambia el CHECK de `importaciones.tipo` de tres
   valores (`ventas`/`supervisores`/`promotores`) a dos (`ventas`/`cartera`).
4. `36_fn_ventas_filtradas_rapida.sql` — reescribe `fn_ventas_filtradas` sin
   `SET search_path` (para que se inlinee) y sin el join redundante a `clientes`.
   Arregla los `statement timeout` de Reportes. Verificación en
   `36b_verificacion.sql`.

**Corrección: el 36 no alcanzaba.** La función viva no era la de 7 parámetros del
`02`, sino la de **9** del `22_categorias.sql` (`p_unidad_negocio` + `p_categoria`).
El 36 creó una sobrecarga de 7 parámetros que no reemplazó a nadie y volvió ambigua
cualquier llamada con 7 argumentos o menos
(`42725: function public.fn_ventas_filtradas() is not unique`). Por eso Reportes
seguía en 8 s.

5. `37_fn_ventas_filtradas_9p.sql` — **el arreglo real**: `DROP` de la sobrecarga
   de 7 que dejó el 36 y `CREATE OR REPLACE` de la versión de 9 parámetros con los
   mismos filtros, pero sin `SET search_path` y con todo calificado como `public.`
   (y sin el `JOIN clientes` redundante). Verificación en `37b_verificacion.sql`.
6. `38_clientes_y_paginacion_rapidas.sql` — después del 37, Reportes quedó en
   3,1–4,3 s, pero `fn_clientes` y `fn_ventas_pagina` seguían cortándose: la
   primera pedía `SELECT *` del rowtype completo (35 columnas) para agregar 7, y
   la segunda materializaba ese mismo `SELECT *` en un CTE usado dos veces.
   El 38 proyecta sólo las columnas necesarias y, en la paginación, ordena y
   pagina sobre 4 columnas para resolver los 14 joins únicamente en las 50 filas
   de la página. Verificación en `38b_verificacion.sql`.

7. `39_reportes_una_llamada_y_clientes.sql` — dos arreglos que quedaron a la
   vista después del 38: (a) Reportes disparaba **4 RPC en paralelo** para el
   «Resumen de ventas» y juntas saturaban la CPU del plan gratuito (4 de 4 en
   timeout), así que `fn_dashboard_todo` suma `p_categoria` (CAMBIA FIRMA: lleva
   `DROP` previo) y el hook del reporte la reutiliza en **una sola llamada**;
   (b) `fn_clientes` deja de pasar por `v_ventas_detalle` y agrega sobre
   `ventas` + `periodos`, con los filtros indirectos por subconsulta indexada.
   Verificación en `39b_verificacion.sql`.
8. `40_rls_solo_lectura.sql` — con la decisión de solo lectura, `INSERT` y
   `UPDATE` de las tablas de negocio pasan a `es_admin()`; se activa RLS en
   `marcas_alcohol` y `clientes_operativa` (no la tenían); `importaciones` y
   `cartera_historial` dejan de aceptar escritura de cualquier autenticado; y se
   agrega el RPC `actualizar_mi_nombre(text)` para que un usuario `consulta`
   pueda cambiar su propio nombre sin abrir un UPDATE general sobre `empleados`.
   Verificación en `40b_verificacion.sql`.
9. `41_fn_cliente_productos.sql` — `fn_cliente_productos(p_cliente, …)`: una fila
   por producto y período para el cliente, así la pestaña «Historial» puede
   expandir cada mes y mostrar qué compró. No toca ninguna función existente.
   Verificación en `41b_verificacion.sql`.
10. `43_clientes_promotor.sql` — `fn_clientes` suma `p_promotor` (CAMBIA FIRMA:
    8 → 9 argumentos, lleva `DROP` previo) y devuelve `id_encargado_venta` +
    `encargado_nombre`. El filtro sale de la cartera vigente
    (`clientes_operativa`), no de `ventas`: así la pantalla de Clientes puede
    listar los clientes de un promotor y mostrar su nombre. Las ventas agregadas
    siguen siendo el histórico completo del cliente. Verificación en
    `43b_verificacion.sql`.
11. `44_admin_empleados.sql` — RPC `fn_actualizar_empleado(uuid, text, boolean)`
    para que un admin activo cambie rol y estado de **otro** empleado. Valida en
    la base que no se edite a sí mismo y que siempre quede al menos un admin
    activo. **Retira la política de UPDATE** que creó el archivo 04: desde acá
    las únicas escrituras sobre `empleados` pasan por RPC (`actualizar_mi_nombre`
    y `fn_actualizar_empleado`). En la app, `App.tsx` bloquea la interfaz si el
    empleado tiene `activo = false`. Verificación en `44b_verificacion.sql`.
12. **Edge Function `admin-usuarios`** — no es SQL, vive en
    `supabase/functions/admin-usuarios/index.ts`. Permite al admin crear cuentas
    con contraseña temporal y eliminarlas definitivamente desde
    Configuración → Usuarios. La función valida el JWT y el rol del llamador, y
    sólo entonces usa la `service_role` para llamar a la Admin API de Auth. Al
    eliminar, la fila de `empleados` se borra por `ON DELETE CASCADE` y
    `importaciones.usuario` queda en `NULL`. Deploy en
    `supabase/functions/README.md`.
13. `45_catalogo_periodo_mes.sql` — `fn_filtros_disponibles` devuelve cada
    período con `mes` y `anio` numéricos y **sólo incluye los períodos que tienen
    ventas**. Antes el selector de Mes mandaba `periodos.id_periodo` como
    `p_mes`, pero las RPC comparan contra `ventas.mes` (1–12): cualquier
    selección de mes devolvía 0 filas. Ahora Dashboard y Reportes mandan
    `p_mes = mes` y `p_anio = anio` en una sola actualización de filtros.
    `useDashboard` conserva los datos anteriores con `placeholderData` mientras
    recarga. Verificación en `45b_verificacion.sql`.

**Mediciones (25.004 ventas, sólo lectura vía PostgREST):** de 7,5–8,4 s antes
del 37 a 1,0–4,3 s después; `fn_ventas_pagina` pasa de timeout a ~0,6 s con el 38.
Dos llamadas en paralelo entran en 4,7–5,2 s, pero **cuatro en paralelo vuelven a
pasar los 8 s** por contención de CPU: por eso los reportes tienen que pedir todo
en una sola RPC (patrón `fn_dashboard_todo`).

Sin el 33 y el 34 el importador de cartera se detiene con un mensaje claro y el de
ventas sigue funcionando (la auditoría es opcional). Sin el 35, la validación de
cartera falla al abrir la auditoría porque la base rechaza el tipo `cartera`.


### Pendientes abiertos (02/11/2026)

1. ~~**Marcas nuevas en cartera**~~ ✅ **Hecho (02/11/2026)**: se detectan por nombre
   contra `marcas` y, si no existen, la vista previa pide marcarlas como alcohol y la
   carga las crea en `marcas` + `marcas_alcohol`.
2. ~~**Endurecer RLS**~~ ✅ **Hecho (03/11/2026)**: `40_rls_solo_lectura.sql`.
   `INSERT`/`UPDATE` de negocio quedan en `es_admin()`, `marcas_alcohol` y
   `clientes_operativa` tienen RLS, y el nombre propio se guarda por RPC.
3. ~~**Eliminar `npm run seed` y `mockData.ts`** antes del traspaso.~~ ✅ **Hecho
   (04/11/2026)**: se borraron el script y el fixture.
4. ~~**Desacoplar de Figma Make**~~ ✅ **Hecho (02/11/2026)**: `vite.config.ts` es un
   config estándar de Vite (30 líneas), `index.html` es estático y `.figma/` se
   eliminó del disco. Falta sólo conectar el repo a **Vercel** y cargar las variables.
5. **Exportación PDF/CSV** — hoy la única salida es imagen PNG (decisión de Fase 5).
6. **`reportes_generados`** — no existe; los reportes se exportan pero no se guardan.
7. **Video de traspaso** + modo demo con datos ficticios. El manual técnico y la
   checklist de entrega están en `docs/ENTREGA.md`.
8. **`scripts/verificar-datos.ts`** — el `90/90` no se volvió a correr después de la
   carga del 31/10.

**Fuera de alcance por decisión de negocio:** edición de datos de negocio e
historial de cambios (`historial_cambios`, trigger de auditoría, optimistic locking,
pantalla de historial). La app es de solo lectura; esas tareas de la Fase 3 se
cancelan, no se postergan.

### Cierre de la migración

- `mockData.ts` y `scripts/seed.ts` **se eliminaron el 04/11/2026**. No hubo renombre
  a `mockData.LEGACY.ts`: se borraron directamente porque ninguna página ni hook los
  usaba en runtime.
- `README.md` documenta el `project-ref` y que la cuenta es personal (se transfiere a
  Global Pack en la entrega).
- **Resuelto**: ya no hay seed ni fixture en el repo. El riesgo de que un
  `npm run seed` accidental borrara las 25.004 ventas reales quedó cerrado.

### Cambios de esquema aplicados que no están en `database.sql`

`database.sql` es el esquema original y **no se debe modificar**. Estos cambios
viven solo en los archivos de `supabase/`:

- `productos.id_division` (agregado nullable) — la división cuelga del producto
- `familias.id_division` — ya no es NOT NULL
- `fn_filtros_disponibles` y `fn_clientes` devuelven **jsonb** (ver abajo)

---

## Trampas que ya costaron caro

### 1. Cambiar la firma de una función = `DROP` previo

**Ocurrió 5 veces.** Es la causa de casi todos los scripts de corrección.

- **Agregar un parámetro** deja la versión vieja conviviendo. Como el nuevo
  tiene `DEFAULT`, Postgres acepta llamadas con la firma corta y matchea
  **las dos** → `could not choose the best candidate function`.
  **Siempre `DROP FUNCTION ... (tipos explícitos)` antes.**
- **Agregar una columna a `RETURNS TABLE`** también cambia el tipo de retorno.
  **No alcanza con `CREATE OR REPLACE`.**

```sql
DROP FUNCTION IF EXISTS public.fn_x(integer, integer, text);
CREATE OR REPLACE FUNCTION fn_x(...);
```

### 2. `DROP ... IF EXISTS` se come los errores

Una firma mal escrita **no da error**: el `IF EXISTS` lo silencia y parece que
funcionó. Para borrar sobrecargas sin adivinar la firma, usar un `DO` que
recorra `pg_proc`:

```sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS firma FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_x'
  LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s', r.firma); END LOOP;
END $$;
```

### 3. El SQL Editor envuelve todo en una transacción

**Si una sentencia falla, revierte TODO el archivo.** No queda aplicado ni el
DDL de las sentencias anteriores.

Pasó con el archivo 27: las funciones se crearon bien, pero la **última
sentencia** —una consulta de verificación— tenía un error de sintaxis, y eso
tiró abajo el `ALTER TABLE` y las cuatro funciones. La base quedó como
estaba.

**Por eso las verificaciones van en un archivo aparte** (`27b_verificacion.sql`):
un error en una consulta de control no puede revertir el trabajo.

Y un detalle de `jsonb_array_elements`: devuelve un **jsonb**, no una tabla.
Los campos se leen con `->>`, no por nombre:

```sql
-- MAL: no existe la columna "oportunidad"
COUNT(*) FILTER (WHERE oportunidad) FROM jsonb_array_elements(...) c;

-- BIEN
COUNT(*) FILTER (WHERE (c->>'oportunidad')::boolean) FROM jsonb_array_elements(...) c;
```

### 4. `db-max-rows` de PostgREST = 1.000 filas

**No es un `LIMIT` de SQL.** El motor nunca ve más de 1.000 filas, así que
poner `LIMIT 5000` no hace nada. Rompió dos veces:

- `fn_filtros_disponibles`: con 1.542 clientes perdía los períodos y el
  selector de fecha llegaba vacío.
- `fn_clientes`: perdía 542 clientes —los que menos compran, justo los del
  filtro Activo/Inactivo.

**Solución: devolver un `jsonb` con la lista adentro.** Una fila nunca se trunca.

### 5. El validador SQL solo detecta errores de sintaxis

`pgsql-ast-parser` no detecta errores semánticos. Los que cometí (sobrecarga,
tipo de retorno, `GROUP BY` en un subquery agregado, `DISTINCT` + `ORDER BY`)
pasaron el validador y fallaron contra Postgres.

**Limitaciones conocidas del parser**: no soporta `RETURNS SETOF tabla`,
`SET search_path`, `SECURITY INVOKER`, `COMMENT ON`.

### 6. Lo que sobra en el Excel

- Un período con valor `46302` (número de serie de Excel roto). Se descarta.
- La columna `Clientes con Compra Totales` **no se usa**: la base lo deriva con
  `COUNT(DISTINCT)`.
- `SIN SUPERVISOR` y `Sin Supervisor Asignado` son lo mismo. Se unifican.
- **La Familia no determina la División.** `REGULAR` aparece en 8 divisiones.
  Por eso la división se guardó en `productos`, no en `familias`.

### 7. En un parámetro, `NULL` significa "todos"
Es cómodo para un filtro opcional (`p_supervisor IS NULL OR ...`), pero deja
sin representación al grupo que **de verdad** tiene el valor `NULL`: los 182
clientes sin supervisor.

En la pantalla de Supervisores eso se vio como "Sin supervisor: la cartera
entera" — los 2.990 clientes. El arreglo (archivo 25) es un centinela
explícito:

```sql
WHERE p_supervisor IS NULL                        -- todos
   OR (p_supervisor = 0 AND sc.id_supervisor IS NULL)  -- sin supervisor
   OR sc.id_supervisor = p_supervisor             -- uno
```

El `0` no colisiona: `id_supervisor` es serial y arranca en 1. **Si agregás
una función con un filtro opcional sobre una columna que admite `NULL`,
definí el centinela desde el principio.**

Y el otro error de la misma pantalla: el `id` del supervisor estaba
hardcodeado en la lista. Si la función no devuelve la clave, no hay forma de
navegar — `fn_supervisores_cartera` ahora devuelve `id_supervisor`.

### 8. Una tabla puede mentir con su nombre

`marcas_alcohol` tiene las **9 marcas del archivo del cliente**, pero TRES no
son alcohol: **RED BULL, H2Oh y PEPSI BLACK**. Son bebidas.

El nombre de la tabla hizo que todas las funciones dieran por hecho que las 9
eran alcohol, y cada una repetía su propia versión de "compró alcohol" sin
coincidir entre sí. Dos consecuencias medidas:

- **105 clientes** con FLAG ALCOHOL = SI compraron **sólo** marcas no
  alcohólicas. No compraron una gota de alcohol, así que **son oportunidad** —
  pero el código los sacaba de la lista porque contaba "compró alguna de las 9".
- **132 clientes** con FLAG ALCOHOL = NO **sí** compraron cerveza. El flag
  del archivo no los refleja, así que el filtro de la pantalla tiene cuatro
  grupos y no dos.

> Los 105/132 se midieron con la carga anterior (8.705 ventas). La lógica es la
> misma; los números cambian con cada archivo.

El arreglo (archivo 27) es una columna en la tabla:

```sql
ALTER TABLE marcas_alcohol ADD COLUMN es_alcoholica boolean NOT NULL DEFAULT true;
```

**La decisión de qué es alcohol tiene que vivir en la base, en un `UPDATE`,**
no repartida en el código de cada función. Y la definición de "oportunidad"
queda en **un solo lugar** — `fn_cartera_clientes.oportunidad` — y el resto la
deriva. Con la carga anterior pasó de 845 a 950; **con la carga actual es 518**
(2.347 de público de alcohol − 1.829 que compraron).

La matriz por marca mide sobre el **público de alcohol** (flag SI **o** compró
alcohol), no sobre el flag: si fuera el flag, los 132 que compraron cerveza
quedarían fuera de la matriz que justamente sirve para verlos.

### 9. Cerca de la mitad de la cartera no tiene localidad

De los **2.990** clientes de la cartera, **1.469 (49,1%) no tienen localidad**: son
los que vinieron del archivo del cliente y no están en el Excel de ventas — que es
de donde sale la localidad. Ninguno de ellos tiene ventas cargadas.

No es un bug, es que el archivo del cliente no trae esa columna. Pero significa que
cualquier gráfico por localidad tiene un hueco de casi la mitad de la oportunidad, y
mostrarlo truncado **engaña**: el supervisor pensaría que esos son todos sus clientes
sin compra.

Por eso el gráfico de localidad muestra los 10 primeros **y un bloque
explícito con cuántos quedan sin localidad**, con la explicación de por qué.
El hueco de datos queda a la vista y es una acción posible: pedirle la
localidad al cliente.

### 10. El denominador de una tasa decide el número

`fn_supervisores_cartera` tiene tres números que se parecen y no son lo mismo:

- `alcohol` → el FLAG del archivo. "Cuántos de tus clientes son clientes de
  alcohol".
- `publico_alcohol` → el flag **o** una compra de alcohol. "A cuántos les
  podrías ofrecer alcohol".
- `oportunidad` → el flag y sin alcohol comprada.

La **penetración** va sobre el público, no sobre el flag: el numerador
(`con_alcohol`) cuenta clientes que compraron alcohol con cualquier flag,
incluidos los que tienen el flag en NO. Si se dividiera por `alcohol`, el
numerador y el denominador serían poblaciones distintas y la cuenta no cerraría.

Con el público, la partición es exacta (carga del 31/10/2026):

```
NACUL SOL       público 1.085 = 822 que compraron + 263 sin compra   (75,8%)
FERNANDEZ       público 1.262 = 1.007 que compraron + 255 sin compra (79,8%)
```

y penetración + oportunidad da **100%**, que es lo que hace legible el
gráfico de benchmark: dos segmentos que suman el total.

---

## Orden de los archivos SQL

Ejecutar en orden. Cada uno explica su porqué en el encabezado.

| # | Archivo | Qué hace |
|---|---|---|
| 01 | `v_ventas_detalle.sql` | Vista con todos los nombres resueltos |
| 02 | `funciones_agregacion.sql` | 10 funciones de agregación |
| 03 | `fn_ventas_pagina.sql` | Paginación de Sales |
| 04 | `auth_rls.sql` | Auth + RLS |
| 05 | `fn_productos.sql` | Productos y jerarquía comercial |
| 06 | `fn_marcas.sql` | Marcas y crecimiento |
| 07 | `fn_encargado.sql` | Encargados y supervisores |
| 08 | `fn_clientes.sql` | Clientes con métricas |
| 09 | `fn_dashboard_variaciones.sql` | Variación contra el período anterior |
| 10 | `filtro_unidad_negocio.sql` | 8º filtro |
| 11 | `arreglo_sobrecarga.sql` | Arregla sobrecarga de `fn_ventas_filtradas` |
| 12 | `arreglo_sobrecarga.sql` | Arregla 6 sobrecargas |
| 13 | `filtro_un_restante.sql` | 8º filtro en 3 funciones más |
| 14 | `arreglo_encargado.sql` | Arregla sobrecarga |
| 15 | `division_en_producto.sql` | División por producto |
| 16 | `familia_division_nullable.sql` | Saca el NOT NULL |
| 17 | `limite_catalogo.sql` | **Superado** por el 18 |
| 18 | `catalogo_jsonb.sql` | Catálogo en jsonb |
| 19 | `indices.sql` | 8 índices |
| 20 | `fn_clientes_jsonb.sql` | Clientes en jsonb |
| 21 | `fn_dashboard_todo.sql` | Las 8 agregaciones del Dashboard en una llamada |
| 22 | `categorias.sql` | Categorías, jerarquía y `divisiones.id_categoria` |
| 23 | `supervisores_cartera.sql` | Cartera por supervisor, compras por marca y flag de alcohol |
| 24 | `cartera_pantalla.sql` | Matriz por marca, clientes y ficha del cliente |
| 25 | `fix_cartera_ids.sql` | `id_supervisor` en la lista y el grupo sin supervisor (`0`) |
| 26 | `cartera_compras.sql` | Qué compró cada cliente, no sólo cuánto |
| 27 | `alcohol_ico.sql` | Qué es alcohol de verdad: la columna `es_alcoholica` |
| 27b | `verificacion.sql` | Las consultas de control del 27, aparte a propósito |
| 28 | `benchmark.sql` | El público de alcohol y la penetración, para el benchmark |
| 28b | `verificacion.sql` | Las consultas de control del 28, aparte a propósito |
| 30 | `operativos.sql` | Visitas, tareas, subcanal y tier por cliente (`clientes_operativa` + `fn_operativos`) |
| 30b | `verificacion.sql` | Las consultas de control del 30, aparte a propósito |
| 31 | `actividad.sql` | `fn_actividad_promotor`: la lista de trabajo de un promotor |
| 31b | `verificacion.sql` | Las consultas de control del 31, aparte a propósito |
| 32 | `estados_especiales.sql` | `flag_estado` en `cliente_alcohol`: BAJA y CONSUMO PERSONAL del FLAG ALCOHOL |
| 32b | `verificacion.sql` | Las consultas de control del 32, aparte a propósito |
| 33 | `importaciones.sql` | Auditoría de las cargas de «Cargar datos» (quién, archivo, estado, detalle) |
| 34 | `cartera_historial.sql` | Foto de la cartera antes de cada reemplazo (FK a `importaciones`) |
| 35 | `tipos_importacion.sql` | CHECK de `importaciones.tipo` con `ventas`/`cartera` |
| 36 | `fn_ventas_filtradas_rapida.sql` | Quita `SET search_path` para que se inlinee (queda superado por el 37) |
| 36b | `verificacion.sql` | `EXPLAIN ANALYZE` y las RPC que se cortaban |
| 37 | `fn_ventas_filtradas_9p.sql` | El arreglo real: `DROP` de la sobrecarga de 7 y la versión de 9 parámetros sin `SET` |
| 37b | `verificacion.sql` | Controles del 37 |
| 38 | `clientes_y_paginacion_rapidas.sql` | Proyecta sólo las columnas necesarias en `fn_clientes` y `fn_ventas_pagina` |
| 38b | `verificacion.sql` | Controles del 38 |
| 39 | `reportes_una_llamada_y_clientes.sql` | `fn_dashboard_todo` con `p_categoria` (Reportes en una sola llamada) y `fn_clientes` sin la vista |
| 39b | `verificacion.sql` | Controles del 39 |
| 40 | `rls_solo_lectura.sql` | `INSERT`/`UPDATE` sólo `admin`, RLS en `marcas_alcohol` y `clientes_operativa`, RPC `actualizar_mi_nombre` |
| 40b | `verificacion.sql` | Controles del 40 |
| 41 | `fn_cliente_productos.sql` | Productos comprados por cliente y período (detalle expandible del historial) |
| 41b | `verificacion.sql` | Controles del 41 |
| 42 | `fn_marcas_productos.sql` | Restaura la columna `productos` en `fn_marcas` (la ficha de marca la necesitaba) |
| 42b | `verificacion.sql` | Controles del 42 |
| 43 | `clientes_promotor.sql` | `fn_clientes` con `p_promotor` y `encargado_nombre` desde la cartera vigente |
| 43b | `verificacion.sql` | Controles del filtro por promotor |
| 44 | `admin_empleados.sql` | RPC `fn_actualizar_empleado`: rol y estado de otros usuarios, con protección de admin |
| 44b | `verificacion.sql` | Controles de la gestión de usuarios |
| 45 | `catalogo_periodo_mes.sql` | `fn_filtros_disponibles` devuelve `mes`/`anio` y sólo períodos con ventas |
| 45b | `verificacion.sql` | Controles del catálogo de períodos |

**Son 59 archivos en total.** No existe un `29`: la numeración se salteó y no falta
nada. El `17` está superado por el `18` y el `36` por el `37`; se dejan como historial
porque ya están aplicados.

---

## Comandos

```bash
npx tsx scripts/cargar-excel.ts              # dry-run del Excel de ventas
npx tsx scripts/cargar-excel.ts --aplicar    # ⚠️ borra el período y recarga (hoy lo reemplaza el importador de la app)
npm run verificar                            # pruebas contra la base real
npm run dev

npx tsx scripts/verificar-datos.ts           # las pruebas, directo
```

### Puesta al día de la etapa de promotores

El DDL no se puede ejecutar por REST: los `.sql` van en el SQL Editor.

1. Ejecutar `30_operativos.sql` (crea `clientes_operativa` y `fn_operativos`).
2. `npx tsx scripts/cargar-promotores.ts --aplicar` (cartera + operativa).
3. Ejecutar `31_actividad.sql` (crea `fn_actividad_promotor`).
4. Ejecutar `32_estados_especiales.sql` (BAJA y CONSUMO PERSONAL) y volver a
   correr `npx tsx scripts/cargar-promotores.ts --aplicar`.
5. `npm run verificar` → **90/90** (medición histórica, previa a la carga del
   31/10/2026; no se repitió).
6. Opcional: `30b_verificacion.sql`, `31b_verificacion.sql` y
   `32b_verificacion.sql` para los controles por supervisor y promotor.

### Puesta al día del importador (etapas 1 y 2 + ajuste a dos archivos)

1. Ejecutar `33_importaciones.sql` (auditoría).
2. Ejecutar `34_cartera_historial.sql` (histórico; depende del 33).
3. Ejecutar `35_tipos_importacion.sql` (CHECK de `tipo` con `ventas`/`cartera`).
4. Desde el botón **«Cargar datos»** (usuario `admin`), subir el archivo.
   - **Ventas**: `Base ventas.xlsx`. Reemplaza sólo los períodos del archivo.
   - **Cartera (promotores y supervisores)**: `Base promotores_supervisores.xlsx`.
     Es una sola carga; «promotores» y «supervisores» son el mismo archivo en
     distinto momento.
5. Al cargar cartera, recordá que **reemplaza toda la cartera**. La foto anterior
   queda en `cartera_historial`.

**Archivos medidos para esta etapa** (`excel/nuevos excel/`):

- `Base promotores_supervisores.xlsx`: hoja `Hoja1`, encabezado fila 3, 2.990
  clientes, 0 duplicados, 0 sin SDV. Supervisores: EDUARDO FERNANDEZ 1.622 /
  NACUL SOL 1.368. Trae `Días de Visita` (antes `VISITA`) y `Descripción Vendedor`
  (nombre del encargado, antes venía en `PROMOTOR`). 19 `Vnd.`, todos con nombre.
- `Base ventas.xlsx`: hoja `Página1`, encabezado fila 1, 25.005 filas (25.004
  válidas de 2026/10 y 1 fila basura con período serial que se descarta sola). 49
  marcas, de las cuales 7 no están en la base (BRAHMA FT LIMON/POMELO, CAPRICCIO,
  GATORADE MKTP, GIN BOSQUE, GIN RIDER, NAVE ROBINO): se crean al cargar.

El supervisor `EDUARDO FERNANDEZ` del archivo nuevo es el `FERNANDEZ EDUARDO` de la
base; se comparan por clave normalizada. Sin eso se duplicaba el supervisor.

### Puesta al día de los arreglos de rendimiento (36–39)

Se aplican **después** del importador y son sólo funciones (no tocan datos). En este
orden: `36` → `37` → `38` → `39`, cada uno con su `b_verificacion` aparte. El `36`
queda superado por el `37`, pero se ejecuta igual porque el `37` espera borrar la
sobrecarga que aquél crea.

## Herramientas

- `scripts/verificar-datos.ts` usa `SUPABASE_SERVICE_ROLE_KEY`.
- Las verificaciones `NNb_verificacion.sql` se corren aparte, después del archivo
  principal, para no revertir la transacción completa si un control falla.

## Lo que NO se hizo a propósito

- **Edición de datos de negocio e historial de cambios**: descartado. La app es de
  solo lectura por decisión de negocio; el único camino de escritura es el
  importador. No hay `historial_cambios` ni trigger de auditoría.
- **Exportación a PDF/CSV**: la salida oficial es **imagen PNG** (`html-to-image`).
  El PDF/CSV sigue sin implementarse.
- **`reportes_generados`**: no existe. Los reportes se exportan pero no se persisten.
- **Objetivos comerciales**: no hay metas en el origen de datos. Se decidió que
  van en `localStorage` cuando se definan. Por ahora el módulo muestra un aviso
  honesto en vez de metas inventadas.
- **Línea "Objetivo" en el gráfico**: se sacó por lo mismo. Vuelve con las metas.