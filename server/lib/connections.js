// ─────────────────────────────────────────────────────────────────────────────
//  server/lib/connections.js — PER-USER connections (t171 · t186)
//  The store owner's accounts are NEVER used: every user who wants their
//  Steam library brings their OWN key and it lives in their own account on
//  THIS server. Nothing global, nothing phoned home — keys are only used
//  server-side to call the service the user themselves asked for.
//  t186: YOUTUBE IS GONE from connections — the player panel browses the
//  real youtube.com, so there is no key to save, test, or mask anywhere.
// ─────────────────────────────────────────────────────────────────────────────

const STEAM_BASE = 'https://api.steampowered.com';
// ── shape + validation ───────────────────────────────────────────────────────
export function blankConnections() {
  return { steam: { key: '', id: '', share: false } };
}
export function sanitizeConnections(existing, incoming) {
  const cur = { ...blankConnections(), ...(existing || {}),
    steam: { ...blankConnections().steam, ...(existing || {}).steam } };
  if (cur.spotify) delete cur.spotify;          // t182c: stale data from before the removal never survives
  if (cur.youtube) delete cur.youtube;          // t186: same for YouTube — stale keys never survive a sanitize
  if (!incoming || typeof incoming !== 'object') return cur;
  if (incoming.steam && typeof incoming.steam === 'object') {
    const s = incoming.steam;
    if ('key' in s) {
      const k = String(s.key ?? '');
      if (k.length === 0) cur.steam.key = '';
      else if (k.length >= 20 && k.length <= 64 && !/\s/.test(k)) cur.steam.key = k;
    }
    if ('id' in s) {
      const id = String(s.id ?? '').trim();
      cur.steam.id = /^\d{17}$/.test(id) ? id : cur.steam.id;      // ignore anything not a SteamID64
    }
    if ('share' in s) cur.steam.share = !!s.share;
  }
  return cur;
}
// what any API response may reveal — NEVER the raw keys
export function publicConnections(c) {
  const cc = { ...blankConnections(), ...(c || {}),
    steam: { ...blankConnections().steam, ...(c || {}).steam || {} } };
  if (cc.spotify) delete cc.spotify;          // t182c: any stale connection from before the removal
  if (cc.youtube) delete cc.youtube;          // t186: ditto YouTube
  return {
    steam: { set: !!(cc.steam.key && cc.steam.id), id: cc.steam.id || '', share: !!cc.steam.share },
  };
}

// ── small caches (in-memory; the same search/library is not re-fetched) ─────
const cache = new Map();           // key → { at, value }
const TTL = { steam: 10 * 60 * 1000 };
function cacheGet(k, ttl) {
  const e = cache.get(k);
  if (!e || Date.now() - e.at > ttl) return undefined;
  return e.value;
}
function cacheSet(k, v) { cache.set(k, { at: Date.now(), value: v }); if (cache.size > 200) cache.delete(cache.keys().next().value); }

// ── pure mappers (unit-tested with fixtures) ─────────────────────────────────
export function mapSteamLibrary(gamesJson, playerJson, steamId) {
  const games = (gamesJson?.response?.games || []).map(g => ({
    appid: g.appid,
    name: String(g.name || `App ${g.appid}`),
    hours: +((g.playtime_forever || 0) / 60).toFixed(1),
    lastPlayed: g.rtime_last_played ? g.rtime_last_played * 1000 : 0,
    art: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`
  })).sort((a, b) => b.hours - a.hours);
  const p = (playerJson?.response?.players || [])[0];
  return {
    profile: p?.personaname || `Steam ${String(steamId).slice(-6)}`,
    avatar: p?.avatarmedium || '',
    count: games.length,
    totalHours: +(games.reduce((a, g) => a + g.hours, 0)).toFixed(1),
    games
  };
}

// ── upstream calls ───────────────────────────────────────────────────────────
async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}
// t177: one REAL call that says whether a Steam key works
export async function steamKeyCheck(key) {
  try {
    const r = await getJson(`https://api.steampowered.com/ISteamUser/ResolveVanityURL?key=${encodeURIComponent(key)}&vanityurl=gaben`);
    if (r.status === 200 && r.body?.response) return { ok: true, info: 'Key accepted — Steam libraries are ready.' };
    if (r.status === 403 || r.status === 404) return { ok: false, error: 'Steam rejected that key — copy it again from steamcommunity.com/dev (it should be 32 characters).' };   // Steam answers 404 for a bad key on this endpoint
    return { ok: false, error: 'Steam answered ' + r.status + ' — try again in a moment.' };
  } catch { return { ok: false, error: 'Could not reach Steam — check this server’s internet connection.' }; }
}

export async function fetchSteamLibrary(key, steamId) {
  const ck = 'steam:' + steamId;
  const hit = cacheGet(ck, TTL.steam);
  if (hit) return { ok: true, status: 200, data: hit, cached: true };
  let games, player;
  try {
    games = await getJson(`${STEAM_BASE}/IPlayerService/GetOwnedGames/v1/?key=${key}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1`);
  } catch { return { ok: false, status: 502, error: 'Could not reach Steam — check this server\'s internet connection.' }; }
  if (games.status === 401 || games.status === 403) {   // Steam: 401 = bad key, 403 = key OR private "Game details"
    return { ok: false, status: 400, error: 'Steam rejected that request — either the key is wrong, or the profile\'s "Game details" privacy is not Public (Steam → Profile → Edit Privacy Settings).', setup: true };
  }
  if (games.status !== 200) return { ok: false, status: 502, error: 'Steam library call failed (' + games.status + ').' };
  try {
    player = await getJson(`${STEAM_BASE}/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`);
  } catch { player = { status: 0, body: {} }; }
  const data = mapSteamLibrary(games.body, player.status === 200 ? player.body : {}, steamId);
  cacheSet(ck, data);
  return { ok: true, status: 200, data };
}
