// ─────────────────────────────────────────────────────────────────────────────
//  library.js — one unified catalogue regardless of media server
// ─────────────────────────────────────────────────────────────────────────────
//  Picks the active adapter from global config ('demo' | 'plex' | 'jellyfin'),
//  normalises items to a common shape, and caches the result for a few minutes.
//  Also exposes poster/stream URL lookups used by the proxy (tokens stay here).
// ─────────────────────────────────────────────────────────────────────────────
import { getConfig } from './store.js';
import { sanitizeSourcesPref } from './auth.js';
import { plexAdapter } from './adapters/plex.js';
import { jellyfinAdapter } from './adapters/jellyfin.js';
import { archiveAdapter } from './adapters/archive.js';
import { podcastsAdapter } from './adapters/podcasts.js';
import { radioAdapter } from './adapters/radio.js';
import { localAdapter } from './adapters/local.js';
import { friendAdapter } from './friends.js';            // t97: HB↔HB

export const ADAPTERS = {
  plex: plexAdapter, jellyfin: jellyfinAdapter,
  // free add-on sources — they stack ON TOP of the primary media server
  archive: archiveAdapter, podcast: podcastsAdapter, radio: radioAdapter,
  local: localAdapter,           // t61: the file grabber — local disk, no server
};

// Add-ons are merged into the catalogue when the admin has picked sections /
// feeds for them. Each keeps its own internal cache, so switching the primary
// source never refetches the Archive or radio-browser.
const ADDONS = [
  { cfgKey: 'archive', adapter: archiveAdapter, wants: cfg => Array.isArray(cfg?.sections) && cfg.sections.length > 0 },
  { cfgKey: 'podcasts', adapter: podcastsAdapter, wants: cfg => Array.isArray(cfg?.feeds) && cfg.feeds.length > 0 },
  { cfgKey: 'radio', adapter: radioAdapter, wants: cfg => Array.isArray(cfg?.sections) && cfg.sections.length > 0 },
  { cfgKey: 'local', adapter: localAdapter,
    wants: cfg => !!(cfg?.on && (Array.isArray(cfg?.spots) ? cfg.spots.length > 0 : !!cfg?.path)) },   // t68: spots OR legacy path — fresh installs have no legacy field
];
function addonSignature(cfg) {
  return JSON.stringify({
    sources: cfg.sources || {},
    plex: cfg.plex?.sections || [],
    jellyfin: cfg.jellyfin?.sections || [],
    instances: (cfg.instances || []).map(i => [i.id, i.kind, i.on !== false, i.url || '', i.token || i.apiKey || '', i.sections || []]),   // t87
    stores: (cfg.friendStores || []).map(s => [s.id, s.on !== false, s.url || '', s.token || '']),   // t97: friend stores bust the cache
    addons: ADDONS.map(a => [a.cfgKey, cfg[a.cfgKey]?.sections || [], cfg[a.cfgKey]?.feeds || [],
      !!cfg[a.cfgKey]?.on, cfg[a.cfgKey]?.path || ''])    // t51: local on/path busts the cache
  });
}

// A "view" is the effective catalogue config for ONE visitor: the store's
// global setup overlaid with their personal media mix (prefs.sources).
export function defaultView(cfg) {
  return {
    sources: cfg.sources || {},
    plex: cfg.plex || {}, jellyfin: cfg.jellyfin || {},
    archive: cfg.archive || { sections: [] }, radio: cfg.radio || { sections: [] },
    podcasts: cfg.podcasts || { feeds: [] },
    local: cfg.local || { on: false, path: '' },     // t61: file grabber root
    // t87: extra Plex/Jellyfin connections — on + credentialed only
    instances: (cfg.instances || []).filter(i => i.on !== false && i.url && (i.token || i.apiKey)),
    stores: (cfg.friendStores || []).filter(s => s.on !== false && /^https?:\/\//.test(s.url || '') && !!s.token),   // t97
  };
}
export function userView(cfg, userSources) {
  const d = defaultView(cfg);
  const u = sanitizeSourcesPref(userSources);
  if (!u) return d;
  return {
    sources: {
      plex: u.plex ?? d.sources.plex,
      jellyfin: u.jellyfin ?? d.sources.jellyfin
    },
    plex: d.plex, jellyfin: d.jellyfin,
    archive: { ...d.archive, sections: u.archive ?? d.archive.sections },
    radio: { ...d.radio, sections: u.radio ?? d.radio.sections },
    podcasts: d.podcasts, local: d.local,           // t61: local files stack for everyone
    // t87: each extra instance honors the user's own toggle (default: on)
    instances: d.instances.filter(i => (typeof u[i.id] === 'boolean' ? u[i.id] : true)),
    // t97: each friend's store honors the user's own toggle (default: on)
    stores: d.stores.filter(s => (typeof u[s.id] === 'boolean' ? u[s.id] : true)),
  };
}

// ⚙️ EDIT ME — how long a fetched library is cached before re-querying the
// media server (ms). Lower = fresher, higher = less load on Plex/Jellyfin.
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = new Map();   // sig → { at, items } — one slot per distinct media mix

// t87: MULTI-SOURCE routing — 'plex'/'jellyfin' are the built-in slots, but
// extra instances (config.instances) each act as their OWN source key. Every
// route that touches a media server resolves through here.
export function sourceConfig(source) {
  const cfg = getConfig();
  if (typeof source !== 'string') return null;
  if (ADAPTERS[source] && cfg[source]) return { adapter: ADAPTERS[source], cfg: cfg[source] };
  const inst = (cfg.instances || []).find(i => i.id === source);
  if (inst && ADAPTERS[inst.kind]) return { adapter: ADAPTERS[inst.kind], cfg: { ...inst } };
  const store = (cfg.friendStores || []).find(s => s.id === source);   // t97: a friend's store resolves like any source
  if (store) return { adapter: friendAdapter, cfg: store };
  return null;
}

export function activeAdapter() {
  const cfg = getConfig();
  return ADAPTERS[cfg.source] || null;
}

export function invalidateCache() { cache.clear(); }

// Catalogue sources — each INDEPENDENTLY toggleable in Admin → Server.
// Nothing is mandatory: turn everything off except the free shelves and the
// store stocks ONLY public-domain classics, radio and podcasts.
const CATALOGUE = [
  { key: 'plex', adapter: plexAdapter,
    on: cfg => cfg.sources?.plex === true && !!(cfg.plex?.url && cfg.plex?.token),
    missing: cfg => cfg.sources?.plex === true && !(cfg.plex?.url && cfg.plex?.token) ? 'Plex is on but has no URL/token' : null },
  { key: 'jellyfin', adapter: jellyfinAdapter,
    on: cfg => cfg.sources?.jellyfin === true && !!(cfg.jellyfin?.url && cfg.jellyfin?.apiKey),
    missing: cfg => cfg.sources?.jellyfin === true && !(cfg.jellyfin?.url && cfg.jellyfin?.apiKey) ? 'Jellyfin is on but has no URL/API key' : null }
];

export async function getLibrary(force = false, view = null) {
  const v = view || defaultView(getConfig());
  const sig = addonSignature(v);
  if (!force) {
    const hit = cache.get(sig);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  }
  let items = [];
  for (const cat of CATALOGUE) {
    if (!cat.on(v)) continue;
    try {
      items = items.concat(await cat.adapter.library(v[cat.key] || {}));
    } catch (e) {
      console.warn(`[${cat.key}] source failed: ${e.message}`);
    }
  }
  // Normalize addedAt to SECONDS — adapters disagree (Plex/Jellyfin emit ms,
  // the free sources emit s); unnormalized, ms items always sort "newest"
  // and drown everything else. Anything above 1e12 is a ms stamp.
  for (const it of items) {
    if (it.addedAt && it.addedAt > 1e12) it.addedAt = Math.floor(it.addedAt / 1000);
  }
  // ── t87: EXTRA INSTANCES — unlimited Plex/Jellyfin connections. Each
  // instance's items are namespaced: source = instance id (routing), id gets
  // the instance prefix (atlas slots), sectionId prefixed so shelf maps and
  // By-Library grouping never collide between two libraries with the same
  // name. sectionTitle keeps the server's own label for display.
  for (const inst of (v.instances || [])) {
    const adapter = ADAPTERS[inst.kind];
    if (!adapter) continue;
    try {
      const got = await adapter.library({ ...inst, sections: inst.sections || [] });
      for (const it of got) {
        it.source = inst.id;
        it.id = `${inst.id}:${it.key}`;
        if (it.sectionId) it.sectionId = `${inst.id}:${it.sectionId}`;
        items.push(it);
      }
    } catch (e) {
      console.warn(`[${inst.id}] instance failed: ${e.message}`);
    }
  }
  // ── t97: FRIENDS' STORES — each followed store stacks on the shelves as
  // its own sections (namespace: store id), exactly like extra instances.
  // A friend's items stream through THEIR store — our proxy fetches with
  // the friend code; their media-server tokens never leave their machine.
  for (const st of (v.stores || [])) {
    try {
      items = items.concat(await friendAdapter.library(st));
    } catch (e) {
      console.warn(`[${st.id}] friend store failed: ${e.message}`);
    }
  }
  // ── free add-on sources stack on top ──
  for (const addon of ADDONS) {
    if (!addon.wants(v[addon.cfgKey])) continue;
    try {
      items = items.concat(await addon.adapter.library(v[addon.cfgKey]));
    } catch (e) {
      console.warn(`[${addon.cfgKey}] add-on failed: ${e.message}`);
    }
  }
  if (cache.size > 24) cache.clear();   // crude bound — mixes are few in practice
  cache.set(sig, { at: Date.now(), items });
  return items;
}

// Sections present in the catalogue (drives the Admin → Shelf Map dropdowns).
export async function librarySections(view = null) {
  const items = await getLibrary(false, view);
  const cfg = getConfig();
  const instName = new Map((cfg.instances || []).map(i => [i.id, i.name]));
  const storeName = new Map((cfg.friendStores || []).map(s => [s.id, s.name]));   // t97
  const SRC = { plex: 'Plex', jellyfin: 'Jellyfin', archive: 'Archive', radio: 'Radio', podcasts: 'Podcasts', local: 'Grabber' };
  const map = new Map();
  for (const it of items) {
    const key = it.sectionId || `auto:${it.sectionTitle || it.type}`;
    const name = it.sectionTitle || it.type || 'Media';
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, {
      key, name, count: 1, source: it.source,
      sourceLabel: storeName.get(it.source) || instName.get(it.source) || SRC[it.source] || it.source   // t87/88/97: "Bob's Plex · Movies" / "Dave's store"
    });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// Look one item up in the cached catalogue (used by the poster proxy so the
// browser can request /img/plex/12345.png without ever seeing tokens).
export async function findItem(source, key, view = null) {
  const items = await getLibrary(false, view);
  return items.find(i => i.source === source && i.key === key) || null;
}

// Poster URL on the upstream media server (token-embedded — server-side only!).
export async function posterUrlFor(source, key, view = null) {
  const item = await findItem(source, key, view);
  if (!item) return null;
  const sc = sourceConfig(source);            // t87: instance or built-in
  if (!sc?.adapter?.posterUrl) return null;
  try { return sc.adapter.posterUrl(sc.cfg, item); }
  catch { return null; }
}

// Upstream stream URL for the in-store TV (server-side only).
export async function streamUrlFor(source, key) {
  const sc = sourceConfig(source);            // t87: instance or built-in
  if (!sc?.adapter?.streamUrl) return null;
  try { return await sc.adapter.streamUrl(sc.cfg, key); }
  catch { return null; }
}

// Small helper for /api/bootstrap — one friendly status line for the UI that
// summarises EVERY enabled source ("Plex + Archive + Radio").
export async function libraryStatus() {
  const cfg = getConfig();
  const names = [];
  let error = null;
  for (const cat of CATALOGUE.slice(1)) {
    if (cfg.sources?.[cat.key] !== true) continue;
    const missing = cat.missing?.(cfg);
    if (missing) { error = missing; continue; }
    try {
      const t = await cat.adapter.test(cfg[cat.key]);
      names.push(t.name || cat.adapter.name);
    } catch (e) { error = e.message; }
  }
  if (cfg.archive?.sections?.length) names.push('Archive');
  if (cfg.radio?.sections?.length) names.push('Radio');
  if (cfg.podcasts?.feeds?.length) names.push('Podcasts');
  if (!names.length && !error) {
    return { source: 'multi', label: 'No sources', ok: false, error: 'Nothing is enabled — pick what to shelve in Admin → Server.' };
  }
  return { source: 'multi', label: names.join(' + '), ok: !error, error: error || undefined };
}
