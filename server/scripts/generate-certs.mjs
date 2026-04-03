import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { networkInterfaces } from 'os';
import selfsigned from 'selfsigned';

const __dirname = dirname(fileURLToPath(import.meta.url));
const certDir = join(__dirname, '..', 'certs');

function getLocalIps() {
  const ips = new Set(['127.0.0.1', '::1']);
  const ifaces = networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.add(iface.address);
      }
      if (iface.family === 'IPv6' && !iface.internal) {
        ips.add(iface.address);
      }
    }
  }
  return [...ips];
}

const attrs = [{ name: 'commonName', value: 'Bahuckel' }];
const altNames = [
  { type: 2, value: 'localhost' },
  { type: 7, ip: '127.0.0.1' },
  { type: 7, ip: '::1' },
  ...getLocalIps().filter((ip) => ip !== '127.0.0.1' && ip !== '::1').map((ip) => ({ type: 7, ip })),
];

const opts = {
  algorithm: 'sha256',
  days: 365,
  keySize: 2048,
  extensions: [
    { name: 'basicConstraints', cA: false, critical: true },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames },
  ],
};

let pems;
try {
  pems = selfsigned.generate(attrs, opts);
} catch (err) {
  console.warn('Could not generate cert with SANs, falling back to localhost only:', err.message);
  pems = selfsigned.generate(
    [{ name: 'commonName', value: 'localhost' }],
    { algorithm: 'sha256', days: 365, keySize: 2048 }
  );
}

mkdirSync(certDir, { recursive: true });
writeFileSync(join(certDir, 'cert.pem'), pems.cert);
writeFileSync(join(certDir, 'key.pem'), pems.private);
console.log('Generated cert.pem and key.pem in server/certs/');
console.log('SANs:', ['localhost', '127.0.0.1', ...getLocalIps()].join(', '));
