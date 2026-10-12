// ─────────────────────────────────────────────────────────────────────────────
//  store3d/gamer.js — THE GAMER DEN (t170)
//  A small RGB-lit battle station LEFT of the store, reached through the
//  extended front hall (its door is in this room's +z wall). Three monitors:
//   · LEFT   — the DISCORD portal (t173): a live client preview on the
//              canvas — server rail, channels, who's online. Clicking opens
//              the portal (the project's server + one-click into your OWN
//              DMs/servers). Bug reports stay on the store's help-desk PC.
//   · CENTER — the music station: YouTube search + play (t172; t182c:
//              YouTube ONLY — Spotify is gone entirely, the owner's call)
//   · RIGHT  — the Steam library (t171/t172), previewed live on the screen
//  The tower is the star: tempered glass, three hue-cycling intake fans, a
//  glowing water block, coolant tubes + reservoir, top radiator. Everything
//  RGB is driven from ONE clock so the room breathes as a single palette.
//  t172: every monitor is CLICKABLE (chat big · YouTube search+play that
//  projects ON the center monitor · Steam libraries incl. shared ones), the
//  GAME ROOM sign lives OUTSIDE over the door, the doorway got a neon RGB
//  pocket door, and the store-side wall is doubled (the store's exterior
//  brick veneer used to float 3cm inside the room).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT } from './config.js?v=1791847308316';
// t180: no YT iframe API here anymore — the den plays through the media panel
// (ui.js). The theater keeps its own createYtPlayer.

export function buildGamer(theme) {
  const L = LAYOUT, G = L.gamer, T = L.room.wallThickness;
  const H = G.h;
  // inner space: x −12.845…−6.345 (right edge = the store's left wall), z 0.845…6.345
  const gx1 = -(L.room.w / 2 + T), gx0 = gx1 - G.w;
  const gz1 = L.room.l / 2 + T, gz0 = gz1 - G.l;
  const cx = (gx0 + gx1) / 2, cz = (gz0 + gz1) / 2;
  const group = new THREE.Group();

  const occluders = [], colliders = [];
  const wall = (w, h, d, x, y, z, mat = wallMat) => {   // t170 FIX: default the mat — bare calls were rendering Three's DEFAULT WHITE
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m2.position.set(x, y, z); group.add(m2); occluders.push(m2); return m2;
  };
  // the den is DARK by design (RGB needs night to pop) — only the desk + sign
  // accents follow the store theme
  const wallMat = new THREE.MeshStandardMaterial({ color: '#101322', roughness: 0.92 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#181c2e', roughness: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: '#8b93a8', roughness: 0.3, metalness: 0.8 });
  const floorMat = new THREE.MeshStandardMaterial({ color: '#0c0e18', roughness: 0.97 });   // dark carpet
  const deskMat = new THREE.MeshStandardMaterial({ color: theme.shelf, roughness: 0.45, metalness: 0.1 });

  // ── shell: floor + ceiling + three walls (the +x side IS the store's wall) ──
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(G.w, G.l), floorMat);
    f.rotation.x = -Math.PI / 2; f.position.set(cx, 0, cz); group.add(f);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(G.w, G.l), trimMat);
    c.rotation.x = Math.PI / 2; c.position.set(cx, H, cz); group.add(c); }
  wall(T, H, G.l + 2 * T, gx0 - T / 2, H / 2, cz);                 // −x: outer wall
  wall(T, H, G.l + 2 * T, gx1 - T / 2, H / 2, cz);                 // t172: +x: the den's OWN wall — DOUBLES the shared wall (the store's exterior brick veneer plane sat 3cm inside the room; now it's buried in solid wall)
  wall(G.w + 2 * T, H, T, cx, H / 2, gz0 - T / 2);                 // −z: back wall
  // +z front wall — spans to the store's front wall so the corner closes;
  // the DOOR opening sits at room center (cased below like the dance door)
  const DX = cx, DW = G.door.width, DH = G.door.height;
  { const fw = gx0 - T / 2, fe = -(L.room.w / 2), span = fe - fw;   // −12.97 … −6.095
    const segL = (DX - DW / 2) - fw, segR = fe - (DX + DW / 2);
    wall(segL, H, T, fw + segL / 2, H / 2, gz1 + T / 2);
    wall(segR, H, T, DX + DW / 2 + segR / 2, H / 2, gz1 + T / 2);
    wall(DW, H - DH, T, DX, DH + (H - DH) / 2, gz1 + T / 2); }
  wall(T, H, T, gx1 + T / 2, H / 2, gz1 + T / 2);                  // corner post (closes the store-wall joint)
  // door casing (the hall-side trim — same recipe as the dance door)
  const caseMat = new THREE.MeshStandardMaterial({ color: '#171122', roughness: 0.5, metalness: 0.25 });
  for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.26, DH + 0.12, T + 0.1), caseMat);
    post.position.set(DX + sz * (DW / 2 + 0.13), (DH + 0.12) / 2, gz1 + T / 2); group.add(post); occluders.push(post);
  }
  const hdr = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.52, 0.12, T + 0.1), caseMat);
  hdr.position.set(DX, DH + 0.12, gz1 + T / 2); group.add(hdr); occluders.push(hdr);

  // ═══ RGB ENGINE — one clock drives every emissive + light in the room ═══
  const rgbMats = [];                                              // hue-cycled materials
  const ledMat = () => { const m2 = new THREE.MeshStandardMaterial({ color: '#0a0a12', emissive: '#ff0044', emissiveIntensity: 2.6, roughness: 0.4 }); rgbMats.push(m2); return m2; };   // t186: 2.2→2.6 — the owner's "stronger lighting effect"
  const strip = (w, h, d, x, y, z) => { const m2 = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ledMat()); m2.position.set(x, y, z); group.add(m2); return m2; };
  // t173 (owner: "the rgb strips should go all the way around the room"):
  // a full crown LOOP + a floor-skirting LOOP. The old store-side strip sat
  // at gx1−0.05 — INSIDE the t172 doubled wall, invisible (hence "only 2
  // walls"); it now clears the wall's inner face. The front wall's skirting
  // breaks at the doorway; its crown runs straight over the door.
  const xIn = gx0 + 0.05, xOut = gx1 - 0.30;        // strip insets off each wall face (xOut clears the doubled wall, inner face −6.595)
  strip(0.02, 0.02, G.l - 0.6, xIn, H - 0.09, cz);                  // crown — outer wall
  strip(xOut - xIn, 0.02, 0.02, (xIn + xOut) / 2, H - 0.09, gz0 + 0.05);   // crown — back wall
  strip(0.02, 0.02, G.l - 0.6, xOut, H - 0.09, cz);                 // crown — store wall (clears the doubled wall)
  strip(xOut - xIn, 0.02, 0.02, (xIn + xOut) / 2, H - 0.09, gz1 - 0.05);   // crown — front wall, over the door
  strip(0.02, 0.02, G.l - 0.9, xIn, 0.035, cz);                     // skirting — outer wall
  strip(xOut - xIn, 0.02, 0.02, (xIn + xOut) / 2, 0.035, gz0 + 0.05);      // skirting — back wall
  strip(0.02, 0.02, G.l - 0.9, xOut, 0.035, cz);                    // skirting — store wall
  { const e = 0.06;                                                  // skirting — front wall, flanking the door
    const lL = (DX - DW / 2 - e) - xIn, lR = xOut - (DX + DW / 2 + e);
    if (lL > 0.1) strip(lL, 0.02, 0.02, xIn + lL / 2, 0.035, gz1 - 0.05);
    if (lR > 0.1) strip(lR, 0.02, 0.02, xOut - lR / 2, 0.035, gz1 - 0.05); }

  // ═══ t189: THE ANGEL-DEMON SET — redesigned from the reference PHOTOS ═══
  // (t185b: store-shared wall. t186–t188: three rebuilds derived from the
  // STL PRINT LAYOUT — the owner rejected all three, and the photos explain
  // why: the flat-pack fan is NOT the assembled sign. The photos show two
  // TALL hanging feathered wings with an open photo-backdrop gap between
  // them, a detached OVAL RING halo above the gap, and horns + a curved
  // demon tail below — narrow neon TUBE outlines, dark open interiors.
  // This is an ORIGINAL curve-built interpretation of that visual language
  // (the Cults set is a paid personal-use REFERENCE only — no STLs, no
  // extracted geometry, no "SORRY MOM" lettering). Every part rides the
  // room's one RGB clock (ledMat → rgbMats), steady-lights safe, no lights
  // per feather — glow stays the den's existing emissive recipe.)
  { const angel = new THREE.Group(); angel.name = 'angelNeon';
    const STORE_FACE = gx1 - T;                    // the doubled store wall's den-side face
    angel.position.set(STORE_FACE, 0, cz);         // origin at the FLOOR — local v IS world height
    angel.rotation.y = -Math.PI / 2;               // local +x → world +z (viewer's right); local +z faces the den
    group.add(angel);
    const wingMat = ledMat(), haloMat = ledMat(), hornMat = ledMat(), tailMat = ledMat();
    const TUBE = 0.014;                            // the one neon tube gauge — narrow, consistent
    // tube(segs, r, zProud, mat, name, t0, t1): a chain of cubic Béziers in
    // the sign plane, swept as a round tube. segs[0] = start [x,y]; each
    // following = [c1x,c1y,c2x,c2y,x,y]. t0→t1 tapers the radius along the
    // length (horns, tail tip). A path whose last point equals its first
    // renders as a closed loop (the wing outlines).
    const V3 = (x, y) => new THREE.Vector3(x, y, 0);
    const tube = (segs, r, zProud, mat, name, t0 = 1, t1 = 1) => {
      const path = new THREE.CurvePath();
      let cur = V3(segs[0][0], segs[0][1]);
      for (let i = 1; i < segs.length; i++) {
        const s = segs[i], nx = V3(s[4], s[5]);
        path.add(new THREE.CubicBezierCurve3(cur, V3(s[0], s[1]), V3(s[2], s[3]), nx));
        cur = nx;
      }
      const geo = new THREE.TubeGeometry(path, Math.max(64, segs.length * 16), r, 8, false);
      if (t0 !== 1 || t1 !== 1) {                  // taper: pull each ring toward its own center
        const pos = geo.attributes.position, rs = geo.parameters.radialSegments + 1;
        const C = new THREE.Vector3(), T2 = new THREE.Vector3();
        for (let i = 0; i <= geo.parameters.tubularSegments; i++) {
          const f = t0 + (t1 - t0) * (i / geo.parameters.tubularSegments);
          C.set(0, 0, 0);
          for (let j = 0; j < rs; j++) C.add(T2.fromBufferAttribute(pos, i * rs + j));
          C.divideScalar(rs);
          for (let j = 0; j < rs; j++) { const k = i * rs + j;
            T2.fromBufferAttribute(pos, k).sub(C).multiplyScalar(f).add(C); pos.setXYZ(k, T2.x, T2.y, T2.z); }
        }
        pos.needsUpdate = true; geo.computeVertexNormals();
      }
      geo.translate(0, 0, zProud);                 // proud of the wall, into the den
      const m = new THREE.Mesh(geo, mat); m.name = name; return m;
    };
    const mir = (segs) => segs.map((s, i) =>      // mirror across the gap (u → −u) — real coordinate flip, no scale hack
      i === 0 ? [-s[0], s[1]] : [-s[0], s[1], -s[2], s[3], -s[4], s[5]]);
    // ── the WINGS: two tall hanging feather outlines, each ~2.4 × 1.2 m
    // (2:1). One closed Bézier loop per wing — rounded shoulder dome,
    // flared outer edge, three scalloped feather tips (the longest at the
    // bottom-center), gently curved inner edge facing the open gap — plus
    // three selective interior feather lines. Nothing converges on a root.
    // t190 (owner): the interior feather lines are the user-height anchor.
    // t193 (owner, again): the outline/horns/halo/tail ride lower STILL —
    // the wing top now sits just above the topmost interior line (0.15 m),
    // the whole sign pulled down to user height. Solved in fit math at
    // DROP 0.52: every line clears the outline by ≥ 0.09 m. ──
    const DROP = 0.52;
    const WING_OUTLINE = [
      [0.34, 3.26],                                                                // A: inner shoulder (the gap's edge, top)
      [0.58, 3.40, 0.84, 3.44, 1.04, 3.30],                                        // the rounded shoulder dome
      [1.30, 3.26, 1.55, 2.60, 1.52, 1.98],                                        // outer edge — flare out, sweep down
      [1.49, 1.72, 1.48, 1.52, 1.40, 1.38],                                        // ↓ feather tip 1 (outer)
      [1.28, 1.44, 1.18, 1.58, 1.14, 1.76],                                        // ↑ notch 1 (the cusp between feathers)
      [1.06, 1.54, 1.04, 1.24, 1.02, 1.00],                                        // ↓ feather tip 2 — the LONGEST, bottom-center
      [0.96, 1.22, 0.84, 1.34, 0.76, 1.46],                                        // ↑ notch 2
      [0.66, 1.44, 0.58, 1.28, 0.56, 1.12],                                        // ↓ feather tip 3 (inner)
      [0.44, 1.86, 0.40, 2.66, 0.34, 3.26],                                        // inner edge — gentle curve, back up to A
    ];
    const WING_LINES = [                                                           // interior feather lines — layered, readable, few
      [[0.52, 2.72], [0.72, 2.44, 1.02, 2.30, 1.30, 2.28]],
      [[0.48, 2.18], [0.70, 1.94, 1.04, 1.80, 1.36, 1.82]],
      [[0.54, 1.66], [0.72, 1.55, 0.86, 1.50, 1.02, 1.42]],                       // t190: reshaped — clears tip2's valley AND the inner edge
    ];
    for (const sx of [1, -1]) {
      const wing = new THREE.Group(); wing.name = sx > 0 ? 'angelWingR' : 'angelWingL';
      const om = tube(sx > 0 ? WING_OUTLINE : mir(WING_OUTLINE), TUBE, 0.028, wingMat, 'angelWingOutline');
      om.position.y = -DROP;                                                       // t190: outline rides DROP low — the lines anchor user height
      wing.add(om);
      WING_LINES.forEach(L => wing.add(tube(sx > 0 ? L : mir(L), TUBE * 0.85, 0.024, wingMat, 'angelFeatherLine')));
      angel.add(wing);
    }
    // ── the HALO: a real CLOSED ring — a horizontal ellipse (0.60 × 0.34 m)
    // centered on the gap, detached above the wing shoulders. A torus, not a
    // sweep: hollow, wider than tall, unmistakably a halo. (t190: rides DROP
    // with the outline — the lines anchor the height.) ──
    { const halo = new THREE.Mesh(new THREE.TorusGeometry(0.30, TUBE, 10, 44), haloMat);
      halo.name = 'angelHalo'; halo.scale.y = 0.17 / 0.30;         // circle → gentle oval
      halo.position.set(0, 3.70 - DROP, 0.034); angel.add(halo); }
    // ── the HORNS: two tapered curved strokes above the wing shoulders,
    // outside the halo's footprint, curving up-and-out — the demon half. ──
    const HORN = [[0.60, 3.46], [0.62, 3.70, 0.82, 3.83, 0.99, 3.80]];
    for (const sx of [1, -1]) {
      const hm = tube(sx > 0 ? HORN : mir(HORN), TUBE, 0.034, hornMat, sx > 0 ? 'angelHornR' : 'angelHornL', 1.6, 0.25);
      hm.position.y = -DROP; angel.add(hm);
    }
    // ── the TAIL: a slender S-stroke curling in the gap below the wing
    // tips, tapering to a point, flanked by two barbs — the arrow tip. ──
    { const tail = new THREE.Group(); tail.name = 'angelTail';
      const ts = tube([[0.14, 1.72], [0.02, 1.60, -0.18, 1.46, -0.14, 1.32],
                     [-0.10, 1.16, 0.02, 1.10, 0.04, 0.98], [0.06, 0.92, 0.00, 0.88, -0.02, 0.82]],
        TUBE, 0.030, tailMat, 'angelTailStroke', 1.0, 0.25);
      ts.position.y = -DROP; tail.add(ts);
      const b1 = tube([[0.00, 0.96], [-0.07, 0.99, -0.13, 1.02, -0.16, 1.04]], TUBE * 0.62, 0.030, tailMat, 'angelTailTip');
      const b2 = tube([[0.02, 0.96], [0.08, 0.99, 0.12, 1.01, 0.15, 1.02]], TUBE * 0.62, 0.030, tailMat, 'angelTailTip');
      b1.position.y = -DROP; b2.position.y = -DROP; tail.add(b1); tail.add(b2);
      angel.add(tail); }
    // ── bounds + test metadata — MEASURED from the built geometry ──
    { // t190: line↔outline clearance + core centering, computed from the same
      // Bézier specs the tubes were built from (mirrored wings are symmetric)
      const sampBez = (p0, s, t) => { const u = 1 - t;
        return [u*u*u*p0[0] + 3*u*u*t*s[0] + 3*u*t*t*s[2] + t*t*t*s[4],
                u*u*u*p0[1] + 3*u*u*t*s[1] + 3*u*t*t*s[3] + t*t*t*s[5]]; };
      const oSamp = [];
      for (let i = 1; i < WING_OUTLINE.length; i++) { const p0 = i === 1 ? [WING_OUTLINE[0][0], WING_OUTLINE[0][1]] : [WING_OUTLINE[i-1][4], WING_OUTLINE[i-1][5]];
        for (let k = 0; k <= 24; k++) oSamp.push(sampBez(p0, WING_OUTLINE[i], k / 24)); }
      let lineClear = Infinity, lTop = -Infinity, lBot = Infinity;
      for (const L of WING_LINES) for (let k = 0; k <= 24; k++) {
        const q = sampBez(L[0], L[1], k / 24);
        lTop = Math.max(lTop, q[1]); lBot = Math.min(lBot, q[1]);
        for (const o of oSamp) { const d = Math.hypot(q[0] - o[0], q[1] - (o[1] - DROP)); if (d < lineClear) lineClear = d; } }
      let wTop2 = -Infinity, wBot2 = Infinity;
      for (const o of oSamp) { wTop2 = Math.max(wTop2, o[1] - DROP); wBot2 = Math.min(wBot2, o[1] - DROP); }
      angel.userData.lineClear = +lineClear.toFixed(3);
      angel.userData.topAlign = +(wTop2 - lTop).toFixed(3);   // t193: wing top just above the topmost line
      const acc = (m, b) => { m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox.clone();
        bb.min.multiply(m.scale); bb.max.multiply(m.scale); bb.translate(m.position);
        b.union(bb); return bb; };
      const all = new THREE.Box3(), wings = [], haloB = new THREE.Box3(), hornsB = new THREE.Box3(), tailB = new THREE.Box3();
      let minProud = Infinity;
      angel.traverse(m => { if (m.isMesh) minProud = Math.min(minProud, acc(m, all).min.z); });
      for (const wn of ['angelWingR', 'angelWingL']) {
        const wb = new THREE.Box3();
        angel.getObjectByName(wn).children.forEach(c => acc(c, wb));
        wings.push({ w: +(wb.max.x - wb.min.x).toFixed(2), h: +(wb.max.y - wb.min.y).toFixed(2),
          aspect: +((wb.max.y - wb.min.y) / (wb.max.x - wb.min.x)).toFixed(2),
          inner: +(wn === 'angelWingR' ? wb.min.x : -wb.max.x).toFixed(2) });
      }
      acc(angel.getObjectByName('angelHalo'), haloB);
      ['angelHornR', 'angelHornL'].forEach(n => acc(angel.getObjectByName(n), hornsB));
      angel.getObjectByName('angelTail').children.forEach(c => acc(c, tailB));
      const wbAll = new THREE.Box3();
      ['angelWingR', 'angelWingL'].forEach(n => angel.getObjectByName(n).children.forEach(c => acc(c, wbAll)));
      angel.userData.span = { z: +(all.max.x - all.min.x).toFixed(2), y: +(all.max.y - all.min.y).toFixed(2) };
      angel.userData.wings = wings;
      angel.userData.gapHalf = +Math.min(wings[0].inner, wings[1].inner).toFixed(2);
      angel.userData.haloTop = +haloB.max.y.toFixed(2);
      angel.userData.hornsTop = +hornsB.max.y.toFixed(2);
      angel.userData.wingTop = +wbAll.max.y.toFixed(2);
      angel.userData.wingBottom = +wbAll.min.y.toFixed(2);
      angel.userData.tailBottom = +tailB.min.y.toFixed(2);
      angel.userData.minProud = +minProud.toFixed(3);
    }
  }

  // ═══ t186: THE OWNER'S LOGO — mounted on the wall behind the monitors,
  // dead-center above the CENTER screen, on the chair's sight axis. The
  // store's own mark, glow-lit. Loaded from the app's own /img — no
  // external calls.
  { const logoTex = new THREE.TextureLoader().load('/img/owner-logo.png');
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 4;
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15),
      new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, toneMapped: false }));
    logo.name = 'ownerLogo';
    // t186: centered the way it READS centered — dead-center above the
    // CENTER monitor (M2, z 3.75), straight ahead of the chair. (Wall-dead-
    // center z 3.595 sat 15 cm off the sitting axis and looked shifted; the
    // chair is the den's reference point.) Raised to y 2.30 — visually
    // centered in the clear wall between the monitor tops and the crown
    // strip instead of hugging the screens.
    logo.position.set(gx0 + 0.045, 2.30, 3.75); logo.rotation.y = Math.PI / 2;   // faces the room (+x)
    group.add(logo);
    const logoGlow = new THREE.PointLight(0x6fd3ff, 0.7, 2.0, 2);              // the glow that lifts it off the wall
    logoGlow.position.set(gx0 + 0.42, 2.3, 3.75); group.add(logoGlow);
  }

  // GAME ROOM neon sign over the door (inside face, faces −z)
  const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 160;
  const signTex = new THREE.CanvasTexture(signCanvas); signTex.colorSpace = THREE.SRGBColorSpace;
  function paintSign() {
    const g2 = signCanvas.getContext('2d');
    g2.fillStyle = '#0a0c16'; g2.fillRect(0, 0, 512, 160);
    g2.font = '700 74px system-ui, sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.shadowColor = '#ff2e88'; g2.shadowBlur = 26; g2.fillStyle = '#ff9ecf';
    g2.fillText('GAME ROOM', 256, 80);
    g2.shadowColor = '#31e6ff'; g2.shadowBlur = 18; g2.fillText('GAME ROOM', 256, 80);
    signTex.needsUpdate = true;
  }
  paintSign();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.72),
    new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }));
  // t172: OUTSIDE the door (the hall-side face of the front wall) — it was
  // inside the den, where nobody approaching the door could see it
  sign.position.set(cx, 3.45, gz1 + T + 0.01); sign.rotation.y = 0; group.add(sign);

  // ── lighting: one hue-cycled bias light + a soft room fill (perf budget) ──
  const biasLight = new THREE.PointLight(0xff2288, 1.6, 4.6, 2);
  biasLight.position.set(gx0 + 0.5, 1.7, 3.75); group.add(biasLight);
  const fillLight = new THREE.PointLight(0xbfd4ff, 0.45, 9, 2);
  fillLight.position.set(cx + 0.6, 3.4, cz); group.add(fillLight);
  const towerLight = new THREE.PointLight(0x31e6ff, 0.9, 2.6, 2);
  towerLight.position.set(gx0 + 0.75, 1.25, 5.32); group.add(towerLight);
  // t186: THE CROWN STRIP LIGHTS THE LOGO — IRL the LED strip above the
  // monitor wall washes everything under it in its color; now it does here
  // too. Rides the same hue clock as the strips (it IS the strip, glowing).
  const logoLight = new THREE.PointLight(0xff2288, 1.35, 3.4, 2);
  logoLight.position.set(gx0 + 0.38, 3.95, 3.75); group.add(logoLight);

  // ═══ t172: THE NEON DOOR — an RGB pocket door in the doorway ═══
  // Closed it fills the opening (neon-lit track above, neon edges on the
  // panel); walk up and it slides +x INTO the wall (a pocket door — nothing
  // sticks out into the hall or the room). One hue clock with the room.
  let doorPanel = null;
  {
    const DZ2 = gz1 + T / 2;                        // the wall's center plane
    const panelMat = new THREE.MeshStandardMaterial({ color: '#14161f', roughness: 0.4, metalness: 0.6 });
    const doorGlass = new THREE.MeshStandardMaterial({ color: '#9fd0ff', roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false });
    const rail = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.28, 0.09, 0.12), panelMat);
    rail.position.set(DX, DH + 0.05, DZ2); group.add(rail); occluders.push(rail);
    for (const sz of [-1, 1]) {                     // neon in the track, both faces
      const led = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.22, 0.018, 0.018), ledMat());
      led.position.set(DX, DH + 0.05, DZ2 + sz * 0.068); group.add(led);
    }
    const guide = new THREE.Mesh(new THREE.BoxGeometry(DW + 0.28, 0.05, 0.1), panelMat);
    guide.position.set(DX, 0.025, DZ2); group.add(guide);
    const dP = new THREE.Group(); dP.position.set(DX, 0, DZ2); group.add(dP); doorPanel = dP;
    const pw = DW - 0.06;
    for (const sx of [-1, 1]) {
      const stile = new THREE.Mesh(new THREE.BoxGeometry(0.07, DH - 0.06, 0.06), panelMat);
      stile.position.set(sx * (pw / 2 - 0.035), DH / 2, 0); dP.add(stile); occluders.push(stile);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, DH - 0.12, 0.025), ledMat());
      edge.position.set(sx * (pw / 2 - 0.004), DH / 2, 0); dP.add(edge);   // neon panel edges
    }
    const topB = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.07, 0.06), panelMat);
    topB.position.set(0, DH - 0.035, 0); dP.add(topB);
    const botB = topB.clone(); botB.position.y = 0.035; dP.add(botB);
    const glassP = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.14, DH - 0.16, 0.02), doorGlass);
    glassP.position.set(0, DH / 2, 0); dP.add(glassP); occluders.push(glassP);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 8, 22), ledMat());
    ring.position.set(-pw / 2 + 0.1, 1.05, 0.045); dP.add(ring);           // neon handle ring
  }
  let doorOpen = 0;

  // ═══ THE BATTLE STATION — desk along the outer (−x) wall ═══
  // t179: BUILT-IN — wall to wall across the room (the owner's call: the
  // legs "looked a bit off"; a full-width slab anchored into both walls
  // reads built-in). End panels close it into the walls, a modesty rail
  // along the outer wall carries the middle — no legs at all.
  const DESK = { x0: gx0 + 0.06, x1: gx0 + 0.80, z0: gz0 + 0.02, z1: gz1 - 0.02, top: 0.80 };
  { const top = new THREE.Mesh(new THREE.BoxGeometry(DESK.x1 - DESK.x0, 0.05, DESK.z1 - DESK.z0), deskMat);
    top.name = 'gamerDesk';
    top.position.set((DESK.x0 + DESK.x1) / 2, DESK.top - 0.025, (DESK.z0 + DESK.z1) / 2); group.add(top);
    const legMat = new THREE.MeshStandardMaterial({ color: '#20242f', roughness: 0.5, metalness: 0.6 });
    for (const ze of [DESK.z0 + 0.015, DESK.z1 - 0.015]) {      // end panels — into both walls
      const ep = new THREE.Mesh(new THREE.BoxGeometry(DESK.x1 - DESK.x0 - 0.04, DESK.top - 0.07, 0.03), legMat);
      ep.position.set((DESK.x0 + DESK.x1) / 2, (DESK.top - 0.07) / 2, ze); group.add(ep);
    }
    const mod = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, DESK.z1 - DESK.z0 - 0.12), legMat);   // modesty rail on the wall
    mod.position.set(DESK.x0 + 0.02, DESK.top - 0.14, (DESK.z0 + DESK.z1) / 2); group.add(mod);
    // RGB edge under the desk lip
    strip(0.015, 0.015, DESK.z1 - DESK.z0 - 0.06, (DESK.x0 + DESK.x1) / 2, DESK.top - 0.055, (DESK.z0 + DESK.z1) / 2);
    // cable tray
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, DESK.z1 - DESK.z0 - 0.3), legMat);
    tray.position.set((DESK.x0 + DESK.x1) / 2, DESK.top - 0.14, (DESK.z0 + DESK.z1) / 2); group.add(tray);
  }
  colliders.push({ minX: DESK.x0 - 0.04, maxX: DESK.x1 + 0.04, minZ: DESK.z0 - 0.05, maxZ: DESK.z1 + 0.05 });

  // ── monitor factory: bezel + screen + stand, facing `yaw` ──
  const bezelMat = new THREE.MeshStandardMaterial({ color: '#0d0f16', roughness: 0.35, metalness: 0.3 });
  const glassDark = new THREE.MeshStandardMaterial({ color: '#05060a', roughness: 0.08, metalness: 0.2 });
  const monitorTargets = [];                                        // t172: clickable — kind on every mesh
  function monitor(cz2, w, h, yaw, kind, cy = 1.26) {
    const mx = DESK.x0 + 0.18;   // t170b: BACK of the desk — at the front edge the keyboard ended up stranded BEHIND the screens
    const g2 = new THREE.Group(); g2.position.set(mx, cy, cz2); g2.rotation.y = yaw;
    const bez = new THREE.Mesh(new THREE.BoxGeometry(0.03, h + 0.035, w + 0.035), bezelMat); g2.add(bez);
    // t172 ROOT FIX: the screen plane ROTATES to face the room (+x local) —
    // it was unrotated, a fin crossing through the bezel ("the screen
    // crosses into the monitors")
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glassDark);
    scr.rotation.y = Math.PI / 2; scr.position.x = 0.017; g2.add(scr);
    for (const m3 of [bez, scr]) { m3.userData.monitorKind = kind; monitorTargets.push(m3); }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.05), metal); arm.position.set(-0.02, -0.33, 0); g2.add(arm);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.3), metal); foot.position.set(-0.02, -0.44, 0); g2.add(foot);
    group.add(g2);
    return { g: g2, center: new THREE.Vector3(mx, cy, cz2), yaw, mw: w, mh: h };
  }

  // THREE screens — Discord (left), music (center, ultrawide), Steam (right).
  // t170b FIX: yaw 0 = screen facing +x (INTO the room, toward the chair) —
  // the panel's width runs along the desk (z). The first cut used π/2±splay,
  // which turned every monitor 90°: the center panel stuck sideways through
  // the outer wall and crossed both neighbors. Splay angles turn the outer
  // screens toward the seated player (chair at z 3.75).
  const M1 = monitor(2.85, 0.62, 0.39, -0.42, 'gamerdiscord');       // t173: the Discord PORTAL (angled toward the chair) — t193: leftmost now (the VIZ monitor is gone, the owner's call)
  const M2 = monitor(3.75, 0.94, 0.40, 0, 'gamemusic', 1.28);        // music (dead on)
  const M3 = monitor(4.65, 0.62, 0.39, 0.42, 'gamesteam');           // Steam (angled toward the chair)

  // ═══ t185: THE DESK PERIPHERALS — placed like a real battle station ═══
  // (the owner's report: keyboard + mouse "looked off".) The old cut was a
  // slab with a glow sticker and a mouse-sized box floating at desk-left.
  // This cut: a compact 2-row keyboard with REAL keycaps that glow on the
  // room's RGB clock, a palm rest on the player's edge, and a mouse with a
  // split-button shell, thumb-side buttons and a spinning-look scroll wheel
  // — at the player's RIGHT hand, everything squared on a desk pad centered
  // under the middle screen. The player sits east of the desk facing −x, so
  // rows run along z and "right hand" is −z.
  { const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.55),
      new THREE.MeshStandardMaterial({ color: '#0d0f16', roughness: 0.95 }));
    pad.name = 'gamerPad';
    pad.rotation.x = -Math.PI / 2; pad.position.set(DESK.x0 + 0.55, DESK.top + 0.006, 3.40); group.add(pad);
    const kX = DESK.x0 + 0.55, kZ = 3.46;                    // keyboard center — under the M2 sight line
    const kbBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.11), bezelMat);
    kbBody.name = 'gamerKeyboard';
    kbBody.position.set(kX, DESK.top + 0.015, kZ); group.add(kbBody);
    const keyMat = ledMat();                                  // one RGB material — every keycap cycles with the room
    for (let row = 0; row < 2; row++)                         // two REAL key rows × 11 keycaps
      for (let k = 0; k < 11; k++) {
        const key = new THREE.Mesh(new THREE.BoxGeometry(0.0095, 0.007, 0.0095), keyMat);
        key.name = 'gamerKey';
        key.position.set(kX - 0.0625 + k * 0.0125, DESK.top + 0.028, kZ - 0.025 + row * 0.05);
        group.add(key);
      }
    const rest = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.14),   // palm rest — the player's edge
      new THREE.MeshStandardMaterial({ color: '#171a24', roughness: 0.85 }));
    rest.name = 'gamerPalmRest';
    rest.position.set(kX + 0.105, DESK.top + 0.012, kZ); group.add(rest);
    const mX = kX, mZ = 3.28;                                 // mouse — the player's RIGHT hand (−z)
    const mouse = new THREE.Group(); mouse.name = 'gamerMouse'; mouse.position.set(mX, DESK.top, mZ); group.add(mouse);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.024, 0.045), bezelMat);   // long axis = the forearm
    shell.position.y = 0.014; mouse.add(shell);
    for (const sz of [-1, 1]) {                               // split-button shell — two plates + the wheel slot between
      const btn = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.009, 0.017), bezelMat);
      btn.position.set(-0.022, 0.0265, sz * 0.0115); mouse.add(btn);
    }
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.013, 12),   // the scroll wheel, in the slot
      new THREE.MeshStandardMaterial({ color: '#2a2f3d', roughness: 0.35, metalness: 0.55 }));
    wheel.name = 'gamerWheel'; wheel.rotation.x = Math.PI / 2; wheel.position.set(-0.022, 0.028, 0); mouse.add(wheel);
    for (const sx of [-1, 1]) {                               // thumb-side buttons (+z flank)
      const sb = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.007, 0.005), bezelMat);
      sb.position.set(sx * 0.013, 0.023, 0.024); mouse.add(sb);
    } }

  // ═══ THE TOWER — Panorama XL build (owner spec, t178): RTX 5090 · Ryzen 9
  // 9950X3D · 64GB DDR5 · 2TB Gen4 · 360mm liquid · WiFi 7 · 3×DP/HDMI/RJ45 ·
  // Win 11 Pro · 3-yr warranty. On the desk, right end, dual-chamber showcase:
  // glass front + side, a 360mm AIO row across the top, a VERTICAL RTX-class
  // GPU behind the glass, 4 RGB DIMMs, coolant loop + reservoir, and the spec
  // plate across the bottom so the build introduces itself. ═══
  const spinners = [];                                              // rotating fan groups
  let towerGrp = null, satLPos = null, satRPos = null, subPos = null;
  { const TX = DESK.x0 + 0.28, TZ = 5.44, TB = DESK.top;            // t178: right end, clear of the new R speaker
    const TH = 0.56, TWd = 0.30, TD = 0.50;                         // full-tower proportions (h / width-z / depth-x)
    const tg = new THREE.Group(); tg.position.set(TX, TB + TH / 2, TZ); tg.name = 'pcTower'; group.add(tg); towerGrp = tg;
    const frameMat = new THREE.MeshStandardMaterial({ color: '#14161f', roughness: 0.4, metalness: 0.6 });
    // t179: NO solid body — that opaque box is exactly why the case read "a
    // boring black pc": the glass was a tinted sheet over a solid wall, so
    // none of the build showed. The showcase chamber is OPEN now — frame
    // panels top/bottom/back/wall-side + corner posts; the two glass faces
    // close it and every part inside (GPU, AIO, DIMMs, loop) is VISIBLE.
    const panel = (w, h, d, x, y, z) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat); p.position.set(x, y, z); tg.add(p); return p; };
    panel(TD - 0.026, 0.016, TWd - 0.026, 0, TH / 2 - 0.009, 0);            // top
    panel(TD - 0.026, 0.016, TWd - 0.026, 0, -TH / 2 + 0.009, 0);           // bottom
    panel(0.016, TH - 0.02, TWd - 0.02, -TD / 2 + 0.009, 0, 0);             // back panel (I/O side)
    panel(TD - 0.02, TH - 0.02, 0.014, 0, 0, -TWd / 2 + 0.008);             // wall-side panel
    // t185 FIX (the owner's report: posts overshoot the case top and bottom):
    // the posts were full-TH tall AND centered at ±(TH/2−0.012) — so each
    // pair spanned ±(TH−0.012), nearly half a meter proud of the frame at
    // BOTH ends. Now: one post per glass corner, seated flush between the
    // top and bottom frame panels.
    for (const sz of [-1, 1])
      panel(0.02, TH - 0.04, 0.02, TD / 2 - 0.012, 0, sz * (TWd / 2 - 0.012));   // corner posts the glass seats into
    const innerGlow = new THREE.PointLight(0xcfe2ff, 1.15, 1.05, 2);        // t179: light the build through the glass
    innerGlow.position.set(0.05, 0.10, 0.03); tg.add(innerGlow);
    // tempered glass front (+x, faces the room) + side (+z) — dark tint, depthWrite off (t90 recipe)
    const glass = new THREE.MeshStandardMaterial({ color: '#a8c8ff', roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.13, depthWrite: false });
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.012, TH - 0.03, TWd - 0.03), glass); front.name = 'towerGlass'; front.position.x = TD / 2 + 0.002; tg.add(front);
    const side = new THREE.Mesh(new THREE.BoxGeometry(TD - 0.03, TH - 0.03, 0.012), glass); side.name = 'towerGlassSide'; side.position.z = TWd / 2 + 0.002; tg.add(side);
    // dual-chamber spine — Panorama style: showcase chamber (glass side) + PSU/cable chamber (wall side)
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.016, TH - 0.05, TWd - 0.05), frameMat); spine.position.x = -TD / 2 + 0.17; tg.add(spine);
    // motherboard plate (showcase chamber, glass side)
    const mobo = new THREE.Mesh(new THREE.BoxGeometry(0.02, TH - 0.12, TWd - 0.10), new THREE.MeshStandardMaterial({ color: '#1b1030', roughness: 0.6 }));
    mobo.position.set(-TD / 2 + 0.21, 0.02, 0.0); tg.add(mobo);
    // ── 360mm AIO: three big RGB fans in a row across the top + radiator bar ──
    const rad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, TWd - 0.05), frameMat); rad.position.set(0.05, TH / 2 - 0.085, 0); tg.add(rad);
    for (let i = 0; i < 3; i++) {
      const fz = -0.092 + i * 0.092;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.040, 0.008, 8, 26), ledMat());
      ring.rotation.y = Math.PI / 2; ring.position.set(TD / 2 - 0.028, TH / 2 - 0.085, fz); tg.add(ring);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.016, 10),
        new THREE.MeshStandardMaterial({ color: '#20242f', roughness: 0.4, metalness: 0.6 }));
      hub.rotation.z = Math.PI / 2; hub.position.set(TD / 2 - 0.028, TH / 2 - 0.085, fz); tg.add(hub);
      const blades = new THREE.Group(); blades.position.set(TD / 2 - 0.028, TH / 2 - 0.085, fz); tg.add(blades);
      for (let b = 0; b < 5; b++) {
        const holder = new THREE.Group(); holder.rotation.x = b * (Math.PI * 2 / 5);
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.034, 0.011),
          new THREE.MeshStandardMaterial({ color: '#2c3145', roughness: 0.5 }));
        bl.rotation.x = 0.5; bl.position.set(0, 0.021, 0); holder.add(bl); blades.add(holder);
      }
      spinners.push(blades);
    }
    // ── the VERTICAL RTX-class GPU — three fan rings + a white "GEFORCE-style" edge ──
    const gpu = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.13), new THREE.MeshStandardMaterial({ color: '#232838', roughness: 0.4, metalness: 0.5 }));
    gpu.position.set(0.13, -0.06, -0.02); tg.add(gpu);
    for (let i = 0; i < 3; i++) {
      const gy = -0.06 + 0.085 - i * 0.085;
      const gr = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 22), ledMat());
      gr.rotation.y = Math.PI / 2; gr.position.set(0.158, gy - 0.045, -0.02); tg.add(gr);
      const gh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 10),
        new THREE.MeshStandardMaterial({ color: '#20242f', roughness: 0.4, metalness: 0.6 }));
      gh.rotation.z = Math.PI / 2; gh.position.set(0.158, gy - 0.045, -0.02); tg.add(gh);
      const gb = new THREE.Group(); gb.position.set(0.158, gy - 0.045, -0.02); tg.add(gb);
      for (let b = 0; b < 5; b++) {
        const holder = new THREE.Group(); holder.rotation.x = b * (Math.PI * 2 / 5);
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.020, 0.008),
          new THREE.MeshStandardMaterial({ color: '#2c3145', roughness: 0.5 }));
        bl.rotation.x = 0.5; bl.position.set(0, 0.013, 0); holder.add(bl); gb.add(holder);
      }
      spinners.push(gb);
    }
    const gpuLed = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.008, 0.126),
      new THREE.MeshStandardMaterial({ color: '#0a0a12', emissive: '#e8f4ff', emissiveIntensity: 1.6, roughness: 0.4 }));
    gpuLed.position.set(0.13, 0.075, -0.02); tg.add(gpuLed);      // the RTX 5090's white edge light
    // ── 4 RGB DDR5 DIMMs on the board ──
    for (let i = 0; i < 4; i++) {
      const stick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.055, 0.014),
        new THREE.MeshStandardMaterial({ color: '#171a24', roughness: 0.5, metalness: 0.3 }));
      stick.position.set(-TD / 2 + 0.225, 0.10, -0.052 + i * 0.034); tg.add(stick);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.008, 0.014), ledMat());
      cap.position.set(-TD / 2 + 0.225, 0.132, -0.052 + i * 0.034); tg.add(cap);
    }
    // ── CPU block (Ryzen 9) — glowing ring + coolant loop up to the radiator ──
    const block = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 20), new THREE.MeshStandardMaterial({ color: '#c8d8ff', roughness: 0.2, metalness: 0.7 }));
    block.rotation.z = Math.PI / 2; block.position.set(-TD / 2 + 0.235, 0.02, 0.052); tg.add(block);
    const blockRing = new THREE.Mesh(new THREE.TorusGeometry(0.030, 0.006, 8, 24), ledMat());
    blockRing.rotation.y = Math.PI / 2; blockRing.position.copy(block.position).x += 0.017; tg.add(blockRing);
    const tubeMat = new THREE.MeshStandardMaterial({ color: '#31e6ff', roughness: 0.15, transparent: true, opacity: 0.55, emissive: '#1899cc', emissiveIntensity: 0.5 });
    for (const [y0, y1, zz] of [[0.02, TH / 2 - 0.10, 0.052], [0.02, TH / 2 - 0.10, -0.010]]) {
      const len = Math.hypot(y1 - y0, 0.1);
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, len, 10), tubeMat);
      tube.position.set(-TD / 2 + 0.235 + 0.04, (y0 + y1) / 2, -0.0 + zz * 0.55);
      tube.rotation.z = Math.atan2(0.1, y1 - y0); tg.add(tube);
    }
    // reservoir with a rising bubble
    const resv = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.24, 14), tubeMat);
    resv.position.set(-TD / 2 + 0.225, -0.10, 0.088); tg.add(resv);
    const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.010, 8, 6),
      new THREE.MeshStandardMaterial({ color: '#eaffff', emissive: '#ffffff', emissiveIntensity: 0.8 }));
    bubble.position.copy(resv.position); tg.add(bubble);
    // ── rear I/O: 3× DP + HDMI + RJ45 (modeled on the wall side) + WiFi 7 antennas ──
    const ioPlate = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, TWd - 0.10), new THREE.MeshStandardMaterial({ color: '#2a2f3f', roughness: 0.5, metalness: 0.5 }));
    ioPlate.position.set(-TD / 2 - 0.004, TH / 2 - 0.13, 0.02); tg.add(ioPlate);
    const portMat = new THREE.MeshStandardMaterial({ color: '#0a0c14', roughness: 0.6 });
    for (let i = 0; i < 3; i++) {   // 3× DisplayPort
      const dp = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.016, 0.011), portMat);
      dp.position.set(-TD / 2 - 0.012, TH / 2 - 0.115, 0.02 - 0.052 + i * 0.030); tg.add(dp);
    }
    const hdmi = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.013, 0.020), portMat);   // HDMI (wider)
    hdmi.position.set(-TD / 2 - 0.012, TH / 2 - 0.115, 0.02 + 0.048); tg.add(hdmi);
    const rj45 = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.013, 0.014), new THREE.MeshStandardMaterial({ color: '#0a0c14', roughness: 0.6 }));
    rj45.position.set(-TD / 2 - 0.012, TH / 2 - 0.152, 0.055); tg.add(rj45);           // ethernet
    for (const sz of [-1, 1]) {     // WiFi 7 antenna pair
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 8),
        new THREE.MeshStandardMaterial({ color: '#20242f', roughness: 0.4, metalness: 0.6 }));
      ant.position.set(-TD / 2 - 0.01, TH / 2 + 0.05, 0.02 + sz * 0.075); ant.rotation.z = 0.35 * -sz; ant.rotation.x = 0.25 * sz; tg.add(ant);
    }
    // ── the spec plate — the build introduces itself across the bottom front ──
    const specCv = document.createElement('canvas'); specCv.width = 640; specCv.height = 72;
    const specTex = new THREE.CanvasTexture(specCv); specTex.colorSpace = THREE.SRGBColorSpace;
    { const g2 = specCv.getContext('2d');
      g2.fillStyle = '#0b0d16'; g2.fillRect(0, 0, 640, 72);
      g2.fillStyle = '#9fd8ff'; g2.font = '700 21px system-ui, sans-serif'; g2.textAlign = 'center';
      g2.fillText('RYZEN 9 9950X3D · RTX 5090 · 64GB DDR5', 320, 28);
      g2.fillStyle = '#6f7fa8'; g2.font = '600 17px system-ui, sans-serif';
      g2.fillText('2TB GEN4 · 360mm LC · WiFi 7 · 3×DP·HDMI·RJ45 · WIN 11 PRO · 3-YR', 320, 54);
      specTex.needsUpdate = true; }
    const spec = new THREE.Mesh(new THREE.PlaneGeometry(TWd - 0.05, 0.038),
      new THREE.MeshBasicMaterial({ map: specTex, toneMapped: false }));
    spec.rotation.y = Math.PI / 2; spec.position.set(TD / 2 + 0.008, -TH / 2 + 0.038, 0); tg.add(spec);
    colliders.push({ minX: TX - TD / 2 - 0.03, maxX: TX + TD / 2 + 0.03, minZ: TZ - TWd / 2 - 0.03, maxZ: TZ + TWd / 2 + 0.03 });
    tg.userData.bubble = bubble; tg.userData.bubbleBase = resv.position.y;
  }

  // ═══ t178: THE 2.1 RIG — game-room audio stays IN the game room ═══
  // L + R bookshelfs on the desk flanking the monitors, the sub on the floor.
  // The source is an iframe (no WebAudio tap), so the zone works by REMOTE
  // volume: the YouTube player takes setVolume commands (enablejsapi) —
  // 0 outside the den.
  function gamerSpeaker(z, name) {
    const x = DESK.x0 + 0.24;
    const g2 = new THREE.Group(); g2.position.set(x, DESK.top, z); g2.name = name; group.add(g2);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.26, 0.14),
      new THREE.MeshStandardMaterial({ color: '#171a24', roughness: 0.5, metalness: 0.2 })); cab.position.y = 0.13; g2.add(cab);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.030, 0.02, 18),
      new THREE.MeshStandardMaterial({ color: '#0a0c14', roughness: 0.8 })); cone.rotation.z = Math.PI / 2; cone.position.set(0.077, 0.09, 0); g2.add(cone);
    const tweet = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#c8d8ff', roughness: 0.3, metalness: 0.4 })); tweet.position.set(0.077, 0.205, 0); g2.add(tweet);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.005, 8, 22), ledMat());
    halo.rotation.y = Math.PI / 2; halo.position.set(0.077, 0.09, 0); g2.add(halo);
    colliders.push({ minX: x - 0.10, maxX: x + 0.10, minZ: z - 0.09, maxZ: z + 0.09 });
    return g2;
  }
  gamerSpeaker(1.30, 'gamerSatL');                                     // t185b: moved clear of the VIZ screen (was 2.18 — it stood in the seated sight line and hid the monitor's edge)
  gamerSpeaker(5.13, 'gamerSatR');                                     // between Steam monitor and the tower
  { // the subwoofer — floor, under the desk by the tower
    const x = DESK.x0 + 0.42, z = 5.30;
    const g2 = new THREE.Group(); g2.position.set(x, 0, z); g2.name = 'gamerSub'; group.add(g2);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34),
      new THREE.MeshStandardMaterial({ color: '#14161f', roughness: 0.6, metalness: 0.15 })); box.position.y = 0.17; g2.add(box);
    const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.088, 0.03, 24),
      new THREE.MeshStandardMaterial({ color: '#0a0c14', roughness: 0.85 })); driver.rotation.z = Math.PI / 2; driver.position.set(0.176, 0.17, 0); g2.add(driver);
    const port = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.16),
      new THREE.MeshStandardMaterial({ color: '#05060a', roughness: 0.9 })); port.position.set(0.172, 0.06, 0.09); g2.add(port);
    const subRing = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.006, 8, 26), ledMat());
    subRing.rotation.y = Math.PI / 2; subRing.position.set(0.178, 0.17, 0); g2.add(subRing);
    satLPos = new THREE.Vector3(DESK.x0 + 0.24, DESK.top + 0.13, 1.30);
    satRPos = new THREE.Vector3(DESK.x0 + 0.24, DESK.top + 0.13, 5.13);
    subPos = new THREE.Vector3(x, 0.17, z);
  }

  // ── the gaming chair ──
  { const chX = gx0 + 1.87, chZ = 3.75;   // t173: pulled back 35 cm — a comfy standing slot opens at the desk edge (was 0.37 m, chair collider in the way)

    const chairMat = new THREE.MeshStandardMaterial({ color: '#1c1f2b', roughness: 0.6, metalness: 0.1 });
    const accentMat = new THREE.MeshStandardMaterial({ color: '#0a0a12', emissive: '#ff2e88', emissiveIntensity: 1.2, roughness: 0.5 }); rgbMats.push(accentMat);
    const cg = new THREE.Group(); cg.position.set(chX, 0, chZ); cg.rotation.y = -Math.PI / 2; group.add(cg);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.09, 0.5), chairMat); seat.position.y = 0.52; cg.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.78, 0.09), chairMat); back.position.set(0, 0.95, -0.24); back.rotation.x = 0.14; cg.add(back);
    const lumbar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.045), accentMat); lumbar.position.set(0, 0.72, -0.19); cg.add(lumbar);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.09), chairMat); head.position.set(0, 1.42, -0.30); cg.add(head);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 10), metal); col.position.y = 0.28; cg.add(col);
    for (let i = 0; i < 5; i++) {
      const arm2 = new THREE.Group(); arm2.rotation.y = i * (Math.PI * 2 / 5); cg.add(arm2);
      const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.3), metal); leg2.position.set(0, 0.09, 0.14); arm2.add(leg2);
      const caster = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), metal); caster.position.set(0, 0.035, 0.28); arm2.add(caster);
    }
    colliders.push({ minX: chX - 0.35, maxX: chX + 0.35, minZ: chZ - 0.35, maxZ: chZ + 0.35 }); }

  // ═══ scratch vectors (the den's geometry + near checks reuse them) ═══
  const _wp = new THREE.Vector3(), _wv = new THREE.Vector3();

  // ═══ t180: THE MUSIC STATION — the panel era ═══
  // Two owner live-tests proved the in-page engine (the YouTube iframe)
  // would not speak on their machine — while the
  // Discord <webview> panel never missed a beat. So the den stops fighting
  // embeds: a pick opens the MEDIA PANEL (ui.js — a webview of the real site
  // in the app, the official embed iframe in a browser), and this monitor
  // becomes the now-playing screen + the click target: the Discord-monitor
  // pattern. The room keeps its controls — the remote's ⏯ and volume drive
  // the panel, and the 2.1 zone gates it: muted outside the den, full voice
  // inside. (The projected-overlay machinery and the SDK are gone with it.)
  let musicEngine = '';                    // '' | 'youtube'   (t182: Spotify is out of the den — the owner's call)
  let musicId = '', ytTitle = '';
  let musicGates = null;                   // tests: the den's live music state
  let npPaintedAt = 0;                     // the now-playing paint ran (tests)
  // ── t178: GAME-ROOM AUDIO ZONE — the den's sound stays in the den ──
  // 2.1 rig: desk L/R + floor sub (meshes above). The source is the media
  // panel now, so the zone works by REMOTE volume + setAudioMuted: the
  // panel's player takes volume commands, and outside the den it is muted
  // outright (the panel shows the 🔇 badge so it's never a mystery).
  let gVol = 0.85;
  try { const v = parseFloat(localStorage.getItem('hb_gamer_vol') || ''); if (v >= 0 && v <= 1) gVol = v; } catch {}
  let lastVolCmd = -1, lastInside = null, lastVolAssert = 0, lastZoneMuted = null;
  const ytCmdLog = [];
  function logCmd(func, args = []) {
    ytCmdLog.push({ func, args: args.slice(), t: Date.now() });
    if (ytCmdLog.length > 30) ytCmdLog.shift();
  }
  function sendVol(pct) { logCmd('setVolume', [pct]); window.__HBMedia?.cmd?.('volume', pct); }
  function applyGamerVolume(inside) {
    lastInside = !!inside;
    const M = window.__HBMedia;
    const active = !!(musicEngine && M?.state?.().service);
    if (!active) { lastVolCmd = -1; lastZoneMuted = null; return; }
    const pct = Math.round((lastInside ? gVol : 0) * 100);
    const now = performance.now();
    if (Math.abs(pct - lastVolCmd) >= 2) { sendVol(pct); lastVolCmd = pct; lastVolAssert = now; }
    else if (now - lastVolAssert > 2500) { sendVol(pct); lastVolCmd = pct; lastVolAssert = now; }   // re-assert — site controls and ads move it
    const zm = !lastInside;                                            // the guaranteed gate: silence outside the den
    if (zm !== lastZoneMuted) { logCmd('setAudioMuted', [zm]); M.setZoneMuted?.(zm); lastZoneMuted = zm; }
  }
  function gamerSetVolume(v) {
    gVol = Math.min(1, Math.max(0, +v || 0));
    try { localStorage.setItem('hb_gamer_vol', String(gVol)); } catch {}
    applyGamerVolume(lastInside !== null ? lastInside : true);
  }
  function gamerToggle() {
    const M = window.__HBMedia?.state?.();
    if (!M?.service) return gamerStats();
    const toPause = !M.paused;
    logCmd(toPause ? 'pauseVideo' : 'playVideo');
    window.__HBMedia?.cmd?.(toPause ? 'pause' : 'play');
    return gamerStats();
  }
  function gamerStats() {
    const M = window.__HBMedia?.state?.() || {};
    const active = !!(musicEngine && M.service);
    return { playing: active, paused: active && !!M.paused, volume: gVol, engine: musicEngine || '',
      panel: M.service ? { open: !!M.open, url: M.url } : null };
  }
  function gamerAudioInfo() {
    const M = window.__HBMedia?.state?.() || {};
    return { room: 'gamer', vol: gVol, inside: lastInside, panelVol: M.service ? M.vol : null, volCmd: lastVolCmd,
      paused: !!M.paused, spotErr: null, player: M.service ? 'media-panel' : (musicEngine || ''),
      cmds: ytCmdLog.slice(-6), sats: satLPos && satRPos ? [satLPos.toArray(), satRPos.toArray()] : null, sub: subPos ? subPos.toArray() : null };
  }
  function playMusic(id, title) {
    musicId = String(id || '');
    ytTitle = String(title || '');
    musicEngine = musicId ? 'youtube' : '';
    if (!musicId) { stopMusic(); return; }
    window.__HBMedia?.open?.({ service: 'youtube', id: musicId, title: ytTitle || 'YouTube', artist: '' });
  }
  // t194: the embed lane reports what's on WITHOUT (re)opening the panel —
  // the media panel discovered the title itself (the embed's document.title)
  function noteMusicNow(id, title) {
    musicId = String(id || ''); ytTitle = String(title || '');
    musicEngine = musicId ? 'youtube' : '';
  }
  function stopMusic() {
    musicId = ''; ytTitle = ''; musicEngine = '';
    lastVolCmd = -1; lastZoneMuted = null;
    window.__HBMedia?.stop?.();
  }
  function tickMusic(camera, player, sightBlocked) {
    let inside = false;
    try {
      const active = !!musicEngine;
      if (active && player)
        inside = player.x > gx0 - 0.25 && player.x < gx1 + 0.25 && player.z > gz0 - 0.25 && player.z < gz1 + 0.25;
      musicGates = { engine: musicEngine || null, playing: active, inside };
    } catch (e) { musicGates = { err: String(e).slice(0, 80) }; }
    applyGamerVolume(inside);                                       // t178: the 2.1 zone — silent outside the den
  }
  // ═══ t173: LIVE PREVIEW SCREENS — each canvas shows what its station DOES ═══
  // Discord (left) paints a mini client (rail · channels · who's online),
  // music (center) paints the YouTube station with its live connection state,
  // Steam (right) paints the library list (top games + hours when
  // linked). ui.js pushes fresh facts in via setPreviews() — on boot, every
  // 45 s in the den, and whenever a modal opens or a connection changes.
  // t173 SIZE FIX: each canvas fills ITS monitor's active area (mw−0.05 ×
  // mh−0.03) — the old 2:1 planes left a fat 10 cm gap either side of the
  // ultrawide center screen ("the screen doesn't fit the monitor").
  let previews = { discord: null, music: null, steam: null };
  function setPreviews(v) {
    try { previews = { discord: v?.discord || null, music: v?.music || null, steam: v?.steam || null }; }
    catch { previews = { discord: null, music: null, steam: null }; }
    canvasT = -1; canvasT2 = -1;                   // repaint both pairs on the next update pass
  }
  function setupScreen(mon, kind) {
    const cv = document.createElement('canvas');
    const pw = mon.mw - 0.05, ph = mon.mh - 0.03;
    cv.width = 640; cv.height = Math.max(150, Math.round(640 * ph / pw));
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    // t172 ROOT FIX kept: yaw + π/2 → the canvas faces the room; translateZ
    // then offsets along the (rotated) normal, just off the bezel face
    mesh.position.copy(mon.center); mesh.rotation.y = mon.yaw + Math.PI / 2;
    mesh.translateZ(0.019); group.add(mesh);
    mesh.userData.monitorKind = kind; monitorTargets.push(mesh);
    return { cv, tex, mesh, kind };
  }
  const discordScr = setupScreen(M1, 'gamerdiscord');
  const musicScr = setupScreen(M2, 'gamemusic');
  const steamScr = setupScreen(M3, 'gamesteam');

  // t193: the VIZ screen is GONE (the owner's call — it never worked
  // properly and sat half-hidden behind the chair). The music monitor's
  // own live-paint carries the den's motion now; this gate stays.
  const musicLive = () => !!(musicEngine || window.__HBMedia?.state?.().service);

  // ── M1: a Discord client, in miniature ──
  function paintDiscord(s, t2) {
    const g2 = s.cv.getContext('2d'), W = s.cv.width, H = s.cv.height;
    const rail = 54, chan = 172, mem = 132;
    const rowH = Math.round(H * 0.145);
    g2.fillStyle = '#1e1f22'; g2.fillRect(0, 0, rail, H);                 // server rail
    g2.fillStyle = '#2b2d31'; g2.fillRect(rail, 0, chan, H);              // channel column
    g2.fillStyle = '#313338'; g2.fillRect(rail + chan, 0, W - rail - chan, H);   // chat + members
    g2.fillStyle = '#232428'; g2.fillRect(rail + chan, 0, W - rail - chan, rowH);        // top bar
    g2.fillStyle = '#232428'; g2.fillRect(rail, 0, chan, rowH);
    // server icons — the project's server is the lit, squared one on top
    g2.fillStyle = '#5865f2'; g2.beginPath(); g2.roundRect(12, rowH + 10, 30, 30, 12); g2.fill();
    g2.fillStyle = '#fff'; g2.font = '700 15px system-ui, sans-serif'; g2.textAlign = 'center';
    g2.fillText('HB', 27, rowH + 30);
    const icons = ['#3ba55c', '#faa61a', '#ed4245', '#9b59b6'];
    for (let i = 0; i < icons.length; i++) {
      g2.fillStyle = icons[i]; g2.beginPath(); g2.arc(27, rowH + 62 + i * 44, 15, 0, Math.PI * 2); g2.fill();
    }
    // channels
    g2.textAlign = 'left'; g2.fillStyle = '#949ba4'; g2.font = '700 13px system-ui, sans-serif';
    g2.fillText('THE PROJECT', rail + 14, rowH + 24);
    const chans = [['#', 'general'], ['#', 'bug-reports'], ['#', 'suggestions'], ['#', 'show-your-den'], ['♪', 'radio']];
    chans.forEach((c, i) => {
      const y = rowH + 48 + i * 30;
      if (i === 1) { g2.fillStyle = 'rgba(88,101,242,.25)'; g2.beginPath(); g2.roundRect(rail + 8, y - 17, chan - 16, 26, 6); g2.fill(); }
      g2.fillStyle = i === 1 ? '#f2f3f5' : '#949ba4'; g2.font = '500 15px system-ui, sans-serif';
      g2.fillText(c[0] + ' ' + c[1], rail + 16, y);
    });
    // chat area — a friendly line + a typing shimmer
    g2.fillStyle = '#f2f3f5'; g2.font = '700 17px system-ui, sans-serif';
    g2.fillText('Welcome — the whole gang is here', rail + chan + 16, rowH + 30);
    g2.fillStyle = '#b5bac1'; g2.font = '400 14px system-ui, sans-serif';
    const names = (previews.discord?.onlineNames || []);
    g2.fillText(names.length ? names.slice(0, 2).join('  ·  ') + ' are chatting…' : 'sign in once to join the conversation', rail + chan + 16, rowH + 54);
    // members panel
    g2.fillStyle = '#949ba4'; g2.font = '700 12px system-ui, sans-serif';
    const online = previews.discord?.online ?? 0, members = previews.discord?.members ?? 0;
    g2.fillText(`ONLINE — ${online}`, W - mem + 12, rowH + 24);
    const dots = Math.max(3, Math.min(9, names.length || 6));
    for (let i = 0; i < dots; i++) {
      const y = rowH + 46 + i * 26;
      g2.fillStyle = '#23a55a'; g2.beginPath(); g2.arc(W - mem + 20, y - 5, 4.5, 0, Math.PI * 2); g2.fill();
      g2.fillStyle = '#dbdee1'; g2.font = '500 14px system-ui, sans-serif';
      g2.fillText(names[i] || ['gamer', 'cinematek', 'djprox', 'shelfworm', 'nightowl', 'retrofan', 'modem'][i % 7], W - mem + 32, y);
    }
    // header chip — who's online overall
    g2.fillStyle = '#23a55a'; g2.beginPath(); g2.arc(W - mem - 66, rowH / 2 + 5, 5, 0, Math.PI * 2); g2.fill();
    g2.fillStyle = '#dbdee1'; g2.font = '600 14px system-ui, sans-serif';
    g2.fillText(`${online} online · ${members} members`, W - mem - 54, rowH / 2 + 10);
    s.tex.needsUpdate = true;
  }

  // ── M2: the YouTube station ──
  function paintMusicScreen(s, t2) {
    const g2 = s.cv.getContext('2d'), W = s.cv.width, H = s.cv.height;
    // t180: while a pick is live this screen is the NOW-PLAYING card — the
    // playback itself runs in the media panel (the Discord-monitor pattern:
    // the screen says what's on, a click opens the player).
    if (musicEngine) {                    // t182: YouTube only — the Spotify half is gone with the den's Spotify
      g2.fillStyle = '#0d0508'; g2.fillRect(0, 0, W, H);
      g2.fillStyle = 'rgba(255,0,51,0.10)'; g2.fillRect(0, 0, W, H);
      g2.fillStyle = '#ff0033'; g2.beginPath(); g2.roundRect(W / 2 - 30, 20, 60, 42, 12); g2.fill();
      g2.fillStyle = '#fff'; g2.beginPath();
      g2.moveTo(W / 2 - 8, 30); g2.lineTo(W / 2 - 8, 52); g2.lineTo(W / 2 + 14, 41); g2.closePath(); g2.fill();
      g2.fillStyle = '#ffb3c0'; g2.font = '700 15px system-ui, sans-serif'; g2.textAlign = 'center';
      g2.fillText('NOW PLAYING — YOUTUBE', W / 2, 84);
      const title = String(ytTitle || musicId);
      g2.fillStyle = '#f2f3f5'; g2.font = '700 30px system-ui, sans-serif'; g2.textAlign = 'center';
      let y = 132, remain = title;
      for (let ln = 0; ln < 2 && remain; ln++) {                    // wrap to 2 lines, then truncate
        let cur = remain;
        while (cur && g2.measureText(cur).width > W - 60) cur = cur.slice(0, -1);
        if (!cur && remain) cur = remain.slice(0, 34);
        g2.fillText(cur, W / 2, y); y += 36;
        remain = remain.slice(cur.length).trim();
      }
      const eqH = Math.max(24, H - y - 64);
      const nBars = 36, bw = (W - 60) / nBars;
      for (let i = 0; i < nBars; i++) {
        const hgt = 8 + Math.abs(Math.sin(t2 * 2.4 + i * 0.42)) * eqH * 0.9;
        g2.fillStyle = `hsl(${(i * 8 + t2 * 36) % 360} 90% 62%)`;
        g2.fillRect(30 + i * bw, H - 36 - hgt, bw - 4, hgt);
      }
      g2.fillStyle = '#8ea0c0'; g2.font = '500 15px system-ui, sans-serif'; g2.textAlign = 'center';
      g2.fillText(lastInside === false ? '🔇 outside the den — walk back in for sound · click for the player' : 'click this screen for the player', W / 2, H - 12);
      npPaintedAt = t2;
      s.tex.needsUpdate = true;
      return;
    }
    const rowH = Math.round(H * 0.16);   // t182: the station is YOUTUBE ONLY — one centered face, no split
    g2.fillStyle = '#07080f'; g2.fillRect(0, 0, W, H);
    g2.fillStyle = '#c9d4ea'; g2.font = '700 22px system-ui, sans-serif'; g2.textAlign = 'left';
    g2.fillText('MUSIC', 16, rowH / 2 + 8);
    g2.fillStyle = '#8ea0c0'; g2.font = '400 14px system-ui, sans-serif';
    g2.fillText('click — YouTube opens right here', 88, rowH / 2 + 8);
    const cX = W / 2;
    g2.fillStyle = '#ff0033'; g2.beginPath(); g2.roundRect(cX - 34, rowH + 24, 68, 48, 12); g2.fill();
    g2.fillStyle = '#fff'; g2.beginPath();
    g2.moveTo(cX - 9, rowH + 36); g2.lineTo(cX - 9, rowH + 60); g2.lineTo(cX + 15, rowH + 48); g2.closePath(); g2.fill();
    g2.fillStyle = '#f2f3f5'; g2.font = '700 24px system-ui, sans-serif'; g2.textAlign = 'center';
    g2.fillText('YouTube', cX, rowH + 100);
    g2.fillStyle = '#23a55a'; g2.font = '500 15px system-ui, sans-serif';
    g2.fillText('✓ no key needed — click to browse', cX, rowH + 124);   // t186: keyless
    for (let i = 0; i < 30; i++) {                                     // the equalizer — full width now
      const bx = 24 + i * ((W - 48) / 30), hgt = 6 + Math.abs(Math.sin(t2 * 2.2 + i * 0.55)) * 34;
      g2.fillStyle = `hsl(${(i * 10 + t2 * 40) % 360} 90% 60%)`;
      g2.fillRect(bx, H - 26 - hgt, (W - 48) / 30 - 5, hgt);
    }
    s.tex.needsUpdate = true;
  }

  // ── M3: the Steam library, previewed ──
  function paintSteamScreen(s, t2) {
    const g2 = s.cv.getContext('2d'), W = s.cv.width, H = s.cv.height;
    const rowH = Math.round(H * 0.16);
    g2.fillStyle = '#07080f'; g2.fillRect(0, 0, W, H);
    g2.fillStyle = '#c9d4ea'; g2.font = '700 22px system-ui, sans-serif'; g2.textAlign = 'left';
    g2.fillText('STEAM', 16, rowH / 2 + 8);
    const st = previews.steam;
    g2.fillStyle = '#8ea0c0'; g2.font = '400 14px system-ui, sans-serif';
    g2.fillText(st?.set ? `${st.profile || 'your library'} — ${st.count || ''} games` : 'your library, live on this screen', 92, rowH / 2 + 8);
    const rows = st?.top || [];
    if (rows.length) {
      rows.slice(0, 5).forEach((r, i) => {
        const y = rowH + 14 + i * Math.round((H - rowH - 22) / 5);
        g2.fillStyle = `hsl(${(i * 47 + 212) % 360} 55% 46%)`;
        g2.beginPath(); g2.roundRect(16, y, 38, 26, 6); g2.fill();
        g2.fillStyle = '#e8eefc'; g2.font = '600 15px system-ui, sans-serif';
        g2.textAlign = 'left';
        let nm = String(r.name || ''); if (nm.length > 26) nm = nm.slice(0, 25) + '…';
        g2.fillText(nm, 64, y + 18);
        g2.fillStyle = '#8ea0c0'; g2.font = '400 13px system-ui, sans-serif'; g2.textAlign = 'right';
        g2.fillText(`${r.hours} h`, W - 14, y + 18);
      });
    } else {
      g2.fillStyle = '#ff2e88'; g2.shadowColor = '#ff2e88'; g2.shadowBlur = 16;
      g2.font = '700 30px system-ui, sans-serif'; g2.textAlign = 'left';
      g2.fillText('Link your Steam library', 22, rowH + 44);
      g2.shadowBlur = 0; g2.fillStyle = '#c9d4ea'; g2.font = '400 17px system-ui, sans-serif';
      g2.fillText('Menu → My Connections', 24, rowH + 74);
      g2.fillText('share it there and the whole', 24, rowH + 100);
      g2.fillText('network can browse it here', 24, rowH + 126);
      // slow pulse ring — the Steam feel
      g2.strokeStyle = '#ff2e88'; g2.lineWidth = 3;
      const r = 16 + (Math.sin(t2 * 1.6) * 0.5 + 0.5) * 12;
      g2.beginPath(); g2.arc(W - 52, rowH + 40, r, 0, Math.PI * 2); g2.stroke();
    }
    s.tex.needsUpdate = true;
  }

  // ═══ update: one clock for the whole palette ═══
  let tClock = 0, canvasT = -1, canvasT2 = -1, hue = 0;   // t188: canvasT2 = the STATIC pair's clock
  // t188: the den's view gate — close enough AND actually on screen
  const _frustum = new THREE.Frustum(), _fm = new THREE.Matrix4();
  const _denSphere = new THREE.Sphere(new THREE.Vector3(cx, 1.6, cz), 4.8);
  let steadyLights = false;                    // t186: the photosensitive-comfort pref — see setSteadyLights
  function setSteadyLights(on) { steadyLights = !!on; }
  const _col = new THREE.Color();
  function update(dt, camera, player, sightBlocked) {
    tClock += dt;
    hue = (tClock * (steadyLights ? 0.008 : 0.055)) % 1;   // t186: steady = a ~2-minute drift instead of ~18s
    _col.setHSL(hue, 1.0, 0.55);
    for (const m2 of rgbMats) m2.emissive.copy(_col);
    biasLight.color.copy(_col); towerLight.color.copy(_col); logoLight.color.copy(_col);
    logoLight.intensity = steadyLights ? 0.9 : 1.35 + Math.sin(tClock * 0.7) * 0.25;   // t186: a gentle breath; still under steady-lights
    for (const s of spinners) s.rotation.x += dt * (steadyLights ? 1.1 : 6);   // t186: fans idle-glide under steady lights
    // bubble: rises through the reservoir, loops
    if (towerGrp) { const b = towerGrp.userData.bubble; b.position.y = towerGrp.userData.bubbleBase + ((tClock * 0.12) % 0.2) - 0.10; }
    // t172: the neon pocket door — opens when you walk up (either side)
    const nearDoor = player ? Math.hypot(player.x - DX, player.z - (gz1 + T / 2)) < 2.3 : false;
    doorOpen += ((nearDoor ? 1 : 0) - doorOpen) * Math.min(1, dt * 5);
    if (doorPanel) doorPanel.position.x = DX + doorOpen * (DW + 0.18);
    tickMusic(camera, player, sightBlocked);
    // the preview canvases repaint only near the den AND in view — t185
    // (the owner's fps ask) + t188 (the den look-around stutter report):
    // the ANIMATED pair (VIZ + music) runs ~30 fps while music plays and
    // 4 fps idle; the STATIC pair (Discord + Steam) only changes when the
    // 45 s preview refresh does, so it paints on a 1 s heartbeat (was: all
    // four repainted together at the live cadence — 2-4× the canvas and
    // texture-upload work, which no resolution setting could touch).
    if (camera) {
      _fm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_fm);
      const near = camera.position.distanceTo(_wv.set(cx, 1.5, cz)) < 8.5
        && _frustum.intersectsSphere(_denSphere);
      if (!near) { canvasT = -1; canvasT2 = -1; }       // paint promptly on re-entry
      else {
        if (tClock - canvasT > (musicLive() ? 0.032 : 0.25)) {
          canvasT = tClock;
          paintMusicScreen(musicScr, tClock);
        }
        if (tClock - canvasT2 > 1.0) {
          canvasT2 = tClock;
          paintDiscord(discordScr, tClock);
          paintSteamScreen(steamScr, tClock);
        }
      }
    }
  }
  function applyTheme(t) {
    deskMat.color.set(t.shelf);
    theme = t;
  }
  return {
    group, occluders, colliders, monitorTargets,
    bounds: { x0: gx0, x1: gx1, z0: gz0, z1: gz1 },
    update, applyTheme, playMusic, stopMusic, noteMusicNow, setPreviews,
    gamerSetVolume, gamerToggle, gamerStats, gamerAudioInfo, setSteadyLights,
    debugGamer: () => ({ exists: true, engine: musicEngine || null,   // 'youtube' | null   (t182: Spotify is out)
      musicId, musicGates, title: ytTitle || '',
      np: musicEngine ? { service: musicEngine, title: ytTitle || musicId, artist: '' } : null,
      npPainted: npPaintedAt > 0 && !!musicEngine,
      panel: window.__HBMedia?.state?.() || null,
      previews: { discord: previews.discord ? { online: previews.discord.online, members: previews.discord.members } : null,
        music: previews.music ? { always: true } : null,   // t186: keyless — always ready
        steam: previews.steam ? { set: !!previews.steam.set, top: (previews.steam.top || []).length } : null },
      spin: +(tClock * 6).toFixed(2), hue: +hue.toFixed(3),
      musicLive: musicLive(), steadyLights,   // t193: the viz screen is gone — the music gate stays
      door: +doorOpen.toFixed(2) }),   // t172/t173/t180/t182/t185b tests
  };
}
