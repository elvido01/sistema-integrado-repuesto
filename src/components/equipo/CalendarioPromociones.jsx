import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bot, ChevronLeft, ChevronRight, ExternalLink, Loader2, Recycle } from 'lucide-react';
import { mediaDeBundle } from '@/lib/textoReuso';
import { prefillDesdeBundle } from '@/lib/reusoPublicacion';

// CALENDARIO DE PROMOCIONES (21/11/2026)
// Lo que tienen ContentStudio, Hootsuite y SocialBee y aquí faltaba: ver la
// semana o el mes de un vistazo. Cada promoción (un bundle con sus redes) va
// en su día: publicada, programada, en proceso, borrador o fallida; y lo que
// Hermes ya eligió para hoy y todavía no se ha armado. Clic → el detalle con
// el enlace de cada red y "Volver a publicar".

const TZ = 'America/Santo_Domingo';
const diaDe = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const horaDe = (iso) => new Date(iso).toLocaleTimeString('es-DO', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// Fechas como 'AAAA-MM-DD' para no pelear con zonas horarias.
const aFecha = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const aClave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumar = (k, n) => { const d = aFecha(k); d.setDate(d.getDate() + n); return aClave(d); };
const lunesDe = (k) => { const d = aFecha(k); return sumar(k, -((d.getDay() + 6) % 7)); };

export const ESTADOS = {
  publicada: { txt: 'Publicada', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800', punto: 'bg-emerald-500' },
  programada: { txt: 'Programada', cls: 'border-blue-200 bg-blue-50 text-blue-800', punto: 'bg-blue-500' },
  proceso: { txt: 'En proceso', cls: 'border-violet-200 bg-violet-50 text-violet-800', punto: 'bg-violet-500' },
  hermes: { txt: 'Hermes la eligió', cls: 'border-dashed border-violet-300 bg-white text-violet-700', punto: 'bg-violet-300' },
  borrador: { txt: 'Borrador', cls: 'border-slate-200 bg-slate-50 text-slate-500', punto: 'bg-slate-400' },
  fallo: { txt: 'Falló', cls: 'border-red-200 bg-red-50 text-red-700', punto: 'bg-red-500' },
};

/** Junta los trabajos por promoción y decide su día y su estado. */
export function agruparPromociones(jobs = [], ahora = Date.now()) {
  const grupos = {};
  jobs.forEach((j) => { (grupos[j.publication_bundle_id || j.id] ||= []).push(j); });
  return Object.entries(grupos).map(([id, js]) => {
    const cuando = js.map((j) => j.scheduled_for || j.completed_at || j.created_at).filter(Boolean).sort()[0];
    const st = js.map((j) => j.status);
    let estado;
    if (st.some((s) => s === 'published' || s === 'partially_published')) estado = 'publicada';
    else if (st.every((s) => s === 'draft')) estado = 'borrador';
    else if (st.some((s) => s === 'failed') && !st.some((s) => !['failed', 'draft', 'cancelled', 'rejected'].includes(s))) estado = 'fallo';
    else if (js.some((j) => j.scheduled_for && new Date(j.scheduled_for).getTime() > ahora)) estado = 'programada';
    else estado = 'proceso';
    const redes = [...new Set(js.flatMap((j) => j.channels || []))].sort();
    return {
      id, bundleId: js[0].publication_bundle_id || null, jobs: js, cuando, dia: cuando ? diaDe(cuando) : null,
      estado, redes, titulo: js.find((j) => j.title)?.title || 'Promoción',
      productoId: js.find((j) => j.producto_id)?.producto_id || null,
      miniatura: mediaDeBundle(js).imagen_feed || null,
    };
  }).filter((p) => p.dia);
}

const RED = { facebook: 'FB', instagram: 'IG', tiktok: 'TT', youtube: 'YT', whatsapp: 'WA' };

export function CalendarioPromociones({ onReusar }) {
  const { toast } = useToast();
  const [vista, setVista] = useState('semana');
  const [ancla, setAncla] = useState(hoyRD());
  const [promos, setPromos] = useState([]);
  const [hermes, setHermes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [abierta, setAbierta] = useState(null);
  const [destinos, setDestinos] = useState([]);
  const [reusando, setReusando] = useState(false);

  // Días visibles: la semana (lun-dom) o el mes completo en semanas enteras.
  const dias = useMemo(() => {
    if (vista === 'semana') return Array.from({ length: 7 }, (_, i) => sumar(lunesDe(ancla), i));
    const primero = `${ancla.slice(0, 7)}-01`;
    const d = aFecha(primero);
    const ultimo = aClave(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
    const ini = lunesDe(primero);
    const fin = sumar(lunesDe(ultimo), 6);
    const out = [];
    for (let k = ini; k <= fin; k = sumar(k, 1)) out.push(k);
    return out;
  }, [vista, ancla]);

  const cargar = useCallback(async () => {
    setCargando(true);
    const desde = new Date(`${dias[0]}T00:00:00-04:00`).toISOString();
    const hasta = new Date(`${sumar(dias[dias.length - 1], 1)}T00:00:00-04:00`).toISOString();
    const [{ data: js, error }, { data: el }] = await Promise.all([
      supabase.from('hermes_publication_jobs')
        .select('id, publication_bundle_id, producto_id, title, status, channels, placement, media_type, image_url, media_url, scheduled_for, completed_at, created_at, textos, precio_mostrado')
        .or(`and(scheduled_for.gte.${desde},scheduled_for.lt.${hasta}),and(scheduled_for.is.null,created_at.gte.${desde},created_at.lt.${hasta})`)
        .order('created_at', { ascending: false })
        .limit(2000),
      supabase.from('equipo_auto_elegidas')
        .select('id, fecha, rango, producto_id, hora_publicar, avisado_at, reuso_bundle_id, nota')
        .gte('fecha', dias[0]).lte('fecha', dias[dias.length - 1])
        .not('producto_id', 'is', null),
    ]);
    if (error) toast({ variant: 'destructive', title: 'No se pudo leer el calendario', description: error.message });
    const agrupadas = agruparPromociones(js || []);
    setPromos(agrupadas);
    // Lo que Hermes eligió y todavía no tiene promoción armada ese día.
    const yaArmadas = new Set(agrupadas.map((p) => `${p.dia}|${p.productoId}`));
    const pend = (el || []).filter((e) => !yaArmadas.has(`${e.fecha}|${e.producto_id}`) && !/ya publicada/.test(e.nota || ''));
    if (pend.length) {
      const { data: ps } = await supabase.from('productos').select('id, descripcion').in('id', pend.map((e) => e.producto_id));
      const nom = Object.fromEntries((ps || []).map((p) => [p.id, p.descripcion]));
      setHermes(pend.map((e) => ({ ...e, titulo: nom[e.producto_id] || 'Pieza elegida' })));
    } else {
      setHermes([]);
    }
    setCargando(false);
  }, [dias, toast]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    const f = () => cargar();
    window.addEventListener('equipo-ia:actualizar', f);
    return () => window.removeEventListener('equipo-ia:actualizar', f);
  }, [cargar]);

  const porDia = useMemo(() => {
    const m = {};
    promos.forEach((p) => { (m[p.dia] ||= []).push(p); });
    Object.values(m).forEach((xs) => xs.sort((a, b) => String(a.cuando).localeCompare(String(b.cuando))));
    return m;
  }, [promos]);
  const hermesPorDia = useMemo(() => {
    const m = {};
    hermes.forEach((e) => { (m[e.fecha] ||= []).push(e); });
    return m;
  }, [hermes]);

  const abrir = async (p) => {
    setAbierta(p);
    setDestinos([]);
    const { data } = await supabase.from('hermes_publication_targets')
      .select('id, job_id, platform, placement, status, external_url, error_message, published_at')
      .in('job_id', p.jobs.map((j) => j.id));
    setDestinos(data || []);
  };

  const volverAPublicar = async (p) => {
    setReusando(true);
    const { prefill, error } = await prefillDesdeBundle({ bundleId: p.bundleId, jobs: p.jobs, productoId: p.productoId, semilla: hoyRD() });
    setReusando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se puede volver a publicar', description: error }); return; }
    setAbierta(null);
    onReusar?.(prefill);
  };

  const mover = (n) => {
    if (vista === 'semana') setAncla((k) => sumar(k, 7 * n));
    else setAncla((k) => { const d = aFecha(`${k.slice(0, 7)}-01`); return aClave(new Date(d.getFullYear(), d.getMonth() + n, 1, 12)); });
  };
  const titulo = vista === 'semana'
    ? `${aFecha(dias[0]).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })} – ${aFecha(dias[6]).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : aFecha(`${ancla.slice(0, 7)}-01`).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  const hoy = hoyRD();
  const mesActual = ancla.slice(0, 7);
  const resumen = useMemo(() => {
    const c = {};
    promos.forEach((p) => { c[p.estado] = (c[p.estado] || 0) + 1; });
    return c;
  }, [promos]);

  const Chip = ({ p }) => {
    const e = ESTADOS[p.estado];
    return (
      <button type="button" onClick={() => abrir(p)} title={`${p.titulo} · ${e.txt}`}
        className={`flex w-full items-center gap-1 rounded border px-1 py-0.5 text-left text-[10px] leading-tight hover:brightness-95 ${e.cls}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.punto}`} />
        <span className="truncate font-semibold">{p.titulo}</span>
      </button>
    );
  };
  const ChipHermes = ({ e }) => (
    <div title={`${e.titulo} · Hermes la eligió para las ${String(e.hora_publicar || '').slice(0, 5)}`}
      className={`flex w-full items-center gap-1 rounded border px-1 py-0.5 text-[10px] leading-tight ${ESTADOS.hermes.cls}`}>
      {e.reuso_bundle_id ? <Recycle className="h-2.5 w-2.5 shrink-0" /> : <Bot className="h-2.5 w-2.5 shrink-0" />}
      <span className="truncate">{e.titulo}</span>
    </div>
  );

  return (
    <section className="mb-4 rounded-xl border bg-white p-4 shadow-sm" aria-label="Calendario de promociones">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-sm font-bold text-slate-800">Calendario de promociones</h2>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => mover(-1)} className="rounded border p-1 hover:bg-slate-50" aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setAncla(hoyRD())} className="rounded border px-2 py-1 text-xs font-semibold hover:bg-slate-50">Hoy</button>
          <button type="button" onClick={() => mover(1)} className="rounded border p-1 hover:bg-slate-50" aria-label="Siguiente"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <span className="text-sm font-semibold text-slate-700">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</span>
        {cargando && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        <div className="ml-auto flex rounded-lg border p-0.5 text-xs font-semibold">
          {[['semana', 'Semana'], ['mes', 'Mes']].map(([k, t]) => (
            <button key={k} type="button" onClick={() => setVista(k)}
              className={`rounded-md px-2.5 py-1 ${vista === k ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
        {Object.entries(ESTADOS).map(([k, e]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${e.punto}`} /> {e.txt}{resumen[k] ? ` (${resumen[k]})` : ''}
          </span>
        ))}
      </div>

      {vista === 'semana' ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
          {dias.map((k, i) => (
            <div key={k} className={`min-h-[140px] rounded-lg border p-1.5 ${k === hoy ? 'border-violet-400 bg-violet-50/40' : 'border-slate-200'}`}>
              <p className={`mb-1 text-[11px] font-bold ${k === hoy ? 'text-violet-700' : 'text-slate-500'}`}>
                {DIAS[i]} {aFecha(k).getDate()}
              </p>
              <div className="space-y-1.5">
                {(porDia[k] || []).map((p) => (
                  <button key={p.id} type="button" onClick={() => abrir(p)}
                    className={`block w-full overflow-hidden rounded-md border text-left hover:shadow ${ESTADOS[p.estado].cls}`}>
                    {p.miniatura && <img src={p.miniatura} alt="" loading="lazy" className="h-20 w-full object-cover" />}
                    <div className="p-1">
                      <p className="line-clamp-2 text-[10px] font-semibold leading-tight">{p.titulo}</p>
                      <p className="text-[9px] opacity-80">{horaDe(p.cuando)} · {p.redes.map((r) => RED[r] || r).join(' ')}</p>
                    </div>
                  </button>
                ))}
                {(hermesPorDia[k] || []).map((e) => <ChipHermes key={e.id} e={e} />)}
                {!(porDia[k] || []).length && !(hermesPorDia[k] || []).length && (
                  <p className="pt-4 text-center text-[10px] text-slate-300">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7 gap-1">
            {DIAS.map((d) => <p key={d} className="text-center text-[10px] font-bold uppercase text-slate-400">{d}</p>)}
            {dias.map((k) => {
              const xs = porDia[k] || [];
              const hs = hermesPorDia[k] || [];
              const fuera = k.slice(0, 7) !== mesActual;
              return (
                <div key={k} className={`min-h-[92px] rounded border p-1 ${k === hoy ? 'border-violet-400 bg-violet-50/40' : 'border-slate-200'} ${fuera ? 'opacity-40' : ''}`}>
                  <p className={`text-[10px] font-bold ${k === hoy ? 'text-violet-700' : 'text-slate-500'}`}>{aFecha(k).getDate()}</p>
                  <div className="mt-0.5 space-y-0.5">
                    {xs.slice(0, 3).map((p) => <Chip key={p.id} p={p} />)}
                    {xs.length > 3 && (
                      <button type="button" onClick={() => { setAncla(k); setVista('semana'); }}
                        className="text-[10px] font-semibold text-violet-700 hover:underline">+{xs.length - 3} más</button>
                    )}
                    {hs.map((e) => <ChipHermes key={e.id} e={e} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!abierta} onOpenChange={(v) => !v && setAbierta(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          {abierta && (
            <>
              <DialogHeader><DialogTitle className="text-base">{abierta.titulo}</DialogTitle></DialogHeader>
              <div className="flex gap-3">
                {abierta.miniatura && <img src={abierta.miniatura} alt="" className="h-28 w-28 shrink-0 rounded border object-cover" />}
                <div className="space-y-1 text-xs text-slate-600">
                  <p><span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${ESTADOS[abierta.estado].cls}`}>{ESTADOS[abierta.estado].txt}</span></p>
                  <p>{aFecha(abierta.dia).toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })} · {horaDe(abierta.cuando)}</p>
                  {abierta.jobs[0]?.precio_mostrado != null && <p>Precio en el arte: RD${Number(abierta.jobs[0].precio_mostrado).toLocaleString('es-DO')}</p>}
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Dónde salió</p>
                {destinos.length === 0 ? (
                  <p className="text-xs text-slate-400">Sin destinos registrados todavía.</p>
                ) : (
                  <ul className="space-y-1">
                    {destinos.map((d) => (
                      <li key={d.id} className="flex items-center gap-2 text-xs">
                        <span className="w-28 font-semibold capitalize text-slate-700">{d.platform} · {d.placement}</span>
                        <span className={d.status === 'published' ? 'text-emerald-700' : d.status === 'failed' ? 'text-red-600' : 'text-slate-500'}>
                          {d.status === 'published' ? 'publicada' : d.status === 'failed' ? 'falló' : d.status}
                        </span>
                        {d.external_url && (
                          <a href={d.external_url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-0.5 text-blue-700 hover:underline">
                            ver <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {d.status === 'failed' && d.error_message && <span className="ml-auto max-w-[180px] truncate text-[10px] text-red-500" title={d.error_message}>{d.error_message}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {abierta.jobs.find((j) => j.textos?.facebook)?.textos?.facebook && (
                <div className="mt-3">
                  <p className="mb-1 text-[11px] font-bold uppercase text-slate-500">Texto (Facebook)</p>
                  <p className="whitespace-pre-line rounded bg-slate-50 p-2 text-xs text-slate-700">{abierta.jobs.find((j) => j.textos?.facebook).textos.facebook}</p>
                </div>
              )}
              {abierta.estado === 'publicada' && abierta.bundleId && onReusar && (
                <button type="button" onClick={() => volverAPublicar(abierta)} disabled={reusando}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                  {reusando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Recycle className="h-4 w-4" />}
                  Volver a publicar (mismo arte, texto nuevo)
                </button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

export default CalendarioPromociones;
