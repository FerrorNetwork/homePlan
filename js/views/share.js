// Просмотр проекта по ссылке только для чтения (роль «Приглашённый»): план, список покупок, смета, комментарии.
import { S } from '../store.js';
import { esc, icon, money, num, dateRu, dateTimeRu, toast } from '../ui.js';
import { migrate } from '../core/model.js';
import { buildEstimate, shoppingList } from '../core/estimate.js';
import { miniPlan } from './canvas.js';
import { api } from '../api.js';

export function mount(el, [token]) {
  el.innerHTML = '<div class="page"><div class="empty">Загрузка…</div></div>';
  let data = null;
  async function load() {
    try { data = await api(`/api/share/${encodeURIComponent(token || '')}`); render(); }
    catch (e) { el.innerHTML = `<div class="page"><div class="empty">${icon('lock', 30)}<p>Ссылка недействительна или сервер недоступен.</p></div></div>`; }
  }
  function render() {
    const prevProject = S.project;
    const p = migrate(data.project);
    S.project = p; // расчёты используют текущий проект
    const d = p.designs.find(x => x.id === p.selectedDesign) || null;
    const E = buildEstimate(p, d); const list = shoppingList(p, d).filter(i => !i.excluded);
    S.project = prevProject;
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Только просмотр</div><h1>${esc(p.name)}</h1><p>${esc(p.city)} · ${num(E.area, 1)} м² · снимок от ${dateTimeRu(data.createdAt)}</p></div><button class="btn" onclick="print()">${icon('print', 15)} Печать</button></div>
      <div class="grid2" style="gap:16px;align-items:start">
        <div class="card p0"><div style="height:340px;background:var(--canvas)">${miniPlan(p, d)}</div></div>
        <div class="stack"><div class="kpis" style="grid-template-columns:1fr 1fr"><div class="kpi accent"><span>Смета, всего</span><b>${money(E.totals.total)}</b><small>${esc(E.level.name)} · ${dateRu(E.date)}</small></div><div class="kpi"><span>Товары</span><b>${money(list.reduce((s, i) => s + i.sum, 0))}</b><small>${list.length} позиций</small></div></div>
          <div class="card pad-sm">${E.bySection.filter(s => s.total).map(s => `<div class="row between small" style="padding:4px 0;border-bottom:1px solid var(--line)"><span>${esc(s.name)}</span><b class="mono">${money(s.total)}</b></div>`).join('')}</div></div>
      </div>
      <h2 style="margin:24px 0 10px">Список покупок</h2>
      <div class="table-wrap"><table class="t"><tr><th>Товар</th><th>Комната</th><th class="n">Кол-во</th><th class="n">Сумма</th><th>Магазин</th></tr>${list.map(i => `<tr><td>${esc(i.product?.name)}</td><td>${esc(i.room?.name || '—')}</td><td class="n">${i.qty} ${i.unit}</td><td class="n">${money(i.sum)}</td><td>${i.offer ? `<a href="${esc(i.offer.url)}" target="_blank" rel="noopener">${esc(i.offer.storeName)}</a>` : '—'}</td></tr>`).join('')}</table></div>
      <h2 style="margin:24px 0 10px">Комментарии</h2>
      <div class="stack tight">${(data.comments || []).map(c => `<div class="card pad-sm"><div class="row between"><b>${esc(c.name || 'Гость')}</b><span class="tiny muted">${dateTimeRu(c.at)}</span></div><p class="small">${esc(c.text)}</p></div>`).join('') || '<p class="muted small">Пока нет комментариев.</p>'}
        <form class="card pad-sm stack tight" data-comment><div class="grid2"><input class="input" name="name" placeholder="Ваше имя"><span></span></div><textarea class="input" name="text" rows="2" placeholder="Комментарий для владельца проекта" required></textarea><div><button class="btn primary sm">Отправить</button></div></form></div>
      <p class="tiny muted" style="margin-top:20px">Смета — оценка, а не оферта. Цены демонстрационного каталога не являются предложением магазинов.</p></div>`;
  }
  el.addEventListener('submit', async e => {
    const f = e.target.closest('[data-comment]'); if (!f) return;
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f));
    try { await api(`/api/share/${encodeURIComponent(token)}/comments`, { method: 'POST', body: fd }); toast('Комментарий отправлен'); load(); } catch (err) { toast(err.message, 'err'); }
  });
  load();
  return { update() {} };
}
