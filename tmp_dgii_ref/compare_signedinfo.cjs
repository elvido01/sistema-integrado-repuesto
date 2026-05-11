// Compara la canonicalizacion del SignedInfo entre nuestra implementacion
// y xml-crypto.
const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');

// Cargar la canonicalization library de xml-crypto
const C14N = require('xml-crypto/lib/c14n-canonicalization').C14nCanonicalization;

// Parsear el XML firmado por dgii-ecf y extraer SignedInfo
const refSigned = fs.readFileSync(path.resolve(__dirname, 'Postulacion_firmado_REF.xml'), 'utf-8');
const doc = new DOMParser().parseFromString(refSigned, 'text/xml');
const signedInfoNode = doc.getElementsByTagName('SignedInfo')[0];

// Canonicalizacion por xml-crypto
const c14n = new C14N();
const xmlCryptoCanon = c14n.process(signedInfoNode, {});
console.log('=== xml-crypto C14N del SignedInfo ===');
console.log(xmlCryptoCanon);
console.log('Longitud:', xmlCryptoCanon.length);
console.log('');

// Nuestra canonicalizacion
const xmlSpecialMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;', '\r': '', '\n': '', '\t': '&#x9;' };
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
function renderNs(node, prefixesInScope, defaultNs) {
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
  list.sort((a, b) => a.prefix < b.prefix ? -1 : a.prefix > b.prefix ? 1 : 0);
  for (const p of list) res += ` xmlns:${p.prefix}="${p.namespaceURI}"`;
  return { rendered: res, newDefaultNs };
}
function c14nInterno(node, prefixesInScope, defaultNs) {
  if (node.nodeType === 8) return '';
  if (node.data !== undefined && node.data !== null) return encText(node.data);
  const ns = renderNs(node, prefixesInScope, defaultNs);
  const attrs = renderAttrs(node);
  let res = `<${node.tagName}${ns.rendered}${attrs}>`;
  for (let i = 0; i < node.childNodes.length; i++) {
    res += c14nInterno(node.childNodes[i], prefixesInScope.slice(0), ns.newDefaultNs);
  }
  res += `</${node.tagName}>`;
  return res;
}

const ourCanon = c14nInterno(signedInfoNode, [], '');
console.log('=== Nuestra C14N del SignedInfo ===');
console.log(ourCanon);
console.log('Longitud:', ourCanon.length);
console.log('');

console.log('=== Comparacion ===');
console.log('Match:', ourCanon === xmlCryptoCanon ? 'SI ✓' : 'NO ✗');

if (ourCanon !== xmlCryptoCanon) {
  let i = 0;
  while (i < ourCanon.length && i < xmlCryptoCanon.length && ourCanon[i] === xmlCryptoCanon[i]) i++;
  console.log('Primer byte distinto en pos:', i);
  console.log('Ref antes:', JSON.stringify(xmlCryptoCanon.slice(Math.max(0, i - 30), i)));
  console.log('Ref desde:', JSON.stringify(xmlCryptoCanon.slice(i, i + 80)));
  console.log('Our desde:', JSON.stringify(ourCanon.slice(i, i + 80)));
}
