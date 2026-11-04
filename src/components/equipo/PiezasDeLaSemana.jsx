import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/components/ui/use-toast';
import { CalendarClock, ChevronDown, ChevronUp, Clapperboard, Loader2, RotateCcw, Send, Sparkles, Trash2 } from 'lucide-react';

// PIEZAS DE LA SEMANA
//
// (01/11/2026) Idea del dueño: un video horizontal de 2–4 minutos con las
// piezas publicadas en la semana, diciendo qué es cada una y su precio, para
// YouTube y Facebook el sábado o el domingo. Lo arma el Creativo en la PC
// (scripts/armarSemanal.mjs) el viernes a la hora puesta o con "Armar ahora";
// el dueño lo ve aquí, quita piezas o corrige la voz, y lo aprueba. Al
// aprobar se crea la promoción con las mismas funciones del Paso 3 y se
// programa (sql/piezas_de_la_semana.sql).

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const rangoTexto = (desde, hasta) => {
  const [, m1, d1] = String(desde).split('-').map(Number);
  const [, m2, d2] = String(hasta).split('-').map(Number);
  return m1 === m2 ? `Del ${d1} al ${d2} de ${MESES[m2 - 1]}` : `Del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]}`;
};
const dinero = (n) => `RD$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const hora12 = (h) => {
  const [H, M] = String(h || '').slice(0, 5).split(':').map(Number);
  if (Number.isNaN(H)) return '';
  return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'am' : 'pm'}`;
};
const duracionTexto = (s) => {
  const n = Math.round(Number(s) || 0);
  return n >= 60 ? `${Math.floor(n / 60)} min ${n % 60} s` : `${n} s`;
};

// La próxima vez que toca publicar (hora de Santo Domingo), como valor de
// un <input type="datetime-local">. Si ya pasó esta semana, la siguiente.
const proximaSalida = (dia, hora) => {
  const ahoraRD = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santo_Domingo' }));
  const [H, M] = String(hora || '10:00').slice(0, 5).split(':').map(Number);
  const f = new Date(ahoraRD);
  f.setHours(H, M, 0, 0);
  let suma = (Number(dia ?? 6) - f.getDay() + 7) % 7;
  if (suma === 0 && f <= ahoraRD) suma = 7;
  f.setDate(f.getDate() + suma);
  const p = (x) => String(x).padStart(2, '0');
  return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}T${p(f.getHours())}:${p(f.getMinutes())}`;
};

const ESTADO = {
  pendiente: { txt: 'en cola', cls: 'bg-slate-100 text-slate-700' },
  armando: { txt: 'el Creativo lo está armando', cls: 'bg-violet-100 text-violet-800' },
  listo: { txt: 'listo para revisar', cls: 'bg-emerald-100 text-emerald-800' },
  error: { txt: 'no se pudo armar', cls: 'bg-red-100 text-red-800' },
  aprobado: { txt: 'aprobado', cls: 'bg-sky-100 text-sky-800' },
  descartado: { txt: 'descartado', cls: 'bg-slate-100 text-slate-500' },
};

const textoPublicacion = (s, piezas) => [
  `🔧 Piezas de la semana en ${s.empresa || 'nuestra tienda'} (${rangoTexto(s.desde, s.hasta)})`,
  '',
  ...piezas.map((p) => `✅ ${p.descripcion} — ${dinero(p.precio)}`),
  '',
  ...(s.telefono ? [`📲 WhatsApp ${s.telefono}`] : []),
  'Precios con ITBIS incluido. ¿Buscas otra pieza? Déjala en los comentarios.',
  '#PiezasDeLaSemana #RepuestosDeMotos',
].join('\n');

export function PiezasDeLaSemana() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [cambios, setCambios] = useState({});        // producto_id → { incluir, voz }
  const [cuando, setCuando] = useState('');
  const [redes, setRedes] = useState({ facebook: true, youtube: true });
  const [texto, setTexto] = useState('');
  // Minimizada por defecto: se abre con el botón y vuelve cerrada al recargar.
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    const [{ data: c }, { data: s, error }] = await Promise.all([
      supabase.from('equipo_semanal_config').select('*').maybeSingle(),
      supabase.from('equipo_semanal').select('*').order('hasta', { ascending: false }).limit(3),
    ]);
    setCargando(false);
    if (error) return;          // sin la tabla todavía (SQL sin correr): la tarjeta no se muestra
    setCfg(c || null);
    setFilas(s || []);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const actual = filas[0] || null;
  // Mientras el Creativo trabaja, mirar cada 20 s.
  useEffect(() => {
    if (!actual || !['pendiente', 'armando'].includes(actual.estado)) return undefined;
    const t = setInterval(cargar, 20_000);
    return () => clearInterval(t);
  }, [actual?.id, actual?.estado, cargar]);

  // Las piezas tal como van en el video, con la voz que dijo el guion.
  const piezas = useMemo(() => {
    if (!actual) return [];
    const voces = Object.fromEntries((actual.guion?.piezas || []).map((g) => [g.producto_id, g.voz]));
    return (actual.piezas || []).map((p) => ({
      ...p,
      incluir: cambios[p.producto_id]?.incluir ?? (p.incluir !== false),
      voz: cambios[p.producto_id]?.voz ?? (p.voz || voces[p.producto_id] || ''),
    }));
  }, [actual, cambios]);
  const incluidas = piezas.filter((p) => p.incluir);

  // Al cambiar de video: limpiar lo editado y preparar la salida.
  useEffect(() => {
    setCambios({});
    if (actual) {
      setCuando(proximaSalida(cfg?.dia_publicar, cfg?.hora_publicar));
      setTexto(textoPublicacion(actual, (actual.piezas || []).filter((p) => p.incluir !== false)));
    }
  }, [actual?.id, actual?.listo_at, cfg?.dia_publicar, cfg?.hora_publicar]);

  if (cargando || (!cfg && filas.length === 0)) return null;

  const rpc = async (nombre, args, exito) => {
    setTrabajando(true);
    try {
      const { data, error } = await supabase.rpc(nombre, args);
      if (error) throw error;
      if (exito) toast(exito(data));
      return data;
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo', description: e.message, duration: 10000 });
      return null;
    } finally {
      setTrabajando(false);
      cargar();
    }
  };

  const configurar = (c) => rpc('equipo_semanal_configurar', {
    p_activo: c.activo ?? null, p_dia_armar: c.dia_armar ?? null, p_hora_armar: c.hora_armar ?? null,
    p_dia_publicar: c.dia_publicar ?? null, p_hora_publicar: c.hora_publicar ?? null,
  });

  const armarAhora = () => rpc('equipo_semanal_armar_ahora', {}, (d) => {
    if (d?.estado === 'descartado') return { variant: 'destructive', title: 'No hay suficientes piezas', description: d.error };
    if (d?.estado === 'aprobado') return { title: 'El de hoy ya está aprobado', description: 'No se vuelve a armar.' };
    if (d?.estado === 'armando') return { title: 'Ya se está armando', description: 'Te aviso cuando esté.' };
    return { title: `Armando con ${d?.piezas} piezas`, description: 'El Creativo lo hace en la PC (tarda unos minutos). Te aviso cuando esté.' };
  });

  const rehacer = () => rpc('equipo_semanal_rehacer', {
    p_id: actual.id,
    p_cambios: piezas.map((p) => ({ producto_id: p.producto_id, incluir: p.incluir, voz: p.voz })),
  }, () => ({ title: 'Se rehace con tus cambios', description: 'Te aviso cuando esté.' }));

  const descartar = () => {
    if (!window.confirm('¿Descartar el video de esta semana? No se publica.')) return;
    rpc('equipo_semanal_descartar', { p_id: actual.id }, () => ({ title: 'Descartado' }));
  };

  // Aprobar = las mismas funciones del Paso 3: crear → confirmar → aprobar →
  // programar; y se anota en el video. Si algo falla a mitad, repetir no
  // duplica (la clave semanal-<id> hace que promo_crear devuelva la misma).
  const aprobar = async () => {
    const destinos = [
      ...(redes.facebook ? [{ platform: 'facebook', placement: 'reel' }] : []),
      ...(redes.youtube ? [{ platform: 'youtube', placement: 'short' }] : []),
    ];
    if (!destinos.length) { toast({ variant: 'destructive', title: 'Elige al menos una red' }); return; }
    if (!cuando) { toast({ variant: 'destructive', title: 'Pon cuándo sale' }); return; }
    const titulo = `Piezas de la semana · ${actual.empresa || ''} (${rangoTexto(actual.desde, actual.hasta)})`.replace(/\s+/g, ' ');
    setTrabajando(true);
    try {
      const { data: creada, error: e1 } = await supabase.rpc('promo_crear', {
        p_titulo: titulo,
        p_producto_id: null,
        p_precio: null,
        // YouTube toma el título de la línea "Título:"; "[video largo]" le dice
        // que no es un Short (no lleva #Shorts) y a Facebook que va como video
        // normal, no como reel (los reels son verticales). La línea no se publica.
        p_textos: { facebook: `[video largo]\n${texto}`, youtube: `Título: ${titulo}\n[video largo]\n${texto}` },
        p_media: { video: actual.video_url, sin_descuento: true },
        p_destinos: destinos,
        p_idempotency_key: `semanal-${actual.id}`,
        p_design_id: null,
      });
      if (e1) throw e1;
      const id = creada.bundle_id;
      let res = null;
      for (const [nombre, args] of [
        ['promo_confirmar_existencia', { p_bundle_id: id }],
        ['promo_aprobar', { p_bundle_id: id }],
        ['promo_programar', { p_bundle_id: id, p_cuando: new Date(`${cuando}:00-04:00`).toISOString() }],
        ['equipo_semanal_aprobado', { p_id: actual.id, p_bundle_id: id }],
      ]) {
        const { data, error } = await supabase.rpc(nombre, args);
        if (error) throw error;
        if (nombre === 'promo_programar') res = data;
      }
      const bloqueados = Number(res?.sin_autorizar || 0);
      toast({
        title: `Programado para el ${new Date(res?.cuando).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })}`,
        description: bloqueados ? `${bloqueados} red(es) sin autorizar no salen.` : 'Lo ves en el historial de publicaciones.',
      });
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo aprobar', description: e.message, duration: 10000 });
    } finally {
      setTrabajando(false);
      cargar();
    }
  };

  const activo = !!cfg?.activo;
  const est = actual ? ESTADO[actual.estado] || { txt: actual.estado, cls: '' } : null;
  const editado = Object.keys(cambios).length > 0;

  return (
    <div className="mb-4 rounded-xl border border-orange-200 bg-white p-3 shadow-sm">
      <div className={`${abierto ? 'mb-2 ' : ''}flex flex-wrap items-center gap-x-3 gap-y-1`}>
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <Clapperboard className="h-4 w-4 text-orange-600" /> Piezas de la semana
        </span>
        {!abierto && est && (
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${est.cls}`}>{est.txt}</span>
        )}
        <p className={`flex-1 text-[11px] text-slate-500 ${abierto ? '' : 'hidden md:block truncate'}`}>
          Video horizontal con las piezas publicadas en la semana: qué es cada una y su precio (en la voz y en pantalla), para YouTube y Facebook. Tú lo apruebas antes de que salga.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-slate-700">
          <input type="checkbox" checked={activo} disabled={trabajando} onChange={(e) => configurar({ activo: e.target.checked })} />
          {activo ? 'Encendido' : 'Apagado'}
        </label>
        <button type="button" onClick={() => setAbierto((v) => !v)} title={abierto ? 'Minimizar' : 'Abrir'}
          className="flex items-center gap-1 rounded border bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50">
          {abierto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {abierto ? 'Minimizar' : 'Abrir'}
        </button>
      </div>

      {abierto && (<>

      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
        <span className="flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Se arma el
          <select value={cfg?.dia_armar ?? 5} disabled={trabajando} className="h-6 rounded border px-1 text-[11px]"
            onChange={(e) => configurar({ dia_armar: Number(e.target.value) })}>
            {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          a las
          <input type="time" value={String(cfg?.hora_armar || '19:00').slice(0, 5)} disabled={trabajando}
            onChange={(e) => e.target.value && configurar({ hora_armar: e.target.value })}
            className="h-6 rounded border px-1 text-[11px]" />
          <span className="text-slate-400">(con la PC encendida)</span>
        </span>
        <span className="flex items-center gap-1">
          Sale el
          <select value={cfg?.dia_publicar ?? 6} disabled={trabajando} className="h-6 rounded border px-1 text-[11px]"
            onChange={(e) => configurar({ dia_publicar: Number(e.target.value) })}>
            {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          a las
          <input type="time" value={String(cfg?.hora_publicar || '10:00').slice(0, 5)} disabled={trabajando}
            onChange={(e) => e.target.value && configurar({ hora_publicar: e.target.value })}
            className="h-6 rounded border px-1 text-[11px]" />
        </span>
        <button type="button" onClick={armarAhora} disabled={trabajando || ['pendiente', 'armando'].includes(actual?.estado)}
          className="ml-auto flex items-center gap-1 rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-700 hover:bg-orange-100 disabled:opacity-50">
          {trabajando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          Armar ahora (últimos 7 días)
        </button>
      </div>

      {!actual && (
        <p className="text-[11px] text-slate-400">
          Todavía no hay ninguno. Se arma solo el {DIAS[cfg?.dia_armar ?? 5]} a las {hora12(cfg?.hora_armar || '19:00')}, o pulsa "Armar ahora".
        </p>
      )}

      {actual && (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px]">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-800">{rangoTexto(actual.desde, actual.hasta)}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${est.cls}`}>{est.txt}</span>
            {actual.duracion && <span className="text-slate-500">{duracionTexto(actual.duracion)} · {incluidas.length} piezas</span>}
            {['pendiente', 'armando'].includes(actual.estado) && (
              <span className="flex items-center gap-1 text-violet-700"><Loader2 className="h-3 w-3 animate-spin" /> tarda unos minutos; necesita la PC encendida</span>
            )}
            {actual.estado === 'aprobado' && actual.aprobado_at && (
              <span className="text-slate-500">aprobado el {new Date(actual.aprobado_at).toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' })} · míralo en el historial de publicaciones</span>
            )}
          </div>
          {actual.error && ['error', 'descartado', 'pendiente'].includes(actual.estado) && (
            <p className="mb-2 rounded bg-red-50 px-2 py-1 text-red-700">{actual.error}</p>
          )}
          {(actual.avisos || []).length > 0 && actual.estado === 'listo' && (
            <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-amber-800">{actual.avisos.join(' ')}</p>
          )}

          {actual.video_url && ['listo', 'aprobado'].includes(actual.estado) && (
            <video key={actual.video_url} src={actual.video_url} controls preload="metadata"
              className="mb-2 aspect-video w-full max-w-2xl rounded bg-black" />
          )}

          {['listo', 'error', 'descartado'].includes(actual.estado) && piezas.length > 0 && (
            <>
              <p className="mb-1 font-semibold text-slate-700">
                Las piezas y lo que dice la voz <span className="font-normal text-slate-500">(el precio lo dice sola al final de cada una, con el del catálogo)</span>
              </p>
              <div className="mb-2 space-y-1">
                {piezas.map((p) => (
                  <div key={p.producto_id} className={`flex items-start gap-2 rounded border bg-white p-1.5 ${p.incluir ? '' : 'opacity-50'}`}>
                    <input type="checkbox" className="mt-1" checked={p.incluir} disabled={trabajando}
                      title={p.incluir ? 'Quitar del video' : 'Volver a ponerla'}
                      onChange={(e) => setCambios((c) => ({ ...c, [p.producto_id]: { incluir: e.target.checked, voz: p.voz } }))} />
                    {p.foto_url && <img src={p.foto_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800" title={p.descripcion}>
                        {p.descripcion} <span className="font-normal text-slate-500">· {dinero(p.precio)}</span>
                      </p>
                      <textarea value={p.voz} rows={2} maxLength={300} disabled={trabajando || !p.incluir}
                        placeholder="Lo escribe el Creativo al armarlo"
                        onChange={(e) => setCambios((c) => ({ ...c, [p.producto_id]: { incluir: p.incluir, voz: e.target.value } }))}
                        className="mt-0.5 w-full resize-y rounded border px-1.5 py-1 text-[11px]" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                <button type="button" onClick={rehacer} disabled={trabajando || incluidas.length < 2}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold ${editado || actual.estado !== 'listo' ? 'bg-violet-600 text-white hover:bg-violet-700' : 'border bg-white text-slate-700 hover:bg-slate-50'} disabled:opacity-50`}>
                  <RotateCcw className="h-3 w-3" /> {editado ? 'Rehacer con mis cambios' : 'Rehacer'}
                </button>
                {actual.estado !== 'descartado' && (
                  <button type="button" onClick={descartar} disabled={trabajando}
                    className="flex items-center gap-1 rounded border bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    <Trash2 className="h-3 w-3" /> Descartar
                  </button>
                )}
              </div>
            </>
          )}

          {actual.estado === 'listo' && (
            <div className="rounded border border-emerald-200 bg-white p-2">
              <p className="mb-1 font-semibold text-slate-700">Aprobar y programar</p>
              {editado && (
                <p className="mb-1 text-amber-700">Cambiaste piezas o la voz: pulsa "Rehacer con mis cambios" antes de aprobar, o se publica el video como está.</p>
              )}
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={redes.facebook} onChange={(e) => setRedes((r) => ({ ...r, facebook: e.target.checked }))} /> Facebook (video)
                </label>
                <label className="flex items-center gap-1" title="Sube en privado hasta que Google apruebe la auditoría; lo pones público en YouTube Studio.">
                  <input type="checkbox" checked={redes.youtube} onChange={(e) => setRedes((r) => ({ ...r, youtube: e.target.checked }))} /> YouTube <span className="text-slate-400">(privado hasta la auditoría)</span>
                </label>
                <span className="flex items-center gap-1">
                  Sale el
                  <input type="datetime-local" value={cuando} onChange={(e) => setCuando(e.target.value)} className="h-6 rounded border px-1 text-[11px]" />
                </span>
              </div>
              <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6}
                className="mb-1 w-full resize-y rounded border px-1.5 py-1 text-[11px]" />
              <button type="button" onClick={aprobar} disabled={trabajando || editado}
                className="flex items-center gap-1 rounded bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                {trabajando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Aprobar y programar
              </button>
            </div>
          )}
        </div>
      )}
      </>)}
    </div>
  );
}

export default PiezasDeLaSemana;
