// ─────────────────────────────────────────────────────────────────────────────
//  adapters/iptv.js — the LIVE TV wing: free channels from iptv-org, played
//  through a signed m3u8-rewriting proxy (the QA-audit-proven design).
//
//  DOCTRINE (owner orders, 2026-09-12):
//   · TV channels NEVER go on the store shelves — they live in the theater's
//     GUIDE menu only (items carry guideOnly so the shelf stocker skips them).
//   · Officially-free tier by default (Pluto/Tubi/ABC/PBS/public broadcasters);
//     an admin "unverified" toggle can widen it (off by default, labeled).
//   · NSFW channels are excluded at build time, always.
//   · No fabricated listings: the Guide shows honest ● LIVE cells (there is
//     no free EPG for FAST channels — measured, see RESEARCH-LIVETV.md).
//
//  Streams are HLS (.m3u8). Browsers other than Safari can't play HLS
//  natively, and most stream hosts send no CORS headers — so playback ALWAYS
//  routes through THIS server (manifest fetched server-side, variant/segment
//  URLs rewritten to signed proxy URLs). Direct-play stays a future
//  optimization for CORS-open CDNs only.
//
//  cfg: { sections: ['news','movies',…], unverified: false, url: '' }
//       url = API base override (tests/mock); '' = the real iptv-org API.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { getSecret } from '../store.js';

const API_BASE = 'https://iptv-org.github.io/api';
const CACHE_TTL = 10 * 60 * 1000;

// Channel groups = the Guide's sections (the "pages" of the old paper guide).
const GROUPS = [
  { key: 'news', title: 'News', cats: ['news', 'legislative', 'weather'] },
  { key: 'movies', title: 'Movies', cats: ['movies'] },
  { key: 'series', title: 'Series', cats: ['series'] },
  { key: 'kids', title: 'Kids', cats: ['kids'] },
  { key: 'documentary', title: 'Documentary', cats: ['documentary'] },
  { key: 'entertainment', title: 'Entertainment', cats: ['entertainment', 'general'] },
  { key: 'comedy', title: 'Comedy', cats: ['comedy'] },
  { key: 'sports', title: 'Sports', cats: ['sports'] },
  { key: 'music', title: 'Music', cats: ['music'] },
  { key: 'animation', title: 'Animation', cats: ['animation'] },
  { key: 'classic', title: 'Classic TV', cats: ['classic', 'culture'] },
  { key: 'public', title: 'Public Broadcasters', broadcasters: true }
];

// Owners/networks that OFFICIALLY publish free streams (FAST platforms,
// broadcasters, local-news groups) — the curated default tier.
const OFFICIAL = ['Pluto', 'Tubi', 'Samsung', 'Roku', 'STIRR', 'Plex', 'Xumo',
  'ABC', 'CBS', 'NBC', 'PBS', 'NASA', 'Bloomberg', 'AMG', 'Court TV', 'Comet',
  'Charge', 'TBD', 'Weather', 'Newsmax', 'OANN', 'Gray', 'Sinclair', 'Scripps',
  'Hearst', 'Tegna', 'Cox Media', 'Nexstar', 'Graham', 'Estrella', 'Telemundo',
  'Univision', 'The CW', 'Weigel', 'FreeTV', 'STIRR'];
// International public broadcasters (any country — they stream free worldwide).
const PUBLIC_BC = ['DW', 'Deutsche Welle', 'France 24', 'France24', 'NHK', 'Al Jazeera',
  'Euronews', 'CGTN', 'TRT', 'RTVE', 'Rai', 'TV5', 'Africa News', 'ABC Australia', 'CBC', 'BBC'];

const h = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

const feedCache = new Map();     // base → { at, channels, streams }
const registry = new Map();      // itemKey → stream URL (playable set)

async function fetchJson(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'home-binger/1.0 (free live TV rack for personal media servers)' },
    signal: AbortSignal.timeout(20000), redirect: 'follow'
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function loadFeeds(base) {
  const hit = feedCache.get(base);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit;
  const [channels, streams] = await Promise.all([
    fetchJson(base + '/channels.json'),
    fetchJson(base + '/streams.json')
  ]);
  // t127: LANGUAGE PAGES — the API's channel objects carry no language field
  // (measured: 0 of 31,299), but the directory publishes one playlist grouped
  // by language (#EXTINF group-title = the language's name, tvg-id = channel
  // id). Join on it. OPTIONAL: if the fetch fails, the Guide just offers no
  // language pages — channels are unaffected.
  let langMap = null;
  try {
    const r = await fetch(langPlaylistUrl(base), {
      headers: { 'User-Agent': 'home-binger/1.0 (free live TV rack for personal media servers)' },
      signal: AbortSignal.timeout(20000), redirect: 'follow'
    });
    if (r.ok) langMap = parseLangMap(await r.text());
  } catch { /* optional data — degrade quietly */ }
  const out = { at: Date.now(), channels, streams, langMap };
  feedCache.set(base, out);
  return out;
}

// real API base ends in /api; the language playlist lives beside it under /iptv
const langPlaylistUrl = (base) =>
  /\/api$/.test(base) ? base.slice(0, -4) + '/iptv/index.language.m3u' : base + '/index.language.m3u';

function parseLangMap(text) {
  const map = new Map();               // channel id → Set(language names)
  for (const line of text.split('\n')) {
    if (!line.startsWith('#EXTINF')) continue;
    const id = line.match(/tvg-id="([^"@]+)/)?.[1];
    const lang = line.match(/group-title="([^"]*)"/)?.[1];
    if (!id || !lang) continue;
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(lang);
  }
  return map;
}

const norm = (s) => String(s || '').toLowerCase();
function isOfficial(c) {
  const net = norm(c.network) + ' ' + (c.owners || []).map(norm).join(' ');
  if (OFFICIAL.some(o => net.includes(norm(o)))) return true;
  if (PUBLIC_BC.some(o => norm(c.name).includes(norm(o)) || net.includes(norm(o)))) return true;
  return false;
}
function isPublicBroadcaster(c) {
  const net = norm(c.network) + ' ' + (c.owners || []).map(norm).join(' ');
  return PUBLIC_BC.some(o => norm(c.name).includes(norm(o)) || net.includes(norm(o)));
}

function groupFor(c) {
  if (isPublicBroadcaster(c) && c.country !== 'US') return 'public';
  const cats = c.categories || [];
  for (const g of GROUPS) {
    if (g.broadcasters) continue;
    if (g.cats.some(cat => cats.includes(cat))) return g.key;
  }
  return null;
}

export const iptvAdapter = {
  name: 'Live TV',

  async libraries() {
    return { libraries: GROUPS.filter(g => g.key !== 'public' || true).map(g => ({ key: g.key, title: g.title, type: 'live' })) };
  },

  async library(cfg) {
    const base = (/^https?:\/\//.test(cfg.url || '') ? cfg.url : API_BASE).replace(/\/+$/, '');
    const unverified = cfg.unverified === true;
    const wanted = new Set(Array.isArray(cfg.sections) ? cfg.sections.map(String) : []);
    if (!wanted.size) return [];
    const { channels, streams, langMap } = await loadFeeds(base);
    const byId = new Map(channels.map(c => [c.id, c]));

    // best stream per channel: https first, then any
    const best = new Map();
    for (const s of streams) {
      if (!s.channel || !/^https?:\/\//i.test(s.url || '')) continue;
      const cur = best.get(s.channel);
      const isHttps = s.url.startsWith('https://');
      if (!cur || (isHttps && !cur.https)) best.set(s.channel, { url: s.url, https: isHttps });
    }

    const out = [];
    const officialKeys = new Set();   // t125: curated-first ordering (below)
    for (const c of channels) {
      if (c.is_nsfw) continue;                                   // ALWAYS excluded
      const st = best.get(c.id);
      if (!st) continue;
      const official = isOfficial(c);
      if (!unverified && !official) continue;                    // curated tier default
      const g = groupFor(c);
      if (!g || !wanted.has(g)) continue;
      const gTitle = (GROUPS.find(x => x.key === g) || {}).title || g;
      const key = `lv${h(st.url).slice(0, 12)}`;
      registry.set(key, st.url);
      if (official) officialKeys.add(key);
      out.push({
        id: `iptv:${key}`,
        source: 'iptv',
        key,
        type: 'live',
        title: c.name || 'Channel',
        year: null, rating: null, addedAt: 0,
        genres: [gTitle],
        sectionId: `iptv:${g}`,
        sectionTitle: gTitle,
        guideOnly: true,          // NEVER shelved (owner order) — Guide + /m only
        langs: langMap?.get(c.id) ? [...langMap.get(c.id)] : [],   // t127: language pages
        mediaUrl: st.url          // server-side only (stripped by /api/library)
      });
    }
    // stable, browsable order: group, then CURATED FIRST, then name (t125: with
    // the unverified tier on, the officially-free channels keep the front rows —
    // main listings before extended listings, like the old paper guides)
    const gOrder = new Map(GROUPS.map((g, i) => [g.key, i]));
    out.sort((a, b) => (gOrder.get(a.sectionId.slice(5)) ?? 99) - (gOrder.get(b.sectionId.slice(5)) ?? 99)
      || Number(officialKeys.has(b.key)) - Number(officialKeys.has(a.key))
      || String(a.title).localeCompare(String(b.title)));
    return out;
  },

  streamUrl(cfg, key) { return registry.get(key) || null; },
  audioUrl(cfg, key) { return registry.get(key) || null; },

  async detail(cfg, key) {
    const url = registry.get(key);
    if (!url) return null;
    return { title: 'Live channel', summary: 'A free live TV channel — plays on the theater screen through the Guide.', playUrl: null };
  },
  posterUrl() { return null; }    // the paper-guide look: numbers + names (logos later if wanted)
};

// ── the signed m3u8-rewriting proxy (QA-audit-proven, 9/12 channels) ─────────
//
// GET /api/play/iptv/<key>            → fetch the manifest, rewrite, serve
// GET /api/play/iptv/<key>?u=&s=      → pipe one segment (u = upstream URL,
//                                        s = HMAC signature — NO open proxy)

function sig(url) {
  return crypto.createHmac('sha256', getSecret()).update(url).digest('hex').slice(0, 20);
}
function isPrivateHost(hostname) {
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?)/i.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

function fetchRaw(urlStr, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch { return reject(new Error('bad upstream URL')); }
    const mod = u.protocol === 'https:' ? https : http;
    const rq = mod.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (home-binger live TV proxy)', Accept: '*/*' }
    }, (up) => {
      if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location && redirectsLeft > 0) {
        up.resume();
        try { return resolve(fetchRaw(new URL(up.headers.location, u).toString(), redirectsLeft - 1)); }
        catch { return reject(new Error('bad redirect')); }
      }
      resolve({ status: up.statusCode, headers: up.headers, stream: up, finalUrl: u.toString(), abort: () => rq.destroy() });
    });
    const t = setTimeout(() => rq.destroy(new Error('connect timeout')), 12000);
    rq.on('response', () => clearTimeout(t));
    rq.on('error', (e) => { clearTimeout(t); reject(e); });
    rq.end();
  });
}

export async function proxyIptv(req, res, key, cfg) {
  const sp = new URL(req.url, 'http://x').searchParams;
  const mockMode = !!cfg?.url;                     // tests may point at a local mock

  // ── shared: serve ONE upstream response. Playlists (master OR variant —
  //    variants arrive through the signed u= path too!) get REWRITTEN so
  //    every relative/absolute line points back through this signed proxy;
  //    media segments pipe straight through. (The suite caught the variant
  //    gap: piping a variant verbatim left its relative segments resolving
  //    against the wrong path — 404s on hosts that use relative names.)
  const serve = (r) => {
    const isM3u8 = /mpegurl/i.test(r.headers['content-type'] || '') || /\.m3u8(\?|$)/i.test(r.finalUrl);
    if (!isM3u8) {
      res.writeHead(200, { 'Content-Type': r.headers['content-type'] || 'video/mp2t', 'Cache-Control': 'no-store' });
      r.stream.pipe(res);
      r.stream.on('error', () => res.destroy());
      return;
    }
    let buf = '';
    r.stream.setEncoding('utf8');
    r.stream.on('data', (c) => buf += c);
    r.stream.on('end', () => {
      const abs = r.finalUrl;
      const px = (u) => {
        const full = new URL(u, abs).toString();
        return `/api/play/iptv/${key}?u=${encodeURIComponent(full)}&s=${sig(full)}`;
      };
      const lines = buf.split('\n').map((line) => {
        const t = line.trim();
        if (!t || t.startsWith('#')) {
          // rewrite URI="…" inside tags (keys, media renditions)
          return line.replace(/URI="([^"]+)"/g, (m, uri) => 'URI="' + px(uri) + '"');
        }
        return px(t);
      });
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
      res.end(lines.join('\n'));
    });
    r.stream.on('error', () => { if (!res.headersSent) { res.writeHead(502); res.end('playlist read failed'); } else res.destroy(); });
  };
  const failUpstream = (why) => { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end(why); };

  // ── segment/variant phase: signed URL required ──
  const up = sp.get('u');
  if (up) {
    if (up.length > 2048 || !/^https?:\/\//i.test(up)) { res.writeHead(400); return res.end('bad segment URL'); }
    if (sp.get('s') !== sig(up)) { res.writeHead(403); return res.end('bad signature'); }
    let host = '';
    try { host = new URL(up).hostname; } catch { res.writeHead(400); return res.end('bad URL'); }
    if (!mockMode && isPrivateHost(host)) { res.writeHead(403); return res.end('private hosts not allowed'); }
    let r;
    try { r = await fetchRaw(up); } catch { return failUpstream('segment fetch failed'); }
    if (r.status >= 400) { r.stream.resume(); r.abort(); return failUpstream('segment HTTP ' + r.status); }
    return serve(r);
  }

  // ── manifest phase ──
  const streamUrl = registry.get(key);
  if (!streamUrl) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('no stream for this item'); }
  let r;
  try { r = await fetchRaw(streamUrl); }
  catch { return failUpstream('channel unreachable'); }
  if (r.status >= 400) { r.stream.resume(); r.abort(); return failUpstream('channel HTTP ' + r.status); }
  serve(r);
}
