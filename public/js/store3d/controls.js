// ─────────────────────────────────────────────────────────────────────────────
//  store3d/controls.js — first-person movement (WASD + mouse-look)
//  ───────────────────────────────────────────────────────────────────────────
//  • Desktop: click the store → pointer lock. WASD/arrows to walk, Shift to
//    jog, SCROLL WHEEL to zoom (FOV), Q to release/re-grab the cursor
//    (Esc still works — browsers force it). Embedded iframes block
//    pointer lock — we detect that and fall back to click-drag looking.
//  • Touch: left half of the screen = virtual joystick (move), right half =
//    drag to look around, tap = select what's under the crosshair.
//  • Collision: the player is a circle vs. every shelf AABB + the room walls.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT, TUNING } from './config.js?v=1788729356586';

const SPAWN = { x: 0, z: LAYOUT.room.l / 2 + 1.55 };   // t52: in the FRONT HALLWAY, just outside
                                                        // the store door — facing in (-z), as if you
                                                        // just walked in from outside

export function createControls(camera, domElement, colliders) {
  const P = TUNING.player;
  const state = {
    yaw: 0, pitch: 0,
    pos: new THREE.Vector3(SPAWN.x, P.eyeHeight, SPAWN.z),   // spawn facing the TV
    // zoom (FOV): fovTarget is where the wheel wants to go, fov eases toward
    // it every frame; fovBase is the normal (fully zoomed-out) field of view.
    fovBase: camera.fov, fov: camera.fov, fovTarget: camera.fov,
    keys: new Set(),
    locked: false, dragging: false, dragMoved: 0, lockBlocked: false,
    touchMove: null,          // {x, z} joystick vector
    enabled: true,
    bobPhase: 0,
    onLockChange: null, onClick: null
  };

  const raycastCenter = new THREE.Vector2(0, 0); // crosshair ray (shared)
  const onClickHandlers = [];

  // ── pointer lock ──
  function requestLock() {
    if (state.locked || state.lockBlocked || !state.enabled || isTouch()) return;
    const p = domElement.requestPointerLock?.();
    // Chrome returns a promise; older browsers undefined
    if (p && p.catch) p.catch(() => { state.lockBlocked = true; });
  }
  domElement.addEventListener('click', () => {
    if (!state.enabled || isTouch()) return;
    requestLock();
  });
  let lockFlipAt = 0;   // timestamp of the last lock-state CHANGE
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === domElement;
    lockFlipAt = performance.now();      // the event right after a lock flip
    state.onLockChange?.(state.locked);  // often carries a huge bogus delta
  });

  // Window focus/leave hygiene — alt-tab or the cursor leaving the window
  // used to leave walk keys STUCK or let drag-look grab a phantom position
  // on re-entry ("hard to move / look sometimes").
  let enterAt = 0;                                  // last window (re-)entry
  const recentMags = [];                            // rolling delta sizes
  document.addEventListener('mouseleave', () => { state.dragging = false; });
  document.addEventListener('mouseenter', () => { enterAt = performance.now(); });
  window.addEventListener('blur', () => {
    state.dragging = false;
    state.keys.clear();                             // no stuck walk keys
  });
  document.addEventListener('pointerlockerror', () => {
    state.lockBlocked = true;
    state.onLockChange?.(false);
  });

  // ── mouse look (locked OR drag-fallback) ──
  const applyLook = (dx, dy) => {
    // turning slows while zoomed in, so aiming feels the same at every zoom
    const zoomK = state.fov / state.fovBase;
    state.yaw -= dx * P.lookSensitivity * zoomK;
    state.pitch -= dy * P.lookSensitivity * zoomK;
    const lim = Math.PI / 2 - 0.05;
    state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
  };
  document.addEventListener('mousemove', (e) => {
    if (!state.enabled) return;
    // ── GLITCH GUARDS (layered) ──
    //  1. skip the first events after a lock change (bogus teleport deltas)
    //  2. skip the first event after the cursor re-enters the window (drag
    //     mode computes movement from the last position — re-entry jumps)
    //  3. DISCARD one-off outliers: a spike that matches nothing in the
    //     recent motion (compositor hiccups, display-scaling bugs) is thrown
    //     away entirely — clamping alone still let mid-size spikes jerk it
    //  4. hard clamp whatever survives (fast flicks stay fast)
    const now = performance.now();
    if (now - lockFlipAt < 60) return;
    if (!state.locked && now - enterAt < 80) return;
    const SPIKE = 260;
    let dx = e.movementX || 0, dy = e.movementY || 0;
    const mag = Math.max(Math.abs(dx), Math.abs(dy));
    if (recentMags.length >= 5) {
      const avg = recentMags.reduce((a, b) => a + b, 0) / recentMags.length;
      if (mag > 30 && mag > avg * 7 + 25) {          // one-off outlier → drop
        recentMags.push(mag); if (recentMags.length > 12) recentMags.shift();
        return;
      }
    }
    if (Math.abs(dx) > SPIKE) dx = Math.sign(dx) * SPIKE;
    if (Math.abs(dy) > SPIKE) dy = Math.sign(dy) * SPIKE;
    recentMags.push(Math.max(Math.abs(dx), Math.abs(dy)));
    if (recentMags.length > 12) recentMags.shift();
    if (state.locked) applyLook(dx, dy);
    else if (state.dragging) {
      state.dragMoved += Math.abs(dx) + Math.abs(dy);
      applyLook(dx, dy);
    }
  });
  domElement.addEventListener('mousedown', (e) => {
    if (state.locked || isTouch() || !state.enabled) return;
    if (e.button === 0) { state.dragging = true; state.dragMoved = 0; }
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      const wasDrag = state.dragging && state.dragMoved > 6;
      state.dragging = false;
      // In drag-look mode (pointer lock unavailable), a plain click selects.
      if (!wasDrag && !state.locked && state.lockBlocked && state.enabled) fireClick();
    }
  });
  document.addEventListener('click', (e) => {
    if (state.locked && state.enabled) fireClick();
  });

  // ── scroll wheel = ZOOM (field of view) ──
  // Scroll up → zoom in (narrower FOV), scroll down → back out to normal.
  // Bound to the canvas only, so scrolling over the settings menus behaves
  // normally. The actual FOV change eases toward the target in update().
  domElement.addEventListener('wheel', (e) => {
    if (!state.enabled) return;
    e.preventDefault();
    const step = P.zoomStep || 6;
    state.fovTarget = Math.max(P.zoomMin || 22, Math.min(P.zoomMax || 70,
      state.fovTarget + Math.sign(e.deltaY) * step));
  }, { passive: false });

  // ── keyboard ──
  const KEYMAP = {
    KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b',
    KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r'
  };
  // Typing guard: when focus is in a form field, EVERY key belongs to the
  // field — movement must not eat letters (typing "admin" used to come out
  // "min" because A/D were captured as walk keys) and preventDefault() was
  // blocking the character from reaching the input.
  const isTyping = (e) => !!e.target?.closest?.('input, textarea, select, [contenteditable]');
  // Any open UI panel (sidebar, settings, item/help modals) pauses movement
  // entirely — no walking around behind an open dialog. (The loading screen
  // is dismissed with an inline style, not .hidden, so it's not listed.)
  const uiOpen = () => !!document.querySelector(
    '#sidebar:not(.hidden), #settings:not(.hidden), .modal:not(.hidden)'
  );
  document.addEventListener('keydown', (e) => {
    const blocked = isTyping(e) || uiOpen();
    if (KEYMAP[e.code] && !blocked) { state.keys.add(KEYMAP[e.code]); e.preventDefault(); }
    if (!blocked && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')) state.keys.add('run');
    // Q toggles the mouse: locked → free the cursor; free → grab it again.
    // (Esc still releases — browsers force it. Q is ignored while typing in
    // a settings field or while a menu is open.)
    if (e.code === 'KeyQ' && !blocked) {
      e.preventDefault();
      if (state.locked) document.exitPointerLock();
      else if (!state.lockBlocked) {
        const p = domElement.requestPointerLock?.();
        if (p && p.catch) p.catch(() => { state.lockBlocked = true; });
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    if (KEYMAP[e.code]) state.keys.delete(KEYMAP[e.code]);
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') state.keys.delete('run');
  });

  // ── touch: left = joystick, right = look, tap = select ──
  const touches = new Map();
  domElement.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      const side = t.clientX < window.innerWidth / 2 ? 'move' : 'look';
      touches.set(t.identifier, { side, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, moved: 0 });
    }
  }, { passive: true });
  domElement.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      const rec = touches.get(t.identifier);
      if (!rec) continue;
      rec.moved += Math.abs(t.clientX - rec.x) + Math.abs(t.clientY - rec.y);
      rec.x = t.clientX; rec.y = t.clientY;
      if (rec.side === 'look') {
        applyLook((t.clientX - (rec.px ?? t.clientX)) * 1.8, (t.clientY - (rec.py ?? t.clientY)) * 1.8);
      }
      rec.px = t.clientX; rec.py = t.clientY;
    }
    e.preventDefault();
  }, { passive: false });
  domElement.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      const rec = touches.get(t.identifier);
      if (!rec) continue;
      if (rec.side === 'move') state.touchMove = null;
      else if (rec.moved < 10) fireClick();
      touches.delete(t.identifier);
    }
  });

  function fireClick() { state.onClick?.(); }

  // ── collision: circle vs AABBs, resolved axis-by-axis (lets you slide) ──
  // The walkable world is a UNION OF ROOMS: the sales floor, the theater
  // doorway corridor, and the theater itself. If the next step lands in any
  // room's walkable rect it's free; otherwise it clamps into the room the
  // player is currently standing in — so walls stop you everywhere except
  // through the doorway, and the corridor hands you between rooms.
  const RW = LAYOUT.room.w / 2, RD = LAYOUT.room.l / 2;
  const T = LAYOUT.room.wallThickness;
  const TH = LAYOUT.theater, thW = TH.w / 2, thZ0 = -RD - T, thZ1 = -RD - T - TH.l;
  const cw = TH.door.width / 2 - P.radius + 0.05;
  const HALL = LAYOUT.hall, DAN = LAYOUT.dance, LIB = LAYOUT.djlib;
  const hZ0 = RD + T, hZ1 = RD + T + HALL.d;                    // front hall z span
  const dX0 = RW + T, dX1 = RW + T + DAN.w;                     // dance hall x span
  const dZ1 = hZ1, dZ0 = hZ1 - DAN.l;
  const lZ0 = dZ0 - LIB.l, lX1 = dX0 + LIB.w;
  const fw = LAYOUT.door.width / 2 - P.radius + 0.05;           // store front door half-lane
  const dzC = hZ1 - DAN.door.width / 2 - 0.35;                  // dance door center z (matches hall.js)
  const bdX = (dX0 + dX1) / 2 + 0.4;                            // booth-door x (matches dance.js)
  const ROOMS = [
    { x0: -RW, x1: RW, z0: -RD, z1: RD, padX: 1, padZ: 1 },         // sales floor
    { x0: -cw - P.radius, x1: cw + P.radius, z0: thZ1 - 0.5, z1: thZ0 + 0.7, padX: 0, padZ: 0 },  // theater corridor
    { x0: -thW, x1: thW, z0: thZ1, z1: thZ0, padX: 1, padZ: 1 },    // theater
    { x0: -RW, x1: RW, z0: hZ0 + 0.05, z1: hZ1 - 0.05, padX: 1, padZ: 1 },                          // front hall
    { x0: -fw, x1: fw, z0: RD - 0.6, z1: hZ0 + 0.5, padX: 0, padZ: 0 },                           // store sliding-door lane (t48: OVERLAPS both rooms — no dead zone)
    { x0: dX0, x1: dX1, z0: dZ0, z1: dZ1 - 0.05, padX: 1, padZ: 1 },                                // dance hall
    { x0: RW - 0.3, x1: dX0 + 0.4, z0: dzC - DAN.door.width / 2 + 0.15, z1: dZ1 + 0.05, padX: 0, padZ: 0 },  // hall↔dance pass (overlaps both)
    { x0: dX0 + 0.05, x1: lX1, z0: lZ0 + 0.05, z1: dZ0 - 0.05, padX: 1, padZ: 1 },                  // DJ's library
    { x0: bdX - DAN.boothDoor.width / 2 + 0.15, x1: bdX + DAN.boothDoor.width / 2 - 0.15, z0: dZ0 - 1.6, z1: dZ0 + 1.6, padX: 0, padZ: 0 }  // booth-door pass (t51: OVERLAPS both rooms — no dead zone)
  ];
  const inRoom = (p, r) => p.x > r.x0 + (r.padX ? P.radius : 0) && p.x < r.x1 - (r.padX ? P.radius : 0)
    && p.z > r.z0 + (r.padZ ? P.radius : 0) && p.z < r.z1 - (r.padZ ? P.radius : 0);
  const clampRoom = (p, r) => {
    p.x = Math.max(r.x0 + (r.padX ? P.radius : 0), Math.min(r.x1 - (r.padX ? P.radius : 0), p.x));
    p.z = Math.max(r.z0 + (r.padZ ? P.radius : 0), Math.min(r.z1 - (r.padZ ? P.radius : 0), p.z));
  };
  function roomClamp(next) {
    for (const r of ROOMS) if (inRoom(next, r)) return next;      // free step
    let cur = ROOMS.find(r => inRoom(state.pos, r));
    if (!cur) {                                                   // fallback: nearest
      cur = ROOMS[0];
      let bd = Infinity;
      for (const r of ROOMS) {
        const dx = Math.max(r.x0 - next.x, 0, next.x - r.x1);
        const dz = Math.max(r.z0 - next.z, 0, next.z - r.z1);
        if (dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; cur = r; }
      }
    }
    clampRoom(next, cur);
    return next;
  }

  function collide(next) {
    roomClamp(next);
    for (const b of colliders) {
      // closest point on the box to the player circle (xz only)
      const cx = Math.max(b.minX, Math.min(next.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(next.z, b.maxZ));
      const dx = next.x - cx, dz = next.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < P.radius * P.radius) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = (P.radius - d) / d;
          next.x += dx * push; next.z += dz * push;
        } else {
          // dead-center inside a box: push out along the smallest penetration
          const pens = [
            { ax: 'x', v: b.maxX + P.radius - next.x }, { ax: 'x', v: -(next.x - b.minX + P.radius) },
            { ax: 'z', v: b.maxZ + P.radius - next.z }, { ax: 'z', v: -(next.z - b.minZ + P.radius) }
          ].sort((a, b2) => Math.abs(a.v) - Math.abs(b2.v))[0];
          if (pens.ax === 'x') next.x += pens.v; else next.z += pens.v;
        }
        // re-clamp to the rooms after the push
        roomClamp(next);
      }
    }
    return next;
  }

  // ── per-frame update ──
  function update(dt) {
    // movement intent — paused while any menu/form is open, so keys held
    // before a dialog appeared can't keep the player walking behind it
    let mx = 0, mz = 0;
    if (!uiOpen()) {
      if (state.keys.has('f')) mz -= 1;
      if (state.keys.has('b')) mz += 1;
      if (state.keys.has('l')) mx -= 1;
      if (state.keys.has('r')) mx += 1;
      if (state.touchMove) { mx += state.touchMove.x; mz += state.touchMove.y; }
    }

    // normalize + rotate by yaw (forward is −z at yaw 0, matches camera)
    const len = Math.hypot(mx, mz);
    let speed = 0;
    if (len > 0.01) {
      mx /= Math.max(1, len); mz /= Math.max(1, len);
      speed = state.keys.has('run') ? P.runSpeed : P.walkSpeed;
      const s = Math.sin(state.yaw), c = Math.cos(state.yaw);
      const wx = mx * c + mz * s;
      const wz = -mx * s + mz * c;
      const next = state.pos.clone();
      next.x += wx * speed * dt;
      next.z += wz * speed * dt;
      collide(next);
      state.pos.copy(next);
    }

    // joystick from touch (recomputed each frame from the active 'move' touch)
    const moveTouch = [...touches.values()].find(t => t.side === 'move');
    if (moveTouch) {
      const dx = (moveTouch.x - moveTouch.x0) / 55;
      const dy = (moveTouch.y - moveTouch.y0) / 55;
      state.touchMove = { x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) };
    } else if (!moveTouch) state.touchMove = null;

    // head bob
    state.bobPhase += dt * speed * 1.9;
    const bob = len > 0.01 ? Math.sin(state.bobPhase) * 0.018 : 0;

    // zoom easing (frame-rate independent exponential approach)
    if (Math.abs(state.fov - state.fovTarget) > 0.01) {
      state.fov += (state.fovTarget - state.fov) * (1 - Math.exp(-dt * 10));
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
    }

    // climb/descend the theater tier smoothly (a step, not a teleport)
    const fh = floorHeightAt(state.pos.x, state.pos.z);
    state.floorLift = (state.floorLift || 0) + (fh - (state.floorLift || 0)) * Math.min(1, dt * 8);
    syncCamera();
    camera.position.y += bob;
  }

  // Push state.pos/yaw/pitch into the camera NOW — picking (hover/click)
  // calls this before raycasting so a just-moved player aims where they
  // stand, not where the last rendered frame left the camera.
  // Walkable floor height at a spot — 0 everywhere except the theater's
  // raised back tier (real-theater sight lines: enter high, walk down).
  const THL = LAYOUT.theater;   // thZ0 already declared with ROOMS above
  const SL = THL.slope;   // thZ0/thZ1 already declared with ROOMS above
  function floorHeightAt(x, z) {
    if (z <= thZ0 && z >= thZ1 && Math.abs(x) <= THL.w / 2) {
      const run = THL.l - SL.landing;
      const d = thZ0 - SL.landing - z;      // past the landing → slope down
      let h = -Math.max(0, Math.min(SL.drop, d * SL.drop / run));
      // t41: the STAGE under the big screen is a step you can WALK UP ONTO
      const sw = THL.screen.w + 1.1;
      if (Math.abs(x) <= sw / 2 && z <= thZ1 + 1.2) h += 0.3;
      return h;
    }
    return 0;
  }

  function syncCamera() {
    camera.position.set(state.pos.x, P.eyeHeight + (state.floorLift || 0), state.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = state.yaw;
    camera.rotation.x = state.pitch;
    camera.updateMatrixWorld();
  }

  function isTouch() { return 'ontouchstart' in window && navigator.maxTouchPoints > 0; }

  return {
    update,
    syncCamera,
    debugStep(dx, dz) {                 // t48: walk ONE step through collide() —
      const next = { x: state.pos.x + dx, z: state.pos.z + dz };  // the real path tests must use
      collide(next);
      state.pos.x = next.x; state.pos.z = next.z;
      state.floorLift = floorHeightAt(state.pos.x, state.pos.z);
      syncCamera();
    },
    floorHeightAt,
    lock: requestLock,
    unlock: () => document.exitPointerLock?.(),
    state,
    reset() {
      state.yaw = 0; state.pitch = 0;
      state.pos.set(SPAWN.x, P.eyeHeight, SPAWN.z);   // spawn: at the door, facing the TV
      state.fovTarget = state.fovBase;                // zoom back out
    },
    // expose latest crosshair ray origin/dir for hover picking
    ray: raycastCenter
  };
}
