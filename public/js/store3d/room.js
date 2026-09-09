// ─────────────────────────────────────────────────────────────────────────────
//  store3d/room.js — the sales floor: floor, walls, ceiling, lights, door
//  ───────────────────────────────────────────────────────────────────────────
//  A warm, cozy 40×30ft box. The entry door (with the big store logo above it)
//  is centered on the back wall; the TV wall is at the far end. Warm overhead
//  panels + soft accent lighting (the shelf strips themselves live in
//  shelves.js). Everything recolors live from the user's personal theme.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT } from './config.js?v=1788937971857';
import { wallTexture, floorTexture, ceilingTexture, signTexture, logoTexture } from './textures.js?v=1788937971857';

export function buildRoom(theme) {
  const L = LAYOUT;
  const W = L.room.w / 2, D = L.room.l / 2, H = L.room.h;
  const group = new THREE.Group();
  group.name = 'room';

  // ── materials (kept so applyTheme can recolor them) ──
  const mats = {
    floor: new THREE.MeshStandardMaterial({ map: floorTexture(theme.floor), roughness: 0.95 }),
    wall:  new THREE.MeshStandardMaterial({ map: wallTexture(theme.wall), roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ map: ceilingTexture('#c9d2e6'), roughness: 0.95 }),
    trim: new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.25, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: '#d6ecff', transparent: true, opacity: 0.13, roughness: 0.03, metalness: 0.05 })
  };

  // ── floor + center-aisle runner ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.room.w, L.room.l), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // t90 FIX: the aisle runner is 10%-opacity decor hovering a hair above the
  // floor — it must NEVER write depth. At grazing angles down the long aisle,
  // a 6mm offset is below depth precision and the runner fought the floor for
  // pixels (the angle-dependent gray flicker straight ahead from the entry).
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(LAYOUT.islands.tipX * 2 - 0.35, L.room.l - 1.6),
    new THREE.MeshStandardMaterial({ color: theme.accent, roughness: 0.95, transparent: true, opacity: 0.10, depthWrite: false })
  );
  runner.rotation.x = -Math.PI / 2;
  runner.position.y = 0.012;   // and a touch higher, so the blend is unambiguous
  group.add(runner);

  // ── walls ──
  // Walls are SOLID BOXES with real thickness (LAYOUT.room.wallThickness),
  // placed OUTSIDE the interior face lines so the room's inner dimensions
  // (and every shelf/collider) stay exact. The back wall has a real DOOR
  // OPENING (door + frame width, header above) with an actual REVEAL you
  // see through the glass — exterior geometry mounts on the outer face
  // (exterior.js), so nothing can bleed through a paper-thin wall anymore.
  const T = LAYOUT.room.wallThickness;
  const doorCut = L.door.width + 0.30;                    // opening incl. frame
  const headerH = H - (L.door.height + 0.16);             // solid wall above the frame
  const sideW = (L.room.w - doorCut) / 2;
  // The FAR wall now has the THEATER doorway (centered) — same real
  // reveal construction as the entry door. The theater room itself is
  // built by buildTheater() below; walkable rects live in controls.js.
  const th = L.theater, thDoor = th.door;
  const thCut = thDoor.width + 0.30;                       // opening incl. frame
  const thSideW = (L.room.w - thCut) / 2;
  const thHeaderH = H - (thDoor.height + 0.16);
  const wallBoxes = [
    // far wall: left of the theater door, right of it, header above
    { size: [thSideW, H, T], pos: [-(thCut / 2 + thSideW / 2), H / 2, -D - T / 2] },
    { size: [thSideW, H, T], pos: [(thCut / 2 + thSideW / 2), H / 2, -D - T / 2] },
    { size: [thCut, thHeaderH, T], pos: [0, thDoor.height + 0.16 + thHeaderH / 2, -D - T / 2] },
    // back wall: left of door, right of door, header above
    { size: [sideW, H, T], pos: [-(doorCut / 2 + sideW / 2), H / 2, D + T / 2] },
    { size: [sideW, H, T], pos: [(doorCut / 2 + sideW / 2), H / 2, D + T / 2] },
    { size: [doorCut, headerH, T], pos: [0, L.door.height + 0.16 + headerH / 2, D + T / 2] },
    // side walls — span full length incl. corners
    { size: [T, H, L.room.l + 2 * T], pos: [-W - T / 2, H / 2, 0] },
    { size: [T, H, L.room.l + 2 * T], pos: [W + T / 2, H / 2, 0] }
  ];
  for (const w of wallBoxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...w.size), mats.wall);
    m.position.set(...w.pos);
    group.add(m);
  }

  // ── ceiling ──
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(L.room.w, L.room.l), mats.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);

  // ── warm overhead light panels (two rows across the sales floor) ──
  const panelMat = new THREE.MeshStandardMaterial({
    color: '#fff6e8', emissive: '#ffedd6', emissiveIntensity: 1.5, roughness: 0.4
  });
  const panelGeo = new THREE.BoxGeometry(2.4, 0.07, 0.95);
  for (const z of [-4.5, -1.5, 1.5, 4.5]) {
    for (const x of [-3.2, 0, 3.2]) {
      const p = new THREE.Mesh(panelGeo, panelMat);
      p.position.set(x, H - 0.075, z);
      group.add(p);
    }
  }
  // two accent panels over the center aisle
  const accentPanelMat = new THREE.MeshStandardMaterial({
    color: theme.accent, emissive: theme.accent, emissiveIntensity: 1.1, roughness: 0.4
  });
  for (const z of [-3, 0, 3]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.8), accentPanelMat);
    p.position.set(0, H - 0.075, z);
    group.add(p);
  }

  // ── trim: baseboards + a neon strip where wall meets ceiling ──
  const strip = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.trim);
    m.position.set(x, y, z);
    group.add(m);
  };
  strip(L.room.w, 0.10, 0.05, 0, 0.055, -D + 0.03);
  // t47: front-wall baseboard SPLITS around the doorway (no trim across the door)
  { const hw = (L.room.w - L.door.width) / 2 - 0.15;
    strip(hw, 0.10, 0.05, -(L.door.width / 2 + 0.15 + hw / 2), 0.055, D - 0.03);
    strip(hw, 0.10, 0.05, (L.door.width / 2 + 0.15 + hw / 2), 0.055, D - 0.03); }
  strip(0.05, 0.10, L.room.l, -W + 0.03, 0.055, 0);
  strip(0.05, 0.10, L.room.l, W - 0.03, 0.055, 0);
  strip(L.room.w, 0.05, 0.05, 0, H - 0.045, -D + 0.05);
  strip(L.room.w, 0.05, 0.05, 0, H - 0.045, D - 0.05);
  strip(0.05, 0.05, L.room.l, -W + 0.05, H - 0.045, 0);
  strip(0.05, 0.05, L.room.l, W - 0.05, H - 0.045, 0);

  // ── back wall: entry door (centered) ──
  const dw = L.door.width, dh = L.door.height;
  const frameMat = new THREE.MeshStandardMaterial({ color: '#1c2438', roughness: 0.5, metalness: 0.3 });
  // Everything in the DOOR assembly is clickable: it copies the SUPPORT
  // link — "support this and other projects" (scene.js raycasts these).
  const portalMeshes = [];
  const WC = D + T / 2;   // center of the wall reveal — where a door really sits
  const frame = (w, h, d, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.position.set(x, y, WC);
    group.add(m);
    portalMeshes.push(m);
  };
  frame(dw + 0.44, 0.16, 0.24, 0, dh + 0.08);          // header spans past both posts
  frame(0.20, dh, 0.24, -dw / 2 - 0.10, dh / 2);        // posts OVERLAP the wall's cut
  frame(0.20, dh, 0.24, dw / 2 + 0.10, dh / 2);         // edge — no slit to daylight
  // (t47: the static glass is gone — the FRONT HALL's sliding door panels now
  //  live in this reveal; see hall.js. The casing above stays.)
  // (The hanging "OPEN" sign was removed on purpose — a door rework is
  //  coming next. The panes above are real see-through glass.)
  const mat0 = new THREE.Mesh(
    new THREE.BoxGeometry(dw, 0.02, 1.1),
    new THREE.MeshStandardMaterial({ color: '#20264a', roughness: 1 })
  );
  mat0.position.set(0, 0.012, D - 0.65);
  group.add(mat0);

  // ── big store logo on the back wall, above the door (seen when you turn around) ──
  let logoTex = logoTexture(theme.accent);
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6 * (384 / 2048)),
    new THREE.MeshBasicMaterial({ map: logoTex, toneMapped: false })
  );
  logo.position.set(0, L.room.h - 0.51, D - 0.06);   // rides with the ceiling (top edge ~0.08 m below it)
  logo.rotation.y = Math.PI;
  group.add(logo);
  portalMeshes.push(logo);   // the big sign copies the support link too

  // ── lighting: warm ambient + a few soft points ──
  const hemi = new THREE.HemisphereLight(0xfff0dd, 0x2a3050, 1.5);
  const dir = new THREE.DirectionalLight(0xffe9c4, 1.55);
  dir.position.set(4, 8, 6);
  group.add(hemi, dir);
  for (const z of [-4, 0, 4]) {
    const l = new THREE.PointLight(0xfff2df, 13, 10, 1.9);
    l.position.set(0, H - 0.5, z);
    group.add(l);
  }
  // soft accent fill over the center aisle
  const accentLight = new THREE.PointLight(new THREE.Color(theme.accent), 4.5, 8, 2);
  accentLight.position.set(0, H - 0.6, 0);
  group.add(accentLight);

  // ── live theme recoloring ──
  function applyTheme(t) {
    mats.floor.map?.dispose();
    mats.floor.map = floorTexture(t.floor);
    mats.floor.needsUpdate = true;
    mats.wall.map?.dispose();
    mats.wall.map = wallTexture(t.wall);
    mats.wall.needsUpdate = true;
    mats.trim.color.set(t.accent);
    mats.trim.emissive.set(t.accent);
    accentPanelMat.color.set(t.accent);
    accentPanelMat.emissive.set(t.accent);
    accentLight.color.set(t.accent);
    runner.material.color.set(t.accent);
    logoTex?.dispose();
    logoTex = logoTexture(t.accent);
    logo.material.map = logoTex;
    logo.material.needsUpdate = true;
  }

  // ── t55: the STORE'S 7.1 — real cabinets on the walls, all aimed at the
  //    room center, bass cabinet on the floor by the jukebox ──
  const LISTENER = { x: 0, y: 1.6, z: 0 };
  const cabMat = new THREE.MeshStandardMaterial({ color: '#14161d', roughness: 0.55, metalness: 0.2 });
  const ringMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.5 });
  const SATS = [
    { id: 'C', x: 0, y: 3.98, z: -D + 0.22 },            // above the TV
    { id: 'FL', x: -W + 0.35, y: 3.98, z: -D + 0.85 },   // front corners
    { id: 'FR', x: W - 0.35, y: 3.98, z: -D + 0.85 },
    { id: 'SL', x: -W + 0.18, y: 3.98, z: -2.0 },       // t58: BETWEEN the wall-band signs
    { id: 'SR', x: W - 0.18, y: 3.98, z: -2.0 },
    { id: 'BL', x: -W + 0.35, y: 3.98, z: D - 0.85 },    // back corners (door wall)
    { id: 'BR', x: W - 0.35, y: 3.98, z: D - 0.85 }
  ];
  for (const sp of SATS) {
    const cab = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.26), cabMat); cab.add(box);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 20), ringMat.clone());
    ring.position.set(0, 0.08, 0.135); cab.add(ring);
    const ring2 = ring.clone(); ring2.position.y = -0.12; ring2.scale.setScalar(0.72); cab.add(ring2);
    cab.rotation.order = 'YXZ';
    cab.position.set(sp.x, sp.y, sp.z);
    cab.rotation.y = Math.atan2(LISTENER.x - sp.x, LISTENER.z - sp.z);   // aimed at the room center
    cab.rotation.x = -0.22;   // t58: higher mount → steeper downtilt
    group.add(cab);
  }
  const SUB = { x: -4.35, y: 0.31, z: -D + 0.16 };         // t58: SHALLOW + flush to the wall —
  const SUB_D = 0.30;                                       // front never passes the jukebox's
  const subCab = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, SUB_D), new THREE.MeshStandardMaterial({ color: '#101218', roughness: 0.7 })); subCab.add(shell);
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 20),
    new THREE.MeshStandardMaterial({ color: '#05060a', emissive: theme.accent, emissiveIntensity: 0.3 }));
  mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 0.1, SUB_D / 2 + 0.02); subCab.add(mouth);
  subCab.rotation.order = 'YXZ';
  subCab.position.set(SUB.x, SUB.y, SUB.z);
  subCab.rotation.y = Math.atan2(LISTENER.x - SUB.x, LISTENER.z - SUB.z);
  subCab.rotation.x = -0.08;
  group.add(subCab);
  const speakerWorld = { sats: SATS.map(({ x, y, z }) => ({ x, y, z })), subs: [SUB], center: { ...LISTENER } };

  return { group, applyTheme, portalMeshes, speakerWorld };
}

// ─────────────────────────────────────────────────────────────────────────────
//  THEATER — the screening room behind the far wall. Movies play on the big
//  wall-mounted screen (tv.js drives its texture); you feed the DECK a case
//  you carried in. Includes seats, a stage step, a projector box and sconces.
// ─────────────────────────────────────────────────────────────────────────────
// The 8.2 SURROUND layout — one definition drives BOTH the visible speaker
// cabinets (buildTheater) and the audio routing (tv.js): mains flanking the
// screen, a sub under each, sides mid-way up the side walls, rears flanking
// the back wall. Positions are world-space.
export function computeTheaterSpeakers() {
  const L = LAYOUT, th = L.theater;
  const D = L.room.l / 2, T = L.room.wallThickness;
  const W = th.w / 2, LEN = th.l, H = th.h;
  const z0 = -D - T, zc = z0 - LEN / 2;
  const scrZ = zc - LEN / 2 + 0.16;
  const sideZ = z0 - LEN * 0.52;
  return [
    { id: 'FL', kind: 'main', x: -(th.screen.w / 2 + 0.55), y: 1.45, z: scrZ, ry: 0 },
    { id: 'FR', kind: 'main', x: (th.screen.w / 2 + 0.55), y: 1.45, z: scrZ, ry: 0 },
    { id: 'SUB-L', kind: 'sub', x: -(th.screen.w / 2 + 0.85), y: 0.22, z: scrZ + 0.06, ry: 0 },
    { id: 'SUB-R', kind: 'sub', x: (th.screen.w / 2 + 0.85), y: 0.22, z: scrZ + 0.06, ry: 0 },
    { id: 'SL', kind: 'side', x: -(W - 0.12), y: H - 0.55, z: sideZ, ry: Math.PI / 2 },
    { id: 'SR', kind: 'side', x: (W - 0.12), y: H - 0.55, z: sideZ, ry: -Math.PI / 2 },
    { id: 'BL', kind: 'rear', x: -(th.door.width / 2 + 0.62), y: H - 0.55, z: z0 - 0.08, ry: Math.PI },
    { id: 'BR', kind: 'rear', x: (th.door.width / 2 + 0.62), y: H - 0.55, z: z0 - 0.08, ry: Math.PI }
  ];
}

export function buildTheater(theme) {
  const L = LAYOUT, th = L.theater, slope = th.slope;
  const D = L.room.l / 2, T = L.room.wallThickness;
  const W = th.w / 2, LEN = th.l, H = th.h;
  const z0 = -D - T;                    // theater side of the shared wall
  const zc = z0 - LEN / 2;              // theater center z
  const group = new THREE.Group();
  group.name = 'theater';
  const colliders = [];

  const carpet = new THREE.MeshStandardMaterial({ color: '#3d2436', roughness: 1 });
  const dimWall = new THREE.MeshStandardMaterial({ color: '#241a2e', roughness: 0.95 });
  const wood = new THREE.MeshStandardMaterial({ color: '#3b2a1c', roughness: 0.7 });
  const seatMat = new THREE.MeshStandardMaterial({ color: '#7a1f2b', roughness: 0.85 });
  const metal = new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 0.35, metalness: 0.7 });

  // ── floor: FLAT entry landing at store level, then ONE CONTINUOUS SLOPE
  //    down toward the screen (real theater rake). hAt(z) is the shared
  //    analytic — the walkable floor in controls.js matches it exactly.
  const hAt = (z) => {
    const run = LEN - slope.landing;
    const d = z0 - slope.landing - z;               // distance past the landing
    return -Math.max(0, Math.min(slope.drop, d * slope.drop / run));
  };
  // landing strip ONLY (a full-room plane would slice through the slope)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(th.w, slope.landing), carpet);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, z0 - slope.landing / 2); group.add(floor);
  const run = LEN - slope.landing;
  const ang = Math.atan2(slope.drop, run);          // shallow rake
  const slabLen = Math.hypot(run, slope.drop);
  // BoxGeometry length already runs along z — tilt it ONLY by the rake angle
  // (a −90° flip would stand it on edge). Top face = the walking surface,
  // matching hAt() exactly; far (−z) edge rests at −drop.
  const slab = new THREE.Mesh(new THREE.BoxGeometry(th.w, 0.16, slabLen), carpet);
  slab.rotation.x = -ang;
  slab.position.set(0, -slope.drop / 2 - 0.08 / Math.cos(ang), z0 - slope.landing - run / 2);
  group.add(slab);
  // skirt under the slab's low edge so you never see under the floor at the screen wall
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(th.w, slope.drop + 0.1, 0.1), dimWall);
  skirt.position.set(0, -(slope.drop + 0.1) / 2, zc - LEN / 2 + 0.05); group.add(skirt);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(th.w, LEN),
    new THREE.MeshStandardMaterial({ color: '#1c1522', roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, zc); group.add(ceil);

  const occluders = [];   // t41: walls & doors — clicks cannot pass through these

  // ── walls: SOLID BOXES with real depth — STRETCHED DOWN so they meet
  //    the sloped floor at its lowest (screen-end) point ──
  const wallBot = -(slope.drop + 0.35);             // below the deepest floor point
  const wallH = H - wallBot;
  for (const side of [-1, 1]) {
    // t92 FIX: LEN + 2*T centered at zc pushed these walls THROUGH the
    // shared wall — their end faces landed at z = -6.095, exactly the store's
    // back-wall surface (coplanar, same-facing) → dark z-fight patches left
    // & right of the theater door, "showing through" onto the back wall
    // (same disease as the t91 ceiling band). Length LEN + T, centered
    // zc - T/2: near end stops at the shared wall's theater-side face; the
    // far end still reaches the screen wall's outer face for corner
    // coverage (that face looks out into unseen void — nothing to fight).
    const w = new THREE.Mesh(new THREE.BoxGeometry(T, wallH, LEN + T), dimWall);
    w.position.set(side * (W + T / 2), wallBot + wallH / 2, zc - T / 2); group.add(w);
    occluders.push(w);
  }
  const far = new THREE.Mesh(new THREE.BoxGeometry(th.w + 2 * T, wallH, T), dimWall);
  far.position.set(0, wallBot + wallH / 2, zc - LEN / 2 - T / 2); group.add(far);
  occluders.push(far);

  // door CASING inside the shared-wall reveal — the opening gets real depth
  const casingMat = new THREE.MeshStandardMaterial({ color: '#171122', roughness: 0.5, metalness: 0.25 });
  const dw = th.door.width, dh = th.door.height, cz = -D - T / 2;
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, dh + 0.12, T + 0.1), casingMat);
    post.position.set(sx * (dw / 2 + 0.13), (dh + 0.12) / 2, cz); group.add(post);   // overlaps the cut edge
    occluders.push(post);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.52, 0.12, T + 0.1), casingMat);
  header.position.set(0, dh + 0.12, cz); group.add(header);
  occluders.push(header);
  const threshold = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.52, 0.03, T + 0.1), metal);
  threshold.position.set(0, 0.015, cz); group.add(threshold);

  // ── lights (dimmable — see setPlaying) ──
  const sconceMeshes = [], sconceLights = [];
  for (const sx of [-1, 1]) for (const sz of [z0 - 2.2, z0 - 4.9]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.12),
      new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffbf78', emissiveIntensity: 1.6 }));
    m.position.set(sx * (W - 0.06), 1.9, sz); group.add(m); sconceMeshes.push(m);
    const pl = new THREE.PointLight(0xffc98a, 3.2, 4.6, 2);
    pl.position.set(sx * (W - 0.45), 2.05, sz); group.add(pl); sconceLights.push(pl);
  }
  const aisleLight = new THREE.PointLight(0xffc98a, 1.4, 3.6, 2);
  aisleLight.position.set(0, -0.1, z0 - slope.landing - run / 2); group.add(aisleLight);
  const fill = new THREE.PointLight(0xb9a8ff, 2.2, 9, 1.6);   // soft front fill — never pitch black
  fill.position.set(0, 3.1, zc - 2); group.add(fill);
  const screenGlow = new THREE.PointLight(0x9fb4ff, 3.5, 9, 1.8);
  screenGlow.position.set(0, th.screen.cy, zc - LEN / 2 + 1.5); group.add(screenGlow);

  // stage step under the screen
  const stage = new THREE.Mesh(new THREE.BoxGeometry(th.screen.w + 1.1, 0.3, 1.15), wood);
  stage.position.set(0, hAt(zc - LEN / 2 + 0.62) + 0.15, zc - LEN / 2 + 0.62); group.add(stage);
  // (t41: no collider — the stage is a STEP you walk up onto; see floorHeightAt)

  // ── the player DECK — at the BACK of the room on the flat landing (like
  //    a projection-booth counter). Cases get fed HERE. VHS·DVD·Blu-ray. ──
  const deckTargets = [];
  const deck = new THREE.Group();
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.95, 0.5), wood);
  ped.position.y = 0.475; deck.add(ped);
  const unit = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.15, 0.46), metal);
  unit.position.y = 1.0; deck.add(unit);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 0.1),
    new THREE.MeshStandardMaterial({ color: '#08090d', emissive: theme.accent, emissiveIntensity: 0.7 }));
  slot.position.set(0, 1.08, 0.15); deck.add(slot);
  const labelTex = signTexture('VHS · DVD · BLU-RAY', { accent: theme.accent, bg: '#160f1e', width: 768, height: 128 });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.1),
    new THREE.MeshBasicMaterial({ map: labelTex, toneMapped: false }));
  label.position.set(0, 0.80, 0.251); deck.add(label);   // t46: just under the player unit
  const deckLight = new THREE.PointLight(new THREE.Color(theme.accent), 1.6, 1.8, 2);
  deckLight.position.set(0, 1.5, 0); deck.add(deckLight);
  deck.position.set(0, 0, z0 - 3.7);              // t41: snugged right up against the BACK of the
                                              // chair backs — one counter, not a spread of boxes
  group.add(deck);
  deckTargets.push(ped, unit, slot, label);
  colliders.push({ minX: deck.position.x - 0.48, maxX: deck.position.x + 0.48,
    minZ: deck.position.z - 0.4, maxZ: deck.position.z + 0.4 });

  // ── seats: DREAM-LOUNGER recliners — plush individual chairs with real
  //    walk-through gaps between chairs (and between rows). No bench boxes,
  //    no full-row collider: each chair has its own slim collider so the
  //    0.8 m gaps are genuinely walkable.
  const loungeMat = new THREE.MeshStandardMaterial({ color: '#2c2f38', roughness: 0.94, metalness: 0.02 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#191b21', roughness: 0.85 });
  const glowMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.35, roughness: 0.6 });
  const PITCH = 1.65, CHAIR_W = 0.92;                    // 0.73 m visual gap between chairs
  const buildLounger = (cx, cz, y) => {
    const ch = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.5), trimMat);          // pedestal
    ped.position.set(0, 0.1, 0.02); ch.add(ped);
    const seatC = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.17, 0.6), loungeMat);     // seat cushion
    seatC.position.set(0, 0.44, 0.05); seatC.rotation.x = 0.1; ch.add(seatC);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.09, 0.38), loungeMat);     // raised footrest
    foot.position.set(0, 0.33, 0.48); foot.rotation.x = -0.42; ch.add(foot);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.8, 0.2), loungeMat);       // laid-back backrest
    back.position.set(0, 0.92, -0.3); back.rotation.x = -0.32; ch.add(back);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 0.16), loungeMat);      // headrest
    head.position.set(0, 1.4, -0.43); head.rotation.x = -0.32; ch.add(head);
    const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.035, 0.02), glowMat);      // accent piping
    pipe.position.set(0, 1.29, -0.345); pipe.rotation.x = -0.32; ch.add(pipe);
    for (const ax of [-1, 1]) {                                                          // plush arms + cupholders
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.62), loungeMat);
      arm.position.set(ax * 0.42, 0.6, 0.05); ch.add(arm);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), trimMat);
      cup.position.set(ax * 0.42, 0.8, 0.12); ch.add(cup);
    }
    ch.rotation.y = Math.PI;                    // face the screen (−z), backs to the entry
    ch.position.set(cx, y, cz);
    group.add(ch);
    colliders.push({ minX: cx - 0.4, maxX: cx + 0.4, minZ: cz - 0.42, maxZ: cz + 0.42 });
  };
  const seatRowZ = [z0 - slope.landing - 0.7, z0 - slope.landing - 2.5, z0 - slope.landing - 4.3];
  for (const rz of seatRowZ) {
    const y = hAt(rz);
    for (const cx of [-2 * PITCH, -PITCH, 0, PITCH, 2 * PITCH]) buildLounger(cx, rz, y);
  }
  const seatsInfo = () => ({
    rows: seatRowZ.length, perRow: 5, pitch: PITCH, chairW: CHAIR_W,
    walkGap: PITCH - 0.8,                       // clear space between chair colliders (must beat 2× player radius)
    frontRowZ: seatRowZ[seatRowZ.length - 1],
    wallZ: zc - LEN / 2,
    frontClear: seatRowZ[seatRowZ.length - 1] - (zc - LEN / 2)   // row is nearer the door than the wall → positive
  });

  // ── 8.2 SURROUND: visible cabinets at every audio position ──
  const cabMat = new THREE.MeshStandardMaterial({ color: '#14161d', roughness: 0.55, metalness: 0.2 });
  const coneMat = new THREE.MeshStandardMaterial({ color: '#0a0b0f', emissive: theme.accent, emissiveIntensity: 0.25, roughness: 0.85 });
  for (const sp of computeTheaterSpeakers()) {
    const g2 = new THREE.Group();
    const big = sp.kind === 'sub';
    const box = new THREE.Mesh(
      big ? new THREE.BoxGeometry(0.5, 0.44, 0.42) : new THREE.BoxGeometry(0.3, 0.5, 0.26), cabMat);
    g2.add(box);
    const cone = new THREE.Mesh(new THREE.CircleGeometry(big ? 0.15 : 0.1, 18), coneMat);
    cone.position.z = (big ? 0.42 : 0.26) / 2 + 0.005;
    g2.add(cone);
    g2.position.set(sp.x, sp.y, sp.z);
    g2.rotation.y = sp.ry;
    group.add(g2);
  }

  // ── RETURN CHUTE — tucked UNDER the player deck (t41: one counter, not two
  //    floor boxes). Feed tapes up top, drop returns into the slot below.
  const binTargets = [];
  const chute = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.2, 0.18),
    new THREE.MeshStandardMaterial({ color: '#0a0b10', roughness: 0.35, metalness: 0.3 }));
  chute.position.set(0, 0.42, 0.29); deck.add(chute);          // protrudes from the pedestal front
  const chuteMouth = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.05),
    new THREE.MeshStandardMaterial({ color: '#000', emissive: theme.accent, emissiveIntensity: 0.4 }));
  chuteMouth.position.set(0, 0.47, 0.375); deck.add(chuteMouth);
  const chuteLabelTex = signTexture('📥 RETURNS', { accent: theme.accent, bg: '#160f1e', width: 512, height: 128 });
  const chuteLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.13),
    new THREE.MeshBasicMaterial({ map: chuteLabelTex, toneMapped: false }));
  chuteLabel.position.set(0, 0.58, 0.252); deck.add(chuteLabel);   // t46: just above the return slot
  binTargets.push(chute, chuteMouth, chuteLabel);

  // ── projector on the ceiling at the BACK, aimed at the screen ──
  const screenPt = new THREE.Vector3(0, th.screen.cy, zc - LEN / 2 + 0.12);
  const proj = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.5), metal);
  proj.position.set(0, H - 0.5, z0 - 2.3); group.add(proj);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16),
    new THREE.MeshBasicMaterial({ color: '#cfe2ff', toneMapped: false }));
  lens.position.z = 0.26; proj.add(lens);
  proj.lookAt(screenPt);

  // ── DOUBLE SWINGING DOORS in the reveal — they keep the store's light
  //    out of the theater. Spring open both ways as you walk through
  //    (proximity-driven, no collision), then swing shut behind you.
  const doorPanels = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * dw / 2, 0, cz);
    // LIGHT-TIGHT fit: panels overlap the center seam, reach into the header
    // pocket, and carry seam covers — nothing shows through when closed
    const panel = new THREE.Mesh(new THREE.BoxGeometry(dw / 2 + 0.02, dh + 0.04, 0.055),
      new THREE.MeshStandardMaterial({ color: '#4a2e1e', roughness: 0.6 }));
    panel.position.set(-side * (dw / 4 - 0.01), dh / 2 + 0.01, 0);
    hinge.add(panel);
    const seamMat = new THREE.MeshStandardMaterial({ color: '#3a2317', roughness: 0.55 });
    const batten = new THREE.Mesh(new THREE.BoxGeometry(0.09, dh - 0.06, 0.075), seamMat);  // center seam cover
    batten.position.set(-side * (dw / 2 - 0.02), dh / 2, 0);
    hinge.add(batten);
    const topStrip = new THREE.Mesh(new THREE.BoxGeometry(dw / 2 + 0.02, 0.1, 0.075), seamMat);  // top seam cover
    topStrip.position.set(-side * (dw / 4 - 0.01), dh + 0.02, 0);
    hinge.add(topStrip);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.02), metal);
    plate.position.set(-side * (dw / 2 - 0.3), 1.05, 0.035);
    hinge.add(plate);
    group.add(hinge);
    occluders.push(hinge);            // closed (or swinging) panels block clicks
    doorPanels.push({ hinge, side, angle: 0 });
  }
  function doorsState() { return Math.abs(doorPanels[0].angle) > 0.35 ? 'open' : 'closed'; }

  // doorway signs on both faces of the shared wall (theme-refreshed)
  const signMeshes = [];
  for (const side of [1, -1]) {
    const tex = signTexture(side === 1 ? '🎬 THEATER' : '↩ THE STORE', { accent: theme.accent, bg: '#160f1e' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    // t90 FIX: the theater-side sign used to sit at -D-0.03 — INSIDE the wall
    // slab (the wall spans -D-T…-D) — buried 22cm deep, invisible from the
    // theater. Each face's sign sits 3cm proud of ITS OWN wall face.
    sign.position.set(0, th.door.height + 0.55, side === 1 ? -D + 0.03 : -D - T - 0.03);
    if (side === -1) sign.rotation.y = Math.PI;
    group.add(sign); signMeshes.push(sign);
  }

  // ── house lights: dim on play, brighten on stop (lerped in update) ──
  const LEVELS = {
    bright: { sconce: 3.2, sconceMesh: 1.6, step: 1.4, fill: 2.2, glow: 3.5 },
    dim:    { sconce: 0.5, sconceMesh: 0.3, step: 0.35, fill: 0.85, glow: 6.5 }
  };
  let mode = 'bright', target = LEVELS.bright;
  const cur = { ...LEVELS.bright };
  const state = {
    setPlaying(p) { mode = p ? 'dim' : 'bright'; target = LEVELS[mode]; },
    update(dt, playerPos) {
      // swinging doors: open when the player is in the doorway band, spring shut
      for (const d of doorPanels) {
        const near = playerPos && Math.abs(playerPos.x) < dw / 2 + 0.6
          && playerPos.z > cz - 0.9 && playerPos.z < cz + 0.9;
        // double-acting: push INTO the theater when coming from the store,
        // INTO the store when leaving — never locked to one direction
        const dir = playerPos && playerPos.z > cz ? -1 : 1;
        const target = near ? dir * d.side * 1.15 : 0;
        // direct exponential approach — stable at ANY frame rate (the render
        // loop clamps dt, so a spring would oscillate on slow machines)
        d.angle += (target - d.angle) * Math.min(1, dt * 9);
        d.hinge.rotation.y = d.angle;
      }
      const k = Math.min(1, dt * 2.6);
      for (const key of Object.keys(cur)) cur[key] += (target[key] - cur[key]) * k;
      for (const l of sconceLights) l.intensity = cur.sconce;
      for (const m of sconceMeshes) m.material.emissiveIntensity = cur.sconceMesh;
      aisleLight.intensity = cur.step;
      fill.intensity = cur.fill;
      screenGlow.intensity = cur.glow;
    },
    lightState: () => mode,
    seatsInfo,
    screenInfo: () => ({ w: th.screen.w, h: th.screen.w * 9 / 16, cy: th.screen.cy, z: zc - LEN / 2 + 0.12 }),
    doorsState
  };

  return {
    group, colliders, deckTargets, binTargets, occluders,
    deckPos: { x: deck.position.x, y: deck.position.y, z: deck.position.z },
    screen: { w: th.screen.w, h: th.screen.w * 9 / 16, cy: th.screen.cy, z: zc - LEN / 2 + 0.12 },
    ...state,
    applyTheme(t) {
      slot.material.emissive.set(t.accent);
      deckLight.color.set(t.accent);
      // signs + bin label redraw with the new accent
      for (const sign of signMeshes) {
        const isStore = sign.rotation.y !== 0;
        sign.material.map?.dispose();
        sign.material.map = signTexture(isStore ? '↩ THE STORE' : '🎬 THEATER', { accent: t.accent, bg: '#160f1e' });
        sign.material.needsUpdate = true;
      }
      chuteLabel.material.map?.dispose();
      chuteLabel.material.map = signTexture('📥 RETURNS', { accent: t.accent, bg: '#160f1e', width: 512, height: 128 });
      chuteLabel.material.needsUpdate = true;
      chuteMouth.material.emissive.set(t.accent);
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  JUKEBOX — music now lives here (in the old TV wall's corner). Click it to
//  browse every album / station / podcast on the shelves and start one.
// ─────────────────────────────────────────────────────────────────────────────
export function buildJukebox(theme) {
  const L = LAYOUT;
  const D = L.room.l / 2;
  const group = new THREE.Group();
  group.name = 'jukebox';
  const targets = [];
  const chrome = new THREE.MeshStandardMaterial({ color: '#cdd2da', roughness: 0.15, metalness: 0.92 });
  const red = new THREE.MeshStandardMaterial({ color: '#a31230', roughness: 0.28, metalness: 0.4 });
  const walnut = new THREE.MeshStandardMaterial({ color: '#3b2417', roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#12070d', roughness: 0.4 });

  // cabinet — slim wall profile (~24 cm deep)
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.14, 0.06), walnut);
  back.position.set(0, 0, 0.03); group.add(back);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.04, 0.2), red);
  body.position.set(0, -0.03, 0.16); group.add(body);
  targets.push(body);

  // THE CROWN — a glowing cathedral arch (half-cylinder shell, translucent)
  // t92 FIX: the crown was a half-cylinder with thetaStart 0 → after the
  // rotation only the RIGHT half of the arch existed (left side had no
  // geometry — flat-topped and see-through from oblique angles; the tubes
  // were always built symmetrically for a full arch). thetaStart π/2 spans
  // the full cathedral arch, left AND right; DoubleSide renders the inside
  // of the glowing shell so you can't see through it.
  const archMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffe9b8',
    emissiveIntensity: 1.15, transparent: true, opacity: 0.88, roughness: 0.25, side: THREE.DoubleSide });
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.2, 28, 1, true, Math.PI / 2, Math.PI), archMat);
  arch.rotation.x = Math.PI / 2;          // axis along z — arch spans the top
  arch.position.set(0, 0.55, 0.16);
  group.add(arch);
  targets.push(arch);
  // chrome edge following the arch chord + corners
  const chord = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.045, 0.22), chrome);
  chord.position.set(0, 0.56, 0.16); group.add(chord);
  for (const sx of [-0.47, 0.47]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.16, 0.24), chrome);
    col.position.set(sx, 0.0, 0.16); group.add(col);
  }

  // BUBBLE TUBES — four glowing columns inside the arch, boiling with color
  const tubes = [];
  const TUBE_PAL = ['#ff5d8f', '#ffc857', '#5dd6ff', '#8bff7a'];
  for (let i = 0; i < 4; i++) {
    const tx = -0.3 + i * 0.2;
    const th = Math.sqrt(Math.max(0.04, 0.47 * 0.47 - tx * tx)) - 0.04;  // follow the arch
    const tube = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, th, 3, 10),
      new THREE.MeshStandardMaterial({ color: TUBE_PAL[i], emissive: TUBE_PAL[i], emissiveIntensity: 1.4, roughness: 0.2 }));
    tube.position.set(tx, 0.55 + th / 2 - 0.06, 0.16);
    group.add(tube); tubes.push(tube);
  }

  // curved fan grille over the speaker — a quarter-slice of cylinder, warm-lit
  const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.34, 22, 1, true, -0.62, 1.24),
    new THREE.MeshStandardMaterial({ color: '#1a0c12', roughness: 0.35, metalness: 0.5, side: THREE.DoubleSide }));
  grille.rotation.x = Math.PI / 2; grille.rotation.z = -Math.PI / 2;
  grille.position.set(0, -0.18, 0.26); group.add(grille);
  targets.push(grille);
  const grilleGlow = new THREE.PointLight(0xffb27a, 1.5, 1.7, 2);
  grilleGlow.position.set(0, -0.15, 0.5); group.add(grilleGlow);

  // selection face: title window + push-button row + coin slot
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.3, 0.05), dark);
  face.position.set(0, 0.2, 0.27); group.add(face);
  const btnTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
    const g2 = cv.getContext('2d');
    g2.fillStyle = '#0d0509'; g2.fillRect(0, 0, 256, 96);
    g2.fillStyle = '#ffd9ec'; g2.font = '700 30px monospace'; g2.textAlign = 'center';
    g2.fillText('🎵 JUKEBOX', 128, 40);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 8; c++) {
      g2.fillStyle = ['#ff5d8f', '#ffc857', '#5dd6ff', '#8bff7a'][(r + c) % 4];
      g2.fillRect(14 + c * 29, 56 + r * 17, 22, 11);
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const facePlate = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.27),
    new THREE.MeshBasicMaterial({ map: btnTex, toneMapped: false }));
  facePlate.position.set(0, 0.2, 0.297); group.add(facePlate);
  targets.push(facePlate);
  const coinRun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.24, 0.03), chrome);
  coinRun.position.set(-0.36, 0.2, 0.29); group.add(coinRun);

  const glow = new THREE.PointLight(new THREE.Color(theme.accent), 2.2, 3.4, 2);
  glow.position.set(0, 0.5, 0.75); group.add(glow);

  // WALL-MOUNTED on the far wall, left of the theater doorway — the floor
  // stays clear, nothing blocks the shelves anymore
  group.position.set(-3.35, 1.42, -D + 0.10);

  let tClock = 0;


  return {
    group, targets,
    colliders: [{ minX: -4.66, maxX: -4.04, minZ: -6.08, maxZ: -5.76 }],   // t58: the bass cabinet by the wall is SOLID
    update(dt) {
      tClock += dt;
      for (let i = 0; i < tubes.length; i++) {
        const boil = 0.85 + 0.55 * Math.sin(tClock * (2.2 + i * 0.6) + i * 1.7);
        tubes[i].material.emissiveIntensity = boil;
        tubes[i].position.y = 0.49 + th0(i) + Math.sin(tClock * 1.5 + i) * 0.008;
      }
      glow.intensity = 2.0 + Math.sin(tClock * 2.6) * 0.35;
      function th0(i) { const tx = -0.3 + i * 0.2; return Math.sqrt(Math.max(0.04, 0.47 * 0.47 - tx * tx)) / 2 - 0.03; }
    },
    applyTheme(t) {
      glow.color.set(t.accent);
    }
  };
}
