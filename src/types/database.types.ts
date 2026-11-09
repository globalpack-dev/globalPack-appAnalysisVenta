import type { ClienteCartera, ComprasCliente, FilaActividad, FilaCartera, FilaOperativo } from '../hooks/useCartera';

/**
 * Tipos de la base de datos de Supabase.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ARCHIVO ESCRITO A MANO. Regenerar si cambia el esquema.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Se puede reemplazar por el generado con:
 *
 *      npx supabase login
 *      npx supabase gen types typescript --project-id <project-ref> \
 *        > src/types/database.types.ts
 *
 *  Eso exige `supabase login`, así que se optó por escribirlo a mano: el esquema
 *  ya está documentado en `database.sql` y en `supabase/*.sql`, ambos versionados.
 *
 *  ── Cuándo hay que regenerarlo ──────────────────────────────────────────────
 *  · Cambias una tabla en database.sql
 *  · Agregás o quitás una columna
 *  · Cambiás el tipo de alguna columna
 *  · Cambiás una función de supabase/*.sql y su tipo de retorno
 *
 *  Si se olvida, TypeScript sigue aceptando campos que ya no existen y el error
 *  aparece recién en producción, como un `undefined` en pantalla.
 *
 *  Mapa: INTEGER / SMALLINT / BIGINT / NUMERIC → number · VARCHAR → string ·
 *  NULL → `| null`
 */

// ─── Tablas ────────────────────────────────────────────────────────────────────

/**
 * Personal con acceso al sistema.
 *
 * El `id` es la misma uuid que `auth.users.id`: un usuario de acceso es
 * exactamente un empleado. La fila la crea el trigger `on_auth_user_created`.
 *
 * Esta tabla NO guarda contraseñas. El email y el hash viven en `auth.users`,
 * que administra Supabase y no se ve desde el SQL Editor.
 */
export type empleados = {
  id: string
  nombre: string
  email: string
  /** `consulta` puede dar de alta y editar datos de negocio, pero no borrar. */
  rol: 'admin' | 'consulta'
  /** false impide el acceso sin borrar la cuenta ni la fila. */
  activo: boolean
  created_at: string
}

export type periodos = {
  id_periodo: number
  anio: number
  mes: number
  nombre_mes: string
}

export type localidades = {
  id_localidad: number
  nombre: string
}

export type sucursales = {
  id_sucursal: number
  nombre: string
}

export type supervisores = {
  id_supervisor: number
  nombre_completo: string
}

export type encargados_ventas = {
  id_encargado_venta: number
  codigo_sector_venta: string
  nombre_completo: string
  /** NULL cuando el encargado no tiene supervisor asignado. */
  id_supervisor: number | null
}

export type clientes = {
  id_cliente: number
  codigo_cliente: string
  razon_social: string
  /**
   * NULL en parte de los clientes reales. El prototipo hacía
   * `nombreFantasia.charAt(0)` sin protección, lo que rompe la app.
   * Usar siempre `?.` o `COALESCE`.
   */
  nombre_fantasia: string | null
  id_localidad: number | null
}

export type unidades_negocio = {
  id_unidad_negocio: number
  nombre: string
}

export type divisiones = {
  id_division: number
  id_unidad_negocio: number
  nombre: string
}

export type familias = {
  id_familia: number
  /**
   * Nullable desde `supabase/16_familia_division_nullable.sql`: en el Excel real
   * una misma familia aparece en varias divisiones, así que la división vive en
   * el producto y la familia queda sin colgar de una.
   */
  id_division: number | null
  nombre: string
}

export type marcas = {
  id_marca: number
  nombre: string
}

/**
 * Las 9 marcas del archivo del cliente.
 *
 * TRES de ellas no son alcohol: RED BULL, H2Oh y PEPSI BLACK. Son bebidas.
 * `es_alcoholica` es la que decide, y vive en la tabla y no en el código: si
 * mañana entra una marca nueva, la decisión se toma en un UPDATE.
 *
 * Ver 27_alcohol_ico.sql.
 */
export type marcas_alcohol = {
  id_marca: number
  es_alcoholica: boolean
}

export type calibres = {
  id_calibre: number
  nombre: string
}

export type productos = {
  id_producto: number
  codigo_producto: string
  nombre: string
  id_marca: number | null
  id_calibre: number | null
  id_familia: number
  /**
   * La división cuelga del producto, no de la familia.
   *
   * En el Excel real una misma familia aparece en hasta 8 divisiones
   * distintas ("REGULAR" está en GASEOSAS, CERVEZAS, VINOS…), así que la
   * jerarquía del modelo original no alcanza y el producto guarda la suya.
   * Ver `supabase/15_division_en_producto.sql`.
   */
  id_division: number | null
}

export type clasificaciones_marketing = {
  id_clasificacion_marketing: number
  canal_ajustado: string | null
  segmento_mkt: string | null
  canal_mkt: string | null
  subcanal_mkt: string | null
}

export type ventas = {
  id_venta: number
  id_periodo: number
  id_cliente: number
  id_sucursal: number
  id_encargado_venta: number
  id_producto: number
  id_clasificacion_marketing: number | null
  importe_neto: number
  importe_bruto: number
  importe_final: number
  cantidad_bultos: number
  cantidad_hl: number
}

// ─── Vista ─────────────────────────────────────────────────────────────────────

/** Fila de `v_ventas_detalle`. Base de la tabla de Sales.tsx. */
export type FilaVentaDetalle = {
  id_venta: number
  id_periodo: number
  id_cliente: number
  id_sucursal: number
  id_encargado_venta: number
  id_producto: number
  id_clasificacion_marketing: number | null
  anio: number
  mes: number
  nombre_mes: string
  periodo_label: string
  codigo_cliente: string
  cliente_nombre: string
  sucursal_nombre: string
  codigo_sector_venta: string
  encargado_nombre: string
  supervisor_nombre: string | null
  codigo_producto: string
  producto_nombre: string
  marca_nombre: string | null
  familia_nombre: string
  division_nombre: string
  unidad_negocio_nombre: string
  calibre_nombre: string | null
  canal_ajustado: string | null
  segmento_mkt: string | null
  canal_mkt: string | null
  subcanal_mkt: string | null
  importe_neto: number
  importe_bruto: number
  importe_final: number
  cantidad_bultos: number
  cantidad_hl: number
  /**
   * Categoría del producto. Viene de divisiones.id_categoria vía la vista.
   */
  categoria_nombre: string | null
}

// ─── Tipos de retorno de las funciones ─────────────────────────────────────────

/**
 * Los 7 filtros del panel "Filtros globales". `null` o `undefined` = sin filtro.
 *
 * Antes eran decorativos: cambiaban el color del `<select>` y ningún número se
 * movía. Ahora cada función los aplica de verdad.
 */
export type Filtros = {
  p_anio?: number | null
  p_mes?: number | null
  p_cliente?: number | null
  p_localidad?: number | null
  p_marca?: number | null
  p_encargado?: number | null
  p_canal?: string | null
  /**
   * Unidad de negocio. No está en la tabla `ventas`: sale por la cadena
   * producto → familia → división → UN, y `fn_ventas_filtradas` la resuelve con
   * un EXISTS. Por eso este filtro no se puede escribir como una columna de
   * `v_ventas_detalle`.
   */
  p_unidad_negocio?: number | null
  /**
   * Sólo los usan las funciones de catálogo de producto (`fn_productos` y
   * `fn_jerarquia_comercial`). El resto de las funciones SQL no los acepta.
   */
  p_calibre?: number | null
  p_familia?: number | null
  /**
   * Categoría de producto. Acepta un nombre, no un id. "Marketplace" trae las
   * tres subcategorías (Mercadería, Alimentos, Yerbas) porque el filtro compara
   * contra el nombre de la categoría O el de su padre.
   *
   * La categoría vive en `divisiones.id_categoria`, no en el producto: así un
   * producto nuevo hereda la de su división sin tocar nada.
   */
  p_categoria?: string | null
}

/** Fila de `fn_dashboard_kpis`. */
export type Kpis = {
  total_neto: number
  total_bruto: number
  total_final: number
  total_bultos: number
  total_hl: number
  operaciones: number
  /**
   * Cliente activo = compró en el último período con ventas. La base no guarda
   * fechas sino períodos mensuales, así que "últimos 30 días" equivale al
   * último mes con movimientos.
   */
  clientes_activos: number
  productos_vendidos: number
}

/**
 * Fila de `fn_dashboard_variaciones`.
 *
 * Cada variación es un porcentaje (14.3 = +14.3%), no un factor. Es `null`
 * cuando no se puede calcular: filtro sin datos, un solo período con ventas, o
 * período anterior en cero. La página muestra "—" en vez de 0%, porque 0%
 * sugeriría que se mantuvo cuando en realidad no hay con qué comparar.
 *
 * `anio_ref` / `mes_ref` dicen contra qué período se comparó, para poder
 * ponerlo en el subtítulo del KPI y que el número sea interpretable.
 */
export type Variaciones = {
  variacion_neto: number | null
  variacion_bruto: number | null
  variacion_final: number | null
  variacion_bultos: number | null
  variacion_hl: number | null
  variacion_operaciones: number | null
  anio_ref: number | null
  mes_ref: number | null
}

/** Fila de `fn_ventas_mensuales`. */
export type FilaVentaMensual = {
  anio: number
  mes: number
  nombre_mes: string
  mes_corto: string
  importe_neto: number
  importe_bruto: number
  importe_final: number
  cantidad_bultos: number
  cantidad_hl: number
}

/** Fila de `fn_top_clientes`. */
export type FilaTopCliente = {
  id_cliente: number
  cliente_nombre: string
  ventas: number
  participacion: number
}

/** Fila de `fn_ventas_por_encargado`. */
export type FilaEncargado = {
  id_encargado_venta: number
  encargado_nombre: string
  supervisor_nombre: string | null
  ventas: number
  clientes: number
}

/**
 * Fila de `fn_ventas_por_encargado`: el ranking de "Ventas por Promotor".
 *
 * La columna de id se llama `id_encargado_venta`, IGUAL que en la tabla
 * `encargados_ventas`. Antes este tipo declaraba `id_encargado`, un nombre que
 * no existe en ninguna función: el compilador daba el visto bueno a
 * `s.id_encargado`, que llegaba `undefined` a la base y reventaba con
 * "invalid input syntax for type integer: undefined" al abrir la ficha.
 */
export type FilaRankingEncargado = {
  id_encargado_venta: number
  encargado_nombre: string
  /** NULL cuando el encargado no tiene supervisor asignado. */
  supervisor_nombre: string | null
  ventas: number
  clientes: number
}

/** Fila de `fn_encargado_marcas`: marcas que vende un encargado. */
export type FilaEncargadoMarca = {
  id_marca: number
  marca_nombre: string
  ventas: number
  unidades: number
  hl: number
}

/** Fila de `encargados_ventas`, con su supervisor y su código de promotor. */
export type Encargado = {
  id_encargado_venta: number
  codigo_sector_venta: string
  nombre_completo: string
  id_supervisor: number | null
}

/** Fila de `fn_clientes`: cliente con metricas y estado activo. */
export type FilaCliente = {
  id_cliente: number
  codigo_cliente: string
  razon_social: string
  /** NULL en parte de los clientes reales. Proteger con `?.` antes de usar. */
  nombre_fantasia: string | null
  id_localidad: number | null
  localidad_nombre: string | null
  ventas_total: number
  ventas_neto: number
  bultos: number
  hl: number
  /** Cuantos encargados distintos atendieron al cliente. */
  encargado_count: number
  /** Promotor actual según `clientes_operativa`; null si no está en la cartera. */
  id_encargado_venta: number | null
  /** Nombre del promotor actual, resuelto desde `encargados_ventas`. */
  encargado_nombre: string | null
  /** "YYYY-MM" del ultimo periodo con ventas, o null si nunca compro. */
  ultima_venta: string | null
  /** Derivado: compro en el ultimo periodo con ventas de toda la base. */
  activo: boolean
}

/** Fila de `fn_cliente_detalle`: historial mensual de un cliente. */
export type FilaHistorialCliente = {
  anio: number
  mes: number
  nombre_mes: string
  mes_corto: string
  ventas: number
  neto: number
  bultos: number
  hl: number
  encargado_nombre: string | null
  supervisor_nombre: string | null
}

/**
 * Fila de `fn_cliente_productos`: un producto comprado por el cliente en un
 * período concreto. `neto` es la suma de `importe_neto` y `ventas` la de
 * `importe_final`, igual que en el historial mensual.
 */
export type FilaProductoCliente = {
  anio: number
  mes: number
  nombre_mes: string
  id_producto: number
  codigo_producto: string
  producto_nombre: string
  marca_nombre: string | null
  calibre_nombre: string | null
  division_nombre: string | null
  unidad_negocio_nombre: string | null
  bultos: number
  hl: number
  neto: number
  ventas: number
}

/** Fila de `fn_ventas_por_localidad`. */
export type FilaLocalidad = {
  id_localidad: number
  localidad_nombre: string
  ventas: number
}

/** Fila de `fn_ventas_por_unidad_negocio`. */
export type FilaUnidadNegocio = {
  id_unidad_negocio: number
  unidad_nombre: string
  ventas: number
  bultos: number
  hl: number
}

/**
 * Fila de `fn_marketing_por`.
 *
 * Devuelve las 4 dimensiones juntas: una fila por combinación de clasificación.
 * El drill-down se hace en el frontend agrupando por la dimensión a mostrar.
 */
export type FilaMarketing = {
  canal_ajustado: string
  segmento_mkt: string | null
  canal_mkt: string | null
  subcanal_mkt: string | null
  ventas: number
  bultos: number
  hl: number
  clientes: number
}

/** Las dimensiones del drill-down, en orden. */
export const NIVELES_MARKETING = ['canal_ajustado', 'segmento', 'canal', 'subcanal'] as const
export type NivelMarketing = (typeof NIVELES_MARKETING)[number]

/** Columna de `FilaMarketing` que corresponde a cada nivel. */
export const COLUMNA_POR_NIVEL: Record<NivelMarketing, keyof FilaMarketing> = {
  canal_ajustado: 'canal_ajustado',
  segmento: 'segmento_mkt',
  canal: 'canal_mkt',
  subcanal: 'subcanal_mkt',
}

/**
 * Fila de `fn_productos`.
 *
 * Las 4 últimas columnas las agrega `15_division_en_producto.sql`. Postgres no
 * permite cambiar el tipo de retorno de una función existente, así que van al
 * final: las 13 originales mantienen su orden y sus tipos.
 */
export type FilaProducto = {
  id_producto: number
  codigo_producto: string
  nombre: string
  id_marca: number | null
  marca_nombre: string | null
  id_calibre: number | null
  calibre_nombre: string | null
  id_familia: number
  familia_nombre: string | null
  ventas: number
  bultos: number
  hl: number
  unidades: number
  id_division: number | null
  division_nombre: string | null
  id_unidad_negocio: number | null
  unidad_nombre: string | null
}

/** Fila de `fn_ventas_por_marca`: la usa el Dashboard para el pie de marcas. */
/** Fila de `fn_ventas_por_marca`: la usa el Dashboard para el pie de marcas. */
export type FilaVentaMarca = {
  id_marca: number | null
  marca_nombre: string | null
  ventas: number
  unidades: number
  hl: number
}

/** Fila de `fn_marcas`: marca con métricas y crecimiento vs. el mes anterior. */
export type FilaMarca = {
  id_marca: number
  marca_nombre: string | null
  ventas: number
  productos: number
  unidades: number
  hl: number
  /**
   * Variacion porcentual entre el ultimo mes con ventas y el anterior.
   * 0 cuando el mes anterior no tuvo ventas, para no dividir por cero.
   */
  crecimiento: number
}

/** Fila de `fn_marca_serie`: evolucion mensual de una marca. */
export type FilaMarcaSerie = {
  anio: number
  mes: number
  nombre_mes: string
  mes_corto: string
  importe_neto: number
  cantidad_bultos: number
  cantidad_hl: number
}

/**
 * Fila de `fn_marca_detalle`.
 *
 * Productos y clientes vienen en el mismo conjunto, distinguidos por `tipo`.
 * Es mas simple que dos funciones cuando la ficha los muestra juntos.
 */
export type FilaMarcaDetalle = {
  tipo: 'producto' | 'cliente'
  id: number
  codigo: string
  nombre: string
  ventas: number
  unidades: number
  hl: number
}

/** Fila simple de catálogo: `id` + `nombre`. La usan calibres y familias. */
export type OpcionSimple = {
  id: number
  nombre: string
}

/**
 * Fila de `fn_jerarquia_comercial`.
 *
 * El arbol viene aplanado: una fila por producto con los ids de sus tres
 * ancestros. El arbol se arma agrupando en el frontend, que es trivial con una
 * fila por hoja.
 */
export type FilaJerarquia = {
  id_unidad_negocio: number
  nombre_unidad: string
  id_division: number
  nombre_division: string
  id_familia: number
  nombre_familia: string
  id_producto: number
  codigo_producto: string
  nombre_producto: string
  ventas: number
  bultos: number
  hl: number
}

/** Fila de `fn_filtros_disponibles`. Alimenta los `<select>` del panel de filtros. */
/**
 * Opción de un `<select>` de filtro.
 *
 * La base la devuelve como un objeto jsonb con una lista por tipo (ver
 * `18_catalogo_jsonb.sql`); el hook la aplana a esta lista antes de que llegue
 * a las páginas.
 */
export type OpcionFiltro = {
  tipo:
    | 'periodo'
    | 'cliente'
    | 'localidad'
    | 'marca'
    | 'encargado'
    | 'canal'
    | 'unidad_negocio'
  /** NULL para los canales: no tienen id propio. */
  id: number | null
  nombre: string
  /**
   * Sólo en `periodo`: mes (1–12) y año reales del período.
   *
   * `id` es `periodos.id_periodo`, pero `fn_ventas_filtradas` compara `p_mes`
   * contra `ventas.mes`; por eso el filtro necesita estos dos campos y no el id.
   * Ver `supabase/45_catalogo_periodo_mes.sql`.
   */
  mes?: number
  anio?: number
}

// ─── Importaciones (archivos 33 y 34) ─────────────────────────────────────────

/**
 * Auditoría de las cargas desde «Cargar datos».
 *
 * Ver `supabase/33_importaciones.sql`. Se abre al empezar (`en_curso`) y se
 * cierra al terminar (`ok` / `error`). `detalle` es jsonb libre.
 */
export type importaciones = {
  id_importacion: number
  usuario: string | null
  tipo: 'ventas' | 'cartera'
  archivo: string
  estado: 'en_curso' | 'ok' | 'error'
  filas_ok: number
  filas_descartadas: number
  error: string | null
  detalle: Record<string, unknown>
  created_at: string
  finalizado_en: string | null
}

/**
 * Foto de la cartera guardada antes de cada reemplazo.
 *
 * Ver `supabase/34_cartera_historial.sql`. Es una tabla ancha: una fila por
 * cliente y por carga. Las pantallas siguen leyendo las tablas vivas.
 */
export type cartera_historial = {
  id_historial: number
  id_importacion: number | null
  fecha_carga: string
  codigo_cliente: string
  id_supervisor: number | null
  nombre_supervisor: string | null
  codigo_encargado: string | null
  nombre_encargado: string | null
  flag_estado: string | null
  subcanal: string | null
  tier: string | null
  visitas: string[]
  tarea_redbull: boolean
  tarea_laton: boolean
  tarea_cvza: boolean
  marcas: string[]
}

// ─── Cliente tipado ────────────────────────────────────────────────────────────

/** Mapas: tabla → { fila a insertar, campos actualizables }. */
/**
 * Para `insert`: todo menos la PK, que la genera Postgres.
 *
 * La PK se pasa explícita. Un template literal `id_${string}` no sirve: también
 * matchearía las claves foráneas (`id_cliente`, `id_producto`…), que sí se
 * escriben al insertar. Con `Omit<T, PK>` esas columnas desaparecían y el insert
 * de `ventas` quedaba tipado como `never`.
 */
export type Insertable<T, Clave extends keyof T> = Omit<T, Clave>

/**
 * Para `update`: cualquier subconjunto de columnas, menos la PK.
 *
 * El `Partial` importa: un update parcial es el caso normal. Sin él, TypeScript
 * exigiría mandar la fila completa y la escritura de un solo campo no compila.
 */
export type Updatable<T, Clave extends keyof T> = Partial<Omit<T, Clave>>

export type Database = {
  public: {
    Tables: {
      periodos: { Row: periodos; Insert: Insertable<periodos, 'id_periodo'>; Update: Updatable<periodos, 'id_periodo'>; Relationships: [] }
      localidades: { Row: localidades; Insert: Insertable<localidades, 'id_localidad'>; Update: Updatable<localidades, 'id_localidad'>; Relationships: [] }
      sucursales: { Row: sucursales; Insert: Insertable<sucursales, 'id_sucursal'>; Update: Updatable<sucursales, 'id_sucursal'>; Relationships: [] }
      supervisores: { Row: supervisores; Insert: Insertable<supervisores, 'id_supervisor'>; Update: Updatable<supervisores, 'id_supervisor'>; Relationships: [] }
      encargados_ventas: {
        Row: encargados_ventas
        Insert: Insertable<encargados_ventas, 'id_encargado_venta'>
        Update: Updatable<encargados_ventas, 'id_encargado_venta'>
        Relationships: [
          {
            foreignKeyName: 'fk_encargado_supervisor'
            columns: ['id_supervisor']
            referencedRelation: 'supervisores'
            referencedColumns: ['id_supervisor']
          },
        ]
      }
      clientes: {
        Row: clientes
        Insert: Insertable<clientes, 'id_cliente'>
        Update: Updatable<clientes, 'id_cliente'>
        Relationships: [
          {
            foreignKeyName: 'fk_cliente_localidad'
            columns: ['id_localidad']
            referencedRelation: 'localidades'
            referencedColumns: ['id_localidad']
          },
        ]
      }
      unidades_negocio: {
        Row: unidades_negocio
        Insert: Insertable<unidades_negocio, 'id_unidad_negocio'>
        Update: Updatable<unidades_negocio, 'id_unidad_negocio'>
        Relationships: []
      }
      divisiones: {
        Row: divisiones
        Insert: Insertable<divisiones, 'id_division'>
        Update: Updatable<divisiones, 'id_division'>
        Relationships: [
          {
            foreignKeyName: 'fk_division_unidad'
            columns: ['id_unidad_negocio']
            referencedRelation: 'unidades_negocio'
            referencedColumns: ['id_unidad_negocio']
          },
        ]
      }
      familias: {
        Row: familias
        Insert: Insertable<familias, 'id_familia'>
        Update: Updatable<familias, 'id_familia'>
        Relationships: [
          {
            foreignKeyName: 'fk_familia_division'
            columns: ['id_division']
            referencedRelation: 'divisiones'
            referencedColumns: ['id_division']
          },
        ]
      }
      marcas: { Row: marcas; Insert: Insertable<marcas, 'id_marca'>; Update: Updatable<marcas, 'id_marca'>; Relationships: [] }
      marcas_alcohol: {
        Row: marcas_alcohol
        Insert: Insertable<marcas_alcohol, 'id_marca'>
        Update: Updatable<marcas_alcohol, 'id_marca'>
        Relationships: []
      }
      calibres: { Row: calibres; Insert: Insertable<calibres, 'id_calibre'>; Update: Updatable<calibres, 'id_calibre'>; Relationships: [] }
      productos: {
        Row: productos
        Insert: Insertable<productos, 'id_producto'>
        Update: Updatable<productos, 'id_producto'>
        Relationships: [
          {
            foreignKeyName: 'fk_producto_marca'
            columns: ['id_marca']
            referencedRelation: 'marcas'
            referencedColumns: ['id_marca']
          },
          {
            foreignKeyName: 'fk_producto_calibre'
            columns: ['id_calibre']
            referencedRelation: 'calibres'
            referencedColumns: ['id_calibre']
          },
          {
            foreignKeyName: 'fk_producto_familia'
            columns: ['id_familia']
            referencedRelation: 'familias'
            referencedColumns: ['id_familia']
          },
        ]
      }
      clasificaciones_marketing: {
        Row: clasificaciones_marketing
        Insert: Insertable<clasificaciones_marketing, 'id_clasificacion_marketing'>
        Update: Updatable<clasificaciones_marketing, 'id_clasificacion_marketing'>
        Relationships: []
      }
      ventas: {
        Row: ventas
        Insert: Insertable<ventas, 'id_venta'>
        Update: Updatable<ventas, 'id_venta'>
        Relationships: [
          {
            foreignKeyName: 'fk_venta_periodo'
            columns: ['id_periodo']
            referencedRelation: 'periodos'
            referencedColumns: ['id_periodo']
          },
          {
            foreignKeyName: 'fk_venta_cliente'
            columns: ['id_cliente']
            referencedRelation: 'clientes'
            referencedColumns: ['id_cliente']
          },
          {
            foreignKeyName: 'fk_venta_sucursal'
            columns: ['id_sucursal']
            referencedRelation: 'sucursales'
            referencedColumns: ['id_sucursal']
          },
          {
            foreignKeyName: 'fk_venta_encargado'
            columns: ['id_encargado_venta']
            referencedRelation: 'encargados_ventas'
            referencedColumns: ['id_encargado_venta']
          },
          {
            foreignKeyName: 'fk_venta_producto'
            columns: ['id_producto']
            referencedRelation: 'productos'
            referencedColumns: ['id_producto']
          },
          {
            foreignKeyName: 'fk_venta_marketing'
            columns: ['id_clasificacion_marketing']
            referencedRelation: 'clasificaciones_marketing'
            referencedColumns: ['id_clasificacion_marketing']
          },
        ]
      }
      empleados: {
        Row: empleados
        Insert: Insertable<empleados, 'id'>
        Update: Updatable<empleados, 'id'>
        Relationships: []
      }
      importaciones: {
        Row: importaciones
        Insert: Insertable<importaciones, 'id_importacion'>
        Update: Updatable<importaciones, 'id_importacion'>
        Relationships: []
      }
      cartera_historial: {
        Row: cartera_historial
        Insert: Insertable<cartera_historial, 'id_historial'>
        Update: Updatable<cartera_historial, 'id_historial'>
        Relationships: [
          {
            foreignKeyName: 'cartera_historial_id_importacion_fkey'
            columns: ['id_importacion']
            referencedRelation: 'importaciones'
            referencedColumns: ['id_importacion']
          },
        ]
      }
    }
    Views: {
      v_ventas_detalle: { Row: FilaVentaDetalle; Relationships: [] }
    }
    Functions: {
      fn_ventas_filtradas: { Args: Filtros; Returns: FilaVentaDetalle[] }
      fn_dashboard_kpis: { Args: Filtros; Returns: Kpis[] }
      fn_dashboard_variaciones: { Args: Filtros; Returns: Variaciones[] }
      /**
       * Las ocho agregaciones del Dashboard en una sola llamada.
       *
       * Existía porque con 8.705 ventas el Dashboard hacía 8 llamadas: 16s en
       * total, y en paralelo daba `statement timeout` por contención de CPU del
       * plan gratuito. El costo por llamada resultó ser fijo (~2s, depende de
       * materializar `v_ventas_detalle`), así que 8 llamadas × 2s se
       * reemplaza por 1 llamada = 2,2s. Ver `21_fn_dashboard_todo.sql`.
       */
      fn_dashboard_todo: {
        Args: Filtros & { p_limite?: number | null }
        Returns: {
          kpis: Kpis
          variaciones: Variaciones | null
          serie: FilaVentaMensual[]
          top_clientes: FilaTopCliente[]
          por_encargado: FilaEncargado[]
          por_localidad: FilaLocalidad[]
          por_unidad: FilaUnidadNegocio[]
          por_marca: FilaMarca[]
        }
      }
      fn_ventas_mensuales: { Args: Filtros; Returns: FilaVentaMensual[] }
      fn_top_clientes: { Args: Filtros & { p_limite?: number }; Returns: FilaTopCliente[] }
      fn_ventas_por_encargado: {
        Args: Filtros & { p_limite?: number }
        Returns: FilaRankingEncargado[]
      }
      fn_encargado_marcas: {
        Args: Filtros & { p_encargado: number }
        Returns: FilaEncargadoMarca[]
      }
      fn_ventas_por_localidad: {
        Args: Filtros & { p_limite?: number }
        Returns: FilaLocalidad[]
      }
      fn_ventas_por_unidad_negocio: { Args: Filtros; Returns: FilaUnidadNegocio[] }
      fn_ventas_por_marca: { Args: Filtros; Returns: FilaVentaMarca[] }
      fn_marketing_por: {
        Args: Filtros & { p_segmento?: string | null; p_canal_mkt?: string | null }
        Returns: FilaMarketing[]
      }
      fn_ventas_pagina: {
        Args: Filtros & { p_desde?: number; p_cantidad?: number }
        Returns: (FilaVentaDetalle & { total_filas: number })[]
      }
      /** Devuelve true si el usuario actual es un empleado activo con rol admin. */
      es_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      /**
       * Cambia el nombre del empleado logueado. Va por función SECURITY DEFINER
       * para no abrir un UPDATE general sobre `empleados` (eso dejaría tocar
       * `rol` y `activo`). Ver `supabase/40_rls_solo_lectura.sql`.
       */
      actualizar_mi_nombre: { Args: { nuevo: string }; Returns: undefined }
      /**
       * Cambia rol y estado de otro empleado. Va por RPC para que la base impida
       * autodesactivarse o dejar el sistema sin administradores activos.
       * Ver `supabase/44_admin_empleados.sql`.
       */
      fn_actualizar_empleado: {
        Args: { p_id: string; p_rol: 'admin' | 'consulta'; p_activo: boolean }
        Returns: undefined
      }
      fn_productos: { Args: Filtros; Returns: FilaProducto[] }
      fn_jerarquia_comercial: { Args: Filtros; Returns: FilaJerarquia[] }
      /**
       * Devuelve UN objeto jsonb con el array de clientes, no una fila por
       * cliente: con 1.542 clientes la versión tabla se truncaba a 1.000 por
       * el `db-max-rows` de PostgREST. El hook lo normaliza a `FilaCliente[]`.
       */
      /**
       * `p_promotor` filtra por la cartera vigente (`clientes_operativa`), no
       * por las ventas: la lista se restringe a los clientes de ese promotor.
       */
      fn_clientes: {
        Args: Filtros & { p_promotor?: number | null }
        Returns: FilaCliente[]
      }
      fn_cliente_detalle: {
        Args: Filtros & { p_cliente: number }
        Returns: FilaHistorialCliente[]
      }
      fn_cliente_productos: {
        Args: {
          p_cliente: number
          p_anio?: number | null
          p_mes?: number | null
          p_localidad?: number | null
          p_marca?: number | null
          p_encargado?: number | null
          p_canal?: string | null
        }
        Returns: FilaProductoCliente[]
      }
      fn_marcas: { Args: Filtros; Returns: FilaMarca[] }
      fn_marca_serie: {
        Args: Filtros & { p_marca: number }
        Returns: FilaMarcaSerie[]
      }
      fn_marca_detalle: {
        Args: Filtros & { p_marca: number }
        Returns: FilaMarcaDetalle[]
      }
      fn_filtros_disponibles: {
        Args: Record<PropertyKey, never>
        /**
         * Devuelve UN objeto con una lista por tipo, no una fila por opción:
         * con 1.542 clientes la lista se truncaba a 1.000 filas por el
         * `db-max-rows` de PostgREST y se perdían los períodos.
         * El hook lo aplana a `OpcionFiltro[]`.
         */
        Returns: Record<
          'periodo' | 'cliente' | 'localidad' | 'marca' | 'encargado' | 'canal' | 'unidad_negocio',
          // `mes` y `anio` sólo vienen en `periodo` (archivo 45).
          Array<{ id: number | null; nombre: string; mes?: number; anio?: number }>
        >
      }
      fn_calibres: { Args: Record<PropertyKey, never>; Returns: OpcionSimple[] }
      fn_familias: { Args: Record<PropertyKey, never>; Returns: OpcionSimple[] }
      /**
       * Pantalla de Supervisores. Complementa fn_supervisores_cartera (archivo 23).
       * fn_cartera_clientes y fn_cliente_compras devuelven jsonb: son hasta
       * 1.434 clientes y PostgREST corta la respuesta a 1.000 filas.
       */
      fn_supervisores_cartera: {
        Args: Record<PropertyKey, never>
        Returns: FilaCartera[]
      }
      fn_cartera_marcas: {
        Args: { p_supervisor?: number | null }
        Returns: Array<{
          id_marca: number
          marca_nombre: string
          /** False en RED BULL, H2Oh y PEPSI BLACK: son bebidas, no alcohol. */
          es_alcoholica: boolean
          compraron: number
          clientes_alcohol: number
          penetracion: number
          sin_comprar: number
        }>
      }
      fn_cartera_clientes: {
        Args: { p_supervisor?: number | null }
        Returns: ClienteCartera[]
      }
      fn_cliente_compras: {
        Args: { p_cliente: string }
        Returns: ComprasCliente | null
      }
      /**
       * Capa operativa por cliente (archivo 30): visitas, tareas, subcanal y
       * tier. Devuelve jsonb: un supervisor tiene hasta 1.610 clientes y
       * PostgREST corta las tablas a 1.000 filas.
       */
      fn_operativos: {
        Args: { p_supervisor?: number | null; p_encargado?: number | null }
        Returns: FilaOperativo[]
      }
      /**
       * Actividad de un promotor (archivo 31): sus clientes con visitas,
       * tareas, compras y faltantes. Devuelve jsonb por el límite de 1.000
       * filas de PostgREST.
       */
      fn_actividad_promotor: {
        Args: { p_encargado: number }
        Returns: FilaActividad[]
      }
      fn_categorias: {
        Args: Record<PropertyKey, never>
        Returns: Array<{ nombre: string; id_padre: string | null }>
      }
    }
    Enums: Record<PropertyKey, never>
  }
}