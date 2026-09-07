# 🚀 Publishing Home Binger — GitHub + Steam

*Everything needed to ship this project public, prepared 2026-09-06 (t78).
You (BluJ Productions) are the rights holder: the CC BY-NC-SA license binds
everyone else, not you. You may sell it, ship it on Steam, and publish the
code — all at once.*

---

## Part 1 — GitHub (the source)

### What's already done for you
- ✅ `LICENSE` — CC BY-NC-SA 4.0 full text
- ✅ `README.md` — features, quick start, docs index, credits
- ✅ `docs/CREDITS.md` — complete third-party inventory (GitHub's reviewers
  and licensing-minded users look for exactly this)
- ✅ `.gitignore` — keeps **out** of the repo: `data/` (user runtime data),
  `tests/media/` (your music + Sintel — rights), `node_modules/`, builds
- ✅ No npm dependencies at all → no dependency-license surface

### Steps (10 minutes)
1. Install git (or use GitHub Desktop).
2. In the project folder:
   ```
   git init
   git add -A
   git commit -m "Home Binger 1.0 beta — the full building"
   ```
3. Create the repo on github.com (BluJ Productions account). **Recommend:
   start Private**, push, look around, flip to Public when ready:
   ```
   git remote add origin https://github.com/BabyBluJ-wall/Home-Binger.git   # ← our live repo
   git branch -M main
   git push -u origin main
   ```
4. Repo settings worth doing:
   - Description + topics: `webaudio`, `three-js`, `electron`, `media-server`,
     `plex`, `virtual-store`, `self-hosted`
   - **Releases** → create `v1.0-beta` → attach `HomeBinger-Windows.zip`.
     GitHub Releases allow 2 GB per file — this replaces expiring file-share
     links forever. Testers download from your Releases page.
   - Issues ON (that's your tester bug-tracker; I can triage from your summaries)
   - Later, optional: a one-line CI that runs `node --check` on the server files

### Double-check before going Public
- `git status` clean, then: `tests/media/` absent from the commit
  (`git ls-files | grep tests/media` must print NOTHING)
- No tokens/passwords in the history (there are none in the tree — the
  defaults live in runtime `data/`, which is ignored)

---

## Part 2 — itch.io (the free home — $0, forever)

**The plan that fits today: GitHub for the source, itch.io for the download.**
itch.io is the indie standard: publishing is free, hosting is free, free
downloads cost you nothing ever, and the pages look great. (Steam charges
$100 per app even for free games — parked in the appendix until the project
ever earns it.)

### Steps (15 minutes)
1. Create an account at **itch.io** (BluJ Productions name).
2. Dashboard → **Upload new project**.
3. **Kind of project: Downloadable** — important: Home Binger is a real app
   (its own server inside), so it ships as the zip download, *not* as an
   embedded browser page.
4. Upload **HomeBinger-Windows.zip** (115 MB — itch's default per-file limit
   is 1 GB; headroom for future builds).
5. **Pricing: $0** — free for everyone, no fee to you, ever.
6. Page art (make these once, reuse everywhere):
   - Cover: **630 × 500** (required-ish — this is your thumbnail everywhere on itch)
   - Screenshots: 5+, 1920 × 1080 (theater mid-movie, dance hall mid-set,
     DJ booth Pro rig, the store floor, settings)
   - Optional: animated GIF of the floor pulsing — itch pages love these
7. Description: borrow the README's opening (what it is, what it needs:
   Windows, no install, your own media). Link the GitHub repo.
8. Publish. Share the itch URL anywhere — it never expires, unlike
   file-share links.

### Later, still free
- **"Name your price" with $0 minimum**: supporters can pay what they want
  (you choose itch's cut — the slider goes to 0%). Still free for everyone.
- **Your DLC music packs** (Roadmap Phase 4) can live on the same page or a
  separate paid one — that's the revenue path that could someday fund the
  Steam fee, if you still want Steam then.
- Downloads analytics are built in — you'll see how many testers actually
  pulled it.

### Other free options (optional extras)
- **Game Jolt** — also free to publish + host; a second shelf never hurts.
- **Microsoft Store** — NOT free (~$19 one-time even for individuals); skip.

---

## Appendix — Steam (only if the project ever earns $100)

An Electron app ships on Steam fine, and the fee is *recoupable after $1,000
in revenue*. If DLC packs someday cover it:

#### One-time setup (only you can do this)
1. **Steamworks partner account** — partner.steamgames.com → Steam Direct.
2. **$100 per-app fee** (recoupable after $1,000 revenue), plus the standard
   paperwork: identity, banking, tax (W-9/W-8).
3. Create an App → you get an AppID.

#### Store page assets (make these before submission)
| Asset | Size |
|---|---|
| Header capsule | 460 × 215 |
| Small capsule | 231 × 87 |
| Main capsule | 616 × 353 |
| Vertical capsule | 374 × 448 |
| Library capsule | 600 × 900 |
| Screenshots | at least 5, 1920 × 1080 (the building photographs well) |
| Trailer | recommended, 60–90 s (a walk: store → theater → dance hall) |

Screenshots: run the app, theater with a public-domain film on screen, dance
hall mid-set with the light rig going, the DJ booth Pro rig, settings panels.

#### Build & upload
- The `HomeBinger-win32-x64/` folder **is** the depot content — no changes
  needed. Launch executable: `HomeBinger.exe`.
- Upload via **steamcmd** (Steamworks docs: "Uploading a build"), or partner
  site → Your App → SteamPipe. No Steamworks SDK integration is required
  just to launch; achievements/DRM/overlay hooks are optional later.
- Store pages: you fill a content questionnaire. Truthful answers are easy:
  **no bundled media, no user data collected, nothing online required** —
  the app is a local tool that browses the user's own library.
- Privacy policy URL needed: host a one-pager ("Home Binger runs entirely on
  your machine; we collect nothing") — that is literally true.

#### Copyright-holder note (decided 2026-09-06)

Public notices (LICENSE, README, CREDITS) use the brand **"BluJ Productions"**
— valid pseudonymous copyright, keeps the owner's legal name out of public
repos. Real identity goes ONLY into platform tax/payout forms (itch / Steam
dashboards, private by nature). When the LLC forms: assign the copyright to
it with a one-page document; nothing done now blocks that.

#### Steam + your license (important, in your favor)
- You sell the **app**. The code stays CC BY-NC-SA: anyone can read/fork the
  GitHub source; the NC term means nobody else may sell it. State one line
  on the store page: *"Open source (CC BY-NC-SA); this build is published by
  its author, BluJ Productions."*
- Your **DLC music packs** (Roadmap Phase 4) remain yours to sell — the app
  already shelves any folder a buyer drops in.

#### QA before submission
- Fresh Windows machine test: extract, `HomeBinger.exe`, plays within a
  minute, no install, firewall prompt only for LAN sharing.
- Check the suite one last time: `NODE_PATH=… node tests/v35.cjs` → 73/73.
- Ship version 1.0.0 (package.json already says it).

---

## The short version

1. **GitHub now** (free — source + exe on the Release page) — replaces every
   expiring download link.
2. **itch.io now** (free — the polished public download page testers share).
3. **Steam later, maybe** — only if the project ever earns the $100; the
   build you already have is depot-ready the day you want it.
4. Everything licensing-related is already in `LICENSE` + `docs/CREDITS.md`.
