import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL?.trim();
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!url || !anon) {
  throw new Error(`[Supabase] Faltan variables de entorno.
Asegúrate de tener un archivo .env.local en la raíz del proyecto con:
VITE_SUPABASE_URL="https://TU_PROJECT_REF.supabase.co"
VITE_SUPABASE_ANON_KEY="TU_ANON_PUBLIC_KEY"

Después de crear el archivo, reinicia el servidor de desarrollo de Vite.`);
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export async function checkSupabaseHealth() {
  if (!url) return { ok: false, error: 'VITE_SUPABASE_URL no está definida.' };
  try {
    const res = await fetch(`${url}/auth/v1/health`);
    return { ok: res.ok, status: res.status, statusText: res.statusText };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}