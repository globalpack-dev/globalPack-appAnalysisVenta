import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  ShieldCheck,
  Check,
  Users,
  Loader2,
  Plus,
  Trash2,
  X,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { inicialesDe, etiquetaDeRol, nombreAMostrar } from '../lib/usuario';
import {
  useActualizarEmpleado,
  useCrearEmpleado,
  useEliminarEmpleado,
  useEmpleados,
  type NuevoEmpleado,
} from '../hooks/useEmpleados';
import type { empleados } from '../types/database.types';

/**
 * Configuración del usuario.
 *
 * Antes todo estaba hardcodeado: "Admin Principal", `admin@ventaspro.com`, y dos
 * botones "Guardar cambios" que no hacían nada. Ahora el perfil sale de la tabla
 * `empleados`, y guardar sí escribe.
 *
 * El bloque "Datos de la empresa" se quitó: no hay tabla para eso en el esquema
 * y el CUIT real todavía no se conoce. Ver el README de `supabase/`.
 */
export default function Settings() {
  const { empleado, esAdmin, recargar } = useAuth();

  const { data: usuarios = [], isLoading: cargandoUsuarios, error: errorUsuarios } =
    useEmpleados(esAdmin);
  const actualizarEmpleado = useActualizarEmpleado();
  const crearEmpleado = useCrearEmpleado();
  const eliminarEmpleado = useEliminarEmpleado();

  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<'ok' | 'error' | null>(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [aEliminar, setAEliminar] = useState<empleados | null>(null);

  // El form se llena cuando llega el empleado. Sin esto, escribiría sobre un
  // estado vacío durante la primera carga y borraría el nombre al guardar.
  useEffect(() => {
    if (empleado?.nombre) setNombre(empleado.nombre);
  }, [empleado?.nombre]);

  async function guardar() {
    if (!empleado || guardando) return;

    // Validación mínima en el cliente. La tabla sólo exige que no sea vacío.
    const limpio = nombre.trim();
    if (!limpio) {
      setMensaje('error');
      return;
    }

    setGuardando(true);
    setMensaje(null);

    // Va por RPC y no por un UPDATE directo: la política de `empleados` sólo
    // deja escribir al admin, así que un usuario `consulta` recibía 204 sin
    // error y la UI mostraba «Guardado» sin haber cambiado nada. El RPC es
    // SECURITY DEFINER y toca únicamente el `nombre` de la fila propia.
    const { error } = await supabase.rpc('actualizar_mi_nombre', { nuevo: limpio });

    setGuardando(false);

    if (error) {
      console.error('No se pudo guardar el perfil:', error.message);
      setMensaje('error');
      return;
    }

    await recargar();
    setMensaje('ok');
  }

  /**
   * Guarda rol/estado desde la tarjeta de Usuarios. El RPC valida en la base
   * que no sea la cuenta propia y que quede un admin activo.
   */
  async function guardarEmpleado(
    id: string,
    rol: empleados['rol'],
    activo: boolean,
  ) {
    await actualizarEmpleado(id, rol, activo);
    // El RPC bloquea la edición propia, pero si alguna vez se habilita, esto
    // mantiene sincronizado el contexto de sesión.
    if (empleado?.id === id) await recargar();
  }

  async function crear(e: NuevoEmpleado) {
    await crearEmpleado(e);
  }

  async function eliminar() {
    if (!aEliminar) return;
    await eliminarEmpleado(aEliminar.id);
    setAEliminar(null);
  }

  if (!empleado) return null;

  return (
    <div className="p-6">
      <div className="max-w-3xl space-y-5">
        {/* Perfil */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-display font-600 text-sm mb-4" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>Perfil de usuario</h3>
          <div className="flex items-center gap-4 mb-5">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white font-700 text-lg flex-shrink-0"
              style={{ background: '#2563EB', fontFamily: 'Outfit' }}
            >
              {inicialesDe(empleado.nombre, empleado.email)}
            </div>
            <div>
              <div className="font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
                {empleado.nombre}
              </div>
              <div className="text-xs mt-0.5" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                {empleado.email}
              </div>
              <div
                className="text-xs mt-0.5 px-2 py-0.5 rounded-full inline-block"
                style={{ background: '#EFF6FF', color: '#2563EB', fontFamily: 'Inter' }}
              >
                {etiquetaDeRol(empleado.rol)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                Nombre completo
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => { setNombre(e.target.value); setMensaje(null); }}
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                style={{ borderColor: '#E2E8F0', fontFamily: 'Inter', color: '#0F172A' }}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                Correo electrónico
              </label>
              <input
                type="email"
                value={empleado.email}
                readOnly
                disabled
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                style={{
                  borderColor: '#F1F5F9',
                  background: '#F8FAFC',
                  fontFamily: 'Inter',
                  color: '#94A3B8',
                }}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                Teléfono
              </label>
              <input
                type="text"
                disabled
                placeholder="No cargado"
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                style={{
                  borderColor: '#F1F5F9',
                  background: '#F8FAFC',
                  fontFamily: 'Inter',
                  color: '#94A3B8',
                }}
              />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                Rol
              </label>
              <input
                type="text"
                value={etiquetaDeRol(empleado.rol)}
                readOnly
                disabled
                className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                style={{
                  borderColor: '#F1F5F9',
                  background: '#F8FAFC',
                  fontFamily: 'Inter',
                  color: '#94A3B8',
                }}
              />
            </div>
          </div>

          <p
            className="text-[11px] mt-3 flex items-start gap-1.5"
            style={{ color: '#94A3B8', fontFamily: 'Inter' }}
          >
            <ShieldCheck size={12} className="flex-shrink-0 mt-px" />
            El correo y el teléfono los administra un administrador de la base de
            datos. El nombre lo podés cambiar vos; el rol se administra en Usuarios.
          </p>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => void guardar()}
              disabled={guardando || nombre.trim() === empleado.nombre}
              className="px-4 py-2 text-sm font-500 rounded-lg text-white disabled:opacity-50"
              style={{ background: '#2563EB', fontFamily: 'Inter' }}
            >
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {mensaje === 'ok' && (
              <span className="text-xs flex items-center gap-1" style={{ color: '#059669', fontFamily: 'Inter' }}>
                <Check size={13} /> Guardado
              </span>
            )}
            {mensaje === 'error' && (
              <span className="text-xs" style={{ color: '#DC2626', fontFamily: 'Inter' }}>
                No se pudo guardar.
              </span>
            )}
          </div>
        </div>

        {/* Permisos */}
        <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
          <h3 className="font-display font-600 text-sm mb-3" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            Tus permisos
          </h3>
          <ul className="space-y-2">
            {(esAdmin ? PERMISOS_ADMIN : PERMISOS_CONSULTA).map((p) => (
              <li key={p} className="text-xs flex items-start gap-2" style={{ color: '#64748B', fontFamily: 'Inter' }}>
                <Check size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#059669' }} />
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Usuarios — sólo admin */}
        {esAdmin && (
          <div className="bg-white rounded-xl p-5 border" style={{ borderColor: '#E2E8F0' }}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <h3
                className="font-display font-600 text-sm flex items-center gap-1.5"
                style={{ color: '#0F172A', fontFamily: 'Outfit' }}
              >
                <Users size={15} style={{ color: '#2563EB' }} />
                Usuarios
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[11px]" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                  {usuarios.length} {usuarios.length === 1 ? 'cuenta' : 'cuentas'}
                </span>
                <button
                  type="button"
                  onClick={() => setModalNuevo(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-500 rounded-lg text-white"
                  style={{ background: '#2563EB', fontFamily: 'Inter' }}
                >
                  <Plus size={14} />
                  Nuevo usuario
                </button>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: '#64748B', fontFamily: 'Inter' }}>
              Creá cuentas, administrá roles y revocá el acceso de quienes ya no trabajan.
            </p>

            {cargandoUsuarios ? (
              <div
                className="flex items-center gap-2 text-xs py-4"
                style={{ color: '#94A3B8', fontFamily: 'Inter' }}
              >
                <Loader2 size={14} className="animate-spin" />
                Cargando usuarios…
              </div>
            ) : errorUsuarios ? (
              <p
                className="text-xs rounded-lg px-3 py-2.5"
                style={{ background: '#FEF2F2', color: '#B91C1C', fontFamily: 'Inter' }}
              >
                No se pudo cargar la lista de usuarios.
              </p>
            ) : usuarios.length === 0 ? (
              <p className="text-xs py-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
                No hay usuarios para mostrar.
              </p>
            ) : (
              <div className="space-y-2">
                {usuarios.map((u) => (
                  <FilaEmpleado
                    key={u.id}
                    usuario={u}
                    esPropio={u.id === empleado.id}
                    onGuardar={guardarEmpleado}
                    onEliminar={setAEliminar}
                  />
                ))}
              </div>
            )}

            <p
              className="text-[11px] mt-4 flex items-start gap-1.5"
              style={{ color: '#94A3B8', fontFamily: 'Inter' }}
            >
              <ShieldCheck size={12} className="flex-shrink-0 mt-px" />
              <span>
                Las cuentas nuevas se crean desde acá con una contraseña temporal.
                Desactivar impide el ingreso; Eliminar borra la cuenta de Supabase
                Auth y no se puede deshacer. Un token ya emitido puede seguir
                válido hasta que expire.
              </span>
            </p>
          </div>
        )}
      </div>

      {modalNuevo && (
        <ModalNuevoUsuario
          onCerrar={() => setModalNuevo(false)}
          onCrear={crear}
        />
      )}

      {aEliminar && (
        <ModalEliminarUsuario
          usuario={aEliminar}
          onCerrar={() => setAEliminar(null)}
          onEliminar={eliminar}
        />
      )}
    </div>
  );
}

// ─── Fila de usuario ──────────────────────────────────────────────────────────

type FilaEmpleadoProps = {
  usuario: empleados;
  esPropio: boolean;
  onGuardar: (id: string, rol: empleados['rol'], activo: boolean) => Promise<void>;
  onEliminar: (usuario: empleados) => void;
};

function FilaEmpleado({ usuario, esPropio, onGuardar, onEliminar }: FilaEmpleadoProps) {
  const [rol, setRol] = useState(usuario.rol);
  const [activo, setActivo] = useState(usuario.activo);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<'ok' | 'error' | null>(null);
  const [detalle, setDetalle] = useState('');

  // Si la lista se refresca (por esta edición o por otro admin), el borrador
  // vuelve a reflejar lo que hay en la base.
  useEffect(() => {
    setRol(usuario.rol);
    setActivo(usuario.activo);
  }, [usuario.rol, usuario.activo]);

  const cambios = rol !== usuario.rol || activo !== usuario.activo;

  function cambiarRol(nuevo: empleados['rol']) {
    setRol(nuevo);
    setResultado(null);
    setDetalle('');
  }

  function cambiarEstado() {
    setActivo((actual) => !actual);
    setResultado(null);
    setDetalle('');
  }

  async function guardar() {
    if (!cambios || guardando || esPropio) return;

    setGuardando(true);
    setResultado(null);
    setDetalle('');

    try {
      await onGuardar(usuario.id, rol, activo);
      setResultado('ok');
    } catch (e) {
      const bruto =
        typeof e === 'object' && e !== null && 'message' in e
          ? String((e as { message: unknown }).message)
          : 'No se pudo guardar.';
      // PostgREST prefija el error con el nombre de la función.
      setDetalle(bruto.replace(/^.*fn_actualizar_empleado:\s*/i, ''));
      setResultado('error');
    } finally {
      setGuardando(false);
    }
  }

  const desactivando = activo !== usuario.activo && !activo;

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: resultado === 'error' ? '#FECACA' : '#F1F5F9',
        background: esPropio ? '#F8FAFC' : '#FFFFFF',
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_135px_105px_88px_36px] gap-2.5 md:items-center">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-700 text-xs flex-shrink-0"
            style={{ background: usuario.activo ? '#2563EB' : '#94A3B8', fontFamily: 'Outfit' }}
          >
            {inicialesDe(usuario.nombre, usuario.email)}
          </div>
          <div className="min-w-0">
            <div
              className="text-sm font-500 flex items-center gap-1.5"
              style={{ color: '#0F172A', fontFamily: 'Inter' }}
            >
              <span className="truncate">{nombreAMostrar(usuario.nombre, usuario.email)}</span>
              {esPropio && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: '#EFF6FF', color: '#2563EB', fontFamily: 'Inter' }}
                >
                  Vos
                </span>
              )}
            </div>
            <div
              className="text-[11px] truncate mt-0.5"
              style={{ color: '#94A3B8', fontFamily: 'Inter' }}
            >
              {usuario.email}
            </div>
          </div>
        </div>

        <select
          value={rol}
          onChange={(e) => cambiarRol(e.target.value as empleados['rol'])}
          disabled={esPropio || guardando}
          aria-label={`Rol de ${nombreAMostrar(usuario.nombre, usuario.email)}`}
          className="w-full px-2.5 py-2 text-xs rounded-lg border outline-none disabled:opacity-60"
          style={{
            borderColor: '#E2E8F0',
            background: esPropio ? '#F1F5F9' : '#FFFFFF',
            color: '#0F172A',
            fontFamily: 'Inter',
          }}
        >
          <option value="admin">Administrador</option>
          <option value="consulta">Consulta</option>
        </select>

        <button
          type="button"
          onClick={cambiarEstado}
          disabled={esPropio || guardando}
          title={activo ? 'Desactivar el acceso' : 'Activar el acceso'}
          className="w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs rounded-lg border disabled:opacity-60"
          style={{
            background: activo ? '#ECFDF5' : '#FEF2F2',
            borderColor: activo ? '#A7F3D0' : '#FECACA',
            color: activo ? '#047857' : '#B91C1C',
            fontFamily: 'Inter',
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: activo ? '#10B981' : '#EF4444' }}
          />
          {activo ? 'Activo' : 'Inactivo'}
        </button>

        <button
          type="button"
          onClick={() => void guardar()}
          disabled={!cambios || guardando || esPropio}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-500 rounded-lg text-white disabled:opacity-40"
          style={{ background: '#2563EB', fontFamily: 'Inter' }}
        >
          {guardando ? <Loader2 size={13} className="animate-spin" /> : 'Guardar'}
        </button>

        <button
          type="button"
          onClick={() => onEliminar(usuario)}
          disabled={esPropio || guardando}
          title={esPropio ? 'No podés eliminar tu propia cuenta' : 'Eliminar esta cuenta'}
          aria-label={`Eliminar a ${nombreAMostrar(usuario.nombre, usuario.email)}`}
          className="w-full inline-flex items-center justify-center px-2 py-2 rounded-lg border disabled:opacity-30"
          style={{
            background: '#FFFFFF',
            borderColor: '#FECACA',
            color: '#DC2626',
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {esPropio && (
        <p className="text-[11px] mt-2" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
          Tu propia cuenta no se puede desactivar ni cambiar de rol.
        </p>
      )}

      {desactivando && (
        <p className="text-[11px] mt-2" style={{ color: '#B45309', fontFamily: 'Inter' }}>
          Al guardar, esta persona no podrá volver a ingresar a la app.
        </p>
      )}

      {resultado === 'ok' && (
        <p
          className="text-[11px] mt-2 flex items-center gap-1"
          style={{ color: '#059669', fontFamily: 'Inter' }}
        >
          <Check size={12} /> Guardado
        </p>
      )}

      {resultado === 'error' && (
        <p className="text-[11px] mt-2" style={{ color: '#DC2626', fontFamily: 'Inter' }}>
          {detalle || 'No se pudo guardar.'}
        </p>
      )}
    </div>
  );
}

// ─── Modales de usuarios ─────────────────────────────────────────────────────

function mensajeDeError(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const mensaje = String((e as { message: unknown }).message);
    if (mensaje) return mensaje;
  }
  return 'No se pudo completar la operación.';
}

function generarPassword(largo = 12): string {
  const caracteres = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const valores = new Uint32Array(largo);
  crypto.getRandomValues(valores);
  return Array.from(valores, (v) => caracteres[v % caracteres.length]).join('');
}

type ModalBaseProps = {
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
};

function ModalBase({ titulo, onCerrar, children }: ModalBaseProps) {
  useEffect(() => {
    function alPresionar(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar();
    }
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [onCerrar]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl"
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: '#E2E8F0' }}
        >
          <h3 className="font-display font-600 text-sm" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>
            {titulo}
          </h3>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="p-1 rounded-md hover:bg-slate-100"
            style={{ color: '#64748B' }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

type ModalNuevoUsuarioProps = {
  onCerrar: () => void;
  onCrear: (entrada: NuevoEmpleado) => Promise<void>;
};

function ModalNuevoUsuario({ onCerrar, onCrear }: ModalNuevoUsuarioProps) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generarPassword());
  const [rol, setRol] = useState<empleados['rol']>('consulta');
  const [verPassword, setVerPassword] = useState(true);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [creado, setCreado] = useState<{ email: string; password: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (creando) return;

    const nombreLimpio = nombre.trim();
    const emailLimpio = email.trim();

    if (nombreLimpio.length < 2) {
      setError('Ingresá el nombre completo.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
      setError('Ingresá un correo electrónico válido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña temporal debe tener al menos 8 caracteres.');
      return;
    }

    setCreando(true);
    setError('');

    try {
      await onCrear({ nombre: nombreLimpio, email: emailLimpio, password, rol });
      setCreado({ email: emailLimpio, password });
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCreando(false);
    }
  }

  async function copiar() {
    if (!creado) return;
    try {
      await navigator.clipboard.writeText(
        `Correo: ${creado.email}\nContraseña temporal: ${creado.password}`,
      );
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('No se pudo copiar. Anotá la contraseña antes de cerrar.');
    }
  }

  if (creado) {
    return (
      <ModalBase titulo="Cuenta creada" onCerrar={onCerrar}>
        <div className="space-y-4">
          <div
            className="rounded-lg p-3.5"
            style={{ background: '#ECFDF5', border: '1px solid #A7F3D0' }}
          >
            <p
              className="text-sm font-500 flex items-center gap-1.5 mb-2"
              style={{ color: '#047857', fontFamily: 'Inter' }}
            >
              <Check size={15} /> Usuario habilitado
            </p>
            <p className="text-xs mb-3" style={{ color: '#065F46', fontFamily: 'Inter' }}>
              Entregá estas credenciales a la persona. La contraseña no se vuelve a
              mostrar después de cerrar esta ventana.
            </p>
            <div className="space-y-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: '#047857', fontFamily: 'Inter' }}>
                  Correo
                </div>
                <div className="text-sm break-all" style={{ color: '#064E3B', fontFamily: 'Inter' }}>
                  {creado.email}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: '#047857', fontFamily: 'Inter' }}>
                  Contraseña temporal
                </div>
                <div className="text-sm font-mono break-all" style={{ color: '#064E3B' }}>
                  {creado.password}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void copiar()}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-500 rounded-lg border"
              style={{ borderColor: '#A7F3D0', background: '#FFFFFF', color: '#047857', fontFamily: 'Inter' }}
            >
              <Copy size={13} />
              {copiado ? 'Copiado' : 'Copiar credenciales'}
            </button>
          </div>

          {error && (
            <p className="text-xs" style={{ color: '#DC2626', fontFamily: 'Inter' }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={onCerrar}
            className="w-full px-4 py-2.5 text-sm font-500 rounded-lg text-white"
            style={{ background: '#2563EB', fontFamily: 'Inter' }}
          >
            Listo
          </button>
        </div>
      </ModalBase>
    );
  }

  return (
    <ModalBase titulo="Nuevo usuario" onCerrar={onCerrar}>
      <form onSubmit={(e) => void enviar(e)} className="space-y-3.5">
        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
            Nombre completo
          </label>
          <input
            type="text"
            value={nombre}
            onChange={(e) => { setNombre(e.target.value); setError(''); }}
            autoFocus
            placeholder="Ej. Ana Pérez"
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
            style={{ borderColor: '#E2E8F0', fontFamily: 'Inter', color: '#0F172A' }}
          />
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
            Correo electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="ana@globalpack.com.ar"
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
            style={{ borderColor: '#E2E8F0', fontFamily: 'Inter', color: '#0F172A' }}
          />
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
            Contraseña temporal
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={verPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="w-full px-3 py-2 pr-9 text-sm rounded-lg border outline-none font-mono"
                style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
              />
              <button
                type="button"
                onClick={() => setVerPassword((v) => !v)}
                aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded"
                style={{ color: '#94A3B8' }}
              >
                {verPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setPassword(generarPassword()); setVerPassword(true); setError(''); }}
              title="Generar otra contraseña"
              className="px-3 py-2 rounded-lg border text-xs inline-flex items-center gap-1.5"
              style={{ borderColor: '#E2E8F0', color: '#475569', fontFamily: 'Inter', background: '#FFFFFF' }}
            >
              <RefreshCw size={13} />
              Generar
            </button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
            Mínimo 8 caracteres. Se muestra una sola vez al crear la cuenta.
          </p>
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
            Rol
          </label>
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as empleados['rol'])}
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
            style={{ borderColor: '#E2E8F0', fontFamily: 'Inter', color: '#0F172A' }}
          >
            <option value="consulta">Consulta</option>
            <option value="admin">Administrador</option>
          </select>
        </div>

        {error && (
          <p
            className="text-xs rounded-lg px-3 py-2.5"
            style={{ background: '#FEF2F2', color: '#B91C1C', fontFamily: 'Inter' }}
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCerrar}
            className="px-3.5 py-2 text-xs rounded-lg border"
            style={{ borderColor: '#E2E8F0', color: '#475569', fontFamily: 'Inter' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={creando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-500 rounded-lg text-white disabled:opacity-50"
            style={{ background: '#2563EB', fontFamily: 'Inter' }}
          >
            {creando && <Loader2 size={13} className="animate-spin" />}
            {creando ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

type ModalEliminarUsuarioProps = {
  usuario: empleados;
  onCerrar: () => void;
  onEliminar: () => Promise<void>;
};

function ModalEliminarUsuario({ usuario, onCerrar, onEliminar }: ModalEliminarUsuarioProps) {
  const [confirmacion, setConfirmacion] = useState('');
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState('');

  const coincide = confirmacion.trim().toLowerCase() === usuario.email.toLowerCase();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!coincide || eliminando) return;

    setEliminando(true);
    setError('');

    try {
      await onEliminar();
    } catch (err) {
      setError(mensajeDeError(err));
      setEliminando(false);
    }
  }

  return (
    <ModalBase titulo="Eliminar usuario" onCerrar={onCerrar}>
      <form onSubmit={(e) => void enviar(e)} className="space-y-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-700 text-xs flex-shrink-0"
            style={{ background: '#94A3B8', fontFamily: 'Outfit' }}
          >
            {inicialesDe(usuario.nombre, usuario.email)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-500 truncate" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
              {nombreAMostrar(usuario.nombre, usuario.email)}
            </div>
            <div className="text-[11px] truncate" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>
              {usuario.email}
            </div>
          </div>
        </div>

        <div
          className="rounded-lg p-3 flex items-start gap-2"
          style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
        >
          <AlertTriangle size={15} className="flex-shrink-0 mt-px" style={{ color: '#DC2626' }} />
          <p className="text-xs" style={{ color: '#991B1B', fontFamily: 'Inter' }}>
            Se elimina la cuenta de Supabase Auth y su perfil. La persona no va a
            poder volver a ingresar. Esta acción no se puede deshacer.
          </p>
        </div>

        <div>
          <label className="text-xs mb-1 block" style={{ color: '#64748B', fontFamily: 'Inter' }}>
            Para confirmar, escribí <strong>{usuario.email}</strong>
          </label>
          <input
            type="email"
            value={confirmacion}
            onChange={(e) => { setConfirmacion(e.target.value); setError(''); }}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
            style={{ borderColor: coincide ? '#A7F3D0' : '#E2E8F0', fontFamily: 'Inter', color: '#0F172A' }}
          />
        </div>

        {error && (
          <p
            className="text-xs rounded-lg px-3 py-2.5"
            style={{ background: '#FEF2F2', color: '#B91C1C', fontFamily: 'Inter' }}
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={eliminando}
            className="px-3.5 py-2 text-xs rounded-lg border disabled:opacity-50"
            style={{ borderColor: '#E2E8F0', color: '#475569', fontFamily: 'Inter' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!coincide || eliminando}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-500 rounded-lg text-white disabled:opacity-40"
            style={{ background: '#DC2626', fontFamily: 'Inter' }}
          >
            {eliminando && <Loader2 size={13} className="animate-spin" />}
            {eliminando ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </form>
    </ModalBase>
  );
}

// ─── Textos de permisos ────────────────────────────────────────────────────────

const PERMISOS_ADMIN = [
  'Ver todas las estadísticas y reportes',
  'Importar los Excel de ventas y cartera',
  'Crear cuentas de usuario y asignar roles',
  'Eliminar cuentas y revocar el acceso de ex-empleados',
];

const PERMISOS_CONSULTA = [
  'Ver todas las estadísticas y reportes',
  'Consultar clientes, productos, marcas y ventas',
  'No puede importar los Excel ni administrar usuarios',
  'No puede eliminar cuentas: esa operación es del administrador',
];