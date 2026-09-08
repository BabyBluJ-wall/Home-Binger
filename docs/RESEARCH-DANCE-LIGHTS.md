> **STATUS: SHIPPED 2026-09-08 (t86).** Energy retune + cone fix + real ball + per-person prefs — all in. Kept for the reasoning.

# 💡 RESEARCH — Dance hall lights session (tester items 7–8)

*Research doc, 2026-09-08 — implemented the same day (t86).*

---

## What the owner asked for

1. **Adjustable lighting** — "so the lights actually move to the music"
2. **Spotlights flipped** — narrow at the ceiling (where they come from),
   larger where they shine (the floor). "Currently inverted."
3. **A working, adjustable disco ball**

## What the code says today (dance.js)

The surprise: **the rig is already music-reactive** (t54/t59). What's
missing is *user control*, one geometric fix, and a real mirror ball.

### Already true (verify with the owner before building)
- 4 moving-head beam fixtures on pivots with **4 beat-locked patterns**
  (sweep · chase · strobe · build-&-drop), eased motion capped at
  2.4 rad/s like real fixtures, punch intensities driven by bass/mid/
  energy levels, deterministic strobe (no random jitter).
- Wall washes ride bass/mid; ambient rides energy; the 14 LED bars pulse
  per band and ride the song's hue; speaker accent rings pulse with bass;
  the library sign glows with mids; the 8×8 floor tiles pulse with bass.
- **The whole rig sleeps at 5% when nothing plays** (`rigLevel = live ? 1 :
  0.05`) — it only wakes when the DJ booth (or jukebox override) is live
  *in that room*. If the owner tested with music on the store TV, the
  dance hall stayed asleep → "lights don't move." Likely the REAL bug
  behind item 1: not "not reactive" but "not reacting to the music I was
  playing." Candidate fix: the dance rig should also listen to whatever
  the store TV/jukebox is playing when the listener is IN the dance hall
  (or at least expose a "lights demo/manual" mode).

### Bug confirmed — the spotlight cones are inverted
`ConeGeometry(0.55, 6.2, …)` + `rotation.x = Math.PI`:
- ConeGeometry's apex is UP by default → rotating by π points the apex
  DOWN → **narrow at the floor, wide at the ceiling. Backwards.**
- Fix (one line): drop the π rotation and keep `position.y = -3.1` so the
  cone hangs below the pivot — apex at the fixture (narrow at ceiling),
  base at the floor (wide where it shines). Optionally also flare the
  cone (radius 0.55 → ~1.1, length 6.2 → room height) for a real
  spotlight spread.
- Second finding: the "spots" are **PointLights, not SpotLights** — they
  light everything nearby instead of throwing a beam. Upgrading to
  `THREE.SpotLight` with a `target` at the floor under each pivot gives
  true directional pools that MATCH the visible cones (angle ≈ cone
  angle, penumbra ~0.5). The one existing SpotLight (the DJ spot, t54)
  proves the pattern already works in this scene.

### The "disco ball" is a static chrome sphere
`SphereGeometry(0.42, 18, 14)` + metallic material + one white PointLight.
No facets, no rotation, no light speckles (the "speckles" comment refers
to a particle field removed in t54). Nothing drives it.

## The build plan (proposed)

**A. Fix the cones** (the one-liner above) + optional SpotLight upgrade.

**B. Real mirror ball:**
- Geometry: `IcosahedronGeometry(0.42, 2)` (or low-seg sphere) with
  `flatShading: true`, metalness 1, roughness ~0.05 → visible facets.
- Slow rotation: `ball.rotation.y += dt * speed` (speed adjustable; ~0.3
  rad/s default; faster with `lv.mid` if reactive mode is on).
- **The light show** (the part people actually mean by "working"):
  ~60–120 small additive-blend dot sprites ("glints") parented to an
  invisible sphere at the ball, each a tiny plane facing outward; as the
  ball rotates, glints sweep walls/floor/ceiling. Cheap version: one
  `Points` cloud with a radial-gradient texture, positions rotated by the
  ball's rotation matrix, colors from the current beam hue. Cost: trivial
  (one draw call) — fits the perf doctrine.
- A dedicated white SpotLight aimed at the ball (real mirror balls are
  lit by a pin spot, not ambient) → glints get brighter when the pin
  spot's intensity is up.

**C. The adjustable part — a Lights panel in the DJ menu** (natural home;
the DJ already owns that room):
- **Reactivity**: Off / Ambient / Full (maps to rigLevel 0.05 / 0.4 / 1)
- **Pattern**: Auto-cycle / Sweep / Chase / Strobe / Build&drop
- **Intensity** slider (master multiplier on rig + washes + ball glints)
- **Speed** slider (pattern tempo multiplier, 0.5–2×)
- **Ball**: spin speed slider + brightness slider + on/off
- Defaults chosen so the room looks exactly like today with zero touches.
- Storage: per-user prefs (`prefs.dance = {...}`), same as theme/sorting;
  admin lock rides the existing policies system if ever needed.

**D. Wire the wake-up** (the likely real complaint): dance rig listens to
the store TV/jukebox too when the listener is in the dance wing, or a
"Lights: manual/demo" toggle so the rig dances even in silence.

## Effort & risk

~1 focused session. Risks: perf on low-end (keep glints to one draw call;
cap SpotLight count — 4 fixture spots + 1 pin spot is fine); the t54/t59
suite checks assert current idle/live behavior — the lights panel must
default to today's numbers so checks stay green (or get updated
deliberately in the same session).
