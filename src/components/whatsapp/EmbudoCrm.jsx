// ============================================================
// EmbudoCrm — el embudo de ventas que se mueve solo
// ------------------------------------------------------------
// (07/10/2026) Cada 10 minutos el clasificador (Edge Function
// crm-clasificar, gpt-4o-mini) lee las conversaciones con mensajes nuevos y
// pone a cada cliente en su etapa. Aqui solo se mira y, si hace falta, se
// corrige a mano (crm_mover_etapa): lo movido por una persona se respeta 48 h.
//
// Arriba sale "lo que pidieron y no teníamos": las conversaciones perdidas
// porque la tienda no tenía la pieza. Es demanda que se fue.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2, RefreshCw, MessageCircle, Flame, PackageX } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ETAPAS = [
  { value: 'nuevo', label: 'Nuevo', color: 'bg-slate-100 text-slate-700', borde: 'border-slate-300' },
  { value: 'interesado', label: 'Interesado', color: 'bg-sky-100 text-sky-800', borde: 'border-sky-300' },
  { value: 'cotizado', label: 'Cotizado', color: 'bg-violet-100 text-violet-800', borde: 'border-violet-300' },
  { value: 'listo_para_comprar', label: 'Listo para comprar', color: 'bg-amber-100 text-amber-800', borde: 'border-amber-400' },
  { value: 'ganado', label: 'Ganado', color: 'bg-emerald-100 text-emerald-800', borde: 'border-emerald-400' },
  { value: 'perdido', label: 'Perdido', color: 'bg-rose-100 text-rose-800', borde: 'border-rose-300' },
  { value: 'spam', label: 'Spam', color: 'bg-zinc-100 text-zinc-500', borde: 'border-zinc-300' },
];
const COLUMNAS = ETAPAS.filter((e) => e.value !== 'spam');
const RED = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };

const hace = (f) => {
  try { return f ? formatDistanceToNow(new Date(f), { addSuffix: true, locale: es }) : ''; } catch { return ''; }
};

export default function EmbudoCrm({ open, onOpenChange, onAbrirConversacion }) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [dias, setDias] = useState(30);
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    const tenantId = profile?.tenant_id;
    if (!tenantId) return;
    setCargando(true);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const { data, error } = await supabase
      .from('sales_conversations')
      .select('id, platform, customer_name, customer_phone, etapa, etapa_motivo, etapa_cambiada_at, lead_score, clasificacion, last_user_message_at, crm_whatsapp_conversation_id')
      .eq('tenant_id', tenantId)
      .not('clasificado_at', 'is', null)
      .gte('last_user_message_at', desde)
      .order('lead_score', { ascending: false })
      .order('last_user_message_at', { ascending: false })
      .limit(400);
    if (error) toast({ variant: 'destructive', title: 'No se pudo cargar el embudo', description: error.message });
    else setFilas(data || []);
    setCargando(false);
  }, [profile?.tenant_id, dias, toast]);

  useEffect(() => { if (open) cargar(); }, [open, cargar]);

  const porEtapa = useMemo(() => {
    const m = Object.fromEntries(ETAPAS.map((e) => [e.value, []]));
    for (const f of filas) (m[f.etapa] || m.nuevo).push(f);
    return m;
  }, [filas]);

  const noTeniamos = useMemo(
    () => filas.filter((f) => f.etapa === 'perdido' && /^no lo tenemos/i.test(f.etapa_motivo || '')),
    [filas],
  );

  const mover = async (fila, etapa) => {
    if (etapa === fila.etapa) return;
    const antes = filas;
    setFilas((prev) => prev.map((f) => (f.id === fila.id ? { ...f, etapa, etapa_motivo: 'Movida a mano' } : f)));
    const { error } = await supabase.rpc('crm_mover_etapa', { p_conversation_id: fila.id, p_etapa: etapa });
    if (error) {
      setFilas(antes);
      toast({ variant: 'destructive', title: 'No se pudo mover', description: error.message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(1400px,96vw)] h-[90vh] flex flex-col gap-3 p-4">
        <DialogHeader className="space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <DialogTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500" /> Embudo de ventas
            </DialogTitle>
            <div className="flex items-center gap-2">
              <select
                value={dias}
                onChange={(e) => setDias(Number(e.target.value))}
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs"
              >
                <option value={7}>Últimos 7 días</option>
                <option value={30}>Últimos 30 días</option>
                <option value={60}>Últimos 60 días</option>
              </select>
              <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
                <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs">
            Hermes lee cada conversación con mensajes nuevos cada 10 minutos y la pone en su etapa. Si una está mal, cámbiala en su tarjeta: lo que muevas a mano se respeta 48 horas.
            {porEtapa.spam.length ? ` · ${porEtapa.spam.length} spam escondido.` : ''}
          </DialogDescription>
        </DialogHeader>

        {noTeniamos.length > 0 && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-bold text-rose-800">
              <PackageX className="h-4 w-4" /> Lo que pidieron y no teníamos ({noTeniamos.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {noTeniamos.map((f) => (
                <span key={f.id} className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] text-rose-900" title={f.clasificacion?.resumen || ''}>
                  {(f.etapa_motivo || '').replace(/^no lo tenemos:\s*/i, '')}
                  {f.clasificacion?.moto ? ` · ${f.clasificacion.moto}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {cargando && !filas.length ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
            {COLUMNAS.map((col) => (
              <div key={col.value} className="flex w-64 min-w-[16rem] flex-col rounded-lg bg-slate-50">
                <div className={`flex items-center justify-between rounded-t-lg px-3 py-2 text-xs font-bold ${col.color}`}>
                  <span>{col.label}</span>
                  <span>{porEtapa[col.value].length}</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {porEtapa[col.value].map((f) => {
                    const c = f.clasificacion || {};
                    return (
                      <div key={f.id} className={`rounded-md border-l-4 ${col.borde} bg-white p-2 text-xs shadow-sm`}>
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{f.customer_name || f.customer_phone || 'Cliente'}</div>
                            <div className="text-[10px] text-slate-500">{RED[f.platform] || f.platform} · {hace(f.last_user_message_at)}</div>
                          </div>
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${f.lead_score >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}
                            title="Qué tan cerca está de comprar (0-100)"
                          >
                            {f.lead_score ?? 0}
                          </span>
                        </div>
                        {(c.producto || c.moto) && (
                          <div className="mt-1 font-medium text-slate-800">{[c.producto, c.moto].filter(Boolean).join(' · ')}</div>
                        )}
                        {c.resumen && <div className="mt-1 text-slate-600">{c.resumen}</div>}
                        {c.siguiente_paso && <div className="mt-1 text-[11px] font-medium text-emerald-700">→ {c.siguiente_paso}</div>}
                        {c.urgente && <div className="mt-1 text-[10px] font-bold text-rose-600">⚠ Urgente</div>}
                        <div className="mt-2 flex items-center gap-1">
                          <select
                            value={f.etapa}
                            onChange={(e) => mover(f, e.target.value)}
                            className="h-7 min-w-0 flex-1 rounded border border-slate-200 bg-white px-1 text-[11px]"
                            title="Cambiar la etapa a mano"
                          >
                            {ETAPAS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                          </select>
                          {onAbrirConversacion && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="Abrir la conversación" onClick={() => onAbrirConversacion(f)}>
                              <MessageCircle className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!porEtapa[col.value].length && <div className="py-6 text-center text-[11px] text-slate-400">Nadie aquí</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
