#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  server.js — Home Binger · self-hosted 3D video store
//  ───────────────────────────────────────────────────────────────────────────
//  ZERO npm dependencies — plain Node.js (18+). Start with:
//
//      node server/server.js          (or: npm start)
//
//  Binds 0.0.0.0 so the store is reachable from other machines/networks.
//  All state lives in ./data (JSON files). See README.md for everything.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, getSecret } from './lib/store.js';
import { ensureDefaultAdmin } from './lib/auth.js';
import { handleApi } from './routes/api.js';

// ⚙️ EDIT ME ── environment variables
// Default port 8181 — NOT 8080: Steam's embedded browser listens on 8080 on
// many machines and hijacks `localhost:8080` (its devtools answer instead of
// the store). Override any time with PORT=xxxx.
const PORT = parseInt(process.env.PORT || '8181', 10);

// ── stay-alive safety nets ──────────────────────────────────────────────────
// A home media server should survive weird stream edges. Anything unhandled
// gets LOGGED (with a big pointer) instead of killing the store mid-movie.
process.on('uncaughtException', (err) => {
  console.error('\n⚠️  uncaught error (store stays open):', err);
});
process.on('unhandledRejection', (err) => {
  console.error('\n⚠️  unhandled promise rejection (store stays open):', err);
});
const HOST = process.env.HOST || '0.0.0.0';        // 0.0.0.0 = reachable on your LAN/VPN
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// First-run bootstrapping
loadConfig();
getSecret();
ensureDefaultAdmin();

// ── static file serving with correct MIME types ──────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm'
};

function serveStatic(req, res, pathname) {
  // Resolve safely inside PUBLIC_DIR (blocks ../ path traversal).
  let filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }

  if (filePath === PUBLIC_DIR || pathname === '/') filePath = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    // SPA-style fallback → index.html (keeps deep links working behind proxies)
    filePath = path.join(PUBLIC_DIR, 'index.html');
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  }

  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  // Vendored libs & images get long-lived caching; the app's own HTML/JS/CSS
  // is NEVER cached (no-store) so edits show up on every single reload.
  const cacheable = pathname.startsWith('/vendor/') || pathname.startsWith('/img/');
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': cacheable ? 'public, max-age=604800' : 'no-store'
  });
  fs.createReadStream(filePath).pipe(res);
}

// ── request handler ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.req = req;
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/') || pathname.startsWith('/img/')) {
    const handled = await handleApi(req, res, pathname).catch(err => {
      console.error('[server] unhandled API error:', err);
      if (!res.headersSent) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Server error' })); }
      return true;
    });
    if (handled !== false) return;
  }
  serveStatic(req, res, pathname);
});

// Long-lived keep-alive sockets: node's 5 s default closes idle pooled


// connections right as a client reuses them (mid-request 'other side closed').


server.keepAliveTimeout = 0;        // never reap idle sockets — clients manage their own


server.headersTimeout = 72000;


server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │   📼  HOME BINGER — now OPEN for business   │');
  console.log('  ├─────────────────────────────────────────────────────┤');
  console.log(`  │   Local:      http://localhost:${PORT}                │`);
  console.log(`  │   Network:    http://<your-ip>:${PORT}               │`);
  console.log('  │                                                     │');
  console.log('  │   Default admin  →  BabyBluJ / BluJNetwork         │');
  console.log('  │   (change it in Settings → Admin → Users)           │');
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log('');
});
