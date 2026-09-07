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
const { app, BrowserWindow, Menu } = require('electron');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');

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
