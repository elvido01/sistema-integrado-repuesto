// @ts-nocheck
// deno-lint-ignore-file
//
// ============================================================
// Firma XML para e-CF DGII (V3 — espec oficial DGII)
// ============================================================
// Implementacion replicando EXACTAMENTE el codigo TypeScript de
// referencia publicado por DGII en "Firmado de e-CF" v1.0.
//
// Diferencias vs versiones anteriores:
//   - SIN prefijo `ds:` — usa default namespace
//   - C14N 1.0 INCLUSIVE (http://www.w3.org/TR/2001/REC-xml-c14n-20010315)
//   - SOLO 1 transform: enveloped-signature
//   - SIN XAdES QualifyingProperties (DGII solo pide XMLDSig core)
//   - Atributos ordenados alfabeticamente (no por namespace URI)
//   - Encoding de caracteres especiales segun spec DGII:
//       texto:    & < > \r  (\r → vacio)
//       atributo: & < " \r \n \t  (\r \n → vacio)
//
// Referencia: PDF "Firmado de e-CF" v1.0 publicado por DGII RD,
// seccion "Metodo de firmado en TypeScript".
// ============================================================

import forge from "https://esm.sh/node-forge@1.3.1";
import { DOMParser, XMLSerializer } from "https://esm.sh/@xmldom/xmldom@0.8.10";

// ────────────────────────────────────────────────
// Implementacion del DIGEST al estilo dgii-ecf (victors1681)
// ────────────────────────────────────────────────
// CRITICO: DGII NO usa W3C C14N para calcular el DigestValue del root.
// En su lugar, espera:
//   1. Parsear el XML
//   2. Limpiar text nodes vacios y comentarios
//   3. Ordenar los xmlns:* del root alfabeticamente por nombre
//      (la app oficial de DGII en C# emite xmlns:xsd antes de xmlns:xsi
//       siempre, no en orden documental)
//   4. Serializar via doc.toString() (XMLSerializer estandar)
//   5. SHA256 sobre eso
//
// Esto fue confirmado por el autor de dgii-ecf, quien tardo 3 dias
// figurando este detalle. Sin esto: "Firma Invalida" perpetuo.
// ────────────────────────────────────────────────

function cleanNodes(node) {
  for (let n = 0; n < node.childNodes.length; n++) {
    const child = node.childNodes[n];
    if (
      child.nodeType === 8 || // comment
      (child.nodeType === 3 && !/\S/.test(child.nodeValue || "")) // whitespace-only text
    ) {
      node.removeChild(child);
      n--;
    } else if (child.nodeType === 1) {
      cleanNodes(child);
    }
  }
}

// Replica EXACTA del Digest.getHash de dgii-ecf (victors1681).
// El XML de entrada es SOLO el root element serializado (sin xml declaration).
// Se re-parsea, se ordenan los attributes del root con el comparador
// "Attr < Attr" (que usa toString para comparar la representacion completa
// del attr), se Object.assign sobre el NamedNodeMap, y se serializa.
function digestForDgii(rootStr) {
  const innerDoc = new DOMParser().parseFromString(rootStr, "text/xml");
  const attrs = innerDoc.childNodes[0].attributes;
  const sorted = Array.from(attrs).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  Object.assign(attrs, sorted);
  const finalStr = innerDoc.toString();
  const md = forge.md.sha256.create();
  md.update(finalStr, "utf8");
  return forge.util.encode64(md.digest().getBytes());
}

// Computa digest + serializa doc para insercion de Signature.
// canonical = doc completo con xml-decl, despues de cleanNodes (sin whitespace).
// digestInput = solo el root element serializado (sin xml-decl).
// digestValue = SHA256 sobre digestInput con xmlns sorteados (estilo dgii-ecf).
function digestSha256OverDoc(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, "text/xml");
  if (!doc?.documentElement) throw new Error("XML no parseable para digest");
  cleanNodes(doc);
  // doc.toString() incluye el xml-decl + root sin whitespace.
  const canonical = doc.toString();
  // El input al digest es SOLO el root serializado (asi lo pasa xml-crypto a Digest.getHash).
  const rootStr = doc.documentElement.toString();
  const digestB64 = digestForDgii(rootStr);
  return { digestB64, canonical };
}

// ────────────────────────────────────────────────
// Encoding de caracteres especiales (segun DGII spec)
// ────────────────────────────────────────────────
const xmlSpecialMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
  "\r": "",     // OJO: \r se elimina (no se reemplaza)
  "\n": "",     // OJO: \n se elimina (solo en attrs)
  "\t": "&#x9;",
};

function encodeSpecialCharactersInText(text) {
  // Segun el codigo TypeScript del PDF de DGII, se escapan &, <, > y \r
  // en nodos de texto. Esto replica EXACTAMENTE su implementacion:
  //   text.replace(/([&<>\r])/g, ...)
  return String(text || "").replace(/[&<>\r]/g, (ch) => xmlSpecialMap[ch] ?? ch);
}

function encodeSpecialCharactersInAttribute(value) {
  return String(value || "").replace(/[&<"\r\n\t]/g, (ch) => xmlSpecialMap[ch] ?? ch);
}

// ────────────────────────────────────────────────
// Comparador de atributos (orden alfabetico por name)
// ────────────────────────────────────────────────
function attrCompare(a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

// ────────────────────────────────────────────────
// renderAttrs — ignora xmlns:* y ordena por name
// ────────────────────────────────────────────────
function renderAttrs(node, _defaultNs) {
  if (!node.attributes) return "";
  const attrListToRender = [];
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i];
    // Ignorar las definiciones de namespace
    if (attr.name.indexOf("xmlns") === 0) continue;
    attrListToRender.push(attr);
  }
  attrListToRender.sort(attrCompare);
  let res = "";
  for (const attr of attrListToRender) {
    res += ` ${attr.name}="${encodeSpecialCharactersInAttribute(attr.value)}"`;
  }
  return res;
}

// ────────────────────────────────────────────────
// renderNs — maneja namespaces del scope
// ────────────────────────────────────────────────
function renderNs(node, prefixesInScope, defaultNs, defaultNsForPrefix, ancestorNamespaces) {
  let res = "";
  let newDefaultNs = defaultNs;
  const nsListToRender = [];
  const currNs = node.namespaceURI || "";

  // Namespace del propio elemento
  if (node.prefix) {
    if (prefixesInScope.indexOf(node.prefix) === -1) {
      nsListToRender.push({
        prefix: node.prefix,
        namespaceURI: node.namespaceURI || defaultNsForPrefix[node.prefix],
      });
      prefixesInScope.push(node.prefix);
    }
  } else if (defaultNs !== currNs) {
    // Cambio de default namespace
    newDefaultNs = node.namespaceURI;
    res += ` xmlns="${newDefaultNs}"`;
  }

  // Namespaces de atributos prefijados
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes[i];
      if (attr.prefix === "xmlns" && prefixesInScope.indexOf(attr.localName) === -1) {
        nsListToRender.push({ prefix: attr.localName, namespaceURI: attr.value });
        prefixesInScope.push(attr.localName);
      }
      // Tambien declarar el namespace del prefix del attr si no esta en scope
      if (attr.prefix && attr.prefix !== "xmlns" && prefixesInScope.indexOf(attr.prefix) === -1) {
        nsListToRender.push({ prefix: attr.prefix, namespaceURI: attr.namespaceURI });
        prefixesInScope.push(attr.prefix);
      }
    }
  }

  // C14N Inclusive: propagar namespaces heredados de ancestros al primer
  // nodo canonicalizado (cuando el subtree se canonicaliza fuera de su
  // contexto natural — ej. SignedInfo dentro de un doc XML mas grande).
  // Solo aplica al primer nodo: ancestorNamespaces se pasa solo en la
  // llamada raiz, los descendants reciben [] para no duplicar.
  if (Array.isArray(ancestorNamespaces) && ancestorNamespaces.length > 0) {
    for (const a of ancestorNamespaces) {
      const already = nsListToRender.find(
        (n) => n.prefix === a.prefix && n.namespaceURI === a.namespaceURI
      );
      if (!already && prefixesInScope.indexOf(a.prefix) === -1) {
        nsListToRender.push({ prefix: a.prefix, namespaceURI: a.namespaceURI });
        prefixesInScope.push(a.prefix);
      }
    }
  }

  // C14N: ordenar namespace declarations lexicograficamente por prefix
  nsListToRender.sort((a, b) => (a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0));

  for (const p of nsListToRender) {
    res += ` xmlns:${p.prefix}="${p.namespaceURI}"`;
  }

  return { rendered: res, newDefaultNs };
}

// Recolecta xmlns:* declarados en los ancestros de un nodo, para C14N
// Inclusive de subtrees fuera de contexto.
function findAncestorNamespaces(node) {
  const result = [];
  const seenPrefixes = new Set();
  let parent = node.parentNode;
  while (parent && parent.nodeType === 1) {
    if (parent.attributes) {
      for (let i = 0; i < parent.attributes.length; i++) {
        const a = parent.attributes[i];
        if (a.prefix === "xmlns" && !seenPrefixes.has(a.localName)) {
          seenPrefixes.add(a.localName);
          result.push({ prefix: a.localName, namespaceURI: a.value });
        }
      }
    }
    parent = parent.parentNode;
  }
  return result;
}

// ────────────────────────────────────────────────
// c14n recursivo (interno) — replica exacta del PDF DGII
// ────────────────────────────────────────────────
function c14nInterno(node, prefixesInScope, defaultNs, defaultNsForPrefix, ancestorNamespaces) {
  // Comentario — no incluir
  if (node.nodeType === 8) return "";
  // Cualquier nodo con .data (texto, CDATA, etc) → tratar como texto
  // (igual que el codigo DGII: `if (node.data) { return encode... }`)
  if (node.data !== undefined && node.data !== null) {
    return encodeSpecialCharactersInText(node.data);
  }

  // Elemento
  const ns = renderNs(node, prefixesInScope, defaultNs, defaultNsForPrefix, ancestorNamespaces);
  const attrsStr = renderAttrs(node, ns.newDefaultNs);
  let res = `<${node.tagName}${ns.rendered}${attrsStr}>`;

  for (let i = 0; i < node.childNodes.length; i++) {
    const pfxCopy = prefixesInScope.slice(0);
    res += c14nInterno(node.childNodes[i], pfxCopy, ns.newDefaultNs, defaultNsForPrefix, []);
  }

  res += `</${node.tagName}>`;
  return res;
}

// API publica de canonicalizacion
function c14nCanonicalize(node, options) {
  options = options || {};
  const defaultNs = options.defaultNs || "";
  const defaultNsForPrefix = options.defaultNsForPrefix || {};
  const ancestorNamespaces = options.ancestorNamespaces || [];
  return c14nInterno(node, [], defaultNs, defaultNsForPrefix, ancestorNamespaces);
}

// ────────────────────────────────────────────────
// Helpers PEM
// ────────────────────────────────────────────────
function certToPemBody(cert) {
  // El PEM body sin -----BEGIN/END CERTIFICATE----- y sin saltos
  let pem = forge.pki.certificateToPem(cert);
  pem = pem.replace(/-----BEGIN CERTIFICATE-----/g, "");
  pem = pem.replace(/-----END CERTIFICATE-----/g, "");
  pem = pem.replace(/[\r\n]/g, "");
  return pem.trim();
}

function signRsaSha256(privateKey, data) {
  const md = forge.md.sha256.create();
  md.update(data, "utf8");
  const sig = privateKey.sign(md);
  return forge.util.encode64(sig);
}

// ────────────────────────────────────────────────
// API principal
// ────────────────────────────────────────────────

export async function signEcfXml(xmlString, cert, privateKey) {
  return await signXmlGenerico(xmlString, cert, privateKey);
}

export async function signXmlGenerico(xmlString, cert, privateKey) {
  if (!xmlString) throw new Error("xmlString requerido");
  if (!cert) throw new Error("cert requerido");
  if (!privateKey) throw new Error("privateKey requerida");

  // Detectar tag raiz
  const m = xmlString.match(/<\?xml[^>]*\?>\s*<([A-Za-z][A-Za-z0-9_:-]*)[\s>]/) ||
            xmlString.match(/^\s*<([A-Za-z][A-Za-z0-9_:-]*)[\s>]/);
  const rootTag = m?.[1];
  if (!rootTag) throw new Error("No se pudo detectar el tag raiz del XML");

  // ─── PASO 0: Eliminar cualquier <Signature> pre-existente ───
  // Si el XML ya viene firmado (re-envio, postulacion descargada con firma
  // vieja, etc.), la quitamos antes de procesar. Sin esto:
  //   - canonical1 incluiria la firma vieja → digest distinto al esperado.
  //   - getElementsByTagName("SignedInfo")[0] devolveria el SignedInfo
  //     de la firma VIEJA en vez del que acabamos de agregar → la
  //     SignatureValue calculada no corresponderia al DigestValue del XML.
  //
  // Estrategia: regex sobre el string. Captura <Signature ...>...</Signature>
  // (con o sin prefijo de namespace), incluyendo el whitespace circundante,
  // y reemplaza por un solo "\n" para preservar la estructura.
  const xmlStringClean = xmlString.replace(
    /\s*<(\w+:)?Signature\b[\s\S]*?<\/(\w+:)?Signature>\s*/g,
    "\n"
  );

  // ─── PASO 1: Calcular digest del XML root (estilo dgii-ecf) ───
  // NO usamos W3C C14N — DGII no la espera. En vez:
  //   parse + cleanNodes + sort root xmlns + serialize + SHA256
  const { digestB64: digestValue, canonical: canonical1 } = digestSha256OverDoc(xmlStringClean);

  // ─── PASO 2: Construir el bloque <Signature> SIN SignatureValue ───
  const certPemBody = certToPemBody(cert);

  // OJO: sin prefix ds:, con default namespace. Solo 1 transform.
  const signatureXmlSinValor =
    `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">` +
      `<SignedInfo>` +
        `<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>` +
        `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>` +
        `<Reference URI="">` +
          `<Transforms>` +
            `<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>` +
          `</Transforms>` +
          `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
          `<DigestValue>${digestValue}</DigestValue>` +
        `</Reference>` +
      `</SignedInfo>` +
      `<KeyInfo>` +
        `<X509Data>` +
          `<X509Certificate>${certPemBody}</X509Certificate>` +
        `</X509Data>` +
      `</KeyInfo>` +
    `</Signature>`;

  // ─── PASO 3: Insertar la Signature antes del cierre del root ───
  // Se inserta en el XML CANONICAL (NO en el original). Esto es crítico:
  // el XML que enviamos a DGII queda en forma canónica + Signature, así
  // si DGII hashea los bytes recibidos directamente (sin re-canonicalizar)
  // el digest coincide. Si DGII re-canonicaliza, también coincide
  // (canonical(canonical(X)) === canonical(X)).
  //
  // Esto replica la spec oficial de DGII (PDF "Firmado de e-CF", linea
  // 239 de ejemplo TypeScript): `agregarEstructuraFirma(xmlCanolizadoData2.toString(),...)`.
  const indiceCierreRoot = canonical1.lastIndexOf(`</${rootTag}>`);
  if (indiceCierreRoot === -1) {
    throw new Error(`XML canonical no tiene tag de cierre </${rootTag}>`);
  }
  const xmlSinFirmado =
    canonical1.substring(0, indiceCierreRoot) +
    signatureXmlSinValor +
    canonical1.substring(indiceCierreRoot);

  // ─── PASO 4: Re-parse y canonicalizar SOLO el SignedInfo ───
  const xmlData = new DOMParser().parseFromString(xmlSinFirmado, "text/xml");
  // El SignedInfo NO tiene prefix; está en el namespace default heredado de Signature.
  // Buscamos el primer SignedInfo del documento.
  const signedInfoNodes = xmlData.getElementsByTagName("SignedInfo");
  if (!signedInfoNodes.length) throw new Error("SignedInfo no encontrado en el XML firmado");
  const signedInfoNode = signedInfoNodes[0];

  // C14N Inclusive del SignedInfo: debe propagar los xmlns:* heredados
  // de los ancestros (Postulacion, Signature, etc) al SignedInfo canonical.
  // xml-crypto hace esto via findAncestorNs; replicamos aqui.
  const ancestorNamespaces = findAncestorNamespaces(signedInfoNode);
  const canonicalSignedInfo = c14nCanonicalize(signedInfoNode, {
    defaultNsForPrefix: { ds: "http://www.w3.org/2000/09/xmldsig#" },
    ancestorNamespaces,
  });

  // ─── PASO 5: Firmar el SignedInfo canonicalizado ───
  const signatureValue = signRsaSha256(privateKey, canonicalSignedInfo);

  // ─── PASO 6: Insertar SignatureValue DESPUES de </SignedInfo> y ANTES de <KeyInfo> ───
  // Segun el ejemplo del PDF "Firmado de e-CF" de la DGII, el orden correcto es:
  //   <SignedInfo>...</SignedInfo>
  //   <SignatureValue>...</SignatureValue>
  //   <KeyInfo>...</KeyInfo>
  const signatureValueXml = `<SignatureValue>${signatureValue}</SignatureValue>`;
  const indiceFinSignedInfo = xmlSinFirmado.indexOf("</SignedInfo>");
  if (indiceFinSignedInfo === -1) {
    throw new Error("No se encontro </SignedInfo> para insertar SignatureValue");
  }
  // Insertar justo despues de </SignedInfo> (antes de <KeyInfo>)
  const insertPos = indiceFinSignedInfo + "</SignedInfo>".length;
  const xmlFirmado =
    xmlSinFirmado.substring(0, insertPos) +
    signatureValueXml +
    xmlSinFirmado.substring(insertPos);

  // DEBUG: bytes exactos que se canonicalizaron, para verificar offline.
  // canonical1 = lo que se hasheo para producir DigestValue.
  // canonicalSignedInfo = lo que se firmo con la llave privada.
  const enc = new TextEncoder();
  const canonical1Bytes = enc.encode(canonical1);
  const canonicalSignedInfoBytes = enc.encode(canonicalSignedInfo);
  const bytesToB64 = (bytes) => {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return forge.util.encode64(bin);
  };
  const canonical1B64 = bytesToB64(canonical1Bytes);
  const canonicalSignedInfoB64 = bytesToB64(canonicalSignedInfoBytes);

  return {
    xmlFirmado,
    digestValue,
    signatureValue,
    _diag: {
      canonical1_b64: canonical1B64,
      canonical1_len: canonical1Bytes.length,
      canonicalSignedInfo_b64: canonicalSignedInfoB64,
      canonicalSignedInfo_len: canonicalSignedInfoBytes.length,
    },
  };
}
