/**
 * Orquestación de la importación, para los dos tipos de Excel.
 *
 * El modal no habla con `xlsx` ni con la base: pide validar y después cargar, y
 * este hook expone el estado del proceso (estado, plan, progreso, resultado y
 * error). Al terminar bien invalida React Query para que el dashboard y las
 * demás páginas se refresquen solos.
 *
 * `validar` recibe el tipo porque la validación necesita datos que sólo están
 * en la base: las marcas para avisar marcas nuevas (ventas) y la cartera actual
 * para comparar (cartera).
 */

import { useCallback, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { configDe, type TipoExcel } from '../lib/importacion/config';
import { leerHojaAuto, type HojaCruda } from '../lib/importacion/leerExcel';
import {
  cargarVentas,
  leerMarcasExistentes,
  validarVentas,
  type PlanVentas,
  type ResultadoVentas,
} from '../lib/importacion/ventas';
import {
  cargarCartera,
  leerEstadoCartera,
  type ResultadoCartera,
} from '../lib/importacion/cartera';
import {
  validarCartera,
  type PlanCartera,
} from '../lib/importacion/validarCartera';
import type { Progreso } from '../lib/importacion/importaciones';

export type EstadoImportacion =
  | 'inactivo'
  | 'validando'
  | 'listo'
  | 'cargando'
  | 'exito'
  | 'error';

export type PlanImportacion = PlanVentas | PlanCartera;
export type ResultadoImportacion = ResultadoVentas | ResultadoCartera;

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado.';
}

export function useImportar() {
  const queryClient = useQueryClient();

  const [estado, setEstado] = useState<EstadoImportacion>('inactivo');
  const [plan, setPlan] = useState<PlanImportacion | null>(null);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hojaRef = useRef<HojaCruda | null>(null);
  const tipoRef = useRef<TipoExcel | null>(null);
  const planRef = useRef<PlanImportacion | null>(null);

  const reiniciar = useCallback(() => {
    hojaRef.current = null;
    tipoRef.current = null;
    planRef.current = null;
    setEstado('inactivo');
    setPlan(null);
    setProgreso(null);
    setResultado(null);
    setError(null);
  }, []);

  const validar = useCallback(
    async (tipo: TipoExcel, archivo: File): Promise<PlanImportacion | null> => {
      setEstado('validando');
      setPlan(null);
      setProgreso(null);
      setResultado(null);
      setError(null);

      try {
        const config = configDe(tipo);
        const { hoja, advertencias } = await leerHojaAuto(archivo, {
          hojas: config.hojas,
          claveColumnas: config.claveColumnas,
          filaEncabezado: config.filaEncabezado,
        });

        let siguiente: PlanImportacion;

        if (tipo === 'ventas') {
          const marcas = await leerMarcasExistentes();
          siguiente = validarVentas(archivo, hoja, marcas);
        } else {
          const estadoCartera = await leerEstadoCartera();
          siguiente = validarCartera(tipo, archivo, hoja, estadoCartera);
        }

        siguiente.advertencias = [...advertencias, ...siguiente.advertencias];

        hojaRef.current = hoja;
        tipoRef.current = tipo;
        planRef.current = siguiente;

        setPlan(siguiente);
        setEstado('listo');
        return siguiente;
      } catch (e) {
        setError(mensajeDe(e));
        setEstado('error');
        return null;
      }
    },
    [],
  );

  const cargar = useCallback(async (): Promise<ResultadoImportacion | null> => {
    const hoja = hojaRef.current;
    const actual = planRef.current;
    const tipo = tipoRef.current;
    if (!hoja || !actual || !tipo) return null;

    setEstado('cargando');
    setError(null);
    setProgreso({
      fase: tipo === 'ventas' ? 'dimensiones' : 'respaldo',
      mensaje: 'Preparando la carga…',
    });

    try {
      const r =
        tipo === 'ventas'
          ? await cargarVentas(hoja, actual as PlanVentas, setProgreso)
          : await cargarCartera(hoja, actual as PlanCartera, setProgreso);

      setResultado(r);
      setEstado('exito');

      // ── Refresco de datos ─────────────────────────────────────────────────
      // Antes esto era `invalidateQueries()` sin argumentos: despertaba TODAS las
      // consultas guardadas a la vez. Recién cargadas 25.000 filas, el dashboard
      // (la consulta más pesada) se cortaba por `statement timeout` y el usuario
      // veía una caja roja.
      //
      // Ahora se marca todo como viejo, pero sólo se refetchea lo que está en
      // pantalla. El resto se actualiza al entrar a cada página.
      await queryClient.invalidateQueries({
        refetchType: 'active',
        predicate: (query) => query.queryKey[0] !== 'fn_dashboard_todo',
      });

      // El dashboard se refresca unos segundos después, cuando la base terminó de
      // asentar la carga. No se espera: el resultado del modal no depende de él.
      window.setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: ['fn_dashboard_todo'],
          refetchType: 'active',
        });
      }, 4_000);

      return r;
    } catch (e) {
      setError(mensajeDe(e));
      setEstado('error');
      return null;
    }
  }, [queryClient]);

  /**
   * Marca (o desmarca) una marca nueva como alcohólica desde la vista previa.
   *
   * Se guarda en el plan, no en estado aparte: `cargarCartera` lee el plan y es
   * quien crea la marca en `marcas_alcohol`. Se actualizan las dos listas para
   * que el checkbox y la carga nunca queden desincronizados.
   */
  const setMarcaAlcohol = useCallback((nombre: string, esAlcohol: boolean) => {
    const actual = planRef.current;
    if (!actual || actual.tipo !== 'cartera') return;

    const siguiente: PlanCartera = {
      ...actual,
      marcas: actual.marcas.map((m) =>
        m.id === null && m.nombre === nombre ? { ...m, esAlcohol } : m,
      ),
      marcasNuevas: actual.marcasNuevas.map((m) =>
        m.nombre === nombre ? { ...m, esAlcohol } : m,
      ),
    };

    planRef.current = siguiente;
    setPlan(siguiente);
  }, []);

  return {
    estado,
    plan,
    progreso,
    resultado,
    error,
    validar,
    cargar,
    reiniciar,
    setMarcaAlcohol,
  };
}
