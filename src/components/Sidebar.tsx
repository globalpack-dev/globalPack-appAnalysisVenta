import { LayoutDashboard, TrendingUp, Users, Package, Tag, Map, Megaphone, FileBarChart, Settings, ChevronRight, LogOut, Briefcase, History } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { inicialesDe, nombreAMostrar, etiquetaDeRol } from '../lib/usuario';

export type Page = 'dashboard' | 'sales' | 'customers' | 'products' | 'brands' | 'promoters' | 'supervisors' | 'marketing' | 'reports' | 'cargas' | 'settings';

const navItems: { id: Page; label: string; icon: React.ReactNode; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} />, group: 'main' },
  { id: 'sales', label: 'Ventas', icon: <TrendingUp size={16} />, group: 'main' },
  { id: 'customers', label: 'Clientes', icon: <Users size={16} />, group: 'analysis' },
  { id: 'products', label: 'Productos', icon: <Package size={16} />, group: 'analysis' },
  { id: 'brands', label: 'Marcas', icon: <Tag size={16} />, group: 'analysis' },
  { id: 'promoters', label: 'Promotores', icon: <Map size={16} />, group: 'analysis' },
  { id: 'supervisors', label: 'Supervisores', icon: <Briefcase size={16} />, group: 'analysis' },
  { id: 'marketing', label: 'Marketing', icon: <Megaphone size={16} />, group: 'analysis' },
  { id: 'reports', label: 'Reportes', icon: <FileBarChart size={16} />, group: 'tools' },
  { id: 'cargas', label: 'Cargas', icon: <History size={16} />, group: 'tools' },
  { id: 'settings', label: 'Configuración', icon: <Settings size={16} />, group: 'tools' },
];

const groups = [
  { id: 'main', label: 'GENERAL' },
  { id: 'analysis', label: 'ANÁLISIS' },
  { id: 'tools', label: 'HERRAMIENTAS' },
];

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { empleado, salir } = useAuth();

  return (
    <aside className="fixed top-0 left-0 h-screen w-[220px] flex flex-col z-20 select-none" style={{ background: '#0A1628' }}>
      {/* Logo */}
      <div className="px-5 py-4 flex items-center gap-2.5" style={{ borderBottom: '1px solid #1a2744' }}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: '#1D4ED8' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <polyline points="1,13 5,8 8,11 12,5 15,8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            <circle cx="12.5" cy="3.5" r="1.8" fill="white" opacity="0.85"/>
          </svg>
        </div>
        <div>
          <div className="text-sm font-600 text-white leading-none" style={{ fontFamily: 'Outfit' }}>AnalyticsBI</div>
          <div className="text-[10px] mt-0.5 leading-none" style={{ color: '#3B5A8A', fontFamily: 'Inter' }}>Gestión Comercial</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 py-3 overflow-y-auto space-y-4">
        {groups.map((group) => {
          const items = navItems.filter((n) => n.group === group.id);
          return (
            <div key={group.id}>
              <div className="px-2.5 mb-1.5 text-[10px] font-600 tracking-widest" style={{ color: '#2D4A6E', fontFamily: 'Inter' }}>
                {group.label}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => onNavigate(item.id)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-all text-[13px]"
                        style={{
                          background: active ? '#1D3A6A' : 'transparent',
                          color: active ? '#E2E8F0' : '#4A6FA0',
                          fontFamily: 'Inter',
                          fontWeight: active ? 500 : 400,
                        }}
                        onMouseEnter={(e) => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = '#131E35'; (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; } }}
                        onMouseLeave={(e) => { if (!active) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#4A6FA0'; } }}
                      >
                        <span style={{ color: active ? '#60A5FA' : 'inherit', flexShrink: 0 }}>{item.icon}</span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {active && <ChevronRight size={12} style={{ color: '#60A5FA', flexShrink: 0 }} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-4 py-3.5" style={{ borderTop: '1px solid #1a2744' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-600 text-white flex-shrink-0" style={{ background: '#1D4ED8', fontFamily: 'Outfit' }}>
            {inicialesDe(empleado?.nombre, empleado?.email)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-500 text-white truncate" style={{ fontFamily: 'Inter' }}>
              {nombreAMostrar(empleado?.nombre, empleado?.email)}
            </div>
            <div className="text-[10px] truncate" style={{ color: '#2D4A6E', fontFamily: 'Inter' }}>
              {empleado ? etiquetaDeRol(empleado.rol) : ''}
            </div>
          </div>
          <button
            onClick={() => void salir()}
            title="Cerrar sesión"
            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ color: '#4A6FA0' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#131E35'; e.currentTarget.style.color = '#94A3B8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#4A6FA0'; }}
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
