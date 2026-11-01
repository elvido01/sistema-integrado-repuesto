// ════════════════════════════════════════════════════════════════════════
//  TikTok: cómo sale el video (01/11/2026)
// ════════════════════════════════════════════════════════════════════════
//  Dos modos:
//   · "A mi bandeja": como siempre, el video llega de borrador al teléfono.
//   · "Publicar directo": video.publish. Para pasar la auditoría de TikTok la
//     pantalla TIENE que (guía de Content Sharing de TikTok):
//       - mostrar la cuenta (nombre y foto) que da creator_info,
//       - dejar elegir a quién se muestra SIN valor marcado de antemano y solo
//         con las opciones que da creator_info,
//       - interruptores de comentarios, dúo y stitch apagados de inicio y
//         bloqueados si la cuenta los tiene apagados,
//       - el aviso de contenido comercial (tu marca / contenido de marca) con
//         su etiqueta, y "solo yo" bloqueado para contenido de marca,
//       - el aviso de música (y de contenido de marca) antes de publicar,
//       - no dejar publicar un video más largo de lo que la cuenta admite.
//  El servidor vuelve a validar lo mismo (tiktok.mjs, promo_crear).
// ════════════════════════════════════════════════════════════════════════
import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Loader2, RefreshCw } from 'lucide-react';

export const OPCIONES_TIKTOK_INICIALES = {
  modo: 'bandeja',
  privacy_level: '',
  comentarios: false,
  duo: false,
  stitch: false,
  comercial: false,
  tu_marca: false,
  contenido_de_marca: false,
};

const NOMBRE_PRIVACIDAD = {
  PUBLIC_TO_EVERYONE: 'Todo el mundo',
  MUTUAL_FOLLOW_FRIENDS: 'Amigos (se siguen mutuamente)',
  FOLLOWER_OF_CREATOR: 'Mis seguidores',
  SELF_ONLY: 'Solo yo',
};

const URL_MUSICA = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const URL_MARCA = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

const num = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString('es-DO'));

export default function TikTokOpciones({ opciones, onChange, video, onProblema }) {
  const [creador, setCreador] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [duracion, setDuracion] = useState(null);
  const [videos, setVideos] = useState(null);
  const [cargandoVideos, setCargandoVideos] = useState(false);

  const cambiar = (parcial) => onChange({ ...opciones, ...parcial });
  const directo = opciones.modo === 'directo';

  // TikTok pide consultar creator_info cada vez que se va a publicar directo.
  const leerCreador = async () => {
    setCargando(true); setError('');
    try {
      const { data, error: e } = await supabase.functions.invoke('tiktok-cuenta', { body: { accion: 'creador' } });
      if (e) throw e;
      if (!data?.ok) throw new Error(data?.error || 'TikTok no respondió.');
      setCreador(data);
      // Una opción que la cuenta ya no admite no puede quedar elegida.
      if (opciones.privacy_level && !data.privacidades.includes(opciones.privacy_level)) cambiar({ privacy_level: '' });
    } catch (e) {
      setCreador(null);
      setError(e?.message || String(e));
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { if (directo) leerCreador(); }, [directo]); // eslint-disable-line react-hooks/exhaustive-deps

  const leerVideos = async () => {
    setCargandoVideos(true);
    try {
      const { data, error: e } = await supabase.functions.invoke('tiktok-cuenta', { body: { accion: 'videos' } });
      if (e) throw e;
      if (!data?.ok) throw new Error(data?.error || 'TikTok no respondió.');
      setVideos(data.videos || []);
    } catch (e) {
      setVideos({ error: e?.message || String(e) });
    } finally {
      setCargandoVideos(false);
    }
  };

  const problema = useMemo(() => {
    if (!directo) return null;
    if (cargando) return 'Esperando los datos de tu cuenta de TikTok.';
    if (!creador) return error ? `TikTok: ${error}` : 'Faltan los datos de tu cuenta de TikTok.';
    if (!opciones.privacy_level) return 'Elige a quién se muestra el video en TikTok.';
    if (opciones.comercial && !opciones.tu_marca && !opciones.contenido_de_marca) {
      return 'TikTok: indica si el contenido comercial es de tu marca o de marca de terceros.';
    }
    if (opciones.contenido_de_marca && opciones.privacy_level === 'SELF_ONLY') {
      return 'TikTok: el contenido de marca no puede ser "Solo yo".';
    }
    if (creador.max_segundos && duracion && duracion > creador.max_segundos) {
      return `TikTok: el video dura ${Math.round(duracion)} s y tu cuenta admite hasta ${creador.max_segundos} s.`;
    }
    return null;
  }, [directo, cargando, creador, error, opciones, duracion]);
  useEffect(() => { onProblema?.(problema); }, [problema, onProblema]);

  const interruptor = (clave, etiqueta, bloqueado) => (
    <label className={`flex items-center gap-1 ${bloqueado ? 'text-zinc-400' : ''}`}
      title={bloqueado ? 'Tu cuenta de TikTok lo tiene apagado' : undefined}>
      <input type="checkbox" disabled={bloqueado} checked={!bloqueado && !!opciones[clave]}
        onChange={(e) => cambiar({ [clave]: e.target.checked })} />
      {etiqueta}
    </label>
  );

  return (
    <div className="mt-2 rounded border border-fuchsia-200 bg-fuchsia-50/40 p-2 text-[11px]">
      <div className="mb-1 font-bold text-fuchsia-900">TikTok: ¿cómo sale?</div>
      <div className="mb-2 flex flex-wrap gap-3">
        <label className="flex items-center gap-1">
          <input type="radio" name="tiktok-modo" checked={!directo} onChange={() => cambiar({ modo: 'bandeja' })} />
          A mi bandeja (lo publico yo desde el teléfono)
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="tiktok-modo" checked={directo} onChange={() => cambiar({ modo: 'directo' })} />
          Publicar directo
        </label>
      </div>

      {directo && (
        <div className="space-y-2">
          {/* La cuenta: TikTok exige que se vea a dónde va. */}
          <div className="flex items-center gap-2">
            {cargando && <Loader2 className="h-4 w-4 animate-spin text-fuchsia-700" />}
            {creador && (
              <>
                {creador.avatar && <img src={creador.avatar} alt="" className="h-7 w-7 rounded-full" />}
                <span>Se publica en <b>{creador.nombre || creador.usuario}</b>{creador.usuario ? ` (@${creador.usuario})` : ''}</span>
              </>
            )}
            {error && <span className="text-red-700">{error}</span>}
            <button type="button" onClick={leerCreador} className="ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5"
              title="Volver a leer la cuenta">
              <RefreshCw className="h-3 w-3" /> Actualizar
            </button>
          </div>

          {creador && (
            <>
              <label className="flex flex-wrap items-center gap-2">
                <b>¿Quién puede verlo?</b>
                <select className="rounded border px-1.5 py-0.5" value={opciones.privacy_level}
                  onChange={(e) => cambiar({ privacy_level: e.target.value })}>
                  <option value="" disabled>Elegir…</option>
                  {creador.privacidades.map((p) => (
                    <option key={p} value={p} disabled={p === 'SELF_ONLY' && opciones.contenido_de_marca}>
                      {NOMBRE_PRIVACIDAD[p] || p}
                      {p === 'SELF_ONLY' && opciones.contenido_de_marca ? ' (no disponible con contenido de marca)' : ''}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-3">
                <span className="font-semibold">Permitir:</span>
                {interruptor('comentarios', 'Comentarios', creador.sin_comentarios)}
                {interruptor('duo', 'Dúo', creador.sin_duo)}
                {interruptor('stitch', 'Stitch', creador.sin_stitch)}
              </div>

              {/* Aviso de contenido comercial */}
              <div className="rounded border border-slate-200 bg-white p-1.5">
                <label className="flex items-center gap-1 font-semibold">
                  <input type="checkbox" checked={opciones.comercial}
                    onChange={(e) => cambiar({ comercial: e.target.checked, tu_marca: false, contenido_de_marca: false })} />
                  Revelar contenido comercial
                </label>
                <div className="ml-5 text-slate-500">Indica si este video promociona un producto, servicio o marca.</div>
                {opciones.comercial && (
                  <div className="ml-5 mt-1 space-y-1">
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={opciones.tu_marca} onChange={(e) => cambiar({ tu_marca: e.target.checked })} />
                      Tu marca (promocionas tu propio negocio)
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={opciones.contenido_de_marca}
                        onChange={(e) => cambiar({
                          contenido_de_marca: e.target.checked,
                          ...(e.target.checked && opciones.privacy_level === 'SELF_ONLY' ? { privacy_level: '' } : {}),
                        })} />
                      Contenido de marca (promocionas a un tercero a cambio de algo)
                    </label>
                    {(opciones.tu_marca || opciones.contenido_de_marca) && (
                      <div className="text-fuchsia-900">
                        Tu video se etiquetará como “{opciones.contenido_de_marca ? 'Colaboración pagada' : 'Contenido promocional'}”.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {creador.max_segundos && (
                <div className="text-slate-500">
                  Tu cuenta admite videos de hasta {creador.max_segundos} s
                  {duracion ? ` · este dura ${Math.round(duracion)} s` : ''}.
                </div>
              )}

              <div className="text-slate-600">
                Al publicar, aceptas{' '}
                {opciones.contenido_de_marca && (
                  <>la <a href={URL_MARCA} target="_blank" rel="noreferrer" className="underline">Política de contenido de marca</a> y </>
                )}
                la <a href={URL_MUSICA} target="_blank" rel="noreferrer" className="underline">Confirmación de uso de música</a> de TikTok.
                {' '}Después de publicar, TikTok puede tardar unos minutos en procesar el video.
              </div>
            </>
          )}
        </div>
      )}

      {/* La duración del video, para compararla con lo que admite la cuenta. */}
      {video && (
        <video src={video} preload="metadata" className="hidden"
          onLoadedMetadata={(e) => setDuracion(Number(e.currentTarget.duration) || null)} />
      )}

      {/* Los números de los últimos videos (video.list). */}
      <div className="mt-2 border-t border-fuchsia-100 pt-1">
        <button type="button" onClick={leerVideos} disabled={cargandoVideos}
          className="inline-flex items-center gap-1 font-semibold text-fuchsia-900 underline">
          {cargandoVideos && <Loader2 className="h-3 w-3 animate-spin" />}
          Ver mis últimos videos de TikTok y sus números
        </button>
        {Array.isArray(videos) && (
          videos.length === 0 ? <div className="text-slate-500">TikTok no devolvió videos.</div> : (
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {videos.map((v) => (
                <a key={v.id} href={v.enlace || undefined} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 rounded border border-slate-200 bg-white p-1 hover:bg-slate-50">
                  {v.portada && <img src={v.portada} alt="" className="h-12 w-9 rounded object-cover" />}
                  <div className="min-w-0">
                    <div className="truncate">{v.titulo || '(sin texto)'}</div>
                    <div className="text-slate-600">
                      <b>{num(v.vistas)}</b> vistas · <b>{num(v.me_gusta)}</b> me gusta · <b>{num(v.comentarios)}</b> coment. · <b>{num(v.compartidos)}</b> compart.
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )
        )}
        {videos && !Array.isArray(videos) && <div className="text-red-700">{videos.error}</div>}
      </div>
    </div>
  );
}
