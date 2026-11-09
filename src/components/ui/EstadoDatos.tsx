/**
 * Estados de carga, error y vacío.
 *
 * Ninguna página del prototipo lo tenía, porque los datos venían de un array en
 * memoria y llegaban de inmediato. Al pasar a la base hay que distinguir tres
 * estados que antes no existían.
 *
 * Un error no debe dejar la pantalla en blanco: es mejor mostrar la estructura
 * con un aviso, así el usuario ve que la app anda y sólo falló la consulta.
 */

type Props = {
  /** Cierto mientras se está cargando. */
  cargando: boolean;
  /** Mensaje del error, si hubo. */
  error?: Error | string | null;
  /** Cierto cuando la consulta volvió pero sin filas. */
  vacio?: boolean;
  /** Texto del estado sin resultados. */
  mensajeVacio?: string;
  /** Contenido a renderizar cuando todo está bien. */
  children: React.ReactNode;
  /** Reemplazos opcionales de cada estado. */
  childrenCargando?: React.ReactNode;
  childrenVacio?: React.ReactNode;
};

export default function EstadoDatos({
  cargando,
  error,
  vacio = false,
  mensajeVacio = 'Sin datos para los filtros seleccionados',
  children,
  childrenCargando,
  childrenVacio,
}: Props) {
  if (cargando) return <>{childrenCargando ?? <Skeleton filas={3} alto="h-12" />}</>;
  if (error) return <AvisoError mensaje={typeof error === 'string' ? error : error.message} />;
  if (vacio) return <>{childrenVacio ?? <AvisoVacio mensaje={mensajeVacio} />}</>;
  return <>{children}</>;
}

/**
 * Bloques grises con la forma aproximada del contenido.
 *
 * La forma importa: un skeleton con la altura del contenido real evita que la
 * página salte de posición cuando llegan los datos.
 */
export function Skeleton({ filas = 3, alto = 'h-12' }: { filas?: number; alto?: string }) {
  return (
    <div className="space-y-2 p-5" aria-busy="true" aria-live="polite">
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          className={`${alto} rounded-lg`}
          style={{ background: '#F1F5F9', animation: 'pulso-suave 1.5s ease-in-out infinite' }}
        />
      ))}
    </div>
  );
}

/** Aviso de error. No muestra la consulta cruda: es ruido para el usuario. */
export function AvisoError({ mensaje }: { mensaje: string }) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border p-4"
      style={{ borderColor: '#FECACA', background: '#FEF2F2' }}
      role="alert"
    >
      <span className="flex-shrink-0 font-600" style={{ color: '#EF4444' }}>
        !
      </span>
      <div>
        <div className="text-xs font-600" style={{ color: '#991B1B', fontFamily: 'Inter' }}>
          No se pudieron cargar los datos
        </div>
        <div className="text-[11px] mt-0.5" style={{ color: '#B91C1C', fontFamily: 'Inter' }}>
          {mensaje}
        </div>
      </div>
    </div>
  );
}

/**
 * Estado sin resultados.
 *
 * Distinto del error: acá la consulta funcionó, pero la combinación de filtros no
 * arroja nada. Sin esta distinción el usuario piensa que algo falló.
 */
export function AvisoVacio({ mensaje }: { mensaje: string }) {
  return (
    <div
      className="rounded-xl border p-8 text-center"
      style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}
    >
      <div className="text-sm" style={{ color: '#64748B', fontFamily: 'Inter' }}>
        {mensaje}
      </div>
    </div>
  );
}