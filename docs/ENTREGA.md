# Entrega y traspaso — Global Pack

Checklist para poner el sistema en producción y transferirlo a Global Pack.
El detalle técnico de la base vive en [`../supabase/ESTADO.md`](../supabase/ESTADO.md).

---

## 1. Qué se entrega

| Componente | Dónde | Responsable de la transferencia |
| --- | --- | --- |
| Repositorio de código | GitHub | Pasar el repo a una cuenta/organización de Global Pack |
| Aplicación publicada | Vercel | Transferir el proyecto o redeployar desde el repo nuevo |
| Base de datos, Auth y Storage | Supabase Cloud | Transferir el proyecto y pasar a plan Pro |
| Edge Function `admin-usuarios` | Supabase | Ya vive dentro del proyecto de Supabase |
| Planillas fuente | Fuera del repo (`excel/`) | Quedan en poder del cliente |

> El repositorio de entrega **no incluye** `.env`, `node_modules/`, `dist/`,
> `.figma/` ni las planillas de `excel/`. Tampoco incluye documentación interna de
> proceso; la referencia técnica es `README.md` + `supabase/ESTADO.md`.
>
> Se entrega con **historial Git nuevo** (un único commit inicial). El historial de
> desarrollo del pasante queda en el repositorio interno, fuera de esta entrega.

---

## 2. Requisitos

- Node.js **22 LTS** (`.nvmrc` / `.mise.toml`)
- npm 10 o superior
- Acceso al proyecto de Supabase
- Acceso a Vercel y al repositorio de GitHub

---

## 3. Variables de entorno

Crear `.env` (desarrollo) o configurarlas en Vercel:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Sólo para scripts de Node (nunca en el frontend ni en Vercel):

```bash
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
SUPABASE_PROJECT_REF=<project-ref>
```

Reglas:

- La `anon key` es pública por diseño y sí viaja al bundle.
- La `service_role` **saltea RLS**. No debe aparecer en `src/`, en Vercel ni en el
  repositorio.
- El archivo `.env` local no se versiona.

---

## 4. Puesta en marcha local

```bash
npm install
cp .env.example .env   # completar los valores
npm run dev                        # http://localhost:8443
npm run typecheck
npm run build
```

---

## 5. Base de datos

El DDL **no se aplica por REST**: los archivos SQL se ejecutan a mano en el
**SQL Editor** de Supabase.

1. Revisar el orden y el estado de cada archivo en
   [`../supabase/ESTADO.md`](../supabase/ESTADO.md).
2. Ejecutar los archivos numerados en orden. Los `NNb_verificacion.sql` son
   controles opcionales y van aparte.
3. No editar un archivo ya aplicado: los cambios nuevos van en un archivo
   numerado nuevo.
4. Si cambia la firma de una función, hacer `DROP FUNCTION` antes del
   `CREATE OR REPLACE`.

El esquema original está en `database.sql` y **no se modifica**.

---

## 6. Edge Function `admin-usuarios`

La usa Configuración → Usuarios para crear y eliminar cuentas de Auth.

```bash
npx supabase login
npx supabase functions deploy admin-usuarios \
  --remote=<project-ref> --use-api --no-verify-jwt --yes
```

La función valida el JWT y el rol de administrador por su cuenta, y recién
entonces usa la `service_role`. Ver
[`../supabase/functions/README.md`](../supabase/functions/README.md).

---

## 7. Deploy en Vercel

1. Importar el repositorio en Vercel.
2. Framework: **Vite** (detectado por `vercel.json`).
3. Build: `npm run build` · Output: `dist`.
4. Cargar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en
   *Project Settings → Environment Variables*.
5. Deploy.
6. En Supabase → *Authentication → URL Configuration*, agregar la URL de Vercel
   como **Site URL** y en **Redirect URLs**.

---

## 8. Datos iniciales

El camino oficial es la app: **Cargar datos** (usuario `admin`).

- **Ventas**: reemplaza sólo los períodos que trae el archivo.
- **Cartera**: reemplaza toda la cartera; antes archiva una foto en
  `cartera_historial`.
- Cada carga queda auditada en `importaciones`.

Los scripts de `scripts/historicos/` son referencia y no se usan en producción.
`npm run verificar` golpea la base real con `service_role`: correrlo sólo con
intención y nunca como parte de un build.

---

## 9. Backup y seguridad antes de transferir

- [ ] `pg_dump` completo de la base (o backup desde el dashboard de Supabase).
- [ ] Rotar la `service_role` después de la transferencia.
- [ ] Rotar la contraseña de la cuenta de Supabase.
- [ ] Confirmar que `.env` no está en el repositorio (sí debe estar `.env.example`).
- [ ] Revisar que la `anon key` configurada en Vercel sea la del proyecto
      transferido.
- [ ] Verificar que RLS esté activo y que la app no permita escritura fuera del
      importador.
- [ ] Confirmar que el plan de Supabase sea **Pro** (el plan Free pausa el
      proyecto por inactividad).

---

## 10. Verificación post-entrega

- [ ] Login con un usuario `admin` y con un usuario `consulta`.
- [ ] Dashboard carga los KPIs y los filtros recalculan.
- [ ] Las 11 pantallas abren sin errores.
- [ ] «Cargar datos» acepta la planilla de ventas y la de cartera.
- [ ] Reportes y «Resumen del día» descargan PNG.
- [ ] Configuración → Usuarios crea, desactiva y elimina una cuenta de prueba.
- [ ] `npm run typecheck` y `npm run build` pasan en el repo entregado.
- [ ] La URL de producción responde y tiene `noindex`.

---

## 11. Limitaciones conocidas

- La app es **de solo lectura**; el único camino de escritura es el importador
  del `admin`.
- Exportación sólo como **PNG** (no PDF/CSV).
- No hay router: la navegación es estado en memoria, sin URLs ni deep-linking.
- Los tipos de `src/types/database.types.ts` están escritos a mano.
- Un solo período cargado al momento de la entrega (2026/10); los gráficos de
  evolución se activan al cargar un segundo mes.
