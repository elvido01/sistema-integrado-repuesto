import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Crown, Clock, AlertTriangle, XOctagon, Zap, 
  Calendar, Users, Package, ChevronRight, Shield,
  Sparkles, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuscripcion } from '@/contexts/SuscripcionContext';

const SuscripcionStatusCard = ({ onRenovar, compact = false }) => {
  const { 
    suscripcion, loading, isActiva, isVencida, isTrial, 
    diasRestantes, porVencer, planActual
  } = useSuscripcion();

  if (loading || !suscripcion) return null;

  // Plan badge styles
  const planStyles = {
    TRIAL:      { bg: 'bg-amber-500',   ring: 'ring-amber-300', gradient: 'from-amber-500 to-orange-500',   icon: Clock,          text: 'Prueba' },
    BASICO:     { bg: 'bg-blue-500',    ring: 'ring-blue-300',  gradient: 'from-blue-500 to-indigo-500',    icon: Shield,         text: 'Básico' },
    PRO:        { bg: 'bg-emerald-500', ring: 'ring-emerald-300', gradient: 'from-emerald-500 to-teal-500', icon: Crown,          text: 'Profesional' },
    ENTERPRISE: { bg: 'bg-purple-500',  ring: 'ring-purple-300', gradient: 'from-purple-500 to-violet-500', icon: Sparkles,       text: 'Enterprise' },
  };

  const style = planStyles[planActual] || planStyles.TRIAL;
  const PlanIcon = style.icon;

  // Status config
  const getStatusConfig = () => {
    if (isVencida) return {
      color: 'text-red-600',
      bgColor: 'bg-red-50 border-red-200',
      barColor: 'bg-red-500',
      label: 'VENCIDO',
      labelBg: 'bg-red-100 text-red-700',
      icon: XOctagon,
      progressPct: 0
    };
    if (porVencer) return {
      color: 'text-amber-600',
      bgColor: 'bg-amber-50 border-amber-200',
      barColor: 'bg-amber-500',
      label: isTrial ? 'TRIAL POR VENCER' : 'POR VENCER',
      labelBg: 'bg-amber-100 text-amber-700',
      icon: AlertTriangle,
      progressPct: Math.max(5, (diasRestantes / 30) * 100)
    };
    return {
      color: 'text-emerald-600',
      bgColor: 'bg-white border-gray-200',
      barColor: `bg-gradient-to-r ${style.gradient}`,
      label: isTrial ? 'TRIAL ACTIVO' : 'ACTIVO',
      labelBg: 'bg-emerald-100 text-emerald-700',
      icon: Zap,
      progressPct: Math.min(100, Math.max(10, (diasRestantes / 30) * 100))
    };
  };

  const status = getStatusConfig();
  const StatusIcon = status.icon;

  // ── compact mode (for header/sidebar) ──
  if (compact) {
    return (
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${
          isVencida 
            ? 'bg-red-50 border-red-200 text-red-700' 
            : porVencer 
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-emerald-50 border-emerald-100 text-emerald-700'
        }`}
      >
        <StatusIcon className="w-3.5 h-3.5" />
        <span className="uppercase">{planActual || 'Sin Plan'}</span>
        {diasRestantes > 0 && (
          <span className="opacity-70">· {diasRestantes}d</span>
        )}
      </motion.div>
    );
  }

  // ── full card mode ──
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={`rounded-xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${status.bgColor}`}
    >
      {/* Header gradient */}
      <div className={`bg-gradient-to-r ${style.gradient} px-5 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
            <PlanIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest">Plan Actual</p>
            <h3 className="text-white font-black text-lg tracking-wide">{style.text}</h3>
          </div>
        </div>
        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${status.labelBg}`}>
          <span className="flex items-center gap-1">
            <StatusIcon className="w-3 h-3" />
            {status.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4">
        {/* Progress bar */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Tiempo restante
            </span>
            <span className={`text-sm font-black ${status.color}`}>
              {diasRestantes} día{diasRestantes !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${status.progressPct}%` }}
              transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
              className={`h-full rounded-full ${status.barColor}`}
            />
          </div>
          {suscripcion?.fecha_fin && (
            <p className="text-[10px] text-gray-400 mt-1">
              Vence: {new Date(suscripcion.fecha_fin).toLocaleDateString('es-DO', { 
                year: 'numeric', month: 'long', day: 'numeric' 
              })}
            </p>
          )}
        </div>

        {/* Limits info */}
        {suscripcion?.limites && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
              <div className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[10px] font-bold text-gray-500 uppercase">Usuarios</span>
              </div>
              <p className="text-sm font-black text-gray-800 mt-0.5">
                {suscripcion.limites.usuarios === 99999 ? '∞' : suscripcion.limites.usuarios}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
              <div className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-[10px] font-bold text-gray-500 uppercase">Productos</span>
              </div>
              <p className="text-sm font-black text-gray-800 mt-0.5">
                {suscripcion.limites.productos >= 99999 ? '∞' : suscripcion.limites.productos?.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Alert messages */}
        <AnimatePresence>
          {porVencer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5"
            >
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 font-medium">
                Tu suscripción está por vencer en <strong>{diasRestantes} día{diasRestantes !== 1 ? 's' : ''}</strong>. 
                Renueva ahora para no perder el acceso.
              </p>
            </motion.div>
          )}

          {isVencida && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5"
            >
              <XOctagon className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-800 font-medium">
                <strong>Sistema bloqueado.</strong> Tu suscripción ha vencido. 
                Renueva tu plan para continuar usando el sistema.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CTA Button */}
        {(isVencida || porVencer || isTrial) && (
          <Button
            onClick={onRenovar}
            className={`w-full h-10 font-black uppercase tracking-wider text-xs shadow-md transition-all ${
              isVencida 
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' 
                : `bg-gradient-to-r ${style.gradient} hover:opacity-90 text-white`
            }`}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {isVencida ? 'Renovar Ahora' : isTrial ? 'Actualizar Plan' : 'Renovar Plan'}
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        )}
      </div>
    </motion.div>
  );
};

export default SuscripcionStatusCard;
