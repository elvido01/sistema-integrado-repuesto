import React, { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { generateGastoDiarioPDF } from '@/components/common/pdf/gastoDiarioPDF';
import { printGastoDiarioPOS } from '@/lib/printPOS';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';

const todayISO = () => new Date().toISOString().split('T')[0];

const TIPOS_GASTO = [
  'Operativo',
  'Combustible',
  'Comida y dieta',
  'Casa',
  'Transporte',
  'Servicios',
  'Mantenimiento',
  'Nomina',
  'Administrativo',
  'Otro',
];

const DailyExpenseModal = ({ isOpen, onClose, gasto = null }) => {
  const { toast } = useToast();
  const { user, tenantId, empresa } = useAuth();
  const montoInputRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fecha: todayISO(),
    tipo_gasto: 'Operativo',
    monto: '',
    descripcion: '',
  });
  // De dónde sale el gasto:
  //   'efectivo' → la gaveta (resta de la caja, como siempre)
  //   'banco'    → una cuenta bancaria de la empresa (no resta de la caja)
  //   'externo'  → un tercero u otra cuenta (ej. lo pagó Odalys): SÍ es gasto
  //                de la empresa pero NO resta de la caja.
  const [pagaCon, setPagaCon] = useState('efectivo'); // 'efectivo' | 'banco' | 'externo'
  const [cuentaId, setCuentaId] = useState('');
  // Al editar un gasto que salió del banco no se cambia el origen aquí (habría
  // que revertir el movimiento bancario): se bloquea el selector.
  const [bancoLock, setBancoLock] = useState(false);
  // Gastos ya registrados hoy: clic para EDITAR (ej. el mandado costó menos)
  const [gastosHoy, setGastosHoy] = useState([]);
  const [editandoId, setEditandoId] = useState(null);
  const [huboCambios, setHuboCambios] = useState(false);

  const cargarGastosHoy = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('gastos_diarios')
      .select('id, fecha, tipo_gasto, monto, descripcion, afecta_caja, cuenta_bancaria_id')
      .eq('tenant_id', tenantId)
      .eq('fecha', todayISO())
      .eq('anulado', false)
      .order('created_at', { ascending: false });
    setGastosHoy(data || []);
  };

  const resetForm = () => {
    setEditandoId(null);
    setFormData({ fecha: todayISO(), tipo_gasto: 'Operativo', monto: '', descripcion: '' });
    setPagaCon('efectivo');
    setCuentaId('');
    setBancoLock(false);
  };

  const editarGasto = (g) => {
    setEditandoId(g.id);
    setFormData({ fecha: g.fecha, tipo_gasto: g.tipo_gasto || 'Operativo', monto: String(g.monto), descripcion: g.descripcion || '' });
    // Origen actual: banco (bloqueado), externo (no afecta caja) o efectivo.
    if (g.cuenta_bancaria_id) {
      setPagaCon('banco'); setCuentaId(g.cuenta_bancaria_id); setBancoLock(true);
    } else {
      setPagaCon(g.afecta_caja === false ? 'externo' : 'efectivo'); setCuentaId(''); setBancoLock(false);
    }
    setTimeout(() => { montoInputRef.current?.focus(); montoInputRef.current?.select(); }, 80);
  };

  // Eliminar (anular): p. ej. se mandó a comprar algo y no se compró
  const eliminarGasto = async () => {
    if (!editandoId) return;
    if (!window.confirm(`¿Eliminar este gasto de RD$${formData.monto}? El dinero vuelve a la caja.`)) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('gastos_diarios').update({ anulado: true }).eq('id', editandoId);
      if (error) throw error;
      toast({ title: 'Gasto eliminado', description: 'El monto regresó a la caja del día.' });
      setHuboCambios(true);
      resetForm();
      await cargarGastosHoy();
    } catch (error) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Doble clic en la tarjeta del dashboard: abre directo en edición
      if (gasto?.id) editarGasto(gasto);
      else resetForm();
      setHuboCambios(false);
      cargarGastosHoy();
      setTimeout(() => {
        montoInputRef.current?.focus();
        montoInputRef.current?.select();
      }, 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, gasto]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleTipoChange = (value) => {
    setFormData(prev => ({ ...prev, tipo_gasto: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const monto = Number(formData.monto);

    if (!tenantId) {
      toast({ variant: 'destructive', title: 'Error', description: 'No se encontro el tenant de la empresa.' });
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      toast({ variant: 'destructive', title: 'Monto invalido', description: 'Digite un monto mayor que cero.' });
      return;
    }

    if (pagaCon === 'banco' && !cuentaId) {
      toast({ variant: 'destructive', title: 'Falta la cuenta', description: 'Elige de qué cuenta bancaria sale el gasto.' });
      return;
    }

    setIsSubmitting(true);
    try {
      if (editandoId) {
        // Corrección de un gasto ya registrado (ej. costó menos de lo anotado).
        // Si el gasto no salió del banco, se puede cambiar entre efectivo y
        // externo (afecta o no la caja). Los de banco no se tocan aquí.
        const upd = {
          fecha: formData.fecha,
          tipo_gasto: formData.tipo_gasto,
          monto,
          descripcion: formData.descripcion.trim(),
        };
        if (!bancoLock) upd.afecta_caja = pagaCon !== 'externo';
        const { error } = await supabase.from('gastos_diarios').update(upd).eq('id', editandoId);
        if (error) throw error;
        toast({ title: 'Gasto actualizado', description: 'La caja se recalcula con el nuevo monto.' });
        setHuboCambios(true);
        resetForm();
        await cargarGastosHoy();
        setIsSubmitting(false);
        return; // el modal queda abierto para seguir revisando
      }

      const desdeBanco = pagaCon === 'banco' && cuentaId;
      const esExterno = pagaCon === 'externo';
      const { data: gastoCreado, error } = await supabase.from('gastos_diarios').insert({
        tenant_id: tenantId,
        fecha: formData.fecha,
        tipo_gasto: formData.tipo_gasto,
        monto,
        descripcion: formData.descripcion.trim(),
        usuario_id: user?.id || null,
        cuenta_bancaria_id: desdeBanco ? cuentaId : null,
        // Banco de la empresa o tercero (Odalys): NO resta de la gaveta.
        afecta_caja: !(desdeBanco || esExterno),
      }).select('id').single();

      if (error) throw error;

      // Pagado por banco: sale de la cuenta (y NO de la gaveta). Idempotente
      // por el id del gasto; si falla, el gasto igual quedó registrado.
      if (desdeBanco) {
        const { error: movErr } = await supabase.rpc('registrar_movimiento_bancario_compartido', {
          p_cuenta_id: cuentaId,
          p_tipo: 'SALIDA',
          p_monto: monto,
          p_concepto: `Gasto ${formData.tipo_gasto}: ${formData.descripcion.trim()}`.trim(),
          p_referencia: null,
          p_origen_tipo: 'gasto',
          p_origen_id: gastoCreado?.id || null,
          p_fecha: formData.fecha || null,
        });
        if (movErr) {
          toast({
            variant: 'destructive',
            title: 'Gasto registrado, pero el banco no cuadró',
            description: `No se descontó de la cuenta (${movErr.message}). Regístralo a mano en Cuentas Bancarias.`,
          });
        }
      }

      toast({
        title: 'Gasto diario registrado',
        description: desdeBanco
          ? 'El gasto salió de la cuenta bancaria.'
          : esExterno
            ? 'Registrado como gasto de la empresa (no afecta la caja).'
            : 'El gasto fue descontado de caja.',
      });

      // Comprobante de gasto segun el formato configurado (Config. del Sistema)
      try {
        const gastoComprobante = {
          fecha: formData.fecha,
          tipo_gasto: formData.tipo_gasto,
          monto,
          descripcion: formData.descripcion.trim(),
        };
        const formato = empresa?.formato_comprobante_pago || 'pdf';
        if (formato === 'pos_80mm') {
          printGastoDiarioPOS(gastoComprobante, '80mm');
        } else if (formato === 'pos_4inch') {
          printGastoDiarioPOS(gastoComprobante, '4inch');
        } else {
          generateGastoDiarioPDF(gastoComprobante, empresa || {});
        }
      } catch (pdfErr) {
        console.warn('No se pudo generar el comprobante de gasto:', pdfErr);
      }

      onClose(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: error.message || 'No se pudo registrar el gasto diario.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(huboCambios); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editandoId ? 'Editar Gasto' : 'Gastos Diarios'}</DialogTitle>
          <DialogDescription>
            {editandoId
              ? 'Corrige el monto o la descripción del gasto seleccionado.'
              : 'Registra una salida de efectivo para rebajarla de caja.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fecha-gasto">Fecha</Label>
              <Input
                id="fecha-gasto"
                name="fecha"
                type="date"
                value={formData.fecha}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo-gasto">Tipo de gasto</Label>
              <Select value={formData.tipo_gasto} onValueChange={handleTipoChange}>
                <SelectTrigger id="tipo-gasto">
                  <SelectValue placeholder="Seleccione" />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_GASTO.map(tipo => (
                    <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monto-gasto">Monto (DOP)</Label>
            <Input
              ref={montoInputRef}
              id="monto-gasto"
              name="monto"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.monto}
              onChange={handleChange}
              placeholder="0.00"
              required
            />
          </div>

          {/* De dónde sale: la gaveta, una cuenta bancaria de la empresa, o un
              tercero/otra cuenta (no afecta la caja, ej. lo pagó Odalys). */}
          {bancoLock ? (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600">
              Este gasto se pagó desde una <b>cuenta bancaria</b>: no resta de la caja. El origen no se edita aquí.
            </div>
          ) : (
            <div className="space-y-2">
              <Label>¿De dónde sale?</Label>
              <Select value={pagaCon} onValueChange={(v) => { setPagaCon(v); if (v !== 'banco') setCuentaId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo (caja del día)</SelectItem>
                  {!editandoId && <SelectItem value="banco">Cuenta bancaria de la empresa</SelectItem>}
                  <SelectItem value="externo">Otra cuenta / tercero (no afecta caja)</SelectItem>
                </SelectContent>
              </Select>
              {pagaCon === 'banco' && (
                <div className="pt-1">
                  <CuentaBancariaSelect
                    value={cuentaId} onChange={setCuentaId}
                    moneda="DOP" contexto="compromiso" label="Sale de la cuenta"
                  />
                  <p className="text-[10px] text-gray-500 italic mt-1">
                    No resta del efectivo en caja: sale del saldo de esa cuenta.
                  </p>
                </div>
              )}
              {pagaCon === 'externo' && (
                <p className="text-[10px] text-gray-500 italic">
                  Se registra como gasto de la empresa pero <b>no resta de la Caja</b> (lo pagó un tercero u otra cuenta, ej. Odalys). Anota en la descripción quién lo pagó.
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="descripcion-gasto">Descripcion</Label>
            <Textarea
              id="descripcion-gasto"
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              placeholder="Ej: Combustible, merienda, envio..."
              required
            />
          </div>

          <DialogFooter className="pt-4 mt-4 border-t">
            {editandoId && (
              <>
                <Button type="button" variant="destructive" onClick={eliminarGasto} disabled={isSubmitting}>
                  Eliminar
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar edición
                </Button>
              </>
            )}
            <Button type="button" variant="secondary" onClick={() => onClose(huboCambios)}>
              Cerrar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {editandoId ? 'Actualizar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>

        {/* Gastos ya registrados HOY — clic para corregir */}
        {gastosHoy.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-[11px] font-bold text-slate-400 uppercase mb-1.5">Gastos de hoy (clic para editar)</p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {gastosHoy.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => editarGasto(g)}
                  className={`w-full flex items-start justify-between gap-2 text-left text-sm px-2 py-1 rounded border transition-colors ${editandoId === g.id ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                >
                  {/* La descripcion se lee COMPLETA: baja de linea, no se corta */}
                  <span className="min-w-0 flex-1 break-words">
                    {g.tipo_gasto} — {g.descripcion}
                    {(g.cuenta_bancaria_id || g.afecta_caja === false) && (
                      <span className="ml-1 inline-block text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold uppercase align-middle">
                        {g.cuenta_bancaria_id ? 'Banco' : 'No afecta caja'}
                      </span>
                    )}
                  </span>
                  <span className="font-mono font-bold shrink-0">{Number(g.monto).toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DailyExpenseModal;
