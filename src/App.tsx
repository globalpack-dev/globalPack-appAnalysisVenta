import { useState } from 'react';
import Sidebar, { type Page } from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './pages/Dashboard';
import Sales from './pages/Sales';
import Customers from './pages/Customers';
import Products from './pages/Products';
import Brands from './pages/Brands';
import Promotores from './pages/Promotores';
import Supervisors from './pages/Supervisors';
import Marketing from './pages/Marketing';
import Reports from './pages/Reports';
import Cargas from './pages/Cargas';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { useAuth } from './context/AuthContext';

export default function App() {
  const [activePage, setActivePage] = useState<Page>('dashboard');
  const { session, empleado, cargando } = useAuth();

  // Sin router: la navegación es estado en memoria. El login entra por acá.
  //
  // El orden importa. `cargando` va primero porque mientras se resuelve
  // `getSession()` todavía no sabemos si hay sesión; sin este chequeo, un usuario
  // con la sesión activa vería el login un instante al recargar.
  if (cargando) return <PantallaCarga />;
  if (!session) return <Login />;

  // El usuario se queda sin perfil si la fila de `empleados` no existe, por
  // ejemplo si el trigger no llegó a correr. Sin esto la app entraría con datos
  // a los que las políticas RLS no le permiten llegar.
  if (!empleado) return <PantallaSinPermiso />;

  // `activo = false` lo pone un admin desde Configuración → Usuarios. Sin este
  // chequeo la cuenta seguiría viendo el panel, porque las políticas de lectura
  // sólo exigen estar autenticado.
  if (!empleado.activo) return <PantallaCuentaDesactivada />;

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard />;
      case 'sales': return <Sales />;
      case 'customers': return <Customers />;
      case 'products': return <Products />;
      case 'brands': return <Brands />;
      case 'promoters': return <Promotores />;
      case 'supervisors': return <Supervisors />;
      case 'marketing': return <Marketing />;
      case 'reports': return <Reports />;
      case 'cargas': return <Cargas />;
      case 'settings': return <Settings />;
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F1F5F9' }}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: 220 }}>
        <TopBar activePage={activePage} />
        <main className="flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

/** Estado intermedio mientras se resuelve la sesión. Evita el parpadeo del login. */
function PantallaCarga() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F1F5F9' }}>
      <div className="flex flex-col items-center gap-3">
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
          </svg>
        </div>
        <div className="text-xs" style={{ fontFamily: 'Inter', color: '#94A3B8' }}>
          Cargando…
        </div>
      </div>
    </div>
  );
}

/**
 * El usuario se autenticó pero no tiene fila en `empleados`.
 *
 * Pasa si el trigger `on_auth_user_created` no está creado. Es un problema de
 * configuración de la base, no de la app, así que el mensaje lo dice.
 */
function PantallaSinPermiso() {
  const { session, salir } = useAuth();

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#F1F5F9' }}
    >
      <div
        className="bg-white rounded-xl border p-6 max-w-md w-full"
        style={{ borderColor: '#E2E8F0' }}
      >
        <h1 className="text-base mb-2" style={{ fontFamily: 'Outfit', color: '#0F172A' }}>
          Tu cuenta no está habilitada
        </h1>
        <p className="text-xs mb-4" style={{ fontFamily: 'Inter', color: '#64748B' }}>
          La cuenta <strong>{session?.user?.email}</strong> existe, pero no tiene un
          perfil asignado en la tabla <code>empleados</code>. Sin ese perfil, la base
          de datos no le permite ver nada.
        </p>
        <p
          className="text-xs mb-4 rounded-lg px-3 py-2.5"
          style={{ background: '#FFFBEB', color: '#92400E', fontFamily: 'Inter' }}
        >
          Avisá al administrador. Puede resolverlo con un INSERT en{' '}
          <code>empleados</code> para tu usuario.
        </p>
        <button
          onClick={() => void salir()}
          className="px-4 py-2 text-sm font-500 rounded-lg text-white"
          style={{ background: '#1D4ED8', fontFamily: 'Inter' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

/**
 * La cuenta existe y la contraseña es correcta, pero un administrador la
 * desactivó desde Configuración → Usuarios.
 *
 * Esto bloquea la interfaz. Para revocar también la sesión ya abierta en otro
 * dispositivo hace falta banear o eliminar el usuario desde Supabase Auth: la
 * clave pública no puede invalidar tokens ajenos.
 */
function PantallaCuentaDesactivada() {
  const { session, salir } = useAuth();

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#F1F5F9' }}
    >
      <div
        className="bg-white rounded-xl border p-6 max-w-md w-full"
        style={{ borderColor: '#E2E8F0' }}
      >
        <h1 className="text-base mb-2" style={{ fontFamily: 'Outfit', color: '#0F172A' }}>
          Tu cuenta está desactivada
        </h1>
        <p className="text-xs mb-4" style={{ fontFamily: 'Inter', color: '#64748B' }}>
          La cuenta <strong>{session?.user?.email}</strong> ya no tiene acceso al
          sistema. Contactá a un administrador si creés que es un error.
        </p>
        <button
          onClick={() => void salir()}
          className="px-4 py-2 text-sm font-500 rounded-lg text-white"
          style={{ background: '#1D4ED8', fontFamily: 'Inter' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
