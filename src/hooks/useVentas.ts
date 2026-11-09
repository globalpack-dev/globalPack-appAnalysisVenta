import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { claveDeFiltros, filtrosParaRpc } from './useFiltros';
import type { FilaMarketing, FilaVentaDetalle, Filtros, NivelMarketing } from '../types/database.types';

/**
 * Filas de la tabla de Ventas, paginadas y filtradas.
 *
 * Con 8.705 registros, traer todo y filtrar en el navegador se vuelve lento, y
 * la vista `v_ventas_detalle` por sí sola no aplica los 7 filtros (son 7
 * criterios, uno de ellos indirecto a través de `clientes.id_localidad`).
 *
 * Por eso la consulta va a `fn_ventas_pagina`, que sí los aplica. Esa función
 * hay que crearla en el SQL Editor: está en `supabase/03_fn_ventas_pagina.sql`.
 */
export const LIMITE_PAGINA = 50;

export function useVentas(filtros: Filtros, pagina = 1) {
  const rpc = filtrosParaRpc(filtros);
  const clave = claveDeFiltros(filtros);

  return useQuery({
    queryKey: ['fn_ventas_pagina', clave, pagina, LIMITE_PAGINA],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_ventas_pagina', {
        ...rpc,
        p_desde: (pagina - 1) * LIMITE_PAGINA,
        p_cantidad: LIMITE_PAGINA,
      });
      if (error) throw error;
      const filas = (data ?? []) as FilaVentaPagina[];
      return {
        filas: filas as unknown as FilaVentaDetalle[],
        total: filas.length > 0 ? Number(filas[0].total_filas) : 0,
      };
    },
    // Mantiene la tabla con las filas previas mientras carga la página nueva, en
    // vez de dejarla en blanco.
    placeholderData: (previo) => previo,
    staleTime: 60_000,
  });
}

/** Fila de `fn_ventas_pagina`: la de la vista más el total de la página. */
type FilaVentaPagina = FilaVentaDetalle & { total_filas: number };

/**
 * Datos del drill-down de Marketing.
 *
 * `nivel` no viaja a la base: la función devuelve las 4 dimensiones juntas y el
 * agrupado se hace en `agruparPorNivel`. Va en la clave de caché para que cambiar
 * de nivel no re-pregunte a la base.
 */
export function useMarketing(
  filtros: Filtros,
  nivel: NivelMarketing,
  seleccion: { segmento?: string | null; canalMkt?: string | null } = {},
) {
  const rpc = filtrosParaRpc(filtros);
  const clave = claveDeFiltros(filtros);
  const sel = {
    p_segmento: seleccion.segmento ?? null,
    p_canal_mkt: seleccion.canalMkt ?? null,
  };

  return useQuery({
    queryKey: ['fn_marketing_por', clave, nivel, sel],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_marketing_por', { ...rpc, ...sel });
      if (error) throw error;
      return (data ?? []) as FilaMarketing[];
    },
    staleTime: 60_000,
  });
}

/** Dimension de `FilaMarketing` que corresponde a cada nivel del drill-down. */
const COLUMNA_POR_NIVEL = {
  canal_ajustado: 'canal_ajustado',
  segmento: 'segmento_mkt',
  canal: 'canal_mkt',
  subcanal: 'subcanal_mkt',
} as const;

/**
 * Agrupa las filas de marketing por la dimensión del nivel pedido, sumando las
 * métricas.
 */
export function agruparPorNivel(filas: FilaMarketing[], nivel: NivelMarketing) {
  const columna = COLUMNA_POR_NIVEL[nivel];
  const acc = new Map<string, { ventas: number; bultos: number; hl: number }>();

  for (const f of filas) {
    const clave = (f[columna] ?? '—') as string;
    const actual = acc.get(clave) ?? { ventas: 0, bultos: 0, hl: 0 };
    actual.ventas += f.ventas;
    actual.bultos += f.bultos;
    actual.hl += f.hl;
    acc.set(clave, actual);
  }

  return [...acc.entries()]
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.ventas - a.ventas);
}