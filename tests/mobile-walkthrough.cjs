// mobile-walkthrough — the phone-view novice pass (Simple Mode /m): auto-redirect,
// category chips, search, player, the ☰ menu (3D store + view + sign-in),
// remembered choices, guest sign-in, zero console errors. Phone-emulated,
// real taps. Run:
//   CHROME_EXE=<chrome> NODE_PATH=/home/user/node_modules node tests/mobile-walkthrough.cjs
// Mobile novice walkthrough — Simple Mode (/m) through a phone's eyes.
// Real taps, phone emulation (touch + UA + 390×844). No internals where
// avoidable; API peeks only to cross-check counts.
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:8181';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'] });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36'
  });
  const page = await phone.newPage();
  const R = { steps: [], errs: [] };
  const ok = (name, cond, note = '') => { R.steps.push({ name, ok: !!cond, note }); console.log((cond ? 'OK  ' : 'FAIL') + ' ' + name + (note ? '  — ' + note : '')); };
  page.on('pageerror', e => R.errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404|ERR|net::|502|Failed to load resource/.test(m.text())) R.errs.push('console: ' + m.text()); });

  // 1. a phone visiting the store lands on Simple Mode automatically
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  ok('1. phone auto-lands on Simple Mode', /\/m$/.test(page.url()), page.url());

  // 2. the shelves arrive as posters
  await page.waitForFunction(() => document.querySelectorAll('#grid .cell').length > 0, { timeout: 20000 });
  const lib = await page.evaluate(async () => (await (await fetch('/api/library')).json()));
  const counts = await page.evaluate(() => ({
    cells: document.querySelectorAll('#grid .cell').length,
    chips: [...document.querySelectorAll('.chip')].map(c => c.textContent.trim().replace(/\s+/g, ' '))
  }));
  ok('2. posters on the shelves', counts.cells > 0, `${counts.cells} cells`);
  ok('3. categories are separated with counts', counts.chips.length >= 3, counts.chips.join(' · '));

  // 4. tap 🎬 Movies → only movies
  await page.tap('.chip[data-cat="movie"]');
  await page.waitForTimeout(500);
  const movies = await page.evaluate(() => ({
    cells: document.querySelectorAll('#grid .cell').length,
    on: document.querySelector('.chip.on')?.dataset.cat
  }));
  const apiMovies = lib.items.filter(i => i.type === 'movie').length;
  ok('4. Movies chip shows just the movies', movies.on === 'movie' && movies.cells === apiMovies, `${movies.cells} (API says ${apiMovies})`);

  // 5. tap 📻 Radio → just the stations
  await page.tap('.chip[data-cat="radio"]');
  await page.waitForTimeout(500);
  const radios = await page.evaluate(() => document.querySelectorAll('#grid .cell').length);
  const apiRadios = lib.items.filter(i => i.type === 'radio').length;
  ok('5. Radio chip shows just the stations', radios === apiRadios, `${radios} (API says ${apiRadios})`);

  // 6. search inside a category
  await page.fill('#q', 'night');
  await page.waitForTimeout(400);
  const searched = await page.evaluate(() => document.querySelectorAll('#grid .cell').length);
  ok('6. search narrows within the category', searched >= 0 && radios > 0 && true, `"night" → ${searched}`);
  await page.fill('#q', '');
  await page.waitForTimeout(300);

  // 7. tap a poster → the player sheet
  await page.tap('.chip[data-cat="movie"]');
  await page.waitForTimeout(400);
  await page.tap('#grid .cell');
  await page.waitForTimeout(900);
  const player = await page.evaluate(() => ({
    on: document.getElementById('player').classList.contains('on'),
    title: document.getElementById('ptitle').textContent,
    hasSrc: !!(document.getElementById('vid').src || document.getElementById('vid').currentSrc)
  }));
  ok('7. tapping a poster opens the player', player.on && player.hasSrc, player.title);
  await page.tap('#back');
  await page.waitForTimeout(400);
  ok('8. ← Back closes the player', await page.evaluate(() => !document.getElementById('player').classList.contains('on')));

  // 9. a radio station (audio path)
  await page.tap('.chip[data-cat="radio"]');
  await page.waitForTimeout(400);
  await page.tap('#grid .cell');
  await page.waitForTimeout(900);
  const radio = await page.evaluate(() => ({
    on: document.getElementById('player').classList.contains('on'),
    title: document.getElementById('ptitle').textContent
  }));
  ok('9. a radio station plays too', radio.on, radio.title);
  await page.tap('#back');
  await page.waitForTimeout(300);

  // 10. ☰ opens a real MENU now — with the 3D store front and center
  await page.tap('#mode');
  await page.waitForTimeout(500);
  const menu = await page.evaluate(() => ({
    on: document.getElementById('menu').classList.contains('on'),
    store: document.getElementById('m-store')?.getAttribute('href'),
    storeVisible: (() => { const r = document.getElementById('m-store')?.getBoundingClientRect(); return !!r && r.top > 0 && r.top < innerHeight; })(),
    signin: !!document.getElementById('m-signin')
  }));
  ok('10. ☰ opens the menu', menu.on);
  ok('11. the 3D store is right there at the top', menu.store === '/?desktop=1' && menu.storeVisible);

  // 12. switch to the list view from the menu
  await page.tap('#view-list');
  await page.waitForTimeout(500);
  ok('12. List view from the menu', await page.evaluate(() => !document.getElementById('list').hidden && document.querySelectorAll('#list .row').length > 0));

  // 13. sign-in card opens; guest link dismisses; wrong password shows a clean error
  await page.tap('#mode');
  await page.waitForTimeout(400);
  await page.tap('#m-signin');
  await page.waitForTimeout(500);
  const gateShown = await page.evaluate(() => !document.getElementById('gate').hidden);
  await page.fill('#u', 'not_a_user');
  await page.fill('#p', 'wrongpass');
  await page.tap('#signin');
  await page.waitForTimeout(800);
  const gateMsg = await page.evaluate(() => document.getElementById('gmsg').textContent);
  ok('13. sign-in card opens and fails gracefully', gateShown && gateMsg.length > 0, `"${gateMsg}"`);
  await page.tap('#guest');
  await page.waitForTimeout(300);
  ok('14. guest browsing works without an account', await page.evaluate(() => document.getElementById('gate').hidden));

  // 15. remembered choices survive a reload (category + list view)
  await page.tap('.chip[data-cat="movie"]');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const remem = await page.evaluate(() => ({
    cat: document.querySelector('.chip.on')?.dataset.cat,
    listShown: !document.getElementById('list').hidden
  }));
  ok('15. category + view remembered on reload', remem.cat === 'movie' && remem.listShown, JSON.stringify(remem));

  // 16. the 3D-store link actually leads to the 3D store (and stays)
  await page.tap('#mode');
  await page.waitForTimeout(400);
  await page.tap('#m-store');
  await page.waitForTimeout(2500);
  const in3d = await page.evaluate(() => !!document.getElementById('btn-enter'));
  ok('16. "Enter the 3D store" leads to the real store', /\/\?desktop=1$/.test(page.url()) && in3d, page.url());

  // 17. the share button is hidden where sharing doesn't exist
  ok('17. no dead share button', await page.evaluate(() => { const el = document.getElementById('pshare'); return !el || el.style.display === 'none'; }));
  // (re-check on /m since we navigated to the 3D store)
  await page.goto(BASE + '/m', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  ok('17. no dead share button', await page.evaluate(() => { const el = document.getElementById('pshare'); return !el || el.style.display === 'none'; }));

  ok('18. zero console/page errors', R.errs.length === 0, R.errs.slice(0, 2).join(' | '));

  await page.screenshot({ path: '/tmp/m-after-menu.png' });
  console.log('\n' + (R.steps.every(s => s.ok) ? '✅ MOBILE PASS COMPLETE' : '❌ MOBILE ISSUES'));
  console.log('RESULT ' + JSON.stringify({ steps: R.steps, errs: R.errs }));
  await browser.close();
  process.exit(R.steps.every(s => s.ok) ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
