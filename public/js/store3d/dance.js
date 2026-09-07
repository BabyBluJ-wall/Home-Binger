// ─────────────────────────────────────────────────────────────────────────────
//  store3d/dance.js — THE DANCE HALL + DJ'S LIBRARY (t47)
//  Right of the store (+x). A glossy checkered dance floor under a beat-
//  reactive light rig (mirror ball, sweeping color beams, pulsing floor
//  tiles + wall washes driven by the jukebox's live audio levels), a DJ
//  booth with turntables/mixer/laptop (click the laptop → DJ menu), and a
//  door behind the booth into the DJ'S LIBRARY where every song hangs as
//  a vinyl record.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT, AUDIO_TYPES } from './config.js?v=1788810462055';

export function buildDance(theme) {
  const L = LAYOUT, H = L.dance.h;
  const X0 = L.room.w / 2 + L.room.wallThickness;      // +6.345 — shared with the store wall
  const X1 = X0 + L.dance.w;                           // +15.845
  const Z1 = L.room.l / 2 + L.room.wallThickness + L.hall.d;   // +8.945 — flush with the hall front
  const Z0 = Z1 - L.dance.l;                           // −6.5
  const xc = (X0 + X1) / 2, zc = (Z0 + Z1) / 2;
  const group = new THREE.Group();
  const occluders = [];
  const colliders = [];                          // t51: real walk-blocking boxes

  const wallMat = new THREE.MeshStandardMaterial({ color: '#191228', roughness: 0.88 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#0e0f1a', roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa2b8', roughness: 0.3, metalness: 0.75 });
  const T = L.room.wallThickness;

  // ── shell ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.dance.w, L.dance.l),
    new THREE.MeshStandardMaterial({ color: '#14131f', roughness: 0.75 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(xc, 0, zc); group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L.dance.w, L.dance.l), darkMat);
  ceil.rotation.x = Math.PI / 2; ceil.position.set(xc, H, zc); group.add(ceil);

  const wall = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z); group.add(m); occluders.push(m); return m;
  };
  // −x wall: SHARED with the store — the dance door sits in the hall's wall
  // (hall.js owns that opening); this wall is solid but starts past the hall
  // t49: SHARED wall with the hall — the door OPENING lives HERE (it was a
  // solid box behind the hall's doorway: a wall you could walk through)
  const dzC2 = Z1 - L.dance.door.width / 2 - 0.35;      // matches hall.js' opening exactly
  wall(T, H, (dzC2 - L.dance.door.width / 2) - Z0, X0 - T / 2, H / 2, (Z0 + dzC2 - L.dance.door.width / 2) / 2);
  wall(T, H, Z1 - (dzC2 + L.dance.door.width / 2), X0 - T / 2, H / 2, (Z1 + dzC2 + L.dance.door.width / 2) / 2);
  wall(T, H - L.dance.door.height, L.dance.door.width, X0 - T / 2, L.dance.door.height + (H - L.dance.door.height) / 2, dzC2);
  // +x wall (solid, full length)
  wall(T, H, L.dance.l, X1 + T / 2, H / 2, zc);
  // +z wall (front, solid)
  wall(L.dance.w + 2 * T, H, T, xc, H / 2, Z1 + T / 2);
  // −z wall (back) with the DJ-library door at x = boothDoorX
  const BD = L.dance.boothDoor, bdX = xc + 0.4;
  wall(bdX - BD.width / 2 - X0, H, T, (X0 + bdX - BD.width / 2) / 2, H / 2, Z0 - T / 2);
  wall(X1 - (bdX + BD.width / 2), H, T, (X1 + bdX + BD.width / 2) / 2, H / 2, Z0 - T / 2);
  wall(BD.width, H - BD.height, T, bdX, BD.height + (H - BD.height) / 2, Z0 - T / 2);
  for (const sx of [-1, 1]) {   // casing
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, BD.height + 0.12, T + 0.1),
      new THREE.MeshStandardMaterial({ color: '#171122', roughness: 0.5, metalness: 0.25 }));
    post.position.set(bdX + sx * (BD.width / 2 + 0.13), (BD.height + 0.12) / 2, Z0 - T / 2); group.add(post); occluders.push(post);
  }

  // ── THE DANCE FLOOR — glossy checker that PULSES with the bass ──
  const FT = 6.4, FN = 8, fpSize = FT / FN;            // 8×8 tiles, 6.4 m square
  const floorZ = zc + 1.1;
  const tileMats = [];
  const tiles = new THREE.Group();
  for (let ix = 0; ix < FN; ix++) for (let iz = 0; iz < FN; iz++) {
    const even = (ix + iz) % 2 === 0;
    const mat = new THREE.MeshStandardMaterial({
      color: even ? '#1d1b2e' : '#101020', roughness: 0.18, metalness: 0.5,
      emissive: new THREE.Color(theme.accent), emissiveIntensity: 0
    });
    tileMats.push({ mat, even, ix, iz });
    const t = new THREE.Mesh(new THREE.BoxGeometry(fpSize * 0.96, 0.04, fpSize * 0.96), mat);
    t.position.set(xc - FT / 2 + fpSize / 2 + ix * fpSize, 0.02, floorZ - FT / 2 + fpSize / 2 + iz * fpSize);
    tiles.add(t);
  }
  group.add(tiles);

  // ── LIGHT RIG — everything reacts to the music ──
  // mirror ball + speckles
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14),
    new THREE.MeshStandardMaterial({ color: '#cfd6e6', roughness: 0.15, metalness: 1 }));
  ball.position.set(xc, H - 0.75, floorZ); group.add(ball);
  const ballLight = new THREE.PointLight(0xffffff, 6, 7, 1.8);
  ballLight.position.set(xc, H - 0.2, floorZ); group.add(ballLight);
  // (t54: the particle field is GONE — it added little; haze/smoke returns
  //  once the room textures are worth it)
  // sweeping color beams (visible cones + real lights)
  const beamMat = (hue) => new THREE.MeshStandardMaterial({
    color: hue, emissive: hue, emissiveIntensity: 1.4, transparent: true, opacity: 0.34, depthWrite: false });
  const rig = [];
  const beamColors = ['#ff2d78', '#2de2ff', '#ffb02d', '#8f2dff'];
  beamColors.forEach((col, i) => {
    const a = (i / beamColors.length) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(xc + Math.cos(a) * 2.6, H - 0.25, floorZ + Math.sin(a) * 2.6);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 6.2, 14, 1, true), beamMat(col));
    cone.position.y = -3.1; cone.rotation.x = Math.PI;   // hang downward
    pivot.add(cone);
    const spot = new THREE.PointLight(col, 0, 8, 1.9);
    spot.position.y = -0.6; pivot.add(spot);
    group.add(pivot);
    rig.push({ pivot, spot, cone, phase: i * 1.7 });
  });
  // wall washes
  const washes = [];
  for (const sx of [-1, 1]) {
    const wl = new THREE.PointLight(beamColors[1 + (sx > 0 ? 0 : 2)], 0, 10, 2);
    wl.position.set(xc + sx * (L.dance.w / 2 - 0.5), H - 0.6, zc); group.add(wl);
    washes.push(wl);
  }
  const ambient = new THREE.PointLight(0xb9a8ff, 0.55, 14, 1.8);   // never pitch black
  ambient.position.set(xc, H - 0.8, zc); group.add(ambient);

  // ── t51: 10-SPEAKER SURROUND + booth subwoofers ──
  const cabMat = new THREE.MeshStandardMaterial({ color: '#14161d', roughness: 0.55, metalness: 0.2 });
  const ringMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.5 });
  const speakerPts = [
    // four corners, high
    [X0 + 0.45, H - 0.7, Z0 + 0.45, Math.PI / 4], [X1 - 0.45, H - 0.7, Z0 + 0.45, -Math.PI / 4],
    [X0 + 0.45, H - 0.7, Z1 - 0.45, Math.PI * 0.75], [X1 - 0.45, H - 0.7, Z1 - 0.45, -Math.PI * 0.75],
    // three per long wall (left wall faces +x, right wall faces −x)
    [X0 + 0.28, H - 0.85, zc - 3.4, Math.PI / 2], [X0 + 0.28, H - 0.85, zc, Math.PI / 2], [X0 + 0.28, H - 0.85, zc + 3.4, Math.PI / 2],
    [X1 - 0.28, H - 0.85, zc - 3.4, -Math.PI / 2], [X1 - 0.28, H - 0.85, zc, -Math.PI / 2], [X1 - 0.28, H - 0.85, zc + 3.4, -Math.PI / 2]
  ];
  const speakerPulse = [];        // each cabinet's accent ring pulses with the music
  for (const [sx, sy, sz, ry] of speakerPts) {
    const cab = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.26), cabMat); cab.add(box);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 20), ringMat.clone());
    ring.position.set(0, 0.08, 0.135); cab.add(ring);
    const ring2 = ring.clone(); ring2.position.y = -0.12; ring2.scale.setScalar(0.72); cab.add(ring2);
    cab.rotation.order = 'YXZ';
    cab.position.set(sx, sy, sz);
    cab.rotation.y = Math.atan2(xc - sx, floorZ - sz);   // t55: aimed at floor center
    cab.rotation.x = -0.08;                              // slight downtilt
    group.add(cab); speakerPulse.push(ring, ring2);
  }
  // SUBWOOFERS live in the DJ booth, mouths aimed at the dance floor
  const subMat = new THREE.MeshStandardMaterial({ color: '#101218', roughness: 0.7 });
  for (const dx of [-1.35, 1.35]) {
    const sub = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.58), subMat); sub.add(shell);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 20),
      new THREE.MeshStandardMaterial({ color: '#05060a', emissive: theme.accent, emissiveIntensity: 0.3 }));
    mouth.rotation.x = Math.PI / 2; mouth.position.set(0, 0.1, 0.3); sub.add(mouth);
    sub.position.set(bdX + dx, 0.31, Z0 + 2.55);  // t58: ON the counter's FRONT face — mouths visible
    sub.rotation.order = 'YXZ';
    sub.rotation.y = Math.atan2(xc - (bdX + dx), floorZ - (Z0 + 1.75));   // t55: mouth aimed at
    sub.rotation.x = -0.1;                        // the FLOOR CENTER, slight uptilt
    group.add(sub); speakerPulse.push(mouth);
  }

  // t53: the REAL acoustic geometry — the audio ring mirrors the visuals
  const subPositions = [{ x: bdX - 1.35, y: 0.31, z: Z0 + 2.55 }, { x: bdX + 1.35, y: 0.31, z: Z0 + 2.55 }];   // t58: booth front
  const speakerWorld = {                   // t60: AUDIO ANCHORS AT EAR LEVEL — the
    sats: speakerPts.map(([x, y, z]) => ({ x, y: 1.7, z })),   // cabinets hang high, but HRTF
    subs: subPositions,                                        // renders up there as OVERHEAD;
    center: { x: xc, y: 1.5, z: floorZ }                       // the soundfield belongs at
  };                                                           // speaker HEIGHT = your height

  // ── DJ BOOTH — at the back: counter, TWO turntables, mixer, laptop ──
  const booth = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.94, 0.9),       // t59: lowered — DJ tables sit ~0.94
    new THREE.MeshStandardMaterial({ color: '#1b1d2b', roughness: 0.4, metalness: 0.35 }));
  counter.position.y = 0.47; booth.add(counter);
  const topGlow = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.05, 0.94),
    new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.55 }));
  topGlow.position.y = 0.965; booth.add(topGlow);
  // turntables
  const DECKX = [-1.25, 1.25];                        // t59: wider — mixer moves BESIDE the laptop
  for (const tx of DECKX) {
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.09, 24), metal);
    deck.position.set(tx, 1.04, 0.05); booth.add(deck);
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 24),
      new THREE.MeshStandardMaterial({ color: '#0b0c12', roughness: 0.35 }));
    platter.position.set(tx, 1.095, 0.05); booth.add(platter);
    const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.015, 24),
      new THREE.MeshStandardMaterial({ color: '#05060a', roughness: 0.25 }));
    vinyl.position.set(tx, 1.11, 0.05); booth.add(vinyl);
    rig.push({ spin: vinyl, phase: tx });
  }
  // mixer (between the decks)
  const mixer = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.34),
    new THREE.MeshStandardMaterial({ color: '#12141f', roughness: 0.5 }));
  mixer.position.set(-0.62, 1.0, 0.1); booth.add(mixer);   // t59: beside the laptop, not under it
  for (const kx of [-0.2, -0.07, 0.06, 0.19]) {
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.045, 10),
      new THREE.MeshStandardMaterial({ color: '#e8ecf6', roughness: 0.3, metalness: 0.4 }));
    knob.position.set(kx - 0.62, 1.045, 0.06); booth.add(knob);
    const fader = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16),
      new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.7 }));
    fader.position.set(kx - 0.62, 1.045, 0.17); booth.add(fader);
  }
  // THE LAPTOP — screen is the click target for the DJ menu
  const laptop = new THREE.Group();
  const baseL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.34), metal);
  laptop.add(baseL);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.33, 0.02), metal);
  lid.position.set(0, 0.17, -0.16); lid.rotation.x = -0.42; laptop.add(lid);
  const screenTexCv = document.createElement('canvas');
  screenTexCv.width = 256; screenTexCv.height = 160;
  const sg = screenTexCv.getContext('2d');
  sg.fillStyle = '#0a0c18'; sg.fillRect(0, 0, 256, 160);
  sg.fillStyle = theme.accent; sg.font = 'italic 900 30px system-ui';
  sg.textAlign = 'center'; sg.fillText('🎧 DJ', 128, 70);
  sg.fillStyle = 'rgba(255,255,255,.7)'; sg.font = '500 16px system-ui';
  sg.fillText('click to mix', 128, 104);
  const screenTex = new THREE.CanvasTexture(screenTexCv); screenTex.colorSpace = THREE.SRGBColorSpace;
  const lscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.29),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  lscreen.position.set(0, 0.17, -0.149); lscreen.rotation.x = -0.42; laptop.add(lscreen);
  laptop.position.set(0, 0.99, 0.34); laptop.rotation.y = Math.PI;      // t59: centered, clear of the mixer
  booth.add(laptop);
  const boothZ = Z0 + 1.75;                     // t54: back by the LIBRARY DOOR again —
  booth.position.set(bdX, 0, boothZ);            // but off the wall: a 1.2 m apron BEHIND it
  const boothX = bdX;                            // (like the theater chairs) + 3.4 m side lanes
  booth.rotation.y = 0;                         // faces +z (the floor)
  group.add(booth);
  const boothTargets = [lscreen, lid, baseL, mixer];
  colliders.push({ minX: boothX - 1.7, maxX: boothX + 1.7, minZ: boothZ - 0.55, maxZ: boothZ + 0.55 });   // t54: solid — apron behind, lanes both sides
  for (const sp of subPositions)                          // t58: the subs are SOLID too
    colliders.push({ minX: sp.x - 0.31, maxX: sp.x + 0.31, minZ: sp.z - 0.31, maxZ: sp.z + 0.31 });
  occluders.push(counter);

  // (t54: no booth sign — the DJ'S LIBRARY sign hangs above the door instead)

  // ── DJ'S LIBRARY — records in wall bins ──
  const LX0 = X0, LX1 = X0 + L.djlib.w, LZ1 = Z0, LZ0 = Z0 - L.djlib.l;
  const lzc = (LZ0 + LZ1) / 2;
  const lfloor = new THREE.Mesh(new THREE.PlaneGeometry(L.djlib.w, L.djlib.l),
    new THREE.MeshStandardMaterial({ color: theme.floor, roughness: 0.7 }));
  lfloor.rotation.x = -Math.PI / 2; lfloor.position.set((LX0 + LX1) / 2, 0, lzc); group.add(lfloor);
  const lceil = new THREE.Mesh(new THREE.PlaneGeometry(L.djlib.w, L.djlib.l), darkMat);
  lceil.rotation.x = Math.PI / 2; lceil.position.set((LX0 + LX1) / 2, H, lzc); group.add(lceil);
  const lwall = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat); m.position.set(x, y, z); group.add(m); occluders.push(m); };
  lwall(L.djlib.w + 2 * T, H, T, (LX0 + LX1) / 2, H / 2, LZ0 - T / 2);         // far
  lwall(T, H, L.djlib.l, LX1 + T / 2, H / 2, lzc);                             // +x
  const zSegA = (bdX - BD.width / 2) - LX0;   // −x of the door, up to the shared corner
  lwall(zSegA, H, T, LX0 + zSegA / 2, H / 2, LZ1 + T / 2);
  const zSegB = LX1 - (bdX + BD.width / 2);   // +x of the door
  lwall(zSegB, H, T, bdX + BD.width / 2 + zSegB / 2, H / 2, LZ1 + T / 2);
  lwall(T, H, L.djlib.l, LX0 - T / 2, H / 2, lzc);                             // −x (shared back side)
  const libLight = new THREE.PointLight(0xffd9a0, 1.3, 6, 2);
  libLight.position.set((LX0 + LX1) / 2, H - 0.5, lzc); group.add(libLight);

  // ── t65: GOLD-RECORD WALL — framed vinyls FLUSH on the library walls, like
  //    an artist's gold records: gold frame + felt mat + the disc + a plaque
  //    with the song name. No bins, no shelves, nothing protruding. ──
  const recordTargets = [];
  const recGroup = new THREE.Group(); group.add(recGroup);
  let records = [];
  const labelPalette = ['#ff2d78', '#2de2ff', '#ffb02d', '#8f2dff', '#7dffa0', '#ff6a6a'];
  const frameMatG = new THREE.MeshStandardMaterial({ color: '#c9a227', roughness: 0.32, metalness: 0.72 });
  const feltMat = new THREE.MeshStandardMaterial({ color: '#12101c', roughness: 0.9 });
  function plaqueTexture(title, accent) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
    const g = cv.getContext('2d');
    g.fillStyle = '#171310'; g.fillRect(0, 0, 512, 96);
    g.strokeStyle = '#c9a227'; g.lineWidth = 6; g.strokeRect(4, 4, 504, 88);
    g.fillStyle = accent; g.font = 'italic 700 42px system-ui'; g.textAlign = 'center';
    let t = String(title || 'Untitled'); if (t.length > 26) t = t.slice(0, 25) + '…';
    g.fillText(t, 256, 62);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  }
  function setRecords(items) {
    for (const r of records) recGroup.remove(r.mesh);
    records = [];
    recordTargets.length = 0;
    const list = (items || []).filter(it => AUDIO_TYPES.includes(it.type)).slice(0, 32);
    // walls of the library: −x (facing +x) · +x (facing −x) · far (facing +z)
    const walls = [
      { axis: 'x', at: LX0 + 0.018, face: 1, ry: Math.PI / 2, from: LZ0 + 0.5, to: LZ1 - 0.5 },
      { axis: 'x', at: LX1 - 0.018, face: -1, ry: -Math.PI / 2, from: LZ0 + 0.5, to: LZ1 - 0.5 },
      { axis: 'z', at: LZ0 + 0.018, face: 1, ry: 0, from: LX0 + 0.5, to: LX1 - 0.5 }
    ];
    const slots = [];
    for (const w of walls) for (const row of [0, 1]) {
      const n = Math.max(1, Math.floor((w.to - w.from - 0.3) / 0.68));
      for (let c = 0; c < n; c++) slots.push({ wall: w, row, c, n });
    }
    list.forEach((it, i) => {
      const s = slots[i]; if (!s) return;
      const { wall: w, row, c, n } = s;
      const along = w.from + 0.34 + ((w.to - w.from - 0.68) * (n > 1 ? c / (n - 1) : 0.5));
      const y = 1.55 + row * 0.78;
      const mesh = new THREE.Group();
      // frame: flush box ON the wall plane (18 mm proud — nothing protrudes)
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.036), frameMatG);
      mesh.add(frame);
      const felt = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), feltMat);
      felt.position.z = 0.019; mesh.add(felt);
      // the vinyl — a gold-record disc, slightly proud of the felt
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.012, 26),
        new THREE.MeshStandardMaterial({ color: '#0d0c12', roughness: 0.24, metalness: 0.35 }));
      disc.rotation.x = Math.PI / 2; disc.position.z = 0.028; mesh.add(disc);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.016, 18),
        new THREE.MeshStandardMaterial({ color: labelPalette[i % labelPalette.length], emissive: labelPalette[i % labelPalette.length], emissiveIntensity: 0.45 }));
      label.rotation.x = Math.PI / 2; label.position.z = 0.03; mesh.add(label);
      // the plaque — the song name, right under the frame
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.082),
        new THREE.MeshBasicMaterial({ map: plaqueTexture(it.title, theme.accent), toneMapped: false }));
      plaque.position.set(0, -0.34, 0.012); mesh.add(plaque);
      if (w.axis === 'x') mesh.position.set(w.at, y, along); else mesh.position.set(along, y, w.at);
      mesh.rotation.y = w.ry;
      mesh.userData.item = it;
      recGroup.add(mesh);
      recordTargets.push(frame, disc, label, plaque);       // big, easy hit targets
      records.push({ mesh, item: it, wall: w, off: 0.018 });
    });
  }
  setRecords([]);
  const libSignCv = document.createElement('canvas');
  libSignCv.width = 768; libSignCv.height = 128;
  const lc2 = libSignCv.getContext('2d');
  lc2.fillStyle = '#160f1e'; lc2.fillRect(0, 0, 768, 128);
  lc2.fillStyle = theme.accent; lc2.font = 'italic 900 54px system-ui';
  lc2.textAlign = 'center'; lc2.fillText("DJ'S LIBRARY", 384, 84);
  const libSignTex = new THREE.CanvasTexture(libSignCv); libSignTex.colorSpace = THREE.SRGBColorSpace;
  const libSign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.42),
    new THREE.MeshBasicMaterial({ map: libSignTex, toneMapped: false }));
  libSign.position.set(bdX, 2.78, Z0 - T + 0.02); group.add(libSign);   // t54: over the library DOOR

  // ── t51: NEON WALL — vertical LED bars + diffused coves, all music-pulsed ──
  const ledBars = [];
  const barMat = () => new THREE.MeshStandardMaterial({ color: '#0ff', emissive: '#0ff', emissiveIntensity: 0.8, roughness: 0.4 });
  for (const wx of [X0 + 0.16, X1 - 0.16]) {
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.6, 0.16), barMat());
      bar.position.set(wx, 1.7, Z0 + 1.9 + i * 2.15);
      group.add(bar); ledBars.push(bar);
    }
  }
  const coveMat = barMat();
  const cove = new THREE.Mesh(new THREE.BoxGeometry(L.dance.w - 0.6, 0.09, 0.09), coveMat);
  cove.position.set(xc, H - 0.32, Z1 - 0.22); group.add(cove);
  const cove2 = cove.clone(); cove2.position.z = Z0 + 0.22; group.add(cove2);

  // ── t54: the DJ SPOT — between sets it HOLDS on the booth (a club spotlight
  //    on the DJ); the moment music plays it fades out and the rig takes over
  const djSpot = new THREE.SpotLight(0xfff1d6, 0, 15, 0.24, 0.6, 1.1);
  djSpot.position.set(bdX, H - 0.25, Z0 + 4.4);
  djSpot.target.position.set(bdX, 0.95, Z0 + 1.75);
  group.add(djSpot); group.add(djSpot.target);
  let lightMode = 'idle';

  // ── update: a real DJ-set light engine (t51) — beats drive PATTERNS,
  //    hues rotate with the music, particles fly on the kick, floor shifts color
  let ph = 0, barBeats = 0, pattern = 0, hue = Math.random();
  // t59: ADAPTIVE BEAT — the old fixed 0.42 threshold fired early or late
  // depending on how hot the track was mastered. Now a kick must CLEAR the
  // track's OWN rolling bass average by 30% (plus a floor), with a 0.3 s
  // refractory so one mushy frame can't double-fire. Movement is POSE-based:
  // each beat advances a target pose and the pivots EASE toward it — loose,
  // liquid sweeps instead of per-frame snapping.
  const bassHist = new Array(40).fill(0); let bh = 0, beats = 0, bpm = 0, lastBeatT = -9, lastInt = 0, clock = 0;
  const col = new THREE.Color();
  let pose = 0;                                 // t59: beat-advanced rig pose target
  function update(dt, levels) {
    const lv = levels || { bass: 0, mid: 0, treble: 0, energy: 0, live: false };
    // t54: no music → the SPOT holds on the booth and the rig rests;
    // music in → spot fades, the rig wakes and moves WITH the song
    // (pattern rotation every 8 kicks + speeds/colors ride the track's
    // own energy — every song moves differently)
    const live = !!(lv.live && lv.energy > 0.02);
    lightMode = live ? 'live' : 'idle';
    const spotT = live ? 0 : 7.5;                       // t54: linear slew — survives slow frames
    djSpot.intensity += Math.sign(spotT - djSpot.intensity) * Math.min(Math.abs(spotT - djSpot.intensity), dt * 10);
    const rigLevel = live ? 1 : 0.05;
    clock += dt;
    ph += dt * (0.15 + lv.energy * 0.5);         // t59: slow drift — beats move the rig, not energy jitter

    // BEAT + PATTERN bookkeeping — adaptive kick; 8 kicks = a bar
    bassHist[bh] = lv.bass; bh = (bh + 1) % bassHist.length;
    let bAvg = 0; for (let i2 = 0; i2 < bassHist.length; i2++) bAvg += bassHist[i2];
    bAvg /= bassHist.length;
    const kick = !!(lv.live && lv.bass > 0.08 && lv.bass > bAvg * 1.3 + 0.02 && clock - lastBeatT > 0.3);
    if (kick) {
      if (lastBeatT >= 0 && clock - lastBeatT < 2.5) { lastInt = clock - lastBeatT; bpm = Math.round(60 / lastInt); }
      lastBeatT = clock; beats++;
      barBeats++;
      pose += 0.9 + (barBeats % 2) * 0.5;                     // the next pose the rig eases to
      hue = (hue + 0.06 + lv.energy * 0.05) % 1;              // every kick nudges the palette
      if (barBeats >= 8) { barBeats = 0; pattern = (pattern + 1) % 4; }   // rotate the rig pattern
    }

    // FLOOR: same bass/mid checker pulse, but the COLOR rides the hue
    col.setHSL((hue + 0.08) % 1, 0.95, 0.55);
    for (const t of tileMats) {
      t.mat.emissive.copy(col);
      t.mat.emissiveIntensity = Math.max(0, (t.even ? lv.bass : lv.mid * 0.7) - ((t.ix + t.iz) % 3) * 0.06) * 1.5;
    }


    // MIRROR BALL
    ball.rotation.y += dt * (0.4 + lv.energy * 3);
    ballLight.intensity = 3.5 + lv.treble * 9;

    // RIG — DJ-set PATTERNS (sweep → chase → strobe → build), hue-synced colors
    const beamCol = (i) => col.setHSL((hue + i * 0.13) % 1, 1, 0.55);
    for (let i = 0; i < rig.length; i++) {
      const r = rig[i];
      if (r.spin) { r.spin.rotation.y += dt * (1 + lv.mid * 8); continue; }
      let ty, tx = 0, punch = 0.4 + lv.energy * 1.3;
      if (pattern === 0) { ty = pose * 0.55 + r.phase + ph * 0.15; tx = Math.sin(pose * 0.5 + r.phase) * 0.45; }        // sweep
      else if (pattern === 1) { ty = Math.floor(barBeats % rig.length) === i ? pose * 0.8 : r.phase + ph * 0.1; punch *= barBeats % rig.length === i ? 2.1 : 0.5; }  // chase
      else if (pattern === 2) { ty = r.phase + ph * 0.1; tx = kick ? 0.25 + ((beats * 7 + i * 3) % 5) * 0.13 : 0.1; punch *= kick ? 2.6 : (lv.bass > 0.3 ? 1.2 : 0.15); }  // strobe (deterministic — no random jitter)
      else { ty = (i / rig.length) * Math.PI * 2 + pose * 0.2 + ph * 0.1; tx = 0.5 - barBeats * 0.07; if (barBeats === 7 && kick) { tx = 0.9; punch *= 2.4; } }  // build & drop
      // t59: EASE to the target, then CAP the travel speed — real moving-head
      // fixtures SWEEP to their next position; they never snap. Even a far
      // target glides in at ≤ 2.4 rad/s. Loose, liquid, beat-locked.
      const ease = 1 - Math.exp(-dt * 6);
      const capY = 2.4 * dt, capX = 1.8 * dt;
      let dy = (ty - r.pivot.rotation.y) * ease;
      let dx2 = (tx - r.pivot.rotation.x) * ease;
      r.pivot.rotation.y += Math.max(-capY, Math.min(capY, dy));
      r.pivot.rotation.x += Math.max(-capX, Math.min(capX, dx2));
      r.spot.intensity = punch * 2.2 * rigLevel;
      r.cone.material.opacity = (0.14 + Math.min(0.55, punch * 0.22)) * rigLevel;
      r.cone.material.color.copy(beamCol(i)); r.cone.material.emissive.copy(beamCol(i));
      r.spot.color.copy(beamCol(i));
    }
    washes[0].intensity = 0.4 + lv.bass * 2.6;
    washes[1].intensity = 0.4 + lv.mid * 2.6;
    ambient.intensity = 0.4 + lv.energy * 0.5;

    // NEON: LED bars ride the hue and PULSE per band; signs breathe with it
    for (let i = 0; i < ledBars.length; i++) {
      const m2 = ledBars[i].material;
      m2.color.setHSL((hue + 0.5 + i * 0.07) % 1, 1, 0.6);
      m2.emissive.copy(m2.color);
      m2.emissiveIntensity = 0.35 + lv.energy * 1.8 + (kick && i % 2 === 0 ? 0.8 : 0);
    }
    coveMat.color.setHSL((hue + 0.25) % 1, 1, 0.6); coveMat.emissive.copy(coveMat.color);
    coveMat.emissiveIntensity = 0.5 + lv.bass * 2.2; cove2.material = coveMat;
    for (const s2 of speakerPulse) s2.material.emissiveIntensity = 0.3 + lv.bass * 2.0;
    libSign.material.color.setScalar(0.72 + lv.mid * 0.55);      // t54: the sign over the DOOR glows with the mids
  }

  function info() {
    return {
      x0: X0, x1: X1, z0: Z0, z1: Z1, onRightSide: X0 > 0,
      floorTiles: tileMats.length, records: records.length,
      recordWall: {                                  // t65: framed vinyls, flush on the walls
        n: records.length, framed: records.length > 0,
        flush: records.every(r => (r.wall.axis === 'x' ? Math.abs(r.mesh.position.x - (r.wall.at - r.wall.face * 0.018)) : Math.abs(r.mesh.position.z - (r.wall.at - r.wall.face * 0.018))) < 0.05),
        plaques: records.length   // one song-name plaque per record
      },
      sharedWallOpen: L.dance.door.width, doorCenterZ: Z1 - L.dance.door.width / 2 - 0.35,
      speakers: speakerPts.length, subs: 2, ledBars: ledBars.length + 2,
      boothX, boothZ, patterns: 4,    // t51 · t54: booth by the DOOR, apron behind
      boothApron: +(boothZ - 0.55 - Z0).toFixed(2),   // walkable gap behind (m)
      subsAtFront: +(subPositions[0].z - Z0).toFixed(2) > 2.4,   // t58: mouths visible past the counter
      boothSideLane: +(boothX - 1.7 - X0).toFixed(2), // walkable left lane (m)
      libSignOverDoor: { x: +libSign.position.x.toFixed(2), y: +libSign.position.y.toFixed(2) },
      lightMode, djSpot: +djSpot.intensity.toFixed(1),   // t54: idle spot ↔ live rig
      beat: { beats, bpm, lastBeatAgo: +(clock - lastBeatT).toFixed(2) },      // t59: the beat engine
      rigYaws: rig.slice(0, 4).map(r => +r.pivot.rotation.y.toFixed(3)),        // t59: per-beam angles (beams only)
      rigPitches: rig.slice(0, 4).map(r => +r.pivot.rotation.x.toFixed(3)),
      boothLayout: { counterH: 0.94, laptopX: 0, mixerX: -0.62, deckX: DECKX } // t59: side-by-side, laptop centered
    };
  }

  return { group, occluders, colliders, boothTargets, recordTargets, setRecords, update, info, speakerWorld };
}
