## 2026-09-13 — t133: a lock is a TRUE SYNC, not a mask
- **Owner: "the admin theme lock works for only part of it not all of it.
  everyone would still have to go sync their theme by changing it
  themselves."** Exactly right: the lock only OVERLAID the house theme on
  display — every saved profile kept its old personal theme underneath, so
  the moment the lock came off, everyone snapped back out of sync (and
  open sessions kept their old look until reload). Now:
  - **Turning the theme lock ON writes the house theme into every saved
    profile** (and changing the locked default re-writes everyone). The
    lock genuinely syncs the store — nothing to redo, no snap-back when
    it comes off. Same rule for the sorting lock.
  - **"Re-theme everyone now" also fires when theming is locked** (it used
    to skip, assuming the lock covered it — it only masked it).
  - Note for the owner's mental model: other people's ALREADY-OPEN windows
    still pick up a lock/default change on their next reload — there's no
    live push (by design; no websocket infra).
- **Suite: 129/129 ×2** (+1 t133LockSync: personal theme saved → lock+new
  default in one save → forced AND written to the profile → unlock →
  STAYS synced (no snap-back) → change default under lock → re-synced).
- Env note: FOURTH recycle this window mid-turn (playwright/chrome/exe/
  electron cache/zip list all vanished; swap unavailable in this container
  pass — suite ran fine on RAM alone). Tailscale URL lesson recorded: the
  exe is `tailscale-setup-1.102.4.exe` — the `-amd64` suffix belongs to
  the MSIs (a 10-byte "Not Found" is the tell).

## 2026-09-13 — t132: the Policies default theme actually reaches people now
- **Owner: "The policy theme changer doesnt change anything. I think the
  main theme take prio."** Right on both counts, and deeper than priority:
  the store's default theme was baked into every visitor's preference
  snapshot at creation (a copy of the BUILT-IN theme, not the admin's
  configured one) — so the Policies default reached NOBODY: not existing
  visitors (their snapshot won), not even brand-new ones (they got the
  built-in, not the configured default). Only "Lock theming" ever surfaced
  it. Fixed:
  - **"Follow the store's default" is now a real state** (theme/sorting
    null until a visitor personalizes) — new visitors get the admin's
    CONFIGURED default from Admin → Policies; personal choices still win
    once made. Same fix for the default SORTING.
  - **A personal patch rides the store's look:** recoloring one wall no
    longer snaps the rest of your theme to the built-in defaults — it
    merges onto the store's configured default.
  - **"Re-theme everyone now" (checked by default)** in Admin → Policies:
    saving a CHANGED default theme also switches every saved profile —
    including the admin's — so the store visibly changes on save. One-time:
    visitors can still personalize afterwards. (Skipped automatically when
    "Lock theming" is on — the lock already forces everyone.)
- **Suite: 128/128 ×2** (+1 t132DefaultTheme: fresh visitor gets the
  configured default, personal override wins, partial patches keep the
  store look, re-theme switches saved profiles + admin-only 403, followers
  keep following the default). The check itself needed the suite's
  unique-username pattern (run-twice on the same store). Run B hit one
  known DJ timing flake (t117 relaxOk — swiftshader family, unrelated);
  runs A and C clean on identical bytes.

## 2026-09-13 — t131: the sidebar footer is the real brand line
- **Owner: "#3 lets make it make sense. Home Binger™ The CordCut Co-Op™ TCC™
  are what we have so far. Make sure it lines up with that."** The sidebar's
  bottom mark now reads the actual brand line, exactly as TRADEMARKS.md
  records it: **Home Binger™ · The CordCut Co-op™ · TCC™** over
  **© 2026 BluJ Productions. All rights reserved.** (TRADEMARKS.md's
  sign-off, verbatim — the "Co-op" spelling is the recorded usage). The
  tooltip still points at TRADEMARKS.md in the app folder. Suite assert
  extended: all three marks + the copyright line must be present.

## 2026-09-13 — t130: the Guide returns to the theater; remote fixed; help refreshed; ™©; Policies presets
- **Owner: "adding the tv guide messed with the remote more than it should
  have."** The remote is room-aware now: the 📖 GUIDE button appears ONLY in
  the theater (outside it, clicking says "the Guide lives in the theater"),
  and the repeat button belongs to the JUKEBOX again — visible at the
  jukebox where it cycles the jukebox deck (off → one → all), hidden in the
  theater. Owner's call, and it's right: repeat isn't needed for TV or
  movies — the playlist feature covers those.
- **The help menu (first-run overlay) is rewritten for everything new:**
  G opens the Guide in the theater, ◀ ▶ flip category pages, L flips
  languages (★ Favorites first), F stars a channel, ▲ ▼ flip channels,
  the jukebox note, and the phone note now explains Simple Mode +
  "Desktop mode".
- **The sidebar's bottom status chip (the green-dot "Podcasts" line) is
  gone — the ™© mark sits there now** (tooltip points at TRADEMARKS.md in
  the app folder). The chip's updater and CSS retired with it.
- **Admin → Policies can now PICK the default theme from the same presets
  visitors get** (Video Store Classic, Neon Night, Cozy Video Store,
  Midnight Modern, Retro Mall + "Custom") — choosing one fills the color
  pickers and shelf style; the pickers remain for fine-tuning. The store's
  built-in default is the Neon Night preset.
- **Suite: 127/127 ×2** (+1 t130Polish: help content, ™© in / chip out,
  guide button hidden in the store + refuses to open, jukebox repeat
  cycles, both buttons flip correctly per room, policies preset select +
  fill — verified on a fresh admin page). One probe lesson: the store's
  default theme already IS a preset (Neon Night), so the preset test picks
  whichever preset differs from current.

## 2026-09-13 — t129: favorite channels; My Media removed; invites have ONE home
- **Owner: "Can we also favorite channels that way we can access our favorite
  ones faster?"** Every Guide row now has a ☆/★ — click it or press **F** on
  the selected channel. A **★ Favorites** page rides first in the language
  row (with its count); it shows just your stars across the categories, and
  L cycles to it first. Favorites are saved per profile (account or device)
  and survive reloads. If you un-star the last one while ON the Favorites
  page, F brings it straight back.
- **Two real bugs the suite caught while building this:** (1) the bootstrap
  served a fixed-key prefs object — favorites would have vanished on every
  reload; guideFavs now rides it. (2) writePrefs rebuilt prefs with a fixed
  key whitelist — the new key was silently dropped on save; fixed at the
  source. Plus one hardening: star clicks resolve against the Guide's own
  snapshot, so a library reload in flight can't silently eat a click.
- **Owner: "The 'My Media' Setting panel, Whats the use of it? If we dont
  need it lets remove it."** It was the per-user "media mix" (each visitor
  picking which free shelves stock THEIR view) — real, but redundant next to
  the admin's per-user library access and one more thing to explain.
  REMOVED: the tab, the panel, and every hint that pointed at it. Settings
  are now My Theme · My Shelves · My Profile · Admin. (The server still
  honors mixes users saved before — nothing changes underneath.)
- **Owner: "Invite a friend is also in more than one spot now."** It was in
  THREE (the LAN-address box on both the signed-in and guest profile panels,
  plus the Tailscale card in Admin → Users). Now ONE home: Admin → Users —
  the Tailscale invite card, with the same-Wi-Fi address box right under it.
- **Suite: 126/126 ×2** (+1: t128FavTrim — star, Favorites page, F-off/F-on
  with the empty-page fallback, prefs round-trip, no My Media tab, exactly
  one invite box; panels + t127 checks updated for the new shape).

## 2026-09-13 — t127: the Guide's LANGUAGE pages (owner ask)
- **Owner: "Can we seperate the channels by laguage as well?"** The Guide now
  separates channels by language, with real data: the iptv-org API carries no
  language field (measured: 0 of 31,299 channels), but the directory
  publishes one playlist grouped by language — the server joins on it
  (tvg-id → group-title) at feed-load time, so every channel knows its
  language(s). Measured live: the curated 848 channels span 44 languages
  (English 416 · Spanish 147 · Danish 68 · French 67…); the unverified tier
  spans 105. If the language playlist ever can't be fetched, the Guide just
  offers no language row — channels are unaffected.
- In the Guide: a LANGUAGE row above the categories — All + the top languages
  by channel count (a language needs ≥2 channels; "+N more" expands the long
  tail — 105 pills would be a wall). Pick one and every category page shows
  only that language's channels; category counts update and empty categories
  hide. Press **L** to flip through languages; the pick is remembered across
  opens (and drops itself if a config change removes its channels).
- Suite: +1 check (t127GuideLangs — pills, Spanish filtering, hidden
  categories, L-cycling, pick-plays; the mock grew a language playlist + a
  Spanish pair). The first run caught a real integration miss: /api/library's
  item whitelist didn't carry the new `langs` field — fixed.
  **125/125 ×2 (A + C clean; B hit one known DJ-booth sync-phase timing
  flake outside this feature, disproved by the clean rerun).**
- Env note: the sandbox recycled between turns — chrome/pwcore/apt libs/swap/
  electron zip/resedit/tailscale-setup all re-fetched and re-verified
  (electron sha256 vs the official SHASUMS ✓; tailscale-setup byte-identical
  to the last three builds ✓).

## 2026-09-13 — t126: the Guide gets category tabs (owner ask)
- **Owner: "make the guide a bit easier to navigate… group them by category
  but have the user click the category to see the channels it offers."**
  The Guide now has a CATEGORY BAR — one button per category (News · Movies ·
  Series · Kids · …) with the channel count on each; the list below shows
  just that category's channels, numbered from 001 like a fresh page of a
  paper guide. Click a tab or press ◀/▶ to page between categories; ▲/▼
  still flip channels; Enter or a click watches. Opening the Guide lands on
  the category of whatever's on the TV (or the last one browsed).
- The stylesheet is now version-stamped like the JS (`style.css?v=…`) — new
  Guide styles can never ride a cached CSS after an update.
- Channel titles from the public directory are HTML-escaped in the Guide
  (defense-in-depth; they were inserted raw before).
- Suite: the guide check now exercises the tabs — two categories, click
  paging, ◀/▶ wrap-around, per-page numbering, closes on pick.
  **124/124, run twice.**

## 2026-09-13 — t125: owner-test fixes — the unverified toggle no longer breaks the Guide; G frees the mouse
- **Owner report: "turned on unverified channels and it broke, refusing to
  show the channels I had originally."** Root cause found and proven live:
  the Admin → Media group list for Live TV shipped the adapter's async
  response un-awaited (serialized as `{}`), so the checkbox list rendered
  as an error — and the next save collected ZERO checked groups and wiped
  the Guide's sections. The channels themselves were never the problem.
  Fixes: the route awaits (the list now renders its 12 groups,
  live-verified); a save can never again read a failed list as "no groups
  picked" (archive and radio got the same guard); and a ONE-TIME recovery
  restores the default six groups on this build's first boot if they were
  wiped — a deliberate "all groups off" still persists afterwards.
- With the unverified tier on, the curated channels keep the FRONT rows of
  each group — main listings before extended listings, the paper-guide way.
  Measured live against the real directory: 848 curated channels, 2,759
  with the toggle on.
- **Owner report: pressing G while walking left the mouse captured** (had to
  hit Esc before clicking a channel). Opening the Guide now releases the
  mouse; walking was already paused while the Guide is open.
- Suite: +1 check (t125WipeGuard) and new assertions inside the t123 checks
  (admin group list, toggle-only save keeps sections, curated-first order,
  Guide frees the mouse). **124/124, run twice.**

## 2026-09-12 — t124: pre-ship catch — the friend invite file could never install Tailscale
- Found while building the test zips, by checking the download link LIVE
  (not assumed): Tailscale retired the plain `tailscale-setup-latest.msi`
  name — MSI files are now arch-named — so the invite .bat's download step
  would have quietly 404'd on a friend's PC. The .bat now uses the working
  `tailscale-setup-latest-amd64.msi` alias, and if the download can't
  happen it stops and says so in plain English ("install it free from
  tailscale.com, then run this file again") instead of limping on.
- The .bat's `%TEMP%` path got its missing backslash back — a JavaScript
  escape had silently swallowed it. curl and msiexec were using the same
  mangled path, so it happened to work anyway; now it's just correct.
- Suite re-verified on the fixed bytes: **123/123 checks, run twice.**

## 2026-09-12 — t123 BUILT: the combined release (live TV Guide + per-user libraries + Simple Mode + invites)
- **Owner: "Go ahead and build it… i will obviously see what changed how it
  acts. how i get the guide menu and such."** Everything built, nothing set
  in stone. Version → **1.10.0**. Suite **123/123 ×2** (118 + five new t123
  checks). Two real bugs found and fixed DURING the build's own testing:
  - The iptv adapter's channels were invisible: defaultView/userView didn't
    carry the iptv config → the addon never ran (views now carry it).
  - **The proxy's variant gap (caught by the suite):** variant playlists
    fetched through the signed u= path were piped verbatim, leaving their
    relative segment URLs resolving against the wrong path — real channels
    only played by luck (CDNs with absolute URLs). The proxy now rewrites
    at EVERY playlist level; segments verified end-to-end (524 KB TS
    through the proxy in 0.1 s; real "ABC News Live" playing + advancing on
    the theater screen in the final smoke).
- **📺 LIVE TV GUIDE** (owner-designed: channels NEVER on shelves; the
  nostalgic paper-guide look; honest ● LIVE cells): new
  `server/lib/adapters/iptv.js` (iptv-org, curated officially-free tier,
  NSFW always excluded, "unverified" admin toggle off by default; 848
  channels across 6 default groups on the real API, 1.2 s load) + the
  **signed m3u8-rewrite proxy** (HMAC-signed segment URLs — tampered 403,
  unsigned 403, private hosts 403 outside mock mode; no open proxy) +
  vendored hls.js 1.7.3 (Apache-2.0, CREDITS + license file) +
  `public/js/hlsplay.js` (one place that routes streams: HLS→hls.js,
  Safari native, else src) + `public/js/guide.js` (numbered rows, group
  headers, ▲/▼ flip, G key gated to the theater, remote 📖 GUIDE button,
  offline-marking that never wedges) + TV wiring (hls on the big screen —
  also un-breaks Plex tuner channels in Chromium, which are HLS too).
  Admin → Media: "Live TV (the theater's Guide)" group checkboxes +
  unverified toggle. Fresh installs: ON by default.
- **👨‍👩‍👧 PER-USER LIBRARY ACCESS** (the link-time flow, owner-shaped):
  `libraryAccess` config map (absent = all — upgrades change nothing);
  server-enforced on /api/library (items+sections filtered), /api/play,
  /api/tv/stream, /api/item, /img (403/404 for hidden libraries — dev
  tools can't reach the stream). Admin → Media: the "who gets this
  library?" prompt fires for every NEW section at save time (All accounts
  default · certain-accounts picker · cancel = all). Admin → Users:
  per-account Libraries reflection (same map). New accounts inherit only
  'all' libraries (kid-safety default). Anonymous = everyone (v1
  doctrine, recorded).
- **📱 SIMPLE MODE** (`/m`): plain list client — poster grid + data-saver
  text list, search, tap-to-play (video/audio/live via hls), optional
  sign-in, Desktop-mode link. Phones auto-redirect from the 3D store
  (touch + phone UA/narrow; ?desktop=1 remembers; the exe never
  redirects). `/m` route added to the static server.
- **🎫 FRIEND INVITES** (the Tailscale on-ramp, admin side):
  GET /api/admin/invite/bat (validated: tskey- prefix + host shape;
  403 without admin) generates the one-time .bat — installs Tailscale
  via the official MSI silently, `tailscale up --authkey=… --timeout=90s`
  (the #16086 mitigation), opens the store. The KEY is never stored —
  only nickname+dates in db.invites. Users panel: the invite card with
  Tailscale-IP autofind (`tailscale ip -4`), the SmartScreen note, the
  honest tier-2 not-yet-verified warning, and revoke instructions.
- Docs: RESEARCH-LIVETV.md updated (proxy = core, measured); QA report
  unchanged. CREDITS + vendor license for hls.js. Cache-buster stamp
  re-run (?v=1789241776411). Desktop exe rebuild verified (icon embedded).
## 2026-09-12 — THE FULL AUDIT: everything tested, simulations run (owner order)
- **Owner: "lets run all of this and gets tests and simulations done so we
  know itll work… If it works as intended leave it. If it has a bug fix
  it… every little thing tested that we have put in."** Full report:
  docs/QA-AUDIT-2026-09-12.md. Headlines:
  - **Suite 118/118 ×2** on the final code (hotfix + stamp included).
  - **Live customer journey 14/14** against REAL upstreams (48 archive
    films, real podcast feed, real radio, real local files): shelves →
    carry → real 91-min film on the theater TV (video attached, seek,
    queue seeded) → jukebox radio/podcast/local all play → posters →
    metadata → search → theme → booth. Zero page errors.
  - **Security probes all pass** (admin 403s, traversal blocked,
    registry-gated, no open proxy); /api/play serving anonymous = the
    documented open-store doctrine AND the exact gap per-user libraries
    will close.
  - **Live-TV simulation reversed the architecture honestly**: direct
    play 0/12 (mirror URLs have no CORS); the m3u8-rewrite proxy PLAYED
    9/12 (all Pluto in 0.5–3 s). RESEARCH-LIVETV.md updated — proxy is
    the REQUIRED core, direct an optimization. This is the
    simulate-before-build doctrine paying for itself.
  - **Desktop build pipeline verified** (3 s, icon embedded, START
    HERE present, hotfix included). **Update notice verified live**
    against the real GitHub (no nag on 1.9.0). **Mobile phone-viewport
    smoke passes** (390×844: no horizontal scroll, deck usable, 13 MB
    heap) after proving the earlier crashes were sandbox RAM, not the
    app (same-flags desktop control crashed identically under pressure).
  - **Zero app bugs found** — every "failure" resolved to probe error,
    intended design (entry-screen CPU pause), or sandbox limits. No
    code changes were needed; nothing was touched.
## 2026-09-12 — per-user libraries redesigned: access asked AT LINK TIME (owner flow)
- **Owner: "Admin signs in, links libraries; when selected, asked if
  they go to all accounts or certain ones; if certain ones, which
  ones."** RESEARCH-PER-USER-LIBRARIES.md §2 rewritten to this flow:
  the "who gets this library?" prompt fires the moment a library is
  linked/enabled in Admin → Media (default = all accounts; cancel =
  all; linking never blocked). Data model inverted to per-LIBRARY
  audience (`libraryAccess` map; per-user views derived — no fan-out
  writes, no drift). Safety defaults locked: absent key = all (existing
  installs unchanged on update); NEW accounts inherit only 'all'
  libraries — 'certain-ones' libraries stay hidden until the admin adds
  the account (the kid-safety default). Users panel becomes the
  audit/edit reflection reading the same map. Route enforcement
  unchanged (403/404 on play/tv-stream/item/img for hidden sections).
  Noted synergy: this prompt is exactly what the future Easy Start
  wizard needs — it inherits the component for free. Zero
  implementation this turn.
## 2026-09-12 — per-user library access researched (the parents/kids ask)
- **Owner: "An admin should be able to allow which libraries each
  individual user sees. Say parents set it up and have spicy content.
  That shouldn't show up in the kids library."** Audited against the
  code: **YES, fully buildable from existing machinery** — new doc
  docs/RESEARCH-PER-USER-LIBRARIES.md. Findings: per-visitor views
  (userView) + stable section keys + the exact allowlist predicate
  already exist (written for friend share lists); the ONE real gap is
  that /api/play and /api/tv/stream serve anything configured with NO
  view check — hiding content in the UI without closing that is
  cosmetic (dev tools reach streams directly). Design: user record
  gains sections allowlist (null = everything, backward compatible);
  Admin → Users → per-user "Library access" checkbox list; enforcement
  on library/play/tv-stream/item/poster routes (403/404 for hidden
  sections). Honest caveats recorded: the theater screen itself is a
  shared surface (per-user rules govern browse/start, not what's
  already playing); anonymous guests see everything in v1 (kids use
  accounts). Sequencing call: rides the combined release (independent
  of the friend path, liftable like live TV). Zero implementation this
  turn — research only.
## 2026-09-12 — live TV rides IN the combined release (owner sequencing call)
- **Owner: "We can do this small update with the friends release. What
  better way to let people test than with free tv and their own
  personal libraries."** My after-friends recommendation is overridden
  and recorded: the ONE release box is now **jukebox hotfix + Friends
  Update (on-ramp + Simple Mode + missed things) + Live TV Guide**.
  The one-real-friend release gate applies to the entire box — the
  friend test now also covers the Guide (open → flip → a free-TV
  channel plays on the friend's machine; streams go direct from the
  CDN to the friend's browser, not through the host's upload).
- Safety valve kept: live TV is built modular — if it hits a late
  wall (e.g., hls.js misbehaves on real hardware), it lifts back out
  without touching the friend path.
- First domino unchanged: the live Tier-2 Windows invite test still
  comes before any of this is built.
## 2026-09-12 — live TV GREEN-LIT + the theater Guide design + Roku skipped
- **Owner: "Green light on live tv. Anything that we can get for free we
  can use."** Live TV (iptv-org, curated officially-free tier) joins the
  build queue — AFTER the friends path (sequencing accepted).
- **Owner design orders (locked into docs/RESEARCH-LIVETV.md):** TV
  channels NEVER go on the shelves; live TV opens through a nostalgic
  GUIDE menu in the theater ("just as the tv guides used to be — this
  project is about nostalgia"). Design recorded: numbered channel rows
  + logos, time axis, category group headers, honest `● LIVE` cells,
  ▲/▼ channel-flipping like a real dial, G key + remote GUIDE button +
  screen-click to open, dead channels skip never wedge.
- **EPG measured honestly:** iptv-org hosts NO EPG feed (their epg repo
  is a self-run grabber tool); the free aggregator epg.pw works (epg_US
  31 MB gz, 5,476 channels, 539k programmes) but is a CABLE-lineup
  universe — only 24 of our 576 official-tier channels match by name;
  dearbulut's community feed 404s; Pluto/Samsung schedule APIs are
  unofficial platform internals (gray zone — parked). v1 Guide =
  zero-EPG nostalgia grid; no fabricated listings ever.
- **Roku: SKIPPED by owner** ("Roku we are skipping as you said its not
  easily doable") — recorded at the top of docs/RESEARCH-ROKU.md; the
  model-number ask is withdrawn.
- **"Anything free we can use" recorded as the standing provider
  posture** — radio genre picker effectively green-lit under it (it was
  already recommendation #1); LoC + NASA remain YES when their turn
  comes; LibriVox stays parked (books hold is separate).
## 2026-09-12 — ONE combined release decided (hotfix + Friends Update) + live-TV research (ALLtvLive/iptv-org)
- **Owner: "i want this hotfix and the friends update all in one."** The
  standalone v1.9.1 is CANCELLED — the jukebox fix ships inside the
  Friends Update as ONE release (Tailscale on-ramp + Mobile Simple Mode +
  missed-things + the t122 jukebox fix). Release gate unchanged: the
  friend path must be proven live with one real friend first — which now
  also gates the jukebox fix (owner's call, recorded). RELEASE-NOTES
  draft at the workspace root is PARKED — it folds into the combined
  release notes when that ships.
- **NEW docs/RESEARCH-LIVETV.md** (owner asked about github.com/devSahinur/
  ALLtvLive as our live TV). Verdicts, researched live: the ALLtvLive APP
  = NO (repo has NO LICENSE file — the README's MIT badge is a dead link;
  wrong stack; unnecessary). The SOURCE underneath it (iptv-org public
  API) = YES with conditions: verified live (31,219 channels /
  17,242 streams, ~96% HLS, 1,576 non-NSFW US channels), needs vendored
  hls.js (Apache-2.0, one 415 KB file) because HLS doesn't play natively
  in Chromium — the gap that already cripples our Plex live TV today.
  Clean UI = YES automatic (live channels flow into the EXISTING 'live'
  machinery: shelf cases, LIVE panel, store TV). Curation REQUIRED: the
  full index mixes official free feeds (ABC News Live on Disney's own
  CORS-open CDN — verified 200) with pirate restreams; the recommended
  default is the officially-free tier (~576 US channels from
  Pluto/Tubi/ABC/PBS/NASA/local-news groups), NSFW excluded, with an
  honestly-labeled "unverified" toggle for the owner. Streams die/geo-
  block (AJ 403 from datacenter IP) → dead-channel handling per the t122
  no-wedge doctrine. Sequencing recommendation: AFTER the friends path
  (must not jeopardize the gate). Gate checklist in the doc; owner
  green-light pending.
## 2026-09-12 — code-signing decision locked ($0) + the v1.9.1 ship list
- **Owner: "Im obviously not paying as im a broke bitch."** Home Binger
  stays unsigned — recorded in docs/RESEARCH-CODE-SIGNING.md (§5 LOCKED:
  no certificate at any price; free Microsoft Security-Intelligence
  submission per release is the only accelerator; START-HERE's
  click-through note stays; the optional build signing step stays
  unwritten).
- **v1.9.1 confirmed as the jukebox hotfix ONLY** — podcast 404 fix +
  dead-track queue unwedge + cache-buster stamp + two new suite checks.
  Small and safe on purpose. Books stay parked; podcasts stay green;
  the missed-things ideas ride the Friends Update, not this release.
## 2026-09-12 — t122 HOTFIX: the jukebox podcasts-never-play bug (found, fixed, proven) + books parked + SmartScreen research
- **Owner report: "the jukebox is now broken… things wont play."** Root
  cause found by live reproduction (real podcast feed + real radio-browser
  stations + real local files against the shipped 1.9.0 code):
  - **Every podcast episode 404'd.** `ADAPTERS` registers the podcasts
    adapter as `podcast` but its CONFIG lives under `podcasts` — so
    `sourceConfig('podcast')` returned null and `/api/play/podcast/*`
    answered "unknown source" for EVERY episode (jukebox path, theater
    path, posters, item detail — all dead). The bug is older than 1.9.0,
    but t121's picker put podcasts on the jukebox for the FIRST time, so
    1.9.0 is where the owner finally hit it. FIXED in
    `server/lib/library.js` (one mapping line); verified serving real
    mp3 bytes (206/200) on every route.
  - **A dead first track wedged the whole queue.** The jukebox's error
    handler retried a never-playable URL 5 times, then gave up silently —
    `ended` never fired, the deck never advanced, everything after it in
    the queue sat forever. FIXED in `public/js/store3d/jukeaudio.js`:
    a URL that dies before its first note fast-fails and advances the
    deck (3-strike guard so an all-dead queue rests instead of looping);
    mid-stream hiccups keep the reload-and-resume ladder, and an
    exhausted ladder now advances too. Verified: [dead link, good track]
    lands on the good track and plays.
  - Investigated and cleared along the way (sandbox artifacts, NOT app
    bugs): an apparent element stall on proxied remote media — a bare
    element in the same page played perfectly and a clean-page jukebox
    played podcast + radio at real-time pace; the stall was the probe's
    own aborted 250 MB responses starving the browser's connection pool.
- **Suite: 118/118 ×2** (116 + two new permanent checks:
  `t122PodcastPlay` — the play + poster routes must answer for a podcast
  episode; `t122DeadAdvance` — a dead first track must not wedge the
  jukebox queue). Run 2 of 3 hit the known friend-store-spawn environment
    FATAL near the end (no check failures) — documented dead end.
- **Cache-buster stamp re-run** (`?v=1789209399761` across public/js +
  index.html) so browsers holding cached 1.9.0 jukeaudio.js pick up the
  fix. Post-stamp smoke: podcast + radio play at real-time on a clean page.
- **Owner decisions this turn:** books are PARKED ("I want to wait before
  adding anything book wise" — LibriVox deferred, research stands);
  podcasts stay green (owner: OK "due to some having a video version and
  an audio version"); the missed-things sweep ideas are approved by the
  owner. Provider order updated in RESEARCH-FREE-PROVIDERS.md.
- **NEW docs/RESEARCH-CODE-SIGNING.md** (owner: "i kinda want windows to
  stop flagging the program"). Headlines: the "More info → Run anyway"
  screen is SmartScreen REPUTATION, not identity — no purchase removes
  it day-one; EV's instant bypass was removed by Microsoft in 2024 (EV =
  NO); SignPath's free OSS signing is INELIGIBLE (HB's CC BY-NC-SA
  license is not OSI-approved); the two paid paths that work are Azure
  Trusted Signing (~$9.99/mo, US individuals eligible) and Certum
  Individual OV in Cloud (~$115–167/yr, plain signtool); the Microsoft
  Store is the only zero-warning endgame (parked). .bat files can never
  be signed — the invite script's click-through note is permanent unless
  it becomes a signed exe. Owner decision OPEN: pay ~$120/yr or stay $0.
- **RELEASE-NOTES-v1.9.1.md drafted** (workspace root, not in the zips) —
  hotfix ready for the owner to ship whenever they choose.
## 2026-09-12 — decisions locked + the "what did we miss" sweep + free-provider research
- **Owner: "go with your calls"** — all recommendations are now LOCKED
  into the research docs (each doc has an "Owner decisions — LOCKED"
  section): Tier-2 lockdown default with trusted toggle · one one-time
  key per friend (~30-day expiry) · plaintext key accepted · rung 2
  admin-editor-only v1 with three worded health states · watch party
  no-chat-in-W1, field test = owner + 3 remote friends, pause-everyone
  ≤4 guests · mobile poster grid + data-saver list, phones default to
  Simple Mode.
- **RELEASE GATE SET (owner): "We wont post it till i can see that it
  works with at least one friend"** — the friend path (invite → join →
  browse → play) must be proven live with one real friend on real
  hardware before ANY of this ships. Recorded in every affected doc.
- **The missed-things sweep** (found and folded into the docs): Windows
  SmartScreen will flag the invite .bat (mitigation + clean-box gate
  test) · the host PC sleeping takes the store dark (admin guidance) ·
  lost/stolen friend device revocation runbook · phone audio must
  survive screen-lock (Media Session API, verify on real hardware) ·
  "Add to Home Screen" PWA-lite for the app feel at $0.
- **docs/RESEARCH-FREE-PROVIDERS.md** — the Scholastic ask + the deep
  search. SCHOLASTIC: NO — their free app (Home Base) shut down Nov 4,
  2025, it was a kids' game world not a media catalog, and their real
  video products are copyrighted school subscriptions; the one legal
  Scholastic path is a public podcast RSS (already addable today, zero
  code). CODE AUDIT FIND: the radio wall ALREADY runs on
  radio-browser.info — so "thousands of free stations" is an upgrade to
  a shipped source, not a new provider. NEW YES candidates, all
  no-payment/no-account/legal: **LibriVox** (public API verified,
  ~20k public-domain audiobooks — the star, and the legal answer to
  the kids-content ask), **radio genre picker** (cheapest), **LoC
  National Screening Room** (PD films; API to live-verify), **NASA**
  (PD with attribution + no-endorsement rules). MAYBE: NPS b-roll, TED,
  Jamendo (API key). NO with reasons: Pond5 (account), Kanopy/Hoopla
  (library card, no API), Tubi/Pluto/Crackle (ToS), YouTube extraction
  (ToS).
- No app code touched this turn — research and decisions only.
## 2026-09-12 — research night 2: mobile simple mode + Roku
- **Owner asks: "make this easily available on mobile by making it a
  simple list more like how other platforms are but when desktop mode is
  turned on it goes to the pc version? Will there be a way to easily
  make this fully available on roku (which does not have a browser)?"**
  Same doctrine as research night 1: structure + yes/no/maybe verdicts,
  ZERO implementation.
  - **docs/RESEARCH-MOBILE-LIST.md** — Simple Mode. All YES by code
    audit: the 3D store already runs on phones (touch controls, t83
    mobile perf), and every API a list app needs already exists
    (library/posters/Range streams/auth) — v1 needs NO new server
    endpoints. Per-device desktop toggle (localStorage + ?desktop=1 +
    Electron UA guard). One honest MAYBE: direct-play format coverage
    on iOS Safari (mkv/webm often no) → a measured "not playable on
    this device" chip, not a broken player. Companion item flagged for
    its own pass: a first-run SETUP WIZARD for the store side (the
    owner's "easier than what i have been doing" ask).
  - **docs/RESEARCH-ROKU.md** — the honest answer: NO easy full path.
    Private channels died Feb 2022; beta channels cap at 20 users and
    expire in 120 days (QA-only); sideloading is one-channel-at-a-time
    personal-only. Three real paths priced: (A) AirPlay 2 from the
    mobile web app — ~zero effort, Apple devices + AirPlay-capable
    Roku (most Roku TVs + 4K players, OS 9.4/10+), LAN-only; (B) a
    pure-node DLNA server + the Roku's BUILT-IN Media Player — medium
    effort, zero friend installs, LAN-only, direct-play formats only,
    documented OS 14.0/15 AC3-DTS audio bug on some models; (C) a
    native BrightScript channel through Channel Store certification —
    big effort, the only true remote-capable "install from the store"
    path. Recommendation: ship Simple Mode first (Path A lands free),
    prototype Path B only if TV demand is real, keep C parked.
- No app code touched. The three earlier research docs (Tailscale
  on-ramp · HB↔HB rung 2 · watch party) are unaffected.
## 2026-09-12 — research night: the next three features (structure only, zero implementation)
- **Owner directive: "Start working on the structure however dont implement
  until we fully know that it will all work. i dont guess i research to
  know yes no or maybe."** Three research docs written, verdicts included,
  no production code touched:
  - **docs/RESEARCH-TAILSCALE-ONRAMP.md** — the one-click-ish friend invite.
    YES: pre-auth keys join with no browser login (kb/1085); friends count
    as the owner's DEVICES on the free Personal plan (6 users / unlimited
    user devices, 2026 pricing — no seats consumed); silent install works
    via the **MSI** (TS_NOLAUNCH/TS_UNATTENDEDMODE/TS_ONBOARDING_FLOW —
    the exe self-extractor is deliberately avoided per the reference
    silent-installer project); --unattended survives reboots; revocation =
    delete the key. MAYBE (two-tier): locking friends to ONLY the store —
    a tagged pre-auth key + one ACL rule (must be live-verified; tagged
    keys + ACLs are free-tier). One known hang (tailscale#16086) has a
    documented mitigation (--timeout + service-wait).
  - **docs/RESEARCH-HB2HB-RUNG2.md** — item-level share granularity,
    friend-store offline indicators, browse polish. All YES by code audit:
    entry.items[] is additive and degrades to today's section rule when
    absent (backward compatible); fetchFriendCatalog already sees the
    failures, it just records nothing — health = lastOkAt/lastError surfaced
    through /api/bootstrap, amber "stale" never empties a shelf.
  - **docs/RESEARCH-WATCHPARTY.md** — W1 synced theater nights. Transport
    YES via SSE (EventSource is browser-native, server side is a chunked
    response — no ws library, zero-dep doctrine intact); clock sync YES via
    min-RTT selection (Jellyfin SyncPlay's documented algorithm); drift
    correction YES (SpeedToSync/SkipToSync with a ~100 ms deadzone); group
    pause on stall YES; chat MAYBE (recommend W1.1); remote guest count
    MAYBE — direct-stream arithmetic says 2–6 on typical home upload, gate
    is a field test with the measured number written into the docs.
    Honest gap found: only the TV's ITEM is server-side today — queue and
    position are client-side, so W1 needs a small new server session
    object (the doc structures it).
- **tests/benchgen.cjs** — the bench generator moved from the workspace
  root into the repo's tests/ folder (versioned with the suite that
  depends on it; rides the next source upload as file 84). Regenerates
  the 5-song bench (22 kHz mono, b124f keeps its 2.5 s silent lead-in)
  and self-verifies 5/5 against a verbatim copy of the app's analyzer
  before writing.
## 2026-09-12 — 🚀 PUBLISHED: v1.9.0 is live
Owner uploaded and published the release: tag **v1.9.0** (not
pre-release), the corrected release notes pasted into the body, and
HomeBinger-1.9.0-beta.zip attached (107,563,254 B — byte-exact match to
the build). The main branch carries the full 83-file source (t121
markers + stamp v=1789174562813 verified via the raw GitHub endpoints),
commit "Home Binger 1.9.0". The in-app update notice resolves against
the live release (current 1.9.0 = latest 1.9.0 → no nag; 1.8.9 clients
get the notice with the download link). Two follow-ups flagged for the
owner: the v1.9.0 tag was created before the 1.9.0 commit landed (it
points at the 1.8.9 commit — the release page's "Source code" links
serve 1.8.9; main is correct), and the notes got pasted into the
release body twice. Both fixed by editing the release after deleting
the tag (re-type v1.9.0 → creates it on current main; paste the body
once).
## 2026-09-12 — 1.9.0 (held): t121 — three owner notes (S-key leak, booth hover, podcasts in the jukebox)
- **"Music goes back a beat pressing s in the dance hall with music
  playing" — FIXED.** The DJ menu's close button only HID the modal: the
  pro rig's window-keyboard handler stayed registered with its panel
  still in the DOM, so after using the booth once, the WASD walk keys
  fired booth shortcuts in the world — S (walk backward) ran SYNC,
  yanking the live deck onto the other deck's beat grid. Closing the DJ
  menu now fully DISMOUNTS the rig: panel DOM removed, keyboard
  handler removed (unmount also root.remove()s now). Space, A/B, cue
  digits, L, X, arrows and the crossfader keys all died with it.
- **"Remove hover overlay for Dj menu" — DONE.** Aiming at the booth
  laptop no longer pops the "💻 Open the DJ menu" tip (same quiet
  treatment as the jukebox got in t85). Clicking still opens it.
- **"Rss podcasts … Wont show up in jukebox as it should be able to be
  listed with all the music thats available to the user" — FIXED.** The
  jukebox's "Add music" was a dropdown capped at the FIRST 120 items
  with no search, so podcast episodes (late in the library) could never
  be queued from the jukebox — only the booth's search could reach
  them. The jukebox now has the same picker as the booth (t113): a
  search box over ALL available music (albums, stations, podcasts,
  grabber files) with the list scroll-loading past 150 rows; click a
  row to queue it. Podcasts still don't shelve (CDs are gone) — the
  jukebox list is their home, per the owner's pick of the two options.
- Test **t121BoothKeys** (open → close → .djp gone, S/Space/arrows/L/B
  leave the engine untouched, reopen works, jukebox closes clean,
  source asserts for the hover removal + close-unmount wiring) and
  **t121JukeboxMusic** (237-item library: 150-row first chunk, scroll
  loads all 237, a podcast row is reachable, "Store Cast" search
  narrows to exactly its episodes, clicking queues on the jukebox).
  Suite **116/116 ×2**. Also de-flaked: t118's REC-timer read now
  polls (a stalled RAF painter under swiftshader load froze the text,
  not the timer), and t121's scroll-append loop dispatches the scroll
  event explicitly (native delivery can coalesce under load).
## 2026-09-11 — 1.9.0 (held): t120 — the REST of the UI follows the theme too
- **Owner: "The pink navy type background doesnt always look best when
  theme is changed. Go thru all ui and make sure it all is able to
  change."** The t119 pass covered the booth + both halls, but every
  2D panel still framed itself in Neon Night navy/pink, and every
  in-world sign sat on a hardcoded plum/navy backing:
  - **--vb-card / --vb-line were never re-derived** — every menu,
    modal, chip, tooltip, toast and HUD button kept the :root navy
    panel + pink border. themeVars() now derives the card from the
    wall (dark walls sink 10% toward black, light walls lift 10%
    toward white), the border from the accent (35% alpha), and a new
    --vb-panel input-well tone (selects + field inputs never had one —
    they fell back to navy #141a2e).
  - **Ten hardcoded surfaces de-branded:** the TV remote, TV queue,
    shelf pager, front-desk sign-in card, carry chip and the
    fullscreen-TV close button all wore fixed navy + (some) gold
    borders; the radio "choice" cards and the profile badges wore
    fixed pink; two ui.js inline styles hardcoded navy input
    backgrounds. All now ride the card/line/panel vars.
  - **Every in-world sign panel derives from the wall:** store aisle
    lightboxes + their edge frames + the poster frames (signage.js),
    the theater's doorway signs, the RETURNS chute label AND the
    deck's VHS·DVD·BLU-RAY label (which also never re-themed its
    accent after boot — fixed), the hall's hanging signs, and the
    dance hall's DJ'S LIBRARY sign. All were #160f1e/#0b1c4d-plum or
    #0b1330/#0e1734-navy; all are now wall·50% black (edges deeper).
  - **Still brand / still functional (owner-approved):** the logo
    wordmark stays #ff3ea5 (chip, boot ticket, 3D sign, favicon); the
    light show, LO/MID/HI meters, Camelot green, REC/CLOSED/status
    colors, the TV's own content, and neutral furniture/architecture
    keep their colors.
  - Test **t120UiAllFollowsTheme**: wild green theme proves the root
    vars derive exactly (card rgba(25,67,38,.94), panel rgba(14,37,21,
    .6), line rgba(125,255,90,.35)), all six fixed surfaces wear the
    card, badges + choice cards wear the accent, the select well
    follows, all four rooms' sign backgrounds equal wall·50% black
    (store aisles incl. edges/frames, hall, dance, theater), the logo
    stays brand pink, and the restore round-trips. Suite 114/114 ×2.
## 2026-09-11 — 1.9.0 (held): the theme finally goes app-wide — everything but the logo
- **Change your theme and the WHOLE store changes with it.** Two whole
  rooms and the biggest panel in the app were missing the party: the
  **DJ booth panel** was locked to one hardcoded neon palette, the
  **entry hall** only themed at boot (never on a theme change), and the
  **dance hall's walls were hardcoded purple-black** no matter what
  theme you picked. All of it follows the theme now, live:
  - The booth panel's surfaces derive from your wall color, text from
    the theme ink, and every control from the accent — deck A wears the
    accent's light tint, deck B the full accent.
  - The entry hall, dance hall and DJ booth area recolor on the spot:
    walls, floors, baseboards, door trim, hanging signs, speaker rings,
    the booth's glow strip, the mixer faders, the dance-floor checker,
    the laptop screen, the DJ'S LIBRARY sign and every record plaque.
  - The store's **light show keeps its own colors** (the beams, LED wall
    and pools are the show, not the decor), and meters keep their
    read-out colors (the LO/MID/HIGH trio matches the laptop HUD).
- **The logo is brand, not theme.** Per the owner: everything except
  logo-type material follows the theme — so the Home Binger wordmark
  (the in-store sign, the top-left chip, the boot ticket) now keeps its
  brand pink no matter the theme. It used to ride the theme accent.
- Suite: **113/113 ×2 green** (the full booth battery now runs on a
  smaller ground-truth bench — same detection results, a quarter of the
  file size).


## 2026-09-11 — 1.9.0 (held): the booth gets a full shakedown — five real bugs found and fixed
- **Every control on the booth is now machine-verified.** A new test
  battery drives the REAL panel — hot cues ×8, auto-loops 0.5–32 beats,
  slip, instant doubles, beat jump, SYNC, key lock, the pitch fader with
  all four ranges, EQ kills, the color knob (filter/dub), nudge, trim,
  crossfader + curve + channel assign, beat FX with the paddle and
  brake, mic + auto-ducking, REC, save/load set, beginner↔pro, help —
  plus a three-transition AUTO-DJ set across actually-different songs
  (blend → filter → echo). Suite: **112/112 ×2 green.**
- **SYNC lands exactly on the beat now.** The phase math mixed track
  positions with wall-clock beat lengths, so at any tempo offset the two
  songs ended up a tenth of a beat apart — an audible flam on the kick.
  Sync now compares beat FRACTIONS (correct at any rate); the alignment
  is exact the instant you press it.
- **Saved sets remember a synced tempo.** Loading a saved set restored
  the pitch fader AFTER the rate, and the fader re-derives the rate —
  so a synced deck snapped back to its fader tempo on every set reload.
  The rate you hear is now the rate that comes back.
- **Big genre jumps echo out instead of dragging.** A tempo jump with a
  key clash used to be treated as a filter bridge — AND synced: a
  174 BPM track got dragged to 0.70× to match a 128 BPM set. Any gap
  over 8% now exits with the echo roll and the new song drops at its
  own tempo.
- **Silent intros are actually skipped now.** The silence-trim never
  ran: it read the song length off the audio element before the player
  had loaded it (NaN), so the trim quietly bailed and the incoming song
  started from absolute zero. It now falls back to the analyzer's own
  duration — a track with a 2-second silent intro starts at the music.
- **BPM detection is tighter.** The background tempo detector rounded
  every reading to its analysis grid — up to ±2.6% off at some tempos
  (past beatmatch tolerance). Parabolic peak interpolation (the same
  trick aubio/librosa use) lands within ±0.8% worst case: measured
  against five engineered ground-truth tracks (90–174 BPM, known keys),
  all five keys correct, all five tempos within 0.61%.
- *Test media note: the bench songs are synthetic, generated with known
  BPM/key/silence — they live in a git-ignored test folder and never
  ship in the app or the zips.*


## 2026-09-10 — 1.9.0: your own personal DJ — pro transitions, a dependable AUTO-DJ, and the queue on the laptop
- **AUTO-DJ mixes like a pro now.** Each transition is picked for the
  pair of songs: matching tempo and key get a long 16-beat blend with
  the classic **bass swap** — the new song layers in with its bass
  quietly cut, then the low end swaps over in one move, so two
  basslines never fight.
- **AUTO-DJ actually beatmatches now — the real DJ mix.** The tempo of a
  song is known the moment it loads: Home Binger reads the BPM and key your
  DAW or DJ tool already wrote into the file's tags (instant), and runs its
  own background analysis (beat grid, tempo, musical key) on upcoming queue
  tracks before they're ever needed. Transitions now engage full sync —
  tempo matched, phase aligned, drift-guarded for the whole blend — plus two
  new pro touches: the outgoing song sweeps out under a rising filter after
  the bass swap, and big tempo jumps exit with a one-beat echo roll.
- **The laptop shows LOW / MID / HIGH meters while the mix runs** (panel
  closed), not just a bass strip.
- **The dance-floor lights ride deep bass and lively music.** The beat
  detector now listens for the kick's RISE (onset) against the track's own
  flux, instead of requiring a kick to clear its rolling bass average —
  which sustained sub-bass made impossible (why the rig loved slow flowy
  tracks and slept through DnB/EDM). Faster tempos hit on their beats
  (tempo-adaptive refractory), deeper kicks travel further, and the beat
  punch snaps quicker on lively tracks.
- **No more tempo ratchet.** AUTO-DJ used to inherit speed: a fast song
  early in the night pushed every later song faster, and small
  corrections could pile on top of it — worse the longer it ran. Now
  each blend's beatmatch corrections are shed the moment the blend
  ends, and between blends the live deck quietly eases back toward its
  natural tempo (key lock keeps the pitch — it's speed only). The set
  rides each song's own groove instead of the fastest thing you queued
  first.
- **The queue doesn't repeat anymore.** When AUTO-DJ reaches the end of
  the queue, the last song plays out naturally and the engine switches
  itself off — it used to loop the list forever.
- **The festival lights — six new signature programs, and a real fix
  underneath.** A subtle geometry bug meant the fixtures' PAN never
  actually turned the beams — every beam leaned the same direction and
  only the tilt showed (why the lights felt "off" no matter the song).
  With pan fixed, the four corner beams now genuinely sweep, cross, and
  converge: **Scissor Cross** (mirrored pairs slicing through the floor's
  center), **Vortex Cyclone** (all four chasing an orbiting point in a
  3D tornado), **Diagonal X** (two pairs slicing the diagonals into an
  animated X), **Wave Chase** (a fluid wave rolling booth to entrance),
  **Ground Sweep** (steep parallel searchlights), and **Drop Explode**
  (beams snap wide to the corners in white with 3× sweeps). On musical
  drops, the rig seizes a momentary explode — all by itself. The
  floor-impact pools match the beam's true shape — a circle when the
  beam is steep, stretching into an ellipse along the beam's direction
  as it tilts, sized by the cone's actual spread and the lens zoom,
  with a soft light-like falloff — and Auto-rotate now gives each look
  a full 32 beats.
- **The music list loads as you scroll.** The booth's library list used to
  stop at 250 rows — now it starts with the first batch and keeps loading
  as you scroll, so you can browse your whole library without remembering
  a single title. Typing still narrows instantly, and the list stays fast
  even with thousands of songs.
- **The AUTO-DJ queue count is live.** Adding songs with the Q buttons
  while AUTO-DJ is running now shows up immediately in the booth laptop's
  count — it used to stay stuck at whatever it was when AUTO-DJ started
  ("1 LEFT" forever, no matter how many you added). Switching AUTO-DJ off
  and on keeps the night's list, and queued songs survive library
  refreshes.
- **Key clashes get a **filter fade** (the
  incoming track opens up from behind a high-pass while the old one
  thins away); big tempo jumps get a quick **echo-out**. Transitions
  fire on the beat grid — 32-beat phrase lines, never mid-bar — the
  countdown uses the song's last *audible* moment instead of its file
  length, silent intros get skipped, and a **drift guard** keeps both
  songs phase-locked for the whole blend (key lock on, pitch steady).
  Hit stop mid-blend and every knob comes back clean — no deck left
  with its bass missing or a filter stuck on. The live style shows on
  the booth laptop: "AUTO-DJ · 3 LEFT · BLEND".
- **The laptop in the 3D booth shows what's coming.** With AUTO-DJ
  running, the booth laptop — the one you can see with the menu closed —
  now displays how many songs are left in the queue and the next three
  titles, with a slim bass strip so the beat stays readable.
- **AUTO-DJ no longer stalls.** Three real bugs fixed: the outgoing song
  now properly stops after each crossfade (it used to keep playing
  silently, which jammed the next switch), the hand-off no longer waits
  for tempo detection to finish, and the whole engine now runs on its
  own timer — so it keeps mixing even when the window is in the
  background. The crossfade itself is scheduled on the audio clock, so
  it's sample-smooth and can't be interrupted by a busy page.
- **No dead air, ever.** If the audible deck stops unexpectedly — a
  track ends early, playback gets blocked — AUTO-DJ notices within half
  a second and starts the next song on its own.
- **Stop means stop.** The full stop button now switches AUTO-DJ off
  too, instead of letting it resurrect the music.
- **Booth performance pass:** very large music libraries now render a
  capped list (smooth instead of thousands of rows), the waveform cache
  is capped so a long night doesn't grow memory forever, the panel's
  paint loop idles while the menu is closed, and the meters share one
  reading per frame.
- **Also riding in this update:** the official trademark notices
  (Home Binger™ · The CordCut Co-op™ · TCC™) in the README and the new
  TRADEMARKS.md.

## 2026-09-10 — 1.8.9: the lights really move now — the movement wave
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
