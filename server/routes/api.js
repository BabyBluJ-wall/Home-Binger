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
  getLibrary, findItem, posterUrlFor, streamUrlFor, libraryStatus, invalidateCache, librarySections, userView, ADAPTERS
} from '../lib/library.js';
import { proxyImage, proxyVideo, streamLocalFile } from '../lib/proxy.js';
import { localAdapter } from '../lib/adapters/local.js';   // t61: mime lookup for disk streams
import fs from 'node:fs';                                 // t66: grabber spot validation
import { CATALOG_SECTIONS } from '../lib/adapters/archive.js';
import { GENRES as RADIO_GENRES } from '../lib/adapters/radio.js';

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
        sources: locks.sources ? null : (prefs.sources ?? null)
      };
      const status = await libraryStatus();
      const tvTitle = await resolveTvTitle(cfg).catch(() => null);
      return ok(res, {
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

    // ── public source catalogue: what a visitor can put on THEIR shelves ──
    if (method === 'GET' && pathname === '/api/sources') {
      const cfg = getConfig();
      return ok(res, {
        available: {
          plex: !!(cfg.plex?.url && cfg.plex?.token),
          jellyfin: !!(cfg.jellyfin?.url && cfg.jellyfin?.apiKey)
        },
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
      const cfg = getConfig();
      const adapter = ADAPTERS[source];
      if (!adapter) return fail(res, 404, 'Unknown source');
      const detail = await adapter.detail(cfg[source] || {}, key);
      if (!detail) return fail(res, 404, 'Not found');
      return ok(res, detail);
    }

    // ── posters: /img/<source>/<key> ──
    if (method === 'GET' && pathname.startsWith('/img/')) {
      const _gp = pathname.split('/').map(decodeURIComponent);
      const source = _gp[2], key = _gp.slice(3).join('/');   // key may contain '/'
      const url = await posterUrlFor(source, key, userView(getConfig(), readPrefs(profileKeyFor(req, res))?.sources));
      if (!url) { res.writeHead(404); res.end('no poster'); return true; }
      await proxyImage(req, res, url);
      return true;
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
      if (!ADAPTERS[source]) { res.writeHead(404); res.end('unknown source'); return true; }
      const cfg = getConfig();
      const adapter = ADAPTERS[source];
      let upstream = null;
      try {
        if (isAudio && adapter.audioUrl) upstream = await adapter.audioUrl(cfg[source] || {}, key);
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
        if (Array.isArray(incoming.podcasts.feeds))
          next.podcasts.feeds = [...new Set(incoming.podcasts.feeds
            .map(u => String(u).trim()).filter(u => /^https?:\/\//i.test(u)))].slice(0, 50);
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
      // Shelf Map — unitId → sectionKey ('' = automatic). Unit ids are slugs.
      if (incoming.shelves && typeof incoming.shelves === 'object' && !Array.isArray(incoming.shelves)) {
        const map = {};
        for (const [unit, sec] of Object.entries(incoming.shelves)) {
          if (!/^[\w-]{1,32}$/.test(unit)) continue;
          if (String(sec) === '') { map[unit] = ''; continue; }
          if (/^[\w:-]{1,64}$/.test(String(sec))) map[unit] = String(sec);
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
      const source = ['plex', 'jellyfin'].includes(body.source) ? body.source : cfg.source;
      const draft = {
        url: body.url ?? cfg[source].url,
        token: (body.token && body.token !== MASK) ? body.token : cfg[source].token,
        apiKey: (body.apiKey && body.apiKey !== MASK) ? body.apiKey : cfg[source].apiKey
      };
      const result = await ADAPTERS[source].test(draft);
      return ok(res, result);
    }

    // List a server's libraries for the Admin → Server checkbox picker
    if (method === 'POST' && pathname === '/api/admin/libraries') {
      if (!requireAdmin(req, res)) return true;
      const cfg = getConfig();
      const body = await readBody(req);
      const source = ['plex', 'jellyfin'].includes(body.source) ? body.source : cfg.source;
      if (source === 'archive' || source === 'radio') {
        const a = ADAPTERS[source];
        return ok(res, a.libraries ? a.libraries() : { libraries: [] });
      }
      if (!['plex', 'jellyfin'].includes(source)) return fail(res, 400, 'Unknown source');
      const draft = {
        url: body.url ?? cfg[source].url,
        token: (body.token && body.token !== MASK) ? body.token : cfg[source].token,
        apiKey: (body.apiKey && body.apiKey !== MASK) ? body.apiKey : cfg[source].apiKey
      };
      if (!draft.url) return fail(res, 400, 'Enter the server URL first');
      try {
        const libraries = await ADAPTERS[source].libraries(draft);
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
