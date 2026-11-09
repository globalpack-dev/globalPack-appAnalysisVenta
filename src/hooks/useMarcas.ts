import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { claveDeFiltros, filtrosParaRpc } from './useFiltros';
import type { FilaMarca, FilaMarcaDetalle, FilaMarcaSerie, Filtros } from '../types/database.types';

/**
 * Marcas con sus métricas y el crecimiento contra el mes anterior.
 *
 * `fn_marcas` calcula los cuatro datos que la tabla `marcas` no tiene
 * (ventas, productos, unidades, hl) y el crecimiento mes a mes.
 *
 * El `color` no viene de acá: la tabla `marcas` tiene sólo `id_marca` y
 * `nombre`, así que se deriva del id en el frontend.
 */
export function useMarcas(filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);

  return useQuery({
    queryKey: ['fn_marcas', claveDeFiltros(filtros)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_marcas', rpc);
      if (error) throw error;
      return (data ?? []) as FilaMarca[];
    },
    staleTime: 60_000,
  });
}

/**
 * Evolución mensual de una marca.
 *
 * El prototipo tenía `marcaVentasMensuales` con series de 3 marcas
 * hardcodeadas. Con esto, las 8 tienen.
 */
export function useMarcaSerie(marcaId: number | null, filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);

  return useQuery({
    queryKey: ['fn_marca_serie', marcaId, claveDeFiltros(filtros)],
    queryFn: async () => {
      if (marcaId === null) return [] as FilaMarcaSerie[];
      const { data, error } = await supabase.rpc('fn_marca_serie', {
        ...rpc,
        p_marca: marcaId,
      });
      if (error) throw error;
      return (data ?? []) as FilaMarcaSerie[];
    },
    enabled: marcaId !== null,
    staleTime: 60_000,
  });
}

/**
 * Ficha de una marca: productos y clientes, en un solo conjunto de filas.
 *
 * Vienen juntos y separados por `tipo`. Es más simple que dos funciones cuando
 * la ficha los muestra en la misma pantalla.
 */
export function useMarcaDetalle(marcaId: number | null, filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);

  return useQuery({
    queryKey: ['fn_marca_detalle', marcaId, claveDeFiltros(filtros)],
    queryFn: async () => {
      if (marcaId === null) {
        return { productos: [] as FilaMarcaDetalle[], clientes: [] as FilaMarcaDetalle[] };
      }
      const { data, error } = await supabase.rpc('fn_marca_detalle', {
        ...rpc,
        p_marca: marcaId,
      });
      if (error) throw error;
      const filas = (data ?? []) as FilaMarcaDetalle[];
      return {
        productos: filas.filter((f) => f.tipo === 'producto'),
        clientes: filas.filter((f) => f.tipo === 'cliente'),
      };
    },
    enabled: marcaId !== null,
    staleTime: 60_000,
  });
}