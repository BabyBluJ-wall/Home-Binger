# 🗺️ Home Binger — Project Roadmap

*From a single video-store room to a full media building. Updated every turn.*

**Current phase: 1.8.1 BUILT FOR TESTING** (updated 2026-09-09) — friends' shelves are in; next up: the built-in remote-access helper (Tailscale on-ramp) + HB↔HB rung 2

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

## THE CORDCUT CO-OP (TCC) 📡 *(THE UMBRELLA PROJECT — HB is its face; DLC stays last overall)*
**v2 (owner's model, finalized 2026-09-07):** a FEDERATION OF EQUALS —
every member runs their own HB, curates their store from the members they
follow, publishes only the folders they choose, per follower. **Launch =
NO dues** — everyone self-manages (own parts, power, digitizing); mesh
membership is free. The Hearth (dues-funded shared always-on node, $15/mo,
solar) is DEFERRED to a growth-stage decision. Shared virtual LAN
— **Tailscale chosen
2026-09-09** (free: 6 people per circle, unlimited devices each, node
sharing beyond; re-verified on the live pricing page that morning;
ZeroTier = by-hand fallback) = no port forwards for anyone,
nothing public. Doctrine: security, privacy, ownership.
Phases: **A** co-op LAN + hardening · **B** many remote Plex/Jellyfin ·
**D** TCC face + grabber previews · **C** the Follow Link (HB↔HB — the
big one; **PUBLISH GATE: TCC goes public when C works**) · **E** self-
serve digitization guide · **F** the Hearth (deferred).
Decisions locked: approval-based follows · per-follower share lists ·
NO transitive sharing · founder's always-on PC = just his reliable node.
2026-09-09: owner drafted the public **"Circles" pre-announcement** (HB↔HB
sharing tease). Reviewed: anywhere-access to your own HB is FREE (not a
paid perk — flip that line); "6 members" is the Tailscale framing (ZT free
= 10 devices) — posting it effectively picks TS, so it HOLDS until the
vendor call; HB never charges (only the VPN's own plan past free).
Rewrite + notes: /home/user/ANNOUNCEMENT-CIRCLES-DRAFT.md (workspace-only).
TCC NAME-DROP (2026-09-09 AM): owner — "I think its time" — the circles
announcement now closes with HB "joining The Cordcut Co-op (TCC) — more
on that soon!!" Tease only: the Phase C publish gate is unchanged, and
repo uploads stay TCC-swept (the name is public now, the plan is not).
Deliverables: **docs/TCC-PLAN.md** (master plan v2 + legal map + IP
posture) · **docs/TCC-PITCH.md** (public pitch, ©/™ marked, publishes
when the gate passes).

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

## t93 wave — STORE POLISH (owner requests 2026-09-09) — ✅ SHIPPED as 1.7.0, LIVE + VERIFIED on GitHub 2026-09-09
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
*(1.7.0 LIVE + verified 2026-09-09: repo 29/29 files identical, release asset byte-identical.)*

## t94 wave — SHIPPED in the 1.8.0 build (opened 2026-09-09; folded into one bigger release by the owner)
- [x] **In-app new-version notice** — GET /api/version/latest (10-min
      cache, quiet-fail, admin kill-switch + feed override in config),
      toast + link 5 s after boot, external links via shell.openExternal
      in the exe. Verified in-suite (t96) AND live in the real exe
      against GitHub. NO auto-download ($0 doctrine).
      **t100+t101 (2026-09-10, ride the next update): the notice is
      STICKY — no auto-fade; the ✕ OR the "Get it" link dismisses it;
      the app rechecks ~every 30 min while running (a release that
      ships mid-session surfaces on its own); dismissal lasts the
      session, and the note returns on the next launch.**
- [x] **Update-path hardening** — adoption ranks ALL data sources (sibling
      folders + %APPDATA%) by db.json mtime, newest wins, and only
      renames/removes a source after the copy VERIFIES. CLICK-THROUGH
      VERIFIED 2026-09-09 in real Electron, 4 scenarios: fresh boot ·
      sibling adoption + rename · roaming adoption + cleanup · STALE
      sibling vs FRESHER roaming (the owner's exact bug — roaming won,
      stale sibling untouched).
- [x] **t98 follow-up (owner report: "my profile didn't move from 1.7 to
      1.8")** — root cause: "Extract All" gives each version its own
      wrapper folder, and the finder only looked one level deep. FIXED:
      the finder walks up ≤3 ancestors and scans each subtree for
      Home?Binger* folders with data (same parent, wrappers, even a
      different subfolder of Desktop/Downloads); system/AppData/temp dirs
      never scanned; a run FROM the temp dir never adopts; adopted-from.txt
      provenance note; t98b freshness guard — a source used <10 min ago
      (a live second copy) still donates data but is never renamed/removed.
      PROVEN in real Electron, 7 isolated scenarios B/C/E/E2/F/G —
      including the owner's exact wrapper layout (E) and two-live-copies
      (G: adopted, NOT renamed). START-HERE + exe pointer wording updated
      ("anywhere nearby"). Rides the next exe.
- [x] **RELEASE-NOTES-v1.8.0.md** written (standing release-notes doctrine).
*(BUILT 2026-09-09: HomeBinger-1.8.0-beta.zip — suite 94/94, exe
click-through clean, Tailscale installer + REMOTE-ACCESS.md + CREDITS.md
in the folder; repo pack 75 files TCC-swept ×0. Awaiting owner upload.)*

## t95 wave — DANCE RIG 3D + BEAT LOCK + personal-settings verification (owner requests 2026-09-09 PM)
- [x] **Music-synced 3D motion** — the owner: "i really want them to sync to
      the music and move around not just on an x,y axes." BEAT GRID: motion
      lands ON the kicks (beats + fraction-of-beat) instead of drifting
      free. Two new programs: **Orbit cones** (full 3D cones, quarter-phase
      apart) + **Beat jump** (fresh 3D pose every kick — pan AND tilt); the
      classic four got real tilt motion on the same grid. The truss itself
      circles the floor with the music; beams zoom-punch on the kick
      (lens WIDTH — brightness stays music-only, movement knob never dims).
      Strobe program untouched (t86 fan contract preserved).
- [x] **Profiles verified end-to-end** — rename (t90), invite (t84), and
      password change now has coverage (NEW t95: wrong-old rejected, min
      length enforced, round-trip login). BUG FOUND + FIXED: "Reset ALL my
      settings" silently skipped the dance-floor prefs — now it resets them
      (t95 exercises the real button).
- [x] **Theme app-wide re-verified** — t93Theme extended with a 5-family
      accent sweep (brand mark, settings headings, HUD buttons, choice
      cards, sidebar tabs).
*(Suite: 90 → 93 checks; rides the 1.8.0 release.)*

## Remote-connections wave — TCC COMES ALIVE 🌐 *(OPENED 2026-09-09 — owner: "TCC is now public with the app able to connect to other apps")*
- [ ] **The wire** — in-app Tailscale on-ramp in Admin → Server (detect the
      client → guide login → green "reachable remotely" + MagicDNS
      address) — NEXT after the 1.8.0 tester round. Nothing public, ever;
      Funnel stays off-doctrine.
- [x] **docs/REMOTE-ACCESS.md** — written 2026-09-09 (install, login, MagicDNS address, node sharing, quarantine note, speed, triage).
- [x] **docs/CREDITS.md** — Tailscale section added 2026-09-09 (BSD-3-Clause client + Wintun Prebuilt Binaries License; unmodified official installer).
- [x] **Bundled installer — INSIDE THE MAIN ZIP** (owner's call, 2026-09-09):
      the unmodified official Tailscale installer ships as a file in the
      app folder (~+35-40 MB). Build recipe: fetch the stable installer
      verbatim at 1.8.0 build time; CREDITS notice + in-app guide point
      at it and at the official download.
- [x] **HB↔HB rung 1 — t97 (BUILT 2026-09-09):** "Add a friend's Home
      Binger" (Admin → Server → Friends' stores: address + code + Test) ·
      host-side Friend sharing (invite → minted friend code → per-friend
      share lists of OWN shelves · revoke = delete) · friend-as-a-source
      adapter (their shelves = new sections, streams THROUGH their store —
      tokens stay home) · per-user My Media toggles · NO TRANSITIVE SHARING
      enforced at the wire (friend-sourced items filtered from every
      outbound catalog + share lists) · token-gated public API
      (/api/friend/catalog|stream|poster). Verified by a REAL second HB in
      the suite (t97). docs/FRIEND-SHARING.md written. Ships in **1.8.1** (DECIDED
      by owner 2026-09-09: the fixing release).
- [x] **t99 follow-up (found in the Person A / Person B simulation,
      2026-09-09): mutual follows fetched in a circle** — with A and B
      following EACH OTHER, cold-cache catalog builds circled (A's build
      pulled B's catalog while B's pulled A's) → boots stalled at 3/6
      items until the 8 s timeouts unwound. Friend-facing endpoints
      (/api/friend/catalog, the stream + poster findItem lookups, admin
      friend-sections) now serve OWN content only (stores: []) —
      friend-sourced items were never re-shareable, so nothing friends
      see changes. Regression-locked in the suite (t99MutualFollows:
      both stores fully stocked, ~3 ms, no stall) and the full remote
      simulation runs ALL_OK.
- [x] **1.8.8 WAVE, PART 1 (2026-09-10, in tree — rides the 1.8.8 exe):**
      theme app-wide round 2 (menus/sidebar/front-door follow the WALL
      color, ink/muted auto-flip for light walls, themed ceiling +
      speaker accent rings — they were frozen at boot) · slider memory
      (pro-rig sliders restore their true positions across close/reopen)
      · light-rig realism (truss BOLTED — beams sweep, fixtures don't
      carousel; all 6 programs sharpened; movement/speed ranges to 3×) ·
      mirror-ball spin setting removed (ball spins with the music) ·
      light controls OUT of settings (t108b: into the DJ BOOTH panel —
      owner course-correction 2026-09-10; the jukebox menu is music-only
      again, as before t104) ·
      friend-share lists = groups only (All/None picks, source-grouped;
      Test toast reports shelf names, never a title). Suite 99/99 ×2.
- [x] **1.8.8 wave, part 2 (DONE 2026-09-10, suite 101/101 ×2):**
      t107 shelf fix — custom placements were ignored for sections
      without IDs (Plex/Jellyfin): the map saved 'auto:'+title keys,
      the engine pooled raw titles; unified + legacy alias, saved pins
      keep working · t108 FULL DJ BOOTH (owner spec): 8 cues, loops
      ½–32, slip, platter scrub, pitch ±6–WIDE + nudges + doubles,
      trim +12 dB, isolator kill −40, sound-color FX (filter/dub),
      xf assigns A/THRU/B, beat FX (echo·reverb·flanger·stutter·brake
      + paddle), mic w/ auto-duck, master recorder (WebM), AUTO-DJ
      16-beat mix, staging crate + Camelot/BPM filters + harmonic
      glow, 3-band RGB waveforms (600-col cache), glass obsidian UI,
      live booth-laptop monitor (CanvasTexture HUD), responsive
      compact mode <1100px. PENDING SUB-ITEMS: ♭/♯ key shift, PFL
      headphone cue. Package bumps to 1.8.8 at ship.
      **SHIPPED 2026-09-10: pkg 1.8.8, suite 101/101 ×2 (version verified),
      exe + source zips + release notes built, gofile backup
      gofile.io/d/WkUW01f0 — waiting on the owner's GitHub upload
      (tag v1.8.8, not pre-release).**
- [x] **MOVEMENT WAVE t109 (owner 2026-09-10: "each light can go on an x y
      axis and make a circle… I want the lights to point and make a circle
      where its pointing" + "the spotlights need to move more") — DONE
      2026-09-10, suite 102/102 ×2:** 7 continuous shape programs (Circle
      · Figure-8 · Breath · Stadium arc · Fan · Snake · All-eyes) on the
      beat grid (one figure/bar; pan describes, tilt = diameter; frozen
      when the music rests — t59 stillness contract held), kick flare
      (kp-coupled tilt push), sweep + spread knobs in the booth strip,
      shortest-path pan (no unwinds), Auto rotates all 13. Research:
      docs/RESEARCH-DANCE-LIGHTS.md wave-2 section. **SHIPPED + LIVE 2026-09-10:
      release v1.8.9 verified on GitHub (plain v-tag, not prerelease,
      asset 107,529,290 B exact match, notes pasted, repo source = 1.8.9
      with the wave + booth lights + shelf fix confirmed in-tree);
      suite 102/102 ×2; gofile backup gofile.io/d/eq5cBkTW.**
- [x] **t110 TRADEMARK DOCS (2026-09-10, owner directive via task note):
      README** — title `Home Binger™`, intro now "The 3D Storefront for
      The CordCut Co-op™ (TCC™)", License section → "License & Trademarks"
      (code license vs brand protection), footer legal block. **New
      TRADEMARKS.md** — permitted uses (compatibility statements, links,
      reviews) vs prohibited (forks must rebrand, no false endorsement,
      no commercial, no domains/handles), Discord + GitHub contacts.
      build-desktop.mjs bundles TRADEMARKS.md in future exes. Links
      verified; all README sections intact. **DOCTRINE CHANGE: public
      files are NO LONGER TCC-free — TCC is announced and now openly
      branded; do not strip ™/TCC references from public files.**
      ANNOUNCEMENT-CIRCLES-DRAFT.md deleted (TCC announced). Source zip
      for upload: HomeBinger-1.8.9-trademarks-source.zip.
- [x] **t111 AUTO-DJ RELIABILITY + LAPTOP QUEUE + BOOTH PERF (owner
      2026-09-10: "Auto dj is amazing. Can we have it show up next songs
      on the laptop when the menu is closed? … The auto dj also stops
      from time to time … I need the dj booth tested and optimized") —
      DONE 2026-09-10, suite 103/103 ×2.** Fixes: from-deck PAUSED at
      fade end (was never paused → both decks "playing" → the load gate
      locked = the stall), no BPM gate (default-tempo beats), engine on
      a 400ms setInterval (the render loop stops when the tab is hidden
      — the mix no longer does), crossfade scheduled on the AUDIO CLOCK
      (linearRamp, zero-pop, survives page throttling), emergency
      no-dead-air path (nothing audible + queue → next starts), stopAll
      switches AUTO-DJ off. HUD: info().autoDj.{next,remaining,pos} →
      paintHud queue block (N LEFT + next 3 + bass strip) replacing the
      VU while the mix runs; ~20fps repaint. Perf: renderList capped at
      250 rows (+ "N more" note), peaks cache LRU-capped at 40, mic
      analyser buffer reused (no per-frame allocation), getLevels 8ms
      cache (one FFT read/frame), drawWaves idles while the modal is
      closed. Test t111AutoDj: trigger-without-BPM, from-deck-pauses,
      no dead air, queue data, hard-kill recovery, clean stop.
      **Ships with the trademark docs (t110). SHIPPED 2026-09-10 as 1.9.0:
      pkg 1.9.0, suite 103/103 ×2 (version verified), exe + source zips +
      release notes built (TRADEMARKS.md rides in the exe), gofile backup
      gofile.io/d/vP6yftL3 — waiting on the owner's GitHub upload
      (tag v1.9.0, not pre-release).**
- [x] **t112 THE PERSONAL DJ — PRO AUTO-DJ TRANSITIONS (owner
      2026-09-10: "I want a smoother auto dj… mix and fade the songs…
      research how the best songs are played on the dj booth and how
      they are mixed… my own personal dj when i dont want to dj
      myself") — DONE 2026-09-10, suite 104/104 ×2.** Research in
      docs/RESEARCH-AUTODJ.md (pro transition guides + Mixxx AutoDJ
      internals — Mixxx admits it ignores volume/frequency/rhythm; our
      booth already has BPM/key/EQ/color-filter/echo/waveforms to
      script, so we do what it can't). Engine (djpro.js only):
      pickMixStyle per pair — Δbpm ≤4% + camelotOk → 16-beat BLEND
      with the BASS SWAP (incoming layers in at −24 dB bass, low end
      swaps at 60% of the fade — one bassline at a time); ≤8% or key
      clash → 12-beat FILTER fade (incoming opens from behind a
      high-pass, outgoing thins out); else 2-beat ECHO out.
      PHRASE ALIGNMENT: fires on 32-beat phrase lines, else 8-beat bar
      lines, never mid-bar when avoidable. Countdown silence-trimmed
      (audibleExtent waveform map — outro silence doesn't get mix
      time); incoming silent lead-ins (>0.3 s) skipped. DRIFT GUARD:
      phase error >0.06 beats → rate nudged ±1.5%, key lock on, pitch
      steady. Clean handback at fade end (knobs back, filters neutral,
      echo off) + WALKAWAY TIDY on mid-blend off-switch — the bug
      t111's dead-air drill exposed (stopAll mid-fade left the
      incoming deck's bass cut; filter style also leaked colorWet +
      a stuck echo). info().autoDj += style/swapped/liveFadeBeats;
      HUD shows the live style. Test t112PersonalDj: mix-brain table
      (5 pair types) + camelot rules + live blend (on-grid fire,
      bass cut at fire, swap, restore, no dead air) + walkaway clean.
      **Folds into 1.9.0 — no extra version bump; zips + release
      notes rebuilt (see DELIVERY.md).**
- [x] **t113 SCROLL-LOADING LIBRARY LIST + LIVE QUEUE COUNT (owner
      2026-09-10, testing the 1.9.0 build: "for the music list i want it
      to load while it scrolls. Someone may not remember all the songs
      they have." + "the que was also buggy when trying to have it show
      when the panel is closed. it would only show that 1 is in cue.") —
      DONE 2026-09-10, suite 105/105 ×2.** LIST: first LIST_CHUNK (150)
      rows render, +150 per scroll near the bottom (≤8 chunks per event),
      hard DOM ceiling LIST_CEIL 3000 then "keep typing to narrow";
      search/filter/tab switches reset to the top chunk; footer note
      "… N more — scroll to load". Replaces t111's flat 250-row cap.
      QUEUE ROOT CAUSE: the Q button pushed to the STAGING list while the
      engine played a snapshot copy taken at toggle time — adds while
      running never reached the live queue, so the laptop count never
      moved (with one song staged it read "1 LEFT" forever). FIX: Q while
      AUTO-DJ runs appends to the live engine queue (dedup by ID, not
      object identity) and mirrors to staging so off/on restarts keep the
      night's list; crate-starts mirror into staging too; OFF no longer
      clobbers the engine queue (resume where you left off);
      refresh(newItems) remaps queued items by id onto fresh objects and
      drops ghosts. BUG THE TEST CAUGHT (mine): the toggle's staging
      mirror aliased its source — `autoQueue.length = 0` wiped the array
      being copied, so starting from Q-staged songs began with an EMPTY
      queue; fixed by copying before the wipe. Test t113ScrollQueue: 230
      placeholder tracks through a /tmp local spot + the app's own
      reloadLibrary restock (no page reload — later blocks keep state);
      scroll loads all rows, search resets to one chunk, Q×3 + toggle →
      "3 LEFT", +1 while running → 4 (the owner's exact bug), off/on
      keeps 4. **Folds into 1.9.0 (owner hadn't uploaded yet — v1.8.9
      still live); zips + release notes rebuilt (see DELIVERY.md).**
- [x] **t114 THE DJ MIX — REAL BEATMATCHING + INSTANT SONG INFO + 3-BAND
      LAPTOP METERS + BASS-DRIVEN LIGHTS (owner 2026-09-10: "it still just
      cuts from one song to another… I want the music to beat match and
      fade, mix, or even remix… levels… high mid and low… lights… move to
      deeper bass and livelier music… are there any open source dj mix
      programs we can use?") — DONE 2026-09-10, suite 106/106 ×2.**
      ROOT CAUSE OF THE CUTS: BPM detection was LIVE-CLOCK ONLY (a deck
      needed ~8 PLAYED beats before its tempo existed) → the incoming deck
      at transition time ALWAYS had bpm 0 → syncTo never ran, drift guard
      never ran, phrase alignment ran on a garbage grid. Every transition
      was an unsynced overlap — "it just cuts". THE FIX — instant info
      pipeline: (1) FILE TAGS read server-side (server/lib/tagmeta.js —
      ID3v2.2 TBP/TKE · v2.3/2.4 TBPM/TKEY · Vorbis BPM/INITIALKEY · MP4
      'tmpo' + iTunes freeform initialkey, moov at head OR tail; bounded
      reads, never the whole file) ride the library API (route whitelist
      += bpm/keyTag) — DAW exports carry BPM by default and the owner
      makes music; (2) OFFLINE ANALYSIS in computePeaks (same decode as
      the peaks): onset-flux envelope → octave-aware autocorrelation
      tempo (folded 70–180) → first-strong-onset grid0 → chroma key via
      compact radix-2 FFT (the aubio/librosa recipe, ours in
      dependency-free JS — GPL libs can't ship in HB; research table in
      docs/RESEARCH-AUTODJ.md); (3) PRE-ANALYSIS: autoDjTick analyzes the
      next 3 queue items in the background; (4) dk.load prefills
      bpm/key/grid from cache → tags, live detector still refines.
      ENGINE: loadNext gains `synced` (both tempos known) → syncTo +
      16-beat blend when synced, radio-safe 10-beat crossfade when not;
      drift guard only runs with REAL grids (gridReady — live beat or
      offline anchor); blend gains the SWEEP-OUT (outgoing colorHPF
      20→400 Hz from 70% — handback neutralizes); echo gains the BEAT
      ROLL (1-beat loop on the outgoing's final beat, released at
      handback + walkaway). info() += bands {lo,mid,hi}. HUD: AUTO-DJ
      view replaces the bass strip with LOW/MID/HIGH columns down the
      right edge (owner's ask). LIGHTS (dance.js): onset-flux kick (the
      kick must be a RISE: flux vs the track's own flux average +
      softened level test) — the old "clear your own rolling average
      ×1.3" was mathematically unreachable over a loud sub-bass bed (the
      owner's slow/flowy bias); tempo-adaptive refractory (0.16–0.3 s,
      62% of last interval); deeper kicks travel further (pose jump +=
      flux×5, movement never brightness — t93 doctrine holds); beat
      punch decay scales with detected BPM. Tests t114DjMix: tag e2e
      (crafted ID3 mp3 → API bpm 124/keyTag 8B → deck bpm 124 + key
      "8B" at load, no playing, no wait), keyTagToCamelot table (8A ·
      F# minor→11A · Gb maj→2B · Am→8A · C→8B · Bbm→3A), unknown-tempo
      → blend (never echo), offline bpm+key before the mix, live
      transition: SYNCED 16-beat blend with tempo known at fire + rate
      matched + no dead air + clean handback + walkaway clean, HUD
      bands, lights: deep-bass pattern (0.65 bed / 0.85 kicks @150 BPM)
      fires 6.9 beats (old detector: 0) + flowy pattern still fires.
      **Folds into 1.9.0 (still not uploaded — v1.8.9 live).**
- [x] **t115 FINITE QUEUE + THE FESTIVAL LIGHTS (owner 2026-09-11: "the
      que auto repeats. Lights are still a bit off." + the 4-fixture
      festival-engine spec: 6 signature patterns, floor-impact spots,
      drop detection) — DONE 2026-09-11, suite 107/107 ×2.** QUEUE:
      loadNext treats the set as FINITE — when idx reaches the queue end
      the engine switches itself off (toast "set complete"), the last
      song plays out, no wrap/replay; info().pos/remaining/next are
      finite math; a PASSED queue always resets idx (resume = pass
      nothing); pre-analysis never re-analyzes wrapped ghosts. LIGHTS
      ROOT CAUSE ("still a bit off"): under the DEFAULT 'XYZ' Euler
      order, rotation.y (PAN) had NO effect on a down-pointing cone —
      verified in Node (beam azimuth pinned at π for any pan). Every
      beam tipped toward the same world direction; only tilt showed.
      FIX: pivot.rotation.order = 'YXZ' (pan outermost — the real
      moving-head convention) — every existing pattern now draws what it
      claimed to. THE FESTIVAL SIX (programs 13-18, all through the
      aimTyTx converging-pan/tilt solver): SCISSOR CROSS (mirrored pans
      ±sin(sg), tilt crossing ctrTilt twice a bar), VORTEX CYCLONE (all
      four chase an orbiting floor point, spread = chase spacing, 1
      orbit/bar — fast enough to feel, slow enough for the ease caps),
      DIAGONAL X (pairs 0+3 / 1+2 slice the two diagonals 90° apart),
      SINE WAVE CHASE (i·π/2 phase offsets), GROUND SWEEP (parallel
      steep searchlights, targets kept inside the head ring — 4.27 m
      ceiling geometry), DROP EXPLODE (corner snaps + 3× orbit + WHITE
      beams + strobing impact pools). DROP DETECTOR: energy-spike
      (kick && flux > max(0.06, fAvg·2.2) && (energy > 0.65 || bass >
      0.9)) seizes the rig for 2.2 s in AUTO mode only (locked looks
      win). FLOOR-IMPACT SPOTS: 4 additive pools tracked from the live
      pan/tilt (the same math inverted), sub-bass pulsed. AUTO-ROTATE:
      every 32 beats (8 bars) over 19 programs; pattern select +
      setPrefs whitelist extended. Canonical+shortest-path pan (wrap
      current, ease toward nearest-equivalent target — bounded
      telemetry, no long-way sweeps; scanner exempt from the kick-flare
      tilt). MEMORY: computePeaks now decodes MONO 22 kHz (a quarter of
      the decoder memory — the suite OOM'd decoding every queue clone
      at full fidelity on the 2 GB box). Tests t115FiniteFestival:
      finite queue (1-song queue → transition → handback → last song
      plays out → engine off, remaining 0, nothing playing), Euler
      proof (az spread 4.71 across corners), scissor (mirrored yaw
      range + tilt crosses center), vortex (landings within 3.5 of the
      orbit center), ground sweep (steep + front-to-back), drop blip
      fires on a spike, 4 floor spots. t109/t59/t51 assertions updated
      (19 programs, 32-beat rotation, select 20 options).
      **Folds into 1.9.0 (still not uploaded).**
- [x] **t116 THE POOLS TAKE THE BEAM'S SHAPE (owner 2026-09-11: "floor-
      impact pools that track where each beam lands should match the
      shape of the light. The light is a cone so it shows in a circle")
      — DONE 2026-09-11, suite 107/107 ×2.** The impact pools were flat
      SQUARES (PlaneGeometry 2.6×2.6) — a decal, not light. Now: unit
      CircleGeometry (28 seg) + a shared soft radial-gradient CanvasTexture
      (additive, center-hot → transparent edge), scaled per frame from the
      REAL cone geometry: minor = axial-distance-to-floor × tan(half-angle)
      (CONE_TAN = 0.95/6.2) × the lens zoom (r.z — pools punch open on
      kicks with the beams); major = minor / cos(tilt) clamped 3.5×,
      aligned to the beam's horizontal direction (rotation.y =
      atan2(−dz, dx)); grazing beams smear long like real light. Size
      clamps (minor ≤ 2.2, major ≤ 4.0) keep the room readable; opacity
      softens as the pool spreads (/√elong). info() += spotShape
      ('circle' — a geometry-type assertion, so a square can't sneak back)
      + spotScales [semi-major, semi-minor] per head. Tests (in
      t115FiniteFestival): steep program (ground sweep) → all four pools
      near-circular (minor/major > 0.6); tilted program (vortex) → pools
      elongate (max major/minor = 1.83); spotShape === 'circle'.
      **Folds into 1.9.0 (still not uploaded).**
- [x] **t117 NO TEMPO RATCHET (owner 2026-09-11: "the auto dj when
      picking songs that go faster in the begining make the songs after
      go faster and keeps them faster. If you let that go itll just get
      worse") — DONE 2026-09-11, suite 108/108 ×2.** ROOT CAUSE: the
      drift guard could hold a ±1.5% rate nudge through the end of a
      blend, handback never shed it, and every later syncTo inherited
      the inflated EFFECTIVE tempo — so a fast early song (or any held
      correction) ratcheted the whole set, compounding over the night.
      FIX (3 parts, djpro.js): (1) THE TEMPO SHED — the transition
      carries its `matched` rate and handback resets the surviving deck
      to it exactly; transient corrections never enter the set tempo.
      (2) DRIFT GUARD HYGIENE — nudges capped at ±0.8%, and a big
      offset (≥0.35 beat) is treated as a GRID misalignment: the grid
      re-anchors (grid0 += e·spb) instead of bending tempo (the old
      chase could hold a nudge forever). (3) TEMPO RELAX — between
      blends the live deck eases back toward its NATURAL tempo at
      ≤0.06%/s (key lock keeps pitch; beatmatching happens AT each
      blend so nothing is lost; only runs while AUTO-DJ is on and no
      fade is in flight — with the engine off the DJ's rate is
      untouched). Test t117TempoRatchet: mid-blend sabotage (+5% on the
      incoming deck) is shed at handback (post-fade rate 1.0015), the
      chain holds the set's own tempo flat (129.4 → 129.4 BPM
      effective), a forced 1.06× rate relaxes while the engine runs
      (1.0567 after ~5 s), and the control (engine off) leaves a
      manual 1.06× untouched.
      **Folds into 1.9.0 (still not uploaded).**
- [x] **t118 FULL BOOTH VALIDATION (owner 2026-09-11: "fully test the
      dj booth make sure everything on it works as intended. If you
      need songs try using the ones i have on suno. Just DO NOT include
      them in the project") — DONE 2026-09-11, suite 112/112 ×2.**
      TEST MATERIAL: the owner's Suno songs can't be downloaded without
      a login (signed CDN URLs — cdn1.suno.ai returns MissingKey), so
      the bench is SYNTHETIC GROUND TRUTH instead: five engineered
      tracks (tests/media/bench, git-ignored — never in the project or
      zips) with exact BPM (90/120/124/128/174), known camelot keys,
      harmonically-realistic spectra (kick click layer, pad partials),
      and engineered silence bookends. BATTERY (4 checks in v35.cjs):
      (1) DETECTION ACCURACY — all 5 BPM within ±0.8% (worst −0.61%)
      and all 5 keys exact; (2) DECK CONTROLS through the real DOM —
      cues set/jump (cue0-indexed pads), auto-loop 4 wraps and clears,
      beat jump ±4, slip snaps back, instant doubles clones track+pos+
      rate, SYNC matches rate AND phase, keylock, pitch fader ±8% with
      range select, EQ bass kill at −40 dB, color knob+mode, nudge hold
      +6%, trim — all green; (3) AUTO-DJ STYLE MATRIX — 120/8B →
      124/7B = blend 16 beats + bass swap + 2 s silent intro trimmed to
      1.78 s, → 128/8A = filter 12 beats (key clash), → 174/11A =
      echo 2 beats with fx engaged at fire, no dead air, no ratchet,
      finite queue ends clean; (4) PERIPHERALS — mic toggle + duck −24,
      REC arms/runs/stops, save/load set round-trips rate+cue+fader+
      curve, beginner↔pro, help overlay. FIVE REAL BUGS FOUND+FIXED
      (djpro.js): (a) offline BPM whole-hop quantization (±2.6%!) →
      parabolic peak interpolation (≤±0.8%); (b) syncTo phase mixed
      track-positions with wall beat lengths → up to 0.1-beat flam at
      rate ≠ 1 → now beat-fraction aligned (exact); (c) loadSession
      restored rate before pitch, so the fader re-derivation clobbered
      synced/auto-DJ rates on every set reload → rate restores LAST;
      (d) pickMixStyle checked key clash before the tempo jump, so a
      34% genre jump with clash got filter+SYNCED (a 174 track dragged
      to 0.70×) → jumps >8% always echo out at their own tempo;
      (e) audibleExtent required el.duration (NaN right after load) so
      the lead-in silence trim never ran → falls back to the peaks'
      decode duration. **Folds into 1.9.0 (still not uploaded).**
- [x] **t119 THEME APP-WIDE, FOR REAL (owner 2026-09-11: "The theme for
      the ui does not go app wide. I want everything except Logo type
      material to go with the theme") — DONE 2026-09-11, suite 113/113
      ×2.** THE GAPS: the DJ booth PANEL was a hardcoded neon palette
      (24 hexes, ignored every theme), the entry hall themed only at
      BOOT (never on a live change), the dance hall walls were
      hardcoded purple-black ENTIRELY, and the LOGO followed the theme
      when the owner wants it brand. FIXES: (1) booth panel CSS rebuilt
      on --vb-* derivations (surfaces from the wall via color-mix,
      text from ink/muted, controls from the accent; deck A =
      accent-soft, deck B = accent; wave canvas bg derives from the
      wall; search input + in-panel toast themed); (2) hall.js gets
      applyTheme — walls/floor/baseboards/ceiling(derived)/door trim/
      hanging signs (CLOSED keeps warning red); (3) dance.js gets
      applyTheme — club walls/ceiling/perimeter floor DERIVE from the
      theme (wall·45% black etc.), tile checker derives, speaker rings
      + sub mouths + booth glow + faders + laptop screen + DJ'S LIBRARY
      sign + record plaques wear the accent, HUD deck channels A/B =
      accent tints; (4) scene.applyTheme calls hall+dance; (5) THE
      LOGO IS BRAND: the 3D wordmark pins to #ff3ea5 on #0a0f2e
      (favicon recipe), .vb-logo + the boot ticket pin to brand pink —
      applyTheme no longer regenerates it. DELIBERATE KEEPS: the light
      show (beams/LED wall/pools), the LO/MID/HI meter trio, Camelot
      green, error/ok status colors, the TV (device), the exterior
      storefront (chain-brand look), neutral architecture (frames/
      metal/glass). Test t119ThemeEverywhere: wild green theme → booth
      computed styles derive (fx title = accent, deck B border =
      accent@40%, btn ink, panel glass = wall-derived rgba with
      parser for Chrome color(srgb) format), hall wall/floor/trim
      exact, dance wall = wall·55% + accent + tile base, logo stays
      rgb(255,62,165) everywhere, restore round-trips. t108 glass
      assert + t93 sweep updated to the new doctrine (glass = themed
      translucent; logo = brand, out of the sweep). NOTE: the t118
      bench regenerated at 22 kHz mono (13 MB) — detection identical
      (the app decodes to mono-22k anyway), and it now fits the
      workspace snapshot budget next to the release zips (the 44 kHz
      30 MB bench was silently dropped by the 128 MB snapshot cap
      between turns). **Folds into 1.9.0 (still not uploaded).**
- [x] **t120 THE REST OF THE UI FOLLOWS THE THEME (owner 2026-09-11:
      "what about UI? … The pink navy type background doesnt always
      look best when theme is changed. Go thru all ui and make sure it
      all is able to change other than the 2 things below" — the logo
      material + the functional colors) — DONE 2026-09-11, suite
      114/114 ×2.** THE GAPS: (1) --vb-card/--vb-line were set in
      :root only — every menu/modal/chip/tooltip/toast/HUD button kept
      Neon Night navy+pink forever; (2) --vb-panel (selects/inputs)
      was never set at all (navy #141a2e fallback); (3) ten hardcoded
      surfaces: TV remote (rgba(8,15,38,.82)), TV queue + shelf pager
      (rgba(8,12,30,.88) + GOLD borders), gate card + its input focus
      (rgba(10,14,34,.82) + gold), carry chip (rgba(8,12,30,.9) +
      gold), TV-fullscreen close (rgba(8,12,30,.85)), radio-card.active
      (pink .16), .badge (pink .18), 2× ui.js inline rgba(10,12,30,.55)
      inputs; (4) every in-world sign panel sat on hardcoded plum/
      navy: signage.js aisle lightbox textures (#0b1c4d default) +
      signEdgeMat #0b1330 + poster borderMat #0e1734, room.js/theater
      signs ×5 (#160f1e), hall.js signTexture default (#160f1e),
      dance.js DJ'S LIBRARY (#160f1e) — plus the deck's VHS·DVD·
      BLU-RAY label never re-themed its accent after boot. FIXES:
      themeVars() derives card (wall ±10% toward black/white by wall
      luminance, .94 alpha), line (accent 35%), --vb-panel (wall 50/35%
      toward black/white, .6/.75 alpha); the ten surfaces now ride
      card/line/panel vars (gold borders → the line); signBgOf(t) =
      mixHex(wall,#000,0.5) backs every sign (signage edges .65,
      poster frames .6), all redrawn live in applyTheme; theater desk
      label tracked + refreshed; info() hooks: signage.info() (bg/
      edge/border/count), hall/dance theme.signBg, theater
      signTheme(), exposed via scene signInfo()/theaterSignBg().
      KEEPS (owner-approved): logo material brand pink; light show;
      LO/MID/HI; Camelot green; REC/CLOSED/status; TV content;
      exterior storefront; neutral furniture/case plastics. Test
      t120UiAllFollowsTheme (green wall #1c4a2a + accent #7dff5a):
      root vars exact strings, 6 surfaces = card, badge/radio-active =
      accent tints, select well = panel, 4 rooms' sign bgs =
      #0e2515 + edge #0a1a0f + border #0b1e11, logo brand, restore
      round-trip. BENCH NOTE: bench regenerated with the silent-intro
      lead restored on b124f (2.5 s — t118's leadInSkip assert needs
      it; the first regen had music from t=0). **Folds into 1.9.0
      (still not uploaded).**
- [x] **t121 THREE OWNER NOTES (2026-09-12: "Music goes back a beat
      pressing s in the dance hall with music playing" · "Remove hover
      overlay for Dj menu" · "Rss podcasts Cant shelve as cd as cd was
      removed. Wont show up in jukebox as it should be able to be
      listed with all the music thats available to the user. Either
      that or we make it available on dvd. Either way a fix is needed")
      — DONE 2026-09-12, suite 116/116 ×2.** (a) THE S-KEY LEAK: the DJ
      modal's close only HID the modal (classList.add('hidden')), so
      djpro's window keydown listener + .djp DOM stayed alive after any
      booth session — walking with WASD then fired booth shortcuts (S =
      SYNC yanked the live deck onto the other deck's grid; Space/
      arrows/L/X/[]/cue digits all leaked too). FIX: ui.js closeDj()
      hides + proUi.unmount()s, wired to #dj-close AND the backdrop
      click; djpro unmount() now also root.remove()s (true teardown —
      the panel used to linger in the hidden modal). (b) HOVER: the
      booth laptop's "💻 Open the DJ menu" tip removed (sp === 'djbooth'
      → null, the t85 jukebox treatment; click still opens). (c)
      PODCASTS IN THE JUKEBOX: the classic deck's "Add music" was a
      <select> capped at music.slice(0, 120) — podcast episodes (late
      in library order) were unreachable from the jukebox. FIX: the
      t113 treatment — a #dj-q search box + #dj-list scroll list (150-
      row chunks, appends on scroll) over ALL music incl. episodes,
      click-to-queue; the dead select + 'add' branch removed. Podcasts
      still don't shelve (CDs gone) — the owner's option A. TESTS:
      t121BoothKeys (close→gone, S/Space/ArrowLeft/L/B leave the
      engine untouched, reopen ok, jukebox close ok, source asserts),
      t121JukeboxMusic (237 items: 150 chunk → scroll → all 237,
      podcast row reachable, 'Store Cast' search narrows exactly,
      click queues). DE-FLAKES: t118 rec timer now polls ~8 s (RAF
      painter stall under swiftshader froze the TEXT, engine fine);
      t121 scroll loop dispatches the scroll event explicitly. **Folds
      into 1.9.0 (still not uploaded).**
- [ ] **HB↔HB rung 2** — item-level share granularity · "friend store
      offline" indicator in the UI · follower-side browse polish.
*(DECIDED: ONE BIGGER RELEASE — t94 hardening + version notice + remote
connections all ship together as **1.8.0**; no separate 1.7.1. Owner,
2026-09-09.)*

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
t93 store polish → 1.7.0 LIVE (portable uninstall/update doctrine, movement lights, app-wide theme, pure shelf sections, multi-RSS; 90/90 ×2)
t94–t96 → 1.8.0 BUILT FOR TESTING 2026-09-09 (verified update adoption, new-version notice, dance rig 3D + beat lock, reset-all fix, password-change coverage, Tailscale bundle + remote-access docs; 94/94 + 4-scenario Electron click-through)
