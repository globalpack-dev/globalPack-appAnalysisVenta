/**
 * Normalización de nombres de personas para comparar entre archivos.
 *
 * El mismo supervisor aparece escrito de formas distintas según el export:
 *
 *   "FERNANDEZ EDUARDO"  (lo que ya está en la base)
 *   "EDUARDO FERNANDEZ"  (el archivo nuevo)
 *
 * Comparar por igualdad exacta crea un supervisor duplicado y deja al anterior
 * huérfano. `claveNombre` reduce los dos a la misma clave: mayúsculas, sin
 * acentos, sin espacios de más y con las palabras ordenadas.
 *
 * No se usa para mostrar nada: sólo para buscar. El nombre que se guarda es
 * siempre el del archivo (o el que ya existía en la base).
 */

/** Clave de comparación: "EDUARDO FERNANDEZ" === "FERNANDEZ EDUARDO". */
export function claveNombre(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes y diéresis
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}

/**
 * Un "sin supervisor" tiene muchas formas: "SIN SUPERVISOR", "Sin Supervisor
 * Asignado", vacío. Se unifican a un solo concepto.
 */
export function esSinSupervisor(valor: unknown): boolean {
  return /sin\s+supervisor/i.test(String(valor ?? '').trim()) || !String(valor ?? '').trim();
}

/**
 * Clave para comparar nombres de marca: "QUILMES" === "Quilmes " === "quilmes".
 *
 * A diferencia de `claveNombre`, no ordena las palabras: "RED BULL" no es lo
 * mismo que "BULL RED".
 */
export function claveMarca(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Marca existente en la base, tal como la usan la validación y la carga. */
export type MarcaBase = {
  id_marca: number;
  nombre: string;
};
