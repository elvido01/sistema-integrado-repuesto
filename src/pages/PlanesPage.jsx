import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Crown, Shield, Sparkles, Clock, Check, X, Zap,
  Users, Package, FileText, Warehouse, BarChart3,
  Camera, Globe, ChevronRight, Star, Loader2, BadgeCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuscripcion } from '@/contexts/SuscripcionContext';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import PagoTransferenciaModal from '@/components/suscripcion/PagoTransferenciaModal';

// Meses gratis al pagar anual (2 = "paga 10, lleva 12" ≈ 17% de ahorro).
// Ajustar aquí si se quiere otro descuento.
const MESES_GRATIS_ANUAL = 2;
const DIAS_ANUAL = 365;

// (07/11/2026) Precio especial pactado con una empresa (tenants.precio_especial,
// p. ej. el plan fundador del primer colegio). Vale en SU plan
// (tenants.plan_especial; si no lo tiene, el Pro del segmento), con sus propios
// límites de usuarios y estudiantes si los tiene, y SIN el Sales Hub / CRM.
// Si el especial rebaja el precio, pagando anual no se suman meses gratis (la
// rebaja ya es el descuento); si no lo rebaja (Centenario: EDUCA INICIAL a su
// mismo precio con el tope extendido a 700 estudiantes), cobra normal.
const PLAN_DEL_ESPECIAL = { educativo: 'EDUCA PRO' };

// (20/10/2026) Lo que incluye cada plan, contado como beneficio y no como
// nombre de módulo ("Carta de Ruta" no le dice nada a un cliente nuevo).
// La facturación electrónica va en TODOS: es obligatoria con la DGII.
// Cada plan suma a los de abajo ("Todo lo del Básico, más:").
const INCLUYE = {
  // (29/10/2026) Solo para empresas sin inventario (servicios e inmobiliaria).
  SERVICIOS: {
    base: null,
    items: [
      'Facturación electrónica e-CF (DGII)',
      'Facturas de servicios con retenciones (ITBIS e ISR)',
      'Facturas en pesos o en dólares',
      'Cuentas por cobrar',
      'Reportes 606, 607 y 608',
    ],
  },
  BASICO: {
    base: null,
    items: [
      'Facturación electrónica e-CF (DGII)',
      'Punto de venta con cierre de caja',
      'Inventario, compras y suplidores',
      'Cotizaciones en PDF listas para WhatsApp',
      'Cuentas por cobrar y por pagar',
      'Reportes 606 y 607',
    ],
  },
  PRO: {
    base: 'Básico',
    items: [
      'WhatsApp, Instagram, Facebook y TikTok en una sola bandeja',
      'Embudo de ventas que se mueve solo con IA',
      'Lee tus facturas de compra con una foto',
      'Cobranzas y recordatorios',
      'Cuentas bancarias y reportes avanzados',
      'Nómina: sueldos, TSS y adelantos',
    ],
  },
  // (06/11/2026) Centros educativos: solo los ven los colegios.
  'EDUCA INICIAL': {
    base: null,
    items: [
      'Ficha integral del estudiante con foto',
      'Familias y hermanos enlazados',
      'Tarifas por estudiante, becas y Sala de Tareas',
      'Mensualidades con recargo automático',
      'Recibos en ticket y en hoja, cierre de caja',
      'Reportes de cobros y de quién debe',
      'Reservación de cupo y proyección del año',
      'Antigüedad de saldos (30, 60 días)',
    ],
  },
  'EDUCA PRO': {
    base: 'Educa Inicial',
    items: [
      'Hasta 800 estudiantes y 6 usuarios',
      'Sales Hub: WhatsApp, Instagram y Facebook en una sola bandeja',
      'Recordatorios de pago por WhatsApp incluidos',
      'Nómina del personal: sueldos, TSS y adelantos',
    ],
  },
  'EDUCA TOTAL': {
    base: 'Educa Pro',
    items: [
      'Estudiantes y usuarios sin límite',
      'Registro de notas y boletín de calificaciones (formato MINERD)',
      'Página web del colegio con su propio dominio: requisitos de inscripción y tareas que los maestros suben y los estudiantes descargan (próximamente)',
      'Soporte prioritario',
    ],
  },
  ENTERPRISE: {
    base: 'Pro',
    items: [
      'Asistente IA que contesta y recomienda',
      'Equipo IA: publicaciones diarias para tus redes',
      'Varias empresas con un mismo usuario',
      'Acceso API y soporte prioritario',
    ],
  },
};

// Lo que cuesta en el mercado (precios publicados, octubre 2026). Se cita
// el rango, no una marca, y se revisa cada cierto tiempo.
const MERCADO = [
  { que: 'Solo facturación electrónica (250–800 e-CF/mes)', cuanto: 'RD$1,380 – RD$2,800 / mes' },
  { que: 'Sistema de punto de venta + inventario con e-CF', cuanto: 'US$25 – US$79 / mes (≈ RD$1,600 – RD$5,000)' },
  { que: 'CRM para WhatsApp e Instagram', cuanto: 'se paga aparte, por usuario' },
];

const PlanesPage = () => {
  const { planes, planActual, suscripcion, porVencer, isVencida, especial } = useSuscripcion();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [showPagoModal, setShowPagoModal] = useState(false);
  const [ciclo, setCiclo] = useState('mensual'); // 'mensual' | 'anual'

  const esAnual = ciclo === 'anual';
  // Precio anual con descuento: 12 meses - meses gratis.
  const precioAnual = (mensual) => Number(mensual || 0) * (12 - MESES_GRATIS_ANUAL);
  const ahorroAnual = (mensual) => Number(mensual || 0) * MESES_GRATIS_ANUAL;

  const planMeta = {
    TRIAL:      { icon: Clock,    gradient: 'from-amber-500 to-orange-500',   color: 'amber',   badge: 'Prueba Gratis',   popular: false },
    SERVICIOS:  { icon: FileText, gradient: 'from-sky-500 to-cyan-500',      color: 'sky',     badge: 'Solo facturación', popular: false },
    BASICO:     { icon: Shield,   gradient: 'from-blue-500 to-indigo-500',    color: 'blue',    badge: 'Ideal para iniciar', popular: false },
    PRO:        { icon: Crown,    gradient: 'from-emerald-500 to-teal-500',   color: 'emerald', badge: 'Más Popular',     popular: true },
    ENTERPRISE: { icon: Sparkles, gradient: 'from-purple-500 to-violet-500',  color: 'purple',  badge: 'Todo Ilimitado',  popular: false },
    'EDUCA INICIAL': { icon: Shield,   gradient: 'from-blue-500 to-indigo-500',   color: 'blue',    badge: 'Hasta 300 estudiantes', popular: false },
    'EDUCA PRO':     { icon: Crown,    gradient: 'from-emerald-500 to-teal-500',  color: 'emerald', badge: 'Más Popular',           popular: true },
    'EDUCA TOTAL':   { icon: Sparkles, gradient: 'from-purple-500 to-violet-500', color: 'purple',  badge: 'Sin límite',            popular: false },
  };

  // Un plan de colegio se mide en estudiantes, no en productos ni almacenes.
  const featureListEduca = [
    { key: 'limite_usuarios',    label: 'Usuarios',    icon: Users, format: v => v >= 99999 ? 'Ilimitados' : v },
    { key: 'limite_estudiantes', label: 'Estudiantes', icon: Users, format: v => (v == null ? 'Ilimitados' : v?.toLocaleString()) },
  ];
  const featureList = [
    { key: 'limite_usuarios',   label: 'Usuarios',           icon: Users,      format: v => v >= 99999 ? 'Ilimitados' : v },
    { key: 'limite_productos',  label: 'Productos',          icon: Package,    format: v => v >= 99999 ? 'Ilimitados' : v?.toLocaleString() },
    { key: 'limite_facturas',   label: 'Facturas/mes',       icon: FileText,   format: v => v === null ? 'Ilimitadas' : v?.toLocaleString() },
    { key: 'limite_almacenes',  label: 'Almacenes',          icon: Warehouse,  format: v => v >= 99 ? 'Ilimitados' : v },
  ];


  // Precio especial de esta empresa (null = precios normales).
  const { empresa, isSuperAdmin } = useAuth();
  const planDelEspecial = especial?.plan || PLAN_DEL_ESPECIAL[empresa?.tipo_negocio] || 'PRO';
  const tieneEspecial = (plan) => !!especial && plan.nombre === planDelEspecial;
  const rebaja = (plan) => tieneEspecial(plan) && especial.precio < Number(plan.precio);
  // Lo que se cobra: con rebaja, el especial (anual = 12 meses, sin meses gratis).
  const montoDe = (plan) => {
    if (rebaja(plan)) return especial.precio * (esAnual ? 12 : 1);
    return esAnual ? precioAnual(plan.precio) : plan.precio;
  };

  // Límites de la tarjeta: con especial, los pactados (si los hay).
  const limiteDe = (plan, key) => {
    if (tieneEspecial(plan)) {
      if (key === 'limite_usuarios' && especial.limiteUsuarios) return especial.limiteUsuarios;
      if (key === 'limite_estudiantes' && especial.limiteEstudiantes) return especial.limiteEstudiantes;
    }
    return plan[key];
  };
  // Lo que incluye: con especial, sin el Sales Hub y con sus límites en el texto.
  const incluyeDe = (plan) => {
    const items = INCLUYE[plan.nombre]?.items || [];
    if (!tieneEspecial(plan)) return items;
    const est = Number(limiteDe(plan, 'limite_estudiantes')).toLocaleString();
    const usu = limiteDe(plan, 'limite_usuarios');
    const hasta = `Hasta ${est} estudiantes y ${usu} usuarios`;
    const base = items.filter((t) => !t.startsWith('Sales Hub'))
      .map((t) => t.replace(/Hasta [\d,]+ estudiantes y \d+ usuarios/, hasta));
    // El tope pactado, si el plan no lo dice ya.
    if (especial.limiteEstudiantes && !base.includes(hasta)) base.unshift(hasta);
    return base;
  };

  const handleSelectPlan = (plan) => {
    if (plan.nombre === 'TRIAL') return;
    // Capturamos el ciclo elegido en el momento de seleccionar.
    setSelectedPlan({
      ...plan,
      _ciclo: ciclo,
      _monto: montoDe(plan),
      _duracionDias: esAnual ? DIAS_ANUAL : plan.duracion_dias,
    });
    setShowPagoModal(true);
  };

  const isCurrentPlan = (nombre) => planActual === nombre;
  const pagoPendiente = suscripcion?.pago_pendiente;

  // El plan SERVICIOS solo lo ven las empresas sin inventario.
  // (30/10/2026) El superadmin lo ve siempre, marcado y sin poder elegirlo
  // para una empresa que no es de servicios.
  const sinInventario = ['servicios', 'inmobiliaria'].includes(empresa?.tipo_negocio);
  // (06/11/2026) Un colegio ve solo los planes Educa; los demás no los ven.
  const esColegio = empresa?.tipo_negocio === 'educativo';
  const esEduca = (p) => p.segmento === 'educativo';
  const paidPlanes = planes.filter(p => p.nombre !== 'TRIAL'
    && (isSuperAdmin || esEduca(p) === esColegio)
    && (p.nombre !== 'SERVICIOS' || sinInventario || isSuperAdmin));
  const soloVistaAdmin = (plan) => (plan.nombre === 'SERVICIOS' && !sinInventario) || esEduca(plan) !== esColegio;

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
            Factura, vende y cobra desde un solo sistema.
            Todos los planes incluyen soporte técnico y actualizaciones.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-300/40 text-emerald-100 rounded-full px-4 py-1.5 text-xs font-bold">
            <BadgeCheck className="w-4 h-4" />
            Facturación electrónica DGII incluida en todos los planes
          </div>

          {/* Toggle Mensual / Anual */}
          <div className="mt-6 flex items-center justify-center">
            <div className="inline-flex items-center bg-white/10 border border-white/20 rounded-full p-1 backdrop-blur-sm">
              <button
                onClick={() => setCiclo('mensual')}
                className={`px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all ${
                  !esAnual ? 'bg-white text-[#1a0a3a] shadow' : 'text-white/70 hover:text-white'
                }`}
              >
                Mensual
              </button>
              <button
                onClick={() => setCiclo('anual')}
                className={`px-5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                  esAnual ? 'bg-white text-[#1a0a3a] shadow' : 'text-white/70 hover:text-white'
                }`}
              >
                Anual
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                  esAnual ? 'bg-emerald-500 text-white' : 'bg-emerald-400/30 text-emerald-200'
                }`}>
                  {MESES_GRATIS_ANUAL} MESES GRATIS
                </span>
              </button>
            </div>
          </div>
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
        <div className={`grid grid-cols-1 gap-6 ${paidPlanes.length > 3 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
          {paidPlanes.map((plan, i) => {
            const meta = planMeta[plan.nombre] || planMeta.BASICO;
            const PlanIcon = meta.icon;
            const isCurrent = isCurrentPlan(plan.nombre);
            const canPayCurrent = isCurrent && (porVencer || isVencida);

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

                {soloVistaAdmin(plan) && (
                  <div className="absolute top-0 left-0 bg-slate-800 text-white text-[10px] font-black uppercase px-3 py-1 rounded-br-xl">
                    Solo servicios e inmobiliaria
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
                      {montoDe(plan)?.toLocaleString()}
                    </span>
                  </div>
                  {rebaja(plan) ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-gray-400 text-xs font-medium">
                        {esAnual ? 'por año' : 'por mes'} ·{' '}
                        <span className="line-through">RD${(esAnual ? precioAnual(plan.precio) : plan.precio)?.toLocaleString()}</span>
                      </p>
                      <p className="text-emerald-600 text-[11px] font-black uppercase" title={especial.nota}>
                        Su precio especial
                      </p>
                    </div>
                  ) : esAnual ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-gray-400 text-xs font-medium">
                        por año ·{' '}
                        <span className="line-through">RD${(plan.precio * 12)?.toLocaleString()}</span>
                      </p>
                      <p className="text-emerald-600 text-[11px] font-black uppercase">
                        Ahorras RD${ahorroAnual(plan.precio)?.toLocaleString()} / año
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-xs font-medium mt-1">
                      por mes · {plan.duracion_dias} días
                    </p>
                  )}
                  {tieneEspecial(plan) && !rebaja(plan) && (
                    <p className="text-emerald-600 text-[11px] font-black uppercase mt-0.5" title={especial.nota}>Su plan especial</p>
                  )}
                </div>

                {/* Features */}
                <div className="px-6 py-5 space-y-3 bg-white">
                  {/* Límites */}
                  {(esEduca(plan) ? featureListEduca : featureList).map(feat => (
                    <div key={feat.key} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-600">
                        <feat.icon className="w-4 h-4 text-gray-400" />
                        {feat.label}
                      </span>
                      <span className="text-sm font-black text-gray-900">
                        {feat.format(limiteDe(plan, feat.key))}
                      </span>
                    </div>
                  ))}

                  <hr className="border-gray-100" />

                  {/* Lo que incluye, como beneficio */}
                  {INCLUYE[plan.nombre]?.base && (
                    <p className="text-xs font-black uppercase tracking-wide text-gray-500">
                      Todo lo del {INCLUYE[plan.nombre].base}, más:
                    </p>
                  )}
                  {incluyeDe(plan).map((item) => (
                    <div key={item} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span className="text-sm text-gray-700 leading-snug">
                        {item}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="px-6 pb-6 pt-2 bg-white">
                  <Button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={(isCurrent && !canPayCurrent) || pagoPendiente || soloVistaAdmin(plan)}
                    className={`w-full h-11 font-black uppercase tracking-wider text-xs shadow-md transition-all ${
                      (isCurrent && !canPayCurrent) || soloVistaAdmin(plan)
                        ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                        : pagoPendiente
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : `bg-gradient-to-r ${meta.gradient} hover:opacity-90 text-white`
                    }`}
                  >
                    {soloVistaAdmin(plan) ? 'No aplica a esta empresa' : isCurrent && !canPayCurrent ? 'Plan Actual' : pagoPendiente ? 'Pago en Revisión' : canPayCurrent ? (
                      <>
                        Pagar Plan Actual
                        <ChevronRight className="w-4 h-4 ml-2" />
                      </>
                    ) : (
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

        {/* Contra el mercado */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="mt-10 rounded-2xl border border-gray-200 bg-white p-6"
        >
          <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">¿Cuánto cuesta por separado?</h3>
          <p className="text-xs text-gray-500 mt-1">Lo que cobran en República Dominicana por cada pieza suelta (precios publicados).</p>
          <div className="mt-4 divide-y divide-gray-100">
            {MERCADO.map((m) => (
              <div key={m.que} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 py-2">
                <span className="text-sm text-gray-700">{m.que}</span>
                <span className="text-sm font-bold text-gray-900">{m.cuanto}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-emerald-700 font-bold">
            Con MotoFlow va todo junto: facturación electrónica, punto de venta, inventario y, desde el Pro, tus redes y WhatsApp en una sola bandeja.
          </p>
        </motion.div>

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
            El certificado digital para la facturación electrónica lo emite una entidad autorizada y se paga aparte.
          </p>
        </motion.div>
      </div>

      {/* Modal de pago */}
      {showPagoModal && selectedPlan && (
        <PagoTransferenciaModal
          plan={selectedPlan}
          ciclo={selectedPlan._ciclo}
          monto={selectedPlan._monto}
          duracionDias={selectedPlan._duracionDias}
          onClose={() => { setShowPagoModal(false); setSelectedPlan(null); }}
        />
      )}
    </div>
  );
};

export default PlanesPage;
