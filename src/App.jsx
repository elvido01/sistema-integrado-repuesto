
import React from 'react';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/SupabaseAuthContext';
import { PanelProvider } from '@/contexts/PanelContext';
import { FacturacionProvider } from '@/contexts/FacturacionContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import MainLayout from '@/components/layout/MainLayout';
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
    <PanelProvider>
      <MainLayout />
    </PanelProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FacturacionProvider>
          <Helmet>
            <title>Repuestos Morla - Sistema Integrado</title>
            <meta name="description" content="Sistema Integrado de Información Financiera para la gestión de Repuestos Morla." />
            <link rel="icon" href="/favicon.ico" type="image/x-icon" />
          </Helmet>
          <AppContent />
          <Toaster />
        </FacturacionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
  