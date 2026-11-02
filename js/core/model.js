// Модель проекта: справочники элементов, шаблоны, миграции и производные величины.
import { autoWire } from './wiring.js';
import { polygonArea, polygonPerimeter, polygonEdgeDistance, dist, pathLength } from './geometry.js';

export const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 9);
export const PROJECT_VERSION = 2;

export const ROOM_TYPES = ['Кухня-гостиная', 'Гостиная', 'Кухня', 'Спальня', 'Детская', 'Кабинет', 'Ванная', 'Санузел', 'Прихожая', 'Коридор', 'Гардеробная', 'Балкон', 'Кладовая'];
export const WET_ROOMS = ['Ванная', 'Санузел'];
export const ROOM_COLORS = {
  'Кухня-гостиная': '#efe6d6', 'Гостиная': '#efe6d6', 'Кухня': '#f3e7d3', 'Спальня': '#e9e3ef', 'Детская': '#e3eee3',
  'Кабинет': '#e6eaf0', 'Ванная': '#ddebee', 'Санузел': '#ddebee', 'Прихожая': '#eeebe3', 'Коридор': '#eeebe3',
  'Гардеробная': '#ece6dc', 'Балкон': '#e6eee9', 'Кладовая': '#ebe8e1',
};

export const WALL_TYPES = {
  bearing: { name: 'Несущая', thickness: 380, color: '#2b2a27' },
  partition: { name: 'Перегородка', thickness: 100, color: '#7d776b' },
  wet: { name: 'Мокрая зона', thickness: 120, color: '#3f7f8f' },
};

export const OPENING_LIBRARY = {
  door: { name: 'Дверь', presets: [[700, 2000], [800, 2000], [900, 2050]], sill: 0 },
  window: { name: 'Окно', presets: [[1200, 1400], [1500, 1400], [1800, 1500]], sill: 850 },
  arch: { name: 'Арка', presets: [[900, 2100], [1200, 2200]], sill: 0 },
  balcony: { name: 'Балконный блок', presets: [[1500, 2200], [2100, 2200]], sill: 0 },
};

export const STRUCTURE_KINDS = {
  column: { name: 'Колонна', w: 400, h: 400 },
  stairs: { name: 'Лестница', w: 1000, h: 3000 },
  niche: { name: 'Ниша', w: 1200, h: 300 },
  slope: { name: 'Скос мансарды', w: 3000, h: 1200 },
};

// Системы инженерии и их точки (FR-9, FR-14, FR-16).
export const SYSTEMS = {
  electric: { name: 'Электрика', color: '#d98a16', layer: 'electric' },
  cold: { name: 'Холодная вода', color: '#1f86d1', layer: 'water' },
  hot: { name: 'Горячая вода', color: '#d6453d', layer: 'water' },
  sewer: { name: 'Канализация', color: '#7a5a3a', layer: 'sewer' },
  heating: { name: 'Отопление', color: '#e0612a', layer: 'heating' },
  vent: { name: 'Вентиляция', color: '#6f63c9', layer: 'vent' },
};

export const POINT_KINDS = {
  socket: { name: 'Розетка', system: 'electric', h: 300, power: 300, icon: 'socket' },
  'socket-kitchen': { name: 'Розетка над столешницей', system: 'electric', h: 1100, power: 600, icon: 'socket' },
  'socket-power': { name: 'Силовая розетка (плита/духовка)', system: 'electric', h: 150, power: 7000, icon: 'socket' },
  switch: { name: 'Выключатель', system: 'electric', h: 900, power: 0, icon: 'switch' },
  light: { name: 'Светильник', system: 'electric', h: 2700, power: 60, icon: 'light' },
  'wall-light': { name: 'Бра', system: 'electric', h: 1700, power: 20, icon: 'light' },
  panel: { name: 'Щиток', system: 'electric', h: 1700, power: 0, icon: 'panel' },
  junction: { name: 'Распаечная коробка', system: 'electric', h: 2400, power: 0, icon: 'junction' },
  sink: { name: 'Раковина', system: 'water', h: 600, needs: ['cold', 'hot', 'sewer'], icon: 'water' },
  'kitchen-sink': { name: 'Кухонная мойка', system: 'water', h: 600, needs: ['cold', 'hot', 'sewer'], icon: 'water' },
  bath: { name: 'Ванна', system: 'water', h: 700, needs: ['cold', 'hot', 'sewer'], icon: 'water' },
  shower: { name: 'Душ', system: 'water', h: 1000, needs: ['cold', 'hot', 'sewer'], icon: 'water' },
  toilet: { name: 'Унитаз', system: 'water', h: 200, needs: ['cold', 'sewer'], icon: 'water' },
  washer: { name: 'Стиральная машина', system: 'water', h: 600, needs: ['cold', 'sewer'], power: 2100, icon: 'water' },
  dishwasher: { name: 'Посудомоечная машина', system: 'water', h: 400, needs: ['cold', 'sewer'], power: 2000, icon: 'water' },
  collector: { name: 'Коллектор', system: 'water', h: 400, icon: 'collector' },
  riser: { name: 'Стояк', system: 'water', h: 0, icon: 'riser' },
  radiator: { name: 'Радиатор', system: 'heating', h: 150, heat: 1500, icon: 'radiator' },
  boiler: { name: 'Котёл', system: 'heating', h: 1200, power: 0, icon: 'boiler' },
  'vent-channel': { name: 'Вентканал', system: 'vent', h: 2500, icon: 'vent' },
  hood: { name: 'Вытяжка', system: 'vent', h: 2000, power: 200, icon: 'vent' },
};

export const pointLayer = kind => {
  const k = POINT_KINDS[kind]; if (!k) return 'electric';
  return k.system === 'water' ? 'water' : k.system;
};

export const DEFAULT_RULES = {
  socketFromWater: 600,     // мм, розетка от раковины/ванны/душа по горизонтали
  socketFromStove: 150,     // мм, розетка от силовой точки плиты
  maxPointsPerGroup: 10,    // точек на одну группу
  sewerSlopeMin: 2,         // %, минимальный уклон канализации
  sewerMaxLength: 5000,     // мм, длина отвода до стояка без дополнительной вентиляции
  passageMin: 700,          // мм, минимальный проход между мебелью
  doorClearance: 800,       // мм, зона открывания двери
  voltage: 230,
};

export const DEFAULT_LAYERS = { walls: true, dims: true, furniture: true, electric: true, water: true, sewer: true, heating: true, vent: true, finish: true, underlay: true, structure: true };

const rect = (x1, y1, x2, y2) => [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];

function wall(a, b, type, thickness, status = 'existing') {
  return { id: uid('w'), floor: 'f1', a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, type, thickness: thickness ?? WALL_TYPES[type].thickness, status };
}

// Пример квартиры ~54 м²: кухня-гостиная, спальня, ванная, прихожая, гардеробная.
export function sampleGeometry() {
  const W = {
    top: wall([0, 0], [10000, 0], 'bearing'), right: wall([10000, 0], [10000, 6200], 'bearing'),
    bottom: wall([10000, 6200], [0, 6200], 'bearing'), left: wall([0, 6200], [0, 0], 'bearing'),
    mid: wall([5600, 0], [5600, 4200], 'bearing', 200), hall: wall([0, 4200], [10000, 4200], 'partition'),
    bath: wall([2600, 4200], [2600, 6200], 'wet'), ward: wall([7200, 4200], [7200, 6200], 'partition'),
  };
  const walls = Object.values(W);
  const op = (w, kind, offset, width, height, extra = {}) => ({ id: uid('o'), wall: w.id, kind, offset, width, height, sill: OPENING_LIBRARY[kind].sill, swing: 'left', ...extra });
  const openings = [
    op(W.top, 'window', 1600, 1500, 1400), op(W.top, 'window', 4000, 1500, 1400), op(W.top, 'window', 7800, 1500, 1400),
    op(W.bottom, 'door', 5600, 900, 2050, { entrance: true }),
    op(W.hall, 'door', 3900, 800, 2000), op(W.hall, 'door', 6500, 800, 2000),
    op(W.bath, 'door', 1450, 700, 2000, { swing: 'right' }), op(W.ward, 'door', 1000, 700, 2000),
  ];
  const room = (name, type, poly) => ({ id: uid('r'), floor: 'f1', name, type, poly, ceiling: 2700, color: ROOM_COLORS[type] });
  const rooms = [
    room('Кухня-гостиная', 'Кухня-гостиная', rect(190, 190, 5500, 4150)),
    room('Спальня', 'Спальня', rect(5700, 190, 9810, 4150)),
    room('Ванная', 'Ванная', rect(190, 4250, 2540, 6010)),
    room('Прихожая', 'Прихожая', rect(2660, 4250, 7150, 6010)),
    room('Гардеробная', 'Гардеробная', rect(7250, 4250, 9810, 6010)),
  ];
  const pt = (kind, x, y, extra = {}) => ({ id: uid('p'), floor: 'f1', kind, x, y, h: POINT_KINDS[kind].h, power: POINT_KINDS[kind].power || 0, group: null, ...extra });
  const points = [
    pt('panel', 3200, 5950), pt('kitchen-sink', 260, 2700), pt('socket-power', 260, 1500, { group: 'g3' }),
    pt('socket-kitchen', 260, 2100, { group: 'g2' }), pt('socket-kitchen', 260, 3300, { group: 'g2' }), pt('dishwasher', 260, 3000, { group: 'g2' }), pt('washer', 260, 3600, { group: 'g5' }),
    pt('socket', 3000, 4090, { group: 'g1' }), pt('socket', 5440, 1200, { group: 'g1' }), pt('socket', 4500, 250, { group: 'g1' }),
    pt('switch', 3500, 4090, { group: 'g4' }), pt('light', 1500, 2200, { group: 'g4' }), pt('light', 3800, 2200, { group: 'g4' }),
    pt('socket', 5760, 1000, { group: 'g1', h: 700 }), pt('socket', 9750, 1600, { group: 'g1' }), pt('light', 7750, 2150, { group: 'g4' }), pt('switch', 6000, 4090, { group: 'g4' }),
    pt('riser', 2460, 4330), pt('bath', 260, 5100), pt('sink', 1550, 4320), pt('toilet', 2470, 5000),
    pt('light', 1400, 5000, { group: 'g4' }), pt('light', 4800, 5100, { group: 'g4' }),
    pt('radiator', 1600, 300), pt('radiator', 4000, 300), pt('radiator', 7800, 300),
    pt('vent-channel', 2470, 5250), pt('hood', 260, 1500, { h: 2000 }), pt('light', 8500, 5100, { group: 'g4' }),
  ];
  // Подводка воды и канализации от стояка к приборам
  const riser = points.find(x => x.kind === 'riser');
  const routes = [];
  for (const f of points.filter(x => POINT_KINDS[x.kind].needs)) {
    for (const sys of POINT_KINDS[f.kind].needs) {
      const path = orthoPathSimple({ x: riser.x, y: riser.y }, { x: f.x, y: f.y }, sys === 'sewer');
      routes.push({ id: uid('rt'), floor: 'f1', system: sys, from: riser.id, to: f.id, path, via: sys === 'sewer' ? 'floor' : 'wall', slope: sys === 'sewer' ? 2.5 : 0 });
    }
  }
  const groups = [
    { id: 'g1', name: 'Розетки комнат', breaker: 16, kind: 'sockets', rcd: true, cable: '3×2,5' },
    { id: 'g2', name: 'Кухня, рабочая зона', breaker: 16, kind: 'sockets', rcd: true, cable: '3×2,5' },
    { id: 'g3', name: 'Варочная панель', breaker: 32, kind: 'power', rcd: true, cable: '3×6' },
    { id: 'g4', name: 'Освещение', breaker: 10, kind: 'light', rcd: false, cable: '3×1,5' },
    { id: 'g5', name: 'Стиральная машина', breaker: 16, kind: 'power', rcd: true, cable: '3×2,5' },
  ];
  return { walls, openings, rooms, points, groups, routes };
}

// Трасса вдоль стен: сначала по вертикали (вдоль стены со стояком), затем по горизонтали
function orthoPathSimple(a, b, horizontalFirst) {
  if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return [a, b];
  return horizontalFirst ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
}

export function createProject({ name = 'Новая квартира', city = 'Самара', region = 'Самарская область', template = 'sample', kind = 'Квартира', aptFloor = 5, objectType = 'secondary', handover = 'none' } = {}) {
  const geo = template === 'sample' ? sampleGeometry() : { walls: [], openings: [], rooms: [], points: [], groups: [
    { id: 'g1', name: 'Розетки', breaker: 16, kind: 'sockets', rcd: true, cable: '3×2,5' },
    { id: 'g2', name: 'Освещение', breaker: 10, kind: 'light', rcd: false, cable: '3×1,5' },
  ] };
  const now = new Date().toISOString();
  const project = {
    version: PROJECT_VERSION, id: uid('prj'), name, kind, city, region, aptFloor, objectType, handover, createdAt: now, updatedAt: now,
    floors: [{ id: 'f1', name: '1 этаж', height: 2700 }], activeFloor: 'f1',
    routes: [], ...geo, structures: [], heatingLoops: [], underlay: null,
    rules: { ...DEFAULT_RULES }, layers: { ...DEFAULT_LAYERS },
    brief: {
      style: 'scandi', prompt: 'Светлая кухня-гостиная, дерево и чёрный металл, без глянца.', references: [], analysis: null,
      budget: 1500000, occupants: 2, children: false, pets: false, mustHave: 'рабочий стол', avoid: 'глянец',
      rooms: {}, decor: true, provider: 'local', consent: false,
    },
    designs: [], selectedDesign: null,
    tiles: [],
    catalogExtra: [], catalogFlags: {},
    shopping: { qty: {}, excluded: [] },
    estimate: { level: 'standard', reserve: 10, overrides: {}, custom: [], compareWith: null, history: [] },
    journey: { completed: [], skippedEngineering: false },
  };
  if (template === 'sample') project.routes.push(...autoWire(project));
  return project;
}

// Приведение старых и неполных проектов к текущей схеме.
export function migrate(p) {
  if (!p || typeof p !== 'object') return createProject();
  if (!p.version || p.version < 2 || !Array.isArray(p.walls) || p.rooms?.some(r => !r.poly)) {
    // Формат первой версии MVP (комнаты-прямоугольники в пикселях) — переносим имя и город, геометрию берём из примера.
    const fresh = createProject({ name: p.name || 'Новая квартира', city: p.city || 'Самара', region: p.region || 'Самарская область' });
    return fresh;
  }
  const base = createProject({ template: 'empty' });
  const out = { ...base, ...p };
  out.rules = { ...DEFAULT_RULES, ...(p.rules || {}) };
  out.layers = { ...DEFAULT_LAYERS, ...(p.layers || {}) };
  out.brief = { ...base.brief, ...(p.brief || {}) };
  out.shopping = { ...base.shopping, ...(p.shopping || {}) };
  out.estimate = { ...base.estimate, ...(p.estimate || {}) };
  out.journey = { ...base.journey, ...(p.journey || {}) };
  for (const k of ['structures', 'routes', 'heatingLoops', 'designs', 'tiles', 'catalogExtra', 'groups', 'openings', 'points']) if (!Array.isArray(out[k])) out[k] = [];
  out.catalogFlags ||= {};
  out.objectType ||= 'secondary';
  out.handover ||= 'none';
  return out;
}

// ——— Производные величины ———

export function wallById(p, id) { return p.walls.find(w => w.id === id); }

export function openingGeometry(p, o) {
  const w = wallById(p, o.wall); if (!w) return null;
  const len = dist(w.a, w.b) || 1, ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len;
  const c = { x: w.a.x + ux * o.offset, y: w.a.y + uy * o.offset };
  return {
    wall: w, center: c, dir: { x: ux, y: uy }, normal: { x: -uy, y: ux },
    a: { x: c.x - ux * o.width / 2, y: c.y - uy * o.width / 2 }, b: { x: c.x + ux * o.width / 2, y: c.y + uy * o.width / 2 },
  };
}

export function roomOpenings(p, room) {
  return p.openings.filter(o => {
    const g = openingGeometry(p, o); if (!g) return false;
    return g.wall.floor === room.floor && polygonEdgeDistance(g.center, room.poly) <= g.wall.thickness / 2 + 40;
  });
}

export function roomMetrics(p, room) {
  const area = polygonArea(room.poly) / 1e6;
  const perimeter = polygonPerimeter(room.poly) / 1000;
  const ceiling = (room.ceiling || 2700) / 1000;
  const ops = roomOpenings(p, room);
  const openingsArea = ops.reduce((s, o) => s + (o.width / 1000) * (Math.min(o.height + (o.sill || 0), room.ceiling || 2700) - (o.sill || 0)) / 1000, 0);
  const doorWidth = ops.filter(o => o.kind !== 'window').reduce((s, o) => s + o.width / 1000, 0);
  return { area, perimeter, volume: area * ceiling, ceiling, wallArea: Math.max(0, perimeter * ceiling - openingsArea), openingsArea, baseboard: Math.max(0, perimeter - doorWidth), openings: ops };
}

export function roomAt(p, pt, floor = p.activeFloor) {
  return p.rooms.find(r => r.floor === floor && pointInPoly(pt, r.poly));
}
function pointInPoly(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function routeLength(r) { return pathLength(r.path) + (r.vertical || 0); }

export function totalArea(p) { return p.rooms.reduce((s, r) => s + polygonArea(r.poly) / 1e6, 0); }

export function groupLoad(p, g) {
  const pts = p.points.filter(x => x.group === g.id);
  const power = pts.reduce((s, x) => s + (Number(x.power) || 0), 0);
  // Для розеточных групп применяем коэффициент одновременности 0,7 при числе точек > 3.
  const k = g.kind === 'sockets' && pts.length > 3 ? 0.7 : 1;
  const design = power * k;
  const current = design / (p.rules.voltage || 230);
  return { points: pts.length, power, design, current, overload: current > g.breaker };
}

// Ближайшая стена помещения для точки: проекция на стену и нормаль внутрь комнаты (для ориентации обозначений)
export function pointWallFrame(p, pt) {
  const room = roomAt(p, pt, pt.floor);
  if (!room) return { x: pt.x, y: pt.y, nx: 0, ny: 1, d: Infinity };
  let best = null;
  room.poly.forEach((a, i) => {
    const b = room.poly[(i + 1) % room.poly.length];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2));
    const q = { x: a.x + dx * t, y: a.y + dy * t }, d = Math.hypot(pt.x - q.x, pt.y - q.y);
    if (!best || d < best.d) best = { d, q, a, b };
  });
  const len = Math.hypot(best.b.x - best.a.x, best.b.y - best.a.y) || 1;
  let nx = -(best.b.y - best.a.y) / len, ny = (best.b.x - best.a.x) / len;
  const c = room.poly.reduce((s, q) => ({ x: s.x + q.x / room.poly.length, y: s.y + q.y / room.poly.length }), { x: 0, y: 0 });
  if ((c.x - best.q.x) * nx + (c.y - best.q.y) * ny < 0) { nx = -nx; ny = -ny; }
  return { x: best.q.x, y: best.q.y, nx, ny, d: best.d };
}
