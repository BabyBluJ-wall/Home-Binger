// screenshot-session — the README photo studio: every room + every panel + the
// 1.10.0 feature shots. Stages REAL live TV (iptv-org news+movies) + a real
// archive movie for the Guide/fullscreen shots, then restores live TV OFF.
// Output: /home/user/readme-shots/ (1280x720). Run:
//   CHROME_EXE=<chrome> NODE_PATH=/home/user/node_modules node tests/screenshot-session.cjs
// (fresh profile = first-visit states; panels open via JS clicks because an
//  open panel hides the sidebar; screenshots retry — swiftshader needs patience)
// README photo session — every room, every panel, the 1.10.0 features.
// Real clicks/keys; live iptv-org channels + a real archive movie for the
// money shots. Saves to /home/user/readme-shots/ (1400×700, like the docs set).
const { chromium } = require('playwright-core');
const EXE = process.env.CHROME_EXE;
const BASE = 'http://127.0.0.1:8181';
const OUT = '/home/user/readme-shots';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  // ── stage: REAL live TV (news + movies) so the Guide shots are the product ──
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'BabyBluJ', password: 'BluJNetwork' }) });
  const login = await lr.json();
  const authH = { 'content-type': 'application/json', Authorization: 'Bearer ' + login.token, cookie: lr.headers.get('set-cookie')?.split(';')[0] };
  const put = (body) => fetch(BASE + '/api/admin/config', { method: 'PUT', headers: authH, body: JSON.stringify(body) });
  await put({ iptv: { url: '', sections: ['news', 'movies'] } });   // '' = the real iptv-org API
  await fetch(BASE + '/api/library?refresh=1&vb_auth=' + login.token);

  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const log = [];
  const shot = async (name) => {
    await page.waitForTimeout(1400);   // let the frame settle
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      try { await page.screenshot({ path: `${OUT}/${name}.png`, timeout: 60000 }); ok = true; }
      catch { await page.waitForTimeout(2500); }   // swiftshader churn — let it breathe, retry
    }
    if (!ok) throw new Error('screenshot failed: ' + name);
    const sz = require('fs').statSync(`${OUT}/${name}.png`).size;
    log.push({ name, kb: Math.round(sz / 1024) });
    console.log(`📷 ${name}.png  ${Math.round(sz / 1024)} KB`);
  };
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-enter:not(.hidden)', { timeout: 90000 });
  await shot('room-01-entry-screen');

  await page.click('#btn-enter', { force: true });
  await page.waitForFunction(() => { const g = window.__VB?.scene?.threeScene?.getObjectByName('shelves'); return !!g && g.children.some(c => c.isInstancedMesh && c.count > 30); }, { timeout: 60000 });
  await page.waitForTimeout(4000);                  // artwork + first frames settle
  await shot('panel-01-help-first-visit');           // the help greets first-timers
  await page.click('#btn-help-close');
  await page.waitForTimeout(600);
  await shot('room-02-store-first-view');            // the authentic first look

  // aim helper: camera looks along (−sin yaw, ·, −cos yaw); pitch up = +
  const room = async (name, px, pz, tx, ty, tz) => {
    await page.evaluate(([px, pz, tx, ty, tz]) => {
      const yaw = Math.atan2(px - tx, pz - tz);
      const d = Math.hypot(tx - px, tz - pz);
      const pitch = Math.atan2(ty - 1.6, d);
      window.__VB.scene.debugTeleport(px, pz, yaw, pitch);
    }, [px, pz, tx, ty, tz]);
    await shot(name);
  };
  const geom = await page.evaluate(() => {
    const s = window.__VB.scene;
    const j = s.threeScene.getObjectByName('jukebox');
    const jp = j ? { x: j.matrixWorld.elements[12], y: j.matrixWorld.elements[13], z: j.matrixWorld.elements[14] } : null;
    const di = s.danceInfo();
    return { juke: jp ? { x: +jp.x.toFixed(2), y: +jp.y.toFixed(2), z: +jp.z.toFixed(2) } : null,
      boothX: di.boothX, boothZ: di.boothZ };
  });
  console.log('geom:', JSON.stringify(geom));

  await room('room-03-store-floor', 0, 2.0, 0, 1.3, -5.6);                 // shelves + checkout + TV end
  await room('room-04-hall-street-doors', 0, 2.2, 0, 1.8, 7.6);           // the entrance end
  if (geom.juke) await room('room-05-jukebox-corner', geom.juke.x * 0.5, geom.juke.z * 0.5, geom.juke.x, 1.5, geom.juke.z);
  await room('room-06-dance-hall', geom.boothX, 4.5, geom.boothX, 1.2, geom.boothZ);  // down the wing → the booth
  await room('room-07-dj-booth', geom.boothX, geom.boothZ + 3.4, geom.boothX, 1.15, geom.boothZ);
  await room('room-08-theater-standby', 0, -8.3, 0, 2.0, -16.7);          // seats + the standby card

  // ── a real movie on the big screen (public-domain classic) ──
  const movieOk = await page.evaluate(async () => {
    const s = window.__VB.scene, st = window.__VB.state;
    const movie = (st.items || []).find(i => /Night of the Living Dead/i.test(i.title || ''));
    if (!movie) return false;
    s.tv.playItem(movie);
    for (let t = 0; t < 60; t++) {
      await new Promise(r => setTimeout(r, 500));
      const el = s.tv.mediaEl();
      if (s.tv.stats().playing && el && el.readyState >= 2 && el.videoWidth > 0) return true;
    }
    return s.tv.stats().playing;
  });
  console.log('movie playing:', movieOk);
  await page.waitForTimeout(2500);   // a few real frames
  await shot('room-09-theater-movie');
  const vq = await page.evaluate(() => { const el = window.__VB.scene.tv.mediaEl(); return el ? { vw: el.videoWidth, frames: el.getVideoPlaybackQuality?.().totalVideoFrames } : null; });
  console.log('video diag:', JSON.stringify(vq));

  // the TV remote in the theater (the t134 three-room remote)
  await page.waitForTimeout(400);
  await shot('panel-02-tv-remote-theater');

  // the Guide (G in the theater, live channels)
  await page.keyboard.press('g');
  await page.waitForTimeout(1200);
  await shot('panel-03-tv-guide');
  await page.keyboard.press('g');
  await page.waitForTimeout(500);

  // FULLSCREEN + docked Guide — the 1.10.0 hero shot
  await page.evaluate(() => window.__VB.scene.tv.enterFullscreen());
  await page.waitForTimeout(1800);
  await page.keyboard.press('g');
  await page.waitForTimeout(2500);   // the slide settles
  await shot('panel-04-fullscreen-guide-docked');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__VB.scene.tv.stop());

  // ── panels (guest first, then admin) ──
  // NB: opening a panel HIDES the sidebar — so tab links are JS clicks
  // (the sidebar reopens from ☰ between panels).
  const openTab = async (tab) => {
    await page.evaluate(() => {
      document.getElementById('btn-settings-close')?.click();       // panel away (if open)
      const sb = document.getElementById('sidebar');
      if (!sb || sb.classList.contains('hidden')) document.getElementById('btn-menu').click();   // ☰ only if the sidebar is closed (it covers the button when open)
    });
    await page.waitForTimeout(700);
    await page.evaluate((t) => document.querySelector(`.side-link[data-tab="${t}"]`)?.click(), tab);
    await page.waitForTimeout(800);
  };
  await page.click('#btn-menu');
  await page.waitForTimeout(600);
  await shot('panel-05-menu');
  await openTab('look');     await shot('panel-06-my-theme');
  await openTab('shelves');  await shot('panel-07-my-shelves');
  await openTab('profile');  await shot('panel-08-my-profile');
  await page.evaluate(() => document.getElementById('btn-settings-close')?.click());
  await page.waitForTimeout(400);

  // item modal — the 3D case (a movie with a synopsis on the back)
  await page.evaluate(() => {
    const st = window.__VB.state;
    const movie = (st.items || []).find(i => i.type === 'movie' && i.synopsis) || (st.items || []).find(i => i.type === 'movie');
    window.__VB.ui.showItemModal(movie);
  });
  await page.waitForTimeout(900);
  await shot('panel-09-item-modal');
  await page.evaluate(() => document.getElementById('item-modal').classList.add('hidden'));

  // jukebox + the pro rig (in the dance hall)
  await page.evaluate(() => window.__VB.scene.debugTeleport(9.5, 1.5));
  await page.evaluate(() => window.__VB.ui.openDj('jukebox'));
  await page.waitForTimeout(800);
  await shot('panel-10-jukebox');
  await page.evaluate(() => { document.getElementById('dj-modal').classList.add('hidden'); });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__VB.ui.openDj('booth'));
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.querySelector('#djp-mode'); if (b) b.click(); });   // the full pro rig
  await page.waitForTimeout(400);
  const deckLoad = await page.evaluate(async () => {
    const s = window.__VB.scene, st = window.__VB.state;
    const album = (st.items || []).find(i => i.type === 'album');
    if (album) s.djPro.playItem(album);
    await new Promise(r => setTimeout(r, 900));
    return s.djPro.decksRef().some(d => d.item);
  });
  console.log('pro deck loaded:', deckLoad);
  await shot('panel-11-dj-pro-rig');
  await page.evaluate(() => { window.__VB.scene.djPro.stopAll(); document.getElementById('dj-modal').classList.add('hidden'); });

  // admin (sign in as the owner through the panel's own flow)
  await page.evaluate(async () => {
    await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ username: 'BabyBluJ', password: 'BluJNetwork' }) });
    await window.__VB.state.refresh?.();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    document.getElementById('btn-settings-close')?.click();
    const sb = document.getElementById('sidebar');
    if (!sb || sb.classList.contains('hidden')) document.getElementById('btn-menu').click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => document.querySelector('.side-link[data-tab="admin"]')?.click());
  await page.waitForTimeout(800);
  await shot('panel-12-admin-server');
  for (const [sub, name] of [['users', 'panel-13-admin-users'], ['policies', 'panel-14-admin-policies']]) {
    await page.evaluate((s) => document.querySelector(`[data-sub="${s}"]`)?.click(), sub);
    await page.waitForTimeout(600);
    await shot(name);
  }
  await page.evaluate(() => document.getElementById('btn-settings-close')?.click());
  await page.waitForTimeout(300);

  // ── Simple Mode — the phone view ──
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await phone.newPage();
  await mp.goto(BASE + '/m', { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(2500);
  await mp.screenshot({ path: `${OUT}/panel-15-simple-mode-phone.png` });
  console.log('📷 panel-15-simple-mode-phone.png', Math.round(require('fs').statSync(`${OUT}/panel-15-simple-mode-phone.png`).size / 1024), 'KB');
  await phone.close();

  await browser.close();

  // ── restore the store as found: live TV off ──
  await put({ iptv: { url: '', sections: [] } });
  await fetch(BASE + '/api/library?refresh=1&vb_auth=' + login.token);

  const bad = log.filter(l => l.kb < 40);
  console.log(`\n${log.length + 1} shots → ${OUT}`);
  console.log(bad.length ? '⚠ suspiciously small (possible blank): ' + JSON.stringify(bad) : 'no blank-looking shots');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
