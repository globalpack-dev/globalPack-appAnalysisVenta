import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Pantalla de acceso.
 *
 * Es una pantalla centrada a pantalla completa, distinta del layout de las páginas
 * internas (que van dentro del sidebar). Por eso no reutiliza `Card`: el fondo, el
 * ancho máximo y el centrado son diferentes.
 *
 * No hay "olvidé mi contraseña": las 3 cuentas las crea el administrador de
 * Supabase. Agregar recuperación por email sería otra dependencia (mails) y otro
 * camino de ataque.
 */
export default function Login() {
  const { ingresar, error } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [campoError, setCampoError] = useState<string | null>(null);

  async function manejarEnvio(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;

    if (!email.trim() || !password) {
      setCampoError('Completá el correo y la contraseña.');
      return;
    }

    setCampoError(null);
    setEnviando(true);
    const ok = await ingresar(email, password);
    // No hay que limpiar nada si salió bien: el guard de App.tsx reemplaza
    // esta pantalla apenas hay sesión.
    if (!ok) setEnviando(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#F1F5F9' }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ background: '#1D4ED8' }}
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
              <polyline
                points="1,13 5,8 8,11 12,5 15,8"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <circle cx="12.5" cy="3.5" r="1.8" fill="white" opacity="0.85" />
            </svg>
          </div>
          <div>
            <div className="text-base leading-none" style={{ fontFamily: 'Outfit', color: '#0F172A' }}>
              AnalyticsBI
            </div>
            <div className="text-[11px] mt-1" style={{ fontFamily: 'Inter', color: '#94A3B8' }}>
              Gestión Comercial
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form
          onSubmit={manejarEnvio}
          className="bg-white rounded-xl border p-6 shadow-sm"
          style={{ borderColor: '#E2E8F0' }}
        >
          <h1 className="text-base mb-1" style={{ fontFamily: 'Outfit', color: '#0F172A' }}>
            Iniciar sesión
          </h1>
          <p className="text-xs mb-5" style={{ fontFamily: 'Inter', color: '#94A3B8' }}>
            Ingresá con tu cuenta de Global Pack.
          </p>

          <div className="space-y-3">
            <div>
              <label
                className="text-xs mb-1.5 block"
                style={{ fontFamily: 'Inter', color: '#64748B' }}
                htmlFor="email"
              >
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@globalpack.com.ar"
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-colors"
                style={{
                  borderColor: email ? '#1D4ED8' : '#E2E8F0',
                  background: email ? '#EFF6FF' : 'white',
                  fontFamily: 'Inter',
                  color: '#0F172A',
                }}
              />
            </div>

            <div>
              <label
                className="text-xs mb-1.5 block"
                style={{ fontFamily: 'Inter', color: '#64748B' }}
                htmlFor="password"
              >
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition-colors"
                style={{
                  borderColor: password ? '#1D4ED8' : '#E2E8F0',
                  background: password ? '#EFF6FF' : 'white',
                  fontFamily: 'Inter',
                  color: '#0F172A',
                }}
              />
            </div>
          </div>

          {(campoError || error) && (
            <div
              className="mt-4 rounded-lg px-3 py-2.5 text-xs"
              style={{ background: '#FEF2F2', color: '#B91C1C', fontFamily: 'Inter' }}
            >
              {campoError ?? error}
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-5 w-full py-2.5 text-sm font-500 rounded-lg text-white transition-opacity disabled:opacity-60"
            style={{ background: '#1D4ED8', fontFamily: 'Inter' }}
          >
            {enviando ? 'Verificando…' : 'Ingresar'}
          </button>
        </form>

        <p className="text-[11px] mt-4 text-center" style={{ fontFamily: 'Inter', color: '#94A3B8' }}>
          Sistema de uso interno · Global Pack
        </p>
      </div>
    </div>
  );
}