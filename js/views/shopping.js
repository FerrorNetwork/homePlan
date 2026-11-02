// Шаг 5. Список покупок (5.4): товары по комнатам/категориям/магазинам, аналоги, где дешевле, каталог и импорт фидов.
import { S, commit } from '../store.js';
import { completeStep, requireFeature } from '../main.js';
import { esc, icon, toast, num, money, modal, thumb, dateRu, dateTimeRu, readFileAsText, confirmDialog } from '../ui.js';
import { shoppingList, sectionOf } from '../core/estimate.js';
import { analogs, allOffers, productById, allProducts, parseFeed, bestOffer, validateProduct, serverCatalogSize } from '../core/catalog.js';
import { catalogMeta, loadServerCatalog } from '../catalogSync.js';
import { decodeFeedBytes } from '../core/feeds.js';
import { CATEGORIES, STORES } from '../data/catalog.js';
import { exportXlsx, printDocument, download, toCSV } from '../core/export.js';
import { selectedDesign } from './design.js';
import { replacePlacement } from '../core/designer.js';
import { api } from '../api.js';

let tab = 'list', group = 'room', query = '', cat = 'Все';
let retail = null;
let feedSources = null;

export function mount(el) {
  if (!retail) fetch('/retail-sources.json').then(r => r.json()).then(j => { retail = j; render(); }).catch(() => { retail = { global: [], cities: {} }; });
  function items() { return shoppingList(S.project, selectedDesign()); }

  function render() {
    const p = S.project, list = items();
    const active = list.filter(i => !i.excluded);
    const total = active.reduce((s, i) => s + i.sum, 0);
    const problems = active.filter(i => i.issues.length).length;
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Шаг 5 из 6</div><h1>Список покупок</h1><p>Все товары проекта с фото, размерами, ценой и ссылкой на магазин в городе ${esc(p.city)}. Замена позиции сразу пересчитывает смету.</p></div>
        <div class="row wrap"><button class="btn" data-act="xlsx">${icon('download', 15)} Excel</button><button class="btn" data-act="pdf">${icon('print', 15)} PDF</button><button class="btn" data-act="share">${icon('share', 15)} Ссылка</button><button class="btn primary" data-act="complete">К смете ${icon('arrowRight', 15)}</button></div></div>
      <div class="kpis" style="margin-bottom:18px">
        <div class="kpi accent"><span>Итого товары</span><b>${money(total)}</b><small>${active.length} позиций</small></div>
        <div class="kpi"><span>Мебель и техника</span><b>${money(active.filter(i => sectionOf(i.product) === 'furniture').reduce((s, i) => s + i.sum, 0))}</b></div>
        <div class="kpi"><span>Отделка и плитка</span><b>${money(active.filter(i => ['finish', 'tile', 'electric'].includes(sectionOf(i.product))).reduce((s, i) => s + i.sum, 0))}</b></div>
        <div class="kpi"><span>Требуют внимания</span><b style="color:${problems ? 'var(--warn)' : 'var(--ok)'}">${problems}</b><small>демо, устаревшие цены, нет доставки</small></div>
      </div>
      <div class="tabs">${[['list', 'Товары проекта', list.length], ['stores', 'Магазины и где дешевле', null], ['catalog', 'Каталог и фиды', allProducts(p).length]].map(([k, n, c]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${n}${c != null ? ` <span class="count">${c}</span>` : ''}</button>`).join('')}</div>
      ${tab === 'list' ? listHtml(p, list) : tab === 'stores' ? storesHtml(p, active) : catalogHtml(p)}
    </div>`;
  }

  function listHtml(p, list) {
    if (!selectedDesign()) return `<div class="empty">${icon('cart', 30)}<p>Выберите вариант дизайна, чтобы собрать список</p></div>`;
    const keyOf = i => group === 'room' ? (i.room?.name || 'Вся квартира') : group === 'category' ? i.product?.category || '—' : (i.offer?.storeName || 'Нет предложения');
    const groups = {};
    for (const i of list) (groups[keyOf(i)] ||= []).push(i);
    return `<div class="row between wrap" style="margin-bottom:12px"><div class="seg">${[['room', 'По комнатам'], ['category', 'По категориям'], ['store', 'По магазинам']].map(([k, n]) => `<button class="${group === k ? 'on' : ''}" data-group="${k}">${n}</button>`).join('')}</div>
      <button class="btn sm" data-act="check-links">${icon('link', 14)} Проверить ссылки</button></div>
      <div class="table-wrap"><table class="t cards"><thead><tr><th>Товар</th><th>Размеры, мм</th><th class="n">Кол-во</th><th class="n">Цена</th><th class="n">Сумма</th><th>Магазин · дата цены</th><th></th></tr></thead><tbody>
      ${Object.entries(groups).map(([g, arr]) => `<tr class="group"><td colspan="4">${esc(g)}</td><td class="n">${money(arr.filter(i => !i.excluded).reduce((s, i) => s + i.sum, 0))}</td><td colspan="2"></td></tr>
        ${arr.map(i => rowHtml(i)).join('')}`).join('')}
      </tbody></table></div>
      <p class="tiny muted" style="margin-top:10px">Цены и магазины в стартовом каталоге — демонстрационные (метка «демо»). Подключите фиды магазинов во вкладке «Каталог и фиды». Партнёрские комиссии не влияют на подбор.</p>`;
  }
  function rowHtml(i) {
    const pr = i.product;
    if (!pr) return `<tr><td colspan="7" class="muted">Товар ${esc(i.productId)} не найден в каталоге</td></tr>`;
    const o = i.offer;
    const dims = pr.dims && pr.dims.w ? `${pr.dims.w}×${pr.dims.d}${pr.dims.h ? '×' + pr.dims.h : ''}` : '—';
    return `<tr class="${i.excluded ? 'removed' : ''}"><td><div class="prod-row">${thumb(pr, 44)}<div><div class="name">${esc(pr.name)}</div><div class="sub">${esc(pr.brand)} · арт. ${esc(pr.sku)}${i.note ? ' · ' + esc(i.note) : ''}</div>
      <div class="row wrap" style="gap:4px;margin-top:3px">${pr.demo ? '<span class="badge demo">демо</span>' : ''}${i.issues.map(x => `<span class="badge warn">${esc(x)}</span>`).join('')}</div></div></div></td>
      <td class="mono small" data-label="Размеры, мм">${dims}</td>
      <td class="n" data-label="Количество"><input class="input sm num" style="width:72px" type="number" min="0" step="${i.unit === 'м²' ? '0.01' : '1'}" value="${i.qty}" data-qty="${esc(i.key)}"> <span class="tiny muted">${i.unit}</span></td>
      <td class="n" data-label="Цена">${money(i.price)}</td><td class="n" data-label="Сумма"><b>${money(i.sum)}</b></td>
      <td class="small" data-label="Магазин">${o ? (o.demo
        ? `<b>${esc(o.storeName)}</b> <span class="badge demo" title="Демо-магазин: цена условная, страницы товара нет">демо</span><div><a href="${esc(o.url)}" target="_blank" rel="noopener" title="У демо-товара нет страницы в магазине — открывается поиск похожего на Яндекс Маркете">найти похожий на Маркете ${icon('link', 11)}</a></div>`
        : `<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.storeName)} ${icon('link', 11)}</a>`) + `<div class="tiny muted">${dateRu(o.updated)} · доставка ${o.deliveryDays ?? '?'} дн.</div>` : '<span class="muted">нет актуального предложения</span>'}</td>
      <td class="n acts" style="white-space:nowrap"><button class="btn sm" data-analogs="${esc(i.key)}">Аналоги</button><button class="icon-btn" data-exclude="${esc(i.key)}" title="${i.excluded ? 'Вернуть' : 'Исключить'}">${icon(i.excluded ? 'plus' : 'minus', 15)}</button><button class="icon-btn" data-report="${esc(pr.id)}" title="Сообщить об ошибке">${icon('flag', 15)}</button></td></tr>`;
  }

  function storesHtml(p, active) {
    const stores = {};
    let split = 0, missing = 0;
    for (const i of active) {
      const offers = i.product ? allOffers(i.product, p.city).filter(o => o.delivers && o.fresh && o.inStock !== false) : [];
      if (!offers.length) { missing++; continue; }
      split += Math.min(...offers.map(o => o.price)) * i.qty;
      for (const o of offers) { const s = stores[o.store] ||= { name: o.storeName, sum: 0, count: 0, items: [] }; s.sum += o.price * i.qty; s.count++; s.items.push(i.key); }
    }
    const full = Object.values(stores).filter(s => s.count === active.length - missing).sort((a, b) => a.sum - b.sum);
    const best = full[0];
    const sources = retail ? [...(retail.cities?.[p.city] || []), ...(retail.global || [])] : [];
    return `<div class="grid2" style="align-items:start;gap:16px"><div class="stack">
      <div class="card"><h3>Где дешевле купить комплект</h3><p class="muted small" style="margin:4px 0 12px">Сравнение по актуальным ценам с доставкой в ${esc(p.city)}</p>
        <div class="store-cards">
          <div class="store-card best"><b>Разделить по магазинам</b><div class="price mono" style="font-size:20px;font-weight:650;margin-top:6px">${money(split)}</div><div class="small muted">каждая позиция — в самом дешёвом магазине · ${Object.keys(stores).length} доставки</div></div>
          ${best ? `<div class="store-card"><b>Всё в одном: ${esc(best.name)}</b><div class="mono" style="font-size:20px;font-weight:650;margin-top:6px">${money(best.sum)}</div><div class="small muted">переплата ${money(best.sum - split)}, но одна доставка</div></div>` : '<div class="store-card"><b>Ни один магазин не продаёт весь комплект</b></div>'}
        </div>${missing ? `<div class="notice warn" style="margin-top:12px">${icon('alert')}<span>${missing} позиций без актуального предложения с доставкой — замените аналогами.</span></div>` : ''}</div>
      <div class="card"><h3 style="margin-bottom:10px">Итог по магазинам</h3><div class="table-wrap"><table class="t"><tr><th>Магазин</th><th class="n">Позиций</th><th class="n">Если брать там</th></tr>${Object.values(stores).sort((a, b) => a.sum - b.sum).map(s => `<tr><td>${esc(s.name)} <span class="badge demo">демо</span></td><td class="n">${s.count} из ${active.length}</td><td class="n">${money(s.sum)}</td></tr>`).join('')}</table></div></div>
    </div>
    <div class="card"><h3>Магазины в городе ${esc(p.city)}</h3><p class="muted small" style="margin:4px 0 12px">Витрины и статус интеграции. Позиции без фида импортируются файлом каталога.</p>
      <div class="stack tight">${sources.map(s => `<div class="list-btn" style="cursor:default;align-items:flex-start"><span style="flex:1"><b>${esc(s.name)}</b> <span class="badge">${esc(s.kind || '')}</span><small>${esc(s.integration || '')}</small></span><a class="btn sm" href="${esc(s.catalogUrl)}" target="_blank" rel="noopener">${icon('link', 13)}</a></div>`).join('') || '<p class="small muted">Для города нет проверенных местных источников — используйте федеральные сети или импорт фида.</p>'}</div></div></div>`;
  }

  function feedsHtml(p) {
    const admin = S.user?.admin;
    const real = serverCatalogSize();
    const head = `<div class="card" style="margin-bottom:16px"><div class="card-head"><div><h3>Фиды магазинов</h3><p>Выгрузки YML/XML, CSV или JSON. Сервер забирает их сам раз в ${catalogMeta.refreshHours || 24} ч, цены и наличие обновляются при каждом открытии сметы. Один товар из разных магазинов объединяется в одну карточку.</p></div>
      <span class="badge ${real ? 'ok' : ''}">${real} товаров из фидов</span></div>`;
    if (!S.server.online) return head + `<div class="notice warn">${icon('alert')}<span>Сервер недоступен — фиды подключаются на сервере. Пока можно импортировать файл фида в этот проект кнопкой ниже.</span></div></div>`;
    if (!admin) return head + `<div class="stack tight">${catalogMeta.sources.map(s => `<div class="list-btn" style="cursor:default"><span style="flex:1"><b>${esc(s.name)}</b><small>${s.count} товаров · обновлён ${s.lastOk ? dateTimeRu(s.lastOk) : '—'}</small></span><span class="badge ${s.status === 'ok' ? 'ok' : s.status === 'error' ? 'err' : ''}">${s.status === 'ok' ? 'работает' : s.status === 'error' ? 'ошибка' : 'загрузка'}</span></div>`).join('') || '<p class="small muted">Фиды пока не подключены. Их добавляет администратор каталога.</p>'}</div></div>`;
    const list = feedSources || [];
    return head + `<div class="stack tight" style="margin-bottom:14px">${list.map(s => `<div class="list-btn" style="cursor:default;align-items:flex-start">
        <span style="flex:1;min-width:0"><b>${esc(s.name)}</b> <span class="badge ${s.status === 'ok' ? 'ok' : s.status === 'error' ? 'err' : 'info'}">${{ ok: 'работает', error: 'ошибка', running: 'загружается…', new: 'в очереди' }[s.status] || s.status}</span>${s.enabled === false ? ' <span class="badge">выключен</span>' : ''}
          <small>${s.type === 'file' ? 'файл' : esc(s.url)}</small>
          <small>${s.count || 0} товаров${s.withDims != null ? `, с размерами ${s.withDims}` : ''}${s.skipped ? `, пропущено ${s.skipped} без цены/ссылки` : ''} · ${s.lastOk ? 'обновлён ' + dateTimeRu(s.lastOk) : 'ещё не загружался'} · города: ${s.cities === '*' ? 'все' : esc((s.cities || []).join(', '))}${s.deliveryDays != null ? ` · доставка ${s.deliveryDays} дн.` : ''}</small>
          ${s.error ? `<small style="color:var(--err)">${esc(s.error)}</small>` : ''}</span>
        <button class="icon-btn" data-feed-refresh="${s.id}" title="Обновить сейчас">${icon('refresh', 16)}</button>
        <button class="icon-btn" data-feed-toggle="${s.id}" title="${s.enabled === false ? 'Включить' : 'Выключить'}">${icon(s.enabled === false ? 'plus' : 'minus', 16)}</button>
        <button class="icon-btn" data-feed-del="${s.id}" title="Удалить">${icon('trash', 16)}</button></div>`).join('') || '<p class="small muted">Фиды ещё не подключены.</p>'}</div>
      <div class="row wrap"><button class="btn primary sm" data-act="feed-add">${icon('plus', 14)} Подключить фид по ссылке</button><label class="btn sm">${icon('upload', 14)} Загрузить выгрузку файлом<input type="file" accept=".xml,.yml,.csv,.json,.txt,.gz" hidden data-feed-server></label></div></div>`;
  }

  function catalogHtml(p) {
    const q = query.toLowerCase();
    const list = allProducts(p).filter(x => (cat === 'Все' || x.category === cat) && (!q || `${x.name} ${x.brand} ${x.sku}`.toLowerCase().includes(q))).slice(0, 120);
    return feedsHtml(p) + `${serverCatalogSize() ? `<label class="check" style="margin-bottom:12px"><input type="checkbox" data-use-demo ${p.useDemoCatalog !== false ? 'checked' : ''}> Использовать демо-каталог в этом проекте (выключите, чтобы подбор брал только реальные товары из фидов)</label>` : ''}
      <div class="row wrap" style="margin-bottom:14px"><input class="input" style="max-width:280px" placeholder="Поиск по названию, бренду, артикулу" value="${esc(query)}" data-q>
      <select class="select" style="max-width:240px" data-cat><option>Все</option>${CATEGORIES.map(c => `<option ${c === cat ? 'selected' : ''}>${c}</option>`).join('')}</select><span class="spacer"></span>
      <label class="btn">${icon('upload', 15)} Импорт фида (YML/XML, CSV, JSON)<input type="file" accept=".xml,.yml,.csv,.json,.txt" hidden data-feed></label></div>
      ${p.catalogExtra.length ? `<div class="notice accent" style="margin-bottom:12px">${icon('info')}<span>Импортировано позиций: ${p.catalogExtra.length}. Повторный импорт с тем же URL обновляет цену и дату. <button class="btn sm ghost" data-act="clear-import">Удалить импорт</button></span></div>` : ''}
      <div class="catalog-grid">${list.map(x => { const o = bestOffer(x, p.city); const iss = validateProduct(p, x, p.city); return `<div class="prod-card">${thumb(x, 200)}<div class="row wrap" style="gap:4px">${x.demo ? '<span class="badge demo">демо</span>' : `<span class="badge ok">${esc(x.source || 'фид')}</span>`}${iss.slice(0, 2).map(t => `<span class="badge warn">${esc(t)}</span>`).join('')}</div><div class="name small" style="font-weight:600">${esc(x.name)}</div><div class="tiny muted">${esc(x.category)} · ${x.dims?.w ? `${x.dims.w}×${x.dims.d}×${x.dims.h} мм` : 'нет размеров'}</div><div class="row between"><span class="price">${o ? money(o.price) : '—'}</span>${o ? `<a class="small" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.storeName)}</a>` : ''}</div></div>`; }).join('')}</div>`;
  }

  // ——— Действия ———
  async function analogsDialog(key) {
    const p = S.project; const it = items().find(i => i.key === key); if (!it?.product) return;
    const d = selectedDesign();
    const list = analogs(p, it.product, { city: p.city, styleId: d?.styleId, limit: 12 });
    const r = await modal({ title: `Аналоги: ${it.product.name}`, wide: true, content: list.length ? `<div class="table-wrap"><table class="t"><tr><th>Товар</th><th>Размеры</th><th class="n">Цена</th><th class="n">Разница</th><th></th></tr>${list.map(a => `<tr><td><div class="prod-row">${thumb(a.product, 40)}<div><div class="name">${esc(a.product.name)}</div><div class="sub">${a.style === 2 ? 'в стиле' : a.style === 1 ? 'универсальный' : 'другой стиль'}</div></div></div></td><td class="mono small">${a.product.dims.w}×${a.product.dims.d}×${a.product.dims.h}</td><td class="n">${a.offer ? money(a.offer.price) : '—'}</td><td class="n ${a.priceDiff > 0 ? 'diff-up' : 'diff-down'}">${a.priceDiff != null ? (a.priceDiff > 0 ? '+' : '') + money(a.priceDiff) : ''}</td><td class="n"><button type="button" class="btn sm" data-pick="${a.product.id}" ${a.offer ? '' : 'disabled'}>Заменить</button></td></tr>`).join('')}</table></div>` : '<p class="muted">Аналогов того же типа и размера в каталоге нет.</p>', buttons: [{ label: 'Закрыть' }],
      onMount: (w, close) => w.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) close({ value: b.dataset.pick }); }) });
    if (r.value) replaceItem(it, r.value);
  }

  function replaceItem(it, newId) {
    const p = S.project;
    const before = items().filter(i => !i.excluded).reduce((s, i) => s + i.sum, 0);
    const oldName = it.product.name, newName = productById(p, newId)?.name;
    let rejected = 0;
    commit(pp => {
      const d = pp.designs.find(x => x.id === pp.selectedDesign);
      const prod = productById(pp, newId);
      if (it.source === 'placement') for (const id of it.placementIds) if (!replacePlacement(pp, d, id, newId)) rejected++;
      if (it.source === 'finish') {
        const part = it.key.split(':').pop();
        if (part === 'doors') d.doorProduct = newId; else if (part === 'sockets') d.socketProduct = newId;
        else if (it.roomId) d.finishes[it.roomId][part] = newId;
      }
      if (it.source === 'tile') { const specId = it.key.split(':').pop(); const t = pp.tiles.find(x => x.id === specId); if (t) { t.productId = newId; t.origin = 'user'; } }
      const after = shoppingList(pp, d).filter(i => !i.excluded).reduce((s, i) => s + i.sum, 0);
      pp.estimate.history.unshift({ at: new Date().toISOString(), text: `Замена: ${oldName} → ${newName}`, before, after, delta: after - before });
    });
    toast(rejected ? `Замена частично невозможна: ${rejected} шт. не помещаются без нарушений` : 'Позиция заменена, смета пересчитана', rejected ? 'err' : '');
  }

  async function exportXlsxFile() {
    const p = S.project, list = items().filter(i => !i.excluded);
    const rows = [['Комната', 'Категория', 'Товар', 'Бренд', 'Артикул', 'Размеры, мм', 'Кол-во', 'Ед.', 'Цена, ₽', 'Сумма, ₽', 'Магазин', 'Дата цены', 'Ссылка']];
    list.forEach(i => rows.push([i.room?.name || 'Вся квартира', i.product?.category || '', i.product?.name || i.productId, i.product?.brand || '', i.product?.sku || '', i.product?.dims?.w ? `${i.product.dims.w}×${i.product.dims.d}×${i.product.dims.h}` : '', i.qty, i.unit, i.price, null, i.offer?.storeName || '', i.offer?.updated || '', i.offer?.url || '']));
    const formulas = {};
    for (let r = 2; r <= list.length + 1; r++) formulas[`J${r}`] = `G${r}*I${r}`;
    rows.push(['', '', 'Итого', '', '', '', '', '', '', null]);
    formulas[`J${list.length + 2}`] = `SUM(J2:J${list.length + 1})`;
    try { await exportXlsx(`${p.name} — список покупок.xlsx`, [{ name: 'Список покупок', rows, formulas, cols: [16, 18, 44, 14, 14, 16, 8, 6, 12, 12, 16, 12, 40] }]); }
    catch (e) { toast(e.message + ' — выгружаю CSV', 'err'); download(`${p.name} — список покупок.csv`, toCSV(rows.map(r => r.map(v => v ?? ''))), 'text/csv'); }
  }
  function exportPdf() {
    const p = S.project, list = items().filter(i => !i.excluded);
    const rooms = {};
    for (const i of list) (rooms[i.room?.name || 'Вся квартира'] ||= []).push(i);
    printDocument(`${p.name} — список покупок`, `<h1>Список покупок</h1><div class="muted">${esc(p.name)} · ${esc(p.city)} · ${new Date().toLocaleDateString('ru-RU')}</div>
      ${Object.entries(rooms).map(([r, arr]) => `<h2>${esc(r)}</h2><table><tr><th>Товар</th><th>Размеры</th><th class="n">Кол-во</th><th class="n">Цена</th><th class="n">Сумма</th><th>Магазин</th></tr>${arr.map(i => `<tr><td>${esc(i.product?.name)}<div class="muted">${esc(i.product?.brand)} · ${esc(i.product?.sku)}</div></td><td>${i.product?.dims?.w ? `${i.product.dims.w}×${i.product.dims.d}×${i.product.dims.h}` : ''}</td><td class="n">${i.qty} ${i.unit}</td><td class="n">${money(i.price)}</td><td class="n">${money(i.sum)}</td><td>${esc(i.offer?.storeName || '—')}<div class="muted">${i.offer ? esc(i.offer.url) : ''}</div></td></tr>`).join('')}</table>`).join('')}
      <p class="total">Итого: ${money(list.reduce((s, i) => s + i.sum, 0))}</p><p class="muted">Цены демонстрационного каталога не являются офертой магазинов.</p>`);
  }

  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]'); if (t) { tab = t.dataset.tab; if (tab === 'catalog') loadSources(); return render(); }
    const fr = e.target.closest('[data-feed-refresh]'); if (fr) { toast('Загружаю фид…'); await api(`/api/catalog/sources/${fr.dataset.feedRefresh}/refresh`, { method: 'POST', timeout: 180000 }).catch(err => toast(err.message, 'err')); await loadSources(); await loadServerCatalog(); return; }
    const ft = e.target.closest('[data-feed-toggle]'); if (ft) { const s = feedSources.find(x => x.id === ft.dataset.feedToggle); await api(`/api/catalog/sources/${s.id}`, { method: 'PATCH', body: { enabled: s.enabled === false } }); await loadSources(); await loadServerCatalog(); return; }
    const fd = e.target.closest('[data-feed-del]'); if (fd) { if (await confirmDialog('Удалить фид?', 'Товары этого магазина пропадут из общего каталога. В проектах, где они выбраны, позиции останутся без актуальной цены.', 'Удалить', true)) { await api(`/api/catalog/sources/${fd.dataset.feedDel}`, { method: 'DELETE' }); await loadSources(); await loadServerCatalog(); } return; }
    const g = e.target.closest('[data-group]'); if (g) { group = g.dataset.group; return render(); }
    const an = e.target.closest('[data-analogs]'); if (an) return analogsDialog(an.dataset.analogs);
    const ex = e.target.closest('[data-exclude]'); if (ex) return commit(p => { const k = ex.dataset.exclude; p.shopping.excluded = p.shopping.excluded.includes(k) ? p.shopping.excluded.filter(x => x !== k) : [...p.shopping.excluded, k]; });
    const rp = e.target.closest('[data-report]'); if (rp) return reportError(rp.dataset.report);
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'complete') completeStep('shopping');
    if (a === 'xlsx') exportXlsxFile();
    if (a === 'pdf') exportPdf();
    if (a === 'share') shareLink();
    if (a === 'check-links') checkLinks();
    if (a === 'clear-import') commit(p => { p.catalogExtra = []; });
    if (a === 'feed-add') addFeedDialog();
  });
  el.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.qty) commit(p => { p.shopping.qty[t.dataset.qty] = Math.max(0, Number(t.value) || 0); });
    if (t.matches('[data-cat]')) { cat = t.value; render(); }
    if (t.matches('[data-use-demo]')) commit(p => { p.useDemoCatalog = t.checked; });
    if (t.dataset.feedServer !== undefined && t.files[0]) {
      const f = t.files[0];
      if (f.size > 35 * 1024 * 1024) return toast('Файл больше 35 МБ — подключите фид по ссылке', 'err');
      const r = await modal({ title: 'Загрузить выгрузку магазина', content: feedFormHtml({ name: f.name.replace(/\.\w+$/, '') }, false), buttons: [{ label: 'Отмена' }, { label: 'Загрузить', value: 'ok', primary: true }] });
      if (!r.value) return;
      try { await api('/api/catalog/sources', { method: 'POST', timeout: 120000, body: { ...feedFormData(r.data), contentBase64: await fileToBase64(f) } }); toast('Файл загружен, товары разбираются'); setTimeout(async () => { await loadSources(); await loadServerCatalog(); }, 1500); }
      catch (err) { toast(err.message, 'err'); }
    }
    if (t.dataset.feed !== undefined && t.files[0]) {
      try {
        const rows = parseFeed(decodeFeedBytes(await t.files[0].arrayBuffer()), t.files[0].name.replace(/\.\w+$/, ''));
        if (!rows.length) return toast('В файле не найдено товаров с названием, ценой и ссылкой', 'err');
        commit(p => { for (const r of rows) { const i = p.catalogExtra.findIndex(x => x.offers?.[0]?.url === r.offers[0].url); if (i >= 0) p.catalogExtra[i] = r; else p.catalogExtra.push(r); } });
        toast(`Импортировано ${rows.length} позиций. Позиции без размеров не попадут в расстановку.`);
      } catch (err) { toast('Не удалось разобрать файл: ' + err.message, 'err'); }
    }
  });
  el.addEventListener('input', e => { if (e.target.matches('[data-q]')) { query = e.target.value; clearTimeout(el._qt); el._qt = setTimeout(() => { const pos = e.target.selectionStart; render(); const inp = el.querySelector('[data-q]'); inp.focus(); inp.setSelectionRange(pos, pos); }, 250); } });

  async function reportError(productId) {
    const p = S.project; const pr = productById(p, productId);
    const r = await modal({ title: 'Сообщить об ошибке в товаре', content: `<p class="small"><b>${esc(pr?.name)}</b></p><label class="field"><span>Что не так</span><select class="select" name="kind"><option>Неверная цена</option><option>Нет в наличии / снят с продажи</option><option>Неверные размеры</option><option>Ссылка не работает</option><option>Другое</option></select></label><label class="field"><span>Комментарий</span><textarea class="input" name="comment" rows="3"></textarea></label>`, buttons: [{ label: 'Отмена' }, { label: 'Отправить на модерацию', value: 'ok', primary: true }] });
    if (!r.value) return;
    const report = { productId, ...r.data, city: p.city, at: new Date().toISOString() };
    try { if (S.server.online) await api('/api/reports', { method: 'POST', body: report }); } catch {}
    commit(pp => { pp.catalogFlags[productId] = { ...(pp.catalogFlags[productId] || {}), reported: true, discontinued: r.data.kind.startsWith('Нет в наличии') || pp.catalogFlags[productId]?.discontinued, link: r.data.kind.startsWith('Ссылка') ? 'dead' : pp.catalogFlags[productId]?.link }; });
    toast(S.server.online ? 'Запись отправлена модератору каталога' : 'Отметка сохранена в проекте (сервер недоступен)');
  }

  async function checkLinks() {
    if (!S.server.online) return toast('Проверка ссылок выполняется сервером — сейчас он недоступен');
    const list = items(); const urls = [...new Set(list.map(i => i.offer?.url).filter(Boolean))];
    toast('Проверяю ссылки…');
    try {
      const res = await api('/api/catalog/check-links', { method: 'POST', body: { urls }, timeout: 60000 });
      const dead = new Set(res.results.filter(r => !r.ok).map(r => r.url));
      commit(p => { for (const i of list) if (i.offer && i.product) p.catalogFlags[i.product.id] = { ...(p.catalogFlags[i.product.id] || {}), link: dead.has(i.offer.url) ? 'dead' : 'ok', checkedAt: new Date().toISOString() }; });
      toast(dead.size ? `Недоступно ссылок: ${dead.size} — предложите замену аналогом` : 'Все ссылки отвечают');
    } catch (e) { toast(e.message, 'err'); }
  }

  // Файл передаём байтами: кодировку (часто windows-1251) определяет сервер по заголовку XML
  async function fileToBase64(f) { const bytes = new Uint8Array(await f.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

  async function loadSources() {
    if (!S.user?.admin || !S.server.online) return;
    try { feedSources = (await api('/api/catalog/sources')).sources; } catch { feedSources = []; }
    render();
  }

  function feedFormHtml(v = {}, withUrl = true) {
    return `<label class="field"><span>Магазин</span><input class="input" name="name" value="${esc(v.name || '')}" required placeholder="Например: Строй-С Самара"></label>
      ${withUrl ? `<label class="field"><span>Ссылка на фид</span><input class="input" name="url" required placeholder="https://shop.ru/export/yandex.xml"><small>YML/XML, CSV, JSON или .gz. Ссылку даёт магазин или партнёрская программа; сервер будет забирать её раз в сутки.</small></label>` : ''}
      <div class="grid2"><label class="field"><span>Формат</span><select class="select" name="format"><option value="auto">Определить автоматически</option><option value="yml">YML / XML</option><option value="csv">CSV</option><option value="json">JSON</option></select></label>
      <label class="field"><span>Доставка, дней</span><input class="input num" type="number" min="0" name="deliveryDays" placeholder="—"></label></div>
      <label class="field"><span>Города доставки</span><input class="input" name="cities" placeholder="Пусто — все города; или через запятую: Самара, Тольятти"></label>
      ${withUrl ? `<label class="field"><span>Заголовок авторизации (если нужен)</span><input class="input" name="authHeader" placeholder="Bearer …"><small>Хранится только на сервере и не показывается в браузере.</small></label>` : ''}`;
  }
  const feedFormData = d => ({ name: d.name, url: d.url, format: d.format, deliveryDays: d.deliveryDays === '' ? null : Number(d.deliveryDays), cities: d.cities ? d.cities.split(',').map(x => x.trim()).filter(Boolean) : [], authHeader: d.authHeader || '' });

  async function addFeedDialog() {
    const r = await modal({ title: 'Подключить фид магазина', content: feedFormHtml(), buttons: [{ label: 'Отмена' }, { label: 'Подключить', value: 'ok', primary: true }] });
    if (!r.value) return;
    try { await api('/api/catalog/sources', { method: 'POST', body: feedFormData(r.data) }); toast('Фид добавлен, первая загрузка идёт в фоне'); setTimeout(async () => { await loadSources(); await loadServerCatalog(); }, 3000); await loadSources(); }
    catch (err) { toast(err.message, 'err'); }
  }

  if (tab === 'catalog') loadSources();
  render();
  return { update: what => { if (what === 'canvas') return; render(); } };
}

export async function shareLink() {
  if (!S.server.online) return toast('Ссылки для чтения создаёт сервер — сейчас он недоступен');
  if (!(await requireFeature('share', 'Чтобы поделиться проектом по ссылке, войдите в аккаунт.'))) return;
  try {
    const r = await api('/api/share', { method: 'POST', body: { projectId: S.project.id, project: S.project } });
    const url = `${location.origin}/#/share/${r.token}`;
    await modal({ title: 'Ссылка только для чтения', content: `<p class="small muted">По ссылке видны план, список покупок и смета. Редактировать нельзя. Снимок обновляется при повторном создании ссылки.</p><input class="input" value="${esc(url)}" readonly onfocus="this.select()">`, buttons: [{ label: 'Закрыть' }, { label: 'Копировать', value: 'copy', primary: true }] })
      .then(x => { if (x.value === 'copy') navigator.clipboard?.writeText(url).then(() => toast('Ссылка скопирована')); });
  } catch (e) { toast(e.message, 'err'); }
}
