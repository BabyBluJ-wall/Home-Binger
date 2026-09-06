// ─────────────────────────────────────────────────────────────────────────────
//  adapters/local.js — the FILE GRABBER: shelves a folder on THIS computer
// ─────────────────────────────────────────────────────────────────────────────
//  For people who don't want to expose Plex/Jellyfin (or any networked media
//  server) at all: point Home Binger at a folder and everything inside it —
//  AND EVERY FOLDER NESTED INSIDE, RECURSIVELY — shelves as INDIVIDUAL FILES.
//  Never folders, never containers: movies/episodes by file, music tracks
//  grouped by the album folder they live in (same leaf-only doctrine as the
//  Plex/Jellyfin adapters).
//
//  cfg: { on: true, spots: ['C:\\Videos', 'D:\\Music', …] }   — MULTIPLE roots;
//  legacy { on, path } from older builds is treated as one spot automatically.
//  Keys are file paths RELATIVE to the root (they contain '/', the play route
//  joins them back) — resolved against the root with a traversal guard.
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const VIDEO = /\.(mp4|m4v|webm|mkv|mov|avi|mpg|mpeg|ts|m2ts)$/i;
const AUDIO = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus)$/i;
// print media — INDEXED for the full-library future (type 'book'); the store
// shelves them once players exist. Books live in the catalogue, not on shelves.
const BOOK = /\.(pdf|epub|mobi|azw3|cbz|cbr|txt)$/i;
const MAX_FILES = 20000;      // safety cap — a whole drive still shelves fast
const MAX_DEPTH = 14;

const MIME = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.mkv': 'video/x-matroska', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
  '.mpg': 'video/mpeg', '.mpeg': 'video/mpeg', '.ts': 'video/mp2t', '.m2ts': 'video/mp2t',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
  '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.opus': 'audio/opus'
};

// spotsOf — normalised array of absolute roots (legacy path → one spot)
export function spotsOf(cfg) {
  if (!cfg?.on) return [];
  const raw = Array.isArray(cfg?.spots) && cfg.spots.length ? cfg.spots
    : (cfg?.path ? [cfg.path] : []);                       // legacy single-path builds
  const roots = [];
  for (const r of raw.slice(0, 16)) {                      // up to 16 spots
    const t = String(r || '').trim().replace(/^["']|["']$/g, '');   // t66: novices paste quoted paths
    if (!t) continue;
    try { const st = fs.statSync(t); if (st.isDirectory()) roots.push(path.resolve(t)); } catch {}
  }
  return roots;
}

function walk(dir, root, out, depth, spot) {
  if (out.length >= MAX_FILES || depth > MAX_DEPTH) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const ent of entries) {
    if (out.length >= MAX_FILES) return;
    if (ent.isDirectory()) walk(path.join(dir, ent.name), root, out, depth + 1, spot);   // RECURSIVE grab
    else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      const isAudio = AUDIO.test(ent.name), isVideo = VIDEO.test(ent.name);
      if (!isAudio && !isVideo && !BOOK.test(ent.name)) continue;
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      let mtime = 0;
      try { mtime = fs.statSync(abs).mtimeMs; } catch {}
      // FILES ONLY, never folders. Keys are namespaced by spot —
      // '<spotIndex>/<relative path>' — so two spots can hold the same
      // sub-folder name without colliding.
      const kind = isAudio ? 'album' : isVideo ? 'movie' : 'book';
      out.push({
        id: `local:${spot}/${rel}`,
        source: 'local',
        key: `${spot}/${rel}`,                     // play route joins the '/' back
        type: kind,
        title: path.basename(ent.name, path.extname(ent.name)),
        file: ent.name,
        addedAt: Math.floor(mtime / 1000)
      });
    }
  }
}

export const localAdapter = {
  name: 'Local files',
  async library(cfg) {
    const roots = spotsOf(cfg);
    const items = [];
    roots.forEach((root, i) => walk(root, root, items, 0, i));   // every spot, recursively
    return items;
  },
  // The proxy asks for a stream URL; local files stream straight off disk
  // (the play route recognises the local-file: prefix and Range-streams it).
  async streamUrl(cfg, key) {
    const roots = spotsOf(cfg);
    const k = String(key || '');
    const slash = k.indexOf('/');
    const spot = slash > 0 ? parseInt(k.slice(0, slash), 10) : -1;    // '<spotIndex>/<rel>'
    const rel = slash > 0 ? k.slice(slash + 1) : '';
    const root = roots[spot];
    if (!root || !rel) return null;
    const abs = path.resolve(root, rel);
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;   // traversal guard
    try { const st = fs.statSync(abs); if (!st.isFile()) return null; } catch { return null; }
    return 'local-file:' + abs;
  },
  // Same resolution for the music path (?audio=1) — a file is a file
  async audioUrl(cfg, key) { return this.streamUrl(cfg, key); },
  mimeFor(abs) { return MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream'; }
};
