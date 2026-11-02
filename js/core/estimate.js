// Сервис сметы (раздел 7) и сводного списка покупок (5.4). Смета собирается из объёмов модели,
// списка покупок, раскладки плитки и справочника расценок города; ручные правки накладываются сверху.
import { RATES, BULK, LEVELS, SECTIONS, RATES_META } from '../data/rates.js';
import { cityByName } from '../data/cities.js';
import { productById, bestOffer, allOffers, validateProduct } from './catalog.js';
import { roomMetrics, routeLength, POINT_KINDS, WET_ROOMS, roomAt } from './model.js';
import { surfaceFromSpec, computeLayout, tileFromProduct } from './tiles.js';
import { dist, polygonArea } from './geometry.js';

const LIGHT_KINDS = ['pendant', 'ceiling-light', 'track', 'floor-lamp', 'sconce'];
const DECOR_KINDS = ['rug', 'curtains', 'plant', 'decor', 'mirror'];
const FINISH_KINDS = ['paint', 'wallpaper', 'floor-covering', 'door', 'socket', 'switch'];

export function tileLayoutsFor(p, design) {
  return p.tiles.map(spec => {
    const product = productById(p, spec.productId);
    const surface = surfaceFromSpec(p, spec.surface, design);
    if (!product || !surface) return null;
    const tile = tileFromProduct(product);
    return { spec, product, surface, tile, result: computeLayout(surface, tile, spec.params) };
  }).filter(Boolean);
}

// ——— Объём работ по типу объекта (вторичка / новостройка) и стадии отделки от застройщика ———
export const OBJECT_TYPES = { secondary: 'Вторичное жильё', newbuild: 'Новостройка' };
export const HANDOVER = {
  none: { name: 'Без отделки («бетон»)', hint: 'Голые стены и перекрытия: стяжка, штукатурка, электрика и сантехника — с нуля.' },
  rough: { name: 'Черновая отделка', hint: 'Застройщик сделал стяжку, штукатурку стен и разводку электрики и воды до точек.' },
  prefinish: { name: 'Предчистовая (white box)', hint: 'Стены и потолки подготовлены под покраску, стяжка, коммуникации разведены, радиаторы стоят.' },
};

export function workScope(p) {
  const nb = p.objectType === 'newbuild';
  const h = nb ? (HANDOVER[p.handover] ? p.handover : 'none') : 'old';
  const done = [];
  const s = {
    newbuild: nb, handover: h,
    demolition: !nb,
    screed: !(nb && (h === 'rough' || h === 'prefinish')),
    plaster: !(nb && (h === 'rough' || h === 'prefinish')),
    ceilingLevel: !(nb && h === 'prefinish'),
    waterproof: !(nb && h === 'prefinish'),
    putty: !(nb && h === 'prefinish'),
    wiring: !(nb && (h === 'rough' || h === 'prefinish')),
    pipes: !(nb && (h === 'rough' || h === 'prefinish')),
    radiators: !nb,
  };
  if (nb) done.push('демонтаж');
  if (!s.screed) done.push('стяжка пола', 'штукатурка стен');
  if (!s.wiring) done.push('разводка кабелей и щиток', 'трубы водоснабжения и канализации');
  if (!s.putty) done.push('шпаклёвка стен и потолка', 'гидроизоляция санузла');
  if (!s.radiators) done.push('радиаторы отопления');
  s.excluded = done;
  return s;
}

// ——— Список покупок ———
export function shoppingList(p, design, { layouts } = {}) {
  const items = [];
  const city = p.city;
  const add = (productId, roomId, qty, unit, source, extra = {}) => {
    const key = `${source}:${roomId || 'all'}:${productId}${extra.suffix || ''}`;
    const ex = items.find(i => i.key === key);
    if (ex) { ex.qty += qty; ex.placementIds.push(...(extra.placementIds || [])); return; }
    items.push({ key, productId, roomId, qty, unit, source, placementIds: extra.placementIds || [], note: extra.note || '' });
  };
  if (design) {
    for (const pl of design.placements) add(pl.productId, pl.roomId, 1, 'шт', 'placement', { placementIds: [pl.id] });
    for (const room of p.rooms) {
      const f = design.finishes?.[room.id]; if (!f) continue;
      const m = roomMetrics(p, room);
      const tiledFloor = p.tiles.some(t => t.surface.roomId === room.id && t.surface.type === 'floor');
      if (f.floor && !tiledFloor) {
        const prod = productById(p, f.floor);
        if (prod) { const packM2 = prod.packM2 || 2; const m2 = Math.ceil(m.area * 1.07 / packM2) * packM2; add(f.floor, room.id, +m2.toFixed(2), 'м²', 'finish', { suffix: ':floor', note: `${m.area.toFixed(1)} м² + 7% подрезка` }); }
      }
      const tiledWalls = p.tiles.filter(t => t.surface.roomId === room.id && t.surface.type === 'wall');
      const tiledArea = (layouts || []).filter(l => tiledWalls.includes(l.spec)).reduce((s, l) => s + l.result.areaM2, 0);
      const wallArea = Math.max(0, m.wallArea - tiledArea);
      if (f.walls && wallArea > 0.5) {
        const prod = productById(p, f.walls);
        if (prod?.kind === 'paint') add(f.walls, room.id, Math.max(1, Math.ceil(wallArea * 2 / (prod.coverage || 60))), 'шт', 'finish', { suffix: ':walls', note: `${wallArea.toFixed(1)} м² × 2 слоя` });
        if (prod?.kind === 'wallpaper') add(f.walls, room.id, Math.ceil(wallArea * 1.15 / (prod.coverage || 10.6)), 'рул.', 'finish', { suffix: ':walls', note: `${wallArea.toFixed(1)} м² + 15%` });
      }
      if (f.ceiling) { const prod = productById(p, f.ceiling); if (prod) add(f.ceiling, room.id, Math.max(1, Math.ceil(m.area * 2 / (prod.coverage || 60))), 'шт', 'finish', { suffix: ':ceiling', note: `потолок ${m.area.toFixed(1)} м²` }); }
    }
    const doorId = design.doorProduct || 'door-white-80';
    const doors = p.openings.filter(o => o.kind === 'door' && !o.entrance).length;
    if (doors) add(doorId, null, doors, 'шт', 'finish', { suffix: ':doors' });
    const socketId = design.socketProduct || 'socket-white';
    const sockets = p.points.filter(x => x.kind.startsWith('socket')).length;
    const switches = p.points.filter(x => x.kind === 'switch').length;
    if (sockets) add(socketId, null, sockets, 'шт', 'finish', { suffix: ':sockets' });
    if (switches) add('switch-white', null, switches, 'шт', 'finish', { suffix: ':switches' });
  }
  for (const L of layouts || tileLayoutsFor(p, design)) {
    const unitM2 = (L.product.unit || 'м²') === 'м²';
    const pcs = L.tile.pack ? L.result.packs * L.tile.pack : L.result.totalPcs;
    add(L.product.id, L.spec.surface.roomId, unitM2 ? +(pcs * L.result.tileM2).toFixed(2) : pcs, unitM2 ? 'м²' : 'шт', 'tile', { suffix: ':' + L.spec.id, note: `${L.surface.title}: ${L.result.totalPcs} шт${L.result.packs ? `, ${L.result.packs} уп.` : ''}` });
    if (L.result.decorCount && L.spec.decorProduct) add(L.spec.decorProduct, L.spec.surface.roomId, L.result.decorCount, 'шт', 'tile', { suffix: ':decor:' + L.spec.id, note: 'декор-вставки' });
  }
  // Количество и исключения пользователя
  return items.map(i => {
    const product = productById(p, i.productId);
    const qty = p.shopping.qty[i.key] ?? i.qty;
    const offer = product ? bestOffer(product, city) : null;
    const anyOffer = product ? allOffers(product, city).sort((a, b) => a.price - b.price)[0] : null;
    const price = offer?.price ?? anyOffer?.price ?? product?.price ?? 0;
    return { ...i, qty, product, offer, price, sum: price * qty, issues: validateProduct(p, product, city), excluded: p.shopping.excluded.includes(i.key), room: p.rooms.find(r => r.id === i.roomId) };
  });
}

export function sectionOf(product) {
  if (!product) return 'furniture';
  if (product.kind?.startsWith('tile')) return 'tile';
  if (LIGHT_KINDS.includes(product.kind) || DECOR_KINDS.includes(product.kind)) return 'lighting';
  if (FINISH_KINDS.includes(product.kind)) return product.kind === 'socket' || product.kind === 'switch' ? 'electric' : 'finish';
  return 'furniture';
}

// ——— Смета ———
export function buildEstimate(p, design, { level, cityName } = {}) {
  const city = cityByName(cityName || p.city);
  const lvl = LEVELS[level || p.estimate.level] || LEVELS.standard;
  const lines = [];
  const notes = [];
  const today = new Date().toISOString().slice(0, 10);
  const rateSrc = { kind: 'rates', label: `${RATES_META.title}, v${RATES_META.version}`, date: RATES_META.date };
  const work = (key, rate, qty, room, extra = {}) => {
    if (!(qty > 0)) return;
    const R = RATES[rate];
    lines.push({ key, section: R.section, roomId: room?.id || null, name: R.name, qty: round2(qty), unit: R.unit, price: Math.round(R.price * city.work * lvl.k), basePrice: R.price, type: 'work', source: rateSrc, ...extra });
  };
  const bulk = (key, id, qty, section, room, extra = {}) => {
    if (!(qty > 0)) return;
    const B = BULK[id];
    lines.push({ key, section, roomId: room?.id || null, name: B.name, qty: round2(qty), unit: B.unit, price: Math.round(B.price * city.material), type: 'material', source: { ...rateSrc, label: rateSrc.label + ' (материалы)' }, ...extra });
  };

  const rooms = p.rooms;
  const metrics = Object.fromEntries(rooms.map(r => [r.id, roomMetrics(p, r)]));
  const totalAreaM2 = rooms.reduce((s, r) => s + metrics[r.id].area, 0);
  const layouts = tileLayoutsFor(p, design);
  const inc = p.estimate.include || {};
  const scope = workScope(p);
  if (scope.excluded.length) notes.push({ level: 'info', text: `${OBJECT_TYPES[p.objectType] || ''}${scope.newbuild ? ', ' + HANDOVER[scope.handover].name.toLowerCase() : ''}: не учитываем — ${scope.excluded.join(', ')} (выполнено застройщиком или не требуется).` });

  // Демонтаж и подготовка (в новостройке старой отделки нет — сносим только то, что помечено на плане)
  if (inc.demo !== false) {
    if (scope.demolition) for (const r of rooms) { work(`demoFloor:${r.id}`, 'demoFloor', metrics[r.id].area, r); work(`demoWalls:${r.id}`, 'demoWalls', metrics[r.id].wallArea, r); }
    const demolish = p.walls.filter(w => w.status === 'demolish');
    const demM2 = demolish.reduce((s, w) => s + dist(w.a, w.b) / 1000 * 2.7, 0);
    work('demoPartition', 'demoPartition', demM2, null, { note: demolish.length ? `${demolish.length} стен под снос по плану` : '' });
    work('prepProtect', 'prepProtect', totalAreaM2, null);
  }
  // Черновые работы
  const newWalls = p.walls.filter(w => w.status === 'new');
  const newM2 = newWalls.reduce((s, w) => s + dist(w.a, w.b) / 1000 * 2.7, 0);
  work('partitionBuild', 'partitionBuild', newM2, null); bulk('partitionBlock', 'partitionBlock', newM2, 'rough', null);
  if (inc.rough !== false) {
    for (const r of rooms) {
      const m = metrics[r.id];
      if (scope.screed) work(`screed:${r.id}`, 'screed', m.area, r);
      if (scope.plaster) work(`plaster:${r.id}`, 'plaster', m.wallArea, r);
      if (scope.ceilingLevel) work(`ceilingLevel:${r.id}`, 'ceilingLevel', m.area, r);
      if (scope.waterproof && WET_ROOMS.includes(r.type)) work(`waterproof:${r.id}`, 'waterproof', m.area + m.perimeter * 0.3, r);
    }
    const wallsTotal = rooms.reduce((s, r) => s + metrics[r.id].wallArea, 0);
    if (scope.screed) bulk('screedMix', 'screedMix', Math.ceil(totalAreaM2 * BULK.screedMix.perM2), 'rough');
    if (scope.plaster) bulk('plasterMix', 'plasterMix', Math.ceil(wallsTotal * BULK.plasterMix.perM2), 'rough');
    bulk('primer', 'primer', Math.ceil((wallsTotal + totalAreaM2 * 2) * BULK.primer.perM2), 'rough');
    const wet = rooms.filter(r => WET_ROOMS.includes(r.type)).reduce((s, r) => s + metrics[r.id].area + metrics[r.id].perimeter * 0.3, 0);
    if (scope.waterproof) bulk('waterproofMix', 'waterproofMix', Math.ceil(wet * BULK.waterproofMix.perM2), 'rough');
  }

  // Инженерия
  if (p.journey.skippedEngineering) notes.push({ level: 'warn', text: 'Шаг «Инженерия» пропущен: смета без электромонтажных и сантехнических работ.' });
  else {
    const pts = p.points;
    const count = kinds => pts.filter(x => kinds.includes(x.kind)).length;
    work('elPoint', scope.wiring ? 'elPoint' : 'elDevice', count(['socket', 'socket-kitchen', 'socket-power', 'switch']), null);
    work('elLight', 'elLight', count(['light', 'wall-light']), null);
    if (scope.wiring) {
    work('elBox', 'elBox', count(['junction']), null);
    bulk('junction', 'junction', count(['junction']), 'electric', null);
    if (count(['panel'])) { work('elPanel', 'elPanel', count(['panel']), null); bulk('panelBox', 'panelBox', count(['panel']), 'electric', null); }
    const breakers = p.groups.length + 1;
    work('elBreaker', 'elBreaker', breakers, null);
    bulk('breaker', 'breaker', p.groups.filter(g => !g.rcd).length + 1, 'electric', null);
    bulk('rcd', 'rcd', p.groups.filter(g => g.rcd).length, 'electric', null);
    }
    const elRoutes = p.routes.filter(r => r.system === 'electric');
    let cableLight = 0, cablePower = 0, chase = 0;
    if (elRoutes.length) {
      for (const r of elRoutes) {
        const g = p.groups.find(x => x.id === r.group);
        const L = routeLength(r) / 1000 * 1.1;
        if (g?.kind === 'light') cableLight += L; else cablePower += L;
        if ((r.via || 'wall') === 'wall') chase += routeLength(r) / 1000;
      }
    } else {
      // Без трасс — оценка по ортогональному расстоянию от щитка с запасом 20%
      const panel = pts.find(x => x.kind === 'panel');
      if (panel) for (const x of pts.filter(x => POINT_KINDS[x.kind]?.system === 'electric' && x.kind !== 'panel')) {
        const L = (Math.abs(x.x - panel.x) + Math.abs(x.y - panel.y)) / 1000 * 1.2 + 1;
        if (['light', 'wall-light', 'switch'].includes(x.kind)) cableLight += L; else cablePower += L;
      }
      chase = (cableLight + cablePower) * 0.5;
      if (panel) notes.push({ level: 'info', text: 'Трассы кабеля не проложены — длина кабеля оценена по расстоянию от щитка (+20%).' });
    }
    if (scope.wiring) {
      work('elCable', 'elCable', cableLight + cablePower, null); work('elChase', 'elChase', chase, null);
      bulk('cableLight', 'cableLight', Math.ceil(cableLight), 'electric', null); bulk('cableSocket', 'cableSocket', Math.ceil(cablePower), 'electric', null);
    }
    // Сантехника и отопление
    const fixtures = pts.filter(x => POINT_KINDS[x.kind]?.needs);
    if (scope.pipes) work('plPoint', 'plPoint', fixtures.reduce((s, f) => s + POINT_KINDS[f.kind].needs.length, 0), null);
    work('plFixture', 'plFixture', fixtures.length, null);
    const lenOf = sys => p.routes.filter(r => r.system === sys).reduce((s, r) => s + routeLength(r) / 1000, 0);
    const water = lenOf('cold') + lenOf('hot'), sewer = lenOf('sewer'), heat = lenOf('heating'), vent = lenOf('vent');
    if (scope.pipes) {
      work('plPipe', 'plPipe', water, null); bulk('pipeWater', 'pipeWater', Math.ceil(water * 1.1), 'plumbing', null);
      work('plSewer', 'plSewer', sewer, null); bulk('pipeSewer', 'pipeSewer', Math.ceil(sewer * 1.1), 'plumbing', null);
    }
    if (count(['collector'])) { work('plCollector', 'plCollector', count(['collector']), null); bulk('collector', 'collector', count(['collector']), 'plumbing', null); }
    if (scope.radiators) {
      work('htRadiator', 'htRadiator', count(['radiator']), null);
      work('htPipe', 'htPipe', heat, null); bulk('pipeHeating', 'pipeHeating', Math.ceil(heat * 1.1), 'plumbing', null);
    }
    const loops = p.heatingLoops.reduce((s, l) => s + l.w * l.h / 1e6, 0);
    work('htFloor', 'htFloor', loops, null); bulk('warmFloorMat', 'warmFloorMat', loops, 'plumbing', null);
    work('htBoiler', 'htBoiler', count(['boiler']), null);
    work('vent', 'vent', count(['vent-channel', 'hood']), null);
    work('ventDuct', 'ventDuct', vent, null); bulk('duct', 'duct', Math.ceil(vent), 'plumbing', null);
  }

  // Отделка (работы) по комнатам
  const shop = shoppingList(p, design, { layouts });
  for (const r of rooms) {
    const m = metrics[r.id];
    const f = design?.finishes?.[r.id] || {};
    const wallProd = f.walls && productById(p, f.walls);
    const tiledWall = layouts.filter(l => l.spec.surface.roomId === r.id && l.spec.surface.type === 'wall').reduce((s, l) => s + l.result.areaM2, 0);
    const tiledFloor = layouts.some(l => l.spec.surface.roomId === r.id && l.spec.surface.type === 'floor');
    const paintArea = Math.max(0, m.wallArea - tiledWall);
    if (wallProd?.kind === 'wallpaper') work(`wallpaper:${r.id}`, 'wallpaper', paintArea, r);
    else work(`paintWalls:${r.id}`, scope.putty ? 'paintWalls' : 'paintOnly', paintArea, r);
    work(`paintCeiling:${r.id}`, scope.putty ? 'paintCeiling' : 'paintCeilingOnly', m.area, r);
    if (!tiledFloor) work(`laminate:${r.id}`, 'laminate', m.area, r);
    if (!tiledFloor) { work(`baseboard:${r.id}`, 'baseboard', m.baseboard, r); bulk(`baseboardMat:${r.id}`, 'baseboard', Math.ceil(m.baseboard / 2.4), 'finish', r); }
    if (scope.putty) bulk(`putty:${r.id}`, 'putty', Math.ceil((paintArea + m.area) * BULK.putty.perM2), 'finish', r);
  }
  work('doorInstall', 'doorInstall', p.openings.filter(o => o.kind === 'door' && !o.entrance).length, null);

  // Плитка: работы и сопутствующие материалы из раскладки
  const patternK = { straight: 1, half: 1.05, third: 1.05, diagonal: 1.25, herringbone: 1.4, hex: 1.3 };
  for (const L of layouts) {
    const room = rooms.find(r => r.id === L.spec.surface.roomId);
    const k = patternK[L.result.params.pattern] || 1;
    const rate = L.spec.surface.type === 'floor' ? 'tileFloor' : 'tileWall';
    work(`tile:${L.spec.id}`, rate, L.result.areaM2, room, { price: Math.round(RATES[rate].price * city.work * lvl.k * k), note: `${L.surface.title}, ${(L.result.params.pattern && { straight: 'прямая', half: 'сдвиг 1/2', third: 'сдвиг 1/3', diagonal: 'диагональ ×1,25', herringbone: 'ёлочка ×1,4', hex: 'шестигранник ×1,3' }[L.result.params.pattern]) || ''}` });
    work(`grout:${L.spec.id}`, 'tileGrout', L.result.areaM2, room);
    bulk(`adhesive:${L.spec.id}`, 'tileAdhesive', L.result.adhesiveBags, 'tile', room, { note: `${L.result.adhesiveKg.toFixed(0)} кг` });
    bulk(`groutMat:${L.spec.id}`, 'grout', L.result.groutPacks, 'tile', room, { note: `${L.result.groutKg.toFixed(1)} кг` });
  }
  if (!layouts.length && rooms.some(r => WET_ROOMS.includes(r.type))) notes.push({ level: 'info', text: 'Раскладка плитки не задана — плитка не учтена в смете.' });

  // Товары из списка покупок
  const stores = new Set();
  for (const it of shop) {
    if (it.excluded || !it.product) continue;
    const section = sectionOf(it.product);
    const src = it.offer ? { kind: 'store', label: it.offer.storeName + (it.offer.demo ? ' (демо)' : ''), url: it.offer.url, date: it.offer.updated } : { kind: 'store', label: 'Нет актуального предложения', url: null, date: null };
    if (it.offer) stores.add(it.offer.store);
    lines.push({ key: 'shop:' + it.key, section, roomId: it.roomId, name: it.product.name, qty: it.qty, unit: it.unit, price: it.price, type: section === 'furniture' ? 'furniture' : 'material', source: src, productId: it.product.id, issues: it.issues, note: it.note });
    if (section === 'furniture') {
      if (it.product.kind === 'kitchen-set') work(`kitchenInstall:${it.key}`, 'kitchenInstall', it.product.dims.w / 1000 * it.qty, it.room);
      else work(`assembly:${it.key}`, 'assembly', it.qty, it.room, { note: it.product.name });
    }
    if (LIGHT_KINDS.includes(it.product.kind)) work(`lightInstall:${it.key}`, 'lightInstall', it.qty, it.room, { note: it.product.name });
    if (it.product.kind === 'curtains') work(`curtain:${it.key}`, 'curtainInstall', it.qty, it.room);
    if (['bath', 'shower', 'toilet', 'vanity', 'washer'].includes(it.product.kind) && p.journey.skippedEngineering) work(`fixture:${it.key}`, 'plFixture', it.qty, it.room);
  }

  // Накладные
  work('delivery', 'delivery', stores.size, null, { note: [...stores].join(', ') });
  work('lifting', 'lifting', stores.size * Math.max(1, (p.aptFloor || 1) - 1) * 0.5, null, { note: `этаж ${p.aptFloor || 1}, с лифтом ×0,5` });
  // Вывоз мусора: во вторичке — от демонтажа, в новостройке — упаковка и обрезки (меньше)
  if (inc.demo !== false || scope.newbuild) work('garbage', 'garbage', Math.max(1, totalAreaM2 * (scope.newbuild ? 0.02 : 0.06) + newM2 * 0.05), null, { note: scope.newbuild ? 'упаковка, обрезки, остатки смесей' : 'после демонтажа' });

  // Ручные правки и свои позиции (FR-49)
  const ov = p.estimate.overrides || {};
  let out = lines.map(l => {
    const o = ov[l.key]; if (!o) return l;
    return { ...l, qty: o.qty ?? l.qty, price: o.price ?? l.price, performer: o.performer ?? l.performer, removed: !!o.removed, edited: o.qty != null || o.price != null, source: o.price != null ? { kind: 'manual', label: 'Правка пользователя', date: o.date || today } : l.source };
  });
  for (const c of p.estimate.custom || []) out.push({ key: c.id, section: c.section || 'overhead', roomId: c.roomId || null, name: c.name, qty: Number(c.qty) || 0, unit: c.unit || 'шт', price: Number(c.price) || 0, type: c.type || 'work', performer: c.performer, source: { kind: 'manual', label: 'Своя позиция', date: c.date || today }, custom: true });
  out = out.map(l => ({ ...l, sum: l.removed ? 0 : Math.round(l.qty * l.price) }));

  const sum = f => out.filter(f).reduce((s, l) => s + l.sum, 0);
  const subtotal = sum(() => true);
  const reservePct = Number(p.estimate.reserve ?? 10);
  const reserve = Math.round(subtotal * reservePct / 100);
  out.push({ key: 'reserve', section: 'overhead', name: `Резерв на непредвиденные расходы ${reservePct}%`, qty: 1, unit: 'компл.', price: reserve, sum: reserve, type: 'work', source: { kind: 'rates', label: 'Процент от итога', date: today } });
  const totals = {
    materials: sum(l => l.type === 'material'), furniture: sum(l => l.type === 'furniture'), works: sum(l => l.type === 'work') + reserve,
  };
  totals.total = totals.materials + totals.furniture + totals.works;
  const bySection = SECTIONS.map(s => ({ ...s, total: out.filter(l => l.section === s.id).reduce((a, l) => a + l.sum, 0), lines: out.filter(l => l.section === s.id) }));
  const byRoom = rooms.map(r => ({ room: r, total: out.filter(l => l.roomId === r.id).reduce((a, l) => a + l.sum, 0) }));
  return { lines: out, totals, bySection, byRoom, notes, city, level: lvl, date: today, meta: RATES_META, area: totalAreaM2 };
}

const round2 = v => Math.round(v * 100) / 100;

export function estimateLevels(p, design) {
  return Object.fromEntries(Object.keys(LEVELS).map(k => [k, buildEstimate(p, design, { level: k }).totals.total]));
}

// Сравнение двух вариантов по стоимости (FR-52)
export function compareEstimates(a, b) {
  const map = new Map();
  for (const l of a.lines) map.set(l.name + '|' + (l.roomId || ''), { name: l.name, a: (map.get(l.name + '|' + (l.roomId || ''))?.a || 0) + l.sum, b: 0, roomId: l.roomId });
  for (const l of b.lines) { const k = l.name + '|' + (l.roomId || ''); const e = map.get(k) || { name: l.name, a: 0, b: 0, roomId: l.roomId }; e.b += l.sum; map.set(k, e); }
  return [...map.values()].map(e => ({ ...e, diff: e.b - e.a })).filter(e => Math.abs(e.diff) > 0).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
}

export function roomArea(r) { return polygonArea(r.poly) / 1e6; }
export { roomAt };
