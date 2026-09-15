// benchgen.cjs — t118 bench v3 regen (22.05 kHz mono 16-bit, deterministic)
// Recipe (proven 5/5): kick 80→42 Hz exp sweep + beater click on every beat,
// hats on 8ths, bass at root/2, 4-note chord with 2nd/3rd harmonics,
// peak-normalized to 0.87. b124f carries a 2.5 s SILENT LEAD-IN (t118's
// leadInSkip assert needs it). Verified against a verbatim copy of the app's
// analyzeOffline() + keyFromChroma() before writing.
'use strict';
const fs = require('fs');
const path = require('path');
const SR = 22050;

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const SPECS = [
  { file: 'b120c.wav',  bpm: 120, root: 261.63, mode: 'major' },  // C  → 8B
  { file: 'b124f.wav',  bpm: 124, root: 349.23, mode: 'major', lead: 2.5 },  // F  → 7B  (silent intro)
  { file: 'b128am.wav', bpm: 128, root: 220.00, mode: 'minor' },  // Am → 8A
  { file: 'b174fsm.wav',bpm: 174, root: 369.99, mode: 'minor' },  // F#m→ 11A
  { file: 'b90gm.wav',  bpm: 90,  root: 196.00, mode: 'minor' },  // Gm → 6A
];

function synth(spec) {
  const dur = 60, N = SR * dur, out = new Float32Array(N);
  const rnd = mulberry32(0xBEEF + spec.bpm);
  const beat = 60 / spec.bpm;
  const LEAD = spec.lead || 0;
  const beats = Math.floor((dur - LEAD) / beat) - 1;
  const semi = spec.mode === 'major' ? [0, 4, 7, 12] : [0, 3, 7, 12];
  const notes = semi.map(s => spec.root * Math.pow(2, s / 12));
  const bassF = spec.root / 2;
  for (let b = 0; b < beats; b++) {
    const t0 = LEAD + b * beat;
    const kLen = Math.min(Math.floor(0.20 * SR), N - Math.floor(t0 * SR));
    for (let i = 0; i < kLen; i++) {
      const tt = i / SR, k = tt / 0.20;
      out[Math.floor(t0 * SR) + i] += 0.95 * Math.exp(-9 * k) * Math.sin(2 * Math.PI * (42 * tt + ((80 - 42) / -6) * (Math.exp(-6 * k) - 1) / 0.20 * 0.20));
    }
    const cLen = Math.floor(0.008 * SR);
    for (let i = 0; i < cLen && Math.floor(t0 * SR) + i < N; i++) {
      const k = i / cLen;
      out[Math.floor(t0 * SR) + i] += 0.25 * (1 - k) * (rnd() * 2 - 1) * 0.5 + 0.25 * (1 - k) * Math.sin(2 * Math.PI * 1200 * i / SR);
    }
    for (const h8 of [0, 0.5]) {
      const ht = t0 + h8 * beat, hLen = Math.floor(0.03 * SR);
      for (let i = 0; i < hLen && Math.floor(ht * SR) + i < N; i++) {
        const k = i / hLen;
        out[Math.floor(ht * SR) + i] += 0.12 * Math.exp(-7 * k) * (rnd() * 2 - 1);
      }
    }
  }
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const edge = t < LEAD ? 0 : Math.min(1, (t - LEAD) / 0.5, (dur - t) / 0.5);
    let v = 0.30 * Math.sin(2 * Math.PI * bassF * t);
    for (let f = 0; f < notes.length; f++) {
      v += 0.055 * Math.sin(2 * Math.PI * notes[f] * t);
      v += 0.020 * Math.sin(2 * Math.PI * notes[f] * 2 * t);
      v += 0.009 * Math.sin(2 * Math.PI * notes[f] * 3 * t);
    }
    out[i] += v * edge;
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.87 / peak;
  const pcm = Buffer.alloc(N * 2);
  for (let i = 0; i < N; i++) {
    const s = Math.max(-1, Math.min(1, out[i] * g));
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// ── verbatim copy of the app's analyzer (djpro.js analyzeOffline + keyFromChroma + foldBpm) ──
function foldBpm(b) { let x = b; while (x < 70) x *= 2; while (x > 180) x /= 2; return x; }
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function keyFromChroma(chroma) {
  let best = null;
  for (let r = 0; r < 12; r++) {
    for (const [tmpl, mode] of [[MAJ, 'major'], [MIN, 'minor']]) {
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < 12; i++) { const v = chroma[(i + r) % 12]; dot += v * tmpl[i]; na += v * v; nb += tmpl[i] * tmpl[i]; }
      const sc = dot / Math.sqrt(na * nb || 1);
      if (!best || sc > best.sc) best = { sc, note: r, mode };
    }
  }
  const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const CAMELOT = { 'C': '8B', 'C#': '3B', 'D': '10B', 'D#': '5B', 'E': '12B', 'F': '7B', 'F#': '2B', 'G': '9B', 'G#': '4B', 'A': '11B', 'A#': '6B', 'B': '1B' };
  const CAMELOT_M = { 'C': '5A', 'C#': '12A', 'D': '7A', 'D#': '2A', 'E': '9A', 'F': '4A', 'F#': '11A', 'G': '6A', 'G#': '1A', 'A': '8A', 'A#': '3A', 'B': '10A' };
  const n = NOTES[best.note];
  return { note: n, mode: best.mode, camelot: best.mode === 'major' ? CAMELOT[n] : CAMELOT_M[n] };
}
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
    const minLag = Math.max(2, Math.round(0.30 / hopT)), maxLag = Math.round(1.0 / hopT);
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

const EXPECT = { 'b120c.wav': [120, '8B'], 'b124f.wav': [124, '7B'], 'b128am.wav': [128, '8A'], 'b174fsm.wav': [174, '11A'], 'b90gm.wav': [90, '6A'] };
const dir = process.argv[2] || '.';
fs.mkdirSync(dir, { recursive: true });
let allOk = true;
for (const spec of SPECS) {
  const buf = synth(spec);
  fs.writeFileSync(path.join(dir, spec.file), buf);
  const n = (buf.length - 44) / 2, ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = buf.readInt16LE(44 + i * 2) / 32767;
  const r = analyzeOffline(ch, SR);
  const [wantBpm, wantKey] = EXPECT[spec.file];
  const bpmOk = Math.abs(r.bpm - wantBpm) / wantBpm <= 0.008;
  const keyOk = r.keyObj && r.keyObj.camelot === wantKey;
  if (!(bpmOk && keyOk)) allOk = false;
  console.log(`${spec.file}  ${buf.length} B  bpm=${r.bpm.toFixed(2)} (want ${wantBpm}) ${bpmOk ? 'OK' : 'FAIL'}  key=${r.keyObj ? r.keyObj.camelot + ' ' + r.keyObj.note + ' ' + r.keyObj.mode : 'none'} (want ${wantKey}) ${keyOk ? 'OK' : 'FAIL'}  grid0=${r.grid0.toFixed(3)}`);
}
console.log(allOk ? 'ALL 5/5 VERIFIED' : 'DETECTION MISMATCH — DO NOT SHIP');
process.exit(allOk ? 0 : 1);
