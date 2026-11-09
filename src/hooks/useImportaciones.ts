import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { importaciones } from '../types/database.types';

/**
 * Historial de cargas desde «Cargar datos».
 *
 * Lee la tabla de auditoría `importaciones` (ver `supabase/33_importaciones.sql`),
 * que guarda una fila por cada intento: quién, qué archivo, cuándo, cuántas
 * filas y cómo terminó. El detalle viene en un jsonb libre con el resumen que
 * dejó cada importador.
 *
 * PostgREST corta en 1.000 filas, así que se pagina con `.range()` igual que los
 * cargadores. Hoy hay poquísimas filas, pero la página tiene que seguir andando
 * dentro de un año.
 */

const LOTE = 1_000;

export type Carga = importaciones;

export function useImportaciones() {
  const q = useQuery({
    queryKey: ['importaciones'],
    queryFn: async (): Promise<Carga[]> => {
      const filas: Carga[] = [];

      for (let desde = 0; ; desde += LOTE) {
        const { data, error } = await supabase
          .from('importaciones')
          .select('*')
          .order('created_at', { ascending: false })
          .range(desde, desde + LOTE - 1);

        if (error) throw error;

        const lote = (data ?? []) as Carga[];
        filas.push(...lote);
        if (lote.length < LOTE) break;
      }

      return filas;
    },
    staleTime: 30_000,
  });

  return {
    cargas: q.data ?? [],
    isPending: q.isPending,
    error: q.error,
    refrescar: q.refetch,
  };
}
