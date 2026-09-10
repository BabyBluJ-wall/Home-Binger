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
      docs/RESEARCH-DANCE-LIGHTS.md wave-2 section. Ships as the NEXT
      version (1.8.8 zips already delivered; pkg bump at ship).
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
