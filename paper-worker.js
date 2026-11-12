'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const LivePaper = require('./live-paper');

const directory = path.resolve(process.env.PAPER_DATA_DIR || './paper-data');
const file = path.join(directory, 'wallet.json');
const port = Number(process.env.PAPER_PORT || '8766');
const auto = process.env.PAPER_AUTO === '1';
const bind = process.env.PAPER_BIND || '127.0.0.1';
const panelHost = (process.env.PAPER_PANEL_HOST || '').toLowerCase();
if (panelHost && !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net$/.test(panelHost)) {
  throw Error('PAPER_PANEL_HOST geçersiz.');
}
if (bind !== '127.0.0.1' && !(bind === '0.0.0.0' && panelHost)) {
  throw Error('Ağ erişimi için özel Tailscale adresi gerekli.');
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('PAPER_PORT geçersiz.');

fs.mkdirSync(directory, {recursive: true, mode: 0o700});
const state = fs.existsSync(file) ? LivePaper.restore(fs.readFileSync(file, 'utf8')) : LivePaper.initial();
let latest = {state, quotes: {}, signals: [], error: 'İlk fiyat bekleniyor.', updatedAt: null};

const monitor = LivePaper.monitor({
  state, automatic: () => auto,
  persist(next) {
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(next), {mode: 0o600, flush: true});
    fs.renameSync(temp, file);
  },
  onUpdate(update) {
    latest = {...update, updatedAt: Date.now()};
  }
});

const staticFiles = new Map([
  ['/', ['worker-panel.html', 'text/html']],
  ['/worker-panel.js', ['worker-panel.js', 'text/javascript']]
]);
const allowedHosts = new Set(['127.0.0.1:' + port, 'localhost:' + port]);
if (panelHost) {
  allowedHosts.add(panelHost);
  allowedHosts.add(panelHost + ':443');
}

const server = http.createServer((request, response) => {
  if (!allowedHosts.has(request.headers.host?.toLowerCase())) {
    response.writeHead(400).end();
    return;
  }
  if (request.method !== 'GET') {
    response.writeHead(405, {Allow: 'GET'}).end();
    return;
  }
  const page = staticFiles.get(request.url);
  if (page) {
    response.writeHead(200, {
      'Content-Type': page[1] + '; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'
    }).end(fs.readFileSync(path.join(__dirname, page[0])));
    return;
  }
  if (!['/health', '/paper-state'].includes(request.url)) {
    response.writeHead(404).end();
    return;
  }
  const healthy = !latest.error && LivePaper.symbols.every(symbol =>
    LivePaper.usable(latest.quotes[symbol], Date.now()));
  const output = request.url === '/health'
    ? {healthy, mode: 'paper', auto, updatedAt: latest.updatedAt, error: latest.error}
    : {...latest, mode: 'paper', auto, healthy};
  response.writeHead(request.url === '/health' && !healthy ? 503 : 200, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'
  }).end(JSON.stringify(output));
});
server.listen(port, bind, () => {
  console.log('Sanal tarayıcı başladı. Durum: http://127.0.0.1:' + port + '/health');
  monitor.start();
});
function stop() {
  monitor.stop();
  server.close(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
