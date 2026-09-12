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
import { LAYOUT, AUDIO_TYPES } from './config.js?v=1789174562813';

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

  // t119: THE DANCE HALL FOLLOWS THE THEME — the walls were a hardcoded
  // purple-black no matter the theme, and nothing here re-themed after a
  // theme change. Club surfaces now DERIVE from the theme (wall → club-dark
  // walls + ceiling, floor → perimeter floor, accent → every glow + sign +
  // plaque + the laptop screen), so the whole room recolors live with the
  // store. The light SHOW keeps its own colors — beams, LED wall and pools
  // are the show, not the decor.
  const mixHex = (a, b, k) => {
    const pa = /^#?([0-9a-f]{6})$/i.exec(String(a || '')), pb = /^#?([0-9a-f]{6})$/i.exec(String(b || ''));
    if (!pa || !pb) return a || b;
    const na = parseInt(pa[1], 16), nb = parseInt(pb[1], 16), m = (x, y) => Math.round(x + (y - x) * (k || 0));
    const r = m(na >> 16 & 255, nb >> 16 & 255), g = m(na >> 8 & 255, nb >> 8 & 255), bl = m(na & 255, nb & 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  };
  let curTheme = { ...theme };                     // kept fresh so applyTheme + the HUD read it
  const wallOf = (t) => mixHex(t.wall || '#191228', '#000000', 0.45);   // club-dark version of the store wall
  const ceilOf = (t) => mixHex(t.wall || '#0e0f1a', '#000000', 0.72);
  const perimOf = (t) => mixHex(t.floor || '#14131f', '#000000', 0.2);

  const wallMat = new THREE.MeshStandardMaterial({ color: wallOf(theme), roughness: 0.88 });
  const darkMat = new THREE.MeshStandardMaterial({ color: ceilOf(theme), roughness: 0.9 });
  const perimFloorMat = new THREE.MeshStandardMaterial({ color: perimOf(theme), roughness: 0.75 });
  const metal = new THREE.MeshStandardMaterial({ color: '#9aa2b8', roughness: 0.3, metalness: 0.75 });
  const T = L.room.wallThickness;

  // ── shell ──
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L.dance.w, L.dance.l), perimFloorMat);
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
  const tileBase = (t, even) => even ? mixHex(t.wall || '#1d1b2e', '#ffffff', 0.06) : mixHex(t.wall || '#101020', '#000000', 0.35);   // t119: the checker derives from the theme
  const tiles = new THREE.Group();
  for (let ix = 0; ix < FN; ix++) for (let iz = 0; iz < FN; iz++) {
    const even = (ix + iz) % 2 === 0;
    const mat = new THREE.MeshStandardMaterial({
      color: tileBase(theme, even), roughness: 0.18, metalness: 0.5,
      emissive: new THREE.Color(theme.accent), emissiveIntensity: 0
    });
    tileMats.push({ mat, even, ix, iz });
    const t = new THREE.Mesh(new THREE.BoxGeometry(fpSize * 0.96, 0.04, fpSize * 0.96), mat);
    t.position.set(xc - FT / 2 + fpSize / 2 + ix * fpSize, 0.02, floorZ - FT / 2 + fpSize / 2 + iz * fpSize);
    tiles.add(t);
  }
  group.add(tiles);

  // ── LIGHT RIG — everything reacts to the music ──
  // t86: THE MIRROR BALL, for real this time — faceted (flat-shaded
  // icosahedron), a pin spot aimed at it, and two instanced glint sets
  // (shell sparkles + a floor sweep). One draw call each. Deliberately NO
  // THREE.Points objects — the t54 particle ban still holds.
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 2),
    new THREE.MeshStandardMaterial({ color: '#cfd6e6', roughness: 0.08, metalness: 1, flatShading: true }));
  ball.position.set(xc, H - 0.75, floorZ); group.add(ball);
  const pinSpot = new THREE.SpotLight(0xffffff, 0, 10, 0.42, 0.6, 1.2);   // a real mirror ball is lit by a pin spot
  pinSpot.position.set(xc - 1.7, H - 0.35, floorZ - 1.7);
  pinSpot.target = ball; group.add(pinSpot, pinSpot.target);
  const ballLight = new THREE.PointLight(0xffffff, 6, 7, 1.8);
  ballLight.position.set(xc, H - 0.2, floorZ); group.add(ballLight);
  // glints — shell sparkles on the ball + sweeping dots on the floor
  const SHELL_N = 80, FLOOR_N = 24;
  const glintMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const shellGlints = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.05, 0.05), glintMat(), SHELL_N);
  const floorGlints = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 0.15), glintMat(), FLOOR_N);
  shellGlints.frustumCulled = floorGlints.frustumCulled = false;
  group.add(shellGlints, floorGlints);
  const shellDirs = [];
  for (let i = 0; i < SHELL_N; i++) {           // golden-angle sphere distribution (deterministic)
    const y = 1 - (i / (SHELL_N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    shellDirs.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  const floorGlintSeed = [];
  for (let i = 0; i < FLOOR_N; i++) floorGlintSeed.push(1.1 + ((i * 37) % 100) / 100 * 1.9);   // radius 1.1–3.0 m
  const glintDummy = new THREE.Object3D();
  const glintCol = new THREE.Color();
  // sweeping color beams (visible cones + real lights)
  const beamMat = (hue) => new THREE.MeshStandardMaterial({
    color: hue, emissive: hue, emissiveIntensity: 1.4, transparent: true, opacity: 0.34, depthWrite: false });
  const rig = [];
  const truss = new THREE.Group();            // t95: the rig hangs from a TRUSS that circles the floor
  truss.position.set(xc, 0, floorZ);
  group.add(truss);
  const beamColors = ['#ff2d78', '#2de2ff', '#ffb02d', '#8f2dff'];
  beamColors.forEach((col, i) => {
    const a = (i / beamColors.length) * Math.PI * 2;
    const pivot = new THREE.Group();
    // t115: THE FIX BEHIND "lights are still a bit off" — under the DEFAULT
    // 'XYZ' Euler order, rotation.y (PAN) has NO effect on a down-pointing
    // cone (the yaw composes innermost, spinning the cone around its own
    // axis — invisible). Every beam tipped toward the same world direction
    // and only the tilt ever showed. 'YXZ' puts the pan OUTERMOST: the head
    // yaws, then tilts — the real moving-head convention. Every pattern
    // suddenly draws what it always claimed to.
    pivot.rotation.order = 'YXZ';
    pivot.position.set(Math.cos(a) * 2.6, H - 0.25, Math.sin(a) * 2.6);   // t95: relative to the truss
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.95, 6.2, 14, 1, true), beamMat(col));
    cone.position.y = -3.1;   // t86 FIX: NO π-flip — apex AT the fixture (narrow at the ceiling),
                              // base flaring down at the floor. It was inverted before (owner report).
    pivot.add(cone);
    const spot = new THREE.PointLight(col, 0, 8, 1.9);
    spot.position.y = -0.6; pivot.add(spot);
    truss.add(pivot);
    rig.push({ pivot, spot, cone, phase: i * 1.7, z: 1 });
  });
  // t115: FLOOR-IMPACT SPOTS — a luminous pool where each beam lands,
  // tracked from the live pan/tilt (additive, cheap, music-pulsed).
  // t116: THE POOL TAKES THE BEAM'S SHAPE (owner: "should match the shape of
  // the light. The light is a cone so it shows in a circle") — a unit CIRCLE
  // scaled per frame: minor axis = the cone's actual spread at the floor
  // (axial distance × tan(half-angle) × lens zoom), major axis = that
  // stretched by 1/cos(tilt) ALONG the beam's direction. Steep beam → circle;
  // tilted beam → ellipse. Soft radial falloff so it reads as light on the
  // floor, never a decal.
  const impacts = [];
  const poolTex = (() => {
    const cv2 = document.createElement('canvas'); cv2.width = cv2.height = 128;
    const g2 = cv2.getContext('2d');
    const grd = g2.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = grd; g2.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv2);
  })();
  for (let i = 0; i < 4; i++) {
    const im = new THREE.Mesh(
      new THREE.CircleGeometry(1, 28),
      new THREE.MeshBasicMaterial({ color: 0xffffff, map: poolTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    im.geometry.rotateX(-Math.PI / 2);
    im.position.set(xc, 0.06, floorZ);
    im.visible = false;
    group.add(im);
    impacts.push(im);
  }
  const CONE_TAN = 0.95 / 6.2;                  // the beam cone's half-angle tangent (radius / length)
  const spotScales = [[1, 1], [1, 1], [1, 1], [1, 1]];   // t116: [semi-major, semi-minor] telemetry
  const beamHits = [[0, 0], [0, 0], [0, 0], [0, 0]];
  const beamAz = [0, 0, 0, 0], beamEl = [0, 0, 0, 0];
  const _awp = new THREE.Vector3();
  // t115: pan/tilt TARGETS that converge on a world floor point — invert the
  // beam math (YXZ: dir = (−sin p·sin t, −cos t, −cos p·sin t))
  function aimTyTx(r, x, z) {
    r.pivot.getWorldPosition(_awp);
    const vx = x - _awp.x, vz = z - _awp.z, vy = 0.05 - _awp.y;
    const t = Math.atan2(Math.hypot(vx, vz), -vy);
    return [Math.atan2(vx, vz) + Math.PI - truss.rotation.y, Math.min(1.45, t)];
  }
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
  const faderMats = [];                             // t119: collected so applyTheme can retint
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.94, 0.9),       // t59: lowered — DJ tables sit ~0.94
    new THREE.MeshStandardMaterial({ color: '#1b1d2b', roughness: 0.4, metalness: 0.35 }));
  counter.position.y = 0.47; booth.add(counter);
  const topGlowMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.55 });   // t119: themed (collected)
  const topGlow = new THREE.Mesh(new THREE.BoxGeometry(3.24, 0.05, 0.94), topGlowMat);
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
    const faderMat = new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.7 });   // t119: themed (collected)
    faderMats.push(faderMat);
    const fader = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), faderMat);
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
  const drawLaptopScreen = (accent) => {            // t119: redrawable — the screen follows the theme
    sg.fillStyle = '#0a0c18'; sg.fillRect(0, 0, 256, 160);
    sg.fillStyle = accent; sg.font = 'italic 900 30px system-ui';
    sg.textAlign = 'center'; sg.fillText('🎧 DJ', 128, 70);
    sg.fillStyle = 'rgba(255,255,255,.7)'; sg.font = '500 16px system-ui';
    sg.fillText('click to mix', 128, 104);
    screenTex.needsUpdate = true;
  };
  const screenTex = new THREE.CanvasTexture(screenTexCv); screenTex.colorSpace = THREE.SRGBColorSpace;
  drawLaptopScreen(theme.accent);   // t119: initial paint (screenTex exists now)
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
  const plaqueMeshes = [];                         // t119: collected so applyTheme can redraw the plaques
  function setRecords(items) {
    for (const r of records) recGroup.remove(r.mesh);
    records = [];
    recordTargets.length = 0;
    plaqueMeshes.length = 0;
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
      plaqueMeshes.push({ mesh: plaque, title: it.title });   // t119: theme redraw list
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
  let lastSignBg = null;   // t120: the wall-derived sign tone (provable)
  const drawLibSign = (t) => {                      // t119: redrawable — the sign follows the theme
    lastSignBg = mixHex(t.wall || '#191228', '#000000', 0.5);   // t120: the sign panel follows the wall (was hardcoded plum)
    lc2.fillStyle = lastSignBg; lc2.fillRect(0, 0, 768, 128);
    lc2.fillStyle = t.accent; lc2.font = 'italic 900 54px system-ui';
    lc2.textAlign = 'center'; lc2.fillText("DJ'S LIBRARY", 384, 84);
    libSignTex.needsUpdate = true;
  };
  const libSignTex = new THREE.CanvasTexture(libSignCv); libSignTex.colorSpace = THREE.SRGBColorSpace;
  drawLibSign(theme);
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
  // t86: ADJUSTABLE + a lot more active. t93: THE OWNER'S CORRECTION —
  // "Intensity" was scaling BRIGHTNESS, which nobody asked for. It is now
  // MOVEMENT: how far the fixtures travel (wider sweep fans, bigger chase
  // jumps, higher build climbs — laser-show / EDM-festival motion). Bright-
  // ness is NOT user-scaled at all; the music and the program drive it.
  // P = the owner's dance-floor prefs (My Theme → Dance floor lights):
  // movement = travel amplitude; speed = how fast beams get there (the
  // travel caps); ballSpin the mirror ball; pattern locks one program.
  // The rig stays ASLEEP unless the dance hall's own music is playing
  // (owner's rule: free perf when the room is quiet).
  // Legacy: prefs saved by 1.6.x used the key "intensity" — honored as
  // movement so nobody's saved setting is lost.
  let P = { movement: 1, speed: 1, ballSpin: 1, pattern: 'auto', sweep: 1, spread: 0.5 };
  function setPrefs(p) {
    const num = (v, dflt, lo, hi) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);
    const mv = p?.movement !== undefined ? p.movement : (p?.intensity !== undefined ? p.intensity : P.movement);
    P = {
      movement: num(mv, P.movement, 0.2, 3),          // t103: wider top end (3×) — full-festival swings
      speed: num(p?.speed, P.speed, 0.3, 3),          // t103: wider top end too
      pattern: ['auto', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18'].includes(String(p?.pattern)) ? String(p.pattern) : P.pattern,   // t115: + the 6 festival programs
      sweep: num(p?.sweep, P.sweep, 0.2, 2.5),        // t109: shape SIZE — circle diameter, arc width, fan reach
      spread: num(p?.spread, P.spread, 0, 1)          // t109: how staggered the four heads are (0 = lockstep, 1 = full ripple)
    };   // t103: ballSpin removed (owner) — saved prefs with it are simply ignored
    if (P.pattern !== 'auto') pattern = P.pattern | 0;   // t95: a program pick applies IMMEDIATELY — never wait for the next kick
  }
  //    hues rotate with the music, particles fly on the kick, floor shifts color
  let ph = 0, barBeats = 0, bars = 0, pattern = 0, hue = Math.random(), dropT = 0;   // t115: 32-beat rotation + drop blip
  // t59: ADAPTIVE BEAT — the old fixed 0.42 threshold fired early or late
  // depending on how hot the track was mastered. Now a kick must CLEAR the
  // track's OWN rolling bass average by 30% (plus a floor), with a 0.3 s
  // refractory so one mushy frame can't double-fire. Movement is POSE-based:
  // each beat advances a target pose and the pivots EASE toward it — loose,
  // liquid sweeps instead of per-frame snapping.
  const bassHist = new Array(40).fill(0); let bh = 0, beats = 0, bpm = 0, lastBeatT = -9, lastInt = 0, clock = 0;
  const fluxHist = new Array(40).fill(0); let fh = 0, prevBass = 0;   // t114: onset-flux history (the kick must be a RISE)
  const col = new THREE.Color();
  let pose = 0, lastBg = 0;                     // t59: beat-advanced pose target · t95: last beat-grid value (for info)
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
    ph += dt * (0.3 + lv.energy * 0.85) * P.speed;   // t86: livelier drift — beats still lead, energy rides

    // BEAT + PATTERN bookkeeping — t114: ONSET-FLUX KICK. The owner's
    // correction: the rig loved slow flowy tracks and slept through deep,
    // lively music — sustained sub-bass kept the rolling average high, so a
    // kick could never "clear its own average" (bass > bAvg × 1.3 was
    // unreachable over a loud bass bed). Now the kick must be a RISE: the
    // bass ONSET (flux) against the track's own flux average, over a
    // softened level test, with a refractory that adapts to the detected
    // tempo so fast music can actually hit on its beats. Deeper hits also
    // travel further (movement never brightness — t93 doctrine holds).
    bassHist[bh] = lv.bass; bh = (bh + 1) % bassHist.length;
    let bAvg = 0; for (let i2 = 0; i2 < bassHist.length; i2++) bAvg += bassHist[i2];
    bAvg /= bassHist.length;
    const flux = Math.max(0, lv.bass - prevBass); prevBass = lv.bass;
    fluxHist[fh] = flux; fh = (fh + 1) % fluxHist.length;
    let fAvg = 0; for (let i2 = 0; i2 < fluxHist.length; i2++) fAvg += fluxHist[i2];
    fAvg /= fluxHist.length;
    const refractory = lastInt > 0.2 ? Math.max(0.16, Math.min(0.3, lastInt * 0.62)) : 0.3;
    const kick = !!(lv.live && lv.bass > 0.05 && clock - lastBeatT > refractory
      && flux > Math.max(0.014, fAvg * 1.35) && lv.bass > bAvg * 1.12 + 0.01);
    if (kick) {
      if (lastBeatT >= 0 && clock - lastBeatT < 2.5) { lastInt = clock - lastBeatT; bpm = Math.round(60 / lastInt); }
      lastBeatT = clock; beats++;
      barBeats++;
      pose += (1.2 + (barBeats % 2) * 0.8 + Math.min(1.3, flux * 5)) * P.speed;   // deeper kick → bigger travel (t114)
      hue = (hue + 0.06 + lv.energy * 0.05) % 1;              // every kick nudges the palette
      if (barBeats >= 4) { barBeats = 0; if (++bars >= 8) { bars = 0; pattern = (pattern + 1) % 19; } }   // t86 rotate · t109 shapes · t115: 32 beats per look, 19 programs
      if (P.pattern !== 'auto') pattern = P.pattern | 0;      // t86: locked look wins
    }
    // t115: THE DROP DETECTOR — an energy SPIKE (a kick whose onset clears
    // the track's own flux average hard, on top of a hot bed) blips the
    // DROP_EXPLODE program for a moment in auto mode: the festival moment.
    dropT = Math.max(0, dropT - dt);
    if (P.pattern === 'auto' && kick && flux > Math.max(0.06, fAvg * 2.2) && (lv.energy > 0.65 || lv.bass > 0.9)) dropT = 2.2;   // t115: a real DROP runs hot — gated high so routine beats never seize the rig
    // t95: THE BEAT GRID + beat envelope. bg = beats + fraction-of-beat, so
    // continuous motion (orbits, tilt swings) LANDS on the kicks instead of
    // drifting free — every song locks its own groove. kp spikes to 1 on each
    // kick and decays (drives beam ZOOM — width; the brightness knob stays
    // music-only, per the t93 doctrine).
    const beatFrac = (live && lastInt > 0 && lastBeatT >= 0) ? Math.min(1.15, (clock - lastBeatT) / lastInt) : 0;
    const bg = beats + beatFrac;
    const kp = live ? Math.exp(-Math.max(0, clock - lastBeatT) * (4.5 + Math.min(4, bpm / 45))) : 0;   // t114: livelier tempo → snappier punch
    lastBg = bg;

    // FLOOR: same bass/mid checker pulse, but the COLOR rides the hue
    col.setHSL((hue + 0.08) % 1, 0.95, 0.55);
    for (const t of tileMats) {
      t.mat.emissive.copy(col);
      t.mat.emissiveIntensity = Math.max(0, (t.even ? lv.bass : lv.mid * 0.7) - ((t.ix + t.iz) % 3) * 0.06) * 1.9;
    }


    // MIRROR BALL (t86: faceted + pin spot + glints — the spin is finally VISIBLE)
    ball.rotation.y += dt * (0.35 + lv.energy * 3.4);   // t103: tuned spin — the mirror-ball setting is gone (it just spins)
    ballLight.intensity = 4 + lv.treble * 12;
    pinSpot.intensity = live ? 2.2 + lv.energy * 2.6 : 0.4;
    const glintVis = 0.12 + rigLevel * 0.88;                  // glints live with the rig
    for (let i = 0; i < SHELL_N; i++) {
      const dir = shellDirs[i];
      const tw = 0.55 + 0.45 * Math.sin(clock * (3 + (i % 5)) + i * 2.1);   // per-facet twinkle
      glintDummy.position.set(ball.position.x + dir.x * 0.47, ball.position.y + dir.y * 0.47, ball.position.z + dir.z * 0.47);
      glintDummy.lookAt(glintDummy.position.x + dir.x, glintDummy.position.y + dir.y, glintDummy.position.z + dir.z);
      const s = (0.45 + tw * 0.85) * glintVis;
      glintDummy.scale.setScalar(s);
      glintDummy.updateMatrix();
      shellGlints.setMatrixAt(i, glintDummy.matrix);
      glintCol.setHSL((hue + 0.12) % 1, 0.35, 0.75 + tw * 0.25);
      shellGlints.setColorAt(i, glintCol);
    }
    shellGlints.instanceMatrix.needsUpdate = true;
    if (shellGlints.instanceColor) shellGlints.instanceColor.needsUpdate = true;
    for (let i = 0; i < FLOOR_N; i++) {                        // sweeping dots ride the spin across the floor
      const ang = (i / FLOOR_N) * Math.PI * 2 + ball.rotation.y * 1.6;
      const r = floorGlintSeed[i];
      glintDummy.position.set(xc + Math.cos(ang) * r, 0.03, floorZ + Math.sin(ang) * r);
      glintDummy.rotation.set(-Math.PI / 2, 0, ang);
      const s = (0.35 + lv.treble * 1.1) * glintVis;
      glintDummy.scale.setScalar(s);
      glintDummy.updateMatrix();
      floorGlints.setMatrixAt(i, glintDummy.matrix);
      glintCol.setHSL((hue + 0.12) % 1, 0.5, 0.7);
      floorGlints.setColorAt(i, glintCol);
    }
    floorGlints.instanceMatrix.needsUpdate = true;
    if (floorGlints.instanceColor) floorGlints.instanceColor.needsUpdate = true;

    // RIG — DJ-set PROGRAMS (sweep → chase → strobe → build), hue-synced.
    // t93: MOVEMENT, not brightness — the movement pref scales the TRAVEL
    // AMPLITUDE of every target (wider fans, bigger jumps, higher climbs).
    // Mc(1) = 1.0 exactly, so the default look keeps the tuned t86 motion;
    // 0.2 = tight theatrical nudges, 2.5 = full-festival swings. Brightness
    // (spot/cone/wash/LED) is driven ONLY by the music + program punch.
    const Mc = 0.3 + 0.7 * P.movement;
    // t103 (owner's realism note): the truss NEVER rotates — a real rig is
    // bolted to the ceiling; the FIXTURES pivot and their beams trace the
    // circles. The old carousel spin is gone; the orbit program (and the
    // per-beat poses) carry all of the motion now.
    const sg = bg * Math.PI / 2;                   // t109: the shape clock — one full figure per bar, beat-locked
    const sw = P.sweep;                            // t109: shape size (diameter / width / reach)
    const wrapA = (v) => Math.atan2(Math.sin(v), Math.cos(v));   // t109: shortest-path pan — no multi-turn unwinds
    const pat = dropT > 0.02 ? 18 : pattern;                   // t115: the drop blip seizes the rig (auto mode only — it's gated above)
    const ctrTilt = Math.atan2(2.6, H - 0.25);                 // t115: the tilt that lands a beam on the floor CENTER
    const beamCol = (i) => (pat === 18 ? col.setHSL(0, 0, 0.92) : col.setHSL((hue + i * 0.13) % 1, 1, 0.55));   // t115: the drop explodes in white
    for (let i = 0; i < rig.length; i++) {
      const r = rig[i];
      if (r.spin) { r.spin.rotation.y += dt * (1 + lv.mid * 8) * Mc; continue; }
      let ty, tx = 0, punch = 0.4 + lv.energy * 1.3;
      if (pattern === 0) { ty = (pose * 1.05 + r.phase + ph * 0.2) * Mc; tx = (0.16 + 0.64 * Math.sin(bg * Math.PI + r.phase * 0.7)) * Mc; }        // sweep — the fan, WIDER beat-grid tilt swings (t103)
      else if (pattern === 1) { const on = Math.floor(barBeats % rig.length) === i; ty = on ? pose * 1.2 * Mc : (r.phase + ph * 0.15) * Mc; tx = on ? (0.14 + 0.64 * Math.sin(beats * 1.7 + i)) * Mc : 0.24 * Mc; punch *= on ? 3.1 : 0.26; }  // chase — harder hits, darker gaps (t103)
      else if (pattern === 2) { ty = (r.phase + ph * 0.15) * Mc; tx = kick ? (0.3 + ((beats * 7 + i * 3) % 5) * 0.16) * Mc : 0.1 * Mc; punch *= kick ? 3.2 : (lv.bass > 0.3 ? 1.2 : 0.08); }  // strobe — UNTOUCHED (t86 fan contract)
      else if (pattern === 3) { ty = ((i / rig.length) * Math.PI * 2 + pose * 0.3 + ph * 0.15) * Mc; tx = (0.14 + 0.7 * (1 - barBeats * 0.24) + (barBeats === 3 && kick ? 0.55 : 0)) * Mc; if (barBeats === 3 && kick) { punch *= 3.5; } }  // build & drop — steeper climb, HARDER drop on the four (t103)
      else if (pattern === 4) { ty = (bg * Math.PI * 0.62 + i * Math.PI / 2) * Mc * 1.3; tx = (0.24 + 0.52 * Math.sin(bg * Math.PI + i * 1.3)) * Mc; punch *= 1 + kp * 0.9; }  // ORBIT — THE circle: full 3D cones, wider + faster now the truss is bolted (t103)
      // ── t109: THE MOVEMENT WAVE — continuous shapes on the BEAT GRID. One
      // full figure per bar (sg), frozen between beats (the t59 stillness
      // contract holds), sweeping while the music drives. The moving-head
      // recipe: PAN describes the circle, TILT sets its diameter. sweep
      // scales the diameter; spread staggers the heads; movement (Mc) scales
      // all travel, as everywhere. The kick flares the beams out a touch —
      // MOVEMENT, never the brightness knob.
      else if (pattern === 6) { ty = r.phase + sg; tx = 0.42 + 0.30 * sw * Mc * Math.cos(sg); punch *= 1 + kp * 0.6; }   // CIRCLE — all four heads draw ONE circle together (owner's ask)
      else if (pattern === 7) { ty = r.phase + 0.55 * sw * Mc * Math.sin(sg); tx = 0.42 + 0.30 * sw * Mc * Math.sin(2 * sg); punch *= 1 + kp * 0.6; }   // FIGURE-8 — pan 1×, tilt 2× (the classic accident, now on purpose)
      else if (pattern === 8) { const br = 0.30 + 0.70 * (0.5 + 0.5 * Math.sin(bg * Math.PI / 8)); ty = r.phase + sg; tx = 0.42 + 0.34 * sw * Mc * br * Math.cos(sg); punch *= 1 + kp * 0.6; }   // BREATH — the circle's diameter swells over 4 bars
      else if (pattern === 9) { ty = r.phase + 0.85 * sw * Mc * Math.sin(sg / 2 + i * Math.PI / 2 * P.spread); tx = 0.38 + 0.16 * Mc * Math.sin(sg + i * 0.5); punch *= 1 + kp * 0.5; }   // STADIUM ARC — wide slow fanned sweeps across the room
      else if (pattern === 10) { const f = 0.30 + 0.70 * (0.5 - 0.5 * Math.cos(bg * Math.PI / 2)); ty = r.phase + ((i / 3) - 0.5) * 1.5 * sw * Mc * f; tx = 0.36 + Math.abs(i - 1.5) / 1.5 * 0.34 * Mc * f; punch *= 1 + kp * 0.8; }   // FAN — peacock open across the bar, close on the one (outer heads dip lower)
      else if (pattern === 11) { ty = r.phase + sg; tx = 0.42 + 0.30 * sw * Mc * Math.cos(sg + i * Math.PI / 2 * P.spread); punch *= 1 + kp * 0.6; }   // SNAKE — the circle ripples around the truss (spread 0 = lockstep, 1 = full ripple)
      else if (pattern === 12) { const sep = 0.12 + kp * 1.1 * sw; ty = r.phase * 0.15 + 0.35 * Mc * Math.sin(sg * 0.25) + (i - 1.5) * sep * Mc; tx = 0.40 + 0.10 * Mc * Math.sin(sg * 0.5); punch *= 1 + kp * 1.2; }   // ALL-EYES — converge, searchlight together, BURST on the kick
      // ── t115: THE FESTIVAL SIX (owner spec) — scissor · vortex · X · wave ·
      // ground sweep · drop explode. Converging patterns aim THROUGH the
      // floor (aimTyTx), so beams actually cross where they claim to. ──
      else if (pat === 13) { ty = r.phase + (i % 2 === 0 ? 1 : -1) * Math.sin(sg) * 0.7 * sw * Mc; tx = ctrTilt + 0.5 * Mc * Math.sin(2 * sg); punch *= 1 + kp * 0.7; }   // SCISSOR CROSS — mirrored pairs slice in through the center, out to the walls (tilt crosses ctrTilt twice a bar)
      else if (pat === 14) { const th = sg - i * (Math.PI / 2) * (0.3 + 0.7 * P.spread); const R = 1.6 + 1.0 * sw; const aim = aimTyTx(r, xc + Math.cos(th) * R, floorZ + Math.sin(th) * R); ty = aim[0]; tx = aim[1]; punch *= 1 + kp * 0.8; }   // VORTEX CYCLONE — all four chase an orbiting floor point (1 orbit/bar: fast enough to feel, slow enough to TRACK)
      else if (pat === 15) { const isA = (i === 0 || i === 3); const reach = (isA ? Math.sin(sg) : Math.cos(sg)) * 2.8 * sw; const aim = aimTyTx(r, xc + 0.707 * reach, floorZ + (isA ? 0.707 : -0.707) * reach); ty = aim[0]; tx = aim[1]; punch *= 1 + kp * 0.6; }   // DIAGONAL X — 0+3 and 1+2 slice the two diagonals through the center
      else if (pat === 16) { tx = 0.62 + 0.30 * Mc * Math.sin(sg + i * Math.PI / 2); ty = r.phase + 0.6 * sw * Mc * Math.cos(sg / 2 + i * Math.PI / 2); punch *= 1 + kp * 0.5; }   // SINE WAVE CHASE — the fluid wave rolling booth → entrance
      else if (pat === 17) { const zs = Math.sin(sg * 0.5) * 1.3 * sw, xs = Math.sin(sg) * 0.4 * sw; const aim = aimTyTx(r, xc + xs + (i - 1.5) * 0.45, floorZ + zs); ty = aim[0]; tx = aim[1]; punch *= 1 + kp * 0.4; }   // GROUND SWEEP — steep parallel searchlights (ceiling is 4.27 m: the travel is tuned so every head stays under ~0.8 rad — as steep as geometry allows)
      else if (pat === 18) { const cx = (i === 0 || i === 2) ? -1 : 1, cz = (i === 0 || i === 1) ? -1 : 1; const orb = sg * 3 + i * Math.PI / 2; const aim = aimTyTx(r, xc + cx * 3.2 * sw + Math.cos(orb), floorZ + cz * 3.2 * sw + Math.sin(orb)); ty = aim[0]; tx = Math.min(1.45, aim[1] + 0.15); punch *= 2.4; }   // DROP EXPLODE — snapped wide to the corners, white, 3× sweeps
      else { const h1 = ((beats * 2654435761 + i * 40503) >>> 0) % 1000 / 1000, h2 = ((beats * 97 + i * 13 + 7) >>> 0) % 1000 / 1000; ty = (h1 * 2.6 - 1.3) * Mc; tx = (0.1 + h2 * 0.9) * Mc; punch *= 1 + kp * 1.5; }  // BEAT JUMP — a fresh 3D pose on every kick, bigger scatter + punch (t103)
      // t109: the shape programs get a kick FLARE (the beams push out ON the
      // kick and settle after — movement, not brightness) and shortest-path
      // pan (a circling head never unwinds through turns it doesn't need).
      if (pat >= 6 && pat !== 17) {          // t115: the scanner stays STEEP — no kick-flare tilt for program 17
        tx += kp * 0.30 * Mc;
        // t115: canonical AND shortest-path — wrap the current angle (bounded
        // telemetry, the t109 contract) and ease toward the nearest equivalent
        // target angle (no long-way-around sweeps). Pure target-side shortest
        // path alone let the value drift past ±π after corner-aim programs.
        const cur = wrapA(r.pivot.rotation.y);
        r.pivot.rotation.y = cur;
        ty = cur + wrapA(wrapA(ty) - cur);
      }
      // t59: EASE to the target, then CAP the travel speed — real moving-head
      // fixtures SWEEP to their next position; they never snap. t93: with
      // movement pushing targets farther, the caps bind more — so the SPEED
      // pref (how fast beams travel) is now clearly visible too.
      const ease = 1 - Math.exp(-dt * 10);
      const capY = 4.6 * P.speed * dt, capX = 3.2 * P.speed * dt;
      let dy = (ty - r.pivot.rotation.y) * ease;
      let dx2 = (tx - r.pivot.rotation.x) * ease;
      r.pivot.rotation.y += Math.max(-capY, Math.min(capY, dy));
      r.pivot.rotation.x += Math.max(-capX, Math.min(capX, dx2));
      const zt = 1 + (live ? kp * 0.45 + lv.energy * 0.15 : 0);   // t95: BEAM ZOOM — the lens punches open on the kick (width; never the brightness knob)
      r.z += (zt - r.z) * (1 - Math.exp(-dt * 9));
      r.cone.scale.set(r.z, 1, r.z);
      r.spot.intensity = punch * 3.2 * rigLevel;
      r.cone.material.opacity = Math.min(0.95, (0.10 + Math.min(0.7, punch * 0.3)) * rigLevel);
      r.cone.material.color.copy(beamCol(i)); r.cone.material.emissive.copy(beamCol(i));
      r.spot.color.copy(beamCol(i));
    }
    // t115: track the four beam landings — impact pools on the floor, pulsing
    // with the sub-bass (the spec's floor-impact spots), plus the telemetry
    // the tests read (azimuth / elevation / hit point from the REAL angles)
    for (let i = 0; i < 4; i++) {
      const r = rig[i];
      const t = Math.max(0.05, r.pivot.rotation.x), pW = r.pivot.rotation.y + truss.rotation.y;
      const st = Math.sin(t), ct = Math.cos(t);
      const dx = -Math.sin(pW) * st, dz = -Math.cos(pW) * st;
      r.pivot.getWorldPosition(_awp);
      const k = (_awp.y - 0.05) / ct;
      const hx = _awp.x + dx * k, hz = _awp.z + dz * k;
      beamHits[i][0] = +hx.toFixed(2); beamHits[i][1] = +hz.toFixed(2);
      beamAz[i] = +Math.atan2(dx, dz).toFixed(2); beamEl[i] = +t.toFixed(2);
      const im = impacts[i];
      im.position.set(hx, 0.06, hz);
      // t116: the pool IS the cone's footprint — minor = spread at the floor
      // (k = axial distance to the floor, r.z = the lens zoom), major =
      // minor / cos(tilt) along the beam direction; grazing beams smear long
      const minor = Math.min(2.2, k * CONE_TAN * r.z);
      const elong = Math.min(3.5, 1 / Math.max(0.12, ct));
      const major = Math.min(4.0, minor * elong);
      im.scale.set(major, 1, minor);
      im.rotation.y = Math.atan2(-dz, dx);      // the ellipse points where the beam points
      spotScales[i][0] = +major.toFixed(2); spotScales[i][1] = +minor.toFixed(2);
      const strobe = pat === 18 ? ((bg % 0.5) < 0.25 ? 1 : 0.18) : 1;      // the drop strobes its pools
      im.material.opacity = live ? Math.min(0.85, (0.12 + lv.bass * 0.55 + kp * 0.18) * strobe) / Math.sqrt(elong) : 0;   // spread wider → softer
      im.material.color.copy(beamCol(i));
      im.visible = live;
    }
    washes[0].intensity = 0.5 + lv.bass * 3.6;
    washes[1].intensity = 0.5 + lv.mid * 3.6;
    ambient.intensity = 0.4 + lv.energy * 0.6;

    // NEON: LED bars ride the hue and PULSE per band; signs breathe with it
    for (let i = 0; i < ledBars.length; i++) {
      const m2 = ledBars[i].material;
      m2.color.setHSL((hue + 0.5 + i * 0.07) % 1, 1, 0.6);
      m2.emissive.copy(m2.color);
      m2.emissiveIntensity = 0.4 + lv.energy * 2.6 + (kick && i % 2 === 0 ? 1.1 : 0);
    }
    coveMat.color.setHSL((hue + 0.25) % 1, 1, 0.6); coveMat.emissive.copy(coveMat.color);
    coveMat.emissiveIntensity = 0.5 + lv.bass * 2.2; cove2.material = coveMat;
    for (const s2 of speakerPulse) s2.material.emissiveIntensity = 0.3 + lv.bass * 2.0;
    libSign.material.color.setScalar(0.72 + lv.mid * 0.55);      // t54: the sign over the DOOR glows with the mids
  }

  // t119: THE DANCE HALL RE-THEMES — every surface that carries the theme at
  // build time also follows a live theme change now: club walls/ceiling/
  // perimeter floor derive from the theme, the checker tiles, the speaker
  // rings, sub mouths, booth top glow, mixer faders, the laptop screen, the
  // DJ'S LIBRARY sign and every record plaque wear the accent. The light
  // show (beams, LED wall, mirror ball) keeps its own colors — it's the show.
  function applyTheme(t) {
    curTheme = { ...t };
    wallMat.color.set(wallOf(t));
    darkMat.color.set(ceilOf(t));
    perimFloorMat.color.set(perimOf(t));
    lfloor.material.color.set(t.floor || '#131d40');
    for (const tm of tileMats) { tm.mat.color.set(tileBase(t, tm.even)); tm.mat.emissive.set(t.accent); }
    ringMat.color.set(t.accent); ringMat.emissive.set(t.accent);
    for (const m of speakerPulse) { m.material.color.set(t.accent); m.material.emissive.set(t.accent); }
    topGlowMat.color.set(t.accent); topGlowMat.emissive.set(t.accent);
    for (const fm of faderMats) { fm.color.set(t.accent); fm.emissive.set(t.accent); }
    drawLaptopScreen(t.accent);
    drawLibSign(t);
    for (const p of plaqueMeshes) {
      p.mesh.material.map?.dispose();
      p.mesh.material.map = plaqueTexture(p.title, t.accent);
      p.mesh.material.needsUpdate = true;
    }
  }

  function info() {
    return {
      lights: { ...P },                     // t86: the adjustable light engine
      ball: { facets: true, glints: SHELL_N + FLOOR_N, pinSpot: true },
      theme: { wall: '#' + wallMat.color.getHexString(), floor: '#' + perimFloorMat.color.getHexString(),
        accent: '#' + topGlowMat.color.getHexString(), tiles: tileMats.length ? { even: '#' + tileMats[0].mat.color.getHexString(), emissive: '#' + tileMats[0].mat.emissive.getHexString() } : null,
        plaques: plaqueMeshes.length, signBg: lastSignBg },   // t119/t120: provable — the dance hall follows the theme
      rigYaw: rig.filter(r => !r.spin).map(r => +r.pivot.rotation.y.toFixed(3)),
      rigSpot: rig.filter(r => !r.spin).map(r => +r.spot.intensity.toFixed(2)),
      x0: X0, x1: X1, z0: Z0, z1: Z1, onRightSide: X0 > 0,
      floorTiles: tileMats.length, records: records.length,
      recordWall: {                                  // t65: framed vinyls, flush on the walls
        n: records.length, framed: records.length > 0,
        flush: records.every(r => (r.wall.axis === 'x' ? Math.abs(r.mesh.position.x - (r.wall.at - r.wall.face * 0.018)) : Math.abs(r.mesh.position.z - (r.wall.at - r.wall.face * 0.018))) < 0.05),
        plaques: records.length   // one song-name plaque per record
      },
      sharedWallOpen: L.dance.door.width, doorCenterZ: Z1 - L.dance.door.width / 2 - 0.35,
      speakers: speakerPts.length, subs: 2, ledBars: ledBars.length + 2,
      boothX, boothZ, patterns: 19,   // t51 · t54 · t95→t109: booth by the DOOR · t115: 13 + the festival six
      beamAz: [...beamAz], beamEl: [...beamEl],                                   // t115: where the beams actually POINT (the Euler-order proof)
      beamHits: beamHits.map(h => [...h]), floorSpots: impacts.length,            // t115: floor-impact pools + their landings
      spotShape: impacts[0]?.geometry?.type === 'CircleGeometry' ? 'circle' : 'square',   // t116: the pool matches the cone
      spotScales: spotScales.map(s2 => [...s2]),                                         // t116: [semi-major, semi-minor] per head
      dropBlip: dropT > 0.02,                                                     // t115: the drop detector fired
      boothApron: +(boothZ - 0.55 - Z0).toFixed(2),   // walkable gap behind (m)
      subsAtFront: +(subPositions[0].z - Z0).toFixed(2) > 2.4,   // t58: mouths visible past the counter
      boothSideLane: +(boothX - 1.7 - X0).toFixed(2), // walkable left lane (m)
      libSignOverDoor: { x: +libSign.position.x.toFixed(2), y: +libSign.position.y.toFixed(2) },
      lightMode, djSpot: +djSpot.intensity.toFixed(1),   // t54: idle spot ↔ live rig
      beat: { beats, bpm, lastBeatAgo: +(clock - lastBeatT).toFixed(2) },      // t59: the beat engine
      program: pattern,                                                   // t109: the live program id (0–12)
      rigYaws: rig.slice(0, 4).map(r => +r.pivot.rotation.y.toFixed(3)),        // t59: per-beam angles (beams only)
      rigPitches: rig.slice(0, 4).map(r => +r.pivot.rotation.x.toFixed(3)),
      rigZoom: rig.slice(0, 4).map(r => +r.cone.scale.x.toFixed(3)),        // t95: beat-punched beam zoom
      trussYaw: +truss.rotation.y.toFixed(3),                                // t95: the rig circling the floor
      beatGrid: +lastBg.toFixed(3),                                          // t95: beats + fraction — motion locked to the kicks
      boothLayout: { counterH: 0.94, laptopX: 0, mixerX: -0.62, deckX: DECKX } // t59: side-by-side, laptop centered
    };
  }

  // t108: LIVE BOOTH MONITOR — the laptop screen becomes a real CanvasTexture
  // HUD (titles · VU · BPM · AUTO-DJ/REC badges), repainted by scene.js ~30fps.
  function paintHud(snap) {
    const w = 256, h = 160;
    sg.fillStyle = '#06070d'; sg.fillRect(0, 0, w, h);
    sg.strokeStyle = '#232a4d'; sg.lineWidth = 1; sg.strokeRect(0.5, 0.5, w - 1, h - 1);
    sg.textAlign = 'left'; sg.font = '700 13px system-ui';
    const deck = (y, name, col, d) => {
      sg.fillStyle = col; sg.fillText(name, 8, y);
      sg.fillStyle = d?.playing ? '#dfe6ff' : '#8fa0d8';
      sg.fillText(d?.title ? String(d.title).slice(0, 20) : '—', 26, y, 118);
      sg.fillStyle = col; sg.textAlign = 'right';
      sg.fillText(d?.bpm ? Math.round(d.bpm * d.rate) + '' : '—', 190, y);
      sg.textAlign = 'left';
    };
    deck(20, 'A', mixHex(curTheme.accent || '#00f0ff', '#ffffff', 0.28), snap?.a); deck(38, 'B', curTheme.accent || '#ff2a85', snap?.b);   // t119: deck channels wear the theme accent (A = light tint, B = full)
    if (snap?.autoDj?.on) {
      // t111: AUTO-DJ UP-NEXT — with the mix running, the laptop shows the
      // queue (how many left + the next three), so you can read the night
      // from the floor with the menu closed.
      sg.textAlign = 'left';
      sg.fillStyle = '#00ff66'; sg.font = '700 11px system-ui';
      sg.fillText('AUTO-DJ · ' + (snap.autoDj.remaining ?? 0) + ' LEFT' + (snap.autoDj.style ? ' · ' + String(snap.autoDj.style).toUpperCase() : ''), 8, 62);   // t112: the live mix style rides the header
      sg.font = '500 10px system-ui';
      (snap.autoDj.next || []).slice(0, 3).forEach((t, k) => {
        sg.fillStyle = '#dfe6ff';
        sg.fillText((k + 1) + '. ' + String(t).slice(0, 32), 8, 78 + k * 12);
      });
      if ((snap.autoDj.remaining || 0) > 3) { sg.fillStyle = '#8fa0d8'; sg.fillText('+' + (snap.autoDj.remaining - 3) + ' more', 8, 114); }
      // t114: full 3-band meters while the mix runs (owner: "levels on the
      // computer when the panel is closed … high mid and low") — LOW/MID/HIGH
      // columns down the right edge, the same data the idle VU uses
      const bands = [[snap?.lv?.bass, '#ff2a85'], [snap?.lv?.mid, '#00ff66'], [snap?.lv?.treble, '#00f0ff']];
      bands.forEach(([v, col2], k) => {
        const x = 208 + k * 15, top = 58, bot = 128, hh = bot - top;
        sg.fillStyle = '#12141f'; sg.fillRect(x, top, 11, hh);
        const f = Math.max(0, Math.min(1, v || 0));
        sg.fillStyle = col2; sg.fillRect(x, bot - f * hh, 11, f * hh);
      });
      sg.fillStyle = '#8fa0d8'; sg.font = '600 8px system-ui'; sg.textAlign = 'center';
      sg.fillText('LO', 213, 138); sg.fillText('MID', 228, 138); sg.fillText('HI', 243, 138);
    } else {
      // 3-band VU (FFT → screen)
      const bars = [['B', snap?.lv?.bass, '#ff2a85'], ['M', snap?.lv?.mid, '#00ff66'], ['T', snap?.lv?.treble, '#00f0ff']];
      bars.forEach(([lab, v, col], k) => {
        const y = 52 + k * 14;
        sg.fillStyle = '#8fa0d8'; sg.font = '600 9px system-ui'; sg.fillText(lab, 8, y + 8);
        sg.fillStyle = '#12141f'; sg.fillRect(20, y, 216, 9);
        sg.fillStyle = col; sg.fillRect(20, y, Math.min(216, (v || 0) * 216), 9);
      });
    }
    // badges
    sg.font = '700 11px system-ui'; sg.textAlign = 'center';
    if (snap?.autoDj) { sg.fillStyle = '#00ff66'; sg.fillText('AUTO-DJ', 60, 140); }
    if (snap?.rec) { sg.fillStyle = '#ff2a85'; sg.fillText('● REC', 128, 140); }
    if (snap?.mic) { sg.fillStyle = '#ffb800'; sg.fillText('MIC', 190, 140); }
    sg.fillStyle = '#8fa0d8'; sg.font = '500 9px system-ui'; sg.fillText('click to mix', 128, 154);
    screenTex.needsUpdate = true;
  }
  return { group, occluders, colliders, boothTargets, recordTargets, setRecords, update, info, setPrefs, speakerWorld, paintHud, applyTheme };
}
