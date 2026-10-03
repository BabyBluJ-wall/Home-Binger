// ─────────────────────────────────────────────────────────────────────────────
//  yt.js — t152: YOUTUBE ON THE STORE TV, no YouTube chrome
// ─────────────────────────────────────────────────────────────────────────────
//  The Guide's search box takes YouTube links: paste one, hit Enter, and the
//  video plays on the theater's big screen through the app's OWN controls
//  (play/pause · back/forward · volume — the full-screen HUD). No YouTube
//  overlay: the embed runs with controls off, cards off, keyboard off, and
//  the iframe itself is click-through — every interaction is OURS.
//  t157: PLAYLIST links work too — /playlist?list=… (and watch?v=…&list=…)
//  load the whole list; ⏭/⏮ step through it and the title card follows.
//
//  Testable by design: if window.YT.Player already exists (a stub can inject
//  it before the app loads), the network script is never fetched.
// ─────────────────────────────────────────────────────────────────────────────

let apiPromise = null;

// A YouTube link → its 11-ish-char video id. Accepts watch / shorts / embed /
// live / youtu.be forms (with or without extra params). Anything else → null.
export function ytId(input) {
  const s = String(input || '').trim();
  if (!s || !/^https?:\/\//i.test(s)) return null;
  let m = /^https?:\/\/(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)([\w-]{8,20})/i.exec(s);
  if (!m) m = /^https?:\/\/youtu\.be\/([\w-]{8,20})/i.exec(s);
  return m ? m[1] : null;
}

// A YouTube PLAYLIST link → { list, videoId? }. Matches /playlist?list=… and
// watch/shorts/youtu.be links that carry a &list= (those play the playlist,
// starting at the linked video). Anything else → null.
export function ytPlaylistId(input) {
  const s = String(input || '').trim();
  if (!s || !/^https?:\/\//i.test(s)) return null;
  const host = /^(?:www\.|m\.|music\.)?youtube\.com$/i.test(s.split('/')[2] || '') || /^youtu\.be$/i.test(s.split('/')[2] || '');
  if (!host) return null;
  const list = /[?&]list=([A-Za-z0-9_-]{10,60})/.exec(s);
  if (!list) return null;
  const v = ytId(s);
  return { list: list[1], videoId: v && !/\/playlist\?/.test(s) ? v : null };
}

// Resolves the YT Iframe API namespace — loads it once, on demand.
export function ytReady() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { apiPromise = null; reject(new Error('YouTube took too long to load')); }, 15000);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        try { prev?.(); } catch {}
        clearTimeout(timer);
        window.YT?.Player ? resolve(window.YT) : reject(new Error('YouTube API missing'));
      };
      const sc = document.createElement('script');
      sc.src = 'https://www.youtube.com/iframe_api';
      sc.onerror = () => { clearTimeout(timer); apiPromise = null; reject(new Error('Could not reach YouTube')); };
      document.head.appendChild(sc);
    });
  }
  return apiPromise;
}

// createYtPlayer(mountDiv, { videoId, list }, handlers) → controller.
// The controller works BEFORE the API is ready (safe no-ops + polled state),
// so the HUD can bind to it immediately. t157: a list loads the PLAYLIST
// (videoId optional — the starting video when both are given).
export function createYtPlayer(mount, spec, { onReady, onEnded, onError, onAutoMuted, onTitle } = {}) {
  const videoId = typeof spec === 'string' ? spec : (spec?.videoId || null);   // legacy call shape
  const listId = typeof spec === 'object' && spec ? (spec.list || null) : null;
  // t157b: a playlist id must NEVER pose as a video id — "PL…" is not a
  // video; YouTube answers with a dead "Video unavailable" player that never
  // starts and never ends, freezing the TV on its title card (owner report:
  // playlists "get stuck"). Playlist-only links carry no starting video.
  const vidOk = (v) => !!v && /^[\w-]{8,20}$/.test(v) && v !== listId
    && !(listId && v.length > 12 && /^(PL|UU|FL|LL|RD|OL)/i.test(v));
  const startId = vidOk(videoId) ? videoId : null;
  let player = null, poll = null, dead = false, ccOn = false, lastTitle = '';
  let nudgeT = null, endT = null, guardT = null;   // t157b: stuck-proofing timers
  const state = { paused: true, t: 0, d: 0, vol: 1 };
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };
  // t157b: a stepped-to video that sits UNSTARTED (-1) or CUED (5) a moment
  // later gets one playVideo() nudge — covers autoplay-policy quirks where
  // nextVideo() advances the index but never starts playback
  const stepNudge = () => {
    clearTimeout(nudgeT);
    nudgeT = setTimeout(() => {
      if (dead || !player) return;
      const st = safe(() => player.getPlayerState());
      if (st === -1 || st === 5) safe(() => player.playVideo());
    }, 1500);
  };
  // t153: captions OFF through our own toggle — with YouTube's controls
  // stripped there is no in-player way to dismiss them, so we own it.
  const ccApply = () => {
    if (!ccOn) { safe(() => player?.setOption?.('captions', 'track', {})); return; }
    let list = safe(() => player?.getOption?.('captions', 'tracklist')) || [];
    if (!Array.isArray(list) || !list.length) list = [{ languageCode: 'en' }];
    const pick = list.find(t => /^en/i.test(String(t?.languageCode || ''))) || list[0];
    safe(() => player?.setOption?.('captions', 'track', { languageCode: pick.languageCode || 'en' }));
  };

  ytReady().then((YT) => {
    if (dead) return;
    player = new YT.Player(mount, {
      width: '100%', height: '100%',
      // t157b: a starting video rides the PLAIN list param — YouTube's
      // documented "play this video, then continue the playlist" embed.
      // listType+list (the videoseries form) is only sent when there is no
      // starting video, and the onReady fallback below then guarantees the
      // list actually loads whichever way the embed behaves.
      ...(startId ? { videoId: startId } : {}),
      // the no-overlay contract: no controls, no cards, no keyboard, no
      // fullscreen button, no related-video wall — and our CSS makes the
      // iframe itself click-through. t157: a list rides the playerVars
      playerVars: {
        autoplay: 1, controls: 0, rel: 0, iv_load_policy: 3,
        modestbranding: 1, disablekb: 1, playsinline: 1, fs: 0,
        origin: location.origin,
        ...(listId ? (startId ? { list: listId } : { listType: 'playlist', list: listId }) : {})
      },
      events: {
        onReady: (e) => {
          if (dead) return;
          const title = safe(() => e.target.getVideoData?.()?.title) || '';
          // t157b: the playlist guarantee — if the constructor's list vars
          // didn't take (player sitting unstarted, nothing loaded), load the
          // list explicitly. Covers every embed form YouTube actually honors.
          if (listId && !startId) {
            const has = safe(() => e.target.getVideoData?.()?.video_id) || (safe(() => e.target.getPlaylist?.()) || []).length;
            if (!has) safe(() => e.target.loadPlaylist?.({ listType: 'playlist', list: listId }));
          }
          poll = setInterval(() => {
            if (dead || !player) { clearInterval(poll); return; }
            state.t = safe(() => player.getCurrentTime()) ?? state.t;
            state.d = safe(() => player.getDuration()) ?? state.d;
            state.paused = safe(() => player.getPlayerState()) !== 1;
            // t157: playlists advance on their own — the title card follows
            const t = safe(() => player.getVideoData?.()?.title) || '';
            if (t && t !== lastTitle) { lastTitle = t; onTitle?.(t); }
          }, 250);
          e.target.playVideo();
          ccApply();               // t153: captions start OFF — our CC button turns them on
          // autoplay-with-sound can be refused — the muted retry ladder
          // (same idea as the <video> path), then any user control unmutes
          setTimeout(() => {
            if (dead) return;
            const st = safe(() => player.getPlayerState());
            if (st === -1 || st === 5) {
              safe(() => player.mute());
              e.target.playVideo();
              onAutoMuted?.();
            }
          }, 900);
          // t157b: the stuck-guard — a playlist that never actually starts
          // (private, removed, a Mix YouTube refuses to embed) must never
          // hang the TV. Buffering gets extra patience; a user pause is
          // never an error.
          if (listId) {
            const armGuard = (left) => {
              clearTimeout(guardT);
              guardT = setTimeout(() => {
                if (dead || !player) return;
                const st = safe(() => player.getPlayerState());
                if (st === 1 || st === 2) return;
                if (st === 3 && left > 0) return armGuard(left - 1);
                onError?.(new Error('The playlist never started'));
              }, 12000);
            };
            armGuard(2);
          }
          onReady?.(title);
        },
        onStateChange: (e) => {
          if (dead) return;
          state.paused = e.data !== 1;
          if (e.data === 1) { clearTimeout(nudgeT); clearTimeout(guardT); }   // t157b: alive — guards off
          if (e.data === 1 && ccOn) ccApply();      // t157: each new playlist video re-enforces captions
          if (e.data !== 0) return;
          // ENDED. t157: inside a playlist the player auto-advances — only
          // the true end of the list hands control back to the TV's queue.
          // t157b: when the auto-advance stalls (it happens), a nudge fires
          // nextVideo() — the TV can never freeze on a black ended frame.
          if (listId) {
            const idx = safe(() => player.getPlaylistIndex());
            const len = (safe(() => player.getPlaylist()) || []).length;
            if (typeof idx === 'number' && idx > -1 && len && idx < len - 1) {
              clearTimeout(nudgeT);
              nudgeT = setTimeout(() => {
                if (dead || !player) return;
                if (safe(() => player.getPlayerState()) === 0) safe(() => player.nextVideo());
              }, 1800);
              return;                                   // more to come
            }
            clearTimeout(endT);
            endT = setTimeout(() => {                   // last one (or unknown) — grace period, then done
              if (dead || !player) return;
              if (safe(() => player.getPlayerState()) === 1) return;
              onEnded?.();
            }, 1200);
            return;
          }
          onEnded?.();            // single video → the TV's own queue logic
        },
        onError: () => { if (!dead) onError?.(); }
      }
    });
  }).catch((e) => { if (!dead) onError?.(e); });

  return {
    get paused() { return state.paused; },
    get currentTime() { return state.t; },
    get duration() { return state.d; },
    get volume() { return state.vol; },
    play() { safe(() => { player?.unMute?.(); player?.playVideo?.(); }); },
    pause() { safe(() => player?.pauseVideo?.()); },
    seekTo(t) { state.t = t; safe(() => player?.seekTo?.(Math.max(0, Math.min(state.d || 1e9, t)), true)); },
    setVolume(v) { state.vol = Math.max(0, Math.min(1, +v || 0)); safe(() => { if (state.vol > 0) player?.unMute?.(); player?.setVolume?.(Math.round(state.vol * 100)); }); },
    get ccOn() { return ccOn; },
    setCc(on) { ccOn = !!on; ccApply(); },
    get playlist() { return !!listId; },
    get playlistIndex() { return safe(() => player?.getPlaylistIndex?.()) ?? -1; },
    get playlistLength() { return (safe(() => player?.getPlaylist?.()) || []).length; },
    // t157b: after a manual ⏭/⏮ some setups park the next video UNSTARTED
    // (-1/5) instead of playing it — one playVideo() nudge wakes it up
    next() { safe(() => player?.nextVideo?.()); stepNudge(); },
    prev() { safe(() => player?.previousVideo?.()); stepNudge(); },
    destroy() { dead = true; clearInterval(poll); clearTimeout(nudgeT); clearTimeout(endT); clearTimeout(guardT); try { player?.destroy?.(); } catch {} player = null; }
  };
}
