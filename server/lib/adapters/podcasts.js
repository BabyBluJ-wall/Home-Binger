// ─────────────────────────────────────────────────────────────────────────────
//  adapters/podcasts.js — the "radio rack": podcast episodes from RSS feeds
// ─────────────────────────────────────────────────────────────────────────────
//  The admin pastes podcast RSS URLs (nearly every podcast publishes one —
//  Apple Podcasts / Castbox / Pocket Casts all expose "copy RSS URL"). We
//  fetch each feed, keep the newest episodes, and play the enclosure MP3s
//  through this server so the TV visualizer works (Web Audio needs same-origin).
//
//  cfg: { feeds: ['https://…/rss.xml', …] }   — [] means no podcast shelf.
//
//  Keys are short hashes (NOT the media URL): URLs contain slashes and the
//  API paths are pre-decoded server-side, so a URL-key would shatter routing.
//  hash → media URL lives in the registry below, which only library() fills —
//  meaning ONLY audio from admin-configured feeds is ever proxied (no open
//  proxy for outsiders to abuse).
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

const EPISODES_PER_FEED = 24;
const CACHE_TTL = 10 * 60 * 1000;
const feedCache = new Map();     // feedUrl → { at, channel, items }
const registry = new Map();      // itemKey → enclosure URL (playable set)

const h = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

function decodeEntities(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&');
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(m[1]).trim() : null;
}

function parseFeed(xml) {
  const channelBlock = (xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i) || [])[1] || '';
  const channel = {
    title: tag(channelBlock, 'title') || 'Podcast',
    art: (channelBlock.match(/<itunes:image[^>]*href=["']([^"']+)["']/i) || [])[1] || null
  };
  const items = [];
  const blocks = channelBlock.match(/<item[^>]*>[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    const enc = (b.match(/<enclosure[^>]*url=["']([^"']+)["']/i) || [])[1];
    const type = (b.match(/<enclosure[^>]*type=["']([^"']+)["']/i) || [])[1] || '';
    if (!enc || !/^https?:\/\//i.test(enc)) continue;          // needs a direct media file
    if (type && !/audio|video/i.test(type)) continue;          // skip e-books/pdf enclosures
    items.push({
      title: tag(b, 'title') || 'Episode',
      pubDate: tag(b, 'pubDate'),
      url: enc.replace(/&amp;/g, '&')
    });
    if (items.length >= EPISODES_PER_FEED) break;
  }
  return { channel, items };
}

async function loadFeed(url) {
  const hit = feedCache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'home-binger/1.0 (podcast rack for personal media servers)' },
    signal: AbortSignal.timeout(12000), redirect: 'follow'
  });
  if (!r.ok) throw new Error(`feed HTTP ${r.status}`);
  const parsed = parseFeed(await r.text());
  feedCache.set(url, { at: Date.now(), ...parsed });
  return { at: Date.now(), ...parsed };
}

export const podcastsAdapter = {
  name: 'Podcasts',

  async library(cfg) {
    // t93: MULTI-SOURCE feeds — each entry is {url, name?, on?} (legacy plain
    // strings still work). `on: false` parks a feed without losing its URL;
    // `name` is the admin's nickname and wins the section label.
    const raw = Array.isArray(cfg.feeds) ? cfg.feeds : [];
    const byUrl = new Map();
    for (const f of raw.slice(0, 50)) {
      const o = typeof f === 'string' ? { url: f } : (f && typeof f === 'object' ? f : null);
      if (!o || !/^https?:\/\//i.test(String(o.url || ''))) continue;
      const url = String(o.url).trim();
      if (!byUrl.has(url)) byUrl.set(url, { url, name: o.name ? String(o.name).slice(0, 64) : null, on: o.on !== false });
    }
    const feeds = [...byUrl.values()].filter(f => f.on !== false);
    const out = [];
    for (const feed of feeds) {
      const url = feed.url;
      let loaded;
      try { loaded = await loadFeed(url); }
      catch (e) { console.warn(`[podcasts] feed failed (${url}): ${e.message}`); continue; }
      const secId = `podcast:${h(url).slice(0, 12)}`;
      const secTitle = feed.name || loaded.channel.title;   // t93: nickname wins
      loaded.items.forEach((ep, i) => {
        const key = `pe${h(ep.url).slice(0, 12)}`;
        registry.set(key, ep.url);                 // ONLY admin-feed audio becomes playable
        const dt = ep.pubDate ? new Date(ep.pubDate) : null;
        out.push({
          id: `podcast:${key}`,
          source: 'podcast',
          key,
          type: 'episode',
          title: ep.title,
          year: null,
          rating: null,
          addedAt: dt && !isNaN(dt) ? dt.getTime() / 1000 : (Date.now() / 1000 - i * 3600),
          genres: ['Podcast'],
          sectionId: secId,
          sectionTitle: secTitle,
          mediaUrl: ep.url,                        // server-side only (stripped by /api/library)
          artUrl: loaded.channel.art               // server-side only
        });
      });
    }
    return out;
  },

  streamUrl(cfg, key) { return registry.get(key) || null; },
  audioUrl(cfg, key) { return registry.get(key) || null; },

  async detail(cfg, key) {
    const url = registry.get(key);
    if (!url) return null;
    return { title: 'Podcast episode', summary: 'Plays as audio on the store TV with your visualizer.', playUrl: null };
  },

  posterUrl(cfg, item) { return item.artUrl || null; }
};
