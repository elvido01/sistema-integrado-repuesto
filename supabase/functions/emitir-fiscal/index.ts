// @ts-nocheck
// deno-lint-ignore-file
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import forge from "https://esm.sh/node-forge@1.3.1";
import { buildEcfXml, facturaToEcfInput, notaToEcfInput, buildAnecfXml, buildRfceXml } from "./dgii_xml_builder.ts";
import { buildEcfFromTestRow, buildRfceFromTestRow } from "./dgii_certif_builder.ts";
import { signEcfXml, signXmlGenerico } from "./dgii_signer.ts";
import { authenticate, enviarEcf, consultarEstado, enviarAnulacion, enviarRfce } from "./dgii_client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// ============================================================
// CONTRATO EmisorAdapter
// ============================================================
// Cada proveedor de facturación electrónica implementa este contrato.
// El handler principal selecciona el adapter según `integraciones_fiscales.proveedor`
// y llama estos dos métodos. Para agregar un nuevo proveedor:
//   1. Implementar las dos funciones (testConnection, emitirFactura).
//   2. Registrarlo en ADAPTADORES con su key (ej. "alegra", "dgii_directo").
//   3. Insertar fila en integraciones_fiscales con `proveedor = '<key>'` y
//      `config` con los datos que el adapter espera.
//
// CONTRATO:
//
//   testConnection(config) -> { ok: boolean, ...info }
//     Valida credenciales/config. NO emite nada. Lanza si falla.
//
//   emitirFactura(supabase, config, factura, detalles, cliente) -> {
//     proveedor_invoice_id: string,    // id que devuelve el proveedor / TrackId DGII
//     proveedor_number:     string,    // numero comercial / fullNumber
//     ncf:                  string,    // NCF / e-NCF asignado
//     request_payload:      object,    // lo que enviamos (para auditoria)
//     response_payload:     object,    // lo que recibimos (para auditoria)
//   }
//     - Recibe el cliente Supabase (service role) por si necesita persistir
//       datos del proveedor en tablas (ej. fiscal_contact_id en clientes).
//     - Recibe `config` desde integraciones_fiscales.config (ya parseado).
//     - Lanza Error con mensaje legible si falla; el handler lo registra.
// ============================================================

// ============================================================
// HELPERS: Cifrado AES-256-GCM para passwords de certificado
// ============================================================
// El password del .p12 se almacena en integraciones_fiscales.config
// cifrado con AES-256-GCM. La master key (32 bytes en base64) vive
// en la variable de entorno DGII_MASTER_KEY del edge function. La
// edge function nunca expone la clave al frontend.
//
// Para generar la master key una sola vez (en consola local):
//   openssl rand -base64 32
// Y configurarla:
//   supabase secrets set DGII_MASTER_KEY=<base64-output>

async function getMasterKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("DGII_MASTER_KEY");
  if (!raw) {
    throw new Error(
      "DGII_MASTER_KEY no esta configurada. Genera una con `openssl rand -base64 32` y registrala con `supabase secrets set DGII_MASTER_KEY=...`"
    );
  }
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.byteLength !== 32) {
    throw new Error("DGII_MASTER_KEY debe ser 32 bytes (256 bits) en base64");
  }
  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPassword(plain: string): Promise<{ iv: string; ciphertext: string }> {
  const key = await getMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96 bits para GCM
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plain)
  );
  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ct))),
  };
}

async function decryptPassword(ciphertextB64: string, ivB64: string): Promise<string> {
  const key = await getMasterKey();
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ============================================================
// HELPERS: Log de documentos fiscales (e-CF) en BD + Storage
// ============================================================
// Cada e-CF emitido genera una fila en `documentos_fiscales`
// (proveedor='dgii_directo'). El XML firmado se guarda en el
// bucket privado `ecf-xmls` con path:
//   <tenant_id>/<año>/<mes>/<encf>.xml
// para retencion legal de 10 anos.

async function logEcfStart(supabase, params) {
  // params: { tenantId, factura_id, tipo_ecf, encf, ambiente }
  const { data, error } = await supabase
    .from("documentos_fiscales")
    .insert({
      tenant_id: params.tenantId,
      factura_id: params.factura_id || null,
      proveedor: "dgii_directo",
      tipo_documento: "factura",
      tipo_ecf: params.tipo_ecf,
      encf: params.encf,
      ambiente: params.ambiente,
      estado: "procesando",
      ncf: params.encf,
    })
    .select()
    .single();
  if (error) throw new Error(`Error iniciando log e-CF: ${error.message}`);
  return data;
}

async function logEcfXmlGenerated(supabase, docId, xmlPath, requestPayload) {
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      xml_firmado_path: xmlPath,
      request_payload: requestPayload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) throw new Error(`Error registrando XML: ${error.message}`);
}

async function logEcfSent(supabase, docId, trackId) {
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      track_id: trackId,
      estado_dgii: "enviado",
      estado: "emitido",
      emitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) throw new Error(`Error registrando envio: ${error.message}`);
}

async function logEcfArecf(supabase, docId, estado, payload) {
  // estado: 'aceptado' | 'rechazado' | 'aceptado_condicional'
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      estado_dgii: estado,
      arecf_recibido_at: new Date().toISOString(),
      arecf_payload: payload,
      dgii_messages: payload?.mensajes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) throw new Error(`Error registrando ARECF: ${error.message}`);
}

async function logEcfAecf(supabase, docId, estado, payload) {
  // estado: 'aprobado' | 'rechazado' (B2B tipo 31)
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      aecf_estado: estado,
      aecf_recibido_at: new Date().toISOString(),
      aecf_payload: payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) throw new Error(`Error registrando AECF: ${error.message}`);
}

async function logEcfError(supabase, docId, errorMessage) {
  const { error } = await supabase
    .from("documentos_fiscales")
    .update({
      estado: "error",
      error_message: errorMessage,
      retry_count: 1, // se incrementa via stored procedure si reintentamos
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);
  if (error) console.error("[emitir-fiscal] Error registrando error:", error);
}

async function uploadSignedXml(supabase, tenantId, encf, xmlString) {
  // path: <tenant>/<año>/<mes>/<encf>.xml
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const path = `${tenantId}/${year}/${month}/${encf}.xml`;

  // upsert: true — el XML para un mismo e-NCF es determinístico. Si la
  // misma operación se reintenta (timeout, auth DGII falló, etc.) no
  // queremos que el storage bloquee el retry. En producción, si el
  // e-NCF es realmente nuevo (correlativo único), nunca habrá colisión.
  const { error: upErr } = await supabase.storage
    .from("ecf-xmls")
    .upload(path, new Blob([xmlString], { type: "application/xml" }), {
      upsert: true,
      contentType: "application/xml",
    });
  if (upErr) throw new Error(`Error subiendo XML firmado: ${upErr.message}`);
  return path;
}

// ============================================================
// HELPERS: Carga y parsing del certificado .p12 (DGII)
// ============================================================
// loadAndParseP12 baja el .p12 del Storage, descifra el password,
// y parsea el archivo con node-forge para devolver:
//   - cert     : objeto X.509 del emisor (uso en metadata)
//   - privateKey: clave privada (para firma XAdES-BES en futuro)
//   - metadata : { subject_cn, issuer_cn, valid_from, valid_to, serial }
// La password en plaintext NUNCA sale de esta funcion.

async function loadAndParseP12(supabase, config) {
  const path = config?.certificado_storage_path;
  const ctEnc = config?.certificado_password_enc;
  const ivEnc = config?.certificado_password_iv;
  if (!path) throw new Error("No hay certificado_storage_path en la config");
  if (!ctEnc || !ivEnc) throw new Error("No hay password cifrado en la config");

  // 1. Bajar el .p12 desde Storage privado
  const { data: blob, error: dlErr } = await supabase.storage
    .from("certificados-dgii")
    .download(path);
  if (dlErr) throw new Error(`No se pudo bajar el .p12: ${dlErr.message}`);
  const buf = new Uint8Array(await blob.arrayBuffer());

  // 2. Descifrar el password con la master key
  const password = await decryptPassword(ctEnc, ivEnc);

  // 3. Parsear el .p12 con node-forge
  let p12;
  try {
    // forge necesita el DER como binary string
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const p12Asn1 = forge.asn1.fromDer(bin);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
  } catch (e) {
    throw new Error(`No se pudo abrir el .p12 (password incorrecto o archivo invalido): ${e.message}`);
  }

  // 4. Extraer cert y private key
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const cert = certBags[forge.pki.oids.certBag]?.[0]?.cert;
  if (!cert) throw new Error("El .p12 no contiene certificado X.509");

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key
    ?? p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]?.key;
  if (!privateKey) throw new Error("El .p12 no contiene la clave privada");

  // 5. Metadata legible
  const getField = (name, attrs) => attrs.getField(name)?.value || null;
  const metadata = {
    subject_cn:  getField("CN", cert.subject),
    subject_o:   getField("O",  cert.subject),
    subject_c:   getField("C",  cert.subject),
    issuer_cn:   getField("CN", cert.issuer),
    issuer_o:    getField("O",  cert.issuer),
    valid_from:  cert.validity.notBefore.toISOString(),
    valid_to:    cert.validity.notAfter.toISOString(),
    serial:      cert.serialNumber,
    self_signed: cert.subject.hash === cert.issuer.hash,
  };

  return { cert, privateKey, metadata };
}

// ============================================================
// ADAPTER: ALEGRA
// ============================================================
// Estado: ✅ producción. Funciona con la API REST de Alegra.
// Config esperada:
//   { user: string, token: string }

async function alegraFetch(path, method, user, token, payload) {
  const basic = btoa(`${user}:${token}`);
  const resp = await fetch(`https://api.alegra.com/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(`Alegra ${resp.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function alegraTestConnection(config) {
  const result = await alegraFetch("/companies", "GET", config.user, config.token);
  return { ok: true, company: result.name || result.id };
}

async function alegraGetOrCreateContact(supabase, config, cliente) {
  // Si ya tiene fiscal_contact_id, retornarlo
  if (cliente.fiscal_contact_id) return cliente.fiscal_contact_id;

  const payload = {
    name: [{ firstName: cliente.nombre }],
    identification: cliente.rnc || undefined,
    phonePrimary: cliente.telefono || undefined,
    email: cliente.email || undefined,
    address: { address: cliente.direccion || undefined },
    type: ["client"],
  };

  const resp = await alegraFetch("/contacts", "POST", config.user, config.token, payload);
  const contactId = String(resp.id);

  // Guardar fiscal_contact_id en clientes
  await supabase
    .from("clientes")
    .update({ fiscal_contact_id: contactId, updated_at: new Date().toISOString() })
    .eq("id", cliente.id);

  return contactId;
}

async function alegraEmitirFactura(supabase, config, factura, detalles, cliente) {
  // 1. Obtener/crear contacto
  let contactId = null;
  if (cliente && cliente.id !== "00000000-0000-0000-0000-000000000000") {
    contactId = await alegraGetOrCreateContact(supabase, config, cliente);
  }

  // 2. Preparar líneas
  const items = detalles.map((d) => ({
    name: d.descripcion || "Producto",
    quantity: d.cantidad,
    price: d.precio,
    discount: d.descuento_monto || 0,
    tax: [{ percentage: (d.itbis_pct || 0.18) * 100 }],
  }));

  // 3. Crear factura
  const invoicePayload = {
    date: new Date(factura.fecha).toISOString().split("T")[0],
    dueDate: factura.forma_pago === "CREDITO"
      ? new Date(new Date(factura.fecha).getTime() + (factura.dias_credito || 30) * 86400000).toISOString().split("T")[0]
      : new Date(factura.fecha).toISOString().split("T")[0],
    client: contactId ? { id: contactId } : undefined,
    items,
    paymentMethod: factura.forma_pago === "CONTADO" ? "cash" : "credit",
    observations: factura.notas || "",
  };

  const resp = await alegraFetch("/invoices", "POST", config.user, config.token, invoicePayload);

  return {
    proveedor_invoice_id: String(resp.id || ""),
    proveedor_number: resp.numberTemplate?.fullNumber || resp.number || null,
    ncf: resp.stamp?.trackId || null,
    response_payload: resp,
    request_payload: invoicePayload,
  };
}

// ============================================================
// ADAPTER: DGII DIRECTO
// ============================================================
// Estado: 🚧 stub — pendiente Fase 3 del proyecto de integración nativa
// con DGII (ver feat/dgii-directo).
//
// Config esperada (cuando se implemente):
//   {
//     rnc_emisor:                 string,
//     nombre_emisor:              string,
//     ambiente:                  'TesteCF' | 'CerteCF' | 'Produccion',
//     certificado_storage_path:   string,   // path en Supabase Storage al .p12 cifrado
//     certificado_password_enc:   string,   // password del .p12 cifrado con AES-256-GCM
//     callback_url:               string,   // endpoint publico para ARECF/AECF
//   }
//
// Pasos pendientes de implementacion:
//   - Cargar .p12 desde storage + descifrar password.
//   - Generar XML por tipo de e-CF (31, 32, 33, 34, 41, 43, 44, 45, 46, 47).
//   - Firma XAdES-BES con el certificado.
//   - POST a endpoint de DGII (Recepcion / Anulacion / Consulta).
//   - Recibir TrackId, persistir, polling de estado.
//   - Almacenar XML firmado en Storage por 10 anos.

// testConnection: valida que el .p12 se pueda abrir con la password
// y que los campos del config esten completos. NO contacta DGII (eso
// requiere que ya este declarado el callback URL en OFV).
async function dgiiDirectoTestConnection(config) {
  if (!config?.rnc_emisor) throw new Error("rnc_emisor no configurado");
  if (!config?.nombre_emisor) throw new Error("nombre_emisor no configurado");
  if (!config?.certificado_storage_path) throw new Error("Sube tu .p12 primero");
  if (!config?.certificado_password_enc) throw new Error("Falta password cifrado");
  // No podemos llamar loadAndParseP12 aqui sin supabase client — lo hace
  // la accion dgii_validate_certificate. testConnection solo valida campos.
  return {
    ok: true,
    rnc: config.rnc_emisor,
    ambiente: config.ambiente || "TesteCF",
    note: "Use 'Validar' para parsear el .p12 y 'Enviar a DGII' para una prueba real.",
  };
}

// emitirFactura: flujo completo end-to-end para DGII directo.
// 1. Genera e-NCF (correlativo del tenant)
// 2. Construye XML segun tipo (31 B2B / 32 B2C, segun cliente)
// 3. Carga .p12 y firma con XAdES-BES
// 4. Sube XML firmado al bucket ecf-xmls (retencion 10 anos)
// 5. Autentica con DGII (semilla -> firma -> token JWT)
// 6. POST RecepcionECF -> recibe TrackId
// 7. Retorna en el formato del contrato EmisorAdapter
async function dgiiDirectoEmitirFactura(supabase, config, factura, detalles, cliente) {
  // 1. Determinar tipo y generar eNCF correlativo
  const isB2B = !!(cliente && cliente.rnc && String(cliente.rnc).trim().length > 0);
  const tipoEcf = isB2B ? "31" : "32";
  const ambiente = config.ambiente || "TesteCF";

  // get_next_encf RPC asigna correlativo atomico al tenant del usuario
  const { data: encf, error: encfErr } = await supabase.rpc("get_next_encf", {
    p_tipo_ecf: tipoEcf,
    p_ambiente: ambiente,
  });
  if (encfErr || !encf) {
    throw new Error(
      `No se pudo asignar e-NCF (${tipoEcf}/${ambiente}): ${encfErr?.message || "secuencia agotada o no configurada en ecf_secuencias"}`
    );
  }

  // 2. Construir XML
  const input = facturaToEcfInput(factura, detalles, cliente, config, encf);
  const xmlSinFirmar = buildEcfXml(input.tipo_ecf, input);

  // 3. Cargar .p12 y firmar
  const { cert, privateKey } = await loadAndParseP12(supabase, config);
  const { xmlFirmado, digestValue, signatureValue } = await signEcfXml(xmlSinFirmar, cert, privateKey);

  // 4. Guardar XML firmado en Storage privado
  const xmlPath = await uploadSignedXml(supabase, factura.tenant_id, encf, xmlFirmado);

  // 5. Autenticar con DGII
  const auth = await authenticate(cert, privateKey, ambiente);

  // 6. Enviar e-CF
  const recepcion = await enviarEcf(xmlFirmado, auth.token, ambiente);
  const trackId = recepcion.trackId || recepcion.TrackId || recepcion.trackid;
  if (!trackId) {
    throw new Error(
      `DGII no devolvio TrackId. Respuesta: ${JSON.stringify(recepcion).slice(0, 300)}`
    );
  }

  // 7. Retornar en formato EmisorAdapter (lo persiste el handler en
  //    documentos_fiscales con la columna ncf=encf y track_id=trackId)
  return {
    proveedor_invoice_id: trackId,
    proveedor_number: encf,
    ncf: encf,
    request_payload: {
      tipo_ecf: tipoEcf,
      ambiente,
      xml_path: xmlPath,
      digest_value: digestValue,
      signature_value: signatureValue.slice(0, 100) + "...",
    },
    response_payload: recepcion,
  };
}

// ============================================================
// REGISTRO DE PROVEEDORES
// ============================================================
const ADAPTADORES = {
  alegra: {
    testConnection: alegraTestConnection,
    emitirFactura: alegraEmitirFactura,
  },
  dgii_directo: {
    testConnection: dgiiDirectoTestConnection,
    emitirFactura: dgiiDirectoEmitirFactura,
  },
  // Agregar aqui futuros adapters: alanube, dgmax, voxel, etc.
};

// ============================================================
// HANDLER PRINCIPAL
// ============================================================

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verificar autenticacion. Hay dos modos:
    //   1) Usuario normal con JWT — el tenant viene del profile.
    //   2) Cron / service-role con service_role key — el tenant
    //      viene de body.service_tenant_id o del header X-Tenant-Id.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No autorizado");
    const token = authHeader.replace("Bearer ", "");

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const isServiceRole = serviceKey && token === serviceKey;

    let tenantId;
    if (isServiceRole) {
      // Modo cron/system: confiar en body.service_tenant_id o header X-Tenant-Id
      tenantId = body.service_tenant_id || req.headers.get("X-Tenant-Id");
      if (!tenantId) {
        throw new Error("service_tenant_id requerido cuando se usa service_role");
      }
    } else {
      // Modo usuario normal: validar JWT y leer profile
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new Error("Token inválido");

      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user.id)
        .single();

      if (!profile?.tenant_id) throw new Error("Usuario sin tenant");
      tenantId = profile.tenant_id;
    }

    // ── ACTION: test_connection ──
    if (action === "test_connection") {
      const { proveedor, config } = body;
      const adaptador = ADAPTADORES[proveedor];
      if (!adaptador) throw new Error(`Proveedor '${proveedor}' no soportado`);

      const result = await adaptador.testConnection(config);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    // ── ACTION: emitir_factura ──
    if (action === "emitir_factura") {
      const { factura_id } = body;
      if (!factura_id) throw new Error("factura_id es requerido");

      // 1. Cargar integración del tenant
      const { data: integ, error: integError } = await supabase
        .from("integraciones_fiscales")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("activo", true)
        .single();

      if (integError || !integ) {
        throw new Error("No hay integración fiscal activa para esta empresa");
      }

      const adaptador = ADAPTADORES[integ.proveedor];
      if (!adaptador) throw new Error(`Proveedor '${integ.proveedor}' no soportado`);

      // 2. Cargar factura
      const { data: factura, error: facturaError } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id)
        .eq("tenant_id", tenantId)
        .single();

      if (facturaError || !factura) throw new Error("Factura no encontrada");

      // 3. Verificar que no esté ya emitida
      const { data: existingDoc } = await supabase
        .from("documentos_fiscales")
        .select("id, estado")
        .eq("factura_id", factura_id)
        .eq("estado", "emitido")
        .maybeSingle();

      if (existingDoc) {
        throw new Error("Esta factura ya tiene un documento fiscal emitido");
      }

      // 4. Cargar detalles
      const { data: detalles } = await supabase
        .from("facturas_detalle")
        .select("*")
        .eq("factura_id", factura_id);

      if (!detalles?.length) throw new Error("Factura sin detalle");

      // 5. Cargar cliente
      let cliente = null;
      if (factura.cliente_id) {
        const { data: clienteData } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", factura.cliente_id)
          .single();
        cliente = clienteData;
      }

      // 6. Crear registro pendiente
      const { data: docFiscal, error: docError } = await supabase
        .from("documentos_fiscales")
        .insert({
          tenant_id: tenantId,
          factura_id: factura.id,
          proveedor: integ.proveedor,
          tipo_documento: "factura",
          estado: "procesando",
        })
        .select()
        .single();

      if (docError) throw new Error(`Error creando documento fiscal: ${docError.message}`);

      // 7. Emitir via adaptador
      try {
        const resultado = await adaptador.emitirFactura(
          supabase, integ.config, factura, detalles, cliente
        );

        // 8. Actualizar como emitido
        // Para DGII directo, persistir tambien tipo_ecf, track_id, xml_path, ambiente
        const updatePayload = {
          estado: "emitido",
          proveedor_invoice_id: resultado.proveedor_invoice_id,
          proveedor_number: resultado.proveedor_number,
          ncf: resultado.ncf,
          request_payload: resultado.request_payload,
          response_payload: resultado.response_payload,
          emitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (integ.proveedor === "dgii_directo") {
          updatePayload.track_id = resultado.proveedor_invoice_id;  // mismo valor
          updatePayload.encf = resultado.ncf;
          updatePayload.tipo_ecf = resultado.request_payload?.tipo_ecf || null;
          updatePayload.ambiente = resultado.request_payload?.ambiente || null;
          updatePayload.xml_firmado_path = resultado.request_payload?.xml_path || null;
          updatePayload.estado_dgii = "enviado";  // a la espera del ARECF
        }
        await supabase
          .from("documentos_fiscales")
          .update(updatePayload)
          .eq("id", docFiscal.id);

        return new Response(JSON.stringify({
          ok: true,
          factura_id: factura.id,
          proveedor_invoice_id: resultado.proveedor_invoice_id,
          proveedor_number: resultado.proveedor_number,
          ncf: resultado.ncf,
        }), { status: 200, headers: corsHeaders });

      } catch (emitError) {
        // Marcar como error
        await supabase
          .from("documentos_fiscales")
          .update({
            estado: "error",
            error_message: emitError.message,
            retry_count: (docFiscal.retry_count || 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq("id", docFiscal.id);

        throw emitError;
      }
    }

    // ── ACTION: dgii_save_certificate_meta ──
    // Llamada por el frontend DESPUES de subir el .p12 al Storage privado
    // (path: <tenant_id>/certificado.p12). Recibe el password en plaintext,
    // lo cifra con la master key y lo guarda en integraciones_fiscales.config.
    if (action === "dgii_save_certificate_meta") {
      const { rnc_emisor, nombre_emisor, ambiente, callback_url, certificado_password, storage_path } = body;

      if (!certificado_password) throw new Error("certificado_password es requerido");
      if (!storage_path) throw new Error("storage_path es requerido");

      // Cifrar password
      const { iv, ciphertext } = await encryptPassword(certificado_password);

      const config = {
        rnc_emisor: rnc_emisor || null,
        nombre_emisor: nombre_emisor || null,
        ambiente: ambiente || "TesteCF",
        callback_url: callback_url || null,
        certificado_storage_path: storage_path,
        certificado_password_enc: ciphertext,
        certificado_password_iv: iv,
      };

      // Upsert en integraciones_fiscales (una fila por tenant + proveedor)
      const { data: existente } = await supabase
        .from("integraciones_fiscales")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();

      if (existente) {
        const { error: updErr } = await supabase
          .from("integraciones_fiscales")
          .update({ config, activo: true, updated_at: new Date().toISOString() })
          .eq("id", existente.id);
        if (updErr) throw new Error(`Error guardando config: ${updErr.message}`);
      } else {
        const { error: insErr } = await supabase
          .from("integraciones_fiscales")
          .insert({
            tenant_id: tenantId,
            proveedor: "dgii_directo",
            config,
            activo: true,
          });
        if (insErr) throw new Error(`Error creando integracion: ${insErr.message}`);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: corsHeaders,
      });
    }

    // ── ACTION: dgii_test_xml_generation ──
    // DEV/QA: dado un factura_id existente, genera el XML del e-CF
    // que se enviaria a DGII (sin firmar, sin enviar). Util para
    // inspeccionar visualmente que el XML tiene la forma correcta
    // antes de avanzar con firma y envio.
    if (action === "dgii_test_xml_generation") {
      const { factura_id, encf_override } = body;
      if (!factura_id) throw new Error("factura_id requerido");

      // Cargar config del emisor
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo para este tenant");

      // Cargar factura + detalles + cliente
      const { data: factura, error: fErr } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id)
        .eq("tenant_id", tenantId)
        .single();
      if (fErr || !factura) throw new Error("Factura no encontrada");

      const { data: detalles } = await supabase
        .from("facturas_detalle")
        .select("*")
        .eq("factura_id", factura_id);
      if (!detalles?.length) throw new Error("Factura sin detalle");

      let cliente = null;
      if (factura.cliente_id) {
        const { data: c } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", factura.cliente_id)
          .maybeSingle();
        cliente = c;
      }

      // Determinar tipo_ecf basado en si el cliente tiene RNC (B2B=31, B2C=32)
      const isB2B = !!(cliente && cliente.rnc && String(cliente.rnc).trim().length > 0);
      const detectedTipo = isB2B ? "31" : "32";
      // Generar e-NCF de prueba que coincida con el tipo detectado
      const encf = encf_override || `E${detectedTipo}0000000001`;

      let xml, input;
      try {
        input = facturaToEcfInput(factura, detalles, cliente, integ.config, encf);
        xml = buildEcfXml(input.tipo_ecf, input);
      } catch (xmlErr) {
        // Error con contexto: que datos teniamos
        throw new Error(
          `Generando XML: ${xmlErr.message} | factura.numero=${factura.numero} cliente_id=${factura.cliente_id || 'null'} detalles=${detalles?.length || 0} config_keys=${Object.keys(integ.config || {}).join(',')}`
        );
      }

      return new Response(JSON.stringify({
        ok: true,
        encf,
        tipo_ecf: input.tipo_ecf,
        xml,
        input,  // util para debugging
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_test_xml_sign ──
    // DEV/QA: toma una factura, genera el XML del e-CF, lo FIRMA
    // con el .p12 cargado y devuelve el XML firmado para inspeccion.
    // Sin enviar a DGII todavia. Util para validar el chunk 3d.
    if (action === "dgii_test_xml_sign") {
      const { factura_id, encf_override } = body;
      if (!factura_id) throw new Error("factura_id requerido");

      // 1. Cargar config del emisor
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo para este tenant");

      // 2. Cargar factura + detalles + cliente
      const { data: factura, error: fErr } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id)
        .eq("tenant_id", tenantId)
        .single();
      if (fErr || !factura) throw new Error("Factura no encontrada");

      const { data: detalles } = await supabase
        .from("facturas_detalle")
        .select("*")
        .eq("factura_id", factura_id);
      if (!detalles?.length) throw new Error("Factura sin detalle");

      let cliente = null;
      if (factura.cliente_id) {
        const { data: c } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", factura.cliente_id)
          .maybeSingle();
        cliente = c;
      }

      // 3. Generar XML
      const isB2B = !!(cliente && cliente.rnc && String(cliente.rnc).trim().length > 0);
      const tipoEcf = isB2B ? "31" : "32";
      const encf = encf_override || `E${tipoEcf}0000000001`;

      let xml, input;
      try {
        input = facturaToEcfInput(factura, detalles, cliente, integ.config, encf);
        xml = buildEcfXml(input.tipo_ecf, input);
      } catch (xmlErr) {
        throw new Error(
          `Generando XML: ${xmlErr.message} | factura.numero=${factura.numero} cliente_id=${factura.cliente_id || 'null'} detalles=${detalles?.length || 0}`
        );
      }

      // 4. Cargar el .p12 + descifrar password + parsear (cert + privateKey)
      const { cert, privateKey, metadata } = await loadAndParseP12(supabase, integ.config);

      // 5. Firmar el XML
      let firmado;
      try {
        firmado = await signEcfXml(xml, cert, privateKey);
      } catch (signErr) {
        throw new Error(`Firmando XML: ${signErr.message}`);
      }

      return new Response(JSON.stringify({
        ok: true,
        encf,
        tipo_ecf: input.tipo_ecf,
        xml_sin_firmar: xml,
        xml_firmado: firmado.xmlFirmado,
        digest_value: firmado.digestValue,
        signature_value_preview: firmado.signatureValue.slice(0, 80) + "...",
        cert_metadata: metadata,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_test_nota_xml ──
    // DEV/QA: simula una nota (33 o 34) sobre una factura existente.
    // El usuario pasa: factura_id_original, tipo ('33' o '34'),
    // codigo_modificacion (1-6), razon (opcional), e items del ajuste
    // (si no se pasan, asume 100% devolucion = todos los items originales).
    if (action === "dgii_test_nota_xml") {
      const {
        factura_id_original,
        tipo: tipoSolicitado,
        codigo_modificacion,
        razon_modificacion,
        items_ajuste,
        encf_override,
      } = body;
      if (!factura_id_original) throw new Error("factura_id_original requerido");

      const tipo = (tipoSolicitado === "33" || tipoSolicitado === "debito") ? "33" : "34";

      // 1. Cargar config del emisor
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");

      // 2. Cargar factura original (que se modifica)
      const { data: facturaOrig } = await supabase
        .from("facturas")
        .select("*")
        .eq("id", factura_id_original)
        .eq("tenant_id", tenantId)
        .single();
      if (!facturaOrig) throw new Error("Factura original no encontrada");

      // 3. Necesitamos su e-NCF. Si la factura ya fue emitida via DGII directo,
      //    tendra documentos_fiscales con encf. Si no, el ncf de la factura.
      let encfOriginal = facturaOrig.ncf;
      if (!encfOriginal || !encfOriginal.match(/^E\d{12}$/)) {
        // buscar en documentos_fiscales
        const { data: docOrig } = await supabase
          .from("documentos_fiscales")
          .select("encf")
          .eq("factura_id", factura_id_original)
          .eq("tenant_id", tenantId)
          .not("encf", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        encfOriginal = docOrig?.encf;
      }
      if (!encfOriginal || !encfOriginal.match(/^E\d{12}$/)) {
        // Fallback: usar un encf placeholder de prueba (E31...)
        encfOriginal = "E310000000001";
      }

      // 4. Items del ajuste — si no se pasan, usamos todos los detalles
      //    de la factura original (devolucion total)
      let itemsNota = items_ajuste;
      if (!Array.isArray(itemsNota) || itemsNota.length === 0) {
        const { data: detalles } = await supabase
          .from("facturas_detalle")
          .select("*")
          .eq("factura_id", factura_id_original);
        itemsNota = (detalles || []).map(d => ({
          descripcion: d.descripcion,
          cantidad: d.cantidad,
          precio: d.precio,
          descuento: d.descuento,
          itbis_pct: d.itbis_pct,
          importe: d.importe,
        }));
      }

      // 5. Cargar cliente (si la factura era B2B)
      let cliente = null;
      if (facturaOrig.cliente_id) {
        const { data: c } = await supabase
          .from("clientes")
          .select("*")
          .eq("id", facturaOrig.cliente_id)
          .maybeSingle();
        cliente = c;
      }

      // 6. e-NCF de la nota (placeholder para test)
      const encf = encf_override || `E${tipo}0000000001`;

      // 7. Generar input + XML
      let xml, input;
      try {
        input = notaToEcfInput(
          { fecha: new Date().toISOString(), items: itemsNota, tipo: tipo === "33" ? "debito" : "credito" },
          { ncf: encfOriginal, fecha: facturaOrig.fecha, numero: facturaOrig.numero, cliente_id: facturaOrig.cliente_id },
          cliente,
          integ.config,
          encf,
          { codigo_modificacion: codigo_modificacion || "3", razon_modificacion: razon_modificacion || null }
        );
        xml = buildEcfXml(input.tipo_ecf, input);
      } catch (xmlErr) {
        throw new Error(
          `Generando XML Tipo ${tipo}: ${xmlErr.message} | factura_orig=${facturaOrig.numero} encf_orig=${encfOriginal} items=${itemsNota.length}`
        );
      }

      return new Response(JSON.stringify({
        ok: true,
        encf,
        tipo_ecf: tipo,
        encf_modificado: encfOriginal,
        codigo_modificacion: input.referencia.codigo_modificacion,
        xml,
        input,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_sign_external_xml ──
    // Firma cualquier XML externo (ej. el XML de postulacion FI-GDF-016
    // que genera DGII en OFV) con el .p12 del tenant. Util para tramites
    // administrativos en OFV que requieren firma del emisor.
    if (action === "dgii_sign_external_xml") {
      const { xml } = body;
      if (!xml || typeof xml !== "string") throw new Error("xml requerido (string)");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Sube tu .p12 primero en Configuracion → Integracion Fiscal");

      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const { xmlFirmado, digestValue, signatureValue, _diag } = await signXmlGenerico(xml, cert, privateKey);

      return new Response(JSON.stringify({
        ok: true,
        xml_firmado: xmlFirmado,
        // DEBUG: info para diagnosticar "Firma Invalida"
        _debug: {
          xml_input_length: xml.length,
          xml_input_first100: xml.substring(0, 100),
          xml_input_has_crlf: xml.includes("\r\n"),
          xml_input_has_xmldecl: xml.startsWith("<?xml"),
          digest_value: digestValue,
          signature_value_preview: signatureValue?.slice(0, 60),
          xml_firmado_length: xmlFirmado.length,
          // bytes exactos canonicalizados (base64) para verificar offline
          canonical1_b64: _diag?.canonical1_b64,
          canonical1_len: _diag?.canonical1_len,
          canonicalSignedInfo_b64: _diag?.canonicalSignedInfo_b64,
          canonicalSignedInfo_len: _diag?.canonicalSignedInfo_len,
        },
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_certif_send_row ──
    // Procesa UNA fila del set de pruebas DGII (Paso 2 certificacion).
    // El frontend parsea el xlsx y manda fila por fila para mostrar
    // progreso en UI sin timeouts.
    //
    // Body: { row: <fila xlsx>, kind: 'ECF' | 'RFCE' }
    // Returns: { ok, encf, tipo_ecf, track_id, estado_dgii, xml_firmado, errors? }
    if (action === "dgii_certif_send_row") {
      const { row, kind, ecf_row } = body;
      if (!row) throw new Error("row requerido");
      const sheetKind = (kind || "ECF").toUpperCase();
      const tipoEcf = String(row.TipoeCF || "").trim();
      const encf = String(row.ENCF || "").trim();
      if (!tipoEcf || !encf) throw new Error("La fila no tiene TipoeCF/ENCF");

      // 1. Cargar config + cert
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente. Sube tu .p12 primero.");
      const ambiente = integ.config.ambiente || "TesteCF";

      // 2. Para RFCE: derivar CodigoSeguridadeCF de la firma del ECF Tipo 32
      //    correspondiente (estilo dgii-ecf: primeros 6 chars del SignatureValue).
      //    NO agregamos salt — la spec DGII pide que el mismo ECF se envie
      //    despues del RFCE (Fase 4). Si el RFCE usa codigo derivado del
      //    SignatureValue del ECF original, ambos comparten el mismo codigo
      //    y DGII los matchea correctamente.
      let codigoSegRfce = null;
      if (sheetKind === "RFCE") {
        if (!ecf_row) {
          return new Response(JSON.stringify({
            ok: false,
            step: "build",
            error: "Para RFCE se requiere ecf_row (fila ECF correspondiente con mismo ENCF)",
            encf, tipo_ecf: tipoEcf,
          }), { status: 200, headers: corsHeaders });
        }
        try {
          const xmlEcf = buildEcfFromTestRow(ecf_row);
          const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
          const signedEcf = await signEcfXml(xmlEcf, cert, privateKey);
          codigoSegRfce = (signedEcf.signatureValue || "").slice(0, 6);
          if (!codigoSegRfce || codigoSegRfce.length !== 6) {
            throw new Error(`No se pudo extraer codigo de seguridad valido (got: '${codigoSegRfce}')`);
          }
        } catch (e) {
          return new Response(JSON.stringify({
            ok: false,
            step: "derive_codigo",
            error: e.message,
            encf, tipo_ecf: tipoEcf,
          }), { status: 200, headers: corsHeaders });
        }
      }

      // 3. Generar XML segun kind (RFCE recibe codigo derivado)
      let xmlSinFirmar;
      let codigoSegDebug = null;
      try {
        if (sheetKind === "RFCE") {
          // Inyectar el codigo derivado en la row antes de buildear
          xmlSinFirmar = buildRfceFromTestRow({ ...row, CodigoSeguridadeCF: codigoSegRfce });
        } else {
          xmlSinFirmar = buildEcfFromTestRow(row);
        }
        const m = xmlSinFirmar.match(/<CodigoSeguridadeCF>([^<]+)<\/CodigoSeguridadeCF>/);
        codigoSegDebug = m?.[1] || null;
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false,
          step: "build",
          error: e.message,
          encf, tipo_ecf: tipoEcf,
        }), { status: 200, headers: corsHeaders });
      }

      // 3. Firmar
      let xmlFirmado;
      try {
        const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
        const signed = await signEcfXml(xmlSinFirmar, cert, privateKey);
        xmlFirmado = signed.xmlFirmado;

        // 4. Auth + enviar
        // CRITICO: filename debe ser <RNC><eNCF>.xml (DGII rechaza otros).
        const rncEmisor = String(row.RNCEmisor || integ.config.rnc_emisor || "").replace(/\D/g, "");
        const fileName = `${rncEmisor}${encf}.xml`;
        const auth = await authenticate(cert, privateKey, ambiente);
        const recepcion = sheetKind === "RFCE"
          ? await enviarRfce(xmlFirmado, auth.token, ambiente, fileName)
          : await enviarEcf(xmlFirmado, auth.token, ambiente, fileName);

        return new Response(JSON.stringify({
          ok: true,
          encf,
          tipo_ecf: tipoEcf,
          kind: sheetKind,
          track_id: recepcion.trackId || recepcion.TrackId || null,
          estado_dgii: recepcion.estado || recepcion.Estado || "enviado",
          response_payload: recepcion,
          xml_firmado_length: xmlFirmado.length,
          codigo_seguridad: codigoSegDebug,
        }), { status: 200, headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({
          ok: false,
          step: "send",
          error: e.message,
          encf, tipo_ecf: tipoEcf,
          xml_firmado_length: xmlFirmado?.length || 0,
          codigo_seguridad: codigoSegDebug,
        }), { status: 200, headers: corsHeaders });
      }
    }

    // ── ACTION: dgii_certif_sign_only ──
    // Genera + firma el XML de un caso (Fase 4 ECF Tipo 32 < 250K) pero NO
    // lo envia a DGII. El XML firmado se devuelve para que el frontend lo
    // descargue y el usuario lo suba MANUALMENTE en el portal DGII (cajita
    // "Facturas de consumo < 250Mil").
    if (action === "dgii_certif_sign_only") {
      const { row } = body;
      if (!row) throw new Error("row requerido");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente");

      const xmlSinFirmar = buildEcfFromTestRow(row);
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const signed = await signEcfXml(xmlSinFirmar, cert, privateKey);

      return new Response(JSON.stringify({
        ok: true,
        xml_firmado: signed.xmlFirmado,
        xml_firmado_length: signed.xmlFirmado.length,
        encf: row.ENCF,
        tipo_ecf: String(row.TipoeCF),
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_certif_check_status ──
    // Consulta el estado en DGII de un TrackId previamente enviado.
    if (action === "dgii_certif_check_status") {
      const { track_id } = body;
      if (!track_id) throw new Error("track_id requerido");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("Config DGII directo ausente");
      const ambiente = integ.config.ambiente || "TesteCF";

      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const auth = await authenticate(cert, privateKey, ambiente);
      const estado = await consultarEstado(track_id, auth.token, ambiente);

      return new Response(JSON.stringify({
        ok: true,
        track_id,
        estado,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_send_to_dgii ──
    // FLUJO COMPLETO: factura → XML → firma → auth DGII → envio → TrackId
    // Tambien escribe en documentos_fiscales y guarda el XML en Storage.
    if (action === "dgii_send_to_dgii") {
      const { factura_id, encf_override } = body;
      if (!factura_id) throw new Error("factura_id requerido");

      // 1. Cargar config
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");
      const ambiente = integ.config.ambiente || "TesteCF";

      // 2. Cargar factura + detalles + cliente
      const { data: factura } = await supabase
        .from("facturas").select("*").eq("id", factura_id).eq("tenant_id", tenantId).single();
      if (!factura) throw new Error("Factura no encontrada");

      const { data: detalles } = await supabase
        .from("facturas_detalle").select("*").eq("factura_id", factura_id);
      if (!detalles?.length) throw new Error("Factura sin detalle");

      let cliente = null;
      if (factura.cliente_id) {
        const { data: c } = await supabase
          .from("clientes").select("*").eq("id", factura.cliente_id).maybeSingle();
        cliente = c;
      }

      // 3. Generar e-NCF (en test usamos placeholder; en produccion get_next_encf)
      const isB2B = !!(cliente?.rnc);
      const tipoEcf = isB2B ? "31" : "32";
      const encf = encf_override || `E${tipoEcf}0000000001`;

      // 4. Iniciar log
      const docFiscal = await logEcfStart(supabase, {
        tenantId, factura_id, tipo_ecf: tipoEcf, encf, ambiente,
      });

      try {
        // 5. Generar XML
        const input = facturaToEcfInput(factura, detalles, cliente, integ.config, encf);
        const xmlSinFirmar = buildEcfXml(input.tipo_ecf, input);

        // 6. Cargar .p12 y firmar
        const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
        const { xmlFirmado } = await signEcfXml(xmlSinFirmar, cert, privateKey);

        // 7. Guardar XML firmado en Storage (para retencion 10 anos)
        const xmlPath = await uploadSignedXml(supabase, tenantId, encf, xmlFirmado);
        await logEcfXmlGenerated(supabase, docFiscal.id, xmlPath, { input });

        // 8. Autenticar contra DGII y enviar
        const auth = await authenticate(cert, privateKey, ambiente);
        const recepcion = await enviarEcf(xmlFirmado, auth.token, ambiente);
        const trackId = recepcion.trackId || recepcion.TrackId || recepcion.trackid;

        if (!trackId) {
          throw new Error(`DGII no devolvio TrackId. Respuesta: ${JSON.stringify(recepcion).slice(0, 300)}`);
        }

        // 9. Registrar envio
        await logEcfSent(supabase, docFiscal.id, trackId);

        return new Response(JSON.stringify({
          ok: true,
          encf,
          tipo_ecf: tipoEcf,
          ambiente,
          trackId,
          xml_path: xmlPath,
          recepcion,
          documento_id: docFiscal.id,
        }), { status: 200, headers: corsHeaders });

      } catch (err) {
        await logEcfError(supabase, docFiscal.id, err.message || String(err));
        throw err;
      }
    }

    // ── ACTION: dgii_consultar_estado ──
    // Dado un TrackId, consulta a DGII el estado actual del e-CF.
    if (action === "dgii_consultar_estado") {
      const { track_id, documento_id } = body;
      if (!track_id) throw new Error("track_id requerido");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");
      const ambiente = integ.config.ambiente || "TesteCF";

      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const auth = await authenticate(cert, privateKey, ambiente);
      const estado = await consultarEstado(track_id, auth.token, ambiente);

      // Normalizar estado para nuestra columna estado_dgii
      const estadoNormalizado = (() => {
        const e = String(estado.estado || estado.codigo || "").toLowerCase();
        if (e.includes("aceptado_condicional") || e.includes("condicional")) return "aceptado_condicional";
        if (e.includes("aceptado") || e === "1") return "aceptado";
        if (e.includes("rechazado") || e === "0") return "rechazado";
        return "enviado";
      })();

      // Si nos dieron un documento_id, actualizamos la fila
      if (documento_id) {
        await logEcfArecf(supabase, documento_id, estadoNormalizado, estado);
      }

      return new Response(JSON.stringify({
        ok: true,
        track_id,
        ambiente,
        estado: estadoNormalizado,
        respuesta: estado,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_list_documentos ──
    // Devuelve los documentos fiscales del tenant (con filtros opcionales).
    // Util para una pestaña/lista de "e-CF emitidos" en el frontend.
    if (action === "dgii_list_documentos") {
      const { tipo_ecf, estado, desde, hasta, limit } = body;
      let query = supabase
        .from("documentos_fiscales")
        .select("id, factura_id, tipo_ecf, encf, track_id, estado, estado_dgii, aecf_estado, ambiente, emitted_at, arecf_recibido_at, error_message, xml_firmado_path, created_at")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .order("created_at", { ascending: false })
        .limit(Math.min(parseInt(limit) || 100, 500));

      if (tipo_ecf) query = query.eq("tipo_ecf", tipo_ecf);
      if (estado)   query = query.eq("estado", estado);
      if (desde)    query = query.gte("created_at", desde);
      if (hasta)    query = query.lte("created_at", hasta);

      const { data, error } = await query;
      if (error) throw new Error(`Error listando documentos: ${error.message}`);

      return new Response(JSON.stringify({ ok: true, documentos: data || [] }), {
        status: 200, headers: corsHeaders,
      });
    }

    // ── ACTION: dgii_validate_certificate ──
    // Carga el .p12 desde Storage, descifra el password con la master key,
    // parsea el certificado con node-forge y devuelve metadata. Tambien
    // persiste la metadata en integraciones_fiscales.config.metadata.
    if (action === "dgii_validate_certificate") {
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("id, config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();

      if (!integ) throw new Error("No hay configuracion DGII directo para este tenant");

      const { metadata } = await loadAndParseP12(supabase, integ.config);

      // Persistir metadata en config para mostrarla sin re-cargar el .p12
      const newConfig = { ...(integ.config || {}), metadata };
      await supabase
        .from("integraciones_fiscales")
        .update({ config: newConfig, updated_at: new Date().toISOString() })
        .eq("id", integ.id);

      return new Response(JSON.stringify({ ok: true, metadata }), {
        status: 200, headers: corsHeaders,
      });
    }

    // ── ACTION: dgii_delete_certificate ──
    // Elimina el .p12 del Storage y la fila de integraciones_fiscales
    // para el proveedor 'dgii_directo' del tenant. Deja el sistema
    // como si nunca se hubiera configurado.
    if (action === "dgii_delete_certificate") {
      // 1. Cargar la integracion existente para conocer el path
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("id, config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();

      // 2. Borrar el archivo del Storage si esta el path
      if (integ?.config?.certificado_storage_path) {
        const path = integ.config.certificado_storage_path;
        const { error: rmErr } = await supabase.storage
          .from("certificados-dgii")
          .remove([path]);
        if (rmErr) {
          // No bloqueante: dejamos log y seguimos limpiando la BD
          console.warn("[emitir-fiscal] no se pudo borrar del storage:", rmErr.message);
        }
      }

      // 3. Borrar la fila de integraciones_fiscales
      if (integ?.id) {
        const { error: delErr } = await supabase
          .from("integraciones_fiscales")
          .delete()
          .eq("id", integ.id);
        if (delErr) throw new Error(`Error borrando integracion: ${delErr.message}`);
      }

      return new Response(JSON.stringify({ ok: true, deleted: !!integ?.id }), {
        status: 200, headers: corsHeaders,
      });
    }

    // ── ACTION: dgii_certificate_info ──
    // Devuelve metadata del certificado actual del tenant (si existe).
    // No descifra el password ni descarga el .p12 — solo info publica.
    if (action === "dgii_certificate_info") {
      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config, activo, updated_at")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();

      if (!integ) {
        return new Response(JSON.stringify({ ok: true, configured: false }), {
          status: 200, headers: corsHeaders,
        });
      }

      const cfg = integ.config || {};
      return new Response(JSON.stringify({
        ok: true,
        configured: !!cfg.certificado_storage_path,
        rnc_emisor: cfg.rnc_emisor,
        nombre_emisor: cfg.nombre_emisor,
        ambiente: cfg.ambiente,
        callback_url: cfg.callback_url,
        storage_path: cfg.certificado_storage_path,
        metadata: cfg.metadata || null,
        activo: integ.activo,
        updated_at: integ.updated_at,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_anular_ecf ──
    // Anula uno o varios e-NCF previamente emitidos. Genera un ANECF
    // firmado y lo envia al endpoint de anulaciones.
    if (action === "dgii_anular_ecf") {
      const { ncf_inicial, ncf_final, fecha_anulacion } = body;
      if (!ncf_inicial) throw new Error("ncf_inicial requerido");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");
      const ambiente = integ.config.ambiente || "TesteCF";

      // 1. Generar ANECF
      const anecfInput = {
        rnc_emisor: integ.config.rnc_emisor,
        fecha_anulacion: fecha_anulacion || new Date().toISOString(),
        ncf_inicial,
        ncf_final: ncf_final || ncf_inicial,
      };
      const anecfXml = buildAnecfXml(anecfInput);

      // 2. Cargar .p12 + firmar
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const { xmlFirmado } = await signXmlGenerico(anecfXml, cert, privateKey);

      // 3. Autenticar y enviar
      const auth = await authenticate(cert, privateKey, ambiente);
      const respuesta = await enviarAnulacion(xmlFirmado, auth.token, ambiente);

      // 4. Marcar las filas en documentos_fiscales como anuladas
      // (todos los e-NCF en el rango)
      await supabase
        .from("documentos_fiscales")
        .update({
          estado: "anulado",
          estado_dgii: "anulado",
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId)
        .gte("encf", ncf_inicial)
        .lte("encf", ncf_final || ncf_inicial);

      return new Response(JSON.stringify({
        ok: true,
        ambiente,
        ncf_inicial,
        ncf_final: ncf_final || ncf_inicial,
        respuesta,
      }), { status: 200, headers: corsHeaders });
    }

    // ── ACTION: dgii_enviar_rfce ──
    // Envia un Resumen de Facturas de Consumo (Tipo 32) en batch.
    // Toma todos los e-CF Tipo 32 del rango de fechas que aun no se
    // hayan reportado, los firma juntos en un RFCE y envia a DGII.
    if (action === "dgii_enviar_rfce") {
      const { fecha_inicio, fecha_fin } = body;
      if (!fecha_inicio || !fecha_fin) throw new Error("fecha_inicio y fecha_fin requeridos");

      const { data: integ } = await supabase
        .from("integraciones_fiscales")
        .select("config")
        .eq("tenant_id", tenantId)
        .eq("proveedor", "dgii_directo")
        .maybeSingle();
      if (!integ?.config) throw new Error("No hay config DGII directo");
      const ambiente = integ.config.ambiente || "TesteCF";

      // 1. Cargar todos los Tipo 32 del rango que aun no fueron incluidos en RFCE
      const { data: docs, error: docsErr } = await supabase
        .from("documentos_fiscales")
        .select("id, encf, factura_id")
        .eq("tenant_id", tenantId)
        .eq("tipo_ecf", "32")
        .gte("emitted_at", fecha_inicio)
        .lte("emitted_at", fecha_fin)
        .is("track_id", null);  // no enviados aun (RFCE no asigna trackId individual)
      if (docsErr) throw new Error(`Error cargando docs: ${docsErr.message}`);
      if (!docs?.length) throw new Error("No hay e-CF Tipo 32 pendientes en el rango");

      // 2. Cargar las facturas para obtener montos
      const facturaIds = docs.map(d => d.factura_id).filter(Boolean);
      const { data: facturas } = await supabase
        .from("facturas")
        .select("id, total, itbis, subtotal")
        .in("id", facturaIds);
      const factById = new Map((facturas || []).map(f => [f.id, f]));

      const facturasResumen = docs.map(d => {
        const f = factById.get(d.factura_id) || {};
        return {
          encf: d.encf,
          monto_total: Number(f.total) || 0,
          total_itbis: Number(f.itbis) || 0,
          monto_gravado: Number(f.subtotal) || 0,
        };
      });

      // 3. Generar RFCE
      const rfceInput = {
        rnc_emisor: integ.config.rnc_emisor,
        fecha_inicio,
        fecha_fin,
        facturas: facturasResumen,
      };
      const rfceXml = buildRfceXml(rfceInput);

      // 4. Cargar .p12 + firmar
      const { cert, privateKey } = await loadAndParseP12(supabase, integ.config);
      const { xmlFirmado } = await signXmlGenerico(rfceXml, cert, privateKey);

      // 5. Autenticar y enviar
      const auth = await authenticate(cert, privateKey, ambiente);
      const respuesta = await enviarRfce(xmlFirmado, auth.token, ambiente);

      // 6. Marcar todos los docs como enviados via RFCE
      const trackId = respuesta.trackId || respuesta.TrackId || `RFCE-${Date.now()}`;
      await supabase
        .from("documentos_fiscales")
        .update({
          track_id: trackId,
          estado_dgii: "enviado_rfce",
          estado: "emitido",
          updated_at: new Date().toISOString(),
        })
        .in("id", docs.map(d => d.id));

      return new Response(JSON.stringify({
        ok: true,
        ambiente,
        cantidad_resumenes: facturasResumen.length,
        track_id: trackId,
        respuesta,
      }), { status: 200, headers: corsHeaders });
    }

    throw new Error(`Acción '${action}' no reconocida. Use: test_connection, emitir_factura, dgii_save_certificate_meta, dgii_certificate_info, dgii_validate_certificate, dgii_delete_certificate, dgii_list_documentos, dgii_test_xml_generation, dgii_test_xml_sign, dgii_test_nota_xml, dgii_send_to_dgii, dgii_consultar_estado, dgii_anular_ecf, dgii_enviar_rfce`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[emitir-fiscal] ERROR:", errorMessage);
    if (errorStack) console.error("[emitir-fiscal] STACK:", errorStack);
    return new Response(JSON.stringify({
      ok: false,
      error: errorMessage,
      // Include stack in dev/test for easier debugging (remove in production)
      _debug_stack: errorStack || null,
    }), { status: 400, headers: corsHeaders });
  }
});
