// Точка входа: оболочка, маршрутизация по шагам, меню проекта и пользователя, горячие клавиши.
import { S, subscribe, emit, loadInitial, newProject, openProject, projectIndex, undo, redo, refreshUser, syncFromServer, can, saveVersion, versions, restoreVersion, deleteVersion, commit } from './store.js';
import { health, api } from './api.js';
import { esc, icon, toast, modal, dateTimeRu, num } from './ui.js';
import { CITIES, detectCity, cityByName } from './data/cities.js';
import { totalArea } from './core/model.js';
import { loadServerCatalog } from './catalogSync.js';
import { OBJECT_TYPES, HANDOVER } from './core/estimate.js';

export const STEPS = [
  { id: 'plan', name: 'Планировка', hint: 'Стены, комнаты, проёмы' },
  { id: 'engineering', name: 'Инженерия', hint: 'Электрика, вода, отопление' },
  { id: 'style', name: 'Стиль', hint: 'Стиль, референсы, пожелания' },
  { id: 'design', name: 'Дизайн', hint: 'Варианты, правка, плитка, 3D' },
  { id: 'shopping', name: 'Покупки', hint: 'Товары и магазины' },
  { id: 'estimate', name: 'Смета', hint: 'Цены вашего города' },
];

const views = {
  home: () => import('./views/home.js'),
  projects: () => import('./views/home.js'),
  landing: () => import('./views/landing.js'),
  plan: () => import('./views/plan.js'),
  engineering: () => import('./views/engineering.js'),
  style: () => import('./views/style.js'),
  design: () => import('./views/design.js'),
  shopping: () => import('./views/shopping.js'),
  estimate: () => import('./views/estimate.js'),
  share: () => import('./views/share.js'),
};

let current = null, currentName = null;
const main = document.getElementById('main');
const topbar = document.getElementById('topbar');

// ——— Шаги ———
export function stepState(id) {
  const p = S.project; if (!p) return 'locked';
  const idx = STEPS.findIndex(s => s.id === id);
  if (p.journey.completed.includes(id)) return id === 'engineering' && p.journey.skippedEngineering ? 'skipped' : 'done';
  const firstOpen = STEPS.findIndex(s => !p.journey.completed.includes(s.id));
  return idx <= (firstOpen < 0 ? STEPS.length : firstOpen) ? 'open' : 'locked';
}

export function completeStep(id, { skip = false } = {}) {
  commit(p => {
    if (!p.journey.completed.includes(id)) p.journey.completed.push(id);
    if (id === 'engineering') p.journey.skippedEngineering = skip;
  });
  const i = STEPS.findIndex(s => s.id === id);
  if (STEPS[i + 1]) go(STEPS[i + 1].id); else { toast('Проект собран: смета готова к выгрузке'); }
}

export function go(page, params = '') { location.hash = '#/' + page + (params ? '/' + params : ''); }

async function route() {
  const [, name = 'home', ...rest] = location.hash.replace(/^#/, '').split('/');
  let page = views[name] ? name : 'home';
  // Гость видит промо-главную, вошедший пользователь — свои проекты
  if (page === 'home') page = S.user ? 'projects' : 'landing';
  S.readOnly = page === 'share';
  if (!['projects', 'landing', 'share'].includes(page)) {
    if (!S.project) { page = S.user ? 'projects' : 'landing'; history.replaceState(null, '', '#/'); }
    else if (stepState(page) === 'locked') { toast('Сначала сохраните предыдущий шаг'); const open = [...STEPS].reverse().find(s => stepState(s.id) !== 'locked'); page = open?.id || 'plan'; history.replaceState(null, '', '#/' + page); }
  }
  S.ui.page = page;
  document.body.classList.toggle('on-landing', page === 'landing');
  renderTopbar();
  const mod = await views[page]();
  current?.destroy?.();
  main.innerHTML = '';
  currentName = page;
  const host = document.createElement('div');
  host.className = 'view';
  main.append(host);
  current = mod.mount(host, rest) || null;
  window.scrollTo(0, 0);
}

// ——— Верхняя панель ———
function renderTopbar() {
  const p = S.project;
  const page = S.ui.page;
  const saveLabels = { saved: 'Сохранено', saving: 'Сохранение…', local: S.server.online ? (S.user ? 'Сохранено на устройстве' : 'Только на устройстве') : 'Локальный режим', error: 'Нет места в браузере' };
  const inProject = p && !['share', 'landing'].includes(page);
  const steps = inProject ? STEPS.map((s, i) => {
    const st = stepState(s.id);
    return `${i ? '<span class="step-sep"></span>' : ''}<button class="step ${st} ${page === s.id ? 'current' : ''}" data-step="${s.id}" ${st === 'locked' ? 'disabled' : ''} title="${esc(s.name)} — ${esc(s.hint)}${st === 'skipped' ? ' (пропущено)' : ''}"><span class="n">${st === 'done' && page !== s.id ? '✓' : i + 1}</span><span class="lbl">${s.name}</span></button>`;
  }).join('') : '';
  topbar.innerHTML = `
    <a class="brand" href="#/" aria-label="ДомПроект, главная"><span class="brand-mark">${icon('home', 18)}</span><span class="brand-name">Дом<span>Проект</span></span></a>
    ${inProject ? `<button class="proj-btn" id="proj-menu" aria-haspopup="menu"><span class="txt"><b>${esc(p.name)}</b><small>${esc(p.city)} · ${num(totalArea(p), 1)} м²</small></span>${icon('chevronDown', 14)}</button>` : ''}
    <nav class="stepper" aria-label="Шаги проекта">${steps}</nav>
    <div class="top-actions">
      ${inProject && page !== 'projects' ? `
        <button class="icon-btn" data-act="undo" title="Отменить (Ctrl+Z)" ${S.undo.length ? '' : 'disabled'}>${icon('undo')}</button>
        <button class="icon-btn" data-act="redo" title="Повторить (Ctrl+Shift+Z)" ${S.redo.length ? '' : 'disabled'}>${icon('redo')}</button>
        <button class="icon-btn" data-act="versions" title="История версий">${icon('history')}</button>` : ''}
      ${inProject ? `<span class="save-pill ${S.saveState}" title="${S.user ? 'Проект сохраняется на сервере' : 'Войдите, чтобы сохранять проект на сервере'}"><i></i><span>${saveLabels[S.saveState] || ''}</span></span>` : ''}
      ${page === 'landing' && !S.user ? `<button class="btn sm ghost lp-top-link" data-act="go-projects">Мои проекты</button>` : ''}
      <button class="avatar" id="user-menu" title="${S.user ? esc(S.user.email) : 'Войти'}">${S.user ? esc((S.user.name || S.user.email)[0].toUpperCase()) : icon('user', 16)}</button>
    </div>`;
}

function updateStatusOnly() {
  const pill = topbar.querySelector('.save-pill');
  if (!pill) return renderTopbar();
  renderTopbar();
}

topbar.addEventListener('click', async e => {
  const st = e.target.closest('[data-step]');
  if (st) return go(st.dataset.step);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'undo') return undo() || toast('История пуста');
  if (act === 'redo') return redo() || toast('Нечего повторять');
  if (act === 'versions') return versionsDialog();
  if (act === 'go-projects') return go('projects');
  if (e.target.closest('#proj-menu')) return projectMenu(e.target.closest('#proj-menu'));
  if (e.target.closest('#user-menu')) return userMenu(e.target.closest('#user-menu'));
});

function popMenu(anchor, html, onClick) {
  document.querySelector('.menu')?.remove();
  const m = document.createElement('div'); m.className = 'menu'; m.innerHTML = html;
  const r = anchor.getBoundingClientRect();
  m.style.top = r.bottom + 6 + 'px';
  document.body.append(m);
  const left = Math.min(r.left, window.innerWidth - m.offsetWidth - 10);
  m.style.left = Math.max(10, left) + 'px';
  const close = ev => { if (!m.contains(ev.target) && ev.target !== anchor) { m.remove(); document.removeEventListener('mousedown', close); } };
  setTimeout(() => document.addEventListener('mousedown', close));
  m.addEventListener('click', ev => { const b = ev.target.closest('[data-m]'); if (b) { m.remove(); document.removeEventListener('mousedown', close); onClick(b.dataset.m, b); } });
}

function projectMenu(anchor) {
  const idx = projectIndex().filter(x => x.id !== S.project?.id).slice(0, 6);
  popMenu(anchor, `
    <div class="meta">Текущий проект</div>
    <button data-m="settings">${icon('settings')} Параметры проекта</button>
    <button data-m="version">${icon('history')} Сохранить версию</button>
    ${idx.length ? '<hr><div class="meta">Другие проекты</div>' + idx.map(x => `<button data-m="open:${x.id}">${icon('plan')} ${esc(x.name)} <span class="spacer"></span><span class="muted tiny">${esc(x.city)}</span></button>`).join('') : ''}
    <hr><button data-m="new">${icon('plus')} Новый проект</button><button data-m="home">${icon('home')} Все проекты</button>`,
  async m => {
    if (m === 'settings') projectSettings();
    if (m === 'version') { const r = await modal({ title: 'Сохранить версию', content: '<label class="field"><span>Название версии</span><input class="input" name="name" placeholder="Например: перед перепланировкой"></label>', buttons: [{ label: 'Отмена' }, { label: 'Сохранить', value: 'ok', primary: true }] }); if (r.value) { await saveVersion(r.data.name); toast('Версия сохранена'); } }
    if (m.startsWith('open:')) { openProject(m.slice(5)); go('plan'); }
    if (m === 'new') newProjectDialog();
    if (m === 'home') go('projects');
  });
}

export async function projectSettings() {
  const p = S.project;
  const r = await modal({
    title: 'Параметры проекта', content: `
      <label class="field"><span>Название</span><input class="input" name="name" value="${esc(p.name)}" required></label>
      <div class="grid2"><label class="field"><span>Город</span><select class="select" name="city">${CITIES.map(c => `<option ${c.name === p.city ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Тип объекта</span><select class="select" name="kind">${['Квартира', 'Дом'].map(k => `<option ${k === p.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></label></div>
      <label class="field"><span>Этаж квартиры</span><input class="input" type="number" min="1" max="99" name="aptFloor" value="${p.aptFloor || 1}"><small>Нужен для расчёта подъёма материалов</small></label>
      <div class="grid2"><label class="field"><span>Объект</span><select class="select" name="objectType" data-objtype>${Object.entries(OBJECT_TYPES).map(([k, v]) => `<option value="${k}" ${(p.objectType) === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field" data-handover-field ${(p.objectType) === 'newbuild' ? '' : 'hidden'}><span>Отделка от застройщика</span><select class="select" name="handover">${Object.entries(HANDOVER).map(([k, v]) => `<option value="${k}" ${(p.handover) === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label></div>
      <small class="muted" data-handover-hint>${(p.objectType) === 'newbuild' ? HANDOVER[p.handover || 'none'].hint : 'Вторичка: в смету войдут демонтаж старой отделки и вывоз мусора.'}</small>`,
    buttons: [{ label: 'Отмена' }, { label: 'Сохранить', value: 'ok', primary: true }], onMount: w => { const f = w.querySelector('[data-objtype]'), hf = w.querySelector('[data-handover-field]'), hint = w.querySelector('[data-handover-hint]'), hs = w.querySelector('[name=handover]'); const upd = () => { hf.hidden = f.value !== 'newbuild'; hint.textContent = f.value === 'newbuild' ? HANDOVER[hs.value].hint : 'Вторичка: в смету войдут демонтаж старой отделки и вывоз мусора.'; }; f.addEventListener('change', upd); hs.addEventListener('change', upd); },
  });
  if (r.value) commit(x => { x.objectType = r.data.objectType; x.handover = r.data.handover || 'none'; x.name = r.data.name.trim() || x.name; x.city = r.data.city; x.region = cityByName(r.data.city).region; x.kind = r.data.kind; x.aptFloor = Number(r.data.aptFloor) || 1; });
}

export async function newProjectDialog() {
  const detected = detectCity();
  const r = await modal({
    title: 'Новый проект', content: `
      <label class="field"><span>Название</span><input class="input" name="name" value="Моя квартира" required></label>
      <div class="grid2"><label class="field"><span>Город</span><select class="select" name="city">${CITIES.map(c => `<option ${c.name === (detected?.name || 'Самара') ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><small>${detected ? `Определён по часовому поясу: ${esc(detected.name)}. Можно изменить.` : 'Выберите город для цен и расценок'}</small></label>
      <label class="field"><span>Тип</span><select class="select" name="kind"><option>Квартира</option><option>Дом</option></select></label></div>
      <div class="grid2"><label class="field"><span>Объект</span><select class="select" name="objectType" data-objtype>${Object.entries(OBJECT_TYPES).map(([k, v]) => `<option value="${k}" ${('secondary') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field" data-handover-field ${('secondary') === 'newbuild' ? '' : 'hidden'}><span>Отделка от застройщика</span><select class="select" name="handover">${Object.entries(HANDOVER).map(([k, v]) => `<option value="${k}" ${('none') === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label></div>
      <small class="muted" data-handover-hint>${('secondary') === 'newbuild' ? HANDOVER['none' || 'none'].hint : 'Вторичка: в смету войдут демонтаж старой отделки и вывоз мусора.'}</small>
      <div class="field"><span>Начать с</span>
        <label class="check"><input type="radio" name="template" value="sample" checked> Пример планировки 54 м² (2 комнаты, санузел)</label>
        <label class="check"><input type="radio" name="template" value="empty"> Пустого листа</label></div>`,
    buttons: [{ label: 'Отмена' }, { label: 'Создать', value: 'ok', primary: true }], onMount: w => { const f = w.querySelector('[data-objtype]'), hf = w.querySelector('[data-handover-field]'), hint = w.querySelector('[data-handover-hint]'), hs = w.querySelector('[name=handover]'); const upd = () => { hf.hidden = f.value !== 'newbuild'; hint.textContent = f.value === 'newbuild' ? HANDOVER[hs.value].hint : 'Вторичка: в смету войдут демонтаж старой отделки и вывоз мусора.'; }; f.addEventListener('change', upd); hs.addEventListener('change', upd); },
  });
  if (!r.value) return;
  const tpl = r.data.template || 'sample';
  newProject({ name: r.data.name, city: r.data.city, region: cityByName(r.data.city).region, kind: r.data.kind, objectType: r.data.objectType, handover: r.data.handover || 'none', template: tpl === 'empty' ? 'empty' : 'sample' });
  go('plan');
}

async function versionsDialog() {
  const list = versions();
  const r = await modal({
    title: 'История версий', wide: true,
    content: `<p class="muted small">Версия — снимок всего проекта. Отмена/повтор хранит последние 100 действий отдельно.</p>
      ${list.length ? `<div class="table-wrap"><table class="t"><tr><th>Версия</th><th>Дата</th><th></th></tr>${list.map(v => `<tr><td><b>${esc(v.name)}</b></td><td>${dateTimeRu(v.date)}</td><td class="n"><button type="button" class="btn sm" data-restore="${v.id}">Восстановить</button> <button type="button" class="icon-btn" data-del="${v.id}" title="Удалить">${icon('trash', 16)}</button></td></tr>`).join('')}</table></div>` : '<div class="empty">Версий пока нет</div>'}`,
    buttons: [{ label: 'Закрыть' }, { label: 'Сохранить текущую', value: 'save', primary: true }],
    onMount: (w, close) => w.addEventListener('click', e => {
      const rs = e.target.closest('[data-restore]'); if (rs) { restoreVersion(rs.dataset.restore); toast('Версия восстановлена (можно отменить)'); close({ value: null }); }
      const d = e.target.closest('[data-del]'); if (d) { deleteVersion(d.dataset.del); close({ value: null }); versionsDialog(); }
    }),
  });
  if (r.value === 'save') { await saveVersion(); toast('Версия сохранена'); }
}

function userMenu(anchor) {
  if (!S.user) {
    popMenu(anchor, `<div class="meta">${S.server.online ? 'Вы работаете как гость' : 'Сервер недоступен — локальный режим'}</div>
      ${S.server.online ? `<button data-m="login">${icon('user')} Войти</button><button data-m="register">${icon('plus')} Регистрация</button>` : ''}
      <hr><button data-m="theme">${icon('eye')} Тема: ${themeLabel()}</button>`, m => m === 'theme' ? toggleTheme() : authDialog(m));
    return;
  }
  popMenu(anchor, `<div class="meta">${esc(S.user.email)}</div>
    <button data-m="theme">${icon('eye')} Тема: ${themeLabel()}</button>
    <button data-m="export">${icon('download')} Выгрузить мои данные</button>
    <button data-m="delete">${icon('trash')} Удалить аккаунт и данные</button>
    <hr><button data-m="logout">${icon('logout')} Выйти</button>`, async m => {
    if (m === 'theme') toggleTheme();
    if (m === 'logout') { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); S.user = null; emit(); toast('Вы вышли'); if (['projects', 'landing'].includes(S.ui.page)) { history.replaceState(null, '', '#/'); route(); } }
    if (m === 'export') { const data = await api('/api/auth/export'); const { download } = await import('./core/export.js'); download('domproekt-data.json', JSON.stringify(data, null, 2), 'application/json'); }
    if (m === 'delete') {
      const r = await modal({ title: 'Удалить аккаунт', content: '<p>Аккаунт, проекты на сервере, версии и загруженные файлы будут удалены без возможности восстановления. Копия на этом устройстве останется.</p><label class="field"><span>Введите «удалить» для подтверждения</span><input class="input" name="c" required></label>', buttons: [{ label: 'Отмена' }, { label: 'Удалить', value: 'ok', danger: true }] });
      if (r.value && r.data.c.trim().toLowerCase() === 'удалить') { await api('/api/auth/account', { method: 'DELETE' }); S.user = null; emit(); toast('Аккаунт удалён'); }
    }
  });
}

const themeLabel = () => ({ light: 'светлая', dark: 'тёмная' }[document.documentElement.dataset.theme] || 'как в системе');
function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const next = !cur ? 'light' : cur === 'light' ? 'dark' : '';
  if (next) document.documentElement.dataset.theme = next; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('dp.theme', next); } catch {}
  emit();
}

export async function authDialog(mode = 'login', reason = '') {
  if (!S.server.online) { toast('Сервер недоступен: работа идёт в локальном режиме'); return false; }
  const reg = mode === 'register';
  const r = await modal({
    title: reg ? 'Регистрация' : 'Вход',
    content: `${reason ? `<div class="notice accent">${icon('lock')}<span>${esc(reason)}</span></div>` : ''}
      ${reg ? '<label class="field"><span>Имя</span><input class="input" name="name" autocomplete="name"></label>' : ''}
      <label class="field"><span>Эл. почта</span><input class="input" type="email" name="email" required autocomplete="email"></label>
      <label class="field"><span>Пароль</span><input class="input" type="password" name="password" required minlength="8" autocomplete="${reg ? 'new-password' : 'current-password'}"><small>${reg ? 'Не короче 8 символов' : ''}</small></label>
      ${reg ? '<label class="check"><input type="checkbox" name="consent" required> Согласен на обработку персональных данных (152-ФЗ)</label>' : ''}
      <p class="small muted">${reg ? 'Уже есть аккаунт?' : 'Нет аккаунта?'} <a href="#" data-switch>${reg ? 'Войти' : 'Зарегистрироваться'}</a></p>`,
    buttons: [{ label: 'Отмена' }, { label: reg ? 'Создать аккаунт' : 'Войти', value: 'ok', primary: true }],
    onMount: (w, close) => w.querySelector('[data-switch]').addEventListener('click', e => { e.preventDefault(); close({ value: 'switch' }); }),
  });
  if (r.value === 'switch') return authDialog(reg ? 'login' : 'register', reason);
  if (!r.value) return false;
  try {
    const res = await api(`/api/auth/${reg ? 'register' : 'login'}`, { method: 'POST', body: r.data });
    S.user = res.user; toast(reg ? 'Аккаунт создан' : 'Вы вошли');
    await syncFromServer();
    if (S.project) { const { persist } = await import('./store.js'); persist(true); }
    emit();
    return true;
  } catch (e) { toast(e.message, 'err'); return authDialog(mode, reason); }
}

export async function requireFeature(feature, reason) {
  if (can(feature)) return true;
  return authDialog('register', reason || 'Для этого действия нужна регистрация: гость может только строить планировку.');
}

// ——— Горячие клавиши ———
document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});

// ——— Подписка на изменения ———
subscribe(what => {
  if (what === 'status') return updateStatusOnly();
  renderTopbar();
  if (what === 'canvas') return current?.update?.('canvas');
  current?.update?.(what);
});

window.addEventListener('hashchange', route);

(async function boot() {
  try { const t = localStorage.getItem('dp.theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
  loadInitial();
  route();
  const h = await health();
  S.server = { online: !!h, providers: h?.providers || {} };
  if (h) { await refreshUser(); await syncFromServer(); await loadServerCatalog({ silent: true }); }
  S.saveState = S.user ? 'saved' : 'local';
  // Ключи ИИ есть на сервере, а провайдер не выбирали вручную — включаем ИИ вместо встроенного подборщика
  const prov = S.server.providers || {};
  if (S.project && S.project.brief.provider === 'local' && !S.project.brief.providerTouched && (prov.gemini || prov.openai)) {
    commit(p => { p.brief.provider = prov.gemini ? 'gemini' : 'openai'; });
  }
  emit('status');
  // После входа/проверки сессии перерисовываем главную: гость — промо, пользователь — проекты
  // Перемонтируем, только если страница должна смениться: повторный запуск промо-главной перезапускал все анимации
  const homePage = S.user ? 'projects' : 'landing';
  if (['landing', 'projects'].includes(S.ui.page) && !location.hash.startsWith('#/projects') && S.ui.page !== homePage) route();
  else current?.update?.('server');
})();
