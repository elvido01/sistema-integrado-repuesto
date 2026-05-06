// @ts-nocheck
// deno-lint-ignore-file
//
// ============================================================
// Firma XAdES-BES para e-CF DGII (V2 — C14N Exclusive correcto)
// ============================================================
// Implementacion basada en @xmldom/xmldom (DOM parser) + C14N
// Exclusive 1.0 segun W3C (http://www.w3.org/2001/10/xml-exc-c14n#).
//
// Diferencias vs version 1 (que DGII rechazo con "Firma Invalida"):
//   - C14N estricto con ordenamiento de atributos y namespaces
//   - Manejo correcto de inherited namespaces
//   - Auto-close consistente
//   - Whitespace handling segun spec
//
// Estandares:
//   - W3C XML-DSig Core (1.0)
//   - W3C Exclusive XML Canonicalization 1.0
//   - ETSI TS 101 903 v1.4.2 (XAdES-BES)
//   - RSA-SHA256 (RSAwithSHA256)
// ============================================================

import forge from "https://esm.sh/node-forge@1.3.1";
import { DOMParser, XMLSerializer } from "https://esm.sh/@xmldom/xmldom@0.8.10";

// ────────────────────────────────────────────────
// C14N Exclusive 1.0 — implementacion W3C
// ────────────────────────────────────────────────
// Ref: https://www.w3.org/TR/xml-exc-c14n/
//
// Reglas principales:
//   1. UTF-8 encoding
//   2. Line breaks normalizados a LF (#xA)
//   3. Atributos ordenados: namespace URI primero, luego local name
//   4. Namespace declarations: solo las "visibly utilized" en este nodo
//   5. Empty elements expandidos: <a/> → <a></a>
//   6. Sin XML declaration (<?xml ...?>)
//   7. Default attributes incluidos
//   8. Caracter encoding en attribute values: " → &quot;, etc
//
// Esta implementacion cubre el subset que DGII espera (XMLs nuestros
// no tienen prefijos mixtos complejos ni inherited namespaces raros).

function escapeAttrValue(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#xD;")
    .replace(/\n/g, "&#xA;")
    .replace(/\t/g, "&#x9;");
}

function escapeText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#xD;");
}

// Recorre un nodo y produce su forma canonica segun C14N Exclusive.
// `inclusiveNs` es un set de prefijos namespace que deben incluirse
// aunque no se usen visiblemente (InclusiveNamespaces PrefixList).
function c14nExclusive(node, inheritedNsMap = new Map(), inclusiveNs = new Set()) {
  const NODE_TYPE_ELEMENT = 1;
  const NODE_TYPE_TEXT = 3;
  const NODE_TYPE_CDATA = 4;
  const NODE_TYPE_PI = 7;
  const NODE_TYPE_COMMENT = 8;
  const NODE_TYPE_DOC = 9;

  if (node.nodeType === NODE_TYPE_DOC) {
    // Procesar el elemento raiz
    let result = "";
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child.nodeType === NODE_TYPE_ELEMENT) {
        result += c14nExclusive(child, inheritedNsMap, inclusiveNs);
      } else if (child.nodeType === NODE_TYPE_PI) {
        result += `<?${child.target} ${child.data}?>`;
      }
      // Comentarios omitidos (C14N sin comentarios)
    }
    return result;
  }

  if (node.nodeType !== NODE_TYPE_ELEMENT) {
    if (node.nodeType === NODE_TYPE_TEXT || node.nodeType === NODE_TYPE_CDATA) {
      return escapeText(node.data || "");
    }
    return "";
  }

  // Es un elemento
  const localName = node.localName || node.tagName;
  const prefix = node.prefix || "";
  const tagName = prefix ? `${prefix}:${localName}` : localName;

  // Recoger namespaces declarados en este nodo
  const declaredNs = new Map();
  const attrs = [];
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes[i];
      if (a.name === "xmlns") {
        declaredNs.set("", a.value);
      } else if (a.name.startsWith("xmlns:")) {
        const p = a.name.substring(6);
        declaredNs.set(p, a.value);
      } else {
        attrs.push(a);
      }
    }
  }

  // Determinar namespaces "visibly utilized" en este elemento
  // (es decir, el del propio elemento + el de cada atributo con prefijo)
  const visiblyUsed = new Set();
  if (prefix) visiblyUsed.add(prefix);
  for (const a of attrs) {
    if (a.prefix) visiblyUsed.add(a.prefix);
  }
  // El namespace default (sin prefix) tambien aplica si el elemento no tiene prefix
  if (!prefix && (declaredNs.has("") || inheritedNsMap.has(""))) {
    visiblyUsed.add("");
  }
  // Y los inclusivos forzados
  for (const p of inclusiveNs) visiblyUsed.add(p);

  // Construir la lista de namespace declarations a renderizar:
  // un namespace se renderiza si esta visiblyUsed y (no estaba en inherited
  // O su valor cambio respecto al heredado).
  const nsToRender = [];
  for (const p of visiblyUsed) {
    let value;
    if (declaredNs.has(p)) {
      value = declaredNs.get(p);
    } else if (inheritedNsMap.has(p)) {
      value = inheritedNsMap.get(p);
    } else {
      continue; // no hay declaracion ni heredada
    }
    const inheritedValue = inheritedNsMap.get(p);
    if (inheritedValue !== value) {
      nsToRender.push({ prefix: p, value });
    }
  }
  // Si declaredNs tiene prefijos no usados visiblyUsed, en C14N Exclusive
  // NO se renderizan (esa es la diferencia clave con C14N inclusivo).

  // Ordenar nsToRender por prefix (default primero, luego alfabetico)
  nsToRender.sort((a, b) => {
    if (a.prefix === "" && b.prefix !== "") return -1;
    if (b.prefix === "" && a.prefix !== "") return 1;
    return a.prefix.localeCompare(b.prefix);
  });

  // Ordenar atributos por (namespace URI, local name)
  attrs.sort((a, b) => {
    const nsA = a.namespaceURI || "";
    const nsB = b.namespaceURI || "";
    if (nsA !== nsB) return nsA.localeCompare(nsB);
    return (a.localName || a.name).localeCompare(b.localName || b.name);
  });

  // Build inherited map for children
  const newInherited = new Map(inheritedNsMap);
  for (const { prefix: p, value } of nsToRender) {
    newInherited.set(p, value);
  }
  // Tambien actualizar con cualquier ns declarado aqui (por si se usa en hijos)
  for (const [p, v] of declaredNs) {
    newInherited.set(p, v);
  }

  // Apertura del tag
  let result = `<${tagName}`;

  for (const { prefix: p, value } of nsToRender) {
    if (p === "") {
      result += ` xmlns="${escapeAttrValue(value)}"`;
    } else {
      result += ` xmlns:${p}="${escapeAttrValue(value)}"`;
    }
  }
  for (const a of attrs) {
    const aName = a.prefix ? `${a.prefix}:${a.localName || a.name}` : (a.localName || a.name);
    result += ` ${aName}="${escapeAttrValue(a.value)}"`;
  }
  result += ">";

  // Procesar hijos
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === NODE_TYPE_ELEMENT) {
      result += c14nExclusive(child, newInherited, inclusiveNs);
    } else if (child.nodeType === NODE_TYPE_TEXT || child.nodeType === NODE_TYPE_CDATA) {
      result += escapeText(child.data || "");
    } else if (child.nodeType === NODE_TYPE_PI) {
      result += `<?${child.target} ${child.data}?>`;
    }
    // Comentarios omitidos
  }

  // Cierre — siempre con tag explicito (no auto-close)
  result += `</${tagName}>`;
  return result;
}

// Aplica enveloped-signature transform: remover el ds:Signature del DOM
// antes de canonicalizar (para que el digest no se incluya a si mismo).
// En nuestro caso, antes de firmar el XML AUN no tiene Signature, asi que
// este transform es identidad. Lo dejamos documentado para el flujo de
// verificacion futura.

// ────────────────────────────────────────────────
// Helpers de hash y firma
// ────────────────────────────────────────────────

async function sha256Base64(text) {
  const data = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuf)));
}

function certToBase64(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return forge.util.encode64(der);
}

function certFingerprintSha256(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return forge.util.encode64(md.digest().getBytes());
}

function signRsaSha256(privateKey, dataString) {
  const md = forge.md.sha256.create();
  md.update(dataString, "utf8");
  const sig = privateKey.sign(md);
  return forge.util.encode64(sig);
}

// ────────────────────────────────────────────────
// Construye SignedInfo
// ────────────────────────────────────────────────

function buildSignedInfoXml(digestValue) {
  return `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></ds:SignatureMethod>` +
    `<ds:Reference URI="">` +
      `<ds:Transforms>` +
        `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform>` +
        `<ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"></ds:Transform>` +
      `</ds:Transforms>` +
      `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
      `<ds:DigestValue>${digestValue}</ds:DigestValue>` +
    `</ds:Reference>` +
  `</ds:SignedInfo>`;
}

function buildKeyInfoXml(cert) {
  const certB64 = certToBase64(cert);
  return `<ds:KeyInfo>` +
    `<ds:X509Data>` +
      `<ds:X509Certificate>${certB64}</ds:X509Certificate>` +
    `</ds:X509Data>` +
  `</ds:KeyInfo>`;
}

function buildQualifyingPropertiesXml(cert) {
  const fp = certFingerprintSha256(cert);
  const issuer = cert.issuer.attributes
    .map(a => `${a.shortName || a.name}=${a.value}`)
    .reverse()
    .join(",");
  const serial = cert.serialNumber;
  const signingTime = new Date().toISOString();

  return `<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#Signature">` +
    `<xades:SignedProperties Id="SignedProperties">` +
      `<xades:SignedSignatureProperties>` +
        `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
        `<xades:SigningCertificate>` +
          `<xades:Cert>` +
            `<xades:CertDigest>` +
              `<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></ds:DigestMethod>` +
              `<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${fp}</ds:DigestValue>` +
            `</xades:CertDigest>` +
            `<xades:IssuerSerial>` +
              `<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuer}</ds:X509IssuerName>` +
              `<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serial}</ds:X509SerialNumber>` +
            `</xades:IssuerSerial>` +
          `</xades:Cert>` +
        `</xades:SigningCertificate>` +
      `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>` +
  `</xades:QualifyingProperties>`;
}

// ────────────────────────────────────────────────
// API: firmar XML usando DOM + C14N exclusiva W3C
// ────────────────────────────────────────────────

function canonicalizeViaDom(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");
  // El root real (saltando processing instructions y whitespace)
  const root = doc.documentElement;
  if (!root) throw new Error("XML sin elemento raiz");
  return c14nExclusive(root);
}

// Calcular digest del XML SIN la firma (enveloped-signature transform)
async function digestEnveloped(xmlString) {
  // No hay <ds:Signature> aun, asi que canonicalize direct.
  const canonical = canonicalizeViaDom(xmlString);
  return await sha256Base64(canonical);
}

// Canonicalizar SOLO el bloque SignedInfo (en su contexto namespace)
async function canonicalizeSignedInfo(signedInfoXml) {
  // SignedInfo ya viene con xmlns:ds — parseable de raiz
  const doc = new DOMParser().parseFromString(signedInfoXml, "text/xml");
  return c14nExclusive(doc.documentElement);
}

// ────────────────────────────────────────────────
// signEcfXml — firma documento e-CF (raiz <ECF>)
// ────────────────────────────────────────────────
export async function signEcfXml(xmlString, cert, privateKey) {
  return await signXmlGenerico(xmlString, cert, privateKey);
}

// ────────────────────────────────────────────────
// signXmlGenerico — firma cualquier XML
// ────────────────────────────────────────────────
export async function signXmlGenerico(xmlString, cert, privateKey) {
  if (!xmlString) throw new Error("xmlString requerido");
  if (!cert) throw new Error("cert requerido");
  if (!privateKey) throw new Error("privateKey requerida");

  // Detectar tag raiz
  const m = xmlString.match(/<\?xml[^>]*\?>\s*<([A-Za-z][A-Za-z0-9_:-]*)[\s>]/) ||
            xmlString.match(/^\s*<([A-Za-z][A-Za-z0-9_:-]*)[\s>]/);
  const rootTag = m?.[1];
  if (!rootTag) throw new Error("No se pudo detectar el tag raiz del XML");

  // 1. Canonicalizar el XML completo y calcular el digest
  const digestValue = await digestEnveloped(xmlString);

  // 2. Construir SignedInfo
  const signedInfoXml = buildSignedInfoXml(digestValue);
  const signedInfoC14n = await canonicalizeSignedInfo(signedInfoXml);

  // 3. Firmar SignedInfo canonicalizado con RSA-SHA256
  const signatureValue = signRsaSha256(privateKey, signedInfoC14n);

  // 4. Construir KeyInfo y QualifyingProperties
  const keyInfoXml = buildKeyInfoXml(cert);
  const qualifyingProps = buildQualifyingPropertiesXml(cert);
  const objectXml = `<ds:Object>${qualifyingProps}</ds:Object>`;

  // 5. Ensamblar Signature
  const signatureXml =
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="Signature">` +
      signedInfoXml +
      `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
      keyInfoXml +
      objectXml +
    `</ds:Signature>`;

  // 6. Insertar la Signature antes del cierre del tag raiz
  const closingRe = new RegExp(`</${rootTag}\\s*>(\\s*)$`);
  if (!closingRe.test(xmlString)) {
    throw new Error(`XML no tiene tag de cierre </${rootTag}>`);
  }
  const xmlFirmado = xmlString.replace(closingRe, signatureXml + `</${rootTag}>$1`);

  return { xmlFirmado, digestValue, signatureValue };
}
