import { useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  Loader2,
  MessageCircle,
  Share2,
  Users,
  X,
} from 'lucide-react';
import { useActividadPromotor, type FilaActividad } from '../../hooks/useCartera';
import {
  DIAS,
  NOMBRE_DIA,
  diaDeHoy,
  diaDeResumen,
  diasDeVisitaTexto,
  fechaLarga,
  estadoDe,
  filtrarActividad,
  frecuenciaDe,
  paginar,
  tareasDe,
  ESTADOS_ACTIVIDAD,
  TAREAS_ACTIVIDAD,
  type Dia,
  type EstadoActividad,
  type TareaActividad,
} from '../../lib/visitas';
import EstadoDatos from './EstadoDatos';

/**
 * Resumen del día — la tarjeta que el promotor le manda al encargado.
 *
 * Tres formatos con el mismo contenido:
 *
 *   · la tarjeta de pantalla, pensada para una captura limpia (sin botones ni
 *     filtros adentro);
 *   · la imagen PNG, que se genera desde esa misma tarjeta con `html-to-image`
 *     (el navegador la dibuja, así que respeta tal cual lo que se ve);
 *   · el texto de WhatsApp, que se copia con el botón y mantiene el formato
 *     del chat (*negrita*, viñetas y saltos de línea).
 *
 * La imagen se muestra primero en un visor: en previews embebidos el navegador
 * puede bloquear la descarga automática, pero la imagen se puede guardar con
 * "mantener presionada" o desde el botón. En móviles con Web Share API hay
 * además "Compartir…", que abre el panel del sistema con el PNG adjunto.
 *
 * Qué contesta el resumen, en este orden:
 *
 *   1. a quién visitar hoy (el recorrido del día);
 *   2. quiénes de esos ya compraron;
 *   3. quiénes no compraron y qué marcas ofrecerles;
 *   4. qué tareas quedaron pendientes.
 *
 * El detalle se reparte en HOJAS de 12 clientes: nada se recorta, la tarjeta
 * no se vuelve kilométrica y cada hoja se puede mandar como una imagen. Las
 * métricas de la cabecera son siempre las del día completo; las secciones
 * (recorrido, "sin compra", "ya compraron" y tareas) muestran el trozo de la
 * hoja abierta, para que todas hablen de los mismos clientes.
 *
 * El texto de WhatsApp no se pagina: no tiene altura que cuidar, así que va
 * completo.
 */

/** Clientes por hoja. Con más de 12, la tarjeta se parte en varias imágenes. */
const TAMANO_HOJA = 12;




export default function ResumenDia({
  encargadoId,
  nombre,
  codigo,
  supervisor,
}: {
  encargadoId: number;
  nombre: string;
  codigo: string;
  supervisor: string | null;
}) {
  const { data, isPending, error } = useActividadPromotor(encargadoId);
  const [copiado, setCopiado] = useState(false);
  const [imagenes, setImagenes] = useState<string[] | null>(null);
  const [paginaVisor, setPaginaVisor] = useState(0);
  const [generando, setGenerando] = useState(false);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [errorImagen, setErrorImagen] = useState<string | null>(null);

  // Hoja que se está mirando, 1-based.
  const [pagina, setPagina] = useState(1);

  // El día del resumen. Arranca en el recorrido de hoy (lunes si hoy es
  // domingo) pero se puede cambiar: el resumen es de UN día, no de la semana.
  // Los clientes de frecuencia 2 ('LUN JUE') entran tanto el lunes como el
  // jueves porque `filtrarActividad` pregunta `visitas.includes(dia)`.
  const [dia, setDia] = useState<Dia>(() => diaDeResumen().dia);

  // Los mismos filtros que "Ver actividad": el resumen se genera sobre el
  // subconjunto elegido ("sólo los sin compra", "sólo RED BULL", ...).
  const [estado, setEstado] = useState<EstadoActividad>('todos');
  const [tarea, setTarea] = useState<TareaActividad>('todas');

  // El nodo que se convierte a PNG. Es la tarjeta, no la página: los botones y
  // las pestañas quedan afuera de la captura.
  const tarjetaRef = useRef<HTMLDivElement>(null);

  // `esHoy` se calcula contra el día elegido, no contra el día en que se abrió
  // la pantalla: si el usuario cambia a otro día, la tarjeta no puede decir
  // "(hoy)".
  const hoy = diaDeHoy();
  const esHoy = dia === hoy;
  const fecha = useMemo(() => fechaLarga(), []);
  const filas = useMemo(() => data ?? [], [data]);

  const aVisitar = useMemo(
    () => filtrarActividad(filas, { dia, estado, tarea }),
    [filas, dia, estado, tarea],
  );
  const comprados = useMemo(() => aVisitar.filter((f) => f.compro_algo), [aVisitar]);
  const sinCompra = useMemo(() => aVisitar.filter((f) => f.oportunidad), [aVisitar]);

  // Texto del filtro activo, para que la tarjeta y el mensaje digan sobre qué
  // subconjunto se generaron (si no, el encargado no sabe qué está mirando).
  const filtroTexto = useMemo(() => {
    const partes: string[] = [];
    if (estado !== 'todos') {
      partes.push(ESTADOS_ACTIVIDAD.find((e) => e.id === estado)?.nombre ?? estado);
    }
    if (tarea !== 'todas') {
      partes.push(TAREAS_ACTIVIDAD.find((t) => t.id === tarea)?.nombre ?? tarea);
    }
    return partes.join(' · ');
  }, [estado, tarea]);

  const filtroActivo = filtroTexto !== '';

  const tareas = useMemo(
    () => ({
      redbull: aVisitar.filter((f) => f.tarea_redbull).length,
      laton: aVisitar.filter((f) => f.tarea_laton).length,
      cvza: aVisitar.filter((f) => f.tarea_cvza).length,
    }),
    [aVisitar],
  );

  // ── Hojas ──────────────────────────────────────────────────────────────────
  //
  // Nada se recorta: el recorrido se parte en trozos de 12. `hojaActual` va
  // clampeada para que la página nunca apunte fuera de la lista, y el efecto
  // de abajo vuelve a la hoja 1 cuando cambia el día o un filtro — si no, te
  // quedarías mirando la hoja 2 de un subconjunto que ahora tiene una sola.
  const totalHojas = Math.max(1, Math.ceil(aVisitar.length / TAMANO_HOJA));
  const hojaActual = Math.min(pagina, totalHojas);
  const desde = (hojaActual - 1) * TAMANO_HOJA;
  const visibles = paginar(aVisitar, hojaActual, TAMANO_HOJA);
  const compradosHoja = visibles.filter((f) => f.compro_algo);
  const sinCompraHoja = visibles.filter((f) => f.oportunidad);
  const tareasHoja = {
    redbull: visibles.filter((f) => f.tarea_redbull).length,
    laton: visibles.filter((f) => f.tarea_laton).length,
    cvza: visibles.filter((f) => f.tarea_cvza).length,
  };

  useEffect(() => {
    // Cambió el día o un filtro: la paginación vuelve al principio y las
    // imágenes generadas dejan de servir (son de otro subconjunto).
    setPagina(1);
    setImagenes(null);
    setPaginaVisor(0);
  }, [dia, estado, tarea]);

  const texto = useMemo(
    () =>
      armarTexto({
        nombre,
        codigo,
        supervisor,
        fecha,
        etiquetaDia: `${NOMBRE_DIA[dia]}${esHoy ? ' (hoy)' : ''}`,
        filtro: filtroTexto || null,
        aVisitar,
        comprados,
        sinCompra,
        tareas,
      }),
    [nombre, codigo, supervisor, fecha, dia, esHoy, filtroTexto, aVisitar, comprados, sinCompra, tareas],
  );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Fallback para navegadores sin permiso de clipboard (o contextos no
      // seguros): un textarea temporal y `execCommand`.
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  }

  /**
   * Nombre del PNG: sin acentos ni espacios, con la fecha del día y el número
   * de hoja cuando hay más de una (`...-1de3.png`).
   */
  const nombreArchivo = useMemo(() => {
    const slug = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const fecha = new Date().toISOString().slice(0, 10);
    return (n: number, total: number) =>
      total > 1
        ? `resumen-${slug}-${fecha}-${n}de${total}.png`
        : `resumen-${slug}-${fecha}.png`;
  }, [nombre]);

  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /**
   * Dibuja la tarjeta en un canvas y devuelve un PNG en base64.
   *
   * `pixelRatio: 2` es lo que hace que no salga borroso al abrirlo en el
   * teléfono. Si el navegador no deja embeber las fuentes (CORS), se reintenta
   * sin embeberlas: la pantalla ya las tiene cargadas, así que el resultado se
   * ve igual.
   */
  async function generarImagen(): Promise<string | null> {
    const nodo = tarjetaRef.current;
    if (!nodo) return null;

    // El tamaño sale del borde real (`getBoundingClientRect`), no de
    // `clientWidth`: éste trunca los fraccionales y no incluye el borde. Un
    // canvas más chico que la tarjeta recorta el borde derecho.
    const caja = nodo.getBoundingClientRect();

    const opciones = {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#F8FAFC',
      width: Math.ceil(caja.width),
      height: Math.ceil(caja.height),
      // `html-to-image` copia el `cssText` computado al clon, y con `mx-auto`
      // eso incluye `margin-left/right` ya resueltos a px. El clon arrancaba
      // corrido a la derecha dentro del canvas y se cortaba la última columna
      // de las métricas ("Con tarea"). `style` se aplica después de copiar los
      // estilos, así que anula esos márgenes.
      style: { margin: '0' },
    };

    try {
      return await toPng(nodo, opciones);
    } catch {
      return await toPng(nodo, { ...opciones, skipFonts: true });
    }
  }

  /**
   * Espera a que React pinte la hoja nueva antes de capturarla. Dos
   * `requestAnimationFrame` aseguran que el DOM ya se actualizó; el timeout
   * corto le da tiempo a las fuentes y a los ajustes de layout.
   */
  function esperarRender(): Promise<void> {
    return new Promise((resolver) => {
      requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolver, 40)));
    });
  }

  /**
   * Genera una imagen por hoja, recorriendo la tarjeta: pone la hoja 1,
   * espera el render, captura, pasa a la hoja 2… Al final devuelve la tarjeta
   * a la hoja donde estaba el usuario, para que no quede "saltando".
   */
  async function generarImagenes(): Promise<string[]> {
    const hojaPrevia = hojaActual;
    const resultado: string[] = [];
    try {
      for (let n = 1; n <= totalHojas; n++) {
        setProgreso(`Generando ${n} de ${totalHojas}…`);
        setPagina(n);
        await esperarRender();
        const dataUrl = await generarImagen();
        if (dataUrl) resultado.push(dataUrl);
      }
    } finally {
      setPagina(hojaPrevia);
      setProgreso(null);
      await esperarRender();
    }
    return resultado;
  }

  async function abrirImagenes() {
    setGenerando(true);
    setErrorImagen(null);
    try {
      const urls = await generarImagenes();
      if (urls.length > 0) {
        setImagenes(urls);
        setPaginaVisor(0);
      }
    } catch (e) {
      setErrorImagen(mensajeDeError(e));
    } finally {
      setGenerando(false);
    }
  }

  /**
   * Descarga cada hoja con una espera entre una y otra: si se disparan todas
   * en el mismo instante, el navegador descarta las siguientes.
   */
  function descargarTodas() {
    if (!imagenes) return;
    imagenes.forEach((url, i) => {
      window.setTimeout(() => {
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombreArchivo(i + 1, imagenes.length);
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
      }, i * 400);
    });
  }

  async function compartir() {
    setGenerando(true);
    setErrorImagen(null);
    try {
      const urls = imagenes ?? (await generarImagenes());
      if (urls.length === 0) return;
      setImagenes(urls);
      const archivos = await Promise.all(
        urls.map(async (url, i) => {
          const blob = await (await fetch(url)).blob();
          return new File([blob], nombreArchivo(i + 1, urls.length), { type: 'image/png' });
        }),
      );
      if (navigator.canShare?.({ files: archivos })) {
        // Las N hojas van juntas al panel del sistema: el promotor elige
        // WhatsApp una sola vez y se adjuntan todas.
        await navigator.share({ files: archivos, title: `Resumen del día · ${nombre}` });
      } else {
        setErrorImagen(
          'Este navegador no permite compartir archivos. Descargá las imágenes y adjuntalas en WhatsApp.',
        );
      }
    } catch (e) {
      // Cancelar el panel de compartir no es un error.
      if ((e as DOMException)?.name !== 'AbortError') setErrorImagen(mensajeDeError(e));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Barra de acción, FUERA de la tarjeta para que la captura quede limpia */}
      <div className="flex items-center justify-between gap-3 flex-wrap max-w-[860px] mx-auto w-full">
        <div>
          <h3 className="font-display font-700 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Resumen del día
          </h3>
          <p className="text-[11px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Mandalo como imagen o como texto. La imagen sale de esta misma tarjeta.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <BotonSecundario
            onClick={abrirImagenes}
            disabled={aVisitar.length === 0 || generando}
          >
            {generando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {generando ? (progreso ?? 'Generando…') : 'Ver imagen'}
          </BotonSecundario>

          {puedeCompartir && (
            <BotonSecundario onClick={compartir} disabled={aVisitar.length === 0 || generando}>
              <Share2 size={14} /> Compartir
            </BotonSecundario>
          )}

          <button
            onClick={copiar}
            disabled={aVisitar.length === 0}
            className="inline-flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg font-600 transition-all disabled:opacity-40"
            style={{
              background: copiado ? '#047857' : '#128C7E',
              color: '#fff',
              fontFamily: 'Outfit',
            }}
          >
            {copiado ? <Check size={14} /> : <Copy size={14} />}
            {copiado ? 'Copiado' : 'Copiar para WhatsApp'}
          </button>
        </div>
      </div>

      {/* Filtros: la tarjeta y el mensaje se generan sobre este subconjunto */}
      <div
        className="max-w-[860px] mx-auto w-full bg-white rounded-xl border p-4"
        style={{ borderColor: '#E2E8F0' }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <CampoResumen etiqueta="DÍA">
            <select
              value={dia}
              onChange={(e) => setDia(e.target.value as Dia)}
              className="text-xs rounded-lg border px-2.5 py-1.5 outline-none"
              style={{ borderColor: '#E2E8F0', color: '#0F172A', fontFamily: 'Inter', background: '#fff' }}
            >
              {DIAS.map((d) => (
                <option key={d} value={d}>
                  {NOMBRE_DIA[d]}
                  {hoy === d ? ' · hoy' : ''}
                </option>
              ))}
            </select>
          </CampoResumen>

          <CampoResumen etiqueta="ESTADO">
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
          </CampoResumen>

          <CampoResumen etiqueta="TAREA">
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
          </CampoResumen>

          {filtroActivo && (
            <button
              onClick={() => {
                setEstado('todos');
                setTarea('todas');
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border"
              style={{ borderColor: '#E2E8F0', color: '#64748B', fontFamily: 'Inter' }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        <div className="text-[11px] mt-3" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          {aVisitar.length} cliente{aVisitar.length === 1 ? '' : 's'} en el resumen
          {` · recorrido de ${NOMBRE_DIA[dia]}`}
          {filtroActivo ? ` · filtro: ${filtroTexto}` : ''}
        </div>
      </div>

      <EstadoDatos cargando={isPending} error={error}>
        {/* ── Tarjeta para captura ─────────────────────────────────────────── */}
        <div
          ref={tarjetaRef}
          className="max-w-[860px] mx-auto bg-white rounded-2xl overflow-hidden"
          style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
        >
          {/* Cabecera */}
          <div className="px-6 pt-6 pb-5" style={{ background: '#0F172A' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div
                  className="text-[10px] font-600 mb-1"
                  style={{ color: '#93C5FD', fontFamily: 'Outfit', letterSpacing: '0.08em' }}
                >
                  GLOBAL PACK · RESUMEN DEL DÍA
                </div>
                <div className="font-display font-700 text-xl" style={{ color: '#fff', fontFamily: 'Outfit' }}>
                  {nombre}
                </div>
                <div className="text-[11px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                  Promotor {codigo}
                  {supervisor ? ` · Supervisor: ${supervisor}` : ''}
                </div>
                {totalHojas > 1 && (
                  <div
                    className="text-[10px] mt-1 font-600"
                    style={{ color: '#93C5FD', fontFamily: 'Inter', letterSpacing: '0.02em' }}
                  >
                    Hoja {hojaActual} de {totalHojas}
                  </div>
                )}
                {filtroActivo && (
                  <div
                    className="inline-block mt-2 text-[9px] px-2 py-0.5 rounded font-600"
                    style={{ background: '#1E293B', color: '#FCD34D', fontFamily: 'Inter' }}
                  >
                    Filtro: {filtroTexto}
                  </div>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[11px] font-600" style={{ color: '#fff', fontFamily: 'Inter' }}>
                  {NOMBRE_DIA[dia]}
                </div>
                <div className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                  {fecha}
                </div>
                {!esHoy && (
                  <div
                    className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded"
                    style={{ background: '#1E293B', color: '#93C5FD', fontFamily: 'Inter' }}
                  >
                    recorrido programado
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mini métricas */}
          <div className="grid grid-cols-4 divide-x" style={{ borderColor: '#F1F5F9' }}>
            {[
              { label: 'A visitar', value: aVisitar.length, color: '#1D4ED8' },
              { label: 'Ya compraron', value: comprados.length, color: '#047857' },
              { label: 'Sin compra', value: sinCompra.length, color: '#B45309' },
              { label: 'Con tarea', value: aVisitar.filter((f) => tareasDe(f).length > 0).length, color: '#6D28D9' },
            ].map((k) => (
              <div key={k.label} className="px-5 py-4" style={{ borderColor: '#F1F5F9' }}>
                <div className="font-display font-700 text-lg" style={{ color: k.color, fontFamily: 'Outfit' }}>
                  {k.value}
                </div>
                <div className="text-[10px] mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                  {k.label}
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Recorrido del día */}
            <section>
              <Titulo icono={<Users size={12} />}>
                {filtroActivo ? 'Según el filtro' : 'A visitar hoy'} · {aVisitar.length}{' '}
                cliente{aVisitar.length === 1 ? '' : 's'}
              </Titulo>
              {aVisitar.length === 0 ? (
                <p className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                  {filtroActivo
                    ? 'Ningún cliente del recorrido coincide con el filtro.'
                    : `No hay clientes programados para ${NOMBRE_DIA[dia]}.`}
                </p>
              ) : (
                <>
                  {totalHojas > 1 && (
                    <p className="text-[9px] mb-1.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                      Mostrando {desde + 1}–{desde + visibles.length} de {aVisitar.length}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {visibles.map((f) => (
                      <FilaResumen key={f.codigo_cliente} fila={f} />
                    ))}
                  </div>
                </>
              )}

              {/* Nombres de los que ya compraron en esta hoja: el total del día
                  está en la métrica de arriba. Con el filtro "ya compró" la
                  lista ya los muestra, así que no se repiten. */}
              {compradosHoja.length > 0 && estado !== 'compro' && (
                <p className="text-[10px] mt-2 leading-relaxed" style={{ color: '#047857', fontFamily: 'Inter' }}>
                  <strong>
                    Ya compraron en esta hoja ({compradosHoja.length} de {comprados.length}):
                  </strong>{' '}
                  {compradosHoja.map((f) => f.nombre_fantasia || f.razon_social).join(' · ')}
                </p>
              )}
            </section>

            {/* Recomendación: sin compra de esta hoja */}
            {sinCompraHoja.length > 0 && (
              <section>
                <Titulo icono={<MessageCircle size={12} />}>
                  Sin compra · para ofrecer
                  {totalHojas > 1 ? ` · ${sinCompraHoja.length} en esta hoja` : ''}
                </Titulo>
                <div className="space-y-1.5">
                  {sinCompraHoja.map((f) => (
                    <FilaRecomendado key={f.codigo_cliente} fila={f} />
                  ))}
                </div>
              </section>
            )}

            {/* Tareas de esta hoja */}
            {(tareasHoja.redbull > 0 || tareasHoja.laton > 0 || tareasHoja.cvza > 0) && (
              <section>
                <Titulo icono={<ClipboardList size={12} />}>
                  {totalHojas > 1 ? 'Tareas pendientes · esta hoja' : 'Tareas pendientes del día'}
                </Titulo>
                <div className="flex flex-wrap gap-2">
                  {[
                    { nombre: 'RED BULL', n: tareasHoja.redbull },
                    { nombre: 'LATÓN QUILMES', n: tareasHoja.laton },
                    { nombre: 'CVZA', n: tareasHoja.cvza },
                  ]
                    .filter((t) => t.n > 0)
                    .map((t) => (
                      <span
                        key={t.nombre}
                        className="text-[10px] px-2 py-1 rounded-md font-600"
                        style={{ background: '#F5F3FF', color: '#6D28D9', fontFamily: 'Outfit' }}
                      >
                        {t.nombre} · {t.n}
                      </span>
                    ))}
                </div>
              </section>
            )}
          </div>

          <div
            className="px-6 py-3 text-[9px] flex items-center justify-between"
            style={{ background: '#F8FAFC', borderTop: '1px solid #F1F5F9', color: '#94A3B8', fontFamily: 'Inter' }}
          >
            <span>Global Pack · actividad del promotor</span>
            <span>
              {NOMBRE_DIA[dia]}
              {esHoy ? ' (hoy)' : ''} · {fecha}
            </span>
          </div>
        </div>

        {/* Paginación de hojas: fuera de la tarjeta para que no entre en la
            captura. */}
        {totalHojas > 1 && (
          <div className="max-w-[860px] mx-auto w-full flex items-center justify-center gap-3">
            <BotonHoja
              etiqueta="Hoja anterior"
              onClick={() => setPagina(Math.max(1, hojaActual - 1))}
              disabled={generando || hojaActual === 1}
            >
              <ChevronLeft size={14} />
            </BotonHoja>
            <span className="text-[11px] font-600" style={{ color: '#475569', fontFamily: 'Outfit' }}>
              Hoja {hojaActual} de {totalHojas}
            </span>
            <BotonHoja
              etiqueta="Hoja siguiente"
              onClick={() => setPagina(Math.min(totalHojas, hojaActual + 1))}
              disabled={generando || hojaActual === totalHojas}
            >
              <ChevronRight size={14} />
            </BotonHoja>
          </div>
        )}
      </EstadoDatos>

      {/* Visor de las imágenes generadas (una por hoja) */}
      {imagenes && imagenes.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.65)' }}
          onClick={() => setImagenes(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[560px] max-h-[92vh] overflow-auto p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-display font-700 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
                  {imagenes.length > 1
                    ? `Imágenes del resumen · hoja ${paginaVisor + 1} de ${imagenes.length}`
                    : 'Imagen del resumen'}
                </h4>
                <p className="text-[10px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                  {nombreArchivo(paginaVisor + 1, imagenes.length)}
                </p>
              </div>
              <button
                onClick={() => setImagenes(null)}
                className="p-1.5 rounded-lg"
                style={{ color: '#64748B', background: '#F1F5F9' }}
                aria-label="Cerrar"
              >
                <X size={14} />
              </button>
            </div>

            <img
              src={imagenes[paginaVisor]}
              alt={`Resumen del día de ${nombre}, hoja ${paginaVisor + 1}`}
              className="w-full rounded-lg"
              style={{ border: '1px solid #E2E8F0' }}
            />

            {imagenes.length > 1 && (
              <>
                <div className="flex items-center justify-center gap-3">
                  <BotonHoja
                    etiqueta="Hoja anterior"
                    onClick={() => setPaginaVisor(Math.max(0, paginaVisor - 1))}
                    disabled={paginaVisor === 0}
                  >
                    <ChevronLeft size={14} />
                  </BotonHoja>
                  <span
                    className="text-[11px] font-600"
                    style={{ color: '#475569', fontFamily: 'Outfit' }}
                  >
                    {paginaVisor + 1} / {imagenes.length}
                  </span>
                  <BotonHoja
                    etiqueta="Hoja siguiente"
                    onClick={() => setPaginaVisor(Math.min(imagenes.length - 1, paginaVisor + 1))}
                    disabled={paginaVisor === imagenes.length - 1}
                  >
                    <ChevronRight size={14} />
                  </BotonHoja>
                </div>

                {/* Miniaturas para saltar de hoja */}
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  {imagenes.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setPaginaVisor(i)}
                      aria-label={`Ver hoja ${i + 1}`}
                      className="rounded overflow-hidden"
                      style={{
                        border: i === paginaVisor ? '2px solid #1D4ED8' : '1px solid #E2E8F0',
                      }}
                    >
                      <img
                        src={url}
                        alt={`Hoja ${i + 1}`}
                        className="w-14 h-20 object-cover object-top"
                      />
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="text-[11px]" style={{ color: '#64748B', fontFamily: 'Inter' }}>
              En el celular podés mantener presionada la imagen para guardarla. En la
              computadora, usá los botones.
            </p>

            {errorImagen && (
              <p className="text-[11px]" style={{ color: '#B45309', fontFamily: 'Inter' }}>
                {errorImagen}
              </p>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={imagenes[paginaVisor]}
                download={nombreArchivo(paginaVisor + 1, imagenes.length)}
                className="inline-flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg font-600"
                style={{ background: '#1D4ED8', color: '#fff', fontFamily: 'Outfit' }}
              >
                <Download size={14} /> Descargar PNG
              </a>
              {imagenes.length > 1 && (
                <BotonSecundario onClick={descargarTodas} disabled={generando}>
                  <Download size={14} /> Descargar todas
                </BotonSecundario>
              )}
              {puedeCompartir && (
                <BotonSecundario onClick={compartir} disabled={generando}>
                  {generando ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
                  Compartir…
                </BotonSecundario>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

/** Etiqueta + control de la fila de filtros. */
function CampoResumen({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
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

/** Botón secundario de la barra de acciones (borde, fondo blanco). */
function BotonSecundario({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 text-xs px-3.5 py-2 rounded-lg font-600 border transition-all disabled:opacity-40"
      style={{
        background: '#fff',
        borderColor: '#E2E8F0',
        color: '#334155',
        fontFamily: 'Outfit',
      }}
    >
      {children}
    </button>
  );
}

/** Botón cuadrado para pasar de hoja (en la tarjeta y en el visor). */
function BotonHoja({
  etiqueta,
  onClick,
  disabled,
  children,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      className="p-1.5 rounded-lg border transition-all disabled:opacity-30"
      style={{ background: '#fff', borderColor: '#E2E8F0', color: '#334155' }}
    >
      {children}
    </button>
  );
}

/** Mensaje legible para los errores del canvas. */
function mensajeDeError(e: unknown): string {
  const detalle = e instanceof Error ? e.message : String(e);
  return `No se pudo generar la imagen (${detalle}). Probá de nuevo o usá "Copiar para WhatsApp".`;
}

function Titulo({ icono, children }: { icono: React.ReactNode; children: React.ReactNode }) {
  return (
    <h4
      className="flex items-center gap-1.5 text-[11px] font-600 mb-2"
      style={{ color: '#334155', fontFamily: 'Outfit' }}
    >
      <span style={{ color: '#1D4ED8' }}>{icono}</span>
      {children}
    </h4>
  );
}

/**
 * Colores y etiquetas por estado, para que la tarjeta y "Ver actividad" se
 * lean igual. El punto rojo es una baja y el celeste, consumo propio.
 */
const ESTADO_ESTILO: Record<
  ReturnType<typeof estadoDe>,
  { punto: string; fondo: string; texto: string; etiqueta: string }
> = {
  baja: { punto: '#DC2626', fondo: '#FEF2F2', texto: '#B91C1C', etiqueta: 'Baja' },
  consumo: { punto: '#0284C7', fondo: '#F0F9FF', texto: '#0369A1', etiqueta: 'Consumo' },
  oportunidad: { punto: '#D97706', fondo: '#FFFBEB', texto: '#B45309', etiqueta: 'Sin compra' },
  compro: { punto: '#047857', fondo: '#ECFDF5', texto: '#047857', etiqueta: 'Compró' },
  sin_marcas: { punto: '#CBD5E1', fondo: '#F1F5F9', texto: '#64748B', etiqueta: 'Sin marcas' },
};

function FilaResumen({ fila }: { fila: FilaActividad }) {
  const tareas = tareasDe(fila);
  const estilo = ESTADO_ESTILO[estadoDe(fila)];
  return (
    <div className="flex items-start gap-2 py-1" style={{ borderBottom: '1px solid #F8FAFC' }}>
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
        style={{ background: estilo.punto }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-500 truncate" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
          {fila.nombre_fantasia || fila.razon_social}
        </div>
        <div className="text-[9px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          {fila.localidad_nombre ?? '—'}
          {tareas.length > 0 ? ` · ${tareas.join(' · ')}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <TagFrecuencia fila={fila} />
        <span
          className="text-[9px] px-1.5 py-0.5 rounded font-600"
          style={{ background: estilo.fondo, color: estilo.texto, fontFamily: 'Inter' }}
        >
          {estilo.etiqueta}
        </span>
      </div>
    </div>
  );
}

/**
 * Distintivo de los clientes de frecuencia 2 (visitan dos días por semana,
 * ej. lunes y jueves). Los de frecuencia 1 no llevan distintivo: son la
 * mayoría y agregarían ruido.
 */
function TagFrecuencia({ fila }: { fila: FilaActividad }) {
  const frecuencia = frecuenciaDe(fila);
  if (frecuencia <= 1) return null;
  return (
    <span
      className="text-[9px] px-1.5 py-0.5 rounded font-600 whitespace-nowrap"
      style={{ background: '#F5F3FF', color: '#6D28D9', fontFamily: 'Inter' }}
      title={`Visita dos días por semana: ${diasDeVisitaTexto(fila)}`}
    >
      {frecuencia}x · {diasDeVisitaTexto(fila)}
    </span>
  );
}

function FilaRecomendado({ fila }: { fila: FilaActividad }) {
  return (
    <div className="flex items-start gap-2 py-1" style={{ borderBottom: '1px solid #F8FAFC' }}>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-500 truncate" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
          {fila.nombre_fantasia || fila.razon_social}
        </div>
        <div className="text-[9px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          {fila.localidad_nombre ?? '—'}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 justify-end max-w-[260px]">
        <TagFrecuencia fila={fila} />
        {(fila.faltantes.length > 0 ? fila.faltantes : ['ofrecer catálogo']).slice(0, 4).map((m) => (
          <span
            key={m}
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: '#FFFBEB', color: '#B45309', fontFamily: 'Inter' }}
          >
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Texto de WhatsApp ────────────────────────────────────────────────────────

function armarTexto({
  nombre,
  codigo,
  supervisor,
  fecha,
  etiquetaDia,
  filtro,
  aVisitar,
  comprados,
  sinCompra,
  tareas,
}: {
  nombre: string;
  codigo: string;
  supervisor: string | null;
  fecha: string;
  etiquetaDia: string;
  filtro: string | null;
  aVisitar: FilaActividad[];
  comprados: FilaActividad[];
  sinCompra: FilaActividad[];
  tareas: { redbull: number; laton: number; cvza: number };
}): string {
  const lineas: string[] = [];

  lineas.push('*GLOBAL PACK · RESUMEN DEL DÍA*');
  lineas.push(`*${nombre}* (Promotor ${codigo})`);
  if (supervisor) lineas.push(`Supervisor: ${supervisor}`);
  lineas.push(fecha);
  if (filtro) lineas.push(`*Filtro aplicado:* ${filtro}`);
  lineas.push('');

  lineas.push(`*Recorrido: ${etiquetaDia} · ${aVisitar.length} clientes*`);
  for (const f of aVisitar) {
    const est = estadoDe(f);
    const estado =
      est === 'baja'
        ? 'BAJA'
        : est === 'consumo'
          ? 'consumo propio'
          : est === 'oportunidad'
            ? 'SIN COMPRA'
            : est === 'compro'
              ? 'ya compró'
              : 'sin marcas';
    const t = tareasDe(f);
    // Los de frecuencia 2 se aclaran: el encargado tiene que saber que ese
    // cliente va dos veces por semana.
    const frecuencia = frecuenciaDe(f) > 1 ? ` · 2x: ${diasDeVisitaTexto(f)}` : '';
    lineas.push(
      `• ${f.nombre_fantasia || f.razon_social}${f.localidad_nombre ? ` (${f.localidad_nombre})` : ''} — ${estado}${t.length ? ` · tarea: ${t.join(', ')}` : ''}${frecuencia}`,
    );
  }
  lineas.push('');

  if (comprados.length > 0) {
    lineas.push(`*Ya compraron (${comprados.length}):*`);
    lineas.push(comprados.map((f) => f.nombre_fantasia || f.razon_social).join(' · '));
    lineas.push('');
  }

  if (sinCompra.length > 0) {
    lineas.push(`*Sin compra (${sinCompra.length}) — para ofrecer:*`);
    for (const f of sinCompra) {
      const faltan = f.faltantes.length > 0 ? f.faltantes.slice(0, 3).join(', ') : 'catálogo';
      const frecuencia = frecuenciaDe(f) > 1 ? ` · 2x: ${diasDeVisitaTexto(f)}` : '';
      lineas.push(`• ${f.nombre_fantasia || f.razon_social} → ${faltan}${frecuencia}`);
    }
    lineas.push('');
  }

  if (tareas.redbull + tareas.laton + tareas.cvza > 0) {
    lineas.push('*Tareas pendientes del día:*');
    if (tareas.redbull > 0) lineas.push(`• RED BULL: ${tareas.redbull}`);
    if (tareas.laton > 0) lineas.push(`• LATÓN QUILMES: ${tareas.laton}`);
    if (tareas.cvza > 0) lineas.push(`• CVZA: ${tareas.cvza}`);
    lineas.push('');
  }

  lineas.push('_Generado desde Global Pack_');

  return lineas.join('\n');
}
