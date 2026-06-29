import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, Building2, CreditCard, Copy, Check, Loader2,
  AlertTriangle, Clock, FileImage, Landmark, User, Hash
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useSuscripcion } from '@/contexts/SuscripcionContext';

const PagoTransferenciaModal = ({ plan, ciclo = 'mensual', monto, duracionDias, onClose }) => {
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const { refetch } = useSuscripcion();
  const fileInputRef = useRef(null);

  const esAnual = ciclo === 'anual';
  const montoFinal = Number(monto ?? plan.precio ?? 0);
  const periodoLabel = esAnual ? 'año' : 'mes';

  const [cuentasBancarias, setCuentasBancarias] = useState([]);
  const [loadingCuentas, setLoadingCuentas] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const [formData, setFormData] = useState({
    referencia: '',
    banco_origen: '',
    titular_cuenta: '',
  });
  const [comprobante, setComprobante] = useState(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    const fetchCuentas = async () => {
      const { data } = await supabase
        .from('cuentas_bancarias_saas')
        .select('*')
        .eq('activa', true);
      setCuentasBancarias(data || []);
      setLoadingCuentas(false);
    };
    fetchCuentas();
  }, []);

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast({ variant: 'destructive', title: 'Formato no válido', description: 'Solo JPG, PNG, WebP o PDF.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Archivo muy grande', description: 'Máximo 5MB.' });
      return;
    }

    setComprobante(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = async () => {
    if (!comprobante) {
      toast({ variant: 'destructive', title: 'Comprobante requerido', description: 'Suba una foto o captura del comprobante de transferencia.' });
      return;
    }
    if (!formData.referencia.trim()) {
      toast({ variant: 'destructive', title: 'Referencia requerida', description: 'Ingrese el número de referencia de la transferencia.' });
      return;
    }

    setSubmitting(true);
    try {
      // 1. Upload comprobante to storage
      const ext = comprobante.name.split('.').pop();
      const fileName = `comprobantes/${tenantId}/${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('pagos')
        .upload(fileName, comprobante, { cacheControl: '3600', upsert: false });

      if (uploadErr) {
        // Si el bucket no existe, intentar sin storage
        console.warn('Storage upload error:', uploadErr);
      }

      const { data: urlData } = supabase.storage.from('pagos').getPublicUrl(fileName);
      const comprobanteUrl = urlData?.publicUrl || null;

      // 2. Llamar RPC para crear solicitud de pago
      const { data: pagoId, error: rpcErr } = await supabase.rpc('solicitar_pago_suscripcion', {
        p_plan_id: plan.id,
        p_monto: montoFinal,
        p_referencia: formData.referencia.trim(),
        p_banco_origen: formData.banco_origen.trim() || null,
        p_titular_cuenta: formData.titular_cuenta.trim() || null,
        p_comprobante_url: comprobanteUrl,
        p_ciclo: ciclo,
        p_duracion_dias: duracionDias ?? null,
      });

      if (rpcErr) throw rpcErr;

      setSubmitted(true);
      await refetch();

      toast({
        title: 'Pago enviado para revisión',
        description: 'Recibirá confirmación en las próximas 24 horas.',
      });
    } catch (err) {
      console.error('Error submitting payment:', err);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.message || 'No se pudo enviar el pago.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success State ──
  if (submitted) {
    return (
      <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-8 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="w-20 h-20 mx-auto bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm mb-4"
            >
              <Clock className="w-10 h-10 text-white" />
            </motion.div>
            <h2 className="text-xl font-black text-white uppercase tracking-wide">
              Pago en Revisión
            </h2>
            <p className="text-white/80 text-sm mt-2">
              Verificaremos su comprobante en las próximas 24 horas
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-bold mb-1">¿Qué sigue?</p>
                  <ul className="space-y-1 text-xs">
                    <li>1. Nuestro equipo verificará el comprobante</li>
                    <li>2. Una vez aprobado, su plan se activa automáticamente</li>
                    <li>3. Recibirá una notificación de confirmación</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Plan Seleccionado</p>
              <p className="text-lg font-black text-gray-800">{plan.nombre} {esAnual && <span className="text-emerald-600 text-xs font-black uppercase">· Anual</span>}</p>
              <p className="text-sm text-gray-500">RD${montoFinal?.toLocaleString()}/{periodoLabel}</p>
            </div>

            <Button
              onClick={onClose}
              className="w-full h-10 bg-gradient-to-r from-[#1a0a3a] to-[#3a1a5c] text-white font-bold uppercase text-xs"
            >
              Entendido
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Main Modal ──
  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a0a3a] to-[#3a1a5c] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h2 className="text-white font-black text-lg uppercase tracking-wide">Pago por Transferencia</h2>
            <p className="text-white/60 text-xs">Plan {plan.nombre} {esAnual ? '(Anual)' : ''} · RD${montoFinal?.toLocaleString()}/{periodoLabel}</p>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Paso 1: Datos bancarios */}
          <div>
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-5 h-5 bg-[#1a0a3a] text-white rounded-full flex items-center justify-center text-[10px] font-black">1</span>
              Transfiera a esta cuenta
            </h3>

            {loadingCuentas ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              cuentasBancarias.map((cuenta) => (
                <div key={cuenta.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2.5">
                  <CuentaRow icon={Landmark} label="Banco" value={cuenta.banco} onCopy={() => handleCopy(cuenta.banco, 'banco')} copied={copiedField === 'banco'} />
                  <CuentaRow icon={CreditCard} label="Cuenta" value={`${cuenta.tipo_cuenta} · ${cuenta.numero}`} onCopy={() => handleCopy(cuenta.numero, 'numero')} copied={copiedField === 'numero'} />
                  <CuentaRow icon={User} label="Titular" value={cuenta.titular} onCopy={() => handleCopy(cuenta.titular, 'titular')} copied={copiedField === 'titular'} />
                  {cuenta.rnc && (
                    <CuentaRow icon={Hash} label="RNC" value={cuenta.rnc} onCopy={() => handleCopy(cuenta.rnc, 'rnc')} copied={copiedField === 'rnc'} />
                  )}
                  <div className="flex items-center justify-between pt-1 border-t border-blue-200">
                    <span className="text-xs text-blue-600 font-bold">Monto a transferir:</span>
                    <span className="text-lg font-black text-blue-800">RD${montoFinal?.toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Paso 2: Datos de la transferencia */}
          <div>
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-5 h-5 bg-[#1a0a3a] text-white rounded-full flex items-center justify-center text-[10px] font-black">2</span>
              Complete los datos de la transferencia
            </h3>

            <div className="space-y-3">
              <div>
                <Label htmlFor="referencia" className="text-xs font-bold text-gray-600">
                  Número de Referencia / Confirmación *
                </Label>
                <Input
                  id="referencia"
                  placeholder="Ej: 1234567890"
                  value={formData.referencia}
                  onChange={e => setFormData(prev => ({ ...prev, referencia: e.target.value }))}
                  className="mt-1 h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="banco_origen" className="text-xs font-bold text-gray-600">
                    Banco Origen
                  </Label>
                  <Input
                    id="banco_origen"
                    placeholder="Ej: Banreservas"
                    value={formData.banco_origen}
                    onChange={e => setFormData(prev => ({ ...prev, banco_origen: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label htmlFor="titular_cuenta" className="text-xs font-bold text-gray-600">
                    Titular de la Cuenta
                  </Label>
                  <Input
                    id="titular_cuenta"
                    placeholder="Nombre del titular"
                    value={formData.titular_cuenta}
                    onChange={e => setFormData(prev => ({ ...prev, titular_cuenta: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Paso 3: Comprobante */}
          <div>
            <h3 className="text-xs font-black text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-5 h-5 bg-[#1a0a3a] text-white rounded-full flex items-center justify-center text-[10px] font-black">3</span>
              Suba el comprobante de pago *
            </h3>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            {comprobante ? (
              <div className="border-2 border-emerald-300 bg-emerald-50 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  {preview ? (
                    <img src={preview} alt="Comprobante" className="w-20 h-20 object-cover rounded-lg border border-emerald-200" />
                  ) : (
                    <div className="w-20 h-20 bg-emerald-100 rounded-lg flex items-center justify-center">
                      <FileImage className="w-8 h-8 text-emerald-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-emerald-800 truncate">{comprobante.name}</p>
                    <p className="text-xs text-emerald-600">{(comprobante.size / 1024).toFixed(0)} KB</p>
                    <button
                      onClick={() => { setComprobante(null); setPreview(null); }}
                      className="text-xs text-red-500 hover:text-red-700 font-bold mt-1"
                    >
                      Cambiar archivo
                    </button>
                  </div>
                  <Check className="w-6 h-6 text-emerald-500 shrink-0" />
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all group"
              >
                <Upload className="w-10 h-10 mx-auto text-gray-300 group-hover:text-blue-400 mb-3" />
                <p className="text-sm font-bold text-gray-500 group-hover:text-blue-600">
                  Haga clic para subir el comprobante
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  JPG, PNG, WebP o PDF · Máximo 5MB
                </p>
              </button>
            )}
          </div>

          {/* Aviso */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              <strong>Importante:</strong> Su plan se activará una vez verificado el comprobante.
              Este proceso puede tomar hasta 24 horas hábiles.
              Los comprobantes falsos resultarán en suspensión de la cuenta.
            </p>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={submitting || !comprobante || !formData.referencia.trim()}
            className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-black uppercase tracking-wider text-xs shadow-lg disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                Enviar Pago para Verificación
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

// Helper component for bank account rows
const CuentaRow = ({ icon: Icon, label, value, onCopy, copied }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2 min-w-0">
      <Icon className="w-4 h-4 text-blue-400 shrink-0" />
      <span className="text-xs text-blue-600 font-medium">{label}:</span>
      <span className="text-sm font-bold text-blue-900 truncate">{value}</span>
    </div>
    <button
      onClick={onCopy}
      className="shrink-0 p-1.5 rounded-lg hover:bg-blue-100 transition-colors"
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-blue-400" />}
    </button>
  </div>
);

export default PagoTransferenciaModal;
