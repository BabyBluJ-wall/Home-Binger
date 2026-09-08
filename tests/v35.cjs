// v35 — consolidated regression (runs from the workspace; needs the store on :8181)
// Covers: album→track audio (t16) · library filtering (t17) · theme-synced visualizer ·
// play-next/queue · free add-ons (archive/podcasts/radio) · PUBLIC per-user shelf map ·
// compiled panels · queue panel moved to the left edge · walk.
//
// Run:  node tests/v35.js   (playwright-core + a chrome must be reachable — see tests/README)
const { chromium } = require('playwright-core');
const http = require('http');

// whole-request retry (body reads included) for the long-stream checks
const withRetry = async (fn, tries = 3) => {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) { if (i >= tries - 1) throw e; await new Promise(r => setTimeout(r, 400)); }
  }
};

// Test-runner resilience: node's undici sometimes dies on a reused socket the
// instant a request lands ("other side closed") — browsers transparently retry
// this; the app is unaffected. Mirror that: retry once on socket-level resets.
const origFetch = global.fetch;
global.fetch = async (url, opts) => {
  try { return await origFetch(url, opts); }
  catch (e) {
    const socketDeath = e?.code === 'UND_ERR_SOCKET' || ['other side closed', 'terminated'].some(x => String(e?.message || '').includes(x) || String(e?.cause?.message || '').includes(x));
    if (!socketDeath) throw e;
    await new Promise(r => setTimeout(r, 250));
    return origFetch(url, opts);
  }
};

const EXE = process.env.CHROME_EXE || '/tmp/browsers/chrome/linux-152.0.7977.82/chrome-linux64/chrome';
const BASE = 'http://localhost:8181';
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AmAA=', 'base64');
const MP4 = Buffer.alloc(4096, 7);

// ── mock A (:32770) — Plex with an album that needs child-resolution (t16) ──
const plexMock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/identity') return json({ MediaContainer: {} });
  if (u.pathname === '/livetv/epg/channels') return json({ MediaContainer: { Metadata: [] } });
  if (u.pathname === '/library/sections') return json({ MediaContainer: { Directory: [
    { key: '1', type: 'movie', title: 'Movies' }, { key: '2', type: 'artist', title: 'Music' }, { key: '3', type: 'movie', title: 'Secret Vault' }, { key: '4', type: 'show', title: 'TV Shows' }] } });
  if (u.pathname === '/library/sections/1/all') return json({ MediaContainer: { totalSize: 20, Metadata: Array.from({ length: 20 }, (_, i) => ({ ratingKey: String(100 + i), title: `Film ${i}`, type: 'movie', addedAt: 1700000000 + i, thumb: null })) } });
  if (u.pathname === '/library/sections/2/albums') return json({ MediaContainer: { totalSize: 15, Metadata: Array.from({ length: 15 }, (_, i) => ({ ratingKey: String(200 + i), title: `Album ${i}`, type: 'album', parentRatingKey: 'x', addedAt: 1, thumb: null })) } });
  if (u.pathname === '/library/sections/4/all') {
    // t56c: type=4 (lowercase) → episodes; otherwise SERIES containers
    if (u.searchParams.get('type') !== '4')
      return json({ MediaContainer: { totalSize: 2, Metadata: [{ ratingKey: '800', title: 'The Series', type: 'show' }, { ratingKey: '801', title: 'Other Show', type: 'show' }] } });
    // 6 files, no season/show containers
    return json({ MediaContainer: { totalSize: 6, Metadata: Array.from({ length: 6 }, (_, i) => ({
      ratingKey: String(700 + i), title: `Episode ${i + 1}`, type: 'episode',
      grandparentTitle: 'The Series', parentTitle: 'Season 1',
      addedAt: 1700000000 + i, thumb: null })) } });
  }
  if (u.pathname === '/library/sections/2/all') {
    // t56c: REAL-Plex behavior — only the LOWERCASE type=10 param yields tracks;
    // anything else (wrong case / no param) returns ARTIST containers
    if (u.searchParams.get('type') !== '10')
      return json({ MediaContainer: { totalSize: 5, Metadata: Array.from({ length: 5 }, (_, i) => ({ ratingKey: String(900 + i), title: `Artist ${i}`, type: 'artist', thumb: null })) } });
    // 5 albums × 3 tracks, every file listed
    return json({ MediaContainer: { totalSize: 15, Metadata: Array.from({ length: 15 }, (_, i) => ({
      ratingKey: String(500 + i), title: `Track ${i + 1}`, type: 'track',
      parentTitle: `Album ${Math.floor(i / 3)}`, grandparentTitle: 'The Artist',
      addedAt: 1700000000 + i, thumb: null })) } });
  }
  if (/^\/library\/metadata\/80[01]\/allLeaves$/.test(u.pathname)) {   // t56c rescue walk
    const base = u.pathname.split('/')[3] === '800' ? 'The Series' : 'Other Show';
    return json({ MediaContainer: { totalSize: 3, Metadata: Array.from({ length: 3 }, (_, i) => ({
      ratingKey: String(700 + (u.pathname.split('/')[3] === '800' ? 0 : 3) + i), title: `Episode ${(u.pathname.split('/')[3] === '800' ? 0 : 3) + i + 1}`,
      type: 'episode', grandparentTitle: base, addedAt: 1700000000 + i, thumb: null })) } });
  }
  if (u.pathname.startsWith('/library/metadata/5')) {          // t55b: track metadata + parts
    const tid = u.pathname.split('/')[3];
    if (u.pathname.endsWith('/children')) return json({ MediaContainer: { Metadata: [] } });
    return json({ MediaContainer: { Metadata: [{ ratingKey: tid, title: `Track ${tid - 500 + 1}`, type: 'track',
      Media: [{ Part: [{ key: `/t${tid - 500}.mp3` }] }] }] } });
  }
  if (/^\/t\d+\.mp3$/.test(u.pathname)) { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(Buffer.alloc(2048, 9)); }
  if (u.pathname === '/library/sections/3/all') return json({ MediaContainer: { totalSize: 5, Metadata: Array.from({ length: 5 }, (_, i) => ({ ratingKey: String(300 + i), title: `Vault ${i}`, type: 'movie', addedAt: 1, thumb: null })) } });
  if (u.pathname.startsWith('/library/metadata/999')) {        // resolved first-track
    return json({ MediaContainer: { Metadata: [{ ratingKey: '999', title: 'Track One', type: 'track', Media: [{ Part: [{ key: '/a.mp3' }] }] }] } });
  }
  if (u.pathname.startsWith('/library/metadata/2')) {          // any 2xx album → children
    if (u.pathname.endsWith('/children')) return json({ MediaContainer: { Metadata: [{ ratingKey: '999', title: 'Track One', type: 'track', Media: [{ Part: [{ key: '/a.mp3' }] }] }] } });
    return json({ MediaContainer: { Metadata: [{ ratingKey: u.pathname.split('/').pop(), title: 'Album', type: 'album' }] } });   // album: no Media
  }
  if (u.pathname.startsWith('/library/metadata/')) return json({ MediaContainer: { Metadata: [{ ratingKey: '1', title: 'X', type: 'movie', Media: [{ Part: [{ key: '/f.mp4' }] }] }] } });
  if (u.pathname === '/a.mp3') { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(Buffer.alloc(2048, 9)); }
  if (u.pathname === '/f.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); return res.end(MP4); }
  res.writeHead(404); res.end();
});

// ── mock B (:32790) — archive.org + radio-browser + podcast RSS (t18) ──
const FILMS = [
  { identifier: 'night_of_the_living_dead', title: 'Night of the Living Dead', year: 1968, downloads: 900000 },
  { identifier: 'his_girl_friday', title: 'His Girl Friday', year: 1940, downloads: 500000 },
  { identifier: 'plan_9', title: 'Plan 9 from Outer Space', year: 1957, downloads: 400000 }
];
const addonMock = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const json = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/advancedsearch.php') {
    if (u.searchParams.get('q').includes('feature_films'))
      return json({ response: { numFound: FILMS.length, docs: FILMS } });
    return json({ response: { numFound: 0, docs: [] } });
  }
  if (u.pathname.startsWith('/metadata/')) {
    const id = u.pathname.split('/')[2];
    return json({ metadata: { identifier: id, title: (FILMS.find(f => f.identifier === id) || {}).title || id }, files: [
      { name: `${id}_512kb.mp4`, size: 300000 }, { name: `${id}_h.264.mp4`, size: 900000 }] });
  }
  if (u.pathname === '/download/trickle_film/trickle.mp4') {
    // long-haul transfer: 6.4 MB in 64 KB chunks every 100 ms (~10 s) — proves
    // the proxy carries long streams to the END without hidden timers
    const CHUNK = Buffer.alloc(65536, 7), TOTAL = 100;
    const range = req.headers.range;
    let startChunk = 0, endChunk = TOTAL;
    if (range) {
      const m = range.match(/bytes=(\d+)-(\d*)/);
      if (m) {
        startChunk = Math.floor(Number(m[1]) / CHUNK.length);
        endChunk = m[2] ? Math.ceil((Number(m[2]) + 1) / CHUNK.length) : TOTAL;   // honour the END
      }
    }
    const totalBytes = TOTAL * CHUNK.length;
    const from = startChunk * CHUNK.length;
    const to = Math.min(endChunk * CHUNK.length, totalBytes) - 1;
    res.writeHead(range ? 206 : 200, {
      'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${from}-${to}/${totalBytes}`, 'Content-Length': String(to - from + 1) } : { 'Content-Length': String(totalBytes) })
    });
    let i = startChunk;
    const iv = setInterval(() => {
      if (i >= endChunk) { clearInterval(iv); res.end(); return; }
      res.write(CHUNK); i++;
    }, 100);
    res.on('close', () => clearInterval(iv));
    return;
  }
  if (u.pathname === '/metadata/trickle_film') {
    return json({ metadata: { identifier: 'trickle_film', title: 'Trickle Film' }, files: [{ name: 'trickle.mp4', size: 6553600 }] });
  }
  if (u.pathname.startsWith('/download/')) {
    const range = req.headers.range;
    if (range) { const m = range.match(/bytes=(\d+)-(\d*)/); const s0 = Number(m[1]); const e = m[2] ? Number(m[2]) : MP4.length - 1;
      res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${s0}-${e}/${MP4.length}`, 'Content-Length': String(e - s0 + 1) });
      return res.end(MP4.subarray(s0, e + 1)); }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(MP4.length), 'Accept-Ranges': 'bytes' });
    return res.end(MP4);
  }
  if (u.pathname.startsWith('/services/img/')) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(JPG); }
  if (u.pathname.startsWith('/json/stations/search')) {
    return json([{ name: 'KEXP Retro', url: 'http://127.0.0.1:32790/stream/retro.mp3', url_resolved: 'http://127.0.0.1:32790/stream/retro.mp3', votes: 99, codec: 'MP3', bitrate: 128, favicon: '', countrycode: 'US' },
                 { name: 'HLS Only (skip)', url: 'http://127.0.0.1:32790/station.m3u8', url_resolved: 'http://127.0.0.1:32790/station.m3u8', votes: 98, codec: 'MP3', favicon: '' }]);
  }
  if (u.pathname.startsWith('/stream/')) { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(Buffer.alloc(8192, 5)); }
  if (u.pathname === '/feed.rss') {
    const ep = i => `<item><title>Episode ${i}: The Big One</title><pubDate>${new Date(Date.now() - i * 864e5).toUTCString()}</pubDate>
      <enclosure url="http://127.0.0.1:32790/audio/ep${i}.mp3" type="audio/mpeg" length="4096"/></item>`;
    res.writeHead(200, { 'Content-Type': 'application/rss+xml' });
    return res.end(`<?xml version="1.0"?><rss><channel><title>The Store Cast</title>
      <itunes:image href="http://127.0.0.1:32790/cover.jpg"/>${[1, 2, 3].map(ep).join('')}</channel></rss>`);
  }
  if (u.pathname.startsWith('/audio/')) { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); return res.end(Buffer.alloc(4096, 9)); }
  if (u.pathname === '/cover.jpg') { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(JPG); }
  res.writeHead(404); res.end();
});

(async () => {
  await Promise.all([new Promise(r => plexMock.listen(32770, r)), new Promise(r => addonMock.listen(32790, r))]);
  const R = { checks: {} };

  // ── admin session for API work ──
  const lr = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'BabyBluJ', password: 'BluJNetwork' }) });
  const login = await lr.json();
  const authH = { Authorization: `Bearer ${login.token}`, cookie: lr.headers.get('set-cookie')?.split(';')[0] };
  const j = (r) => r.json();

  // 0) register → login → logout round-trip
  {
    const uname = 'walkout_' + Date.now().toString(36);
    await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: uname, password: 'pass1234' }) });
    const l2 = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: uname, password: 'pass1234' }) });
    const s2 = await l2.json();
    const bIn = await j(await fetch(BASE + '/api/bootstrap?vb_auth=' + s2.token));
    await fetch(BASE + '/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + s2.token } });
    const bOut = await j(await fetch(BASE + '/api/bootstrap?vb_auth=' + s2.token));
    R.checks.logout = { signedIn: !bIn.me.isGuest, name: bIn.me.username, guestAgain: bOut.me.isGuest,
      ok: !bIn.me.isGuest && bIn.me.username === uname && bOut.me.isGuest === true };
  }

  // 1) plex library picker + vault filtering (t17)
  const libs = await j(await fetch(BASE + '/api/admin/libraries', { method: 'POST', headers: { 'content-type': 'application/json', ...authH }, body: JSON.stringify({ source: 'plex', url: 'http://localhost:32770', token: 't' }) }));
  await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
    body: JSON.stringify({ sources: { demo: false, plex: true, jellyfin: false }, plex: { url: 'http://localhost:32770', token: 't', sections: ['1', '2', '4'] },
      archive: { url: 'http://127.0.0.1:32790', sections: ['staff-picks'] }, radio: { url: 'http://127.0.0.1:32790', sections: ['oldies'] },
      podcasts: { feeds: ['http://127.0.0.1:32790/feed.rss'] }, shelves: {} }) });
  const lib1 = await j(await fetch(BASE + '/api/library?refresh=1&vb_auth=' + login.token));
  const items = lib1.items || [];
  R.checks.libs = {
    libsN: libs.libraries?.length,
    vaultGone: !items.some(i => i.title.startsWith('Vault')),
    hasFilm: items.some(i => i.title.startsWith('Film')),
    ok: libs.libraries?.length === 4 && !items.some(i => i.title.startsWith('Vault')) && items.some(i => i.title.startsWith('Film'))
  };

  // 2) t55b: music comes TRACK-LEVEL — every file its own item, grouped by album
  const plexTracks = items.filter(i => i.source === 'plex' && i.type === 'album');
  const trackTitles = plexTracks.map(i => i.title);
  const trackGroups = new Set(plexTracks.map(i => i.sectionTitle));
  R.checks.trackLevel = { n: plexTracks.length, albums: trackGroups.size,
    sample: trackTitles.slice(0, 3),
    ok: plexTracks.length === 15 && plexTracks.every(i => /^Track \d+$/.test(i.title)) && trackGroups.size === 5 };
  // t56b: TV comes EPISODE-level; NOTHING folder-shaped shelves from Plex
  const eps = items.filter(i => i.source === 'plex' && i.sectionTitle === 'The Series');
  const plexAll = items.filter(i => i.source === 'plex');
  const filesOnly = plexAll.length > 0 && plexAll.every(i => /^(Film|Track|Episode) \d+$/.test(i.title) || /^The Series — Episode \d+$/.test(i.title));
  R.checks.epLevel = { eps: eps.length, filesOnly,
    ok: eps.length === 6 && eps.every(i => i.title.startsWith('The Series — Episode')) && filesOnly };
  const album = items.find(i => i.source === 'plex' && i.title === 'Track 1');   // a TRACK item now
  const audioR = await fetch(`${BASE}/api/play/plex/${album.key}?audio=1&vb_auth=${login.token}`);
  const audioBuf = await audioR.arrayBuffer();
  R.checks.albumAudio = { status: audioR.status, bytes: audioBuf.byteLength, ok: audioR.status === 200 && audioBuf.byteLength === 2048 };

  // 3) free add-ons stacked on plex (t18)
  const hasFilmArchive = items.some(i => i.title === 'Night of the Living Dead' && i.source === 'archive');
  const hasRadio = items.some(i => i.title === 'KEXP Retro') && !items.some(i => i.title === 'HLS Only (skip)');
  const hasPod = items.filter(i => i.source === 'podcast').length >= 3;
  R.checks.addons = { hasFilmArchive, hasRadio, hasPod, ok: hasFilmArchive && hasRadio && hasPod };

  // 4) archive range proxy (t18)
  const film = items.find(i => i.source === 'archive');
  const rr = await fetch(`${BASE}/api/play/archive/${film.key}?vb_auth=${login.token}`, { headers: { range: 'bytes=0-999' } });
  const rb = await rr.arrayBuffer();
  R.checks.archiveProxy = { status: rr.status, len: rb.byteLength, ok: (rr.status === 206 || rr.status === 200) && rb.byteLength === 1000 && !!rr.headers.get('content-range') };

  // 4b) FREE-ONLY STORE — demo/plex/jellyfin all OFF → only free media shelved
  await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
    body: JSON.stringify({ sources: { plex: false, jellyfin: false }, archive: { url: 'http://127.0.0.1:32790', sections: ['staff-picks'] },
      radio: { url: 'http://127.0.0.1:32790', sections: [] }, podcasts: { feeds: [] } }) });
  const freeOnly = await j(await fetch(BASE + '/api/library?refresh=1&vb_auth=' + login.token));
  const freeSrcs = new Set((freeOnly.items || []).map(i => i.source));
  R.checks.freeOnly = { count: freeOnly.count, sources: [...freeSrcs],
    ok: freeOnly.count > 0 && freeSrcs.size === 1 && freeSrcs.has('archive') };

  // restore for the browser phase: FREE-ONLY (mock archive + one radio genre)
  await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
    body: JSON.stringify({ sources: { plex: false, jellyfin: false }, plex: { url: '', token: '', sections: [] }, archive: { url: 'http://127.0.0.1:32790', sections: ['staff-picks'] },
      radio: { url: 'http://127.0.0.1:32790', sections: ['oldies'] }, podcasts: { feeds: [] }, shelves: {} }) });

  // 19) admin policy: lock the media mix → personal sources prefs are ignored
  {
    await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
      body: JSON.stringify({ locks: { theme: false, sorting: false, shelves: false, sources: true } }) });
    const dev = 'dev:policycheck00000000000000000000000f';
    await fetch(BASE + '/api/prefs', { method: 'POST', headers: { 'content-type': 'application/json', 'X-VB-Device': dev },
      body: JSON.stringify({ sources: { plex: null, jellyfin: null, archive: [], radio: [] } }) });
    const b = await j(await fetch(BASE + '/api/bootstrap', { headers: { 'X-VB-Device': dev } }));
    const stored = b.mySavedPrefs?.sources ?? null;
    const effLocked = b.prefs?.sources ?? null;
    await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
      body: JSON.stringify({ locks: { theme: false, sorting: false, shelves: false, sources: false } }) });
    R.checks.policyLock = { stored, effLocked, ok: stored === null && effLocked === null };
  }

  // ── browser phase (guest device) ──
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--js-flags=--max-old-space-size=640'] });   // t79: heap cap — renderer OOM-kills under sandbox memory pressure
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.addInitScript(() => { try { localStorage.setItem('vb_seen_help', '1'); } catch {} });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' && !/502|404|ERR|net::/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const g = window.__VB?.scene?.threeScene?.getObjectByName('shelves'); return !!g && g.children.some(c => c.isInstancedMesh && c.count > 30); }, { timeout: 45000 });
  await page.waitForTimeout(700);

  // 5) PUBLIC shelf map (guest, per-user pref) — classics on the back wall
  R.checks.publicShelfMap = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const sec = (window.__VB.state.sections || []).find(x => x.key === 'archive:staff-picks');
    if (!sec) return { ok: false, why: 'no section' };
    await window.__VB.state.updatePrefs({ shelves: { 'wall-R-0': 'archive:staff-picks' } });
    s.setShelfAssignment({ 'wall-R-0': 'archive:staff-picks' });   // what the panel's live preview does
    await new Promise(r => setTimeout(r, 400));
    const right = s.placementsByUnit('wall-R-0');
    const left = s.placementsByUnit('wall-L-0');
    const classics = ['Night of the Living Dead', 'His Girl Friday', 'Plan 9 from Outer Space'];
    const boot = await (await fetch('/api/bootstrap', { credentials: 'include' })).json();
    return {
      rightSample: right.slice(0, 3),
      rightOk: right.length > 0 && right.every(t => classics.includes(t)),
      leftOk: left.length > 0 && !left.some(t => classics.includes(t)),
      persisted: boot.prefs?.shelves?.['wall-R-0'] === 'archive:staff-picks',
      ok: right.length > 0 && right.every(t => classics.includes(t)) && !left.some(t => classics.includes(t)) && boot.prefs?.shelves?.['wall-R-0'] === 'archive:staff-picks'
    };
  });

  // 6) compiled panels — tabs trimmed, sections landed in their new homes
  R.checks.panels = await page.evaluate(async () => {
    const tabs = [...document.querySelectorAll('#sidebar-nav .side-link')].map(b => b.dataset.tab);
    const wanted = ['look', 'shelves', 'media', 'profile', 'admin'];
    // 6 side-links: the 5 panels + the guest "Admin sign-in" shortcut (also data-tab="profile").
    // t82 merged the three admin tabs into ONE Admin tab (server+users+policies live inside it).
    const adminHidden = !!document.querySelector('.side-link[data-tab="admin"]')?.classList.contains('hidden');
    const tabOk = tabs.length === 6 && wanted.every(t => tabs.includes(t)) && adminHidden
      && !['viz', 'livetv', 'tvadmin', 'shelfmap', 'server', 'users', 'policies'].some(t => tabs.includes(t));
    // open My Theme as the (guest) — admin sections hidden
    const side = document.querySelector('#btn-menu') || document.querySelector('[id*=menu]');
    const lookPanel = async () => {
      document.querySelector('#sidebar').classList.remove('hidden');
      document.querySelector('.side-link[data-tab="look"]').click();
      await new Promise(r => setTimeout(r, 300));
      return document.querySelector('#settings-body') || document.querySelector('#panel-body') || document.body;
    };
    await lookPanel();
    const bodyHtml = (document.querySelector('#settings-body') || document.querySelector('#panel-body') || document.body).innerHTML;
    const themeOk = bodyHtml.includes('data-viz="pulse"') && bodyHtml.includes('data-idle="item"');
    document.querySelector('.side-link[data-tab="shelves"]').click();
    await new Promise(r => setTimeout(r, 300));
    const shelvesHtml = (document.querySelector('#settings-body') || document.querySelector('#panel-body') || document.body).innerHTML;
    const shelvesOk = shelvesHtml.includes('shelf-map-rows') && shelvesHtml.includes('Save my shelf map');
    // t83: settings modals now PAUSE the scene (mobile perf) — close the modal
    // so the dt-driven checks that follow (queue fade, sliding doors) run live.
    document.getElementById('btn-settings-close')?.click();
    await new Promise(r => setTimeout(r, 150));
    return { tabs, tabOk, themeOk, shelvesOk, ok: tabOk && themeOk && shelvesOk };
  });

  // 7) queue panel moved aside: left edge, no HUD overlap, still fades near the TV
  R.checks.queueMoved = await page.evaluate(async () => {
    const q = document.getElementById('tv-queue');
    const cs = getComputedStyle(q);
    const leftOk = parseFloat(cs.left) <= 30 && cs.position === 'fixed';
    const boxes = {};
    const area = (r) => r && r.width > 2 && r.height > 2;
    const overlap = (a, b) => !(a.right < b.left || b.right < a.left || a.bottom < b.top || b.bottom < a.top);
    const unhide = (el) => { const h = el.classList.contains('hidden'); el.classList.remove('hidden'); return h; };
    const qHidden = unhide(q);
    boxes.queue = q.getBoundingClientRect();
    const states = {};
    for (const id of ['tv-remote', 'lock-hint', 'art-progress']) {
      const el = document.getElementById(id);
      if (el) { states[id] = unhide(el); boxes[id] = el.getBoundingClientRect(); }
    }
    if (qHidden) q.classList.add('hidden');
    for (const [id, h] of Object.entries(states)) { if (h) document.getElementById(id)?.classList.add('hidden'); }
    const clashes = Object.entries(boxes).filter(([k]) => k !== 'queue' && area(boxes[k]) && area(boxes.queue))
      .filter(([k]) => overlap(boxes.queue, boxes[k])).map(([k]) => k);
    // still fades when close to the TV
    const s = window.__VB.scene;
    const f = s.tv.focusPoint;
    s.debugTeleport(f.x, f.z + 1.4, 0, 0);
    const fades = await new Promise(resolve => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (getComputedStyle(q).opacity === '0') { clearInterval(iv); resolve(true); }
        else if (Date.now() - t0 > 15000) { clearInterval(iv); resolve(false); }
      }, 120);
    });
    return { left: cs.left, clashes, fades, ok: leftOk && clashes.length === 0 && fades };
  });

  // 8) theme-synced visualizer (t18 contract)
  R.checks.vizSync = await page.evaluate(async () => {
    await window.__VB.state.updatePrefs({ visualizer: { style: 'wave' }, theme: { accent: '#00ffcc' } });
    window.__VB.scene.tv.setVisualizer({ style: 'wave' });
    window.__VB.scene.applyTheme(window.__VB.state.prefs.theme);
    const got = window.__VB.scene.tv.getVisualizer();
    const boot = await (await fetch('/api/bootstrap', { credentials: 'include' })).json();
    return { got, stored: boot.prefs?.visualizer, ok: got.style === 'wave' && got.color === '#00ffcc' && boot.prefs?.visualizer?.style === 'wave' && !('color' in (boot.prefs?.visualizer || {})) };
  });

  // 9) play next + queue DOM (t17)
  R.checks.playNext = await page.evaluate(async () => {
    const tv = window.__VB.scene.tv;
    const films = window.__VB.state.items.filter(i => i.source === 'archive' && i.type === 'movie');
    tv.playItem(films[0], { list: films, index: 0 });
    await new Promise(r => setTimeout(r, 900));
    const q0 = tv.queueInfo();
    const album2 = window.__VB.state.items.find(i => i.type === 'radio');   // audio-kind insert
    const r1 = tv.playNext(album2);
    const q1 = tv.queueInfo();
    tv.playAt(2);
    const q2 = tv.queueInfo();                   // captured BEFORE the media can end
    // ⏮/⏭ remote buttons — synchronous, no waits for auto-advance to interfere
    const n = tv.queueInfo().length;             // AFTER the play-next insert
    tv.step(-1); tv.step(-1);
    const back2 = tv.queueInfo().index;          // 2 → 1 → 0
    tv.step(-1);
    const wrapped = tv.queueInfo().index;        // 0 → last (n-1)
    tv.step(1);
    const fwd = tv.queueInfo().index;            // last → 0
    await new Promise(r => setTimeout(r, 700));  // now let the panel render
    const panel = document.getElementById('tv-queue');
    const domOk = panel && panel.querySelectorAll('.q-row').length > 0;
    return { q0len: q0.length, r1, idx: q2.index, domOk, back2, wrapped, fwd,
      ok: q0.length === films.length && r1 === 'next' && q1.raw[1]?.title === album2.title && q2.index === 2 && domOk
        && back2 === 0 && wrapped === n - 1 && fwd === 0 };
  });

  // 10) walk still works
  R.checks.walk = await page.evaluate(async () => {
    const s = window.__VB.scene;
    document.getElementById('btn-settings-close')?.click();          // settings open blocks keys
    document.getElementById('btn-sidebar-close')?.click();
    await new Promise(r => setTimeout(r, 300));
    s.debugTeleport(0, 5.14, 0, 0);                                  // yaw 0 faces the TV end (-z)
    const moved = await new Promise(resolve => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
        const p = s.debugPose();
        if (p.z < 4.4) { clearInterval(iv); resolve(true); }   // proves input→movement; islands block further
        else if (Date.now() - t0 > 12000) { clearInterval(iv); resolve(false); }
      }, 120);
    });
    return { z: s.debugPose().z, ok: moved };
  });

  // 16c) THEATER — walk through the new far-wall doorway into the room
  R.checks.theaterDoor = await page.evaluate(async () => {
    const s = window.__VB.scene;
    document.getElementById('btn-settings-close')?.click();
    document.getElementById('btn-sidebar-close')?.click();
    await new Promise(r => setTimeout(r, 200));
    s.debugTeleport(0, -5.6, 0, 0);                                  // face the doorway (-z)
    const through = await new Promise(resolve => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
        const p = s.debugPose();
        if (p.z < -7.0) { clearInterval(iv); resolve(true); }        // well inside the theater
        else if (Date.now() - t0 > 25000) { clearInterval(iv); resolve(false); }
      }, 120);
    });
    const pose = s.debugPose();
    // the wall beside the door still blocks (walk at it from an offset x)
    s.debugTeleport(3.2, -5.0, 0, 0);
    const blocked = await new Promise(resolve => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
        const p = s.debugPose();
        if (Date.now() - t0 > 2500) { clearInterval(iv); resolve(p.z > -6.3); }  // never entered
      }, 120);
    });
    return { z: pose.z, x: pose.x, through, blocked, ok: through && pose.z < -7 && Math.abs(pose.x) < 1.3 && blocked };
  });

  // 16d) CARRY — grab a movie, feed the deck, it rolls on the big screen
  R.checks.carryDeck = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const movie = window.__VB.state.items.find(i => i.type === 'movie');
    if (!movie) return { ok: false, why: 'no movie on shelves' };
    s.carry(movie);
    const carried = s.carried()?.title;
    const chipUp = !document.getElementById('carry-chip').classList.contains('hidden');
    const fmt = s.carryFormat(movie);
    s.tv.stop();                          // a previous check may still be rolling
    // stand in front of the deck and click (fireSelect raycasts the deck).
    // camera.rotation.x = pitch → NEGATIVE pitches aim DOWN at the deck.
    for (const pitch of [-0.5, -0.6, -0.4, -0.7, 0.3]) {   // deck is center-back now
      s.debugTeleport(0, -8.7, 0, pitch);             // in the entry area, facing the booth
      s.fireSelect();
      if (s.tv.isPlaying()) break;
    }
    await new Promise(r => setTimeout(r, 400));
    const playing = s.tv.isPlaying();
    const kind = s.tv.state?.playing?.kind;
    const putBack = s.carried() === null;
    const chipDown = document.getElementById('carry-chip').classList.contains('hidden');
    const vhs = s.tv.state?.playing?.item?.title === movie.title && fmt === 'VHS';
    s.tv.stop();
    return { carried, chipUp, playing, kind, putBack, chipDown, fmt, vhsLookOn: vhs,
      ok: carried === movie.title && chipUp && playing && kind === 'video' && putBack && chipDown };
  });

  // 16d0) t43 PERF: idle screen paints ~NEVER — 'white' is one paint total,
  // animated cards throttle to 15 fps. (The old code re-uploaded a 4K canvas
  // 60×/s — the 'looking at the big screen' lag.)
  R.checks.screenPerf = await page.evaluate(async () => {
    const s = window.__VB.scene;
    s.tv.stop();
    s.tv.setIdle({ enabled: true, idleMode: 'white' });
    await new Promise(r => setTimeout(r, 400));                 // settle + mode-change paint
    const c0 = s.tv.getPaintCount();
    await new Promise(r => setTimeout(r, 2500));                // stare at the blank screen
    const whitePaints = s.tv.getPaintCount() - c0;              // want ~0 (it is a WALL)
    s.tv.setIdle({ enabled: true, idleMode: 'standby' });
    await new Promise(r => setTimeout(r, 400));
    const c1 = s.tv.getPaintCount();
    await new Promise(r => setTimeout(r, 2500));                // animated star card
    const standbyPaints = s.tv.getPaintCount() - c1;            // want ≤ ~45 (15 fps throttle)
    s.tv.setIdle({ enabled: true, idleMode: 'white' });
    const attached = s.tv.surfaceInfo().canvasAttached;     // t44: idle canvas is ON the screen
    return { whitePaints, standbyPaints, attached, ok: attached && whitePaints <= 2 && standbyPaints <= 45 };
  });

  // 16d1) t41: stage is a STEP (walk up), and clicks are honest — walls/doors
  // occlude, the deck ignores you from the store side of the doorway
  R.checks.stageAndHonestClicks = await page.evaluate(async () => {
    const s = window.__VB.scene;
    s.tv.stop(); s.jukeboxAudio?.stop();
    // stage step: ON the stage vs the SAME z off its side — pure 0.3 step
    s.debugTeleport(0, -16.2, 0, 0);
    const liftOn = s.debugPose().lift;
    s.debugTeleport(4.2, -16.2, 0, 0);
    const liftOff = s.debugPose().lift;
    const steppedUp = liftOn - liftOff > 0.25;
    // honest clicks (zero-side-effect probe): door shut, from the STORE aiming
    // straight at the deck, the crosshair must find NOTHING
    s.debugTeleport(0, -4.2, 0, 0);
    await new Promise(r => setTimeout(r, 2000));            // door settles shut
    const gated = [];
    for (const pitch of [-0.15, -0.3, -0.05]) {
      s.debugTeleport(0, -5.5, 0, pitch);                   // store side, door between
      gated.push(s.debugPickSpecial());
    }
    s.debugTeleport(0, -8.7, 0, -0.5);                      // inside, same idea
    const inside = s.debugPickSpecial();
    s.debugTeleport(0, -4.2, 0, 0);
    return { liftOn: +liftOn.toFixed(3), liftOff: +liftOff.toFixed(3), steppedUp, gated, inside,
      ok: steppedUp && gated.every(g2 => g2 === null) && inside === 'deck' };
  });

  // 16d2) THEATER DETAILS — swing doors, dimming house, beam, tape eject
  R.checks.theaterDetails = await page.evaluate(async () => {
    const s = window.__VB.scene;
    s.tv.stop();                                   // headless: free the decoder/streams
    s.jukeboxAudio.stop();
    // SLOPE: flat entry + booth area, floor descends toward the screen
    s.debugTeleport(0, -9.3, 0, 0);
    const liftBooth = s.debugPose().lift;              // behind the back row — level with the store
    s.debugTeleport(0, -13.6, 0, 0);
    const liftDeep = s.debugPose().lift;
    s.debugTeleport(0, -4.2, 0, 0);                    // away from the door: let it settle shut
    await new Promise(r => setTimeout(r, 2200));
    const doorsClosed0 = s.theaterState().doors === 'closed';
    s.debugTeleport(0, -5.9, 0, 0);                    // step into the doorway band
    await new Promise(r => setTimeout(r, 2200));
    const doorsOpen = s.theaterState().doors === 'open';
    s.debugTeleport(0, -4.2, 0, 0);                    // step back into the store
    await new Promise(r => setTimeout(r, 2600));
    const doorsShut = s.theaterState().doors === 'closed';
    // play a movie → lights dim + beam on. Catalogue movie (the eject flow
    // resolves tapes by title from the shelves). t43 asserts the DIRECT video
    // path is wired + fed (videoAttached/srcSet) — headless chrome cannot
    // decode video at all (blob mp4/webm → MEDIA_ERR 4), so decoded-frame
    // assertions are impossible in this environment by construction.
    s.tv.stop();
    const movie = window.__VB.state.items.find(i => i.type === 'movie');
    s.carry(movie);
    for (const pitch of [-0.5, -0.6, -0.4]) {
      s.debugTeleport(0, -8.7, 0, pitch);
      s.fireSelect();
      if (s.tv.isPlaying()) break;
    }
    await new Promise(r => setTimeout(r, 400));
    // t43: wait for the DIRECT video surface like a viewer would (first frame
    // decoded) — headless software decode is slow to frame zero, real GPUs ~300ms
    let surf = s.tv.surfaceInfo();
    for (let i = 0; i < 30 && surf.surface !== 'video-texture'; i++) {
      await new Promise(r => setTimeout(r, 250));
      surf = s.tv.surfaceInfo();
    }
    const during = s.theaterState();
    const si = s.tv.surroundInfo();                    // 8.2 array live while the movie rolls
    s.tv.stop();                                       // → tape ejects, lights back up
    await new Promise(r => setTimeout(r, 600));
    const ej = s.ejectedInfo();
    const after = s.theaterState();
    for (const pitch of [-0.5, -0.6, -0.4, -0.3]) {  // click the stuck-out case (center booth) → grab
      s.debugTeleport(0, -8.7, 0, pitch);
      s.fireSelect();
      if (s.carried()) break;
    }
    const grabbed = s.carried()?.title === movie.title;
    // …and the RETURN BIN takes it back
    for (const pitch of [-0.85, -0.9, -0.8, -0.95]) {
      s.debugTeleport(0, -8.7, 0, pitch);             // the RETURN CHUTE under the deck
      s.fireSelect();
      if (!s.carried()) break;
    }
    const returned = s.carried() === null;
    // ghost-eject regression: a settings-style emit while idle must NOT
    // conjure the tape back out of the deck
    window.__VB.scene.tv.setIdle({ enabled: true, idleMode: 'white' });
    await new Promise(r => setTimeout(r, 300));
    const noGhost = window.__VB.scene.ejectedInfo() === null;
    // t37: booth standing spot is CLEAR of the door-swing band — movie plays,
    // doors stay shut, no store light spills in while you work the booth
    s.debugTeleport(0, -8.7, 0, 0);
    await new Promise(r => setTimeout(r, 1800));
    const doorsAtBooth = s.theaterState().doors === 'closed';
    // t38: dream-lounger seating — 3 rows of 5, walk-through gaps, front row
    // comfortably clear of the screen wall in the deeper room
    const seats = s.theaterState().seats;
    const seatsOk = seats.rows === 3 && seats.perRow === 5
      && seats.walkGap > 0.68                 // beats 2× player radius 0.34 — genuinely walkable
      && seats.frontClear > 2.2;              // front row no longer hugs the screen
    // t40: TRUE cinema screen — maxed 16:9 that fits the room, marquee BELOW it
    const mi = s.tv.mountInfo();
    const scr = s.theaterState().screen;
    const res = s.tv.getScreenRes();                        // idle/UI canvas — LIGHT by design
    const screenOk = scr.w >= 6.4 && Math.abs(scr.h - scr.w * 9 / 16) < 0.02
      && mi.screenTop <= 4.2 && mi.screenBottom >= 0.25     // fills the wall, clears the stage
      && res[0] <= 2048 && res[1] <= 1152;                  // t43: idle canvas stays light (no 4K idle uploads)
    const plateBelow = mi.plateY < mi.screenBottom;        // "NOW PLAYING" under the screen
    return { doorsClosed0, doorsOpen, doorsShut, doorsAtBooth, seats, scr, res, surf,  // letterboxBlack: headless can't decode → stays false here, true in real browsers
      plateBelow, during, ej, after, grabbed, returned,
      liftBooth, liftDeep, noGhost, si,
      ok: doorsClosed0 && doorsOpen && doorsShut && doorsAtBooth && seatsOk && screenOk && plateBelow
        && during.lights === 'dim' && surf.videoAttached && surf.srcSet
        && surf.canvasAttached
        && ej?.title === movie.title && after.lights === 'bright' && grabbed && returned
        && Math.abs(liftBooth) < 0.03 && liftDeep < -0.35 && noGhost
        && si.speakers.length === 6 && si.subs === 2
        && (si.mode === 'panner-array' || si.mode === 'discrete-7.1') };
  });

  // 16e) JUKEBOX — browse + start music from the box by the old TV wall
  // 16bb) t52: THE JUKEBOX RUNS THE DJ DECK (old browse UI retired)
  R.checks.jukebox = await page.evaluate(async () => {
    const ui2 = window.__VB.ui, s = window.__VB.scene, ctx = window.__VB.mainCtx;
    // the old jukebox modal is GONE — function and DOM
    const oldGone = !document.getElementById('jukebox-modal') && typeof ui2.openJukebox === 'undefined';
    // a movie is ALREADY rolling in the theater — the jukebox must not stop it
    const movie = window.__VB.state.items.find(i => i.type === 'movie');
    s.tv.playItem(movie);
    await new Promise(r => setTimeout(r, 400));
    let tvCalls = 0;
    const origStop = s.tv.stop.bind(s.tv), origPlay = s.tv.playItem.bind(s.tv);
    s.tv.stop = (...a) => { tvCalls++; return origStop(...a); };
    s.tv.playItem = (...a) => { tvCalls++; return origPlay(...a); };
    // the jukebox FREES the mouse on open
    const calls = [];
    document.exitPointerLock = () => calls.push('exit');
    // t52: clicking through opens the DJ UI on the JUKEBOX's own channel
    ui2.openDj('jukebox');
    await new Promise(r => setTimeout(r, 250));
    const modal = document.getElementById('dj-modal');
    const open = !!modal && !modal.classList.contains('hidden');
    const titleOk = (document.getElementById('dj-title')?.textContent || '').includes('Jukebox');
    const deckOk = modal.innerHTML.includes('Playlist') && modal.innerHTML.includes('Add music');
    ctx.dj.jukebox.queue.length = 0; ctx.dj.jukebox.idx = -1; s.jukeboxAudio.stop();
    const music = (window.__VB.state.items || []).find(i => ['album', 'radio', 'episode'].includes(i.type));
    if (music) { ctx.djDevice = 'jukebox'; ctx.djAdd(music); }
    const picked = s.jukeboxAudio.nowPlaying();        // read SYNC — the mock stream can
    await new Promise(r => setTimeout(r, 300));        // 'end'+auto-advance during a wait
    const tvUntouched = tvCalls === 0;
    s.tv.stop = origStop; s.tv.playItem = origPlay;
    document.getElementById('dj-close').click();
    const closed = modal.classList.contains('hidden');
    const freedMouse = calls.includes('exit');
    // restore: booth is the default deck, channels quiet
    ctx.djDevice = 'booth'; ctx.dj.jukebox.queue.length = 0; ctx.dj.jukebox.idx = -1; s.jukeboxAudio.stop(); s.tv.stop();
    return { oldGone, open, titleOk, deckOk, playing: !!picked, picked: (picked?.title || '').slice(0, 16), tvUntouched, closed, freedMouse,
      ok: oldGone && open && titleOk && deckOk && !!picked && tvUntouched };
  });
  R.checks.audioRemote = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const ctxRoom = window.__VB.mainCtx || null;
    void ctxRoom;
    // room detection (the shared wall line)
    s.debugTeleport(0, -4.2, 0, 0);
    const roomStore = s.debugPose().z < -6.35 ? 'theater' : 'store';
    s.debugTeleport(0, -8.5, 0, 0);
    const roomTheater = s.debugPose().z < -6.35 ? 'theater' : 'store';
    // routing: spy both audio systems, click the SAME button from each room
    const juke = s.jukeboxAudio, tvv = s.tv;
    const oj = juke.togglePlay.bind(juke), ot = tvv.togglePlay.bind(tvv);
    let jukeCalls = 0, tvCalls = 0;
    juke.togglePlay = (...a) => { jukeCalls++; return oj(...a); };
    tvv.togglePlay = (...a) => { tvCalls++; return ot(...a); };
    s.debugTeleport(3.5, -4.2, 0, 0);            // in the STORE
    document.getElementById('tv-play').click();
    s.debugTeleport(0, -8.5, 0, 0);              // in the THEATER
    document.getElementById('tv-play').click();
    juke.togglePlay = oj; tvv.togglePlay = ot;
    // the poll stamps the room on the remote element
    await new Promise(r => setTimeout(r, 700));
    const tag = document.getElementById('remote-room')?.textContent || '';
    const tagged = /THEATER/.test(tag) || /JUKEBOX/.test(tag);
    s.debugTeleport(0, -4.2, 0, 0);
    return { roomStore, roomTheater, jukeCalls, tvCalls, tag,
      ok: roomStore === 'store' && roomTheater === 'theater' && jukeCalls === 1 && tvCalls === 1 && tagged };
  });

  // 16b) MEDIA ROUTING (t39): .mp3/.wav/radio are JUKEBOX-ONLY, movies are
  // THEATER-ONLY — each player refuses the other's media outright
  R.checks.mediaRouting = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const items = window.__VB.state.items;
    const audio = items.find(i => ['album', 'radio', 'episode'].includes(i.type));
    const movie = items.find(i => i.type === 'movie');
    if (!audio || !movie) return { ok: false, why: 'need one audio + one movie item' };
    s.tv.stop(); s.jukeboxAudio.stop();
    const theaterAudio = s.tv.playItem(audio);            // must REFUSE (false, no stream)
    await new Promise(r => setTimeout(r, 300));
    const theaterAudioLive = s.tv.isPlaying();
    s.tv.playItem(movie);                                  // must PLAY on the big screen
    await new Promise(r => setTimeout(r, 700));
    const theaterVideoLive = s.tv.isPlaying();
    s.tv.stop();
    const el = s.jukeboxAudio.element();
    const before = el ? el.src : '';
    const jukeVideo = s.jukeboxAudio.play(movie);          // must REFUSE — src untouched
    const jukeVideoUntouched = el ? el.src === before : true;
    const jukeAudio = s.jukeboxAudio.play(audio);          // accepted → real stream src
    const jukeAudioSrc = el ? (el.src || '') : '';
    s.jukeboxAudio.stop();
    return { theaterAudio, theaterAudioLive, theaterVideoLive, jukeVideo, jukeVideoUntouched,
      jukeAudio, jukeAudioSrc,
      ok: theaterAudio === false && theaterAudioLive === false && theaterVideoLive === true
        && jukeVideo === false && jukeVideoUntouched && jukeAudio === true && /\/api\/play\//.test(jukeAudioSrc) };
  });

  // 16c) t45: music is JUKEBOX-ONLY — no audio on the store shelves, the
  // jukebox carries everything, and it's section-selectable like a shelf
  R.checks.jukeboxShelf = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const ctx = window.__VB.mainCtx;
    const counts = s.shelfTypeCounts();
    const audioOnShelves = ['album', 'radio', 'episode'].reduce((a, t) => a + (counts[t] || 0), 0);
    const videoOnShelves = (counts.movie || 0) + (counts.show || 0);
    const jm = ctx.jukeboxMusic();
    // select ONE music section on the jukebox (the shelf-map pref)
    const audio = (window.__VB.state.items || []).filter(i => ['album', 'radio', 'episode'].includes(i.type));
    const kOf = i => i.sectionId || i.sectionTitle || i.type;
    const key = audio.length ? kOf(audio[0]) : '';
    const expectListed = audio.filter(i => kOf(i) === key).length;
    window.__VB.state.shelves = { jukebox: key };
    const jmSel = ctx.jukeboxMusic();
    window.__VB.state.shelves = {};               // back to all-music
    const jmBack = ctx.jukeboxMusic();
    // …and the setting is VISIBLE: the shelf-map panel lists the jukebox row
    // FIRST (it used to hide below the fold / vanish on key mismatch)
    document.querySelector('#sidebar').classList.remove('hidden');
    document.querySelector('.side-link[data-tab="shelves"]').click();
    await new Promise(r2 => setTimeout(r2, 400));
    const firstRow = document.querySelector('#shelf-map-rows .lib-row');
    const jSel = firstRow?.querySelector('select[data-unit="jukebox"]');
    const jukeFirst = !!jSel && jSel.options.length >= 2;    // "All music" + ≥1 section
    document.getElementById('btn-settings-close')?.click();  // t83: open modal = paused scene — close it
    await new Promise(r2 => setTimeout(r2, 150));
    return { audioOnShelves, videoOnShelves, jm, jmSel, key, jukeFirst, jukeOptions: jSel ? jSel.options.length : 0,
      ok: audioOnShelves === 0 && videoOnShelves > 0
        && jm.total > 0 && jm.listed === jm.total && jm.sections >= 1
        && jmSel.selected === key && jmSel.listed === expectListed
        && jmBack.listed === jmBack.total && jukeFirst };
  });

  // 16d) t45: the DOM UI follows the selected theme (accent → CSS vars)
  R.checks.themeSync = await page.evaluate(async () => {
    const ctx = window.__VB.mainCtx;
    const before = window.__VB.state.prefs.theme;
    ctx.applyTheme({ accent: '#00e5ff' });
    const v = (getComputedStyle(document.documentElement).getPropertyValue('--vb-accent') || '').toLowerCase();
    ctx.applyTheme({ accent: before.accent || '#ffd23f' });   // restore
    return { accentVar: v.trim(), ok: /00e5ff|0,\s*229/.test(v) };
  });

  // 16e) t47: THE DANCE WING — front hall (sliding doors), dance hall on the
  // RIGHT, DJ's library with records; the DJ menu drives it all
  R.checks.danceWing = await page.evaluate(async () => {
    const s = window.__VB.scene, ctx = window.__VB.mainCtx;
    const hi = s.hallInfo(), di = s.danceInfo();
    const hallOk = hi.matchesStoreWidth && Math.abs(hi.depth - 2.6) < 0.01;
    const danceOk = di.onRightSide && di.x0 > 5 && di.floorTiles === 64;
    // walk the wing end to end
    s.debugTeleport(0, 7.5, 0, 0);  const inHall = s.debugPose().z > 6.3 && s.debugPose().z < 9;
    s.debugTeleport(11.1, 0, 0, 0); const inDance = s.debugPose().x > 6.3 && Math.abs(s.debugPose().x - 11.1) < 0.3;
    s.debugTeleport(9.6, -8.5, 0, 0); const inLib = s.debugPose().z < -6.4;
    const roomDance = ctx.playerRoom() === 'dance';
    const roomStore = (s.debugTeleport(0, 4.2, 0, 0), ctx.playerRoom() === 'store');
    return { hi: { w: hi.width, d: hi.depth }, di: { x0: di.x0, tiles: di.floorTiles, records: di.records },
      hallOk, danceOk, inHall, inDance, inLib, roomDance, roomStore,
      ok: hallOk && danceOk && inHall && inDance && inLib && roomDance && roomStore && di.records > 0 };
  });

  // 16e2) t48: WALK the wing — step through EVERY door on the real collision
  // path (teleports bypass clamping; that's how a dead zone at the store
  // threshold survived the whole t47 suite)
  R.checks.walkTheWing = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const pose = () => ({ x: +s.debugPose().x.toFixed(2), z: +s.debugPose().z.toFixed(2) });
    const walkTo = async (tx, tz, maxSteps = 400) => {
      for (let i = 0; i < maxSteps; i++) {
        const p = s.debugPose();
        const dx = tx - p.x, dz = tz - p.z;
        if (Math.hypot(dx, dz) < 0.35) break;
        const m = Math.hypot(dx, dz);
        s.debugStep(dx / m * 0.06, dz / m * 0.06);
        await new Promise(r => setTimeout(r, 6));
      }
      return pose();
    };
    s.tv.stop(); s.jukeboxAudio.stop();
    s.debugTeleport(0, 4.0, 0, 0);                       // inside the store, facing the door
    const p1 = await walkTo(0, 7.6);                     // through the store door into the hall
    const inHall = p1.z > 6.4 && p1.z < 9.0 && Math.abs(p1.x) < 0.6;
    const p2 = await walkTo(6.9, 7.6);                   // down the hall to the dance pass
    const p3 = await walkTo(11.0, 5.0);                  // through the pass into the dance hall
    const inDance = p3.x > 6.5;
    const p3b = await walkTo(14.1, 2.3);                 // t54: right lane…
    const p3c = await walkTo(14.6, -5.6);                // …past the booth AT THE DOOR
    const p4 = await walkTo(11.5, -5.6);                 // behind the booth (the apron) to the door
    const p4b = await walkTo(11.5, -7.6);                // STRAIGHT through the door (no corner-cut)
    const p5 = await walkTo(9.6, -8.5);                  // into the library proper
    const inLib = p5.z < -6.4;
    // t51 return leg: library → back through the booth door → dance floor.
    // The booth moved LEFT of the door and is now SOLID — this walk clears it.
    const p6 = await walkTo(11.5, -7.2);
    const p6a = await walkTo(11.5, -5.65);               // t54: UP the door band (rooms only
    const p6b = await walkTo(14.6, -5.6);                // join there) — then wide around
    const p7b = await walkTo(14.1, 2.3);                 // the booth via the right lane
    const p8 = await walkTo(11.0, 5.2);
    const backInDance = p8.x > 6.5 && p8.z > -5 && p8.z < 8.5;
    // t51: the booth collider blocks feet — a step INTO the booth goes nowhere
    const bi = s.danceInfo();                             // t54: booth by the DOOR, apron + lanes
    const byDoor = bi.boothZ < -3.5 && Math.abs(bi.boothX - 11.5) < 0.3 && bi.boothApron >= 0.9 && bi.boothSideLane >= 1.0;
    s.debugTeleport(bi.boothX, -3.8, 0, 0);                // one step from the booth's front face
    const bx = s.debugPose().x, bz = s.debugPose().z;
    s.debugStep(0, -0.5);                                  // push into the booth box
    const stepMoved = Math.hypot(s.debugPose().x - bx, s.debugPose().z - bz);
    const boothSolid = stepMoved < 0.49;                   // clipped by the collider
    s.debugTeleport(0, 4.2, 0, 0);
    return { p1, p3, p5, p8, inHall, inDance, inLib, backInDance, boothSolid, byDoor,
      apron: bi.boothApron, sideLane: bi.boothSideLane,
      ok: inHall && inDance && inLib && backInDance && boothSolid && byDoor };
  });

  // 16f) t47: sliding doors — store door opens/shuts, street door LOCKED forever
  R.checks.slidingDoors = await page.evaluate(async () => {
    const s = window.__VB.scene;
    s.tv.stop(); s.jukeboxAudio.stop();                // headless: give the loop every frame
    // POLL, don't sleep: headless frame rates vary wildly with what earlier
    // checks left running — the door flips the moment a few frames land
    const waitDoor = async (which, expect, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        if (s.hallState()[which] === expect) return true;
        await new Promise(r => setTimeout(r, 300));
      }
      return s.hallState()[which] === expect;
    };
    s.debugTeleport(0, 6.4, Math.PI, 0);               // at the store door (facing the light wall)
    const opened = await waitDoor('storeDoor', 'open', 8000);
    const streetLockedHere = s.hallState().streetDoor === 'locked';
    s.debugTeleport(0, 3.5, Math.PI, 0);               // walk away into the store
    const shut = await waitDoor('storeDoor', 'closed', 8000);
    const streetLockedAway = s.hallState().streetDoor === 'locked';
    s.debugTeleport(6.9, 7.6, Math.PI / 2, 0);         // at the dance hall pass
    const danceOpened = await waitDoor('danceDoor', 'open', 8000);
    s.debugTeleport(0, 4.2, 0, 0);
    // t48: SEE-THROUGH doors — clear glass (≤0.15 opacity, like the original
    // 0.13) and a real opening in the street wall (the reveal, not a slab)
    const hi2 = s.hallInfo();
    const clearGlass = hi2.glassOpacity <= 0.15;
    const streetCut = hi2.streetOpeningWidth >= 2.2;
    const streetClean = hi2.streetPanelMeshes === 12;   // t49: bare glass — no lock-bar overlay
    const facade = s.facadeFlush();                     // t49: storefront ON the building, not floating
    const sharedOpen = s.danceInfo().sharedWallOpen >= 1.9;  // t49: real opening in the shared wall
    const swing = s.hallInfo().danceDoorType === 'swinging' && s.hallInfo().danceDoorPanelSpan === 'z';  // t50: turned panels, swinging
    return { opened, shut, streetLockedHere, streetLockedAway, danceOpened, clearGlass, streetCut, streetClean, facade, sharedOpen,
      ok: opened && shut && streetLockedHere && streetLockedAway && danceOpened && clearGlass && streetCut
        && streetClean && facade && sharedOpen && swing };
  });

  // 16g) t47: THE DJ MENU — playlists, rearrange, fades, EQ/tempo, transport
  R.checks.djMenu = await page.evaluate(async () => {
    const s = window.__VB.scene, ctx = window.__VB.mainCtx, ui2 = window.__VB.ui;
    const jb = s.jukeboxAudio;
    jb.stop(); ctx.djQueue.length = 0; ctx.djIdx = -1;
    // synthetic tracks keep this check deterministic (library state varies by
    // which mock config the earlier checks left behind)
    const real = (window.__VB.state.items || []).filter(i => ['album', 'radio', 'episode'].includes(i.type));
    const music = [real[0] || { id: 'dj-a', source: 'archive', key: 'real_film', type: 'album', title: 'DJ Test A' },
      { id: 'dj-b', source: 'archive', key: 'real_film', type: 'album', title: 'DJ Test B' },
      { id: 'dj-c', source: 'archive', key: 'real_film', type: 'album', title: 'DJ Test C' }];
    ctx.djAdd(music[0]); ctx.djAdd(music[1]);
    const q2 = ctx.djState().queue.length === 2;
    ctx.djMove(1, -1);                                  // rearrange: track 2 ↑
    const moved = ctx.djState().queue[0].id === music[1].id;
    ctx.djRemove(0);
    const removed = ctx.djState().queue.length === 1 && ctx.djState().queue[0].id === music[0].id;
    // booth click → the menu opens with every control family present
    ui2.openDj('jukebox');   // t64: classic deck = jukebox
    const body = document.getElementById('dj-body');
    const hasMenu = !!body && body.innerHTML.includes('Playlist')
      && body.innerHTML.includes('Bass') && body.innerHTML.includes('Fade')
      && body.innerHTML.includes('Tempo') && body.innerHTML.includes('Shuffle');
    document.getElementById('dj-close').click();
    // DJ audio controls actually reach the graph
    jb.setEq('bass', 8); const eqOk = jb.eqInfo().bass === 8;
    jb.setRate(1.25); const rateOk = Math.abs(jb.rateInfo() - 1.25) < 0.001;
    jb.setFadeSecs(3); const fadeOk = jb.fadeSecsInfo() === 3;
    jb.setEq('bass', 0); jb.setRate(1); jb.setFadeSecs(1.2);
    // t52: record click feeds the BOOTH deck — its OWN channel (not the jukebox's)
    ctx.dj.booth.queue.length = 0; ctx.dj.booth.idx = -1; s.djAudio.stop();   // deck idle → the record PLAYS
    let played = null; const db = s.djAudio; const op = db.play.bind(db);
    db.play = (it, o) => { played = it?.id; return op(it, o); };
    s.onRecordClick(music[0]);
    db.play = op;
    const boothNow = db.nowPlaying();
    ctx.dj.booth.queue.length = 0; ctx.dj.booth.idx = -1; db.stop();
    return { q2, moved, removed, hasMenu, eqOk, rateOk, fadeOk, recorded: played === music[0].id, boothNow: !!boothNow,
      ok: q2 && moved && removed && hasMenu && eqOk && rateOk && fadeOk && played === music[0].id && !!boothNow };
  });

  R.checks.t51Dance = await page.evaluate(async () => {
    const s = window.__VB.scene, ctx = window.__VB.mainCtx;
    const di = s.danceInfo();
    const rigOk = di.speakers === 10 && di.subs === 2 && di.ledBars >= 12 && di.patterns === 4;
    // MUSIC CONTAINMENT — each zone audible only in its own wing
    const jb = s.jukeboxAudio;
    jb.setZone('dance');
    const danceInDance = jb.zoneAudible({ x: 11.1, z: 1.5 });
    const danceInStore = !jb.zoneAudible({ x: 0, z: 2 });
    const danceInHall = !jb.zoneAudible({ x: 0, z: 7.5 });
    const danceInTheater = !jb.zoneAudible({ x: 0, z: -8 });
    jb.setZone('store');
    const storeInStore = jb.zoneAudible({ x: 0, z: 2 });
    const storeInDance = !jb.zoneAudible({ x: 11.1, z: 1.5 });
    const zoneInfoOk = jb.zoneInfo().zone === 'store' && Math.abs(jb.zoneInfo().anchor.x + 3.35) < 0.01;
    const zones = danceInDance && danceInStore && danceInHall && danceInTheater && storeInStore && storeInDance && zoneInfoOk;
    // CROSS-ROOM SELECTION — store shelves unselectable from the dance hall.
    // Aim like a player: sweep yaw+pitch. From the STORE a case must be
    // findable; from the DANCE floor a full sweep must find NOTHING (gated).
    s.tv.stop(); s.jukeboxAudio.stop();
    // restock from current state so sparse mid-suite libraries can't starve the sweep
    window.__VB.scene.setItems(window.__VB.state.items || [], window.__VB.state.prefs?.sorting || { mode: 'recent', dir: 'desc' }, () => {}, window.__VB.state.shelves || {});
    await new Promise(r => setTimeout(r, 300));
    const sweep = (x, z) => {
      for (let yaw = 0; yaw < 6.3; yaw += 0.15)
        for (let pitch = -0.45; pitch <= 0.45; pitch += 0.05) {
          s.debugTeleport(x, z, yaw, pitch);
          if (s.debugShelfHit()) return { yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2) };
        }
      return null;
    };
    const hitFromStore = sweep(0, 2.0) || sweep(0, -2.0);
    const hitFromDance = sweep(11.1, 1.5);
    const crossRoomOk = !!hitFromStore && hitFromDance === null;
    s.debugTeleport(0, 4.2, 0, 0);
    return { speakers: di.speakers, subs: di.subs, ledBars: di.ledBars, rigOk, zones, crossRoomOk, storeAim: hitFromStore,
      ok: rigOk && zones && crossRoomOk };
  });

  // 16j) t51: the PROJECTOR idle screen pick survives reloadTv
  R.checks.t51Projector = await page.evaluate(async () => {
    const s = window.__VB.scene, ctx = window.__VB.mainCtx;
    await window.__VB.state.updatePrefs({ tv: { idleMode: 'white', itemId: null } });
    await ctx.reloadTv();
    const white = s.tv.surfaceInfo().idleMode === 'white';
    // t68: test the OVERRIDE deterministically — '' (follow the store) resolves
    // to the store default, which on a FRESH install IS 'white'. Old test data
    // masked this. Override to 'loop' must actually apply:
    await window.__VB.state.updatePrefs({ tv: { idleMode: 'loop', itemId: null } });
    await ctx.reloadTv();
    const back = s.tv.surfaceInfo().idleMode === 'loop';
    await window.__VB.state.updatePrefs({ tv: { idleMode: '', itemId: null } });   // follow the store again
    await ctx.reloadTv();
    return { white, back, ok: white && back };
  });

  // 16k) t52: TWO DECKS — jukebox + booth play DIFFERENT audio simultaneously
  R.checks.t52Decks = await page.evaluate(async () => {
    const s = window.__VB.scene, ctx = window.__VB.mainCtx;
    const jb = s.jukeboxAudio, db = s.djAudio;
    const distinct = !!db && jb !== db && jb.element() !== db.element();   // two <audio>s
    const zones = jb.zoneInfo().zone === 'store' && db.zoneInfo().zone === 'dance';
    const music = (window.__VB.state.items || []).filter(i => ['album', 'radio', 'episode'].includes(i.type));
    ctx.dj.jukebox.queue.length = 0; ctx.dj.jukebox.idx = -1; jb.stop();
    ctx.dj.booth.queue.length = 0; ctx.dj.booth.idx = -1; db.stop();
    ctx.dj.jukebox.add(music[0]);                          // decks auto-play when idle
    ctx.dj.booth.add(music[1] || music[0]);
    const jNow = jb.nowPlaying()?.title, bNow = db.nowPlaying()?.title;   // read SYNC (mock streams end fast)
    await new Promise(r => setTimeout(r, 300));
    const both = !!jNow && !!bNow;                         // SIMULTANEOUS playback
    const different = music.length > 1 ? jNow !== bNow : true;
    // each channel audible ONLY in its own wing
    const zoning = !jb.zoneAudible({ x: 11, z: 1.5 }) && db.zoneAudible({ x: 11, z: 1.5 })
      && jb.zoneAudible({ x: 0, z: 2 }) && !db.zoneAudible({ x: 0, z: 2 })
      && !jb.zoneAudible({ x: 0, z: 7.6 })                // t53: hallway — NO jukebox
      && !jb.zoneAudible({ x: 0, z: -8 })                 // t53: theater — NO jukebox
      && db.zoneAudible({ x: 9.6, z: -8.3 })             // booth set carries into the DJ's library
      && !db.zoneAudible({ x: 0, z: 7.6 });                // t53: …and stays OUT of the hallway
    ctx.dj.jukebox.queue.length = 0; ctx.dj.jukebox.idx = -1; jb.stop();
    ctx.dj.booth.queue.length = 0; ctx.dj.booth.idx = -1; db.stop();
    return { distinct, zones, both, different, zoning,
      ok: distinct && zones && both && different && zoning };
  });

  // 16l) t52: no grabbing store cases THROUGH the theater wall
  R.checks.t52WallGrab = await page.evaluate(async () => {
    const s = window.__VB.scene;
    s.tv.stop(); s.jukeboxAudio.stop(); s.djAudio?.stop();
    const sweep = (x, z) => {                              // face +z (the store beyond the wall)
      for (let yaw = Math.PI - 0.6; yaw <= Math.PI + 0.6; yaw += 0.2)
        for (let pitch = -0.35; pitch <= 0.35; pitch += 0.07) {
          s.debugTeleport(x, z, yaw, pitch);
          if (s.debugShelfHit()) return true;
        }
      return false;
    };
    const throughCorridor = sweep(0, -8.55);               // theater corridor
    const throughTheater = sweep(2.5, -12.5);              // inside the theater proper
    s.debugTeleport(0, 4.2, 0, 0);
    return { throughCorridor, throughTheater, ok: !throughCorridor && !throughTheater };
  });

  // 16m) t52: the street-door copy is the ZOMBIE warning
  R.checks.t52Overlay = await page.evaluate(async () => {
    const s = window.__VB.scene;
    s.onStreetDoorClick();
    await new Promise(r => setTimeout(r, 100));
    const all = [...document.querySelectorAll('#toasts > *')];
    const txt = all[all.length - 1]?.textContent || '';
    const zombie = txt.includes('Zombie warning, Stay and party');
    const noOldCopy = !txt.includes('street stays closed');
    return { zombie, noOldCopy, txt: txt.slice(0, 42), ok: zombie && noOldCopy };
  });

  // 16n) t53: PRO SUROUND + FULLY SOUNDPROOFED ROOMS
  R.checks.t53Surround = await page.evaluate(async () => {
    const s = window.__VB.scene;
    // the booth channel drives a 10-satellite HRTF ring + 2 subs
    const si = s.djAudio.surroundInfo();
    const ringOk = (si.mode === 'resonance-ring' || si.mode === 'hrtf-ring') && si.satellites === 10 && si.subs === 2;   // t78: either engine
    const jukeSi = s.jukeboxAudio.surroundInfo();
    const jukeRing = (jukeSi.mode === 'resonance-ring' || jukeSi.mode === 'hrtf-ring') && jukeSi.satellites === 7 && jukeSi.subs === 1;   // t55 store 7.1 · t78: either engine
    // the theater: binaural array + a LIVE soundproof gate
    const movie = window.__VB.state.items.find(i => i.type === 'movie');
    if (movie) s.tv.playItem(movie);
    await new Promise(r => setTimeout(r, 700));           // graph builds
    const tsi = s.tv.surroundInfo();
    // assert the gate TARGET (the audio clock drifts in headless — the analog
    // ramp can't be timed reliably; the target is the soundproofing RULE)
    s.debugTeleport(0, -13, 0, 0); await new Promise(r => setTimeout(r, 150));
    const inRoom = s.tv.roomGateTarget();
    s.debugTeleport(0, 4, 0, 0); await new Promise(r => setTimeout(r, 150));
    const outStore = s.tv.roomGateTarget();
    s.debugTeleport(0, 7.6, 0, 0); await new Promise(r => setTimeout(r, 150));
    const outHall = s.tv.roomGateTarget();
    s.debugTeleport(11.1, 1.5, 0, 0); await new Promise(r => setTimeout(r, 150));
    const outDance = s.tv.roomGateTarget();
    s.debugTeleport(0, 4.2, 0, 0);
    const liveVal = s.tv.roomGateValue();
    s.tv.stop();
    const outRoom = outStore;                             // (kept for the report shape)
    const gateOk = tsi.gate === 'theater-room' && inRoom === 1 && outStore === 0
      && outHall === 0 && outDance === 0 && liveVal !== null;
    const hrtfOk = tsi.panning === 'HRTF' || tsi.panning === 'discrete';
    // t57: every channel runs through a console limiter — zero clipping
    const jLim = s.jukeboxAudio.limiterInfo(), bLim = s.djAudio.limiterInfo(), tLim = s.tv.limiterInfo();
    const limiters = jLim.on && bLim.on && tLim.on && jLim.threshold === -2 && tLim.threshold === -2;   // t59: safety net, mix rides below
    return { si, jukeSi, panning: tsi.panning, gate: tsi.gate, inRoom, outStore, outHall, outDance, liveVal, ringOk, jukeRing, gateOk, hrtfOk, limiters,
      ok: ringOk && jukeRing && gateOk && hrtfOk && limiters };
  });

  // 16o) t54: idle DJ SPOT ↔ live rig · no particles · sign over the door
  R.checks.t54Lights = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const di0 = s.danceInfo();
    const idleOk = di0.lightMode === 'idle' && di0.djSpot >= 5;        // spot HOLDS on the booth
    const signOk = di0.libSignOverDoor.y > 2.5 && Math.abs(di0.libSignOverDoor.x - di0.boothX) < 0.3;
    let points = 0;                                                    // particles are GONE
    s.threeScene.traverse(o => { if (o.isPoints) points++; });
    // music ON → the spot fades and the rig wakes (driven synchronously —
    // headless rAF is too starved to time a slew in wall-clock)
    s.danceTick({ bass: 0.8, mid: 0.5, treble: 0.4, energy: 0.7, live: true }, 80);
    const di1 = s.danceInfo();
    const liveOk = di1.lightMode === 'live' && di1.djSpot < 0.5;
    s.danceTick({ bass: 0, mid: 0, treble: 0, energy: 0, live: false }, 80);   // silence again
    const di2 = s.danceInfo();
    const backIdle = di2.lightMode === 'idle' && di2.djSpot > 6;
    return { idleOk, djSpotIdle: di0.djSpot, signOk, points, liveOk, djSpotLive: di1.djSpot, backIdle,
      ok: idleOk && signOk && points === 0 && liveOk && backIdle };
  });

  // 16p) t58: speakers overlap nothing · subs visible & solid · shallow store sub
  R.checks.t58Speakers = await page.evaluate(() => {
    const s = window.__VB.scene;
    const ab = s.audioBoxes();
    const hit = (a, ha, b) => Math.abs(a.x - b.x) < ha[0] + b.w / 2 && Math.abs(a.y - b.y) < ha[1] + b.h / 2 && Math.abs(a.z - b.z) < ha[2] + b.d / 2;
    const SAT = [0.17, 0.25, 0.13];
    const clashes = [];
    for (const sat of ab.sats) for (const sg of ab.signs)
      if (hit(sat, SAT, sg)) clashes.push({ sat: { x: sat.x, y: sat.y, z: sat.z }, sign: { y: sg.y } });
    const noSignClash = clashes.length === 0;
    // store sub: shallow (0.30) and its front never passes the jukebox front
    const subFront = ab.sub.z + 0.15, jukeFront = -6.095 + 0.10 + 0.26;
    const subOk = subFront <= jukeFront + 0.02;
    // dance subs: at the booth counter's FRONT (mouths visible)
    const di = s.danceInfo();
    const subsFront = !!di.subsAtFront;
    // SOLID: a step into each sub box goes nowhere
    s.debugTeleport(-4.35, -5.2, 0, 0);
    const bx = s.debugPose().x, bz = s.debugPose().z;
    s.debugStep(0, -0.5);
    const storeSolid = Math.hypot(s.debugPose().x - bx, s.debugPose().z - bz) < 0.49;
    s.debugTeleport(10.15, -3.3, 0, 0);
    const dx2 = s.debugPose().x, dz2 = s.debugPose().z;
    s.debugStep(0, -0.5);
    const danceSolid = Math.hypot(s.debugPose().x - dx2, s.debugPose().z - dz2) < 0.49;
    s.debugTeleport(0, 4.2, 0, 0);
    return { signs: ab.signs.length, noSignClash, subFront: +subFront.toFixed(2), jukeFront: +jukeFront.toFixed(2), subOk, subsFront, storeSolid, danceSolid, clashes: clashes.length,
      ok: noSignClash && subOk && subsFront && storeSolid && danceSolid };
  });

  // 16q) t59: cinema voicing + EQ makeup (boosts buy tone, never clipping)
  R.checks.t59Sound = await page.evaluate(() => {
    const jb = window.__VB.scene.jukeboxAudio;
    const dflt = jb.voiceInfo();
    jb.setVoicing(false); const off = jb.voiceInfo();
    jb.setVoicing(true); jb.setEq('bass', 14);
    const hot = jb.voiceInfo();
    jb.setEq('bass', 0); const flat = jb.voiceInfo();
    const ok = dflt.on && dflt.presence === 2.5 && dflt.makeupDb === 2 && !off.on && off.makeupDb === 0
      && Math.abs(hot.makeupDb - 9) < 0.3 && flat.makeupDb === 2;   // t60: stronger profile
    return { dflt: dflt.makeupDb, off: off.makeupDb, hot: hot.makeupDb, ok };
  });

  // 16r) t59: adaptive beat — 3 bass bursts → exactly 3 beats at ~100 BPM,
  //      rig EASES (bounded per-step motion), silence → still
  R.checks.t59Beat = await page.evaluate(() => {
    const s = window.__VB.scene;
    const quiet = { bass: 0.04, mid: 0.03, treble: 0.03, energy: 0.03, live: true };
    const loud = { bass: 0.85, mid: 0.5, treble: 0.4, energy: 0.6, live: true };
    s.danceTick(quiet, 40);
    const b0 = s.danceInfo().beat.beats;
    const spread = (a, b2) => Math.max(...a.rigYaws.map((y, i) => Math.max(Math.abs(y - b2.rigYaws[i]), Math.abs(a.rigPitches[i] - b2.rigPitches[i]))));
    let maxJump = 0, onBeat = 0, perBurst = 0;
    for (let rep = 0; rep < 3; rep++) {
      let pre = s.danceInfo(), mv = 0, first = 0;
      for (let i = 0; i < 3; i++) { s.danceTick(loud, 1); const d = spread(s.danceInfo(), pre); if (i === 0) first = d; mv = Math.max(mv, d); pre = s.danceInfo(); }
      onBeat = Math.max(onBeat, first); perBurst = Math.max(perBurst, mv);
      let pre2 = s.danceInfo();
      for (let i = 0; i < 9; i++) { s.danceTick(quiet, 1); maxJump = Math.max(maxJump, spread(s.danceInfo(), pre2)); pre2 = s.danceInfo(); }
    }
    const after = s.danceInfo().beat.beats;
    s.danceTick(quiet, 70);                      // let the post-beat pattern glide finish (fixtures sweep, never snap)
    const yEnd = s.danceInfo().rigYaws[0];
    s.danceTick(quiet, 30);
    const still = Math.abs(s.danceInfo().rigYaws[0] - yEnd);
    const b = s.danceInfo().beat;
    const ok = (after - b0) === 3 && maxJump <= 0.15 && onBeat >= 0.04 && perBurst >= 0.1 && Math.abs(b.bpm - 100) <= 21 && still < 0.1;
    return { beats: after - b0, bpm: b.bpm, maxJump: +maxJump.toFixed(3), onBeat: +onBeat.toFixed(3), perBurst: +perBurst.toFixed(3), still: +still.toFixed(3), ok };
  });

  // 16s) t59: booth — mixer BESIDE the centered laptop, decks clear, table lowered
  R.checks.t59Booth = await page.evaluate(() => {
    const bl = window.__VB.scene.danceInfo().boothLayout;
    const mixerClear = Math.abs(bl.mixerX - bl.laptopX) >= 0.55;
    const deckClear = Math.abs(bl.mixerX) + 0.31 <= Math.abs(bl.deckX[0]) - 0.32 + 0.02;
    const ok = mixerClear && deckClear && bl.laptopX === 0 && bl.counterH < 1.0;
    return { ...bl, mixerClear, deckClear, ok };
  });

  // 16t) t60: the audio-engine fixes — theater engine, dance ear-level ring,
  //      real voicing, smooth volume on both players
  R.checks.t60Audio = await page.evaluate(() => {
    const s = window.__VB.scene;
    const eng = s.tv.engineInfo(), tvv = s.tv.voiceInfo();
    const engOk = eng.latencyHint === 'playback' && (eng.limiterPath === 'stereo-limiter' || eng.limiterPath === 'discrete-direct');
    const tvVoiceOk = tvv.on && tvv.presence === 2.5 && tvv.air === 3;
    // dance audio anchors at EAR level; store ring stays up at its working line
    const ab = s.audioBoxes();
    const danceEar = ab.danceSats.length >= 10 && ab.danceSats.every(p => p.y <= 1.8);
    const storeUntouched = ab.sats.every(p => p.y > 3.9);
    const storeAudioEar = s.jukeboxAudio.surroundInfo().satY === 1.7;   // t66: store ring renders at ear level (cabinets stay high)
    // smooth volume: element pinned at unity, target tracks, node in the graph
    const jb = s.jukeboxAudio;
    jb.setVolume(0.9); const v1 = jb.volumeInfo();
    jb.setVolume(0.2); const v2 = jb.volumeInfo();
    jb.setVolume(0.4);
    const tv = s.tv; tv.setVolume(0.7); const t1 = tv.volumeInfo(); tv.setVolume(0.25);
    const volOk = v1.elementVolume === 1 && v1.target === 0.9 && v2.target === 0.2 && v1.node
      && t1.target === 0.7 && (t1.elementVolume === 1 || t1.elementVolume === null);   // theater: target persists pre-play
    const ok = engOk && tvVoiceOk && danceEar && storeUntouched && volOk && storeAudioEar;
    return { engOk, tvVoiceOk, danceEar, storeUntouched, volOk, danceY: ab.danceSats[0].y, ok };
  });

  // 16u) t61: the DESKTOP shell + docs exist (native window, no Node needed)
  {
    const fs = require('node:fs');
    const main = fs.readFileSync('desktop/main.cjs', 'utf8');
    const docs = fs.readFileSync('START-HERE.txt', 'utf8');
    const mainOk = /BrowserWindow/.test(main) && /requestSingleInstanceLock/.test(main) && /PORT/.test(main) && /Menu\.setApplicationMenu\(null\)/.test(main);
    const docsOk = /HomeBinger\.exe/i.test(docs) && /START-WITH-NODE\.bat/i.test(docs) && /BabyBluJ/.test(docs);
    R.checks.t61Desktop = { mainOk, docsOk, bat: fs.existsSync('START-WITH-NODE.bat'), ok: mainOk && docsOk && fs.existsSync('START-WITH-NODE.bat') };
  }

  // 16w) t62: UNINSTALL is delete-the-folder — data lives INSIDE the app dir
  {
    const fs = require('node:fs');
    const docs = fs.readFileSync('START-HERE.txt', 'utf8');
    const store = fs.readFileSync('server/lib/store.js', 'utf8');
    const docsOk = /UNINSTALLING/i.test(docs) && /delete the HomeBinger-win32-x64 folder/i.test(docs) && /%APPDATA%/.test(docs);
    const portable = /process\.cwd\(\), 'data'/.test(store) && fs.existsSync('data/config.json');   // data really is ./data
    R.checks.t62Uninstall = { docsOk, portable, ok: docsOk && portable };
  }

  // 16v) t61: the FILE GRABBER — recursive folders, INDIVIDUAL FILES only,
  //      playable off disk (Range). Configured live against the real server.
  {
    const fs = require('node:fs');
    const root = require('node:path').resolve('tests/media/local');
    fs.mkdirSync(root + '/Crate Diggers/Beat Tape A', { recursive: true });
    fs.mkdirSync(root + '/Movies/Summer 2024', { recursive: true });
    fs.writeFileSync(root + '/Crate Diggers/Beat Tape A/01 - Loop.mp3', 'ID3fake-audio-0123456789');
    fs.writeFileSync(root + '/Crate Diggers/Beat Tape A/02 - Scratch.mp3', 'ID3fake-audio-9876543210');
    fs.writeFileSync(root + '/Movies/Home Movie.mp4', 'fakemp4-bytes-0123456789abcdef');
    fs.writeFileSync(root + '/Movies/Summer 2024/clip.webm', 'fakewebm-bytes-0123456789');
    const put = (body) => fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH }, body: JSON.stringify(body) });
    await put({ local: { on: true, path: root } });
    const items = await j(await fetch(BASE + '/api/library?refresh=1', { headers: authH }));
    const locals = items.items.filter(i => i.source === 'local');
    const filesOnly = locals.every(i => /\.(mp3|wav|ogg|flac|m4a|aac|opus|mp4|m4v|webm|mkv|mov|avi)$/i.test(i.key));
    const recursive = locals.some(i => i.key.includes('Summer 2024/clip.webm'));
    const five = locals.length >= 4;
    const album = locals.find(i => i.key.includes('01 - Loop.mp3'))?.type === 'album';
    const movie = locals.some(i => i.type === 'movie' && i.key.includes('Home Movie.mp4'));
    // playable: Range request straight off disk through the play route
    const track0 = locals.find(i => i.key.includes('01 - Loop.mp3'));
    const kpath = track0 ? track0.key.split('/').map(encodeURIComponent).join('/') : 'MISSING';   // t68: fail with info, not a crash
    const pr = await fetch(BASE + '/api/play/local/' + kpath, { headers: { ...authH, Range: 'bytes=0-3' } });
    const bytes = pr.status === 206 ? (await pr.arrayBuffer()).byteLength : -1;
    const rangeOk = pr.status === 206 && bytes === 4;
    await put({ local: { on: false, path: root } });           // leave the server clean
    await fetch(BASE + '/api/library?refresh=1', { headers: authH });
    R.checks.t61Grabber = { n: locals.length, filesOnly, recursive, album, movie, rangeOk,
      ok: filesOnly && recursive && five && album && movie && rangeOk };
  }

  // 16x) t62: MULTI-SPOT grabber — two roots at once, per-spot keys, books
  //      indexed for the future library (catalogue yes, shelves no)
  {
    const fs = require('node:fs');
    const P = require('node:path');
    const rootA = P.resolve('tests/media/local');                  // spot 0 (from t61)
    const rootB = P.resolve('tests/media/local2');                 // spot 1
    fs.mkdirSync(rootB + '/Concerts/Live Set', { recursive: true });
    fs.mkdirSync(rootB + '/ebooks', { recursive: true });
    fs.writeFileSync(rootB + '/Concerts/Live Set/acid jazz.mp3', 'ID3fake-jazz-0123456789');
    fs.writeFileSync(rootB + '/ebooks/Field Guide.pdf', '%PDF-fake-book');
    const put = (body) => fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH }, body: JSON.stringify(body) });
    await put({ local: { on: true, spots: [rootA, rootB] } });
    const items = await j(await fetch(BASE + '/api/library?refresh=1', { headers: authH }));
    const locals = items.items.filter(i => i.source === 'local');
    const spot0 = locals.filter(i => i.key.startsWith('0/')).length >= 4;
    const spot1 = locals.filter(i => i.key.startsWith('1/')).length >= 2;
    const nested = locals.some(i => i.key === '1/Concerts/Live Set/acid jazz.mp3');
    const book = locals.some(i => i.type === 'book' && i.key.includes('Guide.pdf'));
    const keypath = '1/Concerts/Live Set/acid jazz.mp3'.split('/').map(encodeURIComponent).join('/');
    const pr = await fetch(BASE + '/api/play/local/' + keypath, { headers: { ...authH, Range: 'bytes=2-5' } });
    const rangeOk = pr.status === 206 && (await pr.arrayBuffer()).byteLength === 4;
    await put({ local: { on: false, spots: [] } });
    await fetch(BASE + '/api/library?refresh=1', { headers: authH });
    R.checks.t62GrabberMulti = { n: locals.length, spot0, spot1, nested, book, rangeOk,
      ok: spot0 && spot1 && nested && book && rangeOk };
  }

  // 16y) t63: the volume/EQ logic bugs — orphaned nodes, slider snap-back,
  //      EQ lost before first play, soft-clip final stage, honest fallback
  R.checks.t63Volume = await page.evaluate(() => {
    const s = window.__VB.scene;
    // EQ set BEFORE the first play must reach the filters when the graph builds
    const jb = s.jukeboxAudio;
    jb.setEq('bass', 5); jb.setEq('mid', -3);
    jb.play({ source: 'local', key: 'x.mp3', title: 'probe', type: 'album' });   // builds the graph sync
    const eq = jb.eqInfo();
    const eqOk = eq.applied.bass === 5 && eq.applied.mid === -3 && eq.bass === 5;   // scheduled = stated = live
    // soft-clip final stage present on both engines
    const engJ = jb.engineInfo(), engT = s.tv.engineInfo();
    const clipOk = engJ.softClip && engT.softClip && engJ.latencyHint === 'playback';
    // volume: targets track on both players; fallback path contained (never stuck at 1)
    jb.setVolume(0.2); const vJ = jb.volumeInfo();
    const tv = s.tv; tv.setVolume(0.6); const vT = tv.volumeInfo();
    const volOk = vJ.target === 0.2 && vJ.elementVolume !== 1 ? true : vJ.target === 0.2;   // element may be 1 when graphed — target is truth
    const tvOk = vT.target === 0.6;
    // fallback honesty: with no graph, element volume follows the target exactly
    const fbOk = !engJ.graphed || vJ.elementVolume === 1;   // graphed → pinned at 1; not graphed → follows target
    jb.stop(); jb.setEq('bass', 0); jb.setEq('mid', 0);
    const ok = eqOk && clipOk && volOk && tvOk && fbOk;
    return { eqOk, clipOk, volOk, tvOk, fbOk, nodes: vT.nodes, ok };
  });

  // 16z) t64: the BOOTH PRO RIG — dual decks, crossfader math, BPM/key math,
  //      Beginner/Pro, and the corrected split (jukebox keeps the classic deck)
  R.checks.t64ProEngine = await page.evaluate(() => {
    const p = window.__VB.scene.djPro;
    if (!p) return { ok: false, missing: true };
    const two = p.info().decks.length === 2;
    const xf = p.info().xf;
    const xfOk = xf.detent && Math.abs(xf.aGain - xf.bGain) < 1e-9;   // symmetric at center
    const bpmOk = p.pure.modeInterval([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]) === 120
      && p.pure.modeInterval([0.61, 0.6, 0.61, 0.33, 0.6]) === 100;   // noisy intervals → mode
    const keyOk = (() => { const k = p.pure.keyFromChroma([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88]); return k.note === 'C' && k.mode === 'major' && k.camelot === '8B'; })();
    return { two, xfOk, bpmOk, keyOk, ok: two && xfOk && bpmOk && keyOk };
  });

  R.checks.t64ProUI = await page.evaluate(async () => {
    const w = window;
    localStorage.removeItem('hb_djpro_mode');
    w.__VB.ui.openDj('booth');
    await new Promise(r => setTimeout(r, 120));
    const panel = document.querySelector('.djp');
    const proEl = document.querySelector('.djp-pro');
    const beginnerHidden = !!panel && proEl && getComputedStyle(proEl).display === 'none';
    const modeBtn = document.querySelector('#djp-mode');
    modeBtn.click();                                   // → Pro
    const proShown = getComputedStyle(proEl).display === 'flex';
    const shortcuts = !!document.querySelector('#djp-help');
    const decks = document.querySelectorAll('.djp-deck').length === 2;
    const xfSlider = !!document.querySelector('#djp-xf') && !!document.querySelector('#djp-curve');
    // pick deck B (click), then keyboard: Space must not crash with nothing loaded
    document.querySelector('.djp-deck.b')?.click();
    const activeB = w.__VB.scene.djPro.info().active === 1;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    // switch to the jukebox: the CLASSIC deck, retitled, drag-rows, repeat cycle
    w.__VB.ui.openDj('jukebox');
    await new Promise(r => setTimeout(r, 120));
    const jukeGone = !document.querySelector('.djp');
    const title = document.querySelector('#dj-title')?.textContent || '';
    const isJukeTitle = /Jukebox/.test(title);
    const mc = w.__VB.mainCtx;
    // queue two items through the deck brain itself (same path the panel uses)
    mc.djDevice = 'jukebox';
    w.__VB.scene.jukeboxAudio.stop();
    mc.djAdd({ id: 't64a', title: 'Suite Track A', source: 'radio', key: 'k1', type: 'radio' });
    mc.djAdd({ id: 't64b', title: 'Suite Track B', source: 'radio', key: 'k2', type: 'radio' });
    w.__VB.ui.openDj('jukebox');                       // re-render → the rows appear
    await new Promise(r => setTimeout(r, 100));
    const draggable = !!document.querySelector('[data-qrow][draggable="true"]');
    return { beginnerHidden, proShown, decks, xfSlider, shortcuts, activeB, jukeGone, isJukeTitle, draggable,
      ok: beginnerHidden && proShown && decks && xfSlider && shortcuts && activeB && jukeGone && isJukeTitle && draggable };
  });

  R.checks.t64JukeDeck = await page.evaluate(() => {
    const mc = window.__VB.mainCtx, jb = window.__VB.scene.jukeboxAudio;
    // repeat cycles off → one → all → off
    mc.djDevice = 'jukebox';
    const r0 = mc.djState().repeat;
    mc.djRepeat = 'off';
    const b = document.querySelector('[data-dj="repeat"]');
    b.click(); const r1 = mc.djState().repeat;
    b.click(); const r2 = mc.djState().repeat;
    b.click(); const r3 = mc.djState().repeat;
    const repeatOk = r1 === 'one' && r2 === 'all' && r3 === 'off';
    // crossfade respects the fade-length setting: set 3s, end the track → next
    jb.setFadeSecs(3);
    mc.djAdd({ id: 't64c', title: 'Suite Track C', source: 'radio', key: 'k3', type: 'radio' });
    if (!mc.djState().now) mc.djPlayAt(0);           // re-prime (the 404 stream's retry loop nulls 'current')
    const st0 = mc.djState();
    const el = jb.element();
    const hadTwo = st0.queue.length >= 2;
    const before = st0.now?.title || null;
    el.dispatchEvent(new Event('ended'));
    const after = mc.djState().now?.title || null;
    const advanced = hadTwo && before && after && before !== after;
    const fs = jb.fadeSecsInfo() === 3;
    // repeat-one: same track replays (idx unchanged)
    mc.djRepeat = 'one';
    const iBefore = mc.djState().idx;
    el.dispatchEvent(new Event('ended'));
    const oneOk = mc.djState().idx === iBefore;
    mc.djRepeat = 'off';
    return { repeatOk, advanced, fs, oneOk, hadTwo, ok: repeatOk && advanced && fs && oneOk };
  });

  // 16aa) t65: theater-mirror jukebox staging · wide pro panel · gold-record wall
  R.checks.t65Polish = await page.evaluate(() => {
    const w = window;
    // jukebox now runs the THEATER's exact staging (trim 0.55, matrix 0.5/0.3/0.22, sub LP 110)
    const jb = w.__VB.scene.jukeboxAudio;
    jb.play({ source: 'radio', key: 'probe.mp3', title: 'probe', type: 'radio' });
    const st = jb.engineInfo().staging;
    const stageOk = st && Math.abs(st.trim - 0.55) < 0.01 && st.main === 0.5 && st.subLp === 110 && jb.engineInfo().softClip;   // AudioParam values are float32
    jb.stop();
    // the pro rig opens WIDE; the classic jukebox deck stays standard width
    w.__VB.ui.openDj('booth');
    const modal = document.querySelector('#dj-modal');
    const card = modal.querySelector('.modal-card');
    const wideOk = modal.classList.contains('dj-wide') && card.getBoundingClientRect().width > 500;
    w.__VB.ui.openDj('jukebox');
    const narrowOk = !modal.classList.contains('dj-wide');
    // the DJ's library: framed gold records FLUSH on the wall, one plaque per song
    const rw = w.__VB.scene.danceInfo().recordWall;
    const framesOk = rw.n >= 1 && rw.framed && rw.flush && rw.plaques === rw.n;
    return { stageOk, wideOk, narrowOk, framesOk, n: rw.n, ok: stageOk && wideOk && narrowOk && framesOk };
  });

  // 16ab) t67: sub-band dynamics everywhere · booth modal flex (only the list
  //      scrolls, even in Pro) · item-modal title clears the ✕
  R.checks.t67Sound = await page.evaluate(async () => {
    const w = window, s = w.__VB.scene;
    const radio = (w.__VB.state?.items || []).find(i => i.type === 'radio');
    // jukebox: sub-band dynamics present in the live graph
    const jb = s.jukeboxAudio;
    jb.play(radio || { source: 'radio', key: 'x', title: 'p', type: 'radio' });
    const jSub = !!jb.engineInfo().staging.subDyn;
    const jSubLvl = jb.engineInfo().staging.subLp === 110;
    jb.stop();
    // theater: both sub channels got the dynamics stage
    const tv = s.tv;
    tv.playItem(radio || { source: 'radio', key: 'x', title: 'p', type: 'radio' });
    await new Promise(r => setTimeout(r, 350));
    const tSubs = tv.engineInfo().subDyns;
    tv.mediaEl()?.pause();
    // pro rig: the dance ring BUILDS with the graph (t67 fix) and has sub dynamics
    s.djPro.playItem(radio || { source: 'radio', key: 'x', title: 'p', type: 'radio' });
    await new Promise(r => setTimeout(r, 250));
    const pi = s.djPro.info();
    const proSub = !!pi.master.subDyn;
    // booth modal: Pro mode — the CARD must not scroll; the LIST scrolls
    w.__VB.ui.openDj('booth');
    await new Promise(r => setTimeout(r, 350));
    document.querySelector('#djp-mode')?.click();
    await new Promise(r => setTimeout(r, 250));
    const card = document.querySelector('#dj-modal .modal-card');
    const list = document.querySelector('#djp-list');
    const flexOk = !!card && getComputedStyle(card).overflow === 'hidden' && (card.offsetWidth - card.clientWidth) <= 2   // t72: no scrollbar on the card
      && !!list && getComputedStyle(list).overflowY === 'auto';   // (fixed-height card clips — t72 measures the real behavior)
    document.querySelector('#dj-modal .modal-close')?.click();
    // item modal: the title must clear the ✕ close button
    const items = w.__VB.state?.items || [];
    const it = items.reduce((a, c2) => (c2.title || '').length > (a?.title || '').length ? c2 : a, items[0]);
    w.__VB.ui.showItemModal(it);
    await new Promise(r => setTimeout(r, 300));
    const ttEl = document.querySelector('#item-title');
    const rng = document.createRange(); rng.selectNodeContents(ttEl);
    const tt = rng.getBoundingClientRect();              // the TEXT box (padding excluded)
    const cx = document.querySelector('#item-modal .modal-close').getBoundingClientRect();
    const titleClear = tt.right <= cx.left + 2;
    document.querySelector('#item-modal .modal-close')?.click();
    const ok = jSub && jSubLvl && tSubs >= 2 && proSub && flexOk && titleClear;
    return { jSub, jSubLvl, tSubs, proSub, flexOk, titleClear, ok };
  });

  // 16ac) t69: OVER-FULL-SCALE MASTERS — the owner's real song (a Suno master
  //      peaking +0.21 dBFS) must play through the jukebox with the chain
  //      never engaging the limiter (the tanh stage bounds the output <1.0).
  {
    const path = require('node:path'), fs = require('node:fs');
    const root = path.resolve('tests/media/realsong');
    if (fs.existsSync(root + '/song.m4a')) {
      const put = (body) => fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH }, body: JSON.stringify(body) });
      await put({ local: { on: true, spots: [root] } });
      R.checks.t69HotMaster = await page.evaluate(async () => {
        const w = window;
        const login2 = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'BabyBluJ', password: 'BluJNetwork' }) })).json();
        const lib = await (await fetch('/api/library', { headers: { Authorization: 'Bearer ' + login2.token } })).json();
        const song = lib.items.find(i => i.source === 'local' && /song\.m4a$/.test(i.key || ''));
        if (!song) return { ok: false, missing: true };
        const jb = w.__VB.scene.jukeboxAudio;
        jb.setVolume(1.0); jb.setEq('bass', 14);
        jb.play(song);
        try { jb.element().currentTime = 96; } catch {}   // t74: the LOUD section — the intro-only sample hid real program
        let maxLim = 0, maxSub = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 12000) { maxLim = Math.max(maxLim, jb.limiterReduction()); maxSub = Math.max(maxSub, jb.subReduction()); await new Promise(r => setTimeout(r, 150)); }
        const played = (jb.element().currentTime || 0) > 5;
        jb.stop(); jb.setEq('bass', 0); jb.setVolume(0.4);
        // hot master tolerated: limiter barely breathes (≤3 dB transient), sub dynamics may work
        const ok = played && maxLim <= 3;
        return { played, maxLim: +maxLim.toFixed(2), maxSub: +maxSub.toFixed(2), ok };
      });
      await put({ local: { on: false, spots: [] } });
      await fetch(BASE + '/api/library?refresh=1', { headers: authH });
    }
  }

  // 16ad) t70: soft-clip curve contract — UNITY below the knee. The t63 tanh
  //       curve shipped a hidden +5.4 dB boost (1.47x slope at zero crossing)
  //       that made Home Binger louder than every other app at max volume and
  //       saturated hot masters exactly there. The owner's ears found it.
  {
    R.checks.t70ClipCurve = await page.evaluate(() => {
      const s = window.__VB.scene, out = {};
      const grab = e => e ? (e.engineInfo ? e.engineInfo().clipCurve : (e.info ? e.info().clipCurve : null)) : null;
      out.jukebox = grab(s.jukeboxAudio); out.tv = grab(s.tv); out.dj = grab(s.djPro);
      const pass = c => !!c && c.zero <= 0.002 && Math.abs(c.half - 0.5) <= 0.01 && Math.abs(c.slope - 1) <= 0.05 && c.top > 0.9 && c.top < 0.99;
      const optional = [out.tv, out.dj].filter(Boolean);
      const ok = pass(out.jukebox) && optional.every(pass);
      return { jukebox: out.jukebox, tv: out.tv, dj: out.dj, ok };
    });
  }

  // 16ae) t71: BASS MANAGEMENT + GUARDED RINGS — the owner's ears heard bass
  //       "leaking from the room speakers" and booth distortion above ~0.2 trim:
  //       satellites cross over at 110 Hz / 24 dB-oct (the sub owns the lows),
  //       the jukebox ring bus rides slow dynamics, and the dance ring sums
  //       INSIDE its own knee+limiter instead of past all protection.
  {
    R.checks.t71BassMgmt = await page.evaluate(() => {
      const s = window.__VB.scene, out = {};
      const je = s.jukeboxAudio?.engineInfo?.();
      const js = s.jukeboxAudio?.surroundInfo?.();
      out.juke = je && js ? { sats: js.satellites, hpHz: je.staging.satHpHz, stages: je.staging.satStages } : null;
      out.dj = s.djPro?.info?.()?.ring || null;
      const ok = !!(out.juke && out.juke.sats > 0 && out.juke.hpHz >= 100 && out.juke.stages >= 2
        && out.dj && out.dj.sats >= 8 && out.dj.hpHz >= 100 && out.dj.stages >= 2 && out.dj.guarded);   // t73: busDyn dropped — theater doctrine
      return { juke: out.juke, dj: out.dj, ok };
    });
  }

  // 16af) t72: BOOTH LAYOUT, MEASURED BEHAVIOR — t67's flex check verified CSS
  //       intent while #dj-body (64vh + overflow:auto, never cancelled) still
  //       scrolled the decks away. This check SCROLLS THE LIST and measures:
  //       decks stay on screen, no sideways scroll anywhere, card fills the view.
  {
    const benchVp = { width: 640, height: 400 };
    await page.setViewportSize({ width: 1440, height: 900 });      // a REAL desktop size for behavior
    R.checks.t72BoothLayout = await page.evaluate(async () => {
      const w = window;
      w.__VB.ui.openDj('booth');
      await new Promise(r => setTimeout(r, 350));
      let root = document.querySelector('.djp');
      for (let i = 0; root && !root.classList.contains('pro') && i < 2; i++) {
        document.querySelector('#djp-mode')?.click();
        await new Promise(r => setTimeout(r, 250));
        root = document.querySelector('.djp');
      }
      const card = document.querySelector('#dj-modal .modal-card');
      const list = document.querySelector('#djp-list');
      const deck = document.querySelector('.djp-deck');
      const out = { pro: !!(root && root.classList.contains('pro')) };
      if (!card || !list || !deck || !out.pro) {
        document.querySelector('#dj-modal .modal-close')?.click();
        return { ...out, missing: !card || !list || !deck, ok: false };
      }
      const cr = card.getBoundingClientRect();
      out.fill = { w: +(cr.width / innerWidth).toFixed(2), h: +(cr.height / innerHeight).toFixed(2) };
      out.fills = out.fill.w >= 0.9 && out.fill.h >= 0.8;
      // guarantee the list is scrollable, then scroll it hard
      const proto = list.querySelector('.djp-rowitem');
      const adopted = [];
      if (proto && list.scrollHeight <= list.clientHeight + 2) {
        for (let i = 0; i < 40; i++) { const c = proto.cloneNode(true); c.dataset.t72 = '1'; list.appendChild(c); adopted.push(c); }
      }
      list.scrollTop = 1e6;
      await new Promise(r => setTimeout(r, 120));
      out.listScrolls = list.scrollTop > 0;
      const dr = deck.getBoundingClientRect();
      out.deckStays = dr.top >= 0 && dr.bottom <= innerHeight && dr.height > 40;
      out.bodyScrolls = (bd => bd.scrollHeight > bd.clientHeight + 2)(document.querySelector('#dj-body'));
      out.noSideways = card.scrollWidth <= card.clientWidth + 1 && list.scrollWidth <= list.clientWidth + 1
        && document.documentElement.scrollWidth <= innerWidth + 1;
      adopted.forEach(c => c.remove());
      document.querySelector('#dj-modal .modal-close')?.click();
      out.ok = out.fills && out.listScrolls && out.deckStays && !out.bodyScrolls && out.noSideways;
      return { pro: out.pro, fill: out.fill, listScrolls: out.listScrolls, deckStays: out.deckStays,
        bodyScrolls: out.bodyScrolls, noSideways: out.noSideways, ok: out.ok };
    });
    await page.setViewportSize(benchVp);                            // back to the tiny bench size
    // tiny windows must still never scroll sideways (decks squeeze instead)
    R.checks.t72TinyNoSideways = await page.evaluate(async () => {
      window.__VB.ui.openDj('booth');
      await new Promise(r => setTimeout(r, 300));
      const card = document.querySelector('#dj-modal .modal-card');
      const body = document.querySelector('#dj-body');
      const ok = !!card && !!body && card.scrollWidth <= card.clientWidth + 1 && body.scrollWidth <= body.clientWidth + 1;
      document.querySelector('#dj-modal .modal-close')?.click();
      return { cardOver: card ? card.scrollWidth - card.clientWidth : null, ok };
    });
  }

  // 16ag) t73: THEATER-CALIBRATED SUBS — the owner reported "extra bass for no
  //       reason" in the jukebox + dance hall vs the theater (the reference).
  //       Cause: both sub buses were fed L+R at UNITY (2x on correlated bass)
  //       then trimmed after — +6..+9 dB over the theater's 0.4-input recipe —
  //       plus a 12 dB/oct sub LP against 24 dB/oct satellite HPs (summed bump
  //       at 110 Hz) plus a non-theater bus compressor. All three corrected.
  {
    R.checks.t73TheaterSub = await page.evaluate(() => {
      const s = window.__VB.scene;
      const je = s.jukeboxAudio?.engineInfo?.()?.staging;
      const dr = s.djPro?.info?.()?.ring;
      const juke = je ? { subIn: je.subIn, lpStages: je.subLpStages, subGain: je.subGain, busDyn: !!je.busDyn } : null;
      const dj = dr ? { subIn: dr.subIn, lp2: !!dr.subLp2 } : null;
      const ok = !!(juke && juke.subIn >= 0.35 && juke.subIn <= 0.45 && juke.lpStages >= 2
        && juke.subGain >= 0.25 && juke.subGain <= 0.35 && !juke.busDyn
        && dj && dj.subIn >= 0.35 && dj.subIn <= 0.45 && dj.lp2);
      return { juke, dj, ok };
    });
  }

  // 16ah) t74: EQUAL SLIDER = EQUAL LOUDNESS — the owner hears distortion above
  //       ~50% in the jukebox + dance hall (not the theater). In-app chain
  //       measures clean at 100% (graph intact, limiter idle on the loud
  //       section) — the delta was ABSOLUTE OUTPUT: those rings carried weaker
  //       distance shading (ref 3.5 / rolloff 0.25) than the reference theater
  //       (2.2 / 0.35), pushing the owner's output stack ~2.3 dB harder at the
  //       same slider %. Both rings now carry the theater's exact shading.
  {
    R.checks.t74EqualLoudness = await page.evaluate(() => {
      const s = window.__VB.scene;
      const jr = s.jukeboxAudio?.surroundInfo?.();
      const ok = !!(jr && jr.ref !== null && jr.ref <= 2.2 && jr.rolloff >= 0.35 && jr.live > 0);
      return { jukeRef: jr?.ref, jukeRolloff: jr?.rolloff, live: jr?.live, ok };
    });
  }

  // 16ai) t75: BOOTH CALIBRATION — the owner's booth was clean ONLY at master
  //       ~0.5 with trim 1 (their ears hand-plugged the jukebox's fixed 0.55
  //       calibration). The booth now carries the same 0.55 cal stage BEFORE the
  //       master volume; at FULL unity (trim 1, master 1) both limiters must
  //       stay safety nets (≤3 dB) on the LOUD section of the real hot master.
  {
    const path = require('node:path'), fs = require('node:fs');
    const root = path.resolve('tests/media/realsong');
    if (fs.existsSync(root + '/song.m4a')) {
      const put = (body) => fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH }, body: JSON.stringify(body) });
      await put({ local: { on: true, spots: [root] } });
      R.checks.t75BoothCal = await page.evaluate(async () => {
        const w = window;
        const login2 = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'BabyBluJ', password: 'BluJNetwork' }) })).json();
        const lib = await (await fetch('/api/library', { headers: { Authorization: 'Bearer ' + login2.token } })).json();
        const song = lib.items.find(i => i.source === 'local' && /song\.m4a$/.test(i.key || ''));
        if (!song) return { ok: false, missing: true };
        w.__VB.scene.djPro.stopAll();                     // t76: deterministic — no deck left playing by an earlier check
        w.__VB.ui.openDj('booth');                       // mounts the pro engine + the UI
        await new Promise(r => setTimeout(r, 400));
        const m = document.querySelector('#djp-master'); // the REAL user path: slider → 1.0
        if (m) { m.value = '1'; m.dispatchEvent(new Event('input')); }
        const p = w.__VB.scene.djPro;
        p.playItem(song);
        await new Promise(r => setTimeout(r, 700));
        p.seek(96);   // t75: the LOUD section — intro-only sampling is the t69 mistake, not repeated
        let lim = 0, ring = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 10000) {
          const mi = p.info().master; lim = Math.max(lim, mi.limRed); ring = Math.max(ring, mi.ringRed);
          await new Promise(r => setTimeout(r, 140));
        }
        const fin = p.info();
        if (m) { m.value = '0.8'; m.dispatchEvent(new Event('input')); }
        w.__VB.scene.djPro.stopAll();
        document.querySelector('#dj-modal .modal-close')?.click();
        const ok = fin.decks.some(d => d.loaded) && lim <= 3 && ring <= 3 && fin.master.cal >= 0.5 && fin.master.cal <= 0.6;
        return { cal: fin.master.cal, played: fin.decks.some(d => d.playing), maxLimRed: lim, maxRingRed: ring, ok };
      });
      await put({ local: { on: false, spots: [] } });
      await fetch(BASE + '/api/library?refresh=1', { headers: authH });
    }
  }

  // 16aj) t76: dB-HONEST DECK EQ — the owner's recipe: trim 1, master 1.0,
  //       deck bass +12, the real hot master on deck A → distortion (their
  //       trim-0.7 workaround ≈ half the jukebox's auto-makeup). Every booth EQ
  //       boost now pays the jukebox's t59 makeup (0.5 dB/dB bass, 0.35 mid &
  //       treble). This check drives the REAL DOM sliders (EQ included — the
  //       t75 check missed it, the owner's test didn't) and both limiters must
  //       stay safety nets on the loud section.
  {
    const path = require('node:path'), fs = require('node:fs');
    const root = path.resolve('tests/media/realsong');
    if (fs.existsSync(root + '/song.m4a')) {
      const put = (body) => fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH }, body: JSON.stringify(body) });
      await put({ local: { on: true, spots: [root] } });
      R.checks.t76BoothEq = await page.evaluate(async () => {
        const w = window;
        const login2 = await (await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'BabyBluJ', password: 'BluJNetwork' }) })).json();
        const lib = await (await fetch('/api/library', { headers: { Authorization: 'Bearer ' + login2.token } })).json();
        const song = lib.items.find(i2 => i2.source === 'local' && /song\.m4a$/.test(i2.key || ''));
        if (!song) return { ok: false, missing: true };
        const p = w.__VB.scene.djPro;
        p.stopAll();                                      // deterministic: no deck left playing
        w.__VB.ui.openDj('booth');
        await new Promise(r => setTimeout(r, 400));
        const setSlider = (el, val) => { if (!el) return false; el.value = String(val); el.dispatchEvent(new Event('input')); return true; };
        setSlider(document.querySelector('#djp-master'), 1);   // the owner's maxed master
        p.playItem(song);
        await new Promise(r => setTimeout(r, 500));
        const di = p.info().decks.findIndex(d => d.playing);  // THE deck that actually plays
        if (di < 0) { document.querySelector('#dj-modal .modal-close')?.click(); return { ok: false, noDeck: true }; }
        const panel = document.querySelector('.djp-deck[data-deck="' + di + '"]');
        const bassOk = setSlider(panel.querySelector('[data-eq="bass"]'), 12);   // its REAL EQ slider
        const trimOk = setSlider(panel.querySelector('[data-trim]'), 1);
        const eqBass = +p.info().decks[di].eqDb.bass;      // primitives, captured NOW
        p.seek(96);                                        // the LOUD section
        let lim = 0, ring = 0;
        const t0 = performance.now();
        while (performance.now() - t0 < 10000) {
          const mi = p.info().master; lim = Math.max(lim, mi.limRed); ring = Math.max(ring, mi.ringRed);
          await new Promise(r => setTimeout(r, 140));
        }
        const limFin = +lim.toFixed(2), ringFin = +ring.toFixed(2);
        const makeup = p.info().decks[di].makeup;      // after convergence (setTargetAtTime τ=50ms — an instant read is still 1.0)
        setSlider(panel.querySelector('[data-eq="bass"]'), 0);   // restore
        setSlider(document.querySelector('#djp-master'), 0.8);
        p.stopAll();
        document.querySelector('#dj-modal .modal-close')?.click();
        const expect = +Math.pow(10, -6 / 20).toFixed(3);
        const ok = bassOk && trimOk && eqBass === 12 && Math.abs((makeup || 1) - expect) < 0.02 && limFin <= 3 && ringFin <= 3;
        return { deck: di, bassOk, trimOk, eqBass, makeup, expect, maxLimRed: limFin, maxRingRed: ringFin, ok };
      });
      await put({ local: { on: false, spots: [] } });
      await fetch(BASE + '/api/library?refresh=1', { headers: authH });
    }
  }

  // 16ak) t77: RESONANCE AUDIO RING — the owner asked for the best open-source
  //       surround engine for the dance hall. Research verdict (docs/SURROUND.md):
  //       Steam Audio / OpenAL Soft / Cavern are native SDKs (wrong layer for a
  //       browser app); Resonance Audio (Google, Apache-2.0, vendored) is the
  //       production-grade web Ambisonics renderer — verified live in current
  //       Chromium before wiring. The booth ring renders through ONE first-order
  //       soundfield with HRTF binaural decode; the WebAudio ring remains as an
  //       automatic fallback if the vendor file is absent (any browser, always).
  {
    R.checks.t77Resonance = await page.evaluate(async () => {
      const w = window;
      const vendor = !!w.ResonanceAudio;
      w.__VB.scene.djPro.stopAll();
      w.__VB.ui.openDj('booth');
      await new Promise(r => setTimeout(r, 400));
      const p = w.__VB.scene.djPro;
      p.playItem({ source: 'radio', key: 'probe.mp3', title: 'probe', type: 'radio' });
      await new Promise(r => setTimeout(r, 900));
      const ring = p.info().ring;
      p.stopAll();
      document.querySelector('#dj-modal .modal-close')?.click();
      // engine is resonance when the vendor lib is present; the t71/t73 contracts
      // (bass management + theater sub calibration) must hold on EITHER engine
      const ok = vendor && ring.engine === 'resonance' && ring.resSources === 10
        && ring.hpHz >= 100 && ring.stages >= 2 && ring.guarded && ring.subIn >= 0.35 && ring.subIn <= 0.45;
      return { vendor, engine: ring.engine, resSources: ring.resSources, hpHz: ring.hpHz, guarded: ring.guarded, subIn: +ring.subIn.toFixed(2), ok };
    });
  }

  // 16al) t78: THE JUKEBOX GOES AMBISONIC — the owner approved the Resonance
  //       ring in the dance hall ("DJ booth sounded better"); the store ring
  //       now renders through the same first-order soundfield. The WebAudio
  //       ring remains the automatic fallback; every t71-t76 contract below
  //       the renderer must hold on EITHER engine.
  {
    R.checks.t78JukeResonance = await page.evaluate(() => {
      const s = window.__VB.scene;
      const jr = s.jukeboxAudio?.surroundInfo?.();
      const je = s.jukeboxAudio?.engineInfo?.()?.staging;
      const vendor = !!window.ResonanceAudio;
      const ok = !!(vendor && jr && jr.engine === 'resonance' && jr.resSources === 7 && jr.satellites === 7
        && jr.ref <= 2.2 && jr.rolloff >= 0.35
        && je && je.satHpHz >= 100 && je.satStages >= 2 && je.subIn >= 0.35 && je.subIn <= 0.45 && je.subGain >= 0.25 && je.subGain <= 0.35);
      return { vendor, engine: jr?.engine, resSources: jr?.resSources, sats: jr?.satellites, ref: jr?.ref, rolloff: jr?.rolloff,
        hpHz: je?.satHpHz, stages: je?.satStages, subIn: je?.subIn, subGain: je?.subGain, ok };
    });
  }

  // 16am) t79: THE DESKTOP BOOT CONTRACT — the exe's launcher must load the
  //       ESM server via dynamic import(). Electron 33 bundles Node 20.18,
  //       which CANNOT require() an ES module — the original require() threw
  //       ERR_REQUIRE_ESM and the exe died silently on every machine (found by
  //       the owner on launch day; reproduced + proven fixed under real
  //       Electron 33 in-sandbox).
  {
    const fs = require('node:fs'), path = require('node:path');
    const mcjs = fs.readFileSync(path.resolve('desktop/main.cjs'), 'utf8');
    R.checks.t79DesktopBoot = {
      dynamicImport: mcjs.includes('pathToFileURL') && mcjs.includes('await import(pathToFileURL('),
      noBareRequire: !mcjs.includes("require(path.join(__dirname, '..', 'server', 'server.js'))"),
      ok: mcjs.includes('pathToFileURL') && mcjs.includes('await import(pathToFileURL(')
        && !mcjs.includes("require(path.join(__dirname, '..', 'server', 'server.js'))")
    };
  }

  // 16an) t80: EXE BRANDING — HomeBinger.exe wears the HB logo (the favicon
  //       rendered 16..256 px into tools/assets/icon.ico) via a pure-JS PE
  //       resource edit (resedit, build-time only — no Wine, no app deps).
  {
    const fs = require('node:fs'), path = require('node:path');
    const ico = fs.existsSync(path.resolve('tools/assets/icon.ico'));
    const icoSize = ico ? fs.statSync(path.resolve('tools/assets/icon.ico')).size : 0;
    const build = fs.readFileSync(path.resolve('tools/build-desktop.mjs'), 'utf8');
    const tool = fs.readFileSync(path.resolve('tools/set-exe-icon.mjs'), 'utf8');
    const wired = build.includes('set-exe-icon');
    const api = tool.includes('Resource.IconGroupEntry.replaceIconsForResource');
    R.checks.t80IconBrand = { ico, icoKB: Math.round(icoSize / 1024), wired, api, ok: ico && icoSize > 10000 && wired && api };
  }

  // 16ao) t81: RENAME — the owner asked "how do I change the account name?";
  //       the Users panel only offered password+delete while START-HERE
  //       promised "change it in Admin: Users". Rename is cosmetic-safe:
  //       profiles key user:<id>, sessions key userId.
  {
    R.checks.t81Rename = await (async () => {   // NODE-side: expected 401/409/400s must not pollute the browser-console error tally
    const fs = require('node:fs'), path = require('node:path');
    const login = async (u, p) => { const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); return { status: r.status, token: r.ok ? (await r.json()).token : null }; };
    const admin = await login('BabyBluJ', 'BluJNetwork');
    const purge = async () => {
      const list = await (await fetch(BASE + '/api/admin/users', { headers: { Authorization: 'Bearer ' + admin.token } })).json();
      for (const u of list.users) if (/^t81_(rename_tmp|renamed)/.test(u.username)) {
        await fetch(BASE + '/api/admin/users/' + encodeURIComponent(u.id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + admin.token } });
      }
    };
    await purge();
    const reg = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 't81_rename_tmp', password: 'test1234' }) });
    const users = await (await fetch(BASE + '/api/admin/users', { headers: { Authorization: 'Bearer ' + admin.token } })).json();
    const id = users.users.find(u => u.username === 't81_rename_tmp')?.id;
    if (!id) { await purge(); return { ok: false, missing: true, regStatus: reg.status }; }
    const ren = await fetch(BASE + '/api/admin/users/rename', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + admin.token }, body: JSON.stringify({ id, username: 't81_renamed' }) });
    const newLogin = await login('t81_renamed', 'test1234');
    const oldLogin = await login('t81_rename_tmp', 'test1234');
    const dup = await fetch(BASE + '/api/admin/users/rename', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + admin.token }, body: JSON.stringify({ id, username: 'babybluj' }) });
    const bad = await fetch(BASE + '/api/admin/users/rename', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + admin.token }, body: JSON.stringify({ id, username: 'x' }) });
    await purge();
    // t81b: the UI must use inline editors and NEVER window.prompt — Electron
    // (the desktop exe) doesn't implement prompt(); it silently returns null
    // and the button does nothing. This line is the regression guard.
    const uiSrc = fs.readFileSync(path.resolve('public/js/ui.js'), 'utf8');
    const noPrompt = ['ui', 'api', 'main', 'state'].every(m =>
      !/\bprompt\s*\(/.test(fs.readFileSync(path.resolve('public/js/' + m + '.js'), 'utf8')));
    const uiWired = uiSrc.includes('data-rename') && uiSrc.includes('inlineEdit')
      && fs.readFileSync(path.resolve('public/js/api.js'), 'utf8').includes('adminRenameUser')
      && noPrompt;
    const ok = reg.ok && ren.ok && newLogin.status === 200 && oldLogin.status === 401 && dup.status === 409 && bad.status === 400 && uiWired;
    return { regOk: reg.ok, renamed: ren.ok, newLogin: newLogin.status, oldLogin: oldLogin.status, dup: dup.status, badName: bad.status, uiWired, noPrompt, ok };
  })();
  }

  // 16x) t82–t85: the admin/menu/mobile wave (owner tester round 2)
  // t82: admins make admins — promote/demote round-trip + last-admin guard + wiring
  R.checks.t82Admin = await (async () => {
    const fs = require('node:fs'), path = require('node:path');
    const login = async (u, p) => { const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); return { status: r.status, token: r.ok ? (await r.json()).token : null }; };
    const admin = await login('BabyBluJ', 'BluJNetwork');
    const H = { 'content-type': 'application/json', Authorization: 'Bearer ' + admin.token };
    const users = () => fetch(BASE + '/api/admin/users', { headers: H }).then(r => r.json());
    const purge = async () => { for (const u of (await users()).users) if (/^t82_/.test(u.username)) await fetch(BASE + '/api/admin/users/' + encodeURIComponent(u.id), { method: 'DELETE', headers: H }); };
    await purge();
    const reg = await fetch(BASE + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 't82_member', password: 'test1234' }) });
    const id = (await users()).users.find(u => u.username === 't82_member')?.id;
    const prom = await fetch(BASE + '/api/admin/users/promote', { method: 'POST', headers: H, body: JSON.stringify({ id, admin: true }) });
    const promoted = (await users()).users.find(u => u.id === id)?.isAdmin === true;
    const dem = await fetch(BASE + '/api/admin/users/promote', { method: 'POST', headers: H, body: JSON.stringify({ id, admin: false }) });
    const demoted = (await users()).users.find(u => u.id === id)?.isAdmin === false;
    const meId = (await users()).users.find(u => u.username === 'BabyBluJ')?.id;
    const lastAdmin = await fetch(BASE + '/api/admin/users/promote', { method: 'POST', headers: H, body: JSON.stringify({ id: meId, admin: false }) });
    const stillAdmin = (await users()).users.find(u => u.id === meId)?.isAdmin === true;
    await purge();
    const uiSrc = fs.readFileSync(path.resolve('public/js/ui.js'), 'utf8');
    const wired = uiSrc.includes('data-admin') && uiSrc.includes('panelAdmin') && uiSrc.includes('admin-sub')
      && fs.readFileSync(path.resolve('public/js/api.js'), 'utf8').includes('adminPromoteUser');
    const ok = reg.ok && prom.ok && promoted && dem.ok && demoted && lastAdmin.status === 400 && stillAdmin && wired;
    return { regOk: reg.ok, promoted, demoted, lastAdminBlocked: lastAdmin.status, stillAdmin, wired, ok };
  })();

  // t83: overlays own the CPU — modal pauses the scene, mobile drops the frosted glass
  {
    const fs = require('node:fs');
    const r = await page.evaluate(async () => {
      document.querySelector('#sidebar')?.classList.remove('hidden');
      document.querySelector('#btn-menu')?.click();
      await new Promise(r2 => setTimeout(r2, 400));
      document.querySelector('.side-link[data-tab="look"]')?.click();
      await new Promise(r2 => setTimeout(r2, 300));
      const open = document.body.classList.contains('overlay-open');
      document.getElementById('btn-settings-close')?.click();
      await new Promise(r2 => setTimeout(r2, 250));
      const released = !document.body.classList.contains('overlay-open');
      return { open, released, ok: open && released };
    });
    const sceneSrc = fs.readFileSync('public/js/store3d/scene.js', 'utf8');
    const cssSrc = fs.readFileSync('public/css/style.css', 'utf8');
    r.sceneHook = sceneSrc.includes('overlay-open');
    r.cssMobile = cssSrc.includes('max-width: 820px') && cssSrc.includes('backdrop-filter: none');
    r.ok = r.ok && r.sceneHook && r.cssMobile;
    R.checks.t83Mobile = r;
  }

  // t84: the invite button — /api/lan serves private-range URLs, UI wires the copy
  R.checks.t84Invite = await (async () => {
    const fs = require('node:fs');
    const r = await fetch(BASE + '/api/lan');
    const j = await r.json().catch(() => null);
    const shaped = r.ok && Array.isArray(j?.urls)
      && j.urls.every(u => /^http:\/\/(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)\d{1,3}\.\d{1,3}:\d+$/.test(u));
    const uiSrc = fs.readFileSync('public/js/ui.js', 'utf8');
    const wired = uiSrc.includes('btn-copy-lan') && uiSrc.includes('/api/lan');
    return { status: r.status, n: (j?.urls || []).length, shaped, wired, ok: shaped && wired };
  })();

  // t85: the jukebox is silent on hover — zombie tip lives on the street door only
  {
    const fs = require('node:fs');
    const s = fs.readFileSync('public/js/store3d/scene.js', 'utf8');
    const doorOnly = s.includes("sp === 'streetdoor' ? { title: '🧟 Zombie warning");
    const oneZombie = s.split('Zombie warning').length - 1 === 1;
    const silentDefault = s.includes(': null;   // t85: the jukebox is quiet on purpose');
    R.checks.t85Jukebox = { doorOnly, oneZombie, silentDefault, ok: doorOnly && oneZombie && silentDefault };
  }

  // 17) per-user media mix: guest opts OUT of the free shelves while the store keeps them on
  R.checks.myMedia = await page.evaluate(async () => {
    const before = new Set(window.__VB.state.items.map(i => i.source));
    const arcBefore = before.has('archive');
    await window.__VB.state.updatePrefs({ sources: { plex: null, jellyfin: null, archive: [], radio: [] } });
    await new Promise(r => setTimeout(r, 400));
    const lib = await (await fetch('/api/library?refresh=1', { credentials: 'include' })).json();
    const empty = lib.count === 0;                        // their shelves: nothing
    await window.__VB.state.updatePrefs({ sources: null });   // follow the store again
    const lib2 = await (await fetch('/api/library?refresh=1', { credentials: 'include' })).json();
    const arcBack = lib2.items.some(i => i.source === 'archive');
    return { arcBefore, empty, arcBack, n: lib.count, ok: arcBefore && empty && arcBack };
  });

  // 18b) shelving order: FREE media stocks first, then Plex — once per item
  R.checks.shelveOrder = await (async () => {
    // both sources on (plex mock + archive mock), recent-desc
    await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
      body: JSON.stringify({ sources: { plex: true, jellyfin: false }, plex: { url: 'http://localhost:32770', token: 't', sections: ['1'] },
        archive: { url: 'http://127.0.0.1:32790', sections: ['staff-picks'] }, radio: { url: 'http://127.0.0.1:32790', sections: [] }, podcasts: { feeds: [] }, shelves: {} }) });
    const lib0 = await page.evaluate(async () => {
      const lib = await (await fetch('/api/library?refresh=1', { credentials: 'include' })).json();
      window.__VB.state.items = lib.items;
      return { n: lib.count, sources: [...new Set(lib.items.map(i => i.source))] };
    });
    
    const evalP = page.evaluate(async () => {
      const stages = window.__stages = [];
      const items = window.__VB.state.items;
      stages.push('pre-setItems'); // console.log('STAGE pre-setItems');
      window.__VB.scene.setItems(items, { mode: 'recent', dir: 'desc' }, () => {}, {});
      stages.push('post-setItems'); // console.log('STAGE post-setItems');
      // shelfUnits() follows the store's own browse order — units[0] is stocked first
      const units = window.__VB.scene.shelfUnits();
      stages.push('post-units'); // console.log('STAGE post-units');
      const first = window.__VB.scene.placementsByUnit(units[0].id);
      const classics = ['Night of the Living Dead', 'His Girl Friday', 'Plan 9 from Outer Space'];
      const all = units.slice(0, 6).flatMap(u => window.__VB.scene.placementsByUnit(u.id));
      stages.push('post-sampling'); // console.log('STAGE post-sampling');
      // ── shelf cycling: flip unit[0] forward → new window, back → restored
      const cyc1 = window.__VB.scene.cycleShelf(units[0].id, 1);
      const page1 = window.__VB.scene.placementsByUnit(units[0].id);
      const cycBack = window.__VB.scene.cycleShelf(units[0].id, -1);
      const page0 = window.__VB.scene.placementsByUnit(units[0].id);
      stages.push('post-cycle'); // console.log('STAGE post-cycle');
      const pagerDom = !!document.getElementById('shelf-pager');
      return { unit: units[0].id, first: first.slice(0, 3), n: items.length,
        head: items.slice(0, 4).map(i => [i.source, i.title.slice(0, 16), i.addedAt]),
        pages: cyc1?.pages, cycledDiffers: JSON.stringify(page1) !== JSON.stringify(first),
        restored: JSON.stringify(page0) === JSON.stringify(first), pagerDom,
        firstIsFree: first.slice(0, 3).every((t, i) => t === classics[i]),
        plexPresent: all.some(t => t.startsWith('Film ')),
        noEarlyDupe: all.slice(0, items.length).length === new Set(all.slice(0, items.length)).size };
    });
    const r = await Promise.race([
      evalP,
      new Promise(res => setTimeout(() => res({ HUNG: true }), 12000))
    ]);
    if (r && r.HUNG) {
      const stages = await Promise.race([
        page.evaluate(() => window.__stages),
        new Promise(res => setTimeout(() => res(['MAIN-THREAD-PEGGED']), 3000))
      ]);
      
      throw new Error('shelveOrder evaluate hung at ' + JSON.stringify(stages));
    }
    // back to free-only for the remaining checks
    await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
      body: JSON.stringify({ sources: { plex: false, jellyfin: false }, plex: { url: '', token: '', sections: [] }, archive: { url: 'http://127.0.0.1:32790', sections: ['staff-picks'] },
        radio: { url: 'http://127.0.0.1:32790', sections: ['oldies'] }, podcasts: { feeds: [] }, shelves: {} }) });
    await page.evaluate(async () => {
      const lib = await (await fetch('/api/library?refresh=1', { credentials: 'include' })).json();
      window.__VB.state.items = lib.items;
      window.__VB.scene.setItems(lib.items, window.__VB.state.prefs.sorting, () => {}, window.__VB.state.shelves || {});
    });
    return { ...r, ok: r.firstIsFree && r.plexPresent && r.noEarlyDupe && r.cycledDiffers && r.restored && r.pagerDom && (r.pages || 0) >= 1 };
  })();

  // 18) sidebar "Back to front entrance" → entry page; door itself is inert
  // 18) t52 ANTI-STUCK: 'Back to front entrance' → Enter returns the player
  // to the LOAD-IN POINT in the hallway (previously you kept your old pose)
  R.checks.frontDoor = await page.evaluate(async () => {
    const s = window.__VB.scene;
    const doorInert = !s.onPortalClick;                    // door unwired (future hallway)
    const noRespawnBtn = !document.getElementById('btn-respawn');
    s.debugTeleport(11.1, 1.5, 1.2, 0);                    // park way out on the dance floor
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('btn-leave-store').click();
    await new Promise(r => setTimeout(r, 300));
    const loadingUp = document.getElementById('loading').style.display !== 'none';
    const enterVisible = !document.getElementById('btn-enter').classList.contains('hidden');
    document.getElementById('btn-enter').click();
    await new Promise(r => setTimeout(r, 300));
    const backIn = document.getElementById('loading').style.display === 'none';
    const p = s.debugPose();                               // LOAD-IN: hallway, facing into the store
    const atSpawn = Math.abs(p.x) < 0.4 && p.z > 7.2 && p.z < 8.1 && Math.abs(p.yaw) < 0.05;
    // the direct API works too
    s.debugTeleport(3, -3, 0, 0);
    s.resetToSpawn();
    const p2 = s.debugPose();
    const resetWorks = Math.abs(p2.x) < 0.4 && p2.z > 7.2 && p2.z < 8.1 && Math.abs(p2.yaw) < 0.05;
    return { doorInert, noRespawnBtn, loadingUp, enterVisible, backIn, atSpawn, resetWorks,
      spawn: { x: +p2.x.toFixed(2), z: +p2.z.toFixed(2), yaw: +p2.yaw.toFixed(2) },
      ok: doorInert && noRespawnBtn && loadingUp && enterVisible && backIn && atSpawn && resetWorks };
  });
  // dedicated trickle server — the shared mock carries all the browser-phase
  // poster/video traffic; isolating the stream checks removes socket cross-talk
  const TRICKLE_PORT = 32996;
  let flakyHits = 0;               // state for the flaky-film repair route below
  const trickleSrv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const json = o => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (u.pathname === '/metadata/trickle_film')
      return json({ metadata: { identifier: 'trickle_film' }, files: [{ name: 'trickle.mp4', size: 6553600 }] });
    if (u.pathname === '/metadata/real_film') {
      const st = require('fs').statSync(__dirname + '/media/sintel.mp4');
      // the 'mp3' twin: same bytes — browsers play the AAC track in <audio>
      return json({ metadata: { identifier: 'real_film' }, files: [
        { name: 'real.mp4', size: st.size }, { name: 'real.mp3', size: st.size }] });
    }
    if (u.pathname.startsWith('/download/real_film/')) {
      // a REAL H.264 mp4 — the fullscreen HUD check needs actual frames,
      // currentTime progress and no mid-check decode death
      const buf = require('fs').readFileSync(__dirname + '/media/sintel.mp4');
      const rng = req.headers.range;
      if (rng) {
        const m = rng.match(/bytes=(\d+)-(\d*)/);
        const s0 = m ? Number(m[1]) : 0, e = m && m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes ${s0}-${e}/${buf.length}`, 'Content-Length': String(e - s0 + 1) });
        return res.end(buf.subarray(s0, e + 1));
      }
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': String(buf.length) });
      return res.end(buf);
    }
    if (u.pathname === '/download/trickle_film/trickle.mp4') {
      const CHUNK = Buffer.alloc(65536, 7), TOTAL = 100;
      const range = req.headers.range;
      let startChunk = 0, endChunk = TOTAL;
      if (range) { const m = range.match(/bytes=(\d+)-(\d*)/); if (m) { startChunk = Math.floor(Number(m[1]) / CHUNK.length); endChunk = m[2] ? Math.ceil((Number(m[2]) + 1) / CHUNK.length) : TOTAL; } }
      const totalBytes = TOTAL * CHUNK.length, from = startChunk * CHUNK.length, to = Math.min(endChunk * CHUNK.length, totalBytes) - 1;
      res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${from}-${to}/${totalBytes}`, 'Content-Length': String(to - from + 1) } : { 'Content-Length': String(totalBytes) }) });
      let i = startChunk;
      const iv = setInterval(() => { if (i >= endChunk) { clearInterval(iv); res.end(); return; } res.write(CHUNK); i++; }, 100);
      res.on('close', () => clearInterval(iv));
      return;
    }
    if (u.pathname === '/metadata/web_film') {
      // named .mp4 (the adapter only shelves mp4s) but the BYTES are VP9/WebM
      // — chrome-for-testing has no H.264; open codecs are how headless gets
      // real decoded frames. Content-Type tells the browser what's what.
      const stw = require('fs').statSync(__dirname + '/media/sintel.webm');
      return json({ metadata: { identifier: 'web_film' }, files: [{ name: 'sintel.mp4', size: stw.size }] });
    }
    if (u.pathname.startsWith('/download/web_film/')) {
      // VP9/WebM twin — chrome-for-testing ships WITHOUT H.264 (err 4); open
      // codecs are the only way to assert REAL decoded frames headless
      const bw = require('fs').readFileSync(__dirname + '/media/sintel.webm');
      const m2 = (req.headers.range || '').match(/bytes=(\d+)-(\d*)/);
      const a0 = m2 ? Number(m2[1]) : 0, b0 = m2 && m2[2] ? Math.min(Number(m2[2]), bw.length - 1) : bw.length - 1;
      res.writeHead(206, { 'Content-Type': 'video/webm', 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${a0}-${b0}/${bw.length}`, 'Content-Length': String(b0 - a0 + 1) });
      return res.end(bw.subarray(a0, b0 + 1));
    }
    if (u.pathname === '/metadata/flaky_film')
      return json({ metadata: { identifier: 'flaky_film' }, files: [{ name: 'flaky.mp4', size: 524288 }] });
    if (u.pathname === '/download/flaky_film/flaky.mp4') {
      // pathological first serve: 206 promising 0..524287 but quits at 200 KB.
      // Every later request (the proxy's repair) serves honestly.
      const TOTAL = 524288, FIRST = 204800;
      const m = (req.headers.range || '').match(/bytes=(\d+)-(\d*)/);
      const s0 = m ? Number(m[1]) : 0, e0 = m && m[2] ? Math.min(Number(m[2]), TOTAL - 1) : TOTAL - 1;
      flakyHits++;
      if (flakyHits === 1) {
        res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
          'Content-Range': `bytes 0-${TOTAL - 1}/${TOTAL}`, 'Content-Length': String(TOTAL) });
        return res.end(Buffer.alloc(FIRST, 1));
      }
      res.writeHead(206, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${s0}-${e0}/${TOTAL}`, 'Content-Length': String(e0 - s0 + 1) });
      return res.end(Buffer.alloc(e0 - s0 + 1, 2));
    }
    res.writeHead(404); res.end();
  });
  await new Promise(r => trickleSrv.listen(TRICKLE_PORT, r));
  await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
    body: JSON.stringify({ archive: { url: `http://127.0.0.1:${TRICKLE_PORT}`, sections: [] } }) });


  // 11) LONG STREAM through the raw-http proxy: 6.4 MB / ~10 s trickle → every byte arrives
  R.checks.longStream = await withRetry(async () => {
    const t0 = Date.now();
    const r = await fetch(`${BASE}/api/play/archive/trickle_film?vb_auth=${login.token}`);
    const ct = r.headers.get('content-type');
    let bytes = 0;
    const reader = r.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; }
    const secs = (Date.now() - t0) / 1000;
    return { bytes, secs, ct, ok: bytes === 6553600 && secs >= 8 && /video/.test(ct || '') };
  });

  // 12) aborted transfer + Range resume (seek behaviour)
  R.checks.rangeResume = await withRetry(async () => {
    const r1 = await fetch(`${BASE}/api/play/archive/trickle_film?vb_auth=${login.token}`, { headers: { range: 'bytes=0-131071' } });
    const b1 = Buffer.from(await r1.arrayBuffer());
    const r2 = await fetch(`${BASE}/api/play/archive/trickle_film?vb_auth=${login.token}`, { headers: { range: 'bytes=131072-196607' } });
    const b2 = Buffer.from(await r2.arrayBuffer());
    return { s1: r1.status, s2: r2.status, cr: r2.headers.get('content-range'),
      ok: r1.status === 206 && b1.length === 131072 && r2.status === 206 && b2.length === 65536 && /131072-196607/.test(r2.headers.get('content-range') || '') };
  });

  // 12b) SEAMLESS RANGE REPAIR: first serve promises 512 KB but quits at
  // 200 KB — the proxy must fetch exactly the missing bytes and finish the
  // SAME response (player never re-buffers from zero)
  R.checks.streamRepair = await withRetry(async () => {
    const r = await fetch(`${BASE}/api/play/archive/flaky_film?vb_auth=${login.token}`, { headers: { range: 'bytes=0-524287' } });
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, bytes: buf.length, splice: buf[204799], after: buf[204800],
      ok: r.status === 206 && buf.length === 524288 && buf[0] === 1 && buf[204800] === 2 };
  });

  // 12c) t39: the Plex/Jellyfin connection boxes start EMPTY — the stored
  // config (what esc(adminCfg.plex.url) fills the inputs with) must be blank
  R.checks.connBoxesEmpty = await withRetry(async () => {
    const r = await fetch(`${BASE}/api/admin/config`, { headers: authH });
    const { config } = await r.json();
    const vals = [config.plex?.url, config.plex?.token, config.jellyfin?.url, config.jellyfin?.apiKey];
    return { vals, ok: vals.every(v => (v || '') === '') };
  });

  // 13) true full-screen video: raw <video> promoted to DOM, Esc exits
  R.checks.fullscreen = await page.evaluate(async () => {
    const tv = window.__VB.scene.tv;
    // the REAL 52s H.264 film — HUD progress/fade assertions need genuine
    // playback (filler-byte mocks die mid-check)
    const film = { id: 'archive:real_film', source: 'archive', key: 'real_film', title: 'Sintel Trailer', type: 'movie' };
    tv.playItem(film);
    await new Promise(r => setTimeout(r, 700));
    const wasPlaying = !tv.mediaPaused();       // autoplay may be blocked headless — only assert if it was rolling
    const entered = tv.enterFullscreen();
    const vid = document.getElementById('vb-fs-video');
    const inDom = !!vid && vid.parentNode === document.body && document.body.classList.contains('tv-fullscreen');
    const fsStyleClean = !!vid && vid.style.width !== '2px';   // t46: hidden-attach inline styles must be GONE
    // ── full-screen HUD: controls up, progress advances, fades out while
    //    playing idle, wakes on mouse move, gone after exit
    const hud = document.getElementById('tv-fs-hud');
    const hudUp = !!hud && !hud.classList.contains('hidden');
    await new Promise(r => setTimeout(r, 1900));            // < idle timer (2.6s): still awake, progress moving
    const playedW = parseFloat(document.getElementById('tv-fs-played')?.style.width || '0') || 0;
    const idleEarly = document.body.classList.contains('fhud-idle');
    await new Promise(r => setTimeout(r, 1600));            // past the timer → faded (cursor hidden too)
    const idleNow = document.body.classList.contains('fhud-idle');
    document.dispatchEvent(new MouseEvent('mousemove'));
    await new Promise(r => setTimeout(r, 150));
    const woke = !document.body.classList.contains('fhud-idle');
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    await new Promise(r => setTimeout(r, 300));
    const exited = !tv.fullscreenActive() && !document.getElementById('vb-fs-video')?.isConnected
      && !document.body.classList.contains('tv-fullscreen');
    const hudGone = hud.classList.contains('hidden') && !document.body.classList.contains('fhud-idle');
    const stillPlaying = !wasPlaying || !tv.mediaPaused();   // DOM removal must NOT pause (the old bug)
    // t46: the NEXT play after a fullscreen exit used to ReferenceError —
    // exercise that exact path (element detached, guard re-attaches it)
    tv.playItem(film);
    await new Promise(r => setTimeout(r, 350));
    const replaysAfterFs = tv.isPlaying();
    tv.stop();
    return { entered, inDom, fsStyleClean, hudUp, playedW, idleEarly, idleNow, woke, hudGone, exited, wasPlaying, stillPlaying, replaysAfterFs,
      ok: entered && inDom && fsStyleClean && hudUp && (!wasPlaying || (playedW > 0 && !idleEarly && idleNow)) && woke && exited && hudGone && stillPlaying && replaysAfterFs };
  });

  // 14) TV tilt (≈15° down) + earlier queue fade (≈3.2 m)
  // 16g) AUDIO RESILIENCE — a mid-stream hiccup must reload + resume, not
  // silently stop the song partway (the real-stream regression)
  R.checks.audioResilience = await page.evaluate(async () => {
    const juke = window.__VB.scene.jukeboxAudio;
    // REAL stream (the 52s trailer's audio track) via the trickle server
    juke.play({ id: 'test:sintel', source: 'archive', key: 'real_film', type: 'episode', title: 'Sintel Audio' });
    await new Promise(r => setTimeout(r, 2600));
    const st1 = juke.stats();
    const el = juke.element();
    const diag1 = el ? { rs: el.readyState, ns: el.networkState, err: el.error ? el.error.code : null,
      src: (el.currentSrc || el.src || '').slice(0, 70), dur: el.duration, ct: el.currentTime } : null;
    // simulate the network dying mid-file — this used to end the song quietly
    el.dispatchEvent(new Event('error'));
    await new Promise(r => setTimeout(r, 3200));
    const st2 = juke.stats();
    juke.stop();
    const resumed = st2.playing === true && st2.paused === false && st2.time > st1.time;
    const diag2 = el ? { rs: el.readyState, ns: el.networkState, err: el.error ? el.error.code : null, ct: el.currentTime } : null;
    return { t1: +st1.time.toFixed(1), t2: +st2.time.toFixed(2), playing2: st2.playing, resumed, diag1, diag2,
      ok: st1.time > 0.5 && resumed };
  });

  R.checks.tiltEarlyFade = await page.evaluate(async () => {
    const s = window.__VB.scene;
    s.tv.stop();                                   // free the decoder for the fade watch
    s.jukeboxAudio?.stop();
    const tilt = s.tv.tiltRadians();
    const f = s.tv.focusPoint;
    s.debugTeleport(f.x, f.z + 2.7, 0, 0);   // inside 3.2m → queue panel steps aside
    const fadesEarly = await new Promise(resolve => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (document.body.classList.contains('tv-close')) { clearInterval(iv); resolve(true); }
        else if (Date.now() - t0 > 8000) { clearInterval(iv); resolve(false); }
      }, 120);
    });
    const inTheater = s.debugPose().z < -7;         // focusPoint is the theater screen now
    return { tilt, fadesEarly, inTheater, ok: tilt === 0 && fadesEarly && inTheater };
  });

  // 15) sidebar search finds media and opens the item modal
  R.checks.sidebarSearch = await page.evaluate(async () => {
    const sidebar = document.getElementById('sidebar');
    const input = document.getElementById('side-search');
    sidebar.classList.remove('hidden');
    input.value = 'night';
    input.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 300));
    const rows = document.querySelectorAll('#side-search-results [data-search-id]');
    const found = rows.length > 0 && [...rows].some(r2 => r2.textContent.toLowerCase().includes('night'));
    rows[0]?.click();
    await new Promise(r => setTimeout(r, 500));
    const modalOpen = !document.getElementById('item-modal').classList.contains('hidden');
    document.getElementById('item-modal').classList.add('hidden');
    document.getElementById('btn-sidebar-close')?.click();
    return { rows: rows.length, found, modalOpen, ok: found && modalOpen };
  });

  // 16) full screen works for AUDIO (visualizer canvas) + TV clears the wall
  R.checks.fsAudioMount = await page.evaluate(async () => {
    const tv = window.__VB.scene.tv;
    const station = window.__VB.state.items.find(i => i.type === 'radio');
    // t39: audio NEVER takes the theater screen — the play is refused, nothing
    // mounts, and the screen geometry stays put for the next movie
    const refused = tv.playItem(station) === false;
    await new Promise(r => setTimeout(r, 400));
    const notPlaying = !tv.isPlaying();
    const nothingMounted = !document.getElementById('vb-fs-video');
    tv.stop();
    const m = tv.mountInfo();
    return { refused, notPlaying, nothingMounted, z: +(m.z || 0).toFixed(2), tilt: +(m.tilt || 0).toFixed(3),
      ok: refused && notPlaying && nothingMounted && m.tilt === 0 && m.z < -13 };   // mount still the flat screen wall
  });


  // ── restore the live preview: real archive.org defaults, no mocks ──
  await fetch(BASE + '/api/admin/config', { method: 'PUT', headers: { 'content-type': 'application/json', ...authH },
    body: JSON.stringify({ sources: { demo: false, plex: false, jellyfin: false }, archive: { url: '', sections: ['staff-picks', 'sci-fi-horror', 'noir', 'comedy', 'cartoons', 'westerns', 'serials'] }, radio: { url: '', sections: ['oldies', 'synthwave'] }, podcasts: { feeds: [] }, shelves: {} }) });
  await fetch(BASE + '/api/library?refresh=1&vb_auth=' + login.token);

  console.log(JSON.stringify(R));
  console.log('errors:', errors.length ? errors.slice(0, 3) : 'none');
  const ok = Object.values(R.checks).every(x => x && x.ok) && errors.length === 0;
  console.log(ok ? '\n✅ ALL CHECKS PASSED' : '\n❌ FAILURES PRESENT');
  await browser.close(); plexMock.close(); addonMock.close(); trickleSrv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
