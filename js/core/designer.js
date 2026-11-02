// Локальный движок дизайна: подбор товаров только из каталога + расстановка по правилам эргономики.
// ИИ-провайдер (если подключён) выбирает ID товаров, а расстановку всегда делают эти правила (раздел 8.3 ТЗ).
import { allProducts, bestOffer, styleScore, isUsable, productById, analogs } from './catalog.js';
import { styleById } from '../data/styles.js';
import { uid, roomMetrics, roomOpenings, openingGeometry, POINT_KINDS, WET_ROOMS } from './model.js';
import { placementIssues, KIND_RULES, frontVector } from './rules.js';
import { bbox, pointInPolygon, dist, polygonArea, centroid, footprint } from './geometry.js';

export const DECOR_KINDS = ['rug', 'curtains', 'plant', 'decor'];
const LIGHT_KINDS = ['pendant', 'ceiling-light', 'track', 'floor-lamp', 'sconce'];

const PROGRAM = {
  'Кухня-гостиная': ['kitchen-set', 'fridge', 'sofa', 'tv-stand', 'dining-table', 'chair', 'coffee-table', 'armchair', 'floor-lamp', 'rug', 'curtains', 'plant'],
  'Гостиная': ['sofa', 'tv-stand', 'coffee-table', 'armchair', 'bookshelf', 'floor-lamp', 'rug', 'curtains', 'plant'],
  'Кухня': ['kitchen-set', 'fridge', 'dining-table', 'chair', 'curtains'],
  'Спальня': ['bed', 'wardrobe', 'nightstand', 'dresser', 'rug', 'curtains', 'plant'],
  'Детская': ['bed', 'desk', 'office-chair', 'wardrobe', 'bookshelf', 'rug', 'curtains'],
  'Кабинет': ['desk', 'office-chair', 'bookshelf', 'armchair', 'floor-lamp', 'curtains', 'plant'],
  'Ванная': ['bath', 'vanity', 'toilet', 'washer', 'mirror'],
  'Санузел': ['toilet', 'vanity', 'mirror'],
  'Прихожая': ['wardrobe', 'shoe-cabinet', 'coat-rack', 'mirror'],
  'Коридор': ['shoe-cabinet', 'mirror'],
  'Гардеробная': ['wardrobe', 'dresser'],
  'Балкон': ['armchair', 'plant'],
  'Кладовая': ['bookshelf'],
};

const MUST = [[/угл[а-яё]* диван/, 'sofa-corner'], [/(рабоч|письм)[а-яё]* стол/, 'desk'], [/стеллаж|книг/, 'bookshelf'], [/кресл/, 'armchair'], [/шкаф|гардероб/, 'wardrobe'], [/комод/, 'dresser'], [/душ/, 'shower'], [/ванн/, 'bath'], [/телевиз|тв/, 'tv-stand'], [/растен/, 'plant'], [/стиральн/, 'washer']];

export const KIND_WORDS = [
  [/угл[а-яё]* диван|диван[а-яё]* угл/, 'sofa-corner'], [/диван/, 'sofa'], [/рабоч[а-яё]* кресл|компьютерн/, 'office-chair'], [/кресл/, 'armchair'], [/журнальн/, 'coffee-table'],
  [/обеденн|стол[а-яё]* для еды/, 'dining-table'], [/(письм|рабоч)[а-яё]* стол/, 'desk'], [/стул/, 'chair'], [/кроват/, 'bed'], [/прикроват|тумбочк/, 'nightstand'],
  [/шкаф|гардероб/, 'wardrobe'], [/комод/, 'dresser'], [/стеллаж|полк/, 'bookshelf'], [/тв|телевиз/, 'tv-stand'], [/ков[её]р/, 'rug'], [/штор|занавес/, 'curtains'],
  [/растен|цвет[оы]к|зелен/, 'plant'], [/торшер/, 'floor-lamp'], [/люстр|подвес/, 'pendant'], [/светильник/, 'ceiling-light'], [/трек/, 'track'], [/бра/, 'sconce'],
  [/ванн(?!ая)/, 'bath'], [/душ/, 'shower'], [/раковин|умывальник/, 'vanity'], [/унитаз/, 'toilet'], [/стиральн/, 'washer'], [/зеркал/, 'mirror'],
  [/холодильн/, 'fridge'], [/кухн/, 'kitchen-set'], [/обувн/, 'shoe-cabinet'], [/вешалк/, 'coat-rack'], [/стол/, 'dining-table'],
];
export const kindFromText = t => (KIND_WORDS.find(([re]) => re.test(t)) || [])[1] || null;

const STRATEGIES = [
  { id: 'balanced', name: 'Сбалансированный', note: 'лучшее совпадение со стилем при средней цене' },
  { id: 'econ', name: 'Экономичный', note: 'минимальная стоимость при сохранении стиля' },
  { id: 'accent', name: 'Акцентный', note: 'максимум стиля, выразительные предметы и угловой диван, где помещается' },
];

const luminance = hex => { const n = parseInt(String(hex || '#888888').slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
const colorDist = (a, b) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.hypot((x >> 16 & 255) - (y >> 16 & 255), (x >> 8 & 255) - (y >> 8 & 255), (x & 255) - (y & 255)); };
export { luminance };

function avoidMatch(product, brief) {
  const text = `${product.name} ${product.material}`.toLowerCase();
  const words = String(brief.avoid || '').toLowerCase().split(/[,;.\s]+/).filter(w => w.length > 3);
  if (words.some(w => text.includes(w.slice(0, Math.max(4, w.length - 2))))) return true;
  if (brief.pets && /бархат|букле|шёлк|шелк/.test(text)) return true;
  if (brief.children && /стекл/.test(text)) return true;
  return false;
}

// Выбор товара нужного типа по стратегии
function pick(project, kind, ctx, strategy, exclude = []) {
  const { brief, city, styleId, allowIds } = ctx;
  let list = allProducts(project).filter(p => p.kind === kind && !exclude.includes(p.id) && (!allowIds || allowIds.has(p.id)));
  list = list.filter(p => isUsable(project, p, city) && !avoidMatch(p, brief));
  if (!list.length) return null;
  const scored = list.map(p => ({ p, s: styleScore(p, styleId), price: bestOffer(p, city)?.price ?? p.price }));
  const maxS = Math.max(...scored.map(x => x.s));
  const pool = scored.filter(x => x.s === maxS || (strategy === 'econ' && x.s >= 1));
  pool.sort((a, b) => a.price - b.price);
  if (strategy === 'econ') return pool[0].p;
  if (strategy === 'accent') return pool[pool.length - 1].p;
  return pool[Math.floor((pool.length - 1) / 2)].p;
}

// ——— Геометрия помещений для расстановки ———
function roomEdges(room) {
  const out = [];
  const poly = room.poly;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const len = dist(a, b);
    if (len < 300 || (Math.abs(a.x - b.x) > 1 && Math.abs(a.y - b.y) > 1)) continue;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    let n = { x: -dir.y, y: dir.x };
    const mid = { x: (a.x + b.x) / 2 + n.x * 50, y: (a.y + b.y) / 2 + n.y * 50 };
    if (!pointInPolygon(mid, poly)) n = { x: -n.x, y: -n.y };
    out.push({ i, a, b, len, dir, n });
  }
  return out;
}
const rotationFor = n => n.y > 0.5 ? 0 : n.x < -0.5 ? 90 : n.y < -0.5 ? 180 : 270;

function makePl(product, room, x, y, rotation, extra = {}) {
  return { id: uid('pl'), productId: product.id, roomId: room.id, kind: product.kind, x, y, rotation, w: product.dims.w, d: product.dims.d || 300, h: product.dims.h || 0, ...extra };
}

function wallCandidates(product, room, edge, step = 100) {
  const w = product.dims.w, d = product.dims.d || 300;
  const out = [];
  for (let s = w / 2 + 20; s <= edge.len - w / 2 - 20; s += step) {
    const x = edge.a.x + edge.dir.x * s + edge.n.x * (d / 2 + 15);
    const y = edge.a.y + edge.dir.y * s + edge.n.y * (d / 2 + 15);
    out.push({ x, y, rotation: rotationFor(edge.n), s, edge });
  }
  if (edge.len >= w + 40 && !out.length) out.push({ x: edge.a.x + edge.dir.x * edge.len / 2 + edge.n.x * (d / 2 + 15), y: edge.a.y + edge.dir.y * edge.len / 2 + edge.n.y * (d / 2 + 15), rotation: rotationFor(edge.n), s: edge.len / 2, edge });
  return out;
}

function placeRoom(project, room, items, ctx) {
  const placed = [...ctx.existing.filter(x => x.roomId === room.id)];
  const empty = [];
  const edges = roomEdges(room);
  const pts = project.points.filter(x => x.floor === room.floor && pointInPolygon(x, room.poly));
  const near = kind => pts.filter(x => x.kind === kind);
  const ops = roomOpenings(project, room);
  const windows = ops.filter(o => o.kind === 'window' || o.kind === 'balcony').map(o => openingGeometry(project, o));
  const doors = ops.filter(o => o.kind !== 'window').map(o => openingGeometry(project, o));
  const c = centroid(room.poly);
  const ok = pl => placementIssues(project, null, pl, [...placed, pl]).length === 0;
  const okLoose = pl => placementIssues(project, null, pl, [...placed, pl]).every(i => i.level !== 'error' && !/двер/.test(i.text));
  const byKind = k => placed.find(x => x.kind === k);
  const edgeHasWindow = e => windows.some(g => g && Math.abs((g.center.x - e.a.x) * e.n.x + (g.center.y - e.a.y) * e.n.y) < 300);
  const edgeHasDoor = e => doors.some(g => g && Math.abs((g.center.x - e.a.x) * e.n.x + (g.center.y - e.a.y) * e.n.y) < 300);

  const tryWall = (product, score, { allowLoose = false, extra = {} } = {}) => {
    const cands = edges.flatMap(e => wallCandidates(product, room, e)).map(cd => ({ ...cd, score: score(cd) })).sort((a, b) => b.score - a.score);
    for (const cd of cands) { const pl = makePl(product, room, cd.x, cd.y, cd.rotation, extra); if (ok(pl)) return pl; }
    if (allowLoose || looseMode) for (const cd of cands) { const pl = makePl(product, room, cd.x, cd.y, cd.rotation, extra); if (okLoose(pl)) return pl; }
    return null;
  };
  const tryFree = (product, score, clearance = 600, itemClear = clearance) => {
    const b = bbox(room.poly), out = [];
    for (let x = b.minX + 300; x <= b.maxX - 300; x += 100) for (let y = b.minY + 300; y <= b.maxY - 300; y += 100) for (const rotation of [0, 90]) {
      const pl = makePl(product, room, x, y, rotation);
      const f = footprint(pl);
      const zone = { x: f.x - clearance, y: f.y - clearance, w: f.w + 2 * clearance, h: f.h + 2 * clearance };
      const corners = [{ x: zone.x, y: zone.y }, { x: zone.x + zone.w, y: zone.y }, { x: zone.x, y: zone.y + zone.h }, { x: zone.x + zone.w, y: zone.y + zone.h }];
      if (!corners.every(q => pointInPolygon(q, room.poly))) continue;
      const iz = { x: f.x - itemClear, y: f.y - itemClear, w: f.w + 2 * itemClear, h: f.h + 2 * itemClear };
      if (placed.some(o => !KIND_RULES[o.kind]?.floor && !KIND_RULES[o.kind]?.ceiling && !KIND_RULES[o.kind]?.wall && rectsOverlapLocal(iz, footprint(o)))) continue;
      out.push({ pl, score: score(pl) });
    }
    out.sort((a, b) => b.score - a.score);
    for (const o of out) if (ok(o.pl)) return o.pl;
    return null;
  };
  const nearestDist = (cd, list) => list.length ? Math.min(...list.map(p => dist(cd, p))) : 5000;

  const LOOSE = ['bed', 'wardrobe', 'sofa', 'sofa-corner', 'desk', 'dresser', 'tv-stand', 'fridge', 'bookshelf', 'shoe-cabinet', 'armchair'];
  const ALT_KIND = { 'sofa-corner': 'sofa' };
  const centerScore = cd => -Math.abs(cd.s - cd.edge.len / 2) / 10;
  let looseMode = false;
  function placeOne(prod) {
    const k = prod.kind;
    let pl = null;
    switch (k) {
      case 'kitchen-set': {
        const sink = near('kitchen-sink')[0];
        pl = tryWall(prod, cd => (sink ? -dist(cd, sink) : cd.edge.len) - (edgeHasWindow(cd.edge) ? 3000 : 0), { allowLoose: true });
        break;
      }
      case 'bath': case 'shower': case 'toilet': case 'vanity': case 'washer': {
        const target = near(k === 'vanity' ? 'sink' : k)[0] || near('riser')[0];
        pl = tryWall(prod, cd => (target ? -dist(cd, target) : 0) + (k === 'bath' ? cornerBonus(cd) / 4 : 0), { allowLoose: true });
        break;
      }
      case 'bed': pl = tryWall(prod, cd => centerScore(cd) - (edgeHasWindow(cd.edge) ? 2000 : 0) - (edgeHasDoor(cd.edge) ? 1500 : 0) + cd.edge.len / 5); break;
      case 'sofa': case 'sofa-corner': {
        const kitchen = byKind('kitchen-set');
        pl = tryWall(prod, cd => (kitchen ? dist(cd, kitchen) : 0) / 2 + centerScore(cd) - (edgeHasWindow(cd.edge) ? 2500 : 0) + (k === 'sofa-corner' ? cornerBonus(cd) : 0));
        break;
      }
      case 'tv-stand': {
        const sofa = byKind('sofa') || byKind('sofa-corner');
        pl = tryWall(prod, cd => sofa ? -(Math.abs(frontVector(cd.rotation).x + frontVector(sofa.rotation).x) + Math.abs(frontVector(cd.rotation).y + frontVector(sofa.rotation).y)) * 5000 - dist(cd, sofa) / 3 - Math.abs((cd.x - sofa.x) * cd.edge.dir.x + (cd.y - sofa.y) * cd.edge.dir.y) : centerScore(cd));
        break;
      }
      case 'wardrobe': pl = tryWall(prod, cd => -(edgeHasWindow(cd.edge) ? 4000 : 0) + (room.type === 'Прихожая' ? -nearestDist(cd, doors.map(g => g.center)) / 3 : cornerBonus(cd))); break;
      case 'desk': {
        // Стол ставим только туда, где перед ним поместится кресло без нарушений
        const chair = allProducts(project).find(x => x.kind === 'office-chair');
        const cands = edges.flatMap(e => wallCandidates(prod, room, e)).map(cd => ({ ...cd, score: -nearestDist(cd, windows.map(g => g.center)) / 2 })).sort((a, b) => b.score - a.score);
        for (const cd of cands) {
          const d = makePl(prod, room, cd.x, cd.y, cd.rotation);
          if (!(looseMode ? okLoose(d) : ok(d))) continue;
          if (chair && !looseMode) {
            const f = frontVector(d.rotation);
            const ch = makePl(chair, room, d.x + f.x * (d.d / 2 + 150), d.y + f.y * (d.d / 2 + 150), (d.rotation + 180) % 360);
            placed.push(d); const good = placementIssues(project, null, ch, [...placed, ch]).length === 0; placed.pop();
            if (!good) continue;
          }
          pl = d; break;
        }
        break;
      }
      case 'fridge': {
        const ks = byKind('kitchen-set');
        pl = tryWall(prod, cd => ks ? -dist(cd, ks) * 1.5 + (Math.abs(rotationFor(cd.edge.n) - ks.rotation) < 1 ? 1000 : 0) : cornerBonus(cd));
        break;
      }
      case 'shoe-cabinet': case 'coat-rack': pl = tryWall(prod, cd => -nearestDist(cd, doors.filter(g => g.wall && project.openings.find(o => o.id && g)).map(g => g.center)) / 2); break;
      case 'nightstand': {
        const bed = byKind('bed');
        if (bed) {
          const along = { x: Math.cos(bed.rotation * Math.PI / 180), y: Math.sin(bed.rotation * Math.PI / 180) };
          const back = frontVector(bed.rotation);
          for (const side of [-1, 1]) {
            const off = bed.w / 2 + prod.dims.w / 2 + 20;
            const x = bed.x + along.x * off * side - back.x * (bed.d / 2 - prod.dims.d / 2 - 15), y = bed.y + along.y * off * side - back.y * (bed.d / 2 - prod.dims.d / 2 - 15);
            const cand = makePl(prod, room, x, y, bed.rotation);
            if (ok(cand)) placed.push(cand);
          }
          if (!placed.some(x => x.kind === 'nightstand')) empty.push({ roomId: room.id, kind: k, text: 'Нет места для прикроватных тумб' });
        }
        return 'done';
      }
      case 'coffee-table': {
        const sofa = byKind('sofa') || byKind('sofa-corner');
        if (sofa) {
          const f = frontVector(sofa.rotation);
          const off = sofa.d / 2 + 400 + prod.dims.d / 2;
          pl = makePl(prod, room, sofa.x + f.x * off, sofa.y + f.y * off, sofa.rotation);
          if (!ok(pl)) pl = null;
        }
        break;
      }
      case 'dining-table': {
        const ks = byKind('kitchen-set'), sofa = byKind('sofa') || byKind('sofa-corner');
        pl = tryFree(prod, cand => (ks ? -dist(cand, ks) : 0) + (sofa ? dist(cand, sofa) / 3 : 0), 750, 1150);
        if (!pl) pl = tryFree(prod, cand => (ks ? -dist(cand, ks) : 0), 650, 900);
        break;
      }
      case 'chair': {
        const t = byKind('dining-table'); if (!t) return 'done';
        const n = Math.max(2, Math.min(t.w >= 1400 ? 6 : 4, (ctx.brief.occupants || 2) + 2));
        const f = footprint(t), round = Math.abs(t.w - t.d) < 50;
        const seats = round ? [[0, -1], [0, 1], [-1, 0], [1, 0]] : (f.w >= f.h ? [[-0.25, -1], [0.25, -1], [-0.25, 1], [0.25, 1], [-1, 0], [1, 0]] : [[-1, -0.25], [-1, 0.25], [1, -0.25], [1, 0.25], [0, -1], [0, 1]]);
        let count = 0;
        for (const [sx, sy] of seats) {
          if (count >= n) break;
          const x = t.x + (Math.abs(sx) === 1 ? sx * (f.w / 2 + prod.dims.d / 2 - 80) : sx * f.w);
          const y = t.y + (Math.abs(sy) === 1 ? sy * (f.h / 2 + prod.dims.d / 2 - 80) : sy * f.h);
          const rot = sy === -1 ? 0 : sy === 1 ? 180 : sx === -1 ? 270 : 90;
          const cand = makePl(prod, room, x, y, rot);
          if (placementIssues(project, null, cand, [...placed, cand]).every(i => i.level !== 'error')) { placed.push(cand); count++; }
        }
        return 'done';
      }
      case 'office-chair': {
        const desk = byKind('desk'); if (!desk) return 'done';
        const f = frontVector(desk.rotation);
        pl = makePl(prod, room, desk.x + f.x * (desk.d / 2 + 150), desk.y + f.y * (desk.d / 2 + 150), (desk.rotation + 180) % 360);
        if (placementIssues(project, null, pl, [...placed, pl]).some(i => i.level === 'error')) pl = null;
        break;
      }
      case 'armchair': {
        const sofa = byKind('sofa') || byKind('sofa-corner');
        pl = tryWall(prod, cd => sofa ? -dist(cd, sofa) / 2 : -nearestDist(cd, windows.map(g => g.center)));
        break;
      }
      case 'floor-lamp': case 'plant': {
        const anchor = byKind('sofa') || byKind('sofa-corner') || byKind('armchair') || byKind('bed');
        pl = tryWall(prod, cd => cornerBonus(cd) + (anchor && k === 'floor-lamp' ? -dist(cd, anchor) : 0), {});
        break;
      }
      case 'rug': {
        const anchor = byKind('coffee-table') || byKind('bed') || byKind('dining-table');
        if (anchor) {
          for (const rot of [anchor.rotation, (anchor.rotation + 90) % 360]) {
            const cand = makePl(prod, room, anchor.x, anchor.y, rot);
            if (placementIssues(project, null, cand, placed).every(i => i.level !== 'error')) { pl = cand; break; }
          }
        }
        break;
      }
      case 'curtains': {
        for (const g of windows) {
          if (!g) continue;
          const n = pointInPolygon({ x: g.center.x + g.normal.x * 200, y: g.center.y + g.normal.y * 200 }, room.poly) ? g.normal : { x: -g.normal.x, y: -g.normal.y };
          const w = dist(g.a, g.b) + 400;
          placed.push(makePl(prod, room, g.center.x + n.x * (g.wall.thickness / 2 + 60), g.center.y + n.y * (g.wall.thickness / 2 + 60), rotationFor(n), { w }));
        }
        return 'done';
      }
      case 'mirror': {
        const v = byKind('vanity');
        if (v) pl = makePl(prod, room, v.x, v.y, v.rotation);
        else pl = tryWall(prod, cd => -nearestDist(cd, doors.map(g => g.center)) / 2);
        break;
      }
      default: pl = tryWall(prod, cd => cornerBonus(cd) / 2 - (edgeHasWindow(cd.edge) ? 1500 : 0) + centerScore(cd) / 4);
    }
    return pl;
  }

  for (const it of items) {
    const prod = it.product, k = prod.kind;
    let pl = placeOne(prod);
    if (pl === 'done') continue;
    // Не поместилось — пробуем другие товары того же типа (меньше по размеру), затем мягкий режим с предупреждением
    if (!pl && prod.dims) {
      const alts = allProducts(project).filter(x => (x.kind === k || x.kind === ALT_KIND[k]) && x.id !== prod.id && x.dims && isUsable(project, x, ctx.city) && !avoidMatch(x, ctx.brief))
        .sort((a, b) => (styleScore(b, ctx.styleId) - styleScore(a, ctx.styleId)) || (a.dims.w * a.dims.d - b.dims.w * b.dims.d));
      for (const alt of alts.slice(0, 6)) { const r = placeOne(alt); if (r && r !== 'done') { pl = r; break; } }
    }
    if (!pl && LOOSE.includes(k)) { looseMode = true; pl = placeOne(prod); looseMode = false; }
    if (pl && pl !== 'done') placed.push(pl);
    else if (!pl) empty.push({ roomId: room.id, kind: k, text: `«${prod.name}»: не нашлось места без нарушения правил — зона оставлена пустой` });
  }
  function cornerBonus(cd) { const end = Math.min(cd.s, cd.edge.len - cd.s); return -end; }
  // Освещение — по точкам электрики (раздел 4.2 «Освещение»)
  const lighting = { general: [], work: [], accent: [] };
  const lightPts = pts.filter(x => x.kind === 'light');
  if (ctx.lights) {
    const general = ctx.lights.general;
    if (general) for (const lp of lightPts) {
      const pl = makePl(general, room, lp.x, lp.y, 0, { pointId: lp.id });
      const table = placed.find(x => x.kind === 'dining-table' || x.kind === 'kitchen-set');
      if (ctx.lights.work && table && dist(lp, table) < 1500 && !lighting.work.length) { const w = makePl(ctx.lights.work, room, table.x, table.y, 0, { pointId: lp.id }); placed.push(w); lighting.work.push(w.id); continue; }
      placed.push(pl); lighting.general.push(pl.id);
    }
    if (!lightPts.length && ctx.lights.general) empty.push({ roomId: room.id, kind: 'ceiling-light', text: 'Нет точки освещения на потолке — светильник не размещён (добавьте точку на шаге «Инженерия»)' });
    for (const x of placed.filter(x => x.kind === 'floor-lamp')) lighting.accent.push(x.id);
    const bed = placed.find(x => x.kind === 'bed');
    if (bed && ctx.lights.accent) {
      const along = { x: Math.cos(bed.rotation * Math.PI / 180), y: Math.sin(bed.rotation * Math.PI / 180) }, back = frontVector(bed.rotation);
      for (const side of [-1, 1]) {
        const s = makePl(ctx.lights.accent, room, bed.x + along.x * (bed.w / 2 + 230) * side - back.x * (bed.d / 2 - 60), bed.y + along.y * (bed.w / 2 + 230) * side - back.y * (bed.d / 2 - 60), bed.rotation);
        placed.push(s); lighting.accent.push(s.id);
      }
    }
  }
  return { placements: placed, empty, lighting };
}
function rectsOverlapLocal(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }

// ——— Зоны ———
const ZONE_OF = { 'kitchen-set': 'Готовка', fridge: 'Готовка', 'dining-table': 'Приём пищи', chair: 'Приём пищи', sofa: 'Отдых', 'sofa-corner': 'Отдых', 'tv-stand': 'Отдых', 'coffee-table': 'Отдых', armchair: 'Отдых', bed: 'Сон', nightstand: 'Сон', wardrobe: 'Хранение', dresser: 'Хранение', bookshelf: 'Хранение', 'shoe-cabinet': 'Хранение', desk: 'Работа', 'office-chair': 'Работа', bath: 'Гигиена', shower: 'Гигиена', vanity: 'Гигиена', toilet: 'Гигиена', washer: 'Стирка' };
export function zonesOf(design) {
  const zones = {};
  for (const pl of design.placements) {
    const z = ZONE_OF[pl.kind]; if (!z) continue;
    const key = pl.roomId + '|' + z; const f = footprint(pl);
    const e = zones[key] || (zones[key] = { roomId: pl.roomId, name: z, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
    e.minX = Math.min(e.minX, f.x); e.minY = Math.min(e.minY, f.y); e.maxX = Math.max(e.maxX, f.x + f.w); e.maxY = Math.max(e.maxY, f.y + f.h);
  }
  return Object.values(zones).map(z => ({ ...z, x: z.minX - 150, y: z.minY - 150, w: z.maxX - z.minX + 300, h: z.maxY - z.minY + 300 }));
}

// ——— Отделка ———
function pickFinishes(project, ctx, strategy, room) {
  const style = styleById(ctx.styleId);
  const wet = WET_ROOMS.includes(room.type);
  const kitchen = room.type.includes('Кухня');
  const byColor = (kind, target) => {
    const list = allProducts(project).filter(p => p.kind === kind && isUsable(project, p, ctx.city) && !avoidMatch(p, ctx.brief) && (!ctx.allowIds || ctx.allowIds.has(p.id) || ['paint', 'floor-covering', 'tile-floor', 'tile-wall'].includes(kind)));
    if (!list.length) return null;
    return list.map(p => ({ p, s: styleScore(p, ctx.styleId) * 80 - colorDist(p.color, target) + (strategy === 'econ' ? -p.price / 100 : strategy === 'accent' ? p.price / 200 : 0) })).sort((a, b) => b.s - a.s)[0].p;
  };
  const f = {};
  f.floor = (wet || room.type === 'Прихожая' || room.type === 'Балкон' ? byColor('tile-floor', style.palette[2]) : byColor('floor-covering', style.palette[2]))?.id;
  const wallpaperRoom = ['Спальня', 'Гостиная', 'Детская'].includes(room.type) && ['neoclassic', 'provence', 'vintage', 'artdeco'].includes(ctx.styleId) && strategy !== 'econ';
  f.walls = (wet ? null : wallpaperRoom ? byColor('wallpaper', style.palette[1]) : byColor('paint', strategy === 'accent' && ['Спальня', 'Гостиная'].includes(room.type) ? style.palette[3] : style.palette[0]))?.id || null;
  f.ceiling = 'paint-white';
  if (wet) f.wallTile = byColor('tile-wall', style.palette[0])?.id;
  if (kitchen) f.apron = byColor('tile-wall', style.palette[strategy === 'accent' ? 3 : 1])?.id;
  return f;
}

// Спецификации раскладки плитки, которые создаёт дизайн (ванная — пол и стены, кухня — фартук).
export function tileSpecsForDesign(project, design) {
  const specs = [];
  for (const room of project.rooms) {
    const f = design.finishes?.[room.id]; if (!f) continue;
    const floorProd = productById(project, f.floor);
    if (floorProd?.kind === 'tile-floor') specs.push({ id: uid('t'), origin: 'design', surface: { type: 'floor', roomId: room.id, excludeFixtures: true }, productId: floorProd.id, params: { joint: 2, pattern: floorProd.dims.w / (floorProd.dims.d || 1) >= 4 ? 'third' : 'straight', start: 'center', minCut: 1 / 3 } });
    if (f.wallTile) room.poly.forEach((_, i) => specs.push({ id: uid('t'), origin: 'design', surface: { type: 'wall', roomId: room.id, edge: i, from: 0, to: room.ceiling || 2700 }, productId: f.wallTile, params: { joint: 2, pattern: 'straight', start: 'visible', visibleSide: 'bottom', minCut: 1 / 3 } }));
    if (f.apron) {
      const ks = design.placements.find(x => x.roomId === room.id && x.kind === 'kitchen-set');
      if (ks) {
        const back = frontVector(ks.rotation), bp = { x: ks.x - back.x * ks.d / 2, y: ks.y - back.y * ks.d / 2 };
        let best = 0, bd = Infinity;
        room.poly.forEach((a, i) => { const b = room.poly[(i + 1) % room.poly.length]; const d = Math.abs((b.x - a.x) * (a.y - bp.y) - (a.x - bp.x) * (b.y - a.y)) / (dist(a, b) || 1); if (d < bd) { bd = d; best = i; } });
        const a = room.poly[best], b = room.poly[(best + 1) % room.poly.length], L = dist(a, b);
        const along = ((ks.x - a.x) * (b.x - a.x) + (ks.y - a.y) * (b.y - a.y)) / (L || 1);
        specs.push({ id: uid('t'), origin: 'design', surface: { type: 'wall', roomId: room.id, edge: best, from: 900, to: 1500, along: [Math.max(0, Math.round(along - ks.w / 2)), Math.min(Math.round(L), Math.round(along + ks.w / 2))] }, productId: f.apron, params: { joint: 2, pattern: 'half', start: 'visible', visibleSide: 'bottom', minCut: 1 / 3 } });
      }
    }
  }
  return specs;
}

// ——— Генерация вариантов ———
export function generateDesigns(project, { count = 3, aiChoices = null, source = 'local' } = {}) {
  const brief = project.brief;
  const city = project.city;
  const styleId = brief.style;
  const style = styleById(styleId);
  const included = project.rooms.filter(r => brief.rooms?.[r.id]?.include !== false);
  const mustKinds = MUST.filter(([re]) => re.test(String(brief.mustHave || '').toLowerCase())).map(([, k]) => k);
  const strategies = STRATEGIES.slice(0, count);
  return strategies.map((st, vi) => {
    const ai = aiChoices?.[vi];
    const allowIds = ai?.catalogIds?.length ? new Set(ai.catalogIds) : null;
    const ctx = { brief, city, styleId, allowIds, existing: [] };
    const placements = [], empty = [], finishes = {}, lighting = {};
    const explanation = [];
    const lights = {
      general: pick(project, 'ceiling-light', ctx, st.id) || pick(project, 'ceiling-light', { ...ctx, allowIds: null }, st.id),
      work: pick(project, ['loft', 'modern', 'hightech', 'minimal'].includes(styleId) && st.id === 'accent' ? 'track' : 'pendant', { ...ctx, allowIds: null }, st.id),
      accent: pick(project, 'sconce', { ...ctx, allowIds: null }, st.id),
    };
    const rooms = [...included].sort((a, b) => (brief.rooms?.[a.id]?.priority || 2) - (brief.rooms?.[b.id]?.priority || 2));
    let mustLeft = [...mustKinds];
    // Для каждого обязательного предмета выбираем самую подходящую комнату из выбранных
    const MUST_FITS = { desk: ['Кабинет', 'Детская', 'Спальня', 'Гостиная', 'Кухня-гостиная'], 'sofa-corner': ['Гостиная', 'Кухня-гостиная'], bookshelf: ['Кабинет', 'Гостиная', 'Спальня'], wardrobe: ['Спальня', 'Прихожая'], dresser: ['Спальня'], armchair: ['Гостиная', 'Спальня'], shower: ['Ванная'], bath: ['Ванная'], 'tv-stand': ['Гостиная', 'Кухня-гостиная', 'Спальня'], plant: ['Гостиная', 'Кухня-гостиная', 'Спальня'], washer: ['Ванная', 'Кухня', 'Кухня-гостиная'] };
    const mustRoom = Object.fromEntries(mustKinds.map(mk => [mk, (MUST_FITS[mk] || []).map(t => rooms.find(r => r.type === t)).find(Boolean)?.id]));
    for (const room of rooms) {
      let kinds = [...(PROGRAM[room.type] || [])];
      if (!brief.decor) kinds = kinds.filter(k => !DECOR_KINDS.includes(k));
      if (room.type === 'Ванная' && !project.points.some(x => x.kind === 'bath' && pointInPolygon(x, room.poly)) && project.points.some(x => x.kind === 'shower' && pointInPolygon(x, room.poly))) kinds = kinds.map(k => k === 'bath' ? 'shower' : k);
      if (room.type === 'Ванная' && !project.points.some(x => x.kind === 'washer' && pointInPolygon(x, room.poly))) kinds = kinds.filter(k => k !== 'washer');
      const area = polygonArea(room.poly) / 1e6;
      if (st.id === 'accent' && kinds.includes('sofa') && area > 18) kinds = kinds.map(k => k === 'sofa' ? 'sofa-corner' : k);
      for (const mk of mustLeft) {
        if (mustRoom[mk] === room.id) {
          if (mk === 'sofa-corner') kinds = kinds.map(k => k === 'sofa' ? 'sofa-corner' : k);
          else if (mk === 'shower') kinds = kinds.map(k => k === 'bath' ? 'shower' : k);
          else if (!kinds.includes(mk)) { kinds.splice(Math.min(3, kinds.length), 0, mk); if (mk === 'desk') kinds.splice(4, 0, 'office-chair'); }
          mustLeft = mustLeft.filter(x => x !== mk);
        }
      }
      const items = [];
      for (const k of kinds) {
        const product = pick(project, k, ctx, st.id);
        if (product) items.push({ product });
        else empty.push({ roomId: room.id, kind: k, text: `${KIND_RULES[k]?.label || k}: в каталоге нет подходящего товара (стиль, фильтры, доставка в ${city}) — зона оставлена пустой` });
      }
      const res = placeRoom(project, room, items, { ...ctx, lights });
      placements.push(...res.placements); empty.push(...res.empty);
      lighting[room.id] = res.lighting;
      finishes[room.id] = pickFinishes(project, ctx, st.id, room);
    }
    for (const mk of mustLeft) empty.push({ roomId: null, kind: mk, text: `Обязательный предмет «${KIND_RULES[mk]?.label || mk}» не удалось разместить ни в одной из выбранных комнат` });
    const design = {
      id: uid('d'), name: ai?.name || `${st.name} · ${style.name}`, strategy: st.id, source, styleId, createdAt: new Date().toISOString(),
      placements, finishes, lighting, empty, chat: [], renders: [], decor: brief.decor,
      doorProduct: pick(project, 'door', { ...ctx, allowIds: null }, st.id)?.id || 'door-white-80',
      socketProduct: pick(project, 'socket', { ...ctx, allowIds: null }, st.id)?.id || 'socket-white',
    };
    fitBudget(project, design, ctx);
    design.explanation = explain(project, design, st, style, ai);
    return design;
  });
}

function designCost(project, design) {
  return design.placements.reduce((s, pl) => { const p = productById(project, pl.productId); return s + (bestOffer(p, project.city)?.price ?? p?.price ?? 0); }, 0);
}

// Если мебель дороже бюджета — заменяем самые дорогие позиции на более дешёвые аналоги того же типа.
function fitBudget(project, design, ctx) {
  const budget = Number(project.brief.budget) || 0;
  const furnitureBudget = budget * 0.55;
  if (!budget) return;
  let guard = 0;
  const tried = new Set();
  while (designCost(project, design) > furnitureBudget && guard++ < 60) {
    const sorted = [...design.placements].sort((a, b) => (productById(project, b.productId)?.price || 0) - (productById(project, a.productId)?.price || 0));
    let changed = false;
    for (const pl of sorted) {
      const cur = productById(project, pl.productId);
      const before = placementIssues(project, design, pl, design.placements).length;
      const cands = analogs(project, cur, { city: project.city, styleId: ctx.styleId, limit: 20 })
        .filter(a => a.offer && a.offer.price < (bestOffer(cur, project.city)?.price ?? cur.price) && !avoidMatch(a.product, project.brief) && !tried.has(pl.id + a.product.id))
        .sort((a, b) => a.offer.price - b.offer.price);
      for (const a of cands) {
        tried.add(pl.id + a.product.id);
        const keep = { productId: pl.productId, w: pl.w, d: pl.d, h: pl.h };
        Object.assign(pl, { productId: a.product.id, w: a.product.dims.w, d: a.product.dims.d || pl.d, h: a.product.dims.h });
        // Замена допустима, только если не появилось новых нарушений геометрии
        if (placementIssues(project, design, pl, design.placements).length <= before) { changed = true; break; }
        Object.assign(pl, keep);
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  design.overBudget = designCost(project, design) > furnitureBudget;
}

function explain(project, design, st, style, ai) {
  const lines = [];
  if (ai?.description) lines.push(ai.description);
  lines.push(`Стиль «${style.name}»: ${style.mood.toLowerCase()}. Стратегия — ${st.note}.`);
  lines.push(`Материалы и палитра: ${style.materials.slice(0, 3).join(', ')}; отделка подобрана к цветам палитры стиля.`);
  const b = project.brief;
  const wishes = [];
  if (b.mustHave) wishes.push(`обязательное: «${b.mustHave}» — ${design.empty.some(e => /Обязательный/.test(e.text)) ? 'не всё удалось разместить' : 'учтено'}`);
  if (b.avoid) wishes.push(`исключены товары с «${b.avoid}»`);
  if (b.pets) wishes.push('из-за животных не используем бархат и букле');
  if (b.children) wishes.push('из-за детей нет стеклянных столешниц');
  if (wishes.length) lines.push('Пожелания: ' + wishes.join('; ') + '.');
  lines.push(`Все ${design.placements.length} предметов — позиции каталога; расстановка соблюдает проходы от ${project.rules.passageMin} мм, зоны открывания дверей и не перекрывает розетки, радиаторы и вентиляцию.`);
  const cost = designCost(project, design);
  lines.push(`Мебель и свет: около ${Math.round(cost / 1000)} тыс. ₽${design.overBudget ? ' — выше 55% бюджета даже после замены на аналоги' : ' — в рамках бюджета'}.`);
  if (design.empty.length) lines.push(`Пустые зоны: ${design.empty.length} (подробности в списке ниже).`);
  return lines;
}

// ——— Ручная правка и чат ———
export function replacePlacement(project, design, plId, productId) {
  const pl = design.placements.find(x => x.id === plId); if (!pl) return null;
  const prod = productById(project, productId); if (!prod) return null;
  const before = pl.productId;
  const snapshot = { productId: pl.productId, kind: pl.kind, w: pl.w, d: pl.d, h: pl.h, x: pl.x, y: pl.y, rotation: pl.rotation };
  const count = () => placementIssues(project, design, pl, design.placements).length;
  const issuesBefore = count();
  Object.assign(pl, { productId: prod.id, kind: prod.kind, w: prod.dims.w, d: prod.dims.d || pl.d, h: prod.dims.h || pl.h });
  if (count() > issuesBefore) {
    // Пробуем переставить по правилам на свободное место в той же комнате
    const room = project.rooms.find(r => r.id === pl.roomId);
    const rest = design.placements.filter(x => x.id !== pl.id);
    const res = placeRoom(project, room, [{ product: prod }], { brief: project.brief, city: project.city, styleId: design.styleId, existing: rest });
    const np = res.placements.find(x => !rest.includes(x) && x.productId === prod.id);
    if (np) Object.assign(pl, { x: np.x, y: np.y, rotation: np.rotation });
    // Если без новых нарушений не помещается — оставляем прежний товар
    if (count() > issuesBefore) { Object.assign(pl, snapshot); return null; }
  }
  return before;
}

export function addToRoom(project, design, roomId, productId) {
  const room = project.rooms.find(r => r.id === roomId); const prod = productById(project, productId);
  if (!room || !prod) return null;
  const res = placeRoom(project, room, [{ product: prod }], { brief: project.brief, city: project.city, styleId: design.styleId, existing: design.placements });
  const np = res.placements.find(x => !design.placements.includes(x));
  if (np) design.placements.push(np);
  return np || null;
}

export function interpretChat(project, design, text) {
  const t = text.toLowerCase();
  const ops = [];
  const name = id => productById(project, id)?.name || id;
  const findPls = kind => design.placements.filter(p => p.kind === kind || (kind === 'sofa' && p.kind === 'sofa-corner') || (kind === 'sofa-corner' && p.kind === 'sofa'));
  const roomWord = project.rooms.find(r => t.includes(r.name.toLowerCase().slice(0, 5)));
  const ctx = { brief: project.brief, city: project.city, styleId: design.styleId };
  const pickBy = (kind, filter, sort) => allProducts(project).filter(p => p.kind === kind && isUsable(project, p, project.city) && filter(p)).sort(sort)[0];
  const lighter = /светле|светлый|светлая|светлое/.test(t), darker = /темне|тёмн|темн/.test(t);
  const cheaper = /дешевл|сэконом|бюджетн/.test(t);
  const m = t.match(/замен[а-яё]*\s+(.+?)\s+на\s+(.+)/);
  if (m) {
    const k1 = kindFromText(m[1]); const k2 = kindFromText(m[2]) || kindFromText(`${m[1]} ${m[2]}`) || k1;
    const targets = k1 ? findPls(k1).filter(p => !roomWord || p.roomId === roomWord.id) : [];
    if (!targets.length) return { ops, reply: `Не нашёл «${m[1]}» в варианте.` };
    for (const pl of targets.slice(0, 2)) {
      const cur = productById(project, pl.productId);
      const want = m[2];
      const prod = pickBy(k2, p => p.id !== cur.id && (!/кож/.test(want) || /кож/.test(p.material)) && (!/дуб|дерев/.test(want) || /дуб|дерев|массив|ясень|орех/.test(p.material)) && (!/металл/.test(want) || /металл/.test(p.material)) && (!/бархат/.test(want) || /бархат/.test(p.material)),
        (a, b) => (/низк/.test(want) ? (a.dims.h - b.dims.h) : 0) || (styleScore(b, design.styleId) - styleScore(a, design.styleId)) || (lighter ? luminance(b.color) - luminance(a.color) : cheaper ? a.price - b.price : 0));
      if (prod) ops.push({ op: 'replace', placementId: pl.id, productId: prod.id });
    }
    return { ops, reply: ops.length ? 'Заменяю: ' + ops.map(o => `«${name(findPl(design, o.placementId).productId)}» → «${name(o.productId)}»`).join('; ') : 'В каталоге нет подходящей замены — оставляю как есть.' };
  }
  if (/(убер|удали|без)[а-яё]*\s+декор/.test(t)) {
    for (const pl of design.placements.filter(p => DECOR_KINDS.includes(p.kind))) ops.push({ op: 'remove', placementId: pl.id });
    return { ops, reply: `Убираю декор и текстиль: ${ops.length} предметов.` };
  }
  const rm = t.match(/(убер|удали)[а-яё]*\s+(.+)/);
  if (rm) {
    const k = kindFromText(rm[2]);
    const targets = k ? findPls(k).filter(p => !roomWord || p.roomId === roomWord.id) : [];
    for (const pl of targets) ops.push({ op: 'remove', placementId: pl.id });
    return { ops, reply: targets.length ? `Удаляю: ${targets.map(pl => name(pl.productId)).join(', ')}.` : 'Не нашёл такой предмет в варианте.' };
  }
  const ad = t.match(/добав[а-яё]*\s+(.+)/);
  if (ad) {
    const k = kindFromText(ad[1]);
    const room = roomWord || project.rooms.find(r => (PROGRAM[r.type] || []).includes(k)) || project.rooms[0];
    const prod = k && pick(project, k, ctx, 'balanced');
    if (!prod) return { ops, reply: 'В каталоге нет подходящего товара — ничего не добавляю.' };
    ops.push({ op: 'add', roomId: room.id, productId: prod.id });
    return { ops, reply: `Добавляю «${prod.name}» в «${room.name}».` };
  }
  if (lighter || darker || cheaper) {
    for (const pl of design.placements) {
      if (roomWord && pl.roomId !== roomWord.id) continue;
      const cur = productById(project, pl.productId);
      const curStyle = styleScore(cur, design.styleId);
      const cand = analogs(project, cur, { city: project.city, styleId: design.styleId, limit: 20 }).filter(a => a.offer && a.style >= Math.min(1, curStyle) && Math.abs(a.product.dims.w - cur.dims.w) <= 300 && Math.abs((a.product.dims.d || 0) - (cur.dims.d || 0)) <= 200 && !avoidMatch(a.product, project.brief));
      let best = null;
      if (lighter) best = cand.filter(a => luminance(a.product.color) > luminance(cur.color) + 0.08).sort((a, b) => (b.style - a.style) || (luminance(b.product.color) - luminance(a.product.color)))[0];
      if (darker) best = cand.filter(a => luminance(a.product.color) < luminance(cur.color) - 0.08).sort((a, b) => (b.style - a.style) || (luminance(a.product.color) - luminance(b.product.color)))[0];
      if (cheaper) best = cand.filter(a => a.offer.price < (bestOffer(cur, project.city)?.price ?? cur.price) * 0.9).sort((a, b) => a.offer.price - b.offer.price)[0];
      if (best) ops.push({ op: 'replace', placementId: pl.id, productId: best.product.id });
    }
    for (const room of project.rooms) {
      if (roomWord && room.id !== roomWord.id) continue;
      const f = design.finishes[room.id]; if (!f?.walls || !(lighter || darker)) continue;
      const cur = productById(project, f.walls);
      const alt = allProducts(project).filter(p => p.kind === cur?.kind && isUsable(project, p, project.city)).sort((a, b) => lighter ? luminance(b.color) - luminance(a.color) : luminance(a.color) - luminance(b.color))[0];
      if (alt && alt.id !== f.walls) ops.push({ op: 'finish', roomId: room.id, surface: 'walls', productId: alt.id });
    }
    return { ops, reply: ops.length ? `${lighter ? 'Делаю светлее' : darker ? 'Делаю темнее' : 'Снижаю стоимость'}: ${ops.length} изменений.` : 'Подходящих аналогов в каталоге не нашлось.' };
  }
  return { ops, reply: 'Не понял запрос. Примеры: «замени диван на угловой», «сделай светлее», «сделай дешевле», «убери ковёр», «добавь растение в спальню», «убери декор».' };
}
const findPl = (design, id) => design.placements.find(x => x.id === id) || {};

export function applyOps(project, design, ops) {
  const diff = { added: [], removed: [], replaced: [], finishes: [], rejected: [] };
  const name = id => productById(project, id)?.name || id;
  for (const o of ops) {
    if (o.op === 'replace') { const before = replacePlacement(project, design, o.placementId, o.productId); if (before) diff.replaced.push(`${name(before)} → ${name(o.productId)}`); else diff.rejected.push(`«${name(o.productId)}» не помещается без нарушений — оставлен прежний предмет`); }
    if (o.op === 'remove') { const pl = design.placements.find(x => x.id === o.placementId); if (pl) { design.placements = design.placements.filter(x => x.id !== o.placementId); diff.removed.push(name(pl.productId)); } }
    if (o.op === 'add') { const np = addToRoom(project, design, o.roomId, o.productId); if (np) diff.added.push(name(o.productId)); else diff.rejected.push(`«${name(o.productId)}» не поместилось — зона оставлена пустой`); }
    if (o.op === 'finish' && productById(project, o.productId)) { const f = design.finishes[o.roomId] ||= {}; const before = f[o.surface]; f[o.surface] = o.productId; diff.finishes.push(`${name(before)} → ${name(o.productId)}`); }
  }
  return diff;
}
