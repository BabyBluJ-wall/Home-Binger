// ─────────────────────────────────────────────────────────────────────────────
//  proxy.js — streams posters & video from Plex/Jellyfin through THIS server
// ─────────────────────────────────────────────────────────────────────────────
//  Why: media-server tokens must never reach the browser. The frontend asks
//  this server for /img/... and /api/tv/stream, and we attach credentials
//  server-side. Posters are cached to disk so repeat visits are instant.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// ⚙️ EDIT ME — where cached posters live (inside the data dir)
const CACHE_DIR = path.join((process.env.HB_DATA_DIR || process.env.VB_DATA_DIR) || path.resolve(process.cwd(), 'data'), 'cache', 'posters');

fs.mkdirSync(CACHE_DIR, { recursive: true });

function cachePath(url) {
  return path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex'));
}

// ── poster proxy (GET /img/:source/:key) ─────────────────────────────────────
export async function proxyImage(req, res, upstreamUrl) {
  const hit = cachePath(upstreamUrl);
  if (fs.existsSync(hit)) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=604800, immutable'
    });
    const rs = fs.createReadStream(hit);
    rs.on('error', () => res.destroy());      // cached file vanished mid-read — drop the response, don't crash
    rs.pipe(res);
    return;
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, { signal: AbortSignal.timeout(15000) });
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('poster fetch failed'); return;
  }
  if (!upstream.ok || !upstream.body) {
    res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end(`poster HTTP ${upstream.status}`); return;
  }

  // NOTE: awaited inside try — an abort mid-download must answer 502, never
  // bubble up as an unhandled rejection (that used to kill the whole server).
  let buf;
  try {
    buf = Buffer.from(await upstream.arrayBuffer());
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('poster download aborted'); return;
  }
  // Only cache reasonably small images (posters should be well under 2 MB).
  if (buf.length < 2 * 1024 * 1024) {
    try { fs.writeFileSync(hit, buf); } catch { /* cache full/disk issue — non-fatal */ }
  }
  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
    'Cache-Control': 'public, max-age=604800, immutable'
  });
  res.end(buf);
}

// ── video stream proxy with HTTP Range support (GET /api/play, /api/tv/stream)
// Range matters: <video> elements use it for seeking and smooth playback.
//
// ⚠️ Built on raw node:http/https, NOT fetch(): undici (global fetch) applies
// default headersTimeout/bodyTimeout timers that can cut multi-hour streams —
// the "media stops playing partway" bug. Raw requests have NO hidden timers;
// we add a CONNECT-phase timeout only, cleared the moment headers arrive.
import http from 'node:http';
import https from 'node:https';

// Media servers reap keep-alive sockets after a few idle seconds; a request
// landing on the corpse dies with ECONNRESET — that mid-play 502 was the
// "playback stops partway" bug. So: NO pooled sockets upstream (each request
// gets its own connection) + one retry on connection-level resets.
const TRANSIENT = new Set(['ECONNRESET', 'EPIPE', 'ECONNABORTED']);
// Keep-alive pools: browsers fire MANY sequential range requests while
// buffering video; a brand-new TCP+TLS handshake per request costs hundreds
// of ms each and reads to the user as "constant buffering". Idle-socket
// reaping (the bug that motivated fresh sockets) is already covered by the
// connect-reset retry in fetchRaw below.
const AGENTS = {
  http: new http.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 4, keepAliveMsecs: 15000 }),
  https: new https.Agent({ keepAlive: true, maxSockets: 8, maxFreeSockets: 4, keepAliveMsecs: 15000 })
};
function fetchRaw(urlStr, headers, redirectsLeft = 5, retriesLeft = 1) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch { return reject(new Error('bad upstream URL')); }
    const mod = u.protocol === 'https:' ? https : http;
    const rq = mod.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: { ...headers, host: u.host },
      agent: AGENTS[u.protocol === 'https:' ? 'https' : 'http']   // pooled keep-alive (reset-retry above covers reaped sockets)
    }, (up) => {
      // follow redirects (archive.org downloads can bounce between nodes)
      if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location && redirectsLeft > 0) {
        up.resume();
        try {
          const next = new URL(up.headers.location, u).toString();
          rq.destroy();
          return resolve(fetchRaw(next, headers, redirectsLeft - 1));
        } catch { return reject(new Error('bad redirect')); }
      }
      resolve({ status: up.statusCode, headers: up.headers, stream: up, abort: () => rq.destroy() });
    });
    // connect-phase timeout only — NEVER spans the body (movies run for hours)
    const connectTimer = setTimeout(() => rq.destroy(new Error('connect timeout')), 15000);
    rq.on('response', () => clearTimeout(connectTimer));
    rq.on('error', (err) => {
      clearTimeout(connectTimer);
      if (TRANSIENT.has(err?.code) && retriesLeft > 0) {
        // stale socket / momentary reset — one clean retry on a fresh connection
        rq.destroy();
        return resolve(fetchRaw(urlStr, headers, redirectsLeft, retriesLeft - 1));
      }
      console.warn(`[stream] connect/stream error: ${err?.message} (${err?.code || '?'})`);
      reject(err);
    });
    rq.end();
  });
}

// t61: stream a file straight off THIS machine's disk (the local file
// grabber). Full HTTP Range support — seeking works exactly like the proxy.
export function streamLocalFile(req, res, absPath, mime) {
  fs.stat(absPath, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('file not found'); return; }
    const total = st.size;
    const head = (code, extra) => res.writeHead(code, {
      'Content-Type': mime || 'application/octet-stream', 'Accept-Ranges': 'bytes', ...extra });
    const range = req.headers.range;
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(range || ''));
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
      if (start >= total || start > end) { head(416, { 'Content-Range': `bytes */${total}` }); res.end(); return; }
      head(206, { 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': String(end - start + 1) });
      fs.createReadStream(absPath, { start, end }).pipe(res);
    } else {
      head(200, { 'Content-Length': String(total) });
      fs.createReadStream(absPath).pipe(res);
    }
  });
}

export async function proxyVideo(req, res, upstreamUrl) {
  let done = false, clientGone = false, repairs = 0, pipedTotal = 0;
  let currentUp = null;

  // count every byte we hand the client (across ALL upstream chunks)
  const origWrite = res.write.bind(res);
  res.write = (chunk, ...a) => { if (chunk) pipedTotal += chunk.length; return origWrite(chunk, ...a); };
  res.on('close', () => { clientGone = true; currentUp?.abort?.(); currentUp?.stream?.destroy(); });
  res.on('error', () => { clientGone = true; currentUp?.abort?.(); currentUp?.stream?.destroy(); });

  // SEAMLESS RANGE REPAIR — archive nodes sometimes quit mid-range. Instead of
  // destroying the client response (which forces the player to re-request and
  // re-buffer from zero), fetch exactly the missing bytes and keep filling the
  // SAME response. The player never knows anything happened. (repairCtx is
  // captured from the FIRST upstream response once it arrives.)

  async function tryRepair(nextFrom) {
    const cr = repairCtx;     // 'bytes s-e/total' from the ORIGINAL response
    if (!cr || repairs >= 3 || clientGone || res.destroyed || !res.writable) return false;
    const end = Number(cr[2]);
    if (!(nextFrom <= end)) return false;
    repairs++;
    try {
      const nxt = await fetchRaw(upstreamUrl, { range: `bytes=${nextFrom}-${end}` });
      if (nxt.status >= 400) { nxt.stream.resume(); return false; }
      const ncr = (nxt.headers['content-range'] || '').match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if (!ncr || Number(ncr[1]) !== nextFrom) { nxt.stream.resume(); return false; }  // range ignored — never splice from 0
      await pump(nxt, nextFrom);
      return true;
    } catch { return false; }
  }

  // fill the client response with ONE upstream chunk; short deliveries chain
  // into tryRepair automatically (up to 3 times) before giving up
  function pump(up, fromByte) {
    return new Promise((resolve) => {
      currentUp = up;
      const promised = parseInt(up.headers['content-length'], 10);   // THIS chunk's length
      let chunkPiped = 0;
      let settled = false;               // a truncated stream can fire error AND close —
      const once = () => { if (settled) return true; settled = true; return false; };  // run once per chunk
      up.stream.on('data', (c) => { chunkPiped += c.length; });
      const finishShort = async (why) => {        // invoked exactly once — callers gate via once()
        if (done || clientGone) return resolve();
        const ok = await tryRepair(fromByte + chunkPiped);
        if (!ok) {
          console.warn(`[stream] upstream ended short (${why}) after ${pipedTotal}B of ${up.headers['content-range'] || up.headers['content-length'] || '?'}`);
          done = true;
          up.abort?.(); up.stream.destroy();
          if (!res.writableEnded) res.destroy();   // client player's resume path takes over
        }
        resolve();
      };
      up.stream.on('end', () => {
        if (once()) return resolve();
        if (done || clientGone) return resolve();
        if (Number.isFinite(promised) && chunkPiped < promised) return finishShort('end');
        done = true; resolve();                    // clean, complete transfer
      });
      up.stream.on('close', () => { if (!once()) finishShort('close'); else resolve(); });
      up.stream.on('error', (err) => {
        if (once()) return resolve();
        if (done || clientGone) return resolve();
        if (Number.isFinite(promised) && chunkPiped < promised) return finishShort(`error ${err?.code || err?.message || '?'}`);
        console.error(`[stream] upstream error: ${err?.message || err} (${err?.code || '?'})`);
        done = true; up.abort?.(); if (!res.writableEnded) res.destroy();
        resolve();
      });
      up.stream.pipe(res);
    });
  }

  let up;
  try {
    up = await fetchRaw(upstreamUrl, req.headers.range ? { range: req.headers.range } : {});
  } catch (err) {
    console.warn(`[stream] upstream connect failed: ${err?.message || err}`);
    if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('video fetch failed'); }
    return;
  }
  if (up.status >= 400) {
    up.stream.resume();
    if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end(`video HTTP ${up.status}`); }
    return;
  }

  const outHeaders = {};
  for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const v = up.headers[h];
    if (v) outHeaders[h] = v;
  }
  if (!outHeaders['accept-ranges']) outHeaders['accept-ranges'] = 'bytes';
  outHeaders['Cache-Control'] = 'no-store';
  res.writeHead(up.status, outHeaders);

  var repairCtx = (up.headers['content-range'] || '').match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  await pump(up, repairCtx ? Number(repairCtx[1]) : 0);
}
