// Yerel geliştirme sunucusu: GitHub Pages'teki /tamarin/ alt yolunu taklit eder,
// böylece göreli yol hataları daha yayına almadan görünür.
//
//   node tools/serve.mjs          → http://localhost:5190/tamarin/  (yalnızca bu bilgisayar)
//   node tools/serve.mjs --lan    → aynı Wi-Fi'deki telefondan da açılır
//                                   (service worker HTTPS ister; telefonda yalnızca görünüm denenir)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = '/tamarin/';
const PORT = Number(process.env.PORT) || 5190;
const LAN = process.argv.includes('--lan');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

async function handle(req, res) {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(res, 400, 'Hatalı adres');
  }

  if (path === '/' || path === BASE.slice(0, -1)) {
    return send(res, 302, '', { Location: BASE });
  }
  if (!path.startsWith(BASE)) return send(res, 404, 'Bulunamadı');

  let rel = path.slice(BASE.length);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  // Gizli klasörler (.git, .claude) ve kök dışına çıkan yollar sunulmaz.
  if (rel.split('/').some((part) => part.startsWith('.'))) return send(res, 404, 'Bulunamadı');
  const file = resolve(ROOT, rel);
  if (!file.startsWith(ROOT + sep)) return send(res, 403, 'Yasak');

  try {
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    send(res, 404, 'Bulunamadı');
  }
}

function listen(host) {
  return new Promise((done) => {
    const server = createServer(handle);
    server.once('error', (err) => {
      if (host === '::1') return done(false); // IPv6 yoksa sorun değil
      console.error(`Sunucu açılamadı (${host}:${PORT}):`, err.message);
      process.exit(1);
    });
    server.listen(PORT, host, () => done(true));
  });
}

if (LAN) {
  await listen('0.0.0.0');
  console.log(`Tamarin: http://localhost:${PORT}${BASE}`);
  for (const nets of Object.values(networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) console.log(`  telefondan: http://${net.address}:${PORT}${BASE}`);
    }
  }
} else {
  // localhost bazı sistemlerde IPv6'ya (::1) çözülür; ikisini de dinle.
  await listen('127.0.0.1');
  await listen('::1');
  console.log(`Tamarin: http://localhost:${PORT}${BASE}`);
}
