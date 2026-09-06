# 🛠️ Editing Guide — make the store yours

Everything here reloads with a plain page refresh (F5). No build step, no
compiler. The server sends the app's own files with `Cache-Control: no-store`,
so reloads always fetch fresh code. If a browser or proxy ever serves stale
files anyway, run `npm run stamp` (renames every module URL with a `?v=`
version) and restart the server — no cache can resist that. The two places you'll edit 95% of the time:

---

## 1. `public/js/store3d/config.js` — the store blueprint ⭐

Every dimension is in meters, with a comment. The coordinate system:

```
        x →  left/right        y → up        z → front(+)/back(−)
   spawn is at the front door (z ≈ +19.6) facing the far wall / TV (z = −22)
```

| Knob | What it controls |
|---|---|
| `room.w / l / h` | Floor size & ceiling height (signs & lights derive from `h`, so raising it lifts the whole room) |
| `islands.perSide` | Gondola islands per side (4 → eight slim units; cross aisles stay ~1.4 m) |
| `islands.length / width / height` | Island run length / thickness / unit height (1.46 m fits 3 rows & stays see-over) |
| `islands.boards` | Shelf-board heights per face (rows of cases) — island boards are shared by both sides |
| `islands.tipX / tvLane / doorEdge` | Center-aisle half-width / TV-lane depth / door-side clear zone (cross aisle is derived) |
| `wallShelf.boards` | Board heights on the wall shelves (4 rows) |
| `wallSegments / farWallSegments` | Sections per side wall (each gets a sign) / TV-wall runs |
| `TUNING.slotPitch` | **Nominal** case spacing — actual spacing stretches per run so shelves fill end-to-end |
| `TUNING.displayCap` | Max UNIQUE titles that get cover art (extras become "copies"). Lower it on weak GPUs, raise it on gaming PCs |
| `TUNING.tile.w/h` | Poster resolution per case — bigger = crisper up close |
| `TUNING.case.vhs / dvd / cd` | Case dimensions per media type |
| `SUPPORT.url` | Support/projects link copied when you click the entry door / HUD logo ("support this and other projects") |
| `TUNING.player.*` | Walk/run speed, eye height, mouse sensitivity, scroll-zoom range (`zoomMin/Max/Step`) |

**Try it:** set `islands.perSide: 4`, refresh, and watch a 4th pair of islands
appear (signs, colliders, and shelf capacity all recompute automatically).

## 2. `data/config.json` — global store settings

Written by the admin Settings pages, but it's a plain file: stop the server,
edit, restart. Same for `data/db.json` (users + per-user/guest preferences).
Deleting either file resets to defaults (admin is re-seeded from env vars).

## 3. Sorting options — `public/js/store3d/shelves.js`

- `sortItems()` is the per-user arrangement logic.
- `unitLabels()` generates the hanging sign text per shelving unit.
- To add a new sort mode (say, "by director"): add it to `SORT_MODES` in
  `config.js`, add a case in `sortItems()`, a label case in `unitLabels()`,
  and whitelist the id in `server/routes/api.js` (`sanitizeSorting`).

### Shelf spacing, dividers & corners (same file)

- `faceSlotPlan(f)` is the ONE source of truth for how many cases fit on a
  run, at what spacing, and where the divider bays are:
  `spacing = (length − mStart − mEnd) / n`, with `n` chosen so spacing hugs
  `TUNING.slotPitch` (0.217 ≈ widest case 0.205 + 12 mm). Because spacing is
  solved per run, shelves fill **edge-to-edge with cases packed densely** —
  no dead gap at the end, no "missing case" gaps between dividers. Wall runs
  round `n` DOWN (spacing only stretches); islands round to nearest.
- **Seamless segment joins**: each side wall / the TV wall is 3 sign segments
  but ONE continuous piece of shelving — inner segment ends use a **0** case
  margin, so their slot-0/slot-n boundary lines sit exactly on the seam. The
  joined segment's k=0 divider stands ON the seam (both neighbours' bay-edge
  cases nudge to 2 cm from it), and a face joining the next segment skips its
  own k=n panel. No doubled panels, no caseless "empty shelf" where segments
  meet — a seam looks identical to any other divider bay.
- `bayKs` (from the same plan) are the slot boundaries where divider panels
  stand — balanced bays of ~5 cases, both ends closed. `assignItems()` nudges
  the first/last case of each bay inboard just enough to keep 4 mm clear of
  the panel, and wall cases stand square (the rotational "lean" clamp
  resolves to ~0 at this density).
- **Corner clearance**: the far-wall shelf and door flanks stick
  `wallShelf.depth × 0.85 / 2` into the room, so the side-wall runs stop
  `that + 0.10 m` short of the corners (see `computeFaces`) — their cases
  never get buried by the perpendicular furniture.
- **Nothing slices a case from above**: every board/cap height was checked
  against the 0.304 m tallest case standing on the board below it. The
  TV-wall shelf's cap therefore sits at `capH 1.68` (its top board is 1.30;
  cases reach 1.604; the cap's underside is 1.614). If you change board
  heights or case sizes, re-check: `capY − 0.016 ≥ boardY + caseH + 0.004`.
- **Rounded cases with WRAPPED art**: bodies use the vendored three.js
  addon `public/vendor/RoundedBoxGeometry.js`, and the cover art is mapped
  onto the body itself — front = cover, thin sides = titled spine, back =
  mirrored cover (`wrapCaseUVs()` in shelves.js remaps each face's 0..1 UVs
  into the atlas tile; a tiny `onBeforeCompile` patch adds a per-instance
  `uvOff` attribute so one InstancedMesh per case-kind × atlas-page draws
  every copy). Corner radii live in the `cornerR` map (VHS 14 mm, DVD 10 mm,
  CD 6 mm); raise the `2` (segments) to `3` for smoother arcs on fast GPUs.
- **TV video goes through the screen canvas** (`drawVideo()` in tv.js), not
  a raw VideoTexture — a raw GPU video texture briefly samples uninitialised
  memory (a grey rectangle) at stream start/stalls; compositing via the
  canvas makes that artifact impossible and letterboxes non-16:9 video.
  Sign chains are 20-sided cylinders; texture anisotropy is 8.

## 4. Themes & presets — `public/js/ui.js` + `server/lib/store.js`

- `THEME_PRESETS` in ui.js = the one-click preset buttons.
- `defaultConfig().defaults.theme` in store.js = the store-wide default.
- Shelf styles (wood/metal/midnight) live in `SHELF_STYLES` (config.js) and
  are drawn in `textures.js → shelfTexture()`.
- Wall/floor/ceiling surfaces are procedurally drawn in `textures.js` — tweak
  the drawing functions to change carpet speckle density, wall paneling, etc.

## 5. The TV — `public/js/store3d/tv.js`

The TV is the store's playback screen: clicking a case and hitting "Play on the
store TV" calls `tv.playItem(item)`. Drawing routines are all pure canvas:
- `drawStandby()` — the "NOW PLAYING: NOTHING" idle card
- `drawLoop()` — the synthwave attraction loop (admin-selectable idle)
- `drawTitlecard()` — animated card for demo titles
- `drawVisualizer()` — album visualizer (real FFT bars when audio streams)
- TV placement/size: `SCREEN_W` and `CY` near the top of the file.

## 6. Local file grabber — `server/lib/adapters/local.js`

The multi-spot file grabber. `spotsOf()` normalises the config into absolute
roots (legacy single-path configs become one spot automatically); `walk()`
recurses every spot emitting INDIVIDUAL FILES only (video, audio, and print
media indexed as `book` for the coming full-media library — books stay in the
catalogue, off the playable shelves). Keys are `<spotIndex>/<relative path>`,
resolved back with a traversal guard in `streamUrl()`. File extensions live in
the `VIDEO` / `AUDIO` / `BOOK` regexes at the top — add a kind there, and update
`mimeFor`'s map. Files stream off disk with full Range support via
`proxy.js → streamLocalFile()`.

## 7. Media server adapters — `server/lib/adapters/`

Each media-server adapter implements: `test()`, `library()`, `detail()`,
`streamUrl()`, `posterUrl()`. Add-ons (the file grabber, radio, archive,
podcasts) can be slimmer — `library()` plus `streamUrl()` is enough. That's
the whole interface — you could add Emby by copying `jellyfin.js` and
adjusting endpoints, then registering it in `server/lib/library.js`
(`ADAPTERS` or the `ADDONS` stack) and the admin UI's source cards in
`public/js/ui.js` (`panelServer`).

## 8. UI chrome — `public/css/style.css`

CSS custom properties at the top (`--vb-blue`, `--vb-yellow`, …) recolor every
panel, modal and button in one place.

---

### Adding a whole new room feature

General recipe: create `public/js/store3d/yourThing.js`, export a
`buildYourThing(theme)` that returns `{ group, applyTheme }`, add it to the
scene in `scene.js` next to `buildRoom`/`buildTV`, and add any solid furniture
to the collider list in `shelves.js → shelfColliders()` so players can't walk
through it.
