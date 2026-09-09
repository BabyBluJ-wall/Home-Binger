// ─────────────────────────────────────────────────────────────────────────────
//  store3d/tv.js — the wall-mounted TV: the store's playback screen
//  ───────────────────────────────────────────────────────────────────────────
//  Lives on the far wall, centered, above the back shelf, facing the door.
//
//  ▶ PLAYING: when a player selects an item off a shelf it plays HERE:
//      · movie / show / music video → the actual video, streamed through
//        this server from Plex/Jellyfin (token never touches the browser)
//      · demo-library titles → an animated "feature presentation" title card
//      · music albums → an audio visualizer (with real audio when the server
//        can stream it, animated bars otherwise)
//  ⏸ IDLE: while nothing is selected the TV idles on the admin's choice —
//      'standby' (a friendly "NOW PLAYING: NOTHING" screen), 'loop' (the
//      built-in synthwave channel), 'url', or a pinned library 'item'.
//
//  Playback starts from a real click, so sound is allowed; the 🔊 TV button
//  (or ⏹ Stop) controls it.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '/vendor/three.module.js';
import { LAYOUT } from './config.js?v=1788983715036';
import { signTexture, hashString } from './textures.js?v=1788983715036';
import { computeTheaterSpeakers } from './room.js?v=1788983715036';   // 8.2 layout (shared with the room mesh)

const TW = 512, TH = 288;   // screen canvas LOGICAL resolution (drawing code)
const SS = 3.75;            // supersample: device canvas = TW×SS × TH×SS = 1920×1080.
                            // The canvas is the IDLE/UI surface only (t43) — light +
                            // throttled. Movies NEVER composite through it: they ride a
                            // direct GPU VideoTexture at NATIVE media res (720p/1080p/4K)
                            // viewing no longer looks pixelated); mip levels
                            // still keep it clean from across the store.
const ACCENT = '#ff3ea5';   // fallback neon pink (default Neon Night theme)
let THEME_ACCENT = ACCENT;  // live accent — synced from the user's theme

export function buildTV(theme) {
  const L = LAYOUT;
  const D = L.room.l / 2;
  const group = new THREE.Group();
  group.name = 'tv';

  const DEFAULT_VOLUME = 0.25;   // gentle default — nobody likes a player at full blast
  // The TV is retired: this is now the THEATER's wall-mounted projection
  // screen, flat on the theater's far wall (buildTheater owns the room; the
  // screen plane + frame + marquee live here with the playback engine).
  const THR = L.theater;   // NOTE: THR, not TH — TH is the screen-canvas height!
  const SCREEN_W = THR.screen.w, SCREEN_H = SCREEN_W * 9 / 16;
  const CY = THR.screen.cy;
  const TILT = 0;          // flat wall mount — no tilt in the theater
  const Z = -D - LAYOUT.room.wallThickness - THR.l + 0.12;   // screen wall inner face

  // frame
  const bezel = new THREE.Mesh(
    new THREE.BoxGeometry(SCREEN_W + 0.22, SCREEN_H + 0.22, 0.09),
    new THREE.MeshStandardMaterial({ color: '#0b0e14', roughness: 0.4, metalness: 0.6 })
  );
  bezel.position.set(0, CY, Z - 0.02);
  group.add(bezel);

  // screen
  const screenMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), screenMat);
  screen.position.set(0, CY, Z + 0.04);
  group.add(screen);

  // glow cast toward the seats
  const glow = new THREE.PointLight(0x86b8ff, 10, 11, 1.8);
  glow.position.set(0, CY, Z + 1.4);
  group.add(glow);

  // ── screen canvas (everything non-video is drawn here) ──
  const cv = document.createElement('canvas');
  cv.width = TW * SS; cv.height = TH * SS;                   // supersampled
  const g = cv.getContext('2d');
  g.scale(SS, SS);                                           // draw in logical px
  const screenTex = new THREE.CanvasTexture(cv);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.generateMipmaps = false;         // t43: full-chain regen per upload was pure waste
  screenTex.minFilter = THREE.LinearFilter;
  screenTex.anisotropy = 8;                                  // clean at grazing angles
  let t = 0;   // animation clock

  // ── "NOW PLAYING" marquee above the TV ──
  let plateTex = null;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.28),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, toneMapped: false })
  );
  // marquee ABOVE the TV (like a theater sign) — the 14ft ceiling gives it
  // room: bezel top ~3.27, plate center 3.53, ceiling 4.27
  plate.position.set(0, CY - SCREEN_H / 2 - 0.22, Z + 0.05);   // t40: marquee BELOW the screen
  group.add(plate);
  let plateText = null;
  function setPlate(text) {
    plateText = text;
    if (!text) { plate.material.opacity = 0; return; }
    plateTex?.dispose();
    plateTex = signTexture(`NOW PLAYING · ${text}`, {
      accent: THEME_ACCENT, bg: 'rgba(6,12,32,0.92)', width: 1024, height: 120, fontSize: 54
    });
    plate.material.map = plateTex;
    plate.material.opacity = 1;
    plate.material.needsUpdate = true;
  }

  // ── media elements (one video + one audio, reused) ──
  let videoEl = null;
  let audioEl = null, analyser = null, audioData = null;
  let videoFailed = false;
  // TRUE only after the <video> has PRESENTED an actual frame for the new src.
  // The screen must never sample the video texture before this: an un-painted
  // video maps to uninitialised texture memory, which renders as a GREY
  // rectangle for a few frames (the classic intermittent "grey box" flash).
  let videoPainted = false;
  // t46: factory-scoped — startCurrent and the fullscreen paths all use this.
  // (It lived inside ensureVideo; calling it after a fullscreen exit was a
  // ReferenceError that killed the next play.)
  const hideVideoEl = () => {
    if (videoEl) videoEl.style.cssText = 'position:fixed;left:-20px;top:-20px;width:2px;height:2px;opacity:0.001;pointer-events:none';
  };
  let lastMode = null, lastPaint = -1;        // t43 paint-scheduler state
  let barsBlack = false;                       // t44: black letterbox painted this session?
  let paintCount = 0;                          // t43: canvas paints (perf telemetry)
  function markVideoSrc() {
    videoPainted = false;
    if (!videoEl) return;
    if (videoEl.requestVideoFrameCallback) {
      videoEl.requestVideoFrameCallback(() => { videoPainted = true; });   // fired per painted frame
    }
    // fallback for browsers without rVFC: playback position advancing on a
    // decoded frame is good enough evidence a frame exists
    videoEl.addEventListener('timeupdate', function onT() {
      if (videoEl.videoWidth > 0 && videoEl.currentTime > 0) {
        videoPainted = true;
        videoEl.removeEventListener('timeupdate', onT);
      }
    });
  }

  function ensureVideo() {
    if (videoEl) return;
    videoEl = document.createElement('video');
    // loop is OFF for item playback — the queue's onEnded() advances/repeats
    // (the idle-URL mode below sets loop=true for its ambient video)
    videoEl.loop = false; videoEl.muted = true; videoEl.playsInline = true;
    videoEl.setAttribute('playsinline', '');
    // t43: the element must LIVE IN THE DOM (hidden) — detached media elements
    // never fire loadedmetadata in some browsers, which starves the screen
    hideVideoEl();
    document.body.appendChild(videoEl);
    videoEl.addEventListener('ended', () => {
      if (S.playing) onEnded();          // queue auto-advance/repeat
    });
    // ── mid-stream resilience ── a network hiccup used to kill playback with a
    // dead "signal lost" card. Now: reload and RESUME from the last position
    // (the browser re-requests with a Range header), a few tries with backoff.
    let resumeTries = 0;
    const resumeVideo = () => {
      if (!videoEl || !S.playing || S.playing.kind !== 'video') { videoFailed = true; return; }
      if (resumeTries >= 5) { videoFailed = true; return; }
      resumeTries++;
      const at = videoEl.currentTime || 0;
      const src = videoEl.getAttribute('src');
      if (!src) { videoFailed = true; return; }
      videoFailed = false;
      videoEl.src = src;
      videoEl.load();
      videoEl.addEventListener('loadedmetadata', function onMeta() {
        videoEl.removeEventListener('loadedmetadata', onMeta);
        try { videoEl.currentTime = at; } catch { /* fresh start if unsupported */ }
        videoEl.play().catch(() => { videoEl.muted = true; videoEl.play().catch(() => { videoFailed = true; }); });
      });
    };
    videoEl.addEventListener('error', () => {
      if (S.playing && S.playing.kind === 'video' && videoEl.getAttribute('src')) {
        setTimeout(resumeVideo, 600 * (resumeTries + 1));      // backoff between tries
      } else videoFailed = true;
    });
    videoEl.addEventListener('playing', () => { resumeTries = 0; });
    let lastStallNudge = 0;
    videoEl.addEventListener('stalled', () => {
      // data stopped arriving while playing → one nudge per 20 s
      if (S.playing && S.playing.kind === 'video' && Date.now() - lastStallNudge > 20000) {
        lastStallNudge = Date.now();
        resumeVideo();
      }
    });
    // NOTE: no VideoTexture here on purpose — video frames are composited
    // through the screen canvas (t43: a VideoTexture quad carries it). A raw GPU video
    // texture has a window where it samples uninitialised memory and shows
    // a GREY rectangle (stream start, stalls, reconnects). The canvas is
    // always fully drawn, so that artifact cannot happen.
    try { audioGraph(videoEl); } catch { /* straight output if WebAudio says no */ }
  }
  // audio twin of resumeVideo — music on the big screen used to die on the
  // first hiccup with nothing but a 'signal lost' card
  let audioResumeTries = 0, lastAudioNudge = 0;
  function resumeAudio() {
    if (!audioEl || !S.playing || S.playing.kind !== 'audio') return;
    if (audioResumeTries >= 5) { videoFailed = true; return; }
    audioResumeTries++;
    const at = audioEl.currentTime || 0;
    const src = audioEl.getAttribute('src');
    if (!src) { videoFailed = true; return; }
    audioEl.src = src;
    audioEl.load();
    audioEl.addEventListener('loadedmetadata', function onMeta() {
      audioEl.removeEventListener('loadedmetadata', onMeta);
      try { audioEl.currentTime = at; } catch { /* fresh start if unsupported */ }
      audioEl.play().catch(() => { videoFailed = true; });
    });
  }

  function ensureAudio() {
    if (audioEl) return;
    audioEl = document.createElement('audio');
    audioEl.loop = false;                // queue's onEnded() handles repeats
    audioEl.addEventListener('playing', () => { audioResumeTries = 0; });
    audioEl.addEventListener('error', () => {
      if (S.playing && S.playing.kind === 'audio' && audioEl.getAttribute('src')) {
        setTimeout(resumeAudio, 600 * (audioResumeTries + 1));
      } else videoFailed = true;
    });
    audioEl.addEventListener('stalled', () => {
      if (S.playing && S.playing.kind === 'audio' && Date.now() - lastAudioNudge > 20000) {
        lastAudioNudge = Date.now();
        resumeAudio();
      }
    });
    audioEl.addEventListener('ended', () => {
      if (S.playing) onEnded();
    });
  }
  // WebAudio analyser gives REAL spectrum bars when audio actually streams.
  // ROOM-LOCAL SOUND: every media element routes through ONE shared graph
  // with a PannerNode parked at the screen — volume falls off with distance
  // (the theater is 'soundproofed': the store barely hears it). While you
  // watch full-screen you sit at the screen → full loudness.
  let actx = null, roomGain = null, tvLimiter = null, speakerMeta = [];
  let roomWired = false, discreteMode = false, tvSubDyns = 0;   // t60/t67: limiter ≤2 ch · sub dynamics
  const volGains = []; let volTarget = DEFAULT_VOLUME;      // t63: EVERY element's volume node —
  let softClipT = null;                                     // video AND audio each get one, all tracked
  const _fwd = new THREE.Vector3();
  // the theater's inner walls (sound boundary)
  const THR_B = (() => {
    const t = LAYOUT.theater, D = LAYOUT.room.l / 2 + LAYOUT.room.wallThickness;
    return { x: t.w / 2, z0: -D, z1: -D - t.l };
  })();
  function inTheaterBounds(p) {
    return Math.abs(p.x) <= THR_B.x && p.z <= THR_B.z0 && p.z >= THR_B.z1;
  }
  // ── 8.2 SURROUND — the speaker array ────────────────────────────────────
  // One feed matrix, two output modes:
  //  · MULTICHANNEL hardware (browser exposes ≥6 output channels) → discrete
  //    7.1 ChannelMerger (FL FR FC LFE BL BR SL SR). True discrete channels.
  //  · Stereo output → every speaker becomes its own EQUAL-POWER panner at
  //    its cabinet position (no HRTF 'head shadow' coloring) — a room of 10
  //    physical sources panned by real azimuth as you walk.
  // Matrix: mains = L/R · sides = 55% +12 ms · rears = 42% +23 ms (Haas,
  // decorrelates the field like real surround speakers) · both subs = the
  // low-passed mono sum.
  function buildSpeakerArray() {
    const SPS = computeTheaterSpeakers();
    const discrete = actx.destination.channelCount >= 6;
    discreteMode = discrete;
    let merger = null;
    if (discrete) { merger = actx.createChannelMerger(8); merger.connect(roomGain); }
    const CH71 = { FL: 0, FR: 1, BL: 4, BR: 5, SL: 6, SR: 7 };
    speakerMeta = [];
    const chains = {};
    for (const sp of SPS) {
      const input = actx.createGain();
      let node = input;
      if (sp.kind === 'side') { const d = actx.createDelay(0.05); d.delayTime.value = 0.012; node.connect(d); node = d; }
      if (sp.kind === 'rear') { const d = actx.createDelay(0.05); d.delayTime.value = 0.023; node.connect(d); node = d; }
      if (sp.kind === 'sub') {               // t67: sub-band dynamics — real kick transients,
        const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 110; node.connect(f); node = f;
        const sd = actx.createDynamicsCompressor();
        sd.threshold.value = -10; sd.knee.value = 6; sd.ratio.value = 4;
        sd.attack.value = 0.01; sd.release.value = 0.15;
        node.connect(sd); node = sd; tvSubDyns++;
      }
      if (discrete) {
        const ch = sp.kind === 'sub' ? 3 : (CH71[sp.id] ?? -1);
        if (ch >= 0) node.connect(merger, 0, ch);
      } else {
        const p = actx.createPanner();
        p.panningModel = 'HRTF';         // t53: true binaural imaging in a
        p.distanceModel = 'inverse';     // headset — fronts, sides and rears
        p.refDistance = 2.2;             // place around the head; gentle
        p.maxDistance = 50;              // distance shading keeps the matrix
        p.rolloffFactor = 0.35;          // (Haas delays + levels) in charge
        setPannerPos(p, sp.x, sp.y, sp.z);
        node.connect(p); p.connect(roomGain);
      }
      chains[sp.id] = { input, level: sp.kind === 'main' ? 0.5 : sp.kind === 'side' ? 0.3 : sp.kind === 'rear' ? 0.22 : 0.4 };   // t57: per-ear & per-channel safe
      speakerMeta.push(sp.id);
    }
    if (discrete) {
      const fc = actx.createGain(); fc.gain.value = 0.1; fc.connect(merger, 0, 2);    // gentle center fill (t57)
      chains.FC = { input: fc, level: 1 };
    }
    return chains;
  }

  function audioGraph(el) {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });   // t60: deep output buffers — underrun crackle gone
      roomGain = actx.createGain();              // the SOUNDPROOF WALL: 1 inside
      roomGain.gain.value = 1;                   // the room, 0 everywhere else
      tvLimiter = actx.createDynamicsCompressor();   // t57: console limiter — the sub
      tvLimiter.threshold.value = -2; tvLimiter.knee.value = 3; tvLimiter.ratio.value = 14;   // t59: mix rides below it —
      tvLimiter.attack.value = 0.002; tvLimiter.release.value = 0.12;                         // safety net only
      tvLimiter.connect(actx.destination);   // t60: roomGain wires to ONE of these per
                                             // mode below — see audioGraph()
    }
    try { actx.resume(); } catch { /* gesture requirement */ }
    if (el.dataset.vbGraphed) return null;       // one MediaElementSource per element
    el.dataset.vbGraphed = '1';
    const src = actx.createMediaElementSource(el);
    const chains = buildSpeakerArray();
    if (!roomWired) {                          // t60: pick the output path ONCE —
      roomWired = true;                        // discrete 7.1 → STRAIGHT to the destination
      if (discreteMode) roomGain.connect(actx.destination);   // (a compressor would down-mix
      else {                                   //  8 ch to 2 = collapse + grit); stereo → limiter
        // t63: gentle tanh soft-clipper before the limiter — transparent up
        // to ~0.8, then it rounds peaks off instead of letting them slam.
        // This is the stage that finally kills residual crackle on hot masters.
        softClipT = actx.createWaveShaper();
        const n = 1024, curve = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          // t70: UNITY soft-knee — y = x EXACTLY below 0.85. The t63 tanh curve had a
          // 1.47x zero-crossing slope (hidden +5.4 dB boost = "louder than every other
          // app") and saturated loud program at max volume. Above the knee it eases to
          // a 0.965 ceiling; below it, bit-transparent.
          const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x), K = 0.85;
          curve[i] = a <= K ? x : Math.sign(x) * (K + (1 - K) * Math.tanh((a - K) / (1 - K)));
        }
        softClipT.curve = curve; softClipT.oversample = '2x';
        roomGain.connect(softClipT); softClipT.connect(tvLimiter);
      }
    }
    // t59: HONEST GAIN STAGING — the array sums ~1.5× per ear at full volume,
    // which slammed the limiter (that riding = the crackle). A rumble filter
    // + 0.55 trim puts the worst case at ~0.84 — the limiter becomes a true
    // safety net instead of a stage of the mix.
    const vp = actx.createBiquadFilter(); vp.type = 'peaking'; vp.frequency.value = 2800; vp.Q.value = 0.9; vp.gain.value = 2.5;   // t60: CINEMA
    const va = actx.createBiquadFilter(); va.type = 'highshelf'; va.frequency.value = 10000; va.gain.value = 3;                     // VOICING — dialogue
    const rumbleT = actx.createBiquadFilter(); rumbleT.type = 'highpass'; rumbleT.frequency.value = 30; rumbleT.Q.value = 0.72;     // presence + air, on
    const trimT = actx.createGain(); trimT.gain.value = 0.55;                                                                        // for every movie
    const vg = actx.createGain(); vg.gain.value = volTarget;  // t63: per-element node, ALL tracked
    volGains.push(vg);                                         // (old bug: one node var — play a movie,
    const volGainT = vg;                                       //  then music → the movie's volume orphaned)
    src.connect(vp); vp.connect(va); va.connect(rumbleT); rumbleT.connect(trimT); trimT.connect(volGainT);
    // stereo bus → the matrix
    const split = actx.createChannelSplitter(2);
    volGainT.connect(split);
    const busL = actx.createGain(), busR = actx.createGain();
    split.connect(busL, 0); split.connect(busR, 1);
    const feed = (id, bus) => { const c = chains[id]; if (!c) return; c.input.gain.value = c.level; bus.connect(c.input); };
    for (const id of ['FL', 'SL', 'BL']) feed(id, busL);
    for (const id of ['FR', 'SR', 'BR']) feed(id, busR);
    for (const id of ['SUB-L', 'SUB-R']) { const c = chains[id]; if (c) { c.input.gain.value = c.level; busL.connect(c.input); busR.connect(c.input); } }
    if (chains.FC) { busL.connect(chains.FC.input); busR.connect(chains.FC.input); }
    return src;
  }
  function setPannerPos(p, x, y, z) {
    if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
    else p.setPosition(x, y, z);
  }
  function ensureAnalyser() {
    if (analyser || !audioEl) return;
    try {
      const src = audioGraph(audioEl);
      if (!src) return;
      analyser = actx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);                    // tap — analyser needs no output
      audioData = new Uint8Array(analyser.frequencyBinCount);
    } catch { analyser = null; /* visualizer falls back to animated bars */ }
  }
  function stopMedia() {
    exitFullscreen();                                  // detach the DOM layer if up
    if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); }
    if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); }
    videoFailed = false;
    videoPainted = false;
  }

  // ── TRUE full-screen video ── the raw <video> is promoted to a fixed DOM
  // layer at native resolution (better than any in-store zoom). Esc or the ✕
  // chip exits. Movies/music videos only — audio keeps the visualizer.
  let fsActive = false;
  // Removing a <video> from the DOM queues a PAUSE (spec) — an immediate
  // play() right after removal loses the race and the queued pause wins.
  // Resume on the pause event itself (+ a timeout safety net).
  function resumeAfterDetach() {
    const tryPlay = () => videoEl.play().catch(() => {});
    videoEl.addEventListener('pause', tryPlay, { once: true });
    setTimeout(() => { videoEl.removeEventListener('pause', tryPlay); tryPlay(); }, 300);
  }
  function enterFullscreen() {
    if (!S.playing) return false;
    // swap out any previous layer (e.g. movie ended → album auto-advanced)
    const prev = document.getElementById('vb-fs-video');
    const prevWasPlaying = prev?.tagName === 'VIDEO' && !videoEl.paused;
    if (prev) { prev.removeAttribute('id'); prev.parentNode?.removeChild(prev); }
    if (prevWasPlaying && S.playing?.kind === 'video') resumeAfterDetach();
    if (S.playing.kind === 'video' && videoEl) {
      videoEl.id = 'vb-fs-video';                     // the movie itself, native resolution
      videoEl.style.cssText = '';                     // t46: drop the hidden-attach styles — the
                                                      // fullscreen sheet owns the layout now
      if (!videoEl.parentNode) document.body.appendChild(videoEl);
    } else {
      cv.id = 'vb-fs-video';                          // the SCREEN canvas — visualizer / title cards big
      if (!cv.parentNode) document.body.appendChild(cv);
    }
    fsActive = true;
    document.body.classList.add('tv-fullscreen');
    hudShow();
    emit();
    return true;
  }
  function exitFullscreen() {
    if (!fsActive) return;
    fsActive = false;
    document.body.classList.remove('tv-fullscreen');
    hudHide();
    const el = document.getElementById('vb-fs-video');
    // NOTE: removing a <video> from the DOM PAUSES it (spec behaviour) — that
    // was the "video lagged when leaving full screen" bug. Resume explicitly.
    const wasVideo = el?.tagName === 'VIDEO';
    const wasPlaying = wasVideo && !videoEl.paused;
    if (el) { el.removeAttribute('id'); el.parentNode?.removeChild(el); }   // video OR canvas back to duty
    if (wasVideo) hideVideoEl();                 // t46: detached ≠ styled — keep it truly hidden
    if (wasPlaying) resumeAfterDetach();
    emit();
  }
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && fsActive) exitFullscreen();
  });

  // ── full-screen HUD — seek bar + transport controls. While playing it
  // fades out after a few idle seconds (cursor + Esc hint go with it);
  // any mouse move or key press brings it back. Paused/seeking keeps it up.
  // The in-store view never shows a progress bar — this layer is fs-only.
  let tvSelf = null, hudTimer = null, hudTick = null, hudSeeking = false;
  const byId = (id) => document.getElementById(id);
  const fmtHud = (s) => !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function hudPaint() {
    const el = tvSelf && tvSelf.mediaEl(); if (!el) return;
    const d = el.duration, pct = d ? (el.currentTime / d) * 100 : 0;
    const p = byId('tv-fs-played'), th = byId('tv-fs-thumb'), b = byId('tv-fs-buffered');
    if (p) p.style.width = pct + '%';
    if (th) th.style.left = pct + '%';
    if (b && el.buffered.length) b.style.width = ((el.buffered.end(el.buffered.length - 1) / (d || 1)) * 100) + '%';
    const t = byId('fs-time'); if (t) t.textContent = `${fmtHud(el.currentTime)} / ${fmtHud(d)}`;
    const play = byId('fs-play'); if (play) play.textContent = el.paused ? '▶' : '⏸';
  }
  function hudWake() {
    if (!fsActive) return;
    document.body.classList.remove('fhud-idle');
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
      const el = tvSelf && tvSelf.mediaEl();
      if (fsActive && el && !el.paused && !hudSeeking) document.body.classList.add('fhud-idle');
      else hudWake();               // paused or mid-seek: stay awake
    }, 2600);
  }
  function hudShow() {
    const h = byId('tv-fs-hud'); if (!h) return;
    h.classList.remove('hidden');
    const title = byId('tv-fs-title');
    if (title) title.textContent = (S.playing && S.playing.item && S.playing.item.title) || '';
    const el = tvSelf && tvSelf.mediaEl(), vol = byId('fs-vol');
    const vi = tvSelf && tvSelf.volumeInfo();
    if (vol && vi && document.activeElement !== vol) vol.value = Math.round(vi.target * 100);   // t63: the TARGET, not the pinned element
    clearInterval(hudTick);
    hudTick = setInterval(hudPaint, 250);
    hudPaint();
    hudWake();
  }
  function hudHide() {
    clearTimeout(hudTimer); clearInterval(hudTick);
    hudTimer = null; hudTick = null; hudSeeking = false;
    document.body.classList.remove('fhud-idle');
    const h = byId('tv-fs-hud'); if (h) h.classList.add('hidden');
  }
  document.addEventListener('mousemove', () => { if (fsActive) hudWake(); });
  document.addEventListener('keydown', () => { if (fsActive) hudWake(); }, true);
  function wireHud() {
    const bar = byId('tv-fs-seek');
    if (bar && !bar.dataset.wired) {
      bar.dataset.wired = '1';
      const seekTo = (e) => {
        const el = tvSelf && tvSelf.mediaEl();
        if (!el || !isFinite(el.duration)) return;
        const r = bar.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        el.currentTime = pct * el.duration;
        hudPaint();
      };
      bar.addEventListener('pointerdown', (e) => { hudSeeking = true; try { bar.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ } seekTo(e); });
      bar.addEventListener('pointermove', (e) => { if (hudSeeking) seekTo(e); });
      bar.addEventListener('pointerup', () => { hudSeeking = false; hudWake(); });
    }
    const on = (id, fn) => { const b = byId(id); if (b) b.addEventListener('click', fn); };
    on('tv-fs-close', () => exitFullscreen());
    on('fs-prev', () => tvSelf && tvSelf.step(-1));
    on('fs-next', () => tvSelf && tvSelf.step(1));
    on('fs-back', () => tvSelf && tvSelf.seekBy(-10));
    on('fs-fwd', () => tvSelf && tvSelf.seekBy(10));
    on('fs-play', () => tvSelf && tvSelf.togglePlay());
    const vol = byId('fs-vol');
    if (vol && !vol.dataset.wired) {
      vol.dataset.wired = '1';
      vol.addEventListener('input', () => tvSelf && tvSelf.setVolume(vol.value / 100));
    }
  }

  // ═════════ state ═════════
  const S = {
    enabled: true,
    idleMode: 'standby',     // 'standby' | 'loop' | 'url' | 'item'
    idleTitle: null,
    playing: null,           // { item, kind: 'video' | 'card' | 'audio' }
    onStateChange: null
  };

  // Admin/idle configuration (called at boot & after admin saves).
  function setIdle({ enabled, idleMode, title, src }) {
    S.enabled = enabled !== false;
    S.idleMode = ['white', 'standby', 'loop', 'url', 'item'].includes(idleMode) ? idleMode : 'white';
    S.idleTitle = title || null;
    // Personal idle picks stream via /api/play/<source>/<key>; the store-wide
    // default uses /api/tv/stream. Either way it's proxied through this server.
    S.idleSrc = src || '/api/tv/stream';
    if (!S.playing) applyIdle();
    emit();
  }

  // Point the video element at whatever the idle mode needs (or clear it).
  function applyIdle() {
    setPlate(null);
    if (!S.enabled) return;
    if (S.idleMode === 'url' || S.idleMode === 'item') {
      ensureVideo();
      videoFailed = false;
      videoEl.muted = true;
      videoEl.src = S.idleSrc || '/api/tv/stream';
      videoEl.loop = true;               // ambient loop (no queue in idle mode)
      markVideoSrc();
      videoEl.play().catch(() => {});
    } else {
      stopMedia();
    }
  }

  // ▶ Play a shelf item on the TV. `item` is a normalized library item.
  // ── QUEUE / REPEAT ──
  // playItem(item, {list, index}) seeds a playlist (e.g. one library's items
  // in the current sort order). When a track ends: repeat-one replays it,
  // repeat-all wraps around, otherwise the queue plays through then stops.
  S.queue = S.queue || { list: [], index: -1, mode: 'off' };

  function playItem(item, queue) {
    if (!item?.id) return;                                  // guard bad calls
    if (playKindFor(item) === 'audio') {                    // t39: .mp3/.wav/radio NEVER play
      setPlate(`${item.title || 'That disk'} — ♪ jukebox only`);   // on the theater screen —
      emit();                                               // the deck points you to the wall unit
      return false;
    }
    stopMedia();
    // COPY the list — callers hand us their own array (a live filter result),
    // and queue edits (play-next splices) must never mutate their copy
    if (queue?.list?.length) S.queue = { list: [...queue.list], index: queue.index ?? 0, mode: S.queue?.mode || 'off' };
    else {
      // standalone play: keep any existing queue position for this item
      const qi = S.queue?.list?.findIndex(i => i.id === item.id) ?? -1;
      if (qi >= 0) S.queue.index = qi;
      else S.queue = { list: [item], index: 0, mode: S.queue?.mode || 'off' };
    }
    startCurrent();
  }

  function startCurrent() {
    const item = S.queue.list[S.queue.index];
    if (!item) { stop(); return; }
    S.playing = { item, kind: playKindFor(item) };
    if (fsActive) enterFullscreen();          // swap the DOM layer to the new kind (video ⇄ visualizer)

    if (S.playing.kind === 'video') {
      ensureVideo();
      if (!fsActive && (videoEl.id === 'vb-fs-video' || !videoEl.parentNode)) {
        videoEl.id = '';
        hideVideoEl();
        if (!videoEl.parentNode) document.body.appendChild(videoEl);
      }
      videoFailed = false;
      videoEl.muted = false;               // started from a real click → sound OK
      videoEl.volume = 1;               // t60: the gain node owns volume — no zipper steps
      videoEl.src = `/api/play/${item.source}/${encodeURIComponent(item.key)}`;
      markVideoSrc();
      videoEl.play().catch(() => {         // autoplay refused → retry muted
        videoEl.muted = true;
        videoEl.play().catch(() => { videoFailed = true; });
      });
    } else if (S.playing.kind === 'audio') {
      ensureAudio();
      videoFailed = false;
      audioEl.muted = false;
      audioEl.volume = 1;               // t60: the gain node owns volume
      if (item.source) {
        audioEl.src = `/api/play/${item.source}/${encodeURIComponent(item.key)}?audio=1`;
        audioEl.play().then(() => ensureAnalyser()).catch(() => { videoFailed = true; });
      }
    }
    setPlate(item.title);
    emit();
  }

  // auto-advance / repeat when a track or video finishes
  function onEnded() {
    const q = S.queue;
    if (!q?.list?.length) { stop(); return; }
    if (q.mode === 'one') { startCurrent(); return; }          // repeat-one
    if (q.index < q.list.length - 1) { q.index++; startCurrent(); return; }
    if (q.mode === 'all' && q.list.length > 1) { q.index = 0; startCurrent(); return; }
    if (q.mode === 'all') { startCurrent(); return; }          // single-item repeat-all
    stop();                                                    // queue finished
  }

  // Routing is EXTENSION-AWARE (t39): the file itself decides first, type
  // second — a stray .mp3 typed as a movie still routes to the jukebox, and
  // a video file on a music-shaped item still gets the big screen.
  const VIDEO_EXT = /\.(mp4|m4v|webm|mkv|mov|avi)$/i;
  const AUDIO_EXT = /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i;
  function playKindFor(item) {
    const f = `${item.key || ''} ${item.file || ''}`;
    if (VIDEO_EXT.test(f)) return 'video';
    if (AUDIO_EXT.test(f)) return 'audio';
    if (['album', 'episode', 'radio'].includes(item.type)) return 'audio';
    if (!item.source) return 'card';
    return 'video';
  }

  function stop() {
    stopMedia();
    S.playing = null;
    applyIdle();
    emit();
  }

  function emit() { S.onStateChange?.(publicState()); }
  function publicState() {
    return {
      playing: S.playing ? { title: S.playing.item.title, kind: S.playing.kind } : null,
      enabled: S.enabled,
      fullscreen: fsActive
    };
  }

  // ═════════ drawing routines (canvas) ═════════
  const bgGradient = (hueA, hueB) => {
    const grd = g.createLinearGradient(0, 0, 0, TH);
    grd.addColorStop(0, `hsl(${hueA} 65% 12%)`);
    grd.addColorStop(1, `hsl(${hueB} 70% 26%)`);
    g.fillStyle = grd; g.fillRect(0, 0, TW, TH);
  };
  function wrapText(text, maxW, font) {
    g.font = font;
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
      if (lines.length === 3) { lines[2] = lines[2] + '…'; break; }
    }
    if (line && lines.length < 3) lines.push(line);
    return lines;
  }

  // IDLE 'white': a blank WHITE projection screen — unlit fabric, the default
  function drawWhite(dt) {
    g.fillStyle = '#f1efe6';
    g.fillRect(0, 0, TW, TH);
    const vg = g.createRadialGradient(TW / 2, TH / 2, TH * 0.32, TW / 2, TH / 2, TW * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(74,62,48,0.12)');
    g.fillStyle = vg;
    g.fillRect(0, 0, TW, TH);
  }

  // IDLE 'standby': the classic starry "NOW PLAYING: NOTHING" card (back by
  // popular demand — it's a selectable option, no longer the default)
  function drawStandby(dt) {
    bgGradient(228, 210);
    for (let i = 0; i < 26; i++) {
      const x = (hashString('s' + i) % TW + t * (8 + i % 5)) % TW;
      const y = hashString('y' + i) % TH;
      g.fillStyle = `rgba(255,255,255,${0.12 + 0.5 * Math.abs(Math.sin(t * 1.4 + i))})`;
      g.fillRect(x, y, 2, 2);
    }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = '700 17px system-ui, sans-serif';
    g.fillText('NOW PLAYING', TW / 2, 74);
    g.fillStyle = THEME_ACCENT;
    g.font = 'italic 900 58px system-ui, sans-serif';
    g.fillText('NOTHING', TW / 2, 118);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.font = '500 15px system-ui, sans-serif';
    g.fillText('bring a movie case to the theater deck', TW / 2, 162);
    const fy = 216 + Math.sin(t * 2) * 3;
    g.strokeStyle = 'rgba(255,210,63,0.8)'; g.lineWidth = 2;
    g.strokeRect(TW / 2 - 60, fy - 12, 120, 24);
    for (let i = -52; i <= 52; i += 13) g.strokeRect(TW / 2 + i - 3, fy - 8, 6, 16);
  }

  // IDLE: synthwave attraction loop
  function drawLoop(dt) {
    const w = TW, h = TH;
    const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
    sky.addColorStop(0, '#05010f'); sky.addColorStop(0.55, '#26074d'); sky.addColorStop(1, '#7a1a63');
    g.fillStyle = sky; g.fillRect(0, 0, w, h * 0.62);
    const sunY = h * 0.34 + Math.sin(t * 0.6) * 6;
    const grad = g.createLinearGradient(0, sunY - 40, 0, sunY + 40);
    grad.addColorStop(0, '#ffe259'); grad.addColorStop(1, '#ff2e8b');
    g.fillStyle = grad;
    g.beginPath(); g.arc(w / 2, sunY, 40, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(5,1,15,0.85)';
    for (let i = 0; i < 5; i++) g.fillRect(w / 2 - 42, sunY + 4 + i * 8 + (t * 14 % 8), 84, 3);
    g.fillStyle = '#0b0318'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.strokeStyle = 'rgba(0,255,229,0.75)'; g.lineWidth = 1.3;
    const horizon = h * 0.62;
    for (let i = 0; i < 12; i++) {
      const z = (i + (t * 0.55 % 1)) / 12;
      const y = horizon + Math.pow(z, 2.2) * (h - horizon);
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    for (let i = -8; i <= 8; i++) {
      g.beginPath(); g.moveTo(w / 2 + i * 13, horizon); g.lineTo(w / 2 + i * 80, h); g.stroke();
    }
    const msg = '  ★ HOME BINGER  •  ALL THE HITS, ALL THE TIME  •  BE KIND, REWIND  ';
    g.font = 'italic 900 26px system-ui, sans-serif';
    g.fillStyle = THEME_ACCENT;
    const tw = g.measureText(msg).width;
    g.fillText(msg, w - (t * 80 % tw), h - 16);
    g.fillText(msg, w - (t * 80 % tw) + tw, h - 16);
  }

  // PLAYING (demo titles): animated "feature presentation" title card
  function drawTitlecard(item) {
    const hue = hashString(item.title || '?') % 360;
    bgGradient((hue + 20) % 360, hue);
    // sweeping diagonal stripes
    g.save(); g.globalAlpha = 0.08; g.strokeStyle = '#fff'; g.lineWidth = 14;
    for (let i = -2; i < 8; i++) {
      const x = ((i * 90 + t * 40) % (TW + 180)) - 90;
      g.beginPath(); g.moveTo(x, TH); g.lineTo(x + 120, 0); g.stroke();
    }
    g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = THEME_ACCENT;
    g.font = '700 15px system-ui, sans-serif';
    g.fillText(`★ ${String(item.type || 'movie').toUpperCase()} ★`, TW / 2, 58);
    // title with a gentle sheen
    const lines = wrapText(item.title, TW * 0.82, 'italic 900 34px system-ui, sans-serif');
    lines.forEach((l, i) => {
      const y = 128 + (i - (lines.length - 1) / 2) * 40;
      g.font = 'italic 900 34px system-ui, sans-serif';
      g.fillStyle = '#fff';
      g.fillText(l, TW / 2, y);
      const sheen = ((t * 260) % (TW + 300)) - 150;
      g.save();
      g.beginPath(); g.rect(sheen - 40, y - 26, 80, 52); g.clip();
      g.fillStyle = THEME_ACCENT;
      g.fillText(l, TW / 2, y);
      g.restore();
    });
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = '500 13px system-ui, sans-serif';
    if (item.year) g.fillText(String(item.year), TW / 2, 200);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillText('— presentation card · this title has no stream —', TW / 2, 236);
  }

  // PLAYING (music): spectrum visualizer (real FFT when audio streams)
  // ── music visualizer (customizable per user — see My Visualizer) ──
  S.viz = S.viz || { style: 'bars' };
  function vizColor() {
    const c = THEME_ACCENT;   // visualizer color = theme accent, always
    // hex → rgba helper
    const hx = c.replace('#', '');
    const r = parseInt(hx.slice(0, 2), 16), gg = parseInt(hx.slice(2, 4), 16), b = parseInt(hx.slice(4, 6), 16);
    return (a) => `rgba(${r},${gg},${b},${a})`;
  }
  function drawVisualizer(item) {
    bgGradient(258, 300);
    const bars = 24, bw = (TW - 40) / bars;
    let levels = null;
    if (analyser && !videoFailed) {
      analyser.getByteFrequencyData(audioData);
      levels = [...audioData.slice(0, bars)].map(v => v / 255);
    }
    const lvlAt = (i) => levels
      ? levels[i]
      : 0.25 + 0.55 * Math.abs(Math.sin(t * 2.1 + i * 0.55) * Math.cos(t * 0.7 + i * 0.21));
    const rgba = vizColor();
    const style = S.viz.style || 'bars';

    if (style === 'mirror') {
      // bars mirrored around a center line
      const cy = TH / 2 + 20;
      for (let i = 0; i < bars; i++) {
        const bh = 4 + lvlAt(i) * 62;
        g.fillStyle = rgba(0.9);
        g.fillRect(20 + i * bw + 2, cy - bh, bw - 4, bh);
        g.fillStyle = rgba(0.35);
        g.fillRect(20 + i * bw + 2, cy + 2, bw - 4, bh);
      }
      g.fillStyle = rgba(0.5); g.fillRect(20, cy, TW - 40, 1);
    } else if (style === 'wave') {
      // one flowing line riding the spectrum
      g.strokeStyle = rgba(1); g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i <= bars * 2; i++) {
        const k = i / 2;
        const lvl = lvlAt(Math.min(bars - 1, Math.floor(k)));
        const y = TH / 2 + 30 - Math.sin(i * 0.5 + t * 2.2) * (8 + lvl * 70);
        const x = 20 + (i / (bars * 2)) * (TW - 40);
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
      g.strokeStyle = rgba(0.25); g.lineWidth = 6; g.stroke();
    } else if (style === 'pulse') {
      // concentric rings breathing with the bass
      const cx = TW / 2, cy = TH / 2 + 20;
      let bass = 0;
      for (let i = 0; i < 6; i++) bass += lvlAt(i);
      bass /= 6;
      for (let r = 0; r < 5; r++) {
        const rad = 18 + r * 22 + bass * 60 + Math.sin(t * 3 + r) * 4;
        g.strokeStyle = rgba(0.85 - r * 0.15);
        g.lineWidth = 3 + bass * 5;
        g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = rgba(0.9);
      g.beginPath(); g.arc(cx, cy, 8 + bass * 18, 0, Math.PI * 2); g.fill();
    } else {
      // 'bars' — the classic, with reflection
      for (let i = 0; i < bars; i++) {
        const bh = 8 + lvlAt(i) * 130;
        const grd = g.createLinearGradient(0, TH - 40 - bh, 0, TH - 40);
        grd.addColorStop(0, rgba(1)); grd.addColorStop(1, rgba(0.45));
        g.fillStyle = grd;
        g.fillRect(20 + i * bw + 2, TH - 40 - bh, bw - 4, bh);
        g.fillStyle = rgba(0.12);
        g.fillRect(20 + i * bw + 2, TH - 38, bw - 4, bh * 0.25);
      }
    }
    // spinning disc
    const cx = TW / 2, cy = 88;
    g.save();
    g.translate(cx, cy); g.rotate(t * 1.4);
    g.fillStyle = '#0c0f22'; g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fill();
    g.strokeStyle = THEME_ACCENT; g.lineWidth = 2;
    for (let r = 6; r <= 30; r += 6) { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = THEME_ACCENT; g.beginPath(); g.arc(0, 0, 3.5, 0, Math.PI * 2); g.fill();
    g.restore();
    g.textAlign = 'center';
    g.fillStyle = '#fff'; g.font = 'italic 800 20px system-ui, sans-serif';
    const lines = wrapText(item.title, TW * 0.8, 'italic 800 20px system-ui, sans-serif');
    lines.forEach((l, i) => g.fillText(l, TW / 2, 148 + i * 24));
    if (videoFailed || !analyser) {
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '500 12px system-ui, sans-serif';
      g.fillText('audio visualization', TW / 2, 174 + lines.length * 24);
    }
  }

  // PLAYING (video): the picture NEVER touches the 2D canvas (t43) — a
  // dedicated quad carries a THREE.VideoTexture straight off the <video>
  // element (GPU path, native media resolution) letterboxed inside the screen
  let vidTex = null, videoQuad = null;
  function ensureVideoQuad() {
    if (videoQuad || !videoEl) return;
    vidTex = new THREE.VideoTexture(videoEl);
    vidTex.colorSpace = THREE.SRGBColorSpace;
    vidTex.generateMipmaps = false;
    vidTex.minFilter = THREE.LinearFilter;
    videoQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: vidTex, toneMapped: false }));
    videoQuad.position.set(0, CY, Z + 0.045);
    videoQuad.visible = false;
    group.add(videoQuad);
  }
  function fitVideoQuad() {                    // contain-fit the film inside the 16:9 screen
    const ar = (videoEl.videoWidth && videoEl.videoHeight) ? videoEl.videoWidth / videoEl.videoHeight : 16 / 9;
    let w = SCREEN_W, h = SCREEN_W / ar;
    if (h > SCREEN_H) { h = SCREEN_H; w = SCREEN_H * ar; }
    videoQuad.scale.set(w, h, 1);
  }

  function drawBuffering(item) {
    bgGradient(228, 198);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = THEME_ACCENT; g.lineWidth = 5;
    g.beginPath();
    g.arc(TW / 2, TH / 2 - 14, 22, t * 4, t * 4 + Math.PI * 1.4);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = '600 14px system-ui, sans-serif';
    g.fillText('Loading the reel…', TW / 2, TH / 2 + 30);
  }

  // ═════════ per-frame update ═════════
  let lastCam = null;                                   // t53: gate target reads need a camera
  function update(dt, camera) {
    lastCam = camera;
    if (actx && camera) {
      const l = actx.listener;
      // Fullscreen = the BEST SEAT: the listener sits at the room's sweet
      // spot facing the screen, so the surround field is perfectly laid out
      const SWEET = { x: 0, y: 1.6, z: THR_B.z0 - LAYOUT.theater.l * 0.52 };
      const p = fsActive ? SWEET : camera.position;
      const fwd = fsActive ? _fwd.set(0, 0, -1) : _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
      if (l.positionX) {
        l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
        l.forwardX.value = fwd.x; l.forwardY.value = fwd.y; l.forwardZ.value = fwd.z;
      } else {
        l.setPosition(p.x, p.y, p.z);
        l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
      }
      // SOUNDPROOFED ROOMS: full array inside the theater; past the walls
      // the room gain mutes it COMPLETELY — the store hears nothing.
      if (roomGain) {
        const inside = fsActive || inTheaterBounds(camera.position);
        roomGain.gain.setTargetAtTime(inside ? 1 : 0, actx.currentTime, 0.09);
      }
    }
    t += dt;
    if (!S.enabled) {
      screenMat.map = null;
      screenMat.color.set('#05070c');
      glow.intensity = 0.4;
      screenMat.needsUpdate = true;
      return;
    }
    screenMat.color.set('#ffffff');

    let mode;
    if (S.playing) mode = S.playing.kind;
    else if (S.idleMode === 'loop') mode = 'loop';
    else if ((S.idleMode === 'url' || S.idleMode === 'item') && videoEl && videoPainted && videoEl.readyState >= 2 && !videoFailed) mode = 'video-idle';
    else if (S.idleMode === 'white') mode = 'white';
    else mode = 'standby';

    // ── t43 paint scheduler: the canvas uploads ONLY when something changed ──
    // idle cards animate at 15 fps (twinkle needs no more), 'white' paints
    // ONCE (it is a wall), and a playing movie uses the video quad below —
    // the 2D canvas just supplies the black letterbox backing, painted once.
    const videoLive = (mode === 'video' || mode === 'video-idle')
      && videoEl && videoPainted && videoEl.readyState >= 2 && !videoFailed;
    ensureVideoQuad();
    if (videoQuad) {
      videoQuad.visible = !!videoLive && !fsActive;   // DOM layer owns the picture in fullscreen
      if (videoQuad.visible) fitVideoQuad();
    }
    const modeChanged = mode !== lastMode;
    let painted = false;
    if (mode === 'video' && !videoLive) {             // streaming… show the reel (15 fps is plenty)
      if (modeChanged || t - lastPaint >= 0.066) { drawBuffering(S.playing.item); painted = true; }
      glow.color.set('#7aa7ff');
    } else if (videoLive) {
      // BLACK letterbox behind the film — once per playback session (t44:
      // the screen's base is black, top and bottom bars included)
      if (modeChanged || !barsBlack) { g.fillStyle = '#000'; g.fillRect(0, 0, TW, TH); barsBlack = true; painted = true; }
      glow.color.set('#9fc4ff');
    } else if (mode === 'white') {
      if (modeChanged) { drawWhite(); painted = true; }               // static — one paint total
      glow.color.set('#86b8ff');
    } else {                                          // standby / loop / card / audio: 15 fps
      if (modeChanged || t - lastPaint >= 0.066) {
        if (mode === 'card') drawTitlecard(S.playing.item);
        else if (mode === 'audio') drawVisualizer(S.playing.item);
        else if (mode === 'loop') drawLoop();
        else drawStandby();
        painted = true;
      }
      glow.color.set(mode === 'loop' ? '#7aa7ff' : '#86b8ff');
    }
    lastMode = mode;
    if (!videoLive) barsBlack = false;         // next playback re-blacks the bars
    screenMat.map = screenTex;                 // t44: the canvas IS the screen surface — a t43
                                               // regression detached it (white plane, dead idle UI)
    if (painted) { screenTex.needsUpdate = true; lastPaint = t; paintCount++; }
    glow.intensity = 8 + Math.sin(t * 7.3) * 1.1 + Math.random() * 0.6;
  }

  // ── mounting tilt ── the set hangs high and tips DOWN toward the viewer, so
  // standing close / zoomed fills noticeably more of the screen. ~15° reads
  // as a real store mount (45° would look bolted-on sideways); the ⛶ remote
  // button gives a true full-screen when you want the whole picture.
  const pivot = new THREE.Group();
  pivot.position.set(0, CY, Z);
  for (const kid of [...group.children]) {
    kid.position.y -= CY;
    kid.position.z -= Z;
    pivot.add(kid);
  }
  group.add(pivot);
  pivot.rotation.x = TILT;

  // ── mounting arms ── two steel arms bridge from the theater wall plane to
  // the back of the screen frame, like a real wall mount
  const armLen = 0.3;
  const armGeo = new THREE.BoxGeometry(0.16, 0.09, armLen);
  const armMat = new THREE.MeshStandardMaterial({ color: 0x161a22, metalness: 0.7, roughness: 0.45 });
  for (const ax of [-0.55, 0.55]) {
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.set(ax, CY + SCREEN_H * 0.28, Z - armLen / 2);
    group.add(arm);
  }

  const api = {
    focusPoint: new THREE.Vector3(0, CY, Z),   // world pos of the screen (watch-mode check)
    group,
    setIdle,
    playItem,
    stop,
    update,
    state: S,
    isPlaying: () => !!S.playing,
    nowPlaying: publicState,
    setMuted(muted) {
      if (videoEl) videoEl.muted = muted;
      if (audioEl) audioEl.muted = muted;
    },
    isMuted() { return !videoEl || videoEl.muted; },
    // ── TV REMOTE (HUD controls) ──
    mediaEl() {
      if (S.playing?.kind === 'audio') return audioEl || ensureAudio();
      if (S.playing?.kind === 'video') return videoEl || ensureVideo();
      return null;                       // 'card' items have no timeline
    },
    togglePlay() {
      const el = this.mediaEl();
      if (!el) return;
      if (el.paused) el.play().catch(() => { videoFailed = true; });
      else el.pause();
    },
    seekBy(sec) {
      const el = this.mediaEl();
      if (!el || !isFinite(el.duration)) return;
      el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + sec));
    },
    setVolume(v) {                        // 0..1 — t60: ONE smoothed gain node
      const t = Math.max(0, Math.min(1, +v || 0));
      volTarget = t;                      // remembered pre-play — the graph picks it up
      const el = this.mediaEl();
      if (el) { el.volume = 1; el.muted = t === 0; }
      for (const vg of volGains) vg.gain.setTargetAtTime(t, actx.currentTime, 0.03);   // t63: every element's node ramps together
    },
    volumeInfo() {                         // t60 tests: the smooth-volume contract
      const el = this.mediaEl();
      return { elementVolume: el ? el.volume : null, target: volTarget, nodes: volGains.length };
    },
    voiceInfo() {                          // t60 tests: cinema voicing, always on here
      return { on: true, presence: 2.5, air: 3, makeupDb: 0 };
    },
    limiterReduction() { return tvLimiter ? +tvLimiter.reduction.toFixed(2) : 0; },   // t66: live distortion meter
    engineInfo() {                         // t60 tests: underrun-proof engine facts
      return { latencyHint: 'playback', discreteMode, softClip: !!softClipT, subDyns: tvSubDyns, limiterPath: discreteMode ? 'discrete-direct' : 'stereo-limiter',
        clipCurve: (() => { const c = softClipT && softClipT.curve; if (!c) return null; const N = c.length, at = x => c[Math.round((x + 1) / 2 * (N - 1))]; return { zero: +Math.abs(at(0)).toFixed(3), half: +at(0.5).toFixed(3), top: +at(1).toFixed(3), slope: +((at(0.05) - at(-0.05)) / 0.1).toFixed(3) }; })() };
    },
    // ⏭ PLAY NEXT — insert into the queue right after the current item
    playNext(item) {
      if (!item?.id) return 'ignored';
      if (!S.playing) { this.playItem(item); return 'now'; }
      const q = S.queue || (S.queue = { list: [S.playing.item], index: 0, mode: 'off' });
      q.list.splice(q.index + 1, 0, item);
      return 'next';
    },
    // jump to a queue entry (click in the queue panel)
    step(dir) {
      const q = S.queue;
      if (!q?.list?.length) return;
      const n = q.list.length;
      let i = q.index + dir;
      if (i < 0) i = n - 1;             // wrap backwards to the end
      if (i >= n) i = 0;                // wrap forward to the top
      this.playAt(i);
    },
    mediaPaused() { return !videoEl || videoEl.paused; },
    playAt(index) {
      const q = S.queue;
      if (!q || index < 0 || index >= q.list.length) return;
      q.index = index;
      startCurrent();
    },
    setVisualizer(viz) {
      S.viz = { style: viz?.style || 'bars' };
      emit();
    },
    getVisualizer() { return { style: S.viz?.style || 'bars', color: THEME_ACCENT }; },
    setThemeAccent(hex) {
      if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return;
      THEME_ACCENT = hex;
      if (plateText) setPlate(plateText);   // re-render the marquee in the new accent
    },
    getScreenRes() { return [cv.width, cv.height]; },
    surfaceInfo() {                            // t43: what's on the screen right now
      return { idleMode: S.idleMode,            // t51: which idle screen is picked
        surface: videoQuad?.visible ? 'video-texture' : (S.enabled ? 'canvas' : 'off'),
        videoRes: (videoEl?.videoWidth ? [videoEl.videoWidth, videoEl.videoHeight] : null),
        // wiring facts (headless chrome cannot decode ANY video — blob mp4 AND
        // webm all die with MEDIA_ERR_SRC_NOT_SUPPORTED — so tests assert the
        // direct path is BUILT and FED rather than that frames painted)
        videoAttached: !!(videoQuad && vidTex && vidTex.image === videoEl),
        srcSet: /\/api\/play\//.test(videoEl?.src || ''),
        canvasAttached: screenMat.map === screenTex,   // t44: idle cards actually displayed
        letterboxBlack: barsBlack };
    },
    getPaintCount() { return paintCount; },
    enterFullscreen,
    exitFullscreen,
    fullscreenActive: () => fsActive,
    tiltRadians: () => pivot.rotation.x,
    surroundInfo: () => actx
      ? { mode: actx.destination.channelCount >= 6 ? 'discrete-7.1' : 'panner-array',
          panning: actx.destination.channelCount >= 6 ? 'discrete' : 'HRTF',   // t53
          gate: 'theater-room',                                               // t53: soundproofed
          outChannels: actx.destination.channelCount, speakers: speakerMeta.filter(s => !s.startsWith('SUB')), subs: speakerMeta.filter(s => s.startsWith('SUB')).length }
      : { mode: 'not-started', speakers: [], subs: 0 },
    roomGateValue: () => roomGain ? +roomGain.gain.value.toFixed(2) : null,    // t53: the wall's live gain (audio clock)
    limiterInfo: () => tvLimiter ? { on: true, threshold: tvLimiter.threshold.value, ratio: tvLimiter.ratio.value } : { on: false },   // t57
    roomGateTarget: () => (actx && roomGain && lastCam)                        // t53 tests: where the wall is HEADED
      ? ((fsActive || inTheaterBounds(lastCam.position)) ? 1 : 0) : null,
    mountInfo: () => ({ tilt: pivot.rotation.x, z: Z, wallZ: -D, gap: Z + D,
      plateY: plate.position.y, screenTop: CY + SCREEN_H / 2, screenBottom: CY - SCREEN_H / 2 }),
    setRepeatMode(mode) {
      if (!['off', 'all', 'one'].includes(mode)) return;
      S.queue = S.queue || { list: [], index: -1, mode: 'off' };
      S.queue.mode = mode;
    },
    getRepeatMode() { return S.queue?.mode || 'off'; },
    queueInfo() {
      const q = S.queue;
      return q ? { length: q.list.length, index: q.index, mode: q.mode, raw: q.list,
        current: q.list[q.index]?.title || null, next: q.list[q.index + 1]?.title || null } : null;
    },
    stats() {
      const el = this.mediaEl();
      return {
        playing: !!S.playing, kind: S.playing?.kind || null,
        paused: el ? el.paused : true,
        time: el && isFinite(el.currentTime) ? el.currentTime : 0,
        duration: el && isFinite(el.duration) ? el.duration : 0,
        volume: el ? el.volume : DEFAULT_VOLUME
      };
    },
    applyTheme() { /* TV is theme-independent */ },
    dispose() {
      stopMedia();
      screenTex.dispose(); plateTex?.dispose();
    }
  };
  tvSelf = api;                 // HUD handlers reach the transport controls
  wireHud();
  return api;
}
