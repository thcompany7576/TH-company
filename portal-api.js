(() => {
  'use strict';
  const cfg = window.TH_CONFIG || {};
  const surface = document.documentElement.dataset.surface || 'customer';
  const storageKey = 'th6:session:' + surface;
  const separateWindows = surface === 'admin';
  let session = null, refreshing = null, epoch = 0, remembered = true;
  const event = () => window.dispatchEvent(new CustomEvent('th:session', { detail: session }));
  const store = () => {
    try {
      if (separateWindows) {
        sessionStorage.setItem(storageKey, JSON.stringify(session));
        sessionStorage.setItem(storageKey + ':remember', String(remembered));
      }
      if (remembered) localStorage.setItem(storageKey, JSON.stringify(session));
      else sessionStorage.setItem(storageKey, JSON.stringify(session));
    } catch {}
  };
  const configured = () => /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url || '') && Boolean(cfg.publicKey);
  async function raw(path, options = {}, token) {
    if (!configured()) throw Error('서비스 연결 설정을 확인해 주세요.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(cfg.url + path, { ...options, signal: controller.signal, cache: 'no-store', headers: {
        apikey: cfg.publicKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers
      }});
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const message = data?.error_description || (typeof data?.error === 'string' ? data.error : '') || data?.message || data?.msg;
        if (data?.error_code === 'invalid_credentials' || data?.code === 'invalid_credentials' || /invalid login credentials/i.test(message || '')) {
          throw Error('아이디(이메일) 또는 비밀번호가 맞지 않습니다. 등록된 계정으로 다시 입력해 주세요.');
        }
        if (data?.error_code === 'email_not_confirmed' || data?.code === 'email_not_confirmed') throw Error('이메일 확인이 필요한 계정입니다. 사무실에 문의해 주세요.');
        throw Error(message || '서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('연결 시간이 초과되었습니다. 같은 요청으로 다시 시도해 주세요.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function clear() {
    const old = session;
    epoch++; session = null;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!separateWindows || (old && saved?.refresh_token === old.refresh_token)) localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey); sessionStorage.removeItem(storageKey + ':remember');
    } catch {}
    event();
  }
  async function ensure() {
    if (!session || session.expires_at > Date.now() / 1000 + 90) return;
    if (refreshing) return refreshing;
    const stamp = epoch;
    refreshing = (async () => {
      try {
        const data = await raw('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) });
        if (stamp !== epoch) return;
        session = { ...data, expires_at: Date.now() / 1000 + data.expires_in }; store();
      } catch (error) {
        if (stamp === epoch) clear();
        throw Error('로그인을 다시 해 주세요. ' + error.message);
      }
    })();
    try { await refreshing; } finally { refreshing = null; }
  }
  async function api(path, options) { await ensure(); return raw(path, options, session?.access_token); }
  async function rpc(name, args = {}) { return api('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args) }); }
  async function login(email, password, remember = true) {
    const data = await raw('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    clear(); remembered = remember; session = { ...data, expires_at: Date.now() / 1000 + data.expires_in }; store(); event();
    return session;
  }
  async function logout() {
    const old = session; clear();
    if (old) await raw('/auth/v1/logout?scope=local', { method: 'POST' }, old.access_token).catch(() => {});
  }
  async function restore() {
    try {
      const local = localStorage.getItem(storageKey), temp = sessionStorage.getItem(storageKey);
      remembered = separateWindows && temp ? sessionStorage.getItem(storageKey + ':remember') === 'true' : Boolean(local);
      const saved = JSON.parse((separateWindows ? temp || local : local || temp) || 'null');
      if (saved && typeof saved.access_token === 'string' && typeof saved.refresh_token === 'string' && Number.isFinite(saved.expires_at)) session = saved;
      await ensure();
      if (separateWindows && session) store();
    } catch { clear(); }
    return session;
  }
  window.TH_API = { api, rpc, login, logout, restore, configured, get session() { return session; } };
  window.addEventListener('storage', e => { if (!separateWindows && e.key === storageKey && e.newValue === null) clear(); });
})();
