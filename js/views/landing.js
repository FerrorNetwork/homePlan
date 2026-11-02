// Промо-главная для неавторизованных посетителей: анимированный рассказ о продукте и вход в работу.
import { S, projectIndex, newProject } from '../store.js';
import { go, authDialog, STEPS } from '../main.js';
import { esc, icon } from '../ui.js';
import { createProject, openingGeometry, WALL_TYPES } from '../core/model.js';
import { generateDesigns } from '../core/designer.js';
import { footprint, bbox, centroid } from '../core/geometry.js';
import { KIND_RULES } from '../core/rules.js';
import { productById } from '../core/catalog.js';
import { pointGlyph } from './symbols.js';
import { STYLES } from '../data/styles.js';
import { CITIES } from '../data/cities.js';
import { buildEstimate } from '../core/estimate.js';
import { tileSpecsForDesign } from '../core/designer.js';

// Линейные «чертёжные» значки для живого фона
const BG_ICONS = [
  '<path d="M6 30h52v14H6zM10 30V20h44v10M6 44v6M58 44v6"/>',                                   // диван
  '<path d="M8 56V8h4v48M12 8a44 44 0 0 1 44 44"/><path d="M12 8h44v4" stroke-dasharray="3 3"/>', // дверь с дугой
  '<path d="M6 10h52v44H6zM32 10v44M6 32h52"/>',                                                  // окно
  '<path d="M14 40a18 18 0 0 1 36 0zM32 40v12M24 52h16"/>',                                       // розетка
  '<path d="M4 32h56M4 26v12M60 26v12M8 36l-4-4 4-4M56 28l4 4-4 4"/><text x="32" y="24" font-size="9" text-anchor="middle" fill="currentColor" stroke="none">3600</text>', // размер
  '<path d="M8 8h22v22H8zM34 8h22v22H34zM8 34h22v22H8zM34 34h22v22H34z"/>',                     // плитка
  '<path d="M6 44L44 6l14 14-38 38zM14 36l5 5M22 28l5 5M30 20l5 5M38 12l5 5"/>',                  // линейка
  '<circle cx="32" cy="32" r="20"/><path d="M18 18l28 28M46 18L18 46"/>',                         // светильник
  '<path d="M10 54V22l22-14 22 14v32zM26 54V36h12v18"/>',                                         // дом
  '<path d="M8 20h48v28H8zM8 30h48M18 48v8M46 48v8"/>',                                           // кровать
];
const SCENES = ['Главная', 'Цифры', 'Как это работает', 'Чертежи', 'Подбор', 'Смета', 'Вопросы', 'Начать'];
const WORDS = ['ремонт квартиры', 'кухню-гостиную', 'ванную комнату', 'новостройку', 'электрику', 'смету ремонта'];

// Рассказ «Как это работает»: слайды листаются прокруткой страницы
const fmtRub = v => new Intl.NumberFormat('ru-RU').format(Math.round(v)) + ' ₽';
const storyPlan = () => `<div class="lp-card lp-v-plan"><svg viewBox="0 0 400 280" fill="none" stroke-linecap="round" stroke-linejoin="round">
  <g class="lp-v-rooms"><rect x="20" y="20" width="200" height="150" fill="#e6efe9"/><rect x="220" y="20" width="160" height="110" fill="#f4e7d6"/><rect x="220" y="130" width="160" height="130" fill="#eceae4"/><rect x="20" y="170" width="200" height="90" fill="#e3ecf3"/></g>
  <path class="lp-v-draw" pathLength="1" d="M20 20H380V260H20Z M220 20V260 M20 170H220 M220 130H380" stroke="#2b2924" stroke-width="7"/>
  <g class="lp-v-dims" stroke="#9a948a" stroke-width="1.5"><path d="M20 8H380M20 2V14M380 2V14"/><path d="M392 20V260M386 20H398M386 260H398"/></g>
  <g class="lp-v-lbl" font-family="Manrope, Arial" font-weight="700" fill="#48443d" font-size="14" stroke="none"><text x="120" y="100" text-anchor="middle">Гостиная 18,6 м²</text><text x="300" y="80" text-anchor="middle">Кухня 9,8 м²</text><text x="300" y="200" text-anchor="middle">Спальня 12,4 м²</text><text x="120" y="220" text-anchor="middle">Ванная 4,1 м²</text></g>
  </svg><div class="lp-v-tag">${icon('ruler', 14)} 3600 × 2400 · ±0.000</div></div>`;
const storyEng = () => `<div class="lp-card lp-v-eng"><svg viewBox="0 0 400 280" fill="none" stroke-linecap="round">
  <path d="M20 20H380V260H20Z M220 20V260 M20 170H220" stroke="#2b2924" stroke-width="6"/>
  <path class="lp-v-cable" pathLength="1" d="M40 40H200V150H60" stroke="#c0392b" stroke-width="2.5" stroke-dasharray=".02 .012"/>
  <path class="lp-v-cable c2" pathLength="1" d="M40 40V240H200" stroke="#2f6fb0" stroke-width="2.5"/>
  <path class="lp-v-cable c3" pathLength="1" d="M240 40H360V240H240" stroke="#2f5d50" stroke-width="2.5"/>
  ${[[200, 150], [60, 150], [200, 240], [360, 240], [240, 240], [360, 40]].map(([x, y], i) => `<g class="lp-v-pt" style="--k:${i}" transform="translate(${x} ${y})"><path d="M-10 4a10 10 0 0 1 20 0z" fill="#fff" stroke="#2b2924" stroke-width="2"/><path d="M0 4v8" stroke="#2b2924" stroke-width="2"/></g>`).join('')}
  <rect x="28" y="28" width="24" height="24" fill="#2b2924"/><text x="40" y="45" fill="#fff" font-size="11" font-weight="700" text-anchor="middle" font-family="Arial">ЩК</text>
  <g font-family="JetBrains Mono, monospace" font-size="12" font-weight="600"><text x="110" y="34" fill="#c0392b">гр.1 C16</text><text x="48" y="205" fill="#2f6fb0">гр.2 C10</text><text x="270" y="34" fill="#2f5d50">гр.3 C16 30мА</text></g></svg>
  <div class="lp-v-tag">${icon('bolt', 14)} ВВГнг-LS 3×2,5 · 42,6 м</div></div>`;
const storyStyle = () => `<div class="lp-card lp-v-style">${STYLES.slice(0, 6).map((st, i) => `<div class="lp-v-sw" style="--k:${i}"><div>${st.palette.map(c => `<i style="background:${c}"></i>`).join('')}</div><b>${st.name}</b></div>`).join('')}</div>`;
const storyDesign = () => `<div class="lp-card lp-v-design">${['A', 'B', 'C'].map((v, i) => `<div class="lp-v-var" style="--k:${i}"><svg viewBox="0 0 120 90"><rect x="2" y="2" width="116" height="86" rx="4" fill="${['#efe7da', '#e6ece8', '#ece6ef'][i]}" stroke="#2b2924" stroke-width="3"/><rect x="10" y="${12 + i * 4}" width="${54 - i * 8}" height="20" rx="4" fill="${['#8a6f55', '#4f6b60', '#6d5a7a'][i]}"/><circle cx="${86 - i * 6}" cy="58" r="${14 + i * 2}" fill="${['#c9a96e', '#a9b8a2', '#c7a0a0'][i]}"/><rect x="14" y="60" width="34" height="18" rx="3" fill="#fff" stroke="#9a948a"/></svg><b>Вариант ${v}</b><small>${['Скандинавский', 'Японди', 'Ар-деко'][i]}</small></div>`).join('')}</div>`;
const storyShop = () => `<div class="lp-card lp-v-shop">${[['Диван угловой', 'Гостиная', 54990], ['Стол обеденный', 'Кухня', 18490], ['Кровать 160×200', 'Спальня', 32990], ['Плитка 600×600', 'Ванная', 1890], ['Смеситель', 'Ванная', 7290]].map(([n, r, v], i) => `<div class="lp-v-row" style="--k:${i}"><span class="lp-v-thumb"></span><span><b>${n}</b><small>${r} · в наличии</small></span><em>${fmtRub(v)}</em></div>`).join('')}</div>`;
const storyEstimate = () => { const t = DEMO_TOTALS[0]?.[1] || 1893283; const parts = [['Черновые работы', .24], ['Электрика', .11], ['Сантехника', .09], ['Отделка', .27], ['Мебель', .21], ['Резерв 10%', .08]];
  return `<div class="lp-card lp-v-est">${parts.map(([n, k], i) => `<div class="lp-v-bar" style="--k:${i};--w:${k / .27}"><span>${n}</span><i></i><em>${fmtRub(t * k)}</em></div>`).join('')}<div class="lp-v-total"><span>Итого · ${DEMO_TOTALS[0]?.[0] || 'Самара'}</span><b>${fmtRub(t)}</b></div></div>`; };
const STORY = [
  { short: 'План', icon: 'plan', title: 'Нарисуйте план — или загрузите чертёж', text: 'Стены ставятся по точкам с размерами в миллиметрах, площади комнат считаются сами. Можно загрузить фото или PDF плана — стены распознаются автоматически.', points: ['Окна, двери, проёмы и несущие стены', 'Точные размеры и площади'], visual: storyPlan },
  { short: 'Инженерия', icon: 'bolt', title: 'Электрика и вода — как у проектировщика', text: 'Розетки, свет, выключатели, трубы и радиаторы с обозначениями по ГОСТ. Кабели разводятся сами, в обход несущих стен, с разбивкой по группам щитка.', points: ['Проверки: розетки у воды, перегрузка групп', 'Листы ГОСТ в PDF с рамкой и штампом'], visual: storyEng },
  { short: 'Стиль', icon: 'palette', title: 'Выберите стиль или покажите референсы', text: 'Двенадцать готовых стилей с палитрой и материалами. Или загрузите фото интерьеров, которые нравятся, — система покажет, как поняла пожелания.', points: ['Палитра, материалы, формы мебели', 'Можно смешивать стили'], visual: storyStyle },
  { short: 'Дизайн', icon: 'sparkles', title: 'Три варианта дизайна за минуту', text: 'Расстановка мебели по правилам эргономики: проходы, двери, окна и розетки учтены. Правьте текстом — «замени диван на угловой», «сделай светлее».', points: ['3D и прогулка от первого лица', 'Раскладка плитки с подрезкой'], visual: storyDesign },
  { short: 'Покупки', icon: 'cart', title: 'Список покупок из реальных магазинов', text: 'Каждый товар — с фото, размерами, ценой и ссылкой на магазин. Аналоги дешевле и проверка, что ссылка живая.', points: ['Цены из фидов магазинов', 'Экспорт списка в Excel'], visual: storyShop },
  { short: 'Смета', icon: 'calc', title: 'Смета по ценам вашего города', text: 'Новостройка или вторичка, черновая или предчистовая — считаем только нужные работы. Материалы, мебель и работы по разделам с резервом.', points: [`${CITIES.length} городов с расценками`, 'PDF и Excel для бригады'], visual: storyEstimate },
];

// Анимированный план квартиры: стены рисуются, затем комнаты, мебель, розетки и кабели
let DEMO_TOTALS = [];
const cityFlip = () => DEMO_TOTALS.map(([c], i) => `<span class="${i ? '' : 'on'}">${c}</span>`).join('') || '<span class="on">Самара</span>';
const sumFlip = () => DEMO_TOTALS.map(([, v], i) => `<span class="${i ? '' : 'on'}">${fmtRub(v)}</span>`).join('') || '<span class="on">≈ 1,9 млн ₽</span>';
const wordsOf = t => t.split(' ').map((w, i) => `<span class="lp-w" style="--wi:${i}">${esc(w)}</span>`).join(' ');
const chars = (t, start) => [...t].map((ch, i) => `<span class="lp-ch" style="--ci:${start + i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
let DEMO = null;
function demoProject() {
  if (DEMO) return DEMO;
  const p = createProject({});
  const prev = S.project; S.project = p;
  let d = null;
  try { d = generateDesigns(p, { count: 1 })[0]; } catch {}
  if (d) { p.designs = [d]; p.selectedDesign = d.id; }
  S.project = prev;
  return (DEMO = { p, d, layers: null });
}
// Смета примера в разных городах — для карточки, которая «пересчитывается» на глазах
function demoTotals() {
  if (DEMO_TOTALS.length) return DEMO_TOTALS;
  const { p, d } = demoProject(); if (!d) return DEMO_TOTALS;
  const prev = S.project; S.project = p;
  try { p.tiles = tileSpecsForDesign(p, d);
    for (const c of ['Самара', 'Москва', 'Казань', 'Новосибирск', 'Краснодар']) { try { DEMO_TOTALS.push([c, buildEstimate(p, d, { cityName: c }).totals.total]); } catch {} }
  } finally { S.project = prev; }
  return DEMO_TOTALS;
}
// План-пример собирается слоями (комнаты, стены, мебель, кабели, точки, подписи). Каждый слой — готовая картинка:
// появление идёт только прозрачностью и обрезкой, без перерисовки сотен элементов на каждом кадре
const PLAN_LAYERS = ['rooms', 'walls', 'items', 'cables', 'points', 'labels'];
function demoPlanLayers() {
  const demo = demoProject();
  if (demo.layers) return demo.layers;
  const { p, d } = demo;
  const pts = p.rooms.flatMap(r => r.poly); const b = bbox(pts); const pad = 450;
  const vb = [b.minX - pad, b.minY - pad, b.w + pad * 2, b.h + pad * 2];
  const L = Object.fromEntries(PLAN_LAYERS.map(k => [k, []]));
  p.rooms.forEach(r => L.rooms.push(`<polygon points="${r.poly.map(q => `${q.x},${q.y}`).join(' ')}" fill="${r.color}"/>`));
  p.walls.forEach(w => L.walls.push(`<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${WALL_TYPES[w.type].color}" stroke-width="${w.thickness}" stroke-linecap="square"/>`));
  for (const o of p.openings) { const g = openingGeometry(p, o); if (g) L.walls.push(`<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="@BG@" stroke-width="${g.wall.thickness + 8}"/>${o.kind === 'window' ? `<line x1="${g.a.x}" y1="${g.a.y}" x2="${g.b.x}" y2="${g.b.y}" stroke="#7fa6c4" stroke-width="40"/>` : ''}`); }
  if (d) d.placements.filter(x => !KIND_RULES[x.kind]?.ceiling && !KIND_RULES[x.kind]?.wall).forEach(x => {
    const f = footprint(x); const pr = productById(p, x.productId);
    L.items.push(`<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="60" fill="${pr?.color || '#ccc'}" fill-opacity="${KIND_RULES[x.kind]?.floor ? 0.4 : 0.92}" stroke="#000" stroke-opacity=".25" stroke-width="14"/>`);
  });
  p.routes.filter(r => r.system === 'electric').slice(0, 14).forEach(r => L.cables.push(`<polyline points="${r.path.map(q => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#d98a16" stroke-width="28" ${r.via === 'ceiling' ? 'stroke-dasharray="90 60"' : ''}/>`));
  p.points.forEach(pt => L.points.push(pointGlyph(pt.kind, pt.x, pt.y, 120)));
  for (const r of p.rooms) { const c = centroid(r.poly); L.labels.push(`<text x="${c.x}" y="${c.y}" text-anchor="middle" font-size="220" font-weight="700" fill="#48443d" font-family="Manrope, Arial, sans-serif">${esc(r.name)}</text>`); }
  const w = Math.round(vb[2] / 6), h = Math.round(vb[3] / 6);
  demo.layers = { ratio: `${vb[2]} / ${vb[3]}`, svgs: PLAN_LAYERS.map(k => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${w}" height="${h}">${L[k].join('')}</svg>`) };
  return demo.layers;
}
function demoPlanHtml() {
  const { ratio, svgs } = demoPlanLayers();
  const bg = (getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#fffdf9');
  return `<div class="lp-plan-stack" style="aspect-ratio:${ratio}" role="img" aria-label="Пример плана квартиры">${svgs.map((x, i) => `<img class="lp-pl lp-pl-${PLAN_LAYERS[i]}" alt="" decoding="async" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(x.replaceAll('@BG@', bg))}">`).join('')}<i class="lp-plan-scan" aria-hidden="true"></i></div>`;
}

export function mount(el) {
  const hasProjects = projectIndex().length > 0;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Случайные, но стабильные позиции значков фона
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const bgIcons = Array.from({ length: 44 }, (_, i) => ({ svg: BG_ICONS[i % BG_ICONS.length], x: rnd() * 96, y: rnd() * 99, s: 34 + rnd() * 64, r: Math.round(rnd() * 40 - 20), d: (7 + rnd() * 9).toFixed(1), delay: (-rnd() * 10).toFixed(1) }));
  const CHIPS = ['h=300', 'В1 Ø20', 'Т3 Ø20', 'К1 Ø50 i=0,02', '21,0 м²', 'C16 30мА', 'ВВГнг-LS 3×2,5', '600×600', 'М 1:50', '2700', 'гр.4', 'ЩК', '3,96 м', '±0.000', 'Ст В1-1', '16,3 м²'];
  const chips = CHIPS.map((t, i) => ({ t, x: rnd() * 92, y: rnd() * 98, d: (9 + rnd() * 8).toFixed(1), delay: (-rnd() * 9).toFixed(1) }));
  el.innerHTML = `<div class="lp">
    <div class="lp-progress" aria-hidden="true"><i></i></div>
    <div class="lp-bg" aria-hidden="true">
      <div class="lp-blob b1"></div><div class="lp-blob b2"></div><div class="lp-blob b3"></div><div class="lp-blob b4"></div><div class="lp-blob b5"></div>
      <svg class="lp-blueprint" viewBox="0 0 1000 620" fill="none" stroke="currentColor" stroke-width="2"><path pathLength="1" d="M40 40H960V580H40Z"/><path pathLength="1" d="M560 40V420M40 420H960M240 420V580M720 420V580"/><path pathLength="1" d="M380 420a80 80 0 0 1 80-80M560 200a70 70 0 0 0 70 70" stroke-dasharray=".01 .02"/><path pathLength="1" d="M40 12H960M40 4V20M960 4V20M988 40V580M980 40H996M980 580H996"/></svg>
      ${chips.map(c => `<span class="lp-chip" style="left:${c.x}%;top:${c.y}%;--dur:${c.d}s;--del:${c.delay}s">${c.t}</span>`).join('')}
      ${bgIcons.map(b => `<svg class="lp-bg-ic" viewBox="0 0 64 64" style="left:${b.x}%;top:${b.y}%;width:${b.s}px;--r:${b.r}deg;--dur:${b.d}s;--del:${b.delay}s" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${b.svg}</svg>`).join('')}
    </div>
    <nav class="lp-scene-nav" aria-label="Разделы">${SCENES.map((n, i) => `<button data-scene="${i}" class="${i ? '' : 'on'}"><span>${n}</span><i></i></button>`).join('')}</nav>
    <div class="lp-scenes">
    <div class="lp-scene"><div class="lp-scene-in">
    <section class="lp-hero">
      <div class="lp-grid-bg" aria-hidden="true"></div>
      <div class="lp-hero-inner">
        <div class="lp-copy">
          <span class="lp-eyebrow reveal"><i></i> Только реальные товары из магазинов</span>
          <h1 class="lp-title" aria-label="Спланируйте ремонт за один вечер">${chars('Спланируйте', 0)}<br><span class="lp-rotator"><span class="lp-underline" aria-hidden="true"></span>${WORDS.map((w, i) => `<span class="lp-word ${i === 0 ? 'on' : ''}" ${i ? 'aria-hidden="true"' : ''}>${w}</span>`).join('')}</span><br>${chars('за один вечер', 11)}</h1>
          <p class="lp-sub reveal" style="--rd:.16s">Планировка, электрика и вода с обозначениями по ГОСТ, подбор дизайна, раскладка плитки и смета по ценам вашего города — в одном окне, без переноса данных между программами.</p>
          <div class="lp-cta reveal" style="--rd:.24s">
            <button class="btn primary lg lp-btn-main" data-act="start">${icon('arrowRight', 18)} Начать бесплатно</button>
            <button class="btn lg" data-act="projects" ${hasProjects ? '' : 'hidden'}>${icon('plan', 17)} Мои проекты</button>
            <button class="btn lg ghost" data-act="login" ${S.server.online ? '' : 'hidden'}>Войти</button>
          </div>
          <div class="lp-trust reveal" style="--rd:.32s"><span>${icon('check', 15)} Без регистрации для планировки</span><span>${icon('check', 15)} Новостройка и вторичка</span><span>${icon('check', 15)} Экспорт PDF и Excel</span></div>
        </div>
        <div class="lp-visual">
          <div class="lp-plan-wrap"><div class="lp-plan-tilt" style="transform:perspective(1300px) rotateY(0deg) rotateX(0deg)">${demoPlanHtml()}</div></div>
          <span class="lp-pill p1">ГОСТ 21.210</span><span class="lp-pill p2">3D-прогулка</span><span class="lp-pill p3">PDF · Excel · DXF</span><span class="lp-pill p4">${CITIES.length} городов</span>
          <div class="lp-float lp-f1" style="transform:translate3d(0,0,0)"><div class="lp-float-card"><span class="lp-f-label">Смета · <span class="lp-flip lp-city">${cityFlip()}</span></span><b class="lp-flip lp-sum">${sumFlip()}</b><small>${icon('check', 12)} все 9 разделов</small></div></div>
          <div class="lp-float lp-f2" style="transform:translate3d(0,0,0)"><div class="lp-float-card"><span class="lp-f-label">Плитка · ванная</span><b>59 шт · 6 уп.</b><span class="lp-meter"><i></i></span><small>подрезка не уже 1/3</small></div></div>
          <div class="lp-float lp-f3" style="transform:translate3d(0,0,0)"><div class="lp-float-card"><span class="lp-dot ok"></span><span><b>0 нарушений</b><small>проходы, двери, розетки</small></span></div></div>
        </div>
      </div>
    </section>

    <div class="lp-marquee" aria-hidden="true"><div class="lp-track">${[...Array(2)].map(() => ['2D, 3D и прогулка от первого лица', 'Обозначения по ГОСТ 21.210 и 21.205', 'Группы и схема щитка', 'Раскладка плитки с подрезкой', 'Варианты дизайна за минуту', 'Фиды реальных магазинов', 'Смета для новостройки и вторички', 'PDF, Excel, DXF', 'Ссылка для бригады'].map(t => `<span>${t}</span><i>✦</i>`).join('')).join('')}</div>
      <div class="lp-track rev">${[...Array(2)].map(() => ['Скандинавский', 'Лофт', 'Японди', 'Неоклассика', 'Минимализм', 'Средиземноморский', 'Эко', 'Ар-деко', 'Прованс', 'Хай-тек', 'Советский винтаж', 'Современный'].map(t => `<span>${t}</span><i>◆</i>`).join('')).join('')}</div></div>

    </div></div>
    <div class="lp-scene"><div class="lp-scene-in">
    <section class="lp-section">
      <div class="lp-stats">
        <div class="lp-stat lp-spot reveal"><b data-count="6">0</b><span>шагов от плана до сметы</span><i class="lp-stat-bar"></i></div>
        <div class="lp-stat lp-spot reveal" style="--rd:.08s"><b data-count="${STYLES.length}">0</b><span>готовых стилей интерьера</span><i class="lp-stat-bar"></i></div>
        <div class="lp-stat lp-spot reveal" style="--rd:.16s"><b data-count="${CITIES.length}">0</b><span>городов с расценками</span><i class="lp-stat-bar"></i></div>
        <div class="lp-stat lp-spot reveal" style="--rd:.24s"><b data-count="100" data-suffix="%">0</b><span>товаров — из каталога со ссылкой</span><i class="lp-stat-bar"></i></div>
      </div>
    </section>

    </div></div>
    <div class="lp-scene"><div class="lp-scene-in">
    <section class="lp-story" style="--n:${STORY.length}" aria-label="Как это работает">
      <div class="lp-story-pin">
        <div class="lp-story-head"><span class="lp-kicker">Как это работает</span><span class="lp-story-count"><b class="lp-flip lp-story-num">${STORY.map((_, i) => `<span class="${i ? '' : 'on'}">0${i + 1}</span>`).join('')}</b> / 0${STORY.length}</span></div>
        <div class="lp-story-body">
          <div class="lp-story-texts">${STORY.map((st, i) => `<div class="lp-story-text ${i ? '' : 'on'}"><div class="lp-step-ic">${icon(st.icon, 22)}</div><h2>${st.title}</h2><p>${st.text}</p><ul class="lp-list">${st.points.map(t => `<li>${icon('check', 16)} ${t}</li>`).join('')}</ul></div>`).join('')}</div>
          <div class="lp-story-stage">${STORY.map((st, i) => `<div class="lp-slide ${i ? '' : 'on'}" data-i="${i}">${st.visual()}</div>`).join('')}</div>
        </div>
        <div class="lp-story-nav">${STORY.map((st, i) => `<button class="lp-story-dot ${i ? '' : 'on'}" data-story="${i}" aria-label="${esc(st.title)}"><i></i><span>${st.short}</span></button>`).join('')}</div>
        <div class="lp-story-line"><i></i></div>
      </div>
    </section>

    </div></div>
    <div class="lp-scene"><div class="lp-scene-in">
    <section class="lp-section lp-split">
      <div class="lp-split-text reveal"><span class="lp-kicker">Инженерия как у проектировщика</span><h2>${wordsOf('Чертежи, которые не стыдно отдать электрику')}</h2>
        <p>Условные обозначения по ГОСТ 21.210 и 21.205, трубопроводы В1, Т3, К1, Т1/Т2, номера групп на линиях, однолинейная схема щита и спецификация. Листы в PDF — с рамкой и основной надписью.</p>
        <ul class="lp-list"><li>${icon('check', 16)} Проверки: розетки у воды, перегрузка групп, уклон канализации</li><li>${icon('check', 16)} Автоматическая разводка кабелей в обход несущих стен</li><li>${icon('check', 16)} Ведомость точек и длин трасс для сметы</li></ul></div>
      <div class="lp-sheet reveal" style="--rd:.1s">${gostLegendDemo()}</div>
    </section>

    </div></div>
    <div class="lp-scene"><div class="lp-scene-in">
    <section class="lp-section lp-split lp-split-rev">
      <div class="lp-split-text reveal"><span class="lp-kicker">Подбор, который не выдумывает</span><h2>${wordsOf('Мебель только из реального каталога')}</h2>
        <p>Подбор берёт товары по артикулу из фидов магазинов, а расстановку проверяют правила эргономики: проходы от 700 мм, двери, окна, розетки и радиаторы. Не поместилось — зона остаётся пустой, и вы видите почему.</p>
        <ul class="lp-list"><li>${icon('check', 16)} «Замени диван на угловой», «сделай светлее» — правки текстом</li><li>${icon('check', 16)} Рендер по 3D-сцене и вашим референсам</li><li>${icon('check', 16)} Сравнение вариантов по цене</li></ul></div>
      <div class="lp-styles reveal" style="--rd:.1s">${STYLES.slice(0, 8).map((s, i) => `<div class="lp-style" style="--i:${i}"><div class="sw">${s.palette.map((c, j) => `<i style="background:${c};--j:${j}"></i>`).join('')}</div><b>${s.name}</b></div>`).join('')}</div>
    </section>

    </div></div>
    <div class="lp-scene"><div class="lp-scene-in">
    <section class="lp-section">
      <div class="lp-head reveal"><span class="lp-kicker">Смета под ваш объект</span><h2>${wordsOf('Новостройка или вторичка — считаем только нужные работы')}</h2></div>
      <div class="lp-cases">
        ${[['Вторичка', 'Демонтаж старой отделки, вывоз мусора, черновые и чистовые работы.', 'home'], ['Новостройка без отделки', 'Без демонтажа: стяжка, штукатурка, электрика и сантехника с нуля.', 'wall'], ['Черновая от застройщика', 'Стяжка и штукатурка уже есть — считаем разводку и чистовую.', 'ruler'], ['Предчистовая (white box)', 'Стены под покраску, коммуникации разведены — только чистовая отделка.', 'palette']].map(([t, d, ic], i) => `<div class="lp-case lp-spot reveal" style="--rd:${i * 0.07}s">${icon(ic, 22)}<h3>${t}</h3><p>${d}</p></div>`).join('')}
      </div>
    </section>

    </div></div>
    <div class="lp-scene"><div class="lp-scene-in">
    <section class="lp-section lp-faq-wrap">
      <div class="lp-head reveal"><span class="lp-kicker">Вопросы</span><h2>${wordsOf('Частые вопросы')}</h2></div>
      <div class="lp-faq">${[
        ['Это заменит проект перепланировки?', 'Нет. Это эскизный инструмент: проверки — подсказки, а не согласование. Для перепланировки нужен проект от организации с допуском.'],
        ['Откуда цены?', 'Товары — из фидов магазинов с датой обновления, работы — из справочника расценок вашего города с версией. Точность работ ±10–15%.'],
        ['Нужна ли регистрация?', 'Планировку можно начать сразу. Регистрация нужна для подбора дизайна, сметы и сохранения проекта на сервере.'],
        ['Работает на телефоне?', 'Да: на телефоне удобно смотреть проект, список покупок и смету, на планшете — править план. Полный редактор — на компьютере.'],
      ].map(([q, a]) => `<details class="reveal"><summary>${q}${icon('plus', 18)}</summary><p>${a}</p></details>`).join('')}</div>
    </section>

    </div></div>
    <div class="lp-scene"><div class="lp-scene-in">
    <section class="lp-final">
      <div class="lp-grid-bg" aria-hidden="true"></div>
      <h2 class="reveal">Начните с плана — остальное соберётся само</h2>
      <p class="reveal" style="--rd:.08s">Пример квартиры 54 м² уже готов: откройте и посмотрите, как всё работает.</p>
      <div class="lp-cta reveal" style="--rd:.16s"><button class="btn lg lp-btn-light" data-act="start">${icon('arrowRight', 18)} Открыть пример</button><button class="btn lg lp-btn-outline" data-act="register" ${S.server.online ? '' : 'hidden'}>Создать аккаунт</button></div>
    </section>
    <div class="foot-note">Эскизный инструмент. Планы, проверки и смета носят справочный характер и не заменяют рабочую документацию и консультации специалистов.</div>
    </div></div>
    </div>
  </div>`;

  // Смена слов в заголовке: только классы, без пересоздания узлов
  let wi = 0, timer = null;
  const words = [...el.querySelectorAll('.lp-word')];
  if (!reduce) timer = setInterval(() => {
    if (document.hidden) return;
    const prev = words[wi]; wi = (wi + 1) % words.length; const next = words[wi];
    prev.classList.remove('on'); prev.classList.add('off'); prev.setAttribute('aria-hidden', 'true');
    next.classList.remove('off'); next.classList.add('on'); next.removeAttribute('aria-hidden');
    setTimeout(() => prev.classList.remove('off'), 650);
  }, 2800);

  // Появление блоков и счётчики при прокрутке
  const counted = new WeakSet();
  const count = node => {
    if (counted.has(node)) return; counted.add(node);
    const target = +node.dataset.count, suf = node.dataset.suffix || '';
    const fmt = v => new Intl.NumberFormat('ru-RU').format(Math.round(v)) + suf;
    if (reduce) { node.textContent = fmt(target); return; }
    const t0 = performance.now(), dur = 1600;
    const step = t => { const k = Math.min(1, (t - t0) / dur); node.textContent = fmt(target * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    e.target.querySelectorAll?.('[data-count]').forEach(count);
    if (e.target.dataset.count) count(e.target);
    io.unobserve(e.target);
  }), { threshold: 0, rootMargin: '0px 0px -6% 0px' });
  el.querySelectorAll('.reveal, .lp-stat').forEach(n => io.observe(n));

  // Карточка сметы: город и сумма меняются, как будто смета пересчитывается
  const flips = [...el.querySelectorAll('.lp-f1 .lp-flip')];
  let fi = 0;
  const flipTimer = reduce ? null : setInterval(() => {
    if (document.hidden) return;
    const n = flips[0]?.children.length || 0; if (n < 2) return;
    const prevI = fi; fi = (fi + 1) % n;
    for (const f of flips) { const a = f.children[prevI], b = f.children[fi]; a.classList.remove('on'); a.classList.add('off'); b.classList.remove('off'); b.classList.add('on'); setTimeout(() => a.classList.remove('off'), 500); }
  }, 3200);

  // Вся страница — сцены: экран закрепляется, следующий наезжает снизу, текущий уменьшается и гаснет
  const scenesWrap = el.querySelector('.lp-scenes');
  const scenes = [...el.querySelectorAll('.lp-scene')];
  const navBtns = [...el.querySelectorAll('.lp-scene-nav button')];
  const topbarH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topbar')) || 64;
  // Высокая сцена закрепляется, только когда её низ дошёл до низа экрана — так видно всё содержимое
  const layoutScenes = () => { const tb = topbarH(); scenes.forEach(sc => { sc.style.top = Math.min(tb, window.innerHeight - sc.offsetHeight) + 'px'; }); onScenes(); };
  let scRaf = 0, curScene = 0;
  const scenesFrame = () => {
    scRaf = 0;
    const tb = topbarH(), vh = Math.max(1, window.innerHeight - tb);
    const tops = scenes.map(sc => sc.getBoundingClientRect().top);
    let cur = 0;
    scenes.forEach((sc, i) => {
      const inner = sc.firstElementChild;
      const pin = Math.max(0, Math.min(1, (window.innerHeight - tops[i]) / vh));          // насколько сцена въехала
      const out = i < scenes.length - 1 ? Math.max(0, Math.min(1, (window.innerHeight - tops[i + 1]) / vh)) : 0; // насколько её закрыла следующая
      if (tops[i] <= tb + vh * .5) cur = i;
      if (reduce) return;
      const sc0 = (i ? .94 + .06 * pin : 1) * (1 - .1 * out);
      inner.style.transform = (pin >= 1 || !i) && !out ? 'none' : `translate(0, ${(-out * 70).toFixed(1)}px) scale(${sc0.toFixed(4)})`;
      inner.style.opacity = out ? Math.max(0, 1 - out * 1.5).toFixed(3) : '1';
      sc.style.visibility = out >= .99 ? 'hidden' : '';
    });
    if (cur !== curScene) { navBtns[curScene]?.classList.remove('on'); navBtns[cur]?.classList.add('on'); curScene = cur; }
  };
  const onScenes = () => { if (!scRaf) scRaf = requestAnimationFrame(scenesFrame); };
  const ro = new ResizeObserver(() => layoutScenes());
  scenes.forEach(sc => ro.observe(sc));
  window.addEventListener('scroll', onScenes, { passive: true });
  window.addEventListener('resize', layoutScenes);
  layoutScenes();
  el.querySelector('.lp-scene-nav').addEventListener('click', e => {
    const b = e.target.closest('[data-scene]'); if (!b) return;
    const i = +b.dataset.scene;
    const top = scenesWrap.getBoundingClientRect().top + window.scrollY + scenes.slice(0, i).reduce((a, sc) => a + sc.offsetHeight, 0) - topbarH();
    window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
  });

  // Рассказ: вертикальная прокрутка листает слайды, как карусель
  const story = el.querySelector('.lp-story');
  const slides = [...el.querySelectorAll('.lp-slide')], texts = [...el.querySelectorAll('.lp-story-text')], dots = [...el.querySelectorAll('.lp-story-dot')];
  const nums = el.querySelector('.lp-story-num'), sLine = el.querySelector('.lp-story-line i');
  let active = 0, straf = 0;
  const setActive = i => {
    if (i === active) return;
    const prev = active; active = i;
    for (const list of [slides, texts, dots, [...nums.children]]) { list[prev].classList.remove('on'); list[i].classList.add('on'); }
    texts[prev].classList.toggle('up', i > prev); texts[i].classList.remove('up');
  };
  const storyFrame = () => {
    straf = 0;
    const r = story.getBoundingClientRect(), total = story.offsetHeight - window.innerHeight;
    const prog = Math.max(0, Math.min(1, -r.top / Math.max(1, total)));
    const f = prog * (slides.length - 1);
    sLine.style.transform = `scaleX(${prog})`;
    slides.forEach((sl, i) => {
      const d = i - f, a = Math.abs(d);
      // Следующие слайды выглядывают справа, пройденные уезжают влево и гаснут, не заходя на текст
      const x = d > 0 ? d * 62 : d * 34;
      sl.style.transform = `translate3d(${x.toFixed(2)}%, ${(a * 5).toFixed(2)}%, 0) scale(${(1 - Math.min(a, 1.5) * .16).toFixed(3)}) rotate(${(d * 4).toFixed(2)}deg)`;
      sl.style.opacity = Math.max(0, 1 - a * (d < 0 ? 1.6 : .55)).toFixed(3);
      sl.style.zIndex = String(10 - Math.round(a * 2));
    });
    setActive(Math.round(f));
  };
  const onStory = () => { if (!straf) straf = requestAnimationFrame(storyFrame); };
  window.addEventListener('scroll', onStory, { passive: true });
  window.addEventListener('resize', onStory);
  storyFrame();
  // Клик по точке — прокрутить к нужному слайду
  el.querySelector('.lp-story-nav').addEventListener('click', e => {
    const b = e.target.closest('[data-story]'); if (!b) return;
    const total = story.offsetHeight - window.innerHeight;
    window.scrollTo({ top: story.getBoundingClientRect().top + window.scrollY + total * (+b.dataset.story / (slides.length - 1)) + 2, behavior: reduce ? 'auto' : 'smooth' });
  });

  // Наклон плана и смещение карточек за курсором
  const visual = el.querySelector('.lp-visual');
  const tilt = el.querySelector('.lp-plan-tilt');
  const floats = [...el.querySelectorAll('.lp-float')];
  let tiltOn = false, raf = 0, last = null;
  const IDLE = 'perspective(1300px) rotateY(0deg) rotateX(0deg)';
  const lpRoot = el.querySelector('.lp');
  // Вступление стартует, когда все слои плана декодированы — иначе слои появляются рывками
  const stack = el.querySelector('.lp-plan-stack');
  let tiltTimer = 0;
  const startIntro = () => {
    if (!el.isConnected) return;
    stack.classList.add('go');
    tiltTimer = setTimeout(() => { stack.classList.add('done'); tiltOn = true; visual.classList.add('tilt-ready'); lpRoot.classList.add('live'); }, reduce ? 0 : 3000);
  };
  Promise.all([...stack.querySelectorAll('img')].map(i => i.decode().catch(() => {}))).then(() => requestAnimationFrame(startIntro));
  const fillTotals = () => {
    if (!DEMO_TOTALS.length) demoTotals();
    if (!DEMO_TOTALS.length || !el.isConnected) return;
    const [city, sum] = flips; if (city) city.innerHTML = cityFlip(); if (sum) sum.innerHTML = sumFlip(); fi = 0;
    const est = slides[slides.length - 1]; if (est) est.innerHTML = storyEstimate();
  };
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1));
  const totalsTimer = DEMO_TOTALS.length ? null : setTimeout(() => idle(fillTotals, { timeout: 2000 }), reduce ? 0 : 3600);
  const applyTilt = () => {
    raf = 0; if (!last) return;
    const r = visual.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (last.x - (r.left + r.width / 2)) / (window.innerWidth / 2)));
    const y = Math.max(-1, Math.min(1, (last.y - (r.top + r.height / 2)) / (window.innerHeight / 2)));
    tilt.style.transform = `perspective(1300px) rotateY(${(x * 7).toFixed(2)}deg) rotateX(${(-y * 6).toFixed(2)}deg)`;
    floats.forEach((f, i) => { const k = [18, 26, 14][i] || 16; f.style.transform = `translate3d(${(x * k).toFixed(1)}px, ${(y * k).toFixed(1)}px, 0)`; });
  };
  const onMove = e => {
    if (!tiltOn || reduce || e.pointerType !== 'mouse') return;
    last = { x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(applyTilt);
  };
  const onLeave = () => { last = null; tilt.style.transform = IDLE; floats.forEach(f => { f.style.transform = 'translate3d(0,0,0)'; }); };
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('mouseleave', onLeave);
  // Во фоновой вкладке кадры не рисуются — сбрасываем ожидание, чтобы наклон не «застрял»
  const onVis = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
  document.addEventListener('visibilitychange', onVis);

  // Подсветка карточки под курсором (переменные меняются только у одной карточки)
  const spot = e => { const c = e.target.closest('.lp-spot'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`); };
  el.addEventListener('pointermove', spot, { passive: true });

  // Полоса прогресса прокрутки
  const bar = el.querySelector('.lp-progress i');
  let sraf = 0;
  const onScroll = () => { if (sraf) return; sraf = requestAnimationFrame(() => { sraf = 0; const h = document.documentElement.scrollHeight - window.innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, window.scrollY / h) : 0})`; }); };
  window.addEventListener('scroll', onScroll, { passive: true });

  el.addEventListener('click', async e => {
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'start') {
      if (projectIndex().length && S.project) return go('plan');
      newProject({ name: 'Моя квартира' }); go('plan');
    }
    if (a === 'projects') go('projects');
    if (a === 'login') { if (await authDialog('login')) go('projects'); }
    if (a === 'register') { if (await authDialog('register')) go('projects'); }
  });
  return { update() {
    el.querySelectorAll('[data-act="login"], [data-act="register"]').forEach(b => { b.hidden = !S.server.online; });
    el.querySelector('[data-act="projects"]').hidden = !projectIndex().length;
  }, destroy() { clearInterval(timer); clearInterval(flipTimer); clearTimeout(tiltTimer); clearTimeout(totalsTimer); io.disconnect(); window.removeEventListener('pointermove', onMove); document.removeEventListener('mouseleave', onLeave); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('scroll', onScroll); window.removeEventListener('scroll', onStory); window.removeEventListener('scroll', onScenes); window.removeEventListener('resize', layoutScenes); ro.disconnect(); window.removeEventListener('resize', onStory); } };
}

// Фрагмент «листа» с условными обозначениями для промо-блока
function gostLegendDemo() {
  const rows = [['socket', 'Розетка штепсельная с заземляющим контактом'], ['switch', 'Выключатель одноклавишный'], ['light', 'Светильник потолочный'], ['panel', 'Щиток квартирный'], ['riser', 'Стояк водопровода/канализации']];
  const lines = [['В1', '#1d1c19', ''], ['Т3', '#1d1c19', ''], ['К1', '#1d1c19', '10 6'], ['Т1', '#1d1c19', '']];
  return `<div class="lp-sheet-in"><div class="lp-sheet-title">Условные обозначения</div>
    ${rows.map(([k, n]) => `<div class="lp-sheet-row"><svg width="26" height="26" viewBox="-13 -13 26 26">${pointGlyph(k, 0, 0, 11, '#1d1c19')}</svg><span>${n}</span></div>`).join('')}
    ${lines.map(([c, col, dash]) => `<div class="lp-sheet-row"><svg width="60" height="14"><line x1="0" y1="7" x2="22" y2="7" stroke="${col}" stroke-width="2" stroke-dasharray="${dash}"/><text x="30" y="11" text-anchor="middle" font-size="10" font-weight="700" fill="${col}">${c}</text><line x1="38" y1="7" x2="60" y2="7" stroke="${col}" stroke-width="2" stroke-dasharray="${dash}"/></svg><span>${{ В1: 'Водопровод хозяйственно-питьевой', Т3: 'Горячее водоснабжение, подающий', К1: 'Канализация бытовая', Т1: 'Отопление, подающий трубопровод' }[c]}</span></div>`).join('')}
    <div class="lp-stamp"><div><span>Изм.</span><span>Лист</span><span>№ докум.</span><span>Подп.</span><span>Дата</span></div><b>План электроснабжения</b><em>Стадия Р · Лист 1</em></div></div>`;
}
