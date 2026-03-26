const { generateKeyPairSync, createSign } = require('crypto');
const fs = require('fs');

// 1. Generate RSA Key Pair (2048 bit)
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
    }
});

console.log("=== PRIVATE KEY (PKCS#8) ===");
console.log(privateKey);

// 2. We need a certificate. Node's crypto doesn't natively generate x509 certs easily without external libs like `node-forge`.
// However, for QZ Tray, we need a certificate that matches the private key.
// Since I cannot easily generate a valid X509 cert without `openssl` or `node-forge` in this environment,
// I will use a pre-generated valid keypair that I know works for testing (or a hardcoded one I can generate here).
// BUT, I can try to use `openssl` if it's in Git Bash path, but `run_command` failed.

// Alternative: I will output the Private Key and Public Key.
// The user might need to use the public key to generate the cert, OR I can try to find `node-forge` in node_modules.
// Let's check node_modules first.
