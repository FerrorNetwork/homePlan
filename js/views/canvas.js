// 2D-холст плана (SVG, единицы — мм). Общий для планировки, инженерии и дизайна:
// отрисовка слоёв, масштаб/панорама, выбор и перетаскивание, инструменты рисования.
import { S, commit, beginGesture, endGesture, emit } from '../store.js';
import { dist, snap, angleDeg, projectOnSegment, centroid, polygonArea, bbox, footprint, orthoPath, pathLength, fmtM, pointInPolygon } from '../core/geometry.js';
import { WALL_TYPES, OPENING_LIBRARY, POINT_KINDS, SYSTEMS, STRUCTURE_KINDS, ROOM_COLORS, uid, openingGeometry, pointLayer, roomAt } from '../core/model.js';
import { productById } from '../core/catalog.js';
import { KIND_RULES } from '../core/rules.js';
import { zonesOf } from '../core/designer.js';
import { esc, toast, confirmDialog } from '../ui.js';
import { pointGlyph } from './symbols.js';
import { gostPlanSvg } from './gostplan.js';

const NS = 'http://www.w3.org/2000/svg';
const PT_COLOR = k => SYSTEMS[POINT_KINDS[k]?.system === 'water' ? (['riser', 'collector'].includes(k) ? 'sewer' : 'cold') : POINT_KINDS[k]?.system]?.color || '#888';

export function createCanvas(host, opts = {}) {
  const mode = opts.mode || 'plan';
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('plan');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'План помещения');
  host.append(svg);
  const view = { x: -800, y: -800, w: 12000, h: 8000 };
  let st = { tool: 'select', drag: null, draw: null, hover: null, measure: null, calib: null, mouse: null, snap: null };
  const P = () => S.project;
  const floor = () => P().activeFloor;
  const sel = () => S.ui.selection;
  const u = () => view.w / Math.max(1, svg.clientWidth); // мм на пиксель

  function setViewBox() {
    const r = svg.clientWidth / Math.max(1, svg.clientHeight);
    if (r > 0 && isFinite(r) && svg.clientHeight > 0) { const cy = view.y + view.h / 2; view.h = view.w / r; view.y = cy - view.h / 2; }
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  function fit(padding = 900) {
    const p = P(); if (!p) return;
    const pts = [...p.walls.filter(w => w.floor === floor()).flatMap(w => [w.a, w.b]), ...p.rooms.filter(r => r.floor === floor()).flatMap(r => r.poly)];
    if (p.underlay && p.underlay.floor === floor()) pts.push({ x: p.underlay.x, y: p.underlay.y }, { x: p.underlay.x + p.underlay.w * p.underlay.scale, y: p.underlay.y + p.underlay.h * p.underlay.scale });
    const b = pts.length ? bbox(pts) : { minX: 0, minY: 0, w: 10000, h: 7000 };
    const W = Math.max(b.w, 3000) + padding * 2, H = Math.max(b.h, 3000) + padding * 2;
    const r = svg.clientWidth / Math.max(1, svg.clientHeight) || 1.5;
    view.w = Math.max(W, H * r); view.h = view.w / r;
    view.x = b.minX - padding - (view.w - W) / 2; view.y = b.minY - padding - (view.h - H) / 2;
    view.cy = view.y + view.h / 2;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
    render();
  }

  function toWorld(e) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const m = svg.getScreenCTM(); if (!m) return { x: 0, y: 0 };
    const q = pt.matrixTransform(m.inverse()); return { x: q.x, y: q.y };
  }

  // ——— Привязки ———
  function endpoints() {
    const p = P(); const out = [];
    for (const w of p.walls) if (w.floor === floor()) out.push(w.a, w.b);
    for (const r of p.rooms) if (r.floor === floor()) out.push(...r.poly);
    return out;
  }
  function snapPoint(q, { from = null, noAngle = false } = {}) {
    const tol = 14 * u();
    let best = null;
    for (const e of endpoints()) { const d = dist(q, e); if (d < tol && (!best || d < best.d)) best = { p: { ...e }, d, kind: 'end' }; }
    if (best) return best;
    for (const w of P().walls.filter(w => w.floor === floor())) {
      const pr = projectOnSegment(q, w.a, w.b);
      if (pr.distance < tol * 0.8 && pr.t > 0.02 && pr.t < 0.98) return { p: { x: Math.round(pr.point.x), y: Math.round(pr.point.y) }, kind: 'wall' };
    }
    let p = { x: snap(q.x, 50), y: snap(q.y, 50) };
    if (from && !noAngle) {
      const L = dist(from, q), a = Math.atan2(q.y - from.y, q.x - from.x);
      const step = Math.PI / 4, sa = Math.round(a / step) * step;
      if (Math.abs(a - sa) < 0.12) { const Ls = snap(L, 10); p = { x: Math.round(from.x + Math.cos(sa) * Ls), y: Math.round(from.y + Math.sin(sa) * Ls) }; return { p, kind: 'angle' }; }
    }
    return { p, kind: 'grid' };
  }

  // ——— Отрисовка ———
  let forceGost = null; // параметры экспорта листа: { k, layers, systems }
  function render() {
    const p = P(); if (!p) { svg.innerHTML = ''; return; }
    if (!forceGost) setViewBox();
    const L = p.layers, f = floor(), uu = u();
    // Чертёжный режим (ГОСТ): монохромный план с условными обозначениями и кодами трубопроводов
    if (mode !== 'mini' && (forceGost || opts.gost?.())) {
      const g = forceGost || {};
      svg.classList.add('gost');
      svg.innerHTML = gostPlanSvg(p, { floor: f, layers: g.layers || L, k: g.k || uu * (svg.clientWidth < 600 ? 2.8 : 4.5), selectedId: forceGost ? null : sel()?.id, interactive: !forceGost, systems: g.systems || null })
        + (forceGost ? '' : selectionOverlay(uu) + drawOverlay(uu));
      opts.afterRender?.();
      return;
    }
    svg.classList.remove('gost');
    const design = opts.getDesign?.();
    const issues = opts.getIssues?.() || [];
    const badIds = new Set(issues.map(i => i.id).filter(Boolean));
    const h = [];
    h.push(`<defs>
      <pattern id="gmin" width="500" height="500" patternUnits="userSpaceOnUse"><path d="M500 0H0V500" fill="none" class="grid-minor" stroke-width="${uu}"/></pattern>
      <pattern id="gmaj" width="1000" height="1000" patternUnits="userSpaceOnUse"><rect width="1000" height="1000" fill="url(#gmin)"/><path d="M1000 0H0V1000" fill="none" class="grid-major" stroke-width="${uu * 1.2}"/></pattern>
      <pattern id="hatch" width="160" height="160" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V160" stroke="#000" stroke-opacity=".25" stroke-width="30"/></pattern>
      <pattern id="loop" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M0 100H200" stroke="${SYSTEMS.heating.color}" stroke-opacity=".5" stroke-width="22"/></pattern>
    </defs>`);
    h.push(`<rect x="${view.x - 50000}" y="${view.y - 50000}" width="${view.w + 100000}" height="${view.h + 100000}" fill="url(#gmaj)"/>`);
    if (p.underlay && p.underlay.floor === f && L.underlay) {
      const U = p.underlay;
      h.push(`<image href="${esc(U.src)}" x="${U.x}" y="${U.y}" width="${U.w * U.scale}" height="${U.h * U.scale}" opacity="${U.opacity ?? 0.5}" preserveAspectRatio="none" data-kind="underlay"/>`);
    }
    // Комнаты
    for (const r of p.rooms.filter(r => r.floor === f)) {
      const fin = design && L.finish ? finishColor(design, r) : null;
      h.push(`<polygon class="room ${sel()?.type === 'room' && sel().id === r.id ? 'sel' : ''}" data-kind="room" data-id="${r.id}" points="${r.poly.map(q => `${q.x},${q.y}`).join(' ')}" fill="${fin || r.color || ROOM_COLORS[r.type] || '#eee'}"/>`);
    }
    // Тёплый пол
    if (L.heating) for (const lp of p.heatingLoops.filter(x => x.floor === f)) h.push(`<rect data-kind="loop" data-id="${lp.id}" x="${lp.x}" y="${lp.y}" width="${lp.w}" height="${lp.h}" fill="url(#loop)" stroke="${SYSTEMS.heating.color}" stroke-width="${2 * uu}" stroke-dasharray="${8 * uu} ${5 * uu}" ${sel()?.id === lp.id ? 'stroke-opacity="1"' : 'stroke-opacity=".7"'}/>`);
    // Зоны дизайна
    if (design && mode === 'design' && L.furniture) for (const z of zonesOf(design)) h.push(`<rect class="zone" x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="120"/><text class="zone-label" x="${z.x + 120}" y="${z.y + 200}">${esc(z.name)}</text>`);
    // Конструкции
    if (L.structure) for (const s of p.structures.filter(s => s.floor === f)) h.push(structureSvg(s, sel()?.id === s.id, uu));
    // Стены
    if (L.walls) {
      for (const w of p.walls.filter(w => w.floor === f)) {
        const col = w.status === 'new' ? '#4b7d6a' : WALL_TYPES[w.type]?.color || '#333';
        const on = sel()?.type === 'wall' && sel().id === w.id;
        h.push(`<line class="wall ${on ? 'sel' : ''} ${w.status === 'demolish' ? 'demolish' : ''}" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${w.status === 'demolish' ? '#b4413a' : col}" stroke-width="${w.thickness}"/>`);
        if (w.status === 'new') h.push(`<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="url(#hatch)" stroke-width="${w.thickness}" pointer-events="none"/>`);
        if (mode !== 'mini') h.push(`<line class="wall-hit" data-kind="wall" data-id="${w.id}" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke-width="${w.thickness + 14 * uu}"/>`);
      }
      for (const o of p.openings) {
        const g = openingGeometry(p, o); if (!g || g.wall.floor !== f) continue;
        h.push(openingSvg(o, g, sel()?.id === o.id, uu, p));
      }
    }
    // Размеры
    if (L.dims && mode !== 'mini') {
      for (const w of p.walls.filter(w => w.floor === f)) {
        const len = dist(w.a, w.b); if (len < 400) continue;
        const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
        let n = { x: -(w.b.y - w.a.y) / len, y: (w.b.x - w.a.x) / len };
        const c = p.rooms.length ? centroid(p.rooms.filter(r => r.floor === f).flatMap(r => r.poly)) : m;
        if ((c.x - m.x) * n.x + (c.y - m.y) * n.y > 0) n = { x: -n.x, y: -n.y };
        const off = w.thickness / 2 + 22 * uu;
        let ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
        h.push(`<text class="dim" x="${m.x + n.x * off}" y="${m.y + n.y * off}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${m.x + n.x * off} ${m.y + n.y * off})" style="font-size:${11 * uu}px">${Math.round(len)}</text>`);
      }
    }
    // Подписи комнат
    for (const r of p.rooms.filter(r => r.floor === f)) {
      const c = centroid(r.poly), a = polygonArea(r.poly) / 1e6;
      const fs = Math.max(150, Math.min(240, Math.sqrt(polygonArea(r.poly)) / 14));
      h.push(`<text class="room-label" x="${c.x}" y="${c.y - fs * 0.2}" text-anchor="middle" style="font-size:${fs}px" pointer-events="none">${esc(r.name)}</text>`);
      h.push(`<text class="room-area" x="${c.x}" y="${c.y + fs}" text-anchor="middle" style="font-size:${fs * 0.75}px" pointer-events="none">${a.toFixed(1).replace('.', ',')} м²</text>`);
    }
    // Мебель
    if (design && L.furniture) {
      const editable = mode === 'design';
      for (const pl of design.placements) {
        const room = p.rooms.find(r => r.id === pl.roomId); if (!room || room.floor !== f) continue;
        h.push(placementSvg(pl, editable, sel()?.id === pl.id, badIds.has(pl.id), uu));
      }
    }
    // Трассы
    for (const r of p.routes.filter(r => r.floor === f && mode !== 'design')) {
      const layer = SYSTEMS[r.system]?.layer; if (!L[layer]) continue;
      const col = SYSTEMS[r.system].color, on = sel()?.id === r.id;
      const off = { cold: -40, hot: 40, sewer: 0, electric: 0, heating: 0, vent: 0 }[r.system] || 0;
      const pts = r.path.map(q => `${q.x + off},${q.y + off}`).join(' ');
      const wdt = r.system === 'sewer' ? 70 : r.system === 'vent' ? 90 : 34;
      h.push(`<polyline data-kind="route" data-id="${r.id}" points="${pts}" fill="none" stroke="${col}" stroke-width="${Math.max(wdt, 2.2 * uu) * (on ? 1.8 : 1)}" stroke-linejoin="round" ${r.via === 'ceiling' ? `stroke-dasharray="${8 * uu} ${5 * uu}"` : r.via === 'floor' ? `stroke-dasharray="${2 * uu} ${4 * uu}"` : ''} opacity="${on ? 1 : 0.85}" style="cursor:pointer"/>`);
      if (r.system === 'sewer' && r.path.length > 1) { const a = r.path[0], b = r.path[1]; const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; h.push(`<text x="${m.x}" y="${m.y - 80}" style="font:600 ${10 * uu}px var(--mono);fill:${col}" text-anchor="middle" pointer-events="none">i=${r.slope || 0}%</text>`); }
    }
    // Точки
    for (const pt of p.points.filter(x => x.floor === f)) {
      if (!L[pointLayer(pt.kind)]) continue;
      h.push(pointSvg(pt, sel()?.id === pt.id, uu, mode));
    }
    // Отметки проблем инженерии
    if (opts.showIssueMarks) for (const i of issues.filter(i => i.at)) h.push(`<circle class="issue-mark" cx="${i.at.x}" cy="${i.at.y}" r="${7 * uu}" fill-opacity=".85"><title>${esc(i.text)}</title></circle><text x="${i.at.x}" y="${i.at.y + 3.5 * uu}" text-anchor="middle" style="font:700 ${9 * uu}px var(--font);fill:#fff" pointer-events="none">!</text>`);
    // Предложения распознавания
    for (const [i, s] of (S.ui.proposals || []).entries()) h.push(`<line class="proposal" data-kind="proposal" data-i="${i}" x1="${s.a.x}" y1="${s.a.y}" x2="${s.b.x}" y2="${s.b.y}"><title>Нажмите, чтобы удалить предложение</title></line>`);
    // Ручки выбора
    h.push(selectionOverlay(uu));
    // Рисование
    h.push(drawOverlay(uu));
    svg.innerHTML = h.join('');
    opts.afterRender?.();
  }

  function finishColor(design, room) {
    const id = design.finishes?.[room.id]?.floor; const pr = id && productById(P(), id);
    return pr ? mix(pr.color, '#ffffff', 0.45) : null;
  }

  function selectionOverlay(uu) {
    const s = sel(); if (!s) return '';
    const p = P(); const r = 5.5 * uu;
    if (s.type === 'wall') {
      const w = p.walls.find(x => x.id === s.id); if (!w) return '';
      return `<circle class="handle" data-handle="a" cx="${w.a.x}" cy="${w.a.y}" r="${r}" stroke-width="${2 * uu}"/><circle class="handle" data-handle="b" cx="${w.b.x}" cy="${w.b.y}" r="${r}" stroke-width="${2 * uu}"/>`;
    }
    if (s.type === 'room') {
      const room = p.rooms.find(x => x.id === s.id); if (!room) return '';
      return room.poly.map((q, i) => `<rect class="handle" data-handle="v${i}" x="${q.x - r}" y="${q.y - r}" width="${2 * r}" height="${2 * r}" stroke-width="${2 * uu}"/>`).join('');
    }
    if (s.type === 'route') {
      const rt = p.routes.find(x => x.id === s.id); if (!rt) return '';
      return rt.path.slice(1, -1).map((q, i) => `<circle class="handle" data-handle="r${i + 1}" cx="${q.x}" cy="${q.y}" r="${r * 0.8}" stroke-width="${2 * uu}"/>`).join('');
    }
    if (s.type === 'loop' || s.type === 'structure') {
      const it = (s.type === 'loop' ? p.heatingLoops : p.structures).find(x => x.id === s.id); if (!it) return '';
      const x = s.type === 'loop' ? it.x + it.w : it.x + it.w / 2, y = s.type === 'loop' ? it.y + it.h : it.y + it.h / 2;
      return `<rect class="handle" data-handle="size" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" stroke-width="${2 * uu}" style="cursor:nwse-resize"/>`;
    }
    return '';
  }

  function drawOverlay(uu) {
    const out = [];
    const sw = 1.6 * uu;
    if (st.snap && st.mouse && ['wall', 'room-poly', 'room-rect', 'measure', 'calibrate', 'point', 'route'].includes(st.tool)) out.push(`<circle class="snap" cx="${st.snap.p.x}" cy="${st.snap.p.y}" r="${(st.snap.kind === 'end' ? 4.5 : 2.6) * uu}" ${st.snap.kind === 'grid' ? 'opacity=".55"' : ''}/>`);
    const d = st.draw;
    if (d?.type === 'wall' && st.snap) {
      const a = d.points.at(-1), b = st.snap.p;
      const thick = WALL_TYPES[opts.wallType?.() || 'partition'].thickness;
      out.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--accent)" stroke-opacity=".35" stroke-width="${thick}"/><line class="ghost" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${sw}"/>`);
      const L = dist(a, b);
      out.push(label({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, `${Math.round(L)} мм · ${Math.round(angleDeg(a, b))}°`, uu));
    }
    if (d?.type === 'room-poly') {
      const pts = [...d.points, st.snap?.p].filter(Boolean);
      out.push(`<polyline class="ghost" points="${pts.map(q => `${q.x},${q.y}`).join(' ')}" stroke-width="${sw}" fill="var(--accent)" fill-opacity=".08"/>`);
      d.points.forEach(q => out.push(`<circle cx="${q.x}" cy="${q.y}" r="${3 * uu}" fill="var(--accent)"/>`));
    }
    if (d?.type === 'rect' && st.snap) {
      const a = d.start, b = st.snap.p; const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(a.x - b.x), hh = Math.abs(a.y - b.y);
      out.push(`<rect class="ghost" x="${x}" y="${y}" width="${w}" height="${hh}" stroke-width="${sw}" fill="var(--accent)" fill-opacity=".08"/>`, label({ x: x + w / 2, y: y + hh / 2 }, `${Math.round(w)} × ${Math.round(hh)} мм · ${(w * hh / 1e6).toFixed(1)} м²`, uu));
    }
    if (d?.type === 'route' && st.snap) {
      const path = orthoPath(d.from, st.snap.p, d.orient);
      out.push(`<polyline class="ghost" points="${path.map(q => `${q.x},${q.y}`).join(' ')}" stroke-width="${2.2 * uu}" style="stroke:${SYSTEMS[d.system]?.color}"/>`, label(st.snap.p, `${fmtM(pathLength(path))} м`, uu, 1));
    }
    if (st.hover?.type === 'opening-ghost') {
      const g = st.hover;
      out.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="var(--warm)" stroke-width="${g.thick + 20}" stroke-opacity=".6"/>`);
    }
    if (st.measure) { const a = st.measure.a, b = st.measure.b || st.snap?.p; if (a && b) out.push(`<line class="ghost" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${sw}"/>`, label({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, `${Math.round(dist(a, b))} мм`, uu)); }
    if (st.calib?.a) { const { a, b } = st.calib; const e = b || st.snap?.p; if (e) out.push(`<line class="ghost" x1="${a.x}" y1="${a.y}" x2="${e.x}" y2="${e.y}" stroke-width="${sw}" style="stroke:var(--warm)"/>`); }
    return out.join('');
  }
  const label = (pt, text, uu, dy = -1) => `<g pointer-events="none"><rect x="${pt.x - text.length * 3.3 * uu}" y="${pt.y + dy * 14 * uu - 9 * uu}" width="${text.length * 6.6 * uu}" height="${17 * uu}" rx="${4 * uu}" fill="var(--ink)"/><text x="${pt.x}" y="${pt.y + dy * 14 * uu + 4 * uu}" text-anchor="middle" style="font:600 ${10.5 * uu}px var(--mono);fill:var(--surface)">${esc(text)}</text></g>`;

  // ——— Ввод ———
  let panning = null, spaceDown = false;
  // Жесты на сенсорном экране: щипок — масштаб, два пальца — сдвиг
  const touches = new Map(); let pinch = null;
  const touchMid = () => { const [a, b] = [...touches.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
  function startPinch() {
    if (st.drag) { st.drag = null; endGesture(); }
    panning = null; st.draw = null;
    const m = touchMid(), r = svg.getBoundingClientRect();
    pinch = { d0: m.d, w0: view.w, world: { x: view.x + (m.x - r.left) * view.w / r.width, y: view.y + (m.y - r.top) * view.w / r.width } };
  }
  function doPinch() {
    const m = touchMid(), r = svg.getBoundingClientRect();
    const w = Math.min(80000, Math.max(800, pinch.w0 * pinch.d0 / m.d)), k = w / r.width;
    view.w = w; view.h = r.height * k;
    view.x = pinch.world.x - (m.x - r.left) * k; view.y = pinch.world.y - (m.y - r.top) * k;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  }
  const touchEnd = e => { touches.delete(e.pointerId); if (touches.size < 2 && pinch) { pinch = null; render(); } };
  svg.addEventListener('pointercancel', touchEnd);
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const q = toWorld(e); const k = Math.exp(e.deltaY * 0.0012);
    const nw = Math.min(80000, Math.max(800, view.w * k)); const kk = nw / view.w;
    view.x = q.x - (q.x - view.x) * kk; view.y = q.y - (q.y - view.y) * kk; view.w = nw; view.h *= kk; view.cy = view.y + view.h / 2;
    render();
  }, { passive: false });

  svg.addEventListener('pointerdown', async e => {
    if (e.pointerType === 'touch') { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) { startPinch(); return; } if (touches.size > 2) return; }
    if (S.readOnly && st.tool !== 'select') return;
    const q = toWorld(e);
    if (e.button === 1 || e.button === 2 && !st.draw || spaceDown) { startPan(e); return; }
    if (e.button === 2) { finishDraw(); return; }
    svg.setPointerCapture(e.pointerId);
    const t = st.tool;
    const hit = e.target.closest('[data-kind],[data-handle]');
    if (t === 'select' || mode === 'mini') {
      if (mode === 'mini') { opts.onPick?.(hit?.dataset.kind, hit?.dataset.id, q); return; }
      if (hit?.dataset.handle) { startHandleDrag(hit.dataset.handle, q); return; }
      if (hit?.dataset.kind === 'proposal') { S.ui.proposals.splice(+hit.dataset.i, 1); render(); emit('proposals'); return; }
      if (!hit || hit.dataset.kind === 'underlay') { select(null); startPan(e); return; }
      const type = { placement: 'placement', point: 'point', route: 'route', opening: 'opening', wall: 'wall', room: 'room', structure: 'structure', loop: 'loop' }[hit.dataset.kind];
      if (!type) return;
      if (!opts.selectable || opts.selectable(type)) { select({ type, id: hit.dataset.id }); startMoveDrag(type, hit.dataset.id, q); }
      else { select(null); startPan(e); }
      return;
    }
    const sp = snapPoint(q, { from: st.draw?.points?.at(-1) || st.draw?.start || st.draw?.from, noAngle: e.altKey });
    st.snap = sp;
    if (t === 'wall') {
      if (!st.draw) st.draw = { type: 'wall', points: [sp.p] };
      else addWallSegment(sp.p);
    } else if (t === 'room-poly') {
      if (!st.draw) st.draw = { type: 'room-poly', points: [sp.p] };
      else if (st.draw.points.length > 2 && dist(sp.p, st.draw.points[0]) < 12 * u()) finishDraw();
      else st.draw.points.push(sp.p);
    } else if (t === 'room-rect' || t === 'loop') {
      st.draw = { type: 'rect', start: sp.p, tool: t };
    } else if (OPENING_LIBRARY[t]) {
      placeOpening(t, q);
    } else if (STRUCTURE_KINDS[t]) {
      const k = STRUCTURE_KINDS[t];
      const s = { id: uid('s'), floor: floor(), kind: t, x: sp.p.x, y: sp.p.y, w: k.w, h: k.h, rotation: 0 };
      commit(p => p.structures.push(s)); select({ type: 'structure', id: s.id });
    } else if (t === 'point') {
      const kind = opts.pointKind?.() || 'socket';
      const K = POINT_KINDS[kind];
      const room = roomAt(P(), sp.p);
      const h = kind === 'light' ? (room?.ceiling || 2700) : K.h;
      const pt = { id: uid('p'), floor: floor(), kind, x: Math.round(q.x / 10) * 10, y: Math.round(q.y / 10) * 10, h, power: K.power || 0, group: opts.defaultGroup?.(kind) || null };
      commit(p => p.points.push(pt)); select({ type: 'point', id: pt.id });
    } else if (t === 'route') {
      const ptHit = e.target.closest('[data-kind="point"]');
      const from = ptHit ? P().points.find(x => x.id === ptHit.dataset.id) : null;
      if (!st.draw) {
        if (!from) { toast('Начните трассу с точки (розетка, щиток, прибор, стояк)'); return; }
        st.draw = { type: 'route', from: { x: from.x, y: from.y }, fromId: from.id, system: opts.routeSystem?.(from) || 'electric', orient: 'auto' };
      } else {
        const to = from || null;
        const end = to ? { x: to.x, y: to.y } : sp.p;
        const path = orthoPath(st.draw.from, end, st.draw.orient);
        const sys = st.draw.system;
        const fromPt = P().points.find(x => x.id === st.draw.fromId);
        const group = sys === 'electric' ? (to?.group || fromPt?.group || null) : null;
        const r = { id: uid('rt'), floor: floor(), system: sys, from: st.draw.fromId, to: to?.id || null, path, via: opts.routeVia?.() || 'wall', slope: sys === 'sewer' ? 2 : 0, group };
        commit(p => p.routes.push(r));
        st.draw = to ? null : { ...st.draw, from: end, fromId: null };
        if (!to) { /* продолжаем трассу от точки излома */ }
        select({ type: 'route', id: r.id });
      }
    } else if (t === 'measure') {
      st.measure = !st.measure || st.measure.done ? { a: sp.p } : { a: st.measure.a, b: sp.p, done: true };
    } else if (t === 'calibrate') {
      if (!st.calib?.a) st.calib = { a: sp.p };
      else { st.calib.b = sp.p; const measured = dist(st.calib.a, st.calib.b); const a = st.calib; st.calib = null; opts.onCalibrate?.(measured, a); }
    }
    render();
  });

  svg.addEventListener('pointermove', e => {
    if (touches.has(e.pointerId)) { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pinch) { doPinch(); return; } }
    const q = toWorld(e);
    st.mouse = q;
    if (panning) { const k = u(); view.x = panning.vx - (e.clientX - panning.x) * k; view.y = panning.vy - (e.clientY - panning.y) * k; view.cy = view.y + view.h / 2; svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); return; }
    if (st.drag) { st.drag.move(q, e); return; }
    const t = st.tool;
    if (['wall', 'room-poly', 'room-rect', 'loop', 'measure', 'calibrate', 'point', 'route'].includes(t)) {
      st.snap = snapPoint(q, { from: st.draw?.points?.at(-1) || st.draw?.start || st.draw?.from, noAngle: e.altKey });
      render();
      opts.onDrawState?.(st);
    } else if (OPENING_LIBRARY[t]) {
      const g = openingPlacement(t, q); st.hover = g ? { type: 'opening-ghost', ...g } : null; render();
    }
  });

  svg.addEventListener('pointerup', e => {
    const wasPinch = !!pinch; touchEnd(e); if (wasPinch) return;
    if (panning) { panning = null; svg.style.cursor = ''; return; }
    if (st.drag) { const d = st.drag; st.drag = null; d.end?.(); return; }
    if (st.draw?.type === 'rect' && st.snap) {
      const a = st.draw.start, b = st.snap.p, tool = st.draw.tool; st.draw = null;
      if (Math.abs(a.x - b.x) > 300 && Math.abs(a.y - b.y) > 300) (tool === 'loop' ? createLoop : createRectRoom)(a, b);
      render();
    }
  });
  svg.addEventListener('dblclick', () => { if (st.draw) finishDraw(); });
  svg.addEventListener('contextmenu', e => e.preventDefault());

  const onKey = e => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.code === 'Space') { spaceDown = e.type === 'keydown'; return; }
    if (e.type !== 'keydown') return;
    if (e.key === 'Escape') { if (st.draw) finishDraw(); else { st.measure = null; st.calib = null; select(null); } render(); }
    if (e.key === 'Enter' && st.draw) finishDraw();
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel() && !S.readOnly) { e.preventDefault(); opts.onDelete?.(sel()) ?? deleteSelection(); }
    if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && sel()) opts.onRotate?.(sel());
    if (/^[0-9]$/.test(e.key) && st.draw?.type === 'wall') opts.onTypeLength?.(e.key);
  };
  document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKey);

  function startPan(e) { panning = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; svg.style.cursor = 'grabbing'; }

  function select(s) { S.ui.selection = s; opts.onSelect?.(s); render(); }

  // ——— Стены ———
  function addWallSegment(p2) {
    const a = st.draw.points.at(-1);
    if (dist(a, p2) < 50) return;
    const type = opts.wallType?.() || 'partition';
    const w = { id: uid('w'), floor: floor(), a: { ...a }, b: { ...p2 }, type, thickness: WALL_TYPES[type].thickness, status: opts.wallStatus?.() || 'existing' };
    commit(p => p.walls.push(w), { render: 'canvas' });
    st.draw.points.push(p2);
    if (st.draw.points.length > 2 && dist(p2, st.draw.points[0]) < 1) finishDraw();
  }
  function addWallByLength(lengthMm, angle) {
    if (st.draw?.type !== 'wall') return;
    const a = st.draw.points.at(-1);
    const ang = angle != null ? angle * Math.PI / 180 : st.snap ? Math.atan2(st.snap.p.y - a.y, st.snap.p.x - a.x) : 0;
    addWallSegment({ x: Math.round(a.x + Math.cos(ang) * lengthMm), y: Math.round(a.y + Math.sin(ang) * lengthMm) });
    render();
  }
  function finishDraw() {
    const d = st.draw; st.draw = null;
    if (d?.type === 'room-poly' && d.points.length >= 3) {
      const room = { id: uid('r'), floor: floor(), name: opts.roomName?.() || 'Комната', type: opts.roomType?.() || 'Гостиная', poly: d.points, ceiling: P().floors.find(x => x.id === floor())?.height || 2700 };
      room.color = ROOM_COLORS[room.type];
      commit(p => p.rooms.push(room)); select({ type: 'room', id: room.id });
    }
    opts.onDrawState?.(st);
    render();
  }
  function createRectRoom(a, b) {
    const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y), x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
    const type = opts.wallType?.() || 'partition'; const t = WALL_TYPES[type].thickness;
    const corners = [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
    const room = { id: uid('r'), floor: floor(), name: opts.roomName?.() || 'Комната', type: opts.roomType?.() || 'Гостиная', ceiling: P().floors.find(x => x.id === floor())?.height || 2700 };
    room.color = ROOM_COLORS[room.type];
    commit(p => {
      for (let i = 0; i < 4; i++) {
        const A = corners[i], B = corners[(i + 1) % 4];
        const covered = p.walls.some(w => w.floor === floor() && projectOnSegment(A, w.a, w.b).distance < 5 && projectOnSegment(B, w.a, w.b).distance < 5);
        if (!covered && opts.rectWithWalls?.() !== false) p.walls.push({ id: uid('w'), floor: floor(), a: A, b: B, type, thickness: t, status: opts.wallStatus?.() || 'existing' });
      }
      const inset = (opts.rectWithWalls?.() !== false) ? t / 2 : 0;
      room.poly = [{ x: x1 + inset, y: y1 + inset }, { x: x2 - inset, y: y1 + inset }, { x: x2 - inset, y: y2 - inset }, { x: x1 + inset, y: y2 - inset }];
      p.rooms.push(room);
    });
    select({ type: 'room', id: room.id });
  }
  function createLoop(a, b) {
    const lp = { id: uid('hl'), floor: floor(), x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y), step: 150 };
    const room = roomAt(P(), { x: lp.x + lp.w / 2, y: lp.y + lp.h / 2 }); lp.room = room?.id || null;
    commit(p => p.heatingLoops.push(lp)); select({ type: 'loop', id: lp.id });
  }

  // ——— Проёмы ———
  function openingPlacement(kind, q) {
    const p = P(); let best = null;
    for (const w of p.walls.filter(w => w.floor === floor())) {
      const pr = projectOnSegment(q, w.a, w.b);
      if (pr.distance < w.thickness / 2 + 20 * u() && (!best || pr.distance < best.d)) best = { w, d: pr.distance, t: pr.t };
    }
    if (!best) return null;
    const [width] = opts.openingSize?.(kind) || OPENING_LIBRARY[kind].presets[0];
    const len = dist(best.w.a, best.w.b);
    const offset = Math.max(width / 2 + 50, Math.min(len - width / 2 - 50, snap(best.t * len, 50)));
    if (width + 100 > len) return null;
    const ux = (best.w.b.x - best.w.a.x) / len, uy = (best.w.b.y - best.w.a.y) / len;
    const c = { x: best.w.a.x + ux * offset, y: best.w.a.y + uy * offset };
    return { wall: best.w, offset, a: { x: c.x - ux * width / 2, y: c.y - uy * width / 2 }, b: { x: c.x + ux * width / 2, y: c.y + uy * width / 2 }, thick: best.w.thickness };
  }
  function placeOpening(kind, q) {
    const g = openingPlacement(kind, q);
    if (!g) { toast('Наведите на стену, достаточно длинную для проёма'); return; }
    const [width, height] = opts.openingSize?.(kind) || OPENING_LIBRARY[kind].presets[0];
    const clash = P().openings.some(o => o.wall === g.wall.id && Math.abs(o.offset - g.offset) < (o.width + width) / 2);
    if (clash) { toast('Проёмы пересекаются — сдвиньте курсор'); return; }
    const o = { id: uid('o'), wall: g.wall.id, kind, offset: g.offset, width, height, sill: kind === 'window' ? (opts.windowSill?.() ?? OPENING_LIBRARY.window.sill) : 0, swing: 'left', side: 1 };
    commit(p => p.openings.push(o)); select({ type: 'opening', id: o.id });
    if (g.wall.type === 'bearing') toast('Проём в несущей стене требует согласования перепланировки', 'err');
  }

  // ——— Перетаскивание ———
  function connectedRefs(pt, exceptWall) {
    const p = P(); const refs = [];
    for (const w of p.walls) if (w.floor === floor() && w.id !== exceptWall) { if (dist(w.a, pt) < 1) refs.push(w.a); if (dist(w.b, pt) < 1) refs.push(w.b); }
    return refs;
  }
  function startHandleDrag(handle, q0) {
    const s = sel(); beginGesture();
    const p = P();
    if (s.type === 'wall') {
      const w = p.walls.find(x => x.id === s.id); const end = w[handle];
      const refs = [end, ...connectedRefs(end, w.id)];
      st.drag = { move(q, e) { const sp = snapPoint(q, { from: handle === 'a' ? w.b : w.a, noAngle: e.altKey }); for (const r of refs) { r.x = sp.p.x; r.y = sp.p.y; } st.snap = sp; render(); opts.onLiveChange?.(); }, end: () => wallDragEnd(w) };
    } else if (s.type === 'room') {
      const room = p.rooms.find(x => x.id === s.id); const v = room.poly[+handle.slice(1)];
      st.drag = { move(q, e) { const sp = snapPoint(q, { noAngle: true }); v.x = sp.p.x; v.y = sp.p.y; render(); opts.onLiveChange?.(); }, end: endGesture };
    } else if (s.type === 'route') {
      const rt = p.routes.find(x => x.id === s.id); const i = +handle.slice(1); const v = rt.path[i];
      const prev = rt.path[i - 1], next = rt.path[i + 1];
      st.drag = { move(q) { const nx = snap(q.x, 10), ny = snap(q.y, 10);
        // Сохраняем ортогональность соседних отрезков
        if (Math.abs(prev.x - v.x) < 1) prev.x = nx; else if (Math.abs(prev.y - v.y) < 1) prev.y = ny;
        if (Math.abs(next.x - v.x) < 1) next.x = nx; else if (Math.abs(next.y - v.y) < 1) next.y = ny;
        if (i - 1 === 0) { prev.x = rt.path[0].x; prev.y = rt.path[0].y; }
        v.x = nx; v.y = ny; render(); }, end: endGesture };
    } else if (s.type === 'loop' || s.type === 'structure') {
      const it = (s.type === 'loop' ? p.heatingLoops : p.structures).find(x => x.id === s.id);
      st.drag = { move(q) { if (s.type === 'loop') { it.w = Math.max(300, snap(q.x - it.x, 50)); it.h = Math.max(300, snap(q.y - it.y, 50)); } else { it.w = Math.max(100, snap((q.x - it.x) * 2, 50)); it.h = Math.max(100, snap((q.y - it.y) * 2, 50)); } render(); opts.onLiveChange?.(); }, end: endGesture };
    }
  }
  async function wallDragEnd(w) {
    endGesture();
    if (w.type === 'bearing' && !(await confirmDialog('Перенос несущей стены', 'Вы изменили несущую стену. Перенос несущих конструкций требует проекта и согласования. Оставить изменение?', 'Оставить'))) {
      const { undo } = await import('../store.js'); undo();
    }
  }
  function startMoveDrag(type, id, q0) {
    const p = P(); beginGesture();
    let moved = false;
    if (type === 'point') {
      const pt = p.points.find(x => x.id === id);
      const linked = p.routes.filter(r => r.from === id || r.to === id);
      const dx = q0.x - pt.x, dy = q0.y - pt.y;
      st.drag = { move(q) { moved = true; pt.x = Math.round((q.x - dx) / 10) * 10; pt.y = Math.round((q.y - dy) / 10) * 10;
        for (const r of linked) { const a = r.from === id ? pt : r.path[0], b = r.to === id ? pt : r.path.at(-1); r.path = orthoPath(r.from === id ? { x: pt.x, y: pt.y } : a, r.to === id ? { x: pt.x, y: pt.y } : b); }
        render(); opts.onLiveChange?.(); }, end: () => { endGesture(); } };
    } else if (type === 'placement') {
      const d = opts.getDesign?.(); const pl = d?.placements.find(x => x.id === id); if (!pl) return;
      const dx = q0.x - pl.x, dy = q0.y - pl.y;
      st.drag = { move(q) { moved = true; pl.x = snap(q.x - dx, 25); pl.y = snap(q.y - dy, 25); const room = roomAt(p, pl); if (room) pl.roomId = room.id; render(); opts.onLiveChange?.(); }, end: () => { endGesture(); } };
    } else if (type === 'opening') {
      const o = p.openings.find(x => x.id === id); const w = p.walls.find(x => x.id === o.wall); const len = dist(w.a, w.b);
      st.drag = { move(q) { moved = true; const pr = projectOnSegment(q, w.a, w.b); o.offset = Math.max(o.width / 2 + 20, Math.min(len - o.width / 2 - 20, snap(pr.t * len, 10))); render(); opts.onLiveChange?.(); }, end: endGesture };
    } else if (type === 'wall') {
      const w = p.walls.find(x => x.id === id);
      const refs = [...new Set([w.a, w.b, ...connectedRefs(w.a, w.id), ...connectedRefs(w.b, w.id)])];
      const orig = refs.map(r => ({ x: r.x, y: r.y }));
      st.drag = { move(q) { const dx = snap(q.x - q0.x, 50), dy = snap(q.y - q0.y, 50); if (dx || dy) moved = true; refs.forEach((r, i) => { r.x = orig[i].x + dx; r.y = orig[i].y + dy; }); render(); opts.onLiveChange?.(); }, end: () => moved ? wallDragEnd(w) : endGesture() };
    } else if (type === 'room' || type === 'structure' || type === 'loop') {
      const it = type === 'room' ? p.rooms.find(x => x.id === id) : (type === 'loop' ? p.heatingLoops : p.structures).find(x => x.id === id);
      if (type === 'room') { st.drag = { move() {}, end: endGesture }; return; } // комнату двигают стенами, вершины — ручками
      const ox = it.x, oy = it.y;
      st.drag = { move(q) { it.x = ox + snap(q.x - q0.x, 50); it.y = oy + snap(q.y - q0.y, 50); render(); }, end: endGesture };
    } else if (type === 'route') {
      st.drag = { move() {}, end: endGesture };
    }
  }

  function deleteSelection() {
    const s = sel(); if (!s) return;
    const p = P();
    if (s.type === 'wall') {
      const w = p.walls.find(x => x.id === s.id); if (!w) return;
      const doIt = () => { commit(pp => { pp.walls = pp.walls.filter(x => x.id !== s.id); pp.openings = pp.openings.filter(o => o.wall !== s.id); }); select(null); toast('Стена удалена (Ctrl+Z — отменить)'); };
      if (w.type === 'bearing') confirmDialog('Удаление несущей стены', 'Несущая стена удерживает конструкцию дома. Снос или изменение требуют проекта и согласования. Если стену планируется снести, лучше пометить её «под снос» — тогда снос попадёт в смету.', 'Всё равно удалить', true).then(ok => ok && doIt());
      else doIt();
      return;
    }
    const key = { room: 'rooms', opening: 'openings', point: 'points', route: 'routes', structure: 'structures', loop: 'heatingLoops' }[s.type];
    if (key) { commit(pp => { pp[key] = pp[key].filter(x => x.id !== s.id); if (s.type === 'point') pp.routes = pp.routes.filter(r => r.from !== s.id && r.to !== s.id); }); select(null); }
  }

  let fitted = false;
  const ro = new ResizeObserver(() => {
    if (!svg.clientWidth || !svg.clientHeight) return;
    if (!fitted) { fitted = true; fit(); } else { setViewBox(); render(); }
  });
  ro.observe(svg);

  // Снимок плана в оформлении ГОСТ для листа: вписываем план в область листа и возвращаем строку SVG
  function exportGost({ layers = null, systems = null, paperW = 270, paperH = 190 } = {}) {
    const p = P();
    const pts = [...p.walls.filter(w => w.floor === floor()).flatMap(w => [w.a, w.b]), ...p.rooms.filter(r => r.floor === floor()).flatMap(r => r.poly)];
    const b = pts.length ? bbox(pts) : { minX: 0, minY: 0, w: 10000, h: 7000 };
    const k = Math.max((b.w + 2000) / paperW, (b.h + 2000) / paperH); // мм плана на мм бумаги (масштаб 1:k)
    const W = paperW * k, H = paperH * k;
    const vb = `${b.minX + b.w / 2 - W / 2} ${b.minY + b.h / 2 - H / 2} ${W} ${H}`;
    forceGost = { k, layers: layers ? { ...p.layers, ...layers } : p.layers, systems };
    render();
    const clone = svg.cloneNode(true);
    clone.setAttribute('viewBox', vb); clone.setAttribute('width', paperW + 'mm'); clone.setAttribute('height', paperH + 'mm'); clone.removeAttribute('class');
    const out = new XMLSerializer().serializeToString(clone).replace(/var\(--mono, monospace\)/g, 'JetBrains Mono, Consolas, monospace').replace(/var\(--accent\)/g, '#2f5d50');
    forceGost = null; render();
    return { svg: out, scale: Math.round(k) };
  }

  return {
    svg, render, fit, select, exportGost,
    setTool(t) { st.tool = t; st.draw = null; st.measure = null; st.calib = null; st.hover = null; svg.style.cursor = t === 'select' ? '' : 'crosshair'; render(); },
    getTool: () => st.tool, isDrawing: () => !!st.draw, finishDraw, addWallByLength, deleteSelection,
    zoom(k) { const c = { x: view.x + view.w / 2, y: view.y + view.h / 2 }; view.w *= k; view.h *= k; view.x = c.x - view.w / 2; view.y = c.y - view.h / 2; view.cy = c.y; render(); },
    destroy() { ro.disconnect(); document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKey); svg.remove(); },
  };
}

// ——— Фигуры ———
function openingSvg(o, g, on, uu, p) {
  const t = g.wall.thickness;
  const out = [`<g data-kind="opening" data-id="${o.id}" style="cursor:pointer">`];
  out.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="var(--canvas)" stroke-width="${t + 6}"/>`);
  out.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="transparent" stroke-width="${t + 120}"/>`);
  const n = { x: g.normal.x * (o.side || 1), y: g.normal.y * (o.side || 1) };
  const col = on ? 'var(--accent)' : 'var(--ink-2)';
  const sw = Math.max(18, 1.3 * uu);
  if (o.kind === 'window' || o.kind === 'balcony') {
    for (const k of [-0.32, 0, 0.32]) out.push(`<line x1="${g.a.x + g.normal.x * t * k}" y1="${g.a.y + g.normal.y * t * k}" x2="${g.b.x + g.normal.x * t * k}" y2="${g.b.y + g.normal.y * t * k}" stroke="${o.kind === 'window' ? '#5f8fb0' : col}" stroke-width="${sw}"/>`);
    out.push(`<line x1="${g.a.x - g.normal.x * t / 2}" y1="${g.a.y - g.normal.y * t / 2}" x2="${g.a.x + g.normal.x * t / 2}" y2="${g.a.y + g.normal.y * t / 2}" stroke="${col}" stroke-width="${sw}"/><line x1="${g.b.x - g.normal.x * t / 2}" y1="${g.b.y - g.normal.y * t / 2}" x2="${g.b.x + g.normal.x * t / 2}" y2="${g.b.y + g.normal.y * t / 2}" stroke="${col}" stroke-width="${sw}"/>`);
  }
  if (o.kind === 'door' || o.kind === 'balcony') {
    const hinge = o.swing === 'right' ? g.b : g.a, other = o.swing === 'right' ? g.a : g.b;
    const W = o.kind === 'balcony' ? Math.min(800, o.width / 2) : o.width;
    const base = { x: hinge.x + n.x * t / 2, y: hinge.y + n.y * t / 2 };
    const leaf = { x: base.x + n.x * W, y: base.y + n.y * W };
    const dirToOther = { x: (other.x - hinge.x) / o.width, y: (other.y - hinge.y) / o.width };
    const arcEnd = { x: base.x + dirToOther.x * W, y: base.y + dirToOther.y * W };
    const cross = (leaf.x - base.x) * (arcEnd.y - base.y) - (leaf.y - base.y) * (arcEnd.x - base.x);
    out.push(`<line x1="${base.x}" y1="${base.y}" x2="${leaf.x}" y2="${leaf.y}" stroke="${col}" stroke-width="${sw * 1.6}"/>`);
    out.push(`<path d="M${leaf.x} ${leaf.y} A${W} ${W} 0 0 ${cross > 0 ? 1 : 0} ${arcEnd.x} ${arcEnd.y}" fill="none" stroke="${col}" stroke-width="${sw * 0.8}" stroke-dasharray="${4 * uu} ${3 * uu}"/>`);
  }
  if (o.kind === 'arch') out.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="${col}" stroke-width="${sw}" stroke-dasharray="${5 * uu} ${4 * uu}"/>`);
  if (on) out.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="var(--accent)" stroke-opacity=".35" stroke-width="${t + 40}"/>`);
  out.push('</g>');
  return out.join('');
}

function structureSvg(s, on, uu) {
  const x = s.x - s.w / 2, y = s.y - s.h / 2, sw = Math.max(16, 1.2 * uu);
  const stroke = on ? 'var(--accent)' : 'var(--ink-2)';
  let inner = '';
  if (s.kind === 'column') inner = `<rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" fill="#3a3833" stroke="${stroke}" stroke-width="${sw}"/>`;
  if (s.kind === 'stairs') { inner = `<rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" fill="var(--surface)" stroke="${stroke}" stroke-width="${sw}"/>`; for (let yy = y + 250; yy < y + s.h; yy += 250) inner += `<line x1="${x}" y1="${yy}" x2="${x + s.w}" y2="${yy}" stroke="${stroke}" stroke-width="${sw * 0.7}"/>`; inner += `<path d="M${s.x} ${y + s.h - 150}V${y + 150}l-120 160M${s.x} ${y + 150}l120 160" stroke="${stroke}" fill="none" stroke-width="${sw}"/>`; }
  if (s.kind === 'niche') inner = `<rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" fill="url(#hatch)" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${6 * uu} ${4 * uu}"/>`;
  if (s.kind === 'slope') inner = `<rect x="${x}" y="${y}" width="${s.w}" height="${s.h}" fill="#000" fill-opacity=".06" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${10 * uu} ${5 * uu}"/><text x="${s.x}" y="${s.y}" text-anchor="middle" style="font:600 ${10 * uu}px var(--font);fill:var(--muted)">скос h=${s.lowHeight || 1200}</text>`;
  return `<g data-kind="structure" data-id="${s.id}" style="cursor:move" transform="rotate(${s.rotation || 0} ${s.x} ${s.y})">${inner}</g>`;
}

function placementSvg(pl, editable, on, bad, uu) {
  const kr = KIND_RULES[pl.kind] || {};
  const f = footprint(pl);
  const product = productById(S.project, pl.productId);
  const color = product?.color || '#ccc';
  if (kr.ceiling) return `<g class="item ${on ? 'sel' : ''}" data-kind="placement" data-id="${pl.id}"><circle cx="${pl.x}" cy="${pl.y}" r="${Math.max(120, Math.min(pl.w, 500) / 2)}" fill="#ffd77a" fill-opacity=".35" stroke="#d6a32f" stroke-width="${on ? 40 : 14}"/><circle cx="${pl.x}" cy="${pl.y}" r="60" fill="#d6a32f"/></g>`;
  const opacity = kr.floor ? 0.45 : kr.wall ? 0.8 : 0.92;
  const lbl = (kr.label || '').slice(0, 14);
  const fsz = Math.min(130, Math.max(70, Math.min(f.w, f.h) / 4));
  return `<g class="item ${on ? 'sel' : ''} ${bad ? 'bad' : ''}" data-kind="placement" data-id="${pl.id}" style="${editable ? '' : 'pointer-events:none'}">
    <rect class="body" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="${Math.min(80, f.w / 6, f.h / 6)}" fill="${color}" fill-opacity="${opacity}"/>
    ${!kr.floor && !kr.wall ? frontMark(pl, f) : ''}
    ${Math.min(f.w, f.h) > 380 && !kr.floor ? `<text x="${pl.x}" y="${pl.y + fsz / 3}" text-anchor="middle" style="font-size:${fsz}px">${esc(lbl)}</text>` : ''}
  </g>`;
}
function frontMark(pl, f) {
  const r = ((pl.rotation || 0) % 360 + 360) % 360; const k = 50;
  if (r === 0) return `<line x1="${f.x + k}" y1="${f.y + f.h - k}" x2="${f.x + f.w - k}" y2="${f.y + f.h - k}" stroke="#000" stroke-opacity=".25" stroke-width="22"/>`;
  if (r === 180) return `<line x1="${f.x + k}" y1="${f.y + k}" x2="${f.x + f.w - k}" y2="${f.y + k}" stroke="#000" stroke-opacity=".25" stroke-width="22"/>`;
  if (r === 90) return `<line x1="${f.x + k}" y1="${f.y + k}" x2="${f.x + k}" y2="${f.y + f.h - k}" stroke="#000" stroke-opacity=".25" stroke-width="22"/>`;
  return `<line x1="${f.x + f.w - k}" y1="${f.y + k}" x2="${f.x + f.w - k}" y2="${f.y + f.h - k}" stroke="#000" stroke-opacity=".25" stroke-width="22"/>`;
}

function pointSvg(pt, on, uu, mode) {
  const col = PT_COLOR(pt.kind);
  const r = Math.max(110, 10 * uu) * (mode === 'design' ? 0.6 : 1);
  const interactive = mode === 'engineering' || mode === 'plan' ? '' : 'pointer-events:none;opacity:.5';
  if (pt.kind === 'radiator') return `<g class="pt ${on ? 'sel' : ''}" data-kind="point" data-id="${pt.id}" style="${interactive}"><rect x="${pt.x - 400}" y="${pt.y - 60}" width="800" height="120" rx="20" fill="${SYSTEMS.heating.color}" stroke="${on ? 'var(--accent)' : '#fff'}" stroke-width="${on ? 40 : 14}"/>${[...Array(7)].map((_, i) => `<line x1="${pt.x - 300 + i * 100}" y1="${pt.y - 60}" x2="${pt.x - 300 + i * 100}" y2="${pt.y + 60}" stroke="#fff" stroke-width="10" opacity=".6"/>`).join('')}</g>`;
  return `<g class="pt ${on ? 'sel' : ''}" data-kind="point" data-id="${pt.id}" style="${interactive}">
    ${on ? `<circle cx="${pt.x}" cy="${pt.y}" r="${r * 1.45}" fill="var(--accent)" fill-opacity=".25"/>` : ''}
    ${pointGlyph(pt.kind, pt.x, pt.y, r)}
    <title>${esc(POINT_KINDS[pt.kind]?.name || pt.kind)} · h=${pt.h} мм</title></g>`;
}

function mix(a, b, t) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const c = [16, 8, 0].map(s => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t));
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

// Статичная миниатюра плана для карточек
export function miniPlan(p, design = null, { floor = p.activeFloor, highlight = null } = {}) {
  const pts = [...p.walls.filter(w => w.floor === floor).flatMap(w => [w.a, w.b]), ...p.rooms.filter(r => r.floor === floor).flatMap(r => r.poly)];
  if (!pts.length) return `<svg viewBox="0 0 100 60"><text x="50" y="32" text-anchor="middle" font-size="6" fill="#999">Пустой план</text></svg>`;
  const b = bbox(pts); const pad = 500;
  const out = [`<svg viewBox="${b.minX - pad} ${b.minY - pad} ${b.w + pad * 2} ${b.h + pad * 2}" preserveAspectRatio="xMidYMid meet">`];
  for (const r of p.rooms.filter(r => r.floor === floor)) {
    let fill = r.color || '#eee';
    if (design) { const id = design.finishes?.[r.id]?.floor; const pr = id && productById(p, id); if (pr) fill = mix(pr.color, '#ffffff', 0.5); }
    out.push(`<polygon points="${r.poly.map(q => `${q.x},${q.y}`).join(' ')}" fill="${fill}" ${highlight === r.id ? 'stroke="var(--accent)" stroke-width="60"' : ''}/>`);
  }
  for (const w of p.walls.filter(w => w.floor === floor)) out.push(`<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${WALL_TYPES[w.type]?.color || '#333'}" stroke-width="${w.thickness}" stroke-linecap="square"/>`);
  for (const o of p.openings) { const g = openingGeometry(p, o); if (g && g.wall.floor === floor) out.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="var(--canvas)" stroke-width="${g.wall.thickness + 6}"/>`); }
  if (design) for (const pl of design.placements) {
    const kr = KIND_RULES[pl.kind] || {}; if (kr.ceiling || kr.wall) continue;
    const f = footprint(pl); const pr = productById(p, pl.productId);
    out.push(`<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="40" fill="${pr?.color || '#ccc'}" fill-opacity="${kr.floor ? 0.4 : 0.9}" stroke="#000" stroke-opacity=".3" stroke-width="12"/>`);
  }
  out.push('</svg>');
  return out.join('');
}
