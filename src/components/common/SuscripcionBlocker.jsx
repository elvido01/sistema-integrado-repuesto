import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XOctagon, Phone, Mail, RefreshCw, Shield, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/PanelContext';

const SuscripcionBlocker = () => {
  const { isVencida, loading, planActual, suscripcion } = useSuscripcion();
  const { isSuperAdmin, signOut } = useAuth();
  const { openPanel, activePanel } = usePanels();

  const isEnRevision = suscripcion?.pago_pendiente;

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
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Contactar para renovar</p>
              <div className="flex gap-2">
                <a href="tel:+18095551234" className="flex-1 flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg py-2.5 px-3 text-xs font-bold transition-colors border border-blue-200">
                  <Phone className="w-3.5 h-3.5" /> Llamar
                </a>
                <a href="mailto:soporte@motoflow.app" className="flex-1 flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg py-2.5 px-3 text-xs font-bold transition-colors border border-indigo-200">
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
