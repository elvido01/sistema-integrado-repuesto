import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, FileText, Users, BarChart3, ShoppingCart, Briefcase } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { formatCurrencyDOP } from '@/lib/flujoNeto';

// Fila del desglose. Ingresos en verde, egresos en rojo con signo negativo.
const Row = ({ icon: Icon, label, value, negative }) => (
  <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
    <div className="flex items-center gap-2.5 min-w-0">
      <Icon className={`w-4 h-4 shrink-0 ${negative ? 'text-rose-500' : 'text-emerald-500'}`} />
      <span className="text-sm text-slate-600 truncate">{label}</span>
    </div>
    <span className={`text-sm font-bold shrink-0 ${negative ? 'text-rose-600' : 'text-slate-800'}`}>
      {negative ? '-' : ''}{formatCurrencyDOP(Math.abs(value), { decimals: 0 })}
    </span>
  </div>
);

const FlujoNetoDesgloseModal = ({ open, onOpenChange, data }) => {
  const p = data?.periodo_actual || {};
  const flujo = Number(p.flujo_neto) || 0;
  const positivo = flujo >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Flujo neto — desglose del mes</DialogTitle>
          <DialogDescription>
            Ingresos cobrados menos egresos efectivamente pagados
            {p.fecha_inicio && p.fecha_fin ? ` (${p.fecha_inicio} → ${p.fecha_fin})` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1">
          {/* Ingresos */}
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Ingresos cobrados</p>
          <Row icon={FileText} label="Ventas de contado" value={Number(p.ingreso_venta_contado) || 0} />
          <Row icon={Users} label="Cobros a clientes (recibos)" value={Number(p.ingreso_cobro_cliente) || 0} />
          <div className="flex items-center justify-between py-2 border-b-2 border-slate-200">
            <span className="text-xs font-semibold text-slate-500">Total ingresos</span>
            <span className="text-sm font-black text-emerald-600">
              {formatCurrencyDOP(Number(p.ingresos_cobrados) || 0, { decimals: 0 })}
            </span>
          </div>

          {/* Egresos */}
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 mt-4 mb-1">Egresos pagados</p>
          <Row icon={ArrowDownCircle} label="Gastos diarios" value={Number(p.gastos_diarios) || 0} negative />
          <Row icon={BarChart3} label="Compromisos fijos pagados" value={Number(p.compromisos_fijos_pagados) || 0} negative />
          <Row icon={Users} label="Pagos a suplidores" value={Number(p.pagos_suplidores) || 0} negative />
          <Row icon={ShoppingCart} label="Compras de contado" value={Number(p.compras_contado) || 0} negative />
          <Row icon={Briefcase} label="Pago de comisiones" value={Number(p.pagos_comisiones) || 0} negative />
          <div className="flex items-center justify-between py-2 border-b-2 border-slate-200">
            <span className="text-xs font-semibold text-slate-500">Total egresos</span>
            <span className="text-sm font-black text-rose-600">
              -{formatCurrencyDOP(Number(p.total_egresos) || 0, { decimals: 0 })}
            </span>
          </div>

          {/* Resultado */}
          <div className="flex items-center justify-between mt-4 rounded-lg bg-slate-50 border border-slate-100 px-3 py-3">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
              {positivo ? <ArrowUpCircle className="w-5 h-5 text-emerald-500" /> : <ArrowDownCircle className="w-5 h-5 text-rose-500" />}
              Flujo neto del mes
            </span>
            <span className={`text-lg font-black ${positivo ? 'text-emerald-600' : 'text-rose-600'}`}>
              {positivo ? '' : '-'}{formatCurrencyDOP(Math.abs(flujo), { decimals: 0 })}
            </span>
          </div>

          <p className="mt-3 text-[11px] leading-snug text-slate-400">
            No incluye obligaciones pendientes, ventas a crédito no cobradas, órdenes de compra sin pagar
            ni movimientos anulados.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FlujoNetoDesgloseModal;
