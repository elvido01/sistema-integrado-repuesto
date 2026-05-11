// Intercepta el signedInfoCanon que xml-crypto firma realmente.
const fs = require('fs');
const path = require('path');

// Patch xml-crypto signature algorithms para loggear el input
const origSigAlgo = require('xml-crypto/lib/signature-algorithms');
const origRsaSha256 = origSigAlgo.RsaSha256;
class WrappedRsaSha256 extends origRsaSha256 {
  constructor() {
    super();
    const origGet = this.getSignature;
    this.getSignature = (signedInfo, privateKey, callback) => {
      console.log('=== xml-crypto signedInfoCanon ===');
      console.log(signedInfo);
      console.log('Length:', signedInfo.length);
      console.log('--- ---');
      console.log('Hex first 100:', Buffer.from(signedInfo).slice(0, 100).toString('hex'));
      return origGet(signedInfo, privateKey, callback);
    };
  }
}
origSigAlgo.RsaSha256 = WrappedRsaSha256;

// Ahora cargar dgii-ecf y firmar
const { default: P12Reader } = require('dgii-ecf/dist/P12Reader');
const { default: Signature } = require('dgii-ecf/dist/Signature/Signature');

const reader = new P12Reader('pass123');
const certs = reader.getKeyFromFile(path.resolve(__dirname, 'SAMPLE_CERT.p12'));
const xml = fs.readFileSync(path.resolve(__dirname, 'Postulacion.xml'), 'utf-8');

const signature = new Signature(certs.key, certs.cert);
const signedXml = signature.signXml(xml, 'Postulacion');
console.log('');
console.log('Final SignatureValue:', signedXml.match(/<SignatureValue>([^<]+)/)[1].slice(0, 50));
