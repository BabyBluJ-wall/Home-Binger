# 🔬 RESEARCH — The personal DJ: making AUTO-DJ mix like a human (2026-09-10)

*Owner: "I want a smoother auto dj… I basically want my own personal dj
when i dont want to dj myself." Research → t112. Sources at the bottom.*

---

## Part 1 — How the pros actually mix (transition technique)

Every pro transition is three ingredients (per the DJ-school consensus):

1. **Tempo — beatmatching.** Both tracks at the same speed, kicks on
   kicks. "If the kicks don't line up, no amount of EQ trickery will
   save the mix."
2. **Placement — phrasing.** Dance music is built from phrases (blocks
   of 8 / 16 / 32 bars). Transitions land ON phrase boundaries, because
   that's where both tracks naturally turn a corner. The incoming track
   starts on beat 1 of the outgoing track's next phrase.
3. **Balance — faders + EQ.** What actually happens during the overlap.

The core transitions, in teaching order:

- **The blend** — the long overlap: raise the incoming track over 16–32
  bars while the outgoing fades. House/techno's native language.
- **The bass swap (EQ mix)** — "the club workhorse": the golden rule is
  **only one bassline plays at a time** (two at once = mud). The
  incoming track comes in with its LOW EQ cut so only its mids/highs
  layer over the outgoing; then on the downbeat of a new phrase, the
  low end is swapped in one move — incoming LOW up, outgoing LOW down.
- **The filter fade** — sweep the incoming track in behind a high-pass
  filter (thin, no bass) that opens to neutral while the outgoing
  thins out. The bridge for energy shifts and genre changes.
- **The echo out** — for tempo/genre jumps: a beat-synced echo on the
  last beat of the outgoing track, fader down, next track starts clean
  on the downbeat. Requires no beatmatching at all.

**How pros choose which one** (the decision framework):
- close BPM + compatible keys → long blend + bass swap
- BPMs close but keys clash → filter fade
- big tempo gap or genre jump → echo out / cut

**Other pro details:** overlap of 1–2 phrases is typical (16–32 beats
house, 8–16 for denser arrangements); swap the bass gradually for
silky or slam it on the one for punchy; keep levels out of the red.

## Part 2 — How auto-DJ software does it (and where it stops)

Mixxx (open-source, the reference implementation):

- A ping-pong state machine: while one deck plays, the other loads the
  next track; a crossfade triggers at a calculated position.
- **Transition modes:** "Full Intro + Outro" (aligns the outro of the
  old track with the intro of the new — the default), "Fade at Outro
  Start," fixed-time, and "Skip Silence" (auto-cuts silence at the ends
  of tracks, defined as signal above −60 dBFS).
- The crossfade itself is a **linear fader move over the transition
  time** driven by the outgoing deck's position.
- A "Fade Now" button triggers the transition manually.
- **Mixxx's own docs admit the ceiling:** AutoDJ "does not take into
  account the volume of each track, nor the frequency content, nor the
  rhythms, so it's not intended to be a replacement for a human DJ."

Commercial offerings (Serato, Engine DJ, Pyro-style apps) follow the
same shape: fixed-time or cue-based crossfades; the smarter ones add
BPM matching and simple EQ dips.

## Part 3 — What OUR booth already has that they don't script

- Real tempo detection per deck (BPM + beat grid, `grid0`)
- Key detection (Camelot) per deck
- Real three-band EQ on every channel (Web Audio biquads, rampable)
- A per-deck filter section (LPF/HPF) we can sweep by code
- A tempo-synced echo in the FX rack
- A 600-column waveform analysis of every track (three frequency
  bands!) — that's the silence map Mixxx lacks

So the personal-DJ engine can be built from parts that already exist
and already pass tests.

## Part 4 — The t112 design (implemented)

1. **Phrase-aligned starts.** The transition fires ON the outgoing
   track's beat grid — prefer a 32-beat phrase line, fall back to an
   8-beat bar line, never mid-bar when avoidable.
2. **Silence trimming both ends** (from the waveform analysis): the
   countdown uses the last *audible* moment, not the file duration;
   the incoming track skips its silent lead-in.
3. **Beatmatch + drift guard.** Tempo-match and phase-align at the
   start (already had), plus a gentle continuous correction so two
   decks don't drift apart over a long blend.
4. **The three transitions, chosen like a pro:**
   - **Blend + bass swap** (BPMs within 4%, keys compatible): a
     16-beet crossfade; the incoming track starts with its bass cut
     (−24 dB), and at the 60% mark — snapped to the beat grid — the
     low end swaps in one move.
   - **Filter fade** (BPMs within 8%, or keys clash): the incoming
     track sweeps in from behind a high-pass filter while the outgoing
     thins out.
   - **Echo out** (everything else): beat-synced echo on the outgoing
     track, quick 2-beet fade, clean start on the downbeat.
5. Longer fades overall (16 beats for blends vs the old 8).

## Sources

- setflow.app — DJ transitions, the six core techniques, bass-swap
  walkthrough, phrasing
- vibesdj.io — phrase mixing (16/32-bar alignment, common mistakes);
  the 9-technique guide + "choose by compatibility" framework
- edm-ghost-production.com — beginner transitions: tempo/placement/
  balance, filter transition spectral-crossing detail
- djmixer.online — EQ mixing and filter glossary
- Mixxx: manual (Auto DJ modes), deepwiki system summary (state
  machine, five modes, linear crossfade), 2.3 release notes (intro/
  outro cues, skip silence at −60 dBFS, and the "not a replacement for
  a human DJ" admission)


---

## t114 addendum — the "read song info faster" research (2026-09-10)

**The owner's question:** are there open-source DJ mix programs we can use,
especially with really good auto-DJ / AI DJ, where BPM and song info can be
read faster?

**The landscape (verified 2026-09):**

| Program / library | What it is | License | Can we use it? |
|---|---|---|---|
| **Mixxx** | The only serious open-source DJ program (still active in 2026, "best free pick" in every current roundup) | GPLv2+ | **Learn from, never embed** — GPL code can't ship inside Home Binger's license. We already mine it for technique (its AutoDJ docs shaped t112). Notably, Mixxx's own AutoDJ admits it ignores volume/frequency/rhythm when picking transitions — our booth scripts all three, so our ceiling is higher. |
| **aubio** | C library for onset/tempo/pitch detection (the classic) | **GPLv3** (explicitly "not MIT or BSD") | No embedding; its ALGORITHM (onset flux + autocorrelation tempo) is decades-old published DSP — reimplemented in our own JS. |
| **Essentia** | C++ MIR library (BPM, key, descriptors) | **AGPL** | No. |
| **librosa** | Python audio analysis (beat_track, chroma) | ISC (permissive) | Python anyway — but confirms the algorithm family we implemented is the standard one. |
| **djay / VirtualDJ / DJ.Studio / Traktor** | Commercial "AI DJ" (Neural Mix stems, automix timelines) | Closed / subscription | Not open source at all — nothing to use. |

**What we actually built (this turn):** the fast-info pipeline no DJ program
ships out of the box —

1. **Read the file's own tags** (instant, zero analysis): ID3v2.2/2.3/2.4
   TBPM+TKEY (mp3), Vorbis BPM+INITIALKEY (flac/ogg), MP4 ©'tmpo' + iTunes
   freeform initialkey (m4a, moov at head OR tail). DAW exports — the owner
   makes music — carry BPM by default. Server-side, bounded reads.
2. **Offline analysis on first sight** (background, ~3 s/track): onset-flux
   envelope → autocorrelation tempo (octave-aware, folded 70–180) → beat-grid
   anchor (first strong onset) → chroma key via a small radix-2 FFT. Cached
   per item, persisted in the panel's meta store. Runs AHEAD for the next
   three queued tracks while AUTO-DJ plays.
3. **Live refinement** keeps running on the playing deck (the t108 detector).

**Root cause of "it just cuts" (recorded for posterity):** BPM detection was
live-clock only — a deck needed to PLAY ~8 beats before its tempo existed, so
at transition time the incoming deck ALWAYS had bpm 0 → no syncTo, no drift
guard, no phrase alignment; every transition was an unsynced overlap. With
tags + offline analysis the tempo is known at LOAD, so the t112 machinery
(beatmatch, bass swap, phrase fires, drift guard) finally engages.
