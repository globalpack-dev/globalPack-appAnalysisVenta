import { useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, Search } from 'lucide-react';
import { useActividadPromotor, type FilaActividad } from '../../hooks/useCartera';
import {
  DIAS,
  NOMBRE_DIA,
  diaDeHoy,
  estadoDe,
  filtrarActividad,
  tareasDe,
  ESTADOS_ACTIVIDAD,
  TAREAS_ACTIVIDAD,
  type EstadoActividad,
  type TareaActividad,
} from '../../lib/visitas';
import EstadoDatos from './EstadoDatos';

/**
 * "Ver actividad" de un promotor.
 *
 * La pregunta que responde no es "cuánto vendió", sino "qué hago con estos
 * clientes": cuándo visitarlos, quiénes ya compraron, qué marcas les faltan y
 * qué tareas quedaron pendientes.
 *
 * Los datos salen de `fn_actividad_promotor`, que mezcla la cartera con la capa
 * operativa del archivo de promotores (`clientes_operativa`).
 *
 * ── Qué significa cada estado ───────────────────────────────────────────────
 *
 *   Oportunidad  → es cliente de alcohol (FLAG del archivo) y no compró ninguna
 *                  de las 6 marcas alcohólicas. Es a quien hay que ofrecerle.
 *   Compró       → compró al menos una marca alcohólica.
 *   Sin marcas   → no compró ninguna de las 9 marcas del archivo (alcohol o
 *                  bebidas). Puede no ser cliente de alcohol.
 */

export default function ActividadPromotor({
  encargadoId,
  nombre,
}: {
  encargadoId: number;
  nombre: string;
}) {
  const { data, isPending, error } = useActividadPromotor(encargadoId);

  const [dia, setDia] = useState<string>(() => diaDeHoy() ?? '');
  const [estado, setEstado] = useState<EstadoActividad>('todos');
  const [tarea, setTarea] = useState<TareaActividad>('todas');
  const [busqueda, setBusqueda] = useState('');

  const filas = data ?? [];
  const hoy = diaDeHoy();

  const filtradas = useMemo(
    () => filtrarActividad(filas, { dia, estado, tarea, busqueda }),
    [filas, dia, estado, tarea, busqueda],
  );

  const oportunidad = filas.filter((f) => f.oportunidad).length;
  const conTarea = filas.filter((f) => tareasDe(f).length > 0).length;
  const paraHoy = hoy ? filas.filter((f) => f.visitas.includes(hoy)).length : 0;

  return (
    <div className="space-y-4">
      {/* KPIs de la actividad */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Clientes del promotor', value: filas.length, color: '#0F172A' },
          { label: `Visitar hoy${hoy ? ` (${NOMBRE_DIA[hoy]})` : ''}`, value: paraHoy, color: '#1D4ED8' },
          { label: 'Sin compra de alcohol', value: oportunidad, color: '#B45309' },
          { label: 'Con tarea pendiente', value: conTarea, color: '#7C3AED' },
        ].map((k) => (
          <div
            key={k.label}
            className="bg-white rounded-xl p-4 border"
            style={{ borderColor: '#E2E8F0' }}
          >
            <div
              className="font-display font-700 text-xl"
              style={{ color: k.color, fontFamily: 'Outfit' }}
            >
              {k.value}
            </div>
            <div className="text-[11px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {k.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#E2E8F0' }}>
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="DÍA DE VISITA">
            <select
              value={dia}
              onChange={(e) => setDia(e.target.value)}
              className="text-xs rounded-lg border px-2.5 py-1.5 outline-none"
              style={{ borderColor: '#E2E8F0', color: '#0F172A', fontFamily: 'Inter', background: '#fff' }}
            >
              <option value="">Todos los días</option>
              {DIAS.map((d) => (
                <option key={d} value={d}>
                  {NOMBRE_DIA[d]}
                  {hoy === d ? ' · hoy' : ''}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="ESTADO">
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoActividad)}
              className="text-xs rounded-lg border px-2.5 py-1.5 outline-none"
              style={{ borderColor: '#E2E8F0', color: '#0F172A', fontFamily: 'Inter', background: '#fff' }}
            >
              {ESTADOS_ACTIVIDAD.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="TAREA">
            <select
              value={tarea}
              onChange={(e) => setTarea(e.target.value as TareaActividad)}
              className="text-xs rounded-lg border px-2.5 py-1.5 outline-none"
              style={{ borderColor: '#E2E8F0', color: '#0F172A', fontFamily: 'Inter', background: '#fff' }}
            >
              {TAREAS_ACTIVIDAD.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="BUSCAR CLIENTE" crecer>
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2"
                style={{ color: '#94A3B8' }}
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Código, razón social o localidad"
                className="w-full text-xs rounded-lg border pl-7 pr-2.5 py-1.5 outline-none"
                style={{ borderColor: '#E2E8F0', color: '#0F172A', fontFamily: 'Inter' }}
              />
            </div>
          </Campo>

          {(dia || estado !== 'todos' || tarea !== 'todas' || busqueda) && (
            <button
              onClick={() => {
                setDia('');
                setEstado('todos');
                setTarea('todas');
                setBusqueda('');
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border"
              style={{ borderColor: '#E2E8F0', color: '#64748B', fontFamily: 'Inter' }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="text-[11px] mt-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          {filtradas.length} de {filas.length} clientes
          {dia ? ` · visita ${NOMBRE_DIA[dia]}` : ''}
          {estado !== 'todos' ? ` · ${ESTADOS_ACTIVIDAD.find((e) => e.id === estado)?.nombre}` : ''}
          {tarea !== 'todas' ? ` · ${TAREAS_ACTIVIDAD.find((t) => t.id === tarea)?.nombre}` : ''}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
        <EstadoDatos
          cargando={isPending}
          error={error}
          vacio={filtradas.length === 0}
          mensajeVacio={`No hay clientes de ${nombre} para estos filtros`}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr style={{ background: '#F8FAFC' }}>
                  {['Cliente', 'Visita', 'Segmento', 'Estado', 'Compró', 'Falta ofrecer', 'Tareas'].map((h) => (
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
                {filtradas.map((f) => (
                  <Fila key={f.codigo_cliente} fila={f} />
                ))}
              </tbody>
            </table>
          </div>
        </EstadoDatos>
      </div>
    </div>
  );
}

function Fila({ fila }: { fila: FilaActividad }) {
  const tareas = tareasDe(fila);
  return (
    <tr className="border-t align-top" style={{ borderColor: '#F8FAFC' }}>
      <td className="px-4 py-3">
        <div className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
          {fila.nombre_fantasia || fila.razon_social}
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}>
          {fila.codigo_cliente}
          {fila.localidad_nombre ? ` · ${fila.localidad_nombre}` : ''}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {fila.visitas.map((d) => (
            <span
              key={d}
              className="text-[10px] px-1.5 py-0.5 rounded font-600"
              style={{ background: '#EFF6FF', color: '#1D4ED8', fontFamily: 'JetBrains Mono' }}
            >
              {d}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-[10px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
          {fila.subcanal ?? '—'}
        </div>
        {fila.tier && (
          <span
            className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded font-700"
            style={{ background: '#F5F3FF', color: '#6D28D9', fontFamily: 'Outfit' }}
          >
            TIER {fila.tier}
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <EstadoCliente fila={fila} />
      </td>
      <td className="px-4 py-3">
        <Marcas marcas={fila.compras} tono="verde" vacio="—" />
      </td>
      <td className="px-4 py-3">
        <Marcas marcas={fila.faltantes} tono="ambar" vacio="—" />
      </td>
      <td className="px-4 py-3">
        {tareas.length === 0 ? (
          <span className="text-[10px]" style={{ color: '#CBD5E1', fontFamily: 'Inter' }}>
            —
          </span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {tareas.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded font-600"
                style={{ background: '#F5F3FF', color: '#6D28D9', fontFamily: 'Outfit' }}
              >
                <ClipboardList size={9} /> {t}
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

function EstadoCliente({ fila }: { fila: FilaActividad }) {
  const estado = estadoDe(fila);

  // Las dos excepciones del FLAG ALCOHOL. Van primero: una baja no se visita
  // más y a un consumo propio no se le ofrece nada.
  if (estado === 'baja') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-600"
        style={{ background: '#FEF2F2', color: '#B91C1C', fontFamily: 'Inter' }}
      >
        Baja
      </span>
    );
  }
  if (estado === 'consumo') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-600"
        style={{ background: '#F0F9FF', color: '#0369A1', fontFamily: 'Inter' }}
      >
        Consumo personal
      </span>
    );
  }
  if (estado === 'oportunidad') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-600"
        style={{ background: '#FFFBEB', color: '#B45309', fontFamily: 'Inter' }}
      >
        <CalendarDays size={10} /> Sin compra
      </span>
    );
  }
  if (estado === 'compro') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-600"
        style={{ background: '#ECFDF5', color: '#047857', fontFamily: 'Inter' }}
      >
        Compró
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-600"
      style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}
    >
      Sin marcas
    </span>
  );
}

function Marcas({
  marcas,
  tono,
  vacio,
}: {
  marcas: string[];
  tono: 'verde' | 'ambar';
  vacio: string;
}) {
  if (marcas.length === 0) {
    return (
      <span className="text-[10px]" style={{ color: '#CBD5E1', fontFamily: 'Inter' }}>
        {vacio}
      </span>
    );
  }

  const estilo =
    tono === 'verde'
      ? { background: '#ECFDF5', color: '#047857' }
      : { background: '#FFFBEB', color: '#B45309' };

  return (
    <div className="flex flex-wrap gap-1 max-w-[220px]">
      {marcas.map((m) => (
        <span
          key={m}
          className="text-[9px] px-1.5 py-0.5 rounded font-500"
          style={{ ...estilo, fontFamily: 'Inter' }}
        >
          {m}
        </span>
      ))}
    </div>
  );
}

function Campo({
  etiqueta,
  children,
  crecer = false,
}: {
  etiqueta: string;
  children: React.ReactNode;
  crecer?: boolean;
}) {
  return (
    <div className={crecer ? 'flex-1 min-w-[200px]' : ''}>
      <div
        className="text-[9px] font-600 mb-1"
        style={{ color: '#94A3B8', fontFamily: 'Outfit', letterSpacing: '0.04em' }}
      >
        {etiqueta}
      </div>
      {children}
    </div>
  );
}
