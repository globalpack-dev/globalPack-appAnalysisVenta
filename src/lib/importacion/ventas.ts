/**
 * Importación de «Base ventas.xlsx» desde el navegador.
 *
 * Porta la lógica de `scripts/cargar-excel.ts` con dos diferencias de fondo:
 *
 *   1. El script era de una sola vez: vaciaba 13 tablas y volvía a cargar todo.
 *      Acá se reemplazan **sólo las ventas de los períodos que trae el archivo**
 *      y las dimensiones se resuelven con get-or-create. Cargar octubre no puede
 *      borrar septiembre.
 *
 *   2. Corre con la sesión del usuario (RLS), no con `service_role`. El botón ya
 *      está restringido a `admin`, y el borrado es la única operación que RLS
 *      limita a ese rol.
 *
 * El flujo está partido a propósito:
 *
 *   validarVentas()  → lee y arma un plan SIN tocar la base (vista previa)
 *   cargarVentas()   → ejecuta ese plan
 *
 * Así el usuario ve los errores antes de que se borre nada.
 */

import { supabase } from '../supabase';
import type { HojaCruda } from './leerExcel';
import {
  abrirImportacion,
  cerrarImportacion,
  type Progreso,
} from './importaciones';
import {
  MESES,
  claveClasificacion,
  indicesDe,
  motivoDescarte,
  normalizarSupervisor,
  parsePeriodo,
  primeros,
  type PlanVentas,
} from './validarVentas';

const LOTE = 1000;

const s = (fila: unknown[], i: number): string => String(fila[i] ?? '').trim();

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// La validación pura vive en `validarVentas.ts`; se reexporta para que el modal
// y el hook sigan importando todo desde este módulo.
export { validarVentas } from './validarVentas';
export type { FilaDescartada, PeriodoDetectado, PlanVentas } from './validarVentas';
export type { Progreso } from './importaciones';

export type ResultadoVentas = {
  ventasInsertadas: number;
  periodos: string[];
  dimensionesCreadas: Record<string, number>;
  duracionMs: number;
};

// ─── Acceso a la base ─────────────────────────────────────────────────────────

/** Cliente sin tipar: las tablas de dimensión no tienen tipos de `Insert`. */
const db = supabase as unknown as { from: (tabla: string) => any };

/**
 * Nombres de las marcas que ya existen. La vista previa de ventas los usa para
 * detectar marcas nuevas sin escribir nada.
 */
export async function leerMarcasExistentes(): Promise<string[]> {
  try {
    const filas = await leerTodas<{ nombre: string }>('marcas', 'nombre');
    return filas.map((r) => String(r.nombre ?? '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

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

async function insertar<T>(tabla: string, filas: T[]): Promise<void> {
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

async function resolverPorNombre(
  tabla: string,
  pk: string,
  campo: string,
  nombres: string[],
  creadas: Record<string, number>,
): Promise<Map<string, number>> {
  const existentes = await leerTodas<Record<string, any>>(tabla, `${pk}, ${campo}`);
  const mapa = new Map<string, number>(
    existentes.map((r) => [String(r[campo] ?? '').trim(), Number(r[pk])]),
  );

  const faltantes = [...new Set(nombres.map((v) => v.trim()))].filter((v) => !mapa.has(v));
  if (faltantes.length) {
    const nuevos = await insertarYDevolver<Record<string, any>>(
      tabla,
      faltantes.map((nombre) => ({ [campo]: nombre })),
      `${pk}, ${campo}`,
    );
    for (const r of nuevos) mapa.set(String(r[campo] ?? '').trim(), Number(r[pk]));
    creadas[tabla] = faltantes.length;
  }

  return mapa;
}

// ─── Carga ────────────────────────────────────────────────────────────────────

export async function cargarVentas(
  hoja: HojaCruda,
  plan: PlanVentas,
  onProgreso: (p: Progreso) => void,
): Promise<ResultadoVentas> {
  const inicio = Date.now();

  if (!plan.valido) throw new Error('El archivo tiene errores y no se puede cargar.');

  const I = indicesDe(hoja.encabezado);
  const filas = hoja.filas.filter((f) => motivoDescarte(f, I) === null);
  if (!filas.length) throw new Error('No hay filas válidas para cargar.');

  const creadas: Record<string, number> = {};
  const paso = (mensaje: string) => onProgreso({ fase: 'dimensiones', mensaje });

  // ── Dimensiones simples ────────────────────────────────────────────────────
  const uSucursal = [...primeros(filas, (f) => s(f, I.sucursal)).keys()];
  paso('Resolviendo sucursales…');
  const idSucursal = await resolverPorNombre('sucursales', 'id_sucursal', 'nombre', uSucursal, creadas);

  const uLocalidad = [...primeros(filas, (f) => s(f, I.localidad)).keys()];
  paso('Resolviendo localidades…');
  const idLocalidad = await resolverPorNombre('localidades', 'id_localidad', 'nombre', uLocalidad, creadas);

  const uMarca = [...primeros(filas, (f) => s(f, I.marca)).keys()];
  paso('Resolviendo marcas…');
  const idMarca = await resolverPorNombre('marcas', 'id_marca', 'nombre', uMarca, creadas);

  const uUnidad = [...primeros(filas, (f) => s(f, I.unidad)).keys()];
  paso('Resolviendo unidades de negocio…');
  const idUnidad = await resolverPorNombre(
    'unidades_negocio',
    'id_unidad_negocio',
    'nombre',
    uUnidad,
    creadas,
  );

  const uCalibre = [...primeros(filas, (f) => s(f, I.calibre)).keys()];
  paso('Resolviendo calibres…');
  const idCalibre = await resolverPorNombre('calibres', 'id_calibre', 'nombre', uCalibre, creadas);

  // ── Divisiones: cuelgan de la unidad de negocio ───────────────────────────
  const uDivision = primeros(filas, (f) => s(f, I.division));
  paso('Resolviendo divisiones…');
  const existentesDivision = await leerTodas<Record<string, any>>(
    'divisiones',
    'id_division, nombre',
  );
  const idDivision = new Map<string, number>(
    existentesDivision.map((r) => [String(r.nombre ?? '').trim(), Number(r.id_division)]),
  );
  const divisionesNuevas = [...uDivision.keys()].filter((k) => !idDivision.has(k));
  if (divisionesNuevas.length) {
    const nuevas = await insertarYDevolver<Record<string, any>>(
      'divisiones',
      divisionesNuevas.map((nombre) => ({
        nombre,
        id_unidad_negocio: idUnidad.get(s(uDivision.get(nombre)!, I.unidad)) ?? null,
      })),
      'id_division, nombre',
    );
    for (const r of nuevas) idDivision.set(String(r.nombre ?? '').trim(), Number(r.id_division));
    creadas.divisiones = divisionesNuevas.length;
  }

  // ── Familias: sin división (la división vive en el producto) ──────────────
  const uFamilia = [...primeros(filas, (f) => s(f, I.familia)).keys()];
  paso('Resolviendo familias…');
  const existentesFamilia = await leerTodas<Record<string, any>>('familias', 'id_familia, nombre');
  const idFamilia = new Map<string, number>(
    existentesFamilia.map((r) => [String(r.nombre ?? '').trim(), Number(r.id_familia)]),
  );
  const familiasNuevas = uFamilia.filter((k) => !idFamilia.has(k));
  if (familiasNuevas.length) {
    const nuevas = await insertarYDevolver<Record<string, any>>(
      'familias',
      familiasNuevas.map((nombre) => ({ nombre, id_division: null })),
      'id_familia, nombre',
    );
    for (const r of nuevas) idFamilia.set(String(r.nombre ?? '').trim(), Number(r.id_familia));
    creadas.familias = familiasNuevas.length;
  }

  // ── Supervisores ──────────────────────────────────────────────────────────
  const uSup = [...primeros(filas, (f) => normalizarSupervisor(f[I.sectorSup])).keys()];
  paso('Resolviendo supervisores…');
  const idSupervisor = await resolverPorNombre(
    'supervisores',
    'id_supervisor',
    'nombre_completo',
    uSup,
    creadas,
  );

  // ── Encargados: la clave es el código de sector de venta ──────────────────
  const uEncargado = primeros(filas, (f) => s(f, I.codSector));
  paso('Resolviendo encargados de venta…');
  const existentesEncargado = await leerTodas<Record<string, any>>(
    'encargados_ventas',
    'id_encargado_venta, codigo_sector_venta',
  );
  const idEncargado = new Map<string, number>(
    existentesEncargado.map((r) => [
      String(r.codigo_sector_venta ?? '').trim(),
      Number(r.id_encargado_venta),
    ]),
  );
  const encargadosNuevos = [...uEncargado.keys()].filter((k) => !idEncargado.has(k));
  if (encargadosNuevos.length) {
    const nuevos = await insertarYDevolver<Record<string, any>>(
      'encargados_ventas',
      encargadosNuevos.map((codigo) => {
        const fila = uEncargado.get(codigo)!;
        return {
          codigo_sector_venta: codigo,
          nombre_completo: s(fila, I.sector),
          id_supervisor: idSupervisor.get(normalizarSupervisor(fila[I.sectorSup])) ?? null,
        };
      }),
      'id_encargado_venta, codigo_sector_venta',
    );
    for (const r of nuevos) {
      idEncargado.set(String(r.codigo_sector_venta ?? '').trim(), Number(r.id_encargado_venta));
    }
    creadas.encargados_ventas = encargadosNuevos.length;
  }

  // ── Clientes ──────────────────────────────────────────────────────────────
  const uCliente = primeros(filas, (f) => s(f, I.codCliente));
  paso('Resolviendo clientes…');
  const existentesCliente = await leerTodas<Record<string, any>>(
    'clientes',
    'id_cliente, codigo_cliente',
  );
  const idCliente = new Map<string, number>(
    existentesCliente.map((r) => [String(r.codigo_cliente ?? '').trim(), Number(r.id_cliente)]),
  );
  const clientesNuevos = [...uCliente.keys()].filter((k) => !idCliente.has(k));
  if (clientesNuevos.length) {
    const nuevos = await insertarYDevolver<Record<string, any>>(
      'clientes',
      clientesNuevos.map((codigo) => {
        const fila = uCliente.get(codigo)!;
        return {
          codigo_cliente: codigo,
          razon_social: s(fila, I.cliente),
          nombre_fantasia: s(fila, I.fantasia) || null,
          id_localidad: idLocalidad.get(s(fila, I.localidad)) ?? null,
        };
      }),
      'id_cliente, codigo_cliente',
    );
    for (const r of nuevos) {
      idCliente.set(String(r.codigo_cliente ?? '').trim(), Number(r.id_cliente));
    }
    creadas.clientes = clientesNuevos.length;
  }

  // ── Productos ─────────────────────────────────────────────────────────────
  const uProducto = primeros(filas, (f) => s(f, I.codProducto));
  paso('Resolviendo productos…');
  const existentesProducto = await leerTodas<Record<string, any>>(
    'productos',
    'id_producto, codigo_producto',
  );
  const idProducto = new Map<string, number>(
    existentesProducto.map((r) => [String(r.codigo_producto ?? '').trim(), Number(r.id_producto)]),
  );
  const productosNuevos = [...uProducto.keys()].filter((k) => !idProducto.has(k));
  if (productosNuevos.length) {
    const nuevos = await insertarYDevolver<Record<string, any>>(
      'productos',
      productosNuevos.map((codigo) => {
        const fila = uProducto.get(codigo)!;
        return {
          codigo_producto: codigo,
          nombre: s(fila, I.producto),
          id_marca: idMarca.get(s(fila, I.marca)) ?? null,
          id_calibre: idCalibre.get(s(fila, I.calibre)) ?? null,
          id_familia: idFamilia.get(s(fila, I.familia))!,
          id_division: idDivision.get(s(fila, I.division)) ?? null,
        };
      }),
      'id_producto, codigo_producto',
    );
    for (const r of nuevos) {
      idProducto.set(String(r.codigo_producto ?? '').trim(), Number(r.id_producto));
    }
    creadas.productos = productosNuevos.length;
  }

  // ── Clasificaciones de marketing: combinación de 4 columnas ───────────────
  const uClasif = primeros(filas, (f) => claveClasificacion(f, I));
  paso('Resolviendo clasificaciones de marketing…');
  const existentesClasif = await leerTodas<Record<string, any>>(
    'clasificaciones_marketing',
    'id_clasificacion_marketing, canal_ajustado, segmento_mkt, canal_mkt, subcanal_mkt',
  );
  const claveDe = (r: Record<string, any>) =>
    [
      String(r.canal_ajustado ?? ''),
      String(r.segmento_mkt ?? ''),
      String(r.canal_mkt ?? ''),
      String(r.subcanal_mkt ?? ''),
    ].join('|');
  const idClasif = new Map<string, number>(
    existentesClasif.map((r) => [claveDe(r), Number(r.id_clasificacion_marketing)]),
  );
  const clasifNuevas = [...uClasif.keys()].filter((k) => !idClasif.has(k));
  if (clasifNuevas.length) {
    const nuevas = await insertarYDevolver<Record<string, any>>(
      'clasificaciones_marketing',
      clasifNuevas.map((k) => {
        const [ca, sg, cm, sc] = k.split('|');
        return {
          canal_ajustado: ca || null,
          segmento_mkt: sg || null,
          canal_mkt: cm || null,
          subcanal_mkt: sc || null,
        };
      }),
      'id_clasificacion_marketing, canal_ajustado, segmento_mkt, canal_mkt, subcanal_mkt',
    );
    for (const r of nuevas) idClasif.set(claveDe(r), Number(r.id_clasificacion_marketing));
    creadas.clasificaciones_marketing = clasifNuevas.length;
  }

  // ── Períodos ──────────────────────────────────────────────────────────────
  paso('Resolviendo períodos…');
  const existentesPeriodo = await leerTodas<Record<string, any>>(
    'periodos',
    'id_periodo, anio, mes',
  );
  const idPeriodo = new Map<string, number>(
    existentesPeriodo.map((r) => [`${r.anio}/${r.mes}`, Number(r.id_periodo)]),
  );
  const periodosNuevos = plan.periodos.filter((p) => !idPeriodo.has(`${p.anio}/${p.mes}`));
  if (periodosNuevos.length) {
    const nuevos = await insertarYDevolver<Record<string, any>>(
      'periodos',
      periodosNuevos.map((p) => ({
        anio: p.anio,
        mes: p.mes,
        nombre_mes: MESES[p.mes - 1],
      })),
      'id_periodo, anio, mes',
    );
    for (const r of nuevos) idPeriodo.set(`${r.anio}/${r.mes}`, Number(r.id_periodo));
    creadas.periodos = periodosNuevos.length;
  }

  // ── Reemplazo de las ventas del período ───────────────────────────────────
  const idsPeriodo = plan.periodos.map((p) => idPeriodo.get(`${p.anio}/${p.mes}`)!);
  const etiquetas = plan.periodos.map((p) => p.etiqueta);

  // Doble control de permisos. RLS deja insertar a cualquier autenticado y sólo
  // limita el delete: sin esta verificación, un usuario `consulta` vería el
  // borrado afectar 0 filas sin error y la inserción duplicaría el período.
  const { data: esAdmin, error: errAdmin } = await supabase.rpc('es_admin');
  if (errAdmin) throw new Error(`No se pudo verificar el rol: ${errAdmin.message}`);
  if (!esAdmin) throw new Error('La carga requiere rol administrador.');

  const importacionId = await abrirImportacion('ventas', plan.archivo);

  try {
    onProgreso({
      fase: 'borrado',
      mensaje: `Reemplazando las ventas de ${etiquetas.join(', ')}…`,
    });

    const { count: existentes, error: errConteo } = await supabase
      .from('ventas')
      .select('id_venta', { count: 'exact', head: true })
      .in('id_periodo', idsPeriodo);
    if (errConteo) {
      throw new Error(`No se pudieron contar las ventas del período: ${errConteo.message}`);
    }

    const { error: errBorrado } = await supabase
      .from('ventas')
      .delete()
      .in('id_periodo', idsPeriodo);
    if (errBorrado) {
      throw new Error(
        errBorrado.message.includes('permission')
          ? 'No tenés permiso para reemplazar ventas. La carga requiere rol administrador.'
          : `No se pudieron borrar las ventas anteriores: ${errBorrado.message}`,
      );
    }

    // Si había filas y siguen estando, el delete no se aplicó: se corta ANTES de
    // insertar para no dejar el período duplicado.
    if ((existentes ?? 0) > 0) {
      const { count: quedan, error: errQuedan } = await supabase
        .from('ventas')
        .select('id_venta', { count: 'exact', head: true })
        .in('id_periodo', idsPeriodo);
      if (errQuedan) throw new Error(`No se pudo verificar el borrado: ${errQuedan.message}`);
      if ((quedan ?? 0) > 0) {
        throw new Error(
          'No se pudieron borrar las ventas del período (¿permisos?). La carga se detuvo antes de insertar.',
        );
      }
    }

    // ── Armado e inserción de ventas ────────────────────────────────────────
    const ventas = filas.map((fila) => {
      const p = parsePeriodo(fila[I.periodo])!;
      return {
        id_periodo: idPeriodo.get(`${p.anio}/${p.mes}`)!,
        id_cliente: idCliente.get(s(fila, I.codCliente))!,
        id_sucursal: idSucursal.get(s(fila, I.sucursal))!,
        id_encargado_venta: idEncargado.get(s(fila, I.codSector))!,
        id_producto: idProducto.get(s(fila, I.codProducto))!,
        id_clasificacion_marketing: idClasif.get(claveClasificacion(fila, I)) ?? null,
        importe_neto: n(fila[I.neto]),
        importe_bruto: n(fila[I.bruto]),
        importe_final: n(fila[I.final]),
        cantidad_bultos: n(fila[I.bultos]),
        cantidad_hl: n(fila[I.hl]),
      };
    });

    const huerfanas = ventas.filter(
      (v) =>
        !v.id_periodo ||
        !v.id_cliente ||
        !v.id_sucursal ||
        !v.id_encargado_venta ||
        !v.id_producto,
    );
    if (huerfanas.length) {
      throw new Error(
        `${huerfanas.length} venta(s) no pudieron resolver sus relaciones y no se insertaron. ` +
          'Volvé a subir el mismo archivo para reintentar.',
      );
    }

    for (let i = 0; i < ventas.length; i += LOTE) {
      const lote = ventas.slice(i, i + LOTE);
      const { error } = await supabase.from('ventas').insert(lote);
      if (error) throw new Error(`ventas: ${error.message}`);
      onProgreso({
        fase: 'ventas',
        mensaje: 'Insertando ventas…',
        actual: Math.min(i + LOTE, ventas.length),
        total: ventas.length,
      });
    }

    await cerrarImportacion(importacionId, {
      estado: 'ok',
      filasOk: ventas.length,
      filasDescartadas: plan.descartadas.length,
      detalle: {
        periodos: etiquetas,
        dimensionesCreadas: creadas,
      },
    });

    return {
      ventasInsertadas: ventas.length,
      periodos: etiquetas,
      dimensionesCreadas: creadas,
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
