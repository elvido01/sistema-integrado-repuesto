import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/SupabaseAuthContext';
import { SuscripcionProvider } from '@/contexts/SuscripcionContext';
import { PanelProvider } from '@/contexts/PanelContext';
import { FacturacionProvider } from '@/contexts/FacturacionContext';
import { ComprasProvider } from '@/contexts/ComprasContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import MainLayout from '@/components/layout/MainLayout';
import SuscripcionBlocker from '@/components/common/SuscripcionBlocker';
import LoginForm from '@/components/auth/LoginForm';
import RegistroEmpresaPage from '@/pages/RegistroEmpresaPage';
import TiendaPage from '@/pages/TiendaPage';

function AppContent() {
  const { session, loading, user, empresa } = useAuth();
  const [showRegistro, setShowRegistro] = useState(
    window.location.pathname === '/registro'
  );

  const nombreSaaS = empresa?.nombre || 'MotoFlow';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!session || !user) {
    if (showRegistro) {
      return (
        <RegistroEmpresaPage
          onVolver={() => {
            window.history.pushState({}, '', '/');
            setShowRegistro(false);
          }}
        />
      );
    }
    return (
      <>
        <Helmet>
          <title>{nombreSaaS} — Iniciar Sesión</title>
        </Helmet>
        <LoginForm
          onRegistrar={() => {
            window.history.pushState({}, '', '/registro');
            setShowRegistro(true);
          }}
        />
      </>
    );
  }

  return (
    <SuscripcionProvider>
      <PanelProvider>
        <Helmet>
          <title>{nombreSaaS} — Sistema de Gestión</title>
          <meta
            name="description"
            content={`Sistema inteligente para gestionar inventario, ventas y finanzas en ${nombreSaaS}.`}
          />
        </Helmet>
        <SuscripcionBlocker />
        <MainLayout />
      </PanelProvider>
    </SuscripcionProvider>
  );
}

function App() {
  // ── Tienda pública: se renderiza FUERA del AuthProvider ──
  // No requiere login, no carga sidebar, no necesita contextos internos.
  // Solo necesita HelmetProvider y BrowserRouter (ya montados en main.jsx).
  const isTienda = window.location.pathname.startsWith('/tienda');
  if (isTienda) {
    return <TiendaPage />;
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <FacturacionProvider>
          <ComprasProvider>
            <AppContent />
            <Toaster />
          </ComprasProvider>
        </FacturacionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
