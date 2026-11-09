/**
 * Badge de estado.
 *
 * Reemplaza los dos `statusCfg` duplicados que tenía cada página:
 * - `Sales.tsx`: etiqueta de canal, sin texto dentro del config
 * - `Customers.tsx`: estado Activo/Inactivo, con el texto dentro del config
 *
 * Antes cada página definía su propio objeto `{ bg, color }` y escribía el `<span>`
 * a mano. Ahora el marcado vive acá.
 */

type Tamano = 'sm' | 'md';

type Props = {
  label: string;
  bg: string;
  color: string;
  /** `sm` es el chip compacto de la tabla de ventas; `md`, el badge redondeado. */
  tamano?: Tamano;
};

const CLASES: Record<Tamano, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 rounded',
  md: 'text-[11px] px-2 py-0.5 rounded-full',
};

export default function StatusBadge({ label, bg, color, tamano = 'md' }: Props) {
  return (
    <span
      className={`font-500 ${CLASES[tamano]}`}
      style={{ background: bg, color, fontFamily: 'Inter' }}
    >
      {label}
    </span>
  );
}