import { useState } from 'react';
import { ChevronRight, Lock, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { inicialesDe, nombreAMostrar } from '../lib/usuario';
import ModalCargarExcel from './ui/ModalCargarExcel';

const pageMeta: Record<string, { title: string; crumbs?: string[] }> = {
  dashboard: { title: 'Dashboard General' },
  sales: { title: 'Ventas', crumbs: ['Ventas'] },
  customers: { title: 'Clientes', crumbs: ['Clientes'] },
  products: { title: 'Productos', crumbs: ['Productos'] },
  brands: { title: 'Marcas', crumbs: ['Marcas'] },
  promoters: { title: 'Promotores de Venta', crumbs: ['Promotores'] },
  supervisors: { title: 'Supervisores', crumbs: ['Supervisores'] },
  marketing: { title: 'Marketing', crumbs: ['Marketing'] },
  reports: { title: 'Reportes', crumbs: ['Reportes'] },
  cargas: { title: 'Historial de cargas', crumbs: ['Cargas'] },
  settings: { title: 'Configuración', crumbs: ['Configuración'] },
};

interface TopBarProps {
  activePage: string;
  detail?: string;
}

export default function TopBar({ activePage, detail }: TopBarProps) {
  const meta = pageMeta[activePage] ?? { title: activePage };
  const { empleado, esAdmin } = useAuth();
  const [cargaAbierta, setCargaAbierta] = useState(false);

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-white flex-shrink-0" style={{ borderBottom: '1px solid #E2E8F0' }}>
      {/* Breadcrumb + title */}
      <div className="flex items-center gap-2">
        {meta.crumbs && (
          <>
            <span className="text-xs" style={{ color: '#94A3B8', fontFamily: 'Inter' }}>Inicio</span>
            <ChevronRight size={12} style={{ color: '#CBD5E1' }} />
          </>
        )}
        {meta.crumbs?.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <ChevronRight size={12} style={{ color: '#CBD5E1' }} />}
            <span className="text-xs" style={{ color: detail ? '#94A3B8' : '#0F172A', fontFamily: 'Inter', fontWeight: detail ? 400 : 500 }}>{crumb}</span>
          </span>
        ))}
        {detail && (
          <>
            <ChevronRight size={12} style={{ color: '#CBD5E1' }} />
            <span className="text-xs font-500" style={{ color: '#0F172A', fontFamily: 'Inter' }}>{detail}</span>
          </>
        )}
        {!meta.crumbs && (
          <h1 className="text-sm font-600" style={{ color: '#0F172A', fontFamily: 'Outfit' }}>{meta.title}</h1>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2.5">
        <span title={esAdmin ? 'Cargar un Excel de Global Pack' : 'Requiere rol administrador'}>
          <button
            onClick={() => setCargaAbierta(true)}
            disabled={!esAdmin}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-500 transition-colors"
            style={
              esAdmin
                ? { background: '#F1F5F9', color: '#64748B', fontFamily: 'Inter' }
                : { background: '#F8FAFC', color: '#94A3B8', fontFamily: 'Inter', cursor: 'not-allowed' }
            }
          >
            {esAdmin ? <Upload size={13} /> : <Lock size={13} />} Cargar datos
          </button>
        </span>
        <button className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-md" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-600 text-white" style={{ background: '#1D4ED8', fontFamily: 'Outfit' }}>
            {inicialesDe(empleado?.nombre, empleado?.email)}
          </div>
          <span className="text-xs font-500 hidden md:block" style={{ color: '#0F172A', fontFamily: 'Inter' }}>
            {nombreAMostrar(empleado?.nombre, empleado?.email)}
          </span>
        </button>
      </div>

      {cargaAbierta && <ModalCargarExcel onCerrar={() => setCargaAbierta(false)} />}
    </header>
  );
}