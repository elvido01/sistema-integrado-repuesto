import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Loader2, RefreshCw, PiggyBank, Plus, Check, ArrowLeft, Ban, Archive, Copy, Eye, EyeOff, PartyPopper, Trash2, Pencil, ChevronDown, Landmark } from 'lucide-react';
import { formatFechaDMY } from '@/lib/dateUtils';
import CuentaBancariaSelect from '@/components/bancos/CuentaBancariaSelect';
import { estadoDia, estadisticasSan, aplicarPagoEnCascada, planPagos, agruparEnBloques, bloquesAbiertos } from '@/lib/sanUtils';

const hoyTZ = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });

const SanPage = () => {
  const { toast } = useToast();
  const hoyStr = hoyTZ();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ocultar, setOcultar] = useState(() => localStorage.getItem('san_ocultar_montos') === '1');

  const [sans, setSans] = useState([]);
  const [sanSel, setSanSel] = useState(null);       // SAN abierto
  const [pagos, setPagos] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [tabDetalle, setTabDetalle] = useState('calendario');

  const [crearOpen, setCrearOpen] = useState(false);
  const [crearForm, setCrearForm] = useState({ nombre: '', monto: '', dias: '', inicio: hoyTZ(), cuenta: null });
  const [pagoDia, setPagoDia] = useState(null);      // cuadro tocado
  const [pagoForm, setPagoForm] = useState({ monto: '', observaciones: '' });
  const [celebrar, setCelebrar] = useState(false);
  const [elimOpen, setElimOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: '', monto: '', dias: '', inicio: '', cuenta: null });
  const [cuentasInfo, setCuentasInfo] = useState({}); // id -> { label, saldo, moneda }
  // Cuenta cuyo saldo se muestra en el tablero del SAN (la elige el usuario)
  const [cuentaDisplay, setCuentaDisplay] = useState(() => localStorage.getItem('san_cuenta_display') || '');

  const money = useCallback((v) => ocultar ? 'RD$ ····'
    : `RD$ ${new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)}`,
  [ocultar]);

  const cargar = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: ctas }] = await Promise.all([
      supabase.from('san').select('*').order('created_at', { ascending: false }),
      supabase.from('cuentas_bancarias_saldos').select('id, banco, alias, saldo, moneda'),
    ]);
    if (error) toast({ variant: 'destructive', title: 'No se pudo cargar SAN', description: error.message });
    else setSans(data || []);
    setCuentasInfo(Object.fromEntries((ctas || []).map((c) => [c.id, {
      label: `${c.banco}${c.alias ? ` — ${c.alias}` : ''}`,
      saldo: Number(c.saldo) || 0,
      moneda: c.moneda,
    }])));
    setLoading(false);
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirSan = useCallback(async (s) => {
    setSanSel(s);
    setTabDetalle('calendario');
    const [p, h] = await Promise.all([
      supabase.from('san_pagos').select('*').eq('san_id', s.id).order('numero_dia'),
      supabase.from('san_transacciones').select('*').eq('san_id', s.id).order('created_at', { ascending: false }).limit(200),
    ]);
    if (p.error) { toast({ variant: 'destructive', title: 'Error', description: p.error.message }); return; }
    setPagos(p.data || []);
    setHistorial(h.data || []);
  }, [toast]);

  const refrescarSel = useCallback(async (sanId) => {
    await cargar();
    const { data } = await supabase.from('san').select('*').eq('id', sanId).single();
    if (data) await abrirSan(data);
    return data;
  }, [cargar, abrirSan]);

  // ------- crear -------
  const plan = useMemo(() => planPagos(Number(crearForm.monto) || 0, Number(crearForm.dias) || 1), [crearForm]);
  const crear = async () => {
    const monto = Number(String(crearForm.monto).replace(/,/g, '')) || 0;
    const dias = Math.trunc(Number(crearForm.dias)) || 0;
    if (!crearForm.nombre.trim() || monto <= 0 || dias <= 0) {
      toast({ variant: 'destructive', title: 'Completa nombre, monto y días' });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('san_crear', {
        p_nombre: crearForm.nombre.trim(), p_monto_objetivo: monto,
        p_dias: dias, p_fecha_inicio: crearForm.inicio || null,
        p_cuenta_bancaria_id: crearForm.cuenta || null,
      });
      if (error) throw error;
      toast({ title: '🎯 SAN creado', description: `Pago diario: ${money(data.pago_diario)} · meta el ${formatFechaDMY(String(data.fecha_fin))}` });
      setCrearOpen(false);
      setCrearForm({ nombre: '', monto: '', dias: '', inicio: hoyTZ(), cuenta: null });
      const nuevo = await refrescarSel(data.san_id);
      if (!nuevo) await cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo crear', description: e.message });
    }
    setBusy(false);
  };

  // ------- pagar -------
  const abrirPago = (p) => {
    if (sanSel?.estado !== 'Activo' || p.estado === 'Pagado') return;
    setPagoForm({ monto: String(p.saldo_pendiente || p.monto_programado), observaciones: '' });
    setPagoDia(p);
  };

  const previsualizacion = useMemo(() => {
    if (!pagoDia) return null;
    const monto = Number(String(pagoForm.monto).replace(/,/g, '')) || 0;
    if (monto <= 0) return null;
    const cadena = pagos
      .filter((p) => p.numero_dia >= pagoDia.numero_dia && p.estado !== 'Pagado')
      .map((p) => ({ numero_dia: p.numero_dia, falta: Number(p.monto_programado) - Number(p.monto_pagado) }));
    return aplicarPagoEnCascada(cadena, monto);
  }, [pagoDia, pagoForm.monto, pagos]);

  const registrarPago = async () => {
    const monto = Number(String(pagoForm.monto).replace(/,/g, '')) || 0;
    if (monto <= 0) { toast({ variant: 'destructive', title: 'Monto inválido' }); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('san_registrar_pago', {
        p_san_id: sanSel.id, p_numero_dia: pagoDia.numero_dia,
        p_monto: monto, p_observaciones: pagoForm.observaciones.trim() || null,
      });
      if (error) throw error;
      const dias = (data.aplicado || []).map((a) => a.numero_dia).join(', ');
      toast({
        title: `✔ Pago aplicado al día ${dias}`,
        description: data.sobrante > 0 ? `Sobraron ${money(data.sobrante)} (la meta ya quedó cubierta)` : undefined,
      });
      setPagoDia(null);
      await refrescarSel(sanSel.id);
      if (data.completado) setCelebrar(true);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo registrar', description: e.message });
    }
    setBusy(false);
  };

  const cambiarEstado = async (estado) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('san_cambiar_estado', { p_san_id: sanSel.id, p_estado: estado });
      if (error) throw error;
      toast({ title: estado === 'Cancelado' ? 'SAN cancelado' : 'SAN archivado' });
      await refrescarSel(sanSel.id);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo cambiar', description: e.message });
    }
    setBusy(false);
  };

  const eliminar = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc('san_eliminar', { p_san_id: sanSel.id });
      if (error) throw error;
      toast({ title: 'SAN eliminado' });
      setElimOpen(false);
      setSanSel(null);
      await cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo eliminar', description: e.message });
    }
    setBusy(false);
  };

  const abrirEditar = () => {
    setEditForm({
      nombre: sanSel.nombre, monto: String(sanSel.monto_objetivo),
      dias: String(sanSel.dias), inicio: String(sanSel.fecha_inicio),
      cuenta: sanSel.cuenta_bancaria_id || null,
    });
    setEditOpen(true);
  };

  const editar = async () => {
    const monto = Number(String(editForm.monto).replace(/,/g, '')) || 0;
    const dias = Math.trunc(Number(editForm.dias)) || 0;
    if (!editForm.nombre.trim() || monto <= 0 || dias <= 0) {
      toast({ variant: 'destructive', title: 'Completa nombre, monto y días' });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('san_editar', {
        p_san_id: sanSel.id, p_nombre: editForm.nombre.trim(),
        p_monto_objetivo: monto, p_dias: dias, p_fecha_inicio: editForm.inicio,
        p_cuenta_bancaria_id: editForm.cuenta || null,
      });
      if (error) throw error;
      toast({
        title: data.reactivado ? '♻ SAN reactivado y actualizado' : 'SAN actualizado',
        description: `Nuevo pago diario: ${money(data.pago_diario)}${data.completado ? ' — ¡lo ahorrado ya cubre la meta!' : ''}${data.sobrante_sin_aplicar > 0 ? ` · sobraron ${money(data.sobrante_sin_aplicar)} sin aplicar` : ''}`,
      });
      setEditOpen(false);
      await refrescarSel(sanSel.id);
      if (data.completado) setCelebrar(true);
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo editar', description: e.message });
    }
    setBusy(false);
  };

  const duplicar = () => {
    setCrearForm({
      nombre: sanSel.nombre, monto: String(sanSel.monto_objetivo),
      dias: String(sanSel.dias), inicio: hoyTZ(),
    });
    setCelebrar(false);
    setCrearOpen(true);
  };

  // ------- dashboard -------
  const dash = useMemo(() => {
    const activos = sans.filter((s) => s.estado === 'Activo');
    const proximo = [...activos].sort((a, b) => String(a.fecha_fin).localeCompare(String(b.fecha_fin)))[0];
    const diasRestantes = proximo
      ? Math.max(0, Math.round((new Date(`${proximo.fecha_fin}T12:00:00`) - new Date(`${hoyStr}T12:00:00`)) / 864e5))
      : null;
    return {
      activos: activos.length,
      comprometido: activos.reduce((s, x) => s + Number(x.monto_objetivo), 0),
      ahorrado: activos.reduce((s, x) => s + Number(x.monto_ahorrado), 0),
      proximo, diasRestantes,
      completados: sans.filter((s) => ['Completado', 'Archivado'].includes(s.estado)).length,
    };
  }, [sans, hoyStr]);

  const stats = useMemo(() => estadisticasSan(pagos, hoyStr), [pagos, hoyStr]);

  // SAN largos: bloques de 30 días; los completos quedan colapsados
  const bloques = useMemo(() => agruparEnBloques(pagos, hoyStr), [pagos, hoyStr]);
  const [expandidos, setExpandidos] = useState(() => new Set());
  useEffect(() => { setExpandidos(bloquesAbiertos(bloques)); }, [bloques]);
  const toggleBloque = (i) => setExpandidos((prev) => {
    const s = new Set(prev);
    if (s.has(i)) s.delete(i); else s.add(i);
    return s;
  });

  const estadoSanTone = (e) => e === 'Activo' ? 'bg-emerald-100 text-emerald-700'
    : e === 'Completado' ? 'bg-indigo-100 text-indigo-700'
    : e === 'Archivado' ? 'bg-slate-200 text-slate-600' : 'bg-red-100 text-red-600';

  const cuadroClases = (clase, esHoy) => {
    const base = 'rounded-xl border-2 p-2 text-center select-none transition-all duration-200 min-h-[68px] flex flex-col items-center justify-center';
    const tono = clase === 'pagado' ? 'bg-emerald-500 border-emerald-500 text-white shadow'
      : clase === 'parcial' ? 'bg-orange-400 border-orange-400 text-white'
      : clase === 'atrasado' ? 'bg-yellow-300 border-yellow-400 text-yellow-900'
      : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-300';
    const hoyRing = esHoy ? ' ring-4 ring-blue-500/70 border-blue-500' : '';
    const cursor = clase !== 'pagado' ? ' cursor-pointer active:scale-95' : '';
    return `${base} ${tono}${hoyRing}${cursor}`;
  };

  const chip = (valor, etiqueta, tone) => (
    <div className={`rounded-lg px-3 py-2 text-center ${tone}`}>
      <div className="text-lg font-bold leading-none">{valor}</div>
      <div className="text-[11px] mt-1">{etiqueta}</div>
    </div>
  );

  // ================= LISTA / DASHBOARD =================
  if (!sanSel) {
    return (
      <div className="p-4 space-y-4">
        <Helmet><title>SAN — Ahorro Programado</title></Helmet>
        <div className="flex flex-wrap items-center gap-3">
          <PiggyBank className="w-6 h-6 text-emerald-600" />
          <h1 className="text-xl font-bold">SAN — Ahorro Programado</h1>
          <span className="text-sm text-muted-foreground">Un cuadro por día. No rompas la cadena.</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" title={ocultar ? 'Mostrar montos' : 'Ocultar montos'}
              onClick={() => { const v = !ocultar; setOcultar(v); localStorage.setItem('san_ocultar_montos', v ? '1' : '0'); }}>
              {ocultar ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button size="sm" onClick={() => setCrearOpen(true)}><Plus className="w-4 h-4 mr-1" />Nuevo SAN</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {chip(dash.activos, 'SAN activos', 'bg-emerald-50 text-emerald-800')}
          {chip(money(dash.comprometido), 'Comprometido', 'bg-indigo-50 text-indigo-800')}
          {chip(money(dash.ahorrado), 'Ahorrado', 'bg-emerald-50 text-emerald-800')}
          {chip(dash.diasRestantes ?? '—', 'Días restantes', 'bg-sky-50 text-sky-800')}
          {chip(dash.completados, 'Completados', 'bg-slate-100 text-slate-700')}

          {/* Saldo EN VIVO de la cuenta que el usuario elija (espejo de Cuentas Bancarias) */}
          <div className="rounded-lg px-3 py-2 text-center bg-sky-50 text-sky-900 border border-sky-200">
            <div className="text-lg font-bold leading-none truncate">
              {cuentaDisplay && cuentasInfo[cuentaDisplay] ? money(cuentasInfo[cuentaDisplay].saldo) : '—'}
            </div>
            <select
              value={cuentaDisplay}
              onChange={(e) => { setCuentaDisplay(e.target.value); localStorage.setItem('san_cuenta_display', e.target.value); }}
              className="text-[11px] mt-1 w-full bg-transparent text-center outline-none cursor-pointer text-sky-800"
              title="Elige la cuenta cuyo saldo quieres vigilar aquí"
            >
              <option value="">Saldo de cuenta…</option>
              {Object.entries(cuentasInfo).map(([id, c]) => (
                <option key={id} value={id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>

        {sans.length === 0 ? (
          <div className="rounded-xl border p-10 text-center text-muted-foreground">
            <PiggyBank className="w-10 h-10 mx-auto mb-3 opacity-40" />
            Crea tu primer SAN: inicial de un vehículo, casa, universidad, inventario…
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sans.map((s) => {
              const pct = s.monto_objetivo > 0 ? Math.round((s.monto_ahorrado / s.monto_objetivo) * 100) : 0;
              return (
                <motion.button key={s.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="rounded-xl border p-4 text-left bg-card hover:shadow-md transition-shadow"
                  onClick={() => abrirSan(s)}>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold flex-1 truncate">{s.nombre}</div>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${estadoSanTone(s.estado)}`}>{s.estado}</span>
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {money(s.monto_ahorrado)} de {money(s.monto_objetivo)} · {money(s.pago_diario)}/día
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-200 mt-3 overflow-hidden">
                    <motion.div className="h-full rounded-full bg-emerald-500"
                      initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.8 }} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{pct}% · meta {formatFechaDMY(String(s.fecha_fin))}</div>
                  <div className="text-[11px] mt-1 flex items-center gap-1 truncate">
                    <Landmark className="w-3 h-3 flex-shrink-0" />
                    {s.cuenta_bancaria_id && cuentasInfo[s.cuenta_bancaria_id]
                      ? <span className="text-sky-700 truncate">{cuentasInfo[s.cuenta_bancaria_id].label}</span>
                      : <span className="text-amber-600">Sin cuenta bancaria</span>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* modal crear */}
        <Dialog open={crearOpen} onOpenChange={setCrearOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Nuevo SAN</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Nombre o propósito</label>
                <Input placeholder="ej. Inicial de carro, Universidad de Sara…" value={crearForm.nombre}
                  onChange={(e) => setCrearForm((p) => ({ ...p, nombre: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Monto objetivo (RD$)</label>
                  <Input type="number" value={crearForm.monto}
                    onChange={(e) => setCrearForm((p) => ({ ...p, monto: e.target.value }))} /></div>
                <div><label className="text-sm font-medium">Cantidad de días</label>
                  <Input type="number" value={crearForm.dias}
                    onChange={(e) => setCrearForm((p) => ({ ...p, dias: e.target.value }))} /></div>
              </div>
              <div><label className="text-sm font-medium">Fecha de inicio</label>
                <Input type="date" value={crearForm.inicio}
                  onChange={(e) => setCrearForm((p) => ({ ...p, inicio: e.target.value }))} /></div>
              <div>
                <label className="text-sm font-medium">Cuenta bancaria (de donde sale el ahorro)</label>
                <CuentaBancariaSelect value={crearForm.cuenta}
                  onChange={(v) => setCrearForm((p) => ({ ...p, cuenta: v }))}
                  moneda="DOP" contexto="san" label={null} />
              </div>
              {Number(crearForm.monto) > 0 && Number(crearForm.dias) > 0 && (
                <div className="rounded-lg bg-emerald-50 text-emerald-800 p-3 text-sm">
                  Pago diario: <b>{money(plan.pagoDiario)}</b>
                  {plan.ultimoDia !== plan.pagoDiario && <> · último día {money(plan.ultimoDia)}</>}
                </div>
              )}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
              <Button onClick={crear} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Crear SAN
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ================= DETALLE =================
  const pct = sanSel.monto_objetivo > 0 ? Math.round((sanSel.monto_ahorrado / sanSel.monto_objetivo) * 100) : 0;

  return (
    <div className="p-4 space-y-4">
      <Helmet><title>SAN — {sanSel.nombre}</title></Helmet>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { setSanSel(null); cargar(); }}>
          <ArrowLeft className="w-4 h-4 mr-1" />SAN
        </Button>
        <h1 className="text-xl font-bold flex-1 truncate">{sanSel.nombre}</h1>
        <span className={`px-2 py-0.5 rounded-full text-xs ${estadoSanTone(sanSel.estado)}`}>{sanSel.estado}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs flex items-center gap-1 ${sanSel.cuenta_bancaria_id ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-700'}`}
          title="Cuenta de donde sale el ahorro">
          <Landmark className="w-3 h-3" />
          {sanSel.cuenta_bancaria_id && cuentasInfo[sanSel.cuenta_bancaria_id]
            ? cuentasInfo[sanSel.cuenta_bancaria_id].label
            : 'Sin cuenta bancaria'}
        </span>
        {['Activo', 'Cancelado'].includes(sanSel.estado) && (
          <Button size="sm" variant="outline" disabled={busy} onClick={abrirEditar}
            title={sanSel.estado === 'Cancelado' ? 'Editarlo lo reactiva' : 'Corregir nombre, monto o días'}>
            <Pencil className="w-4 h-4 mr-1" />Editar</Button>
        )}
        {sanSel.estado === 'Activo' && (
          <Button size="sm" variant="outline" className="text-red-600 border-red-300" disabled={busy}
            onClick={() => cambiarEstado('Cancelado')}><Ban className="w-4 h-4 mr-1" />Cancelar</Button>
        )}
        {sanSel.estado === 'Completado' && (
          <>
            <Button size="sm" variant="outline" onClick={duplicar}><Copy className="w-4 h-4 mr-1" />Duplicar</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => cambiarEstado('Archivado')}>
              <Archive className="w-4 h-4 mr-1" />Archivar</Button>
          </>
        )}
        {sanSel.estado === 'Cancelado' && (
          <Button size="sm" variant="outline" className="text-red-600 border-red-300" disabled={busy}
            onClick={() => setElimOpen(true)}><Trash2 className="w-4 h-4 mr-1" />Eliminar</Button>
        )}
      </div>

      {/* tarjeta resumen */}
      <div className="rounded-xl border p-4 bg-card">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
          <div><div className="text-muted-foreground text-xs">Meta</div><div className="font-bold">{money(sanSel.monto_objetivo)}</div></div>
          <div><div className="text-muted-foreground text-xs">Ahorrado</div><div className="font-bold text-emerald-600">{money(sanSel.monto_ahorrado)}</div></div>
          <div><div className="text-muted-foreground text-xs">Restante</div><div className="font-bold">{money(stats.restante)}</div></div>
          <div><div className="text-muted-foreground text-xs">Pago diario</div><div className="font-bold">{money(sanSel.pago_diario)}</div></div>
          <div><div className="text-muted-foreground text-xs">Inicio</div><div className="font-bold">{formatFechaDMY(String(sanSel.fecha_inicio))}</div></div>
          <div><div className="text-muted-foreground text-xs">Fecha objetivo</div><div className="font-bold">{formatFechaDMY(String(sanSel.fecha_fin))}</div></div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 flex-1 rounded-full bg-slate-200 overflow-hidden">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
              initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.9, ease: 'easeOut' }} />
          </div>
          <div className="font-bold text-emerald-600 w-12 text-right">{pct}%</div>
        </div>
        {stats.deudaAtrasada > 0 && sanSel.estado === 'Activo' && (
          <div className="mt-3 rounded-lg bg-yellow-50 text-yellow-800 px-3 py-2 text-sm">
            ⚠ Tienes {stats.atrasados} día(s) pendiente(s). Necesitas {money(stats.deudaAtrasada)} para volver al ritmo de ahorro.
          </div>
        )}
        {stats.deudaAtrasada === 0 && sanSel.estado === 'Activo' && (
          <div className="mt-3 rounded-lg bg-emerald-50 text-emerald-800 px-3 py-2 text-sm">
            Hoy corresponde ahorrar {money(sanSel.pago_diario)}. ¡No rompas la cadena! 🔥
          </div>
        )}
      </div>

      {/* estadísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {chip(stats.completados, 'Completados', 'bg-emerald-50 text-emerald-800')}
        {chip(stats.pendientes, 'Pendientes', 'bg-slate-100 text-slate-700')}
        {chip(stats.atrasados, 'Atrasados', 'bg-yellow-50 text-yellow-800')}
        {chip(stats.parciales, 'Parciales', 'bg-orange-50 text-orange-800')}
        {chip(money(stats.ahorrado), 'Ahorrado', 'bg-emerald-50 text-emerald-800')}
        {chip(money(stats.restante), 'Restante', 'bg-indigo-50 text-indigo-800')}
        {chip(`${stats.porcentaje}%`, 'Completado', 'bg-sky-50 text-sky-800')}
        {chip(money(stats.promedioDiario), 'Promedio/día', 'bg-slate-100 text-slate-700')}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={tabDetalle === 'calendario' ? 'default' : 'outline'} onClick={() => setTabDetalle('calendario')}>Calendario</Button>
        <Button size="sm" variant={tabDetalle === 'historial' ? 'default' : 'outline'} onClick={() => setTabDetalle('historial')}>Historial</Button>
      </div>

      {/* calendario: un bloque de 30 días cerrado = UN cuadro del doble de ancho */}
      {tabDetalle === 'calendario' && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))' }}>
          {bloques.map((b) => {
            const abierto = bloques.length === 1 || expandidos.has(b.indice);

            // Bloque cerrado: cuadro doble con días, fechas y el monto
            if (!abierto) {
              return (
                <motion.button key={`b${b.indice}`} whileTap={{ scale: 0.96 }}
                  style={{ gridColumn: 'span 2' }}
                  onClick={() => toggleBloque(b.indice)}
                  title={`Ver los días ${b.desde} al ${b.hasta}`}
                  className={`rounded-xl border-2 px-2 py-2 min-h-[68px] flex flex-col items-center justify-center transition-all ${
                    b.completo ? 'bg-emerald-500 border-emerald-500 text-white shadow'
                    : b.atrasados > 0 ? 'bg-yellow-300 border-yellow-400 text-yellow-900'
                    : 'bg-white border-slate-200 text-slate-800 hover:border-emerald-300'}`}>
                  <div className="flex items-center gap-1 font-bold text-sm leading-none">
                    {b.completo && <Check className="w-4 h-4" />}
                    {!b.completo && b.atrasados > 0 && <span>⚠</span>}
                    Días {b.desde}–{b.hasta}
                  </div>
                  <div className={`text-[10px] mt-1 leading-tight ${b.completo ? 'text-emerald-50' : 'text-muted-foreground'}`}>
                    {formatFechaDMY(b.fecha_desde)} – {formatFechaDMY(b.fecha_hasta)}
                  </div>
                  <div className="text-[13px] font-bold mt-1 leading-none">
                    {money(b.completo ? b.pagado : b.programado)}
                  </div>
                </motion.button>
              );
            }

            // Bloque abierto: cabecera fina + sus cuadros de día
            return (
              <React.Fragment key={`b${b.indice}`}>
                {bloques.length > 1 && (
                  <button onClick={() => toggleBloque(b.indice)}
                    style={{ gridColumn: '1 / -1' }}
                    className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 pt-1">
                    <ChevronDown className="w-4 h-4" />
                    Días {b.desde}–{b.hasta}
                    <span className="font-normal text-muted-foreground">
                      {formatFechaDMY(b.fecha_desde)} – {formatFechaDMY(b.fecha_hasta)}
                    </span>
                    {b.tieneHoy && <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-100 text-blue-700">HOY</span>}
                  </button>
                )}
                {b.dias.map((p) => {
                  const clase = estadoDia(p, hoyStr);
                  const esHoy = p.fecha_programada === hoyStr;
                  return (
                    <motion.div key={p.id} whileTap={clase !== 'pagado' ? { scale: 0.92 } : undefined}
                      className={cuadroClases(clase, esHoy)}
                      title={`Día ${p.numero_dia} · ${formatFechaDMY(p.fecha_programada)}`}
                      onClick={() => abrirPago(p)}>
                      <div className="text-lg font-bold leading-none">
                        {clase === 'pagado' ? <Check className="w-5 h-5 inline" /> : clase === 'atrasado' ? '⚠ ' : ''}
                        {clase !== 'pagado' && p.numero_dia}
                        {clase === 'pagado' && <span className="ml-1">{p.numero_dia}</span>}
                      </div>
                      <div className="text-[11px] mt-1 leading-tight">
                        {clase === 'parcial' || (clase === 'atrasado' && Number(p.monto_pagado) > 0)
                          ? <>faltan<br />{money(p.saldo_pendiente)}</>
                          : money(p.monto_programado)}
                      </div>
                    </motion.div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* historial */}
      {tabDetalle === 'historial' && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr><th className="px-3 py-2">Fecha y hora</th><th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2">Aplicado a</th><th className="px-3 py-2">Observaciones</th></tr>
            </thead>
            <tbody>
              {historial.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Sin pagos todavía.</td></tr>
              ) : historial.map((h) => (
                <tr key={h.id} className="border-t">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(h.created_at).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}</td>
                  <td className="px-3 py-2 text-right font-medium">{money(h.monto)}</td>
                  <td className="px-3 py-2">día {(h.aplicado || []).map((a) => a.numero_dia).join(', ')}</td>
                  <td className="px-3 py-2">{h.observaciones || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* modal registrar pago */}
      <Dialog open={!!pagoDia} onOpenChange={(o) => !o && setPagoDia(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Registrar pago — Día {pagoDia?.numero_dia}</DialogTitle></DialogHeader>
          {pagoDia && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {formatFechaDMY(pagoDia.fecha_programada)} · Monto esperado:{' '}
                <b>{money(pagoDia.saldo_pendiente || pagoDia.monto_programado)}</b>
              </div>
              <div>
                <label className="text-sm font-medium">Monto recibido (RD$)</label>
                <Input type="number" autoFocus value={pagoForm.monto}
                  onChange={(e) => setPagoForm((p) => ({ ...p, monto: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm font-medium">Observaciones</label>
                <Input value={pagoForm.observaciones} placeholder="opcional"
                  onChange={(e) => setPagoForm((p) => ({ ...p, observaciones: e.target.value }))} />
              </div>
              {previsualizacion && previsualizacion.aplicaciones.length > 1 && (
                <div className="rounded-lg bg-emerald-50 text-emerald-800 p-2 text-xs">
                  Cubre los días {previsualizacion.aplicaciones.map((a) => a.numero_dia).join(', ')} ✔
                  {previsualizacion.sobrante > 0 && <> · sobrarían {money(previsualizacion.sobrante)}</>}
                </div>
              )}
              {previsualizacion && previsualizacion.aplicaciones.length === 1
                && previsualizacion.aplicaciones[0].monto < (Number(pagoDia.saldo_pendiente) || Number(pagoDia.monto_programado)) && (
                <div className="rounded-lg bg-orange-50 text-orange-800 p-2 text-xs">
                  Pago parcial: quedarían pendientes {money((Number(pagoDia.saldo_pendiente) || Number(pagoDia.monto_programado)) - previsualizacion.aplicaciones[0].monto)}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button onClick={registrarPago} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* editar SAN */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar SAN{sanSel?.estado === 'Cancelado' ? ' (lo reactiva)' : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Nombre o propósito</label>
              <Input value={editForm.nombre} onChange={(e) => setEditForm((p) => ({ ...p, nombre: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-sm font-medium">Monto objetivo (RD$)</label>
                <Input type="number" value={editForm.monto}
                  onChange={(e) => setEditForm((p) => ({ ...p, monto: e.target.value }))} /></div>
              <div><label className="text-sm font-medium">Cantidad de días</label>
                <Input type="number" value={editForm.dias}
                  onChange={(e) => setEditForm((p) => ({ ...p, dias: e.target.value }))} /></div>
            </div>
            <div><label className="text-sm font-medium">Fecha de inicio</label>
              <Input type="date" value={editForm.inicio}
                onChange={(e) => setEditForm((p) => ({ ...p, inicio: e.target.value }))} /></div>
            <div>
              <label className="text-sm font-medium">Cuenta bancaria (de donde sale el ahorro)</label>
              <CuentaBancariaSelect value={editForm.cuenta}
                onChange={(v) => setEditForm((p) => ({ ...p, cuenta: v }))}
                moneda="DOP" contexto="san" autoDefault={false} label={null} />
            </div>
            <p className="text-xs text-muted-foreground">
              El calendario se regenera con el plan nuevo y lo ya ahorrado
              {Number(sanSel?.monto_ahorrado) > 0 && <> (<b>{money(sanSel.monto_ahorrado)}</b>)</>} se
              re-aplica automáticamente desde el día 1 — no se pierde nada.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button onClick={editar} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Pencil className="w-4 h-4 mr-1" />}Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirmar eliminar */}
      <Dialog open={elimOpen} onOpenChange={setElimOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>¿Eliminar este SAN?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            "{sanSel?.nombre}" se borrará con su calendario y TODO su historial de pagos
            {Number(sanSel?.monto_ahorrado) > 0 && <> (tiene <b>{money(sanSel.monto_ahorrado)}</b> registrados)</>}.
            Esta acción no se puede deshacer. Si solo quieres corregirlo, usa Editar.
          </p>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={busy}>Cancelar</Button></DialogClose>
            <Button variant="destructive" onClick={eliminar} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* celebración */}
      <AnimatePresence>
        {celebrar && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setCelebrar(false)}>
            {/* confetti simple sin dependencias */}
            {Array.from({ length: 40 }).map((_, i) => (
              <motion.div key={i} className="absolute text-2xl pointer-events-none"
                initial={{ y: -60, x: `${(i * 61) % 100}vw`, rotate: 0, opacity: 1 }}
                animate={{ y: '105vh', rotate: 720, opacity: [1, 1, 0.6] }}
                transition={{ duration: 2.6 + (i % 5) * 0.5, delay: (i % 8) * 0.15, ease: 'easeIn', repeat: Infinity }}>
                {['🎉', '🎊', '✨', '💰', '🟢'][i % 5]}
              </motion.div>
            ))}
            <motion.div className="bg-card rounded-2xl p-8 text-center shadow-2xl max-w-sm mx-4"
              initial={{ scale: 0.6, y: 40 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: 0.5 }}
              onClick={(e) => e.stopPropagation()}>
              <PartyPopper className="w-14 h-14 mx-auto text-emerald-500 mb-3" />
              <h2 className="text-2xl font-bold">¡Felicidades!</h2>
              <p className="text-muted-foreground mt-1">Has cumplido tu meta de ahorro:</p>
              <p className="font-semibold text-lg mt-1">{sanSel.nombre} — {money(sanSel.monto_objetivo)}</p>
              <div className="flex flex-col gap-2 mt-5">
                <Button onClick={duplicar}><Copy className="w-4 h-4 mr-1" />Duplicar este SAN</Button>
                <Button variant="outline" onClick={() => { setCelebrar(false); setSanSel(null); setCrearOpen(true); }}>
                  <Plus className="w-4 h-4 mr-1" />Crear otro SAN
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => { setCelebrar(false); cambiarEstado('Archivado'); }}>
                  <Archive className="w-4 h-4 mr-1" />Archivar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SanPage;
