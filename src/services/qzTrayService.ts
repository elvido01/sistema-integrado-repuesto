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
MIIEEzCCAvugAwIBAgIBATANBgkqhkiG9w0BAQsFADCBhDEeMBwGA1UEAxMVUmVw
dWVzdG9zIE1vcmxhIFRydXN0MQswCQYDVQQGEwJETzEWMBQGA1UECBMNU2FudG8g
RG9taW5nbzEWMBQGA1UEBxMNU2FudG8gRG9taW5nbzEYMBYGA1UEChMPUmVwdWVz
dG9zIE1vcmxhMQswCQYDVQQLEwJJVDAeFw0yNjAyMTgyMjQwNTVaFw0zNjAyMTgy
MjQwNTVaMIGEMR4wHAYDVQQDExVSZXB1ZXN0b3MgTW9ybGEgVHJ1c3QxCzAJBgNV
BAYTAkRPMRYwFAYDVQQIEw1TYW50byBEb21pbmdvMRYwFAYDVQQHEw1TYW50byBE
b21pbmdvMRgwFgYDVQQKEw9SZXB1ZXN0b3MgTW9ybGExCzAJBgNVBAsTAklUMIIB
IjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmZ/wSV/azGCNUYD4RFmxNhHM
TlwHvN8e6hzGO4infSGo1Cm8Ms5LzB7Sok3ePjKo4AjXjIPSokc7kJMm0WTFPT0J
mWP9AYB7jGE1FyvAZV9fScCCXEZGsDBz7ySgebJqT83RQsuL0pGwiLrmGA40uT2Y
DTZA+rg926Wo8Glv/xlukvBg5UpY2DwtRyc+STTeoZRsJrYwjhz2oM1P/tDmr1R/
K4hGAWQYGdmY3lzXecxbARQyeeina5DOYZa1RSPa2fVljldiSimICJf38To5F1XS
8oRoMQkbqxG+hZrwcYj1hWmO2FkHJH2JB6k/S8CSct6NOnR9hy2tG9wCrX0BqwID
AQABo4GNMIGKMAwGA1UdEwQFMAMBAf8wCwYDVR0PBAQDAgL0MDsGA1UdJQQ0MDIG
CCsGAQUFBwMBBggrBgEFBQcDAgYIKwYBBQUHAwMGCCsGAQUFBwMEBggrBgEFBQcD
CDARBglghkgBhvhCAQEEBAMCAPcwHQYDVR0OBBYEFJXmMzkXqdNeqXdE/HLjiJRI
XEjYMA0GCSqGSIb3DQEBCwUAA4IBAQAzUnFzuK+luDkZmr/LlLTUIOp7HAOXe/Nk
nXQ1ZbFJsloaLZxw2O4hHKByWil3nVgRoVfWMiD0fH5euHJJ0Tyg5XTmWUlA4r65
MZv3ljJFdhg9Q1FRv3D+URmtr5fvlkF4d2KSqzu5ZxlHnpE/pUj8SC1s7YANOmR5
1VL4ebuDsNvFpE2qIYFuYNvxQQagsePHmXzeHIpq05hINqZ3Fzp1o224kn2r5nFB
ad9YC3qILe37qS1ZvkmIgHqVEKBSGvlRuu08fBXifKrqBJIPhlT941DavYkBMqsS
Vj8mBWGq/KDZs2mVNzhhhr1CfPQrbrzuinC0qlQpGJ4sLTqych3A
-----END CERTIFICATE-----`;

// ─── Clave privada para firmar solicitudes ───
const QZ_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCZn/BJX9rMYI1R
gPhEWbE2EcxOXAe83x7qHMY7iKd9IajUKbwyzkvMHtKiTd4+MqjgCNeMg9KiRzuQ
kybRZMU9PQmZY/0BgHuMYTUXK8BlX19JwIJcRkawMHPvJKB5smpPzdFCy4vSkbCI
uuYYDjS5PZgNNkD6uD3bpajwaW//GW6S8GDlSljYPC1HJz5JNN6hlGwmtjCOHPag
zU/+0OavVH8riEYBZBgZ2ZjeXNd5zFsBFDJ56KdrkM5hlrVFI9rZ9WWOV2JKKYgI
l/fxOjkXVdLyhGgxCRurEb6FmvBxiPWFaY7YWQckfYkHqT9LwJJy3o06dH2HLa0b
3AKtfQGrAgMBAAECggEAMVYK/hV5l/8+AznPAWxom/u1SEkH9yEUtYzOINpvJ6GC
rbhFh293KjOP463sPL9aOrC8QJUpNRJ5T6HiaobZTSRoC8nvu+a+RsQFH87eN/Ac
EvxvISE0nGrDIL77hnnE6KIpnTDvU42USyTytjEBv6fHSB7vWVWIEB0wlxzVafAK
kFD5EqjBbZnQLlbym+udQSPDdWlayvXechZMtMSDt7R6+HZHkRtvM7pXCsjemn0C
HTB9hbWh64x6d9FiNZTgSWX2pj1/uh7rWN/lYrm6EjJW29zlbOLqNdJwpRD4pwDP
JApqn12DQ7Fd7lrdOoen9GOGRHFUHTIzY077jXTS8QKBgQDH2Bst4rvZIAcUY1HZ
3h/ahxDC9F8DUKYl232z6MDNCZFMmuzkAbwGu5lDauuj3gENKv+P66IXBXwhoOAj
85UVRUyJiXRCUPUNPkmVR0i4XPvpLIqZePrxFB9XsfDSOxEJygL2SlYVwIyOTlF2
i3C/NzeifHAGiYn0a6sBrV1rEwKBgQDEywP8j0BGpS5fpEqJhI+3gJzIbgQGtxnM
VOnXn96v6OB9lqlF3D/QFgTxhCGZvTL9C6cC1nA3Ldheg9/WVVPIGFw6+aJnlUnF
lakh3NVDIleQo3i9XVmNk9Ah0YpmURzN3GSUtruAH6lLMxAlzrbqO7HhVyhgSasP
mcUhNBSKCQKBgQCZDiEazokSLN5fNgYNN3rr8f/bYC+YqV7mpakrbfqjzk0S/6Co
q89m1Kz4Hl5kvXXOsPzULCKTQScl1kF0J20pwk5xE+4PkFNuFiNjChpe4RAqMGvi
SO7gTooGrwiC6qwM9EO6f4pY1ISRxNfNU9RBDrg0YNunlhUrNn7dJPrkMwKBgQCa
o9mXHk5o9SYyu9xioct5bFRHX8RELp/UJCm5agRIgRvfNIQBxKhUcOkjjCwHLlih
5gUwQqfdhGYRJ1m+iECU7SeUpFPNR8+3tvo4BNuErLjYjMy1KWTUzwFvgcRa0IRs
9DIJdmpyrO6QjCi1PPIZsB0AsUemGl2UncX9aHp3WQKBgAW3pkajkbe48VLoeMOf
RKc8sVpxBGlKuy5zr5ic7/LA7NDqQo6rA/teeC0Xu0qSI3mAyxecNJ3agQK+ZUQo
zKc/bgiuihqDif8IHhf8vEiVD/AxQG7UaQcIcnXqeZ5/6SCPVVzkM6SplrrU2l4M
resb4umEFsq2bsAzV44OoeUF
-----END PRIVATE KEY-----`;

/**
 * Convierte un string PEM de clave privada a un CryptoKey para Web Crypto API
 */
/**
 * Convierte un string PEM de clave privada a un CryptoKey para Web Crypto API
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
    try {
        const pemBody = pem
            .replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replace(/\s/g, "");

        console.log("[QZ] Decodificando clave privada... Longitud cuerpo:", pemBody.length);
        const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
        console.log("[QZ] Clave binaria (bytes):", binaryDer.byteLength);

        const key = await crypto.subtle.importKey(
            "pkcs8",
            binaryDer.buffer,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["sign"]
        );
        console.log("[QZ] Clave importada correctamente.");
        return key;
    } catch (e) {
        console.error("[QZ] Error importando clave privada:", e);
        throw e;
    }
}

/**
 * Firma datos usando la clave privada con RSA-SHA256
 */

async function signData(data: string): Promise<string> {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error("Vida 'crypto.subtle' no disponible. Asegúrese de usar HTTPS o localhost.");
    }

    try {
        console.log("[QZ] Iniciando firma de mensaje:", data.substring(0, 20) + "...");
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
        const base64 = btoa(binary);
        console.log("[QZ] Firma generada exitosamente.");
        return base64;
    } catch (err) {
        console.error("[QZ] Error CRÍTICO generando firma digital:", err);
        throw err;
    }
}

/**
 * Configura los certificados de seguridad de QZ Tray.
 * Usa un certificado auto-firmado + firma RSA-SHA256 para eliminar
 * el diálogo "Untrusted website / Action Required".
 */
let securityConfigured = false;
function setupQzSecurity() {
    if (securityConfigured) return;
    if (typeof qz === "undefined") return;

    // Algoritmo de firma SHA-256 (estándar compatible)
    try {
        qz.security.setSignatureAlgorithm("SHA256");
    } catch (e) {
        console.warn("[QZ] setSignatureAlgorithm no disponible, usando default (SHA1/SHA256)");
    }

    // Proveer el certificado público
    qz.security.setCertificatePromise(function (resolve: any, reject: any) {
        resolve(QZ_CERTIFICATE);
    });

    // Firmar cada solicitud con la clave privada
    qz.security.setSignaturePromise(function (toSign: any) {
        return function (resolve: any, reject: any) {
            console.log("[QZ] Solicitud de firma recibida para:", toSign);
            signData(toSign)
                .then(resolve)
                .catch((err: any) => {
                    console.error("[QZ] La promesa de firma falló:", err);
                    reject(err);
                });
        };
    });

    securityConfigured = true;
    console.log("[QZ] Seguridad configurada con certificado auto-firmado (SHA-256).");
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
        let hosts: string[] = ["localhost"];
        let port = 8182;

        try {
            const envHostsRaw = cleanEnv(import.meta.env.VITE_QZ_HOSTS);
            const envPortRaw = cleanEnv(import.meta.env.VITE_QZ_PORT);

            // ✅ REGLA: en desarrollo local, conecta sin args (lo más estable)
            const shouldUseParams = !!envHostsRaw || !!envPortRaw;

            if (!shouldUseParams) {
                if (import.meta.env.DEV) console.log("[QZ] connect() sin argumentos (local recomendado)");
                await qz.websocket.connect();
                return;
            }

            // Si hay params, host debe ser string y nunca vacío
            port = envPortRaw ? Number(envPortRaw) : 8182;
            if (!Number.isFinite(port) || port <= 0) port = 8182;

            hosts = (envHostsRaw ? envHostsRaw.split(",") : ["localhost"])
                .map(h => h.trim())
                .filter(h => h && h.toLowerCase() !== "undefined" && h.toLowerCase() !== "null");

            const finalHosts = hosts.length ? hosts : ["localhost"];

            // ✅ intenta host por host (string)
            let lastErr: any = null;
            for (const host of finalHosts) {
                try {
                    // Construct options strictly as QZ expects
                    const options: any = { host: [host] };

                    // Only override port if explicitly set in ENV (default 8182 is handled by QZ defaults)
                    if (envPortRaw) {
                        const p = Number(envPortRaw);
                        if (Number.isFinite(p) && p > 0) {
                            options.port = { secure: [p], insecure: [p] };
                        }
                    }

                    console.log(`[QZ] Intentando conectar con: ${host} (port: ${envPortRaw || 'auto'})`);
                    await qz.websocket.connect(options);
                    console.log(`[QZ] Conectado exitosamente.`);
                    return;
                } catch (e) {
                    console.warn(`[QZ] Falló conexión a ${host}:`, e);
                    lastErr = e;
                }
            }

            throw lastErr ?? new Error("No fue posible conectar con QZ Tray.");
        } catch (err: any) {
            if (String(err?.message || "").includes("already exists")) {
                console.warn("[QZ] La conexión ya existía.");
                return;
            }
            console.error("[QZ] Error al conectar:", err);
            // Re-lanzar con más contexto si es posible
            throw new Error(`No se pudo conectar a QZ Tray en ${hosts.join(',')}:${port}. Detalles: ${err.message || err}`);
        } finally {
            connectingPromise = null;
        }
    })();

    return await connectingPromise;
}

/**
 * Busca la mejor impresora disponible basado en nombres preferidos.
 */
/**
 * Lista TODAS las impresoras instaladas en el sistema (Windows / macOS / Linux).
 * Devuelve array de strings con los nombres.
 * Útil para mostrar un dropdown al usuario y dejarle elegir.
 */
export async function qzListAllPrinters(): Promise<string[]> {
    await qzEnsureConnection();
    const printers: any = await qz.printers.find();
    if (!printers) return [];
    const list = Array.isArray(printers) ? printers : [printers];
    return list.map((p: any) => (typeof p === 'string' ? p : p.name || String(p))).filter(Boolean);
}

/**
 * Verifica rápido si QZ Tray está disponible (websocket conectable).
 * No lanza error — devuelve true/false.
 */
export async function qzIsAvailable(): Promise<boolean> {
    if (typeof qz === "undefined") return false;
    try {
        await qzEnsureConnection();
        return qz.websocket.isActive();
    } catch (_) {
        return false;
    }
}

export async function qzFindBestPrinter(preferred: string[] = []) {
    await qzEnsureConnection();

    console.log("[QZ] Buscando impresoras...");
    const printers: any = await qz.printers.find();

    if (!printers || (Array.isArray(printers) && printers.length === 0)) {
        throw new Error("No se detectaron impresoras en QZ Tray.");
    }

    const printersList = Array.isArray(printers) ? printers : [printers];
    const lowerList = printersList.map((p: any) => (typeof p === 'string' ? p : p.name || String(p)).toLowerCase());

    // 0. Ver si hay alguna configurada manualmente en localStorage
    const savedPrinter = localStorage.getItem('qz_label_printer');
    if (savedPrinter) {
        const idx = printersList.findIndex((p: any) => (typeof p === 'string' ? p : p.name || String(p)) === savedPrinter);
        if (idx >= 0) {
            console.log("[QZ] Impresora de etiquetas desde localStorage:", printersList[idx]);
            return printersList[idx];
        }
    }

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

    // 2. Fallback: buscar cualquiera que contenga "lp 2824" o "zebra_lp2824"
    const lpIdx = lowerList.findIndex((p: string) => p.includes("lp 2824") || p.includes("zebra_lp2824") || p.includes("lp2824"));
    if (lpIdx >= 0) {
        console.log("[QZ] Impresora seleccionada (fallback LP 2824):", printersList[lpIdx]);
        return printersList[lpIdx];
    }

    // 3. Fallback genérico Zebra / 4BARCODE
    const labelIdx = lowerList.findIndex((p: string) => p.includes("zdesigner") || p.includes("zebra") || p.includes("4barcode"));
    if (labelIdx >= 0) {
        console.log("[QZ] Impresora seleccionada (fallback label):", printersList[labelIdx]);
        return printersList[labelIdx];
    }

    throw new Error("No se encontró impresora de etiquetas. Detectadas: " + printersList.join(", "));
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
