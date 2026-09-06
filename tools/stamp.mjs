// ─────────────────────────────────────────────────────────────────────────────
//  tools/stamp.mjs — cache-buster: version-stamps every module URL
//  ───────────────────────────────────────────────────────────────────────────
//  Appends ?v=<stamp> to every ES-module import in public/js and to the
//  <script> tag in index.html. New URLs = guaranteed cache miss, so every
//  visitor loads fresh code after `npm run stamp` + a server restart.
//
//  Run it after editing frontend files if a browser ever shows stale code:
//      npm run stamp
//      (then restart the server)
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'public');
const stamp = String(Date.now());

const jsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.js')) jsFiles.push(p);
  }
})(path.join(root, 'js'));

let changed = 0;
for (const file of jsFiles) {
  let src = fs.readFileSync(file, 'utf8');
  const before = src;
  src = src.replace(/\?v=\d+/g, '');   // clear any previous stamp
  src = src.replace(/(from\s+')(\/?[^'?]+\.js)(')/g, (m, a, p, z) =>
    p.startsWith('/vendor/') ? m : `${a}${p}?v=${stamp}${z}`);
  src = src.replace(/(import\(\s*')(\/?[^'?]+\.js)(')/g, (m, a, p, z) =>
    p.startsWith('/vendor/') ? m : `${a}${p}?v=${stamp}${z}`);
  if (src !== before) { fs.writeFileSync(file, src); changed++; }
}

const idx = path.join(root, 'index.html');
let html = fs.readFileSync(idx, 'utf8');
html = html.replace(/\?v=\d+/g, '');
html = html.replace(/(src=")(\/js\/[^"]+\.js)(")/g, `$1$2?v=${stamp}$3`);
fs.writeFileSync(idx, html);

console.log(`stamped ${changed} module files + index.html with ?v=${stamp}`);
