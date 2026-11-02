// Обращения к серверу приложения. Если сервер недоступен (статический хостинг), приложение работает локально.
export async function api(path, { method = 'GET', body, raw, timeout = 15000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(path, {
      method, signal: ctrl.signal, credentials: 'same-origin',
      headers: raw ? headers : { 'content-type': 'application/json', ...headers },
      body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Ошибка ${res.status}`), { status: res.status, data });
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Сервер не ответил вовремя');
    throw e;
  } finally { clearTimeout(timer); }
}

export async function health() {
  try {
    const h = await api('/api/health', { timeout: 3000 });
    return h && h.ok ? h : null;
  } catch { return null; }
}

export async function uploadImage(file) {
  return api('/api/uploads', { method: 'POST', raw: true, body: file, headers: { 'content-type': file.type }, timeout: 60000 });
}
