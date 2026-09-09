// ─────────────────────────────────────────────────────────────────────────────
//  store3d/caseview.js — the 3D CASE in the item modal
//  ───────────────────────────────────────────────────────────────────────────
//  Clicking a shelf case now pops a REAL 3D case you can grab and flip:
//    · FRONT = the cover art (streamed from the media server)
//    · SPINES = title + year (both thin sides)
//    · BACK  = the synopsis, year/rating/genre/runtime — printed like a real
//      rental box, so the info lives ON THE BOX instead of crowding the panel.
//      The panel keeps only what it's for: playing the media.
//  Same case sizes/kind choice as the shelves, so the box you hold is the
//  same box you saw on the shelf. Slow idle spin; drag to spin/tilt.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { RoundedBoxGeometry } from '/vendor/RoundedBoxGeometry.js';
import { TUNING } from './config.js?v=1788983715036';
import { drawPlaceholderCover, hashString } from './textures.js?v=1788983715036';
import { api } from '../api.js?v=1788983715036';

const CORNER = { vhs: 0.014, dvd: 0.010, cd: 0.006 };

// identical rule to shelves.js caseKindFor → same box as on the shelf
function kindFor(item) {
  if (item.type === 'album') return 'cd';
  if (item.type === 'live') return 'vhs';
  return (hashString(item.id) % 100) < TUNING.vhsShare * 100 ? 'vhs' : 'dvd';
}

function wrap(ctx, text, x, y, maxW, lineH, maxLines) {
  const words = String(text || '').split(/\s+/);
  let line = '', n = 0;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      if (++n >= maxLines) { return y; }
      ctx.fillText(line, x, y); y += lineH; line = w;
    } else line = test;
  }
  if (line) { if (n >= maxLines - 0) ctx.fillText(line.slice(0, 60) + '…', x, y); else ctx.fillText(line, x, y); y += lineH; }
  return y;
}

export function createCaseView(container, item, opts = {}) {
  const kind = kindFor(item);
  const size = TUNING.case[kind];
  const accent = opts.accent || '#ffd23f';
  const W = 480, H = Math.round(480 * size.h / size.w);      // back-of-box canvas

  // ── renderer/scene ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 10);
  camera.position.set(0, 0, size.h * 1.62);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x35405e, 2.1));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(2, 3, 4); scene.add(dir);

  // ── face canvases ──
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const spine = mkCanvas(96, 512);
  const drawSpine = () => {
    const c = spine.getContext('2d');
    c.fillStyle = opts.caseColor || '#101830'; c.fillRect(0, 0, 96, 512);
    c.fillStyle = accent; c.fillRect(0, 0, 96, 10); c.fillRect(0, 502, 96, 10);
    c.save(); c.translate(58, 480); c.rotate(-Math.PI / 2);
    c.fillStyle = '#ffffff'; c.font = '700 34px system-ui, sans-serif';
    c.fillText((item.title || '').slice(0, 26).toUpperCase(), 0, 0);
    if (item.year) { c.fillStyle = accent; c.font = '600 26px system-ui'; c.fillText(String(item.year), 0, 34); }
    c.restore();
  };
  drawSpine();

  const back = mkCanvas(W, H);
  const backTex = new THREE.CanvasTexture(back);
  backTex.colorSpace = THREE.SRGBColorSpace; backTex.anisotropy = 4;

  const drawBack = (extra = {}) => {
    const c = back.getContext('2d');
    c.fillStyle = opts.caseColor || '#101830'; c.fillRect(0, 0, W, H);
    c.fillStyle = accent; c.fillRect(0, 0, W, 14);
    c.fillStyle = '#ffffff'; c.textBaseline = 'top';
    c.font = '800 34px system-ui, sans-serif';
    let y = wrap(c, item.title, 34, 44, W - 68, 42, 2) + 12;
    // meta line
    const meta = [
      extra.year || item.year || '',
      extra.rating || item.rating ? `★ ${(extra.rating || item.rating).toFixed ? (extra.rating || item.rating).toFixed(1) : (extra.rating || item.rating)}/10` : '',
      extra.duration || ''
    ].filter(Boolean).join('   ·   ');
    if (meta) { c.fillStyle = accent; c.font = '600 24px system-ui'; c.fillText(meta, 34, y); y += 40; }
    const genres = extra.genres || item.genres || [];
    if (genres.length) { c.fillStyle = '#9fb0d0'; c.font = 'italic 22px system-ui'; c.fillText(genres.join(' · ').slice(0, 60), 34, y); y += 40; }
    c.fillStyle = accent; c.fillRect(34, y, 70, 4); y += 22;
    c.fillStyle = '#dde5f2'; c.font = '400 23px system-ui';
    wrap(c, extra.summary || item.summary || 'Flip back soon for the synopsis…', 34, y, W - 68, 31, 12);
    c.fillStyle = '#5a6a8c'; c.font = '700 18px system-ui';
    c.fillText(`${STORE_FOOTER}`, 34, H - 38);
    backTex.needsUpdate = true;
  };
  const STORE_FOOTER = 'HOME BINGER · YOUR VIRTUAL VIDEO STORE';
  drawBack({});

  // ── cover (front) — streamed art with placeholder fallback ──
  const coverCv = mkCanvas(W, H);
  drawPlaceholderCover(coverCv.getContext('2d'), 0, 0, W, H, item);
  const coverTex = new THREE.CanvasTexture(coverCv);
  coverTex.colorSpace = THREE.SRGBColorSpace; coverTex.anisotropy = 4;
  const url = api.posterUrl(item);
  if (url) {
    const img = new Image();
    img.onload = () => {
      const c = coverCv.getContext('2d');
      const sc = Math.max(W / img.width, H / img.height);
      c.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) / 2, img.width * sc, img.height * sc);
      coverTex.needsUpdate = true;
    };
    img.src = url;
  }

  const spineTex = new THREE.CanvasTexture(spine);
  spineTex.colorSpace = THREE.SRGBColorSpace;
  const plain = new THREE.MeshStandardMaterial({ color: opts.caseColor || '#101830', roughness: 0.55 });
  const matFor = (t) => new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  // RoundedBoxGeometry groups: +x, −x, +y, −y, +z, −z
  const mats = [matFor(spineTex), matFor(spineTex), plain, plain, matFor(coverTex), matFor(backTex)];

  const caseGroup = new THREE.Group();
  caseGroup.add(new THREE.Mesh(
    new RoundedBoxGeometry(size.w, size.h, size.d, 3, CORNER[kind]), mats
  ));
  scene.add(caseGroup);

  // ── drag interaction (grab → spin/tilt; idle → slow turntable) ──
  let targetRY = -0.45, targetRX = 0.08, dragging = false, lastX = 0, lastY = 0, idleT = 0;
  const el = renderer.domElement;
  el.style.cursor = 'grab'; el.style.touchAction = 'none';
  const down = (e) => { dragging = true; idleT = 0; lastX = e.clientX; lastY = e.clientY; el.style.cursor = 'grabbing'; el.setPointerCapture?.(e.pointerId); };
  const move = (e) => {
    if (!dragging) return;
    targetRY += (e.clientX - lastX) * 0.011;
    targetRX = Math.max(-0.6, Math.min(0.6, targetRX + (e.clientY - lastY) * 0.006));
    lastX = e.clientX; lastY = e.clientY;
  };
  const up = () => { dragging = false; el.style.cursor = 'grab'; };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('pointerleave', up);

  // ── resize + render loop ──
  const resize = () => {
    const w = container.clientWidth || 240, h = container.clientHeight || 360;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container); resize();

  let raf = 0;
  const tick = () => {
    if (!dragging) { idleT++; if (idleT > 90) targetRY += 0.0042; }   // gentle turntable
    caseGroup.rotation.y += (targetRY - caseGroup.rotation.y) * 0.14;
    caseGroup.rotation.x += (targetRX - caseGroup.rotation.x) * 0.14;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  tick();

  // debug/test hook consistent with __VB
  (window.__VB ||= {}).caseview = {
    rotation: () => ({ y: +caseGroup.rotation.y.toFixed(3), x: +caseGroup.rotation.x.toFixed(3) }),
    spinTo: (ry) => { targetRY = ry; idleT = 0; }
  };

  return {
    // the modal calls this when the detail fetch lands → print it on the box
    setSynopsis(extra) { drawBack(extra || {}); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerleave', up);
      caseGroup.children[0]?.geometry.dispose();
      for (const m of mats) { m.map?.dispose(); m.dispose(); }
      renderer.dispose();
      el.remove();
      if (window.__VB?.caseview) delete window.__VB.caseview;
    }
  };
}
