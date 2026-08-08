import React, { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import PanelManager from '@/components/layout/PanelManager';
import SuscripcionAlert from '@/components/common/SuscripcionAlert';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { setEmpresaPrintConfig } from '@/lib/printPOS';
import { LayoutProvider } from '@/contexts/LayoutContext';
import JarvisAdminAssistant from '@/components/jarvis/JarvisAdminAssistant';

// El agente acompaña en TODO el sistema, no en tres pantallas.
//
// Antes vivía solo en el inicio, cuando era un asesor al que uno iba a
// consultar. Ahora abre módulos y prepara cotizaciones: si desaparece justo
// cuando te lleva a Cotizaciones, no puedes autorizar lo que él mismo acaba
// de proponer — que es exactamente donde hace falta.
//
// Quién lo ve sigue decidiéndose en el propio componente: solo admin, y solo
// si su empresa tiene agente configurado.

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { empresa } = useAuth();
  const nombreEmpresa = empresa?.nombre || 'Sistema';

  useEffect(() => {
    if (empresa) setEmpresaPrintConfig(empresa);
  }, [empresa]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ml-0 ${sidebarOpen ? 'md:ml-[260px]' : 'md:ml-20'
          }`}
      >
        <SuscripcionAlert />
        <Header setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 min-h-0 min-w-0 overflow-hidden">
          <LayoutProvider sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}>
            <PanelManager />
          </LayoutProvider>
        </main>
        <footer className="text-center py-2 text-[10px] text-gray-400 dark:text-gray-600 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          © {new Date().getFullYear()} {nombreEmpresa} — Sistema de Gestión Integral
        </footer>
        <JarvisAdminAssistant />
      </div>
    </div>
  );
};

export default MainLayout;
