// ─────────────────────────────────────────────────────────────────────────────
//  lib/friends.js — HB↔HB: Home Binger stores sharing shelves with each other
// ─────────────────────────────────────────────────────────────────────────────
//  Two roles, one app — every store can play both:
//
//  HOST ("Friend sharing" in Admin → Server): I invite a friend by name; the
//  app mints a friend CODE for them. I hand them my store address + the code
//  (in person, text, whatever). For each friend I tick which of MY shelves
//  they see (empty list = everything I own myself). Revoking = delete the
//  friend or switch sharing off — their store simply stops seeing mine.
//
//  FOLLOWER ("Friends' stores" in Admin → Server): I paste a friend's address
//  + code. Their shared shelves appear as new sections in my store, and their
//  media streams THROUGH their store (their Plex/Jellyfin tokens never leave
//  their machine — same doctrine as this server's own proxy).
//
//  RULES (owner-set, 2026-09):
//  · approval-based — a friend only connects with a code I deliberately gave
//  · per-friend share lists — each friend sees only the shelves I ticked
//  · NO transitive sharing — items a friend shared INTO my store are never
//    shareable onward to my other friends. My share list offers only MY OWN
//    shelves. (Enforced here: friend-sourced items are filtered from every
//    outbound catalog, and the share-sections list excludes friend sections.)
//  · nothing public — the friend API is token-gated, LAN/VPN only, and this
//    server still never opens a port to the internet.
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

// The effective section key of an item (same rule librarySections uses).
export const sectionKeyOf = (it) =>
  it.sectionId || ('auto:' + (it.sectionTitle || it.type || 'media'));

// A fresh friend code — 18 hex chars, e.g. "9f2c41ab77e0c3d512".
export function newCode() {
  return crypto.randomBytes(9).toString('hex');
}

// Timing-safe lookup: which invited friend (if any) does this token belong to?
export function findShareEntry(cfg, token) {
  const t = String(token || '');
  if (!/^[a-z0-9]{8,64}$/i.test(t)) return null;
  for (const e of (cfg.friendShare?.entries || [])) {
    if (e.on === false) continue;
    const a = Buffer.from(String(e.token || ''));
    const b = Buffer.from(t);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return e;
  }
  return null;
}

// The ids of stores THIS store follows (their items are inbound-only).
export function friendSourceIds(cfg) {
  return new Set((cfg.friendStores || []).map(s => s.id));
}

// An item may go OUT to a friend only if: (a) it's ours (never something a
// friend shared to us) and (b) its shelf is in that friend's share list
// (empty list = all of our own shelves).
export function shareableWith(entry, item, fIds) {
  if (fIds.has(item.source)) return false;                       // no transitive sharing
  if (entry.sections?.length) return entry.sections.includes(sectionKeyOf(item));
  return true;
}

// Fetch a friend's catalog (the follower side of the wire). Quiet-fail with
// a thrown Error — the caller skips the source; the store never blocks.
export async function fetchFriendCatalog(store) {
  const base = String(store.url || '').replace(/\/+$/, '');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(base + '/api/friend/catalog?token=' + encodeURIComponent(store.token || ''), {
      signal: ctl.signal, headers: { accept: 'application/json' }
    });
    if (!r.ok) throw new Error('friend store answered ' + r.status);
    const d = await r.json();
    if (!d || !Array.isArray(d.items)) throw new Error('unrecognized catalog');
    return d;
  } finally { clearTimeout(timer); }
}

// Split a follower-side key ("archive:night_of…", "local:videos/x.mp4") back
// into the HOST's source + key, encoded for one URL path segment.
export function hostKeyParts(key) {
  const s = String(key || '');
  const i = s.indexOf(':');
  if (i < 1) return null;
  return { source: s.slice(0, i), key: encodeURIComponent(s.slice(i + 1)) };
}

// ── the follower-side ADAPTER: a friend's store behaves like any source ──
// Shaped exactly like server/lib/adapters/*.js so sourceConfig(), /api/item,
// /api/play and the poster proxy all work unchanged for friend items.
export const friendAdapter = {
  async library(store) {
    const d = await fetchFriendCatalog(store);
    return d.items.map(it => ({
      source: store.id,
      key: `${it.source}:${it.key}`,                    // routes back to the host
      id: `${store.id}:${it.source}:${it.key}`,         // unique in OUR atlas
      title: it.title, type: it.type, year: it.year, summary: it.summary || '',
      sectionId: `${store.id}:${it.sectionKey}`,        // own section namespace
      sectionTitle: it.sectionTitle,
      addedAt: it.addedAt || 0
    }));
  },
  async detail(store, key) {
    const items = await this.library(store);
    return items.find(i => i.key === key) || null;
  },
  posterUrl(store, item) {
    const p = hostKeyParts(item.key);
    if (!p) return null;
    return `${String(store.url).replace(/\/+$/, '')}/api/friend/poster/${p.source}/${p.key}?token=${encodeURIComponent(store.token)}`;
  },
  async streamUrl(store, key) {
    const p = hostKeyParts(key);
    if (!p) return null;
    return `${String(store.url).replace(/\/+$/, '')}/api/friend/stream/${p.source}/${p.key}?token=${encodeURIComponent(store.token)}`;
  },
  async audioUrl(store, key) { return this.streamUrl(store, key); },
  async test(store) {
    const d = await fetchFriendCatalog(store);
    // t106: GROUPS ONLY — shelf names and counts, never an individual title
    const names = [...new Map(d.items.map(i => [i.sectionKey, i.sectionTitle || i.sectionKey])).values()];
    const detail = !names.length
      ? 'reachable — nothing shared yet (they pick shelves in their Friend sharing settings)'
      : `${d.items.length} shared titles across ${names.length} shelves — ${names.slice(0, 4).join(' · ')}${names.length > 4 ? ' · …' : ''}`;
    return { name: d.store || store.name || 'Friend store', detail };
  }
};
