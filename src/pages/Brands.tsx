import { useMemo, useState } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useMarcas, useMarcaSerie, useMarcaDetalle } from '../hooks/useMarcas';
import { FILTROS_VACIOS } from '../hooks/useFiltros';
import { fmtPesos, fmtNum } from '../lib/format';
import ChartTooltip from '../components/ui/ChartTooltip';
import { colorDe } from '../components/ui/chartColors';
import EstadoDatos from '../components/ui/EstadoDatos';
import type { FilaMarca, Filtros as TipoFiltros } from '../types/database.types';

/**
 * Marcas.
 *
 * La tabla `marcas` tiene sólo `id_marca` y `nombre`. Todo lo demás —ventas,
 * productos, unidades, hl y crecimiento— lo calcula `fn_marcas`.
 *
 * El color no es dato: la tabla no tiene columna `color`. Se deriva del id, que
 * es estable aunque la marca se renombre.
 */
export default function Brands() {
  const [filtros] = useState<TipoFiltros>(FILTROS_VACIOS);
  const [seleccionada, setSeleccionada] = useState<number | null>(null);

  const { data: marcas, isPending, error } = useMarcas(filtros);

  // Los useMemo van antes del retorno temprano: al abrir una marca el componente
  // debe ejecutar siempre la misma cantidad de hooks. Si quedaran después del
  // `return`, React fallaría con “Rendered fewer hooks than expected” y la
  // pantalla quedaría en blanco.
  const totalVentas = useMemo(
    () => (marcas ?? []).reduce((s, m) => s + Number(m.ventas), 0),
    [marcas],
  );
  const conVentas = useMemo(
    () => (marcas ?? []).filter((m) => Number(m.ventas) > 0),
    [marcas],
  );
  const chartData = useMemo(
    () =>
      (marcas ?? []).map((m) => ({
        name: m.marca_nombre ?? '—',
        ventas: Number(m.ventas),
        color: colorPorMarca(m.id_marca),
      })),
    [marcas],
  );

  if (seleccionada !== null && marcas) {
    const marca = marcas.find((m) => m.id_marca === seleccionada);
    if (marca) {
      return <MarcaDetalle marca={marca} filtros={filtros} onBack={() => setSeleccionada(null)} />;
    }
  }

  return (
    <EstadoDatos
      cargando={isPending}
      error={error}
      vacio={(marcas ?? []).length === 0}
      mensajeVacio="No hay marcas cargadas"
    >
      <div className="p-5 space-y-5">
        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Facturación total', value: fmtPesos(totalVentas) },
            { label: 'Marcas registradas', value: (marcas ?? []).length.toString() },
            { label: 'Marcas con ventas', value: conVentas.length.toString() },
            {
              label: 'Marca líder',
              value: chartData[0]?.name ?? '—',
            },
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

        {/* Chart */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Facturación por Marca
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                width={50}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="ventas" name="Ventas" radius={[4, 4, 0, 0]}>
                {chartData.map((m) => (
                  <Cell key={m.name} fill={m.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Ranking */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          <div className="px-5 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
            <h3 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Ranking de Marcas
            </h3>
          </div>
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['#', 'Marca', 'Ventas', 'Unidades', 'HL', 'Productos', 'Participación', 'Crecim. mes ant.', ''].map((h) => (
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
              {(marcas ?? []).map((m, idx) => {
                const pct = totalVentas > 0 ? (Number(m.ventas) * 100) / totalVentas : 0;
                const color = colorPorMarca(m.id_marca);
                const crece = Number(m.crecimiento);
                return (
                  <tr
                    key={m.id_marca}
                    className="border-t cursor-pointer transition-all"
                    style={{ borderColor: '#F8FAFC' }}
                    onClick={() => setSeleccionada(m.id_marca)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3">
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-700"
                        style={{
                          background: idx < 3 ? `${color}18` : '#F1F5F9',
                          color: idx < 3 ? color : '#94A3B8',
                          fontFamily: 'Outfit',
                        }}
                      >
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: color }}
                        />
                        <span className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                          {m.marca_nombre ?? '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                      {fmtPesos(Number(m.ventas))}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {fmtNum(Number(m.unidades))}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {fmtNum(Number(m.hl))}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {m.productos ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px]" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                          {pct.toFixed(1)}%
                        </span>
                        <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded font-500"
                        style={{
                          background: crece >= 0 ? '#F0FDF4' : '#FEF2F2',
                          color: crece >= 0 ? '#059669' : '#EF4444',
                          fontFamily: 'JetBrains Mono',
                        }}
                      >
                        {crece >= 0 ? '+' : ''}
                        {crece}%
                      </span>
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

// ─── Ficha de marca ───────────────────────────────────────────────────────────

function MarcaDetalle({
  marca,
  filtros,
  onBack,
}: {
  marca: FilaMarca
  filtros: TipoFiltros
  onBack: () => void
}) {
  const color = colorPorMarca(marca.id_marca);
  const { data: serie, isPending: cargandoSerie, error: errorSerie } = useMarcaSerie(
    marca.id_marca,
    filtros,
  );
  const { data: detalle, isPending: cargandoDetalle } = useMarcaDetalle(marca.id_marca, filtros);

  const chartSerie = useMemo(
    () =>
      (serie ?? []).map((s) => ({
        mes: s.mes_corto,
        ventas: Number(s.importe_neto),
      })),
    [serie],
  );

  const topClientes = useMemo(
    () => (detalle?.clientes ?? []).slice(0, 6).map((c) => ({ name: c.nombre, value: Number(c.ventas) })),
    [detalle],
  );

  const crece = Number(marca.crecimiento);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-4">
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
            style={{ background: color, fontFamily: 'Outfit' }}
          >
            {(marca.marca_nombre ?? '?').charAt(0)}
          </div>
          <div>
            <h2 className="font-display font-700 text-xl" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              {marca.marca_nombre ?? '—'}
            </h2>
            <div
              className="flex items-center gap-1.5 text-[11px] mt-0.5"
              style={{ color: crece >= 0 ? '#059669' : '#EF4444', fontFamily: 'JetBrains Mono' }}
            >
              {crece >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {crece >= 0 ? '+' : ''}
              {crece}% vs. mes anterior
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Ventas', value: fmtPesos(Number(marca.ventas)) },
          { label: 'Productos', value: (marca.productos ?? 0).toString() },
          { label: 'Unidades vendidas', value: fmtNum(Number(marca.unidades)) },
          { label: 'Hectolitros', value: fmtNum(Number(marca.hl)) },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-4 border" style={{ borderColor: '#E2E8F0' }}>
            <div className="font-display font-700 text-xl" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
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
            Evolución de Ventas
          </h4>
          <EstadoDatos cargando={cargandoSerie} error={errorSerie} vacio={chartSerie.length === 0}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartSerie}>
                <defs>
                  <linearGradient id="gMarca" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
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
                  stroke={color}
                  strokeWidth={2}
                  fill="url(#gMarca)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </EstadoDatos>
        </div>

        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
          <h4 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Clientes que compran esta marca
          </h4>
          <p className="text-[11px] mb-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Un mismo cliente puede comprar varias marcas.
          </p>
          <EstadoDatos
            cargando={cargandoDetalle}
            vacio={topClientes.length === 0}
            mensajeVacio="Ninguna venta de esta marca en el período"
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
                  width={90}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" name="Ventas" fill={color} radius={[0, 4, 4, 0]} opacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </EstadoDatos>
        </div>
      </div>

      {/* Productos de la marca */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
          <h4 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Productos de {marca.marca_nombre}
          </h4>
        </div>
        <EstadoDatos
          cargando={cargandoDetalle}
          vacio={(detalle?.productos ?? []).length === 0}
          mensajeVacio="Esta marca no tiene productos cargados"
        >
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Código', 'Producto', 'Cant. vendida', 'Importe ventas', 'HL'].map((h) => (
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
              {(detalle?.productos ?? []).map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: '#F8FAFC' }}>
                  <td className="px-4 py-3 text-[11px]" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
                    {p.codigo}
                  </td>
                  <td className="px-4 py-3 text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                    {p.nombre}
                  </td>
                  <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                    {fmtNum(Number(p.unidades))}
                  </td>
                  <td className="px-4 py-3 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                    {fmtPesos(Number(p.ventas))}
                  </td>
                  <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                    {fmtNum(Number(p.hl))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoDatos>
      </div>
    </div>
  );
}

/**
 * Color estable por marca, derivado del id.
 *
 * La tabla `marcas` sólo tiene `id_marca` y `nombre`. Se usa el id y no el
 * nombre a propósito: si la marca se renombra, el color se mantiene. Con el
 * nombre, renombrar "Quilmes" a "Quilmes Clásica" le cambiaría el color y el
 * usuario la confundiría con otra.
 *
 * El índice se usa sólo para repartir en la paleta; el id manda.
 */
function colorPorMarca(id: number | null): string {
  if (id === null) return '#94A3B8';
  return colorDe(Math.abs(id) % 8);
}