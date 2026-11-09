# global-pack-ventas — Sistema de Gestión Comercial (Global Pack)

React + Vite + Tailwind CSS conectado a **Supabase Cloud** (PostgreSQL + Auth + RLS).
Deploy en **Vercel**. El proyecto nació dentro de Figma Make, pero el build ya está
desacoplado: `vite.config.ts` es un config estándar de Vite.

> ⚠️ **Este proyecto evolucionó desde un prototipo con datos mock.** La UI es la
> misma idea original, pero los datos ahora vienen de Supabase. Antes de asumir algo
> sobre la arquitectura, leer `README.md` y `supabase/ESTADO.md`.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

Estructura real (la lista corta del scaffold original ya no alcanza):

- `src/main.tsx` — entrypoint: `QueryClientProvider` + `AuthProvider` + `<App />`
- `src/App.tsx` — guard de sesión y navegación (no hay router; `useState<Page>`)
- `src/index.css` — Tailwind v4 (`@import 'tailwindcss'`), fuentes y tokens `@theme`
- `src/components/` — `Sidebar.tsx` (define el tipo `Page`), `TopBar.tsx` y `ui/`
- `src/context/AuthContext.tsx` — sesión de Supabase y fila de `empleados`
- `src/hooks/` — **toda** la lectura de datos (`useDashboard`, `useCatalogos`,
  `useVentas`, `useMarcas`, `useProductos`, `useCartera`, `useReporte`, `useFiltros`,
  `useEmpleados`, `useImportaciones`) y `useImportar` (orquesta la carga de los dos Excel)
- `src/lib/` — `supabase.ts` (cliente único), `queryClient.ts`, `format.ts`,
  `usuario.ts`, `visitas.ts`, `importacion/` (lectura, validación y carga de Excel)
- `src/pages/` — 11 páginas + `Login.tsx`
- `src/types/database.types.ts` — **escrito a mano**; no hay generación automática
- `supabase/` — 59 archivos SQL aplicados a mano en el SQL Editor + `ESTADO.md`,
  `config.toml` y `functions/admin-usuarios` (Edge Function)
- `scripts/` — `verificar-datos.ts` y `historicos/` (cargadores previos al importador)
- `docs/ENTREGA.md` — checklist de deploy y traspaso
- `database.sql` — esquema original; **no modificar**

## Data layer

- Toda consulta pasa por `src/lib/supabase.ts` y un hook de `src/hooks/`.
- Los agregados pesados se calculan en Postgres (`fn_…` vía `rpc`), no en el cliente.
- Las funciones que devuelven listas grandes devuelven **`jsonb`**: PostgREST corta
  en 1.000 filas (`db-max-rows`).
- Los filtros viven en `Filtros` (`src/types/database.types.ts`) y se serializan en
  la `queryKey` con `src/hooks/useFiltros.ts`.

## Reglas críticas

1. **No recrear el seed.** `scripts/seed.ts` y `src/data/mockData.ts` se eliminaron
   el 04/11/2026: borraban todas las tablas y cargaban datos mock. Con los datos
   reales cargados, recrearlo significa perderlos. La carga oficial es «Cargar datos»
   en la app; los cargadores previos quedan archivados en `scripts/historicos/`.
2. **No editar un archivo SQL ya aplicado.** Agregar un archivo numerado nuevo
   (`46_…sql`) y documentarlo en `supabase/ESTADO.md`. El SQL Editor envuelve todo en
   una transacción: si una sentencia falla, revierte el archivo completo. Por eso las
   verificaciones van en un `NNb_verificacion.sql` aparte.
3. **Cambiar la firma de una función exige `DROP FUNCTION` antes.** Con parámetros
   con `DEFAULT` o columnas nuevas en `RETURNS TABLE`, `CREATE OR REPLACE` deja
   sobrecargas y Postgres falla con "could not choose the best candidate function".
4. **`npm run verificar` golpea la base real** (usa `service_role`). No lo correr
   como parte de un refactor casual.
5. **La `service_role` nunca entra a `src/`.** Sólo la leen los scripts, vía `dotenv`,
   y la Edge Function `admin-usuarios` del lado del servidor.
6. Verificación mínima antes de dar algo por terminado: `npm run typecheck` y
   `npm run build`.

## Dependencies

- Runtime: React 19, React DOM 19, `@supabase/supabase-js`, `@tanstack/react-query`,
  Recharts 3, lucide-react, xlsx, jspdf (diferido), html-to-image
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, `@vitejs/plugin-react`
- Scripts: tsx, dotenv
- Node: 22 LTS (`.nvmrc` / `.mise.toml`)

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.
