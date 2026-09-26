import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.30.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ════════════════════════════════════════════════════════════════════════
//  DOS MOTORES, EN ESTE ORDEN
// ════════════════════════════════════════════════════════════════════════
//  1. Google Vision (DOCUMENT_TEXT_DETECTION) saca el texto y Gemini lo
//     ordena en JSON. Es el camino bueno: Vision lee una factura fotografiada
//     mejor que nadie.
//  2. Si Vision no contesta, la imagen se le manda DIRECTO a Gemini, que lee
//     y ordena de una sola pasada.
//
//  El 26/09/2026 Vision empezó a responder 403 "This API method requires
//  billing to be enabled ... project #48355204741": al proyecto de Google
//  Cloud se le cayó la facturación, y con ella el OCR de todas las compras.
//  Vision exige tarjeta hasta para su millar gratis al mes; la clave de
//  Gemini (AI Studio) no. Con el segundo motor, quedarse sin facturación
//  deja de parar el trabajo: la factura sigue entrando, solo que leída por
//  el otro lado. Cuando se reactive la facturación, Vision vuelve a llevar
//  la voz cantante sin tocar una línea de código.
// ════════════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { image_paths } = await req.json();
        if (!image_paths || !Array.isArray(image_paths) || image_paths.length === 0) {
            throw new Error("Se requiere un array de 'image_paths'.");
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // ── 1. Las imágenes, una sola vez ──────────────────────────────────
        // Se bajan y se pasan a base64 aquí porque las necesitan los dos
        // motores: Vision en su `image.content` y Gemini en su `inline_data`.
        const imagenes: { path: string; base64: string; mime: string }[] = [];

        for (const image_path of image_paths) {
            console.log(`[LOG] Bajando: ${image_path}`);
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('purchases')
                .download(image_path);

            if (downloadError) throw new Error(`Error al descargar imagen: ${image_path}`);

            // A base64 por trozos. El reduce de antes concatenaba un string
            // por BYTE (O(n^2)): con una foto de 3 MB son millones de
            // concatenaciones antes siquiera de llamar a Google.
            const bytes = new Uint8Array(await fileData.arrayBuffer());
            if (!bytes.length) {
                throw new Error(`La imagen ${image_path} llegó vacía del almacenamiento.`);
            }
            // Ni Vision ni Gemini pasan de 20 MB por petición, y base64 infla
            // un 33%.
            if (bytes.length > 15 * 1024 * 1024) {
                throw new Error(`La imagen pesa ${(bytes.length / 1048576).toFixed(1)} MB y Google no acepta más de ~15 MB. Tómala de nuevo con menos resolución.`);
            }
            let binario = '';
            for (let i = 0; i < bytes.length; i += 0x8000) {
                binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            }
            imagenes.push({
                path: image_path,
                base64: btoa(binario),
                mime: fileData.type || 'image/jpeg',
            });
        }

        // ── 2. Motor 1: Google Vision ──────────────────────────────────────
        const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_VISION_API_KEY');
        let fullOcrText = "";
        let visionFallo: string | null = null;

        if (!GOOGLE_VISION_API_KEY) {
            visionFallo = 'no hay GOOGLE_VISION_API_KEY configurada';
        } else {
            for (const img of imagenes) {
                const visionResponse = await fetch(
                    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            requests: [{
                                image: { content: img.base64 },
                                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                            }],
                        }),
                    }
                );

                // >>> LO QUE CONTESTE GOOGLE SE DICE, NO SE TIRA <<<
                // Esto era `visionResult.responses?.[0]?.fullTextAnnotation?.text || ""`.
                // Si Google contestaba "billing", "clave no válida" o "API
                // deshabilitada", el error se perdía y el usuario leía siempre
                // lo mismo — "No se pudo extraer texto de las imágenes" — que
                // manda a mirar la foto cuando el problema es de la cuenta.
                const crudo = await visionResponse.text();
                let visionResult: any = {};
                try { visionResult = JSON.parse(crudo); } catch { /* no vino JSON */ }
                const errVision = visionResult?.error || visionResult?.responses?.[0]?.error;

                if (!visionResponse.ok || errVision) {
                    visionFallo = `HTTP ${visionResponse.status}: ${errVision?.message || crudo.slice(0, 300)}`;
                    console.error(`[VISION] ${visionFallo}`);
                    break;
                }

                const texto = visionResult?.responses?.[0]?.fullTextAnnotation?.text || "";
                console.log(`[LOG] Vision leyó ${texto.length} caracteres de ${img.path}`);
                fullOcrText += texto + "\n\n";
            }
        }

        // Si una página falló, no se sigue con las otras a medias: o el texto
        // está completo o se lee todo otra vez por el otro camino.
        if (visionFallo) fullOcrText = "";

        // Vision fuera de juego (o sin encontrar una letra) => leer la imagen
        // con Gemini.
        const porImagen = !fullOcrText.trim();
        if (porImagen) {
            console.warn(`[MOTOR] Vision no sirvió (${visionFallo || 'no encontró texto'}). Se le manda la imagen a Gemini.`);
        }

        // ── 3. Motor 2 / ordenar en JSON: Gemini ───────────────────────────
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
        if (!GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY en las variables de la función.');

        const FORMATO = `{
  "invoice": { "supplier_name": "", "supplier_rnc": "", "invoice_number": "", "ncf": "", "date": "YYYY-MM-DD", "reference": "" },
  "items": [ { "code": "", "reference": "", "description": "", "qty": 1, "unit": "UND", "unit_cost": 0, "discount_pct": 0, "itbis_pct": 0.18, "line_total": 0 } ]
}`;

        const promptTexto = `Extrae los datos de esta factura de repuestos en formato JSON puro.
Extrae: Nombre Suplidor, RNC, Número Factura, NCF, Fecha (YYYY-MM-DD).
Para los items extrae: Código, Referencia, Descripción, Cantidad, Unidad, Costo (neto), Descuento %, ITBIS % e Importe.

OCR TEXT:
${fullOcrText}

JSON FORMAT:
${FORMATO}`;

        // Cuando lee la imagen hace las dos cosas de una: el texto crudo hace
        // falta igual, porque se guarda en compras.ocr_text y de ahí salen las
        // vistas que miden en qué se equivoca el OCR (v_ocr_correcciones).
        const promptImagen = `Estas imágenes son las páginas de UNA factura de repuestos (${imagenes.length} página(s)).
Léelas y devuelve JSON puro, sin explicaciones y sin markdown.
Extrae: Nombre Suplidor, RNC, Número Factura, NCF, Fecha (YYYY-MM-DD).
Para los items extrae: Código, Referencia, Descripción, Cantidad, Unidad, Costo (neto), Descuento %, ITBIS % e Importe.
Respeta los números tal como están impresos: no redondees ni recalcules.
Incluye además "ocr_text" con TODO el texto que leíste, línea por línea, en el orden de la página.

JSON FORMAT:
{
  "ocr_text": "",
  "invoice": { "supplier_name": "", "supplier_rnc": "", "invoice_number": "", "ncf": "", "date": "YYYY-MM-DD", "reference": "" },
  "items": [ { "code": "", "reference": "", "description": "", "qty": 1, "unit": "UND", "unit_cost": 0, "discount_pct": 0, "itbis_pct": 0.18, "line_total": 0 } ]
}`;

        const partes: any[] = porImagen
            ? [
                ...imagenes.map((img) => ({ inline_data: { mime_type: img.mime, data: img.base64 } })),
                { text: promptImagen },
            ]
            : [{ text: promptTexto }];

        // Modelos con cuota disponible en este key (verificado 2026-04-21 en Google AI Studio)
        // Free tier: 5 RPM, 20 RPD por modelo
        const modelsToTry = [
            "gemini-2.5-flash",           // Estable, cuota confirmada
            "gemini-3-flash",             // Más nuevo, cuota confirmada
            "gemini-flash-latest"         // Alias fallback
            // gemini-2.0-flash y gemini-1.5-flash removidos:
            // el primero da 0/0 quota en este key, el segundo fue retirado.
        ];

        let extractedData: any = null;
        let lastError = null;

        for (const model of modelsToTry) {
            console.log(`[LOG] Extrayendo con: ${model} (${porImagen ? 'imagen' : 'texto de Vision'})...`);
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: partes }],
                            generationConfig: {
                                temperature: 0.1,
                                // gemini 2.0 soporta formatout directamente pero para compatibilidad limpieza manual
                            }
                        }),
                    }
                );

                if (response.ok) {
                    const result = await response.json();
                    let text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
                    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
                    extractedData = JSON.parse(text);
                    console.log(`[SUCCESS] Extracción completada con ${model}`);
                    break;
                } else {
                    const errText = await response.text();
                    console.error(`[FAIL] ${model}:`, errText);
                    lastError = errText;
                }
            } catch (e: any) {
                console.error(`[ERROR] ${model}:`, e.message);
                lastError = e.message;
            }
        }

        if (!extractedData) {
            // Los dos motores caídos: se dicen las dos razones, que son
            // distintas y se arreglan en sitios distintos.
            throw new Error(porImagen
                ? `No se pudo leer la factura. Google Vision: ${visionFallo || 'no encontró texto'}. Gemini: ${lastError}`
                : `Fallo crítico en IA: ${lastError}`);
        }

        // El texto crudo: el de Vision si lo hubo, si no el que devolvió Gemini.
        const ocrFinal = fullOcrText.trim() || String(extractedData.ocr_text || '');
        delete extractedData.ocr_text;

        return new Response(JSON.stringify({
            ocr_text: ocrFinal,
            extracted_data: extractedData,
            motor: porImagen ? 'gemini' : 'vision',
            vision_error: visionFallo,
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
