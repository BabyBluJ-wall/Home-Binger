p = 'desktop/main.cjs'
s = open(p).read()
def rep(a, b):
    global s
    assert s.count(a) == 1, 'ANCHOR: ' + a[:90]
    s = s.replace(a, b)

# 1) pass frameName + features through
rep("  wc.setWindowOpenHandler(({ url }) => {",
    "  wc.setWindowOpenHandler(({ url, frameName, features }) => {")

# 2) the in-app branch: full client / dock / sign-in sizes
rep("""      if (inApp) {
        return { action: 'allow', overrideBrowserWindowOptions: {
          width: 940, height: 900, autoHideMenuBar: true,
          backgroundColor: '#0b0e1a', title: 'Home Binger \u2014 sign in'
        } };
      }""",
"""      // t176: FULL DISCORD IN-APP \u2014 the real web client (DMs, servers, voice
      // channels, calls, screen sharing) in its own properly-sized window.
      // This is Discord's own client in our shell \u2014 no user tokens, no
      // self-botting; the session persists in the app's own profile.
      const fullDiscord = /(^|\\.)discord\\.com$/i.test(u.hostname) && frameName === 'hbDiscord';
      const dockDiscord = fullDiscord && typeof features === 'string' && features.includes('hbDock');   // watch-with-me side panel
      if (inApp) {
        const base = { autoHideMenuBar: true, backgroundColor: '#0b0e1a' };
        if (dockDiscord) {                                       // t176: dock it beside the movie
          let b = null;
          try { const w = BrowserWindow.fromWebContents(wc); if (w) b = w.getBounds(); } catch {}
          return { action: 'allow', overrideBrowserWindowOptions: { ...base,
            width: 420, height: b ? b.height : 860,
            x: b ? b.x + b.width - 420 : undefined, y: b ? b.y : undefined,
            title: 'Discord \u2014 Home Binger' } };
        }
        if (fullDiscord) {
          return { action: 'allow', overrideBrowserWindowOptions: { ...base,
            width: 1200, height: 860, title: 'Discord \u2014 Home Binger' } };
        }
        return { action: 'allow', overrideBrowserWindowOptions: { ...base,
          width: 940, height: 900, title: 'Home Binger \u2014 sign in' } };
      }""")

# 3) tell OUR pages they're inside the desktop app (Discord buttons open
#    in-app windows only here); never injected into Discord/Spotify pages
rep("""    if (/^https?:\\/\\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  };
});""",
"""    if (/^https?:\\/\\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  };
  // t176: the page needs to know it's in the exe. Injected on OUR origin
  // only \u2014 never into Discord/Spotify/wizcord pages.
  wc.on('did-finish-load', () => {
    try {
      const u = new URL(wc.getURL());
      if (u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost'))
        wc.executeJavaScript('try { window.HB_DESKTOP = 1 } catch {}').catch(() => {});
    } catch { /* not a page we should touch */ }
  });
});""")

open(p, 'w').write(s)
print('main.cjs: 3 edits landed')
