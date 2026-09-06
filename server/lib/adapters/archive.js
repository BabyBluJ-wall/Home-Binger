// ─────────────────────────────────────────────────────────────────────────────
//  adapters/archive.js — the "Classics wing": public-domain films from the
//  Internet Archive (archive.org)
// ─────────────────────────────────────────────────────────────────────────────
//  100% free, 100% legal, no account, no API key. The Archive's advanced
//  search API returns real identifiers; posters come from their official
//  /services/img endpoint; files stream as plain MP4s (h.264 derivatives).
//  Sections here are CURATED CATEGORIES (Staff Picks = the most-downloaded
//  feature films — which, delightfully, are exactly the famous ones:
//  Night of the Living Dead, His Girl Friday, Nosferatu, Plan 9…).
//
//  cfg: { sections: [categoryKey, …] }  — [] means NO archive shelves.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = 'https://archive.org';
const base = (cfg) => (/^https?:\/\//.test(cfg?.url || '') ? cfg.url.replace(/\/$/, '') : BASE);

// ⚙️ EDIT ME — the Classics wing's categories (key → Archive search).
// (collection ids are CASE-SENSITIVE — these are verified against the live API)
const CATEGORIES = [
  { key: 'staff-picks',  title: 'Staff Picks',       q: 'collection:(feature_films) AND mediatype:(movies)', sort: 'downloads desc' },
  { key: 'sci-fi-horror', title: 'Sci-Fi & Horror',  q: 'collection:(SciFi_Horror)',                        sort: 'downloads desc' },
  { key: 'noir',         title: 'Film Noir',         q: 'collection:(feature_films) AND subject:("film noir")', sort: 'downloads desc' },
  { key: 'comedy',       title: 'Comedy Classics',   q: 'collection:(feature_films) AND subject:(comedy)',  sort: 'downloads desc' },
  { key: 'cartoons',     title: 'Saturday Cartoons', q: 'collection:(animationandcartoons)',                sort: 'downloads desc' },
  { key: 'westerns',     title: 'Westerns',          q: 'collection:(feature_films) AND subject:(western)',  sort: 'downloads desc' },
  { key: 'serials',      title: 'Cliffhanger Serials', q: 'collection:(feature_films) AND subject:(serial)', sort: 'downloads desc' }
];
// Family-store filter: the Archive's most-downloaded lists include a few
// vintage "adults-only" exploitation titles — keep those off our shelves.
const FAMILY_FILTER = /\b(sex|nude|nudity|naked|xxx|porn)\b/i;
const ROWS = 24;                     // titles per category
const CACHE_TTL = 10 * 60 * 1000;    // re-query the Archive at most every 10 min
const catCache = new Map();          // catKey → { at, items }

export const CATALOG_SECTIONS = CATEGORIES;   // (used by tests)

async function jget(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'home-binger/1.0 (video store for personal media servers)' }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`Archive HTTP ${r.status}`);
  return r.json();
}

async function category(cat, cfg, catIndex = 0) {
  const ck = `${base(cfg)}|${cat.key}`;      // cache per base URL (tests/mirrors vs real)
  const hit = catCache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.items;
  const params = new URLSearchParams({
    q: cat.q, rows: String(ROWS), page: '1', output: 'json'
  });
  for (const f of ['identifier', 'title', 'year', 'description', 'downloads', 'subject'])
    params.append('fl[]', f);
  params.append('sort[]', cat.sort);
  const docs = (await jget(`${base(cfg)}/advancedsearch.php?${params}`))?.response?.docs || [];
  const NOW = Math.floor(Date.now() / 1000);
  const items = docs.filter(d => d.identifier && !FAMILY_FILTER.test(String(d.title || ''))).map((d, i) => {
    const year = parseInt(d.year, 10);
    return {
      id: `archive:${d.identifier}`,
      source: 'archive',
      key: String(d.identifier),
      type: 'movie',
      title: String(d.title || d.identifier).replace(/\s+/g, ' ').trim(),
      year: Number.isFinite(year) && year > 1800 && year < 2100 ? year : null,
      rating: null,
      // Real SECONDS (downloads-as-timestamps read as 1970 and sank the whole
      // free wing below the display cap). A descending band keeps popularity
      // order WITHIN a category and puts fresh free stock first overall.
      addedAt: NOW - (catIndex * ROWS + i) * 60,
      genres: [cat.title, 'Public Domain'],
      summary: String(d.description || '').replace(/<[^>]*>/g, '').slice(0, 400) || null,
      sectionId: `archive:${cat.key}`,
      sectionTitle: cat.title
    };
  });
  catCache.set(ck, { at: Date.now(), items });
  return items;
}

export const archiveAdapter = {
  name: 'Internet Archive',

  // The admin panel's category checkbox list (no creds to load — it's static).
  libraries() {
    return { libraries: CATEGORIES.map(c => ({ key: c.key, title: c.title, type: 'Public domain · free' })) };
  },

  async library(cfg) {
    const wanted = Array.isArray(cfg.sections) && cfg.sections.length
      ? CATEGORIES.filter(c => cfg.sections.includes(c.key))
      : [];
    // category INDEX offsets each block so parallel fetches can't interleave
    const lists = await Promise.all(wanted.map((c, ci) => category(c, cfg, ci).catch(e => {
      console.warn(`[archive] category "${c.key}" failed: ${e.message}`);
      return [];
    })));
    return lists.flat();
  },

  // Pick the best playable file: prefer the h.264 MP4 derivative, biggest first.
  async streamUrl(cfg, key) {
    if (!/^[\w.-]+$/.test(key)) return null;           // identifiers are slugs — reject junk
    let meta;
    try { meta = await jget(`${base(cfg)}/metadata/${key}`); }
    catch { return null; }
    const files = (meta?.files || []).filter(f => /\.mp4$/i.test(f.name || ''));
    if (!files.length) return null;
    files.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
    const pick = files.find(f => (f.name || '').includes('h.264')) || files[0];
    return `${base(cfg)}/download/${key}/${encodeURIComponent(pick.name)}`;
  },

  // Movies play through the video path — no audio-only resolution needed.
  audioUrl() { return null; },

  async detail(cfg, key) {
    if (!/^[\w.-]+$/.test(key)) return null;
    let meta;
    try { meta = await jget(`${base(cfg)}/metadata/${key}`); }
    catch { return null; }
    const files = (meta?.files || []).filter(f => /\.mp4$/i.test(f.name || ''));
    return {
      title: meta?.metadata?.title || key,
      year: parseInt(meta?.metadata?.year, 10) || null,
      summary: String(meta?.metadata?.description || '').replace(/<[^>]*>/g, '').slice(0, 600) || null,
      runtime: null,
      playUrl: `${BASE}/details/${key}`
    };
  },

  posterUrl(cfg, item) {
    return `${base(cfg)}/services/img/${item.key}`;
  }
};
