// Сервис раскладки плитки (раздел 6 ТЗ). Независимый модуль: вызывается из редактора, дизайна и сметы.
// Поверхность — многоугольник в локальных координатах (мм), y направлен вниз.
import { clipByConvex, polygonArea, bbox, rotatePoint, dist, projectOnSegment } from './geometry.js';
import { openingGeometry, POINT_KINDS } from './model.js';

export const PATTERNS = {
  straight: { name: 'Прямая', waste: 10 },
  half: { name: 'Со сдвигом 1/2', waste: 10 },
  third: { name: 'Со сдвигом 1/3', waste: 10 },
  diagonal: { name: 'Диагональ', waste: 15 },
  herringbone: { name: 'Ёлочка', waste: 15 },
  hex: { name: 'Шестигранник', waste: 12 },
};
export const STARTS = { corner: 'От угла', center: 'От центра', door: 'От двери', visible: 'От видимой стороны' };

// ——— Поверхности ———
export function surfaceFromSpec(p, spec, design) {
  const room = p.rooms.find(r => r.id === spec.roomId);
  if (!room) return null;
  if (spec.type === 'floor') {
    const b = bbox(room.poly);
    const poly = room.poly.map(q => ({ x: q.x - b.minX, y: q.y - b.minY }));
    const obstacles = [];
    for (const s of p.structures.filter(s => s.floor === room.floor && s.kind === 'column')) obstacles.push({ label: 'Колонна', poly: rectPoly(s.x - s.w / 2 - b.minX, s.y - s.h / 2 - b.minY, s.w, s.h) });
    if (spec.excludeFixtures && design) for (const pl of design.placements.filter(x => x.roomId === room.id && ['bath', 'shower', 'kitchen-set', 'vanity', 'wardrobe'].includes(x.kind))) {
      const swap = pl.rotation % 180 !== 0, w = swap ? pl.d : pl.w, h = swap ? pl.w : pl.d;
      obstacles.push({ label: pl.kind === 'bath' ? 'Подиум ванны' : 'Встроенная мебель', poly: rectPoly(pl.x - w / 2 - b.minX, pl.y - h / 2 - b.minY, w, h) });
    }
    for (const o of spec.extraObstacles || []) obstacles.push({ label: o.label || 'Препятствие', poly: rectPoly(o.x, o.y, o.w, o.h) });
    let door = null;
    for (const o of p.openings) {
      if (o.kind === 'window') continue;
      const g = openingGeometry(p, o); if (!g) continue;
      const pr = room.poly.map((a, i) => projectOnSegment(g.center, a, room.poly[(i + 1) % room.poly.length])).sort((x, y) => x.distance - y.distance)[0];
      if (pr && pr.distance < g.wall.thickness / 2 + 40) { door = { x: pr.point.x - b.minX, y: pr.point.y - b.minY }; break; }
    }
    const points = p.points.filter(x => x.floor === room.floor && x.kind === 'riser').map(x => ({ x: x.x - b.minX, y: x.y - b.minY, label: 'Стояк' }));
    return { title: `Пол · ${room.name}`, poly, obstacles, door, points, width: b.w, height: b.h, kind: 'floor' };
  }
  // Стена (участок стены) по ребру многоугольника комнаты
  const i = spec.edge ?? 0, a = room.poly[i % room.poly.length], c = room.poly[(i + 1) % room.poly.length];
  const len = dist(a, c);
  const from = spec.from ?? 0, to = spec.to ?? (room.ceiling || 2700), H = Math.max(10, to - from);
  // Участок по длине стены (например, фартук только над кухней)
  const x0 = Math.max(0, spec.along?.[0] ?? 0), x1 = Math.min(len, spec.along?.[1] ?? len);
  const poly = rectPoly(x0, 0, Math.max(10, x1 - x0), H);
  const obstacles = [], points = [];
  const ux = (c.x - a.x) / len, uy = (c.y - a.y) / len;
  const along = q => (q.x - a.x) * ux + (q.y - a.y) * uy;
  const off = q => Math.abs(-(q.x - a.x) * uy + (q.y - a.y) * ux);
  for (const o of p.openings) {
    const g = openingGeometry(p, o); if (!g || g.wall.floor !== room.floor) continue;
    if (off(g.center) > g.wall.thickness / 2 + 40) continue;
    const x0 = along(g.center) - o.width / 2; if (x0 > len || x0 + o.width < 0) continue;
    const z0 = o.sill || 0, z1 = z0 + o.height;
    const y0 = Math.max(0, to - z1), y1 = Math.min(H, to - z0);
    if (y1 > y0) obstacles.push({ label: o.kind === 'window' ? 'Окно' : o.kind === 'door' ? 'Дверь' : 'Проём', poly: rectPoly(Math.max(0, x0), y0, Math.min(len, x0 + o.width) - Math.max(0, x0), y1 - y0) });
  }
  for (const pt of p.points.filter(x => x.floor === room.floor)) {
    if (off(pt) > 150) continue;
    const x = along(pt); if (x < 0 || x > len) continue;
    const z = pt.h ?? POINT_KINDS[pt.kind]?.h ?? 0; if (z < from || z > to) continue;
    const kind = POINT_KINDS[pt.kind]; const size = kind?.system === 'electric' ? 75 : 60;
    if (['light', 'panel'].includes(pt.kind)) continue;
    obstacles.push({ label: kind?.name || 'Точка', poly: rectPoly(x - size / 2, to - z - size / 2, size, size), small: true });
    points.push({ x, y: to - z, label: kind?.name || 'Точка' });
  }
  for (const o of spec.extraObstacles || []) obstacles.push({ label: o.label || 'Препятствие', poly: rectPoly(o.x, o.y, o.w, o.h) });
  const label = spec.along ? `фартук ${Math.round(x1 - x0)} мм, ${from}–${to} мм` : spec.from || spec.to < (room.ceiling || 2700) ? `${from}–${to} мм` : 'целиком';
  return { title: `Стена ${i + 1} · ${room.name} (${label})`, poly, obstacles, door: null, points, width: len, height: H, kind: 'wall' };
}

export const rectPoly = (x, y, w, h) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];

// ——— Генерация плиток ———
function tileShapes(surface, tile, params) {
  const j = params.joint, out = [];
  const b = bbox(surface.poly);
  const pattern = params.pattern;
  let tw = tile.w, th = tile.h;
  if (pattern === 'herringbone' && tw < th) [tw, th] = [th, tw];
  const px = tw + j, py = th + j;
  const origin = startOrigin(surface, { w: tw, h: th, px, py }, params);
  if (pattern === 'hex') {
    const hw = tile.w, hh = tile.h || tile.w * 1.1547;
    const sx = hw + j, sy = hh * 0.75 + j * 0.866;
    const cols = Math.ceil(b.w / sx) + 3, rows = Math.ceil(b.h / sy) + 3;
    const ox = origin.x % sx - sx, oy = origin.y % sy - sy;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cx = ox + c * sx + (r % 2 ? sx / 2 : 0) + hw / 2, cy = oy + r * sy + hh / 2;
      out.push({ row: r, col: c, poly: [{ x: cx, y: cy - hh / 2 }, { x: cx + hw / 2, y: cy - hh / 4 }, { x: cx + hw / 2, y: cy + hh / 4 }, { x: cx, y: cy + hh / 2 }, { x: cx - hw / 2, y: cy + hh / 4 }, { x: cx - hw / 2, y: cy - hh / 4 }], area: hw * hh * 0.75, local: { w: hw, h: hh } });
    }
    return out;
  }
  if (pattern === 'herringbone') {
    const L = px, W = py; // ячейки с учётом шва
    const R = Math.hypot(b.w, b.h) + L * 2;
    const nb = Math.ceil(R / L) + 2, nk = Math.ceil(R / W) * 2 + 4;
    const o = { x: origin.x % (2 * L), y: origin.y % (2 * L) };
    for (let band = -nb; band <= nb; band++) for (let k = -nk; k <= nk; k++) {
      const bx = o.x + band * L + k * W, by = o.y - band * L + k * W;
      const H = rectPoly(bx, by, tw, th);
      const V = rectPoly(bx + L, by + W - L, th, tw);
      for (const [poly, orient] of [[H, 'h'], [V, 'v']]) {
        const bb = bbox(poly);
        if (bb.maxX < b.minX - 1 || bb.minX > b.maxX + 1 || bb.maxY < b.minY - 1 || bb.minY > b.maxY + 1) continue;
        out.push({ row: band, col: k, poly, area: tw * th, local: orient === 'h' ? { w: tw, h: th } : { w: th, h: tw } });
      }
    }
    return out;
  }
  const diagonal = pattern === 'diagonal';
  const center = b.center;
  const R = diagonal ? Math.hypot(b.w, b.h) / 2 + Math.max(px, py) * 2 : 0;
  const area = diagonal ? { minX: center.x - R, minY: center.y - R, w: 2 * R, h: 2 * R } : { minX: b.minX, minY: b.minY, w: b.w, h: b.h };
  const ox = mod(origin.x - area.minX, px) - px + area.minX, oy = mod(origin.y - area.minY, py) - py + area.minY;
  const rows = Math.ceil(area.h / py) + 3, cols = Math.ceil(area.w / px) + 3;
  const rowOrigin = Math.round((origin.y - oy) / py);
  for (let r = 0; r < rows; r++) {
    const rr = r - rowOrigin;
    const shift = pattern === 'half' ? mod(rr, 2) * px / 2 : pattern === 'third' ? mod(rr, 3) * px / 3 : 0;
    for (let c = -1; c < cols; c++) {
      let poly = rectPoly(ox + c * px + shift, oy + r * py, tw, th);
      if (diagonal) poly = poly.map(q => rotatePoint(q, 45, center));
      out.push({ row: r, col: c, poly, area: tw * th, local: { w: tw, h: th }, rot: diagonal ? 45 : 0 });
    }
  }
  return out;
}
const mod = (a, n) => ((a % n) + n) % n;

function startOrigin(surface, t, params) {
  const b = bbox(surface.poly), gap = params.gap || 0;
  let x = b.minX + gap, y = b.minY + gap;
  if (params.start === 'center') { x = b.center.x - t.w / 2; y = b.center.y - t.h / 2; }
  if (params.start === 'door' && surface.door) {
    x = surface.door.x - t.w / 2;
    y = Math.abs(surface.door.y - b.maxY) < Math.abs(surface.door.y - b.minY) ? b.maxY - gap - t.h : b.minY + gap;
  }
  if (params.start === 'visible') {
    const side = params.visibleSide || 'bottom';
    if (side === 'right') x = b.maxX - gap - t.w;
    if (side === 'bottom') y = b.maxY - gap - t.h;
  }
  return { x: x + (Number(params.offsetX) || 0), y: y + (Number(params.offsetY) || 0) };
}

// ——— Расчёт ———
export function computeLayout(surface, tile, params) {
  const t0 = performance.now();
  const P = { joint: 2, pattern: 'straight', start: 'corner', gap: 0, minCut: 1 / 3, offsetX: 0, offsetY: 0, ...params };
  if (tile.shape === 'hex') P.pattern = 'hex';
  const surfArea = polygonArea(surface.poly) - surface.obstacles.reduce((s, o) => s + polygonArea(clipByConvexSafe(o.poly, surface.poly)), 0);
  const shapes = tileShapes(surface, tile, P);
  const tiles = [];
  for (const s of shapes) {
    const clipped = clipByConvex(surface.poly, s.poly);
    if (clipped.length < 3) continue;
    let a = polygonArea(clipped);
    if (a < s.area * 0.01) continue;
    let obst = 0;
    for (const o of surface.obstacles) { const oc = clipByConvex(o.poly, s.poly); if (oc.length >= 3) obst += polygonArea(clipByConvex(oc, s.poly)); }
    const net = a - obst;
    if (net < s.area * 0.01) continue;
    const frac = net / s.area;
    const full = frac > 0.985;
    let cut = null;
    if (!full) {
      // Размер куска в локальной системе плитки
      const c0 = bbox(s.poly).center;
      const local = clipped.map(q => s.rot ? rotatePoint(q, -s.rot, c0) : q);
      const lb = bbox(local);
      const cw = Math.min(s.local.w, Math.round(lb.w)), ch = Math.min(s.local.h, Math.round(lb.h));
      cut = { w: cw, h: ch, fw: cw / s.local.w, fh: ch / s.local.h, byObstacle: obst > 0 };
    }
    tiles.push({ key: `${s.row}:${s.col}:${tiles.length}`, row: s.row, col: s.col, poly: clipped, full, frac, cut, local: s.local });
  }
  // Нумерация рядов сверху вниз
  const rowIds = [...new Set(tiles.map(t => t.row))].sort((a, b) => a - b);
  tiles.forEach(t => { t.rowNo = rowIds.indexOf(t.row) + 1; });
  const decor = new Set(P.decor || []);
  const whole = tiles.filter(t => t.full && !decor.has(t.key)).length;
  const cuts = tiles.filter(t => !t.full && !decor.has(t.key));
  // Повторное использование обрезков: куски, подрезанные по одной оси, комбинируем из одной плитки
  const single = [], double = [];
  for (const t of cuts) {
    const oneAxis = t.cut.fw > 0.98 || t.cut.fh > 0.98;
    (oneAxis && P.pattern !== 'hex' ? single : double).push(oneAxis ? Math.min(t.cut.fw, t.cut.fh) : 1);
  }
  single.sort((a, b) => b - a);
  const bins = [];
  for (const f of single) { const need = f + 0.02; const bin = bins.find(x => x + need <= 1); if (bin !== undefined) bins[bins.indexOf(bin)] += need; else bins.push(need); }
  const cutTiles = (P.reuseOffcuts === false ? single.length : bins.length) + double.length;
  const net = whole + cutTiles;
  const waste = P.waste ?? PATTERNS[P.pattern]?.waste ?? 10;
  const totalPcs = Math.ceil(net * (1 + waste / 100));
  const tileM2 = tile.w * (tile.h || tile.w) / 1e6 * (tile.shape === 'hex' ? 0.75 : 1);
  const packs = tile.pack ? Math.ceil(totalPcs / tile.pack) : null;
  const areaM2 = surfArea / 1e6;
  const size = Math.max(tile.w, tile.h);
  const adhesivePerM2 = size <= 200 ? 3 : size <= 400 ? 4.5 : size <= 700 ? 5.5 : 7;
  const adhesiveKg = areaM2 * adhesivePerM2;
  const groutPerM2 = ((tile.w + tile.h) / (tile.w * tile.h)) * (tile.t || 9) * P.joint * 1.6;
  const groutKg = areaM2 * groutPerM2;
  // Проверки
  const warnings = [];
  const edgeCuts = cuts.filter(t => !t.cut.byObstacle);
  let minEdge = 1;
  for (const t of edgeCuts) {
    const f = Math.min(t.cut.fw < 0.98 ? t.cut.fw : 1, t.cut.fh < 0.98 ? t.cut.fh : 1);
    minEdge = Math.min(minEdge, f);
  }
  const narrow = edgeCuts.filter(t => Math.min(t.cut.fw < 0.98 ? t.cut.fw : 1, t.cut.fh < 0.98 ? t.cut.fh : 1) < P.minCut);
  if (narrow.length) warnings.push({ level: 'warn', text: `Узкая подрезка: ${narrow.length} шт. уже ${Math.round(P.minCut * 100)}% плитки (минимум ${Math.round(minEdge * Math.min(tile.w, tile.h))} мм)`, keys: narrow.map(t => t.key) });
  for (const pt of surface.points || []) {
    const inTile = tiles.find(t => pointInside(pt, t.poly));
    const nearJoint = !inTile || inTile.poly.some((q, i) => projectOnSegment(pt, q, inTile.poly[(i + 1) % inTile.poly.length]).distance < 25);
    if (nearJoint) warnings.push({ level: 'warn', text: `Шов попадает на «${pt.label}» — сдвиньте сетку`, at: pt });
  }
  if (P.pattern === 'straight' || P.pattern === 'half' || P.pattern === 'third') {
    const b = bbox(surface.poly);
    const leftCut = edgeCuts.filter(t => bbox(t.poly).minX <= b.minX + 1 && t.cut.fw < 0.98).map(t => t.cut.fw);
    const rightCut = edgeCuts.filter(t => bbox(t.poly).maxX >= b.maxX - 1 && t.cut.fw < 0.98).map(t => t.cut.fw);
    if (leftCut.length && rightCut.length && Math.abs(Math.min(...leftCut) - Math.min(...rightCut)) > 0.45) warnings.push({ level: 'info', text: 'Несимметричная подрезка у противоположных краёв — рисунок на стыках будет заметен' });
  }
  // Ряды и ведомость подрезок
  const rows = rowIds.map((r, i) => {
    const rt = tiles.filter(t => t.row === r);
    const cutsInRow = {};
    for (const t of rt.filter(t => !t.full)) { const k = `${round5(t.cut.w)}×${round5(t.cut.h)}`; cutsInRow[k] = (cutsInRow[k] || 0) + 1; }
    return { no: i + 1, whole: rt.filter(t => t.full).length, cuts: Object.entries(cutsInRow).map(([size, n]) => ({ size, n })) };
  });
  const cutList = {};
  for (const t of cuts) { const k = `${round5(t.cut.w)}×${round5(t.cut.h)}`; cutList[k] = (cutList[k] || 0) + 1; }
  return {
    params: P, tiles, areaM2, whole, cutCount: cuts.length, cutTiles, net, waste, totalPcs, packs, tileM2,
    materialM2: totalPcs * tileM2, decorCount: decor.size,
    adhesiveKg, adhesiveBags: Math.ceil(adhesiveKg / 25), groutKg, groutPacks: Math.ceil(groutKg / 2),
    minEdge, warnings, rows, cutList: Object.entries(cutList).map(([size, n]) => ({ size, n })).sort((a, b) => b.n - a.n),
    ms: performance.now() - t0,
  };
}
const round5 = v => Math.round(v / 5) * 5;
function pointInside(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside; }
  return inside;
}
function clipByConvexSafe(subject, clip) { const r = clipByConvex(subject, clip); return r.length >= 3 ? r : []; }

// Автоподбор: 2–3 варианта по разным критериям (раздел 6.2).
export function suggestLayouts(surface, tile, params) {
  const base = { ...params, start: 'corner' };
  const px = tile.w + (params.joint || 2), py = (tile.h || tile.w) + (params.joint || 2);
  const steps = 8, candidates = [];
  for (let i = 0; i < steps; i++) for (let k = 0; k < steps; k++) {
    const offsetX = Math.round(px * i / steps), offsetY = Math.round(py * k / steps);
    const L = computeLayout(surface, tile, { ...base, offsetX, offsetY });
    candidates.push({ offsetX, offsetY, L });
  }
  const sym = ['center', 'corner'].map(start => ({ start, L: computeLayout(surface, tile, { ...params, start, offsetX: 0, offsetY: 0 }) }));
  const half = computeLayout(surface, tile, { ...params, start: 'center', offsetX: px / 2, offsetY: py / 2 });
  const symBest = [...sym.map(s => ({ ...s, offsetX: 0, offsetY: 0 })), { start: 'center', offsetX: px / 2, offsetY: py / 2, L: half }].sort((a, b) => b.L.minEdge - a.L.minEdge)[0];
  const lessWaste = [...candidates].sort((a, b) => a.L.totalPcs - b.L.totalPcs || b.L.minEdge - a.L.minEdge)[0];
  const minCuts = [...candidates].sort((a, b) => b.L.minEdge - a.L.minEdge || a.L.cutCount - b.L.cutCount)[0];
  return [
    { id: 'waste', name: 'Меньше отходов', params: { ...base, offsetX: lessWaste.offsetX, offsetY: lessWaste.offsetY }, result: lessWaste.L },
    { id: 'symmetric', name: 'Симметрично', params: { ...params, start: symBest.start, offsetX: Math.round(symBest.offsetX), offsetY: Math.round(symBest.offsetY) }, result: symBest.L },
    { id: 'cuts', name: 'Минимум узкой подрезки', params: { ...base, offsetX: minCuts.offsetX, offsetY: minCuts.offsetY }, result: minCuts.L },
  ];
}

export function tileFromProduct(product) {
  if (!product) return null;
  const shape = product.shape === 'hex' ? 'hex' : 'rect';
  return { w: product.dims.w, h: product.dims.d || product.dims.w, t: product.dims.h || 9, shape, pack: product.pack || null, price: product.price, unit: product.unit || 'м²' };
}
