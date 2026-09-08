// ─────────────────────────────────────────────────────────────────────────────
//  store3d/scene.js — assembles the world and runs the render loop
//  ───────────────────────────────────────────────────────────────────────────
//  Owns: renderer, camera, room, shelves, signage, TV, controls, hover-picking.
//  main.js drives it through a small API:
//      scene.setItems(items, sorting, onProgress)
//      scene.applyTheme(theme) / scene.applySorting(sorting)
//      scene.onItemClick = fn   scene.onHover = fn
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT, TUNING } from './config.js?v=1788852958324';
import { buildRoom, buildTheater, buildJukebox } from './room.js?v=1788852958324';
import { buildHall } from './hall.js?v=1788852958324';
import { buildDance } from './dance.js?v=1788852958324';
import { buildExterior } from './exterior.js?v=1788852958324';   // the world outside the door
import { buildSignage } from './signage.js?v=1788852958324';
import { createDjPro } from './djpro.js?v=1788852958324';
import { buildTV } from './tv.js?v=1788852958324';
import { computeFaces, assignItems, buildShelfGroup, shelfColliders, browseOrder } from './shelves.js?v=1788852958324';
import { PosterAtlases } from './atlas.js?v=1788852958324';
import { createControls } from './controls.js?v=1788852958324';
import { createJukeAudio } from './jukeaudio.js?v=1788852958324';

export function createScene(container, theme) {
  // ── renderer ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  container.appendChild(renderer.domElement);

  // ── scene + camera ──
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(theme.wall).multiplyScalar(0.55);
  scene.fog = new THREE.FogExp2(fogColor, 0.02);
  scene.background = fogColor.clone();

  const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.05, 60);

  // ── world pieces ──
  const room = buildRoom(theme);
  scene.add(room.group);
  const exterior = buildExterior(theme);   // the world outside — pushed past the front hall
  exterior.position.z += LAYOUT.hall.d;         // t49: facade sits FLUSH on the street wall (was +2m — floating)
  scene.add(exterior);
  const hall = buildHall(theme);          // t47: front entry hall (sliding doors)
  scene.add(hall.group);
  const dance = buildDance(theme);        // t47: dance hall + DJ's library (right side)
  scene.add(dance.group);
  // the entry-door assembly (frame, glass, push bars, OPEN sign, big logo) —
  // clicking it copies the SUPPORT link (main.js wires onPortalClick)
  // The front door is (for now) decorative — no links, no exit. It may become
  // a hallway later, so the meshes stay; interactions are simply off.
  const portalTargets = [];

  const signage = buildSignage(theme);
  scene.add(signage.group);

  const tv = buildTV(theme);
  scene.add(tv.group);
  const djPro = createDjPro();                         // t64: the booth's dual-deck pro rig
  djPro.setSurround(dance.speakerWorld);               // feeds the dance-hall ring, gated to the wing

  // the theater wing + the jukebox (music's new home in the main store)
  const theater = buildTheater(theme);
  scene.add(theater.group);
  const jukebox = buildJukebox(theme);
  scene.add(jukebox.group);
  const deckTargets = theater.deckTargets, jukeTargets = jukebox.targets;
  const binTargets = theater.binTargets;

  // playback drives the house: lights dim + beam on when something rolls,
  // lights up + the CASE EJECTS from the deck when it ends or is stopped
  let lastPlayedItem = null, ejected = null, wasPlaying = false;
  tv.state.onStateChange = (st) => {
    theater.setPlaying(!!st.playing);
    if (st.playing) {
      clearEject();
      lastPlayedItem = currentItems.find(i => i.title === st.playing.title) || lastPlayedItem;
    } else if (wasPlaying) {
      showEject();           // ONLY on a real playing→stopped transition —
    }                         // idle/settings emits must not conjure ghost tapes
    wasPlaying = !!st.playing;
  };

  const faces = computeFaces();
  const colliders = [...shelfColliders(faces), ...theater.colliders, ...jukebox.colliders, ...dance.colliders];   // t51: DJ booth blocks feet
  const controls = createControls(camera, renderer.domElement, colliders);
  controls.reset();
  let currentTheme = { ...theme };   // kept in sync so rebuilds use fresh colors

  // the jukebox's OWN audio channel — independent of the theater screen
  let danceLevelsOverride = null;               // t54 tests: fake levels for the light engine
  const jukeAudio = createJukeAudio();          // the JUKEBOX device (store zone)
  if (room.speakerWorld)                          // t55: the jukebox plays the STORE'S 7.1 set
    jukeAudio.setSurround(room.speakerWorld.sats, room.speakerWorld.subs, room.speakerWorld.center);
  const djAudio = createJukeAudio();            // t52: the DJ BOOTH device — fully
  djAudio.setZone('dance');                     // independent audio (simultaneous play)
  if (dance.speakerWorld)                       // t53: the booth drives the 10-speaker ring
    djAudio.setSurround(dance.speakerWorld.sats, dance.speakerWorld.subs, dance.speakerWorld.center);

  // ── CARRY: grab a case off the shelves and walk it to the theater deck ──
  let carried = null, carryMesh = null, carryTex = null, carryClock = 0;
  const FORMAT_BY_HASH = ['VHS', 'DVD', 'Blu-ray'];
  function makeCaseTexture(item) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 384;
    const g = cv.getContext('2d');
    g.fillStyle = '#101423'; g.fillRect(0, 0, 256, 384);
    g.fillStyle = currentTheme.accent || '#ffd23f'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#101423'; g.font = '700 26px sans-serif'; g.textAlign = 'center';
    g.fillText(carryFormat(item), 128, 58);
    g.fillStyle = '#f4f1ff'; g.font = '700 24px sans-serif';
    const words = String(item.title).split(/\s+/); let line = '', y = 150;
    for (const w of words) {
      if ((line + ' ' + w).trim().length > 15) { g.fillText(line.trim(), 128, y); line = w; y += 30; }
      else line += ' ' + w;
      if (y > 320) break;
    }
    if (y <= 320) g.fillText(line.trim(), 128, y);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  function carryFormat(item) {
    let h = 0; const s = String(item?.id || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return FORMAT_BY_HASH[h % 3];
  }
  function carry(item) {
    if (carryMesh) { scene.remove(carryMesh); carryMesh.geometry.dispose(); carryMesh = null; }
    carryTex?.dispose(); carryTex = null;
    carried = item || null;
    if (!carried) { api.onCarryChange?.(null); return; }
    carryTex = makeCaseTexture(carried);
    carryMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.36, 0.05),
      new THREE.MeshStandardMaterial({ map: carryTex, roughness: 0.5, emissive: 0x222233, emissiveIntensity: 0.35 }));
    scene.add(carryMesh);
    api.onCarryChange?.({ item: carried, format: carryFormat(carried) });
  }
  // the VHS look — scanline overlay in front of the screen (tv.js owns none of this)
  const slCv = document.createElement('canvas'); slCv.width = 8; slCv.height = 8;
  const slg = slCv.getContext('2d'); slg.fillStyle = 'rgba(0,0,0,0.34)'; slg.fillRect(0, 0, 8, 3);
  const slTex = new THREE.CanvasTexture(slCv); slTex.wrapS = slTex.wrapT = THREE.RepeatWrapping;
  slTex.repeat.set(90, 50);
  const vhsOverlay = new THREE.Mesh(new THREE.PlaneGeometry(LAYOUT.theater.screen.w, LAYOUT.theater.screen.w * 9 / 16),
    new THREE.MeshBasicMaterial({ map: slTex, transparent: true, opacity: 0, depthWrite: false }));
  vhsOverlay.position.set(0, LAYOUT.theater.screen.cy, tv.focusPoint.z + 0.06);
  scene.add(vhsOverlay);

  // ── EJECT: when playback ends/stops, the case sticks out of the deck
  //    like a tape that's been spat out. Click it to pick it back up. ──
  function showEject() {
    if (ejected || !lastPlayedItem) return;
    const dk = theater.deckPos;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.05),
      new THREE.MeshStandardMaterial({ map: makeCaseTexture(lastPlayedItem), roughness: 0.5 }));
    mesh.position.set(dk.x, dk.y + 1.18, dk.z + 0.18);
    mesh.rotation.x = -0.55;                     // leaning out of the slot
    scene.add(mesh);
    ejected = { item: lastPlayedItem, mesh };
    deckTargets.push(mesh);
  }
  function clearEject() {
    lastPlayedItem = null;   // the tape is back in someone's hands — forget it
    if (!ejected) return;
    scene.remove(ejected.mesh);
    ejected.mesh.geometry.dispose();
    const i = deckTargets.indexOf(ejected.mesh);
    if (i >= 0) deckTargets.splice(i, 1);
    ejected = null;
  }

  // ── shelf state (rebuilt when items/sorting/shelf-map change) ──
  let currentSorting = { mode: 'recent', dir: 'desc' };
  let currentShelves = {};              // Shelf Map (unitId → sectionKey)
  let unitPages = {};                   // manual shelf pages (unitId → page int)
  const atlases = new PosterAtlases();
  scene._atlases = atlases;   // debug/testing handle (window.__VB.atlases())
  let shelf = null;            // current buildShelfGroup() result
  let currentItems = [];
  let currentAssignment = null;

  // ── hover highlight ──
  const highlight = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: theme.accent, linewidth: 1 })
  );
  highlight.visible = false;
  scene.add(highlight);

  const raycaster = new THREE.Raycaster();
  raycaster.far = 6.5;                       // only nearby cases are hoverable
  let hoveredPlacement = null, lastRay = 0;

  // Center-screen raycast against case bodies. Used for hover (throttled)
  // and again on click so a fast turn+click still lands on the right case.
  function inStoreRoom() {              // t51: store wing only (not dance/library/theater)
    const p = controls.state.pos;
    return !(p.z < -6.35 && Math.abs(p.x) < 5.6) && !(p.x > 6.2 && p.z < 9.2);
  }
  function doPick() {
    if (!shelf) return null;
    if (!inStoreRoom()) return null;     // t51: no cross-room shelf selection
    controls.syncCamera();               // aim from the player's TRUE pose
    raycaster.setFromCamera(controls.ray, camera);
    const hits = raycaster.intersectObjects(shelf.raycastTargets, false);
    if (!hits.length) return null;
    // t52: walls are SOLID to the cursor too — no grabbing store cases through
    // the theater wall (or any wall): if a wall sits closer than the case,
    // the case can't be reached from here
    const wallD = Math.min(
      raycaster.intersectObjects(theater.occluders || [], true)[0]?.distance ?? Infinity,
      raycaster.intersectObjects(hall.occluders || [], true)[0]?.distance ?? Infinity,
      raycaster.intersectObjects(dance.occluders || [], true)[0]?.distance ?? Infinity);
    return hits[0].distance < wallD ? shelf.pickAt(hits[0]) : null;
  }

  const PORTAL_TIP = { title: '🚪 Front entrance', year: null, type: null };
  const DECK_TIP = { title: '🎬 Theater player — bring a movie here', year: null, type: null };
  const JUKE_TIP = { title: '🎵 Jukebox — browse the music', year: null, type: null };
  const BIN_TIP = { title: '📥 Return bin — drop your movie here', year: null, type: null };

  // Is the crosshair over the entry door? (own flag: shares `raycaster`)
  function pickPortal() {
    if (!portalTargets.length) return false;
    controls.syncCamera();
    raycaster.setFromCamera(controls.ray, camera);
    return raycaster.intersectObjects(portalTargets, false).length > 0;
  }

  // …or over the theater deck / the jukebox?
  // t41: HONEST CLICKS — walls and doors occlude (no feeding a tape through
  // the closed door), and the deck/return only answer inside the theater.
  let lastRecord = null;
  function pickSpecial() {
    controls.syncCamera();
    raycaster.setFromCamera(controls.ray, camera);
    const wallD = Math.min(
      raycaster.intersectObjects(theater.occluders || [], true)[0]?.distance ?? Infinity,
      raycaster.intersectObjects(hall.occluders || [], true)[0]?.distance ?? Infinity,
      raycaster.intersectObjects(dance.occluders || [], true)[0]?.distance ?? Infinity);
    const inTheater = controls.state.pos.z < -6.5 && controls.state.pos.x < 5.6;
    // deck vs return-chute: the NEAREST hit wins (a ray at the chute also
    // grazes the pedestal behind it — that must answer 'bin', not 'deck')
    const dDeck = inTheater ? (raycaster.intersectObjects(deckTargets, false)[0]?.distance ?? Infinity) : Infinity;
    const dBin = inTheater ? (raycaster.intersectObjects(binTargets, false)[0]?.distance ?? Infinity) : Infinity;
    if (Math.min(dDeck, dBin) < wallD) return dBin < dDeck ? 'bin' : 'deck';
    if (raycaster.intersectObjects(jukeTargets, false)[0]?.distance < wallD) return 'jukebox';
    // t47: the DJ booth (laptop) and the vinyl in the DJ's library
    if (raycaster.intersectObjects(dance.boothTargets || [], true)[0]?.distance < wallD) return 'djbooth';
    const recHit = raycaster.intersectObjects(dance.recordTargets || [], false)[0];
    if (recHit && recHit.distance < wallD) {
      let o = recHit.object; while (o && !o.userData?.item) o = o.parent;
      if (o) { lastRecord = o.userData.item; return 'record'; }
    }
    if (raycaster.intersectObjects(hall.streetTargets || [], false)[0]?.distance < wallD) return 'streetdoor';
    return null;
  }

  let portalHovered = false, specialHovered = null;
  function pickHover(now) {
    if (now - lastRay < 90) return;
    lastRay = now;
    if (pickPortal()) {          // aiming at the door → support-link tooltip
      if (hoveredPlacement) { hoveredPlacement = null; highlight.visible = false; }
      if (!portalHovered) { portalHovered = true; api.onHover?.(PORTAL_TIP); }
      return;
    }
    if (portalHovered) { portalHovered = false; api.onHover?.(null); }
    const sp = pickSpecial();
    if (sp) {
      if (hoveredPlacement) { hoveredPlacement = null; highlight.visible = false; }
      const tip = sp === 'deck'
        ? (carried ? { ...DECK_TIP, title: `🎬 Insert “${carried.title.slice(0, 34)}”` } : DECK_TIP)
        : sp === 'bin'
          ? (carried ? { ...BIN_TIP, title: `📥 Return “${carried.title.slice(0, 34)}”` } : BIN_TIP)
          : sp === 'djbooth' ? { title: '💻 Open the DJ menu', sub: 'playlists · EQ · fades' }
          : sp === 'record' ? { title: `💿 Spin “${(lastRecord?.title || 'that record').slice(0, 30)}”`, sub: 'plays on the jukebox' }
          : sp === 'streetdoor' ? { title: '🧟 Zombie warning, Stay and party', sub: 'the party is inside' }   // t52 — the street door only
          : null;   // t85: the jukebox is quiet on purpose — hover overlay removed (owner request)
      if (specialHovered !== sp) { specialHovered = sp; api.onHover?.(tip); }
      return;
    }
    if (specialHovered) { specialHovered = null; api.onHover?.(null); }
    const pl = doPick();
    if (pl !== hoveredPlacement) {
      hoveredPlacement = pl;
      if (pl) {
        highlight.visible = true;
        highlight.position.copy(pl.pos);
        highlight.scale.set(pl.size.w + 0.04, pl.size.h + 0.04, pl.size.d + 0.06);
        highlight.rotation.y = pl.rotY;
      } else highlight.visible = false;
      api.onHover?.(pl ? pl.item : null);
    }
  }

  // ── render loop ──
  const clock = new THREE.Clock();
  let raf = 0;
  let tvClose = false;                     // hysteresis so the panel doesn't flicker
  const tvFocus = tv.focusPoint || new THREE.Vector3();
  function loop() {
    raf = requestAnimationFrame(loop);
    // t83: full-screen overlays (front desk, settings) own the CPU — on phones,
    // typing into the account form ran at ~2 fps with the scene rendering behind it.
    if (document.hidden || document.body.classList.contains('overlay-open')) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    controls.update(dt);
    tv.update(dt, camera);
    theater.update(dt, controls.state.pos);
    hall.update(dt, controls.state.pos);              // t47: sliding doors
    const proLv = djPro.getLevels();   // t64: the pro rig drives the floor when it's playing
    dance.update(dt, danceLevelsOverride ?? (proLv.live ? proLv : djAudio.getLevels?.()));   // t52+t54+t64
    jukebox.update?.(dt);
    jukeAudio.update(camera);
    djPro.update(camera);   // t64: pro rig — wing gate, listener, loops, BPM
    pickHover(performance.now());
    atlases.flush();                       // upload any poster tiles that arrived
    // WATCH MODE: when the player walks/zooms up close to the TV, the ON DECK
    // queue panel steps aside (body.tv-close) so the screen is unobstructed.
    // carried case floats in front of you (right side, gentle bob)
    if (carryMesh) {
      carryClock += dt;
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      carryMesh.position.copy(camera.position)
        .addScaledVector(fwd, 0.85).addScaledVector(right, 0.34);
      carryMesh.position.y -= 0.26 + Math.sin(carryClock * 2.1) * 0.012;
      carryMesh.quaternion.copy(camera.quaternion);
      carryMesh.rotation.z = Math.sin(carryClock * 1.3) * 0.04;
    }
    if (vhsOverlay.material.opacity > 0)
      vhsOverlay.material.opacity = 0.75 + Math.sin(performance.now() * 0.01) * 0.08;
    const d = camera.position.distanceTo(tvFocus);
    if (d < 3.2) tvClose = true; else if (d > 3.6) tvClose = false;   // fades a step earlier
    if (tvClose !== document.body.classList.contains('tv-close'))
      document.body.classList.toggle('tv-close', tvClose);
    renderer.render(scene, camera);
  }
  loop();

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  // ── public API ──
  const api = {
    onHover: null,
    onPortalClick: null,     // set by main.js — copies the SUPPORT link
    onClick: null,
    onDeckClick: null,       // clicked the theater deck (payload: carried | null)
    onJukeboxClick: null,    // clicked the jukebox
    onBinClick: null,        // clicked the return bin (payload: carried | null)
    onCarryChange: null,     // picked up / put back a case
    controls, tv, camera,
    threeScene: scene, rendererInfo: () => renderer.info,   // debugging handle
    debugPose: () => ({                                      // player pose (tests/debug)
      x: controls.state.pos.x, z: controls.state.pos.z,
      yaw: controls.state.yaw, pitch: controls.state.pitch,
      fov: controls.state.fov, locked: controls.state.locked,
      lift: controls.state.floorLift || 0     // theater slope height
    }),
    // Tests/debug only: jump the player to a pose (does NOT pathfind — pick a
    // spot a player could legitimately stand in). Used by e2e aim probes.
    debugTeleport(x, z, yaw = 0, pitch = 0) {
      controls.state.pos.set(x, TUNING.player.eyeHeight, z);
      controls.state.keys.clear();                    // drop stale held keys — no post-teleport drift
      controls.state.touchMove = null;
      controls.state.yaw = yaw; controls.state.pitch = pitch;
      controls.state.floorLift = controls.floorHeightAt(x, z);   // eye height instantly correct
      controls.syncCamera();
    },
    // ▶ play a shelf item on the in-store TV (wired up by main.js/ui.js)
    playItem: (item, queue) => tv.playItem(item, queue),
    playNext: (item) => tv.playNext(item),
    stopTv: () => tv.stop(),

    // Debug/testing helper: render one frame and read pixels from the drawing
    // buffer (origin bottom-left). Returns {avg, uniq, darkPct}.
    debugSample(x = 0, y = 0, w = 96, h = 54) {
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sr = 0, sg = 0, sb = 0, dark = 0;
      const uniq = new Set();
      for (let i = 0; i < px.length; i += 4) {
        sr += px[i]; sg += px[i + 1]; sb += px[i + 2];
        if (px[i] + px[i + 1] + px[i + 2] < 40) dark++;
        uniq.add((px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4));
      }
      const n = w * h;
      return { avg: [sr / n | 0, sg / n | 0, sb / n | 0], darkPct: +(100 * dark / n).toFixed(1), uniq: uniq.size };
    },

    // Tests/debug only: raw RGBA pixels of a framebuffer rect (GL coords:
    // origin bottom-left). Returns a plain array for transport.
    debugPixels(x = 0, y = 0, w = 96, h = 54) {
      renderer.render(scene, camera);
      const gl = renderer.getContext();
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return Array.from(px);
    },

    // Called once with the library (placeholders appear immediately; real
    // artwork streams in afterwards via atlases.loadArtwork).
    setItems(itemsRaw, sorting, onProgress, shelves) {
      // t62: the FULL library can carry non-playable kinds (ebooks/PDFs) —
      // they stay in the catalogue for the future readers, but only playable
      // media stands on the shelves.
      const PLAYABLE = new Set(['movie', 'show', 'album', 'musicvideo', 'episode', 'radio', 'live']);
      const items = itemsRaw.filter(i => PLAYABLE.has(i.type));
      currentItems = items;
      dance.setRecords(items);           // t47: the DJ's library restocks its vinyl
      if (shelves) currentShelves = shelves;
      atlases.dispose();
      const count = atlases.begin(items, onProgress);
      api.applySorting(sorting);
      signage.rebuildIslandPosters(items);    // center-aisle poster end caps
      // stream artwork in the background (non-blocking)
      atlases.loadArtwork(items.slice(0, count), (done, total) => {
        onProgress?.(done, total, true);
      });
    },

    applySorting(sorting) {
      currentSorting = sorting || currentSorting;
      if (shelf) { scene.remove(shelf.group); shelf.dispose(); }
      currentAssignment = assignItems(faces, currentItems, currentSorting, currentShelves, unitPages);
      shelf = buildShelfGroup(faces, currentAssignment, atlases, currentTheme);
      scene.add(shelf.group);
      signage.rebuild(currentAssignment.labels, faces);
      highlight.visible = false;
      hoveredPlacement = null;
    },

    // Admin → Shelf Map support
    setShelfAssignment(map) {
      currentShelves = map || {};
      api.applySorting(currentSorting);
    },
    // Shelf paging: flip a unit's window forward/back through its category
    cycleShelf(unitId, dir) {
      const info = currentAssignment?.unitPaging?.[unitId];
      if (!info) return null;
      const raw = Number.isFinite(unitPages[unitId]) ? unitPages[unitId] : (info.raw ?? info.page);
      unitPages[unitId] = raw + dir;
      api.applySorting(currentSorting);
      return api.shelfPageInfo(unitId);
    },
    shelfPageInfo(unitId) {
      const info = currentAssignment?.unitPaging?.[unitId];
      if (!info) return null;
      return { unit: unitId, page: info.page, pages: info.pages, total: info.total, pool: info.pool };
    },
    debugShelfHit() { return doPick(); },          // t51: tests — gated cross-room picking
    audioBoxes() {                                  // t58 tests: speakers vs everything
      return { sats: room.speakerWorld.sats, sub: room.speakerWorld.subs[0], signs: signage.signBoxes(),
        danceSats: dance.speakerWorld.sats, danceSubs: dance.speakerWorld.subs };   // t60: ear-level check
    },
    danceFakeLevels: (v) => { danceLevelsOverride = v; },   // t54 tests: drive the rig
    danceTick(levels, steps = 20) {          // t54 tests: step the light engine SYNCHRONOUSLY
      const keep = danceLevelsOverride;      // (rAF can starve to ~2 fps in headless)
      for (let i = 0; i < steps; i++) dance.update(0.05, levels ?? keep);
      danceLevelsOverride = keep;
    },
    shelfUnderCrosshair() {
      const unit = hoveredPlacement?.face?.unit || null;
      return unit ? api.shelfPageInfo(unit) : null;
    },
    shelfTypeCounts() {                      // t45: what types sit on the shelves (audio must be absent)
      const c = {};
      for (const p of (currentAssignment?.placements || []))
        if (p) c[p.item.type] = (c[p.item.type] || 0) + 1;
      return c;
    },
    shelfUnits() {
      const seen = new Set();
      const out = [];
      for (const f of browseOrder(faces)) {
        if (seen.has(f.unit)) continue;
        seen.add(f.unit);
        const u = f.unit;
        let label = u;
        if (u.startsWith('wall-')) label = `${u[5] === 'L' ? 'Left' : 'Right'} Wall · Bay ${parseInt(u.slice(7), 10) + 1}`;
        else if (u.startsWith('far-')) label = `Back Wall · Bay ${parseInt(u.slice(4), 10) + 1}`;
        else if (u.startsWith('island-')) label = `Center Island · ${u[7] === 'L' ? 'Left' : 'Right'} ${u.slice(8)}`;
        out.push({ id: u, label });
      }
      return out;
    },
    placementsByUnit(unit) {
      return (currentAssignment?.placements || [])
        .filter(p => p && p.item && p.face.unit === unit)
        .map(p => p.item.title);
    },

    applyTheme(t) {
      currentTheme = { ...t };
      tv.setThemeAccent?.(t.accent);   // visualizer + TV accents follow the theme
      room.applyTheme(t);
      theater.applyTheme(t);
      jukebox.applyTheme(t);
      signage.applyTheme(t);
      shelf?.applyTheme(t);
      highlight.material.color.set(t.accent);
      fogColor.copy(new THREE.Color(t.wall).multiplyScalar(0.55));
      scene.background = fogColor.clone();
    },

    hallState: () => hall.state(),
    facadeFlush: () => Math.abs(exterior.position.z - LAYOUT.hall.d) < 0.01,   // t49: facade on the building
    hallInfo: () => hall.info(),
    danceInfo: () => dance.info(),
    djPro,   // t64: the booth pro rig (mount/getLevels/info)
    debugStep: (dx, dz) => controls.debugStep(dx, dz),   // t48: walk one REAL step (collision path)
    resetToSpawn() { controls.reset(); controls.syncCamera(); },   // t52: anti-stuck — back to the load-in point
    debugPickSpecial: () => pickSpecial(),     // tests: what would the crosshair hit?
    // click under the crosshair → deck insert / jukebox / item pickup
    fireSelect() {
      if (pickPortal()) { api.onPortalClick?.(); return; }   // door (inert today)
      const sp = pickSpecial();
      if (sp === 'deck') {
        if (!carried && ejected) { const it = ejected.item; clearEject(); carry(it); return; }
        api.onDeckClick?.(carried ? { item: carried, format: carryFormat(carried) } : null);
        return;
      }
      if (sp === 'jukebox') { api.onJukeboxClick?.(); return; }
      if (sp === 'bin') { api.onBinClick?.(carried || null); return; }
      if (sp === 'djbooth') { api.onDjClick?.(); return; }              // t47: laptop → DJ menu
      if (sp === 'record') { api.onRecordClick?.(lastRecord || null); return; }   // spin a vinyl
      if (sp === 'streetdoor') { api.onStreetDoorClick?.(); return; }   // locked — toast
      const pl = hoveredPlacement || doPick();
      if (pl) api.onClick?.(pl.item);
    },
    // theater telemetry (tests + the curious)
    theaterState: () => ({ doors: theater.doorsState(), lights: theater.lightState(),
      seats: theater.seatsInfo(), screen: theater.screenInfo() }),
    lockMouse: () => controls.lock(),
    unlockMouse: () => controls.unlock(),
    jukeboxAudio: jukeAudio,
    djAudio,                                   // t52: the booth's own channel
    ejectedInfo: () => ejected ? { title: ejected.item.title } : null,
    // ── carry-the-case (theater flow) ──
    carry,
    carried: () => carried,
    carryFormat,
    setVhsLook(on) { vhsOverlay.material.opacity = on ? 0.75 : 0; },

    // Debug/testing: run the center-screen raycast immediately, return item.
    debugPick() {
      const pl = doPick();
      return pl ? { title: pl.item.title, type: pl.item.type } : null;
    },

    dispose() {
      cancelAnimationFrame(raf);
      shelf?.dispose();
      atlases.dispose();
      tv.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };

  controls.state.onClick = () => api.fireSelect();

  return api;
}
