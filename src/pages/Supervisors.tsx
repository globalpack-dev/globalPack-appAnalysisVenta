import { useState, useMemo } from 'react';
import {
  Search, Users, AlertTriangle, ArrowLeft, Check, ChevronRight,
} from 'lucide-react';
import {
  useSupervisoresCartera, useCarteraMarcas, useCarteraClientes,
} from '../hooks/useCartera';
import {
  GraficoDistribucion, GraficoPenetracion, GraficoBenchmark, GraficoLocalidad,
} from '../components/ui/GraficosCartera';
import EstadoDatos from '../components/ui/EstadoDatos';
import type { ClienteCartera } from '../hooks/useCartera';

/**
 * Supervisores.
 *
 * La navegación es por supervisor, no por encargado. El archivo del cliente
 * viene organizado por SDV (Supervisor de Venta) y el trabajo comercial es del
 * supervisor: "NACUL SOL, estos clientes no compraron alcohol".
 *
 * Seikai la opción de colgarlo de la ficha del encargado porque el 6% de los
 * clientes no tiene supervisor asignado y, antes de la carga, no existían en
 * `clientes` — no había por dónde entrar a ellos.
 *
 * ── Sobre el alcohol ────────────────────────────────────────────────────────
 *
 * De las 9 marcas del archivo, TRES no son alcohol: RED BULL, H2Oh y PEPSI
 * BLACK. Son bebidas. Por eso "oportunidad" no es "no compró ninguna de las
 * 9" sino "tiene el flag de alcohol y no compró ninguna de las 6 alcoholicás".
 *
 * Un cliente que sólo tomó H2Oh no compró una gota de alcohol: sigue siendo
 * oportunidad. Y hay 132 clientes que compraron cerveza con el flag en NO: el
 * flag del archivo no los refleja, así que el filtro tiene cuatro grupos y no
 * dos.
 *
 * La oportunidad la calcula el SERVIDOR (`fn_cartera_clientes.oportunidad`) y
 * esta pantalla no la recalcula. Una sola definición, en un solo lugar.
 */
export default function Supervisors() {
  const [seleccion, setSeleccion] = useState<{ nombre: string; id: number } | null>(null);

  if (seleccion) {
    return (
      <DetalleSupervisor
        nombre={seleccion.nombre}
        supervisorId={seleccion.id}
        onBack={() => setSeleccion(null)}
      />
    );
  }

  return <ListaSupervisores onElegir={setSeleccion} />;
}

/** Los cuatro grupos del filtro. Se excluyen entre sí y cubren a todos. */
type Grupo = 'todos' | 'oportunidad' | 'compro' | 'no_cliente';

const GRUPOS: Array<{ k: Grupo; etiqueta: string }> = [
  { k: 'todos', etiqueta: 'Todos' },
  { k: 'oportunidad', etiqueta: 'Sin compra de alcohol' },
  { k: 'compro', etiqueta: 'Ya compró alcohol' },
  { k: 'no_cliente', etiqueta: 'No compra alcohol' },
];

/**
 * A qué grupo pertenece un cliente.
 *
 * `oportunidad` viene del servidor. Los otros dos se derivan:
 * "ya compró alcohol" es comprar ≥1 marca alcohólica, y "no compra alcohol"
 * es no comprar ninguna. Un cliente con flag NO que compró cerveza entra en
 * "ya compró alcohol", no en "no compra alcohol": sí compra alcohol.
 */
function grupoDe(c: ClienteCartera): Grupo {
  if (c.oportunidad) return 'oportunidad';
  return c.compro_algo ? 'compro' : 'no_cliente';
}

// ─── Lista ───────────────────────────────────────────────────────────────────

function ListaSupervisores({
  onElegir,
}: {
  onElegir: (s: { nombre: string; id: number }) => void;
}) {
  const { data, isPending, error } = useSupervisoresCartera();

  const maxOportunidad = Math.max(1, ...(data ?? []).map((s) => s.oportunidad));

  return (
    <div className="p-5 space-y-4">
      <div>
        <h2 className="text-base font-600" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
          Supervisores
        </h2>
        <p className="text-xs mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          Clientes por supervisor y quién no tiene compra de alcohol en el período
        </p>
      </div>

      <EstadoDatos
        cargando={isPending}
        error={error}
        vacio={(data?.length ?? 0) === 0}
        mensajeVacio="Todavía no se cargó la cartera de supervisores"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(data ?? []).map((s) => (
            <button
              key={s.nombre}
              onClick={() =>
                onElegir({
                  nombre: s.nombre,
                  // El grupo sin supervisor viene con id NULL y se pide como 0,
                  // que es el centinela de las funciones del archivo 25.
                  // Pasar NULL acá devolvería la cartera entera.
                  id: s.id_supervisor ?? 0,
                })
              }
              className="bg-white rounded-xl border p-5 text-left transition-all hover:shadow-md"
              style={{ borderColor: '#E2E8F0' }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: s.oportunidad > 0 ? '#FEF2F2' : '#F0FDF4' }}>
                  {s.oportunidad > 0
                    ? <AlertTriangle size={16} style={{ color: '#D97706' }} />
                    : <Check size={16} style={{ color: '#059669' }} />}
                </div>
                <ChevronRight size={15} style={{ color: '#CBD5E1' }} />
              </div>

              <div className="font-display font-700 text-base mb-3" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                {s.nombre}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { l: 'Clientes', v: s.clientes },
                  { l: 'Alcohol', v: s.alcohol },
                  { l: 'Sin compra', v: s.oportunidad },
                ].map((x) => (
                  <div key={x.l}>
                    <div className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
                      {fmtEntero(x.v)}
                    </div>
                    <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>{x.l}</div>
                  </div>
                ))}
              </div>
              {/* La opportunity como barra: de un vistazo se ve dónde hay trabajo. */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F1F5F9' }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(s.oportunidad / maxOportunidad) * 100}%`,
                    background: s.oportunidad > 0 ? '#D97706' : '#059669',
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      </EstadoDatos>
    </div>
  );
}

// ─── Detalle ─────────────────────────────────────────────────────────────────

function DetalleSupervisor({
  nombre,
  supervisorId,
  onBack,
}: {
  nombre: string;
  supervisorId: number;
  onBack: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [grupo, setGrupo] = useState<Grupo>('todos');
  const [clienteAbierto, setClienteAbierto] = useState<ClienteCartera | null>(null);

  const { data: marcas, isPending: cMarcas, error: eMarcas } = useCarteraMarcas(supervisorId);
  const { data: clientes, isPending: cClientes, error: eClientes } = useCarteraClientes(supervisorId);
  // Para el gráfico de benchmark: los otros supervisores, para comparar.
  const { data: supervisores, isPending: cSupervisores, error: eSupervisores } =
    useSupervisoresCartera();

  /**
   * Los conteos de cada grupo.
   *
   * Se calculan acá con la lista que ya está descargada: ninguna llamada
   * extra. El conteo es lo que le dice al supervisor cuánto trabajo hay, así
   * que va al lado del botón y no escondido.
   */
  const conteos = useMemo(() => {
    const c: Record<Grupo, number> = { todos: 0, oportunidad: 0, compro: 0, no_cliente: 0 };
    for (const x of clientes ?? []) {
      c.todos += 1;
      c[grupoDe(x)] += 1;
    }
    return c;
  }, [clientes]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (clientes ?? []).filter((c) => {
      const coincideTexto =
        !q ||
        [c.razon_social, c.nombre_fantasia, c.codigo_cliente, c.localidad_nombre]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q));
      // El grupo lo decide el servidor (`oportunidad`) o la compra de alcohol.
      const coincideEstado = grupo === 'todos' || grupoDe(c) === grupo;
      return coincideTexto && coincideEstado;
    });
  }, [clientes, busqueda, grupo]);

  return (
    <div className="p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs flex-shrink-0"
          style={{ color: '#64748B', fontFamily: 'Inter' }}
        >
          <ArrowLeft size={14} /> Volver
        </button>
        <div>
          <h2 className="text-base font-600" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            {nombre}
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            {(clientes?.length ?? 0).toLocaleString('es-AR')} clientes ·{' '}
            <span style={{ color: conteos.oportunidad > 0 ? '#D97706' : '#059669', fontWeight: 500 }}>
              {conteos.oportunidad.toLocaleString('es-AR')} sin compra de alcohol
            </span>
          </p>
        </div>
      </div>

      {/* Gráficos: dos filas de dos. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* A: distribución de línea */}
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Distribución de línea
          </h3>
          <p className="text-[11px] mb-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Cuántas marcas de alcohol compró cada cliente
          </p>
          <GraficoDistribucion clientes={clientes ?? []} />
        </div>

        {/* B: penetración por marca */}
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Penetración por marca
          </h3>
          <p className="text-[11px] mb-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Porcentaje de clientes de alcohol que compraron cada marca
          </p>
          <EstadoDatos cargando={cMarcas} error={eMarcas} vacio={(marcas?.length ?? 0) === 0}>
            <GraficoPenetracion marcas={marcas ?? []} />
            <p className="text-[10px] mt-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              En gris las tres marcas que no son alcohol: RED BULL, H2Oh y PEPSI BLACK. Son
              bebidas y no se ofrecen como alcohol.
            </p>
          </EstadoDatos>
        </div>

        {/* C: benchmark */}
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Comparación entre supervisores
          </h3>
          <p className="text-[11px] mb-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Penetración de alcohol de cada uno, sobre su propio público
          </p>
          <EstadoDatos
            cargando={cSupervisores}
            error={eSupervisores}
            vacio={(supervisores?.length ?? 0) === 0}
          >
            <GraficoBenchmark supervisores={supervisores ?? []} actual={supervisorId} />
          </EstadoDatos>
        </div>

        {/* D: oportunidad por localidad */}
        <div className="bg-white rounded-xl border p-5" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-600 text-sm mb-1" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Sin compra por localidad
          </h3>
          <p className="text-[11px] mb-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Dónde está concentrado el trabajo pendiente
          </p>
          <GraficoLocalidad clientes={clientes ?? []} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Clientes */}
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          <div className="px-5 py-4 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: '#F1F5F9' }}>
            <div className="relative flex-1 min-w-48">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }} />
              <input
                type="text"
                placeholder="Buscar cliente por nombre o código..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border outline-none"
                style={{
                  borderColor: busqueda ? '#1D4ED8' : '#E2E8F0',
                  fontFamily: 'Inter',
                  color: '#0F172A',
                }}
              />
            </div>
            <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
              {filtrados.length.toLocaleString('es-AR')}
            </span>
          </div>

          {/* El filtro de los cuatro grupos. */}
          <div className="px-5 py-2.5 border-b flex items-center gap-1 flex-wrap" style={{ borderColor: '#F1F5F9' }}>
            {GRUPOS.map((g) => {
              const activo = grupo === g.k;
              const n = conteos[g.k];
              // El ámbar sólo para el grupo de trabajo: "sin compra" es el que
              // genera la lista para salir a vender, los otros son contexto.
              const esTrabajo = g.k === 'oportunidad';
              return (
                <button
                  key={g.k}
                  onClick={() => setGrupo(g.k)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg font-500 transition-colors"
                  style={{
                    background: activo
                      ? (esTrabajo ? '#FFFBEB' : '#EFF6FF')
                      : 'transparent',
                    color: activo
                      ? (esTrabajo ? '#D97706' : '#1D4ED8')
                      : '#64748B',
                    border: `1px solid ${activo ? (esTrabajo ? '#FDE68A' : '#BFDBFE') : 'transparent'}`,
                    fontFamily: 'Inter',
                  }}
                >
                  {g.etiqueta}
                  <span style={{ fontFamily: 'JetBrains Mono', opacity: 0.65 }}>
                    {' '}{n.toLocaleString('es-AR')}
                  </span>
                </button>
              );
            })}
          </div>

          <EstadoDatos
            cargando={cClientes}
            error={eClientes}
            vacio={filtrados.length === 0}
            mensajeVacio={
              grupo === 'oportunidad'
                ? 'Ningún cliente de alcohol sin compra pendiente'
                : 'Ningún cliente coincide con la búsqueda'
            }
          >
            <table className="w-full">
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Cliente', 'Localidad', 'Alcohol', 'Compras de alcohol', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[11px] font-600"
                      style={{ color: '#64748B', fontFamily: 'Outfit' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0, 200).map((c) => {
                  // La oportunidad la calcula el servidor. Acá no se recalcula.
                  const oportunidad = c.oportunidad;
                  return (
                    <tr
                      key={c.codigo_cliente}
                      className="border-t cursor-pointer transition-colors"
                      style={{ borderColor: '#F8FAFC' }}
                      onClick={() => setClienteAbierto(c)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {oportunidad && (
                            <AlertTriangle size={12} style={{ color: '#D97706', flexShrink: 0 }} />
                          )}
                          <div>
                            <div className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                              {c.nombre_fantasia || c.razon_social}
                            </div>
                            {c.nombre_fantasia && (
                              <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                                {c.razon_social}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                        {c.localidad_nombre ?? '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-500"
                          style={{
                            background: c.es_alcohol ? '#FEF3C7' : '#F1F5F9',
                            color: c.es_alcohol ? '#92400E' : '#94A3B8',
                            fontFamily: 'Inter',
                          }}>
                          {c.es_alcohol ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[11px]" style={{ fontFamily: 'Inter' }}>
                        {c.compradas_alcohol === 0 ? (
                          c.es_alcohol ? (
                            <span style={{ color: '#B45309', fontWeight: 500 }}>Sin compra</span>
                          ) : (
                            <span style={{ color: '#94A3B8' }}>—</span>
                          )
                        ) : (
                          <div className="max-w-xs">
                            <div style={{ color: '#0F172A' }}>
                              Compró: {c.compras.join(' · ')}
                            </div>
                            {c.faltantes.length > 0 && (
                              <div className="text-[10px] mt-0.5" style={{ color: '#94A3B8' }}>
                                Falta: {c.faltantes.join(' · ')}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <ChevronRight size={13} style={{ color: '#CBD5E1' }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtrados.length > 200 && (
              <div className="px-4 py-3 text-[11px] text-center" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                Mostrando los primeros 200 de {filtrados.length.toLocaleString('es-AR')}. Usá el buscador.
              </div>
            )}
          </EstadoDatos>
        </div>
      </div>

      {clienteAbierto && (
        <FichaCliente
          cliente={clienteAbierto}
          onCerrar={() => setClienteAbierto(null)}
        />
      )}
    </div>
  );
}

// ─── Ficha del cliente ───────────────────────────────────────────────────────

/**
 * Ficha con la matriz de marcas.
 *
 * Es un modal y no la ficha de Clientes porque esa está indexada por
 * `id_cliente` y acá se llega por `codigo_cliente`: son claves distintas. Una
 * unificarlas sería un refactor de navegación que no vale la pena para esto.
 */
function FichaCliente({
  cliente,
  onCerrar,
}: {
  cliente: ClienteCartera;
  onCerrar: () => void;
}) {
  // Alerta sólo si es de alcohol y no compró NINGUNA marca alcohólica. Un
  // comprador parcial ya no es oportunidad: se le muestra lo que compró y, en
  // gris, lo que falta. Lo calcula el servidor.
  const oportunidad = cliente.oportunidad;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(10,22,40,0.5)' }}
      onClick={onCerrar}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b flex items-start justify-between" style={{ borderColor: '#F1F5F9' }}>
          <div>
            <div className="font-600 text-base" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              {cliente.nombre_fantasia || cliente.razon_social}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {cliente.razon_social} · {cliente.codigo_cliente}
              {cliente.localidad_nombre && ` · ${cliente.localidad_nombre}`}
            </div>
          </div>
          <button onClick={onCerrar} className="text-sm" style={{ color: '#94A3B8' }} aria-label="Cerrar">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {oportunidad && (
            <div className="rounded-xl border p-4" style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}>
              <div className="flex items-start gap-2.5">
                <AlertTriangle size={16} style={{ color: '#D97706', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div className="text-xs font-600" style={{ color: '#92400E', fontFamily: 'Inter' }}>
                    Es cliente de alcohol y no tiene compra
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: '#D97706', fontFamily: 'Inter' }}>
                    Todavía no compró ninguna marca de alcohol. Se le puede ofertar:{' '}
                    <strong>{cliente.faltantes.join(', ')}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!oportunidad && cliente.compro_algo && (
            <div className="rounded-xl border p-4" style={{ borderColor: '#BBF7D0', background: '#F0FDF4' }}>
              <div className="flex items-start gap-2.5">
                <Check size={16} style={{ color: '#059669', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div className="text-xs font-600" style={{ color: '#065F46', fontFamily: 'Inter' }}>
                    {cliente.es_alcohol ? 'Es cliente de alcohol y ya compra' : 'Compra alcohol'}
                  </div>
                  <div className="text-[11px] mt-1" style={{ color: '#047857', fontFamily: 'Inter' }}>
                    Compró {fmtEntero(cliente.compradas_alcohol)} de las 6 marcas de alcohol
                    {!cliente.es_alcohol && ' (el flag del archivo dice que no, pero compró)'}.
                  </div>
                </div>
              </div>
            </div>
          )}

          {!oportunidad && !cliente.compro_algo && (
            <div className="rounded-xl border p-4" style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}>
              <div className="flex items-center gap-2.5">
                <Users size={16} style={{ color: '#94A3B8' }} />
                <div className="text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                  No está marcado como cliente de alcohol en la cartera.
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] font-600 mb-2" style={{ color: '#94A3B8', fontFamily: 'Inter', letterSpacing: '0.06em' }}>
              QUÉ COMPRÓ
            </div>
            {cliente.compras.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {cliente.compras.map((m) => (
                  <span
                    key={m}
                    className="text-[10px] px-2 py-1 rounded-md font-500"
                    style={{ background: '#EFF6FF', color: '#1D4ED8', fontFamily: 'Inter' }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                No registró compras de ninguna de las 9 marcas en el período.
              </p>
            )}
          </div>

          {cliente.compradas_alcohol > 0 && cliente.faltantes.length > 0 && (
            <div>
              <div className="text-[10px] font-600 mb-2" style={{ color: '#94A3B8', fontFamily: 'Inter', letterSpacing: '0.06em' }}>
                PARA OFRECER — LO QUE NO COMPRÓ
              </div>
              <p className="text-xs" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                {cliente.faltantes.join(' · ')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function fmtEntero(n: number): string {
  return Math.round(n).toLocaleString('es-AR');
}