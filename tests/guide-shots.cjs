// guide-shots — capture the CURRENT Guide variant (reads window.__GUIDE_VARIANT)
// in both modes, for README/verification shots.
//   CHROME_EXE=<chrome> LD_LIBRARY_PATH=<libs> node tests/guide-shots.cjs
//
// Headless-compositor survival kit (learned the hard way, t139h):
//   1. backdrop-filter over the live WebGL canvas FREEZES the compositor —
//      nuke it (the app's own mobile rule does the same for perf).
//   2. REAL input only (page.keyboard / page.click) — synthetic DOM events
//      never wake the compositor, screenshots go stale.
//   3. PIN the full-screen video PAUSED (the suite's trick) — a playing 720p
//      software-decoded video starves compositing.
//
// Stages iptv-org news+movies + the Tubi pack (real EPG → live NOW&NEXT) + a
// local Sintel spot, shoots:
//   windowed (theater) drawer → docs/whats-new/tv-guide-epg.png
//   full-screen dock + synopsis card → docs/whats-new/tv-guide-docked.png
//   NEXT-cell preview → /home/user/readme-shots/guide-<variant>-syn-preview.png
// Restores the 5 demo packs (bench state) at the end.
const { chromium } = require('playwright-core');
const EXE = process.env.CHROME_EXE;
const BASE = 'http://127.0.0.1:8181';
const REPO = '/home/user/Home-Binger';
const SHOTS = '/home/user/readme-shots';
require('fs').mkdirSync(SHOTS, { recursive: true });

(async () => {
  // ── stage: iptv-org news+movies + Tubi (EPG) + Sintel (local video) ──
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'BabyBluJ', password: 'BluJNetwork' }) });
  const login = await lr.json();
  const authH = { 'content-type': 'application/json', Authorization: 'Bearer ' + login.token };
  const put = (body) => fetch(BASE + '/api/admin/config', { method: 'PUT', headers: authH, body: JSON.stringify(body) });
  const packs = JSON.parse(require('fs').readFileSync(process.env.HOME + '/.cache/rig/packs.json', 'utf8'));
  const tubi = packs.iptv.packs.find(p => p.label === 'Tubi');
  await put({ iptv: { url: '', sections: ['news', 'movies'], playlistUrl: '', packs: [tubi] },
    local: { on: true, spots: [process.env.HOME + '/.cache/rig/shotmedia'] } });
  await fetch(BASE + '/api/library?refresh=1&vb_auth=' + login.token);

  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const shot = async (p, wantFs) => {
    // settle: for fs shots, also wait until the video's slide transform has
    // actually SETTLED (the headless compositor can lag seconds behind)
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(wantFs ? 400 : 900);
      const st = await page.evaluate((fs) => {
        const guideOpen = !document.getElementById('guide-modal').classList.contains('hidden');
        if (!guideOpen) return { live: false };
        if (!fs) return { live: true };
        const fsOk = document.body.classList.contains('tv-fullscreen') && document.body.classList.contains('fs-guide');
        if (!fsOk) return { live: false };
        const m = getComputedStyle(document.getElementById('vb-fs-video')).transform.match(/matrix\(1, 0, 0, 1, (-?[\d.]+), 0\)/);
        return { live: true, tx: m ? Math.round(parseFloat(m[1])) : 0 };
      }, wantFs);
      if (!st.live) throw new Error('state lost before shot: ' + p);
      if (!wantFs || (st.tx && Math.abs(st.tx) > 100)) { if (wantFs) console.log('slide settled, tx =', st.tx); break; }
    }
    for (let i = 0; i < 3; i++) {
      try { await page.screenshot({ path: p, timeout: 60000 }); return; }
      catch { await page.waitForTimeout(2500); }
    }
    throw new Error('screenshot failed: ' + p);
  };
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.addInitScript(() => { try { localStorage.setItem('vb_seen_help', '1'); } catch {} });
  await page.reload();
  await page.waitForSelector('#btn-enter:not(.hidden)', { timeout: 90000 });
  await page.click('#btn-enter', { force: true });
  await page.waitForFunction(() => { const g = window.__VB?.scene?.threeScene?.getObjectByName('shelves'); return !!g && g.children.some(c => c.isInstancedMesh && c.count > 30); }, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.addStyleTag({ content: '* { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }' });

  const variant = await page.evaluate(() => window.__GUIDE_VARIANT || 'classic');
  console.log('variant:', variant);

  // ── windowed (theater): the drawer ──
  await page.evaluate(() => { window.__VB.scene.debugTeleport(0, -8.5); });
  await page.waitForTimeout(800);
  await page.keyboard.press('g');
  await page.waitForTimeout(1800);
  const drawer = await page.evaluate(() => {
    const m = document.getElementById('guide-modal'), c = m.querySelector('.guide-card'), cs = getComputedStyle(m);
    const r = c.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right),
      shade: cs.backgroundColor + ' / blur ' + cs.backdropFilter,
      rows: document.querySelectorAll('#guide-rows .guide-row').length,
      next: document.querySelectorAll('#guide-rows .guide-next').length,
      total: window.__VB.mainCtx.guideInfo().total };
  });
  console.log('windowed drawer:', JSON.stringify(drawer));
  await shot(REPO + '/docs/whats-new/tv-guide-epg.png', false);
  await shot(SHOTS + '/guide-' + variant + '-theater.png', false);

  // ── full screen: the dock + the floating synopsis card ──
  await page.keyboard.press('g');            // close the drawer
  await page.waitForTimeout(700);
  const movie = await page.evaluate(async () => {
    const s = window.__VB.scene, st = window.__VB.state;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const m = (st.items || []).find(i => i.type === 'movie' && i.source === 'local')
      || (st.items || []).find(i => i.type === 'movie');
    s.tv.playItem(m);
    for (let t = 0; t < 60; t++) { await sleep(500);
      const el = s.tv.mediaEl();
      if (s.tv.stats().playing && el && el.readyState >= 2 && el.videoWidth > 0) break; }
    return { title: m?.title, src: m?.source };
  });
  console.log('movie:', JSON.stringify(movie));
  await page.evaluate(() => window.__VB.scene.tv.enterFullscreen());
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { window.__VB.scene.tv.mediaEl().pause(); } catch {} });   // PIN paused — the suite's trick
  await page.keyboard.press('g');            // the docked Guide
  await page.waitForTimeout(2500);           // the slide settles
  const geo = await page.evaluate(() => {
    const vid = document.getElementById('vb-fs-video'), modal = document.getElementById('guide-modal'), syn = document.getElementById('guide-syn');
    const vr = vid.getBoundingClientRect(), mr = modal.getBoundingClientRect();
    const foot = document.getElementById('guide-foot');
    return { dockW: Math.round(mr.width), dockRight: Math.round(mr.right),
      vidW: Math.round(vr.width), vidX: Math.round(vr.left),
      synHidden: getComputedStyle(syn).display === 'none',   // t143: fs keeps the video pristine — the footer owns fs
      footShown: getComputedStyle(foot).display !== 'none' && foot.textContent.trim().length > 0,
      footWatch: !!foot.querySelector('[data-footwatch]'),
      rows: document.querySelectorAll('.guide-row').length, innerW: innerWidth };
  });
  console.log('fullscreen dock:', JSON.stringify(geo));
  await shot(REPO + '/docs/whats-new/tv-guide-docked.png', true);
  await shot(SHOTS + '/guide-' + variant + '-fs.png', true);

  // ── NEXT preview (the new layout's signature) — a REAL mouse click.
  //    t143: in fs the FOOTER carries the story (the card is theater-only)
  let prev = { clicked: false };
  try {
    await page.click('#guide-rows .guide-next:not(.dim)', { timeout: 5000 });
    await page.waitForTimeout(1000);
    prev = await page.evaluate(() => {
      const foot = document.getElementById('guide-foot');
      return { clicked: true, foot: foot.textContent.slice(0, 90) };
    });
  } catch (e) { prev = { clicked: false, why: String(e.message).split('\n')[0] }; }
  console.log('next-preview:', JSON.stringify(prev));
  await shot(SHOTS + '/guide-' + variant + '-fs-footer.png', true);

  // ── TIME TRAVEL (t140): click the +2h chip — rows show what's on THEN ──
  let fut = { clicked: false };
  try {
    await page.click('#guide-time [data-time]:nth-child(3)', { timeout: 5000 });   // ▶ Now, +1h, +2h
    await page.waitForTimeout(1500);
    fut = await page.evaluate(() => {
      const foot = document.getElementById('guide-foot');
      const row = document.querySelector('#guide-rows .guide-row .guide-epg');
      return { clicked: true, chip: document.querySelector('#guide-time .active')?.textContent,
        foot: foot.textContent.slice(0, 90),
        rowLine: row?.textContent?.slice(0, 80) || null,
        at: window.__VB.mainCtx.guideInfo().at };
    });
  } catch (e) { fut = { clicked: false, why: String(e.message).split('\n')[0] }; }
  console.log('time-travel:', JSON.stringify(fut));
  await shot(SHOTS + '/guide-' + variant + '-future.png', true);

  await page.evaluate(() => { window.__VB.scene.tv.stop(); });
  await browser.close();

  // ── restore: the 5 demo packs (bench state) ──
  await put({ ...packs, local: { on: false, spots: [] } });
  await fetch(BASE + '/api/library?refresh=1&vb_auth=' + login.token);
  console.log('DONE — packs restored (bench state)');
})().catch(e => { console.error('FATAL', e); process.exit(2); });
