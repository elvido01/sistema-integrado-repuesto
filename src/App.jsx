import React, { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/SupabaseAuthContext';
import { SuscripcionProvider } from '@/contexts/SuscripcionContext';
import { PanelProvider, usePanels } from '@/contexts/PanelContext';
import { FacturacionProvider } from '@/contexts/FacturacionContext';
import { ComprasProvider } from '@/contexts/ComprasContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { WhatsAppNotificationProvider } from '@/contexts/WhatsAppNotificationContext';
import MainLayout from '@/components/layout/MainLayout';
import SuscripcionBlocker from '@/components/common/SuscripcionBlocker';
import LoginForm from '@/components/auth/LoginForm';
import NuevaPasswordForm from '@/components/auth/NuevaPasswordForm';
import RegistroEmpresaPage from '@/pages/RegistroEmpresaPage';
import TiendaPage from '@/pages/TiendaPage';
import PrivacyPolicyPage from '@/pages/PrivacyPolicyPage';

function PanelDeepLinkHandler() {
  const { openPanel } = usePanels();
  const handledRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const panel = params.get('mf_panel');
    const clienteId = params.get('clienteId');
    if (panel !== 'recibo-pago' || !clienteId) return;

    const requestedAt = params.get('requestedAt') || String(Date.now());
    const key = `${panel}:${clienteId}:${requestedAt}`;
    if (handledRef.current === key) return;
    handledRef.current = key;

    openPanel('recibo-pago', {
      clienteId,
      prestamoId: params.get('prestamoId') || null,
      requestedAt,
      cliente: {
        id: clienteId,
        codigo: params.get('clienteCodigo') || '',
        nombre: params.get('clienteNombre') || '',
        rnc: params.get('clienteRnc') || '',
        direccion: params.get('clienteDireccion') || '',
        telefono: params.get('clienteTelefono') || '',
      },
    });

    const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, '', cleanUrl);
  }, [openPanel]);

  return null;
}

function AppContent() {
  const { session, loading, user, empresa, recuperando } = useAuth();
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

  // Vino del enlace de recuperación: hay sesión, pero primero la contraseña
  // nueva. Va antes del check de sesión porque el enlace SÍ crea sesión.
  if (recuperando) {
    return (
      <>
        <Helmet><title>{nombreSaaS} — Nueva contraseña</title></Helmet>
        <NuevaPasswordForm />
      </>
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
        <WhatsAppNotificationProvider>
        <PanelDeepLinkHandler />
        <Helmet>
          <title>{nombreSaaS} — Sistema de Gestión</title>
          <meta
            name="description"
            content={`Sistema inteligente para gestionar inventario, ventas y finanzas en ${nombreSaaS}.`}
          />
        </Helmet>
        <SuscripcionBlocker />
        <MainLayout />
        </WhatsAppNotificationProvider>
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

  const publicLegalPaths = new Set([
    '/privacy',
    '/privacy-policy',
    '/politica-privacidad',
  ]);
  if (publicLegalPaths.has(window.location.pathname)) {
    return <PrivacyPolicyPage />;
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
