import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env',
  );
}

/**
 * Cliente único de Supabase para toda la aplicación.
 *
 * Importarlo desde varios módulos crearía conexiones distintas y
 * `auth.getSession()` no sería consistente entre ellos.
 *
 * Va tipado contra `Database`, así que `supabase.from('clientes')` autocompleta
 * las columnas y un nombre mal escrito es un error de compilación en vez de un
 * `undefined` en pantalla.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(url, anonKey);