import { useQueries, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { claveDeFiltros, filtrosParaRpc } from './useFiltros';
import type {
  FilaTopCliente,
  FilaVentaMensual,
  FilaVentaDetalle,
  Filtros,
  Kpis,
  OpcionFiltro,
  OpcionSimple,
  Encargado,
  FilaEncargadoMarca,
  FilaRankingEncargado,
  FilaCliente,
  FilaHistorialCliente,
  FilaProductoCliente,
} from '../types/database.types';

/**
 * Opciones de los `<select>` del panel de filtros.
 *
 * Reemplaza los años (2025/2024/2023) y los canales
 * (Off-Trade/On-Trade/Institucional) que estaban hardcodeados en 6 archivos y ya
 * no coinciden con los datos reales (REF / K+T / AS).
 *
 * No tiene filtros: es el catálogo que alimenta los filtros.
 */
export function useFiltrosDisponibles() {
  return useQuery({
    queryKey: ['fn_filtros_disponibles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_filtros_disponibles');
      if (error) throw error;

      // La función devuelve UN objeto jsonb con una lista por tipo, no una fila
      // por opción. Antes devolvía la lista directo, pero con 1.542 clientes
      // PostgREST cortaba la respuesta a 1.000 filas (su `db-max-rows`) y se
      // perdían los períodos, que el filtro de fecha necesita. Con una sola
      // fila no hay truncado. Ver `18_catalogo_jsonb.sql`.
      //
      // Acá se aplana a la lista de siempre para que `agruparOpciones` y las
      // páginas no cambien.
      const catalogo = (data ?? {}) as Record<
        string,
        { id: number | null; nombre: string; mes?: number; anio?: number }[] | null
      >;
      const salida: OpcionFiltro[] = [];
      for (const [clave, items] of Object.entries(catalogo)) {
        // La clave del objeto ES el tipo. El cast es porque `Object.entries` de
        // un Record<string,…> devuelve string, no el union de OpcionFiltro.
        const tipo = clave as OpcionFiltro['tipo'];
        for (const it of items ?? []) {
          // `mes` y `anio` sólo vienen en los períodos (archivo 45). El resto
          // de las opciones los deja en `undefined` y no los usa.
          salida.push({ tipo, id: it.id, nombre: it.nombre, mes: it.mes, anio: it.anio });
        }
      }
      return salida;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Nombres de mes en español, como fallback cuando el catálogo todavía no trae
 * el `mes` numérico (por ejemplo, si el archivo 45 aún no se aplicó en la base).
 */
const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/**
 * Separa las opciones por tipo, listas para cada `<select>`.
 *
 * Los períodos traen `mes` y `anio` numéricos desde `fn_filtros_disponibles`
 * (archivo 45). Si el catálogo todavía no los expone, se deduce el año del
 * nombre ("Octubre 2025") y el mes del nombre ("Octubre").
 */
export function agruparOpciones(opciones: OpcionFiltro[]) {
  const periodos = opciones
    .filter((o) => o.tipo === 'periodo')
    .map((o) => {
      const partes = o.nombre.trim().split(/\s+/);
      const anio = o.anio ?? Number(partes[partes.length - 1]);
      const mes = o.mes ?? MESES[partes[0]?.toLowerCase() ?? ''] ?? 0;
      return { id: o.id, anio, mes, etiqueta: o.nombre };
    })
    .sort((a, b) => a.anio - b.anio || a.mes - b.mes);

  const simple = (tipo: OpcionFiltro['tipo']) =>
    opciones
      .filter((o) => o.tipo === tipo)
      .map((o) => ({ id: o.id, nombre: o.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

  return {
    periodos,
    anios: [...new Set(periodos.map((p) => p.anio))].sort((a, b) => b - a),
    clientes: simple('cliente'),
    localidades: simple('localidad'),
    marcas: simple('marca'),
    encargados: simple('encargado'),
    unidades: simple('unidad_negocio'),
    canales: opciones
      .filter((o) => o.tipo === 'canal')
      .map((o) => o.nombre)
      .sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Aplana las categorías para el <select>.
 *
 * Las de primer nivel y sus subcategorías se mezclan en una sola lista, con
 * la subcategoría indentada: "Marketplace", "  Mercadería", "  Alimentos",
 * "  Yerbas". El filtro manda el NOMBRE, y en la base "Marketplace" trae las
 * tres partes porque el EXISTS compara contra el nombre de la categoría o el de
 * su padre.
 */
export function categoriasParaFiltro(
  cats: Array<{ nombre: string; id_padre: string | null }> | undefined,
): Array<{ id: null; nombre: string }> {
  if (!cats) return [];
  const raices = cats.filter((c) => !c.id_padre);
  const hijas = cats.filter((c) => c.id_padre);
  const salida: Array<{ id: null; nombre: string }> = [];
  for (const raiz of raices) {
    salida.push({ id: null, nombre: raiz.nombre });
    for (const h of hijas.filter((x) => x.id_padre === raiz.nombre)) {
      salida.push({ id: null, nombre: `   ${h.nombre}` });
    }
  }
  return salida;
}

/**
 * Categorías de producto para el filtro de Categoría en Ventas.
 *
 * Viene con el padre para que el menú muestre "Marketplace" arriba y sus tres
 * partes (Mercadería, Alimentos, Yerbas) indentadas debajo. El filtro acepta
 * cualquiera de los dos niveles: en la base, `p_categoria` compara contra el
 * nombre de la categoría **o** el de su padre.
 */
export function useCategorias() {
  return useQuery({
    queryKey: ['fn_categorias'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_categorias');
      if (error) throw error;
      return (data ?? []) as Array<{ nombre: string; id_padre: string | null }>;
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Catálogos de producto para los `<select>` de Products.tsx.
 *
 * Son catálogos puros: no dependen de los filtros ni de las ventas, así que van
 * cacheados por separado de los datos de venta.
 */
export function useCatalogosProducto() {
  const [calibres, familias] = useQueries({
    queries: [
      {
        queryKey: ['fn_calibres'],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_calibres');
          if (error) throw error;
          return (data ?? []) as OpcionSimple[];
        },
      },
      {
        queryKey: ['fn_familias'],
        queryFn: async () => {
          const { data, error } = await supabase.rpc('fn_familias');
          if (error) throw error;
          return (data ?? []) as OpcionSimple[];
        },
      },
    ],
  });

  return { calibres, familias };
}

/**
 * Listado de clientes con métricas.
 *
 * `fn_clientes` devuelve una fila por cliente, incluida la que nunca compró:
 * el LEFT JOIN contra el agregado de ventas deja los importes en 0 en vez de
 * sacar al cliente de la lista. Con un INNER JOIN, un cliente sin ventas en el
 * período filtrado desaparecería y el usuario pensaría que ya no existe.
 */
export function useClientes(filtros: Filtros, promotorId: number | null = null) {
  const rpc = filtrosParaRpc(filtros);

  return useQuery({
    queryKey: ['fn_clientes', claveDeFiltros(filtros), promotorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_clientes', {
        ...rpc,
        // Filtrar por la cartera vigente: la lista queda sólo con los clientes
        // asignados a ese promotor (ver `43_clientes_promotor.sql`). Sin
        // filtro se manda null para que la función devuelva todos.
        p_promotor: promotorId,
      });
      if (error) throw error;
      // Devuelve UN objeto jsonb con el array de clientes adentro, no una fila
      // por cliente: con 1.542 clientes la versión tabla se truncaba a 1.000 por
      // el `db-max-rows` de PostgREST y los últimos 542 desaparecían sin error.
      // Ver `20_fn_clientes_jsonb.sql`.
      const lista = (data ?? null) as unknown as FilaCliente[] | null;
      return Array.isArray(lista) ? lista : [];
    },
    staleTime: 60_000,
  });
}

/**
 * Catálogo de encargados de venta (promotores).
 *
 * La tabla es chica (20 filas) y no cambia seguido. La clave de caché es la
 * misma que usaba la pantalla de Promotores, así ambas comparten la consulta.
 */
export function useCatalogoEncargados() {
  return useQuery({
    queryKey: ['encargados_catalogo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('encargados_ventas')
        .select('*')
        .order('codigo_sector_venta');
      if (error) throw error;
      return (data ?? []) as Encargado[];
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * Historial mensual de un cliente.
 *
 * Reemplaza `clienteVentasMensuales`, que en el prototipo era un diccionario en
 * memoria con sólo 3 clientes y un array inventado como fallback para el resto.
 * Acá todos tienen serie real.
 */
export function useHistorialCliente(clienteId: number | null, filtros: Filtros) {
  const rpc = filtrosParaRpc(filtros);

  return useQuery({
    queryKey: ['fn_cliente_detalle', clienteId, claveDeFiltros(filtros)],
    queryFn: async () => {
      if (clienteId === null) return [] as FilaHistorialCliente[];
      const { data, error } = await supabase.rpc('fn_cliente_detalle', {
        ...rpc,
        p_cliente: clienteId,
      });
      if (error) throw error;
      return (data ?? []) as FilaHistorialCliente[];
    },
    enabled: clienteId !== null,
    staleTime: 60_000,
  });
}

/**
 * Productos comprados por un cliente, separados por período.
 *
 * Es el detalle que se abre al hacer clic en un mes del historial. Se piden los
 * 7 filtros que acepta `fn_cliente_productos` de forma explícita: `Filtros`
 * también trae `p_unidad_negocio` y `p_categoria`, que esa función no acepta, y
 * PostgREST fallaría si se enviaran.
 */
export function useProductosCliente(clienteId: number | null, filtros: Filtros) {
  return useQuery({
    queryKey: ['fn_cliente_productos', clienteId, claveDeFiltros(filtros)],
    queryFn: async () => {
      if (clienteId === null) return [] as FilaProductoCliente[];

      const { p_anio, p_mes, p_localidad, p_marca, p_encargado, p_canal } = filtros;
      const { data, error } = await supabase.rpc('fn_cliente_productos', {
        p_cliente: clienteId,
        p_anio,
        p_mes,
        p_localidad,
        p_marca,
        p_encargado,
        p_canal,
      });
      if (error) throw error;
      return (data ?? []) as FilaProductoCliente[];
    },
    enabled: clienteId !== null,
    staleTime: 60_000,
  });
}

/**
 * Nombre a mostrar de un cliente.
 *
 * `nombre_fantasia` es nullable en la base real: parte de los clientes no lo
 * tiene cargado. El prototipo hacía `nombreFantasia.charAt(0)` sin protección,
 * lo que rompe la pantalla con un cliente de esos.
 */
export function nombreDeCliente(c: Pick<FilaCliente, 'razon_social' | 'nombre_fantasia'>): string {
  return c.nombre_fantasia?.trim() || c.razon_social;
}

/** Inicial para el avatar, nunca vacía. */
export function inicialDeCliente(c: Pick<FilaCliente, 'razon_social' | 'nombre_fantasia'>): string {
  return nombreDeCliente(c).charAt(0).toUpperCase() || '?';
}

/**
 * Ficha de un encargado de venta.
 *
 * El "promotor de venta" del negocio es la persona encargada, no una zona. Eso
 * cambia el significado de toda la pantalla: el ranking muestra nombres de
 * personas, no lugares.
 *
 * Se traen cuatro cosas en paralelo: la fila del encargado con su supervisor,
 * el ranking de clientes, la evolución mensual y las marcas que vende.
 *
 * El supervisor es nullable: en la base real hay encargados sin supervisor
 * asignado. Por eso la UI muestra "Sin supervisor" en vez de un espacio vacío.
 */
export function useEncargadoDetalle(encargadoId: number | null, filtros: Filtros) {
  return useQuery({
    queryKey: ['encargado_detalle', encargadoId, claveDeFiltros(filtros)],
    queryFn: async () => {
      // La guarda cortaba solo con `null`. Si el id llegaba `undefined` o `NaN`
      // —que fue exactamente lo que pasaba con `s.id_encargado`, una columna que
      // no existe— la consulta igual se mandaba a la base y Postgres respondía
      // `invalid input syntax for type integer: "undefined"`.
      //
      // Con `Number.isFinite` un id inválido devuelve `null` y la página muestra
      // el estado vacío en vez de romperse con un error de SQL.
      if (encargadoId === null || !Number.isFinite(encargadoId)) return null;

      const rpc = filtrosParaRpc(filtros);

      const [encargado, ranking, serie, marcas] = await Promise.all([
        supabase
          .from('encargados_ventas')
          .select('*, supervisores(nombre_completo)')
          .eq('id_encargado_venta', encargadoId)
          .maybeSingle(),
        supabase.rpc('fn_top_clientes', { ...rpc, p_encargado: encargadoId, p_limite: 10 }),
        supabase.rpc('fn_ventas_mensuales', { ...rpc, p_encargado: encargadoId }),
        supabase.rpc('fn_encargado_marcas', { ...rpc, p_encargado: encargadoId }),
      ]);

      if (encargado.error) throw encargado.error;
      if (ranking.error) throw ranking.error;
      if (serie.error) throw serie.error;
      if (marcas.error) throw marcas.error;
      if (!encargado.data) return null;

      const total = serie.data.reduce((s, v) => s + Number(v.importe_neto), 0);

      return {
        encargado: encargado.data as Encargado,
        // El join anidado devuelve un objeto o null. Nunca `undefined`: si el
        // encargado no tiene supervisor, viene null.
        supervisor:
          (encargado.data.supervisores as { nombre_completo: string } | null)
            ?.nombre_completo ?? null,
        ranking: (ranking.data ?? []) as FilaTopCliente[],
        serie: (serie.data ?? []) as FilaVentaMensual[],
        marcas: (marcas.data ?? []) as FilaEncargadoMarca[],
        total,
      };
    },
    enabled: encargadoId !== null,
    staleTime: 60_000,
  });
}


/** KPIs sueltos, para donde no haga falta todo el Dashboard. */
export function useKpis(filtros: Filtros) {
  return useQuery({
    queryKey: ['fn_dashboard_kpis', claveDeFiltros(filtros)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_dashboard_kpis', filtrosParaRpc(filtros));
      if (error) throw error;
      return data[0] as Kpis;
    },
    staleTime: 60_000,
  });
}

/** Serie mensual suelta. */
export function useSerieMensual(filtros: Filtros) {
  return useQuery({
    queryKey: ['fn_ventas_mensuales', claveDeFiltros(filtros)],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_ventas_mensuales', filtrosParaRpc(filtros));
      if (error) throw error;
      return (data ?? []) as FilaVentaMensual[];
    },
    staleTime: 60_000,
  });
}

/** Ranking de encargados. */
export function useRankingEncargados(filtros: Filtros, limite = 8) {
  return useQuery({
    queryKey: ['fn_ventas_por_encargado', claveDeFiltros(filtros), limite],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_ventas_por_encargado', {
        ...filtrosParaRpc(filtros),
        p_limite: limite,
      });
      if (error) throw error;
      return (data ?? []) as FilaRankingEncargado[];
    },
    staleTime: 60_000,
  });
}