// ─────────────────────────────────────────────────────────────────────────────
//  store3d/djpro.js — the DJ BOOTH PRO RIG (dual decks) — booth laptop ONLY
// ─────────────────────────────────────────────────────────────────────────────
//  The jukebox keeps the classic deck panel (queue/EQ/fades). THIS is the new
//  pro interface for the dance-hall booth: two independent decks (A cyan,
//  B magenta), real per-deck filter-chain EQ, trim, channel faders, a
//  curveable crossfader with center detent, master + booth-monitor volume,
//  BPM detection with a beat grid, hot cues, beat loops, beat jump, sync,
//  key lock, key/Camelot estimate, searchable playlist, Beginner/Pro modes,
//  keyboard shortcuts, and session save/load. Master bus runs limiter +
//  soft-clip, feeds the dance-hall speaker ring, and is gated to the dance
//  wing (the set never leaves the hall).
// t105: SLIDER MEMORY — every slider position is mirrored here the moment
// you touch it, and written back into the (freshly rebuilt) panel on open.
// Before this, closing and reopening the pro rig reset every slider to its
// hardcoded default while the engine kept your values — lying controls.
const djpUi = { eq: [{}, {}], trim: [1, 1], fader: [1, 1], rate: [1, 1], xf: 0.5, curve: 0.5, master: 0.8, booth: 0,
  pitch: 0, pitchRange: 8, xfAssign: ['a', 'b'], color: [0.5, 0.5], colorMode: ['filter', 'filter'] };   // t108
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT } from './config.js?v=1789174562813';

const D = LAYOUT.room.l / 2;
const AUDIO_RE = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus)$/i;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ── pure helpers (exported for tests) ────────────────────────────────────────
export function foldBpm(b) { let x = b; while (x < 70) x *= 2; while (x > 180) x /= 2; return x; }
export function modeInterval(hits) {          // hits: array of beat intervals (s)
  const bins = new Map();
  for (const iv of hits) { if (!(iv > 0.25 && iv < 2.5)) continue; const k = Math.round(iv * 20) / 20; bins.set(k, (bins.get(k) || 0) + 1); }
  let best = 0, n = 0;
  for (const [k, c] of bins) if (c > n) { n = c; best = k; }
  return n >= 4 ? foldBpm(60 / best) : 0;     // stable only with 4+ agreeing
}
const CAMELOT = { 'C': '8B', 'C#': '3B', 'D': '10B', 'D#': '5B', 'E': '12B', 'F': '7B', 'F#': '2B', 'G': '9B', 'G#': '4B', 'A': '11B', 'A#': '6B', 'B': '1B' };
const CAMELOT_M = { 'C': '5A', 'C#': '12A', 'D': '7A', 'D#': '2A', 'E': '9A', 'F': '4A', 'F#': '11A', 'G': '6A', 'G#': '1A', 'A': '8A', 'A#': '3A', 'B': '10A' };
const FLAT_EQ = { 'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };   // flats → sharp-spelled
// t114: the file's OWN key tag ("8B", "F#m", "F# minor", "Gb maj"…) → Camelot.
// DAWs and DJ tools write these into every export — instant, no analysis.
export function keyTagToCamelot(raw) {
  const t = String(raw || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/\s+/g, ' ');
  const cam = t.match(/^(\d{1,2})\s*([AB])$/i);
  if (cam) return +cam[1] >= 1 && +cam[1] <= 12 ? cam[1] + cam[2].toUpperCase() : null;
  const minM = t.match(/^([A-Ga-g])([#b]?)\s*(?:m|min|minor|mol)$/i);          // "Am", "F# minor", "Bbm"
  const majM = t.match(/^([A-Ga-g])([#b]?)\s*(?:(?:maj|major|dur)\.?)?$/i);   // "F#", "C maj", "Db"
  const m = minM || majM;                                                        // a bare "m" suffix = minor (the convention)
  if (!m) return null;
  let note = m[1].toUpperCase() + (m[2] || '');
  if (m[2] === 'b') { const eq = FLAT_EQ[note]; if (!eq) return null; note = eq; }
  return (minM ? CAMELOT_M : CAMELOT)[note] || null;
}
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export function keyFromChroma(chroma) {       // chroma: 12 pitch-class energies (C…B)
  let best = null;
  for (let r = 0; r < 12; r++) {
    for (const [tmpl, mode] of [[MAJ, 'major'], [MIN, 'minor']]) {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < 12; i++) { const v = chroma[(i + r) % 12]; dot += v * tmpl[i]; na += v * v; nb += tmpl[i] * tmpl[i]; }
      const cc = dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
      if (!best || cc > best.cc) best = { cc, root: r, mode };
    }
  }
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const note = NOTES[best.root];
  return { note, mode: best.mode, camelot: best.mode === 'major' ? CAMELOT[note] : CAMELOT_M[note] };
}

// t108: 3-BAND WAVEFORM PEAKS — fetched + decoded once per track (session
// cache), split into sub/mid/high by three streaming one-pole filters, and
// bucketed into ~600 columns. Red = bass, green = mids, blue = highs.
const _peaksCache = new Map();
let meta = {};                                 // t114: item → {bpm, key} — module level so OFFLINE analysis can fill it
                                               // (mount merge-loads the saved copy; the session saver persists it)
function peaksFor(item) {
  if (!item?.source || !item.key) return null;
  return _peaksCache.get(item.id) || null;
}
// t114: OFFLINE TEMPO + KEY + GRID — the "read song info faster" engine.
// The classic MIR recipe (aubio/librosa family, ours in dependency-free JS):
// an onset-flux envelope on the low band, autocorrelated over the musical
// lag range with octave awareness, folded to 70–180 BPM; chroma from a small
// radix-2 FFT over windows spread through the track; the first strong onset
// anchors the beat grid (phase). Runs on the SAME decode the peaks use.
function analyzeOffline(ch, sampleRate) {
  const HOP = 512, n = Math.floor(ch.length / HOP), hopT = HOP / sampleRate;
  let bpm = 0, grid0 = 0, keyObj = null;
  if (n > 64) {
    const a1 = 1 - Math.exp(-2 * Math.PI * 150 / sampleRate);
    let low = 0;
    const env = new Float32Array(n);
    for (let h = 0; h < n; h++) {
      let lo = 0, all = 0;
      const st = h * HOP, en = st + HOP;
      for (let i = st; i < en; i++) { const x = ch[i]; low += a1 * (x - low); lo += Math.abs(low); all += Math.abs(x); }
      env[h] = lo / HOP + 0.3 * all / HOP;
    }
    const flux = new Float32Array(n);
    for (let h = 1; h < n; h++) flux[h] = Math.max(0, env[h] - env[h - 1]);
    const acAt = (lag) => { let s0 = 0, s1 = 0, s2 = 0; for (let i = lag; i < n; i++) { const v = flux[i]; s0 += v * flux[i - lag]; s1 += v; s2 += flux[i - lag]; } const c = n - lag; return (s0 / c) - (s1 / c) * (s2 / c); };
    const minLag = Math.max(2, Math.round(0.30 / hopT)), maxLag = Math.round(1.0 / hopT);   // 200…60 BPM
    if (n > maxLag * 2.2) {
      let bestLag = 0, bestSc = -1;
      const ac = new Float32Array(maxLag + 2);
      for (let lag = minLag - 1; lag <= maxLag + 1; lag++) ac[lag] = acAt(Math.max(1, lag));
      for (let lag = minLag; lag <= maxLag; lag++) {
        const lag2 = lag * 2 <= maxLag ? lag * 2 : Math.round(lag / 2);
        const sc = ac[lag] + 0.5 * (lag2 !== lag ? acAt(lag2) : ac[lag]);
        if (sc > bestSc) { bestSc = sc; bestLag = lag; }
      }
      if (bestLag > 0 && bestSc > 1e-7) {
        // t118: PARABOLIC PEAK REFINEMENT — a whole-hop lag quantizes tempo
        // by up to ±2.6% at some BPMs (0.5 s / 23.2 ms hops), which is way
        // past beatmatch tolerance. The classic sub-bin interpolation (the
        // same trick aubio/librosa use) fits a parabola through the peak and
        // its neighbors and lands within a fraction of a hop.
        const a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1];
        const denom = a - 2 * b + c;
        const shift = denom !== 0 ? Math.max(-1, Math.min(1, 0.5 * (a - c) / denom)) : 0;
        bpm = foldBpm(60 / ((bestLag + shift) * hopT));
      }
    }
    const sorted = Float32Array.from(flux).sort();
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    if (p95 > 0) {
      const startH = Math.round(0.15 / hopT);
      for (let h = startH; h < n; h++) if (flux[h] > p95 * 0.5) { grid0 = h * hopT; break; }
    }
  }
  try {
    const N = 4096, half = N >> 1;
    const re = new Float32Array(N), im = new Float32Array(N);
    const chroma = new Array(12).fill(0);
    const w0 = Math.floor(n * 0.25) * HOP, w1 = Math.floor(n * 0.75) * HOP;
    const stepW = Math.max(HOP, Math.floor((w1 - w0) / 9));
    let used = 0;
    for (let w = w0; w + N <= ch.length && used < 10; w += stepW) {
      for (let i = 0; i < N; i++) re[i] = ch[w + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
      im.fill(0);
      for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t2 = re[i]; re[i] = re[j]; re[j] = t2; t2 = im[i]; im[i] = im[j]; im[j] = t2; } }
      for (let len2 = 2; len2 <= N; len2 <<= 1) {
        const ang = -2 * Math.PI / len2, ur = Math.cos(ang), ui = Math.sin(ang);
        for (let i2 = 0; i2 < N; i2 += len2) {
          let pr = 1, pi = 0;
          for (let k2 = 0; k2 < len2 >> 1; k2++) {
            const ar = re[i2 + k2], ai = im[i2 + k2];
            const br = re[i2 + k2 + (len2 >> 1)] * pr - im[i2 + k2 + (len2 >> 1)] * pi;
            const bi = re[i2 + k2 + (len2 >> 1)] * pi + im[i2 + k2 + (len2 >> 1)] * pr;
            re[i2 + k2] = ar + br; im[i2 + k2] = ai + bi;
            re[i2 + k2 + (len2 >> 1)] = ar - br; im[i2 + k2 + (len2 >> 1)] = ai - bi;
            const npr = pr * ur - pi * ui; pi = pr * ui + pi * ur; pr = npr;
          }
        }
      }
      for (let k2 = 1; k2 < half; k2++) {
        const hz = k2 * sampleRate / N;
        if (hz < 65 || hz > 2100) continue;
        const pc = ((Math.round(12 * Math.log2(hz / 440)) % 12) + 12) % 12;
        chroma[(pc + 9) % 12] += Math.sqrt(re[k2] * re[k2] + im[k2] * im[k2]);
      }
      used++;
    }
    if (used >= 4) keyObj = keyFromChroma(chroma.map(v => v / used));
  } catch {}
  return { bpm, grid0, keyObj };
}

async function computePeaks(item) {
  if (!item?.source || !item.key || _peaksCache.has(item.id)) return _peaksCache.get(item.id) || null;
  try {
    const r = await fetch(`/api/play/${item.source}/${encodeURIComponent(item.key)}?audio=1`);
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    // t115: decode MONO at 22 kHz — a quarter of the decoder memory vs
    // stereo 44.1 (the suite OOM'd on a 2 GB box decoding every queue clone
    // at full fidelity), and every analyzer (peaks/onset/tempo/chroma) reads
    // fine at that rate — the beat doesn't live above 11 kHz.
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 22050);
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.getChannelData(0), COLS = 600, step = Math.max(1, Math.floor(ch.length / COLS));
    const lo = new Float32Array(COLS), mid = new Float32Array(COLS), hi = new Float32Array(COLS);
    let l1 = 0, l2 = 0;                     // two cascaded one-pole lows (different cutoffs)
    const a1 = 1 - Math.exp(-2 * Math.PI * 180 / audio.sampleRate);    // ~180 Hz
    const a2 = 1 - Math.exp(-2 * Math.PI * 2200 / audio.sampleRate);   // ~2.2 kHz
    for (let c = 0; c < COLS; c++) {
      let bL = 0, bM = 0, bH = 0;
      for (let i = c * step, e = Math.min(ch.length, (c + 1) * step); i < e; i++) {
        const x = ch[i];
        l1 += a1 * (x - l1); l2 += a2 * (x - l2);
        const sub = l1, mids = l2 - l1, highs = x - l2;
        const al = Math.abs(sub), am = Math.abs(mids), ah = Math.abs(highs);
        if (al > bL) bL = al; if (am > bM) bM = am; if (ah > bH) bH = ah;
      }
      lo[c] = bL; mid[c] = bM; hi[c] = bH;
    }
    const norm = (arr) => { let mx = 0; for (const v of arr) if (v > mx) mx = v; if (mx > 0) for (let i = 0; i < arr.length; i++) arr[i] = arr[i] / mx; return arr; };
    const out = { lo: norm(lo), mid: norm(mid), hi: norm(hi), cols: COLS, dur: audio.duration };
    // t114: the same decode yields INSTANT tempo/key/grid — no live waiting
    try {
      const an = analyzeOffline(ch, audio.sampleRate);
      out.bpm = an.bpm; out.grid0 = an.grid0; out.keyObj = an.keyObj; out.key = an.keyObj?.camelot || null;
      if (an.bpm || an.key) {
        meta[item.id] = Object.assign({}, meta[item.id], { bpm: an.bpm || meta[item.id]?.bpm, key: an.key || meta[item.id]?.key });
        try { localStorage.setItem('hb_djpro_meta', JSON.stringify(meta)); } catch {}
      }
    } catch {}
    _peaksCache.set(item.id, out);
    if (_peaksCache.size > 40) _peaksCache.delete(_peaksCache.keys().next().value);   // t111: LRU cap
    return out;
  } catch { return null; }
}

export function createDjPro() {
  let actx = null, masterIn = null, masterGain = null, masterAnalyser = null, duckGain = null;
  let _micBuf = null, _lvCache = null, _lvAt = 0;   // t111: perf — reused mic buffer + 8 ms levels cache
  let limiter = null, softClip = null, gate = null, boothGain = null;
  let ringIn = null, mounted = false, activeDeck = 0, mode = 'beginner', subDynNode = null;
  let ringSatHz = 0, ringStages = 0, ringGuard = null, ringSubIn = 0, ringSubLp2 = false, calGain = null;   // t71/t73/t75 probes
  let resScene = null, resSources = 0, ringEngine = 'webaudio';   // t77: Resonance Audio (Apache-2.0, vendored) — Ambisonic soundfield ring
  const freq = new Uint8Array(256), wave = new Uint8Array(1024);
  const _fwd = new THREE.Vector3();
  let surround = null;                          // dance.speakerWorld (set at first update)

  const xf = { pos: 0.5, curve: 0.5 };          // curve 0 = sharp cut · 1 = smooth mix
  // t108: the overhaul's shared state — beat FX rack, mic stage, recorder,
  // auto-DJ. Assigns live on the decks (dk.xfAssign: 'a' | 'thru' | 'b').
  const fx = { sel: 'off', frac: 1, depth: 0.5, on: false, nodes: null, brakeTimer: null, echoT: 0.5 };
  const mic = { on: false, src: null, stream: null, gain: null, analyser: null, duckDb: -12, lvl: 0 };
  const rec = { mr: null, chunks: [], on: false, t0: 0, url: null, dest: null };
  const autoDj = { on: false, idx: 0, queue: [], transition: null, fadeBeats: 8, leadBeats: 16, timer: null, current: -1,
    style: 'blend', swapTimer: null, swapT: 0, rollTimer: null, preBusy: false, doneAt: 0, onDone: null };   // t112 state · t114 roll/pre · t115 finite set
  function applyXf() {                           // t108: ENGINE-side — honors per-deck assigns
    const g = xfGains();
    for (const dk of decks) {
      if (!dk.xfG) continue;
      const a = dk.xfAssign || (dk.id === 0 ? 'a' : 'b');
      const v = a === 'thru' ? 1 : (a === 'a' ? g.a : g.b);
      dk.xfG.gain.setTargetAtTime(v, actx.currentTime, 0.015);
    }
  }
  const xfGainsAt = (x) => {                    // constant-power ↔ full-cut blend (t111: at any fader pos)
    const c = xf.curve;
    const smA = Math.cos(x * Math.PI / 2), smB = Math.sin(x * Math.PI / 2);
    const shA = x <= 0.5 ? 1 : Math.max(0, 1 - (x - 0.5) * 2), shB = x >= 0.5 ? 1 : Math.max(0, 1 - (0.5 - x) * 2);
    return { a: smA * c + shA * (1 - c), b: smB * c + shB * (1 - c) };
  };
  const xfGains = () => xfGainsAt(xf.pos);

  function makeDeck(id, color) {
    const dk = {
      id, color, el: null, item: null, src: null, trim: null, eqL: null, eqM: null, eqH: null,
      fader: null, xfG: null, analyser: null, rate: 1, keyLock: true, bpm: 0, key: null,
      cues: new Array(8).fill(null), loop: { in: null, out: null, active: false, beats: 0 },
      // t108 DJ OVERHAUL: pitch fader + selectable range · slip mode · crossfader
      // assign (A/THRU/B) · sound-color FX (filter sweep / dub delay) · peaks
      pitch: 0, pitchRange: 8, slip: { on: false, pos: 0, lastT: 0 }, xfAssign: null,
      colorMode: 'filter', nudge: 0,
      beats: 0, lastBeatT: -9, ivHits: [], chroma: new Array(12).fill(0), chromaN: 0, grid0: 0
    };
    dk.load = (item) => {
      if (!item?.source || !item.key) return false;
      if (/\\.(mp4|m4v|webm|mkv|mov|avi)$/i.test(`${item.key} ${item.file || ''}`) || ['movie', 'show', 'musicvideo'].includes(item.type)) {
        if (item.type === 'album' || AUDIO_RE.test(item.key || '')) { /* audio file ok */ } else return false;
      }
      ensureGraph(); dk.ensureEl();
      dk.item = item; dk.bpm = 0; dk.ivHits = []; dk.chroma.fill(0); dk.chromaN = 0; dk.key = null;
      dk.grid0 = 0; dk.gridReady = false;        // t114: gridReady = a REAL beat anchor exists (live or offline)
      dk.cues = new Array(8).fill(null); dk.loop = { in: null, out: null, active: false, beats: 0 };
      dk.slip = { on: false, pos: 0, lastT: 0 }; dk.peaks = peaksFor(item) || null; dk.peaksBusy = false;
      // t114: INSTANT INFO — cached offline analysis first (bpm + key + grid),
      // then the file's own tags (DAWs write them); the live detector keeps
      // refining the grid as the deck plays. Before this, a freshly loaded
      // deck always showed bpm 0 → AUTO-DJ blended blind — no beatmatch, no
      // drift guard, garbage phrase alignment. That was "it just cuts".
      if (dk.peaks?.bpm) { dk.bpm = dk.peaks.bpm; dk.grid0 = dk.peaks.grid0 || 0; dk.gridReady = !!dk.peaks.grid0; }
      else if (item.bpm > 0) dk.bpm = item.bpm;
      if (dk.peaks?.keyObj) dk.key = dk.peaks.keyObj;
      else if (item.keyTag) { const c = keyTagToCamelot(item.keyTag); if (c) dk.key = { note: null, mode: null, camelot: c, tagged: true }; }
      if (!dk.peaks && !dk.peaksBusy) {
        dk.peaksBusy = true;
        computePeaks(item).then(p2 => {
          dk.peaksBusy = false;
          if (!p2 || dk.item !== item) return;
          dk.peaks = p2;
          if (!dk.bpm && p2.bpm) { dk.bpm = p2.bpm; dk.grid0 = p2.grid0 || 0; dk.gridReady = !!p2.grid0; }
          if (!dk.key && p2.keyObj) dk.key = p2.keyObj;
        }).catch(() => { dk.peaksBusy = false; });
      }
      dk.el.src = `/api/play/${item.source}/${encodeURIComponent(item.key)}?audio=1`;
      dk.el.play().catch(() => {});
      return true;
    };
    dk.ensureEl = () => {
      if (dk.el) return;
      dk.el = document.createElement('audio');
      dk.el.volume = 1; dk.el.preservesPitch = true; dk.el.playbackRate = dk.rate;
      dk.el.addEventListener('ended', () => { dk.loop.active = false; });
      document.body.appendChild(dk.el);
    };
    dk.buildGraph = () => {                      // called once, inside a user gesture
      dk.ensureEl();
      try {
        const s = actx.createMediaElementSource(dk.el);
        dk.trim = actx.createGain();
        dk.eqL = actx.createBiquadFilter(); dk.eqL.type = 'lowshelf'; dk.eqL.frequency.value = 120;
        dk.eqM = actx.createBiquadFilter(); dk.eqM.type = 'peaking'; dk.eqM.frequency.value = 1000; dk.eqM.Q.value = 1;
        dk.eqH = actx.createBiquadFilter(); dk.eqH.type = 'highshelf'; dk.eqH.frequency.value = 6000;
        dk.makeup = actx.createGain();   // t76: dB-HONEST EQ MAKEUP — the jukebox's t59 recipe: boosting EQ shapes tone, never steals loudness headroom (0.5 dB back per bass dB, 0.35 per mid/treble)
        dk.fader = actx.createGain();
        dk.xfG = actx.createGain(); dk.xfG.gain.value = dk.id === 0 ? xfGains().a : xfGains().b;
        dk.analyser = actx.createAnalyser(); dk.analyser.fftSize = 512; dk.analyser.smoothingTimeConstant = 0.5;
        s.connect(dk.trim); dk.trim.connect(dk.eqL); dk.eqL.connect(dk.eqM); dk.eqM.connect(dk.eqH);
        dk.eqH.connect(dk.makeup);
        // t108: SOUND COLOR FX — one knob per channel. Center = bypass. Left
        // sweeps a resonant LPF (20 kHz → 20 Hz, Q 3.5); right sweeps a
        // resonant HPF (20 Hz → 18 kHz). Dub mode swaps the sides' action for
        // a tempo-synced feedback delay. Dry path stays unity when bypassed —
        // the calibrated t75/t76 chain is untouched at center.
        dk.colorIn = actx.createGain();
        dk.colorOut = actx.createGain();
        dk.colorLPF = actx.createBiquadFilter(); dk.colorLPF.type = 'lowpass'; dk.colorLPF.frequency.value = 20000; dk.colorLPF.Q.value = 3.5;
        dk.colorHPF = actx.createBiquadFilter(); dk.colorHPF.type = 'highpass'; dk.colorHPF.frequency.value = 20; dk.colorHPF.Q.value = 3.5;
        dk.colorDelay = actx.createDelay(2); dk.colorDelay.delayTime.value = 0.42;
        dk.colorFb = actx.createGain(); dk.colorFb.gain.value = 0.45;
        dk.colorWet = actx.createGain(); dk.colorWet.gain.value = 0;   // the knob
        dk.makeup.connect(dk.colorIn); dk.colorIn.connect(dk.colorOut);            // dry (unity)
        dk.colorIn.connect(dk.colorLPF); dk.colorLPF.connect(dk.colorWet);
        dk.colorIn.connect(dk.colorHPF); dk.colorHPF.connect(dk.colorWet);
        dk.colorIn.connect(dk.colorDelay); dk.colorDelay.connect(dk.colorFb); dk.colorFb.connect(dk.colorDelay);
        dk.colorDelay.connect(dk.colorWet);
        dk.colorWet.connect(dk.colorOut);
        dk.setColor = (v) => {                     // 0..1, 0.5 = bypass
          dk.colorVal = clamp(+v || 0, 0, 1);
          if (!dk.colorWet) return;
          const off = dk.colorVal - 0.5, t = actx.currentTime;
          if (dk.colorMode === 'dub') {            // dub delay: wet rises away from center, feedback follows
            dk.colorWet.gain.setTargetAtTime(Math.min(0.85, Math.abs(off) * 1.7), t, 0.03);
            dk.colorFb.gain.setTargetAtTime(0.25 + Math.abs(off) * 0.55, t, 0.03);
            if (dk.bpm) dk.colorDelay.delayTime.setTargetAtTime(dk.beatSec() * 0.75, t, 0.05);
          } else {                                 // filter sweep: left = LPF down, right = HPF up
            if (off < -0.01) { const f = 20000 * Math.pow(20 / 20000, -off * 2); dk.colorLPF.frequency.setTargetAtTime(f, t, 0.03); dk.colorWet.gain.setTargetAtTime(1, t, 0.02); }
            else if (off > 0.01) { const f = 20 * Math.pow(18000 / 20, off * 2); dk.colorHPF.frequency.setTargetAtTime(f, t, 0.03); dk.colorWet.gain.setTargetAtTime(1, t, 0.02); }
            else dk.colorWet.gain.setTargetAtTime(0, t, 0.02);
          }
        };
        dk.colorVal = 0.5;
        dk.colorOut.connect(dk.fader); dk.fader.connect(dk.xfG); dk.xfG.connect(masterIn);
        dk.fader.connect(dk.analyser);            // pre-fader-ish tap (channel level)
        dk.graphed = true;
      } catch { dk.graphed = false; }
    };
    dk.eqDb = { bass: 0, mid: 0, treble: 0 };
    dk.setEq = (band, db) => {
      // t108: full-left = ISOLATOR KILL (-40 dB — a shelf at -40 is silence to
      // the ear); boosts keep the t76 dB-honest makeup doctrine.
      const n = { bass: dk.eqL, mid: dk.eqM, treble: dk.eqH }[band];
      if (n) n.gain.setTargetAtTime(clamp(db, -40, 12), actx.currentTime, 0.04);
      dk.eqDb[band] = clamp(db, -40, 12);
      // t76: dB-honest makeup — pay back what the boost would steal (jukebox recipe)
      const cost = 0.5 * Math.max(0, dk.eqDb.bass) + 0.35 * Math.max(0, dk.eqDb.mid) + 0.35 * Math.max(0, dk.eqDb.treble);
      if (dk.makeup) dk.makeup.gain.setTargetAtTime(Math.pow(10, -cost / 20), actx.currentTime, 0.05);
    };
    dk.setRate = (r) => { dk.rate = clamp(r, 0.5, 2); if (dk.el) dk.el.playbackRate = dk.rate; };
    dk.setKeyLock = (on) => { dk.keyLock = !!on; if (dk.el) { dk.el.preservesPitch = dk.keyLock; dk.el.mozPreservesPitch = dk.keyLock; dk.el.webkitPreservesPitch = dk.keyLock; } };
    // t108: PITCH FADER — ±range % mapped to rate (key lock rides preservesPitch,
    // Chromium's real time-stretch, already proven). Ranges: 6 / 10 / 16 / WIDE 50.
    dk.setPitch = (pct) => { dk.pitch = clamp(+pct || 0, -dk.pitchRange, dk.pitchRange); dk.setRate(1 + dk.pitch / 100); };
    dk.setPitchRange = (r) => { dk.pitchRange = [6, 10, 16, 50].includes(+r) ? +r : 8; dk.pitch = clamp(dk.pitch, -dk.pitchRange, dk.pitchRange); };
    // nudge = pitch-bend while held (a finger on the platter edge)
    dk.setNudge = (dir) => { dk.nudge = dir; if (dk.el) dk.el.playbackRate = dk.rate * (1 + 0.06 * dir); if (!dir && dk.el) dk.el.playbackRate = dk.rate; };
    // SLIP: the silent timeline keeps running while you scrub/loop; releasing
    // jumps the track to where it WOULD be — the DJ's "where was I" insurance.
    dk.setSlip = (on) => {
      if (on && !dk.slip.on) { dk.slip = { on: true, pos: dk.el?.currentTime || 0, lastT: actx ? actx.currentTime : 0 }; }
      else if (!on && dk.slip.on) { if (dk.el) try { dk.el.currentTime = dk.slip.pos; } catch {} dk.slip.on = false; }
    };
    // INSTANT DOUBLES: clone the other deck — same track, same position, same
    // tempo, same loop — for live layering/redrum tricks.
    dk.doubles = (other) => {
      if (!other?.item) return false;
      ensureGraph(); if (!dk.graphed) dk.buildGraph();
      const ok = dk.load(other.item);
      if (!ok) return false;
      dk.setRate(other.rate); dk.pitch = other.pitch;
      if (dk.el && other.el) try { dk.el.currentTime = other.el.currentTime; } catch {}
      dk.cues = [...other.cues]; dk.loop = { ...other.loop };
      return true;
    };
    dk.playPause = () => { if (!dk.el) return; dk.el.paused ? dk.el.play().catch(() => {}) : dk.el.pause(); };
    dk.cue = (n) => { const t = dk.cues[n]; if (t != null && dk.el) dk.el.currentTime = t; };
    dk.beatSec = () => { const eff = (dk.bpm || 120) * dk.rate; return 60 / eff; };
    dk.jumpBeats = (n) => { if (dk.el) dk.el.currentTime = Math.max(0, dk.el.currentTime + n * dk.beatSec()); };
    dk.autoLoop = (beats) => {
      if (!dk.el || !dk.bpm) return;
      const spb = dk.beatSec(), t = dk.el.currentTime;
      const rel = t - dk.grid0, q = Math.floor(rel / spb) * spb;
      dk.loop = { in: dk.grid0 + q, out: dk.grid0 + q + beats * spb, active: true, beats };
    };
    dk.clearLoop = () => { dk.loop = { in: null, out: null, active: false, beats: 0 }; };
    dk.syncTo = (other) => {                     // tempo match + phase align to the other deck
      if (!dk.bpm || !other.bpm) return;
      const otherEff = other.bpm * other.rate;
      dk.setRate(clamp(otherEff / dk.bpm, 0.5, 2));
      // t118: PHASE IN BEAT FRACTIONS — the old code modded TRACK positions by
      // WALL beat lengths (60/(bpm·rate)), mixing units: at rate ≠ 1 the two
      // decks landed up to a tenth of a beat apart (an audible flam on the
      // kick). Fractions of a beat are rate-independent on both sides, so the
      // comparison is apples-to-apples at any tempo offset.
      const mySpb = 60 / dk.bpm, otSpb = 60 / other.bpm;   // track-time beat lengths
      let df = ((other.el?.currentTime || 0) - other.grid0) / otSpb
             - ((dk.el?.currentTime || 0) - dk.grid0) / mySpb;
      df = ((df % 1) + 1) % 1; if (df > 0.5) df -= 1;      // signed fraction, shortest path
      if (dk.el) dk.el.currentTime = Math.max(0, dk.el.currentTime + df * mySpb);
    };
    return dk;
  }
  const decks = [makeDeck(0, '#2de2ff'), makeDeck(1, '#ff2d78')];

  function ensureGraph() {
    if (actx) return;
    actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    masterIn = actx.createGain();
    masterAnalyser = actx.createAnalyser(); masterAnalyser.fftSize = 512; masterAnalyser.smoothingTimeConstant = 0.55;
    masterGain = actx.createGain(); masterGain.gain.value = 0.8;
    // t75: THE JUKEBOX'S CALIBRATION, FINALLY HERE — every other room feeds its
    // speaker matrix through a fixed 0.55 trim; the booth fed it RAW (trim 0-1.5
    // x fader x master straight in). The owner's "perfect at master 0.5" was this
    // exact constant hand-plugged from the listener side; above it, unity drive
    // overran the matrix. Calibrate BEFORE the master volume, like the jukebox:
    // unity (trim 1, master 1) now equals the reference in-room loudness.
    calGain = actx.createGain(); calGain.gain.value = 0.55;
    limiter = actx.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 3; limiter.ratio.value = 14;
    limiter.attack.value = 0.002; limiter.release.value = 0.12;
    softClip = actx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      // t70: UNITY soft-knee — y = x EXACTLY below 0.85. The t63 tanh curve had a
      // 1.47x zero-crossing slope (hidden +5.4 dB boost = "louder than every other
      // app") and saturated loud program at max volume. Above the knee it eases to
      // a 0.965 ceiling; below it, bit-transparent.
      const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x), K = 0.85;
      curve[i] = a <= K ? x : Math.sign(x) * (K + (1 - K) * Math.tanh((a - K) / (1 - K)));
    }
    softClip.curve = curve; softClip.oversample = '2x';
    gate = actx.createGain(); gate.gain.value = 1;      // dance wing only (update())
    boothGain = actx.createGain(); boothGain.gain.value = 0;   // booth monitor tap (off)
    // t108: DUCK STAGE — the mic's sidechain target. Sits AFTER the CAL trim
    // (t75 semantics untouched) and BEFORE the volume: music dips, mic (which
    // joins past the duck) doesn't duck itself.
    duckGain = actx.createGain(); duckGain.gain.value = 1;
    masterIn.connect(masterAnalyser); masterAnalyser.connect(calGain); calGain.connect(duckGain); duckGain.connect(masterGain);   // t75 chain + t108 duck
    masterGain.connect(limiter); limiter.connect(softClip); softClip.connect(gate);
    gate.connect(actx.destination); gate.connect(boothGain); boothGain.connect(actx.destination);
    // t108: SESSION RECORDER tap — the clean stereo master, PRE-gate (the set
    // records even if the DJ strolls into the store) and post-limiter/clip.
    rec.dest = actx.createMediaStreamDestination();
    softClip.connect(rec.dest);
    // t108: BEAT-FX RACK — a parallel wet path summed into the master analyser.
    // Depth lives in fxWet; the dry path is untouched at depth 0.
    fx.nodes = {};
    fx.nodes.in = actx.createGain();
    fx.nodes.echoDelay = actx.createDelay(4); fx.nodes.echoFb = actx.createGain(); fx.nodes.echoFb.gain.value = 0.5;
    fx.nodes.echoDelay.connect(fx.nodes.echoFb); fx.nodes.echoFb.connect(fx.nodes.echoDelay);
    fx.nodes.conv = actx.createConvolver();
    { // synthetic impulse: 2.2 s decaying stereo noise — a credible hall tail
      const len = Math.floor(actx.sampleRate * 2.2), ir = actx.createBuffer(2, len, actx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * 0.5; }
      fx.nodes.conv.buffer = ir;
    }
    fx.nodes.flDelay = actx.createDelay(0.05); fx.nodes.flDelay.delayTime.value = 0.0045;
    fx.nodes.flFb = actx.createGain(); fx.nodes.flFb.gain.value = 0.62;
    fx.nodes.flLfo = actx.createOscillator(); fx.nodes.flLfo.frequency.value = 0.18;
    fx.nodes.flLfoG = actx.createGain(); fx.nodes.flLfoG.gain.value = 0.0022;
    fx.nodes.flLfo.connect(fx.nodes.flLfoG); fx.nodes.flLfoG.connect(fx.nodes.flDelay.delayTime);
    fx.nodes.flDelay.connect(fx.nodes.flFb); fx.nodes.flFb.connect(fx.nodes.flDelay);
    fx.nodes.flLfo.start();
    // t108: STUTTER — a square-LFO gate on the wet path, retriggering at the
    // beat fraction (frac 1/4 = sixteenth-note rolls)
    fx.nodes.stGate = actx.createGain(); fx.nodes.stGate.gain.value = 0.5;
    fx.nodes.stOsc = actx.createOscillator(); fx.nodes.stOsc.type = 'square'; fx.nodes.stOsc.frequency.value = 2;
    fx.nodes.stOscG = actx.createGain(); fx.nodes.stOscG.gain.value = 0.5;
    fx.nodes.stOsc.connect(fx.nodes.stOscG); fx.nodes.stOscG.connect(fx.nodes.stGate.gain);
    fx.nodes.stOsc.start();
    fx.nodes.wet = actx.createGain(); fx.nodes.wet.gain.value = 0;
    masterIn.connect(fx.nodes.in); fx.nodes.wet.connect(masterAnalyser);
    applyXf();
    ringIn = gate;                                      // ring hangs off the gate output
    buildRing();                                        // t67: BUILD IT — the old path only ran
  }                                                     // before the context existed (never)

  // the dance-hall ring: same matrix as the store rig, scoped to this engine
  function buildRing() {
    if (!actx || !surround || !surround.sats?.length || ringBuilt) return;
    ringBuilt = true;
    // t71: THE RING SUMS INSIDE PROTECTION NOW — the t67 ring hung 10 cabinets
    // and the sub straight off the destination, PAST the knee and limiter:
    // coherent bass from ten cabinets clipped the output bus where no net could
    // catch it (the owner could only tame it with trim ~0.2). The summed ring
    // now gets its own unity knee + limiter before the output.
    const ringSum = actx.createGain(); ringSum.gain.value = 1;
    const ringClip = actx.createWaveShaper();
    const cn = 1024, cc = new Float32Array(cn);
    for (let i = 0; i < cn; i++) { const x = (i / (cn - 1)) * 2 - 1, a = Math.abs(x), K = 0.85; cc[i] = a <= K ? x : Math.sign(x) * (K + (1 - K) * Math.tanh((a - K) / (1 - K))); }
    ringClip.curve = cc; ringClip.oversample = '2x';
    const ringLimiter = actx.createDynamicsCompressor();
    ringLimiter.threshold.value = -2; ringLimiter.knee.value = 3; ringLimiter.ratio.value = 14;
    ringLimiter.attack.value = 0.002; ringLimiter.release.value = 0.12;
    ringSum.connect(ringClip); ringClip.connect(ringLimiter); ringLimiter.connect(actx.destination);
    ringGuard = ringLimiter;
    const split = actx.createChannelSplitter(2);
    ringIn.connect(split);
    const busL = actx.createGain(), busR = actx.createGain();
    split.connect(busL, 0); split.connect(busR, 1);
    const cx = surround.center.x, cz = surround.center.z;
    let resSceneMade = false;
    for (const sp of surround.sats) {
      const dx = sp.x - cx, dz = sp.z - cz;
      const kind = (Math.abs(dx) < 0.9 && dz < -1.2) ? 'center' : (Math.abs(dx) > 1.2 && dz < -1.2) ? 'main' : (dz > 1.2) ? 'rear' : 'side';
      let node = actx.createGain();
      // t77: the JUKEBOX hierarchy (the owner-approved balance) — mains dominate,
      // sides/rears fill. The old flat 0.26/0.16/0.13 mix left ten near-equal
      // cabinets fighting for the image.
      node.gain.value = kind === 'main' ? 0.5 : kind === 'center' ? 0.18 : kind === 'rear' ? 0.22 : 0.3;
      // t77: RESONANCE AUDIO — Google's open-source (Apache-2.0) Ambisonic renderer,
      // vendored at /js/vendor/. The whole ring renders through ONE first-order
      // soundfield with true HRTF binaural decoding instead of ten independent
      // PannerNodes whose coherent summing smeared the image; if the vendor file
      // is missing or throws, the WebAudio ring stands up VERBATIM (any browser).
      try {
        if (!resSceneMade && window.ResonanceAudio) { resSceneMade = true; resScene = new ResonanceAudio(actx, { ambisonicOrder: 1, dimensions: { width: 12, height: 5, depth: 12 } }); }
      } catch { resScene = null; }
      if (!resScene && (kind === 'side' || kind === 'rear')) { const d2 = actx.createDelay(0.05); d2.delayTime.value = kind === 'side' ? 0.012 : 0.023; node.connect(d2); node = d2; }   // Haas — WebAudio path only; Resonance renders direction itself
      // t71: steep bass management — 110 Hz @ 24 dB/oct; the subs own the lows
      const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110; hp.Q.value = 0.707;
      const hp2 = actx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 110; hp2.Q.value = 0.707;
      node.connect(hp); hp.connect(hp2); node = hp2;
      ringSatHz = 110; ringStages = 2;
      if (resScene) {
        const rs = resScene.createSource();
        rs.setPosition(sp.x, 1.7, sp.z);              // world meters; the listener rides the camera every frame
        node.connect(rs.input);
        resSources++;
      } else {
        const pn = actx.createPanner(); pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse';
        pn.refDistance = 2.2; pn.rolloffFactor = 0.35; pn.maxDistance = 50;   // t74: THEATER shading — equal slider = equal loudness
        const set = (p, x, y, z) => p.positionX ? (p.positionX.value = x, p.positionY.value = y, p.positionZ.value = z) : p.setPosition(x, y, z);
        set(pn, sp.x, 1.7, sp.z);                        // t60: ear level, like the hall rig
        node.connect(pn); pn.connect(ringSum);              // t71: into the guarded sum, not the raw output
      }
      if (kind === 'center') { busL.connect(node); busR.connect(node); } else (dx < 0 ? busL : busR).connect(node);
    }
    if (resScene) { resScene.output.connect(ringSum); ringEngine = 'resonance'; }   // the guarded knee + limiter still catch everything
    // t73: THEATER-EXACT SUB — 0.4 input from both buses (the old UNITY mono
    // sum was +6 dB on correlated bass before the trim = "extra bass for no
    // reason"), LP 110 x2 (24 dB/oct, slope-matched to the cabinet HPs).
    const subIn = actx.createGain(); subIn.gain.value = 0.4;
    const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 0.707;
    const lp2 = actx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 110; lp2.Q.value = 0.707;
    const sd = actx.createDynamicsCompressor();      // t67: sub-band dynamics — deck EQ at +12
    sd.threshold.value = -10; sd.knee.value = 6; sd.ratio.value = 4;   // with trim up can push real
    sd.attack.value = 0.01; sd.release.value = 0.15;                   // kicks past every static trim
    const sg = actx.createGain(); sg.gain.value = 0.3;
    busL.connect(subIn); busR.connect(subIn); subIn.connect(lp); lp.connect(lp2); lp2.connect(sd); sd.connect(sg); sg.connect(ringSum);   // t71 guarded · t73 theater-calibrated
    ringSubIn = subIn.gain.value; ringSubLp2 = true;
    subDynNode = sd;
  }
  let ringBuilt = false;

  // ── per-frame: loops, BPM, chroma, gate, listener ──────────────────────────
  let lastBass = [0, 0];
  function tick(deck) {
    const a = deck.analyser; if (!a || !deck.el || deck.el.paused) return;
    a.getByteFrequencyData(freq);
    const bass = (freq[0] + freq[1] + freq[2]) / (3 * 255);
    // adaptive kick (same doctrine as the light rig)
    const now = actx.currentTime;
    if (bass > 0.08 && bass > lastBass[deck.id] * 1.3 + 0.02 && now - deck.lastBeatT > 0.3) {
      if (deck.lastBeatT > 0 && now - deck.lastBeatT < 2.5) deck.ivHits.push(now - deck.lastBeatT);
      if (deck.ivHits.length > 24) deck.ivHits.shift();
      deck.lastBeatT = now; deck.beats++; deck.grid0 = deck.el.currentTime; deck.gridReady = true;
      if (!deck.bpm && deck.ivHits.length >= 8) deck.bpm = modeInterval(deck.ivHits);
    }
    lastBass[deck.id] = bass;
    // chroma → key (accumulate a few seconds)
    if (!deck.key && deck.chromaN < 260) {
      for (let bin = 2; bin < 96; bin++) {             // ~86 Hz … ~4 kHz
        const hz = bin * actx.sampleRate / 512;
        if (hz < 80 || hz > 2000) continue;
        const pc = Math.round(12 * Math.log2(hz / 440)) % 12;   // A-relative
        deck.chroma[(pc + 9 + 12) % 12] += freq[bin] / 255;    // → C-based
      }
      deck.chromaN++;
      if (deck.chromaN >= 260) deck.key = keyFromChroma(deck.chroma.map(v => v / 260));
    }
    // loop enforcement
    if (deck.loop.active && deck.el.currentTime >= deck.loop.out) deck.el.currentTime = deck.loop.in;
    // t108: SLIP — the virtual timeline keeps running under scrubs/loops
    if (deck.slip.on) {
      const now = actx.currentTime, dt = Math.max(0, now - (deck.slip.lastT || now));
      deck.slip.lastT = now;
      deck.slip.pos += dt * deck.rate;
    }
  }

  function update(camera) {
    if (!actx) return;
    if (!surround && window.__VB?.scene?.danceInfo) {
      const dw = window.__VB.scene._danceSpeakerWorld;   // scene injects this
      if (dw) { surround = dw; buildRing(); }
    }
    for (const dk of decks) tick(dk);
    // t111: AUTO-DJ runs on its own 400 ms interval now (not here) — the
    // render loop stops when the tab is hidden, and the mix must not.
    // t108: MIC AUTO-DUCK — voice over the threshold dips the music
    // (10 ms attack, 500 ms release), exactly the broadcast behavior.
    if (mic.on && mic.analyser && duckGain) {
      if (!_micBuf || _micBuf.length !== mic.analyser.frequencyBinCount) _micBuf = new Uint8Array(mic.analyser.frequencyBinCount);
      const mf = _micBuf;   // t111: reused buffer — no per-frame allocation
      mic.analyser.getByteFrequencyData(mf);
      let sum = 0; for (let i = 0; i < 48; i++) sum += mf[i];
      mic.lvl = sum / (48 * 255);
      const target = mic.lvl > 0.055 ? Math.pow(10, mic.duckDb / 20) : 1;
      duckGain.gain.setTargetAtTime(target, actx.currentTime, mic.lvl > 0.055 ? 0.01 : 0.5);
    }
    const p = camera.position;
    const inWing = p.x > 6.2 && p.z < 9.2;              // dance hall ONLY (t60 containment)
    gate.gain.setTargetAtTime(inWing ? 1 : 0, actx.currentTime, 0.09);
    const l = actx.listener, fwd = _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (l.positionX) {
      l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
      l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
    } else { l.setPosition(p.x, p.y, p.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    if (resScene) {                                     // t77: the Ambisonic listener rides the camera too
      try {
        resScene.setListenerPosition(p.x, p.y, p.z);
        resScene.setListenerOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
      } catch { try { resScene.setListenerOrientation(fwd, { x: 0, y: 1, z: 0 }); } catch {} }
    }
  }

  // ── t108: the FX rack / mic / recorder / auto-DJ controllers ──────────────
  function fxAlgoInput() {
    const n = fx.nodes; if (!n) return null;
    return { echo: n.echoDelay, reverb: n.conv, flanger: n.flDelay, stutter: n.stGate }[fx.sel] || null;
  }
  function setFx(sel) {
    ensureGraph();                                  // any controller touch builds the rack
    fx.sel = ['off', 'echo', 'reverb', 'flanger', 'stutter'].includes(sel) ? sel : 'off';
    const n = fx.nodes; if (!n) return;
    try { n.in.disconnect(); } catch {}
    const dst = fxAlgoInput();
    if (dst) { n.in.connect(dst); }
    if (!fx.on) n.wet.gain.setTargetAtTime(0, actx.currentTime, 0.02);
  }
  function setFxParam(k, v) {
    if (k === 'frac') fx.frac = [0.25, 0.5, 1, 2, 4].includes(+v) ? +v : 1;
    if (k === 'depth') fx.depth = clamp(+v || 0, 0, 1);
    syncFxEcho();
  }
  function syncFxEcho() {                       // echo time = (60 / BPM) × beat fraction
    const n = fx.nodes; if (!n) return;
    const dk = decks[activeDeck];
    const bpm = (dk && dk.bpm ? dk.bpm * dk.rate : 0) || 120;
    fx.echoT = clamp(60 / bpm * fx.frac, 0.02, 3.5);   // reported (the param's .value reads stale)
    n.echoDelay.delayTime.setTargetAtTime(fx.echoT, actx.currentTime, 0.05);
    n.stOsc.frequency.setTargetAtTime(clamp(bpm / 60 / fx.frac, 0.5, 64), actx.currentTime, 0.05);   // stutter gate rate
    n.echoFb.gain.setTargetAtTime(0.35 + fx.depth * 0.35, actx.currentTime, 0.05);
  }
  function setFxOn(on) {                        // the paddle: latch ON, or hold for a burst
    ensureGraph();
    fx.on = !!on;
    const n = fx.nodes; if (!n) return;
    n.wet.gain.setTargetAtTime(fx.on ? fx.depth : 0, actx.currentTime, on ? 0.012 : 0.09);
    if (fx.on) syncFxEcho();
  }
  function brakeActive() {                      // vinyl brake — the active deck winds down
    const dk = decks[activeDeck]; if (!dk?.el || dk.el.paused) return;
    const spb = dk.beatSec(), total = spb * fx.frac * 4, t0 = performance.now(), r0 = dk.rate;
    if (fx.brakeTimer) cancelAnimationFrame(fx.brakeTimer);
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / (total * 1000));
      const r = Math.max(0.02, r0 * (1 - k * 0.98));
      if (dk.el) dk.el.playbackRate = r;
      if (k < 1) fx.brakeTimer = requestAnimationFrame(step);
      else { dk.playPause(); if (dk.el) dk.el.playbackRate = dk.rate; }
    };
    fx.brakeTimer = requestAnimationFrame(step);
  }
  async function enableMic(on, duckDb = -12) {
    if (!on) {
      try { mic.stream?.getTracks().forEach(t => t.stop()); } catch {}
      try { mic.src?.disconnect(); } catch {}
      mic.on = false; mic.lvl = 0;
      if (duckGain) duckGain.gain.setTargetAtTime(1, actx.currentTime, 0.5);
      return { on: false };
    }
    ensureGraph();
    if (!mic.on) {
      try {
        mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false } });
        mic.src = actx.createMediaStreamSource(mic.stream);
        const lo = actx.createBiquadFilter(); lo.type = 'lowshelf'; lo.frequency.value = 250; lo.gain.value = 2;   // 2-band voice EQ
        const hi = actx.createBiquadFilter(); hi.type = 'highshelf'; hi.frequency.value = 3000; hi.gain.value = 2;
        mic.gain = actx.createGain(); mic.gain.gain.value = 0.9;
        mic.analyser = actx.createAnalyser(); mic.analyser.fftSize = 256;
        mic.src.connect(lo); lo.connect(hi); hi.connect(mic.gain);
        mic.gain.connect(masterGain);           // past the duck (mic never ducks itself), into the limiter
        mic.gain.connect(mic.analyser);
        mic.on = true;
      } catch (e) { mic.on = false; return { on: false, error: e.message }; }
    }
    mic.duckDb = [-12, -24].includes(+duckDb) ? +duckDb : -12;
    return { on: mic.on, duckDb: mic.duckDb };
  }
  function startRec() {
    ensureGraph();
    if (rec.on || !rec.dest) return { on: false, error: 'already' };
    try {
      rec.mr = new MediaRecorder(rec.dest.stream);
      rec.chunks = [];
      rec.mr.ondataavailable = (e) => { if (e.data.size) rec.chunks.push(e.data); };
      rec.mr.start(500);
      rec.on = true; rec.t0 = actx.currentTime;
      return { on: true };
    } catch (e) { return { on: false, error: e.message }; }
  }
  function stopRec() {
    if (!rec.on || !rec.mr) return { on: false };
    return new Promise((resolve) => {
      rec.mr.onstop = () => {
        rec.url = URL.createObjectURL(new Blob(rec.chunks, { type: rec.chunks[0]?.type || 'audio/webm' }));
        rec.on = false;
        resolve({ on: false, url: rec.url, secs: +(actx.currentTime - rec.t0).toFixed(1) });
      };
      try { rec.mr.stop(); } catch { rec.on = false; resolve({ on: false }); }
    });
  }
  // ── t111: AUTO-DJ, RELIABLE. The old version stalled: the from-deck was
  // never paused after a fade (both decks "playing" → the load gate locked),
  // it refused to fire before BPM detection finished, and it only ran inside
  // the render loop — which STOPS when the tab is hidden, so the mix died the
  // moment you switched windows. Now: a 400 ms interval (runs hidden), the
  // crossfade SCHEDULED ON THE AUDIO CLOCK (linearRamp — zero pops, runs in
  // the audio thread no matter what the page is doing), the old deck paused
  // when the fade completes, no BPM requirement (default-tempo beats), and an
  // emergency path that refuses dead air: if nothing is audible with a queue
  // loaded, the next track starts immediately.
  // ── t112: THE PERSONAL DJ — how a pro actually mixes, scripted. Research:
  // docs/RESEARCH-AUTODJ.md. Three ingredients: tempo (beatmatch + drift
  // guard), placement (phrase-aligned starts, silence-trimmed ends), balance
  // (the right transition for the pair: blend+bass swap / filter fade / echo
  // out — chosen by BPM distance and key compatibility).
  const camelotOk = (a, b) => {                   // Camelot wheel: same, ±1 number, or same-number other letter
    if (!a || !b) return true;
    const na = parseInt(a, 10), nb = parseInt(b, 10), la = a.slice(-1), lb = b.slice(-1);
    return na === nb || na === nb - 1 || (na === nb + 1 && la === lb) || (la !== lb && na === nb);
  };
  function pickMixStyle(a, b) {                   // the pro's decision framework
    const bpmA = a?.bpm || 0, bpmB = b?.bpm || 0;
    if (!bpmA || !bpmB) return 'blend';           // unknown tempos → the friendly default
    const d = Math.abs(bpmA - bpmB) / Math.min(bpmA, bpmB);
    const keyOK = camelotOk(a?.key?.camelot, b?.key?.camelot);
    if (d <= 0.04 && keyOK) return 'blend';       // close tempo + compatible key → the long blend
    if (d > 0.08) return 'echo';                  // t118: a tempo/genre JUMP echoes out — even with a key clash. The old
                                                 // order let the clash claim it first, which SYNCED the incoming down
                                                 // (a 174 track dragged to 0.70× to match 128) instead of dropping it
                                                 // at its own tempo behind an echo wash.
    return 'filter';                              // key clash, or a 4–8% tempo gap → the filter bridge
  }
  function audibleExtent(dk) {                    // t112: the waveform is the silence map (Mixxx's blind spot)
    const p = dk.peaks;
    if (!p) return null;
    // t118: at fire time the incoming deck JUST loaded — el.duration is still
    // NaN (no metadata yet), so the old guard read the silence map as null and
    // the lead-in trim silently never ran (an incoming with a 2 s silent
    // intro started from 0). The peaks carry their own decode duration.
    const dur = (dk.el && isFinite(dk.el.duration) && dk.el.duration > 0) ? dk.el.duration : p.dur;
    if (!dur) return null;
    const TH = 0.06, quiet = (c) => p.lo[c] < TH && p.mid[c] < TH && p.hi[c] < TH;
    let first = 0, last = p.cols - 1;
    while (first < p.cols - 1 && quiet(first)) first++;
    while (last > first && quiet(last)) last--;
    return { leadIn: (first / p.cols) * dur, tailEnd: ((last + 1) / p.cols) * dur };
  }

  function audibleDeck() {
    if (autoDj.current >= 0) { const d = decks[autoDj.current]; if (d.el && !d.el.paused && d.el.src && d.item) return d; }
    return decks.find(d => d.el && !d.el.paused && d.el.src && d.item) || null;
  }
  function beatSecSafe(dk) { const s = dk.beatSec ? dk.beatSec() : 0; return isFinite(s) && s > 0.2 && s < 3 ? s : 0.5; }
  function rampParam(p, v, t0, dur) {           // t111: schedule a pop-free fade
    try {
      if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t0);
      else { const cur = p.value; p.cancelScheduledValues(t0); p.setValueAtTime(cur, t0); }
    } catch {}
    try { p.linearRampToValueAtTime(v, t0 + dur); } catch {}
  }
  function cancelFade() {                       // mid-fade off-switch: snap to a clean state
    for (const d2 of decks) { if (!d2.xfG) continue; try { d2.xfG.gain.cancelScheduledValues(actx.currentTime); } catch {} }
    applyXf();
  }
  function loadNext(to, match) {
    const len = autoDj.queue.length; if (!len) return;
    // t115: THE SET IS FINITE (owner: "the que auto repeats" — it shouldn't).
    // When the night's list runs out, the engine switches itself off and the
    // last song plays out naturally. No wrap-around, no surprise replays.
    if (autoDj.idx >= len) {
      autoDj.doneAt = actx ? actx.currentTime : 0;
      try { autoDj.onDone?.(); } catch {}
      setAutoDj(false);
      return;
    }
    const it = autoDj.queue[autoDj.idx]; if (!it) return;
    autoDj.idx++;
    const dk = decks[to];
    ensureGraph(); if (!dk.graphed) dk.buildGraph();
    if (!dk.load(it)) return;                   // load() starts playback itself
    // t112: skip the incoming track's silent lead-in (the waveform knows)
    const ext = audibleExtent(dk);
    if (ext && ext.leadIn > 0.3 && dk.el) { try { dk.el.currentTime = ext.leadIn; } catch {} }
    // t112: choose the transition like a pro — by tempo distance + key
    autoDj.style = match ? pickMixStyle(match, dk) : 'blend';
    // t114: BEATMATCH — the incoming now HAS its bpm the moment it loads
    // (offline analysis ran ahead of time / tags), so sync actually engages:
    // tempo matched + phase aligned. Unsynced (no tempo known either side)
    // gets the radio-safe shorter crossfade, never a long clashing overlap.
    const synced = !!(match?.bpm && dk.bpm) && autoDj.style !== 'echo';
    if (synced) dk.syncTo(match);
    const matchedRate = synced ? clamp(match.bpm * match.rate / dk.bpm, 0.5, 2) : null;   // t117: the steady-state rate — what the deck returns to when the blend is done
    dk.setKeyLock(true);                        // Master Tempo: long blends stay in key
    const from = match ? match.id : Math.max(0, autoDj.current);
    const outD = decks[from], inD = dk;
    const fadeBeats = autoDj.style === 'echo' ? 2 : (autoDj.style === 'filter' ? 12 : (synced ? 16 : 10));   // t112: pro overlap lengths · t114: unsynced = 10
    const fadeSec = Math.max(1.5, fadeBeats * beatSecSafe(match || dk));
    const t0 = actx.currentTime, tEnd = t0 + fadeSec;
    const toXf = from === 0 ? 1 : 0;            // the fader travels to the new deck's side
    const gEnd = xfGainsAt(toXf);
    for (const d2 of decks) {
      if (!d2.xfG) continue;
      const a = d2.xfAssign || (d2.id === 0 ? 'a' : 'b');
      if (a === 'thru') continue;               // THRU channels never ride the fader
      rampParam(d2.xfG.gain, a === 'a' ? gEnd.a : gEnd.b, t0, fadeSec);
    }
    autoDj.transition = { from, to, t0, tEnd, fromXf: xf.pos, toXf, fadeBeats, style: autoDj.style, synced, matched: matchedRate,
      fromBass: outD.eqDb.bass, inBass: inD.eqDb.bass };
    autoDj.swapT = 0;
    if (autoDj.swapTimer) { clearTimeout(autoDj.swapTimer); autoDj.swapTimer = null; }
    // t112: THE PRO MOVES — per style
    if (autoDj.style === 'blend') {
      // THE BASS SWAP (the club workhorse): the incoming track layers in with
      // its bass CUT — only one bassline ever plays — then at the 60% mark
      // the low end swaps in one move.
      inD.setEq('bass', -24);
      const swapDelay = Math.max(0, (t0 + fadeSec * 0.6 - actx.currentTime) * 1000);
      autoDj.swapTimer = setTimeout(() => {
        if (!autoDj.on || !autoDj.transition) return;   // cancelled mid-fade — the decks were left clean, don't touch them
        try { inD.setEq('bass', autoDj.transition.inBass ?? 0); outD.setEq('bass', -24); } catch {}
        autoDj.swapT = actx.currentTime;
      }, swapDelay);
      // t114: THE SWEEP-OUT — once the bass has swapped, the outgoing thins
      // away under a rising high-pass (the polished blend exit). The handback
      // neutralizes it along with everything else.
      try {
        if (outD.colorWet && outD.colorHPF) {
          outD.colorWet.gain.setTargetAtTime(1, t0 + fadeSec * 0.7, 0.08);
          outD.colorHPF.frequency.setValueAtTime(20, t0 + fadeSec * 0.7);
          outD.colorHPF.frequency.linearRampToValueAtTime(400, tEnd);
        }
      } catch {}
    } else if (autoDj.style === 'filter') {
      // THE FILTER FADE: the incoming opens from behind a high-pass while the
      // outgoing thins out — a spectral bridge for key clashes / tempo gaps.
      try {
        if (inD.colorWet && inD.colorHPF) {
          inD.colorWet.gain.setTargetAtTime(1, t0, 0.05);
          inD.colorHPF.frequency.setValueAtTime(700, t0);
          inD.colorHPF.frequency.linearRampToValueAtTime(20, t0 + fadeSec * 0.8);
        }
        if (outD.colorWet && outD.colorHPF) {
          outD.colorWet.gain.setTargetAtTime(1, t0 + fadeSec * 0.5, 0.1);
          outD.colorHPF.frequency.setValueAtTime(20, t0 + fadeSec * 0.5);
          outD.colorHPF.frequency.linearRampToValueAtTime(650, tEnd);
        }
      } catch {}
    } else if (autoDj.style === 'echo') {
      // THE ECHO OUT: a beat-synced wash on the exit, quick fade, clean start
      // on the downbeat — no beatmatching needed across genre jumps.
      setFx('echo'); setFxParam('frac', 1); setFxParam('depth', 0.6); setFxOn(true);
      // t114: THE BEAT ROLL — the outgoing's final beat loops a one-beat roll
      // under the echo wash (the hip-hop exit). Released at handback.
      if (autoDj.rollTimer) { clearTimeout(autoDj.rollTimer); autoDj.rollTimer = null; }
      autoDj.rollTimer = setTimeout(() => {
        if (!autoDj.on || !autoDj.transition || autoDj.transition.style !== 'echo') return;
        try { const el = outD.el; if (el && !el.paused) { const spb = beatSecSafe(outD); outD.loop = { in: Math.max(0, el.currentTime - spb), out: el.currentTime, active: true, beats: 1 }; } } catch {}
      }, Math.max(0, fadeSec * 0.5 * 1000));
    }
  }
  function setAutoDj(on, queue) {
    autoDj.on = !!on;
    if (Array.isArray(queue)) { autoDj.queue = queue.filter(Boolean); autoDj.idx = 0; }   // t115: a PASSED queue always starts fresh (resume = pass nothing)
    if (autoDj.on) {
      ensureGraph();
      const playing = decks.findIndex(d => d.el && !d.el.paused && d.el.src && d.item);
      if (playing >= 0) autoDj.current = playing;
      if (!autoDj.timer) autoDj.timer = setInterval(autoDjTick, 400);   // t111: interval — hidden tabs still mix
      autoDjTick();
    } else {
      if (autoDj.timer) { clearInterval(autoDj.timer); autoDj.timer = null; }
      if (autoDj.swapTimer) { clearTimeout(autoDj.swapTimer); autoDj.swapTimer = null; }   // t112: no late bass cuts after an off-switch
      if (autoDj.rollTimer) { clearTimeout(autoDj.rollTimer); autoDj.rollTimer = null; }   // t114: …and no late beat rolls
      if (autoDj.transition) {
        // t112: WALKAWAY TIDY — switched off mid-blend: bass knobs back, color
        // filters neutral, echo off. A pro never walks away leaving a deck
        // thin or washed out — neither do we (t111's dead-air drill caught this).
        const tr = autoDj.transition, now = actx.currentTime;
        for (const d2 of [decks[tr.from], decks[tr.to]]) {
          if (!d2) continue;
          try { d2.loop = { in: null, out: null, active: false, beats: 0 }; } catch {}   // t114: no stuck beat-rolls
          try { d2.setEq('bass', (d2 === decks[tr.to] ? tr.inBass : tr.fromBass) ?? 0); } catch {}
          try {
            if (d2.colorWet) d2.colorWet.gain.setTargetAtTime(0, now, 0.05);
            if (d2.colorHPF) d2.colorHPF.frequency.setTargetAtTime(20, now, 0.05);
          } catch {}
        }
        if (tr.style === 'echo') { try { setFxOn(false); setFx('off'); } catch {} }
        autoDj.transition = null;
        cancelFade();
      }
    }
    return { on: autoDj.on, queued: autoDj.queue.length };
  }
  const outD_gridReady = (tr) => !!(decks[tr.from] && decks[tr.from].gridReady);
  const inD_gridReady = (tr) => !!(decks[tr.to] && decks[tr.to].gridReady);
  function autoDjTick() {
    if (!autoDj.on) return;
    // t114: PRE-ANALYZE the queue — offline tempo/key/grid/peaks for the next
    // few tracks, one at a time in the background, so the transition has its
    // data the MOMENT it fires (this is what makes the beatmatch possible).
    if (autoDj.queue.length && !autoDj.preBusy) {
      const len2 = autoDj.queue.length, pos2 = Math.min(autoDj.idx, Math.max(0, len2 - 1));   // t115: finite — never re-analyze wrapped ghosts
      const nxt = [0, 1, 2].map(k => autoDj.queue[(pos2 + k) % len2]).find(t2 => t2 && t2.id && !_peaksCache.has(t2.id));
      if (nxt) { autoDj.preBusy = true; computePeaks(nxt).catch(() => null).finally(() => { autoDj.preBusy = false; }); }
    }
    const now = actx ? actx.currentTime : 0;
    if (autoDj.transition) {                    // a fade is running on the audio clock
      const tr = autoDj.transition;
      if (now >= tr.tEnd) {                     // done: crown the new deck, silence the old one
        try { decks[tr.from].el?.pause(); } catch {}
        // t112: leave the decks CLEAN — the outgoing's bass returns to what
        // it was, filters to neutral, the echo wash off. A pro tidies up.
        const od = decks[tr.from];
        try { od.setEq('bass', tr.fromBass ?? 0); } catch {}
        try { od.loop = { in: null, out: null, active: false, beats: 0 }; } catch {}   // t114: roll released
        if (autoDj.rollTimer) { clearTimeout(autoDj.rollTimer); autoDj.rollTimer = null; }
        try {
          if (od.colorWet) od.colorWet.gain.setTargetAtTime(0, now, 0.05);
          if (od.colorHPF) od.colorHPF.frequency.setTargetAtTime(20, now, 0.05);
        } catch {}
        const nd = decks[tr.to];               // the new live deck: its filter ramp ENDS neutral (20 Hz),
        try {                                  // so dropping the wet flag is inaudible — just tidy state
          if (nd && nd.colorWet) nd.colorWet.gain.setTargetAtTime(0, now, 0.05);
          if (nd && nd.colorHPF) nd.colorHPF.frequency.setTargetAtTime(20, now, 0.05);
        } catch {}
        if (tr.style === 'echo') { setFxOn(false); setFx('off'); }
        // t117: THE TEMPO SHED — the drift guard's nudge is a TRANSIENT
        // correction; at handback the surviving deck returns to the exact
        // matched rate. Without this, a held ±1.5% nudge entered the set
        // tempo and every later song inherited it — the tempo ratchet the
        // owner heard ("songs after go faster and keeps them faster").
        if (tr.matched) { try { decks[tr.to].setRate(tr.matched); } catch {} }
        autoDj.current = tr.to;
        autoDj.transition = null;
        xf.pos = tr.toXf; djpUi.xf = tr.toXf; applyXf();
      } else {
        // t112: DRIFT GUARD — two decks at "the same" tempo drift apart over
        // a long blend; a human nudges the jog wheel, we steer the rate a
        // hair toward phase-locked (key lock keeps the pitch).
        if (tr.style !== 'echo' && outD_gridReady(tr) && inD_gridReady(tr)) {
          const outD = decks[tr.from], inD = decks[tr.to];
          if (outD.bpm && inD.bpm && inD.el && outD.el) {
            const spbO = beatSecSafe(outD), spbI = beatSecSafe(inD);
            let e = ((inD.el.currentTime - (inD.grid0 || 0)) / spbI - (outD.el.currentTime - (outD.grid0 || 0)) / spbO) % 1;
            if (e > 0.5) e -= 1; if (e < -0.5) e += 1;   // phase error, in beats (±0.5)
            const matched = clamp(outD.bpm * outD.rate / inD.bpm, 0.5, 2);
            // t117: a big offset (≥0.35 beat) is a GRID misalignment, not
            // drift — re-anchor the grid instead of bending the tempo (the
            // old chase could hold a nudge forever). Small errors get a
            // gentler nudge (±0.8%), which the handback sheds anyway.
            if (Math.abs(e) >= 0.35) { try { inD.grid0 = (inD.grid0 || 0) + e * spbI; } catch {} inD.setRate(matched); }
            else if (Math.abs(e) > 0.06) inD.setRate(matched * (1 - clamp(e, -0.008, 0.008)));
            else if (Math.abs(e) < 0.02) inD.setRate(matched);
          }
        }
        // keep the UI slider roughly in step
        const k = clamp((now - tr.t0) / Math.max(0.001, tr.tEnd - tr.t0), 0, 1);
        xf.pos = tr.fromXf + (tr.toXf - tr.fromXf) * k; djpUi.xf = xf.pos;
      }
      return;
    }
    // t117: TEMPO RELAX — between blends, the live deck eases back toward
    // its NATURAL tempo (≤0.06% per second; key lock keeps the pitch, so
    // it's speed only). Beatmatching happens AT each blend, so nothing is
    // lost — but the set's tempo no longer rides whatever the fastest early
    // song demanded, and nothing compounds across the night.
    {
      const live = decks[autoDj.current];
      if (live?.el && !live.el.paused && isFinite(live.rate) && Math.abs(live.rate - 1) > 0.0015) {
        try { live.setRate(live.rate + Math.sign(1 - live.rate) * Math.min(Math.abs(1 - live.rate), 0.00025)); } catch {}
      }
    }
    const cur = audibleDeck();
    if (!cur) {                                 // EMERGENCY — never dead air
      if (autoDj.queue.length) loadNext(autoDj.current >= 0 ? 1 - autoDj.current : 0, null);
      return;
    }
    if (autoDj.queue.length && isFinite(cur.el.duration) && cur.el.duration > 0) {
      // t112: the countdown uses the last AUDIBLE moment, not the file
      // duration — outro silence is dead time nobody wants in the mix
      const effEnd = audibleExtent(cur)?.tailEnd ?? cur.el.duration;
      const spb = beatSecSafe(cur);
      const remainB = (effEnd - cur.el.currentTime) / spb;
      const leadB = autoDj.leadBeats + 6;       // runway: a 16-beat blend + alignment slop
      if (remainB < leadB) {
        // t112: PHRASE ALIGNMENT — fire ON the beat grid: a 32-beat phrase
        // line if one fits, else the next 8-beat bar line, else now. Never
        // mid-bar when avoidable — that's how a human times it.
        const nowB = (cur.el.currentTime - (cur.grid0 || 0)) / spb;
        const nextLine = (mod) => { const b = Math.ceil((nowB + 0.4) / mod) * mod; return b - nowB; };
        const p32 = nextLine(32), p8 = nextLine(8);
        if (p32 > 0.75 && p32 < remainB - 2) return;      // hold for the phrase line
        if (p8 > 0.75 && p8 < remainB - 1) return;        // hold for the bar line
        loadNext(1 - cur.id, cur);
        return;
      }
    }
  }

  function getLevels() {
    if (!masterAnalyser) return { bass: 0, mid: 0, treble: 0, energy: 0, live: false };
    const nowMs = performance.now();                  // t111: one FFT read per frame max
    if (_lvCache && nowMs - _lvAt < 8) return _lvCache;
    masterAnalyser.getByteFrequencyData(freq);
    const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += freq[i]; return s / ((b - a) * 255); };
    const bass = avg(0, 3), mid = avg(3, 26), treble = avg(26, 96);
    const live = decks.some(d => d.el && !d.el.paused && d.el.src);
    _lvCache = { bass, mid, treble, energy: (bass * 1.4 + mid + treble * 0.7) / 3, live };
    _lvAt = nowMs;
    return _lvCache;
  }

  function playItem(item) {                            // record spin / API entry
    const dk = decks.find(d => !d.el || d.el.paused) || decks[0];
    ensureGraph(); if (!dk.graphed) dk.buildGraph();
    return dk.load(item);
  }

  // t113: incremental list loading — chunk size + hard DOM ceiling
  const LIST_CHUNK = 150, LIST_CEIL = 3000;
  // ═══════════════════════ THE PANEL (mounted by ui.js) ══════════════════════
  function mount(container, { items = [], onClose, dance, setDance } = {}) {
    mounted = true;
    mode = localStorage.getItem('hb_djpro_mode') || 'beginner';
    container.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = `
      .djp{display:flex;flex-direction:column;gap:6px;font-family:system-ui;
        /* t119: THE BOOTH FOLLOWS THE THEME — the panel used to be locked to a
           hardcoded neon-blue/pink palette while the rest of the store recolored.
           Every surface now derives from the app theme vars (set by main.js
           themeVars on every theme change), so the whole rig recolors live:
           surfaces from the wall, text from the ink, controls from the accent.
           Deck A wears the accent's light tint, deck B the full accent.
           (Data read-outs keep their meaning colors: the LO/MID/HI meter trio
           and the Camelot green are the same language as the laptop HUD.) */
        color:var(--vb-ink,#dfe6ff);
        --djp-acc:var(--vb-accent,#ff2a85);
        --djp-acc2:var(--vb-accent-soft,#ff7cc0);
        --djp-mut:var(--vb-muted,#8fa0d8);
        --djp-panel:color-mix(in srgb,var(--vb-blue-deep,#06081d) 86%,transparent);
        --djp-line:color-mix(in srgb,var(--vb-ink,#dfe6ff) 15%,transparent);
        --djp-line2:color-mix(in srgb,var(--vb-ink,#dfe6ff) 24%,transparent);
        --djp-hov:color-mix(in srgb,var(--vb-accent,#ff2a85) 45%,transparent);
        --djp-deep:color-mix(in srgb,var(--vb-blue-deep,#06081d) 78%,#000);
        --djp-onbg:color-mix(in srgb,var(--vb-accent,#ff2a85) 14%,var(--vb-blue-deep,#06081d));
        --djp-glass:color-mix(in srgb,var(--vb-blue-deep,#06081d) 94%,transparent)}
      .djp *{box-sizing:border-box}
      /* t108: obsidian glassmorphism — blur 16, near-black panels, neon accents */
      .djp-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .djp-decks{display:flex;gap:8px;align-items:stretch}
      .djp-deck{flex:1;border:1px solid;border-radius:12px;padding:8px;background:var(--djp-panel);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);min-width:0}
      .djp-deck.a{border-color:color-mix(in srgb,var(--djp-acc2) 40%,transparent);box-shadow:0 0 14px color-mix(in srgb,var(--djp-acc2) 18%,transparent) inset}
      .djp-deck.b{border-color:color-mix(in srgb,var(--djp-acc) 40%,transparent);box-shadow:0 0 14px color-mix(in srgb,var(--djp-acc) 18%,transparent) inset}
      .djp-deck.active{box-shadow:0 0 24px color-mix(in srgb,var(--djp-acc2) 35%,transparent),0 0 24px rgba(255,42,133,0)}
      .djp-deck.b.active{box-shadow:0 0 24px color-mix(in srgb,var(--djp-acc) 35%,transparent)}
      .djp-title{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .djp-wave{width:100%;height:56px;background:var(--djp-deep);border-radius:6px;display:block}
      .djp-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px}
      .djp-btn{background:var(--djp-panel);border:1px solid var(--djp-line);color:var(--vb-ink,#dfe6ff);border-radius:6px;padding:5px 9px;cursor:pointer;font-size:12px}
      .djp-btn:hover{border-color:var(--djp-hov)}
      .djp-btn.on{background:var(--djp-onbg);border-color:currentColor}
      .djp-deck.a .djp-btn.on{color:var(--djp-acc2)}.djp-deck.b .djp-btn.on{color:var(--djp-acc)}
      .djp-btn.rec-on{color:var(--djp-acc);border-color:var(--djp-acc);animation:djpblink 1s infinite}
      @keyframes djpblink{50%{opacity:.45}}
      .djp-pad{min-width:42px}
      .djp-sld{display:flex;align-items:center;gap:6px;font-size:11px;margin-top:2px}
      .djp-sld input{flex:1;min-width:0}
      .djp-sld select,.djp-top select{background:var(--djp-panel);border:1px solid var(--djp-line);color:var(--vb-ink,#dfe6ff);border-radius:6px;padding:4px 6px;font-size:11px}
      .djp-mid{display:flex;flex-direction:column;gap:6px;justify-content:center;min-width:230px}
      .djp-xf{writing-mode:vertical-lr;direction:rtl;height:120px}
      .djp-assign{display:flex;flex-direction:column;gap:4px;font-size:10px}
      .djp-assign-row{display:flex;gap:4px;align-items:center;justify-content:center}
      .djp-fx{border:1px solid var(--djp-line);border-radius:10px;padding:6px;background:var(--djp-panel)}
      .djp-fx .djp-sld,.djp-fx .djp-row{margin-top:2px}
      .djp-assign{gap:2px}
      .djp-fx-title{font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--djp-acc);margin-bottom:4px}
      .djp-platter-row{display:flex;gap:10px;align-items:flex-start}
      .djp-platter{width:84px;height:84px;border-radius:50%;flex:0 0 auto;cursor:grab;background:radial-gradient(circle,color-mix(in srgb,var(--vb-blue-deep,#06081d) 88%,#fff 3%) 60%,var(--djp-deep) 100%);border:1px solid var(--djp-line);position:relative;touch-action:none}
      .djp-vinyl{position:absolute;inset:6px;border-radius:50%;background:var(--djp-deep) center/cover;transition:none}
      .djp-vinyl-art{position:absolute;inset:26%;border-radius:50%;background:var(--djp-deep) center/cover;box-shadow:0 0 0 1px #ffffff22}
      .djp-vinyl-dot{position:absolute;left:50%;top:4px;width:5px;height:14px;margin-left:-2px;border-radius:3px;background:var(--djp-acc2)}
      .djp-deck.b .djp-vinyl-dot{background:var(--djp-acc)}
      .djp-lights{display:flex;gap:6px;align-items:center;flex-wrap:wrap;border:1px solid var(--djp-line);border-radius:8px;padding:2px 8px;background:var(--djp-panel);font-size:11px}
      .djp-lights>b{letter-spacing:.1em;color:var(--djp-acc);font-size:10px}
      .djp-lights>span{color:var(--djp-mut)}
      .djp-lights input[type="range"]{flex:1 1 70px;min-width:60px}
      .djp-lights b:not(:first-of-type){min-width:30px;text-align:right}
      .djp-lights select{background:var(--djp-panel);border:1px solid var(--djp-line);color:var(--vb-ink,#dfe6ff);border-radius:6px;padding:2px 4px;font-size:11px}
      .djp-list{flex:1 1 auto;min-height:64px;overflow-y:auto;overflow-x:hidden;border:1px solid var(--djp-line);border-radius:8px;background:var(--djp-panel);backdrop-filter:blur(16px)}   /* t67: the ONLY thing that scrolls */
      .djp-rowitem{display:flex;gap:8px;padding:5px 8px;font-size:12px;border-bottom:1px solid var(--djp-line);cursor:pointer;align-items:center}
      .djp-rowitem:hover{background:color-mix(in srgb,var(--vb-ink,#dfe6ff) 7%,transparent)}
      .djp-rowitem.harmonic{box-shadow:inset 3px 0 0 #00ff66;background:rgba(0,255,102,.05)}   /* t108: Camelot glow — semantic green, same as the laptop HUD */
      .djp-rowitem.harmonic .djp-meta{color:#00ff66}
      .djp-meta{color:var(--djp-mut);min-width:44px;text-align:right}
      .djp-hint{font-size:11px;color:var(--djp-mut)}
      .djp-help{position:absolute;inset:0;background:var(--djp-glass);border-radius:10px;padding:18px;overflow:auto;z-index:5}
      .djp-kbd{background:var(--djp-onbg);border:1px solid var(--djp-line2);border-radius:4px;padding:1px 6px;font-family:monospace}
      .djp-pro{display:none}.djp.pro .djp-pro{display:flex}
      /* t108: COMPACT MODE — below 1100px (the bench, small laptops) the rig
         squeezes: platter + beat-FX/assign panels fold away (still in the DOM),
         buttons shrink, waveform slims. The owner's 2560-wide rig is untouched. */
      @media (max-width:1100px){
        .djp .djp-platter,.djp .djp-fx,.djp .djp-assign,.djp [data-act="slip"],.djp [data-act="doubles"],
        .djp [data-act="nudge-"],.djp [data-act="nudge+"],.djp [data-pitchrange],.djp [data-colormode]{display:none!important}
        .djp-btn{padding:3px 5px;font-size:10px}
        .djp-pad{min-width:26px}
        .djp-wave{height:36px}
        .djp-sld{margin-top:1px;font-size:10px}
        .djp-sld select{padding:2px 3px;font-size:10px}
        .djp-deck{padding:6px}
        .djp-mid{min-width:120px}
        .djp-xf{height:110px}
        .djp-decks{gap:6px}.djp{gap:6px}
      }`;
    container.appendChild(style);
    const root = document.createElement('div');
    root.className = 'djp' + (mode === 'pro' ? ' pro' : '');
    container.appendChild(root);

    const deckEls = [];
    autoDj.onDone = () => toastIt('AUTO-DJ · set complete — the queue is empty');   // t115: finite set, said out loud
    const toastIt = (msg) => {                    // t108: tiny in-panel toast (no page deps)
      const t = document.createElement('div');
      t.textContent = '✓' + msg;
      t.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);bottom:8px;background:color-mix(in srgb,var(--vb-blue-deep,#06081d) 92%,transparent);color:#00ff66;border:1px solid #00ff6644;border-radius:6px;padding:4px 10px;font-size:11px;z-index:5;pointer-events:none;transition:opacity .4s';   // t119: panel surface follows the theme; green = "ok" (same language as the HUD)
      root.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, 1600);
    };
    root.innerHTML = `
      <div class="djp-top">
        <b style="letter-spacing:.12em">🎛️ DJ BOOTH — PRO RIG</b>
        <canvas id="djp-vu" width="88" height="14" title="Master VU"></canvas>
        <button class="djp-btn" id="djp-autodj" title="Continuous mix — auto-loads the next track on the other deck, beat-matches it, and rides the crossfade">🤖 AUTO-DJ: OFF</button>
        <button class="djp-btn" id="djp-rec" title="Record the master output to a file">● REC</button>
        <span class="djp-meta" id="djp-rectime">00:00</span>
        <button class="djp-btn" id="djp-mode" title="Switch Beginner / Pro">👤 Beginner</button>
        <button class="djp-btn" id="djp-help" title="Keyboard shortcuts">⌨️ Shortcuts</button>
        <button class="djp-btn" id="djp-save" title="Save this session">💾 Save set</button>
        <button class="djp-btn" id="djp-load" title="Load last saved session">📂 Load set</button>
        <button class="djp-btn" id="djp-demo" title="First-run walkthrough">🧭 Demo</button>
      </div>
      <div class="djp-decks">
        ${[0, 1].map(i => `
        <div class="djp-deck ${i ? 'b' : 'a'}" data-deck="${i}">
          <div class="djp-title">DECK ${i ? 'B' : 'A'} — <span data-slot="title">empty</span></div>
          <canvas class="djp-wave" data-slot="wave" width="420" height="64" title="3-band waveform — red bass · green mids · blue highs. Click to seek."></canvas>
          <div class="djp-platter-row">
            <div class="djp-platter" data-slot="platter" title="The platter — drag sideways to scrub (slip keeps your place)">
              <div class="djp-vinyl" data-slot="vinyl"><div class="djp-vinyl-art"></div><div class="djp-vinyl-dot"></div></div>
            </div>
            <div style="flex:1;min-width:0">
              <div class="djp-row">
                <button class="djp-btn" data-act="play" title="Play / pause this deck">▶</button>
                <button class="djp-btn" data-act="load" title="Load the selected playlist track here">⬇ Load</button>
                <button class="djp-btn" data-act="sync" title="Match tempo & phase to the other deck">⟲ Sync</button>
                <button class="djp-btn" data-act="keylock" title="Key lock — keep pitch when tempo changes">🔑 Lock</button>
                <button class="djp-btn" data-act="slip" title="Slip mode — scrub and loop while the silent timeline keeps running">🪐 Slip</button>
                <button class="djp-btn" data-act="doubles" title="Instant doubles — clone this deck onto the other one">⧉ Doubles</button>
                <span class="djp-meta" data-slot="bpm" title="Detected BPM">— BPM</span>
                <span class="djp-meta" data-slot="key" title="Detected key (Camelot)">—</span>
              </div>
              <div class="djp-row djp-pro" data-cues>
                ${Array.from({ length: 8 }, (_, n) => `<button class="djp-btn djp-pad" data-act="cue${n}" title="Hot cue ${n + 1} — sets at the playhead, clicks jump">■ C${n + 1}</button>`).join('')}
              </div>
              <div class="djp-row djp-pro" data-loops>
                ${[0.5, 1, 2, 4, 8, 16, 32].map(b => `<button class="djp-btn" data-act="loop${b}" title="Auto-loop ${b} beat${b > 1 ? 's' : ''}, snapped to the beat grid">↻${b}</button>`).join('')}
                <button class="djp-btn" data-act="loopclear" title="Clear the loop">✕ loop</button>
                <button class="djp-btn" data-act="jb-" title="Beat jump back">≪</button>
                <button class="djp-btn" data-act="jb+" title="Beat jump forward">≫</button>
                <button class="djp-btn" data-act="nudge-" title="Pitch-bend back (hold)">◀◀</button>
                <button class="djp-btn" data-act="nudge+" title="Pitch-bend forward (hold)">▶▶</button>
              </div>
              <div class="djp-sld djp-pro"><span style="width:42px">pitch</span>
                <input type="range" min="0" max="1000" step="1" value="500" data-pitch title="The pitch fader — range set beside it; key lock keeps the pitch">
                <b data-pitchv>+0.0%</b>
                <select data-pitchrange title="Pitch fader range">
                  <option value="6">±6%</option><option value="8" selected>±8%</option><option value="10">±10%</option>
                  <option value="16">±16%</option><option value="50">WIDE</option>
                </select></div>
            </div>
          </div>
          ${['bass', 'mid', 'treble'].map(b => `
          <div class="djp-sld"><span style="width:34px">${b}</span>
            <input type="range" min="-40" max="12" step="1" value="0" data-eq="${b}" title="Isolator ${b} — full left = KILL (-40 dB)">
            <b data-eqv="${b}">0dB</b></div>`).join('')}
          <div class="djp-sld djp-pro"><span style="width:34px">color</span>
            <input type="range" min="0" max="1" step="0.01" value="0.5" data-color title="Sound color FX — center = bypass · left = filter down (dub delay in dub mode) · right = filter up">
            <b data-colorv>—</b>
            <select data-colormode title="What the color knob does">
              <option value="filter" selected>filter</option><option value="dub">dub delay</option>
            </select></div>
          <div class="djp-sld"><span style="width:34px">trim</span>
            <input type="range" min="0" max="4" step="0.05" value="1" data-trim title="Gain / trim — 0 to +12 dB (×4)">
            <b data-trimv>1.00</b></div>
          <div class="djp-sld"><span style="width:34px">vol</span>
            <input type="range" min="0" max="1" step="0.05" value="1" data-fader title="Channel fader">
            <b data-faderv>1.00</b></div>
          <div class="djp-sld djp-pro"><span style="width:34px">tempo</span>
            <input type="range" min="0.5" max="1.5" step="0.01" value="1" data-rate title="Tempo (rate) — the pitch fader above drives this in %">
            <b data-ratev>1.00×</b></div>
        </div>`).join('')}
        <div class="djp-mid">
          <div class="djp-sld" style="flex-direction:column;align-items:center">
            <b>A</b><input type="range" class="djp-xf" id="djp-xf" min="0" max="1" step="0.01" value="0.5" title="Crossfader — center detent snaps at 0.5">
            <b>B</b></div>
          <div class="djp-assign" title="Where each channel lives on the crossfader">
            <div class="djp-assign-row"><b>A</b>
              <button class="djp-btn" data-assign="a" data-deck="0">◄</button>
              <button class="djp-btn" data-assign="thru" data-deck="0">THRU</button>
              <button class="djp-btn" data-assign="b" data-deck="0">►</button></div>
            <div class="djp-assign-row"><b>B</b>
              <button class="djp-btn" data-assign="a" data-deck="1">◄</button>
              <button class="djp-btn" data-assign="thru" data-deck="1">THRU</button>
              <button class="djp-btn" data-assign="b" data-deck="1">►</button></div>
          </div>
          <div class="djp-sld"><span>curve</span>
            <input type="range" id="djp-curve" min="0" max="1" step="0.05" value="0.5" title="0 = razor-sharp battle cut · 1 = smooth constant-power mix">
            <b id="djp-xfgain">A 71% B 71%</b></div>
          <div class="djp-sld"><span>master</span>
            <input type="range" id="djp-master" min="0" max="1" step="0.05" value="0.8" title="Master volume (post-limiter ceiling)">
            <b id="djp-masterv">0.80</b></div>
          <div class="djp-sld djp-pro"><span>booth</span>
            <input type="range" id="djp-booth" min="0" max="1" step="0.05" value="0" title="Booth monitor volume (extra tap)">
            <b id="djp-boothv">off</b></div>
          <div class="djp-fx djp-pro">
            <div class="djp-fx-title">⚡ BEAT FX</div>
            <div class="djp-row">
              <select id="djp-fx-sel" title="The effect">
                <option value="off">off</option><option value="echo">echo</option>
                <option value="reverb">reverb</option><option value="flanger">flanger</option>
                <option value="stutter">stutter</option>
              </select>
              <select id="djp-fx-frac" title="Beat fraction — echo time & brake length">
                <option value="0.25">1/4</option><option value="0.5">1/2</option>
                <option value="1" selected>1 beat</option><option value="2">2</option><option value="4">4</option>
              </select>
            </div>
            <div class="djp-sld"><span>depth</span>
              <input type="range" id="djp-fx-depth" min="0" max="1" step="0.05" value="0.5" title="Wet / dry depth">
              <b id="djp-fx-on" style="min-width:44px;text-align:center">OFF</b></div>
            <div class="djp-row">
              <button class="djp-btn" id="djp-fx-paddle" title="Latch ON (click) or hold for a burst">PADDLE</button>
              <button class="djp-btn" id="djp-fx-brake" title="Vinyl brake — the track winds down over the beat fraction">🛑 Brake</button>
            </div>
          </div>
          <div class="djp-sld djp-pro"><span>mic</span>
            <button class="djp-btn" id="djp-mic" title="Live mic — voice ducks the music automatically">🎤 OFF</button>
            <select id="djp-mic-duck" title="How deep the music dips when you speak">
              <option value="-12" selected>-12 dB</option><option value="-24">-24 dB</option>
            </select></div>
        </div>
      </div>
      <div class="djp-lights" title="The rig wakes when the dance hall's music plays and locks to the beat — you shape how the lights MOVE (the music drives brightness)">
        <b>💡 FLOOR LIGHTS</b>
        <span>move</span><input type="range" id="dance-int" min="0.2" max="3" step="0.1"><b id="dance-int-v"></b>
        <span>speed</span><input type="range" id="dance-spd" min="0.3" max="3" step="0.1"><b id="dance-spd-v"></b>
        <span title="How wide the shapes are — circle diameter, arc width">sweep</span><input type="range" id="dance-sweep" min="0.2" max="2.5" step="0.1"><b id="dance-sweep-v"></b>
        <span title="How staggered the four heads are — 0 = lockstep, 1 = full ripple">spread</span><input type="range" id="dance-spread" min="0" max="1" step="0.05"><b id="dance-spread-v"></b>
        <select id="dance-pattern" title="Program">
          <option value="auto">Auto</option><option value="0">Laser sweep</option><option value="1">Chase</option>
          <option value="2">Strobe hits</option><option value="3">Build &amp; drop</option>
          <option value="4">Orbit cones</option><option value="5">Beat jump</option>
          <option value="6">Circle</option><option value="7">Figure-8</option><option value="8">Breath</option>
          <option value="9">Stadium arc</option><option value="10">Fan</option><option value="11">Snake</option>
          <option value="12">All-eyes</option>
          <option value="13">Scissor cross</option><option value="14">Vortex cyclone</option>
          <option value="15">Diagonal X</option><option value="16">Wave chase</option>
          <option value="17">Ground sweep</option><option value="18">Drop explode</option>
        </select>
      </div>
      <div class="djp-row">
        <button class="djp-btn" id="djp-tab-lib">📚 Library</button>
        <button class="djp-btn" id="djp-tab-crate" title="Your staging crate — tracks parked for later">🏷️ Staging (0)</button>
        <input id="djp-search" placeholder="Search title / BPM / key…" style="flex:1;background:var(--djp-deep);border:1px solid var(--djp-line);color:var(--vb-ink,#dfe6ff);border-radius:6px;padding:6px 8px" title="Filter the playlist">
        <select id="djp-fkey" title="Camelot key filter"><option value="">Key: All</option></select>
        <input id="djp-fbpm1" type="number" min="60" max="200" placeholder="BPM ≥" style="width:60px;padding:3px 4px" title="BPM range — low end">
        <input id="djp-fbpm2" type="number" min="60" max="200" placeholder="BPM ≤" style="width:60px;padding:3px 4px" title="BPM range — high end">
      </div>
      <div class="djp-list" id="djp-list"></div>
      <div class="djp-hint">Green rows mix with the playing deck · <b>A</b>/<b>B</b> load · <b>Q</b> → AUTO-DJ · <b>🏷️</b> staging.</div>`;

    const listEl = root.querySelector('#djp-list');
    try { meta = Object.assign(JSON.parse(localStorage.getItem('hb_djpro_meta') || '{}'), meta); } catch { meta = {}; }   // t114: merge — fresh analyses done before mount survive
    let selIdx = -1, sortKey = 'title', sortDir = 1, listTab = 'lib';
    // t113: LOAD-WHILE-YOU-SCROLL (owner: "i want it to load while it scrolls.
    // Someone may not remember all the songs they have.") — the list starts
    // with one chunk and grows as you scroll, instead of the old hard 250-row
    // cap. The DOM stays bounded by LIST_CEIL; past that, search narrows.
    let listLimit = LIST_CHUNK, listTotal = 0, listRowsCache = [];
    const resetList = () => { listLimit = LIST_CHUNK; renderList(); };   // a new view (search/filter/tab) starts fresh
    const crate = JSON.parse(localStorage.getItem('hb_djpro_crate') || '[]');   // t108: PREPARE CRATE
    const saveCrate = () => localStorage.setItem('hb_djpro_crate', JSON.stringify(crate));
    const CAMELOT_OK = (a, b) => {             // t108: harmonic compatibility (Camelot wheel)
      if (!a || !b) return false;
      const na = parseInt(a, 10), nb = parseInt(b, 10), la = a.slice(-1), lb = b.slice(-1);
      return (na === nb) || (na === nb - 1) || (na === nb + 1 && la === lb) || (la !== lb && na === nb);
    };
    function renderList() {
      const q = (root.querySelector('#djp-search').value || '').toLowerCase();
      const fk = root.querySelector('#djp-fkey')?.value || '';
      const b1 = parseFloat(root.querySelector('#djp-fbpm1')?.value) || 0;
      const b2 = parseFloat(root.querySelector('#djp-fbpm2')?.value) || 999;
      let rows = items.map((it, i) => ({ it, i })).filter(({ it }) => !q || (it.title || '').toLowerCase().includes(q));
      if (listTab === 'crate') rows = crate.map(id => items.find(x => x.id === id)).filter(Boolean).map(it => ({ it, i: items.indexOf(it) }));
      rows = rows.filter(({ it }) => {
        const m = meta[it.id] || {};
        if (fk && m.key !== fk) return false;
        if (m.bpm && (m.bpm < b1 || m.bpm > b2)) return false;
        return true;
      });
      rows.sort((x, y) => {
        const a = x.it.title || '', b = y.it.title || '';
        return a.localeCompare(b) * sortDir;
      });
      listTotal = rows.length;                          // t113: what the scroll loader appends toward
      listRowsCache = rows;
      const shown = Math.min(rows.length, listLimit, LIST_CEIL);   // t113: one chunk first — the rest loads as you scroll
      // key filter options from known metadata
      const fkSel = root.querySelector('#djp-fkey');
      if (fkSel) {
        const keys = [...new Set(items.map(it => (meta[it.id] || {}).key).filter(Boolean))].sort();
        const cur = fkSel.value;
        fkSel.innerHTML = '<option value="">Key: All</option>' + keys.map(k => `<option value="${k}">${k}</option>`).join('');
        fkSel.value = keys.includes(cur) ? cur : '';
      }
      root.querySelector('#djp-tab-crate').textContent = `🏷️ Staging (${crate.length})`;
      listEl.innerHTML = '';
      renderRows(0, shown);
      setMoreNote();
      wireListRows();
    }
    function renderRows(from, to) {                  // t113: the row factory — full renders and scroll appends share it
      const actKey = decks[activeDeck].key?.camelot || null;
      listEl.insertAdjacentHTML('beforeend', listRowsCache.slice(from, to).map(({ it, i }) => {
        const m = meta[it.id] || {};
        const harm = CAMELOT_OK(actKey, m.key);
        const staged = crate.includes(it.id);
        return `<div class="djp-rowitem ${harm ? 'harmonic' : ''}" data-i="${i}">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.title || 'untitled'}</span>
          <span class="djp-meta">${m.bpm ? Math.round(m.bpm) + ' BPM' : '—'}</span>
          <span class="djp-meta">${m.key || '—'}</span>
          <button class="djp-btn" data-loada="${i}" title="Load onto DECK A">A</button>
          <button class="djp-btn" data-loadb="${i}" title="Load onto DECK B">B</button>
          <button class="djp-btn" data-queue="${i}" title="Feed AUTO-DJ's queue">Q</button>
          <button class="djp-btn ${staged ? 'on' : ''}" data-stage="${i}" title="Park in the staging crate">🏷️</button>
          <button class="djp-btn" data-load="${i}" title="Load onto the deck this panel has selected">⬇</button>
        </div>`;
      }).join(''));
    }
    function setMoreNote() {                         // t113: the "more" footer — count live, gone when all loaded
      const note = listEl.querySelector('#djp-more');
      if (note) note.remove();
      if (listTotal <= listLimit) return;                                   // everything's on screen
      if (listLimit >= LIST_CEIL)                                           // DOM ceiling — search narrows from here
        listEl.insertAdjacentHTML('beforeend', `<div class="djp-rowitem" style="opacity:.6;cursor:default">… ${listTotal - listLimit} more — keep typing to narrow</div>`);
      else {
        listEl.insertAdjacentHTML('beforeend', `<div class="djp-rowitem" id="djp-more" style="opacity:.6;cursor:default">… ${listTotal - listLimit} more — scroll to load</div>`);
      }
    }
    function wireListRows() {
      const wire = (attr, fn) => listEl.querySelectorAll(`[${attr}]`).forEach(b => b.onclick = (e) => { e.stopPropagation(); fn(Number(b.dataset.load || b.dataset.loada || b.dataset.loadb || b.dataset.queue || b.dataset.stage)); });
      wire('data-load', loadSel);
      wire('data-loada', (i) => loadSel(i, 0));
      wire('data-loadb', (i) => loadSel(i, 1));
      // t113: Q while AUTO-DJ runs appends to the LIVE queue — the laptop
      // count updates on the spot. It used to vanish into the staging list,
      // so the count stayed stuck at whatever it was when AUTO-DJ started
      // (the owner queued more and the booth kept saying "1 LEFT").
      wire('data-queue', (i) => {
        const it = items[i]; if (!it) return;
        const inQ = (a) => a.some(x => x.id === it.id);         // dedup by ID (objects change on library refresh)
        if (autoDj.on) {
          if (!inQ(autoDj.queue)) autoDj.queue.push(it);
          if (!inQ(autoQueue)) autoQueue.push(it);              // a restart re-queues the night's list
          toastIt(` queued for AUTO-DJ (${autoDj.queue.length} in list)`);
        } else if (!inQ(autoQueue)) { autoQueue.push(it); toastIt(` queued for AUTO-DJ (${autoQueue.length})`); }
      });
      wire('data-stage', (i) => { const it = items[i]; if (!it) return; const k = crate.indexOf(it.id); if (k >= 0) crate.splice(k, 1); else crate.push(it.id); saveCrate(); renderList(); });
      listEl.querySelectorAll('[data-i]').forEach(r => r.onclick = () => { selIdx = Number(r.dataset.i); paint(); });
    }
    listEl.addEventListener('scroll', () => {        // t113: near the bottom → append another chunk
      if (listLimit >= Math.min(listTotal, LIST_CEIL)) return;
      if (listEl.scrollTop + listEl.clientHeight < listEl.scrollHeight - 320) return;
      let guard = 0;
      while (guard++ < 8 && listLimit < Math.min(listTotal, LIST_CEIL)
        && listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 320) {
        const from = listLimit;
        listLimit = Math.min(from + LIST_CHUNK, listTotal, LIST_CEIL);
        listEl.querySelector('#djp-more')?.remove();            // rows land where the note was
        renderRows(from, listLimit);
        setMoreNote();
        wireListRows();
      }
    });
    function loadSel(i, deck) {
      const it = items[i]; if (!it) return;
      ensureGraph();
      const dk = decks[deck ?? activeDeck]; if (!dk.graphed) dk.buildGraph();
      dk.load(it);
      if (dk.peaks === null && !dk.peaksBusy) {           // t108: 3-band overview, computed once
        dk.peaksBusy = true;
        computePeaks(it).then(p => { dk.peaks = p; dk.peaksBusy = false; }).catch(() => { dk.peaksBusy = false; });
      }
      paint();
    }
    const autoQueue = [];                                  // t108: AUTO-DJ's feeding list
    root.querySelector('#djp-search').oninput = resetList;   // t113: a new view starts at the top, one chunk
    root.querySelector('#djp-fkey').onchange = resetList;
    root.querySelector('#djp-fbpm1').oninput = resetList;
    root.querySelector('#djp-fbpm2').oninput = resetList;
    root.querySelector('#djp-tab-lib').onclick = () => { listTab = 'lib'; resetList(); };
    // t108b: DANCE-FLOOR LIGHTS — the booth owns them now (moved out of the
    // jukebox menu per the owner). Prefs ride state.prefs.dance (server-side,
    // so they're remembered across reboots, not just reopens).
    {
      const D0 = dance || {};
      const D = { movement: D0.movement ?? D0.intensity ?? 1, speed: D0.speed ?? 1, pattern: D0.pattern ?? 'auto' };
      const wi = root.querySelector('#dance-int'), ws = root.querySelector('#dance-spd'), wp = root.querySelector('#dance-pattern');
      if (wi) { wi.value = D.movement; root.querySelector('#dance-int-v').textContent = D.movement + '×';
        wi.oninput = () => { root.querySelector('#dance-int-v').textContent = (+wi.value) + '×'; setDance?.({ movement: +wi.value }); }; }
      if (ws) { ws.value = D.speed; root.querySelector('#dance-spd-v').textContent = D.speed + '×';
        ws.oninput = () => { root.querySelector('#dance-spd-v').textContent = (+ws.value) + '×'; setDance?.({ speed: +ws.value }); }; }
      const wsw = root.querySelector('#dance-sweep'), wpr = root.querySelector('#dance-spread');
      if (wsw) { wsw.value = D0.sweep ?? 1; root.querySelector('#dance-sweep-v').textContent = (D0.sweep ?? 1) + '×';
        wsw.oninput = () => { root.querySelector('#dance-sweep-v').textContent = (+wsw.value) + '×'; setDance?.({ sweep: +wsw.value }); }; }
      if (wpr) { wpr.value = D0.spread ?? 0.5; root.querySelector('#dance-spread-v').textContent = Math.round((D0.spread ?? 0.5) * 100) + '%';
        wpr.oninput = () => { root.querySelector('#dance-spread-v').textContent = Math.round((+wpr.value) * 100) + '%'; setDance?.({ spread: +wpr.value }); }; }
      if (wp) { wp.value = String(D.pattern); wp.onchange = () => setDance?.({ pattern: wp.value }); }
    }
    root.querySelector('#djp-tab-crate').onclick = () => { listTab = 'crate'; resetList(); };

    // per-deck wiring
    root.querySelectorAll('.djp-deck').forEach(el => {
      const i = Number(el.dataset.deck), dk = decks[i];
      deckEls[i] = el;
      el.onclick = () => { activeDeck = i; paint(); };
      el.querySelector('[data-act="play"]').onclick = () => { ensureGraph(); if (!dk.graphed) dk.buildGraph(); dk.playPause(); };
      el.querySelector('[data-act="load"]').onclick = () => { if (selIdx >= 0) loadSel(selIdx); };
      el.querySelector('[data-act="sync"]').onclick = () => dk.syncTo(decks[1 - i]);
      el.querySelector('[data-act="keylock"]').onclick = () => { dk.setKeyLock(!dk.keyLock); paint(); };
      for (let n = 0; n < 8; n++) el.querySelector(`[data-act="cue${n}"]`).onclick = () => {
        if (dk.cues[n] == null) { if (dk.el) dk.cues[n] = dk.el.currentTime; } else dk.cue(n); paint();
      };
      for (const b of [0.5, 1, 2, 4, 8, 16, 32]) el.querySelector(`[data-act="loop${b}"]`).onclick = () => { dk.autoLoop(b); paint(); };
      el.querySelector('[data-act="slip"]').onclick = () => { dk.setSlip(!dk.slip.on); paint(); };
      el.querySelector('[data-act="doubles"]').onclick = () => { if (dk.doubles(decks[1 - i])) toastIt('Doubled ⧉'); paint(); };
      const hold = (sel, dir) => { const b = el.querySelector(sel);
        b.onpointerdown = () => dk.setNudge(dir); b.onpointerup = () => dk.setNudge(0); b.onpointerleave = () => dk.setNudge(0); };
      hold('[data-act="nudge-"]', -1); hold('[data-act="nudge+"]', 1);
      const pitchIn = el.querySelector('[data-pitch]'), pitchLab = el.querySelector('[data-pitchv]'), rangeSel = el.querySelector('[data-pitchrange]');
      const showPitch = () => { const v = dk.pitch; pitchLab.textContent = (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; };
      pitchIn.oninput = () => { dk.setPitch((pitchIn.value - 500) / 500 * dk.pitchRange); djpUi.pitch = dk.pitch; showPitch(); };
      rangeSel.onchange = () => { dk.setPitchRange(+rangeSel.value); dk.setPitch(dk.pitch); djpUi.pitchRange = dk.pitchRange; showPitch(); };
      djpUi.pitch = djpUi.pitch ?? 0; showPitch();
      const colorIn = el.querySelector('[data-color]'), colorLab = el.querySelector('[data-colorv]'), colorSel = el.querySelector('[data-colormode]');
      const showColor = () => { const v = dk.colorVal ?? 0.5; colorLab.textContent = Math.abs(v - 0.5) < 0.01 ? '—' : (v < 0.5 ? '▼' : '▲') + Math.round(Math.abs(v - 0.5) * 200) + '%'; };
      colorIn.oninput = () => { ensureGraph(); if (!dk.graphed) dk.buildGraph(); dk.setColor(colorIn.value); djpUi.color[i] = dk.colorVal; showColor(); };
      colorSel.onchange = () => { dk.colorMode = colorSel.value; djpUi.colorMode[i] = dk.colorMode; dk.setColor(dk.colorVal || 0.5); showColor(); };
      showColor();
      // platter drag = scrub (slip keeps the timeline if engaged)
      const pl = el.querySelector('[data-slot="platter"]');
      let dragging = false, lastX = 0;
      pl.onpointerdown = (e) => { dragging = true; lastX = e.clientX; pl.setPointerCapture(e.pointerId); };
      pl.onpointermove = (e) => { if (!dragging || !dk.el) return;
        const dx = e.clientX - lastX; lastX = e.clientX;
        dk.el.currentTime = Math.max(0, Math.min(dk.el.duration || 1e9, dk.el.currentTime + dx * 0.025));
      };
      pl.onpointerup = () => { dragging = false; };
      el.querySelector('[data-act="loopclear"]').onclick = () => { dk.clearLoop(); paint(); };
      el.querySelector('[data-act="jb-"]').onclick = () => dk.jumpBeats(-4);
      el.querySelector('[data-act="jb+"]').onclick = () => dk.jumpBeats(4);
      el.querySelectorAll('[data-eq]').forEach(s => s.oninput = () => {
        djpUi.eq[i][s.dataset.eq] = parseFloat(s.value);   // t105
        ensureGraph(); if (!dk.graphed) dk.buildGraph();
        dk.setEq(s.dataset.eq, parseFloat(s.value));
        el.querySelector(`[data-eqv="${s.dataset.eq}"]`).textContent = s.value + 'dB';
      });
      el.querySelector('[data-trim]').oninput = (e) => { const v = parseFloat(e.target.value); djpUi.trim[i] = v; if (dk.trim) dk.trim.gain.setTargetAtTime(v, actx.currentTime, 0.03); el.querySelector('[data-trimv]').textContent = v.toFixed(2); };
      el.querySelector('[data-fader]').oninput = (e) => { const v = parseFloat(e.target.value); djpUi.fader[i] = v; if (dk.fader) dk.fader.gain.setTargetAtTime(v, actx.currentTime, 0.03); el.querySelector('[data-faderv]').textContent = v.toFixed(2); };
      el.querySelector('[data-rate]').oninput = (e) => { dk.setRate(parseFloat(e.target.value)); djpUi.rate[i] = dk.rate; el.querySelector('[data-ratev]').textContent = dk.rate.toFixed(2) + '×'; };
    });

    const xfEl = root.querySelector('#djp-xf');
    xfEl.oninput = () => {
      xf.pos = parseFloat(xfEl.value);
      djpUi.xf = xf.pos;   // t105
      if (Math.abs(xf.pos - 0.5) < 0.03) { xf.pos = 0.5; xfEl.value = '0.5'; }   // center detent
      applyXf();
    };
    function applyXf() {                       // t108: delegate to the ENGINE's assign-aware version
      api.applyXf();
      const g = xfGains();                     // label still shows the raw curve shape
      const lbl = root.querySelector('#djp-xfgain');
      if (lbl) lbl.textContent = `A ${Math.round(g.a * 100)}% B ${Math.round(g.b * 100)}%`;
    }
    root.querySelector('#djp-curve').oninput = (e) => { xf.curve = parseFloat(e.target.value); djpUi.curve = xf.curve; applyXf(); };
    // t108: per-channel A / THRU / B crossfader assigns
    root.querySelectorAll('[data-assign]').forEach(b => b.onclick = () => {
      const dk = decks[Number(b.dataset.deck)];
      dk.xfAssign = b.dataset.assign; djpUi.xfAssign[Number(b.dataset.deck)] = dk.xfAssign;
      ensureGraph(); applyXf(); paint();
    });
    // t108: beat FX rack
    const fxSel = root.querySelector('#djp-fx-sel'), fxSel2 = root.querySelector('#djp-fx-frac');
    const fxDepth = root.querySelector('#djp-fx-depth'), fxOnLab = root.querySelector('#djp-fx-on');
    const paddle = root.querySelector('#djp-fx-paddle');
    fxSel.onchange = () => { api.setFx(fxSel.value); };
    fxSel2.onchange = () => { api.setFxParam('frac', fxSel2.value); };
    fxDepth.oninput = () => { api.setFxParam('depth', fxDepth.value); if (fx.on) api.setFxOn(true); };
    paddle.onclick = () => { api.setFxOn(!fx.on); paint(); };   // latch
    root.querySelector('#djp-fx-brake').onclick = () => api.brakeActive();
    // t108: mic
    const micBtn = root.querySelector('#djp-mic'), micDuck = root.querySelector('#djp-mic-duck');
    micBtn.onclick = async () => {
      const r = await api.enableMic(!mic.on, micDuck.value);
      if (r.error) { toastIt('mic blocked: ' + r.error); }
      paint();
    };
    micDuck.onchange = () => { if (mic.on) api.enableMic(true, micDuck.value); };
    // t108: session recorder — record, stop, download
    const recBtn = root.querySelector('#djp-rec'), recTime = root.querySelector('#djp-rectime');
    recBtn.onclick = async () => {
      if (!rec.on) { const r = api.startRec(); if (r.error) toastIt('rec: ' + r.error); }
      else { const r = await api.stopRec(); if (r.url) { const a = document.createElement('a'); a.href = r.url; a.download = 'hb-dj-set-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.webm'; a.click(); toastIt('saved ' + r.secs + 's'); } }
      paint();
    };
    // t108: AUTO-DJ toggle (queue fed from the list's Q buttons)
    root.querySelector('#djp-autodj').onclick = () => {
      if (!autoDj.on && !autoQueue.length && !crate.length) { toastIt('Queue some tracks first — the Q buttons'); return; }
      // t113: starting from the crate mirrors it into the staging list so the
      // night's list survives restarts (Q-adds while running append to both).
      if (!autoDj.on) {
        // copy FIRST — q may BE autoQueue, and wiping it before the loop
        // would empty the source (the aliasing bug the t113 test caught)
        const q = [...(autoQueue.length ? autoQueue : crate.map(id => items.find(x => x.id === id)).filter(Boolean))];
        const seen = new Set();
        autoQueue.length = 0;
        for (const it of q) if (it && !seen.has(it.id)) { seen.add(it.id); autoQueue.push(it); }
      }
      api.setAutoDj(!autoDj.on, autoDj.on ? undefined : autoQueue);   // t113: OFF keeps the engine's queue + position
      paint();
    };
    // t108: master VU meter
    const vuCtx = root.querySelector('#djp-vu').getContext('2d');
    root.querySelector('#djp-master').oninput = (e) => {
      const v = parseFloat(e.target.value); djpUi.master = v; if (masterGain) masterGain.gain.setTargetAtTime(v, actx.currentTime, 0.03);
      root.querySelector('#djp-masterv').textContent = v.toFixed(2);
    };
    root.querySelector('#djp-booth').oninput = (e) => {
      const v = parseFloat(e.target.value); djpUi.booth = v; if (boothGain) boothGain.gain.setTargetAtTime(v, actx.currentTime, 0.03);
      root.querySelector('#djp-boothv').textContent = v === 0 ? 'off' : v.toFixed(2);
    };

    // t105: restore every slider + label from the mirror — the panel was
    // just rebuilt with hardcoded defaults; your settings come back now.
    root.querySelectorAll('.djp-deck').forEach((el, i) => {
      for (const b of ['bass', 'mid', 'treble']) {
        const v = djpUi.eq[i][b];
        if (v !== undefined) { const inp = el.querySelector(`[data-eq="${b}"]`); if (inp) { inp.value = v; el.querySelector(`[data-eqv="${b}"]`).textContent = v + 'dB'; } }
      }
      const setPair = (sel, lab, v, fmt) => { if (v !== undefined) { const inp = el.querySelector(sel); if (inp) { inp.value = v; el.querySelector(lab).textContent = fmt(v); } } };
      setPair('[data-trim]', '[data-trimv]', djpUi.trim[i], v => v.toFixed(2));
      setPair('[data-fader]', '[data-faderv]', djpUi.fader[i], v => v.toFixed(2));
      setPair('[data-rate]', '[data-ratev]', djpUi.rate[i], v => v.toFixed(2) + '×');
      // t108: the overhaul's controls ride the same mirror — pitch fader,
      // range switch, color knob + mode, crossfader assigns
      const pin2 = el.querySelector('[data-pitch]'), pr2 = el.querySelector('[data-pitchrange]');
      const cin2 = el.querySelector('[data-color]'), cm2 = el.querySelector('[data-colormode]');
      if (pin2) pin2.value = String(500 + clamp(djpUi.pitch || 0, -(djpUi.pitchRange || 8), djpUi.pitchRange || 8) / (djpUi.pitchRange || 8) * 500);
      if (pr2 && djpUi.pitchRange) pr2.value = String(djpUi.pitchRange);
      if (cin2 && djpUi.color && djpUi.color[i] !== undefined) cin2.value = String(djpUi.color[i]);
      if (cm2 && djpUi.colorMode && djpUi.colorMode[i]) cm2.value = djpUi.colorMode[i];
      if (djpUi.xfAssign && djpUi.xfAssign[i]) decks[i].xfAssign = djpUi.xfAssign[i];
    });
    {
      const g = (id) => root.querySelector('#' + id);
      if (g('djp-xf') && djpUi.xf !== undefined) g('djp-xf').value = djpUi.xf;
      if (g('djp-curve') && djpUi.curve !== undefined) g('djp-curve').value = djpUi.curve;
      if (g('djp-master') && djpUi.master !== undefined) { g('djp-master').value = djpUi.master; g('djp-masterv').textContent = djpUi.master.toFixed(2); }
      if (g('djp-booth') && djpUi.booth !== undefined) { g('djp-booth').value = djpUi.booth; g('djp-boothv').textContent = djpUi.booth === 0 ? 'off' : djpUi.booth.toFixed(2); }
    }

    // toolbar
    const modeBtn = root.querySelector('#djp-mode');
    modeBtn.onclick = () => {
      mode = mode === 'pro' ? 'beginner' : 'pro';
      localStorage.setItem('hb_djpro_mode', mode);
      root.classList.toggle('pro', mode === 'pro');
      modeBtn.textContent = mode === 'pro' ? '🅿 Pro' : '👤 Beginner';
      paint();
    };
    if (mode === 'pro') { modeBtn.textContent = '🅿 Pro'; }
    root.querySelector('#djp-help').onclick = () => showHelp();
    root.querySelector('#djp-save').onclick = () => saveSession();
    root.querySelector('#djp-load').onclick = () => loadSession();
    root.querySelector('#djp-demo').onclick = () => demo();

    function showHelp() {
      const h = document.createElement('div');
      h.className = 'djp-help';
      h.innerHTML = `<b style="letter-spacing:.1em">⌨️ SHORTCUTS</b>
        <div style="margin-top:10px;line-height:2">
        <span class="djp-kbd">Space</span> play/pause the active deck · <span class="djp-kbd">A</span>/<span class="djp-kbd">B</span> pick deck<br>
        <span class="djp-kbd">1</span>–<span class="djp-kbd">4</span> hot cues · <span class="djp-kbd">L</span> toggle last loop · <span class="djp-kbd">X</span> clear loop<br>
        <span class="djp-kbd">←</span>/<span class="djp-kbd">→</span> beat jump · <span class="djp-kbd">[</span>/<span class="djp-kbd">]</span> nudge crossfader · <span class="djp-kbd">S</span> sync<br>
        <span class="djp-kbd">↑</span>/<span class="djp-kbd">↓</span> active deck channel fader</div>
        <button class="djp-btn" style="margin-top:12px" onclick="this.parentNode.remove()">Close</button>`;
      container.appendChild(h);
    }
    function demo() {
      const steps = [
        ['🎛️ 1/3 — Load', 'Pick a track in the list below, then click <b>⬇ Load</b> on DECK A.'],
        ['▶ 2/3 — Play', 'Hit <b>▶</b> on DECK A. BPM and key appear once the rig hears a few beats.'],
        ['🎚️ 3/3 — Crossfade', 'Load another track on DECK B, play it, then ride the <b>A—B crossfader</b>.']
      ];
      let n = 0;
      const box = document.createElement('div');
      box.className = 'djp-help';
      const draw = () => {
        box.innerHTML = `<b>${steps[n][0]}</b><div style="margin-top:8px">${steps[n][1]}</div>
          <button class="djp-btn" style="margin-top:12px" id="djp-next">${n < steps.length - 1 ? 'Next' : 'Done'}</button>`;
        container.appendChild(box);
        box.querySelector('#djp-next').onclick = () => { n++; n < steps.length ? draw() : box.remove(); };
      };
      draw();
    }
    function sessionData() {
      return { xf: xf.pos, curve: xf.curve,
        decks: decks.map(dk => ({ rate: dk.rate, pitch: dk.pitch, pitchRange: dk.pitchRange, keyLock: dk.keyLock,
          eq: dk.eqDb || { bass: 0, mid: 0, treble: 0 }, cues: dk.cues, loop: dk.loop, item: dk.item?.id || null,
          xfAssign: dk.xfAssign || null, colorMode: dk.colorMode || 'filter', colorVal: dk.colorVal ?? 0.5 })) };   // t108
    }
    function saveSession() {
      localStorage.setItem('hb_djpro_session', JSON.stringify(sessionData()));
      const it = items.find(x => x.id);   // remember BPM/keys for the list
      for (const dk of decks) if (dk.item && dk.bpm) meta[dk.item.id] = { bpm: dk.bpm, key: dk.key?.camelot };
      localStorage.setItem('hb_djpro_meta', JSON.stringify(meta));
      toastIt('Set saved 💾');
    }
    function loadSession() {
      const s = JSON.parse(localStorage.getItem('hb_djpro_session') || 'null');
      // t108: saved assigns / color ride again
      if (!s) return toastIt('No saved set yet', true);
      xf.pos = s.xf; xf.curve = s.curve;
      xfEl.value = String(s.xf); root.querySelector('#djp-curve').value = String(s.curve);
      s.decks?.forEach((sd, i) => {
        const dk = decks[i];
        dk.setKeyLock(sd.keyLock !== false);
        dk.cues = sd.cues || dk.cues;
        if (sd.pitchRange) dk.setPitchRange(sd.pitchRange);
        if (typeof sd.pitch === 'number') dk.setPitch(sd.pitch);
        // t118: RATE LAST — setPitch re-derives the rate from the fader, so
        // restoring rate before pitch snapped a synced/auto-matched deck back
        // to its fader tempo on every set reload (sync didn't survive the
        // save/load round-trip). Pitch first, then the rate the DJ heard.
        dk.setRate(sd.rate || 1);
        if (sd.xfAssign) { dk.xfAssign = sd.xfAssign; djpUi.xfAssign[i] = sd.xfAssign; }
        if (sd.colorMode) { dk.colorMode = sd.colorMode; djpUi.colorMode[i] = sd.colorMode; }
        if (typeof sd.colorVal === 'number') { djpUi.color[i] = sd.colorVal; }
        const it = items.find(x => x.id === sd.item);
        if (it) { ensureGraph(); if (!dk.graphed) dk.buildGraph(); dk.load(it); }
      });
      applyXf(); renderList(); toastIt('Set loaded 📂');
    }

    // keyboard
    const keyH = (e) => {
      if (!document.querySelector('.djp') || /input|select|textarea/i.test(e.target.tagName)) return;
      const dk = decks[activeDeck];
      if (e.code === 'Space') { e.preventDefault(); ensureGraph(); if (!dk.graphed) dk.buildGraph(); dk.playPause(); }
      else if (e.key === 'a' || e.key === 'A') activeDeck = 0;
      else if (e.key === 'b' || e.key === 'B') activeDeck = 1;
      else if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(e.key)) { const n = +e.key - 1; if (dk.cues[n] == null) { if (dk.el) dk.cues[n] = dk.el.currentTime; } else dk.cue(n); }
      else if (e.key === 'l' || e.key === 'L') { dk.loop.beats ? dk.autoLoop(dk.loop.beats) : dk.autoLoop(4); }
      else if (e.key === 'x' || e.key === 'X') dk.clearLoop();
      else if (e.key === 'ArrowLeft') dk.jumpBeats(-4);
      else if (e.key === 'ArrowRight') dk.jumpBeats(4);
      else if (e.key === '[') { xfEl.value = String(clamp(xf.pos - 0.05, 0, 1)); xfEl.oninput(); }
      else if (e.key === ']') { xfEl.value = String(clamp(xf.pos + 0.05, 0, 1)); xfEl.oninput(); }
      else if (e.key === 's' || e.key === 'S') dk.syncTo(decks[1 - activeDeck]);
      paint();
    };
    window.addEventListener('keydown', keyH);

    // painter loop
    let raf = 0;
    function paint() {
      root.querySelectorAll('.djp-deck').forEach((el, i) => {
        const dk = decks[i];
        el.classList.toggle('active', activeDeck === i);
        const tt = el.querySelector('[data-slot="title"]');
        if (dk.item) tt.textContent = dk.item.title || 'untitled';
        el.querySelector('[data-slot="bpm"]').textContent = (dk.bpm ? Math.round(dk.bpm * dk.rate) : '—') + ' BPM';
        el.querySelector('[data-slot="key"]').textContent = dk.key ? `${dk.key.note} ${dk.key.mode === 'major' ? 'maj' : 'min'} · ${dk.key.camelot}` : '—';
        const kl = el.querySelector('[data-act="keylock"]'); kl.classList.toggle('on', dk.keyLock);
        el.querySelector('[data-act="slip"]')?.classList.toggle('on', dk.slip.on);
        for (let n = 0; n < 8; n++) el.querySelector(`[data-act="cue${n}"]`)?.classList.toggle('on', dk.cues[n] != null);
        el.querySelectorAll('[data-act^="loop"]').forEach(b => b.classList.remove('on'));
        if (dk.loop.active) { const lb = el.querySelector(`[data-act="loop${dk.loop.beats}"]`); lb?.classList.add('on'); }
        el.querySelectorAll('[data-assign]').forEach(b => b.classList.toggle('on', (dk.xfAssign || (i === 0 ? 'a' : 'b')) === b.dataset.assign && Number(b.dataset.deck) === i));
        const vin = el.querySelector('[data-slot="vinyl"]');
        if (vin) { vin.style.backgroundImage = dk.item?.thumb ? `url(${dk.item.thumb})` : ''; }
      });
      // top bar states
      const t = (id, txt) => { const b = root.querySelector('#' + id); if (b) b.textContent = txt; };
      t('djp-autodj', autoDj.on ? '🤖 AUTO-DJ: ON' : '🤖 AUTO-DJ: OFF');
      root.querySelector('#djp-autodj')?.classList.toggle('on', autoDj.on);
      t('djp-rec', rec.on ? '● REC…' : '● REC');
      root.querySelector('#djp-rec')?.classList.toggle('rec-on', rec.on);
      t('djp-fx-on', fx.on ? 'ON' : 'OFF');
      t('djp-mic', mic.on ? '🎤 ON' : '🎤 OFF');
      root.querySelector('#djp-mic')?.classList.toggle('on', mic.on);
      if (fx.sel) { const fs = root.querySelector('#djp-fx-sel'); if (fs) fs.value = fx.sel; }
    }
    // t119: the wave canvas follows the theme — the panel background derives
    // from the theme's wall color (read from the root vars main.js keeps in
    // sync on every theme change), darkened like the store's own deep tone.
    let djpWaveBg = '#070a18';
    const refreshWaveBg = () => {
      try {
        const hex = document.documentElement.style.getPropertyValue('--vb-blue').trim();
        if (/^#[0-9a-f]{6}$/i.test(hex)) {
          const n = parseInt(hex.slice(1), 16);
          const ch = (v) => Math.round(v * 0.42);   // wall → deep booth dark
          djpWaveBg = `rgb(${ch(n >> 16 & 255)},${ch(n >> 8 & 255)},${ch(n & 255)})`;
        }
      } catch {}
    };
    let djpFrameN = 0;
    function drawWaves() {
      if (!mounted) return;
      // t119: pick up theme changes cheaply — one string read every ~90 frames
      djpFrameN = (djpFrameN + 1) % 90;
      if (djpFrameN === 0) refreshWaveBg();
      // t111: perf — when the modal is closed the canvas is hidden; idle the
      // paint loop (one cheap classList check) until it opens again
      const djModal = document.getElementById('dj-modal');
      if (djModal && djModal.classList.contains('hidden')) { requestAnimationFrame(drawWaves); return; }
      // t108: master VU (two slim bars) — L/R straight off the engine levels
      if (vuCtx) {
        const lv = getLevels() || {};
        vuCtx.clearRect(0, 0, 88, 14);
        const seg = (v, y, c) => { const n = Math.round(v * 22); for (let k = 0; k < n; k++) { vuCtx.fillStyle = k > 17 ? '#ffb800' : c; vuCtx.fillRect(k * 4, y, 3, 5); } };
        seg(lv.energy || 0, 1, '#00f0ff'); seg(lv.bass || 0, 8, '#ff2a85');
      }
      // t108: REC timer
      if (rec.on && actx) { const s2 = Math.max(0, Math.floor(actx.currentTime - rec.t0));
        const el2 = root.querySelector('#djp-rectime');
        if (el2) el2.textContent = String(Math.floor(s2 / 60)).padStart(2, '0') + ':' + String(s2 % 60).padStart(2, '0'); }
      root.querySelectorAll('.djp-deck').forEach((el, i) => {
        const dk = decks[i], cv = el.querySelector('[data-slot="wave"]'), g = cv.getContext('2d');
        g.clearRect(0, 0, cv.width, cv.height);
        g.fillStyle = djpWaveBg; g.fillRect(0, 0, cv.width, cv.height);   // t119: themed, not hardcoded
        if (dk.peaks && dk.el && dk.el.duration) {          // t108: scrolling 3-band waveform
          const WIN = 8, mid = cv.width / 2, t0 = dk.el.currentTime - WIN / 2;
          const colAt = (t) => { const c = Math.floor((t / dk.el.duration) * dk.peaks.cols); return c >= 0 && c < dk.peaks.cols ? c : -1; };
          for (let x = 0; x < cv.width; x++) {
            const t = t0 + (x / cv.width) * WIN, c = colAt(t);
            if (c < 0) continue;
            const draw = (arr, col, sc) => { const h = arr[c] * cv.height * 0.48 * sc; g.fillStyle = col; g.fillRect(x, cv.height / 2 - h, 1, h * 2); };
            draw(dk.peaks.hi, '#3b6dff', 1); draw(dk.peaks.mid, '#00ff66', 0.9); draw(dk.peaks.lo, '#ff2a85', 1);
          }
          g.fillStyle = '#ffffff30'; g.fillRect(mid, 0, 1, cv.height);
        } else if (dk.analyser) {
          dk.analyser.getByteTimeDomainData(wave);
          g.strokeStyle = dk.color; g.globalAlpha = 0.9; g.beginPath();
          for (let x = 0; x < cv.width; x++) {
            const v = wave[Math.floor(x / cv.width * wave.length)] / 255;
            g.lineTo(x, cv.height / 2 + (v - 0.5) * cv.height * 0.9);
          }
          g.stroke(); g.globalAlpha = 1;
        }
        if (dk.bpm && dk.el && dk.el.duration) {          // beat grid
          const spb = dk.beatSec(), x0 = ((dk.grid0 % spb) / spb) * (cv.width / (dk.el.duration / spb) * spb / spb);
          g.fillStyle = 'rgba(255,255,255,.25)';
          for (let t = 0; t < dk.el.duration; t += spb) {
            const x = (t / dk.el.duration) * cv.width;
            if (dk.loop.active && t >= dk.loop.in && t <= dk.loop.out) { g.fillStyle = 'rgba(255,176,45,.5)'; g.fillRect(x, 0, 2, cv.height); g.fillStyle = 'rgba(255,255,255,.25)'; }
            else g.fillRect(x, 0, 1, cv.height);
          }
        }
        if (dk.el && dk.el.duration) {                    // playhead
          const x = (dk.el.currentTime / dk.el.duration) * cv.width;
          g.fillStyle = '#fff'; g.fillRect(x - 1, 0, 2, cv.height);
          for (let n = 0; n < 8; n++) if (dk.cues[n] != null) {
            g.fillStyle = dk.color; g.fillRect((dk.cues[n] / dk.el.duration) * cv.width - 1, 0, 2, 8);
          }
        }
        // t108: vinyl platter spins with the deck, scratches back when reversed
        const vin = el.querySelector('[data-slot="vinyl"]');
        if (vin && dk.el) {
          const playing = !dk.el.paused && dk.el.src;
          dk._spin = (dk._spin || 0) + (playing ? dk.rate * 3.6 : 0);
          vin.style.transform = `rotate(${dk._spin}deg)`;
        }
      });
      requestAnimationFrame(drawWaves);
    }
    renderList(); applyXf(); paint(); drawWaves();
    return {
      // t121: TRUE TEARDOWN — root.remove() too. The panel used to linger in
      // the (hidden) modal after close; now closing the DJ menu fully kills
      // the rig: DOM gone, window keys gone (the S-key leak fix).
      unmount() { mounted = false; window.removeEventListener('keydown', keyH); try { root.remove(); } catch {} },
      refresh(newItems) {
        items = newItems;
        // t113: queued entries must follow the FRESH item objects (ids stay,
        // stream URLs change with the library) — remap by id, drop ghosts
        const byId = new Map(newItems.map(n => [n.id, n]));
        for (const q of [autoQueue, autoDj.queue]) {
          for (let k = q.length - 1; k >= 0; k--) {
            const fresh = byId.get(q[k]?.id);
            if (fresh) q[k] = fresh; else q.splice(k, 1);      // gone from the library → out of the queue
          }
        }
        renderList();
      }
    };
  }

  function info() {
    const g = xfGains();
    return {
      active: activeDeck,
      ring: { sats: surround?.sats?.length || 0, hpHz: ringSatHz, stages: ringStages, guarded: !!ringGuard, subIn: ringSubIn, subLp2: ringSubLp2, engine: ringEngine, resSources },   // t71+t73+t77
      clipCurve: (() => { const c = softClip && softClip.curve; if (!c) return null; const N = c.length, at = x => c[Math.round((x + 1) / 2 * (N - 1))]; return { zero: +Math.abs(at(0)).toFixed(3), half: +at(0.5).toFixed(3), top: +at(1).toFixed(3), slope: +((at(0.05) - at(-0.05)) / 0.1).toFixed(3) }; })(),
      decks: decks.map(dk => ({
        loaded: !!dk.item, playing: !!(dk.el && !dk.el.paused && dk.el.src),
        title: dk.item?.title || null, pitch: dk.pitch || 0,   // t108: booth HUD
        dur: (dk.el && isFinite(dk.el.duration)) ? +dk.el.duration.toFixed(1) : null,   // t111
        rate: dk.rate, keyLock: dk.keyLock, bpm: dk.bpm, key: dk.key?.camelot || null,
        cues: dk.cues.filter(c => c != null).length, pos: +(dk.el?.currentTime || 0).toFixed(1),
        eqDb: { ...dk.eqDb }, makeup: dk.makeup ? +dk.makeup.gain.value.toFixed(3) : null,   // t76: dB-honest EQ, provable
        loop: { active: dk.loop.active, beats: dk.loop.beats, len: dk.loop.active ? +(dk.loop.out - dk.loop.in).toFixed(2) : 0 },
        eqRealFilters: !!(dk.eqL && dk.eqM && dk.eqH), eqDb: dk.eqDb || { bass: 0, mid: 0, treble: 0 }
      })),
      xf: { pos: xf.pos, curve: xf.curve, aGain: +g.a.toFixed(3), bGain: +g.b.toFixed(3), detent: true },
      master: { limiter: !!limiter, softClip: !!softClip, analyser: !!masterAnalyser, subDyn: !!subDynNode,
        limRed: limiter ? +limiter.reduction.toFixed(2) : 0, ringRed: ringGuard ? +ringGuard.reduction.toFixed(2) : 0, cal: calGain ? +calGain.gain.value.toFixed(2) : null },   // t75: live meters — both nets must stay IDLE at unity
      gate: { wingOnly: true }, mode, mounted,
      // t108: the overhaul, provable headless
      overhaul: {
        cues: 8, loops: [0.5, 1, 2, 4, 8, 16, 32], pitchRanges: [6, 10, 16, 50], slip: true,
        instantDoubles: true, peaks3Band: _peaksCache.size,
        decks: decks.map(dk => ({ pitch: +dk.pitch.toFixed(2), pitchRange: dk.pitchRange, slipOn: dk.slip.on,
          xfAssign: dk.xfAssign || (dk.id === 0 ? 'a' : 'b'), colorMode: dk.colorMode, colorVal: +(dk.colorVal ?? 0.5).toFixed(2),
          colorWet: dk.colorWet ? +dk.colorWet.gain.value.toFixed(2) : null,
          lpfHz: dk.colorLPF ? Math.round(dk.colorLPF.frequency.value) : null,
          hpfHz: dk.colorHPF ? Math.round(dk.colorHPF.frequency.value) : null }))
      },
      fx: { sel: fx.sel, frac: fx.frac, depth: fx.depth, on: fx.on,
        delaySec: fx.echoT != null ? +fx.echoT.toFixed(3) : null,
        hasReverb: !!(fx.nodes && fx.nodes.conv.buffer), hasFlanger: !!(fx.nodes && fx.nodes.flLfo),
        hasStutter: !!(fx.nodes && fx.nodes.stOsc) },
      mic: { on: mic.on, duckDb: mic.duckDb, lvl: +mic.lvl.toFixed(3), duckActive: !!(duckGain && Math.abs(duckGain.gain.value - 1) > 0.01) },
      rec: { on: rec.on, hasUrl: !!rec.url },
      bands: (() => { const l = getLevels(); return { lo: l.bass, mid: l.mid, hi: l.treble, energy: l.energy }; })(),   // t114: HIGH/MID/LOW for the laptop HUD
      autoDj: { on: autoDj.on, queued: autoDj.queue.length, idx: autoDj.idx, transitioning: !!autoDj.transition, fadeBeats: autoDj.fadeBeats, leadBeats: autoDj.leadBeats,
        pos: Math.min(autoDj.idx, autoDj.queue.length),                                 // t111: where we are · t115: finite
        remaining: Math.max(0, autoDj.queue.length - autoDj.idx),                        // t115: hits 0 when the set is done
        next: autoDj.queue.slice(Math.min(autoDj.idx, autoDj.queue.length), Math.min(autoDj.idx, autoDj.queue.length) + 3).map(x => x.title || 'untitled'),  // t111: the laptop HUD's up-next list
        style: autoDj.style, swapped: !!autoDj.swapT, liveFadeBeats: autoDj.transition?.fadeBeats ?? null }   // t112
    };
  }

  const api = { mount, update, getLevels, playItem, info, seek: (t) => decks.forEach(dk => { if (dk.el && !dk.el.paused) try { dk.el.currentTime = t; } catch {} }),
    stopAll: () => { if (autoDj.on) setAutoDj(false); decks.forEach(dk => { try { dk.el?.pause(); } catch {} }); },   // t76 deterministic · t111: stop means STOP — AUTO-DJ off too
    setSurround: (s) => { surround = s; buildRing(); },
    // t108: controllers (the DJBoothSystem surface)
    setFx, setFxParam, setFxOn, brakeActive, enableMic, startRec, stopRec, setAutoDj,
    applyXf, computePeaks,
    decksRef: () => decks, xfRef: () => xf,
    recRef: () => rec,
    pure: { foldBpm, modeInterval, keyFromChroma, pickMixStyle, camelotOk, keyTagToCamelot } };   // t64 tests: the math · t112: the mix-brain · t114: tag → Camelot
  return api;
}
