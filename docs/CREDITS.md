# 🙏 Credits — every third-party component

*Complete inventory for publishing (GitHub, Steam, or anywhere else).
Last audited: 2026-09-06, build t78.*

## Bundled with Home Binger (ships inside the app)

| Component | Version | License | Where it lives | Source |
|---|---|---|---|---|
| **three.js** | r170 (0.170.0) | MIT | `public/vendor/three.module.js` · notice: `public/vendor/THREE-LICENSE.txt` | https://threejs.org · https://github.com/mrdoob/three.js |
| three.js RoundedBoxGeometry example | r170 | MIT | `public/vendor/RoundedBoxGeometry.js` | https://github.com/mrdoob/three.js |
| **Resonance Audio SDK for Web** (Google) | 1.0.0 | Apache-2.0 | `public/js/vendor/resonance-audio.min.js` · notice: `public/js/vendor/README.md` | https://resonance-audio.github.io · https://github.com/resonance-audio/resonance-audio-web-sdk |

Both are vendored **verbatim** (unmodified). Their license notices ship
alongside them. MIT and Apache-2.0 permit inclusion in this project's
CC BY-NC-SA distribution as long as the notices are preserved — they are.

## Inside the Windows desktop build (not in the web source)

| Component | License | Notes |
|---|---|---|
| **Electron** v33.2.1 | MIT | `tools/build-desktop.mjs` assembles `HomeBinger.exe` from the official Electron win32 zip. Electron bundles Chromium + Node.js, whose full license texts ship inside every Electron distribution. | https://www.electronjs.org |
| Node.js (inside Electron) | MIT | https://nodejs.org |

## Required at runtime (user-provided, not distributed)

| Component | License | Why |
|---|---|---|
| Node.js ≥ 18 | MIT | runs `server/server.js` for the source path (the exe ships its own) |

## Build/test tooling only (never distributed)

| Component | License | Use |
|---|---|---|
| Chrome for Testing 152 | BSD-3 + others | headless self-check suite (tests/v35.cjs) |
| playwright-core | Apache-2.0 | drives the headless browser in tests |

## Online services integrated (no code or media bundled)

- **Plex** / **Jellyfin** — optional personal media servers (user's own
  credentials, proxied server-side; tokens never reach the browser).
- **Internet Archive** — the free public-domain film shelf.
- **radio-browser.info** — the free radio shelf.
- No bundled commercial media of any kind — the building ships empty and is
  stocked by each user from their own library.

## Test media (NOT in the public repo — see .gitignore)

- `tests/media/` — Sintel trailer (© Blender Foundation, CC BY 3.0,
  durian.blender.org) and the owner's own music used as a regression fixture
  (rights reserved; excluded from every zip and the repository).

## How this was built (honest attribution)

- **BluJ Productions (the owner)** — concept, product direction, every design
  decision, and the listening tests that caught four real audio defects no
  instrument in the build could see (the hidden loudness curve, the 50%-volume
  cliff, the EQ-overload gap, the room-calibration drift). Rights holder and
  release authority.
- **Arena.ai Agent Mode (AI agent)** — implemented the codebase, the 73-check
  self-test suite, the build tooling, and the documentation, turn by turn
  under the owner's direction (2026). Credited transparently, as is standard
  for agent-assisted projects; authorship and rights remain with
  BluJ Productions as the directing party.

## Home Binger itself

© BluJ Productions · CC BY-NC-SA 4.0 (see [LICENSE](../LICENSE)).
The owner (BluJ Productions) may commercially distribute (e.g. on Steam);
the NC term applies to everyone else, by design.
