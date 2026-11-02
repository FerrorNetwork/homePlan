// План в чертёжном оформлении (ГОСТ 21.501, 21.210, 21.205, 21.206, ГОСТ 2.307 для размеров):
// монохромные линии, несущие стены со штриховкой, размерные цепи с засечками, номера и площади помещений,
// условные обозначения и буквенно-цифровые коды трубопроводов на линиях.
// k — сколько единиц плана (мм) приходится на 1 мм «бумаги»: так размеры текста и линий одинаковы на экране и в PDF.
import { WALL_TYPES, POINT_KINDS, SYSTEMS, openingGeometry, pointLayer, pointWallFrame, routeLength } from '../core/model.js';
import { dist, centroid, polygonArea, pathLength } from '../core/geometry.js';
import { gostGlyph, PIPE_CODES, PIPE_DIAM } from './symbols.js';
import { esc } from '../ui.js';

const INK = '#1d1c19';

export function gostPlanSvg(p, { floor = p.activeFloor, layers = p.layers, k = 30, selectedId = null, interactive = true, systems = null } = {}) {
  const h = [];
  const lw = t => Math.max(0.05, t) * k; // толщина линии в мм бумаги
  const fs = t => t * k;                 // высота шрифта в мм бумаги
  const txt = (x, y, s, size, extra = '') => `<text x="${x}" y="${y}" style="font:${extra.includes('bold') ? 700 : 500} ${fs(size)}px var(--mono, monospace);fill:${INK};paint-order:stroke;stroke:#fff;stroke-width:${fs(size) * 0.35}px;stroke-linejoin:round" ${extra.replace('bold', '')}>${esc(s)}</text>`;
  const walls = p.walls.filter(w => w.floor === floor);
  const rooms = p.rooms.filter(r => r.floor === floor);
  const show = sys => (!systems || systems.includes(sys)) && layers[SYSTEMS[sys]?.layer] !== false;

  h.push(`<defs><pattern id="gost-hatch" width="${fs(2)}" height="${fs(2)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${fs(2)}" height="${fs(2)}" fill="#fff"/><path d="M0 0V${fs(2)}" stroke="${INK}" stroke-width="${lw(0.18)}"/></pattern>
    <pattern id="gost-new" width="${fs(2.4)}" height="${fs(2.4)}" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="${fs(2.4)}" height="${fs(2.4)}" fill="#fff"/><path d="M0 0V${fs(2.4)}" stroke="${INK}" stroke-width="${lw(0.12)}" stroke-dasharray="${fs(0.6)} ${fs(0.6)}"/></pattern>
    <marker id="gost-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 1L10 5L0 9Z" fill="${INK}"/></marker></defs>`);
  h.push(`<rect x="-1e6" y="-1e6" width="2e6" height="2e6" fill="#fff"/>`);
  // Помещения (контур для выбора)
  for (const r of rooms) h.push(`<polygon data-kind="room" data-id="${r.id}" points="${r.poly.map(q => `${q.x},${q.y}`).join(' ')}" fill="#fff"/>`);
  // Стены: сначала контур (чёрная широкая линия), затем заливка — так стыки стен сливаются без лишних линий
  if (layers.walls !== false) {
    const stroke = lw(0.5);
    for (const w of walls) h.push(`<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${INK}" stroke-width="${w.thickness + stroke * 2}" stroke-linecap="square" ${w.status === 'demolish' ? `stroke-dasharray="${fs(3)} ${fs(1.5)}"` : ''}/>`);
    for (const w of walls) {
      const fill = w.status === 'demolish' ? '#fff' : w.status === 'new' ? 'url(#gost-new)' : w.type === 'bearing' ? 'url(#gost-hatch)' : '#fff';
      h.push(`<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${fill}" stroke-width="${w.thickness}" stroke-linecap="square"/>`);
      if (interactive) h.push(`<line class="wall-hit" data-kind="wall" data-id="${w.id}" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="transparent" stroke-width="${w.thickness + fs(2)}"/>`);
    }
    // Проёмы
    for (const o of p.openings) {
      const g = openingGeometry(p, o); if (!g || g.wall.floor !== floor) continue;
      const t = g.wall.thickness, n = g.normal;
      h.push(`<g data-kind="opening" data-id="${o.id}"><line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="#fff" stroke-width="${t + stroke * 2 + 2}"/>`);
      for (const e of [g.a, g.b]) h.push(`<line x1="${e.x - n.x * t / 2}" y1="${e.y - n.y * t / 2}" x2="${e.x + n.x * t / 2}" y2="${e.y + n.y * t / 2}" stroke="${INK}" stroke-width="${stroke}"/>`);
      if (o.kind === 'window' || o.kind === 'balcony') for (const s of [-0.5, -0.15, 0.15, 0.5]) h.push(`<line x1="${g.a.x + n.x * t * s}" y1="${g.a.y + n.y * t * s}" x2="${g.b.x + n.x * t * s}" y2="${g.b.y + n.y * t * s}" stroke="${INK}" stroke-width="${lw(Math.abs(s) === 0.5 ? 0.35 : 0.18)}"/>`);
      if (o.kind === 'door' || o.kind === 'balcony') {
        const side = o.side || 1, nn = { x: n.x * side, y: n.y * side };
        const hinge = o.swing === 'right' ? g.b : g.a, other = o.swing === 'right' ? g.a : g.b;
        const W = o.kind === 'balcony' ? Math.min(800, o.width / 2) : o.width;
        const base = { x: hinge.x + nn.x * t / 2, y: hinge.y + nn.y * t / 2 }, leaf = { x: base.x + nn.x * W, y: base.y + nn.y * W };
        const d = { x: (other.x - hinge.x) / o.width, y: (other.y - hinge.y) / o.width }, arcEnd = { x: base.x + d.x * W, y: base.y + d.y * W };
        const cross = (leaf.x - base.x) * (arcEnd.y - base.y) - (leaf.y - base.y) * (arcEnd.x - base.x);
        h.push(`<line x1="${base.x}" y1="${base.y}" x2="${leaf.x}" y2="${leaf.y}" stroke="${INK}" stroke-width="${lw(0.35)}"/><path d="M${leaf.x} ${leaf.y}A${W} ${W} 0 0 ${cross > 0 ? 1 : 0} ${arcEnd.x} ${arcEnd.y}" fill="none" stroke="${INK}" stroke-width="${lw(0.18)}"/>`);
      }
      if (o.kind === 'arch') h.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="${INK}" stroke-width="${lw(0.18)}" stroke-dasharray="${fs(2)} ${fs(1)}"/>`);
      h.push('</g>');
    }
  }
  // Размерные цепи по ГОСТ 2.307: выносные линии, засечки 45°, размер над линией
  if (layers.dims !== false) {
    const c = rooms.length ? centroid(rooms.flatMap(r => r.poly)) : { x: 0, y: 0 };
    for (const w of walls) {
      const len = dist(w.a, w.b); if (len < 400) continue;
      const ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len;
      let n = { x: -uy, y: ux };
      const m = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
      if ((c.x - m.x) * n.x + (c.y - m.y) * n.y > 0) n = { x: -n.x, y: -n.y };
      const off = w.thickness / 2 + fs(7), ext = fs(2);
      const A = { x: w.a.x + n.x * off, y: w.a.y + n.y * off }, B = { x: w.b.x + n.x * off, y: w.b.y + n.y * off };
      const tick = e => `<line x1="${e.x - (ux + n.x) * fs(1.2)}" y1="${e.y - (uy + n.y) * fs(1.2)}" x2="${e.x + (ux + n.x) * fs(1.2)}" y2="${e.y + (uy + n.y) * fs(1.2)}" stroke="${INK}" stroke-width="${lw(0.35)}"/>`;
      h.push(`<g pointer-events="none"><line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="${INK}" stroke-width="${lw(0.18)}"/>`);
      for (const [e, s] of [[w.a, A], [w.b, B]]) h.push(`<line x1="${e.x + n.x * (w.thickness / 2 + fs(1))}" y1="${e.y + n.y * (w.thickness / 2 + fs(1))}" x2="${s.x + n.x * ext}" y2="${s.y + n.y * ext}" stroke="${INK}" stroke-width="${lw(0.18)}"/>${tick(s)}`);
      let ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
      const tp = { x: (A.x + B.x) / 2 + n.x * fs(1.2), y: (A.y + B.y) / 2 + n.y * fs(1.2) };
      h.push(`<text x="${tp.x}" y="${tp.y}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang} ${tp.x} ${tp.y})" style="font:500 ${fs(2.5)}px var(--mono, monospace);fill:${INK}">${Math.round(len)}</text></g>`);
    }
  }
  // Номера помещений в кружках и площади (подчёркнуты) — экспликация на листе
  rooms.forEach((r, i) => {
    const cc = centroid(r.poly), a = (polygonArea(r.poly) / 1e6).toFixed(2).replace('.', ',');
    h.push(`<g pointer-events="none"><circle cx="${cc.x}" cy="${cc.y - fs(4)}" r="${fs(2.6)}" fill="#fff" stroke="${INK}" stroke-width="${lw(0.25)}"/><text x="${cc.x}" y="${cc.y - fs(4) + fs(1)}" text-anchor="middle" style="font:700 ${fs(2.8)}px var(--mono, monospace);fill:${INK}">${i + 1}</text>
      <text x="${cc.x}" y="${cc.y + fs(1.6)}" text-anchor="middle" style="font:600 ${fs(2.8)}px var(--mono, monospace);fill:${INK};text-decoration:underline">${a}</text></g>`);
  });
  // Тёплый пол
  if (show('heating')) for (const lp of p.heatingLoops.filter(x => x.floor === floor)) h.push(`<g data-kind="loop" data-id="${lp.id}"><rect x="${lp.x}" y="${lp.y}" width="${lp.w}" height="${lp.h}" fill="none" stroke="${INK}" stroke-width="${lw(0.35)}" stroke-dasharray="${fs(3)} ${fs(1)} ${fs(0.6)} ${fs(1)}"/>${txt(lp.x + fs(1.5), lp.y + fs(4), 'ТП', 2.5, 'bold')}</g>`);
  // Трассы
  const groupNo = id => p.groups.findIndex(g => g.id === id) + 1;
  for (const r of p.routes.filter(x => x.floor === floor)) {
    if (!show(r.system)) continue;
    const off = { cold: -1.6, hot: 1.6 }[r.system] || 0;
    const path = r.path.map(q => ({ x: q.x + off * k, y: q.y + off * k }));
    const width = r.system === 'sewer' ? 0.7 : r.system === 'vent' ? 0.5 : r.system === 'electric' ? 0.4 : 0.5;
    const dash = r.system === 'vent' ? `stroke-dasharray="${fs(4)} ${fs(1.5)}"` : r.system === 'electric' && r.via === 'ceiling' ? `stroke-dasharray="${fs(5)} ${fs(1.2)}"` : '';
    const on = selectedId === r.id;
    h.push(`<g data-kind="route" data-id="${r.id}" style="cursor:pointer"><polyline points="${path.map(q => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="${on ? 'var(--accent)' : INK}" stroke-width="${lw(width) * (on ? 2 : 1)}" stroke-linejoin="round" ${dash}/>`);
    if (interactive) h.push(`<polyline points="${path.map(q => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="transparent" stroke-width="${fs(3)}"/>`);
    // Подпись на самом длинном участке: код трубопровода и диаметр либо номер группы и кабель
    let best = 1, bl = 0;
    for (let i = 1; i < path.length; i++) { const L = dist(path[i - 1], path[i]); if (L > bl) { bl = L; best = i; } }
    if (bl > fs(10)) {
      const a = path[best - 1], b = path[best];
      let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; if (ang > 90 || ang < -90) ang += 180;
      const g = p.groups.find(x => x.id === r.group);
      const label = r.system === 'electric' ? `гр.${groupNo(r.group) || '?'}${g ? ` ВВГнг-LS ${g.cable}` : ''}` : `${PIPE_CODES[r.system]} ${PIPE_DIAM[r.system]}${r.system === 'sewer' ? ` i=${String((r.slope || 0) / 100).replace('.', ',')}` : ''}`;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      h.push(`<text x="${mx}" y="${my - fs(0.9)}" text-anchor="middle" transform="rotate(${ang} ${mx} ${my})" style="font:600 ${fs(2)}px var(--mono, monospace);fill:${INK};paint-order:stroke;stroke:#fff;stroke-width:${fs(0.8)}px" pointer-events="none">${esc(label)}</text>`);
      if (r.system === 'sewer' && (r.slope || 0) > 0) {
        // Стрелка уклона по направлению стока (к стояку — началу трассы)
        const u = { x: (a.x - b.x) / bl, y: (a.y - b.y) / bl };
        const s = { x: mx + u.x * fs(6) - u.y * fs(2.5), y: my + u.y * fs(6) + u.x * fs(2.5) };
        h.push(`<line x1="${s.x - u.x * fs(4)}" y1="${s.y - u.y * fs(4)}" x2="${s.x + u.x * fs(4)}" y2="${s.y + u.y * fs(4)}" stroke="${INK}" stroke-width="${lw(0.25)}" marker-end="url(#gost-arrow)" pointer-events="none"/>`);
      }
    }
    h.push('</g>');
  }
  // Условные обозначения точек
  const riserNo = {}; let rn = 0;
  for (const pt of p.points.filter(x => x.floor === floor)) {
    if (layers[pointLayer(pt.kind)] === false) continue;
    const sys = POINT_KINDS[pt.kind]?.system;
    if (systems && !systems.includes(sys === 'water' ? 'cold' : sys) && !(sys === 'water' && systems.some(s => ['cold', 'hot', 'sewer'].includes(s)))) continue;
    const onWall = !['light', 'riser', 'junction'].includes(pt.kind);
    const fr = onWall ? pointWallFrame(p, pt) : { x: pt.x, y: pt.y, nx: 0, ny: 1 };
    const useFrame = onWall && fr.d < 500;
    const x = useFrame ? fr.x : pt.x, y = useFrame ? fr.y : pt.y;
    const ang = Math.atan2(-fr.nx, fr.ny) * 180 / Math.PI;
    const r = fs(2.4);
    h.push(`<g class="pt ${selectedId === pt.id ? 'sel' : ''}" data-kind="point" data-id="${pt.id}" style="cursor:pointer">`);
    if (selectedId === pt.id) h.push(`<circle cx="${x}" cy="${y}" r="${r * 1.7}" fill="var(--accent)" fill-opacity=".2"/>`);
    h.push(gostGlyph(pt.kind, x, y, r, useFrame ? ang : 0, INK));
    if (interactive) h.push(`<circle cx="${x}" cy="${y}" r="${r * 1.2}" fill="transparent"/>`);
    // Высота установки для электроустановочных изделий (в примечаниях листа — «h — от чистого пола»)
    if (sys === 'electric' && !['light', 'panel', 'junction'].includes(pt.kind)) {
      const tx = x + fr.nx * r * 2.6 + fr.ny * r * 1.2, ty = y + fr.ny * r * 2.6 - fr.nx * r * 1.2;
      h.push(`<text x="${tx}" y="${ty}" text-anchor="middle" style="font:500 ${fs(1.7)}px var(--mono, monospace);fill:${INK}" pointer-events="none">${pt.h}</text>`);
    }
    if (pt.kind === 'riser') { rn++; riserNo[pt.id] = rn; h.push(txt(x + r * 1.4, y - r * 1.2, `Ст В1-${rn}, Т3-${rn}, К1-${rn}`, 2, 'bold')); }
    if (sys === 'electric' && pt.kind === 'panel') h.push(txt(x + r * 1.6, y - r * 0.4, 'ЩК', 2.5, 'bold'));
    h.push('</g>');
  }
  return h.join('');
}

// Спецификация оборудования, изделий и материалов (форма по ГОСТ 21.110-2013)
export function gostSpecification(p) {
  const rows = [];
  const cnt = kinds => p.points.filter(x => kinds.includes(x.kind)).length;
  const len = (sys, filter = () => true) => p.routes.filter(r => r.system === sys && filter(r)).reduce((s, r) => s + routeLength(r), 0) / 1000;
  const add = (section, name, type, unit, qty, note = '') => { if (qty > 0) rows.push({ section, name, type, unit, qty: Math.round(qty * 10) / 10, note }); };
  add('Электрооборудование', 'Щиток квартирный навесной/встраиваемый, 24 модуля', 'ЩРН/ЩРВ-24', 'шт', cnt(['panel']));
  for (const a of [...new Set(p.groups.map(g => g.breaker))].sort((x, y) => x - y)) {
    const gs = p.groups.filter(g => g.breaker === a);
    add('Электрооборудование', `Выключатель автоматический 1P, характеристика C, ${a} А`, `ВА C${a}`, 'шт', gs.filter(g => !g.rcd).length);
    add('Электрооборудование', `Выключатель дифференциального тока (дифавтомат) 1P+N, C${a} А, 30 мА, тип A`, `АВДТ C${a}/30мА`, 'шт', gs.filter(g => g.rcd).length);
  }
  add('Электрооборудование', 'Розетка штепсельная 2P+PE, 16 А, скрытой установки', 'IP20', 'шт', cnt(['socket', 'socket-kitchen']));
  add('Электрооборудование', 'Розетка силовая 2P+PE, 32 А, для электроплиты', 'IP44', 'шт', cnt(['socket-power']));
  add('Электрооборудование', 'Выключатель одноклавишный, 10 А, скрытой установки', 'IP20', 'шт', cnt(['switch']));
  add('Электрооборудование', 'Светильник потолочный (по проекту дизайна)', '—', 'шт', cnt(['light']));
  add('Электрооборудование', 'Светильник настенный (бра)', '—', 'шт', cnt(['wall-light']));
  add('Электрооборудование', 'Коробка ответвительная для скрытой проводки', 'Ø80', 'шт', cnt(['junction']));
  const cables = {};
  for (const r of p.routes.filter(r => r.system === 'electric')) { const g = p.groups.find(x => x.id === r.group); const c = g?.cable || '3×2,5'; cables[c] = (cables[c] || 0) + routeLength(r) / 1000; }
  for (const [c, m] of Object.entries(cables)) add('Кабели', `Кабель силовой медный, не распространяющий горение, с низким дымо- и газовыделением`, `ВВГнг(А)-LS ${c}`, 'м', m * 1.1, 'с запасом 10%');
  add('Водопровод и канализация', 'Труба полипропиленовая PN20, хозяйственно-питьевой водопровод В1', 'PPR Ø20', 'м', len('cold') * 1.1, 'с запасом 10%');
  add('Водопровод и канализация', 'Труба полипропиленовая армированная PN25, горячее водоснабжение Т3', 'PPR-AL Ø20', 'м', len('hot') * 1.1, 'с запасом 10%');
  add('Водопровод и канализация', 'Труба канализационная полипропиленовая К1', 'ПП Ø50', 'м', len('sewer') * 1.1, 'уклон не менее 0,02');
  add('Водопровод и канализация', 'Коллектор распределительный с запорной арматурой', '—', 'шт', cnt(['collector']));
  for (const [k, n] of [['kitchen-sink', 'Мойка кухонная'], ['sink', 'Умывальник'], ['bath', 'Ванна'], ['shower', 'Поддон/кабина душевая'], ['toilet', 'Унитаз'], ['washer', 'Подключение стиральной машины'], ['dishwasher', 'Подключение посудомоечной машины']]) add('Водопровод и канализация', n, '—', 'шт', cnt([k]), 'точка подключения');
  add('Отопление', 'Радиатор отопления (по теплотехническому расчёту)', '—', 'шт', cnt(['radiator']));
  add('Отопление', 'Труба отопления Т1/Т2', 'PEX/PPR Ø20', 'м', len('heating') * 1.1);
  add('Отопление', 'Водяной тёплый пол (контур)', 'PEX Ø16', 'м²', p.heatingLoops.reduce((s, l) => s + l.w * l.h / 1e6, 0));
  add('Вентиляция', 'Решётка вентиляционная / вытяжка', '—', 'шт', cnt(['vent-channel', 'hood']));
  add('Вентиляция', 'Воздуховод', 'Ø125', 'м', len('vent'));
  return rows;
}
