// Intercepta los bytes que xml-crypto pasa a Digest.getHash
const fs = require('fs');
const path = require('path');

// Parchear el modulo Digest ANTES de cargarlo
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  const m = origRequire.apply(this, arguments);
  if (id.endsWith('custom/Digest') || id.endsWith('custom/Digest.js')) {
    const orig = m.default || m;
    class Wrapped extends orig {
      getHash(xml) {
        console.log('=== INPUT a Digest.getHash ===');
        console.log('Length:', xml.length);
        console.log(xml);
        console.log('--- end input ---');
        const result = super.getHash(xml);
        console.log('Digest devuelto:', result);
        // Tambien mostrar despues de sort
        const xmldom = require('@xmldom/xmldom');
        const doc = new xmldom.DOMParser().parseFromString(xml);
        console.log('Despues de parse, doc.toString() (sin sort):');
        console.log(doc.toString());
        return result;
      }
    }
    if (m.default) {
      m.default = Wrapped;
    }
    return m;
  }
  return m;
};

// Ahora cargar dgii-ecf y firmar
const { default: P12Reader } = require('dgii-ecf/dist/P12Reader');
const { default: Signature } = require('dgii-ecf/dist/Signature/Signature');

const reader = new P12Reader('pass123');
const certs = reader.getKeyFromFile(path.resolve(__dirname, 'SAMPLE_CERT.p12'));
const xml = fs.readFileSync(path.resolve(__dirname, 'Postulacion.xml'), 'utf-8');

const signature = new Signature(certs.key, certs.cert);
const signedXml = signature.signXml(xml, 'Postulacion');

const digestMatch = signedXml.match(/<DigestValue>([^<]+)<\/DigestValue>/);
console.log('');
console.log('=== Resultado final ===');
console.log('DigestValue en XML firmado:', digestMatch[1]);
