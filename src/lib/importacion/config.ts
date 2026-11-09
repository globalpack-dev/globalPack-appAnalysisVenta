/**
 * Configuración de los dos Excel que acepta el importador.
 *
 * Vive fuera del modal porque la comparten cuatro consumidores: la interfaz, la
 * lectura, la validación y el PDF de especificación. Si una lista de columnas
 * cambia, se cambia acá y los cuatro quedan alineados.
 *
 * ── Por qué son dos archivos y no tres ──────────────────────────────────────
 *
 * El cliente aclaró que «Base promotores» y «Base supervisores» son **el mismo
 * archivo en distinto momento**, no dos fuentes distintas. Por eso acá hay un
 * solo tipo `cartera`: lo que cambia entre versiones son las columnas, y eso se
 * resuelve con alias y con detección automática de hoja y fila de encabezado.
 *
 * Los datos se leyeron de los encabezados reales de:
 *
 *   · `excel/nuevos excel/Base ventas.xlsx`                 (25.005 filas)
 *   · `excel/nuevos excel/Base promotores_supervisores.xlsx` (2.990 filas)
 *
 * y de los formatos anteriores, para que sigan entrando.
 *
 * ── Obligatorias, opcionales e ignoradas ────────────────────────────────────
 *
 * `obligatorias` son las que, si faltan, bloquean la carga. `opcionales` se
 * usan si están (`PROMOTOR` y `Descripción Vendedor` sólo vienen en algunas
 * versiones). `ignoradas` son columnas conocidas del archivo que no tienen
 * destino en la base (totales, categorías, códigos internos): se listan para no
 * confundirlas con una columna nueva.
 *
 * Cualquier columna del archivo que no esté en ninguna de las tres listas se
 * reporta en la vista previa como "sin destino". Es el detector de columnas
 * nuevas (por ejemplo, una marca que todavía no está en la base).
 */

export type TipoExcel = 'ventas' | 'cartera';

export type ConfigTipo = {
  id: TipoExcel;
  titulo: string;
  archivo: string;
  /** Hojas aceptadas, en orden de preferencia. Se detecta sola la que sirva. */
  hojas: string[];
  /** Fila del Excel donde se esperan los encabezados (1-based). */
  filaEncabezado: number;
  /**
   * Columnas que identifican la hoja y la fila de encabezado correctas.
   *
   * `leerHojaAuto` busca, entre las primeras filas de cada hoja, la que
   * contenga todas estas columnas. Es lo que hace que un export nuevo con la
   * hoja renombrada o una fila de banner de más siga funcionando.
   */
  claveColumnas: string[];
  filas: string;
  filasEsperadas: number;
  descripcion: string;
  /** Todas las columnas que usa el importador: obligatorias + opcionales. */
  columnas: string[];
  obligatorias: string[];
  opcionales: string[];
  /** Columnas del archivo que se leen pero no se guardan. */
  ignoradas: string[];
  /**
   * Nombre canónico → nombres alternativos aceptados.
   *
   * Los exports cambiaron de nombre a lo largo del tiempo:
   *   · «VISITA» → «Días de Visita»
   *   · «TAREA LATON» → «TAREA LATON QUILMES»
   *   · la columna de latón de presentación se llama distinto según el archivo
   */
  alias?: Record<string, string[]>;
  notaColumnas?: string;
  avisos: string[];
  alCargar: string[];
  /** false = sólo muestra requisitos y no deja cargar. */
  habilitado: boolean;
};

const AVISOS_GENERALES = [
  'Exportá la planilla sin filtros aplicados: tienen que estar todas las filas.',
  'No renombres ni ocultes columnas: se leen por nombre exacto.',
  'Dejá una sola hoja con datos, sin celdas combinadas ni filas vacías en el medio.',
  'Formato .xlsx (Excel 2007 o superior).',
];

export { AVISOS_GENERALES };

/**
 * Columnas del archivo de cartera que no tienen destino en la base.
 *
 * Son totales, códigos internos, categorías y la columna de latón "de
 * presentación" (`LATON QUILMES`, que duplica a `TAREA LATON QUILMES`). Se
 * listan para que la vista previa no las confunda con una columna nueva.
 *
 * `VALUE` está acá a propósito: es una categoría (cerveza económica), no una
 * marca, y no existe en la tabla `marcas`.
 */
const IGNORADAS_CARTERA = [
  'CCC UNG SEPT',
  'UNG',
  'BD UNG',
  'TAREA CNC UNG (X3)',
  'CCC CVZA SEPT',
  'CVZA',
  'BD CVZA',
  'VOL CVZA',
  '1,200 LTS',
  'HL 1,200',
  'QUILMES 1,200LTS',
  'VALUE',
  'LATÓN 710cc',
  'LATON QUILMES',
  'PREMIUM',
  '0.0',
  'TAREA S/ALC',
  '269 ML',
  'CONVIVENCIA',
  'AGUAS',
  'CNC',
  'CCC',
  'EDF CVZA V0',
  'EDF UNG V0',
];

/** Las 9 marcas del archivo. `VALUE` no entra: es una categoría, no una marca. */
const MARCAS_CARTERA = [
  'QUILMES',
  'BUDWEISER',
  'CORONA',
  'RED BULL',
  'H2OH',
  'STELLA',
  'MICHELOB',
  'BLACK',
  'AO',
];

/** Columnas de cartera que sí se guardan. */
const OBLIGATORIAS_CARTERA = [
  'Vnd.',
  'SDV',
  'Cliente',
  'Razón Social',
  'Subcanal',
  'VISITA',
  'FLAG ALCOHOL',
  'TAREA CNC CVZA (X3)',
  'TIER A',
  'TIER B',
  'TAREA LATON',
  ...MARCAS_CARTERA,
];

/**
 * `PROMOTOR` (formato anterior) y `Descripción Vendedor` (formato nuevo) son
 * dos formas de traer el nombre del encargado. Ninguna de las dos es
 * obligatoria: sin nombre, los clientes de un «Vnd.» desconocido quedan sin
 * encargado y se avisa.
 */
const OPCIONALES_CARTERA = ['PROMOTOR', 'Descripción Vendedor', 'TAREA RED BULL'];

export const TIPOS: ConfigTipo[] = [
  {
    id: 'ventas',
    titulo: 'Ventas',
    archivo: 'Base ventas.xlsx',
    hojas: ['Página1'],
    filaEncabezado: 1,
    claveColumnas: ['Año/Mes', 'Código Cliente', 'Marca'],
    filas: '≈25.000 filas',
    filasEsperadas: 25005,
    descripcion: 'Facturación del período por cliente, producto y canal.',
    columnas: [
      'Año/Mes',
      'Cliente',
      'Código Cliente',
      'Sucursal',
      'Sector de Venta',
      'Sector de Supervisión',
      'Código Sector de Venta',
      'Código Producto',
      'Producto',
      'Marca',
      'Calibre',
      'División',
      'Familia',
      'Unidad de Negocio',
      'Localidad',
      'Canal Ajustado',
      'Segmento Mkt.',
      'Canal Mkt.',
      'Nombre Fantasia Cliente',
      'Subcanal Mkt.',
      'Clientes con Compra Totales',
      'Importe Neto',
      'Importe Bruto',
      'Importe Final',
      'Cantidad Total en Bultos',
      'Cantidad Total en HL',
    ],
    obligatorias: [
      'Año/Mes',
      'Cliente',
      'Código Cliente',
      'Sucursal',
      'Sector de Venta',
      'Sector de Supervisión',
      'Código Sector de Venta',
      'Código Producto',
      'Producto',
      'Marca',
      'Calibre',
      'División',
      'Familia',
      'Unidad de Negocio',
      'Localidad',
      'Canal Ajustado',
      'Segmento Mkt.',
      'Canal Mkt.',
      'Nombre Fantasia Cliente',
      'Subcanal Mkt.',
      'Clientes con Compra Totales',
      'Importe Neto',
      'Importe Bruto',
      'Importe Final',
      'Cantidad Total en Bultos',
      'Cantidad Total en HL',
    ],
    opcionales: [],
    ignoradas: ['Clientes con Compra Totales'],
    notaColumnas:
      '«Clientes con Compra Totales» se ignora: la base cuenta esos clientes sola. El resto se usa completo.',
    avisos: [
      'El encabezado va en la fila 1 (la primera fila del archivo).',
      '«Año/Mes» tiene que tener el formato AAAA/MM; por ejemplo, 2026/10. Una fila con fecha serial de Excel se descarta.',
      '«Código Cliente», «Código Producto» y «Código Sector de Venta» no pueden quedar vacíos.',
      'No borres la columna de período aunque el archivo sea de un solo mes.',
      'Si el archivo trae una marca que no está en la base, la vista previa la avisa; se crea sola al cargar.',
    ],
    alCargar: [
      'Se reemplazan sólo las ventas de los períodos que trae el archivo. Los demás períodos no se tocan.',
      'Los clientes, productos y demás dimensiones nuevas se agregan; las existentes se reutilizan.',
      'Las marcas nuevas se crean automáticamente.',
      'Las filas con errores se descartan y se muestran antes de escribir nada.',
      'La carga queda registrada en la tabla de importaciones (quién, cuándo y cuántas filas).',
    ],
    habilitado: true,
  },
  {
    id: 'cartera',
    titulo: 'Cartera (promotores y supervisores)',
    archivo: 'Base promotores_supervisores.xlsx',
    hojas: ['Hoja1', 'CLIENTES'],
    filaEncabezado: 3,
    claveColumnas: ['Cliente', 'SDV', 'Razón Social'],
    filas: '≈2.990 clientes',
    filasEsperadas: 2990,
    descripcion: 'Cartera de clientes por SDV, con promotor, visitas, tareas y marcas.',
    columnas: [...OBLIGATORIAS_CARTERA, ...OPCIONALES_CARTERA],
    obligatorias: OBLIGATORIAS_CARTERA,
    opcionales: OPCIONALES_CARTERA,
    ignoradas: IGNORADAS_CARTERA,
    alias: {
      VISITA: ['Días de Visita', 'Dias de Visita'],
      'TAREA LATON': ['TAREA LATON QUILMES'],
    },
    notaColumnas:
      'Promotores y supervisores son el mismo archivo en distinto momento: no son dos cargas. El encabezado se busca solo (fila 3 en los formatos conocidos) y la hoja también (Hoja1 o CLIENTES). El nombre del encargado puede venir en «PROMOTOR» o en «Descripción Vendedor»; si no viene, o si la columna de visitas se llama «VISITA» o «Días de Visita», el importador se adapta.',
    avisos: [
      'El encabezado va en la fila 3, con dos filas de banner arriba. El importador las saltea solo.',
      'La hoja con los datos puede llamarse Hoja1 o CLIENTES.',
      '«Vnd.» es el código del encargado de venta; «SDV» es el supervisor.',
      '«FLAG ALCOHOL» puede venir como SI / NO / CONSUMO PERSONAL / BAJA.',
      'Si el archivo trae una columna de marca que no está en la base, la vista previa la muestra como marca nueva: se crea al cargar y hay que indicar si es alcohol.',
    ],
    alCargar: [
      'La cartera se reemplaza completa: es una foto del archivo, no un delta.',
      'La foto anterior se archiva en cartera_historial antes de borrar, para poder ver la evolución después.',
      'Los clientes nuevos se agregan; los existentes no se modifican.',
      'Cada encargado («Vnd.») queda asignado al supervisor («SDV») que indica el archivo.',
      'Si el archivo no trae el nombre del encargado y el «Vnd.» no existe, esos clientes quedan sin encargado y se avisa antes de cargar.',
    ],
    habilitado: true,
  },
];

export function configDe(tipo: TipoExcel): ConfigTipo {
  const config = TIPOS.find((t) => t.id === tipo);
  if (!config) throw new Error(`Tipo de Excel desconocido: ${tipo}`);
  return config;
}

/**
 * Devuelve el índice de una columna obligatoria, aceptando sus alias.
 *
 * -1 significa que no está con ninguno de los nombres aceptados.
 */
export function indiceColumna(
  encabezado: string[],
  nombre: string,
  alias?: Record<string, string[]>,
): number {
  const directo = encabezado.indexOf(nombre);
  if (directo >= 0) return directo;

  for (const alternativo of alias?.[nombre] ?? []) {
    const i = encabezado.indexOf(alternativo);
    if (i >= 0) return i;
  }

  return -1;
}
