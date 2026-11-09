/**
 * Importación de cartera (supervisores y promotores) desde el navegador.
 *
 * Porta lo que hacían `scripts/cargar-promotores.ts` y `scripts/cargar-sub-base.ts`,
 * con tres diferencias de fondo:
 *
 *   1. Antes de borrar, **archiva la cartera vigente** en `cartera_historial`
 *      (`supabase/34_cartera_historial.sql`). La cartera no tiene período: es
 *      una foto, y sin el respaldo la foto anterior se perdía.
 *
 *   2. Corre con la sesión del usuario (RLS), no con `service_role`. El borrado
 *      exige `admin` en la base y además se verifica que haya ocurrido: un
 *      `consulta` vería el delete afectar 0 filas sin error y después
 *      duplicaría la cartera.
 *
 *   3. Cada carga queda registrada en `importaciones` (quién, cuándo, cuántas
 *      filas), igual que ventas.
 *
 * El flujo está partido: `validarCartera()` arma el plan sin tocar la base y
 * `cargarCartera()` lo ejecuta. Entre medio, el usuario ve la vista previa.
 */

import { supabase } from '../supabase';
import { configDe } from './config';
import type { HojaCruda } from './leerExcel';
import { crearMarcas, leerMarcasBase } from './marcas';
import { claveNombre } from './nombres';
import {
  abrirImportacion,
  cerrarImportacion,
  esTablaFaltante,
  type Progreso,
} from './importaciones';
import {
  DIAS,
  flagParaBase,
  indicesDe,
  type EstadoCartera,
  type MarcaCartera,
  type PlanCartera,
} from './validarCartera';

const LOTE = 1000;

const db = supabase as unknown as { from: (tabla: string) => any };

const s = (fila: unknown[], i: number): string => (i < 0 ? '' : String(fila[i] ?? '').trim());

export type ResultadoCartera = {
  tipo: 'cartera';
  clientesCartera: number;
  filasAlcohol: number;
  filasProducto: number;
  filasOperativa: number;
  clientesNuevos: number;
  /** Filas de la foto anterior que quedaron guardadas en `cartera_historial`. */
  archivados: number;
  supervisores: Array<{ nombre: string; clientes: number }>;
  flags: Array<{ valor: string; clientes: number }>;
  encargadosActualizados: number;
  encargadosCreados: number;
  /** Marcas que no existían y se crearon con esta carga. */
  marcasCreadas: string[];
  importacionId: number | null;
  duracionMs: number;
};

// ─── Acceso a la base ─────────────────────────────────────────────────────────

async function leerTodas<T>(tabla: string, columnas: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += LOTE) {
    const { data, error } = await db
      .from(tabla)
      .select(columnas)
      .range(desde, desde + LOTE - 1);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    if (lote.length < LOTE) break;
  }
  return filas;
}

async function insertar(tabla: string, filas: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < filas.length; i += LOTE) {
    const { error } = await db.from(tabla).insert(filas.slice(i, i + LOTE));
    if (error) throw new Error(`${tabla}: ${error.message}`);
  }
}

async function insertarYDevolver<T>(
  tabla: string,
  filas: Record<string, unknown>[],
  columnas: string,
): Promise<T[]> {
  const salida: T[] = [];
  for (let i = 0; i < filas.length; i += LOTE) {
    const { data, error } = await db
      .from(tabla)
      .insert(filas.slice(i, i + LOTE))
      .select(columnas);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    salida.push(...((data ?? []) as T[]));
  }
  return salida;
}

async function contar(tabla: string): Promise<number> {
  const { count, error } = await db
    .from(tabla)
    .select('codigo_cliente', { count: 'exact', head: true });
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return count ?? 0;
}

// ─── Lectura del estado actual ────────────────────────────────────────────────

/**
 * Foto liviana para la vista previa: qué supervisor tiene hoy cada cliente y
 * qué encargados existen. Devuelve `null` si no se puede leer, para que la
 * validación siga funcionando sin comparación.
 */
export async function leerEstadoCartera(): Promise<EstadoCartera | null> {
  try {
    const [cartera, supervisores, encargados, marcas] = await Promise.all([
      leerTodas<{ codigo_cliente: string; id_supervisor: number | null }>(
        'supervisores_cartera',
        'codigo_cliente, id_supervisor',
      ),
      leerTodas<{ id_supervisor: number; nombre_completo: string }>(
        'supervisores',
        'id_supervisor, nombre_completo',
      ),
      leerTodas<{ codigo_sector_venta: string; nombre_completo: string }>(
        'encargados_ventas',
        'codigo_sector_venta, nombre_completo',
      ),
      leerMarcasBase(),
    ]);

    const nombreSupervisor = new Map(
      supervisores.map((r) => [Number(r.id_supervisor), String(r.nombre_completo).trim()]),
    );

    return {
      porCliente: new Map(
        cartera.map((r) => [
          String(r.codigo_cliente).trim(),
          r.id_supervisor === null
            ? null
            : (nombreSupervisor.get(Number(r.id_supervisor)) ?? `Supervisor ${r.id_supervisor}`),
        ]),
      ),
      supervisores: new Map(
        supervisores.map((r) => [
          claveNombre(r.nombre_completo),
          String(r.nombre_completo).trim(),
        ]),
      ),
      encargados: new Map(
        encargados.map((r) => [
          String(r.codigo_sector_venta).trim(),
          String(r.nombre_completo).trim(),
        ]),
      ),
      marcas,
    };
  } catch {
    return null;
  }
}

type FilaHistorial = {
  id_importacion: number | null;
  codigo_cliente: string;
  id_supervisor: number | null;
  nombre_supervisor: string | null;
  codigo_encargado: string | null;
  nombre_encargado: string | null;
  flag_estado: string | null;
  subcanal: string | null;
  tier: string | null;
  visitas: string[];
  tarea_redbull: boolean;
  tarea_laton: boolean;
  tarea_cvza: boolean;
  marcas: string[];
};

/**
 * Arma la foto completa de la cartera vigente, tal como está en la base.
 *
 * Se leen las cuatro tablas y se unen por `codigo_cliente`. Se incluye cualquier
 * cliente que aparezca en al menos una, para no perder nada al archivar.
 */
async function leerSnapshotActual(idImportacion: number | null): Promise<FilaHistorial[]> {
  const [cartera, alcohol, operativa, producto, supervisores, encargados, marcas] =
    await Promise.all([
      leerTodas<{ codigo_cliente: string; id_supervisor: number | null }>(
        'supervisores_cartera',
        'codigo_cliente, id_supervisor',
      ),
      leerAlcohol(),
      leerTodas<{
        codigo_cliente: string;
        id_encargado_venta: number | null;
        visitas: string[] | null;
        subcanal: string | null;
        tier: string | null;
        tarea_redbull: boolean;
        tarea_laton: boolean;
        tarea_cvza: boolean;
      }>(
        'clientes_operativa',
        'codigo_cliente, id_encargado_venta, visitas, subcanal, tier, tarea_redbull, tarea_laton, tarea_cvza',
      ),
      leerTodas<{ codigo_cliente: string; id_marca: number; compro: boolean }>(
        'cliente_producto',
        'codigo_cliente, id_marca, compro',
      ),
      leerTodas<{ id_supervisor: number; nombre_completo: string }>(
        'supervisores',
        'id_supervisor, nombre_completo',
      ),
      leerTodas<{ id_encargado_venta: number; codigo_sector_venta: string; nombre_completo: string }>(
        'encargados_ventas',
        'id_encargado_venta, codigo_sector_venta, nombre_completo',
      ),
      leerTodas<{ id_marca: number; nombre: string }>('marcas', 'id_marca, nombre'),
    ]);

  const nombreSupervisor = new Map(
    supervisores.map((r) => [Number(r.id_supervisor), String(r.nombre_completo).trim()]),
  );
  const datosEncargado = new Map(
    encargados.map((r) => [
      Number(r.id_encargado_venta),
      {
        codigo: String(r.codigo_sector_venta).trim(),
        nombre: String(r.nombre_completo).trim(),
      },
    ]),
  );
  const nombreMarca = new Map(
    marcas.map((r) => [Number(r.id_marca), String(r.nombre).trim()]),
  );

  const filas = new Map<string, FilaHistorial>();

  function filaDe(codigo: string): FilaHistorial {
    let fila = filas.get(codigo);
    if (!fila) {
      fila = {
        id_importacion: idImportacion,
        codigo_cliente: codigo,
        id_supervisor: null,
        nombre_supervisor: null,
        codigo_encargado: null,
        nombre_encargado: null,
        flag_estado: null,
        subcanal: null,
        tier: null,
        visitas: [],
        tarea_redbull: false,
        tarea_laton: false,
        tarea_cvza: false,
        marcas: [],
      };
      filas.set(codigo, fila);
    }
    return fila;
  }

  for (const r of cartera) {
    const fila = filaDe(String(r.codigo_cliente).trim());
    fila.id_supervisor = r.id_supervisor === null ? null : Number(r.id_supervisor);
    fila.nombre_supervisor =
      r.id_supervisor === null
        ? null
        : (nombreSupervisor.get(Number(r.id_supervisor)) ?? null);
  }

  for (const r of alcohol) {
    const fila = filaDe(String(r.codigo_cliente).trim());
    fila.flag_estado = r.flag_estado ?? (r.es_alcohol ? 'SI' : 'NO');
  }

  for (const r of operativa) {
    const fila = filaDe(String(r.codigo_cliente).trim());
    const enc = r.id_encargado_venta === null ? null : datosEncargado.get(Number(r.id_encargado_venta));
    fila.codigo_encargado = enc?.codigo ?? null;
    fila.nombre_encargado = enc?.nombre ?? null;
    fila.visitas = r.visitas ?? [];
    fila.subcanal = r.subcanal;
    fila.tier = r.tier;
    fila.tarea_redbull = Boolean(r.tarea_redbull);
    fila.tarea_laton = Boolean(r.tarea_laton);
    fila.tarea_cvza = Boolean(r.tarea_cvza);
  }

  for (const r of producto) {
    if (!r.compro) continue;
    const fila = filaDe(String(r.codigo_cliente).trim());
    const nombre = nombreMarca.get(Number(r.id_marca));
    if (nombre) fila.marcas.push(nombre);
  }

  for (const fila of filas.values()) fila.marcas.sort((a, b) => a.localeCompare(b, 'es'));

  return [...filas.values()];
}

/**
 * `cliente_alcohol.flag_estado` existe desde el SQL 32. Si todavía no se corrió,
 * se cae al boolean `es_alcohol` en vez de romper el respaldo.
 */
async function leerAlcohol(): Promise<
  Array<{ codigo_cliente: string; es_alcohol?: boolean; flag_estado?: string }>
> {
  try {
    return await leerTodas('cliente_alcohol', 'codigo_cliente, es_alcohol, flag_estado');
  } catch {
    return leerTodas('cliente_alcohol', 'codigo_cliente, es_alcohol');
  }
}

// ─── Carga ────────────────────────────────────────────────────────────────────

export async function cargarCartera(
  hoja: HojaCruda,
  plan: PlanCartera,
  onProgreso: (p: Progreso) => void,
): Promise<ResultadoCartera> {
  const inicio = Date.now();

  if (!plan.valido) throw new Error('El archivo tiene errores y no se puede cargar.');

  const config = configDe(plan.tipo);
  const I = indicesDe(hoja.encabezado, config);

  // Mismo criterio que la validación: sin código no hay fila, y el primero que
  // aparece gana (la PK de las tablas es codigo_cliente).
  const vistos = new Set<string>();
  const filas: unknown[][] = [];
  for (const fila of hoja.filas) {
    const codigo = s(fila, I.cliente);
    if (!codigo || vistos.has(codigo)) continue;
    vistos.add(codigo);
    filas.push(fila);
  }
  if (!filas.length) throw new Error('No hay filas válidas para cargar.');

  // ── Permisos y SQL requerido ───────────────────────────────────────────────
  const { data: esAdmin, error: errAdmin } = await supabase.rpc('es_admin');
  if (errAdmin) throw new Error(`No se pudo verificar el rol: ${errAdmin.message}`);
  if (!esAdmin) throw new Error('La carga requiere rol administrador.');

  const probeHistorial = await db.from('cartera_historial').select('id_historial').limit(1);
  if (probeHistorial.error && esTablaFaltante(probeHistorial.error)) {
    throw new Error(
      'Falta la tabla cartera_historial. Ejecutá supabase/33_importaciones.sql y después ' +
        'supabase/34_cartera_historial.sql en el SQL Editor y volvé a intentar.',
    );
  }

  const importacionId = await abrirImportacion(plan.tipo, plan.archivo);

  try {
    // ── 0. Marcas nuevas que trae el archivo ────────────────────────────────
    // La vista previa las detectó sin escribir; acá se crean una sola vez y se
    // reemplazan los ids nulos del plan por los reales.
    let marcasCreadas: string[] = [];
    let marcas = plan.marcas;
    if (plan.marcasNuevas.length) {
      onProgreso({
        fase: 'dimensiones',
        mensaje: `Creando ${plan.marcasNuevas.length} marca(s) nueva(s)…`,
      });
      const creadas = await crearMarcas(
        plan.marcasNuevas.map((m) => ({ nombre: m.nombre, esAlcohol: m.esAlcohol })),
      );
      marcasCreadas = creadas.map((m) => m.nombre);

      const idPorClave = new Map(
        creadas.map((m) => [
          m.nombre
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/\s+/g, ' ')
            .trim(),
          m.id_marca,
        ]),
      );
      marcas = plan.marcas.map((m) => {
        if (m.id !== null) return m;
        const id =
          idPorClave.get(
            m.nombre
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .toUpperCase()
              .replace(/\s+/g, ' ')
              .trim(),
          ) ?? null;
        return { ...m, id };
      });
    }
    const indices = indicesDe(hoja.encabezado, config, marcas);
    // Sólo las marcas con id: si una no se pudo crear, se omite su columna.
    const indicesMarcas = indices.marcas.filter(
      (m): m is MarcaCartera & { id: number; i: number } => m.id !== null,
    );

    // ── 1. Respaldo de la foto vigente ──────────────────────────────────────
    onProgreso({
      fase: 'respaldo',
      mensaje: 'Leyendo la cartera actual para archivarla…',
    });
    const snapshot = await leerSnapshotActual(importacionId);

    if (snapshot.length) {
      onProgreso({
        fase: 'respaldo',
        mensaje: `Archivando ${snapshot.length.toLocaleString('es-AR')} clientes de la foto anterior…`,
        actual: snapshot.length,
        total: snapshot.length,
      });
      await insertar('cartera_historial', snapshot);
    }

    // ── 2. Supervisores get-or-create ───────────────────────────────────────
    // La clave es el nombre normalizado: "EDUARDO FERNANDEZ" del archivo tiene
    // que encontrar a "FERNANDEZ EDUARDO" de la base. Si no existe, se crea con
    // el nombre tal como viene en el archivo.
    const nombresSupervisor = [
      ...new Set(filas.map((f) => s(f, I.sdv)).filter(Boolean)),
    ];
    const existentesSupervisor = await leerTodas<{ id_supervisor: number; nombre_completo: string }>(
      'supervisores',
      'id_supervisor, nombre_completo',
    );
    const idSupervisor = new Map(
      existentesSupervisor.map((r) => [
        claveNombre(r.nombre_completo),
        Number(r.id_supervisor),
      ]),
    );

    const supervisoresNuevos = nombresSupervisor.filter((n) => !idSupervisor.has(claveNombre(n)));
    if (supervisoresNuevos.length) {
      const nuevos = await insertarYDevolver<{ id_supervisor: number; nombre_completo: string }>(
        'supervisores',
        supervisoresNuevos.map((nombre) => ({ nombre_completo: nombre })),
        'id_supervisor, nombre_completo',
      );
      for (const r of nuevos) {
        idSupervisor.set(claveNombre(r.nombre_completo), Number(r.id_supervisor));
      }
    }

    // ── 3. Clientes nuevos ──────────────────────────────────────────────────
    const existentesCliente = await leerTodas<{ codigo_cliente: string }>(
      'clientes',
      'codigo_cliente',
    );
    const codigosCliente = new Set(
      existentesCliente.map((r) => String(r.codigo_cliente).trim()),
    );

    const clientesNuevos: Record<string, unknown>[] = [];
    for (const fila of filas) {
      const codigo = s(fila, I.cliente);
      if (codigosCliente.has(codigo)) continue;
      codigosCliente.add(codigo);
      clientesNuevos.push({
        codigo_cliente: codigo,
        razon_social: s(fila, I.razon) || codigo,
      });
    }
    if (clientesNuevos.length) {
      onProgreso({
        fase: 'cartera',
        mensaje: `Agregando ${clientesNuevos.length} clientes nuevos…`,
      });
      await insertar('clientes', clientesNuevos);
    }

    // ── 4. Encargados → supervisor según «Vnd.» ─────────────────────────────
    const existentesEncargado = await leerTodas<{
      id_encargado_venta: number;
      codigo_sector_venta: string;
      nombre_completo: string;
      id_supervisor: number | null;
    }>(
      'encargados_ventas',
      'id_encargado_venta, codigo_sector_venta, nombre_completo, id_supervisor',
    );
    const encargadoPorCodigo = new Map(
      existentesEncargado.map((r) => [String(r.codigo_sector_venta).trim(), r]),
    );

    const vndDe = new Map<string, { sdv: string; nombre: string }>();
    for (const fila of filas) {
      const codigo = s(fila, I.vnd);
      if (!codigo || vndDe.has(codigo)) continue;
      vndDe.set(codigo, {
        sdv: s(fila, I.sdv),
        nombre: s(fila, I.promotor) || s(fila, I.descVendedor),
      });
    }

    let encargadosActualizados = 0;
    let encargadosCreados = 0;

    for (const [codigo, datos] of vndDe) {
      const idSup = datos.sdv ? (idSupervisor.get(claveNombre(datos.sdv)) ?? null) : null;
      const existente = encargadoPorCodigo.get(codigo);

      if (existente) {
        if (existente.id_supervisor === idSup) continue;
        const { error } = await db
          .from('encargados_ventas')
          .update({ id_supervisor: idSup })
          .eq('id_encargado_venta', existente.id_encargado_venta);
        if (error) throw new Error(`encargados_ventas: ${error.message}`);
        encargadosActualizados++;
        continue;
      }

      // Sin nombre no se puede crear: si el archivo sólo trae el código «Vnd.»,
      // esos clientes quedan sin encargado y se avisa antes de cargar.
      if (!datos.nombre) continue;

      const [creado] = await insertarYDevolver<{
        id_encargado_venta: number;
        codigo_sector_venta: string;
      }>(
        'encargados_ventas',
        [{ codigo_sector_venta: codigo, nombre_completo: datos.nombre, id_supervisor: idSup }],
        'id_encargado_venta, codigo_sector_venta',
      );
      encargadoPorCodigo.set(codigo, {
        id_encargado_venta: Number(creado.id_encargado_venta),
        codigo_sector_venta: codigo,
        nombre_completo: datos.nombre,
        id_supervisor: idSup,
      });
      encargadosCreados++;
    }

    // ── 5. Borrado de la cartera anterior, con verificación ─────────────────
    const tablasCartera = [
      'supervisores_cartera',
      'cliente_alcohol',
      'cliente_producto',
      'clientes_operativa',
    ];

    const antes = await Promise.all(tablasCartera.map(contar));

    onProgreso({
      fase: 'borrado',
      mensaje: 'Reemplazando la cartera anterior…',
    });

    for (const tabla of tablasCartera) {
      const { error } = await db
        .from(tabla)
        .delete()
        .neq('codigo_cliente', '__ninguno__');
      if (error) {
        throw new Error(
          error.message.toLowerCase().includes('permission')
            ? `No tenés permiso para reemplazar la cartera (${tabla}). La carga requiere rol administrador.`
            : `${tabla} (borrado): ${error.message}`,
        );
      }
    }

    const despues = await Promise.all(tablasCartera.map(contar));
    const quedaron = tablasCartera.filter((_, i) => despues[i] > 0);
    if (quedaron.length) {
      throw new Error(
        `No se pudieron borrar todas las filas anteriores (${quedaron.join(', ')}). ` +
          'La carga se detuvo antes de insertar. ¿Tenés rol administrador?',
      );
    }

    // ── 6. Armado e inserción ───────────────────────────────────────────────
    const cartera: Record<string, unknown>[] = [];
    const alcohol: Record<string, unknown>[] = [];
    const compras: Record<string, unknown>[] = [];
    const operativa: Record<string, unknown>[] = [];

    for (const fila of filas) {
      const codigo = s(fila, I.cliente);
      const sdv = s(fila, I.sdv);
      const flagEstado = flagParaBase(s(fila, I.flag));

      cartera.push({
        codigo_cliente: codigo,
        id_supervisor: sdv ? (idSupervisor.get(claveNombre(sdv)) ?? null) : null,
      });

      alcohol.push({
        codigo_cliente: codigo,
        es_alcohol: flagEstado === 'SI',
        flag_estado: flagEstado,
      });

      const encargado = encargadoPorCodigo.get(s(fila, I.vnd));

      const visitas = s(fila, I.visitas)
        .split(/\s+/)
        .filter(Boolean)
        .map((d) => d.toUpperCase())
        .filter((d) => DIAS.includes(d));

      operativa.push({
        codigo_cliente: codigo,
        id_encargado_venta: encargado?.id_encargado_venta ?? null,
        visitas,
        subcanal: s(fila, I.subcanal) || null,
        tier:
          s(fila, I.tierA).toUpperCase() === 'SI'
            ? 'A'
            : s(fila, I.tierB).toUpperCase() === 'SI'
              ? 'B'
              : null,
        tarea_redbull: s(fila, I.tareaRedBull) !== '',
        tarea_laton: s(fila, I.tareaLaton) !== '',
        tarea_cvza: s(fila, I.tareaCvza) !== '',
      });

      for (const marca of indicesMarcas) {
        compras.push({
          codigo_cliente: codigo,
          id_marca: marca.id,
          compro: Number(fila[marca.i]) === 1,
        });
      }
    }

    const insertarConProgreso = async (
      tabla: string,
      datos: Record<string, unknown>[],
      fase: Progreso['fase'],
      etiqueta: string,
    ) => {
      for (let i = 0; i < datos.length; i += LOTE) {
        const { error } = await db.from(tabla).insert(datos.slice(i, i + LOTE));
        if (error) throw new Error(`${tabla}: ${error.message}`);
        onProgreso({
          fase,
          mensaje: `Insertando ${etiqueta}…`,
          actual: Math.min(i + LOTE, datos.length),
          total: datos.length,
        });
      }
    };

    await insertarConProgreso('supervisores_cartera', cartera, 'cartera', 'cartera');
    await insertarConProgreso('cliente_alcohol', alcohol, 'alcohol', 'flags de alcohol');
    await insertarConProgreso('cliente_producto', compras, 'producto', 'matriz de marcas');
    await insertarConProgreso('clientes_operativa', operativa, 'operativa', 'datos operativos');

    // ── 7. Cierre de la auditoría ───────────────────────────────────────────
    await cerrarImportacion(importacionId, {
      estado: 'ok',
      filasOk: filas.length,
      filasDescartadas: plan.descartadas.length,
      detalle: {
        supervisores: plan.supervisores,
        flags: plan.flags,
        clientesNuevos: clientesNuevos.length,
        archivados: snapshot.length,
        encargadosActualizados,
        encargadosCreados,
        columnasSinDestino: plan.columnasSinDestino,
        marcasCreadas,
      },
    });

    return {
      tipo: plan.tipo,
      clientesCartera: cartera.length,
      filasAlcohol: alcohol.length,
      filasProducto: compras.length,
      filasOperativa: operativa.length,
      clientesNuevos: clientesNuevos.length,
      archivados: snapshot.length,
      supervisores: plan.supervisores,
      flags: plan.flags.map((f) => ({ valor: f.etiqueta, clientes: f.clientes })),
      encargadosActualizados,
      encargadosCreados,
      marcasCreadas,
      importacionId,
      duracionMs: Date.now() - inicio,
    };
  } catch (e) {
    await cerrarImportacion(importacionId, {
      estado: 'error',
      filasDescartadas: plan.descartadas.length,
      error: e instanceof Error ? e.message : 'Error inesperado',
    });
    throw e;
  }
}
