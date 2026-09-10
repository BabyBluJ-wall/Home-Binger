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

---

# 💡 RESEARCH — Movement wave 2: "the lights need to move more" (2026-09-10)

> **STATUS: BUILT 2026-09-10 (t109) — the whole menu, suite 102/102 ×2.**
> Circle · Figure-8 · Breath · Stadium arc · Fan · Snake · All-eyes +
> Sweep/Spread knobs + kick flare, all beat-grid-locked. Kept for the
> reasoning.

*Owner: "Each light can go on an x y axis and make a circle using the x y
axis. I dont want the whole rig rotating I want the lights to point and
make a circle where its pointing." + "research how lights in light shows
move more." Not yet implemented — this is the menu for the next update.*

## What the rig does today (t103/t95)

Each of the 10 fixtures already has its own pan/tilt pivot
(`pivot.rotation.y` = pan, `.x` = tilt) — but motion is **per-beat pose
eases**: every beat picks a new pose and the head glides there. Subtle
glides, no continuous movement. The owner wants **continuous, big,
visible sweeps** — heads actively drawing shapes, rig never rotating
(the truss is bolted since t103 and stays bolted).

## What the pros do (researched 2026-09-10)

**The circle recipe** (High End Systems / ETC community forum — the
industry-standard answer): put a sine on pan and a cosine on tilt (90°
phase offset) → the beam tip draws a circle. Two real-world details:
- **Tilt the head to ~45° first** — from straight-ahead "home" the same
  math reads as a figure-8, not a circle.
- **Keep the circle modest (~20°)** — oversize circles read sloppy.
- Advanced variant (Wikipedia, intelligent lighting): one axis draws
  the circle while the other slowly changes the **diameter** — the
  circle breathes. Noted as the smoothest-looking effect.

**Effect vocabulary** (DMXDesktop's effect engine — mirrors what DMX
consoles ship): Move effects = **Circle, Figure of 8, Arc (with Fan),
Triangle**; parameters = **Phase** (per-fixture timing offset) and
**Fan** (angular spread across fixtures). Chase family = **Chase,
Wave** (smooth rolling chase), variants L→R / In→Out / Out→In.
**Spread** staggers any effect across fixtures so it cascades.
**VU-Meter** = intensity rides the music level.

**SoundSwitch / Engine Lighting** (the DJ-software gold standard):
autoscripted, BPM- and PHRASE-synced shows (build vs drop treated
differently). Validates our beat-lock + Build&Drop; phrase awareness
(e.g. calmer shapes during breakdowns) is a future refinement.

**Haze physics**: beams "come alive" in haze — our visible cones ARE
our haze; fatter cones = wash look, thinner = beam look (a "zoom"
setting maps to this).

## The menu (proposed for the next update)

**A. Continuous shapes per head** (his core ask + the shape family
from the same two motors — Program entries):
- **Circle** — sin/cos pan+tilt, 45° tilt bias, size-controlled
- **Figure-8** — pan at 2× tilt frequency (the accidental classic)
- **Breath** — circle whose diameter swells/shrinks (pan circles,
  tilt ramps) — the "smoothest" per Wikipedia
- **Stadium arc** — big slow fanned arcs across the room
**B. Group moves** (all 10 as one instrument):
- **Fan** — peacock spread ↔ converge on the beat
- **Snake / wave** — phase-offset ripple around the truss
- **All-eyes** — converge to one floor point, burst on the drop
**C. Beat-driven movement (never brightness)** — beams dip toward the
floor on the kick, rise between; movement energy rides the VU.
**D. New settings in the booth lights strip**: **Sweep size** (circle
diameter) + **Spread** (how staggered the 10 heads are). Program list
gains the new shapes; Auto keeps rotating. Doctrine intact: movement
full-3D, per-device prefs, cheap math (sin/cos × 10).

Sources: community.etcconnect.com (HES) circle thread · en.wikipedia.org
/wiki/Intelligent_lighting · dmxdesktop.com/knowledgebase/effect-types ·
soundswitch.com · r/lightingdesign, r/DJs, r/Beatmatch threads.
