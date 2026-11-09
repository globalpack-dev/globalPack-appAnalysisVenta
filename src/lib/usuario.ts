/**
 * Utilidades del usuario conectado.
 */

/**
 * Iniciales para el avatar.
 *
 * Antes el avatar decía "AP" hardcodeado, de "Admin Principal". Con datos reales
 * hay que derivarlas del nombre.
 *
 * Caso especial que importa hoy: mientras `empleados.nombre` sea igual al email
 * (porque el trigger cae al email cuando no hay nombre en la metadata), un
 * `nombre` de "admin@globalpack.com.ar" daría iniciales "AG", que no significan
 * nada. Por eso se descarta el dominio.
 */
export function inicialesDe(nombre: string | null | undefined, email?: string | null): string {
  const fuente = nombre?.trim();

  // Si el nombre es en realidad el email, se usan las palabras del nombre de la
  // cuenta antes del "@": "admin" -> "A", "supervisor1" -> "S".
  if (!fuente || (email && fuente.toLowerCase() === email.toLowerCase())) {
    const prefijo = (email ?? fuente ?? '').split('@')[0] ?? '';
    const palabras = prefijo.split(/[\s._-]+/).filter(Boolean);
    if (palabras.length === 0) return '?';
    if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
    return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
  }

  const palabras = fuente.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
  return (palabras[0][0] + palabras[palabras.length - 1][0]).toUpperCase();
}

/** Nombre para mostrar. Si es el email, se usa la parte antes del "@". */
export function nombreAMostrar(nombre: string | null | undefined, email?: string | null): string {
  const fuente = nombre?.trim();
  if (!fuente) return email ?? 'Usuario';
  if (email && fuente.toLowerCase() === email.toLowerCase()) {
    return fuente.split('@')[0];
  }
  return fuente;
}

/** Etiqueta del rol, para mostrarla en el perfil. */
export function etiquetaDeRol(rol: 'admin' | 'consulta'): string {
  return rol === 'admin' ? 'Administrador' : 'Consulta';
}