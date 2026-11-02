// Условные обозначения инженерных точек на плане (по мотивам ГОСТ 21.210 и 21.601).
// Рисуются на белой подложке, чтобы читаться поверх заливки комнат и мебели.
import { POINT_KINDS, SYSTEMS } from '../core/model.js';

export const SYMBOL_COLOR = k => {
  const s = POINT_KINDS[k]?.system;
  if (s === 'water') return ['riser', 'collector'].includes(k) ? SYSTEMS.sewer.color : SYSTEMS.cold.color;
  return SYSTEMS[s]?.color || '#888';
};

const SHORT = { sink: 'Рк', 'kitchen-sink': 'Мк', bath: 'Вн', shower: 'Дш', toilet: 'Ун', washer: 'СМ', dishwasher: 'ПМ' };

// cx, cy — центр, r — «радиус» значка в единицах холста, sw — толщина линии
export function pointGlyph(kind, cx, cy, r, col = SYMBOL_COLOR(kind)) {
  const sw = r * 0.16;
  const st = `stroke="${col}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const bg = (shape = 'circle') => shape === 'circle'
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${col}" stroke-width="${sw * 0.6}" class="ring"/>`
    : `<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.25}" fill="#fff" stroke="${col}" stroke-width="${sw * 0.6}" class="ring"/>`;
  const R = r * 0.55;
  switch (kind) {
    case 'socket': // полукруг с отводом — розетка
      return bg() + `<path d="M${cx - R} ${cy + R * 0.25}A${R} ${R} 0 0 1 ${cx + R} ${cy + R * 0.25}Z" ${st}/><path d="M${cx} ${cy + R * 0.25}V${cy + R * 0.95}" ${st}/>`;
    case 'socket-kitchen': // розетка с двумя отводами — над столешницей
      return bg() + `<path d="M${cx - R} ${cy + R * 0.2}A${R} ${R} 0 0 1 ${cx + R} ${cy + R * 0.2}Z" ${st}/><path d="M${cx - R * 0.45} ${cy + R * 0.2}V${cy + R * 0.95}M${cx + R * 0.45} ${cy + R * 0.2}V${cy + R * 0.95}" ${st}/>`;
    case 'socket-power': // залитый полукруг — силовая розетка
      return bg() + `<path d="M${cx - R} ${cy + R * 0.25}A${R} ${R} 0 0 1 ${cx + R} ${cy + R * 0.25}Z" fill="${col}" stroke="${col}" stroke-width="${sw}"/><path d="M${cx} ${cy + R * 0.25}V${cy + R * 0.95}" ${st}/>`;
    case 'switch': // кружок с флажком — выключатель
      return bg() + `<circle cx="${cx - R * 0.35}" cy="${cy + R * 0.35}" r="${R * 0.32}" fill="${col}"/><path d="M${cx - R * 0.2} ${cy + R * 0.2}L${cx + R * 0.55} ${cy - R * 0.55}l${R * 0.35} ${R * 0.35}" ${st}/>`;
    case 'light': // круг с крестом — светильник
      return bg() + `<circle cx="${cx}" cy="${cy}" r="${R}" ${st}/><path d="M${cx - R * 0.7} ${cy - R * 0.7}L${cx + R * 0.7} ${cy + R * 0.7}M${cx + R * 0.7} ${cy - R * 0.7}L${cx - R * 0.7} ${cy + R * 0.7}" ${st}/>`;
    case 'wall-light': // полукруг с крестом — настенный светильник
      return bg() + `<path d="M${cx - R} ${cy + R * 0.3}A${R} ${R} 0 0 1 ${cx + R} ${cy + R * 0.3}Z" ${st}/><path d="M${cx - R * 0.5} ${cy - R * 0.3}L${cx + R * 0.5} ${cy + R * 0.3}M${cx + R * 0.5} ${cy - R * 0.3}L${cx - R * 0.5} ${cy + R * 0.3}" ${st}/>`;
    case 'panel': // прямоугольник с залитым треугольником — щиток
      return bg('rect') + `<rect x="${cx - R}" y="${cy - R * 0.65}" width="${2 * R}" height="${1.3 * R}" ${st}/><path d="M${cx - R} ${cy + R * 0.65}L${cx + R} ${cy - R * 0.65}V${cy + R * 0.65}Z" fill="${col}"/>`;
    case 'junction': // кружок в квадрате — распаечная коробка
      return bg('rect') + `<circle cx="${cx}" cy="${cy}" r="${R * 0.55}" fill="${col}"/>`;
    case 'riser': // двойное кольцо — стояк
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${col}" stroke-width="${sw}" class="ring"/><circle cx="${cx}" cy="${cy}" r="${R * 0.75}" fill="${col}"/><text x="${cx}" y="${cy + r * 0.2}" text-anchor="middle" style="font:700 ${r * 0.55}px var(--font);fill:#fff">Ст</text>`;
    case 'collector': // гребёнка
      return bg('rect') + `<path d="M${cx - R} ${cy - R * 0.2}H${cx + R}M${cx - R * 0.6} ${cy - R * 0.2}V${cy + R * 0.6}M${cx} ${cy - R * 0.2}V${cy + R * 0.6}M${cx + R * 0.6} ${cy - R * 0.2}V${cy + R * 0.6}" ${st}/>`;
    case 'boiler':
      return bg('rect') + `<path d="M${cx} ${cy + R * 0.8}c${R * 0.7} 0 ${R * 0.8}-${R * 0.6} ${R * 0.4}-${R * 1.1}c-${R * 0.1} ${R * 0.4}-${R * 0.4} ${R * 0.4}-${R * 0.4} ${R * 0.4}c0-${R * 0.5}-${R * 0.2}-${R * 0.8}-${R * 0.5}-${R}c0 ${R * 0.6}-${R * 0.6} ${R * 0.7}-${R * 0.6} ${R * 1.2}c0 ${R * 0.3} ${R * 0.4} ${R * 0.5} ${R * 1.1} ${R * 0.5}z" fill="${col}"/>`;
    case 'vent-channel': // решётка — вентканал
      return bg('rect') + `<rect x="${cx - R}" y="${cy - R}" width="${2 * R}" height="${2 * R}" ${st}/><path d="M${cx - R} ${cy - R * 0.35}H${cx + R}M${cx - R} ${cy + R * 0.35}H${cx + R}" ${st}/>`;
    case 'hood': // трапеция — вытяжка
      return bg('rect') + `<path d="M${cx - R} ${cy + R * 0.6}H${cx + R}L${cx + R * 0.35} ${cy - R * 0.6}H${cx - R * 0.35}Z" ${st}/><path d="M${cx} ${cy - R * 0.6}V${cy - R}" ${st}/>`;
    default: {
      if (POINT_KINDS[kind]?.needs) { // капля с подписью прибора — точка водоснабжения
        const t = SHORT[kind] || '';
        return bg() + `<path d="M${cx} ${cy - R * 1.05}C${cx + R * 0.9} ${cy - R * 0.1} ${cx + R * 0.75} ${cy + R * 0.85} ${cx} ${cy + R * 0.85}S${cx - R * 0.9} ${cy - R * 0.1} ${cx} ${cy - R * 1.05}Z" fill="${col}"/><text x="${cx}" y="${cy + R * 0.55}" text-anchor="middle" style="font:700 ${r * 0.5}px var(--font);fill:#fff">${t}</text>`;
      }
      return bg() + `<circle cx="${cx}" cy="${cy}" r="${R * 0.4}" fill="${col}"/>`;
    }
  }
}

// Отдельная иконка для легенды и палитры инструментов
export function symbolIcon(kind, size = 22) {
  if (kind === 'radiator') return `<svg width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true"><rect x="-11" y="-4" width="22" height="8" rx="2" fill="${SYSTEMS.heating.color}"/>${[-7, -3, 1, 5].map(x => `<line x1="${x + 1}" y1="-4" x2="${x + 1}" y2="4" stroke="#fff" stroke-width="1"/>`).join('')}</svg>`;
  return `<svg width="${size}" height="${size}" viewBox="-12 -12 24 24" aria-hidden="true">${pointGlyph(kind, 0, 0, 11)}</svg>`;
}

// ——— Чертёжные обозначения (монохром, без подложки) ———
// Электрооборудование — по ГОСТ 21.210-2014, санитарно-технические приборы — по ГОСТ 21.205-2016,
// отопление — по ГОСТ 21.206-2012. ang — угол «от стены в помещение» (градусы), r — характерный размер.
const GOST_SHORT = { sink: 'Рк', 'kitchen-sink': 'Мк', bath: 'Вн', shower: 'Дк', toilet: 'Ун', washer: 'СМ', dishwasher: 'ПМ' };
export function gostGlyph(kind, cx, cy, r, ang = 0, col = '#000') {
  const sw = Math.max(r * 0.09, 8);
  const st = `stroke="${col}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const g = inner => `<g transform="translate(${cx} ${cy}) rotate(${ang})">${inner}</g>`;
  const R = r * 0.62;
  switch (kind) {
    case 'socket': // розетка штепсельная с защитным контактом: полуокружность, отвод и поперечный штрих
      return g(`<path d="M${-R} 0A${R} ${R} 0 0 0 ${R} 0" ${st}/><path d="M${-R} 0H${R}" ${st}/><path d="M0 0V${-R * 1.25}" ${st} transform="rotate(180)"/><path d="M${-R * 0.45} ${R * 1.25}H${R * 0.45}" ${st}/>`);
    case 'socket-kitchen': // сдвоенная/над столешницей — два отвода
      return g(`<path d="M${-R} 0A${R} ${R} 0 0 0 ${R} 0H${-R}" ${st}/><path d="M${-R * 0.4} ${R}V${R * 1.4}M${R * 0.4} ${R}V${R * 1.4}" ${st}/><path d="M${-R * 0.7} ${R * 1.4}H${R * 0.7}" ${st}/>`);
    case 'socket-power': // силовая розетка: залитая полуокружность, три отвода
      return g(`<path d="M${-R} 0A${R} ${R} 0 0 0 ${R} 0Z" fill="${col}" stroke="${col}" stroke-width="${sw}"/><path d="M${-R * 0.5} ${R}V${R * 1.45}M0 ${R}V${R * 1.45}M${R * 0.5} ${R}V${R * 1.45}" ${st}/>`);
    case 'switch': // выключатель одноклавишный скрытой установки: кружок, отвод под 45° и флажок
      return g(`<circle cx="0" cy="${R * 0.4}" r="${R * 0.38}" fill="${col}"/><path d="M${R * 0.27} ${R * 0.67}L${R * 1.1} ${R * 1.5}l${R * 0.45}-${R * 0.45}" ${st}/>`);
    case 'light': // светильник (общее обозначение): окружность с крестом
      return `<g transform="translate(${cx} ${cy})"><circle r="${R}" ${st}/><path d="M${-R * 0.7} ${-R * 0.7}L${R * 0.7} ${R * 0.7}M${R * 0.7} ${-R * 0.7}L${-R * 0.7} ${R * 0.7}" ${st}/></g>`;
    case 'wall-light': // настенный светильник: полуокружность с крестом у стены
      return g(`<path d="M${-R} 0A${R} ${R} 0 0 0 ${R} 0Z" ${st}/><path d="M${-R * 0.45} ${R * 0.1}L${R * 0.45} ${R * 0.75}M${R * 0.45} ${R * 0.1}L${-R * 0.45} ${R * 0.75}" ${st}/>`);
    case 'panel': // щиток распределительный: прямоугольник с залитым треугольником
      return g(`<rect x="${-R * 1.3}" y="0" width="${R * 2.6}" height="${R * 1.1}" ${st}/><path d="M${-R * 1.3} ${R * 1.1}L${R * 1.3} 0V${R * 1.1}Z" fill="${col}"/>`);
    case 'junction': // коробка ответвительная: окружность с точкой
      return `<g transform="translate(${cx} ${cy})"><circle r="${R * 0.55}" ${st}/><circle r="${R * 0.15}" fill="${col}"/></g>`;
    case 'riser':
      return `<g transform="translate(${cx} ${cy})"><circle r="${R}" ${st}/><circle r="${R * 0.55}" ${st}/></g>`;
    case 'collector':
      return g(`<rect x="${-R * 1.4}" y="0" width="${R * 2.8}" height="${R * 0.6}" ${st}/><path d="M${-R * 0.8} ${R * 0.6}V${R * 1.3}M0 ${R * 0.6}V${R * 1.3}M${R * 0.8} ${R * 0.6}V${R * 1.3}" ${st}/>`);
    case 'radiator': // прибор отопительный: прямоугольник с диагональю
      return g(`<rect x="${-r * 3.3}" y="${R * 0.2}" width="${r * 6.6}" height="${R * 1.1}" ${st}/><path d="M${-r * 3.3} ${R * 1.3}L${r * 3.3} ${R * 0.2}" ${st}/>`);
    case 'boiler':
      return g(`<rect x="${-R}" y="0" width="${R * 2}" height="${R * 1.6}" ${st}/><path d="M${-R} ${R * 1.6}L${R} 0M${-R} 0L${R} ${R * 1.6}" ${st}/>`);
    case 'vent-channel': // вентиляционный канал: прямоугольник с диагональю (решётка)
      return g(`<rect x="${-R}" y="0" width="${R * 2}" height="${R * 1.2}" ${st}/><path d="M${-R} ${R * 0.4}H${R}M${-R} ${R * 0.8}H${R}" ${st}/>`);
    case 'hood':
      return g(`<path d="M${-R * 1.2} 0H${R * 1.2}L${R * 0.5} ${R * 1.2}H${-R * 0.5}Z" ${st}/>`);
    default: {
      if (GOST_SHORT[kind]) // точка подключения прибора: окружность-выпуск и обозначение прибора
        return `<g transform="translate(${cx} ${cy})"><circle r="${R * 0.45}" fill="${col}"/><text x="${R * 0.8}" y="${-R * 0.5}" style="font:600 ${r * 0.8}px var(--mono,monospace);fill:${col}">${GOST_SHORT[kind]}</text></g>`;
      return `<circle cx="${cx}" cy="${cy}" r="${R * 0.4}" fill="${col}"/>`;
    }
  }
}

// Коды трубопроводов по ГОСТ 21.205 / 21.206 и подписи линий
export const PIPE_CODES = { cold: 'В1', hot: 'Т3', sewer: 'К1', heating: 'Т1', vent: 'В', electric: '' };
export const PIPE_DIAM = { cold: 'Ø20', hot: 'Ø20', sewer: 'Ø50', heating: 'Ø20', vent: 'Ø125', electric: '' };
