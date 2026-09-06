// ─────────────────────────────────────────────────────────────────────────────
//  adapters/plex.js — Plex Media Server adapter
// ─────────────────────────────────────────────────────────────────────────────
//  Talks to the Plex HTTP API. The API token NEVER leaves this process —
//  the browser only ever sees relative URLs like /img/plex/<id>.
//
//  Getting a Plex token (documented in README → "Connecting Plex"):
//    1. Open Plex Web → Settings → … or visit https://plex.tv/devices
//    2. Easiest reliable method: view a library item in Plex Web and read
//       X-Plex-Token from the URL, or sign in at plex.tv and pull the token
//       from any request. (Full walkthrough in the README.)
// ─────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10000;

function base(cfg) {
  let url = String(cfg.url || '').trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//.test(url)) url = 'http://' + url;
  // People often paste the Plex WEB APP url (…:32400/web) — the API lives at
  // the root, so strip a trailing /web or /index.html. Same server, right URL.
  url = url.replace(/\/web$/i, '').replace(/\/index(\.html)?$/i, '').replace(/\/+$/, '');
  return url;
}

// Turn raw fetch failures into a message that tells the user what to FIX.
function friendlyNetError(err, root) {
  if (err?.name === 'AbortError') return `Plex at ${root || 'that URL'} didn't respond within ${TIMEOUT_MS / 1000} s — check the IP/port (usually 32400) and that Plex is running.`;
  if (err instanceof TypeError || /fetch failed|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH/i.test(String(err?.message || '')))
    return `Can't reach ${root || 'that URL'} — is the address right, and is this machine on the same network as Plex?`;
  return `Plex connection failed: ${err?.message || err}`;
}

// Central request helper — adds the token, JSON accept-header and a timeout.
async function plexFetch(cfg, pathname, params = {}) {
  const root = base(cfg);
  if (!root) throw new Error('Plex URL is not configured');
  if (!cfg.token) throw new Error('Plex token is not configured');
  const u = new URL(root + pathname);
  u.searchParams.set('X-Plex-Token', cfg.token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res;
    try {
      res = await fetch(u, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    } catch (netErr) {
      throw new Error(friendlyNetError(netErr, root));
    }
    if (res.status === 401) throw new Error('Plex rejected the token (401) — paste a fresh X-Plex-Token (steps in the README).');
    if (res.status === 404) throw new Error(`Plex returned 404 for ${pathname} — this doesn't look like a Plex server URL.`);
    if (!res.ok) throw new Error(`Plex HTTP ${res.status} for ${pathname}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('Plex returned a non-JSON response — is this really a Plex server URL? (a /web suffix is stripped automatically, but double-check the address)');
    return await res.json();
  } finally { clearTimeout(t); }
}

// Section types we stock on shelves. 'artist' sections are listed as albums
// (CD cases), 'musicvideo' sections map to the music-video type.
const SECTION_TYPES = ['movie', 'show', 'artist', 'musicvideo'];
const TYPE_LABEL = { movie: 'movie', show: 'show', artist: 'album', album: 'album', musicvideo: 'musicvideo' };

export const plexAdapter = {
  name: 'Plex',

  // Quick connectivity + auth check used by the admin "Test connection" button.
  async test(cfg) {
    // 1) /identity proves reachability AND token in ONE call.
    await plexFetch(cfg, '/identity');
    // 2) Everything else is best-effort — a success here shouldn't fail the
    //    test just because library listing hiccups.
    let name = 'Plex Server', detail = 'Connected';
    try {
      const rootJson = await plexFetch(cfg, '/');
      name = rootJson?.MediaContainer?.friendlyName || name;
    } catch { /* keep default name */ }
    try {
      const sections = await plexFetch(cfg, '/library/sections');
      const dirs = sections?.MediaContainer?.Directory || [];
      const usable = dirs.filter(d => SECTION_TYPES.includes(d.type));
      detail = `${usable.length} usable librar${usable.length === 1 ? 'y' : 'ies'} (${usable.map(d => d.title).join(', ') || 'none'})`;
    } catch { /* non-fatal */ }
    try {
      const lv = await plexFetch(cfg, '/livetv/epg/channels', {
        'X-Plex-Container-Size': '1', 'X-Plex-Container-Start': '0'
      });
      const n = lv?.MediaContainer?.totalSize || 0;
      if (n) detail += ` · ${n} live TV channels`;
    } catch { /* no tuner */ }
    return { ok: true, name, detail };
  },

  // Fetch EVERY usable section's items and normalise them to our item shape.
  // Libraries are PAGINATED (2 000 per page) so even huge servers load ALL
  // their media — not just the first page — and DVR Live-TV channels are
  // appended as browsable 'live' items when the server has a tuner.
  // List the server's libraries (Admin → Server checkbox picker).
  async libraries(cfg) {
    const sectionsJson = await plexFetch(cfg, '/library/sections');
    return (sectionsJson?.MediaContainer?.Directory || [])
      .filter(d => SECTION_TYPES.includes(d.type))
      .map(d => ({ key: String(d.key), title: d.title || d.key, type: d.type }));
  },

  async library(cfg) {
    const sectionsJson = await plexFetch(cfg, '/library/sections');
    let dirs = (sectionsJson?.MediaContainer?.Directory || []).filter(d => SECTION_TYPES.includes(d.type));
    // SHELF ONLY THE PICKED LIBRARIES — an EMPTY selection means NONE.
    // (It used to mean "everything", which made unchecking every box do
    // nothing — the exact opposite of what the UI promises.)
    const picked = Array.isArray(cfg.sections) ? cfg.sections.map(String) : [];
    dirs = dirs.filter(d => picked.includes(String(d.key)));
    const items = [];
    const HARD_CAP = 20000;                       // sanity valve for absurd servers
    for (const dir of dirs) {
      // t56c: FILES ONLY, at every level — REAL-SERVER-PROOF:
      //   · the leaf filter rides the DOCUMENTED lowercase `type` query param
      //     (Plex params are case-sensitive; 'Type=' was silently ignored →
      //     containers came back → the leaf guard ate them → NO music/TV)
      //   · excludeAllLeaves is NEVER sent on leaf queries — it asks Plex to
      //     omit exactly the tracks/episodes we're asking for
      //   · if a server still returns containers, a RESCUE WALK fetches the
      //     files anyway (albums → tracks · series → allLeaves)
      const leafType = dir.type === 'artist' ? '10' : dir.type === 'show' ? '4' : null;
      const path = `/library/sections/${dir.key}/all`;
      const pushLeaf = (m) => {
        const LEAF = { movie: 'movie', episode: 'show', track: 'album', musicvideo: 'musicvideo' };
        if (!m.ratingKey) return false;
        if (m.type && !LEAF[m.type]) return false;      // containers never shelve
        const grp = dir.type === 'artist' ? (m.parentTitle || null)
          : dir.type === 'show' ? (m.grandparentTitle || null) : null;
        items.push({
          id: `plex:${m.ratingKey}`,
          source: 'plex',
          key: String(m.ratingKey),
          type: (m.type && LEAF[m.type]) || TYPE_LABEL[dir.type] || 'movie',
          title: (dir.type === 'show' && m.grandparentTitle) ? `${m.grandparentTitle} — ${m.title}` : (m.title || 'Untitled'),
          year: m.year || null,
          rating: typeof m.rating === 'number' ? Math.round(m.rating * 10) / 10 : null,
          addedAt: (m.addedAt ? m.addedAt * 1000 : 0) || 0,
          genres: (m.Genre || []).map(g => g.tag).slice(0, 3),
          thumb: m.thumb || null,
          sectionTitle: grp || dir.title
        });
        return true;
      };
      let start = 0, seen = 0, pushed = 0, sawMeta = false;
      while (true) {
        const page = {
          'X-Plex-Container-Size': '2000',
          'X-Plex-Container-Start': String(start)
        };
        if (leafType) page.type = leafType;             // lowercase — the real form
        else page.excludeAllLeaves = '1';
        const json = await plexFetch(cfg, path, page);
        const mc = json?.MediaContainer || {};
        const meta = mc.Metadata || [];
        if (meta.length) sawMeta = true;
        for (const m of meta) { if (pushLeaf(m)) pushed++; }
        seen += meta.length;
        const total = typeof mc.totalSize === 'number' ? mc.totalSize : seen;
        start += 2000;
        if (!meta.length || start >= Math.min(total, HARD_CAP)) break;   // all pages done
      }
      // t56c RESCUE WALK — the server ignored the leaf filter (containers
      // came back, nothing shelved): fetch the FILES through the containers
      if (leafType && pushed === 0 && sawMeta) {
        if (dir.type === 'artist') {
          const alb = await plexFetch(cfg, `/library/sections/${dir.key}/albums`,
            { 'X-Plex-Container-Size': '2000', 'X-Plex-Container-Start': '0' });
          for (const a of (alb?.MediaContainer?.Metadata || []).slice(0, 800)) {
            if (!a.ratingKey) continue;
            const kids = await plexFetch(cfg, `/library/metadata/${encodeURIComponent(a.ratingKey)}/children`);
            for (const t of (kids?.MediaContainer?.Metadata || []))
              if (t.type === 'track') pushLeaf({ ...t, parentTitle: a.title });
          }
        } else {
          const ser = await plexFetch(cfg, path,
            { 'X-Plex-Container-Size': '2000', 'X-Plex-Container-Start': '0', excludeAllLeaves: '1' });
          for (const s2 of (ser?.MediaContainer?.Metadata || []).slice(0, 400)) {
            if (!s2.ratingKey) continue;
            const eps = await plexFetch(cfg, `/library/metadata/${encodeURIComponent(s2.ratingKey)}/allLeaves`,
              { 'X-Plex-Container-Size': '2000', 'X-Plex-Container-Start': '0' });
            for (const e2 of (eps?.MediaContainer?.Metadata || []))
              if (e2.type === 'episode') pushLeaf({ ...e2, grandparentTitle: s2.title });
          }
        }
      }
    }
    // ── LIVE TV (DVR / antenna tuner): channels become shelf cases ──
    try {
      const lv = await plexFetch(cfg, '/livetv/epg/channels', {
        'X-Plex-Container-Size': '300', 'X-Plex-Container-Start': '0'
      });
      for (const ch of lv?.MediaContainer?.Metadata || []) {
        const id = String(ch.key || '').split('/').pop() || ch.callSign || ch.title;
        if (!id) continue;
        items.push({
          id: `plex:live:${id}`, source: 'plex', key: `live:${id}`, type: 'live',
          title: `📺 ${ch.callSign || ch.title || 'Channel'}`,
          year: null, rating: null, addedAt: 0,
          genres: ['Live TV'], thumb: ch.thumb || null, sectionTitle: 'Live TV'
        });
      }
    } catch { /* no tuner / no DVR — live TV simply absent */ }
    return items;
  },

  // Full metadata for one item (detail modal).
  async detail(cfg, key) {
    if (String(key).startsWith('live:')) {
      const root = base(cfg);
      return {
        id: `plex:${key}`, source: 'plex', key, type: 'live',
        title: 'Live channel', genres: ['Live TV'],
        summary: 'Live TV from your Plex DVR tuner. Streaming via HLS — Safari plays it natively; if your browser refuses the stream, open it in the Plex app.',
        playUrl: root ? `${root}/web/index.html#!/liveTV` : null
      };
    }
    const json = await plexFetch(cfg, `/library/metadata/${encodeURIComponent(key)}`);
    const m = json?.MediaContainer?.Metadata?.[0];
    if (!m) return null;
    const identity = await plexFetch(cfg, '/identity').catch(() => null);
    const machine = identity?.MediaContainer?.machineIdentifier;
    const root = base(cfg);
    const playUrl = root && machine
      ? `${root}/web/index.html#!/server/${machine}/details?key=${encodeURIComponent('/library/metadata/' + m.ratingKey)}`
      : null;
    return {
      id: `plex:${m.ratingKey}`, source: 'plex', key: String(m.ratingKey),
      type: TYPE_LABEL[m.type] || 'movie',
      title: m.title, year: m.year || null,
      rating: typeof m.rating === 'number' ? m.rating : null,
      addedAt: m.addedAt ? m.addedAt * 1000 : 0,
      genres: (m.Genre || []).map(g => g.tag),
      summary: m.summary || '',
      durationMs: m.duration || null,
      contentRating: m.contentRating || null,
      thumb: m.thumb || null,
      playUrl
    };
  },

  // Direct file stream URL for the in-store TV (server-side use only).
  async streamUrl(cfg, key) {
    // LIVE CHANNELS stream through the universal transcoder (HLS). Native-HLS
    // browsers (Safari) play it directly; others may refuse the format.
    if (String(key).startsWith('live:')) {
      const id = String(key).slice(5);
      const root = base(cfg);
      if (!root) return null;
      const u = new URL(root + '/video/:/transcode/universal/start');
      u.searchParams.set('path', `/livetv/epg/channels/${id}`);
      u.searchParams.set('protocol', 'hls');
      u.searchParams.set('directStream', '1');
      u.searchParams.set('X-Plex-Token', cfg.token);
      return u.toString();
    }
    const json = await plexFetch(cfg, `/library/metadata/${encodeURIComponent(key)}`);
    const part = json?.MediaContainer?.Metadata?.[0]?.Media?.[0]?.Part?.[0];
    if (!part?.key) return null;
    const root = base(cfg);
    const u = new URL(root + part.key);
    u.searchParams.set('X-Plex-Token', cfg.token);
    return u.toString();
  },

  // Audio stream (music albums) — best-effort transcode to mp3.
  async audioUrl(cfg, key) {
    // ALBUMS have no media part of their own — their TRACKS do. The shelves
    // shelve albums (CD cases), so resolve an album to its first track
    // before looking for a file. THEN go DIRECT FILE FIRST (browsers play
    // mp3/m4a/flac natively, and the Part URL is the same reliable path
    // video uses). Transcode stays as the fallback.
    let trackKey = key;
    try {
      const meta = await plexFetch(cfg, `/library/metadata/${encodeURIComponent(key)}`);
      const m0 = meta?.MediaContainer?.Metadata?.[0];
      if (m0 && (m0.type === 'album' || !m0.Media)) {
        const kids = await plexFetch(cfg, `/library/metadata/${encodeURIComponent(key)}/children`);
        const first = (kids?.MediaContainer?.Metadata || []).find(t => t.ratingKey);
        if (first) trackKey = String(first.ratingKey);
      }
    } catch { /* keep the key as-is */ }
    try {
      const direct = await this.streamUrl(cfg, trackKey);
      if (direct) return direct;
    } catch { /* fall through to transcode */ }
    const root = base(cfg);
    if (!root) return null;
    const u = new URL(root + '/audio/:/transcode/universal.mp3');
    u.searchParams.set('X-Plex-Token', cfg.token);
    u.searchParams.set('X-Plex-Client-Identifier', 'home-binger');
    u.searchParams.set('path', `/library/metadata/${encodeURIComponent(trackKey)}`);
    u.searchParams.set('maxAudioBitrate', '320');
    return u.toString();
  },

  // Poster URL (server-side) — uses Plex's transcoder for a small thumbnail.
  posterUrl(cfg, item) {
    if (!item?.thumb) return null;
    const root = base(cfg);
    // DIRECT thumb path — the reliable one. (We previously routed posters
    // through /photo/:/transcode for 300px resizing, but that endpoint is
    // unreliable for API clients — several server setups 404/401 it and
    // every cover silently fell back to a placeholder. The proxy caches to
    // disk, so full-size art is only fetched once per item anyway.)
    const u = new URL(root + item.thumb);
    u.searchParams.set('X-Plex-Token', cfg.token);
    return u.toString();
  }
};
