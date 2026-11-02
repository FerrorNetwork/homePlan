// Шаг 2. Инженерия: точки электрики/воды/отопления/вентиляции, трассы, группы и щиток, проверки, ведомости.
import { S, commit } from '../store.js';
import { createEditor } from './editor.js';
import { completeStep } from '../main.js';
import { esc, icon, toast, num, modal, confirmDialog } from '../ui.js';
import { POINT_KINDS, SYSTEMS, DEFAULT_RULES, groupLoad, routeLength, uid, roomAt } from '../core/model.js';
import { checkEngineering } from '../core/rules.js';
import { orthoPath, fmtM } from '../core/geometry.js';
import { printDocument, svgString } from '../core/export.js';
import { symbolIcon } from './symbols.js';
import { autoWire } from '../core/wiring.js';

const opt = { pointKind: 'socket', routeSystem: 'auto', via: 'wall', filter: 'all' };
const GROUPS_OF_KINDS = [
  ['Электрика', ['socket', 'socket-kitchen', 'socket-power', 'switch', 'light', 'wall-light', 'panel', 'junction']],
  ['Вода и канализация', ['sink', 'kitchen-sink', 'bath', 'shower', 'toilet', 'washer', 'dishwasher', 'collector', 'riser']],
  ['Отопление', ['radiator', 'boiler']],
  ['Вентиляция', ['vent-channel', 'hood']],
];
const TOOLS = [
  { id: 'select', icon: 'cursor', tip: 'Выбор и перемещение', key: 'V' }, '|',
  { id: 'point', icon: 'socket', tip: 'Поставить точку', key: 'T' },
  { id: 'route', icon: 'pipe', tip: 'Проложить трассу между точками', key: 'L' },
  { id: 'loop', icon: 'fire', tip: 'Контур тёплого пола' }, '|',
  { id: 'measure', icon: 'ruler', tip: 'Рулетка', key: 'M' },
];
const HINTS = {
  point: 'Выберите тип точки справа и кликните на плане. Высота монтажа задаётся в инспекторе.',
  route: 'Кликните по начальной точке, затем по конечной — трасса проляжет под прямым углом. Клик в пустое место — излом.',
  loop: 'Растяните прямоугольник контура тёплого пола внутри помещения.',
  measure: 'Кликните две точки, чтобы измерить расстояние.',
};

export function mount(el) {
  try { S.ui.gostView = localStorage.getItem('dp.gostView') === '1'; } catch {}
  let issues = [];
  const recheck = () => { issues = checkEngineering(S.project); };
  recheck();
  const ed = createEditor(el, {
    mode: 'engineering', tools: TOOLS, hints: HINTS, inspector, bindInspector,
    extraBar: () => `<div class="seg" data-drawmode><button data-dm="scheme" class="${S.ui.gostView ? '' : 'on'}">${icon('layers', 15)} Схема</button><button data-dm="gost" class="${S.ui.gostView ? 'on' : ''}">${icon('ruler', 15)} Чертёж ГОСТ</button></div>`,
    getIssues: () => issues, showIssueMarks: true,
    selectable: t => ['point', 'route', 'loop'].includes(t),
    canvasOpts: {
      gost: () => !!S.ui.gostView,
      pointKind: () => opt.pointKind,
      routeVia: () => opt.via,
      routeSystem: from => {
        if (opt.routeSystem !== 'auto') return opt.routeSystem;
        const sys = POINT_KINDS[from.kind]?.system;
        if (sys === 'water') return ['riser', 'toilet'].includes(from.kind) ? 'sewer' : 'cold';
        return sys || 'electric';
      },
      defaultGroup: kind => {
        const p = S.project; const k = POINT_KINDS[kind]; if (k.system !== 'electric' || ['panel', 'junction'].includes(kind)) return null;
        const want = ['light', 'wall-light', 'switch'].includes(kind) ? 'light' : kind === 'socket-power' ? 'power' : 'sockets';
        return p.groups.find(g => g.kind === want)?.id || null;
      },
      onDelete: sel => { if (['point', 'route', 'loop'].includes(sel.type)) ed.canvas.deleteSelection(); else toast('Стены и помещения редактируются на шаге «Планировка»'); return true; },
    },
    onRefresh: () => {},
  });
  // Переключение «Схема / Чертёж ГОСТ»
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-dm]'); if (!b) return;
    S.ui.gostView = b.dataset.dm === 'gost';
    try { localStorage.setItem('dp.gostView', S.ui.gostView ? '1' : ''); } catch {}
    el.querySelectorAll('[data-dm]').forEach(x => x.classList.toggle('on', x === b));
    ed.canvas.render();
  });
  const keyMap = { v: 'select', t: 'point', l: 'route', m: 'measure' };
  const onKey = e => { if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey) return; const t = keyMap[e.key.toLowerCase()]; if (t) ed.setTool(t); };
  document.addEventListener('keydown', onKey);

  function inspector({ tool, selection }) {
    const p = S.project, s = selection;
    if (s?.type === 'point') return pointPanel(p, p.points.find(x => x.id === s.id));
    if (s?.type === 'route') return routePanel(p, p.routes.find(x => x.id === s.id));
    if (s?.type === 'loop') return loopPanel(p, p.heatingLoops.find(x => x.id === s.id));
    let html = '';
    if (tool === 'point') html += `<section><h4>Тип точки</h4>${GROUPS_OF_KINDS.map(([name, kinds]) => `<div class="tiny muted" style="margin:8px 0 6px;font-weight:700">${name}</div><div class="palette-grid">${kinds.map(k => `<button class="pal-item ${opt.pointKind === k ? 'on' : ''}" data-kind="${k}">${symbolIcon(k, 22)}<span>${POINT_KINDS[k].name}</span></button>`).join('')}</div>`).join('')}</section>`;
    if (tool === 'route') html += `<section><h4>Трасса</h4><div class="stack tight">
      <div class="field"><span>Система</span><div class="palette-grid">${[['auto', 'По точке'], ['electric', 'Кабель'], ['cold', 'ХВС'], ['hot', 'ГВС'], ['sewer', 'Канализация'], ['heating', 'Отопление'], ['vent', 'Воздуховод']].map(([k, n]) => `<button class="pal-item ${opt.routeSystem === k ? 'on' : ''}" data-rsys="${k}">${k !== 'auto' ? `<span class="dot" style="background:${SYSTEMS[k].color}"></span>` : ''}${n}</button>`).join('')}</div></div>
      <div class="field"><span>Прокладка</span><div class="seg sm">${[['wall', 'По стене'], ['ceiling', 'По потолку'], ['floor', 'В полу']].map(([k, n]) => `<button class="${opt.via === k ? 'on' : ''}" data-via="${k}">${n}</button>`).join('')}</div></div>
    </div></section>`;
    html += checksPanel(p) + groupsPanel(p) + ledgerPanel(p) + legendPanel() + footer(p);
    return html;
  }

  function pointPanel(p, pt) {
    if (!pt) return '';
    const K = POINT_KINDS[pt.kind]; const room = roomAt(p, pt, pt.floor);
    const own = issues.filter(i => i.refs?.includes(pt.id));
    return `<section><h4>${esc(K.name)} <button class="icon-btn" data-act="deselect">${icon('close', 16)}</button></h4><div class="stack tight">
      <div class="small muted">${room ? esc(room.name) : 'Вне помещений'} · x ${pt.x}, y ${pt.y}</div>
      <div class="prop-grid">
        <label class="field"><span>Тип</span><select class="select sm" data-pt="kind">${Object.entries(POINT_KINDS).filter(([, v]) => v.system === K.system).map(([k, v]) => `<option value="${k}" ${k === pt.kind ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
        <label class="field"><span>Высота от пола, мм</span><input class="input sm num" type="number" min="0" max="6000" step="10" data-pt="h" value="${pt.h ?? K.h}"></label>
        ${K.system === 'electric' || K.power ? `<label class="field"><span>Мощность, Вт</span><input class="input sm num" type="number" min="0" step="10" data-pt="power" value="${pt.power || 0}"></label>` : ''}
        ${K.system === 'heating' && pt.kind === 'radiator' ? `<label class="field"><span>Теплоотдача, Вт</span><input class="input sm num" type="number" step="50" data-pt="heat" value="${pt.heat || K.heat}"></label>` : ''}
        ${K.system === 'electric' && !['panel', 'junction'].includes(pt.kind) ? `<label class="field"><span>Группа (линия)</span><select class="select sm" data-pt="group"><option value="">— не назначена —</option>${p.groups.map(g => `<option value="${g.id}" ${pt.group === g.id ? 'selected' : ''}>${esc(g.name)} · ${g.breaker} А</option>`).join('')}</select></label>` : ''}
      </div>
      ${K.needs ? `<div class="small"><b>Подводка:</b> ${K.needs.map(n => { const ok = p.routes.some(r => r.system === n && (r.from === pt.id || r.to === pt.id)); return `<span class="badge ${ok ? 'ok' : 'warn'}">${SYSTEMS[n].name}</span>`; }).join(' ')}</div>
        <button class="btn sm" data-act="connect-riser">${icon('pipe', 14)} Подвести к ближайшему стояку/коллектору</button>` : ''}
      ${own.length ? `<div class="issues">${own.map(issueHtml).join('')}</div>` : ''}
      <button class="btn sm danger" data-act="delete">${icon('trash', 14)} Удалить точку</button>
    </div></section>`;
  }
  function routePanel(p, r) {
    if (!r) return '';
    const L = routeLength(r);
    return `<section><h4>Трасса · ${SYSTEMS[r.system].name} <button class="icon-btn" data-act="deselect">${icon('close', 16)}</button></h4><div class="stack tight">
      <dl class="stat-list"><dt>Длина по плану</dt><dd>${fmtM(L)} м</dd><dt>Изломов</dt><dd>${Math.max(0, r.path.length - 2)}</dd>${r.system === 'sewer' ? `<dt>Перепад</dt><dd>${Math.round(L * (r.slope || 0) / 100)} мм</dd>` : ''}</dl>
      <div class="prop-grid">
        <label class="field"><span>Система</span><select class="select sm" data-rt="system">${Object.entries(SYSTEMS).map(([k, v]) => `<option value="${k}" ${r.system === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
        <label class="field"><span>Прокладка</span><select class="select sm" data-rt="via">${[['wall', 'По стене'], ['ceiling', 'По потолку'], ['floor', 'В полу']].map(([k, n]) => `<option value="${k}" ${r.via === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>Добавка по вертикали, мм</span><input class="input sm num" type="number" step="50" min="0" data-rt="vertical" value="${r.vertical || 0}"></label>
        ${r.system === 'sewer' ? `<label class="field"><span>Уклон, %</span><input class="input sm num" type="number" step="0.5" min="0" data-rt="slope" value="${r.slope || 0}"></label>` : ''}
        ${r.system === 'electric' ? `<label class="field"><span>Группа</span><select class="select sm" data-rt="group"><option value="">—</option>${p.groups.map(g => `<option value="${g.id}" ${r.group === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>` : ''}
      </div>
      <button class="btn sm" data-act="reroute">${icon('refresh', 14)} Сменить порядок излома</button>
      <button class="btn sm danger" data-act="delete">${icon('trash', 14)} Удалить трассу</button>
    </div></section>`;
  }
  function loopPanel(p, lp) {
    if (!lp) return '';
    const area = lp.w * lp.h / 1e6, pipe = area * 1000 / (lp.step || 150);
    return `<section><h4>Тёплый пол <button class="icon-btn" data-act="deselect">${icon('close', 16)}</button></h4><div class="stack tight">
      <dl class="stat-list"><dt>Площадь контура</dt><dd>${num(area, 2)} м²</dd><dt>Длина трубы ≈</dt><dd>${num(pipe, 0)} м</dd></dl>
      ${pipe > 100 ? `<div class="notice warn">${icon('alert')}<span>Длина контура больше 100 м — разбейте на два контура.</span></div>` : ''}
      <label class="field"><span>Шаг укладки, мм</span><select class="select sm" data-loop="step">${[100, 150, 200, 250].map(v => `<option ${+lp.step === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <button class="btn sm danger" data-act="delete">${icon('trash', 14)} Удалить контур</button></div></section>`;
  }

  function groupsPanel(p) {
    const loads = p.groups.map(g => ({ g, L: groupLoad(p, g) }));
    const total = loads.reduce((s, x) => s + x.L.design, 0);
    return `<section><h4>Группы и щиток <span class="muted">${num(total / 1000, 1)} кВт</span></h4>
      <div class="stack tight">${loads.map(({ g, L }) => `<div class="list-btn" style="cursor:default;display:block">
        <div class="row between"><input class="input sm" style="border:0;padding:0;height:22px;font-weight:700;background:none" data-grp="name" data-id="${g.id}" value="${esc(g.name)}"><button class="icon-btn" data-del-group="${g.id}" title="Удалить группу">${icon('trash', 14)}</button></div>
        <div class="row" style="gap:6px;margin-top:6px">
          <select class="select sm" data-grp="breaker" data-id="${g.id}" style="width:74px">${[6, 10, 16, 20, 25, 32, 40].map(a => `<option value="${a}" ${g.breaker === a ? 'selected' : ''}>${a} А</option>`).join('')}</select>
          <select class="select sm" data-grp="cable" data-id="${g.id}" style="width:84px">${['3×1,5', '3×2,5', '3×4', '3×6', '3×10'].map(c => `<option ${g.cable === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
          <select class="select sm" data-grp="kind" data-id="${g.id}" style="flex:1">${[['sockets', 'Розетки'], ['light', 'Свет'], ['power', 'Силовая']].map(([k, n]) => `<option value="${k}" ${g.kind === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
        </div>
        <div class="row between small" style="margin-top:6px"><label class="check small"><input type="checkbox" data-grp="rcd" data-id="${g.id}" ${g.rcd ? 'checked' : ''}> УЗО 30 мА</label>
          <span class="mono ${L.overload ? 'diff-up' : 'muted'}">${L.points} т · ${num(L.design / 1000, 2)} кВт · ${num(L.current, 1)} А</span></div>
        <div class="progress" style="margin-top:6px"><i style="width:${Math.min(100, L.current / g.breaker * 100)}%;background:${L.overload ? 'var(--err)' : 'var(--accent)'}"></i></div>
      </div>`).join('')}
      <div class="row wrap"><button class="btn sm" data-act="add-group">${icon('plus', 14)} Группа</button><button class="btn sm" data-act="panel-scheme">${icon('bolt', 14)} Схема щитка</button><button class="btn sm" data-act="autowire" title="Проложить кабели от щитка по группам">${icon('pipe', 14)} Развести кабели</button></div>
      <p class="tiny muted">Ток группы = мощность × коэффициент одновременности (0,7 для розеточных групп от 4 точек) / 230 В.</p></div></section>`;
  }

  function checksPanel(p) {
    const filt = opt.filter;
    const list = issues.filter(i => filt === 'all' || i.level === filt);
    const counts = { error: issues.filter(i => i.level === 'error').length, warn: issues.filter(i => i.level === 'warn').length, info: issues.filter(i => i.level === 'info').length };
    return `<section><h4>Проверки <button class="btn sm ghost" data-act="rules">${icon('settings', 14)} Правила</button></h4>
      <div class="seg sm" style="margin-bottom:10px">${[['all', `Все ${issues.length}`], ['error', `Ошибки ${counts.error}`], ['warn', `Предупр. ${counts.warn}`], ['info', `Советы ${counts.info}`]].map(([k, n]) => `<button class="${filt === k ? 'on' : ''}" data-filter="${k}">${n}</button>`).join('')}</div>
      <div class="issues">${list.length ? list.slice(0, 40).map(issueHtml).join('') : `<div class="issue ok">${icon('check', 16)}<span>Замечаний нет</span></div>`}</div>
      <p class="tiny muted" style="margin-top:8px">Правила — настраиваемые подсказки по мотивам ПУЭ и СП, не замена проекту. Предупреждения не блокируют работу.</p></section>`;
  }
  function issueHtml(i) { return `<div class="issue ${i.level}" ${i.refs?.[0] ? `data-focus="${i.refs[0]}"` : ''}>${icon(i.level === 'info' ? 'info' : 'alert', 15)}<span>${esc(i.text)}</span></div>`; }

  function ledgerPanel(p) {
    const bySys = {};
    for (const r of p.routes) bySys[r.system] = (bySys[r.system] || 0) + routeLength(r);
    const counts = {};
    for (const pt of p.points) counts[pt.kind] = (counts[pt.kind] || 0) + 1;
    return `<section><h4>Ведомость</h4>
      <dl class="stat-list">${Object.entries(counts).map(([k, n]) => `<dt>${POINT_KINDS[k]?.name}</dt><dd>${n} шт</dd>`).join('')}</dl>
      <div style="height:10px"></div>
      <dl class="stat-list">${Object.keys(SYSTEMS).map(k => `<dt><span class="dot" style="background:${SYSTEMS[k].color}"></span> ${SYSTEMS[k].name}</dt><dd>${fmtM(bySys[k] || 0, 1)} м</dd>`).join('')}</dl>
      <div class="stack tight" style="margin-top:12px"><button class="btn sm primary" data-act="export-gost">${icon('print', 14)} Комплект листов ГОСТ (PDF, A3)</button><div class="tiny muted">План ЭОМ, схема щита, план ВК${p.points.some(x => x.kind === 'radiator') ? ', план ОВ' : ''}, спецификация — с рамкой и основной надписью по ГОСТ Р 21.101.</div>
        <div class="row wrap"><button class="btn sm" data-act="export-el">${icon('print', 14)} Цветной план электрики</button><button class="btn sm" data-act="export-water">${icon('print', 14)} Цветной план сантехники</button></div></div></section>`;
  }

  function legendPanel() {
    return `<section><h4>Условные обозначения</h4><div class="palette-grid">${GROUPS_OF_KINDS.flatMap(([, kinds]) => kinds).map(k => `<div class="pal-item" style="cursor:default">${symbolIcon(k, 20)}<span>${POINT_KINDS[k].name}</span></div>`).join('')}</div>
      <div class="stack tight small" style="margin-top:10px">${Object.entries(SYSTEMS).map(([k, v]) => `<div class="row"><svg width="34" height="8"><line x1="0" y1="4" x2="34" y2="4" stroke="${v.color}" stroke-width="${k === 'sewer' ? 5 : 3}"/></svg>${v.name}</div>`).join('')}
      <div class="row"><svg width="34" height="8"><line x1="0" y1="4" x2="34" y2="4" stroke="#888" stroke-width="3" stroke-dasharray="6 4"/></svg>по потолку</div><div class="row"><svg width="34" height="8"><line x1="0" y1="4" x2="34" y2="4" stroke="#888" stroke-width="3" stroke-dasharray="2 3"/></svg>в полу</div></div></section>`;
  }

  function footer(p) {
    return `<div class="step-footer"><button class="btn" data-act="skip" title="Смета будет без инженерных работ">Пропустить</button><button class="btn primary" data-act="complete">Сохранить и продолжить ${icon('arrowRight', 15)}</button></div>`;
  }

  function bindInspector(insp, { canvas }) {
    insp.onclick = async e => {
      const b = e.target.closest('button, [data-focus]'); if (!b) return;
      const s = S.ui.selection;
      if (b.dataset.kind) { opt.pointKind = b.dataset.kind; ed.setTool('point'); return; }
      if (b.dataset.rsys) { opt.routeSystem = b.dataset.rsys; ed.renderInspector(); return; }
      if (b.dataset.via) { opt.via = b.dataset.via; ed.renderInspector(); return; }
      if (b.dataset.filter) { opt.filter = b.dataset.filter; ed.renderInspector(); return; }
      if (b.dataset.focus) { const id = b.dataset.focus; const p = S.project; const type = p.points.some(x => x.id === id) ? 'point' : p.routes.some(x => x.id === id) ? 'route' : null; if (type) canvas.select({ type, id }); return; }
      if (b.dataset.delGroup) { const id = b.dataset.delGroup; commit(p => { p.groups = p.groups.filter(g => g.id !== id); p.points.forEach(x => { if (x.group === id) x.group = null; }); }); return; }
      const a = b.dataset.act;
      if (a === 'deselect') canvas.select(null);
      if (a === 'delete') canvas.deleteSelection();
      if (a === 'add-group') commit(p => p.groups.push({ id: uid('g'), name: `Группа ${p.groups.length + 1}`, breaker: 16, kind: 'sockets', rcd: true, cable: '3×2,5' }));
      if (a === 'reroute' && s) commit(p => { const r = p.routes.find(x => x.id === s.id); const a0 = r.path[0], b0 = r.path.at(-1); r.path = orthoPath(a0, b0, r.path[1] && Math.abs(r.path[1].y - a0.y) < 1 ? 'v' : 'h'); });
      if (a === 'connect-riser' && s) connectToRiser(s.id);
      if (a === 'autowire') {
        if (!S.project.points.some(x => x.kind === 'panel')) return toast('Сначала поставьте щиток');
        const manual = S.project.routes.filter(r => r.system === 'electric' && !r.auto).length;
        commit(p => { p.routes = p.routes.filter(r => !(r.system === 'electric' && r.auto)); p.routes.push(...autoWire(p)); });
        toast('Кабели разведены по группам' + (manual ? ' (ручные трассы сохранены)' : '') + '. Трассы можно править ручками изломов.');
      }
      if (a === 'rules') rulesDialog();
      if (a === 'panel-scheme') panelDialog();
      if (a === 'export-el') exportPlanPdf(canvas, 'electric');
      if (a === 'export-gost') { const { buildGostSheets, printSheets } = await import('./gostsheets.js'); printSheets(`${S.project.name} — чертежи`, buildGostSheets(S.project, canvas, { panelSvg })); }
      if (a === 'export-water') exportPlanPdf(canvas, 'water');
      if (a === 'complete') { if (issues.some(i => i.level === 'error') && !(await confirmDialog('Есть ошибки проверок', `Найдено ошибок: ${issues.filter(i => i.level === 'error').length}. Продолжить? Их можно исправить позже.`, 'Продолжить'))) return; completeStep('engineering'); }
      if (a === 'skip') { if (await confirmDialog('Пропустить инженерию?', 'Смета будет без электромонтажных и сантехнических работ, с предупреждением. Вернуться к шагу можно в любой момент.', 'Пропустить')) completeStep('engineering', { skip: true }); }
    };
    insp.onchange = e => {
      const t = e.target, s = S.ui.selection;
      if (t.dataset.pt && s) commit(p => { const pt = p.points.find(x => x.id === s.id); const k = t.dataset.pt; if (k === 'kind') { pt.kind = t.value; pt.h = POINT_KINDS[t.value].h; pt.power = POINT_KINDS[t.value].power || 0; } else if (k === 'group') pt.group = t.value || null; else pt[k] = Number(t.value) || 0; });
      if (t.dataset.rt && s) commit(p => { const r = p.routes.find(x => x.id === s.id); const k = t.dataset.rt; r[k] = ['slope', 'vertical'].includes(k) ? Number(t.value) || 0 : k === 'group' ? (t.value || null) : t.value; });
      if (t.dataset.loop && s) commit(p => { p.heatingLoops.find(x => x.id === s.id).step = +t.value; });
      if (t.dataset.grp) commit(p => { const g = p.groups.find(x => x.id === t.dataset.id); const k = t.dataset.grp; g[k] = k === 'rcd' ? t.checked : k === 'breaker' ? +t.value : t.value; });
    };
  }

  function connectToRiser(id) {
    const p = S.project; const pt = p.points.find(x => x.id === id); if (!pt) return;
    const sources = p.points.filter(x => x.floor === pt.floor && ['riser', 'collector'].includes(x.kind));
    if (!sources.length) return toast('Поставьте на плане стояк или коллектор');
    const near = sources.sort((a, b) => Math.hypot(a.x - pt.x, a.y - pt.y) - Math.hypot(b.x - pt.x, b.y - pt.y))[0];
    const missing = POINT_KINDS[pt.kind].needs.filter(n => !p.routes.some(r => r.system === n && (r.from === pt.id || r.to === pt.id)));
    if (!missing.length) return toast('Все подводки уже проложены');
    commit(pp => { for (const sys of missing) pp.routes.push({ id: uid('rt'), floor: pt.floor, system: sys, from: near.id, to: pt.id, path: orthoPath({ x: near.x, y: near.y }, { x: pt.x, y: pt.y }, sys === 'sewer' ? 'h' : 'v'), via: sys === 'sewer' ? 'floor' : 'wall', slope: sys === 'sewer' ? 2 : 0 }); });
    toast(`Проложено: ${missing.map(m => SYSTEMS[m].name).join(', ')}`);
  }

  async function rulesDialog() {
    const R = S.project.rules;
    const fields = [['socketFromWater', 'Розетка от раковины/ванны/душа, мм'], ['socketFromStove', 'Розетка от силовой точки плиты, мм'], ['maxPointsPerGroup', 'Макс. точек на группу'], ['sewerSlopeMin', 'Мин. уклон канализации, %'], ['sewerMaxLength', 'Макс. длина отвода до стояка, мм'], ['passageMin', 'Мин. проход между мебелью, мм'], ['doorClearance', 'Зона открывания двери, мм']];
    const r = await modal({ title: 'Набор правил проверки', content: `<p class="small muted">Значения по умолчанию — ориентиры по мотивам ПУЭ 7-го изд., СП 30.13330 и СП 54.13330. Уточняйте у проектировщика для вашего объекта.</p><div class="grid2">${fields.map(([k, n]) => `<label class="field"><span>${n}</span><input class="input num" type="number" step="any" name="${k}" value="${R[k]}"><small>по умолчанию ${DEFAULT_RULES[k]}</small></label>`).join('')}</div>`, buttons: [{ label: 'Сбросить', value: 'reset' }, { label: 'Отмена' }, { label: 'Сохранить', value: 'ok', primary: true }] });
    if (r.value === 'reset') commit(p => { p.rules = { ...DEFAULT_RULES }; });
    if (r.value === 'ok') commit(p => { for (const [k] of fields) p.rules[k] = Number(r.data[k]) || DEFAULT_RULES[k]; });
  }

  async function panelDialog() {
    await modal({ title: 'Принципиальная схема щитка', wide: true, content: `<div style="overflow:auto">${panelSvg(S.project)}</div><p class="tiny muted">Однолинейная схема для передачи электрику. Номиналы и сечения — по данным групп; проверьте по ПУЭ и выделенной мощности.</p>`, buttons: [{ label: 'Закрыть' }, { label: 'Печать / PDF', value: 'print', primary: true }] })
      .then(r => { if (r.value === 'print') printDocument('Схема щитка', `<h1>Схема щитка · ${esc(S.project.name)}</h1>${panelSvg(S.project)}${groupTable(S.project)}`); });
  }

  async function exportPlanPdf(canvas, kind) {
    const p = S.project; const saved = { ...p.layers };
    const only = kind === 'electric' ? { electric: true, water: false, sewer: false, heating: false, vent: false } : { electric: false, water: true, sewer: true, heating: true, vent: true };
    Object.assign(p.layers, only, { furniture: false }); canvas.render();
    const svg = svgString(canvas.svg);
    Object.assign(p.layers, saved); canvas.render();
    const pts = p.points.filter(x => kind === 'electric' ? POINT_KINDS[x.kind]?.system === 'electric' : POINT_KINDS[x.kind]?.system !== 'electric');
    printDocument(kind === 'electric' ? 'План электрики' : 'План сантехники', `<h1>${kind === 'electric' ? 'План электрики' : 'План водоснабжения, канализации, отопления и вентиляции'}</h1><div class="muted">${esc(p.name)} · ${esc(p.city)} · ${new Date().toLocaleDateString('ru-RU')}</div>
      <div class="box">${svg}</div>
      <h2>Ведомость точек</h2><table><tr><th>№</th><th>Тип</th><th>Помещение</th><th class="n">Высота, мм</th>${kind === 'electric' ? '<th>Группа</th><th class="n">Мощность, Вт</th>' : ''}</tr>
      ${pts.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(POINT_KINDS[x.kind]?.name)}</td><td>${esc(roomAt(p, x, x.floor)?.name || '—')}</td><td class="n">${x.h ?? ''}</td>${kind === 'electric' ? `<td>${esc(p.groups.find(g => g.id === x.group)?.name || '—')}</td><td class="n">${x.power || 0}</td>` : ''}</tr>`).join('')}</table>
      <h2>Длины трасс</h2><table><tr><th>Система</th><th class="n">Длина, м</th></tr>${Object.entries(SYSTEMS).filter(([k]) => kind === 'electric' ? k === 'electric' : k !== 'electric').map(([k, v]) => `<tr><td>${v.name}</td><td class="n">${(p.routes.filter(r => r.system === k).reduce((s, r) => s + routeLength(r), 0) / 1000).toFixed(1)}</td></tr>`).join('')}</table>
      ${kind === 'electric' ? `<h2 class="pb">Схема щитка</h2>${panelSvg(p)}${groupTable(p)}` : ''}
      <h2>Замечания проверки</h2>${issues.length ? `<ul>${issues.map(i => `<li>${esc(i.text)}</li>`).join('')}</ul>` : '<p>Нет</p>'}
      <p class="muted">Эскиз для обсуждения с мастером. Не является проектной документацией.</p>`);
  }

  return {
    update(what) { if (what === 'server') return; recheck(); ed.refresh(what); },
    destroy() { document.removeEventListener('keydown', onKey); ed.destroy(); },
  };
}

const colorOf = k => { const s = POINT_KINDS[k].system; return s === 'water' ? SYSTEMS.cold.color : SYSTEMS[s]?.color; };

function groupTable(p) {
  return `<table><tr><th>№</th><th>Группа</th><th class="n">Автомат</th><th>Кабель</th><th>УЗО</th><th class="n">Точек</th><th class="n">Расч. мощн., кВт</th><th class="n">Ток, А</th></tr>${p.groups.map((g, i) => { const L = groupLoad(p, g); return `<tr><td>QF${i + 1}</td><td>${esc(g.name)}</td><td class="n">C${g.breaker}</td><td>ВВГнг-LS ${g.cable}</td><td>${g.rcd ? '30 мА' : '—'}</td><td class="n">${L.points}</td><td class="n">${(L.design / 1000).toFixed(2)}</td><td class="n">${L.current.toFixed(1)}</td></tr>`; }).join('')}</table>`;
}

export function panelSvg(p) {
  const n = p.groups.length; const W = Math.max(520, 120 + n * 110), H = 330;
  const total = p.groups.reduce((s, g) => s + groupLoad(p, g).design, 0);
  const mainA = Math.max(25, [25, 32, 40, 50, 63].find(a => a >= total / 230 * 1.1) || 63);
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" style="font-family:Manrope,sans-serif;font-size:11px;background:#fff;color:#1d1c19">`];
  out.push(`<text x="20" y="22" font-weight="700" font-size="13">Ввод ~230 В · расчётная мощность ${(total / 1000).toFixed(1)} кВт</text>`);
  out.push(`<line x1="60" y1="40" x2="60" y2="70" stroke="#1d1c19" stroke-width="2"/><rect x="45" y="70" width="30" height="40" fill="none" stroke="#1d1c19" stroke-width="2"/><text x="82" y="94">QS ввод ${mainA} А</text>`);
  out.push(`<line x1="60" y1="110" x2="60" y2="130" stroke="#1d1c19" stroke-width="2"/><line x1="60" y1="130" x2="${100 + (n - 1) * 110 + 20}" y2="130" stroke="#1d1c19" stroke-width="3"/>`);
  p.groups.forEach((g, i) => {
    const x = 120 + i * 110; const L = groupLoad(p, g);
    out.push(`<line x1="${x}" y1="130" x2="${x}" y2="150" stroke="#1d1c19" stroke-width="2"/>`);
    let y = 150;
    if (g.rcd) { out.push(`<rect x="${x - 14}" y="${y}" width="28" height="30" rx="4" fill="#e3ecf6" stroke="#36679b"/><text x="${x}" y="${y + 19}" text-anchor="middle" font-size="9">УЗО</text>`); y += 30; out.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 10}" stroke="#1d1c19" stroke-width="2"/>`); y += 10; }
    out.push(`<rect x="${x - 14}" y="${y}" width="28" height="34" fill="${L.overload ? '#f8e2df' : '#fff'}" stroke="#1d1c19" stroke-width="2"/><text x="${x}" y="${y + 21}" text-anchor="middle" font-weight="700">C${g.breaker}</text>`);
    y += 34;
    out.push(`<line x1="${x}" y1="${y}" x2="${x}" y2="250" stroke="#1d1c19" stroke-width="2" stroke-dasharray="${g.kind === 'light' ? '4 3' : '0'}"/><text x="${x}" y="266" text-anchor="middle" font-weight="700">QF${i + 1}</text>`);
    out.push(`<text x="${x}" y="282" text-anchor="middle">${esc(g.name.slice(0, 16))}</text><text x="${x}" y="296" text-anchor="middle" fill="#7b7569">${g.cable} · ${L.points} т</text><text x="${x}" y="310" text-anchor="middle" fill="${L.overload ? '#b4413a' : '#7b7569'}">${(L.design / 1000).toFixed(2)} кВт · ${L.current.toFixed(1)} А</text>`);
  });
  out.push('</svg>');
  return out.join('');
}
