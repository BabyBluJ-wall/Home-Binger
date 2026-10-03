// ─────────────────────────────────────────────────────────────────────────────
//  hlsplay.js — ONE place that decides how a stream reaches a <video> element.
//  HLS (.m3u8 live TV) needs hls.js in Chromium; Safari/iOS play it natively;
//  everything else keeps the plain src= path. UMD hls.min.js is loaded via a
//  <script> tag (it sets window.Hls).
//
//  t162: live TV must survive the LONG HAUL — mid-show stalls, ad-break
//  discontinuities, expiring CDN tokens. Fatal-error recovery ladder:
//    MEDIA_ERROR   → hls.recoverMediaError() ×2        (decode hiccups)
//                  → full re-attach                     (sick decode session)
//    NETWORK_ERROR → hls.startLoad() ×3                (rejoin near the live edge)
//                  → full re-attach ×3                  (fresh manifest + segments)
//    anything else → onError (the caller shows its card)
//  Healthy segments landing (FRAG_BUFFERED) pay the budgets back, so one bad
//  minute an hour into a movie doesn't spend the whole ladder.
// ─────────────────────────────────────────────────────────────────────────────
const attached = new WeakMap();     // videoEl → hls instance (one at a time)

export function isHlsItem(item, url) {
  if (item?.source === 'iptv') return true;             // the live TV wing is always HLS
  return /\.m3u8(\?|$)/i.test(url || '') || item?.type === 'live';
}

// Point a <video> at a stream. Returns a handle with destroy() (call before
// repointing or stopping) and reload() (a FULL fresh attach — the watchdog
// and stall nudges use it to heal a frozen picture). Falls back to native
// playback when MSE is absent.
export function attachStream(el, url, { onError } = {}) {
  detachStream(el);
  const Hls = window.Hls;
  if (Hls && Hls.isSupported()) {
    let hls = null, dead = false, healthy = 0;
    const handle = { kind: 'hls', reloads: 0, startLoads: 0, mediaRecovers: 0,
      reload() {                                    // full fresh attach — new Hls, same URL
        if (dead || !build()) return false;
        handle.reloads++;
        return true;
      },
      destroy() { dead = true; destroyHls(); } };
    function destroyHls() {
      if (!hls) return;
      try { hls.destroy(); } catch {}
      if (attached.get(el) === hls) attached.delete(el);
      hls = null;
    }
    function build() {
      if (dead) return false;
      destroyHls();
      hls = new Hls({
        manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 4,   // t162: was 2 — one slow manifest response shouldn't kill a show
        fragLoadingTimeOut: 20000, fragLoadingMaxRetry: 6,           // t162: was 2 — live CDNs hiccup constantly
        liveSyncDurationCount: 3                // join live near the edge
      });
      attached.set(el, hls);
      hls.on(Hls.Events.ERROR, (e, d) => {
        if (!d?.fatal || dead) return;
        if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
          handle.mediaRecovers++;
          if (handle.mediaRecovers <= 2) { hls.recoverMediaError(); return; }
          if (handle.reload()) { handle.mediaRecovers = 0; return; }   // decode session is sick — start over
        }
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (handle.startLoads < 3) { handle.startLoads++; hls.startLoad(); return; }   // same session, rejoin the edge
          if (handle.reload()) { handle.startLoads = 0; return; }                        // session is sick — start over
        }
        onError?.(d);
        destroyHls();
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {          // a segment actually LANDED — pay the budgets back
        handle.startLoads = 0;
        handle.mediaRecovers = 0;
        if (++healthy >= 5) { handle.reloads = 0; healthy = 0; }
      });
      hls.loadSource(url);
      hls.attachMedia(el);
      return true;
    }
    build();
    return handle;
  }
  // Safari / iOS: native HLS — reload() re-points the same src
  el.src = url;
  return { kind: 'native', reloads: 0,
    reload() {
      const src = el.getAttribute('src');
      if (!src) return false;
      el.src = src; el.load();
      el.play?.().catch(() => {});
      return true;
    },
    destroy() { try { el.pause(); el.removeAttribute('src'); el.load(); } catch {} } };
}

export function detachStream(el) {
  const hls = attached.get(el);
  if (hls) { try { hls.destroy(); } catch {} attached.delete(el); }
}
