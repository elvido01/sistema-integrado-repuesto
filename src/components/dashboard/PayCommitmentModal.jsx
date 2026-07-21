import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, ArrowDownToLine, FileCheck } from 'lucide-react';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';

const FORMAS_PAGO = [
  { value: 'Efectivo', label: 'Efectivo de caja', icon: Wallet, requiereRef: false },
  { value: 'Transferencia', label: 'Transferencia', icon: ArrowDownToLine, requiereRef: true },
  { value: 'Cheque', label: 'Cheque', icon: FileCheck, requiereRef: true },
];

const formatCurrency = (val) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);

const PayCommitmentModal = ({ isOpen, onClose, compromiso, onConfirm }) => {
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [referencia, setReferencia] = useState('');
  const [cuentaId, setCuentaId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormaPago('Efectivo');
      setReferencia('');
      setCuentaId(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  if (!compromiso) return null;

  const formaSelected = FORMAS_PAGO.find(f => f.value === formaPago);
  const referenciaRequerida = formaSelected?.requiereRef && !referencia.trim();

  const handleConfirm = async () => {
    if (referenciaRequerida) return;
    setSubmitting(true);
    try {
      await onConfirm({
        forma_pago: formaPago,
        referencia_pago: referencia.trim() || null,
        cuenta_bancaria_id: formaSelected?.requiereRef ? cuentaId : null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-morla-blue font-bold uppercase tracking-wide">
            Pagar compromiso
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-slate-50 border border-slate-200 rounded p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400">Compromiso</p>
            <p className="font-bold text-slate-800 uppercase">{compromiso.nombre}</p>
            <p className="text-2xl font-extrabold text-red-600 mt-1">{formatCurrency(compromiso.monto)}</p>
            {compromiso.recurrente && (
              <p className="text-[11px] text-emerald-700 mt-1">
                Se renueva {compromiso.frecuencia || 'mensual'}mente al pagarlo.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Forma de pago
            </Label>
            <Select value={formaPago} onValueChange={setFormaPago}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMAS_PAGO.map(f => (
                  <SelectItem key={f.value} value={f.value}>
                    <span className="flex items-center gap-2">
                      <f.icon className="w-4 h-4" />
                      {f.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formaSelected?.requiereRef && (
            <>
              <div className="space-y-2">
                <Label htmlFor="referencia-pago" className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  {formaPago === 'Cheque' ? 'No. de cheque' : 'No. de transferencia / referencia'}
                </Label>
                <Input
                  id="referencia-pago"
                  autoFocus
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder={formaPago === 'Cheque' ? 'Ej: 0123456' : 'Ej: TRX20260427-0001'}
                />
              </div>
              <CuentaBancariaSelect value={cuentaId} onChange={setCuentaId} moneda="DOP" contexto="compromiso" label="Sale de la cuenta" />
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || referenciaRequerida}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? 'Procesando...' : 'Confirmar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PayCommitmentModal;
