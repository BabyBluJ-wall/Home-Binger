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
console.log('DONE →', DEST);
