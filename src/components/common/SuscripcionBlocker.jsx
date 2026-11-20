import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XOctagon, Phone, Mail, RefreshCw, Shield, CreditCard, PauseCircle, PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';

// (19/11/2026) Fase 5: empresa FREE en pausa por 7 días sin uso. Los datos
// siguen ahí; la primera vez se reactiva gratis, después con el plan Básico.
const PausaBlocker = () => {
  const { suscripcion, reactivarEmpresa } = useSuscripcion();
  const { signOut } = useAuth();
  const { openPanel } = usePanels();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const gratis = suscripcion?.puede_reactivar_gratis !== false;
  const esAdmin = suscripcion?.es_admin !== false;

  const reactivar = async () => {
    setEnviando(true); setError('');
    try { await reactivarEmpresa(); } catch (e) { setError(e?.message || 'No se pudo reactivar.'); }
    finally { setEnviando(false); }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-5 text-center">
          <PauseCircle className="mx-auto mb-3 h-14 w-14 text-white" />
          <h2 className="text-xl font-black uppercase tracking-wide text-white">Empresa en pausa</h2>
          <p className="mt-1 text-sm text-amber-50">Pasaron 7 días sin usar MotoFlow</p>
        </div>
        <div className="space-y-3 px-6 py-5 text-sm text-gray-700">
          <p>{suscripcion?.mensaje}</p>
          <p className="text-xs text-gray-500">
            En el plan Gratis las empresas que no se usan se pausan, igual que en otros servicios gratuitos.
            Con un plan pagado tu empresa nunca se pausa.
          </p>
          {!esAdmin && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
              Pídele al dueño o a un administrador de la empresa que entre y la reactive.
            </p>
          )}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        </div>
        <div className="flex flex-col gap-2 border-t border-gray-200 bg-gray-50 px-6 py-4">
          {gratis && esAdmin && (
            <Button onClick={reactivar} disabled={enviando}
              className="h-10 w-full bg-emerald-600 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-700">
              <PlayCircle className="mr-2 h-4 w-4" /> {enviando ? 'Reactivando…' : 'Reactivar gratis'}
            </Button>
          )}
          {esAdmin && (
            <Button onClick={() => openPanel('planes')} variant={gratis ? 'outline' : 'default'}
              className={`h-10 w-full text-xs font-bold uppercase tracking-wider ${gratis ? '' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              <CreditCard className="mr-2 h-4 w-4" /> {gratis ? 'Ver planes (nunca se pausan)' : 'Elegir el plan Básico'}
            </Button>
          )}
          <Button variant="ghost" onClick={signOut} className="h-8 w-full text-xs font-medium text-gray-500 hover:text-gray-700">
            Cerrar Sesión
          </Button>
        </div>
      </div>
    </div>
  );
};

const SuscripcionBlocker = () => {
  const { isVencida, isPausada, loading, planActual, suscripcion } = useSuscripcion();
  const { isSuperAdmin, signOut } = useAuth();
  const { openPanel, activePanel } = usePanels();

  const isEnRevision = suscripcion?.pago_pendiente;

  if (!isSuperAdmin && !loading && isPausada && activePanel !== 'planes') return <PausaBlocker />;

  // Never block: superadmins, loading, not expired, or payment under review (client keeps working)
  if (isSuperAdmin || loading || !isVencida || isEnRevision || activePanel === 'planes') return null;

  // Standard expired blocker (only when NO pending payment)
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        >
          <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-5 text-center">
            <motion.div
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <XOctagon className="w-14 h-14 text-white mx-auto mb-3" />
            </motion.div>
            <h2 className="text-xl font-black text-white tracking-wide uppercase">
              Sistema Bloqueado
            </h2>
            <p className="text-red-200 text-sm mt-1">
              Su suscripción ha expirado
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-sm text-red-800 font-medium leading-relaxed">
                {suscripcion?.mensaje || 'Su período de prueba o suscripción ha vencido. Renueve su plan para continuar.'}
              </p>
            </div>

            {planActual && (
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Plan Anterior</span>
                </div>
                <p className="text-lg font-black text-gray-800">{planActual}</p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Contactar para renovar (WhatsApp solo mensajes)</p>
              <div className="flex gap-2">
                {/* (20/11/2026) WhatsApp de MotoFlow: 809-769-5965, SOLO WhatsApp
                    (el 809-390-5965 es de Repuestos Morla). */}
                <a href="https://wa.me/18097695965" target="_blank" rel="noopener noreferrer" title="809-769-5965 · solo WhatsApp, no recibe llamadas"
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg py-2.5 px-3 text-xs font-bold transition-colors border border-emerald-200">
                  <Phone className="w-3.5 h-3.5" /> WhatsApp 809-769-5965
                </a>
                <a href="mailto:ventasmotoflowrd@gmail.com" className="flex-1 flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg py-2.5 px-3 text-xs font-bold transition-colors border border-indigo-200">
                  <Mail className="w-3.5 h-3.5" /> Email
                </a>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col gap-2">
            <Button
              onClick={() => openPanel('planes')}
              className="w-full h-10 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold uppercase tracking-wider text-xs shadow-md"
            >
              <CreditCard className="w-4 h-4 mr-2" />
              Ver Planes y Renovar
            </Button>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="w-full h-9 font-bold uppercase tracking-wider text-xs"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Ya renové — Verificar de nuevo
            </Button>
            <Button
              variant="ghost"
              onClick={signOut}
              className="w-full h-8 text-gray-500 hover:text-gray-700 text-xs font-medium"
            >
              Cerrar Sesión
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SuscripcionBlocker;
