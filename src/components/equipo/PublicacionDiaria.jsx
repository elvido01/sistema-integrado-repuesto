import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { Bot, CalendarClock, Loader2, Recycle, Sparkles } from 'lucide-react';
import { mediaDeBundle, precioDelArte } from '@/lib/textoReuso';
import { COLUMNAS_JOB_REUSO, prefillDesdeBundle } from '@/lib/reusoPublicacion';

// PUBLICACIÓN DIARIA CON HERMES
//
// (05/10/2026) El dueño: cada día 3 piezas, una de RD$100–500, una de
// 501–1,000 y una de más de 1,000; nada de menos de RD$100 en automático y
// sin el 5% (ese solo a mano). Los primeros 30 días Hermes prepara y el
// dueño aprueba en el Paso 2, para retroalimentarlo; después se puede
// encender el 100% automático (sql/publicacion_automatica_hermes.sql).
// Las elige la base y las encarga el worker del Creativo en la PC, a la hora
// puesta aquí.

const DIAS_APRENDIZAJE = 30;
const hoyRD = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santo_Domingo' });
const dinero = (n) => `RD$${Math.round(Number(n) || 0).toLocaleString('es-DO')}`;

const ESTADO = {
  pending: 'en cola', processing: 'el Creativo la está haciendo', waiting_approval: 'lista para aprobar',
  completed: 'hecha', cancelled: 'descartada', expired: 'vencida',
};

// (19/10/2026) Cada pieza del día con su objetivo (sql/publicacion_diaria_objetivos.sql).
// El alcance era muy bajo y las 3 eran de venta: las redes no reparten anuncios.
const OBJETIVOS = {
  venta: { txt: '💰 Venta', cls: 'bg-emerald-100 text-emerald-800', ayuda: 'La promoción de siempre: la pieza y su precio.' },
  educativo: { txt: '📚 Educar', cls: 'bg-sky-100 text-sky-800', ayuda: 'Enseña algo útil de este tipo de pieza para llegar a más gente. Reel ¿Sabías que?.' },
  interaccion: { txt: '💬 Conversación', cls: 'bg-amber-100 text-amber-800', ayuda: 'Una pregunta sobre su moto para que comenten. Reel ¿Le sirve a tu moto?.' },
};

// (21/11/2026) Sin pieza nueva, Hermes llena la franja con una publicación
// anterior (reuso_bundle_id): mismo arte, texto nuevo. "Revisar y publicar"
// llena el formulario con el arte viejo y un texto nuevo con el precio de hoy.
export function PublicacionDiaria({ trabajos, onRevisar, onReusar }) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [hoy, setHoy] = useState([]);
  const [prods, setProds] = useState({});
  const [reusos, setReusos] = useState({});
  const [abriendo, setAbriendo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from('equipo_auto_publicacion').select('*').maybeSingle(),
      supabase.from('equipo_auto_elegidas').select('*').eq('fecha', hoyRD()).order('created_at'),
    ]);
    setCfg(c || null);
    setHoy(e || []);
    const ids = (e || []).map((x) => x.producto_id).filter(Boolean);
    if (ids.length) {
      const { data: ps } = await supabase.from('productos').select('id, codigo, descripcion, precio').in('id', ids);
      setProds(Object.fromEntries((ps || []).map((p) => [p.id, p])));
    }
    const bundles = (e || []).map((x) => x.reuso_bundle_id).filter(Boolean);
    if (bundles.length) {
      const { data: js } = await supabase.from('hermes_publication_jobs')
        .select(COLUMNAS_JOB_REUSO)
        .in('publication_bundle_id', bundles);
      const porBundle = {};
      (js || []).forEach((j) => { (porBundle[j.publication_bundle_id] ||= []).push(j); });
      setReusos(porBundle);
    } else {
      setReusos({});
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);
  // Cuando el worker las encarga, la lista de trabajos de la página cambia.
  useEffect(() => { cargar(); }, [trabajos?.length, cargar]);
  // Publicada desde el Paso 3, o una franja que Hermes llenó: se relee.
  useEffect(() => {
    const f = () => cargar();
    window.addEventListener('equipo-ia:publicada', f);
    return () => window.removeEventListener('equipo-ia:publicada', f);
  }, [cargar]);

  const configurar = async (cambios) => {
    setGuardando(true);
    const { data, error } = await supabase.rpc('equipo_auto_configurar', {
      p_activo: cambios.activo ?? cfg?.activo ?? false,
      p_modo: cambios.modo ?? null,
      p_hora: cambios.hora ?? null,
      p_horarios: cambios.horarios ?? null,
    });
    setGuardando(false);
    if (error) { toast({ variant: 'destructive', title: 'No se guardó', description: error.message }); return; }
    setCfg(data);
  };

  const elegirAhora = async () => {
    setEligiendo(true);
    const { data, error } = await supabase.rpc('equipo_auto_elegir_ahora');
    setEligiendo(false);
    if (error) { toast({ variant: 'destructive', title: 'No se pudieron elegir', description: error.message }); return; }
    const n = (data?.elegidas || []).filter((x) => x.pieza).length;
    toast({ title: n ? `Hermes eligió ${n} pieza${n > 1 ? 's' : ''}` : 'Las de hoy ya estaban elegidas',
      description: n ? 'El Creativo las prepara; te llegan al Paso 2 para aprobarlas.' : undefined });
    window.dispatchEvent(new CustomEvent('equipo-ia:candidatas-cambian'));
    cargar();
  };

  const activo = !!cfg?.activo;
  const desde = cfg?.activado_at ? new Date(cfg.activado_at) : null;
  const dias = desde ? Math.floor((Date.now() - desde.getTime()) / 86400000) : 0;
  const faltan = Math.max(0, DIAS_APRENDIZAJE - dias);
  const trabajoDe = (id) => (trabajos || []).find((w) => w.id === id);
  // La reutilizada va directo al formulario de publicar: arte viejo, texto nuevo.
  const reusar = async (e, p) => {
    setAbriendo(e.id);
    // Lo que se borró del almacenamiento no se reusa (había reels viejos con
    // 404). Sin video, el formulario arma uno con la imagen de la historia.
    const { prefill, error } = await prefillDesdeBundle({
      bundleId: e.reuso_bundle_id,
      jobs: reusos[e.reuso_bundle_id] || null,
      productoId: p.id,
      programarPara: e.hora_publicar ? `${e.fecha}T${String(e.hora_publicar).slice(0, 5)}` : null,
      semilla: e.fecha,
    });
    setAbriendo(null);
    if (error) {
      toast({ variant: 'destructive', title: 'No se puede reutilizar', description: `${error} Elige otra pieza en el Paso 1.` });
      return;
    }
    onReusar(prefill);
  };
  // (06/10/2026) En qué va: elegida → (30 min antes) arte → reel → aviso.
  const etapa = (e, w) => {
    if (e.avisado_at) return /ya publicada/.test(e.nota || '') ? 'ya publicada' : '✅ lista: te avisé para publicarla';
    if (e.reuso_bundle_id) {
      if (!e.hora_publicar) return 'arte listo';
      const [H, M] = String(e.hora_publicar).split(':').map(Number);
      const t = H * 60 + M - 30;
      return `arte listo · te aviso a las ${hora12(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)}`;
    }
    if (!e.trabajo_id) {
      if (!e.hora_publicar) return 'elegida';
      const [H, M] = String(e.hora_publicar).split(':').map(Number);
      const t = H * 60 + M - 30;
      return `el arte se encarga a las ${hora12(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`)}`;
    }
    if (e.reel_pedido_at) return e.reel_pedido_id ? 'arte listo · armando el reel' : 'arte listo';
    return w ? ESTADO[w.estado] || w.estado : 'haciendo el arte';
  };
  const horarios = (cfg?.horarios || ['13:30', '17:30', '19:30']).map((h) => String(h).slice(0, 5));
  const hora12 = (h) => {
    const [H, M] = String(h || '').slice(0, 5).split(':').map(Number);
    if (Number.isNaN(H)) return '';
    return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'am' : 'pm'}`;
  };
  const cambiarHorario = (i, valor) => {
    if (!valor) return;
    const nuevos = horarios.map((h, k) => (k === i ? valor : h));
    if (nuevos.some((h) => h < '08:00' || h > '21:00')) {
      toast({ variant: 'destructive', title: 'Entre las 8:00 am y las 9:00 pm' });
      return;
    }
    if (new Set(nuevos).size !== 3) {
      toast({ variant: 'destructive', title: 'Las 3 horas tienen que ser distintas' });
      return;
    }
    configurar({ horarios: nuevos });
  };

  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Bot className="h-4 w-4 text-violet-600" /> Publicación diaria con Hermes
        </span>
        <p className="flex-1 text-[11px] text-slate-500">
          Cada día 3 piezas: una de RD$100–500, una de 501–1,000 y una de más de 1,000. Nada de menos de RD$100 y sin el 5% (ese solo a mano).
          Cada una con su objetivo (venta, educar o conversación), que rota cada día.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-700">
          <input type="checkbox" checked={activo} disabled={guardando} onChange={(e) => configurar({ activo: e.target.checked })} />
          {activo ? 'Encendida' : 'Apagada'}
        </label>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span className="flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Elige a las
          <input type="time" value={String(cfg?.hora_local || '07:30').slice(0, 5)} disabled={guardando}
            onChange={(e) => e.target.value && configurar({ hora: e.target.value })}
            className="h-6 rounded border px-1 text-[11px]" />
          <span className="text-slate-400">(con la PC encendida)</span>
        </span>
        <span className="flex items-center gap-1" title="Una pieza en cada hora; las horas rotan entre los rangos cada día.">
          Salen a las
          {horarios.map((h, i) => (
            <input key={i} type="time" min="08:00" max="21:00" value={h} disabled={guardando}
              onChange={(e) => cambiarHorario(i, e.target.value)}
              className="h-6 rounded border px-1 text-[11px]" />
          ))}
        </span>
        <label className={`flex items-center gap-1.5 ${faltan > 0 ? 'text-slate-400' : 'cursor-pointer text-slate-700'}`}
          title={faltan > 0 ? 'Los primeros 30 días tú apruebas: así Hermes aprende de lo que corriges.' : 'Publica sin pasar por tu aprobación.'}>
          <input type="checkbox" checked={cfg?.modo === 'automatico'} disabled={guardando || faltan > 0}
            onChange={(e) => configurar({ modo: e.target.checked ? 'automatico' : 'aprobar' })} />
          100% automático
          {faltan > 0 && (
            <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
              {activo ? `aprendiendo: día ${Math.min(dias + 1, DIAS_APRENDIZAJE)} de ${DIAS_APRENDIZAJE}` : `se habilita tras ${DIAS_APRENDIZAJE} días encendida`}
            </span>
          )}
        </label>
        <button type="button" onClick={elegirAhora} disabled={eligiendo}
          className="ml-auto flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50">
          {eligiendo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Elegir las de hoy ahora
        </button>
      </div>

      {hoy.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {hoy.map((e) => {
            const p = prods[e.producto_id];
            const w = e.trabajo_id ? trabajoDe(e.trabajo_id) : null;
            const jobsReuso = e.reuso_bundle_id ? reusos[e.reuso_bundle_id] || [] : [];
            const miniatura = e.reuso_bundle_id ? mediaDeBundle(jobsReuso).imagen_feed : null;
            const precioArte = e.reuso_bundle_id ? precioDelArte(jobsReuso) : null;
            return (
              <div key={e.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px]">
                <p className="flex items-center justify-between text-[10px] font-bold uppercase text-violet-700">
                  <span className="flex items-center gap-1">
                    {e.rango}
                    {e.objetivo && (
                      <span className={`rounded px-1 py-px text-[9px] normal-case ${OBJETIVOS[e.objetivo]?.cls || ''}`}
                        title={OBJETIVOS[e.objetivo]?.ayuda}>
                        {OBJETIVOS[e.objetivo]?.txt || e.objetivo}
                      </span>
                    )}
                  </span>
                  {e.hora_publicar && <span className="normal-case text-slate-500">sale a las {hora12(e.hora_publicar)}</span>}
                </p>
                {p ? (
                  <>
                    <div className="flex gap-2">
                      {miniatura && (
                        <img src={miniatura} alt="" className="h-12 w-12 shrink-0 rounded border object-cover" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-800" title={p.descripcion}>{p.descripcion}</p>
                        <p className="text-slate-500">{dinero(p.precio)} · {p.codigo}</p>
                        {e.reuso_bundle_id && (
                          <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-1 py-px text-[9px] font-bold text-teal-700">
                            <Recycle className="h-2.5 w-2.5" /> Reutilizada · mismo arte, texto nuevo
                          </span>
                        )}
                      </div>
                    </div>
                    {e.nota && <p className="mt-0.5 line-clamp-2 text-[10px] text-violet-700">{e.nota.replace(/^♻ Reutilizada: /, '').replace(/ Ojo: el arte dice .*$/, '')}</p>}
                    {precioArte != null && Math.round(precioArte) !== Math.round(Number(p.precio)) && (
                      <p className="mt-0.5 rounded bg-amber-50 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                        El arte dice {dinero(precioArte)} y hoy cuesta {dinero(p.precio)}.
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{etapa(e, w)}</span>
                      {e.reuso_bundle_id && onReusar && !/ya publicada/.test(e.nota || '') && (
                        <button type="button" onClick={() => reusar(e, p)} disabled={abriendo === e.id}
                          className="ml-auto flex items-center gap-1 rounded bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-teal-700 disabled:opacity-50">
                          {abriendo === e.id && <Loader2 className="h-3 w-3 animate-spin" />}
                          Revisar y publicar
                        </button>
                      )}
                      {e.trabajo_id && onRevisar && (
                        <button type="button" onClick={() => onRevisar(e.trabajo_id)}
                          className="ml-auto rounded bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-violet-700">
                          Revisar en el Paso 2
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="text-amber-700">{e.nota || 'Sin candidata hoy.'} Sube fotos de piezas de este rango en la pestaña Inventario → "Fotos del día".</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          {activo ? `Hoy todavía no ha elegido: lo hace a las ${String(cfg?.hora_local || '07:30').slice(0, 5)} o pulsa "Elegir las de hoy ahora".`
            : 'Enciéndela y cada mañana Hermes te deja 3 promociones listas para aprobar.'}
        </p>
      )}
    </div>
  );
}

export default PublicacionDiaria;
