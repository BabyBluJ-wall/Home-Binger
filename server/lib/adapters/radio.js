// ─────────────────────────────────────────────────────────────────────────────
//  adapters/radio.js — the "world radio wall": live stations from the
//  community-run Radio-Browser database (radio-browser.info)
// ─────────────────────────────────────────────────────────────────────────────
//  Free, open, no API key. We search per genre, keep the most-upvoted
//  working MP3 streams, and proxy them through this server (Web Audio needs
//  same-origin media for the visualizer; also hides listeners from stations).
//
//  cfg: { sections: [genreKey, …] }  — [] means no radio shelf.
//
//  Keys are hashes backed by the registry below (only stations returned by
//  Radio-Browser ever become playable — no open-proxy abuse).
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

// ⚙️ EDIT ME — the radio wall's genre buttons. Tags are Radio-Browser tags.
const GENRES = [
  { key: 'oldies',      title: 'Oldies',        tag: 'oldies' },
  { key: 'synthwave',   title: 'Synthwave',     tag: 'synthwave' },
  { key: 'jazz',        title: 'Jazz',          tag: 'jazz' },
  { key: 'classical',   title: 'Classical',     tag: 'classical' },
  { key: 'classic-rock', title: 'Classic Rock', tag: 'classic rock' },
  { key: 'country',     title: 'Country',       tag: 'country' }
];
const STATIONS_PER_GENRE = 8;
const CACHE_TTL = 10 * 60 * 1000;
const genreCache = new Map();
const registry = new Map();      // stationKey → stream URL

const h = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
const API = 'https://de1.api.radio-browser.info/json/stations/search';
const apiBase = (cfg) => (/^https?:\/\//.test(cfg?.url || '') ? cfg.url.replace(/\/$/, '') : 'https://de1.api.radio-browser.info');

function pickStream(s) {
  const url = s.url_resolved || s.url || '';
  return /^https?:\/\//i.test(url) ? url : null;
}

async function genre(g, cfg, genreIndex = 0) {
  const ck = `${apiBase(cfg)}|${g.key}`;      // cache per base URL (tests/mirrors vs real)
  const hit = genreCache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;
  const params = new URLSearchParams({
    tag: g.tag, limit: String(STATIONS_PER_GENRE * 3), hidebroken: 'true',
    order: 'votes', reverse: 'true'
  });
  const r = await fetch(`${apiBase(cfg)}/json/stations/search?${params}`, {
    headers: { 'User-Agent': 'home-binger/1.0 (radio wall for personal media servers)' },
    signal: AbortSignal.timeout(12000)
  });
  if (!r.ok) throw new Error(`radio-browser HTTP ${r.status}`);
  const stations = await r.json();
  const items = [];
  const seenNames = new Set();       // same station often mirrors under several URLs
  for (const s of stations) {
    const nameKey = String(s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (nameKey && seenNames.has(nameKey)) continue;
    const url = pickStream(s);
    if (!url) continue;
    // MP3/AAC direct streams only — HLS (.m3u8) won't play in a plain <audio>.
    const low = url.toLowerCase();
    if (/\.(m3u8|pls|asx|xspf)(\?|$)/.test(low) || /m3u8/.test((s.codec || '').toLowerCase())) continue;
    const key = `rs${h(url).slice(0, 12)}`;
    seenNames.add(nameKey);
    registry.set(key, url);
    items.push({
      id: `radio:${key}`,
      source: 'radio',
      key,
      type: 'radio',
      title: String(s.name || 'Station').replace(/\s+/g, ' ').trim(),
      year: null,
      rating: null,
      addedAt: Math.floor(Date.now() / 1000) - (genreIndex * STATIONS_PER_GENRE + items.length) * 60,   // real seconds, block-kept
      genres: ['Live Radio', g.title],
      sectionId: `radio:${g.key}`,
      sectionTitle: `Radio · ${g.title}`,
      mediaUrl: url,                 // server-side only
      artUrl: /^https?:\/\//i.test(s.favicon || '') ? s.favicon : null,
      codec: s.codec || null,        // 'MP3' / 'AAC' — shown in the item modal
      bitrate: Number(s.bitrate) || 0,
      country: s.countrycode || null
    });
    if (items.length >= STATIONS_PER_GENRE) break;
  }
  genreCache.set(ck, { at: Date.now(), items });
  return items;
}

export const radioAdapter = {
  name: 'Live Radio',

  libraries() {
    return { libraries: GENRES.map(g => ({ key: g.key, title: g.title, type: 'Live stations · free' })) };
  },

  async library(cfg) {
    const wanted = Array.isArray(cfg.sections) && cfg.sections.length
      ? GENRES.filter(g => cfg.sections.includes(g.key)) : [];
    const lists = await Promise.all(wanted.map((g, gi) => genre(g, cfg, gi).catch(e => {
      console.warn(`[radio] genre "${g.key}" failed: ${e.message}`);
      return [];
    })));
    return lists.flat();
  },

  streamUrl(cfg, key) { return registry.get(key) || null; },
  audioUrl(cfg, key) { return registry.get(key) || null; },   // live audio → visualizer path

  async detail(cfg, key) {
    const url = registry.get(key);
    if (!url) return null;
    return { title: 'Live station', summary: 'Live stream — plays until you stop or pick something else.', playUrl: null };
  },

  posterUrl(cfg, item) { return item.artUrl || null; }
};

export { GENRES };
