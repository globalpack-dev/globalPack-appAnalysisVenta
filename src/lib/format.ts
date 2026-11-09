/**
 * Formateadores compartidos.
 *
 * Estas funciones son puras: no son datos, no van a la base y no deben convertirse
 * en hooks. Si se volvieran asíncronas, cada cifra de la app dependería de una
 * request y el JSX quedaría ilegible.
 */

/** Formatea pesos de forma compacta: $145.7M / $987K / $1.234 */
export const fmtPesos = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n.toLocaleString("es-AR")}`
}

/** Formatea un número con separador de miles argentino. */
export const fmtNum = (n: number): string => n.toLocaleString("es-AR")
