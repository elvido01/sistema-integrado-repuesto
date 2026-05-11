// Firma la Postulacion.xml de ejemplo con dgii-ecf y guarda el resultado
const fs = require('fs');
const path = require('path');

// dgii-ecf exports
const { default: P12Reader } = require('dgii-ecf/dist/P12Reader');
const { default: Signature } = require('dgii-ecf/dist/Signature/Signature');

const PASSPHRASE = 'pass123';
const reader = new P12Reader(PASSPHRASE);
const certs = reader.getKeyFromFile(path.resolve(__dirname, 'SAMPLE_CERT.p12'));

if (!certs.key || !certs.cert) {
  console.error('No se pudo cargar el certificado');
  process.exit(1);
}

const xml = fs.readFileSync(path.resolve(__dirname, 'Postulacion.xml'), 'utf-8');

const signature = new Signature(certs.key, certs.cert);
const signedXml = signature.signXml(xml, 'Postulacion');

fs.writeFileSync(path.resolve(__dirname, 'Postulacion_firmado_REF.xml'), signedXml);
console.log('Firmado con dgii-ecf: Postulacion_firmado_REF.xml');
console.log('Longitud:', signedXml.length, 'bytes');
console.log('');
console.log('Primeros 500 chars:');
console.log(signedXml.slice(0, 500));
