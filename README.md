# AnalyticsBI — Sistema de Gestión Comercial (Global Pack)

Dashboard de Business Intelligence y gestión comercial para la distribución de
cervezas y bebidas de **Global Pack** (mercado argentino). Analiza ventas por
cliente, encargado, sector/supervisor, marca, producto, unidad de negocio y canal de
marketing, con drill-down, rankings, KPIs, ficha de cartera por supervisor y
generación de reportes.

> **Estado:** aplicación funcional conectada a **Supabase Cloud**, con datos reales
> del negocio (**25.004 ventas de octubre 2026**), autenticación y RLS. Los datos
> entraron por el importador de la app, no por un script de carga. La app es **de solo lectura**:
> el único camino de escritura es la carga de Excel del usuario `admin`.

---

## Índice

1. [Qué resuelve](#qué-resuelve)
2. [Estado actual](#estado-actual)
3. [Arquitectura](#arquitectura)
4. [Tecnologías](#tecnologías)
5. [Requisitos e inicio rápido](#requisitos-e-inicio-rápido)
6. [Scripts](#scripts)
7. [Estructura de carpetas](#estructura-de-carpetas)
8. [Capa de datos](#capa-de-datos)
9. [Autenticación y seguridad](#autenticación-y-seguridad)
10. [Catálogo de páginas](#catálogo-de-páginas)
11. [Sistema de diseño](#sistema-de-diseño)
12. [Cómo extender](#cómo-extender)
13. [Limitaciones y deuda técnica](#limitaciones-y-deuda-técnica)
14. [Entrega pendiente](#entrega-pendiente)

---

## Qué resuelve

| # | Problema reportado por Global Pack | Estado |
| --- | --- | --- |
| 1 | Se pierden entre numerosas planillas de Excel | ✅ Base única relacional, con los datos reales cargados |
| 2 | Mandaban **capturas de pantalla del Excel** a sus clientes | ✅ **Resuelto**: reportes, resumen del día y cargas se exportan y comparten como imagen PNG |
| 3 | **Una tabla editada por 3 personas a la vez** | ✅ Resuelto por decisión de negocio: la app es **de solo lectura**. Nadie edita datos; el único que escribe es el `admin` al importar los Excel |
| 4 | No tienen visualización de estadísticas | ✅ 11 pantallas con KPIs, gráficos y drill-down |

La checklist de puesta en producción y traspaso está en
[`docs/ENTREGA.md`](docs/ENTREGA.md).

---

## Estado actual

| | |
| --- | --- |
| Ventas en la base | **25.004** (octubre 2026) + 1 fila descartada |
| Clientes | **3.051** (38 altas nuevas en las cargas del 31/10) |
| Cartera por supervisor | 2.990 clientes · 2.075 con alcohol · **518 de oportunidad** · 14 bajas · 126 consumo personal |
| Productos / marcas / localidades | 143 / 48 / 56 |
| Encargados / supervisores | 20 / 3 (2 con cartera) |
| Unidades de negocio | 6 |
| Períodos cargados | **1 con ventas** (2026/10) — todavía no hay históricos |
| Cargas registradas | 2 (31/10/2026): ventas 25.004 ok + 1 descartada; cartera 2.990 ok |
| Pruebas | `tsc` y `build` limpios (08/11/2026). El `90/90` de `verificar` es histórico |

**Dos deudas de infraestructura:**

- El proyecto está en el **plan gratuito de Supabase**, que pausa el proyecto tras 7
  días de inactividad. El pase a **Pro** está en trámite.
- La cuenta de Supabase es **personal del pasante**. Se transfiere a Global Pack en
  la entrega, junto con el repo y el proyecto de Vercel.

El estado operativo detallado (SQL aplicado, trampas conocidas, pendientes técnicos)
está en [`supabase/ESTADO.md`](supabase/ESTADO.md). **Ese archivo es la fuente de
verdad de la base de datos.**

---

## Arquitectura

```
index.html
   │
   └─> src/main.tsx
         │  QueryClientProvider (React Query)
         │  AuthProvider (sesión de Supabase)
         │
         └─> src/App.tsx
               │  cargando → pantalla de carga
               │  sin sesión → <Login />
               │  sin fila en `empleados` → pantalla sin permiso
               │
               ├─> Sidebar (define el tipo `Page`)
               ├─> TopBar
               └─> switch (activePage) → src/pages/<Página>.tsx
                        │
                        └─> src/hooks/*  (useQuery)
                              │  clave = claves de filtro
                              │
                              └─> src/lib/supabase.ts
                                    │  select() a vistas/tablas
                                    └─ rpc('fn_…') en Postgres
```

**Flujo de datos:** cada página llama a uno o más hooks; los hooks envuelven
`useQuery` y llaman a Supabase (tabla, vista o RPC). Los agregados pesados se calculan
en Postgres (`fn_…`), no en el navegador. El estado de filtros (`Filtros`) se comparte
entre páginas mediante `useFiltros` y se serializa en la `queryKey`.

**No hay router:** la navegación es un `useState<Page>` en `App.tsx`. No hay URLs,
historial del navegador ni deep-linking.

---

## Tecnologías

### Runtime y framework

| Tecnología | Versión | Rol |
| --- | --- | --- |
| **React** | `^19.0.0` | UI |
| **React DOM** | `^19.0.0` | Renderizador (`createRoot` en `src/main.tsx`) |
| **TypeScript** | `^5.7.0` | Tipado estricto (`strict: true`, `noEmit`) |
| **Vite** | `^8.0.5` | Bundler y dev server (puerto `8443`) |

### Datos

| Tecnología | Versión | Rol |
| --- | --- | --- |
| **@supabase/supabase-js** | `^2.117.3` | Cliente único (`src/lib/supabase.ts`) |
| **@tanstack/react-query** | `^5.104.1` | Caché, deduplicación, `isLoading`/`isError` |
| **Supabase Cloud** | PostgreSQL + Auth + RLS | Base, autenticación y políticas |
| **xlsx** | `^0.18.5` | Lectura de los Excel en los scripts y en el importador (carga diferida) |
| **jspdf** | `^4.2.1` | PDF de especificación del importador (carga diferida) |
| **html-to-image** | `^1.11.13` | "Resumen del día" compartible como imagen |

### UI

| Tecnología | Versión | Rol |
| --- | --- | --- |
| **Tailwind CSS** | `^4.0.0` | Motor de estilos (`@import 'tailwindcss'`, sin config JS) |
| **Recharts** | `^3.10.1` | Gráficos SVG (`AreaChart`, `BarChart`, `PieChart`…) |
| **lucide-react** | `^1.52.0` | Iconografía |

### Herramientas

| Tecnología | Versión | Rol |
| --- | --- | --- |
| **tsx** | `^4.23.15` | Corre los scripts en TypeScript |
| **dotenv** | `^18.0.7` | Lee `.env` en los scripts de Node |
| **Node / npm** | 22 / 10+ | Node fijado en `.nvmrc` y `.mise.toml`; el repo usa `package-lock.json` |

### Convenciones

Toda la interfaz está en **español rioplatense**: `Intl` con `es-AR`, montos en pesos
(`$1,5M`), y unidades del negocio: **bultos**, **hectolitros (HL)** y canales
On-Trade / Off-Trade / Institucional.

---

## Requisitos e inicio rápido

- Node.js 22 LTS (fijado en `.nvmrc` y `.mise.toml`; `mise install` lo instala)
- npm 10 o superior (viene con Node)
- Un archivo `.env` con las claves de Supabase

```bash
mise install      # opcional, instala Node 22
npm install

cp .env.example .env   # y completar los valores
npm run dev
```

`.env.example` documenta las cuatro variables:

```bash
VITE_SUPABASE_URL=          # viaja al bundle
VITE_SUPABASE_ANON_KEY=     # viaja al bundle (es pública por diseño)
SUPABASE_SERVICE_ROLE_KEY=  # SOLO scripts de Node; nunca en el navegador
SUPABASE_PROJECT_REF=       # para la CLI
```

Servidor de desarrollo: **`http://localhost:8443`** (`strictPort: true`). Para cambiar
el puerto: `PORT=3000 npm run dev` (Linux/macOS) o `set PORT=3000 && npm run dev` (Windows).

---

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Dev server con HMR en `8443` |
| `npm run build` | Bundle de producción en `dist/` |
| `npm run preview` | Sirve `dist/` |
| `npm run verificar` | Pruebas contra la base real (usa `service_role`); el `90/90` es histórico |
| `npm run typecheck` | `tsc --noEmit` |

### Scripts de carga de datos (Node)

| Comando | Qué hace |
| --- | --- |
| `npx tsx scripts/verificar-datos.ts` | Equivalente a `npm run verificar` |
| `npx tsx scripts/historicos/cargar-excel.ts` | Dry-run del Excel de ventas (histórico) |
| `npx tsx scripts/historicos/cargar-excel.ts --aplicar` | Borra el período y recarga (reemplazado por el importador) |
| `npx tsx scripts/historicos/cargar-promotores.ts --aplicar` | Carga cartera + capa operativa (histórico) |
| `npx tsx scripts/historicos/cargar-sub-base.ts` | Carga "Sub Base Consulta" (histórico) |

> ℹ️ **El camino oficial de carga es «Cargar datos» en la app**, disponible para el
> usuario `admin`. Los scripts de `scripts/historicos/` quedan como referencia y
> apuntan a planillas que ya no están en esas rutas (ver su README). No existe seed
> ni `mockData.ts`: se eliminaron el 04/11/2026 y no deben recrearse.

---

## Estructura de carpetas

```
.
├── index.html                  # Shell HTML estático (lang, title, noindex)
├── package.json
├── tsconfig.json
├── vite.config.ts              # Vite + React + Tailwind (sin tooling de Figma)
├── vercel.json                 # Deploy en Vercel
├── .nvmrc                      # Node 22
├── AGENTS.md                   # Instrucciones para agentes de código
├── database.sql                # Esquema original (no modificar)
├── .env.example                # Plantilla de variables (el .env real no se versiona)
├── .mise.toml
│
├── public/
│   └── robots.txt              # noindex: la app es interna
│
├── docs/
│   └── ENTREGA.md              # Checklist de deploy y traspaso
│
├── supabase/                   # SQL aplicado a mano en el SQL Editor
│   ├── ESTADO.md               # ⭐ estado operativo de la base
│   ├── README.md
│   ├── config.toml             # Config de la Edge Function
│   ├── functions/              # Edge Function admin-usuarios
│   └── 01_…sql … 45b_…sql     # 59 archivos, en orden
│
├── scripts/                    # Node: verificación
│   ├── verificar-datos.ts
│   └── historicos/             # Cargadores previos al importador
│
├── excel/                      # Planillas fuente (locales, fuera de git)
│
└── src/
    ├── main.tsx                # QueryClientProvider + AuthProvider
    ├── App.tsx                 # Guard de sesión + navegación
    ├── index.css               # Tailwind v4 + fuentes + tokens (@theme)
    ├── vite-env.d.ts
    │
    ├── components/
    │   ├── Sidebar.tsx         # Menú + tipo `Page`
    │   ├── TopBar.tsx          # Breadcrumbs y acciones
    │   └── ui/                 # ChartTooltip, StatusBadge, EstadoDatos,
    │                            # GraficosCartera, ActividadPromotor, ResumenDia,
    │                            # ModalCargarExcel, ResumenClienteImagen
    │
    ├── context/
    │   └── AuthContext.tsx     # session, empleado, cargando, salir
    │
    ├── hooks/                  # Toda la lectura de datos (11 archivos)
    │   ├── useFiltros.ts       # Estado de filtros compartido
    │   ├── useEmpleados.ts     # Usuarios: alta, rol, estado y baja
    │   ├── useDashboard.ts     # fn_dashboard_todo
    │   ├── useCatalogos.ts     # KPIs, clientes, encargados, filtros
    │   ├── useVentas.ts        # Ventas paginadas + marketing
    │   ├── useMarcas.ts
    │   ├── useProductos.ts
    │   ├── useCartera.ts       # Cartera, compras, operativa, actividad
    │   ├── useReporte.ts       # Un hook por tipo de reporte
    │   ├── useImportaciones.ts # Historial de «Cargar datos»
    │   └── useImportar.ts      # Orquesta la carga de ventas y cartera
    │
    ├── lib/
    │   ├── supabase.ts         # Cliente único
    │   ├── queryClient.ts      # Config de React Query
    │   ├── errores.ts          # Reintento sólo para statement timeout
    │   ├── format.ts           # fmtPesos / fmtNum
    │   ├── imagen.ts           # Exportar como PNG (html-to-image)
    │   ├── usuario.ts          # Iniciales y etiqueta de rol
    │   ├── visitas.ts
    │   └── importacion/        # Lectura, validación y carga de Excel
    │
    ├── pages/                  # 11 páginas + Login
    │   ├── Dashboard.tsx
    │   ├── Sales.tsx
    │   ├── Customers.tsx
    │   ├── Products.tsx
    │   ├── Brands.tsx
    │   ├── Promotores.tsx
    │   ├── Supervisors.tsx
    │   ├── Marketing.tsx
    │   ├── Reports.tsx
    │   ├── Cargas.tsx
    │   ├── Settings.tsx
    │   └── Login.tsx
    │
    └── types/
        └── database.types.ts   # Escrito a mano (el esquema está versionado)
```

---

## Capa de datos

Todo el SQL vive en [`supabase/`](supabase/ESTADO.md) y **se aplica a mano** en el SQL
Editor de Supabase (el DDL no se puede ejecutar por REST). `database.sql` es el
esquema original y **no se modifica**; los cambios posteriores están en los archivos
numerados.

### Edge Functions

- **`admin-usuarios`** (`supabase/functions/admin-usuarios/index.ts`) — alta y baja
  de cuentas de Auth desde Configuración → Usuarios. Valida el JWT y el rol admin
  y usa la `service_role` sólo del lado del servidor. Deploy en
  [`supabase/functions/README.md`](supabase/functions/README.md).

### Tablas (23)

- **Base (14):** `periodos`, `localidades`, `supervisores`, `encargados_ventas`,
  `sucursales`, `clientes`, `unidades_negocio`, `divisiones`, `familias`, `marcas`,
  `calibres`, `productos`, `clasificaciones_marketing`, `ventas`.
- **Acceso (1):** `empleados` (1:1 con `auth.users`, roles `admin`/`consulta`).
- **Cartera y operativa (6):** `categorias`, `marcas_alcohol`, `cliente_producto`,
  `cliente_alcohol`, `supervisores_cartera`, `clientes_operativa`.
- **Importador (2):** `importaciones` (auditoría de cada carga) y `cartera_historial`
  (foto de la cartera antes de cada reemplazo).

### Vista

`v_ventas_detalle` — resuelve por joins todos los nombres que muestran las tablas
(la tabla `ventas` sólo guarda FKs). Es la base de `Sales.tsx` y de las funciones de
agregación.

### Funciones RPC (Postgres)

| Función | Devuelve |
| --- | --- |
| `fn_dashboard_todo(filtros)` | KPIs, variaciones, serie, tops y agrupaciones en **una** llamada |
| `fn_dashboard_kpis` / `fn_dashboard_variaciones` | KPIs y comparación con el período anterior |
| `fn_ventas_mensuales` | Serie mensual |
| `fn_ventas_pagina` | Página de la tabla de Ventas (paginación en la base) |
| `fn_ventas_filtradas` | Helper con los 8 filtros |
| `fn_top_clientes` / `fn_ventas_por_encargado` / `fn_ventas_por_localidad` | Rankings |
| `fn_ventas_por_unidad_negocio` / `fn_ventas_por_marca` | Series para gráficos |
| `fn_marketing_por` | Las 4 dimensiones del drill-down de Marketing |
| `fn_clientes` / `fn_cliente_detalle` / `fn_cliente_compras` | Fichas de cliente e historial de compras |
| `fn_marcas` / `fn_marca_detalle` / `fn_marca_serie` | Marcas, detalle y serie mensual |
| `fn_productos` / `fn_jerarquia_comercial` / `fn_categorias` / `fn_calibres` / `fn_familias` | Productos y árbol comercial |
| `fn_ventas_por_encargado` / `fn_encargado_marcas` | Encargados (promotores de venta) y sus marcas |
| `fn_supervisores_cartera` / `fn_cartera_clientes` / `fn_cartera_marcas` | Cartera por supervisor |
| `fn_operativos` / `fn_actividad_promotor` | Visitas, tareas y actividad |
| `fn_filtros_disponibles` | Opciones de los `<select>` |

> Las funciones que devuelven listas grandes devuelven **`jsonb`**: PostgREST corta
> en 1.000 filas (`db-max-rows`) y una fila `jsonb` nunca se trunca. Está explicado
> en `supabase/ESTADO.md`.

---

## Autenticación y seguridad

- **Login** con Supabase Auth (email + contraseña). No hay registro abierto ni
  recuperación de contraseña: las cuentas las crea un `admin` desde Configuración →
  Usuarios (o directamente en Supabase).
- **Guard en `App.tsx`:** `cargando` → pantalla de carga; sin sesión → `Login`; con
  sesión pero sin fila en `empleados` → pantalla "cuenta no habilitada".
- **Roles:** `admin` (puede cargar Excel: único camino de escritura) y `consulta`
  (solo lectura). La aplicación **no permite editar datos de negocio** por decisión
  de negocio; tampoco hay baja ni alta manual de clientes o productos.
- **RLS activo** en las tablas de negocio. Sin sesión, la `anon key` no lee nada.
  Las políticas exigen `admin` para `INSERT`/`UPDATE`/`DELETE`; los usuarios
  `consulta` sólo leen. La escritura de negocio ocurre únicamente por el importador.
- La `anon key` **sí** está en el bundle (es pública por diseño). La que **nunca**
  debe aparecer en el navegador es la `service_role`: sólo la usan los scripts de
  Node y la Edge Function `admin-usuarios`, siempre del lado del servidor.

---

## Catálogo de páginas

| Página | Archivo | Qué muestra |
| --- | --- | --- |
| **Dashboard** | `Dashboard.tsx` | 8 KPIs, evolución vs. período anterior, participación por marca, top clientes, por unidad de negocio, por localidad y por encargado. Los **8 filtros globales son reales**: cada cambio recalcula todo vía `fn_dashboard_todo`. Con **un solo período cargado** la evolución se reemplaza por la composición del importe (bruto → neto → final) |
| **Ventas** | `Sales.tsx` | Tabla transaccional paginada en la base (50 filas por página), búsqueda, filtros por período/marca/encargado/canal/categoría, resumen y modal de detalle |
| **Clientes** | `Customers.tsx` | Listado con búsqueda y filtros; ficha con tabs **Resumen** e **Historial**, compras por marca y modal de resumen. Usa `nombreDeCliente()` porque `nombre_fantasia` es nullable |
| **Productos** | `Products.tsx` | Vista lista con ranking, o vista jerarquía (unidad de negocio → división → familia → producto) |
| **Marcas** | `Brands.tsx` | KPIs, facturación por marca y ranking; detalle con serie mensual y productos. El color se deriva del id |
| **Promotores** | `Promotores.tsx` | Ranking de encargados y, por encargado: clientes, visitas, tareas, **actividad** y **resumen del día** compartible como imagen |
| **Supervisores** | `Supervisors.tsx` | Cartera por supervisor: benchmark de penetración de alcohol, matriz por marca, clientes de oportunidad y ficha con qué compró cada cliente |
| **Marketing** | `Marketing.tsx` | Drill-down de 4 niveles (canal ajustado → segmento → canal → subcanal) sobre `fn_marketing_por` |
| **Reportes** | `Reports.tsx` | 6 tipos de reporte con selects dependientes y datos reales vía RPC. Se exportan como **imagen PNG** (vista previa, descarga y compartir), respetando los filtros; no hay PDF ni Excel. «Resumen de ventas» muestra la evolución mensual con **dos o más períodos** y, con uno solo, el **top 10 de clientes** |
| **Cargas** | `Cargas.tsx` | Historial de los archivos subidos por «Cargar datos»: fecha, tipo, filas ok/descartadas, estado y duración, detalle expandible con supervisores, flags y dimensiones creadas. Permite copiar el resumen o **descargarlo como imagen PNG** |
| **Configuración** | `Settings.tsx` | Perfil del usuario (persiste en `empleados`) y, para `admin`, gestión completa de usuarios: alta con contraseña temporal, cambio de rol, activar/desactivar y eliminación definitiva de la cuenta de Auth vía Edge Function `admin-usuarios`. El bloque "Datos de la empresa" se quitó: no hay tabla para eso. Los objetivos no existen aún: el módulo de reportes muestra un aviso honesto en vez de metas inventadas |
| **Login** | `Login.tsx` | Acceso a pantalla completa, con errores de Supabase traducidos |

---

## Sistema de diseño

### Paleta

| Color | Hex | Uso |
| --- | --- | --- |
| Primary | `#1D4ED8` / `#2563EB` | Botones, íconos activos, acentos |
| Sidebar | `#0A1628` | Menú lateral |
| Sidebar hover / active | `#131E35` / `#1D3A6A` | Fila del menú |
| Superficie | `#F1F5F9` | Fondo de la app |
| Card | `#FFFFFF` | Tarjetas |
| Borde | `#E2E8F0` | Cards, tablas, botones |
| Texto | `#0F172A` / `#64748B` / `#94A3B8` | Principal / secundario / terciario |
| Success | `#059669` / `#10B981` | Positivo, "Activo" |
| Warning | `#F59E0B` | Alertas |
| Danger | `#EF4444` / `#DC2626` | Negativo, "Inactivo" |
| Violet | `#7C3AED` | Acento secundario, On-Trade |

Los tokens están declarados en el bloque `@theme` de `src/index.css`. La paleta de
gráficos vive en `src/components/ui/chartColors.ts`.

### Tipografía

| Rol | Fuente | Aplicación |
| --- | --- | --- |
| Display | **Outfit** | Títulos, cifras KPI |
| Texto | **Inter** | Labels, tablas, botones |
| Mono | **JetBrains Mono** | Números, códigos, tooltips |

### Patrones

```tsx
// Card
<div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }} />

// Chip / badge
<span className="px-2 py-0.5 rounded-full text-[11px] font-500" … />

// Barra de filtros
<div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end" … />
```

Los estados de carga, error y vacío se resuelven con
`src/components/ui/EstadoDatos.tsx`.

---

## Cómo extender

### Agregar una página

1. Crear `src/pages/MiPagina.tsx` con `export default function`.
2. Agregar el id al tipo `Page` en `src/components/Sidebar.tsx`.
3. Sumar la entrada a `navItems` (con ícono de `lucide-react` y su grupo).
4. Importarla y agregar el `case` en `src/App.tsx`.
5. Darle título y breadcrumb en `pageMeta` de `src/components/TopBar.tsx`.

### Agregar una consulta

1. Si el agregado es pesado o necesita filtrar en la base, escribir una función
   `fn_…` en un archivo nuevo de `supabase/` (nunca editar uno ya aplicado).
2. Documentar la función en `supabase/ESTADO.md`.
3. Tipar el retorno en `src/types/database.types.ts`.
4. Crear el hook en `src/hooks/` usando `useQuery` y `claveDeConsulta(...)`.
5. Consumirlo desde la página con `data`, `isLoading` e `isError`.

### Agregar un filtro

`Filtros` se define en `src/types/database.types.ts`; los valores por defecto y la
serialización de la `queryKey` están en `src/hooks/useFiltros.ts`. Un filtro nuevo
debe agregarse también a `fn_filtros_disponibles` y a las funciones que lo apliquen.

---

## Limitaciones y deuda técnica

1. **Exportación sólo como imagen.** Reportes, «Resumen del día» y el detalle de
   Cargas se descargan y comparten como **PNG** (`html-to-image`), que es lo que el
   cliente manda por WhatsApp. No hay botón "Exportar" en el TopBar (la descarga vive
   en cada pantalla), ni exportación a PDF/CSV, ni persistencia en `reportes_generados`.
2. **Sin historial de cambios, por diseño.** La app es **de solo lectura**: no se edita
   nada, así que no hay `historial_cambios` ni trigger de auditoría. Queda pendiente
   endurecer RLS para que `INSERT`/`UPDATE` también exijan `admin`.
3. **Un solo período cargado** (2026/10). Los gráficos de evolución necesitan dos meses, así
   que hoy se muestran alternativas que no dependen de la historia: top 10 de clientes en
   Reportes y composición del importe en el Dashboard. Vuelven solos al cargar otro mes.
   El importador ya permite cargar más períodos de ventas; faltan los archivos de
   meses anteriores.
4. **Sin router.** Navegación por `useState`: no hay URL, "atrás" del navegador ni
   deep-linking.
5. **Sin tests automatizados ni linter ni CI.** Sólo `verificar-datos.ts` (pruebas
   contra la base real) y `tsc`.
6. **Sin sistema de toasts.** Los mensajes de guardado son bloques inline.
7. **Tipos escritos a mano** (`src/types/database.types.ts`). Si cambia el esquema hay
   que actualizarlos a mano; no hay generación automática en el flujo actual.

---

## Entrega

- [x] Limpieza previa al traspaso: `seed`/`mockData` eliminados, `.figma/` y `dist/`
      borrados, `plan/` retirado, `excel/` fuera de git y scripts históricos archivados.
- [x] Repositorio limpio de entrega con historial nuevo (un commit inicial).
- [ ] **Vercel**: conectar el repo y configurar `VITE_SUPABASE_URL` y
      `VITE_SUPABASE_ANON_KEY`
- [ ] **Supabase Pro** y transferencia de la cuenta a Global Pack
- [x] Importador: **marcas nuevas en cartera** (02/11/2026)
- [x] RLS: `INSERT`/`UPDATE`/`DELETE` de negocio sólo para `admin` (archivo `40`)
- [ ] Documento de uso de 2 páginas para el supervisor
- [ ] Video de traspaso de 3–5 minutos
- [ ] Modo demo con datos ficticios para mostrar sin exponer datos de clientes
- [ ] Backup (`pg_dump`) y rotación de la `service_role` antes de transferir

La checklist completa de puesta en producción y traspaso está en
[`docs/ENTREGA.md`](docs/ENTREGA.md).
