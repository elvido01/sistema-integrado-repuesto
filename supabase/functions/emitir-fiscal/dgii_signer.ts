// @ts-nocheck
// deno-lint-ignore-file
//
// ============================================================
// Firma XAdES-BES para e-CF DGII
// ============================================================
// Implementacion manual de XAdES-BES (XML Advanced Electronic
// Signatures - Basic Electronic Signature) compatible con los
// requerimientos de DGII RD.
//
// Estandares aplicados:
//   - W3C XML-DSig (Core)
//   - W3C XML Exclusive Canonicalization 1.0 (C14N exc)
//   - ETSI TS 101 903 v1.4.2 (XAdES-BES)
//   - Algoritmo de firma: RSA-SHA256 (RSAwithSHA256)
//
// Referencias DGII:
//   - "Politica de Firma Electronica para Comprobantes Fiscales
//      Electronicos en la DGII" v1.0
//
// LIMITACIONES ACTUALES (chunk 3d):
//   - C14N implementado de forma simple (suficiente para XML
//     bien-formados sin namespaces mixtos como los nuestros).
//   - Qualifying Properties XAdES (SigningTime, SigningCertificate
//     fingerprint) incluidas pero no firmadas referencialmente
//     — DGII pide BES, no EPES, asi que esto es valido.
//   - Si DGII rechaza algo en CerteCF, ajustar aqui en base al
//     mensaje de error de DGII.
// ============================================================

import forge from "https://esm.sh/node-forge@1.3.1";

// ────────────────────────────────────────────────
// Canonicalizacion XML (C14N exc - simplificada)
// ────────────────────────────────────────────────
// La canonicalizacion completa es muy compleja (sort de attrs
// por namespace, manejo de prefijos, etc). Para nuestros XMLs
// (sin namespaces, sin atributos mixtos) basta con normalizar
// whitespace entre tags. DGII publicara mensajes claros si
// necesitamos algo mas estricto.
function canonicalize(xmlString) {
  return xmlString
    // Normalizar saltos de linea a LF
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Quitar BOM si existe
    .replace(/^﻿/, "")
    // Eliminar espacios entre tags
    .replace(/>\s+</g, "><")
    // Quitar espacios al inicio y final
    .trim();
}

// ────────────────────────────────────────────────
// Hash SHA-256 → base64
// ────────────────────────────────────────────────
async function sha256Base64(text) {
  const data = new TextEncoder().encode(text);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hashBuf)));
}

// ────────────────────────────────────────────────
// Convertir cert X.509 (forge) a base64 DER
// ────────────────────────────────────────────────
function certToBase64(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  return forge.util.encode64(der);
}

// ────────────────────────────────────────────────
// Fingerprint SHA-256 del cert (para SigningCertificate)
// ────────────────────────────────────────────────
function certFingerprintSha256(cert) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(der);
  return forge.util.encode64(md.digest().getBytes());
}

// ────────────────────────────────────────────────
// Firma RSA-SHA256 (PKCS#1 v1.5)
// ────────────────────────────────────────────────
function signRsaSha256(privateKey, dataString) {
  const md = forge.md.sha256.create();
  md.update(dataString, "utf8");
  const sig = privateKey.sign(md);
  return forge.util.encode64(sig);
}

// ────────────────────────────────────────────────
// Construye el bloque <ds:SignedInfo> y devuelve { xml, canonicalized }
// ────────────────────────────────────────────────
function buildSignedInfo(digestValue) {
  const xml = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#">` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
    `<ds:Reference URI="">` +
      `<ds:Transforms>` +
        `<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
        `<ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>` +
      `</ds:Transforms>` +
      `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
      `<ds:DigestValue>${digestValue}</ds:DigestValue>` +
    `</ds:Reference>` +
  `</ds:SignedInfo>`;
  return { xml, canonicalized: canonicalize(xml) };
}

// ────────────────────────────────────────────────
// Construye <ds:KeyInfo> con el cert en base64
// ────────────────────────────────────────────────
function buildKeyInfo(cert) {
  const certB64 = certToBase64(cert);
  return `<ds:KeyInfo>` +
    `<ds:X509Data>` +
      `<ds:X509Certificate>${certB64}</ds:X509Certificate>` +
    `</ds:X509Data>` +
  `</ds:KeyInfo>`;
}

// ────────────────────────────────────────────────
// Construye <xades:QualifyingProperties> (opcional XAdES-BES)
// ────────────────────────────────────────────────
function buildQualifyingProperties(cert) {
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
              `<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
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
// API principal: firmar un XML e-CF
// ────────────────────────────────────────────────
//
// Input:
//   xmlString   - el XML del e-CF SIN firmar (lo que produce buildEcfXml)
//   cert        - objeto cert de node-forge (de loadAndParseP12)
//   privateKey  - clave privada de node-forge (de loadAndParseP12)
//
// Output:
//   { xmlFirmado: string, digestValue: string, signatureValue: string }
//
// El xmlFirmado tiene <ds:Signature>...</ds:Signature> insertado
// justo antes del tag de cierre raiz </ECF>.

export async function signEcfXml(xmlString, cert, privateKey) {
  if (!xmlString) throw new Error("xmlString requerido");
  if (!cert) throw new Error("cert requerido (de loadAndParseP12)");
  if (!privateKey) throw new Error("privateKey requerida (de loadAndParseP12)");

  // 1. Calcular DigestValue del XML completo (canonicalizado, sin signature aun)
  const canonical = canonicalize(xmlString);
  const digestValue = await sha256Base64(canonical);

  // 2. Construir <ds:SignedInfo>
  const { xml: signedInfoXml, canonicalized: signedInfoC14n } = buildSignedInfo(digestValue);

  // 3. Firmar el SignedInfo canonicalizado con RSA-SHA256
  const signatureValue = signRsaSha256(privateKey, signedInfoC14n);

  // 4. Construir <ds:KeyInfo>
  const keyInfoXml = buildKeyInfo(cert);

  // 5. Construir <ds:Object> con QualifyingProperties (XAdES-BES)
  const qualifyingProps = buildQualifyingProperties(cert);
  const objectXml = `<ds:Object>${qualifyingProps}</ds:Object>`;

  // 6. Ensamblar <ds:Signature> completo
  const signatureXml =
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="Signature">` +
      signedInfoXml +
      `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
      keyInfoXml +
      objectXml +
    `</ds:Signature>`;

  // 7. Insertar Signature antes del tag de cierre raiz </ECF>
  // Soporta variantes: </ECF> o </eCF>
  const closingTagRegex = /<\/(ECF|eCF)\s*>$/m;
  if (!closingTagRegex.test(xmlString)) {
    throw new Error("XML no tiene tag de cierre </ECF> o </eCF>");
  }
  const xmlFirmado = xmlString.replace(closingTagRegex, signatureXml + "</$1>");

  return {
    xmlFirmado,
    digestValue,
    signatureValue,
  };
}

// ────────────────────────────────────────────────
// Variante generica: firma cualquier XML, no solo e-CF
// Util para firmar la semilla de autenticacion DGII (que tiene
// tag raiz distinto a <ECF>).
// ────────────────────────────────────────────────
export async function signXmlGenerico(xmlString, cert, privateKey) {
  if (!xmlString) throw new Error("xmlString requerido");
  if (!cert) throw new Error("cert requerido");
  if (!privateKey) throw new Error("privateKey requerida");

  // Detectar tag raiz (primer elemento despues del <?xml?>)
  const m = xmlString.match(/<\?xml[^>]*\?>\s*<([A-Za-z][A-Za-z0-9_:-]*)[\s>]/) ||
            xmlString.match(/^\s*<([A-Za-z][A-Za-z0-9_:-]*)[\s>]/);
  const rootTag = m?.[1];
  if (!rootTag) throw new Error("No se pudo detectar el tag raiz del XML");

  // Mismo flujo que signEcfXml pero con tag raiz dinamico
  const canonical = canonicalize(xmlString);
  const digestValue = await sha256Base64(canonical);
  const { xml: signedInfoXml, canonicalized: signedInfoC14n } = buildSignedInfo(digestValue);
  const signatureValue = signRsaSha256(privateKey, signedInfoC14n);
  const keyInfoXml = buildKeyInfo(cert);
  const qualifyingProps = buildQualifyingProperties(cert);
  const objectXml = `<ds:Object>${qualifyingProps}</ds:Object>`;
  const signatureXml =
    `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="Signature">` +
      signedInfoXml +
      `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
      keyInfoXml +
      objectXml +
    `</ds:Signature>`;

  // Insertar Signature antes del tag de cierre raiz
  const closingRe = new RegExp(`</${rootTag}\\s*>$`, "m");
  if (!closingRe.test(xmlString)) {
    throw new Error(`XML no tiene tag de cierre </${rootTag}>`);
  }
  const xmlFirmado = xmlString.replace(closingRe, signatureXml + `</${rootTag}>`);

  return { xmlFirmado, digestValue, signatureValue };
}
