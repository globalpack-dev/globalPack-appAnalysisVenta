import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { claveDeFiltros, filtrosParaRpc } from './useFiltros';
import type { FilaJerarquia, FilaProducto, Filtros } from '../types/database.types';

/**
 * Productos con sus métricas de venta.
 *
 * `fn_productos` ya devuelve las columnas `ventas`, `bultos`, `hl` y `unidades`,
 * calculadas en la base. La tabla `productos` sólo tiene 6 columnas: el
 * prototipoackage esas métricas desde el array en memoria.
 */
export function useProductos(filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);

  return useQuery({
    queryKey: ['fn_productos', claveDeFiltros(filtros)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_productos', rpc);
      if (error) throw error;
      return (data ?? []) as FilaProducto[];
    },
    staleTime: 60_000,
  });
}

/**
 * Árbol comercial aplanado: una fila por producto con sus tres ancestros.
 */
export function useJerarquiaComercial(filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);

  return useQuery({
    queryKey: ['fn_jerarquia_comercial', claveDeFiltros(filtros)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_jerarquia_comercial', rpc);
      if (error) throw error;
      return (data ?? []) as FilaJerarquia[];
    },
    staleTime: 60_000,
  });
}

// ─── Armado del árbol ──────────────────────────────────────────────────────────

/** Un nivel del árbol: UN → División → Familia. */
type Nodo = {
  id: number
  nombre: string
  ventas: number
  hijos: Nodo[]
  productos: {
    id: number
    codigo: string
    nombre: string
    unidades: number
    ventas: number
  }[]
};

/**
 * Agrupa las filas aplanadas en el árbol UN → División → Familia → Producto.
 *
 * Las métricas de los padres se suman de abajo hacia arriba: el total de una
 * división es la suma de sus familias, y el de una unidad de negocio, la suma de
 * sus divisiones. Por eso el `ventas` de la hoja se acumula en cada ancestro.
 */
export function armarJerarquia(filas: FilaJerarquia[]): Nodo[] {
  const unidades = new Map<number, Nodo>();
  const divisiones = new Map<number, Nodo>();
  const familias = new Map<number, Nodo>();

  for (const f of filas) {
    // Unidad de negocio
    let un = unidades.get(f.id_unidad_negocio);
    if (!un) {
      un = { id: f.id_unidad_negocio, nombre: f.nombre_unidad, ventas: 0, hijos: [], productos: [] };
      unidades.set(f.id_unidad_negocio, un);
    }

    // División
    let div = divisiones.get(f.id_division);
    if (!div) {
      div = { id: f.id_division, nombre: f.nombre_division, ventas: 0, hijos: [], productos: [] };
      divisiones.set(f.id_division, div);
      un.hijos.push(div);
    }

    // Familia
    let fam = familias.get(f.id_familia);
    if (!fam) {
      fam = { id: f.id_familia, nombre: f.nombre_familia, ventas: 0, hijos: [], productos: [] };
      familias.set(f.id_familia, fam);
      div.hijos.push(fam);
    }

    // Producto (hoja)
    fam.productos.push({
      id: f.id_producto,
      codigo: f.codigo_producto,
      nombre: f.nombre_producto,
      unidades: f.bultos,
      ventas: f.ventas,
    });

    // Acumulado hacia arriba
    fam.ventas += f.ventas;
    div.ventas += f.ventas;
    un.ventas += f.ventas;
  }

  return [...unidades.values()];
}