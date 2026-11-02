// Сервер ДомПроект: статика, аккаунты, проекты и версии, загрузки, ссылки для чтения, проверка ссылок каталога
// и прокси к ИИ-провайдерам (Gemini / OpenAI). Ключи провайдеров хранятся только в .env на сервере.
// Без внешних зависимостей: Node.js 20+.
import http from 'node:http';
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { promisify } from 'node:util';
import { gzipSync } from 'node:zlib';
import { createFeedSync } from './lib/feed-sync.mjs';

const scrypt = promisify(scryptCb);
const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'data');
const dirs = { users: path.join(dataDir, 'users'), uploads: path.join(dataDir, 'uploads'), shares: path.join(dataDir, 'shares') };
for (const d of Object.values(dirs)) await mkdir(d, { recursive: true });

const env = await readFile(path.join(root, '.env'), 'utf8').catch(() => '');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.md': 'text/markdown; charset=utf-8' };
const STATIC_ALLOW = /^\/(index\.html|retail-sources\.json|css\/[\w.-]+\.css|js\/[\w./-]+\.js)$/;

const send = (res, status, body, headers = {}) => {
  let data = Buffer.from(JSON.stringify(body));
  const h = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers };
  if (data.length > 50_000 && /gzip/.test(res.req?.headers['accept-encoding'] || '')) { data = gzipSync(data); h['content-encoding'] = 'gzip'; }
  res.writeHead(status, h); res.end(data);
};
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function readBody(req, max = 2_000_000) {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > max) throw new HttpError(413, 'Слишком большой запрос'); chunks.push(c); }
  return Buffer.concat(chunks);
}
const jsonBody = async (req, max) => { const b = await readBody(req, max); try { return JSON.parse(b.toString('utf8') || '{}'); } catch { throw new HttpError(400, 'Некорректный JSON'); } };

const readJson = async (file, def) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return def; } };
const writeJson = (file, data) => writeFile(file, JSON.stringify(data, null, 1));
const safeId = s => /^[\w-]{3,80}$/.test(String(s || ''));

// ——— Пользователи и сессии ———
const usersFile = path.join(dataDir, 'users.json');
const sessionsFile = path.join(dataDir, 'sessions.json');
let users = await readJson(usersFile, []);
let sessions = await readJson(sessionsFile, {});
const SESSION_DAYS = 30;
const attempts = new Map();

async function hashPassword(pw, salt = randomBytes(16).toString('hex')) { const h = await scrypt(pw, salt, 64); return { salt, hash: h.toString('hex') }; }
async function checkPassword(pw, user) { const h = await scrypt(pw, user.salt, 64); return timingSafeEqual(h, Buffer.from(user.hash, 'hex')); }
function cookies(req) { return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])); }
function currentUser(req) {
  const sid = cookies(req).dp_sid; const s = sid && sessions[sid];
  if (!s || s.expires < Date.now()) return null;
  return users.find(u => u.id === s.userId) || null;
}
function sessionCookie(req, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
  return `dp_sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
async function startSession(req, res, user) {
  const token = randomBytes(32).toString('hex');
  sessions[token] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 86400000 };
  for (const [k, v] of Object.entries(sessions)) if (v.expires < Date.now()) delete sessions[k];
  await writeJson(sessionsFile, sessions);
  return sessionCookie(req, token, SESSION_DAYS * 86400);
}
const isAdmin = u => {
  if (!u) return false;
  const list = String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return list.length ? list.includes(u.email) : users[0]?.id === u.id;
};
const publicUser = u => u && { id: u.id, email: u.email, name: u.name, admin: isAdmin(u) };
function requireAdmin(req) { const u = requireUser(req); if (!isAdmin(u)) throw new HttpError(403, 'Управлять фидами может администратор каталога (ADMIN_EMAILS в .env)'); return u; }
const userDir = (u, ...p) => path.join(dirs.users, u.id, ...p);
function requireUser(req) { const u = currentUser(req); if (!u) throw new HttpError(401, 'Требуется вход в аккаунт'); return u; }
function limitAttempts(key) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter(t => now - t < 15 * 60000);
  if (a.length >= 10) throw new HttpError(429, 'Слишком много попыток, попробуйте через 15 минут');
  a.push(now); attempts.set(key, a);
}

// ——— Загрузки ———
const MIME_BY_MAGIC = b => b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
async function saveUpload(owner, bytes) {
  const id = randomUUID();
  await writeFile(path.join(dirs.uploads, `${id}.img`), bytes);
  await writeJson(path.join(dirs.uploads, `${id}.json`), { owner: owner.id, mime: MIME_BY_MAGIC(bytes), size: bytes.length, at: new Date().toISOString() });
  return { id, url: `/api/uploads/${id}`, mimeType: MIME_BY_MAGIC(bytes), size: bytes.length };
}
async function loadUpload(id, owner) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id))) return null;
  const meta = await readJson(path.join(dirs.uploads, `${id}.json`), null);
  if (!meta || (owner && meta.owner !== owner.id)) return null;
  const bytes = await readFile(path.join(dirs.uploads, `${id}.img`)).catch(() => null);
  return bytes && { bytes, mime: meta.mime || MIME_BY_MAGIC(bytes) };
}

// ——— ИИ-провайдеры ———
const providers = () => ({ openai: !!process.env.OPENAI_API_KEY, gemini: !!process.env.GEMINI_API_KEY });

async function callModel(provider, system, text, images = [], timeout = 110_000) {
  let url, headers, body;
  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new HttpError(400, 'Не задан OPENAI_API_KEY в .env');
    url = 'https://api.openai.com/v1/responses'; headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
    body = { model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', temperature: 0.4, text: { format: { type: 'json_object' } }, input: [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'input_text', text }, ...images.map(x => ({ type: 'input_image', image_url: `data:${x.mime};base64,${x.data}` }))] }] };
  } else if (provider === 'gemini') {
    if (!process.env.GEMINI_API_KEY) throw new HttpError(400, 'Не задан GEMINI_API_KEY в .env');
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-2.5-flash')}:generateContent`;
    headers = { 'x-goog-api-key': process.env.GEMINI_API_KEY };
    body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text }, ...images.map(x => ({ inlineData: { mimeType: x.mime, data: x.data } }))] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.4 } };
  } else throw new HttpError(404, 'Неизвестный сервис подбора');
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, data.error?.message || `Ошибка ${r.status} провайдера`);
  const content = provider === 'openai' ? (data.output_text || data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text) : data.candidates?.[0]?.content?.parts?.map(x => x.text || '').join('');
  if (!content) throw new HttpError(502, 'Провайдер вернул пустой ответ');
  try { return JSON.parse(content.replace(/^```json\s*|\s*```$/g, '')); } catch { throw new HttpError(502, 'Не удалось разобрать ответ сервиса подбора'); }
}

async function imagesFor(user, ids) {
  const out = [];
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, 20)) { const u = await loadUpload(id, user); if (u && u.bytes.length <= 10_000_000) out.push({ mime: u.mime, data: u.bytes.toString('base64') }); }
  return out;
}
const str = (v, n = 200) => String(v ?? '').slice(0, n);

const SYS_COMMON = 'Ты модуль приложения планировки и ремонта для рынка РФ. Отвечай только корректным JSON без пояснений вне JSON. Ничего не придумывай сверх переданных данных. Не обещай соответствия нормам.';

async function aiDesign(user, provider, b) {
  const catalog = (Array.isArray(b.catalog) ? b.catalog : []).slice(0, 400).map(x => ({ id: str(x.id, 80), name: str(x.name, 120), kind: str(x.kind, 30), dims: x.dims, price: x.price, styles: x.styles, color: str(x.color, 10), material: str(x.material, 40) }));
  const ids = new Set(catalog.map(x => x.id));
  const system = `${SYS_COMMON} Задача: предложить 3 варианта подбора мебели, света и отделки для квартиры. Используй ТОЛЬКО id из поля catalog. Каждый вариант: {"name": "...", "description": "почему выбраны предметы и как учтены пожелания (2-3 предложения)", "catalogIds": ["id", ...]}. Варианты должны отличаться: сбалансированный, экономичный, акцентный. Если подходящих товаров нет — не добавляй их. Не меняй планировку и инженерию. Формат ответа: {"variants":[...]}.`;
  const text = JSON.stringify({ plan: b.plan, brief: b.brief, city: str(b.city, 60), catalog });
  const res = await callModel(provider, system, text, b.references?.length ? await imagesFor(user, b.references) : []);
  let rejected = 0;
  const variants = (Array.isArray(res.variants) ? res.variants : []).slice(0, 3).map((v, i) => {
    const raw = Array.isArray(v.catalogIds) ? v.catalogIds.map(String) : [];
    const ok = raw.filter(id => ids.has(id)); rejected += raw.length - ok.length;
    return { name: str(v.name || `Вариант ${i + 1}`, 100), description: str(v.description, 800), catalogIds: [...new Set(ok)] };
  });
  return { variants, rejected };
}

async function aiAnalyze(user, provider, b) {
  const styles = (b.styles || []).map(s => ({ id: str(s.id, 30), name: str(s.name, 40) }));
  const system = `${SYS_COMMON} Проанализируй референсы интерьера и текст пожеланий. Верни {"palette":["#rrggbb" x5],"materials":["..."],"furniture":["..."],"mood":"кратко по-русски","styleId":"id из списка styles","styleAlt":["id","id"],"avoid":["..."]}.`;
  const res = await callModel(provider, system, JSON.stringify({ prompt: str(b.prompt, 3000), styles }), await imagesFor(user, b.references));
  const sid = new Set(styles.map(s => s.id));
  return {
    palette: (res.palette || []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6),
    materials: (res.materials || []).map(x => str(x, 40)).slice(0, 10), furniture: (res.furniture || []).map(x => str(x, 40)).slice(0, 10),
    mood: str(res.mood, 200), styleId: sid.has(res.styleId) ? res.styleId : styles[0]?.id, styleAlt: (res.styleAlt || []).filter(x => sid.has(x)).slice(0, 2), avoid: (res.avoid || []).map(x => str(x, 40)).slice(0, 6),
  };
}

async function aiChat(user, provider, b) {
  const design = (b.design || []).slice(0, 300); const catalog = (b.catalog || []).slice(0, 400);
  const pl = new Set(design.map(x => x.id)), ids = new Set(catalog.map(x => x.id)), rooms = new Set((b.rooms || []).map(r => r.id));
  const system = `${SYS_COMMON} Пользователь правит дизайн-проект. Можно только: заменить предмет на товар из catalog, удалить предмет, добавить товар из catalog в комнату, сменить отделку стен/пола на товар из catalog. Нельзя менять планировку и инженерию. Ответ: {"reply":"что сделано, по-русски","operations":[{"op":"replace","placementId":"","productId":""}|{"op":"remove","placementId":""}|{"op":"add","roomId":"","productId":""}|{"op":"finish","roomId":"","surface":"walls|floor","productId":""}]}. Если подходящего товара нет — операций нет, объясни в reply.`;
  const res = await callModel(provider, system, JSON.stringify({ message: str(b.message, 1000), design, finishes: b.finishes, rooms: b.rooms, catalog }));
  const ops = (Array.isArray(res.operations) ? res.operations : []).filter(o =>
    (o.op === 'replace' && pl.has(o.placementId) && ids.has(o.productId)) || (o.op === 'remove' && pl.has(o.placementId)) ||
    (o.op === 'add' && rooms.has(o.roomId) && ids.has(o.productId)) || (o.op === 'finish' && rooms.has(o.roomId) && ['walls', 'floor'].includes(o.surface) && ids.has(o.productId))).slice(0, 30);
  return { reply: str(res.reply, 600), operations: ops };
}

async function aiRecognize(user, provider, b) {
  let img = null;
  if (b.uploadId) { const u = await loadUpload(b.uploadId, user); if (u) img = { mime: u.mime, data: u.bytes.toString('base64') }; }
  else if (typeof b.image === 'string' && b.image.startsWith('data:image/')) { const [, mime, data] = b.image.match(/^data:(image\/[\w+]+);base64,(.*)$/) || []; if (mime && data.length < 14_000_000) img = { mime, data }; }
  if (!img) throw new HttpError(400, 'Нет изображения плана');
  const system = `${SYS_COMMON} На изображении план квартиры размером ${Number(b.width) || 0}×${Number(b.height) || 0} пикселей. Найди стены (оси стен). Ответ: {"walls":[{"x1":0,"y1":0,"x2":0,"y2":0,"thickness":10}]} в пикселях изображения. Не добавляй мебель, текст и размерные линии.`;
  const res = await callModel(provider, system, 'Распознай стены на плане.', [img]);
  return { walls: (res.walls || []).filter(w => [w.x1, w.y1, w.x2, w.y2].every(Number.isFinite)).slice(0, 300) };
}

async function aiRender(user, provider, b) {
  // Изображения: 1) 3D-снимок комнаты — композиция и расстановка, 2..) референсы пользователя — стиль и палитра
  const images = [];
  if (typeof b.snapshot === 'string') { const m = b.snapshot.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/); if (m && m[2].length < 6_000_000) images.push({ mime: m[1], data: m[2] }); }
  const refs = await imagesFor(user, (b.references || []).slice(0, 3));
  const hasSnap = images.length > 0;
  images.push(...refs);
  const prompt = [
    `Фотореалистичная интерьерная визуализация: ${str(b.type, 40)} «${str(b.room, 60)}», ${Number(b.area || 0).toFixed(1)} м², стиль ${str(b.style, 40)}.`,
    hasSnap ? 'Первое изображение — 3D-эскиз этой комнаты: сохрани ракурс, геометрию стен, окна, двери и расстановку мебели, но сделай материалы, свет и текстуры реалистичными.' : '',
    refs.length ? `Следующие ${refs.length} изображения — референсы пользователя: перенеси с них настроение, палитру и характер материалов, но не копируй их планировку.` : '',
    b.prompt ? `Пожелания: ${str(b.prompt, 400)}.` : '',
    b.palette?.length ? `Палитра: ${b.palette.slice(0, 5).map(x => str(x, 8)).join(', ')}.` : '',
    b.materials?.length ? `Материалы: ${b.materials.slice(0, 6).map(x => str(x, 40)).join(', ')}.` : '',
    `Пол: ${str(b.floor, 100) || 'по стилю'}. Стены: ${str(b.walls, 100) || 'по стилю'}.`,
    `Мебель (реальные товары, соблюдай пропорции): ${(b.items || []).slice(0, 20).map(x => str(x, 140)).join('; ')}.`,
    'Дневной свет, без людей, без текста и водяных знаков.',
  ].filter(Boolean).join(' ');
  let b64;
  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) throw new HttpError(400, 'Не задан OPENAI_API_KEY');
    const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
    let r;
    if (images.length) {
      const form = new FormData();
      form.append('model', model); form.append('prompt', prompt); form.append('size', '1536x1024');
      images.forEach((im, i) => form.append('image[]', new Blob([Buffer.from(im.data, 'base64')], { type: im.mime }), `img${i}.${im.mime.split('/')[1]}`));
      r = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(190_000) });
    } else {
      r = await fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: JSON.stringify({ model, prompt, size: '1536x1024' }), signal: AbortSignal.timeout(190_000) });
    }
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new HttpError(502, d.error?.message || 'Ошибка генерации изображения');
    b64 = d.data?.[0]?.b64_json;
  } else {
    if (!process.env.GEMINI_API_KEY) throw new HttpError(400, 'Не задан GEMINI_API_KEY');
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const parts = [{ text: prompt }, ...images.map(x => ({ inlineData: { mimeType: x.mime, data: x.data } }))];
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }), signal: AbortSignal.timeout(190_000) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new HttpError(502, d.error?.message || 'Ошибка генерации изображения');
    b64 = d.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
  }
  if (!b64) throw new HttpError(502, 'Провайдер не вернул изображение');
  const bytes = Buffer.from(b64, 'base64');
  if (!MIME_BY_MAGIC(bytes)) throw new HttpError(502, 'Неизвестный формат изображения');
  return saveUpload(user, bytes);
}

// ——— Проверка ссылок (с защитой от обращений во внутреннюю сеть) ———
function privateIp(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith('::ffff:') && privateIp(ip.slice(7));
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
async function assertPublicUrl(raw) {
  let u; try { u = new URL(raw); } catch { throw new HttpError(400, 'Некорректная ссылка'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new HttpError(400, 'Нужна ссылка http(s)');
  const { address } = await lookup(u.hostname);
  if (privateIp(address)) throw new HttpError(400, 'Адрес во внутренней сети недоступен для загрузки');
  return u;
}
async function checkUrl(raw) {
  try {
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol)) return { url: raw, ok: false, status: 'protocol' };
    const { address } = await lookup(u.hostname);
    if (privateIp(address)) return { url: raw, ok: false, status: 'private' };
    let r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(6000), headers: { 'user-agent': 'DomProektLinkCheck/1.0' } });
    if (r.status === 405 || r.status === 403) r = await fetch(u, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'DomProektLinkCheck/1.0' } });
    return { url: raw, ok: r.status < 400, status: r.status };
  } catch (e) { return { url: raw, ok: false, status: 'error' }; }
}

// ——— Маршруты ———
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname, M = req.method;
    if (p.startsWith('/api/')) {
      if (M === 'GET' && p === '/api/health') return send(res, 200, { ok: true, providers: providers(), version: 2 });

      // Аккаунт
      if (M === 'POST' && p === '/api/auth/register') {
        limitAttempts('reg:' + req.socket.remoteAddress);
        const b = await jsonBody(req);
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Укажите корректную эл. почту');
        if (String(b.password || '').length < 8) throw new HttpError(400, 'Пароль не короче 8 символов');
        if (!b.consent) throw new HttpError(400, 'Нужно согласие на обработку персональных данных');
        if (users.some(u => u.email === email)) throw new HttpError(409, 'Аккаунт с такой почтой уже есть');
        const user = { id: randomUUID(), email, name: str(b.name, 80), ...(await hashPassword(String(b.password))), createdAt: new Date().toISOString(), consentAt: new Date().toISOString() };
        users.push(user); await writeJson(usersFile, users);
        await mkdir(userDir(user, 'projects'), { recursive: true });
        return send(res, 201, { user: publicUser(user) }, { 'set-cookie': await startSession(req, res, user) });
      }
      if (M === 'POST' && p === '/api/auth/login') {
        const b = await jsonBody(req);
        const email = String(b.email || '').trim().toLowerCase();
        limitAttempts('login:' + email);
        const user = users.find(u => u.email === email);
        if (!user || !(await checkPassword(String(b.password || ''), user))) throw new HttpError(401, 'Неверная почта или пароль');
        attempts.delete('login:' + email);
        return send(res, 200, { user: publicUser(user) }, { 'set-cookie': await startSession(req, res, user) });
      }
      if (M === 'POST' && p === '/api/auth/logout') {
        const sid = cookies(req).dp_sid; if (sid) { delete sessions[sid]; await writeJson(sessionsFile, sessions); }
        return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) });
      }
      if (M === 'GET' && p === '/api/auth/me') return send(res, 200, { user: publicUser(currentUser(req)) });
      if (M === 'GET' && p === '/api/auth/export') {
        const u = requireUser(req);
        const files = await readdir(userDir(u, 'projects')).catch(() => []);
        const projects = []; for (const f of files) projects.push(await readJson(userDir(u, 'projects', f), null));
        return send(res, 200, { user: publicUser(u), createdAt: u.createdAt, consentAt: u.consentAt, projects: projects.filter(Boolean) });
      }
      if (M === 'DELETE' && p === '/api/auth/account') {
        const u = requireUser(req);
        await rm(userDir(u), { recursive: true, force: true });
        for (const f of await readdir(dirs.uploads).catch(() => [])) if (f.endsWith('.json')) { const m = await readJson(path.join(dirs.uploads, f), null); if (m?.owner === u.id) { await rm(path.join(dirs.uploads, f), { force: true }); await rm(path.join(dirs.uploads, f.replace('.json', '.img')), { force: true }); } }
        for (const f of await readdir(dirs.shares).catch(() => [])) { const s = await readJson(path.join(dirs.shares, f), null); if (s?.owner === u.id) await rm(path.join(dirs.shares, f), { force: true }); }
        users = users.filter(x => x.id !== u.id); await writeJson(usersFile, users);
        for (const [k, v] of Object.entries(sessions)) if (v.userId === u.id) delete sessions[k];
        await writeJson(sessionsFile, sessions);
        return send(res, 200, { ok: true }, { 'set-cookie': sessionCookie(req, '', 0) });
      }

      // Проекты и версии
      if (M === 'GET' && p === '/api/projects') {
        const u = requireUser(req);
        const files = await readdir(userDir(u, 'projects')).catch(() => []);
        const list = [];
        for (const f of files.filter(f => f.endsWith('.json'))) { const pr = await readJson(userDir(u, 'projects', f), null); if (pr) list.push({ id: pr.id, name: pr.name, city: pr.city, updatedAt: pr.updatedAt }); }
        return send(res, 200, { projects: list });
      }
      const pm = p.match(/^\/api\/projects\/([\w-]+)(\/versions)?$/);
      if (pm) {
        const u = requireUser(req); const id = pm[1]; if (!safeId(id)) throw new HttpError(400, 'Некорректный ID');
        const file = userDir(u, 'projects', `${id}.json`);
        if (!pm[2]) {
          if (M === 'GET') { const pr = await readJson(file, null); return pr ? send(res, 200, pr) : send(res, 404, { error: 'Проект не найден' }); }
          if (M === 'PUT') { const pr = await jsonBody(req, 30_000_000); if (pr.id !== id) throw new HttpError(400, 'ID проекта не совпадает'); await mkdir(path.dirname(file), { recursive: true }); await writeJson(file, pr); return send(res, 200, { ok: true, savedAt: new Date().toISOString() }); }
          if (M === 'DELETE') { await rm(file, { force: true }); await rm(userDir(u, 'versions', id), { recursive: true, force: true }); return send(res, 200, { ok: true }); }
        } else {
          const vdir = userDir(u, 'versions', id);
          if (M === 'GET') { const files = (await readdir(vdir).catch(() => [])).sort().reverse(); const list = []; for (const f of files) { const v = await readJson(path.join(vdir, f), null); if (v) list.push({ id: v.id, name: v.name, date: v.date }); } return send(res, 200, { versions: list }); }
          if (M === 'POST') {
            const b = await jsonBody(req, 30_000_000); await mkdir(vdir, { recursive: true });
            const v = { id: Date.now().toString(36), name: str(b.name, 100) || 'Версия', date: new Date().toISOString(), data: b.data };
            await writeJson(path.join(vdir, `${Date.now()}.json`), v);
            const files = (await readdir(vdir)).sort(); for (const f of files.slice(0, Math.max(0, files.length - 30))) await rm(path.join(vdir, f), { force: true });
            return send(res, 201, { id: v.id });
          }
        }
      }

      // Загрузки изображений: тип, размер и сигнатура файла
      if (M === 'POST' && p === '/api/uploads') {
        const u = requireUser(req);
        const type = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new HttpError(415, 'Поддерживаются JPG, PNG и WebP');
        const bytes = await readBody(req, 10 * 1024 * 1024);
        if (MIME_BY_MAGIC(bytes) !== type) throw new HttpError(400, 'Содержимое файла не совпадает с типом изображения');
        return send(res, 201, await saveUpload(u, bytes));
      }
      const um = p.match(/^\/api\/uploads\/([a-f0-9-]{36})$/i);
      if (M === 'GET' && um) {
        const u = currentUser(req); const f = await loadUpload(um[1], u);
        if (!f) return send(res, 404, { error: 'Файл не найден' });
        res.writeHead(200, { 'content-type': f.mime, 'cache-control': 'private, max-age=86400', 'x-content-type-options': 'nosniff' });
        return res.end(f.bytes);
      }

      // Ссылки только для чтения и комментарии
      if (M === 'POST' && p === '/api/share') {
        const u = requireUser(req); const b = await jsonBody(req, 30_000_000);
        if (!b.project || !safeId(b.projectId)) throw new HttpError(400, 'Нет проекта');
        const files = await readdir(dirs.shares).catch(() => []);
        for (const f of files) { const s = await readJson(path.join(dirs.shares, f), null); if (s?.owner === u.id && s.projectId === b.projectId) { s.project = stripPrivate(b.project); s.createdAt = new Date().toISOString(); await writeJson(path.join(dirs.shares, f), s); return send(res, 200, { token: s.token }); } }
        const token = randomBytes(18).toString('base64url');
        await writeJson(path.join(dirs.shares, `${token}.json`), { token, owner: u.id, projectId: b.projectId, project: stripPrivate(b.project), createdAt: new Date().toISOString(), comments: [] });
        return send(res, 201, { token });
      }
      const sm = p.match(/^\/api\/share\/([\w-]{10,40})(\/comments)?$/);
      if (sm) {
        const file = path.join(dirs.shares, `${sm[1]}.json`); const s = await readJson(file, null);
        if (!s) return send(res, 404, { error: 'Ссылка недействительна' });
        if (M === 'GET' && !sm[2]) return send(res, 200, { project: s.project, createdAt: s.createdAt, comments: s.comments });
        if (M === 'POST' && sm[2]) { limitAttempts('comment:' + req.socket.remoteAddress); const b = await jsonBody(req, 20_000); if (!str(b.text).trim()) throw new HttpError(400, 'Пустой комментарий'); s.comments.push({ name: str(b.name, 60), text: str(b.text, 2000), at: new Date().toISOString() }); s.comments = s.comments.slice(-200); await writeJson(file, s); return send(res, 201, { ok: true }); }
      }

      // Общий каталог из фидов магазинов
      if (M === 'GET' && p === '/api/catalog') return send(res, 200, { products: feeds.products(), ...feeds.meta() });
      if (p === '/api/catalog/sources') {
        if (M === 'GET') { requireAdmin(req); return send(res, 200, { sources: feeds.list() }); }
        if (M === 'POST') {
          const u = requireAdmin(req); const b = await jsonBody(req, 40_000_000);
          if (!b.content && !b.contentBase64 && !b.url) throw new HttpError(400, 'Укажите ссылку на фид или загрузите файл');
          if (b.url) await assertPublicUrl(b.url);
          const cities = Array.isArray(b.cities) && b.cities.length ? b.cities.map(c => str(c, 60)) : '*';
          return send(res, 201, { source: await feeds.add({ name: b.name, url: b.url, format: b.format, cities, deliveryDays: b.deliveryDays, authHeader: b.authHeader, content: b.contentBase64 ? Buffer.from(String(b.contentBase64), 'base64') : b.content ? String(b.content) : null, createdBy: u.id }) });
        }
      }
      const fm = p.match(/^\/api\/catalog\/sources\/([\w-]{4,40})(\/refresh)?$/);
      if (fm) {
        requireAdmin(req);
        if (M === 'POST' && fm[2]) { const src = await feeds.refresh(fm[1]); return src ? send(res, 200, { source: src }) : send(res, 404, { error: 'Источник не найден' }); }
        if (M === 'PATCH') { const b = await jsonBody(req); const src = await feeds.update(fm[1], b); return src ? send(res, 200, { source: src }) : send(res, 404, { error: 'Источник не найден' }); }
        if (M === 'DELETE') { await feeds.remove(fm[1]); return send(res, 200, { ok: true }); }
      }

      // Каталог: проверка ссылок и сообщения об ошибках
      if (M === 'POST' && p === '/api/catalog/check-links') {
        requireUser(req);
        const b = await jsonBody(req);
        const urls = [...new Set((b.urls || []).map(String))].slice(0, 60);
        const results = []; for (let i = 0; i < urls.length; i += 6) results.push(...await Promise.all(urls.slice(i, i + 6).map(checkUrl)));
        return send(res, 200, { results, checkedAt: new Date().toISOString() });
      }
      if (M === 'POST' && p === '/api/reports') {
        const b = await jsonBody(req, 20_000); const file = path.join(dataDir, 'reports.json');
        const list = await readJson(file, []); list.push({ productId: str(b.productId, 80), kind: str(b.kind, 60), comment: str(b.comment, 1000), city: str(b.city, 60), user: currentUser(req)?.id || null, at: new Date().toISOString(), status: 'new' });
        await writeJson(file, list.slice(-5000)); return send(res, 201, { ok: true });
      }

      // ИИ
      const am = p.match(/^\/api\/(design|analyze|chat|render|recognize)\/(openai|gemini)$/);
      if (M === 'POST' && am) {
        const u = requireUser(req); const b = await jsonBody(req, 16_000_000);
        const fn = { design: aiDesign, analyze: aiAnalyze, chat: aiChat, render: aiRender, recognize: aiRecognize }[am[1]];
        return send(res, 200, await fn(u, am[2], b));
      }
      return send(res, 404, { error: 'Не найдено' });
    }

    // Статика
    if (M !== 'GET' && M !== 'HEAD') return send(res, 405, { error: 'Метод не поддерживается' });
    const rel = decodeURIComponent(p === '/' ? '/index.html' : p);
    if (!STATIC_ALLOW.test(rel) || rel.includes('..')) return send(res, 404, { error: 'Не найдено' });
    const file = path.join(root, rel);
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(M === 'HEAD' ? undefined : content);
  } catch (e) {
    const status = e.status || (e.code === 'ENOENT' ? 404 : e.name === 'TimeoutError' ? 504 : 500);
    if (status >= 500) console.error(e);
    send(res, status, { error: status === 404 && e.code === 'ENOENT' ? 'Не найдено' : e.message || 'Ошибка запроса' });
  }
});

// Из ссылки для чтения убираем загруженные изображения и рендеры (они доступны только владельцу)
function stripPrivate(p) {
  const c = JSON.parse(JSON.stringify(p));
  if (c.brief) { c.brief.references = []; c.brief.analysis = c.brief.analysis || null; }
  c.underlay = null;
  for (const d of c.designs || []) { d.renders = []; d.chat = []; }
  return c;
}

const feeds = createFeedSync({ dataDir, assertPublicUrl, log: console });
await feeds.init();
feeds.startScheduler();

const port = Number(process.env.PORT) || 4173;
const host = process.env.HOST || '127.0.0.1';
server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Порт ${port} уже занят — вероятно, ДомПроект или другой сервер уже запущен.\nОстановите его или запустите на другом порту: PORT=4180 node server.mjs (в PowerShell: $env:PORT=4180; node server.mjs)`);
    process.exit(1);
  }
  throw e;
});
server.listen(port, host, () => console.log(`ДомПроект открыт: http://localhost:${port}  (расширенный подбор: ${Object.entries(providers()).filter(([, v]) => v).map(([k]) => k).join(', ') || 'не подключён'})`));
