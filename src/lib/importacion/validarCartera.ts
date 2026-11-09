/**
 * Validación de los Excel de cartera: funciones puras, sin Supabase.
 *
 * Igual que `validarVentas.ts`, corre en la vista previa. Además de filas y
 * columnas, arma lo que hace falta para decidir si conviene cargar:
 *
 *   · supervisores y encargados detectados en el archivo
 *   · distribución real del FLAG ALCOHOL, con los valores desconocidos a la vista
 *   · tiers y visitas que no encajan con el formato
 *   · columnas de marca del archivo, incluidas las que todavía no están en la base
 *   · qué cambia respecto de la cartera cargada hoy
 *
 * El estado actual es opcional: sin él la validación funciona igual, sólo que
 * sin el bloque de comparación y sin poder reconocer marcas fuera de las 9 fijas.
 */

import { configDe, indiceColumna, type ConfigTipo, type TipoExcel } from './config';
import type { HojaCruda } from './leerExcel';
import { claveMarca, claveNombre, type MarcaBase } from './nombres';

/** Días que acepta la columna VISITA. */
export const DIAS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'DOM'];

/**
 * Las 9 marcas del archivo, con el id que ya usa la base.
 *
 * `VALUE` no entra: es una categoría (cerveza económica), no una marca.
 * Son las que el cliente manda siempre. Si el archivo trae una marca más, se
 * detecta por nombre contra la tabla `marcas`; si tampoco está ahí, queda como
 * marca nueva y se crea al cargar (ver `marcasDelArchivo`).
 */
export const MARCAS: Array<{ col: string; id: number }> = [
  { col: 'QUILMES', id: 103 },
  { col: 'BUDWEISER', id: 115 },
  { col: 'CORONA', id: 124 },
  { col: 'RED BULL', id: 118 },
  { col: 'H2OH', id: 112 },
  { col: 'STELLA', id: 108 },
  { col: 'MICHELOB', id: 126 },
  { col: 'BLACK', id: 98 },
  { col: 'AO', id: 110 },
];

/**
 * Una columna de marca de la cartera.
 *
 * `id` en `null` significa que la marca no existe en la base: la vista previa la
 * muestra para que el usuario decida si es alcohólica y la carga la crea.
 */
export type MarcaCartera = {
  /** Encabezado tal como viene en el archivo. */
  col: string;
  /** Nombre con el que se guarda en la base. */
  nombre: string;
  id: number | null;
  /** Sólo se usa si `id === null`: si la marca nueva es alcohólica. */
  esAlcohol: boolean;
};

export type FilaDescartada = {
  /** Número de fila del Excel (1-based), para ubicarla a ojo. */
  fila: number;
  motivo: string;
};

/**
 * Foto de la cartera que hoy está en la base. La trae `leerEstadoCartera()`
 * antes de validar. Es sólo lectura.
 */
export type EstadoCartera = {
  /** codigo_cliente → nombre del supervisor actual (null = sin supervisor). */
  porCliente: Map<string, string | null>;
  /**
   * Claves canónicas (`claveNombre`) → nombre tal como está en la base.
   * El archivo puede escribir "EDUARDO FERNANDEZ" y la base tener
   * "FERNANDEZ EDUARDO": la clave los iguala y el nombre muestra el de la base.
   */
  supervisores: Map<string, string>;
  /** codigo_sector_venta → nombre del encargado. */
  encargados: Map<string, string>;
  /** Marcas de la base, para reconocer columnas que no son las 9 fijas. */
  marcas: MarcaBase[];
};

export type ComparacionCartera = {
  totalActual: number;
  totalArchivo: number;
  cambianSupervisor: number;
  pasanASinSupervisor: number;
  nuevos: number;
  desaparecen: number;
  /** Primeros cambios, para mostrar en la vista previa. */
  ejemplos: Array<{ codigo: string; de: string; a: string }>;
};

export type PlanCartera = {
  tipo: 'cartera';
  archivo: string;
  hoja: string;
  totalFilas: number;
  filasValidas: number;
  descartadas: FilaDescartada[];
  columnasFaltantes: string[];
  /** Columnas del archivo que no tienen destino conocido ni parecen marca. */
  columnasSinDestino: string[];
  /** Todas las columnas de marca del archivo, con id (null = hay que crearla). */
  marcas: MarcaCartera[];
  /** Subconjunto de `marcas` con `id === null`. */
  marcasNuevas: MarcaCartera[];
  advertencias: string[];
  valido: boolean;
  /**
   * false = el archivo no trae el nombre del encargado en ninguna de las dos
   * formas conocidas (`PROMOTOR` o `Descripción Vendedor`).
   */
  tieneNombreEncargado: boolean;
  supervisores: Array<{ nombre: string; clientes: number }>;
  supervisoresNuevos: string[];
  encargados: Array<{
    codigo: string;
    nombreArchivo: string | null;
    nombreBase: string | null;
    existe: boolean;
    clientes: number;
  }>;
  flags: Array<{ valor: string; etiqueta: string; clientes: number; conocido: boolean }>;
  tiersInvalidos: number;
  visitasRaras: number;
  duplicados: number;
  comparacion: ComparacionCartera | null;
};

const s = (fila: unknown[], i: number): string => (i < 0 ? '' : String(fila[i] ?? '').trim());

/**
 * FLAG ALCOHOL no es sí/no. Los valores conocidos son SI, NO, CONSUMO PERSONAL
 * y BAJA (más la celda vacía). Cualquier otra cosa se cuanta como desconocida —
 * hoy aparece un `0` suelto.
 */
export function clasificarFlag(valor: string): { etiqueta: string; conocido: boolean } {
  const texto = valor.trim();
  const conocido = ['SI', 'NO', 'CONSUMO PERSONAL', 'BAJA', ''].includes(texto.toUpperCase());
  return { etiqueta: texto || 'Sin dato', conocido };
}

/** Traduce el FLAG a lo que guarda la base (igual criterio que los scripts). */
export function flagParaBase(valor: string): 'SI' | 'NO' | 'CONSUMO_PERSONAL' | 'BAJA' {
  const flag = valor.toUpperCase().trim();
  if (flag.startsWith('S')) return 'SI';
  if (flag.startsWith('C')) return 'CONSUMO_PERSONAL';
  if (flag.startsWith('B')) return 'BAJA';
  return 'NO';
}

export type IndicesCartera = ReturnType<typeof indicesDe>;

/** Resuelve los índices aceptando los alias configurados (visitas y latón). */
export function indicesDe(
  encabezado: string[],
  config: ConfigTipo,
  marcas?: MarcaCartera[],
) {
  const i = (nombre: string) => indiceColumna(encabezado, nombre, config.alias);

  const columnas =
    marcas ??
    MARCAS.map((m) => ({
      col: m.col,
      nombre: m.col,
      id: m.id,
      esAlcohol: false,
    }));

  return {
    vnd: i('Vnd.'),
    promotor: i('PROMOTOR'),
    descVendedor: i('Descripción Vendedor'),
    sdv: i('SDV'),
    cliente: i('Cliente'),
    razon: i('Razón Social'),
    subcanal: i('Subcanal'),
    visitas: i('VISITA'),
    flag: i('FLAG ALCOHOL'),
    tierA: i('TIER A'),
    tierB: i('TIER B'),
    tareaCvza: i('TAREA CNC CVZA (X3)'),
    tareaLaton: i('TAREA LATON'),
    tareaRedBull: i('TAREA RED BULL'),
    marcas: columnas.map((m) => ({ ...m, i: i(m.col) })),
  };
}

/** Una columna con sólo ceros y unos (al menos uno) parece un flag de compra. */
function pareceBandera(filas: unknown[][], indice: number): boolean {
  if (indice < 0) return false;

  let vistos = 0;
  for (const fila of filas) {
    const valor = String(fila[indice] ?? '').trim();
    if (valor === '') continue;
    if (valor !== '0' && valor !== '1') return false;
    vistos += 1;
  }
  return vistos > 0;
}

/**
 * Separa las columnas de marca de las que no tienen destino.
 *
 * Una columna de marca es la que coincide (por nombre normalizado) con la tabla
 * `marcas` o con una de las 9 fijas. Si no coincide pero sólo trae ceros y unos,
 * se asume marca nueva: la vista previa deja marcarla como alcohólica y la carga
 * la crea. Lo demás es una columna sin destino y se avisa.
 */
function marcasDelArchivo(
  encabezado: string[],
  filas: unknown[][],
  config: ConfigTipo,
  estado?: EstadoCartera | null,
): { marcas: MarcaCartera[]; sinDestino: string[] } {
  const porClave = new Map<string, MarcaBase>();
  for (const m of estado?.marcas ?? []) porClave.set(claveMarca(m.nombre), m);
  for (const m of MARCAS) {
    const clave = claveMarca(m.col);
    if (!porClave.has(clave)) porClave.set(clave, { id_marca: m.id, nombre: m.col });
  }

  const conocidas = new Set(config.columnas);
  for (const alternativas of Object.values(config.alias ?? {})) {
    for (const a of alternativas) conocidas.add(a);
  }
  const ignoradas = new Set(config.ignoradas);

  const marcas: MarcaCartera[] = [];
  const sinDestino: string[] = [];

  encabezado.forEach((col, indice) => {
    if (col === '') return;

    const marca = porClave.get(claveMarca(col));
    if (marca) {
      marcas.push({ col, nombre: marca.nombre, id: marca.id_marca, esAlcohol: false });
      return;
    }
    if (conocidas.has(col) || ignoradas.has(col)) return;

    if (pareceBandera(filas, indice)) {
      marcas.push({ col, nombre: col.trim(), id: null, esAlcohol: false });
      return;
    }
    sinDestino.push(col);
  });

  return { marcas, sinDestino };
}

export function validarCartera(
  tipo: Extract<TipoExcel, 'cartera'>,
  archivo: File,
  hoja: HojaCruda,
  estado?: EstadoCartera | null,
): PlanCartera {
  const config = configDe(tipo);
  const faltantes = config.obligatorias.filter(
    (c) => indiceColumna(hoja.encabezado, c, config.alias) < 0,
  );

  const base: PlanCartera = {
    tipo,
    archivo: archivo.name,
    hoja: hoja.nombre,
    totalFilas: hoja.filas.length,
    filasValidas: 0,
    descartadas: [],
    columnasFaltantes: faltantes,
    columnasSinDestino: [],
    marcas: [],
    marcasNuevas: [],
    advertencias: [],
    valido: faltantes.length === 0,
    tieneNombreEncargado:
      hoja.encabezado.includes('PROMOTOR') || hoja.encabezado.includes('Descripción Vendedor'),
    supervisores: [],
    supervisoresNuevos: [],
    encargados: [],
    flags: [],
    tiersInvalidos: 0,
    visitasRaras: 0,
    duplicados: 0,
    comparacion: null,
  };

  if (faltantes.length) {
    base.advertencias.push(
      `Faltan ${faltantes.length} columna(s) obligatoria(s). El archivo no se puede cargar hasta corregirlo.`,
    );
    return base;
  }

  const marcasArchivo = marcasDelArchivo(hoja.encabezado, hoja.filas, config, estado);
  base.marcas = marcasArchivo.marcas;
  base.marcasNuevas = marcasArchivo.marcas.filter((m) => m.id === null);
  base.columnasSinDestino = marcasArchivo.sinDestino;

  const I = indicesDe(hoja.encabezado, config, base.marcas);

  const descartadas: FilaDescartada[] = [];
  const vistos = new Set<string>();
  const supervisores = new Map<string, number>();
  const encargados = new Map<string, { clientes: number; nombreArchivo: string | null }>();
  const flags = new Map<string, { clientes: number; conocido: boolean }>();
  const codigosArchivo = new Set<string>();
  /** codigo_cliente → supervisor del archivo ('' = sin supervisor). */
  const supervisorArchivo = new Map<string, string>();

  let tiersInvalidos = 0;
  let visitasRaras = 0;
  let duplicados = 0;

  hoja.filas.forEach((fila, posicion) => {
    const numeroFila = hoja.numerosFila[posicion];
    const codigo = s(fila, I.cliente);

    if (!codigo) {
      descartadas.push({ fila: numeroFila, motivo: 'sin «Cliente» (código)' });
      return;
    }
    if (vistos.has(codigo)) {
      duplicados++;
      descartadas.push({
        fila: numeroFila,
        motivo: `código de cliente repetido (${codigo}); se conserva la primera aparición`,
      });
      return;
    }
    vistos.add(codigo);
    codigosArchivo.add(codigo);

    const sdv = s(fila, I.sdv);
    supervisorArchivo.set(codigo, sdv);
    const claveSupervisor = sdv || 'Sin supervisor';
    supervisores.set(claveSupervisor, (supervisores.get(claveSupervisor) ?? 0) + 1);

    const vnd = s(fila, I.vnd);
    if (vnd) {
      const nombre = s(fila, I.promotor) || s(fila, I.descVendedor);
      const actual = encargados.get(vnd) ?? { clientes: 0, nombreArchivo: nombre || null };
      actual.clientes++;
      if (!actual.nombreArchivo && nombre) actual.nombreArchivo = nombre;
      encargados.set(vnd, actual);
    }

    const flagCrudo = s(fila, I.flag);
    const clasificado = clasificarFlag(flagCrudo);
    const flagActual = flags.get(clasificado.etiqueta) ?? {
      clientes: 0,
      conocido: clasificado.conocido,
    };
    flagActual.clientes++;
    flags.set(clasificado.etiqueta, flagActual);

    if (s(fila, I.tierA) && s(fila, I.tierA).toUpperCase() !== 'SI') tiersInvalidos++;
    if (s(fila, I.tierB) && s(fila, I.tierB).toUpperCase() !== 'SI') tiersInvalidos++;

    const dias = s(fila, I.visitas).split(/\s+/).filter(Boolean);
    visitasRaras += dias.filter((d) => !DIAS.includes(d.toUpperCase())).length;
  });

  base.filasValidas = hoja.filas.length - descartadas.length;
  base.descartadas = descartadas;
  base.duplicados = duplicados;
  base.tiersInvalidos = tiersInvalidos;
  base.visitasRaras = visitasRaras;

  base.supervisores = [...supervisores]
    .map(([nombre, clientes]) => ({ nombre, clientes }))
    .sort((a, b) => b.clientes - a.clientes || a.nombre.localeCompare(b.nombre));

  base.flags = [...flags]
    .map(([valor, datos]) => ({
      valor,
      etiqueta: valor,
      clientes: datos.clientes,
      conocido: datos.conocido,
    }))
    .sort((a, b) => b.clientes - a.clientes);

  base.encargados = [...encargados]
    .map(([codigo, datos]) => ({
      codigo,
      nombreArchivo: datos.nombreArchivo,
      nombreBase: estado?.encargados.get(codigo) ?? null,
      existe: estado ? estado.encargados.has(codigo) : true,
      clientes: datos.clientes,
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'es'));

  // ── Comparación con la cartera vigente ────────────────────────────────────
  if (estado) {
    const cambios: Array<{ codigo: string; de: string; a: string }> = [];
    let cambian = 0;
    let aSinSupervisor = 0;
    let nuevos = 0;

    for (const codigo of codigosArchivo) {
      const actual = estado.porCliente.get(codigo);
      const sdv = supervisorArchivo.get(codigo) ?? '';
      const nuevo = sdv || null;

      if (actual === undefined) {
        nuevos++;
        continue;
      }

      const anterior = actual ?? null;
      // Los nombres pueden venir en otro orden ("EDUARDO FERNANDEZ" vs
      // "FERNANDEZ EDUARDO"). Se compara por clave, no por texto.
      const mismo =
        anterior === null && nuevo === null
          ? true
          : anterior !== null && nuevo !== null && claveNombre(anterior) === claveNombre(nuevo);
      if (mismo) continue;

      if (nuevo === null) {
        aSinSupervisor++;
      } else {
        cambian++;
      }

      if (cambios.length < 8) {
        cambios.push({
          codigo,
          de: anterior ?? 'Sin supervisor',
          a: nuevo ?? 'Sin supervisor',
        });
      }
    }

    let desaparecen = 0;
    for (const codigo of estado.porCliente.keys()) {
      if (!codigosArchivo.has(codigo)) desaparecen++;
    }

    base.comparacion = {
      totalActual: estado.porCliente.size,
      totalArchivo: codigosArchivo.size,
      cambianSupervisor: cambian,
      pasanASinSupervisor: aSinSupervisor,
      nuevos,
      desaparecen,
      ejemplos: cambios,
    };

    base.supervisoresNuevos = [
      ...new Set(
        base.supervisores
          .map((x) => x.nombre)
          .filter((n) => n !== 'Sin supervisor' && !estado.supervisores.has(claveNombre(n))),
      ),
    ];
  }

  // ── Advertencias ──────────────────────────────────────────────────────────
  if (!base.tieneNombreEncargado) {
    base.advertencias.push(
      'Este archivo no trae el nombre del encargado (ni «PROMOTOR» ni «Descripción Vendedor»): la cartera por promotor no se actualiza y los «Vnd.» que no existan en la base quedan sin encargado. Se puede cargar igual.',
    );
  }

  if (base.marcasNuevas.length) {
    base.advertencias.push(
      `El archivo trae ${base.marcasNuevas.length} marca(s) que no están en la base: ${base.marcasNuevas
        .map((m) => m.nombre)
        .join(', ')}. Se crean al cargar. Marcá las que sean alcohol.`,
    );
  } else if (base.marcas.length === 0) {
    base.advertencias.push(
      'No se detectó ninguna columna de marca: la matriz de compras por cliente queda vacía.',
    );
  }

  if (base.columnasSinDestino.length) {
    base.advertencias.push(
      `El archivo trae ${base.columnasSinDestino.length} columna(s) que no tienen destino y no se cargan: ${base.columnasSinDestino.join(', ')}.`,
    );
  }

  if (base.supervisoresNuevos.length) {
    base.advertencias.push(
      `Supervisores que no existen en la base y se van a crear: ${base.supervisoresNuevos.join(', ')}.`,
    );
  }

  const encargadosFaltantes = base.encargados.filter((e) => !e.existe).map((e) => e.codigo);
  if (encargadosFaltantes.length) {
    base.advertencias.push(
      `Códigos «Vnd.» que no existen en encargados_ventas: ${encargadosFaltantes.join(', ')}. Esos clientes quedan sin encargado hasta que se cree el encargado.`,
    );
  }

  const flagsDesconocidos = base.flags.filter((f) => !f.conocido).reduce((n, f) => n + f.clientes, 0);
  if (flagsDesconocidos) {
    base.advertencias.push(
      `${flagsDesconocidos} fila(s) con «FLAG ALCOHOL» fuera de SI / NO / CONSUMO PERSONAL / BAJA. Se cargan como NO.`,
    );
  }

  if (base.tiersInvalidos) {
    base.advertencias.push(
      `${base.tiersInvalidos} celda(s) de TIER A/B con un valor que no es «SI». El tier sólo reconoce A o B; el resto se ignora.`,
    );
  }

  if (base.visitasRaras) {
    base.advertencias.push(
      `${base.visitasRaras} día(s) de visita que no son LUN / MAR / MIE / JUE / VIE / SAB / DOM. Esos valores no se guardan.`,
    );
  }

  if (!estado) {
    base.advertencias.push(
      'No se pudo leer la cartera actual: la vista previa no puede mostrar qué cambia respecto de lo cargado.',
    );
  }

  if (!base.filasValidas) {
    base.valido = false;
    base.advertencias.push('No queda ninguna fila válida para cargar.');
  }

  return base;
}
