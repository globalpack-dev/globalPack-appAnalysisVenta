import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, UserX } from 'lucide-react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  useRankingEncargados,
  useEncargadoDetalle,
  useCatalogoEncargados,
} from '../hooks/useCatalogos';
import { FILTROS_VACIOS } from '../hooks/useFiltros';
import { fmtPesos, fmtNum } from '../lib/format';
import ChartTooltip from '../components/ui/ChartTooltip';
import { colorDe } from '../components/ui/chartColors';
import EstadoDatos from '../components/ui/EstadoDatos';
import ActividadPromotor from '../components/ui/ActividadPromotor';
import ResumenDia from '../components/ui/ResumenDia';
import type { FilaRankingEncargado, Filtros as TipoFiltros } from '../types/database.types';

/**
 * Ventas por Promotor.
 *
 * El rótulo viene del Excel de Global Pack, donde la columna se llamaba
 * "Promotor de Venta". Pero el valor que guarda ahí es el **nombre de la persona
 * encargada**, no una zona geográfica. Por eso el ranking muestra nombres de
 * personas.
 *
 * Se conserva el nombre "Promotor" porque es el lenguaje del negocio: es lo que el
 * supervisor busca en su planilla. Renombrarlo haría más difícil cruzarlo con el
 * Excel, que es justo lo que hay que evitar.
 */
export default function Promotores() {
  const [filtros] = useState<TipoFiltros>(FILTROS_VACIOS);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);

  const { data: ranking, isPending, error } = useRankingEncargados(filtros, 50);
  const { data: catalogo } = useCatalogoEncargados();

  // El ranking no trae el código de promotor; el catálogo sí. Se indexa por id.
  const codigos = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of catalogo ?? []) m.set(c.id_encargado_venta, c.codigo_sector_venta);
    return m;
  }, [catalogo]);

  const filas = ranking ?? [];

  const totalVentas = useMemo(
    () => filas.reduce((s, x) => s + Number(x.ventas), 0),
    [filas],
  );
  const totalClientes = useMemo(
    () => filas.reduce((s, x) => s + Number(x.clientes), 0),
    [filas],
  );
  const chartData = useMemo(
    () =>
      filas.map((s, i) => ({
        id: s.id_encargado_venta,
        name: s.encargado_nombre,
        ventas: Number(s.ventas),
        color: colorDe(i),
      })),
    [filas],
  );
  const sinSupervisor = useMemo(
    () => filas.filter((s) => !s.supervisor_nombre).length,
    [filas],
  );

  const seleccionadoRow = seleccionado !== null ? filas.find((s) => s.id_encargado_venta === seleccionado) : undefined;

  if (seleccionadoRow) {
    return (
      <PromotorDetalle
        promotor={seleccionadoRow}
        filtros={filtros}
        codigo={codigos.get(seleccionadoRow.id_encargado_venta) ?? '—'}
        onBack={() => setSeleccionado(null)}
      />
    );
  }

  return (
    <EstadoDatos
      cargando={isPending}
      error={error}
      vacio={filas.length === 0}
      mensajeVacio="No hay encargados de venta con ventas en el período"
    >
      <div className="p-5 space-y-5">
        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Facturación total', value: fmtPesos(totalVentas) },
            { label: 'Promotores con ventas', value: filas.length.toString() },
            { label: 'Clientes cubiertos', value: totalClientes.toString() },
            { label: 'Promotor líder', value: chartData[0]?.name ?? '—' },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-white rounded-xl p-4 border"
              style={{ borderColor: '#E2E8F0' }}
            >
              <div
                className="font-display font-700 text-xl truncate"
                style={{ color: '#0F172A', fontFamily: 'Outfit' }}
              >
                {s.value}
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {sinSupervisor > 0 && <AvisoSinSupervisor cantidad={sinSupervisor} />}

        {/* Chart */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Ventas por Promotor
          </h3>
          <p className="text-[11px] mb-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Cada barra es una persona encargada de ventas.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={fmtPesos}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'Inter' }}
                axisLine={false}
                tickLine={false}
                width={140}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="ventas" name="Ventas" radius={[0, 4, 4, 0]} opacity={0.9}>
                {chartData.map((s) => (
                  <Cell key={s.id} fill={s.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
            <h3 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Detalle por promotor
            </h3>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Código', 'Encargado de ventas', 'Supervisor', 'Clientes', 'Ventas', 'Participación', ''].map((h) => (
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
              {filas.map((s, idx) => {
                const pct = totalVentas > 0 ? (Number(s.ventas) * 100) / totalVentas : 0;
                return (
                  <tr
                    key={s.id_encargado_venta}
                    className="border-t cursor-pointer transition-all"
                    style={{ borderColor: '#F8FAFC' }}
                    onClick={() => setSeleccionado(s.id_encargado_venta)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
                      {codigos.get(s.id_encargado_venta) ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: colorDe(idx) }}
                        />
                        <span className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                          {s.encargado_nombre}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <CeldaSupervisor nombre={s.supervisor_nombre} />
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {s.clientes}
                    </td>
                    <td className="px-4 py-3 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                      {fmtPesos(Number(s.ventas))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                          {pct.toFixed(1)}%
                        </span>
                        <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%`, background: colorDe(idx) }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight size={14} style={{ color: '#CBD5E1' }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </EstadoDatos>
  );
}

// ─── Ficha de promotor ──────────────────────────────────────────────────────────

function PromotorDetalle({
  promotor,
  filtros,
  codigo,
  onBack,
}: {
  promotor: FilaRankingEncargado
  filtros: TipoFiltros
  codigo: string
  onBack: () => void
}) {
  const { data, isPending, error } = useEncargadoDetalle(promotor.id_encargado_venta, filtros);

  // Dos vistas sobre el mismo promotor: el resumen de ventas de siempre y la
  // actividad operativa (a quién visitar, qué compró y qué le falta).
  const [vista, setVista] = useState<'resumen' | 'actividad' | 'dia'>('resumen');

  const chartSerie = useMemo(
    () => (data?.serie ?? []).map((s) => ({ mes: s.mes_corto, ventas: Number(s.importe_neto) })),
    [data],
  );
  const marcas = data?.marcas ?? [];
  const chartMarcas = useMemo(
    () =>
      marcas.map((m, i) => ({ ...m, ventas: Number(m.ventas), color: colorDe(i) })),
    [marcas],
  );
  const topClientes = useMemo(
    () =>
      (data?.ranking ?? [])
        .slice(0, 6)
        .map((c) => ({ name: c.cliente_nombre, value: Number(c.ventas) })),
    [data],
  );

  const nombre = data?.encargado?.nombre_completo ?? promotor.encargado_nombre;
  const totalMarcas = marcas.reduce((s, m) => s + Number(m.ventas), 0);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs"
          style={{ color: '#64748B', fontFamily: 'Inter' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#1D4ED8')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#64748B')}
        >
          <ArrowLeft size={14} /> Volver
        </button>
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-700 text-sm flex-shrink-0"
            style={{ background: '#1D4ED8', fontFamily: 'Outfit' }}
          >
            {nombre.charAt(0)}
          </div>
          <div>
            <h2 className="font-display font-700 text-xl" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              {nombre}
            </h2>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span
                className="text-[11px] px-1.5 py-0.5 rounded font-500"
                style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'JetBrains Mono' }}
              >
                Promotor {codigo}
              </span>
              <CeldaSupervisor nombre={data?.supervisor ?? promotor.supervisor_nombre} plano />
            </div>
          </div>
        </div>

        {/* Cambio de vista: el resumen de ventas o la actividad operativa. */}
        <div
          className="ml-auto flex items-center gap-1 p-0.5 rounded-lg"
          style={{ background: '#F1F5F9' }}
        >
          {([
            { id: 'resumen', nombre: 'Resumen' },
            { id: 'actividad', nombre: 'Ver actividad' },
            { id: 'dia', nombre: 'Resumen del día' },
          ] as const).map((v) => {
            const activo = vista === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setVista(v.id)}
                className="text-[11px] px-3 py-1.5 rounded-md font-600 transition-all"
                style={{
                  background: activo ? '#fff' : 'transparent',
                  color: activo ? '#1D4ED8' : '#64748B',
                  fontFamily: 'Outfit',
                  boxShadow: activo ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                }}
              >
                {v.nombre}
              </button>
            );
          })}
        </div>
      </div>

      {vista === 'actividad' ? (
        <ActividadPromotor
          encargadoId={promotor.id_encargado_venta}
          nombre={nombre}
        />
      ) : vista === 'dia' ? (
        <ResumenDia
          encargadoId={promotor.id_encargado_venta}
          nombre={nombre}
          codigo={codigo}
          supervisor={data?.supervisor ?? promotor.supervisor_nombre}
        />
      ) : (
      <EstadoDatos cargando={isPending} error={error}>
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Ventas', value: fmtPesos(data?.total ?? Number(promotor.ventas)) },
              { label: 'Clientes', value: promotor.clientes.toString() },
              { label: 'Marcas que vende', value: marcas.length.toString() },
              { label: 'Períodos con ventas', value: (data?.serie ?? []).length.toString() },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-xl p-4 border"
                style={{ borderColor: '#E2E8F0' }}
              >
                <div
                  className="font-display font-700 text-xl"
                  style={{ color: '#0F172A', fontFamily: 'Outfit' }}
                >
                  {s.value}
                </div>
                <div className="text-[11px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* Evolución + clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
              <h4 className="font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                Evolución mensual
              </h4>
              <EstadoDatos cargando={false} vacio={chartSerie.length === 0}>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartSerie}>
                    <defs>
                      <linearGradient id="gPromotor" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#gPromotor)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </EstadoDatos>
            </div>

            <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
              <h4 className="font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                Clientes del promotor
              </h4>
              <EstadoDatos
                cargando={false}
                vacio={topClientes.length === 0}
                mensajeVacio="Sin ventas en el período"
              >
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={topClientes} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={fmtPesos}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: '#64748B', fontFamily: 'Inter' }}
                      axisLine={false}
                      tickLine={false}
                      width={100}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" name="Ventas" fill="#1D4ED8" radius={[0, 4, 4, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </EstadoDatos>
            </div>
          </div>

          {/* Marcas del encargado */}
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
              <h4 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                Marcas que vende el encargado
              </h4>
              <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                Un encargado puede vender productos de varias marcas.
              </p>
            </div>
            <EstadoDatos
              cargando={false}
              vacio={chartMarcas.length === 0}
              mensajeVacio="Sin ventas de este encargado en el período"
            >
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['Marca', 'Ventas', 'Unidades', 'HL', 'Participación'].map((h) => (
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
                  {chartMarcas.map((m) => {
                    const pct = totalMarcas > 0 ? (m.ventas / totalMarcas) * 100 : 0;
                    return (
                      <tr key={m.id_marca} className="border-t" style={{ borderColor: '#F8FAFC' }}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ background: m.color }}
                            />
                            <span className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                              {m.marca_nombre}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                          {fmtPesos(m.ventas)}
                        </td>
                        <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                          {fmtNum(Number(m.unidades))}
                        </td>
                        <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                          {fmtNum(Number(m.hl))}
                        </td>
                        <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </EstadoDatos>
          </div>
        </div>
      </EstadoDatos>
      )}
    </div>
  );
}

// ─── Piezas auxiliares ────────────────────────────────────────────────────────

/**
 * Muestra el supervisor, o "Sin supervisor" cuando no tiene.
 *
 * El esquema lo permite: `encargados_ventas.id_supervisor` es nullable, y así
 * está en la base real. Dejar el espacio vacío haría pensar que el dato no se
 * cargó; "Sin supervisor" dice que no hay nadie a cargo.
 */
function CeldaSupervisor({ nombre, plano = false }: { nombre: string | null; plano?: boolean }) {
  if (!nombre) {
    if (plano) {
      return (
        <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          Sin supervisor
        </span>
      );
    }
    return (
      <span
        className="text-[10px] px-2 py-0.5 rounded font-500 inline-flex items-center gap-1"
        style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}
      >
        <UserX size={10} /> Sin supervisor
      </span>
    );
  }

  return (
    <span className="text-xs" style={{ color: plano ? '#64748B' : '#0F172A', fontFamily: 'Inter' }}>
      {nombre}
    </span>
  );
}

/** Aviso cuando hay encargados cargados sin supervisor. */
function AvisoSinSupervisor({ cantidad }: { cantidad: number }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border px-4 py-3"
      style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
    >
      <UserX size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#D97706' }} />
      <div className="text-xs" style={{ color: '#92400E', fontFamily: 'Inter' }}>
        <strong>
          {cantidad} encargado{cantidad === 1 ? '' : 's'}
        </strong>{' '}
        sin supervisor asignado. Quedan sin cobertura hasta que se cargue el
        responsable.
      </div>
    </div>
  );
}