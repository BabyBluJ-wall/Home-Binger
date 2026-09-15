# RESEARCH — Mobile Simple Mode (a plain list UI, with a desktop-mode toggle)

> Status: **RESEARCH COMPLETE — structure only, nothing implemented** (owner
> doctrine, 2026-09-12: "dont implement until we fully know that it will all
> work. i dont guess i research to know yes no or maybe.")
> Owner ask: *"easily available on mobile by making it a simple list more
> like how other platforms are but when desktop mode is turned on it goes
> to the pc version"* — plus the standing goal: non-technical friends.

## The goal

A phone-friendly, plain, fast list app — poster rows, tap a title, tap
play — that any friend can use the moment they open the link. The 3D store
stays exactly as it is; a per-device toggle switches between the two.

## What exists today (code audit, 2026-09-12)

- The 3D store **already runs on phones**: viewport meta present, touch
  controls implemented (controls.js `touchstart` + `isTouch()`), a t83
  mobile-performance pass in style.css, responsive item modal (@640px).
  So Simple Mode is an *additional, lighter client* — not a mobile port.
- Everything a list app needs is already a working server API:
  `/api/bootstrap` (who am I, prefs), `/api/library` (the catalogue with
  sections + poster URLs), `/api/play/...` (Range-capable streams — the
  suite already proves long-stream + resume), `/api/auth/login`,
  `/api/prefs`. **No new server endpoints are required for v1.**
- The TV player already sets `playsinline` + `playsInline` (the iOS
  inline-playback pattern) — the list player reuses the same doctrine.

## Verdicts — every component, yes/no/maybe

| Component | Verdict | Reasoning |
|---|---|---|
| Separate lightweight page (`/m`) | **YES** | The server already serves static files; a `mobile.html + mobile.js + mobile.css` (plain, ~zero-dep, same style-var theme system from t120 so it follows the store's theme) keeps the 3D bundle OFF the phone. Fast load on old phones. |
| Default to Simple Mode on phones | **YES** | Tiny bootstrap check (touch + small viewport + not Electron) → `/m`, unless the device said otherwise. The exe/Electron desktop app is unaffected (its UA is Electron — guard on it explicitly). |
| "Desktop mode" toggle | **YES** | Per-DEVICE preference in localStorage (`hb_desktop=1`) + `?desktop=1` URL escape hatch (for when a friend pastes a link). A "Simple mode" link in the 3D sidebar goes back. Per-device, not per-account — a phone and a PC belonging to the same person want different defaults. |
| Browse + search + play video | **YES** | Same REST calls the store uses. Poster grid with lazy image loading; item detail with the existing metadata; player = one `<video playsinline>` + tap-to-play (satisfies mobile autoplay policies — playback starting from a user gesture can have sound). |
| Music / podcasts | **YES** | Same `/api/play` audio streams the jukebox uses; a mini-player bar (play/pause/next + art) at the bottom. The t121 searchable music list logic ports directly. |
| Sign-in on mobile | **YES** | The gate-card login flow is a plain form posting to `/api/auth/login` — restyled for the list app. Guest devices (the default friend path) need nothing. |
| Remote (off-Wi-Fi) use | **YES (rides existing work)** | Same server, same URL — the Tailscale on-ramp (already researched) is what makes a phone outside the house reach it. No extra work here; noted because it's the *reason* Simple Mode matters for friends. |
| Format compatibility | **MAYBE — honest caveat** | Direct play only (no transcoding — zero-dependency doctrine, same as the 3D TV today). Android Chrome: plays mp4/mkv(h264)/webm broadly. iOS Safari: mp4/H.264/AAC solid; mkv/webm/opus often NOT — those titles should show a "not playable on this device" chip instead of a broken player. The library data already carries file keys, so the chip is computable client-side. No guessing: which of the owner's real files trip this gets measured in the gate test, not estimated. |
| TV remote / party features on mobile | **LATER (cut from v1)** | The mobile page can later become the best remote in the house (queue for the theater TV, party join for W1). Structured for, not built in, v1. |

**Nothing is a NO.** The only MAYBE is device-format playback, and it's a
caveat to display honestly, not a blocker.

## Proposed structure (NOT implemented)

```
public/mobile.html/.js/.css   the Simple Mode client (plain, zero deps,
                              themed via the same --vb-* vars)
public/index.html             +3 lines of bootstrap redirect logic
                              (touch/small/!Electron → /m unless hb_desktop
                              or ?desktop=1)
public/js/ui.js               "📱 Simple mode" link in the 3D sidebar → /m
server/                       NO CHANGES in v1 (static serving + existing
                              APIs already cover it)
tests/v35.cjs                 t-block: /m loads, login, library renders,
                              poster lazy-load, play url 206s, desktop-mode
                              toggle round-trips, Electron guard
```

**Scope discipline for v1** (keep it genuinely simple): sections + browse +
search + item detail + play video/music + sign-in + the toggle. Everything
else (remote control, party, sharing management) is explicitly out.

## Companion item (flagged, NOT yet researched)

The owner's wider ask — *"those that dont know how to set this all up can
do it easier than what i have been doing"* — also points at a **first-run
setup wizard** for the store side (the exe opens → "Where's your media?"
→ Plex / Jellyfin / folders → scan → done). That's a separate research
item; do not assume its shape until it gets its own pass.

## Owner decisions — LOCKED (2026-09-12: "go with your calls")

1. **Poster grid, with a "data saver" text-list toggle.** "Like how other
   platforms are" was the owner's own spec — the grid IS that; the list
   mode covers old phones and bad connections.
2. **Phones default to Simple Mode**, with a one-time banner in the 3D
   view pointing back to it. Friends' phones are the pain point.

## Review-pass additions (the "what did we miss" sweep, 2026-09-12)

- **Screen-lock audio:** phone audio must KEEP PLAYING with the screen
  locked, with lock-screen controls (play/pause). That means the Media
  Session API in the mobile player — verify on a real iPhone + Android
  in the gate; a store whose music dies on lock feels broken.
- **"Add to Home Screen" (PWA-lite):** a manifest + icons so "Add to Home
  Screen" gives friends an app-icon feel — zero store fees, zero review.
  Nice-to-have, not a v1 blocker.

## Gate checklist before writing any code

- [x] ~~Owner answers Q1 + Q2.~~ — answered 2026-09-12.
- [ ] Media Session verified on real hardware (audio survives lock).
- [ ] One-friend release gate applies here too (see the on-ramp doc).
- [ ] Format survey: run the owner's REAL library through a compatibility
      table (extension × codec tag) and confirm the "not playable" chip
      logic against actual files — measured, not guessed.
- [ ] Confirm the redirect guard on the real Electron UA string.
- [ ] t-block test plan reviewed (incl. the toggle round-trip).
