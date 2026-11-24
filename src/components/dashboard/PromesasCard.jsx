// ============================================================
// "Le prometí…" — promesas a clientes (23/11/2026)
// ------------------------------------------------------------
// Anotar en 10 segundos lo que se le prometió a un cliente (por WhatsApp,
// en persona o por teléfono) y para cuándo. Ese día a las 8 am avisa en la
// campanita (cron promesas-avisos) y, si se vence, sigue avisando.
// "Preguntar al suplidor" crea también una solicitud de cliente.
// Datos: tabla promesas_clientes + RPC promesa_crear / promesa_marcar /
// promesa_posponer (sql/promesas_clientes.sql).
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Handshake, Plus, Check, X, CalendarClock, Loader2, Truck, Phone } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/SupabaseAuthContext';

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// Fechas en hora de RD, como 'aaaa-mm-dd'.
export const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
export const sumarDias = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + n));
  return f.toISOString().slice(0, 10);
};
const diaSemana = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
// El próximo lunes (si hoy es lunes, el de la semana que viene).
export const proximoLunes = (iso) => { const w = diaSemana(iso); return sumarDias(iso, ((8 - w) % 7) || 7); };

export const etiquetaFecha = (iso, hoy = hoyRD()) => {
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  if (iso < hoy) {
    const [, m, d] = iso.split('-');
    return `Vencida (${d}/${m})`;
  }
  const [, m, d] = iso.split('-');
  return `${DIAS[diaSemana(iso)][0].toUpperCase()}${DIAS[diaSemana(iso)].slice(1)} ${d}/${m}`;
};

const waLink = (tel) => {
  const dig = String(tel || '').replace(/\D/g, '');
  if (dig.length < 10) return null;
  return `https://wa.me/${dig.length === 10 ? `1${dig}` : dig}`;
};

export function NuevaPromesaDialog({ open, onClose, onCreada }) {
  const { toast } = useToast();
  const hoy = hoyRD();
  const [que, setQue] = useState('');
  const [cliente, setCliente] = useState('');
  const [tel, setTel] = useState('');
  const [fecha, setFecha] = useState(sumarDias(hoy, 1));
  const [suplidor, setSuplidor] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQue(''); setCliente(''); setTel(''); setFecha(sumarDias(hoyRD(), 1)); setSuplidor(false);
  }, [open]);

  const opciones = [
    ['Hoy', hoy], ['Mañana', sumarDias(hoy, 1)], ['Pasado mañana', sumarDias(hoy, 2)],
    [`Lunes ${proximoLunes(hoy).slice(8)}/${proximoLunes(hoy).slice(5, 7)}`, proximoLunes(hoy)],
  ];

  const guardar = async () => {
    if (que.trim().length < 2) { toast({ variant: 'destructive', title: 'Escribe qué le prometiste' }); return; }
    if (!cliente.trim() && !tel.trim()) { toast({ variant: 'destructive', title: '¿A quién?', description: 'Pon el nombre o el teléfono del cliente.' }); return; }
    setGuardando(true);
    const { error } = await supabase.rpc('promesa_crear', {
      p_que: que.trim(), p_fecha: fecha, p_cliente_nombre: cliente.trim() || null,
      p_telefono: tel.trim() || null, p_para_suplidor: suplidor, p_origen: 'web',
    });
    setGuardando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo anotar', description: error.message }); return; }
    toast({ title: 'Anotado', description: `Te aviso ${etiquetaFecha(fecha).toLowerCase()} a las 8 am en la campanita.` });
    onCreada?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Handshake className="w-5 h-5 text-amber-600" />Le prometí…</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold text-gray-600">¿Qué le prometiste?</span>
            <textarea value={que} onChange={(e) => setQue(e.target.value)} rows={2} autoFocus maxLength={500}
              placeholder="Ej: precio de los plásticos rojos Tauro CRX250"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-bold text-gray-600">Cliente</span>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre"
                className="mt-1 h-9 w-full rounded-md border border-gray-300 px-3 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-gray-600">Teléfono / WhatsApp</span>
              <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="809-000-0000" inputMode="tel"
                className="mt-1 h-9 w-full rounded-md border border-gray-300 px-3 text-sm" />
            </label>
          </div>
          <div>
            <span className="text-xs font-bold text-gray-600">¿Para cuándo?</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {opciones.map(([l, f]) => (
                <button key={l} type="button" onClick={() => setFecha(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border ${fecha === f ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-700 border-gray-300'}`}>
                  {l}
                </button>
              ))}
              <input type="date" value={fecha} min={hoy} onChange={(e) => e.target.value && setFecha(e.target.value)}
                className="h-8 rounded-md border border-gray-300 px-2 text-xs" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={suplidor} onChange={(e) => setSuplidor(e.target.checked)} className="h-4 w-4" />
            Tengo que preguntarle al suplidor <span className="text-xs text-gray-400">(se anota la pieza pedida)</span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando} className="bg-amber-500 hover:bg-amber-600 text-white">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Anotar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PromesasCard() {
  const { toast } = useToast();
  const { tenantId } = useAuth();
  const [lista, setLista] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nueva, setNueva] = useState(false);
  const [trabajando, setTrabajando] = useState(null);

  const cargar = useCallback(async () => {
    if (!tenantId) return;
    // RLS: solo la empresa activa. Las pendientes, de la más vieja a la más nueva.
    const { data, error } = await supabase.from('promesas_clientes')
      .select('id, que, cliente_nombre, telefono, fecha, para_suplidor, estado')
      .eq('tenant_id', tenantId).eq('estado', 'pendiente')
      .order('fecha', { ascending: true }).order('created_at', { ascending: true }).limit(50);
    if (!error) setLista(data || []);
    setCargando(false);
  }, [tenantId]);

  useEffect(() => { cargar(); }, [cargar]);

  const marcar = async (p, estado) => {
    setTrabajando(p.id);
    const { error } = await supabase.rpc('promesa_marcar', { p_id: p.id, p_estado: estado });
    setTrabajando(null);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo', description: error.message }); return; }
    toast({ title: estado === 'hecha' ? 'Cumplida' : 'Quitada' });
    cargar();
  };

  const posponer = async (p) => {
    setTrabajando(p.id);
    const { error } = await supabase.rpc('promesa_posponer', { p_id: p.id, p_fecha: sumarDias(hoyRD(), 1) });
    setTrabajando(null);
    if (error) { toast({ variant: 'destructive', title: 'No se pudo', description: error.message }); return; }
    toast({ title: 'Para mañana' });
    cargar();
  };

  const hoy = hoyRD();
  const urgentes = lista.filter((p) => p.fecha <= hoy).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
          <Handshake className="w-5 h-5 text-amber-600" />
        </div>
        <div className="mr-auto">
          <div className="text-xs font-black uppercase tracking-wide text-gray-500">Promesas a clientes</div>
          <div className="text-sm text-gray-700">
            {cargando ? 'Cargando…' : lista.length === 0 ? 'Nada pendiente.'
              : urgentes > 0 ? <b className="text-red-600">{urgentes} para hoy o vencida{urgentes === 1 ? '' : 's'}</b>
                : `${lista.length} pendiente${lista.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <Button size="sm" onClick={() => setNueva(true)} className="bg-amber-500 hover:bg-amber-600 text-white">
          <Plus className="w-4 h-4 mr-1" />Le prometí…
        </Button>
      </div>

      {lista.length > 0 && (
        <div className="mt-3 divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {lista.map((p) => {
            const vencida = p.fecha < hoy;
            const wa = waLink(p.telefono);
            return (
              <div key={p.id} className="py-2 flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${vencida ? 'bg-red-100 text-red-700' : p.fecha === hoy ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
                  {etiquetaFecha(p.fecha, hoy)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 break-words">{p.que}</div>
                  <div className="text-xs text-gray-500 flex flex-wrap items-center gap-x-2">
                    <span>{p.cliente_nombre || 'Cliente'}</span>
                    {p.telefono && (wa
                      ? <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-emerald-700 hover:underline"><Phone className="w-3 h-3" />{p.telefono}</a>
                      : <span>{p.telefono}</span>)}
                    {p.para_suplidor && <span className="inline-flex items-center gap-0.5 text-blue-700"><Truck className="w-3 h-3" />preguntar al suplidor</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {trabajando === p.id ? <Loader2 className="w-4 h-4 animate-spin text-gray-400 m-2" /> : (<>
                    <button type="button" title="Cumplida" onClick={() => marcar(p, 'hecha')} className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600"><Check className="w-4 h-4" /></button>
                    <button type="button" title="Para mañana" onClick={() => posponer(p)} className="p-1.5 rounded-md hover:bg-amber-50 text-amber-600"><CalendarClock className="w-4 h-4" /></button>
                    <button type="button" title="Quitar" onClick={() => marcar(p, 'cancelada')} className="p-1.5 rounded-md hover:bg-red-50 text-gray-400"><X className="w-4 h-4" /></button>
                  </>)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NuevaPromesaDialog open={nueva} onClose={() => setNueva(false)} onCreada={cargar} />
    </div>
  );
}
