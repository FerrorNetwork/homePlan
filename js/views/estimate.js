// Шаг 6. Смета по городу (раздел 7): разделы и комнаты, уровни работ, ручные правки, источники цен, сравнение, экспорт.
import { S, commit, can } from '../store.js';
import { completeStep, authDialog } from '../main.js';
import { esc, icon, toast, num, money, modal, dateRu, dateTimeRu } from '../ui.js';
import { buildEstimate, estimateLevels, compareEstimates, OBJECT_TYPES, HANDOVER } from '../core/estimate.js';
import { CITIES, cityByName, detectCity } from '../data/cities.js';
import { LEVELS, SECTIONS, RATES_META } from '../data/rates.js';
import { exportXlsx, printDocument } from '../core/export.js';
import { selectedDesign } from './design.js';
import { shareLink } from './shopping.js';
import { uid } from '../core/model.js';
import { loadServerCatalog } from '../catalogSync.js';

let view = 'sections', open = new Set(['furniture', 'tile', 'finish']);

export function mount(el) {
  function render() {
    const p = S.project;
    if (!can('estimate')) {
      el.innerHTML = `<div class="page"><div class="card" style="max-width:560px;margin:40px auto;text-align:center" ><div class="stack">${icon('lock', 30)}<h2>Смета доступна после регистрации</h2><p class="muted">Гость может строить планировку. Регистрация нужна для сохранения проекта, подбора дизайна и сметы.</p><div><button class="btn primary lg" data-act="login">Войти или зарегистрироваться</button></div></div></div></div>`;
      return;
    }
    const d = selectedDesign();
    const E = buildEstimate(p, d);
    const levels = estimateLevels(p, d);
    const detected = detectCity();
    const ov = p.estimate.overrides;
    const groups = view === 'sections'
      ? E.bySection.filter(s => s.lines.length).map(s => ({ id: s.id, name: s.name, total: s.total, lines: s.lines }))
      : [...p.rooms.map(r => ({ id: r.id, name: r.name, lines: E.lines.filter(l => l.roomId === r.id) })), { id: 'common', name: 'Общие позиции', lines: E.lines.filter(l => !l.roomId) }].map(g => ({ ...g, total: g.lines.reduce((s, l) => s + l.sum, 0) })).filter(g => g.lines.length);
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Шаг 6 из 6</div><h1>Смета ремонта</h1><p>Объёмы из модели, товары из списка покупок, работы — по справочнику расценок города. Итог пересчитывается при каждом изменении проекта; ручные правки сохраняются.</p></div>
        <div class="row wrap"><button class="btn" data-act="xlsx">${icon('download', 15)} Excel</button><button class="btn" data-act="pdf">${icon('print', 15)} PDF</button><button class="btn" data-act="share">${icon('share', 15)} Ссылка</button><button class="btn primary" data-act="finish">${p.journey.completed.includes('estimate') ? icon('check', 15) + ' Проект собран' : 'Завершить проект'}</button></div></div>

      ${E.notes.map(n => `<div class="notice ${n.level === 'warn' ? 'warn' : ''}" style="margin-bottom:10px">${icon(n.level === 'warn' ? 'alert' : 'info')}<span>${esc(n.text)}</span></div>`).join('')}

      <div class="est-layout"><div class="stack loose">
        <div class="kpis">
          <div class="kpi"><span>Материалы</span><b>${money(E.totals.materials)}</b></div>
          <div class="kpi"><span>Мебель и техника</span><b>${money(E.totals.furniture)}</b></div>
          <div class="kpi"><span>Работы</span><b>${money(E.totals.works)}</b><small>точность ${RATES_META.accuracyWorks}</small></div>
          <div class="kpi accent"><span>Всего · ${esc(E.level.name)}</span><b>${money(E.totals.total)}</b><small>${num(E.totals.total / Math.max(1, E.area), 0)} ₽/м² · ${dateRu(E.date)}</small></div>
        </div>

        <div class="row between wrap"><div class="seg">${[['sections', 'По разделам'], ['rooms', 'По комнатам']].map(([k, n]) => `<button class="${view === k ? 'on' : ''}" data-view="${k}">${n}</button>`).join('')}</div>
          <div class="row"><button class="btn sm" data-act="expand">${icon('chevronDown', 14)} Развернуть всё</button><button class="btn sm" data-act="add-line">${icon('plus', 14)} Своя позиция</button></div></div>

        <div class="table-wrap"><table class="t cards"><thead><tr><th>Позиция</th><th class="n">Кол-во</th><th class="n">Цена, ₽</th><th class="n">Сумма</th><th>Источник цены</th><th>Исполнитель</th><th></th></tr></thead><tbody>
          ${groups.map(g => `<tr class="group" data-toggle="${g.id}" style="cursor:pointer"><td colspan="3">${icon(open.has(g.id) ? 'chevronDown' : 'chevron', 13)} ${esc(g.name)} <span class="muted small">· ${g.lines.length}</span></td><td class="n">${money(g.total)}</td><td colspan="3"></td></tr>
            ${open.has(g.id) ? g.lines.map(l => lineHtml(p, l, ov)).join('') : ''}`).join('')}
          <tr class="group"><td colspan="3">Итого</td><td class="n">${money(E.totals.total)}</td><td colspan="3"></td></tr>
        </tbody></table></div>
        <p class="tiny muted">Смета — оценка, а не оферта. Работы: ${esc(RATES_META.title)}, версия ${RATES_META.version} от ${dateRu(RATES_META.date)}, точность ${RATES_META.accuracyWorks}. Товары — по ценам магазинов на дату обновления. Расчёт от ${dateTimeRu(new Date())}.</p>
      </div>

      <aside class="stack sticky">
        <div class="card pad-sm"><h4 style="margin-bottom:10px">Город и регион</h4>
          <select class="select" data-city>${CITIES.map(c => `<option ${c.name === p.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          <div class="tiny muted" style="margin-top:6px">${esc(cityByName(p.city).region)} · коэф. работ ${num(cityByName(p.city).work, 2)}${detected && detected.name !== p.city ? ` · по часовому поясу похоже на <a href="#" data-city-set="${esc(detected.name)}">${esc(detected.name)}</a>` : ''}</div></div>
        <div class="card pad-sm"><h4 style="margin-bottom:10px">Объект</h4>
          <div class="seg" style="width:100%">${Object.entries(OBJECT_TYPES).map(([k, v]) => `<button style="flex:1" class="${(p.objectType || 'secondary') === k ? 'on' : ''}" data-objtype="${k}">${k === 'newbuild' ? 'Новостройка' : 'Вторичка'}</button>`).join('')}</div>
          ${p.objectType === 'newbuild' ? `<div class="stack tight" style="margin-top:10px">${Object.entries(HANDOVER).map(([k, v]) => `<button class="list-btn ${p.handover === k ? 'on' : ''}" data-handover="${k}"><span><b class="small">${v.name}</b><small>${v.hint}</small></span></button>`).join('')}</div>` : `<p class="tiny muted" style="margin-top:8px">Учитываем демонтаж старой отделки, черновые работы и вывоз мусора.</p>`}</div>
        <div class="card pad-sm"><h4 style="margin-bottom:10px">Уровень работ</h4><div class="level-cards">${Object.entries(LEVELS).map(([k, v]) => `<button class="level ${p.estimate.level === k ? 'on' : ''}" data-level="${k}"><b>${v.name}</b><span>${num(levels[k] / 1000, 0)} тыс.</span></button>`).join('')}</div></div>
        <div class="card pad-sm"><h4 style="margin-bottom:10px">Настройки</h4><div class="stack tight">
          <label class="field"><span>Резерв на непредвиденные, %</span><input class="input sm num" type="number" min="0" max="50" data-est="reserve" value="${p.estimate.reserve}"></label>
          <label class="check small"><input type="checkbox" data-inc="demo" ${p.estimate.include?.demo !== false ? 'checked' : ''}> Демонтаж и вывоз мусора</label>
          <label class="check small"><input type="checkbox" data-inc="rough" ${p.estimate.include?.rough !== false ? 'checked' : ''}> Черновые работы</label>
          ${Object.keys(p.estimate.overrides).length ? `<button class="btn sm ghost" data-act="reset-overrides">Сбросить ручные правки (${Object.keys(p.estimate.overrides).length})</button>` : ''}</div></div>
        <div class="card pad-sm"><h4 style="margin-bottom:10px">Структура</h4>${E.bySection.filter(s => s.total).map(s => `<div class="bar-row"><span>${esc(s.name)}</span><span class="mono small">${num(s.total / 1000, 0)} т</span><div class="bar"><i style="width:${s.total / E.totals.total * 100}%"></i></div></div>`).join('')}</div>
        ${p.designs.length > 1 ? `<div class="card pad-sm"><h4 style="margin-bottom:10px">Сравнить варианты дизайна</h4><select class="select sm" data-compare><option value="">Выберите вариант</option>${p.designs.filter(x => x.id !== p.selectedDesign).map(x => `<option value="${x.id}" ${p.estimate.compareWith === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${compareHtml(p, E)}</div>` : ''}
        <div class="card pad-sm"><h4 style="margin-bottom:10px">Что подорожало</h4>${p.estimate.history.length ? `<div class="stack tight">${p.estimate.history.slice(0, 8).map(h => `<div class="small"><div class="row between"><span>${esc(h.text)}</span><b class="mono ${h.delta > 0 ? 'diff-up' : 'diff-down'}">${h.delta > 0 ? '+' : ''}${num(h.delta, 0)}</b></div><div class="tiny muted">${dateTimeRu(h.at)}</div></div>`).join('')}</div>` : '<p class="small muted">Замены позиций появятся здесь с разницей в стоимости.</p>'}</div>
      </aside></div>
    </div>`;
  }

  function lineHtml(p, l, ov) {
    const src = l.source || {};
    const editable = l.key !== 'reserve';
    return `<tr class="${l.removed ? 'removed' : ''}"><td><div style="font-weight:600">${esc(l.name)}</div><div class="tiny muted">${l.roomId ? esc(p.rooms.find(r => r.id === l.roomId)?.name || '') + ' · ' : ''}${{ material: 'материал', furniture: 'мебель/техника', work: 'работа' }[l.type]}${l.note ? ' · ' + esc(l.note) : ''}${l.edited ? ' · <span class="badge info">изменено</span>' : ''}${l.issues?.length ? ` <span class="badge warn">${esc(l.issues[0])}</span>` : ''}</div></td>
      <td class="n" data-label="Количество">${editable ? `<input class="input sm num" type="number" step="any" min="0" data-ov="${esc(l.key)}" data-f="qty" value="${l.qty}">` : l.qty} <span class="tiny muted">${esc(l.unit)}</span></td>
      <td class="n" data-label="Цена, ₽">${editable ? `<input class="input sm num" type="number" step="any" min="0" data-ov="${esc(l.key)}" data-f="price" value="${l.price}">` : money(l.price)}</td>
      <td class="n" data-label="Сумма"><b>${money(l.sum)}</b></td>
      <td class="src" data-label="Источник">${src.url ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.label)}</a>` : esc(src.label || '')}<br>${src.date ? 'от ' + dateRu(src.date) : ''}</td>
      <td data-label="Исполнитель">${editable ? `<input class="input sm" style="width:110px" data-ov="${esc(l.key)}" data-f="performer" value="${esc(l.performer || '')}" placeholder="—">` : ''}</td>
      <td class="n acts">${l.custom ? `<button class="icon-btn" data-del-custom="${esc(l.key)}" title="Удалить">${icon('trash', 14)}</button>` : editable ? `<button class="icon-btn" data-remove="${esc(l.key)}" title="${l.removed ? 'Вернуть' : 'Исключить'}">${icon(l.removed ? 'plus' : 'minus', 14)}</button>` : ''}</td></tr>`;
  }

  function compareHtml(p, E) {
    const other = p.designs.find(x => x.id === p.estimate.compareWith); if (!other) return '';
    const E2 = buildEstimate(p, other);
    const diff = compareEstimates(E, E2).slice(0, 6);
    const dt = E2.totals.total - E.totals.total;
    return `<div class="small" style="margin-top:10px"><div class="row between"><span>Текущий</span><b class="mono">${money(E.totals.total)}</b></div><div class="row between"><span>${esc(other.name)}</span><b class="mono">${money(E2.totals.total)}</b></div>
      <div class="row between" style="margin:6px 0"><span>Разница</span><b class="mono ${dt > 0 ? 'diff-up' : 'diff-down'}">${dt > 0 ? '+' : ''}${money(dt)}</b></div>
      ${diff.map(x => `<div class="row between tiny"><span style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</span><span class="mono ${x.diff > 0 ? 'diff-up' : 'diff-down'}">${x.diff > 0 ? '+' : ''}${num(x.diff, 0)}</span></div>`).join('')}</div>`;
  }

  async function addLine() {
    const r = await modal({ title: 'Своя позиция', content: `<label class="field"><span>Название</span><input class="input" name="name" required></label>
      <div class="grid2"><label class="field"><span>Раздел</span><select class="select" name="section">${SECTIONS.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></label><label class="field"><span>Тип</span><select class="select" name="type"><option value="work">Работа</option><option value="material">Материал</option><option value="furniture">Мебель/техника</option></select></label></div>
      <div class="grid3"><label class="field"><span>Кол-во</span><input class="input num" type="number" step="any" name="qty" value="1"></label><label class="field"><span>Ед.</span><input class="input" name="unit" value="шт"></label><label class="field"><span>Цена, ₽</span><input class="input num" type="number" step="any" name="price" required></label></div>
      <label class="field"><span>Комната</span><select class="select" name="roomId"><option value="">— общая —</option>${S.project.rooms.map(r2 => `<option value="${r2.id}">${esc(r2.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Исполнитель</span><input class="input" name="performer"></label>`, buttons: [{ label: 'Отмена' }, { label: 'Добавить', value: 'ok', primary: true }] });
    if (r.value) commit(p => p.estimate.custom.push({ id: uid('c'), ...r.data, qty: Number(r.data.qty) || 1, price: Number(r.data.price) || 0, date: new Date().toISOString().slice(0, 10) }));
  }

  async function exportXlsxFile() {
    const p = S.project, E = buildEstimate(p, selectedDesign());
    const rows = [[`Смета: ${p.name}`], [`${p.city}, ${E.level.name} · ${new Date().toLocaleDateString('ru-RU')} · работы ${RATES_META.accuracyWorks}`], [], ['Раздел', 'Комната', 'Позиция', 'Тип', 'Кол-во', 'Ед.', 'Цена, ₽', 'Сумма, ₽', 'Источник', 'Дата цены', 'Исполнитель']];
    const formulas = {};
    let r = rows.length;
    const sectionTotals = [];
    for (const s of E.bySection.filter(x => x.lines.length)) {
      const start = r + 1;
      for (const l of s.lines) { r++; rows.push([s.name, p.rooms.find(x => x.id === l.roomId)?.name || '', l.name, { material: 'Материал', furniture: 'Мебель', work: 'Работа' }[l.type], l.removed ? 0 : l.qty, l.unit, l.price, null, l.source?.url || l.source?.label || '', l.source?.date || '', l.performer || '']); formulas[`H${r}`] = `E${r}*G${r}`; }
      r++; rows.push(['', '', `Итого: ${s.name}`, '', '', '', '', null]); formulas[`H${r}`] = `SUM(H${start}:H${r - 1})`; sectionTotals.push(r);
    }
    r++; rows.push(['', '', 'ВСЕГО', '', '', '', '', null]); formulas[`H${r}`] = sectionTotals.map(x => `H${x}`).join('+');
    rows.push([], [`Смета является оценкой и не является офертой. Справочник: ${RATES_META.title} v${RATES_META.version} от ${RATES_META.date}.`]);
    try { await exportXlsx(`${p.name} — смета.xlsx`, [{ name: 'Смета', rows, formulas, cols: [24, 16, 46, 10, 9, 8, 11, 13, 40, 11, 14] }]); }
    catch (e) { toast(e.message, 'err'); }
  }

  function exportPdf() {
    const p = S.project, E = buildEstimate(p, selectedDesign());
    printDocument(`${p.name} — смета`, `<h1>Смета ремонта</h1><div class="muted">${esc(p.name)} · ${esc(p.city)} (${esc(cityByName(p.city).region)}) · уровень «${esc(E.level.name)}» · ${num(E.area, 1)} м² · расчёт от ${new Date().toLocaleDateString('ru-RU')}</div>
      <div class="box"><b>Итого: ${money(E.totals.total)}</b> · материалы ${money(E.totals.materials)} · мебель ${money(E.totals.furniture)} · работы ${money(E.totals.works)}<br><span class="muted">Точность работ ${RATES_META.accuracyWorks}. Смета — оценка, а не оферта.</span></div>
      ${E.notes.map(n => `<p class="muted">⚠ ${esc(n.text)}</p>`).join('')}
      ${E.bySection.filter(s => s.lines.length).map(s => `<h2>${esc(s.name)} — ${money(s.total)}</h2><table><tr><th>Позиция</th><th class="n">Кол-во</th><th class="n">Цена</th><th class="n">Сумма</th><th>Источник</th></tr>${s.lines.filter(l => !l.removed).map(l => `<tr><td>${esc(l.name)}${l.roomId ? `<div class="muted">${esc(p.rooms.find(x => x.id === l.roomId)?.name || '')}</div>` : ''}</td><td class="n">${l.qty} ${esc(l.unit)}</td><td class="n">${money(l.price)}</td><td class="n">${money(l.sum)}</td><td class="muted">${esc(l.source?.label || '')}${l.source?.date ? ', ' + dateRu(l.source.date) : ''}</td></tr>`).join('')}</table>`).join('')}
      <h2>По комнатам</h2><table>${E.byRoom.map(x => `<tr><td>${esc(x.room.name)}</td><td class="n">${money(x.total)}</td></tr>`).join('')}</table>
      <p class="muted">Справочник работ: ${esc(RATES_META.title)}, версия ${RATES_META.version} от ${dateRu(RATES_META.date)}.</p>`);
  }

  el.addEventListener('click', async e => {
    const t = e.target.closest('[data-toggle]'); if (t) { const id = t.dataset.toggle; open.has(id) ? open.delete(id) : open.add(id); return render(); }
    const v = e.target.closest('[data-view]'); if (v) { view = v.dataset.view; open = new Set(); return render(); }
    const lv = e.target.closest('[data-level]'); if (lv) return commit(p => { p.estimate.level = lv.dataset.level; });
    const ot = e.target.closest('[data-objtype]'); if (ot) return commit(p => { p.objectType = ot.dataset.objtype; });
    const ho = e.target.closest('[data-handover]'); if (ho) return commit(p => { p.handover = ho.dataset.handover; });
    const rm = e.target.closest('[data-remove]'); if (rm) return commit(p => { const o = p.estimate.overrides[rm.dataset.remove] ||= {}; o.removed = !o.removed; });
    const dc = e.target.closest('[data-del-custom]'); if (dc) return commit(p => { p.estimate.custom = p.estimate.custom.filter(c => c.id !== dc.dataset.delCustom); });
    const cs = e.target.closest('[data-city-set]'); if (cs) { e.preventDefault(); return commit(p => { p.city = cs.dataset.citySet; p.region = cityByName(p.city).region; }); }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'login') { if (await authDialog('register')) render(); }
    if (a === 'expand') { const p = S.project; const all = view === 'sections' ? SECTIONS.map(s => s.id) : [...p.rooms.map(r => r.id), 'common']; open = open.size >= all.length ? new Set() : new Set(all); render(); }
    if (a === 'add-line') addLine();
    if (a === 'reset-overrides') commit(p => { p.estimate.overrides = {}; });
    if (a === 'xlsx') exportXlsxFile();
    if (a === 'pdf') exportPdf();
    if (a === 'share') shareLink();
    if (a === 'finish') completeStep('estimate');
  });
  el.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-city]')) commit(p => { p.city = t.value; p.region = cityByName(t.value).region; });
    if (t.dataset.est) commit(p => { p.estimate[t.dataset.est] = Number(t.value) || 0; });
    if (t.dataset.inc) commit(p => { p.estimate.include = { ...(p.estimate.include || {}), [t.dataset.inc]: t.checked }; });
    if (t.matches('[data-compare]')) commit(p => { p.estimate.compareWith = t.value || null; });
    if (t.dataset.ov) commit(p => { const o = p.estimate.overrides[t.dataset.ov] ||= {}; const f = t.dataset.f; o[f] = f === 'performer' ? t.value : Math.max(0, Number(t.value) || 0); o.date = new Date().toISOString().slice(0, 10); });
  });
  render();
  // Обновляем цены из фидов при каждом открытии сметы (FR-32)
  loadServerCatalog();
  return { update: what => { if (what === 'canvas') return; render(); } };
}
