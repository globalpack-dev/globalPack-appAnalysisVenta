/**
 * Verificación de la capa de datos.
 *
 * Los hooks son hooks de React y no se pueden llamar fuera de un componente.
 * Lo que sí se verifica acá es lo que importa: que cada función que los hooks
 * llaman exista, devuelva la forma que el tipo declara, y que los filtros
 * cambien el resultado.
 *
 * Usa la `service_role key`, no la `anon key`: desde que se activó RLS, la anon
 * no ve nada sin sesión (que es lo correcto, y se verifica aparte en la
 * sección 8).
 *
 * Uso: npm run verificar
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import type {
  FilaEncargado,
  FilaLocalidad,
  FilaMarca,
  FilaMarketing,
  FilaTopCliente,
  FilaUnidadNegocio,
  FilaVentaMensual,
  Filtros,
  Kpis,
  OpcionFiltro,
} from '../src/types/database.types';
import { claveDeFiltros, filtrosParaRpc } from '../src/hooks/useFiltros';

// service_role: saltea RLS. Necesario para verificar los datos sin iniciar sesión.
const sb = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// anon: la que viaja al navegador. Sirve para comprobar que RLS la frena.
const anon = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
);

let fallos = 0;
let pruebas = 0;

function check(nombre: string, condicion: boolean, detalle = '') {
  pruebas += 1;
  if (condicion) {
    console.log(`   OK    ${nombre}`);
  } else {
    fallos += 1;
    console.log(`   FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`);
  }
}

/** Todas las claves esperadas de un tipo, para verificar que no falte ninguna. */
function claves<T extends object>(fila: T): (keyof T)[] {
  return Object.keys(fila ?? {}) as (keyof T)[];
}

async function main() {
  console.log('\n1. fn_dashboard_kpis\n');
  const k = await sb.rpc('fn_dashboard_kpis', {});
  if (k.error) throw k.error;
  const kpis = k.data[0] as Kpis;
  console.log(`   ${JSON.stringify(kpis)}`);
  const clavesKpis: (keyof Kpis)[] = [
    'total_neto',
    'total_bruto',
    'total_final',
    'total_bultos',
    'total_hl',
    'operaciones',
    'clientes_activos',
    'productos_vendidos',
  ];
  check('devuelve las 8 columnas', clavesKpis.every((c) => c in kpis),
    `faltan: ${clavesKpis.filter((c) => !(c in kpis)).join(', ')}`);
  check('ninguna en null', clavesKpis.every((c) => kpis[c] !== null));
  check('clientes_activos > 0 (regla de 30 días)', kpis.clientes_activos > 0,
    `da ${kpis.clientes_activos}`);

  console.log('\n2. Filtros cambian el resultado\n');
  const sinFiltro = kpis.total_neto;

  // Los canales se toman de los datos, no se hardcodean. Antes usaban
  // 'Off-Trade' y 'On-Trade', que eran los del seed; con los datos reales los
  // canales son REF, K+T, AS, MAYO y NO, así que ambos filtros daban 0 y la
  // prueba comparaba 0 contra 0.
  const catalogoPrevio = (await sb.rpc('fn_filtros_disponibles')).data as Record<string, { id: number | null; nombre: string }[]>;
  const canalesCatalogo = [...new Set((catalogoPrevio.canal ?? []).map((c) => c.nombre))].filter(Boolean);
  check('hay al menos 2 canales', canalesCatalogo.length >= 2, `canales: ${canalesCatalogo.join(', ')}`);

  const porCanal: number[] = [];
  for (const c of canalesCatalogo.slice(0, 2)) {
    const r = (await sb.rpc('fn_dashboard_kpis', { p_canal: c })).data![0];
    check(`${c} < total`, Number(r.total_neto) < Number(sinFiltro), `${c}=${r.total_neto} total=${sinFiltro}`);
    porCanal.push(Number(r.total_neto));
  }
  check('los dos canales difieren', porCanal[0] !== porCanal[1], `${canalesCatalogo[0]}=${porCanal[0]} ${canalesCatalogo[1]}=${porCanal[1]}`);

  const inexistente = (await sb.rpc('fn_dashboard_kpis', { p_canal: 'NO_EXISTE' })).data![0];
  check('filtro sin match da 0, no null', Number(inexistente.total_neto) === 0,
    `da ${inexistente.total_neto}`);

  console.log('\n3. Filtrado en el cliente (useFiltros)\n');
  const vacios: Filtros = {
    p_anio: null, p_mes: null, p_cliente: null, p_localidad: null,
    p_marca: null, p_encargado: null, p_canal: null,
  };
  const f1: Filtros = { ...vacios, p_canal: 'Off-Trade' };
  const f2: Filtros = { ...vacios, p_canal: 'Off-Trade' };
  // Mismo contenido, distinto orden de inserción de las claves.
  const f3: Filtros = {
    p_canal: 'Off-Trade',
    p_encargado: null,
    p_marca: null,
    p_localidad: null,
    p_cliente: null,
    p_mes: null,
    p_anio: null,
  };

  check('mismos filtros -> misma clave', claveDeFiltros(f1) === claveDeFiltros(f2));
  check('mismo filtro en otra posición -> misma clave', claveDeFiltros(f1) === claveDeFiltros(f3));
  check('filtro vacío -> "{}"', claveDeFiltros(vacios) === '{}');
  check('limpiar vuelve a la clave inicial',
    claveDeFiltros(f1) !== claveDeFiltros(vacios));
  check('rpc quita los null', Object.keys(filtrosParaRpc(vacios)).length === 0);
  check('rpc conserva los aplicados',
    JSON.stringify(filtrosParaRpc(f1)) === '{"p_canal":"Off-Trade"}',
    JSON.stringify(filtrosParaRpc(f1)));

  console.log('\n4. Las demás funciones\n');
  const serie = (await sb.rpc('fn_ventas_mensuales')).data as FilaVentaMensual[];
  check('fn_ventas_mensuales devuelve filas', serie.length > 0);
  check('tiene mes_corto', serie.every((s) => 'mes_corto' in s));

  const top = ((await sb.rpc('fn_top_clientes', { p_limite: 5 })).data ?? []) as FilaTopCliente[];
  check('fn_top_clientes devuelve filas', top.length > 0);
  check('respeta p_limite', top.length <= 5);
  check('tiene participacion', top.every((t) => 'participacion' in t));
  check('cliente_nombre nunca es null', top.every((t) => t.cliente_nombre !== null));

  // `?? []` en todos: si una función está sobrecargada, el RPC devuelve null y
  // `null.length` revienta el script entero. Con el fallback, la prueba falla
  // con un mensaje claro en vez de cortar la corrida y dejar las secciones
  // siguientes sin ejecutar.
  const enc = ((await sb.rpc('fn_ventas_por_encargado', { p_limite: 5 })).data ?? []) as FilaEncargado[];
  check('fn_ventas_por_encargado devuelve filas', enc.length > 0);
  check('trae supervisor (puede ser null)',
    enc.every((e) => 'supervisor_nombre' in e));

  const loc = ((await sb.rpc('fn_ventas_por_localidad')).data ?? []) as FilaLocalidad[];
  check('fn_ventas_por_localidad devuelve filas', loc.length > 0);

  const un = ((await sb.rpc('fn_ventas_por_unidad_negocio')).data ?? []) as FilaUnidadNegocio[];
  check('fn_ventas_por_unidad_negocio devuelve filas', un.length > 0);

  const marcas = ((await sb.rpc('fn_ventas_por_marca')).data ?? []) as FilaMarca[];
  check('fn_ventas_por_marca devuelve filas', marcas.length > 0);

  console.log('\n5. Marketing: drill-down\n');
  const mkt = ((await sb.rpc('fn_marketing_por')).data ?? []) as FilaMarketing[];
  check('devuelve combinaciones', mkt.length > 0);
  check('trae las 4 dimensiones',
    mkt.every((m) => 'canal_ajustado' in m && 'segmento_mkt' in m &&
      'canal_mkt' in m && 'subcanal_mkt' in m));

  const canales = [...new Set(mkt.map((m) => m.canal_ajustado))];
  const filtrado = ((await sb.rpc('fn_marketing_por', { p_canal: canales[0] })).data ?? []) as FilaMarketing[];
  check('filtrar por canal acota el resultado',
    filtrado.length > 0 && filtrado.every((m) => m.canal_ajustado === canales[0]),
    `canales: ${canales.join(', ')}`);
  check('filtrar por canal reduce o iguala las filas', filtrado.length <= mkt.length);

  // Sobrecargas: al agregar un parámetro a una función, la versión vieja queda
  // conviviendo y Postgres rechaza la llamada con "could not choose the best
  // candidate". Pasó 3 veces (fn_ventas_filtradas, las 6 del archivo 10 y
  // fn_ventas_por_encargado). Esta prueba lo detecta sin que haya que abrir
  // la app: cada función se llama una vez y se ve si responde.
  console.log('\n6. Funciones sin sobrecarga\n');
  const FUNCIONES: Array<[string, Record<string, unknown>]> = [
    ['fn_ventas_filtradas', {}],
    ['fn_dashboard_kpis', {}],
    ['fn_dashboard_variaciones', {}],
    ['fn_clientes', {}],
    ['fn_cliente_detalle', { p_cliente: 1 }],
    ['fn_marcas', {}],
    ['fn_marketing_por', {}],
    ['fn_ventas_mensuales', {}],
    ['fn_ventas_por_encargado', { p_limite: 10 }],
    ['fn_ventas_por_unidad_negocio', {}],
    ['fn_top_clientes', { p_limite: 10 }],
    ['fn_ventas_por_localidad', { p_limite: 10 }],
    ['fn_ventas_por_marca', {}],
    ['fn_operativos', {}],
    ['fn_actividad_promotor', { p_encargado: 84 }],
  ];
  const ambiguas: string[] = [];
  for (const [fn, args] of FUNCIONES) {
    // Se llama sólo con los argumentos necesarios: el objetivo es ver si
    // Postgres PUEDE resolver la firma, no si el filtro matchea algo.
    const r = await sb.rpc(fn as never, args as never);
    if (r.error && /best candidate|not unique/i.test(r.error.message)) {
      ambiguas.push(fn);
    }
  }
  check(
    'ninguna función está sobrecargada',
    ambiguas.length === 0,
    ambiguas.length ? `ambiguas: ${ambiguas.join(', ')}` : '',
  );

  // Columnas que el código de la app lee por nombre. Una función puede
  // devolver bien las filas y aun así no traer la columna que la pantalla pide:
  // eso da `undefined` en runtime y revienta recién cuando el usuario hace
  // clic. Pasó con `fn_ventas_por_encargado`, que devuelve `id_encargado_venta`
  // y Promotores.tsx leía `s.id_encargado`.
  console.log('\n7. Columnas que la app lee por nombre\n');
  const COLUMNAS_QUE_SE_USAN: Array<[string, Record<string, unknown>, string[]]> = [
    ['fn_ventas_por_encargado', { p_limite: 5 },
      ['id_encargado_venta', 'encargado_nombre', 'supervisor_nombre', 'ventas', 'clientes']],
    ['fn_ventas_por_unidad_negocio', {}, ['id_unidad_negocio', 'unidad_nombre', 'ventas']],
    ['fn_ventas_por_localidad', { p_limite: 5 }, ['id_localidad', 'localidad_nombre', 'ventas']],
    ['fn_ventas_por_marca', {}, ['id_marca', 'marca_nombre', 'ventas']],
    ['fn_ventas_mensuales', {}, ['anio', 'mes', 'nombre_mes', 'mes_corto', 'importe_neto']],
    ['fn_top_clientes', { p_limite: 5 }, ['id_cliente', 'cliente_nombre', 'ventas', 'participacion']],
    ['fn_dashboard_todo', {}, ['kpis', 'variaciones', 'serie', 'top_clientes', 'por_encargado',
      'por_localidad', 'por_unidad', 'por_marca']],
    ['fn_actividad_promotor', { p_encargado: 84 },
      ['codigo_cliente', 'razon_social', 'visitas', 'es_alcohol', 'compro_algo',
        'compradas_alcohol', 'compras', 'faltantes', 'oportunidad',
        'tarea_redbull', 'tarea_laton', 'tarea_cvza']],
  ];
  const faltantes: string[] = [];
  for (const [fn, args, esperadas] of COLUMNAS_QUE_SE_USAN) {
    const r = await sb.rpc(fn as never, args as never);
    if (r.error) {
      faltantes.push(`${fn} (error)`);
      continue;
    }
    // Las que devuelven jsonb vienen como un valor, no como lista de filas.
    // `fn_dashboard_todo` es el caso: devuelve un objeto en `data`, no en
    // `data[0]`.
    const fila = Array.isArray(r.data) ? r.data[0] : r.data;
    if (!fila) {
      faltantes.push(`${fn} (no devolvió filas)`);
      continue;
    }
    const tiene = new Set(Object.keys(fila as object));
    for (const c of esperadas) {
      if (!tiene.has(c)) faltantes.push(`${fn}.${c}`);
    }
  }
  check(
    'las funciones traen las columnas que la app lee',
    faltantes.length === 0,
    faltantes.length ? `faltan: ${faltantes.join(', ')}` : '',
  );

  console.log('\n8. Catálogo de filtros\n');
  // Devuelve un objeto jsonb con una lista por tipo. Con 1.542 clientes, la
  // versión que devolvía una fila por opción se truncaba a 1.000 por el
  // `db-max-rows` de PostgREST y perdía los períodos.
  const rCat = await sb.rpc('fn_filtros_disponibles');
  check('la consulta no falla', !rCat.error, rCat.error?.message ?? '');
  const cat = (rCat.data ?? {}) as Record<string, { id: number | null; nombre: string }[]>;
  const claves = Object.keys(cat);
  check('trae las 7 claves', claves.length === 7, `trae: ${claves.join(', ')}`);
  check('incluye unidad_negocio', claves.includes('unidad_negocio'));
  check('incluye periodo', claves.includes('periodo'));

  const periodos = cat.periodo ?? [];
  check('trae períodos', periodos.length > 0, `vienen ${periodos.length}`);
  check('los períodos traen "Mes Año"', periodos.every((p) => /\d{4}$/.test(p.nombre)), periodos[0]?.nombre ?? '(vacío)');
  check('trae más de 1.000 clientes (sin truncar)', (cat.cliente ?? []).length > 1000, `${(cat.cliente ?? []).length} clientes`);

  console.log('\n7. Vista de ventas\n');
  const v = await sb.from('v_ventas_detalle').select('*').limit(1);
  if (v.error) throw v.error;
  const fila = v.data![0];
  check('trae los nombres resueltos',
    ['cliente_nombre', 'producto_nombre', 'encargado_nombre'].every((c) => c in fila));
  check('importes numéricos',
    typeof fila.importe_neto === 'number' || typeof fila.importe_neto === 'string');
  check('supervisor puede ser null', 'supervisor_nombre' in fila);

  console.log('\n9. Cartera: qué es alcohol de verdad\n');
  // La tabla `marcas_alcohol` tiene las 9 marcas del archivo del cliente, pero
  // TRES no son alcohol: RED BULL, H2Oh y PEPSI BLACK. Son bebidas.
  //
  // Antes de que existiera la columna `es_alcoholica`, cada función repetía su
  // propia versión de "compró alcohol" y no coincidían entre sí. Estas pruebas
  // existen para que un error así no vuelva a colarse en silencio.
  const rMarcas = await sb.from('marcas_alcohol').select('id_marca, es_alcoholica');
  check('la consulta no falla', !rMarcas.error, rMarcas.error?.message ?? '');
  const marcasAlc = rMarcas.data ?? [];
  check('trae las 9 marcas del archivo', marcasAlc.length === 9, `trae ${marcasAlc.length}`);
  check('6 son alcohol', marcasAlc.filter((m) => m.es_alcoholica).length === 6,
    `${marcasAlc.filter((m) => m.es_alcoholica).length} en true`);
  check('3 no son alcohol', marcasAlc.filter((m) => !m.es_alcoholica).length === 3,
    `${marcasAlc.filter((m) => !m.es_alcoholica).length} en false`);

  // Los grupos del filtro de la pantalla de Supervisores.
  const rCartera = await sb.rpc('fn_cartera_clientes', { p_supervisor: null });
  check('la consulta no falla', !rCartera.error, rCartera.error?.message ?? '');
  const cartera = (rCartera.data ?? []) as Array<{
    es_alcohol: boolean;
    compro_algo: boolean;
    oportunidad: boolean;
    compradas_alcohol: number;
    compras: string[];
  }>;
  check('trae la cartera completa (sin truncar)', cartera.length > 1000, `${cartera.length} clientes`);

  const sinCompra = cartera.filter((c) => c.oportunidad).length;
  const comproAlcohol = cartera.filter((c) => !c.oportunidad && c.compro_algo).length;
  const noCompra = cartera.filter((c) => !c.oportunidad && !c.compro_algo).length;
  check('los tres grupos cubren la cartera entera',
    sinCompra + comproAlcohol + noCompra === cartera.length,
    `${sinCompra} + ${comproAlcohol} + ${noCompra} = ${sinCompra + comproAlcohol + noCompra} vs ${cartera.length}`);
  check('la oportunidad son 640', sinCompra === 640, `da ${sinCompra}`);
  check('compraron alcohol son 1.680', comproAlcohol === 1680, `da ${comproAlcohol}`);
  check('no compran alcohol son 663', noCompra === 663, `da ${noCompra}`);

  // La oportunidad tiene que ser un subconjunto de los que tienen el flag: no
  // se le ofrece alcohol a quien el archivo no marca como cliente de alcohol.
  check('la oportunidad está dentro del flag ALCOHOL',
    cartera.filter((c) => c.oportunidad).every((c) => c.es_alcohol),
    'hay oportunidades con el flag en NO');
  // Y al revés: el que tiene el flag y compró SÓLO marcas no-alcohólicas
  // (H2Oh, Red Bull, Pepsi Black) SIGUE siendo oportunidad. Son 105 clientes.
  //
  // Antes de la columna `es_alcoholica` estos clientes quedaban fuera de la
  // lista: el código contaba "compró alguna de las 9" y las bebidas contaban
  // como alcohol.
  const soloBebidas = cartera.filter(
    (c) => c.es_alcohol && c.compradas_alcohol === 0 && c.compras.length > 0,
  );
  check('comprar sólo bebidas no deja de ser oportunidad',
    soloBebidas.length > 0 && soloBebidas.every((c) => c.oportunidad),
    `${soloBebidas.length} clientes compran sólo bebidas; ${soloBebidas.filter((c) => !c.oportunidad).length} quedaron fuera`);

  // La capa operativa (archivo 30): visitas, tareas, subcanal y tier de cada
  // cliente. Es lo que alimenta el panel "Ver actividad" de Promotores.
  const rOp = await sb.rpc('fn_operativos' as never, { p_supervisor: null } as never);
  check('fn_operativos no falla', !rOp.error, rOp.error?.message ?? '');
  const ops = (Array.isArray(rOp.data) ? rOp.data : []) as Array<{
    codigo_cliente: string;
    id_encargado_venta: number | null;
    promotor: string;
    visitas: string[];
    subcanal: string | null;
    tier: string | null;
    tarea_redbull: boolean;
    tarea_laton: boolean;
    tarea_cvza: boolean;
  }>;
  check('hay datos operativos de toda la cartera', ops.length === 2983, `trae ${ops.length}`);
  // Si un cliente quedara sin promotor, `fn_actividad_promotor` no lo devuelve
  // para ningún encargado: desaparece del panel sin que nadie lo note.
  check('todos los clientes operativos tienen promotor',
    ops.every((o) => o.id_encargado_venta !== null),
    `${ops.filter((o) => o.id_encargado_venta === null).length} sin promotor`);
  check('todos tienen día de visita',
    ops.every((o) => Array.isArray(o.visitas) && o.visitas.length > 0),
    `${ops.filter((o) => !Array.isArray(o.visitas) || o.visitas.length === 0).length} sin visita`);
  check('las visitas son días válidos',
    ops.every((o) => o.visitas.every((d) => ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'].includes(d))),
    JSON.stringify([...new Set(ops.flatMap((o) => o.visitas))]));
  check('las tareas son 720 / 627 / 322',
    ops.filter((o) => o.tarea_redbull).length === 720 &&
    ops.filter((o) => o.tarea_laton).length === 627 &&
    ops.filter((o) => o.tarea_cvza).length === 322,
    `red bull ${ops.filter((o) => o.tarea_redbull).length}, latón ${ops.filter((o) => o.tarea_laton).length}, cvza ${ops.filter((o) => o.tarea_cvza).length}`);

  // La actividad del promotor (archivo 31): la cartera + la capa operativa +
  // las compras, en una sola fila por cliente. Es lo que muestra "Ver
  // actividad" y lo que después se manda a los encargados.
  type Actividad = {
    codigo_cliente: string;
    razon_social: string;
    visitas: string[];
    es_alcohol: boolean;
    compro_algo: boolean;
    compradas_alcohol: number;
    compras: string[];
    faltantes: string[];
    oportunidad: boolean;
    tarea_redbull: boolean;
    tarea_laton: boolean;
    tarea_cvza: boolean;
    flag_estado: string;
    es_baja: boolean;
    consumo_personal: boolean;
  };

  const rAct = await sb.rpc('fn_actividad_promotor' as never, { p_encargado: 84 } as never);
  check('fn_actividad_promotor no falla', !rAct.error, rAct.error?.message ?? '');
  const act = (Array.isArray(rAct.data) ? rAct.data : []) as Actividad[];
  check('CASTILLO NELSON tiene 238 clientes en su actividad', act.length === 238, `trae ${act.length}`);
  check('la actividad trae los días de visita',
    act.every((c) => Array.isArray(c.visitas) && c.visitas.length > 0),
    `${act.filter((c) => !Array.isArray(c.visitas) || c.visitas.length === 0).length} sin visita`);

  // La actividad total tiene que cerrar con la cartera: mismos clientes, misma
  // oportunidad y las mismas tareas.
  //
  // OJO CON ESTO: el mapa se arma con `ops`, que ya vino completo por jsonb.
  // Antes salía de un `.select('id_encargado_venta')` sobre `clientes_operativa`
  // SIN paginar, y PostgREST corta a 1.000 filas: el verificador comparaba a
  // cada promotor contra una cartera recortada. Daba "1 promotor desalineado"
  // (el cortado justo en la frontera) y sumas de ~38% de la realidad. Es el
  // mismo límite que obligó a que las funciones devolvieran jsonb.
  const porPromotor = new Map<number, number>();
  for (const o of ops) {
    if (o.id_encargado_venta !== null) {
      porPromotor.set(o.id_encargado_venta, (porPromotor.get(o.id_encargado_venta) ?? 0) + 1);
    }
  }
  let totalActividad = 0;
  let oportunidadActividad = 0;
  let redBull = 0;
  let laton = 0;
  let cvza = 0;
  let bajasActividad = 0;
  let consumoActividad = 0;
  let ofertasIndebidas = 0;
  let desalineados = 0;
  for (const [encargado, esperados] of porPromotor) {
    const r = await sb.rpc('fn_actividad_promotor' as never, { p_encargado: encargado } as never);
    const lista = (Array.isArray(r.data) ? r.data : []) as Actividad[];
    totalActividad += lista.length;
    oportunidadActividad += lista.filter((c) => c.oportunidad).length;
    redBull += lista.filter((c) => c.tarea_redbull).length;
    laton += lista.filter((c) => c.tarea_laton).length;
    cvza += lista.filter((c) => c.tarea_cvza).length;
    bajasActividad += lista.filter((c) => c.es_baja).length;
    consumoActividad += lista.filter((c) => c.consumo_personal).length;
    ofertasIndebidas += lista.filter(
      (c) => (c.es_baja || c.consumo_personal) && (c.oportunidad || c.faltantes.length > 0),
    ).length;
    if (lista.length !== esperados) desalineados++;
  }
  check('cada promotor devuelve el tamaño de su cartera', desalineados === 0,
    `${desalineados} promotores desalineados`);
  check('la actividad suma toda la cartera', totalActividad === 2983, `suma ${totalActividad}`);
  check('la oportunidad de la actividad es 640', oportunidadActividad === 640, `da ${oportunidadActividad}`);
  check('las tareas de la actividad son 720 / 627 / 322',
    redBull === 720 && laton === 627 && cvza === 322,
    `red bull ${redBull}, latón ${laton}, cvza ${cvza}`);
  check('las faltantes sólo existen para el público de alcohol',
    act.every((c) => c.es_alcohol || c.compradas_alcohol > 0 || c.faltantes.length === 0),
    `${act.filter((c) => !c.es_alcohol && c.compradas_alcohol === 0 && c.faltantes.length > 0).length} fuera del público`);
  check('la oportunidad no compró alcohol',
    act.filter((c) => c.oportunidad).every((c) => c.compradas_alcohol === 0),
    `${act.filter((c) => c.oportunidad && c.compradas_alcohol > 0).length} con compras`);
  // Las dos excepciones del FLAG ALCOHOL que antes se perdían como "NO".
  check('las bajas son 14 y el consumo personal 127',
    bajasActividad === 14 && consumoActividad === 127,
    `bajas ${bajasActividad}, consumo ${consumoActividad}`);
  check('ni las bajas ni el consumo personal reciben oferta',
    ofertasIndebidas === 0,
    `${ofertasIndebidas} con oportunidad o faltantes`);

  // La tarjeta del supervisor tiene que coincidir con el conteo de la cartera.
  const rSup = await sb.rpc('fn_supervisores_cartera');
  const sups = (rSup.data ?? []) as Array<{
    nombre: string;
    clientes: number;
    alcohol: number;
    con_alcohol: number;
    oportunidad: number;
    publico_alcohol: number;
    penetracion: number;
  }>;
  check('hay 2 supervisores', sups.length === 2, `trae ${sups.length}`);
  check('incluye a FERNANDEZ EDUARDO',
    sups.some((s) => s.nombre.includes('FERNANDEZ')),
    JSON.stringify(sups.map((s) => s.nombre)));
  check('no queda el supervisor viejo (PERALTA SOLANA)',
    !sups.some((s) => s.nombre.includes('PERALTA')),
    JSON.stringify(sups.map((s) => s.nombre)));
  check('las tarjetas suman la cartera', sups.reduce((a, s) => a + s.clientes, 0) === cartera.length,
    `${sups.reduce((a, s) => a + s.clientes, 0)} vs ${cartera.length}`);
  check('la oportunidad de las tarjetas es 640',
    sups.reduce((a, s) => a + s.oportunidad, 0) === 640,
    `da ${sups.reduce((a, s) => a + s.oportunidad, 0)}`);
  check('con_alcohol de las tarjetas es 1.680',
    sups.reduce((a, s) => a + s.con_alcohol, 0) === 1680,
    `da ${sups.reduce((a, s) => a + s.con_alcohol, 0)}`);

  // El benchmark (gráfico C). El público de alcohol tiene que dividirse
  // EXACTO en los que compraron y los que no: si no, los dos segmentos del
  // gráfico no suman 100% y la comparación entre supervisores no cerraría.
  check('el público se divide exacto en compró / no compró',
    sups.every((s) => s.publico_alcohol - s.con_alcohol - s.oportunidad === 0),
    sups.filter((s) => s.publico_alcohol - s.con_alcohol - s.oportunidad !== 0)
      .map((s) => `${s.nombre}: ${s.publico_alcohol} - ${s.con_alcohol} - ${s.oportunidad}`).join(', '));
  check('la penetración está entre 0 y 100',
    sups.every((s) => s.penetracion >= 0 && s.penetracion <= 100),
    sups.map((s) => `${s.nombre}: ${s.penetracion}`).join(', '));
  check('la penetración es con_alcohol / publico_alcohol',
    sups.every((s) => Math.abs(s.penetracion - Math.round((1000 * s.con_alcohol) / s.publico_alcohol) / 10) < 0.05),
    sups.map((s) => `${s.nombre}: ${s.penetracion} vs ${Math.round((1000 * s.con_alcohol) / s.publico_alcohol) / 10}`).join(', '));
  check('penetración + oportunidad da 100',
    sups.every((s) => Math.abs(s.penetracion + Math.round((1000 * s.oportunidad) / s.publico_alcohol) / 10 - 100) < 0.15),
    sups.map((s) => `${s.nombre}: ${s.penetracion + Math.round((1000 * s.oportunidad) / s.publico_alcohol) / 10}`).join(', '));

  // La matriz por marca.
  const rMatriz = await sb.rpc('fn_cartera_marcas', { p_supervisor: 36 });
  const matriz = (rMatriz.data ?? []) as Array<{
    marca_nombre: string;
    es_alcoholica: boolean;
    compraron: number;
    clientes_alcohol: number;
    penetracion: number;
    sin_comprar: number;
  }>;
  check('la matriz trae las 9 marcas', matriz.length === 9, `trae ${matriz.length}`);
  check('ninguna penetración pasa 100',
    matriz.every((m) => m.penetracion <= 100),
    matriz.filter((m) => m.penetracion > 100).map((m) => m.marca_nombre).join(', '));
  check('compraron nunca pasa el público de alcohol',
    matriz.every((m) => m.compraron <= m.clientes_alcohol),
    matriz.filter((m) => m.compraron > m.clientes_alcohol).map((m) => m.marca_nombre).join(', '));
  check('compraron + sin_comprar = público de alcohol',
    matriz.every((m) => m.compraron + m.sin_comprar === m.clientes_alcohol),
    matriz.filter((m) => m.compraron + m.sin_comprar !== m.clientes_alcohol).map((m) => m.marca_nombre).join(', '));
  check('la matriz separa las 6 alcoholicás de las 3 bebidas',
    matriz.filter((m) => m.es_alcoholica).length === 6 && matriz.filter((m) => !m.es_alcoholica).length === 3,
    `${matriz.filter((m) => m.es_alcoholica).length} y ${matriz.filter((m) => !m.es_alcoholica).length}`);

  console.log('\n8. RLS: la anon key sin sesión no debe ver nada\n');
  for (const t of ['clientes', 'ventas', 'marcas', 'empleados']) {
    const r = await anon.from(t).select('*').limit(1);
    const filas = r.error ? -1 : r.data?.length ?? 0;
    check(`${t}: anon ve 0 filas o error`, filas <= 0,
      `vio ${filas} filas -> RLS no está cerrado`);
  }
  const rls = await anon.from('empleados').select('*');
  check('anon no obtiene la lista de empleados',
    (rls.data?.length ?? 0) === 0);

  console.log('\n' + '='.repeat(58));
  if (fallos === 0) {
    console.log(`  ${pruebas} pruebas, 0 fallos. La capa de datos coincide con los tipos.`);
  } else {
    console.log(`  ${pruebas} pruebas, ${fallos} FALLOS.`);
  }
  console.log('='.repeat(58) + '\n');
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nError:', e instanceof Error ? e.message : e);
  process.exit(1);
});

void claves;