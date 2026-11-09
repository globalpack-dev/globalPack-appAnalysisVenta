import { QueryClient } from "@tanstack/react-query"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos de un dashboard no cambian cada segundo.
      staleTime: 60_000,
      retry: 2,
      /**
       * Un `statement timeout` (57014) es contención momentánea de la base, no un
       * error real: reintentarlo en el acto casi siempre vuelve a fallar. Con
       * esta espera creciente (3 s → 6 s → 12 s, tope 15 s) el reintento llega
       * cuando la base ya terminó de asentar una carga grande.
       */
      retryDelay: (intento) => Math.min(3_000 * 2 ** intento, 15_000),
      // Evita recargas inesperadas mientras el usuario lee un gráfico.
      refetchOnWindowFocus: false,
    },
  },
})
