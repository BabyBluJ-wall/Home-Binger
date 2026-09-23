// ─────────────────────────────────────────────────────────────────────────────
//  guide.js — the TV GUIDE · t139h: the owner's pick — BEST OF BOTH
//  (classic mechanics + the new layout; swap via /home/user/guide-variants/swap.sh)
// ─────────────────────────────────────────────────────────────────────────────
//   · FULL SCREEN: the classic mechanics — the video keeps its EXACT size
//     and just slides left of the dock (never stopped, reloaded, resized,
//     or cropped) — carrying the NEW layout: NOW & NEXT rows plus a floating
//     SYNOPSIS card bottom-left, in front of the TV like an AR overlay
//   · WINDOWED (theater): the NEW layout in the OLD drawer fashion — a glass
//     drawer floats in from the right with NO SHADE on the rest of the view:
//     the 3D wall and the theater screen keep playing bright behind it,
//     like someone using meta glasses to see the guide in front of them
//   · NOW & NEXT on every row: current show + episode + neon progress bar +
//     minutes-left chip, and what's on next (click it to preview details
//     without tuning)
//   · AVATAR FREEZE: while the Guide is open every key is isolated
//     (capture-phase stopPropagation) — WASD/arrows never move the avatar
//   · AUTO-ADVANCING CLOCK: every 60s ended shows roll off and rows refresh
//   · Same battle-tested core as always: virtualized list (60fps at any
//     channel count), tidy 3-option filter bars (+N more / − Less, active
//     always visible), instant search (name / number / show), ☆ favorites
//     that survive pack regeneration, honest ● LIVE when no data exists
// ─────────────────────────────────────────────────────────────────────────────
import { state } from './state.js?v=1790065991054';

window.__GUIDE_VARIANT = 'hybrid';   // the suite reads this (variant-aware checks)

let ctx = null;
let open = false;
let groups = [];               // [{ key, title, items }] — the guide's GENRE pages ("All" first)
let catIdx = 0;                // selected genre page (remembered across opens)
let langFilter = 'all';        // t127: 'all' | a language name | '__favs' (remembered across opens)
let provFilter = 'all';        // t138: 'all' | a provider label (remembered)
let favs = new Set();          // t128: favorite channel ids (per profile, rides the prefs)
let lastToggled = null;        // t128: F's fallback — re-star the last one if the favorites page just emptied
let langsExpanded = false;     // t127/t139f: the language bar's +N more / − Less
let catsExpanded = false;      // t139f: the genre bar's +N more / − Less
let provExpanded = false;      // t139f: the provider bar's +N more / − Less
const LANG_MIN = 2;            // a language needs ≥2 channels to earn a pill
const BAR_COLLAPSED = 3;       // t139f: options shown per bar when collapsed (+N more / − Less)
let flat = [];                 // the CURRENT page's channels (search may override), numbered order
let sel = 0;                   // selected index in flat
const offline = new Set();     // item ids that failed to start
let selNext = false;           // t139g: the synopsis is previewing the NEXT programme (not tuning)
let synDismissed = false;      // t143: the ✕ closed the synopsis card — stays closed until the guide reopens

// t139: the virtualized list — rows are absolutely positioned inside a spacer
const ROW_H = 56;              // MUST match .guide-row height in style.css (t143: 60 → 56 — tighter)
const ROW_BUF = 6;             // rows rendered above/below the viewport
let winFirst = -1, winLast = -1;   // the currently rendered window (skip no-op renders)
let flatSeq = 0, winSeq = -1;      // bumped whenever `flat` is REPLACED — same-size pages must re-render

// t139: program data (now/next per channel key) — fetched quietly on open
// t140: TIME TRAVEL — atTime > 0 means the guide is browsing that hour; each
// hour's slice is its own bucket (the server serves ?at= slices), cached so
// flipping back and forth is instant. atTime = 0 is the real "now".
let epgMap = null;                  // the CURRENT bucket's map (may be a future slice)
let epgBucketKey = 0;               // which hour bucket epgMap is from (0 = now)
const epgBuckets = new Map();       // bucketKey → { at, n, map }
let atTime = 0;                     // 0 = now; else an epoch ms (top of a future hour)
let clockTimer = null;        // t139g: the auto-advancing 60s clock (ended shows roll off)

// titles come from public directories — never trust them inside HTML (t126)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function channels() {
  return (state.items || []).filter(i => i.source === 'iptv' && i.type === 'live');
}

// ── t138: the page bar = GENRE pages (the paper guide's sections) ────────────
const GENRE_ORDER = ['News', 'Movies', 'Series', 'Entertainment', 'Kids', 'Anime',
  'Documentary', 'Sports', 'Music', 'Comedy', 'Reality', 'Crime',
  'Sci-Fi & Horror', 'Food & Home', 'Latino', 'Faith', 'Classic TV', 'Public Broadcasters'];

function pagesOf(items) {
  const byGenre = new Map();
  for (const it of items) {
    const g = it.genre;
    if (!g) continue;
    if (!byGenre.has(g)) byGenre.set(g, []);
    byGenre.get(g).push(it);
  }
  const rank = (g) => { const i = GENRE_ORDER.indexOf(g); return i < 0 ? GENRE_ORDER.length : i; };
  const genres = [...byGenre.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  return [{ key: 'all', title: 'All', items: items.slice() },
    ...genres.map(g => ({ key: 'g:' + g, title: g, items: byGenre.get(g) }))];
}

// t138: the provider axis — first-seen order = the admin's pack priority order
function providersOf(items) {
  const map = new Map();                       // label → count
  for (const it of items) {
    const p = it.provider || 'Directory';
    map.set(p, (map.get(p) || 0) + 1);
  }
  return [...map.entries()];
}

// ── t139: program data helpers ───────────────────────────────────────────────
function epgOf(it) { return epgMap?.get?.(it.key) || epgMap?.[it.key] || null; }

function hhmm(ms) {
  try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}

async function fetchEpg(force) {
  const n = channels().length;
  const bucket = atTime ? Math.floor(atTime / 3600000) : 0;
  const hit = epgBuckets.get(bucket);
  // future slices are fixed data (30min TTL); "now" moves (5min TTL)
  if (!force && hit && hit.n === n && Date.now() - hit.at < (atTime ? 30 : 5) * 60000) {
    if (epgBucketKey !== bucket) { epgMap = hit.map; epgBucketKey = bucket; winFirst = -1; render(); }
    return;
  }
  try {
    const r = await fetch('/api/iptv/epg' + (atTime ? `?at=${atTime}` : ''));
    if (!r.ok) return;
    const d = await r.json();
    epgMap = d.epg || {};
    epgBucketKey = bucket;
    epgBuckets.set(bucket, { at: Date.now(), n, map: epgMap });
    // no EPG anywhere → the time bar is meaningless; hide it (checked on the now-bucket)
    const tb = document.querySelector('#guide-time');
    if (tb && !atTime) tb.style.display = Object.keys(epgMap).length ? '' : 'none';
    winFirst = -1;                              // force a re-render with program lines
    render();
  } catch { /* the Guide works without program data — honest ● LIVE rows */ }
}

// ── t140: the TIME BAR — browse the whole published future, hour by hour ────
// (the paper guide's time edge: ▶ Now · 1 PM · 2 PM · … up to +8h, the EPG window)
function timeOptions() {
  const top = new Date(); top.setMinutes(0, 0, 0);
  const out = [0];
  for (let i = 1; i <= 8; i++) out.push(top.getTime() + i * 3600000);
  return out;
}

function renderTime() {
  const bar = document.querySelector('#guide-time');
  if (!bar) return;
  bar.innerHTML = timeOptions().map(t =>
    `<button class="guide-cat time${atTime === t ? ' active' : ''}" data-time="${t}">${t ? esc(hhmm(t).replace(':00', '')) : '▶ Now'}</button>`).join('');
  bar.onclick = (e) => {
    const b = e.target.closest('[data-time]');
    if (!b) return;
    setTime(Number(b.dataset.time));
  };
}

async function setTime(t) {
  if (t === atTime) return;
  atTime = t;
  selNext = false;       // hour browsing shows the AT-time programme, not a stale NEXT preview
  renderTime();          // the chip highlights immediately
  await fetchEpg(true);  // the hour's slice (cached after the first visit)
  renderRows();          // sel/foot/synopsis follow the new programme data
}

export function initGuide(appCtx) {
  ctx = appCtx;
  // t143: keep the dock fitted on resize, and when tv.js docks an
  // already-open guide on fs entry (it can't import us — event, not call)
  window.addEventListener('resize', () => { if (open) fitFsDock(); });
  window.addEventListener('vb-fsdock', () => fitFsDock());

  const modal = document.createElement('div');
  modal.id = 'guide-modal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-card guide-card">
      <div class="guide-head">
        <h2 id="guide-title">📖 TV GUIDE</h2>
        <span class="guide-hint">◀▶ genres · T time travel · P provider · L language · F favorites · / search · ▲▼ channels · Enter tunes (full screen keeps the dock) · G/Esc closes</span>
        <button id="guide-close" class="hud-btn">✕</button>
      </div>
      <div class="guide-searchrow">
        <input id="guide-search" type="search" autocomplete="off" spellcheck="false" maxlength="60"
          placeholder="Search channels — name, number, or show">
      </div>
      <div id="guide-prov" class="guide-cats"></div>
      <div id="guide-cats" class="guide-cats"></div>
      <div id="guide-langs" class="guide-langs"></div>
      <div id="guide-time" class="guide-cats"></div>
      <div id="guide-body"><div id="guide-spacer"></div><div id="guide-rows"></div></div>
      <div id="guide-foot"></div>
      <div id="guide-syn"></div>
    </div>`;
  document.body.appendChild(modal);

  // t139h: the synopsis must sit directly under <body> — it floats as a
  // FIXED card over the playing video, and the glass .guide-card's
  // backdrop-filter would trap a fixed-position descendant.
  const synEl = modal.querySelector('#guide-syn');
  if (synEl) document.body.appendChild(synEl);

  _wireGuideDom();

  modal.addEventListener('click', (e) => { if (e.target === modal) closeGuide(); });
  modal.querySelector('#guide-close').onclick = closeGuide;

  // ── t139g: ONE capture-phase listener — complete key isolation while the
  // Guide is open (the spec's avatar-freeze: WASD/arrows/space/numbers never
  // reach the 3D walk engine). Typing in the search box is left alone.
  window.addEventListener('keydown', (e) => {
    if (!open) {
      if (e.key !== 'g' && e.key !== 'G') return;
      if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
      if (document.querySelector('.modal:not(.hidden)')) return;
      if (!document.getElementById('settings')?.classList.contains('hidden')) return;
      if (ctx.playerRoom?.() !== 'theater') {
        ctx.toast?.('The Guide lives in the theater — walk on in and press G', true);
        return;
      }
      if (!channels().length) {
        ctx.toast?.('No live TV yet — the admin can turn it on in Admin → Media', true);
        return;
      }
      e.preventDefault();
      openGuide();
      return;
    }

    const inSearch = !!e.target?.closest?.('#guide-search');
    if (!inSearch) e.stopPropagation();   // the avatar never moves while the Guide is open

    if (e.key === 'Escape') {
      if (inSearch && e.target.value) { e.target.value = ''; applySearch(''); e.preventDefault(); return; }
      closeGuide(); return;
    }
    if (inSearch) {   // the input owns its keys; Enter watches
      if (e.key === 'Enter') { e.preventDefault(); playSel(); }
      return;
    }
    if (e.key === 'g' || e.key === 'G') { e.preventDefault(); closeGuide(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!groups.length) return;
      applySearch('');
      catIdx = (catIdx + (e.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length;
      setCat(catIdx);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length;
      selNext = false;
      ensureVisible(sel);
      renderRows();
    } else if (e.key === 'l' || e.key === 'L') {
      e.preventDefault();
      const list = langList(channels());
      if (!list.length) return;
      const order = ['__favs', 'all', ...list.map(x => x[0])];
      const i = order.indexOf(langFilter);
      langFilter = i < 0 ? 'all' : order[(i + 1) % order.length];
      applyFilter();
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      // t140: time travel — cycle Now → +1h → … +8h → Now
      const opts = timeOptions();
      setTime(opts[(opts.indexOf(atTime) + 1) % opts.length]);
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      const provs = providersOf(channels());
      if (provs.length < 2) return;
      const order = ['all', ...provs.map(x => x[0])];
      const i2 = order.indexOf(provFilter);
      provFilter = i2 < 0 ? 'all' : order[(i2 + 1) % order.length];
      applyFilter();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFav(flat[sel] || lastToggled);
    } else if (e.key === '/') {
      e.preventDefault();
      document.getElementById('guide-search')?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      playSel();
    }
  }, true);

  // ── the remote's GUIDE button (theater only) ──
  const btn = document.getElementById('tv-guide');
  if (btn) btn.onclick = () => {
    if (ctx.playerRoom?.() !== 'theater') {
      ctx.toast?.('The Guide lives in the theater — walk on in and press G', true);
      return;
    }
    if (open) closeGuide(); else openGuide();
  };
}

// ── t143: ULTRAWIDE FIT — on wide screens the dock sizes itself to the space
// the video PICTURE leaves free, so full screen tiles like two monitors:
// video on the left (fully onscreen, exact size), guide on the right,
// nothing sliding under anything. Needs ≥420px of leftover; below that the
// classic min(760, 46vw) dock applies (16:9 screens keep the old ride-under).
export function fitFsDock() {
  if (!document.body.classList.contains('fs-guide')) return;
  const vid = document.getElementById('vb-fs-video');
  const vw = window.innerWidth, vh = window.innerHeight;
  const ar = (vid && vid.videoWidth && vid.videoHeight) ? vid.videoWidth / vid.videoHeight : 16 / 9;
  const picW = Math.min(vw, vh * ar);          // object-fit:contain picture width
  const leftover = vw - picW;
  const dockW = leftover >= 420 ? Math.min(760, leftover) : Math.min(760, vw * 0.46);
  document.body.style.setProperty('--fs-dock-w', Math.round(dockW) + 'px');
}

export function openGuide() {
  const items = channels();
  if (!items.length) {
    ctx.toast?.('No live TV yet — the admin can turn it on in Admin → Media', true);
    return;
  }
  favs = new Set(Array.isArray(state.prefs?.guideFavs) ? state.prefs.guideFavs : []);   // t128
  if (langFilter !== 'all' && langFilter !== '__favs' && !items.some(c => (c.langs || []).includes(langFilter))) langFilter = 'all';
  const provs = new Set(providersOf(items).map(x => x[0]));
  if (provs.size < 2 || (provFilter !== 'all' && !provs.has(provFilter))) provFilter = 'all';
  groups = pagesOf(filteredChannels());
  const now = ctx.getTv?.()?.stats?.();
  let start = now ? groups.findIndex(g => g.items.some(i => i.title === now.title)) : -1;
  if (start < 0) start = Math.min(catIdx, groups.length - 1);
  if (start < 0) start = 0;
  const searchBox = document.querySelector('#guide-search');
  if (searchBox) searchBox.value = '';
  selNext = false;
  langsExpanded = catsExpanded = provExpanded = false;   // t139f: every open starts tidy
  // t140: every open starts at NOW — if we were browsing a future hour, snap
  // the map back to the cached now-slice (or honest ● LIVE until the fetch lands)
  if (epgBucketKey !== 0) {
    const hit0 = epgBuckets.get(0);
    epgMap = (hit0 && hit0.n === items.length && Date.now() - hit0.at < 30 * 60000) ? hit0.map : null;
    epgBucketKey = 0;
  }
  atTime = 0;
  // t139h: dock FIRST — the bars and the synopsis card must know the mode.
  // Full screen: the video keeps its EXACT size and slides left of the dock
  // (a pure CSS transform — never stopped, reloaded, or resized).
  document.body.classList.toggle('fs-guide', document.body.classList.contains('tv-fullscreen'));
  document.body.classList.add('guide-open');
  synDismissed = false;                        // t143: every open starts with the card (theater mode)
  fitFsDock();                                 // t143: ultrawide fit
  applySearch('');
  renderLangs();
  renderCats();
  renderProv();
  renderTime();   // t140: the time bar (▶ Now · 1 PM · … · +8h)
  setCat(start);
  document.getElementById('guide-modal').classList.remove('hidden');
  document.exitPointerLock?.();   // t125: the mouse is free for clicking
  open = true;
  fetchEpg();
  // t139g: the auto-advancing clock — every 60s the rows re-render (progress
  // bars creep, minutes-left counts down, ended shows roll off to NEXT)
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    if (!open) return;
    fetchEpg();          // refetches only when stale (5min)
    flatSeq++;           // force the window to rebuild with fresh times
    render();
    renderRows();
  }, 60000);
}

export function closeGuide() {
  clearInterval(clockTimer); clockTimer = null;   // t139g
  document.getElementById('guide-modal')?.classList.add('hidden');
  document.getElementById('guide-search')?.blur();
  document.body.classList.remove('guide-open');
  document.body.classList.remove('fs-guide');   // the video animates back to full size
  open = false;
}

// ── t127: the language bar ───────────────────────────────────────────────────
function langList(items) {
  const tally = new Map();
  for (const it of items) for (const l of (it.langs || [])) tally.set(l, (tally.get(l) || 0) + 1);
  return [...tally.entries()].filter(([, n]) => n >= LANG_MIN)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function filteredChannels() {
  const all = channels();
  let out = langFilter === '__favs' ? all.filter(c => favs.has(c.id))   // t128
    : langFilter === 'all' ? all : all.filter(c => (c.langs || []).includes(langFilter));
  if (provFilter !== 'all') out = out.filter(c => (c.provider || 'Directory') === provFilter);   // t138
  return out;
}

// t128: star a channel — saved to this profile's prefs, live on every row
function toggleFav(it) {
  if (!it) return;
  lastToggled = it;
  if (favs.has(it.id)) favs.delete(it.id); else favs.add(it.id);
  state.updatePrefs?.({ guideFavs: [...favs] });
  if (langFilter === '__favs') applyFilter();
  else {
    renderLangs();
    document.querySelectorAll(`[data-star="${CSS.escape(it.id)}"]`).forEach(b => {
      b.classList.toggle('on', favs.has(it.id));
      b.textContent = favs.has(it.id) ? '★' : '☆';
    });
    renderSyn();
  }
}

function renderLangs() {
  const all = channels();
  const list = langList(all);
  const bar = document.querySelector('#guide-langs');
  if (list.length < 2) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
  bar.style.display = '';
  let idxs = list.map((_, i) => i);
  if (!langsExpanded) {
    idxs = idxs.slice(0, BAR_COLLAPSED);
    const ai = list.findIndex(([name]) => name === langFilter);
    if (ai >= 0 && !idxs.includes(ai)) idxs.push(ai);
  }
  const hidden = list.length - idxs.length;
  const favCount = all.filter(c => favs.has(c.id)).length   // t128
  bar.innerHTML =
    `<button class="guide-lang fav${langFilter === '__favs' ? ' active' : ''}" data-lang="__favs">★ Favorites<small>${favCount}</small></button>` +
    `<button class="guide-lang${langFilter === 'all' ? ' active' : ''}" data-lang="all">All<small>${all.length}</small></button>` +
    idxs.map(i => `<button class="guide-lang${langFilter === list[i][0] ? ' active' : ''}" data-lang="${esc(list[i][0])}">${esc(list[i][0])}<small>${list[i][1]}</small></button>`).join('') +
    (langsExpanded ? `<button class="guide-lang more" data-less="1">− Less</button>`
      : hidden > 0 ? `<button class="guide-lang more" data-more="1">+${hidden} more</button>` : '');
  bar.onclick = (e) => {
    if (e.target.closest('[data-less]')) { langsExpanded = false; renderLangs(); return; }
    if (e.target.closest('[data-more]')) { langsExpanded = !langsExpanded; renderLangs(); return; }
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    langFilter = b.dataset.lang || 'all';
    applyFilter();
  };
}

function applyFilter() {
  const curKey = groups[catIdx]?.key;
  groups = pagesOf(filteredChannels());
  const idx = groups.findIndex(g => g.key === curKey);
  catIdx = idx >= 0 ? idx : 0;
  renderLangs();
  renderCats();
  renderProv();
  setCat(catIdx);
}

// ── the genre bar: tidy (All + 3), +N more / − Less, active always visible ──
function renderCats() {
  const bar = document.querySelector('#guide-cats');
  const entries = groups.map((g, i) => ({ g, i }));
  let shown = catsExpanded ? entries : entries.slice(0, 1 + BAR_COLLAPSED);
  if (!catsExpanded && !shown.some(e => e.i === catIdx) && entries.length > shown.length && groups[catIdx]) shown.push(entries[catIdx]);
  const hidden = entries.length - shown.length;
  const pill = ({ g, i }) => `<button class="guide-cat${i === catIdx ? ' active' : ''}" data-cat="${i}">${esc(g.title)}<small>${g.items.length}</small></button>`;
  bar.innerHTML = shown.map(pill).join('') +
    (catsExpanded ? `<button class="guide-cat more" data-less="1">− Less</button>`
      : hidden > 0 ? `<button class="guide-cat more" data-morebar="1">+${hidden} more</button>` : '');
  bar.onclick = (e) => {
    if (e.target.closest('[data-less]')) { catsExpanded = false; renderCats(); return; }
    if (e.target.closest('[data-morebar]')) { catsExpanded = true; renderCats(); return; }
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    applySearch('');
    setCat(Number(b.dataset.cat));
  };
}

// ── the provider bar: tidy (All + 3), +N more / − Less, active always visible ──
function renderProv() {
  const bar = document.querySelector('#guide-prov');
  const all = channels();
  const langOnly = langFilter === '__favs' ? all.filter(c => favs.has(c.id))
    : langFilter === 'all' ? all : all.filter(c => (c.langs || []).includes(langFilter));
  const provs = providersOf(langOnly);
  if (provs.length < 2) { bar.innerHTML = ''; bar.style.display = 'none'; return; }
  bar.style.display = '';
  const entries = [{ key: 'all', label: 'All providers', n: langOnly.length },
    ...provs.map(([p, n]) => ({ key: p, label: p, n }))];
  let shown = provExpanded ? entries : entries.slice(0, 1 + BAR_COLLAPSED);
  if (!provExpanded && !shown.some(e => e.key === provFilter) && entries.length > shown.length) {
    const active = entries.find(e => e.key === provFilter);
    if (active) shown.push(active);
  }
  const hidden = entries.length - shown.length;
  const pill = (e) => `<button class="guide-cat prov${provFilter === e.key ? ' active' : ''}" data-prov="${esc(e.key)}">${esc(e.label)}<small>${e.n}</small></button>`;
  bar.innerHTML = shown.map(pill).join('') +
    (provExpanded ? `<button class="guide-cat more" data-less="1">− Less</button>`
      : hidden > 0 ? `<button class="guide-cat more" data-morebar="1">+${hidden} more</button>` : '');
  bar.onclick = (e) => {
    if (e.target.closest('[data-less]')) { provExpanded = false; renderProv(); return; }
    if (e.target.closest('[data-morebar]')) { provExpanded = true; renderProv(); return; }
    const b = e.target.closest('[data-prov]');
    if (!b) return;
    provFilter = b.dataset.prov || 'all';
    applyFilter();
  };
}

// ── t139: instant search — name, channel number, or the show airing now ─────
let searchTimer = null;
function applySearch(q) {
  const box = document.querySelector('#guide-search');
  if (box && document.activeElement === box) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(box.value), 150);   // debounced
  } else {
    runSearch(q);
  }
}
function runSearch(qRaw) {
  const q = String(qRaw || '').trim().toLowerCase();
  const g = groups[catIdx] || { items: [] };
  if (!q) {
    flat = g.items.slice();
    flatSeq++;
    if (sel >= flat.length) sel = 0;
    setCat(catIdx, true);
    return;
  }
  const pool = (groups[0] && groups[0].key === 'all' ? groups[0].items : channels());
  const pageKeys = new Set(g.items);
  flat = pool.filter(it => {
    if (g.key !== 'all' && !pageKeys.has(it)) return false;
    if (String(it.title || '').toLowerCase().includes(q)) return true;
    if (it.chno && String(it.chno) === q.replace(/\D/g, '')) return true;
    const e = epgOf(it);
    if (e && String(e.now?.t || '').toLowerCase().includes(q)) return true;
    return false;
  });
  flatSeq++;
  sel = 0;
  document.querySelectorAll('#guide-cats .guide-cat').forEach((b, i) => b.classList.toggle('dim', i !== 0 && catIdx !== 0));
  render();
}

function setCat(i, quiet) {
  catIdx = i;
  const g = groups[catIdx] || { items: [] };
  flat = g.items.slice();
  flatSeq++;
  sel = 0;
  selNext = false;
  document.querySelectorAll('#guide-cats .guide-cat').forEach((b, bi) => {
    b.classList.toggle('active', bi === catIdx);
    b.classList.remove('dim');
  });
  render();
}

// ── t139g: the NOW & NEXT row ────────────────────────────────────────────────
function rowHTML(it, idx) {
  const e = epgOf(it);
  const num = it.chno ? String(it.chno) : String(idx + 1).padStart(3, '0');
  let nowCell = '<span class="guide-epg live">● LIVE</span>';
  if (e?.now) {
    if (atTime) {
      // t140: browsing a future hour — the programme airing THEN, with its time range
      nowCell = `<span class="guide-epg">${esc(e.now.t)}${e.now.ep ? ` <i>${esc(e.now.ep)}</i>` : ''}` +
        `<em class="guide-left">${hhmm(e.now.s)}–${hhmm(e.now.e)}</em></span>`;
    } else {
      const total = Math.max(1, e.now.e - e.now.s);
      const pct = Math.max(2, Math.min(100, Math.round((Date.now() - e.now.s) / total * 100)));
      const mins = Math.max(0, Math.round((e.now.e - Date.now()) / 60000));
      nowCell = `<span class="guide-epg">${esc(e.now.t)}${e.now.ep ? ` <i>${esc(e.now.ep)}</i>` : ''}` +
        `<span class="guide-prog"><b style="width:${pct}%"></b></span>` +
        `<em class="guide-left">${mins}m left</em></span>`;
    }
  }
  const nextCell = e?.next?.t
    ? `<span class="guide-next" title="What's on next">${esc(e.next.t)}<small>${hhmm(e.next.s)}</small></span>`
    : '<span class="guide-next dim">—</span>';
  const logo = it.logo
    ? `<img class="guide-logo" src="${esc(it.logo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  return `<div class="guide-row${offline.has(it.id) ? ' isoff' : ''}" data-gidx="${idx}" data-cid="${esc(it.id)}" style="top:${idx * ROW_H}px">
      <span class="guide-num">${esc(num)}</span>
      ${logo}
      <span class="guide-mid">
        <span class="guide-name">${esc(it.title)}</span>
      </span>
      <span class="guide-now">${nowCell}</span>
      ${nextCell}
      <span class="guide-prov">${esc(it.provider || 'Directory')}</span>
      <button class="guide-star${favs.has(it.id) ? ' on' : ''}" data-star="${esc(it.id)}" title="Favorite (F)">${favs.has(it.id) ? '★' : '☆'}</button>
    </div>`;
}

function render() {
  const body = document.querySelector('#guide-body');
  const rowsBox = document.querySelector('#guide-rows');
  const spacer = document.querySelector('#guide-spacer');
  if (!body || !rowsBox || !spacer) return;
  spacer.style.height = `${flat.length * ROW_H}px`;
  if (!flat.length) {
    winFirst = winLast = -1;
    rowsBox.innerHTML = `<div class="hint" style="padding:14px 10px">${langFilter === '__favs' ? 'No favorites yet — click the ☆ on a channel row (or press F) to pin it here.' : 'Nothing on this page.'}</div>`;
    renderFoot();
    renderSyn();
    return;
  }
  const st = body.scrollTop, vh = body.clientHeight || 600;
  const first = Math.max(0, Math.floor(st / ROW_H) - ROW_BUF);
  const last = Math.min(flat.length, Math.ceil((st + vh) / ROW_H) + ROW_BUF);
  if (first === winFirst && last === winLast && winSeq === flatSeq) { renderRows(); return; }
  winFirst = first; winLast = last; winSeq = flatSeq;
  let html = '';
  for (let i = first; i < last; i++) html += rowHTML(flat[i], i);
  rowsBox.innerHTML = html;
  renderRows();
}

function ensureVisible(idx) {
  const body = document.querySelector('#guide-body');
  if (!body) return;
  const top = idx * ROW_H, bottom = top + ROW_H;
  if (top < body.scrollTop) body.scrollTop = top;
  else if (bottom > body.scrollTop + body.clientHeight) body.scrollTop = bottom - body.clientHeight;
  render();
}

function renderRows() {
  document.querySelectorAll('#guide-rows .guide-row').forEach(r => {
    r.classList.toggle('sel', Number(r.dataset.gidx) === sel);
  });
  renderFoot();
  renderSyn();
}

// ── t143: the synopsis card lives in the THEATER (windowed) guide — the
//    owner's call: full screen keeps the video pristine (the dock footer
//    carries the info + Watch there). Floating AR glass over the theater
//    view; the ✕ dismisses it until the guide is opened again.
function renderSyn() {
  const syn = document.querySelector('#guide-syn');
  if (!syn) return;
  const it = flat[sel];
  if (!it || document.body.classList.contains('fs-guide') || synDismissed) {
    syn.classList.add('closed'); syn.innerHTML = ''; return;
  }
  syn.classList.remove('closed');
  const e = epgOf(it);
  const prog = selNext ? e?.next : e?.now;   // clicking NEXT previews the future programme
  const future = atTime > 0;                 // t140: browsing a future hour
  let inner = '';
  if (e?.now) {
    const total = Math.max(1, e.now.e - e.now.s);
    const pct = Math.max(2, Math.min(100, Math.round((Date.now() - e.now.s) / total * 100)));
    const mins = Math.max(0, Math.round((e.now.e - Date.now()) / 60000));
    inner = `
      <div class="syn-now">
        <span class="syn-label">${selNext ? 'NEXT UP' : future ? `AT ${hhmm(atTime)}` : 'NOW PLAYING'}</span>
        <span class="syn-title">${esc(prog?.t || '')}</span>
        ${prog?.ep ? `<span class="syn-ep">${esc(prog.ep)}</span>` : ''}
        ${prog?.r ? `<span class="syn-rate">${esc(prog.r)}</span>` : ''}
        <span class="syn-time">${hhmm(prog?.s || e.now.s)} – ${hhmm(prog?.e || e.now.e)}${(!selNext && !future) ? ` · ${mins}m left` : ''}</span>
        ${(!selNext && !future) ? `<span class="guide-prog big"><b style="width:${pct}%"></b></span>` : ''}
      </div>
      ${prog?.d ? `<p class="syn-desc">${esc(prog.d)}</p>` : ''}
      ${e.next?.t && !selNext ? `<button class="syn-nextbtn" data-synnext="1">Next: ${esc(e.next.t)} ›</button>` : ''}`;
  } else {
    inner = `<div class="syn-now"><span class="syn-label">LIVE</span><span class="syn-title">${esc(it.title)}</span>
      <span class="syn-time">No published schedule for this channel.</span></div>`;
  }
  syn.innerHTML = `
    <div class="syn-card">
      <button class="syn-close" data-synclose="1" title="Close the channel info">✕</button>
      ${it.logo ? `<img class="syn-logo" src="${esc(it.logo)}" alt="" onerror="this.style.display='none'">` : ''}
      <div class="syn-chan">
        <span class="syn-name">${esc(it.title)}</span>
        <span class="syn-meta">${esc(it.provider || 'Directory')}${it.chno ? ` · Ch ${esc(it.chno)}` : ''}</span>
      </div>
      ${inner}
      <div class="syn-actions">
        <button class="syn-btn primary" data-synwatch="1">▶ Watch channel</button>
        <button class="syn-btn${favs.has(it.id) ? ' on' : ''}" data-synfav="1">${favs.has(it.id) ? '★ Favorited' : '☆ Favorite'}</button>
      </div>
    </div>`;
  syn.onclick = (ev) => {
    if (ev.target.closest('[data-synwatch]')) { playSel(); return; }
    if (ev.target.closest('[data-synfav]')) { toggleFav(it); return; }
    if (ev.target.closest('[data-synclose]')) { synDismissed = true; syn.classList.add('closed'); syn.innerHTML = ''; return; }
    if (ev.target.closest('[data-synnext]')) { selNext = !selNext; renderSyn(); return; }
  };
}

// ── the footer (windowed mode) — the selected channel's now → next ───────────
function renderFoot() {
  const foot = document.querySelector('#guide-foot');
  if (!foot) return;   // t139h: CSS alone decides — the syn card owns WIDE fs, this footer everywhere else
  const it = flat[sel];
  if (!it) { foot.innerHTML = ''; return; }
  const e = epgOf(it);
  const left = [`<b>${esc(it.title)}</b>`, esc(it.provider || 'Directory')];
  if (it.chno) left.push(`Ch ${esc(it.chno)}`);
  if (atTime) left.unshift(`At ${hhmm(atTime)}`);   // t140: the time-travel context
  const watch = `<button class="syn-btn primary foot-watch" data-footwatch="1" title="Watch this channel">▶ Watch</button>`;   // t143: fs tunes from the footer (the card is theater-only now)
  if (e?.now) {
    const mins = Math.max(0, Math.round((e.now.e - Date.now()) / 60000));
    let now = `${esc(e.now.t)}${e.now.ep ? ` · ${esc(e.now.ep)}` : ''} · ${hhmm(e.now.s)}–${hhmm(e.now.e)}` +
      (atTime ? '' : mins > 0 ? ` · ${mins}m left` : '');
    if (e.next?.t) now += ` → <span class="next">${esc(e.next.t)}</span>`;
    foot.innerHTML = `<span class="fchan">${left.join(' · ')}</span><span class="fnow">${now}</span>${watch}`;
  } else {
    foot.innerHTML = `<span class="fchan">${left.join(' · ')}</span><span class="fnow">● LIVE</span>${watch}`;
  }
  foot.onclick = (ev) => { if (ev.target.closest('[data-footwatch]')) playSel(); };
}

// wire the scroll + clicks once, at init time
export function _wireGuideDom() {
  const body = document.querySelector('#guide-body');
  if (!body || body.dataset.wired) return;
  body.dataset.wired = '1';
  let scrollQ = false;
  body.addEventListener('scroll', () => {
    if (scrollQ) return;
    scrollQ = true;
    setTimeout(() => { scrollQ = false; render(); }, 16);
  }, { passive: true });
  body.onclick = (e) => {
    const star = e.target.closest('[data-star]');               // the star never plays
    if (star) {
      const it = flat.find(c => c.id === star.dataset.star)
        || groups.flatMap(g => g.items).find(c => c.id === star.dataset.star)
        || channels().find(c => c.id === star.dataset.star);
      if (it) toggleFav(it);
      return;
    }
    const nextBtn = e.target.closest('.guide-next');            // t139g: NEXT previews, never tunes
    if (nextBtn) {
      const row = nextBtn.closest('[data-gidx]');
      if (row) { sel = Number(row.dataset.gidx); selNext = true; renderRows(); }
      return;
    }
    const row = e.target.closest('[data-gidx]');
    if (!row) return;
    sel = Number(row.dataset.gidx);
    selNext = false;
    playSel();
  };
  const box = document.querySelector('#guide-search');
  if (box) {
    box.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { applySearch(''); }, 150);   // debounced (150ms)
      if (box.value.length === 1 && catIdx !== 0) setCat(0, true);  // typing starts global — hop to All
    });
  }
}

function playSel() {
  const it = flat[sel];
  if (!it) return;
  selNext = false;
  ctx.playItem?.(it);
  // t145: FULL-SCREEN SURFING — picking a channel keeps the dock up (the
  // owner's two-monitor flow: video left, guide right, flip freely). The
  // windowed/theater guide still closes on tune, as it always did.
  if (!document.body.classList.contains('fs-guide')) closeGuide();
  const t0 = Date.now();
  const check = setInterval(() => {
    const st = ctx.getTv?.()?.stats?.();
    const liveOk = st && !st.paused && st.time > 0.5;
    if (liveOk || Date.now() - t0 > 12000) {
      clearInterval(check);
      if (!liveOk) {
        offline.add(it.id);
        ctx.toast?.(`“${it.title}” seems offline — flipping past it`, true);
        if (Date.now() - t0 > 12000) {
          const nxt = flat[(sel + 1) % flat.length];
          if (nxt && nxt.id !== it.id) { sel = (sel + 1) % flat.length; ctx.playItem?.(nxt); }
        }
      }
    }
  }, 1000);
}

export function guideInfo() {
  return { open, channels: channels().length, groups: groups.length, offline: offline.size,
    providers: providersOf(channels()).length, genres: Math.max(0, groups.length - 1), provFilter,
    epg: epgMap ? Object.keys(epgMap).length : 0,
    at: atTime,   // t140: 0 = now; else the browsed hour (epoch ms)
    rendered: document.querySelectorAll('#guide-rows .guide-row').length,
    total: flat.length };
}
