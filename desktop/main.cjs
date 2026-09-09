// ─────────────────────────────────────────────────────────────────────────────
//  desktop/main.cjs — HOME BINGER as a NATIVE Windows app (Electron)
// ─────────────────────────────────────────────────────────────────────────────
//  This is the whole desktop app: it starts the exact same zero-dependency
//  Node server (bundled INSIDE this exe — users never install Node), then
//  opens it in a clean app window: no browser chrome, no address bar, no tab.
//  The server still binds 0.0.0.0, so phones and other devices on the same
//  network keep working exactly like before (browser mode is untouched).
//
//  Users who already have Node installed are never touched: this app is
//  self-contained and never installs or modifies anything on the system.
// ─────────────────────────────────────────────────────────────────────────────
const { app, BrowserWindow, Menu, shell } = require('electron');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

// t96: external links (e.g. the version notice's "Get it") open in the user's
// own browser — the app window never navigates away from the store.
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

// t90: STORE DATA LIVES IN %APPDATA%\HomeBinger — NOT inside the app folder.
// Why: updating used to mean "delete the old folder, unzip the new one" —
// which deleted every account, login and setting with it. Now the app
// folder holds only the program; user data survives every update. First
// run MIGRATES the old in-folder data/ automatically (logins keep working).
// t93: PORTABLE DOCTRINE — everything the app stores lives INSIDE its own
// folder. Deleting the folder is a COMPLETE uninstall: accounts, logins,
// settings, even the app's caches — nothing is left behind anywhere else.
// Updates never delete anything: unzip the new version (next to the old
// folder is fine) and open the NEW exe — first launch ADOPTS the old data
// automatically and renames the old folder "(old — you can delete this)".
(function placeDataDir() {
  try {
    const exeDir = path.dirname(app.getPath('exe') || '');
    const roaming = app.getPath('userData');             // %APPDATA%\HomeBinger (the t90–t92 data home)
    const localData = path.join(exeDir, 'data');
    const localProfile = path.join(exeDir, 'profile');   // Electron's own caches live here too → folder-delete wipes ALL traces

    // Can we write next to the exe? (Program Files would say no.)
    let portable = false;
    try {
      fs.mkdirSync(localProfile, { recursive: true });
      const probe = path.join(localProfile, '.write-test');
      fs.writeFileSync(probe, 'ok'); fs.unlinkSync(probe);
      portable = true;
    } catch { portable = false; }

    if (portable) {
      app.setPath('userData', localProfile);             // must run before app ready
      try { app.setPath('crashDumps', path.join(localProfile, 'crashes')); } catch { /* best effort */ }
      fs.mkdirSync(localData, { recursive: true });
      if (!fs.existsSync(path.join(localData, 'db.json'))) {
        // t94 HARDENING (owner lost a profile + Plex connection on a real
        // update — data-loss class bug): the update path now considers ALL
        // data sources at once — sibling version folders AND the 1.6.x
        // %APPDATA% location — and adopts the NEWEST, wherever it lives.
        // (Before, ANY stale sibling folder shadowed fresher %APPDATA%
        // data: the app booted on old data and the profile "vanished".)
        // And sources are only cleaned up after the copy is VERIFIED.
        const parent = path.dirname(exeDir);
        const cands = [];
        try {
          for (const d of fs.readdirSync(parent, { withFileTypes: true })) {
            if (!d.isDirectory() || !/^Home ?Binger/i.test(d.name)) continue;
            const dir = path.join(parent, d.name);
            if (dir === exeDir) continue;
            const db = path.join(dir, 'data', 'db.json');
            if (fs.existsSync(db)) cands.push({ kind: 'sibling', dir, db, mtime: fs.statSync(db).mtimeMs });
          }
        } catch { /* best effort */ }
        const roamDb = path.join(roaming, 'data', 'db.json');
        if (fs.existsSync(roamDb)) cands.push({ kind: 'roaming', dir: roaming, db: roamDb, mtime: fs.statSync(roamDb).mtimeMs });
        cands.sort((a, b) => b.mtime - a.mtime);          // NEWEST data wins, wherever it lives
        const src = cands[0];
        if (src) {
          fs.cpSync(path.join(src.dir, 'data'), localData, { recursive: true });
          // FAIL-SAFE: the copy must parse and carry EVERY account the
          // source had before the source is renamed/removed.
          let verified = false;
          try {
            const a = JSON.parse(fs.readFileSync(src.db, 'utf8'));
            const b = JSON.parse(fs.readFileSync(path.join(localData, 'db.json'), 'utf8'));
            verified = Array.isArray(b.users) && b.users.length >= Math.max(1, Array.isArray(a.users) ? a.users.length : 1);
          } catch { /* best effort */ }
          if (src.kind === 'sibling') {
            if (verified) {
              try {
                const newName = src.dir + ' (old — you can delete this)';
                if (!fs.existsSync(newName)) fs.renameSync(src.dir, newName);
              } catch { /* best effort */ }
              console.log('[data] adopted your data from the previous version folder');
            } else {
              console.warn('[data] adoption copy could not be verified — source folder left untouched');
            }
          } else if (verified) {
            // roaming: delete only after the verified copy — data safety
            // beats tidiness (owner: testers must never lose %APPDATA% data)
            try { fs.rmSync(roaming, { recursive: true, force: true }); } catch { /* best effort */ }
            console.log('[data] moved your data out of %APPDATA% and into the app folder (portable again)');
          } else {
            console.warn('[data] %APPDATA% copy could not be verified — %APPDATA% left in place, untouched');
          }
        }
      }
      process.env.HB_DATA_DIR = localData;               // the server reads this on boot
      // Electron's crashpad may still create the DEFAULT %APPDATA% dir even
      // with userData repointed — it never holds data on the portable path.
      // Sweep it (now and at quit) so delete-the-folder leaves NOTHING
      // behind anywhere. (If it somehow holds a db.json, we never touch it —
      // data safety beats tidiness.)
      const sweepRoaming = () => {
        try { if (!fs.existsSync(path.join(roaming, 'data', 'db.json'))) fs.rmSync(roaming, { recursive: true, force: true }); } catch { /* best effort */ }
      };
      sweepRoaming();
      app.on('will-quit', sweepRoaming);
      return;
    }

    // Read-only install folder (e.g. someone unzipped into Program Files):
    // fall back to %APPDATA% so the app still runs — the docs tell users to
    // keep the app in a normal folder (Desktop/Downloads) where it's portable.
    const dataDir = path.join(roaming, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    process.env.HB_DATA_DIR = dataDir;
  } catch (e) {
    console.warn('[data] falling back to in-folder data/:', e.message);
  }
})();

// One Home Binger at a time — a second launch just focuses the first window.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }
app.on('second-instance', () => {
  for (const win of BrowserWindow.getAllWindows()) { if (win.isMinimized()) win.restore(); win.focus(); }
});

// Pick the first free port from 8181 up, so the app NEVER fights a copy of the
// server the user is already running (e.g. started with Node from the source).
function tryPort(port, triesLeft) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => { s.close(); resolve(triesLeft > 0 ? tryPort(port + 1, triesLeft - 1) : port); });
    s.once('listening', () => s.close(() => resolve(port)));
    s.listen(port, '0.0.0.0');
  });
}

// Wait until the server answers / (it boots in well under a second).
function waitUp(port, ms) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    (function ping() {
      http.get({ host: '127.0.0.1', port, path: '/', timeout: 1200 }, (r) => { r.resume(); resolve(); })
        .on('error', () => Date.now() - started > ms ? reject(new Error('server did not start')) : setTimeout(ping, 150));
    })();
  });
}

(async () => {
  const PORT = await tryPort(8181, 11);
  process.env.PORT = String(PORT);
  // t79: the server is an ES module (import syntax). require() of ESM needs
  // Node >= 20.19 — Electron 33 ships 20.18, so require() threw ERR_REQUIRE_ESM
  // and the exe died silently on launch (no window, nothing in Task Manager).
  // Dynamic import() loads ESM on every Node/Electron ever shipped.
  const { pathToFileURL } = require('node:url');
  await import(pathToFileURL(path.join(__dirname, '..', 'server', 'server.js')));   // the same server, in-process
  await waitUp(PORT, 20000);
  await app.whenReady();
  Menu.setApplicationMenu(null);                                 // no menu bar — it's an app, not a browser
  const win = new BrowserWindow({
    width: 1280, height: 800,
    backgroundColor: '#0b0e1a',
    title: 'Home Binger',
    autoHideMenuBar: true,
    show: false
  });
  win.once('ready-to-show', () => win.show());
  await win.loadURL(`http://127.0.0.1:${PORT}/`);
})().catch((e) => { console.error('Home Binger failed to start:', e.message); app.quit(); });

app.on('window-all-closed', () => app.quit());
