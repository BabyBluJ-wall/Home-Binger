// ─────────────────────────────────────────────────────────────────────────────
//  store3d/signage.js — aisle signs, wall category signs + poster end caps
//  ───────────────────────────────────────────────────────────────────────────
//  Signs are generated from whatever the current user's sorting produced
//  ("ACTION · THRILLER", "A – D", "★ 8.0 – 9.5", …), so re-sorting re-labels
//  the whole store instantly. Signs live in three places, always FACING the
//  reader (front side toward the aisle they describe):
//    · hanging over each gondola           (read from the center aisle)
//    · on the wall band above each shelf   (read from the wall lanes)
//    · above the far-wall + door flanks
//  The gondolas' center-aisle end caps carry big flat posters instead.
//  (The big store logo lives in room.js, above the entry door.)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT, TUNING } from './config.js?v=1788937971857';
import { signTexture, drawPlaceholderCover } from './textures.js?v=1788937971857';
import { api } from '../api.js?v=1788937971857';
import { islandSpecs } from './shelves.js?v=1788937971857';

export function buildSignage(theme) {
  const group = new THREE.Group();
  group.name = 'signage';
  const W = LAYOUT.room.w / 2, D = LAYOUT.room.l / 2, H = LAYOUT.room.h;

  const chainMat = new THREE.MeshStandardMaterial({ color: '#78808f', roughness: 0.4, metalness: 0.8 });
  // shared dark edge frame for the hanging lightbox signs (never disposed per-sign)
  const signEdgeMat = new THREE.MeshStandardMaterial({ color: '#0b1330', roughness: 0.5, metalness: 0.35 });
  let signMeshes = [];

  // labels: Map(unit → text); faces provide signPos/signRotY per unit
  function rebuild(labels, faces) {
    for (const m of signMeshes) {
      group.remove(m);
      m.geometry.dispose();
      // slabs carry a material ARRAY — dispose textured face materials only
      // (the shared edge material is reused, never disposed here)
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of mats) {
        if (mm.map) { mm.map.dispose(); mm.dispose(); }
        else if (!Array.isArray(m.material)) mm.dispose();
      }
    }
    signMeshes = [];
    const seen = new Set();
    for (const f of faces) {
      if (seen.has(f.unit) || !f.signPos) continue;
      seen.add(f.unit);
      const text = labels.get(f.unit) || '· · ·';
      const w = Math.min(2.35, f.length - 0.15), h = 0.58;   // never wider than its run
      // HANGING signs are 3D lightbox slabs — real thickness, the text reads
      // correctly from BOTH sides, dark edge frame. (Wall-band signs stay
      // flat planes; they're mounted flat to the wall.)
      let mesh;
      if (f.kind === 'island') {
        const faceMat = new THREE.MeshBasicMaterial({
          map: signTexture(text, { accent: theme.accent }), toneMapped: false
        });
        mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.07),
          [signEdgeMat, signEdgeMat, signEdgeMat, signEdgeMat, faceMat, faceMat]);
      } else {
        mesh = new THREE.Mesh(
          new THREE.PlaneGeometry(w, h),
          new THREE.MeshBasicMaterial({
            map: signTexture(text, { accent: theme.accent }),
            side: THREE.DoubleSide, toneMapped: false
          })
        );
      }
      mesh.position.set(f.signPos.x, f.signPos.y, f.signPos.z);
      mesh.rotation.y = f.signRotY;
      mesh.userData.text = text;           // remembered so applyTheme can redraw
      group.add(mesh);
      signMeshes.push(mesh);

      // hanging chains up to the ceiling (islands only)
      if (f.kind === 'island') {
        for (const dx of [-w / 2 + 0.22, w / 2 - 0.22]) {
          const len = H - f.signPos.y - 0.3;
          // 20 radial segments = smoothly round rods (5 made them look faceted)
          const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, len, 20), chainMat);
          const ang = f.signRotY;
          chain.position.set(
            f.signPos.x + Math.cos(ang) * dx,
            f.signPos.y + h / 2 + len / 2,
            f.signPos.z - Math.sin(ang) * dx
          );
          group.add(chain);
          signMeshes.push(chain);
        }
      }
    }
  }

  function applyTheme(t) {
    // regenerate each sign's texture with the new accent color
    for (const m of signMeshes) {
      const text = m.userData.text;
      if (!text) continue;                 // chains have no texture text
      for (const mm of (Array.isArray(m.material) ? m.material : [m.material])) {
        if (!mm.map) continue;             // slab edges have no texture
        mm.map.dispose();
        mm.map = signTexture(text, { accent: t.accent });
        mm.needsUpdate = true;
      }
    }
  }

  // ── island end-cap posters — BOTH caps, mirroring each other ──────────────
  // The center-aisle tip AND the wall-lane end of every gondola carry a big
  // flat-mounted poster of a library title (highest rated, spread out), like
  // the face-out posters on a video-store gondola. No cases on the caps.
  let islandPosters = [];
  function rebuildIslandPosters(items) {
    for (const p of islandPosters) {
      group.remove(p.mesh);
      p.mesh.geometry.dispose(); p.mesh.material.map?.dispose(); p.mesh.material.dispose();
    }
    islandPosters = [];
    if (!items.length) return;

    const specs = islandSpecs();
    const total = specs.length * 2;               // both end caps
    const rated = [...items].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const step = Math.max(1, Math.floor(rated.length / total));
    const picks = [];
    for (let i = 0; i < rated.length && picks.length < total; i += step) picks.push(rated[i]);

    // flat layered mount: border plane at the cap panel, poster 8mm proud —
    // nothing protrudes past the gondola into either walkway.
    // Posters size to their unit: tall gondolas carry the classic big
    // one-sheet; the LOW see-over end units carry a shorter poster that
    // fits the low cap panel.
    const PW = Math.min(0.82, LAYOUT.islands.width - 0.16);
    // (PW scales with the island width so the border frame stays on the cap)
    const borderMat = new THREE.MeshStandardMaterial({ color: '#0e1734', roughness: 0.4, metalness: 0.5 });

    const makeCap = (item, x, z, rotY, outward, sp) => {
      const tall = !sp || sp.height >= 1.3;      // low see-over end units → small poster
      // posters keep their proportions on the slim caps (PW tracks width)
      const sc = PW / 0.82;
      const PH = (tall ? 1.08 : 0.72) * sc, Y = (tall ? 0.75 : 0.58) * sc + 0.10;
      const cv = document.createElement('canvas');
      cv.width = 168; cv.height = Math.round(168 * PH / PW);
      drawPlaceholderCover(cv.getContext('2d'), 0, 0, cv.width, cv.height, item);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;

      const border = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.09, PH + 0.09), borderMat);
      border.position.set(x + outward * 0.012, Y, z);
      border.rotation.y = rotY;
      group.add(border);
      islandPosters.push({ mesh: border });

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(PW, PH),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      );
      mesh.position.set(x + outward * 0.02, Y, z);
      mesh.rotation.y = rotY;
      group.add(mesh);
      islandPosters.push({ mesh, tex, cv });

      const url = api.posterUrl(item);
      if (url) {
        const img = new Image();
        img.onload = () => {
          const gg = cv.getContext('2d');
          const sc = Math.max(cv.width / img.width, cv.height / img.height);
          gg.drawImage(img, (cv.width - img.width * sc) / 2, (cv.height - img.height * sc) / 2, img.width * sc, img.height * sc);
          tex.needsUpdate = true;
        };
        img.src = url;
      }
    };

    specs.forEach((sp, i) => {
      // center-aisle tip — faces the main aisle
      makeCap(picks[(i * 2) % picks.length], sp.xTip, sp.cz, -sp.side * Math.PI / 2, -sp.side, sp);
      // wall-lane cap — mirrors the tip, faces the wall shelves
      makeCap(picks[(i * 2 + 1) % picks.length], sp.xBack, sp.cz, sp.side * Math.PI / 2, sp.side, sp);
    });
  }

  return { group, rebuild, applyTheme, rebuildIslandPosters,
    signBoxes: () => signMeshes.map(m => ({ x: m.position.x, y: m.position.y, z: m.position.z,
      w: m.geometry.parameters?.width || 0, h: m.geometry.parameters?.height || 0, d: m.geometry.parameters?.depth || 0 })) };
}
