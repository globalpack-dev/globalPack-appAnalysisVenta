import { toPng } from 'html-to-image';

/**
 * Captura de un nodo del DOM como PNG.
 *
 * Ya hay tres lugares que necesitan mandar algo por WhatsApp (Resumen del día,
 * historial de Cargas y ahora Reportes). Este módulo junta lo que se repetía:
 *
 *   · `pixelRatio: 2` para que no salga borroso en el teléfono.
 *   · el tamaño sale del borde real (`getBoundingClientRect`), no de
 *     `clientWidth`: éste trunca los fraccionales y no incluye el borde, y el
 *     canvas recorta el margen derecho.
 *   · `style: { margin: '0' }` anula los márgenes ya resueltos a px que
 *     `html-to-image` copia al clon (con `mx-auto` la imagen salía corrida).
 *   · si el navegador bloquea las fuentes por CORS, se reintenta con
 *     `skipFonts`: en pantalla ya están cargadas y el resultado se ve igual.
 */
export async function capturarPng(nodo: HTMLElement): Promise<string> {
  const caja = nodo.getBoundingClientRect();

  const opciones = {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#FFFFFF',
    width: Math.ceil(caja.width),
    height: Math.ceil(caja.height),
    style: { margin: '0' },
  };

  try {
    return await toPng(nodo, opciones);
  } catch {
    return await toPng(nodo, { ...opciones, skipFonts: true });
  }
}

/** Fuerza la descarga de un data URL. */
export function descargarPng(dataUrl: string, nombre: string): void {
  const enlace = document.createElement('a');
  enlace.href = dataUrl;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}

/**
 * Abre el panel de compartir del sistema con la imagen adjunta.
 *
 * Devuelve `'sin-soporte'` cuando el navegador no permite compartir archivos
 * (pasa en escritorio con Chrome/Firefox): ahí el que llama ofrece descargarla.
 * Cancelar el panel no es un error: se ignora `AbortError`.
 */
export async function compartirPng(
  dataUrl: string,
  nombre: string,
  titulo: string,
): Promise<'compartido' | 'sin-soporte'> {
  const blob = await (await fetch(dataUrl)).blob();
  const archivo = new File([blob], nombre, { type: 'image/png' });

  if (!navigator.canShare?.({ files: [archivo] })) return 'sin-soporte';

  await navigator.share({ files: [archivo], title: titulo });
  return 'compartido';
}

/** Nombre de archivo seguro: sin espacios, acentos ni caracteres raros. */
export function nombreDeArchivo(base: string, fecha = new Date()): string {
  const limpio = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const sello = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(
    fecha.getDate(),
  ).padStart(2, '0')}`;
  return `${limpio || 'reporte'}-${sello}.png`;
}
