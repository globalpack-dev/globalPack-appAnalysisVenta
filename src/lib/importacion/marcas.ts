/**
 * Marcas: lectura y alta de las que aparecen en los Excel.
 *
 * Las dos cargas (ventas y cartera) pueden traer una marca que todavía no está en
 * la tabla `marcas`. La vista previa la detecta sin escribir; la carga la crea.
 *
 * La clave para comparar nombres es `claveMarca`: mayúsculas, sin acentos y con
 * los espacios colapsados, para que "QUILMES" y "Quilmes " sean la misma marca.
 */

import { supabase } from '../supabase';
import { claveMarca, type MarcaBase } from './nombres';

const LOTE = 1000;

/** Cliente sin tipar: `marcas` no tiene tipo de `Insert` en los tipos a mano. */
const db = supabase as unknown as { from: (tabla: string) => any };

export type { MarcaBase };
export { claveMarca };

async function leerTodas<T>(tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await db
      .from(tabla)
      .select(columnas)
      .range(desde, desde + LOTE - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < LOTE) break;
  }
  return filas;
}

/** Todas las marcas de la base, con su id. */
export async function leerMarcasBase(): Promise<MarcaBase[]> {
  const filas = await leerTodas<{ id_marca: number; nombre: string }>(
    'marcas',
    'id_marca, nombre',
  );
  return filas.map((r) => ({
    id_marca: Number(r.id_marca),
    nombre: String(r.nombre ?? '').trim(),
  }));
}

export type MarcaNueva = {
  nombre: string;
  /** Si es alcohólica. Decide su fila en `marcas_alcohol` (KPIs de alcohol). */
  esAlcohol: boolean;
};

/**
 * Crea las marcas que faltan y registra su condición de alcohol.
 *
 * `marcas_alcohol` es la que decide qué cuenta como alcohol en los KPIs; una
 * marca sin fila ahí se trata como no alcohólica. Se inserta siempre para dejar
 * explícita la decisión del usuario en la vista previa.
 */
export async function crearMarcas(nuevas: MarcaNueva[]): Promise<MarcaBase[]> {
  if (!nuevas.length) return [];

  const { data, error } = await db
    .from('marcas')
    .insert(nuevas.map((m) => ({ nombre: m.nombre })))
    .select('id_marca, nombre');
  if (error) throw new Error(`marcas: ${error.message}`);

  const creadas = ((data ?? []) as Array<{ id_marca: number; nombre: string }>).map((r) => ({
    id_marca: Number(r.id_marca),
    nombre: String(r.nombre ?? '').trim(),
  }));

  if (creadas.length) {
    const porClave = new Map(nuevas.map((m) => [claveMarca(m.nombre), m.esAlcohol]));
    const alcohol = creadas.map((m) => ({
      id_marca: m.id_marca,
      es_alcoholica: porClave.get(claveMarca(m.nombre)) ?? false,
    }));
    const { error: errAlcohol } = await db
      .from('marcas_alcohol')
      .upsert(alcohol, { onConflict: 'id_marca', ignoreDuplicates: true });
    if (errAlcohol) throw new Error(`marcas_alcohol: ${errAlcohol.message}`);
  }

  return creadas;
}
