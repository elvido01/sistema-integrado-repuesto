import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

// El borrador que entrega el Comercial-Creativo, legible.
//
// Antes se pintaba con JSON.stringify: el copy quedaba escondido entre llaves
// y la foto —que viaja como URL dentro del texto de los requisitos— no se veía.
// Aprobar algo que no se puede leer es firmar a ciegas.
//
// El JSON sigue estando, detrás de un botón: cuando algo no cuadra, hay que
// poder mirar el dato crudo.

const CANALES = {
  whatsapp: { nombre: 'WhatsApp', color: 'bg-emerald-100 text-emerald-800' },
  facebook: { nombre: 'Facebook', color: 'bg-blue-100 text-blue-800' },
  instagram: { nombre: 'Instagram', color: 'bg-pink-100 text-pink-800' },
  tiktok: { nombre: 'TikTok', color: 'bg-slate-200 text-slate-800' },
};

// La foto llega como URL suelta dentro de una frase ("usar tal cual la foto
// entregada: https://…"). Se busca en todo el contenido en vez de exigir que
// venga en un campo con nombre: el creativo escribe en prosa, no en formulario.
function fotoDe(contenido) {
  try {
    const texto = JSON.stringify(contenido || {});
    const m = texto.match(/https?:\/\/[^\s"']+\.(?:png|jpe?g|webp)/i);
    return m ? m[0] : null;
  } catch {
    return null;
  }
}

export function BorradorPromocion({ contenido, aprobacionId, onGuardado }) {
  const [crudo, setCrudo] = useState(false);
  const [arte, setArte] = useState(null);
  // El texto lo escribe el dueño. Hasta ahora solo podía aprobar o rechazar
  // el del creativo: cambiar una palabra costaba una ronda entera con el
  // agente. Es su negocio y su voz.
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState('');

  // La pieza montada vive en la base (bytes), no en una URL: el creativo la
  // guarda por el mismo carril que las imágenes de Hermes, sin llaves de
  // Storage repartidas. Se pide por su id.
  const arteId = contenido && typeof contenido === 'object' ? contenido.arte_imagen_id : null;
  useEffect(() => {
    if (!arteId) { setArte(null); return undefined; }
    let vivo = true;
    supabase.rpc('hermes_imagen_ver', { p_imagen_id: arteId }).then(({ data, error }) => {
      if (!vivo || error || !data?.ok) return;
      setArte(`data:${data.mime_type};base64,${data.b64}`);
    });
    return () => { vivo = false; };
  }, [arteId]);

  if (!contenido || typeof contenido !== 'object') return null;

  const { copy, propuesta, advertencias, requerimientos_visuales: requisitos,
          canal_sugerido: canal } = contenido;

  const guardar = async () => {
    setGuardando(true);
    setFallo('');
    const { error } = await supabase.rpc('equipo_aprobacion_editar', {
      p_aprobacion_id: aprobacionId, p_copy: borrador,
    });
    setGuardando(false);
    if (error) { setFallo(error.message); return; }
    setEditando(false);
    if (onGuardado) onGuardado();
  };
  // Si hay pieza montada, esa manda: la foto suelta del producto era el
  // material de partida, no el entregable.
  const foto = arte || fotoDe(contenido);

  return (
    <div className="mb-2 space-y-2">
      {foto && (
        <a href={foto} target="_blank" rel="noreferrer"
          className="block overflow-hidden rounded-lg border border-slate-200 bg-white">
          <img src={foto} alt="Foto del producto"
            className="mx-auto max-h-44 w-auto object-contain" />
        </a>
      )}

      {propuesta && (
        <p className="rounded bg-white/70 p-2 text-[11px] leading-snug text-slate-700">{propuesta}</p>
      )}

      {copy && typeof copy === 'object' && Object.entries(editando ? borrador : copy).map(([canalId, texto]) => {
        const c = CANALES[canalId] || { nombre: canalId, color: 'bg-slate-100 text-slate-700' };
        return (
          <div key={canalId} className="rounded bg-white p-2">
            <span className={`mb-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${c.color}`}>
              {c.nombre}
            </span>
            {editando ? (
              <textarea
                value={typeof texto === 'string' ? texto : JSON.stringify(texto)}
                onChange={(e) => setBorrador((s) => ({ ...s, [canalId]: e.target.value }))}
                rows={3}
                className="w-full rounded border border-slate-300 p-1.5 text-[11px] leading-snug text-slate-800"
              />
            ) : (
              <p className="text-[11px] leading-snug text-slate-800">
                {typeof texto === 'string' ? texto : JSON.stringify(texto)}
              </p>
            )}
          </div>
        );
      })}

      {/* Solo donde hay una aprobación viva que reescribir. En el historial
          el texto se lee, no se toca. */}
      {aprobacionId && copy && typeof copy === 'object' && (
        <div className="flex flex-wrap items-center gap-2">
          {editando ? (
            <>
              <button type="button" disabled={guardando} onClick={guardar}
                className="rounded bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar mis textos'}
              </button>
              <button type="button" disabled={guardando}
                onClick={() => { setEditando(false); setFallo(''); }}
                className="text-[10px] font-semibold text-slate-500 hover:underline disabled:opacity-50">
                dejarlo como estaba
              </button>
            </>
          ) : (
            <button type="button"
              onClick={() => { setBorrador({ ...copy }); setEditando(true); }}
              className="text-[10px] font-semibold text-violet-600 hover:underline">
              escribir yo el título y la descripción
            </button>
          )}
          {contenido.copy_editado_por_el_dueno && !editando && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
              texto tuyo
            </span>
          )}
          {fallo && <span className="text-[10px] text-red-600">{fallo}</span>}
        </div>
      )}

      {canal && (
        <p className="text-[10px] text-slate-500">Canal sugerido: <b>{canal}</b></p>
      )}

      {/* Las advertencias las escribe el creativo por su cuenta y son lo más
          valioso del borrador: es donde dice qué NO pudo verificar. */}
      {Array.isArray(advertencias) && advertencias.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 p-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
            Míralo antes de aprobar
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {advertencias.map((a, i) => (
              <li key={i} className="text-[11px] leading-snug text-amber-900">{a}</li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(requisitos) && requisitos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {requisitos.map((r, i) => (
            <li key={i} className="text-[10px] leading-snug text-slate-500">{r}</li>
          ))}
        </ul>
      )}

      <button type="button" onClick={() => setCrudo((v) => !v)}
        className="text-[10px] font-semibold text-violet-600 hover:underline">
        {crudo ? 'ocultar el detalle técnico' : 'ver el detalle técnico'}
      </button>
      {crudo && (
        <pre className="max-h-40 overflow-auto rounded bg-white p-2 text-[10px] text-slate-700">
          {JSON.stringify(contenido, null, 1)}
        </pre>
      )}
    </div>
  );
}

export default BorradorPromocion;
