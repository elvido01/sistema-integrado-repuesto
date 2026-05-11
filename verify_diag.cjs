// Decodifica el diag JSON y verifica:
// - Que SHA256(canonical1) == digest_value declarado
// - Que canonicalSignedInfo contiene el digest_value
// - Imprime los bytes EXACTOS canonicalizados

const forge = require('node-forge');
const fs = require('fs');

const diagPath = process.argv[2];
if (!diagPath) {
  console.error('Uso: node verify_diag.cjs <ruta_al_diag.json>');
  process.exit(1);
}

const diag = JSON.parse(fs.readFileSync(diagPath, 'utf8'));

// Decodificar canonical1
const canonical1 = Buffer.from(diag.canonical1_b64, 'base64').toString('utf8');
const canonicalSignedInfo = Buffer.from(diag.canonicalSignedInfo_b64, 'base64').toString('utf8');

console.log('=== canonical1 (bytes que se hashearon) ===');
console.log(canonical1);
console.log('--- end canonical1 ---');
console.log('Longitud:', canonical1.length, 'chars');
console.log('');

// Verificar digest
const md = forge.md.sha256.create();
md.update(canonical1, 'utf8');
const computedDigest = forge.util.encode64(md.digest().bytes());
console.log('Digest computado:', computedDigest);
console.log('Digest declarado:', diag.digest_value);
console.log('Coinciden       :', computedDigest === diag.digest_value ? 'SI' : 'NO');
console.log('');

console.log('=== canonicalSignedInfo (bytes que se firmaron con RSA) ===');
console.log(canonicalSignedInfo);
console.log('--- end canonicalSignedInfo ---');
console.log('Longitud:', canonicalSignedInfo.length, 'chars');
console.log('');

const dvMatch = canonicalSignedInfo.match(/<DigestValue>(.+?)<\/DigestValue>/);
console.log('DigestValue dentro del SignedInfo:', dvMatch?.[1]);
console.log('Coincide con digest_value?:', dvMatch?.[1] === diag.digest_value ? 'SI' : 'NO');

// Buscar caracteristicas problematicas
console.log('');
console.log('=== Heuristicas ===');
console.log('canonical1 contiene CR (\\r):', /\r/.test(canonical1));
console.log('canonical1 contiene CRLF:', /\r\n/.test(canonical1));
console.log('canonical1 contiene tabs:', /\t/.test(canonical1));
console.log('canonical1 termina con whitespace?:', /\s$/.test(canonical1));
console.log('canonical1 primer char:', JSON.stringify(canonical1.charAt(0)));
console.log('canonical1 ultimos 50 chars:', JSON.stringify(canonical1.slice(-50)));
