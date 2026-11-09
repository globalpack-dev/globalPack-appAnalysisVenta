import { useState, useMemo, useRef } from 'react';
import { Download, Share2, Loader2, X, Check, TrendingUp, Users, ShoppingCart, Info } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  useReporteVentas, useReporteCliente, useReporteMarcas,
  useReportePromotores, useReporteMarketing,
} from '../hooks/useReporte';
import { agruparPorNivel } from '../hooks/useVentas';
import { FILTROS_VACIOS, useFiltros } from '../hooks/useFiltros';
import { useFiltrosDisponibles, agruparOpciones } from '../hooks/useCatalogos';
import { fmtPesos, fmtNum } from '../lib/format';
import { capturarPng, compartirPng, descargarPng, nombreDeArchivo } from '../lib/imagen';
import { mensajeDeError } from '../lib/errores';
import ChartTooltip from '../components/ui/ChartTooltip';
import { colorDe } from '../components/ui/chartColors';
import EstadoDatos from '../components/ui/EstadoDatos';
import type { Filtros as TipoFiltros } from '../types/database.types';

/**
 * Reportes.
 *
 * Cada tipo de reporte trae lo suyo. En el prototipo los 6 renderizaban el
 * mismo bloque de KPIs + top de marcas + tabla de clientes y sólo cambiaba el
 * `<h2>`: elegir "Marketing y canales" mostraba lo mismo que "Resumen de
 * ventas". Acá el contenido depende del tipo, y cada uno consulta sólo lo que
 * necesita.
 *
 * Los 5 parámetros filtran de verdad: van a `useFiltros` y de ahí a las
 * funciones. Antes eran decorativos — cambiaban el color del `<select>` y nada
 * más. El sexto, Unidad de negocio, se agregó después (ver 10_filtro_...).
 *
 * Las fechas disappeared: el origen de datos maneja períodos mensuales, no
 * fechas sueltas. Un rango "01/10 a 31/10" no se puede traducir a algo que la
 * base pueda filtrar, así que el selector es por período.
 */

const REPORTES = [
  { id: 'ventas', label: 'Resumen de ventas', icon: '📊', desc: 'KPIs, evolución mensual y variación' },
  { id: 'cliente', label: 'Resumen por cliente', icon: '👤', desc: 'Historial, marcas y evolución de un cliente' },
  { id: 'marcas', label: 'Rendimiento de marcas', icon: '🏷️', desc: 'Participación, crecimiento y unidades' },
  { id: 'promotores', label: 'Análisis de promotores', icon: '🗺️', desc: 'Ranking de encargados y supervisores' },
  { id: 'marketing', label: 'Marketing y canales', icon: '📣', desc: 'Canal, segmento y subcanal' },
  { id: 'objetivos', label: 'Objetivos comerciales', icon: '🎯', desc: 'Estado de metas por responsable' },
] as const;

export default function Reports() {
  const [tipo, setTipo] = useState<(typeof REPORTES)[number]['id']>('ventas');
  const [filtros, setFiltrosState] = useState<TipoFiltros>(FILTROS_VACIOS);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [includes, setIncludes] = useState({
    kpis: true, charts: true, table: true, ranking: true,
    evolution: true, comparison: false,
  });

  const { data: opcionesRaw } = useFiltrosDisponibles();
  const opciones = useMemo(() => agruparOpciones(opcionesRaw ?? []), [opcionesRaw]);

  const toggle = (k: keyof typeof includes) => setIncludes((p) => ({ ...p, [k]: !p[k] }));

  const cambiarTipo = (nuevo: (typeof REPORTES)[number]['id']) => {
    setTipo(nuevo);
    // El filtro de cliente sólo aplica al reporte por cliente. Si queda puesto
    // al cambiar de tipo, las otras consultas filtrarían por un cliente sin que
    // el usuario lo haya pedido en ese reporte.
    if (nuevo !== 'cliente') setClienteId(null);
  };

  const hayFiltro = Object.values(filtros).some((v) => v !== null && v !== undefined);

  // ── Exportar como imagen ──────────────────────────────────────────────────
  // El reporte se captura tal cual se ve: la "hoja" con encabezado, KPIs,
  // gráficos y tablas. Mismo patrón que Resumen del día (`ResumenDia.tsx`).
  const hoja = useRef<HTMLDivElement>(null);
  const [imagen, setImagen] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);

  const nombreArchivo = () => nombreDeArchivo(`reporte-${tipo}`);

  /** Dibuja la hoja y devuelve el PNG (o null si falló). */
  async function generarImagen(): Promise<string | null> {
    const nodo = hoja.current;
    if (!nodo) return null;

    setGenerando(true);
    setErrorImagen(null);
    try {
      const url = await capturarPng(nodo);
      setImagen(url);
      return url;
    } catch (e) {
      setErrorImagen(mensajeDeError(e));
      return null;
    } finally {
      setGenerando(false);
    }
  }

  async function descargar() {
    const url = await generarImagen();
    if (url) descargarPng(url, nombreArchivo());
  }

  async function compartir() {
    try {
      const url = await generarImagen();
      if (!url) return;
      const resultado = await compartirPng(url, nombreArchivo(), `Reporte · ${etiquetaTipo}`);
      if (resultado === 'sin-soporte') {
        setErrorImagen(
          'Este navegador no permite compartir archivos. La imagen quedó lista: descargala y adjuntala.',
        );
      }
    } catch (e) {
      // Cancelar el panel de compartir no es un error.
      if ((e as DOMException)?.name !== 'AbortError') setErrorImagen(mensajeDeError(e));
    }
  }

  const etiquetaTipo = REPORTES.find((r) => r.id === tipo)?.label ?? 'Reporte';

  return (
    <div className="p-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Configuración ─────────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl p-4 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-3" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Tipo de reporte</h3>
            <div className="space-y-1.5">
              {REPORTES.map((rt) => (
                <button
                  key={rt.id}
                  onClick={() => cambiarTipo(rt.id)}
                  className="w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all"
                  style={{
                    borderColor: tipo === rt.id ? '#1D4ED8' : '#F1F5F9',
                    background: tipo === rt.id ? '#EFF6FF' : '#FAFBFF',
                  }}
                >
                  <span className="text-base leading-none mt-0.5 flex-shrink-0">{rt.icon}</span>
                  <div>
                    <div className="text-xs font-500" style={{ color: tipo === rt.id ? '#1D4ED8' : '#0F172A', fontFamily: 'Inter' }}>{rt.label}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>{rt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <PanelFiltros
            filtros={filtros}
            setFiltros={setFiltrosState}
            opciones={opciones}
            tipo={tipo}
            clienteId={clienteId}
            onCliente={setClienteId}
            hayFiltro={hayFiltro}
          />

          <div className="bg-white rounded-xl p-4 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-3" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Incluir</h3>
            <div className="space-y-2">
              {[
                { k: 'kpis' as const, l: 'KPIs principales' },
                { k: 'charts' as const, l: 'Gráficos de evolución' },
                { k: 'table' as const, l: 'Tabla de detalle' },
                { k: 'ranking' as const, l: 'Ranking' },
                { k: 'evolution' as const, l: 'Variación contra el período anterior' },
                { k: 'comparison' as const, l: 'Comparativa de unidades' },
              ].map((it) => (
                <label key={it.k} className="flex items-center gap-2.5 cursor-pointer">
                  <button onClick={() => toggle(it.k)} aria-label={it.l}
                    className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{ background: includes[it.k] ? '#1D4ED8' : '#F1F5F9', border: includes[it.k] ? 'none' : '1px solid #CBD5E1' }}>
                    {includes[it.k] && <Check size={9} color="white" strokeWidth={3} />}
                  </button>
                  <span className="text-xs" style={{ color: '#0F172A', fontFamily: 'Inter' }}>{it.l}</span>
                </label>
              ))}
            </div>
          </div>

          <AccionesImagen
            onDescargar={() => void descargar()}
            onCompartir={() => void compartir()}
            generando={generando}
            error={errorImagen}
          />
        </div>

        {/* ── Vista previa ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div ref={hoja} className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
            <div className="px-7 py-5" style={{ background: '#0A1628' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: '#1D4ED8' }}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                        <polyline points="1,13 5,8 8,11 12,5 15,8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </div>
                    <span className="text-xs font-500 text-white" style={{ fontFamily: 'Outfit' }}>AnalyticsBI</span>
                  </div>
                  <h2 className="font-display font-700 text-lg text-white" style={{ fontFamily: 'Outfit' }}>
                    {REPORTES.find((r) => r.id === tipo)?.label}
                  </h2>
                  <p className="text-[11px] mt-0.5" style={{ color: '#3B5A8A', fontFamily: 'JetBrains Mono' }}>
                    {describirFiltros(filtros, opciones.periodos)}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px]" style={{ color: '#3B5A8A', fontFamily: 'Inter' }}>Generado el</div>
                  <div className="text-xs" style={{ color: '#4A6FA0', fontFamily: 'JetBrains Mono' }}>
                    {new Date().toLocaleDateString('es-AR')}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-7 py-5 space-y-5">
              {tipo === 'ventas' && <ReporteVentas filtros={filtros} inc={includes} />}
              {tipo === 'cliente' && <ReporteCliente filtros={filtros} inc={includes} clienteId={clienteId} />}
              {tipo === 'marcas' && <ReporteMarcas filtros={filtros} inc={includes} />}
              {tipo === 'promotores' && <ReportePromotores filtros={filtros} inc={includes} />}
              {tipo === 'marketing' && <ReporteMarketing filtros={filtros} inc={includes} />}
              {tipo === 'objetivos' && <BloqueObjetivos />}
            </div>

            <div className="px-7 py-4 border-t" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                AnalyticsBI · Reporte generado desde la base comercial de Global Pack. Respeta los filtros elegidos.
              </span>
            </div>
          </div>
        </div>
      </div>

      {imagen && (
        <VisorImagen
          url={imagen}
          nombre={nombreArchivo()}
          onCerrar={() => setImagen(null)}
        />
      )}
    </div>
  );
}

type Inc = {
  kpis: boolean; charts: boolean; table: boolean
  ranking: boolean; evolution: boolean; comparison: boolean
};

// ═══ Cada reporte ═══════════════════════════════════════════════════════════

function ReporteVentas({ filtros, inc }: { filtros: TipoFiltros; inc: Inc }) {
  const { kpis, variaciones, serie, topClientes, porUnidad, isPending, error } = useReporteVentas(filtros);
  const conDatos = !!kpis && (serie.length > 0 || porUnidad.length > 0);

  /**
   * La evolución mensual necesita al menos dos períodos cargados. Con uno solo
   * el gráfico sería una raya con un punto: ahí se muestra el ranking de
   * clientes, que viene en el mismo jsonb de la RPC. Cuando se carguen meses
   * anteriores, la evolución vuelve sola.
   */
  const hayEvolucion = serie.length >= 2;
  const top10 = topClientes.slice(0, 10);
  const concentracion = top10.reduce((suma, c) => suma + Number(c.participacion ?? 0), 0);

  return (
    <EstadoDatos cargando={isPending} error={error} vacio={!conDatos} mensajeVacio="No hay ventas con los filtros seleccionados">
      {inc.kpis && kpis && (
        <div>
          <Seccion titulo="KPIs PRINCIPALES" />
          <div className="grid grid-cols-3 gap-3">
            <TarjetaKpi etiqueta="Ventas Netas" valor={fmtPesos(kpis.total_neto)} icono={<TrendingUp size={14} style={{ color: '#1D4ED8' }} />} variacion={inc.evolution ? variaciones?.variacion_neto : null} />
            <TarjetaKpi etiqueta="Operaciones" valor={fmtNum(kpis.operaciones)} icono={<ShoppingCart size={14} style={{ color: '#059669' }} />} variacion={inc.evolution ? variaciones?.variacion_operaciones : null} />
            <TarjetaKpi etiqueta="Clientes activos" valor={fmtNum(kpis.clientes_activos)} icono={<Users size={14} style={{ color: '#7C3AED' }} />} />
          </div>
        </div>
      )}

      {inc.charts && serie.length > 0 && (
        <div>
          <Seccion titulo={hayEvolucion ? 'EVOLUCIÓN MENSUAL' : 'TOP 10 CLIENTES'} />
          {hayEvolucion ? (
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={serie.map((s) => ({ mes: s.mes_corto, neto: Number(s.importe_neto), final: Number(s.importe_final) }))} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gRepNeto" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1D4ED8" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={compacto} width={54} />
                <Tooltip content={<ChartTooltip mostrarSerie />} />
                <Area type="monotone" dataKey="neto" name="Neto" stroke="#1D4ED8" strokeWidth={2} fill="url(#gRepNeto)" />
                <Area type="monotone" dataKey="final" name="Final" stroke="#059669" strokeWidth={1.5} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart
                  data={top10.map((c) => ({ nombre: c.cliente_nombre, ventas: Number(c.ventas) }))}
                  layout="vertical"
                  margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={compacto} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={104} />
                  <Tooltip content={<ChartTooltip mostrarSerie />} />
                  <Bar dataKey="ventas" name="Ventas" radius={[0, 4, 4, 0]} opacity={0.9}>
                    {top10.map((c, i) => (
                      <Cell key={c.id_cliente} fill={colorDe(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] mt-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                Con un solo período cargado mostramos el ranking de clientes; la evolución
                mensual aparece al cargar un segundo mes. El top 10 concentra{' '}
                <strong style={{ color: '#64748B' }}>{concentracion.toFixed(1)}%</strong> de las ventas.
              </p>
            </>
          )}
        </div>
      )}

      {inc.table && porUnidad.length > 0 && (
        <div>
          <Seccion titulo="DESGLOSE POR UNIDAD DE NEGOCIO" />
          <TablaSimple
            columnas={['Unidad', 'Ventas', 'Bultos', 'HL']}
            filas={porUnidad.map((u) => [
              u.unidad_nombre,
              fmtPesos(Number(u.ventas)),
              fmtNum(Number(u.bultos)),
              fmtNum(Number(u.hl)),
            ])}
          />
        </div>
      )}
    </EstadoDatos>
  );
}

function ReporteCliente({ filtros, inc, clienteId }: { filtros: TipoFiltros; inc: Inc; clienteId: number | null }) {
  const { cliente, historial, marcas, isPending, error } = useReporteCliente(filtros, clienteId);

  if (clienteId === null) {
    return (
      <div className="rounded-xl border p-8 text-center" style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}>
        <Users size={20} style={{ color: '#94A3B8', margin: '0 auto 8px' }} />
        <div className="text-sm" style={{ color: '#64748B', fontFamily: 'Inter' }}>
          Elegí un cliente en el panel de parámetros
        </div>
        <div className="text-[11px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          Este reporte muestra la evolución de un cliente, no un ranking.
        </div>
      </div>
    );
  }

  return (
    <EstadoDatos
      cargando={isPending}
      error={error}
      vacio={!cliente}
      mensajeVacio="El cliente elegido no tiene ventas con los filtros seleccionados"
    >
      {cliente && (
        <>
          <div>
            <Seccion titulo="CLIENTE" />
            <div className="rounded-xl p-4 border" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>{cliente.nombre}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>{cliente.razon_social}</div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-500"
                  style={{ background: cliente.activo ? '#F0FDF4' : '#FEF2F2', color: cliente.activo ? '#059669' : '#EF4444', fontFamily: 'Inter' }}>
                  {cliente.activo ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>Ventas totales</div>
                  <div className="font-700 text-base" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>{fmtPesos(cliente.ventas_total)}</div>
                </div>
                <div>
                  <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>Última venta</div>
                  <div className="font-700 text-base" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>{cliente.ultima_venta ?? '—'}</div>
                </div>
              </div>
            </div>
          </div>

          {inc.charts && historial.length > 0 && (
            <div>
              <Seccion titulo="EVOLUCIÓN DEL CLIENTE" />
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={historial.map((h) => ({ mes: h.nombre_mes.slice(0, 3), ventas: Number(h.ventas) }))} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={compacto} width={54} />
                  <Tooltip content={<ChartTooltip mostrarSerie />} />
                  <Bar dataKey="ventas" name="Ventas" fill="#1D4ED8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {inc.ranking && marcas.length > 0 && (
            <div>
              <Seccion titulo="MARCAS QUE COMPRA" />
              <TablaSimple
                columnas={['Marca', 'Ventas', 'Unidades']}
                filas={marcas.filter((m) => Number(m.ventas) > 0).map((m) => [
                  m.marca_nombre ?? '—', fmtPesos(Number(m.ventas)), fmtNum(Number(m.unidades)),
                ])}
              />
            </div>
          )}

          {inc.table && historial.length > 0 && (
            <div>
              <Seccion titulo="HISTORIAL MENSUAL" />
              <TablaSimple
                columnas={['Período', 'Ventas', 'Neto']}
                filas={[...historial].reverse().map((h) => [
                  `${h.nombre_mes} ${h.anio}`, fmtPesos(Number(h.ventas)), fmtPesos(Number(h.neto)),
                ])}
              />
            </div>
          )}
        </>
      )}
    </EstadoDatos>
  );
}

function ReporteMarcas({ filtros, inc }: { filtros: TipoFiltros; inc: Inc }) {
  const { marcas, unidades, isPending, error } = useReporteMarcas(filtros);
  const conVentas = marcas.filter((m) => Number(m.ventas) > 0);
  const max = conVentas[0] ? Number(conVentas[0].ventas) : 1;

  return (
    <EstadoDatos cargando={isPending} error={error} vacio={conVentas.length === 0} mensajeVacio="No hay ventas por marca con los filtros seleccionados">
      {inc.ranking && (
        <div>
          <Seccion titulo="PARTICIPACIÓN POR MARCA" />
          <div className="space-y-2">
            {conVentas.map((m, i) => (
              <div key={m.id_marca} className="flex items-center gap-3">
                <span className="text-[10px] w-5 text-right flex-shrink-0" style={{ color: '#CBD5E1', fontFamily: 'JetBrains Mono' }}>{i + 1}</span>
                <span className="flex-1 text-xs truncate" style={{ color: '#64748B', fontFamily: 'Inter' }}>{m.marca_nombre ?? '—'}</span>
                <div className="w-28 h-1.5 rounded-full overflow-hidden flex-shrink-0" style={{ background: '#F1F5F9' }}>
                  <div className="h-full rounded-full" style={{ width: `${(Number(m.ventas) / max) * 100}%`, background: colorDe(i) }} />
                </div>
                <span className="text-[11px] font-600 w-16 text-right" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>{fmtPesos(Number(m.ventas))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {inc.evolution && conVentas.length > 0 && (
        <div>
          <Seccion titulo="CRECIMIENTO VS. PERÍODO ANTERIOR" />
          <TablaSimple
            columnas={['Marca', 'Ventas', 'Crecimiento']}
            filas={conVentas.map((m) => {
              const c = Number(m.crecimiento);
              return [
                m.marca_nombre ?? '—',
                fmtPesos(Number(m.ventas)),
                `${c >= 0 ? '+' : ''}${c.toFixed(1)}%`,
              ];
            })}
          />
        </div>
      )}

      {inc.table && unidades.length > 0 && (
        <div>
          <Seccion titulo="UNIDADES DE NEGOCIO" />
          <TablaSimple
            columnas={['Unidad', 'Ventas', 'Bultos']}
            filas={unidades.map((u) => [u.unidad_nombre, fmtPesos(Number(u.ventas)), fmtNum(Number(u.bultos))])}
          />
        </div>
      )}
    </EstadoDatos>
  );
}

function ReportePromotores({ filtros, inc }: { filtros: TipoFiltros; inc: Inc }) {
  const { encargados, porUnidad, isPending, error } = useReportePromotores(filtros);
  const conVentas = encargados.filter((e) => Number(e.ventas) > 0);

  return (
    <EstadoDatos cargando={isPending} error={error} vacio={conVentas.length === 0} mensajeVacio="No hay ventas por encargado con los filtros seleccionados">
      {inc.ranking && (
        <div>
          <Seccion titulo="RANKING DE ENCARGADOS" />
          <TablaSimple
            columnas={['#', 'Encargado', 'Supervisor', 'Clientes', 'Ventas']}
            filas={conVentas.map((e, i) => [
              String(i + 1),
              e.encargado_nombre,
              e.supervisor_nombre ?? '—',
              fmtNum(Number(e.clientes)),
              fmtPesos(Number(e.ventas)),
            ])}
          />
        </div>
      )}

      {inc.charts && conVentas.length > 0 && (
        <div>
          <Seccion titulo="VENTAS POR ENCARGADO" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={conVentas.map((e) => ({ nombre: e.encargado_nombre, ventas: Number(e.ventas) }))} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={compacto} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Inter' }} axisLine={false} tickLine={false} width={110} />
              <Tooltip content={<ChartTooltip mostrarSerie />} />
              <Bar dataKey="ventas" name="Ventas" fill="#1D4ED8" radius={[0, 4, 4, 0]} opacity={0.9} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {inc.comparison && porUnidad.length > 0 && (
        <div>
          <Seccion titulo="COMPARATIVA DE UNIDADES" />
          <TablaSimple
            columnas={['Unidad', 'Ventas', 'HL']}
            filas={porUnidad.map((u) => [u.unidad_nombre, fmtPesos(Number(u.ventas)), fmtNum(Number(u.hl))])}
          />
        </div>
      )}
    </EstadoDatos>
  );
}

function ReporteMarketing({ filtros, inc }: { filtros: TipoFiltros; inc: Inc }) {
  const { filas, isPending, error } = useReporteMarketing(filtros);

  const porCanal = useMemo(() => agruparPorNivel(filas as never, 'canal_ajustado'), [filas]);
  const porSegmento = useMemo(() => agruparPorNivel(filas as never, 'segmento'), [filas]);

  return (
    <EstadoDatos cargando={isPending} error={error} vacio={filas.length === 0} mensajeVacio="No hay ventas clasificadas por marketing con los filtros seleccionados">
      {inc.ranking && porCanal.length > 0 && (
        <div>
          <Seccion titulo="VENTAS POR CANAL AJUSTADO" />
          <TablaSimple
            columnas={['Canal', 'Ventas', 'Clientes']}
            filas={filas.map((f) => [
              f.canal_ajustado ?? '—',
              fmtPesos(Number(f.ventas)),
              fmtNum(Number(f.clientes)),
            ])}
          />
        </div>
      )}

      {inc.charts && porCanal.length > 0 && (
        <div>
          <Seccion titulo="DISTRIBUCIÓN POR CANAL Y SEGMENTO" />
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porSegmento} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="nombre" tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} tickFormatter={compacto} width={54} />
              <Tooltip content={<ChartTooltip mostrarSerie />} />
              <Bar dataKey="ventas" name="Ventas" radius={[4, 4, 0, 0]}>
                {porSegmento.map((s, i) => (
                  <Cell key={s.nombre} fill={colorDe(i)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </EstadoDatos>
  );
}

/**
 * Objetivos.
 *
 * El origen de datos no tiene metas: no están en el Excel. Antes el prototipo
 * mostraba 5 personas con objetivos escritos a mano y un "% de cumplimiento"
 * calculado sobre ellos, más un aviso que decía que faltaban — o sea, se
 * contradecía a sí mismo. Acá sólo se explica la situación.
 */
function BloqueObjetivos() {
  return (
    <div>
      <Seccion titulo="OBJETIVOS COMERCIALES" />
      <div className="flex items-start gap-2.5 rounded-xl border p-4" style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}>
        <Info size={15} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
        <div>
          <div className="text-xs font-600" style={{ color: '#92400E', fontFamily: 'Inter' }}>Sin metas cargadas</div>
          <div className="text-[11px] mt-1" style={{ color: '#D97706', fontFamily: 'Inter' }}>
            El origen de datos no incluye objetivos comerciales, así que no hay cumplimiento
            que calcular. Cuando se definan las metas por responsable, este módulo
            mostrará el porcentaje de avance de cada uno.
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ Panel de parámetros ════════════════════════════════════════════════════

type Opt = { valor: string; texto: string };

function PanelFiltros({
  filtros, setFiltros, opciones, tipo, clienteId, onCliente, hayFiltro,
}: {
  filtros: TipoFiltros
  setFiltros: (f: TipoFiltros) => void
  opciones: ReturnType<typeof agruparOpciones>
  tipo: string
  clienteId: number | null
  onCliente: (id: number | null) => void
  hayFiltro: boolean
}) {
  const { setFiltro } = useFiltros(filtros, setFiltros);

  // El `<select>` usa el id del período (único); el RPC recibe el mes real
  // (1–12) y el año. Ver `45_catalogo_periodo_mes.sql`.
  const periodoActual =
    opciones.periodos.find((p) => p.mes === filtros.p_mes && p.anio === filtros.p_anio) ?? null;

  return (
    <div className="bg-white rounded-xl p-4 border" style={{ borderColor: '#E2E8F0' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Parámetros</h3>
        {hayFiltro && (
          <button onClick={() => setFiltros(FILTROS_VACIOS)}
            className="text-[10px] px-1.5 py-0.5 rounded font-500"
            style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}>
            Limpiar
          </button>
        )}
      </div>

      <div className="space-y-3">
        <Select
          etiqueta="PERÍODO"
          valor={periodoActual ? String(periodoActual.id) : ''}
          onChange={(v) => {
            const p = opciones.periodos.find((x) => String(x.id) === v) ?? null;
            // Un solo setFiltros: dos setFiltro seguidos partirían del mismo
            // `filtros` y el segundo pisaría al primero.
            setFiltros({
              ...filtros,
              p_mes: p ? p.mes : null,
              p_anio: p ? p.anio : null,
            });
          }}
          opciones={opciones.periodos.map((p) => ({ valor: String(p.id), texto: p.etiqueta }))}
          placeholder="Todos los períodos"
        />

        {/* Sólo el reporte por cliente necesita elegir a quién mirar. */}
        {tipo === 'cliente' && (
          <Select
            etiqueta="CLIENTE A ANALIZAR"
            valor={clienteId === null ? '' : String(clienteId)}
            onChange={(v) => onCliente(v === '' ? null : Number(v))}
            opciones={opciones.clientes.map((c) => ({ valor: String(c.id), texto: c.nombre }))}
            placeholder="Elegí un cliente"
            resaltado
          />
        )}

        <Select
          etiqueta={tipo === 'cliente' ? 'OTROS CLIENTES' : 'CLIENTE'}
          valor={filtros.p_cliente === null ? '' : String(filtros.p_cliente)}
          onChange={(v) => setFiltro('p_cliente', v === '' ? null : Number(v))}
          opciones={opciones.clientes.map((c) => ({ valor: String(c.id), texto: c.nombre }))}
          placeholder="Todos"
        />

        <Select etiqueta="LOCALIDAD" valor={filtros.p_localidad === null ? '' : String(filtros.p_localidad)}
          onChange={(v) => setFiltro('p_localidad', v === '' ? null : Number(v))}
          opciones={opciones.localidades.map((l) => ({ valor: String(l.id), texto: l.nombre }))} placeholder="Todas" />

        <Select etiqueta="MARCA" valor={filtros.p_marca === null ? '' : String(filtros.p_marca)}
          onChange={(v) => setFiltro('p_marca', v === '' ? null : Number(v))}
          opciones={opciones.marcas.map((m) => ({ valor: String(m.id), texto: m.nombre }))} placeholder="Todas" />

        <Select etiqueta="ENCARGADO" valor={filtros.p_encargado === null ? '' : String(filtros.p_encargado)}
          onChange={(v) => setFiltro('p_encargado', v === '' ? null : Number(v))}
          opciones={opciones.encargados.map((e) => ({ valor: String(e.id), texto: e.nombre }))} placeholder="Todos" />

        <Select etiqueta="UNIDAD DE NEGOCIO" valor={filtros.p_unidad_negocio === null ? '' : String(filtros.p_unidad_negocio)}
          onChange={(v) => setFiltro('p_unidad_negocio', v === '' ? null : Number(v))}
          opciones={opciones.unidades.map((u) => ({ valor: String(u.id), texto: u.nombre }))} placeholder="Todas" />

        <Select etiqueta="CANAL" valor={filtros.p_canal ?? ''}
          onChange={(v) => setFiltro('p_canal', v === '' ? null : v)}
          opciones={opciones.canales.map((c) => ({ valor: c, texto: c }))} placeholder="Todos" />
      </div>
    </div>
  );
}

// ═══ Piezas ════════════════════════════════════════════════════════════════

function Select({
  etiqueta, valor, onChange, opciones, placeholder, resaltado,
}: {
  etiqueta: string
  valor: string
  onChange: (v: string) => void
  opciones: Opt[]
  placeholder: string
  /** Resalta el borde: marca el parámetro que define el reporte. */
  resaltado?: boolean
}) {
  return (
    <div>
      <label className="text-[10px] font-500 block mb-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>{etiqueta}</label>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs px-2.5 py-1.5 rounded-lg border outline-none"
        style={{
          borderColor: resaltado ? '#1D4ED8' : valor ? '#93C5FD' : '#E2E8F0',
          background: valor ? '#EFF6FF' : 'white',
          fontFamily: 'Inter',
          color: valor ? '#1D4ED8' : '#64748B',
          fontWeight: resaltado ? 500 : 400,
        }}
      >
        <option value="">{placeholder}</option>
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
    </div>
  );
}

function Seccion({ titulo }: { titulo: string }) {
  return (
    <h4 className="font-600 text-xs mb-3 pb-1.5 border-b"
      style={{ color: '#94A3B8', fontFamily: 'Outfit', borderColor: '#F1F5F9', letterSpacing: '0.06em' }}>
      {titulo}
    </h4>
  );
}

function TarjetaKpi({
  etiqueta, valor, icono, variacion,
}: {
  etiqueta: string; valor: string; icono: React.ReactNode; variacion?: number | null
}) {
  return (
    <div className="rounded-xl p-3.5 border" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
      <div className="flex items-center gap-2 mb-1.5">
        {icono}
        <span className="text-[10px] flex-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>{etiqueta}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display font-700 text-lg" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>{valor}</span>
        {/* `null` = no comparable. No se muestra 0% porque afirmaría que se mantuvo. */}
        {variacion !== null && variacion !== undefined && (
          <span className="text-[10px] font-600"
            style={{ color: variacion >= 0 ? '#059669' : '#EF4444', fontFamily: 'JetBrains Mono' }}>
            {variacion >= 0 ? '+' : ''}{variacion.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function TablaSimple({ columnas, filas }: { columnas: string[]; filas: string[][] }) {
  if (filas.length === 0) return null;
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
      <table className="w-full">
        <thead>
          <tr style={{ background: '#F8FAFC' }}>
            {columnas.map((c) => (
              <th key={c} className="text-left px-3 py-2.5 text-[11px] font-600" style={{ color: '#64748B', fontFamily: 'Outfit' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-t" style={{ borderColor: '#F8FAFC' }}>
              {f.map((celda, j) => (
                <td key={j} className="px-3 py-2.5 text-xs"
                  style={{
                    color: j === 0 ? '#0F172A' : '#64748B',
                    fontFamily: j === 0 ? 'Inter' : 'JetBrains Mono',
                    fontWeight: j === 0 ? 500 : 400,
                  }}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Botón sin acción.
 *
 * Se ve que falta en vez de fingir que funciona. La exportación es un módulo
 * pendiente; un botón que no responde hace que el usuario lo pruebe una y otra
 * vez esperando algo.
 */
/**
 * Exportación del reporte como imagen.
 *
 * No hay PDF ni Excel: el reporte se captura tal como se ve (la "hoja" con
 * encabezado, KPIs, gráficos y tablas) y se descarga o se comparte como PNG.
 * Es el mismo flujo de "Resumen del día" (`ResumenDia.tsx`), que es lo que los
 * supervisores usan para mandar por WhatsApp.
 *
 * Va en la columna de configuración, FUERA de la hoja: así los botones no
 * salen dentro del PNG.
 */
function AccionesImagen({
  onDescargar,
  onCompartir,
  generando,
  error,
}: {
  onDescargar: () => void
  onCompartir: () => void
  generando: boolean
  error: string | null
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <button
          onClick={onDescargar}
          disabled={generando}
          className="py-2 px-3 rounded-xl text-xs font-600 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
          style={{
            background: '#1D4ED8',
            color: '#fff',
            fontFamily: 'Inter',
            cursor: generando ? 'wait' : 'pointer',
          }}
        >
          {generando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {generando ? 'Generando…' : 'Descargar imagen'}
        </button>
        <button
          onClick={onCompartir}
          disabled={generando}
          className="py-2 px-3 rounded-xl text-xs font-600 flex items-center justify-center gap-1.5 border transition-all disabled:opacity-50"
          style={{ background: '#fff', borderColor: '#E2E8F0', color: '#334155', fontFamily: 'Inter' }}
        >
          <Share2 size={13} />
          Compartir
        </button>
      </div>
      {error && (
        <p className="text-[10px] leading-snug" style={{ color: '#B45309', fontFamily: 'Inter' }}>
          {error}
        </p>
      )}
    </div>
  );
}

/** Vista previa de la imagen generada, con descarga directa. */
function VisorImagen({ url, nombre, onCerrar }: { url: string; nombre: string; onCerrar: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center p-4 gap-3 overflow-auto"
      style={{ background: 'rgba(15, 23, 42, 0.65)' }}
      onClick={onCerrar}
    >
      <div
        className="flex items-center justify-between gap-3 w-full max-w-[860px] py-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-sm font-600" style={{ color: '#FFFFFF', fontFamily: 'Outfit' }}>
            Vista previa del reporte
          </div>
          <div className="text-[11px]" style={{ color: '#CBD5E1', fontFamily: 'Inter' }}>
            En el celular podés mantener presionada la imagen para guardarla.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={url}
            download={nombre}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-600"
            style={{ background: '#FFFFFF', color: '#1D4ED8', fontFamily: 'Inter' }}
          >
            <Download size={14} /> Descargar PNG
          </a>
          <button
            onClick={onCerrar}
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#FFFFFF' }}
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <img
        src={url}
        alt="Vista previa del reporte"
        className="w-full max-w-[860px] rounded-lg"
        style={{ boxShadow: '0 20px 45px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

/** Eje compacto: los importes son grandes y la etiqueta no puede ocupar media barra. */
const compacto = (v: number): string =>
  Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`;

/** Una línea de texto que describe qué está mirando el reporte. */
function describirFiltros(
  f: TipoFiltros,
  periodos: Array<{ id: number | null; mes: number; anio: number; etiqueta: string }>,
): string {
  const partes: string[] = [];
  if (f.p_mes !== null && f.p_mes !== undefined) {
    // `p_mes` es el mes real (1–12), no el id del período: el período se
    // identifica por mes + año.
    const p = periodos.find((x) => x.mes === f.p_mes && x.anio === f.p_anio);
    if (p) partes.push(p.etiqueta);
  } else {
    partes.push('Todos los períodos');
  }
  const otros = [
    f.p_cliente ? '1 cliente' : null,
    f.p_marca ? '1 marca' : null,
    f.p_localidad ? '1 localidad' : null,
    f.p_encargado ? '1 encargado' : null,
    f.p_unidad_negocio ? '1 unidad' : null,
    f.p_canal ?? null,
  ].filter(Boolean);
  return partes.join(' · ') + (otros.length ? ` · ${otros.join(' · ')}` : '');
}