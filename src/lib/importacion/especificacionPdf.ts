/**
 * PDF de especificación de los dos Excel.
 *
 * Se genera en el navegador con `jsPDF`, importado de forma diferida: sólo se
 * descarga cuando alguien abre o baja el documento. Así el bundle inicial no
 * carga ~350 kB que la mayoría de las sesiones no usa.
 *
 * El contenido sale de `config.ts`, la misma fuente que usan el modal y la
 * validación. Si cambia una columna, el PDF cambia solo.
 */

import { AVISOS_GENERALES, TIPOS, type ConfigTipo } from './config';

const ANCHO = 595.28; // A4 en puntos
const ALTO = 841.89;
const MARGEN = 50;
const ANCHO_UTIL = ANCHO - MARGEN * 2;
const LIMITE = ALTO - 64;

const INK: [number, number, number] = [15, 23, 42];
const MUTED: [number, number, number] = [100, 116, 139];
const ACCENT: [number, number, number] = [29, 78, 216];
const LINEA: [number, number, number] = [226, 232, 240];
const SUAVE: [number, number, number] = [241, 245, 249];

type Doc = import('jspdf').jsPDF;

class Pintor {
  doc: Doc;
  y = MARGEN;

  constructor(doc: Doc) {
    this.doc = doc;
  }

  private espacio(alto: number): void {
    if (this.y + alto <= LIMITE) return;
    this.doc.addPage();
    this.y = MARGEN;
  }

  texto(
    contenido: string,
    opciones: {
      size?: number;
      font?: 'helvetica' | 'courier';
      style?: 'normal' | 'bold';
      color?: [number, number, number];
      x?: number;
      ancho?: number;
      salto?: number;
    } = {},
  ): void {
    const {
      size = 10,
      font = 'helvetica',
      style = 'normal',
      color = INK,
      x = MARGEN,
      ancho = ANCHO_UTIL,
      salto = 4,
    } = opciones;

    this.doc.setFont(font, style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);

    const lineas = this.doc.splitTextToSize(contenido, ancho) as string[];
    const altoLinea = size * 1.35;

    for (const linea of lineas) {
      this.espacio(altoLinea);
      this.doc.text(linea, x, this.y + size);
      this.y += altoLinea;
    }

    this.y += salto;
  }

  seccion(titulo: string): void {
    this.espacio(40);
    this.y += 6;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(13);
    this.doc.setTextColor(...INK);
    this.doc.text(titulo, MARGEN, this.y + 12);
    this.y += 20;
    this.doc.setDrawColor(...LABEL_LINEA);
    this.doc.setLineWidth(1);
    this.doc.line(MARGEN, this.y, ANCHO - MARGEN, this.y);
    this.y += 12;
  }

  subseccion(titulo: string): void {
    this.espacio(24);
    this.y += 4;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10.5);
    this.doc.setTextColor(...INK);
    this.doc.text(titulo, MARGEN, this.y + 9);
    this.y += 18;
  }

  bullets(items: string[]): void {
    for (const item of items) {
      const lineas = this.doc.splitTextToSize(item, ANCHO_UTIL - 14) as string[];
      this.espacio(lineas.length * 13.5 + 2);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text('•', MARGEN, this.y + 9);
      this.doc.setTextColor(...INK);
      for (const linea of lineas) {
        this.espacio(13.5);
        this.doc.text(linea, MARGEN + 14, this.y + 9);
        this.y += 13.5;
      }
      this.y += 2;
    }
    this.y += 4;
  }

  ficha(pares: Array<[string, string]>): void {
    const altoFila = 17;
    this.espacio(pares.length * altoFila + 8);
    const x0 = MARGEN;
    const x1 = MARGEN + 128;

    this.doc.setFillColor(...SUAVE);
    this.doc.roundedRect(x0, this.y - 2, ANCHO_UTIL, pares.length * altoFila + 6, 5, 5, 'F');

    for (const [etiqueta, valor] of pares) {
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text(etiqueta.toUpperCase(), x0 + 10, this.y + 10);

      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9.5);
      this.doc.setTextColor(...INK);
      this.doc.text(valor, x1, this.y + 10);

      this.y += altoFila;
    }
    this.y += 12;
  }

  chips(items: string[]): void {
    const size = 7.5;
    const altoChip = 14;
    const gap = 4;
    const padding = 4;
    this.doc.setFont('courier', 'normal');
    this.doc.setFontSize(size);

    let x = MARGEN;
    this.espacio(altoChip);
    this.y += 2;

    for (const item of items) {
      const ancho = this.doc.getTextWidth(item) + padding * 2;
      if (x + ancho > ANCHO - MARGEN) {
        x = MARGEN;
        this.y += altoChip + gap;
        this.espacio(altoChip + gap);
      }
      this.doc.setFillColor(...SUAVE);
      this.doc.roundedRect(x, this.y, ancho, altoChip, 3, 3, 'F');
      this.doc.setTextColor(71, 85, 105);
      this.doc.text(item, x + padding, this.y + 9.5);
      x += ancho + gap;
    }

    this.y += altoChip + 10;
  }

  pie(): void {
    const total = this.doc.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p);
      this.doc.setDrawColor(...LINEA);
      this.doc.setLineWidth(0.7);
      this.doc.line(MARGEN, ALTO - 44, ANCHO - MARGEN, ALTO - 44);

      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...MUTED);
      this.doc.text('Global Pack · Especificación de importación · v1.2', MARGEN, ALTO - 30);
      this.doc.text(`Página ${p} de ${total}`, ANCHO - MARGEN, ALTO - 30, {
        align: 'right',
      });
    }
  }
}

const LABEL_LINEA: [number, number, number] = [203, 213, 225];

function fichaDe(config: ConfigTipo): Array<[string, string]> {
  const encabezado =
    config.filaEncabezado === 1 ? 'Fila 1' : `Fila ${config.filaEncabezado}`;
  return [
    ['Archivo', config.archivo],
    ['Hoja', config.hojas.join(' / ')],
    ['Encabezado', encabezado],
    ['Filas esperadas', config.filas],
    ['Columnas obligatorias', String(config.obligatorias.length)],
    ['Columnas opcionales', String(config.opcionales.length)],
  ];
}

export async function crearEspecificacionPdf(): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const p = new Pintor(doc);

  // ── Portada ────────────────────────────────────────────────────────────────
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, ANCHO, 6, 'F');

  p.y = 78;
  p.texto('GLOBAL PACK · SISTEMA DE GESTIÓN COMERCIAL', {
    size: 8,
    style: 'bold',
    color: ACCENT,
    salto: 10,
  });
  p.texto('Especificación de importación de datos', { size: 22, style: 'bold', salto: 8 });
  p.texto('Requisitos de los archivos Excel que acepta el módulo «Cargar datos».', {
    size: 11,
    color: MUTED,
    salto: 18,
  });

  p.doc.setDrawColor(...LINEA);
  p.doc.setLineWidth(1);
  p.doc.line(MARGEN, p.y, ANCHO - MARGEN, p.y);
  p.y += 16;

  p.texto('Versión 1.2 · Octubre 2026', { size: 8.5, color: MUTED, salto: 16 });

  p.texto(
    'Este documento describe cómo tiene que estar cada uno de los dos Excel que alimentan el sistema: ' +
      'ventas y cartera. La cartera reúne promotores y supervisores en un solo archivo: son el mismo ' +
      'reporte en distinto momento, no dos cargas. Seguir estas reglas evita que la importación ' +
      'descarte filas o cargue datos incompletos.',
    { size: 10, salto: 12 },
  );

  p.seccion('Reglas generales para los dos archivos');
  p.bullets(AVISOS_GENERALES);

  p.seccion('Cómo funciona la carga');
  p.bullets([
    'El botón «Cargar datos» sólo está disponible para usuarios con rol administrador.',
    'Primero se valida el archivo completo y se muestra una vista previa. No se escribe nada en la base hasta confirmar.',
    'Ventas: se reemplazan sólo las ventas de los períodos que trae el archivo; los demás períodos no se tocan.',
    'Cartera (supervisores y promotores): la cartera se reemplaza completa, porque es una foto del archivo y no un delta.',
    'Antes de reemplazar la cartera se archiva la foto anterior en el histórico (cartera_historial). Cada carga queda registrada con quién la hizo, la fecha, el archivo y el resultado.',
    'Si una carga se corta a mitad, volver a subir el mismo archivo es seguro: no duplica datos.',
    'La aplicación no puede detectar filas que faltan por un filtro. Un Excel exportado con filtros se carga incompleto.',
  ]);

  // ── Un apartado por tipo ───────────────────────────────────────────────────
  TIPOS.forEach((config, indice) => {
    p.seccion(`${indice + 1}. Base de ${config.titulo.toLowerCase()}`);

    p.ficha(fichaDe(config));

    p.subseccion('Requisitos particulares');
    p.bullets(config.avisos);

    p.subseccion(`Columnas obligatorias (${config.obligatorias.length})`);
    p.chips(config.obligatorias);
    p.texto('Si falta alguna de estas columnas, el archivo no se puede cargar.', {
      size: 9,
      color: MUTED,
      salto: 10,
    });

    if (config.opcionales.length) {
      p.subseccion(`Columnas opcionales (${config.opcionales.length})`);
      p.chips(config.opcionales);
      p.texto('Si están, se usan; si faltan, el archivo se carga igual.', {
        size: 9,
        color: MUTED,
        salto: 10,
      });
    }

    if (config.ignoradas.length) {
      p.texto(
        `El archivo puede traer ${config.ignoradas.length} columna(s) más que no tienen destino en la base ` +
          'y se ignoran (totales, códigos internos). Cualquier otra columna desconocida se informa en la ' +
          'vista previa como «sin destino» y no se carga.',
        { size: 9, color: MUTED, salto: 10 },
      );
    }

    if (config.notaColumnas) {
      p.texto(config.notaColumnas, { size: 9, color: MUTED, salto: 10 });
    }

    p.subseccion('Qué ocurre al cargar');
    p.bullets(config.alCargar);
  });

  p.pie();

  return doc.output('blob');
}

let cache: Promise<Blob> | null = null;

/**
 * Reutiliza el PDF ya generado durante la sesión.
 *
 * Si la generación falla, se limpia el caché para que el usuario pueda
 * reintentar sin recargar la página.
 */
export function especificacionPdf(): Promise<Blob> {
  if (!cache) {
    cache = crearEspecificacionPdf().catch((error) => {
      cache = null;
      throw error;
    });
  }
  return cache;
}
