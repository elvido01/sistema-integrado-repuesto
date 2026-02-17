import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.30.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

        let fullOcrText = "";

        // 1. OCR (Google Vision)
        for (const image_path of image_paths) {
            console.log(`[LOG] Procesando OCR: ${image_path}`);
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('purchases')
                .download(image_path);

            if (downloadError) throw new Error(`Error al descargar imagen: ${image_path}`);

            const base64Image = btoa(
                new Uint8Array(await fileData.arrayBuffer()).reduce(
                    (data, byte) => data + String.fromCharCode(byte),
                    ''
                )
            );

            const GOOGLE_VISION_API_KEY = Deno.env.get('GOOGLE_VISION_API_KEY');
            const visionResponse = await fetch(
                `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        requests: [{
                            image: { content: base64Image },
                            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                        }],
                    }),
                }
            );

            const visionResult = await visionResponse.json();
            fullOcrText += (visionResult.responses?.[0]?.fullTextAnnotation?.text || "") + "\n\n";
        }

        if (!fullOcrText.trim()) throw new Error("No se pudo extraer texto de las imágenes.");

        // 2. Data Extraction with CONFIRMED Gemini Models
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
        const prompt = `Extrae los datos de esta factura de repuestos en formato JSON puro.
Extrae: Nombre Suplidor, RNC, Número Factura, NCF, Fecha (YYYY-MM-DD).
Para los items extrae: Código, Descripción, Cantidad, Unidad, Costo (neto), Descuento %, ITBIS % e Importe.

OCR TEXT:
${fullOcrText}

JSON FORMAT:
{
  "invoice": { "supplier_name": "", "supplier_rnc": "", "invoice_number": "", "ncf": "", "date": "YYYY-MM-DD", "reference": "" },
  "items": [ { "code": "", "description": "", "qty": 1, "unit": "UND", "unit_cost": 0, "discount_pct": 0, "itbis_pct": 0.18, "line_total": 0 } ]
}`;

        // Modelos confirmados disponibles en esta cuenta
        const modelsToTry = [
            "gemini-2.0-flash",           // El más rápido y moderno confirmado
            "gemini-flash-latest",        // Alias estable confirmado
            "gemini-2.5-flash",          // experimental ultra rápido confirmado
            "gemini-1.5-flash-8b"         // fallback ligero
        ];

        let extractedData = null;
        let lastError = null;

        for (const model of modelsToTry) {
            console.log(`[LOG] Extrayendo con: ${model}...`);
            try {
                const response = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
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

        if (!extractedData) throw new Error("Fallo crítico en IA: " + lastError);

        return new Response(JSON.stringify({ ocr_text: fullOcrText, extracted_data: extractedData }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
