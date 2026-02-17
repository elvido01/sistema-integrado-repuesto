let connectingPromise: Promise<void> | null = null;

declare global {
    var qz: any;
}

function cleanEnv(v: any): string {
    const s = String(v ?? "").trim();
    if (!s) return "";
    if (s.toLowerCase() === "undefined" || s.toLowerCase() === "null") return "";
    return s;
}

// ─── Certificado auto-firmado para QZ Tray ───
const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIDSTCCAjGgAwIBAgIUUCYCP6pQPvK6jVxtVwos+/t5L5IwDQYJKoZIhvcNAQEL
BQAwNDEYMBYGA1UEAwwPUmVwdWVzdG9zIE1vcmxhMRgwFgYDVQQKDA9SZXB1ZXN0
b3MgTW9ybGEwHhcNMjYwMjE3MjMyMTI1WhcNMzYwMjE1MjMyMTI1WjA0MRgwFgYD
VQQDDA9SZXB1ZXN0b3MgTW9ybGExGDAWBgNVBAoMD1JlcHVlc3RvcyBNb3JsYTCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKwt696OudMkBZCsmtu9IZIh
TsG8YiLzOEEp4f0ZcJlIWDEWnbbBNpQPqNxU32zMbHRzP+ET1Eo3phHEXhsljphq
modVXMvzQ8Ri2zAjIMjx3wyPUa7bbdrSkLIDcqQF+ndBtyPX0qj2GvktD7vd10tV
EIewSVEo+80KAJdMPLQPDWyN+4gulS7tzWKg8/YWad80PPMr9FXiBlEd92wTy8Nz
CJW9tVS6O8vdtMrIs+zP9WM2l9PK0BqGvmXcq6nH+nk8EG306Swlv2sNkJ4X2ocN
LXDbDXmi/PdKEnFuMJAREgl5Y2UOr9+mAxA+/HmJrFoeXUjauKaAU1FZLzuBQxUC
AwEAAaNTMFEwHQYDVR0OBBYEFMxERB/d3n2aDghEybBeRqnNAHAMMB8GA1UdIwQY
MBaAFMxERB/d3n2aDghEybBeRqnNAHAMMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZI
hvcNAQELBQADggEBABTrVG1+caEATXnEecEQzXmCtooKgXeVuSRMRoMy/3F5njqX
I9ZvST2t+aFqWa8iUyL8fLDjffG+gKLeIlv3OnvwfPoLBbTUSk//ZY8dAFP3vbI9
CKp9kBWypX6fpNvzI53b5AO6Butfxm7VFnJEaL3FTW208PE4aJPPU1t3woIgi8B3
da8vgdwkVIb2otd/E7+j7RfuIwTxsf48GxD3qYxH5wfdM0LpV4w1YZSzXebizGDR
++sxsQpcAY/54tOAwrjDiKu3BMo1Fv++Bpj64a0ySdN7t8okIdLpiuQFM0NaGgJB
8djlHPpIBt+zTqdPhgPObZObF6wAbWuLn5tdAxU=
-----END CERTIFICATE-----`;

// ─── Clave privada para firmar solicitudes ───
const QZ_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCsLevejrnTJAWQ
rJrbvSGSIU7BvGIi8zhBKeH9GXCZSFgxFp22wTaUD6jcVN9szGx0cz/hE9RKN6YR
xF4bJY6YapqHVVzL80PEYtswIyDI8d8Mj1Gu223a0pCyA3KkBfp3Qbcj19Ko9hr5
LQ+73ddLVRCHsElRKPvNCgCXTDy0Dw1sjfuILpUu7c1ioPP2FmnfNDzzK/RV4gZR
HfdsE8vDcwiVvbVUujvL3bTKyLPsz/VjNpfTytAahr5l3Kupx/p5PBBt9OksJb9r
DZCEF9qHDS1w2w15ovz3ShJxbjCQERIJeWNlDq/fpgMQPvx5iaxaHl1I2rimgFNR
WS87gUMVAgMBAAECggEAS6w9G8on0qvkxEKQJx53ODXqWsyUZx71bPJe7/Gz4rKA
jEaP12gQuD8vrHKi5brsubuDakVgSqQtmWZwI8c8ZjGILA2w5LRMZu45vmzZ9mcT
bH463Lp1DDT6QjqwsnUsMSjROHAdFoRfs38CCMQF4QaIZtJsTr7P+Dw6qURo84tm
sJopH4Cd5A7/9yr3IwmpcKDxk7fwGJvXk2d7tVkq3cRQaHb7F3o1KOgoCneQ7ufA
Ah+Sbp70Gp7btcDX+ysCZskKabr7dyT/AKVCJ6tM6feri+AULwxQAiunzfi2kC4m
rRK6rX9RCPViX21K/J3ucqeY5EqAe4GNleHcNwG5OwKBgQDmv4z+t9cf+tl06rqI
e/N1HBl2F05MOm9jSZ+Qej+Qz/91Y+Ka0jJlhXeL5fhr+Os6kpDlwjXf+MeNh+Ar
KR2Wub6kog/39roPsEMoF4rmiS+JMfCbJJMBAlzE7FpzeTUz/1vQVZA+R5dfdXND
zg5AOFJY7k9VTJ+HOzSQ1wqhewKBgQC/BY3u0Gf6DWn+I9uJ157MjRTCBuH5LUys
5H44C5CVUFzuhf0l1ngHYQ4jyWKGwjfHOBZZGry8UdbPzow4Xnlpqie+yviNKpdY
tBLXXbhsMUSG2DB8iMtBGFx3oQ9qFkU2HHundL5vh5EK4ffHbKaF80lhDxjJR+XT
r6dcqfCgrwKBgA8jylB8J3VFtDbjn9GMsHCio1kINm7x9pUBI6MLIliSDSTapOeb
mwrmMu3O7PnIn0Z8j11D3N0RKaazn5W1YOee0E9lAr82RQb6fa2HvelaXvAVgr/r
KmoKiaOyDk09SqxauN92fbxYXio5PpLYVj8Icv66xCHIoT7yN4S5V005AoGAIYrk
JW9LEsmQNyQsxMOsCtcrMfbrb0nZEPL+hvDg7pcx+mBk12QVp5YPWZFfT7KDAOSE
aBkd0yO7yLnIPY25XCiY2hPiGUfFU7orJM48OCNemR8VRIjwx/lzIz6Q6lwGwz21
KO6DEiqH+ZU8YTRe+V6DIBv6ij2pycYqaUceDdkCgYEAyVMQC+G9vXyClLqjEfF/
Nt+I3G9nvbbt3mS5FTfiRatRdUrzt8PzqERuMTrtyUWDh9N5IRqxks5/I9j5kXhT
5IlDCtfrRaYXrMSA44WQV14jrNksz/TJQj/vjaa/IlFo4uyvIzTj7kZH13GKRjKz
rL5VA38FzX+kJmseKdlFQBo=
-----END PRIVATE KEY-----`;

/**
 * Convierte un string PEM de clave privada a un CryptoKey para Web Crypto API
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
    const pemBody = pem
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace(/\s/g, "");
    const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    return await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" },
        false,
        ["sign"]
    );
}

/**
 * Firma datos usando la clave privada con RSA-SHA512
 */
async function signData(data: string): Promise<string> {
    const key = await importPrivateKey(QZ_PRIVATE_KEY);
    const enc = new TextEncoder();
    const signature = await crypto.subtle.sign(
        "RSASSA-PKCS1-v1_5",
        key,
        enc.encode(data)
    );
    // Convertir a base64
    const bytes = new Uint8Array(signature);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Configura los certificados de seguridad de QZ Tray.
 * Usa un certificado auto-firmado + firma RSA-SHA512 para eliminar
 * el diálogo "Untrusted website / Action Required".
 */
let securityConfigured = false;
function setupQzSecurity() {
    if (securityConfigured) return;
    if (typeof qz === "undefined") return;

    // Algoritmo de firma SHA-512
    qz.security.setSignatureAlgorithm("SHA512");

    // Proveer el certificado público
    qz.security.setCertificatePromise(function (resolve: any, reject: any) {
        resolve(QZ_CERTIFICATE);
    });

    // Firmar cada solicitud con la clave privada
    qz.security.setSignaturePromise(function (toSign: any) {
        return function (resolve: any, reject: any) {
            signData(toSign)
                .then(resolve)
                .catch(reject);
        };
    });

    securityConfigured = true;
    console.log("[QZ] Seguridad configurada con certificado auto-firmado.");
}

/**
 * Conecta con QZ Tray de forma segura (singleton).
 * Evita múltiples llamadas simultáneas y maneja argumentos undefined.
 */
export async function qzEnsureConnection() {
    if (typeof qz === "undefined") {
        throw new Error("QZ Tray no detectado. Verifique que qz-tray.js esté en index.html");
    }

    // Configurar seguridad ANTES de conectar
    setupQzSecurity();

    if (qz.websocket.isActive()) return;

    if (connectingPromise) return await connectingPromise;

    connectingPromise = (async () => {
        try {
            const envHostsRaw = cleanEnv(import.meta.env.VITE_QZ_HOSTS);
            const envPortRaw = cleanEnv(import.meta.env.VITE_QZ_PORT);

            // ✅ REGLA: en desarrollo local, conecta sin args (lo más estable)
            // Solo usa host/port si de verdad vienen bien definidos
            const shouldUseParams = !!envHostsRaw || !!envPortRaw;

            if (!shouldUseParams) {
                if (import.meta.env.DEV) console.log("[QZ] connect() sin argumentos (local recomendado)");
                await qz.websocket.connect();
                return;
            }

            // Si hay params, host debe ser string y nunca vacío
            let port = envPortRaw ? Number(envPortRaw) : 8182;
            if (!Number.isFinite(port) || port <= 0) port = 8182;

            const hosts = (envHostsRaw ? envHostsRaw.split(",") : ["localhost"])
                .map(h => h.trim())
                .filter(h => h && h.toLowerCase() !== "undefined" && h.toLowerCase() !== "null");

            const finalHosts = hosts.length ? hosts : ["localhost"];

            // ✅ intenta host por host (string)
            let lastErr: any = null;
            for (const host of finalHosts) {
                try {
                    if (import.meta.env.DEV) console.log("[QZ] Intentando connect con:", { host, port });
                    await qz.websocket.connect({ host, port });
                    return;
                } catch (e) {
                    lastErr = e;
                }
            }

            throw lastErr ?? new Error("No fue posible conectar con QZ Tray.");
        } catch (err: any) {
            // Si sale el famoso "already exists", lo ignoramos
            if (String(err?.message || "").includes("already exists")) {
                console.warn("[QZ] La conexión ya existía.");
                return;
            }
            console.error("[QZ] Error al conectar:", err);
            throw err;
        } finally {
            connectingPromise = null;
        }
    })();

    return await connectingPromise;
}

/**
 * Busca la mejor impresora disponible basado en nombres preferidos.
 */
export async function qzFindBestPrinter(preferred: string[] = []) {
    await qzEnsureConnection();

    console.log("[QZ] Buscando impresoras...");
    const printers: any = await qz.printers.find();

    if (!printers || (Array.isArray(printers) && printers.length === 0)) {
        throw new Error("No se detectaron impresoras en QZ Tray.");
    }

    const printersList = Array.isArray(printers) ? printers : [printers];
    const lowerList = printersList.map(p => (typeof p === 'string' ? p : p.name || String(p)).toLowerCase());

    // 1. Intentar nombres preferidos (ZDesigner LP 2824 (Copiar 1), etc)
    for (const name of preferred) {
        if (!name) continue;
        const target = name.toLowerCase();
        const idx = lowerList.indexOf(target);
        if (idx >= 0) {
            console.log("[QZ] Impresora seleccionada (exacta):", printersList[idx]);
            return printersList[idx];
        }
    }

    // 2. Fallback: buscar cualquiera que contenga "lp 2824"
    const lpIdx = lowerList.findIndex(p => p.includes("lp 2824"));
    if (lpIdx >= 0) {
        console.log("[QZ] Impresora seleccionada (fallback LP 2824):", printersList[lpIdx]);
        return printersList[lpIdx];
    }

    // 3. Fallback genérico Zebra
    const zebraIdx = lowerList.findIndex(p => p.includes("zdesigner") || p.includes("zebra"));
    if (zebraIdx >= 0) {
        console.log("[QZ] Impresora seleccionada (fallback Zebra):", printersList[zebraIdx]);
        return printersList[zebraIdx];
    }

    throw new Error("No se encontró la impresora ZDesigner/LP 2824. Detectadas: " + printersList.join(", "));
}

/**
 * Envía comandos RAW EPL2 a la impresora seleccionada.
 */
export async function qzPrintRawEpl(printerName: string, epl: string) {
    if (!printerName) throw new Error("Nombre de impresora inválido.");

    await qzEnsureConnection();

    const config = qz.configs.create(printerName, {
        encoding: "UTF-8",
        copies: 1
    });

    console.log("[QZ] Enviando EPL RAW a:", printerName);
    return await qz.print(config, [{
        type: "raw",
        format: "command",
        data: epl
    }]);
}

// Compatibilidad
export const qzTrayService = {
    ensureConnection: qzEnsureConnection,
    findPrinter: qzFindBestPrinter,
    printRawEpl: qzPrintRawEpl
};

/**
 * Busca la impresora de recibos (Star SP100 / TSP100 / otra impresora de recibos).
 */
export async function qzFindReceiptPrinter(preferred: string[] = []) {
    await qzEnsureConnection();

    console.log("[QZ] Buscando impresora de recibos...");
    const printers: any = await qz.printers.find();

    if (!printers || (Array.isArray(printers) && printers.length === 0)) {
        throw new Error("No se detectaron impresoras en QZ Tray.");
    }

    const printersList = Array.isArray(printers) ? printers : [printers];
    const lowerList = printersList.map((p: any) => (typeof p === 'string' ? p : p.name || String(p)).toLowerCase());

    // 1. Intentar nombres preferidos exactos
    for (const name of preferred) {
        if (!name) continue;
        const target = name.toLowerCase();
        const idx = lowerList.indexOf(target);
        if (idx >= 0) {
            console.log("[QZ] Impresora de recibos (exacta):", printersList[idx]);
            return printersList[idx];
        }
    }

    // 2. Buscar Star SP100 / TSP100
    const starKeywords = ["sp100", "tsp100", "star sp", "star tsp", "star micronics"];
    for (const kw of starKeywords) {
        const idx = lowerList.findIndex((p: string) => p.includes(kw));
        if (idx >= 0) {
            console.log("[QZ] Impresora de recibos (Star):", printersList[idx]);
            return printersList[idx];
        }
    }

    // 3. Buscar cualquier impresora con "receipt", "pos", "thermal", "star"
    const receiptKeywords = ["receipt", "pos", "thermal", "star", "generic"];
    for (const kw of receiptKeywords) {
        const idx = lowerList.findIndex((p: string) => p.includes(kw));
        if (idx >= 0) {
            console.log("[QZ] Impresora de recibos (keyword):", printersList[idx]);
            return printersList[idx];
        }
    }

    // 4. Fallback: devolver la primera que NO sea Zebra/LP (para evitar enviar a etiquetas)
    const nonLabelIdx = lowerList.findIndex((p: string) =>
        !p.includes("zdesigner") && !p.includes("zebra") && !p.includes("lp 2824")
    );
    if (nonLabelIdx >= 0) {
        console.log("[QZ] Impresora de recibos (fallback non-label):", printersList[nonLabelIdx]);
        return printersList[nonLabelIdx];
    }

    throw new Error(
        "No se encontró impresora de recibos (Star SP100). Detectadas: " + printersList.join(", ")
    );
}

/**
 * Envía comandos RAW ESC/POS a la impresora de recibos.
 */
export async function qzPrintRawEscPos(printerName: string, escposData: string) {
    if (!printerName) throw new Error("Nombre de impresora inválido.");

    await qzEnsureConnection();

    const config = qz.configs.create(printerName, {
        encoding: "cp437", // Standard ESC/POS code page
        copies: 1
    });

    console.log("[QZ] Enviando ESC/POS RAW a:", printerName);
    return await qz.print(config, [{
        type: "raw",
        format: "command",
        data: escposData
    }]);
}
