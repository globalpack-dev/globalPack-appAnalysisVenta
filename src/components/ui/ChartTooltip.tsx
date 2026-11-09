import { fmtPesos, fmtNum } from "../../lib/format"

/**
 * Tooltip compartido de los gráficos Recharts.
 *
 * Estaba duplicado en 6 páginas (Dashboard, Customers, Products, Brands, Promotores,
 * Marketing) con dos variantes: una que muestra el punto de color y el nombre de la
 * serie, y otra que muestra sólo el valor.
 *
 * Recharts no exporta los tipos de las props de `<Tooltip content={…}>`, por eso
 * `any` es inevitable acá. La lógica interna sí está tipada.
 */

type Entrada = {
  name?: string | number
  value?: number | string
  color?: string
  fill?: string
  payload?: unknown
}

type Props = {
  active?: boolean
  payload?: Entrada[]
  label?: string | number
  /**
   * Muestra el punto de color y el nombre de la serie. El comportamiento por
   * defecto de Dashboard; el resto de las páginas sólo muestra el valor.
   */
  mostrarSerie?: boolean
}

/** Umbral a partir del cual un valor se muestra como pesos compactos. */
const UMBRAL_PESOS = 10_000

function formatearValor(valor: number | string | undefined): string {
  if (typeof valor === "number") {
    return valor > UMBRAL_PESOS ? fmtPesos(valor) : fmtNum(valor)
  }
  return valor == null ? "—" : String(valor)
}

export default function ChartTooltip({
  active,
  payload,
  label,
  mostrarSerie,
}: Props) {
  if (!active || !payload?.length) return null

  return (
    <div
      className="bg-white border rounded-lg shadow-lg px-3 py-2 text-xs"
      style={{ borderColor: "#E2E8F0" }}
    >
      {label != null && (
        <div
          className="font-600 mb-1"
          style={{ fontFamily: "Outfit", color: "#0F172A" }}
        >
          {label}
        </div>
      )}
      {payload.map((entrada, i) => (
        <div
          key={i}
          className={mostrarSerie ? "flex items-center gap-2" : undefined}
          style={{ fontFamily: "JetBrains Mono", color: "#0F172A" }}
        >
          {mostrarSerie && (
            <>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: entrada.color ?? entrada.fill }}
              />
              <span style={{ color: "#64748B" }}>{entrada.name}:</span>
            </>
          )}
          <span className={mostrarSerie ? "font-500" : undefined}>
            {formatearValor(entrada.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
