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
import os from 'node:os';
import {
  getConfig, saveConfig, deepMerge, defaultConfig, defaultPrefs, normalizeChannelId, RETIRED_CHANNEL_IDS
} from '../lib/store.js';
import {
  hashPassword, verifyPassword, findUser, publicUser, createSession, destroySession,
  getSessionUser, profileKeyFor, readPrefs, writePrefs, migrateDevicePrefs, sanitizeShelfMap, sanitizeSourcesPref } from '../lib/auth.js';
import {
  getLibrary, findItem, posterUrlFor, streamUrlFor, libraryStatus, invalidateCache, librarySections, userView, defaultView, ADAPTERS, sourceConfig
} from '../lib/library.js';
import { proxyImage, proxyVideo, streamLocalFile } from '../lib/proxy.js';
import {
  createParty, endParty, partyState, hostUpdate, joinParty, leaveParty,
  reportStall, subscribeParty, partyTime
} from '../lib/party.js';   // t186: watch party (the theater's "watch with me")
import { localAdapter } from '../lib/adapters/local.js';   // t61: mime lookup for disk streams

// t201: is the public guest page actually published? (Keep in sync with
// WATCH_WEB_BASE in public/js/ui.js.) A dead everyone-link is how "share
// with anyone" quietly became "Tailscale only" — the panel warns until the
// owner flips GitHub Pages on. Probed once, cached 15 min; null = unknown
// (offline server) — never guess.
const WATCH_PAGES_URL = 'https://babybluj-wall.github.io/Home-Binger/';
let pagesProbe = { at: 0, ok: null };
async function pagesOkCached() {
  if (Date.now() - pagesProbe.at < 15 * 60 * 1000) return pagesProbe.ok;
  pagesProbe.at = Date.now();                     // marks in-flight as fresh too
  try {
    const r = await fetch(WATCH_PAGES_URL, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    pagesProbe.ok = r.ok;
  } catch { pagesProbe.ok = null; }               // no internet / blocked — say nothing
  return pagesProbe.ok;
}
import { friendAdapter, findShareEntry, friendSourceIds, shareableWith, sectionKeyOf, newCode } from '../lib/friends.js';   // t97: HB↔HB
import fs from 'node:fs';                                 // t66: grabber spot validation
import path from 'node:path';                             // t89: thumb cache dir
import { DATA_DIR } from '../lib/store.js';                // t89: grabbed-file case art
import {
  sanitizeConnections,
  publicConnections,
  fetchSteamLibrary,
  steamKeyCheck
} from '../lib/connections.js';   // t171: per-user keys · t177: key checks · t186: YouTube keys are GONE (the panel browses the real site)
import { readCoverArt } from '../lib/tagmeta.js';         // t151: album covers embedded in the file tags
import { CATALOG_SECTIONS } from '../lib/adapters/archive.js';
import { GENRES as RADIO_GENRES } from '../lib/adapters/radio.js';
import { proxyIptv, epgSnapshot, iptvStats } from '../lib/adapters/iptv.js';      // t123: the live TV proxy · t139: program data · t144: dedupe count

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

// t151: a local album's cover — the folder's own cover art file first (the
// convention everyone's music library already uses), then the picture
// embedded in the track's tags. Returns a Buffer or null.
async function localAlbumArt(key) {
  const upstream = await streamUrlFor('local', key).catch(() => null);
  const abs = String(upstream || '').startsWith('local-file:') ? String(upstream).slice('local-file:'.length) : '';
  if (!abs) return null;
  const dir = path.dirname(abs);
  const names = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'front.jpg', 'front.png', 'albumart.jpg', 'albumart.png'];
  for (const n of names) {
    try {
      const c = path.join(dir, n);
      const st = fs.statSync(c);
      if (st.isFile() && st.size > 64 && st.size < 4 * 1024 * 1024) return fs.readFileSync(c);
    } catch {}
  }
  try { return readCoverArt(abs); } catch { return null; }
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
  if (safe.steam?.key) safe.steam.key = MASK;                         // t175
  if (Array.isArray(safe.instances)) {                     // t87: extra connections mask too
    for (const i of safe.instances) {
      if (i?.token) i.token = MASK;
      if (i?.apiKey) i.apiKey = MASK;
    }
  }
  return safe;
}

// ── a tiny public-info cache ─────────────────────────────────────────────────
const pubCache = new Map();             // 60s — Discord portal counts etc.
function cacheGetPub(k) { const e = pubCache.get(k); return e && Date.now() - e.at < 60 * 1000 ? e.value : undefined; }
function cacheSetPub(k, v) { pubCache.set(k, { at: Date.now(), value: v }); }

// ── t123: PER-USER LIBRARY ACCESS — derivation + guards ──────────────────────
// The libraryAccess map (config) is the single source of truth:
//   absent | 'all'            → everyone (today's behavior; upgrades unchanged)
//   { users: [name, …] }      → only those accounts (denied for everyone else)
// Admins and anonymous visitors are never restricted (v1 doctrine).
function sectionKeyOfItem(i) { return i.sectionId || 'auto:' + (i.sectionTitle || i.type); }
function deniedSectionsFor(req) {
  const user = getSessionUser(req);
  if (!user || user.isAdmin) return null;
  const la = getConfig().libraryAccess || {};
  const denied = new Set();
  for (const [k, v] of Object.entries(la)) {
    if (v && typeof v === 'object' && Array.isArray(v.users) && !v.users.includes(user.username)) denied.add(k);
  }
  return denied.size ? denied : null;
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
        // t132: personal theme/sorting wins; NULL (never personalized, or a
        // fresh profile) falls back to the store's CONFIGURED default —
        // previously this handed every new visitor the built-in snapshot,
        // so the Policies default reached nobody without the lock.
        theme: locks.theme ? { ...cfg.defaults.theme } : (prefs.theme ?? cfg.defaults.theme),
        sorting: locks.sorting ? { ...cfg.defaults.sorting } : (prefs.sorting ?? cfg.defaults.sorting),
        visualizer: prefs.visualizer || { style: 'bars' },
        // personal shelf map; falls back to the store-wide map (admin's baseline);
        // a lock forces the store's map on everyone
        shelves: locks.shelves ? (cfg.shelves || {}) : (prefs.shelves && Object.keys(prefs.shelves).length ? prefs.shelves : (cfg.shelves || {})),
        tv: prefs.tv || { idleMode: '', itemId: '' },
        dance: prefs.dance || { movement: 1, speed: 1, ballSpin: 1, pattern: 'auto' },   // t86 · t93: movement, not brightness
        sources: locks.sources ? null : (prefs.sources ?? null),
        guideFavs: Array.isArray(prefs.guideFavs) ? prefs.guideFavs : [],  // t128: favorite channels
        // t161: personal movement — look sensitivity + default speed tier
        controls: {
          look: Number.isFinite(+prefs.controls?.look) ? Math.min(3, Math.max(0.25, +prefs.controls.look)) : 0.55,   // t165: default 0.55×
          base: ['walk', 'jog', 'run'].includes(prefs.controls?.base) ? prefs.controls.base : 'walk'
        },
        a11y: { steady: prefs.a11y?.steady === true }   // t186: photosensitive comfort — steady lights, per profile
      };
      const status = await libraryStatus();
      const tvTitle = await resolveTvTitle(cfg).catch(() => null);
      return ok(res, {
        version: PKG.version,          // t96: the app's own version (notice compares against it)
        community: {
          discord: (typeof cfg.community?.discord === 'string' && /^https?:\/\//i.test(cfg.community.discord)) ? cfg.community.discord : '',        // t155: the help-desk PC
          channelId: normalizeChannelId(cfg.community?.channelId)     // t159: the chat embed · t159b: pasted links normalize here too
        },
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
      // t154: a friend may SAVE a shared item (?dl=1) — same share check as
      // streaming (already passed above), just with a save-this-file header
      const isFDl = new URL(req.url, 'http://x').searchParams.get('dl') === '1';
      const fExt = (/\.[a-z0-9]{1,5}$/i.exec(String(fKey || '')) || [''])[0];
      const fDl = isFDl ? (String(item.title || 'media').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 120) || 'media') + fExt : '';
      if (String(upstream).startsWith('local-file:')) {
        const abs = String(upstream).slice('local-file:'.length);
        streamLocalFile(req, res, abs, localAdapter.mimeFor(abs), fDl);
        return true;
      }
      if (!upstream) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no stream for this item'); return true; }
      await proxyVideo(req, res, upstream, fDl ? { dlName: fDl } : {});
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
    // t139: the Guide's program data — now/next per channel (public: titles only)
    // t140: ?at=<epoch ms> returns the slice AT that time (the Guide's time travel)
    if (method === 'GET' && pathname === '/api/iptv/epg') {
      const at = Number(new URL(req.url, 'http://x').searchParams.get('at')) || 0;
      try { return ok(res, await epgSnapshot(at)); }
      catch (e) { return fail(res, 503, 'EPG unavailable'); }
    }

    if (method === 'GET' && pathname === '/api/library') {
      const cfg = getConfig();
      // per-visitor view: the store's setup overlaid with their media mix
      const view = userView(cfg, readPrefs(profileKeyFor(req, res))?.sources);
      let items = await getLibrary(req.url.includes('refresh=1'), view);
      // t123: per-user library access — hidden libraries leave the catalogue
      // entirely (shelves, search, jukebox, Guide — every surface follows)
      const denied = deniedSectionsFor(req);
      let sections = await librarySections(view);
      if (denied) {
        items = items.filter(i => !denied.has(sectionKeyOfItem(i)));
        sections = sections.filter(s => !denied.has(s.key));
      }
      return ok(res, {
        items: items.map(i => ({
          id: i.id, source: i.source, key: i.key, type: i.type, title: i.title,
          year: i.year, rating: i.rating, addedAt: i.addedAt, genres: i.genres,
          bpm: i.bpm || null, keyTag: i.keyTag || null,            // t114: the file's own tags — instant tempo/key for the booth
          sectionId: i.sectionId || null,          // Shelf Map key (e.g. 'archive:staff-picks')
          sectionTitle: i.sectionTitle || null,    // real library name (By Library sort)
          guideOnly: i.guideOnly === true,         // t123: live TV lives in the Guide, never on shelves
          langs: Array.isArray(i.langs) ? i.langs.slice(0, 4) : [],  // t127: the Guide's language pages
          provider: i.provider || null,             // t138: the Guide's provider axis (Pluto TV, Plex Free…)
          genre: i.genre || null,                   // t138: the Guide's genre axis (the clean canonical set)
          chno: i.chno || null,                     // t139: the provider's own channel number (e.g. 104)
          logo: i.logo || null                      // t139: the provider's channel logo (loaded direct, cached)
          // NOTE: no 'thumb' — posters are fetched via /img/<source>/<key>
        })),
        sections,
        shelves: cfg.shelves || {},
        count: items.length,
        liveDedupe: iptvStats().removed    // t144: "N duplicate channels hidden automatically" (admin panel shows it)
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
        // t132: a personal patch rides on the STORE'S configured default (not
        // the built-in one) — recoloring one wall keeps the rest of the look
        const base = prefs.theme ?? cfg.defaults.theme;
        prefs.theme = sanitizeTheme({ ...base, ...body.theme });
      }
      if (!cfg.locks.sorting && body.sorting) {
        const baseS = prefs.sorting ?? cfg.defaults.sorting;   // t132
        prefs.sorting = sanitizeSorting({ ...baseS, ...body.sorting });
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
      if (body.controls) {   // t161: personal movement — look sensitivity + speed tier
        const c = body.controls, prev = prefs.controls || {};
        prefs.controls = {
          look: Number.isFinite(+c.look) ? Math.min(3, Math.max(0.25, +c.look)) : (+prev.look || 1),
          base: ['walk', 'jog', 'run'].includes(c.base) ? c.base : (prev.base || 'walk')
        };
      }
      if (body.a11y) {   // t186: photosensitive comfort — steady lights follow the profile
        prefs.a11y = { steady: body.a11y.steady === true };
      }
      // personal shelf map (unitId → sectionKey; '' entries clear mappings)
      if (body.shelves && !cfg.locks.shelves) {
        prefs.shelves = sanitizeShelfMap({ ...(prefs.shelves || {}), ...body.shelves });
      }
      // personal media mix (null = follow the store's setup)
      if (body.sources !== undefined && !cfg.locks.sources) prefs.sources = sanitizeSourcesPref(body.sources);
      if (Array.isArray(body.guideFavs))   // t128: the Guide's favorite channels (per profile)
        prefs.guideFavs = [...new Set(body.guideFavs.map(String).filter(s => s.length > 0 && s.length <= 100))].slice(0, 300);
      // personal TV idle pick ('' = follow the store default)
      if (body.tv) {
        prefs.tv = {
          idleMode: ['', 'white', 'standby', 'loop', 'item'].includes(body.tv.idleMode) ? body.tv.idleMode : '',   // t150: 'white' = the projector screen, a first-class pick now
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

    // ── t171: PER-USER connections (Steam library) ──────────
    // The owner's accounts are never involved: each user stores their own
    // keys in their own account; the server only ever uses a key on behalf
    // of the user it belongs to.
    if (pathname === '/api/connections/me') {
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in to connect your own Steam');
      if (method === 'GET') {
        const cfg = getConfig();                     // t175: which halves the ADMIN's keys already cover
        return ok(res, { connections: publicConnections(user.connections),
          server: { steam: !!cfg.steam?.key } });   // t186: the YouTube key is gone — the panel browses the real site
      }
      if (method === 'PUT') {
        const body = await readBody(req);
        user.connections = sanitizeConnections(user.connections, body.connections || body);
        (await import('../lib/store.js')).saveDb();
        return ok(res, { ok: true, connections: publicConnections(user.connections) });
      }
    }
    if (method === 'POST' && pathname === '/api/connections/test') {     // t178: test YOUR OWN key, right where you paste it
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in first');
      const body = await readBody(req);
      const src = String(body.source || '');
      if (src === 'steam') {
        const key = (body.key && body.key !== MASK) ? String(body.key).trim() : (user.connections?.steam?.key || '');
        if (!key) return ok(res, { ok: false, error: 'No Steam key of your own yet — paste one above (or type one and test before saving). The store\'s key, if any, is tested in Admin → Servers.' });
        return ok(res, await steamKeyCheck(key));
      }
      return fail(res, 400, 'Unknown source');   // t186: 'youtube' is retired — nothing to test
    }
    if (method === 'GET' && pathname === '/api/connections') {          // admin: the network's link states (no raw keys)
      if (!requireAdmin(req, res)) return true;
      const store = await import('../lib/store.js');
      const db = store.getDb();
      return ok(res, { connections: db.users.map(u => ({ user: u.username, ...publicConnections(u.connections) })) });
    }
    if (method === 'GET' && pathname === '/api/steam/shared') {          // t172: whose libraries can I browse?
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in first');
      const store = await import('../lib/store.js');
      const db = store.getDb();
      return ok(res, { shared: db.users
        .filter(u => u.id !== user.id && u.connections?.steam?.id && u.connections?.steam?.share
          && (u.connections?.steam?.key || getConfig().steam?.key))
        .map(u => ({ user: u.username })) });
    }
    if (method === 'GET' && pathname === '/api/steam/library') {
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in first');
      let target = user;
      const store = await import('../lib/store.js');
      let who = '';
      try { who = new URL(req.url, 'http://x').searchParams.get('user') || ''; } catch {}
      if (who) {
        const t = store.getDb().users.find(u => u.username.toLowerCase() === String(who).toLowerCase());
        if (!t) return fail(res, 404, 'No such user');
        if (t.id !== user.id && !t.connections?.steam?.share)
          return fail(res, 403, 'That library is not shared');
        target = t;
      }
      const kc = target.connections?.steam;
      const skey = kc?.key || getConfig().steam?.key || user.connections?.steam?.key;   // t175: server key covers key-less users
      if (!skey || !kc?.id)
        return fail(res, 400, 'Add a SteamID64 in Menu → My Connections first (the server\u2019s Steam key does the rest — or link your own key).');
      const r = await fetchSteamLibrary(skey, kc.id);
      if (!r.ok) return json(res, r.status, { error: r.error, setup: !!r.setup });
      return ok(res, { user: target.username, ...r.data, cached: !!r.cached });
    }

    // ── t173: the GAME ROOM's Discord portal — public project-server facts ──
    // (online + member counts from the invite, live names/channels when the
    // owner has the server widget on). No auth: it's the same info the invite
    // page shows. The user's OWN Discord opens by link — nothing private is
    // ever read by this app.
    if (method === 'GET' && pathname === '/api/discord/portal') {
      const store = await import('../lib/store.js');
      const cfg = store.getConfig();
      const invite = (cfg.community?.discord || '').replace(/^.*discord\.gg\//, '').split(/[/?#]/)[0] || 'rbq2m9zZBs';
      const ck = 'discordportal:' + invite;
      const hit = cacheGetPub(ck);
      if (hit) return ok(res, { ...hit, cached: true });
      let out = { invite: 'https://discord.gg/' + invite, guildName: '', online: 0, members: 0, widgetOk: false, onlineNames: [] };
      try {
        const r = await fetch('https://discord.com/api/v10/invites/' + invite + '?with_counts=true', { headers: { 'User-Agent': 'HomeBinger (bug-report desk)' } });
        if (r.status === 200) {
          const j = await r.json();
          out.guildName = j.guild?.name || '';
          out.online = j.approximate_presence_count || 0;
          out.members = j.approximate_member_count || 0;
          const gid = j.guild?.id;
          if (gid) {   // the widget is optional (Server Settings → Widget) — names when it's on
            try {
              const w = await fetch('https://discord.com/api/guilds/' + gid + '/widget.json', { headers: { 'User-Agent': 'HomeBinger (bug-report desk)' } });
              if (w.status === 200) {
                const wj = await w.json();
                out.widgetOk = true;
                out.onlineNames = (wj.members || []).slice(0, 12).map(m => m.username || m.nick || '').filter(Boolean);
              }
            } catch { /* widget is a bonus, never a failure */ }
          }
        }
      } catch { /* offline — zeros are fine */ }
      cacheSetPub(ck, out);
      return ok(res, out);
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
      {   // t123: per-user access guard
        const denied = deniedSectionsFor(req);
        if (denied) {
          const it = await findItem(source, key).catch(() => null);
          if (it && denied.has(sectionKeyOfItem(it))) return fail(res, 403, 'That library is not shared with your account');
        }
      }
      // t154: sources without a details API (some adapters) answer a clean
      // 404 — a missing detail() must never crash the route into a 500
      if (typeof adapter.detail !== 'function') return fail(res, 404, 'No details for this source');
      const detail = await adapter.detail(sc?.cfg || {}, key);
      if (!detail) return fail(res, 404, 'Not found');
      return ok(res, detail);
    }

    // ── posters: /img/<source>/<key> ──
    if (method === 'GET' && pathname.startsWith('/img/')) {
      const _gp = pathname.split('/').map(decodeURIComponent);
      const source = _gp[2], key = _gp.slice(3).join('/');   // key may contain '/'
      // t185: a SINGLE-segment /img/<file> (no source/key) is not a poster —
      // it's one of the app's own images (public/img/…, e.g. the den's owner
      // logo). Hand back to the static file server.
      if (!_gp[3]) return false;
      {   // t123: per-user access guard — posters of hidden libraries 404
        const denied = deniedSectionsFor(req);
        if (denied) {
          const it = await findItem(source, key).catch(() => null);
          if (it && denied.has(sectionKeyOfItem(it))) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no poster'); return true; }
        }
      }
      // t89: GRABBER CASE ART — grabbed videos have no art upstream; the
      // first browser to visit grabs a frame and POSTs it (below). Cached
      // on disk, then served like any other poster.
      // t151: LOCAL MUSIC gets its art SERVER-side, on demand: the album
      // folder's own cover.jpg/folder.jpg first, then the picture embedded
      // in the file's tags — whichever hits first is cached like any thumb.
      if (source === 'local') {
        const thumb = localThumbPath(key);
        if (thumb && fs.existsSync(thumb)) {
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
          fs.createReadStream(thumb).pipe(res);
          return true;
        }
        const li = await findItem('local', key).catch(() => null);
        if (li?.type === 'album' && thumb) {
          const buf = await localAlbumArt(key).catch(() => null);
          if (buf) {
            try {
              fs.mkdirSync(path.dirname(thumb), { recursive: true });
              const tmpA = thumb + '.tmp' + Date.now();
              fs.writeFileSync(tmpA, buf);
              fs.renameSync(tmpA, thumb);
              res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
              res.end(buf);
              return true;
            } catch { /* unwritable cache → fall through to 404 */ }
          }
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

    // ═══ t186: WATCH PARTY — the theater's "watch with me" (Discord
    // screenshare is impossible in-app; this is the store's own answer).
    // Host-single-writer + SSE events + shared clock; see lib/party.js. ═══
    if (pathname === '/api/party/time' && method === 'GET')
      return ok(res, partyTime());                        // the shared clock (no auth — it's a clock)
    // ═══ t201: the LAN address — the share panel's "same Wi‑Fi" link must
    // never say localhost (a PHONE cannot load http://localhost:8181 — that's
    // the phone itself). Authed: the host is always signed in. Also carries
    // pagesOk — whether the public guest page is actually published, probed
    // server-side (GitHub Pages 404s send no CORS headers, so the browser
    // can't ask itself) and cached 15 min. ═══
    if (pathname === '/api/netinfo' && method === 'GET') {
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in first.');
      const flat = [].concat(...Object.values(os.networkInterfaces()))
        .filter(i => i && i.family === 'IPv4' && !i.internal);
      const lanIp = (flat.find(i => !i.address.startsWith('169.254.')) || flat[0] || {}).address || null;
      return ok(res, { lanIp, pagesOk: await pagesOkCached() });
    }
    if (pathname === '/api/party' && method === 'GET')
      return ok(res, partyState());                       // the marquee read (join/leave needs a login)
    if (pathname === '/api/party' && method === 'DELETE') {
      const user = getSessionUser(req);
      const r = endParty(user);
      return r.ok ? ok(res, r) : fail(res, 403, r.error);
    }
    if (pathname === '/api/party' && method === 'POST') {  // HOST creates (item = what's on the theater TV)
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in to host a watch party');
      const body = await readBody(req);
      const r = createParty(user, body.item);
      return r.ok ? ok(res, r) : fail(res, 400, r.error);
    }
    if (pathname === '/api/party/join' && method === 'POST') {
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in to join the watch party');
      const r = joinParty(user);
      return r.ok ? ok(res, r) : fail(res, 400, r.error);
    }
    if (pathname === '/api/party/leave' && method === 'POST') {
      const user = getSessionUser(req);
      if (!user) return ok(res, { ok: true });            // idempotent goodbye
      return ok(res, leaveParty(user));
    }
    if (pathname === '/api/party/host' && method === 'POST') {   // the single writer's heartbeat
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in first');
      const body = await readBody(req);
      const r = hostUpdate(user, body);
      return r.ok ? ok(res, r) : fail(res, 403, r.error);
    }
    if (pathname === '/api/party/stall' && method === 'POST') {  // a guest buffered — the group waits
      const user = getSessionUser(req);
      if (!user) return fail(res, 401, 'Sign in first');
      const body = await readBody(req);
      const r = reportStall(user, body.on === true);
      return r.ok ? ok(res, r) : fail(res, 403, r.error);
    }
    if (pathname === '/api/party/events' && method === 'GET') {  // SSE — one per party client
      const user = getSessionUser(req);                   // ?vb_auth=<token> (EventSource can't send headers)
      if (!user) return fail(res, 401, 'Sign in first');
      subscribeParty(req, res, user);
      return true;                                        // response stays open (chunked)
    }

    // ▶ PLAY a shelf item on the in-store TV: /api/play/<source>/<key>
    //    (video for movies/shows/music videos; ?audio=1 for music albums)
    //    Streamed through this server so media-server tokens stay secret.
    if (method === 'GET' && pathname.startsWith('/api/play/')) {
      const _p = pathname.split('/').map(decodeURIComponent);
      const source = _p[3], key = _p.slice(4).join('/');   // t51: local keys contain '/'
      const isAudio = new URL(req.url, 'http://x').searchParams.get('audio') === '1';
      // t154: ?dl=1 → Content-Disposition (SAVE instead of stream). Same
      // access rules as playback — the guard below runs first for everyone.
      const isDl = new URL(req.url, 'http://x').searchParams.get('dl') === '1';
      let dlName = '';
      if (isDl) {
        const it = await findItem(source, key).catch(() => null);
        const ext = (/\.[a-z0-9]{1,5}$/i.exec(String(key || '')) || [''])[0];
        const base = String(it?.title || (String(key).split('/').pop() || 'media')).replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 120) || 'media';
        dlName = base + ext;     // proxied sources may have no ext — proxyVideo adds one from the mime
      }
      // t123: per-user access — a hidden library is a hard 403 on the STREAM,
      // not just invisible menus (dev tools must not reach it either)
      {
        const denied = deniedSectionsFor(req);
        if (denied) {
          const it = await findItem(source, key).catch(() => null);
          if (it && denied.has(sectionKeyOfItem(it))) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('That library is not shared with your account');
            return true;
          }
        }
      }
      // t123: the live TV wing — HLS through the signed m3u8-rewrite proxy
      if (source === 'iptv') {
        const sc0 = sourceConfig('iptv');
        if (!sc0) { res.writeHead(404); res.end('unknown source'); return true; }
        await proxyIptv(req, res, key, sc0.cfg);
        return true;
      }
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
        streamLocalFile(req, res, abs, localAdapter.mimeFor(abs), dlName);
        return true;
      }
      if (!upstream) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('no stream for this item'); return true; }
      await proxyVideo(req, res, upstream, dlName ? { dlName } : {});   // works for audio too (Range proxy)
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
        {   // t123: per-user access guard on the idle-item stream
          const denied = deniedSectionsFor(req);
          if (denied) {
            const it = await findItem(source, key).catch(() => null);
            if (it && denied.has(sectionKeyOfItem(it))) { res.writeHead(403); res.end('That library is not shared with your account'); return true; }
          }
        }
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

    // ── t123: PER-USER LIBRARY ACCESS (the parents/kids feature) ──
    if (method === 'GET' && pathname === '/api/admin/library-access') {
      if (!requireAdmin(req, res)) return true;
      const cfg = getConfig();
      const store = await import('../lib/store.js');
      const db = store.getDb();
      return ok(res, {
        access: cfg.libraryAccess || {},
        users: db.users.filter(u => !u.isAdmin).map(u => ({ username: u.username }))
      });
    }
    if (method === 'PUT' && pathname === '/api/admin/library-access') {
      if (!requireAdmin(req, res)) return true;
      const body = await readBody(req, 64 * 1024);
      const key = String(body.key || '').slice(0, 120);
      if (!key) return fail(res, 400, 'Missing library key');
      const cfg = getConfig();
      const la = { ...(cfg.libraryAccess || {}) };
      const v = body.value;
      if (v === null || v === undefined) delete la[key];                        // back to 'all'
      else if (v === 'all') la[key] = 'all';
      else if (v && typeof v === 'object' && Array.isArray(v.users)) la[key] = { users: v.users.map(String).slice(0, 64).filter(Boolean) };
      else return fail(res, 400, 'Value must be null, "all", or { users: [...] }');
      Object.assign(configRef(), { libraryAccess: la });   // same in-place pattern the config PUT uses
      saveConfig();
      return ok(res, { ok: true, access: la });
    }

    // ── t123: FRIEND INVITES (the Tailscale on-ramp) ──
    if (method === 'GET' && pathname === '/api/admin/tailscale-ip') {
      if (!requireAdmin(req, res)) return true;
      const { execFile } = await import('node:child_process');
      const ip = await new Promise((resolve) => {
        const p = execFile('tailscale', ['ip', '-4'], { timeout: 4000, windowsHide: true }, (e, stdout) => {
          const m = String(stdout || '').match(/\b100\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/);
          resolve(m ? m[0] : null);
        });
        if (p?.on) p.on('error', () => resolve(null));
      }).catch(() => null);
      return ok(res, { ip });
    }
    if (method === 'GET' && pathname === '/api/admin/invites') {
      if (!requireAdmin(req, res)) return true;
      const store = await import('../lib/store.js');
      const db = store.getDb();
      return ok(res, { invites: (db.invites || []).slice(-50) });
    }
    if (method === 'GET' && pathname === '/api/admin/invite/bat') {
      if (!requireAdmin(req, res)) return true;
      const sp = new URL(req.url, 'http://x').searchParams;
      const name = (sp.get('name') || 'friend').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'friend';
      const key = String(sp.get('key') || '').trim().slice(0, 120);
      const host = String(sp.get('host') || '').trim().slice(0, 100);
      if (!/^tskey-/.test(key)) return fail(res, 400, 'That does not look like a Tailscale pre-auth key (it starts with tskey-)');
      if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host) || !host) return fail(res, 400, 'Enter the store address your friend will open (e.g. 100.101.102.103:8181)');
      const bat = [
        '@echo off',
        'REM ============================================================',
        'REM  Home Binger - friend invite (' + name + ')',
        'REM  SmartScreen may show "Windows protected your PC" because this',
        'REM  file is unsigned. Click "More info" then "Run anyway".',
        'REM ============================================================',
        'echo Welcome to Home Binger, ' + name + '!',
        'echo This one-time script connects your PC to the store.',
        'echo.',
        'where tailscale >nul 2>nul',
        'if errorlevel 1 (',
        '  echo Installing Tailscale (the free private network)...',
        '  curl -L -f -o "%TEMP%\\hb-tailscale.msi" https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi',
        '  if errorlevel 1 (',
        '    echo.',
        '    echo Could not download Tailscale automatically.',
        '    echo Install it free from https://tailscale.com/download,',
        '    echo then run this file again.',
        '    pause',
        '    exit /b 1',
        '  )',
        '  msiexec /i "%TEMP%\\hb-tailscale.msi" /qn TS_NOLAUNCH=1 TS_UNATTENDEDMODE=always TS_ONBOARDING_FLOW=hide',
        '  echo Waiting for the installer...',
        '  timeout /t 8 /nobreak >nul',
        ')',
        'echo Connecting to the store...',
        'tailscale up --authkey=' + key + ' --timeout=90s',
        'echo.',
        'echo Opening the store in your browser...',
        'start http://' + host,
        'echo.',
        'echo All done! You can close this window.',
        'pause'
      ].join('\r\n');
      // record the invite (nickname + dates only — the KEY itself is never stored)
      const store = await import('../lib/store.js');
      const db = store.getDb();
      if (!Array.isArray(db.invites)) db.invites = [];
      db.invites.push({ name, host, createdAt: Date.now(), expiresAt: Date.now() + 30 * 864e5 });
      store.saveDb();
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="HB-Invite-' + name + '.bat"'
      });
      res.end(bat);
      return true;
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
      // t169: community is intentionally NOT writable — the bug-report
      // Discord is pinned to the project's own server (store.js pins it
      // on every load)
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
      if (next.spotify) delete next.spotify;   // t182c: Spotify is gone — never carry old keys forward
      if (next.youtube) delete next.youtube;  // t186: the YouTube key is gone too — the panel browses the real site; stale keys never carry forward
      // t175/t186: the ADMIN's server-wide Steam key — one setup and every
      // user gets their Steam library (each person still links their own
      // SteamID64; personal keys remain an optional override)
      if (incoming.steam && typeof incoming.steam === 'object') {
        next.steam = next.steam || { key: '' };
        if (incoming.steam.key !== undefined && incoming.steam.key !== null && incoming.steam.key !== MASK)
          next.steam.key = String(incoming.steam.key).trim().slice(0, 100);
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
      // t123: the live TV wing — Guide-only sections + the unverified toggle
      if (incoming.iptv) {
        const VALID = new Set(['news', 'movies', 'series', 'kids', 'documentary', 'entertainment', 'comedy', 'sports', 'music', 'animation', 'classic', 'public']);
        if (Array.isArray(incoming.iptv.sections))
          next.iptv.sections = incoming.iptv.sections.map(String).filter(s => VALID.has(s)).slice(0, 12);
        if (typeof incoming.iptv.url === 'string')
          next.iptv.url = /^https?:\/\//.test(incoming.iptv.url) ? incoming.iptv.url.trim() : '';   // '' = the real iptv-org API
        // t137: an EXTRA channel pack (.m3u playlist URL) — e.g. Plex's free
        // live TV channels (community-maintained anonymous playlist). Rides
        // the Guide as its own page; empty = off.
        if (typeof incoming.iptv.playlistUrl === 'string')
          next.iptv.playlistUrl = /^https?:\/\//.test(incoming.iptv.playlistUrl) ? incoming.iptv.playlistUrl.trim().slice(0, 500) : '';
        // t138: EXTRA CHANNEL PACKS — a list of {label, url} providers. A
        // legacy playlistUrl (beta ≤6 admin tab) folds in when no packs ride
        // the save, so old tabs never strand their pack.
        if (Array.isArray(incoming.iptv.packs)) {
          const packs = [];
          const seenUrl = new Set();
          for (const pk of incoming.iptv.packs) {
            if (!pk || typeof pk !== 'object') continue;
            const url = /^https?:\/\//.test(pk.url || '') ? String(pk.url).trim().slice(0, 500) : '';
            if (!url || seenUrl.has(url)) continue;
            seenUrl.add(url);
            const epg = /^https?:\//.test(pk.epg || '') ? String(pk.epg).trim().slice(0, 500) : undefined;   // t139: optional EPG override (advanced/tests)
            packs.push({ label: String(pk.label || '').trim().slice(0, 24) || `Pack ${packs.length + 1}`, url , ...(epg ? { epg } : {}) });
            if (packs.length >= 40) break;   // t147b: room for every country pack + worldwide + presets + custom (the old cap of 8 silently ate country adds once Canada was in — a dead click)
          }
          next.iptv.packs = packs;
        } else if (next.iptv.playlistUrl) {
          next.iptv.packs = [{ label: 'Plex Free', url: next.iptv.playlistUrl }];
        }
        next.iptv.unverified = incoming.iptv.unverified === true;
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
          mode: ['white', 'standby', 'loop', 'url', 'item'].includes(incoming.tv.mode) ? incoming.tv.mode : 'standby',   // t150: projector screen joins the admin picker
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
      // t133: snapshot the PRE-SAVE lock/default state (cfg is the live
      // config object — Object.assign below mutates it in place)
      const preLocks = { ...(cfg.locks || {}) };
      const preDefaults = { theme: { ...(cfg.defaults?.theme || {}) }, sorting: { ...(cfg.defaults?.sorting || {}) } };
      Object.assign(configRef(), next); // replace in place
      saveConfig();
      // t133: A LOCK IS A TRUE SYNC, NOT A MASK — turning the theme lock on
      // (or changing the locked default) WRITES the house theme into every
      // saved profile. Owner: "the admin theme lock works for only part of
      // it not all of it. everyone would still have to go sync their theme
      // by changing it themselves." Before this, the lock only OVERLAID the
      // house theme on display while every profile kept its old personal
      // theme underneath — so the moment the lock came off, everyone snapped
      // back out of sync. Now the lock genuinely syncs: nothing to redo, no
      // snap-back. Same rule for the sorting lock.
      const syncKeys = [];
      if (next.locks?.theme && (preLocks.theme !== true
        || JSON.stringify(next.defaults.theme) !== JSON.stringify(preDefaults.theme))) syncKeys.push('theme');
      if (next.locks?.sorting && (preLocks.sorting !== true
        || JSON.stringify(next.defaults.sorting) !== JSON.stringify(preDefaults.sorting))) syncKeys.push('sorting');
      if (syncKeys.length) {
        const store = await import('../lib/store.js');
        const db = store.getDb();
        for (const k of Object.keys(db.profiles || {})) {
          const p = { ...db.profiles[k] };
          if (syncKeys.includes('theme')) p.theme = { ...next.defaults.theme };
          if (syncKeys.includes('sorting')) p.sorting = { ...next.defaults.sorting };
          p.updatedAt = Date.now();
          db.profiles[k] = p;
        }
        store.saveDb();
      }
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
      // t177: one-click key diagnosis for the den's per-server keys.
      // Draft values win; MASK means "use what's saved".
      const src = String(body.source || '');
      if (src === 'steam') {
        const key = (body.key && body.key !== MASK) ? String(body.key).trim() : (getConfig().steam?.key || '');
        if (!key) return ok(res, { ok: false, error: 'No Steam key yet — paste one above and Save (or type one and test before saving).' });
        return ok(res, await steamKeyCheck(key));
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
      if (source === 'archive' || source === 'radio' || source === 'iptv') {   // t123: + the Guide's groups
        const a = ADAPTERS[source];
        // t125: AWAIT — iptv's libraries() is async; the old bare call handed a
        // Promise to json() → "{}" → the admin group list rendered as an error →
        // saves collected ZERO checked groups and wiped the Guide's sections.
        const r = await a.libraries();
        return ok(res, r || { libraries: [] });
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

    // t132: RE-THEME EVERYONE — the admin changed the store's default theme
    // and wants the whole store (every saved profile, including their own)
    // switched to it now. One-time: visitors can still personalize after.
    if (method === 'POST' && pathname === '/api/admin/retheme') {
      if (!requireAdmin(req, res)) return true;
      const body = await readBody(req);
      const theme = sanitizeTheme(body.theme || {});
      const store = await import('../lib/store.js');
      const db = store.getDb();
      let n = 0;
      for (const k of Object.keys(db.profiles || {})) {
        db.profiles[k] = { ...db.profiles[k], theme: { ...theme }, updatedAt: Date.now() };
        n++;
      }
      store.saveDb();
      return ok(res, { rethemed: n });
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
