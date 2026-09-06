# 🎚️ Home Binger — How Audio Plays in Every Room

This is the exact, current signal chain for each room, stage by stage.
Every number here is live-verified by the self-check suite (read from the
real WebAudio graph, not from source code).

## Shared doctrine (every room)

1. **One AudioContext per engine**, `latencyHint: 'playback'` → deep output
   buffers; buffer underruns (the usual "crackle") are engineered out.
2. **Rumble filter** (30–33 Hz highpass) — streamed/remuxed media carries
   infrasonic junk that wastes headroom.
3. **Bass management** — satellites high-pass at ~85 Hz; the subwoofers own
   everything below (low-pass 110 Hz). Sats stay clean, subs stay tight.
4. **Sub-band dynamics** — a slow RMS compressor (−10 dB, 4:1, 10 ms/150 ms)
   on every mono sub bus. Static trims can't predict kick transients in real
   mastered music; this stage does. This is what keeps bass clean at MAX
   volume even with EQ boosts.
5. **Soft-clip final stage** — a UNITY soft-knee before the limiter: exactly
   `y = x` below 0.85 (bit-transparent, no loudness change), easing to a
   0.965 ceiling above. *(History: the original t63 tanh curve carried a
   hidden +5.4 dB boost — 1.47× slope at the zero crossing — which made Home
   Binger louder than every other app and audibly saturated hot masters at
   max volume. The owner's ears caught it; t70 replaced it.)*
6. **Limiter** (−2 dB, 14:1, 2 ms/120 ms) — a safety NET, not a mix stage.
   Measured gain reduction with full-scale test tones: 0.0 dB (it never
   engages on the bench; it exists for the real world).
7. **Room gates** — each engine is audible only inside its own room. The
   theater never hears the jukebox; dance music stays in the dance hall.
8. **Smooth volume** — one gain node per player (30 ms ramps). Media elements
   stay pinned at unity; sliders never zipper and never snap back.

## 🎬 Movie theater

`video/audio element → cinema voicing (presence +2.5 dB @2.8k, air +3 dB
@10k) → rumble → trim 0.55 → volume node → matrix` — mains 0.5, sides 0.3
(+12 ms Haas), rears 0.22 (+23 ms), both subs = low-passed L+R sum ×0.4 with
sub-band dynamics. Multichannel hardware (≥6 output channels) gets **discrete
7.1** straight to the outputs (no down-mixing compressor in the path); stereo
output gets **HRTF binaural** cabinets at ear level. Gate: the theater room
only. *Note: "minor crackles on some media" at the theater are decode-level
(source codec/container), not the graph — the same file through the same
chain elsewhere will show it too.*

## ⚖️ Room calibration (t74)

**Equal slider = equal loudness.** Every room's speaker rig carries the same
distance shading as the theater reference (refDistance 2.2, rolloff 0.35).
If any room still sounds distorted above ~50% volume while the theater stays
clean ON THE SAME SONG AT MAX, the clipping is past the app: run the
checklist at the bottom of this file (browser audio effects, OS enhancements,
stacked volumes, speaker amp gain).

## 🎵 Jukebox (movie store)

`element → DJ EQ (biquad lowshelf/peak/highshelf, −12…+12 dB) → cinema
voicing (🎬 toggle) → rumble → auto-makeup (dB-honest) → trim 0.55 → volume
node → 7.1 ring` — mains 0.5, sides 0.3, rears 0.22. Since t78 the ring renders
through the same **Resonance Audio Ambisonic soundfield** as the dance hall
(owner-approved there first); the Web Audio ring is the automatic fallback.
Every
cabinet is high-passed at **110 Hz, 24 dB/oct** (t71: the sub OWNS the
lows). **Sub = the theater's exact recipe (t73)**: both buses through a
**0.4 input gain** → LP 110 Hz **×2 (24 dB/oct, slope-matched to the
cabinet HPs)** → sub-band dynamics → ×0.3. *(t73 note: the old design fed
L+R at unity — 2× on correlated bass — then trimmed ×0.34: +6..+9 dB over
the theater's in-room level, plus a 12 dB/oct LP against 24 dB/oct HPs
that summed a bump at 110 Hz, plus a bus compressor the theater doesn't
have. That combination was the owner's "extra bass for no reason".)*
Ring renders at **ear level (1.7 m)**. Gate: the store room only.

## 🪩 Dance hall (DJ booth — Pro Rig & classic deck)

Per deck: `element → trim → 3-band EQ → **dB-honest makeup** (bass boost pays 0.5 dB/dB, mid & treble 0.35 — t76) → channel fader → crossfader gain
(curveable, center detent) → master`. Master: `analyser tap → **CAL 0.55**
(the same fixed calibration every room's matrix feed carries — t75; the
booth ran raw until then, which is why it only behaved below ~0.5 master)
→ master volume →
limiter → soft-clip → wing gate`, then the **10-cabinet ring at ear level**
(same hierarchy as the store — mains 0.5/sides 0.3/rears 0.22/center 0.18;
sub = the same t73 theater recipe: 0.4 input, LP 110 ×2, sub-band dynamics,
×0.3). Since t77 the ten cabinets render through ONE **Resonance Audio
first-order Ambisonic soundfield** (Google, Apache-2.0, vendored — see
docs/SURROUND.md) with HRTF binaural decode; the Web Audio ring is the
automatic fallback. Either way the ring sum passes through its **OWN unity
knee + limiter** before the output (t71:
the ring used to hang straight off the destination, past every protection
stage, which is why it distorted above ~0.2 trim) + booth monitor tap.
Cabinets high-passed **110 Hz, 24 dB/oct**. Sync/nudge/loops ride a detected
beat grid. Gate: the dance wing only.

## If you still hear distortion

The bench numbers above are measured, not assumed — so remaining distortion
is environmental. Checklist, in order of likelihood:
1. **Browser/system EQ or boost** (e.g. Opera GX audio effects, Windows
   "Enhancements" / Loudness Equalization, driver "bass boost") — disable all
   of them; they clip AFTER our clean output.
2. **Multiple gain stages maxed** — keep ONE volume high (the app's) and the
   OS/browser at moderate levels; stacking 100% everywhere overdrives the
   last stage in the chain.
3. **The source file itself** — try the same track in the theater; if it
   crackles there too, it's the media.
