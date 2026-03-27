import React, { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import PanelManager from '@/components/layout/PanelManager';
import SuscripcionAlert from '@/components/common/SuscripcionAlert';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { setEmpresaPrintConfig } from '@/lib/printPOS';

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
        className={`flex-1 flex flex-col transition-all duration-300 ml-0 ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'
          }`}
      >
        <SuscripcionAlert />
        <Header setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 overflow-y-auto">
          <PanelManager />
        </main>
        <footer className="text-center py-2 text-[10px] text-gray-400 dark:text-gray-600 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          © 2026 {nombreEmpresa} — Powered by MotoFlow
        </footer>
      </div>
    </div>
  );
};

export default MainLayout;