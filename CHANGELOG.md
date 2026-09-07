## 2026-09-07 — t81: account rename (the owner's question found a gap)
- **Owner asked how to change an account name** — and the question found a
  real gap: START-HERE promises "change it in Admin: Users," but the panel
  only offered password + delete (and delete/recreate LOSES the profile).
- **New**: Rename button in Admin → Users (prompt, validates 2-32 chars)
  + `POST /api/admin/users/rename` (admin-only, uniqueness-enforced,
  case-insensitive). Rename is cosmetic-safe: profiles key `user:<id>`,
  sessions key userId — shelves, prefs and logins all survive; only the
  old NAME stops working (401), by design.
- **Check `t81Rename`** (76 total): register→rename→login round-trip,
  old-name 401, duplicate 409, bad name 400, UI wiring asserted. Two test
  lessons baked in: expected 4xx probes run NODE-side (browser console
  4xx would pollute the suite's error tally), and the check self-purges
  temp users (a crashed run can't poison the next).
- Note: the RELEASED exe (v1.0.0-beta) predates this — ships in the next
  exe build alongside tester findings. Source + repo packs updated now.
## 2026-09-07 — t80: the exe wears the logo (owner request)
- HomeBinger.exe now shows the HB favicon (navy plate, pink italic HB) in
  Explorer/taskbar instead of Electron's generic icon. Pipeline: the inline
  SVG favicon rendered via headless Chrome at 16/24/32/48/64/128/256 px →
  PNG-in-ICO (tools/assets/icon.ico, 15 KB) → embedded into the exe's PE
  resources by tools/set-exe-icon.mjs using resedit (pure JS — the old
  build skipped icons because rcedit needs Wine; that limitation is dead).
  resedit is a BUILD-time tool kept outside the app's zero-dependency tree;
  builds without it succeed unbranded (graceful skip). Verified: PE
  re-parses, first icon group = ours at 7 sizes.
- New check `t80IconBrand` (75 total): the branding pipeline can't silently
  disappear from the repo.
## 2026-09-06 (night) — research: Android + DLC protection plans
- docs/ANDROID.md — APK feasibility: Path 0 (phone-as-client PWA, works
  today), Path 1 (Capacitor+Node: flagged shaky by its own maintainer),
  Path 2 (nodejs-mobile standalone APK — our zero-dep server is the ideal
  candidate). Losses enumerated (pointer-lock → touch layer is the real
  work); audio engine + 3D fully survive on Android.
- docs/DLC-PLAN.md — the .hbd pack: AES-256-CTR media blob (seekable →
  Range streaming preserved), Ed25519-signed offline licenses (Node
  builtins only — zero-dep doctrine holds), `pack` server adapter feeds
  the existing rooms with ZERO client changes, manifest-driven wing
  dressing, owner tooling (build-dlc/sign-dlc), honest threat model
  (casual copying killed; determined capture is the accepted residual).
## 2026-09-06 — 🚨 t79 HOTFIX: the exe was dead on launch (owner found it)
- **Owner report**: the exe did nothing (absent from Task Manager); a second
  attempt with the Node server also running left Windows unresponsive.
- **Root cause**: `server.js` is an ES module; the desktop launcher
  `require()`d it. Electron 33 bundles Node 20.18 — one minor version short
  of require(ESM) support — so the launcher threw ERR_REQUIRE_ESM and the
  process died silently. Worked from source on modern Node (why every
  sandbox test passed); dead inside the exe on EVERY machine.
- **Fix**: launcher now loads the server via dynamic `import()` (works on
  every Node/Electron ever shipped).
- **Proof**: (1) the full exe payload booted under REAL Electron 33 in a
  Linux harness — window opened, HTTP 200, app rendering; (2) suite ALL
  GREEN ×1 (74 checks incl. new `t79DesktopBoot` contract) after the
  sandbox's own memory exhaustion was diagnosed (/tmp tmpfs 100% full from
  test toolchain — toolchain migrated to disk, `CHROME_EXE`/`NODE_PATH`
  now under ~/.cache).
- **Rebuilt + re-uploaded**; release asset swap: v1.0.0-beta → Home.Binger.zip.
## 2026-09-06 — 🚀 PUBLISHED: v1.0.0-beta is live
- Repo public: https://github.com/BabyBluJ-wall/Home-Binger (verified 200
  from outside). Release v1.0.0-beta published as pre-release with the
  build attached; tester link distributed. Docs updated with the permanent
  URLs (DELIVERY.md / ROADMAP / RELEASE.md).
## 2026-09-06 — release docs, round 2: the $0 publishing path
- **Owner: no Steam budget — free stays free.** docs/RELEASE.md rewritten:
  itch.io is the primary public home (free publishing, free hosting, free
  downloads, adjustable cut only on paid items, 1 GB per file — our exe is
  115 MB), with Steam demoted to an appendix ("only if the project ever
  earns its $100", which the DLC packs could do). Game Jolt noted as a
  second free shelf; Microsoft Store flagged as not-free.
## 2026-09-06 — t78: the jukebox goes Ambisonic + Windows build for testers
- **Owner verdict on t77: "DJ booth sounded better"** → same engine applied
  to the jukebox ring: one first-order Resonance soundfield, seven sources
  at ear level, distance calibration carried over (setDistanceModel
  2.2/50/0.35), listener riding the camera. The WebAudio panner ring
  remains the automatic fallback; the omni sub bypasses the field exactly
  as before. The theater stays on its native array.
- **New check `t78JukeResonance`** (73 total); t53's ring checks made
  engine-aware (either engine, same geometry contracts).
## 2026-09-06 — t77: the dance hall goes Ambisonic (Resonance Audio)
- **Owner brief**: research the open-source surround options from the
  companion chat and implement the best for quality into the dance-hall
  ring. Research verdict (full matrix in docs/SURROUND.md): Steam Audio /
  OpenAL Soft / Cavern are native SDKs — wrong layer for a pure-browser
  app; **Resonance Audio** (Google, Apache-2.0, vendored at
  public/js/vendor/, 129 KB) is the production-grade web Ambisonics
  renderer, officially supporting Opera/Safari/Firefox/Edge/Chrome.
- **Verified before wiring** (live smoke test in current Chromium): 10
  sources, correct interaural balance, same -z forward convention as our
  world, zero errors — a 2017-frozen SDK earns nothing without a 2026 test.
- **The ring**: 10 cabinets now render through ONE first-order Ambisonic
  soundfield with true binaural HRTF decode (replacing ten independent
  HRTF PannerNodes whose coherent summing smeared the image), cabinet
  levels moved to the jukebox's owner-approved hierarchy. ALL t71-t76
  doctrine unchanged and still guarded (bass management, theater subs,
  guarded ring, CAL 0.55, EQ makeup). Listener rides the camera. The
  WebAudio ring remains as an automatic fallback (any browser, always).
- **New check `t77Resonance`** (72 total): vendor loads, engine
  'resonance', 10 sources, and every prior ring contract holds.
## 2026-09-06 — t76: dB-honest deck EQ (the last booth overload)
- **Owner recipe that still broke**: trim 1, master 1.0, deck BASS EQ MAXED,
  the test song → distortion (trim 0.7 ≈ half-fix). The booth's deck EQ had
  NO makeup: +12 dB bass went downstream raw — while the jukebox survives
  the same scenario on an auto-makeup stage its EQ has had since t59
  (0.5 dB handed back per bass dB, 0.35 per mid/treble — EQ shapes tone,
  never steals headroom).
- **Fix**: every booth deck now carries the same dB-honest makeup right
  after its EQ (bass +12 → −6.0 dB, recomputed live as sliders move).
  The full owner recipe now measures BOTH limiters at 0.00 dB on the loud
  section of the real hot master.
- **Honest accounting**: the first t76 check lied twice before it told the
  truth — (1) a live object reference mutated by its own cleanup gave a
  ghost eqDb reading; (2) an earlier check left deck A playing, so the
  song loaded on deck B while the EQ boosted an empty deck A (limiters
  read 0 because nothing was boosted). Fixed with stopAll(), targeting the
  deck that actually plays, and primitive snapshots after parameter
  convergence. `t76BoothEq` (71 checks) now drives ONLY real DOM sliders.
## 2026-09-06 — t75: booth calibration (the constant your ears found)
- **Owner verdict: the JUKEBOX IS FIXED** (theater-calibrated doctrine held).
  The booth alone remained: "perfect at master 50%, trim 1; anything above
  breaks the bass."
- **Root cause**: every room feeds its speaker matrix through a fixed 0.55
  calibration trim — except the booth, which fed it RAW (user trim 0–1.5 ×
  fader × master straight into the cabinets). The owner's "perfect at 0.5"
  was the missing 0.55 constant, hand-plugged from the listening chair.
- **Fix**: the booth now carries the same CAL 0.55 stage after the analyser
  tap, BEFORE the master volume (mirroring the jukebox's ordering). Unity
  (trim 1, master 1) now equals the reference in-room loudness; the master
  slider becomes a true volume control instead of a distortion dial.
- **New check `t75BoothCal`** (70 total): real hot master, REAL slider path
  (DOM input event → 1.0), loud-section seek, both limiters must stay
  safety nets (≤3 dB) — measured 0.00 / 0.00. Decks also expose pos + a
  seek() test hook.
## 2026-09-06 — t74: equal slider = equal loudness (room calibration)
- **Owner**: jukebox + booth distort above ~50% on ANY overall volume
  control; the theater is clean. Measured the loud section at 100%
  (the old t69 check sampled the 12-second intro — instrumentation blind
  spot, now fixed): graph intact, limiter idle, sliders map 1:1 — the
  in-app chain is clean. The real delta was ABSOLUTE OUTPUT between rooms:
  the jukebox/dance rings carried weak distance shading (refDistance 3.5,
  rolloff 0.25) while the reference theater carries 2.2 / 0.35 — the other
  rooms pushed the owner's output stack ~2.3 dB harder at the same slider %.
- **Fix**: both rings now carry the theater's exact shading. Equal slider
  position now means equal loudness in every room, calibrated to the room
  the owner's ears approved. (If any distortion above 50% remains after
  this, it lives past the app — Windows mixer / GX / speaker amp — see
  docs/AUDIO.md checklist; the theater A/B below settles it.)
- **New check `t74EqualLoudness`** (69 total); t69 now seeks to the loud
  section before sampling.
## 2026-09-06 — t73: theater-calibrated subs (the owner's reference doctrine)
- **Owner**: jukebox + dance hall still sound like "extra bass for no
  reason"; the theater is the reference — study it. Side-by-side graph
  audit found THREE departures from the theater in the other rooms' subs:
- 1) **Unity mono sum** — theater feeds each sub both buses through a 0.4
  input gain; the other rooms fed L+R at UNITY (2× on correlated bass) and
  trimmed after: net +6..+9 dB over the theater's in-room sub level.
- 2) **Slope mismatch** — 12 dB/oct sub LP vs the t71 24 dB/oct satellite
  HPs summed a bump at ~110 Hz. Sub LP is now 110 Hz ×2 (24 dB/oct).
- 3) **Bus compressor** (t71's own addition) — the theater runs no such
  stage; its 3:1 density read as extra bass. Removed.
- Both rooms now run the theater's exact sub recipe: 0.4 input → LP 110 ×2
  → sub-band dynamics → ×0.3. The theater itself is untouched.
- **New check `t73TheaterSub`** (68 total); `t71BassMgmt` updated to the
  theater doctrine.
## 2026-09-06 — t72: the booth layout, fixed for real (owner spec)
- **Owner spec**: decks + header stay on screen while the song list scrolls
  independently; bigger box; never sideways-scroll; same look/functions.
  Three stacked causes found (each reported symptom mapped to one):
- **Decks scrolled away** — the base `#dj-body` rule (max-height 64vh +
  overflow auto) was never cancelled in wide mode: the WHOLE booth scrolled
  inside it, decks included. The t67 "flex fix" verified CSS intent, not
  behavior. Now the body is a plain flex container; the ONLY scroller in the
  booth is the song list (t72 checks measure this behaviorally: scroll the
  list, then measure the decks' on-screen rects).
- **Box never got bigger** — the base `.dj-card { max-width: 640px }` clamp
  silently capped every "wide" rig: on a 2560-px screen the booth was a
  640-px box. The card is now min(2200px, 96vw) × min(92vh, 1000px),
  max-width none — it fills the screen.
- **Sideways scrolling** — the rig (`.djp`) had flex-basis auto: it sized to
  its CONTENT width and stuck out of the body (hidden behind a horizontal
  scrollbar in earlier builds — exactly what the owner refused). Basis 0 +
  min-width 0: the rig takes exactly the available width; deck floors are
  responsive (min(380px, 28vw)); sliders shrink; verified zero horizontal
  overflow even at a 640-px window.
- **New checks** `t72BoothLayout` + `t72TinyNoSideways` (67 total); t67's
  flexOk instrument corrected (scrollbar detection, not scrollHeight).
## 2026-09-06 — t71: bass management + guarded rings (owner's ears, round 2)
- **Owner reported after t70**: the booth only stays clean at trim ≤ 0.2, and
  the jukebox still distorts at max with bass audibly "ported through the
  room speakers". Both observations were correct; both were in the wiring:
- **Jukebox**: the satellite crossover was too shallow — one 12 dB/oct
  section at 85 Hz leaks ~−8 dB of 55 Hz into every cabinet, and all 7 sum
  coherently right at the knee. Now 110 Hz at 24 dB/oct: **the sub is the
  only bass source** (exactly the fix the owner prescribed), plus a slow
  ring-bus dynamics stage (−6 dB, 3:1) so bass EQ at max volume cannot
  pile up.
- **Dance ring (booth)**: all 10 cabinets + sub were connected STRAIGHT to
  the destination — past the knee AND the limiter; the summed ring clipped
  the output where nothing could catch it. Trim 0.2 was the owner manually
  doing the limiter's job. The ring sum now passes through its OWN unity
  knee + limiter (same t70 spec) before the output.
- **New check `t71BassMgmt`** (66 total): live topology — crossover
  ≥ 100 Hz with ≥ 2 stages, jukebox bus dynamics on, dance ring guarded.
## 2026-09-06 — t70: the max-volume mystery, solved by the owner's ears
- **Owner reported**: clean at low volume, fuzzy at max, and LOUDER at max
  than every other app. Both symptoms traced to ONE line: the t63 tanh
  soft-clip curve `tanh(x*1.25)/tanh(1.25)` — its zero-crossing slope is
  1.47x, a hidden **+5.4 dB boost** in every engine (jukebox, theater TV,
  DJ booth), and its curved region saturated loud program at max volume.
  The limiter meter read 0.0 dB because the shaper absorbed the peaks
  BEFORE the limiter — the meters missed it; the owner's ears didn't.
- **Fix**: UNITY soft-knee curve in all three engines — exactly y = x below
  0.85 (bit-transparent, zero loudness change), easing to a 0.965 ceiling
  above. Max volume is now ~5 dB calmer than the old build — on purpose,
  matching how every other app behaves.
- **New check `t70ClipCurve`** (65 total): each engine's LIVE curve must be
  unity below the knee (slope 1±0.05, y(0.5)=0.5±0.01, ceiling 0.9–0.99).
## 2026-09-06 — Phase 0: the problem song, measured (t69)
- **Acquired the owner's actual distortion-case song** (Suno master, via its
  CDN) and decoded it: **peak +0.21 dBFS OVER digital full scale** — the
  master itself is hot (inter-sample overs; no flat clipping). On any player
  that doesn't attenuate before output, this file distorts in the bass.
- **The app chain is clip-proof against it**: 20-second live sweeps at
  default, MAX volume, and MAX+bass14 show the limiter NEVER engages
  (0.0 dB) — the t67 tanh output stage bounds the graph below 1.0 by
  construction, and sub dynamics stand ready.
- **New permanent check `t69HotMaster`**: over-full-scale masters must play
  clean (limiter ≤3 dB transient). The song (10.6 MB) is kept as the
  regression fixture in tests/media/realsong/.
## 2026-09-06 — Fresh-install bug found & fixed, zip hygiene (t68)
- **REAL BUG (found by wiping all test data and booting fresh)**: the file
  grabber's activation gate still required the legacy `path` field — a brand-
  new install configuring spots (the current UI) would silently shelve
  nothing. Old test data had a stale `path` residue that masked it. The gate
  now accepts spots OR legacy path.
- **Zip hygiene**: home-binger.zip shipped 168 files of dev-machine runtime
  data (test users, poster cache, my config). data/ is now excluded — fresh
  installs seed cleanly on first run (verified by a full suite pass on a
  wiped data dir).
- **Test determinism**: the projector idle check assumed the store default
  was non-white; on fresh installs it IS white. The check now tests the
  personal override deterministically in both directions.
## 2026-09-06 — Bass dynamics, booth flex, real bug found (t67)
- **Sub-band dynamics on EVERY sub path** (jukebox, theater subs, dance hall
  rigs): a slow RMS compressor guards the mono sub bus. Pure-tone bench
  tests measure clean — real kick transients in mastered music were the
  unguarded element; this is the stage that keeps bass tight at max volume
  with EQ boosts. Jukebox sub also gets −1.4 dB extra margin.
- **REAL BUG FIXED — the Pro Rig's 10-cabinet dance ring never built** (dead
  code path: it could only run before the AudioContext existed). The booth
  now actually plays through the ear-level ring + sub dynamics — the hall
  should sound noticeably fuller.
- **Item modal fixed**: long titles ran under the ✕ close button (the
  lingering UI overlap — verified at 3 window sizes, now verified clear).
- **Booth modal reworked to flex layout**: the CARD can never scroll; the
  ONLY scrollable element is the music list (which now grows to fill free
  space). Guaranteed in Beginner AND Pro at any window height.
- **docs/AUDIO.md** added: the exact stage-by-stage signal chain of every
  room, with live-measured numbers and an "if you still hear distortion"
  checklist (browser/system EQ stacking — e.g. Opera GX effects, Windows
  Loudness Equalization — clips AFTER our clean output).
## 2026-09-06 — Jukebox clarity, overlap fix, novice aids (t66b)
- **Jukebox "slight distortion" root-caused by measurement**: a full-scale
  test tone played through the live graph shows the limiter NEVER engages
  (0.0 dB reduction at default, full volume, and max EQ) — the graph is clean.
  The culprit was the STORE ring still RENDERING at ceiling height (3.98 m):
  extreme-elevation HRTF sounds phasey and reads as distortion. The ring now
  renders at ear level (1.7 m), matching the dance-hall fix (t60).
- **Fixed real UI overlap**: the hover tooltip had no max-width — long titles
  grew unbounded and overlapped the HUD. It now wraps at min(72vw, 560px).
- **Pro Rig window widened** to 1420px with slimmer card padding.
- **Novice aids**: the Profile panel now states the first-run manager login
  (BabyBluJ/BluJNetwork); the file grabber strips quotes from pasted paths
  and SAVING reports "Folder not found (check the spelling): …" instead of
  silently shelving nothing.
- **Verified 0 element-overlap** across all panels, HUD, help, and both decks
  at 1280px and 1024px, using per-line rect intersection.
# Home Binger — Change Log

## 2026-09-06 — Audio Quality & Beta-Test Pass (t66)
- **Audited every audio source end-to-end** (theater, jukebox, dance hall/pro
  rig, voicing) by tracing the live graphs: gain staging, limiters, soft-clip
  stages, containment gates, ear-level dance anchors, volume smoothing, EQ
  wiring. All sources verified intentional; no regressions found.
- **Fixed: primary (accent) button contrast** — measured 2.94:1, now ≥3.5:1 on
  any theme accent via a subtle darkening overlay. Why: only real readability
  failure found in a full-panel contrast/clipping/dead-button sweep.
- **Verified clean by automated sweep:** 0 clipped labels, 0 orphan buttons,
  0 sub-10.5px fonts, 0 undersized hit targets across all settings panels,
  sidebar, and modals.

## 2026-09-06 — Polish (t65)
- Jukebox audio now runs the THEATER's exact staging (0.55 trim, matrix
  levels, 110 Hz sub crossover) — the chain that stays clean at full volume.
- DJ's Library: gold-record wall frames (flush, song-name plaques) replace the
  protruding bins.
- Booth Pro Rig opens in a wide 1120px stage; jukebox deck keeps standard width.

## 2026-09-06 — DJ Booth UI (t64)
- NEW dual-deck Pro Rig on the booth laptop (EQ chains, trim, crossfader with
  curve + detent, BPM/key detection, cues, beat loops, sync, shortcuts,
  sessions, Beginner/Pro). Jukebox KEEPS the classic deck; both devices play
  independently.
- Classic deck completed: drag-and-drop reorder, 3-way repeat (off/one/all),
  crossfade now honors the fade-length setting.

## 2026-09-06 — Volume/EQ logic fixes (t63)
- Fixed TV slider snapping to 100 (synced from the real target, not the pinned
  element); fixed orphaned volume node when video→audio hand off; EQ set
  before first play now reaches the graph; tanh soft-clip final stage on both
  engines; honest element-volume fallback when WebAudio is unavailable.
