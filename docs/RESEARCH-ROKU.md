# RESEARCH — Roku (a TV with no browser)

> **OWNER DECISION (2026-09-12): SKIPPED.** "Roku we are skipping as you
> said its not easily doable." No Roku work planned; revisit only if a
> friend asks twice (the standing bar from the original research).

> Status: **RESEARCH COMPLETE — structure only, nothing implemented** (owner
> doctrine, 2026-09-12: "i dont guess i research to know yes no or maybe.")
> Owner ask: *"Will there be a way to easily make this fully available on
> roku (which does not have a browser)?"*
> Short answer up front, honestly: **there is no EASY full path.** There
> are three real paths with different price tags, and one free rider.

## The goal

A friend with a Roku TV/stick opens Home Binger on the big screen and
watches — without owning a PC, and without the owner hand-holding.

## Research findings (verified against sources, not guessed)

| # | Question | Verdict | Evidence |
|---|---|---|---|
| 1 | Can we hand friends a Roku app outside the Channel Store? | **NO — that Roku is gone** | Roku removed ALL non-certified "private channels" in Feb 2022 (industry-wide anti-piracy alignment). The replacement **beta channels** are capped at 10 per developer account, **20 users each, and auto-expire after 120 days** — explicitly a QA tool, unusable for a permanent personal app. (rokuguide.com's shutdown report; businessinsider.com; techygeekshome.info 2026 status check.) |
| 2 | Can the owner sideload a channel onto a Roku? | **YES but personal-only** | Developer Mode (remote combo Home×3 Up Right Down Left Up) + SDK license + device password + upload the channel zip via browser to the Roku's IP. **Only ONE sideloaded channel at a time** — loading another wipes it. Fine for the owner's own TV; a non-starter for friends' TVs. (rokuguide.com; apexgear.blog.) |
| 3 | Can a real channel reach the public Channel Store? | **YES — but it's a real app project** | Requires building in Roku's BrightScript/SceneGraph and passing certification review. A different language, a different UI toolkit, a publishing pipeline, and ongoing maintenance against Roku OS changes. Also a standing content question: a channel whose content comes from users' private servers must satisfy Roku's policies. Cost of certification: **not yet verified** (gate item). This is the only path to "friends install Home Binger from the Roku store." |
| 4 | Can phones cast/AirPlay to a Roku instead? | **MAYBE — Apple devices only** | Most Roku TVs and 4K-capable players (OS 9.4/10+) support **Apple AirPlay 2** — model lists verified (Ultra, Streaming Stick 4K/+, Express 4K, Premiere, streambars, most Roku TVs; NOT old non-4K Express or model numbers 5XXXX/6XXXX/27xx/35xx/37xx/44xx). iPhone/iPad/Mac can AirPlay **from apps and websites** (Safari) to it. Android has no AirPlay. Same-Wi-Fi requirement — **works on the home LAN, not over the tailnet** (AirPlay discovery is Bonjour/mDNS, which does not cross the VPN). |
| 5 | Can the Roku's built-in player browse a media server? | **MAYBE — the leading server-side path** | **Roku Media Player** is a free, built-in channel that browses **DLNA/UPnP servers on the LAN** and plays personal media. A pure-node DLNA server is implementable (SSDP announce + SOAP ContentDirectory XML; zero npm deps, fits the doctrine) — real protocol work, but entirely server-side: friends need ZERO installs, the app is already on their Roku. **Hard caveats:** (a) LAN-only — SSDP multicast doesn't cross the tailnet, so this is an at-home feature, not a remote one; (b) direct-play formats only: MP4/MKV/MOV with H.264 (HEVC/VP9 on capable models), AAC/MP3/FLAC/WAV; AC3/DTS passthrough-only; unsupported files are hidden; (c) **Roku OS 14.0 introduced an AC3/DTS audio bug on several models, only partially fixed in OS 15 (Oct 2025)** — a documented reliability wobble; (d) browsing is folder/list-style, not the 3D store (fine — that's what a TV wants). |
| 6 | What about Chromecast / other TV sticks? | **Free rider note** | Chrome's built-in "Cast…" (tab/video) reaches Chromecast/Google TV from the mobile web app with ZERO dev — same pattern as AirPlay for Android folks. Fire TV / Android TV have no default browser either; their answer would mirror Roku's (native app = big project). |

## The three real Roku paths, priced honestly

| Path | Effort | Who can use it | Where it works | The catch |
|---|---|---|---|---|
| **A. AirPlay 2** (no Roku dev at all) | ~Zero (rides the Mobile Simple Mode app) | iPhone/iPad/Mac friends | Same Wi-Fi (home LAN only) | Needs an AirPlay-capable Roku; Android friends left out; mirroring quality ≠ native |
| **B. DLNA server → Roku Media Player** | Medium (pure-node DLNA, our code only) | EVERYONE with a Roku, zero installs | Home LAN only | Direct-play formats only; OS-14/15 audio bug on some models; list-style browsing (acceptable on TV) |
| **C. Native Roku channel (BrightScript)** | Big (new language, certification, maintenance) | Anyone — real store listing | LAN + remote (tailnet URLs work in a channel) | A whole second app; certification review; policy fit to verify; NOT "easy" |

**Recommended sequencing:** build nothing Roku-specific yet. Ship Mobile
Simple Mode first (it's YES across the board) — Path A arrives free the
day it lands. Then, if TV demand is real, prototype Path B (DLNA) as the
zero-install Roku answer for the owner's home. Path C stays parked unless
the owner decides Home Binger belongs in the Roku store as a product.

## Open questions for the owner

1. Whose Rokus matter — yours at home, or friends' TVs in their homes?
   (Home-only → Path B shines. Friends' houses → remote matters → only
   Path C truly delivers, and it's the big one.)
2. What Roku hardware do you (and they) actually have? Model number from
   Settings → System → About settles AirPlay (Path A) eligibility in
   seconds.
3. Is "watch on the big TV at home" the real want — i.e., would the
   owner's TV being served (Path B) cover 90% of the ask?

## Gate checklist before writing any code

- [ ] Mobile Simple Mode shipped (Path A's foundation).
- [ ] Owner's Roku model + OS confirmed (AirPlay eligibility, OS-14/15
      audio-bug status for Path B).
- [ ] If Path B proceeds: DLNA prototype validated against a REAL Roku
      Media Player (browse + play of the owner's actual file types) before
      any polish — the format table above gets replaced by measured
      results.
- [ ] If Path C ever proceeds: verify certification requirements + cost
      + policy fit for a personal-media channel BEFORE writing
      BrightScript (that's its own research doc).
