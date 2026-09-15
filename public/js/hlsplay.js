// ─────────────────────────────────────────────────────────────────────────────
//  hlsplay.js — ONE place that decides how a stream reaches a <video> element.
//  HLS (.m3u8 live TV) needs hls.js in Chromium; Safari/iOS play it natively;
//  everything else keeps the plain src= path. UMD hls.min.js is loaded via a
//  <script> tag (it sets window.Hls).
// ─────────────────────────────────────────────────────────────────────────────
const attached = new WeakMap();     // videoEl → hls instance (one at a time)

export function isHlsItem(item, url) {
  if (item?.source === 'iptv') return true;             // the live TV wing is always HLS
  return /\.m3u8(\?|$)/i.test(url || '') || item?.type === 'live';
}

// Point a <video> at a stream. Returns a handle with destroy() (call before
// repointing or stopping). Falls back to native playback when MSE is absent.
export function attachStream(el, url, { onError } = {}) {
  detachStream(el);
  const Hls = window.Hls;
  if (Hls && Hls.isSupported()) {
    const hls = new Hls({
      manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 2,
      fragLoadingTimeOut: 15000, fragLoadingMaxRetry: 2,
      liveSyncDurationCount: 3                // join live near the edge
    });
    attached.set(el, hls);
    hls.on(Hls.Events.ERROR, (e, d) => {
      if (!d?.fatal) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
      onError?.(d);
      try { hls.destroy(); } catch {}
      if (attached.get(el) === hls) attached.delete(el);
    });
    hls.loadSource(url);
    hls.attachMedia(el);
    return { destroy: () => { try { hls.destroy(); } catch {} if (attached.get(el) === hls) attached.delete(el); } };
  }
  // Safari / iOS: native HLS
  el.src = url;
  return { destroy: () => { try { el.pause(); el.removeAttribute('src'); el.load(); } catch {} } };
}

export function detachStream(el) {
  const hls = attached.get(el);
  if (hls) { try { hls.destroy(); } catch {} attached.delete(el); }
}
