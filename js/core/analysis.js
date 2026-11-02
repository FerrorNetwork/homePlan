// Локальный разбор референсов (FR-21): палитра по пикселям, оценка настроения и материалов,
// ближайший готовый стиль. Используется, когда ИИ-провайдер не подключён, и как подсказка рядом с ответом ИИ.
import { STYLES } from '../data/styles.js';

const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const parse = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export async function paletteFromImage(src, k = 5) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const c = document.createElement('canvas'); const S = 64;
  c.width = S; c.height = Math.max(1, Math.round(S * img.height / img.width));
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, c.width, c.height);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  const px = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) px.push([data[i], data[i + 1], data[i + 2]]);
  // k-means на 64×N пикселях
  let centers = Array.from({ length: k }, (_, i) => px[Math.floor(i * px.length / k)] || [128, 128, 128]);
  let counts = [];
  for (let it = 0; it < 8; it++) {
    const sums = centers.map(() => [0, 0, 0]); counts = centers.map(() => 0);
    for (const p of px) {
      let bi = 0, bd = Infinity;
      centers.forEach((cc, j) => { const d = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2; if (d < bd) { bd = d; bi = j; } });
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
    }
    centers = centers.map((cc, j) => counts[j] ? sums[j].map(v => v / counts[j]) : cc);
  }
  return centers.map((cc, j) => ({ color: hex(cc), share: counts[j] / px.length })).sort((a, b) => b.share - a.share);
}

const MATERIAL_WORDS = [[/дерев|дуб|ясен|орех/, 'дерево'], [/металл|чёрн[а-яё]* металл|сталь/, 'металл'], [/бетон|микроцемент/, 'бетон'], [/кирпич/, 'кирпич'], [/мрамор|камен/, 'камень'], [/лён|льнян|хлоп/, 'лён/хлопок'], [/бархат/, 'бархат'], [/кож/, 'кожа'], [/ротанг|плетён/, 'ротанг'], [/латун|золот/, 'латунь'], [/стекл/, 'стекло'], [/глянц/, 'глянец']];
const FURN_WORDS = [[/диван/, 'диван'], [/кресл/, 'кресло'], [/стеллаж|полк/, 'стеллажи'], [/кроват/, 'кровать'], [/стол/, 'стол'], [/торшер|светильник|люстр/, 'светильники'], [/ковёр|ковер/, 'ковёр'], [/растен/, 'растения']];

export function interpret(paletteSets, prompt = '') {
  const all = paletteSets.flat();
  const merged = [];
  for (const c of all) {
    const ex = merged.find(m => dist3(parse(m.color), parse(c.color)) < 40);
    if (ex) ex.share += c.share; else merged.push({ ...c });
  }
  merged.sort((a, b) => b.share - a.share);
  const palette = merged.slice(0, 5).map(x => x.color);
  const hsl = merged.slice(0, 8).map(x => ({ h: toHsl(parse(x.color)), w: x.share }));
  const W = hsl.reduce((s, x) => s + x.w, 0) || 1;
  const light = hsl.reduce((s, x) => s + x.h[2] * x.w, 0) / W;
  const sat = hsl.reduce((s, x) => s + x.h[1] * x.w, 0) / W;
  const warm = hsl.reduce((s, x) => s + ((x.h[0] < 70 || x.h[0] > 330) && x.h[1] > 0.12 ? x.w : 0), 0) / W;
  const materials = new Set();
  for (const x of hsl) {
    const [h, s, l] = x.h;
    if (h >= 20 && h <= 45 && s > 0.25 && l > 0.25 && l < 0.7) materials.add('дерево');
    if (s < 0.1 && l < 0.35) materials.add('чёрный металл');
    if (s < 0.08 && l >= 0.35 && l < 0.75) materials.add('бетон/камень');
    if (h > 70 && h < 160 && s > 0.15) materials.add('растения/зелень');
    if (l > 0.85) materials.add('светлые матовые поверхности');
  }
  const t = prompt.toLowerCase();
  for (const [re, m] of MATERIAL_WORDS) if (re.test(t)) materials.add(m);
  const furniture = FURN_WORDS.filter(([re]) => re.test(t)).map(([, f]) => f);
  const mood = [light > 0.7 ? 'светлое' : light < 0.4 ? 'тёмное, камерное' : 'сбалансированное по свету', warm > 0.45 ? 'тёплое' : 'прохладное', sat > 0.35 ? 'насыщенное' : 'приглушённое'].join(', ');
  const avoid = [];
  if (/без глянц/.test(t)) avoid.push('глянец');
  const styleScores = STYLES.map(s => ({ s, d: palette.length ? palette.reduce((acc, c) => acc + Math.min(...s.palette.map(p => dist3(parse(p), parse(c)))), 0) / palette.length : 999 }))
    .map(x => ({ ...x, d: x.d - (t.includes(x.s.name.toLowerCase().slice(0, 5)) ? 60 : 0) - (x.s.materials.some(m => [...materials].some(mm => mm.includes(m.split(' ')[0]))) ? 10 : 0) }))
    .sort((a, b) => a.d - b.d);
  return { palette, mood, materials: [...materials], furniture, avoid, styleId: styleScores[0]?.s.id, styleAlt: styleScores.slice(1, 3).map(x => x.s.id), source: 'local' };
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Простейшее распознавание стен на изображении плана (FR-5) — поиск длинных тёмных горизонтальных
// и вертикальных отрезков. Результат — предложения, которые пользователь подтверждает или удаляет.
export async function detectWalls(src, { maxSide = 900, threshold = 90, minLen = 40 } = {}) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const W = Math.round(img.width * k), H = Math.round(img.height * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const dark = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) dark[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) < threshold ? 1 : 0;
  const segs = [];
  const scan = (horizontal) => {
    const A = horizontal ? H : W, B = horizontal ? W : H;
    const runs = [];
    for (let a = 0; a < A; a++) {
      let start = -1;
      for (let b = 0; b <= B; b++) {
        const v = b < B && dark[horizontal ? a * W + b : b * W + a];
        if (v && start < 0) start = b;
        if (!v && start >= 0) { if (b - start >= minLen) runs.push({ a, s: start, e: b }); start = -1; }
      }
    }
    // Объединяем соседние параллельные прогоны в одну стену (толщина)
    runs.sort((x, y) => x.s - y.s || x.a - y.a);
    const used = new Array(runs.length).fill(false);
    for (let i = 0; i < runs.length; i++) {
      if (used[i]) continue;
      let lo = runs[i].a, hi = runs[i].a, s = runs[i].s, e = runs[i].e; used[i] = true;
      for (let j = i + 1; j < runs.length; j++) {
        if (used[j]) continue;
        const r = runs[j];
        if (Math.abs(r.s - s) < 8 && Math.abs(r.e - e) < 8 && r.a <= hi + 2 && r.a >= lo - 2) { lo = Math.min(lo, r.a); hi = Math.max(hi, r.a); used[j] = true; }
      }
      const thick = hi - lo + 1;
      if (thick < 2 || thick > 40) continue;
      const mid = (lo + hi) / 2;
      segs.push(horizontal ? { a: { x: s, y: mid }, b: { x: e, y: mid }, thick } : { a: { x: mid, y: s }, b: { x: mid, y: e }, thick });
    }
  };
  scan(true); scan(false);
  return { segments: segs.slice(0, 200).map(s => ({ a: { x: s.a.x / k, y: s.a.y / k }, b: { x: s.b.x / k, y: s.b.y / k }, thick: s.thick / k })), width: img.width, height: img.height };
}
