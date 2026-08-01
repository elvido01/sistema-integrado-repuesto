import React from 'react';
import { ArrowDownCircle, ArrowUpCircle, FileText, Users, BarChart3, ShoppingCart, Briefcase, TrendingUp, Building2, HandCoins } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { formatCurrencyDOP } from '@/lib/flujoNeto';
import { formatFechaDMY } from '@/lib/dateUtils';

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

const FlujoNetoDesgloseModal = ({ open, onOpenChange, data, ventasMesTotal = null, cobradoMes = null, ingresosDealer = null }) => {
  const p = data?.periodo_actual || {};
  const num = (v) => Number(v) || 0;

  // Vista de GRUPO: cuando esta empresa es la financiera de un dealer, el
  // desglose deja de ser solo suyo. Las dos son la misma empresa, así que
  // cada línea suma las dos mitades y el flujo neto es el combinado.
  const d = ingresosDealer;
  const grupo = !!d;

  const ingContado = grupo ? 0 : num(p.ingreso_venta_contado);
  const ingCobros = num(p.ingreso_cobro_cliente);
  const ingDealer = grupo ? num(d.total) : 0;
  const ingresos = ingCobros + ingDealer + ingContado;

  const egGastos = num(p.gastos_diarios) + (grupo ? num(d.gastos) : 0);
  // GPS, seguro, placa...: el dealer los cobró dentro del precio de la moto y
  // se los entrega a quien presta el servicio. Salió plata, así que es egreso
  // —el flujo neto no cambia—, pero en su línea: no es gasto de la empresa.
  const egTerceros = grupo ? num(d.terceros) : 0;
  const egCompromisos = num(p.compromisos_fijos_pagados) + (grupo ? num(d.compromisos) : 0);
  // Solo los del dealer: lo que la financiera paga a "suplidores" es plata
  // que le pasa a Caminero — de un bolsillo al otro del mismo grupo. La
  // compra de verdad, al suplidor de afuera, la hace el dealer.
  const egSuplidores = grupo ? num(d.suplidores) : num(p.pagos_suplidores);
  const egCompras = num(p.compras_contado) + (grupo ? num(d.compras) : 0);
  const egComisiones = num(p.pagos_comisiones) + (grupo ? num(d.comisiones) : 0);
  const egresos = egGastos + egTerceros + egCompromisos + egSuplidores + egCompras + egComisiones;

  const flujo = grupo ? (ingresos - egresos) : num(p.flujo_neto);
  const positivo = flujo >= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Flujo neto — desglose del mes</DialogTitle>
          <DialogDescription>
            Ingresos cobrados menos egresos efectivamente pagados
            {p.fecha_inicio && p.fecha_fin ? ` (${formatFechaDMY(p.fecha_inicio)} → ${formatFechaDMY(p.fecha_fin)})` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1">
          {/* Ventas totales del MES completo (empresas con financiamiento de
              terceros, ej. Caminero): el volumen vendido, aparte del efectivo. */}
          {ventasMesTotal != null && (
            <div className="mb-3 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                  <TrendingUp className="w-4 h-4" /> Ventas totales (mes)
                </span>
                <span className="text-base font-black text-emerald-700">
                  {formatCurrencyDOP(Number(ventasMesTotal) || 0, { decimals: 0 })}
                </span>
              </div>
              <p className="text-[10px] leading-snug text-emerald-700/80 mt-1">
                Volumen vendido del mes completo (contado + crédito). Abajo, el efectivo cobrado del mes (inicial + recibos) menos los egresos.
              </p>
            </div>
          )}

          {/* Ingresos */}
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Ingresos cobrados</p>
          {/* La financiera no vende: esa línea era siempre RD$0 y solo
              estorbaba. Se muestra únicamente donde tiene sentido. */}
          {!grupo && <Row icon={FileText} label="Ventas de contado" value={ingContado} />}
          <Row icon={Users} label="Cobros a clientes (recibos)" value={ingCobros} />

          {grupo && (
            <div className="flex items-start justify-between py-2.5 border-b border-slate-100">
              <div className="flex items-start gap-2.5 min-w-0">
                <Building2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm text-slate-600 truncate">{d.dealer_nombre}</div>
                  <div className="text-[10px] text-slate-400 leading-snug">
                    Contado {formatCurrencyDOP(num(d.contado), { decimals: 0 })}
                    {' + '}iniciales y abonos {formatCurrencyDOP(num(d.recibos), { decimals: 0 })}
                  </div>
                </div>
              </div>
              <span className="text-sm font-bold shrink-0 text-slate-800">
                {formatCurrencyDOP(ingDealer, { decimals: 0 })}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between py-2 border-b-2 border-slate-200">
            <span className="text-xs font-semibold text-slate-500">Total ingresos</span>
            <span className="text-sm font-black text-emerald-600">
              {formatCurrencyDOP(grupo ? ingresos : (Number(p.ingresos_cobrados) || 0), { decimals: 0 })}
            </span>
          </div>

          {/* Egresos */}
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 mt-4 mb-1">Egresos pagados</p>
          <Row icon={ArrowDownCircle} label={grupo ? 'Gastos diarios (las dos empresas)' : 'Gastos diarios'}
            value={egGastos} negative />
          {egTerceros > 0 && (
            <Row icon={HandCoins} label="Pagos a terceros (GPS, seguro...)" value={egTerceros} negative />
          )}
          <Row icon={BarChart3} label="Compromisos fijos pagados" value={egCompromisos} negative />
          <Row icon={Users} label={grupo ? `Pagos a suplidores (${d.dealer_nombre})` : 'Pagos a suplidores'}
            value={egSuplidores} negative />
          <Row icon={ShoppingCart} label="Compras de contado" value={egCompras} negative />
          <Row icon={Briefcase} label="Pago de comisiones" value={egComisiones} negative />
          <div className="flex items-center justify-between py-2 border-b-2 border-slate-200">
            <span className="text-xs font-semibold text-slate-500">Total egresos</span>
            <span className="text-sm font-black text-rose-600">
              -{formatCurrencyDOP(grupo ? egresos : (Number(p.total_egresos) || 0), { decimals: 0 })}
            </span>
          </div>

          {/* Resultado */}
          {/* Un solo flujo neto: el de las dos empresas juntas. */}
          <div className="flex items-center justify-between mt-4 rounded-lg bg-slate-50 border border-slate-100 px-3 py-3">
            <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
              {positivo ? <ArrowUpCircle className="w-5 h-5 text-emerald-500" /> : <ArrowDownCircle className="w-5 h-5 text-rose-500" />}
              {grupo ? 'Flujo neto del grupo' : 'Flujo neto del mes'}
            </span>
            <span className={`text-lg font-black ${positivo ? 'text-emerald-600' : 'text-rose-600'}`}>
              {positivo ? '' : '-'}{formatCurrencyDOP(Math.abs(flujo), { decimals: 0 })}
            </span>
          </div>

          {/* Las dos mitades no cubren el mismo rango de fechas y callarlo
              seria hacer pasar por un solo periodo lo que no lo es. */}
          {grupo && (
            <p className="mt-2 text-[11px] leading-snug text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {d.dealer_nombre} se cuenta del <b>{formatFechaDMY(d.desde)}</b> al <b>{formatFechaDMY(d.hasta)}</b> (mes completo);
              esta empresa, desde su ancla de caja ({formatFechaDMY(p.fecha_inicio)}). La tarjeta del dashboard sigue
              mostrando solo el flujo de esta empresa.
            </p>
          )}

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
