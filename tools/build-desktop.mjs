// ─────────────────────────────────────────────────────────────────────────────
//  build-desktop.mjs — assembles the WINDOWS desktop app (Electron)
// ─────────────────────────────────────────────────────────────────────────────
//  Stages the app (server + public + desktop shell, zero npm deps) and runs
//  electron-packager for win32 x64. Output: <out>/HomeBinger-win32-x64/ with
//  HomeBinger.exe — users need NOTHING installed (Node rides inside the exe).
//
//  Usage: node tools/build-desktop.mjs [stageDir] [outDir]
//  Needs electron-packager reachable (dev install or NODE_PATH).
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGE = path.resolve(process.argv[2] || '/tmp/hb-stage');
const OUT = path.resolve(process.argv[3] || '/tmp/hb-out');
for (const d of [STAGE, OUT]) fs.rmSync(d, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

for (const dir of ['server', 'public', 'desktop', 'tools'])
  fs.cpSync(path.join(ROOT, dir), path.join(STAGE, dir), { recursive: true, filter: (f) => !f.includes(`${path.sep}node_modules`) });
for (const f of ['README.md', 'LICENSE', 'CHANGELOG.md', 'START-HERE.txt', 'START-WITH-NODE.bat'])
  fs.cpSync(path.join(ROOT, f), path.join(STAGE, f));
// t93: the README's preview screenshots (docs/*.png) ride in the exe too —
// without them the image links in the bundled README are dead.
fs.mkdirSync(path.join(STAGE, 'docs'), { recursive: true });
for (const img of ['og-home-binger.png', 'store-entrance.png', 'theater.png', 'dance-hall.png'])
  fs.cpSync(path.join(ROOT, 'docs', img), path.join(STAGE, 'docs', img));
// t96: the remote-access guide + the license credits ride in the folder
// t97: the friend-sharing how-to too (ships in 1.8.1)
for (const doc of ['REMOTE-ACCESS.md', 'CREDITS.md', 'FRIEND-SHARING.md'])
  fs.cpSync(path.join(ROOT, 'docs', doc), path.join(STAGE, 'docs', doc));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
pkg.main = 'desktop/main.cjs';            // ← the Electron entry (exe opens this)
delete pkg.scripts; delete pkg.engines;
// no wine on the build machine: skip exe-resource edits entirely (no version/
// copyright/icon stamping) — the exe still gets its name from the app folder.
fs.writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify(pkg, null, 2));

// ── package: Wine-free assembly from the official Electron win32 zip ──
// (electron-packager needs Wine on non-Windows build machines just to stamp
//  cosmetic exe metadata; hand-assembly produces the same app without it.)
const EV = '33.2.1';
const zip = fs.readdirSync(path.join(process.env.HOME || '/', '.cache', 'electron'), { withFileTypes: true })
  .flatMap(d => fs.existsSync(path.join(process.env.HOME || '/', '.cache', 'electron', d.name))
    ? fs.readdirSync(path.join(process.env.HOME || '/', '.cache', 'electron', d.name)).map(f => path.join(process.env.HOME || '/', '.cache', 'electron', d.name, f))
    : [])
  .find(f => f.endsWith(`electron-v${EV}-win32-x64.zip`));
if (!zip) throw new Error('Electron win32 zip not cached — run electron-packager once (or set ELECTRON_MIRROR) to populate ~/.cache/electron');
const DEST = path.join(OUT, 'HomeBinger-win32-x64');
fs.mkdirSync(DEST, { recursive: true });
execFileSync('unzip', ['-q', '-o', zip, '-d', DEST], { stdio: 'inherit' });
fs.renameSync(path.join(DEST, 'electron.exe'), path.join(DEST, 'HomeBinger.exe'));
// t80: brand the exe with the HB logo (pure-JS resource edit — no Wine needed)
try { const { setExeIcon } = await import('./set-exe-icon.mjs'); await setExeIcon(path.join(DEST, 'HomeBinger.exe')); }
catch (e) { console.log('icon: skipped (' + e.message + ')'); }
fs.rmSync(path.join(DEST, 'resources', 'default_app.asar'), { force: true });
fs.cpSync(STAGE, path.join(DEST, 'resources', 'app'), { recursive: true });

// t90: FINDABILITY — the folder used to be a wall of ~60 identical-looking
// files. Two fixes: (1) drop every Electron locale pack except en-US
// (Chromium falls back to en-US automatically — the app is English-only),
// (2) a pointer file that sorts to the TOP of the folder and says what to do.
try {
  const locDir = path.join(DEST, 'locales');
  for (const f of fs.readdirSync(locDir)) {
    if (f !== 'en-US.pak') fs.rmSync(path.join(locDir, f), { force: true });
  }
  console.log('locales: pruned to en-US');
} catch { /* no locales dir? fine */ }
fs.writeFileSync(path.join(DEST, '1 - START HERE (double-click HomeBinger.exe).txt'),
`■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■
  DOUBLE-CLICK  HomeBinger.exe  ← that's the app
■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■

That's the only file you ever need to open. Everything else in this
folder is the app's machinery — leave it be.

Your account, users and settings live in this folder — so UPDATING means:
unzip the new version ANYWHERE NEARBY (the same folder as this one is
perfect; Desktop and Downloads both work) and open the new HomeBinger.exe
— it finds your old data on its own (even inside the new version's own
unzipped folder layout) and marks the old folder "(old — you can
delete this)"). And deleting this folder removes EVERYTHING the app
ever stored — a complete uninstall in one step.

Phones on the same Wi-Fi: open http://<this-pc-ip>:8181
Want to reach your store from ANYWHERE (or share it with far-away
friends)? Run tailscale-setup.exe in this folder (optional, free), then
open REMOTE-ACCESS.md (also in this folder) for the short how-to.
Made a friend? FRIEND-SHARING.md (also in this folder) is the
two-minute how-to for sharing shelves between two Home Bingers.
No tech skills needed, nothing is ever opened to the public internet.

Full guide: START-HERE.txt in this folder.
`);

// remote access: the official Tailscale web installer (tiny) rides the
// folder — optional, user-run, never loaded or executed by Home Binger.
// the guide + credits also sit at the TOP of the folder (findable)
for (const doc of ['REMOTE-ACCESS.md', 'CREDITS.md', 'FRIEND-SHARING.md'])
  fs.copyFileSync(path.join(STAGE, 'docs', doc), path.join(DEST, doc));
const TS_SRC = process.env.TS_SETUP || '';
if (TS_SRC && fs.existsSync(TS_SRC)) {
  fs.cpSync(TS_SRC, path.join(DEST, 'tailscale-setup.exe'));
  console.log('tailscale: bundled official installer (' + fs.statSync(path.join(DEST, 'tailscale-setup.exe')).size + ' bytes)');
} else {
  console.log('tailscale: not bundled (set TS_SETUP=<path> to include)');
}

console.log('DONE →', DEST);
