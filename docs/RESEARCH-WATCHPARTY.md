# RESEARCH — Watch Party W1 (synced theater nights)

> Status: **RESEARCH COMPLETE — structure only, nothing implemented** (owner
> doctrine, 2026-09-12). Last item in the queue: on-ramp → rung 2 → THIS.
> The sync algorithm below is not invented here — it is the documented
> technique Jellyfin SyncPlay uses, scaled to our zero-dependency server.

## The goal (ROADMAP Phase W, owner's staging)

**W1 — synced theater nights (small):** the host queues a title; everyone
IN the theater stays in sync — host controls, synchronized start, a
"🎬 Now hosting" sign, simple in-room chat. W2 (invite links) and W3
(multiplayer presence) stay parked per the roadmap.

**Hard prerequisite, already agreed:** remote connections come first —
far-away friends can't join a theater they can't reach (the on-ramp).

## What exists today (code audit, 2026-09-12)

- WHAT's on the TV is server-known: `cfg.tv.itemId` / per-user
  `prefs.tv.itemId`, `GET /api/tv` reports it. The roadmap line "the TV
  state already lives on the server" is **half true** — that's the item
  selection only.
- **The queue and the playback POSITION are client-side** (tv.js owns the
  `<video>` element; playNext/queue live in scene.js). A party therefore
  needs a NEW small server-side session object — this is the honest gap,
  and it's the core of W1's structure.
- The server streams video with Range support (`/api/play/…`, `/api/tv/stream`)
  — every guest can already pull the same file at their own offset.
- Auth: party members are accounts/guest devices on the HOST's store
  (existing approval doctrine). **Party content = the host's own library
  only** — friend-shared media can't be co-watched (no-transitive rule;
  their server, their tokens).
- Transport today: plain HTTP request/response. **No WebSockets** — and a
  `ws` library is off the table (zero-npm-dep doctrine).

## Verdicts — every component, yes/no/maybe

| Component | Verdict | Evidence / reasoning |
|---|---|---|
| Live event transport without new deps | **YES — SSE** | Server-Sent Events: `EventSource` is browser-native; the server side is a plain chunked HTTP response our node server can already write. No npm package. Built-in auto-reconnect. One EventSource per party client is nothing against the browser's 6-connection HTTP/1.1 budget (everything else is short REST). We already send `Cache-Control: no-store`. |
| Shared clock (client ↔ server) | **YES** | Add `GET /api/party/time` → server epoch ms. Client takes 8 round-trip samples, keeps the **minimum-RTT sample** as the offset estimate (Jellyfin SyncPlay's documented "min-delay selection" — jitter only ever ADDS delay, so the fastest sample is the most accurate). On LAN/tailnet RTT runs 1–50 ms → clock error under ~25 ms. |
| Drift correction | **YES** | SyncPlay's two-strategy scheme, documented and field-proven: expected position = `lastPos + (serverNow − lastAt)`; drift = expected − actual. Deadzone ±~100 ms (do nothing); **SpeedToSync** — nudge `playbackRate` to ~0.95×/1.05× for small drift (imperceptible); **SkipToSync** — hard seek when drift exceeds ~1.5 s (buffering, seeks). |
| Everyone-pauses-on-buffering | **YES** | Guests report stall events over SSE; host's session pauses the group until the stalled guest refills (Jellyfin does exactly this; it's why their parties feel calm). |
| Host control + synchronized start | **YES** | Host is the single writer of the party session (play/pause/seek/next are host-only in v1); guests are read+follow. "Start together" = host arms a countdown (e.g. 5-0 on the theater screen), T0 lands on the shared clock. |
| The "🎬 Now hosting" sign | **YES** | Server session exposes host + title; the theater marquee (client) renders it. |
| Simple in-room chat | **MAYBE (cut candidate)** | Mechanically trivial over SSE (last-50 buffer + events), but it's the only W1 piece with moderation/scope risk. Recommend v1 ships WITHOUT chat, adds it in W1.1 if testers ask — the ROADMAP already stages W-bigger separately. |
| Remote guest COUNT (bandwidth) | **MAYBE — measure, don't guess** | Direct-stream only (no transcoding — no ffmpeg by design, zero deps). 1080p direct runs ~5–10 Mbps per viewer; typical home upload is 10–40 Mbps → **2–6 remote guests is the realistic band**. This is arithmetic, not a promise: W1's gate is a field test — host + N testers, log rebuffer rates, and the doc states the measured ceiling honestly. If upload binds, W1 is a LAN/VPN-small feature by design, not a bug. |
| W3 multiplayer presence | **PARKED (roadmap)** | Real-time avatars = its own project; stays on the record, out of the way. |

**No component is a NO.** The only genuine unknowns are chat scope (owner
call) and the measured remote-guest ceiling (field test).

## Proposed structure (NOT implemented)

```
server/routes/api.js      /api/party/*  — create/join/leave, host commands,
                          GET /api/party/time (clock), GET /api/party/events
                          (SSE stream), chat events (if kept)
server/lib/party.js       in-memory session: { id, hostUserId, itemId,
                          posSchedule (position + serverTime anchors),
                          guests[], stallState, last50Chat[] }
public/js/store3d/tv.js   follow mode: when a party session is live and I'm
                          a guest — apply SpeedToSync/SkipToSync against the
                          schedule; host keeps today's controls untouched
public/js/ui.js           party bar (who's in, host badge), join/leave,
                          "Now hosting" marquee
tests/v36 (or v35 block)  t-123: two pages in one browser — one host, one
                          guest; clock offset sane; host seeks → guest's
                          expected-vs-actual within deadzone after settle;
                          stall → group pause; leave → clean teardown
```

**Auth model:** guests must be signed-in users (or approved guest devices)
of the host's store — the same gate as everything else. The SSE stream
carries the same auth cookie/token check as REST.

## Owner decisions — LOCKED (2026-09-12: "go with your calls")

1. **No chat in W1.** W1 exists to prove sync feels magical; chat is one
   small addition away if testers ask.
2. **Field test size: the owner + 3 remote friends** — the middle of the
   realistic 2–6 remote band.
3. **Stalled viewer pauses everyone (≤4 guests); silent catch-up beyond.**
   Small groups are social; big groups shouldn't stall for one person.

## Gate checklist before writing any code

- [ ] On-ramp live (friends can actually reach the store remotely).
- [ ] Rung 2 shipped (per the queue order the owner set).
- [ ] A 2-page sync prototype measured in the test suite (drift ≤ deadzone
      after settle, on THIS codebase, before any UI work).
- [ ] Bandwidth field test with real testers; write the measured number
      into this doc and REMOTE-ACCESS.md.
- [x] ~~Owner answers Q1–Q3.~~ — answered 2026-09-12.
