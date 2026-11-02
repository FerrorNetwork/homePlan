// Сервис каталога на клиенте: объединение демо-каталога и импортированных фидов, лучшая цена по городу,
// проверка позиции перед показом (раздел 5.3) и подбор аналогов (FR-35).
import { SEED_CATALOG, offersFor } from '../data/catalog.js';
import { feedToProducts } from './feeds.js';

const FRESH_DAYS = 7;
const NEEDS_DIMS = ['Мебель', 'Кухни', 'Сантехника', 'Плитка и керамогранит', 'Бытовая техника'];

// Общий каталог из фидов магазинов приходит с сервера и обновляется ежедневно
let SERVER_CATALOG = [];
let serverIds = new Set();
export function setServerCatalog(list) { SERVER_CATALOG = Array.isArray(list) ? list : []; serverIds = new Set(SERVER_CATALOG.map(p => p.id)); }
export const serverCatalogSize = () => SERVER_CATALOG.length;

// Демо-позиции можно отключить в проекте, когда подключены реальные фиды
export function allProducts(project) {
  const extra = project?.catalogExtra || [];
  const ids = new Set(extra.map(p => p.id));
  const seed = project?.useDemoCatalog === false ? [] : SEED_CATALOG;
  return [...seed.filter(p => !ids.has(p.id)), ...SERVER_CATALOG.filter(p => !ids.has(p.id)), ...extra];
}

// Поиск по ID идёт и по скрытым демо-позициям, чтобы старые проекты не теряли товары
export function productById(project, id) {
  return (project?.catalogExtra || []).find(p => p.id === id) || SERVER_CATALOG.find(p => p.id === id) || SEED_CATALOG.find(p => p.id === id) || null;
}

const daysSince = date => Math.floor((Date.now() - new Date(date).getTime()) / 86400000);

export function deliversTo(offer, city) {
  return offer.cities === '*' || !offer.cities || offer.cities.includes(city);
}

// Лучшее предложение для города: свежая цена, доставка в город, наличие.
export function bestOffer(product, city) {
  const offers = offersFor(product);
  const scored = offers.map(o => ({ ...o, fresh: daysSince(o.updated) <= FRESH_DAYS, delivers: deliversTo(o, city) }));
  const usable = scored.filter(o => o.fresh && o.delivers && o.inStock !== false);
  usable.sort((a, b) => a.price - b.price);
  return usable[0] || null;
}

export function allOffers(product, city) {
  return offersFor(product).map(o => ({ ...o, fresh: daysSince(o.updated) <= FRESH_DAYS, delivers: deliversTo(o, city), age: daysSince(o.updated) }));
}

// Проверка записи перед показом в проекте. Возвращает список проблем (пустой — позиция годна).
export function validateProduct(project, product, city) {
  const issues = [];
  if (!product) return ['Товара нет в каталоге'];
  if (NEEDS_DIMS.includes(product.category) && !(product.dims?.w > 0 && (product.dims?.d > 0 || product.kind?.startsWith('tile')))) issues.push('Нет размеров — нельзя расставить');
  const offers = allOffers(product, city);
  if (!offers.length) issues.push('Нет предложений магазинов');
  else {
    if (!offers.some(o => o.fresh)) issues.push(`Цена старше ${FRESH_DAYS} дней`);
    if (!offers.some(o => o.delivers)) issues.push('Нет доставки в город');
    if (!offers.some(o => o.inStock !== false && o.delivers)) issues.push('Нет в наличии');
  }
  const flag = project?.catalogFlags?.[product.id];
  if (flag?.link === 'dead') issues.push('Ссылка недоступна');
  if (flag?.discontinued) issues.push('Снят с продажи');
  return issues;
}

export const isUsable = (project, product, city) => validateProduct(project, product, city).length === 0;

export function styleScore(product, styleId) {
  if (!product.styles) return 0;
  if (product.styles.includes(styleId)) return 2;
  if (product.styles.includes('*')) return 1;
  return 0;
}

// Аналоги: тот же тип, размеры в пределах ±20%, сортировка по стилю и близости цены.
export function analogs(project, product, { city, styleId, limit = 8 } = {}) {
  if (!product) return [];
  const area = (product.dims?.w || 1) * (product.dims?.d || 1);
  return allProducts(project)
    .filter(p => p.id !== product.id && p.kind === product.kind)
    .map(p => {
      const offer = bestOffer(p, city);
      const a = (p.dims?.w || 1) * (p.dims?.d || 1);
      const sizeDiff = Math.abs(a - area) / area;
      return { product: p, offer, sizeDiff, style: styleScore(p, styleId), priceDiff: offer ? offer.price - (bestOffer(product, city)?.price ?? product.price) : null };
    })
    .filter(x => x.sizeDiff <= 0.6)
    .sort((a, b) => (b.style - a.style) || (a.sizeDiff - b.sizeDiff) || ((a.offer?.price ?? 1e9) - (b.offer?.price ?? 1e9)))
    .slice(0, limit);
}

export function priceOf(product, city) {
  return bestOffer(product, city)?.price ?? null;
}

// ——— Импорт файла фида в проект (YML/XML, CSV, JSON) — тот же разбор, что и на сервере ———
export function parseFeed(text, sourceName = 'Импорт') {
  const source = { id: 'imp-' + sourceName.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').slice(0, 30), name: sourceName, cities: '*', deliveryDays: null };
  return feedToProducts(text, source).products;
}
