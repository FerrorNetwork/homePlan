// Шаг 4. Дизайн: генерация 2–3 вариантов, сравнение, ручная правка с «похожими», чат с ИИ, плитка, рендеры.
import { S, commit, emit } from '../store.js';
import { completeStep, requireFeature } from '../main.js';
import { esc, icon, toast, num, money, modal, thumb, dateRu, confirmDialog } from '../ui.js';
import { generateDesigns, tileSpecsForDesign, interpretChat, applyOps, replacePlacement, DECOR_KINDS, zonesOf } from '../core/designer.js';
import { validateDesign, KIND_RULES } from '../core/rules.js';
import { productById, analogs, allProducts, bestOffer, isUsable } from '../core/catalog.js';
import { shoppingList, buildEstimate } from '../core/estimate.js';
import { styleById, STYLES } from '../data/styles.js';
import { roomMetrics, uid } from '../core/model.js';
import { miniPlan } from './canvas.js';
import { createEditor } from './editor.js';
import { api } from '../api.js';

let tab = 'variants';
const GEN_STEPS = ['Анализ планировки и инженерии', 'Подбор товаров из каталога', 'Расстановка по правилам эргономики', 'Отделка и раскладка плитки', 'Проверка ссылок, размеров и цен', 'Объяснение вариантов'];

export const selectedDesign = () => S.project?.designs.find(d => d.id === S.project.selectedDesign) || null;

export function selectDesign(p, id) {
  p.selectedDesign = id;
  const d = p.designs.find(x => x.id === id);
  p.tiles = p.tiles.filter(t => t.origin !== 'design');
  if (d) p.tiles.push(...tileSpecsForDesign(p, d));
}

export function mount(el, [sub]) {
  if (sub) tab = sub;
  let ed = null, tilesView = null, gen = null;
  el.innerHTML = `<div class="design-root" style="display:flex;flex-direction:column;flex:1;min-height:0"><div class="page" style="padding-bottom:0"><div class="page-head" style="margin-bottom:10px"><div><div class="eyebrow">Шаг 4 из 6</div><h1>Дизайн-проект</h1></div><div class="row" data-head-actions></div></div><div class="tabs" data-tabs style="margin-bottom:0"></div></div><div data-body style="flex:1;min-height:0;display:flex;flex-direction:column"></div></div>`;
  const body = el.querySelector('[data-body]');

  function renderTabs() {
    const p = S.project, d = selectedDesign();
    el.querySelector('[data-tabs]').innerHTML = [['variants', 'Варианты', p.designs.length], ['editor', 'Редактор и 3D', null], ['tiles', 'Плитка', p.tiles.length], ['renders', 'Рендеры', d?.renders?.length || 0]].map(([k, n, c]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}" ${k !== 'variants' && !d ? 'disabled title="Сначала выберите вариант"' : ''}>${n}${c ? ` <span class="count">${c}</span>` : ''}</button>`).join('');
    el.querySelector('[data-head-actions]').innerHTML = d ? `<button class="btn primary" data-act="complete">К списку покупок ${icon('arrowRight', 15)}</button>` : '';
  }

  async function renderBody() {
    ed?.destroy(); ed = null; tilesView?.destroy?.(); tilesView = null;
    body.innerHTML = '';
    renderTabs();
    if (tab === 'variants') { body.innerHTML = `<div class="page" style="padding-top:20px">${gen ? genHtml() : variantsHtml()}</div>`; return; }
    if (!selectedDesign()) { tab = 'variants'; return renderBody(); }
    if (tab === 'editor') return mountEditor();
    if (tab === 'tiles') { const { mountTiles } = await import('./tiles.js'); body.classList.add('in-tab'); tilesView = mountTiles(body); return; }
    body.classList.remove('in-tab');
    if (tab === 'renders') { body.innerHTML = `<div class="page" style="padding-top:20px">${rendersHtml()}</div>`; }
  }

  // ——— Варианты ———
  function variantsHtml() {
    const p = S.project;
    const style = styleById(p.brief.style);
    if (!p.designs.length) return `<div class="card" style="text-align:center;padding:48px 24px">
      <div style="max-width:560px;margin:0 auto" class="stack">${icon('sparkles', 34)}<h2>Сгенерируйте 2–3 варианта</h2>
      <p class="muted">Стиль «${esc(style.name)}», бюджет ${money(p.brief.budget)}, комнат: ${p.rooms.filter(r => p.brief.rooms[r.id]?.include !== false).length}. Подбор: ${p.brief.provider === 'local' ? 'базовый' : 'расширенный'}. Все предметы — только из каталога, с проверкой размеров, цены и ссылки.</p>
      <div><button class="btn primary lg" data-act="generate">${icon('sparkles', 16)} Сгенерировать варианты</button></div></div></div>`;
    const ests = p.designs.map(d => ({ d, issues: validateDesign(p, d), est: quickTotals(p, d) }));
    return `<div class="row between wrap" style="margin-bottom:14px"><p class="muted">Сравните варианты и выберите один для доработки. Можно сгенерировать заново — текущие варианты будут заменены.</p><div class="row wrap"><button class="btn" data-act="compare">${icon('grid', 15)} Сравнить рядом</button><button class="btn" data-act="generate">${icon('refresh', 15)} Сгенерировать заново</button></div></div>
      <div class="variants">${ests.map(({ d, issues, est }) => `<div class="variant ${p.selectedDesign === d.id ? 'on' : ''}">
        <div class="mini">${miniPlan(p, d)}</div>
        <div class="body"><div class="row between"><h3>${esc(d.name)}</h3>${d.source !== 'local' ? '<span class="badge info">расширенный подбор</span>' : ''}</div>
          <div class="row between"><span class="price">${money(est.goods)}</span><span class="small muted">мебель, свет, отделка</span></div>
          <div class="row wrap" style="gap:6px"><span class="badge">${d.placements.length} предметов</span><span class="badge ${issues.length ? 'warn' : 'ok'}">${issues.length ? issues.length + ' замечаний' : 'без нарушений'}</span>${d.empty.length ? `<span class="badge warn">${d.empty.length} пустых зон</span>` : ''}${d.overBudget ? '<span class="badge err">выше бюджета</span>' : ''}</div>
          <ul class="small" style="margin:0;padding-left:18px;color:var(--ink-2)">${d.explanation.slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="row" style="margin-top:auto">${p.selectedDesign === d.id ? `<button class="btn primary" data-open="${d.id}" style="flex:1">${icon('arrowRight', 15)} Открыть в редакторе</button>` : `<button class="btn" data-select="${d.id}" style="flex:1">Выбрать вариант</button>`}<button class="icon-btn" data-explain="${d.id}" title="Обоснование">${icon('info')}</button></div>
        </div></div>`).join('')}</div>`;
  }
  function quickTotals(p, d) { const list = shoppingList(p, d).filter(i => !i.excluded); return { goods: list.reduce((s, i) => s + i.sum, 0) }; }

  function genHtml() {
    return `<div class="gen-progress card"><h2>Генерация вариантов</h2><p class="muted">${esc(gen.note || '')}</p>
      <div class="progress"><i style="width:${(gen.step / GEN_STEPS.length) * 100}%"></i></div>
      <div class="gen-steps">${GEN_STEPS.map((s, i) => `<div class="${i < gen.step ? 'done' : i === gen.step ? 'now' : ''}">${icon(i < gen.step ? 'check' : i === gen.step ? 'refresh' : 'minus', 14)} ${s}</div>`).join('')}</div>
      <div class="tiny muted">Прошло ${Math.round((Date.now() - gen.t0) / 1000)} с · цель — до 2 минут на квартиру</div></div>`;
  }

  async function generate() {
    if (!(await requireFeature('ai', 'Подбор дизайна доступен после регистрации. Гость может строить планировку.'))) return;
    const p = S.project;
    if (p.designs.length && !(await confirmDialog('Сгенерировать заново?', 'Текущие варианты и их ручные правки будут заменены. Сохраните версию проекта, если они нужны.', 'Сгенерировать'))) return;
    gen = { step: 0, t0: Date.now(), note: '' }; renderBody();
    const tick = setInterval(() => { if (tab === 'variants' && gen) renderBody(); }, 1000);
    const stepTo = async n => { gen.step = n; renderBody(); await new Promise(r => setTimeout(r, 260)); };
    try {
      await stepTo(0);
      let aiChoices = null, source = 'local';
      const prov = p.brief.provider;
      if (prov !== 'local' && S.server.online && S.server.providers?.[prov]) {
        await stepTo(1); gen.note = 'Расширенный подбор на сервере…'; renderBody();
        try {
          const catalog = allProducts(p).filter(x => isUsable(p, x, p.city) && x.dims).map(x => ({ id: x.id, name: x.name, category: x.category, kind: x.kind, dims: x.dims, price: bestOffer(x, p.city)?.price, styles: x.styles, color: x.color, material: x.material }));
          const res = await api(`/api/design/${prov}`, { method: 'POST', timeout: 125000, body: {
            plan: p.rooms.filter(r => p.brief.rooms[r.id]?.include !== false).map(r => ({ id: r.id, name: r.name, type: r.type, area: +roomMetrics(p, r).area.toFixed(1), priority: p.brief.rooms[r.id]?.priority || 2 })),
            brief: { style: styleById(p.brief.style).name, prompt: p.brief.prompt, budget: p.brief.budget, occupants: p.brief.occupants, children: p.brief.children, pets: p.brief.pets, mustHave: p.brief.mustHave, avoid: p.brief.avoid, decor: p.brief.decor, analysis: p.brief.analysis?.confirmed ? p.brief.analysis : null },
            city: p.city, catalog, references: p.brief.consent ? p.brief.references.map(r => r.id).filter(Boolean) : [] } });
          aiChoices = res.variants; source = 'расширенный подбор';
          if (res.rejected) gen.note = `Отброшено ${res.rejected} позиций вне каталога`;
        } catch (e) { toast('Расширенный подбор недоступен: ' + e.message + '. Использую базовый.'); }
      }
      await stepTo(1); await stepTo(2);
      const designs = generateDesigns(p, { count: 3, aiChoices, source });
      await stepTo(3); await stepTo(4); await stepTo(5);
      commit(pp => { pp.designs = designs; selectDesign(pp, designs[0].id); });
      toast(`Готово за ${Math.round((Date.now() - gen.t0) / 1000)} с: ${designs.length} варианта`);
    } catch (e) { console.error(e); toast('Ошибка генерации: ' + e.message, 'err'); }
    finally { clearInterval(tick); gen = null; renderBody(); }
  }

  async function compareDialog() {
    const p = S.project; const ds = p.designs;
    const rows = ds.map(d => ({ d, est: buildEstimate(p, d), issues: validateDesign(p, d) }));
    const cell = f => rows.map(r => `<td class="n">${f(r)}</td>`).join('');
    await modal({ title: 'Сравнение вариантов', wide: true, content: `<div class="table-wrap"><table class="t"><tr><th></th>${rows.map(r => `<th class="n">${esc(r.d.name)}</th>`).join('')}</tr>
      <tr><td>План</td>${rows.map(r => `<td style="width:220px;height:140px;padding:4px">${miniPlan(p, r.d)}</td>`).join('')}</tr>
      <tr><td>Мебель и техника</td>${cell(r => money(r.est.totals.furniture))}</tr><tr><td>Материалы</td>${cell(r => money(r.est.totals.materials))}</tr><tr><td>Работы</td>${cell(r => money(r.est.totals.works))}</tr>
      <tr class="group"><td>Смета, всего</td>${cell(r => money(r.est.totals.total))}</tr>
      <tr><td>Предметов</td>${cell(r => r.d.placements.length)}</tr><tr><td>Замечаний эргономики</td>${cell(r => r.issues.length)}</tr><tr><td>Пустых зон</td>${cell(r => r.d.empty.length)}</tr>
      ${p.rooms.map(room => `<tr><td>${esc(room.name)}</td>${rows.map(r => `<td class="small">${r.d.placements.filter(x => x.roomId === room.id && !KIND_RULES[x.kind]?.ceiling).map(x => esc(productById(p, x.productId)?.name || '')).slice(0, 6).join('<br>') || '—'}</td>`).join('')}</tr>`).join('')}
    </table></div>`, buttons: [{ label: 'Закрыть' }] });
  }

  // ——— Редактор ———
  function mountEditor() {
    const host = document.createElement('div'); host.className = 'in-tab'; host.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;margin-top:12px;border-top:1px solid var(--line)'; body.append(host);
    let issues = [];
    const recheck = () => { issues = validateDesign(S.project, selectedDesign()); };
    recheck();
    let chatBusy = false;
    ed = createEditor(host, {
      mode: 'design', tools: [{ id: 'select', icon: 'cursor', tip: 'Выбор, перетаскивание (R — поворот, Delete — удалить)', key: 'V' }, '|', { id: 'measure', icon: 'ruler', tip: 'Рулетка', key: 'M' }],
      getDesign: selectedDesign, getIssues: () => issues,
      selectable: t => t === 'placement',
      focusRoom: () => S.ui.designRoom,
      canvasOpts: {
        onRotate: sel => sel.type === 'placement' && rotate(sel.id, 90),
        onDelete: sel => { if (sel.type === 'placement') removePl(sel.id); return true; },
      },
      inspector: ({ selection }) => {
        const p = S.project, d = selectedDesign();
        if (selection?.type === 'placement') { const pl = d.placements.find(x => x.id === selection.id); if (pl) return placementPanel(p, d, pl, issues.filter(i => i.id === pl.id)); }
        return chatPanel(p, d, chatBusy) + issuesPanel(p, d, issues) + roomsPanel(p, d) + explainPanel(d);
      },
      bindInspector: (insp, { canvas }) => {
        insp.onclick = async e => {
          const b = e.target.closest('button, [data-focus]'); if (!b) return;
          const s = S.ui.selection, d = selectedDesign();
          if (b.dataset.focus) return canvas.select({ type: 'placement', id: b.dataset.focus });
          if (b.dataset.replace) { const before = shopTotal(); let ok = true; commit(p => { const dd = p.designs.find(x => x.id === p.selectedDesign); const old = replacePlacement(p, dd, s.id, b.dataset.replace); if (!old) { ok = false; return; } logChange(p, dd, `Замена: ${productById(p, old)?.name} → ${productById(p, b.dataset.replace)?.name}`, before); }); if (!ok) toast('Этот товар не помещается без нарушения правил — оставлен прежний', 'err'); return; }
          if (b.dataset.rot) return rotate(s.id, +b.dataset.rot);
          if (b.dataset.regen) return regenRoom(b.dataset.regen);
          if (b.dataset.renderGo) { tab = 'renders'; renderBody().then(() => makeRender(b.dataset.renderGo)); return; }
          if (b.dataset.room3d) { S.ui.designRoom = b.dataset.room3d; ed.setView('walk'); return; }
          const a = b.dataset.act;
          if (a === 'deselect') canvas.select(null);
          if (a === 'remove' && s) removePl(s.id);
          if (a === 'send') sendChat(insp);
          if (a === 'toggle-decor') toggleDecor();
          if (a === 'example') { const inp = insp.querySelector('[name=chat]'); inp.value = b.textContent; inp.focus(); }
        };
        insp.onkeydown = e => { if (e.key === 'Enter' && e.target.name === 'chat') { e.preventDefault(); sendChat(insp); } };
      },
    });
    ed.recheck = recheck;
    async function sendChat(insp) {
      const input = insp.querySelector('[name=chat]'); const text = input.value.trim(); if (!text) return;
      if (!(await requireFeature('ai', 'Помощник доступен после регистрации.'))) return;
      chatBusy = true; ed.renderInspector();
      const p = S.project, d = selectedDesign();
      let res = null;
      const prov = p.brief.provider;
      if (prov !== 'local' && S.server.online && S.server.providers?.[prov]) {
        try {
          const r = await api(`/api/chat/${prov}`, { method: 'POST', timeout: 90000, body: { message: text, design: d.placements.map(x => ({ id: x.id, productId: x.productId, kind: x.kind, room: p.rooms.find(r => r.id === x.roomId)?.name, roomId: x.roomId })), finishes: d.finishes, rooms: p.rooms.map(r => ({ id: r.id, name: r.name })), catalog: allProducts(p).filter(x => isUsable(p, x, p.city)).map(x => ({ id: x.id, name: x.name, kind: x.kind, price: x.price, color: x.color, material: x.material, styles: x.styles })) } });
          res = { ops: r.operations || [], reply: r.reply || 'Готово' };
        } catch (e) { toast('Расширенный помощник недоступен, отвечает базовый'); }
      }
      if (!res) res = interpretChat(p, d, text);
      const before = shopTotal();
      commit(pp => {
        const dd = pp.designs.find(x => x.id === pp.selectedDesign);
        const diff = applyOps(pp, dd, res.ops);
        const changed = diff.replaced.length + diff.added.length + diff.removed.length + diff.finishes.length;
        if (!changed && diff.rejected.length) res.reply = 'Не получилось применить без нарушения правил эргономики — проект не изменён.';
        const after = shoppingList(pp, dd).filter(i => !i.excluded).reduce((s, i) => s + i.sum, 0);
        const newIssues = validateDesign(pp, dd).length;
        dd.chat.push({ role: 'user', text, at: new Date().toISOString() }, { role: 'ai', text: res.reply, diff, delta: after - before, issues: newIssues, at: new Date().toISOString() });
        if (changed) logChange(pp, dd, `Чат: «${text}»`, before);
      });
      chatBusy = false; recheck(); ed.renderInspector();
      setTimeout(() => { const c = el.querySelector('.chat'); if (c) c.scrollTop = c.scrollHeight; }, 20);
    }
  }
  function shopTotal() { const p = S.project; return shoppingList(p, selectedDesign()).filter(i => !i.excluded).reduce((s, i) => s + i.sum, 0); }
  function logChange(p, d, text, before) { const after = shoppingList(p, d).filter(i => !i.excluded).reduce((s, i) => s + i.sum, 0); p.estimate.history.unshift({ at: new Date().toISOString(), text, before, after, delta: after - before }); p.estimate.history = p.estimate.history.slice(0, 50); }
  function rotate(id, deg) { commit(p => { const pl = p.designs.find(x => x.id === p.selectedDesign).placements.find(x => x.id === id); if (pl) pl.rotation = ((pl.rotation || 0) + deg + 360) % 360; }); }
  function removePl(id) { const before = shopTotal(); commit(p => { const d = p.designs.find(x => x.id === p.selectedDesign); const pl = d.placements.find(x => x.id === id); d.placements = d.placements.filter(x => x.id !== id); logChange(p, d, `Удалено: ${productById(p, pl?.productId)?.name}`, before); }); S.ui.selection = null; }
  function toggleDecor() { commit(p => { const d = p.designs.find(x => x.id === p.selectedDesign); if (d.decor !== false) { d.removedDecor = d.placements.filter(x => DECOR_KINDS.includes(x.kind)); d.placements = d.placements.filter(x => !DECOR_KINDS.includes(x.kind)); d.decor = false; } else { d.placements.push(...(d.removedDecor || [])); d.removedDecor = []; d.decor = true; } }); }
  function regenRoom(roomId) {
    // Альтернативный путь: менять мебель только в одной комнате, остальной дизайн сохраняется
    commit(p => {
      const d = p.designs.find(x => x.id === p.selectedDesign);
      const only = { ...p, brief: { ...p.brief, style: d.styleId, rooms: Object.fromEntries(p.rooms.map(r => [r.id, { include: r.id === roomId }])) } };
      const strategies = ['balanced', 'econ', 'accent'];
      const next = strategies[(strategies.indexOf(d.roomStrategy?.[roomId] || d.strategy) + 1) % 3];
      const [fresh] = generateDesigns(only, { count: 3 }).filter(x => x.strategy === next);
      d.placements = [...d.placements.filter(x => x.roomId !== roomId), ...fresh.placements.filter(x => x.roomId === roomId)];
      d.finishes[roomId] = fresh.finishes[roomId];
      d.empty = [...d.empty.filter(x => x.roomId !== roomId), ...fresh.empty.filter(x => x.roomId === roomId)];
      d.roomStrategy = { ...(d.roomStrategy || {}), [roomId]: next };
    });
    toast('Комната пересобрана, остальные не тронуты');
  }

  function placementPanel(p, d, pl, own) {
    const pr = productById(p, pl.productId); if (!pr) return '';
    const offer = bestOffer(pr, p.city);
    const room = p.rooms.find(r => r.id === pl.roomId);
    const alts = analogs(p, pr, { city: p.city, styleId: d.styleId, limit: 6 });
    return `<section><h4>${esc(KIND_RULES[pl.kind]?.label || 'Предмет')} <button class="icon-btn" data-act="deselect">${icon('close', 16)}</button></h4>
      <div class="prod-row" style="margin-bottom:10px">${thumb(pr, 64)}<div><div class="name">${esc(pr.name)}</div><div class="sub">${esc(pr.brand)} · ${pr.dims.w}×${pr.dims.d}×${pr.dims.h} мм</div><div class="sub">${esc(room?.name || '')}</div></div></div>
      ${offer ? `<div class="row between small"><span class="mono" style="font-size:15px;font-weight:650">${money(offer.price)}</span><a href="${esc(offer.url)}" target="_blank" rel="noopener" title="${offer.demo ? 'Демо-товар: открывается поиск похожего на Яндекс Маркете' : 'Страница товара в магазине'}">${esc(offer.storeName)}${offer.demo ? ' (демо) · поиск на Маркете' : ''} ${icon('link', 12)}</a></div><div class="tiny muted">Цена от ${dateRu(offer.updated)} · доставка ${offer.deliveryDays} дн.</div>` : '<div class="notice warn small">Нет актуального предложения для города</div>'}
      <div class="tiny muted" style="margin-top:6px">3D-модель ${pr.model === 'generated' ? 'сгенерирована по размерам — приблизительная' : 'от производителя'}; размеры в расстановке — из карточки.</div>
      ${own.length ? `<div class="issues" style="margin-top:10px">${own.map(i => `<div class="issue ${i.level === 'error' ? 'error' : 'warn'}">${icon('alert', 15)}<span>${esc(i.text)}</span></div>`).join('')}</div>` : `<div class="issue ok" style="margin-top:10px">${icon('check', 15)}<span>Правила эргономики соблюдены</span></div>`}
      <div class="row wrap" style="margin-top:12px"><button class="btn sm" data-rot="-90">${icon('rotate', 14)} −90°</button><button class="btn sm" data-rot="90">+90°</button><button class="btn sm danger" data-act="remove">${icon('trash', 14)} Удалить</button></div></section>
      <section><h4>Похожие из каталога <span class="muted">по размеру, стилю, цене</span></h4><div class="stack tight">${alts.length ? alts.map(a => `<div class="list-btn" style="cursor:default">${thumb(a.product, 42)}<span style="flex:1;min-width:0"><b class="small">${esc(a.product.name)}</b><small>${a.product.dims.w}×${a.product.dims.d} мм · ${a.offer ? money(a.offer.price) : 'нет предложения'} ${a.priceDiff != null ? `<span class="${a.priceDiff > 0 ? 'diff-up' : 'diff-down'}">${a.priceDiff > 0 ? '+' : ''}${num(a.priceDiff, 0)} ₽</span>` : ''}</small></span><button class="btn sm" data-replace="${a.product.id}" ${a.offer ? '' : 'disabled'}>Заменить</button></div>`).join('') : '<p class="small muted">Аналогов в каталоге нет</p>'}</div></section>`;
  }
  function chatPanel(p, d, busy) {
    return `<section><h4>Помощник ${icon('chat', 16)}</h4>
      <div class="chat">${d.chat.length ? d.chat.map(m => `<div class="msg ${m.role}">${esc(m.text)}${m.diff ? diffHtml(m) : ''}</div>`).join('') : '<p class="small muted">Напишите, что изменить. Помощник меняет только мебель и отделку — планировку и инженерию не трогает.</p>'}</div>
      <div class="row"><input class="input sm" name="chat" placeholder="замени диван на угловой" ${busy ? 'disabled' : ''}><button class="btn sm primary" data-act="send" ${busy ? 'disabled' : ''}>${busy ? '…' : icon('arrowRight', 14)}</button></div>
      <div class="row wrap" style="gap:4px;margin-top:8px">${['замени диван на угловой', 'сделай светлее', 'сделай дешевле', 'убери декор', 'добавь растение'].map(x => `<button class="chip" data-act="example">${x}</button>`).join('')}</div></section>`;
  }
  const diffHtml = m => { const D = m.diff; const parts = [...D.replaced.map(x => ['refresh', x]), ...D.added.map(x => ['plus', x]), ...D.removed.map(x => ['minus', x]), ...D.finishes.map(x => ['palette', x]), ...(D.rejected || []).map(x => ['alert', x])]; return parts.length || m.delta ? `<div class="diff">${parts.map(([i, t]) => `<div>${icon(i, 12)}<span>${esc(t)}</span></div>`).join('')}${m.delta ? `<div class="${m.delta > 0 ? 'diff-up' : 'diff-down'}">${m.delta > 0 ? '+' : ''}${money(m.delta)} к стоимости</div>` : ''}${m.issues ? `<div>${icon('alert', 12)} замечаний после правки: ${m.issues}</div>` : ''}</div>` : ''; };
  function issuesPanel(p, d, issues) {
    return `<section><h4>Проверка расстановки <span class="badge ${issues.length ? 'warn' : 'ok'}">${issues.length || 'ок'}</span></h4><div class="issues">${issues.length ? issues.slice(0, 20).map(i => `<div class="issue ${i.level === 'error' ? 'error' : 'warn'}" data-focus="${i.id}">${icon('alert', 15)}<span>${esc(i.text)}</span></div>`).join('') : `<div class="issue ok">${icon('check', 15)}<span>Проходы, двери, розетки и радиаторы свободны</span></div>`}
      ${d.empty.map(z => `<div class="issue info">${icon('info', 15)}<span>${esc(z.text)}</span></div>`).join('')}</div></section>`;
  }
  function roomsPanel(p, d) {
    return `<section><h4>Комнаты <button class="chip ${d.decor !== false ? 'on' : ''}" data-act="toggle-decor" title="Декор, текстиль и растения">Декор ${d.decor !== false ? 'вкл' : 'выкл'}</button></h4><div class="stack tight">${p.rooms.map(r => { const n = d.placements.filter(x => x.roomId === r.id && !KIND_RULES[x.kind]?.ceiling).length; const L = d.lighting?.[r.id]; return `<div class="list-btn" style="cursor:default"><span style="flex:1"><b>${esc(r.name)}</b><small>${n} предм. · свет: общий ${L?.general?.length || 0}, рабочий ${L?.work?.length || 0}, акцент ${L?.accent?.length || 0}</small></span><button class="icon-btn" data-room3d="${r.id}" title="Прогулка по комнате">${icon('walk', 16)}</button><button class="icon-btn" data-render-go="${r.id}" title="Рендер комнаты">${icon('camera', 16)}</button><button class="icon-btn" data-regen="${r.id}" title="Пересобрать мебель только в этой комнате">${icon('refresh', 16)}</button></div>`; }).join('')}</div></section>`;
  }
  const explainPanel = d => `<section><h4>Почему так</h4><ul class="small" style="margin:0;padding-left:18px;color:var(--ink-2)">${d.explanation.map(x => `<li>${esc(x)}</li>`).join('')}</ul></section>`;

  // ——— Рендеры ———
  function rendersHtml() {
    const p = S.project, d = selectedDesign();
    const prov = p.brief.provider; const ai = prov !== 'local' && S.server.providers?.[prov];
    const refs = p.brief.consent ? p.brief.references.filter(r => r.id).length : 0;
    return `<div class="notice ${ai ? 'accent' : 'warn'}" style="margin-bottom:14px">${icon(ai ? 'sparkles' : 'info')}<div>${ai
      ? `Фотореалистичный рендер (1–3 минуты): за основу берётся 3D-сцена комнаты с расставленной мебелью, стиль и палитра — из ${refs ? `ваших референсов (${Math.min(3, refs)} шт.)` : 'выбранного стиля'}${!refs && p.brief.references.length ? ' — чтобы учитывать фото, отметьте согласие на передачу на шаге «Стиль»' : ''}.`
      : `Фотореалистичный рендер выключен${S.server.providers?.gemini || S.server.providers?.openai ? ' — включите расширенный подбор на шаге «Стиль»' : ' — сервис рендера не подключён на сервере'}. Сейчас сохраняется 3D-превью сцены.`}
      Предметы на рендере приблизительные — сверяйтесь с фото и размерами в карточке товара.</div></div>
      <div class="stack">${p.rooms.map(r => { const list = (d.renders || []).filter(x => x.roomId === r.id); return `<div class="card pad-sm"><div class="row between"><h3>${esc(r.name)}</h3><button class="btn sm" data-render="${r.id}" ${S.ui.rendering === r.id ? 'disabled' : ''}>${icon('camera', 14)} ${S.ui.rendering === r.id ? 'Рендер…' : 'Сделать рендер'}</button></div>
        ${list.length ? `<div class="renders" style="margin-top:12px">${list.map(x => `<div class="render"><img src="${esc(x.src)}" alt="${esc(r.name)}"><div class="cap"><span class="badge ${x.kind === 'ai' ? 'info' : ''}">${x.kind === 'ai' ? `Рендер${x.refs ? ` · по ${x.refs} реф.` : ''}` : '3D-превью'}</span><span class="muted">${dateRu(x.at)}</span><button class="icon-btn" data-del-render="${x.id}">${icon('trash', 14)}</button></div></div>`).join('')}</div>` : ''}</div>`; }).join('')}</div>`;
  }
  async function snapshotRoom(roomId) {
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-9999px;top:0;width:1024px;height:683px'; document.body.append(box);
    try { const { createView3D } = await import('./view3d.js'); const v = createView3D(box, { getDesign: selectedDesign }); await new Promise(r => setTimeout(r, 500)); const src = v.snapshot(roomId); v.destroy(); return src; }
    catch (e) { toast('3D недоступно: ' + e.message, 'err'); return null; }
    finally { box.remove(); }
  }
  async function makeRender(roomId) {
    if (!(await requireFeature('ai', 'Рендеры доступны после регистрации.'))) return;
    const p = S.project, d = selectedDesign(); const room = p.rooms.find(r => r.id === roomId);
    S.ui.rendering = roomId; renderBody();
    let src = null, kind = 'preview', refsUsed = 0;
    // 3D-снимок комнаты нужен всегда: это превью и «эскиз» композиции для ИИ
    const snapshot = await snapshotRoom(roomId);
    const prov = p.brief.provider;
    if (prov !== 'local' && S.server.online && S.server.providers?.[prov]) {
      try {
        const items = d.placements.filter(x => x.roomId === roomId).map(x => productById(p, x.productId)).filter(Boolean).map(x => `${x.name} (${x.material}, цвет ${x.color}, ${x.dims.w}×${x.dims.d}×${x.dims.h} мм)`);
        const fin = d.finishes[roomId] || {};
        const refs = p.brief.consent ? p.brief.references.map(r => r.id).filter(Boolean).slice(0, 3) : [];
        refsUsed = refs.length;
        const a = p.brief.analysis?.confirmed ? p.brief.analysis : null;
        const res = await api(`/api/render/${prov}`, { method: 'POST', timeout: 200000, body: {
          room: room.name, type: room.type, area: roomMetrics(p, room).area, style: styleById(d.styleId).name, items,
          floor: productById(p, fin.floor)?.name, walls: productById(p, fin.walls)?.name,
          prompt: p.brief.prompt, palette: a?.palette, materials: a?.materials, mood: a?.mood,
          snapshot, references: refs } });
        src = res.url; kind = 'ai';
      } catch (e) { toast('Рендер недоступен: ' + e.message + '. Сохраняю 3D-превью.', 'err'); }
    } else if (prov === 'local') toast('Выбран базовый подбор — сохраняю 3D-превью. Для фотореалистичного рендера включите расширенный подбор на шаге «Стиль».');
    if (!src) src = snapshot;
    S.ui.rendering = null;
    if (src) commit(pp => { const dd = pp.designs.find(x => x.id === pp.selectedDesign); dd.renders = [{ id: uid('rn'), roomId, src, kind, refs: refsUsed, at: new Date().toISOString() }, ...(dd.renders || []).filter(x => x.roomId !== roomId || (dd.renders.filter(y => y.roomId === roomId).indexOf(x) < 2))]; });
    else renderBody();
  }

  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]'); if (t && !t.disabled) { tab = t.dataset.tab; S.ui.selection = null; return renderBody(); }
    const s = e.target.closest('[data-select]'); if (s) return commit(p => selectDesign(p, s.dataset.select));
    const o = e.target.closest('[data-open]'); if (o) { tab = 'editor'; return renderBody(); }
    const x = e.target.closest('[data-explain]'); if (x) { const d = S.project.designs.find(y => y.id === x.dataset.explain); return modal({ title: d.name, content: `<ul>${d.explanation.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${d.empty.length ? `<h4>Пустые зоны</h4><ul class="small">${d.empty.map(z => `<li>${esc(z.text)}</li>`).join('')}</ul>` : ''}` }); }
    const r = e.target.closest('[data-render]'); if (r) return makeRender(r.dataset.render);
    const dr = e.target.closest('[data-del-render]'); if (dr) return commit(p => { const d = p.designs.find(y => y.id === p.selectedDesign); d.renders = d.renders.filter(y => y.id !== dr.dataset.delRender); });
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'generate') generate();
    if (a === 'compare') compareDialog();
    if (a === 'complete') completeStep('design');
  });

  renderBody();
  return {
    update(what) {
      if (what === 'server') return;
      renderTabs();
      if (tab === 'editor' && ed) { ed.recheck(); ed.refresh(what); return; }
      if (tab === 'tiles' && tilesView) return tilesView.update(what);
      if (what !== 'canvas') renderBody();
    },
    destroy() { ed?.destroy(); tilesView?.destroy?.(); },
  };
}
