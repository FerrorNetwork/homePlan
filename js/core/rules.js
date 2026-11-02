// Детерминированные проверки: инженерия (FR-12, FR-17) и эргономика расстановки (раздел 4.2, FR-29).
// Все проверки — подсказки: результат показывается как предупреждение, а не блокировка.
import { dist, segmentsIntersect, footprint, rectsOverlap, rectContains, rectInsidePolygon, rotatePoint, pathLength } from './geometry.js';
import { POINT_KINDS, SYSTEMS, groupLoad, openingGeometry, roomOpenings, WET_ROOMS, roomAt } from './model.js';

const WATER_FIXTURES = ['sink', 'kitchen-sink', 'bath', 'shower'];
const CABLE_MAX_A = { '3×1,5': 10, '3×2,5': 20, '3×4': 25, '3×6': 32, '3×10': 50 };

export function checkEngineering(p) {
  const issues = [];
  const R = p.rules;
  const add = (level, system, text, refs = [], at = null) => issues.push({ level, system, text, refs, at });
  const floorPts = p.points;

  // Розетки рядом с водой и плитой
  const sockets = floorPts.filter(x => x.kind.startsWith('socket') && x.kind !== 'socket-power');
  for (const s of sockets) {
    for (const w of floorPts.filter(x => x.floor === s.floor && WATER_FIXTURES.includes(x.kind))) {
      const d = dist(s, w);
      if (d < R.socketFromWater) add('warn', 'electric', `Розетка в ${Math.round(d)} мм от точки «${POINT_KINDS[w.kind].name}» — правило: не ближе ${R.socketFromWater} мм`, [s.id, w.id], s);
    }
    for (const st of floorPts.filter(x => x.floor === s.floor && x.kind === 'socket-power')) {
      const d = dist(s, st);
      if (d < R.socketFromStove) add('warn', 'electric', `Розетка в ${Math.round(d)} мм от силовой точки плиты — правило: не ближе ${R.socketFromStove} мм`, [s.id, st.id], s);
    }
  }
  // Розетки в ванной без УЗО
  for (const s of sockets) {
    const room = roomAt(p, s, s.floor);
    const g = p.groups.find(x => x.id === s.group);
    if (room && WET_ROOMS.includes(room.type) && g && !g.rcd) add('warn', 'electric', `Розетка в помещении «${room.name}» в группе без УЗО`, [s.id], s);
  }

  // Группы: число точек, перегрузка, сечение кабеля
  let total = 0;
  for (const g of p.groups) {
    const L = groupLoad(p, g);
    total += L.design;
    if (L.points > R.maxPointsPerGroup) add('warn', 'electric', `Группа «${g.name}»: ${L.points} точек — больше лимита ${R.maxPointsPerGroup} на линию`, [g.id]);
    if (L.overload) add('error', 'electric', `Группа «${g.name}»: расчётный ток ${L.current.toFixed(1)} А превышает автомат ${g.breaker} А`, [g.id]);
    const cableMax = CABLE_MAX_A[g.cable];
    if (cableMax && g.breaker > cableMax) add('error', 'electric', `Группа «${g.name}»: автомат ${g.breaker} А не защищает кабель ${g.cable} (до ${cableMax} А)`, [g.id]);
  }
  const unassigned = floorPts.filter(x => POINT_KINDS[x.kind]?.system === 'electric' && !['panel', 'junction'].includes(x.kind) && !x.group);
  if (unassigned.length) add('info', 'electric', `${unassigned.length} электроточек не назначены на группы`, unassigned.map(x => x.id));
  if (floorPts.some(x => POINT_KINDS[x.kind]?.system === 'electric') && !floorPts.some(x => x.kind === 'panel')) add('warn', 'electric', 'На плане нет щитка');
  if (floorPts.some(x => POINT_KINDS[x.kind]?.system === 'electric' && x.kind !== 'panel') && !p.routes.some(r => r.system === 'electric')) add('info', 'electric', 'Кабели не проложены — нажмите «Развести кабели» в блоке «Группы и щиток» или проложите трассы вручную');
  if (total > 15000) add('info', 'electric', `Суммарная расчётная мощность ${(total / 1000).toFixed(1)} кВт — сверьте с выделенной мощностью квартиры`);

  // Подводка к сантехприборам
  for (const f of floorPts.filter(x => POINT_KINDS[x.kind]?.needs)) {
    for (const sys of POINT_KINDS[f.kind].needs) {
      const has = p.routes.some(r => r.system === sys && (r.from === f.id || r.to === f.id));
      if (!has) add('info', sys, `«${POINT_KINDS[f.kind].name}»: не проложена трасса «${SYSTEMS[sys].name}»`, [f.id], f);
    }
  }

  // Трассы: уклон, длина отвода, пересечения, несущие стены
  for (const r of p.routes) {
    if (r.system === 'sewer') {
      if ((Number(r.slope) || 0) < R.sewerSlopeMin) add('warn', 'sewer', `Канализация: уклон ${r.slope || 0}% меньше ${R.sewerSlopeMin}%`, [r.id], r.path[0]);
      const len = pathLength(r.path);
      if (len > R.sewerMaxLength) add('warn', 'sewer', `Отвод канализации ${(len / 1000).toFixed(1)} м длиннее ${R.sewerMaxLength / 1000} м — нужен вентиляционный клапан или ближний стояк`, [r.id], r.path[0]);
      const drop = len * (Number(r.slope) || 0) / 100;
      if (drop > 400) add('info', 'sewer', `Перепад канализации ${Math.round(drop)} мм — проверьте высоту подиума/выпуска`, [r.id], r.path[0]);
    }
    for (const w of p.walls.filter(w => w.type === 'bearing' && w.floor === r.floor && w.status !== 'demolish')) {
      for (let i = 1; i < r.path.length; i++) {
        const hit = segmentsIntersect(r.path[i - 1], r.path[i], w.a, w.b);
        if (hit) add('warn', r.system, `Трасса «${SYSTEMS[r.system].name}» пересекает несущую стену — сверление только по согласованию`, [r.id, w.id], hit);
      }
    }
  }
  for (let i = 0; i < p.routes.length; i++) for (let j = i + 1; j < p.routes.length; j++) {
    const a = p.routes[i], b = p.routes[j];
    if (a.floor !== b.floor || a.system === b.system) continue;
    if ((a.via || 'wall') !== (b.via || 'wall') && (a.via === 'ceiling' || b.via === 'ceiling')) continue;
    const danger = (a.system === 'electric') !== (b.system === 'electric');
    outer: for (let s = 1; s < a.path.length; s++) for (let t = 1; t < b.path.length; t++) {
      const hit = segmentsIntersect(a.path[s - 1], a.path[s], b.path[t - 1], b.path[t]);
      if (hit) { add(danger ? 'warn' : 'info', a.system, `Пересечение трасс «${SYSTEMS[a.system].name}» и «${SYSTEMS[b.system].name}»${danger ? ' — электрика рядом с водой' : ''}`, [a.id, b.id], hit); break outer; }
    }
  }
  if (p.routes.some(r => r.system === 'sewer') && !floorPts.some(x => x.kind === 'riser')) add('warn', 'sewer', 'Есть канализация, но на плане нет стояка');

  // Вентиляция и отопление по помещениям
  for (const room of p.rooms) {
    const inside = floorPts.filter(x => x.floor === room.floor && roomAt(p, x, room.floor)?.id === room.id);
    if (WET_ROOMS.includes(room.type) && !inside.some(x => x.kind === 'vent-channel' || x.kind === 'hood')) add('warn', 'vent', `«${room.name}»: нет вентканала или вытяжки`, [room.id]);
    const hasWindow = roomOpenings(p, room).some(o => o.kind === 'window' || o.kind === 'balcony');
    if (hasWindow && !inside.some(x => x.kind === 'radiator') && !p.heatingLoops.some(l => l.room === room.id)) add('info', 'heating', `«${room.name}»: окно без радиатора или тёплого пола`, [room.id]);
  }
  return issues;
}

// ——— Эргономика ———
// front — глубина свободной зоны перед предметом, мм; floor — напольный (ковёр), wall — навесной.
export const KIND_RULES = {
  sofa: { front: 600, label: 'Диван' }, 'sofa-corner': { front: 600, label: 'Угловой диван' }, armchair: { front: 450, label: 'Кресло' },
  'coffee-table': { front: 0, label: 'Журнальный стол' }, 'tv-stand': { front: 600, label: 'ТВ-тумба' }, bookshelf: { front: 600, label: 'Стеллаж' },
  'kitchen-set': { front: 1000, label: 'Кухня' }, fridge: { front: 900, label: 'Холодильник' }, 'dining-table': { front: 0, label: 'Обеденный стол' }, chair: { front: 0, label: 'Стул' },
  bed: { front: 600, label: 'Кровать' }, nightstand: { front: 0, label: 'Тумба' }, wardrobe: { front: 700, label: 'Шкаф' }, dresser: { front: 700, label: 'Комод' },
  desk: { front: 700, label: 'Стол' }, 'office-chair': { front: 0, label: 'Кресло' }, 'shoe-cabinet': { front: 600, label: 'Обувница' }, 'coat-rack': { front: 500, label: 'Вешалка' },
  bath: { front: 600, frontWidth: 750, label: 'Ванна' }, shower: { front: 600, frontWidth: 750, label: 'Душ' }, vanity: { front: 700, label: 'Тумба с раковиной' }, toilet: { front: 600, label: 'Унитаз' }, washer: { front: 600, label: 'Стиральная машина' },
  'floor-lamp': { front: 0, label: 'Торшер' }, plant: { front: 0, label: 'Растение' }, rug: { floor: true, label: 'Ковёр' }, curtains: { wall: true, label: 'Шторы' },
  mirror: { wall: true, label: 'Зеркало' }, sconce: { wall: true, label: 'Бра' }, decor: { wall: true, label: 'Декор' },
  pendant: { ceiling: true, label: 'Подвесной светильник' }, 'ceiling-light': { ceiling: true, label: 'Светильник' }, track: { ceiling: true, label: 'Трек' },
};
// Пары, которые могут перекрываться (стул под столом, тумба под зеркалом и т. п.).
const OVERLAP_OK = new Set(['dining-table|chair', 'desk|office-chair', 'coffee-table|rug', 'sofa|rug', 'sofa-corner|rug', 'bed|rug', 'armchair|rug']);
const CONNECTED = { 'kitchen-set': ['kitchen-sink', 'socket-power', 'dishwasher', 'socket-kitchen', 'hood', 'washer'], vanity: ['sink'], washer: ['washer'], toilet: ['toilet'], bath: ['bath'], shower: ['shower'], fridge: [] };

export const frontVector = rot => rotatePoint({ x: 0, y: 1 }, rot || 0);

export function frontRect(pl, depth) {
  const f = footprint(pl), v = frontVector(pl.rotation);
  // Для ванны и душа достаточно зоны подхода по центру, а не по всей длине
  const fw = KIND_RULES[pl.kind]?.frontWidth;
  if (Math.abs(v.y) > 0.5) { const w = fw ? Math.min(fw, f.w) : f.w; return { x: f.x + (f.w - w) / 2, y: v.y > 0 ? f.y + f.h : f.y - depth, w, h: depth }; }
  const h = fw ? Math.min(fw, f.h) : f.h;
  return { x: v.x > 0 ? f.x + f.w : f.x - depth, y: f.y + (f.h - h) / 2, w: depth, h };
}

export function doorZones(p, room) {
  const zones = [];
  for (const o of roomOpenings(p, room)) {
    if (o.kind === 'window') continue;
    const g = openingGeometry(p, o); if (!g) continue;
    const depth = Math.max(p.rules.doorClearance, o.width);
    // Зона по обе стороны проёма; внутри комнаты останется нужная половина.
    const pts = [g.a, g.b, { x: g.a.x + g.normal.x * depth, y: g.a.y + g.normal.y * depth }, { x: g.b.x + g.normal.x * depth, y: g.b.y + g.normal.y * depth }, { x: g.a.x - g.normal.x * depth, y: g.a.y - g.normal.y * depth }, { x: g.b.x - g.normal.x * depth, y: g.b.y - g.normal.y * depth }];
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    zones.push({ opening: o, rect: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } });
  }
  return zones;
}

export function windowZones(p, room) {
  return roomOpenings(p, room).filter(o => o.kind === 'window' || o.kind === 'balcony').map(o => {
    const g = openingGeometry(p, o); const d = 350;
    const pts = [g.a, g.b, { x: g.a.x + g.normal.x * d, y: g.a.y + g.normal.y * d }, { x: g.b.x - g.normal.x * d, y: g.b.y - g.normal.y * d }];
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    return { opening: o, rect: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
  });
}

export function pointBlocked(pl, pt) {
  const kr = KIND_RULES[pl.kind] || {};
  if (kr.floor || kr.ceiling) return false;
  if ((CONNECTED[pl.kind] || []).includes(pt.kind)) return false;
  const f = footprint(pl);
  if (!rectContains(f, pt, 60)) return false;
  const k = POINT_KINDS[pt.kind]; if (!k) return false;
  if (k.system === 'electric') return ['socket', 'socket-kitchen', 'switch', 'panel', 'junction'].includes(pt.kind) && (pt.h ?? k.h) < (pl.h || 0) + 50;
  if (pt.kind === 'radiator') return (pl.h || 0) > 250;
  if (pt.kind === 'vent-channel') return (pl.h || 0) > 2200;
  if (k.system === 'water') return true;
  return false;
}

export function placementIssues(p, design, pl, others, checkOthersFront = true) {
  const issues = [];
  const room = p.rooms.find(r => r.id === pl.roomId);
  const kr = KIND_RULES[pl.kind] || {};
  if (!room) return [{ level: 'error', text: 'Предмет вне помещения', id: pl.id }];
  if (kr.ceiling || kr.wall) return issues;
  const f = footprint(pl);
  if (!rectInsidePolygon(f, room.poly)) issues.push({ level: 'error', text: `${kr.label || 'Предмет'} выходит за стены помещения`, id: pl.id });
  if (kr.floor) return issues;
  for (const o of others) {
    if (o.id === pl.id || o.roomId !== pl.roomId) continue;
    const ok = KIND_RULES[o.kind] || {};
    if (ok.floor || ok.ceiling || ok.wall) continue;
    if (OVERLAP_OK.has(`${o.kind}|${pl.kind}`) || OVERLAP_OK.has(`${pl.kind}|${o.kind}`)) continue;
    if (rectsOverlap(f, footprint(o), -5)) { issues.push({ level: 'error', text: `${kr.label || 'Предмет'} пересекается с «${ok.label || o.kind}»`, id: pl.id }); break; }
  }
  for (const z of doorZones(p, room)) if (rectsOverlap(f, z.rect, -5)) { issues.push({ level: 'warn', text: `${kr.label || 'Предмет'} мешает открыванию/проходу двери`, id: pl.id }); break; }
  if ((pl.h || 0) > 1000) for (const z of windowZones(p, room)) if (rectsOverlap(f, z.rect, -5)) { issues.push({ level: 'warn', text: `${kr.label || 'Предмет'} высотой ${pl.h} мм закрывает окно`, id: pl.id }); break; }
  for (const pt of p.points.filter(x => x.floor === room.floor)) if (pointBlocked(pl, pt)) { issues.push({ level: 'warn', text: `${kr.label || 'Предмет'} перекрывает «${POINT_KINDS[pt.kind]?.name}»`, id: pl.id, point: pt.id }); break; }
  const solid = o => !(KIND_RULES[o.kind]?.floor || KIND_RULES[o.kind]?.ceiling || KIND_RULES[o.kind]?.wall);
  if (kr.front) {
    const fr = frontRect(pl, Math.min(kr.front, p.rules.passageMin));
    const blocked = others.find(o => o.id !== pl.id && o.roomId === pl.roomId && solid(o) && !frontExempt(pl.kind, o.kind) && rectsOverlap(fr, footprint(o), -5));
    if (blocked) issues.push({ level: 'warn', text: `Проход перед «${(kr.label || '').toLowerCase()}» меньше ${Math.min(kr.front, p.rules.passageMin)} мм`, id: pl.id });
    else if (!rectInsidePolygon({ ...fr, x: fr.x + 1, y: fr.y + 1, w: fr.w - 2, h: Math.max(1, fr.h - 2) }, room.poly)) issues.push({ level: 'warn', text: `Перед «${(kr.label || '').toLowerCase()}» нет свободной зоны ${kr.front} мм`, id: pl.id });
  }
  // Новый предмет не должен занимать зону прохода перед уже стоящими предметами
  if (checkOthersFront) {
    const victim = others.find(o => o.id !== pl.id && o.roomId === pl.roomId && solid(o) && KIND_RULES[o.kind]?.front && !frontExempt(o.kind, pl.kind) && rectsOverlap(frontRect(o, Math.min(KIND_RULES[o.kind].front, p.rules.passageMin)), f, -5));
    if (victim) issues.push({ level: 'warn', text: `${kr.label || 'Предмет'} загораживает проход перед «${(KIND_RULES[victim.kind]?.label || '').toLowerCase()}»`, id: pl.id });
  }
  return issues;
}

const frontExempt = (owner, intruder) => OVERLAP_OK.has(`${intruder}|${owner}`) || OVERLAP_OK.has(`${owner}|${intruder}`)
  || (['coffee-table', 'chair', 'office-chair', 'floor-lamp', 'dining-table'].includes(intruder) && ['sofa', 'sofa-corner', 'desk', 'armchair', 'tv-stand'].includes(owner));

export function validateDesign(p, design) {
  const pls = design?.placements || [];
  return pls.flatMap(pl => placementIssues(p, design, pl, pls, false));
}
