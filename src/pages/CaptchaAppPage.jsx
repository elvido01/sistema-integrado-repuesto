// =====================================================================
// /captcha-app — el "no soy un robot" para el registro desde la app
// ---------------------------------------------------------------------
// (19/11/2026) La app registra empresas igual que la web (decisión del
// dueño). El captcha de Cloudflare solo funciona en una página web de un
// dominio permitido, así que la app abre esta página en el navegador del
// teléfono (WebBrowser.openAuthSessionAsync) y aquí, al pasar la
// verificación, se vuelve a la app con el token:  <vuelta>?token=…
// La vuelta solo puede ser un enlace de la app (no una web cualquiera), para
// que nadie use esta página para mandar tokens a otro sitio.
// =====================================================================
import React, { useMemo, useState } from 'react';
import CaptchaTurnstile from '@/components/common/CaptchaTurnstile';
import MotoFlowLogo from '@/components/common/MotoFlowLogo';

// Solo la pantalla de registro de la app instalada (esquema "mobile", el de
// app.json). Nada de exp:// (Expo de desarrollo) ni otras rutas.
export const vueltaValida = (v) => typeof v === 'string' && /^mobile:\/\/\/?registro$/.test(v);

export default function CaptchaAppPage() {
  const vuelta = useMemo(() => new URLSearchParams(window.location.search).get('vuelta'), []);
  const [enlace, setEnlace] = useState('');

  const alToken = (token) => {
    if (!token || !vueltaValida(vuelta)) return;
    const url = `${vuelta}?token=${encodeURIComponent(token)}`;
    setEnlace(url);
    // Intento automático; si el navegador lo frena (sin toque del usuario),
    // queda el botón "Volver a la app".
    window.location.href = url;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#2563eb] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="mb-3 flex justify-center"><MotoFlowLogo size="md" showSlogan={false} /></div>
        {!vueltaValida(vuelta) ? (
          <p className="text-sm text-gray-600">Abre esta página desde la app MotoFlow.</p>
        ) : enlace ? (
          <>
            <p className="mb-4 text-sm font-bold text-emerald-700">Listo, verificado.</p>
            <a href={enlace} className="block w-full rounded-lg bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700">
              Volver a la app
            </a>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-lg font-bold text-gray-800">Verificación</h1>
            <p className="mb-4 text-xs text-gray-500">Un momento: comprobamos que no eres un robot y vuelves a la app.</p>
            <div className="flex justify-center"><CaptchaTurnstile onToken={alToken} /></div>
          </>
        )}
      </div>
    </div>
  );
}
