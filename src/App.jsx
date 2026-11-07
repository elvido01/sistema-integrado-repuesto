import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
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
const RegistroEmpresaPage = lazy(() => import('@/pages/RegistroEmpresaPage'));
const TiendaPage = lazy(() => import('@/pages/TiendaPage'));
const PrivacyPolicyPage = lazy(() => import('@/pages/PrivacyPolicyPage'));
const SitioColegioPublico = lazy(() => import('@/pages/colegio/SitioColegioPublico'));
import { supabase } from '@/lib/customSupabaseClient';
import { esDominioPropio, urlDeAutenticacion } from '@/lib/colegioSitio';

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

// Páginas públicas con carga diferida (registro, tienda, privacidad).
const CargandoPagina = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-100 text-sm text-gray-400">Cargando…</div>
);

function AppContent() {
  const { session, loading, user, empresa, recuperando } = useAuth();
  const [showRegistro, setShowRegistro] = useState(
    window.location.pathname === '/registro'
  );

  // (20/10/2026) El sistema se llama MotoFlow en todas las empresas; el
  // nombre de la empresa sale en el menú y en sus documentos.
  const nombreSaaS = 'MotoFlow';

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
        <Suspense fallback={<CargandoPagina />}>
          <RegistroEmpresaPage
            onVolver={() => {
              window.history.pushState({}, '', '/');
              setShowRegistro(false);
            }}
          />
        </Suspense>
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
    return <Suspense fallback={<CargandoPagina />}><TiendaPage /></Suspense>;
  }

  const publicLegalPaths = new Set([
    '/privacy',
    '/privacy-policy',
    '/politica-privacidad',
  ]);
  if (publicLegalPaths.has(window.location.pathname)) {
    return <Suspense fallback={<CargandoPagina />}><PrivacyPolicyPage /></Suspense>;
  }

  // ── Página web del colegio (plan Educa Total) ──
  // motoflow.com.do/sitio/<slug> siempre; en el dominio propio del colegio,
  // la raíz "/" (el sistema queda en /entrar).
  const sitio = /^\/sitio\/([a-z0-9-]+)\/?$/i.exec(window.location.pathname);
  if (sitio) {
    return <Suspense fallback={<CargandoPagina />}><SitioColegioPublico slug={sitio[1].toLowerCase()} /></Suspense>;
  }

  const sistema = (
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

  if (esDominioPropio(window.location.hostname) && window.location.pathname === '/'
      && !urlDeAutenticacion(window.location.hash, window.location.search)) {
    return <SitioPorDominio sistema={sistema} />;
  }
  return sistema;
}

// En un dominio propio: si es el de un colegio con página, la enseña; si no
// (otra empresa con dominio propio), sigue al sistema como siempre.
function SitioPorDominio({ sistema }) {
  const dominio = window.location.hostname;
  const [estado, setEstado] = useState({ listo: false, datos: null });
  useEffect(() => {
    let vivo = true;
    supabase.rpc('edu_sitio_publico', { p_dominio: dominio, p_slug: null })
      .then(({ data }) => { if (vivo) setEstado({ listo: true, datos: data || null }); },
            () => { if (vivo) setEstado({ listo: true, datos: null }); });
    return () => { vivo = false; };
  }, [dominio]);
  if (!estado.listo) return <CargandoPagina />;
  if (!estado.datos) return sistema;
  return <Suspense fallback={<CargandoPagina />}><SitioColegioPublico dominio={dominio} datosIniciales={estado.datos} /></Suspense>;
}

export default App;
