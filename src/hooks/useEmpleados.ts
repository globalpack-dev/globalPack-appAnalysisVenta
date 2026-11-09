import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { empleados } from '../types/database.types';

/**
 * Lista de usuarios del sistema.
 *
 * La tabla `empleados` es chica y la lectura está permitida a cualquier
 * autenticado, pero la consulta se deja deshabilitada hasta saber que el usuario
 * es admin: un `consulta` no tiene por qué cargar la lista de cuentas.
 */
export function useEmpleados(habilitado = true) {
  return useQuery({
    queryKey: ['empleados'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empleados')
        .select('*')
        .order('nombre');

      if (error) throw error;
      return (data ?? []) as empleados[];
    },
    enabled: habilitado,
    staleTime: 30_000,
  });
}

/**
 * Actualiza rol y estado de otro empleado.
 *
 * No se usa `UPDATE` directo: el RPC `fn_actualizar_empleado` valida en la base
 * que quien llama sea admin, que no esté editándose a sí mismo y que siempre
 * quede al menos un administrador activo.
 */
export function useActualizarEmpleado() {
  const queryClient = useQueryClient();

  return useCallback(
    async (id: string, rol: empleados['rol'], activo: boolean) => {
      const { error } = await supabase.rpc('fn_actualizar_empleado', {
        p_id: id,
        p_rol: rol,
        p_activo: activo,
      });

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ['empleados'] });
    },
    [queryClient],
  );
}

export type NuevoEmpleado = {
  nombre: string;
  email: string;
  password: string;
  rol: empleados['rol'];
};

/**
 * Llama a la Edge Function `admin-usuarios`.
 *
 * La función devuelve errores de negocio con status 4xx y un `{ error }` en el
 * cuerpo. `functions.invoke` los expone en `error.context`, así que hay que leer
 * esa respuesta para mostrar el mensaje real y no un genérico.
 */
async function invocarAdminUsuarios(cuerpo: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', {
    body: cuerpo,
  });

  if (error) {
    let mensaje = 'No se pudo completar la operación.';

    const contexto = (error as { context?: Response }).context;
    if (contexto) {
      if (contexto.status === 404) {
        mensaje = 'La función de gestión de usuarios no está desplegada.';
      }
      try {
        const payload = (await contexto.json()) as { error?: unknown };
        if (typeof payload?.error === 'string' && payload.error) mensaje = payload.error;
      } catch {
        // La respuesta no era JSON; se usa el mensaje genérico.
      }
    }

    throw new Error(mensaje);
  }

  if (data && typeof data === 'object' && 'error' in data) {
    const mensaje = (data as { error?: unknown }).error;
    if (typeof mensaje === 'string' && mensaje) throw new Error(mensaje);
  }
}

/** Crea una cuenta de Auth y su perfil en `empleados`. Sólo admin. */
export function useCrearEmpleado() {
  const queryClient = useQueryClient();

  return useCallback(
    async (entrada: NuevoEmpleado) => {
      await invocarAdminUsuarios({ accion: 'crear', ...entrada });
      await queryClient.invalidateQueries({ queryKey: ['empleados'] });
    },
    [queryClient],
  );
}

/** Elimina la cuenta de Auth y, por cascada, su fila en `empleados`. Sólo admin. */
export function useEliminarEmpleado() {
  const queryClient = useQueryClient();

  return useCallback(
    async (id: string) => {
      await invocarAdminUsuarios({ accion: 'eliminar', id });
      await queryClient.invalidateQueries({ queryKey: ['empleados'] });
    },
    [queryClient],
  );
}
