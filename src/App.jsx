import React from 'react';
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

function AppContent() {
  const { session, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!session || !user) {
    return <LoginForm />;
  }

  return (
    <SuscripcionProvider>
      <PanelProvider>
        <SuscripcionBlocker />
        <MainLayout />
      </PanelProvider>
    </SuscripcionProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FacturacionProvider>
          <ComprasProvider>
            <Helmet>
              <title>MotoFlow — Sistema SaaS de gestión</title>
              <meta
                name="description"
                content="Sistema inteligente para gestionar inventario, ventas y finanzas en negocios de motos y talleres."
              />
              <link rel="icon" href="/favicon.ico" type="image/x-icon" />
            </Helmet>
            <AppContent />
            <Toaster />
          </ComprasProvider>
        </FacturacionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
