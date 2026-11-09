/**
 * Carga el archivo "base de sectores (promotores).xlsx" como fuente de verdad
 * de la supervisión (cartera).
 *
 * Es la Etapa 0 de la nueva etapa de promotores. Resuelve el conflicto de
 * supervisión que venía arrastrado de los exportes viejos:
 *
 *   · Sub Base Consulta.xlsx (cargado antes) decía: NACUL SOL + PERALTA SOLANA
 *     + sin supervisor.
 *   · Base de sectores (promotores).xlsx (más reciente) dice: NACUL SOL +
 *     FERNANDEZ EDUARDO.
 *
 * Y FERNANDEZ EDUARDO NO es un nombre nuevo inventado: es el bloque de ~1.600
 * clientes que antes estaban bajo PERALTA SOLANA y hoy pasó a la persona que lo
 * ejerce. El re-transvaso se detecta solo porque la fuente ahora viene
 * resuelta.
 *
 * Además deja el lado promotor al día: cada encargado de venta queda
 * colgando del supervisor que le toca según el archivo.
 *
 * Uso:
 *   npx tsx scripts/cargar-promotores.ts             # dry-run: no escribe nada
 *   npx tsx scripts/cargar-promotores.ts --aplicar  # escribe
 */

import 'dotenv/config';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const X: any = (XLSX as any).default ?? XLSX;
const ARCHIVO = 'excel/base de sectores (promotores).xlsx';
const LOTE = 1000;
const APLICAR = process.argv.includes('--aplicar');

/**
 * Las 9 marcas del archivo, mapeadas a los ids de `marcas`. Igual que en
 * cargar-sub-base: `VALUE` NO entra, es la categoría no-marca.
 */
const MARCAS: Array<{ col: string; id: number }> = [
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

// ─── Lectura ────────────────────────────────────────────────────────────────

const libro = X.readFile(ARCHIVO);
const crudas = X.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], {
  header: 1,
  raw: true,
  defval: null,
}) as unknown[][];

const ENC = (crudas[2] as unknown[]).map((v) => String(v ?? '').trim());
const cuerpo = crudas.slice(3).filter((f) => f.some((v) => v !== null && v !== ''));

function col(nombre: string): number {
  const i = ENC.indexOf(nombre);
  if (i < 0) throw new Error(`El archivo no tiene la columna "${nombre}". Tiene: ${ENC.join(', ')}`);
  return i;
}

const I = {
  vnd: col('Vnd.'),
  promotor: col('PROMOTOR'),
  sdv: col('SDV'),
  cliente: col('Cliente'),
  razon: col('Razón Social'),
  subcanal: col('Subcanal'),
  flag: col('FLAG ALCOHOL'),
  visitas: col('VISITA'),
  tierA: col('TIER A'),
  tierB: col('TIER B'),
  tareaCvza: col('TAREA CNC CVZA (X3)'),
  tareaLaton: col('TAREA LATON QUILMES'),
  tareaRedBull: col('TAREA RED BULL'),
  marcas: MARCAS.map((m) => ({ ...m, i: col(m.col) })),
};

const s = (f: unknown[], i: number): string => String(f[i] ?? '').trim();

// ─── Validación ─────────────────────────────────────────────────────────────

const sinCliente = cuerpo.filter((f) => !s(f, I.cliente)).length;
console.log(`\nArchivo: ${cuerpo.length} clientes`);
if (sinCliente) console.log(`  · ${sinCliente} sin Código Cliente`);

const promotores = new Map<string, string>();
const sds = new Map<string, number>();
for (const f of cuerpo) {
  const promotor = s(f, I.promotor);
  const sdv = s(f, I.sdv);
  if (!promotor) continue;
  promotores.set(promotor, sdv);
  if (sdv) sds.set(sdv, (sds.get(sdv) ?? 0) + 1);
}
console.log('\nSupervisores en el archivo:');
for (const [k, v] of [...sds].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(5)}  ${k}`);
}
console.log(`  promotores distintos: ${promotores.size}`);

if (!APLICAR) {
  console.log('\n--dry-run. No se escribió nada. Pasá --aplicar para cargar.\n');
  process.exit(0);
}

// ─── Escritura ──────────────────────────────────────────────────────────────

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Si el SQL 32 todavía no se corrió, abortamos AHORA: la carga vacía
// `cliente_alcohol` antes de insertar, así que fallar en el insert dejaría la
// tabla vacía hasta la próxima corrida.
const probe = await db.from('cliente_alcohol').select('flag_estado').limit(1);
if (probe.error) {
  console.error('\n  · falta cliente_alcohol.flag_estado (SQL 32).');
  console.error('    Ejecutá supabase/32_estados_especiales.sql y volvé a correr este script.\n');
  process.exit(1);
}

async function ins(tabla: string, filas: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await (db as any).from(tabla).insert(filas.slice(i, i + LOTE));
    if (error) throw new Error(`${tabla}: ${error.message}`);
    process.stdout.write(`\r  ${tabla}: ${Math.min(i + LOTE, filas.length)}/${filas.length}`);
  }
  if (filas.length) console.log('');
}

// ─── Carga ────────────────────────────────────────────────────────────────────

console.log('\nResolviendo supervisores…');
const { data: supervisores } = await db.from('supervisores').select('id_supervisor, nombre_completo');
const porNombre = new Map<string, number>(
  (supervisores ?? []).map((x: any) => [String(x.nombre_completo).trim(), x.id_supervisor]),
);
for (const nombre of [...new Set([...sds.keys()].filter(Boolean))]) {
  if (porNombre.has(nombre)) continue;
  const { data, error } = await db
    .from('supervisores')
    .insert({ nombre_completo: nombre })
    .select('id_supervisor')
    .single();
  if (error) throw new Error(`supervisores: ${error.message}`);
  porNombre.set(nombre, data.id_supervisor);
  console.log(`  agregado: ${nombre}`);
}

console.log('\nLeyendo encargados…');
const { data: encargados } = await db.from('encargados_ventas').select(
  'id_encargado_venta, nombre_completo, id_supervisor',
);
const porEncargado = new Map<string, { id_encargado_venta: number; id_supervisor: number | null }>(
  (encargados ?? []).map((e: any) => [String(e.nombre_completo).trim(), e]),
);
console.log(`  encargados en la base: ${encargados?.length ?? 0}`);

const nuevosClientes: Record<string, unknown>[] = [];
const cartera: Record<string, unknown>[] = [];
const alcohol: Record<string, unknown>[] = [];
const compras: Array<Record<string, unknown>> = [];
const operativa: Array<Record<string, unknown>> = [];

const clientesVistos = new Set<string>();
for (let d = 0; d < 20_000; d += 1000) {
  const { data } = await db.from('clientes').select('codigo_cliente').range(d, d + 999);
  if (!data?.length) break;
  for (const c of data) clientesVistos.add(String(c.codigo_cliente).trim());
}

console.log('\nArmando cartera desde el archivo…');
for (const f of cuerpo) {
  const codigo = s(f, I.cliente);
  if (!codigo) continue;
  const promotor = s(f, I.promotor);
  const sdv = s(f, I.sdv);
  const idSupervisor = sdv ? porNombre.get(sdv) ?? null : null;

  // Los clientes nuevos del exporte nuevo se agregan a `clientes`.
  if (!clientesVistos.has(codigo)) {
    nuevosClientes.push({ codigo_cliente: codigo, razon_social: s(f, I.razon) });
    clientesVistos.add(codigo);
  }

  cartera.push({ codigo_cliente: codigo, id_supervisor: idSupervisor });
  // El FLAG ALCOHOL no es sí/no: trae SI, NO, CONSUMO PERSONAL y BAJA. El
  // boolean `es_alcohol` sigue siendo sólo el SI (para no mover penetración ni
  // oportunidad); el resto se guarda textual en `flag_estado`.
  const flag = s(f, I.flag).toUpperCase().trim();
  const flagEstado = flag.startsWith('S')
    ? 'SI'
    : flag.startsWith('C')
      ? 'CONSUMO_PERSONAL'
      : flag.startsWith('B')
        ? 'BAJA'
        : 'NO';
  alcohol.push({
    codigo_cliente: codigo,
    es_alcohol: flagEstado === 'SI',
    flag_estado: flagEstado,
  });

  // La capa operativa: visitas, subcanal, tier y tareas pendientes.
  operativa.push({
    codigo_cliente: codigo,
    id_encargado_venta: porEncargado.get(promotor)?.id_encargado_venta ?? null,
    visitas: s(f, I.visitas).split(/\s+/).filter(Boolean),
    subcanal: s(f, I.subcanal) || null,
    tier: s(f, I.tierA).toUpperCase() === 'SI' ? 'A'
      : s(f, I.tierB).toUpperCase() === 'SI' ? 'B'
      : null,
    tarea_redbull: s(f, I.tareaRedBull) !== '',
    tarea_laton: s(f, I.tareaLaton) !== '',
    tarea_cvza: s(f, I.tareaCvza) !== '',
  });

  for (const m of I.marcas) {
    compras.push({ codigo_cliente: codigo, id_marca: m.id, compro: Number(f[m.i]) === 1 });
  }
}

// Cada promotor queda colgado del supervisor que le toca según el archivo.
console.log('\nReposicionando encargados → supervisores…');
for (const [nombre, sdv] of [...promotores].sort((a, b) => a[0].localeCompare(b[0]))) {
  const enc = porEncargado.get(nombre);
  if (!enc) {
    console.log(`  · sin encargado en la base: ${nombre}`);
    continue;
  }
  const idSupervisor = sdv ? porNombre.get(sdv) ?? null : null;
  const { error: errUpd } = await (db as any)
    .from('encargados_ventas')
    .update({ id_supervisor: idSupervisor })
    .eq('id_encargado_venta', enc.id_encargado_venta);
  if (errUpd) throw new Error(`encargados_ventas: ${errUpd.message}`);
}

// ─── Carga efectiva ──────────────────────────────────────────────────────────

console.log(`\nA cargar: ${nuevosClientes.length} clientes nuevos · ${cartera.length} de cartera · ${compras.length} flags`);

console.log('\nVaciando la carga anterior…');
for (const t of ['supervisores_cartera', 'cliente_producto', 'cliente_alcohol']) {
  const { error } = await db.from(t).delete().neq('codigo_cliente', '__ninguno__');
  if (error) throw new Error(`${t} (borrado): ${error.message}`);
}

console.log('\nInsertando…');
if (nuevosClientes.length) await ins('clientes', nuevosClientes);
await ins('supervisores_cartera', cartera);
await ins('cliente_alcohol', alcohol);
await ins('cliente_producto', compras);

// La capa operativa vive en su propia tabla: si el SQL 30 todavía no se
// corrió, la cartera ya quedó cargada igual y sólo falta este paso.
const { error: errOp } = await db.from('clientes_operativa').delete().neq('codigo_cliente', '__ninguno__');
if (errOp) {
  console.log(`\n  · clientes_operativa NO se cargó: ${errOp.message}`);
  console.log('    Corré supabase/30_operativos.sql y volvé a ejecutar este script.');
} else {
  console.log('');
  await ins('clientes_operativa', operativa);
}

// Los encargados apuntan a supervisores; PERALTA ya no tiene bloques.
console.log('\nBorrando PERALTA SOLANA (ya no es supervisor en el archivo)…');
const { error: errPer } = await (db as any).from('supervisores').delete().eq('nombre_completo', 'PERALTA SOLANA');
if (errPer) throw new Error(`supervisores (borrado PERALTA): ${errPer.message}`);

// ─── Verificación ───────────────────────────────────────────────────────────

const { data: resumen } = await db.rpc('fn_supervisores_cartera' as never);
console.log('\n=== Resultado ===');
for (const r of (resumen ?? []) as any[]) {
  console.log(
    `  ${String(r.nombre).padEnd(26)} ${String(r.clientes).padStart(5)} clientes  ` +
    `${String(r.alcohol).padStart(5)} de alcohol  ${String(r.oportunidad).padStart(5)} sin compra  ` +
    `pen ${String(r.penetracion)}`,
  );
}
console.log('\nRecargá la app.');
