/**
 * Lectura de un Excel de Global Pack desde el navegador.
 *
 * Se usa `xlsx` (la misma librería que los scripts) con el mismo tratamiento:
 * `header: 1`, `raw: true` y `defval: null`. Eso conserva los valores tal como
 * están —los números como números— y no inventa claves de columna.
 *
 * La diferencia con los scripts es que acá el archivo lo elige el usuario y
 * puede estar mal: hoja cambiada, encabezados corridos, archivo corrupto. Por eso
 * cada problema se convierte en un mensaje claro y no en un `undefined`.
 *
 * ── Por qué la hoja y el encabezado se detectan solos ──────────────────────
 *
 * El cliente confirmó que «promotores» y «supervisores» son el mismo archivo en
 * distinto momento. Entre versiones cambian la hoja (`Hoja1` / `CLIENTES`), la
 * fila del encabezado o el nombre de una columna. En vez de romper con cada
 * export, `leerHojaAuto` busca la fila que contiene las columnas clave y elige
 * la hoja que las tiene. Si el archivo es otro, la validación lo dice con
 * precisión.
 */

import type { WorkBook } from 'xlsx';

export type HojaCruda = {
  /** Nombre real de la hoja de la que se leyeron los datos. */
  nombre: string;
  /** Encabezados ya recortados de espacios. */
  encabezado: string[];
  /** Filas de datos sin las vacías. */
  filas: unknown[][];
  /** Número de fila de Excel (1-based) de cada entrada de `filas`. */
  numerosFila: number[];
};

export type LecturaExcel = {
  hoja: HojaCruda;
  /** Problemas que no impiden continuar (hoja renombrada, filas de más…). */
  advertencias: string[];
};

/** Error con mensaje pensado para mostrarse tal cual en el modal. */
export class ErrorLectura extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorLectura';
  }
}

export type OpcionesLectura = {
  /** Hojas preferidas, en orden. Si no está, se usa la que tenga las columnas. */
  hojas: string[];
  /** Columnas que identifican la fila de encabezado. */
  claveColumnas: string[];
  /** Fila esperada del encabezado; se usa para desempatar y para avisar. */
  filaEncabezado: number;
};

function normalizar(v: unknown): string {
  return String(v ?? '').trim();
}

/**
 * `xlsx` pesa ~370 kB y sólo hace falta cuando alguien sube un archivo. Se
 * importa en ese momento para que no entre al bundle inicial.
 */
let moduloXlsx: Promise<typeof import('xlsx')> | null = null;
function cargarXlsx(): Promise<typeof import('xlsx')> {
  if (!moduloXlsx) moduloXlsx = import('xlsx');
  return moduloXlsx;
}

/** Filas crudas de una hoja, con todas las celdas tal como vienen. */
function filasDe(libro: WorkBook, nombre: string, XLSX: typeof import('xlsx')): unknown[][] {
  const hoja = libro.Sheets[nombre];
  if (!hoja) return [];
  return XLSX.utils.sheet_to_json(hoja, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];
}

const MAX_FILA_ENCABEZADO = 10;

type Candidato = {
  hoja: string;
  fila: number;
  /** Cuántas columnas clave aparecen en la fila. */
  aciertos: number;
  /** Celdas con contenido, para desempatar filas de totales. */
  celdas: number;
  /** 0 = hoja preferida. */
  preferencia: number;
};

/**
 * Elige la hoja y la fila de encabezado que mejor puntúan.
 *
 * Puntaje: todas las columnas clave primero, después la hoja preferida, después
 * la fila esperada / la cantidad de celdas. Nunca falla por no encontrar la
 * hoja: devuelve el mejor intento y la validación explica qué falta.
 */
function elegirCrudo(
  libro: WorkBook,
  crudos: Map<string, unknown[][]>,
  opciones: OpcionesLectura,
): { candidato: Candidato; encabezado: string[]; crudas: unknown[][] } {
  const claves = opciones.claveColumnas.map((c) => c.toLowerCase());
  const preferidas = opciones.hojas.map((h) => h.trim().toLowerCase());

  let mejor: Candidato | null = null;
  let mejorEncabezado: string[] = [];
  let mejorCrudas: unknown[][] = [];

  for (const nombre of libro.SheetNames) {
    const crudas = crudos.get(nombre) ?? [];
    const indicePreferida = preferidas.indexOf(nombre.trim().toLowerCase());
    const preferencia = indicePreferida >= 0 ? indicePreferida : preferidas.length + 1;

    for (let i = 0; i < Math.min(crudas.length, MAX_FILA_ENCABEZADO); i++) {
      const fila = crudas[i] ?? [];
      const celdas = fila.map(normalizar);
      const texto = celdas.filter(Boolean).map((c) => c.toLowerCase());

      // Cuenta claves presentes (por valor exacto de celda).
      const aciertos = claves.filter((clave) => texto.includes(clave)).length;
      const contenido = texto.length;
      if (contenido === 0) continue;

      const candidato: Candidato = {
        hoja: nombre,
        fila: i + 1,
        aciertos,
        celdas: contenido,
        preferencia,
      };

      if (esMejor(candidato, mejor, opciones.filaEncabezado)) {
        mejor = candidato;
        mejorEncabezado = celdas;
        mejorCrudas = crudas;
      }
    }
  }

  if (!mejor) {
    throw new ErrorLectura(
      'No se encontró ninguna fila con datos. Revisá que el archivo no esté vacío.',
    );
  }

  return { candidato: mejor, encabezado: mejorEncabezado, crudas: mejorCrudas };
}

function esMejor(candidato: Candidato, mejor: Candidato | null, filaEsperada: number): boolean {
  if (!mejor) return true;
  if (candidato.aciertos !== mejor.aciertos) return candidato.aciertos > mejor.aciertos;
  if (candidato.preferencia !== mejor.preferencia) return candidato.preferencia < mejor.preferencia;
  const distancia = Math.abs(candidato.fila - filaEsperada);
  const distanciaMejor = Math.abs(mejor.fila - filaEsperada);
  if (distancia !== distanciaMejor) return distancia < distanciaMejor;
  return candidato.celdas > mejor.celdas;
}

/**
 * Lee el Excel eligiendo sola la hoja y la fila de encabezado.
 *
 * Devuelve advertencias (no errores) cuando la hoja o la fila no son las
 * esperadas, para que la vista previa lo muestre.
 */
export async function leerHojaAuto(
  archivo: File,
  opciones: OpcionesLectura,
): Promise<LecturaExcel> {
  let libro: WorkBook;
  let XLSX: typeof import('xlsx');

  try {
    XLSX = await cargarXlsx();
    const buffer = await archivo.arrayBuffer();
    libro = XLSX.read(buffer, { type: 'array' });
  } catch {
    throw new ErrorLectura(
      'No se pudo leer el archivo. Verificá que sea un Excel .xlsx válido y que no esté dañado.',
    );
  }

  if (!libro.SheetNames.length) {
    throw new ErrorLectura('El archivo no tiene ninguna hoja.');
  }

  const crudos = new Map<string, unknown[][]>();
  for (const nombre of libro.SheetNames) crudos.set(nombre, filasDe(libro, nombre, XLSX));

  const { candidato, encabezado, crudas } = elegirCrudo(libro, crudos, opciones);

  if (!crudas.length) {
    throw new ErrorLectura('El archivo no tiene filas de datos.');
  }

  const advertencias: string[] = [];
  const preferidas = opciones.hojas.map((h) => h.trim().toLowerCase());
  if (!preferidas.includes(candidato.hoja.trim().toLowerCase())) {
    advertencias.push(
      `La hoja con los datos se llama «${candidato.hoja}» (se esperaba ${opciones.hojas
        .map((h) => `«${h}»`)
        .join(' o ')}). Se leyó igual.`,
    );
  }
  if (candidato.fila !== opciones.filaEncabezado) {
    advertencias.push(
      `El encabezado está en la fila ${candidato.fila} (se esperaba la ${opciones.filaEncabezado}). Se leyó igual.`,
    );
  }

  const filas: unknown[][] = [];
  const numerosFila: number[] = [];

  for (let i = candidato.fila; i < crudas.length; i++) {
    const fila = crudas[i] ?? [];
    // Igual que los scripts: las filas completamente vacías no son datos.
    if (!fila.some((v) => v !== null && v !== '')) continue;
    filas.push(fila);
    numerosFila.push(i + 1);
  }

  if (!filas.length) {
    throw new ErrorLectura('El archivo no tiene filas de datos debajo de los encabezados.');
  }

  return {
    hoja: { nombre: candidato.hoja, encabezado, filas, numerosFila },
    advertencias,
  };
}
