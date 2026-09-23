// ─────────────────────────────────────────────────────────────────────────────
//  adapters/epg.js — the Guide's PROGRAM DATA (t139)
// ─────────────────────────────────────────────────────────────────────────────
//  Free FAST services publish real schedules as XMLTV (daily regenerated):
//  i.mjh.nz mirrors Pluto TV / Samsung TV Plus / Roku / Plex; Tubi's scraper
//  repo publishes its own. This module fetches + parses them into a compact
//  per-channel window (now ± hours), zero npm dependencies.
//
//  DOCTRINE stays: we never FABRICATE listings — a channel with no EPG data
//  shows the honest ● LIVE line, exactly as before. EPG is a bonus layer.
//
//  Exports:
//   · loadEpg(url)   → { at, byChannel: Map<channelId, prog[]> }  (cached 6h)
//   · nowNext(progs) → { now: {t,s,e,ep,d}, next: {t,s,e} } | null
// ─────────────────────────────────────────────────────────────────────────────
import zlib from 'node:zlib';

const EPG_TTL = 6 * 60 * 60 * 1000;        // files regenerate daily; 6h keeps programs fresh
const EPG_FAIL_BACKOFF = 10 * 60 * 1000;   // a dead EPG source retries in 10min, not per request
const WINDOW_PAST = 1 * 60 * 60 * 1000;    // keep programmes that ended <1h ago
const WINDOW_FUTURE = 8 * 60 * 60 * 1000; // …and starting <8h from now (long blocks' successors stay known)

const epgCache = new Map();                // url → { at, byChannel } | { failedAt, err }

// XMLTV entity decode (titles/descriptions carry &amp; &quot; &#39; …)
function xmlDecode(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// "20260920073100 +0000" → epoch ms (offset honoured; sources normalize to UTC)
function parseXmltvTime(s) {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/.exec(String(s || '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se, off] = m;
  let ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  if (off) ms -= ((+off.slice(1, 3)) * 60 + (+off.slice(3, 5))) * 60000 * (off[0] === '+' ? 1 : -1);
  return ms;
}

// Fetch + gunzip + parse one XMLTV document into the windowed per-channel map.
async function fetchEpg(url) {
  const r = await fetch(url, {
    headers: { 'User-Agent': 'home-binger/1.0 (free live TV rack for personal media servers)' },
    signal: AbortSignal.timeout(45000), redirect: 'follow'
  });
  if (!r.ok) throw new Error(`EPG HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const raw = (url.endsWith('.gz') || (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b))
    ? zlib.gunzipSync(buf).toString('utf8')
    : buf.toString('utf8');
  const now = Date.now();
  const byChannel = new Map();
  // one regex pass over the whole document (Tubi ships it all on one line —
  // never assume line breaks). Programme blocks carry channel/start/stop on
  // the open tag; title/episode/desc are pulled from the block body.
  const progRe = /<programme\s+channel="([^"]*)"\s+start="([^"]*)"\s+stop="([^"]*)"\s*>([\s\S]*?)<\/programme>/g;
  const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/;
  const epRe = /<episode-num\s+system="onscreen"[^>]*>([\s\S]*?)<\/episode-num>/;
  const descRe = /<desc[^>]*>([\s\S]*?)<\/desc>/;
  const rateRe = /<rating[^>]*>\s*<value>([^<]+)<\/value>/;   // t139g: MPAA/TV rating (most FAST sources publish none — honest omission)
  let m;
  while ((m = progRe.exec(raw)) !== null) {
    const s = parseXmltvTime(m[2]);
    const e = parseXmltvTime(m[3]);
    if (s == null || e == null || e <= s) continue;
    if (e < now - WINDOW_PAST || s > now + WINDOW_FUTURE) continue;   // outside the window — skip
    const body = m[4];
    const t = titleRe.exec(body)?.[1];
    if (!t) continue;                                                  // a programme with no title is useless to the Guide
    const prog = {
      s, e, t: xmlDecode(t).slice(0, 120),
      ep: (epRe.exec(body)?.[1] || '').trim().slice(0, 16) || null,
      r: (rateRe.exec(body)?.[1] || '').trim().slice(0, 12) || null,   // t139g
      d: (descRe.exec(body)?.[1] ? xmlDecode(descRe.exec(body)[1]).replace(/\s+/g, ' ').trim().slice(0, 220) : null)
    };
    let arr = byChannel.get(m[1]);
    if (!arr) { arr = []; byChannel.set(m[1], arr); }
    arr.push(prog);
  }
  for (const arr of byChannel.values()) arr.sort((a, b) => a.s - b.s);  // belt & braces (sources are sorted)
  return { at: now, byChannel };
}

export async function loadEpg(url) {
  const hit = epgCache.get(url);
  if (hit) {
    if (hit.byChannel && Date.now() - hit.at < EPG_TTL) return hit;
    if (hit.failedAt && Date.now() - hit.failedAt < EPG_FAIL_BACKOFF) throw hit.err;
  }
  try {
    const out = await fetchEpg(url);
    epgCache.set(url, out);
    return out;
  } catch (e) {
    epgCache.set(url, { failedAt: Date.now(), err: e });
    throw e;
  }
}

// The current + next programme for one channel, from its windowed list.
export function nowNext(progs, now = Date.now()) {
  if (!progs || !progs.length) return null;
  let cur = null, nxt = null;
  for (const p of progs) {
    if (p.s <= now && p.e > now) cur = p;
    else if (p.s > now) { nxt = p; break; }
  }
  if (!cur) cur = nxt, nxt = null;   // between listings (clock skew) — lead with the next one
  if (!cur) return null;
  return {
    now: { t: cur.t, s: cur.s, e: cur.e, ep: cur.ep, r: cur.r, d: cur.d },
    // t140: next carries the full fields too — the Guide's NEXT preview can
    // show episode, rating and description, not just the title
    next: nxt ? { t: nxt.t, s: nxt.s, e: nxt.e, ep: nxt.ep, r: nxt.r, d: nxt.d } : null
  };
}
