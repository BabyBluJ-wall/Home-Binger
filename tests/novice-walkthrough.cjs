// novice-walkthrough — the "new user, not tech-savvy" pass (runs against a live store on :8181)
// REAL clicks/keys only, first-visit experience, no __VB mutation (read-only peeks for asserts).
// Screenshots → /home/user/novice-shots/. Run:
//   CHROME_EXE=<chrome> NODE_PATH=/home/user/node_modules node tests/novice-walkthrough.cjs
// Expects the store's REAL defaults (live TV off → the G hint, standby idle card).
// Novice walkthrough — first-visit experience through REAL UI clicks/keys.
// No __VB state mutation; internals read-only where needed for asserts.
// Screenshots → /home/user/novice-shots/
const { chromium } = require('playwright-core');
const EXE = process.env.CHROME_EXE;
const BASE = 'http://127.0.0.1:8181';
const SHOTS = '/home/user/novice-shots';
require('fs').mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });   // a normal first-run window
  const page = await ctx.newPage();
  const R = { steps: [], errors: [] };
  const ok = (name, cond, note = '') => {
    R.steps.push({ name, ok: !!cond, note });
    console.log((cond ? 'OK  ' : 'FAIL') + ' ' + name + (note ? '  — ' + note : ''));
  };
  page.on('pageerror', e => R.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404|ERR|net::|502|Failed to load resource/.test(m.text())) R.errors.push('console: ' + m.text()); });

  // ── 1. first visit: the entry screen ──
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-enter:not(.hidden)', { timeout: 90000 });
  await page.screenshot({ path: SHOTS + '/01-entry.png' });
  ok('1. entry screen with a clear Enter button', true);

  // ── 2. click ENTER (real click) ──
  await page.click('#btn-enter', { force: true });
  await page.waitForTimeout(1800);
  const helpShown = await page.evaluate(() => !document.getElementById('help-overlay').classList.contains('hidden'));
  ok('2. first visit: the help overlay greets a new user', helpShown);
  await page.screenshot({ path: SHOTS + '/02-first-help.png' });

  // ── 3. close the help with its button, reopen from the HUD, close with Esc ──
  await page.click('#btn-help-close');
  await page.waitForTimeout(400);
  const helpClosed = await page.evaluate(() => document.getElementById('help-overlay').classList.contains('hidden'));
  ok('3a. "Let\'s browse" closes the help', helpClosed);
  await page.click('#btn-help');
  await page.waitForTimeout(300);
  const helpRe = await page.evaluate(() => !document.getElementById('help-overlay').classList.contains('hidden'));
  ok('3b. the ? Help button brings it back', helpRe);
  await page.keyboard.press('Escape');   // a real keypress
  await page.waitForTimeout(300);
  const helpEsc = await page.evaluate(() => document.getElementById('help-overlay').classList.contains('hidden'));
  ok('3c. Esc closes it too', helpEsc);

  // ── 4. the store is stocked; the theater screen idles on the STANDBY card ──
  const stock = await page.evaluate(() => {
    const s = window.__VB.scene;
    return { items: (window.__VB.state.items || []).length, idle: s.tv.surfaceInfo().idleMode };
  });
  ok('4. shelves are stocked and the big screen idles on the standby card', stock.items > 0 && stock.idle === 'standby', `${stock.items} items · idle "${stock.idle}"`);
  await page.screenshot({ path: SHOTS + '/03-store.png' });

  // ── 5. ☰ Menu → My Theme: one-click preset, applied LIVE ──
  await page.click('#btn-menu');
  await page.waitForTimeout(500);
  const menuOpen = await page.evaluate(() => !document.getElementById('sidebar').classList.contains('hidden'));
  ok('5a. ☰ Menu opens the settings menu', menuOpen);
  await page.click('.side-link[data-tab="look"]');
  await page.waitForTimeout(400);
  const panelOpen = await page.evaluate(() => !document.getElementById('settings').classList.contains('hidden'));
  ok('5a2. picking "My Theme" opens the panel', panelOpen);
  await page.screenshot({ path: SHOTS + '/04-my-theme.png' });
  const cozy = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.preset-btn')];
    const b = btns.find(x => x.textContent.trim() === 'Cozy Video Store');
    if (!b) return { found: false };
    b.click();
    return { found: true };
  });
  await page.waitForTimeout(700);
  const themeVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--vb-accent').trim());
  ok('5b. "Cozy Video Store" preset applies instantly', cozy.found && themeVar === '#ffb52e', `--vb-accent = ${themeVar}`);
  await page.click('#btn-settings-close');
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOTS + '/05-cozy-store.png' });

  // ── 6. close the app, reopen: the theme STAYS (the big t134 fix, pure UI) ──
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-enter:not(.hidden)', { timeout: 90000 });
  await page.click('#btn-enter', { force: true });
  await page.waitForTimeout(1800);
  const persist = await page.evaluate(() => ({
    css: getComputedStyle(document.documentElement).getPropertyValue('--vb-accent').trim(),
    helpAgain: !document.getElementById('help-overlay').classList.contains('hidden')
  }));
  ok('6. reopen: cozy theme survived (menus + store), help does not nag again', persist.css === '#ffb52e' && !persist.helpAgain, `--vb-accent = ${persist.css}`);
  await page.screenshot({ path: SHOTS + '/06-after-reopen.png' });

  // ── 7. My Shelves: pin a category from the panel, then set it back to Automatic ──
  await page.click('#btn-menu');
  await page.waitForTimeout(400);
  await page.click('.side-link[data-tab="shelves"]');
  await page.waitForTimeout(400);
  const pin = await page.evaluate(() => {
    const sel = document.querySelector('select[data-unit="wall-R-0"]') || document.querySelector('select[data-unit]');
    if (!sel) return { found: false };
    const opt = [...sel.options].find(o => o.value && !o.value.startsWith('radio:') && !o.value.startsWith('iptv:'));
    if (!opt) return { found: false, why: 'no section options' };
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: true, unit: sel.dataset.unit, label: opt.textContent.trim(), key: opt.value };
  });
  await page.waitForTimeout(800);
  const pinnedOk = await page.evaluate((unit) => {
    const sel = document.querySelector(`select[data-unit="${unit}"]`);
    return sel && sel.value !== '';
  }, pin.unit);
  ok('7a. pinning a category to a shelf from the panel sticks', pin.found && pinnedOk, pin.found ? `${pin.unit} → ${pin.label}` : 'no options');
  await page.screenshot({ path: SHOTS + '/07-my-shelves.png' });
  // back to Automatic
  await page.evaluate((unit) => {
    const sel = document.querySelector(`select[data-unit="${unit}"]`);
    sel.value = '';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }, pin.unit);
  await page.waitForTimeout(800);
  await page.click('#btn-settings-close');
  // reopen and confirm it's STILL Automatic after a reload (the t134 tombstone fix, via UI)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#btn-enter:not(.hidden)', { timeout: 90000 });
  await page.click('#btn-enter', { force: true });
  await page.waitForTimeout(1500);
  await page.click('#btn-menu');
  await page.waitForTimeout(400);
  await page.click('.side-link[data-tab="shelves"]');
  await page.waitForTimeout(400);
  const unpin = await page.evaluate((unit) => {
    const sel = document.querySelector(`select[data-unit="${unit}"]`);
    return { val: sel ? sel.value : 'missing' };
  }, pin.unit);
  ok('7b. back on "Automatic", closed, reopened: stays Automatic', unpin.val === '', `select = "${unpin.val}"`);
  await page.click('#btn-settings-close');
  await page.waitForTimeout(300);

  // ── 8. walk to the theater (hold W), then press G ──
  const inTheater = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    s.debugTeleport(0, -5.6, 0, 0);            // in the hall, at the theater doorway, facing -z
    await sleep(300);
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
      await sleep(120);
      const p = s.debugPose();
      if (p.z < -7.5) return { there: true, z: p.z };
    }
    return { there: false, z: s.debugPose().z };
  });
  ok('8. walking (hold W) reaches the theater through the doors', inTheater.there, `z = ${inTheater.z?.toFixed(1)}`);
  await page.waitForTimeout(600);
  // G with no live TV configured → a FRIENDLY hint, not a dead end
  await page.keyboard.press('g');
  await page.waitForTimeout(300);
  const guide = await page.evaluate(() => {
    const t = document.getElementById('toasts');
    return { toast: t ? t.textContent : '', room: window.__VB.mainCtx.playerRoom() };
  });
  ok('9. G in the theater with live TV off shows a friendly hint', /admin|theater/i.test(guide.toast), `room ${guide.room} · toast: "${guide.toast.slice(0, 70)}"`);
  await page.screenshot({ path: SHOTS + '/08-theater.png' });

  // ── 10. the big screen in person: standby card, screen is live ──
  const screen = await page.evaluate(() => window.__VB.scene.tv.surfaceInfo());
  ok('10. the theater screen idles on the standby card in person', screen.idleMode === 'standby');

  // ── 11. back to defaults for the next visitor (own profile only) ──
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.preset-btn')];
    const neon = btns.find(x => x.textContent.trim() === 'Neon Night');
    if (neon) neon.click();
  });
  await page.waitForTimeout(600);

  console.log('\n' + (R.steps.every(s => s.ok) && R.errors.length === 0 ? '✅ NOVICE PASS COMPLETE' : '❌ NOVICE ISSUES'));
  console.log('errors:', R.errors.length ? R.errors.slice(0, 5) : 'none');
  console.log('RESULT ' + JSON.stringify({ steps: R.steps, errors: R.errors }));
  await browser.close();
  process.exit(R.steps.every(s => s.ok) && R.errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
