// ============================================================
// leer-comprobante — lee la foto de una factura de GASTO (12/11/2026)
// ------------------------------------------------------------
// Ayudante contable, Fase 2 (sql/ayudante_contable_fase2.sql). La app o la
// web suben la foto al bucket privado "comprobantes" (carpeta de su
// empresa) y llaman aquí con { path }. Devuelve los datos de CABECERA del
// comprobante para el 606: quién lo emitió (RNC), NCF, fecha y montos.
// No guarda nada: quien llama crea la fila en gastos_comprobantes.
//
// Seguridad: la foto se baja con la sesión de quien llama, así que las
// políticas del bucket deciden (cada empresa solo lee su carpeta).
// Motor: Gemini (el mismo de extract-purchase-from-image); si no responde,
// OpenAI gpt-4o-mini. Nunca inventa: lo que no se lee va vacío.
// ============================================================
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PROMPT = `Eres un auxiliar contable en República Dominicana. Lee la foto de una factura o ticket de compra y devuelve SOLO este JSON:
{
  "rnc_emisor": "",        // RNC (9 dígitos) o cédula (11) del NEGOCIO QUE VENDE (arriba, junto a su nombre). Solo dígitos.
  "nombre_emisor": "",     // nombre del negocio que vende
  "rnc_cliente": "",       // RNC o cédula del CLIENTE a quien se le facturó, si aparece. Solo dígitos.
  "ncf": "",               // comprobante fiscal: B + 10 dígitos (ej. B0100001234) o e-NCF: E + 12 dígitos (ej. E310000001234)
  "fecha": "",             // fecha de la factura, formato YYYY-MM-DD
  "monto_gravado": 0,      // subtotal gravado con ITBIS, SIN el ITBIS
  "monto_exento": 0,       // subtotal exento de ITBIS
  "itbis": 0,              // ITBIS total facturado
  "propina": 0,            // propina legal (10 %), si aparece
  "total": 0,              // total a pagar
  "forma_pago": "",        // "efectivo", "tarjeta", "transferencia" o "credito"; "" si no se sabe
  "tipo_gasto": "",        // una de: "combustible", "alimentos", "suministros", "servicios", "alquiler", "seguros", "mantenimiento", "otro"
  "legible": true          // false si la foto no deja leer los datos principales
}
REGLAS:
- No inventes ni completes: lo que no se lee con claridad va "" o 0.
- El NCF suele decir "NCF", "e-NCF" o "Comprobante". Copia sus caracteres exactos, sin espacios ni guiones.
- No confundas el RNC del negocio con el del cliente: el del negocio va en el encabezado.
- En República Dominicana las fechas van día/mes/año: 05/11/2026 es 5 de noviembre.
- Montos como número, sin comas de miles ni símbolo. Si solo aparece el total y el ITBIS, monto_gravado = total - itbis - propina - monto_exento.
- Si es un ticket sin NCF, deja "ncf" vacío.`;

function limpiar(r: any) {
  const num = (v: any) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
  const dig = (v: any) => String(v ?? '').replace(/\D/g, '');
  // Fecha REAL (2026-02-30 o 2026-00-00 no lo son): si no, vacía y la pone quien revisa.
  const mf = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(r?.fecha || ''));
  const df = mf ? new Date(Date.UTC(+mf[1], +mf[2] - 1, +mf[3])) : null;
  const fecha = df && df.getUTCFullYear() === +mf[1] && df.getUTCMonth() === +mf[2] - 1 && df.getUTCDate() === +mf[3] ? r.fecha : '';
  const fp = { efectivo: '01', transferencia: '02', cheque: '02', tarjeta: '03', credito: '04' }[String(r?.forma_pago || '').toLowerCase()] || '01';
  // Tipo de bienes y servicios del 606: 02 trabajos/suministros/servicios (por defecto),
  // 03 arrendamientos, 07 gastos financieros, 11 seguros, 05 representación (alimentos).
  const tipo = { alquiler: 3, seguros: 11, alimentos: 5 }[String(r?.tipo_gasto || '').toLowerCase()] || 2;
  return {
    rnc: dig(r?.rnc_emisor), proveedor_nombre: String(r?.nombre_emisor || '').trim().slice(0, 120),
    rnc_cliente: dig(r?.rnc_cliente),
    ncf: String(r?.ncf || '').toUpperCase().replace(/[\s-]/g, ''),
    fecha, monto_gravado: num(r?.monto_gravado), monto_exento: num(r?.monto_exento),
    itbis: num(r?.itbis), propina: num(r?.propina), total: num(r?.total),
    forma_pago: fp, tipo_bs: tipo, tipo_gasto: String(r?.tipo_gasto || ''), legible: r?.legible !== false,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return json({ ok: false, error: 'Sin sesión' }, 401);
    const { path } = await req.json();
    if (!path || typeof path !== 'string' || path.includes('..')) return json({ ok: false, error: 'Falta la ruta de la foto' }, 400);

    // Con la sesión de quien llama: las políticas del bucket deciden si la puede leer.
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: blob, error: eDl } = await supabase.storage.from('comprobantes').download(path);
    if (eDl || !blob) return json({ ok: false, error: `No se pudo leer la foto: ${eDl?.message || 'no existe'}` }, 404);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > 3 * 1024 * 1024) return json({ ok: false, error: 'La foto pesa demasiado' }, 413);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const base64 = btoa(bin);
    const mime = blob.type || 'image/jpeg';

    let leido: any = null, motor = '', ultimo = '';
    const GEMINI = Deno.env.get('GEMINI_API_KEY');
    if (GEMINI) {
      for (const model of ['gemini-2.5-flash', 'gemini-3-flash', 'gemini-flash-latest']) {
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: base64 } }] }],
              generationConfig: { temperature: 0, responseMimeType: 'application/json' },
            }),
          });
          if (r.ok) {
            const d = await r.json();
            const t = (d.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g, '').trim();
            leido = JSON.parse(t); motor = model; break;
          }
          ultimo = `${model} ${r.status}`;
        } catch (e) { ultimo = `${model}: ${e?.message || e}`; }
      }
    }
    const OPENAI = Deno.env.get('OPENAI_API_KEY');
    if (!leido && OPENAI) {
      try {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${OPENAI}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' },
            messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } }] }],
          }),
        });
        if (r.ok) { leido = JSON.parse((await r.json()).choices[0].message.content); motor = 'gpt-4o-mini'; }
        else ultimo = `openai ${r.status}`;
      } catch (e) { ultimo = `openai: ${e?.message || e}`; }
    }
    if (!leido) return json({ ok: false, error: `No se pudo leer la factura (${ultimo || 'sin motor'}). Escriba los datos a mano.` }, 502);

    return json({ ok: true, motor, datos: limpiar(leido) });
  } catch (e) {
    console.error('[leer-comprobante]', e?.message || e);
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
