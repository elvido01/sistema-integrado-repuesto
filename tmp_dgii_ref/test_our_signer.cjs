// Replica EXACTA de nuestro signer Deno-side, pero en Node.js, para testear.
const forge = require('node-forge');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const fs = require('fs');
const path = require('path');

// === Helpers ===
function cleanNodes(node) {
  for (let n = 0; n < node.childNodes.length; n++) {
    const child = node.childNodes[n];
    if (
      child.nodeType === 8 ||
      (child.nodeType === 3 && !/\S/.test(child.nodeValue || ''))
    ) {
      node.removeChild(child);
      n--;
    } else if (child.nodeType === 1) {
      cleanNodes(child);
    }
  }
}

function digestForDgii(rootStr) {
  const innerDoc = new DOMParser().parseFromString(rootStr, 'text/xml');
  const attrs = innerDoc.childNodes[0].attributes;
  const sorted = Array.from(attrs).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  Object.assign(attrs, sorted);
  const finalStr = innerDoc.toString();
  const md = forge.md.sha256.create();
  md.update(finalStr, 'utf8');
  return forge.util.encode64(md.digest().getBytes());
}

function digestSha256OverDoc(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  cleanNodes(doc);
  const canonical = doc.toString();
  const rootStr = doc.documentElement.toString();
  return { digestB64: digestForDgii(rootStr), canonical };
}

// === c14n para SignedInfo (replica de nuestro c14nCanonicalize) ===
const xmlSpecialMap = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;',
  '"': '&quot;', "'": '&apos;',
  '\r': '', '\n': '', '\t': '&#x9;',
};
function encText(t) { return String(t || '').replace(/[&<>\r]/g, c => xmlSpecialMap[c] ?? c); }
function encAttr(v) { return String(v || '').replace(/[&<"\r\n\t]/g, c => xmlSpecialMap[c] ?? c); }
function attrCompare(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }
function renderAttrs(node) {
  if (!node.attributes) return '';
  const arr = [];
  for (let i = 0; i < node.attributes.length; i++) {
    const a = node.attributes[i];
    if (a.name.indexOf('xmlns') === 0) continue;
    arr.push(a);
  }
  arr.sort(attrCompare);
  return arr.map(a => ` ${a.name}="${encAttr(a.value)}"`).join('');
}
function renderNs(node, prefixesInScope, defaultNs, ancestorNamespaces) {
  let res = '', newDefaultNs = defaultNs;
  const list = [];
  const currNs = node.namespaceURI || '';
  if (node.prefix) {
    if (prefixesInScope.indexOf(node.prefix) === -1) {
      list.push({ prefix: node.prefix, namespaceURI: node.namespaceURI });
      prefixesInScope.push(node.prefix);
    }
  } else if (defaultNs !== currNs) {
    newDefaultNs = node.namespaceURI;
    res += ` xmlns="${newDefaultNs}"`;
  }
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      const a = node.attributes[i];
      if (a.prefix === 'xmlns' && prefixesInScope.indexOf(a.localName) === -1) {
        list.push({ prefix: a.localName, namespaceURI: a.value });
        prefixesInScope.push(a.localName);
      }
    }
  }
  if (Array.isArray(ancestorNamespaces) && ancestorNamespaces.length > 0) {
    for (const a of ancestorNamespaces) {
      const already = list.find(n => n.prefix === a.prefix && n.namespaceURI === a.namespaceURI);
      if (!already && prefixesInScope.indexOf(a.prefix) === -1) {
        list.push({ prefix: a.prefix, namespaceURI: a.namespaceURI });
        prefixesInScope.push(a.prefix);
      }
    }
  }
  list.sort((a, b) => a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0);
  for (const p of list) res += ` xmlns:${p.prefix}="${p.namespaceURI}"`;
  return { rendered: res, newDefaultNs };
}
function findAncestorNamespaces(node) {
  const result = [];
  const seen = new Set();
  let parent = node.parentNode;
  while (parent && parent.nodeType === 1) {
    if (parent.attributes) {
      for (let i = 0; i < parent.attributes.length; i++) {
        const a = parent.attributes[i];
        if (a.prefix === 'xmlns' && !seen.has(a.localName)) {
          seen.add(a.localName);
          result.push({ prefix: a.localName, namespaceURI: a.value });
        }
      }
    }
    parent = parent.parentNode;
  }
  return result;
}
function c14nInterno(node, prefixesInScope, defaultNs, ancestorNamespaces) {
  if (node.nodeType === 8) return '';
  if (node.data !== undefined && node.data !== null) return encText(node.data);
  const ns = renderNs(node, prefixesInScope, defaultNs, ancestorNamespaces);
  const attrs = renderAttrs(node);
  let res = `<${node.tagName}${ns.rendered}${attrs}>`;
  for (let i = 0; i < node.childNodes.length; i++) {
    res += c14nInterno(node.childNodes[i], prefixesInScope.slice(0), ns.newDefaultNs, []);
  }
  res += `</${node.tagName}>`;
  return res;
}
function c14nCanonicalize(node, opts) {
  opts = opts || {};
  return c14nInterno(node, [], '', opts.ancestorNamespaces || []);
}

// === Signer ===
function certToPemBody(cert) {
  let pem = forge.pki.certificateToPem(cert);
  pem = pem.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/[\r\n]/g, '');
  return pem.trim();
}

function signXmlGenerico(xmlString, cert, privateKey) {
  const m = xmlString.match(/<\?xml[^>]*\?>\s*<([A-Za-z][A-Za-z0-9_:-]*)[\s>]/) ||
            xmlString.match(/^\s*<([A-Za-z][A-Za-z0-9_:-]*)[\s>]/);
  const rootTag = m[1];

  const xmlStringClean = xmlString.replace(
    /\s*<(\w+:)?Signature\b[\s\S]*?<\/(\w+:)?Signature>\s*/g, '\n'
  );

  const { digestB64: digestValue, canonical: canonical1 } = digestSha256OverDoc(xmlStringClean);

  const certPemBody = certToPemBody(cert);
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

  const indiceCierreRoot = canonical1.lastIndexOf(`</${rootTag}>`);
  const xmlSinFirmado =
    canonical1.substring(0, indiceCierreRoot) +
    signatureXmlSinValor +
    canonical1.substring(indiceCierreRoot);

  const xmlData = new DOMParser().parseFromString(xmlSinFirmado, 'text/xml');
  const signedInfoNode = xmlData.getElementsByTagName('SignedInfo')[0];
  const ancestorNs = findAncestorNamespaces(signedInfoNode);
  const canonicalSignedInfo = c14nCanonicalize(signedInfoNode, { ancestorNamespaces: ancestorNs });

  console.log('--- OUR canonicalSignedInfo ---');
  console.log(canonicalSignedInfo);
  console.log('Length:', canonicalSignedInfo.length);
  console.log('---');

  // Probar con crypto.createSign (lo que usa xml-crypto) en vez de forge
  const crypto = require('crypto');
  const pemKey = forge.pki.privateKeyToPem(privateKey).replace(/\r\n/g, '\n');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(canonicalSignedInfo);
  const signatureValue = signer.sign(pemKey, 'base64');
  console.log('--- Sig via crypto.createSign:', signatureValue.slice(0, 50));

  // Tambien probar con forge para comparar
  const md = forge.md.sha256.create();
  md.update(canonicalSignedInfo, 'utf8');
  const sigForge = forge.util.encode64(privateKey.sign(md));
  console.log('--- Sig via forge:', sigForge.slice(0, 50));

  const signatureValueXml = `<SignatureValue>${signatureValue}</SignatureValue>`;
  const indiceFinSignedInfo = xmlSinFirmado.indexOf('</SignedInfo>');
  const insertPos = indiceFinSignedInfo + '</SignedInfo>'.length;
  return xmlSinFirmado.substring(0, insertPos) + signatureValueXml + xmlSinFirmado.substring(insertPos);
}

// === Test: firmar Postulacion con SAMPLE_CERT ===
const p12Bytes = fs.readFileSync(path.resolve(__dirname, 'SAMPLE_CERT.p12'));
const p12Asn1 = forge.asn1.fromDer(p12Bytes.toString('binary'));
const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, 'pass123');

let cert, privateKey;
for (const safeContents of p12.safeContents) {
  for (const safeBag of safeContents.safeBags) {
    if (safeBag.cert) cert = safeBag.cert;
    if (safeBag.key) privateKey = safeBag.key;
  }
}

const xml = fs.readFileSync(path.resolve(__dirname, 'Postulacion.xml'), 'utf-8');
const ourSigned = signXmlGenerico(xml, cert, privateKey);

fs.writeFileSync(path.resolve(__dirname, 'Postulacion_firmado_OURS.xml'), ourSigned);

const refSigned = fs.readFileSync(path.resolve(__dirname, 'Postulacion_firmado_REF.xml'), 'utf-8');

// Comparar digests
const ourDigestMatch = ourSigned.match(/<DigestValue>([^<]+)<\/DigestValue>/);
const refDigestMatch = refSigned.match(/<DigestValue>([^<]+)<\/DigestValue>/);
console.log('=== Comparacion ===');
console.log('Ref digest :', refDigestMatch[1]);
console.log('Our digest :', ourDigestMatch[1]);
console.log('Match digest:', ourDigestMatch[1] === refDigestMatch[1] ? 'SI ✓' : 'NO ✗');

// Comparar SignatureValue (siendo determinista RSA con misma llave + mismo input → mismos bytes)
const ourSigMatch = ourSigned.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
const refSigMatch = refSigned.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
console.log('Ref sig (50): ', refSigMatch[1].slice(0, 50));
console.log('Our sig (50): ', ourSigMatch[1].slice(0, 50));
console.log('Match sig:', ourSigMatch[1] === refSigMatch[1] ? 'SI ✓' : 'NO ✗');

console.log('');
console.log('=== Tamano firmados ===');
console.log('Ref:', refSigned.length);
console.log('Our:', ourSigned.length);

// Si difieren, mostrar primer punto de divergencia
if (ourSigned !== refSigned) {
  let i = 0;
  while (i < ourSigned.length && i < refSigned.length && ourSigned[i] === refSigned[i]) i++;
  console.log('Primer byte distinto en pos:', i);
  console.log('Ref antes:', JSON.stringify(refSigned.slice(Math.max(0, i - 30), i)));
  console.log('Ref desde:', JSON.stringify(refSigned.slice(i, i + 80)));
  console.log('Our desde:', JSON.stringify(ourSigned.slice(i, i + 80)));
}
