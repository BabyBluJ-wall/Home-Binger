// ─────────────────────────────────────────────────────────────────────────────
//  store3d/hall.js — THE FRONT HALL (t47)
//  Runs the FULL WIDTH of the store front (never beyond it). Three doors:
//   · STORE  (−z): a WORKING sliding double door into the movie store
//   · STREET (+z): a sliding door that NEVER opens — the street stays outside
//   · DANCE  (+x): a cased opening (slider) into the dance hall
//  The book room will take the −x side later.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT } from './config.js?v=1788729356586';

export function buildHall(theme) {
  const L = LAYOUT, H = L.hall.h;
  const W = L.room.w;                        // EXACTLY the store width
  const T = L.room.wallThickness;
  const Z0 = L.room.l / 2 + T;               // inner face of the store's front wall
  const Z1 = Z0 + L.hall.d;                  // the street wall
  const zc = (Z0 + Z1) / 2;
  const group = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({ color: theme.wall, roughness: 0.9 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#151824', roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: '#8b93a8', roughness: 0.35, metalness: 0.7 });
  // t48: the ORIGINAL clear-glass recipe (0.13 opacity) — from the street you
  // see straight through: street glass → hall → store glass → the movie store
  const glassMat = new THREE.MeshStandardMaterial({ color: '#d6ecff', roughness: 0.03, metalness: 0.05, transparent: true, opacity: 0.13 });
  const floorMat = new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.6 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: '#1a1f30', roughness: 1 });

  // ── shell: floor + ceiling ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L.hall.d), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, zc); group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, L.hall.d), ceilMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, zc); group.add(ceil);

  // ── walls (with openings where doors go) ──
  const occluders = [];
  const wall = (w, h, d, x, y, z) => {
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m2.position.set(x, y, z); group.add(m2); occluders.push(m2); return m2;
  };
  // +z STREET wall with a REVEAL for the locked glass door (t48: the wall was
  // solid behind the slider — the street saw a brick slab, not the store)
  { const SD = L.hall.streetDoor, swSide = (W - SD.width) / 2;
    wall(swSide, H, T, -(SD.width / 2 + swSide / 2), H / 2, Z1 + T / 2);
    wall(swSide, H, T, (SD.width / 2 + swSide / 2), H / 2, Z1 + T / 2);
    wall(SD.width, H - SD.height, T, 0, SD.height + (H - SD.height) / 2, Z1 + T / 2); }
  // −x wall (book room side, later) — solid for now
  wall(T, H, L.hall.d + T, -W / 2 - T / 2, H / 2, zc);
  // +x wall: solid EXCEPT the dance opening (z 6.6…8.6 at the front corner)
  const DZ = L.dance.door, dzC = Z1 - DZ.width / 2 - 0.35;
  // (t49: the wall itself lives in dance.js — same plane, with the true
  //  opening. hall.js keeps the CASING + slider + sign below.)
  // casing around the dance opening
  const caseMat = new THREE.MeshStandardMaterial({ color: '#171122', roughness: 0.5, metalness: 0.25 });
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(T + 0.1, DZ.height + 0.12, 0.26), caseMat);
    post.position.set(W / 2 + T / 2, (DZ.height + 0.12) / 2, dzC + sz * (DZ.width / 2 + 0.13)); group.add(post); occluders.push(post);
  }
  const dhdr = new THREE.Mesh(new THREE.BoxGeometry(T + 0.1, 0.12, DZ.width + 0.52), caseMat);
  dhdr.position.set(W / 2 + T / 2, DZ.height + 0.12, dzC); group.add(dhdr); occluders.push(dhdr);

  // ── baseboards (never across the store doorway) ──
  const bb = new THREE.MeshStandardMaterial({ color: theme.shelf, roughness: 0.7 });
  const sdw = L.door.width;
  const seg = (w, d, x, z) => { const m3 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), bb); m3.position.set(x, 0.055, z); group.add(m3); };
  seg((W - sdw) / 2 - 0.15, 0.05, -(sdw / 2 + 0.15 + (W - sdw) / 4), Z0 + 0.03);
  seg((W - sdw) / 2 - 0.15, 0.05, (sdw / 2 + 0.15 + (W - sdw) / 4), Z0 + 0.03);
  seg(W, 0.05, 0, Z1 - 0.03);
  seg(0.05, L.hall.d, -W / 2 + 0.03, zc);

  // ── ceiling lights (warm, always on — it's the lobby) ──
  for (const lx of [-W / 3, 0, W / 3]) {
    const pl = new THREE.PointLight(0xffd9a0, 1.1, 4.5, 2);
    pl.position.set(lx, H - 0.4, zc); group.add(pl);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8),
      new THREE.MeshStandardMaterial({ color: '#ffe9c8', emissive: '#ffcf94', emissiveIntensity: 1.4 }));
    dome.position.copy(pl.position); group.add(dome);
  }

  // ═══ SLIDING DOOR mechanism (shared by store + street + dance) ═══
  const sliders = [];
  const frameMat = new THREE.MeshStandardMaterial({ color: '#252a38', roughness: 0.45, metalness: 0.6 });
  function makeSlider({ atZ, width, height, axis = 'z', locked = false, x = 0 }) {
    const g2 = new THREE.Group();
    const panelW = width / 2 - 0.01;
    const panels = [];
    // header track + floor guide — the doors HANG from something (t48: no floating)
    const along = axis === 'z' ? new THREE.BoxGeometry(width + 0.3, 0.12, 0.14)
      : new THREE.BoxGeometry(0.14, 0.12, width + 0.3);
    const track = new THREE.Mesh(along, frameMat);
    track.position.set(axis === 'z' ? x : x, height + 0.06, axis === 'z' ? atZ : atZ);
    g2.add(track);
    const guide = new THREE.Mesh(along.clone(), new THREE.MeshStandardMaterial({ color: '#1a1e2a', roughness: 0.6 }));
    guide.scale.set(1, 0.4, 1); guide.position.set(track.position.x, 0.03, track.position.z);
    g2.add(guide);
    for (const side of [-1, 1]) {
      const pg = new THREE.Group();
      pg.position.set(x + side * (width / 4 - 0.005), 0, atZ);
      if (axis === 'x') pg.position.set(x, 0, atZ + side * (width / 4 - 0.005));
      // t48: CLEAR-CLEAR glass — one big pane in a SLIM dark frame (the old
      // full-panel grey boxes looked like floating slabs)
      const railT = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.07, 0.06), frameMat);
      railT.position.set(0, height - 0.035, 0); pg.add(railT);
      const railB = railT.clone(); railB.position.y = 0.045; pg.add(railB);
      const stile = new THREE.Mesh(new THREE.BoxGeometry(0.05, height - 0.1, 0.06), frameMat);
      stile.position.set(side * (panelW / 2 - 0.025), height / 2, 0); pg.add(stile);       // outer edge
      const meet = stile.clone(); meet.position.x = -side * (panelW / 2 - 0.025); pg.add(meet);  // meeting edge
      const glass = new THREE.Mesh(new THREE.BoxGeometry(panelW - 0.12, height - 0.16, 0.02), glassMat);
      glass.position.set(0, height / 2, 0); pg.add(glass);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 1.0, 0.05), metal);
      handle.position.set(-side * (panelW / 2 - 0.11), 1.05, 0.045); pg.add(handle);
      // (t49: no overlay on the glass — the street door is CLEAN clear glass;
      //  it simply never opens, and the CLOSED sign above says why)
      g2.add(pg);
      panels.push({ pg, side, open: 0 });
      occluders.push(railT, glass);
    }
    group.add(g2);
    const s2 = { panels, width, atZ, axis, x, locked, slide: 0 };
    sliders.push(s2);
    return s2;
  }

  const storeSlider = makeSlider({ atZ: Z0 + T / 2, width: sdw, height: L.door.height });        // into the store
  const streetSlider = makeSlider({ atZ: Z1 + T / 2, width: L.hall.streetDoor.width, height: L.hall.streetDoor.height, locked: true });
  // ── t50: the DANCE HALL gets SWINGING double doors (it's an exterior wall —
  //    a slider there was wrong, and its panels were built sideways anyway)
  const wallX = W / 2 + T / 2;
  const dwD = DZ.width - 0.1;
  const dPanels = [];
  const swingMat = new THREE.MeshStandardMaterial({ color: '#3a2450', roughness: 0.55, metalness: 0.15 });
  const swingTrim = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.45 });
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(wallX, 0, dzC + side * dwD / 2);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.055, DZ.height - 0.03, dwD / 2 - 0.012), swingMat);
    panel.position.set(0, (DZ.height - 0.03) / 2, -side * (dwD / 4));      // wide along Z — the WALL's direction
    hinge.add(panel);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.07, DZ.height - 0.55, 0.09), swingTrim);
    stripe.position.set(0, DZ.height / 2, -side * (dwD / 4)); hinge.add(stripe);
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 16), glassMat);
    port.rotation.z = Math.PI / 2; port.position.set(0, 1.6, -side * (dwD / 4)); hinge.add(port);   // porthole
    group.add(hinge);
    occluders.push(panel);
    dPanels.push({ hinge, side, angle: 0 });
  }

  // locked street door click targets (toast lives in main.js)
  const streetTargets = [];
  for (const p of streetSlider.panels) streetTargets.push(...p.pg.children.filter(c => c.isMesh));

  // ── signage: what's where ──
  const signTexture = (text, opts = {}) => {
    const cv = document.createElement('canvas');
    cv.width = opts.width || 512; cv.height = opts.height || 128;
    const c2 = cv.getContext('2d');
    c2.fillStyle = opts.bg || '#160f1e'; c2.fillRect(0, 0, cv.width, cv.height);
    c2.fillStyle = opts.accent || theme.accent;
    c2.font = `italic 900 ${cv.height * 0.5}px system-ui, sans-serif`;
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText(text, cv.width / 2, cv.height / 2 + 2);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  };
  const hang = (text, w, h, x, y, z, ry, opts) => {
    const m4 = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: signTexture(text, opts), toneMapped: false }));
    m4.position.set(x, y, z); m4.rotation.y = ry; group.add(m4); return m4;
  };
  const signs = [];
  signs.push(hang('🎬 MOVIES', 1.7, 0.42, 0, L.door.height + 0.5, Z0 + T + 0.02, Math.PI));
  signs.push(hang('🎧 DANCE HALL', 1.9, 0.45, W / 2 - 0.02, DZ.height + 0.42, dzC, -Math.PI / 2));
  signs.push(hang('🔒 CLOSED', 1.5, 0.4, 0, L.hall.streetDoor.height + 0.35, Z1 + T - 0.02, 0, { accent: '#ff6a6a' }));

  // ── update: proximity slide (store); street stays SHUT; dance doors SWING ──
  function update(dt, playerPos) {
    // swinging dance doors — open away from you from EITHER side, spring shut
    const dNear = playerPos && Math.abs(playerPos.z - dzC) < dwD / 2 + 1.0
      && Math.abs(playerPos.x - wallX) < 1.45;
    const dDir = playerPos && playerPos.x < wallX ? 1 : -1;
    for (const d of dPanels) {
      const target = dNear ? dDir * d.side * 1.15 : 0;
      d.angle += (target - d.angle) * Math.min(1, dt * 9);
      d.hinge.rotation.y = d.angle;
    }
    for (const s2 of sliders) {
      if (s2.locked) continue;                     // the street door never moves
      const near = playerPos && (
        (s2.axis === 'z' && Math.abs(playerPos.x - s2.x) < s2.width / 2 + 1.0
          && playerPos.z > s2.atZ - 1.45 && playerPos.z < s2.atZ + 1.45)
        || (s2.axis === 'x' && Math.abs(playerPos.z - s2.atZ) < s2.width / 2 + 1.0
          && playerPos.x > s2.x - 1.45 && playerPos.x < s2.x + 1.45)
      );
      const target = near ? 1 : 0;
      s2.slide += (target - s2.slide) * Math.min(1, dt * 5.5);
      for (const p of s2.panels) {
        const off = s2.slide * (s2.width / 2 - 0.06);
        // slide BOTH panels outward along the panel axis
        if (s2.axis === 'z') p.pg.position.x = s2.x + p.side * (s2.width / 4 - 0.005) + p.side * off;
        else p.pg.position.z = s2.atZ + p.side * (s2.width / 4 - 0.005) + p.side * off;
      }
    }
  }
  function state() {
    return {
      storeDoor: storeSlider.slide > 0.55 ? 'open' : 'closed',
      streetDoor: 'locked',
      danceDoor: Math.abs(dPanels[0].angle) > 0.35 ? 'open' : 'closed',
      danceDoorAngle: +dPanels[0].angle.toFixed(2)
    };
  }
  function info() {
    return { width: W, z0: Z0, z1: Z1, depth: L.hall.d, matchesStoreWidth: Math.abs(W - L.room.w) < 0.001,
      glassOpacity: glassMat.opacity, streetOpeningWidth: L.hall.streetDoor.width,
      streetPanelMeshes: streetSlider.panels.reduce((a, p) => a + p.pg.children.length, 0),   // 12 = clean glass, no overlays
      danceDoorType: 'swinging', danceDoorPanelSpan: 'z' };   // t50: panels run ALONG the wall (were sideways)
  }

  return { group, occluders, streetTargets, update, state, info };
}
