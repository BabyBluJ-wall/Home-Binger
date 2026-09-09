# 🗺️ Home Binger — Project Roadmap

*From a single video-store room to a full media building. Updated every turn.*

**Current phase: 1 — 1.0 BETA FREEZE / TESTER BUG-HUNT** (updated 2026-09-08)

---

## The discipline (how we finish this together)

1. **One phase at a time.** A phase is done when its gate is met — not when
   it's merely built. No new features enter a phase that hasn't passed its gate.
2. **Every turn ends green**: full self-check suite ×2, stamp, changelog, zips.
3. **Your ears beat my meters.** When they disagree, we measure until they agree.
4. **Workspace stays lean**: test fixtures get trimmed; ships get cleaned up.
5. **Bugs before features** — always. (This is the rule you've been living
   already; it's why the app is solid. Keep it.)

---

## Phase 0 — THE AUDIO GATE 🎯 *(current)*
**Goal:** the jukebox question closed with real material.
- [x] Windows zip deleted (owner downloaded; rebuild = `node tools/build-desktop.mjs`)
- [x] Song acquired via Suno CDN · decoded: **master peaks +0.21 dBFS OVER
      full scale** — the file itself is hot; that's the distortion source on
      players that don't attenuate
- [x] Live sweeps (default / max vol / max+bass14): app limiter never engages
      (0.0 dB) — the t67 tanh stage bounds output <1.0 by construction
- [x] Permanent regression check `t69HotMaster` (song kept as fixture)
- [x] **ROOT CAUSE FOUND (owner's ears → t70)**: the t63 tanh "safety" curve
      carried a hidden +5.4 dB boost — louder than every other app AND
      saturating hot masters at max volume, invisible to the limiter meter.
      Replaced with a unity soft-knee in all 3 engines; `t70ClipCurve` guards.
- [x] **t71 (owner's ears, round 2)**: booth ring was wired PAST all
      protection (trim 0.2 = the owner hand-limiting it); jukebox satellites
      leaked coherent bass through a shallow 85 Hz crossover. Fixed: 110 Hz
      24 dB-oct crossovers (sub owns the lows), ring-bus dynamics, guarded
      ring sum. `t71BassMgmt` guards it permanently.
- [x] **t72 booth layout** (owner spec, pre-test request): decks pinned,
      list scrolls alone, card fills the screen (max-width clamp found and
      lifted), zero sideways scroll at any window size.
- [x] **t73 theater-calibrated subs**: unity mono sum (+6..+9 dB), LP/HP
      slope mismatch (110 Hz bump), and a non-theater bus compressor all
      corrected to the reference room's recipe. `t73TheaterSub` guards.
- [x] **t74 equal-loudness calibration**: rings carried weaker distance
      shading than the theater (~2.3 dB hotter at the same slider %) —
      matched to the reference. `t74EqualLoudness` guards; t69 now samples
      the loud section.
- [x] **t74/t75 verdicts**: OWNER CONFIRMS THE JUKEBOX FIXED ✅. The booth
      was missing the 0.55 calibration every other room has (the owner's
      "perfect at master 0.5" WAS the constant) — t75 inserts it; both
      limiters measured 0.00 dB at full unity on the loud section.
- [x] **t76 dB-honest deck EQ**: booth EQ boosts now pay the jukebox's
      auto-makeup (bass +12 → −6 dB); the owner's full recipe (trim 1,
      master 1.0, bass maxed) measures both limiters at 0.00 dB.
- [x] **Owner verdict on t76: BETTER** — usable at full send; a finer tuning
      pass (sweetening, not repair) is deferred by the owner's choice.
- [ ] **Booth tuning pass (later, owner's ear led)**: sweetness nudges — all
      one-number constants now (CAL 0.55, makeup 0.5/0.35, sub 0.4/0.3).

      should hold clean; slider now scales volume, not distortion.
      Remaining from t74: same song at max on the
      THEATER's deck vs the jukebox — if both clean, Phase 0 closes; if the
      jukebox alone still distorts >50%, it's past the app (AUDIO.md
      checklist). Jukebox + dance bass should now sit
      like the theater's; jukebox max + bass +14; booth trim
      back up toward 0.5–0.8 (the 0.2 ceiling should be GONE); bass should
      image from the sub, not the room speakers.
**GATE:** owner says the jukebox sounds crisp at max volume — or we've
measured exactly why not and fixed it.

- [x] **t78 jukebox Ambisonic** (owner: "apply the same fixes to the
      jukebox") + Windows exe rebuilt for external testers.
- [x] **t81b rename in the exe** (owner tried it, found it dead): Electron
      has no window.prompt — Rename + Set password now use inline editors
      (input + Save/Cancel under the row). Verified by driving the real
      exe over CDP: click → editor → save → row updates. New doctrine:
      no browser-only APIs in UI; exe click-through before shipping.
- [x] **t81 account rename** (owner question → gap found): Admin → Users
      → Rename; safe by design (profiles key user id). In source now; the
      public exe gets it with the next build.
- [x] **t80 exe branding**: HomeBinger.exe wears the HB logo (pure-JS
      resource edit — the no-Wine icon limitation is dead); pipeline
      guarded by `t80IconBrand`.
- [x] **Research night (owner off):** docs/ANDROID.md (APK feasibility —
      phone-as-client works today; nodejs-mobile is the real APK path;
      touch controls are the true work item) + docs/DLC-PLAN.md (the .hbd
      encrypted-pack format, offline signed licenses, pack adapter →
      rooms with zero client changes; honest threat model included).

## Phase 0 — THE AUDIO GATE ✅ CLOSED
**Verdicts (owner's ears):** jukebox FIXED (t73/t74) · booth BETTER, sweetening
deferved by choice (t75/t76/t77 — all one-number nudges when wanted) ·
surround upgraded to Resonance Ambisonics in booth + jukebox (t77/t78).
**Close-out:** tester exe delivered via link (chat-viewer crashes on 115 MB
files — links for big files from now on); workspace copy deleted after
download; rebuild = one command.

## Phase 1 — 1.0 BETA FREEZE 🔒 *(current — testers have the build)*
**LIVE:** repo public at https://github.com/BabyBluJ-wall/Home-Binger ·
release **v1.5.5** (pre-release; owner numbering 1.0 → 1.5 → 1.5.5) ·
PERMANENT exe download (t81b rename fix, byte-verified):
https://github.com/BabyBluJ-wall/Home-Binger/releases/download/v1.5.5/HomeBinger-1.5.5-beta.zip
Recovery: clone the repo, or rebuild the exe from source
(`node tools/build-desktop.mjs`).
**Goal:** stop adding, start hardening. The app as it stands, bulletproof.
- [x] **t82–t85 tester round 2**: admin tabs merged into one Admin
      section + make/remove-admin per user (last-admin guard); mobile
      account creation un-lagged (overlay pauses scene + no backdrop
      blur on phones); one-tap LAN invite copy in My Profile; jukebox
      hover overlay removed. 80/80 suite.
- [x] **t86–t89 wave (2026-09-08)**: multi-source — connect as many
      Plex/Jellyfin instances as wanted (Admin → Server → More libraries;
      per-instance nickname/on-off/picks/Test; "Nickname · Library" labels;
      per-user toggles in My Media; per-connection routing). Shelf map fixed
      five ways (cap-safe pinned sections, commit-on-change, Direction in
      genre/library, map-wins-taxonomy, "Server · Section" labels) + stale
      pins surfaced with cleanup + jukebox-aware reset. Grabber videos get
      real case images (first visitor generates, server-cached). Dance
      floor: 2× rig energy, cones un-inverted, real faceted mirror ball
      (pin spot + glints + floor sweep), per-person "Dance floor lights"
      prefs — gate stays (dance-hall music only). 85/85 suite ×2.
- [ ] Owner bug-hunt round on the full build (all rooms, both decks, grabber,
      desktop exe, phones) — findings list → fixes
- [ ] Fresh-install test again (that's how we caught the grabber gate bug)
- [ ] Docs final pass (README/START-HERE/AUDIO/EDITING match reality)
- [x] GitHub export for backup + issue tracking — repo live at
      BabyBluJ-wall/Home-Binger (owner numbering: 1.0 → 1.5 → v1.5.5)
**GATE:** one full owner walkthrough with zero must-fix findings.

## Phase 2 — THE BOOK NOOK 📚
**Goal:** the reading room. Ebooks + audiobooks, using what exists.
- [ ] New room off the building (design: cozy, wall bookshelves, reading lamp)
- [ ] `book` items already indexed by the grabber → shelving + browsing
- [ ] Reader: PDF via vendored pdf.js (no build step); TXT/MD native;
      EPUB later
- [ ] Audiobooks = audio files → jukebox engine plays them day one
**GATE:** open a PDF off the shelf, read it in-world; an audiobook plays.

## Phase 3 — THE OFFICE 🏢
**Goal:** view-first documents, edit what's reasonable.
- [ ] Room with desk + monitor props
- [ ] View: PDF / TXT / MD (reader shared with Book Nook); .docx read-only
- [ ] Edit: TXT/MD only (honest scope — .docx editing is Google-Docs-sized)
**GATE:** open and read every supported type in-world; edit a MD file.

## t93 wave — STORE POLISH (owner requests 2026-09-09, in flight)
- [x] **Portable doctrine restored** — delete-the-folder = complete
      uninstall (accounts+logins+settings+caches all inside the app folder);
      updates = unzip new version next to the old, open the new exe, data
      adopts itself; 1.6.x %APPDATA% data reverse-adopts + cleans up.
- [x] **Dance-hall lights, take 3** — the owner: "Intensity should be
      MOVEMENT intensity, not light-beam intensity. I don't want brighter
      or darker lights. I want them to MOVE the way lights move in a laser
      show / DJ set / concert / EDM festival — moving heads, sweeps,
      beat-reactive motion." All three sliders earn their keep
      (movement amount, motion speed, program/style).
- [x] **Theme goes app-wide** — every menu, panel and modal follows the
      theme accent, live, changing together (today most menus don't
      follow it at all).
- [x] **Shelf organization deep-dive** — a section must show ONLY its
      category (today up to 2 others bleed in); overall organization
      made more like Plex's.
- [x] **RSS becomes multi-source** — as many podcast/RSS feeds as the
      admin wants (the t87 instances treatment).
*(exe 1.7.0 ships when this wave closes; then remote connections → W1.)*

## Phase W — WATCH PARTY 🍿 *(owner request 2026-09-08)*
**ORDER (owner, 2026-09-08): remote connections come FIRST — watch party
work starts once remote access is done.** Far-away friends can't join a
theater night they can't reach. Watch together, w2g-style, but it's YOUR
store. Staged honestly by size:
- **W1 — synced theater nights (small):** the host queues a title; everyone
  in the theater stays frame-synced (the TV state already lives on the
  server — formalize "party mode": host controls, synchronized start,
  a "🎬 Now hosting" sign, simple in-room chat).
- **W2 — invite rooms:** a room link friends open in a browser — joins the
  same screen without walking the whole store (rides the existing web UI).
- **W3 — the big dream (multiplayer presence):** friends' customizable
  avatars walking the aisles together. Real-time multiplayer is a project
  of its own — parked here so it's on the record, not in the way.
Far-away friends (not on your Wi-Fi) need the future remote-access work
first — same rule as everything else: no ports open to the internet.

## Phase 4 — DLC PACK SYSTEM 💿
**Goal:** sellable content packs of the owner's music (rights retained).
- [ ] `pack.json` manifest (name, art, theme, credit) inside any folder
- [ ] Pack-aware wing: signage, styling, gold-record wall from the manifest
- [ ] v1 test pack = the 113 MB folder (fits workspace post-cleanup)
- [ ] Store page: Gumroad/itch.io/Lemon Squeezy (they handle payment+delivery)
- [ ] LICENSE note: app stays CC BY-NC-SA; packs are owner's commercial content
**GATE:** a pack folder dropped into a media spot dresses its own wing.

- [x] **t77 surround research + implementation** (owner brief): Resonance
      Audio (Apache-2.0) chosen over Steam Audio/OpenAL/Cavern (wrong layer
      for a browser app — full matrix in docs/SURROUND.md); dance-hall ring
      now renders as an Ambisonic soundfield; WebAudio fallback kept.

- [x] **Publishing path set (owner: $0 budget)**: GitHub (source + exe
      Releases) + itch.io (free public download page) — Steam parked unless
      the project ever earns its $100. Guide: docs/RELEASE.md.

## Phase 5 — BACKLOG 🧰
DJ FX rack (reverb/echo/flanger/filter) · headphone PFL via output-device
selection · live set recording · crates sidebar · compatible-key highlighting ·
macOS/Linux desktop builds · Office .docx editing (only if demanded).

---

## Ship history (most recent last)
t63 volume/EQ logic · t64 DJ booth Pro Rig + jukebox deck completed ·
t65 theater-mirror jukebox + gold-record wall + wide booth ·
t66 audio/usability audit · t66b ear-level store ring + novice aids ·
t67 sub-band dynamics + booth flex + dance-ring bug ·
t68 fresh-install grabber fix + zip hygiene (63/63 on clean data) ·
t86–t89 multi-source + shelf-map fixes + grabber case art + dance-floor lights 2.0 (85/85 ×2)
