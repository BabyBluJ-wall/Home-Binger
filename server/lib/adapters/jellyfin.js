// ─────────────────────────────────────────────────────────────────────────────
//  adapters/jellyfin.js — Jellyfin Media Server adapter
// ─────────────────────────────────────────────────────────────────────────────
//  Talks to the Jellyfin HTTP API with an API key created in
//  Dashboard → API Keys. The key NEVER leaves this process — the browser
//  only ever sees relative URLs like /img/jellyfin/<itemId>.
//
//  Getting a Jellyfin API key (README → "Connecting Jellyfin"):
//    Jellyfin Dashboard → API Keys → "+" → name it "home-binger" → copy.
// ─────────────────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10000;

function base(cfg) {
  let url = String(cfg.url || '').trim().replace(/\/+$/, '');
  if (url && !/^https?:\/\//.test(url)) url = 'http://' + url;
  // Accept either "http://host:8096" or a full subpath install "/jellyfin".
  return url;
}

function authHeaders(cfg) {
  return { Authorization: `MediaBrowser Token="${cfg.apiKey}"`, Accept: 'application/json' };
}

async function jfFetch(cfg, pathname, params = {}) {
  const root = base(cfg);
  if (!root) throw new Error('Jellyfin URL is not configured');
  if (!cfg.apiKey) throw new Error('Jellyfin API key is not configured');
  const u = new URL(root + pathname);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res;
    try {
      res = await fetch(u, { headers: authHeaders(cfg), signal: ctrl.signal });
    } catch (netErr) {
      if (netErr?.name === 'AbortError') throw new Error(`Jellyfin at ${root || 'that URL'} didn't respond within ${TIMEOUT_MS / 1000} s — check the IP/port (usually 8096) and that Jellyfin is running.`);
      if (netErr instanceof TypeError || /fetch failed|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH/i.test(String(netErr?.message || '')))
        throw new Error(`Can't reach ${root || 'that URL'} — is the address right, and is this machine on the same network as Jellyfin?`);
      throw new Error(`Jellyfin connection failed: ${netErr?.message || netErr}`);
    }
    if (res.status === 401 || res.status === 403) throw new Error('Jellyfin rejected the API key (401/403) — create a fresh one in Dashboard → API Keys.');
    if (!res.ok) throw new Error(`Jellyfin HTTP ${res.status} for ${pathname}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('Jellyfin returned a non-JSON response — is the server URL correct? (no /web or /index.html suffix)');
    return await res.json();
  } finally { clearTimeout(t); }
}

const TYPE_MAP = { Movie: 'movie', Episode: 'show', Series: 'show', MusicAlbum: 'album', MusicVideo: 'musicvideo', Audio: 'album' };   // t56b: episodes are the files

export const jellyfinAdapter = {
  name: 'Jellyfin',

  async test(cfg) {
    const info = await jfFetch(cfg, '/System/Info');
    let libraries = '';
    try {
      const mediaFolders = await jfFetch(cfg, '/Library/MediaFolders');
      libraries = (mediaFolders?.Items || []).map(f => f.Name).join(', ');
    } catch { /* non-fatal */ }
    return { ok: true, name: info.ServerName || 'Jellyfin Server', detail: libraries ? `Libraries: ${libraries}` : 'Connected' };
  },

  // Pick a representative user (first admin, else first user). Many queries
  // need a userId for visibility even with an API key.
  async userId(cfg) {
    const users = await jfFetch(cfg, '/Users');
    const admin = (users || []).find(u => u.Policy?.IsAdministrator) || users?.[0];
    if (!admin) throw new Error('No Jellyfin users found');
    return admin.Id;
  },

  // List the server's libraries (Admin → Server checkbox picker).
  async libraries(cfg) {
    const uid = await this.userId(cfg);
    const json = await jfFetch(cfg, `/Users/${uid}/Views`);
    return (json?.Items || [])
      .map(v => ({ key: String(v.Id), title: v.Name || v.Id, type: v.CollectionType || '' }))
      .filter(v => ['movies', 'tvshows', 'music', 'musicvideos', 'mixed', ''].includes(v.type));
  },

  async library(cfg) {
    const uid = await this.userId(cfg);
    // Walk each LIBRARY (folder) so items carry their library's REAL name
    // (a flat query returned CollectionType=null for everything, which also
    // broke "By Library" sorting). Only the PICKED libraries are walked —
    // an EMPTY selection means NONE (uncheck everything = shelve nothing).
    const views = (await jfFetch(cfg, `/Users/${uid}/Views`).catch(() => null))?.Items || [];
    const picked = Array.isArray(cfg.sections) ? cfg.sections.map(String) : [];
    const folders = views.filter(v => picked.includes(String(v.Id)));
    const items = [];
    for (const folder of folders) {
      const json = await jfFetch(cfg, `/Users/${uid}/Items`, {
        ParentId: String(folder.Id),
        Recursive: 'true',
        IncludeItemTypes: 'Movie,Episode,MusicVideo,Audio',   // t56b: FILES only — episodes & tracks
        Fields: 'ProductionYear,OfficialRating,CommunityRating,DateCreated,Genres,Album,SeriesName',
        EnableImageTypes: 'Primary',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        Limit: '3000'
      }).catch(() => null);
      for (const it of json?.Items || []) {
        // t56b: LEAF FILES ONLY — Series/Season/MusicAlbum are FOLDERS; skip
        if (!['Movie', 'Episode', 'MusicVideo', 'Audio'].includes(it.Type)) continue;
        items.push({
          id: `jf:${it.Id}`,
          source: 'jellyfin',
          key: String(it.Id),
          type: TYPE_MAP[it.Type] || 'movie',
          title: (it.Type === 'Episode' && it.SeriesName) ? `${it.SeriesName} — ${it.Name}` : (it.Name || 'Untitled'),
          year: it.ProductionYear || null,
          rating: typeof it.CommunityRating === 'number' ? Math.round(it.CommunityRating * 10) / 10 : null,
          addedAt: it.DateCreated ? Date.parse(it.DateCreated) || 0 : 0,
          genres: (it.Genres || []).slice(0, 3),
          sectionTitle: (it.Type === 'Audio' && it.Album) ? it.Album
            : (it.Type === 'Episode' && it.SeriesName) ? it.SeriesName
            : (folder.Name || null)   // t56b: group by album / series
        });
      }
    }
    return items;
  },

  async detail(cfg, key) {
    const uid = await this.userId(cfg);
    const it = await jfFetch(cfg, `/Users/${uid}/Items/${encodeURIComponent(key)}`);
    if (!it) return null;
    const root = base(cfg);
    return {
      id: `jf:${it.Id}`, source: 'jellyfin', key: String(it.Id),
      type: TYPE_MAP[it.Type] || 'movie',
      title: it.Name, year: it.ProductionYear || null,
      rating: typeof it.CommunityRating === 'number' ? it.CommunityRating : null,
      addedAt: it.DateCreated ? Date.parse(it.DateCreated) || 0 : 0,
      genres: it.Genres || [],
      summary: it.Overview || '',
      durationMs: (it.RunTimeTicks ? it.RunTimeTicks / 10000 : null),
      contentRating: it.OfficialRating || null,
      thumb: null, // Jellyfin images are addressable directly by item id
      playUrl: root ? `${root}/web/index.html#!/details?id=${it.Id}` : null
    };
  },

  // Direct ("static") file stream for the in-store TV. Best with mp4/webm
  // files; exotic codecs may not play in the browser.
  async streamUrl(cfg, key) {
    const root = base(cfg);
    if (!root) return null;
    const u = new URL(root + `/Videos/${encodeURIComponent(key)}/stream`);
    u.searchParams.set('static', 'true');
    u.searchParams.set('api_key', cfg.apiKey);
    return u.toString();
  },

  // Audio stream (music albums) — universal endpoint transcodes to mp3.
  async audioUrl(cfg, key) {
    const root = base(cfg);
    if (!root) return null;
    // ALBUMS have no audio stream of their own — resolve to the first track
    // (the shelves shelve albums as CD cases, so that's the key we get).
    let audioId = key;
    try {
      const uid = await this.userId(cfg);
      const info = await jfFetch(cfg, `/Users/${uid}/Items/${encodeURIComponent(key)}`);
      if (info?.Type === 'MusicAlbum') {
        const kids = await jfFetch(cfg, `/Users/${uid}/Items`, {
          ParentId: key, IncludeItemTypes: 'Audio', Recursive: 'true',
          SortBy: 'IndexNumber', Limit: '1'
        });
        const first = kids?.Items?.[0];
        if (first) audioId = first.Id;
      }
    } catch { /* keep the key as-is */ }
    const u = new URL(root + `/Audio/${encodeURIComponent(audioId)}/universal`);
    u.searchParams.set('api_key', cfg.apiKey);
    u.searchParams.set('DeviceId', 'home-binger');
    u.searchParams.set('Container', 'mp3,aac,flac,m4a');
    u.searchParams.set('TranscodingContainer', 'mp3');
    u.searchParams.set('AudioCodec', 'mp3');
    u.searchParams.set('MaxStreamingBitrate', '320000');
    return u.toString();
  },

  posterUrl(cfg, item) {
    const root = base(cfg);
    if (!root || !item?.key) return null;
    return `${root}/Items/${encodeURIComponent(item.key)}/Images/Primary?maxWidth=300&quality=90&api_key=${encodeURIComponent(cfg.apiKey)}`;
  }
};
