/* ── API 클라이언트 ── */
const API = {
  base: '/api',
  token() { return localStorage.getItem('synap_token') || sessionStorage.getItem('synap_token'); },
  setToken(t) { localStorage.setItem('synap_token', t); },
  clearToken() { localStorage.removeItem('synap_token'); },

  async req(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const t = this.token();
    if (t) opts.headers['Authorization'] = 'Bearer ' + t;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(this.base + path, opts);
    if (res.status === 401) { App.logout(); return; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `오류 ${res.status}`);
    return data;
  },
  get(path)        { return this.req('GET', path); },
  post(path, body) { return this.req('POST', path, body); },
  put(path, body)  { return this.req('PUT', path, body); },
  patch(path, body){ return this.req('PATCH', path, body); },
  del(path)        { return this.req('DELETE', path); },
};
