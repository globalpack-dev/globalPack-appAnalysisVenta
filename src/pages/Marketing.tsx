import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { useMarketing, agruparPorNivel } from '../hooks/useVentas';
import { FILTROS_VACIOS } from '../hooks/useFiltros';
import { fmtPesos, fmtNum } from '../lib/format';
import ChartTooltip from '../components/ui/ChartTooltip';
import { colorDe } from '../components/ui/chartColors';
import EstadoDatos from '../components/ui/EstadoDatos';
import type { FilaMarketing, Filtros as TipoFiltros, NivelMarketing } from '../types/database.types';

type DrillLevel = NivelMarketing;

/**
 * Marketing.
 *
 * El prototipo encadenaba 4 `reduce` sobre un array de 5 objetos en memoria para
 * el drill-down. Ahora `fn_marketing_por` devuelve las 4 dimensiones juntas, una
 * fila por combinación de clasificación, y el agrupado sale de `agruparPorNivel`.
 *
 * Hay dos dimensiones distintas y el prototipo las mezclaba en un solo estado:
 *
 *   · `canal_ajustado` — Off-Trade / On-Trade. Es el canal comercial.
 *   · `canal_mkt`      — Supermercadismo / Tradicional / Gastronómico.
 *
 * El `onClick` del gráfico "Ventas por Canal Ajustado" guardaba en `selectedCanal`,
 * y ese mismo estado se pasaba luego como filtro del gráfico "Ventas por Canal", que
 * agrupa por `canal_mkt`. Ningún `canal_mkt` se llama "Off-Trade", así que el filtro
 * dejaba la tabla vacía. Acá son dos estados separados y cada uno va a su parámetro.
 *
 * Los KPI no hardcodean la lista de canales: `canal_ajustado` deriva de los datos,
 * así que不会出现 los que existan aunque sean otros.
 */
export default function Marketing() {
  const [filtros] = useState<TipoFiltros>(FILTROS_VACIOS);
  const [drillLevel, setDrillLevel] = useState<DrillLevel>('canal_ajustado');
  const [canalAjustado, setCanalAjustado] = useState<string | null>(null);
  const [segmento, setSegmento] = useState<string | null>(null);
  const [canalMkt, setCanalMkt] = useState<string | null>(null);

  const { data, isPending, error } = useMarketing(filtros, drillLevel, {
    segmento,
    canalMkt,
  });

  // El filtro de canal ajustado viaja en p_canal, que es el parámetro que
  // fn_ventas_filtradas aplica contra canal_ajustado.
  const filas = useMemo(
    () =>
      canalAjustado
        ? (data ?? []).filter((f) => f.canal_ajustado === canalAjustado)
        : (data ?? []),
    [data, canalAjustado],
  );

  // `agruparPorNivel` devuelve `nombre`; los gráficos de Canal Ajustado usan
  // `name` como dataKey. Se renombra en el mapeo para no tocar el helper, que
  // comparten las otras páginas.
  const porCanalAj = useMemo(
    () =>
      agruparPorNivel(data ?? [], 'canal_ajustado').map((g, i) => ({
        name: g.nombre,
        ventas: g.ventas,
        color: colorDe(i),
      })),
    [data],
  );
  const porSegmento = useMemo(() => agruparPorNivel(filas, 'segmento'), [filas]);
  const porCanal = useMemo(() => agruparPorNivel(filas, 'canal'), [filas]);

  // El detalle por subcanal necesita las columnas de contexto (canal, segmento) y
  // el conteo de clientes, que `agruparPorNivel` no agrupa.
  const porSubcanal = useMemo(
    () =>
      filas
        .map((f: FilaMarketing) => ({
          id: `${f.subcanal_mkt}-${f.canal_mkt}-${f.segmento_mkt}`,
          name: f.subcanal_mkt ?? '—',
          ventas: Number(f.ventas),
          bultos: Number(f.bultos),
          clientes: Number(f.clientes),
          canal: f.canal_mkt ?? '—',
          segmento: f.segmento_mkt ?? '—',
        }))
        .sort((a, b) => b.ventas - a.ventas),
    [filas],
  );

  // El total es sobre las filas sin filtrar: si se calculara sobre `filas`, al
  // elegir un canal la participación de cada barra sería 100% y no diría nada.
  const totalVentas = useMemo(
    () => (data ?? []).reduce((s, f) => s + Number(f.ventas), 0),
    [data],
  );

  const limpiarTodo = () => {
    setCanalAjustado(null);
    setSegmento(null);
    setCanalMkt(null);
  };
  const hayFiltros = Boolean(canalAjustado || segmento || canalMkt);

  const levelSteps: { k: DrillLevel; l: string }[] = [
    { k: 'canal_ajustado', l: 'Canal ajustado' },
    { k: 'segmento', l: 'Segmento' },
    { k: 'canal', l: 'Canal' },
    { k: 'subcanal', l: 'Subcanal' },
  ];

  return (
    <div className="p-5 space-y-5">
      {/* Navegación del drill-down */}
      <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#E2E8F0' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-500" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Vista:
          </span>
          {levelSteps.map((step, i) => (
            <span key={step.k} className="flex items-center gap-2">
              {i > 0 && <span style={{ color: '#CBD5E1' }}>→</span>}
              <button
                onClick={() => setDrillLevel(step.k)}
                className="text-xs px-3 py-1.5 rounded-md font-500 transition-all"
                style={{
                  background: drillLevel === step.k ? '#1D4ED8' : '#F1F5F9',
                  color: drillLevel === step.k ? 'white' : '#64748B',
                  fontFamily: 'Inter',
                }}
              >
                {step.l}
              </button>
            </span>
          ))}
        </div>

        {hayFiltros && (
          <div
            className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap"
            style={{ borderColor: '#F1F5F9' }}
          >
            <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              Filtros activos:
            </span>
            <Pastilla texto={canalAjustado} color="#1D4ED8" onLimpiar={() => setCanalAjustado(null)} />
            <Pastilla texto={segmento} color="#7C3AED" onLimpiar={() => setSegmento(null)} />
            <Pastilla texto={canalMkt} color="#059669" onLimpiar={() => setCanalMkt(null)} />
            <button
              onClick={limpiarTodo}
              className="text-[11px] px-2 py-0.5 rounded-full font-500"
              style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}
            >
              Limpiar todo
            </button>
          </div>
        )}
      </div>

      {/* KPIs: los canales que existan, no una lista fija */}
      <EstadoDatos
        cargando={isPending}
        error={error}
        vacio={porCanalAj.length === 0}
        mensajeVacio="No hay ventas clasificadas por canal en el período"
      >
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {porCanalAj.map((s) => (
            <div key={s.name} className="bg-white rounded-xl p-4 border" style={{ borderColor: '#E2E8F0' }}>
              <div className="w-3 h-3 rounded-full mb-2" style={{ background: s.color }} />
              <div
                className="font-display font-700 text-xl"
                style={{ color: '#0F172A', fontFamily: 'Outfit' }}
              >
                {fmtPesos(s.ventas)}
              </div>
              <div className="text-[11px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                {s.name}
              </div>
            </div>
          ))}
        </div>
      </EstadoDatos>

      {/* Gráficos del canal ajustado */}
      {drillLevel === 'canal_ajustado' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Ventas por Canal Ajustado
            </h3>
            <EstadoDatos cargando={isPending} error={error} vacio={porCanalAj.length === 0}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={porCanalAj} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtPesosCompacto}
                    width={54}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="ventas"
                    name="Ventas"
                    radius={[6, 6, 0, 0]}
                    onClick={(d: unknown) => {
                      const n = nombreClicado(d);
                      setCanalAjustado(n === canalAjustado ? null : n);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {porCanalAj.map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </EstadoDatos>
          </div>

          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Distribución por Canal
            </h3>
            <EstadoDatos cargando={isPending} error={error} vacio={porCanalAj.length === 0}>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={porCanalAj}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={65}
                    paddingAngle={3}
                    dataKey="ventas"
                    onClick={(d: unknown) => {
                      const n = nombreClicado(d);
                      setCanalAjustado(n === canalAjustado ? null : n);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {porCanalAj.map((c) => (
                      <Cell key={c.name} fill={c.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: unknown) => fmtPesos(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1.5">
                {porCanalAj.map((c) => (
                  <div key={c.name} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                    <span className="flex-1" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                      {c.name}
                    </span>
                    <span
                      className="font-500"
                      style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}
                    >
                      {totalVentas > 0 ? Math.round((c.ventas / totalVentas) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </EstadoDatos>
          </div>
        </div>
      )}

      {/* Gráficos de los niveles interiores */}
      {drillLevel !== 'canal_ajustado' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Ventas por Segmento
            </h3>
            <EstadoDatos
              cargando={isPending}
              error={error}
              vacio={porSegmento.length === 0}
              mensajeVacio="No hay ventas en este segmento"
            >
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={porSegmento} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="nombre"
                    tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtPesosCompacto}
                    width={54}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="ventas"
                    name="Ventas"
                    radius={[6, 6, 0, 0]}
                    onClick={(d: unknown) => {
                      const n = nombreClicado(d);
                      setSegmento(n === segmento ? null : n);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {porSegmento.map((s, i) => (
                      <Cell key={s.nombre} fill={colorDe(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </EstadoDatos>
          </div>

          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Ventas por Canal
            </h3>
            <EstadoDatos
              cargando={isPending}
              error={error}
              vacio={porCanal.length === 0}
              mensajeVacio="No hay ventas en este canal"
            >
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={porCanal} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="nombre"
                    tick={{ fontSize: 11, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={fmtPesosCompacto}
                    width={54}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="ventas"
                    name="Ventas"
                    radius={[6, 6, 0, 0]}
                    onClick={(d: unknown) => {
                      const n = nombreClicado(d);
                      setCanalMkt(n === canalMkt ? null : n);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {porCanal.map((c, i) => (
                      <Cell key={c.nombre} fill={colorDe(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </EstadoDatos>
          </div>
        </div>
      )}

      {/* Detalle por subcanal */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: '#F1F5F9' }}>
          <h3 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Detalle por Subcanal
          </h3>
          {hayFiltros && (
            <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {fmtPesos(totalVentas)} en total
            </span>
          )}
        </div>
        <EstadoDatos
          cargando={isPending}
          error={error}
          vacio={porSubcanal.length === 0}
          mensajeVacio="No hay ventas por subcanal con los filtros seleccionados"
        >
          <table className="w-full">
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Subcanal', 'Canal', 'Segmento', 'Ventas', 'Bultos', 'Clientes', 'Participación'].map((h) => (
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
              {porSubcanal.map((s) => {
                const pct = totalVentas > 0 ? Math.round((s.ventas / totalVentas) * 100) : 0;
                return (
                  <tr
                    key={s.id}
                    className="border-t"
                    style={{ borderColor: '#F8FAFC' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-4 py-3 text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                      {s.name}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-500"
                        style={{ background: '#EFF6FF', color: '#1D4ED8', fontFamily: 'Inter' }}
                      >
                        {s.canal}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-500"
                        style={{ background: '#F5F3FF', color: '#7C3AED', fontFamily: 'Inter' }}
                      >
                        {s.segmento}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-[11px] font-600"
                      style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}
                    >
                      {fmtPesos(s.ventas)}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {fmtNum(s.bultos)}
                    </td>
                    <td className="px-4 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {s.clientes}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: '#1D4ED8' }} />
                        </div>
                        <span className="text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </EstadoDatos>
      </div>
    </div>
  );
}

// ─── Piezas chicas ────────────────────────────────────────────────────────────

/**
 * Nombre de la serie clickeada en un `<Bar>` o un `<Pie>`.
 *
 * Recharts no es uniforme: en `<Pie>` el callback recibe el payload de la
 * fila, pero en `<Bar>` recibe el rectángulo dibujado, que lleva la serie en
 * `payload`. El prototipo hacía `d.name` sobre el `<Bar>`, que siempre daba
 * `undefined`: el clic no filtraba nada y sólo seteaba el estado a null.
 * Se leen las dos formas para que funcione en ambos.
 */
function nombreClicado(d: unknown): string | null {
  const o = d as { name?: unknown; payload?: { name?: unknown; nombre?: unknown } } | null;
  if (!o) return null;
  const cand = o.name ?? o.payload?.name ?? o.payload?.nombre;
  return typeof cand === 'string' ? cand : null;
}

function Pastilla({
  texto,
  color,
  onLimpiar,
}: {
  texto: string | null;
  color: string;
  onLimpiar: () => void;
}) {
  if (!texto) return null;
  return (
    <span
      className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full font-500"
      style={{ background: `${color}12`, color, fontFamily: 'Inter' }}
    >
      {texto}
      <button onClick={onLimpiar} className="hover:opacity-70" aria-label={`Quitar filtro ${texto}`}>
        ×
      </button>
    </span>
  );
}

/** Eje enmillones para que las etiquetas no ocupen media barra. */
const fmtPesosCompacto = (v: number): string =>
  Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`;