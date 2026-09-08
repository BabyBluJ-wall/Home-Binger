// ─────────────────────────────────────────────────────────────────────────────
//  ui.js — every panel, modal and widget (no framework, just DOM)
//  ───────────────────────────────────────────────────────────────────────────
//  The side menu opens SETTINGS inside the app. Regular users get:
//    My Theme · My Shelves · Profile
//  Admins additionally get:
//    Server (Plex/Jellyfin) · Store TV · Users · Policies (locks & defaults)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { api } from './api.js?v=1788905515415';
import { createCaseView } from './store3d/caseview.js?v=1788905515415';   // the 3D case in the item modal
import { state } from './state.js?v=1788905515415';
import { SORT_MODES, SHELF_STYLES } from './store3d/config.js?v=1788905515415';
import { placeholderDataUrl } from './store3d/textures.js?v=1788905515415';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ⚙️ EDIT ME — one-click theme presets shown in My Theme
const THEME_PRESETS = [
  { name: 'Video Store Classic', theme: { wall: '#12275e', floor: '#131d40', shelf: '#8a5a33', accent: '#ffd23f', style: 'wood' } },
  { name: 'Neon Night',          theme: { wall: '#0a0f2e', floor: '#0b0e24', shelf: '#23306b', accent: '#ff3ea5', style: 'metal' } },
  { name: 'Cozy Video Store',    theme: { wall: '#5a3d24', floor: '#4a3220', shelf: '#7c5230', accent: '#ffb52e', style: 'wood' } },
  { name: 'Midnight Modern',     theme: { wall: '#101820', floor: '#0c1118', shelf: '#2a3440', accent: '#00e5ff', style: 'metal' } },
  { name: 'Retro Mall',          theme: { wall: '#274e6d', floor: '#1e3a50', shelf: '#9c6b3c', accent: '#7dffa0', style: 'wood' } }
];

const TYPE_LABELS = { movie: 'Movie', show: 'TV Series', album: 'Music Album', musicvideo: 'Music Video', live: 'Live TV' };

export function initUI(ctx) {
  // ctx = { applyTheme, applySorting, rebuildStore, respawn, reloadLibrary, enterStore }

  // ── toasts ──
  function toast(msg, isError = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 3400);
    setTimeout(() => el.remove(), 3900);
  }

  // ── sidebar ──
  const openSidebar = () => {
    $('#sidebar-backdrop').classList.remove('hidden');
    $('#sidebar').classList.remove('hidden');
    updateSidebar();
  };
  const closeSidebar = () => {
    $('#sidebar-backdrop').classList.add('hidden');
    $('#sidebar').classList.add('hidden');
  };
  $('#btn-menu').onclick = openSidebar;
  $('#btn-sidebar-close').onclick = closeSidebar;
  $('#sidebar-backdrop').onclick = closeSidebar;

  for (const link of document.querySelectorAll('.side-link')) {
    link.onclick = () => {
      // "Admin sign-in" now lives at the front entrance — walk them there
      if (link.id === 'nav-admin-login') {
        closeSidebar();
        ctx.leaveStore();
        setTimeout(() => document.getElementById('gate-user')?.focus(), 150);
        return;
      }
      closeSidebar(); openSettings(link.dataset.tab);
    };
  }

  function updateSidebar() {
    const me = state.me();
    $('#sidebar-user').textContent = me?.isGuest ? 'Guest' : (me?.username || 'Guest');
    $('#sidebar-usersub').textContent = me?.isGuest
      ? 'preferences saved to this device'
      : (me?.isAdmin ? 'administrator — syncs everywhere' : 'account — syncs everywhere');
    for (const el of document.querySelectorAll('.admin-only')) {
      el.classList.toggle('hidden', !state.isAdmin());
    }
    // "Admin sign-in" is only useful to guests — admins already have the sections
    for (const el of document.querySelectorAll('.guest-only')) {
      el.classList.toggle('hidden', !!me && !me.isGuest);
    }
    const src = state.boot?.source;
    const chip = $('#sidebar-source');
    chip.textContent = src?.ok ? `${src.label}${src.name ? ` — ${src.name}` : ''}` : `${src?.label || '?'} — ${src?.error || 'offline'}`;
    chip.className = 'source-chip ' + (src?.ok ? 'ok' : 'bad');
  }

  // ── settings shell ──
  const TITLES = {
    look: 'My Theme', shelves: 'My Shelves', media: 'My Media', profile: 'My Profile',
    admin: 'Admin'
  };
  function openSettings(tab) {
    $('#settings-title').textContent = TITLES[tab] || 'Settings';
    $('#settings-body').innerHTML = '';
    ({
      look: panelLook, shelves: panelShelves, media: panelMedia, profile: panelProfile,
      admin: panelAdmin
    }[tab] || panelLook)($('#settings-body'));
    $('#settings').classList.remove('hidden');
    document.body.classList.add('overlay-open');   // t83: pauses the 3D scene while a modal owns the screen
    document.exitPointerLock?.();
  }
  const closeSettings = () => {
    $('#settings').classList.add('hidden');
    document.body.classList.remove('overlay-open');   // t83
  };
  $('#btn-settings-close').onclick = closeSettings;
  $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') closeSettings(); });

  // ═══════════════ MY THEME ═══════════════
  function panelLook(root) {
    const prefs = state.prefs;
    if (state.boot.locks.theme) {
      root.insertAdjacentHTML('afterbegin',
        `<div class="locked-note">🔒 The store manager has locked theming for everyone — the house look below applies to all visitors.</div>`);
    }
    root.innerHTML += `
      <div class="section-title">Presets</div>
      <div class="presets">
        ${THEME_PRESETS.map((p, i) => `<button class="preset-btn" data-preset="${i}">${esc(p.name)}</button>`).join('')}
      </div>
      <div class="section-title">Colors</div>
      ${colorRow('wall', 'Wall color')}
      ${colorRow('floor', 'Floor / carpet')}
      ${colorRow('shelf', 'Shelf unit color')}
      ${colorRow('accent', 'Accent / lighting')}
      <div class="section-title">Shelf style</div>
      <div class="field">
        <select id="theme-style" ${state.boot.locks.theme ? 'disabled' : ''}>
          ${Object.entries(SHELF_STYLES).map(([id, s]) =>
            `<option value="${id}" ${prefs.theme.style === id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <button class="btn" id="theme-reset">Reset to store default</button>

      <div class="section-title" style="margin-top:22px">TV visualizer</div>
      <div class="radio-cards">
        ${VIZ_STYLES.map(([id, label, sub]) => `
          <button class="radio-card ${(state.prefs.visualizer || {}).style === id ? 'active' : ''}" data-viz="${id}">
            ${label}<small>${sub}</small></button>`).join('')}
      </div>
      <div class="hint" style="margin:-6px 0 14px">What the screen shows while music, podcasts or radio play — it always wears your theme accent.</div>

      <div class="section-title" style="margin-top:22px">Dance floor lights</div>
      <div class="hint" style="margin:-4px 0 10px">The rig wakes when the dance hall's own music plays — these shape how hard it dances. Yours on every device.</div>
      <div class="field"><label>Intensity <span id="dance-int-val"></span></label><input type="range" id="dance-int" min="0.2" max="2.5" step="0.1"></div>
      <div class="field"><label>Speed <span id="dance-spd-val"></span></label><input type="range" id="dance-spd" min="0.3" max="2.5" step="0.1"></div>
      <div class="field"><label>Mirror ball spin <span id="dance-ball-val"></span></label><input type="range" id="dance-ball" min="0" max="3" step="0.1"></div>
      <div class="field"><label>Pattern</label>
        <select id="dance-pattern">
          <option value="auto">Auto — rotate with the music</option>
          <option value="0">Sweep</option><option value="1">Chase</option>
          <option value="2">Strobe</option><option value="3">Build &amp; drop</option>
        </select>
      </div>

      <div class="section-title">My TV idle screen</div>
      <div class="radio-cards">
        ${[['', 'Store default', 'whatever the manager set'],
           ['white', 'Projector screen', 'blank white — ready for the reel'],
           ['standby', 'Standby card', 'the classic "now playing: nothing"'],
           ['loop', 'Synthwave loop', 'built-in attraction channel'],
           ['item', 'A favorite title', 'loops quietly on the TV']]
          .map(([id, label, sub]) => `
          <button class="radio-card ${((state.prefs.tv || {}).idleMode || 'white') === id ? 'active' : ''}" data-idle="${id}">
            ${label}<small>${sub}</small></button>`).join('')}
      </div>
      <div class="field" id="idle-item-wrap" style="margin-top:10px">
        <label>Favorite title (plays muted until you interact)</label>
        <select id="idle-item" ${((state.prefs.tv || {}).idleMode === 'item') ? '' : 'disabled'}>
          ${(state.items || []).filter(i => ['movie', 'show', 'musicvideo', 'live'].includes(i.type)).slice(0, 400).map(i =>
            `<option value="${esc(i.id)}" ${(state.prefs.tv || {}).itemId === i.id ? 'selected' : ''}>${esc(i.title)}</option>`).join('')}
        </select>
        <div class="hint">Yours only — everyone else's store TV keeps their own idle screen.</div>
      </div>
      ${state.isAdmin() ? `
      <details style="margin-top:18px">
        <summary style="cursor:pointer;font-weight:600;color:var(--vb-accent,#ffd23f)">🛠️ Admin · store TV defaults</summary>
        <div id="tv-admin-body" style="margin-top:12px"></div>
      </details>` : ''}
    `;
    const bindColor = (key, input) => {
      input.oninput = () => {
        if (state.boot.locks.theme) return;
        ctx.applyTheme({ [key]: input.value });
        scheduleSave();
      };
    };
    let saveTimer;
    const scheduleSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => state.updatePrefs({ theme: state.prefs.theme }), 350);
    };
    for (const key of ['wall', 'floor', 'shelf', 'accent']) {
      const input = root.querySelector(`[data-color="${key}"]`);
      bindColor(key, input);
    }
    root.querySelectorAll('.preset-btn').forEach(btn => {
      btn.onclick = () => {
        if (state.boot.locks.theme) return;
        const preset = THEME_PRESETS[btn.dataset.preset];
        Object.assign(state.prefs.theme, preset.theme);
        for (const key of ['wall', 'floor', 'shelf', 'accent']) {
          root.querySelector(`[data-color="${key}"]`).value = preset.theme[key];
        }
        root.querySelector('#theme-style').value = preset.theme.style;
        ctx.applyTheme(preset.theme);
        scheduleSave();
        toast(`Theme: ${preset.name}`);
      };
    });
    root.querySelector('#theme-style').onchange = (e) => {
      ctx.applyTheme({ style: e.target.value });
      scheduleSave();
    };
    // ── TV visualizer (compiled in from the old My Visualizer panel) ──
    root.querySelectorAll('[data-viz]').forEach(card => {
      card.onclick = () => {
        root.querySelectorAll('[data-viz]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const next = { style: card.dataset.viz };
        ctx.setVisualizer(next);
        state.updatePrefs({ visualizer: next });
      };
    });
    // t86: dance-floor light engine — sliders + pattern, live-applied
    {
      const D = state.prefs.dance || { intensity: 1, speed: 1, ballSpin: 1, pattern: 'auto' };
      const setDance = (patch) => {
        state.updatePrefs({ dance: patch });
        ctx.applyDancePrefs(state.prefs.dance);
      };
      const bindSlider = (id, valId, key, fmt) => {
        const el = root.querySelector('#' + id), lab = root.querySelector('#' + valId);
        if (!el) return;
        el.value = D[key];
        lab.textContent = fmt(D[key]);
        el.oninput = () => { lab.textContent = fmt(+el.value); setDance({ [key]: +el.value }); };
      };
      bindSlider('dance-int', 'dance-int-val', 'intensity', v => v + '×');
      bindSlider('dance-spd', 'dance-spd-val', 'speed', v => v + '×');
      bindSlider('dance-ball', 'dance-ball-val', 'ballSpin', v => v === 0 ? 'still' : v + '×');
      const pat = root.querySelector('#dance-pattern');
      if (pat) { pat.value = String(D.pattern ?? 'auto'); pat.onchange = () => setDance({ pattern: pat.value }); }
    }
    // ── personal TV idle pick ──
    root.querySelectorAll('[data-idle]').forEach(card => {
      card.onclick = () => {
        root.querySelectorAll('[data-idle]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const mode = card.dataset.idle;
        root.querySelector('#idle-item').disabled = mode !== 'item';
        state.updatePrefs({ tv: { idleMode: mode } });
        ctx.reloadTv();
      };
    });
    root.querySelector('#idle-item').onchange = (e) => {
      state.updatePrefs({ tv: { itemId: e.target.value, idleMode: 'item' } });
      ctx.reloadTv();
      toast('Idle title saved — it loops on the TV whenever nothing is playing');
    };
    // admin store-TV defaults live inside the theme panel now
    if (state.isAdmin()) panelTV(root.querySelector('#tv-admin-body'));
    root.querySelector('#theme-reset').onclick = () => {
      const d = state.boot.defaults.theme;
      Object.assign(state.prefs.theme, d);
      for (const key of ['wall', 'floor', 'shelf', 'accent']) {
        root.querySelector(`[data-color="${key}"]`).value = d[key];
      }
      root.querySelector('#theme-style').value = d.style;
      ctx.applyTheme(d);
      scheduleSave();
    };
  }
  function colorRow(key, label) {
    return `<div class="color-row">
      <input type="color" data-color="${key}" value="${state.prefs.theme[key]}" ${state.boot.locks.theme ? 'disabled' : ''}>
      <span class="color-name">${label}</span>
      <span class="color-hex">${state.prefs.theme[key]}</span>
    </div>`;
  }

  // ═══════════════ MY SHELVES ═══════════════
  function panelShelves(root) {
    const s = state.prefs.sorting;
    if (state.boot.locks.sorting) {
      root.insertAdjacentHTML('afterbegin',
        `<div class="locked-note">🔒 The store manager has locked shelf arrangement — everyone browses the manager's favorite order.</div>`);
    }
    root.innerHTML += `
      <div class="section-title">Arrange the store by…</div>
      <div class="radio-cards">
        ${SORT_MODES.map(m => `
          <button class="radio-card ${s.mode === m.id ? 'active' : ''}" data-mode="${m.id}" ${state.boot.locks.sorting ? 'disabled' : ''}>
            ${m.label}<small>${modeHint(m.id)}</small>
          </button>`).join('')}
      </div>
      <div class="section-title">Direction</div>
      <div class="field">
        <select id="sort-dir" ${state.boot.locks.sorting ? 'disabled' : ''}>
          <option value="desc" ${s.dir === 'desc' ? 'selected' : ''}>Descending (newest / best / A→Z first)</option>
          <option value="asc" ${s.dir === 'asc' ? 'selected' : ''}>Ascending</option>
        </select>
        <div class="hint">Your arrangement is saved to your profile and restocks the shelves instantly. The hanging aisle signs re-label themselves too.</div>
      </div>

      <div class="section-title" style="margin-top:22px">Shelf map — what goes where</div>
      <div class="hint" style="margin:-4px 0 12px">Park a section on a specific shelf unit — Sci-Fi on the back wall, podcasts by the register, whatever feels right. Unmapped units keep the automatic mix. Grouping modes (Genre / By Library) shape the AUTOMATIC mix; pinned shelves always show their own section. Yours alone (until an admin locks arrangement).</div>
      <div id="shelf-map-rows"></div>
      <div id="shelf-stale-note" style="display:none"></div>
      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
        <button class="btn" id="btn-shelves-reset" ${state.boot.locks.sorting ? 'disabled' : ''}>All automatic</button>
        <button class="btn accent" id="btn-shelves-save" ${state.boot.locks.sorting ? 'disabled' : ''}>Done</button>
      </div>`;
    root.querySelectorAll('.radio-card').forEach(card => {
      card.onclick = () => {
        if (state.boot.locks.sorting) return;
        root.querySelectorAll('.radio-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        state.updatePrefs({ sorting: { mode: card.dataset.mode } });
        ctx.applySorting(state.prefs.sorting);
      };
    });
    root.querySelector('#sort-dir').onchange = (e) => {
      state.updatePrefs({ sorting: { dir: e.target.value } });
      ctx.applySorting(state.prefs.sorting);
    };

    // ── shelf map (public now — per-user pref) ──
    const rows = root.querySelector('#shelf-map-rows');
    const units = ctx.shelfUnits ? ctx.shelfUnits() : [];
    const sections = state.sections || [];
    const myMap = { ...(state.shelves || {}) };
    // t45: music NEVER stocks the shelf units — and the JUKEBOX is selectable
    // here like a shelf, so the wall unit can carry any ONE music section
    // ('' = all of them). Sections split by what's actually in them.
    const audioItems = (state.items || []).filter(i => ['album', 'radio', 'episode'].includes(i.type));
    const mGroups = new Map();          // sectionKey → { key, name, count } — built from the
    for (const it of audioItems) {      // ITEMS, so it works even when state.sections
      const k = it.sectionId || it.sectionTitle || it.type;   // doesn't list music at all
      if (!mGroups.has(k)) mGroups.set(k, { key: k, name: it.sectionTitle || k, count: 0, source: it.source });
      mGroups.get(k).count++;
    }
    const musicKeys = new Set(mGroups.keys());
    const videoSections = sections.filter(sec => !musicKeys.has(sec.key));
    const musicSections = [...mGroups.values()].sort((a, b) => a.name.localeCompare(b.name));
    // t88 BUG 5: two libraries both called "Movies" must not read identical —
    // when a name repeats, every option carries its source: "Plex · Movies".
    const SRC_LABEL = { plex: 'Plex', jellyfin: 'Jellyfin', archive: 'Archive', radio: 'Radio', local: 'Grabber' };
    const nameCount = new Map();
    for (const sec of [...videoSections, ...musicSections]) nameCount.set(sec.name, (nameCount.get(sec.name) || 0) + 1);
    const secLabel = (sec) => nameCount.get(sec.name) > 1
      ? `${sec.sourceLabel || SRC_LABEL[sec.source] || sec.source || 'Media'} · ${sec.name}` : sec.name;   // t87: instance names
    // t88 BUG 1b: saved keys that no longer match any section are SHOWN, not
    // silently swapped for the automatic mix.
    const availKeys = new Set([...videoSections.map(s => s.key), ...musicSections.map(g => g.key)]);
    const stale = Object.entries(myMap).filter(([unit, k]) => unit !== 'jukebox' && k && !availKeys.has(k));
    const staleOption = (k) => `<option value="${esc(k)}" selected>⚠ ${esc(k)} — no longer available</option>`;
    if (!sections.length) {
      rows.innerHTML = '<div class="locked-note">No sections found yet — connect a source or enable free shelves first (an admin does that in Admin → Server).</div>';
    } else if (!units.length) {
      rows.innerHTML = '<div class="hint">Shelf units not ready yet — reopen this panel in a moment.</div>';
    } else {
      // 🎵 JUKEBOX FIRST — impossible to miss — then the wall shelves
      rows.innerHTML = (musicSections.length ? `
        <div class="lib-row juke-map-row" style="cursor:default">
          <b style="min-width:150px">🎵 Jukebox</b>
          <select data-unit="jukebox" ${state.boot.locks.sorting ? 'disabled' : ''} style="margin-left:auto;max-width:55%">
            <option value="">All music (${audioItems.length})</option>
            ${musicSections.map(g => `<option value="${esc(g.key)}" ${myMap.jukebox === g.key ? 'selected' : ''}>${esc(secLabel(g))} (${g.count})</option>`).join('')}
          </select>
        </div>` : `
        <div class="lib-row juke-map-row" style="cursor:default;opacity:.65">
          <b style="min-width:150px">🎵 Jukebox</b>
          <small style="margin-left:auto;color:var(--vb-muted)">no music yet — switch on Radio in My Media</small>
        </div>`)
        + units.map(u => `
        <div class="lib-row" style="cursor:default">
          <b style="min-width:150px">${esc(u.label)}</b>
          <select data-unit="${esc(u.id)}" ${state.boot.locks.sorting ? 'disabled' : ''} style="margin-left:auto;max-width:55%">
            <option value="">Automatic (mixed)</option>
            ${(stale.some(([unit]) => unit === u.id) && myMap[u.id] ? staleOption(myMap[u.id]) : '')}
            ${videoSections.map(sec => `<option value="${esc(sec.key)}" ${myMap[u.id] === sec.key ? 'selected' : ''}>${esc(secLabel(sec))} (${sec.count})</option>`).join('')}
          </select>
        </div>`).join('');
      rows.querySelectorAll('[data-unit]').forEach(sel => {
        sel.onchange = () => {
          if (sel.value) myMap[sel.dataset.unit] = sel.value;
          else delete myMap[sel.dataset.unit];
          ctx.previewShelves({ ...myMap });          // live preview behind the panel
          state.updatePrefs({ shelves: { ...myMap } });   // t88 BUG 2 FIX: commit-on-change —
          state.shelves = { ...myMap };                   // the preview IS the saved map, always
        };
      });
    }
    if (stale.length) {
      const note = root.querySelector('#shelf-stale-note');
      note.style.display = 'block';
      note.innerHTML = `<div class="locked-note" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        ⚠ ${stale.length} pinned section${stale.length > 1 ? 's' : ''} no longer exist${stale.length > 1 ? '' : 's'} (library renamed or a source changed) — those shelves are showing the automatic mix.
        <button class="btn" id="btn-shelves-clean">Remove missing</button></div>`;
      note.querySelector('#btn-shelves-clean').onclick = () => {
        for (const [unit] of stale) delete myMap[unit];
        state.updatePrefs({ shelves: { ...myMap } });
        state.shelves = { ...myMap };
        ctx.previewShelves({ ...myMap });
        root.innerHTML = '';    // re-render clean (panelShelves appends, not replaces)
        panelShelves(root);
      };
    }
    root.querySelector('#btn-shelves-reset').onclick = () => {
      const clear = { jukebox: '' };                       // '' = delete after merge — t88: jukebox too
      for (const u of units) clear[u.id] = '';
      Object.keys(myMap).forEach(k => delete myMap[k]);
      rows.querySelectorAll('[data-unit]').forEach(sel => sel.value = '');
      ctx.previewShelves({});
      state.updatePrefs({ shelves: clear });               // keys are DELETED, never stored as ''
      state.shelves = {};
      toast('Back to the automatic mix');
    };
    root.querySelector('#btn-shelves-save').onclick = () => {   // t88 BUG 2: everything already
      toast('Shelf map saved — every change was live');         // saved on change; Done just closes
      closeSettings();
    };
  }
  const modeHint = (id) => ({
    recent: 'newest titles by the door', genre: 'classics grouped with aisle signs',
    alpha: 'A–Z with letter-range signs', rating: 'highest rated first',
    year: 'newest/oldest releases', type: 'movies · TV · music sections'
  }[id]);

  // ═══════════════ MY MEDIA (public — everyone's own source mix) ═══════════════
  async function panelMedia(root) {
    let cat;
    try { cat = await api.sources(); }
    catch (e) { root.innerHTML = `<div class="locked-note">${esc(e.message)}</div>`; return; }
    const mine = state.prefs.sources || null;
    const d = cat.storeDefaults;
    const eff = mine || {
      plex: d.sources.plex, jellyfin: d.sources.jellyfin,
      archive: d.archive, radio: d.radio
    };
    eff.archive = mine ? (mine.archive ?? d.archive) : d.archive;
    eff.radio = mine ? (mine.radio ?? d.radio) : d.radio;
    root.innerHTML = `
      <p class="hint" style="margin:0 0 6px">Choose what stocks <b>your</b> shelves — the store's setup is the default; flip anything to make it yours. (Connections are set by an admin in Admin → Server.)</p>
      ${mine ? '' : '<div class="hint" style="margin:0 0 12px">✨ Currently following the store\'s setup.</div>'}
      ${cat.available.plex ? `
      <div class="toggle-row">
        <div><div class="t-label">🛰️ Plex</div><div class="t-sub">this store's Plex server</div></div>
        <label class="switch"><input type="checkbox" id="md-plex" ${eff.plex ? 'checked' : ''}><span class="track"></span></label>
      </div>` : ''}
      ${cat.available.jellyfin ? `
      <div class="toggle-row">
        <div><div class="t-label">🛰️ Jellyfin</div><div class="t-sub">this store's Jellyfin server</div></div>
        <label class="switch"><input type="checkbox" id="md-jf" ${eff.jellyfin ? 'checked' : ''}><span class="track"></span></label>
      </div>` : ''}
      ${(cat.instances || []).filter(i => i.ready).map(i => `
      <div class="toggle-row">
        <div><div class="t-label">🛰️ ${esc(i.name)}</div><div class="t-sub">extra ${i.kind === 'plex' ? 'Plex' : 'Jellyfin'} connection</div></div>
        <label class="switch"><input type="checkbox" id="md-inst-${CSS.escape(i.id)}" ${(mine ? mine[i.id] : i.on) !== false ? 'checked' : ''}><span class="track"></span></label>
      </div>`).join('')}
      <div class="section-title" style="margin-top:14px">🎞️ Classics wing</div>
      <div id="media-archive" class="lib-list">
        ${cat.archive.map(c => `<label class="lib-row"><input type="checkbox" value="${esc(c.key)}" ${eff.archive.includes(c.key) ? 'checked' : ''}>
          <b>${esc(c.title)}</b><small>free</small></label>`).join('')}
      </div>
      <div class="section-title" style="margin-top:14px">📻 Radio wall</div>
      <div id="media-radio" class="lib-list">
        ${cat.radio.map(g => `<label class="lib-row"><input type="checkbox" value="${esc(g.key)}" ${eff.radio.includes(g.key) ? 'checked' : ''}>
          <b>${esc(g.title)}</b><small>free</small></label>`).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn" id="media-follow">↺ Follow the store's setup</button>
        <button class="btn accent" id="media-save">Save my media mix</button>
      </div>
      <div class="hint" style="margin-top:10px">Your mix is saved to your profile and restocks <b>your</b> shelves only — everyone else keeps theirs.</div>`;
    const build = () => {
      const out = {
        plex: cat.available.plex ? root.querySelector('#md-plex')?.checked ?? false : null,
        jellyfin: cat.available.jellyfin ? root.querySelector('#md-jf')?.checked ?? false : null,
        archive: [...root.querySelectorAll('#media-archive input:checked')].map(c => c.value),
        radio: [...root.querySelectorAll('#media-radio input:checked')].map(c => c.value)
      };
      for (const i of (cat.instances || [])) {          // t87: per-instance toggles
        const el = root.querySelector(`#md-inst-${CSS.escape(i.id)}`);
        if (el) out[i.id] = el.checked;
      }
      return out;
    };
    root.querySelector('#media-save').onclick = async () => {
      state.updatePrefs({ sources: build() });
      toast('Media mix saved — restocking your shelves…');
      closeSettings();
      await ctx.reloadLibrary();
    };
    root.querySelector('#media-follow').onclick = async () => {
      state.updatePrefs({ sources: null });
      toast('Following the store\'s setup again');
      closeSettings();
      await ctx.reloadLibrary();
    };
  }

  // ═══════════════ PROFILE ═══════════════
  // t84: one-tap invite — shows & copies this store's LAN address, so friends
  // connect without any "which IP do I type?" archaeology. Works for guests
  // too (it's the store's address, not the account's).
  function loadInvite(root) {
    fetch('/api/lan').then(r => r.json()).then(({ urls }) => {
      const box = root.querySelector('#invite-box'); if (!box) return;
      if (!urls?.length) { box.innerHTML = `<div class="hint">This store isn't reachable over the local network right now.</div>`; return; }
      const primary = urls[0];
      const copy = () => {
        const done = () => toast('Address copied — send it to a friend');
        const fallback = () => {   // http:// LAN isn't a secure context → clipboard API may be absent
          const ta = document.createElement('textarea'); ta.value = primary; document.body.appendChild(ta); ta.select();
          let ok = false; try { ok = document.execCommand('copy'); } catch {}
          ta.remove(); ok ? done() : toast(primary, true);
        };
        try { navigator.clipboard.writeText(primary).then(done, fallback); } catch { fallback(); }
      };
      box.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <code style="flex:1;min-width:170px;padding:8px 10px;border:1px solid var(--vb-line,#2a3354);border-radius:8px;background:rgba(10,12,30,.55);font-size:13px">${esc(primary)}</code>
          <button class="btn accent" id="btn-copy-lan">📋 Copy address</button>
        </div>
        ${urls.length > 1 ? `<div class="hint" style="margin-top:6px">Other networks: ${urls.slice(1).map(esc).join(' · ')}</div>` : ''}
        <div class="hint" style="margin-top:6px">Anyone on the same Wi-Fi opens that in any browser — nothing to install.</div>`;
      box.querySelector('#btn-copy-lan').onclick = copy;
    }).catch(() => {});
  }

  function panelProfile(root) {
    const me = state.me();
    if (!me?.isGuest) {
      root.innerHTML = `
        <div class="section-title">Signed in</div>
        <p style="margin:0 0 6px">You're <b>${esc(me.username)}</b>${me.isAdmin ? ' <span class="badge admin">ADMIN</span>' : ''}.</p>
        <p class="hint" style="margin:0 0 18px">Your theme &amp; sorting follow your account on every device you sign in from.</p>
        <div class="section-title">My name</div>
        <div class="row2">
          <div class="field"><label>Display name</label><input type="text" id="me-name" maxlength="32" value="${esc(me.username)}"></div>
          <div class="field" style="align-self:end"><button class="btn accent" id="name-save">Update name</button></div>
        </div>
        <div class="hint" style="margin:-4px 0 16px">This is what you sign in as and what admins see — your shelves and settings stay put.</div>
        <div class="section-title">Change password</div>
        <div class="row2">
          <div class="field"><label>Current password</label><input type="password" id="pw-old"></div>
          <div class="field"><label>New password</label><input type="password" id="pw-new"></div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap">
          <button class="btn accent" id="pw-save">Update password</button>
          <button class="btn" id="btn-logout">Sign out</button>
        </div>
        <div class="section-title" style="margin-top:20px">Start fresh</div>
        <button class="btn" id="btn-reset-all">↺ Reset ALL my settings</button>
        <div class="hint" style="margin-top:6px">Theme, shelves, shelf map, TV pick and media mix all return to the store defaults — no reinstall needed.</div>
        <div class="section-title" style="margin-top:20px">Invite a friend</div>
        <div id="invite-box"><div class="hint">…</div></div>`;
      root.querySelector('#name-save').onclick = async () => {
        try {
          await api.renameSelf(root.querySelector('#me-name').value.trim());
          toast('Name updated');
          await state.refresh();
          ui.updateSidebar();
          panelProfile(root);        // re-render with the new name
        } catch (err) { toast(err.message, true); }
      };
      root.querySelector('#pw-save').onclick = async (e) => {
        try {
          await api.changePassword(root.querySelector('#pw-old').value, root.querySelector('#pw-new').value);
          toast('Password updated'); closeSettings();
        } catch (err) { toast(err.message, true); }
      };
      root.querySelector('#btn-logout').onclick = async () => {
        await api.logout();
        await state.refresh();
        await ctx.rebuildStore();
        updateSidebar();
        toast('Signed out — back to guest mode (this device)');
        closeSettings();
      };
      loadInvite(root);
      return;
    }
    root.innerHTML = `
      <div class="section-title">Guest mode</div>
      <p class="hint" style="margin:0 0 18px">You're browsing as a guest. Your theme &amp; shelf arrangement are saved
      automatically to <b>this device/browser</b> and persist between visits — no account needed.
      Create an account at the <b>front entrance</b> if you'd like them to <b>sync across your devices</b>.</p>
      <div class="section-title">Start fresh</div>
      <button class="btn" id="btn-reset-all">↺ Reset ALL my settings</button>
      <div class="hint" style="margin:6px 0 18px">Theme, shelves, shelf map, TV pick and media mix all return to the store defaults — no reinstall needed.</div>
      <div class="section-title">Invite a friend</div>
      <div id="invite-box"><div class="hint">…</div></div>
      <div class="section-title" style="margin-top:18px">Sign in</div>
      <p class="hint" style="margin:0 0 14px">🔑 First time? The store manager account is
      <b>BabyBluJ</b> / <b>BluJNetwork</b> — sign in at the front entrance, then change it in ☰ Menu → Admin → Users.<br>🔑 Accounts live at the <b>front entrance</b> now —
      use <b>🚪 Back to front entrance</b> in the sidebar and sign in (or create an account) right
      at the front desk, then walk straight into your media. Admins get their panels in ☰ Menu
      once they're in.</p>`;
    loadInvite(root);
  }

  // ═══════════════ ADMIN · ALL IN ONE PLACE (t82: server + users + policies under one tab) ═══════════════
  function panelAdmin(root) {
    const SUBS = [['server', '🛰️ Server'], ['users', '🧑‍💼 Users'], ['policies', '🔒 Policies']];
    let sub = panelAdmin.current || 'server';
    root.innerHTML = `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${SUBS.map(([k, label]) => `<button class="btn small admin-sub" data-sub="${k}">${label}</button>`).join('')}
      </div>
      <div id="admin-sub-body"></div>`;
    const body = root.querySelector('#admin-sub-body');
    const draw = () => {
      root.querySelectorAll('.admin-sub').forEach(b => b.style.opacity = b.dataset.sub === sub ? '' : '.55');
      body.innerHTML = '';
      ({ server: panelServer, users: panelUsers, policies: panelPolicies }[sub] || panelServer)(body);
    };
    root.querySelectorAll('.admin-sub').forEach(b => b.onclick = () => { sub = b.dataset.sub; panelAdmin.current = sub; draw(); });
    draw();
  }

  // ═══════════════ ADMIN · SERVER ═══════════════
  // ═══════════════ LIVE TV GUIDE (everyone) ═══════════════
  // Channels come from a DVR tuner/antenna on the connected media server.
  // Each channel is also a 📺 VHS case on the shelves (sort by Library/Type).
  function panelLiveTV(root) {
    const items = (state.items || []).filter(i => i.type === 'live');
    if (!items.length) {
      root.innerHTML = `
        <p class="hint" style="margin:0 0 10px">No live channels are coming from your media server right now.</p>
        <div class="locked-note">
          Live TV needs a <b>tuner</b> on the server itself — in Plex:
          <b>Settings → Live TV &amp; DVR</b> (an antenna, HDHomeRun, or IPTV tuner).
          Once Plex/Jellyfin exposes channels, they appear here AND as 📺 cases
          on the shelves. <b>Admin → Server → Test connection</b> reports how
          many channels your server currently exposes.
        </div>`;
      return;
    }
    root.innerHTML = `
      <p class="hint" style="margin:0 0 12px">${items.length} channels from your tuner — click one to put it on the store TV.</p>
      ${items.map((it, i) => `
        <div class="live-row" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--vb-line);border-radius:10px;margin-bottom:6px">
          <b style="min-width:2.2em;text-align:right">${String(i + 1).padStart(2, '0')}</b>
          <span style="flex:1">${esc(it.title.replace('📺 ', ''))}</span>
          <button class="btn accent" data-live-play="${esc(it.id)}">▶ Play on TV</button>
        </div>`).join('')}`;
    for (const btn of root.querySelectorAll('[data-live-play]')) {
      btn.onclick = () => {
        const item = items.find(i => i.id === btn.dataset.livePlay);
        if (item) { ctx.playItem(item); closeSettings(); toast(`Now on the store TV: ${item.title.replace('📺 ', '')}`); }
      };
    }
  }

  // ═══════════════ MY VISUALIZER (TV music look) ═══════════════
  const VIZ_STYLES = [
    ['bars', 'Classic Bars', 'the trusted equalizer'],
    ['mirror', 'Mirror', 'bars flipping around a line'],
    ['wave', 'Wave', 'one flowing spectrum line'],
    ['pulse', 'Pulse', 'rings breathing with the bass']
  ];
  async function panelServer(root) {
    let adminCfg;
    try { adminCfg = (await api.adminConfig()).config; }
    catch (e) { root.innerHTML = `<div class="locked-note">${esc(e.message)}</div>`; return; }
    const srcs = adminCfg.sources || { plex: false, jellyfin: false };

    root.innerHTML = `
      <p class="hint" style="margin:0 0 14px">Every source below is <b>independent</b> — switch one on and it stocks the shelves, switch it off and it's gone. Want a pure free-media store? Leave Plex, Jellyfin and Demo off and just use the free shelves.</p>

      <div class="section-title">Sources on the shelves</div>

      <div class="toggle-row">
        <div><div class="t-label">🛰️ Plex</div><div class="t-sub">your Plex Media Server</div></div>
        <label class="switch"><input type="checkbox" id="src-plex" ${srcs.plex ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div id="conn-plex" style="margin:2px 2px 16px">
        <div class="hint" style="margin:0 0 10px"><b>How to shelve your Plex:</b> ① switch Plex on above → ② paste the URL + token → ③ <b>Load libraries</b> → ④ tick what you want → ⑤ Save. It stacks with the free shelves below.</div>
        <div class="row2">
          <div class="field"><label>Server URL</label>
            <input type="url" id="plex-url" placeholder="Paste server URL" value="${esc(adminCfg.plex.url)}"></div>
          <div class="field"><label>X-Plex-Token</label>
            <input type="text" id="plex-token" placeholder="Paste X-Plex-Token" value="${esc(adminCfg.plex.token)}"></div>
        </div>
        <div class="hint" style="margin:-8px 0 10px">Server URL = IP:32400 (a pasted <b>/web</b> suffix is fixed automatically). Token: Plex Web → any item → ⋮ → Get Info → View XML → copy <b>X-Plex-Token</b>.</div>
        <div class="section-title">Plex libraries on the shelves</div>
        <div id="plex-libraries" class="lib-list"><div class="hint">Nothing loaded yet — click Load below (needs the URL + token).</div></div>
        <div style="display:flex;gap:8px;margin:6px 0 0;flex-wrap:wrap">
          <button class="btn" id="btn-plex-libs">↻ Load libraries</button>
          <button class="btn" id="btn-plex-all">✓ All</button>
          <button class="btn" id="btn-plex-none">✕ None</button>
          <button class="btn" id="btn-test-plex">Test Plex</button>
        </div>
        <div class="hint" style="margin-top:8px">Unchecked = not shelved. Nothing checked shelves nothing from Plex.</div>
      </div>

      <div class="toggle-row">
        <div><div class="t-label">🛰️ Jellyfin</div><div class="t-sub">your Jellyfin server</div></div>
        <label class="switch"><input type="checkbox" id="src-jf" ${srcs.jellyfin ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div id="conn-jf" style="margin:2px 2px 16px">
        <div class="hint" style="margin:0 0 10px"><b>How to shelve your Jellyfin:</b> ① switch Jellyfin on above → ② paste the URL + API key → ③ <b>Load libraries</b> → ④ tick what you want → ⑤ Save. It stacks with the free shelves below.</div>
        <div class="row2">
          <div class="field"><label>Server URL</label>
            <input type="url" id="jf-url" placeholder="Paste server URL" value="${esc(adminCfg.jellyfin.url)}"></div>
          <div class="field"><label>API key</label>
            <input type="text" id="jf-key" placeholder="Paste API key" value="${esc(adminCfg.jellyfin.apiKey)}"></div>
        </div>
        <div class="hint" style="margin:-8px 0 10px">Jellyfin: Dashboard → API Keys → “+” → name it <b>home-binger</b> → paste it here. Server URL is IP:8096 (no /web suffix).</div>
        <div class="section-title">Jellyfin libraries on the shelves</div>
        <div id="jf-libraries" class="lib-list"><div class="hint">Nothing loaded yet — click Load below (needs the URL + key).</div></div>
        <div style="display:flex;gap:8px;margin:6px 0 0;flex-wrap:wrap">
          <button class="btn" id="btn-jf-libs">↻ Load libraries</button>
          <button class="btn" id="btn-jf-all">✓ All</button>
          <button class="btn" id="btn-jf-none">✕ None</button>
          <button class="btn" id="btn-test-jf">Test Jellyfin</button>
        </div>
        <div class="hint" style="margin-top:8px">Unchecked = not shelved.</div>
      </div>

      <div class="section-title" style="margin-top:8px">More libraries — another Plex or Jellyfin</div>
      <div class="hint" style="margin:-4px 0 10px">Two servers in the house (or a friend's)? Connect <b>as many as you like</b> — every extra one stacks on the shelves under its own nickname, and each visitor can switch it on or off in My Media.</div>
      <div id="instance-list"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="btn-add-plex">+ Add another Plex</button>
        <button class="btn" id="btn-add-jf">+ Add another Jellyfin</button>
      </div>

      <div class="section-title" style="margin-top:16px">Free shelves — stack with anything above</div>
      <div class="hint" style="margin:-4px 0 12px">Public-domain classics from the <b>Internet Archive</b>, live radio from <b>Radio-Browser</b>, and any podcast's RSS feed. Free, legal, no account. Nothing checked = that shelf stays off.</div>

      <div class="section-title">🎞️ Classics wing (Internet Archive)</div>
      <div id="archive-libraries" class="lib-list"><div class="hint">Loading categories…</div></div>

      <div class="section-title" style="margin-top:14px">📻 Radio wall (live stations)</div>
      <div id="radio-libraries" class="lib-list"><div class="hint">Loading genres…</div></div>

      <div class="section-title" style="margin-top:14px">🎙️ Podcast rack (RSS)</div>
      <div id="podcast-feeds" class="lib-list"></div>
      <div class="row2" style="margin-top:6px">
        <div class="field"><label>Podcast RSS URL</label>
          <input type="url" id="podcast-url" placeholder="https://feeds.example.com/show.rss"></div>
        <div class="field"><label>&nbsp;</label>
          <button class="btn" id="btn-add-podcast">+ Add feed</button></div>
      </div>
      <div class="hint" style="margin:-6px 0 14px">Any podcast works: Share → <b>Copy RSS URL</b> in your podcast app, paste here. Newest episodes shelve as CDs in the rack.</div>

      <div class="section-title" style="margin-top:14px">📁 Local files — no media server (file grabber)</div>
      <div class="row2" style="align-items:center">
        <div class="field"><label>Media spots — grab from as many folders as you like</label>
          <div id="local-spots"></div>
          <button class="btn" id="btn-add-spot" style="margin-top:6px">+ Add another spot</button></div>
        <div class="field"><label>Shelve local files</label>
          <label class="switch"><input type="checkbox" id="local-on" ${adminCfg.local?.on ? 'checked' : ''}><span class="track"></span></label></div>
      </div>
      <div class="hint" style="margin:-6px 0 14px">Each spot grabs <b>everything inside it and every folder nested inside</b>, recursively, as individual files — movies by file, tracks grouped by their folder, ebooks/PDFs indexed for the future library. Runs off this machine's disk: no media server, no network opened.</div>

      <button class="btn accent" id="btn-save-server" style="margin-top:6px">Save &amp; stock the shelves</button>
      <div id="test-result" style="margin-top:12px; font-size:13.5px"></div>

      <div class="section-title" style="margin-top:22px">📺 Live TV (tuner channels)</div>
      <div id="livetv-section"></div>`;

    const out = root.querySelector('#test-result');
    // t62: the grabber's media spots — add as many folders as you like
    let spotList = ((adminCfg.local?.spots?.length ? adminCfg.local.spots
      : (adminCfg.local?.path ? [adminCfg.local.path] : [])) || []).slice();
    const renderSpots = () => {
      const box = root.querySelector('#local-spots');
      box.innerHTML = spotList.map((p, i) => `<div class="row2" style="margin-bottom:6px">
        <div class="field"><input type="text" class="local-path" placeholder="e.g. C:\\Videos" value="${esc(p)}" style="width:100%"></div>
        <div class="field"><button class="btn" data-del-spot="${i}" style="white-space:nowrap">✕ Remove</button></div>
      </div>`).join('') || '<div class="hint" style="margin:0 0 6px">No spots yet — add a folder below.</div>';
      box.querySelectorAll('[data-del-spot]').forEach(b => {
        b.onclick = () => { spotList.splice(Number(b.dataset.delSpot), 1); renderSpots(); };
      });
    };
    renderSpots();
    root.querySelector('#btn-add-spot').onclick = () => { spotList.push(''); renderSpots();
      const inputs = root.querySelectorAll('.local-path'); inputs[inputs.length - 1]?.focus(); };
    // ── library checkbox lists ──
    let podcastList = ((adminCfg.podcasts?.feeds) || []).slice();
    const renderPodcastFeeds = () => {
      const box = root.querySelector('#podcast-feeds');
      box.innerHTML = podcastList.length
        ? podcastList.map((u, i) => `<label class="lib-row"><input type="checkbox" checked disabled>
            <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u)}</b>
            <button class="btn" data-del-feed="${i}" style="margin-left:auto;padding:2px 8px">✕</button></label>`).join('')
        : '<div class="hint">No feeds yet — paste an RSS URL below.</div>';
      box.querySelectorAll('[data-del-feed]').forEach(b => {
        b.onclick = () => { podcastList.splice(Number(b.dataset.delFeed), 1); renderPodcastFeeds(); };
      });
    };
    renderPodcastFeeds();
    root.querySelector('#btn-add-podcast').onclick = () => {
      const inp = root.querySelector('#podcast-url');
      const u = inp.value.trim();
      if (!/^https?:\/\//i.test(u)) return toast('That does not look like an RSS URL', true);
      if (podcastList.includes(u)) return toast('Already in the rack', true);
      podcastList.push(u); inp.value = ''; renderPodcastFeeds();
    };
    const loadLibs = async (service) => {
      const box = root.querySelector(service === 'plex' ? '#plex-libraries' : '#jf-libraries');
      const d = draft();
      const conf = service === 'plex' ? { url: d.plex.url, token: d.plex.token } : { url: d.jellyfin.url, apiKey: d.jellyfin.apiKey };
      if (!conf.url) { box.innerHTML = '<div class="hint">Enter the server URL first.</div>'; return; }
      box.innerHTML = '<div class="hint">Loading…</div>';
      try {
        const r = await api.adminLibraries({ source: service, ...conf });
        if (!r.libraries?.length) { box.innerHTML = '<div class="hint">No usable libraries found on that server.</div>'; return; }
        const saved = (service === 'plex' ? adminCfg.plex : adminCfg.jellyfin).sections || [];
        const firstTime = saved.length === 0;          // nothing saved yet → check everything
        box.innerHTML = (firstTime ? '<div class="hint" style="margin:0 0 6px">✅ All libraries are checked — untick anything you don’t want shelved.</div>' : '')
          + r.libraries.map(lib => `
          <label class="lib-row"><input type="checkbox" value="${esc(lib.key)}" ${(firstTime || saved.includes(lib.key)) ? 'checked' : ''}>
          <b>${esc(lib.title)}</b><small>${esc(lib.type)}</small></label>`).join('');
      } catch (e) {
        box.innerHTML = `<div class="locked-note">${esc(e.message)}</div>`;
      }
    };
    const quickPick = (service, on) => {
      const box = root.querySelector(service === 'plex' ? '#plex-libraries' : '#jf-libraries');
      box.querySelectorAll('input[type="checkbox"]').forEach(c => { c.checked = on; });
    };
    root.querySelector('#btn-plex-libs').onclick = () => loadLibs('plex');
    root.querySelector('#btn-jf-libs').onclick = () => loadLibs('jellyfin');
    // flipping a switch on with saved creds loads its libraries immediately —
    // one less "now what?" moment
    root.querySelector('#src-plex').onchange = (e) => { if (e.target.checked && root.querySelector('#plex-url').value.trim()) loadLibs('plex'); };
    root.querySelector('#src-jf').onchange = (e) => { if (e.target.checked && root.querySelector('#jf-url').value.trim()) loadLibs('jellyfin'); };
    root.querySelector('#btn-plex-all').onclick = () => quickPick('plex', true);
    root.querySelector('#btn-plex-none').onclick = () => quickPick('plex', false);
    root.querySelector('#btn-jf-all').onclick = () => quickPick('jellyfin', true);
    root.querySelector('#btn-jf-none').onclick = () => quickPick('jellyfin', false);
    const testService = async (service) => {
      const d = draft();
      const conf = service === 'plex'
        ? { url: d.plex.url, token: d.plex.token }
        : { url: d.jellyfin.url, apiKey: d.jellyfin.apiKey };
      if (!conf.url) { out.innerHTML = `❌ Enter the ${service === 'plex' ? 'Plex' : 'Jellyfin'} server URL first.`; return; }
      out.innerHTML = `Testing ${service === 'plex' ? 'Plex' : 'Jellyfin'}…`;
      try {
        const r = await api.adminTest({ source: service, ...conf });
        out.innerHTML = `✅ <b>${esc(r.name)}</b> — ${esc(r.detail)}`;
      } catch (err) { out.innerHTML = `❌ ${esc(err.message)}`; }
    };
    root.querySelector('#btn-test-plex').onclick = () => testService('plex');
    root.querySelector('#btn-test-jf').onclick = () => testService('jellyfin');
    // static free-source lists
    const loadStaticLibs = async (source, boxSel, savedList) => {
      const box = root.querySelector(boxSel);
      try {
        const r = await api.adminLibraries({ source });
        const saved = savedList || [];
        box.innerHTML = r.libraries.map(lib => `
          <label class="lib-row"><input type="checkbox" value="${esc(lib.key)}" ${saved.includes(lib.key) ? 'checked' : ''}>
          <b>${esc(lib.title)}</b><small>${esc(lib.type)}</small></label>`).join('');
      } catch (e) { box.innerHTML = `<div class="locked-note">${esc(e.message)}</div>`; }
    };
    loadStaticLibs('archive', '#archive-libraries', adminCfg.archive?.sections);
    loadStaticLibs('radio', '#radio-libraries', adminCfg.radio?.sections);
    if (adminCfg.plex.url) loadLibs('plex').catch(() => {});
    if (adminCfg.jellyfin.url) loadLibs('jellyfin').catch(() => {});
    // ── t87: EXTRA INSTANCES — unlimited Plex/Jellyfin connections ──
    let instSeq = 0;
    let instDrafts = (adminCfg.instances || []).map(i => ({ ...i, _new: false }));
    const instKey = (i) => i.id || `new-${i._k}`;
    const renderInstances = () => {
      const box = root.querySelector('#instance-list');
      if (!instDrafts.length) {
        box.innerHTML = '<div class="hint" style="margin:0 0 2px">None yet — only the built-in connections above are connected.</div>';
        return;
      }
      box.innerHTML = instDrafts.map(i => {
        const k = CSS.escape(instKey(i));
        const isPlex = i.kind === 'plex';
        return `
        <div style="border:1px solid var(--vb-line);border-radius:12px;padding:10px 12px;margin-bottom:10px">
          <div class="toggle-row" style="margin:0 0 8px">
            <div><div class="t-label">🛰️ ${esc(i.name || (isPlex ? 'New Plex' : 'New Jellyfin'))}</div><div class="t-sub">extra ${isPlex ? 'Plex' : 'Jellyfin'} connection</div></div>
            <label class="switch"><input type="checkbox" data-inst-on="${k}" ${i.on !== false ? 'checked' : ''}><span class="track"></span></label>
          </div>
          <div class="row2">
            <div class="field"><label>Nickname (shows on shelves)</label>
              <input type="text" data-inst-name="${k}" value="${esc(i.name || '')}" placeholder="${isPlex ? 'e.g. Basement Plex' : 'e.g. Garage Jellyfin'}"></div>
            <div class="field"><label>Server URL</label>
              <input type="url" data-inst-url="${k}" value="${esc(i.url || '')}" placeholder="Paste server URL"></div>
          </div>
          <div class="row2">
            <div class="field"><label>${isPlex ? 'X-Plex-Token' : 'API key'}</label>
              <input type="text" data-inst-secret="${k}" value="${esc(isPlex ? (i.token || '') : (i.apiKey || ''))}" placeholder="${isPlex ? 'Paste X-Plex-Token' : 'Paste API key'}"></div>
            <div class="field" style="align-self:end"><button class="btn" data-inst-del="${k}">🗑 Remove</button></div>
          </div>
          <div class="section-title">Libraries on the shelves</div>
          <div class="lib-list" data-inst-libs="${k}"><div class="hint">Nothing loaded yet — click Load below (needs the URL + ${isPlex ? 'token' : 'key'}).</div></div>
          <div style="display:flex;gap:8px;margin:6px 0 0;flex-wrap:wrap">
            <button class="btn" data-inst-load="${k}">↻ Load libraries</button>
            <button class="btn" data-inst-test="${k}">Test</button>
          </div>
        </div>`;
      }).join('');
      for (const i of instDrafts) {
        const k = instKey(i);
        const q = (sel) => root.querySelector(`[data-inst-${sel}="${CSS.escape(k)}"]`);
        q('del').onclick = () => { instDrafts = instDrafts.filter(x => x !== i); renderInstances(); };
        q('load').onclick = async () => {
          const url = q('url').value.trim();
          if (!url) return toast('Enter the server URL first', true);
          const libBox = q('libs');
          libBox.innerHTML = '<div class="hint">Loading…</div>';
          try {
            const secret = q('secret').value.trim();
            const body = { source: i._new ? i.kind : i.id, url };
            if (i.kind === 'plex') body.token = secret; else body.apiKey = secret;
            const r = await api.adminLibraries(body);
            if (!r.libraries?.length) { libBox.innerHTML = '<div class="hint">No usable libraries found on that server.</div>'; return; }
            const saved = i.sections || [];
            const firstTime = saved.length === 0;
            libBox.innerHTML = (firstTime ? '<div class="hint" style="margin:0 0 6px">✅ All libraries are checked — untick anything you don’t want shelved.</div>' : '')
              + r.libraries.map(lib => `
              <label class="lib-row"><input type="checkbox" value="${esc(lib.key)}" ${(firstTime || saved.includes(lib.key)) ? 'checked' : ''}>
              <b>${esc(lib.title)}</b><small>${esc(lib.type)}</small></label>`).join('');
          } catch (e) { libBox.innerHTML = `<div class="locked-note">${esc(e.message)}</div>`; }
        };
        q('test').onclick = async () => {
          const url = q('url').value.trim();
          if (!url) { out.innerHTML = `❌ Enter the ${i.kind === 'plex' ? 'Plex' : 'Jellyfin'} server URL first.`; return; }
          out.innerHTML = `Testing ${esc(q('name').value.trim() || i.name || i.kind)}…`;
          try {
            const secret = q('secret').value.trim();
            const body = { source: i._new ? i.kind : i.id, url };
            if (i.kind === 'plex') body.token = secret; else body.apiKey = secret;
            const r = await api.adminTest(body);
            out.innerHTML = `✅ <b>${esc(r.name)}</b> — ${esc(r.detail)}`;
          } catch (err) { out.innerHTML = `❌ ${esc(err.message)}`; }
        };
      }
    };
    renderInstances();
    root.querySelector('#btn-add-plex').onclick = () => {
      instDrafts.push({ id: '', kind: 'plex', name: '', url: '', token: '', apiKey: '', sections: [], on: true, _new: true, _k: ++instSeq });
      renderInstances();
    };
    root.querySelector('#btn-add-jf').onclick = () => {
      instDrafts.push({ id: '', kind: 'jellyfin', name: '', url: '', token: '', apiKey: '', sections: [], on: true, _new: true, _k: ++instSeq });
      renderInstances();
    };
    const draft = () => ({
      sources: {
        plex: root.querySelector('#src-plex').checked,
        jellyfin: root.querySelector('#src-jf').checked
      },
      plex: { url: root.querySelector('#plex-url').value.trim(), token: root.querySelector('#plex-token').value.trim(),
        sections: [...root.querySelectorAll('#plex-libraries input:checked')].map(c => c.value) },
      jellyfin: { url: root.querySelector('#jf-url').value.trim(), apiKey: root.querySelector('#jf-key').value.trim(),
        sections: [...root.querySelectorAll('#jf-libraries input:checked')].map(c => c.value) },
      archive: { sections: [...root.querySelectorAll('#archive-libraries input:checked')].map(c => c.value) },
      radio: { sections: [...root.querySelectorAll('#radio-libraries input:checked')].map(c => c.value) },
      podcasts: { feeds: podcastList },
      local: { on: !!(root.querySelector('#local-on')?.checked),
        spots: [...root.querySelectorAll('.local-path')].map(el => el.value.trim()).filter(Boolean) },   // t62: multi-spot grabber
      instances: instDrafts.map(i => {                     // t87: extra connections
        const k = CSS.escape(instKey(i));
        const libBox = root.querySelector(`[data-inst-libs="${k}"]`);
        const hasBoxes = !!libBox?.querySelector('input[type="checkbox"]');
        const secret = root.querySelector(`[data-inst-secret="${k}"]`)?.value.trim() || '';
        return {
          id: i._new ? '' : i.id, kind: i.kind,
          name: root.querySelector(`[data-inst-name="${k}"]`)?.value.trim() || i.name || '',
          url: root.querySelector(`[data-inst-url="${k}"]`)?.value.trim() || '',
          token: i.kind === 'plex' ? secret : '',
          apiKey: i.kind === 'jellyfin' ? secret : '',
          sections: hasBoxes ? [...libBox.querySelectorAll('input:checked')].map(c => c.value) : (i.sections || []),
          on: root.querySelector(`[data-inst-on="${k}"]`)?.checked ?? (i.on !== false)
        };
      })
    });
    root.querySelector('#btn-save-server').onclick = async () => {
      // t66: show grabber folder problems right where the user is looking
      const d = draft();
      if (d.sources.plex && (!d.plex.url || !d.plex.token))
        return toast('Plex is switched on but the URL or token is missing', true);
      if (d.sources.jellyfin && (!d.jellyfin.url || !d.jellyfin.apiKey))
        return toast('Jellyfin is switched on but the URL or API key is missing', true);
      if (d.local.on && !d.local.spots.length)
        return toast('Local files is switched on but no media spots are set', true);
      for (const i of d.instances) {                       // t87: instances must be complete when on
        if (i.on && !i.url)
          return toast(`"${i.name || (i.kind === 'plex' ? 'Plex' : 'Jellyfin')}" is switched on but has no server URL`, true);
      }
      if (d.sources.plex && d.plex.sections.length === 0)
        return toast('No Plex libraries are ticked — hit "↻ Load libraries" and tick at least one (or switch Plex off)', true);
      if (d.sources.jellyfin && d.jellyfin.sections.length === 0)
        return toast('No Jellyfin libraries are ticked — hit "↻ Load libraries" and tick at least one (or switch Jellyfin off)', true);
      try {
        await api.adminSaveConfig(draft());
        toast('Saved — restocking the shelves…');
        closeSettings();
        await ctx.reloadLibrary();
      } catch (err) { toast(err.message, true); }
    };
    // live TV guide lives here (uses the tuner connection above)
    panelLiveTV(root.querySelector('#livetv-section'));
  }

  async function panelTV(root) {
    let adminCfg;
    try { adminCfg = (await api.adminConfig()).config; }
    catch (e) { root.innerHTML = `<div class="locked-note">${esc(e.message)}</div>`; return; }
    const tv = adminCfg.tv;

    root.innerHTML = `
      <p class="hint" style="margin:0 0 16px">When a customer hits <b>"Take off the shelf"</b> and feeds the theater deck, that item plays on the big screen.
      These settings control the <b>idle screen</b> — what the TV shows while nothing is selected.</p>
      <div class="toggle-row">
        <div><div class="t-label">TV powered on</div><div class="t-sub">the wall TV above the far shelf</div></div>
        <label class="switch"><input type="checkbox" id="tv-enabled" ${tv.enabled ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div class="section-title">Idle screen</div>
      <div class="radio-cards">
        ${[['standby', 'Standby card', '"now playing: nothing"'],
           ['loop', 'Synthwave loop', 'built-in attraction channel'],
           ['url', 'Video URL', 'any looping mp4/webm link'],
           ['item', 'Library item', 'a music video / movie on repeat']]
          .map(([id, label, sub]) => `
          <button class="radio-card ${tv.mode === id ? 'active' : ''}" data-tvmode="${id}">${label}<small>${sub}</small></button>`).join('')}
      </div>
      <div class="field" id="tv-url-wrap" style="margin-top:14px">
        <label>Video URL (mp4 / webm)</label>
        <input type="url" id="tv-url" placeholder="https://…/trailer.mp4" value="${esc(tv.url)}">
        <div class="hint">Streamed through this server (works with plain-HTTP media servers and avoids mixed-content blocking).</div>
      </div>
      <div class="field" id="tv-item-wrap" style="margin-top:14px">
        <label>Library item (music videos &amp; movies)</label>
        <input type="text" id="tv-item-search" placeholder="Type to search the catalogue…">
        <div id="tv-item-results" class="help-grid" style="grid-template-columns:1fr"></div>
        <div class="hint">Selected: <b id="tv-item-current">${esc(tv.itemId) || 'none'}</b></div>
      </div>
      <button class="btn accent" id="tv-save">Save TV settings</button>`;

    let mode = tv.mode;
    let itemId = tv.itemId;
    const syncVisibility = () => {
      root.querySelector('#tv-url-wrap').style.display = mode === 'url' ? '' : 'none';
      root.querySelector('#tv-item-wrap').style.display = mode === 'item' ? '' : 'none';
    };
    root.querySelectorAll('[data-tvmode]').forEach(card => {
      card.onclick = () => {
        root.querySelectorAll('[data-tvmode]').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        mode = card.dataset.tvmode;
        syncVisibility();
      };
    });
    syncVisibility();
    const searchInput = root.querySelector('#tv-item-search');
    searchInput.oninput = () => {
      const q = searchInput.value.toLowerCase();
      const hits = state.items.filter(i => i.title.toLowerCase().includes(q)).slice(0, 8);
      root.querySelector('#tv-item-results').innerHTML = hits.map(h =>
        `<button class="btn small" data-item="${esc(h.id)}">${esc(h.title)}${h.year ? ` (${h.year})` : ''}</button>`).join('');
      root.querySelectorAll('[data-item]').forEach(btn => {
        btn.onclick = () => {
          itemId = btn.dataset.item;
          root.querySelector('#tv-item-current').textContent = `${itemId} — ${btn.textContent}`;
          toast('Selected — remember to Save');
        };
      });
    };
    root.querySelector('#tv-save').onclick = async () => {
      try {
        await api.adminSaveConfig({ tv: { enabled: root.querySelector('#tv-enabled').checked, mode, url: root.querySelector('#tv-url').value.trim(), itemId } });
        await ctx.reloadTv();
        toast('TV updated');
        closeSettings();
      } catch (err) { toast(err.message, true); }
    };
  }

  // ═══════════════ ADMIN · USERS ═══════════════
  async function panelUsers(root) {
    const render = async () => {
      const { users } = await api.adminUsers();
      root.innerHTML = `
        <div class="section-title">Accounts</div>
        ${users.map(u => `
          <div class="user-row">
            <span class="u-name">${esc(u.username)}</span>
            ${u.isAdmin ? '<span class="badge admin">ADMIN</span>' : '<span class="badge">user</span>'}
            <button class="btn small" data-rename="${u.id}" data-name="${esc(u.username)}">Rename</button>
            <button class="btn small" data-reset="${u.id}" data-name="${esc(u.username)}">Set password</button>
            <button class="btn small" data-admin="${u.id}" data-name="${esc(u.username)}" data-has="${u.isAdmin ? 1 : 0}">${u.isAdmin ? 'Remove admin' : 'Make admin'}</button>
            <button class="btn small danger" data-del="${u.id}" data-name="${esc(u.username)}">Delete</button>
          </div>`).join('')}
        <div class="hint" style="margin-top:14px">Accounts are <b>self-serve</b> — visitors create their own at the
        front entrance page (the store owner can allow/block new sign-ups in Admin → Policies).
        You can still reset a forgotten password or remove an account here.</div>`;
      // t81b: INLINE EDITORS — Electron (the desktop exe) does not support
      // window.prompt — it returns null instantly, so prompt-based flows are
      // DEAD in the exe while working in every browser (how it slipped through
      // browser-only testing). Rename + Set password now edit inline, everywhere.
      const inlineEdit = (btn, opts) => {
        const old = root.querySelector('.user-edit'); if (old) old.remove();
        const editor = document.createElement('div');
        editor.className = 'user-edit';
        editor.style.cssText = 'display:flex;gap:8px;align-items:center;margin:2px 0 8px';
        const inp = document.createElement('input');
        inp.type = opts.password ? 'password' : 'text';
        inp.value = opts.value || '';
        if (opts.password) inp.placeholder = 'New password…';
        inp.maxLength = opts.password ? 64 : 32;
        inp.style.cssText = 'flex:1;min-width:0;padding:6px 10px;border-radius:6px;border:1px solid var(--vb-line,#2a3354);background:rgba(10,12,30,.55);color:var(--vb-ink,#eef1ff)';
        const save = document.createElement('button'); save.className = 'btn small'; save.textContent = 'Save';
        const cancel = document.createElement('button'); cancel.className = 'btn small'; cancel.textContent = 'Cancel';
        editor.append(inp, save, cancel);
        btn.closest('.user-row').after(editor);
        inp.focus(); if (!opts.password) inp.select();
        const done = () => editor.remove();
        cancel.onclick = done;
        save.onclick = async () => {
          const v = inp.value.trim();
          if (!v || (opts.password ? v.length < 4 : v === btn.dataset.name)) { inp.focus(); return; }
          try { await opts.onSave(v); toast(opts.okMsg); done(); render(); }
          catch (e) { toast(e.message, true); inp.focus(); }
        };
        inp.onkeydown = e => { if (e.key === 'Enter') save.click(); if (e.key === 'Escape') done(); };
      };
      root.querySelectorAll('[data-rename]').forEach(btn => {   // t81: rename — shelves/prefs ride the user id, so only the name changes
        btn.onclick = () => inlineEdit(btn, { value: btn.dataset.name, okMsg: 'Name changed',
          onSave: v => api.adminRenameUser(btn.dataset.rename, v) });
      });
      root.querySelectorAll('[data-reset]').forEach(btn => {
        btn.onclick = () => inlineEdit(btn, { password: true, okMsg: 'Password set',
          onSave: v => api.adminSetPassword(btn.dataset.reset, v) });
      });
      root.querySelectorAll('[data-admin]').forEach(btn => {   // t82: admins make admins — a partner gets the keys without a rebuild
        btn.onclick = async () => {
          const removing = btn.dataset.has === '1';
          if (removing && !confirm(`Remove admin from ${btn.dataset.name}? They keep their account and shelves.`)) return;
          try { await api.adminPromoteUser(btn.dataset.admin, !removing); toast(removing ? 'Admin removed' : `${btn.dataset.name} is now an admin`); render(); }
          catch (e) { toast(e.message, true); }
        };
      });
      root.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm(`Delete user ${btn.dataset.name}?`)) return;
          try { await api.adminDeleteUser(btn.dataset.del); toast('User deleted'); render(); }
          catch (e) { toast(e.message, true); }
        };
      });
    };
    try { await render(); }
    catch (e) { root.innerHTML = `<div class="locked-note">${esc(e.message)}</div>`; }
  }

  // ═══════════════ ADMIN · POLICIES ═══════════════
  async function panelPolicies(root) {
    let adminCfg;
    try { adminCfg = (await api.adminConfig()).config; }
    catch (e) { root.innerHTML = `<div class="locked-note">${esc(e.message)}</div>`; return; }

    root.innerHTML = `
      <div class="section-title">Locks (apply to everyone)</div>
      <div class="toggle-row">
        <div><div class="t-label">Lock theming</div><div class="t-sub">visitors can't change colors/shelf style — the default theme below is forced</div></div>
        <label class="switch"><input type="checkbox" id="lock-theme" ${adminCfg.locks.theme ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="t-label">Lock shelf arrangement</div><div class="t-sub">everyone browses the default sorting below</div></div>
        <label class="switch"><input type="checkbox" id="lock-sorting" ${adminCfg.locks.sorting ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="t-label">Lock shelf maps</div><div class="t-sub">everyone browses the store's shelf map — personal maps are ignored</div></div>
        <label class="switch"><input type="checkbox" id="lock-shelves" ${adminCfg.locks.shelves ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="t-label">Lock media mix</div><div class="t-sub">everyone sees the sources the store enables (Admin → Server)</div></div>
        <label class="switch"><input type="checkbox" id="lock-sources" ${adminCfg.locks.sources ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div class="toggle-row">
        <div><div class="t-label">Allow account registration</div><div class="t-sub">accounts are only for syncing preferences — guests always work</div></div>
        <label class="switch"><input type="checkbox" id="allow-reg" ${adminCfg.registration ? 'checked' : ''}><span class="track"></span></label>
      </div>
      <div class="section-title">Store defaults (new visitors &amp; when locked)</div>
      <div class="row2">
        ${['wall', 'floor', 'shelf', 'accent'].map(k => `
          <div class="color-row">
            <input type="color" id="def-${k}" value="${adminCfg.defaults.theme[k]}">
            <span class="color-name">${{ wall: 'Walls', floor: 'Floor', shelf: 'Shelves', accent: 'Accent' }[k]}</span>
          </div>`).join('')}
      </div>
      <div class="row2">
        <div class="field"><label>Default shelf style</label>
          <select id="def-style">${Object.entries(SHELF_STYLES).map(([id, s]) =>
            `<option value="${id}" ${adminCfg.defaults.theme.style === id ? 'selected' : ''}>${s.label}</option>`).join('')}</select></div>
        <div class="field"><label>Default sorting</label>
          <select id="def-sort">${SORT_MODES.map(m =>
            `<option value="${m.id}" ${adminCfg.defaults.sorting.mode === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></div>
      </div>
      <button class="btn accent" id="policies-save">Save policies</button>`;
    root.querySelector('#policies-save').onclick = async () => {
      try {
        await api.adminSaveConfig({
          locks: { theme: root.querySelector('#lock-theme').checked, sorting: root.querySelector('#lock-sorting').checked,
          shelves: root.querySelector('#lock-shelves').checked, sources: root.querySelector('#lock-sources').checked },
          registration: root.querySelector('#allow-reg').checked,
          defaults: {
            theme: {
              wall: root.querySelector('#def-wall').value, floor: root.querySelector('#def-floor').value,
              shelf: root.querySelector('#def-shelf').value, accent: root.querySelector('#def-accent').value,
              style: root.querySelector('#def-style').value
            },
            sorting: { mode: root.querySelector('#def-sort').value, dir: adminCfg.defaults.sorting.dir }
          }
        });
        await state.refresh();
        await ctx.rebuildStore();
        toast('Store policies saved');
        closeSettings();
      } catch (err) { toast(err.message, true); }
    };
  }

  // ═══════════════ ITEM MODAL ═══════════════
  async function showItemModal(item) {
    const modal = $('#item-modal');
    $('#item-type').textContent = TYPE_LABELS[item.type] || 'Media';
    $('#item-title').textContent = item.title;
    $('#item-play').classList.add('hidden');
    $('#item-source-badge').textContent = '';
    modal.classList.remove('hidden');
    document.exitPointerLock?.();

    // ── the 3D CASE: cover on the front, synopsis/credits printed on the back
    //    (panel stays about PLAYING — grab & drag the case to flip it)
    const caseEl = $('#item-case-view');
    caseEl.innerHTML = '';
    const cv = createCaseView(caseEl, item, { accent: ctx.currentAccent?.() || '#ffd23f' });
    // dispose the WebGL context when the modal closes (any close path)
    const mo = new MutationObserver(() => {
      if (modal.classList.contains('hidden')) { cv.dispose(); mo.disconnect(); }
    });
    mo.observe(modal, { attributes: true, attributeFilter: ['class'] });

    try {
      const d = await api.itemDetail(item.source, item.key);
      cv.setSynopsis({
        summary: d.summary || 'No synopsis available.',
        year: d.year || item.year,
        rating: d.rating || item.rating,
        genres: d.genres || item.genres,
        duration: d.durationMs ? Math.round(d.durationMs / 60000) + ' min' : ''
      });
      if (d.playUrl) {
        $('#item-play').href = d.playUrl;
        $('#item-play').classList.remove('hidden');
      }
      const srcName = { plex: 'Plex', jellyfin: 'Jellyfin', archive: 'Internet Archive', podcast: 'Podcast', radio: 'Live Radio' }[item.source] || item.source;
      $('#item-source-badge').textContent = `Cover & playback via ${srcName} · streamed through this server`;
    } catch (e) {
      cv.setSynopsis({ summary: item.summary || 'Details unavailable.' });
    }

    // the big button: video cases come OFF the shelf (carry them to the
    // theater deck); music plays straight away on the big screen
    const tvBtn = $('#item-play-tv');
    const isVideo = ['movie', 'show', 'musicvideo', 'live'].includes(item.type);
    tvBtn.textContent = isVideo ? '🎁 Take off the shelf' : '▶ Play on the big screen';
    tvBtn.onclick = () => {
      if (isVideo) {
        ctx.carry(item);
        toast(`Grabbed “${item.title}” (${ctx.carryFormat ? ctx.carryFormat(item) : ''}) — bring it to the theater deck`);
      } else {
        ctx.playItem(item);
      }
      modal.classList.add('hidden');
    };
    // ⏭ PLAY NEXT — queue it right after whatever's on now
    const nextBtn = $('#item-play-next');
    if (nextBtn) nextBtn.onclick = () => {
      const r = ctx.playNext(item);
      toast(r === 'now' ? `▶ Playing now: ${item.title}` : `⏭ Up next on the store TV: ${item.title}`);
      modal.classList.add('hidden');
    };
  }
  $('#item-modal').addEventListener('click', (e) => { if (e.target.id === 'item-modal') $('#item-modal').classList.add('hidden'); });
  for (const btn of document.querySelectorAll('.modal-close')) {
    btn.onclick = () => btn.closest('.modal').classList.add('hidden');
  }

  // ↺ Reset ALL my settings (the button exists in BOTH profile branches)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#btn-reset-all');
    if (!btn) return;
    btn.disabled = true;
    try {
      const units = ctx.shelfUnits ? ctx.shelfUnits() : [];
      await state.updatePrefs({
        theme: state.boot.defaults.theme,
        sorting: state.boot.defaults.sorting,
        shelves: Object.fromEntries(units.map(u2 => [u2.id, ''])),
        tv: { idleMode: '', itemId: '' },
        sources: null
      });
      ctx.applyTheme(state.prefs.theme);
      ctx.applySorting(state.prefs.sorting);
      await ctx.reloadLibrary();
      toast('All your settings are back to the store defaults');
      closeSettings();
    } finally { btn.disabled = false; }
  });

  // ═══════════════ DJ BOOTH MENU (t47) ═══════════════
  let proUi = null;                                // t64: the booth's PRO rig panel
  function openDj(device) {                       // t64: two DIFFERENT interfaces now —
    const modal = $('#dj-modal'); if (!modal) return;   // the jukebox keeps the classic deck,
    ctx.djDevice = device === 'jukebox' ? 'jukebox' : 'booth';   // the booth laptop runs the pro rig
    const title = $('#dj-title');
    if (title) title.textContent = ctx.djDevice === 'jukebox' ? '🎵 Jukebox — DJ deck' : '🎧 DJ Booth — Pro Rig';
    ctx.unlockMouse?.();
    modal.classList.remove('hidden');
    if (proUi) { try { proUi.unmount(); } catch {} proUi = null; }
    modal.classList.toggle('dj-wide', ctx.djDevice === 'booth');   // t65: the pro rig gets the wide stage
    if (ctx.djDevice === 'booth') {
      const music = (state.items || []).filter(i => MUSIC_TYPES.includes(i.type) && isNotVideoFile(i));
      const body = $('#dj-body');
      body.innerHTML = '';
      proUi = (window.__VB?.scene?.djPro)?.mount(body, { items: music }) || null;
      if (!proUi) body.innerHTML = '<div class="hint">Pro rig unavailable on this device.</div>';
    } else renderDj();
  }
  function renderDj() {
    const body = $('#dj-body'); if (!body) return;
    const st = ctx.djState();
    const music = (state.items || []).filter(i => MUSIC_TYPES.includes(i.type) && isNotVideoFile(i));
    const sld = (id, label, min, max, step, val, unit) => `
      <div class="dj-ctl"><label>${label}</label>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
        <b id="${id}-v">${(+val).toFixed(step < 1 ? 1 : 0)}${unit || ''}</b></div>`;
    body.innerHTML = `
      <div class="dj-now">${st.now ? `▶ <b>${esc(st.now.title)}</b>` : 'queue is empty — add some music below'}</div>
      <div class="dj-section">Transport</div>
      <div class="dj-row-btns">
        <button class="btn" data-dj="prev">⏮</button>
        <button class="btn" data-dj="play">⏯</button>
        <button class="btn" data-dj="next">⏭</button>
        <button class="btn" data-dj="back">−10s</button>
        <button class="btn" data-dj="fwd">+10s</button>
      </div>
      ${sld('dj-vol', 'Volume', 0, 1, 0.05, st.stats.volume || 0.4, '')}
      ${sld('dj-rate', 'Tempo', 0.5, 1.5, 0.05, st.rate || 1, '×')}
      <div class="dj-section">EQ</div>
      ${sld('dj-bass', 'Bass', -14, 14, 1, st.eq.bass, 'dB')}
      ${sld('dj-mid', 'Mid', -14, 14, 1, st.eq.mid, 'dB')}
      ${sld('dj-treble', 'Treble', -14, 14, 1, st.eq.treble, 'dB')}
      <div class="dj-section">Voicing</div>
      <div class="dj-row-btns">
        <button class="btn ${st.voice?.on !== false ? 'accent' : ''}" data-dj="vcinema">🎬 Cinema</button>
        <button class="btn ${st.voice?.on === false ? 'accent' : ''}" data-dj="vflat">Flat</button>
      </div>
      <div class="dj-section">Fades</div>
      ${sld('dj-fades', 'Fade length', 0.5, 6, 0.5, st.fadeSecs, 's')}
      <div class="dj-row-btns">
        <button class="btn" data-dj="fadein">Fade in</button>
        <button class="btn" data-dj="fadeout">Fade out</button>
      </div>
      <div class="dj-section">Playlist <small>${st.queue.length} tracks</small></div>
      <div class="dj-row-btns">
        <button class="btn ${st.shuffle ? 'accent' : ''}" data-dj="shuffle">🔀 Shuffle</button>
        <button class="btn ${st.repeat !== 'off' ? 'accent' : ''}" data-dj="repeat" title="Repeat: off → one track → whole queue">🔁 ${st.repeat === 'one' ? 'One' : st.repeat === 'all' ? 'All' : 'Off'}</button>
        <button class="btn" data-dj="clear">✕ Clear</button>
      </div>
      <div class="dj-queue">${st.queue.length ? st.queue.map((t, i) => `
        <div class="dj-qrow ${i === st.idx ? 'now' : ''}" draggable="true" data-qrow="${i}" title="Drag to reorder">
          <span class="q-n">${i === st.idx ? '▶' : i + 1}</span>
          <span class="q-t">${esc(t.title)}</span>
          <button class="btn sm" data-dj="up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn sm" data-dj="down" data-i="${i}" ${i === st.queue.length - 1 ? 'disabled' : ''}>▼</button>
          <button class="btn sm" data-dj="playat" data-i="${i}">▶</button>
          <button class="btn sm" data-dj="rm" data-i="${i}">✕</button>
        </div>`).join('') : '<div class="hint" style="margin:4px 2px">Empty — add tracks below.</div>'}</div>
      <div class="dj-section">Add music</div>
      <select id="dj-add">${music.slice(0, 120).map(m2 => `<option value="${esc(m2.id)}">${esc(m2.title)}</option>`).join('')}</select>
      <button class="btn accent" data-dj="add" style="margin-top:6px">＋ Add to playlist</button>`;
    // wire it up
    // t64: DRAG-AND-DROP reordering (buttons stay too)
    {
      const rows = [...body.querySelectorAll('[data-qrow]')];
      let from = -1;
      rows.forEach(r => {
        r.ondragstart = () => { from = Number(r.dataset.qrow); };
        r.ondragover = (e) => e.preventDefault();
        r.ondrop = (e) => {
          e.preventDefault();
          const to = Number(r.dataset.qrow);
          if (from >= 0 && from !== to) { ctx.djMoveTo ? ctx.djMoveTo(from, to) : null; renderDj(); }
          from = -1;
        };
      });
    }
    const jb = ctx.djChannel ? ctx.djChannel() : window.__VB?.scene?.jukeboxAudio;   // t52: active device's channel
    const bind = (id, fn) => { const el2 = body.querySelector('#' + id); if (el2) { el2.oninput = () => fn(parseFloat(el2.value)); el2.onchange = () => renderDj(); } };
    bind('dj-vol', v => jb?.setVolume(v));
    bind('dj-rate', v => { jb?.setRate(v); body.querySelector('#dj-rate-v').textContent = v.toFixed(2) + '×'; });
    bind('dj-bass', v => { jb?.setEq('bass', v); body.querySelector('#dj-bass-v').textContent = v + 'dB'; });
    bind('dj-mid', v => { jb?.setEq('mid', v); body.querySelector('#dj-mid-v').textContent = v + 'dB'; });
    bind('dj-treble', v => { jb?.setEq('treble', v); body.querySelector('#dj-treble-v').textContent = v + 'dB'; });
    bind('dj-fades', v => { jb?.setFadeSecs(v); body.querySelector('#dj-fades-v').textContent = v + 's'; });
    body.querySelectorAll('[data-dj]').forEach(b2 => {
      b2.onclick = () => {
        const a = b2.dataset.dj, i = parseInt(b2.dataset.i, 10);
        if (a === 'prev') ctx.djPrev();
        else if (a === 'next') ctx.djNext();
        else if (a === 'play') jb?.togglePlay();
        else if (a === 'back') jb?.seekBy(-10);
        else if (a === 'fwd') jb?.seekBy(10);
        else if (a === 'vcinema') { jb?.setVoicing(true); renderDj(); }
        else if (a === 'vflat') { jb?.setVoicing(false); renderDj(); }
        else if (a === 'fadein') jb?.fade('in');
        else if (a === 'fadeout') jb?.fade('out');
        else if (a === 'shuffle') ctx.djShuffle = !ctx.djShuffle;
        else if (a === 'repeat') ctx.djRepeat = ctx.djRepeat === 'off' ? 'one' : ctx.djRepeat === 'one' ? 'all' : 'off';   // t64: 3-way
        else if (a === 'clear') { ctx.djQueue.length = 0; ctx.djIdx = -1; jb?.stop(); }
        else if (a === 'up') ctx.djMove(i, -1);
        else if (a === 'down') ctx.djMove(i, 1);
        else if (a === 'playat') ctx.djPlayAt(i);
        else if (a === 'rm') ctx.djRemove(i);
        else if (a === 'add') {
          const sel = body.querySelector('#dj-add');
          const it = (state.items || []).find(x => x.id === sel.value);
          if (it) { ctx.djAdd(it); toast(`＋ “${it.title}” queued`); }
        }
        renderDj();
      };
    });
  }
  $('#dj-close').onclick = () => $('#dj-modal').classList.add('hidden');
  $('#dj-modal').addEventListener('click', e => { if (e.target.id === 'dj-modal') $('#dj-modal').classList.add('hidden'); });

  // ═══════════════ FRONT ENTRANCE ═══════════════
  $('#btn-leave-store')?.addEventListener('click', () => {
    closeSettings(); closeSidebar();
    ctx.leaveStore?.();
  });

  // ═══════════════ HELP ═══════════════
  $('#btn-help').onclick = () => { $('#help-overlay').classList.remove('hidden'); document.exitPointerLock?.(); };
  $('#btn-help-close').onclick = () => $('#help-overlay').classList.add('hidden');
  $('#help-overlay').addEventListener('click', (e) => { if (e.target.id === 'help-overlay') $('#help-overlay').classList.add('hidden'); });

  // ═══════════════ SIDEBAR SEARCH ═══════════════
  const searchInput = $('#side-search');
  const searchResults = $('#side-search-results');
  if (searchInput) {
    const TYPE_ICON = { movie: '🎬', show: '📺', album: '💿', musicvideo: '🎤', episode: '🎙️', radio: '📻', live: '📡' };
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim().toLowerCase();
      if (q.length < 2) { searchResults.classList.add('hidden'); searchResults.innerHTML = ''; return; }
      const hits = (state.items || [])
        .filter(i => (i.title || '').toLowerCase().includes(q))
        .slice(0, 12);
      searchResults.innerHTML = hits.length
        ? hits.map(i => `
          <button class="search-row" data-search-id="${esc(i.id)}">
            <span>${TYPE_ICON[i.type] || 'MediaType'}</span>
            <span class="search-title">${esc(i.title)}</span>
            <small>${[i.year, (i.sectionTitle || '')].filter(Boolean).join(' · ')}</small>
          </button>`).join('')
        : '<div class="search-row" style="cursor:default">No matches on the shelves.</div>';
      searchResults.classList.remove('hidden');
      searchResults.querySelectorAll('[data-search-id]').forEach(row => {
        row.onclick = () => {
          const item = (state.items || []).find(i => i.id === row.dataset.searchId);
          searchResults.classList.add('hidden');
          if (item) showItemModal(item);
        };
      });
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { searchInput.value = ''; searchResults.classList.add('hidden'); searchInput.blur(); }
    });
  }

  // ═══════════════ CARRY CHIP (a case in hand → feed the theater deck) ═══════════════
  function updateCarry(payload) {
    const chip = $('#carry-chip'); if (!chip) return;
    if (!payload) { chip.classList.add('hidden'); return; }
    $('#carry-title').textContent = `${payload.item.title} · ${payload.format}`;
    chip.classList.remove('hidden');
  }
  const carryInfo = $('#carry-info'), carryBack = $('#carry-putback');
  if (carryInfo) carryInfo.onclick = () => { const c = ctx.carried?.(); if (c) showItemModal(c); };
  if (carryBack) carryBack.onclick = () => ctx.carry?.(null);

  // ═══════════════ JUKEBOX — every album / station / podcast, one click ═══════════════
  const MUSIC_TYPES = ['album', 'radio', 'episode'];
  const isNotVideoFile = i => !/\.(mp4|m4v|webm|mkv|mov|avi)$/i.test(i.key || i.file || '');   // jukebox lists AUDIO only
  const jukeSecKey = i => i.sectionId || i.sectionTitle || i.type;
  // t45: the jukebox is a selectable "shelf" — the shelf-map pref 'jukebox'
  // picks ONE music section for the wall unit ('' = every section). Audio was
  // removed from the store shelves entirely; this list is where music lives.
  function jukeItems() {
    const sel = state.shelves?.jukebox || '';
    return (state.items || []).filter(i => MUSIC_TYPES.includes(i.type) && isNotVideoFile(i)
      && (!sel || jukeSecKey(i) === sel));
  }
  ctx.jukeboxMusic = () => {                    // tests + the curious
    const sel = state.shelves?.jukebox || '';
    const all = (state.items || []).filter(i => MUSIC_TYPES.includes(i.type) && isNotVideoFile(i));
    const sections = [...new Set(all.map(jukeSecKey))];
    return { listed: jukeItems().length, total: all.length, selected: sel, sections: sections.length };
  };
  let jukeIdx = -1;                      // where we are in the music list (⏮/⏭)
  function stepJuke(dir) {
    const list = jukeItems();
    if (!list.length) return;
    if (jukeIdx < 0) jukeIdx = 0;
    jukeIdx = (jukeIdx + dir + list.length) % list.length;
    ctx.jukeboxPlay(list[jukeIdx]);
    toast(`🎵 On the jukebox: ${list[jukeIdx].title}`);
  }
  // t52: the old jukebox browse modal is RETIRED — the jukebox now opens the
  // full DJ deck (openDj('jukebox')). No leftover UI remains.

  // ═══════════════ SHELF PAGER (aim at a shelf, flip its pages) ═══════════════
  let pagerUnit = null;
  function updateShelfPager() {
    const chip = $('#shelf-pager');
    if (!chip) return;
    const info = ctx.shelfUnderCrosshair ? ctx.shelfUnderCrosshair() : null;
    if (!info) { chip.classList.add('hidden'); pagerUnit = null; return; }
    pagerUnit = info.unit;
    const secName = info.pool
      ? ((state.sections || []).find(x => x.key === info.pool)?.name || 'Category')
      : 'Mixed shelves';
    $('#shelf-pager-label').textContent = `${secName} · ${info.total} titles`;
    $('#shelf-page-num').textContent = `${info.page + 1}/${info.pages}`;
    chip.classList.remove('hidden');
  }
  const pagerPrev = $('#shelf-prev'), pagerNext = $('#shelf-next');
  if (pagerPrev) pagerPrev.onclick = () => pagerUnit && ctx.cycleShelf(pagerUnit, -1);
  if (pagerNext) pagerNext.onclick = () => pagerUnit && ctx.cycleShelf(pagerUnit, 1);

  // ═══════════════ TV SOUND / STOP ═══════════════

  const stopBtn = $('#btn-tv-stop');
  if (stopBtn) stopBtn.onclick = () => {
    ctx.getTv()?.stop();
    stopBtn.classList.add('hidden');
    toast('Playback stopped — the TV returns to its idle screen.');
  };

  // ── TV REMOTE (bottom bar): stop · ±10 s · play/pause · repeat · volume ──
  const remote = $('#tv-remote');
  if (remote) {
    const tvApi = () => ctx.getTv();
    const fmt = (t) => {
      if (!isFinite(t) || t <= 0) return '0:00';
      const m = Math.floor(t / 60), sec = Math.floor(t % 60);
      return `${m}:${String(sec).padStart(2, '0')}`;
    };
    const REPEAT_UI = { off: '➡️', all: '🔁', one: '🔂' };
    const REPEAT_NAME = { off: 'Repeat off', all: 'Repeat playlist', one: 'Repeat one' };
    // ONE remote, TWO systems: the buttons bind to whichever room you're
    // standing in when you press them (jukebox in the store, screen in the theater)
    const inStore = () => ctx.playerRoom?.() !== 'theater';   // t47: store AND dance hall → jukebox
    $('#tv-play').onclick = () => inStore() ? ctx.jukeboxToggle?.() : tvApi()?.togglePlay();
    $('#tv-prev').onclick = () => inStore() ? stepJuke(-1) : tvApi()?.step(-1);
    $('#tv-next').onclick = () => inStore() ? stepJuke(1) : tvApi()?.step(1);
    $('#tv-skip-back').onclick = () => inStore() ? ctx.jukeboxSeek?.(-10) : tvApi()?.seekBy(-10);
    $('#tv-skip-fwd').onclick = () => inStore() ? ctx.jukeboxSeek?.(10) : tvApi()?.seekBy(10);
    $('#tv-stop').onclick = () => {
      if (inStore()) { ctx.jukeboxStop?.(); toast('Jukebox stopped.'); return; }
      tvApi()?.stop();
      ctx.setVhsLook?.(false);
      toast('Playback stopped — the projector returns to its idle screen.');
    };
    $('#tv-vol').oninput = (e) => inStore() ? ctx.jukeboxSetVolume?.(e.target.value / 100) : tvApi()?.setVolume(e.target.value / 100);
    // ⛶ true full-screen — the raw video at native resolution (movies only)
    const fsBtn = $('#btn-tv-full');
    if (fsBtn) fsBtn.onclick = () => {
      const tv = tvApi(); if (!tv) return;
      if (tv.fullscreenActive?.()) { tv.exitFullscreen(); return; }
      if (!tv.enterFullscreen()) toast('Play a movie or video first — full screen is for video', true);
    };
    // repeat — a perk for SIGNED-IN users (guests just get straight-through play)
    const repeatBtn = $('#tv-repeat');
    const me = state.me();
    if (repeatBtn && me && !me.isGuest) repeatBtn.style.display = '';
    if (repeatBtn) {
      repeatBtn.onclick = () => {
        const tv = tvApi(); if (!tv) return;
        const order = ['off', 'all', 'one'];
        const next = order[(order.indexOf(tv.getRepeatMode()) + 1) % order.length];
        tv.setRepeatMode(next);
        repeatBtn.textContent = REPEAT_UI[next];
        repeatBtn.title = REPEAT_NAME[next];
        toast(REPEAT_NAME[next]);
      };
    }
    const queueEl = $('#tv-queue');
    const renderQueue = (tv, st) => {
      if (!queueEl) return;
      const q = tv.queueInfo?.();
      const show = st.playing && st.kind !== 'card' && q && q.length > 1;
      queueEl.classList.toggle('hidden', !show);
      if (!show) { queueEl.innerHTML = ''; return; }
      const rows = [];
      const cur = q.index;
      const start = Math.max(0, cur - 1);
      const end = Math.min(q.length, start + 5);
      if (start > 0) rows.push(`<div class="q-title">ON DECK · ${q.length} items</div>`);
      for (let i = start; i < end; i++) {
        const item = q.raw[i];
        if (!item) continue;
        rows.push(`<div class="q-row ${i === cur ? 'current' : ''}" data-qidx="${i}">
          <span>${i === cur ? '▶' : i === cur + 1 ? '⏭' : '·'}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.title)}</span>
          <small>${esc(item.type === 'live' ? 'live' : item.sectionTitle || '')}</small>
        </div>`);
      }
      if (q.length > end) rows.push(`<div class="q-title">+${q.length - end} more</div>`);
      queueEl.innerHTML = rows.join('');
    };
    queueEl?.addEventListener('click', (e) => {
      const row = e.target.closest('[data-qidx]');
      if (!row) return;
      tvApi()?.playAt(+row.dataset.qidx);
    });
    setInterval(() => {
      const tv = tvApi();
      if (!tv) return;
      updateShelfPager();                 // works while browsing, playing or not
      // ── room-aware remote: jukebox in the store, screen in the theater ──
      const room = ctx.playerRoom?.() || 'theater';
      remote.dataset.room = room;
      const roomTag = $('#remote-room');
      if (roomTag) roomTag.textContent = room === 'store' ? '🎵 JUKEBOX' : '🎬 THEATER';
      let st, show;
      if (room === 'store') {
        st = ctx.jukeboxStats?.() || {};
        show = !!st.playing;
      } else {
        st = tv.stats();
        show = st.playing && st.kind !== 'card';
      }
      remote.classList.toggle('hidden', !show);
      if (!show) { queueEl?.classList.add('hidden'); return; }
      $('#tv-play').textContent = st.paused ? '▶' : '⏸';
      $('#tv-time').textContent = st.duration
        ? `${fmt(st.time)} / ${fmt(st.duration)}` : fmt(st.time);
      const vol = Math.round((st.volume ?? 0.85) * 100);
      if (document.activeElement !== $('#tv-vol')) $('#tv-vol').value = vol;
      if (room === 'store') {
        queueEl?.classList.add('hidden');
        const fsB = $('#btn-tv-full'); if (fsB) fsB.style.display = 'none';
      } else {
        const fsB = $('#btn-tv-full'); if (fsB) fsB.style.display = '';
        const mode = tv.getRepeatMode();
        if (repeatBtn) {
          repeatBtn.textContent = REPEAT_UI[mode];
          repeatBtn.title = REPEAT_NAME[mode];
        }
        const fsOn = !!tv.fullscreenActive?.();
        if (fsB) { fsB.textContent = fsOn ? '🗗' : '⛶'; fsB.classList.toggle('active', fsOn); }
        renderQueue(tv, st);
      }
    }, 500);
  }

  return {
    updateCarry,
    openDj, toast, openSidebar, closeSidebar, openSettings, closeSettings, showItemModal, updateSidebar };
}
