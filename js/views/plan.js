// Шаг 1. Планировка: стены, помещения, проёмы, конструкции, этажи, подложка с распознаванием, импорт/экспорт.
import { S, commit, emit } from '../store.js';
import { createEditor } from './editor.js';
import { completeStep } from '../main.js';
import { esc, icon, toast, num, modal, readFileAsText, readFileAsDataURL, downscaleImage } from '../ui.js';
import { WALL_TYPES, OPENING_LIBRARY, STRUCTURE_KINDS, ROOM_TYPES, ROOM_COLORS, roomMetrics, openingGeometry, uid, totalArea } from '../core/model.js';
import { dist, fmtM, polygonPerimeter } from '../core/geometry.js';
import { toDXF, fromDXF, download, svgToPng, svgString, printDocument } from '../core/export.js';
import { detectWalls } from '../core/analysis.js';
import { api, uploadImage } from '../api.js';

const opt = { wallType: 'partition', wallStatus: 'existing', roomType: 'Гостиная', roomName: '', rectWithWalls: true, preset: { door: 1, window: 1, arch: 0, balcony: 0 }, windowSill: 850, len: '', ang: '' };

const TOOLS = [
  { id: 'select', icon: 'cursor', tip: 'Выбор и перемещение', key: 'V' },
  '|',
  { id: 'wall', icon: 'wall', tip: 'Стена по точкам', key: 'W' },
  { id: 'room-rect', icon: 'room', tip: 'Прямоугольная комната со стенами', key: 'Q' },
  { id: 'room-poly', icon: 'plan', tip: 'Комната по контуру', key: 'P' },
  '|',
  { id: 'door', icon: 'door', tip: 'Дверь', key: 'D' },
  { id: 'window', icon: 'window', tip: 'Окно', key: 'O' },
  { id: 'arch', icon: 'chevron', tip: 'Арка' },
  { id: 'balcony', icon: 'share', tip: 'Балконный блок' },
  '|',
  { id: 'column', icon: 'column', tip: 'Колонна' },
  { id: 'stairs', icon: 'stairs', tip: 'Лестница' },
  { id: 'niche', icon: 'tile', tip: 'Ниша' },
  { id: 'slope', icon: 'ruler', tip: 'Скос мансарды' },
  '|',
  { id: 'measure', icon: 'ruler', tip: 'Рулетка', key: 'M' },
  { id: 'calibrate', icon: 'scissors', tip: 'Масштаб подложки по известному размеру' },
];
const HINTS = {
  wall: 'Кликните начало и следующие точки стены. Привязка к сетке 50 мм, углам 45° и концам стен (Alt — без привязки). Двойной клик или Esc — закончить. Цифры — ввод длины.',
  'room-rect': 'Растяните прямоугольник — будут созданы комната и стены по контуру.',
  'room-poly': 'Кликайте по углам помещения; клик в первую точку или Enter — замкнуть контур.',
  door: 'Наведите на стену и кликните — дверь встанет по центру курсора.', window: 'Наведите на стену и кликните, чтобы поставить окно.', arch: 'Кликните по стене, чтобы поставить арку.', balcony: 'Кликните по наружной стене для балконного блока.',
  column: 'Кликните, чтобы поставить колонну. Размер — в инспекторе.', stairs: 'Кликните, чтобы поставить лестницу между этажами.', niche: 'Кликните, чтобы обозначить нишу.', slope: 'Кликните, чтобы обозначить зону скоса мансарды.',
  measure: 'Кликните две точки, чтобы измерить расстояние.', calibrate: 'Кликните две точки на подложке, расстояние между которыми вы знаете.',
};

export function mount(el) {
  const ed = createEditor(el, {
    mode: 'plan', tools: TOOLS, hints: HINTS,
    inspector, bindInspector,
    canvasOpts: {
      wallType: () => opt.wallType, wallStatus: () => opt.wallStatus,
      roomType: () => opt.roomType, roomName: () => opt.roomName || opt.roomType,
      rectWithWalls: () => opt.rectWithWalls,
      openingSize: kind => OPENING_LIBRARY[kind].presets[opt.preset[kind] ?? 0],
      windowSill: () => opt.windowSill,
      onCalibrate,
      onTypeLength: d => { const inp = el.querySelector('[name=len]'); if (inp) { inp.value = d; inp.focus(); } },
      onDrawState: () => {},
    },
  });
  const keyMap = { v: 'select', w: 'wall', q: 'room-rect', p: 'room-poly', d: 'door', o: 'window', m: 'measure' };
  const onKey = e => {
    if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (ed.canvas.isDrawing() && /^[0-9]$/.test(e.key)) return;
    const t = keyMap[e.key.toLowerCase()]; if (t) ed.setTool(t);
  };
  document.addEventListener('keydown', onKey);

  async function onCalibrate(measured) {
    const r = await modal({ title: 'Масштаб подложки', content: `<p class="muted small">Отрезок на подложке сейчас ${Math.round(measured)} мм. Укажите реальную длину.</p><label class="field"><span>Реальная длина, мм</span><input class="input num" type="number" name="real" min="100" required autofocus></label>`, buttons: [{ label: 'Отмена' }, { label: 'Применить', value: 'ok', primary: true }] });
    if (!r.value) return;
    const k = Number(r.data.real) / measured;
    if (!(k > 0)) return;
    commit(p => { const U = p.underlay; const ox = U.x, oy = U.y; U.scale *= k; U.x = ox; U.y = oy; U.calibrated = true; });
    ed.canvas.fit(); toast('Масштаб подложки установлен');
  }

  function inspector({ tool, selection }) {
    const p = S.project;
    const s = selection;
    if (s?.type === 'wall') return wallPanel(p, p.walls.find(w => w.id === s.id));
    if (s?.type === 'room') return roomPanel(p, p.rooms.find(r => r.id === s.id));
    if (s?.type === 'opening') return openingPanel(p, p.openings.find(o => o.id === s.id));
    if (s?.type === 'structure') return structurePanel(p.structures.find(x => x.id === s.id));
    if (s?.type === 'point') return `<section><h4>Инженерная точка</h4><p class="muted small">Точки редактируются на шаге «Инженерия».</p></section>`;
    return toolPanel(p, tool) + overviewPanel(p) + footer(p);
  }

  function toolPanel(p, tool) {
    if (tool === 'wall' || tool === 'room-rect') return `<section><h4>${tool === 'wall' ? 'Новая стена' : 'Новая комната'}</h4><div class="stack tight">
      ${tool === 'room-rect' ? roomTypeFields() : ''}
      <div class="prop-grid"><label class="field"><span>Тип стены</span><select class="select sm" data-opt="wallType">${Object.entries(WALL_TYPES).map(([k, v]) => `<option value="${k}" ${opt.wallType === k ? 'selected' : ''}>${v.name} · ${v.thickness} мм</option>`).join('')}</select></label>
      <label class="field"><span>Статус</span><select class="select sm" data-opt="wallStatus">${statusOptions(opt.wallStatus)}</select></label></div>
      ${tool === 'room-rect' ? `<label class="check"><input type="checkbox" data-opt="rectWithWalls" ${opt.rectWithWalls ? 'checked' : ''}> Создавать стены по контуру</label>` : `
      <div class="prop-grid"><label class="field"><span>Длина, мм</span><input class="input sm num" name="len" type="number" min="50" placeholder="3000"></label><label class="field"><span>Угол, °</span><input class="input sm num" name="ang" type="number" placeholder="авто"></label></div>
      <button class="btn sm" data-act="add-len">${icon('plus', 14)} Добавить отрезок по длине</button>
      <p class="tiny muted">Начните стену кликом, затем введите длину и угол (0° — вправо, 90° — вниз) и нажмите Enter.</p>`}
    </div></section>`;
    if (tool === 'room-poly') return `<section><h4>Новая комната по контуру</h4><div class="stack tight">${roomTypeFields()}</div></section>`;
    if (OPENING_LIBRARY[tool]) { const L = OPENING_LIBRARY[tool]; return `<section><h4>${L.name} из библиотеки</h4><div class="palette-grid">${L.presets.map(([w, h], i) => `<button class="pal-item ${(opt.preset[tool] ?? 0) === i ? 'on' : ''}" data-preset="${i}">${icon(tool === 'window' ? 'window' : 'door', 16)}<span>${w}×${h}</span></button>`).join('')}</div>${tool === 'window' ? `<label class="field" style="margin-top:10px"><span>Высота подоконника, мм</span><input class="input sm num" type="number" data-opt="windowSill" value="${opt.windowSill}"></label>` : ''}</section>`; }
    if (STRUCTURE_KINDS[tool]) return `<section><h4>${STRUCTURE_KINDS[tool].name}</h4><p class="small muted">Кликните на плане. После установки можно изменить размеры и поворот.</p></section>`;
    if (tool === 'calibrate' && !p.underlay) return `<section><div class="notice warn">${icon('alert')}<span>Сначала загрузите подложку ниже.</span></div></section>`;
    return '';
  }
  function roomTypeFields() { return `<div class="prop-grid"><label class="field"><span>Назначение</span><select class="select sm" data-opt="roomType">${ROOM_TYPES.map(t => `<option ${opt.roomType === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="field"><span>Название</span><input class="input sm" data-opt="roomName" value="${esc(opt.roomName)}" placeholder="${esc(opt.roomType)}"></label></div>`; }
  function statusOptions(v) { return [['existing', 'Существующая'], ['new', 'Новая (возвести)'], ['demolish', 'Под снос']].map(([k, n]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${n}</option>`).join(''); }

  function overviewPanel(p) {
    const rooms = p.rooms.filter(r => r.floor === p.activeFloor);
    const tot = rooms.reduce((a, r) => { const m = roomMetrics(p, r); a.area += m.area; a.vol += m.volume; a.per += m.perimeter; return a; }, { area: 0, vol: 0, per: 0 });
    const U = p.underlay;
    return `<section><h4>Помещения <span class="muted">${rooms.length}</span></h4>
      ${rooms.length ? `<div class="stack tight">${rooms.map(r => { const m = roomMetrics(p, r); return `<button class="list-btn" data-select-room="${r.id}"><span class="swatch" style="background:${r.color || ROOM_COLORS[r.type]}"></span><span style="flex:1;min-width:0"><b>${esc(r.name)}</b><small>${esc(r.type)} · h ${fmtM(r.ceiling || 2700)} м</small></span><span class="mono small">${num(m.area, 1)} м²</span></button>`; }).join('')}</div>
      <dl class="stat-list" style="margin-top:12px"><dt>Площадь этажа</dt><dd>${num(tot.area, 1)} м²</dd><dt>Сумма периметров</dt><dd>${num(tot.per, 1)} м</dd><dt>Объём</dt><dd>${num(tot.vol, 1)} м³</dd><dt>Стен / проёмов</dt><dd>${p.walls.filter(w => w.floor === p.activeFloor).length} / ${p.openings.length}</dd></dl>`
      : `<div class="empty small">${icon('room', 28)}Нарисуйте комнату инструментом «Прямоугольная комната» или загрузите чертёж ниже</div>`}
    </section>
    <section><h4>Подложка чертежа ${U ? `<span class="badge ${U.calibrated ? 'ok' : 'warn'}">${U.calibrated ? 'масштаб задан' : 'без масштаба'}</span>` : ''}</h4>
      ${U ? `<div class="stack tight">
        <label class="field"><span>Прозрачность</span><input type="range" min="0.1" max="1" step="0.05" value="${U.opacity ?? 0.5}" data-underlay="opacity"></label>
        <div class="row wrap"><button class="btn sm" data-tool-go="calibrate">${icon('ruler', 14)} Задать масштаб</button><button class="btn sm" data-act="recognize">${icon('sparkles', 14)} Распознать стены</button><button class="btn sm ghost" data-act="underlay-del">${icon('trash', 14)}</button></div>
        ${(S.ui.proposals || []).length ? `<div class="notice accent">${icon('sparkles')}<span>Найдено ${S.ui.proposals.length} стен. Проверьте оранжевые линии: клик по линии удаляет предложение.</span></div><div class="row"><button class="btn sm primary" data-act="accept-proposals">Принять все</button><button class="btn sm" data-act="reject-proposals">Отклонить</button></div>` : ''}
      </div>` : `<p class="small muted" style="margin-bottom:8px">JPG, PNG или PDF плана. После загрузки задайте масштаб по известному размеру — затем можно распознать стены.</p><label class="btn sm">${icon('upload', 14)} Загрузить чертёж<input type="file" accept="image/jpeg,image/png,application/pdf" data-file="underlay" hidden></label>`}
    </section>
    <section><h4>Импорт и экспорт</h4><div class="row wrap">
      <button class="btn sm" data-export="pdf">${icon('print', 14)} PDF</button><button class="btn sm" data-export="png">${icon('image', 14)} PNG</button><button class="btn sm" data-export="dxf">${icon('download', 14)} DXF</button><button class="btn sm" data-export="svg">SVG</button>
      <label class="btn sm">${icon('upload', 14)} Импорт DXF<input type="file" accept=".dxf" data-file="dxf" hidden></label></div></section>`;
  }

  function footer(p) {
    const ok = p.rooms.length > 0;
    return `<div class="step-footer"><button class="btn primary" data-act="complete" ${ok ? '' : 'disabled'}>${p.journey.completed.includes('plan') ? 'Далее: инженерия' : 'Сохранить и продолжить'} ${icon('arrowRight', 15)}</button></div>`;
  }

  function wallPanel(p, w) {
    if (!w) return '';
    const len = dist(w.a, w.b);
    const ops = p.openings.filter(o => o.wall === w.id);
    return `<section><h4>Стена <button class="icon-btn" data-act="deselect">${icon('close', 16)}</button></h4><div class="stack tight">
      ${w.type === 'bearing' ? `<div class="notice warn">${icon('alert')}<span>Несущая стена. Удаление, перенос и новые проёмы требуют проекта и согласования.</span></div>` : ''}
      <div class="prop-grid">
        <label class="field"><span>Тип</span><select class="select sm" data-wall="type">${Object.entries(WALL_TYPES).map(([k, v]) => `<option value="${k}" ${w.type === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
        <label class="field"><span>Толщина, мм</span><input class="input sm num" type="number" min="50" max="700" step="10" data-wall="thickness" value="${w.thickness}"></label>
        <label class="field"><span>Длина, мм</span><input class="input sm num" type="number" min="100" step="10" data-wall="length" value="${Math.round(len)}"></label>
        <label class="field"><span>Статус</span><select class="select sm" data-wall="status">${statusOptions(w.status)}</select></label>
      </div>
      <dl class="stat-list"><dt>Площадь стены</dt><dd>${num(len / 1000 * 2.7, 2)} м²</dd><dt>Проёмов</dt><dd>${ops.length}</dd></dl>
      <button class="btn sm danger" data-act="delete">${icon('trash', 14)} Удалить стену</button>
    </div></section>`;
  }
  function roomPanel(p, r) {
    if (!r) return '';
    const m = roomMetrics(p, r);
    return `<section><h4>Помещение <button class="icon-btn" data-act="deselect">${icon('close', 16)}</button></h4><div class="stack tight">
      <label class="field"><span>Название</span><input class="input sm" data-room="name" value="${esc(r.name)}"></label>
      <div class="prop-grid"><label class="field"><span>Назначение</span><select class="select sm" data-room="type">${ROOM_TYPES.map(t => `<option ${r.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Высота потолка, мм</span><input class="input sm num" type="number" min="1800" max="6000" step="10" data-room="ceiling" value="${r.ceiling || 2700}"></label></div>
      <dl class="stat-list"><dt>Площадь</dt><dd>${num(m.area, 2)} м²</dd><dt>Периметр</dt><dd>${num(m.perimeter, 2)} м</dd><dt>Объём</dt><dd>${num(m.volume, 2)} м³</dd><dt>Площадь стен (без проёмов)</dt><dd>${num(m.wallArea, 2)} м²</dd><dt>Проёмов</dt><dd>${m.openings.length}</dd><dt>Плинтус</dt><dd>${num(m.baseboard, 2)} м</dd></dl>
      <p class="tiny muted">Вершины контура перетаскиваются квадратными ручками на плане.</p>
      <button class="btn sm danger" data-act="delete">${icon('trash', 14)} Удалить помещение</button>
    </div></section>`;
  }
  function openingPanel(p, o) {
    if (!o) return '';
    const L = OPENING_LIBRARY[o.kind]; const w = p.walls.find(x => x.id === o.wall);
    return `<section><h4>${L.name} <button class="icon-btn" data-act="deselect">${icon('close', 16)}</button></h4><div class="stack tight">
      <div class="prop-grid">
        <label class="field"><span>Тип</span><select class="select sm" data-op="kind">${Object.entries(OPENING_LIBRARY).map(([k, v]) => `<option value="${k}" ${o.kind === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
        <label class="field"><span>Ширина, мм</span><input class="input sm num" type="number" min="300" step="10" data-op="width" value="${o.width}"></label>
        <label class="field"><span>Высота, мм</span><input class="input sm num" type="number" min="300" step="10" data-op="height" value="${o.height}"></label>
        <label class="field"><span>От пола, мм</span><input class="input sm num" type="number" min="0" step="10" data-op="sill" value="${o.sill || 0}"></label>
        <label class="field"><span>От начала стены, мм</span><input class="input sm num" type="number" step="10" data-op="offset" value="${Math.round(o.offset - o.width / 2)}"></label>
        ${o.kind === 'door' || o.kind === 'balcony' ? `<label class="field"><span>Открывание</span><select class="select sm" data-op="swing"><option value="left" ${o.swing !== 'right' ? 'selected' : ''}>Левое</option><option value="right" ${o.swing === 'right' ? 'selected' : ''}>Правое</option></select></label>` : ''}
      </div>
      ${o.kind === 'door' || o.kind === 'balcony' ? `<div class="row wrap"><button class="btn sm" data-act="flip">${icon('refresh', 14)} Открывание в другую сторону</button><label class="check small"><input type="checkbox" data-op="entrance" ${o.entrance ? 'checked' : ''}> Входная</label></div>` : ''}
      ${w?.type === 'bearing' ? `<div class="notice warn">${icon('alert')}<span>Проём в несущей стене — только по согласованному проекту.</span></div>` : ''}
      <button class="btn sm danger" data-act="delete">${icon('trash', 14)} Удалить</button>
    </div></section>`;
  }
  function structurePanel(s) {
    if (!s) return '';
    return `<section><h4>${STRUCTURE_KINDS[s.kind].name} <button class="icon-btn" data-act="deselect">${icon('close', 16)}</button></h4><div class="stack tight"><div class="prop-grid">
      <label class="field"><span>Ширина, мм</span><input class="input sm num" type="number" step="10" data-st="w" value="${s.w}"></label>
      <label class="field"><span>Глубина, мм</span><input class="input sm num" type="number" step="10" data-st="h" value="${s.h}"></label>
      <label class="field"><span>Поворот, °</span><select class="select sm" data-st="rotation">${[0, 90, 180, 270].map(a => `<option ${+s.rotation === a ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
      ${s.kind === 'slope' ? `<label class="field"><span>Мин. высота, мм</span><input class="input sm num" type="number" step="10" data-st="lowHeight" value="${s.lowHeight || 1200}"></label>` : ''}
      ${s.kind === 'stairs' ? `<label class="field"><span>Ведёт на</span><select class="select sm" data-st="toFloor"><option value="">—</option>${S.project.floors.map(f => `<option value="${f.id}" ${s.toFloor === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></label>` : ''}
    </div><button class="btn sm danger" data-act="delete">${icon('trash', 14)} Удалить</button></div></section>`;
  }

  function bindInspector(insp, { canvas, setTool }) {
    insp.oninput = e => {
      const t = e.target;
      if (t.dataset.underlay) commit(p => { p.underlay[t.dataset.underlay] = +t.value; }, { render: 'canvas' });
    };
    insp.onchange = async e => {
      const t = e.target, s = S.ui.selection;
      if (t.dataset.opt) { opt[t.dataset.opt] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value; ed.renderInspector(); return; }
      if (t.dataset.wall && s) commit(p => {
        const w = p.walls.find(x => x.id === s.id); const k = t.dataset.wall;
        if (k === 'type') { w.type = t.value; w.thickness = WALL_TYPES[t.value].thickness; }
        else if (k === 'thickness') w.thickness = Math.max(50, Math.min(700, +t.value || w.thickness));
        else if (k === 'length') { const L0 = dist(w.a, w.b), L = Math.max(100, +t.value); const ux = (w.b.x - w.a.x) / L0, uy = (w.b.y - w.a.y) / L0; const old = { ...w.b }; w.b.x = Math.round(w.a.x + ux * L); w.b.y = Math.round(w.a.y + uy * L); for (const o of p.walls) if (o.id !== w.id) for (const e2 of ['a', 'b']) if (dist(o[e2], old) < 1) { o[e2].x = w.b.x; o[e2].y = w.b.y; } }
        else w[k] = t.value;
      });
      if (t.dataset.room && s) commit(p => { const r = p.rooms.find(x => x.id === s.id); const k = t.dataset.room; if (k === 'type') { if (r.name === r.type) r.name = t.value; r.type = t.value; r.color = ROOM_COLORS[t.value]; } else r[k] = k === 'ceiling' ? Math.max(1800, +t.value) : t.value; });
      if (t.dataset.op && s) commit(p => { const o = p.openings.find(x => x.id === s.id); const k = t.dataset.op; if (k === 'offset') o.offset = +t.value + o.width / 2; else if (k === 'entrance') o.entrance = t.checked; else if (['width', 'height', 'sill'].includes(k)) o[k] = Math.max(0, +t.value); else { o[k] = t.value; if (k === 'kind') o.sill = OPENING_LIBRARY[t.value].sill; } });
      if (t.dataset.st && s) commit(p => { const x = p.structures.find(y => y.id === s.id); x[t.dataset.st] = t.dataset.st === 'toFloor' ? t.value : +t.value; });
      if (t.dataset.file === 'underlay' && t.files[0]) loadUnderlay(t.files[0]);
      if (t.dataset.file === 'dxf' && t.files[0]) {
        const walls = fromDXF(await readFileAsText(t.files[0]), S.project.activeFloor);
        if (!walls.length) return toast('В DXF не найдено отрезков LINE/LWPOLYLINE', 'err');
        commit(p => p.walls.push(...walls)); canvas.fit(); toast(`Импортировано ${walls.length} отрезков как перегородки — уточните типы стен`);
      }
    };
    insp.onclick = async e => {
      const b = e.target.closest('button, [data-select-room]'); if (!b) return;
      const s = S.ui.selection;
      if (b.dataset.selectRoom) return canvas.select({ type: 'room', id: b.dataset.selectRoom });
      if (b.dataset.preset) { opt.preset[ed.canvas.getTool()] = +b.dataset.preset; ed.renderInspector(); return; }
      if (b.dataset.toolGo) return setTool(b.dataset.toolGo);
      if (b.dataset.export) return exportPlan(b.dataset.export, canvas);
      const a = b.dataset.act;
      if (a === 'deselect') canvas.select(null);
      if (a === 'delete') canvas.deleteSelection();
      if (a === 'flip' && s) commit(p => { const o = p.openings.find(x => x.id === s.id); o.side = -(o.side || 1); });
      if (a === 'add-len') { const L = +insp.querySelector('[name=len]').value, A = insp.querySelector('[name=ang]').value; if (L > 0) canvas.addWallByLength(L, A === '' ? null : +A); else toast('Укажите длину'); }
      if (a === 'complete') completeStep('plan');
      if (a === 'underlay-del') { commit(p => { p.underlay = null; }); S.ui.proposals = []; }
      if (a === 'recognize') recognize(b);
      if (a === 'accept-proposals') { const U = S.project.underlay; const props = S.ui.proposals; S.ui.proposals = []; commit(p => props.forEach(pr => p.walls.push({ id: uid('w'), floor: p.activeFloor, a: { x: Math.round(pr.a.x / 10) * 10, y: Math.round(pr.a.y / 10) * 10 }, b: { x: Math.round(pr.b.x / 10) * 10, y: Math.round(pr.b.y / 10) * 10 }, type: pr.thick > 250 ? 'bearing' : 'partition', thickness: pr.thick > 250 ? 380 : 100, status: 'existing', recognized: true }))); toast(`Добавлено ${props.length} стен. Проверьте типы и толщины.`); }
      if (a === 'reject-proposals') { S.ui.proposals = []; ed.refresh(); }
    };
    insp.onkeydown = e => { if (e.key === 'Enter' && e.target.name === 'len') { e.preventDefault(); insp.querySelector('[data-act="add-len"]').click(); e.target.value = ''; } };
  }

  async function loadUnderlay(file) {
    if (file.size > 20e6) return toast('Файл больше 20 МБ', 'err');
    let src;
    try {
      if (file.type === 'application/pdf') src = await pdfToImage(file);
      else src = await downscaleImage(file, 2000, 0.85);
    } catch (e) { return toast('Не удалось прочитать файл: ' + e.message, 'err'); }
    const img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    if (S.server.online && S.user) {
      try { const blob = await (await fetch(src)).blob(); const up = await uploadImage(new File([blob], 'plan.jpg', { type: 'image/jpeg' })); src = up.url; } catch {}
    }
    const scale = 10000 / img.width;
    commit(p => { p.underlay = { src, x: 0, y: 0, w: img.width, h: img.height, scale, opacity: 0.5, floor: p.activeFloor, calibrated: false }; });
    ed.canvas.fit(); ed.setTool('calibrate');
    toast('Подложка загружена. Отметьте две точки с известным размером.');
  }

  async function recognize(btn) {
    const U = S.project.underlay; if (!U) return;
    if (!U.calibrated) toast('Совет: сначала задайте масштаб, чтобы размеры стен были точными');
    btn.disabled = true; btn.textContent = 'Распознаю…';
    let segs = null, source = 'local';
    const provider = S.project.brief.provider;
    if (S.server.online && provider !== 'local' && S.server.providers?.[provider]) {
      try {
        const res = await api(`/api/recognize/${provider}`, { method: 'POST', body: { image: U.src.startsWith('data:') ? U.src : null, uploadId: U.src.startsWith('/api/uploads/') ? U.src.split('/').pop() : null, width: U.w, height: U.h }, timeout: 120000 });
        segs = res.walls.map(w => ({ a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 }, thick: w.thickness || 10 })); source = provider;
      } catch (e) { toast('Расширенное распознавание недоступно: ' + e.message + '. Использую базовое.'); }
    }
    if (!segs) { const r = await detectWalls(U.src); segs = r.segments; }
    S.ui.proposals = segs.map(s => ({ a: { x: U.x + s.a.x * U.scale, y: U.y + s.a.y * U.scale }, b: { x: U.x + s.b.x * U.scale, y: U.y + s.b.y * U.scale }, thick: s.thick * U.scale, source }));
    if (!S.ui.proposals.length) toast('Стены не найдены — попробуйте чертёж с более контрастными линиями');
    ed.refresh();
  }

  async function exportPlan(kind, canvas) {
    const p = S.project; const name = (p.name || 'plan').replace(/[^\wа-яё -]/gi, '');
    if (kind === 'dxf') return download(`${name}.dxf`, toDXF(p), 'application/dxf');
    if (kind === 'svg') return download(`${name}.svg`, svgString(canvas.svg), 'image/svg+xml');
    if (kind === 'png') return download(`${name}.png`, await svgToPng(canvas.svg, 2));
    if (kind === 'pdf') {
      const rooms = p.rooms.filter(r => r.floor === p.activeFloor);
      printDocument(`${p.name} — план`, `<h1>${esc(p.name)}</h1><div class="muted">${esc(p.city)} · ${new Date().toLocaleDateString('ru-RU')} · ${esc(p.floors.find(f => f.id === p.activeFloor)?.name)}</div>
        <div class="box">${svgString(canvas.svg)}</div>
        <h2>Экспликация помещений</h2><table><tr><th>№</th><th>Помещение</th><th>Назначение</th><th class="n">Площадь, м²</th><th class="n">Периметр, м</th><th class="n">Высота, м</th><th class="n">Объём, м³</th></tr>
        ${rooms.map((r, i) => { const m = roomMetrics(p, r); return `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td class="n">${m.area.toFixed(2)}</td><td class="n">${m.perimeter.toFixed(2)}</td><td class="n">${m.ceiling.toFixed(2)}</td><td class="n">${m.volume.toFixed(2)}</td></tr>`; }).join('')}
        <tr class="total"><td></td><td>Итого</td><td></td><td class="n">${rooms.reduce((s, r) => s + roomMetrics(p, r).area, 0).toFixed(2)}</td><td></td><td></td><td></td></tr></table>
        <p class="muted">Эскизный план. Не является рабочей документацией и проектом перепланировки.</p>`);
    }
  }

  return {
    update(what) { if (what === 'server') return; ed.refresh(what); },
    destroy() { document.removeEventListener('keydown', onKey); ed.destroy(); },
  };
}

let pdfjs = null;
async function pdfToImage(file) {
  if (!pdfjs) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('нет доступа к pdf.js')); document.head.append(s); });
    pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 2 });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.85);
}
