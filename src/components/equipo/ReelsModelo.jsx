import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Clapperboard, ExternalLink, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';

// ESTILO DE TUS REELS — los reels modelo y la receta de cada uno.
//
// (04/10/2026) Hermano de "Estilo de tus piezas", pero para video. El dueño
// pega el enlace de un reel que le gusta; el Comercial-Creativo, en la PC,
// lo baja, mira sus planos, escucha la voz y escribe su RECETA (formato,
// tomas, guion, texto en pantalla, música). Al armar reels (Parte 2) rota
// entre los formatos para que no salgan todos iguales.
//
// Se imita la receta, no el contenido: ni su producto ni su marca ni sus
// frases. Ver sql/equipo_reels_modelo.sql y scripts/estudioReel.mjs.

export const FORMATOS_REEL = {
  comercial_estudio:   { nombre: 'Comercial de estudio', color: 'bg-slate-800 text-white' },
  en_las_manos:        { nombre: 'En las manos',         color: 'bg-amber-100 text-amber-800' },
  pregunta_que_ensena: { nombre: 'Pregunta que enseña',  color: 'bg-sky-100 text-sky-800' },
  colores_variantes:   { nombre: 'Colores y variantes',  color: 'bg-fuchsia-100 text-fuchsia-800' },
  empaque_detalle:     { nombre: 'Empaque y detalle',    color: 'bg-emerald-100 text-emerald-800' },
  vitrina_giratoria:   { nombre: 'Vitrina giratoria',    color: 'bg-red-100 text-red-800' },
  otro:                { nombre: 'Otro formato',         color: 'bg-slate-100 text-slate-700' },
};

const ESTADO = {
  pendiente:  'En cola: el Creativo lo estudia en cuanto esté libre',
  estudiando: 'Estudiándolo…',
  error:      'No se pudo estudiar',
};

const esEnlace = (t) => /^https:\/\/(www\.)?(instagram\.com|tiktok\.com|vm\.tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch)\//i.test(t);

// Instagram y TikTok pegan el enlace con ?utm_source y &stkn: se guardan
// sin eso para que el mismo reel no entre dos veces.
const limpiarEnlace = (t) => {
  try {
    const u = new URL(String(t).trim());
    if (!/youtube\.com$/i.test(u.hostname.replace(/^www\./, ''))) u.search = '';
    u.hash = '';
    return u.toString();
  } catch { return String(t).trim(); }
};

function Receta({ r }) {
  const rec = r.receta || {};
  const Fila = ({ titulo, children }) => (children ? (
    <div className="mb-2">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
      <div className="text-sm text-slate-800">{children}</div>
    </div>
  ) : null);
  return (
    <div>
      <Fila titulo="Para qué piezas">{rec.para_que_piezas}</Fila>
      <Fila titulo="Escenario">{rec.escenario}</Fila>
      <Fila titulo="Ritmo">{rec.ritmo}</Fila>
      <Fila titulo="Cómo engancha">{rec.apertura}</Fila>
      {rec.voz && (
        <Fila titulo={`Voz${rec.voz.hay ? ` · ${rec.voz.tono || ''}` : ''}`}>
          {rec.voz.hay && Array.isArray(rec.voz.estructura)
            ? <ol className="list-decimal pl-5">{rec.voz.estructura.map((e, i) => <li key={i}>{e}</li>)}</ol>
            : 'Sin voz: solo música.'}
        </Fila>
      )}
      <Fila titulo="Texto en pantalla">{rec.texto_en_pantalla}</Fila>
      <Fila titulo="Música">{rec.musica}</Fila>
      {Array.isArray(rec.tomas) && rec.tomas.length > 0 && (
        <Fila titulo={`Tomas (${rec.tomas.length})`}>
          <ul className="space-y-1">
            {rec.tomas.map((t, i) => (
              <li key={i} className="text-xs">
                <span className="font-mono text-slate-500">{t.seg}s</span>{' '}
                {t.que_se_ve}
                {t.movimiento && <span className="text-slate-500"> · {t.movimiento}</span>}
                {t.texto && <span className="text-purple-700"> · «{t.texto}»</span>}
              </li>
            ))}
          </ul>
        </Fila>
      )}
      <Fila titulo="Cómo cierra">{rec.cierre}</Fila>
      {Array.isArray(rec.lo_que_lo_hace_funcionar) && (
        <Fila titulo="Lo que lo hace funcionar">
          <ul className="list-disc pl-5">{rec.lo_que_lo_hace_funcionar.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Fila>
      )}
      {Array.isArray(rec.no_copiar) && (
        <Fila titulo="No se copia">{rec.no_copiar.join(' · ')}</Fila>
      )}
      {rec.voz_original && (
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer">Lo que dice su voz (para referencia, no se copia)</summary>
          <p className="mt-1 italic">{rec.voz_original}</p>
        </details>
      )}
    </div>
  );
}

export function ReelsModelo() {
  const { tenantId } = useAuth();
  const { toast } = useToast();
  const [reels, setReels] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [enlace, setEnlace] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [nota, setNota] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.from('equipo_reels_modelo')
      .select('id, url, estado, formato, titulo, duracion, miniatura, receta, nota_dueno, error, created_at')
      .order('created_at', { ascending: true });
    setCargando(false);
    if (!error) setReels(data || []);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Mientras haya alguno en cola, se mira cada 20 s: el Creativo los estudia
  // de a uno y conviene verlos aparecer sin recargar.
  const enCola = reels.some((r) => r.estado === 'pendiente' || r.estado === 'estudiando');
  useEffect(() => {
    if (!enCola) return undefined;
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [enCola, cargar]);

  const anadir = async () => {
    const url = limpiarEnlace(enlace);
    if (!esEnlace(url)) {
      toast({ variant: 'destructive', title: 'Ese enlace no sirve', description: 'Pega el enlace de un reel de Instagram, TikTok, YouTube o Facebook.' });
      return;
    }
    setOcupado(true);
    const { error } = await supabase.from('equipo_reels_modelo')
      .insert({ tenant_id: tenantId, url }).select('id');
    setOcupado(false);
    if (error) {
      toast({ variant: 'destructive', title: 'No se añadió',
        description: /duplicate|unique/i.test(error.message) ? 'Ese reel ya está en la lista.' : error.message });
      return;
    }
    setEnlace('');
    toast({ title: 'Reel añadido', description: 'El Creativo lo estudia en uno o dos minutos (la PC tiene que estar encendida).' });
    cargar();
  };

  const quitar = async (r) => {
    if (!window.confirm('¿Quitar este reel modelo? El Creativo dejará de usar su formato.')) return;
    const { data, error } = await supabase.from('equipo_reels_modelo').delete().eq('id', r.id).select('id');
    if (error || !data?.length) {
      toast({ variant: 'destructive', title: 'No se pudo quitar', description: error?.message || 'La base no dejó borrarlo.' });
      return;
    }
    setAbierto(null);
    cargar();
  };

  const abrir = (r) => { setAbierto(r); setNota(r.nota_dueno || ''); };

  // Guardar la nota y, si se pide, volver a estudiarlo con ella delante.
  const guardarNota = async (reestudiar) => {
    const cambios = { nota_dueno: nota.trim() || null,
      ...(reestudiar ? { estado: 'pendiente', intentos: 0, error: null } : {}) };
    const { data, error } = await supabase.from('equipo_reels_modelo')
      .update(cambios).eq('id', abierto.id).select('id');
    if (error || !data?.length) {
      toast({ variant: 'destructive', title: 'No se guardó', description: error?.message || 'La base no dejó cambiarlo.' });
      return;
    }
    toast({ title: reestudiar ? 'Lo vuelve a estudiar con tu nota' : 'Nota guardada' });
    setAbierto(null);
    cargar();
  };

  const listos = reels.filter((r) => r.estado === 'listo');
  const formatos = new Set(listos.map((r) => r.formato));

  return (
    <details className="mb-4 rounded-xl border bg-white shadow-sm">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-bold text-slate-800">
        <Clapperboard className="h-4 w-4 text-red-600" />
        Estilo de tus reels
        <span className="font-normal text-slate-500">
          · {cargando && !reels.length ? 'cargando…'
            : `${reels.length} reel(s) modelo · ${formatos.size} formato(s)`}
          {enCola ? ' · estudiando…' : ''} · el Creativo imita su receta, no su contenido
        </span>
      </summary>
      <div className="border-t px-4 py-3">
        <p className="mb-3 text-xs text-slate-500">
          Pega el enlace de un reel que te guste (Instagram, TikTok, YouTube). El Creativo lo estudia en la PC y
          escribe su receta: formato, tomas, guion, letras y música. Al hacer tus reels rota entre los formatos para
          que no salgan todos iguales. Nunca copia su producto, su marca ni sus frases.
        </p>

        <div className="mb-3 flex gap-2">
          <input
            value={enlace}
            onChange={(e) => setEnlace(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && anadir()}
            placeholder="https://www.instagram.com/reel/…"
            className="h-9 flex-1 rounded-md border px-3 text-sm"
          />
          <Button type="button" size="sm" onClick={anadir} disabled={ocupado || !enlace.trim()}>
            {ocupado ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            Añadir reel
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          {reels.map((r) => {
            const f = FORMATOS_REEL[r.formato] || null;
            return (
              <button key={r.id} type="button" onClick={() => abrir(r)}
                title={r.titulo || r.url}
                className="relative h-48 w-28 overflow-hidden rounded-lg border bg-slate-900 text-left hover:ring-2 hover:ring-red-400">
                {r.miniatura
                  ? <img src={r.miniatura} alt={r.titulo || 'reel'} className="h-full w-full object-cover opacity-90" />
                  : <span className="flex h-full items-center justify-center text-slate-500"><Clapperboard className="h-6 w-6" /></span>}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 pt-6">
                  {r.estado === 'listo' && f ? (
                    <span className={`inline-block rounded px-1 text-[9px] font-bold ${f.color}`}>{f.nombre}</span>
                  ) : (
                    <span className={`flex items-center gap-1 text-[9px] font-semibold ${r.estado === 'error' ? 'text-red-300' : 'text-white'}`}>
                      {r.estado === 'estudiando' && <Loader2 className="h-3 w-3 animate-spin" />}
                      {r.estado === 'error' ? 'No se pudo estudiar' : r.estado === 'estudiando' ? 'Estudiando…' : 'En cola'}
                    </span>
                  )}
                  {r.duracion && <span className="ml-1 text-[9px] text-slate-300">{Math.round(r.duracion)} s</span>}
                </span>
              </button>
            );
          })}
        </div>

        {!reels.length && !cargando && (
          <p className="mt-3 text-xs text-amber-700">Sin reels modelo todavía. Pega el enlace del primero arriba.</p>
        )}
      </div>

      <Dialog open={!!abierto} onOpenChange={(v) => !v && setAbierto(null)}>
        <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
          {abierto && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {abierto.titulo || 'Reel modelo'}
                </DialogTitle>
              </DialogHeader>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                {abierto.formato && FORMATOS_REEL[abierto.formato] && (
                  <span className={`rounded px-1.5 py-0.5 font-bold ${FORMATOS_REEL[abierto.formato].color}`}>
                    {FORMATOS_REEL[abierto.formato].nombre}
                  </span>
                )}
                {abierto.duracion && <span className="text-slate-500">{Math.round(abierto.duracion)} segundos</span>}
                <a href={abierto.url} target="_blank" rel="noreferrer"
                  className="ml-auto flex items-center gap-1 text-sky-700 hover:underline">
                  Ver el reel <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {abierto.estado === 'listo'
                ? <Receta r={abierto} />
                : <p className="mb-3 text-sm text-slate-600">
                    {ESTADO[abierto.estado]}{abierto.error ? `: ${abierto.error}` : ''}
                  </p>}

              <div className="mt-3 border-t pt-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Tu nota</p>
                <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2}
                  placeholder="Ej.: lo que me gusta es el humo y la mano; la voz no, es muy lenta." />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => guardarNota(false)}>Guardar nota</Button>
                  <Button size="sm" variant="outline" onClick={() => guardarNota(true)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Volver a estudiarlo con mi nota
                  </Button>
                  <Button size="sm" variant="outline" className="ml-auto border-red-200 text-red-700" onClick={() => quitar(abierto)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Quitar
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </details>
  );
}
