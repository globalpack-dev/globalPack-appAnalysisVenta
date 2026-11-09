// @ts-nocheck: archivo Deno; el `tsc` del proyecto no lo incluye. Se valida con `deno check`.
// Este archivo corre en Deno (Edge Function), no en el bundle de React.
// ============================================================================
//  admin-usuarios — alta y baja de cuentas desde Configuración
// ============================================================================
//
//  Crear o eliminar usuarios de `auth.users` exige la `service_role`, que nunca
//  puede viajar al navegador. Esta función la usa sólo del lado del servidor:
//
//    1. recibe el JWT del usuario conectado,
//    2. lo valida con la clave pública,
//    3. comprueba en `empleados` que sea un admin activo,
//    4. recién ahí usa la Admin API con la clave de servicio.
//
//  Acciones:
//    { accion: 'crear', nombre, email, password, rol }
//    { accion: 'eliminar', id }
//
//  Desplegar con:
//    npx supabase functions deploy admin-usuarios --remote=<project-ref> --use-api --no-verify-jwt --yes
//
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function responder(cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/** Traduce los errores de Auth a algo que el admin pueda entender. */
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();

  if (m.includes('already') && (m.includes('registered') || m.includes('exists'))) {
    return 'Ya existe una cuenta con ese correo electrónico.';
  }
  if (m.includes('password')) {
    return 'La contraseña no cumple los requisitos mínimos (al menos 8 caracteres).';
  }
  if (m.includes('email') && (m.includes('invalid') || m.includes('valid'))) {
    return 'El correo electrónico no es válido.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Demasiados intentos. Esperá un momento y volvé a probar.';
  }
  if (m.includes('not found')) {
    return 'La cuenta ya no existe.';
  }
  return 'No se pudo completar la operación. Intentá de nuevo.';
}

function limpiarTexto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

Deno.serve(async (req) => {
  // El navegador manda un preflight antes del POST.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return responder({ error: 'Método no permitido.' }, 405);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !anonKey || !serviceKey) {
    console.error('Faltan variables de entorno de Supabase.');
    return responder({ error: 'La función no está configurada correctamente.' }, 500);
  }

  // ── 1. Identificar al que llama ───────────────────────────────────────────
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return responder({ error: 'No autorizado. Iniciá sesión de nuevo.' }, 401);
  }

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await authClient.auth.getUser(token);

  if (authError || !authData.user) {
    return responder({ error: 'La sesión venció o no es válida. Volvé a iniciar sesión.' }, 401);
  }

  // Cliente con service_role: sólo vive dentro de la función.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 2. Exigir admin activo ────────────────────────────────────────────────
  const { data: perfil, error: perfilError } = await admin
    .from('empleados')
    .select('rol, activo')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (perfilError) {
    console.error('No se pudo leer el perfil del llamador:', perfilError.message);
    return responder({ error: 'No se pudo verificar tus permisos.' }, 500);
  }
  if (!perfil || perfil.rol !== 'admin' || !perfil.activo) {
    return responder({ error: 'Sólo un administrador activo puede gestionar usuarios.' }, 403);
  }

  // ── 3. Leer la acción ─────────────────────────────────────────────────────
  let cuerpo: Record<string, unknown>;
  try {
    const json = await req.json();
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Cuerpo inválido');
    cuerpo = json as Record<string, unknown>;
  } catch {
    return responder({ error: 'La solicitud no tiene el formato esperado.' }, 400);
  }

  const accion = limpiarTexto(cuerpo.accion);

  // ── 4. Crear usuario ──────────────────────────────────────────────────────
  if (accion === 'crear') {
    const nombre = limpiarTexto(cuerpo.nombre);
    const email = limpiarTexto(cuerpo.email).toLowerCase();
    const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';
    const rol = cuerpo.rol;

    if (nombre.length < 2) {
      return responder({ error: 'El nombre debe tener al menos 2 caracteres.' }, 400);
    }
    if (nombre.length > 80) {
      return responder({ error: 'El nombre no puede superar los 80 caracteres.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responder({ error: 'Ingresá un correo electrónico válido.' }, 400);
    }
    if (email.length > 254) {
      return responder({ error: 'El correo es demasiado largo.' }, 400);
    }
    if (password.length < 8) {
      return responder({ error: 'La contraseña temporal debe tener al menos 8 caracteres.' }, 400);
    }
    if (rol !== 'admin' && rol !== 'consulta') {
      return responder({ error: 'El rol debe ser Administrador o Consulta.' }, 400);
    }

    const { data: creado, error: errorCrear } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, rol },
    });

    if (errorCrear) {
      console.error('createUser:', errorCrear.message);
      return responder({ error: traducirError(errorCrear.message) }, 400);
    }

    const usuarioId = creado.user.id;

    // El trigger `crear_empleado` ya insertó la fila con la metadata. Este
    // upsert asegura nombre y rol aunque el trigger cambie o no exista.
    const { error: errorPerfil } = await admin.from('empleados').upsert(
      { id: usuarioId, nombre, email, rol, activo: true },
      { onConflict: 'id' },
    );

    if (errorPerfil) {
      console.error('No se pudo crear el perfil:', errorPerfil.message);
      // Deshacer el alta para no dejar una cuenta de Auth sin perfil.
      const { error: errorBorrar } = await admin.auth.admin.deleteUser(usuarioId);
      if (errorBorrar) {
        console.error('No se pudo deshacer el alta:', errorBorrar.message);
      }
      return responder(
        { error: 'La cuenta se creó pero no se pudo habilitar. Se deshizo el alta.' },
        500,
      );
    }

    return responder({
      ok: true,
      usuario: { id: usuarioId, nombre, email, rol },
    });
  }

  // ── 5. Eliminar usuario ───────────────────────────────────────────────────
  if (accion === 'eliminar') {
    const id = limpiarTexto(cuerpo.id);

    if (!UUID.test(id)) {
      return responder({ error: 'El identificador del usuario no es válido.' }, 400);
    }
    if (id === authData.user.id) {
      return responder({ error: 'No podés eliminar tu propia cuenta.' }, 400);
    }

    const { data: objetivo, error: errorObjetivo } = await admin
      .from('empleados')
      .select('id, rol, activo')
      .eq('id', id)
      .maybeSingle();

    if (errorObjetivo) {
      console.error('No se pudo leer el usuario a eliminar:', errorObjetivo.message);
      return responder({ error: 'No se pudo verificar el usuario a eliminar.' }, 500);
    }
    if (!objetivo) {
      return responder({ error: 'Ese usuario ya no existe.' }, 404);
    }

    // Si es admin activo, tiene que quedar otro admin activo distinto de él.
    if (objetivo.rol === 'admin' && objetivo.activo) {
      const { count, error: errorConteo } = await admin
        .from('empleados')
        .select('*', { count: 'exact', head: true })
        .eq('rol', 'admin')
        .eq('activo', true)
        .neq('id', id);

      if (errorConteo) {
        console.error('No se pudo contar admins:', errorConteo.message);
        return responder({ error: 'No se pudo verificar que quede un administrador.' }, 500);
      }
      if ((count ?? 0) === 0) {
        return responder({ error: 'Debe quedar al menos un administrador activo.' }, 400);
      }
    }

    const { error: errorEliminar } = await admin.auth.admin.deleteUser(id);

    if (errorEliminar) {
      console.error('deleteUser:', errorEliminar.message);

      // Caso raro: la fila existe pero la cuenta de Auth ya no. Se limpia la
      // fila para que la UI no muestre un usuario fantasma.
      if (errorEliminar.message.toLowerCase().includes('not found')) {
        await admin.from('empleados').delete().eq('id', id);
        return responder({ ok: true });
      }

      return responder({ error: traducirError(errorEliminar.message) }, 400);
    }

    return responder({ ok: true });
  }

  return responder({ error: 'Acción desconocida.' }, 400);
});
