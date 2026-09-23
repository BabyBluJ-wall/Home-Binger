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
import { loadEpg, nowNext } from './epg.js';   // t139: real program data (XMLTV)

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

// ── t138: EXTRA CHANNEL PACKS — every pack is a PROVIDER page in the Guide ──
// Owner: "take the live tv from Tubi, Pluto, Teleon, hulu, and any other
// source… no duplicate channels… organized by provider and by genre." The
// free ad-supported (FAST) world publishes its channels as plain .m3u
// playlists — daily-regenerated mirrors at github.com/BuddyChewChew cover
// Pluto TV, Samsung TV Plus, The Roku Channel, Tubi and Plex. Hulu is paid
// + DRM and stays OUT (nothing legal to point at); Teleon is a listings
// site, not a stream source. Any http(s) .m3u of HLS channels works.
//
// Each pack rides the Guide as its own PROVIDER page AND folds into the
// genre pages; duplicates across packs (about a third of any two FAST
// lineups) are removed — first pack in the admin's order wins, and a
// dropped twin donates its genre/languages when the keeper has none
// (Plex's pack carries no genre data; Samsung's copy of the same channel
// does). Playback rides the same signed proxy as every live channel.
const PLAYLIST_TTL = 2 * 60 * 60 * 1000;   // packs regenerate daily with fresh tokens; 2h keeps them healthy
const playlistCache = new Map();           // url → { at, entries }

// t138: CANONICAL GENRES — providers use 68+ raw group labels ("Home + Food",
// "Home & Food", "Daytime + Game Shows"…); the Guide gets the clean paper set.
const GENRES = ['News', 'Movies', 'Series', 'Entertainment', 'Kids', 'Anime',
  'Documentary', 'Sports', 'Music', 'Comedy', 'Reality', 'Crime',
  'Sci-Fi & Horror', 'Food & Home', 'Latino', 'Faith', 'Classic TV', 'Public Broadcasters'];
const GENRE_RULES = [
  [/news|weather|opinion/i, 'News'],
  [/movie/i, 'Movies'],
  [/crime|mystery|law|legal/i, 'Crime'],
  [/sci-?fi|horror|paranormal|supernatural/i, 'Sci-Fi & Horror'],
  [/faith/i, 'Faith'],
  [/anime|animation/i, 'Anime'],
  [/kid|famil|children|animated/i, 'Kids'],
  [/documentar|history|science|nature|animal|environment|education/i, 'Documentary'],
  [/sport|motor|wrestling|basketball|outdoor/i, 'Sports'],
  [/music/i, 'Music'],
  [/comedy/i, 'Comedy'],
  [/reality|game ?shows?|games? & comp|competition/i, 'Reality'],
  [/espanol|latino|hispanic/i, 'Latino'],
  [/home|food|cook|garden|improvement|eats|lifestyle|health/i, 'Food & Home'],
  [/entertainment|pop culture|variety|talk|shopping|ambiance|auction|gaming|tech|card game/i, 'Entertainment'],
  [/series|drama|western|action|classic tv|sitcom/i, 'Series'],
];
function canonGenre(label) {
  const s = String(label || '').trim();
  if (!s) return null;
  if (GENRES.includes(s)) return s;                 // directory section titles are already the clean set
  for (const [re, canon] of GENRE_RULES) if (re.test(s)) return canon;
  return null;                                      // honest: no genre rather than a wrong one
}

// t138: the admin's pack list (plus the t137 single-playlist legacy fold)
function packsOf(cfg) {
  const packs = [];
  const seen = new Set();
  for (const p of (Array.isArray(cfg?.packs) ? cfg.packs : [])) {
    if (!p || typeof p !== 'object') continue;
    const url = /^https?:\/\//.test(p.url || '') ? String(p.url).slice(0, 500) : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const epg = /^https?:\//.test(p.epg || '') ? String(p.epg).slice(0, 500) : null;   // t139: optional per-pack EPG override (advanced/tests)
    packs.push({ label: String(p.label || '').trim().slice(0, 24) || `Pack ${packs.length + 1}`, url, epg });
  }
  if (!packs.length && /^https?:\/\//.test(cfg?.playlistUrl || '')) {
    packs.push({ label: 'Plex Free', url: String(cfg.playlistUrl).slice(0, 500) });   // t137 configs keep working
  }
  return packs;
}

// t138+t144: NO DUPLICATES — normalize channel names for cross-pack matching.
// v1 kept spaces, so real-world twins never matched ("Danger TV" on Samsung
// vs "DangerTV" on Roku; "Pluto TV Estrella" vs "EstrellaTV"). v2 strips
// provider prefixes, LOOP-strips quality/directional suffixes, then removes
// ALL spaces for the key. The pack's COUNTRY (from the playlist filename)
// rides the key so regional feeds of the same name stay SEPARATE (US "Comet"
// ≠ GB "Comet").
const PROV_PREFIXES = ['pluto tv', 'samsung tv plus', 'the roku channel', 'roku channel',
  'plex free', 'amazon freevee', 'rakuten tv', 'pluto', 'samsung', 'roku', 'tubi', 'plex',
  'xumo', 'stirr', 'redbox', 'rakuten', 'freevee'];
const NAME_SUFFIXES = ['hd', 'fhd', 'uhd', 'sd', '4k', '720p', '1080p', '2160p',
  'east', 'eastern', 'west', 'western', 'pacific', 'us', 'usa'];
function normName(s) {
  let n = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (let round = 0; round < 4; round++) {
    let again = false;
    for (const suf of NAME_SUFFIXES) if (n === suf || n.endsWith(' ' + suf)) { n = n === suf ? '' : n.slice(0, -suf.length).trim(); again = true; break; }
    if (!again) for (const pre of PROV_PREFIXES) if (n === pre || n.startsWith(pre + ' ')) { n = n === pre ? '' : n.slice(pre.length).trim(); again = true; break; }
    if (!again) break;
  }
  return n.replace(/ /g, '');   // spaceless: "Danger TV" == "DangerTV"
}
// t144: the country a pack belongs to, inferred from the mirror's filename
// (plutotv_gb.m3u → 'gb'; roku_all.m3u / custom URLs → '' = name-only tier)
function packCountryOf(url) {
  const m = String(url || '').match(/_([a-z]{2})\.m3u/i);
  return m ? m[1].toLowerCase() : '';
}

async function loadPackEntries(url) {
  const hit = playlistCache.get(url);
  if (hit && Date.now() - hit.at < PLAYLIST_TTL) return hit.entries;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'home-binger/1.0 (free live TV rack for personal media servers)' },
    signal: AbortSignal.timeout(20000), redirect: 'follow'
  });
  if (!r.ok) throw new Error(`playlist HTTP ${r.status}`);
  const text = await r.text();
  const entries = [];
  const seen = new Set();                  // playlists often mirror the same channel under several URLs
  let pend = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      pend = {
        name: (line.match(/tvg-name="([^"]*)"/)?.[1] || line.split(',').slice(1).join(',').trim() || '').replace(/\s+/g, ' ').trim(),
        group: line.match(/group-title="([^"]*)"/)?.[1] || '',
        epgId: line.match(/tvg-id="([^"]*)"/)?.[1] || '',                    // t139: XMLTV channel id (real program data)
        chno: (line.match(/tvg-chno="(\d+)"/)?.[1] || ''),                   // t139: the provider's own channel number
        logo: line.match(/tvg-logo="([^"]*)"/)?.[1] || '',                   // t139: the provider's channel logo
        langs: line.match(/tvg-language="([^"]*)"/)?.[1] || ''               // t139c: language metadata (when the pack carries it)
      };
    } else if (pend && /^https?:\/\//i.test(line)) {
      if (pend.name && !seen.has(pend.name.toLowerCase())) {
        seen.add(pend.name.toLowerCase());
        entries.push({ name: pend.name, url: line, group: pend.group, epgId: pend.epgId, chno: pend.chno, logo: pend.logo, langs: pend.langs });
      }
      pend = null;
    } else if (!line.startsWith('#')) {
      pend = null;                         // an EXTINF with no usable URL after it — skip the pair
    }
  }
  const out = { at: Date.now(), entries };
  playlistCache.set(url, out);
  return entries;
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

// ── t139: EPG — the known packs' real program data (XMLTV mirrors) ──────────
// Matched by exact playlist URL. Custom packs can carry their own `epg`
// (advanced). No match → the channel keeps the honest ● LIVE line.
const KNOWN_EPG = new Map([
  ['https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plutotv_us.m3u', 'https://i.mjh.nz/PlutoTV/us.xml.gz'],
  ['https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/samsungtvplus_us.m3u', 'https://i.mjh.nz/SamsungTVPlus/us.xml.gz'],
  ['https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/roku_all.m3u', 'https://i.mjh.nz/Roku/all.xml.gz'],
  ['https://raw.githubusercontent.com/BuddyChewChew/plex/main/playlists/plex_us.m3u', 'https://i.mjh.nz/Plex/us.xml.gz'],
  ['https://raw.githubusercontent.com/BuddyChewChew/tubi-scraper/refs/heads/main/tubi_playlist.m3u', 'https://raw.githubusercontent.com/BuddyChewChew/tubi-scraper/refs/heads/main/tubi_epg.xml'],
]);
const epgIndex = [];            // rebuilt on every library() build: { key, channelId, epgUrl }
let epgSnap = null;             // { at, epg } — computed view, cached 60s

// The Guide calls this on open: { at, epg: { [itemKey]: { now:{t,s,e,ep,d}, next:{t,s,e} } } }
// One dead source degrades quietly — its channels keep the ● LIVE line.
// t140: pass `at` (epoch ms) to get the slice AT that time instead — the
// programme airing then (+ the one after). This is the Guide's time travel:
// the whole 8-hour future window is browseable hour by hour, like flipping
// a paper guide. (Data is windowed 1h back → 8h ahead; `at` is clamped there.)
export async function epgSnapshot(at = 0) {
  const realNow = Date.now();
  const slice = Number(at) > 0
    ? Math.max(realNow - 55 * 60000, Math.min(Number(at), realNow + 8 * 3600e3 - 60000))
    : 0;
  const build = async (t) => {
    const bySource = new Map();   // epgUrl → [{ key, channelId }]
    for (const it of epgIndex) {
      if (!bySource.has(it.epgUrl)) bySource.set(it.epgUrl, []);
      bySource.get(it.epgUrl).push(it);
    }
    const epg = {};
    await Promise.all([...bySource.entries()].map(async ([url, items]) => {
      let data;
      try { data = await loadEpg(url); }
      catch (e) { console.warn(`[iptv] EPG ${url} failed: ${e.message}`); return; }
      for (const { key, channelId } of items) {
        const nn = nowNext(data.byChannel.get(channelId), t || undefined);
        if (nn) epg[key] = nn;
      }
    }));
    return epg;
  };
  if (!slice) {
    if (epgSnap && Date.now() - epgSnap.at < 60000) return epgSnap;
    const epg = await build(0);
    epgSnap = { at: Date.now(), epg };
    return epgSnap;
  }
  // a future (or barely-past) slice — recomputed per call from the 6h XML
  // cache (cheap: ~a thousand nowNext lookups) so no second cache is needed
  return { at: realNow, sel: slice, epg: await build(slice) };
}

// t144: the last dedupe pass — /api/library surfaces it so the admin can SEE
// the duplicate remover working ("N duplicate channels hidden automatically")
let dedupeStats = { removed: 0, kept: 0, at: 0 };
export function iptvStats() { return { ...dedupeStats }; }

export const iptvAdapter = {
  name: 'Live TV',

  async libraries() {
    return { libraries: GROUPS.filter(g => g.key !== 'public' || true).map(g => ({ key: g.key, title: g.title, type: 'live' })) };
  },

  async library(cfg) {
    const base = (/^https?:\/\//.test(cfg.url || '') ? cfg.url : API_BASE).replace(/\/+$/, '');
    const unverified = cfg.unverified === true;
    const wanted = new Set(Array.isArray(cfg.sections) ? cfg.sections.map(String) : []);
    const packs = packsOf(cfg);            // t138: provider packs (any .m3u; the t137 single URL folds in)
    epgIndex.length = 0;                  // t139: rebuilt below as pack items assemble
    epgSnap = null;                       // …and the EPG view recomputes on next request
    if (!wanted.size && !packs.length) return [];
    let out = [];
    let channels = [], streams = [], langMap = null;
    if (wanted.size) {
      ({ channels, streams, langMap } = await loadFeeds(base));
    }
    const byId = new Map(channels.map(c => [c.id, c]));

    // best stream per channel: https first, then any
    const best = new Map();
    for (const s of streams) {
      if (!s.channel || !/^https?:\/\//i.test(s.url || '')) continue;
      const cur = best.get(s.channel);
      const isHttps = s.url.startsWith('https://');
      if (!cur || (isHttps && !cur.https)) best.set(s.channel, { url: s.url, https: isHttps });
    }

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
        provider: 'Directory',                   // t138: the Guide's provider axis
        genre: canonGenre(gTitle),               // t138: the Guide's genre axis
        guideOnly: true,          // NEVER shelved (owner order) — Guide + /m only
        langs: langMap?.get(c.id) ? [...langMap.get(c.id)] : [],   // t127: language pages
        tvgId: String(c.id || '').toLowerCase(),   // t144: id dedupe when the namespace is shared (iptv-org style)
        mediaUrl: st.url          // server-side only (stripped by /api/library)
      });
    }
    // t138: the extra channel packs — each a PROVIDER page in the Guide.
    // Packs load in parallel; one dead pack degrades quietly (the Guide
    // keeps its other pages and the rest of the packs).
    const packItems = [];
    if (packs.length) {
      const results = await Promise.allSettled(packs.map(p => loadPackEntries(p.url)));
      results.forEach((res, pi) => {
        if (res.status === 'rejected') {
          console.warn(`[iptv] channel pack "${packs[pi].label}" failed: ${res.reason?.message || res.reason}`);
          return;
        }
        const epgUrl = packs[pi].epg || KNOWN_EPG.get(packs[pi].url) || null;   // t139: real program data, when the source has it
        for (const e of res.value) {
          // t139: STABLE KEYS — hashed from provider+name, NOT the stream URL.
          // Pack URLs carry rotating tokens (regenerated daily); keying on
          // the URL made every favorite/offline mark vanish each regeneration.
          // registry still maps the key to the CURRENT url.
          const key = `lp${h(packs[pi].label + '|' + e.name).slice(0, 12)}`;
          registry.set(key, e.url);
          if (epgUrl && e.epgId) epgIndex.push({ key, channelId: e.epgId, epgUrl });
          packItems.push({
            id: `iptv:${key}`, source: 'iptv', key, type: 'live',
            title: e.name,
            year: null, rating: null, addedAt: 0,
            genres: [packs[pi].label],
            sectionId: `iptv:pack${h(packs[pi].url).slice(0, 8)}`, sectionTitle: packs[pi].label,
            provider: packs[pi].label,                 // t138: the Guide's provider axis
            genre: canonGenre(e.group),                // t138: the Guide's genre axis (null = All page only)
            chno: e.chno || null,                      // t139: the provider's own channel number (e.g. 104)
            logo: e.logo || null,                      // t139: the provider's channel logo
            guideOnly: true,                           // same doctrine: live TV lives in the Guide, never the shelves
            langs: e.langs ? e.langs.split(/[;,/]\s*/).map(s => s.trim()).filter(Boolean).slice(0, 4) : [],   // t139c
            tvgId: String(e.epgId || '').toLowerCase(),   // t144: id dedupe (provider-internal hashes have no dot and never match cross-provider — harmless)
            packCountry: packCountryOf(packs[pi].url),     // t144: regional feeds of the same name stay separate
            mediaUrl: e.url                            // server-side only (stripped by /api/library)
          });
        }
      });
    }
    // t138+t144: NO DUPLICATES across packs and directory — packs first in
    // the admin's order (= priority), the directory backing them up; a
    // dropped twin donates its genre/languages when the keeper has none.
    // t144 v2: match by shared-namespace tvg-id ("ABCNews.us") OR by the
    // spaceless normalized name within the SAME country; count every merge.
    const merged = [];
    const byName = new Map();     // spaceless name → Map(country → merged index)
    const seenTvg = new Map();    // dotted tvg-id → merged index (strongest signal)
    let dedupeRemoved = 0;
    // Same name merges when the countries AGREE — or when either side is
    // untagged (a custom/roku/tubi playlist has no country, so it's a
    // wildcard: it twins with the first family member). Two DIFFERENT tagged
    // countries (US vs GB feeds of the same name) stay SEPARATE channels.
    const addMerged = (it, country) => {
      const k = normName(it.title);
      const tv = it.tvgId || '';
      let at = tv.includes('.') ? seenTvg.get(tv) : undefined;
      if (at === undefined && k.length >= 4) {
        const fam = byName.get(k);
        if (fam) {
          at = fam.get(country);
          if (at === undefined && country === '') at = [...fam.values()][0];   // untagged → first keeper
          else if (at === undefined) at = fam.get('');                          // tagged → an untagged keeper
        }
      }
      if (at === undefined) {
        if (tv.includes('.')) seenTvg.set(tv, merged.length);
        if (k.length >= 4) { const fam = byName.get(k) || new Map(); fam.set(country, merged.length); byName.set(k, fam); }
        merged.push(it); return;
      }
      const keep = merged[at];
      if (!keep.genre && it.genre) keep.genre = it.genre;
      if (!(keep.langs || []).length && (it.langs || []).length) keep.langs = it.langs;
      dedupeRemoved++;
    };
    for (const it of packItems) addMerged(it, it.packCountry || '');
    for (const it of out) addMerged(it, '');
    out = merged;
    dedupeStats = { removed: dedupeRemoved, kept: merged.length, at: Date.now() };   // t144: surfaced in /api/library
    // t139: the EPG index tracks only the channels that SURVIVED dedupe
    if (epgIndex.length) {
      const keep = new Set(out.map(i => i.key));
      for (let i = epgIndex.length - 1; i >= 0; i--) if (!keep.has(epgIndex[i].key)) epgIndex.splice(i, 1);
    }
    // stable, browsable order: group, then CURATED FIRST, then name (t125: with
    // the unverified tier on, the officially-free channels keep the front rows —
    // main listings before extended listings, like the old paper guides)
    // stable, browsable order: the Guide's genre pages (canonical order),
    // then provider (the admin's priority order), curated-first, then name.
    // Un-genred channels (a pack with no genre data) sort to the end — they
    // live on the All page and their provider's page.
    const genreRank = (g) => { const i = GENRES.indexOf(g); return i < 0 ? GENRES.length + 1 : i; };
    const provRank = new Map(packs.map((p, i) => [p.label, i]));
    provRank.set('Directory', packs.length);
    out.sort((a, b) => genreRank(a.genre) - genreRank(b.genre)
      || (provRank.get(a.provider) ?? 99) - (provRank.get(b.provider) ?? 99)
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
    // t138: Plex variant URLs run ~2.6KB (token-heavy) — 4KB is still a sane ceiling
    if (up.length > 4096 || !/^https?:\/\//i.test(up)) { res.writeHead(400); return res.end('bad segment URL'); }
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
