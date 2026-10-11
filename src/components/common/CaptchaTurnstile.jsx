// ============================================================
// CaptchaTurnstile — "no soy un robot" de Cloudflare (gratis)
// ============================================================
// (11/10/2026) Para /registro. Casi siempre pasa solo, sin que la persona
// marque nada. Entrega un token de un solo uso que la función
// registrar-empresa comprueba en el servidor; si el registro falla, el
// formulario cambia `reiniciar` para pedir un token nuevo.
// La clave del sitio es pública (va en la página); la secreta vive en el
// secreto TURNSTILE_SECRET de Supabase.
// ============================================================
import React, { useEffect, useRef } from 'react';

export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

let cargando = null;
function cargarScript() {
  if (window.turnstile) return Promise.resolve();
  if (!cargando) {
    cargando = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => ok();
      s.onerror = () => { cargando = null; mal(new Error('No cargó la verificación')); };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

export default function CaptchaTurnstile({ onToken, reiniciar = 0 }) {
  const caja = useRef(null);
  const widget = useRef(null);

  useEffect(() => {
    let vivo = true;
    cargarScript().then(() => {
      if (!vivo || !caja.current || widget.current !== null) return;
      widget.current = window.turnstile.render(caja.current, {
        sitekey: TURNSTILE_SITE_KEY,
        language: 'es',
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    }).catch(() => onToken(''));
    return () => {
      vivo = false;
      if (widget.current !== null && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (reiniciar && widget.current !== null && window.turnstile) {
      onToken('');
      window.turnstile.reset(widget.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reiniciar]);

  return <div ref={caja} className="flex justify-center min-h-[65px]" />;
}
