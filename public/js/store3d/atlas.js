// ─────────────────────────────────────────────────────────────────────────────
//  store3d/atlas.js — poster atlases (covers + titled spines, few big textures)
//  ───────────────────────────────────────────────────────────────────────────
//  Drawing 1200 separate poster textures would kill any GPU. Instead we pack
//  everything into 2048×2048 atlas canvases. Every item gets one TILE:
//
//   ┌────────┬──┐
//   │ COVER  │SP│   COVER : 88×160 px — the box art (front of the case)
//   │  art   │IN│   SPINE  : 24×160 px — colored strip with the TITLE text,
//   │        │E │              mapped onto the thin side of the case
//   └────────┴──┘
//  Posters load progressively:
//    1. A stylish placeholder + spine title is drawn instantly for every item.
//    2. Real artwork streams in from /img/... (proxied + cached by the server)
//       and overwrites just the cover region — shelves "fill in" live.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { TUNING } from './config.js?v=1788810462055';
import { drawPlaceholderCover, hashString } from './textures.js?v=1788810462055';
import { api } from '../api.js?v=1788810462055';

export class PosterAtlases {
  constructor() {
    const T = TUNING.tile;
    this.cols = Math.floor(TUNING.atlasSize / T.w);      // tiles per row
    this.rows = Math.floor(TUNING.atlasSize / T.h);      // tiles per column
    this.perAtlas = this.cols * this.rows;
    this.canvases = [];
    this.textures = [];
    this.slots = new Map();      // itemId → { page, u, v, cw, ch, sw } (0..1)
    this.avgColors = new Map();  // itemId → THREE.Color (spines/case bodies)
    this.onTileUpdate = null;    // callback(page, item)
  }

  // Register up to `cap` unique items and draw placeholders immediately.
  begin(items, onProgress) {
    const T = TUNING.tile;
    const cap = Math.min(items.length, TUNING.displayCap);
    const pages = Math.max(1, Math.ceil(cap / this.perAtlas));

    this.canvases = []; this.textures = []; this.slots.clear();
    for (let p = 0; p < pages; p++) {
      const c = document.createElement('canvas');
      c.width = TUNING.atlasSize; c.height = TUNING.atlasSize;
      this.canvases.push({ canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }), dirty: true });
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;   // sharper covers when viewed at a low angle
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      this.textures.push(tex);
    }

    for (let i = 0; i < cap; i++) {
      const item = items[i];
      const page = Math.floor(i / this.perAtlas);
      const idx = i % this.perAtlas;
      const col = idx % this.cols, row = Math.floor(idx / this.cols);
      const dx = col * T.w, dy = row * T.h;

      // instant placeholder: cover + titled spine
      const spineBg = this.drawSpine(page, dx + T.coverW, dy, T.spineW, T.h, item, spineBaseColor(item));
      drawPlaceholderCover(this.canvases[page].ctx, dx, dy, T.coverW, T.h, item);
      this.avgColors.set(item.id, spineBaseColor(item));
      this.canvases[page].dirty = true;

      this.slots.set(item.id, {
        page,
        u: dx / TUNING.atlasSize,
        v: 1 - (dy + T.h) / TUNING.atlasSize,   // GL origin is bottom-left
        cw: T.coverW / TUNING.atlasSize,        // cover region width  (uv)
        sw: T.spineW / TUNING.atlasSize,        // spine region width  (uv)
        ch: T.h / TUNING.atlasSize
      });
    }
    this.flush();
    onProgress?.(0, cap);
    return cap;
  }

  // Draw a spine strip: colored background + the title reading bottom→top.
  drawSpine(page, x, y, w, h, item, bgColor) {
    const g = this.canvases[page].ctx;
    g.save();
    g.fillStyle = '#' + bgColor.getHexString();
    g.fillRect(x, y, w, h);
    // top/bottom caps like a real case spine
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x, y, w, 3);
    g.fillRect(x, y + h - 3, w, 3);
    // rotated title text — font FILLS the strip and is centered exactly
    // (the old fixed 11px with a +4.5px bias read off-center and mushy)
    g.translate(x + w / 2, y + h - 8);
    g.rotate(-Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.font = `800 ${Math.round(Math.min(w * 0.82, 15))}px system-ui, sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    let title = (item.title || 'Untitled').toUpperCase();
    const maxW = h - 20;
    if (g.measureText(title).width > maxW) {
      while (title.length > 1 && g.measureText(title + '…').width > maxW) title = title.slice(0, -1);
      title += '…';
    }
    g.fillText(title, 0, 0);
    g.restore();
  }

  // Kick off progressive loading of real artwork for items that have a poster.
  loadArtwork(items, onProgress) {
    const queue = items.filter(i => this.slots.has(i.id) && api.posterUrl(i));
    let done = 0;
    const total = queue.length;
    if (!total) { onProgress?.(1, 1); return Promise.resolve(); }
    return new Promise((resolveAll) => {
      let cursor = 0, active = 0;
      const failed = [];              // get ONE retry — server hiccups (or a
      const retried = new Set();      // mid-load crash) shouldn't leave a case
                                      // artless for the whole session
      const next = () => {
        if (cursor >= queue.length && active === 0) {
          if (failed.length && retried.size < 400) {
            for (const it of failed.splice(0)) {
              if (!retried.has(it.id)) { retried.add(it.id); queue.push(it); }
            }
          }
          if (cursor >= queue.length) { onProgress?.(1, 1); resolveAll(); return; }
        }
        while (active < TUNING.posterConcurrency && cursor < queue.length) {
          const item = queue[cursor++];
          active++;
          this.fetchInto(item)
            .catch(() => { failed.push(item); })
            .finally(() => {
              active--; done++;
              onProgress?.(done, total);
              next();
            });
        }
      };
      next();
    });
  }

  fetchInto(item) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { this.drawPoster(item, img); resolve(); };
      img.onerror = reject;
      img.src = api.posterUrl(item);
    });
  }

  // MUST match shelves.js caseKindFor — the art is drawn for the exact case
  // shape the item will stand in (vhs sleeve / dvd keep / cd jewel).
  static caseKindFor(item) {
    if (item.type === 'album') return 'cd';
    if (item.type === 'live') return 'vhs';
    return (hashString(item.id) % 100) < TUNING.vhsShare * 100 ? 'vhs' : 'dvd';
  }

  // Cover-fit draw into the cover region + recolor the spine from the artwork.
  drawPoster(item, img) {
    const slot = this.slots.get(item.id);
    if (!slot) return;
    const T = TUNING.tile;
    const page = this.canvases[slot.page];
    const g = page.ctx;
    const dx = slot.u * TUNING.atlasSize;
    const dy = (1 - slot.v - slot.ch) * TUNING.atlasSize;

    // ── ASPECT-CORRECT DRAW ──
    // The atlas tile region (coverW × h) gets UV-stretched onto the case's
    // FRONT FACE — and the three case kinds have different face shapes
    // (VHS 0.49, DVD 0.65, CD 1.0). Drawing art cover-fit into the raw
    // region made DVDs stretch and CDs squash posters to 55%. Instead we
    // cover-fit the art to the CASE FACE aspect, mapped back into region
    // pixels (160 px of region height = the face's full height):
    //   boxW = h × faceAspect   ← how many region-px wide "undistorted" is
    // Bands left over on narrower faces sit on the art's own average color
    // (reads like the case's paper insert), and wider boxes crop naturally.
    const kind = PosterAtlases.caseKindFor(item);
    const face = TUNING.case[kind];
    const faceAspect = face.w / face.h;
    const tw = T.coverW, th = T.h;
    const boxW = th * faceAspect;                    // undistorted box, region px
    const boxX = dx + (tw - Math.min(boxW, tw)) / 2; // centered when box < region
    const imgAspect = img.width / img.height;
    const scale = Math.max(boxW / img.width, th / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    // backdrop first (visible only as thin side bands on narrow faces)
    g.fillStyle = '#101830';
    g.fillRect(dx, dy, tw, th);
    g.save();
    g.beginPath();
    g.rect(Math.max(boxX, dx), dy, Math.min(boxW, tw), th);
    g.clip();
    g.drawImage(img, boxX + (Math.min(boxW, tw) - dw) / 2, dy + (th - dh) / 2, dw, dh);
    g.restore();

    // average color from a tiny downscale → drives spine + case body color
    const probe = document.createElement('canvas');
    probe.width = probe.height = 4;
    const pg = probe.getContext('2d', { willReadFrequently: true });
    pg.drawImage(img, 0, 0, 4, 4);
    const d = pg.getImageData(0, 0, 4, 4).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4;
    const avg = new THREE.Color(r / n / 255, gg / n / 255, b / n / 255);
    this.avgColors.set(item.id, avg);

    // recolor spine background (title text redrawn on top)
    this.drawSpine(slot.page, dx + T.coverW, dy, T.spineW, T.h, item, avg.clone().multiplyScalar(0.55));

    page.dirty = true;
    this.onTileUpdate?.(slot.page, item);
  }

  // Upload dirty canvases to the GPU (called once per frame max).
  flush() {
    for (let p = 0; p < this.canvases.length; p++) {
      if (this.canvases[p].dirty) {
        this.textures[p].needsUpdate = true;
        this.canvases[p].dirty = false;
      }
    }
  }

  get(item) { return this.slots.get(item?.id) || null; }
  pageCount() { return this.textures.length; }
  dispose() {
    this.textures.forEach(t => t.dispose());
    this.canvases = []; this.textures = []; this.slots.clear();
  }
}

// Spine color before artwork arrives — derived from the title hash so a title
// always gets the same color, like a real distributor's case.
function spineBaseColor(item) {
  const h = hashString(item.title || '?') % 360;
  return new THREE.Color().setHSL(h / 360, 0.45, 0.30);
}
