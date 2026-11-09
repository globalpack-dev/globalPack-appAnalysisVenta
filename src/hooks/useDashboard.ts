import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { esTimeoutDeBase, mensajeDeError } from '../lib/errores';
import { claveDeFiltros, filtrosParaRpc } from './useFiltros';
import type {
  FilaEncargado,
  FilaLocalidad,
  FilaMarca,
  FilaTopCliente,
  FilaUnidadNegocio,
  FilaVentaMensual,
  Filtros,
  Kpis,
  Variaciones,
} from '../types/database.types';

/**
 * Datos del Dashboard.
 *
 * UNA sola llamada a `fn_dashboard_todo`, que devuelve las ocho agregaciones
 * en un jsonb. Antes eran ocho llamadas a ocho funciones distintas, y con los
 * 8.705 registros reales el Dashboard tardaba 16s:
 *
 *     secuencial   16.415 ms   0 errores
 *     8 en paralelo  9.395 ms   7 errores  <- statement timeout
 *
 * El timeout no era lentitud sino contención de CPU del plan gratuito. Y el
 * costo de ~2s por llamada resultó ser FIJO: depende de materializar
 * `v_ventas_detalle` (8.705 filas x 33 columnas x 12 JOINs), no de cuantas
 * agregaciones se hagan encima.
 *
 *     fn_dashboard_todo (las 8)   2.215 ms
 *     fn_dashboard_kpis  (una)    2.350 ms
 *
 * O sea: 8 llamadas x 2s = 16s, contra 1 llamada = 2,2s.
 *
 * React Query v5 SACO la opcion `concurrency` (en v4 era `maxQueries`), asi
 * que la concurrencia no se puede limitar desde el hook. Por eso la solucion
 * fue reducir el numero de llamadas a una.
 */

const LIMITE_RANKING = 8;

/**
 * El jsonb de `fn_dashboard_todo`, con las claves de la función.
 *
 * Distinto de lo que devuelve el hook: éste renombra a camelCase, que es lo que
 * consume la página.
 */
type JsonbDashboard = {
  kpis: Kpis
  variaciones: Variaciones | null
  serie: FilaVentaMensual[]
  top_clientes: FilaTopCliente[]
  por_encargado: FilaEncargado[]
  por_localidad: FilaLocalidad[]
  por_unidad: FilaUnidadNegocio[]
  por_marca: FilaMarca[]
}


export function useDashboard(filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);

  const q = useQuery({
    // Una sola clave: cambiar un filtro invalida todo junto.
    queryKey: ['fn_dashboard_todo', claveDeFiltros(filtros)],
    // Al cambiar un filtro, la consulta nueva tarda varios segundos. Sin esto
    // `q.data` queda en `undefined`, el hook devuelve los KPI en cero y el
    // Dashboard parece vaciarse. Con `placeholderData` se siguen mostrando los
    // datos anteriores hasta que llega la respuesta.
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_dashboard_todo', {
        ...rpc,
        p_limite: LIMITE_RANKING,
      });
      if (error) throw error;

      // Devuelve un objeto jsonb, no una fila. Antes venía como array de una
      // fila: se unnestea porque PostgREST lo devuelve crudo.
      const crudo = data as unknown;
      const base = (Array.isArray(crudo) ? crudo[0] : crudo) as Partial<JsonbDashboard> | null;
      if (!base) throw new Error('fn_dashboard_todo devolvió vacío');

      const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
      return {
        kpis: (base.kpis ?? vacios) as Kpis,
        variaciones: (base.variaciones ?? null) as Variaciones | null,
        serie: lista<FilaVentaMensual>(base.serie),
        topClientes: lista<FilaTopCliente>(base.top_clientes),
        porEncargado: lista<FilaEncargado>(base.por_encargado),
        porLocalidad: lista<FilaLocalidad>(base.por_localidad),
        porUnidad: lista<FilaUnidadNegocio>(base.por_unidad),
        porMarca: lista<FilaMarca>(base.por_marca),
      } satisfies Omit<JsonbDashboard, 'top_clientes' | 'por_encargado' | 'por_localidad' | 'por_unidad' | 'por_marca'> & {
        topClientes: FilaTopCliente[]
        porEncargado: FilaEncargado[]
        porLocalidad: FilaLocalidad[]
        porUnidad: FilaUnidadNegocio[]
        porMarca: FilaMarca[]
      };
    },
    // La consulta es pesada (materializa v_ventas_detalle): un timeout se
    // reintenta con espera; un error de verdad no se reintenta, porque reintentar
    // sólo suma espera. Ver `lib/errores.ts`.
    retry: (intentos, error) => esTimeoutDeBase(error) && intentos < 2,
    retryDelay: (intento) => 4_000 * 2 ** intento,
    staleTime: 60_000,
  });

  return {
    kpis: q.data?.kpis ?? vacios,
    serie: q.data?.serie ?? [],
    topClientes: q.data?.topClientes ?? [],
    porEncargado: q.data?.porEncargado ?? [],
    porLocalidad: q.data?.porLocalidad ?? [],
    porUnidad: q.data?.porUnidad ?? [],
    porMarca: q.data?.porMarca ?? [],
    /**
     * `null` mientras carga, no un objeto de ceros: un 0% de relleno se vería
     * como "se mantuvo" cuando todavía no se sabe nada.
     */
    variaciones: q.data?.variaciones ?? null,

    isPending: q.isPending,
    isError: q.isError,
    error: q.isError ? new Error(mensajeDeError(q.error)) : null,
    kpisListos: q.isSuccess,
  };
}

/**
 * KPIs en cero mientras carga.
 *
 * Se devuelve en vez de `null` para que la página pueda pintar `$0` y el layout
 * no se desarme. El skeleton se decide por `isPending`.
 */
const vacios: Kpis = {
  total_neto: 0,
  total_bruto: 0,
  total_final: 0,
  total_bultos: 0,
  total_hl: 0,
  operaciones: 0,
  clientes_activos: 0,
  productos_vendidos: 0,
};