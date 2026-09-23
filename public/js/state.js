// ─────────────────────────────────────────────────────────────────────────────
//  state.js — the single source of truth for the running app
// ─────────────────────────────────────────────────────────────────────────────
//  Holds what /api/bootstrap gave us plus the current library, and fans out
//  changes to whoever subscribed (3D scene, settings UI, …).
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js?v=1790065991054';

export const state = {
  boot: null,       // /api/bootstrap payload (me, prefs, locks, defaults, tv…)
  items: [],        // normalised library items
  me: () => state.boot?.me,

  get prefs() { return state.boot?.prefs; },

  isAdmin: () => !!state.boot?.me?.isAdmin,

  // Preference mutation, applied locally + persisted to THIS user's profile.
  async updatePrefs(patch) {
    const boot = state.boot;
    let shelvesOut = null;   // t134: the wire copy of the shelf map (tombstones kept)
    if (patch.theme && !boot.locks.theme) Object.assign(boot.prefs.theme, patch.theme);
    if (patch.sorting && !boot.locks.sorting) Object.assign(boot.prefs.sorting, patch.sorting);
    if (patch.visualizer) boot.prefs.visualizer = { ...(boot.prefs.visualizer || {}), ...patch.visualizer };
    if (patch.shelves) {
      // t134 FIX: un-pinning a shelf (back to Automatic) must STICK. The old
      // code stripped '' HERE, so the server's {...saved, ...patch} merge
      // re-inherited the abandoned pin and it resurrected on next load —
      // "My Shelves is buggy when selecting individual categories". The ''
      // tombstones now ride along in the SAVE so the server-side merge lets
      // them override the old pin before sanitize drops them.
      const prev = boot.prefs.shelves || {};
      const merged = { ...prev, ...patch.shelves };
      shelvesOut = { ...patch.shelves };           // tombstones intact for the wire
      for (const k of Object.keys(merged)) if (merged[k] === '') delete merged[k];
      boot.prefs.shelves = merged;                 // local copy stays clean
    }
    if (patch.tv) boot.prefs.tv = { ...(boot.prefs.tv || { idleMode: '', itemId: '' }), ...patch.tv };
    if (patch.dance) boot.prefs.dance = { ...(boot.prefs.dance || {}), ...patch.dance };   // t86: dance-floor lights
    if (patch.sources !== undefined) boot.prefs.sources = patch.sources;
    if (Array.isArray(patch.guideFavs)) boot.prefs.guideFavs = patch.guideFavs;   // t128: favorite channels
    try {
      const saved = await api.savePrefs({
        theme: patch.theme ? boot.prefs.theme : undefined,
        sorting: patch.sorting ? boot.prefs.sorting : undefined,
        visualizer: patch.visualizer ? boot.prefs.visualizer : undefined,
        shelves: patch.shelves ? (shelvesOut ?? boot.prefs.shelves) : undefined,
        tv: patch.tv ? boot.prefs.tv : undefined,
        dance: patch.dance ? boot.prefs.dance : undefined,
        sources: patch.sources !== undefined ? patch.sources : undefined,
        guideFavs: Array.isArray(patch.guideFavs) ? patch.guideFavs : undefined   // t128
      });
      if (saved?.prefs) boot.mySavedPrefs = saved.prefs;
    } catch (e) {
      console.warn('prefs save failed (non-fatal):', e.message);
    }
    state.emit('prefs', patch);
  },

  // Re-fetch bootstrap (after login/logout/admin changes).
  async refresh() {
    state.boot = await api.bootstrap();
    state.emit('boot');
    return state.boot;
  },

  // ── mini event bus ──
  _subs: {},
  on(event, fn) { (state._subs[event] ??= []).push(fn); return () => state.off(event, fn); },
  off(event, fn) { state._subs[event] = (state._subs[event] || []).filter(f => f !== fn); },
  emit(event, data) { for (const fn of state._subs[event] || []) try { fn(data); } catch (e) { console.error(e); } }
};
