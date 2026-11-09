import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { colorDe } from './chartColors';
import EstadoDatos from './EstadoDatos';
import type { ClienteCartera, FilaCartera, MarcaCartera } from '../../hooks/useCartera';

/**
 * Los cuatro gráficos de la pantalla de Supervisores.
 *
 * ── Por qué están en el frontend y no en SQL ──────────────────────────────
 *
 * Los datos que necesitan ya están descargados: la lista de clientes (con el
 * array `compras` de cada uno) y la matriz por marca. Agregar funciones en
 * Postgres para esto serían llamadas de red de más para calcular cosas que
 * el navegador ya tiene en memoria.
 *
 * ── Las seis marcas de verdad ─────────────────────────────────────────────
 *
 * De las 9 marcas del archivo, tres no son alcohol (RED BULL, H2Oh, PEPSI
 * BLACK). Los gráficos las separan: son bebidas y no se ofrecen como alcohol.
 * Ver 27_alcohol_ico.sql.
 */

/** El ancho de las barras: en el layout de 2 columnas. */
const ALTO = 200;

// ─── A: Distribución de línea ───────────────────────────────────────────────

/**
 * ¿A quién le amplío la línea?
 *
 * El histograma de cuántas marcas de alcohol compró cada cliente del público.
 *
 * Es el gráfico más accionable de los cuatro porque separa dos cosas que el
 * número "475 sin compra" mezcla: los que no compraron NADA (oportunidad) y
 * los que compraron UNA sola marca. El segundo grupo es el cross-sell más
 * fácil: ya conocen el producto, sólo falta ampliar la línea.
 */
export function GraficoDistribucion({ clientes }: { clientes: ClienteCartera[] }) {
  const datos = useMemo(() => {
    // El público de alcohol: el flag en SI o una compra de alcohol. Es la
    // misma población que usa la matriz por marca.
    const publico = clientes.filter((c) => c.es_alcohol || c.compro_algo);
    const cuentas = new Array(7).fill(0);
    for (const c of publico) {
      const n = Math.min(6, Math.max(0, c.compradas_alcohol));
      cuentas[n] += 1;
    }
    return cuentas.map((n, i) => ({
      marcas: i,
      etiqueta: i === 0 ? 'Ninguna' : String(i),
      clientes: n,
    }));
  }, [clientes]);

  const total = datos.reduce((a, d) => a + d.clientes, 0);
  const conUna = datos[1]?.clientes ?? 0;

  return (
    <EstadoDatos cargando={false} vacio={total === 0}>
      <ResponsiveContainer width="100%" height={ALTO}>
        <BarChart data={datos} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis
            dataKey="etiqueta"
            tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={46}
          />
          <Tooltip
            content={
              <TooltipDistribucion />
            }
          />
          <Bar dataKey="clientes" name="Clientes" radius={[3, 3, 0, 0]}>
            {datos.map((d) => (
              <Cell key={d.marcas} fill={d.marcas <= 1 ? '#D97706' : '#1D4ED8'} />
            ))}
            <LabelList
              dataKey="clientes"
              position="top"
              style={{ fontSize: 10, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] mt-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        <span style={{ color: '#D97706', fontWeight: 500 }}>
          {fmt(datos[0]?.clientes ?? 0)} no compraron ninguna
        </span>
        {' · '}
        <span style={{ color: '#D97706', fontWeight: 500 }}>
          {fmt(conUna)} compraron una sola
        </span>
        {' · '}de {fmt(total)} clientes de alcohol
      </p>
    </EstadoDatos>
  );
}

function TooltipDistribucion({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { marcas: number; clientes: number };
  return (
    <div className="bg-white border rounded-lg shadow-lg px-3 py-2 text-xs" style={{ borderColor: '#E2E8F0' }}>
      <div className="font-600 mb-1" style={{ fontFamily: 'Outfit', color: '#0F172A' }}>
        {d.marcas === 0 ? 'Ninguna marca' : `${d.marcas} marca${d.marcas > 1 ? 's' : ''}`}
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', color: '#0F172A' }}>
        {fmt(d.clientes)} clientes
      </div>
    </div>
  );
}

// ─── B: Penetración por marca ───────────────────────────────────────────────

/**
 * ¿En qué marca estoy weak?
 *
 * El porcentaje de clientes de alcohol que compraron cada marca.
 *
 * Las tres marcas que no son alcohol van debajo, en gris: son bebidas y no
 * se ofrecen como alcohol, pero el dato interesa igual.
 */
export function GraficoPenetracion({ marcas }: { marcas: MarcaCartera[] }) {
  const datos = useMemo(() => {
    const alcoholicas = marcas
      .filter((m) => m.es_alcoholica)
      .sort((a, b) => b.penetracion - a.penetracion);
    const bebidas = marcas
      .filter((m) => !m.es_alcoholica)
      .sort((a, b) => b.penetracion - a.penetracion);
    return { alcoholicas, bebidas };
  }, [marcas]);

  const todos = [...datos.alcoholicas, ...datos.bebidas];
  if (todos.length === 0) {
    return (
      <EstadoDatos cargando={false} vacio={true}>
        <></>
      </EstadoDatos>
    );
  }

  // Una sola serie con dos colores: el color lo decide `es_alcoholica`.
  const filas = todos.map((m) => ({
    nombre: m.marca_nombre,
    penetracion: Number(m.penetracion),
    compraron: m.compraron,
    sin_comprar: m.sin_comprar,
    publico: m.clientes_alcohol,
    es_alcoholica: m.es_alcoholica,
  }));

  return (
    <EstadoDatos cargando={false} vacio={filas.length === 0}>
      <ResponsiveContainer width="100%" height={ALTO + 60}>
        <BarChart
          data={filas}
          layout="vertical"
          margin={{ top: 4, right: 34, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="nombre"
            tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Inter' }}
            axisLine={false}
            tickLine={false}
            width={108}
          />
          <Tooltip content={<TooltipPenetracion />} />
          <Bar dataKey="penetracion" name="Penetración" radius={[0, 3, 3, 0]}>
            {filas.map((f) => (
              <Cell key={f.nombre} fill={f.es_alcoholica ? colorDe(0) : '#CBD5E1'} />
            ))}
            <LabelList
              dataKey="penetracion"
              position="right"
              formatter={(v) => `${v}%`}
              style={{ fontSize: 9, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </EstadoDatos>
  );
}

function TooltipPenetracion({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as {
    nombre: string; compraron: number; sin_comprar: number; publico: number;
  };
  return (
    <div className="bg-white border rounded-lg shadow-lg px-3 py-2 text-xs" style={{ borderColor: '#E2E8F0' }}>
      <div className="font-600 mb-1" style={{ fontFamily: 'Outfit', color: '#0F172A' }}>
        {d.nombre}
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', color: '#0F172A' }}>
        {fmt(d.compraron)} de {fmt(d.publico)} clientes de alcohol
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', color: '#D97706' }}>
        {fmt(d.sin_comprar)} sin comprar
      </div>
    </div>
  );
}

// ─── C: Benchmark ───────────────────────────────────────────────────────────

/**
 * ¿Estoy bien o mal respecto del equipo?
 *
 * Compara la penetración de alcohol de cada supervisor. El supervisor en el
 * que se está parado se resalta; los demás quedan apagados.
 *
 * Las dos series suman 100% porque el público de alcohol se divide exacto en
 * "compró" y "no compró".
 */
export function GraficoBenchmark({
  supervisores,
  actual,
}: {
  supervisores: FilaCartera[];
  actual: number | null;
}) {
  const datos = useMemo(
    () =>
      supervisores.map((s) => ({
        nombre: s.nombre,
        penetracion: Number(s.penetracion),
        oportunidad: Math.round((100 - Number(s.penetracion)) * 10) / 10,
        es_actual: actual === null ? s.id_supervisor === null : s.id_supervisor === actual,
      })),
    [supervisores, actual],
  );

  return (
    <EstadoDatos cargando={false} vacio={datos.length === 0}>
      <ResponsiveContainer width="100%" height={ALTO}>
        <BarChart
          data={datos}
          layout="vertical"
          margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="nombre"
            tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Inter' }}
            axisLine={false}
            tickLine={false}
            width={118}
          />
          <Tooltip content={<TooltipBenchmark />} />
          <Bar
            dataKey="penetracion"
            name="Ya compró alcohol"
            stackId="a"
            radius={[0, 0, 0, 0]}
          >
            {datos.map((d) => (
              <Cell key={d.nombre} fill={d.es_actual ? '#1D4ED8' : '#93B4F5'} />
            ))}
          </Bar>
          <Bar
            dataKey="oportunidad"
            name="Sin compra"
            stackId="a"
            radius={[0, 3, 3, 0]}
          >
            {datos.map((d) => (
              <Cell key={d.nombre} fill={d.es_actual ? '#FDE68A' : '#F5F7FA'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="text-[10px] mt-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
        Porcentaje de clientes de alcohol que ya compraron. En amarillo, los que
        todavía no compraron.
      </p>
    </EstadoDatos>
  );
}

function TooltipBenchmark({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { nombre: string; penetracion: number; oportunidad: number };
  return (
    <div className="bg-white border rounded-lg shadow-lg px-3 py-2 text-xs" style={{ borderColor: '#E2E8F0' }}>
      <div className="font-600 mb-1" style={{ fontFamily: 'Outfit', color: '#0F172A' }}>
        {d.nombre}
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', color: '#1D4ED8' }}>
        Ya compró: {d.penetracion}%
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', color: '#D97706' }}>
        Sin compra: {d.oportunidad}%
      </div>
    </div>
  );
}

// ─── D: Oportunidad por localidad ───────────────────────────────────────────

/**
 * ¿A dónde voy el lunes?
 *
 * La oportunidad agrupada por localidad.
 *
 * El bloque al pie es lo importante: **el 70% de los clientes sin compra no
 * tiene localidad cargada**. Son los que vinieron del archivo del cliente y
 * nunca compraron, así que no están en el Excel de ventas — que es de donde
 * sale la localidad. Sin ese bloque el gráfico parecería completo y no lo
 * está.
 */
export function GraficoLocalidad({ clientes }: { clientes: ClienteCartera[] }) {
  const { datos, sinLocalidad, total } = useMemo(() => {
    const oportunidad = clientes.filter((c) => c.oportunidad);
    const porLocalidad = new Map<string, number>();
    for (const c of oportunidad) {
      if (!c.localidad_nombre) continue;
      porLocalidad.set(c.localidad_nombre, (porLocalidad.get(c.localidad_nombre) ?? 0) + 1);
    }
    const top = [...porLocalidad.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nombre, n]) => ({ nombre, clientes: n }));
    return {
      datos: top,
      sinLocalidad: oportunidad.length - [...porLocalidad.values()].reduce((a, n) => a + n, 0),
      total: oportunidad.length,
    };
  }, [clientes]);

  return (
    <EstadoDatos
      cargando={false}
      vacio={total === 0}
      mensajeVacio="Ningún cliente sin compra en esta cartera"
    >
      <ResponsiveContainer width="100%" height={ALTO + 20}>
        <BarChart
          data={datos}
          layout="vertical"
          margin={{ top: 4, right: 34, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: '#94A3B8', fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="nombre"
            tick={{ fontSize: 10, fill: '#64748B', fontFamily: 'Inter' }}
            axisLine={false}
            tickLine={false}
            width={128}
          />
          <Tooltip content={<TooltipLocalidad />} />
          <Bar dataKey="clientes" name="Sin compra" fill="#D97706" radius={[0, 3, 3, 0]}>
            <LabelList
              dataKey="clientes"
              position="right"
              style={{ fontSize: 9, fill: '#64748B', fontFamily: 'JetBrains Mono' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {sinLocalidad > 0 && (
        <div
          className="mt-3 rounded-lg border p-3"
          style={{ borderColor: '#E2E8F0', background: '#F8FAFC' }}
        >
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-600" style={{ color: '#0F172A', fontFamily: 'JetBrains Mono' }}>
              {fmt(sinLocalidad)}
            </span>
            <span className="text-[11px] font-500" style={{ color: '#64748B', fontFamily: 'Inter' }}>
              sin localidad asignada
            </span>
          </div>
          <p className="text-[10px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Son {fmt(Math.round((100 * sinLocalidad) / total))}% de los clientes sin compra. No
            aparecen en el Excel de ventas porque nunca compraron: el archivo del cliente no
            trae la localidad. Sirve pedirla para poder planificar las visitas.
          </p>
        </div>
      )}
    </EstadoDatos>
  );
}

function TooltipLocalidad({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as { nombre: string; clientes: number };
  return (
    <div className="bg-white border rounded-lg shadow-lg px-3 py-2 text-xs" style={{ borderColor: '#E2E8F0' }}>
      <div className="font-600 mb-1" style={{ fontFamily: 'Outfit', color: '#0F172A' }}>
        {d.nombre}
      </div>
      <div style={{ fontFamily: 'JetBrains Mono', color: '#D97706' }}>
        {fmt(d.clientes)} clientes sin compra
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.round(n).toLocaleString('es-AR');
}
