import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Info,
  LoaderCircle,
  TriangleAlert,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  AVISOS_GENERALES,
  TIPOS,
  configDe,
  type ConfigTipo,
  type TipoExcel,
} from '../../lib/importacion/config';
import { especificacionPdf } from '../../lib/importacion/especificacionPdf';
import type { PlanVentas } from '../../lib/importacion/ventas';
import type { PlanCartera } from '../../lib/importacion/validarCartera';
import type { Progreso } from '../../lib/importacion/importaciones';
import {
  useImportar,
  type ResultadoImportacion,
} from '../../hooks/useImportar';

/**
 * Modal de importación.
 *
 * El orden de los pasos es deliberado: primero la **especificación en PDF**,
 * después la elección del archivo y recién al final la escritura. La vista
 * previa es el punto donde se ven los errores, antes de que se borre nada.
 *
 * Ventas y cartera comparten el flujo; cambian los bloques de la vista previa
 * y el resumen del resultado.
 */

type Paso = 'especificacion' | 'tipo' | 'requisitos' | 'preview' | 'resultado';

const ICONOS: Record<TipoExcel, ReactNode> = {
  ventas: <FileSpreadsheet size={18} />,
  cartera: <Users size={18} />,
};

const FASE: Record<Progreso['fase'], string> = {
  dimensiones: 'Preparando catálogos',
  borrado: 'Reemplazando los datos anteriores',
  ventas: 'Insertando ventas',
  respaldo: 'Archivando la foto anterior',
  cartera: 'Insertando cartera',
  alcohol: 'Insertando flags de alcohol',
  producto: 'Insertando matriz de marcas',
  operativa: 'Insertando datos operativos',
};

const fmt = (n: number) => n.toLocaleString('es-AR');

export default function ModalCargarExcel({ onCerrar }: { onCerrar: () => void }) {
  const [paso, setPaso] = useState<Paso>('especificacion');
  const [tipoId, setTipoId] = useState<TipoExcel | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [pdfGenerando, setPdfGenerando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    estado,
    plan,
    progreso,
    resultado,
    error,
    validar,
    cargar,
    reiniciar,
    setMarcaAlcohol,
  } = useImportar();

  const cargando = estado === 'cargando';
  const config = tipoId ? configDe(tipoId) : null;

  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cargando) onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar, cargando]);

  function cerrarSeguro() {
    if (!cargando) onCerrar();
  }

  function volver() {
    if (cargando) return;
    if (paso === 'tipo') setPaso('especificacion');
    else if (paso === 'requisitos') setPaso('tipo');
    else if (paso === 'preview') setPaso('requisitos');
    else if (paso === 'resultado') setPaso('requisitos');
    else setPaso('especificacion');
  }

  function elegirTipo(tipo: TipoExcel) {
    reiniciar();
    setArchivo(null);
    if (inputRef.current) inputRef.current.value = '';
    setTipoId(tipo);
    setPaso('requisitos');
  }

  function volverATipos() {
    reiniciar();
    setArchivo(null);
    if (inputRef.current) inputRef.current.value = '';
    setTipoId(null);
    setPaso('tipo');
  }

  function elegirArchivo(file: File | null) {
    reiniciar();
    setArchivo(file);
  }

  async function validarArchivo() {
    if (!archivo || !tipoId) return;
    const siguiente = await validar(tipoId, archivo);
    if (siguiente) setPaso('preview');
  }

  async function confirmar() {
    const r = await cargar();
    setPaso('resultado');
    if (!r) return;
  }

  async function verPdf() {
    // La ventana se abre en el click, no después del await: si no, los
    // bloqueadores de pop-ups la cancelan.
    const ventana = window.open('', '_blank');
    setPdfGenerando(true);
    setPdfError(false);
    try {
      const blob = await especificacionPdf();
      const url = URL.createObjectURL(blob);
      if (ventana) {
        ventana.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        descargarBlob(blob);
      }
    } catch {
      ventana?.close();
      setPdfError(true);
    } finally {
      setPdfGenerando(false);
    }
  }

  async function bajarPdf() {
    setPdfGenerando(true);
    setPdfError(false);
    try {
      descargarBlob(await especificacionPdf());
    } catch {
      setPdfError(true);
    } finally {
      setPdfGenerando(false);
    }
  }

  // ── Encabezado ──────────────────────────────────────────────────────────────
  const titulos: Record<Paso, { titulo: string; subtitulo: string }> = {
    especificacion: {
      titulo: 'Cargar datos desde Excel',
      subtitulo: 'Empezá por la especificación: define cómo debe estar cada archivo.',
    },
    tipo: {
      titulo: 'Cargar datos desde Excel',
      subtitulo: 'Elegí qué planilla de Global Pack vas a subir.',
    },
    requisitos: {
      titulo: config ? `Cargar ${config.titulo.toLowerCase()}` : 'Cargar datos',
      subtitulo: 'Revisá que el archivo cumpla estos requisitos antes de subirlo.',
    },
    preview: {
      titulo: config ? `Vista previa · ${config.titulo}` : 'Vista previa',
      subtitulo: 'Esto es lo que se va a escribir si confirmás. Todavía no se tocó la base.',
    },
    resultado: {
      titulo: 'Resultado de la carga',
      subtitulo: 'Resumen de la importación.',
    },
  };

  const puedeVolver = paso !== 'especificacion' && !cargando;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(10,22,40,0.6)' }}
      onClick={cerrarSeguro}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Cargar datos desde Excel"
      >
        {/* Encabezado */}
        <div
          className="flex items-start justify-between gap-4 px-6 pt-5 pb-4"
          style={{ borderBottom: '1px solid #E2E8F0' }}
        >
          <div className="flex items-start gap-2">
            {puedeVolver && (
              <button
                onClick={volver}
                className="mt-0.5 flex items-center gap-1 text-xs font-500 rounded-md px-1.5 py-1"
                style={{ color: '#64748B', fontFamily: 'Inter' }}
                title="Volver"
              >
                <ChevronLeft size={14} /> Volver
              </button>
            )}
            <div>
              <h3
                className="text-base font-700"
                style={{ color: '#0F172A', fontFamily: 'Outfit' }}
              >
                {titulos[paso].titulo}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                {titulos[paso].subtitulo}
              </p>
            </div>
          </div>
          <button
            onClick={cerrarSeguro}
            disabled={cargando}
            style={{ color: cargando ? '#CBD5E1' : '#94A3B8', cursor: cargando ? 'not-allowed' : 'pointer' }}
            aria-label="Cerrar"
            title={cargando ? 'Esperá a que termine la carga' : 'Cerrar'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Contenido */}
        <div className="px-6 py-5 overflow-y-auto">
          {paso === 'especificacion' && (
            <PasoEspecificacion
              pdfGenerando={pdfGenerando}
              pdfError={pdfError}
              onVer={verPdf}
              onBajar={bajarPdf}
            />
          )}

          {paso === 'tipo' && <PasoTipos onElegir={elegirTipo} />}

          {paso === 'requisitos' && config && (
            <PasoRequisitos
              config={config}
              archivo={archivo}
              inputRef={inputRef}
              validando={estado === 'validando'}
              error={estado === 'error' ? error : null}
              onElegirArchivo={() => inputRef.current?.click()}
              onArchivo={elegirArchivo}
              onVerPdf={verPdf}
            />
          )}

          {paso === 'preview' && plan && (
            <>
              {cargando ? (
                <PasoProgreso progreso={progreso} total={plan.filasValidas} />
              ) : (
                <PasoVistaPrevia plan={plan} onMarcaAlcohol={setMarcaAlcohol} />
              )}
            </>
          )}

          {paso === 'resultado' && (
            <PasoResultado
              exito={estado === 'exito'}
              error={error}
              resultado={resultado}
            />
          )}
        </div>

        {/* Pie */}
        <div
          className="flex items-center justify-between gap-3 px-6 py-4"
          style={{ borderTop: '1px solid #E2E8F0' }}
        >
          <PieIzquierda
            paso={paso}
            config={config}
            cargando={cargando}
            onVerPdf={verPdf}
          />
          <div className="flex gap-2">
            {paso === 'especificacion' && (
              <>
                <BotonSecundario onClick={cerrarSeguro}>Cancelar</BotonSecundario>
                <BotonPrimario onClick={() => setPaso('tipo')}>
                  Continuar <ChevronRight size={13} />
                </BotonPrimario>
              </>
            )}

            {paso === 'tipo' && <BotonSecundario onClick={cerrarSeguro}>Cancelar</BotonSecundario>}

            {paso === 'requisitos' && config && (
              <>
                {config.habilitado ? (
                  <>
                    <BotonSecundario onClick={() => setPaso('tipo')}>Cambiar tipo</BotonSecundario>
                    <BotonPrimario
                      onClick={validarArchivo}
                      disabled={!archivo || estado === 'validando'}
                    >
                      {estado === 'validando' ? (
                        <>
                          <LoaderCircle size={13} className="animate-spin" /> Validando…
                        </>
                      ) : (
                        <>
                          <Eye size={13} /> Validar archivo
                        </>
                      )}
                    </BotonPrimario>
                  </>
                ) : (
                  <>
                    <BotonSecundario onClick={volverATipos}>Volver</BotonSecundario>
                    <BotonPrimario onClick={cerrarSeguro}>Entendido</BotonPrimario>
                  </>
                )}
              </>
            )}

            {paso === 'preview' && plan && (
              <>
                <BotonSecundario onClick={volver} disabled={cargando}>
                  Volver
                </BotonSecundario>
                <BotonPrimario
                  onClick={confirmar}
                  disabled={!plan.valido || cargando}
                >
                  {cargando ? (
                    <>
                      <LoaderCircle size={13} className="animate-spin" /> Cargando…
                    </>
                  ) : (
                    <>
                      <Upload size={13} /> Confirmar carga
                    </>
                  )}
                </BotonPrimario>
              </>
            )}

            {paso === 'resultado' && (
              <>
                {estado !== 'exito' && archivo && (
                  <BotonSecundario
                    onClick={async () => {
                      if (!tipoId) return;
                      const p = await validar(tipoId, archivo);
                      if (p) setPaso('preview');
                    }}
                  >
                    Reintentar
                  </BotonSecundario>
                )}
                <BotonPrimario onClick={cerrarSeguro}>
                  {estado === 'exito' ? 'Listo' : 'Cerrar'}
                </BotonPrimario>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Paso 0: especificación ────────────────────────────────────────────────────

function PasoEspecificacion({
  pdfGenerando,
  pdfError,
  onVer,
  onBajar,
}: {
  pdfGenerando: boolean;
  pdfError: boolean;
  onVer: () => void;
  onBajar: () => void;
}) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: '#BFDBFE', background: '#EFF6FF' }}
      >
        <div className="flex items-start gap-3">
          <span
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#DBEAFE', color: '#1D4ED8' }}
          >
            <FileText size={18} />
          </span>
          <div className="min-w-0">
            <h4 className="text-sm font-600" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
              Especificación de importación (PDF)
            </h4>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#1E40AF', fontFamily: 'Inter' }}>
              Hojas, fila de encabezado, columnas obligatorias y reglas de cada uno de los dos
              archivos. Conviene leerla antes de preparar el Excel.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={onVer}
            disabled={pdfGenerando}
            className="flex items-center gap-1.5 text-xs font-500 px-3 py-1.5 rounded-lg text-white"
            style={{
              background: pdfGenerando ? '#93C5FD' : '#1D4ED8',
              fontFamily: 'Inter',
              cursor: pdfGenerando ? 'wait' : 'pointer',
            }}
          >
            {pdfGenerando ? <LoaderCircle size={13} className="animate-spin" /> : <Eye size={13} />}
            Ver PDF
          </button>
          <button
            onClick={onBajar}
            disabled={pdfGenerando}
            className="flex items-center gap-1.5 text-xs font-500 px-3 py-1.5 rounded-lg"
            style={{
              border: '1px solid #BFDBFE',
              color: '#1D4ED8',
              background: '#FFFFFF',
              fontFamily: 'Inter',
              cursor: pdfGenerando ? 'wait' : 'pointer',
            }}
          >
            <Download size={13} /> Descargar
          </button>
        </div>
        {pdfError && (
          <p className="text-[11px] mt-2" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
            No se pudo generar el PDF. Probá de nuevo o cerrá este paso.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-600 mb-2" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
          Los dos archivos
        </h4>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          {TIPOS.map((t, i) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-3 py-2.5"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid #F1F5F9',
                background: '#FFFFFF',
              }}
            >
              <span style={{ color: '#1D4ED8' }}>{ICONOS[t.id]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                  {t.titulo}
                </div>
                <div className="text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                  {t.archivo}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Chip>Hoja {t.hojas.join(' / ')}</Chip>
                <Chip>Encabezado fila {t.filaEncabezado}</Chip>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Bloque
        titulo="Antes de exportar desde el sistema de origen"
        icono={<TriangleAlert size={14} />}
        color="#92400E"
        fondo="#FFFBEB"
        borde="#FDE68A"
      >
        <ul className="space-y-1.5">
          {AVISOS_GENERALES.map((a) => (
            <li
              key={a}
              className="flex gap-2 text-xs leading-relaxed"
              style={{ color: '#92400E', fontFamily: 'Inter' }}
            >
              <span aria-hidden>•</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </Bloque>
    </div>
  );
}

// ─── Paso 1: tipo ─────────────────────────────────────────────────────────────

function PasoTipos({ onElegir }: { onElegir: (tipo: TipoExcel) => void }) {
  return (
    <div className="grid gap-2.5">
      {TIPOS.map((t) => (
        <button
          key={t.id}
          onClick={() => onElegir(t.id)}
          className="flex items-center gap-3 w-full text-left rounded-xl border p-3.5 transition-colors hover:border-[#1D4ED8]"
          style={{ borderColor: '#E2E8F0', background: '#FFFFFF' }}
        >
          <span
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: '#EFF6FF', color: '#1D4ED8' }}
          >
            {ICONOS[t.id]}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 flex-wrap">
              <span
                className="text-sm font-600"
                style={{ color: '#0F172A', fontFamily: 'Outfit' }}
              >
                {t.titulo}
              </span>
              <span
                className="text-[11px]"
                style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}
              >
                {t.archivo}
              </span>
              {!t.habilitado && (
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-600"
                  style={{ background: '#FEF3C7', color: '#92400E', fontFamily: 'Inter' }}
                >
                  Próxima etapa
                </span>
              )}
            </span>
            <span
              className="block text-xs mt-0.5"
              style={{ color: '#64748B', fontFamily: 'Inter' }}
            >
              {t.descripcion}
            </span>
            <span className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Chip>Hoja: {t.hojas.join(' / ')}</Chip>
              <Chip>{t.filas}</Chip>
              <Chip>{t.columnas.length} columnas</Chip>
            </span>
          </span>
          <ChevronRight size={16} style={{ color: '#CBD5E1', flexShrink: 0 }} />
        </button>
      ))}
    </div>
  );
}

// ─── Paso 2: requisitos ───────────────────────────────────────────────────────

function PasoRequisitos({
  config,
  archivo,
  inputRef,
  validando,
  error,
  onElegirArchivo,
  onArchivo,
  onVerPdf,
}: {
  config: ConfigTipo;
  archivo: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  validando: boolean;
  error: string | null;
  onElegirArchivo: () => void;
  onArchivo: (f: File | null) => void;
  onVerPdf: () => void;
}) {
  return (
    <div className="space-y-4">
      <div
        className="flex items-center gap-3 rounded-xl border p-3"
        style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}
      >
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: '#EFF6FF', color: '#1D4ED8' }}
        >
          {ICONOS[config.id]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
            {config.archivo}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: '#64748B', fontFamily: 'Inter' }}>
            Hoja <span style={{ fontFamily: 'JetBrains Mono' }}>{config.hojas.join(' / ')}</span> ·{' '}
            {config.filas} esperadas
          </div>
        </div>
        <button
          onClick={onVerPdf}
          className="flex items-center gap-1 text-[11px] font-500 px-2 py-1 rounded-md flex-shrink-0"
          style={{ color: '#1D4ED8', border: '1px solid #BFDBFE', fontFamily: 'Inter' }}
          title="Abrir la especificación en PDF"
        >
          <FileText size={12} /> Especificación
        </button>
      </div>

      {!config.habilitado && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={14} style={{ color: '#92400E' }} />
            <h4 className="text-xs font-600" style={{ color: '#92400E', fontFamily: 'Inter' }}>
              Carga disponible en la próxima etapa
            </h4>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Por ahora podés revisar los requisitos de este archivo. La validación y la carga de
            cartera se conectan después de ventas.
          </p>
        </div>
      )}

      <Bloque
        titulo="Antes de exportar el Excel"
        icono={<TriangleAlert size={14} />}
        color="#92400E"
        fondo="#FFFBEB"
        borde="#FDE68A"
      >
        <ul className="space-y-1.5">
          {AVISOS_GENERALES.map((a) => (
            <li
              key={a}
              className="flex gap-2 text-xs leading-relaxed"
              style={{ color: '#92400E', fontFamily: 'Inter' }}
            >
              <span aria-hidden>•</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque
        titulo={`Particularidades de ${config.titulo.toLowerCase()}`}
        icono={<Info size={14} />}
        color="#1E40AF"
        fondo="#EFF6FF"
        borde="#BFDBFE"
      >
        <ul className="space-y-1.5">
          {config.avisos.map((a) => (
            <li
              key={a}
              className="flex gap-2 text-xs leading-relaxed"
              style={{ color: '#1E40AF', fontFamily: 'Inter' }}
            >
              <span aria-hidden>•</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
        {config.notaColumnas && (
          <p
            className="text-[11px] mt-2.5 pt-2.5 leading-relaxed"
            style={{ color: '#1E40AF', borderTop: '1px solid #BFDBFE', fontFamily: 'Inter' }}
          >
            {config.notaColumnas}
          </p>
        )}
      </Bloque>

      <div>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h4 className="text-xs font-600" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
            Columnas obligatorias
          </h4>
          <span
            className="text-[11px]"
            style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}
          >
            {config.obligatorias.length}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {config.obligatorias.map((c) => (
            <span
              key={c}
              className="px-1.5 py-0.5 rounded text-[11px]"
              style={{ background: '#F1F5F9', color: '#475569', fontFamily: 'JetBrains Mono' }}
            >
              {c}
            </span>
          ))}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          Si falta alguna, el archivo no se carga.
        </p>
      </div>

      {config.opcionales.length > 0 && (
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h4 className="text-xs font-600" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
              Columnas opcionales
            </h4>
            <span
              className="text-[11px]"
              style={{ color: '#94A3B8', fontFamily: 'JetBrains Mono' }}
            >
              {config.opcionales.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {config.opcionales.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded text-[11px]"
                style={{ background: '#F8FAFC', color: '#64748B', fontFamily: 'JetBrains Mono' }}
              >
                {c}
              </span>
            ))}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Si están, se usan; si faltan, el archivo se carga igual.
          </p>
        </div>
      )}

      {config.ignoradas.length > 0 && (
        <p className="text-[11px] leading-relaxed" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          Hay {config.ignoradas.length} columna(s) conocida(s) del archivo que no tienen destino en
          la base y se ignoran (totales, códigos internos). Cualquier otra columna nueva aparece en
          la vista previa como «sin destino».
        </p>
      )}

      <Bloque
        titulo="Qué pasa cuando se carga"
        icono={<Info size={14} />}
        color="#475569"
        fondo="#F8FAFC"
        borde="#E2E8F0"
      >
        <ul className="space-y-1.5">
          {config.alCargar.map((a) => (
            <li
              key={a}
              className="flex gap-2 text-xs leading-relaxed"
              style={{ color: '#475569', fontFamily: 'Inter' }}
            >
              <span aria-hidden>•</span>
              <span>{a}</span>
            </li>
          ))}
        </ul>
      </Bloque>

      {config.habilitado && (
        <div
          className="rounded-xl border border-dashed p-4 text-center"
          style={{
            borderColor: archivo ? '#1D4ED8' : '#CBD5E1',
            background: archivo ? '#EFF6FF' : '#FFFFFF',
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => onArchivo(e.target.files?.[0] ?? null)}
          />
          {archivo ? (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <FileSpreadsheet size={18} style={{ color: '#1D4ED8' }} />
              <div className="text-left min-w-0">
                <div
                  className="text-xs font-500 truncate"
                  style={{ color: '#0F172A', fontFamily: 'Inter', maxWidth: 320 }}
                >
                  {archivo.name}
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}
                >
                  {pesoArchivo(archivo.size)}
                </div>
              </div>
              <button
                onClick={onElegirArchivo}
                disabled={validando}
                className="text-xs font-500 px-3 py-1.5 rounded-lg"
                style={{
                  border: '1px solid #BFDBFE',
                  color: '#1D4ED8',
                  fontFamily: 'Inter',
                  background: '#FFFFFF',
                }}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Upload size={18} style={{ color: '#94A3B8' }} />
              <div className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                Ningún archivo seleccionado
              </div>
              <button
                onClick={onElegirArchivo}
                className="mt-1 text-xs font-500 px-3 py-1.5 rounded-lg text-white"
                style={{ background: '#1D4ED8', fontFamily: 'Inter' }}
              >
                Elegir archivo
              </button>
              <div className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                Excel .xlsx
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FECACA', background: '#FEF2F2' }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <TriangleAlert size={14} style={{ color: '#B91C1C' }} />
            <h4 className="text-xs font-600" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
              No se pudo leer el archivo
            </h4>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Paso 3: vista previa ─────────────────────────────────────────────────────

function PasoVistaPreviaVentas({ plan }: { plan: PlanVentas }) {
  const bloqueado = plan.columnasFaltantes.length > 0;

  return (
    <div className="space-y-4">
      {bloqueado && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FECACA', background: '#FEF2F2' }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <TriangleAlert size={14} style={{ color: '#B91C1C' }} />
            <h4 className="text-xs font-600" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
              Faltan columnas obligatorias
            </h4>
          </div>
          <p className="text-xs mb-2" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
            El archivo no se puede cargar hasta que incluya estas columnas, con el nombre exacto:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {plan.columnasFaltantes.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded text-[11px]"
                style={{ background: '#FEE2E2', color: '#B91C1C', fontFamily: 'JetBrains Mono' }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Dato etiqueta="Filas de datos" valor={fmt(plan.totalFilas)} />
        <Dato etiqueta="Filas válidas" valor={fmt(plan.filasValidas)} tono="ok" />
        <Dato
          etiqueta="Se descartan"
          valor={fmt(plan.descartadas.length)}
          tono={plan.descartadas.length ? 'alerta' : undefined}
        />
        <Dato etiqueta="Períodos" valor={fmt(plan.periodos.length)} />
      </div>

      <div>
        <h4 className="text-xs font-600 mb-2" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
          Períodos que se reemplazan
        </h4>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          {plan.periodos.length === 0 && (
            <div className="px-3 py-2.5 text-xs" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              No se detectó ningún período válido.
            </div>
          )}
          {plan.periodos.map((p, i) => (
            <div
              key={`${p.anio}/${p.mes}`}
              className="flex items-center justify-between gap-2 px-3 py-2"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid #F1F5F9',
                background: '#FFFFFF',
              }}
            >
              <div className="flex items-center gap-2">
                <Database size={13} style={{ color: '#1D4ED8' }} />
                <span className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                  {p.etiqueta}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                  {fmt(p.filas)} filas
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-600"
                  style={{ background: '#EFF6FF', color: '#1D4ED8', fontFamily: 'Inter' }}
                >
                  se reemplaza
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: '#64748B', fontFamily: 'Inter' }}>
          Las ventas de estos períodos se borran y se vuelven a insertar. Los demás períodos no se
          tocan.
        </p>
      </div>

      {plan.marcasNuevas.length > 0 && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
        >
          <h4 className="text-xs font-600 mb-1.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Marcas nuevas ({plan.marcasNuevas.length})
          </h4>
          <p className="text-[11px] leading-relaxed mb-2" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Estas marcas no están en la base. Se crean solas al cargar, pero no entran a la matriz
            de alcohol de cartera (son las 9 columnas del archivo de cartera).
          </p>
          <div className="flex flex-wrap gap-1.5">
            {plan.marcasNuevas.map((m) => (
              <span
                key={m}
                className="px-1.5 py-0.5 rounded text-[11px]"
                style={{ background: '#FEF3C7', color: '#92400E', fontFamily: 'JetBrains Mono' }}
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {plan.descartadas.length > 0 && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
        >
          <h4 className="text-xs font-600 mb-1.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Filas que se descartan ({fmt(plan.descartadas.length)})
          </h4>
          <ul className="space-y-1">
            {plan.descartadas.slice(0, 6).map((d) => (
              <li
                key={`${d.fila}-${d.motivo}`}
                className="flex gap-2 text-[11px]"
                style={{ color: '#92400E', fontFamily: 'Inter' }}
              >
                <span style={{ fontFamily: 'JetBrains Mono', flexShrink: 0 }}>Fila {d.fila}</span>
                <span>— {d.motivo}</span>
              </li>
            ))}
          </ul>
          {plan.descartadas.length > 6 && (
            <p className="text-[11px] mt-1.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
              … y {fmt(plan.descartadas.length - 6)} más.
            </p>
          )}
        </div>
      )}

      {plan.advertencias.length > 0 && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}
        >
          <h4 className="text-xs font-600 mb-1.5" style={{ color: '#475569', fontFamily: 'Inter' }}>
            Advertencias
          </h4>
          <ul className="space-y-1">
            {plan.advertencias.map((a) => (
              <li
                key={a}
                className="flex gap-2 text-[11px] leading-relaxed"
                style={{ color: '#475569', fontFamily: 'Inter' }}
              >
                <span aria-hidden>•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="rounded-xl border p-3.5"
        style={{ borderColor: '#BFDBFE', background: '#EFF6FF' }}
      >
        <div className="flex items-start gap-2">
          <Info size={14} style={{ color: '#1E40AF', flexShrink: 0, marginTop: 1 }} />
          <p className="text-[11px] leading-relaxed" style={{ color: '#1E40AF', fontFamily: 'Inter' }}>
            Al confirmar se crean sólo las dimensiones que falten (clientes, productos, marcas…).
            Las existentes se reutilizan. Si la carga se corta, volver a subir el mismo archivo es
            seguro.
          </p>
        </div>
      </div>
    </div>
  );
}

function PasoVistaPrevia({
  plan,
  onMarcaAlcohol,
}: {
  plan: PlanVentas | PlanCartera;
  onMarcaAlcohol: (nombre: string, esAlcohol: boolean) => void;
}) {
  if (plan.tipo === 'ventas') return <PasoVistaPreviaVentas plan={plan} />;
  return <PasoVistaPreviaCartera plan={plan} onMarcaAlcohol={onMarcaAlcohol} />;
}

function PasoVistaPreviaCartera({
  plan,
  onMarcaAlcohol,
}: {
  plan: PlanCartera;
  onMarcaAlcohol: (nombre: string, esAlcohol: boolean) => void;
}) {
  const bloqueado = plan.columnasFaltantes.length > 0;
  const encargadosFaltantes = plan.encargados.filter((e) => !e.existe);
  const flagsDesconocidos = plan.flags.filter((f) => !f.conocido);
  const comparacion = plan.comparacion;

  return (
    <div className="space-y-4">
      {bloqueado && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FECACA', background: '#FEF2F2' }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <TriangleAlert size={14} style={{ color: '#B91C1C' }} />
            <h4 className="text-xs font-600" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
              Faltan columnas obligatorias
            </h4>
          </div>
          <p className="text-xs mb-2" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
            El archivo no se puede cargar hasta que incluya estas columnas, con el nombre exacto:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {plan.columnasFaltantes.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded text-[11px]"
                style={{ background: '#FEE2E2', color: '#B91C1C', fontFamily: 'JetBrains Mono' }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {!plan.tieneNombreEncargado && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
        >
          <div className="flex items-start gap-2">
            <TriangleAlert size={14} style={{ color: '#B45309', flexShrink: 0, marginTop: 1 }} />
            <div>
              <h4 className="text-xs font-600 mb-0.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
                Este archivo no trae el nombre del encargado
              </h4>
              <p className="text-[11px] leading-relaxed" style={{ color: '#92400E', fontFamily: 'Inter' }}>
                Se busca en «PROMOTOR» o en «Descripción Vendedor» y no está en ninguna de las dos.
                Se puede cargar igual, pero el encargado se resuelve sólo por «Vnd.» y la cartera
                por persona no queda actualizada. Revisá arriba qué cambia respecto de lo que ya
                está cargado antes de confirmar.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Dato etiqueta="Filas de datos" valor={fmt(plan.totalFilas)} />
        <Dato etiqueta="Clientes válidos" valor={fmt(plan.filasValidas)} tono="ok" />
        <Dato
          etiqueta="Se descartan"
          valor={fmt(plan.descartadas.length)}
          tono={plan.descartadas.length ? 'alerta' : undefined}
        />
        <Dato
          etiqueta="Duplicados"
          valor={fmt(plan.duplicados)}
          tono={plan.duplicados ? 'alerta' : undefined}
        />
      </div>

      {comparacion && (
        <div>
          <h4 className="text-xs font-600 mb-2" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
            Qué cambia respecto de la cartera cargada hoy
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Dato
              etiqueta="Cambian de supervisor"
              valor={fmt(comparacion.cambianSupervisor)}
              tono={comparacion.cambianSupervisor ? 'alerta' : undefined}
            />
            <Dato
              etiqueta="Pasan a sin supervisor"
              valor={fmt(comparacion.pasanASinSupervisor)}
              tono={comparacion.pasanASinSupervisor ? 'alerta' : undefined}
            />
            <Dato etiqueta="Clientes nuevos" valor={fmt(comparacion.nuevos)} />
            <Dato
              etiqueta="Desaparecen de la cartera"
              valor={fmt(comparacion.desaparecen)}
              tono={comparacion.desaparecen ? 'alerta' : undefined}
            />
          </div>

          {comparacion.ejemplos.length > 0 && (
            <div
              className="rounded-xl border mt-2 overflow-hidden"
              style={{ borderColor: '#E2E8F0' }}
            >
              {comparacion.ejemplos.map((c, i) => (
                <div
                  key={c.codigo}
                  className="flex items-center justify-between gap-2 px-3 py-1.5"
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid #F1F5F9',
                    background: '#FFFFFF',
                  }}
                >
                  <span
                    className="text-[11px]"
                    style={{ color: '#475569', fontFamily: 'JetBrains Mono' }}
                  >
                    {c.codigo}
                  </span>
                  <span className="text-[11px] text-right" style={{ color: '#475569', fontFamily: 'Inter' }}>
                    {c.de} → <strong>{c.a}</strong>
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] mt-1.5" style={{ color: '#64748B', fontFamily: 'Inter' }}>
            Hoy hay {fmt(comparacion.totalActual)} clientes en cartera; el archivo trae{' '}
            {fmt(comparacion.totalArchivo)}. La foto anterior se archiva en cartera_historial antes
            de borrar, así que se puede consultar después.
          </p>
        </div>
      )}

      <div>
        <h4 className="text-xs font-600 mb-2" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
          Supervisores del archivo
        </h4>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          {plan.supervisores.map((s, i) => {
            const nuevo = plan.supervisoresNuevos.includes(s.nombre);
            return (
              <div
                key={s.nombre}
                className="flex items-center justify-between gap-2 px-3 py-2"
                style={{
                  borderTop: i === 0 ? 'none' : '1px solid #F1F5F9',
                  background: '#FFFFFF',
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Users size={13} style={{ color: '#1D4ED8', flexShrink: 0 }} />
                  <span className="text-xs truncate" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                    {s.nombre}
                  </span>
                  {nuevo && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-600 flex-shrink-0"
                      style={{ background: '#FEF3C7', color: '#92400E', fontFamily: 'Inter' }}
                    >
                      se crea
                    </span>
                  )}
                </div>
                <span className="text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                  {fmt(s.clientes)} clientes
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-600 mb-2" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
          Encargados («Vnd.»)
        </h4>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: '#E2E8F0' }}>
          {plan.encargados.map((e, i) => (
            <div
              key={e.codigo}
              className="flex items-center justify-between gap-2 px-3 py-1.5"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid #F1F5F9',
                background: '#FFFFFF',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="text-[11px] flex-shrink-0"
                  style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}
                >
                  {e.codigo}
                </span>
                <span className="text-xs truncate" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                  {e.nombreArchivo ?? e.nombreBase ?? 'Sin nombre en el archivo'}
                </span>
                {!e.existe && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-600 flex-shrink-0"
                    style={{ background: '#FEE2E2', color: '#B91C1C', fontFamily: 'Inter' }}
                  >
                    no existe en la base
                  </span>
                )}
              </div>
              <span className="text-[11px]" style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}>
                {fmt(e.clientes)}
              </span>
            </div>
          ))}
        </div>
        {encargadosFaltantes.length > 0 && (
          <p className="text-[11px] mt-1.5" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
            Los códigos que no existen se pueden crear sólo si el archivo trae el nombre
            («PROMOTOR» o «Descripción Vendedor»); si no, esos clientes quedan sin encargado.
          </p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-600 mb-2" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
          FLAG ALCOHOL en el archivo
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {plan.flags.map((f) => (
            <span
              key={f.valor}
              className="px-2 py-1 rounded text-[11px]"
              style={{
                background: f.conocido ? '#F1F5F9' : '#FEE2E2',
                color: f.conocido ? '#475569' : '#B91C1C',
                fontFamily: 'Inter',
              }}
            >
              {f.etiqueta}: {fmt(f.clientes)}
            </span>
          ))}
        </div>
        {flagsDesconocidos.length > 0 && (
          <p className="text-[11px] mt-1.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Los valores en rojo no son un flag válido: se cargan como NO.
          </p>
        )}
      </div>

      {plan.marcasNuevas.length > 0 && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
        >
          <h4 className="text-xs font-600 mb-1.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Marcas nuevas ({plan.marcasNuevas.length})
          </h4>
          <p
            className="text-[11px] leading-relaxed mb-2"
            style={{ color: '#92400E', fontFamily: 'Inter' }}
          >
            El archivo trae marcas que no están en la base. Se crean al cargar. Marcá las que sean
            alcohólicas: eso define si cuentan en los KPIs de alcohol.
          </p>
          <div className="space-y-1.5">
            {plan.marcasNuevas.map((m) => (
              <label
                key={m.col}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                style={{ background: '#FEF3C7', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={m.esAlcohol}
                  onChange={(e) => onMarcaAlcohol(m.nombre, e.target.checked)}
                  style={{ accentColor: '#B45309' }}
                />
                <span
                  className="text-[11px] font-600"
                  style={{ color: '#92400E', fontFamily: 'Inter' }}
                >
                  {m.nombre}
                </span>
                <span className="text-[11px]" style={{ color: '#B45309', fontFamily: 'Inter' }}>
                  ¿es alcohol?
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {plan.columnasSinDestino.length > 0 && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
        >
          <h4 className="text-xs font-600 mb-1.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Columnas sin destino ({plan.columnasSinDestino.length})
          </h4>
          <p className="text-[11px] leading-relaxed mb-2" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Estas columnas no se guardan: no son marcas (no traen sólo ceros y unos) ni tienen
            destino en la cartera.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {plan.columnasSinDestino.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded text-[11px]"
                style={{ background: '#FEF3C7', color: '#92400E', fontFamily: 'JetBrains Mono' }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {plan.descartadas.length > 0 && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
        >
          <h4 className="text-xs font-600 mb-1.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Filas que se descartan ({fmt(plan.descartadas.length)})
          </h4>
          <ul className="space-y-1">
            {plan.descartadas.slice(0, 6).map((d) => (
              <li
                key={`${d.fila}-${d.motivo}`}
                className="flex gap-2 text-[11px]"
                style={{ color: '#92400E', fontFamily: 'Inter' }}
              >
                <span style={{ fontFamily: 'JetBrains Mono', flexShrink: 0 }}>Fila {d.fila}</span>
                <span>— {d.motivo}</span>
              </li>
            ))}
          </ul>
          {plan.descartadas.length > 6 && (
            <p className="text-[11px] mt-1.5" style={{ color: '#92400E', fontFamily: 'Inter' }}>
              … y {fmt(plan.descartadas.length - 6)} más.
            </p>
          )}
        </div>
      )}

      {plan.advertencias.length > 0 && (
        <div
          className="rounded-xl border p-3.5"
          style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}
        >
          <h4 className="text-xs font-600 mb-1.5" style={{ color: '#475569', fontFamily: 'Inter' }}>
            Advertencias
          </h4>
          <ul className="space-y-1">
            {plan.advertencias.map((a) => (
              <li
                key={a}
                className="flex gap-2 text-[11px] leading-relaxed"
                style={{ color: '#475569', fontFamily: 'Inter' }}
              >
                <span aria-hidden>•</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className="rounded-xl border p-3.5"
        style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}
      >
        <div className="flex items-start gap-2">
          <TriangleAlert size={14} style={{ color: '#92400E', flexShrink: 0, marginTop: 1 }} />
          <p className="text-[11px] leading-relaxed" style={{ color: '#92400E', fontFamily: 'Inter' }}>
            Al confirmar se reemplaza <strong>toda</strong> la cartera: no hay períodos ni delta.
            Antes de borrar se archiva la foto actual en cartera_historial. Si la carga se corta,
            volver a subir el mismo archivo es seguro.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Paso 4: progreso ─────────────────────────────────────────────────────────

function PasoProgreso({ progreso, total }: { progreso: Progreso | null; total: number }) {
  const porcentaje =
    progreso?.total && progreso.actual !== undefined
      ? Math.round(((progreso.actual ?? 0) / progreso.total) * 100)
      : null;

  return (
    <div className="py-6 flex flex-col items-center text-center">
      <LoaderCircle size={36} className="animate-spin" style={{ color: '#1D4ED8' }} />
      <h4 className="text-sm font-600 mt-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
        {progreso ? FASE[progreso.fase] : 'Cargando…'}
      </h4>
      <p className="text-xs mt-1 max-w-sm" style={{ color: '#64748B', fontFamily: 'Inter' }}>
        {progreso?.mensaje ?? 'Preparando la carga…'}
      </p>

      <div className="w-full max-w-sm mt-5">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#E2E8F0' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: porcentaje === null ? '30%' : `${porcentaje}%`,
              background: '#1D4ED8',
              animation: porcentaje === null ? 'pulse 1.4s ease-in-out infinite' : undefined,
            }}
          />
        </div>
        <div
          className="flex justify-between text-[11px] mt-1.5"
          style={{ color: '#64748B', fontFamily: 'JetBrains Mono' }}
        >
          <span>
            {progreso?.total
              ? `${fmt(progreso.actual ?? 0)} / ${fmt(progreso.total)}`
              : `${fmt(total)} filas en total`}
          </span>
          <span>{porcentaje === null ? '…' : `${porcentaje}%`}</span>
        </div>
      </div>

      <p
        className="text-[11px] mt-5 px-3 py-1.5 rounded-lg"
        style={{ background: '#FEF3C7', color: '#92400E', fontFamily: 'Inter' }}
      >
        No cierres esta ventana hasta que termine.
      </p>
    </div>
  );
}

// ─── Paso 5: resultado ────────────────────────────────────────────────────────

function PasoResultado({
  exito,
  error,
  resultado,
}: {
  exito: boolean;
  error: string | null;
  resultado: ResultadoImportacion | null;
}) {
  const [copiado, setCopiado] = useState(false);

  if (!exito) {
    return (
      <div className="space-y-4">
        <div
          className="rounded-xl border p-4"
          style={{ borderColor: '#FECACA', background: '#FEF2F2' }}
        >
          <div className="flex items-start gap-3">
            <TriangleAlert size={20} style={{ color: '#B91C1C', flexShrink: 0 }} />
            <div>
              <h4 className="text-sm font-600" style={{ color: '#B91C1C', fontFamily: 'Outfit' }}>
                La carga no terminó
              </h4>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
                {error ?? 'Ocurrió un error inesperado durante la carga.'}
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: '#475569', fontFamily: 'Inter' }}>
          Volver a subir el mismo archivo es seguro: se reemplaza lo que había para ese archivo y no
          se duplica nada.
        </p>
      </div>
    );
  }

  if (!resultado) return null;

  // `ResultadoCartera` trae `tipo`; `ResultadoVentas` no. El `in` alcanza para
  // que TypeScript separe las dos ramas sin un campo extra.
  const esCartera = 'tipo' in resultado;
  const resumen = esCartera ? resumenCartera(resultado) : resumenVentas(resultado);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(resumen.texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4"
        style={{ borderColor: '#BBF7D0', background: '#F0FDF4' }}
      >
        <div className="flex items-start gap-3">
          <CircleCheck size={22} style={{ color: '#15803D', flexShrink: 0 }} />
          <div>
            <h4 className="text-sm font-600" style={{ color: '#15803D', fontFamily: 'Outfit' }}>
              Carga completada
            </h4>
            <p className="text-xs mt-1 leading-relaxed" style={{ color: '#15803D', fontFamily: 'Inter' }}>
              {resumen.titular}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {resumen.datos.map((d) => (
          <Dato key={d.etiqueta} etiqueta={d.etiqueta} valor={d.valor} tono={d.tono} />
        ))}
        <Dato etiqueta="Duración" valor={`${(resultado.duracionMs / 1000).toFixed(1)} s`} />
      </div>

      {resumen.detalles.length > 0 && (
        <div>
          <h4 className="text-xs font-600 mb-2" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
            {esCartera ? 'Supervisores en la nueva cartera' : 'Dimensiones creadas'}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {resumen.detalles.map((d) => (
              <span
                key={d.etiqueta}
                className="px-2 py-1 rounded text-[11px]"
                style={{ background: '#F1F5F9', color: '#475569', fontFamily: 'JetBrains Mono' }}
              >
                {d.etiqueta}: {d.valor}
              </span>
            ))}
          </div>
        </div>
      )}

      <div
        className="rounded-xl border p-3.5"
        style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}
      >
        <p className="text-[11px] leading-relaxed mb-2.5" style={{ color: '#475569', fontFamily: 'Inter' }}>
          El dashboard y las demás páginas ya se actualizaron con los datos nuevos.
          {esCartera && ' La foto anterior quedó archivada en cartera_historial.'}
        </p>
        <button
          onClick={copiar}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-500"
          style={{
            background: copiado ? '#DCFCE7' : '#EFF6FF',
            color: copiado ? '#15803D' : '#1D4ED8',
            fontFamily: 'Inter',
          }}
        >
          {copiado ? <CircleCheck size={12} /> : <FileText size={12} />}
          {copiado ? 'Resumen copiado' : 'Copiar resumen'}
        </button>
      </div>
    </div>
  );
}

type ResumenResultado = {
  titular: string;
  datos: Array<{ etiqueta: string; valor: string; tono?: 'ok' | 'alerta' }>;
  detalles: Array<{ etiqueta: string; valor: string }>;
  texto: string;
};

function resumenVentas(r: Extract<ResultadoImportacion, { ventasInsertadas: number }>): ResumenResultado {
  const creadas = Object.entries(r.dimensionesCreadas).filter(([, n]) => n > 0);
  const totalCreadas = creadas.reduce((suma, [, n]) => suma + n, 0);

  return {
    titular: `Se insertaron ${fmt(r.ventasInsertadas)} ventas en ${
      r.periodos.length === 1 ? 'el período' : 'los períodos'
    } ${r.periodos.join(', ')}.`,
    datos: [
      { etiqueta: 'Ventas insertadas', valor: fmt(r.ventasInsertadas), tono: 'ok' },
      { etiqueta: 'Períodos', valor: String(r.periodos.length) },
      { etiqueta: 'Dimensiones nuevas', valor: fmt(totalCreadas) },
    ],
    detalles: creadas.map(([tabla, n]) => ({ etiqueta: tabla, valor: fmt(n) })),
    texto: [
      'Importación de ventas — Global Pack',
      `Ventas insertadas: ${fmt(r.ventasInsertadas)}`,
      `Períodos: ${r.periodos.join(', ')}`,
      `Dimensiones nuevas: ${fmt(totalCreadas)}${creadas.length ? ` (${creadas.map(([t, n]) => `${t}: ${n}`).join(', ')})` : ''}`,
      `Duración: ${(r.duracionMs / 1000).toFixed(1)} s`,
    ].join('\n'),
  };
}

function resumenCartera(r: Extract<ResultadoImportacion, { tipo: string }>): ResumenResultado {
  const supervisores = r.supervisores.map((s) => `${s.nombre}: ${fmt(s.clientes)}`);
  const flags = r.flags.map((f) => `${f.valor}: ${fmt(f.clientes)}`);

  return {
    titular: `Se cargó la cartera con ${fmt(r.clientesCartera)} clientes. La foto anterior (${fmt(
      r.archivados,
    )} clientes) quedó archivada en cartera_historial.`,
    datos: [
      { etiqueta: 'Clientes en cartera', valor: fmt(r.clientesCartera), tono: 'ok' },
      { etiqueta: 'Clientes archivados', valor: fmt(r.archivados) },
      { etiqueta: 'Clientes nuevos', valor: fmt(r.clientesNuevos) },
      { etiqueta: 'Matriz de marcas', valor: fmt(r.filasProducto) },
      { etiqueta: 'Datos operativos', valor: fmt(r.filasOperativa) },
      { etiqueta: 'Flags de alcohol', valor: fmt(r.filasAlcohol) },
      { etiqueta: 'Encargados actualizados', valor: fmt(r.encargadosActualizados) },
      { etiqueta: 'Encargados creados', valor: fmt(r.encargadosCreados) },
    ],
    detalles: r.supervisores.map((s) => ({ etiqueta: s.nombre, valor: fmt(s.clientes) })),
    texto: [
      `Importación de cartera (promotores y supervisores) — Global Pack`,
      `Clientes en cartera: ${fmt(r.clientesCartera)}`,
      `Clientes archivados: ${fmt(r.archivados)}`,
      `Clientes nuevos: ${fmt(r.clientesNuevos)}`,
      `Supervisores: ${supervisores.join(' · ')}`,
      `Flags de alcohol: ${flags.join(' · ')}`,
      `Encargados actualizados: ${r.encargadosActualizados} · creados: ${r.encargadosCreados}`,
      `Auditoría: importación #${r.importacionId ?? 'sin registrar'}`,
      `Duración: ${(r.duracionMs / 1000).toFixed(1)} s`,
    ].join('\n'),
  };
}

// ─── Pie según paso ───────────────────────────────────────────────────────────

function PieIzquierda({
  paso,
  config,
  cargando,
  onVerPdf,
}: {
  paso: Paso;
  config: ConfigTipo | null;
  cargando: boolean;
  onVerPdf: () => void;
}) {
  if (paso === 'especificacion') {
    return (
      <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        Documento de referencia de los dos archivos.
      </span>
    );
  }

  if (paso === 'preview') {
    return (
      <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        {cargando ? 'Escribiendo en la base…' : 'Todavía no se escribió nada.'}
      </span>
    );
  }

  if (paso === 'resultado') {
    return <span />;
  }

  return (
    <button
      onClick={onVerPdf}
      className="flex items-center gap-1 text-[11px]"
      style={{ color: '#1D4ED8', fontFamily: 'Inter' }}
    >
      <FileText size={12} /> Especificación PDF
    </button>
  );
}

// ─── Piezas chicas ────────────────────────────────────────────────────────────

function BotonPrimario({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-500"
      style={{
        background: disabled ? '#E2E8F0' : '#1D4ED8',
        color: disabled ? '#94A3B8' : '#FFFFFF',
        fontFamily: 'Inter',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function BotonSecundario({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 rounded-lg text-xs font-500"
      style={{
        border: '1px solid #E2E8F0',
        color: disabled ? '#CBD5E1' : '#64748B',
        fontFamily: 'Inter',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Dato({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor: string;
  tono?: 'ok' | 'alerta';
}) {
  const color = tono === 'ok' ? '#15803D' : tono === 'alerta' ? '#B45309' : '#0F172A';
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: '#E2E8F0', background: '#FFFFFF' }}>
      <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        {etiqueta}
      </div>
      <div className="text-base font-700 mt-0.5" style={{ color, fontFamily: 'Outfit' }}>
        {valor}
      </div>
    </div>
  );
}

function Bloque({
  titulo,
  icono,
  color,
  fondo,
  borde,
  children,
}: {
  titulo: string;
  icono: ReactNode;
  color: string;
  fondo: string;
  borde: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border p-3.5" style={{ background: fondo, borderColor: borde }}>
      <div className="flex items-center gap-1.5 mb-2">
        <span style={{ color }}>{icono}</span>
        <h4 className="text-xs font-600" style={{ color, fontFamily: 'Inter' }}>
          {titulo}
        </h4>
      </div>
      {children}
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[11px]"
      style={{ background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }}
    >
      {children}
    </span>
  );
}

function pesoArchivo(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function descargarBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Especificacion-importacion-GlobalPack.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
