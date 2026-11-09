import { useMemo, useState } from 'react';
import { Search, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useVentas, LIMITE_PAGINA } from '../hooks/useVentas';
import { useFiltrosDisponibles, agruparOpciones, useCategorias, categoriasParaFiltro } from '../hooks/useCatalogos';
import { FILTROS_VACIOS } from '../hooks/useFiltros';
import { fmtPesos, fmtNum } from '../lib/format';
import StatusBadge from '../components/ui/StatusBadge';
import EstadoDatos from '../components/ui/EstadoDatos';
import type { FilaVentaDetalle, Filtros as TipoFiltros } from '../types/database.types';

/**
 * Detalle transaccional de ventas.
 *
 * La tabla `ventas` es normalizada: guarda sólo FKs. Todos los nombres que esta
 * pantalla muestra salen de `v_ventas_detalle`, que los resuelve por joins.
 *
 * Con 8.705 registros la paginación va a la base (`fn_ventas_pagina`), no al
 * navegador. El filtro y el orden de la página actual sí se aplican en memoria,
 * que sobre 50 filas es instantáneo y evita una consulta por cada tecla.
 */

type Orden = 'periodo' | 'cliente' | 'sucursal' | 'encargado' | 'producto' | 'marca' | 'familia' | 'importeNeto' | 'importeBruto' | 'importeFinal' | 'bultos' | 'hl';

export default function Sales() {
  const [filtros, setFiltros] = useState<TipoFiltros>(FILTROS_VACIOS);
  const [pagina, setPagina] = useState(1);
  const [search, setSearch] = useState('');
  const [orden, setOrden] = useState<Orden>('periodo');
  const [descendente, setDescendente] = useState(true);
  const [seleccionada, setSeleccionada] = useState<FilaVentaDetalle | null>(null);

  const { data: resultado, isPending, error, isFetching } = useVentas(filtros, pagina);
  const { data: opciones } = useFiltrosDisponibles();
  const { data: categorias } = useCategorias();

  const catálogos = useMemo(() => (opciones ? agruparOpciones(opciones) : null), [opciones]);

  const filas = useMemo(() => resultado?.filas ?? [], [resultado]);
  const total = resultado?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE_PAGINA));

  // Búsqueda por texto sobre la página actual.
  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((v) =>
      [v.cliente_nombre, v.producto_nombre, v.marca_nombre, v.sucursal_nombre, v.codigo_cliente]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [filas, search]);

  const ordenados = useMemo(() => {
    const copia = [...visibles];
    const valor = (v: FilaVentaDetalle): number | string => {
      switch (orden) {
        case 'periodo': return v.anio * 100 + v.mes;
        case 'cliente': return v.cliente_nombre;
        case 'sucursal': return v.sucursal_nombre;
        case 'encargado': return v.encargado_nombre;
        case 'producto': return v.producto_nombre;
        case 'marca': return v.marca_nombre ?? '';
        case 'familia': return v.familia_nombre;
        case 'importeNeto': return Number(v.importe_neto);
        case 'importeBruto': return Number(v.importe_bruto);
        case 'importeFinal': return Number(v.importe_final);
        case 'bultos': return Number(v.cantidad_bultos);
        case 'hl': return Number(v.cantidad_hl);
      }
    };
    return copia.sort((a, b) => {
      const av = valor(a);
      const bv = valor(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return descendente ? bv - av : av - bv;
      }
      const cmp = String(av).localeCompare(String(bv));
      return descendente ? -cmp : cmp;
    });
  }, [visibles, orden, descendente]);

  const resumen = useMemo(() => {
    const base = search.trim() ? ordenados : filas;
    return base.reduce(
      (s, v) => ({
        neto: s.neto + Number(v.importe_neto),
        final: s.final + Number(v.importe_final),
        bultos: s.bultos + Number(v.cantidad_bultos),
        hl: s.hl + Number(v.cantidad_hl),
      }),
      { neto: 0, final: 0, bultos: 0, hl: 0 },
    );
  }, [filas, ordenados, search]);

  function alternarOrden(col: Orden) {
    if (orden === col) setDescendente((d) => !d);
    else {
      setOrden(col);
      setDescendente(true);
    }
  }

  /** Cambiar un filtro reinicia la página: si no, se puede caer en una página vacía. */
  function cambiarFiltro(clave: keyof TipoFiltros, valor: number | string | null) {
    setFiltros((f) => ({ ...f, [clave]: valor }));
    setPagina(1);
  }

  const hayFiltros =
    Boolean(search) ||
    Object.entries(filtros).some(([, v]) => v !== null && v !== undefined);

  return (
    <div className="p-5 space-y-4">
      {/* Filtros */}
      <div
        className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end"
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
            placeholder="Buscar cliente, producto, marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border outline-none"
            style={{ borderColor: search ? '#1D4ED8' : '#E2E8F0', fontFamily: 'Inter', color: '#0F172A' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#1D4ED8')}
            onBlur={(e) => (e.currentTarget.style.borderColor = search ? '#1D4ED8' : '#E2E8F0')}
          />
        </div>

        {catálogos && (
          <>
            <SelectFiltro
              etiqueta="PERÍODO"
              valor={filtros.p_anio ?? ''}
              cambiar={(v) => cambiarFiltro('p_anio', v === '' ? null : Number(v))}
              opciones={catálogos.anios.map((a) => ({ id: a, nombre: String(a) }))}
              vacio="Todos"
            />
            <SelectFiltro
              etiqueta="MARCA"
              valor={filtros.p_marca ?? ''}
              cambiar={(v) => cambiarFiltro('p_marca', v === '' ? null : Number(v))}
              opciones={catálogos.marcas}
              vacio="Todas"
            />
            <SelectFiltro
              etiqueta="PROMOTOR"
              valor={filtros.p_encargado ?? ''}
              cambiar={(v) => cambiarFiltro('p_encargado', v === '' ? null : Number(v))}
              opciones={catálogos.encargados}
              vacio="Todos"
            />
            <SelectFiltro
              etiqueta="CANAL"
              valor={filtros.p_canal ?? ''}
              cambiar={(v) => cambiarFiltro('p_canal', v === '' ? null : String(v))}
              opciones={catálogos.canales.map((c) => ({ id: null, nombre: c }))}
              vacio="Todos"
            />
            <SelectFiltro
              etiqueta="CATEGORÍA"
              valor={filtros.p_categoria ?? ''}
              cambiar={(v) => cambiarFiltro('p_categoria', v === '' ? null : String(v))}
              opciones={categoriasParaFiltro(categorias)}
              vacio="Todas"
            />
          </>
        )}

        {hayFiltros && (
          <button
            onClick={() => {
              setSearch('');
              setFiltros({ ...FILTROS_VACIOS });
              setPagina(1);
            }}
            className="text-xs px-2.5 py-2 rounded-lg font-500"
            style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: search ? 'Registros filtrados' : 'Registros', value: (search ? ordenados.length : filas.length).toString() },
          { label: 'Importe Neto', value: fmtPesos(resumen.neto) },
          { label: 'Importe Final', value: fmtPesos(resumen.final) },
          { label: 'Bultos / HL', value: `${fmtNum(Math.round(resumen.bultos))} / ${fmtNum(Math.round(resumen.hl))}` },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white rounded-xl px-4 py-3 border flex items-center justify-between"
            style={{ borderColor: '#E2E8F0' }}
          >
            <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {s.label}
            </span>
            <span className="font-display font-700 text-base" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <EstadoDatos
        cargando={isPending}
        error={error}
        vacio={ordenados.length === 0}
        mensajeVacio="No hay ventas para los filtros seleccionados"
      >
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                  <ColHeader etiqueta="Período" col="periodo" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Cliente" col="cliente" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Sucursal" col="sucursal" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Promotor" col="encargado" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Producto" col="producto" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Marca" col="marca" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Familia" col="familia" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Imp. Neto" col="importeNeto" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Imp. Bruto" col="importeBruto" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Imp. Final" col="importeFinal" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="Bultos" col="bultos" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <ColHeader etiqueta="HL" col="hl" orden={orden} desc={descendente} alOrdenar={alternarOrden} />
                  <th className="px-3 py-3 text-[11px] font-600" style={{ color: '#64748B', fontFamily: 'Outfit' }} />
                </tr>
              </thead>
              <tbody>
                {ordenados.map((v) => (
                  <tr
                    key={v.id_venta}
                    className="border-t transition-colors cursor-pointer"
                    style={{ borderColor: '#F8FAFC' }}
                    onClick={() => setSeleccionada(v)}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap' }}>
                      {v.periodo_label}
                    </td>
                    <td className="px-3 py-3 text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                      {v.cliente_nombre}
                    </td>
                    <td className="px-3 py-3 text-xs" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                      {v.sucursal_nombre}
                    </td>
                    <td className="px-3 py-3 text-xs" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                      {v.encargado_nombre}
                    </td>
                    <td className="px-3 py-3 text-xs max-w-[180px] truncate" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                      {v.producto_nombre}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="text-[11px] px-2 py-0.5 rounded-full font-500"
                        style={{ background: '#F1F5F9', color: '#374151', fontFamily: 'Inter' }}
                      >
                        {v.marca_nombre ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                      {v.familia_nombre}
                    </td>
                    <td className="px-3 py-3 text-[11px] font-500" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap' }}>
                      {fmtPesos(Number(v.importe_neto))}
                    </td>
                    <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap' }}>
                      {fmtPesos(Number(v.importe_bruto))}
                    </td>
                    <td className="px-3 py-3 text-[11px] font-600" style={{ color: '#059669', fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap' }}>
                      {fmtPesos(Number(v.importe_final))}
                    </td>
                    <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {fmtNum(Number(v.cantidad_bultos))}
                    </td>
                    <td className="px-3 py-3 text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                      {fmtNum(Number(v.cantidad_hl))}
                    </td>
                    <td className="px-3 py-3">
                      {v.canal_ajustado ? (
                        <StatusBadge label={v.canal_ajustado} {...colorDeCanal(v.canal_ajustado)} tamano="sm" />
                      ) : (
                        <span className="text-[10px]" style={{ color: '#CBD5E1', fontFamily: 'Inter' }}>
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div
            className="px-4 py-3 border-t flex items-center justify-between"
            style={{ borderColor: '#F1F5F9', background: '#FAFBFF' }}
          >
            <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {search
                ? `${ordenados.length} de ${filas.length} en esta página`
                : `Mostrando ${filas.length} de ${total} ventas`}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina === 1 || isFetching}
                className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-40"
                style={{ background: '#F1F5F9', color: '#64748B' }}
                title="Página anterior"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-[11px] px-1.5" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                {pagina} / {totalPaginas}
              </span>
              <button
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas || isFetching}
                className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-40"
                style={{ background: '#F1F5F9', color: '#64748B' }}
                title="Página siguiente"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </EstadoDatos>

      {seleccionada && (
        <DetalleVenta venta={seleccionada} onCerrar={() => setSeleccionada(null)} />
      )}
    </div>
  );
}

// ─── Modal de detalle ─────────────────────────────────────────────────────────

/**
 * Detalle de una venta.
 *
 * Los cinco bloques del prototipo se mantienen, pero ahora muestran datos reales
 * y un par de campos que antes no existían: el código del cliente y el
 * supervisor del encargado.
 */
function DetalleVenta({
  venta,
  onCerrar,
}: {
  venta: FilaVentaDetalle
  onCerrar: () => void
}) {
  const secciones = [
    {
      titulo: 'Comercial',
      campos: [
        { l: 'Código cliente', v: venta.codigo_cliente, mono: true },
        { l: 'Cliente', v: venta.cliente_nombre },
        { l: 'Sucursal', v: venta.sucursal_nombre },
        { l: 'Promotor', v: `Promotor ${venta.codigo_sector_venta}` },
        { l: 'Encargado', v: venta.encargado_nombre },
        { l: 'Supervisor', v: venta.supervisor_nombre ?? 'Sin supervisor' },
      ],
    },
    {
      titulo: 'Producto',
      campos: [
        { l: 'Código', v: venta.codigo_producto, mono: true },
        { l: 'Producto', v: venta.producto_nombre },
        { l: 'Marca', v: venta.marca_nombre ?? '—' },
        { l: 'Familia', v: venta.familia_nombre },
        { l: 'División', v: venta.division_nombre },
        { l: 'Unidad de negocio', v: venta.unidad_negocio_nombre },
        { l: 'Calibre', v: venta.calibre_nombre ?? '—' },
      ],
    },
    {
      titulo: 'Importes',
      campos: [
        { l: 'Importe Neto', v: fmtPesos(Number(venta.importe_neto)) },
        { l: 'Importe Bruto', v: fmtPesos(Number(venta.importe_bruto)) },
        { l: 'Importe Final', v: fmtPesos(Number(venta.importe_final)) },
      ],
    },
    {
      titulo: 'Cantidades',
      campos: [
        { l: 'Bultos', v: fmtNum(Number(venta.cantidad_bultos)) },
        { l: 'Hectolitros', v: fmtNum(Number(venta.cantidad_hl)) },
      ],
    },
    {
      titulo: 'Marketing',
      campos: [
        { l: 'Canal ajustado', v: venta.canal_ajustado ?? '—' },
        { l: 'Segmento', v: venta.segmento_mkt ?? '—' },
        { l: 'Canal', v: venta.canal_mkt ?? '—' },
        { l: 'Subcanal', v: venta.subcanal_mkt ?? '—' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(10,22,40,0.6)' }}
      onClick={onCerrar}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between px-6 py-5 border-b sticky top-0 bg-white"
          style={{ borderColor: '#F1F5F9' }}
        >
          <div>
            <h3 className="font-display font-700 text-base" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Detalle de Venta
            </h3>
            <p className="text-xs mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {venta.periodo_label} · {venta.cliente_nombre}
            </p>
          </div>
          <button onClick={onCerrar} style={{ color: '#94A3B8' }} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {secciones.map((s) => (
            <div key={s.titulo}>
              <h4
                className="text-[11px] font-600 mb-2 pb-1 border-b"
                style={{ color: '#94A3B8', fontFamily: 'Outfit', borderColor: '#F1F5F9', letterSpacing: '0.06em' }}
              >
                {s.titulo.toUpperCase()}
              </h4>
              <div className="grid grid-cols-3 gap-3">
                {s.campos.map((c) => (
                  <div
                    key={c.l}
                    className="rounded-lg p-3"
                    style={{ background: '#F8FAFC', border: '1px solid #F1F5F9' }}
                  >
                    <div className="text-[10px] mb-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                      {c.l}
                    </div>
                    <div
                      className="text-xs font-500"
                      style={{ color: '#0F172A', fontFamily: c.mono ? 'JetBrains Mono' : 'Inter' }}
                    >
                      {c.v}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Piezas auxiliares ────────────────────────────────────────────────────────

function ColHeader({
  etiqueta,
  col,
  orden,
  desc,
  alOrdenar,
}: {
  etiqueta: string;
  col: Orden;
  orden: Orden;
  desc: boolean;
  alOrdenar: (c: Orden) => void;
}) {
  const activo = orden === col;
  return (
    <th
      className="text-left px-3 py-3 text-[11px] font-600 cursor-pointer select-none whitespace-none"
      style={{ color: '#64748B', fontFamily: 'Outfit' }}
      onClick={() => alOrdenar(col)}
    >
      <span className="flex items-center gap-1">
        {etiqueta}
        {activo ? (
          desc ? <ChevronUp size={10} /> : <ChevronDown size={10} />
        ) : (
          <ChevronDown size={10} style={{ opacity: 0.3 }} />
        )}
      </span>
    </th>
  );
}

function SelectFiltro({
  etiqueta,
  valor,
  cambiar,
  opciones,
  vacio,
}: {
  etiqueta: string;
  valor: number | string;
  cambiar: (v: string) => void;
  opciones: { id: number | null; nombre: string }[];
  vacio: string;
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
          minWidth: 130,
        }}
      >
        <option value="">{vacio}</option>
        {opciones.map((o) => (
          <option key={`${o.id ?? ''}-${o.nombre}`} value={o.id ?? o.nombre}>
            {o.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Color del chip de canal.
 *
 * Los canales reales son REF / K+T / AS, no On-Trade / Off-Trade / Institucional
 * como en el prototipo. Un mapa por nombre no sirve: se usa un hash del texto
 * para que sea estable entre recargas sin tener que mantener una lista.
 */
function colorDeCanal(canal: string): { bg: string; color: string } {
  let hash = 0;
  for (let i = 0; i < canal.length; i++) hash = (hash * 31 + canal.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % 4;
  return [
    { bg: '#EFF6FF', color: '#1D4ED8' },
    { bg: '#F0FDF4', color: '#059669' },
    { bg: '#FDF4FF', color: '#7C3AED' },
    { bg: '#FFFBEB', color: '#D97706' },
  ][idx];
}