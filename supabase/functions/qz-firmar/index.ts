// ============================================================
// qz-firmar — firma las solicitudes de QZ Tray en el servidor
// ============================================================
// (10/10/2026) La llave privada del certificado "Repuestos Morla Trust" iba
// dentro de la web (qzTrayService.ts): cualquiera podía sacarla y hacer una
// página que imprimiera en silencio en las PCs que confían en ese
// certificado. Ahora vive en el secreto QZ_PRIVATE_KEY_B64 y solo firma para
// un USUARIO con sesión (la pasarela acepta también la clave pública como
// JWT, por eso se comprueba el usuario aquí).
// Firma: RSASSA-PKCS1-v1_5 + SHA-256 (qz.security.setSignatureAlgorithm("SHA256")).
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

let llave: CryptoKey | null = null;
async function cargarLlave(): Promise<CryptoKey> {
  if (llave) return llave;
  const b64 = Deno.env.get('QZ_PRIVATE_KEY_B64') || '';
  if (!b64) throw new Error('Falta QZ_PRIVATE_KEY_B64');
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  llave = await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return llave;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: { user } = { user: null } } = await sb.auth.getUser(token).catch(() => ({ data: { user: null } }));
  if (!user) return json({ ok: false, error: 'Inicia sesión para imprimir con QZ' }, 401);

  const { mensaje } = await req.json().catch(() => ({}));
  if (typeof mensaje !== 'string' || !mensaje || mensaje.length > 4000) {
    return json({ ok: false, error: 'mensaje inválido' }, 400);
  }
  try {
    const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await cargarLlave(), new TextEncoder().encode(mensaje));
    let bin = '';
    for (const b of new Uint8Array(firma)) bin += String.fromCharCode(b);
    return json({ ok: true, firma: btoa(bin) });
  } catch (e) {
    return json({ ok: false, error: String(e?.message || e).slice(0, 200) }, 500);
  }
});
