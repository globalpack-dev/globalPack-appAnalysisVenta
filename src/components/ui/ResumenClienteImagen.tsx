import { useEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Loader2, Share2, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useHistorialCliente, useProductosCliente, nombreDeCliente } from '../../hooks/useCatalogos';
import { capturarPng, compartirPng, descargarPng, nombreDeArchivo } from '../../lib/imagen';
import { mensajeDeError } from '../../lib/errores';
import { fmtNum, fmtPesos } from '../../lib/format';
import ChartTooltip from './ChartTooltip';
import EstadoDatos from './EstadoDatos';
import type { FilaCliente, Filtros } from '../../types/database.types';

/**
 * Resumen del cliente en imagen.
 *
 * Abre una vista previa a pantalla completa con la tarjeta que se manda por
 * WhatsApp. La imagen sale de la tarjeta visible con `html-to-image`
 * (`lib/imagen.ts`), el mismo patrón que Reportes y Resumen del día: los
 * botones quedan fuera del nodo capturado, así que no ensucian el PNG.
 *
 * Los datos salen de los mismos hooks que usa la ficha (`useHistorialCliente`
 * y `useProductosCliente`), así que si el usuario ya miró las pestañas, la
 * caché de React Query responde al instante.
 *
 * El resumen abarca TODO el historial del cliente (con los filtros globales
 * que estén activos en la app). No hay selector de fechas: el origen de datos
 * es mensual y un rango de días no se puede traducir a lo que devuelve la
 * base. La tarjeta se corta en los últimos 12 períodos del gráfico y en los
 * top 6 de productos/marcas para que no sea kilométrica; los totales, en
 * cambio, suman todo el historial.
 */

type ProductoAgregado = {
  id: number;
  nombre: string;
  codigo: string;
  marca: string | null;
  calibre: string | null;
  neto: number;
  ventas: number;
  bultos: number;
  hl: number;
};

type MarcaAgregada = {
  nombre: string;
  neto: number;
};

/** Pesos completos para la tarjeta: un total de $1.234.567 se lee mejor que $1.2M. */
function pesos(n: number): string {
  return `$${Math.round(n).toLocaleString('es-AR')}`;
}

export default function ResumenClienteImagen({
  cliente,
  filtros,
  onCerrar,
}: {
  cliente: FilaCliente;
  filtros: Filtros;
  onCerrar: () => void;
}) {
  const {
    data: historial,
    isPending: cargandoHistorial,
    error: errorHistorial,
  } = useHistorialCliente(cliente.id_cliente, filtros);
  const {
    data: productos,
    isPending: cargandoProductos,
    error: errorProductos,
  } = useProductosCliente(cliente.id_cliente, filtros);

  const [generando, setGenerando] = useState(false);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);

  // El nodo que se convierte a PNG: sólo la tarjeta, no la barra de acciones.
  const tarjetaRef = useRef<HTMLDivElement>(null);

  const cargando = cargandoHistorial || cargandoProductos;
  const error = errorHistorial ?? errorProductos;

  const nombre = nombreDeCliente(cliente);
  const fecha = useMemo(() => new Date().toLocaleDateString('es-AR'), []);
  const nombreArchivo = useMemo(
    () => nombreDeArchivo(`resumen-cliente-${cliente.codigo_cliente}`),
    [cliente.codigo_cliente],
  );

  // Cerrar con Escape, como cualquier overlay.
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  // ── Totales del historial completo ────────────────────────────────────────
  const totales = useMemo(() => {
    const filas = historial ?? [];
    const conVenta = filas.filter((h) => Number(h.ventas) > 0);
    const ventas = filas.reduce((s, h) => s + Number(h.ventas), 0);
    const neto = filas.reduce((s, h) => s + Number(h.neto), 0);
    const bultos = filas.reduce((s, h) => s + Number(h.bultos), 0);
    const hl = filas.reduce((s, h) => s + Number(h.hl), 0);

    const ultima = filas[filas.length - 1] ?? null;
    const previa = filas.length > 1 ? filas[filas.length - 2] : null;
    const variacion =
      previa && Number(previa.ventas) > 0
        ? ((Number(ultima?.ventas ?? 0) - Number(previa.ventas)) / Number(previa.ventas)) * 100
        : null;

    const encargados = new Set(
      filas
        .map((h) => h.encargado_nombre)
        .filter((n): n is string => Boolean(n && n.trim())),
    );

    return {
      ventas,
      neto,
      bultos,
      hl,
      ultima,
      variacion,
      periodos: conVenta.length,
      encargados: encargados.size,
      promedio: conVenta.length > 0 ? ventas / conVenta.length : 0,
    };
  }, [historial]);

  // Los últimos 12 períodos, en orden cronológico para el gráfico.
  const serieGrafico = useMemo(
    () =>
      (historial ?? []).slice(-12).map((h) => ({
        mes: `${h.mes_corto} ${String(h.anio).slice(2)}`,
        ventas: Number(h.ventas),
      })),
    [historial],
  );

  // Últimos 6 períodos, del más reciente al más viejo, con su variación.
  const ultimosPeriodos = useMemo(() => {
    const filas = historial ?? [];
    return filas
      .map((h, i) => {
        const previa = filas[i - 1];
        const delta =
          previa && Number(previa.ventas) > 0
            ? ((Number(h.ventas) - Number(previa.ventas)) / Number(previa.ventas)) * 100
            : null;
        return {
          id: `${h.anio}-${h.mes}`,
          periodo: `${h.nombre_mes} ${h.anio}`,
          encargado: h.encargado_nombre,
          ventas: Number(h.ventas),
          neto: Number(h.neto),
          delta,
        };
      })
      .slice(-6)
      .reverse();
  }, [historial]);

  // Productos: se agregan todas las filas (una por período) en un total por
  // producto. Se muestran los 6 de mayor neto.
  const productosTop = useMemo<ProductoAgregado[]>(() => {
    const mapa = new Map<number, ProductoAgregado>();
    for (const p of productos ?? []) {
      const actual = mapa.get(p.id_producto);
      if (actual) {
        actual.neto += Number(p.neto);
        actual.ventas += Number(p.ventas);
        actual.bultos += Number(p.bultos);
        actual.hl += Number(p.hl);
      } else {
        mapa.set(p.id_producto, {
          id: p.id_producto,
          nombre: p.producto_nombre,
          codigo: p.codigo_producto,
          marca: p.marca_nombre,
          calibre: p.calibre_nombre,
          neto: Number(p.neto),
          ventas: Number(p.ventas),
          bultos: Number(p.bultos),
          hl: Number(p.hl),
        });
      }
    }
    return [...mapa.values()].sort((a, b) => b.neto - a.neto);
  }, [productos]);

  // Marcas: participación sobre el neto comprado.
  const marcasTop = useMemo<MarcaAgregada[]>(() => {
    const mapa = new Map<string, number>();
    for (const p of productos ?? []) {
      const clave = p.marca_nombre?.trim() || 'Sin marca';
      mapa.set(clave, (mapa.get(clave) ?? 0) + Number(p.neto));
    }
    return [...mapa.entries()]
      .map(([nombre, neto]) => ({ nombre, neto }))
      .sort((a, b) => b.neto - a.neto);
  }, [productos]);

  const sinVentas = !cargando && !error && (historial ?? []).length === 0;

  async function descargar() {
    const nodo = tarjetaRef.current;
    if (!nodo) return;
    setGenerando(true);
    setErrorImagen(null);
    try {
      const url = await capturarPng(nodo);
      descargarPng(url, nombreArchivo);
    } catch (e) {
      setErrorImagen(mensajeDeError(e));
    } finally {
      setGenerando(false);
    }
  }

  async function compartir() {
    const nodo = tarjetaRef.current;
    if (!nodo) return;
    setGenerando(true);
    setErrorImagen(null);
    try {
      const url = await capturarPng(nodo);
      const resultado = await compartirPng(url, nombreArchivo, `Resumen de cliente · ${nombre}`);
      if (resultado === 'sin-soporte') {
        setErrorImagen(
          'Este navegador no permite compartir archivos. La imagen se puede descargar y adjuntar.',
        );
      }
    } catch (e) {
      // Cancelar el panel de compartir no es un error.
      if ((e as DOMException)?.name !== 'AbortError') setErrorImagen(mensajeDeError(e));
    } finally {
      setGenerando(false);
    }
  }

  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const accionesDeshabilitadas = cargando || Boolean(error) || sinVentas || generando;

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto"
      style={{ background: 'rgba(15,23,42,0.65)' }}
      onClick={onCerrar}
    >
      <div className="max-w-[860px] mx-auto w-full px-4 py-5" onClick={(e) => e.stopPropagation()}>
        {/* Barra de acciones: fuera de la tarjeta para que no entre al PNG */}
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3
              className="font-display font-700 text-base"
              style={{ color: '#fff', fontFamily: 'Outfit' }}
            >
              Resumen del cliente
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: '#CBD5E1', fontFamily: 'Inter' }}>
              La imagen se genera desde esta misma tarjeta. En el celular también podés
              mantenerla presionada para guardarla.
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="p-2 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.12)', color: '#fff' }}
            aria-label="Cerrar resumen"
          >
            <X size={16} />
          </button>
        </div>

        <EstadoDatos
          cargando={cargando}
          error={error}
          childrenCargando={
            <div
              className="bg-white rounded-2xl p-8 text-center"
              style={{ color: '#94A3B8', fontFamily: 'Inter' }}
            >
              Preparando el resumen…
            </div>
          }
        >
          {/* ── Tarjeta capturable ──────────────────────────────────────────── */}
          <div
            ref={tarjetaRef}
            className="bg-white rounded-2xl overflow-hidden w-full"
            style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
          >
            {/* Cabecera */}
            <div className="px-6 pt-6 pb-5" style={{ background: '#0F172A' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div
                    className="text-[10px] font-600 mb-1"
                    style={{ color: '#93C5FD', fontFamily: 'Outfit', letterSpacing: '0.08em' }}
                  >
                    GLOBAL PACK · RESUMEN DE CLIENTE
                  </div>
                  <div
                    className="font-display font-700 text-xl"
                    style={{ color: '#fff', fontFamily: 'Outfit' }}
                  >
                    {nombre}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                    {cliente.razon_social} · Código {cliente.codigo_cliente}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                    {cliente.localidad_nombre ?? 'Sin localidad'} ·{' '}
                    {cliente.activo ? 'Activo' : 'Inactivo'}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                    Generado el
                  </div>
                  <div className="text-[11px] font-600" style={{ color: '#fff', fontFamily: 'Inter' }}>
                    {fecha}
                  </div>
                  {totales.ultima && (
                    <div
                      className="inline-block mt-2 text-[9px] px-2 py-0.5 rounded font-600"
                      style={{ background: '#1E293B', color: '#93C5FD', fontFamily: 'Inter' }}
                    >
                      Últ. venta: {totales.ultima.nombre_mes} {totales.ultima.anio}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* KPIs principales */}
            <div className="grid grid-cols-2 md:grid-cols-4 md:divide-x" style={{ borderColor: '#F1F5F9' }}>
              {[
                { label: 'Ventas totales', value: pesos(totales.ventas), color: '#1D4ED8' },
                { label: 'Ventas netas', value: pesos(totales.neto), color: '#047857' },
                {
                  label: 'Última venta',
                  value: totales.ultima
                    ? `${totales.ultima.nombre_mes} ${totales.ultima.anio}`
                    : '—',
                  color: '#B45309',
                },
                { label: 'Períodos con compra', value: `${totales.periodos}`, color: '#6D28D9' },
              ].map((k) => (
                <div key={k.label} className="px-5 py-4" style={{ borderColor: '#F1F5F9' }}>
                  <div
                    className="font-display font-700 text-base"
                    style={{ color: k.color, fontFamily: 'Outfit' }}
                  >
                    {k.value}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                    {k.label}
                  </div>
                </div>
              ))}
            </div>

            {/* KPIs secundarios */}
            <div
              className="grid grid-cols-2 md:grid-cols-4 gap-2 px-5 py-3"
              style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9' }}
            >
              {[
                { label: 'Bultos', value: fmtNum(Math.round(totales.bultos)) },
                { label: 'HL', value: fmtNum(Math.round(totales.hl)) },
                { label: 'Encargados', value: `${totales.encargados}` },
                { label: 'Promedio por período', value: pesos(totales.promedio) },
              ].map((k) => (
                <div key={k.label}>
                  <div className="text-[11px] font-600" style={{ color: '#334155', fontFamily: 'Inter' }}>
                    {k.value}
                  </div>
                  <div className="text-[9px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                    {k.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Evolución */}
              {serieGrafico.length > 1 && (
                <section>
                  <Titulo>Evolución de ventas</Titulo>
                  <p className="text-[10px] mb-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                    {serieGrafico.length < (historial ?? []).length
                      ? `Últimos ${serieGrafico.length} períodos con facturación`
                      : 'Todos los períodos con facturación'}
                  </p>
                  <div style={{ width: '100%', height: 170 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={serieGrafico}>
                        <defs>
                          <linearGradient id="gResumenCliente" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1D4ED8" stopOpacity={0.16} />
                            <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis
                          dataKey="mes"
                          tick={{ fontSize: 9, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={fmtPesos}
                          width={50}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="ventas"
                          name="Ventas"
                          stroke="#1D4ED8"
                          strokeWidth={2}
                          fill="url(#gResumenCliente)"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              {/* Productos principales */}
              <section>
                <Titulo>Productos principales</Titulo>
                {productosTop.length === 0 ? (
                  <p className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                    Sin detalle de productos para este cliente.
                  </p>
                ) : (
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['Producto', 'Marca', 'Bultos', 'Neto', '% del neto'].map((h, i) => (
                            <th
                              key={h}
                              className={`text-left px-3 py-2 text-[9px] font-600 ${i >= 2 ? 'text-right' : ''}`}
                              style={{ color: '#64748B', fontFamily: 'Outfit' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {productosTop.slice(0, 6).map((p) => (
                          <tr key={p.id} className="border-t" style={{ borderColor: '#F1F5F9' }}>
                            <td className="px-3 py-2" style={{ fontFamily: 'Inter' }}>
                              <div className="text-[11px] font-500" style={{ color: '#0F172A' }}>
                                {p.nombre}
                              </div>
                              <div className="text-[9px]" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
                                {p.codigo}
                                {p.calibre ? ` · ${p.calibre}` : ''}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-[10px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                              {p.marca ?? '—'}
                            </td>
                            <td
                              className="px-3 py-2 text-[10px] text-right"
                              style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}
                            >
                              {fmtNum(Math.round(p.bultos))}
                            </td>
                            <td
                              className="px-3 py-2 text-[10px] text-right font-600"
                              style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}
                            >
                              {pesos(p.neto)}
                            </td>
                            <td
                              className="px-3 py-2 text-[10px] text-right"
                              style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}
                            >
                              {totales.neto > 0 ? `${((p.neto / totales.neto) * 100).toFixed(1)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Marcas compradas */}
              {marcasTop.length > 0 && (
                <section>
                  <Titulo>Marcas compradas</Titulo>
                  <div className="flex flex-wrap gap-1.5">
                    {marcasTop.slice(0, 8).map((m) => (
                      <span
                        key={m.nombre}
                        className="text-[10px] px-2 py-1 rounded-md font-500"
                        style={{ background: '#EFF6FF', color: '#1D4ED8', fontFamily: 'Inter' }}
                      >
                        {m.nombre}
                        {totales.neto > 0 ? (
                          <span style={{ color: '#64748B' }}>
                            {' '}
                            · {((m.neto / totales.neto) * 100).toFixed(0)}%
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Últimos períodos */}
              {ultimosPeriodos.length > 0 && (
                <section>
                  <Titulo>Últimos períodos</Titulo>
                  <div className="rounded-lg border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
                    <table className="w-full">
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          {['Período', 'Encargado', 'Ventas', 'Neto', 'Variación'].map((h, i) => (
                            <th
                              key={h}
                              className={`text-left px-3 py-2 text-[9px] font-600 ${i >= 2 ? 'text-right' : ''}`}
                              style={{ color: '#64748B', fontFamily: 'Outfit' }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ultimosPeriodos.map((f) => (
                          <tr key={f.id} className="border-t" style={{ borderColor: '#F1F5F9' }}>
                            <td className="px-3 py-2 text-[10px]" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                              {f.periodo}
                            </td>
                            <td className="px-3 py-2 text-[10px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                              {f.encargado ?? '—'}
                            </td>
                            <td
                              className="px-3 py-2 text-[10px] text-right font-600"
                              style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}
                            >
                              {pesos(f.ventas)}
                            </td>
                            <td
                              className="px-3 py-2 text-[10px] text-right"
                              style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}
                            >
                              {pesos(f.neto)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {f.delta !== null ? (
                                <span
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-500"
                                  style={{
                                    background: f.delta >= 0 ? '#F0FDF4' : '#FEF2F2',
                                    color: f.delta >= 0 ? '#047857' : '#B91C1C',
                                    fontFamily: 'JetBrains Mono',
                                  }}
                                >
                                  {f.delta >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                                  {f.delta >= 0 ? '+' : ''}
                                  {f.delta.toFixed(1)}%
                                </span>
                              ) : (
                                <span className="text-[10px]" style={{ color: '#CBD5E1' }}>
                                  —
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Variación del último período contra el anterior */}
              {totales.variacion !== null && (
                <section>
                  <Titulo>Comparativa con el período anterior</Titulo>
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md font-600"
                      style={{
                        background: totales.variacion >= 0 ? '#F0FDF4' : '#FEF2F2',
                        color: totales.variacion >= 0 ? '#047857' : '#B91C1C',
                        fontFamily: 'JetBrains Mono',
                      }}
                    >
                      {totales.variacion >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {totales.variacion >= 0 ? '+' : ''}
                      {totales.variacion.toFixed(1)}%
                    </span>
                    <span className="text-[10px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                      {totales.ultima?.nombre_mes} {totales.ultima?.anio} contra el período anterior
                    </span>
                  </div>
                </section>
              )}

              {sinVentas && (
                <p
                  className="text-[11px] px-3 py-2 rounded-lg"
                  style={{ background: '#FFFBEB', color: '#B45309', fontFamily: 'Inter' }}
                >
                  Este cliente no tiene ventas registradas en el período consultado.
                </p>
              )}
            </div>

            <div
              className="px-6 py-3 text-[9px] flex items-center justify-between"
              style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9', color: '#94A3B8', fontFamily: 'Inter' }}
            >
              <span>Global Pack · resumen de cliente</span>
              <span>{fecha}</span>
            </div>
          </div>
        </EstadoDatos>

        {/* Acciones */}
        <div className="mt-3">
          {errorImagen && (
            <p className="text-[11px] mb-2" style={{ color: '#FCD34D', fontFamily: 'Inter' }}>
              {errorImagen}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void descargar()}
              disabled={accionesDeshabilitadas}
              className="inline-flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg font-600 transition-all disabled:opacity-40"
              style={{ background: '#1D4ED8', color: '#fff', fontFamily: 'Outfit' }}
            >
              {generando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {generando ? 'Generando…' : 'Descargar PNG'}
            </button>
            {puedeCompartir && (
              <button
                onClick={() => void compartir()}
                disabled={accionesDeshabilitadas}
                className="inline-flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg font-600 border transition-all disabled:opacity-40"
                style={{ background: '#fff', borderColor: '#E2E8F0', color: '#334155', fontFamily: 'Outfit' }}
              >
                <Share2 size={14} /> Compartir
              </button>
            )}
            <button
              onClick={onCerrar}
              className="inline-flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg font-600"
              style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', fontFamily: 'Outfit' }}
            >
              <X size={14} /> Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h4
      className="text-[11px] font-600 mb-2"
      style={{ color: '#334155', fontFamily: 'Outfit' }}
    >
      {children}
    </h4>
  );
}
