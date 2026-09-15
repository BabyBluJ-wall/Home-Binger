// ─────────────────────────────────────────────────────────────────────────────
//  guide.js — the TV GUIDE (t123, reworked t126). Nostalgia piece, owner-designed:
//   · CATEGORY TABS across the top — click one (or press ◀/▶) to flip to that
//     section of the guide, exactly like turning to a page of the old paper
//     TV guides; the channel list below shows only that category
//   · numbered channel rows (001, 002, …) — numbering restarts per category,
//     the way each page of a paper guide had its own listings
//   · honest ● LIVE cells — free channels publish no schedules, and we never
//     fabricate listings (measured: no free EPG covers FAST channels)
//   · ▲/▼ flips channel-to-channel instantly on the theater screen
//   · G key (in the theater) + the remote's 📖 GUIDE button open it; opening
//     frees the mouse (t125) so rows are clickable mid-walk
//   · dead/geo-blocked streams are marked offline, never wedge anything
// ─────────────────────────────────────────────────────────────────────────────
import { state } from './state.js?v=1789342462621';

let ctx = null;
let open = false;
let groups = [];               // [{ key, title, items }] — the guide's categories
let catIdx = 0;                // selected category (remembered across opens)
let langFilter = 'all';        // t127: 'all' | a language name | '__favs' (remembered across opens)
let favs = new Set();          // t128: favorite channel ids (per profile, rides the prefs)
let lastToggled = null;        // t128: F's fallback — re-star the last one if the favorites page just emptied
let langsExpanded = false;     // t127: the "+N more" expander for the long tail
const LANG_MIN = 2;            // a language needs ≥2 channels to earn a pill
const LANG_MAX_COLLAPSED = 7;  // pills before "+N more" (105 languages live in the unverified tier)
let flat = [];                 // the CURRENT category's channels, numbered order
let sel = 0;                   // selected index in flat
const offline = new Set();     // item ids that failed to start

// titles come from a public directory — never trust them inside HTML (t126)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function channels() {
  return (state.items || []).filter(i => i.source === 'iptv' && i.type === 'live');
}

function groupsOf(items) {
  const map = new Map();
  for (const it of items) {
    const k = it.sectionId || 'iptv:other';
    if (!map.has(k)) map.set(k, { key: k, title: it.sectionTitle || 'Channels', items: [] });
    map.get(k).items.push(it);
  }
  return [...map.values()];
}

export function initGuide(appCtx) {
  ctx = appCtx;

  const modal = document.createElement('div');
  modal.id = 'guide-modal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-card guide-card">
      <div class="guide-head">
        <h2 id="guide-title">📖 TV GUIDE</h2>
        <span class="guide-hint">◀▶ categories · L language · F favorites · ▲▼ channels · Enter · G/Esc closes</span>
        <button id="guide-close" class="hud-btn">✕</button>
      </div>
      <div id="guide-langs" class="guide-langs"></div>
      <div id="guide-cats" class="guide-cats"></div>
      <div id="guide-body"></div>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', (e) => { if (e.target === modal) closeGuide(); });
  modal.querySelector('#guide-close').onclick = closeGuide;

  // ── the G key (theater only, nothing else open, not typing) ──
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'g' && e.key !== 'G') return;
    if (open) { closeGuide(); return; }
    if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (document.querySelector('.modal:not(.hidden)')) return;
    if (!document.getElementById('settings')?.classList.contains('hidden')) return;
    if (ctx.playerRoom?.() !== 'theater') {
      ctx.toast?.('The Guide lives in the theater — walk on in and press G', true);
      return;
    }
    if (!channels().length) {
      // t134 (novice pass): G with live TV switched off used to be a SILENT
      // dead key — same friendly hint the Guide panel itself gives, right
      // where you pressed it.
      ctx.toast?.('No live TV yet — the admin can turn it on in Admin → Media', true);
      return;
    }
    e.preventDefault();
    openGuide();
  });

  // ── key handling while open: ◀▶ categories, ▲▼ channels, Enter watches ──
  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { closeGuide(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (!groups.length) return;
      catIdx = (catIdx + (e.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length;
      setCat(catIdx);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + flat.length) % flat.length;
      renderRows();
      document.querySelector(`[data-gidx="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'l' || e.key === 'L') {
      // t127: flip through languages (the pills on screen — expand "+N more" for the rest)
      e.preventDefault();
      const list = langList(channels());
      if (!list.length) return;
      const order = ['__favs', 'all', ...list.slice(0, langsExpanded ? list.length : LANG_MAX_COLLAPSED).map(x => x[0])];
      const i = order.indexOf(langFilter);
      langFilter = i < 0 ? 'all' : order[(i + 1) % order.length];
      applyFilter();
    } else if (e.key === 'f' || e.key === 'F') {
      // t128: star/unstar the selected channel (the last one, if the
      // favorites page just went empty under the selection)
      e.preventDefault();
      toggleFav(flat[sel] || lastToggled);
    } else if (e.key === 'Enter') {
      playSel();
    }
  });

  // ── the remote's GUIDE button (theater only — t130: the Guide is the
  //    theater's feature; the button also hides outside the theater) ──
  const btn = document.getElementById('tv-guide');
  if (btn) btn.onclick = () => {
    if (ctx.playerRoom?.() !== 'theater') {
      ctx.toast?.('The Guide lives in the theater — walk on in and press G', true);
      return;
    }
    if (open) closeGuide(); else openGuide();
  };
}

export function openGuide() {
  const items = channels();
  if (!items.length) {
    ctx.toast?.('No live TV yet — the admin can turn it on in Admin → Media', true);
    return;
  }
  favs = new Set(Array.isArray(state.prefs?.guideFavs) ? state.prefs.guideFavs : []);   // t128
  // t127: a remembered language filter can outlive a config change — if it
  // no longer matches any channel, drop back to All ('__favs' always stands)
  if (langFilter !== 'all' && langFilter !== '__favs' && !items.some(c => (c.langs || []).includes(langFilter))) langFilter = 'all';
  groups = groupsOf(filteredChannels());
  // start where the action is: the category of whatever is on the TV now;
  // otherwise the last category browsed (clamped), else the first
  const now = ctx.getTv?.()?.stats?.();
  let start = now ? groups.findIndex(g => g.items.some(i => i.title === now.title)) : -1;
  if (start < 0) start = Math.min(catIdx, groups.length - 1);
  if (start < 0) start = 0;
  renderLangs();
  renderCats();
  setCat(start);
  document.getElementById('guide-modal').classList.remove('hidden');
  document.exitPointerLock?.();   // t125: G while walking frees the mouse for clicking rows
  // t134: in TRUE full screen the Guide DOCKS on the right — the video keeps
  // its exact size (1:1, never rescaled) and slides left to make room
  document.body.classList.toggle('fs-guide', document.body.classList.contains('tv-fullscreen'));
  open = true;
}

export function closeGuide() {
  document.getElementById('guide-modal')?.classList.add('hidden');
  document.body.classList.remove('fs-guide');   // t134: video slides back to center
  open = false;
}

// ── t127: the language bar — pick a language and every category page shows
//    only that language's channels (the Spanish section of the paper guide) ──
function langList(items) {
  const tally = new Map();
  for (const it of items) for (const l of (it.langs || [])) tally.set(l, (tally.get(l) || 0) + 1);
  return [...tally.entries()].filter(([, n]) => n >= LANG_MIN)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function filteredChannels() {
  const all = channels();
  if (langFilter === '__favs') return all.filter(c => favs.has(c.id));   // t128
  return langFilter === 'all' ? all : all.filter(c => (c.langs || []).includes(langFilter));
}

// t128: star a channel — saved to this profile's prefs, live on every row
function toggleFav(it) {
  if (!it) return;
  lastToggled = it;
  if (favs.has(it.id)) favs.delete(it.id); else favs.add(it.id);
  state.updatePrefs?.({ guideFavs: [...favs] });
  if (langFilter === '__favs') applyFilter();   // the favorites page just changed shape
  else {
    renderLangs();                              // pill count + the row's star
    document.querySelectorAll(`[data-star="${CSS.escape(it.id)}"]`).forEach(b => {
      b.classList.toggle('on', favs.has(it.id));
      b.textContent = favs.has(it.id) ? '★' : '☆';
    });
  }
}

function renderLangs() {
  const all = channels();
  const list = langList(all);
  const bar = document.querySelector('#guide-langs');
  if (list.length < 2) { bar.innerHTML = ''; bar.style.display = 'none'; return; }   // nothing to separate
  bar.style.display = '';
  const shown = langsExpanded ? list : list.slice(0, LANG_MAX_COLLAPSED);
  const hidden = list.length - shown.length;
  const favCount = all.filter(c => favs.has(c.id)).length;   // t128
  bar.innerHTML =
    `<button class="guide-lang fav${langFilter === '__favs' ? ' active' : ''}" data-lang="__favs">★ Favorites<small>${favCount}</small></button>` +
    `<button class="guide-lang${langFilter === 'all' ? ' active' : ''}" data-lang="all">All<small>${all.length}</small></button>` +
    shown.map(([name, n]) => `<button class="guide-lang${langFilter === name ? ' active' : ''}" data-lang="${esc(name)}">${esc(name)}<small>${n}</small></button>`).join('') +
    (hidden > 0 ? `<button class="guide-lang more" data-more="1">+${hidden} more</button>` : '');
  bar.onclick = (e) => {
    if (e.target.closest('[data-more]')) { langsExpanded = !langsExpanded; renderLangs(); return; }
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    langFilter = b.dataset.lang || 'all';
    applyFilter();
  };
}

// re-derive everything under the current language filter, keeping the
// category (by key) when it still exists
function applyFilter() {
  const curKey = groups[catIdx]?.key;
  groups = groupsOf(filteredChannels());
  const idx = groups.findIndex(g => g.key === curKey);
  catIdx = idx >= 0 ? idx : 0;
  renderLangs();
  renderCats();
  setCat(catIdx);
}

// ── the category bar: one button per category, channel count on each ──
function renderCats() {
  const bar = document.querySelector('#guide-cats');
  bar.innerHTML = groups.map((g, i) => `
    <button class="guide-cat${i === catIdx ? ' active' : ''}" data-cat="${i}">
      ${esc(g.title)}<small>${g.items.length}</small>
    </button>`).join('');
  bar.onclick = (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    setCat(Number(b.dataset.cat));
  };
}

// ── show one category's channels — numbering restarts at 001 (a fresh page) ──
function setCat(i) {
  catIdx = i;
  const g = groups[catIdx] || { items: [] };
  flat = g.items.slice();
  sel = 0;
  const body = document.querySelector('#guide-body');
  body.innerHTML = flat.length ? flat.map((it, idx) => `
    <div class="guide-row" data-gidx="${idx}" data-cid="${esc(it.id)}">
      <span class="guide-num">${String(idx + 1).padStart(3, '0')}</span>
      <span class="guide-name">${esc(it.title)}</span>
      <button class="guide-star${favs.has(it.id) ? ' on' : ''}" data-star="${esc(it.id)}" title="Favorite (F)">${favs.has(it.id) ? '★' : '☆'}</button>
      <span class="guide-cell ${offline.has(it.id) ? 'off' : ''}">
        ${offline.has(it.id) ? '✕ channel offline' : '● LIVE'}
      </span>
    </div>`).join('') : `<div class="hint" style="padding:14px 10px">${langFilter === '__favs' ? 'No favorites yet — click the ☆ on a channel row (or press F) to pin it here.' : 'Nothing on this page.'}</div>`;
  body.scrollTop = 0;
  body.onclick = (e) => {
    const star = e.target.closest('[data-star]');               // t128: the star never plays
    if (star) {
      // resolve against the GUIDE's own snapshot first — a library reload in
      // flight can momentarily empty state.items and silently eat the click
      const it = flat.find(c => c.id === star.dataset.star)
        || groups.flatMap(g => g.items).find(c => c.id === star.dataset.star)
        || channels().find(c => c.id === star.dataset.star);
      if (it) toggleFav(it);
      return;
    }
    const row = e.target.closest('[data-gidx]');
    if (!row) return;
    sel = Number(row.dataset.gidx);
    playSel();
  };
  document.querySelectorAll('.guide-cat').forEach((b, bi) => b.classList.toggle('active', bi === catIdx));
  renderRows();
}

function renderRows() {
  document.querySelectorAll('.guide-row').forEach(r => {
    r.classList.toggle('sel', Number(r.dataset.gidx) === sel);
  });
}

function playSel() {
  const it = flat[sel];
  if (!it) return;
  // mark offline if it fails to start within a grace window (never wedge)
  ctx.playItem?.(it);
  closeGuide();
  const t0 = Date.now();
  const check = setInterval(() => {
    const st = ctx.getTv?.()?.stats?.();
    const liveOk = st && !st.paused && st.time > 0.5;
    if (liveOk || Date.now() - t0 > 12000) {
      clearInterval(check);
      if (!liveOk) {
        offline.add(it.id);
        ctx.toast?.(`“${it.title}” seems offline — flipping past it`, true);
        // auto-advance to the next channel (the dial-flip feel)
        if (Date.now() - t0 > 12000) {
          const nxt = flat[(sel + 1) % flat.length];
          if (nxt && nxt.id !== it.id) { sel = (sel + 1) % flat.length; ctx.playItem?.(nxt); }
        }
      }
    }
  }, 1000);
}

export function guideInfo() {
  return { open, channels: channels().length, groups: groups.length, offline: offline.size };
}
