// Разбор товарных фидов магазинов: YML (Яндекс), произвольный XML с <offer>, CSV, JSON.
// Модуль общий для сервера (ежедневная загрузка) и браузера (импорт файла в проект), без DOM.
// Результат — записи каталога в формате приложения: размеры в мм, предложение магазина с датой и ссылкой.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = s => String(s ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m)
  .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')); return m ? decode(m[2] ?? m[3]) : null; };
const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };

// ——— Категории, типы, стили ———
const CATEGORY_WORDS = [
  [/кухн(?!н)|кухонн/, 'Кухни'], [/холодильн|стиральн|посудомо|духов|варочн|микроволн|плит[аы] (газ|элек)|вытяжк/, 'Бытовая техника'],
  [/ванн|унитаз|раковин|умывальн|смесител|душ|инсталляц|полотенцесуш|сантехн/, 'Сантехника'],
  [/плитк|керамогранит|мозаик|кафел/, 'Плитка и керамогранит'], [/ламинат|паркет|линолеум|кварцвинил|виниловый пол|пробков|напольн/, 'Напольные покрытия'],
  [/обо[ий]|краск|эмаль|штукатурк декор/, 'Обои и краски'], [/двер|окн[оа]|подоконн/, 'Двери и окна'],
  [/светильник|люстр|торшер|(^|\s)бра(\s|$)|лампа|спот|трек|освещ|подсветк/, 'Освещение'], [/розетк|выключател|диммер|рамк[аи] электр|электроустан/, 'Электроустановочные изделия'],
  [/ков[её]р|штор|тюль|текстил|подушк|плед|декор|ваз[аы]|зеркал|картин|растен|кашпо/, 'Текстиль и декор'],
  [/диван|кресл|шкаф|кроват|стол|стул|комод|стеллаж|тумб|полк|пуф|банкетк|прихож|мебел/, 'Мебель'],
];
const KIND_WORDS = [
  [/угл\S* диван|диван\S* угл/, 'sofa-corner'], [/диван/, 'sofa'], [/кресло.{0,12}(офис|компьют|рабоч)|(офис|компьют)\S* кресл/, 'office-chair'], [/кресл/, 'armchair'],
  [/журнальн/, 'coffee-table'], [/тв.?тумб|тумб\S* под (тв|телевиз)|тумба тв/, 'tv-stand'], [/стеллаж|книжн\S* шкаф|буфет|сервант/, 'bookshelf'],
  [/кухонн\S* гарнитур|кухня прям|кухонный модул|кухня \d/, 'kitchen-set'], [/холодильн/, 'fridge'], [/обеденн/, 'dining-table'], [/(письменн|компьютерн)\S* стол/, 'desk'],
  [/стул/, 'chair'], [/прикроват/, 'nightstand'], [/кроват/, 'bed'], [/шкаф/, 'wardrobe'], [/комод/, 'dresser'], [/обувниц/, 'shoe-cabinet'], [/вешалк/, 'coat-rack'],
  [/(^|\s)ванн(а|ы)?(\s|$)|ванна /, 'bath'], [/душев/, 'shower'], [/тумб\S* (с|под) раковин|раковин|умывальн/, 'vanity'], [/унитаз/, 'toilet'], [/стиральн/, 'washer'], [/зеркал/, 'mirror'],
  [/торшер/, 'floor-lamp'], [/(^|\s)бра(\s|$)/, 'sconce'], [/подвесн|люстр/, 'pendant'], [/трек/, 'track'], [/светильник/, 'ceiling-light'],
  [/розетк/, 'socket'], [/выключател/, 'switch'], [/ков[её]р/, 'rug'], [/штор|тюль/, 'curtains'], [/растен|кашпо/, 'plant'],
  [/декор\S* (вставк|элемент)|бордюр|вставка/, 'tile-decor'], [/настенн\S* плитк|плитк\S* настенн|облицовочн/, 'tile-wall'], [/плитк|керамогранит|мозаик/, 'tile-floor'],
  [/ламинат|паркет|линолеум|кварцвинил/, 'floor-covering'], [/краск|эмаль/, 'paint'], [/обо[ий]/, 'wallpaper'], [/двер/, 'door'], [/стол/, 'dining-table'],
];
const STYLE_WORDS = [
  [/сканди|скандинав|nordic|норд/, 'scandi'], [/лофт|loft|индастри/, 'loft'], [/минимал/, 'minimal'], [/неоклас|классик|классич|ампир|барокко/, 'neoclassic'],
  [/японди|japandi|япон/, 'japandi'], [/средиземномор|греч|итальян/, 'mediterranean'], [/эко|ротанг|ратан|массив|бамбук|лён|льнян/, 'eco'],
  [/ар.?деко|art.?deco|латун|бархат/, 'artdeco'], [/винтаж|ретро|mid.?century|орех/, 'vintage'], [/прованс|кантри|шебби/, 'provence'],
  [/хай.?тек|глянц|хром/, 'hightech'], [/современн|модерн|modern/, 'modern'],
];
const COLOR_WORDS = [[/бел/, '#f3f2ee'], [/черн|чёрн|графит|антрацит/, '#2f2f2f'], [/сер/, '#9a9a96'], [/беж|песоч|крем|слонов/, '#e2d6bf'], [/коричн|шоколад|венге/, '#5e4130'],
  [/дуб|натурал|дерев|бук|сосн|ясен/, '#c9a87c'], [/орех/, '#7b4f30'], [/зел|олив|шалфей/, '#8a9a6a'], [/син|индиго|морск/, '#2f5f8f'], [/голуб|бирюз/, '#7fb0c4'],
  [/красн|бордо|терракот/, '#a8473a'], [/желт|жёлт|горчич|охр/, '#d4a93c'], [/розов|пудров/, '#d9a8a8'], [/золот|латун/, '#c9a96e']];

const pick = (list, text, def) => (list.find(([re]) => re.test(text)) || [null, def])[1];
export const categoryOf = text => pick(CATEGORY_WORDS, text, 'Мебель');
export const kindOf = text => pick(KIND_WORDS, text, 'decor');
export const stylesOf = text => { const s = STYLE_WORDS.filter(([re]) => re.test(text)).map(([, id]) => id); return s.length ? s : ['*']; };
export const colorOf = text => pick(COLOR_WORDS, text, '#cfc8bb');

// ——— Размеры ———
const toMm = (v, unit) => { const u = String(unit || '').toLowerCase(); const n = num(v); if (!n) return 0; if (/мм|mm/.test(u)) return n; if (/^м$|^m$|метр/.test(u)) return n * 1000; if (/см|cm/.test(u)) return n * 10; return n; };
function guessUnit(values) { const m = Math.max(...values.filter(Boolean)); return m < 6 ? 'м' : m < 400 ? 'см' : 'мм'; }

export function dimsFrom({ params = {}, dimensions = '', name = '', kind = '' }) {
  const P = Object.fromEntries(Object.entries(params).map(([k, v]) => [k.toLowerCase(), v]));
  const find = re => Object.entries(P).find(([k]) => re.test(k));
  const w = find(/ширин/), d = find(/глубин/), h = find(/высот/), l = find(/длин/), t = find(/толщин/);
  const unitOf = e => e?.[1]?.unit || (/,\s*(мм|см|м)(?![а-яё])/.exec(e?.[0] || '') || [])[1] || '';
  if (w || d || h || l) {
    const raw = [w, d || (l && w ? null : l), h].map(e => e?.[1]?.value);
    const units = [w, d, h].map(unitOf);
    const u = units.find(Boolean) || guessUnit(raw.map(num));
    let W = toMm(w?.[1]?.value ?? l?.[1]?.value, unitOf(w || l) || u), D = toMm(d?.[1]?.value ?? (w && l ? l[1].value : 0), unitOf(d) || u), H = toMm(h?.[1]?.value ?? t?.[1]?.value, unitOf(h || t) || u);
    if (w && l && !d) { D = toMm(w[1].value, unitOf(w) || u); W = toMm(l[1].value, unitOf(l) || u); }
    if (W) return { w: Math.round(W), d: Math.round(D), h: Math.round(H) };
  }
  // YML <dimensions>: длина/ширина/высота в сантиметрах
  if (dimensions) { const p = String(dimensions).split('/').map(num); if (p[0]) return { w: Math.round(p[0] * 10), d: Math.round((p[1] || 0) * 10), h: Math.round((p[2] || 0) * 10) }; }
  // Размер в названии: «Диван 210×95×85 см», «Плитка 60x60»
  const m = String(name).match(/(\d+[.,]?\d*)\s*[xх×*]\s*(\d+[.,]?\d*)(?:\s*[xх×*]\s*(\d+[.,]?\d*))?\s*(мм|см|м)?/i);
  if (m) { const vals = [m[1], m[2], m[3]].map(num); const u = m[4] || (kind.startsWith('tile') ? 'см' : guessUnit(vals)); return { w: Math.round(toMm(vals[0], u)), d: Math.round(toMm(vals[1], u)), h: Math.round(toMm(vals[2] || 0, u)) || (kind.startsWith('tile') ? 9 : 0) }; }
  return null;
}

// ——— Парсеры форматов ———
export function parseYml(text) {
  const cats = {};
  for (const m of text.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>/gi)) { const id = attr(m[1], 'id'); if (id) cats[id] = { name: decode(m[2]), parent: attr(m[1], 'parentId') }; }
  const catPath = id => { const out = []; let c = cats[id], guard = 0; while (c && guard++ < 10) { out.unshift(c.name); c = cats[c.parent]; } return out.join(' / '); };
  const shop = decode((text.match(/<shop>[\s\S]*?<name>([\s\S]*?)<\/name>/i) || [])[1] || '');
  const rows = [];
  for (const m of text.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/gi)) {
    const head = m[1], body = m[2];
    const tag = t => { const r = body.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, 'i')); return r ? decode(r[1]) : ''; };
    const params = {};
    for (const p of body.matchAll(/<param\b([^>]*)>([\s\S]*?)<\/param>/gi)) { const n = attr(p[1], 'name'); if (n) params[n] = { value: decode(p[2]), unit: attr(p[1], 'unit') || '' }; }
    const pictures = [...body.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)].map(x => decode(x[1])).filter(Boolean);
    const name = tag('name') || [tag('typePrefix'), tag('vendor'), tag('model')].filter(Boolean).join(' ');
    rows.push({
      id: attr(head, 'id'), name, vendor: tag('vendor'), vendorCode: tag('vendorCode') || tag('barcode'), price: num(tag('price')), oldPrice: num(tag('oldprice')),
      currency: tag('currencyId') || 'RUR', url: tag('url'), picture: pictures[0] || '', pictures, category: catPath(tag('categoryId')), description: tag('description').slice(0, 600),
      available: attr(head, 'available') !== 'false', params, dimensions: tag('dimensions'), delivery: tag('delivery-options') ? null : null, salesNotes: tag('sales_notes'),
    });
  }
  return { shop, rows };
}

function splitCsvLine(line, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out.map(s => s.trim());
}
export function parseCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [] };
  const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const head = splitCsvLine(lines[0], sep).map(h => h.toLowerCase());
  const col = (...names) => head.findIndex(h => names.some(n => h.includes(n)));
  const ci = { id: col('id', 'код'), name: col('назв', 'наимен', 'name', 'товар'), price: col('цена', 'price'), url: col('ссылка', 'url'), pic: col('фото', 'изображ', 'картин', 'picture', 'image'), cat: col('катег', 'category', 'раздел'), brand: col('бренд', 'brand', 'производ', 'vendor'), sku: col('артикул', 'sku', 'vendorcode'), dims: col('размер', 'габарит', 'dimensions'), w: col('ширин', 'width'), d: col('глубин', 'depth'), h: col('высот', 'height'), color: col('цвет', 'color'), mat: col('материал', 'material'), avail: col('налич', 'available', 'остат') };
  const rows = lines.slice(1).map(l => {
    const c = splitCsvLine(l, sep); const g = k => ci[k] >= 0 ? c[ci[k]] : '';
    const params = {};
    if (g('w')) params['Ширина'] = { value: g('w'), unit: /\(см\)|, см/.test(head[ci.w]) ? 'см' : /\(мм\)|, мм/.test(head[ci.w]) ? 'мм' : '' };
    if (g('d')) params['Глубина'] = { value: g('d'), unit: /см/.test(head[ci.d]) ? 'см' : /мм/.test(head[ci.d]) ? 'мм' : '' };
    if (g('h')) params['Высота'] = { value: g('h'), unit: /см/.test(head[ci.h]) ? 'см' : /мм/.test(head[ci.h]) ? 'мм' : '' };
    if (g('color')) params['Цвет'] = { value: g('color') }; if (g('mat')) params['Материал'] = { value: g('mat') };
    return { id: g('id'), name: g('name'), price: num(g('price')), url: g('url'), picture: g('pic'), category: g('cat'), vendor: g('brand'), vendorCode: g('sku'), params, dimensionsText: g('dims'), available: !/нет|0|false/i.test(g('avail') || 'да') };
  });
  return { rows };
}

export function parseJsonFeed(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.items || data.products || data.offers || [];
  return { rows: list.map(r => ({ id: r.id ?? r.sku, name: r.name ?? r.title, price: num(r.price), url: r.url ?? r.link, picture: r.picture ?? r.image ?? r.images?.[0] ?? '', category: r.category ?? '', vendor: r.brand ?? r.vendor ?? '', vendorCode: r.sku ?? r.vendorCode ?? r.article ?? '', params: Object.fromEntries(Object.entries(r.params || {}).map(([k, v]) => [k, typeof v === 'object' ? v : { value: v }])), dims: r.dims, dimensionsText: r.dimensions, available: r.available !== false && r.inStock !== false })) };
}

// Байты файла → текст с учётом кодировки из заголовка XML (windows-1251 у многих YML-выгрузок)
export function decodeFeedBytes(bytes, contentType = '') {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let head = ''; for (let i = 0; i < Math.min(300, u8.length); i++) head += String.fromCharCode(u8[i]);
  let enc = (/encoding=["']([\w-]+)["']/i.exec(head)?.[1] || /charset=([\w-]+)/i.exec(contentType)?.[1] || 'utf-8').toLowerCase();
  if (enc === 'cp1251') enc = 'windows-1251';
  try { return new TextDecoder(enc).decode(u8); } catch { return new TextDecoder('utf-8').decode(u8); }
}

export function detectFormat(text) {
  const t = text.trimStart().slice(0, 500);
  if (t.startsWith('<')) return 'yml';
  if (t.startsWith('{') || t.startsWith('[')) return 'json';
  return 'csv';
}

export function parseAny(text, format = 'auto') {
  const f = format === 'auto' ? detectFormat(text) : format;
  return f === 'yml' || f === 'xml' ? parseYml(text) : f === 'json' ? parseJsonFeed(text) : parseCsv(text);
}

// ——— Нормализация в запись каталога ———
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 33 + c.charCodeAt(0)) | 0; return Math.abs(h).toString(36); }
export const productKey = r => r.vendor && r.vendorCode ? `${r.vendor}|${r.vendorCode}`.toLowerCase().replace(/\s+/g, '') : String(r.name || '').toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim();

export function rowToProduct(r, source, today = new Date().toISOString().slice(0, 10)) {
  const text = `${r.name} ${r.category} ${r.description || ''}`.toLowerCase();
  const kind = kindOf(`${r.name} ${r.category}`.toLowerCase());
  const params = r.params || {};
  const pv = re => Object.entries(params).find(([k]) => re.test(k.toLowerCase()))?.[1]?.value || '';
  const dims = r.dims?.w ? { ...r.dims } : dimsFrom({ params, dimensions: r.dimensions || r.dimensionsText, name: `${r.name} ${r.dimensionsText || ''}`, kind });
  // Ориентация: у кровати ширина (у изголовья) меньше длины; у шкафов, диванов, тумб ширина вдоль стены больше глубины
  if (dims?.w && dims.d) {
    const long = ['sofa', 'sofa-corner', 'wardrobe', 'kitchen-set', 'tv-stand', 'dresser', 'bookshelf', 'desk', 'shoe-cabinet', 'bath', 'vanity', 'dining-table'];
    if ((kind === 'bed' && dims.w > dims.d) || (long.includes(kind) && dims.w < dims.d)) [dims.w, dims.d] = [dims.d, dims.w];
  }
  const color = pv(/цвет/) || '';
  const material = pv(/материал/) || '';
  const extra = {};
  if (kind.startsWith('tile')) {
    extra.shape = /шестигран|гексагон|hex/.test(text) ? 'hex' : 'rect';
    extra.pack = num(pv(/(кол-во|количество).*(упак|короб)|штук в упаков/)) || null;
    extra.unit = /за\s*шт|цена за штуку/.test(text + ' ' + (r.salesNotes || '')) ? 'шт' : 'м²';
  }
  if (kind === 'floor-covering') { extra.packM2 = num(pv(/площад.*упак|м2 в упак|м² в упак/)) || 2; extra.unit = 'м²'; }
  if (kind === 'paint') extra.coverage = (num(pv(/объ[её]м/)) || 9) * 7;
  if (kind === 'wallpaper') extra.coverage = (num(pv(/ширин/)) > 50 ? num(pv(/ширин/)) / 1000 : num(pv(/ширин/)) || 1.06) * (num(pv(/длин/)) || 10);
  const key = productKey(r);
  return {
    id: `feed-${hash(key)}`, key, name: String(r.name).slice(0, 180), brand: r.vendor || source.name, sku: r.vendorCode || '',
    category: categoryOf(`${r.category} ${r.name}`.toLowerCase()), kind, dims: dims || null, price: r.price,
    styles: stylesOf(text), color: colorOf(`${color} ${r.name}`.toLowerCase()), material: material || '', picture: r.picture || '', model: 'generated', demo: false,
    source: source.name, imported: today, ...extra,
    offers: [{ store: source.id, storeName: source.name, price: r.price, updated: today, url: r.url, cities: source.cities || '*', inStock: r.available !== false, deliveryDays: source.deliveryDays ?? null, demo: false }],
  };
}

// Один товар из разных магазинов — одна запись с несколькими предложениями (дедупликация, раздел 5.2)
export function mergeProducts(list) {
  const map = new Map();
  for (const p of list) {
    const ex = map.get(p.key);
    if (!ex) { map.set(p.key, { ...p, offers: [...p.offers] }); continue; }
    for (const o of p.offers) { const i = ex.offers.findIndex(x => x.store === o.store); if (i >= 0) ex.offers[i] = o; else ex.offers.push(o); }
    if (!ex.dims && p.dims) ex.dims = p.dims;
    if (!ex.picture && p.picture) ex.picture = p.picture;
    ex.price = Math.min(...ex.offers.map(o => o.price));
  }
  return [...map.values()];
}

export function feedToProducts(text, source, format = 'auto') {
  const { rows, shop } = parseAny(text, format);
  const valid = rows.filter(r => r.name && r.url && r.price > 0 && /^https?:\/\//i.test(r.url));
  return { products: mergeProducts(valid.map(r => rowToProduct(r, source))), total: rows.length, skipped: rows.length - valid.length, shop };
}
