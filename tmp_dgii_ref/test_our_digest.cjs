// Compara nuestro digest computation con la salida de dgii-ecf
// para detectar si nuestro algoritmo produce los mismos bytes.

const fs = require('fs');
const path = require('path');
const forge = require('node-forge');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

// Replica de nuestro digestSha256OverDoc
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

function sortRootXmlns(rootElement) {
  const attrs = rootElement.attributes;
  if (!attrs || !attrs.length) return;
  const arr = [];
  for (let i = 0; i < attrs.length; i++) arr.push(attrs[i]);
  arr.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (let i = arr.length - 1; i >= 0; i--) {
    rootElement.removeAttributeNode(arr[i]);
  }
  for (const a of arr) {
    rootElement.setAttributeNode(a);
  }
}

function digestSha256OverDoc(xmlString) {
  const doc = new DOMParser().parseFromString(xmlString, 'text/xml');
  cleanNodes(doc);
  sortRootXmlns(doc.documentElement);
  const serialized = new XMLSerializer().serializeToString(doc);
  const md = forge.md.sha256.create();
  md.update(serialized, 'utf8');
  return {
    digestB64: forge.util.encode64(md.digest().getBytes()),
    canonical: serialized,
  };
}

const xml = fs.readFileSync(path.resolve(__dirname, 'Postulacion.xml'), 'utf-8');

const ourResult = digestSha256OverDoc(xml);
console.log('=== Nuestro algoritmo ===');
console.log('Digest:', ourResult.digestB64);
console.log('Longitud canonical:', ourResult.canonical.length);
console.log('Canonical (primeros 300 chars):');
console.log(ourResult.canonical.slice(0, 300));
console.log('');

// Digest de referencia (de la firma dgii-ecf)
const refSigned = fs.readFileSync(path.resolve(__dirname, 'Postulacion_firmado_REF.xml'), 'utf-8');
const refDigestMatch = refSigned.match(/<DigestValue>([^<]+)<\/DigestValue>/);
console.log('=== Digest de referencia (dgii-ecf) ===');
console.log('Digest:', refDigestMatch[1]);
console.log('');

console.log('=== Comparacion ===');
console.log('Coinciden:', ourResult.digestB64 === refDigestMatch[1] ? 'SI ✓' : 'NO ✗');

if (ourResult.digestB64 !== refDigestMatch[1]) {
  // Probemos otra variante: sin sortear (preservar orden original)
  console.log('');
  console.log('=== Probando SIN sort de xmlns (preservar orden original) ===');
  const doc2 = new DOMParser().parseFromString(xml, 'text/xml');
  cleanNodes(doc2);
  // NO sort
  const serialized2 = new XMLSerializer().serializeToString(doc2);
  const md2 = forge.md.sha256.create();
  md2.update(serialized2, 'utf8');
  const digest2 = forge.util.encode64(md2.digest().getBytes());
  console.log('Digest sin sort:', digest2);
  console.log('Coincide con ref?:', digest2 === refDigestMatch[1] ? 'SI ✓' : 'NO ✗');
  console.log('Canonical sin sort (primeros 300):');
  console.log(serialized2.slice(0, 300));
}
