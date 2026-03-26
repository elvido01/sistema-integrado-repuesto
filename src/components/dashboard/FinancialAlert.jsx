import React from 'react';
import { ShieldCheck, AlertTriangle, AlertOctagon, TrendingUp } from 'lucide-react';

const FinancialAlert = ({ caja = 0, compromisos = [], ventas = 0, diasRestantes = 0, meta = 0 }) => {
  const totalCompromisos = compromisos.reduce((sum, c) => sum + (c.monto || 0), 0);
  const faltanteCompromisos = Math.max(totalCompromisos - caja, 0);

  // Identificar deudas urgentes (vencidas o que vencen en las próximas 48h)
  const hoy = new Date();
  const proximas48h = new Date(hoy.getTime() + (48 * 60 * 60 * 1000));
  
  const compromisosUrgentes = compromisos.filter(c => {
      if (!c.fecha) return false;
      const fVence = new Date(c.fecha);
      return fVence <= proximas48h;
  });

  const montoUrgente = compromisosUrgentes.reduce((sum, c) => sum + (c.monto || 0), 0);
  const esAlertaUrgente = montoUrgente > caja;

  const formatCurrency = (val) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val);

  // Lógica Inteligente
  let estado = 'estable'; // estable, precaucion, peligro
  let config = {
    color: 'bg-emerald-50 border-emerald-200',
    icon: <ShieldCheck className="w-8 h-8 text-emerald-600" />,
    title: '🟢 Situación Financiera Estable',
    titleColor: 'text-emerald-800',
    message: 'La caja actual cubre todos los compromisos de la semana. Puedes enfocarte en maximizar las ganancias.',
    action: 'Objetivo de hoy: Superar la meta de ventas para generar excedente.',
    actionIcon: <TrendingUp className="w-4 h-4 mr-2" />
  };

  if (esAlertaUrgente) {
      estado = 'peligro';
      config = {
        color: 'bg-rose-50 border-rose-200 shadow-rose-100',
        icon: <AlertOctagon className="w-8 h-8 text-rose-600" />,
        title: '🚨 ¡Compromisos Inmediatos!',
        titleColor: 'text-rose-900',
        message: `Tienes compromisos por vencer (o vencidos) por ${formatCurrency(montoUrgente)} y tu caja es de ${formatCurrency(caja)}.`,
        action: `ACCIÓN PRIORITARIA: Necesitas ${formatCurrency(montoUrgente - caja)} para cubrir deudas de las próximas 48h.`,
        actionIcon: <AlertOctagon className="w-4 h-4 mr-2" />
      };
  } else if (faltanteCompromisos > 0) {

    if (diasRestantes === 0) {
        estado = 'peligro';
        config = {
          color: 'bg-red-50 border-red-200',
          icon: <AlertOctagon className="w-8 h-8 text-red-600" />,
          title: '🔴 ¡Alerta Financiera Crítica!',
          titleColor: 'text-red-800',
          message: `Hoy es el último día de la semana y tienes compromisos pendientes por ${formatCurrency(faltanteCompromisos)}.`,
          action: `ACCIÓN URGENTE: Necesitas vender ${formatCurrency(faltanteCompromisos)} HOY MISMO o buscar liquidez inmediata.`,
          actionIcon: <AlertOctagon className="w-4 h-4 mr-2" />
        };
    } else {
        const ventaDiariaParaCompromisos = faltanteCompromisos / diasRestantes;
        
        if (ventaDiariaParaCompromisos > (meta / 7) * 1.5) {
            // Si lo que tengo que vender por día para cubrir compromisos es 50% mayor a lo normal
            estado = 'peligro';
            config = {
              color: 'bg-red-50 border-red-200',
              icon: <AlertOctagon className="w-8 h-8 text-red-600" />,
              title: '🔴 Riesgo Financiero Alto',
              titleColor: 'text-red-800',
              message: `Faltan ${formatCurrency(faltanteCompromisos)} para cubrir compromisos. El ritmo requerido es muy alto.`,
              action: `ACCIÓN: Debes facturar ${formatCurrency(ventaDiariaParaCompromisos)} TODOS LOS DÍAS restantes. Considera aplazar pagos o hacer cobros atrasados.`,
              actionIcon: <AlertOctagon className="w-4 h-4 mr-2" />
            };
        } else {
            estado = 'precaucion';
            config = {
              color: 'bg-amber-50 border-amber-200',
              icon: <AlertTriangle className="w-8 h-8 text-amber-600" />,
              title: '🟡 Precaución: Flujo de Caja Ajustado',
              titleColor: 'text-amber-800',
              message: `Aún necesitas ${formatCurrency(faltanteCompromisos)} para cumplir con los pagos de esta semana.`,
              action: `TÁCTICA: Enfócate en vender ${formatCurrency(ventaDiariaParaCompromisos)} diarios. ¡Ve tras las ventas al contado!`,
              actionIcon: <AlertTriangle className="w-4 h-4 mr-2" />
            };
        }
    }
  }

  return (
    <div className={`p-5 md:p-6 rounded-xl border shadow-sm ${config.color} flex flex-col md:flex-row items-start md:items-center gap-5 transition-all`}>
      <div className="shrink-0 bg-white/50 p-3 rounded-2xl border border-white/20 shadow-sm">
        {config.icon}
      </div>
      <div className="flex-1 space-y-2">
        <h2 className={`text-xl font-bold tracking-tight ${config.titleColor}`}>
          {config.title}
        </h2>
        <p className="text-gray-700 font-medium leading-relaxed">
          {config.message}
        </p>
        <div className="inline-flex items-center px-4 py-2 mt-2 rounded-lg bg-white/60 font-semibold text-gray-900 border border-white/40 shadow-sm text-sm">
          {config.actionIcon}
          {config.action}
        </div>
      </div>
    </div>
  );
};

export default FinancialAlert;
