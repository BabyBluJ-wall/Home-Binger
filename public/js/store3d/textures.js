// ─────────────────────────────────────────────────────────────────────────────
//  store3d/textures.js — all procedural (canvas-drawn) textures
//  ───────────────────────────────────────────────────────────────────────────
//  Nothing here needs an image file — every surface is drawn at runtime on a
//  <canvas>, which keeps the app 100% self-contained and instantly recolorable
//  with the user's theme. Edit any drawing routine to change the store's look.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { STORE } from './config.js?v=1788983715036';   // store branding for the wall sign

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

const tex = (c, repeatX = 1, repeatY = 1, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
};

// Deterministic hash → used for stable "random" colors per title.
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

// ── WALLS: subtle vertical noise + faint panel lines ─────────────────────────
export function wallTexture(colorHex) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = colorHex; g.fillRect(0, 0, 256, 256);
  // noise
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // faint panel seams
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 2;
  g.strokeRect(1, 1, 254, 254);
  return tex(c, 4, 2);
}

// ── FLOOR: carpet with speckles + optional center-aisle runner ────────────────
export function floorTexture(colorHex) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = colorHex; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.09)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  return tex(c, 14, 30);
}

// ── CEILING: drop-tile grid ──────────────────────────────────────────────────
export function ceilingTexture(colorHex) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = colorHex || '#cfd6e4'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(60,70,95,0.55)'; g.lineWidth = 3;
  g.strokeRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  return tex(c, 14, 30);
}

// ── SHELVES: wood grain / brushed metal / laminate ────────────────────────────
export function shelfTexture(colorHex, style) {
  const [c, g] = canvas(256, 128);
  g.fillStyle = colorHex; g.fillRect(0, 0, 256, 128);
  if (style === 'metal') {
    for (let y = 0; y < 128; y += 2) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.10})`;
      g.fillRect(0, y, 256, 1);
    }
  } else {
    // wood grain: long wavy strokes
    g.strokeStyle = 'rgba(0,0,0,0.16)';
    for (let i = 0; i < 22; i++) {
      const y = Math.random() * 128;
      g.lineWidth = 0.8 + Math.random() * 1.6;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,235,200,0.10)';
    for (let i = 0; i < 10; i++) {
      const y = Math.random() * 128;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, y); g.lineTo(256, y + (Math.random() - 0.5) * 6); g.stroke();
    }
  }
  return tex(c, 3, 1);
}

// ── PLACEHOLDER COVER (also used for demo items) ─────────────────────────────
// Draws a stylish fake poster into ctx at (dx,dy) size (w,h): gradient from a
// color derived from the title, big initial letters, wrapped title, year.
export function drawPlaceholderCover(g, dx, dy, w, h, item) {
  const hue = hashString(item.title || '?') % 360;
  const grd = g.createLinearGradient(dx, dy, dx + w, dy + h);
  grd.addColorStop(0, `hsl(${hue} 62% 34%)`);
  grd.addColorStop(1, `hsl(${(hue + 40) % 360} 70% 16%)`);
  g.fillStyle = grd;
  g.fillRect(dx, dy, w, h);

  // decorative rays
  g.save();
  g.beginPath(); g.rect(dx, dy, w, h); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = w * 0.05;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(dx + w * (i * 0.3 - 0.5), dy + h);
    g.lineTo(dx + w * (i * 0.35 + 0.1), dy - h * 0.2);
    g.stroke();
  }
  g.restore();

  // big initials
  const initials = (item.title || '?').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = `900 ${Math.floor(h * 0.34)}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(initials, dx + w / 2, dy + h * 0.32);

  // type icon: ▶ for movies/series, ♪ for music
  g.font = `${Math.floor(h * 0.13)}px system-ui, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.fillText(item.type === 'album' || item.type === 'musicvideo' ? '♪' : '▶', dx + w / 2, dy + h * 0.55);

  // wrapped title (up to 3 lines) — bold + shadowed so it reads at a glance
  g.font = `800 ${Math.max(10, Math.floor(h * 0.098))}px system-ui, sans-serif`;
  g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 4;
  const words = (item.title || 'Untitled').split(/\s+/);
  const lines = []; let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > w * 0.86 && line) { lines.push(line); line = word; }
    else line = test;
    if (lines.length === 3) break;
  }
  if (line && lines.length < 3) lines.push(line);
  lines.forEach((l, i) => g.fillText(l, dx + w / 2, dy + h * (0.72 + i * 0.09)));

  if (item.year) {
    g.font = `600 ${Math.max(8, Math.floor(h * 0.07))}px system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText(String(item.year), dx + w / 2, dy + h * 0.955);
  }
}

// Standalone placeholder as a data URL (for the detail modal).
export function placeholderDataUrl(item, w = 300, h = 450) {
  const [c, g] = canvas(w, h);
  drawPlaceholderCover(g, 0, 0, w, h, item);
  return c.toDataURL('image/jpeg', 0.85);
}

// ── TEXT SIGN (canvas → texture) — video-store-style ticket sign ─────────────
export function signTexture(text, opts = {}) {
  const w = opts.width || 1024, h = opts.height || 256;
  const [c, g] = canvas(w, h);
  const accent = opts.accent || '#ffd23f';
  const bg = opts.bg || '#0b1c4d';

  // ticket background
  g.fillStyle = bg;
  const r = h * 0.18;
  g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, r); g.fill();
  g.strokeStyle = accent; g.lineWidth = h * 0.05;
  g.beginPath(); g.roundRect(h * 0.045, h * 0.045, w - h * 0.09, h - h * 0.09, r * 0.8); g.stroke();

  // text
  let fs = opts.fontSize || Math.floor(h * (opts.small ? 0.42 : 0.5));
  g.font = `italic 900 ${fs}px system-ui, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = accent;
  let msg = text.toUpperCase();
  while (g.measureText(msg).width > w * 0.84 && fs > 10) {
    g.font = `italic 900 ${--fs}px system-ui, sans-serif`;
  }
  g.fillText(msg, w / 2, h / 2 + h * 0.02);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ── MAIN STORE LOGO (big sign above the far wall) ────────────────────────────
// The big wall sign above the entry door. Text comes from config.js → STORE
// (network + tagline), so re-branding the store is a one-line edit. The
// font auto-shrinks if the text is too long for the sign.
export function logoTexture(accent, bg, brand, tagline) {
  const text = (brand ?? STORE.network).toUpperCase();
  const sub = `★ ${(tagline ?? STORE.tagline).toUpperCase()} ★`;
  const [c, g] = canvas(2048, 384);
  g.fillStyle = bg || '#0a1a4a';
  g.fillRect(0, 0, 2048, 384);
  g.strokeStyle = accent || '#ffd23f'; g.lineWidth = 18;
  g.strokeRect(14, 14, 2048 - 28, 384 - 28);

  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = accent || '#ffd23f';
  let px = 200;                                     // fit the main line to the sign
  do { g.font = `italic 900 ${px}px system-ui, sans-serif`; px -= 6; }
  while (g.measureText(text).width > 1940 && px > 60);
  g.fillText(text, 1024, 150);
  px = 74;                                          // …and the tagline
  do { g.font = `italic 700 ${px}px system-ui, sans-serif`; px -= 3; }
  while (g.measureText(sub).width > 1940 && px > 30);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.fillText(sub, 1024, 300);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
