// ============================================================
// IaCeoGuia — la guía diaria del IA CEO: "Hoy" y "Planes"
// ============================================================
// (20/10/2026) El dueño: "está muy cargado… tiene que ser una guía diaria
// donde le proponga planes estratégicos divididos en tareas diarias".
// Todo sale de ia_guia_hoy() (sql/ia_ceo_guia.sql); las tareas y los
// planes los arma la función ia-ceo-guia cada mañana a las 7:00 (y llegan
// por Telegram). Aquí solo se miran, se marcan y se aprueban.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { usePanels } from '@/contexts/PanelContext';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Check, Clock, X, Loader2, RefreshCw, ArrowRight, Target, Sparkles, CircleDot, Phone, MessageCircle } from 'lucide-react';

const NOMBRES = {
  ventas_30d: 'Ventas 30 días',
  cxc_pendiente: 'Por cobrar',
  falta_cubrir: 'Falta cubrir del mes',
  clientes_sin_respuesta: 'Clientes sin respuesta',
  agotados_sin_orden: 'Agotados sin pedir',
  mora_30d: 'Mora +30 días',
  monto_vencido: 'Monto vencido',
  prestamos_con_atraso: 'Préstamos con atraso',
  ventas_ganadas_crm: 'Ventas desde el CRM',
};
const EN_PESOS = new Set(['ventas_30d', 'cxc_pendiente', 'falta_cubrir', 'monto_vencido']);
const ORDEN = ['ventas_30d', 'falta_cubrir', 'monto_vencido', 'mora_30d', 'cxc_pendiente', 'clientes_sin_respuesta', 'agotados_sin_orden'];
const valor = (k, v) => (EN_PESOS.has(k) ? `RD$${Math.round(Number(v)).toLocaleString('en-US')}` : Math.round(Number(v)).toLocaleString('en-US'));
// 809/829/849 sin el 1 del país: se le pone (wa.me y tel: lo necesitan).
const conPais = (tel) => { const d = String(tel || '').replace(/\D/g, ''); return d.length === 10 ? `1${d}` : d; };
const conUnidad = (u, v) => (u === 'RD$' ? `RD$${Math.round(Number(v)).toLocaleString('en-US')}` : `${Math.round(Number(v))} ${u || ''}`);

export default function IaCeoGuia({ vista = 'hoy', onVerPlanes }) {
  const { openPanel } = usePanels();
  const { toast } = useToast();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [preparando, setPreparando] = useState(false);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.rpc('ia_guia_hoy');
    if (error) toast({ variant: 'destructive', title: 'No se pudo cargar la guía', description: error.message });
    setDatos(data || null);
    setCargando(false);
  }, [toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const preparar = async (opciones = {}) => {
    setPreparando(true);
    try {
      const { data, error } = await supabase.functions.invoke('ia-ceo-guia', { body: opciones });
      if (error) throw error;
      const r = data?.resultados?.[0];
      if (r?.error) throw new Error(r.error);
      await cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo preparar', description: e.message });
    } finally {
      setPreparando(false);
    }
  };

  const marcar = async (t, estado) => {
    setDatos((d) => ({ ...d, tareas: d.tareas.map((x) => (x.id === t.id ? { ...x, estado } : x)) }));
    const { error } = await supabase.rpc('ia_tarea_marcar', { p_id: t.id, p_estado: estado });
    if (error) { toast({ variant: 'destructive', title: 'No se guardó', description: error.message }); cargar(); }
  };

  const decidir = async (p, aprobar) => {
    let nota = null;
    if (!aprobar) {
      nota = window.prompt('¿Por qué no? (opcional: así el CEO aprende qué planes te sirven)') ?? null;
    }
    const { error } = await supabase.rpc('ia_plan_decidir', { p_id: p.id, p_aprobar: aprobar, p_nota: nota });
    if (error) { toast({ variant: 'destructive', title: 'No se guardó', description: error.message }); return; }
    toast({ title: aprobar ? 'Plan aprobado' : 'Plan rechazado', description: aprobar ? 'Desde mañana tus tareas lo hacen avanzar.' : undefined });
    cargar();
  };

  const cerrar = async (p) => {
    if (!window.confirm(`¿Cerrar el plan "${p.titulo}"? Deja de generar tareas.`)) return;
    const { error } = await supabase.rpc('ia_plan_cerrar', { p_id: p.id });
    if (error) { toast({ variant: 'destructive', title: 'No se cerró', description: error.message }); return; }
    cargar();
  };

  const hacer = (t) => {
    const a = t.accion || {};
    if (a.tipo === 'planes') { onVerPlanes?.(); return; }
    if (a.tipo === 'panel' && a.panel) openPanel(a.panel);
  };

  if (cargando) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-purple-500" /></div>;

  const tareas = datos?.tareas || [];
  const planes = datos?.planes || [];
  const activos = planes.filter((p) => p.estado === 'activo');
  const propuestos = planes.filter((p) => p.estado === 'propuesto');
  const cerrados = planes.filter((p) => !['activo', 'propuesto'].includes(p.estado));
  const met = datos?.metricas?.valores || {};
  const hechas = tareas.filter((t) => t.estado === 'hecha').length;

  // ── PLANES ───────────────────────────────────────────────────────────
  if (vista === 'planes') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-gray-500">Cada lunes el CEO propone planes de 30 a 90 días. Los que apruebas generan tus tareas de cada día; el avance lo mide el sistema.</p>
          <Button variant="outline" size="sm" disabled={preparando} onClick={() => preparar({ modo: 'planes' })}>
            {preparando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Proponer planes ahora
          </Button>
        </div>

        {propuestos.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-purple-600">Propuestos · esperan tu decisión</h3>
            {propuestos.map((p) => (
              <div key={p.id} className="rounded-xl border-2 border-purple-200 bg-purple-50/50 p-4">
                <div className="font-bold text-gray-900">{p.titulo}</div>
                {p.porque && <p className="text-sm text-gray-600 mt-1">{p.porque}</p>}
                <div className="text-xs text-gray-500 mt-2">
                  Se mide con <b>{p.metrica_nombre}</b>: hoy {conUnidad(p.unidad, p.linea_base)} → meta {conUnidad(p.unidad, p.meta)} · hasta el {new Date(`${p.fecha_fin}T12:00:00`).toLocaleDateString('es-DO')}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => decidir(p, true)}><Check className="w-4 h-4 mr-1" /> Aprobar</Button>
                  <Button size="sm" variant="outline" onClick={() => decidir(p, false)}><X className="w-4 h-4 mr-1" /> Rechazar</Button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-gray-500">En marcha</h3>
          {!activos.length && <p className="text-sm text-gray-400">Todavía no hay planes aprobados.</p>}
          {activos.map((p) => <PlanBarra key={p.id} p={p} onCerrar={() => cerrar(p)} />)}
        </section>

        {cerrados.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Terminados y rechazados (30 días)</h3>
            {cerrados.map((p) => (
              <div key={p.id} className="text-sm text-gray-500 flex justify-between gap-3 border-b border-gray-100 py-1.5">
                <span>{p.titulo}{p.nota_dueno ? ` — ${p.nota_dueno}` : ''}</span>
                <span className="font-semibold whitespace-nowrap">{p.estado === 'cumplido' ? '✅ cumplido' : p.estado === 'vencido' ? `⌛ vencido (${p.progreso}%)` : 'rechazado'}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    );
  }

  // ── HOY ──────────────────────────────────────────────────────────────
  const indicadores = ORDEN.filter((k) => met[k] != null).slice(0, 4);
  return (
    <div className="space-y-5">
      {indicadores.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {indicadores.map((k) => (
            <div key={k} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{NOMBRES[k]}</div>
              <div className="text-xl font-black text-gray-900 mt-0.5">{valor(k, met[k])}</div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
          <div>
            <h3 className="font-black text-gray-900">Tus tareas de hoy</h3>
            <p className="text-xs text-gray-500">
              {tareas.length ? `${hechas} de ${tareas.length} hechas` : 'Se preparan solas a las 7:00 am y te llegan por Telegram.'}
              {datos?.ayer?.total ? ` · ayer: ${datos.ayer.hechas} de ${datos.ayer.total}` : ''}
            </p>
          </div>
          {tareas.length ? (
            <Button variant="ghost" size="sm" disabled={preparando} title="Quita las pendientes y arma otras con los datos de ahora"
              onClick={() => window.confirm('¿Rehacer las tareas pendientes de hoy con los datos de ahora?') && preparar({ modo: 'tareas', rehacer: true })}>
              {preparando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
          ) : (
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700" disabled={preparando} onClick={() => preparar({ modo: 'tareas' })}>
              {preparando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />} Preparar mi día
            </Button>
          )}
        </header>
        <ul className="divide-y divide-gray-100">
          {tareas.map((t) => {
            const lista = t.estado !== 'pendiente';
            return (
              <li key={t.id} className={`flex gap-3 px-5 py-3 ${lista ? 'bg-gray-50/70' : ''}`}>
                <button type="button" title={t.estado === 'hecha' ? 'Marcar pendiente' : 'Hecha'}
                  onClick={() => marcar(t, t.estado === 'hecha' ? 'pendiente' : 'hecha')}
                  className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${t.estado === 'hecha' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-emerald-500'}`}>
                  {t.estado === 'hecha' && <Check className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold ${lista ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.titulo}</div>
                  {t.porque && <div className="text-sm text-gray-500 mt-0.5">{t.porque}</div>}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {t.plan && <span className="text-[11px] font-semibold text-purple-700 bg-purple-50 rounded-full px-2 py-0.5 inline-flex items-center gap-1"><Target className="w-3 h-3" /> {t.plan}</span>}
                    {t.estado === 'pospuesta' && <span className="text-[11px] font-semibold text-amber-700">pospuesta</span>}
                    {t.estado === 'descartada' && <span className="text-[11px] font-semibold text-gray-500">descartada</span>}
                  </div>
                </div>
                <div className="flex items-start gap-1 shrink-0">
                  {!lista && t.accion?.telefono && (
                    <a href={t.accion.contacto === 'whatsapp' ? `https://wa.me/${conPais(t.accion.telefono)}` : `tel:+${conPais(t.accion.telefono)}`}
                      target={t.accion.contacto === 'whatsapp' ? '_blank' : undefined} rel="noreferrer"
                      className="inline-flex items-center gap-1 h-9 px-3 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
                      {t.accion.contacto === 'whatsapp' ? <MessageCircle className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                      {t.accion.contacto === 'whatsapp' ? 'WhatsApp' : 'Llamar'}
                    </a>
                  )}
                  {!lista && (t.accion?.tipo === 'panel' || t.accion?.tipo === 'planes') && (
                    <Button size="sm" variant="outline" onClick={() => hacer(t)}>
                      {t.accion.tipo === 'planes' ? 'Ver planes' : (t.accion.etiqueta || 'Abrir')} <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  )}
                  {!lista && (
                    <>
                      <Button size="sm" variant="ghost" title="Posponer" onClick={() => marcar(t, 'pospuesta')}><Clock className="w-4 h-4" /></Button>
                      <Button size="sm" variant="ghost" title="No sirve (el CEO aprende)" onClick={() => marcar(t, 'descartada')}><X className="w-4 h-4" /></Button>
                    </>
                  )}
                  {lista && t.estado !== 'hecha' && (
                    <Button size="sm" variant="ghost" onClick={() => marcar(t, 'pendiente')}>Deshacer</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-gray-900">Tus planes en marcha</h3>
          <Button variant="link" size="sm" className="text-purple-700" onClick={onVerPlanes}>
            {propuestos.length ? `${propuestos.length} propuesto${propuestos.length > 1 ? 's' : ''} por aprobar →` : 'Ver planes →'}
          </Button>
        </div>
        {!activos.length && <p className="text-sm text-gray-400">Aprueba un plan y desde mañana tus tareas lo hacen avanzar.</p>}
        <div className="space-y-3">{activos.map((p) => <PlanBarra key={p.id} p={p} />)}</div>
      </section>
    </div>
  );
}

function PlanBarra({ p, onCerrar }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="font-semibold text-gray-900 flex items-center gap-1.5"><CircleDot className="w-4 h-4 text-purple-500" /> {p.titulo}</div>
        <div className="text-sm font-black text-purple-700">{p.progreso}%</div>
      </div>
      <div className="h-2 rounded-full bg-gray-100 mt-2 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500" style={{ width: `${Math.max(2, p.progreso)}%` }} />
      </div>
      <div className="text-xs text-gray-500 mt-1.5 flex justify-between gap-2 flex-wrap">
        <span>{p.metrica_nombre}: {conUnidad(p.unidad, p.linea_base)} → hoy {conUnidad(p.unidad, p.valor_actual ?? p.linea_base)} → meta {conUnidad(p.unidad, p.meta)}</span>
        <span>
          hasta el {new Date(`${p.fecha_fin}T12:00:00`).toLocaleDateString('es-DO')}
          {onCerrar && <button type="button" className="ml-2 text-gray-400 hover:text-red-600 underline" onClick={onCerrar}>cerrar</button>}
        </span>
      </div>
    </div>
  );
}
