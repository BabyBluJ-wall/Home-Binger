// ─────────────────────────────────────────────────────────────────────────────
//  store3d/shelves.js — shelf layout, sorting & the actual boxes on shelves
//  ───────────────────────────────────────────────────────────────────────────
//  1. computeFaces()    → every shelving FACE in the 40×30ft room:
//                         · perimeter runs along the left & right walls
//                         · 3 islands per side projecting toward the center
//                         · the far-wall run under the TV
//                         · short flanks either side of the entry door
//  2. sortItems() /
//     assignItems()     → the per-user arrangement, walked slot by slot with
//                         three case types: VHS sleeves, DVD cases, CD jewels
//  3. buildShelfGroup() → GPU-friendly meshes:
//                         · furniture merged into ONE mesh
//                         · accent light strips under island shelf lips
//                         · case bodies × 3 kinds as InstancedMeshes
//                         · covers (front quads) + TITLED SPINES (side quads)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { RoundedBoxGeometry } from '/vendor/RoundedBoxGeometry.js';   // three.js addon, vendored
import { LAYOUT, TUNING, AUDIO_TYPES } from './config.js?v=1788810462055';
import { shelfTexture, hashString } from './textures.js?v=1788810462055';

// ═════════════════════════════════════════════════════════════════════════════
//  PART 1 — where the shelves are
// ═════════════════════════════════════════════════════════════════════════════
// A FACE is one continuous browsable run:
//   start  → world position of the first slot's center-line start (at the shelf)
//   dir    → unit vector walking along the run
//   normal → direction cases FACE (toward the aisle)

// The islands (per side), derived from LAYOUT.islands. Shared by the shelf
// faces, the furniture, the colliders and the poster end caps so they never
// disagree. Islands run ALONG x: from a center-aisle TIP toward the side wall.
export function islandSpecs() {
  const L = LAYOUT, I = L.islands;
  const D = L.room.l / 2;
  const zFirst = -(D - L.wallShelf.depth - I.tvLane) + I.width / 2;  // TV-most island center
  // doorEdge = door-side EDGE of the last island; centers are spaced evenly
  // between zFirst and (doorEdge - width/2)
  const crossAisle = I.perSide > 1
    ? ((I.doorEdge - I.width / 2) - zFirst) / (I.perSide - 1) - I.width
    : 0;
  const specs = [];
  for (let s = 0; s < I.perSide; s++) {
    const cz = zFirst + s * (I.width + crossAisle);
    for (const side of [-1, 1]) {
      specs.push({
        side, cz, index: s + 1,
        unit: `island-${side === -1 ? 'L' : 'R'}${s + 1}`,
        xTip: side * I.tipX,                       // center-aisle end (poster cap)
        xBack: side * (I.tipX + I.length),         // wall-lane end (case cap)
        // The OUTERMOST units (nearest the front & back walls) are LOW
        // see-over bins — everything reads sp.height/sp.boards from here.
        isLowEnd: I.lowEndUnits !== false && (s === 0 || s === I.perSide - 1),
        length: I.length, width: I.width,
        height: (I.lowEndUnits !== false && (s === 0 || s === I.perSide - 1)) ? I.lowHeight : I.height,
        boards: (I.lowEndUnits !== false && (s === 0 || s === I.perSide - 1)) ? I.lowBoards.slice() : I.boards.slice()
      });
    }
  }
  return specs;
}

// How many cases fit on a face and at what exact spacing — ONE source of
// truth shared by the case slots, the shelf dividers and the jitter clamp.
// The pitch STRETCHES (or shrinks a hair) per run so the cases fill the run
// edge-to-edge: no dead "empty spot" at the end of a shelf section.
//   · wall runs only ever STRETCH (pitch ≥ TUNING.slotPitch) so a divider
//     always keeps its clearance in the gap between cases;
//   · islands (no dividers) may shrink slightly to fit one extra case.
export function faceSlotPlan(f) {
  const nominal = TUNING.slotPitch;
  // Outer ends keep a 0.06 case margin; JOINED ends (segment seams) use 0 so
  // the slot-0 / slot-n boundary lines sit exactly ON the seam, where the one
  // shared divider panel stands (bay-edge cases nudge to 2 cm from it).
  const mStart = f.mStart ?? 0.06, mEnd = f.mEnd ?? 0.06;
  const span = f.length - mStart - mEnd;
  const n = Math.max(1, f.kind === 'wall' ? Math.floor(span / nominal) : Math.round(span / nominal));
  // Divider bays: the run splits into balanced groups of ~5 slots. bayKs are
  // the slot BOUNDARIES (0 … n) where divider panels stand — one source of
  // truth shared by the furniture panels AND the case-nudge in assignItems.
  const bays = Math.max(1, Math.round(n / 5));
  const bayKs = Array.from({ length: bays + 1 }, (_, b) => Math.round(n * b / bays));
  return { n, pitch: span / n, mStart, mEnd, bayKs };
}

export function computeFaces() {
  const L = LAYOUT;
  const W = L.room.w / 2, D = L.room.l / 2;
  // Sign heights ride with the ceiling: wall band signs sit high on the wall
  // (0.64 m below the ceiling), hanging gondola signs at ~2/3 height — raise
  // room.h and every sign rises with it, keeping the tall-room proportions.
  const signY = L.room.h - 0.64;          // wall band / far wall / door flanks
  const hangY = L.room.h * 0.656;         // hanging signs over the gondolas
  const faces = [];

  const mkFace = (unit, kind, sx, sz, dx, dz, nx, nz, length, boards, signPos, signRotY, capH) => {
    const face = {
      id: faces.length, unit, kind,
      start: { x: sx, z: sz }, dir: { x: dx, z: dz }, normal: { x: nx, z: nz },
      length, boards, signPos, signRotY,
      capH: capH || (kind === 'island' ? L.islands.height : L.wallShelf.height),
      slots: []
    };
    faces.push(face);
    return face;
  };

  // ── perimeter runs: continuous along the LEFT and RIGHT walls ──────────────
  // Each run splits into wallSegments sections; every section gets a CATEGORY
  // SIGN mounted on the wall band ABOVE the shelf, facing into the room.
  //
  // CORNER CLEARANCE: the far-wall shelf and the door flanks stick ~0.21 m
  // into the room from their own face lines. A side run that ran the full
  // wall would park its first/last cases INSIDE that furniture (buried
  // corners). So each end of a side run pulls back behind the neighbour's
  // protrusion plus a 0.10 m breathing gap.
  const wallBoards = L.wallShelf.boards;
  const protrusion = L.wallShelf.depth * 0.85 / 2;   // how far boards reach into the room
  const cornerClear = protrusion + 0.10;             // + walking/visual gap
  const wallLen = 2 * (D - L.wallShelf.depth - cornerClear);
  for (const side of [-1, 1]) {
    const x = side === -1 ? -W + L.wallShelf.depth : W - L.wallShelf.depth;
    const nx = side === -1 ? 1 : -1;
    const rotY = side === -1 ? Math.PI / 2 : -Math.PI / 2;   // face into the room
    const segLen = wallLen / L.wallSegments;
    for (let i = 0; i < L.wallSegments; i++) {
      const z0 = -wallLen / 2 + i * segLen;
      const f = mkFace(`wall-${side === -1 ? 'L' : 'R'}-${i}`, 'wall',
        x, z0, 0, 1, nx, 0, segLen, wallBoards,
        { x: side * (W - 0.07), y: signY, z: z0 + segLen / 2 }, rotY);
      // SEAMLESS RUNS: segments are furniture placed edge-to-edge. Inner ends
      // use margin 0, so each segment's slot-0/slot-n BOUNDARY LINES land
      // exactly on the seam. The joined segment's k=0 divider stands ON the
      // seam and both neighbours' bay-edge cases nudge to 2 cm from it —
      // the seam looks identical to any other divider bay (no doubled
      // panels, no caseless "empty shelf" where segments meet).
      f.mStart = i === 0 ? 0.06 : 0;
      f.mEnd = i === L.wallSegments - 1 ? 0.06 : 0;
    }
  }

  // ── far wall: the old 3-section run is GONE — that wall now has the
  // doorway into the THEATER (room.js cuts the opening and builds the room;
  // controls.js knows the walkable rects). Music moved to the jukebox.

  // ── back wall flanks either side of the entry door ─────────────────────────
  {
    const z = D - L.wallShelf.depth;
    const flankLen = W - L.door.width / 2 - 0.9;
    mkFace('front-L', 'wall', -W + 0.5, z, 1, 0, 0, -1, flankLen, wallBoards,
      { x: -W + 0.5 + flankLen / 2, y: signY, z: D - 0.07 }, Math.PI);
    mkFace('front-R', 'wall', L.door.width / 2 + 0.4, z, 1, 0, 0, -1, flankLen, wallBoards,
      { x: L.door.width / 2 + 0.4 + flankLen / 2, y: signY, z: D - 0.07 }, Math.PI);
  }

  // ── the islands: true double-sided gondolas projecting toward center ──────
  // Both long sides are stocked with cases (walked tip→back so the aisle end
  // leads). The center-aisle TIP gets a poster (signage.js), not cases; the
  // wall-lane back end cap stays browsable.
  for (const sp of islandSpecs()) {
    // hanging sign front faces the CENTER AISLE (readable, never mirrored)
    const aisleRotY = -sp.side * Math.PI / 2;
    // long face A (faces the −z cross aisle), walked from the tip inward
    mkFace(sp.unit, 'island', sp.xTip, sp.cz - sp.width / 2, sp.side, 0, 0, -1,
      sp.length, sp.boards, { x: (sp.xTip + sp.xBack) / 2, y: hangY, z: sp.cz }, aisleRotY, sp.height);
    // long face B (faces the +z cross aisle)
    mkFace(sp.unit, 'island', sp.xTip, sp.cz + sp.width / 2, sp.side, 0, 0, 1,
      sp.length, sp.boards, { x: (sp.xTip + sp.xBack) / 2, y: hangY, z: sp.cz }, aisleRotY, sp.height);
    // (the wall-lane end cap carries a POSTER too — see signage.js —
    //  mirroring the center-aisle tip, so no case faces are added here)
  }

  // ── individual slots (where a case can stand) ──────────────────────────────
  // Spacing comes from faceSlotPlan() so a run is filled EXACTLY — and the
  // dividers in furnitureGeometries() read the same numbers, guaranteeing
  // they land on boundaries between slots, never through a case.
  for (const f of faces) {
    const plan = faceSlotPlan(f);
    f.nSlots = plan.n; f.slotPitch = plan.pitch; f.bayKs = plan.bayKs;
    for (const boardY of f.boards) {
      for (let i = 0; i < plan.n; i++) {
        f.slots.push({ dist: plan.mStart + plan.pitch * (i + 0.5), boardY, i });
      }
    }
  }
  return faces;
}

// Browsing order for assignment: new releases at the door, islands next
// (door-nearest first), then the far wall, then the long side walls.
export function browseOrder(faces) {
  // New releases at the door flanks, then islands door-nearest first, then the
  // far wall, then the long side walls.
  const rank = (u) => {
    if (u.startsWith('front')) return 0;
    if (u.startsWith('island')) {
      const n = parseInt(u.slice(-1)) || 1;      // island index 1 = TV-most
      return 10 + (10 - n);                      // higher index (door-side) first
    }
    if (u.startsWith('far')) return 100;
    return 200;
  };
  return [...faces].sort((a, b) => rank(a.unit) - rank(b.unit) || a.id - b.id);
}

// AABB colliders for the player (whole furniture blocks, room-shaped)
export function shelfColliders(faces) {
  const L = LAYOUT;
  const W = L.room.w / 2, D = L.room.l / 2;
  const boxes = [];
  const add = (minX, maxX, minZ, maxZ) => boxes.push({ minX, maxX, minZ, maxZ });

  // perimeter shelves — side runs end where their furniture ends (they are
  // trimmed at the corners to clear the far-wall shelf & door flanks)
  const sideZ = D - L.wallShelf.depth - (L.wallShelf.depth * 0.85 / 2 + 0.10);
  add(-W, -W + L.wallShelf.depth, -sideZ, sideZ);
  add(W - L.wallShelf.depth, W, -sideZ, sideZ);
  // door-wall flanks
  add(-W, -L.door.width / 2 - 0.35, D - L.wallShelf.depth, D);
  add(L.door.width / 2 + 0.35, W, D - L.wallShelf.depth, D);

  // islands
  for (const sp of islandSpecs()) {
    add(Math.min(sp.xTip, sp.xBack) - 0.03, Math.max(sp.xTip, sp.xBack) + 0.03,
        sp.cz - sp.width / 2 - 0.03, sp.cz + sp.width / 2 + 0.03);
  }

  return boxes;
}

// ═════════════════════════════════════════════════════════════════════════════
//  PART 2 — per-user arrangement (sorting + assignment)
// ═════════════════════════════════════════════════════════════════════════════
export function sortItems(items, sorting) {
  const s = [...items];
  const dir = sorting.dir === 'asc' ? 1 : -1;
  const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true });
  switch (sorting.mode) {
    case 'alpha':  s.sort((a, b) => dir * byTitle(a, b)); break;
    case 'rating': s.sort((a, b) => dir * ((a.rating || 0) - (b.rating || 0)) || byTitle(a, b)); break;
    case 'year':   s.sort((a, b) => dir * ((a.year || 0) - (b.year || 0)) || byTitle(a, b)); break;
    case 'genre': {
      const groups = new Map();
      for (const it of s) {
        const g = (it.genres && it.genres[0]) || 'Other';
        (groups.get(g) ?? groups.set(g, []).get(g)).push(it);
      }
      const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
      return ordered.flatMap(([, list]) => list.sort(byTitle));
    }
    case 'type': {
      const order = { live: 0, movie: 1, show: 2, musicvideo: 3, album: 4 };
      s.sort((a, b) => dir * ((order[a.type] ?? 9) - (order[b.type] ?? 9)) || byTitle(a, b));
      return s;
    }
    // BY LIBRARY — group by the media server's OWN library name (Movies,
    // TV Shows, Music, Audiobooks…), so sections are labeled and shelved
    // exactly like they are in Plex/Jellyfin.
    case 'library': {
      const libName = (it) => it.sectionTitle ||
        ({ movie: 'Movies', show: 'TV Series', musicvideo: 'Music Videos', album: 'Music', live: 'Live TV' }[it.type] || 'Media');
      const groups = new Map();
      for (const it of s) {
        const k = libName(it);
        (groups.get(k) ?? groups.set(k, []).get(k)).push(it);
      }
      const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
      return ordered.flatMap(([, list]) => list.sort(byTitle));
    }
    case 'recent':
    default: s.sort((a, b) => dir * ((a.addedAt || 0) - (b.addedAt || 0)) || byTitle(a, b)); break;
  }
  return s;
}

// Which physical case does an item live in? (three visually distinct types)
function caseKindFor(item) {
  if (item.type === 'album' || item.type === 'episode') return 'cd';
  if (item.type === 'live' || item.type === 'radio') return 'vhs';   // channels/stations ride as VHS 'channel tapes'
  return (hashString(item.id) % 100) < TUNING.vhsShare * 100 ? 'vhs' : 'dvd';
}

// Fill every slot in browsing order with the sorted catalogue (cycling the
// list — duplicate copies, just like a real rental store).
//
// SHELF MAP: `assignment` is { unitId → sectionKey } from Admin → Shelf Map.
// A mapped unit stocks ONLY its section (cycling copies if the section is
// smaller than the unit). Sections mapped somewhere are pulled out of the
// general pool so they don't double-shelve; unmapped units and mappings to
// empty/missing sections keep automatic mixed stock.
export function assignItems(faces, items, sorting, assignment, unitPages) {
  const ordered = sortItems(items.filter(it => !AUDIO_TYPES.includes(it.type)), sorting);   // t45: audio = jukebox-only
  const capped = ordered.slice(0, TUNING.displayCap);
  const placements = [];
  const unitItems = new Map();

  const secKey = (it) => it.sectionId || it.sectionTitle || it.type;
  const pools = new Map();                 // sectionKey → items (in shelf order)
  const sectionNames = new Map();
  for (const it of capped) {
    const k = secKey(it);
    if (!pools.has(k)) pools.set(k, []);
    pools.get(k).push(it);
    if (!sectionNames.has(k)) sectionNames.set(k, it.sectionTitle || it.type || 'Media');
  }
  const assignedAway = new Set(Object.values(assignment || {}).filter(k => pools.has(k)));
  const general = capped.filter(it => !assignedAway.has(secKey(it)));
  // WINDOWED PAGING: a unit shows a WINDOW into its pool (page × unit-slots).
  // Default pages AUTO-STAGGER — consecutive units on the same category keep
  // showing different items (no repeat displays) — and the HUD pager lets a
  // visitor flip any shelf forward/back through the rest of the category.
  const slotsPerUnit = new Map();
  for (const face of browseOrder(faces))
    slotsPerUnit.set(face.unit, (slotsPerUnit.get(face.unit) || 0) + face.slots.length);
  const unitsSeen = new Map();             // poolKey → units already stocked from it
  const unitCounter = new Map();           // slot index within the current unit
  const unitPaging = {};                   // unit → { page, pages, total, pool } (for the HUD)
  const bumpUnitsSeen = (unit) => {
    const poolKey = assignment?.[unit] && pools.has(assignment[unit]) ? assignment[unit] : null;
    const k = poolKey || '*';
    unitsSeen.set(k, (unitsSeen.get(k) || 0) + 1);
  };
  const take = (poolKey, unit) => {
    const pool = poolKey && pools.has(poolKey) ? pools.get(poolKey) : general;
    if (!pool.length) return null;
    const U = slotsPerUnit.get(unit) || 1;
    const auto = unitsSeen.get(poolKey || '*') || 0;
    const manual = unitPages && Number.isFinite(unitPages[unit]);
    const page = manual ? unitPages[unit] : auto;
    const i = (page * U + (unitCounter.get(unit) || 0)) % pool.length;
    const pages = Math.max(1, Math.ceil(pool.length / U));
    unitPaging[unit] = { page: ((page % pages) + pages) % pages, raw: page, pages, total: pool.length, pool: poolKey || null };
    return pool[i];
  };

  let lastUnit = null;
  for (const face of browseOrder(faces)) {
    if (!unitItems.has(face.unit)) unitItems.set(face.unit, []);
    const unitPool = assignment?.[face.unit] || null;
    if (face.unit !== lastUnit && lastUnit !== null) bumpUnitsSeen(lastUnit);
    lastUnit = face.unit;
    for (const slot of face.slots) {
      const item = take(unitPool, face.unit);
      unitCounter.set(face.unit, (unitCounter.get(face.unit) || 0) + 1);
      if (!item) { placements.push(null); continue; }
      const kind = caseKindFor(item);
      const size = TUNING.case[kind];
      // Cases pack SHOULDER-TO-SHOULDER (pitch hugs the widest case), so the
      // first/last case of each divider bay nudges inboard just enough to
      // keep 4 mm clear of the divider panel. Islands have no dividers.
      let dist = slot.dist;
      if (face.kind === 'wall' && face.bayKs) {
        const ks = face.bayKs;
        for (let b = 0; b < ks.length - 1; b++) {
          if (slot.i < ks[b] || slot.i >= ks[b + 1]) continue;
          const leftEdge = slot.i === ks[b], rightEdge = slot.i === ks[b + 1] - 1;
          if (leftEdge || rightEdge) {
            const need = 0.016 + 0.004 + size.w / 2;   // divider half + safety + case half
            dist += Math.max(0, need - face.slotPitch / 2) * (leftEdge ? 1 : -1);
          }
          break;
        }
      }
      // island cases sit ON the shared boards (front flush with the unit edge);
      // wall cases stand proud of the wall unit's face
      // Wall cases stand at the FRONT LIP of the board (2 cm behind the edge).
      // GONDOLA cases sit toward the BACK of their slim board (11 cm recessed
      // behind the face) — real gondola style: a browsable lip in front, the
      // boxes standing deeper on the shelf.
      const off = face.kind === 'island' ? -(0.11 + size.d / 2)
        : LAYOUT.wallShelf.depth * 0.85 / 2 - 0.02 - size.d / 2;
      const px = face.start.x + face.dir.x * dist + face.normal.x * off;
      const pz = face.start.z + face.dir.z * dist + face.normal.z * off;
      const py = slot.boardY + size.h / 2 + 0.004;
      const rotY = Math.atan2(face.normal.x, face.normal.z);
      // Tiny rotational lean for realism (islands only in practice): with the
      // dense shoulder-to-shoulder packing the clamp resolves to ~0 on wall
      // runs — square rows — while island cases keep a small natural sway.
      const halfW = size.w / 2;
      const maxOff = Math.max(0, face.slotPitch / 2 - halfW - (face.kind === 'wall' ? 0.02 : 0.004));
      const raw = ((hashString(item.id + slot.dist) % 100) / 100 - 0.5) * 0.05;
      const jitter = Math.max(-maxOff, Math.min(maxOff, raw));
      placements.push({
        face, slot, item, kind, size,
        pos: new THREE.Vector3(px, py, pz),
        rotY: rotY + jitter
      });
      unitItems.get(face.unit).push(item);
    }
  }
  if (lastUnit !== null) bumpUnitsSeen(lastUnit);
  return { placements, labels: unitLabels(unitItems, sorting, assignment, sectionNames), unitPaging };
}

function unitLabels(unitItems, sorting, assignment, sectionNames) {
  const labels = new Map();
  for (const [unit, list] of unitItems) {
    if (!list.length) { labels.set(unit, 'COMING SOON'); continue; }
    // Shelf Map wins: the unit's sign is the placed section's real name
    const want = assignment?.[unit];
    if (want && sectionNames?.has(want) && list.some(it => (it.sectionId || it.sectionTitle || it.type) === want)) {
      labels.set(unit, String(sectionNames.get(want)).toUpperCase());
      continue;
    }
    switch (sorting.mode) {
      case 'genre': {
        const counts = new Map();
        for (const it of list) {
          const g = (it.genres && it.genres[0]) || 'Other';
          counts.set(g, (counts.get(g) || 0) + 1);
        }
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        labels.set(unit, top.length > 1 && top[1][1] > list.length * 0.25
          ? `${top[0][0]} · ${top[1][0]}` : top[0][0]);
        break;
      }
      case 'alpha': {
        const first = list[0].title[0].toUpperCase(), last = list[list.length - 1].title[0].toUpperCase();
        labels.set(unit, first === last ? first : `${first} – ${last}`);
        break;
      }
      case 'rating': {
        const max = Math.max(...list.map(i => i.rating || 0)).toFixed(1);
        const min = Math.min(...list.map(i => i.rating || 10)).toFixed(1);
        labels.set(unit, max === min ? `★ ${max}` : `★ ${min} – ${max}`);
        break;
      }
      case 'year': {
        const ys = list.map(i => i.year || 0).filter(Boolean);
        if (!ys.length) { labels.set(unit, 'THE LIBRARY'); break; }
        const maxY = Math.max(...ys), minY = Math.min(...ys);
        labels.set(unit, maxY === minY ? `${minY}` : `${minY} – ${maxY}`);
        break;
      }
      case 'library': {
        // one section per library, labeled with the library's REAL name
        // (falls back to media-type names for the built-in demo catalogue)
        const names = { movie: 'Movies', show: 'TV Series', musicvideo: 'Music Videos', album: 'Music', live: 'Live TV' };
        const countsL = new Map();
        for (const it of list) {
          const k = it.sectionTitle || names[it.type] || 'Media';
          countsL.set(k, (countsL.get(k) || 0) + 1);
        }
        labels.set(unit, [...countsL.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])[0] || 'Media');
        break;
      }
      case 'type': {
        // label by the LIBRARY'S REAL NAME (a Plex "Audiobooks" library that
        // Plex types as movies reads AUDIOBOOKS here — not "Movies")
        const names = { movie: 'Movies', show: 'TV Series', musicvideo: 'Music Videos', album: 'Music', live: 'Live TV' };
        const bySection = new Map();
        for (const it of list) {
          const k = it.sectionTitle || names[it.type] || 'Media';
          bySection.set(k, (bySection.get(k) || 0) + 1);
        }
        const keys = [...bySection.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
        labels.set(unit, keys.slice(0, 2).join(' · '));
        break;
      }
      default: { // recent → how-new is this section
        const idx = [...unitItems.keys()].indexOf(unit);
        labels.set(unit, idx < 2 ? 'NEW RELEASES' : idx < 5 ? 'RECENT ADDITIONS' : idx < 8 ? 'NEWER TITLES' : 'THE LIBRARY');
      }
    }
  }
  return labels;
}

// ═════════════════════════════════════════════════════════════════════════════
//  PART 3 — meshes
// ═════════════════════════════════════════════════════════════════════════════

// Merge many boxes into one BufferGeometry (one draw call for all furniture).
function mergeBoxes(boxes) {
  let vCount = 0, iCount = 0;
  const geos = boxes.map(b => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    const m = new THREE.Matrix4().makeRotationY(b.ry || 0).setPosition(b.x, b.y, b.z);
    g.applyMatrix4(m);
    vCount += g.attributes.position.count; iCount += g.index.count;
    return g;
  });
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new (vCount > 65535 ? Uint32Array : Uint16Array)(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// All shelf furniture + accent light strips.
// Wall runs are built per face; islands are built as TRUE double-sided
// gondola units: full-width shared boards (cases stand on both sides), a
// center spine, and end panels — one solid piece of furniture per island.
function furnitureGeometries(faces) {
  const L = LAYOUT;
  const boxes = [];
  const strips = [];
  const panelT = 0.032;

  // ── wall runs (per face, single-sided) ──
  for (const f of faces) {
    if (f.kind !== 'wall') continue;
    const H = f.capH;
    const D = L.wallShelf.depth * 0.85;
    const dirX = f.dir.x, dirZ = f.dir.z;
    const at = (i) => ({ x: f.start.x + dirX * i, z: f.start.z + dirZ * i });
    const boardYs = [...f.boards, H - 0.05];   // boards + top cap

    // Uprights/dividers on the BAY BOUNDARIES from faceSlotPlan() — the same
    // plan the cases were placed with (assignItems nudges bay-edge cases
    // inboard to clear these panels), so they land exactly between slots.
    // A face whose far end JOINS the next segment (mEnd 0) skips its k=n
    // panel — the next segment's k=0 panel stands ON the seam instead, so
    // seams never get doubled panels.
    const pitch = f.slotPitch, m0 = f.mStart ?? 0.06;
    const joinedEnd = (f.mEnd ?? 0.06) === 0;
    for (const k of (f.bayKs || [])) {
      if (k === f.nSlots && joinedEnd) continue;
      const p = at(m0 + pitch * k);
      boxes.push({ w: dirX ? panelT : D, h: H, d: dirZ ? panelT : D, x: p.x, y: H / 2, z: p.z });
    }
    // FLAT ENDS: boards, base and back panel stop at the END CAPS' outer
    // faces (2 mm shy) so nothing sticks out past the end upright — the run
    // ends flush. Ends that JOIN the next segment (margin 0) still reach
    // exactly to the seam so continuous runs stay seamless.
    const mEnd = f.mEnd ?? 0.06;
    const s0 = m0 === 0 ? 0 : m0 - panelT / 2 - 0.002;
    const s1 = mEnd === 0 ? f.length : f.length - mEnd + panelT / 2 - 0.002;
    const runLen = s1 - s0;
    const runMid = at((s0 + s1) / 2);
    for (const by of boardYs) {
      boxes.push({ w: dirX ? runLen : D, h: panelT, d: dirZ ? runLen : D, x: runMid.x, y: by, z: runMid.z });
    }
    boxes.push({ w: dirX ? runLen : panelT, h: 0.09, d: dirZ ? runLen : panelT,
      x: runMid.x, y: 0.045, z: runMid.z });
    const backOff = D / 2 + panelT;
    boxes.push({ w: dirX ? runLen : panelT, h: H - 0.08, d: dirZ ? runLen : panelT,
      x: runMid.x - f.normal.x * backOff, y: (H - 0.08) / 2 + 0.09, z: runMid.z - f.normal.z * backOff });
  }

  // ── island gondolas (one solid double-sided unit each) ──
  for (const sp of islandSpecs()) {
    const H = sp.height, Wd = sp.width;
    const cx = (sp.xTip + sp.xBack) / 2;
    const Len = Math.abs(sp.xBack - sp.xTip);
    // end panels (the tip panel is the poster board; the back panel closes the unit)
    boxes.push({ w: panelT, h: H, d: Wd, x: sp.xTip, y: H / 2, z: sp.cz });
    boxes.push({ w: panelT, h: H, d: Wd, x: sp.xBack, y: H / 2, z: sp.cz });
    // center spine — what makes it a real double-sided unit (no see-through)
    boxes.push({ w: Len, h: H - 0.1, d: panelT, x: cx, y: (H - 0.1) / 2 + 0.1, z: sp.cz });
    // SHARED boards: one full-width board per tier, cases stand on BOTH sides.
    // (No top-cap board — an empty third shelf lip read as an extra row.)
    for (const by of sp.boards) {
      boxes.push({ w: Len, h: panelT, d: Wd, x: cx, y: by, z: sp.cz });
    }
    // base
    boxes.push({ w: Len, h: 0.1, d: Wd, x: cx, y: 0.05, z: sp.cz });
  }

  // ── accent light strips under every browsing board lip ──
  for (const f of faces) {
    const dirX = f.dir.x, dirZ = f.dir.z;
    const off = f.kind === 'island' ? 0.02 : L.wallShelf.depth * 0.85 / 2 - 0.03;
    const mid = { x: f.start.x + dirX * f.length / 2, z: f.start.z + dirZ * f.length / 2 };
    for (const by of f.boards) {
      strips.push({ w: dirX ? f.length - 0.12 : 0.018, h: 0.014, d: dirZ ? f.length - 0.12 : 0.018,
        x: mid.x + f.normal.x * off, y: by - 0.026, z: mid.z + f.normal.z * off });
    }
  }
  return { furniture: mergeBoxes(boxes), strips: mergeBoxes(strips) };
}

// Build everything for the current assignment. Returns a group + lookup API.
export function buildShelfGroup(faces, assignment, atlases, theme) {
  const group = new THREE.Group();
  group.name = 'shelves';

  // ── furniture (one mesh) + accent strips (one emissive mesh) ──
  const { furniture, strips } = furnitureGeometries(faces);
  const shelfMat = new THREE.MeshStandardMaterial({
    map: shelfTexture(theme.shelf, theme.style),
    roughness: 0.75, metalness: 0.05
  });
  group.add(new THREE.Mesh(furniture, shelfMat));

  const stripMat = new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false });
  group.add(new THREE.Mesh(strips, stripMat));

  // ── case bodies: WRAPPED rounded boxes ──────────────────────────────────
  // The box art is mapped directly ONTO the rounded body — front COVER, the
  // titled SPINE strip on both thin sides, a mirrored cover on the back —
  // so the graphic truly WRAPS the case (this is what the extra polygons
  // from the rounded geometry are for). One InstancedMesh per
  // (case kind × atlas page); each instance carries a `uvOff` attribute
  // (its tile origin) that a tiny shader patch adds to the map UVs.
  const cornerR = { vhs: 0.014, dvd: 0.010, cd: 0.006 };   // corner rounding (m)
  const A = TUNING.atlasSize, Tt = TUNING.tile;
  const CW = Tt.coverW / A, SW = Tt.spineW / A, CHh = Tt.h / A, PAD = 0.0006;

  // Remap each face's 0..1 UVs onto this tile's regions (tile-local; the
  // per-instance uvOff then translates everything into the right atlas
  // slot). BoxGeometry group order: +x, −x, +y, −y, +z, −z.
  //   thin sides (±x) = SPINE · top/bottom (±y) = spine color band
  //   front (+z) = COVER · back (−z) = mirrored cover (wrap-around look)
  function wrapCaseUVs(geo) {
    const uv = geo.attributes.uv;
    const spineU = u => CW + PAD + u * (SW - 2 * PAD);
    const coverU = u => PAD + u * (CW - 2 * PAD);
    const mirrorU = u => (CW - PAD) - u * (CW - 2 * PAD);
    const fullV = v => PAD + v * (CHh - 2 * PAD);
    const bandV = v => CHh * 0.35 + v * CHh * 0.3;
    const plans = [
      [spineU, fullV], [spineU, fullV], [spineU, bandV], [spineU, bandV],
      [coverU, fullV], [mirrorU, fullV]
    ];
    geo.groups.forEach((grp, gi) => {
      const [fu, fv] = plans[gi];
      for (let i = grp.start; i < grp.start + grp.count; i++) {
        uv.setXY(i, fu(uv.getX(i)), fv(uv.getY(i)));
      }
    });
    return geo;
  }

  const bodyGeoBase = {};      // wrapped UV template per kind (cloned per page)
  for (const kind of ['vhs', 'dvd', 'cd']) {
    const c = TUNING.case[kind];
    bodyGeoBase[kind] = wrapCaseUVs(new RoundedBoxGeometry(c.w, c.h, c.d, 2, cornerR[kind]));
  }

  const lookup = new Map();    // mesh → placements (hover/click support)
  const bodyMeshes = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const scale = new THREE.Vector3(1, 1, 1);

  for (const kind of ['vhs', 'dvd', 'cd']) {
    const list = assignment.placements.filter(p => p && p.kind === kind);
    const byPage = new Map();                      // atlas page → placements
    for (const pl of list) {
      const slot = atlases.slots.get(pl.item?.id);
      if (!slot) continue;
      if (!byPage.has(slot.page)) byPage.set(slot.page, []);
      byPage.get(slot.page).push(pl);
    }
    for (const [page, plist] of byPage) {
      const geo = bodyGeoBase[kind].clone();
      const off = new Float32Array(plist.length * 2);   // tile origins (uvOff)
      plist.forEach((pl, i) => {
        const sl = atlases.slots.get(pl.item.id);
        off[i * 2] = sl.u; off[i * 2 + 1] = sl.v;
      });
      geo.setAttribute('uvOff', new THREE.InstancedBufferAttribute(off, 2));
      const mat = new THREE.MeshStandardMaterial({
        map: atlases.textures[page],      // art is LIT like a real box now
        roughness: 0.52, metalness: 0.05
      });
      // tiny shader patch: shift this instance's map UVs to its atlas tile
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', 'attribute vec2 uvOff;\n#include <common>')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n\tvMapUv += uvOff;\n#endif');
      };
      const mesh = new THREE.InstancedMesh(geo, mat, plist.length);
      plist.forEach((pl, i) => {
        e.set(0, pl.rotY, 0); q.setFromEuler(e);
        m.compose(pl.pos, q, scale);      // geometry is already case-sized
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
      bodyMeshes.push(mesh);
      lookup.set(mesh, plist);
    }
  }
  // (real artwork streaming in updates the atlas canvas → every wrapped
  //  case refreshes automatically; no per-instance repaint needed anymore)

  return {
    group,
    // raycast helper: which placement is under the cursor?
    pickAt(intersection) {
      const list = lookup.get(intersection.object);
      return (list && intersection.instanceId !== undefined)
        ? (list[intersection.instanceId] || null) : null;
    },
    raycastTargets: bodyMeshes,
    applyTheme(newTheme) {
      shelfMat.map?.dispose();
      shelfMat.map = shelfTexture(newTheme.shelf, newTheme.style);
      shelfMat.needsUpdate = true;
      stripMat.color.set(newTheme.accent);
    },
    dispose() {
      atlases.onTileUpdate = null;
      shelfMat.map?.dispose();
      group.traverse(o => {
        o.geometry?.dispose?.();        // case geometries (cloned per page)
        if (o.material && o.material !== shelfMat && o.material !== stripMat) {
          // dispose the case materials but NOT their map — atlas textures
          // are shared with the next build and must survive
          o.material.dispose();
        }
      });
      shelfMat.dispose(); stripMat.dispose();
      for (const kind of ['vhs', 'dvd', 'cd']) bodyGeoBase[kind]?.dispose();
    }
  };
}
