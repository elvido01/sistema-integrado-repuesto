const forge = require('node-forge');

console.log("Generating 2048-bit RSA keypair...");
const keys = forge.pki.rsa.generateKeyPair(2048);

console.log("Creating Self-Signed Certificate...");
const cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = '01';
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10); // 10 years

const attrs = [{
    name: 'commonName',
    value: 'Repuestos Morla Trust'
}, {
    name: 'countryName',
    value: 'DO'
}, {
    shortName: 'ST',
    value: 'Santo Domingo'
}, {
    name: 'localityName',
    value: 'Santo Domingo'
}, {
    name: 'organizationName',
    value: 'Repuestos Morla'
}, {
    shortName: 'OU',
    value: 'IT'
}];

cert.setSubject(attrs);
cert.setIssuer(attrs);

// ✅ EXTENSIONES CRÍTICAS PARA CA
cert.setExtensions([
    {
        name: 'basicConstraints',
        cA: true
    },
    {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
    },
    {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true
    },
    {
        name: 'nsCertType',
        client: true,
        server: true,
        email: true,
        objsign: true,
        sslCA: true,
        emailCA: true,
        objCA: true
    },
    {
        name: 'subjectKeyIdentifier'
    }
]);

// Sign with SHA-256
cert.sign(keys.privateKey, forge.md.sha256.create());

// Convert Certificate to PEM
const certPem = forge.pki.certificateToPem(cert);

// Convert Private Key to PKCS#8 PEM
// 1. Convert to ASN.1
const privateKeyAsn1 = forge.pki.privateKeyToAsn1(keys.privateKey);
// 2. Wrap in PKCS#8 (PrivateKeyInfo)
const privateKeyInfo = forge.pki.wrapRsaPrivateKey(privateKeyAsn1);
// 3. Convert to PEM using standard 'PRIVATE KEY' header (not 'RSA PRIVATE KEY')
const privateKeyPem = forge.pem.encode({
    type: 'PRIVATE KEY',
    body: forge.asn1.toDer(privateKeyInfo).getBytes()
});

console.log("\n=== BEGIN CERTIFICATE OUTPUT ===");
console.log(certPem);
console.log("=== END CERTIFICATE OUTPUT ===");

console.log("\n=== BEGIN PRIVATE KEY OUTPUT ===");
console.log(privateKeyPem);
console.log("=== END PRIVATE KEY OUTPUT ===");
