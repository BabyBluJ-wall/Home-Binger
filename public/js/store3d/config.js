// ─────────────────────────────────────────────────────────────────────────────
//  store3d/config.js — EVERY dimension of the store in one place
//  ───────────────────────────────────────────────────────────────────────────
//  ⚙️⚙️⚙️  THIS IS THE #1 FILE TO EDIT  ⚙️⚙️⚙️
//  Change any number below, reload the page, and the store rebuilds itself.
//
//  The room is a classic video-store box:
//      ~40 ft wide × 40 ft deep, ~14 ft ceiling
//  The ENTRY DOOR is centered on the BACK wall (+z). The player spawns just
//  inside it, facing −z, looking straight down the central aisle at the FAR
//  wall, where the big TV hangs above the back shelf.
//
//  Units: numbers are METERS (1 ft ≈ 0.305 m — ft equivalents noted inline).
//  Axes:  x → left/right   y → up   z → door(+)/far wall(−)
// ─────────────────────────────────────────────────────────────────────────────

// t45: audio lives on the JUKEBOX (and later the dance hall) — never on
export const AUDIO_TYPES = ['album', 'radio', 'episode'];   // the store shelves
export const LAYOUT = {
  // The single rectangular sales floor: 12.19 × 12.19 m (40 × 40 ft)
  room: { w: 12.19, l: 12.19, h: 4.27, wallThickness: 0.25 },  // 40×40×14ft; walls are
                       // REAL 0.25 m-thick boxes (not paper planes) — the door
                       // gets a proper reveal and nothing outside bleeds through

  // Front door — centered on the BACK (+z) wall
  door: { width: 2.7, height: 2.3 },               // ~8.9ft wide glass double door

  // ── THE THEATER — a real screening room behind the far (−z) wall ──────────
  // The old store TV is gone: movies play on a PROJECTOR SCREEN in here.
  // You CARRY a case off the shelves, walk it through the doorway, and feed
  // it to the player deck beside the screen. The walkable world is a union
  // of rects (store + door corridor + theater) — see controls.js.
  theater: {
    w: 9.75, l: 10.5, h: 4.27,                    // 32×34.4ft — DEEP room: rows get real
                                             // distance from the screen (was 7.3)
    door: { width: 2.0, height: 2.3 },            // the opening in the far wall
    screen: { w: 6.6, cy: 2.2 },                  // TRUE cinema scale (t40): 6.6×3.71 m 16:9 —
                                             // spans 0.34…4.06 m tall (ceiling 4.27), side
                                             // walls clear; walk the front row = fullscreen
                                             // without ever touching the fullscreen toggle
    slope: { drop: 0.9, landing: 3.9 }            // extra-deep flat entry (booth clear of the doors),
                                             // then a proper stadium rake down to the screen
  },                                            // the floor SLOPES DOWN toward the screen

  // ── THE FRONT WING (t47) — entry hall + dance hall + DJ's library ──────
  // The hall runs the FULL WIDTH of the store front (not beyond it); other
  // rooms will hang off the store's solid side walls later (book room etc).
  hall: { d: 2.6, h: 4.27, streetDoor: { width: 2.4, height: 2.3 } },   // z: +D+T … +D+T+2.6

  // DANCE HALL — on the RIGHT of the store (+x): dance floor, beat-reactive
  // light rig, DJ booth at the back; the DJ's LIBRARY (records) sits behind it
  dance: {
    w: 9.5, l: 15.4, h: 4.27,                    // x: +6.345…+15.845 · z: −6.5…+8.945
    door: { width: 2.0, height: 2.3 },           // opening to the hall (its −x wall)
    boothDoor: { width: 1.2, height: 2.2 }       // behind the booth → DJ's Library
  },
  djlib: { w: 6.5, l: 4.2, h: 4.27 },            // x: +6.345…+12.845 · z: −10.7…−6.5

  // ── Perimeter shelves (continuous runs along the LEFT & RIGHT walls) ──────
  // Depth trimmed front-to-back (0.40 m): wider wall lanes + the boards no
  // longer loom over the cases (cases also sit at the FRONT lip now — see
  // shelves.js). Cases stay visible from across the room.
  wallShelf: { depth: 0.40, height: 2.19, boards: [0.40, 0.85, 1.30, 1.75] }, // ~7.2ft tall, 4 tiers (cap clears tall VHS)

  // Each long side-wall run splits into this many sections, each with its own
  // CATEGORY SIGN mounted on the wall band above the shelf (like a real store)
  wallSegments: 3,

  // ── The sales floor: two long GONDOLA rows, classic open video-store look ──
  // One double-sided shelving run per side, PARALLEL to the center aisle
  // (no more labyrinth — straight sight lines from the door to the TV wall).
  //   · the face toward the CENTER AISLE is a POSTER GALLERY (see signage.js)
  //   · the face toward the WALL LANE is packed with cases
  //   · the end caps hold cases; the door-facing end also gets posters
  islands: {
    perSide: 4,        // islands per side (4 → slim gondolas, 8 in the store)
    length: 1.85,      // run length; keeps the wide wall lane (~6.7ft)
    width: 0.56,       // SLIM double-sided unit — cases stand at each front
                       // lip like the wall shelves, with just spine-room
                       // behind (no deep empty board). Frees a wide cross
                       // aisle (~6ft) between rows.
    height: 1.46,      // taller so 3 rows FIT THE UNIT properly (top case 1.44)
                       // and still under the player's 1.65 eye line — see over!
    boards: [0.30, 0.72, 1.14],          // 3 stocked rows, shared by BOTH sides
    // SEE-OVER END UNITS — the gondolas nearest the FRONT and BACK walls are
    // LOW 2-tier bins (like a real store's low feature ends) so they never
    // wall off the wall shelves when you browse them head-on from the open
    // floor. Set lowEndUnits: false for tall units everywhere.
    lowEndUnits: true,
    lowHeight: 1.16,
    lowBoards: [0.30, 0.76],
    tipX: 1.70,        // center-aisle edge of the runs (center aisle = 2×tipX ≈ 11.1ft)
    tvLane: 1.70,      // walking lane between islands and the TV-wall shelf (~5.6ft)
    doorEdge: 3.90     // door-side island edge → ~2.2m clear entry zone (~7.2ft)
    // (don't edit) derived: wall lane ≈ 6.095 − 0.5 − tipX − length ≈ 2.05 m (~6.7ft)
    // (don't edit) derived: cross aisle ≈ 1.40 m (~4.6ft) — comfy walk, see-over units
  },


};

// ── Support link ─────────────────────────────────────────────────────────────
// Clicking the entry DOOR (in the 3D store) or the logo chip (top-left HUD)
// copies this link to the device's clipboard — "Support this and other
// projects". Point it at your projects / support page.
// ── STORE BRANDING ──────────────────────────────────────────────────────────
// One place to re-brand the whole store. `name` + `tagline` appear on the
// start screen; `network` is the big sign on the wall above the door.
export const STORE = {
  name: 'Home Binger',                  // start-screen store name
  network: 'BluJ Network',              // the big wall sign (above the entry door)
  tagline: 'Your virtual video store'   // start screen + under the wall sign
};

export const SUPPORT = {
  url: 'https://BluJ-Productions.softr.app',
  toast: 'Copied — support this and other projects! 💖'
};

export const TUNING = {
  // Max UNIQUE titles textured for the shelves (extra slots become "copies",
  // like a real rental store). Lower on weak GPUs, raise on gaming PCs.
  displayCap: 1600,   // above the ~987 shelf slots — nothing selected gets clipped

  // Atlas tile layout: each tile holds the COVER (front) + a SPINE strip
  // (side of the case with the title text). Pixels.
  tile: { w: 112, h: 160, coverW: 88, spineW: 24 },
  atlasSize: 2048,

  // Poster image download concurrency
  posterConcurrency: 14,

  // First-person movement
  player: { eyeHeight: 1.65, walkSpeed: 3.4, runSpeed: 6.0, radius: 0.34, lookSensitivity: 0.0023,
            zoomMin: 22, zoomMax: 70, zoomStep: 6 },   // scroll-wheel zoom (FOV degrees)

  // ── The three media case types, sized like REAL rental cases (scaled up
  // just enough to browse). VHS sleeves are TALL and narrow — they tower
  // over the DVDs like on a real shelf; DVD keep cases are wider/slimmer;
  // CD jewels are squat squares. ──
  case: {
    vhs: { w: 0.165, h: 0.335, d: 0.050 },   // tall VHS sleeve (real ≈ 10.2×18.7cm)
    dvd: { w: 0.195, h: 0.300, d: 0.030 },   // DVD keep case (real ≈ 13.5×19cm)
    cd:  { w: 0.205, h: 0.205, d: 0.024 }    // CD jewel case (real 12.4×14.2cm)
  },
  vhsShare: 0.55,   // % of movies shown as VHS sleeves (rest are DVD cases)

  // Slot pitch along a shelf board — NOMINAL ONLY. The real spacing is solved
  // per-run (faceSlotPlan in shelves.js) to fill the shelf end-to-end and sits
  // close to the WIDEST case (CD 0.205) + ~12 mm, so cases stand shoulder-to-
  // shoulder like a real store — no "empty spot" gaps. Divider panels sit on
  // slot boundaries; the first/last case of each bay nudges inboard to keep
  // 4 mm clear of them (see assignItems).
  slotPitch: 0.217,
};

// Shelf style presets — applied to shelf materials (matching server whitelist)
export const SHELF_STYLES = {
  wood:    { label: 'Warm Wood (default)', roughness: 0.75, metal: 0.0 },
  metal:   { label: 'Brushed Metal',       roughness: 0.35, metal: 0.85 },
  midnight:{ label: 'Midnight Laminate',   roughness: 0.55, metal: 0.15 }
};

// Sorting modes offered in Settings → My Shelves (must match server whitelist)
export const SORT_MODES = [
  { id: 'recent',  label: 'Recently Added' },
  { id: 'library', label: 'By Library' },
  { id: 'genre',   label: 'By Genre' },
  { id: 'alpha',   label: 'Alphabetical' },
  { id: 'rating',  label: 'By Rating' },
  { id: 'year',    label: 'By Release Year' },
  { id: 'type',    label: 'By Type (Movies/TV/Music)' }
];
