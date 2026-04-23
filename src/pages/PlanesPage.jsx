import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Shield, Sparkles, Clock, Check, X, Zap,
  Users, Package, FileText, Warehouse, BarChart3,
  Camera, Globe, ChevronRight, Star, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import PagoTransferenciaModal from '@/components/suscripcion/PagoTransferenciaModal';

const PlanesPage = () => {
  const { planes, planActual, suscripcion } = useSuscripcion();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPagoModal, setShowPagoModal] = useState(false);

  const planMeta = {
    TRIAL:      { icon: Clock,    gradient: 'from-amber-500 to-orange-500',   color: 'amber',   badge: 'Prueba Gratis',   popular: false },
    BASICO:     { icon: Shield,   gradient: 'from-blue-500 to-indigo-500',    color: 'blue',    badge: 'Ideal para iniciar', popular: false },
    PRO:        { icon: Crown,    gradient: 'from-emerald-500 to-teal-500',   color: 'emerald', badge: 'Más Popular',     popular: true },
    ENTERPRISE: { icon: Sparkles, gradient: 'from-purple-500 to-violet-500',  color: 'purple',  badge: 'Todo Ilimitado',  popular: false },
  };

  const featureList = [
    { key: 'limite_usuarios',   label: 'Usuarios',           icon: Users,      format: v => v >= 99999 ? 'Ilimitados' : v },
    { key: 'limite_productos',  label: 'Productos',          icon: Package,    format: v => v >= 99999 ? 'Ilimitados' : v?.toLocaleString() },
    { key: 'limite_facturas',   label: 'Facturas/mes',       icon: FileText,   format: v => v === null ? 'Ilimitadas' : v?.toLocaleString() },
    { key: 'limite_almacenes',  label: 'Almacenes',          icon: Warehouse,  format: v => v >= 99 ? 'Ilimitados' : v },
  ];

  const boolFeatures = [
    { key: 'feat_cotizaciones_magna', label: 'Cotizaciones Avanzadas' },
    { key: 'feat_carta_ruta',         label: 'Carta de Ruta' },
    { key: 'feat_cobranzas',          label: 'Módulo de Cobranzas' },
    { key: 'feat_reportes_avanzados', label: 'Reportes Avanzados' },
    { key: 'feat_ocr_facturas',       label: 'OCR de Facturas' },
    { key: 'feat_api_access',         label: 'Acceso API' },
  ];

  const handleSelectPlan = (plan) => {
    if (plan.nombre === 'TRIAL') return;
    setSelectedPlan(plan);
    setShowPagoModal(true);
  };

  const isCurrentPlan = (nombre) => planActual === nombre;
  const pagoPendiente = suscripcion?.pago_pendiente;

  const paidPlanes = planes.filter(p => p.nombre !== 'TRIAL');

  return (
    <div className="min-h-full bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a0a3a] to-[#3a1a5c] text-white px-6 py-10 text-center">
        <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Zap className="w-6 h-6 text-yellow-400" />
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-wider">
              Planes y Precios
            </h1>
          </div>
          <p className="text-white/70 text-sm max-w-xl mx-auto">
            Elige el plan que mejor se adapte a tu negocio.
            Todos los planes incluyen soporte técnico y actualizaciones.
          </p>
        </motion.div>
      </div>

      {/* Alerta pago pendiente */}
      {pagoPendiente && (
        <motion.div
          initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="max-w-5xl mx-auto mt-6 px-4"
        >
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <Loader2 className="w-5 h-5 text-amber-500 animate-spin mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-amber-800 text-sm">Pago en revisión</p>
              <p className="text-amber-700 text-xs mt-1">
                Su comprobante de pago está siendo verificado. Recibirá confirmación en las próximas 24 horas.
                No necesita realizar otro pago.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Plans Grid */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {paidPlanes.map((plan, i) => {
            const meta = planMeta[plan.nombre] || planMeta.BASICO;
            const PlanIcon = meta.icon;
            const isCurrent = isCurrentPlan(plan.nombre);

            return (
              <motion.div
                key={plan.id}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
                className={`relative rounded-2xl border-2 overflow-hidden transition-all hover:shadow-xl ${
                  meta.popular
                    ? 'border-emerald-400 shadow-lg shadow-emerald-100 scale-[1.02]'
                    : 'border-gray-200 shadow-sm'
                } ${isCurrent ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
              >
                {/* Popular badge */}
                {meta.popular && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl flex items-center gap-1">
                    <Star className="w-3 h-3 fill-white" />
                    {meta.badge}
                  </div>
                )}

                {/* Current plan badge */}
                {isCurrent && (
                  <div className="absolute top-0 left-0 bg-blue-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-br-xl">
                    Plan Actual
                  </div>
                )}

                {/* Header */}
                <div className={`bg-gradient-to-r ${meta.gradient} px-6 py-6 text-center`}>
                  <div className="w-14 h-14 mx-auto bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm mb-3">
                    <PlanIcon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-white font-black text-xl uppercase tracking-wider">{plan.nombre}</h3>
                  <p className="text-white/70 text-xs mt-1">{plan.descripcion}</p>
                </div>

                {/* Precio */}
                <div className="text-center py-5 border-b border-gray-100 bg-white">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-gray-400 text-lg font-bold">RD$</span>
                    <span className="text-4xl font-black text-gray-900">
                      {plan.precio?.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs font-medium mt-1">
                    por mes · {plan.duracion_dias} días
                  </p>
                </div>

                {/* Features */}
                <div className="px-6 py-5 space-y-3 bg-white">
                  {/* Límites */}
                  {featureList.map(feat => (
                    <div key={feat.key} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-600">
                        <feat.icon className="w-4 h-4 text-gray-400" />
                        {feat.label}
                      </span>
                      <span className="text-sm font-black text-gray-900">
                        {feat.format(plan[feat.key])}
                      </span>
                    </div>
                  ))}

                  <hr className="border-gray-100" />

                  {/* Boolean features */}
                  {boolFeatures.map(feat => (
                    <div key={feat.key} className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">{feat.label}</span>
                      {plan[feat.key] ? (
                        <Check className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <X className="w-5 h-5 text-gray-300" />
                      )}
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="px-6 pb-6 pt-2 bg-white">
                  <Button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={isCurrent || pagoPendiente}
                    className={`w-full h-11 font-black uppercase tracking-wider text-xs shadow-md transition-all ${
                      isCurrent
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : pagoPendiente
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : `bg-gradient-to-r ${meta.gradient} hover:opacity-90 text-white`
                    }`}
                  >
                    {isCurrent ? 'Plan Actual' : pagoPendiente ? 'Pago en Revisión' : (
                      <>
                        Seleccionar Plan
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Footer info */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="mt-10 text-center space-y-3"
        >
          <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-gray-400">
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Sin contratos</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Cancela cuando quieras</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Soporte incluido</span>
            <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" /> Actualizaciones gratis</span>
          </div>
          <p className="text-xs text-gray-400">
            Pago por transferencia bancaria. Su plan se activa tras verificación del comprobante (máx. 24h).
          </p>
        </motion.div>
      </div>

      {/* Modal de pago */}
      {showPagoModal && selectedPlan && (
        <PagoTransferenciaModal
          plan={selectedPlan}
          onClose={() => { setShowPagoModal(false); setSelectedPlan(null); }}
        />
      )}
    </div>
  );
};

export default PlanesPage;
