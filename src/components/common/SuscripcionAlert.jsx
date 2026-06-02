import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, ChevronRight, Clock } from 'lucide-react';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';

/**
 * SuscripcionAlert
 * 
 * Dismissible banner shown at top of layout when subscription is about to expire.
 * Only shown when dias_restantes <= 3 and subscription is still active.
 */
const SuscripcionAlert = ({ onRenovar }) => {
  const { porVencer, diasRestantes, isTrial, isVencida } = useSuscripcion();
  const { isSuperAdmin } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if dismissed, not about to expire, or is superadmin
  if (dismissed || isSuperAdmin || (!porVencer && !isVencida)) return null;

  // Determine urgency
  const isUrgent = diasRestantes <= 1;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className={`relative overflow-hidden ${
          isUrgent || isVencida
            ? 'bg-gradient-to-r from-red-600 to-red-500'
            : 'bg-gradient-to-r from-amber-500 to-orange-500'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <motion.div
              animate={{ rotate: [0, -15, 15, -15, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
            >
              <AlertTriangle className="w-4 h-4 text-white shrink-0" />
            </motion.div>
            <p className="text-white text-xs font-bold truncate">
              {isVencida ? (
                '⚠️ Tu suscripción ha vencido. El sistema está bloqueado hasta que renueves.'
              ) : (
                <>
                  <Clock className="w-3 h-3 inline mr-1" />
                  {isTrial ? 'Tu período de prueba' : 'Tu suscripción'} vence en{' '}
                  <strong className="text-yellow-100">{diasRestantes} día{diasRestantes !== 1 ? 's' : ''}</strong>.
                  {' '}Paga ahora para no perder el acceso.
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRenovar && (
              <button
                onClick={onRenovar}
                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-colors"
              >
                Pagar <ChevronRight className="w-3 h-3" />
              </button>
            )}
            {!isVencida && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-3.5 h-3.5 text-white/70 hover:text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Animated shimmer effect */}
        <motion.div
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
        />
      </motion.div>
    </AnimatePresence>
  );
};

export default SuscripcionAlert;
