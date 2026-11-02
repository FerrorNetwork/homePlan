// Каркас редактора: панель инструментов, сцена (2D-план / 3D / прогулка), плавающая панель и инспектор.
import { S, commit, emit } from '../store.js';
import { createCanvas } from './canvas.js';
import { icon, esc, toast } from '../ui.js';
import { uid } from '../core/model.js';

const LAYER_NAMES = { walls: 'Стены и проёмы', dims: 'Размеры', structure: 'Конструкции', furniture: 'Мебель', finish: 'Отделка', electric: 'Электрика', water: 'Водоснабжение', sewer: 'Канализация', heating: 'Отопление', vent: 'Вентиляция', underlay: 'Подложка' };

export function createEditor(el, cfg) {
  el.innerHTML = `<div class="workspace">
    <nav class="toolrail" aria-label="Инструменты"></nav>
    <div class="stage">
      <div class="stage-bar">
        <div class="float"><div class="seg" data-view>
          <button data-v="2d" class="on">${icon('plan', 15)} 2D</button>
          <button data-v="3d">${icon('cube', 15)} 3D</button>
          <button data-v="walk">${icon('walk', 15)} От первого лица</button></div></div>
        <div class="float" data-floors></div>
        <div class="float"><button class="icon-btn" data-layers title="Слои видимости">${icon('layers')}</button></div>
        <span class="spacer"></span>
        <div class="float" data-extra></div>
      </div>
      <div class="stage-2d" style="position:absolute;inset:0"></div>
      <div class="stage-3d" style="position:absolute;inset:0;display:none"></div>
      <div class="stage-hint" hidden></div>
      <div class="walk-pad" hidden aria-label="Движение">
        <button data-walk="ArrowLeft" aria-label="Повернуть влево">${icon('undo', 18)}</button><button data-walk="KeyW" aria-label="Вперёд">${icon('chevronDown', 20, 'flip')}</button><button data-walk="ArrowRight" aria-label="Повернуть вправо">${icon('redo', 18)}</button>
        <button data-walk="KeyA" aria-label="Шаг влево">${icon('arrowLeft', 18)}</button><button data-walk="KeyS" aria-label="Назад">${icon('chevronDown', 20)}</button><button data-walk="KeyD" aria-label="Шаг вправо">${icon('arrowRight', 18)}</button>
      </div>
      <div class="float stage-zoom"><button class="icon-btn" data-zoom="0.8" title="Приблизить">${icon('plus')}</button><button class="icon-btn" data-fit title="Показать всё">${icon('grid')}</button><button class="icon-btn" data-zoom="1.25" title="Отдалить">${icon('minus')}</button></div>
    </div>
    <aside class="inspector"></aside>
  </div>`;
  const rail = el.querySelector('.toolrail'), stage = el.querySelector('.stage'), insp = el.querySelector('.inspector');
  const host2d = el.querySelector('.stage-2d'), host3d = el.querySelector('.stage-3d'), hint = el.querySelector('.stage-hint');
  let tool = 'select', view = '2d', v3d = null;

  const canvas = createCanvas(host2d, {
    mode: cfg.mode,
    getDesign: cfg.getDesign, getIssues: cfg.getIssues, showIssueMarks: cfg.showIssueMarks,
    onSelect: () => { renderInspector(); cfg.onSelect?.(); },
    onLiveChange: () => cfg.onLiveChange?.(),
    selectable: cfg.selectable,
    ...cfg.canvasOpts,
  });

  function renderRail() {
    rail.innerHTML = cfg.tools.map(t => t === '|' ? '<span class="sep"></span>' : `<button class="tool ${tool === t.id ? 'on' : ''}" data-tool="${t.id}" data-tip="${esc(t.tip)}${t.key ? ` (${t.key})` : ''}" aria-label="${esc(t.tip)}">${icon(t.icon, 20)}${t.key ? `<span class="key">${t.key}</span>` : ''}</button>`).join('');
  }
  function setTool(t) {
    tool = t; canvas.setTool(t); renderRail(); renderInspector();
    const h = cfg.hints?.[t]; hint.hidden = !h; if (h) hint.textContent = h;
  }
  function renderFloors() {
    const p = S.project;
    el.querySelector('[data-floors]').innerHTML = `<select class="select sm" data-floor style="width:auto;border:0;background:none">${p.floors.map(f => `<option value="${f.id}" ${f.id === p.activeFloor ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>${S.readOnly ? '' : `<button class="icon-btn" data-add-floor title="Добавить этаж">${icon('plus', 16)}</button>`}`;
  }
  function renderInspector() {
    const scrollTop = insp.scrollTop;
    insp.innerHTML = cfg.inspector({ tool, selection: S.ui.selection, canvas });
    insp.scrollTop = scrollTop;
    cfg.bindInspector?.(insp, { canvas, setTool, refresh });
  }
  function refresh(what) {
    renderFloors();
    if (view === '2d') canvas.render(); else v3d?.rebuild();
    if (what !== 'canvas') renderInspector();
    cfg.onRefresh?.(what);
  }

  async function setView(v) {
    view = v;
    el.querySelectorAll('[data-view] button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    host2d.style.display = v === '2d' ? '' : 'none';
    host3d.style.display = v === '2d' ? 'none' : '';
    el.querySelector('.stage-zoom').style.display = v === '2d' ? '' : 'none';
    el.querySelector('.walk-pad').hidden = v !== 'walk';
    if (v !== '2d') {
      if (!v3d) {
        hint.hidden = false; hint.textContent = 'Загрузка 3D…';
        try { const { createView3D } = await import('./view3d.js'); v3d = createView3D(host3d, { getDesign: cfg.getDesign, focusRoom: cfg.focusRoom }); }
        catch (e) { toast('3D недоступно: нужен WebGL2 и доступ к CDN three.js', 'err'); setView('2d'); return; }
      }
      v3d.setMode(v === 'walk' ? 'walk' : 'orbit');
      hint.hidden = false;
      hint.textContent = v === 'walk' ? (matchMedia('(pointer: coarse)').matches ? 'Кнопки внизу — идти и поворачиваться, проведите пальцем — осмотреться.' : 'W/A/S/D или стрелки — идти, перетаскивание мышью — осмотреться. Двери проходимы, стены — нет.') : 'Вращайте мышью, колесо — масштаб, правая кнопка — сдвиг. Модели мебели упрощённые, размеры — из карточек.';
    } else { const h = cfg.hints?.[tool]; hint.hidden = !h; if (h) hint.textContent = h; canvas.render(); }
    cfg.onView?.(v);
  }

  // Кнопки ходьбы: удерживать — двигаться
  const pad = el.querySelector('.walk-pad');
  const walk = (e, on) => { const b = e.target.closest('[data-walk]'); if (!b || !v3d) return; e.preventDefault(); v3d.press(b.dataset.walk, on); b.classList.toggle('on', on); };
  pad.addEventListener('pointerdown', e => { e.target.closest('[data-walk]')?.setPointerCapture(e.pointerId); walk(e, true); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) pad.addEventListener(ev, e => walk(e, false));

  el.addEventListener('click', e => {
    const t = e.target.closest('[data-tool]'); if (t) return setTool(t.dataset.tool);
    const v = e.target.closest('[data-view] button'); if (v) return setView(v.dataset.v);
    const z = e.target.closest('[data-zoom]'); if (z) return canvas.zoom(+z.dataset.zoom);
    if (e.target.closest('[data-fit]')) return canvas.fit();
    if (e.target.closest('[data-layers]')) return toggleLayers(e.target.closest('[data-layers]'));
    if (e.target.closest('[data-add-floor]')) {
      const id = uid('f');
      commit(p => { p.floors.push({ id, name: `${p.floors.length + 1} этаж`, height: 2700 }); p.activeFloor = id; });
      toast('Этаж добавлен. Лестницу можно поставить инструментом «Лестница»'); canvas.fit();
    }
  });
  el.addEventListener('change', e => {
    if (e.target.matches('[data-floor]')) { commit(p => { p.activeFloor = e.target.value; }); S.ui.selection = null; canvas.fit(); }
  });

  function toggleLayers(btn) {
    const old = stage.querySelector('.layers-pop'); if (old) { old.remove(); return; }
    const pop = document.createElement('div'); pop.className = 'layers-pop';
    const L = S.project.layers;
    pop.innerHTML = `<h4>Слои видимости</h4>${Object.entries(LAYER_NAMES).map(([k, n]) => `<label class="check"><input type="checkbox" data-layer="${k}" ${L[k] ? 'checked' : ''}> ${n}</label>`).join('')}`;
    pop.style.left = btn.closest('.float').offsetLeft + 'px';
    stage.append(pop);
    pop.addEventListener('change', e => { const k = e.target.dataset.layer; commit(p => { p.layers[k] = e.target.checked; }, { render: 'canvas' }); if (view !== '2d') v3d?.rebuild(); });
    const close = ev => { if (!pop.contains(ev.target) && !btn.contains(ev.target)) { pop.remove(); document.removeEventListener('mousedown', close); } };
    setTimeout(() => document.addEventListener('mousedown', close));
  }

  if (cfg.extraBar) el.querySelector('[data-extra]').innerHTML = cfg.extraBar(); else el.querySelector('[data-extra]').remove();
  renderRail(); renderFloors(); renderInspector();
  requestAnimationFrame(() => canvas.fit());
  setTool(cfg.initialTool || 'select');

  return {
    canvas, setTool, refresh, renderInspector, setView, getView: () => view, get v3d() { return v3d; }, el, insp,
    destroy() { canvas.destroy(); v3d?.destroy(); },
  };
}
