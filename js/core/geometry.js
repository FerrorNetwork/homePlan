// Геометрия плана. Все координаты и размеры — в миллиметрах.

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const angleDeg = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 360) % 360;
export const snap = (v, step) => Math.round(v / step) * step;

export function polygonArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function polygonPerimeter(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) s += dist(poly[i], poly[(i + 1) % poly.length]);
  return s;
}

export function centroid(poly) {
  let x = 0, y = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    x += (p.x + q.x) * f; y += (p.y + q.y) * f; a += f;
  }
  if (Math.abs(a) < 1e-6) return bbox(poly).center;
  return { x: x / (3 * a), y: y / (3 * a) };
}

export function bbox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } };
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Проекция точки на отрезок: t в [0..1], расстояние и сама точка.
export function projectOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, point: q, distance: dist(p, q) };
}

export function segmentsIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t <= 0.001 || t >= 0.999 || u <= 0.001 || u >= 0.999) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t, u };
}

// Прямоугольник предмета с учётом поворота (кратного 90°) → {x, y, w, h} в плане (x,y — левый верхний угол).
export function footprint(item) {
  const rot = ((item.rotation || 0) % 360 + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const w = swap ? item.d : item.w, h = swap ? item.w : item.d;
  return { x: item.x - w / 2, y: item.y - h / 2, w, h };
}

export const rectsOverlap = (a, b, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

export const rectContains = (r, p, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

export const rectCorners = r => [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];

export function rectInsidePolygon(r, poly) {
  return rectCorners(r).every(c => pointInPolygon(c, poly) || polygonEdgeDistance(c, poly) < 2)
    && pointInPolygon({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, poly);
}

export function polygonEdgeDistance(p, poly) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, projectOnSegment(p, poly[i], poly[(i + 1) % poly.length]).distance);
  return m;
}

// Отсечение произвольного многоугольника выпуклым (Сазерленд — Ходжмен). Используется в раскладке плитки.
export function clipByConvex(subject, clip) {
  let output = subject;
  const sign = Math.sign(signedArea(clip)) || 1;
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const inside = p => sign * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) >= -1e-9;
    const input = output; output = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j], prev = input[(j + input.length - 1) % input.length];
      const ci = inside(cur), pi = inside(prev);
      if (ci) { if (!pi) output.push(lineIntersection(prev, cur, a, b)); output.push(cur); }
      else if (pi) output.push(lineIntersection(prev, cur, a, b));
    }
  }
  return output;
}

export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y; }
  return s / 2;
}

function lineIntersection(p1, p2, p3, p4) {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x) || 1e-9;
  const a = p1.x * p2.y - p1.y * p2.x, b = p3.x * p4.y - p3.y * p4.x;
  return { x: (a * (p3.x - p4.x) - (p1.x - p2.x) * b) / d, y: (a * (p3.y - p4.y) - (p1.y - p2.y) * b) / d };
}

export const rotatePoint = (p, deg, o = { x: 0, y: 0 }) => {
  const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const x = p.x - o.x, y = p.y - o.y;
  return { x: o.x + x * c - y * s, y: o.y + x * s + y * c };
};

// Ортогональная трасса между двумя точками (FR-10): сначала по большей оси, затем по меньшей.
export function orthoPath(a, b, mode = 'auto') {
  if (Math.abs(a.x - b.x) < 1 || Math.abs(a.y - b.y) < 1) return [a, b];
  const horizontalFirst = mode === 'h' || (mode === 'auto' && Math.abs(b.x - a.x) >= Math.abs(b.y - a.y));
  return horizontalFirst ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
}

export function pathLength(path) {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += dist(path[i - 1], path[i]);
  return s;
}

export const fmtM = (mm, digits = 2) => (mm / 1000).toFixed(digits).replace('.', ',');
export const fmtM2 = mm2 => (mm2 / 1e6).toFixed(1).replace('.', ',');
