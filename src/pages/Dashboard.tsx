import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, TrendingUp, TrendingDown, Package, Users, ShoppingCart, Droplets, Filter, X } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useDashboard } from '../hooks/useDashboard';
import { FILTROS_VACIOS, useFiltros, claveDeFiltros } from '../hooks/useFiltros';
import { useFiltrosDisponibles, agruparOpciones } from '../hooks/useCatalogos';
import { fmtPesos, fmtNum } from '../lib/format';
import ChartTooltip from '../components/ui/ChartTooltip';
import { colorDe } from '../components/ui/chartColors';
import EstadoDatos from '../components/ui/EstadoDatos';
import type { Filtros as TipoFiltros, Kpis } from '../types/database.types';

/**
 * Dashboard.
 *
 * Los filtros globales ahora alimentan `useFiltros`, y ese estado va a las ocho
 * consultas de `useDashboard`. En el prototipo los siete `<select>` escribían en
 * un `useState` que no leía nadie: el botón "Aplicar filtros" no hacía nada y
 * cambiar un filtro no movía un solo número. Por eso acá no hay botón: cada
 * cambio dispara las consultas.
 *
 * Las opciones de los `<select>` salen de `fn_filtros_disponibles`, no de listas
 * escritas a mano. Antes el filtro de Canal mandaba `'off'` contra un
 * `canal_ajustado` que vale `'Off-Trade'`: sin coincidencia, siempre vacío.
 *
 * Las variaciones de los KPI son reales (`fn_dashboard_variaciones`). Antes eran
 * literales del prototipo — "+14.3%" en todos los KPI de la primera fila — que
 * conviven con datos ciertos y los contradicen.
 */

function KPICard({ label, value, sub, subPositive, icon, accent }: {
  label: string; value: string; sub?: string; subPositive?: boolean; icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 border" style={{ borderColor: '#E2E8F0' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}12` }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
        {sub && (
          <div className="flex items-center gap-1 text-[11px] font-500 px-1.5 py-0.5 rounded"
            style={{ background: subPositive === false ? '#FEF2F2' : '#F0FDF4', color: subPositive === false ? '#EF4444' : '#059669', fontFamily: 'JetBrains Mono' }}>
            {subPositive === false ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
            {sub}
          </div>
        )}
      </div>
      <div className="font-display font-700 text-xl leading-none mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>{value}</div>
      <div className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>{label}</div>
    </div>
  );
}

/**
 * Badge de variación.
 *
 * Sin período anterior la función devuelve null. Se muestra "—" en vez de 0%
 * porque un 0% afirmaría que la cifra se mantuvo, cuando lo cierto es que no
 * hay con qué comparar.
 */
function variacion(v: number | null | undefined): { texto: string; positivo: boolean } | null {
  if (v === null || v === undefined) return null;
  return { texto: `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, positivo: v >= 0 };
}

export default function Dashboard() {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtros, setFiltrosState] = useState<TipoFiltros>(FILTROS_VACIOS);
  // En `useCallback`: `useFiltros` memoriza `setFiltro` con esta referencia, y
  // sin esto cambiaría en cada render y con ella la queryKey de las ocho
  // consultas (ver el comentario del hook).
  const setFiltros = useCallback((f: TipoFiltros) => setFiltrosState(f), []);
  const { setFiltro } = useFiltros(filtros, setFiltros);

  const {
    kpis, serie, topClientes, porEncargado, porLocalidad, porUnidad, porMarca,
    variaciones, isPending, error, kpisListos,
  } = useDashboard(filtros);

  const { data: opcionesRaw } = useFiltrosDisponibles();
  const opciones = useMemo(() => agruparOpciones(opcionesRaw ?? []), [opcionesRaw]);

  // El `<select>` de Mes muestra el id del período (único), pero el filtro que
  // viaja al RPC es el mes real (1–12) más el año. Ver archivo 45.
  const periodoActual = useMemo(
    () => opciones.periodos.find((p) => p.mes === filtros.p_mes && p.anio === filtros.p_anio) ?? null,
    [opciones.periodos, filtros.p_mes, filtros.p_anio],
  );

  const hayFiltros = claveDeFiltros(filtros) !== claveDeFiltros(FILTROS_VACIOS);

  // "Ene – Oct 2025" estaba escrito a mano y con filtros aplicados mentía. Sale
  // del rango real de la serie.
  const rangoPeriodo = useMemo(() => {
    if (serie.length === 0) return null;
    const pri = serie[0];
    const ult = serie[serie.length - 1];
    const rango =
      pri.anio === ult.anio
        ? `${pri.nombre_mes} – ${ult.nombre_mes} ${ult.anio}`
        : `${pri.nombre_mes} ${pri.anio} – ${ult.nombre_mes} ${ult.anio}`;
    return `${rango} · Neto vs. Final`;
  }, [serie]);

  /**
   * La evolución mensual necesita dos períodos como mínimo: con uno solo sería
   * una raya con un punto. Mientras eso pase, el slot ancho muestra la
   * composición del importe, que sale de los KPIs y no depende de la historia.
   * Al cargar un mes anterior, la evolución vuelve sola.
   */
  const hayEvolucion = serie.length >= 2;

  const venXUN = useMemo(
    () => porUnidad.map((u, i) => ({ name: u.unidad_nombre, ventas: Number(u.ventas), color: colorDe(i) })),
    [porUnidad],
  );

  const topClientesGrafico = useMemo(
    () => topClientes.map((c) => ({ name: c.cliente_nombre, ventas: Number(c.ventas) })),
    [topClientes],
  );

  const topEncargados = useMemo(
    () => porEncargado.map((e, i) => ({ name: e.encargado_nombre, ventas: Number(e.ventas), color: colorDe(i) })),
    [porEncargado],
  );

  const topLocalidades = useMemo(
    () => porLocalidad.map((l) => ({
      // Las ventas de clientes sin localidad llegan con `null` (LEFT JOIN en
      // fn_dashboard_todo). Sin este fallback la barra sale sin nombre.
      name: l.localidad_nombre?.trim() || 'Sin localidad',
      ventas: Number(l.ventas),
    })),
    [porLocalidad],
  );

  const marcasGrafico = useMemo(
    () => porMarca.map((m, i) => ({ id: m.id_marca, name: m.marca_nombre ?? '—', ventas: Number(m.ventas), color: colorDe(i) })),
    [porMarca],
  );

  // Referencia de las barras de localidad: la mayor. Si no hay datos, un 1 para
  // que la división no sea por cero (aunque en ese caso no se dibuja nada).
  const maxLocalidad = topLocalidades[0]?.ventas || 1;

  /** "2025-10" del período contra el que se comparan las variaciones. */
  const refPeriodo =
    variaciones?.anio_ref && variaciones.mes_ref
      ? `${variaciones.anio_ref}-${String(variaciones.mes_ref).padStart(2, '0')}`
      : null;

  return (
    <div className="p-5 space-y-5">
      {/* Filtros globales */}
      <div className="bg-white rounded-xl border" style={{ borderColor: '#E2E8F0' }}>
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm"
        >
          <div className="flex items-center gap-2">
            <Filter size={14} style={{ color: '#1D4ED8' }} />
            <span className="font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>Filtros globales</span>
            {hayFiltros && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-500" style={{ background: '#EFF6FF', color: '#1D4ED8', fontFamily: 'Inter' }}>
                Activos
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              Período: {periodoActual?.etiqueta ?? (filtros.p_anio ?? 'todos')}
              {filtros.p_mes !== null && !periodoActual ? ` — mes ${filtros.p_mes}` : ''}
            </span>
            <ChevronDown size={14} style={{ color: '#94A3B8', transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </div>
        </button>

        {filtersOpen && (
          <div className="px-4 pb-4 border-t" style={{ borderColor: '#F1F5F9' }}>
            <div className="pt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
              <SelectFiltro
                label="Año"
                valor={filtros.p_anio === null ? '' : String(filtros.p_anio)}
                placeholder="Todos"
                onChange={(v) => {
                  const anio = v === '' ? null : Number(v);
                  // Sin año no se puede representar un mes en el `<select>`:
                  // el mismo mes puede existir en varios años. Al volver a
                  // "Todos", también se limpia el mes.
                  const mesSigueValido =
                    anio !== null &&
                    filtros.p_mes !== null &&
                    opciones.periodos.some((p) => p.anio === anio && p.mes === filtros.p_mes);
                  // Un solo setFiltros: dos setFiltro seguidos partirían del
                  // mismo `filtros` y el segundo pisaría al primero.
                  setFiltros({
                    ...filtros,
                    p_anio: anio,
                    p_mes: mesSigueValido ? filtros.p_mes : null,
                  });
                }}
                opciones={opciones.anios.map((a) => ({ valor: String(a), texto: String(a) }))}
              />
              <SelectFiltro
                label="Mes"
                valor={periodoActual ? String(periodoActual.id) : ''}
                placeholder="Todos"
                onChange={(v) => {
                  const p = opciones.periodos.find((x) => String(x.id) === v) ?? null;
                  setFiltros({
                    ...filtros,
                    p_mes: p ? p.mes : null,
                    p_anio: p ? p.anio : null,
                  });
                }}
                opciones={opciones.periodos
                  .filter((p) => filtros.p_anio === null || p.anio === filtros.p_anio)
                  .map((p) => ({ valor: String(p.id), texto: p.etiqueta }))}
              />
              <SelectFiltro
                label="Cliente"
                valor={filtros.p_cliente === null ? '' : String(filtros.p_cliente)}
                placeholder="Todos"
                onChange={(v) => setFiltro('p_cliente', v === '' ? null : Number(v))}
                opciones={opciones.clientes.map((c) => ({ valor: String(c.id), texto: c.nombre }))}
              />
              <SelectFiltro
                label="Localidad"
                valor={filtros.p_localidad === null ? '' : String(filtros.p_localidad)}
                placeholder="Todas"
                onChange={(v) => setFiltro('p_localidad', v === '' ? null : Number(v))}
                opciones={opciones.localidades.map((l) => ({ valor: String(l.id), texto: l.nombre }))}
              />
              <SelectFiltro
                label="Marca"
                valor={filtros.p_marca === null ? '' : String(filtros.p_marca)}
                placeholder="Todas"
                onChange={(v) => setFiltro('p_marca', v === '' ? null : Number(v))}
                opciones={opciones.marcas.map((m) => ({ valor: String(m.id), texto: m.nombre }))}
              />
              <SelectFiltro
                label="Encargado"
                valor={filtros.p_encargado === null ? '' : String(filtros.p_encargado)}
                placeholder="Todos"
                onChange={(v) => setFiltro('p_encargado', v === '' ? null : Number(v))}
                opciones={opciones.encargados.map((e) => ({ valor: String(e.id), texto: e.nombre }))}
              />
              <SelectFiltro
                label="Canal"
                valor={filtros.p_canal ?? ''}
                placeholder="Todos"
                // Sin cambio de tipo: `canal` es text, no un id numérico.
                onChange={(v) => setFiltro('p_canal', v === '' ? null : v)}
                opciones={opciones.canales.map((c) => ({ valor: c, texto: c }))}
              />
              <SelectFiltro
                label="Unidad neg."
                valor={filtros.p_unidad_negocio === null ? '' : String(filtros.p_unidad_negocio)}
                placeholder="Todas"
                onChange={(v) => setFiltro('p_unidad_negocio', v === '' ? null : Number(v))}
                opciones={opciones.unidades.map((u) => ({ valor: String(u.id), texto: u.nombre }))}
              />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setFiltros(FILTROS_VACIOS)}
                className="text-xs px-3 py-1.5 rounded-md font-500 flex items-center gap-1"
                style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}
              >
                <X size={11} /> Limpiar filtros
              </button>
              <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                Los filtros se aplican al instante.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* KPIs. El error se toma de `useDashboard`, que ya agrega las ocho
          consultas: si alguna falla, el aviso va acá y no en cada tarjeta. */}
      <EstadoDatos cargando={!kpisListos} error={error}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              label="Ventas Netas" value={fmtPesos(kpis.total_neto)} accent="#1D4ED8" icon={<TrendingUp size={16} />}
              {...badge(variacion(variaciones?.variacion_neto))}
            />
            <KPICard
              label="Ventas Brutas" value={fmtPesos(kpis.total_bruto)} accent="#7C3AED" icon={<TrendingUp size={16} />}
              {...badge(variacion(variaciones?.variacion_bruto))}
            />
            <KPICard
              label="Ventas Finales" value={fmtPesos(kpis.total_final)} accent="#059669" icon={<TrendingUp size={16} />}
              {...badge(variacion(variaciones?.variacion_final))}
            />
            <KPICard
              label="Operaciones" value={fmtNum(kpis.operaciones)} accent="#0891B2" icon={<ShoppingCart size={16} />}
              {...badge(variacion(variaciones?.variacion_operaciones))}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              label="Cantidad Bultos" value={fmtNum(kpis.total_bultos)} accent="#D97706" icon={<Package size={16} />}
              {...badge(variacion(variaciones?.variacion_bultos))}
            />
            <KPICard
              label="Hectolitros (HL)" value={fmtNum(kpis.total_hl)} accent="#DC2626" icon={<Droplets size={16} />}
              {...badge(variacion(variaciones?.variacion_hl))}
            />
            <KPICard
              label="Clientes Activos" value={fmtNum(kpis.clientes_activos)} accent="#DB2777" icon={<Users size={16} />}
            />
            <KPICard
              label="Productos Vendidos" value={fmtNum(kpis.productos_vendidos)} accent="#65A30D" icon={<Package size={16} />}
            />
          </div>
          {refPeriodo && (
            <p className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              Las variaciones comparan contra el mes anterior a {refPeriodo}.
            </p>
          )}
        </div>
      </EstadoDatos>

      {/* Gráficos fila 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Evolución */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                {hayEvolucion ? 'Evolución de Ventas' : 'Composición del Importe'}
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                {hayEvolucion
                  ? (rangoPeriodo ?? 'Sin períodos con ventas')
                  : 'Bruto → Neto → Final · un solo período cargado'}
              </p>
            </div>
            {/* Sin la serie "Objetivo": no hay metas en el Excel, así que la
                línea no tenía de dónde salir. Vuelve cuando las carguemos. */}
            {hayEvolucion && (
              <div className="flex gap-3 text-[11px]">
                {[{ label: 'Neto', color: '#1D4ED8' }, { label: 'Final', color: '#059669' }].map((l) => (
                  <span key={l.label} className="flex items-center gap-1.5" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                    <span className="w-3 h-0.5 inline-block rounded" style={{ background: l.color }} />
                    {l.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <EstadoDatos
            cargando={isPending}
            error={error}
            vacio={serie.length === 0}
            mensajeVacio="No hay ventas en el período seleccionado"
          >
            {!hayEvolucion ? (
              <ComposicionImporte kpis={kpis} />
            ) : (
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={serie} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gNeto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1D4ED8" stopOpacity={0.12} />
                      <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gFinal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.1} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="mes_corto" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={fmtPesosCompacto} width={54} />
                  <Tooltip content={<ChartTooltip mostrarSerie />} />
                  <Area type="monotone" dataKey="importe_neto" name="Neto" stroke="#1D4ED8" strokeWidth={2} fill="url(#gNeto)" />
                  <Area type="monotone" dataKey="importe_final" name="Final" stroke="#059669" strokeWidth={1.5} fill="url(#gFinal)" />
                </AreaChart>
            </ResponsiveContainer>
            )}
          </EstadoDatos>
        </div>

        {/* Marcas */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Ventas por Marca</h3>
          <p className="text-[11px] mb-4" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>Participación acumulada</p>
          <EstadoDatos
            cargando={isPending}
            error={error}
            vacio={marcasGrafico.length === 0}
            mensajeVacio="No hay ventas por marca en el período"
          >
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie data={marcasGrafico} cx="50%" cy="50%" innerRadius={38} outerRadius={60} paddingAngle={2} dataKey="ventas" nameKey="name">
                  {marcasGrafico.map((m) => <Cell key={m.id} fill={m.color} />)}
                </Pie>
                <Tooltip formatter={(v: unknown) => fmtPesos(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-1.5">
              {marcasGrafico.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-center gap-2 text-[11px]">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: m.color }} />
                  <span className="flex-1 truncate" style={{ color: '#64748B', fontFamily: 'Inter' }}>{m.name}</span>
                  <span className="font-500" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>{fmtPesos(m.ventas)}</span>
                </div>
              ))}
            </div>
          </EstadoDatos>
        </div>
      </div>

      {/* Gráficos fila 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top clientes */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Top Clientes por Ventas</h3>
          <p className="text-[11px] mb-4" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            {filtros.p_anio ? `Acumulado ${filtros.p_anio}` : 'Acumulado de todo el período'}
          </p>
          <EstadoDatos
            cargando={isPending}
            error={error}
            vacio={topClientesGrafico.length === 0}
            mensajeVacio="No hay clientes con ventas en el período"
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topClientesGrafico} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={fmtPesosCompacto} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<ChartTooltip mostrarSerie />} />
                <Bar dataKey="ventas" name="Ventas" fill="#1D4ED8" radius={[0, 4, 4, 0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          </EstadoDatos>
        </div>

        {/* Unidad de negocio + localidad */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-3" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Ventas por Unidad de Negocio</h3>
            <EstadoDatos
              cargando={isPending}
              error={error}
              vacio={venXUN.length === 0}
              mensajeVacio="Sin ventas por unidad de negocio"
            >
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={venXUN} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={fmtPesosCompacto} width={54} />
                  <Tooltip content={<ChartTooltip mostrarSerie />} />
                  <Bar dataKey="ventas" name="Ventas" radius={[4, 4, 0, 0]}>
                    {venXUN.map((u, i) => <Cell key={u.name} fill={u.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </EstadoDatos>
          </div>

          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-3" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Distribución Geográfica</h3>
            <EstadoDatos
              cargando={isPending}
              error={error}
              vacio={topLocalidades.length === 0}
              mensajeVacio="Sin ventas por localidad"
            >
              <div className="space-y-1.5">
                {topLocalidades.slice(0, 5).map((l, i) => (
                  <div key={l.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-16 flex-shrink-0 truncate" title={l.name} style={{ color: '#64748B', fontFamily: 'Inter' }}>{l.name}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                      <div className="h-full rounded-full" style={{ width: `${(l.ventas / maxLocalidad) * 100}%`, background: colorDe(i) }} />
                    </div>
                    <span className="w-16 text-right flex-shrink-0 font-500" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>{fmtPesos(l.ventas)}</span>
                  </div>
                ))}
              </div>
            </EstadoDatos>
          </div>
        </div>
      </div>

      {/* Encargados */}
      <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
        <h3 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Ventas por Promotor</h3>
        <p className="text-[11px] mb-4" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          Por encargado de ventas
        </p>
        <EstadoDatos
          cargando={isPending}
          error={error}
          vacio={topEncargados.length === 0}
          mensajeVacio="Sin ventas por encargado"
        >
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={topEncargados} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={fmtPesosCompacto} width={54} />
              <Tooltip content={<ChartTooltip mostrarSerie />} />
              <Bar dataKey="ventas" name="Ventas" radius={[4, 4, 0, 0]}>
                {topEncargados.map((c, i) => <Cell key={c.name} fill={c.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </EstadoDatos>
      </div>
    </div>
  );
}

// ─── Piezas chicas ────────────────────────────────────────────────────────────

/** Desarma las props de `KPICard` a partir de la variación. */
function badge(v: { texto: string; positivo: boolean } | null) {
  if (!v) return {};
  return { sub: v.texto, subPositive: v.positivo };
}

/** Eje compacto: los importes son grandes y la etiqueta no puede ocupar media barra. */
const fmtPesosCompacto = (v: number): string =>
  Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`;

type Opcion = { valor: string; texto: string };

function SelectFiltro({
  label,
  valor,
  placeholder,
  opciones,
  onChange,
}: {
  label: string;
  valor: string;
  placeholder: string;
  opciones: Opcion[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-500 block mb-1 uppercase" style={{ color: '#94A3B8', fontFamily: 'Inter', letterSpacing: '0.04em' }}>{label}</label>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-md border outline-none appearance-none"
        style={{ borderColor: valor ? '#1D4ED8' : '#E2E8F0', background: valor ? '#EFF6FF' : '#F8FAFC', color: '#0F172A', fontFamily: 'Inter' }}
      >
        <option value="">{placeholder}</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </div>
  );
}

/**
 * Composición del importe cuando sólo hay un período cargado.
 *
 * Reemplaza a la evolución mensual (que con un punto no dice nada) y explica
 * algo que ninguna otra tarjeta muestra: cuánto se pierde entre el bruto y el
 * neto (bonificaciones y descuentos) y cuánto se suma entre el neto y el final
 * (impuestos). Los tres totales ya vienen en los KPIs, así que no hay consulta
 * nueva.
 */
function ComposicionImporte({ kpis }: { kpis: Kpis }) {
  const bruto = Number(kpis.total_bruto ?? 0);
  const neto = Number(kpis.total_neto ?? 0);
  const final = Number(kpis.total_final ?? 0);

  const bonificaciones = neto - bruto;
  const impuestos = final - neto;
  // Las barras se miden contra el mayor importe, para que la más larga llene
  // el ancho disponible.
  const tope = Math.max(bruto, neto, final) || 1;

  const filas = [
    { etiqueta: 'Bruto', valor: bruto, color: '#64748B', pct: false },
    { etiqueta: 'Bonificaciones', valor: bonificaciones, color: '#EF4444', pct: true },
    { etiqueta: 'Neto', valor: neto, color: '#1D4ED8', pct: false },
    { etiqueta: 'Impuestos', valor: impuestos, color: '#F59E0B', pct: true },
    { etiqueta: 'Final', valor: final, color: '#059669', pct: false },
  ];

  return (
    // Mismo alto que el gráfico de evolución, para que el card no se encoja.
    <div className="flex flex-col justify-center gap-1.5" style={{ height: 210 }}>
      {filas.map((f) => {
        const pct = bruto > 0 ? (f.valor / bruto) * 100 : 0;
        return (
          <div key={f.etiqueta} className="flex items-center gap-2">
            <span className="text-[11px] flex-shrink-0" style={{ width: 96, color: '#64748B', fontFamily: 'Inter' }}>
              {f.etiqueta}
            </span>
            <div className="flex-1 h-4 rounded" style={{ background: '#F8FAFC' }}>
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.max((Math.abs(f.valor) / tope) * 100, 1)}%`,
                  background: f.color,
                  opacity: 0.85,
                }}
              />
            </div>
            <span
              className="text-[11px] text-right flex-shrink-0"
              style={{ width: 78, color: '#0F172A', fontFamily: 'JetBrains Mono' }}
            >
              {f.valor < 0 ? '−' : ''}{fmtPesos(Math.abs(f.valor))}
            </span>
            <span
              className="text-[10px] text-right flex-shrink-0"
              style={{ width: 50, color: '#94A3B8', fontFamily: 'JetBrains Mono' }}
            >
              {f.pct ? `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : ''}
            </span>
          </div>
        );
      })}
      <p className="text-[10px] pt-1.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        La evolución mensual aparece al cargar un segundo período.
      </p>
    </div>
  );
}
