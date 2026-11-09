# Edge Functions

## `admin-usuarios`

Alta y baja de cuentas de acceso desde **Configuración → Usuarios**.

Crear o eliminar usuarios de `auth.users` requiere la `service_role`. Esa clave
nunca entra al frontend: vive sólo en esta función, que primero valida que quien
llama sea un administrador activo.

| Acción | Cuerpo | Qué hace |
| --- | --- | --- |
| `crear` | `{ accion, nombre, email, password, rol }` | Crea la cuenta con `email_confirm: true` y asegura su fila en `empleados`. |
| `eliminar` | `{ accion, id }` | Elimina la cuenta de Auth. La fila de `empleados` se borra por `ON DELETE CASCADE`. |

### Requisitos

- El proyecto ya tiene el trigger `crear_empleado` (archivo `04_auth_rls.sql`).
- Las variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`
  las inyecta Supabase automáticamente en la función. No se agregan al `.env`
  del frontend.
- El import de `@supabase/supabase-js` usa la URL completa de `esm.sh` para que
  la función también funcione si se pega directamente en el editor del dashboard.

### Errores en el editor

Si VS Code marca `No se encuentra el módulo ...` o `Deno` como no definido, son
falsos positivos: el archivo es Deno, no React/Node. El `tsconfig.json` del
proyecto no incluye `supabase/functions`, así que `tsc` nunca lo revisa. La
validación real es:

```bash
npx deno check supabase/functions/admin-usuarios/index.ts
```

Para que el editor lo entienda, instalá la extensión **Deno** y agregá en
`.vscode/settings.json`:

```json
{ "deno.enablePaths": ["./supabase/functions"] }
```

### Deploy

Desde la raíz del repositorio, con el CLI logueado:

```bash
npx supabase login
npx supabase functions deploy admin-usuarios --remote=<project-ref> --use-api --no-verify-jwt --yes
```

`<project-ref>` es el valor de `SUPABASE_PROJECT_REF` en el `.env`.
`--use-api` evita necesitar Docker para empaquetar la función. `--no-verify-jwt`
deja pasar el preflight CORS; la función valida el token y el rol por su cuenta.

También se puede crear desde el dashboard: **Edge Functions → Deploy a new
function**, pegar `index.ts` y publicar. Desactivá **Verify JWT** en la
configuración de la función: la validación del token y del rol se hace dentro del
código, y así el preflight CORS (`OPTIONS`) llega sin problema.

### Probar

1. Entrar como admin a **Configuración → Usuarios**.
2. Crear un usuario de prueba con contraseña temporal.
3. Abrir una ventana incógnita e iniciar sesión con esa cuenta.
4. Volver al admin y eliminar la cuenta.
5. Confirmar que la cuenta de prueba ya no puede iniciar sesión.

### Nota sobre revocación

Al eliminar la cuenta se borran sus sesiones y su perfil. Un access token ya
emitido puede seguir siendo aceptado por PostgREST hasta que expire (por defecto,
alrededor de una hora). La app bloquea al usuario al recargar porque ya no
encuentra su fila en `empleados`.
