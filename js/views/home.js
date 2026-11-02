// Главная: текущий проект и путь по шагам, список проектов, создание нового.
import { S, projectIndex, openProject, deleteProject, duplicateProject, ls } from '../store.js';
import { STEPS, stepState, go, newProjectDialog } from '../main.js';
import { esc, icon, dateRu, num, confirmDialog } from '../ui.js';
import { miniPlan } from './canvas.js';
import { migrate, totalArea } from '../core/model.js';

export function mount(el) {
  function render() {
    const p = S.project;
    const idx = projectIndex();
    const next = p ? STEPS.find(s => stepState(s.id) === 'open') || STEPS.at(-1) : null;
    el.innerHTML = `<div class="page">
      <section class="hero">
        <div class="hero-copy">
          <span class="badge" style="background:rgba(255,255,255,.12);color:inherit;align-self:flex-start">Планировка · инженерия · дизайн · смета</span>
          <h1>От чертежа квартиры до сметы по ценам вашего города</h1>
          <p>Нарисуйте план, расставьте розетки и трубы, выберите стиль — система подберёт мебель только из реального каталога, рассчитает плитку и соберёт смету.</p>
          <div class="row wrap" style="margin-top:6px">
            ${p ? `<button class="btn primary lg" data-go="${next.id}">${icon('arrowRight')} Продолжить: ${esc(next.name)}</button>` : ''}
            <button class="btn lg" data-act="new">${icon('plus')} Новый проект</button>
          </div>
          <svg class="hero-art" viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="3"><path d="M10 10h180v180H10zM10 90h80M90 10v120M130 90h60M130 90v100M90 150h40"/><path d="M90 60a30 30 0 0 1 30 30" stroke-dasharray="4 4"/></svg>
        </div>
        ${p ? `<div class="card journey-card">
          <div class="card-head"><div><h3>${esc(p.name)}</h3><p>${esc(p.city)} · ${num(totalArea(p), 1)} м² · ${p.rooms.length} помещ.</p></div><span class="badge accent">${p.journey.completed.length} из ${STEPS.length}</span></div>
          <div class="progress"><i style="width:${p.journey.completed.length / STEPS.length * 100}%"></i></div>
          <div class="journey-list">${STEPS.map((s, i) => { const st = stepState(s.id); return `<button class="journey-row ${st === 'done' || st === 'skipped' ? 'done' : ''} ${next?.id === s.id ? 'current' : ''}" data-go="${s.id}" ${st === 'locked' ? 'disabled' : ''}><span class="n">${st === 'done' ? '✓' : i + 1}</span><span><b>${s.name}${st === 'skipped' ? ' <span class="badge warn">пропущено</span>' : ''}</b><small>${s.hint}</small></span><span class="spacer"></span>${st === 'locked' ? icon('lock', 15, 'faint') : icon('chevron', 15, 'faint')}</button>`; }).join('')}</div>
        </div>` : `<div class="card journey-card"><h3>Как это работает</h3><div class="journey-list">${STEPS.map((s, i) => `<div class="journey-row" style="cursor:default"><span class="n">${i + 1}</span><span><b>${s.name}</b><small>${s.hint}</small></span></div>`).join('')}</div></div>`}
      </section>

      <div class="page-head"><div><h2>Проекты</h2><p>${S.user ? 'Проекты сохраняются в аккаунте и на этом устройстве.' : S.server.online ? 'Гостевые проекты хранятся только на этом устройстве — войдите, чтобы сохранить в аккаунте.' : 'Сервер недоступен: проекты хранятся на этом устройстве.'}</p></div></div>
      <div class="projects">
        <button class="proj-card new" data-act="new">${icon('plus', 26)}<span>Новый проект</span></button>
        ${idx.map(x => { const data = ls.get('dp.project.' + x.id); const pr = data ? migrate(data) : null; return `<div class="proj-card ${x.id === p?.id ? 'current' : ''}" data-open="${x.id}">
          <div class="preview">${pr ? miniPlan(pr) : ''}</div>
          <div class="meta"><div><b>${esc(x.name)}</b><div class="small muted">${esc(x.city)} · ${num(x.area || 0, 1)} м² · ${dateRu(x.updatedAt)}</div></div>
          <div class="row" style="gap:2px"><button class="icon-btn" data-dup="${x.id}" title="Копия">${icon('copy', 16)}</button><button class="icon-btn" data-del="${x.id}" title="Удалить">${icon('trash', 16)}</button></div></div></div>`; }).join('')}
      </div>

      <div class="features">
        <div class="feature">${icon('sparkles', 22)}<h3>Только реальные товары</h3><p>Варианты собираются только из позиций каталога со ссылкой, размерами и датой цены. Если подходящего нет — зона остаётся пустой.</p></div>
        <div class="feature">${icon('bolt', 22)}<h3>Проверки — подсказки</h3><p>Правила по розеткам, группам, уклону канализации и эргономике показываются предупреждениями. Это не согласование перепланировки.</p></div>
        <div class="feature">${icon('calc', 22)}<h3>Смета — оценка</h3><p>Расценки по справочнику города с версией и датой, точность работ ±10–15%. Любую строку можно поправить вручную.</p></div>
      </div>
    </div>
    <div class="foot-note">Эскизный инструмент. Планы, проверки и смета носят справочный характер и не заменяют рабочую документацию и консультации специалистов.</div>`;
  }
  el.addEventListener('click', async e => {
    const g = e.target.closest('[data-go]'); if (g && !g.disabled) return go(g.dataset.go);
    if (e.target.closest('[data-act="new"]')) return newProjectDialog();
    const del = e.target.closest('[data-del]'); if (del) { e.stopPropagation(); if (await confirmDialog('Удалить проект?', 'Проект и его версии будут удалены с этого устройства' + (S.user ? ' и с сервера' : '') + '.', 'Удалить', true)) deleteProject(del.dataset.del); return; }
    const dup = e.target.closest('[data-dup]'); if (dup) { e.stopPropagation(); duplicateProject(dup.dataset.dup); return; }
    const op = e.target.closest('[data-open]'); if (op) { openProject(op.dataset.open); go('plan'); }
  });
  render();
  return { update: render };
}
