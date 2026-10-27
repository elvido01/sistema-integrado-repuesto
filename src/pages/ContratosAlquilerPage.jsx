// =====================================================================
// Contratos de alquiler (servicios e inmobiliarias, 27/10/2026)
// ---------------------------------------------------------------------
// Cada contrato tiene su propio servicio (ALQ-0001…) con el monto mensual:
// vivienda familiar sin ITBIS (exenta), local/comercial con 18%. El estado
// del mes sale de las facturas reales (vista contratos_alquiler_estado): si
// ya hay una factura de ese servicio este mes, está facturado.
//
// "Facturar" NO emite nada solo: deja la factura preparada en Ventas con el
// cliente del contrato y su alquiler, para revisarla y grabarla con F10
// (ahí salen el NCF/e-CF y, si el cliente es agente de retención, las
// retenciones). El depósito de garantía no es ingreso: se registra aquí y se
// marca cuando se devuelve. Ver sql/retenciones_2026_y_alquileres.sql
// =====================================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Home, Plus, Loader2, RefreshCw, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { usePanels } from '@/contexts/panelCore';
import { ordenarPantalla, normalizarOrdenVenta } from '@/lib/puenteAgente';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';

const money = (v) => `RD$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f) => (f ? new Date(String(f).length <= 10 ? `${f}T12:00:00` : f).toLocaleDateString('es-DO') : '—');
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const campo = 'h-9 w-full rounded-md border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';
const VACIO = { cliente_id: '', descripcion: '', uso: 'comercial', monto: '', dia_cobro: 1, fecha_inicio: hoyRD(), fecha_fin: '', deposito: '', notas: '' };

export default function ContratosAlquilerPage() {
  const { tenantId } = useAuth();
  const { openPanel } = usePanels();
  const { toast } = useToast();
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [form, setForm] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [buscarCli, setBuscarCli] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    setCargando(true);
    const { data, error } = await supabase.from('contratos_alquiler_estado').select('*')
      .eq('tenant_id', tenantId).order('numero', { ascending: true });
    if (error) toast({ variant: 'destructive', title: 'No se pudo cargar', description: error.message });
    setFilas(data || []);
    setCargando(false);
  }, [tenantId, toast]);
  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!form) return undefined;
    const t = setTimeout(async () => {
      let q = supabase.from('clientes').select('id, nombre, rnc, agente_retencion').eq('tenant_id', tenantId).eq('activo', true).order('nombre').limit(20);
      if (buscarCli.trim()) q = q.ilike('nombre', `%${buscarCli.trim()}%`);
      const { data } = await q;
      setClientes(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [form, buscarCli, tenantId]);

  const activos = useMemo(() => filas.filter((f) => f.activo), [filas]);
  const pendientesMes = activos.filter((f) => !f.facturado_este_mes);

  const facturar = (f) => {
    ordenarPantalla('ventas', normalizarOrdenVenta({
      tipo: 'preparar_venta',
      lineas: [{ codigo: f.producto_codigo, cantidad: 1 }],
      cliente_id: f.cliente_id,
      forma_pago: 'CREDITO',
    }));
    try { openPanel('ventas'); } catch { /* sin acceso a Ventas */ }
    toast({ title: 'Factura preparada en Ventas', description: `${f.cliente_nombre} · ${f.descripcion}. Revísala y grábala con F10.` });
  };

  const guardar = async () => {
    if (!form.cliente_id) { toast({ variant: 'destructive', title: 'Elige el inquilino' }); return; }
    if (!form.descripcion.trim()) { toast({ variant: 'destructive', title: 'Escribe qué se alquila (ej. Local 3, Plaza X)' }); return; }
    if (!(Number(form.monto) > 0)) { toast({ variant: 'destructive', title: 'Escribe el monto mensual' }); return; }
    setGuardando(true);
    const { data, error } = await supabase.rpc('crear_contrato_alquiler', {
      p_cliente_id: form.cliente_id, p_descripcion: form.descripcion, p_uso: form.uso,
      p_monto: Number(form.monto), p_dia_cobro: Number(form.dia_cobro) || 1,
      p_fecha_inicio: form.fecha_inicio || null, p_fecha_fin: form.fecha_fin || null,
      p_deposito: Number(form.deposito) || 0, p_notas: form.notas || null,
    });
    setGuardando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se guardó', description: error.message }); return; }
    toast({ title: `Contrato ${data?.codigo} creado`, description: 'Ya aparece en la lista con su cobro del mes.' });
    setForm(null);
    cargar();
  };

  const actualizar = async (f, cambios, aviso) => {
    const { data, error } = await supabase.from('contratos_alquiler').update(cambios).eq('id', f.id).select('id');
    if (error || !data?.length) { toast({ variant: 'destructive', title: 'No se guardó', description: error?.message || 'Sin permiso.' }); return; }
    toast({ title: aviso });
    cargar();
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <Helmet><title>Contratos de Alquiler — MotoFlow</title></Helmet>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2.5 rounded-xl"><Home className="w-6 h-6 text-emerald-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Contratos de Alquiler</h1>
            <p className="text-sm text-gray-500">{activos.length} activos · {pendientesMes.length} por facturar este mes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={cargar}><RefreshCw className="w-4 h-4" /></Button>
          <Button size="sm" onClick={() => { setBuscarCli(''); setForm({ ...VACIO }); }}><Plus className="w-4 h-4 mr-1" />Nuevo contrato</Button>
        </div>
      </div>

      {cargando ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
      ) : filas.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed text-gray-500">
          Aún no hay contratos. Crea el primero con <b>Nuevo contrato</b>.
        </div>
      ) : (
        <div className="space-y-3">
          {[...filas].sort((a, b) => (a.activo === b.activo ? (a.facturado_este_mes === b.facturado_este_mes ? b.dias_desde_cobro - a.dias_desde_cobro : a.facturado_este_mes ? 1 : -1) : a.activo ? -1 : 1)).map((f) => {
            const atrasado = f.activo && !f.facturado_este_mes && f.dias_desde_cobro > 0;
            return (
              <div key={f.id} className={`bg-white border rounded-xl p-4 shadow-sm flex flex-wrap items-start justify-between gap-3 ${f.activo ? '' : 'opacity-60'}`}>
                <div className="min-w-0">
                  <div className="font-bold text-gray-900">
                    {f.descripcion} <span className="text-xs font-mono text-gray-400">{f.producto_codigo}</span>
                    {!f.activo && <span className="ml-2 text-xs text-gray-500">(terminado)</span>}
                  </div>
                  <div className="text-sm text-gray-600">
                    {f.cliente_nombre} · {money(f.monto)}/mes · cobra el día {f.dia_cobro} · {f.uso === 'vivienda' ? 'vivienda (sin ITBIS)' : 'comercial (ITBIS 18%)'}
                    {f.agente_retencion && <span className="ml-1 text-amber-700">· agente de retención</span>}
                  </div>
                  <div className="text-xs mt-1 text-gray-500">
                    Desde {fecha(f.fecha_inicio)}{f.fecha_fin ? ` hasta ${fecha(f.fecha_fin)}` : ''}
                    {Number(f.deposito) > 0 && <> · depósito {money(f.deposito)}{f.deposito_devuelto_at ? ` (devuelto el ${fecha(f.deposito_devuelto_at)})` : ' (no es ingreso)'}</>}
                    {f.ultima_factura_numero && <> · última factura FT-{String(f.ultima_factura_numero).padStart(7, '0')} del {fecha(f.ultima_factura_fecha)}</>}
                  </div>
                  {f.activo && (
                    <div className="text-xs mt-1 font-semibold">
                      {f.facturado_este_mes
                        ? <span className="text-emerald-700 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Facturado este mes</span>
                        : atrasado
                          ? <span className="text-red-600 inline-flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Sin facturar: el cobro era hace {f.dias_desde_cobro} días</span>
                          : <span className="text-amber-700">Por facturar este mes</span>}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {f.activo && !f.facturado_este_mes && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => facturar(f)}>
                      Facturar <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  )}
                  {Number(f.deposito) > 0 && !f.deposito_devuelto_at && (
                    <Button size="sm" variant="outline" onClick={() => actualizar(f, { deposito_devuelto_at: hoyRD() }, 'Depósito marcado como devuelto')}>Depósito devuelto</Button>
                  )}
                  {f.activo
                    ? <Button size="sm" variant="ghost" onClick={() => window.confirm('¿Terminar este contrato? No se borra: deja de pedir factura.') && actualizar(f, { activo: false, fecha_fin: f.fecha_fin || hoyRD() }, 'Contrato terminado')}>Terminar</Button>
                    : <Button size="sm" variant="ghost" onClick={() => actualizar(f, { activo: true }, 'Contrato reactivado')}>Reactivar</Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !guardando && setForm(null)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Nuevo contrato de alquiler</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600">Inquilino (cliente)</label>
                <input className={campo} placeholder="Buscar cliente…" value={buscarCli} onChange={(e) => setBuscarCli(e.target.value)} />
                <div className="mt-1 max-h-36 overflow-y-auto rounded border">
                  {clientes.map((c) => (
                    <button key={c.id} type="button" onClick={() => setForm((f) => ({ ...f, cliente_id: c.id }))}
                      className={`block w-full text-left px-2 py-1 text-sm ${form.cliente_id === c.id ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}`}>
                      {c.nombre} {c.rnc ? <span className="text-xs text-gray-400">· {c.rnc}</span> : null}
                      {c.agente_retencion ? <span className="text-xs text-amber-700"> · agente de retención</span> : null}
                    </button>
                  ))}
                  {!clientes.length && <div className="px-2 py-1 text-xs text-gray-400">Sin resultados. Créalo primero en Catálogo → Clientes.</div>}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Qué se alquila</label>
                <input className={campo} placeholder="Ej. Local 3, Plaza Duarte" value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Uso</label>
                  <select className={campo} value={form.uso} onChange={(e) => setForm((f) => ({ ...f, uso: e.target.value }))}>
                    <option value="comercial">Comercial / local (ITBIS 18%)</option>
                    <option value="vivienda">Vivienda familiar (exento)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Monto mensual{form.uso === 'comercial' ? ' (con ITBIS)' : ''}</label>
                  <input className={campo} inputMode="decimal" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value.replace(/[^0-9.]/g, '') }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Día de cobro (1–28)</label>
                  <input className={campo} type="number" min="1" max="28" value={form.dia_cobro} onChange={(e) => setForm((f) => ({ ...f, dia_cobro: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Depósito de garantía</label>
                  <input className={campo} inputMode="decimal" value={form.deposito} onChange={(e) => setForm((f) => ({ ...f, deposito: e.target.value.replace(/[^0-9.]/g, '') }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Inicio</label>
                  <input className={campo} type="date" value={form.fecha_inicio} onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Fin (opcional)</label>
                  <input className={campo} type="date" value={form.fecha_fin} onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600">Notas</label>
                <input className={campo} value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
              </div>
              <p className="text-[11px] text-gray-500">
                Se crea un servicio de alquiler con este monto. Si el inquilino es una empresa agente de retención y tú facturas
                como persona física, al facturar se le retiene el 15% de ISR.
              </p>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" disabled={guardando} onClick={() => setForm(null)}>Cancelar</Button>
              <Button disabled={guardando} onClick={guardar}>{guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear contrato'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
