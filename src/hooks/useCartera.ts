import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Pantalla de Supervisores.
 *
 * La navegación es por supervisor, no por encargado: el archivo del cliente
 * viene organizado por SDV (Supervisor de Venta) y el trabajo comercial es del
 * supervisor — "NACUL SOL, estos 475 clientes no compraron alcohol".
 *
 * `supervisores_cartera` es la fuente de verdad de esa relación. El Excel de
 * ventas dice otra cosa (está desactualizado): ahí los clientes de PERALTA
 * SOLANA aparecen colgados de encargados de NACUL SOL. Ver 23_supervisores_cartera.sql.
 *
 * ── Sobre el alcohol ────────────────────────────────────────────────────────
 *
 * `marcas_alcohol` tiene las 9 marcas del archivo del cliente, pero TRES no
 * son alcohol: RED BULL, H2Oh y PEPSI BLACK. Son bebidas.
 *
 * La columna `es_alcoholica` de esa tabla es la que decide. Antes no existía
 * y cada función repetía su propia versión de "compró alcohol", y no
 * coincidían entre sí. Ver 27_alcohol_ico.sql.
 */

/** Fila de `fn_supervisores_cartera`: un supervisor con su oportunidad. */
export type FilaCartera = {
  nombre: string
  clientes: number
  /** Clientes con el FLAG ALCOHOL = SI del archivo. */
  alcohol: number
  /** Clientes que compraron al menos una marca genuinamente alcohólica. */
  con_alcohol: number
  /** Clientes de alcohol que no compraron ninguna marca alcohólica. */
  oportunidad: number
  /** `NULL` en el grupo sin supervisor. La pantalla lo pasa como 0. */
  id_supervisor: number | null
  /**
   * El público de alcohol: el flag en SI **o** una compra de alcohol.
   *
   * Es la misma población que usa la matriz por marca, para que los dos
   * gráficos hablen de lo mismo. Se divide exacto en `con_alcohol` y
   * `oportunidad`.
   */
  publico_alcohol: number
  /** `con_alcohol / publico_alcohol`, en porcentaje. */
  penetracion: number
}

/** Cliente de `fn_cartera_clientes`. */
export type ClienteCartera = {
  codigo_cliente: string
  razon_social: string
  nombre_fantasia: string | null
  localidad_nombre: string | null
  /** El FLAG ALCOHOL del archivo. */
  es_alcohol: boolean
  /** Compró al menos una de las 6 marcas genuinamente alcohólicas. */
  compro_algo: boolean
  /** Cuántas de las 9 marcas del archivo compró (cualquiera). */
  compradas: number
  /** Cuántas de las 6 marcas genuinamente alcoholicás compró. */
  compradas_alcohol: number
  /** Marcas que SÍ compró, en orden alfabético. */
  compras: string[]
  /**
   * Marcas ALCOHÓLICAS que NO compró.
   *
   * Viene vacío para quien no toca alcohol: no tiene sentido ofrecerle
   * cerveza a un cliente que no compra.
   */
  faltantes: string[]
  /**
   * La definición de oportunidad, calculada en el servidor.
   *
   * `es_alcohol` (el flag) y no compró ninguna marca alcohólica.
   */
  oportunidad: boolean
}

/** Fila de `fn_cartera_marcas`. */
export type MarcaCartera = {
  id_marca: number
  marca_nombre: string
  /** False en RED BULL, H2Oh y PEPSI BLACK: son bebidas, no alcohol. */
  es_alcoholica: boolean
  /** Del público de alcohol, cuántos compraron la marca. */
  compraron: number
  /** El tamaño del público de alcohol: el denominador. */
  clientes_alcohol: number
  /** `compraron / clientes_alcohol`, en porcentaje. */
  penetracion: number
  /** Del público de alcohol, cuántos NO la compraron: la lista ofertable. */
  sin_comprar: number
}

/** Matriz de un cliente: `fn_cliente_compras`. */
export type ComprasCliente = {
  codigo_cliente: string
  razon_social: string
  nombre_fantasia: string | null
  es_alcohol: boolean
  /** Cuántas de las 6 marcas genuinamente alcoholicás compró. */
  compradas_alcohol: number
  /** Marcas que SÍ compró (cualquiera de las 9). */
  compras: string[]
  /** Marcas alcoholicás que NO compró. */
  faltantes: string[]
  oportunidad: boolean
  marcas: Array<{ marca_nombre: string; es_alcoholica: boolean; compro: boolean }>
}

/**
 * Lista de supervisores.
 *
 * Son 3 filas, así que no hay problema de truncado ni hace falta jsonb.
 */
export function useSupervisoresCartera() {
  return useQuery({
    queryKey: ['fn_supervisores_cartera'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_supervisores_cartera');
      if (error) throw error;
      return (data ?? []) as FilaCartera[];
    },
    staleTime: 60_000,
  });
}

/**
 * Matriz por marca de un supervisor.
 *
 * `supervisorId = null` significa "todos". El 0 se usa para el grupo sin
 * supervisor, que en la base es `id_supervisor = NULL` y no 0.
 */
export function useCarteraMarcas(supervisorId: number | null) {
  return useQuery({
    queryKey: ['fn_cartera_marcas', supervisorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_cartera_marcas', {
        p_supervisor: supervisorId,
      });
      if (error) throw error;
      return (data ?? []) as MarcaCartera[];
    },
    staleTime: 60_000,
  });
}

/**
 * Clientes de un supervisor.
 *
 * Devuelve jsonb: hasta 1.434 clientes, y PostgREST corta a 1.000 filas. Con
 * una sola fila nunca se trunca.
 */
export function useCarteraClientes(supervisorId: number | null) {
  return useQuery({
    queryKey: ['fn_cartera_clientes', supervisorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_cartera_clientes', {
        p_supervisor: supervisorId,
      });
      if (error) throw error;
      const lista = data as unknown as ClienteCartera[] | null;
      return Array.isArray(lista) ? lista : [];
    },
    staleTime: 60_000,
  });
}

/** Matriz de un cliente, para la ficha. */
export function useClienteCompras(codigoCliente: string | null) {
  return useQuery({
    queryKey: ['fn_cliente_compras', codigoCliente],
    queryFn: async () => {
      if (codigoCliente === null) return null;
      const { data, error } = await supabase.rpc('fn_cliente_compras', {
        p_cliente: codigoCliente,
      });
      if (error) throw error;
      return (data ?? null) as ComprasCliente | null;
    },
    enabled: codigoCliente !== null,
    staleTime: 60_000,
  });
}

/**
 * Fila de `fn_operativos`: la capa operativa de un cliente.
 *
 * Viene del archivo de promotores, no del de ventas: días de visita, tareas
 * pendientes y segmentación. Es lo que convierte la cartera en un plan de
 * trabajo ("el lunes visitá estos").
 */
export type FilaOperativo = {
  codigo_cliente: string
  /** El promotor (encargado de venta) según el archivo de promotores. */
  id_encargado_venta: number | null
  /** Nombre del supervisor del cliente, o 'Sin supervisor asignado'. */
  promotor: string
  /** Días de visita normalizados: ['LUN'], ['LUN', 'JUE'], ... */
  visitas: string[]
  /** Subcanal comercial del cliente. */
  subcanal: string | null
  /** 'A', 'B' o `null` cuando el archivo no lo marca. */
  tier: string | null
  tarea_redbull: boolean
  tarea_laton: boolean
  tarea_cvza: boolean
  /** Valor textual del FLAG ALCOHOL: SI, NO, CONSUMO_PERSONAL o BAJA. */
  flag_estado: string
  /** El cliente está dado de baja (FLAG ALCOHOL = BAJA). */
  es_baja: boolean
  /** Compra para consumo propio, no para reventa (FLAG = CONSUMO PERSONAL). */
  consumo_personal: boolean
}

/**
 * Datos operativos de los clientes.
 *
 * Los tres filtros son opcionales: por supervisor, por promotor (encargado) o
 * todos. El panel "Ver actividad" usa el de promotor.
 *
 * Devuelve jsonb en el servidor para no chocar con el límite de 1.000 filas de
 * PostgREST: un supervisor tiene hasta 1.610 clientes.
 */
export function useOperativos(
  supervisorId: number | null,
  encargadoId: number | null = null,
) {
  return useQuery({
    queryKey: ['fn_operativos', supervisorId, encargadoId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_operativos', {
        p_supervisor: supervisorId,
        p_encargado: encargadoId,
      });
      if (error) throw error;
      const lista = data as unknown as FilaOperativo[] | null;
      return Array.isArray(lista) ? lista : [];
    },
    staleTime: 60_000,
  });
}

/**
 * Fila de `fn_actividad_promotor`: un cliente del promotor con su plan de
 * visita y su estado de compra.
 *
 * Es la cartera + la capa operativa + las compras en una sola fila, para el
 * panel "Ver actividad". La definición de `oportunidad`, `compras` y
 * `faltantes` es la misma que devuelve `fn_cartera_clientes`.
 */
export type FilaActividad = {
  codigo_cliente: string
  razon_social: string
  nombre_fantasia: string | null
  localidad_nombre: string | null
  /** Días de visita: ['LUN'], ['LUN', 'JUE'], ['MAR', 'VIE'], ... */
  visitas: string[]
  subcanal: string | null
  tier: string | null
  tarea_redbull: boolean
  tarea_laton: boolean
  tarea_cvza: boolean
  /** El FLAG del archivo: "es cliente de alcohol". */
  es_alcohol: boolean
  /** Valor textual del FLAG ALCOHOL: SI, NO, CONSUMO_PERSONAL o BAJA. */
  flag_estado: string
  /** El cliente está dado de baja (FLAG ALCOHOL = BAJA). */
  es_baja: boolean
  /** Compra para consumo propio, no para reventa (FLAG = CONSUMO PERSONAL). */
  consumo_personal: boolean
  /** Compró al menos una de las 6 marcas alcohólicas. */
  compro_algo: boolean
  /** Cuántas de las 9 marcas del archivo compró (cualquiera). */
  compradas: number
  /** Cuántas de las 6 alcohólicas compró. */
  compradas_alcohol: number
  /** Nombres de las marcas que compró. */
  compras: string[]
  /** Marcas alcohólicas que le faltan (vacío si no es público de alcohol). */
  faltantes: string[]
  /** Cliente de alcohol que todavía no compró alcohol. */
  oportunidad: boolean
}

/**
 * Actividad de un promotor: sus clientes, qué compraron y qué les falta.
 *
 * Devuelve jsonb en el servidor porque el patrón jsonb es el de la cartera:
 * no depende del límite de 1.000 filas de PostgREST.
 */
export function useActividadPromotor(encargadoId: number | null) {
  return useQuery({
    queryKey: ['fn_actividad_promotor', encargadoId],
    queryFn: async () => {
      if (encargadoId === null) return [];
      const { data, error } = await supabase.rpc('fn_actividad_promotor', {
        p_encargado: encargadoId,
      });
      if (error) throw error;
      const lista = data as unknown as FilaActividad[] | null;
      return Array.isArray(lista) ? lista : [];
    },
    enabled: encargadoId !== null,
    staleTime: 60_000,
  });
}
