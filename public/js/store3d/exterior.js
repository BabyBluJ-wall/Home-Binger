// ─────────────────────────────────────────────────────────────────────────────
//  store3d/exterior.js — the world OUTSIDE the front door
//  ───────────────────────────────────────────────────────────────────────────
//  Modeled after the classic Family Video at 2610 Calumet Dr, Sheboygan, WI
//  (a tan-brick box with the chain's blue fascia on a four-lane highway
//  strip — pizza place, convenience store, strip shops, houses beyond).
//  All geometry is real 3D at true depths, so it PARALLAXES as you move:
//    · our storefront's brick face + blue HOME BINGER fascia (either side of the door)
//    · the glass entry tower out front (brick posts, blue sloped canopy)
//    · parking lot with painted stalls, carts, parked cars, light poles
//    · a four-lane road with double-yellow center, curbs, driveway aprons
//    · pitched-roof pizza place, gas station + price sign, stepped strip
//      shops with mullioned windows and awnings, houses in the distance
//    · utility poles with sagging wires, trees, a distant treeline, warm sky
//  Procedural canvas textures (brick / siding / shingles / windows) keep the
//  whole thing self-contained — no image files.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT, STORE } from './config.js?v=1789174562813';
import { signTexture } from './textures.js?v=1789174562813';

// ── procedural material helpers (cached per accent) ─────────────────────────
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const brickTex = (base = '#b59a76', mortar = '#d8cbb4') => tex(256, 128, (g, w, h) => {
  g.fillStyle = mortar; g.fillRect(0, 0, w, h);
  const bw = 42, bh = 20;
  for (let row = 0; row * bh < h; row++)
    for (let col = -1; col * bw < w + bw; col++) {
      const off = (row % 2) * bw / 2;
      const v = 0.86 + Math.random() * 0.22;
      g.fillStyle = base;
      g.fillStyle = `rgb(${Math.round(181 * v)},${Math.round(154 * v)},${Math.round(118 * v)})`;
      g.fillRect(col * bw + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
    }
});
const sidingTex = (base = '#cfc7b4') => tex(128, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 16) {
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, y + 2, w, 1);
  }
});
const shingleTex = (base = '#5a5f68') => tex(128, 128, (g, w, h) => {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 12) {
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, y, w, 3);
    for (let x = ((y / 12) % 2) * 10; x < w; x += 20) { g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, y + 3, 1.5, 9); }
  }
});
// mullioned storefront glass: dark reflective glass + frame grid
const windowTex = () => tex(256, 128, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#3b4c63'); grd.addColorStop(0.6, '#24303f'); grd.addColorStop(1, '#46586e');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(0, 0, w, 10);      // sky reflection
  g.strokeStyle = '#e8e4da'; g.lineWidth = 5;
  for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  g.beginPath(); g.moveTo(0, h * 0.42); g.lineTo(w, h * 0.42); g.stroke();
  g.strokeStyle = '#e8e4da'; g.lineWidth = 8; g.strokeRect(1, 1, w - 2, h - 2);
});
const treeLineTex = () => tex(512, 96, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  for (let x = 0; x < w; x += 8) {
    const th = h * (0.45 + Math.random() * 0.55);
    g.fillStyle = `rgb(${28 + Math.random() * 20},${72 + Math.random() * 30},${40 + Math.random() * 18})`;
    g.beginPath(); g.arc(x + 4, h - th / 2, 6 + Math.random() * 7, 0, Math.PI * 2); g.fill();
  }
});

export function buildExterior(theme) {
  const g = new THREE.Group();
  g.name = 'exterior';
  const D = LAYOUT.room.l / 2;            // door wall line (INTERIOR face)
  const W = LAYOUT.room.w / 2;
  const T = LAYOUT.room.wallThickness || 0.25;
  const F = D + T;                        // the OUTER face of the front wall —
                                          // every storefront piece mounts HERE

  const std = (c, r = 0.9, m = 0.0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const box = (w, h, d, mat, x, y, z, rx = 0, ry = 0) => {
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mm.position.set(x, y, z); mm.rotation.x = rx; mm.rotation.y = ry;
    g.add(mm); return mm;
  };

  // ══ OUR STOREFRONT (the Family-Video-style box you're standing in) ══
  const FV_BLUE = '#1d4f91';   // Family-Video chain blue
  const YELLOW = '#f5c53d';     // chain yellow pinstripe
  const brick = brickTex('#b59a76');
  const brickMat = new THREE.MeshStandardMaterial({ map: brick, roughness: 0.95 });
  const fasciaMat = std(FV_BLUE, 0.55);
  // brick veneer on the OUTER face of the store front wall (either side of the door)
  const veneerL = new THREE.Mesh(new THREE.PlaneGeometry(W - 1.5, 2.55), brickMat);
  veneerL.position.set(-(1.5 + (W - 1.5) / 2), 2.55 / 2, F + 0.03); veneerL.rotation.y = Math.PI; g.add(veneerL);
  const veneerR = veneerL.clone(); veneerR.position.x = -veneerL.position.x; g.add(veneerR);
  // blue fascia band with the store name + yellow pinstripe (chain style)
  const fascia = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, 0.85), fasciaMat);
  fascia.position.set(0, 2.95, F + 0.05); fascia.rotation.y = Math.PI; g.add(fascia);
  const nameSign = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 0.62),
    new THREE.MeshBasicMaterial({ map: signTexture(STORE.name, { accent: '#ffffff', bg: FV_BLUE }), toneMapped: false })
  );
  nameSign.position.set(0, 2.95, F + 0.07); nameSign.rotation.y = Math.PI; g.add(nameSign);
  box(W * 2 + 0.3, 0.07, 0.18, std(YELLOW, 0.6), 0, 3.40, F + 0.12);     // yellow pinstripe cap
  box(W * 2 + 0.6, 0.22, 0.36, std('#8d8371', 0.95), 0, 4.16, F + 0.24); // roof edge
  // parapet caps — close the wall tops so the box walls read as a real building
  // t91 FIX (the "gray band on the ceiling near the theater"): this whole
  // group is shifted +hall.d for the street (t49 facade-flush), which dragged
  // these caps 2.6 m INTO the building — the back cap crossed the sales-floor
  // ceiling at z≈−3.6, full width, its bottom face EXACTLY at ceiling height
  // (the gray flicker band between the pink accent panel and the white light
  // row), and the side caps streaked the ceiling edges (store, hall, dance
  // hall, DJ lib). Caps now (a) compensate the shift so they sit on the walls
  // they were drawn for, (b) span store + front hall as one building, and
  // (c) ride 2 cm ABOVE wall height so a cap bottom can never share a plane
  // with any interior ceiling. Coplanar = flicker; a 2 cm shadow joint at
  // 4.3 m is invisible from every reachable viewpoint.
  const capMat = std('#8d8371', 0.95);
  const HB = LAYOUT.hall.d;                                    // the t49 group shift to undo
  const CAPY = LAYOUT.room.h + 0.08;                           // bottom face at H + 0.02
  const CW = LAYOUT.room.w + 2 * T + 0.35;                     // cap width, across the building
  const CL = LAYOUT.room.l + 2 * T + LAYOUT.hall.d + 0.35;     // cap length: store + hall, full depth
  box(CW, 0.12, T + 0.35, capMat, 0, CAPY, D + T / 2);         // street cap — atop the hall's front wall
  box(CW, 0.12, T + 0.35, capMat, 0, CAPY, -D - T / 2 - HB);   // back cap — back on the store's back wall
  box(T + 0.35, 0.12, CL, capMat, -W - T / 2, CAPY, -HB / 2);  // side caps — full building depth
  box(T + 0.35, 0.12, CL, capMat, W + T / 2, CAPY, -HB / 2);
  // brick on the side exterior faces too (seen at an angle through the door)
  const sideV = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.room.l, LAYOUT.room.h * 0.62), brickMat);
  sideV.position.set(-W - T - 0.03, LAYOUT.room.h * 0.31, 0); sideV.rotation.y = -Math.PI / 2; g.add(sideV);
  // (t51: the RIGHT side is the dance hall now — interior, no brick veneer)

  // ══ THE GLASS ENTRY TOWER (right out front of the door) ══
  const TW = 1.9, TZ0 = F + 0.10, TZ1 = D + 2.95, TH = 3.5;   // TZ0 clears the wall's outer face F
  const postBrick = new THREE.MeshStandardMaterial({ map: brickTex('#a8906c'), roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({ color: '#d6ecff', transparent: true, opacity: 0.13, roughness: 0.03, metalness: 0.05 });
  box(4.2, 0.06, 2.35, std('#8b8f96', 0.95), 0, 0.03, F + 0.05 + 1.175); // floor slab (starts OUTSIDE the outer face)
  for (const [px, pz] of [[-TW, TZ0], [TW, TZ0], [-TW, TZ1], [TW, TZ1]])
    box(0.18, TH, 0.18, postBrick, px, TH / 2, pz);                      // brick corner posts
  box(0.05, TH - 0.3, TZ1 - TZ0 - 0.2, glassMat, -TW + 0.09, (TH - 0.3) / 2 + 0.1, (TZ0 + TZ1) / 2);
  box(0.05, TH - 0.3, TZ1 - TZ0 - 0.2, glassMat, TW - 0.09, (TH - 0.3) / 2 + 0.1, (TZ0 + TZ1) / 2);
  box(TW * 2 - 0.2, TH - 0.3, 0.05, glassMat, 0, (TH - 0.3) / 2 + 0.1, TZ1 - 0.09);
  // sloped blue canopy + yellow edge + white sign band — starts beyond the
  // outer face so it can never bleed through the wall above the door
  box(4.3, 0.16, 2.44, fasciaMat, 0, TH + 0.08, F + 1.32, 0.06);
  box(4.35, 0.07, 0.20, std(YELLOW, 0.6), 0, TH + 0.16, TZ1 - 0.28, 0.06);
  const towerSign = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.5),
    new THREE.MeshBasicMaterial({ map: signTexture('VIDEOS · GAMES', { accent: '#ffffff', bg: FV_BLUE }), toneMapped: false })
  );
  towerSign.position.set(0, TH + 0.45, TZ1 + 0.02); towerSign.rotation.y = Math.PI; g.add(towerSign);
  box(4.0, 0.55, 0.12, fasciaMat, 0, TH + 0.45, TZ1 - 0.04);

  // ══ PARKING LOT ══
  const lot = std('#484a51', 0.98);
  box(46, 0.05, 10.5, lot, 0, 0.025, D + 8.6);
  box(46, 0.07, 1.7, std('#9aa0a8', 0.95), 0, 0.035, D + 3.35);          // sidewalk by the door
  const lineMat = std('#c9ccd2', 0.9);
  for (let x = -14.8; x <= 14.8; x += 3.7) box(0.10, 0.012, 5.0, lineMat, x, 0.055, D + 6.4);
  // cart return corral
  box(1.6, 0.06, 2.6, std('#7c828c', 0.7, 0.4), 6.2, 0.55, D + 4.4);
  for (const [cx, cz] of [[5.5, D + 4.4], [6.9, D + 4.4], [6.2, D + 3.2], [6.2, D + 5.6]])
    box(0.06, 1.0, 0.06, std('#7c828c', 0.7, 0.4), cx, 0.5, cz);
  // light poles (cobra-head style)
  const poleMat = std('#6a7078', 0.5, 0.6);
  for (const px of [-8.5, 8.5]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 5.6, 10), poleMat);
    pole.position.set(px, 2.8, D + 5.2); g.add(pole);
    box(1.4, 0.10, 0.12, poleMat, px + 0.6, 5.55, D + 5.2);
    box(0.75, 0.09, 0.30, new THREE.MeshStandardMaterial({ color: '#fff2cf', emissive: '#ffe9b0', emissiveIntensity: 1.5 }), px + 1.15, 5.49, D + 5.2);
  }

  // ══ PARKED CARS (era-appropriate hand-me-downs) ══
  const car = (x, z, color, rotY = 0) => {
    const c = new THREE.Group();
    const bodyMat = std(color, 0.35, 0.55);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.52, 4.20), bodyMat); body.position.y = 0.55; c.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.46, 2.05), std(color, 0.35, 0.55)); cabin.position.set(0, 1.0, -0.15); c.add(cabin);
    const win = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.30, 1.95), std('#1c2430', 0.15, 0.7)); win.position.set(0, 1.02, -0.15); c.add(win);
    for (const [wx, wz] of [[-0.78, 1.32], [0.78, 1.32], [-0.78, -1.32], [0.78, -1.32]]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.30, 0.20, 14), std('#15181e', 0.85));
      wh.rotation.z = Math.PI / 2; wh.position.set(wx, 0.30, wz); c.add(wh);
    }
    c.position.set(x, 0.03, z); c.rotation.y = rotY;
    g.add(c);
  };
  car(-7.4, D + 5.2, '#3d5a3a', Math.PI / 2 + 0.06);   // forest-green sedan
  car(-3.6, D + 6.8, '#6e222f', Math.PI / 2 - 0.04);   // burgundy
  car(2.2, D + 5.0, '#b8b0a0', Math.PI / 2);           // tan
  car(11.1, D + 6.6, '#2d3a52', Math.PI / 2 + 0.03);   // navy

  // ══ THE ROAD — four lanes of Calumet Dr ══
  box(64, 0.05, 9.0, std('#34363c', 0.98), 0, 0.03, D + 15.3);
  const dashMat = std('#e2e4e8', 0.9);
  for (let x = -29; x <= 29; x += 5.0) box(1.3, 0.012, 0.16, dashMat, x, 0.06, D + 13.4);
  for (let x = -29; x <= 29; x += 5.0) box(1.3, 0.012, 0.16, dashMat, x, 0.06, D + 17.2);
  box(64, 0.012, 0.16, std('#d9a53c', 0.9), 0, 0.06, D + 15.3);          // double yellow
  box(64, 0.012, 0.14, std('#d9a53c', 0.9), 0, 0.06, D + 15.52);
  const curbMat = std('#a7abb2', 0.95);
  box(64, 0.14, 0.30, curbMat, 0, 0.07, D + 10.55);
  box(64, 0.14, 0.30, curbMat, 0, 0.07, D + 20.05);
  box(64, 0.07, 1.6, std('#9aa0a8', 0.95), 0, 0.035, D + 20.9);          // far sidewalk

  // ══ NEIGHBORS ACROSS THE ROAD ══
  const winMat = new THREE.MeshStandardMaterial({ map: windowTex(), roughness: 0.25, metalness: 0.35 });
  const shingleMat = new THREE.MeshStandardMaterial({ map: shingleTex('#5a5f68'), roughness: 0.95 });
  const ZB = D + 23.2;                     // building row (front face at ZB − depth/2)

  // pizza place — pitched shingle roof behind a brick storefront
  {
    const x = -11.8, w = 7.6, d = 5.4, h = 3.1;
    const front = ZB - d / 2;
    box(w, h, d, new THREE.MeshStandardMaterial({ map: brickTex('#b08d6a'), roughness: 0.95 }), x, h / 2, ZB);
    // gable roof: two sloped slabs meeting at a ridge running along x
    box(w + 0.7, 0.12, 3.6, shingleMat, x, h + 0.75, ZB + 0.35, 0.42);
    box(w + 0.7, 0.12, 3.6, shingleMat, x, h + 0.75, ZB - 1.05, -0.42);
    box(w + 0.7, 0.35, 0.30, std('#8a6f52', 0.9), x, h + 1.52, ZB - 0.35);   // ridge cap
    box(w - 1.4, 1.15, 0.10, winMat, x, h * 0.55, front - 0.03);             // big windows
    box(1.2, 2.1, 0.12, std('#4a2c20', 0.8), x - w / 2 + 1.4, 1.05, front - 0.04); // wood door
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.62),
      new THREE.MeshBasicMaterial({ map: signTexture('PIZZA', { accent: '#e0a44a', bg: '#20140c' }), toneMapped: false }));
    s.position.set(x, h * 0.85 + 0.35, front - 0.07); s.rotation.y = Math.PI; g.add(s);
    // roof sign pole
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), poleMat);
    pole.position.set(x + w / 2 - 1.0, h + 1.9, front + 0.4); g.add(pole);
    box(1.5, 0.8, 0.10, std('#20140c', 0.8), x + w / 2 - 1.0, h + 2.6, front + 0.4);
    const ps = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7),
      new THREE.MeshBasicMaterial({ map: signTexture('PIZZA', { accent: '#e0a44a', bg: '#20140c' }), toneMapped: false }));
    ps.position.set(x + w / 2 - 1.0, h + 2.6, front + 0.36); ps.rotation.y = Math.PI; g.add(ps);
  }

  // strip shops — three connected storefronts, stepped parapets, awnings
  {
    const d = 5.8, front = ZB - d / 2;
    const stripMat = new THREE.MeshStandardMaterial({ map: brickTex('#c1a98a'), roughness: 0.95 });
    const units = [
      { x: -2.6, w: 8.6, h: 3.9, sign: 'MARKET', ac: '#7fd0a0' },
      { x: 4.6, w: 6.4, h: 4.4, sign: 'PHARMACY', ac: '#7fb2e5' },
      { x: 10.4, w: 5.4, h: 3.6, sign: 'HAIR', ac: '#e58fd0' }
    ];
    for (const u of units) {
      box(u.w, u.h, d, stripMat, u.x, u.h / 2, ZB);
      box(u.w + 0.25, 0.30, d + 0.25, std('#9c8666', 0.9), u.x, u.h + 0.08, ZB);       // parapet cap
      box(u.w - 1.2, 1.25, 0.10, winMat, u.x, u.h * 0.45, front - 0.03);              // storefront glass
      box(u.w - 1.4, 0.10, 1.15, std('#7a3f3f', 0.85), u.x, 1.75, front - 0.62, 0.30); // awning
      const s = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(2.7, u.w - 2), 0.58),
        new THREE.MeshBasicMaterial({ map: signTexture(u.sign, { accent: u.ac, bg: '#101623' }), toneMapped: false }));
      s.position.set(u.x, u.h - 0.55, front - 0.06); s.rotation.y = Math.PI; g.add(s);
    }
  }

  // gas station on the corner — canopy, pumps, tall price sign
  {
    const x = 16.8, front = ZB - 2.6;
    box(6.5, 3.0, 4.6, new THREE.MeshStandardMaterial({ map: sidingTex('#d9d2c0'), roughness: 0.9 }), x, 1.5, ZB + 0.4);
    box(6.9, 0.28, 5.0, std('#a43535', 0.8), x, 3.1, ZB + 0.4);                        // red trim band
    box(8.2, 0.18, 6.4, std('#e8e6e0', 0.7), x + 0.4, 4.5, front + 1.8);               // canopy
    for (const [cx, cz] of [[x - 2.6, front + 1.8], [x + 3.4, front + 1.8]]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 10), std('#b9bcc2', 0.4, 0.6));
      col.position.set(cx, 2.2, cz); g.add(col);
    }
    for (const px of [x - 0.7, x + 1.5]) box(0.7, 1.1, 0.5, std('#c33', 0.6), px, 0.58, front + 1.8);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.10, 7.2, 10), poleMat);
    pole.position.set(x - 4.6, 3.6, front + 0.6); g.add(pole);
    box(1.7, 1.15, 0.12, std('#f2f0e8', 0.8), x - 4.6, 6.9, front + 0.6);
    const pr = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.0),
      new THREE.MeshBasicMaterial({ map: signTexture('GAS 1.29', { accent: '#c33', bg: '#f2f0e8' }), toneMapped: false }));
    pr.position.set(x - 4.6, 6.9, front + 0.53); pr.rotation.y = Math.PI; g.add(pr);
  }

  // houses in the distance (fill the gaps) — siding + gables
  const houseMat = new THREE.MeshStandardMaterial({ map: sidingTex('#cfd3c8'), roughness: 0.9 });
  for (const [hx, hz, hw] of [[-19.5, D + 24.5, 6.5], [-26, D + 25.5, 7.5], [24.5, D + 24.8, 6.8]]) {
    box(hw, 2.6, 5.2, houseMat, hx, 1.3, hz);
    box(hw + 0.6, 0.12, 3.9, shingleMat, hx, 3.35, hz + 0.5, 0.5);
    box(hw + 0.6, 0.12, 3.9, shingleMat, hx, 3.35, hz - 0.5, -0.5);
    box(0.9, 1.9, 0.1, std('#5b3a2e', 0.85), hx, 0.95, hz - 2.65);
  }

  // ══ TREES ══
  const trunkMat = std('#6b4f37', 0.95);
  const leafMat = std('#3f6d3a', 0.95);
  const tree = (x, z, s) => {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 1.6 * s, 8), trunkMat);
    tr.position.set(x, 0.8 * s, z); g.add(tr);
    for (const [ox, oy, r] of [[0, 2.1, 0.85], [0.45, 1.75, 0.6], [-0.4, 1.85, 0.55]]) {
      const lf = new THREE.Mesh(new THREE.SphereGeometry(r * s, 10, 8), leafMat);
      lf.position.set(x + ox * s, oy * s, z); g.add(lf);
    }
  };
  tree(-8.8, D + 4.1, 1.15); tree(14.8, D + 4.6, 0.95); tree(-16.4, D + 21.4, 1.3);
  tree(-6.8, D + 21.2, 1.1); tree(20.6, D + 21.0, 1.2); tree(7.6, D + 20.9, 0.9);

  // ══ UTILITY POLES + SAGGING WIRES (nothing says Wisconsin like these) ══
  const wireMat = new THREE.LineBasicMaterial({ color: '#2a2c30' });
  for (let i = -2; i <= 2; i++) {
    const px = i * 13.0, pz = D + 20.55;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 7.4, 8), std('#5f5346', 0.95));
    pole.position.set(px, 3.7, pz); g.add(pole);
    box(1.5, 0.10, 0.10, std('#5f5346', 0.95), px, 6.9, pz);
    if (i < 2) {
      for (const wy of [6.75, 6.95]) {
        const pts = [];
        for (let t = 0; t <= 10; t++) {
          const xx = px + t * 1.3;
          pts.push(new THREE.Vector3(xx, wy - Math.sin((t / 10) * Math.PI) * 0.55, pz));
        }
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
      }
    }
  }

  // ══ GROUND BEYOND + TREELINE + SKY ══
  box(110, 0.04, 26, std('#4e6b46', 0.98), 0, 0.02, D + 36);
  const tl = new THREE.Mesh(new THREE.PlaneGeometry(110, 5),
    new THREE.MeshBasicMaterial({ map: treeLineTex(), transparent: true, fog: false, toneMapped: false }));
  tl.position.set(0, 2.5, D + 40); g.add(tl);

  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 64; skyCanvas.height = 256;
  const sc = skyCanvas.getContext('2d');
  const grad = sc.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#4f8ec7'); grad.addColorStop(0.45, '#8fbde4'); grad.addColorStop(0.78, '#d8d2ac'); grad.addColorStop(1, '#e8cfa0');
  sc.fillStyle = grad; sc.fillRect(0, 0, 64, 256);
  const sun = sc.createRadialGradient(46, 168, 3, 46, 168, 46);
  sun.addColorStop(0, 'rgba(255,244,214,1)'); sun.addColorStop(1, 'rgba(255,244,214,0)');
  sc.fillStyle = sun; sc.fillRect(0, 120, 64, 100);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(120, 34),
    new THREE.MeshBasicMaterial({ map: skyTex, fog: false, toneMapped: false }));
  sky.position.set(0, 10, D + 44);
  g.add(sky);

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 256; cloudCanvas.height = 128;
  const cc = cloudCanvas.getContext('2d');
  for (const [cx, cy, r] of [[70, 70, 34], [120, 58, 44], [175, 72, 32], [110, 84, 26]]) {
    const rg = cc.createRadialGradient(cx, cy, 4, cx, cy, r);
    rg.addColorStop(0, 'rgba(255,250,240,0.95)'); rg.addColorStop(1, 'rgba(255,250,240,0)');
    cc.fillStyle = rg; cc.beginPath(); cc.arc(cx, cy, r, 0, Math.PI * 2); cc.fill();
  }
  const cloudTex = new THREE.CanvasTexture(cloudCanvas);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, fog: false, toneMapped: false, depthWrite: false });
  for (const [cx, cy, cz, sx] of [[-14, 11, D + 38, 10], [8, 12, D + 40, 13], [-2, 9.4, D + 36, 8]]) {
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(sx, sx * 0.4), cloudMat);
    cl.position.set(cx, cy, cz); g.add(cl);
  }
  return g;
}
