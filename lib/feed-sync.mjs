// Синхронизация фидов магазинов (раздел 5.1): источники по URL или файлом, загрузка не реже раза в сутки,
// разбор общим модулем js/core/feeds.js, объединение одного товара из разных магазинов в одну запись.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { feedToProducts, mergeProducts, decodeFeedBytes } from '../js/core/feeds.js';

const MAX_FEED_BYTES = 80 * 1024 * 1024;

export function createFeedSync({ dataDir, assertPublicUrl, log = console }) {
  const dir = path.join(dataDir, 'catalog');
  const files = path.join(dir, 'files');
  const sourcesFile = path.join(dir, 'sources.json');
  const productsFile = path.join(dir, 'products.json');
  let sources = [], products = [], perSource = new Map(), running = new Set();
  const refreshHours = Number(process.env.FEED_REFRESH_HOURS) || 24;

  const readJson = async (f, d) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return d; } };
  const save = () => Promise.all([writeFile(sourcesFile, JSON.stringify(sources, null, 1)), writeFile(productsFile, JSON.stringify(products))]);

  async function init() {
    await mkdir(files, { recursive: true });
    sources = await readJson(sourcesFile, []);
    for (const s of sources) perSource.set(s.id, await readJson(path.join(dir, `src-${s.id}.json`), []));
    rebuild();
  }

  function rebuild() {
    products = mergeProducts(sources.filter(s => s.enabled !== false).flatMap(s => perSource.get(s.id) || []));
  }

  const decodeBytes = (buf, contentType = '') => decodeFeedBytes(buf, contentType);

  async function download(src) {
    await assertPublicUrl(src.url);
    const headers = { 'user-agent': 'DomProektFeedBot/1.0 (+catalog sync)' };
    if (src.authHeader) headers.authorization = src.authHeader;
    const r = await fetch(src.url, { headers, redirect: 'follow', signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`Магазин ответил ${r.status}`);
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_FEED_BYTES) throw new Error('Фид больше 80 МБ');
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_FEED_BYTES) throw new Error('Фид больше 80 МБ');
    let bytes = buf;
    if (/\.gz($|\?)/i.test(src.url) || (buf[0] === 0x1f && buf[1] === 0x8b)) { const { gunzipSync } = await import('node:zlib'); bytes = gunzipSync(buf); }
    return decodeBytes(bytes, r.headers.get('content-type') || '');
  }

  async function refresh(id) {
    const src = sources.find(s => s.id === id);
    if (!src || running.has(id)) return src;
    running.add(id);
    src.status = 'running'; src.lastRun = new Date().toISOString();
    try {
      const text = src.type === 'file' ? decodeBytes(await readFile(path.join(files, `${id}.txt`))) : await download(src);
      const res = feedToProducts(text, { id: src.id, name: src.name, cities: src.cities?.length ? src.cities : '*', deliveryDays: src.deliveryDays ?? null }, src.format || 'auto');
      if (!res.products.length) throw new Error(`Не найдено товаров с названием, ценой и ссылкой (строк в файле: ${res.total})`);
      perSource.set(id, res.products);
      await writeFile(path.join(dir, `src-${id}.json`), JSON.stringify(res.products));
      Object.assign(src, { status: 'ok', lastOk: new Date().toISOString(), count: res.products.length, skipped: res.skipped, withDims: res.products.filter(p => p.dims?.w).length, error: null, shop: res.shop || src.shop });
    } catch (e) {
      Object.assign(src, { status: 'error', error: String(e.message || e).slice(0, 300) });
      log.error?.(`Фид «${src.name}»: ${src.error}`);
    } finally {
      running.delete(id);
      rebuild(); await save();
    }
    return src;
  }

  async function add({ name, url, format = 'auto', cities = '*', deliveryDays = null, authHeader = '', content = null, createdBy }) {
    const id = randomUUID().slice(0, 8);
    const src = { id, name: String(name || '').slice(0, 80) || 'Магазин', type: content ? 'file' : 'url', url: content ? null : String(url || ''), format, cities, deliveryDays: deliveryDays === null || deliveryDays === '' ? null : Number(deliveryDays), authHeader: authHeader ? String(authHeader).slice(0, 500) : '', enabled: true, createdAt: new Date().toISOString(), createdBy, status: 'new' };
    if (!content) { const u = new URL(src.url); if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Нужна ссылка http(s) на файл фида'); }
    else { let bytes = Buffer.isBuffer(content) ? content : Buffer.from(String(content)); if (bytes[0] === 0x1f && bytes[1] === 0x8b) { const { gunzipSync } = await import('node:zlib'); bytes = gunzipSync(bytes); } await writeFile(path.join(files, `${id}.txt`), bytes); }
    sources.push(src); await save();
    refresh(id);
    return src;
  }

  async function update(id, patch) {
    const src = sources.find(s => s.id === id); if (!src) return null;
    for (const k of ['name', 'cities', 'deliveryDays', 'enabled', 'format']) if (k in patch) src[k] = patch[k];
    if ('authHeader' in patch && patch.authHeader !== '••••') src.authHeader = String(patch.authHeader || '');
    rebuild(); await save();
    return src;
  }

  async function remove(id) {
    sources = sources.filter(s => s.id !== id); perSource.delete(id);
    await rm(path.join(dir, `src-${id}.json`), { force: true }); await rm(path.join(files, `${id}.txt`), { force: true });
    rebuild(); await save();
  }

  // Ежедневное обновление: проверяем раз в 15 минут, какие источники устарели
  function startScheduler() {
    const tick = () => {
      const due = sources.filter(s => s.enabled !== false && s.type === 'url' && (!s.lastRun || Date.now() - new Date(s.lastRun).getTime() > refreshHours * 3600_000));
      for (const s of due) refresh(s.id);
    };
    setTimeout(tick, 5000);
    return setInterval(tick, 15 * 60_000);
  }

  const publicSource = s => ({ ...s, authHeader: s.authHeader ? '••••' : '' });
  return {
    init, refresh, add, update, remove, startScheduler,
    list: () => sources.map(publicSource),
    products: () => products,
    meta: () => ({ sources: sources.filter(s => s.enabled !== false).map(s => ({ id: s.id, name: s.name, status: s.status, count: s.count || 0, lastOk: s.lastOk || null })), count: products.length, refreshHours }),
  };
}
