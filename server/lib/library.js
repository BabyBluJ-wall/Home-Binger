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
  };
}

// ⚙️ EDIT ME — how long a fetched library is cached before re-querying the
// media server (ms). Lower = fresher, higher = less load on Plex/Jellyfin.
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = new Map();   // sig → { at, items } — one slot per distinct media mix

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
  const map = new Map();
  for (const it of items) {
    const key = it.sectionId || `auto:${it.sectionTitle || it.type}`;
    const name = it.sectionTitle || it.type || 'Media';
    map.set(key, { key, name, count: (map.get(key)?.count || 0) + 1 });
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
  const cfg = getConfig();
  const item = await findItem(source, key, view);
  if (!item) return null;
  const adapter = ADAPTERS[source];
  if (!adapter?.posterUrl) return null;
  try { return adapter.posterUrl(cfg[source] || {}, item); }
  catch { return null; }
}

// Upstream stream URL for the in-store TV (server-side only).
export async function streamUrlFor(source, key) {
  const cfg = getConfig();
  const adapter = ADAPTERS[source];
  if (!adapter?.streamUrl) return null;
  try { return await adapter.streamUrl(cfg[source] || {}, key); }
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
