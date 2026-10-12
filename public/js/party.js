// ─────────────────────────────────────────────────────────────────────────────
//  party.js — WATCH PARTY client (t186): "watch with me", the store's way.
//
//  Discord screenshare can't run inside the app (owner-confirmed), so the
//  theater gets its own synced night: the host plays a title on the big
//  screen and clicks Watch together; everyone else in the theater sees the
//  🎬 marquee, joins, and their TV follows the host's — SpeedToSync /
//  SkipToSync against the shared clock (the SyncPlay technique, from
//  docs/RESEARCH-WATCHPARTY.md):
//
//    expected = pos + (serverNow − at)          [host's last anchor]
//    drift    = expected − myTime
//    |drift| ≤ 0.1 s   → leave it alone (deadzone)
//    |drift| ≤ 1.5 s   → playbackRate 1.05× / 0.95× (imperceptible catch-up)
//    otherwise         → hard seek (buffering, a real seek happened)
//
//  Stalls: a buffering guest reports it; the group pauses (≤ 4 guests) until
//  the buffer refills. The host is the single writer of the schedule; guests
//  only ever read + follow. tv.js stays byte-identical — everything here
//  drives the EXISTING public surface (scene.playItem / tv.mediaEl()).
// ─────────────────────────────────────────────────────────────────────────────
import { api } from './api.js?v=1791834263993';

const DEADZONE = 0.10;        // s — inside this, do nothing
const NUDGE_LIMIT = 1.5;      // s — beyond this, hard seek
const PUBLISH_MS = 1000;      // host anchor cadence
const FOLLOW_MS = 1000;       // guest correction cadence

let role = 'none';            // 'none' | 'host' | 'guest'
let clockOffset = null;       // serverNow ≈ performance.now() + clockOffset
let st = null;                // last party state from the server
let es = null;                // EventSource (SSE)
let timer = null;             // host/follow loop
let lastItemKey = '';         // guest: the item my TV is on
let stallOn = false;          // guest: my buffer is empty (reported)
let hostPausedForStall = false;   // host: I paused MY screen for a buffering guest
let onUi = null;              // ui.js callback (state → marquee paint)

const scene = () => window.__VB?.scene;
const serverNow = () => (clockOffset === null ? Date.now() : performance.now() + clockOffset);
const tv = () => scene()?.tv;

export const party = {
  get role() { return role; },
  get state() { return st; },
  onUi(fn) { onUi = fn; },
  info() { return { role, live: !!st?.live, host: st?.host || '', title: st?.item?.title || '',
    guests: st?.guests?.length || 0, stalled: st?.stalled || 0, playing: !!st?.playing, stallPaused: !!st?.stallPaused,
    offset: clockOffset === null ? null : Math.round(clockOffset) } },

  // ── the shared clock: 8 probes, keep the MINIMUM-RTT one (jitter only
  //    ever adds delay, so the fastest sample is the most accurate) ──
  async syncClock() {
    let best = null;
    for (let i = 0; i < 8; i++) {
      try {
        const t0 = performance.now();
        const r = await fetch('/api/party/time', { cache: 'no-store' });
        const j = await r.json();
        const t1 = performance.now();
        const sample = { rtt: t1 - t0, offset: j.t - (t0 + t1) / 2 };
        if (!best || sample.rtt < best.rtt) best = sample;
      } catch {}
      await new Promise(r => setTimeout(r, 40));
    }
    if (best) clockOffset = best.offset;
    return clockOffset;
  },

  // ── HOST: start the night with whatever is on the theater TV ──
  async host() {
    const playing = tv()?.state?.playing;
    if (!playing?.item) throw new Error('Play something on the theater TV first — then invite the store.');
    await this.syncClock();
    const r = await api.partyCreate(playing.item);
    if (!r.ok) throw new Error(r.error || 'Could not start the watch party');
    role = 'host';
    await this.listen();
    this.startPublish();
    onUi?.();
    return r.party;
  },

  // ── GUEST: join whatever is live ──
  async join() {
    await this.syncClock();
    const r = await api.partyJoin();
    if (!r.ok) throw new Error(r.error || 'Could not join');
    role = 'guest';
    await this.listen();
    this.startFollow();
    onUi?.();
    return r.party;
  },

  // leave as guest / end as host (idempotent — safe on room exit + unload)
  async leave() {
    const wasRole = role;
    this.stopLoop();
    try { es?.close(); } catch {}
    es = null; st = null; role = 'none';   // the SSE stream is closed — no stale "live" state may linger
    lastItemKey = ''; setStall(false);
    try { await (wasRole === 'host' ? api.partyEnd() : api.partyLeave()); } catch {}
    onUi?.();
  },

  // ── SSE: the server pushes party state the moment it changes ──
  async listen() {
    try { es?.close(); } catch {}
    const token = (() => { try { return localStorage.getItem('vb_sess'); } catch { return null; } })();
    es = new EventSource('/api/party/events' + (token ? '?vb_auth=' + encodeURIComponent(token) : ''));
    es.addEventListener('party', (e) => {
      try { st = JSON.parse(e.data); } catch { return; }
      if (!st.live && role !== 'none') {          // the host ended it
        this.stopLoop(); role = 'none'; lastItemKey = '';
        try { es.close(); } catch {} es = null;
      }
      onUi?.();
    });
    es.addEventListener('state', (e) => {
      try { st = JSON.parse(e.data); } catch { return; }
      onUi?.();
    });
    es.addEventListener('item', (e) => {
      try { st = st || {}; st.item = JSON.parse(e.data); } catch {}
      if (role === 'guest') playPartyItem();      // host queued the next title
      onUi?.();
    });
    es.addEventListener('guests', (e) => {
      try { st = st || {}; st.guests = (JSON.parse(e.data)).guests || []; } catch {}
      onUi?.();
    });
    es.onerror = () => {};                        // EventSource auto-reconnects
  },

  // ── HOST: publish the schedule anchor every second ──
  startPublish() {
    this.stopLoop();
    timer = setInterval(async () => {
      const t = tv(); if (!t || role !== 'host') return;
      const el = t.mediaEl?.();
      const item = t.state?.playing?.item;
      if (!el || typeof el.currentTime !== 'number' || !item) return;
      // a guest is buffering — the group waits, so MY screen waits too. The
      // hostPausedForStall flag is what lets MY screen resume when the group
      // does — WITHOUT ever fighting a pause I chose myself (a manual pause
      // never sets the flag, so the mirror leaves it alone).
      if (st?.stallPaused && !el.paused) { try { el.pause(); } catch {} hostPausedForStall = true; }
      else if (hostPausedForStall) {
        if (!el.paused) hostPausedForStall = false;                 // I played it myself
        else if (st && !st.stallPaused && st.playing === true) {     // the group resumed
          hostPausedForStall = false;
          try { el.play?.().catch?.(() => {}); } catch {}
        }
      }
      try {
        await api.partyHost({ playing: !el.paused, pos: el.currentTime, item });
      } catch {}
    }, PUBLISH_MS);
  },

  // ── GUEST: follow the anchor — the SyncPlay drift scheme ──
  startFollow() {
    this.stopLoop();
    playPartyItem();
    timer = setInterval(() => {
      if (role !== 'guest' || !st?.live || !st.item) return;
      const el = tv()?.mediaEl?.();
      if (!el || typeof el.currentTime !== 'number') return;
      // the right thing is on my screen — correct drift
      if (lastItemKey === (st.item.source + ':' + st.item.key)) {
        const expected = st.pos + (st.playing ? (serverNow() - st.at) / 1000 : 0);
        const drift = expected - el.currentTime;
        // pause-state first (stall-pauses arrive as playing:false)
        if (!st.playing && !el.paused) { try { el.pause(); } catch {} }
        else if (st.playing && el.paused) { try { el.play?.().catch?.(() => {}); } catch {} }
        else if (Math.abs(drift) > NUDGE_LIMIT) {
          try { el.currentTime = Math.max(0, expected); } catch {}
          if ('playbackRate' in el) el.playbackRate = 1;
        } else if (Math.abs(drift) > DEADZONE) {
          if ('playbackRate' in el) el.playbackRate = drift > 0 ? 1.05 : 0.95;   // I'm behind → hurry
        } else if ('playbackRate' in el && el.playbackRate !== 1) el.playbackRate = 1;
        // stall reporting (real media elements only — the YouTube shim has no events)
        watchStall(el);
      } else {
        playPartyItem();                          // I'm on the wrong thing
      }
    }, FOLLOW_MS);
  },

  stopLoop() { if (timer) { clearInterval(timer); timer = null; } },

  // poll the marquee read (theATER browsers that haven't joined yet)
  async poll() {
    try { st = await api.partyState(); } catch {}
    onUi?.();
    return st;
  }
};

// put the party's item on MY theater TV (the stream plays with MY access)
function playPartyItem() {
  if (!st?.item?.source || role !== 'guest') return;
  lastItemKey = st.item.source + ':' + st.item.key;
  try { scene()?.playItem?.({ ...st.item, id: st.item.id || lastItemKey }); } catch {}   // playItem's guard needs an id
}

// ── stall reporting: waiting → the group pauses; playing → it resumes ──
const stallWatched = new WeakSet();
function watchStall(el) {
  if (!el || !el.addEventListener || stallWatched.has(el) || typeof el.currentTime !== 'number') return;
  stallWatched.add(el);
  el.addEventListener('waiting', () => setStall(true));
  el.addEventListener('playing', () => setStall(false));
  el.addEventListener('canplay', () => setStall(false));
}
function setStall(on) {
  if (stallOn === on || role !== 'guest') return;
  stallOn = on;
  api.partyStall(on).catch(() => {});
}
