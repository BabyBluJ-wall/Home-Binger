// ─────────────────────────────────────────────────────────────────────────────
//  routes/api.js — every JSON endpoint the frontend talks to
// ─────────────────────────────────────────────────────────────────────────────
//  PUBLIC (no login):
//    GET  /api/bootstrap     everything the app needs on load (session, prefs…)
//    GET  /api/library       the store catalogue (normalised items)
//    POST /api/prefs         save MY theme/sorting (guest device or account)
//    POST /api/auth/register optional account (syncs prefs across devices)
//    POST /api/auth/login
//    POST /api/auth/logout
//    POST /api/account/password      change my own password
//    POST /api/account/username      change my own display name
//    GET  /api/item/:source/:key     full metadata for the detail modal
//    GET  /img/:source/:key          poster (proxied + cached, token-safe)
//    GET  /api/tv                    what's playing on the in-store TV
//    GET  /api/tv/stream             TV video stream (Range-capable proxy)
//
//  ADMIN ONLY:
//    GET/PUT /api/admin/config       global settings incl. server credentials
//    POST    /api/admin/test         test Plex/Jellyfin connection
//    GET     /api/admin/users        user management
//    POST    /api/admin/users/:id/password   reset a user's password
//    DELETE  /api/admin/users/:id    delete user
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import {
  getConfig, saveConfig, deepMerge, defaultConfig, defaultPrefs
} from '../lib/store.js';
import {
  hashPassword, verifyPassword, findUser, publicUser, createSession, destroySession,
  getSessionUser, profileKeyFor, readPrefs, writePrefs, migrateDevicePrefs, sanitizeShelfMap, sanitizeSourcesPref } from '../lib/auth.js';
import {
  getLibrary, findItem, posterUrlFor, streamUrlFor, libraryStatus, invalidateCache, librarySections, userView, defaultView, ADAPTERS, sourceConfig
} from '../lib/library.js';
import { proxyImage, proxyVideo, streamLocalFile } from '../lib/proxy.js';
import { localAdapter } from '../lib/adapters/local.js';   // t61: mime lookup for disk streams
import { friendAdapter, findShareEntry, friendSourceIds, shareableWith, sectionKeyOf, newCode } from '../lib/friends.js';   // t97: HB↔HB
import fs from 'node:fs';                                 // t66: grabber spot validation
import path from 'node:path';                             // t89: thumb cache dir
import { DATA_DIR } from '../lib/store.js';                // t89: grabbed-file case art
import { CATALOG_SECTIONS } from '../lib/adapters/archive.js';
import { GENRES as RADIO_GENRES } from '../lib/adapters/radio.js';

// t96: own version + the release feed (new-version notice)
const PKG = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const GH_RELEASES = 'https://api.github.com/repos/BabyBluJ-wall/Home-Binger/releases/latest';
const GH_RELEASES_PAGE = 'https://github.com/BabyBluJ-wall/Home-Binger/releases/latest';
const verCache = new Map();            // feed → { t, data } — 10-minute cache
function cmpVersion(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

// ── tiny helpers ─────────────────────────────────────────────────────────────
const json = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders(res)
  });
  res.end(body);
};
const ok = (res, obj) => json(res, 200, obj);
const fail = (res, status, message) => json(res, status, { error: message });

// Permissive CORS so the app also works when embedded through a proxy/preview.
function corsHeaders(res) {
  const origin = res.req?.headers?.origin;
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

// t89: where a grabbed video's generated case image lives (content-hashed —
// the item key can contain '/', '..' etc. and NEVER touches the path)
function localThumbPath(key) {
  if (!key) return null;
  const h = crypto.createHash('sha1').update('local:' + key).digest('hex');
  return path.join(DATA_DIR, 'thumbs', h + '.jpg');
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function requireAdmin(req, res) {
  const user = getSessionUser(req);
  if (!user?.isAdmin) { fail(res, 403, 'Admin access required'); return null; }
  return user;
}

// Mask a secret for sending to the browser: the client sends the mask back
// verbatim to mean "leave unchanged".
const MASK = '••••••••';
let localNotes = [];        // t66: grabber folders that don't exist (per save)
function maskConfig(cfg) {
  const safe = JSON.parse(JSON.stringify(cfg));
  if (safe.plex?.token) safe.plex.token = MASK;
  if (safe.jellyfin?.apiKey) safe.jellyfin.apiKey = MASK;
  if (Array.isArray(safe.instances)) {                     // t87: extra connections mask too
    for (const i of safe.instances) {
      if (i?.token) i.token = MASK;
      if (i?.apiKey) i.apiKey = MASK;
    }
  }
  return safe;
}

// ── the router ───────────────────────────────────────────────────────────────
export async function handleApi(req, res, pathname) {
  const method = req.method;
  if (method === 'OPTIONS') { res.writeHead(204, corsHeaders(res)); res.end(); return true; }

  try {
    // ── health ──
    if (pathname === '/api/health') return ok(res, { ok: true, uptime: process.uptime() });

    // ── bootstrap: one call to boot the whole app ──
    if (method === 'GET' && pathname === '/api/bootstrap') {
      const cfg = getConfig();
      const user = getSessionUser(req);
      const key = profileKeyFor(req, res); // may mint the anonymous device cookie
      const prefs = readPrefs(key);
      const locks = cfg.locks;
      // If a lock is on, the store default wins over personal prefs.
      const effective = {
        theme: locks.theme ? { ...cfg.defaults.theme } : prefs.theme,
        sorting: locks.sorting ? { ...cfg.defaults.sorting } : prefs.sorting,
        visualizer: prefs.visualizer || { style: 'bars' },
        // personal shelf map; falls back to the store-wide map (admin's baseline);
        // a lock forces the store's map on everyone
        shelves: locks.shelves ? (cfg.shelves || {}) : (prefs.shelves && Object.keys(prefs.shelves).length ? prefs.shelves : (cfg.shelves || {})),
        tv: prefs.tv || { idleMode: '', itemId: '' },
        dance: prefs.dance || { movement: 1, speed: 1, ballSpin: 1, pattern: 'auto' },   // t86 · t93: movement, not brightness
        sources: locks.sources ? null : (prefs.sources ?? null)
      };
      const status = await libraryStatus();
      const tvTitle = await resolveTvTitle(cfg).catch(() => null);
      return ok(res, {
        version: PKG.version,          // t96: the app's own version (notice compares against it)
        me: { ...publicUser(user), isGuest: !user },
        profileKey: key,
        prefs: effective,
        mySavedPrefs: prefs,
        locks,
        defaults: cfg.defaults,
        registrationAllowed: !!cfg.registration,
        source: { ...status, configured: status.ok },
        tv: { enabled: cfg.tv.enabled, idleMode: cfg.tv.mode, title: tvTitle }
      });
    }

    // ── t96: NEW-VERSION NOTICE — quiet launch check, toast + link, never a
    //    download. Fails silent on any network error; 10-minute cache; the
    //    admin kill-switch (config.version.check === false) short-circuits.
    if (method === 'GET' && pathname === '/api/version/latest') {
      const cfg = getConfig();
      const out = { current: PKG.version, latest: null, newer: false, url: null, checked: false };
      if (cfg.version?.check === false) return ok(res, out);
      const feed = (typeof cfg.version?.url === 'string' && /^https?:\/\//.test(cfg.version.url)) ? cfg.version.url : GH_RELEASES;
      const hit = verCache.get(feed);
      if (hit && Date.now() - hit.t < 600000) return ok(res, { ...out, ...hit.data });
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(feed, { headers: { 'user-agent': 'HomeBinger/' + PKG.version, accept: 'application/json' }, signal: ctl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error('status ' + r.status);
        const rel = await r.json();
        const latest = String(rel.tag_name || '').trim().replace(/^v/i, '').replace(/^[^0-9.]+/, '');   // t96b: tolerate tag prefixes (e.g. "Rv1.8" → 1.8)
        const page = /^https?:\/\//.test(String(rel.html_url || '')) ? String(rel.html_url) : GH_RELEASES_PAGE;
        const data = { latest, newer: !!latest && cmpVersion(latest, PKG.version) > 0, url: page, checked: true };
        verCache.set(feed, { t: Date.now(), data });
        return ok(res, { ...out, ...data });
      } catch { return ok(res, out); }   // quiet — the store never waits on the internet
    }

    // ── t97: HB↔HB FRIEND API (host side). Token-gated, LAN/VPN only: a
    //    friend reaches these solely with a code the owner deliberately gave
    //    them. Items a friend shared INTO this store are NEVER served onward
    //    (no transitive sharing) and only shelves ticked for THAT friend go
    //    out. Media streams through THIS store — tokens stay home.
    if (method === 'GET' && pathname === '/api/friend/catalog') {
      const cfg = getConfig();
      const fq = new URL(req.url, 'http://x');
      const entry = findShareEntry(cfg, fq.searchParams.get('token') || '');
      if (!cfg.friendShare?.on || !entry) return fail(res, 401, 'Not invited');
      // t99: OWN content only — friend stores are excluded from this view.
      // (a) items a friend shared INTO this store are never shareable onward
      // anyway (the no-chains rule), and (b) including them made two stores
      // that follow EACH OTHER fetch catalogs in a circle on cold cache.
      const ownView = { ...defaultView(cfg), stores: [] };
      const items = await getLibrary(false, ownView);
      const fIds = friendSourceIds(cfg);
      const vis = items.filter(it => shareableWith(entry, it, fIds));
      const secs = [...new Map(vis.map(it => [sectionKeyOf(it), { key: sectionKeyOf(it), title: it.sectionTitle || it.type || 'Media' }])).values()];
      return ok(res, {
        ok: true, store: entry.name, sections: secs,
        items: vis.map(it => ({
          source: it.source, key: it.key, title: it.title, type: it.type, year: it.year,
          summary: it.summary || '', sectionKey: sectionKeyOf(it),
          sectionTitle: it.sectionTitle || it.type || 'Media', addedAt: it.addedAt || 0
        }))
      });
    }
    if (method === 'GET' && pathname.startsWith('/api/friend/stream/')) {
      const cfg = getConfig();
      const fq = new URL(req.url, 'http://x');
      const entry = findShareEntry(cfg, fq.searchParams.get('token') || '');
      if (!cfg.friendShare?.on || !entry) { res.writeHead(401, { 'Content-Type': 'text/plain' }); res.end('not invited'); return true; }
      const _fp = pathname.split('/').map(decodeURIComponent);
      const fSrc = _fp[4], fKey = _fp.slice(5).join('/');
      const item = await findItem(fSrc, fKey, { ...defaultView(cfg), stores: [] });   // t99: own view — the shared item is by definition ours
      if (!item || !shareableWith(entry, item, friendSourceIds(cfg))) { res.writeHead(403, { 'Content-Type': 'text/plain' }); res.end('not shared to you'); return true; }
      const upstream = await streamUrlFor(fSrc, fKey).catch(() => null);
      if (String(upstream).startsWith('local-file:')) {
        const abs = String(upstream).slice('local-file:'.length);
        streamLocalFile(req, res, abs, localAdapter.mimeFor(abs));
        return true;
      }
      if (!upstream) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no stream for this item'); return true; }
      await proxyVideo(req, res, upstream);
      return true;
    }
    if (method === 'GET' && pathname.startsWith('/api/friend/poster/')) {
      const cfg = getConfig();
      const fq = new URL(req.url, 'http://x');
      const entry = findShareEntry(cfg, fq.searchParams.get('token') || '');
      if (!cfg.friendShare?.on || !entry) { res.writeHead(401); res.end(); return true; }
      const _pp = pathname.split('/').map(decodeURIComponent);
      const fSrc = _pp[4], fKey = _pp.slice(5).join('/');
      const item = await findItem(fSrc, fKey, { ...defaultView(cfg), stores: [] });   // t99: own view
      if (!item || !shareableWith(entry, item, friendSourceIds(cfg))) { res.writeHead(403); res.end(); return true; }
      const up = await posterUrlFor(fSrc, fKey).catch(() => null);
      if (!up) { res.writeHead(404); res.end(); return true; }
      await proxyImage(req, res, up);
      return true;
    }

    // ── public source catalogue: what a visitor can put on THEIR shelves ──
    if (method === 'GET' && pathname === '/api/sources') {
      const cfg = getConfig();
      return ok(res, {
        available: {
          plex: !!(cfg.plex?.url && cfg.plex?.token),
          jellyfin: !!(cfg.jellyfin?.url && cfg.jellyfin?.apiKey)
        },
        instances: (cfg.instances || []).map(i => ({    // t87: extra connections, My Media toggles
          id: i.id, kind: i.kind, name: i.name, on: i.on !== false,
          ready: !!(i.url && (i.token || i.apiKey))
        })),
        stores: (cfg.friendStores || []).map(s => ({     // t97: friends' stores, My Media toggles
          id: s.id, name: s.name, on: s.on !== false, ready: !!(s.url && s.token)
        })),
        storeDefaults: {
          sources: cfg.sources || {},
          archive: cfg.archive?.sections || [],
          radio: cfg.radio?.sections || []
        },
        archive: (CATALOG_SECTIONS || []).map(c => ({ key: c.key, title: c.title })),
        radio: (RADIO_GENRES || []).map(g => ({ key: g.key, title: g.title }))
      });
    }

    // ── catalogue ──
    if (method === 'GET' && pathname === '/api/library') {
      const cfg = getConfig();
      // per-visitor view: the store's setup overlaid with their media mix
      const view = userView(cfg, readPrefs(profileKeyFor(req, res))?.sources);
      const items = await getLibrary(req.url.includes('refresh=1'), view);
      return ok(res, {
        items: items.map(i => ({
          id: i.id, source: i.source, key: i.key, type: i.type, title: i.title,
          year: i.year, rating: i.rating, addedAt: i.addedAt, genres: i.genres,
          sectionId: i.sectionId || null,          // Shelf Map key (e.g. 'archive:staff-picks')
          sectionTitle: i.sectionTitle || null     // real library name (By Library sort)
          // NOTE: no 'thumb' — posters are fetched via /img/<source>/<key>
        })),
        sections: await librarySections(view),
        shelves: cfg.shelves || {},
        count: items.length
      });
    }

    // ── per-user preferences (guest device OR logged-in account) ──
    if (method === 'POST' && pathname === '/api/prefs') {
      const cfg = getConfig();
      const key = profileKeyFor(req, res);
      if (!key) return fail(res, 401, 'No profile');
      const body = await readBody(req);
      const prefs = readPrefs(key);
      // Respect locks: ignore changes to locked areas.
      if (!cfg.locks.theme && body.theme) {
        prefs.theme = sanitizeTheme({ ...prefs.theme, ...body.theme });
      }
      if (!cfg.locks.sorting && body.sorting) {
        prefs.sorting = sanitizeSorting({ ...prefs.sorting, ...body.sorting });
      }
      if (body.visualizer) {
        const v = body.visualizer;
        prefs.visualizer = {
          style: ['bars', 'mirror', 'wave', 'pulse'].includes(v.style) ? v.style : 'bars'
          // no color — the visualizer always follows the theme accent
        };
      }
      if (body.dance) {   // t86: dance-floor light engine · t93: MOVEMENT (travel amplitude),
        // never brightness — legacy 1.6.x prefs saved under "intensity" are honored.
        const d = body.dance;
        const num = (v, dflt, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);
        const prev = prefs.dance || {};
        const mvIn = d.movement !== undefined ? d.movement : d.intensity;
        const mvPrev = prev.movement !== undefined ? prev.movement : prev.intensity;
        prefs.dance = {
          movement: num(mvIn, mvPrev ?? 1, 0.2, 2.5),
          speed: num(d.speed, prev.speed ?? 1, 0.3, 2.5),
          ballSpin: num(d.ballSpin, prev.ballSpin ?? 1, 0, 3),
          pattern: ['auto', '0', '1', '2', '3'].includes(String(d.pattern)) ? String(d.pattern)
            : (prev.pattern ?? 'auto')
        };
      }
      // personal shelf map (unitId → sectionKey; '' entries clear mappings)
      if (body.shelves && !cfg.locks.shelves) {
        prefs.shelves = sanitizeShelfMap({ ...(prefs.shelves || {}), ...body.shelves });
      }
      // personal media mix (null = follow the store's setup)
      if (body.sources !== undefined && !cfg.locks.sources) prefs.sources = sanitizeSourcesPref(body.sources);
      // personal TV idle pick ('' = follow the store default)
      if (body.tv) {
        prefs.tv = {
          idleMode: ['', 'standby', 'loop', 'item'].includes(body.tv.idleMode) ? body.tv.idleMode : '',
          itemId: /^[\w:-]{1,80}$/.test(body.tv.itemId || '') ? body.tv.itemId : ''
        };
      }
      writePrefs(key, prefs);
      return ok(res, { prefs });
    }

    // ── auth ──
    if (method === 'POST' && pathname === '/api/auth/register') {
      const cfg = getConfig();
      if (!cfg.registration) return fail(res, 403, 'Registration is disabled by the admin');
      const body = await readBody(req);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!/^[a-zA-Z0-9_. -]{2,32}$/.test(username)) return fail(res, 400, 'Username must be 2–32 letters/numbers');
      if (password.length < 4) return fail(res, 400, 'Password must be at least 4 characters');
      if (findUser(username)) return fail(res, 409, 'That username is taken');
      const db = (await import('../lib/store.js')).getDb();
      const user = {
        id: crypto.randomUUID(), username,
        pass: hashPassword(password), isAdmin: false, createdAt: Date.now()
      };
      db.users.push(user);
      (await import('../lib/store.js')).saveDb();
      migrateDevicePrefs(req, res, user.id); // carry guest prefs into the account
      const token = createSession(req, res, user.id);
      return ok(res, { me: publicUser(user), token });   // token → localStorage (proxy-safe)
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readBody(req);
      const user = findUser(body.username);
      if (!user || !verifyPassword(body.password, user.pass)) {
        return fail(res, 401, 'Wrong username or password');
      }
      migrateDevicePrefs(req, res, user.id);
      const token = createSession(req, res, user.id);
      return ok(res, { me: publicUser(user), token });   // token → localStorage (proxy-safe)
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      destroySession(req, res);
      profileKeyFor(req, res); // mint a fresh anonymous device id
      return ok(res, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/account/username') {   // t90: rename MYSELF
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Not logged in');
      const body = await readBody(req);
      const name = String(body.username || '').trim();
      if (!/^[\w .-]{2,32}$/.test(name)) return fail(res, 400, 'Name must be 2-32 letters, numbers, spaces, . - _');
      const store = await import('../lib/store.js');
      const db = store.getDb();
      if (db.users.some(u => u.id !== user.id && u.username.toLowerCase() === name.toLowerCase())) {
        return fail(res, 409, 'That name is already taken');
      }
      user.username = name;         // same guarantees as the admin rename: sessions + prefs key by user id
      store.saveDb();
      return ok(res, { ok: true, username: name });
    }

    if (method === 'POST' && pathname === '/api/account/password') {
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Not logged in');
      const body = await readBody(req);
      if (!verifyPassword(body.oldPassword, user.pass)) return fail(res, 400, 'Current password is incorrect');
      if (String(body.newPassword || '').length < 4) return fail(res, 400, 'New password must be at least 4 characters');
      user.pass = hashPassword(body.newPassword);
      (await import('../lib/store.js')).saveDb();
      return ok(res, { ok: true });
    }

    // ── item detail ──
    if (method === 'GET' && pathname.startsWith('/api/item/')) {
      // /api/item/<source>/<key> → skip ['', 'api', 'item']; key may contain '/'
      const _ip = pathname.split('/').map(decodeURIComponent);
      const source = _ip[3], key = _ip.slice(4).join('/');
      const sc = sourceConfig(source);                 // t87: built-in or instance
      const adapter = sc?.adapter;
      if (!adapter) return fail(res, 404, 'Unknown source');
      const detail = await adapter.detail(sc?.cfg || {}, key);
      if (!detail) return fail(res, 404, 'Not found');
      return ok(res, detail);
    }

    // ── posters: /img/<source>/<key> ──
    if (method === 'GET' && pathname.startsWith('/img/')) {
      const _gp = pathname.split('/').map(decodeURIComponent);
      const source = _gp[2], key = _gp.slice(3).join('/');   // key may contain '/'
      // t89: GRABBER CASE ART — grabbed videos have no art upstream; the
      // first browser to visit grabs a frame and POSTs it (below). Cached
      // on disk, then served like any other poster.
      if (source === 'local') {
        const thumb = localThumbPath(key);
        if (thumb && fs.existsSync(thumb)) {
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
          fs.createReadStream(thumb).pipe(res);
          return true;
        }
      }
      const url = await posterUrlFor(source, key, userView(getConfig(), readPrefs(profileKeyFor(req, res))?.sources));
      if (!url) { res.writeHead(404); res.end('no poster'); return true; }
      await proxyImage(req, res, url);
      return true;
    }

    // t89: upload a generated case image for a grabbed video (any signed-in
    // session — guests browse grabber files too; validated JPEG/PNG only,
    // path-safe by content hash, size-capped)
    if (method === 'POST' && pathname.startsWith('/api/thumb/local/')) {
      const key = decodeURIComponent(pathname.slice('/api/thumb/local/'.length));
      const who = profileKeyFor(req, res);
      if (!who) return fail(res, 401, 'No profile');
      const view = userView(getConfig(), readPrefs(who)?.sources);
      const item = await findItem('local', key, view).catch(() => null);
      if (!item || item.type !== 'movie') return fail(res, 404, 'Not a grabbed video');
      const body = await readBody(req, 600 * 1024).catch(() => null);
      const m = /^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/.exec(String(body?.dataUrl || ''));
      const buf = m ? Buffer.from(m[2], 'base64') : null;
      const jpeg = buf && buf.length > 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
      const png = buf && buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
      if (!buf || !buf.length || buf.length > 500000 || !(jpeg || png)) return fail(res, 400, 'Not a valid image');
      const p = localThumbPath(key);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const tmp = p + '.tmp' + Date.now();
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, p);
      return ok(res, { ok: true });
    }

    // ── TV ──
    if (method === 'GET' && pathname === '/api/tv') {
      const cfg = getConfig();
      const title = await resolveTvTitle(cfg).catch(() => null);
      return ok(res, { enabled: cfg.tv.enabled, idleMode: cfg.tv.mode, title });
    }

    // ▶ PLAY a shelf item on the in-store TV: /api/play/<source>/<key>
    //    (video for movies/shows/music videos; ?audio=1 for music albums)
    //    Streamed through this server so media-server tokens stay secret.
    if (method === 'GET' && pathname.startsWith('/api/play/')) {
      const _p = pathname.split('/').map(decodeURIComponent);
      const source = _p[3], key = _p.slice(4).join('/');   // t51: local keys contain '/'
      const isAudio = new URL(req.url, 'http://x').searchParams.get('audio') === '1';
      const sc = sourceConfig(source);                 // t87: built-in or instance
      if (!sc) { res.writeHead(404); res.end('unknown source'); return true; }
      const adapter = sc.adapter;
      let upstream = null;
      try {
        if (isAudio && adapter.audioUrl) upstream = await adapter.audioUrl(sc.cfg || {}, key);
      } catch { upstream = null; }
      // FALL BACK to the regular stream when no audio-specific URL exists
      // (e.g. the free archive's mp4s) — the player uses its audio track.
      if (!upstream) upstream = await streamUrlFor(source, key).catch(() => null);
      if (String(upstream).startsWith('local-file:')) {          // t61: grabber file → disk stream
        const abs = String(upstream).slice('local-file:'.length);
        streamLocalFile(req, res, abs, localAdapter.mimeFor(abs));
        return true;
      }
      if (!upstream) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no stream for this item'); return true; }
      await proxyVideo(req, res, upstream);   // works for audio too (Range proxy)
      return true;
    }

    if (method === 'GET' && pathname === '/api/tv/stream') {
      const cfg = getConfig();
      if (!cfg.tv.enabled) { res.writeHead(404); res.end('TV disabled'); return true; }
      let upstream = null;
      if (cfg.tv.mode === 'url' && /^https?:\/\//.test(cfg.tv.url || '')) {
        upstream = cfg.tv.url;
      } else if (cfg.tv.mode === 'item' && cfg.tv.itemId) {
        const [source, key] = splitItemId(cfg.tv.itemId);
        upstream = await streamUrlFor(source, key);
      }
      if (!upstream) { res.writeHead(404); res.end('no TV source'); return true; }
      await proxyVideo(req, res, upstream);
      return true;
    }

    // ── ADMIN ────────────────────────────────────────────────────────────────
    // t97: the host's shareable shelves for the per-friend share lists —
    // OWN shelves only: shelves a friend shared INTO this store are excluded
    // (the no-transitive-sharing rule, enforced at the list source).
    if (method === 'GET' && pathname === '/api/admin/friend-sections') {
      if (!requireAdmin(req, res)) return true;
      const cfg = getConfig();
      const fIds = friendSourceIds(cfg);
      const sections = (await librarySections({ ...defaultView(cfg), stores: [] })).filter(s => !fIds.has(s.source));   // t99: own shelves only, no circular fetches
      return ok(res, { sections });
    }

    if (method === 'GET' && pathname === '/api/admin/config') {
      if (!requireAdmin(req, res)) return true;
      const cfg = getConfig();
      let libraryCount = null;
      try { libraryCount = (await getLibrary()).length; } catch { libraryCount = null; }
      return ok(res, { config: maskConfig(cfg), libraryCount });
    }

    if (method === 'PUT' && pathname === '/api/admin/config') {
      if (!requireAdmin(req, res)) return true;
      const cfg = getConfig();
      const body = await readBody(req, 512 * 1024);
      const incoming = body.config || body;

      // Whitelist-merge each section; masked secrets mean "keep current".
      const next = deepMerge(defaultConfig(), cfg);
      // t96: version-notice controls (check kill-switch + feed URL override)
      if (incoming.version && typeof incoming.version === 'object') {
        next.version = {
          check: incoming.version.check === false ? false : true,
          url: (typeof incoming.version.url === 'string' && /^https?:\/\//.test(incoming.version.url)) ? incoming.version.url.trim() : ''
        };
      }
      // per-source toggles — every source independent, nothing mandatory
      if (incoming.sources && typeof incoming.sources === 'object') {
        next.sources = {
          plex: !!incoming.sources.plex,
          jellyfin: !!incoming.sources.jellyfin
        };
      }
      if (incoming.plex) {
        next.plex.url = String(incoming.plex.url ?? cfg.plex.url).trim();
        // three-state secret: MASK = keep current · '' = CLEAR it · absent = keep.
        // (the old truthiness test made a cleared box silently keep the old
        // token — the "why won't this box go empty" bug)
        if (incoming.plex.token !== undefined && incoming.plex.token !== null && incoming.plex.token !== MASK)
          next.plex.token = String(incoming.plex.token).trim();
        if (Array.isArray(incoming.plex.sections)) next.plex.sections = incoming.plex.sections.map(String);
      }
      if (incoming.jellyfin) {
        next.jellyfin.url = String(incoming.jellyfin.url ?? cfg.jellyfin.url).trim();
        if (incoming.jellyfin.apiKey !== undefined && incoming.jellyfin.apiKey !== null && incoming.jellyfin.apiKey !== MASK)
          next.jellyfin.apiKey = String(incoming.jellyfin.apiKey).trim();
        if (Array.isArray(incoming.jellyfin.sections)) next.jellyfin.sections = incoming.jellyfin.sections.map(String);
      }
      // free add-on sources — sections/feeds are opt-in ([] = off)
      if (incoming.archive) {
        if (Array.isArray(incoming.archive.sections))
          next.archive.sections = incoming.archive.sections.map(String).slice(0, 20);
        if (typeof incoming.archive.url === 'string')
          next.archive.url = /^https?:\/\//.test(incoming.archive.url) ? incoming.archive.url.trim() : '';   // '' = real archive.org
      }
      if (incoming.podcasts) {
        // t93: feeds are {url, name?, on?} (legacy plain strings still accepted)
        if (Array.isArray(incoming.podcasts.feeds)) {
          const seen = new Set(), outF = [];
          for (const f of incoming.podcasts.feeds.slice(0, 50)) {
            const o = typeof f === 'string' ? { url: f } : (f && typeof f === 'object' && !Array.isArray(f) ? f : null);
            if (!o) continue;
            const url = String(o.url || '').trim();
            if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
            seen.add(url);
            outF.push({ url, name: o.name ? String(o.name).slice(0, 64) : null, on: o.on !== false });
          }
          next.podcasts.feeds = outF;
        }
      }
      if (incoming.radio) {
        if (Array.isArray(incoming.radio.sections))
          next.radio.sections = incoming.radio.sections.map(String).slice(0, 12);
        if (typeof incoming.radio.url === 'string')
          next.radio.url = /^https?:\/\//.test(incoming.radio.url) ? incoming.radio.url.trim() : '';         // '' = radio-browser
      }
      // t61/t62: the file grabber — MULTIPLE spots on this machine, recursive
      if (incoming.local) {
        next.local.on = !!incoming.local.on;
        if (Array.isArray(incoming.local.spots)) {
          next.local.spots = incoming.local.spots.map(s => String(s ?? '').trim().replace(/^["']|["']$/g, '').slice(0, 1024)).filter(Boolean).slice(0, 16);
        } else if (typeof incoming.local.path === 'string' && incoming.local.path.trim()) {
          next.local.spots = [incoming.local.path.trim().slice(0, 1024)];   // legacy single-path UI
        }
        // t66: a typo'd folder must NOT fail silently — report it in plain words
        localNotes = next.local.on ? next.local.spots.filter(p2 => { try { return !fs.statSync(p2).isDirectory(); } catch { return true; } }) : [];
      }
      // t87: EXTRA INSTANCES — as many Plex/Jellyfin connections as the owner
      // wants. Sanitized hard: kind must be real, id is a slug (auto-assigned
      // when missing/colliding), secrets are MASK-aware, counts bounded.
      if (Array.isArray(incoming.instances)) {
        const taken = new Set(['plex', 'jellyfin', 'archive', 'podcasts', 'radio', 'local']);
        for (const i of cfg.instances || []) taken.add(i.id);
        const nextInst = [];
        for (const raw of incoming.instances.slice(0, 12)) {
          if (!raw || typeof raw !== 'object' || !['plex', 'jellyfin'].includes(raw.kind)) continue;
          let id = String(raw.id || '').trim();
          if (!id || taken.has(id) || !/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
            let n = 2; while (taken.has(`${raw.kind}-${n}`)) n++;
            id = `${raw.kind}-${n}`;
          }
          taken.add(id);
          const prev = (cfg.instances || []).find(i => i.id === id);   // masked secret = keep current
          nextInst.push({
            id, kind: raw.kind,
            name: String(raw.name || '').trim().slice(0, 40) || (prev?.name) || (raw.kind === 'plex' ? 'Second Plex' : 'Second Jellyfin'),
            url: String(raw.url ?? '').trim().slice(0, 300),
            token: (raw.token !== undefined && raw.token !== null && raw.token !== MASK)
              ? String(raw.token).trim().slice(0, 300) : (prev?.token || ''),
            apiKey: (raw.apiKey !== undefined && raw.apiKey !== null && raw.apiKey !== MASK)
              ? String(raw.apiKey).trim().slice(0, 300) : (prev?.apiKey || ''),
            sections: Array.isArray(raw.sections) ? raw.sections.map(String).slice(0, 40) : (prev?.sections || []),
            on: raw.on !== false
          });
        }
        next.instances = nextInst;
        invalidateCache();
      }
      // t97: FRIEND SHARING (host) — invite friends by name; the app mints
      // each code. Per-friend share lists (empty list = all of MY OWN shelves).
      if (incoming.friendShare && typeof incoming.friendShare === 'object') {
        const prevE = new Map((cfg.friendShare?.entries || []).map(e => [e.id, e]));
        const entries = [];
        for (const raw of (Array.isArray(incoming.friendShare.entries) ? incoming.friendShare.entries : []).slice(0, 50)) {
          if (!raw || typeof raw !== 'object') continue;
          const prev = prevE.get(String(raw.id || ''));
          const id = prev?.id || ('fr-' + (entries.length + 1) + '-' + crypto.randomBytes(2).toString('hex'));
          let token = (typeof raw.token === 'string' && /^[a-z0-9]{8,64}$/i.test(raw.token)) ? raw.token : '';
          if (!token) token = prev?.token || newCode();
          entries.push({
            id, token,
            name: String(raw.name || '').trim().slice(0, 40) || prev?.name || 'Friend',
            sections: Array.isArray(raw.sections) ? raw.sections.map(String).slice(0, 80) : (prev?.sections || []),
            on: raw.on !== false, createdAt: prev?.createdAt || Date.now()
          });
        }
        next.friendShare = { on: incoming.friendShare.on !== false, entries };
        invalidateCache();
      }
      // t97: FRIEND STORES (follower) — friends' shared shelves as sources
      if (Array.isArray(incoming.friendStores)) {
        const taken = new Set(['plex', 'jellyfin', 'archive', 'podcasts', 'radio', 'local', 'tv']);
        for (const s of cfg.friendStores || []) taken.add(s.id);
        const stores = [];
        for (const raw of incoming.friendStores.slice(0, 24)) {
          if (!raw || typeof raw !== 'object') continue;
          let id = String(raw.id || '').trim();
          if (!id || taken.has(id) || !/^[a-z][a-z0-9-]{0,31}$/.test(id)) { let n = 1; while (taken.has(`fs-${n}`)) n++; id = `fs-${n}`; }
          taken.add(id);
          const prev = (cfg.friendStores || []).find(s => s.id === id);
          stores.push({
            id,
            name: String(raw.name || '').trim().slice(0, 40) || prev?.name || 'Friend',
            url: String(raw.url ?? prev?.url ?? '').trim().slice(0, 300),
            token: String(raw.token ?? prev?.token ?? '').trim().slice(0, 100),
            on: raw.on !== false
          });
        }
        next.friendStores = stores;
        invalidateCache();
      }
      // Shelf Map — unitId → sectionKey ('' = automatic). Unit ids are slugs.
      if (incoming.shelves && typeof incoming.shelves === 'object' && !Array.isArray(incoming.shelves)) {
        const map = {};
        for (const [unit, sec] of Object.entries(incoming.shelves)) {
          if (!/^[\w-]{1,32}$/.test(unit)) continue;
          if (String(sec) === '') { map[unit] = ''; continue; }
          if (/^[\w:-]{1,100}$/.test(String(sec))) map[unit] = String(sec);   // t87: instance-namespaced keys
        }
        next.shelves = map;
      }
      if (incoming.tv) {
        next.tv = {
          enabled: !!incoming.tv.enabled,
          mode: ['standby', 'loop', 'url', 'item'].includes(incoming.tv.mode) ? incoming.tv.mode : 'standby',
          url: String(incoming.tv.url || ''),
          itemId: String(incoming.tv.itemId || '')
        };
      }
      if (incoming.locks) next.locks = {
        theme: !!incoming.locks.theme, sorting: !!incoming.locks.sorting,
        shelves: !!incoming.locks.shelves, sources: !!incoming.locks.sources
      };
      if (typeof incoming.registration === 'boolean') next.registration = incoming.registration;
      if (incoming.defaults) {
        next.defaults = {
          theme: sanitizeTheme({ ...next.defaults.theme, ...incoming.defaults.theme }),
          sorting: sanitizeSorting({ ...next.defaults.sorting, ...incoming.defaults.sorting })
        };
      }
      Object.assign(configRef(), next); // replace in place
      saveConfig();
      invalidateCache();
      return ok(res, { config: maskConfig(getConfig()),
        localNotes: localNotes.length ? `Folder not found (check the spelling): ${localNotes.join(' · ')}` : '' });   // t66: no silent grabber failures
    }

    if (method === 'POST' && pathname === '/api/admin/test') {
      if (!requireAdmin(req, res)) return true;
      const cfg = getConfig();
      const body = await readBody(req);
      // Test either the provided draft creds or the saved ones.
      // t87: tests a built-in slot OR any saved extra instance ('plex-2'…)
      if (String(body.source || '') === 'friend') {     // t97: test a friend's store before saving
        const url = String(body.url || '').trim(), token = String(body.token || '').trim();
        if (!/^https?:\/\//.test(url)) return fail(res, 400, 'Enter the friend store address first');
        try { return ok(res, await friendAdapter.test({ url, token })); }
        catch (e) { return fail(res, 400, e.message); }
      }
      const sc = sourceConfig(String(body.source || ''));
      if (!sc?.adapter?.test) return fail(res, 400, 'Unknown source');
      const saved = sc.cfg || {};
      const draft = {
        url: body.url ?? saved.url,
        token: (body.token && body.token !== MASK) ? body.token : saved.token,
        apiKey: (body.apiKey && body.apiKey !== MASK) ? body.apiKey : saved.apiKey
      };
      const result = await sc.adapter.test(draft);
      return ok(res, result);
    }

    // List a server's libraries for the Admin → Server checkbox picker
    if (method === 'POST' && pathname === '/api/admin/libraries') {
      if (!requireAdmin(req, res)) return true;
      const cfg = getConfig();
      const body = await readBody(req);
      const source = String(body.source || '');
      if (source === 'archive' || source === 'radio') {
        const a = ADAPTERS[source];
        return ok(res, a.libraries ? a.libraries() : { libraries: [] });
      }
      // t87: built-in slots AND saved extra instances resolve the same way
      const sc = sourceConfig(source);
      if (!sc?.adapter?.libraries) return fail(res, 400, 'Unknown source');
      const draft = {
        url: body.url ?? sc.cfg.url,
        token: (body.token && body.token !== MASK) ? body.token : sc.cfg.token,
        apiKey: (body.apiKey && body.apiKey !== MASK) ? body.apiKey : sc.cfg.apiKey
      };
      if (!draft.url) return fail(res, 400, 'Enter the server URL first');
      try {
        const libraries = await sc.adapter.libraries(draft);
        return ok(res, { libraries });
      } catch (e) {
        return fail(res, 502, e?.message || 'Could not list libraries');
      }
    }

    if (method === 'GET' && pathname === '/api/admin/users') {
      if (!requireAdmin(req, res)) return true;
      const store = await import('../lib/store.js');
      const db = store.getDb();
      return ok(res, { users: db.users.map(publicUser) });
    }

    // (admin user CREATION removed — accounts are created by their owners at
    //  the front entrance; admins can still reset passwords and delete users)


    if (method === 'POST' && pathname === '/api/admin/users/password') {
      if (!requireAdmin(req, res)) return true;
      const body = await readBody(req);
      if (String(body.password || '').length < 4) return fail(res, 400, 'Password must be 4+ characters');
      const store = await import('../lib/store.js');
      const db = store.getDb();
      const target = db.users.find(u => u.id === body.id);
      if (!target) return fail(res, 404, 'User not found');
      target.pass = hashPassword(body.password);
      store.saveDb();
      return ok(res, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/admin/users/rename') {   // t81: rename — profiles key by user id, so the name is safely cosmetic
      if (!requireAdmin(req, res)) return true;
      const body = await readBody(req);
      const name = String(body.username || '').trim();
      if (!/^[\w .-]{2,32}$/.test(name)) return fail(res, 400, 'Name must be 2-32 letters, numbers, spaces, . - _');
      const store = await import('../lib/store.js');
      const db = store.getDb();
      const target = db.users.find(u => u.id === body.id);
      if (!target) return fail(res, 404, 'User not found');
      if (db.users.some(u => u.id !== target.id && u.username.toLowerCase() === name.toLowerCase())) {
        return fail(res, 409, 'That name is already taken');
      }
      target.username = name;          // sessions store userId → logins survive; personal shelves/prefs are keyed user:<id> → untouched
      store.saveDb();
      return ok(res, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/admin/users/promote') {   // t82: admins make admins — add a partner, demote safely
      if (!requireAdmin(req, res)) return true;
      const body = await readBody(req);
      const store = await import('../lib/store.js');
      const db = store.getDb();
      const target = db.users.find(u => u.id === body.id);
      if (!target) return fail(res, 404, 'User not found');
      const want = !!body.admin;
      if (!want && target.isAdmin && db.users.filter(u => u.isAdmin).length === 1) {
        return fail(res, 400, 'Cannot remove the last admin');
      }
      target.isAdmin = want;
      store.saveDb();
      return ok(res, { user: { id: target.id, username: target.username, isAdmin: target.isAdmin } });
    }

    if (method === 'GET' && pathname === '/api/lan') {   // t84: best LAN addresses for the Invite button — private ranges only, never a public IP
      const os = await import('node:os');
      const port = req.socket?.localPort || process.env.PORT || 8181;
      const urls = [];
      for (const list of Object.values(os.networkInterfaces())) {
        for (const ni of list || []) {
          if (ni.family !== 'IPv4' || ni.internal) continue;
          if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ni.address)) continue;
          urls.push(`http://${ni.address}:${port}`);
        }
      }
      return ok(res, { urls: [...new Set(urls)] });
    }

    if (method === 'DELETE' && pathname.startsWith('/api/admin/users/')) {
      const admin = requireAdmin(req, res);
      if (!admin) return true;
      const id = decodeURIComponent(pathname.split('/').pop());
      const store = await import('../lib/store.js');
      const db = store.getDb();
      const target = db.users.find(u => u.id === id);
      if (!target) return fail(res, 404, 'User not found');
      if (target.id === admin.id) return fail(res, 400, 'You cannot delete yourself');
      if (target.isAdmin && db.users.filter(u => u.isAdmin).length === 1) {
        return fail(res, 400, 'Cannot delete the last admin');
      }
      db.users = db.users.filter(u => u.id !== id);
      for (const [k, s] of Object.entries(db.sessions)) if (s.userId === id) delete db.sessions[k];
      store.saveDb();
      return ok(res, { ok: true });
    }

    return fail(res, 404, `No such API route: ${method} ${pathname}`);

  } catch (err) {
    console.error(`[api] ${req.method} ${pathname} →`, err.message);
    return fail(res, err.message?.includes('configured') || err.message?.includes('rejected') ? 400 : 500, err.message || 'Server error');
  }
}

// ── misc helpers ─────────────────────────────────────────────────────────────
function configRef() { return getConfig(); } // deepMerge produces a new object; assign over the live ref

function splitItemId(itemId) {
  // itemId looks like "plex:12345" or "jf:abc-def"
  const i = String(itemId || '').indexOf(':');
  if (i < 0) return [null, null];
  const src = itemId.slice(0, i);
  const source = src === 'plex' ? 'plex' : src === 'jf' ? 'jellyfin' : null;
  return [source, itemId.slice(i + 1)];
}

async function resolveTvTitle(cfg) {
  if (!cfg.tv.enabled) return null;
  if (cfg.tv.mode === 'url') return cfg.tv.url || null;
  if (cfg.tv.mode === 'item' && cfg.tv.itemId) {
    const [source, key] = splitItemId(cfg.tv.itemId);
    if (source) {
      const item = await findItem(source, key).catch(() => null);
      if (item) return item.title;
    }
  }
  return null;
}

// Clamp/whitelist a theme object so the store can't be fed garbage.
// Invalid values fall back to the store default rather than dropping keys.
function sanitizeTheme(t) {
  const d = defaultConfig().defaults.theme;
  const hex = (v, fb) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : fb);
  return {
    wall: hex(t.wall, d.wall), floor: hex(t.floor, d.floor),
    shelf: hex(t.shelf, d.shelf), accent: hex(t.accent, d.accent),
    style: ['wood', 'metal', 'midnight'].includes(t.style) ? t.style : 'wood'
  };
}
function sanitizeSorting(s) {
  return {
    mode: ['genre', 'recent', 'alpha', 'rating', 'year', 'type'].includes(s.mode) ? s.mode : 'recent',
    dir: ['asc', 'desc'].includes(s.dir) ? s.dir : 'desc'
  };
}
export { sanitizeTheme, sanitizeSorting, defaultPrefs };
