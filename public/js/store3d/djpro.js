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
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT } from './config.js?v=1788729356586';

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

export function createDjPro() {
  let actx = null, masterIn = null, masterGain = null, masterAnalyser = null;
  let limiter = null, softClip = null, gate = null, boothGain = null;
  let ringIn = null, mounted = false, activeDeck = 0, mode = 'beginner', subDynNode = null;
  let ringSatHz = 0, ringStages = 0, ringGuard = null, ringSubIn = 0, ringSubLp2 = false, calGain = null;   // t71/t73/t75 probes
  let resScene = null, resSources = 0, ringEngine = 'webaudio';   // t77: Resonance Audio (Apache-2.0, vendored) — Ambisonic soundfield ring
  const freq = new Uint8Array(256), wave = new Uint8Array(1024);
  const _fwd = new THREE.Vector3();
  let surround = null;                          // dance.speakerWorld (set at first update)

  const xf = { pos: 0.5, curve: 0.5 };          // curve 0 = sharp cut · 1 = smooth mix
  const xfGains = () => {                       // constant-power ↔ full-cut blend
    const x = xf.pos, c = xf.curve;
    const smA = Math.cos(x * Math.PI / 2), smB = Math.sin(x * Math.PI / 2);
    const shA = x <= 0.5 ? 1 : Math.max(0, 1 - (x - 0.5) * 2), shB = x >= 0.5 ? 1 : Math.max(0, 1 - (0.5 - x) * 2);
    return { a: smA * c + shA * (1 - c), b: smB * c + shB * (1 - c) };
  };

  function makeDeck(id, color) {
    const dk = {
      id, color, el: null, item: null, src: null, trim: null, eqL: null, eqM: null, eqH: null,
      fader: null, xfG: null, analyser: null, rate: 1, keyLock: true, bpm: 0, key: null,
      cues: [null, null, null, null], loop: { in: null, out: null, active: false, beats: 0 },
      beats: 0, lastBeatT: -9, ivHits: [], chroma: new Array(12).fill(0), chromaN: 0, grid0: 0
    };
    dk.load = (item) => {
      if (!item?.source || !item.key) return false;
      if (/\\.(mp4|m4v|webm|mkv|mov|avi)$/i.test(`${item.key} ${item.file || ''}`) || ['movie', 'show', 'musicvideo'].includes(item.type)) {
        if (item.type === 'album' || AUDIO_RE.test(item.key || '')) { /* audio file ok */ } else return false;
      }
      ensureGraph(); dk.ensureEl();
      dk.item = item; dk.bpm = 0; dk.ivHits = []; dk.chroma.fill(0); dk.chromaN = 0; dk.key = null;
      dk.cues = [null, null, null, null]; dk.loop = { in: null, out: null, active: false, beats: 0 };
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
        dk.eqH.connect(dk.makeup); dk.makeup.connect(dk.fader); dk.fader.connect(dk.xfG); dk.xfG.connect(masterIn);
        dk.fader.connect(dk.analyser);            // pre-fader-ish tap (channel level)
        dk.graphed = true;
      } catch { dk.graphed = false; }
    };
    dk.eqDb = { bass: 0, mid: 0, treble: 0 };
    dk.setEq = (band, db) => {
      const n = { bass: dk.eqL, mid: dk.eqM, treble: dk.eqH }[band];
      if (n) n.gain.setTargetAtTime(clamp(db, -12, 12), actx.currentTime, 0.04);
      dk.eqDb[band] = clamp(db, -12, 12);
      // t76: dB-honest makeup — pay back what the boost would steal (jukebox recipe)
      const cost = 0.5 * Math.max(0, dk.eqDb.bass) + 0.35 * Math.max(0, dk.eqDb.mid) + 0.35 * Math.max(0, dk.eqDb.treble);
      if (dk.makeup) dk.makeup.gain.setTargetAtTime(Math.pow(10, -cost / 20), actx.currentTime, 0.05);
    };
    dk.setRate = (r) => { dk.rate = clamp(r, 0.5, 2); if (dk.el) dk.el.playbackRate = dk.rate; };
    dk.setKeyLock = (on) => { dk.keyLock = !!on; if (dk.el) { dk.el.preservesPitch = dk.keyLock; dk.el.mozPreservesPitch = dk.keyLock; dk.el.webkitPreservesPitch = dk.keyLock; } };
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
      const spb = dk.beatSec();
      const myPhase = ((dk.el?.currentTime || 0) - dk.grid0) % spb;
      const otPhase = ((other.el?.currentTime || 0) - other.grid0) % other.beatSec();
      let delta = otPhase - myPhase; if (delta > spb / 2) delta -= spb; if (delta < -spb / 2) delta += spb;
      if (dk.el) dk.el.currentTime = Math.max(0, dk.el.currentTime + delta);
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
    masterIn.connect(masterAnalyser); masterAnalyser.connect(calGain); calGain.connect(masterGain);   // t75: analyser tap → CAL 0.55 → master volume
    masterGain.connect(limiter); limiter.connect(softClip); softClip.connect(gate);
    gate.connect(actx.destination); gate.connect(boothGain); boothGain.connect(actx.destination);
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
      deck.lastBeatT = now; deck.beats++; deck.grid0 = deck.el.currentTime;
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
  }

  function update(camera) {
    if (!actx) return;
    if (!surround && window.__VB?.scene?.danceInfo) {
      const dw = window.__VB.scene._danceSpeakerWorld;   // scene injects this
      if (dw) { surround = dw; buildRing(); }
    }
    for (const dk of decks) tick(dk);
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

  function getLevels() {
    if (!masterAnalyser) return { bass: 0, mid: 0, treble: 0, energy: 0, live: false };
    masterAnalyser.getByteFrequencyData(freq);
    const avg = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += freq[i]; return s / ((b - a) * 255); };
    const bass = avg(0, 3), mid = avg(3, 26), treble = avg(26, 96);
    const live = decks.some(d => d.el && !d.el.paused && d.el.src);
    return { bass, mid, treble, energy: (bass * 1.4 + mid + treble * 0.7) / 3, live };
  }

  function playItem(item) {                            // record spin / API entry
    const dk = decks.find(d => !d.el || d.el.paused) || decks[0];
    ensureGraph(); if (!dk.graphed) dk.buildGraph();
    return dk.load(item);
  }

  // ═══════════════════════ THE PANEL (mounted by ui.js) ══════════════════════
  function mount(container, { items = [], onClose } = {}) {
    mounted = true;
    mode = localStorage.getItem('hb_djpro_mode') || 'beginner';
    container.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = `
      .djp{display:flex;flex-direction:column;gap:10px;color:#dfe6ff;font-family:system-ui}
      .djp *{box-sizing:border-box}
      .djp-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .djp-decks{display:flex;gap:10px;align-items:stretch}
      .djp-deck{flex:1;border:1px solid;border-radius:10px;padding:10px;background:rgba(10,12,30,.55);min-width:0}
      .djp-deck.a{border-color:#2de2ff;box-shadow:0 0 14px rgba(45,226,255,.25) inset}
      .djp-deck.b{border-color:#ff2d78;box-shadow:0 0 14px rgba(255,45,120,.25) inset}
      .djp-deck.active{box-shadow:0 0 22px rgba(45,226,255,.5),0 0 22px rgba(255,45,120,.0)}
      .djp-deck.b.active{box-shadow:0 0 22px rgba(255,45,120,.5)}
      .djp-title{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .djp-wave{width:100%;height:64px;background:#070a18;border-radius:6px;display:block}
      .djp-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px}
      .djp-btn{background:#161a30;border:1px solid #2a3358;color:#dfe6ff;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:12px}
      .djp-btn:hover{border-color:#4a5aa8}
      .djp-btn.on{background:#223;border-color:currentColor}
      .djp-deck.a .djp-btn.on{color:#2de2ff}.djp-deck.b .djp-btn.on{color:#ff2d78}
      .djp-sld{display:flex;align-items:center;gap:6px;font-size:11px;margin-top:4px}
      .djp-sld input{flex:1;min-width:0}
      .djp-mid{display:flex;flex-direction:column;gap:8px;justify-content:center;min-width:210px}
      .djp-xf{writing-mode:vertical-lr;direction:rtl;height:150px}
      .djp-list{flex:1 1 auto;min-height:64px;overflow-y:auto;overflow-x:hidden;border:1px solid #232a4d;border-radius:8px;background:#0b0e20}   /* t67: the ONLY thing that scrolls */
      .djp-rowitem{display:flex;gap:8px;padding:5px 8px;font-size:12px;border-bottom:1px solid #171c36;cursor:pointer;align-items:center}
      .djp-rowitem:hover{background:#121731}
      .djp-meta{color:#8fa0d8;min-width:44px;text-align:right}
      .djp-hint{font-size:11px;color:#8fa0d8}
      .djp-help{position:absolute;inset:0;background:rgba(5,7,18,.94);border-radius:10px;padding:18px;overflow:auto;z-index:5}
      .djp-kbd{background:#161a30;border:1px solid #2a3358;border-radius:4px;padding:1px 6px;font-family:monospace}
      .djp-pro{display:none}.djp.pro .djp-pro{display:flex}`;
    container.appendChild(style);
    const root = document.createElement('div');
    root.className = 'djp' + (mode === 'pro' ? ' pro' : '');
    container.appendChild(root);

    const deckEls = [];
    root.innerHTML = `
      <div class="djp-top">
        <b style="letter-spacing:.12em">🎛️ DJ BOOTH — PRO RIG</b>
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
          <canvas class="djp-wave" data-slot="wave" width="420" height="64"></canvas>
          <div class="djp-row">
            <button class="djp-btn" data-act="play" title="Play / pause this deck">▶</button>
            <button class="djp-btn" data-act="load" title="Load the selected playlist track here">⬇ Load</button>
            <button class="djp-btn" data-act="sync" title="Match tempo & phase to the other deck">⟲ Sync</button>
            <button class="djp-btn" data-act="keylock" title="Key lock — keep pitch when tempo changes">🔑 Lock</button>
            <span class="djp-meta" data-slot="bpm" title="Detected BPM">— BPM</span>
            <span class="djp-meta" data-slot="key" title="Detected key (Camelot)">—</span>
          </div>
          <div class="djp-row djp-pro" data-cues>
            ${[0, 1, 2, 3].map(n => `<button class="djp-btn" data-act="cue${n}" title="Hot cue ${n + 1} — sets at the playhead, clicks jump">■ C${n + 1}</button>`).join('')}
          </div>
          <div class="djp-row djp-pro" data-loops>
            ${[1, 2, 4, 8, 16].map(b => `<button class="djp-btn" data-act="loop${b}" title="Auto-loop ${b} beat${b > 1 ? 's' : ''}, snapped to the beat grid">↻${b}</button>`).join('')}
            <button class="djp-btn" data-act="loopclear" title="Clear the loop">✕ loop</button>
            <button class="djp-btn" data-act="jb-" title="Beat jump back">≪</button>
            <button class="djp-btn" data-act="jb+" title="Beat jump forward">≫</button>
          </div>
          ${['bass', 'mid', 'treble'].map(b => `
          <div class="djp-sld"><span style="width:34px">${b}</span>
            <input type="range" min="-12" max="12" step="1" value="0" data-eq="${b}" title="Deck EQ ${b} (dB) — real filter chain">
            <b data-eqv="${b}">0dB</b></div>`).join('')}
          <div class="djp-sld"><span style="width:34px">trim</span>
            <input type="range" min="0" max="1.5" step="0.05" value="1" data-trim title="Gain / trim for this deck">
            <b data-trimv>1.00</b></div>
          <div class="djp-sld"><span style="width:34px">vol</span>
            <input type="range" min="0" max="1" step="0.05" value="1" data-fader title="Channel fader">
            <b data-faderv>1.00</b></div>
          <div class="djp-sld djp-pro"><span style="width:34px">tempo</span>
            <input type="range" min="0.5" max="1.5" step="0.01" value="1" data-rate title="Tempo (rate)">
            <b data-ratev>1.00×</b></div>
        </div>`).join('')}
        <div class="djp-mid">
          <div class="djp-sld" style="flex-direction:column;align-items:center">
            <b>A</b><input type="range" class="djp-xf" id="djp-xf" min="0" max="1" step="0.01" value="0.5" title="Crossfader — center detent snaps at 0.5">
            <b>B</b></div>
          <div class="djp-sld"><span>curve</span>
            <input type="range" id="djp-curve" min="0" max="1" step="0.05" value="0.5" title="0 = sharp cut · 1 = smooth constant-power mix">
            <b id="djp-xfgain">A 71% B 71%</b></div>
          <div class="djp-sld"><span>master</span>
            <input type="range" id="djp-master" min="0" max="1" step="0.05" value="0.8" title="Master volume (post-limiter ceiling)">
            <b id="djp-masterv">0.80</b></div>
          <div class="djp-sld djp-pro"><span>booth</span>
            <input type="range" id="djp-booth" min="0" max="1" step="0.05" value="0" title="Booth monitor volume (extra tap)">
            <b id="djp-boothv">off</b></div>
        </div>
      </div>
      <div class="djp-row">
        <input id="djp-search" placeholder="Search title / BPM / key…" style="flex:1;background:#0b0e20;border:1px solid #232a4d;color:#dfe6ff;border-radius:6px;padding:6px 8px" title="Filter the playlist">
      </div>
      <div class="djp-list" id="djp-list"></div>
      <div class="djp-hint">Click a track → <b>⬇ Load</b> puts it on a deck · play, then ride the crossfader. Effects rack, headphone cue & recording land in the next set.</div>`;

    let selIdx = -1, sortKey = 'title', sortDir = 1;
    const listEl = root.querySelector('#djp-list');
    const meta = JSON.parse(localStorage.getItem('hb_djpro_meta') || '{}');
    function renderList() {
      const q = (root.querySelector('#djp-search').value || '').toLowerCase();
      let rows = items.map((it, i) => ({ it, i })).filter(({ it }) => !q || (it.title || '').toLowerCase().includes(q));
      rows.sort((x, y) => {
        const a = x.it.title || '', b = y.it.title || '';
        return a.localeCompare(b) * sortDir;
      });
      listEl.innerHTML = rows.map(({ it, i }) => {
        const m = meta[it.id] || {};
        return `<div class="djp-rowitem" data-i="${i}">
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.title || 'untitled'}</span>
          <span class="djp-meta">${m.bpm ? Math.round(m.bpm) + ' BPM' : '—'}</span>
          <span class="djp-meta">${m.key || '—'}</span>
          <button class="djp-btn" data-load="${i}" title="Load onto the deck this panel has selected">⬇</button>
        </div>`;
      }).join('');
      listEl.querySelectorAll('[data-load]').forEach(b => b.onclick = (e) => { e.stopPropagation(); loadSel(Number(b.dataset.load)); });
      listEl.querySelectorAll('[data-i]').forEach(r => r.onclick = () => { selIdx = Number(r.dataset.i); paint(); });
    }
    function loadSel(i) {
      const it = items[i]; if (!it) return;
      ensureGraph();
      const dk = decks[activeDeck]; if (!dk.graphed) dk.buildGraph();
      dk.load(it);
      paint();
    }
    root.querySelector('#djp-search').oninput = renderList;

    // per-deck wiring
    root.querySelectorAll('.djp-deck').forEach(el => {
      const i = Number(el.dataset.deck), dk = decks[i];
      deckEls[i] = el;
      el.onclick = () => { activeDeck = i; paint(); };
      el.querySelector('[data-act="play"]').onclick = () => { ensureGraph(); if (!dk.graphed) dk.buildGraph(); dk.playPause(); };
      el.querySelector('[data-act="load"]').onclick = () => { if (selIdx >= 0) loadSel(selIdx); };
      el.querySelector('[data-act="sync"]').onclick = () => dk.syncTo(decks[1 - i]);
      el.querySelector('[data-act="keylock"]').onclick = () => { dk.setKeyLock(!dk.keyLock); paint(); };
      for (let n = 0; n < 4; n++) el.querySelector(`[data-act="cue${n}"]`).onclick = () => {
        if (dk.cues[n] == null) { if (dk.el) dk.cues[n] = dk.el.currentTime; } else dk.cue(n); paint();
      };
      for (const b of [1, 2, 4, 8, 16]) el.querySelector(`[data-act="loop${b}"]`).onclick = () => { dk.autoLoop(b); paint(); };
      el.querySelector('[data-act="loopclear"]').onclick = () => { dk.clearLoop(); paint(); };
      el.querySelector('[data-act="jb-"]').onclick = () => dk.jumpBeats(-4);
      el.querySelector('[data-act="jb+"]').onclick = () => dk.jumpBeats(4);
      el.querySelectorAll('[data-eq]').forEach(s => s.oninput = () => {
        ensureGraph(); if (!dk.graphed) dk.buildGraph();
        dk.setEq(s.dataset.eq, parseFloat(s.value));
        el.querySelector(`[data-eqv="${s.dataset.eq}"]`).textContent = s.value + 'dB';
      });
      el.querySelector('[data-trim]').oninput = (e) => { const v = parseFloat(e.target.value); if (dk.trim) dk.trim.gain.setTargetAtTime(v, actx.currentTime, 0.03); el.querySelector('[data-trimv]').textContent = v.toFixed(2); };
      el.querySelector('[data-fader]').oninput = (e) => { const v = parseFloat(e.target.value); if (dk.fader) dk.fader.gain.setTargetAtTime(v, actx.currentTime, 0.03); el.querySelector('[data-faderv]').textContent = v.toFixed(2); };
      el.querySelector('[data-rate]').oninput = (e) => { dk.setRate(parseFloat(e.target.value)); el.querySelector('[data-ratev]').textContent = dk.rate.toFixed(2) + '×'; };
    });

    const xfEl = root.querySelector('#djp-xf');
    xfEl.oninput = () => {
      xf.pos = parseFloat(xfEl.value);
      if (Math.abs(xf.pos - 0.5) < 0.03) { xf.pos = 0.5; xfEl.value = '0.5'; }   // center detent
      applyXf();
    };
    function applyXf() {
      const g = xfGains();
      if (decks[0].xfG) decks[0].xfG.gain.setTargetAtTime(g.a, actx?.currentTime || 0, 0.02);
      if (decks[1].xfG) decks[1].xfG.gain.setTargetAtTime(g.b, actx?.currentTime || 0, 0.02);
      const lbl = root.querySelector('#djp-xfgain');
      if (lbl) lbl.textContent = `A ${Math.round(g.a * 100)}% B ${Math.round(g.b * 100)}%`;
    }
    root.querySelector('#djp-curve').oninput = (e) => { xf.curve = parseFloat(e.target.value); applyXf(); };
    root.querySelector('#djp-master').oninput = (e) => {
      const v = parseFloat(e.target.value); if (masterGain) masterGain.gain.setTargetAtTime(v, actx.currentTime, 0.03);
      root.querySelector('#djp-masterv').textContent = v.toFixed(2);
    };
    root.querySelector('#djp-booth').oninput = (e) => {
      const v = parseFloat(e.target.value); if (boothGain) boothGain.gain.setTargetAtTime(v, actx.currentTime, 0.03);
      root.querySelector('#djp-boothv').textContent = v === 0 ? 'off' : v.toFixed(2);
    };

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
        decks: decks.map(dk => ({ rate: dk.rate, keyLock: dk.keyLock, eq: dk.eqDb || { bass: 0, mid: 0, treble: 0 }, cues: dk.cues, loop: dk.loop, item: dk.item?.id || null })) };
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
      if (!s) return toastIt('No saved set yet', true);
      xf.pos = s.xf; xf.curve = s.curve;
      xfEl.value = String(s.xf); root.querySelector('#djp-curve').value = String(s.curve);
      s.decks?.forEach((sd, i) => {
        const dk = decks[i];
        dk.setKeyLock(sd.keyLock !== false); dk.setRate(sd.rate || 1);
        dk.cues = sd.cues || dk.cues;
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
      else if (['1', '2', '3', '4'].includes(e.key)) { const n = +e.key - 1; if (dk.cues[n] == null) { if (dk.el) dk.cues[n] = dk.el.currentTime; } else dk.cue(n); }
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
        for (let n = 0; n < 4; n++) el.querySelector(`[data-act="cue${n}"]`)?.classList.toggle('on', dk.cues[n] != null);
        if (dk.loop.active) { const lb = el.querySelector(`[data-act="loop${dk.loop.beats}"]`); lb?.classList.add('on'); }
      });
    }
    function drawWaves() {
      if (!mounted) return;
      root.querySelectorAll('.djp-deck').forEach((el, i) => {
        const dk = decks[i], cv = el.querySelector('[data-slot="wave"]'), g = cv.getContext('2d');
        g.clearRect(0, 0, cv.width, cv.height);
        g.fillStyle = '#070a18'; g.fillRect(0, 0, cv.width, cv.height);
        if (dk.analyser) {
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
          for (let n = 0; n < 4; n++) if (dk.cues[n] != null) {
            g.fillStyle = dk.color; g.fillRect((dk.cues[n] / dk.el.duration) * cv.width - 1, 0, 2, 8);
          }
        }
      });
      requestAnimationFrame(drawWaves);
    }
    renderList(); applyXf(); paint(); drawWaves();
    return {
      unmount() { mounted = false; window.removeEventListener('keydown', keyH); },
      refresh(newItems) { items = newItems; renderList(); }
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
        rate: dk.rate, keyLock: dk.keyLock, bpm: dk.bpm, key: dk.key?.camelot || null,
        cues: dk.cues.filter(c => c != null).length, pos: +(dk.el?.currentTime || 0).toFixed(1),
        eqDb: { ...dk.eqDb }, makeup: dk.makeup ? +dk.makeup.gain.value.toFixed(3) : null,   // t76: dB-honest EQ, provable
        loop: { active: dk.loop.active, beats: dk.loop.beats, len: dk.loop.active ? +(dk.loop.out - dk.loop.in).toFixed(2) : 0 },
        eqRealFilters: !!(dk.eqL && dk.eqM && dk.eqH), eqDb: dk.eqDb || { bass: 0, mid: 0, treble: 0 }
      })),
      xf: { pos: xf.pos, curve: xf.curve, aGain: +g.a.toFixed(3), bGain: +g.b.toFixed(3), detent: true },
      master: { limiter: !!limiter, softClip: !!softClip, analyser: !!masterAnalyser, subDyn: !!subDynNode,
        limRed: limiter ? +limiter.reduction.toFixed(2) : 0, ringRed: ringGuard ? +ringGuard.reduction.toFixed(2) : 0, cal: calGain ? +calGain.gain.value.toFixed(2) : null },   // t75: live meters — both nets must stay IDLE at unity
      gate: { wingOnly: true }, mode, mounted
    };
  }

  return { mount, update, getLevels, playItem, info, seek: (t) => decks.forEach(dk => { if (dk.el && !dk.el.paused) try { dk.el.currentTime = t; } catch {} }),
    stopAll: () => decks.forEach(dk => { try { dk.el?.pause(); } catch {} }),   // t76: deterministic tests + polite close
    setSurround: (s) => { surround = s; buildRing(); },
    pure: { foldBpm, modeInterval, keyFromChroma } };   // t64 tests: the math, verified headless
}
