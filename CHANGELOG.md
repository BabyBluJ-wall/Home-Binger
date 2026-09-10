## The lights really move now — the movement wave (built for the next release)
- **Each spotlight draws real shapes.** The four heads now sweep
  continuously — pan and tilt working together like real moving-head
  fixtures — instead of gliding to a new pose on each beat. Seven new
  programs:
  - **Circle** — all four heads draw one circle together, right where
    they're pointing (the classic pan-describes / tilt-sets-diameter
    recipe)
  - **Figure-8** — the infinity loop
  - **Breath** — a circle whose size slowly swells and shrinks (the
    smoothest look in the lighting books — great on slow songs)
  - **Stadium arc** — big slow fanned sweeps across the whole room
  - **Fan** — a peacock spread that opens across the bar and closes on
    the downbeat
  - **Snake** — the circle ripples around the rig, head to head
  - **All-eyes** — every beam converges, pans around like a searchlight
    team, then bursts outward on the kick
- **Two new knobs** in the booth's floor-lights strip: **Sweep** (how
  wide the shapes are) and **Spread** (how staggered the heads are —
  lockstep to full ripple).
- **The kick now pushes the beams** — every shape gets a little outward
  flare on each kick that settles before the next. Movement, never
  brightness.
- **Everything stays beat-locked**: one full figure per bar, on your
  song's own beat grid; when the music stops, the rig rests. The truss
  stays bolted — only the heads aim. Auto still rotates through all 13
  programs.

## 2026-09-10 — the 1.8.8 wave, part 2: the shelf fix + the FULL-FEATURED DJ booth
- **Custom shelf placements actually place now.** The bug you hit —
  pick a way to organize, set a few custom placements, and the custom
  ones never moved — was a key mismatch: the shelf map saved a
  section's display key, the shelving engine looked for a different
  one, and pins for libraries that don't number their sections
  (Plex, Jellyfin) silently fell through. Keys are unified now, and
  any pin you saved before the fix still works.
- **The DJ booth grew up.** It's a real rig now:
  - **Decks** — 8 hot cues each (keys 1–8), auto-loops from ½ to 32
    beats, beat jumps, slip mode (scrub or loop while the silent
    timeline keeps running), platter scrubbing, pitch faders with
    ±6/±8/±10/±16/WIDE ranges, pitch-bend nudges, and instant
    doubles.
  - **Mixer** — channel trims to +12 dB, three-band isolators that
    KILL at full left (−40 dB), a sound-color knob per deck (center
    is bypass: left sweeps the filter down into dub delay, right
    sweeps up), and per-channel crossfader assigns (A / THRU / B)
    with the sharp-to-smooth curve control.
  - **Beat FX** — tempo-synced echo (¼ to 4 beats), reverb, flanger,
    stutter roll, and a vinyl brake, with a depth control and a
    latching paddle.
  - **Mic** — live input with a two-band voice EQ; the music ducks
    automatically when you speak (−12 or −24 dB, fast attack, slow
    release).
  - **Recorder** — one click records the clean master to a file
    (WebM), with a live timer.
  - **AUTO-DJ** — queue tracks with the Q buttons (or point it at
    your staging crate); it loads the next track on the other deck,
    beat-matches, and rides a 16-beat crossfade by itself.
  - **The browser** — a staging crate, Camelot key and BPM-range
    filters, and rows that glow green when a track will mix with
    what's playing. A/B load a deck, Q queues, 🏷️ parks it.
  - **Waveforms** — real three-band overviews (red bass, green
    mids, blue highs) computed once per track, scrolling under the
    playhead.
  - **The look** — obsidian glass panels, spinning vinyl platters
    with artwork, a master VU in the top bar, and the booth's
    laptop screen is now a live monitor (track names, VU, AUTO-DJ /
    REC / MIC badges).
- **The light controls live in the booth, not the jukebox menu.** The
  dance-floor lights (Movement · Speed · Program) sit in the DJ booth
  panel right under the decks — the jukebox menu is music-only, the way
  it was.
- **Honesty notes:** the key-shift (♭/♯ while locked) and headphone
  PFL cue are the two spec items still pending — both need deeper
  audio plumbing and are queued rather than half-shipped. Recording
  lands as WebM (the browser's native).

## 2026-09-10 — the 1.8.8 wave, part 1: theme everywhere, honest sliders, a realer light show
- **The theme finally reaches EVERYTHING.** The menus, the sidebar, the
  front door — they used to stay the same dark blue no matter which theme
  you picked. Now the whole interface follows your wall color (and the
  text flips to stay readable on light walls). The ceiling and the
  speakers' accent rings follow the theme too — they were frozen at
  whatever was live when the store opened.
- **Sliders remember where you put them.** The pro DJ rig's sliders used
  to snap back to defaults whenever you closed and reopened the panel —
  your settings were still active, the knobs just lied about it. Now
  every slider shows its true position, every time.
- **A realer light show.** The spotlight rig no longer spins like a
  carousel — real fixtures are bolted to the truss and their BEAMS sweep
  the circles. Every program got a sharper signature (wider sweeps, darker
  gaps between chase hits, a harder drop on the four, bigger orbit cones,
  wider beat-jump scatter), and the Movement and Speed sliders now reach
  3×.
- **The mirror-ball spin setting is gone** — the ball just spins with the
  music, like it always wanted to.
- **Light controls moved into the DJ booth.** Movement, Speed, and the
  program picker live in the booth panel now, right under the decks —
  the lights are part of the rig. The Look menu points there.
- **Friend sharing speaks in shelves, not titles.** The connection test
  reports shelf names and counts — never an individual movie name — and
  the per-friend share list groups your shelves under their source, with
  All / None quick picks.

## 2026-09-10 — t100+t101: the new-version notice — stays till clicked, arrives mid-session
- The "a new version is out" note no longer fades away after twelve
  seconds — it STAYS on screen (link and all) until you click its ✕ or
  the "Get it" link. Either one closes it; the link still opens the
  download page in your browser.
- New versions are noticed WITHOUT restarting the app: it quietly
  rechecks about every half hour while it's open, so a release that
  ships while you're browsing shows up on its own. Closing the note
  keeps it closed for the rest of the session — it simply returns the
  next time you launch. Rides the next update.

## 2026-09-09 — 1.8.1: friends' shelves, safer updates

*The fixing release. Everything here landed after 1.8.0 went live — if
you're on 1.8.0, this is the one to grab.*

- **A friend's shelves, right in your store.** In Admin → Server, add
  their Home Binger (their address + a friend code they hand you) and
  the shelves they share become new sections you can browse and play
  like your own. Their movies stream through THEIR machine — nobody's
  Plex/Jellyfin logins ever move. They pick exactly which shelves you
  see, friend by friend; delete the friend and access ends instantly.
  No friend-chains: anything shared into your store can never be shared
  onward. Full how-to: FRIEND-SHARING.md (in the app folder).
- **Updating always finds your data now.** "Extract All" gives each
  version its own wrapper folder, and 1.8.0's updater only looked one
  level deep — some updates booted blank (your old data was never
  harmed, just not found). The finder now searches the surrounding
  folders properly and leaves a note (adopted-from.txt) saying where it
  took your data from.
- **Two friends following each other no longer stall.** If you and a
  friend added each other, the first shelf build could chase its own
  tail and open half-stocked for a few seconds. Found in our own
  two-store simulation; fixed and locked with a permanent self-check.
- **The new-version notice understands tags like "Rv1.8".** A release
  tag with a letter prefix no longer hides the update from anyone.

## 2026-09-09 — t99: friends who follow each other — boot stall fixed
- **Fixed: two stores following each other could open half-empty.** When
  you and a friend added each other (you follow them, they follow you),
  the very first shelf build could chase its own tail — your store asked
  theirs for shelves while theirs was asking yours — and the store sat
  partly stocked for several seconds before sorting itself out.
  Friend-facing requests now always answer from the store's own shelves,
  so the loop can't happen. What friends see is unchanged (and shared
  items were never re-shareable anyway).

## 2026-09-09 — t98: the update finder searches wider
- **Fixed: updating could boot fresh if the old and new folders weren't
  direct neighbors.** "Extract All" gives each version its own folder
  (like HomeBinger-1.7.0-beta\\HomeBinger-win32-x64), and 1.8.0's adoption
  only looked one level deep — so some updates started with a blank store.
  The finder now walks the surrounding folders (same parent, wrapper
  folders, nearby subfolders of Desktop/Downloads) to find your data, and
  writes an adopted-from.txt note into the data folder saying where it
  came from. If this happened to you: your old data is untouched — copy
  the old folder's "data" folder into the new one (or put the two app
  folders side by side) and relaunch.

## 2026-09-09 — t97: Home Binger ↔ Home Binger — friends' shelves, in your store
- **Add a friend's Home Binger.** In Admin → Server, paste their store
  address + the friend code they give you, hit Test, and their shared
  shelves appear as new sections in your store — browse and play them like
  your own. Everyone can toggle each friend's store in My Media.
- **Share YOUR shelves, friend by friend.** Admin → Server → Friend
  sharing: invite a friend and the app mints a friend code. Hand them your
  store address + the code. Tick exactly which of your shelves they see —
  each friend gets their own list. Delete the friend and their access ends
  instantly.
- **Your logins never leave home.** Friends' players stream through YOUR
  Home Binger — your Plex/Jellyfin tokens stay on your machine, always.
- **No friend-chains.** Shelves a friend shared into YOUR store can never
  be shared onward to anyone else — the share list only ever offers your
  own shelves.
- Works over your home network today; over any distance with the Tailscale
  setup from REMOTE-ACCESS.md (nothing is ever opened to the public
  internet).

## 2026-09-09 — 1.8.0: safer updates, dance lights that dance, remote access begins
- **Updates can't lose your profile anymore.** When a new version adopts
  your old data on first launch, the copy is now VERIFIED before anything
  gets renamed or cleaned up — if a check fails, the old folder is left
  completely untouched. (This is the bug that could eat a profile; it
  can't anymore.)
- **The app now tells you when a new version is out.** On launch it
  quietly checks GitHub and shows a small note with a link to the
  download. It NEVER downloads anything by itself — you click, you
  decide.
- **Optional remote access begins:** the official Tailscale installer
  (free, tiny, optional) now ships next to the app, with a plain-language
  guide (docs/REMOTE-ACCESS.md). Reach your store from anywhere — or
  share it with far-away friends — with nothing ever opened to the
  public internet.

## 2026-09-09 — t95: the dance rig goes 3D + locks to the beat
- **The dance-hall lights now MOVE to the music.** Sweeps, orbits and jumps
  land ON the kicks — every song locks its own groove instead of drifting.
- **Two new programs:** *Orbit cones* (the beams trace full 3D cones around
  the floor, quarter-phase apart) and *Beat jump* (a fresh 3D pose on every
  kick — pan AND tilt, like real moving heads). The classic four (sweep,
  chase, strobe, build & drop) got the same 3D treatment.
- **The rig itself now travels:** the light truss slowly circles the dance
  floor with the music, and each beam's lens punches open on the kick
  (width, never brightness — the movement knob still never dims anything).
- **"Reset ALL my settings" now really means ALL:** dance-floor light
  settings return to the defaults too (they were being skipped).
- Under the hood: password changes, self-rename and the app-wide theme all
  have regression coverage now (93 checks, all green).

## 2026-09-09 — t93: delete-the-folder is a complete uninstall again (+ easier updates)
- **Everything lives inside the app folder again — accounts, logins,
  settings, even the app's own caches.** Deleting the folder removes every
  trace: nothing left behind in AppData or anywhere else on your PC, no
  registry, no Program Files. (1.6.0–1.6.2 kept data in %APPDATA%; this
  version's first launch brings it home and cleans that up automatically.)
- **Updating got easier too:** you no longer delete anything. Unzip the new
  version (next to your old folder is fine) and open the NEW HomeBinger.exe
  — it finds your old folder, moves your data into itself, and renames the
  old folder "(old — you can delete this)". One tip: keep the app in a
  normal folder like Desktop or Downloads, not Program Files.
- **Dance-floor lights: the knob is now MOVEMENT, not brightness.** The
  owner's correction: "Intensity" was making lights brighter/darker —
  nobody asked for that. The renamed Movement slider now scales how FAR the
  fixtures travel (tight theatrical nudges → full-festival swings), the
  music and the program drive brightness on their own, and Speed (how fast
  the beams sweep) is clearly visible now that bigger movement makes the
  travel do real work. Saved 1.6.x settings carry over automatically.
- **Theme goes app-wide.** Found and fixed the real bug: a theme change
  updated the menus live but was never written back — so the save kept the
  OLD color, the case-view snapshotted the old accent, and any store
  rebuild flipped menus back ("they don't all change together"). Now every
  menu, panel, modal, button, slider and checkbox follows your accent,
  live, together.
- **Shelf sections tell the truth.** In Genre / By Library / By Type
  arrangement, every shelf unit now stocks EXACTLY ONE category — its sign
  says "Action", the shelf shows Action (big categories span consecutive
  units, the pager walks that category's whole catalogue). No more "says
  one category, shows two others." The admin shelf map still wins its
  shelves. (Plex-style strict sections.)
- **The podcast rack is properly multi-source.** Add as many RSS feeds as
  you like — each gets its own labeled shelf (give it a nickname if you
  want), and each has an on/off switch so you can park a feed without
  deleting it. Feeds saved by older versions keep working.
## 2026-09-08 — t92: theater walls bleeding onto the back wall + the jukebox crown
- **The theater's side walls no longer "show through" onto the store's back
  wall.** Same disease as the ceiling band, new spot: the theater's left and
  right walls ran 25 cm too long — straight through the shared wall — and
  their ends landed in exactly the same plane as the back wall's surface,
  so dark patches flickered on it (left and right of the theater door,
  worse at grazing angles). The walls now stop at the shared wall's
  theater-side face; nothing in the building shares a plane with a visible
  surface anymore.
- **The jukebox crown is a full arch again.** The glowing cathedral top was
  accidentally built as a half-arch — only the right side curved, the left
  was flat open (and you could see straight through it from certain
  angles). It now curves over both sides like a proper crown and renders
  from the inside too, so the see-through is gone.
## 2026-09-08 — t91: the ceiling "gray band" — found and fixed
- **The gray band on the ceiling near the theater is gone** (it sat between
  the pink and white lights and ran across the whole room). Cause: the
  roofline caps that ring the building were drawn around the store box —
  then the whole exterior shifted forward to mount the street facade flush,
  which dragged the back cap 2.6 m INTO the building. It hovered over the
  sales floor at exactly ceiling height, dead between the pink accent panel
  and the white light row: two surfaces sharing one plane, so the GPU could
  never settle on which one you see — a gray band that blinked as you moved
  (and depended on the viewing angle). The caps now sit on the walls they
  were drawn for, wrap the full building (store + front hall), and ride
  2 cm above the walls so a cap can never again share a plane with any
  ceiling — all five ceilings audited clean (store, hall, dance hall,
  DJ library, theater).
## 2026-09-08 — t90: exe updates keep your login, self-rename, entry-way polish
- **exe updates no longer wipe your account.** The desktop app now keeps all
  data (accounts, logins, settings, shelf maps) in `%APPDATA%\HomeBinger`
  instead of inside the app folder — delete the old folder, unzip the new
  one, and everyone's still signed in. The first launch of the new version
  moves existing data there automatically; nothing to do, nothing to lose.
- **Change your own name.** My Profile → "My name": any signed-in user can
  rename themselves (admins keep their admin-only rename too). Sessions
  survive the rename; duplicates are rejected.
- **The exe folder is easier to understand.** A "1 - START HERE" file sorts
  to the top and points at HomeBinger.exe; ~50 unused language packs are
  gone (the app is English), so the app stands out instead of drowning in
  lookalike files.
- **Entry-way visual fixes** (the "gray flicker straight ahead" report):
  the theater-side "↩ THE STORE" sign was buried inside the wall slab —
  now it hangs properly on the theater side of the doorway. Door glass no
  longer writes depth (transparent panes stacking at the entry could fight
  over pixels — now they blend cleanly). Camera near-plane raised for
  better depth precision on long grazing walls.
- Suite: 85 → 87 checks (t90Rename round-trip, t90Visual sign/glass/near,
  t62Uninstall extended with the persistence assertions).
## 2026-09-08 — t86–t89: multi-source, shelf-map fixes, grabber art, dance-floor lights
- **t87 · connect as many libraries as you like.** Admin → Server has a new
  "More libraries" section: add another Plex or Jellyfin — or a friend's —
  each with its own nickname, on/off switch, library picks and Test button.
  Extra servers stack on the shelves; sections label themselves
  "Nickname · Library" so two "Movies" never look alike; each visitor can
  switch any connection on or off in My Media. Posters, details and streams
  route per-connection; tokens stay masked like the built-ins.
- **t88 · the shelf map, fixed five ways.** ① A pinned section always
  reaches its own titles — a section past the display cap (or with an
  unlucky sort) no longer silently falls back to the mixed shelf. ② The map
  saves on every change — the live preview IS the saved map; the button is
  just "Done" now. ③ Direction (A→Z / Z→A) finally works in Genre and By
  Library modes. ④ A pinned shelf shows its OWN section in title order —
  grouping modes shape the automatic mix, never your pinned walls. ⑤
  Duplicate section names read "Server · Section". Plus: stale pins
  (renamed library, removed server) show as "no longer available" with a
  one-click cleanup, and "All automatic" clears the jukebox pick too.
- **t89 · grabbed videos get case images.** Files pulled in by the file
  grabber had plain text cases. Now the first browser to visit grabs a
  frame (~15% in), uploads it once, and every store after that shows it as
  the case image — cached on the server, zero per-visit cost. Codecs the
  browser can't decode keep the text case.
- **t86 · the dance hall actually dances.** The rig moves twice as fast and
  twice as far, patterns rotate twice as often, washes/LEDs hit harder —
  and the sweeping cones finally point the right way (narrow at the
  fixture, wide at the floor; they were inverted). The mirror ball is real:
  faceted, pin-spotted, spinning, with sparkle glints and a floor sweep.
  New "Dance floor lights" section in My Theme — intensity, speed, ball
  spin, pattern lock — saved per person. The rule stays: the rig only
  wakes when the dance hall's own music is playing.
- Suite: 80 → 85 checks (t86Dance2, t87Multi, t88Shelves, t89Thumbs;
  t59Beat and panels updated to the new spec).
## 2026-09-08 — t82–t85: the tester round-2 wave (admin, mobile, invites, jukebox)
- **t82 · Admin consolidated + admins make admins.** The three admin tabs
  (Server / Users / Policies) merged into ONE "Admin" section with sub-tab
  buttons — an admin's settings live in one place now. New per-user
  "Make admin / Remove admin" button (POST /api/admin/users/promote):
  add a partner with full admin without a rebuild; the last-admin guard
  blocks demoting yourself into lockout; demote needs a confirm.
- **t83 · mobile account creation un-lagged.** Two fixes: full-screen
  overlays (front desk, settings) now pause the 3D render loop
  (body.overlay-open) — typing on a phone no longer fights the scene for
  CPU; and phones drop the frosted-glass backdrop-filter (re-blurring
  the live canvas per frame was the real cost).
- **t84 · one-tap invites.** My Profile → "Invite a friend": shows this
  store's LAN address (GET /api/lan — private ranges only, never a public
  IP) with a Copy button (clipboard API + execCommand fallback for
  http:// LAN). No more "which IP do I type?" for friends. Works for
  guests too. Sidebar tab relabeled "My Profile" (it's self-service:
  account, password, invite — the sync wording confused people).
- **t85 · the jukebox is quiet on hover** (owner request) — the zombie
  hover overlay is gone from the jukebox; the street door keeps its sign.
- Docs: README/START-HERE admin references updated to the merged tab.
  Suite: 76 → 80 checks (t82Admin round-trip incl. last-admin guard,
  t83Mobile pause+CSS, t84Invite endpoint shape, t85Jukebox silence).
## 2026-09-07 — TCC intellectual-property posture (the "© or something" answer)
- Owner asked for a "copywrite" on TCC. Answer: two tools, both already
  working. COPYRIGHT covers the content (pitch/plan/code) — automatic,
  free, owned by BluJ Productions on creation; the ™ marks went on the
  pitch (first prominent use + footer: The CordCut Co-op™ · TCC™ ·
  Home Binger™ · © 2026 BluJ Productions). TRADEMARK covers the name:
  ™ free via common-law use from public launch; federal ® (~$250–350 +
  use in commerce) deferred until public/commercial. Casual name scan:
  no existing "CordCut Co-op" brand; "cord cutter" is generic industry
  vocabulary, so the full phrase is the protectable mark. Formal USPTO
  knockout search queued for pre-launch. Full posture in TCC-PLAN §5.
## 2026-09-07 — the public umbrella pitch: TCC first, HB as the storefront
- New docs/TCC-PITCH.md (HELD — publishes when the gate passes): the
  founder's pitch voice, restructured for the v2 model. TCC leads as the
  umbrella (the co-op, the promise, the method); Home Binger introduced
  as "the co-op's storefront" — the walkable 3D store, with the
  you-don't-browse-a-wall-of-thumbnails-you-walk-in hook, theater/
  jukebox/booth, USB-portable join story, and the Plex/Jellyfin
  plug-in note. Honest updates vs. the original text: cost leads with
  $0/month (true at v1) instead of $15; the hearth/solar/dues future is
  clearly marked "we'll build it together — not a launch promise";
  no-transitive-sharing and approval-based follow expressed in member
  language ("person-by-person, folder-by-folder"); legal fine print
  updated to zero-money-flows. Ready to publish as a landing page,
  announcement post, or future TCC repo README.
## 2026-09-07 — TCC correction: v1 is federation-only — no dues, no hearth yet
- Owner pulled the plan back on track: no dedicated server at launch.
  v1 = pure federation: every member manages their OWN node — own parts,
  own electricity, own digitizing. No money flows between members; mesh
  membership is free. The hearth (and the $15/mo that funds parts,
  power, and digitizing time) is DEFERRED to a growth-stage decision —
  if the co-op grows into shared infrastructure, it enters then with
  its own round (dues model + entity/legal review).
- Docs updated: TCC-E is now a self-serve digitization GUIDE (members
  digitize their own media; includes backup recommendations), TCC-F
  parked, traceability table marks every hearth promise as deferred,
  decision 6 rewritten (the "no free tier" ruling answered a question
  that doesn't exist at v1 — superseded; reasoning parked in the future
  hearth decision). Legal note: zero money flow = cleanest possible
  posture — pure reciprocal sharing among self-sufficient friends.
## 2026-09-07 — TCC membership decided by legal doctrine; plan renumbered v2
- Owner set the dues question by legal reasoning, not preference: uniform
  $15/mo per household, no free tier with content access, household
  members share a membership, dues flat and infrastructure-only (never
  usage- or content-scaled; no tiers — tiered content = selling
  content), founder pays too. Rule of thumb: **the software is free;
  the co-op is membership.** Rationale: everyone pays + everyone may
  contribute = no customer class exists — the strongest posture for a
  private cost-sharing club; a pay/free mix reshapes it into a service.
  Group stays bounded/invite-only; attorney hour before scaling.
- Legal map added (§5): CDs clean (no encryption) → DVDs/Blu-rays gray
  (CSS/AACS anti-circumvention, not copying) → never strip DRM;
  privacy-by-design (no analytics ever = nothing to leak); entity
  formation (co-op/nonprofit LLC) parked at growth stage on TCC-F.
- Plan doc renumbered v3 → v2 at owner's direction (pitch was v1, merged
  plan is v2 — founder numbering wins).
## 2026-09-07 — TCC master plan v2: the founder's pitch, merged
- Owner shared the original TCC pitch (verbatim, archived in
  docs/TCC-PLAN.md §7) — it describes a jointly-funded CENTRAL library
  ($15/mo dues → server, storage, power, solar+battery, archival
  redundancy, digitization of contributed media). Merged with the HB
  federation design into the two-layer architecture:
  **Layer 1, the Federation** — every member runs their own HB, $0
  software, no ports, owner-controlled sharing. **Layer 2, the Hearth** —
  the co-op's dues-funded always-on node: 24/7 core collection, archival
  drives, the solar goal; v0 = the owner's planned always-on PC. Two new
  phases: E (digitization & contribution pipeline: CD→FLAC clean case,
  DVD→MakeMKV gray zone, naming conventions) and F (the hearth). Full
  pitch→plan traceability table added — every promise in the pitch now
  maps to a phase that delivers it.
- Publish gate formalized: TCC stays private until Phase C (the Follow
  Link, HB↔HB) works. Public-Docs-Update.zip staged: TCC-free versions
  of README, START-HERE, CHANGELOG (phones-FAQ era) — verified zero
  TCC strings in all three.
## 2026-09-07 — TCC: follow model decided + the connective tissue, explained
- Owner decided: approval-based follows AND per-follower share lists
  (each approved follower sees only the folders ticked for THEM — the
  "private collection" case). Locked additionally: NO TRANSITIVE
  SHARING — content never hops member-to-member; streams flow only
  owner → follower-the-owner-approved.
- docs/TCC-PLAN.md: added the plain-language explainer of the shared
  virtual LAN (one-way-door problem → outbound-only trick → coordinator
  as matchmaker not middleman → direct encrypted member-to-member
  streams → founder-held invite/revoke dashboard → HB binds 0.0.0.0 so
  zero HB changes needed). Member onboarding is 3 steps.
## 2026-09-07 — TCC plan v2: hub → federation (owner's model)
- Owner clarified the member structure: everyone curates from the people
  THEY select (person-to-person follow links, not one central library).
  That's a federation of equals, and it's better than the v1 hub design:
  no single point of failure, bandwidth follows the content owner,
  "you control your own media" becomes architectural.
- docs/TCC-PLAN.md rewritten: shared ZeroTier virtual LAN (free, 25
  devices ≈ 10 members v1; Tailscale's 6-user cap ruled it out for the
  shared layer) — no port forwarding for any member, nothing exposed
  publicly, phones included. Owner's own remote access falls out free
  (phone joins the network). Always-on PC now means "your content is
  24/7" not "the co-op is 24/7". Phase set unchanged (A LAN+hardening,
  B multi-library, C Follow Link, D face+previews); follow-approval
  model added to the open decisions.
## 2026-09-07 — TCC: The CordCut Co-op — the plan doc
- Owner's big idea: Home Binger as the face of a co-op media library —
  remote access from anywhere, multiple remote Plex/Jellyfin libraries
  owned by different members, and Home-Binger-to-Home-Binger federation
  where each member publishes their own local files to the shared
  library and controls their own media.
- **docs/TCC-PLAN.md** written: why HB fits (multi-source items, proxy
  trust boundary, per-device profiles, zero-dep portability), four
  phases (A remote access + hardening · B multi-library · C the Co-op
  Link — members push over an outbound-only connection, no port
  forwards on the member side · D TCC face + local-grabber preview
  images via client-side canvas thumbnails), reality checks (hub
  uptime, upload-bandwidth math, read-only trust model, $0 intact —
  Tailscale free tier now 6 users). Awaiting owner decisions: queue
  slot, member count, hub hardware.
## 2026-09-07 — phones & the exe: the FAQ everyone asks
- New README subsection **"📱 The exe & phones — the questions everyone
  asks"** (right after Step 6) and a matching **PHONES, TABLETS & SMART
  TVs** quick-facts block in START-HERE.txt. Covers: yes, phones work
  with the exe (same server, same Wi-Fi, http://<PC-IP>:8181); the exe
  MUST stay running (the PC is the store — close it and the doors close,
  nothing breaks); same-network only by design, away-from-home = Tailscale;
  the first-run firewall Allow; keep the PC awake while hosting; per-device
  guest profiles mean zero setup on visitors' phones.
## 2026-09-07 — system requirements, in plain sight
- Added a **"Will it run on my machine?"** section to the README (full
  table) and the TOP of START-HERE.txt (short list) — the two places
  users and testers actually look. Floor: Win 10 64-bit / dual-core
  ~2015 / 4 GB RAM / any GPU with working drivers / ~1 GB disk, no
  internet required. Includes the two real gotchas: broken GPU drivers
  = slow software-rendered start (driver update fixes it), and the DJ
  booth is the most demanding room on minimum-spec machines.
- Note: START-HERE.txt inside the already-shipped v1.5.5 exe predates
  this — it reaches exe users with the next build. Repo README gets it
  as soon as the two files are uploaded.
## 2026-09-07 — t81b: rename fixed for the exe (Electron has no prompt)
- **Owner tried Rename in the exe — nothing happened.** Root cause:
  Electron does not support `window.prompt()` (returns null instantly;
  alert/confirm ARE supported — prompt is the one silent trap). The t81
  Rename button — and the older "Set password" button, dead in the exe all
  along — both used it. Browser testing passed because every real browser
  has prompt. Standing rule born here: **the UI never depends on
  browser-only APIs, and new UI features get an exe-level click-through
  before shipping.**
- **Fix**: both flows now use inline editors — an input with Save/Cancel
  appears directly under the user row (Enter saves, Escape cancels, toast
  on success). No dialogs at all.
- **Verified in the real exe**, not just the browser: booted the Windows
  build's exact code under a real Electron runtime, drove it over CDP —
  menu → Admin → Users → Rename → type → Save — and watched the row
  re-render with the new name, API round-trip 200. Suite stays 76/76.
  (Also click-tested in a real browser: same flow, same result — the fix
  is plain DOM, so it behaves identically everywhere.)
- **Shipped as GitHub release v1.5.5** (asset `HomeBinger-1.5.5-beta.zip`,
  115,580,915 bytes, MD5-verified identical to the built artifact).
  package.json now self-identifies as 1.5.5 to match the owner's release
  numbering (1.0 → 1.5 → 1.5.5).
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
