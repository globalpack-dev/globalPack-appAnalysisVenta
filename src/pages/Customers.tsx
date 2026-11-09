import { Fragment, useMemo, useState } from 'react';
import { Search, ArrowLeft, Send, TrendingUp, ShoppingCart, Users, ChevronRight } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  useClientes,
  useCatalogoEncargados,
  useHistorialCliente,
  useProductosCliente,
  nombreDeCliente,
  inicialDeCliente,
} from '../hooks/useCatalogos';
import { FILTROS_VACIOS } from '../hooks/useFiltros';
import { fmtPesos, fmtNum } from '../lib/format';
import ChartTooltip from '../components/ui/ChartTooltip';
import EstadoDatos from '../components/ui/EstadoDatos';
import ResumenClienteImagen from '../components/ui/ResumenClienteImagen';
import type { FilaCliente, Filtros as TipoFiltros } from '../types/database.types';

/**
 * Clientes.
 *
 * `nombre_fantasia` es nullable en la base real, así que toda la pantalla usa
 * `nombreDeCliente()`, que cae a la razón social cuando falta. El prototipo
 * hacía `nombreFantasia.charAt(0)` sin protección y se rompía con esos clientes.
 *
 * La pestaña "Sucursales" se eliminó: en este negocio la sucursal es de la
 * empresa (GLOBAL PACK), no del cliente. No hay relación en el esquema, así que
 * no había dato que mostrar. El KPI equivalente es "Encargados": cuántas
 * personas atendieron al cliente, que sí es información real y útil.
 */

type FiltroEstado = 'todos' | 'activos' | 'inactivos';

export default function Customers() {
  const [filtros] = useState<TipoFiltros>(FILTROS_VACIOS);
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('todos');
  const [promotorId, setPromotorId] = useState<number | null>(null);
  const [localidadId, setLocalidadId] = useState<number | null>(null);
  const [seleccionado, setSeleccionado] = useState<FilaCliente | null>(null);

  const { data: catalogoEncargados } = useCatalogoEncargados();
  const { data: clientes, isPending, error } = useClientes(filtros, promotorId);

  // Los `useMemo` van antes del retorno temprano: si se dejaran después, al
  // abrir una ficha el componente se montaría con menos hooks que en el listado
  // y React fallaría al cerrar la ficha.

  // Opciones de localidad derivadas de los clientes ya cargados: no hace falta
  // otra consulta y sólo aparecen las localidades que tienen algún cliente.
  const localidades = useMemo(() => {
    const mapa = new Map<number, string>();
    for (const c of clientes ?? []) {
      if (c.id_localidad !== null && c.localidad_nombre) {
        mapa.set(c.id_localidad, c.localidad_nombre);
      }
    }
    return [...mapa.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (clientes ?? []).filter((c) => {
      const coincideTexto =
        !q ||
        [c.razon_social, c.nombre_fantasia, c.codigo_cliente]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q));
      const coincideEstado =
        estado === 'todos' ||
        (estado === 'activos' ? c.activo : !c.activo);
      const coincideLocalidad =
        localidadId === null || c.id_localidad === localidadId;
      return coincideTexto && coincideEstado && coincideLocalidad;
    });
  }, [clientes, search, estado, localidadId]);

  const activos = useMemo(() => (clientes ?? []).filter((c) => c.activo).length, [clientes]);

  if (seleccionado) {
    return (
      <ClienteDetalle
        cliente={seleccionado}
        filtros={filtros}
        onBack={() => setSeleccionado(null)}
      />
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* Filtros */}
      <div
        className="bg-white rounded-xl border p-4 flex flex-wrap items-end gap-3"
        style={{ borderColor: '#E2E8F0' }}
      >
        <div className="relative flex-1 min-w-44">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: '#94A3B8' }}
          />
          <input
            type="text"
            placeholder="Buscar por nombre, fantasía o código..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border outline-none"
            style={{ borderColor: search ? '#1D4ED8' : '#E2E8F0', fontFamily: 'Inter', color: '#0F172A' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#1D4ED8')}
            onBlur={(e) => (e.currentTarget.style.borderColor = search ? '#1D4ED8' : '#E2E8F0')}
          />
        </div>

        <div>
          <label className="text-[10px] font-500 block mb-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            ESTADO
          </label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as FiltroEstado)}
            className="text-xs px-2.5 py-2 rounded-lg border outline-none bg-white"
            style={{
              borderColor: estado !== 'todos' ? '#1D4ED8' : '#E2E8F0',
              fontFamily: 'Inter',
              color: '#64748B',
              minWidth: 130,
            }}
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-500 block mb-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            LOCALIDAD
          </label>
          <select
            value={localidadId === null ? '' : String(localidadId)}
            onChange={(e) => setLocalidadId(e.target.value === '' ? null : Number(e.target.value))}
            className="text-xs px-2.5 py-2 rounded-lg border outline-none bg-white"
            style={{
              borderColor: localidadId !== null ? '#1D4ED8' : '#E2E8F0',
              fontFamily: 'Inter',
              color: '#64748B',
              minWidth: 170,
            }}
          >
            <option value="">Todas</option>
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] font-500 block mb-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            PROMOTOR
          </label>
          <select
            value={promotorId === null ? '' : String(promotorId)}
            onChange={(e) => setPromotorId(e.target.value === '' ? null : Number(e.target.value))}
            className="text-xs px-2.5 py-2 rounded-lg border outline-none bg-white"
            style={{
              borderColor: promotorId !== null ? '#1D4ED8' : '#E2E8F0',
              fontFamily: 'Inter',
              color: '#64748B',
              minWidth: 170,
            }}
          >
            <option value="">Todos</option>
            {(catalogoEncargados ?? []).map((e) => (
              <option key={e.id_encargado_venta} value={e.id_encargado_venta}>
                {e.nombre_completo}
              </option>
            ))}
          </select>
        </div>

        {(search || estado !== 'todos' || promotorId !== null || localidadId !== null) && (
          <button
            onClick={() => {
              setSearch('');
              setEstado('todos');
              setPromotorId(null);
              setLocalidadId(null);
            }}
            className="text-xs px-2.5 py-2 rounded-lg font-500"
            style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}
          >
            Limpiar
          </button>
        )}

        <div
          className="ml-auto text-[11px] px-2.5 py-1.5 rounded-lg font-500"
          style={{ background: '#EFF6FF', color: '#1D4ED8', fontFamily: 'Inter' }}
        >
          {filtrados.length} clientes · {activos} activos
        </div>
      </div>

      {/* Tabla */}
      <EstadoDatos
        cargando={isPending}
        error={error}
        vacio={filtrados.length === 0}
        mensajeVacio="No hay clientes que coincidan con los filtros"
      >
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Código', 'Razón Social', 'Nombre Fantasía', 'Localidad', 'Promotor', 'Ventas Totales', 'Última venta', 'Estado', ''].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[11px] font-600"
                    style={{ color: '#64748B', fontFamily: 'Outfit' }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr
                  key={c.id_cliente}
                  className="border-t cursor-pointer transition-all"
                  style={{ borderColor: '#F8FAFC' }}
                  onClick={() => setSeleccionado(c)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td className="px-4 py-3 text-[11px] font-500" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
                    {c.codigo_cliente}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                    {c.razon_social}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-700 text-white flex-shrink-0"
                        style={{ background: '#1D4ED8', fontFamily: 'Outfit' }}
                      >
                        {inicialDeCliente(c)}
                      </div>
                      <span className="text-xs" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                        {c.nombre_fantasia ?? '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                    {c.localidad_nombre ?? '—'}
                  </td>
                  <td
                    className="px-4 py-3 text-[11px]"
                    style={{ color: '#64748B', fontFamily: 'Inter' }}
                    title={c.encargado_count > 0 ? `${c.encargado_count} encargados históricos` : undefined}
                  >
                    {c.encargado_nombre ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                    {fmtPesos(Number(c.ventas_total))}
                  </td>
                  <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                    {c.ultima_venta ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full font-500"
                      style={{
                        background: c.activo ? '#F0FDF4' : '#FEF2F2',
                        color: c.activo ? '#059669' : '#EF4444',
                        fontFamily: 'Inter',
                      }}
                    >
                      {c.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight size={14} style={{ color: '#CBD5E1' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </EstadoDatos>
    </div>
  );
}

// ─── Ficha de cliente ─────────────────────────────────────────────────────────

type Pestana = 'resumen' | 'historial';

function ClienteDetalle({
  cliente,
  filtros,
  onBack,
}: {
  cliente: FilaCliente;
  filtros: TipoFiltros;
  onBack: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [resumenAbierto, setResumenAbierto] = useState(false);

  const nombre = nombreDeCliente(cliente);
  const inicial = inicialDeCliente(cliente);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs mt-0.5 flex-shrink-0"
          style={{ color: '#64748B', fontFamily: 'Inter' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#1D4ED8')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
        >
          <ArrowLeft size={14} /> Volver
        </button>
        <div className="flex-1 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-700 text-sm flex-shrink-0"
            style={{ background: '#1D4ED8', fontFamily: 'Outfit' }}
          >
            {inicial}
          </div>
          <div>
            <h2 className="font-display font-700 text-lg" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              {nombre}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {cliente.razon_social} · {cliente.codigo_cliente} · {cliente.localidad_nombre ?? 'sin localidad'}
            </p>
          </div>
          <span
            className="text-[11px] px-2 py-0.5 rounded-full font-500 flex-shrink-0"
            style={{
              background: cliente.activo ? '#F0FDF4' : '#FEF2F2',
              color: cliente.activo ? '#059669' : '#EF4444',
              fontFamily: 'Inter',
            }}
          >
            {cliente.activo ? 'Activo' : 'Inactivo'}
          </span>
          <button
            onClick={() => setResumenAbierto(true)}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-500 text-white flex-shrink-0"
            style={{ background: '#1D4ED8', fontFamily: 'Inter' }}
          >
            <Send size={12} /> Generar resumen
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Ventas Totales',
            value: fmtPesos(Number(cliente.ventas_total)),
            icon: <TrendingUp size={15} />,
            accent: '#1D4ED8',
          },
          {
            label: 'Ventas Netas',
            value: fmtPesos(Number(cliente.ventas_neto)),
            icon: <TrendingUp size={15} />,
            accent: '#059669',
          },
          {
            label: 'Promotor',
            value: cliente.encargado_nombre ?? 'Sin promotor',
            icon: <Users size={15} />,
            accent: '#7C3AED',
          },
          {
            label: 'Última venta',
            value: cliente.ultima_venta ?? '—',
            icon: <ShoppingCart size={15} />,
            accent: '#D97706',
          },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-4 border" style={{ borderColor: '#E2E8F0' }}>
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center mb-2"
              style={{ background: `${s.accent}12` }}
            >
              <span style={{ color: s.accent }}>{s.icon}</span>
            </div>
            <div
              className="font-display font-700 text-lg truncate"
              style={{ color: '#0F172A', fontFamily: 'Outfit' }}
              title={s.value}
            >
              {s.value}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#F1F5F9', width: 'fit-content' }}>
        {[
          { k: 'resumen' as const, l: 'Resumen' },
          { k: 'historial' as const, l: 'Historial' },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setPestana(t.k)}
            className="px-4 py-1.5 rounded-md text-xs font-500 transition-all"
            style={{
              background: pestana === t.k ? 'white' : 'transparent',
              color: pestana === t.k ? '#0F172A' : '#94A3B8',
              fontFamily: 'Inter',
              boxShadow: pestana === t.k ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
            }}
          >
            {t.l}
          </button>
        ))}
      </div>

      {pestana === 'resumen' && (
        <ResumenCliente cliente={cliente} filtros={filtros} />
      )}
      {pestana === 'historial' && (
        <HistorialCliente cliente={cliente} filtros={filtros} />
      )}

      {resumenAbierto && (
        <ResumenClienteImagen
          cliente={cliente}
          filtros={filtros}
          onCerrar={() => setResumenAbierto(false)}
        />
      )}
    </div>
  );
}

// ─── Pestaña: resumen ─────────────────────────────────────────────────────────

function ResumenCliente({ cliente, filtros }: { cliente: FilaCliente; filtros: TipoFiltros }) {
  const { data: historial, isPending } = useHistorialCliente(cliente.id_cliente, filtros);

  // El gráfico va de más viejo a más reciente, igual que la línea de tiempo.
  // Se ordena explícitamente por año y mes en vez de confiar en el orden que
  // devuelve la RPC: `fn_cliente_detalle` ya viene ascendente, así que un
  // `reverse()` dejaba noviembre antes que octubre y la tendencia se leía al
  // revés. La etiqueta lleva el año para no repetir "Oct" al cruzar períodos.
  const paraGrafico = useMemo(
    () =>
      [...(historial ?? [])]
        .sort((a, b) => a.anio - b.anio || a.mes - b.mes)
        .map((h) => ({
          mes: `${h.mes_corto} ${String(h.anio).slice(2)}`,
          ventas: Number(h.ventas),
        })),
    [historial],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
        <h4 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
          Evolución de ventas
        </h4>
        <p className="text-[11px] mb-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          Período con facturación de este cliente.
        </p>
        <EstadoDatos cargando={isPending} vacio={paraGrafico.length === 0}>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={paraGrafico}>
              <defs>
                <linearGradient id="gCliente" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D4ED8" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtPesos}
                width={54}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="ventas"
                name="Ventas"
                stroke="#1D4ED8"
                strokeWidth={2}
                fill="url(#gCliente)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </EstadoDatos>
      </div>

      <DatosPeriodo
        titulo="Ventas por período"
        cargando={isPending}
        filas={(historial ?? []).map((h) => ({
          id: `${h.anio}-${h.mes}`,
          nombre: `${h.nombre_mes} ${h.anio}`,
          ventas: Number(h.ventas),
          neto: Number(h.neto),
          extra: h.encargado_nombre,
        }))}
        vacioMsg="Este cliente no tiene ventas en el período"
      />
    </div>
  );
}

// ─── Pestaña: historial ───────────────────────────────────────────────────────

function HistorialCliente({ cliente, filtros }: { cliente: FilaCliente; filtros: TipoFiltros }) {
  const { data, isPending, error } = useHistorialCliente(cliente.id_cliente, filtros);
  const {
    data: productos,
    isPending: cargandoProductos,
    error: errorProductos,
  } = useProductosCliente(cliente.id_cliente, filtros);
  const [abierto, setAbierto] = useState<string | null>(null);

  const filas = useMemo(
    () =>
      (data ?? []).map((h, i, arr) => {
        const previo = arr[i - 1];
        const delta =
          previo && Number(previo.ventas) > 0
            ? ((Number(h.ventas) - Number(previo.ventas)) / Number(previo.ventas)) * 100
            : null;
        return {
          id: `${h.anio}-${h.mes}`,
          mes: `${h.nombre_mes} ${h.anio}`,
          ventas: Number(h.ventas),
          neto: Number(h.neto),
          bultos: Number(h.bultos),
          hl: Number(h.hl),
          encargado: h.encargado_nombre,
          supervisor: h.supervisor_nombre,
          delta,
        };
      }),
    [data],
  );

  // El detalle viene plano (una fila por producto y período). Se agrupa por la
  // misma clave que usa la tabla para poder abrir sólo el mes clickeado.
  const productosPorMes = useMemo(() => {
    const mapa = new Map<string, NonNullable<typeof productos>>();
    for (const p of productos ?? []) {
      const clave = `${p.anio}-${p.mes}`;
      const lista = mapa.get(clave) ?? [];
      lista.push(p);
      mapa.set(clave, lista);
    }
    return mapa;
  }, [productos]);

  return (
    <EstadoDatos
      cargando={isPending}
      error={error}
      vacio={filas.length === 0}
      mensajeVacio="Este cliente no tiene historial de ventas"
    >
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
          <h4 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Historial de ventas
          </h4>
          <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Variación contra el período anterior. Hacé clic en un período para ver
            los productos vendidos.
          </p>
        </div>
        <table className="w-full">
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Período', 'Ventas', 'Neto', 'Variación', 'Bultos', 'HL', 'Encargado'].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-[11px] font-600"
                  style={{ color: '#64748B', fontFamily: 'Outfit' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const detalle = productosPorMes.get(f.id) ?? [];
              const estaAbierto = abierto === f.id;

              return (
                <Fragment key={f.id}>
                  <tr className="border-t" style={{ borderColor: '#F8FAFC' }}>
                    <td className="px-4 py-3 text-xs" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                      <button
                        type="button"
                        onClick={() => setAbierto(estaAbierto ? null : f.id)}
                        aria-expanded={estaAbierto}
                        className="flex items-center gap-1.5 text-left"
                      >
                        <ChevronRight
                          size={12}
                          style={{
                            color: '#94A3B8',
                            transform: estaAbierto ? 'rotate(90deg)' : 'none',
                            transition: 'transform 150ms',
                          }}
                        />
                        <span>{f.mes}</span>
                        {!cargandoProductos && detalle.length > 0 && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'JetBrains Mono' }}
                          >
                            {detalle.length}
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                      {fmtPesos(f.ventas)}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                      {fmtPesos(f.neto)}
                    </td>
                    <td className="px-4 py-3">
                      {f.delta !== null && (
                        <span
                          className="text-[11px] px-1.5 py-0.5 rounded font-500"
                          style={{
                            background: f.delta >= 0 ? '#F0FDF4' : '#FEF2F2',
                            color: f.delta >= 0 ? '#059669' : '#EF4444',
                            fontFamily: 'JetBrains Mono',
                          }}
                        >
                          {f.delta >= 0 ? '+' : ''}
                          {f.delta.toFixed(1)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {fmtNum(f.bultos)}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {fmtNum(f.hl)}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                      {f.encargado ?? '—'}
                    </td>
                  </tr>

                  {estaAbierto && (
                    <tr style={{ background: '#F8FAFC' }}>
                      <td colSpan={7} className="px-4 pb-3">
                        {cargandoProductos ? (
                          <p className="text-[11px] py-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                            Cargando productos…
                          </p>
                        ) : errorProductos ? (
                          <p className="text-[11px] py-2" style={{ color: '#DC2626', fontFamily: 'Inter' }}>
                            No se pudo cargar el detalle de productos. Verificá que el
                            SQL `41_fn_cliente_productos.sql` esté aplicado.
                          </p>
                        ) : detalle.length === 0 ? (
                          <p className="text-[11px] py-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                            Sin detalle de productos para este período.
                          </p>
                        ) : (
                          <div
                            className="mt-1 rounded-lg border bg-white overflow-hidden"
                            style={{ borderColor: '#E2E8F0' }}
                          >
                            <table className="w-full">
                              <thead>
                                <tr>
                                  {['Producto', 'Marca', 'Calibre', 'Bultos', 'HL', 'Neto'].map((h) => (
                                    <th
                                      key={h}
                                      className="text-left px-3 py-2 text-[10px] font-600"
                                      style={{ color: '#94A3B8', fontFamily: 'Outfit' }}
                                    >
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {detalle.map((p) => (
                                  <tr key={p.id_producto} className="border-t" style={{ borderColor: '#F8FAFC' }}>
                                    <td className="px-3 py-2 text-[11px]" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                                      <div className="font-500">{p.producto_nombre}</div>
                                      <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
                                        {p.codigo_producto}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2 text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                                      {p.marca_nombre ?? '—'}
                                    </td>
                                    <td className="px-3 py-2 text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                                      {p.calibre_nombre ?? '—'}
                                    </td>
                                    <td className="px-3 py-2 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                                      {fmtNum(p.bultos)}
                                    </td>
                                    <td className="px-3 py-2 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                                      {fmtNum(p.hl)}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                                      {fmtPesos(p.neto)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </EstadoDatos>
  );
}

// ─── Tabla reutilizable por período ───────────────────────────────────────────

function DatosPeriodo({
  titulo,
  filas,
  cargando,
  vacioMsg,
}: {
  titulo: string;
  filas: { id: string; nombre: string; ventas: number; neto: number; extra?: string | null }[];
  cargando: boolean;
  vacioMsg: string;
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
        <h4 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
          {titulo}
        </h4>
      </div>
      <EstadoDatos cargando={cargando} vacio={filas.length === 0} mensajeVacio={vacioMsg}>
        <table className="w-full">
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              {['Período', 'Encargado', 'Ventas', 'Neto'].map((h) => (
                <th
                  key={h}
                  className="text-left px-4 py-3 text-[11px] font-600"
                  style={{ color: '#64748B', fontFamily: 'Outfit' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t" style={{ borderColor: '#F8FAFC' }}>
                <td className="px-4 py-3 text-xs" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                  {f.nombre}
                </td>
                <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                  {f.extra ?? '—'}
                </td>
                <td className="px-4 py-3 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                  {fmtPesos(f.ventas)}
                </td>
                <td className="px-4 py-3 text-[11px]" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                  {fmtPesos(f.neto)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </EstadoDatos>
    </div>
  );
}
