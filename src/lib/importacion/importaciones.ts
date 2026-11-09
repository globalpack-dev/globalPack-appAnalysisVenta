/**
 * Registro de importaciones y tipos compartidos por ventas y cartera.
 *
 * La auditoría vive en la tabla `importaciones` (`supabase/33_importaciones.sql`).
 * Cada carga abre una fila al empezar y la cierra al terminar, con el resultado
 * o el error. Se escribe con la sesión del usuario.
 *
 * Si la tabla todavía no existe, `abrirImportacion` devuelve `null` en vez de
 * romper la carga: la auditoría es un extra, no un requisito para importar.
 */

import { supabase } from '../supabase';
import type { TipoExcel } from './config';

/** Cliente sin tipar: las tablas de importación no necesitan los tipos del esquema. */
const db = supabase as unknown as { from: (tabla: string) => any };

/**
 * Fases que puede reportar una carga. Las tres primeras son de ventas; el resto
 * de cartera. Compartirlas acá permite que el modal tenga un solo mapa.
 */
export type FaseCarga =
  | 'dimensiones'
  | 'borrado'
  | 'ventas'
  | 'respaldo'
  | 'cartera'
  | 'alcohol'
  | 'producto'
  | 'operativa';

export type Progreso = {
  fase: FaseCarga;
  mensaje: string;
  actual?: number;
  total?: number;
};

type ErrorSupabase = { code?: string; message?: string };

/** ¿El error es "esa tabla no existe" (falta correr el SQL)? */
export function esTablaFaltante(error: ErrorSupabase | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST205') return true;
  return /does not exist|schema cache|could not find the table/i.test(error.message ?? '');
}

/**
 * Abre el registro de una importación. Devuelve el id, o `null` si la tabla de
 * auditoría todavía no está creada.
 */
export async function abrirImportacion(
  tipo: TipoExcel,
  archivo: string,
): Promise<number | null> {
  const { data, error } = await db
    .from('importaciones')
    .insert({ tipo, archivo })
    .select('id_importacion')
    .single();

  if (error) {
    if (esTablaFaltante(error)) return null;
    throw new Error(`No se pudo registrar la importación: ${error.message}`);
  }

  return Number(data.id_importacion);
}

/** Cierra el registro con el resultado. Un fallo acá no invalida la carga. */
export async function cerrarImportacion(
  id: number | null,
  datos: {
    estado: 'ok' | 'error';
    filasOk?: number;
    filasDescartadas?: number;
    error?: string | null;
    detalle?: Record<string, unknown>;
  },
): Promise<void> {
  if (id === null) return;

  const { error } = await db
    .from('importaciones')
    .update({
      estado: datos.estado,
      filas_ok: datos.filasOk ?? 0,
      filas_descartadas: datos.filasDescartadas ?? 0,
      error: datos.error ?? null,
      detalle: datos.detalle ?? {},
      finalizado_en: new Date().toISOString(),
    })
    .eq('id_importacion', id);

  if (error) console.warn('No se pudo cerrar la importación:', error.message);
}
