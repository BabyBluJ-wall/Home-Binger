// ─────────────────────────────────────────────────────────────────────────────
//  wwremote.js — REMOTE WATCH ROOMS (t195): share Home Binger itself, live.
//
//  The owner's design: anyone can watch with you WITHOUT installing Home
//  Binger — they open a LINK in any browser. So the room is a live SCREEN
//  SHARE of the whole app (the store, the theater, whatever you're doing),
//  not a YouTube re-sync: the host captures their own window (video + system
//  audio, desktop app only) and streams it peer-to-peer to every guest —
//  WebRTC, the real-time lane: sub-second delay, adaptive bitrate, no
//  buffering ladder, no server of ours anywhere in the path.
//
//    · Signaling: PeerJS's free public broker (0.peerjs.com) — it only ever
//      sees SDP/ICE offers; after the handshake it is out of the movie.
//      Vendored at /vendor/peerjs.min.js (MIT) AND at /watch/peerjs.min.js
//      so the guest page is self-contained wherever it's hosted.
//    · The host's peer id IS the room: hbr-<code>. 6-char code from an
//      unambiguous alphabet (32^6 ≈ 1e9).
//    · Guests: the watch page (public/watch/ — served by every HB server at
//      /watch/ and published to GitHub Pages for the everyone-link). They
//      pick a display name (w2g-style), the host sees the roster.
//    · Media: one PeerJS call per guest carrying the captured stream; the
//      data channel beside it carries names, roster, pings, and the end.
//    · hb://<code> deep links: the app opens the room in the default
//      browser (the page is served by the friend's own HB at /watch/).
//    · Quality: High 1080p60 · Balanced 900p60 (default) · Saver 720p30 —
//      each tier capped (4.5 / 3 / 1.2 Mb/s) so it can't overdrive a thin
//      uplink; a re-capture re-calls every guest with the fresh stream.
//    · Honest limits (shown in the panel): each viewer costs the host
//      ~3–5 Mbps of UPLOAD (1–4 viewers is the sweet spot, hard cap 6),
//      and a MINIMIZED Home Binger stops rendering — keep it visible.
// ─────────────────────────────────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no I,L,O,0,1
const CODE_LEN = 6;
const PEER_PREFIX = 'hbr-';   // peer ids are case-sensitive — codes normalize to upper
const MAX_VIEWERS = 6;

// t201: ICE — "share with anyone," not "share with people on your VPN." STUN
// first (direct P2P when the NATs allow it), then Open Relay's free public
// TURN as the relay fallback for the NATs STUN can't cross (symmetric NAT,
// carrier-grade cellular). Free, public, no account — if it ever goes away
// the app degrades to STUN-only, never worse than before.
const ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
    username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject', credential: 'openrelayproject' },
];

const QUALITY = {
  high:     { w: 1920, h: 1080, fps: 60, cap: 4500000, label: 'High — 1080p60' },
  balanced: { w: 1600, h: 900,  fps: 60, cap: 3000000, label: 'Balanced — 900p60' },
  saver:    { w: 1280, h: 720,  fps: 30, cap: 1200000, label: 'Saver — 720p30' },
};

let role = 'none';            // 'none' | 'host'   (guests live in /watch/, not the app)
let code = '';                // the room code (display form: HB-XXXXXX)
let peer = null;              // my PeerJS peer
let stream = null;            // the captured screen+audio stream
let quality = 'balanced';
let guests = new Map();       // peerId → { conn, name, call }
let hostName = '';            // display name of the host
let startedAt = 0;
let onUi = null;              // ui.js callback (state → paint)
let captureTick = null;       // tests: keeps a canvas stream animating

// normalize anything a user might paste (full hb:// link, bare code, lowercase…)
export function parseRemoteCode(input) {
  const m = String(input || '').trim().toUpperCase().match(/([A-HJ-NP-Z2-9]{6})\s*$/);
  return m ? 'HB-' + m[1] : '';
}

function genCode() {
  let c = '';
  const rnd = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  for (let i = 0; i < CODE_LEN; i++) c += CODE_ALPHABET[rnd[i] % CODE_ALPHABET.length];
  return 'HB-' + c;
}

const dbg = (...a) => { if (window.__HBWWR_DEBUG) console.log('[WWR]', Date.now() % 100000, ...a); };

// load the vendored PeerJS bundle once (classic script → window.Peer)
let peerLib = null;
function loadPeerLib() {
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    if (window.Peer) return resolve(window.Peer);
    const s = document.createElement('script');
    s.src = '/vendor/peerjs.min.js';
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS failed to load')));
    s.onerror = () => reject(new Error('PeerJS failed to load'));
    document.head.appendChild(s);
  });
  return peerLib;
}

const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Guest';

// ── t200: bitrate CEILINGS — the "everyone buffers" fix ──
// An uncapped screen-capture encoder fights the network: it sends what the
// tier asks for and lets packets queue. Every call now carries a maxBitrate
// for its tier, so WebRTC adapts DOWN from a sane cap instead of overdriving
// a thin uplink (degradationPreference 'balanced' drops resolution before
// framerate). capReadback is what the sender last CONFIRMED (tests + panel).
let capReadback = 0;
function capCall(mc) {
  if (!mc) return;
  for (const delay of [0, 500, 1500]) setTimeout(async () => {
    try {
      if (role !== 'host' || !stream) return;
      const pc = mc.peerConnection;
      if (!pc || !pc.getSenders) return;
      const sp = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (!sp) return;
      const want = QUALITY[quality].cap;
      const p = sp.getParameters();
      if (!p.encodings || !p.encodings.length) p.encodings = [{}];
      p.encodings[0].maxBitrate = want;
      try { p.degradationPreference = 'balanced'; } catch {}
      await sp.setParameters(p);
      if (sp.getParameters().encodings?.[0]?.maxBitrate === want) capReadback = want;
    } catch {}
  }, delay);
}
function dialGuest(id) { const mc = peer.call(id, stream); capCall(mc); return mc; }

// ── the capture: Home Binger's own window + system audio (desktop app) ──
async function captureScreen() {
  const q = QUALITY[quality] || QUALITY.balanced;
  if (captureTick) { captureTick(q); return window.__HBWWR_STREAM; }   // test seam
  if (!window.hbBridge?.desktopSources) throw new Error('Screen sharing needs the desktop app');
  const sources = await window.hbBridge.desktopSources();
  const win = sources.find(s => s.id.startsWith('window:') && /home\s*binger/i.test(s.name))
    || sources.find(s => s.id.startsWith('window:'));
  if (!win) throw new Error('Could not find the Home Binger window to share');
  const video = { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: win.id,
    maxWidth: q.w, maxHeight: q.h, maxFrameRate: q.fps } };
  try {
    // audio: the system loopback (what YOU hear — the movie included). Windows-only;
    // elsewhere it throws and we fall back to video-only.
    return await navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'desktop' } }, video });
  } catch {
    return await navigator.mediaDevices.getUserMedia({ video });
  }
}

function stopStream() {
  try { stream?.getTracks().forEach(t => t.stop()); } catch {}
  stream = null;
  try { if (captureTick) window.__HBWWR_STREAM = null; } catch {}
}

function rosterNames() {
  const now = Date.now();
  const alive = [...guests.values()].filter(g => !g.deadAt || now - g.deadAt < 5000);
  return [...new Set(alive.map(g => g.name))];   // a re-dialing guest shows once
}

function sendRoster() {
  const names = rosterNames();
  for (const g of guests.values()) { try { g.conn?.send({ t: 'roster', names, count: names.length + 1 }); } catch {} }
  onUi?.();
}

// probation sweeper: a guest dead > 5 s is really gone (closes its stream too)
setInterval(() => {
  if (role !== 'host') return;
  let changed = false;
  for (const [id, g] of [...guests]) {
    if (g.deadAt && Date.now() - g.deadAt > 5000) {
      try { g.call?.close(); } catch {}
      guests.delete(id);
      changed = true;
    }
  }
  if (changed) sendRoster();
}, 2500);

export const remote = {
  get role() { return role; },
  get code() { return code; },
  get quality() { return quality; },
  onUi(fn) { onUi = fn; },
  info() {
    return { role, code, live: role === 'host', host: role === 'host' ? hostName : '',
      quality, qualityLabel: (QUALITY[quality] || QUALITY.balanced).label,
      viewers: rosterNames(), viewerCount: rosterNames().length, max: MAX_VIEWERS,
      cap: QUALITY[quality].cap, capOk: capReadback === QUALITY[quality].cap,
      startedAt, audio: !!(stream && stream.getAudioTracks().length) };
  },

  // ── HOST: share this Home Binger, live ──
  async host(name, qualityPref) {
    if (role !== 'none') throw new Error('You are already sharing — stop it first');
    if (qualityPref && QUALITY[qualityPref]) quality = qualityPref;
    hostName = cleanName(name);
    stream = await captureScreen();
    if (!stream || !stream.getVideoTracks().length) throw new Error('Nothing to share — the capture came back empty');
    try { stream.getVideoTracks()[0].contentHint = 'motion'; } catch {}
    const Peer = await loadPeerLib();
    // claim a room code (a collision means someone else's live room has it)
    for (let attempt = 0; attempt < 4 && !peer; attempt++) {
      const c = genCode();
      const ok = await new Promise((resolve) => {
        const p = new Peer(PEER_PREFIX + c.slice(3), { debug: 0, config: { iceServers: ICE_SERVERS } });
        const done = (v) => { try { if (!v) p.destroy(); } catch {} resolve(v); };
        const to = setTimeout(() => done(null), 12000);
        p.on('open', () => { clearTimeout(to); done(p); });
        p.on('error', () => { clearTimeout(to); done(null); });
      });
      if (!ok) continue;
      peer = ok; code = c;
    }
    if (!peer) { stopStream(); throw new Error('Could not create a room — try again'); }
    role = 'host'; startedAt = Date.now();
    wireHostPeer(peer);
    onUi?.();
    return { code, link: 'hb://' + code };
  },

  // quality change mid-share: re-capture, then re-call everyone with the fresh stream
  async setQuality(q) {
    if (role !== 'host' || !QUALITY[q] || q === quality) return false;
    quality = q;
    const fresh = await captureScreen();
    if (!fresh || !fresh.getVideoTracks().length) return false;
    try { fresh.getVideoTracks()[0].contentHint = 'motion'; } catch {}
    stopStream();
    stream = fresh;
    for (const [id, g] of [...guests]) {
      try { g.call?.close(); } catch {}
      try { g.call = dialGuest(id); } catch {}
    }
    onUi?.();
    return true;
  },

  // ── stop sharing / leave ──
  leave() {
    if (role === 'host') for (const g of guests.values()) { try { g.conn?.send({ t: 'ended', host: hostName }); } catch {} }
    this.reset();
    onUi?.();
  },

  reset() {
    role = 'none';                    // BEFORE closing — my own stop must not read as "the host ended it"
    try { for (const g of guests.values()) { g.call?.close?.(); } } catch {}
    try { peer?.destroy(); } catch {}
    peer = null; guests = new Map(); code = ''; hostName = ''; startedAt = 0;
    stopStream();
  },

  // tests: drive a canvas capture (no Electron needed in the suite) — the
  // interval keeps frames flowing, because a still canvas streams nothing
  _useCanvasCapture(canvas, draw) {
    captureTick = (q) => {
      canvas.width = 640; canvas.height = 360;
      const st = canvas.captureStream(0);        // manual frames — a hidden page's
      window.__HBWWR_STREAM = st;                // canvas never composites, so
      clearInterval(testDrawIv);                 // fps-mode would stream nothing
      const track = st.getVideoTracks()[0];
      testDrawIv = setInterval(() => {
        try {
          const g = canvas.getContext('2d');
          if (draw) draw(g, canvas);
          else { g.fillStyle = '#101028'; g.fillRect(0, 0, canvas.width, canvas.height); }
          try { track?.requestFrame?.(); } catch {}
        } catch {}
      }, 100);
    };
  },
  _clearTestCapture() { captureTick = null; clearInterval(testDrawIv); testDrawIv = null; try { window.__HBWWR_STREAM = null; } catch {} }
};

let testDrawIv = null;

// the host peer's wiring — shared by host() and relisten() (the broker
// socket can die silently on a busy/hidden page; the room code survives,
// and the guests' re-dial loop finds the fresh listener)
function wireHostPeer(p) {
  p.on('connection', (c) => {
    if (role !== 'host') { try { c.close(); } catch {} return; }
    if (guests.size >= MAX_VIEWERS) { try { c.send({ t: 'full', max: MAX_VIEWERS }); setTimeout(() => c.close(), 250); } catch {} return; }
    const g = { conn: c, name: 'Guest', call: null, deadAt: 0 };
    guests.set(c.peer, g);
    c.on('data', (m) => { g.deadAt = 0; hostMsg(g, m); });
    // a spurious ICE 'close' can fire while the channel still works (seen in
    // t193) — probation, not instant deletion; the sweeper prunes the rest
    c.on('close', () => { g.deadAt = Date.now(); sendRoster(); });
    c.on('error', () => { g.deadAt = Date.now(); });
    try { c.send({ t: 'welcome', host: hostName, code }); } catch {}
    sendRoster();
  });
  p.on('error', (e) => {                                 // per-socket noise never kills the room…
    if (role !== 'host') return;
    if (e && (e.type === 'network' || e.type === 'socket-error' || e.type === 'socket-closed')) relisten();
  });
  p.on('disconnected', () => {
    if (role !== 'host') return;
    try { p.reconnect(); } catch {}
    setTimeout(() => { if (role === 'host' && p === peer && peer.disconnected) relisten(); }, 8000);
  });
}

// re-claim the SAME room code with a fresh broker socket; guests re-dial in.
// A failed re-claim retries every 5 s while the host keeps sharing.
function relisten() {
  if (role !== 'host' || !code) return;
  try { peer?.destroy(); } catch {}
  peer = null;
  const p = new Peer(PEER_PREFIX + code.slice(3), { debug: 0, config: { iceServers: ICE_SERVERS } });
  const to = setTimeout(() => { try { p.destroy(); } catch {} }, 12000);
  p.on('open', () => {
    clearTimeout(to);
    if (role === 'host') { peer = p; wireHostPeer(p); dbg('re-listened', code); }
    else { try { p.destroy(); } catch {} }
  });
  p.on('error', () => {
    clearTimeout(to);
    try { p.destroy(); } catch {}
    if (role === 'host' && !peer) setTimeout(relisten, 5000);
  });
}

// ── host-side message handling ──
function hostMsg(g, m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'hi') {
    g.name = cleanName(m.name);
    try { g.conn?.send({ t: 'welcome', host: hostName, code }); } catch {}
    try { g.call?.close(); } catch {}
    try { g.call = dialGuest(g.conn.peer); } catch {}   // the movie itself
    sendRoster();
  } else if (m.t === 'ping' && typeof m.sent === 'number') {
    try { g.conn?.send({ t: 'pong', sent: m.sent, hostNow: Date.now() }); } catch {}
  }
}
