// ─────────────────────────────────────────────────────────────────────────────
//  ui.js — every panel, modal and widget (no framework, just DOM)
//  ───────────────────────────────────────────────────────────────────────────
//  The side menu opens SETTINGS inside the app. Regular users get:
//    My Theme · My Shelves · Profile
//  Admins additionally get:
//    Server (Plex/Jellyfin) · Store TV · Users · Policies (locks & defaults)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { api } from './api.js?v=1789342462621';
import { createCaseView } from './store3d/caseview.js?v=1789342462621';   // the 3D case in the item modal
import { state } from './state.js?v=1789342462621';
import { SORT_MODES, SHELF_STYLES } from './store3d/config.js?v=1789342462621';
import { placeholderDataUrl } from './store3d/textures.js?v=1789342462621';

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
  function toast(msg, isError = false, link = null, opts = {}) {
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' error' : '');
    el.textContent = msg;
    if (opts.id) el.id = opts.id;                 // t100: lets callers avoid stacking duplicates
    if (link && /^https?:\/\//.test(String(link.url || ''))) {   // t96: clickable link (version notice) — http(s) hrefs only
      const a = document.createElement('a');
      a.href = link.url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = String(link.text || 'Open');
      a.style.cssText = 'margin-left:10px;font-weight:700;text-decoration:underline;cursor:pointer;color:inherit';
      el.appendChild(a);
    }
    $('#toasts').appendChild(el);
    if (opts.sticky) {                            // t100: stays until dismissed — no fade timer
      const dismiss = () => { el.remove(); opts.onDismiss?.(); };   // t101: the ✕ OR the link — either closes the box
      const a = el.querySelector('a');
      if (a) a.addEventListener('click', dismiss);   // t101: grabbing the update closes the note (the page still opens)
      const x = document.createElement('button');
      x.type = 'button';
      x.setAttribute('aria-label', 'Dismiss');
      x.textContent = '✕';
      x.style.cssText = 'margin-left:12px;background:none;border:none;color:inherit;font-weight:900;font-size:13px;cursor:pointer;padding:0 2px;';
      x.onclick = dismiss;
      el.appendChild(x);
      return;
    }
    const life = link ? 12000 : 3400;             // a link needs time to be clicked
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, life);
    setTimeout(() => el.remove(), life + 500);
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
    // t130: the bottom chip (source status) is gone — the ™© mark sits there now
  }

  // ── settings shell ──
  const TITLES = {
    look: 'My Theme', shelves: 'My Shelves', profile: 'My Profile',
    admin: 'Admin'
  };
  function openSettings(tab) {
    $('#settings-title').textContent = TITLES[tab] || 'Settings';
    $('#settings-body').innerHTML = '';
    ({
      look: panelLook, shelves: panelShelves, profile: panelProfile,
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

      <div class="hint" style="margin:-6px 0 10px">🎵 The dance-floor light controls now live in the <b>DJ booth</b> — open the laptop at the booth in the dance hall.</div>

      <div class="section-title">My TV idle screen</div>
      <div class="radio-cards">
        ${[['', 'Store default', 'whatever the manager set'],
           ['white', 'Projector screen', 'blank white — ready for the reel'],
           ['standby', 'Standby card', 'the classic "now playing: nothing"'],
           ['loop', 'Synthwave loop', 'built-in attraction channel'],
           ['item', 'A favorite title', 'loops quietly on the TV']]
          .map(([id, label, sub]) => `
          <button class="radio-card ${((state.prefs.tv || {}).idleMode ?? '') === id ? 'active' : ''}" data-idle="${id}">
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
          <small style="margin-left:auto;color:var(--vb-muted)">no music yet — the admin can turn on Radio in Admin → Media</small>
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
          const unit = sel.dataset.unit;
          if (sel.value) myMap[unit] = sel.value;
          else delete myMap[unit];
          // t134 FIX (novice pass): setting a shelf back to "Automatic" now
          // sends an explicit '' tombstone. The old code sent the map WITHOUT
          // the key, and the server's {...saved, ...patch} merge re-inherited
          // the abandoned pin — it resurrected on the next load ("My Shelves
          // is buggy when selecting individual categories"). Same shape the
          // reset button has always used, now per-unit too.
          const patch = { [unit]: sel.value || '' };   // '' rides the wire and clears the pin
          ctx.previewShelves({ ...myMap });            // live preview behind the panel
          state.updatePrefs({ shelves: patch });       // t88 BUG 2 FIX: commit-on-change —
          state.shelves = { ...myMap };                // the preview IS the saved map, always
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
        const clear = {};                             // t134: tombstones — omitting the keys let the stale pins resurrect
        for (const [unit] of stale) { delete myMap[unit]; clear[unit] = ''; }
        state.updatePrefs({ shelves: clear });
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
          <code style="flex:1;min-width:170px;padding:8px 10px;border:1px solid var(--vb-line,#2a3354);border-radius:8px;background:var(--vb-panel,rgba(10,12,30,.55));font-size:13px">${esc(primary)}</code>
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
        <div class="hint" style="margin-top:6px">Theme, shelves, shelf map, TV pick and dance floor lights all return to the store defaults — no reinstall needed.</div>
`;
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
      return;
    }
    root.innerHTML = `
      <div class="section-title">Guest mode</div>
      <p class="hint" style="margin:0 0 18px">You're browsing as a guest. Your theme &amp; shelf arrangement are saved
      automatically to <b>this device/browser</b> and persist between visits — no account needed.
      Create an account at the <b>front entrance</b> if you'd like them to <b>sync across your devices</b>.</p>
      <div class="section-title">Start fresh</div>
      <button class="btn" id="btn-reset-all">↺ Reset ALL my settings</button>
      <div class="hint" style="margin:6px 0 18px">Theme, shelves, shelf map, TV pick and dance floor lights all return to the store defaults — no reinstall needed.</div>
      <div class="section-title" style="margin-top:18px">Sign in</div>
      <p class="hint" style="margin:0 0 14px">🔑 First time? The store manager account is
      <b>BabyBluJ</b> / <b>BluJNetwork</b> — sign in at the front entrance, then change it in ☰ Menu → Admin → Users.<br>🔑 Accounts live at the <b>front entrance</b> now —
      use <b>🚪 Back to front entrance</b> in the sidebar and sign in (or create an account) right
      at the front desk, then walk straight into your media. Admins get their panels in ☰ Menu
      once they're in.</p>`;
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
      <div class="hint" style="margin:-4px 0 10px">Two servers in the house (or a friend's)? Connect <b>as many as you like</b> — every extra one stacks on the shelves under its own nickname.</div>
      <div id="instance-list"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="btn-add-plex">+ Add another Plex</button>
        <button class="btn" id="btn-add-jf">+ Add another Jellyfin</button>
      </div>

      <div class="section-title" style="margin-top:16px">🤝 Friends' stores — their shelves, in your store</div>
      <div class="hint" style="margin:-4px 0 10px">Add a friend's <b>Home Binger</b> with the address + friend code they give you. Their shared shelves appear as new sections — their media streams through <b>their</b> store, so nobody's logins ever leave home.</div>
      <div id="friend-store-list"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="btn-add-fstore">+ Add a friend's Home Binger</button>
      </div>

      <div class="section-title" style="margin-top:16px">🤝 Friend sharing — your store, for your friends</div>
      <div class="hint" style="margin:-4px 0 10px">Invite a friend and the app mints a <b>friend code</b>. Hand them your store address + the code (text it, say it out loud — your call). Tick which of <b>your</b> shelves each friend sees; untick everything to pause them. Things a friend shared to <b>you</b> can never be shared onward — only your own shelves are ever offered.</div>
      <div class="field" style="margin-bottom:10px"><label class="switch"><input type="checkbox" id="fs-share-on" ${(adminCfg.friendShare?.on) ? 'checked' : ''}><span class="track"></span></label>
        <span style="margin-left:8px">Let friends connect to my store</span></div>
      <div id="friend-share-list"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" id="btn-add-friend">+ Invite a friend</button>
      </div>

      <div class="section-title" style="margin-top:16px">Free shelves — stack with anything above</div>
      <div class="hint" style="margin:-4px 0 12px">Public-domain classics from the <b>Internet Archive</b>, live radio from <b>Radio-Browser</b>, and any podcast's RSS feed. Free, legal, no account. Nothing checked = that shelf stays off.</div>

      <div class="section-title">🎞️ Classics wing (Internet Archive)</div>
      <div id="archive-libraries" class="lib-list"><div class="hint">Loading categories…</div></div>

      <div class="section-title" style="margin-top:14px">📻 Radio wall (live stations)</div>
      <div id="radio-libraries" class="lib-list"><div class="hint">Loading genres…</div></div>

      <div class="section-title" style="margin-top:14px">📺 Live TV (the theater's Guide)</div>
      <div class="hint" style="margin:-4px 0 8px">Free channels from the public <b>iptv-org</b> directory, curated to
        officially-free sources (Pluto, Tubi, ABC, PBS, public broadcasters…). They play in the theater's
        <b>GUIDE</b> (press <b>G</b> in the theater) — never on the shelves.</div>
      <div id="iptv-libraries" class="lib-list"><div class="hint">Loading groups…</div></div>
      <div class="toggle-row" style="margin-top:8px">
        <div><div class="t-label">Show every channel (unverified)</div>
        <div class="t-sub">widens the Guide beyond the curated tier — includes streams nobody has vouched for</div></div>
        <label class="switch"><input type="checkbox" id="iptv-unverified" ${adminCfg.iptv?.unverified ? 'checked' : ''}><span class="track"></span></label>
      </div>

      <div class="section-title" style="margin-top:14px">🎙️ Podcast rack (RSS)</div>
      <div id="podcast-feeds" class="lib-list"></div>
      <div class="row2" style="margin-top:6px">
        <div class="field"><label>Podcast RSS URL</label>
          <input type="url" id="podcast-url" placeholder="https://feeds.example.com/show.rss"></div>
        <div class="field"><label>Nickname (optional)</label>
          <input type="text" id="podcast-name" placeholder="e.g. Drive-In Discourse" maxlength="64"></div>
        <div class="field"><label>&nbsp;</label>
          <button class="btn" id="btn-add-podcast">+ Add feed</button></div>
      </div>
      <div class="hint" style="margin:-6px 0 14px">Any podcast works: Share → <b>Copy RSS URL</b> in your podcast app, paste here — <b>add as many as you like</b>; each gets its own labeled shelf. Newest episodes shelve as CDs in the rack. Untick a feed to park it without deleting it.</div>

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
    // t93: MULTI-SOURCE podcast rack — feeds are {url, name, on} (legacy
    // plain-string feeds from 1.6.x are normalized on load). Each feed has
    // its own on/off switch (park it without losing the URL) + delete.
    let podcastList = ((adminCfg.podcasts?.feeds) || []).map(f =>
      typeof f === 'string' ? { url: f, name: null, on: true } : { url: f.url, name: f.name || null, on: f.on !== false });
    const renderPodcastFeeds = () => {
      const box = root.querySelector('#podcast-feeds');
      box.innerHTML = podcastList.length
        ? podcastList.map((f, i) => `<label class="lib-row"><input type="checkbox" data-feed-on="${i}" ${f.on ? 'checked' : ''}>
            <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name || f.url)}</b>
            ${f.name ? `<small>${esc(f.url)}</small>` : ''}
            <button class="btn" data-del-feed="${i}" style="margin-left:auto;padding:2px 8px">✕</button></label>`).join('')
        : '<div class="hint">No feeds yet — paste an RSS URL below.</div>';
      box.querySelectorAll('[data-del-feed]').forEach(b => {
        b.onclick = () => { podcastList.splice(Number(b.dataset.delFeed), 1); renderPodcastFeeds(); };
      });
      box.querySelectorAll('[data-feed-on]').forEach(cb => {
        cb.onchange = () => { podcastList[Number(cb.dataset.feedOn)].on = cb.checked; };
      });
    };
    renderPodcastFeeds();
    root.querySelector('#btn-add-podcast').onclick = () => {
      const inp = root.querySelector('#podcast-url');
      const nameInp = root.querySelector('#podcast-name');
      const u = inp.value.trim();
      if (!/^https?:\/\//i.test(u)) return toast('That does not look like an RSS URL', true);
      if (podcastList.some(f => f.url === u)) return toast('Already in the rack', true);
      podcastList.push({ url: u, name: (nameInp?.value || '').trim() || null, on: true });
      inp.value = ''; if (nameInp) nameInp.value = '';
      renderPodcastFeeds();
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
    loadStaticLibs('iptv', '#iptv-libraries', adminCfg.iptv?.sections);   // t123: the Guide's groups
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
    // ── t97: HB↔HB — friends' stores (in) + friend sharing (out) ──
    let fsDrafts = (adminCfg.friendStores || []).map(s => ({ ...s, _new: false }));
    let shareDrafts = (adminCfg.friendShare?.entries || []).map(e => ({ ...e, _new: false }));
    let mySections = null;
    const loadMySections = async () => {              // own shelves only — server enforces the no-transitive rule
      if (mySections) return mySections;
      try { const r = await fetch('/api/admin/friend-sections', { credentials: 'include' }); mySections = (await r.json()).sections || []; }
      catch { mySections = []; }
      return mySections;
    };
    const renderFStores = () => {
      const box = root.querySelector('#friend-store-list');
      if (!fsDrafts.length) { box.innerHTML = '<div class="hint" style="margin:0">No friends added yet.</div>'; return; }
      box.innerHTML = fsDrafts.map((s, idx) => {
        const k = CSS.escape(s.id || `new-${idx}`);
        return `
        <div class="lib-card" style="margin-bottom:10px;padding:10px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div class="field"><label>Nickname</label><input type="text" data-fs-name="${k}" value="${esc(s.name || '')}" placeholder="e.g. Dave"></div>
            <div class="field" style="flex:1;min-width:170px"><label>Their store address</label><input type="url" data-fs-url="${k}" value="${esc(s.url || '')}" placeholder="http://their-pc:8181"></div>
            <div class="field"><label>Friend code</label><input type="text" data-fs-code="${k}" value="${esc(s.token || '')}" placeholder="the code they gave you" style="font-family:monospace"></div>
            <div class="field" style="align-self:flex-end"><label class="switch"><input type="checkbox" data-fs-on="${k}" ${s.on !== false ? 'checked' : ''}><span class="track"></span></label></div>
            <div class="field" style="align-self:flex-end"><button class="btn" data-fs-test="${k}">Test</button></div>
            <div class="field" style="align-self:flex-end"><button class="btn" data-fs-del="${k}">🗑</button></div>
          </div>
        </div>`;
      }).join('');
      for (const s of fsDrafts) {
        const k = CSS.escape(s.id || `new-${fsDrafts.indexOf(s)}`);
        const q = (sel) => root.querySelector(`[data-fs-${sel}="${k}"]`);
        q('del').onclick = () => { fsDrafts = fsDrafts.filter(x => x !== s); renderFStores(); };
        q('test').onclick = async () => {
          const url = q('url').value.trim();
          if (!url) return toast('Enter their store address first', true);
          toast('Testing the connection…');
          try {
            const r = await api.adminTest({ source: 'friend', url, token: q('code').value.trim() });
            toast(`✅ ${r.name} — ${r.detail}`);
          } catch (err) { toast(err.message, true); }
        };
      }
    };
    renderFStores();
    root.querySelector('#btn-add-fstore').onclick = () => {
      fsDrafts.push({ id: '', name: '', url: '', token: '', on: true, _new: true });
      renderFStores();
    };
    const renderFShare = async () => {
      const box = root.querySelector('#friend-share-list');
      const secs = await loadMySections();
      if (!shareDrafts.length) { box.innerHTML = '<div class="hint" style="margin:0">Nobody invited yet — "+ Invite a friend" creates a code to hand out.</div>'; return; }
      box.innerHTML = shareDrafts.map((e, idx) => {
        const k = CSS.escape(e.id || `new-${idx}`);
        const secsHtml = e._new
          ? '<div class="hint" style="margin:4px 0 0">Click Save Settings first — the code appears here, then tick the shelves they see.</div>'
          : (secs.length
            ? (() => {   // t106: GROUPS OF MEDIA ONLY — sections clustered under
              // their source (Plex / Archive / Radio…), never a wall of loose rows
              const groups = new Map();
              for (const sec of secs) {
                const g = sec.sourceLabel || 'Media';
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g).push(sec);
              }
              return [...groups.entries()].map(([label, list]) => `
                <div class="lib-row" style="cursor:default;opacity:.9;font-size:12px">
                  <b>${esc(label)}</b><small>${list.reduce((n, x) => n + x.count, 0)} titles</small></div>` +
                list.map(sec => `
                <label class="lib-row"><input type="checkbox" value="${esc(sec.key)}" ${(e.sections || []).includes(sec.key) ? 'checked' : ''}>
                  <b>${esc(sec.name)}</b><small>${sec.count} titles</small></label>`).join('')).join('');
            })()
            : '<div class="hint" style="margin:4px 0 0">Nothing on your shelves yet — stock the store first, then come back.</div>');
        return `
        <div class="lib-card" style="margin-bottom:10px;padding:10px">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div class="field"><label>Friend's name</label><input type="text" data-sh-name="${k}" value="${esc(e.name || '')}" placeholder="e.g. Mom"></div>
            <div class="field" style="flex:1"><label>Their friend code — give them this + your store address</label>
              <input type="text" readonly data-sh-code="${k}" value="${esc(e.token || '')}" placeholder="appears after Save" style="font-family:monospace;cursor:pointer" title="click to copy"></div>
            <div class="field" style="align-self:flex-end"><label class="switch"><input type="checkbox" data-sh-on="${k}" ${e.on !== false ? 'checked' : ''}><span class="track"></span></label></div>
            <div class="field" style="align-self:flex-end;flex-direction:row;gap:6px">
              <button class="btn sm" data-sh-all="${k}" title="Share every shelf with this friend">All</button>
              <button class="btn sm" data-sh-none="${k}" title="Pause this friend — share nothing">None</button>
              <button class="btn" data-sh-del="${k}">🗑</button></div>
          </div>
          <div class="lib-list" data-sh-secs="${k}" style="margin-top:6px">${secsHtml}</div>
        </div>`;
      }).join('');
      for (const e of shareDrafts) {
        const k = CSS.escape(e.id || `new-${shareDrafts.indexOf(e)}`);
        const q = (sel) => root.querySelector(`[data-sh-${sel}="${k}"]`);
        q('del').onclick = () => { shareDrafts = shareDrafts.filter(x => x !== e); renderFShare(); };
        const secBox = root.querySelector(`[data-sh-secs="${k}"]`);
        q('all').onclick = () => { secBox?.querySelectorAll('input[type="checkbox"]').forEach(c => { c.checked = true; }); };
        q('none').onclick = () => { secBox?.querySelectorAll('input[type="checkbox"]').forEach(c => { c.checked = false; }); };
        const codeEl = q('code');
        if (codeEl) codeEl.onclick = () => {
          codeEl.select?.();
          try { navigator.clipboard?.writeText(codeEl.value); toast('Friend code copied'); }
          catch { toast('Code: ' + codeEl.value); }
        };
      }
    };
    renderFShare();
    root.querySelector('#btn-add-friend').onclick = () => {
      shareDrafts.push({ id: '', name: '', token: '', sections: [], on: true, _new: true });
      renderFShare();
    };
    // t125: a group list that failed to load must NEVER read as "zero groups
    // picked" (that's exactly how the t124 admin-list bug wiped Live TV's
    // sections on save) — if the list didn't render its checkboxes, keep the
    // sections already saved instead of sending an empty list.
    const keptSections = (sel, saved) => {
      const box = root.querySelector(sel);
      return box?.querySelector('input[type="checkbox"]')
        ? [...box.querySelectorAll('input:checked')].map(c => c.value)
        : (saved || []);
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
      archive: { sections: keptSections('#archive-libraries', adminCfg.archive?.sections) },   // t125: wipe-guarded
      radio: { sections: keptSections('#radio-libraries', adminCfg.radio?.sections) },         // t125: wipe-guarded
      iptv: { sections: keptSections('#iptv-libraries', adminCfg.iptv?.sections),              // t125: wipe-guarded
        unverified: !!(root.querySelector('#iptv-unverified')?.checked) },   // t123: the Guide
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
      }),
      friendStores: fsDrafts.map((s, idx) => {            // t97: friends' stores (in)
        const k = CSS.escape(s.id || `new-${idx}`);
        return {
          id: s._new ? '' : s.id,
          name: root.querySelector(`[data-fs-name="${k}"]`)?.value.trim() || '',
          url: root.querySelector(`[data-fs-url="${k}"]`)?.value.trim() || '',
          token: root.querySelector(`[data-fs-code="${k}"]`)?.value.trim() || '',
          on: root.querySelector(`[data-fs-on="${k}"]`)?.checked ?? true
        };
      }),
      friendShare: {                                      // t97: friend sharing (out)
        on: root.querySelector('#fs-share-on')?.checked ?? false,
        entries: shareDrafts.map((e, idx) => {
          const k = CSS.escape(e.id || `new-${idx}`);
          const box = root.querySelector(`[data-sh-secs="${k}"]`);
          return {
            id: e._new ? '' : e.id,
            name: root.querySelector(`[data-sh-name="${k}"]`)?.value.trim() || '',
            token: e.token || '',
            sections: box?.querySelector('input[type="checkbox"]')
              ? [...box.querySelectorAll('input:checked')].map(c => c.value)
              : (e.sections || []),
            on: root.querySelector(`[data-sh-on="${k}"]`)?.checked ?? true
          };
        })
      }
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
      for (const s of d.friendStores) {                    // t97: a friend store needs address + code
        if (s.on && (!s.url || !s.token))
          return toast(`"${s.name || 'Friend store'}" needs both their store address and their friend code`, true);
      }
      if (d.sources.plex && d.plex.sections.length === 0)
        return toast('No Plex libraries are ticked — hit "↻ Load libraries" and tick at least one (or switch Plex off)', true);
      if (d.sources.jellyfin && d.jellyfin.sections.length === 0)
        return toast('No Jellyfin libraries are ticked — hit "↻ Load libraries" and tick at least one (or switch Jellyfin off)', true);
      try {
        const beforeKeys = new Set((state.sections || []).map(s => s.key));
        await api.adminSaveConfig(draft());
        toast('Saved — restocking the shelves…');
        closeSettings();
        await ctx.reloadLibrary();
        // t123: the owner's link-time flow — every NEW library gets its
        // "who gets this?" question the moment it's linked. Cancel/All = everyone.
        const fresh = (state.sections || []).map(s => s.key).filter(k => !beforeKeys.has(k));
        if (fresh.length) await promptLibraryAccess(fresh).catch(() => {});
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
  // t123: INVITE A FRIEND — the Tailscale on-ramp card (Users panel).
  // Generates a one-time .bat the friend runs: installs Tailscale quietly,
  // joins with the pre-auth key, opens the store. The KEY lives only in the
  // file — the server records just nickname + dates.
  async function renderInviteCard(box) {
    if (!box) return;
    box.innerHTML = `
      <div class="section-title" style="margin-top:20px">🎫 Invite a friend (remote access)</div>
      <div class="hint" style="margin:-4px 0 10px">Friends join over your free <b>Tailscale</b> network — no port
      forwarding, nothing public. Create a one-time key in the Tailscale admin console
      (<a href="https://login.tailscale.com/admin/settings/keys" target="_blank" rel="noopener">Settings → Keys</a> →
      <b>Generate auth key</b> · reusable OFF · pre-approved ON · expiry ~30 days), paste it here.</div>
      <div class="row2">
        <div class="field"><label>Their nickname</label><input type="text" id="inv-name" placeholder="e.g. Dave" maxlength="24"></div>
        <div class="field"><label>Store address they open</label><input type="text" id="inv-host" placeholder="100.x.y.z:8181 (your Tailscale IP)"></div>
      </div>
      <div class="field"><label>Pre-auth key (starts with tskey-)</label>
        <input type="text" id="inv-key" placeholder="tskey-auth-…" autocomplete="off"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn accent" id="inv-dl">⬇ Download invite (.bat)</button>
        <button class="btn" id="inv-ip">Find my Tailscale IP</button>
      </div>
      <div class="hint" id="inv-out" style="margin-top:8px"></div>
      <div class="locked-note" style="margin-top:8px">
        <b>What your friend sees:</b> Windows may show a blue "protected your PC" screen for the invite file —
        that's normal for unsigned scripts: <b>More info → Run anyway</b>.<br>
        <b>Lockdown (optional, not yet field-verified):</b> in the Tailscale console under Access Controls you can
        restrict what friends reach — ask and I'll walk you through the one-line rule before you rely on it.<br>
        <b>Revoking:</b> disable the key in the Tailscale console (Keys page) — the invite stops working instantly.
      </div>
      <div id="inv-list" class="lib-list" style="margin-top:10px"></div>`;
    const out = box.querySelector('#inv-out');
    try {
      const tip = await api.adminTailscaleIp();
      if (tip.ip) { box.querySelector('#inv-host').value = tip.ip + ':8181'; out.textContent = 'Found your Tailscale IP: ' + tip.ip; }
    } catch { /* manual entry */ }
    box.querySelector('#inv-ip').onclick = async () => {
      out.textContent = 'Looking…';
      try { const r = await api.adminTailscaleIp(); out.textContent = r.ip ? ('Found: ' + r.ip + ' (filled in above)') : 'Not found — is Tailscale running on this machine? Enter the address by hand.'; if (r.ip) box.querySelector('#inv-host').value = r.ip + ':8181'; }
      catch (e) { out.textContent = e.message; }
    };
    const renderList = async () => {
      try {
        const r = await api.adminInvites();
        box.querySelector('#inv-list').innerHTML = (r.invites || []).length
          ? r.invites.slice().reverse().map(i => `<label class="lib-row" style="cursor:default">
              <b>${esc(i.name)}</b><small>invited ${new Date(i.createdAt).toLocaleDateString()} · key expires ~${new Date(i.expiresAt).toLocaleDateString()}</small></label>`).join('')
          : '<div class="hint" style="margin:0">No invites sent yet.</div>';
      } catch { /* quiet */ }
    };
    renderList();
    box.querySelector('#inv-dl').onclick = async () => {
      const name = box.querySelector('#inv-name').value.trim() || 'friend';
      const key = box.querySelector('#inv-key').value.trim();
      const host = box.querySelector('#inv-host').value.trim();
      out.textContent = '';
      try {
        const r = await fetch('/api/admin/invite/bat?name=' + encodeURIComponent(name) + '&key=' + encodeURIComponent(key) + '&host=' + encodeURIComponent(host),
          { credentials: 'include', headers: authHeaders() });
        if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Invite failed'); }
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'HB-Invite-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.bat';
        a.click();
        URL.revokeObjectURL(a.href);
        out.textContent = 'Invite downloaded — send the file to your friend (email, Discord, USB…).';
        renderList();
      } catch (e) { out.textContent = '❌ ' + e.message; }
    };
  }
  function authHeaders() {
    const t = localStorage.getItem('vb_sess');
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  // t123: "Who gets this library?" — asked AT LINK TIME (owner's flow).
  // Absent = all accounts (the safe default: linking is never blocked).
  async function promptLibraryAccess(newKeys) {
    const { access, users } = await api.adminLibraryAccess();
    if (!users.length) return;                          // no accounts yet — nothing to split
    const sections = state.sections || [];
    for (const key of newKeys) {
      if (key in access) continue;                      // already answered
      const name = sections.find(s => s.key === key)?.name || key;
      await new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal';
        overlay.innerHTML = `
          <div class="modal-card narrow">
            <h2 style="margin:0 0 6px">Who gets this library?</h2>
            <p class="hint" style="margin:0 0 14px">You just linked <b>${esc(name)}</b>.</p>
            <div id="la-pick" style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn accent" data-la="all" style="flex:1">All accounts</button>
              <button class="btn" data-la="some" style="flex:1">Only certain accounts…</button>
            </div>
            <div id="la-users" class="lib-list" style="margin-top:12px;display:none"></div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button class="btn accent" id="la-save" style="display:none;flex:1">Save</button>
              <button class="btn" id="la-cancel" style="flex:1">Everyone (default)</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        const done = () => { overlay.remove(); resolve(); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) done(); });
        const pick = overlay.querySelector('#la-pick'), ubox = overlay.querySelector('#la-users'), save = overlay.querySelector('#la-save');
        pick.onclick = (e) => {
          const b = e.target.closest('[data-la]');
          if (!b) return;
          if (b.dataset.la === 'all') { api.adminSetLibraryAccess(key, 'all').catch(() => {}); done(); }
          else {
            pick.style.display = 'none';
            ubox.style.display = '';
            save.style.display = '';
            ubox.innerHTML = users.map(u => `
              <label class="lib-row"><input type="checkbox" value="${esc(u.username)}" checked>
              <b>${esc(u.username)}</b></label>`).join('');
          }
        };
        save.onclick = () => {
          const chosen = [...ubox.querySelectorAll('input:checked')].map(c => c.value);
          api.adminSetLibraryAccess(key, { users: chosen }).catch(() => {});
          done();
        };
        overlay.querySelector('#la-cancel').onclick = done;
      });
    }
  }

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
            ${u.isAdmin ? '' : `<button class="btn small" data-libs="${esc(u.username)}">Libraries</button>`}
            <button class="btn small danger" data-del="${u.id}" data-name="${esc(u.username)}">Delete</button>
          </div>`).join('')}
        <div class="hint" style="margin-top:14px">Accounts are <b>self-serve</b> — visitors create their own at the
        front entrance page (the store owner can allow/block new sign-ups in Admin → Policies).
        You can still reset a forgotten password or remove an account here.</div>
        <div id="invite-card"></div>
        <div class="section-title" style="margin-top:18px">On the same Wi-Fi?</div>
        <div class="hint" style="margin:-4px 0 8px">No invite needed — anyone on the same Wi-Fi opens this address in any browser (phones too). Nothing to install.</div>
        <div id="invite-box"><div class="hint">…</div></div>`;
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
        inp.style.cssText = 'flex:1;min-width:0;padding:6px 10px;border-radius:6px;border:1px solid var(--vb-line,#2a3354);background:var(--vb-panel,rgba(10,12,30,.55));color:var(--vb-ink,#eef1ff)';
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
      root.querySelectorAll('[data-libs]').forEach(btn => {      // t123: per-user libraries (audit/edit door)
        btn.onclick = async () => {
          const uname = btn.dataset.libs;
          let data;
          try { data = await api.adminLibraryAccess(); }
          catch (e) { toast(e.message, true); return; }
          const sections = state.sections || [];
          const access = data.access || {};
          const allowed = (k) => {
            const v = access[k];
            return !(v && typeof v === 'object' && Array.isArray(v.users) && !v.users.includes(uname));
          };
          const overlay = document.createElement('div');
          overlay.className = 'modal';
          overlay.innerHTML = `
            <div class="modal-card narrow">
              <h2 style="margin:0 0 6px">${esc(uname)} — libraries</h2>
              <p class="hint" style="margin:0 0 12px">Untick a library and ${esc(uname)} stops seeing it — shelves, search, and the streams themselves.</p>
              <div class="lib-list">${sections.map(s => `
                <label class="lib-row"><input type="checkbox" value="${esc(s.key)}" ${allowed(s.key) ? 'checked' : ''}>
                <b>${esc(s.name)}</b><small>${esc(s.sourceLabel || '')}</small></label>`).join('') || '<div class="hint">No libraries yet.</div>'}</div>
              <div style="display:flex;gap:8px;margin-top:12px">
                <button class="btn accent" id="ul-save" style="flex:1">Save</button>
                <button class="btn" id="ul-close" style="flex:1">Close</button>
              </div>
            </div>`;
          document.body.appendChild(overlay);
          const done = () => overlay.remove();
          overlay.addEventListener('click', (e) => { if (e.target === overlay) done(); });
          overlay.querySelector('#ul-close').onclick = done;
          overlay.querySelector('#ul-save').onclick = async () => {
            const boxes = [...overlay.querySelectorAll('input[type="checkbox"]')];
            try {
              for (const b of boxes) {
                const k = b.value, nowAllowed = b.checked, was = allowed(k);
                if (nowAllowed === was) continue;
                const v = access[k];
                if (nowAllowed) {                        // re-allow: add them to the list (or clear the list)
                  const list = (v && Array.isArray(v.users)) ? v.users : [];
                  if (!list.includes(uname)) list.push(uname);
                  await api.adminSetLibraryAccess(k, { users: list });
                } else {                                 // restrict: everyone else keeps it
                  const others = (v && Array.isArray(v.users)) ? v.users.filter(n => n !== uname) : data.users.map(u => u.username).filter(n => n !== uname);
                  await api.adminSetLibraryAccess(k, { users: others });
                }
              }
              toast('Library access saved');
              done();
            } catch (e) { toast(e.message, true); }
          };
        };
      });
      renderInviteCard(root.querySelector('#invite-card'));   // t123: the Tailscale on-ramp
      loadInvite(root);   // t128: the same-Wi-Fi address box — invites live HERE only now
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
      <div class="field"><label>Default theme — pick a preset</label>
        <select id="def-preset">
          <option value="">Custom (the colors below)</option>
          ${THEME_PRESETS.map(p => `<option value="${esc(p.name)}" ${
            ['wall', 'floor', 'shelf', 'accent', 'style'].every(k => (adminCfg.defaults.theme[k] || '') === p.theme[k]) ? 'selected' : ''
          }>${esc(p.name)}</option>`).join('')}
        </select></div>
      <div class="row2">
        ${['wall', 'floor', 'shelf', 'accent'].map(k => `
          <div class="color-row">
            <input type="color" id="def-${k}" value="${adminCfg.defaults.theme[k]}">
            <span class="color-name">${{ wall: 'Walls', floor: 'Floor', shelf: 'Shelves', accent: 'Accent' }[k]}</span>
          </div>`).join('')}
      </div>
      <div class="toggle-row" id="retheme-row">
        <div><div class="t-label">Re-theme everyone now</div>
        <div class="t-sub">writes this theme into every visitor's settings (yours too) — nobody has to change anything themselves; they can re-personalize unless theming is locked</div></div>
        <label class="switch"><input type="checkbox" id="def-retheme" checked><span class="track"></span></label>
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
    // t130: picking a preset fills the color pickers + shelf style below (the
    // pickers stay for fine-tuning — that's how the "Custom" option happens)
    root.querySelector('#def-preset').onchange = (e) => {
      const p = THEME_PRESETS.find(x => x.name === e.target.value);
      if (!p) return;
      for (const k of ['wall', 'floor', 'shelf', 'accent']) root.querySelector(`#def-${k}`).value = p.theme[k];
      root.querySelector('#def-style').value = p.theme.style;
    };
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
        // t132: a changed default theme + "re-theme everyone" switches every
        // saved profile (this admin included) — the store visibly changes.
        const picked = {
          wall: root.querySelector('#def-wall').value, floor: root.querySelector('#def-floor').value,
          shelf: root.querySelector('#def-shelf').value, accent: root.querySelector('#def-accent').value,
          style: root.querySelector('#def-style').value
        };
        const changed = ['wall', 'floor', 'shelf', 'accent', 'style'].some(k => picked[k] !== adminCfg.defaults.theme[k]);
        // t133: fires under the lock too — the lock is a true sync, so a
        // changed house theme reaches every saved profile either way
        if (changed && root.querySelector('#def-retheme')?.checked) {
          const r = await api.adminRetheme(picked);
          toast(`Store re-themed — ${r.rethemed} profile${r.rethemed === 1 ? '' : 's'} switched`);
        }
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
        dance: state.boot.defaults.dance || { movement: 1, speed: 1, ballSpin: 1, pattern: 'auto' },   // t95: dance floor lights are personal too — "ALL" means all
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
      // t108b: the booth panel owns the dance-floor lights now (owner: they
      // belong with the rig, not the jukebox menu) — hand it the prefs + setter
      proUi = (window.__VB?.scene?.djPro)?.mount(body, { items: music,
        dance: state.prefs.dance || {},
        setDance: (patch) => { state.updatePrefs({ dance: patch }); ctx.applyDancePrefs(state.prefs.dance); } }) || null;
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
      <div class="dj-section">Add music <small id="dj-q-count"></small></div>
      <input id="dj-q" type="text" placeholder="Search all music — albums, stations, podcasts…" autocomplete="off"
        style="width:100%;padding:7px 9px;border:1px solid var(--vb-line,#2a3354);border-radius:8px;background:var(--vb-panel,rgba(10,12,30,.55));color:var(--vb-ink,#eef1ff);font:inherit;margin-bottom:6px">
      <div id="dj-list" style="max-height:190px;overflow-y:auto;border:1px solid var(--vb-line,#2a3354);border-radius:8px;padding:4px"></div>`;
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
        renderDj();
      };
    });
    // t121: THE JUKEBOX LISTS *ALL* THE MUSIC — the old "Add music" was a
    // <select> capped at the first 120 items, so anything later in the
    // library (podcasts especially — owner: "Wont show up in jukebox") could
    // never be queued from the jukebox. Same treatment as the booth list
    // (t113): live search + chunked scroll-loading. Click a row to queue it.
    {
      const qEl = body.querySelector('#dj-q'), listEl = body.querySelector('#dj-list'), cntEl = body.querySelector('#dj-q-count');
      if (qEl && listEl) {
        const norm = (s) => String(s || '').toLowerCase();
        const CH = 150; let shown = 0, hits = music;
        const draw = () => {
          listEl.insertAdjacentHTML('beforeend', hits.slice(shown, shown + CH).map(m2 => `
            <div class="dj-qrow" data-add="${esc(m2.id)}" style="cursor:pointer" title="${esc(m2.sectionTitle || m2.type)}">
              <span class="q-n">＋</span><span class="q-t">${esc(m2.title)}</span>
              <small style="margin-left:auto;color:var(--vb-muted);font-size:10.5px;white-space:nowrap">${esc(m2.sectionTitle || m2.type)}</small>
            </div>`).join(''));
          shown = Math.min(shown + CH, hits.length);
        };
        const refresh = () => {
          const q = norm(qEl.value).trim();
          hits = q ? music.filter(m2 => norm(m2.title).includes(q) || norm(m2.sectionTitle).includes(q) || norm(m2.type).includes(q)) : music;
          shown = 0; listEl.innerHTML = ''; draw();
          if (cntEl) cntEl.textContent = `${hits.length} of ${music.length}`;
        };
        listEl.onscroll = () => { if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 48 && shown < hits.length) draw(); };
        listEl.onclick = (e) => {
          const row = e.target.closest('[data-add]'); if (!row) return;
          const it = (state.items || []).find(x => x.id === row.dataset.add);
          if (it) { ctx.djAdd(it); toast(`＋ “${it.title}” queued`); }
        };
        qEl.oninput = refresh;
        refresh();
      }
    }
  }
  // t121: closing the DJ menu DISMOUNTS the pro rig. The old close only HID
  // the modal — the booth's window-keydown handler stayed registered with the
  // .djp DOM still mounted, so after using the booth once, walking with WASD
  // in the dance hall fired booth shortcuts (owner: "Music goes back a beat
  // pressing s" — S = SYNC yanked the live deck onto the other deck's grid).
  // Unmount removes the listener AND the DOM, so the keys die with the panel.
  function closeDj() {
    $('#dj-modal').classList.add('hidden');
    if (proUi) { try { proUi.unmount(); } catch {} proUi = null; }
  }
  $('#dj-close').onclick = closeDj;
  $('#dj-modal').addEventListener('click', e => { if (e.target.id === 'dj-modal') closeDj(); });

  // ═══════════════ FRONT ENTRANCE ═══════════════
  $('#btn-leave-store')?.addEventListener('click', () => {
    closeSettings(); closeSidebar();
    ctx.leaveStore?.();
  });

  // ═══════════════ HELP ═══════════════
  $('#btn-help').onclick = () => { $('#help-overlay').classList.remove('hidden'); document.exitPointerLock?.(); };
  $('#btn-help-close').onclick = () => $('#help-overlay').classList.add('hidden');
  $('#help-overlay').addEventListener('click', (e) => { if (e.target.id === 'help-overlay') $('#help-overlay').classList.add('hidden'); });
  // t134 (novice pass): Esc closes the help too — every other modal honors it;
  // a first-time user pressing "the universal close key" got nothing here.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const ov = $('#help-overlay');
    if (ov && !ov.classList.contains('hidden')) { ov.classList.add('hidden'); e.preventDefault(); }
  });

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
    // ONE remote, THREE systems (t134): the buttons bind to whichever room
    // you're standing in when you press them — the jukebox in the store, the
    // booth rig in the dance hall, the big screen in the theater. (t47 bound
    // store AND dance to the jukebox; t134 gives the dance hall its own booth
    // remote after the theater's remote kept haunting the dance floor.)
    // The "booth" is whichever system is live: the PRO RIG (the laptop's own
    // decks) when it has vinyl loaded, else the classic booth channel.
    const proDecks = () => { try { return ctx.boothPro?.()?.decksRef?.() || []; } catch { return []; } };
    const boothMode = () => proDecks().some(dk => dk.item) ? 'pro' : 'classic';
    const proPlaying = () => proDecks().some(dk => dk.el && !dk.el.paused);
    const proToggle = () => {
      const decks = proDecks();
      if (!decks.length) return;
      if (proPlaying()) decks.forEach(dk => { try { dk.el?.pause(); } catch {} });
      else decks.forEach(dk => { if (dk.el && dk.item) { try { dk.el.play().catch(() => {}); } catch {} } });
    };
    const proSeek = (s) => proDecks().forEach(dk => {
      if (dk.el && !dk.el.paused && isFinite(dk.el.duration)) {
        try { dk.el.currentTime = Math.max(0, Math.min(dk.el.duration, dk.el.currentTime + s)); } catch {}
      }
    });
    const roomSystem = () => {
      const room = ctx.playerRoom?.() || 'store';
      if (room === 'theater') return 'theater';
      if (room === 'dance') return 'booth';
      return 'jukebox';
    };
    const deckFor = () => roomSystem() === 'booth' ? ctx.dj?.booth : ctx.dj?.jukebox;
    $('#tv-play').onclick = () => {
      const s = roomSystem();
      if (s === 'theater') tvApi()?.togglePlay();
      else if (s === 'booth' && boothMode() === 'pro') proToggle();
      else if (s === 'booth') ctx.boothToggle?.();
      else ctx.jukeboxToggle?.();
    };
    $('#tv-prev').onclick = () => {
      const s = roomSystem();
      if (s === 'theater') tvApi()?.step(-1);
      else if (s === 'booth') {
        if (boothMode() === 'pro') toast('The booth\u2019s set list lives on the laptop — skip from the pro rig');
        else deckFor()?.prev();
      }
      else stepJuke(-1);
    };
    $('#tv-next').onclick = () => {
      const s = roomSystem();
      if (s === 'theater') tvApi()?.step(1);
      else if (s === 'booth') {
        if (boothMode() === 'pro') toast('The booth\u2019s set list lives on the laptop — skip from the pro rig');
        else deckFor()?.next();
      }
      else stepJuke(1);
    };
    $('#tv-skip-back').onclick = () => {
      const s = roomSystem();
      if (s === 'theater') tvApi()?.seekBy(-10);
      else if (s === 'booth' && boothMode() === 'pro') proSeek(-10);
      else if (s === 'booth') ctx.boothSeek?.(-10);
      else ctx.jukeboxSeek?.(-10);
    };
    $('#tv-skip-fwd').onclick = () => {
      const s = roomSystem();
      if (s === 'theater') tvApi()?.seekBy(10);
      else if (s === 'booth' && boothMode() === 'pro') proSeek(10);
      else if (s === 'booth') ctx.boothSeek?.(10);
      else ctx.jukeboxSeek?.(10);
    };
    $('#tv-stop').onclick = () => {
      const s = roomSystem();
      if (s === 'theater') {
        tvApi()?.stop();
        ctx.setVhsLook?.(false);
        toast('Playback stopped — the projector returns to its idle screen.');
        return;
      }
      if (s === 'booth') { ctx.boothPro?.()?.stopAll?.(); ctx.boothStop?.(); toast('Booth stopped.'); return; }
      ctx.jukeboxStop?.(); toast('Jukebox stopped.');
    };
    $('#tv-vol').oninput = (e) => {
      const s = roomSystem();
      if (s === 'theater') tvApi()?.setVolume(e.target.value / 100);
      else if (s === 'booth' && boothMode() === 'pro') ctx.boothPro?.()?.setMaster?.(e.target.value / 100);
      else if (s === 'booth') ctx.boothSetVolume?.(e.target.value / 100);
      else ctx.jukeboxSetVolume?.(e.target.value / 100);
    };
    // ⛶ true full-screen — the raw video at native resolution (movies only)
    const fsBtn = $('#btn-tv-full');
    if (fsBtn) fsBtn.onclick = () => {
      const tv = tvApi(); if (!tv) return;
      if (tv.fullscreenActive?.()) { tv.exitFullscreen(); return; }
      if (!tv.enterFullscreen()) toast('Play a movie or video first — full screen is for video', true);
    };
    // t130: repeat is the DECKS' button now — the owner called it: repeat
    // isn't needed for TV or movies (the playlist feature covers those). It
    // shows wherever a deck is playing (jukebox in the store, booth in the
    // dance hall) and cycles THAT deck; hidden in the theater.
    const repeatBtn = $('#tv-repeat');
    if (repeatBtn) {
      repeatBtn.onclick = () => {
        const deck = deckFor(); if (!deck) return;
        const cur = deck.repeat || 'off';
        const next = cur === 'off' ? 'one' : cur === 'one' ? 'all' : 'off';
        deck.repeat = next;
        repeatBtn.textContent = REPEAT_UI[next];
        repeatBtn.title = REPEAT_NAME[next];
        toast(`${deck === ctx.dj?.booth ? 'Booth' : 'Jukebox'}: ${REPEAT_NAME[next].toLowerCase()}`);
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
    // t134: the dance hall's remote shows the BOOTH's set list (same card,
    // booth queue instead of the TV's)
    const renderBoothQueue = () => {
      if (!queueEl) return;
      const deck = ctx.dj?.booth;
      const q = deck?.state?.();
      const show = !!(q && q.queue.length > 1 && (ctx.boothStats?.() || {}).playing);
      queueEl.classList.toggle('hidden', !show);
      if (!show) { queueEl.innerHTML = ''; return; }
      const rows = [];
      const cur = q.idx;
      const start = Math.max(0, cur - 1);
      const end = Math.min(q.queue.length, start + 5);
      if (start > 0) rows.push(`<div class="q-title">ON DECK · ${q.queue.length} tracks</div>`);
      for (let i = start; i < end; i++) {
        const item = q.queue[i];
        if (!item) continue;
        rows.push(`<div class="q-row ${i === cur ? 'current' : ''}" data-bqidx="${i}">
          <span>${i === cur ? '▶' : i === cur + 1 ? '⏭' : '·'}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.title)}</span>
          <small>${esc(item.type || '')}</small>
        </div>`);
      }
      if (q.queue.length > end) rows.push(`<div class="q-title">+${q.queue.length - end} more</div>`);
      queueEl.innerHTML = rows.join('');
    };
    queueEl?.addEventListener('click', (e) => {
      const bq = e.target.closest('[data-bqidx]');
      if (bq) { ctx.dj?.booth?.playAt(+bq.dataset.bqidx); return; }   // t134: booth rows
      const row = e.target.closest('[data-qidx]');
      if (!row) return;
      tvApi()?.playAt(+row.dataset.qidx);
    });
    setInterval(() => {
      const tv = tvApi();
      if (!tv) return;
      updateShelfPager();                 // works while browsing, playing or not
      // ── room-aware remote (t134): jukebox in the store, the booth rig in
      //    the dance hall, the screen in the theater. The dance hall used to
      //    fall through to the THEATER branch, so the movie's remote haunted
      //    the dance floor whenever the projector ran.
      const room = ctx.playerRoom?.() || 'store';
      const sys = room === 'theater' ? 'theater' : room === 'dance' ? 'booth' : 'jukebox';
      remote.dataset.room = room;
      const roomTag = $('#remote-room');
      if (roomTag) roomTag.textContent = sys === 'theater' ? '🎬 THEATER' : sys === 'booth' ? '🎧 BOOTH' : '🎵 JUKEBOX';
      // t130: the Guide button is THEATER-only; repeat belongs to the decks.
      // (Runs before the show/hide early-return so the bar never shows a
      // button that belongs to the other room.)
      const gBtn = $('#tv-guide');
      if (gBtn) gBtn.style.display = sys === 'theater' ? '' : 'none';
      if (repeatBtn) {
        if (sys === 'theater' || (sys === 'booth' && boothMode() === 'pro')) repeatBtn.style.display = 'none';
        else {
          repeatBtn.style.display = '';
          const r = (sys === 'booth' ? ctx.dj?.booth : ctx.dj?.jukebox)?.repeat || 'off';
          repeatBtn.textContent = REPEAT_UI[r];
          repeatBtn.title = REPEAT_NAME[r];
        }
      }
      let st, show;
      if (sys === 'theater') {
        st = tv.stats();
        show = st.playing && st.kind !== 'card';
      } else if (sys === 'booth' && boothMode() === 'pro') {
        const decks = proDecks();
        const live = decks.find(dk => dk.el && !dk.el.paused) || decks.find(dk => dk.el && dk.item) || {};
        const el = live.el;
        st = {
          playing: proPlaying(),
          paused: !proPlaying(),
          time: el && isFinite(el.currentTime) ? el.currentTime : 0,
          duration: el && isFinite(el.duration) ? el.duration : 0,
          volume: ctx.boothPro?.()?.masterValue?.() ?? 0.8,
          title: live.item?.title || null
        };
        show = !!st.playing;
      } else if (sys === 'booth') {
        st = ctx.boothStats?.() || {};
        show = !!st.playing;
      } else {
        st = ctx.jukeboxStats?.() || {};
        show = !!st.playing;
      }
      remote.classList.toggle('hidden', !show);
      if (!show) { queueEl?.classList.add('hidden'); return; }
      $('#tv-play').textContent = st.paused ? '▶' : '⏸';
      $('#tv-time').textContent = st.duration
        ? `${fmt(st.time)} / ${fmt(st.duration)}` : fmt(st.time);
      const vol = Math.round((st.volume ?? 0.85) * 100);
      if (document.activeElement !== $('#tv-vol')) $('#tv-vol').value = vol;
      if (sys === 'theater') {
        const fsB = $('#btn-tv-full'); if (fsB) fsB.style.display = '';
        const fsOn = !!tv.fullscreenActive?.();
        if (fsB) { fsB.textContent = fsOn ? '🗗' : '⛶'; fsB.classList.toggle('active', fsOn); }
        renderQueue(tv, st);
      } else {
        queueEl?.classList.add('hidden');
        const fsB = $('#btn-tv-full'); if (fsB) fsB.style.display = 'none';
        if (sys === 'booth') renderBoothQueue();
      }
    }, 500);
  }

  return {
    updateCarry,
    openDj, toast, openSidebar, closeSidebar, openSettings, closeSettings, showItemModal, updateSidebar };
}
