# RESEARCH — Live TV (the ALLtvLive ask + iptv-org)

**Owner ask (2026-09-12):** "look into
https://github.com/devSahinur/ALLtvLive — Is this able to be used as our
live tv? can we make it work to where the ui is clean?"

**OWNER GREEN LIGHT (same day): "Green light on live tv. Anything that we
can get for free we can use."** Plus two design orders: TV channels do
NOT go on the shelves, and live TV is reached through a nostalgic
GUIDE menu in the theater ("just as the tv guides used to be — this
project is about nostalgia").

Research-only doc, standard doctrine: verdicts first, zero implementation.

**SEQUENCING (owner, 2026-09-12, overriding my after-friends
recommendation): live TV ships INSIDE the combined release.** Owner:
"What better way to let people test than with free tv and their own
personal libraries." The one box = jukebox hotfix + Friends Update +
Live TV Guide; the one-real-friend gate applies to ALL of it (the
friend test now includes: open the Guide, flip a channel, it plays).
Internal build order stays friend-path-first (it's the gate), live TV
built modular beside it — if live TV hits a late wall, it can be lifted
back out without touching the friend path.

---

## 1 · What ALLtvLive actually is (and the headline)

ALLtvLive is **not a TV source**. It is a Next.js 15 web app (TypeScript,
Tailwind, shadcn/ui, Zustand, SWR) that reads the **public iptv-org API**
and plays the streams with HLS.js. The app itself is just one consumer of
a public directory — the same relationship our radio wall has with
radio-browser.info.

**So the question isn't "use their app" — it's "use their SOURCE."**

## 2 · Verdict table (researched live 2026-09-12)

| Question | Verdict | Why |
|---|---|---|
| Use the ALLtvLive **app/code** in HB | **NO** | (a) **The repo has NO LICENSE file** — the README's MIT badge links to a file that doesn't exist (raw 404). No license = all rights reserved = we legally cannot reuse the code. (b) Wrong stack entirely: Next.js + TypeScript + Tailwind + shadcn vs our zero-dependency vanilla ES6 doctrine. (c) Unnecessary — the API it reads is public. |
| Use **iptv-org** (the source) as HB's live TV | **YES — with conditions** | Public, no-auth, no-key JSON APIs, verified live: `channels.json` (31,219 channels), `streams.json` (17,242 streams), `categories.json`, `countries.json`, `logos.json`. ~96% of streams are HLS `.m3u8`. US: 1,576 non-NSFW channels with streams. Same shape as our radio wall (community directory + stream links). |
| **Play them in Chromium** (Opera GX, the Electron exe, Android) | **YES — vendor hls.js** | HLS does not play natively in Chromium `<video>` (Safari/iOS only — our existing Plex live-TV note admits this). hls.js = Apache-2.0, ONE 415 KB file, same vendoring pattern as `three.module.js` and Resonance Audio. No npm, no build step, doctrine intact. |
| **Clean UI?** | **YES — automatic** | We don't use their UI at all. Live channels flow into machinery that ALREADY EXISTS: `type: 'live'` → 📺 VHS cases on the shelves → the LIVE TV panel (already in Settings, already has ▶ Play-on-TV buttons) → the in-store TV. A new `iptv` adapter looks identical to a tuner's channels from the user's side. |
| Play **direct** (no proxy) | **NO — MEASURED (was YES)** | The 2026-09-12 full-audit simulation flipped this: a real page origin could NOT fetch 11 of 12 sampled official-tier streams (third-party mirrors like jmp2.uk send no CORS; only Akamai sent `CORS *`). Direct play survives as an OPTIMIZATION for CORS-open official CDNs only. |
| Play through an **m3u8-rewrite proxy** (§6) | **YES — PROVEN, and REQUIRED** | The audit built the §6 proxy as a live simulation: fetch manifest server-side, rewrite variant/segment URLs through the server, pipe. **9 of 12 sampled channels PLAYED real frames in headless Chromium** — all 8 Pluto channels in 0.5–3 s to first frames. The 3 ABC/Akamai streams 404'd at the variant level from a datacenter IP (geo/token edge behavior — the flakiness caveat measured; a home IP may differ). |
| Everything-on-by-default (all 10,000+ channels) | **NO — curation required** | The full index mixes official free feeds with **pirate restreams** (e.g. "ABC" streams from anonymous IPs like `190.11.225.124:5000`). Blanket use would put HB in the gray zone we've refused all along (YouTube extraction NO, Tubi/Pluto APIs NO). **NSFW filter is mandatory** (375 channels flagged `is_nsfw`). |
| Officially-free curated tier | **YES — the recommended shape** | iptv-org data carries `network`/`owners`. Filtering US channels to officially-free owners (Pluto TV, Tubi, Samsung TV Plus, Roku Channel, STIRR, ABC/CBS/NBC free streams, PBS, NASA, Bloomberg, local-news groups like Gray/Sinclair/Scripps/Tegna/Nexstar, public broadcasters DW/France 24/NHK/Al Jazeera) yields **~576 channels**: series 161 · movies 79 · entertainment 67 · kids 49 · news 38 · documentary 33 · animation 31… A real, honest, free live-TV section. |
| Stream reliability | **MAYBE — honest caveat** | Streams die and geo-block routinely (Al Jazeera's official endpoint 403'd from our datacenter IP while ABC answered 200 — a friend's home IP may differ). The adapter needs the radio-wall treatment: dead-marking, easy channel refresh, and "channel offline" that never wedges anything. Verified-working sample from this research: ABC News Live (official Akamai, CORS \*). |
| EPG / real schedules in the Guide | **NO for v1 — measured** | Researched live 2026-09-12: iptv-org hosts NO EPG (their `iptv-org/epg` repo is a self-run grabber tool, not a feed). The free public aggregator **epg.pw** works (`epg_US.xml`, 31 MB gz, 5,476 channels, 539k programmes) but its universe is TRADITIONAL CABLE — exact-name matching covers only **24 of our 576** official-tier channels (CBS Sports HQ, Charge!, Vevo channels, the CW…). dearbulut's community feed 404s. Pluto/Samsung schedule APIs are unofficial platform internals = same gray zone we refuse. v1 Guide = honest numbered-channel grid with LIVE cells (§3a); real schedules re-open only if a clean source appears. |

## 3 · What it looks like in the store (design, not built — owner-shaped)

**OWNER ORDER: TV channels NEVER touch the shelves.** Live TV lives in
ONE place: a nostalgic **GUIDE menu, opened in the theater**. The 3D
shelving path stays exactly as it is for movies/shows.

### 3a · The Guide (v1 — honest, zero-EPG, maximum nostalgia)

- **Opening it:** three ways, all in the theater — aim at the screen and
  click, the TV remote gets a **GUIDE** button, and the **G** key while
  in the theater. (The theater screen's idle card can whisper "Press G
  for the Guide.")
- **The look — the old paper TV Guide:** channel **numbers** down the
  left (`001`, `002`, …) with the channel logo, the owner's theme
  coloring the guide like every other menu (t120 doctrine), time axis
  across the top (half-hour columns, "now" line highlighted), category
  group headers acting like the old guide's section pages
  (News · Movies · Kids · Documentary · Entertainment …).
- **The cells:** free-streaming channels don't publish schedules (see
  the EPG verdict), so each row carries ONE honest wide cell:
  `● LIVE — <channel description>`. No fake "8:30 The Big Bang Theory"
  fabrications — the nostalgia comes from the LOOK and the flipping,
  not from invented listings.
- **Flipping like a real TV:** ▲/▼ (and the remote's channel buttons)
  flip channel-to-channel INSTANTLY on the theater screen — the dial-
  flipping muscle memory. Clicking a row plays that channel.
- **Honest offline handling:** dead/geo-blocked streams show "channel
  offline" and flipping skips past them — the t122 never-wedge doctrine.

### 3b · Under the hood

- New adapter `server/lib/adapters/iptv.js` — same pattern as radio.js:
  curated officially-free US tier by category group (§2 numbers), NSFW
  excluded at build time, "unverified" admin toggle OFF by default.
  Items carry `type: 'live'` BUT are flagged guide-only so the shelf
  stocker never shelves them (owner order).
- Client: one tiny module (`hlsplay.js`) used everywhere a `<video>` src
  is set today (the store TV, the case view, later Simple Mode): if the
  URL ends `.m3u8` → attach hls.js (vendored), else today's path. Safari
  and iOS keep native HLS.
- The existing LIVE TV panel keeps Plex-tuner channels only and gains a
  "Open the Guide" hint — the Guide is the home for iptv channels.
- Cache + refresh: directory JSON cached like radio (TTL minutes);
  channel health checked lazily, never blocking anything.

## 4 · Legal posture (the honest paragraph)

iptv-org is a community directory of streams that are publicly reachable
on the internet. Some are official free feeds from their owners
(ABC News Live on Disney's own CDN, Pluto/Tubi FAST channels, public
broadcasters, government channels). Others are third-party restreams of
channels that do NOT offer free public streams — those are piracy, and
we will not ship them by default. Our default = the officially-free
tier (~576 US channels), exactly the same posture as the radio wall
(radio-browser community directory) and the movie shelves
(public-domain films). The "unverified" toggle stays available for the
owner's own machine, clearly labeled.

## 5 · Effort estimate (for sequencing — NOT built)

- Adapter + curation + tests: radio-wall-sized, maybe slightly bigger
  (bigger directory, health handling).
- The Guide overlay itself: a real UI piece (grid, groups, flipping,
  theming) — the biggest chunk of this feature, bigger than the adapter.
- hls.js vendoring + hlsplay module + TV/case wiring: small but touches
  the player path — needs its own t-block tests (live channel plays on
  TV, dead channel shows offline without wedging — same doctrine as the
  t122 jukebox fix).
- Admin sections UI: same pattern as radio genres.
- Sequencing DECIDED (owner, 2026-09-12): live TV rides IN the combined
  release (hotfix + Friends Update + Live TV, one box, one friend-gate).
  Built modular so a late live-TV problem can't hold the friend path
  hostage — lift it out and ship the rest if ever needed.

## 6 · CORE DESIGN (promoted from fallback — PROVEN in the 2026-09-12 audit simulation): the m3u8-rewrite proxy

A server route that fetches the playlist, rewrites every
variant/segment URL to point back through `/api/play/iptv/<key>…`, and
pipes segments. ~100–150 lines of pure node (playlist is text).

**Simulation results (12 official-tier channels, headless Chromium +
vendored hls.js 1.7.3):**
- DIRECT from a page origin: 0/12 (CORS walls on mirrors; only Akamai's
  master answered with CORS \*)
- THROUGH the proxy: **9/12 PLAYED** — every Pluto channel (0.5–3 s to
  first frames); ABC (mirror) 14.5 s; the 3 Akamai ABC News streams
  died at the VARIANT playlist (404 from a datacenter IP — geo/token
  edge behavior, the flakiness caveat measured; home IPs may differ)
- Proxy rules learned the hard way (probe bugs that became design
  rules): follow redirects server-side and resolve relative playlist
  lines against the **post-redirect** URL; never double-respond on
  upstream errors.

**Final architecture:** hybrid — the client asks the server; the server
proxies by default (works everywhere), with direct-play as a later
optimization for known CORS-open CDNs if worthwhile. Curation prefers
official CDN URLs (akamaized/amagi/pluto direct) over mirror
shorteners when both exist — mirrors added a 14.5 s first-frame vs
0.5–3 s for CDNs in the same run.

## 7 · Gate checklist before writing any code

- [x] Owner green-lights live TV (2026-09-12: "Green light on live tv.
      Anything that we can get for free we can use.")
- [x] Sequencing: INSIDE the combined release (owner, 2026-09-12 —
      "what better way to let people test than with free tv and their
      own personal libraries"). Friend gate covers the whole box.
- [x] Design orders locked: NOT on shelves · Guide menu in the theater ·
      nostalgia look · honest cells (no fabricated listings).
- [ ] Owner approves the curation posture (officially-free default +
      clearly-labeled unverified toggle) — or asks for something
      stricter/different.
- [ ] Live-verify hls.js on a REAL Chromium box (owner's Opera GX +
      the Electron exe) with the ABC News Live stream — the sandbox
      proved the API/CDN side; the owner's machine proves the player.
- [ ] Live-verify 20+ sampled official channels for reachability from
      a home IP (not a datacenter) and record the dead-rate.
- [ ] Vendored hls.js lands with its Apache-2.0 notice in CREDITS.md.
- [ ] Dead-channel behavior test: offline channel → honest "channel
      offline" toast, no wedge anywhere (jukebox doctrine, t122).
- [ ] Guide UX test: G-key + remote GUIDE button + screen-click all
      open it IN the theater; ▲/▼ flips channels; shelves stay clean
      of live items (source-assert + visual).
- [ ] FRIEND-GATE ITEM (release is one box now): the one-real-friend
      test includes the Guide — friend opens it, flips a channel, and
      a free-TV stream plays on their machine over the tailnet (their
      browser pulls the stream direct from the CDN — not through the
      host — so the host's upload is untouched).
