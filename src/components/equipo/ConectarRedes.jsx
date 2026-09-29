import React, { useState } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { Button } from '@/components/ui/button';

// Opens consent separately so the promotion being edited is never discarded.
export default function ConectarRedes() {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const conectar = async (platform) => {
    const popup = window.open('about:blank', '_blank');
    if (!popup) { setMessage('Permite abrir una ventana para autorizar tu cuenta.'); return; }
    popup.opener = null;
    setBusy(platform);
    setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('social-oauth/start', { body: { platform } });
      if (error || !data?.url) {
        let detail = data?.error;
        try { detail ||= (await error?.context?.json())?.error; } catch { /* no JSON */ }
        throw new Error(detail || 'No se pudo iniciar la conexión.');
      }
      const url = new URL(data.url);
      const host = platform === 'youtube' ? 'accounts.google.com' : 'www.tiktok.com';
      if (url.protocol !== 'https:' || url.hostname !== host) throw new Error('Dirección de autorización no válida.');
      popup.location.replace(url.href);
      setMessage('Completa la autorización en la ventana nueva. Conectar no publica ni habilita automáticamente la red.');
    } catch (e) {
      popup.close();
      setMessage(e.message);
    } finally { setBusy(''); }
  };
  return <div className="mb-3 text-xs">
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => conectar('youtube')}>
        {busy === 'youtube' ? 'Abriendo…' : 'Conectar YouTube'}
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={!!busy} onClick={() => conectar('tiktok')}>
        {busy === 'tiktok' ? 'Abriendo…' : 'Conectar TikTok'}
      </Button>
      <span className="text-slate-500">Autoriza tu cuenta sin salir de esta promoción.</span>
    </div>
    {message && <p role="status" className="mt-2 text-slate-700">{message}</p>}
  </div>;
}
