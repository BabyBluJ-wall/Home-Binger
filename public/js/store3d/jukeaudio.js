// ─────────────────────────────────────────────────────────────────────────────
//  store3d/jukeaudio.js — the JUKEBOX audio channel, fully independent of
//  the theater screen. A movie can roll while the jukebox plays up front;
//  neither interrupts the other. Sound is anchored at the jukebox with the
//  whole STORE inside its full-volume range, and a room gate mutes it the
//  moment you step into the theater (theater gets zero jukebox bleed, and
//  the store never hears the movie — soundproofing both ways).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT } from './config.js?v=1788919797230';

export function createJukeAudio() {
  const D = LAYOUT.room.l / 2;
  const POS = { x: -3.35, y: 1.45, z: -D + 0.35 };       // at the wall box
  let el = null, actx = null, panner = null, gate = null, limiter = null;
  let current = null;
  let zone = 'store';                                     // t51: 'store' | 'dance'
  let surround = null; const ringPanners = [];             // t53: HRTF speaker ring
  const ANCHOR = {                                        // where the sound LIVES
    store: { x: -3.35, y: 1.45, z: -D + 0.35 },           // the wall box
    dance: { x: 11.1, y: 1.6, z: 1.5 }                    // the dance floor (surround rig)
  };
  // t47 DJ chain: EQ (bass/mid/treble) → fade gain → analyser → panner
  let eqLow = null, eqMid = null, eqHigh = null, fadeGain = null, analyser = null;
  let voiceP = null, voiceA = null, rumble = null, makeup = null;   // t59: cinema voicing + makeup
  let voicing = true;
  let volGain = null, volTarget = 0.4;                         // t60: smooth volume node
  let trimG = null, subLpNode = null, mainLevel = null, subDyn = null;   // t65/t67: staging + sub dynamics
  let satHpHz = 0, satStages = 0, subInNode = null, subLp2 = null, subGainNode = null;   // t71/t73: crossover + THEATER-calibrated sub probes
  let resScene = null, resSources = 0, ringEngine = 'webaudio';   // t78: Resonance Audio Ambisonic ring (owner approved it in the dance hall)
  let graphedEl = false, softClip = null;                       // t63: fallback flag + final soft-clip
  const eqDb = { bass: 0, mid: 0, treble: 0 };
  const eqApplied = { bass: 0, mid: 0, treble: 0 };   // t63: what the chain is actually set to
  let fadeSecs = 1.2;
  let onEndedCb = null;
  const freqData = new Uint8Array(128);
  const _fwd = new THREE.Vector3();

  // ── mid-stream resilience (same doctrine as the theater video): a hiccup
  //    reloads the stream and RESUMES from the last position, a few tries
  //    with backoff. Without this, one dropped socket silently killed the
  //    song partway through — no error, no retry, just quiet.
  let resumeTries = 0, lastNudge = 0;
  function resumeAudio() {
    if (!el || !current) return;
    if (resumeTries >= 5) { current = null; return; }
    resumeTries++;
    const at = el.currentTime || 0;
    const src = el.getAttribute('src');
    if (!src) { current = null; return; }
    el.src = src;
    el.load();
    el.addEventListener('loadedmetadata', function onMeta() {
      el.removeEventListener('loadedmetadata', onMeta);
      try { el.currentTime = at; } catch { /* fresh start if unsupported */ }
      el.play().catch(() => {});
    });
  }

  function ensure() {
    if (el) return;
    el = document.createElement('audio');
    el.loop = false;
    el.volume = graphedEl ? 1 : volTarget;   // t63: unity only once the node chain exists
    el.addEventListener('ended', () => { current = null; resumeTries = 0; onEndedCb?.(); });
    el.addEventListener('playing', () => { resumeTries = 0; });
    el.addEventListener('error', () => {
      if (current && el.getAttribute('src')) setTimeout(resumeAudio, 600 * (resumeTries + 1));
      else current = null;
    });
    el.addEventListener('stalled', () => {
      if (current && el.src && Date.now() - lastNudge > 20000) {
        lastNudge = Date.now();
        resumeAudio();
      }
    });
  }
  function voiceMakeupDb() {                 // t59: how much to trim for the current EQ
    return 0.5 * Math.max(0, eqDb.bass) + 0.35 * Math.max(0, eqDb.mid) + 0.35 * Math.max(0, eqDb.treble)
      + (voicing ? 2.0 : 0);
  }
  function applyMakeup() {
    if (!makeup || !actx) return;
    makeup.gain.setTargetAtTime(Math.pow(10, -voiceMakeupDb() / 20), actx.currentTime, 0.05);   // t65: dB-honest — no fixed pad
  }
  function graph() {
    if (!actx) {
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });   // t60: deep buffers — no underrun crackle
        panner = actx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 22;              // whole store at full volume
        panner.maxDistance = 40;
        panner.rolloffFactor = 1.1;
        const set = (p, x, y, z) => p.positionX ? (p.positionX.value = x, p.positionY.value = y, p.positionZ.value = z) : p.setPosition(x, y, z);
        const a0 = ANCHOR[zone] || ANCHOR.store;   // t52: each device anchors in its own wing
        set(panner, a0.x, a0.y, a0.z);
        gate = actx.createGain();             // 1 in the store · 0 in the theater
        // t57: CONSOLE LIMITER — no matter how many cabinets sum, or how hot
        // the track is, peaks are caught before the output. Zero clipping.
        limiter = actx.createDynamicsCompressor();
        limiter.threshold.value = -2; limiter.knee.value = 3; limiter.ratio.value = 14;
        limiter.attack.value = 0.002; limiter.release.value = 0.12;   // t59: safety net only — the mix rides BELOW it
        gate.gain.value = 1;
        // ── t47 DJ chain: bass | mid | treble | fades | beat analyser ──
        eqLow = actx.createBiquadFilter(); eqLow.type = 'lowshelf'; eqLow.frequency.value = 120;
        eqMid = actx.createBiquadFilter(); eqMid.type = 'peaking'; eqMid.frequency.value = 1000; eqMid.Q.value = 1;
        eqHigh = actx.createBiquadFilter(); eqHigh.type = 'highshelf'; eqHigh.frequency.value = 6000;
        // t59 CINEMA VOICING — the Dolby-style polish AFTER the DJ EQ:
        // presence lift (dialogue/vocal clarity) + air shelf, then a rumble
        // filter (stream remuxes carry infrasonic junk that eats headroom —
        // a hidden clipper), then AUTO MAKEUP: whatever the EQ boosts gets
        // trimmed back so boosts buy TONE, not clipping. This was the crackle:
        // +dB went straight into a near-full-scale mix and the limiter rode
        // every kick. Now it never does.
        voiceP = actx.createBiquadFilter(); voiceP.type = 'peaking'; voiceP.frequency.value = 2800; voiceP.Q.value = 0.9; voiceP.gain.value = voicing ? 2.5 : 0;   // t60: STRONGER profile +
        voiceA = actx.createBiquadFilter(); voiceA.type = 'highshelf'; voiceA.frequency.value = 10000; voiceA.gain.value = voicing ? 3 : 0;                          // honors the toggle pre-play
        rumble = actx.createBiquadFilter(); rumble.type = 'highpass'; rumble.frequency.value = 33; rumble.Q.value = 0.72;
        makeup = actx.createGain(); applyMakeup();
        fadeGain = actx.createGain(); fadeGain.gain.value = 1;
        analyser = actx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.55;   // t59: faster, tighter kick band
        volGain = actx.createGain(); volGain.gain.value = volTarget;   // t60: the ONE volume stage
        // t63: apply SAVED EQ at build — settings made before the first play
        // were silently dropped when the graph was created (the 'buggy EQ').
        eqLow.gain.value = eqDb.bass; eqMid.gain.value = eqDb.mid; eqHigh.gain.value = eqDb.treble;
        Object.assign(eqApplied, eqDb);              // t63: pre-play EQ reaches the graph
        eqLow.connect(eqMid); eqMid.connect(eqHigh); eqHigh.connect(voiceP);
        trimG = actx.createGain(); trimG.gain.value = 0.55;   // t65: the THEATER trim — the stage that makes the movie array unbreakable
        voiceP.connect(voiceA); voiceA.connect(rumble); rumble.connect(makeup); makeup.connect(trimG); trimG.connect(fadeGain);   // t65: mirror of the theater chain
        fadeGain.connect(analyser);                       // beat/level tap
        // t55: THEATER-STYLE MATRIX — stereo buses feed each cabinet by side
        // (true binaural imaging in a headset), time-aligned to the floor
        // center; the booth subs carry the low-passed mono sum. No ring set →
        // the classic single anchored point.
        if (surround && surround.sats.length) {
          // t55: THEATER-STYLE MATRIX — stereo buses feed each cabinet by side
          // (a real stereo image, not a mono wash), classes carry the mix:
          // mains full, center filled, sides 60% +12 ms, rears 50% +23 ms
          // (Haas, like the theater array). HRTF panners with a gentle rolloff
          // keep everything CLOSE and wrapped around the listener.
          const setP = (p, x, y, zz) => p.positionX ? (p.positionX.value = x, p.positionY.value = y, p.positionZ.value = zz) : p.setPosition(x, y, zz);
          const split2 = actx.createChannelSplitter(2);
          fadeGain.connect(volGain); volGain.connect(split2);   // t60: volume rides here
          // t73: the t71 bus compressor is GONE — the theater (the owner-approved
          // reference) runs NO such stage; 3:1 density on the whole program reads
          // as "extra bass for no reason". Theater doctrine only.
          const busL = actx.createGain(), busR = actx.createGain();
          split2.connect(busL, 0); split2.connect(busR, 1);
          const cx0 = surround.center.x, cz0 = surround.center.z;
          // t78: RESONANCE AUDIO — the owner approved the Ambisonic ring in the
          // dance hall ("sounded better"); the jukebox ring gets the same engine.
          // One first-order soundfield with HRTF binaural decode replaces seven
          // independent PannerNodes; the WebAudio ring stands up verbatim if the
          // vendored file is absent (any browser, always).
          try {
            if (window.ResonanceAudio) resScene = new ResonanceAudio(actx, { ambisonicOrder: 1, dimensions: { width: 16, height: 4.5, depth: 18 } });
          } catch { resScene = null; }
          for (const sp of surround.sats) {
            const dx = sp.x - cx0, dz = sp.z - cz0;
            const kind = (Math.abs(dx) < 0.9 && dz < -1.2) ? 'center'
              : (Math.abs(dx) > 1.2 && dz < -1.2) ? 'main'
              : (dz > 1.2) ? 'rear' : 'side';
            let node = actx.createGain();
            // t57: BUS-SUM-SAFE levels — center receives L+R summed, each ear
            // hears main+side+rear+center; these keep the pre-limiter sum ≤ ~0.8
            node.gain.value = kind === 'main' ? 0.5 : kind === 'center' ? 0.18 : kind === 'rear' ? 0.22 : 0.3;   // t65: THEATER matrix levels (they ride behind the 0.55 trim)
            if (!resScene && (kind === 'side' || kind === 'rear')) {   // Haas — WebAudio path only; t78: Resonance renders direction itself
              const d2 = actx.createDelay(0.05);
              d2.delayTime.value = kind === 'side' ? 0.012 : 0.023;
              node.connect(d2); node = d2;
            }
            if (kind === 'main' && mainLevel == null) mainLevel = node.gain.value;
            // t71: STEEP bass management — one 12 dB/oct section at 85 Hz still passed
            // ~-8 dB of 55 Hz into EVERY cabinet, and all cabinets sum coherently in
            // the bass: the leak piled up at the knee and the bass read as coming
            // "from the room speakers" (the owner heard it). Two cascaded 110 Hz
            // Butterworth sections (24 dB/oct) leave the lows to the sub alone.
            const hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110; hp.Q.value = 0.707;
            const hp2 = actx.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 110; hp2.Q.value = 0.707;
            node.connect(hp); hp.connect(hp2); node = hp2;
            satHpHz = 110; satStages = 2;
            if (resScene) {
              const rs = resScene.createSource();
              try { rs.setDistanceModel(2.2, 50, 0.35); } catch {}   // t74 calibration carried over
              rs.setPosition(sp.x, 1.7, sp.z);      // ear level; the listener rides the camera
              node.connect(rs.input);
              resSources++;
            } else {
            const pn = actx.createPanner();
            pn.panningModel = 'HRTF'; pn.distanceModel = 'inverse';
            pn.refDistance = 2.2; pn.rolloffFactor = 0.35; pn.maxDistance = 50;   // t74: THEATER shading — equal slider = equal loudness in every room
            setP(pn, sp.x, 1.7, sp.z);   // t66: EAR LEVEL — cabinets hang high, but the
                                             // soundfield belongs at speaker HEIGHT = your
                                             // height. Ceiling-height HRTF reads as phasey
                                             // 'distortion' (same fix the dance hall got).
            node.connect(pn); pn.connect(gate);
            ringPanners.push(pn);
            }
            if (kind === 'center') { busL.connect(node); busR.connect(node); }
            else (dx < 0 ? busL : busR).connect(node);
          }
          if (resScene) { resScene.output.connect(gate); ringEngine = 'resonance'; }   // t78: soundfield → the room gate → knee → limiter (all doctrine intact); the omni sub bypasses the field
          // SUBS: the low-passed mono sum, NON-directional — real subs are omni
          // t73: THEATER-EXACT SUB — the reference room feeds each sub BOTH buses
          // through a 0.4 input gain; t65-t71 fed this bus at UNITY (mono sum = 2x
          // on correlated bass) then trimmed after — net +6..+9 dB over the
          // theater's in-room level = the "extra bass for no reason".
          subInNode = actx.createGain(); subInNode.gain.value = 0.4;
          const lp = actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 110; lp.Q.value = 0.707;
          subLp2 = actx.createBiquadFilter(); subLp2.type = 'lowpass'; subLp2.frequency.value = 110; subLp2.Q.value = 0.707;   // t73: 24 dB/oct — slope-matched to the satellite HPs (a 12 vs 24 mismatch summed a bump at 110 Hz)
          subLpNode = lp;
          // t67: SUB-BAND DYNAMICS — a slow RMS stage on the mono sub bus. Pure
          // tones measure clean, but real kicks are TRANSIENTS: two channels of
          // hot mastered bass sum into the sub and punch past every static
          // trim. This is the stage that keeps the bass tight at MAX volume.
          subDyn = actx.createDynamicsCompressor();
          subDyn.threshold.value = -10; subDyn.knee.value = 6; subDyn.ratio.value = 4;
          subDyn.attack.value = 0.01; subDyn.release.value = 0.15;
          lp.connect(subLp2); subLp2.connect(subDyn);
          const sg = actx.createGain(); sg.gain.value = 0.3;   // t73: THEATER-calibrated (0.34-after-unity-sum was ~+9 dB hot);   // t67 margin note superseded
          subGainNode = sg;
          busL.connect(subInNode); busR.connect(subInNode); subInNode.connect(lp); sg.connect(gate);   // t73: 0.4 input like the theater's SUB-L/R; lp→subLp2→subDyn→sg
        } else {
          analyser.connect(volGain); volGain.connect(panner);   // t60: smooth volume on this path too
          panner.connect(gate);
        }
        // t63: gentle tanh soft-clipper ahead of the limiter — transparent
        // below ~0.8, rounds off everything above. Kills the last crackle.
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
        gate.connect(softClip); softClip.connect(limiter); limiter.connect(actx.destination);
      } catch { actx = null; }
    }
    try { actx?.resume(); } catch { /* needs a gesture */ }
    if (el && actx && !el.dataset.vbGraphed) {
      try {
        el.dataset.vbGraphed = '1';
        actx.createMediaElementSource(el).connect(eqLow || panner);
        graphedEl = true; el.volume = 1;            // t63: node chain owns volume now
      } catch { /* stays on direct output */ el.volume = volTarget; }
    } else if (el && !actx) el.volume = volTarget;  // t63: no WebAudio → element volume IS the volume
  }

  function setZone(z) {                                    // t51: move the sound's home
    zone = z === 'dance' ? 'dance' : 'store';
    if (!surround && panner && actx) {                      // t53: a ring ignores the point anchor
      const a = ANCHOR[zone];
      const set = (p, x, y, zz) => p.positionX ? (p.positionX.value = x, p.positionY.value = y, p.positionZ.value = zz) : p.setPosition(x, y, zz);
      set(panner, a.x, a.y, a.z);
    }
    return zone;
  }

  return {
    play(item, opts) {
      if (opts?.zone) setZone(opts.zone);
      if (!item?.source || !item?.key) return false;
      // t39: video belongs to the theater — the jukebox takes every audio
      // kind (.mp3, .wav, ogg, flac, streams) but never a movie file
      if (/\.(mp4|m4v|webm|mkv|mov|avi)$/i.test(`${item.key || ''} ${item.file || ''}`)
        || ['movie', 'show', 'musicvideo'].includes(item.type)) return false;
      ensure(); graph();
      el.src = `/api/play/${item.source}/${encodeURIComponent(item.key)}?audio=1`;
      el.play().then(() => { current = item; }, () => { current = null; });
      current = item;
      return true;
    },
    stop() {
      if (el) { el.pause(); el.removeAttribute('src'); el.load(); }
      current = null;
    },
    nowPlaying: () => current ? { title: current.title } : null,
    element: () => el,          // tests/debug: reach the raw <audio>
    togglePlay() {
      if (!el) return;
      if (el.paused) el.play().catch(() => {});
      else el.pause();
    },
    seekBy(sec) {
      if (el && isFinite(el.duration) && el.duration > 0)
        el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + sec));
    },
    setVolume(v) {                      // t60/t63: smoothed node when graphed, element otherwise
      if (!el) return;
      const t = Math.max(0, Math.min(1, +v || 0));
      volTarget = t;
      el.muted = t === 0;
      if (graphedEl && volGain && actx) volGain.gain.setTargetAtTime(t, actx.currentTime, 0.03);
      else el.volume = t;                          // fallback: still smooth-CONTAINED, never stuck at 1
    },
    volumeInfo() {                       // t60 tests: the smooth-volume contract
      return { elementVolume: el ? el.volume : null, target: volTarget, node: !!volGain };
    },
    stats() {
      return {
        playing: !!current || (!!el && !el.paused && !!el.src),
        paused: !el || el.paused,
        time: el && isFinite(el.currentTime) ? el.currentTime : 0,
        duration: el && isFinite(el.duration) ? el.duration : 0,
        volume: volTarget,
        title: current?.title || null
      };
    },
    update(camera) {
      if (!actx || !gate) return;
      const p = camera.position;
      // t51 ROOM GATES — each zone is audible ONLY inside its own wing:
      //   · the theater NEVER hears the jukebox (either zone)
      //   · a DANCE set lives in the dance wing (hall + DJ's library) — zero
      //     bleed into the store or the front hall
      //   · a STORE set lives in the store + front hall — silent in the wing
      const inTheater = p.z < -D && Math.abs(p.x) < 5.6;
      const inWing = p.x > 6.2 && p.z < 9.2;
      const inHallway = p.z > D;                  // t53: front hallway — muted for the jukebox
      const inStoreRoom = !inTheater && !inWing && !inHallway;
      // t53: the jukebox is a MOVIE-STORE-ROOM device — silent in the hallway,
      // the theater and the dance wing. The booth's set stays in the wing.
      const audible = zone === 'dance' ? inWing : inStoreRoom;
      gate.gain.setTargetAtTime(audible ? 1 : 0, actx.currentTime, 0.09);
      const l = actx.listener;
      const fwd = _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      if (l.positionX) {
        l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
        l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      } else {
        l.setPosition(p.x, p.y, p.z);
        l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
      }
      if (resScene) {                                 // t78: the Ambisonic listener rides the camera
        try {
          resScene.setListenerPosition(p.x, p.y, p.z);
          resScene.setListenerOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
        } catch { try { resScene.setListenerOrientation(fwd, { x: 0, y: 1, z: 0 }); } catch {} }
      }
    },
    // ── t47: DJ controls ──
    setEq(band, db) {                       // bass | mid | treble, −14…+14 dB
      if (!eqDb.hasOwnProperty(band)) return;
      eqDb[band] = Math.max(-14, Math.min(14, +db || 0));
      const n = { bass: eqLow, mid: eqMid, treble: eqHigh }[band];
      if (n && actx) { n.gain.setTargetAtTime(eqDb[band], actx.currentTime, 0.05); eqApplied[band] = eqDb[band]; }   // t63: scheduled value is truth
      applyMakeup();                          // t59: boosts are toned back — tone, not clipping
    },
    eqInfo() { return { ...eqDb, applied: { ...eqApplied } }; },
    setVoicing(on) {                          // t59: cinema voicing on/off
      voicing = !!on;
      if (voiceP && actx) {
        voiceP.gain.setTargetAtTime(voicing ? 2.5 : 0, actx.currentTime, 0.05);   // t60: audible A/B
        voiceA.gain.setTargetAtTime(voicing ? 3 : 0, actx.currentTime, 0.05);
        applyMakeup();
      }
    },
    voiceInfo() {                             // t59 tests + DJ panel
      const vi = voiceMakeupDb();
      return { on: voicing, presence: 2.5, air: 3, makeupDb: +vi.toFixed(1) };
    },
    setRate(r) { if (el) el.playbackRate = Math.max(0.5, Math.min(1.5, +r || 1)); },
    rateInfo() { return el ? el.playbackRate : 1; },
    setFadeSecs(s) { fadeSecs = Math.max(0.2, Math.min(8, +s || 1.2)); },
    fadeSecsInfo() { return fadeSecs; },
    fade(direction, secs) {                // 'out' | 'in' — smooth gain ramp
      if (!fadeGain || !actx) return;
      const d = Math.max(0.05, secs || fadeSecs);
      fadeGain.gain.cancelScheduledValues(actx.currentTime);
      fadeGain.gain.setValueAtTime(fadeGain.gain.value, actx.currentTime);
      fadeGain.gain.linearRampToValueAtTime(direction === 'out' ? 0.0001 : 1, actx.currentTime + d);
    },
    // BEAT LEVELS for the dance-hall light rig (0..1 bass/mid/treble/energy)
    getLevels() {
      if (!analyser) return { bass: 0, mid: 0, treble: 0, energy: 0, live: false };
      analyser.getByteFrequencyData(freqData);
      const avg = (a, b) => { let s2 = 0; for (let i = a; i < b; i++) s2 += freqData[i]; return s2 / ((b - a) * 255); };
      const bass = avg(0, 3), mid = avg(3, 26), treble = avg(26, 96);   // t59: 512-pt FFT — kick band is bins 0–2
      return { bass, mid, treble, energy: (bass * 1.4 + mid + treble * 0.7) / 3, live: true };
    },
    onEnded(cb) { onEndedCb = typeof cb === 'function' ? cb : null; },
    setZone(z) { return setZone(z); },                     // t51: room zone
    zoneInfo() { return { zone, anchor: { ...ANCHOR[zone] } }; },
    setSurround(sats, subs, center) {                       // t53: install the speaker ring
      if (actx) return;                                    // graph already built — next boot
      surround = { sats: sats || [], subs: subs || [], center: center || { x: 0, y: 1.5, z: 0 } };
    },
    engineInfo() {                                          // t63/t65 tests: the output engine
      return { latencyHint: 'playback', softClip: !!softClip, graphed: graphedEl,
        clipCurve: (() => { const c = softClip && softClip.curve; if (!c) return null; const N = c.length, at = x => c[Math.round((x + 1) / 2 * (N - 1))]; return { zero: +Math.abs(at(0)).toFixed(3), half: +at(0.5).toFixed(3), top: +at(1).toFixed(3), slope: +((at(0.05) - at(-0.05)) / 0.1).toFixed(3) }; })(),
        staging: { trim: trimG ? trimG.gain.value : null, main: mainLevel, subLp: subLpNode ? subLpNode.frequency.value : null, subDyn: !!subDyn, busDyn: false, satHpHz, satStages, subIn: subInNode ? subInNode.gain.value : null, subLpStages: subLp2 ? 2 : 1, subGain: subGainNode ? subGainNode.gain.value : null } };   // t65+t67+t71+t73
    },
    limiterReduction() { return limiter ? +limiter.reduction.toFixed(2) : 0; },
    subReduction() { return subDyn ? +subDyn.reduction.toFixed(2) : 0; },   // t69: is the sub stage working?   // t66: live dB the limiter works — 0 = not riding = no clipping
    limiterInfo() {                                         // t57 tests: the safety limiter
      return limiter ? { on: true, threshold: limiter.threshold.value, ratio: limiter.ratio.value } : { on: false };
    },
    surroundInfo() {                                        // t53 tests: the live rig
      return { satY: 1.7,                              // t66/t78: cabinets render at ear level on either engine
        mode: resScene ? 'resonance-ring' : (surround && surround.sats.length ? 'hrtf-ring' : 'point'),
        engine: ringEngine, resSources,                  // t78: which renderer, how many live sources
        satellites: surround ? surround.sats.length : 0, subs: surround ? (surround.subs || []).length : 0,
        live: resScene ? resSources : ringPanners.length,
        ref: resScene ? 2.2 : (ringPanners[0] ? +ringPanners[0].refDistance.toFixed(1) : null),   // t74 calibration on either engine
        rolloff: resScene ? 0.35 : (ringPanners[0] ? +ringPanners[0].rolloffFactor.toFixed(2) : null) };
    },
    zoneAudible(camOrPos) {                        // tests: would the gate pass sound here?
      const p = camOrPos?.position || camOrPos || { x: 0, z: 0 };
      const inTheater = p.z < -D && Math.abs(p.x) < 5.6;
      const inWing = p.x > 6.2 && p.z < 9.2;
      const inHallway = p.z > D;                  // t53: hallway hears NO jukebox
      const inStoreRoom = !inTheater && !inWing && !inHallway;
      return zone === 'dance' ? inWing : inStoreRoom;
    },
    dispose() { this.stop(); el = null; }
  };
}
