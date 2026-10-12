// ─────────────────────────────────────────────────────────────────────────────
//  server/lib/party.js — WATCH PARTY (t186): the theater's "watch with me"
//
//  Why: Discord screenshare can't run inside the app (owner-confirmed), so
//  the store gets its OWN answer — the W1 design from
//  docs/RESEARCH-WATCHPARTY.md, scaled to the zero-dependency server:
//
//    · ONE session per server (the theater is one room), in-memory.
//    · HOST-SINGLE-WRITER: only the host's client may move the playhead
//      anchor. Guests are read + follow (SpeedToSync / SkipToSync on their
//      side, against the shared clock).
//    · Shared clock: GET /api/party/time returns server epoch ms; clients
//      keep the MINIMUM-RTT sample of 8 probes as their offset (SyncPlay's
//      documented min-delay selection — jitter only ever ADDS delay).
//    · Everyone-pauses-on-buffering: a stalled guest reports it; with
//      ≤ 4 guests the group pauses until every stall clears (then resumes
//      on its own). Beyond 4 guests the stalled viewer catches up silently.
//      t200 gate: a guest who stalls REPEATEDLY (4+ inside 5 minutes) stops
//      holding the room hostage — the party plays on and their screen
//      re-syncs when the connection recovers (they ride "solo", and the
//      state says so, so their marquee can be honest about it).
//    · Transport: Server-Sent Events (browser-native EventSource, plain
//      chunked HTTP on our side, auto-reconnect for free) — no WebSockets,
//      no new deps, per the standing doctrine.
//    · NO CHAT in v1 (owner decision, locked 2026-09-12).
//
//  Party content is the host's own library: the item plays through the same
//  /api/play/<source>/<key> stream every visitor already uses — each guest
//  authenticates as themselves, so per-user library locks keep applying.
// ─────────────────────────────────────────────────────────────────────────────

let P = null;                       // the live session (one theater)
const subs = new Map();             // res → { userId, name }   (SSE listeners)
let hb = null;                      // heartbeat timer (SSE keep-alive)

function publicItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: String(item.id || (String(item.source || '') + ':' + String(item.key || ''))).slice(0, 120),   // tv.playItem's own guard requires it
    source: String(item.source || '').slice(0, 40),
    key: String(item.key || '').slice(0, 200),
    title: String(item.title || '').slice(0, 200),
    type: String(item.type || '').slice(0, 40)
  };
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of subs.keys()) {
    try { res.write(payload); } catch { subs.delete(res); }
  }
}

// t200: the stall gate. Stalls are counted per guest in a rolling window;
// past STALL_GATE_MAX the guest rides solo (their stalls no longer pause
// the group — one struggling phone must not freeze the whole room all night).
const STALL_GATE_MAX = 3;
const STALL_GATE_WIN = 5 * 60 * 1000;
function stallCount(id) {
  const g = P?.guests.get(id);
  if (!g) return 0;
  const now = Date.now();
  g.stalls = (g.stalls || []).filter(t => now - t < STALL_GATE_WIN);
  return g.stalls.length;
}
function soloNames() {
  if (!P) return [];
  return [...P.guests.entries()].filter(([id]) => stallCount(id) > STALL_GATE_MAX).map(([, g]) => g.name);
}

function view() {
  if (!P) return { live: false };
  return {
    live: true,
    host: P.hostName,
    item: P.item,
    playing: P.playing,
    pos: +P.pos.toFixed(3),
    at: P.at,                       // server epoch ms when `pos` was true
    stallPaused: P.stallPaused,
    guests: [...P.guests.values()].map(g => g.name),
    stalled: P.stalled.size,
    solo: soloNames(),              // t200: gated guests (the room plays on without pausing for them)
    startedAt: P.startedAt
  };
}

// ── the session ──────────────────────────────────────────────────────────────
export function createParty(user, item) {
  if (P) return { ok: false, error: 'A watch party is already live — join it instead.' };
  if (!user) return { ok: false, error: 'Sign in to host.' };
  const it = publicItem(item);
  if (!it || !it.source || !it.key) return { ok: false, error: 'Play something on the theater TV first.' };
  P = {
    hostId: user.id, hostName: user.username,
    item: it, playing: false, pos: 0, at: Date.now(),
    stallPaused: false,
    guests: new Map(), stalled: new Set(),
    startedAt: Date.now()
  };
  broadcast('party', view());
  return { ok: true, party: view() };
}

export function endParty(user) {
  if (!P) return { ok: false, error: 'No watch party is live.' };
  // the host ends their night; an ADMIN is the safety valve (a crashed host
  // must never leave a ghost party blocking the theater)
  if (user && P.hostId !== user.id && !user.isAdmin) return { ok: false, error: 'Only the host can end the party.' };
  const ended = view();
  P = null;
  broadcast('party', { live: false });
  return { ok: true, ended };
}

export function partyState() { return view(); }

export function hostUpdate(user, patch) {
  if (!P) return { ok: false, error: 'No watch party is live.' };
  if (!user || user.id !== P.hostId) return { ok: false, error: 'Only the host controls the party.' };
  if (patch) {
    // The host's word beats the auto-pause — but ONLY a real "play" overrides
    // it: the heartbeat keeps publishing playing:false while the host's own
    // screen is paused for the group, and that must NOT clear the wait.
    if (P.stallPaused && patch.playing === true) { P.stallPaused = false; P.stalled.clear(); }
    if (typeof patch.playing === 'boolean') P.playing = patch.playing;
    if (Number.isFinite(+patch.pos)) P.pos = Math.max(0, Math.min(86300, +patch.pos));
    const it = publicItem(patch.item);
    if (it && it.source && it.key && (it.key !== P.item.key || it.source !== P.item.source)) {
      P.item = it;                  // host queued the next title
      P.pos = 0; P.playing = false;
      broadcast('item', P.item);
    }
    P.at = Date.now();
  }
  broadcast('state', view());
  return { ok: true, party: view() };
}

export function joinParty(user) {
  if (!P) return { ok: false, error: 'No watch party is live.' };
  if (!user) return { ok: false, error: 'Sign in to join.' };
  if (user.id !== P.hostId) {
    if (!P.guests.has(user.id)) {
      P.guests.set(user.id, { name: user.username, joinedAt: Date.now(), stalls: [] });
      broadcast('guests', { guests: view().guests });
    }
  }
  return { ok: true, party: view() };
}

export function leaveParty(user) {
  if (!P || !user) return { ok: true };
  if (user.id === P.hostId) return endParty(user);      // the host leaving ends the night
  P.guests.delete(user.id);
  P.stalled.delete(user.id);
  if (P.stallPaused && P.stalled.size === 0) {          // last stall cleared on the way out
    P.stallPaused = false; P.playing = true; P.at = Date.now();
  }
  broadcast('guests', { guests: view().guests });
  return { ok: true };
}

// A guest's player stalled (on=true) or recovered (on=false). With a small
// group the whole party pauses — nobody watches the good part alone.
export function reportStall(user, on) {
  if (!P || !user) return { ok: false, error: 'No watch party is live.' };
  if (user.id !== P.hostId && !P.guests.has(user.id)) return { ok: false, error: 'Join the party first.' };
  if (on === true) {
    // t200: count the stall — past the gate the guest rides solo (see above)
    const g = P.guests.get(user.id);
    if (g) {
      const now = Date.now();
      g.stalls = (g.stalls || []).filter(t => now - t < STALL_GATE_WIN);
      g.stalls.push(now);
    }
    const solo = stallCount(user.id) > STALL_GATE_MAX;
    P.stalled.add(user.id);
    if (!P.stallPaused && !solo && (P.guests.size + 1) <= 4) {
      P.stallPaused = true;
      P.stallPrevPlaying = P.playing;          // remember, so clearing resumes to reality
      P.playing = false;                       // anchor FREEZES where it was
      broadcast('state', view());
    } else if (solo) {
      broadcast('state', view());              // the solo list rides the state to the guest
    }
  } else {
    P.stalled.delete(user.id);
    if (P.stallPaused && P.stalled.size === 0) {
      P.stallPaused = false;
      P.playing = P.stallPrevPlaying !== false;   // everyone's buffer is full again
      broadcast('state', view());
    }
  }
  return { ok: true, party: view() };
}

// ── SSE ──────────────────────────────────────────────────────────────────────
// One EventSource per party client. Auth rides ?vb_auth=<token> (EventSource
// cannot set headers; the query param is the same fallback /api/play uses).
export function subscribeParty(req, res, user) {
  if (!user) return false;                  // caller answers 401 itself
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    ...corsHeadersFor(req)
  });
  res.write(`retry: 2000\n\n`);                    // browser reconnects fast
  res.write(`event: party\ndata: ${JSON.stringify(view())}\n\n`);
  subs.set(res, { userId: user.id });
  req.on('close', () => { subs.delete(res); });
  if (!hb) hb = setInterval(() => {              // keep-alive comment every 15 s
    for (const r of subs.keys()) { try { r.write(': hb\n\n'); } catch { subs.delete(r); } }
  }, 15000);
  hb.unref?.();
  return true;
}

function corsHeadersFor(req) {
  const origin = req.headers.origin;
  return origin ? { 'Access-Control-Allow-Origin': origin } : {};
}

// The shared clock — plain server epoch ms (no auth: it's a clock).
export function partyTime() { return { t: Date.now() }; }
