# 📱 Home Binger on Android — the honest feasibility study

*Researched 2026-09-06, against our actual architecture (zero-dependency
Node server + browser three.js/WebAudio client + Electron desktop shell).*

## The one-sentence verdict

**Yes, an APK is genuinely feasible — our zero-dependency server is the
best-possible candidate for embedding — but the real work isn't the port;
it's touch controls. And the smartest mobile story starts with something
that already works today.**

## Three paths, ranked

### Path 0 — Phone as CLIENT to your PC server (works TODAY, zero work)
The server already binds `0.0.0.0` exactly so phones can connect. On
Android: browse to `http://<your-pc-ip>:8181` → menu → **"Add to Home
screen."** Chrome builds a real installable app (WebAPK) with its own icon.
This is how most home users actually want it anyway: the media lives on the
PC, the phone walks around the house with you.

**Gap to close for a good experience here:** touch controls (see below) and
a small web-app manifest. That work is shared with Path 2 — nothing wasted.

### Path 1 — Capacitor + embedded Node (the "obvious" path — ⚠️ shaky)
Capacitor packages a web app into an APK, and a community plugin
(Capacitor-NodeJS) embeds a Node runtime so `server.js` could run in-app.
**However, that plugin's own maintainer now advises against it for new
projects** (unmaintained upstream; he recommends Tauri — which would mean
rewriting our server in Rust; wrong fit). Recorded here so we don't walk
into it later.

### Path 2 — nodejs-mobile standalone APK (the real one)
**nodejs-mobile** embeds actual Node.js as a native library in an Android
app (arm64/x86_64; originally by JaneaSystems, now community-maintained).
Our app is almost uniquely suited to it:

- `server.js` uses **only Node built-ins** (zero npm deps) — the single
  biggest portability win possible
- The architecture it needs — local server + WebView pointed at
  `localhost:8181` — is *already* our Electron design, verbatim
- APK size ≈ 50–70 MB (Node runtime + app + three.js)

Risks to test early: runtime maintenance status (community), Android
scoped-storage permissions for media folders, app-lifetime management
(foreground service so the server survives screen-off), battery/thermals
in long theater sessions.

## What survives on Android untouched

- ✅ **three.js rendering** — mobile WebGL handles our scene fine
- ✅ **The entire audio engine** — WebAudio runs full-graph in Android
  WebView/Chrome: the Ambisonic Resonance rings (officially supports
  Android), HRTF panners, all the t70–t79 calibration doctrine
- ✅ Theater, jukebox, DJ booth, shelves, settings — all DOM/WebGL
- ✅ Media streaming (Range requests) — codecs: H.264/AAC universal;
  HEVC/FLAC vary by device (same as any Android app)

## What's lost or needs new work

| Feature | On Android |
|---|---|
| **Pointer-lock first-person controls** | ❌ Doesn't exist on touch — needs a **virtual joystick + drag-look** layer. THE core work item |
| Hover-based affordances (tooltips, hover-highlight) | Need tap fallbacks |
| Keyboard shortcuts (DJ booth: cues, loops, sync) | Need on-screen buttons (deck UI is DOM — mostly tappable already) |
| Discrete 7.1 multichannel output | Phone outputs stereo/Bluetooth — the HRTF binaural path already covers this (headsets = the reference experience anyway) |
| Electron desktop niceties | N/A on phone by definition |
| Media spots pointing at arbitrary folders | Android scoped storage → media access via app-private dir + user-picked folders |

## Recommended staging

1. **Now (cheap):** web-app manifest + touch controls in the browser client
   → Path 0 becomes genuinely good, and every line is reused by the APK.
2. **Then:** one focused spike — nodejs-mobile booted with `server.js` on a
   real device, HTTP 200 from the phone's own server. That single demo
   answers every remaining feasibility question.
3. **Then decide** whether to productize the APK (weeks of polish: icons,
   permissions UX, foreground service, play-store-ready metadata) or let
   Path 0 carry mobile for v1.

*iOS: harder (Apple restricts embedded JS runtimes; nodejs-mobile's iOS leg
uses a dated engine) — treat as a separate, later investigation.*
