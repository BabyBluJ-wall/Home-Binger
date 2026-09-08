# 📼 Home Binger

**Your virtual video store** — a self-hosted, walkable 3D video store with a
movie theater and a neon dance hall, stocked from your own Plex, Jellyfin, or
any folder on your server. Free for anyone to use and modify, **not for
sale**: licensed [CC BY-NC-SA 4.0](LICENSE) (use it, change it, share it —
just don't make money off it, keep the credit, and share your changes under
the same license). Made with 💙 by **BluJ Productions** — owner-directed,
owner-designed, and ear-tested by BluJ; engineered with AI assistance by
[Arena.ai](https://arena.ai)'s Agent Mode (full story in
[`docs/CREDITS.md`](docs/CREDITS.md)).

## 🏬 What's inside the building

Three connected spaces under one roof:

- **The store** — a classic video-rental floor, ~40 × 40 ft with a tall ~14 ft
  ceiling. Perimeter shelves plus **four slim double-sided gondola islands per
  side (eight total)** around a wide central aisle that runs door → wall TV.
  Cases stand shoulder-to-shoulder in three real-world sizes — tall VHS
  sleeves, DVD keep cases, CD jewels — with the cover wrapped all the way
  around (front, titled spine, mirrored back). When Plex/Jellyfin is
  connected, every case pulls its item's **actual cover art by metadata ID**
  (exact match — not a name search), streamed through this server. Category
  signs re-label themselves from your personal sorting. There's no checkout
  counter — everything happens in-aisle (and on the TV). Music lives in the
  **jukebox** against the back wall (a slim bass cabinet sits flush beside it,
  never poking past the machine) — click it and its DJ deck opens: queue,
  fades, EQ, tempo, and a 🎬 Cinema/Flat voicing toggle.
- **The theater** — behind the store's back wall: a real screening room with
  a sloped floor and its own big screen. Grab a movie off any shelf and hit
  **"Play in the theater"**; a control bar handles stop/seek/volume/repeat.
  The theater is soundproofed: the jukebox and the dance hall never bleed in,
  and the movie never leaks out. Its **8.2 array** plays discrete 7.1 on
  multichannel hardware and **HRTF binaural imaging in a headset** — fronts,
  sides, rears and subs placed around you like a professionally tuned room.
- **The dance hall** — through the glass sliders in the store's right wall. A
  glossy checkerboard floor that **pulses and changes color with the music**,
  a mirror ball, and sweeping light beams that run **DJ-set patterns** (sweep
  → chase → strobe → build-and-drop, changing color with every kick and moving
  differently with every song). Between sets a **club spotlight holds on the
  booth**; the moment the music starts, the spot fades and the rig takes over.
  **10 surround speakers** ring the walls
  plus **subwoofers at the front of the DJ booth counter** (mouths visible,
  aimed at the floor), and neon LED bars and diffused coves riding every wall. The **DJ booth** (two turntables, mixer, laptop) opens a
  full DJ deck: queue, fades, EQ, tempo, dead-center on the floor. Behind its swinging doors, the
  **DJ's Library** keeps the vinyl — click a record to spin it for the floor.
  Dance music **stays in the dance hall**: room gates keep each zone's sound
  inside its own wing.

Between the store and the street, the glass entry sliders stay locked —
click them and the building answers: **"Zombie warning, Stay and party."**
You load in, in the front hallway just outside the store door, looking into
the store; **☰ → Back to front entrance** always returns you there
(anti-stuck). The big screen, the jukebox, and the dance rig each
idle attractively when nothing is playing, and everything on the walls wears
the neon theme.

The mouse starts **unlocked** so the menus are usable — click the store to
look around, **Q** (or Esc) to free the mouse again (Q re-grabs it too), and
the **scroll wheel zooms** — scroll up to lean into a shelf of covers, scroll
down to pull back out. While any menu or form is open, WASD pauses and every
key belongs to the text you're typing. The **sidebar search** finds titles
across the whole building; shelves are only selectable from the room you're
standing in.

**Support this project:** click the **entry door** in the store (or the logo
chip in the top-left HUD) and your **support/projects page is copied to the
clipboard**. Defaults to `https://BluJ-Productions.softr.app`, editable as
`SUPPORT.url` in `public/js/store3d/config.js`.

**Admin access:** the store's admin panels (media servers, store TV, users,
policies) live behind a sign-in. Sign-in is triple-routed — session cookie,
Authorization header, and `?auth=` query parameter — so it works even behind
proxies that strip cookies. On your own LAN, everything just works. Guests
see **🛠️ Admin sign-in** right in ☰ Menu.

Everything runs from **one small Node.js app with ZERO npm dependencies** —
if you have Node 18+ installed, you are two commands away from opening the store.

---

## 💻 Will it run on my machine? (system requirements)

**The Windows exe (HomeBinger.exe):**

| | Minimum | Comfortable |
|---|---|---|
| **OS** | Windows 10 64-bit (hard floor — the bundled runtime dropped Win 7/8.1) | Windows 10/11 64-bit |
| **CPU** | Dual-core, ~2015 or newer (Core i3 class) | Quad-core or better |
| **RAM** | 4 GB | 8 GB |
| **Graphics** | Any GPU with working drivers (DirectX 11 era is fine) | Intel HD 530+ or any dedicated GPU |
| **Disk** | ~1 GB free (app ~270 MB extracted + poster cache + media) | — |
| **Internet** | Not required — local media + the grabber work fully offline | Needed for the free archive.org shelves, radio, Plex/Jellyfin |

Two real-world notes:
- **GPU drivers matter more than GPU power.** With missing/broken drivers the
  app silently falls back to software rendering — it still works, but the
  start screen can take 30–60 seconds to appear. If that happens, update the
  graphics driver and it snaps back to normal.
- **The heaviest moments are the DJ booth** (10 spatial-audio sources) and
  high-bitrate video. A minimum-spec machine runs the store and theater
  fine but may dip in the booth during playback. Headphones give the full
  spatial effect; plain stereo speakers work too.

Port 8181 must be free (the exe politely takes 8182+ if it's busy — the two
never fight). **Running it the Node way or visiting over LAN?** The same
table applies, but the browser carries the graphics load: any current
Chrome, Edge, or Firefox with WebGL2 does it.

---

## 🖥️ The EASY way (Windows, nothing to install)

Grab the **HomeBinger-Windows** folder, open it, and double-click **HomeBinger.exe**.
That's the whole install — it runs in its own app window (no browser, no address
bar) and carries everything it needs inside the folder, including its own copy of
the runtime: **Node.js is NOT required**. Your phones can still connect exactly
like before (same server, same port). If a copy of the store is already running,
the exe quietly takes the next free port from 8181 up — the two never fight —
and if you already have Node installed, the exe simply never touches it.
Settings/users/caches live inside the exe folder (`resources/app/data/`), so
uninstall = delete the folder. Plain-language guide: **START-HERE.txt**.
Rebuild it from source any time: `node tools/build-desktop.mjs`.

## 🚀 Quick start — the beginner's guide (no experience needed)

You do **one** thing: run one command. Here's every click along the way.

### Step 0 — Check you have Node.js (once per computer)

Node.js is the tiny engine that runs the store.

1. **Windows:** press the **Windows key**, type `cmd`, press Enter → a black
   window opens. **Mac:** open **Terminal** (press ⌘+Space, type `terminal`).
2. Type this and press Enter:
   ```
   node -v
   ```
3. You should see something like `v20.11.0` or `v24.20.0`. Any number **18 or
   bigger** is perfect → go to Step 1.
   If you see `'node' is not recognized` (or `command not found`), install it:
   go to **https://nodejs.org**, click the big green **LTS** button, run the
   installer, keep clicking Next until it's done, then **close and reopen**
   the black window and try `node -v` again.

### Step 1 — Unzip the store

Unzip `home-binger.zip` (right-click → *Extract All* on Windows, double-click
on Mac). You get a folder called `home-binger`. Put it anywhere you like
(Desktop is fine).

### Step 2 — Open a terminal INSIDE that folder

The easy way, so you never type a path:

- **Windows:** open the `home-binger` folder in File Explorer, click once on
  the **address bar** at the top, type `cmd`, press Enter. A black window
  opens already "inside" the folder.
- **Mac:** open the `home-binger` folder in Finder, right-click any empty
  space → **Services → New Terminal at Folder** (or Terminal → `cd ` then
  drag the folder in and press Enter).

### Step 3 — Start the store (the one command)

Type this and press Enter:

```
node server/server.js
```

You'll see the **HOME BINGER — now OPEN for business** banner. **Leave that
window open** — closing it closes the store. (To stop the store later: click
in the window and press **Ctrl+C**.)

### Step 4 — Walk in

Open a browser (Chrome/Edge/Firefox) and go to:

```
http://localhost:8181
```

You'll see the **HOME BINGER** start screen → **Enter the store**. The
shelves start empty — that's deliberate. It's YOUR store: stock it in Step 5
by pointing Home Binger at your Plex or Jellyfin — it pulls your actual files,
one item per movie, show, and track.

| Key | What it does |
|---|---|
| **W A S D** | walk (arrow keys work too) |
| **Mouse** | look around (click the store first) |
| **Q** | free the mouse / grab it again |
| **Scroll** | zoom |
| **☰** (top-right) | menu — sorting, themes, admin |

### Step 5 — Stock it with YOUR movies (connect Plex, ~2 minutes)

1. In the store, click **☰ Menu → 🛠️ Admin sign-in** and sign in with
   **BabyBluJ** / **BluJNetwork** (the default — change it in Admin → Users).
2. Go to **🛠️ Admin → Server** and click the **Plex** card (or **Jellyfin**).
   The form changes to show only that service's fields.
3. **Server URL**: `http://` + the IP of the computer running Plex +
   `:32400` — for example `http://192.168.1.50:32400`. If Plex is on THIS
   computer, use `http://localhost:32400`. (Plex Web URLs ending in `/web`
   are fixed automatically.)
4. **X-Plex-Token**: in Plex Web, click any movie → **⋮ → Get Info → View
   XML** → copy the long `X-Plex-Token` number from the address bar.
5. Click **Test connection** — you want a green line like
   `✅ MyServer — 3 usable libraries (Movies, TV Shows, Music)`.
6. Click **Save & stock the shelves**. Watch the shelves fill with YOUR
   covers. Click any case → flip the 3D box around → **Play on the store
   TV**, or carry it to the theater.

(Jellyfin is the same idea: URL ends in `:8096`, and the key comes from
Dashboard → API Keys.)

### Step 6 — Invite the house (phones, laptops, smart TVs)

Anyone on your Wi-Fi opens a browser to `http://YOUR-COMPUTER'S-IP:8181`.
Find your IP: **Windows** → `ipconfig` in that black window (look for
`IPv4 Address`); **Mac** → System Settings → Wi-Fi → Details. The startup
banner in the terminal also prints the network address. That's the whole
"website" — nothing to install on their end.

### 📱 The exe & phones — the questions everyone asks

**Can I run the exe and still visit from my phone?**
Yes. The exe serves the exact same store on your network — every device on
the **same Wi-Fi** opens `http://<your-PC's-IP>:8181` in any browser, just
like Step 6. Nothing to install on the phone.

**Does the exe have to stay running?**
Yes. Your PC **is** the store; the phones are visitors walking in. Close the
exe (or let the PC go to sleep) and the doors close — visitors just get
"can't connect" until you start it again. Nothing breaks, nothing re-setups.

**Does it work away from home / over mobile data?**
Not by itself — same network only, by design: your media stays yours and
never touches the internet. For away-from-home access you'd add a VPN such
as **Tailscale** (free tier) that links the phone to your home network.

Three smaller ones:
- **First run:** Windows Firewall will ask → **Allow** (Private networks),
  or phones can't get in.
- **Hosting for a while?** Set the PC to stay awake (Settings → System →
  Power → screen can sleep, PC shouldn't).
- Each visiting device keeps its own theme and preferences automatically
  (a guest profile per device) — no setup needed on their end.

## 🐳 Quick start (Docker)

```bash
cd home-binger
docker compose up -d
# open http://<your-machine>:8181
```

Everything (users, preferences, server config, cached posters) is stored in
`./data`, so upgrades are safe: replace the files, `docker compose up -d --build`,
and your data survives.

---

## 🛰️ Stocking the shelves

**No media server? Use the file grabber.** Admin → Server → **📁 Local files**:
add as many **media spots** as you like (`C:\Videos`, `D:\Music`, an external
drive…) and switch it on. Every spot grabs everything inside it — **and every
folder nested inside, recursively** — as individual files: movies by file,
music tracks grouped by their folder. Ebooks/PDFs are indexed in the catalogue
for the coming full-media library. Nothing leaves your computer and no media
server is involved.

**Uninstalling** is delete-the-folder: all settings, users and caches live in
the app's own `data/` folder — no registry, no Program Files (exe users can
also remove the empty `%APPDATA%\HomeBinger` crash-log folder, optional).

Open **☰ Menu → sign in as admin → Admin → Server**. Sources stack — mix and
match any of them:

| Source | What it gives you |
|---|---|
| **Plex** / **Jellyfin** | Your full library, paginated to the last page. Movies & TV on the shelves, music on the jukebox. Live TV/DVR channels appear as 📺 VHS channel-tapes (playback streams via HLS; Safari plays it natively, Chrome-based browsers may refuse the format — that's a browser limitation). |
| **🎞️ Internet Archive** | Public-domain classics, free and legal. |
| **📻 Radio-Browser** | Live radio stations on the jukebox. |
| **🎙️ Podcasts** | Any podcast by RSS feed. |

Hit **Test connection** (Plex/Jellyfin) — it explains failures in plain
language (wrong port, bad token, `/web` URLs are auto-fixed). Items without
artwork get attractive generated placeholder covers.

**Finding your Plex token:** open Plex Web, click any movie →
**⋯ → Get Info → View XML** — the URL contains `X-Plex-Token=…`; copy that
number. Inside Docker, point at your media server with
`http://host.docker.internal:32400` (Plex) or `:8096` (Jellyfin), or the LAN IP.

### What gets shelved
| Library type | On the shelf as |
|---|---|
| Movies | mix of chunky **VHS sleeves** and **DVD cases** (poster front, titled spine) |
| TV shows | every **episode its own entry** (grouped by series, DVD-style cases) |
| Music | every **track its own entry** (grabbed file-by-file from Plex/Jellyfin, grouped by album) — playable on the **jukebox** (store) and the **DJ's Library** (dance hall) |
| Music videos | DVD-style cases |
| Live TV / local video files | 📺 VHS-style tapes |

If a media server is unreachable, its shelves just wait — the store stays
open, and everything reconnects when it's back.

---

## 🧑‍🤝‍🧑 Users, guests & personal views

- **No login needed.** Every visitor gets an automatic device profile — theme and
  shelf arrangement persist on that browser forever.
- **Optional account** (☰ Menu → Profile): carry the same preferences to every
  device you sign in on. Guest settings migrate into the account on sign-up.
- **Admins** additionally manage the media sources, the store TV, user accounts,
  and store-wide policies (including *locking* theme/sorting for everyone).
- One user's theme/sorting **never** affects anyone else's view. Guests and
  users browse their own personal arrangement of the same shelves.

## 🎨 What you can personalize (☰ Menu)

- **Theme:** wall color, floor color, shelf color, accent/lighting color, shelf
  style (warm wood / brushed metal / midnight laminate), one-click presets —
  including the projector-screen look for the theater, if that's your thing.
- **Sorting:** Recently Added · By Library · Genre (with hanging aisle signs!) ·
  Alphabetical (letter-range signs) · Rating · Release Year · By Type.

## 📺 Screens & sound

- **Room sound** — the store + dance-hall speaker rings render through
  Google's open-source **Resonance Audio** Ambisonic soundfield (true HRTF
  binaural decode — see `docs/SURROUND.md`), with the theater on its own
  hand-tuned 8.2 array. Every room is gain-staged to the same reference:
  equal slider, equal loudness, bass managed to the subs, protection
  limiters as safety nets (`docs/AUDIO.md`).
- **The store TV** — select any case → **"📺 Play on the store TV"** and it
  plays right there in the world, with a bottom control bar (stop · ⏪10s ·
  play/pause · 10⏩s · repeat · volume). Albums get a spectrum visualizer.
  Admins can change the idle screen (Admin → Server): a pinned item, a
  looping video URL, or the white projector screen.
- **The theater** — bring a movie (or send it from any case's detail card)
  and it plays on the big screen with the same control bar. The sloped floor
  means every seat sees over the one in front.
- **The jukebox** (store) and **the DJ booth** (dance hall) — two separate
  devices, each running the same **DJ deck** (queue, crossfades,
  bass/mid/treble EQ, tempo, shuffle/repeat) on its **own audio channel**,
  so they can play two different tracks at the same time. The jukebox plays
  for the **movie store room only** (silent in the hallway, theater and wing);
  the booth stands **back by its library door with a walk-around apron**
  (theater-chair clearance behind and along both sides) and its set fills the
  dance hall and the DJ's Library — click the jukebox
  for its classic deck, or the booth's laptop for the **PRO RIG** — two
  independent decks (A cyan / B magenta) with real per-deck EQ, trim, tempo,
  key lock, hot cues, beat-snapped loops, beat jump, BPM + key detection with
  Camelot numbers, a curveable crossfader with center detent, master + booth
  monitor volume, searchable playlist, Beginner/Pro modes, keyboard shortcuts
  and session save/load. Or spin a vinyl from the DJ's Library to feed the
  booth channel. And the whole room answers the music:
  floor color, beam patterns, LED walls, even the DJ's
  Library sign ride the set. The moving heads **glide** between poses — an
  adaptive beat detector learns each track's own kick level (and its BPM),
  so the rig lands ON the beat instead of near it. **Ten surround speakers** carry it; the **booth
  subwoofers** aim the bass at the floor. When you walk out, the music stays
  behind — each channel is gated to its own rooms. Both rooms run **theater-
  style surround matrices**: stereo buses feed every cabinet by side (a real
  stereo image), sides and rears are Haas-delayed like a tuned room, and HRTF
  panning places each cabinet around your head in a headset. In the dance
  hall all **10 cabinets and the booth subwoofers aim at the floor center**;
  in the store the jukebox plays a **visible 7.1 set** — center above the TV,
  fronts/sides/rears on the walls, bass cabinet on the floor — every cabinet
  aimed at the room.
- **The sound engine (both rooms + the TV)** — professionally staged end to
  end: a rumble filter strips infrasonic junk, **bass management** crosses over
  at ~100 Hz (satellites play clean mids/highs, the subwoofers own the lows),
  **cinema voicing** adds dialogue presence and air (🎬 Cinema / Flat toggle on
  every DJ deck; the theater runs it always), EQ boosts get automatic makeup
  trim so they buy tone instead of clipping, and a console **limiter** sits as
  the last safety net. Volume changes **glide** — one smoothed gain stage per
  player, no zipper steps, no resets between tracks.

---

## ⚙️ Environment variables

All optional. They only **seed** first-run values — after that, manage settings
from the app (they live in `data/config.json`). The old `VB_*` spellings still
work if you have them set.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `8181` | Port to listen on (8080 is avoided — Steam uses it) |
| `HOST` | `0.0.0.0` | Bind address — `0.0.0.0` makes it reachable from other machines |
| `HB_ADMIN_USER` | `BabyBluJ` | First-run admin username |
| `HB_ADMIN_PASSWORD` | `BluJNetwork` | First-run admin password — change after login! |
| `HB_DATA_DIR` | `./data` | Where settings/users/caches are stored |
| `HB_SESSION_SECRET` | auto | Secret for session cookies (auto-generated & persisted) |
| `HB_SOURCE` | — | First-run media source: `plex` / `jellyfin` |
| `HB_PLEX_URL` / `HB_PLEX_TOKEN` | — | First-run Plex connection |
| `HB_JELLYFIN_URL` / `HB_JELLYFIN_API_KEY` | — | First-run Jellyfin connection |

## 🌍 Remote access (outside your home network)

The server binds `0.0.0.0`, so everyone on your LAN/VPN can already open
`http://<your-ip>:8181`. To reach it from anywhere on the internet, put a
reverse proxy with HTTPS in front of it — never expose the raw port directly,
since logins travel as plain HTTP otherwise.

**Caddy** (easiest — automatic HTTPS):
```
homebinger.example.com {
    reverse_proxy 127.0.0.1:8181
}
```

**nginx**:
```nginx
server {
    listen 443 ssl http2;
    server_name homebinger.example.com;
    ssl_certificate     /etc/letsencrypt/live/homebinger.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/homebinger.example.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8181;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        # video streaming needs these:
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

No WebSocket traffic is used, so no special upgrade headers are needed.
Quick-and-dirty alternative: an encrypted tunnel like Tailscale/WireGuard and
just browse `http://<tailscale-ip>:8181`.

## 🗂️ Project tour (what every folder/file is for)

```
home-binger/
├── server/                    the backend (plain Node, zero npm deps)
│   ├── server.js              entry point — HTTP server + static files
│   ├── lib/store.js           data/config.json + data/db.json persistence
│   ├── lib/auth.js            users, passwords (scrypt), sessions, guest profiles
│   ├── lib/library.js         one catalogue API over every source
│   ├── lib/proxy.js           poster & video proxying (tokens stay server-side)
│   └── lib/adapters/          plex.js · jellyfin.js · local.js (file grabber) ·
│                              archive.js · radio.js · podcasts.js
├── public/                    the frontend (Three.js, no build step)
│   ├── index.html             page shell + UI overlays
│   ├── css/style.css          all UI styling
│   ├── js/main.js             boot sequence + the DJ queue
│   ├── js/ui.js               settings panels, modals, sidebar
│   ├── js/api.js / state.js   backend client + app state
│   ├── js/store3d/config.js   ⭐ EVERY building dimension & tuning knob
│   └── js/store3d/…           room · theater · dance hall · shelves · sorting ·
│                              TV · jukebox audio · controls · exterior
├── desktop/main.cjs           the Electron shell — HomeBinger.exe's window
├── tools/build-desktop.mjs    builds the Windows exe folder from source
├── tools/stamp.mjs            cache-buster (npm run stamp)
├── START-HERE.txt             plain-language startup + store guide
├── START-WITH-NODE.bat        double-click launcher when you have Node
├── data/                      created at runtime — settings, users, caches
├── docs/EDITING.md            guide to customizing the store
├── docs/AUDIO.md             how audio plays in every room (chains + numbers)
├── docs/SURROUND.md          the surround-engine research + verdict
├── docs/CREDITS.md           every third-party component + its license
├── docs/RELEASE.md           publishing: GitHub + Steam checklists
├── ROADMAP.md                where the project is + what's next
├── tests/v35.cjs              the self-check suite (73 checks, headless)
├── Dockerfile / docker-compose.yml
└── README.md                  this file
```

Want to reshape the building (bigger room, more islands, chunkier cases)?
Open **`public/js/store3d/config.js`** — every number is labeled and reloads
with the page. See `docs/EDITING.md` for a guided tour.

## 🔒 Security notes

- Plex/Jellyfin **tokens never reach the browser** — the backend proxies every
  poster and video request and caches posters on disk.
- Passwords are hashed with scrypt; sessions are HttpOnly cookies.
- Still: this is a hobby app exposing your media catalogue. Keep it behind
  HTTPS, change the admin password, and don't port-forward the raw port.

## ⚖️ License & credits

**Home Binger is free for personal, non-commercial use** — full terms in
[LICENSE](LICENSE) (Creative Commons BY-NC-SA 4.0):

- ✅ run it at home for family & friends, change anything you like, share copies
- ❌ no selling it, selling access to it, or building a paid service on it
- 🔁 share your remixes, transforms, and builds under the **same license**
  (CC BY-NC-SA 4.0 or compatible) — no adding extra restrictions
- 📛 keep the BluJ Productions / Home Binger credit if you share it

**Bundled open-source components** (full inventory with licenses in
[`docs/CREDITS.md`](docs/CREDITS.md)):

- [three.js](https://threejs.org) — 3D rendering (MIT)
- [Resonance Audio](https://resonance-audio.github.io) (Google) — Ambisonic
  room rendering (Apache-2.0)
- [Electron](https://www.electronjs.org) — the Windows desktop build (MIT)
- [Node.js](https://nodejs.org) — the server runtime (MIT)

Like this and other projects? The door in the store copies the support link. 💛

---

## 🩺 Troubleshooting

| Problem | Fix |
|---|---|
| `'node' is not recognized` | Node isn't installed (or the terminal was open before installing) — install LTS from nodejs.org, then close and reopen the terminal |
| `Can't reach the server` on load | The backend isn't running — `node server/server.js` |
| Shelves show placeholders forever | Media server unreachable from *this* machine; check URL/token in Admin → Server, use LAN IP or `host.docker.internal` in Docker |
| Posters missing for some items | Those items have no artwork in Plex/Jellyfin — placeholders are intentional |
| TV stays on its idle screen | URL/item mode needs a video the browser can play (mp4/webm, H.264); try a different file |
| Pointer lock doesn't engage | Click the store once; in embedded previews the app auto-falls back to click-drag looking |
| Port already in use | Something else uses the port — run `PORT=9090 node server/server.js` (Windows: `set PORT=9090` first, then the command) |
| Browser shows "Inspectable WebContents" / Steam pages at `localhost:8181`?? | That's **Steam's** debugger on port 8080 — the store defaults to 8181 exactly to avoid it. Double-check you're visiting `http://localhost:8181` (not 8080) |
| Other devices can't open the store | Windows Firewall prompt on first run must be **Allow**, and use the computer's IP (`ipconfig`), not `localhost` |
| HomeBinger.exe won't open | SmartScreen may show "Windows protected your PC" on first run → *More info → Run anyway* (the exe is unsigned). Antivirus quarantine is the other usual suspect |
| Exe started but which port? | It takes 8181, or the next free one if something's already there — other devices should try `http://<pc-ip>:8181` first |

Enjoy the store. **Be kind, rewind.** ⏪
