import type { FilaActividad } from '../hooks/useCartera';

/**
 * Días de visita del archivo de promotores.
 *
 * El Excel usa exactamente estas tres letras y combina hasta dos por cliente
 * ('LUN JUE', 'MAR VIE', 'MIE SAB'). No hay domingo: no se reparte.
 */
export const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'] as const;

export type Dia = (typeof DIAS)[number];

export const NOMBRE_DIA: Record<string, string> = {
  LUN: 'Lunes',
  MAR: 'Martes',
  MIE: 'Miércoles',
  JUE: 'Jueves',
  VIE: 'Viernes',
  SAB: 'Sábado',
};

/**
 * El día de visita de hoy, o `null` si es domingo (no hay recorrido).
 *
 * `Date.getDay()` devuelve 0 para domingo, así que el array va desplazado.
 */
export function diaDeHoy(): Dia | null {
  const indice = new Date().getDay();
  return ([null, 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'] as const)[indice] ?? null;
}

/**
 * El día que le toca al resumen.
 *
 * Si hoy es domingo no hay visitas: se muestra el lunes, que es el próximo
 * recorrido. `esHoy` distingue "recorrido de hoy" de "próximo recorrido" para
 * que el texto no mienta.
 */
export function diaDeResumen(): { dia: Dia; esHoy: boolean } {
  const hoy = diaDeHoy();
  return hoy ? { dia: hoy, esHoy: true } : { dia: 'LUN', esHoy: false };
}

/**
 * Cuántos días de la semana visita el cliente.
 *
 * El archivo reparte en frecuencia 1 (un día) y frecuencia 2 (dos días, ej.
 * 'LUN JUE'). `fn_actividad_promotor` ya devuelve el campo como array, así que
 * la frecuencia es simplemente su largo.
 */
export function frecuenciaDe(f: Pick<FilaActividad, 'visitas'>): number {
  return f.visitas.length;
}

/**
 * Trozo de una lista para una hoja (1-based), sin salirse de rango.
 *
 * La usa el "Resumen del día" para repartir el recorrido en hojas de 12 sin
 * recortar clientes. Si la hoja quedó fuera de rango (por ejemplo, al cambiar
 * un filtro), devuelve el último trozo que exista.
 */
export function paginar<T>(filas: T[], hoja: number, tamano = 12): T[] {
  const total = Math.max(1, Math.ceil(filas.length / tamano));
  const actual = Math.min(Math.max(1, hoja), total);
  const inicio = (actual - 1) * tamano;
  return filas.slice(inicio, inicio + tamano);
}

/** Días de visita en corto: `['LUN','JUE']` → `'Lun · Jue'`. */
export function diasDeVisitaTexto(f: Pick<FilaActividad, 'visitas'>): string {
  return f.visitas.map((d) => (NOMBRE_DIA[d] ?? d).slice(0, 3)).join(' · ');
}

/** Nombres legibles de las tareas pendientes de un cliente. */
export function tareasDe(
  f: Pick<FilaActividad, 'tarea_redbull' | 'tarea_laton' | 'tarea_cvza'>,
): string[] {
  const t: string[] = [];
  if (f.tarea_redbull) t.push('RED BULL');
  if (f.tarea_laton) t.push('LATÓN QUILMES');
  if (f.tarea_cvza) t.push('CVZA');
  return t;
}

// ─── Filtros de actividad ────────────────────────────────────────────────────
//
// Los usan las dos pantallas que trabajan con la actividad del promotor:
// "Ver actividad" (tabla completa) y "Resumen del día" (tarjeta + WhatsApp).
// Viven acá para que un cambio de criterio no deje las dos vistas contando
// cosas distintas.

export type EstadoActividad =
  | 'todos'
  | 'oportunidad'
  | 'compro'
  | 'sin_marcas'
  | 'baja'
  | 'consumo';

export type TareaActividad = 'todas' | 'con_tarea' | 'redbull' | 'laton' | 'cvza';

export const ESTADOS_ACTIVIDAD: Array<{ id: EstadoActividad; nombre: string }> = [
  { id: 'todos', nombre: 'Todos los estados' },
  { id: 'oportunidad', nombre: 'Sin compra de alcohol' },
  { id: 'compro', nombre: 'Ya compró alcohol' },
  { id: 'sin_marcas', nombre: 'No compró ninguna marca' },
  { id: 'baja', nombre: 'Bajas' },
  { id: 'consumo', nombre: 'Consumo personal' },
];

/**
 * El estado visible de un cliente, en el orden en que se muestra:
 * una baja manda sobre todo; el consumo propio, sobre la oportunidad (no se
 * le ofrece nada); la oportunidad, sobre la compra.
 */
export type EstadoCliente = 'baja' | 'consumo' | 'oportunidad' | 'compro' | 'sin_marcas';

export function estadoDe(
  f: Pick<FilaActividad, 'es_baja' | 'consumo_personal' | 'oportunidad' | 'compro_algo'>,
): EstadoCliente {
  if (f.es_baja) return 'baja';
  if (f.consumo_personal) return 'consumo';
  if (f.oportunidad) return 'oportunidad';
  if (f.compro_algo) return 'compro';
  return 'sin_marcas';
}

export const TAREAS_ACTIVIDAD: Array<{ id: TareaActividad; nombre: string }> = [
  { id: 'todas', nombre: 'Todas las tareas' },
  { id: 'con_tarea', nombre: 'Con tarea pendiente' },
  { id: 'redbull', nombre: 'RED BULL' },
  { id: 'laton', nombre: 'LATÓN QUILMES' },
  { id: 'cvza', nombre: 'CVZA' },
];

/** Filtra la actividad por día, estado de compra, tarea y texto libre. */
export function filtrarActividad(
  filas: FilaActividad[],
  {
    dia,
    estado = 'todos',
    tarea = 'todas',
    busqueda = '',
  }: {
    dia?: string;
    estado?: EstadoActividad;
    tarea?: TareaActividad;
    busqueda?: string;
  },
): FilaActividad[] {
  const q = busqueda.trim().toLowerCase();
  return filas.filter((f) => {
    if (dia && !f.visitas.includes(dia)) return false;

    // Una baja o un consumo propio nunca es oportunidad, aunque el flag venga
    // raro: no hay nada que ofrecerle a esos clientes.
    if (estado === 'oportunidad' && (!f.oportunidad || f.es_baja || f.consumo_personal)) {
      return false;
    }
    if (estado === 'compro' && !f.compro_algo) return false;
    if (estado === 'sin_marcas' && f.compras.length > 0) return false;
    if (estado === 'baja' && !f.es_baja) return false;
    if (estado === 'consumo' && !f.consumo_personal) return false;

    if (tarea === 'con_tarea' && tareasDe(f).length === 0) return false;
    if (tarea === 'redbull' && !f.tarea_redbull) return false;
    if (tarea === 'laton' && !f.tarea_laton) return false;
    if (tarea === 'cvza' && !f.tarea_cvza) return false;

    if (q) {
      const texto = `${f.codigo_cliente} ${f.razon_social} ${f.nombre_fantasia ?? ''} ${f.localidad_nombre ?? ''}`;
      if (!texto.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/** Fecha larga en español, para el encabezado del resumen. */
export function fechaLarga(fecha = new Date()): string {
  const texto = fecha.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
