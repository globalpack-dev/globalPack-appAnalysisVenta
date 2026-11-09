/**
 * Paleta de gráficos.
 *
 * Antes estaba duplicada en Dashboard, Products y Promotores. Es una sola decisión
 * de diseño: la serie `i` de cualquier gráfico usa el color `i`.
 */
export const CHART_COLORS = [
  "#1D4ED8",
  "#7C3AED",
  "#059669",
  "#DC2626",
  "#D97706",
  "#0891B2",
  "#DB2777",
  "#65A30D",
] as const

/** Devuelve el color de la serie `i`, ciclando si hay más series que colores. */
export const colorDe = (i: number): string =>
  CHART_COLORS[i % CHART_COLORS.length]
