// ─────────────────────────────────────────────────────────────────────────────
//  main.js — boots the store: fetch profile + library → build the 3D world
//  ───────────────────────────────────────────────────────────────────────────
//  Flow:
//    1. /api/bootstrap  → who am I (guest/device/account), my prefs, locks, TV
//    2. /api/library    → the catalogue (Plex / Jellyfin / demo)
//    3. build the 3D scene, shelf placeholders appear instantly, real cover
//       art streams in behind the loading bar
//    4. "Enter the store" → pointer-lock first-person browsing
// ─────────────────────────────────────────────────────────────────────────────
import { state } from './state.js?v=1788996243385';
import { api } from './api.js?v=1788996243385';
import { initUI } from './ui.js?v=1788996243385';
import { createScene } from './store3d/scene.js?v=1788996243385';
import { STORE, SUPPORT } from './store3d/config.js?v=1788996243385';

// ── store branding (config.js → STORE) drives the start screen ──
{
  const t = document.querySelector('.bb-tag');
  if (t) t.textContent = `★ ${STORE.tagline.toUpperCase()} ★`;
  const n = document.querySelector('.bb-name');
  if (n) n.textContent = STORE.name.toUpperCase();
}


const $ = (sel) => document.querySelector(sel);

async function boot() {
  const status = $('#loading-status');
  const fill = $('#loading-fill');

  // 1 ─ identity + prefs
  status.textContent = 'Checking your membership card…';
  try {
    await state.refresh();
  } catch (err) {
    $('#loading-error').classList.remove('hidden');
    $('#loading-error').textContent = `Can't reach the server: ${err.message}. Is the backend running? (node server/server.js)`;
    fill.style.width = '100%';
    return;
  }

  const prefs = state.prefs;
  let scene;
  try {
    scene = createScene($('#scene-container'), prefs.theme);
  } catch (err) {
    $('#loading-error').classList.remove('hidden');
    $('#loading-error').textContent = 'WebGL failed to start: ' + err.message + ' — try another browser or enable hardware acceleration.';
    return;
  }

  // 2 ─ library
  status.textContent = 'Fetching the catalogue…';
  let library;
  try {
    library = await api.library();
    state.items = library.items;
    state.sections = library.sections || [];
    // effective shelf map: personal pref (server-computed) over the store default
    state.shelves = Object.keys(prefs.shelves || {}).length ? prefs.shelves : (library.shelves || {});
  } catch (err) {
    library = { items: [], sections: [], shelves: {} };
    state.items = [];
  }
  fill.style.width = '22%';

  // 3 ─ stock the shelves (placeholders instantly, art streams in)
  status.textContent = 'Stocking the shelves…';
  await new Promise(r => setTimeout(r, 30)); // let the UI paint
  scene.tv?.setVisualizer(prefs.visualizer || { style: 'bars' });
  const onStockProgress = (done, total, artworkPhase) => {
    if (!artworkPhase) { fill.style.width = `${22 + 60 * (done / Math.max(1, total))}%`; return; }
    // artwork phase: show a small chip, don't block entry
    const chip = $('#art-progress');
    if (total > 0 && done < total) {
      chip.classList.remove('hidden');
      $('#art-progress-num').textContent = `${done}/${total}`;
    } else {
      chip.classList.add('hidden');
    }
  };
  scene.setItems(state.items, prefs.sorting, onStockProgress, state.shelves);
  scene.setDancePrefs?.(state.prefs.dance);   // t86: dance-floor prefs at boot
  scheduleLocalThumbs();                      // t89: grabber case art, once the store settles
  fill.style.width = '90%';

  // TV config (idle screen; playback is triggered by clicking shelf cases)
  await reloadTv();
  const scenePlayHook = scene.tv.state.onStateChange;   // scene.js: theater lights + tape eject
  scene.tv.state.onStateChange = (s) => {
    scenePlayHook?.(s);
    const stopBtn = $('#btn-tv-stop');
    if (!stopBtn) return;
    stopBtn.classList.toggle('hidden', !s.playing);
  };

  // t52: a deck = one device's DJ brain: queue + transport + fades, bound to
  // ONE audio channel. Two instances exist: jukebox (store) & booth (dance).
  function makeDeck(getAudio, zone, label) {
    const d = { label, zone, queue: [], idx: -1, repeat: 'off', shuffle: false };   // t64: 'off'|'one'|'all'
    d.add = (item) => { if (!item) return; d.queue.push(item); if (d.idx < 0) d.playAt(0, { instant: true }); };
    d.remove = (i) => { d.queue.splice(i, 1); if (i < d.idx) d.idx--; else if (i === d.idx && d.idx >= d.queue.length) d.idx = d.queue.length - 1; };
    d.move = (i, dir) => { const j = i + dir; if (j < 0 || j >= d.queue.length) return; const [it] = d.queue.splice(i, 1); d.queue.splice(j, 0, it); if (d.idx === i) d.idx = j; else if (d.idx === j) d.idx = i; };
    d.moveTo = (from, to) => {           // t64: drag-and-drop reorder
      if (from < 0 || from >= d.queue.length || to < 0 || to >= d.queue.length || from === to) return;
      const [it] = d.queue.splice(from, 1); d.queue.splice(to, 0, it);
      if (d.idx === from) d.idx = to;
      else { if (from < d.idx && to > d.idx) d.idx--; if (from > d.idx && to < d.idx) d.idx++; }
    };
    d.playAt = (i, { instant } = {}) => {
      if (i < 0 || i >= d.queue.length) return;
      d.idx = i;
      const jb = getAudio();
      // t64: the fade-length setting drives BOTH sides of the transition
      const fs = Math.max(0.2, jb.fadeSecsInfo());
      if (!instant && jb.nowPlaying()) {
        jb.fade('out', fs);
        setTimeout(() => jb.play(d.queue[i], { zone }), fs * 1000);
      } else jb.play(d.queue[i], { zone });
      jb.fade('in', fs);
    };
    d.next = (auto) => {
      const q = d.queue; if (!q.length) return;
      if (auto && d.repeat === 'one') return d.playAt(d.idx);   // t64: repeat-one
      if (d.shuffle) return d.playAt(Math.floor(Math.random() * q.length));
      let n = d.idx + 1;
      if (n >= q.length) { if (d.repeat !== 'all' && auto) return; n = 0; }
      d.playAt(n);
    };
    d.prev = () => { if (d.queue.length) d.playAt(d.idx > 0 ? d.idx - 1 : d.queue.length - 1); };
    d.state = () => { const jb = getAudio(); return { device: d.label,
      queue: d.queue.map(i => ({ id: i.id, title: i.title, type: i.type })), idx: d.idx,
      repeat: d.repeat, shuffle: d.shuffle, eq: jb.eqInfo(), rate: jb.rateInfo(), voice: jb.voiceInfo?.() || { on: true },
      fadeSecs: jb.fadeSecsInfo(), stats: jb.stats(), now: jb.nowPlaying() }; };
    return d;
  }

  // 4 ─ UI wiring
  let ctx;                                // captured for the front-desk login
  const ui = initUI(ctx = {
    applyTheme: (patch) => {
      const t = { ...state.prefs.theme, ...patch };
      // t93 FIX (the "theme doesn't go app-wide" report): the merged theme
      // is now WRITTEN BACK to state. Before, a color-row edit updated the
      // CSS variables live but state.prefs.theme kept the OLD accent — so
      // the save persisted the old color, the case view snapshotted the old
      // accent, and any store rebuild RESET every menu to the old accent
      // ("they don't all change together"). One write, everything agrees.
      state.prefs.theme = t;
      // t45: the DOM UI follows the theme too — accent drives every button,
      // border and hover tint via CSS variables (was hardcoded gold/pink)
      const r = document.documentElement.style;
      r.setProperty('--vb-accent', t.accent || '#ffd23f');
      r.setProperty('--vb-accent-soft', `color-mix(in srgb, ${t.accent || '#ffd23f'} 72%, white)`);
      scene.applyTheme(t);
    },
    currentAccent: () => state.prefs.theme.accent,
    applySorting: (sorting) => { scene.applySorting(sorting); toastIt('Shelves restocked!'); },
    applyDancePrefs: (p) => scene.setDancePrefs?.(p),       // t86: dance-floor light prefs
    checkVersion,                                           // t96: new-version notice (launch check)
    genLocalThumbs: () => scheduleLocalThumbs(),            // t89: grabber case art (also auto-runs)
    respawn: () => { scene.controls.reset(); },
    getTv: () => scene.tv,
    playNext: (item) => scene.playNext(item),
    setVisualizer: (viz) => scene.tv?.setVisualizer(viz),
    leaveStore: showEntry,
    shelfUnits: () => scene.shelfUnits(),
    cycleShelf: (unit, dir) => scene.cycleShelf(unit, dir),
    carry: (item) => scene.carry(item),
    carryFormat: (item) => scene.carryFormat(item),
    lockMouse: () => scene.lockMouse(),
    unlockMouse: () => scene.unlockMouse(),
    jukeboxPlay: (item) => scene.jukeboxAudio.play(item, { zone: 'store' }),   // t52: the jukebox lives in the store wing
    // ── t47: THE DJ QUEUE — the playlist brain behind the DJ menu ──
    // ── t52: TWO DECKS — the DJ UI lives on the JUKEBOX *and* the booth now.
    //    Each device owns its queue AND its own audio channel: the jukebox can
    //    spin a record up front while the booth runs a DIFFERENT set in the
    //    dance hall — simultaneously, independently.
    dj: {
      jukebox: makeDeck(() => scene.jukeboxAudio, 'store', 'jukebox'),
      booth: makeDeck(() => scene.djAudio, 'dance', 'booth')
    },
    djDevice: 'booth',                        // which deck the DJ UI drives
    djChannel: () => (ctx.djDevice === 'jukebox' ? scene.jukeboxAudio : scene.djAudio),
    get djQueue() { return this.dj[this.djDevice].queue; },
    get djIdx() { return this.dj[this.djDevice].idx; }, set djIdx(v) { this.dj[this.djDevice].idx = v; },
    get djRepeat() { return this.dj[this.djDevice].repeat; },
    set djRepeat(v) { this.dj[this.djDevice].repeat = v === true ? 'all' : v === false ? 'off' : v; },   // t64: 'off'|'one'|'all' (legacy bools map)
    get djShuffle() { return this.dj[this.djDevice].shuffle; }, set djShuffle(v) { this.dj[this.djDevice].shuffle = !!v; },
    djAdd: (it) => ctx.dj[ctx.djDevice].add(it),
    djRemove: (i) => ctx.dj[ctx.djDevice].remove(i),
    djMove: (i, dir) => ctx.dj[ctx.djDevice].move(i, dir),
    djMoveTo: (f, t) => ctx.dj[ctx.djDevice].moveTo(f, t),   // t64: drag-drop
    djPlayAt: (i, o) => ctx.dj[ctx.djDevice].playAt(i, o),
    djNext: (auto) => ctx.dj[ctx.djDevice].next(auto),
    djPrev: () => ctx.dj[ctx.djDevice].prev(),
    djState: () => ctx.dj[ctx.djDevice].state(),
    jukeboxStop: () => scene.jukeboxAudio.stop(),
    jukeboxNow: () => scene.jukeboxAudio.nowPlaying(),
    jukeboxToggle: () => scene.jukeboxAudio.togglePlay(),
    jukeboxSeek: (s) => scene.jukeboxAudio.seekBy(s),
    jukeboxSetVolume: (v) => scene.jukeboxAudio.setVolume(v),
    jukeboxStats: () => scene.jukeboxAudio.stats(),
    // which room the player stands in — the remote binds to THIS (the wall
    // line z ≈ −6.35 is the store/theater boundary)
    playerRoom: () => {
      const p = scene.debugPose();
      if (p.z < -6.35 && Math.abs(p.x) < 5.6) return 'theater';
      if (p.x > 6.2 && p.z < 9.2) return 'dance';      // t47: the dance wing
      return 'store';
    },
    carried: () => scene.carried(),
    setVhsLook: (on) => scene.setVhsLook(on),
    shelfUnderCrosshair: () => scene.shelfUnderCrosshair(),
    debugShelfHit: () => scene.debugShelfHit(),     // t51 tests: room-gated pick
    // Admin → Shelf Map
    shelfUnits: () => scene.shelfUnits(),
    previewShelves: (map) => scene.setShelfAssignment(map),
    playItem: (item) => {
      // seed the TV queue with the item's own section (its Plex/Jellyfin
      // library, or media type), in the current sort order — repeat plays
      // from there (see the TV remote's repeat button)
      const items = state.items || [];
      const section = item.sectionTitle || item.type;
      const list = items.filter(i => (i.sectionTitle || i.type) === section);
      const index = Math.max(0, list.findIndex(i => i.id === item.id));
      scene.playItem(item, list.length ? { list, index } : undefined);
      toastIt(`▶ Now playing on the store TV: ${item.title}`);
    },
    reloadTv,
    rebuildStore: async () => {
      // prefs may have changed after login/logout/policies
      const r = document.documentElement.style;
      r.setProperty('--vb-accent', state.prefs.theme.accent || '#ffd23f');
      r.setProperty('--vb-accent-soft', `color-mix(in srgb, ${state.prefs.theme.accent || '#ffd23f'} 72%, white)`);
      scene.applyTheme(state.prefs.theme);
      scene.applySorting(state.prefs.sorting);
      scene.setDancePrefs?.(state.prefs.dance);   // t86
      scheduleLocalThumbs();                      // t89: new files may have been grabbed
      ui.updateSidebar();
    },
    reloadLibrary: async () => {
      status.textContent = 'Restocking from your media server…';
      try {
        const lib = await api.library();
        state.items = lib.items;
        state.sections = lib.sections || [];
        state.shelves = lib.shelves || {};
        scene.setItems(state.items, state.prefs.sorting, () => {}, state.shelves);
        await state.refresh();
        ui.updateSidebar();
        toastIt(`Stocked ${lib.count} titles from ${state.boot.source.label}`);
      } catch (err) { toastIt(err.message, true); }
    }
  });
  function toastIt(msg, isError) { ui.toast(msg, isError); }

  // t96: NEW-VERSION NOTICE — quietly ask the server if a newer Home Binger
  // is out; if so, a toast with a link. NEVER downloads anything (you click,
  // you decide — the $0 doctrine). Fails silent.
  async function checkVersion() {
    try {
      const r = await fetch('/api/version/latest');
      if (!r.ok) return;
      const v = await r.json();
      if (v.newer && v.url)
        ui.toast(`🎉 Home Binger ${v.latest} is out! (you have ${v.current})`, false, { text: 'Get it', url: v.url });
    } catch { /* quiet */ }
  }

  // ── support link: click the DOOR (in-store) or the HUD logo → copy ──
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');   // http:// LAN fallback
      ta.remove();
      return ok;
    } catch { return false; }
  }
  function copySupportLink() {
    const url = SUPPORT.url;
    const done = () => ui.toast(SUPPORT.toast);
    const fail = () => ui.toast(`Copy blocked by the browser — the page is ${url}`, true);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => { legacyCopy(url) ? done() : fail(); });
    } else {
      legacyCopy(url) ? done() : fail();
    }
  }
  // "Back to front entrance" (sidebar footer) — the door itself stays
  // decorative for now (future hallway).
  function showEntry() {
    scene.resetToSpawn?.();                 // t52: 'Back to front entrance' also re-poses
    document.exitPointerLock?.();
    $('#crosshair').classList.add('hidden');
    $('#lock-hint')?.classList.add('hidden');
    const loading = $('#loading');
    loading.style.display = '';
    document.body.classList.add('overlay-open');   // t83: front desk owns the CPU
    $('#loading-status').textContent = 'Back at the front entrance — the neon is always on.';
    $('#loading-fill').style.width = '100%';
    $('#btn-enter').classList.remove('hidden');
    renderGate();
  }

  // ── front desk: sign in / create an account before walking in ──
  function renderGate() {
    const card = $('#gate-card'); if (!card) return;
    const me = state.me();
    card.classList.remove('hidden');
    if (me.isGuest) {
      $('#gate-hello').classList.add('hidden');
      $('#gate-form').classList.remove('hidden');
      const allowed = !!state.boot?.registrationAllowed;
      $('#gate-toggle-create').style.display = allowed ? '' : 'none';
      if (!allowed) $('#gate-create').classList.add('hidden');
    } else {
      $('#gate-hello').classList.remove('hidden');
      $('#gate-form').classList.add('hidden');
      $('#gate-who').textContent = me.username;
    }
  }
  function wireGate() {
    const q = (s) => document.querySelector(s);
    const afterAuth = async (msg) => {
      await state.refresh();
      await ctx.rebuildStore();           // shelves may change with the account's mix
      renderGate();
      status.textContent = `${library.count} titles on the shelves. Welcome back, ${state.me().username}!`;
      ui.toast(msg);
    };
    q('#gate-signin').onclick = async () => {
      try { await api.login(q('#gate-user').value.trim(), q('#gate-pass').value); await afterAuth(`Welcome back, ${state.me().username}!`); }
      catch (e) { ui.toast(e.message, true); }
    };
    q('#gate-register').onclick = async () => {
      try { await api.register(q('#gate-reg-user').value.trim(), q('#gate-reg-pass').value); await afterAuth('Account created — your settings now travel with you'); }
      catch (e) { ui.toast(e.message, true); }
    };
    q('#gate-out').onclick = async () => {
      try {
        await api.logout();
        await state.refresh();
        await ctx.rebuildStore();
        renderGate();
        status.textContent = `${library.count} titles on the shelves. Browsing as guest.`;
        ui.toast('Signed out — browsing as guest');
      } catch (e) { ui.toast(e.message, true); }
    };
    q('#gate-toggle-create').onclick = () => q('#gate-create').classList.toggle('hidden');
    q('#gate-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') q('#gate-signin').click(); });
    q('#gate-reg-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') q('#gate-register').click(); });
  }
  $('#brand-chip').addEventListener('click', copySupportLink);

  // Every case opens its detail page — the video button there says
  // "Take off the shelf" (starts the carry-to-theater flow).
  scene.onClick = (item) => ui.showItemModal(item);
  scene.onDeckClick = (payload) => {
    if (!payload) { toastIt('Grab a movie case off the shelves first, then feed it to the deck'); return; }
    ctx.playItem(payload.item);
    scene.setVhsLook(payload.format === 'VHS');
    toastIt(`🎬 ${payload.format} loaded — rolling on the big screen`);
    scene.carry(null);
  };
  scene.onJukeboxClick = () => ui.openDj('jukebox');   // t52: the DJ UI lives on the jukebox now
  scene.onDjClick = () => ui.openDj('booth');                           // t52: booth runs its own deck
  scene.onStreetDoorClick = () => toastIt('🧟 Zombie warning, Stay and party');   // t52
  scene.onRecordClick = (item) => {                                      // spin a vinyl
    if (!item) return;
    ctx.dj.booth.add(item);                            // t52: vinyl feeds the BOOTH deck (dance zone)
    toastIt(`💿 Spinning “${item.title}” on the dance floor`);
  };
  scene.onBinClick = (item) => {
    if (item) { scene.carry(null); toastIt(`📥 “${item.title}” returned — back on the shelf it goes`); }
    else toastIt('Nothing to return — grab a movie off the shelves first');
  };
  scene.onCarryChange = (payload) => ui.updateCarry(payload);
  scene.jukeboxAudio.onEnded(() => ctx.dj.jukebox.next(true));          // t52: each deck auto-advances
  scene.djAudio.onEnded(() => ctx.dj.booth.next(true));                  // on its OWN channel
  scene.onHover = (item) => {
    const tip = $('#tooltip');
    if (!item) { tip.classList.add('hidden'); return; }
    tip.innerHTML = `${escapeHtml(item.title)}<small>${[item.year, TYPE_LABEL[item.type]].filter(Boolean).join(' · ')}</small>`;
    tip.classList.remove('hidden');
  };
  const TYPE_LABEL = { movie: 'Movie', show: 'Series', album: 'Music', musicvideo: 'Music Video', episode: 'Podcast', radio: 'Live Radio', live: 'Live TV' };

  // ready → enter button
  status.textContent = `${library.count} titles on the shelves. ${state.me().isGuest ? 'Browsing as guest.' : `Welcome back, ${state.me().username}!`}`;
  fill.style.width = '100%';
  const enter = $('#btn-enter');
  enter.classList.remove('hidden');
  enter.onclick = () => enterStore(true);
  renderGate();
  wireGate();

  // Handy console handle for debugging/tinkering: window.__VB.scene / .state
  window.__VB = { scene, state, ui, library, mainCtx: ctx, atlases: () => scene.threeScene?._atlases };
  setTimeout(() => ctx.checkVersion?.(), 5000);   // t96: quiet launch check, a beat after the store settles

  // first visit → help overlay
  try {
    if (!localStorage.getItem('vb_seen_help')) $('#help-overlay').classList.remove('hidden');
    localStorage.setItem('vb_seen_help', '1');
  } catch { /* sandboxed/preview — help can just show again */ }

  function enterStore(hideLoading) {
    scene.resetToSpawn?.();                 // t52: every entry = fresh load-in (anti-stuck)
    if (hideLoading) $('#loading').style.display = 'none';
    document.body.classList.remove('overlay-open');   // t83: the store owns the CPU again
    $('#crosshair').classList.remove('hidden');
    // The mouse starts FREE so the menus are usable. Clicking the store
    // captures it for looking around; ESC gives it back at any time.
    const hint = $('#lock-hint');
    hint.classList.remove('hidden');
    let everLocked = false;
    scene.controls.state.onLockChange = (locked) => {
      if (locked) everLocked = true;
      // The hint SWAPS with the mouse state: locked → how to move & get the
      // mouse back; freed → how to grab the mouse again
      hint.textContent = locked
        ? '🎮 W A S D to walk · move the mouse to look · Q or ESC frees the mouse · scroll zooms'
        : (everLocked ? '🖱️ Mouse freed — click the store to look around · Q re-locks'
                      : '🖱️ Click the store to look around · W A S D to walk · Q frees the mouse · scroll to zoom');
      hint.classList.toggle('hidden', scene.controls.state.lockBlocked);
    };
  }

  async function reloadTv() {
    let store = { enabled: true, idleMode: 'standby', title: null };
    try { store = await api.tv(); } catch { /* keep fallback */ }
    // personal idle pick beats the store default ('' = follow the store)
    const mine = state.prefs.tv || {};
    if (mine.idleMode === 'white') {          // t51: the PROJECTOR SCREEN pick was
      scene.tv.setIdle({ enabled: store.enabled, idleMode: 'white', title: null });   // silently dropped here
    } else if (mine.idleMode === 'standby' || mine.idleMode === 'loop') {
      scene.tv.setIdle({ enabled: store.enabled, idleMode: mine.idleMode, title: null });
    } else if (mine.idleMode === 'item') {
      const item = (state.items || []).find(i => i.id === mine.itemId);
      if (item) scene.tv.setIdle({ enabled: store.enabled, idleMode: 'item', title: item.title,
        src: `/api/play/${item.source}/${encodeURIComponent(item.key)}` });
      else scene.tv.setIdle({ enabled: store.enabled, idleMode: store.idleMode, title: store.title });
    } else {
      scene.tv.setIdle({ enabled: store.enabled, idleMode: store.idleMode, title: store.title });
    }
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

boot();

// ── t89: grabber case art ─────────────────────────────────────────────────────
// Local/grabber videos carry no artwork, so the first client to visit grabs a
// frame, POSTs it to the server's thumb cache, and repaints the case. Done
// once per file, ever — later stores just GET the cached image.
const thumbTried = new Set();
function scheduleLocalThumbs() {
  setTimeout(async () => {
    if (document.hidden) return;                    // tries again on next rebuild/visit
    const vids = (state.items || [])
      .filter(i => i.source === 'local' && i.type === 'movie' && !thumbTried.has(i.id))
      .slice(0, 6);                                 // gentle: a few per pass
    for (const item of vids) {
      thumbTried.add(item.id);
      try {
        const r = await fetch(`/img/local/${encodeURIComponent(item.key)}`);
        if (r.ok) continue;                         // already cached — nothing to do
        const dataUrl = await grabVideoFrame(`/api/play/local/${encodeURIComponent(item.key)}`);
        if (!dataUrl) continue;                     // undecodable (e.g. some .mkv) — placeholder stays
        await fetch('/api/thumb/local/' + encodeURIComponent(item.key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl })
        });
        scene.refreshPosters?.([item]);             // repaint the case right now
      } catch { thumbTried.delete(item.id); }       // transient — a later visit retries
    }
  }, 1500);
}

// Seek to ~15% in, paint one frame onto a small canvas, return a JPEG data URL.
function grabVideoFrame(url) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.src = url;
    const finish = (x) => {
      clearTimeout(timer);
      v.onerror = v.onloadeddata = v.onseeked = null;
      v.removeAttribute('src'); try { v.load(); } catch {}
      resolve(x);
    };
    const timer = setTimeout(() => finish(null), 12000);
    v.onerror = () => finish(null);                 // codec the browser can't read → skip
    v.onloadeddata = () => {
      try { v.currentTime = Math.min(Math.max(2, (v.duration || 0) * 0.15), 90); }
      catch { finish(null); }
    };
    v.onseeked = () => {
      try {
        const w = 240, h = Math.max(1, Math.round((v.videoHeight || 320) / ((v.videoWidth || 240) / w)));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        finish(c.toDataURL('image/jpeg', 0.72));
      } catch { finish(null); }
    };
  });
}

