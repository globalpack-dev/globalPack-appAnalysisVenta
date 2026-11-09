import { useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  Copy,
  Download,
  FileSpreadsheet,
  History,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { useImportaciones, type Carga } from '../hooks/useImportaciones';
import EstadoDatos, { Skeleton } from '../components/ui/EstadoDatos';
import { mensajeDeError } from '../lib/errores';
import type { TipoExcel } from '../lib/importacion/config';

/**
 * Historial de cargas.
 *
 * El importador ya escribía cada carga en `importaciones` desde la etapa 1, pero
 * no había dónde verlo: el histórico quedaba sólo en la base. Esta página lo
 * muestra —fecha, archivo, filas, estado y el detalle que dejó cada carga— y
 * permite copiar el resumen para mandarlo por donde haga falta.
 *
 * Es de sólo lectura a propósito: las cargas se deshacen volviendo a subir un
 * Excel, no borrando el registro de auditoría.
 */

const fmt = (n: number) => n.toLocaleString('es-AR');

const TIPO_ETIQUETA: Record<string, string> = {
  ventas: 'Ventas',
  cartera: 'Cartera',
};

function fecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function duracion(c: Carga): string {
  const inicio = new Date(c.created_at).getTime();
  const fin = c.finalizado_en ? new Date(c.finalizado_en).getTime() : null;
  if (!fin || Number.isNaN(inicio) || Number.isNaN(fin) || fin < inicio) return '—';
  const s = (fin - inicio) / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export default function Cargas() {
  const { cargas, isPending, error, refrescar } = useImportaciones();
  const [filtro, setFiltro] = useState<'todas' | TipoExcel>('todas');
  const [refrescando, setRefrescando] = useState(false);
  const [imagenDe, setImagenDe] = useState<Carga | null>(null);

  const visibles = filtro === 'todas' ? cargas : cargas.filter((c) => c.tipo === filtro);
  const ultima = cargas[0] ?? null;
  const conError = cargas.filter((c) => c.estado === 'error').length;

  async function actualizar() {
    setRefrescando(true);
    try {
      await refrescar();
    } finally {
      setRefrescando(false);
    }
  }

  return (
    <div className="p-5 space-y-4">
      {/* Encabezado */}
      <div className="bg-white rounded-xl border p-4" style={{ borderColor: '#E2E8F0' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <span
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#EFF6FF', color: '#1D4ED8' }}
            >
              <History size={18} />
            </span>
            <div>
              <h2 className="text-base font-700" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                Historial de cargas
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                Cada archivo que pasó por «Cargar datos», con quién lo subió y cómo terminó.
              </p>
            </div>
          </div>
          <button
            onClick={() => void actualizar()}
            disabled={refrescando}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-500 flex-shrink-0"
            style={{
              border: '1px solid #E2E8F0',
              color: refrescando ? '#94A3B8' : '#1D4ED8',
              background: '#FFFFFF',
              fontFamily: 'Inter',
              cursor: refrescando ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={13} className={refrescando ? 'animate-spin' : undefined} />
            Actualizar
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          <Dato etiqueta="Cargas registradas" valor={fmt(cargas.length)} />
          <Dato etiqueta="Con error" valor={fmt(conError)} tono={conError ? 'alerta' : undefined} />
          <Dato etiqueta="Última carga" valor={ultima ? fecha(ultima.created_at) : '—'} />
          <Dato etiqueta="Último archivo" valor={ultima?.archivo ?? '—'} />
        </div>
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {(['todas', 'ventas', 'cartera'] as const).map((f) => {
          const activo = filtro === f;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className="px-2.5 py-1 rounded-md text-[11px] font-500"
              style={{
                background: activo ? '#EFF6FF' : '#FFFFFF',
                color: activo ? '#1D4ED8' : '#64748B',
                border: `1px solid ${activo ? '#BFDBFE' : '#E2E8F0'}`,
                fontFamily: 'Inter',
              }}
            >
              {f === 'todas' ? 'Todas' : TIPO_ETIQUETA[f]}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      <EstadoDatos
        cargando={isPending}
        error={error}
        vacio={!isPending && visibles.length === 0}
        mensajeVacio={
          cargas.length === 0
            ? 'Todavía no hay cargas registradas. Subí un archivo desde «Cargar datos».'
            : 'No hay cargas de este tipo.'
        }
        childrenCargando={<Skeleton filas={4} alto="h-20" />}
      >
        <div className="space-y-2.5">
          {visibles.map((c) => (
            <CargaCard key={c.id_importacion} carga={c} onImagen={() => setImagenDe(c)} />
          ))}
        </div>
      </EstadoDatos>

      {imagenDe && <VistaPreviaResumen carga={imagenDe} onCerrar={() => setImagenDe(null)} />}
    </div>
  );
}

// ─── Tarjeta de una carga ─────────────────────────────────────────────────────

function CargaCard({ carga, onImagen }: { carga: Carga; onImagen: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const esCartera = carga.tipo === 'cartera';
  const icono = esCartera ? <Users size={16} /> : <FileSpreadsheet size={16} />;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumenTexto(carga));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
      <div className="flex items-start gap-3 p-3.5">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: esCartera ? '#F0FDF4' : '#EFF6FF',
            color: esCartera ? '#15803D' : '#1D4ED8',
          }}
        >
          {icono}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-600" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              {carga.archivo}
            </span>
            <Chip color="#1D4ED8" fondo="#EFF6FF">{TIPO_ETIQUETA[carga.tipo] ?? carga.tipo}</Chip>
            <Estado estado={carga.estado} />
          </div>

          <div
            className="flex items-center gap-3 flex-wrap mt-1 text-[11px]"
            style={{ color: '#64748B', fontFamily: 'Inter' }}
          >
            <span className="flex items-center gap-1">
              <Clock size={11} /> {fecha(carga.created_at)}
            </span>
            <span>{duracion(carga)}</span>
            <span>
              <strong style={{ color: '#0F172A' }}>{fmt(carga.filas_ok)}</strong> filas ok
            </span>
            {carga.filas_descartadas > 0 && (
              <span style={{ color: '#B45309' }}>
                {fmt(carga.filas_descartadas)} descartada(s)
              </span>
            )}
            <span style={{ color: '#94A3B8' }}>importación #{carga.id_importacion}</span>
          </div>

          {carga.error && (
            <p className="text-[11px] mt-1.5 leading-relaxed" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
              {carga.error}
            </p>
          )}
        </div>

        <button
          onClick={() => setAbierta((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-500 flex-shrink-0"
          style={{ color: '#1D4ED8', border: '1px solid #E2E8F0', fontFamily: 'Inter' }}
        >
          {abierta ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Detalle
        </button>
      </div>

      {abierta && (
        <div className="px-3.5 pb-3.5">
          <div
            className="rounded-lg border p-3"
            style={{ borderColor: '#F1F5F9', background: '#F8FAFC' }}
          >
            <Detalle detalle={carga.detalle} />

            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => void copiar()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-500"
                style={{
                  background: copiado ? '#DCFCE7' : '#EFF6FF',
                  color: copiado ? '#15803D' : '#1D4ED8',
                  fontFamily: 'Inter',
                }}
              >
                {copiado ? <Check size={12} /> : <Copy size={12} />}
                {copiado ? 'Resumen copiado' : 'Copiar resumen'}
              </button>

              <button
                onClick={onImagen}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-500"
                style={{ background: '#F1F5F9', color: '#0F172A', fontFamily: 'Inter' }}
              >
                <Download size={12} />
                Descargar imagen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detalle ──────────────────────────────────────────────────────────────────

/**
 * El `detalle` es jsonb libre y cambió entre etapas, así que se lee con guardas
 * en vez de castear a una forma fija. Lo que no se reconoce se muestra como
 * clave: valor, para no perder información.
 */
function Detalle({ detalle }: { detalle: Record<string, unknown> }) {
  const supervisores = listaDe<{ nombre: string; clientes: number }>(detalle.supervisores);
  const flags = listaDe<{ valor?: string; etiqueta?: string; clientes: number }>(detalle.flags);
  const periodos = listaDe<string>(detalle.periodos);
  const dimensiones = objetoDe(detalle.dimensionesCreadas);
  const columnasSinDestino = listaDe<string>(detalle.columnasSinDestino);

  const filas: Array<{ etiqueta: string; valor: string }> = [];

  if (periodos.length) filas.push({ etiqueta: 'Períodos', valor: periodos.join(' · ') });
  if (typeof detalle.archivados === 'number') {
    filas.push({ etiqueta: 'Clientes archivados', valor: fmt(detalle.archivados) });
  }
  if (typeof detalle.clientesNuevos === 'number') {
    filas.push({ etiqueta: 'Clientes nuevos', valor: fmt(detalle.clientesNuevos) });
  }
  if (typeof detalle.encargadosActualizados === 'number') {
    filas.push({ etiqueta: 'Encargados actualizados', valor: fmt(detalle.encargadosActualizados) });
  }
  if (typeof detalle.encargadosCreados === 'number') {
    filas.push({ etiqueta: 'Encargados creados', valor: fmt(detalle.encargadosCreados) });
  }

  const dimensionesFilas = Object.entries(dimensiones)
    .filter(([, n]) => Number(n) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  const sinMostrar = Object.keys(detalle).filter(
    (k) =>
      ![
        'supervisores',
        'flags',
        'periodos',
        'dimensionesCreadas',
        'columnasSinDestino',
        'archivados',
        'clientesNuevos',
        'encargadosActualizados',
        'encargadosCreados',
      ].includes(k),
  );

  const hayContenido =
    filas.length || supervisores.length || flags.length || dimensionesFilas.length || sinMostrar.length;

  if (!hayContenido) {
    return (
      <p className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        Esta carga no dejó detalle guardado.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {filas.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {filas.map((f) => (
            <div key={f.etiqueta}>
              <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                {f.etiqueta}
              </div>
              <div className="text-xs font-600" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                {f.valor}
              </div>
            </div>
          ))}
        </div>
      )}

      {supervisores.length > 0 && (
        <div>
          <Titulo>Supervisores en la nueva cartera</Titulo>
          <div className="flex flex-wrap gap-1.5">
            {supervisores.map((s) => (
              <Chip key={s.nombre} color="#475569" fondo="#F1F5F9">
                {s.nombre}: {fmt(s.clientes)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {dimensionesFilas.length > 0 && (
        <div>
          <Titulo>Dimensiones creadas</Titulo>
          <div className="flex flex-wrap gap-1.5">
            {dimensionesFilas.map(([tabla, n]) => (
              <Chip key={tabla} color="#475569" fondo="#F1F5F9">
                {tabla}: {fmt(Number(n))}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {flags.length > 0 && (
        <div>
          <Titulo>FLAG ALCOHOL en el archivo</Titulo>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f, i) => (
              <Chip key={`${f.valor ?? f.etiqueta ?? i}`} color="#475569" fondo="#F1F5F9">
                {f.etiqueta ?? f.valor ?? '—'}: {fmt(f.clientes)}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {columnasSinDestino.length > 0 && (
        <div>
          <Titulo>Columnas sin destino</Titulo>
          <div className="flex flex-wrap gap-1.5">
            {columnasSinDestino.map((c) => (
              <Chip key={c} color="#92400E" fondo="#FEF3C7">
                {c}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {sinMostrar.length > 0 && (
        <div>
          <Titulo>Otros datos</Titulo>
          <ul className="space-y-0.5">
            {sinMostrar.map((k) => (
              <li key={k} className="text-[11px]" style={{ color: '#475569', fontFamily: 'Inter' }}>
                <span style={{ fontFamily: 'JetBrains Mono', color: '#94A3B8' }}>{k}</span>:{' '}
                {textoDe(detalle[k])}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Resumen copiable ─────────────────────────────────────────────────────────

function resumenTexto(c: Carga): string {
  const d = c.detalle ?? {};
  const supervisores = listaDe<{ nombre: string; clientes: number }>(d.supervisores);
  const periodos = listaDe<string>(d.periodos);
  const dimensiones = objetoDe(d.dimensionesCreadas);
  const dimensionesTexto = Object.entries(dimensiones)
    .filter(([, n]) => Number(n) > 0)
    .map(([t, n]) => `${t}: ${n}`)
    .join(', ');

  return [
    `Carga de ${TIPO_ETIQUETA[c.tipo] ?? c.tipo} — Global Pack`,
    `Archivo: ${c.archivo}`,
    `Fecha: ${fecha(c.created_at)}`,
    `Estado: ${c.estado}`,
    `Filas ok: ${fmt(c.filas_ok)} · descartadas: ${fmt(c.filas_descartadas)}`,
    periodos.length ? `Períodos: ${periodos.join(', ')}` : '',
    supervisores.length
      ? `Supervisores: ${supervisores.map((s) => `${s.nombre}: ${s.clientes}`).join(' · ')}`
      : '',
    typeof d.archivados === 'number' ? `Clientes archivados: ${fmt(d.archivados)}` : '',
    dimensionesTexto ? `Dimensiones nuevas: ${dimensionesTexto}` : '',
    c.error ? `Error: ${c.error}` : '',
    `Auditoría: importación #${c.id_importacion}`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

function Estado({ estado }: { estado: Carga['estado'] }) {
  const config = {
    ok: { texto: 'Completada', color: '#15803D', fondo: '#F0FDF4', icono: <CircleCheck size={11} /> },
    error: { texto: 'Con error', color: '#B91C1C', fondo: '#FEF2F2', icono: <TriangleAlert size={11} /> },
    en_curso: {
      texto: 'En curso',
      color: '#92400E',
      fondo: '#FFFBEB',
      icono: <LoaderCircle size={11} className="animate-spin" />,
    },
  }[estado];

  return (
    <span
      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-600"
      style={{ background: config.fondo, color: config.color, fontFamily: 'Inter' }}
    >
      {config.icono}
      {config.texto}
    </span>
  );
}

function Dato({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: string;
  tono?: 'alerta';
}) {
  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: '#E2E8F0', background: '#FFFFFF' }}>
      <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        {etiqueta}
      </div>
      <div
        className="text-sm font-700 mt-0.5 truncate"
        title={valor}
        style={{
          color: tono === 'alerta' ? '#B45309' : '#0F172A',
          fontFamily: 'Outfit',
        }}
      >
        {valor}
      </div>
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-600 mb-1.5" style={{ color: '#64748B', fontFamily: 'Inter' }}>
      {children}
    </div>
  );
}

function Chip({
  children,
  color,
  fondo,
}: {
  children: React.ReactNode;
  color: string;
  fondo: string;
}) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[11px]"
      style={{ background: fondo, color, fontFamily: 'JetBrains Mono' }}
    >
      {children}
    </span>
  );
}

// ─── Imagen del resumen ───────────────────────────────────────────────────────

/**
 * Vista previa del resumen para descargar como imagen.
 *
 * Se dibuja una tarjeta aparte, de ancho fijo, en vez de capturar la tarjeta de
 * la lista: el contenedor de la página tiene scroll y ancho variable, y
 * `html-to-image` copia los estilos computados (incluidos los márgenes
 * resueltos), lo que recorta o corre la imagen. Acá la tarjeta se captura con
 * sus propias medidas, a 2x para que no salga borrosa en el teléfono.
 *
 * Mismo patrón que `components/ui/ResumenDia.tsx`.
 */
function VistaPreviaResumen({ carga, onCerrar }: { carga: Carga; onCerrar: () => void }) {
  const tarjeta = useRef<HTMLDivElement>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function descargar() {
    const nodo = tarjeta.current;
    if (!nodo) return;

    setGenerando(true);
    setError(null);
    try {
      // El tamaño sale del borde real, no de `clientWidth`: éste trunca los
      // fraccionales y no incluye el borde, y el canvas recorta el margen.
      const caja = nodo.getBoundingClientRect();

      const opciones = {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#FFFFFF',
        width: Math.ceil(caja.width),
        height: Math.ceil(caja.height),
        style: { margin: '0' },
      };

      let url: string;
      try {
        url = await toPng(nodo, opciones);
      } catch {
        // Si el navegador bloquea las fuentes por CORS, se captura sin ellas:
        // en pantalla ya están cargadas y el resultado se ve igual.
        url = await toPng(nodo, { ...opciones, skipFonts: true });
      }

      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombreImagen(carga);
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center p-4 gap-3 overflow-auto"
      style={{ background: 'rgba(15, 23, 42, 0.6)' }}
      onClick={onCerrar}
    >
      {/* Barra de acción, FUERA de la tarjeta para que la captura quede limpia */}
      <div
        className="flex items-center justify-between gap-3 w-full max-w-[760px] py-1"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-sm font-600" style={{ color: '#FFFFFF', fontFamily: 'Outfit' }}>
            Resumen de la carga
          </div>
          <div className="text-[11px]" style={{ color: '#CBD5E1', fontFamily: 'Inter' }}>
            Se descarga como PNG, listo para mandar.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void descargar()}
            disabled={generando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-600"
            style={{
              background: generando ? '#93C5FD' : '#FFFFFF',
              color: '#1D4ED8',
              fontFamily: 'Inter',
              cursor: generando ? 'wait' : 'pointer',
            }}
          >
            {generando ? <LoaderCircle size={14} className="animate-spin" /> : <Download size={14} />}
            {generando ? 'Generando…' : 'Descargar PNG'}
          </button>
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

      <div onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 20px 45px rgba(0,0,0,0.3)' }}>
        <TarjetaResumen ref={tarjeta} carga={carga} />
      </div>

      {error && (
        <p
          className="text-[11px] px-3 py-2 rounded-lg max-w-[760px]"
          style={{ background: '#FEF2F2', color: '#B91C1C', fontFamily: 'Inter' }}
          onClick={(e) => e.stopPropagation()}
        >
          {error}
        </p>
      )}
    </div>
  );
}

/** Tarjeta que se captura. Ancho fijo a propósito: la imagen no depende del viewport. */
function TarjetaResumen({ carga, ref }: { carga: Carga; ref?: React.Ref<HTMLDivElement> }) {
  const d = carga.detalle ?? {};
  const supervisores = listaDe<{ nombre: string; clientes: number }>(d.supervisores);
  const flags = listaDe<{ valor?: string; etiqueta?: string; clientes: number }>(d.flags);
  const periodos = listaDe<string>(d.periodos);
  const columnasSinDestino = listaDe<string>(d.columnasSinDestino);
  const dimensiones = Object.entries(objetoDe(d.dimensionesCreadas))
    .filter(([, n]) => Number(n) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));

  const esCartera = carga.tipo === 'cartera';

  return (
    <div ref={ref} style={{ width: 720, background: '#FFFFFF', fontFamily: 'Inter' }}>
      {/* Encabezado */}
      <div
        className="flex items-center justify-between px-7 py-5"
        style={{ background: '#0F172A' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: '#1D4ED8', color: '#FFFFFF', fontFamily: 'Outfit', fontWeight: 700 }}
          >
            GP
          </div>
          <div>
            <div
              className="text-sm font-700"
              style={{ color: '#FFFFFF', fontFamily: 'Outfit', letterSpacing: '0.08em' }}
            >
              GLOBAL PACK
            </div>
            <div className="text-[11px]" style={{ color: '#94A3B8' }}>
              Sistema de Gestión Comercial
            </div>
          </div>
        </div>
        <div
          className="px-2.5 py-1 rounded text-[11px] font-600"
          style={{ background: 'rgba(255,255,255,0.12)', color: '#E2E8F0' }}
        >
          Resumen de carga
        </div>
      </div>

      <div className="px-7 py-6">
        {/* Archivo y estado */}
        <div className="flex items-start gap-2 flex-wrap">
          <h1
            className="text-lg font-700 leading-tight"
            style={{ color: '#0F172A', fontFamily: 'Outfit' }}
          >
            {carga.archivo}
          </h1>
          <Chip color={esCartera ? '#15803D' : '#1D4ED8'} fondo={esCartera ? '#F0FDF4' : '#EFF6FF'}>
            {TIPO_ETIQUETA[carga.tipo] ?? carga.tipo}
          </Chip>
          <Chip color={colorEstado(carga.estado)} fondo={fondoEstado(carga.estado)}>
            {textoEstado(carga.estado)}
          </Chip>
        </div>

        <div className="flex items-center gap-3 flex-wrap mt-2 text-[11px]" style={{ color: '#64748B' }}>
          <span>{fecha(carga.created_at)}</span>
          <span>·</span>
          <span>Duración: {duracion(carga)}</span>
          <span>·</span>
          <span>Importación #{carga.id_importacion}</span>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          <Metrica etiqueta="Filas cargadas" valor={fmt(carga.filas_ok)} />
          <Metrica
            etiqueta="Filas descartadas"
            valor={fmt(carga.filas_descartadas)}
            tono={carga.filas_descartadas > 0 ? '#B45309' : undefined}
          />
          <Metrica etiqueta="Total del archivo" valor={fmt(carga.filas_ok + carga.filas_descartadas)} />
        </div>

        {/* Datos del detalle */}
        <div className="mt-5 space-y-3.5">
          {periodos.length > 0 && (
            <Fila etiqueta="Períodos">
              <div className="flex flex-wrap gap-1.5">
                {periodos.map((p) => (
                  <Chip key={p} color="#475569" fondo="#F1F5F9">{p}</Chip>
                ))}
              </div>
            </Fila>
          )}

          {(typeof d.archivados === 'number' || typeof d.clientesNuevos === 'number') && (
            <Fila etiqueta="Impacto en la cartera">
              <div className="flex flex-wrap gap-1.5">
                {typeof d.archivados === 'number' && (
                  <Chip color="#475569" fondo="#F1F5F9">Archivados: {fmt(d.archivados)}</Chip>
                )}
                {typeof d.clientesNuevos === 'number' && (
                  <Chip color="#15803D" fondo="#F0FDF4">Nuevos: {fmt(d.clientesNuevos)}</Chip>
                )}
                {typeof d.encargadosActualizados === 'number' && (
                  <Chip color="#475569" fondo="#F1F5F9">
                    Encargados actualizados: {fmt(d.encargadosActualizados)}
                  </Chip>
                )}
                {typeof d.encargadosCreados === 'number' && (
                  <Chip color="#1D4ED8" fondo="#EFF6FF">
                    Encargados creados: {fmt(d.encargadosCreados)}
                  </Chip>
                )}
              </div>
            </Fila>
          )}

          {supervisores.length > 0 && (
            <Fila etiqueta="Supervisores en la nueva cartera">
              <div className="flex flex-wrap gap-1.5">
                {supervisores.map((s) => (
                  <Chip key={s.nombre} color="#475569" fondo="#F1F5F9">
                    {s.nombre}: {fmt(s.clientes)}
                  </Chip>
                ))}
              </div>
            </Fila>
          )}

          {dimensiones.length > 0 && (
            <Fila etiqueta="Dimensiones creadas">
              <div className="flex flex-wrap gap-1.5">
                {dimensiones.map(([tabla, n]) => (
                  <Chip key={tabla} color="#475569" fondo="#F1F5F9">
                    {tabla}: {fmt(Number(n))}
                  </Chip>
                ))}
              </div>
            </Fila>
          )}

          {flags.length > 0 && (
            <Fila etiqueta="FLAG ALCOHOL en el archivo">
              <div className="flex flex-wrap gap-1.5">
                {flags.map((f, i) => (
                  <Chip key={`${f.valor ?? f.etiqueta ?? i}`} color="#475569" fondo="#F1F5F9">
                    {f.etiqueta ?? f.valor ?? '—'}: {fmt(f.clientes)}
                  </Chip>
                ))}
              </div>
            </Fila>
          )}

          {columnasSinDestino.length > 0 && (
            <Fila etiqueta="Columnas sin destino">
              <div className="flex flex-wrap gap-1.5">
                {columnasSinDestino.map((c) => (
                  <Chip key={c} color="#92400E" fondo="#FEF3C7">{c}</Chip>
                ))}
              </div>
            </Fila>
          )}

          {carga.error && (
            <div className="px-3 py-2 rounded-lg" style={{ background: '#FEF2F2' }}>
              <div className="text-[10px] font-600 mb-0.5" style={{ color: '#B91C1C' }}>
                Error
              </div>
              <div className="text-[11px] leading-relaxed" style={{ color: '#B91C1C' }}>
                {carga.error}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex items-center justify-between px-7 py-3"
        style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}
      >
        <span className="text-[10px]" style={{ color: '#94A3B8' }}>
          Generado el {fecha(new Date().toISOString())}
        </span>
        <span className="text-[10px]" style={{ color: '#94A3B8' }}>
          Global Pack · {TIPO_ETIQUETA[carga.tipo] ?? carga.tipo} · importación #{carga.id_importacion}
        </span>
      </div>
    </div>
  );
}

function Metrica({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
      <div className="text-[10px]" style={{ color: '#94A3B8' }}>
        {etiqueta}
      </div>
      <div className="text-lg font-700 mt-0.5" style={{ color: tono ?? '#0F172A', fontFamily: 'Outfit' }}>
        {valor}
      </div>
    </div>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-600 mb-1.5" style={{ color: '#64748B' }}>
        {etiqueta}
      </div>
      {children}
    </div>
  );
}

function textoEstado(estado: Carga['estado']): string {
  return { ok: 'Completada', error: 'Con error', en_curso: 'En curso' }[estado];
}

function colorEstado(estado: Carga['estado']): string {
  return { ok: '#15803D', error: '#B91C1C', en_curso: '#92400E' }[estado];
}

function fondoEstado(estado: Carga['estado']): string {
  return { ok: '#F0FDF4', error: '#FEF2F2', en_curso: '#FFFBEB' }[estado];
}

function nombreImagen(c: Carga): string {
  const d = new Date(c.created_at);
  const sello = Number.isNaN(d.getTime())
    ? 'sin-fecha'
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate(),
      ).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `carga-${c.tipo}-${sello}.png`;
}

// ─── Lectura defensiva del jsonb ──────────────────────────────────────────────

function listaDe<T>(valor: unknown): T[] {
  return Array.isArray(valor) ? (valor as T[]) : [];
}

function objetoDe(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function textoDe(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (Array.isArray(valor)) return valor.map(textoDe).join(', ');
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}
