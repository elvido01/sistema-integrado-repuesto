// Script local para verificar la firma del XML que produjo MotoFlow.
// Replica el algoritmo de DGII y compara digest + signature value.

const forge = require('node-forge');
const { DOMParser } = require('@xmldom/xmldom');
const fs = require('fs');

// === Funciones replicadas del signer ===

const xmlSpecialMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
  '\r': '',
  '\n': '',
  '\t': '&#x9;',
};

function encodeSpecialCharactersInText(text) {
  return String(text || '').replace(/[&<>\r]/g, (ch) => xmlSpecialMap[ch] ?? ch);
}

function encodeSpecialCharactersInAttribute(value) {
  return String(value || '').replace(/[&<"\r\n\t]/g, (ch) => xmlSpecialMap[ch] ?? ch);
}

function attrCompare(a, b) {
  if (a.name < b.name) return -1;
  if (a.name > b.name) return 1;
  return 0;
}

function renderAttrs(node) {
  if (!node.attributes) return '';
  const list = [];
  for (let i = 0; i < node.attributes.length; i++) {
    const attr = node.attributes[i];
    if (attr.name.indexOf('xmlns') === 0) continue;
    list.push(attr);
  }
  list.sort(attrCompare);
  return list
    .map((a) => ` ${a.name}="${encodeSpecialCharactersInAttribute(a.value)}"`)
    .join('');
}

function renderNs(node, prefixesInScope, defaultNs, defaultNsForPrefix) {
  let res = '';
  let newDefaultNs = defaultNs;
  const list = [];
  const currNs = node.namespaceURI || '';

  if (node.prefix) {
    if (prefixesInScope.indexOf(node.prefix) === -1) {
      list.push({ prefix: node.prefix, namespaceURI: node.namespaceURI || defaultNsForPrefix[node.prefix] });
      prefixesInScope.push(node.prefix);
    }
  } else if (defaultNs !== currNs) {
    newDefaultNs = node.namespaceURI;
    res += ` xmlns="${newDefaultNs}"`;
  }

  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i++) {
      const attr = node.attributes[i];
      if (attr.prefix === 'xmlns' && prefixesInScope.indexOf(attr.localName) === -1) {
        list.push({ prefix: attr.localName, namespaceURI: attr.value });
        prefixesInScope.push(attr.localName);
      }
      if (attr.prefix && attr.prefix !== 'xmlns' && prefixesInScope.indexOf(attr.prefix) === -1) {
        list.push({ prefix: attr.prefix, namespaceURI: attr.namespaceURI });
        prefixesInScope.push(attr.prefix);
      }
    }
  }

  for (const p of list) {
    res += ` xmlns:${p.prefix}="${p.namespaceURI}"`;
  }
  return { rendered: res, newDefaultNs };
}

function c14nInterno(node, prefixesInScope, defaultNs, defaultNsForPrefix) {
  if (node.nodeType === 8) return '';
  if (node.data !== undefined && node.data !== null) {
    return encodeSpecialCharactersInText(node.data);
  }
  const ns = renderNs(node, prefixesInScope, defaultNs, defaultNsForPrefix);
  const attrs = renderAttrs(node);
  let res = `<${node.tagName}${ns.rendered}${attrs}>`;
  for (let i = 0; i < node.childNodes.length; i++) {
    const pfxCopy = prefixesInScope.slice(0);
    res += c14nInterno(node.childNodes[i], pfxCopy, ns.newDefaultNs, defaultNsForPrefix);
  }
  res += `</${node.tagName}>`;
  return res;
}

function c14nCanonicalize(node, options = {}) {
  return c14nInterno(node, [], options.defaultNs || '', options.defaultNsForPrefix || {}, []);
}

// === Main: leer XML y verificar ===

const xmlPath = process.argv[2];
if (!xmlPath) {
  console.error('Uso: node verify_signature.cjs <ruta_al_xml_firmado>');
  process.exit(1);
}

const xml = fs.readFileSync(xmlPath, 'utf8');
const doc = new DOMParser().parseFromString(xml, 'text/xml');

// 1. Extraer SignedInfo y canonicalizar
const signedInfoNode = doc.getElementsByTagName('SignedInfo')[0];
if (!signedInfoNode) {
  console.error('NO se encontro SignedInfo');
  process.exit(1);
}
const canonicalSignedInfo = c14nCanonicalize(signedInfoNode, {
  defaultNsForPrefix: { ds: 'http://www.w3.org/2000/09/xmldsig#' },
});
console.log('=== SignedInfo canonicalizado ===');
console.log(canonicalSignedInfo);
console.log('');

// 2. Extraer DigestValue declarado
const digestValueNode = doc.getElementsByTagName('DigestValue')[0];
const digestValueDeclared = digestValueNode.firstChild.data.trim();
console.log('DigestValue declarado:', digestValueDeclared);

// 3. Extraer SignatureValue
const sigValueNode = doc.getElementsByTagName('SignatureValue')[0];
const signatureValueB64 = sigValueNode.firstChild.data.replace(/\s/g, '');

// 4. Extraer X509Certificate
const certNode = doc.getElementsByTagName('X509Certificate')[0];
const certB64 = certNode.firstChild.data.replace(/\s/g, '');

// 5. Verificar firma RSA del SignedInfo
try {
  const certDer = Buffer.from(certB64, 'base64');
  const certAsn1 = forge.asn1.fromDer(certDer.toString('binary'));
  const cert = forge.pki.certificateFromAsn1(certAsn1);
  const publicKey = cert.publicKey;

  const md = forge.md.sha256.create();
  md.update(canonicalSignedInfo, 'utf8');

  const signatureBytes = forge.util.decode64(signatureValueB64);
  const verified = publicKey.verify(md.digest().bytes(), signatureBytes);

  console.log('');
  console.log('=== Verificacion Firma SignedInfo ===');
  console.log('SignatureValue valido:', verified ? 'SI' : 'NO');
} catch (e) {
  console.error('Error verificando firma:', e.message);
}

// 6. Verificar digest del root (con enveloped-signature transform)
console.log('');
console.log('=== Verificacion Digest del Root ===');
const root = doc.documentElement;
// Clone del root y remover el Signature node
const rootClone = root.cloneNode(true);
const sigInClone = rootClone.getElementsByTagName('Signature');
if (sigInClone.length > 0) {
  sigInClone[0].parentNode.removeChild(sigInClone[0]);
}
const canonicalRoot = c14nCanonicalize(rootClone);
const md2 = forge.md.sha256.create();
md2.update(canonicalRoot, 'utf8');
const computedDigest = forge.util.encode64(md2.digest().bytes());
console.log('Digest computado :', computedDigest);
console.log('Digest declarado :', digestValueDeclared);
console.log('Coinciden        :', computedDigest === digestValueDeclared ? 'SI' : 'NO');

if (computedDigest !== digestValueDeclared) {
  console.log('');
  console.log('--- Canonical del root computado (primeros 800 chars) ---');
  console.log(canonicalRoot.slice(0, 800));
  console.log('---');
  console.log('Longitud canonical:', canonicalRoot.length);
}
