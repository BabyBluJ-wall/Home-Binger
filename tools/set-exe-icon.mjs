// ─────────────────────────────────────────────────────────────────────────────
//  set-exe-icon.mjs — brand HomeBinger.exe with the HB logo (pure JS, no Wine)
// ─────────────────────────────────────────────────────────────────────────────
//  Electron's packager skips exe icons on non-Windows machines because the
//  standard tool (rcedit) needs Wine. ResEdit is a pure-JavaScript PE resource
//  editor, so we can embed the icon from any OS. If resedit isn't reachable
//  (it's a BUILD tool, kept out of the app's zero-dependency tree), this
//  exits cleanly — builds still succeed, just unbranded.
//
//  Usage:  NODE_PATH=~/.cache/tools/node_modules node tools/set-exe-icon.mjs \
//            <path-to-HomeBinger.exe> [path-to-icon.ico]
//  Icon default: tools/assets/icon.ico (the HB favicon, rendered to 16..256).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

async function loadResEdit() {
  // resedit 3.x is ESM-first (dist/index.js); dynamic import covers both a
  // normal install and this repo's build-tool cache location
  const cands = [
    'resedit',
    path.join(process.env.HOME || '', '.cache', 'tools', 'node_modules', 'resedit', 'dist', 'index.js'),
  ];
  for (const c of cands) { try { return await import(c.startsWith('/') ? pathToFileURL(c).href : c); } catch {} }
  return null;
}

export async function setExeIcon(exePath, icoPath) {
  const ResEdit = await loadResEdit();
  if (!ResEdit) { console.log('icon: SKIP (resedit not reachable — build continues unbranded)'); return false; }
  const ico = icoPath || path.join(here, 'assets', 'icon.ico');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
  const res = ResEdit.NtExecutableResource.from(exe);
  const icons = ResEdit.Data.IconFile.from(fs.readFileSync(ico));
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 0, icons.icons.map(i => i.data));
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log('icon: EMBEDDED', path.basename(exePath), '←', path.basename(ico), `(${icons.icons.length} sizes)`);
  return true;
}

// CLI
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) { console.error('usage: node tools/set-exe-icon.mjs <exe> [ico]'); process.exit(1); }
  await setExeIcon(target, process.argv[3]);
}
