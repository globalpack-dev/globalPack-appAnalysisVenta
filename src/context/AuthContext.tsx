import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { empleados } from '../types/database.types';

/**
 * Estado de sesión y del empleado.
 *
 * Se separa en dos capas a propósito:
 *
 *   session   — la manages Supabase. Dice "quién es", no "qué puede hacer".
 *   empleado  — nuestra tabla. Dice el nombre, el email y el ROL.
 *
 * La sesión por sí sola no alcanza para decidir permisos: el rol vive en
 * `empleados`, y esa fila la crea el trigger `on_auth_user_created` al
 * registrarse.
 */

type AuthContextValue = {
  /** null mientras no hay sesión. */
  session: Session | null;
  /** Fila de `empleados` del usuario conectado. null si no hay sesión. */
  empleado: empleados | null;
  /** true sólo para empleados activos con rol admin. */
  esAdmin: boolean;
  /**
   * true mientras se resuelve la sesión inicial.
   *
   * Importante: sin este estado, el guard de `App.tsx` mostraría el login un
   * instante antes de que `getSession()` responda, y el usuario vería un parpadeo
   * al recargar con la sesión activa.
   */
  cargando: boolean;
  /** Mensaje de error de un intento fallido de inicio de sesión. */
  error: string | null;
  ingresar: (email: string, password: string) => Promise<boolean>;
  salir: () => Promise<void>;
  /** Refresca el empleado. Se usa tras cambiar el perfil en Settings. */
  recargar: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [empleado, setEmpleado] = useState<empleados | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Trae la fila de `empleados` del usuario conectado. */
  const cargarEmpleado = useCallback(async (usuarioId: string) => {
    const { data, error: err } = await supabase
      .from('empleados')
      .select('*')
      .eq('id', usuarioId)
      .maybeSingle();

    if (err) {
      console.error('No se pudo leer el perfil del empleado:', err.message);
      setEmpleado(null);
      return;
    }
    setEmpleado(data);
  }, []);

  // Sesión inicial + suscripción a los cambios de sesión.
  useEffect(() => {
    let vigente = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!vigente) return;
        setSession(data.session);
        if (data.session?.user) await cargarEmpleado(data.session.user.id);
        if (vigente) setCargando(false);
      })
      .catch(() => {
        if (vigente) setCargando(false);
      });

    // El callback de onAuthStateChange corre en un momento raro del ciclo de
    // React: hacer llamadas async adentro puede disparar el warning de "state
    // update on an unmounted component". Por eso sólo guarda el session, y la
    // lectura del perfil se dispara desde el useEffect de abajo.
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSession(nueva);
      if (!nueva) setEmpleado(null);
    });

    return () => {
      vigente = false;
      sub.subscription.unsubscribe();
    };
  }, [cargarEmpleado]);

  // Cuando cambia el usuario, buscar su perfil.
  useEffect(() => {
    const id = session?.user?.id;
    if (!id) {
      setEmpleado(null);
      return;
    }
    void cargarEmpleado(id);
  }, [session?.user?.id, cargarEmpleado]);

  const ingresar = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (err) {
      setError(traducirError(err.message));
      return false;
    }
    return true;
  }, []);

  const salir = useCallback(async () => {
    await supabase.auth.signOut();
    setEmpleado(null);
    setError(null);
  }, []);

  const recargar = useCallback(async () => {
    const id = session?.user?.id;
    if (id) await cargarEmpleado(id);
  }, [session?.user?.id, cargarEmpleado]);

  const valor = useMemo<AuthContextValue>(
    () => ({
      session,
      empleado,
      esAdmin: empleado?.rol === 'admin' && empleado.activo,
      cargando,
      error,
      ingresar,
      salir,
      recargar,
    }),
    [session, empleado, cargando, error, ingresar, salir, recargar],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}

/**
 * Traduce los mensajes de Supabase, que llegan en inglés.
 *
 * "Invalid login credentials" es deliberadamente genérico a propósito: no revela
 * si el email existe o la contraseña está mal. Es la mejor práctica, así que el
 * mensaje al usuario también es genérico.
 */
function traducirError(mensaje: string): string {
  const m = mensaje.toLowerCase();

  if (m.includes('invalid login credentials')) {
    return 'Usuario o contraseña incorrectos.';
  }
  if (m.includes('email not confirmed')) {
    return 'La cuenta no está confirmada. Revisá el correo de invitación.';
  }
  if (m.includes('user not found')) {
    return 'No existe una cuenta con ese correo.';
  }
  if (m.includes('password should be')) {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Demasiados intentos. Esperá un momento y volvé a probar.';
  }
  if (m.includes('fetch') || m.includes('network')) {
    return 'No se pudo conectar con el servidor. Revisá tu conexión.';
  }
  return 'No se pudo iniciar sesión. Intentá de nuevo.';
}