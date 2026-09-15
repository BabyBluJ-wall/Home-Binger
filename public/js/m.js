// ─────────────────────────────────────────────────────────────────────────────
//  m.js — SIMPLE MODE (t123): the plain-list phone client at /m.
//  Posters by default, a low-data text list behind the ☰ button, one tap to
//  play. Phones land here automatically (index.html redirect); "Desktop mode"
//  in the footer goes back to the 3D store and remembers the choice.
//  No build step, no framework — same APIs the 3D store uses.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  var state = { items: [], me: null, token: (function(){ try { return localStorage.getItem('vb_sess'); } catch (e) { return null; } })(), mode: localStorage.getItem('hb_m_mode') || 'grid' };
  var $ = function (id) { return document.getElementById(id); };
  var ICO = { movie: '🎬', show: '📺', episode: '🎙️', musicvideo: '🎤', album: '💿', radio: '📻', live: '📺' };
  var VIDEO = /\.(mp4|m4v|webm|mkv|mov|avi)(\?|$)/i;

  function authHeaders() { return state.token ? { Authorization: 'Bearer ' + state.token } : {}; }
  function playUrl(it, audio) {
    return '/api/play/' + it.source + '/' + encodeURIComponent(it.key) + (audio ? '?audio=1' : '')
      + (state.token ? (audio ? '&' : '?') + 'vb_auth=' + state.token : '');
  }
  function posterUrl(it) {
    return '/img/' + it.source + '/' + encodeURIComponent(it.key)
      + (state.token ? '?vb_auth=' + state.token : '');
  }

  // ── boot: session + library ──
  fetch('/api/bootstrap', { credentials: 'include' }).then(r => r.json()).then(function (b) {
    state.me = b.me || null;
    // token login for play URLs: if we have a session cookie that's enough for
    // same-origin fetches; keep it simple — credentials:'include' everywhere.
    load();
  }).catch(function () { load(); });

  function load() {
    fetch('/api/library', { credentials: 'include' }).then(r => r.json()).then(function (lib) {
      state.items = lib.items || [];
      // sign-in card for account holders (optional — browsing works signed-out)
      if (!state.me && state.items.length) { /* guests browse freely */ }
      render();
    }).catch(function () {
      $('empty').hidden = false;
      $('empty').textContent = 'Could not reach the store.';
    });
  }

  // ── login (optional) ──
  $('signin').onclick = function () {
    fetch('/api/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: $('u').value.trim(), password: $('p').value })
    }).then(r => r.json()).then(function (j) {
      if (j.token) {
        try { localStorage.setItem('vb_sess', j.token); } catch (e) {}   // same token store the 3D app uses
        location.reload();
      } else $('gmsg').textContent = (j.error || 'Sign-in failed');
    }).catch(function () { $('gmsg').textContent = 'Sign-in failed'; });
  };
  $('guest').onclick = function (e) { e.preventDefault(); $('gate').hidden = true; };

  // ── render ──
  function visible() {
    var q = $('q').value.trim().toLowerCase();
    var list = state.items;
    if (q) list = list.filter(function (i) { return (i.title || '').toLowerCase().includes(q) || (i.sectionTitle || '').toLowerCase().includes(q); });
    return list;
  }
  function render() {
    var list = visible();
    $('empty').hidden = !!list.length;
    $('grid').hidden = state.mode !== 'grid';
    $('list').hidden = state.mode !== 'list';
    if (state.mode === 'grid') {
      $('grid').innerHTML = list.slice(0, 300).map(function (it, i) {
        return '<div class="cell" data-i="' + i + '">' +
          '<img class="art" loading="lazy" src="' + posterUrl(it) + '" onerror="this.style.visibility=\'hidden\'">' +
          '<div class="t">' + esc(it.title) + '</div><div class="s">' + esc(it.sectionTitle || it.type) + '</div></div>';
      }).join('');
    } else {
      $('list').innerHTML = list.slice(0, 500).map(function (it, i) {
        return '<div class="row" data-i="' + i + '"><span class="ico">' + (ICO[it.type] || '📼') + '</span>' +
          '<span class="t"><b>' + esc(it.title) + '</b><small>' + esc(it.sectionTitle || it.type) + '</small></span>' +
          '<span class="go">▶</span></div>';
      }).join('');
    }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  $('q').addEventListener('input', render);
  $('mode').onclick = function () {
    state.mode = state.mode === 'grid' ? 'list' : 'grid';
    localStorage.setItem('hb_m_mode', state.mode);
    render();
  };

  document.querySelector('main').addEventListener('click', function (e) {
    var cell = e.target.closest('[data-i]');
    if (!cell) return;
    play(visible()[Number(cell.dataset.i)]);
  });

  // ── the player sheet ──
  var hlsHandle = null;
  function play(it) {
    if (!it) return;
    $('ptitle').textContent = it.title;
    $('psub').textContent = it.sectionTitle || it.type;
    var vid = $('vid'), art = $('part');
    art.hidden = true; vid.hidden = false;
    if (hlsHandle) { try { hlsHandle.destroy(); } catch (e) {} hlsHandle = null; }
    try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (e) {}

    var isVideo = VIDEO.test(it.key || '') || ['movie', 'show', 'musicvideo', 'episode'].indexOf(it.type) >= 0 || it.type === 'live';
    if (isVideo) {
      var url = playUrl(it, false);
      var Hls = window.Hls;
      if ((it.type === 'live' || it.source === 'iptv') && Hls && Hls.isSupported()) {
        var h = new Hls({ manifestLoadingTimeOut: 12000, fragLoadingTimeOut: 15000 });
        hlsHandle = { destroy: function () { try { h.destroy(); } catch (e) {} } };
        h.loadSource(url); h.attachMedia(vid);
        vid.play().catch(function () {});
      } else {
        vid.src = url;
        vid.play().catch(function () {});
      }
    } else {
      // audio (albums / radio / podcasts): the audio track of the same stream
      vid.hidden = true;
      vid.src = playUrl(it, true);
      vid.hidden = false;
      vid.play().catch(function () {});
    }
    $('player').classList.add('on');
  }
  $('back').onclick = function () {
    var vid = $('vid');
    if (hlsHandle) { try { hlsHandle.destroy(); } catch (e) {} hlsHandle = null; }
    try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (e) {}
    $('player').classList.remove('on');
  };
  $('pshare').onclick = function () {
    if (navigator.share) navigator.share({ title: $('ptitle').textContent, url: location.href }).catch(function () {});
  };
})();
