import { useQueries, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { esTimeoutDeBase, mensajeDeError } from '../lib/errores';
import { claveDeFiltros, filtrosParaRpc } from './useFiltros';
import type {
  FilaEncargado,
  FilaMarca,
  FilaTopCliente,
  FilaUnidadNegocio,
  FilaVentaMensual,
  Filtros,
  Kpis,
  Variaciones,
} from '../types/database.types';

/**
 * Datos de un tipo de reporte.
 *
 * Cada tipo de reporte necesita un conjunto distinto de datos, así que la
 * función recibe el tipo y pide sólo eso. En el prototipo los 6 tipos de
 * reporte renderizaban exactamente lo mismo y sólo cambiaba el título: los KPIs,
 * el top de marcas y la tabla de clientes se pintaban en "Resumen de ventas" y
 * también en "Marketing y canales". Acá cada tipo trae lo suyo.
 *
 * Las consultas del tipo elegido se disparan siempre; las de los otros tipos no
 * se piden. Es lo contrario de `useDashboard`, que sí necesita todo junto para
 * pintar la pantalla entera.
 */

const LIMITE = 10;

/**
 * Opciones comunes de las consultas de Reportes.
 *
 * Estas RPC agregan las 25.000 ventas y quedan cerca del `statement_timeout` de
 * Supabase (8 s en el plan gratuito), sobre todo si se disparan varias en
 * paralelo. Un timeout (57014) es contención momentánea: se reintenta con
 * espera creciente. Cualquier otro error se muestra en el acto, porque
 * reintentarlo sólo suma espera.
 */
const CONSULTA = {
  retry: (intentos: number, error: unknown) => esTimeoutDeBase(error) && intentos < 2,
  retryDelay: (intento: number) => Math.min(3_000 * 2 ** intento, 15_000),
} as const;

/** Primer error de un conjunto de queries, con el texto ya traducido. */
function errorDe(errores: ReadonlyArray<unknown>): Error | null {
  const primero = errores.find((e) => !!e);
  return primero ? new Error(mensajeDeError(primero)) : null;
}

export type TipoReporte =
  | 'ventas'
  | 'cliente'
  | 'marcas'
  | 'promotores'
  | 'marketing'
  | 'objetivos';

/** Datos del reporte de ventas. */
export type ReporteVentas = {
  kpis: Kpis | null
  variaciones: Variaciones | null
  serie: FilaVentaMensual[]
  /**
   * Top de clientes del período. Viene en el MISMO jsonb de `fn_dashboard_todo`
   * que ya se pide para los KPIs: no agrega ni una llamada a la base.
   *
   * Se usa como reemplazo del gráfico de evolución cuando sólo hay un período
   * cargado (ver `ReporteVentas` en `Reports.tsx`).
   */
  topClientes: FilaTopCliente[]
  porUnidad: FilaUnidadNegocio[]
  isPending: boolean
  error: Error | null
};

/** Datos del reporte por cliente. */
export type ReporteCliente = {
  clientes: ClienteResumen[]
  cliente: ClienteResumen | null
  historial: HistorialFila[]
  marcas: FilaMarca[]
  isPending: boolean
  error: Error | null
};

/** Datos del reporte de marcas. */
export type ReporteMarcas = {
  marcas: FilaMarca[]
  unidades: FilaUnidadNegocio[]
};

/** Datos del reporte de promotores. */
export type ReportePromotores = {
  encargados: FilaEncargado[]
  porUnidad: FilaUnidadNegocio[]
};

/** Datos del reporte de marketing. */
export type ReporteMarketing = {
  filas: MarketingFila[]
};

export type ClienteResumen = {
  id_cliente: number
  nombre: string
  razon_social: string
  ventas_total: number
  ultima_venta: string | null
  activo: boolean
};

export type HistorialFila = {
  anio: number
  mes: number
  nombre_mes: string
  ventas: number
  neto: number
};

export type MarketingFila = {
  canal_ajustado: string | null
  segmento_mkt: string | null
  canal_mkt: string | null
  subcanal_mkt: string | null
  ventas: number
  clientes: number
};

export function useReporteVentas(filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);
  const clave = claveDeFiltros(filtros);

  /**
   * Una sola llamada, no cuatro.
   *
   * Antes este reporte pedía `fn_dashboard_kpis`, `fn_dashboard_variaciones`,
   * `fn_ventas_mensuales` y `fn_ventas_por_unidad_negocio` en paralelo. Con
   * 25.004 ventas cada una tarda 3,3–4,2 s, y juntas saturan la CPU del plan
   * gratuito: las cuatro terminaban en `statement timeout` (8,6 s).
   *
   * `fn_dashboard_todo` ya devuelve exactamente esos cuatro conjuntos y barre
   * `fn_ventas_filtradas` una sola vez, así que el reporte usa la misma
   * estrategia que el Dashboard (`ver 21_fn_dashboard_todo.sql`).
   */
  const q = useQuery({
    // Clave propia: `useDashboard` cachea el mismo jsonb pero lo transforma a
    // otro objeto. Compartir clave haría que una página leyera el formato de la
    // otra.
    queryKey: ['fn_dashboard_todo', 'reporte', clave],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_dashboard_todo', {
        ...rpc,
        p_limite: LIMITE,
      });
      if (error) throw error;

      const base = (data ?? {}) as Partial<{
        kpis: Kpis
        variaciones: Variaciones | null
        serie: FilaVentaMensual[]
        top_clientes: FilaTopCliente[]
        por_unidad: FilaUnidadNegocio[]
      }>;
      const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

      return {
        kpis: base.kpis ?? null,
        variaciones: base.variaciones ?? null,
        serie: lista<FilaVentaMensual>(base.serie),
        topClientes: lista<FilaTopCliente>(base.top_clientes),
        porUnidad: lista<FilaUnidadNegocio>(base.por_unidad),
      };
    },
    ...CONSULTA,
  });

  return {
    kpis: q.data?.kpis ?? null,
    variaciones: q.data?.variaciones ?? null,
    serie: q.data?.serie ?? [],
    topClientes: q.data?.topClientes ?? [],
    porUnidad: q.data?.porUnidad ?? [],
    isPending: q.isPending,
    error: errorDe([q.error]),
  };
}

export function useReporteCliente(filtros: Filtros, clienteId: number | null) {
  const rpc = filtrosParaRpc(filtros);
  const clave = claveDeFiltros(filtros);
  const r = useQueries({
    queries: [
      {
        ...CONSULTA,
        queryKey: ['fn_clientes', clave],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_clientes', rpc);
          if (error) throw error;
          // jsonb: un solo valor con el array adentro (ver 20_fn_clientes_jsonb.sql)
          const lista = data as unknown as Array<{
            id_cliente: number
            razon_social: string
            nombre_fantasia: string | null
            ventas_total: number
            ultima_venta: string | null
            activo: boolean
          }> | null;
          return Array.isArray(lista) ? lista : [];
        },
      },
      {
        ...CONSULTA,
        queryKey: ['fn_cliente_detalle', clienteId, clave],
        queryFn: async () => {
          if (clienteId === null) return [] as HistorialFila[];
          const { data, error } = await supabase.rpc('fn_cliente_detalle', {
            ...rpc,
            p_cliente: clienteId,
          });
          if (error) throw error;
          return data as HistorialFila[];
        },
        enabled: clienteId !== null,
      },
      {
        ...CONSULTA,
        queryKey: ['fn_marcas', clave, clienteId],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_marcas', {
            ...rpc,
            p_cliente: clienteId,
          });
          if (error) throw error;
          return data as FilaMarca[];
        },
        enabled: clienteId !== null,
      },
    ],
  });

  const lista = r[0].data ?? [];
  const elegido = lista.find((c) => c.id_cliente === clienteId) ?? null;
  const errores = r.map((x) => x.error).filter((e): e is Error => !!e);

  return {
    clientes: lista,
    cliente: elegido
      ? ({
          id_cliente: elegido.id_cliente,
          nombre: elegido.nombre_fantasia?.trim() || elegido.razon_social,
          razon_social: elegido.razon_social,
          ventas_total: Number(elegido.ventas_total),
          ultima_venta: elegido.ultima_venta,
          activo: elegido.activo,
        } satisfies ClienteResumen)
      : null,
    historial: r[1].data ?? [],
    marcas: r[2].data ?? [],
    isPending: r[0].isPending,
    error: errorDe(errores),
  };
}

export function useReporteMarcas(filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);
  const clave = claveDeFiltros(filtros);
  const r = useQueries({
    queries: [
      {
        ...CONSULTA,
        queryKey: ['fn_marcas', clave],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_marcas', rpc);
          if (error) throw error;
          return data as FilaMarca[];
        },
      },
      {
        ...CONSULTA,
        queryKey: ['fn_ventas_por_unidad_negocio', clave],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_ventas_por_unidad_negocio', rpc);
          if (error) throw error;
          return data as FilaUnidadNegocio[];
        },
      },
    ],
  });
  const errores = r.map((x) => x.error).filter((e): e is Error => !!e);
  return {
    marcas: r[0].data ?? [],
    unidades: r[1].data ?? [],
    isPending: r.some((x) => x.isPending),
    error: errorDe(errores),
  };
}

export function useReportePromotores(filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);
  const clave = claveDeFiltros(filtros);
  const r = useQueries({
    queries: [
      {
        ...CONSULTA,
        queryKey: ['fn_ventas_por_encargado', clave, LIMITE],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_ventas_por_encargado', {
            ...rpc,
            p_limite: LIMITE,
          });
          if (error) throw error;
          return data as unknown as FilaEncargado[];
        },
      },
      {
        ...CONSULTA,
        queryKey: ['fn_ventas_por_unidad_negocio', clave],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_ventas_por_unidad_negocio', rpc);
          if (error) throw error;
          return data as FilaUnidadNegocio[];
        },
      },
    ],
  });
  const errores = r.map((x) => x.error).filter((e): e is Error => !!e);
  return {
    encargados: r[0].data ?? [],
    porUnidad: r[1].data ?? [],
    isPending: r.some((x) => x.isPending),
    error: errorDe(errores),
  };
}

export function useReporteMarketing(filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);
  const clave = claveDeFiltros(filtros);
  const r = useQueries({
    queries: [
      {
        ...CONSULTA,
        queryKey: ['fn_marketing_por', clave],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_marketing_por', rpc);
          if (error) throw error;
          return data as MarketingFila[];
        },
      },
    ],
  });
  return {
    filas: r[0].data ?? [],
    isPending: r[0].isPending,
    error: errorDe([r[0].error]),
  };
}