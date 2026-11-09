/**
 * Errores de la base traducidos a algo que el usuario pueda entender.
 *
 * Supabase devuelve el mensaje crudo de Postgres. En el plan gratuito, cuando la
 * base está ocupada —por ejemplo recién cargado un Excel de 25.000 filas— una
 * consulta pesada se corta con:
 *
 *     canceling statement due to statement timeout   (SQLSTATE 57014)
 *
 * Mostrar eso tal cual no le dice nada a nadie. Además es intermitente: la
 * misma consulta funciona segundos después. Por eso hay dos consumidores:
 * `esTimeoutDeBase` decide si vale la pena reintentar, y `mensajeDeError` decide
 * qué texto mostrar.
 */

type ErrorBase = { code?: string; message?: string; details?: string; hint?: string };

/** ¿El error es el corte por tiempo máximo de Postgres (SQLSTATE 57014)? */
export function esTimeoutDeBase(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const { code, message } = e as ErrorBase;
  if (code === '57014') return true;
  return /statement timeout|canceling statement/i.test(message ?? '');
}

/** Texto para la interfaz: reconoce el timeout y deja el resto como vino. */
export function mensajeDeError(e: unknown): string {
  if (esTimeoutDeBase(e)) {
    return 'La consulta tardó más de lo permitido por la base (suele pasar justo después de una carga grande). Probá de nuevo en unos segundos.';
  }

  if (e instanceof Error) return e.message;

  if (e && typeof e === 'object') {
    const { message, details, hint } = e as ErrorBase;
    return message || details || hint || 'Ocurrió un error inesperado.';
  }

  return String(e ?? 'Ocurrió un error inesperado.');
}
