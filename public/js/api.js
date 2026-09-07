// ─────────────────────────────────────────────────────────────────────────────
//  api.js — tiny fetch client for the backend (same origin)
// ─────────────────────────────────────────────────────────────────────────────
//  Every call returns parsed JSON or throws an Error with a friendly message.
//  Auth is DOUBLE-ROUTED: cookies still flow (credentials:'include') for
//  normal deployments, but the session token also lives in localStorage and
//  rides along as an Authorization header — preview proxies that strip
//  cookies can't log you out that way. The anonymous device id (guest prefs)
//  is kept in localStorage too and sent as X-VB-Device.
// ─────────────────────────────────────────────────────────────────────────────

const store = {
  get token() { try { return localStorage.getItem('vb_sess'); } catch { return null; } },
  set token(v) { try { v ? localStorage.setItem('vb_sess', v) : localStorage.removeItem('vb_sess'); } catch {} },
  get device() {
    try {
      let d = localStorage.getItem('vb_dev');
      if (!d || !/^dev:[a-f0-9]{32}$/.test(d)) {
        d = 'dev:' + [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem('vb_dev', d);
      }
      return d;
    } catch { return null; }
  }
};

async function call(method, url, body) {
  const opts = { method, credentials: 'include', headers: { 'X-VB-Device': store.device || '' } };
  if (store.token) opts.headers['Authorization'] = 'Bearer ' + store.token;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  // Belt & suspenders: also carry token + device as query params — the ONLY
  // thing that survives proxies which strip both cookies and auth headers.
  const qs = new URLSearchParams();
  if (store.token) qs.set('vb_auth', store.token);
  if (store.device) qs.set('vb_dev', store.device);
  const full = url + (url.includes('?') ? '&' : '?') + qs.toString();
  const res = await fetch(full, opts);
  let data = {};
  try { data = await res.json(); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  bootstrap: () => call('GET', '/api/bootstrap'),
  library:   () => call('GET', '/api/library'),
  savePrefs: (prefs) => call('POST', '/api/prefs', prefs),
  adminLibraries: (payload) => call('POST', '/api/admin/libraries', payload),
  itemDetail: (source, key) => call('GET', `/api/item/${encodeURIComponent(source)}/${encodeURIComponent(key)}`),
  tv: () => call('GET', '/api/tv'),
  sources: () => call('GET', '/api/sources'),

  login: async (username, password) => {
    const r = await call('POST', '/api/auth/login', { username, password });
    if (r.token) store.token = r.token;      // remember the session (proxy-safe)
    return r;
  },
  register: async (username, password) => {
    const r = await call('POST', '/api/auth/register', { username, password });
    if (r.token) store.token = r.token;
    return r;
  },
  logout: async () => {
    const r = await call('POST', '/api/auth/logout', {});
    store.token = null;                      // forget the session locally too
    return r;
  },
  changePassword: (oldPassword, newPassword) => call('POST', '/api/account/password', { oldPassword, newPassword }),

  adminConfig: () => call('GET', '/api/admin/config'),
  adminSaveConfig: (config) => call('PUT', '/api/admin/config', { config }),
  adminTest: (draft) => call('POST', '/api/admin/test', draft),
  adminUsers: () => call('GET', '/api/admin/users'),
  adminSetPassword: (id, password) => call('POST', '/api/admin/users/password', { id, password }),
  adminDeleteUser: (id) => call('DELETE', `/api/admin/users/${encodeURIComponent(id)}`),
  adminRenameUser: (id, username) => call('POST', '/api/admin/users/rename', { id, username }),   // t81

  // Poster URL for an item (proxied through our server — never touches the
  // media-server token). Items without a source return null → placeholders.
  posterUrl: (item) => (item.source
    ? `/img/${item.source}/${encodeURIComponent(item.key)}`
    : null)
};
