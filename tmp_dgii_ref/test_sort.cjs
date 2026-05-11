// Verifica si Object.assign sobre attributes realmente reordena
const { DOMParser } = require('@xmldom/xmldom');

const xml = '<Postulacion xmlns:xsi="A" xmlns:xsd="B">x</Postulacion>';
const doc = new DOMParser().parseFromString(xml,'text/xml');

console.log('Antes del sort:');
console.log(doc.toString());

const attrs = doc.childNodes[0].attributes;
console.log('attrs.length:', attrs.length);
for (let i = 0; i < attrs.length; i++) {
  console.log('  ', i, ':', attrs[i].name);
}

const items = Array.from(attrs).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
console.log('Sorted items:');
for (const it of items) console.log('  ', it.name);

Object.assign(attrs, items);

console.log('Despues del sort + Object.assign:');
console.log(doc.toString());
console.log('attrs.length:', attrs.length);
for (let i = 0; i < attrs.length; i++) {
  console.log('  ', i, ':', attrs[i].name);
}

// Test del input real
console.log('');
console.log('=== Con input real (Postulacion.xml root only) ===');
const fs = require('fs');
const fullXml = fs.readFileSync('Postulacion.xml', 'utf-8');
// Parsear el doc completo, simular como xml-crypto pasa solo el root
const fullDoc = new DOMParser().parseFromString(fullXml,'text/xml');

// cleanNodes recursivo
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
cleanNodes(fullDoc);

const root = fullDoc.documentElement;
const rootStr = root.toString();
console.log('Root string (lo que pasa al getHash):');
console.log(rootStr.slice(0, 200));
console.log('...');
console.log('Longitud:', rootStr.length);

// Ahora aplicar getHash igual que dgii-ecf
const crypto = require('crypto');
const innerDoc = new DOMParser().parseFromString(rootStr,'text/xml');
const innerAttrs = innerDoc.childNodes[0].attributes;
console.log('innerAttrs antes:');
for (let i = 0; i < innerAttrs.length; i++) console.log('  ', i, ':', innerAttrs[i].name);

const innerItems = Array.from(innerAttrs).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
console.log('innerItems sorted:');
for (const it of innerItems) console.log('  ', it.name);

Object.assign(innerAttrs, innerItems);

console.log('innerAttrs despues:');
for (let i = 0; i < innerAttrs.length; i++) console.log('  ', i, ':', innerAttrs[i].name);

const finalStr = innerDoc.toString();
console.log('Final string (lo que se hashea):');
console.log(finalStr.slice(0, 200));

const sha = crypto.createHash('sha256');
sha.update(finalStr, 'utf8');
console.log('Digest:', sha.digest('base64'));
console.log('Esperado:', 'nzGRObCjnPdCFh7RFURjcwg6Nrvs7MVxmy/l8sCCi0I=');
