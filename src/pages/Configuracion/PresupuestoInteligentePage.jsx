import React, { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DollarSign, TrendingUp, Shield, Calendar, Lock, Save, Loader2,
  KeyRound, AlertTriangle, CheckCircle2, Sparkles, Eye, EyeOff
} from 'lucide-react';

const formatRD = (n) => `RD$ ${(Number(n) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PresupuestoInteligentePage = () => {
  const { toast } = useToast();
  const { tenantId, empresa } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState({
    monto_base_mensual: '',
    incremento_mensual_pct: 0,
    caja_minima: 0,
    dias_credito_promedio: 30,
    limite_aprobacion_manual: 0,
    control_estricto: false,
    distribuir_por: 'total',
    fecha_base: new Date().toISOString().slice(0, 10),
    notas: '',
  });
  const [presupuestoActual, setPresupuestoActual] = useState(null);

  // PIN supervisor
  const [tienePin, setTienePin] = useState(false);
  const [pinNuevo, setPinNuevo] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [cfgRes, presupRes, empresaRes] = await Promise.all([
        supabase.from('presupuesto_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.rpc('get_presupuesto_compras_v2'),
        supabase.from('config_empresa').select('pin_supervisor_hash').eq('tenant_id', tenantId).maybeSingle(),
      ]);

      if (cfgRes.data) {
        setConfig({
          monto_base_mensual: cfgRes.data.monto_base_mensual ?? '',
          incremento_mensual_pct: cfgRes.data.incremento_mensual_pct ?? 0,
          caja_minima: cfgRes.data.caja_minima ?? 0,
          dias_credito_promedio: cfgRes.data.dias_credito_promedio ?? 30,
          limite_aprobacion_manual: cfgRes.data.limite_aprobacion_manual ?? 0,
          control_estricto: !!cfgRes.data.control_estricto,
          distribuir_por: cfgRes.data.distribuir_por ?? 'total',
          fecha_base: cfgRes.data.fecha_base?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          notas: cfgRes.data.notas ?? '',
        });
      }
      if (presupRes.data) setPresupuestoActual(presupRes.data);
      setTienePin(!!empresaRes.data?.pin_supervisor_hash);
    } catch (err) {
      console.error('[PresupuestoInteligente] fetch:', err);
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setLoading(false);
    }
  }, [tenantId, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        monto_base_mensual: config.monto_base_mensual === '' ? null : Number(config.monto_base_mensual),
        incremento_mensual_pct: Number(config.incremento_mensual_pct) || 0,
        caja_minima: Number(config.caja_minima) || 0,
        dias_credito_promedio: parseInt(config.dias_credito_promedio) || 30,
        limite_aprobacion_manual: Number(config.limite_aprobacion_manual) || 0,
        control_estricto: !!config.control_estricto,
        distribuir_por: config.distribuir_por,
        fecha_base: config.fecha_base || new Date().toISOString().slice(0, 10),
        notas: config.notas || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('presupuesto_config').upsert(payload, { onConflict: 'tenant_id' });
      if (error) throw error;
      toast({ title: '✅ Configuración guardada', description: 'El presupuesto se aplicará a las próximas órdenes de compra.' });
      await fetchData();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al guardar', description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleSetPin = async () => {
    if (!pinNuevo || pinNuevo.length < 4) {
      toast({ variant: 'destructive', title: 'PIN corto', description: 'Mínimo 4 caracteres.' });
      return;
    }
    if (pinNuevo !== pinConfirm) {
      toast({ variant: 'destructive', title: 'No coinciden', description: 'El PIN y la confirmación no son iguales.' });
      return;
    }
    setSavingPin(true);
    try {
      const { error } = await supabase.rpc('set_pin_supervisor', { p_pin: pinNuevo });
      if (error) throw error;
      toast({ title: '✅ PIN configurado', description: 'Será requerido para desbloquear órdenes que excedan el presupuesto.' });
      setPinNuevo('');
      setPinConfirm('');
      setTienePin(true);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error', description: err.message });
    } finally {
      setSavingPin(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const modo = config.monto_base_mensual === '' || config.monto_base_mensual === null
    ? 'auto'
    : 'manual';

  return (
    <>
      <Helmet><title>Presupuesto Inteligente — {empresa?.nombre || 'Sistema'}</title></Helmet>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-6 max-w-6xl mx-auto space-y-6 bg-gray-50 min-h-full"
      >
        {/* Header */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-200">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-violet-600 rounded-lg shadow-md">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">Presupuesto Inteligente de Compras</h1>
            <p className="text-xs text-slate-500">Control financiero para órdenes de compra · Plan Enterprise</p>
          </div>
        </div>

        {/* Estado actual */}
        {presupuestoActual && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className={`rounded-lg p-3 border-2 ${
              presupuestoActual.color === 'verde' ? 'bg-emerald-50 border-emerald-300' :
              presupuestoActual.color === 'amarillo' ? 'bg-amber-50 border-amber-300' :
              presupuestoActual.color === 'rojo' ? 'bg-red-50 border-red-300' :
              'bg-slate-50 border-slate-300'
            }`}>
              <p className="text-[10px] uppercase font-bold text-slate-500">Mes actual ({presupuestoActual.modo})</p>
              <p className="text-lg font-black text-slate-800">{formatRD(presupuestoActual.monto_base_mensual)}</p>
            </div>
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3">
              <p className="text-[10px] uppercase font-bold text-blue-700">Comprado</p>
              <p className="text-lg font-black text-blue-900">{formatRD(presupuestoActual.comprado_mes)}</p>
            </div>
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-lg p-3">
              <p className="text-[10px] uppercase font-bold text-emerald-700">Disponible</p>
              <p className="text-lg font-black text-emerald-900">{formatRD(presupuestoActual.disponible)}</p>
            </div>
            <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3">
              <p className="text-[10px] uppercase font-bold text-purple-700">Caja en vivo</p>
              <p className="text-lg font-black text-purple-900">{formatRD(presupuestoActual.caja_disponible?.caja_disponible)}</p>
            </div>
          </div>
        )}

        {/* Aviso modo */}
        <div className={`rounded-lg p-3 border ${modo === 'manual' ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200'}`}>
          <p className="text-xs text-slate-700">
            <strong>Modo {modo === 'manual' ? 'manual' : 'automático'}:</strong>{' '}
            {modo === 'manual'
              ? `usás un monto fijo de ${formatRD(config.monto_base_mensual)}/mes con ${config.incremento_mensual_pct}% de incremento mensual.`
              : 'el sistema calcula el presupuesto automáticamente desde tus ventas (ventas × factor de salud de caja).'}
            {modo === 'auto' && ' Para usar modo manual, ingresá un Monto Base abajo.'}
          </p>
        </div>

        {/* Form principal */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white rounded-lg shadow-sm p-5 border border-slate-200">
          {/* Monto base */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" /> Monto base mensual (RD$)
            </Label>
            <Input
              type="number" min={0} step="0.01"
              value={config.monto_base_mensual}
              onChange={(e) => setConfig(p => ({ ...p, monto_base_mensual: e.target.value }))}
              placeholder="Vacío = cálculo automático"
            />
            <p className="text-[10px] text-slate-500">Dejá vacío para que el sistema calcule según tus ventas.</p>
          </div>

          {/* Incremento mensual */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Incremento mensual (%)
            </Label>
            <Input
              type="number" min={0} max={100} step="0.5"
              value={config.incremento_mensual_pct}
              onChange={(e) => setConfig(p => ({ ...p, incremento_mensual_pct: e.target.value }))}
            />
            <p className="text-[10px] text-slate-500">Cada mes el monto base se incrementa por este %. Ej: 5% = 5%/mes.</p>
          </div>

          {/* Fecha base */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Fecha base
            </Label>
            <Input
              type="date"
              value={config.fecha_base}
              onChange={(e) => setConfig(p => ({ ...p, fecha_base: e.target.value }))}
            />
            <p className="text-[10px] text-slate-500">Desde cuándo empezó a contar el incremento mensual.</p>
          </div>

          {/* Caja mínima */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-700 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" /> Caja mínima de seguridad (RD$)
            </Label>
            <Input
              type="number" min={0} step="0.01"
              value={config.caja_minima}
              onChange={(e) => setConfig(p => ({ ...p, caja_minima: e.target.value }))}
            />
            <p className="text-[10px] text-slate-500">Monto que SIEMPRE debe permanecer disponible en caja.</p>
          </div>

          {/* Días crédito */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-700">Días promedio de crédito</Label>
            <Input
              type="number" min={0} max={365} step="1"
              value={config.dias_credito_promedio}
              onChange={(e) => setConfig(p => ({ ...p, dias_credito_promedio: e.target.value }))}
            />
            <p className="text-[10px] text-slate-500">Plazo típico de tus suplidores. Usado para proyectar vencimientos.</p>
          </div>

          {/* Límite aprobación */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-700">Límite de aprobación manual (RD$)</Label>
            <Input
              type="number" min={0} step="0.01"
              value={config.limite_aprobacion_manual}
              onChange={(e) => setConfig(p => ({ ...p, limite_aprobacion_manual: e.target.value }))}
            />
            <p className="text-[10px] text-slate-500">Órdenes mayores a este monto requieren PIN supervisor. 0 = sin límite.</p>
          </div>

          {/* Distribución */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-700">Distribución del presupuesto</Label>
            <Select value={config.distribuir_por} onValueChange={(v) => setConfig(p => ({ ...p, distribuir_por: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Total (sin distribución)</SelectItem>
                <SelectItem value="suplidor">Por suplidor</SelectItem>
                <SelectItem value="categoria">Por categoría</SelectItem>
                <SelectItem value="mixto">Mixto (suplidor + categoría)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-500">Cómo distribuir el presupuesto entre buckets (Fase B).</p>
          </div>

          {/* Control estricto */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase text-slate-700">Modo de control</Label>
            <div className="flex items-center gap-2 p-3 rounded-md border border-amber-200 bg-amber-50">
              <Checkbox
                id="ctrl-estricto"
                checked={config.control_estricto}
                onCheckedChange={(v) => setConfig(p => ({ ...p, control_estricto: !!v }))}
              />
              <Label htmlFor="ctrl-estricto" className="text-xs font-bold text-amber-900 cursor-pointer flex items-center gap-1">
                <Lock className="w-3 h-3" /> CONTROL ESTRICTO ACTIVO
              </Label>
            </div>
            <p className="text-[10px] text-slate-500">
              {config.control_estricto
                ? 'Bloquea grabado de órdenes que excedan el presupuesto. Pide PIN supervisor para autorizar.'
                : 'Solo muestra alerta visual. Permite grabar igual.'}
            </p>
          </div>

          {/* Notas */}
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs font-bold uppercase text-slate-700">Notas</Label>
            <Textarea
              rows={2}
              value={config.notas}
              onChange={(e) => setConfig(p => ({ ...p, notas: e.target.value }))}
              placeholder="Comentarios internos (opcional)..."
            />
          </div>
        </div>

        {/* Sección PIN supervisor */}
        <div className="bg-white rounded-lg shadow-sm p-5 border-2 border-red-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-red-100 rounded">
              <KeyRound className="w-4 h-4 text-red-700" />
            </div>
            <h3 className="text-sm font-black uppercase text-red-900">PIN del supervisor</h3>
            {tienePin
              ? <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> CONFIGURADO</span>
              : <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> SIN CONFIGURAR</span>
            }
          </div>
          <p className="text-xs text-slate-600 mb-3">
            Solo el dueño/gerente debe conocer este PIN. Sirve para desbloquear órdenes que excedan el presupuesto cuando está activo el "Control Estricto".
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase text-slate-700">{tienePin ? 'Nuevo PIN' : 'PIN'}</Label>
              <div className="relative">
                <Input
                  type={showPin ? 'text' : 'password'}
                  value={pinNuevo}
                  onChange={(e) => setPinNuevo(e.target.value)}
                  placeholder="Mínimo 4 caracteres"
                  className="pr-9"
                />
                <button type="button" onClick={() => setShowPin(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-bold uppercase text-slate-700">Confirmar</Label>
              <Input
                type={showPin ? 'text' : 'password'}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value)}
                placeholder="Repetir"
              />
            </div>
            <div className="flex items-end">
              <Button
                onClick={handleSetPin}
                disabled={savingPin || !pinNuevo}
                className="w-full h-10 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase"
              >
                {savingPin ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1" />}
                {tienePin ? 'Cambiar PIN' : 'Establecer PIN'}
              </Button>
            </div>
          </div>
        </div>

        {/* Botón guardar config principal */}
        <div className="flex justify-end gap-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-10 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs uppercase px-6"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Guardar configuración
          </Button>
        </div>
      </motion.div>
    </>
  );
};

export default PresupuestoInteligentePage;
