// Автоматическая разводка кабелей (FR-10): для каждой группы — линия от щитка цепочкой
// по ближайшим точкам, под прямым углом. Свет — по потолку, розетки и силовые линии — по стене.
import { orthoPath, segmentsIntersect, dist, pathLength } from './geometry.js';
import { uid, POINT_KINDS, openingGeometry } from './model.js';

function bearingCrossings(p, path, floor) {
  let n = 0;
  for (const w of p.walls.filter(w => w.floor === floor && w.type === 'bearing' && w.status !== 'demolish'))
    for (let i = 1; i < path.length; i++) if (segmentsIntersect(path[i - 1], path[i], w.a, w.b)) n++;
  return n;
}

// Варианты: напрямую (два порядка изломов) и через дверные проёмы — чтобы не сверлить несущие стены
function bestPath(p, a, b, floor) {
  const options = ['h', 'v'].map(o => orthoPath(a, b, o));
  for (const o of p.openings) {
    if (o.kind === 'window') continue;
    const g = openingGeometry(p, o); if (!g || g.wall.floor !== floor) continue;
    for (const o1 of ['h', 'v']) for (const o2 of ['h', 'v']) {
      const first = orthoPath(a, g.center, o1), second = orthoPath(g.center, b, o2);
      options.push([...first, ...second.slice(1)]);
    }
  }
  const cost = path => bearingCrossings(p, path, floor) * 1e7 + pathLength(path);
  return options.sort((x, y) => cost(x) - cost(y))[0];
}

export function autoWire(p) {
  const routes = [];
  for (const floor of p.floors.map(f => f.id)) {
    const panel = p.points.find(x => x.floor === floor && x.kind === 'panel');
    if (!panel) continue;
    for (const g of p.groups) {
      let rest = p.points.filter(x => x.floor === floor && x.group === g.id && POINT_KINDS[x.kind]?.system === 'electric' || (x.floor === floor && x.group === g.id && POINT_KINDS[x.kind]?.power && POINT_KINDS[x.kind]?.system === 'water'));
      if (!rest.length) continue;
      let cur = panel;
      const via = g.kind === 'light' ? 'ceiling' : 'wall';
      while (rest.length) {
        const next = rest.reduce((a, b) => dist(cur, b) < dist(cur, a) ? b : a);
        rest = rest.filter(x => x !== next);
        routes.push({ id: uid('rt'), floor, system: 'electric', from: cur.id, to: next.id, path: bestPath(p, { x: cur.x, y: cur.y }, { x: next.x, y: next.y }, floor), via, slope: 0, group: g.id, auto: true });
        cur = next;
      }
    }
  }
  return routes;
}
