// Загрузка общего каталога из фидов магазинов с сервера: при запуске и при каждом открытии сметы (FR-32).
import { S, emit } from './store.js';
import { api } from './api.js';
import { setServerCatalog } from './core/catalog.js';

export let catalogMeta = { sources: [], count: 0, loadedAt: null };

export async function loadServerCatalog({ silent = false } = {}) {
  if (!S.server.online) return null;
  try {
    const r = await api('/api/catalog', { timeout: 60000 });
    setServerCatalog(r.products || []);
    catalogMeta = { sources: r.sources || [], count: r.count || 0, refreshHours: r.refreshHours, loadedAt: new Date().toISOString() };
    if (!silent) emit('catalog');
    return catalogMeta;
  } catch { return null; }
}
