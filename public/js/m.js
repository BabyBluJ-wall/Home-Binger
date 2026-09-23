// ─────────────────────────────────────────────────────────────────────────────
//  m.js — SIMPLE MODE (t123): the plain-list phone client at /m.
//  Posters by default, a low-data text list, one tap to play. Phones land
//  here automatically (index.html redirect); the ☰ MENU (t136) holds the
//  3D store, the view toggle, and sign-in — the old ☰ was a bare grid/list
//  swap that looked like a dead button, and the 3D-store link was buried
//  in the footer where nobody found it.
//  t136: CATEGORY CHIPS — movies, TV, music, radio, podcasts and live TV
//  are separated (the shelves used to arrive as one mixed pile).
//  No build step, no framework — same APIs the 3D store uses.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';
  // localStorage can THROW in private browsing on some phones — never let
  // that kill a tap handler again (t136; the old setItem calls were bare).
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var state = {
    items: [], me: null,
    token: lsGet('vb_sess'),
    mode: lsGet('hb_m_mode') || 'grid',
    cat: lsGet('hb_m_cat') || 'all'
  };
  var $ = function (id) { return document.getElementById(id); };
  var ICO = { movie: '🎬', show: '📺', episode: '🎙️', musicvideo: '🎤', album: '💿', radio: '📻', live: '📺' };
  var VIDEO = /\.(mp4|m4v|webm|mkv|mov|avi)(\?|$)/i;

  // ── categories (t136): one bucket per kind of thing on the shelves ──
  var CATS = [
    { key: 'all', icon: '🍿', label: 'All' },
    { key: 'movie', icon: '🎬', label: 'Movies' },
    { key: 'show', icon: '📺', label: 'TV Series' },
    { key: 'music', icon: '💿', label: 'Music' },
    { key: 'radio', icon: '📻', label: 'Radio' },
    { key: 'podcast', icon: '🎙️', label: 'Podcasts' },
    { key: 'live', icon: '📡', label: 'Live TV' }
  ];
  function catOf(it) {
    switch (it.type) {
      case 'movie': return 'movie';
      case 'show': return 'show';
      case 'album': case 'musicvideo': return 'music';
      case 'radio': return 'radio';
      case 'episode': return 'podcast';
      case 'live': return 'live';
      default: return 'all';
    }
  }
  function catCounts() {
    var c = { all: state.items.length };
    for (var i = 0; i < state.items.length; i++) {
      var k = catOf(state.items[i]);
      c[k] = (c[k] || 0) + 1;
    }
    return c;
  }

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
    load();
  }).catch(function () { load(); });

  function load() {
    fetch('/api/library', { credentials: 'include' }).then(r => r.json()).then(function (lib) {
      state.items = lib.items || [];
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
        lsSet('vb_sess', j.token);   // same token store the 3D app uses
        location.reload();
      } else $('gmsg').textContent = (j.error || 'Sign-in failed');
    }).catch(function () { $('gmsg').textContent = 'Sign-in failed'; });
  };
  $('guest').onclick = function (e) { e.preventDefault(); $('gate').hidden = true; };

  // ── what's on screen: category + search together ──
  function visible() {
    var q = $('q').value.trim().toLowerCase();
    var list = state.items;
    if (state.cat !== 'all') list = list.filter(function (i) { return catOf(i) === state.cat; });
    if (q) list = list.filter(function (i) { return (i.title || '').toLowerCase().includes(q) || (i.sectionTitle || '').toLowerCase().includes(q); });
    return list;
  }

  function renderCats(counts) {
    var bar = $('cats');
    bar.innerHTML = CATS.filter(function (c) { return c.key === 'all' || counts[c.key]; }).map(function (c) {
      return '<button class="chip' + (state.cat === c.key ? ' on' : '') + '" data-cat="' + c.key + '">'
        + c.icon + ' ' + c.label + ' <small>' + (counts[c.key] || 0) + '</small></button>';
    }).join('');
  }

  function render() {
    var counts = catCounts();
    if (state.cat !== 'all' && !counts[state.cat]) state.cat = 'all';   // stale pick (library changed)
    renderCats(counts);
    var list = visible();
    $('empty').hidden = !!list.length;
    $('empty').textContent = list.length ? 'Nothing on the shelves yet.' : 'Nothing here — try another category or search.';
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

  // ── the ☰ MENU (t136) ──
  function closeMenu() { $('menu').classList.remove('on'); }
  $('mode').onclick = function () {
    // the account rows reflect reality every time it opens
    $('m-signin').hidden = !!state.me;
    $('m-user').hidden = !state.me;
    if (state.me) $('m-name').textContent = '👤 ' + (state.me.name || state.me.username || 'Signed in');
    $('view-grid').classList.toggle('sel', state.mode === 'grid');
    $('view-list').classList.toggle('sel', state.mode === 'list');
    $('menu').classList.add('on');
  };
  $('menu-close').onclick = closeMenu;
  $('menu').addEventListener('click', function (e) { if (e.target.id === 'menu') closeMenu(); });
  $('m-store').onclick = closeMenu;   // the browser does the navigating
  $('view-grid').onclick = function () { state.mode = 'grid'; lsSet('hb_m_mode', state.mode); render(); closeMenu(); };
  $('view-list').onclick = function () { state.mode = 'list'; lsSet('hb_m_mode', state.mode); render(); closeMenu(); };
  $('m-signin').onclick = function () {
    closeMenu();
    $('gate').hidden = false;
    $('gate').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('m-signout').onclick = function () {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: authHeaders() })
      .catch(function () {})
      .then(function () { lsDel('vb_sess'); location.reload(); });
  };

  // ── category taps ──
  $('cats').addEventListener('click', function (e) {
    var chip = e.target.closest('[data-cat]');
    if (!chip) return;
    state.cat = chip.dataset.cat;
    lsSet('hb_m_cat', state.cat);
    render();
  });

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
    vid.onerror = null;

    // t136: dead catalogue items (an archive.org identifier that moved or
    // vanished) used to leave a SILENT BLACK VOID — say so, and show the
    // cover instead so the sheet never looks broken.
    function deadItem() {
      $('psub').textContent = '⚠ This one seems offline — try another title';
      vid.hidden = true;
      art.src = posterUrl(it);
      art.hidden = false;
    }

    var isVideo = VIDEO.test(it.key || '') || ['movie', 'show', 'musicvideo', 'episode'].indexOf(it.type) >= 0 || it.type === 'live';
    if (isVideo) {
      var url = playUrl(it, false);
      var Hls = window.Hls;
      if ((it.type === 'live' || it.source === 'iptv') && Hls && Hls.isSupported()) {
        var h = new Hls({ manifestLoadingTimeOut: 12000, fragLoadingTimeOut: 15000 });
        hlsHandle = { destroy: function () { try { h.destroy(); } catch (e) {} } };
        h.on(Hls.Events.ERROR, function (evt, data) { if (data && data.fatal) deadItem(); });
        h.loadSource(url); h.attachMedia(vid);
        vid.play().catch(function () {});
      } else {
        vid.onerror = deadItem;
        vid.src = url;
        vid.play().catch(function () {});
      }
    } else {
      // audio (albums / radio / podcasts): the audio track of the same stream
      vid.hidden = true;
      vid.onerror = deadItem;
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
  if (!navigator.share) $('pshare').style.display = 'none';   // no share sheet on this device — don't show a dead button
})();
