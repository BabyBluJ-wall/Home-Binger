// ─────────────────────────────────────────────────────────────────────────────
//  state.js — the single source of truth for the running app
// ─────────────────────────────────────────────────────────────────────────────
//  Holds what /api/bootstrap gave us plus the current library, and fans out
//  changes to whoever subscribed (3D scene, settings UI, …).
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js?v=1789061225548';

export const state = {
  boot: null,       // /api/bootstrap payload (me, prefs, locks, defaults, tv…)
  items: [],        // normalised library items
  me: () => state.boot?.me,

  get prefs() { return state.boot?.prefs; },

  isAdmin: () => !!state.boot?.me?.isAdmin,

  // Preference mutation, applied locally + persisted to THIS user's profile.
  async updatePrefs(patch) {
    const boot = state.boot;
    if (patch.theme && !boot.locks.theme) Object.assign(boot.prefs.theme, patch.theme);
    if (patch.sorting && !boot.locks.sorting) Object.assign(boot.prefs.sorting, patch.sorting);
    if (patch.visualizer) boot.prefs.visualizer = { ...(boot.prefs.visualizer || {}), ...patch.visualizer };
    if (patch.shelves) {
      const merged = { ...(boot.prefs.shelves || {}), ...patch.shelves };
      for (const k of Object.keys(merged)) if (merged[k] === '') delete merged[k];
      boot.prefs.shelves = merged;
    }
    if (patch.tv) boot.prefs.tv = { ...(boot.prefs.tv || { idleMode: '', itemId: '' }), ...patch.tv };
    if (patch.dance) boot.prefs.dance = { ...(boot.prefs.dance || {}), ...patch.dance };   // t86: dance-floor lights
    if (patch.sources !== undefined) boot.prefs.sources = patch.sources;
    try {
      const saved = await api.savePrefs({
        theme: patch.theme ? boot.prefs.theme : undefined,
        sorting: patch.sorting ? boot.prefs.sorting : undefined,
        visualizer: patch.visualizer ? boot.prefs.visualizer : undefined,
        shelves: patch.shelves ? boot.prefs.shelves : undefined,
        tv: patch.tv ? boot.prefs.tv : undefined,
        dance: patch.dance ? boot.prefs.dance : undefined,
        sources: patch.sources !== undefined ? patch.sources : undefined
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
