/**
 * Carga el archivo "Sub Base Consulta.xlsx".
 *
 * El archivo es un reporte comercial por cliente: 2.989 clientes con un flag
 * SI/NO por producto. Sirve para responder "este cliente es de alcohol pero no
 * compró nada → ofertele". Eso no sale de `ventas`, porque un cliente que no
 * compró no tiene ninguna fila ahí.
 *
 * OJO con el formato: los encabezados están en la fila 3, NO en la primera.
 * Filas 1 y 2 son una bandera y una fila de números.
 *
 * Uso:
 *   npx tsx scripts/cargar-sub-base.ts            # dry-run: no escribe nada
 *   npx tsx scripts/cargar-sub-base.ts --aplicar  # escribe
 */

import 'dotenv/config';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const X: any = (XLSX as any).default ?? XLSX;
const ARCHIVO = 'Sub Base Consulta.xlsx';
const LOTE = 1000;
const APLICAR = process.argv.includes('--aplicar');

/**
 * Las 9 marcas del archivo, mapeadas a los ids de `marcas`.
 *
 * Mapeo verificado contra la base: son 41 marcas y el archivo usa nombres
 * cortos o abreviaturas. `VALUE` NO entra: es la categoría "cerveza económica"
 * (bajo cero y 1890 son ejemplos), no una marca.
 */
const MARCAS: Array<{ col: string; id: number }> = [
  { col: 'QUILMES', id: 103 },
  { col: 'BUDWEISER', id: 115 },
  { col: 'CORONA', id: 124 },
  { col: 'RED BULL', id: 118 },
  { col: 'H2OH', id: 112 },
  { col: 'STELLA', id: 108 },      // → STELLA ARTOIS
  { col: 'MICHELOB', id: 126 },    // → MICHELOB ULTRA
  { col: 'BLACK', id: 98 },        // → PEPSI BLACK
  { col: 'AO', id: 110 },          // → ANDES ORIGEN RUBIA
];

// ─── Lectura ────────────────────────────────────────────────────────────────

const libro = X.readFile(ARCHIVO);
const crudas = X.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], {
  header: 1,
  raw: true,
  defval: null,
}) as unknown[][];

const ENC = (crudas[2] as unknown[]).map((v) => String(v ?? '').trim());
const cuerpo = crudas
  .slice(3)
  .filter((f) => f.some((v) => v !== null && v !== ''));

function col(nombre: string): number {
  const i = ENC.indexOf(nombre);
  if (i < 0) throw new Error(`El archivo no tiene la columna "${nombre}". Tiene: ${ENC.join(', ')}`);
  return i;
}

const I = {
  sdv: col('SDV'),
  cliente: col('Cliente'),
  razon: col('Razón Social'),
  flag: col('FLAG ALCOHOL'),
  marcas: MARCAS.map((m) => ({ ...m, i: col(m.col) })),
};

const s = (f: unknown[], i: number): string => String(f[i] ?? '').trim();

// ─── Validación ─────────────────────────────────────────────────────────────

const sinCliente = cuerpo.filter((f) => !s(f, I.cliente)).length;
const marcasFaltantes = MARCAS.filter((m) => !ENC.includes(m.col));

console.log(`\nArchivo: ${cuerpo.length} clientes`);
if (sinCliente) console.log(`  · ${sinCliente} sin Código Cliente`);
if (marcasFaltantes.length) console.log(`  · faltan columnas: ${marcasFaltantes.map((m) => m.col).join(', ')}`);

const porSdv = new Map<string, number>();
for (const f of cuerpo) {
  const k = s(f, I.sdv);
  porSdv.set(k, (porSdv.get(k) ?? 0) + 1);
}
console.log('\nSupervisores en el archivo:');
for (const [k, v] of [...porSdv].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(5)}  ${k || '(sin supervisor)'}`);
}

if (!APLICAR) {
  console.log('\n--dry-run. No se escribió nada. Pasá --aplicar para cargar.\n');
  process.exit(0);
}

// ─── Escritura ──────────────────────────────────────────────────────────────

const db = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function ins(tabla: string, filas: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await (db as any).from(tabla).insert(filas.slice(i, i + LOTE));
    if (error) throw new Error(`${tabla}: ${error.message}`);
    process.stdout.write(`\r  ${tabla}: ${Math.min(i + LOTE, filas.length)}/${filas.length}`);
  }
  if (filas.length) console.log('');
}

// Supervisores: se resuelven por nombre. Los que no están (PERALTA SOLANA se
// agrega en el SQL 23) se insertan acá también por si el SQL todavía no corrió.
console.log('\nResolviendo supervisores…');
const { data: supervisores } = await db.from('supervisores').select('id_supervisor, nombre_completo');
const porNombre = new Map<string, number>(
  (supervisores ?? []).map((x: any) => [String(x.nombre_completo).trim(), x.id_supervisor]),
);
for (const nombre of porSdv.keys()) {
  if (!nombre || porNombre.has(nombre)) continue;
  const { data, error } = await db
    .from('supervisores')
    .insert({ nombre_completo: nombre })
    .select('id_supervisor')
    .single();
  if (error) throw new Error(`supervisores: ${error.message}`);
  porNombre.set(nombre, data.id_supervisor);
  console.log(`  agregado: ${nombre}`);
}

// Cliente existente -> código.
console.log('\nLeyendo clientes…');
const existentes = new Set<string>();
for (let d = 0; d < 20_000; d += 1000) {
  const { data } = await db.from('clientes').select('codigo_cliente').range(d, d + 999);
  if (!data?.length) break;
  for (const c of data) existentes.add(String(c.codigo_cliente).trim());
}
console.log(`  ${existentes.size} clientes ya en la base`);

// ─── Armado ─────────────────────────────────────────────────────────────────

const nuevosClientes: Record<string, unknown>[] = [];
const cartera: Record<string, unknown>[] = [];
const alcohol: Record<string, unknown>[] = [];
const compras: Record<string, unknown>[] = [];

for (const f of cuerpo) {
  const codigo = s(f, I.cliente);
  if (!codigo) continue;

  const sd = s(f, I.sdv);

  if (!existentes.has(codigo)) {
    nuevosClientes.push({ codigo_cliente: codigo, razon_social: s(f, I.razon) });
    existentes.add(codigo);
  }
  cartera.push({
    codigo_cliente: codigo,
    id_supervisor: sd ? (porNombre.get(sd) ?? null) : null,
  });
  alcohol.push({
    codigo_cliente: codigo,
    es_alcohol: s(f, I.flag).toUpperCase().startsWith('S'),
  });
  for (const m of I.marcas) {
    compras.push({ codigo_cliente: codigo, id_marca: m.id, compro: Number(f[m.i]) === 1 });
  }
}

// ─── Carga ──────────────────────────────────────────────────────────────────

console.log(`\nA cargar: ${nuevosClientes.length} clientes nuevos · ${cartera.length} de cartera · ${compras.length} flags`);

// Las tres tablas de la cartera se vacían: la carga es una foto del archivo,
// no un delta. Si se reprocesa el mismo mes, no quedan duplicados.
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

// ─── Verificación ───────────────────────────────────────────────────────────

const { data: resumen } = await db.rpc('fn_supervisores_cartera' as never);
console.log('\n=== Resultado ===');
for (const r of (resumen ?? []) as any[]) {
  console.log(
    `  ${String(r.nombre).padEnd(26)} ${String(r.clientes).padStart(5)} clientes  ` +
    `${String(r.alcohol).padStart(5)} de alcohol  ${String(r.oportunidad).padStart(5)} sin compra`,
  );
}
console.log('\nRecargá la app.');