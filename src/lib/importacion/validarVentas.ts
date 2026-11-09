/**
 * Validación de «Base ventas.xlsx»: funciones puras, sin Supabase.
 *
 * Vive separado de `ventas.ts` por dos razones: la vista previa corre antes de
 * tocar la base y esta parte se puede probar con los Excel reales desde Node
 * (`tsx`), sin sesión ni RLS de por medio.
 */

import { configDe } from './config';
import type { HojaCruda } from './leerExcel';

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const COLUMNAS = configDe('ventas').obligatorias;

export type FilaDescartada = {
  /** Número de fila del Excel (1-based), para ubicarla a ojo. */
  fila: number;
  motivo: string;
};

export type PeriodoDetectado = {
  anio: number;
  mes: number;
  /** Etiqueta legible: "Octubre 2026". */
  etiqueta: string;
  filas: number;
};

export type PlanVentas = {
  tipo: 'ventas';
  archivo: string;
  hoja: string;
  totalFilas: number;
  filasValidas: number;
  descartadas: FilaDescartada[];
  periodos: PeriodoDetectado[];
  advertencias: string[];
  columnasFaltantes: string[];
  /**
   * Marcas del archivo que no existen en la tabla `marcas`.
   *
   * Se crean solas al cargar (get-or-create), pero conviene avisarlas: una marca
   * nueva no entra a la matriz de alcohol de cartera, que son las 9 columnas
   * fijas del archivo de cartera.
   */
  marcasNuevas: string[];
  /** false = hay columnas faltantes y no se puede cargar. */
  valido: boolean;
};

const s = (fila: unknown[], i: number): string => String(fila[i] ?? '').trim();

export function parsePeriodo(v: unknown): { anio: number; mes: number } | null {
  const m = /^(\d{4})\/(\d{1,2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? { anio, mes } : null;
}

/**
 * "SIN SUPERVISOR" y "Sin Supervisor Asignado" son el mismo concepto escrito de
 * dos formas. Se unifican para no partir el análisis por supervisor.
 */
export function normalizarSupervisor(v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t) return 'SIN SUPERVISOR';
  return t.toLowerCase().includes('sin supervisor') ? 'SIN SUPERVISOR' : t;
}

export type Indices = ReturnType<typeof indicesDe>;

export function indicesDe(encabezado: string[]) {
  const i = (nombre: string) => encabezado.indexOf(nombre);
  return {
    periodo: i('Año/Mes'),
    cliente: i('Cliente'),
    codCliente: i('Código Cliente'),
    sucursal: i('Sucursal'),
    sector: i('Sector de Venta'),
    sectorSup: i('Sector de Supervisión'),
    codSector: i('Código Sector de Venta'),
    codProducto: i('Código Producto'),
    producto: i('Producto'),
    marca: i('Marca'),
    calibre: i('Calibre'),
    division: i('División'),
    familia: i('Familia'),
    unidad: i('Unidad de Negocio'),
    localidad: i('Localidad'),
    canalAjustado: i('Canal Ajustado'),
    segmento: i('Segmento Mkt.'),
    canalMkt: i('Canal Mkt.'),
    subcanal: i('Subcanal Mkt.'),
    fantasia: i('Nombre Fantasia Cliente'),
    neto: i('Importe Neto'),
    bruto: i('Importe Bruto'),
    final: i('Importe Final'),
    bultos: i('Cantidad Total en Bultos'),
    hl: i('Cantidad Total en HL'),
  };
}

/**
 * Una fila sirve si tiene período válido y los tres códigos que resuelven FKs.
 *
 * A diferencia del script —que avisaba y después abortaba con "huerfanas"— acá
 * se descarta antes de escribir y se muestra en la vista previa.
 */
export function motivoDescarte(fila: unknown[], I: Indices): string | null {
  const periodo = fila[I.periodo];
  if (!parsePeriodo(periodo)) {
    const crudo = String(periodo ?? '').trim();
    if (typeof periodo === 'number') {
      return `período «${crudo}»: vino como fecha de Excel; se espera texto AAAA/MM`;
    }
    return `período «${crudo}»: se espera AAAA/MM`;
  }
  if (!s(fila, I.codCliente)) return 'sin «Código Cliente»';
  if (!s(fila, I.codProducto)) return 'sin «Código Producto»';
  if (!s(fila, I.codSector)) return 'sin «Código Sector de Venta»';
  return null;
}

/** Primer representante de cada clave; se usa para armar dimensiones. */
export function primeros(
  filas: unknown[][],
  clave: (fila: unknown[]) => string,
): Map<string, unknown[]> {
  const mapa = new Map<string, unknown[]>();
  for (const fila of filas) {
    const k = clave(fila);
    if (!mapa.has(k)) mapa.set(k, fila);
  }
  return mapa;
}

export function claveClasificacion(fila: unknown[], I: Indices): string {
  return [
    s(fila, I.canalAjustado),
    s(fila, I.segmento),
    s(fila, I.canalMkt),
    s(fila, I.subcanal),
  ].join('|');
}

export function validarVentas(
  archivo: File,
  hoja: HojaCruda,
  marcasExistentes: string[] = [],
): PlanVentas {
  const faltantes = COLUMNAS.filter((c) => !hoja.encabezado.includes(c));
  const base: PlanVentas = {
    tipo: 'ventas',
    archivo: archivo.name,
    hoja: hoja.nombre,
    totalFilas: hoja.filas.length,
    filasValidas: 0,
    descartadas: [],
    periodos: [],
    advertencias: [],
    columnasFaltantes: faltantes,
    marcasNuevas: [],
    valido: faltantes.length === 0,
  };

  if (faltantes.length) {
    base.advertencias.push(
      `Faltan ${faltantes.length} columna(s) obligatoria(s). El archivo no se puede cargar hasta corregirlo.`,
    );
    return base;
  }

  const I = indicesDe(hoja.encabezado);
  const periodos = new Map<string, PeriodoDetectado>();
  const descartadas: FilaDescartada[] = [];
  const marcasArchivo = new Map<string, string>();
  let sinMarca = 0;
  let sinFamilia = 0;
  let sinDivision = 0;

  hoja.filas.forEach((fila, posicion) => {
    const numeroFila = hoja.numerosFila[posicion];
    const motivo = motivoDescarte(fila, I);
    if (motivo) {
      descartadas.push({ fila: numeroFila, motivo });
      return;
    }

    const marca = s(fila, I.marca);
    if (!marca) sinMarca++;
    else if (!marcasArchivo.has(marca.toUpperCase())) marcasArchivo.set(marca.toUpperCase(), marca);
    if (!s(fila, I.familia)) sinFamilia++;
    if (!s(fila, I.division)) sinDivision++;

    const p = parsePeriodo(fila[I.periodo])!;
    const k = `${p.anio}/${p.mes}`;
    const actual = periodos.get(k);
    if (actual) actual.filas++;
    else {
      periodos.set(k, {
        anio: p.anio,
        mes: p.mes,
        etiqueta: `${MESES[p.mes - 1]} ${p.anio}`,
        filas: 1,
      });
    }
  });

  base.filasValidas = hoja.filas.length - descartadas.length;
  base.descartadas = descartadas;
  base.periodos = [...periodos.values()].sort((a, b) =>
    a.anio === b.anio ? a.mes - b.mes : a.anio - b.anio,
  );

  if (sinMarca) base.advertencias.push(`${sinMarca} fila(s) sin «Marca»: se cargan igual.`);
  if (sinFamilia) base.advertencias.push(`${sinFamilia} fila(s) sin «Familia»: se cargan igual.`);
  if (sinDivision) base.advertencias.push(`${sinDivision} fila(s) sin «División»: se cargan igual.`);

  // ── Marcas que la base todavía no conoce ─────────────────────────────────
  if (marcasExistentes.length) {
    const conocidas = new Set(marcasExistentes.map((m) => m.trim().toUpperCase()));
    base.marcasNuevas = [...marcasArchivo]
      .filter(([clave]) => !conocidas.has(clave))
      .map(([, nombre]) => nombre)
      .sort((a, b) => a.localeCompare(b, 'es'));

    if (base.marcasNuevas.length) {
      base.advertencias.push(
        `El archivo trae ${base.marcasNuevas.length} marca(s) que no están en la base: ` +
          `${base.marcasNuevas.join(', ')}. Se crean solas al cargar, pero no entran a la ` +
          'matriz de alcohol de cartera (son las 9 columnas del archivo de cartera).',
      );
    }
  }

  if (base.periodos.length > 1) {
    base.advertencias.push(
      `El archivo trae ${base.periodos.length} períodos. Se reemplazan todos los que aparecen.`,
    );
  }

  if (!base.filasValidas) {
    base.valido = false;
    base.advertencias.push('No queda ninguna fila válida para cargar.');
  }

  return base;
}
