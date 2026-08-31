import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

// La imagen que manda Hermes.
//
// No viaja por el Storage: vive en la base (public.hermes_imagenes) y llega en
// base64 por `hermes_imagen_ver`. Es a propósito — Hermes entra como rol de
// base de datos, sin sesión, y las políticas del Storage exigen una. Darle una
// llave de subida para un borrador ocasional salía mucho más caro que guardar
// los dos megas donde ya sabe escribir.
//
// Por eso tampoco hay URL firmada que caduque: mientras la fila exista y sea
// de tu empresa, la imagen se ve.
export function ImagenHermes({ imagenId }) {
  const [src, setSrc] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [ampliada, setAmpliada] = useState(false);

  useEffect(() => {
    if (!imagenId) return undefined;
    let vivo = true;
    setSrc(null);
    setFallo(null);

    supabase.rpc('hermes_imagen_ver', { p_imagen_id: imagenId })
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { setFallo(error.message); return; }
        if (!data?.ok) { setFallo(data?.motivo === 'no_disponible' ? 'ya no está' : 'no se pudo abrir'); return; }
        setSrc(`data:${data.mime_type};base64,${data.b64}`);
      });

    return () => { vivo = false; };
  }, [imagenId]);

  // Que no se cierre con Escape sería una trampa: la ampliada tapa el chat
  // entero y el único otro modo de salir es acertarle al fondo.
  useEffect(() => {
    if (!ampliada) return undefined;
    const salir = (e) => { if (e.key === 'Escape') setAmpliada(false); };
    window.addEventListener('keydown', salir);
    return () => window.removeEventListener('keydown', salir);
  }, [ampliada]);

  if (fallo) {
    return <p className="mt-1 text-[10px] text-red-300/70">No pude mostrar la imagen: {fallo}</p>;
  }
  if (!src) {
    return <p className="mt-1 text-[10px] text-cyan-200/40">cargando imagen…</p>;
  }

  return (
    <>
      <button type="button" onClick={() => setAmpliada(true)}
        className="mt-1 block overflow-hidden rounded-lg border border-cyan-400/25 transition hover:border-cyan-300/60"
        title="Ampliar">
        <img src={src} alt="Imagen de Hermes" className="max-h-64 w-auto max-w-full object-contain" />
      </button>

      {ampliada && (
        <div role="presentation" onClick={() => setAmpliada(false)}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4">
          <img src={src} alt="Imagen de Hermes"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl" />
          <a href={src} download="hermes.png"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-4 rounded-md bg-cyan-500/90 px-3 py-1.5 text-xs font-bold text-slate-900">
            Descargar
          </a>
        </div>
      )}
    </>
  );
}


// La foto de un borrador llega como URL dentro del texto (el creativo escribe
// en prosa, no en formulario). Se pesca para poder pintarla en la burbuja en
// vez de dejar un enlace largo que nadie pincha desde el teléfono.
export function urlDeImagenEnTexto(texto) {
  if (typeof texto !== 'string') return null;
  const m = texto.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp)/i);
  return m ? m[0] : null;
}

export function ImagenPorUrl({ url }) {
  const [ampliada, setAmpliada] = React.useState(false);
  if (!url) return null;
  return (
    <>
      <button type="button" onClick={() => setAmpliada(true)}
        className="mt-1 block overflow-hidden rounded-lg border border-cyan-400/25 bg-white/5 transition hover:border-cyan-300/60"
        title="Ampliar">
        <img src={url} alt="Imagen del borrador" className="max-h-56 w-auto max-w-full object-contain" />
      </button>
      {ampliada && (
        <div role="presentation" onClick={() => setAmpliada(false)}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4">
          <img src={url} alt="Imagen del borrador" onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[92vw] rounded-lg object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}

export default ImagenHermes;
