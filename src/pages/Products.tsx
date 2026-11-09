import { useCallback, useMemo, useState } from 'react';
import { Search, ChevronRight, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useProductos, useJerarquiaComercial, armarJerarquia } from '../hooks/useProductos';
import { useFiltrosDisponibles, agruparOpciones, useCatalogosProducto } from '../hooks/useCatalogos';
import { FILTROS_VACIOS, useFiltros } from '../hooks/useFiltros';
import { fmtPesos, fmtNum } from '../lib/format';
import ChartTooltip from '../components/ui/ChartTooltip';
import { colorDe } from '../components/ui/chartColors';
import EstadoDatos from '../components/ui/EstadoDatos';
import type { Filtros as TipoFiltros } from '../types/database.types';

type ViewMode = 'list' | 'hierarchy';
type Orden = 'ventas' | 'unidades';

export default function Products() {
  const [filtros, setFiltros] = useState<TipoFiltros>(FILTROS_VACIOS);
  const { setFiltro, limpiar } = useFiltros(filtros, setFiltros);

  const [view, setView] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [orden, setOrden] = useState<Orden>('ventas');
  const [expandedUN, setExpandedUN] = useState<number[]>([]);
  const [expandedDiv, setExpandedDiv] = useState<number[]>([]);

  const { data: productos, isPending, error } = useProductos(filtros);
  const { data: jerarquia, isPending: cargandoArbol, error: errorArbol } =
    useJerarquiaComercial(filtros);
  const { data: opciones } = useFiltrosDisponibles();
  const { calibres, familias } = useCatalogosProducto();

  const catálogos = useMemo(
    () => (opciones ? agruparOpciones(opciones) : null),
    [opciones],
  );

  // Los filtros de esta página son propios, no los globales del Dashboard: acá se
  // filtra por marca/calibre/familia/texto, que son cosas de catálogo de
  // producto. `p_marca` sí es compartido con los filtros globales.
  const filtrados = useMemo(() => {
    let lista = productos ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.codigo_producto.toLowerCase().includes(q),
      );
    }
    if (filtros.p_marca) lista = lista.filter((p) => p.id_marca === filtros.p_marca);
    return lista;
  }, [productos, search, filtros.p_marca]);

  const ordenados = useMemo(() => {
    const campo = orden === 'ventas' ? 'ventas' : 'unidades';
    return [...filtrados].sort((a, b) => b[campo] - a[campo]);
  }, [filtrados, orden]);

  const topChart = useMemo(
    () =>
      ordenados.slice(0, 10).map((p) => ({
        name: p.nombre.split(' ').slice(0, 2).join(' '),
        ventas: p.ventas,
        cant: p.unidades,
      })),
    [ordenados],
  );

  const arbol = useMemo(() => armarJerarquia(jerarquia ?? []), [jerarquia]);

  const toggleUN = useCallback(
    (id: number) =>
      setExpandedUN((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  );
  const toggleDiv = useCallback(
    (id: number) =>
      setExpandedDiv((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  );

  const hayFiltrosLocales =
    Boolean(search) ||
    Boolean(filtros.p_marca) ||
    Boolean(filtros.p_calibre) ||
    Boolean(filtros.p_familia);

  return (
    <div className="p-5 space-y-4">
      {/* View toggle + filtros */}
      <div
        className="bg-white rounded-xl border p-4 flex flex-wrap items-end gap-3"
        style={{ borderColor: '#E2E8F0' }}
      >
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#F1F5F9' }}>
          {[
            { k: 'list' as const, l: 'Lista' },
            { k: 'hierarchy' as const, l: 'Jerarquía' },
          ].map((v) => (
            <button
              key={v.k}
              onClick={() => setView(v.k)}
              className="px-3 py-1.5 rounded-md text-xs font-500 transition-all"
              style={{
                background: view === v.k ? 'white' : 'transparent',
                color: view === v.k ? '#0F172A' : '#94A3B8',
                fontFamily: 'Inter',
                boxShadow: view === v.k ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {v.l}
            </button>
          ))}
        </div>

        {view === 'list' && (
          <>
            <div className="relative flex-1 min-w-44">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: '#94A3B8' }}
              />
              <input
                type="text"
                placeholder="Buscar producto o código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border outline-none"
                style={{ borderColor: '#E2E8F0', fontFamily: 'Inter', color: '#0F172A' }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#1D4ED8')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#E2E8F0')}
              />
            </div>

            {catálogos && (
              <>
                <SelectFiltro
                  etiqueta="MARCA"
                  valor={filtros.p_marca ?? ''}
                  cambiar={(v) => setFiltro('p_marca', v === '' ? null : Number(v))}
                  opciones={catálogos.marcas}
                />
                <SelectFiltro
                  etiqueta="CALIBRE"
                  valor={filtros.p_calibre ?? ''}
                  cambiar={(v) => setFiltro('p_calibre', v === '' ? null : Number(v))}
                  opciones={calibres.data ?? []}
                />
                <SelectFiltro
                  etiqueta="FAMILIA"
                  valor={filtros.p_familia ?? ''}
                  cambiar={(v) => setFiltro('p_familia', v === '' ? null : Number(v))}
                  opciones={familias.data ?? []}
                />
              </>
            )}

            <div>
              <label className="text-[10px] font-500 block mb-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                ORDENAR
              </label>
              <select
                value={orden}
                onChange={(e) => setOrden(e.target.value as Orden)}
                className="text-xs px-2.5 py-2 rounded-lg border outline-none bg-white"
                style={{ borderColor: '#E2E8F0', fontFamily: 'Inter', color: '#64748B' }}
              >
                <option value="ventas">Por importe</option>
                <option value="unidades">Por unidades</option>
              </select>
            </div>

            {hayFiltrosLocales && (
              <button
                onClick={() => {
                  setSearch('');
                  limpiar();
                }}
                className="text-xs px-2.5 py-2 rounded-lg font-500"
                style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}
              >
                Limpiar
              </button>
            )}
          </>
        )}
      </div>

      {view === 'list' && (
        <>
          {/* Ranking chart */}
          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
            <h3 className="font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Top 10 productos
            </h3>
            <EstadoDatos cargando={isPending} error={error} vacio={topChart.length === 0}>
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={topChart} margin={{ top: 0, right: 5, left: 0, bottom: 0 }}>
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
                    tickFormatter={(v) => `$${(v / 1_000_000).toFixed(0)}M`}
                    width={44}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="ventas" name="Ventas" radius={[4, 4, 0, 0]}>
                    {topChart.map((_, i) => (
                      <Cell key={i} fill={colorDe(i)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </EstadoDatos>
          </div>

          {/* Tabla */}
          <EstadoDatos
            cargando={isPending}
            error={error}
            vacio={ordenados.length === 0}
            mensajeVacio="No hay productos que coincidan con los filtros"
          >
            <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    {['#', 'Código', 'Producto', 'Marca', 'Calibre', 'Familia', 'Cant. vendida', 'Importe ventas', 'Bultos', 'HL'].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-3 text-[11px] font-600"
                        style={{ color: '#64748B', fontFamily: 'Outfit' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((p, idx) => (
                    <tr
                      key={p.id_producto}
                      className="border-t transition-colors"
                      style={{ borderColor: '#F8FAFC' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-3 py-3">
                        <span
                          className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-700"
                          style={{
                            background: idx < 3 ? `${colorDe(idx)}18` : '#F1F5F9',
                            color: idx < 3 ? colorDe(idx) : '#94A3B8',
                            fontFamily: 'Outfit',
                          }}
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[11px] font-500" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
                        {p.codigo_producto}
                      </td>
                      <td className="px-3 py-3 text-xs font-500 max-w-[200px]" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                        {p.nombre}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full font-500"
                          style={{
                            background: `${colorPorId(p.id_marca)}15`,
                            color: p.marca_nombre ? colorPorId(p.id_marca) : '#94A3B8',
                            fontFamily: 'Inter',
                          }}
                        >
                          {p.marca_nombre ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                        {p.calibre_nombre ?? '—'}
                      </td>
                      <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                        {p.familia_nombre}
                      </td>
                      <td className="px-3 py-3 text-[11px] font-500" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                        {fmtNum(p.unidades)}
                      </td>
                      <td className="px-3 py-3 text-[11px] font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                        {fmtPesos(p.ventas)}
                      </td>
                      <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                        {fmtNum(p.bultos)}
                      </td>
                      <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                        {fmtNum(p.hl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </EstadoDatos>
        </>
      )}

      {view === 'hierarchy' && (
        <EstadoDatos
          cargando={cargandoArbol}
          error={errorArbol}
          vacio={arbol.length === 0}
          mensajeVacio="No hay productos para mostrar en la jerarquía"
        >
          <div className="bg-white rounded-xl border" style={{ borderColor: '#E2E8F0' }}>
            <div className="px-5 py-4 border-b" style={{ borderColor: '#F1F5F9' }}>
              <h3 className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                Jerarquía comercial
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                Unidad de negocio → División → Familia → Producto
              </p>
            </div>

            {arbol.map((un, unIdx) => {
              const isUnOpen = expandedUN.includes(un.id);
              const color = colorDe(unIdx);
              return (
                <div key={un.id}>
                  {/* UN level */}
                  <button
                    onClick={() => toggleUN(un.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    style={{ background: `${color}08` }}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                    <span className="flex-1 text-sm font-600" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                      {un.nombre}
                    </span>
                    <span className="text-[11px] font-600" style={{ color, fontFamily: 'JetBrains Mono' }}>
                      {fmtPesos(un.ventas)}
                    </span>
                    <ChevronDown
                      size={14}
                      style={{
                        color: '#94A3B8',
                        transform: isUnOpen ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s',
                      }}
                    />
                  </button>

                  {isUnOpen &&
                    un.hijos.map((div) => {
                      const isDivOpen = expandedDiv.includes(div.id);
                      return (
                        <div key={div.id} style={{ borderTop: '1px solid #F8FAFC' }}>
                          {/* Division level */}
                          <button
                            onClick={() => toggleDiv(div.id)}
                            className="w-full flex items-center gap-3 px-6 py-2.5 text-left"
                            style={{ background: '#FAFBFF' }}
                          >
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#CBD5E1' }} />
                            <span className="flex-1 text-xs font-500" style={{ color: '#374151', fontFamily: 'Inter' }}>
                              {div.nombre}
                            </span>
                            <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
                              {fmtPesos(div.ventas)}
                            </span>
                            <ChevronRight
                              size={12}
                              style={{
                                color: '#CBD5E1',
                                transform: isDivOpen ? 'rotate(90deg)' : 'none',
                                transition: 'transform 0.15s',
                              }}
                            />
                          </button>

                          {isDivOpen &&
                            div.hijos.map((fam) => (
                              <div key={fam.id} style={{ borderTop: '1px solid #F8FAFC' }}>
                                {/* Family level */}
                                <div className="flex items-center gap-3 px-9 py-2 bg-white">
                                  <span className="text-[11px] font-500" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                                    {fam.nombre}
                                  </span>
                                  <span className="ml-auto text-[11px]" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
                                    {fmtPesos(fam.ventas)}
                                  </span>
                                </div>
                                {/* Product level */}
                                {fam.productos.map((prod) => (
                                  <div
                                    key={prod.id}
                                    className="flex items-center gap-3 px-12 py-2"
                                    style={{ background: '#FDFEFF', borderTop: '1px solid #F8FAFC' }}
                                  >
                                    <span className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: '#E2E8F0' }} />
                                    <span className="text-[11px] flex-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                                      {prod.nombre}
                                    </span>
                                    <span className="text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                                      {fmtNum(prod.unidades)} un.
                                    </span>
                                    <span className="text-[11px] font-500" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                                      {fmtPesos(prod.ventas)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ))}
                        </div>
                      );
                    })}
                </div>
              );
            })}
          </div>
        </EstadoDatos>
      )}
    </div>
  );
}

/** Select de filtro, con el estilo del resto de la app. */
function SelectFiltro({
  etiqueta,
  valor,
  cambiar,
  opciones,
}: {
  etiqueta: string
  valor: string | number
  cambiar: (v: string) => void
  opciones: { id: number | null; nombre: string }[]
}) {
  return (
    <div>
      <label className="text-[10px] font-500 block mb-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        {etiqueta}
      </label>
      <select
        value={String(valor)}
        onChange={(e) => cambiar(e.target.value)}
        className="text-xs px-2.5 py-2 rounded-lg border outline-none bg-white"
        style={{
          borderColor: valor !== '' ? '#1D4ED8' : '#E2E8F0',
          fontFamily: 'Inter',
          color: '#64748B',
          minWidth: 120,
        }}
      >
        <option value="">Todos</option>
        {opciones.map((o) => (
          <option key={o.id ?? o.nombre} value={o.id ?? ''}>
            {o.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Color estable por marca, derivado del id.
 *
 * La tabla `marcas` tiene sólo dos columnas: `id_marca` y `nombre`. El prototipo
 * traía el color en el dato (`marca.color`), así que hay que derivarlo.
 *
 * Se usa el id como semilla y no el nombre a propósito: si el nombre cambia, el
 * color se mantiene. Con el nombre, renombrar una marca le cambiaría el color y
 * el usuario la confundiría con otra.
 */
function colorPorId(id: number | null): string {
  if (id === null) return '#94A3B8';
  return colorDe(Math.abs(id) % 8);
}