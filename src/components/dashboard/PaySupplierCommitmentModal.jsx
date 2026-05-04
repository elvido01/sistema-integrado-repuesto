import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Wallet, ArrowDownToLine, FileCheck } from 'lucide-react';

const FORMAS_PAGO = [
  { value: 'Efectivo', label: 'Efectivo de caja', icon: Wallet, requiereRef: false },
  { value: 'Transferencia', label: 'Transferencia', icon: ArrowDownToLine, requiereRef: true },
  { value: 'Cheque', label: 'Cheque', icon: FileCheck, requiereRef: true },
];

const formatCurrency = (val) =>
  new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(val || 0);

const PaySupplierCommitmentModal = ({ isOpen, onClose, commitment, onConfirm }) => {
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [referencia, setReferencia] = useState('');
  const [monto, setMonto] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && commitment) {
      setFormaPago('Efectivo');
      setReferencia('');
      setMonto((commitment.monto_pendiente || 0).toFixed(2));
      setSubmitting(false);
    }
  }, [isOpen, commitment]);

  if (!commitment) return null;

  const formaSelected = FORMAS_PAGO.find(f => f.value === formaPago);
  const referenciaRequerida = formaSelected?.requiereRef && !referencia.trim();
  const montoNum = parseFloat(monto) || 0;
  const pendiente = commitment.monto_pendiente || 0;
  const montoInvalido = montoNum <= 0 || montoNum > pendiente + 0.01;

  const handleConfirm = async () => {
    if (referenciaRequerida || montoInvalido) return;
    setSubmitting(true);
    try {
      await onConfirm({
        forma_pago: formaPago,
        referencia_pago: referencia.trim() || null,
        monto_abonado: Math.min(montoNum, pendiente),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-morla-blue font-bold uppercase tracking-wide">
            Pagar a Suplidor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-slate-50 border border-slate-200 rounded p-3">
            <p className="text-[10px] uppercase font-bold text-slate-400">Suplidor</p>
            <p className="font-bold text-slate-800 uppercase">{commitment.suplidor_nombre || 'N/A'}</p>
            <div className="flex justify-between items-center mt-1">
              <span className="text-xs text-slate-500">Factura: {commitment.numero || commitment.referencia || '---'}</span>
              <span className="text-2xl font-extrabold text-red-600">{formatCurrency(pendiente)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Monto a abonar
            </Label>
            <Input
              type="number"
              step="0.01"
              max={pendiente}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="text-right font-mono"
            />
            {montoInvalido && (
              <p className="text-[11px] text-red-500">
                El monto debe ser mayor a 0 y no exceder el pendiente.
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
            <div className="space-y-2">
              <Label htmlFor="referencia-pago-supl" className="text-xs font-bold uppercase tracking-wide text-slate-600">
                {formaPago === 'Cheque' ? 'No. de cheque' : 'No. de transferencia / referencia'}
              </Label>
              <Input
                id="referencia-pago-supl"
                autoFocus
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder={formaPago === 'Cheque' ? 'Ej: 0123456' : 'Ej: TRX20260427-0001'}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || referenciaRequerida || montoInvalido}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {submitting ? 'Procesando...' : 'Confirmar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaySupplierCommitmentModal;
