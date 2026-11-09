import { useMemo } from 'react';
import type { Filtros } from '../types/database.types';

/**
 * Estado de los filtros globales.
 *
 * En el prototipo eran decorativos: cambiaban el color del `<select>` y el badge
 * "Activos", pero ningún gráfico se movía porque los agregados se calculaban sobre
 * las colecciones completas. Ahora cada filtro viaja a la base de datos.
 *
 * `null` significa "sin filtro". Es lo que las funciones SQL esperan para no
 * filtrar, así que no se manda `undefined`.
 */

export const FILTROS_VACIOS: Filtros = {
  p_anio: null,
  p_mes: null,
  p_cliente: null,
  p_localidad: null,
  p_marca: null,
  p_encargado: null,
  p_canal: null,
  p_unidad_negocio: null,
  p_categoria: null,
};

/** Etiquetas del panel de filtros, en el mismo orden que `FILTROS_VACIOS`. */
export const CAMPOS_FILTRO = [
  { clave: 'p_anio', etiqueta: 'Año' },
  { clave: 'p_mes', etiqueta: 'Mes' },
  { clave: 'p_cliente', etiqueta: 'Cliente' },
  { clave: 'p_localidad', etiqueta: 'Localidad' },
  { clave: 'p_marca', etiqueta: 'Marca' },
  { clave: 'p_encargado', etiqueta: 'Encargado' },
  { clave: 'p_canal', etiqueta: 'Canal' },
  { clave: 'p_unidad_negocio', etiqueta: 'Unidad de negocio' },
  { clave: 'p_categoria', etiqueta: 'Categoría' },
] as const satisfies readonly { clave: keyof Filtros; etiqueta: string }[];

export type ClaveFiltro = keyof Filtros;

/** Setter tipado por clave: no se puede pasar `p_marca` a `p_canal`. */
export type SetFiltro = <K extends ClaveFiltro>(clave: K, valor: Filtros[K]) => void;

/** true si hay al menos un filtro aplicado. */
export function hayFiltros(filtros: Filtros): boolean {
  return Object.values(filtros).some((v) => v !== null && v !== undefined);
}

/** Filtros sin los vacíos. Evita mandarlos como `null` al RPC. */
export function filtrosParaRpc(filtros: Filtros): Filtros {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, v]) => v !== null && v !== undefined),
  ) as Filtros;
}

/**
 * Serializa los filtros para usarlos como parte de la clave de caché.
 *
 * React Query compara las query keys por serialización. Sin ordenar las claves y
 * quitar los `null`, dos objetos con el mismo contenido generarían entradas de
 * caché distintas y la app refetcheearía sin necesidad. Además, con esto
 * "filtrar y luego limpiar" vuelve exactamente a la clave inicial.
 */
export function claveDeFiltros(filtros: Filtros): string {
  const limpio = Object.entries(filtros)
    .filter(([, v]) => v !== null && v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(limpio));
}

/**
 * Estado del panel de filtros.
 *
 * `setFiltros` se envuelve en `useCallback` en la página para que la referencia
 * sólo cambie cuando corresponde: si no, el `useMemo` de acá se recalcula en
 * cada render y con él la `queryKey` de React Query.
 */
export function useFiltros(
  filtros: Filtros,
  setFiltros: (f: Filtros) => void,
) {
  const setFiltro = useMemo<SetFiltro>(
    () => (clave, valor) => setFiltros({ ...filtros, [clave]: valor }),
    [filtros, setFiltros],
  );

  const limpiar = useMemo(() => () => setFiltros({ ...FILTROS_VACIOS }), [setFiltros]);

  return {
    filtros,
    setFiltro,
    limpiar,
    activos: hayFiltros(filtros),
    rpc: filtrosParaRpc(filtros),
  };
}