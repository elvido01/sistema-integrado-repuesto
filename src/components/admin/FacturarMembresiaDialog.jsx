// Super Admin → Facturar membresía de MotoFlow a una empresa (24/11/2026).
// El monto se ajusta (familiares y amigos): si queda por debajo del precio
// de lista pide el motivo, y la factura muestra lista, descuento y total.
// Puede registrar el pago en el mismo paso (extiende la membresía) y guardar
// el monto como precio especial de la empresa para la próxima vez.
import React, { useEffect, useState } from 'react';
import { Loader2, Printer, Receipt } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MontoInput from '@/components/ui/MontoInput';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import { fmtRD, imprimirFacturaMotoflow, precioSugerido } from '@/lib/facturaMotoflow';

const MESES = [1, 2, 3, 6, 12];
const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'cheque'];
const lbl = 'text-[11px] font-bold text-gray-600';

export function EmisorForm({ inicial, onGuardado }) {
  const { toast } = useToast();
  const [e, setE] = useState({ nombre: '', documento: '', telefono: '', email: '', direccion: '', itbis_por_defecto: false, nota_pie: '', ...(inicial || {}) });
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (ev) => setE((p) => ({ ...p, [k]: ev.target.value }));

  const guardar = async () => {
    setGuardando(true);
    const { data, error } = await supabase.rpc('mf_emisor_guardar', {
      p_nombre: e.nombre, p_documento: e.documento, p_telefono: e.telefono || null, p_email: e.email || null,
      p_direccion: e.direccion || null, p_itbis_por_defecto: !!e.itbis_por_defecto, p_nota_pie: e.nota_pie || null,
    });
    setGuardando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se guardó', description: error.message }); return; }
    toast({ title: 'Datos del emisor guardados' });
    onGuardado?.(data);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Así salen tus datos en las facturas de MotoFlow.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label><span className={lbl}>Nombre (como en la cédula)</span><Input value={e.nombre} onChange={set('nombre')} /></label>
        <label><span className={lbl}>Cédula o RNC</span><Input value={e.documento} onChange={set('documento')} inputMode="numeric" /></label>
        <label><span className={lbl}>Teléfono</span><Input value={e.telefono || ''} onChange={set('telefono')} /></label>
        <label><span className={lbl}>Correo</span><Input value={e.email || ''} onChange={set('email')} /></label>
      </div>
      <label className="block"><span className={lbl}>Dirección</span><Input value={e.direccion || ''} onChange={set('direccion')} /></label>
      <label className="block"><span className={lbl}>Nota al pie (opcional)</span><Input value={e.nota_pie || ''} onChange={set('nota_pie')} /></label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!!e.itbis_por_defecto} onChange={(ev) => setE((p) => ({ ...p, itbis_por_defecto: ev.target.checked }))} />
        Mis facturas llevan ITBIS 18% (incluido en el total)
      </label>
      <div className="flex justify-end">
        <Button onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Guardar mis datos</Button>
      </div>
    </div>
  );
}

export default function FacturarMembresiaDialog({ tenant, onClose, onEmitida }) {
  const { toast } = useToast();
  const [prep, setPrep] = useState(null);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState('');
  const [meses, setMeses] = useState(1);
  const [total, setTotal] = useState('');
  const [motivo, setMotivo] = useState('');
  const [itbis, setItbis] = useState(false);
  const [ncf, setNcf] = useState('');
  const [registrar, setRegistrar] = useState(true);
  const [metodo, setMetodo] = useState('efectivo');
  const [referencia, setReferencia] = useState('');
  const [guardarEspecial, setGuardarEspecial] = useState(false);
  const [cliente, setCliente] = useState({ nombre: '', documento: '', direccion: '' });
  const [emitiendo, setEmitiendo] = useState(false);
  const [hecha, setHecha] = useState(null);
  const [editarEmisor, setEditarEmisor] = useState(false);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('mf_factura_preparar', { p_tenant_id: tenant.id }).then(({ data, error: err }) => {
      if (!vivo) return;
      if (err) { setError(err.message); return; }
      setPrep(data);
      const planes = data.planes || [];
      const p = planes.find((x) => x.nombre === data.plan_actual) || planes.find((x) => x.nombre === 'BASICO') || planes[0];
      setPlan(p?.nombre || '');
      setItbis(!!data.emisor?.itbis_por_defecto);
      setCliente({ nombre: data.cliente_nombre || '', documento: data.cliente_documento || '', direccion: data.cliente_direccion || '' });
    });
    return () => { vivo = false; };
  }, [tenant.id]);

  const precioPlan = Number((prep?.planes || []).find((x) => x.nombre === plan)?.precio || 0);
  const lista = precioPlan * meses;

  // Al cambiar plan o meses se propone el precio: el recordado o pactado de
  // ESE plan si lo hay. Depende solo de números: guardar el emisor (que
  // cambia prep) no borra el total que se tecleó.
  const sug = precioSugerido(prep, plan);
  const mensualSug = sug ? sug.precio : precioPlan;
  const motivoSug = sug ? sug.motivo : '';
  useEffect(() => {
    if (!plan || !mensualSug) return;
    setTotal(String(Math.round(mensualSug * meses * 100) / 100));
    setMotivo(motivoSug);
  }, [plan, meses, mensualSug, motivoSug]);

  const totalNum = Number(total) || 0;
  const descuento = Math.max(lista - totalNum, 0);
  const faltaEmisor = prep && (!prep.emisor?.nombre || !prep.emisor?.documento);

  const emitir = async () => {
    if (totalNum <= 0) { toast({ variant: 'destructive', title: 'Escribe el total' }); return; }
    if (descuento > 0 && !motivo.trim()) { toast({ variant: 'destructive', title: 'Escribe el motivo del precio especial' }); return; }
    setEmitiendo(true);
    const { data, error: err } = await supabase.rpc('mf_factura_emitir', {
      p_tenant_id: tenant.id, p_plan_nombre: plan, p_meses: meses, p_total: totalNum,
      p_motivo_descuento: descuento > 0 ? motivo.trim() : null, p_ncf: ncf.trim() || null, p_itbis: itbis,
      p_registrar_pago: registrar, p_metodo: registrar ? metodo : null, p_referencia: registrar ? (referencia.trim() || null) : null,
      p_guardar_precio_especial: guardarEspecial,
      p_cliente_nombre: cliente.nombre, p_cliente_documento: cliente.documento, p_cliente_direccion: cliente.direccion,
    });
    setEmitiendo(false);
    if (err) { toast({ variant: 'destructive', title: 'No se emitió', description: err.message }); return; }
    setHecha(data);
    onEmitida?.(data);
    toast({ title: `Factura ${data.numero_txt} emitida`, description: registrar ? 'Pago registrado y membresía extendida.' : undefined });
  };

  const imprimir = (f) => {
    if (!imprimirFacturaMotoflow(f)) toast({ variant: 'destructive', title: 'El navegador bloqueó la ventana', description: 'Permita ventanas emergentes y vuelva a intentar.' });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-blue-600" />Facturar a {tenant.nombre}</DialogTitle></DialogHeader>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!prep && !error && <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}

        {prep && (faltaEmisor || editarEmisor) && !hecha && (
          <EmisorForm inicial={prep.emisor} onGuardado={(em) => { setPrep((p) => ({ ...p, emisor: em })); setItbis(!!em.itbis_por_defecto); setEditarEmisor(false); }} />
        )}

        {hecha && (
          <div className="space-y-3 text-center py-4">
            <p className="text-lg font-bold">Factura {hecha.numero_txt}</p>
            <p className="text-sm text-gray-600">Total RD$ {fmtRD(hecha.total)}{hecha.periodo_hasta ? ` · vigente hasta ${new Date(hecha.periodo_hasta).toLocaleDateString('es-DO')}` : ''}</p>
            <div className="flex justify-center gap-2">
              <Button onClick={() => imprimir(hecha)}><Printer className="w-4 h-4 mr-1" />Imprimir / PDF</Button>
              <Button variant="outline" onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        )}

        {prep && !faltaEmisor && !editarEmisor && !hecha && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Emisor: <b>{prep.emisor.nombre}</b></span>
              <button type="button" className="underline" onClick={() => setEditarEmisor(true)}>Cambiar mis datos</button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="sm:col-span-2"><span className={lbl}>Cliente (razón social)</span>
                <Input value={cliente.nombre} onChange={(e) => setCliente((c) => ({ ...c, nombre: e.target.value }))} /></label>
              <label><span className={lbl}>RNC / Cédula</span>
                <Input value={cliente.documento} onChange={(e) => setCliente((c) => ({ ...c, documento: e.target.value }))} inputMode="numeric" /></label>
              <label><span className={lbl}>Dirección</span>
                <Input value={cliente.direccion} onChange={(e) => setCliente((c) => ({ ...c, direccion: e.target.value }))} /></label>
            </div>

            <div>
              <span className={lbl}>Plan</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {(prep.planes || []).map((p) => (
                  <button key={p.nombre} type="button" onClick={() => setPlan(p.nombre)}
                    className={`px-2 py-1 rounded border text-xs ${plan === p.nombre ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}>
                    {p.nombre} · {fmtRD(p.precio)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={lbl}>Meses</span>
              <div className="flex gap-1 mt-1">
                {MESES.map((m) => (
                  <button key={m} type="button" onClick={() => setMeses(m)}
                    className={`w-10 py-1 rounded border text-xs ${meses === m ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300'}`}>{m}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 items-end">
              <div><span className={lbl}>Precio de lista</span><div className="h-9 flex items-center tabular-nums">RD$ {fmtRD(lista)}</div></div>
              <label><span className={lbl}>Total a cobrar (ajustable)</span>
                <MontoInput as={Input} value={total} onChange={(v) => setTotal(v)} className="text-right font-bold" /></label>
            </div>
            {sug && (
              <p className="text-xs text-blue-700">{sug.origen === 'recordado' ? 'Precio que le diste antes' : 'Precio pactado'} en {plan}: RD$ {fmtRD(sug.precio)} al mes{sug.motivo ? ` (${sug.motivo})` : ''}.</p>
            )}
            {descuento > 0 && (
              <label className="block"><span className={lbl}>Descuento RD$ {fmtRD(descuento)} · motivo (sale en la factura)</span>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: familia, amigo, precio fundador" /></label>
            )}

            <div className="grid grid-cols-2 gap-2">
              <label><span className={lbl}>NCF (opcional)</span><Input value={ncf} onChange={(e) => setNcf(e.target.value.toUpperCase())} placeholder="B01…" /></label>
              <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={itbis} onChange={(e) => setItbis(e.target.checked)} />ITBIS 18% incluido</label>
            </div>

            <div className="rounded border border-gray-200 p-2 space-y-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={registrar} onChange={(e) => setRegistrar(e.target.checked)} />
                Registrar el pago y extender la membresía {meses} {meses === 1 ? 'mes' : 'meses'}</label>
              {registrar && (
                <div className="grid grid-cols-2 gap-2">
                  <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="h-9 rounded border border-gray-300 px-2">
                    {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia (opcional)" />
                </div>
              )}
              <label className="flex items-center gap-2"><input type="checkbox" checked={guardarEspecial} onChange={(e) => setGuardarEspecial(e.target.checked)} />
                Recordar RD$ {fmtRD(meses ? totalNum / meses : 0)} al mes para esta empresa en {plan} (solo para facturar; no cambia su plan)</label>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={emitir} disabled={emitiendo || !plan}>
                {emitiendo && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Emitir factura · RD$ {fmtRD(totalNum)}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
