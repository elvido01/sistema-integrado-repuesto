import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Search, MessageCircle, CalendarClock, Ban, ShieldAlert, PackageSearch } from 'lucide-react';
import { formatFechaDMY } from '@/lib/dateUtils';
import {
  normalizarTelefonoRD, clasificarSeguimiento, ordenarSeguimientos,
  filtrarSeguimientos, resumenSeguimientos, ultimaNota, validarAccionEstado,
} from '@/lib/seguimientosUtils';

const hoyLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

const ESTADOS = {
  nuevo: { label: 'Nuevo', tone: 'bg-sky-100 text-sky-700' },
  interesado: { label: 'Interesado', tone: 'bg-cyan-100 text-cyan-700' },
  precio_enviado: { label: 'Precio enviado', tone: 'bg-indigo-100 text-indigo-700' },
  pendiente_pago: { label: 'Pendiente de pago', tone: 'bg-amber-100 text-amber-700' },
  prometio_pasar: { label: 'Prometió pasar', tone: 'bg-violet-100 text-violet-700' },
  requiere_aprobacion: { label: 'Requiere aprobación', tone: 'bg-red-100 text-red-700' },
  agotado_solicitado: { label: 'Agotado solicitado', tone: 'bg-slate-200 text-slate-700' },
};
const PRIORIDADES = { alta: 'bg-red-100 text-red-700', media: 'bg-amber-100 text-amber-700', baja: 'bg-slate-100 text-slate-600' };
const CANALES = ['whatsapp', 'tienda', 'telefono', 'referido', 'redes', 'otro'];
const TABS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'vencidos', label: 'Vencidos' },
  { id: 'proximos', label: 'Próximos' },
  { id: 'todos', label: 'Todos' },
];

const SeguimientosHoyPage = () => {
  const { toast } = useToast();
  const hoyStr = hoyLocal();
  const [fichas, setFichas] = useState([]);
  const [idsHoy, setIdsHoy] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filtros, setFiltros] = useState({ tab: 'hoy', estado: '', prioridad: '', canal: '', busqueda: '' });

  // modal gestionar
  const [gestionar, setGestionar] = useState(null); // ficha
  const [form, setForm] = useState({ proxima_accion: '', fecha_seguimiento: '', prioridad: '', nota: '' });

  // modal conversación
  const [convFicha, setConvFicha] = useState(null);
  const [convMensajes, setConvMensajes] = useState(null); // null=cargando, []=sin conversación

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [abiertas, hoy] = await Promise.all([
        supabase.from('crm_seguimiento').select('*').not('estado', 'in', '(comprado,perdido)')
          .order('actualizado_en', { ascending: false }).limit(500),
        supabase.from('hermes_crm_hoy').select('seguimiento_id'),
      ]);
      if (abiertas.error) throw abiertas.error;
      if (hoy.error) throw hoy.error;
      setFichas(abiertas.data || []);
      setIdsHoy(new Set((hoy.data || []).map((r) => r.seguimiento_id)));
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudieron cargar los seguimientos', description: e.message });
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const ctx = useMemo(() => ({ hoyStr, idsHoy }), [hoyStr, idsHoy]);
  const listado = useMemo(
    () => ordenarSeguimientos(filtrarSeguimientos(fichas, filtros, ctx)),
    [fichas, filtros, ctx]
  );
  const resumen = useMemo(() => resumenSeguimientos(fichas, ctx), [fichas, ctx]);

  const abrirGestionar = (f) => {
    setForm({
      proxima_accion: f.proxima_accion || '',
      fecha_seguimiento: f.fecha_seguimiento || '',
      prioridad: f.prioridad || 'media',
      nota: '',
    });
    setGestionar(f);
  };

  // ÚNICA vía de escritura del CRM: crm_upsert_seguimiento (nada de UPDATE directo).
  // Identifica la ficha por teléfono + producto; campos en NULL no se tocan.
  const upsert = async (ficha, cambios) => {
    const { data, error } = await supabase.rpc('crm_upsert_seguimiento', {
      p_telefono: ficha.telefono,
      p_producto: ficha.producto_consultado,
      p_codigo: ficha.codigo_producto,
      p_estado: cambios.estado ?? null,
      p_prioridad: cambios.prioridad ?? null,
      p_proxima_accion: cambios.proxima_accion ?? null,
      p_fecha_seguimiento: cambios.fecha_seguimiento ?? null,
      p_nota: cambios.nota ?? null,
      p_solicitud_id: cambios.solicitud_id ?? null,
      p_creado_por: 'web',
    });
    if (error) throw error;
    return data;
  };

  const guardar = async (estadoNuevo = null) => {
    const f = gestionar;
    if (!f) return;
    const nota = form.nota.trim();
    const valida = validarAccionEstado(estadoNuevo, nota);
    if (!valida.ok) {
      toast({ variant: 'destructive', title: 'Falta la nota', description: valida.error });
      return;
    }
    setBusy(true);
    try {
      let solicitudId = null;
      if (estadoNuevo === 'agotado_solicitado') {
        const tel = normalizarTelefonoRD(f.telefono);
        if (tel) {
          const { data: sol } = await supabase.from('solicitudes_clientes').select('id')
            .eq('phone_normalized', tel).in('estado', ['abierta', 'solicitado']).limit(1);
          solicitudId = sol?.[0]?.id || null;
        }
      }
      await upsert(f, {
        estado: estadoNuevo,
        prioridad: form.prioridad !== f.prioridad ? form.prioridad : null,
        proxima_accion: form.proxima_accion.trim() || null,
        fecha_seguimiento: form.fecha_seguimiento || null,
        nota: nota || null,
        solicitud_id: solicitudId,
      });
      toast({ title: estadoNuevo ? `Ficha marcada: ${ESTADOS[estadoNuevo]?.label || estadoNuevo}` : 'Seguimiento actualizado' });
      setGestionar(null);
      await cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo guardar', description: e.message });
    }
    setBusy(false);
  };

  const verConversacion = async (f) => {
    setConvFicha(f);
    setConvMensajes(null);
    try {
      const tel = normalizarTelefonoRD(f.telefono);
      const { data: convs, error } = await supabase.from('hermes_whatsapp_conversaciones')
        .select('conversacion_id, telefono');
      if (error) throw error;
      const conv = (convs || []).find((c) => normalizarTelefonoRD(c.telefono) === tel);
      if (!conv) { setConvMensajes([]); return; }
      const { data: msgs, error: e2 } = await supabase.from('hermes_whatsapp_mensajes')
        .select('quien, texto, fecha').eq('conversation_id', conv.conversacion_id)
        .order('fecha', { ascending: false }).limit(10);
      if (e2) throw e2;
      setConvMensajes((msgs || []).reverse());
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cargar la conversación', description: e.message });
      setConvMensajes([]);
    }
  };

  const chip = (valor, etiqueta, tone) => (
    <div className={`rounded-lg px-3 py-2 text-center ${tone}`}>
      <div className="text-xl font-bold leading-none">{valor}</div>
      <div className="text-[11px] mt-1">{etiqueta}</div>
    </div>
  );

  return (
    <div className="p-4 space-y-4">
      <Helmet><title>Seguimientos de Hoy</title></Helmet>

      <div className="flex flex-wrap items-center gap-3">
        <CalendarClock className="w-6 h-6 text-indigo-600" />
        <h1 className="text-xl font-bold">Seguimientos de Hoy</h1>
        <span className="text-sm text-muted-foreground">La tienda ejecuta; Hermes prepara. Los mensajes se envían a mano.</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={cargar} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {chip(resumen.hoy, 'Para hoy', 'bg-indigo-50 text-indigo-800')}
        {chip(resumen.vencidos, 'Vencidos', 'bg-red-50 text-red-800')}
        {chip(resumen.alta, 'Prioridad alta', 'bg-amber-50 text-amber-800')}
        {chip(resumen.requiereAprobacion, 'Requieren aprobación', 'bg-rose-50 text-rose-800')}
        {chip(resumen.agotadoSolicitado, 'Agotados solicitados', 'bg-slate-100 text-slate-700')}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Button key={t.id} size="sm"
            variant={filtros.tab === t.id ? 'default' : 'outline'}
            onClick={() => setFiltros((p) => ({ ...p, tab: t.id }))}>
            {t.label}
          </Button>
        ))}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-2.5 text-muted-foreground" />
          <Input className="pl-7 h-9 w-56" placeholder="Cliente, teléfono o producto…"
            value={filtros.busqueda}
            onChange={(e) => setFiltros((p) => ({ ...p, busqueda: e.target.value }))} />
        </div>
        <Select value={filtros.estado || 'todos'} onValueChange={(v) => setFiltros((p) => ({ ...p, estado: v === 'todos' ? '' : v }))}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {Object.entries(ESTADOS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtros.prioridad || 'todas'} onValueChange={(v) => setFiltros((p) => ({ ...p, prioridad: v === 'todas' ? '' : v }))}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda prioridad</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="media">Media</SelectItem>
            <SelectItem value="baja">Baja</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtros.canal || 'todos'} onValueChange={(v) => setFiltros((p) => ({ ...p, canal: v === 'todos' ? '' : v }))}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Canal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo canal</SelectItem>
            {CANALES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Teléfono</th>
              <th className="px-3 py-2">Canal</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Prioridad</th>
              <th className="px-3 py-2">Próxima acción</th>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Última nota</th>
              <th className="px-3 py-2">Actualizado</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && !fichas.length ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando…
              </td></tr>
            ) : listado.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                Sin seguimientos en esta pestaña. 🎉
              </td></tr>
            ) : listado.map((f) => {
              const clase = clasificarSeguimiento(f, hoyStr);
              const est = ESTADOS[f.estado] || { label: f.estado, tone: 'bg-slate-100 text-slate-600' };
              return (
                <tr key={f.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium">{f.cliente_nombre}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{f.telefono || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">{f.canal_origen}</td>
                  <td className="px-3 py-2">
                    {f.producto_consultado || '—'}
                    {f.codigo_producto && <span className="ml-1 text-xs text-muted-foreground">({f.codigo_producto})</span>}
                  </td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${est.tone}`}>{est.label}</span></td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${PRIORIDADES[f.prioridad] || PRIORIDADES.media}`}>{f.prioridad}</span></td>
                  <td className="px-3 py-2 max-w-[220px] truncate" title={f.proxima_accion || ''}>{f.proxima_accion || '—'}</td>
                  <td className={`px-3 py-2 whitespace-nowrap ${clase === 'vencido' ? 'text-red-600 font-semibold' : ''}`}>
                    {f.fecha_seguimiento ? formatFechaDMY(f.fecha_seguimiento) : 'sin fecha'}
                  </td>
                  <td className="px-3 py-2 max-w-[240px] truncate" title={f.notas || ''}>{ultimaNota(f.notas) || '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {f.actualizado_en ? formatFechaDMY(String(f.actualizado_en).slice(0, 10)) : ''}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button size="sm" variant="outline" className="mr-1"
                      disabled={!f.telefono}
                      title={f.telefono ? 'Gestionar seguimiento' : 'Ficha sin teléfono: se gestiona desde Hermes'}
                      onClick={() => abrirGestionar(f)}>
                      Gestionar
                    </Button>
                    <Button size="sm" variant="ghost" title="Ver conversación de WhatsApp"
                      disabled={!f.telefono} onClick={() => verConversacion(f)}>
                      <MessageCircle className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- Modal gestionar (todo pasa por crm_upsert_seguimiento) ---------- */}
      <Dialog open={!!gestionar} onOpenChange={(o) => !o && setGestionar(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gestionar — {gestionar?.cliente_nombre}</DialogTitle>
          </DialogHeader>
          {gestionar && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {gestionar.producto_consultado || 'Sin producto'} · {gestionar.telefono} ·{' '}
                {(ESTADOS[gestionar.estado] || {}).label || gestionar.estado}
              </div>
              <div>
                <label className="text-sm font-medium">Próxima acción</label>
                <Input value={form.proxima_accion}
                  onChange={(e) => setForm((p) => ({ ...p, proxima_accion: e.target.value }))}
                  placeholder="ej. llamarlo a ver si pasa hoy" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Fecha de seguimiento</label>
                  <Input type="date" value={form.fecha_seguimiento}
                    onChange={(e) => setForm((p) => ({ ...p, fecha_seguimiento: e.target.value }))} />
                </div>
                <div>
                  <label className="text-sm font-medium">Prioridad</label>
                  <Select value={form.prioridad} onValueChange={(v) => setForm((p) => ({ ...p, prioridad: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alta">Alta</SelectItem>
                      <SelectItem value="media">Media</SelectItem>
                      <SelectItem value="baja">Baja</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Nota (se acumula con fecha)</label>
                <Textarea rows={2} value={form.nota}
                  onChange={(e) => setForm((p) => ({ ...p, nota: e.target.value }))}
                  placeholder="qué pasó / qué dijo el cliente" />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" disabled={busy}
                  title="Descuento, crédito, negociación, garantía o reclamo — exige la nota"
                  onClick={() => guardar('requiere_aprobacion')}>
                  <ShieldAlert className="w-4 h-4 mr-1" />Requiere aprobación
                </Button>
                <Button size="sm" variant="outline" disabled={busy}
                  title="El cliente pide algo sin existencia (enlaza la solicitud si existe)"
                  onClick={() => guardar('agotado_solicitado')}>
                  <PackageSearch className="w-4 h-4 mr-1" />Agotado solicitado
                </Button>
                <Button size="sm" variant="outline" disabled={busy}
                  className="text-red-600 border-red-300 hover:bg-red-50"
                  title="Exige la razón en la nota"
                  onClick={() => guardar('perdido')}>
                  <Ban className="w-4 h-4 mr-1" />Perdido
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                La venta NO se marca aquí: al facturar, la ficha se cierra sola como comprada.
              </p>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button onClick={() => guardar(null)} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Modal conversación (solo lectura) ---------- */}
      <Dialog open={!!convFicha} onOpenChange={(o) => !o && setConvFicha(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>WhatsApp — {convFicha?.cliente_nombre}</DialogTitle>
          </DialogHeader>
          {convMensajes === null ? (
            <div className="py-6 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Buscando conversación…
            </div>
          ) : convMensajes.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              No hay conversación de WhatsApp asociada a este teléfono.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {convMensajes.map((m, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                  m.quien === 'yo' ? 'ml-auto bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-800'}`}>
                  <div>{m.texto || <em className="text-muted-foreground">(adjunto)</em>}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {m.quien === 'yo' ? 'Tienda' : 'Cliente'} · {String(m.fecha || '').slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SeguimientosHoyPage;
