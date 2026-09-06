# 🌀 Surround sound — the research verdict (t77)

*What the best open-source surround engine for Home Binger is, and why.*

## The constraints (they decide everything)

Home Binger is a **pure browser app** — the owner's rule: it must run on ANY
browser (owner uses Opera GX). No build step, files-only, works offline.
Any engine that isn't JavaScript-in-the-browser is disqualified regardless
of quality, because it cannot ship inside the app.

## The candidates (researched 2026-09-06)

| Engine | License | Layer | Verdict for us |
|---|---|---|---|
| **Steam Audio** (Valve) | Apache-2.0 (Feb 2024) ✔ | native C/C++ SDK | Right license, wrong layer — no official web/WASM build; porting it would be a bigger project than the app. Revisit only if we ever go fully native. |
| **OpenAL Soft** | LGPL | native C | Same layer problem. |
| **Cavern** | MIT-ish | C#/.NET, Windows | Atmos decode for native apps — wrong platform. |
| **libspatialaudio** (VideoLAN) | LGPL | C++ | Wrong layer. |
| **Resonance Audio** (Google) | **Apache-2.0** | **JavaScript + Web Audio** ✔ | **CHOSEN.** Real-time Ambisonic soundfield encoding + HRTF binaural decode — the tech class behind Atmos-style rendering — in ONE vendored 129 KB file. Officially supports Chrome/Firefox/Edge/**Opera**/Safari/iOS/Android. |
| Web Audio native (`PannerNode` HRTF) | browser | built-in | **Retained** — the engine the jukebox + theater already use (owner-approved sound) and the automatic fallback for the booth. |

## What shipped (t77)

- **Dance hall (DJ booth)**: the 10-cabinet ring now renders through ONE
  first-order **Ambisonic soundfield** (Resonance) with true binaural HRTF
  decoding, instead of ten independent PannerNodes whose coherent summing
  smeared the image. Cabinet levels now use the jukebox's proven hierarchy
  (mains 0.5 · sides 0.3 · rears 0.22 · center 0.18). All t71–t76 audio
  doctrine is unchanged and still guarded: 110 Hz / 24 dB-oct bass
  management, theater-calibrated subs (0.4 in · ×2 LP · ×0.3), guarded ring
  knee + limiter, CAL 0.55, dB-honest EQ makeup.
- **Fallback**: if the vendor file is missing or fails, the ring rebuilds
  on the built-in Web Audio path, verbatim. Any browser, always.
- **Verified before wiring**: the SDK was smoke-tested live in current
  headless Chromium (10 sources, correct left/right ear balance, zero
  errors) — assumptions were not enough; a 2017-frozen SDK earns no trust
  without a 2026 test.
- **Jukebox (t78)**: after the owner approved the booth ("DJ booth sounded
  better"), the store ring moved to the same Ambisonic soundfield — same
  cabinet hierarchy, same calibration (setDistanceModel 2.2/50/0.35), same
  fallback. The theater remains on its native array (untouched, approved).

## Future upgrades (Phase 5)

- Higher-order Ambisonics (sharper localization) when a maintained web
  renderer emerges; Resonance room materials → dance-hall reverb
  sweetening; per-cabinet directivity (cardioid stacks pointing at the
  floor) — now a one-line change per source.
