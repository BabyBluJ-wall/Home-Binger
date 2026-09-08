// ─────────────────────────────────────────────────────────────────────────────
//  auth.js — users, passwords, sessions & anonymous device profiles
// ─────────────────────────────────────────────────────────────────────────────
//  • Passwords hashed with Node's built-in scrypt (no native deps).
//  • Sessions are random tokens stored in db.json + an HttpOnly cookie.
//  • Anonymous visitors get a "device id" cookie so their theme/sorting
//    persist on that browser with no login. Logging in binds the same
//    preferences to the account so they sync across devices.
//
//  Default admin account is created on first run from:
//      HB_ADMIN_USER (default "BabyBluJ") / HB_ADMIN_PASSWORD (default "BluJNetwork")
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import { getDb, saveDb, getProfile, setProfile, defaultPrefs } from './store.js';

const SESSION_COOKIE = 'vb_sess';   // login session
const DEVICE_COOKIE = 'vb_dev';     // anonymous device profile id
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// ── passwords ────────────────────────────────────────────────────────────────
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch { return false; }
}

// ── users ────────────────────────────────────────────────────────────────────
export function ensureDefaultAdmin() {
  const db = getDb();
  if (db.users.some(u => u.isAdmin)) return;
  db.users.push({
    id: crypto.randomUUID(),
    username: (process.env.HB_ADMIN_USER || process.env.HB_ADMIN_USER) || 'BabyBluJ',
    pass: hashPassword((process.env.HB_ADMIN_PASSWORD || process.env.HB_ADMIN_PASSWORD) || 'BluJNetwork'),
    isAdmin: true,
    createdAt: Date.now()
  });
  saveDb();
}
export function findUser(name) {
  return getDb().users.find(u => u.username.toLowerCase() === String(name || '').toLowerCase()) || null;
}
export function publicUser(u) {
  return u ? { id: u.id, username: u.username, isAdmin: !!u.isAdmin, createdAt: u.createdAt } : null;
}

// ── cookies ──────────────────────────────────────────────────────────────────
export function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
// Build a Set-Cookie string. If the request looks cross-site (e.g. the app is
// viewed through a proxy/preview), use SameSite=None;Secure so it still works.
export function cookieString(req, name, value, maxAgeSec) {
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  const crossSite = origin && !origin.includes(host);
  let attrs = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}`;
  attrs += crossSite ? '; SameSite=None; Secure' : '; SameSite=Lax';
  return attrs;
}

// ── sessions ─────────────────────────────────────────────────────────────────
export function createSession(req, res, userId) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId, expires: Date.now() + SESSION_TTL_MS };
  saveDb();
  res.setHeader('Set-Cookie', cookieString(req, SESSION_COOKIE, token, SESSION_TTL_MS / 1000));
  return token;
}
export function destroySession(req, res) {
  const token = parseCookies(req)[SESSION_COOKIE] || bearerToken(req);
  if (token) { delete getDb().sessions[token]; saveDb(); }
  res.setHeader('Set-Cookie', cookieString(req, SESSION_COOKIE, '', 0));
}
export function getSessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE] || bearerToken(req);
  if (!token) return null;
  const s = getDb().sessions[token];
  if (!s || s.expires < Date.now()) return null;
  return getDb().users.find(u => u.id === s.userId) || null;
}

// ── anonymous device identity ────────────────────────────────────────────────
// Returns the device key ("dev:<id>") for this browser, minting one if needed.
export function getOrCreateDevice(req, res) {
  // Header/query first: the SPA keeps its device id in localStorage and sends
  // it as X-VB-Device (or ?vb_dev=). That survives cookie-stripping proxies.
  let id = req.headers['x-vb-device'];
  if (!id) { try { id = new URL(req.url, 'http://x').searchParams.get('vb_dev'); } catch {} }
  if (id && /^dev:[a-f0-9]{32}$/.test(id)) {
    // Keep the cookie glued to the client's localStorage id. Without this,
    // a request that arrives with NEITHER id (before the cookie exists)
    // mints a second profile and the visitor ends up split-brained:
    // app calls (header) read/write profile X, cookie-only calls read Y.
    const c = parseCookies(req)[DEVICE_COOKIE];
    if (c !== id && !res.headersSent) res.setHeader('Set-Cookie', cookieString(req, DEVICE_COOKIE, id, 60 * 60 * 24 * 365));
    return id;
  }
  id = parseCookies(req)[DEVICE_COOKIE];
  if (!id || !/^dev:[a-f0-9]{32}$/.test(id)) {
    id = 'dev:' + crypto.randomBytes(16).toString('hex');
    if (!res.headersSent) res.setHeader('Set-Cookie', cookieString(req, DEVICE_COOKIE, id, 60 * 60 * 24 * 365));
  }
  return id;
}

// Session token from the Authorization header (Bearer) — used by the SPA
// (localStorage) when cookies are stripped by preview proxies.
export function bearerToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  // Last resort: ?vb_auth=<token> on the URL — some preview proxies strip
  // BOTH cookies and Authorization headers; query params always arrive.
  try {
    const q = new URL(req.url, 'http://x').searchParams.get('vb_auth');
    return q || null;
  } catch { return null; }
}

// ── the profile key whose prefs apply to the current visitor ─────────────────
export function profileKeyFor(req, res, allowAnonymous = true) {
  const user = getSessionUser(req);
  if (user) return 'user:' + user.id;
  if (allowAnonymous) return getOrCreateDevice(req, res);
  return null;
}

// ── preference read/write ────────────────────────────────────────────────────
export function readPrefs(key) { return getProfile(key) || defaultPrefs(); }


// Personal media mix: which sources stock THIS visitor's shelves.
// null = follow the store's setup. Per key: null = follow store, true/false =
// force on/off (demo/plex/jellyfin), array = force those sections (archive/radio).
export function sanitizeSourcesPref(v) {
  if (!v || typeof v !== 'object') return null;
  const out = {};
  for (const k of ['plex', 'jellyfin']) {
    out[k] = typeof v[k] === 'boolean' ? v[k] : null;
  }
  for (const k of ['archive', 'radio']) {
    out[k] = Array.isArray(v[k])
      ? [...new Set(v[k].map(String).filter(x => /^[\w-]{1,40}$/.test(x)))].slice(0, 20)
      : null;
  }
  // t87: extra instances (plex-2, jellyfin-2, …) toggle like the built-ins —
  // boolean on/off; absent key = follow the store's setting.
  for (const k of Object.keys(v)) {
    if (k in out) continue;
    if (/^[a-z][a-z0-9-]{0,31}$/.test(k) && typeof v[k] === 'boolean') out[k] = v[k];
  }
  return out;
}

// Shelf maps are { unitId: sectionKey } — both slugs, bounded size. Entries
// with an empty sectionKey are REMOVED (that's how "back to automatic" saves).
export function sanitizeShelfMap(map) {
  const out = {};
  for (const [unit, sec] of Object.entries(map || {})) {
    if (!/^[\w-]{1,32}$/.test(unit)) continue;
    if (sec === '' || sec == null) continue;
    if (/^[\w:-]{1,100}$/.test(String(sec))) out[unit] = String(sec);   // t87: instance-namespaced keys
    if (Object.keys(out).length >= 64) break;
  }
  return out;
}

export function writePrefs(key, incoming) {
  const current = readPrefs(key);
  const next = {
    theme: { ...current.theme, ...(incoming.theme || {}) },
    sorting: { ...current.sorting, ...(incoming.sorting || {}) },
    // Style-only: the visualizer COLOR always follows the theme accent —
    // one theme syncs menus, store AND visualizer per user.
    visualizer: {
      style: ['bars', 'mirror', 'wave', 'pulse'].includes(incoming.visualizer?.style)
        ? incoming.visualizer.style
        : (current.visualizer?.style || 'bars')
    },
    // personal shelf map — unitId → sectionKey ('' value drops the entry)
    shelves: sanitizeShelfMap({ ...(current.shelves || {}), ...(incoming.shelves || {}) }),
    // personal TV idle pick ('' = follow the store default)
    tv: {
      idleMode: ['', 'standby', 'loop', 'item'].includes(incoming.tv?.idleMode)
        ? incoming.tv.idleMode : (current.tv?.idleMode || ''),
      itemId: typeof incoming.tv?.itemId === 'string' && /^[\w:-]{1,80}$/.test(incoming.tv.itemId)
        ? incoming.tv.itemId : (current.tv?.itemId || '')
    },
    // personal media mix (null = follow the store's setup)
    sources: incoming.sources !== undefined
      ? sanitizeSourcesPref(incoming.sources)
      : (current.sources ?? null),
    updatedAt: Date.now()
  };
  setProfile(key, next);
  return next;
}

// When a guest registers or logs in for the first time, carry their local
// device preferences over to the account so nothing "resets" on them.
export function migrateDevicePrefs(req, res, userId) {
  const db = getDb();
  const devKey = parseCookies(req)[DEVICE_COOKIE];
  const devPrefs = devKey ? db.profiles[devKey] : null;
  if (devPrefs && !db.profiles['user:' + userId]) {
    setProfile('user:' + userId, devPrefs);
  }
}
