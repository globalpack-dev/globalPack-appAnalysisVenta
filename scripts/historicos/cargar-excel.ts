/**
 * Carga de datos reales desde el Excel de Global Pack.
 *
 * Lee "Base Plana JDV (1).xlsx", resuelve los nombres a los ids de la base y
 * carga las 8.705 ventas con todas sus dimensiones.
 *
 * NO toca `empleados` ni `auth.users`: los usuarios del login quedan intactos.
 *
 * Uso:
 *   npx tsx scripts/cargar-excel.ts            # dry-run: no escribe nada
 *   npx tsx scripts/cargar-excel.ts --aplicar  # borra y carga
 */

import 'dotenv/config';
import * as XLSX from 'xlsx';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const X: any = (XLSX as any).default ?? XLSX;
const ARCHIVO = 'Base Plana JDV (1).xlsx';
const LOTE = 1000;
const APLICAR = process.argv.includes('--aplicar');

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// ─── Lectura del Excel ──────────────────────────────────────────────────────

const libro = X.readFile(ARCHIVO);
const crudas = X.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], {
  header: 1,
  raw: true,
  defval: null,
}) as unknown[][];

const ENC = crudas[0] as string[];
const cuerpo = crudas.slice(1).filter((f) => f.some((v) => v !== null && v !== ''));

function col(nombre: string): number {
  const i = ENC.indexOf(nombre);
  if (i < 0) throw new Error(`Falta la columna "${nombre}". Hay: ${ENC.join(', ')}`);
  return i;
}
// Índices explícitos: se resuelven una vez y se leen en un bucle de 8.700 filas.
const I = {
  periodo: col('Año/Mes'),
  cliente: col('Cliente'),
  codCliente: col('Código Cliente'),
  sucursal: col('Sucursal'),
  sector: col('Sector de Venta'),
  sectorSup: col('Sector de Supervisión'),
  codSector: col('Código Sector de Venta'),
  codProducto: col('Código Producto'),
  producto: col('Producto'),
  marca: col('Marca'),
  calibre: col('Calibre'),
  division: col('División'),
  familia: col('Familia'),
  unidad: col('Unidad de Negocio'),
  localidad: col('Localidad'),
  canalAjustado: col('Canal Ajustado'),
  segmento: col('Segmento Mkt.'),
  canalMkt: col('Canal Mkt.'),
  subcanal: col('Subcanal Mkt.'),
  fantasia: col('Nombre Fantasia Cliente'),
  neto: col('Importe Neto'),
  bruto: col('Importe Bruto'),
  final: col('Importe Final'),
  bultos: col('Cantidad Total en Bultos'),
  hl: col('Cantidad Total en HL'),
};

const s = (f: unknown[], i: number): string => String(f[i] ?? '').trim();
const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function parsePeriodo(v: unknown): { anio: number; mes: number } | null {
  const m = /^(\d{4})\/(\d{1,2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  return mes >= 1 && mes <= 12 ? { anio, mes } : null;
}

/**
 * "SIN SUPERVISOR" y "Sin Supervisor Asignado" son el mismo concepto escrito
 * de dos formas. Se unifican para no partir el análisis por supervisor.
 */
function supervisor(v: unknown): string {
  const t = String(v ?? '').trim();
  if (!t) return 'SIN SUPERVISOR';
  return t.toLowerCase().includes('sin supervisor') ? 'SIN SUPERVISOR' : t;
}

// ─── Validación ─────────────────────────────────────────────────────────────

const descargas: { motivo: string; cliente: string }[] = [];
const filas: unknown[][] = [];
for (const f of cuerpo) {
  const p = parsePeriodo(f[I.periodo]);
  if (!p) {
    descargas.push({ motivo: `período "${s(f, I.periodo)}" no tiene forma AAAA/MM`, cliente: s(f, I.cliente).slice(0, 30) });
    continue;
  }
  filas.push(f);
}

const sinProducto = filas.filter((f) => !s(f, I.codProducto)).length;
const sinCliente = filas.filter((f) => !s(f, I.codCliente)).length;

console.log(`\nExcel: ${cuerpo.length} filas · ${filas.length} válidas · ${descargas.length} descartadas`);
for (const d of descargas.slice(0, 5)) console.log(`  · ${d.motivo} — cliente "${d.cliente}"`);
if (descargas.length > 5) console.log(`  … y ${descargas.length - 5} más`);
if (sinProducto) console.log(`  · ${sinProducto} filas sin Código Producto`);
if (sinCliente) console.log(`  · ${sinCliente} filas sin Código Cliente`);

if (!APLICAR) {
  console.log('\n--dry-run. No se escribió nada. Pasá --aplicar para borrar y cargar.\n');
  process.exit(0);
}

// ─── Dimensiones: se toman los distintos del Excel ─────────────────────────

function distintos(i: number, transform: (v: unknown[], k: string) => string): Map<string, unknown[]> {
  const m = new Map<string, unknown[]>();
  for (const f of filas) {
    const k = transform(f, s(f, i));
    if (!m.has(k)) m.set(k, f);
  }
  return m;
}

const uSucursal = distintos(I.sucursal, (_, k) => k);
const uLocalidad = distintos(I.localidad, (_, k) => k);
const uMarca = distintos(I.marca, (_, k) => k);
const uUnidad = distintos(I.unidad, (_, k) => k);
const uDivision = distintos(I.division, (_, k) => k);
const uFamilia = distintos(I.familia, (_, k) => k);
const uCalibre = distintos(I.calibre, (_, k) => k);
// La clave es el supervisor YA NORMALIZADO. Antes devolvía `''` fijo, así que
// las 8.705 filas colapsaban en una sola entrada: quedaba 1 supervisor (el de la
// primera fila) y todas las ventas del resto se le imputaban a ese.
const uSup = distintos(I.sectorSup, (f) => supervisor(f[I.sectorSup]));
const uEncargado = distintos(I.codSector, (f, k) => k);
const uCliente = distintos(I.codCliente, (f, k) => k);
const uProducto = distintos(I.codProducto, (f, k) => k);
const uClasif = new Map<string, unknown[]>();
for (const f of filas) {
  const k = [s(f, I.canalAjustado), s(f, I.segmento), s(f, I.canalMkt), s(f, I.subcanal)].join('|');
  if (!uClasif.has(k)) uClasif.set(k, f);
}

const periodosUnicos = new Map<string, { anio: number; mes: number }>();
for (const f of filas) {
  const p = parsePeriodo(f[I.periodo])!;
  periodosUnicos.set(`${p.anio}/${p.mes}`, p);
}

console.log('\nDimensiones a cargar:');
console.log(`  periodos ${periodosUnicos.size} · sucursales ${uSucursal.size} · localidades ${uLocalidad.size}`);
console.log(`  marcas ${uMarca.size} · UN ${uUnidad.size} · divisiones ${uDivision.size} · familias ${uFamilia.size}`);
console.log(`  calibres ${uCalibre.size} · supervisores ${uSup.size} · encargados ${uEncargado.size}`);
console.log(`  clientes ${uCliente.size} · productos ${uProducto.size} · clasificaciones ${uClasif.size}`);

/**
 * Avisos antes de escribir.
 *
 * No cortan: son señales para mirar. El caso real fue el de supervisores, que
 * daba 1 cuando el Excel tiene 2, y la carga terminaba "con éxito" imputando
 * todas las ventas al supervisor equivocado. Nada en el resultado lo delataba.
 */
const avisos: string[] = [];

if (uSup.size < 2) {
  avisos.push(
    `Sólo ${uSup.size} supervisor(es). Si el Excel tiene "SIN SUPERVISOR" y ` +
    `alguien más, algo se colapsó y las ventas se imputarían al equivocado.`,
  );
}

// Una familia en muchas divisiones es lo esperado con la opción A, pero conviene
// verlo: significa que la división vive en el producto y no en la familia.
const divPorFamilia = new Map<string, Set<string>>();
for (const f of filas) {
  const fam = s(f, I.familia);
  if (!divPorFamilia.has(fam)) divPorFamilia.set(fam, new Set());
  divPorFamilia.get(fam)!.add(s(f, I.division));
}
const cruzadas = [...divPorFamilia].filter(([, v]) => v.size > 1);
if (cruzadas.length) {
  console.log(`\n  ${cruzadas.length} familias aparecen en más de una división:`);
  for (const [k, v] of cruzadas) console.log(`    ${k}: ${[...v].join(', ')}`);
  console.log('  → La división se guarda en cada producto, no en la familia.');
}

// Producto sin marca, familia o división: son NOT NULL o FK y la carga falla.
const incompletos = filas.filter(
  (f) => !s(f, I.marca) || !s(f, I.familia) || !s(f, I.division) || !s(f, I.codProducto),
);
if (incompletos.length) {
  console.log(`\n  ${incompletos.length} filas sin marca, familia, división o código de producto:`);
  console.log(`ej: cliente "${s(incompletos[0], I.cliente).slice(0, 30)}"`);
}

if (avisos.length) {
  console.log('\nAVISOS:');
  for (const a of avisos) console.log(`  · ${a}`);
}

// ─── Borrado ────────────────────────────────────────────────────────────────

/**
 * Tablas a vaciar, en orden inverso al de las FK.
 *
 * El nombre de la PK va explícito porque NO hay una columna `id` genérica: cada
 * tabla se llama distinto. La primera versión usaba `delete().gt('id', 0)` y
 * falló en las 13 tablas; como el error se avisaba con `console.warn` en vez de
 * cortar, el script siguió como si hubiera borrado y la carga quedó mezclada
 * con los datos viejos.
 */
const TABLAS_A_VACIAR: Array<[tabla: string, pk: string]> = [
  ['ventas', 'id_venta'],
  ['clasificaciones_marketing', 'id_clasificacion_marketing'],
  ['productos', 'id_producto'],
  ['familias', 'id_familia'],
  ['divisiones', 'id_division'],
  ['marcas', 'id_marca'],
  ['calibres', 'id_calibre'],
  ['unidades_negocio', 'id_unidad_negocio'],
  ['localidades', 'id_localidad'],
  ['encargados_ventas', 'id_encargado_venta'],
  ['supervisores', 'id_supervisor'],
  ['sucursales', 'id_sucursal'],
  ['clientes', 'id_cliente'],
];
// `periodos` NO se vacía: hay 10 del seed que no estorban y borrarlos rompe los
// filtros. El de 2026/10 se agrega si falta.

console.log('\nBorrando datos de prueba…');
for (const [t, pk] of TABLAS_A_VACIAR) {
  const antes = await db.from(t).select(pk, { count: 'exact', head: true });
  const { error } = await db.from(t).delete().gt(pk, 0);
  if (error) {
    // Cortar, no avisar: seguir dejaría la base mezclada sin que nadie lo note.
    console.error(`  ERROR borrando ${t}: ${error.message}`);
    process.exit(1);
  }
  const despues = await db.from(t).select(pk, { count: 'exact', head: true });
  const n = antes.count ?? 0;
  const quedan = despues.count ?? 0;
  console.log(`  ${t}: ${n} -> ${quedan}${quedan ? '   << NO SE BORRÓ' : ''}`);
  if (quedan) {
    console.error(`\n  ${t} sigue con ${quedan} filas. No se sigue con la carga.`);
    process.exit(1);
  }
}

const existentes = await db.from('periodos').select('id_periodo, anio, mes');
const mapaPeriodo = new Map<string, number>();
for (const p of existentes.data ?? []) mapaPeriodo.set(`${p.anio}/${p.mes}`, p.id_periodo);

// ─── Inserción en orden de dependencia ──────────────────────────────────────

/** Fila genérica de tabla: se leen ids que el tipo literal no conoce. */
type Fila = Record<string, any>;

async function ins(tabla: string, filasInsert: Fila[]): Promise<Fila[]> {
  const salida: Fila[] = [];
  for (let i = 0; i < filasInsert.length; i += LOTE) {
    const lote = filasInsert.slice(i, i + LOTE);
    const { data, error } = await (db as any).from(tabla).insert(lote).select('*');
    if (error) throw new Error(`${tabla}: ${error.message}`);
    salida.push(...((data ?? []) as Fila[]));
    process.stdout.write(`\r  ${tabla}: ${salida.length}/${filasInsert.length}`);
  }
  if (filasInsert.length) console.log('');
  return salida;
}

console.log('\nInsertando…');

// periodos nuevos
const nuevosPeriodos = [...periodosUnicos.values()].filter(
  (p) => !mapaPeriodo.has(`${p.anio}/${p.mes}`),
);
if (nuevosPeriodos.length) {
  const ins2 = await ins('periodos', nuevosPeriodos.map((p) => ({ anio: p.anio, mes: p.mes, nombre_mes: MESES[p.mes - 1] })));
  for (const p of ins2) mapaPeriodo.set(`${p.anio}/${p.mes}`, p.id_periodo as number);
}

const idSucursal = new Map<string, number>();
for (const r of await ins('sucursales', [...uSucursal].map(([, f]) => ({ nombre: s(f, I.sucursal) }))))
  idSucursal.set(r.nombre as string, r.id_sucursal as number);

const idLocalidad = new Map<string, number>();
for (const r of await ins('localidades', [...uLocalidad].map(([, f]) => ({ nombre: s(f, I.localidad) }))))
  idLocalidad.set(r.nombre as string, r.id_localidad as number);

const idMarca = new Map<string, number>();
for (const r of await ins('marcas', [...uMarca].map(([, f]) => ({ nombre: s(f, I.marca) }))))
  idMarca.set(r.nombre as string, r.id_marca as number);

const idUnidad = new Map<string, number>();
for (const r of await ins('unidades_negocio', [...uUnidad].map(([, f]) => ({ nombre: s(f, I.unidad) }))))
  idUnidad.set(r.nombre as string, r.id_unidad_negocio as number);

// La división cuelga de la UN: se toma de la fila donde aparece esa división.
const idDivision = new Map<string, number>();
for (const r of await ins('divisiones', [...uDivision].map(([, f]) => ({
  nombre: s(f, I.division),
  id_unidad_negocio: idUnidad.get(s(f, I.unidad)),
})))) idDivision.set(r.nombre as string, r.id_division as number);

const idCalibre = new Map<string, number>();
for (const r of await ins('calibres', [...uCalibre].map(([, f]) => ({ nombre: s(f, I.calibre) }))))
  idCalibre.set(r.nombre as string, r.id_calibre as number);

// La división se define POR PRODUCTO, no por familia: en el Excel la división
// manda sobre la familia (una misma familia aparece en 8 divisiones distintas).
// La familia se guarda igual, pero sin colgar de una división.
const idFamilia = new Map<string, number>();
for (const r of await ins('familias', [...uFamilia].map(([, f]) => ({
  nombre: s(f, I.familia),
  id_division: null,
})))) idFamilia.set(r.nombre as string, r.id_familia as number);

const idSupervisor = new Map<string, number>();
for (const r of await ins('supervisores', [...uSup].map(([k]) => ({ nombre_completo: k }))))
  idSupervisor.set(r.nombre_completo as string, r.id_supervisor as number);

const idEncargado = new Map<string, number>();
for (const r of await ins('encargados_ventas', [...uEncargado].map(([, f]) => ({
  codigo_sector_venta: Number(s(f, I.codSector)),
  nombre_completo: s(f, I.sector),
  id_supervisor: idSupervisor.get(supervisor(f[I.sectorSup])) ?? null,
})))) idEncargado.set(String(r.codigo_sector_venta), r.id_encargado_venta as number);

const idCliente = new Map<string, number>();
for (const r of await ins('clientes', [...uCliente].map(([, f]) => ({
  codigo_cliente: s(f, I.codCliente),
  razon_social: s(f, I.cliente),
  nombre_fantasia: s(f, I.fantasia) || null,
  id_localidad: idLocalidad.get(s(f, I.localidad)) ?? null,
})))) idCliente.set(r.codigo_cliente as string, r.id_cliente as number);

const idProducto = new Map<string, number>();
for (const r of await ins('productos', [...uProducto].map(([, f]) => ({
  codigo_producto: s(f, I.codProducto),
  nombre: s(f, I.producto),
  id_marca: idMarca.get(s(f, I.marca)) ?? null,
  id_calibre: idCalibre.get(s(f, I.calibre)) ?? null,
  id_familia: idFamilia.get(s(f, I.familia)),
  id_division: idDivision.get(s(f, I.division)) ?? null,
})))) idProducto.set(r.codigo_producto as string, r.id_producto as number);

const idClasif = new Map<string, number>();
for (const r of await ins('clasificaciones_marketing', [...uClasif].map(([k]) => {
  const [ca, sg, cm, sc] = k.split('|');
  return { canal_ajustado: ca || null, segmento_mkt: sg || null, canal_mkt: cm || null, subcanal_mkt: sc || null };
}))) {
  idClasif.set(
    [r.canal_ajustado ?? '', r.segmento_mkt ?? '', r.canal_mkt ?? '', r.subcanal_mkt ?? ''].join('|'),
    r.id_clasificacion_marketing as number,
  );
}

// ─── Ventas ─────────────────────────────────────────────────────────────────

const ventas = filas.map((f) => {
  const p = parsePeriodo(f[I.periodo])!;
  return {
    id_periodo: mapaPeriodo.get(`${p.anio}/${p.mes}`)!,
    id_cliente: idCliente.get(s(f, I.codCliente))!,
    id_sucursal: idSucursal.get(s(f, I.sucursal))!,
    id_encargado_venta: idEncargado.get(s(f, I.codSector))!,
    id_producto: idProducto.get(s(f, I.codProducto))!,
    id_clasificacion_marketing: idClasif.get(
      [s(f, I.canalAjustado), s(f, I.segmento), s(f, I.canalMkt), s(f, I.subcanal)].join('|'),
    ) ?? null,
    importe_neto: n(f[I.neto]),
    importe_bruto: n(f[I.bruto]),
    importe_final: n(f[I.final]),
    cantidad_bultos: n(f[I.bultos]),
    cantidad_hl: n(f[I.hl]),
  };
});

const huerfanas = ventas.filter(
  (v) => !v.id_periodo || !v.id_cliente || !v.id_sucursal || !v.id_encargado_venta || !v.id_producto,
);
if (huerfanas.length) {
  console.log(`\n  ${huerfanas.length} ventas quedaron sin resolver y NO se insertan.`);
  console.log('  Ejemplo:', JSON.stringify(huerfanas[0]));
  process.exit(1);
}

await ins('ventas', ventas);

// ─── Verificación ──────────────────────────────────────────────────────────

const { count } = await db.from('ventas').select('*', { count: 'exact', head: true });
const kpi = (await db.rpc('fn_dashboard_kpis' as never, {} as never)).data?.[0] as any;

console.log('\n=== Resultado ===');
console.log(`ventas en la base: ${count}`);
if (kpi) {
  console.log(`neto: ${kpi.total_neto} · bruto: ${kpi.total_bruto} · final: ${kpi.total_final}`);
  console.log(`bultos: ${kpi.total_bultos} · hl: ${kpi.total_hl}`);
  console.log(`operaciones: ${kpi.operaciones} · clientes activos: ${kpi.clientes_activos} · productos: ${kpi.productos_vendidos}`);
}
console.log('\nRecargá la app.');