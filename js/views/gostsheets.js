// Комплект листов в формате A3 (420×297) с рамкой и основной надписью по ГОСТ Р 21.101-2020 (форма 3).
// Листы: план электрооборудования (ЭОМ), однолинейная схема щита, план водопровода и канализации (ВК),
// план отопления (ОВ), спецификация оборудования, изделий и материалов (ГОСТ 21.110).
import { S } from '../store.js';
import { esc } from '../ui.js';
import { POINT_KINDS, groupLoad, routeLength } from '../core/model.js';
import { gostGlyph, PIPE_CODES, PIPE_DIAM } from './symbols.js';
import { gostSpecification } from './gostplan.js';

const INK = '#1d1c19';

// Рамка и основная надпись. Все размеры — в миллиметрах листа.
function frameSvg(info) {
  const t = 0.7, th = 0.25;
  const L = (x1, y1, x2, y2, w = th) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${w}"/>`;
  const T = (x, y, s, size = 2.5, anchor = 'start', weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${INK}" font-family="GOST type A, ISOCPEUR, Arial Narrow, Arial, sans-serif" font-style="italic">${esc(s)}</text>`;
  const x0 = 230, y0 = 237; // левый верхний угол основной надписи 185×55
  const cols = [0, 7, 17, 27, 37, 52, 62].map(c => x0 + c);
  const out = [`<rect x="20" y="5" width="395" height="287" fill="none" stroke="${INK}" stroke-width="${t}"/>`];
  out.push(`<rect x="${x0}" y="${y0}" width="185" height="55" fill="#fff" stroke="${INK}" stroke-width="${t}"/>`);
  // Левая часть: 11 строк по 5 мм
  for (let i = 1; i < 11; i++) out.push(L(x0, y0 + i * 5, x0 + 62, y0 + i * 5, i === 5 || i === 6 ? t : th));
  for (const c of cols.slice(1, -1)) out.push(L(c, y0, c, y0 + 30, c === cols[1] ? th : t));
  out.push(L(x0 + 17, y0 + 30, x0 + 17, y0 + 55, t), L(x0 + 37, y0 + 30, x0 + 37, y0 + 55, t), L(x0 + 52, y0 + 30, x0 + 52, y0 + 55, t));
  out.push(L(x0 + 62, y0, x0 + 62, y0 + 55, t));
  ['Изм.', 'Кол.уч', 'Лист', '№ док.', 'Подп.', 'Дата'].forEach((s, i) => out.push(T((cols[i] + cols[i + 1]) / 2, y0 + 29, s, 2.2, 'middle')));
  const people = [['Разраб.', info.author], ['Пров.', ''], ['', ''], ['Н.контр.', ''], ['Утв.', '']];
  people.forEach(([role, name], i) => { out.push(T(x0 + 1, y0 + 34 + i * 5, role, 2.2)); if (name) out.push(T(x0 + 18, y0 + 34 + i * 5, name, 2.2)); });
  out.push(T(x0 + 57, y0 + 34, info.date, 2, 'middle'));
  // Правая часть
  const xr = x0 + 62;
  out.push(L(xr, y0 + 15, x0 + 185, y0 + 15, t), L(xr, y0 + 30, x0 + 185, y0 + 30, t), L(xr + 70, y0 + 30, xr + 70, y0 + 55, t), L(xr + 70, y0 + 35, x0 + 185, y0 + 35, th), L(xr + 70, y0 + 45, x0 + 185, y0 + 45, t));
  out.push(L(xr + 85, y0 + 30, xr + 85, y0 + 45, th), L(xr + 100, y0 + 30, xr + 100, y0 + 45, th));
  out.push(T(xr + 61.5, y0 + 9.5, info.code, 5, 'middle', 600));
  out.push(T(xr + 61.5, y0 + 21, info.object, 3.2, 'middle'), T(xr + 61.5, y0 + 26.5, info.address, 2.5, 'middle'));
  info.title.split('\n').forEach((line, i, arr) => out.push(T(xr + 35, y0 + 43 - (arr.length - 1) * 2.3 + i * 4.6, line, 3.2, 'middle')));
  out.push(T(xr + 77.5, y0 + 33.8, 'Стадия', 2.2, 'middle'), T(xr + 92.5, y0 + 33.8, 'Лист', 2.2, 'middle'), T(xr + 111.5, y0 + 33.8, 'Листов', 2.2, 'middle'));
  out.push(T(xr + 77.5, y0 + 41.5, info.stage, 3.5, 'middle'), T(xr + 92.5, y0 + 41.5, String(info.sheet), 3.5, 'middle'), T(xr + 111.5, y0 + 41.5, String(info.sheets), 3.5, 'middle'));
  out.push(T(xr + 96.5, y0 + 51.5, info.org, 3.5, 'middle', 600));
  out.push(T(415, 296, 'Формат A3', 2.5, 'end'));
  out.push(T(25, 296, 'Эскизная документация — не является рабочей документацией и проектом перепланировки', 2.2));
  return `<svg class="frame" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 297" width="420mm" height="297mm">${out.join('')}</svg>`;
}

const legendRow = (sym, text) => `<tr><td class="sym">${sym}</td><td>${esc(text)}</td></tr>`;
const glyph = k => `<svg width="12mm" height="7mm" viewBox="-30 -20 60 40">${gostGlyph(k, 0, -6, 14, 0, INK)}</svg>`;
const lineSym = (code, dash = '', w = 1.2) => `<svg width="18mm" height="5mm" viewBox="0 0 72 20"><line x1="0" y1="10" x2="24" y2="10" stroke="${INK}" stroke-width="${w}" stroke-dasharray="${dash}"/>${code ? `<text x="36" y="14" text-anchor="middle" font-size="11" font-weight="700" fill="${INK}">${code}</text>` : `<line x1="24" y1="10" x2="48" y2="10" stroke="${INK}" stroke-width="${w}" stroke-dasharray="${dash}"/>`}<line x1="48" y1="10" x2="72" y2="10" stroke="${INK}" stroke-width="${w}" stroke-dasharray="${dash}"/></svg>`;

// Однолинейная схема щита в обозначениях ГОСТ 2.755 / 2.710: QS — выключатель нагрузки, QF — автомат (контакт с «×»),
// дифавтомат — автомат с датчиком дифференциального тока «ΔI», шины — утолщённые линии.
function panelSchemeSvg(p) {
  const n = p.groups.length, step = Math.min(64, 300 / Math.max(1, n)), W = Math.max(250, 90 + n * step), H = 120;
  const total = p.groups.reduce((s, g) => s + groupLoad(p, g).design, 0);
  const mainA = [25, 32, 40, 50, 63].find(a => a >= total / 230 * 1.1) || 63;
  const L = (x1, y1, x2, y2, w = 0.35, extra = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="${w}" ${extra}/>`;
  const T = (x, y, s, size = 2.5, anchor = 'middle', extra = '') => `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${INK}" font-style="italic" font-family="GOST type A, ISOCPEUR, Arial Narrow, Arial, sans-serif" ${extra}>${esc(s)}</text>`;
  // Контакт аппарата: неподвижная часть сверху, подвижный контакт под углом
  const contact = (x, y, cross) => L(x, y, x, y + 4) + L(x, y + 10, x - 4, y + 4.6) + L(x, y + 10, x, y + 14) + (cross ? L(x - 1.2, y + 2.8, x + 1.2, y + 5.2) + L(x + 1.2, y + 2.8, x - 1.2, y + 5.2) : '');
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}mm" height="${H}mm">`];
  out.push(T(4, 6, `Ввод ~230 В, 50 Гц. Pр = ${(total / 1000).toFixed(2)} кВт, Iр = ${(total / 230).toFixed(1)} А`, 3, 'start'));
  const x0 = 22;
  out.push(L(x0, 10, x0, 16) + contact(x0, 16, false) + L(x0, 30, x0, 36));
  out.push(T(x0 + 4, 24, `QS  ${mainA} А`, 2.6, 'start'));
  const busEnd = 40 + (n - 1) * step + 10;
  out.push(L(x0, 36, busEnd, 36, 0.9), T(busEnd + 2, 37, 'L, N, PE', 2.2, 'start'));
  p.groups.forEach((g, i) => {
    const x = 40 + i * step, Lg = groupLoad(p, g);
    const len = p.routes.filter(r => r.group === g.id).reduce((s, r) => s + routeLength(r), 0) / 1000;
    out.push(L(x, 36, x, 42) + contact(x, 42, true) + L(x, 56, x, 84, 0.35, g.kind === 'light' ? 'stroke-dasharray="2 1"' : ''));
    if (g.rcd) out.push(`<ellipse cx="${x + 8}" cy="${49}" rx="3.2" ry="2.4" fill="none" stroke="${INK}" stroke-width="0.3"/>` + T(x + 8, 50, 'ΔI', 2, 'middle') + L(x + 0.5, 49, x + 4.8, 49, 0.25, 'stroke-dasharray="0.8 0.8"'));
    out.push(T(x - 6, 47, `QF${i + 1}`, 2.4, 'end', 'font-weight="600"'), T(x - 6, 51, `C${g.breaker}`, 2.2, 'end'), g.rcd ? T(x - 6, 55, '30 мА', 2, 'end') : '');
    out.push(`<text x="${x + 2}" y="60" font-size="2.2" fill="${INK}" font-style="italic" font-family="Arial Narrow, Arial, sans-serif" transform="rotate(90 ${x + 2} 60)">ВВГнг(А)-LS ${g.cable}, L=${len.toFixed(0)} м</text>`);
    out.push(`<rect x="${x - step / 2 + 2}" y="86" width="${step - 4}" height="30" fill="none" stroke="${INK}" stroke-width="0.25"/>`);
    out.push(T(x, 91, `гр.${i + 1}`, 2.6, 'middle', 'font-weight="600"'), T(x, 96, g.name.slice(0, 22), 2.2), T(x, 101, `точек: ${Lg.points}`, 2.2), T(x, 106, `Pр ${(Lg.design / 1000).toFixed(2)} кВт`, 2.2), T(x, 111, `Iр ${Lg.current.toFixed(1)} А`, 2.2, 'middle', Lg.overload ? 'font-weight="700" text-decoration="underline"' : ''));
  });
  out.push('</svg>');
  return out.join('');
}

function page(info, body) { return `<section class="sheet">${frameSvg(info)}${body}</section>`; }

export function buildGostSheets(p, canvas, { panelSvg }) {
  const author = S.user?.name || S.user?.email || '';
  const year = new Date().getFullYear();
  const base = `ДП-${year}-${p.id.slice(-4).toUpperCase()}`;
  const common = { author, date: new Date().toLocaleDateString('ru-RU', { month: '2-digit', year: '2-digit' }), object: p.name, address: `${p.kind || 'Квартира'}, г. ${p.city}`, stage: 'Р', org: 'ДомПроект' };
  const hasHeating = p.points.some(x => ['radiator', 'boiler'].includes(x.kind)) || p.heatingLoops.length || p.routes.some(r => r.system === 'heating');
  const list = [];
  const notesEl = ['Высоты установки электроустановочных изделий указаны от уровня чистого пола, мм.', 'Проводку выполнять скрыто кабелем ВВГнг(А)-LS: горизонтальные участки — не ниже 150 мм от потолка или в подготовке пола, вертикальные — строго над/под изделием.', 'Розеточные группы и группы мокрых помещений защищать УЗО (дифавтоматами) с током утечки 30 мА.', 'Ответвления выполнять в распаечных коробках; соединения — клеммами.', 'Сечения и номиналы автоматов уточняются проектировщиком по расчётной нагрузке и выделенной мощности.'];
  // Лист: план электрооборудования
  {
    const plan = canvas.exportGost({ layers: { furniture: false, finish: false, underlay: false }, systems: ['electric'], paperW: 268, paperH: 222 });
    const groups = p.groups.map((g, i) => { const L = groupLoad(p, g); const len = p.routes.filter(r => r.group === g.id).reduce((s, r) => s + routeLength(r), 0) / 1000; return `<tr><td>${i + 1}</td><td>${esc(g.name)}</td><td>C${g.breaker}${g.rcd ? '/30мА' : ''}</td><td>${g.cable}</td><td>${len.toFixed(1)}</td><td>${(L.design / 1000).toFixed(2)}</td><td>${L.current.toFixed(1)}</td></tr>`; }).join('');
    list.push({ title: 'План расположения\nэлектрооборудования', code: `${base}-ЭОМ`, body: `<div class="area" style="left:24mm;top:8mm;width:268mm;height:222mm">${plan.svg}</div><div class="scale" style="left:24mm;top:231mm">М 1:${plan.scale}</div>
      <div class="side" style="left:297mm;top:10mm;width:113mm"><h4>Условные обозначения</h4><table class="leg">${[['socket', 'Розетка штепсельная 2P+PE с защитным контактом'], ['socket-kitchen', 'Блок розеток над столешницей'], ['socket-power', 'Розетка силовая для электроплиты, 32 А'], ['switch', 'Выключатель одноклавишный скрытой установки'], ['light', 'Светильник потолочный'], ['wall-light', 'Светильник настенный'], ['panel', 'Щиток квартирный ЩК'], ['junction', 'Коробка ответвительная']].filter(([k]) => p.points.some(x => x.kind === k)).map(([k, t]) => legendRow(glyph(k), t)).join('')}
        ${legendRow(lineSym(''), 'Групповая сеть, скрыто по стене')}${legendRow(lineSym('', '6 2'), 'Групповая сеть по потолку')}</table>
        <h4>Таблица групп щита ЩК</h4><table class="tbl"><tr><th>№</th><th>Потребители</th><th>Аппарат</th><th>Кабель</th><th>L, м</th><th>Pр, кВт</th><th>Iр, А</th></tr>${groups}</table>
        <h4>Примечания</h4><ol class="notes">${notesEl.map(n => `<li>${esc(n)}</li>`).join('')}</ol></div>` });
  }
  // Лист: однолинейная схема щита
  {
    const total = p.groups.reduce((s, g) => s + groupLoad(p, g).design, 0);
    const rows = p.groups.map((g, i) => { const L = groupLoad(p, g); const len = p.routes.filter(r => r.group === g.id).reduce((s, r) => s + routeLength(r), 0) / 1000; return `<tr><td>QF${i + 1}</td><td>${g.rcd ? 'АВДТ' : 'ВА'} 1P${g.rcd ? '+N' : ''} C${g.breaker}${g.rcd ? ', 30 мА, тип A' : ''}</td><td>ВВГнг(А)-LS ${g.cable}</td><td>${len.toFixed(1)}</td><td>${L.points}</td><td>${(L.design / 1000).toFixed(2)}</td><td>${L.current.toFixed(1)}</td><td>${esc(g.name)}</td></tr>`; }).join('');
    list.push({ title: 'Щит квартирный ЩК.\nСхема однолинейная', code: `${base}-ЭОМ`, body: `<div class="area" style="left:28mm;top:12mm">${panelSchemeSvg(p)}</div>
      <div class="side" style="left:24mm;top:138mm;width:380mm"><table class="tbl"><tr><th>Обозн.</th><th>Аппарат защиты</th><th>Марка и сечение кабеля</th><th>L, м</th><th>Точек</th><th>Pр, кВт</th><th>Iр, А</th><th>Наименование потребителей</th></tr>${rows}
        <tr><td colspan="5"><b>Итого по щиту ЩК (Kс учтён для розеточных групп)</b></td><td><b>${(total / 1000).toFixed(2)}</b></td><td><b>${(total / 230).toFixed(1)}</b></td><td>Ввод ~230 В, 50 Гц</td></tr></table>
        <ol class="notes"><li>Номиналы аппаратов и сечения кабелей подтверждаются расчётом проектировщика.</li><li>Корпус щита — с шинами N и PE; защитный проводник PE прокладывать во всех группах.</li></ol></div>` });
  }
  // Лист: водопровод и канализация
  if (p.points.some(x => POINT_KINDS[x.kind]?.system === 'water')) {
    const plan = canvas.exportGost({ layers: { furniture: false, finish: false, underlay: false }, systems: ['cold', 'hot', 'sewer'], paperW: 268, paperH: 222 });
    const fx = p.points.filter(x => POINT_KINDS[x.kind]?.needs);
    list.push({ title: 'План сетей водопровода\nи канализации', code: `${base}-ВК`, body: `<div class="area" style="left:24mm;top:8mm;width:268mm;height:222mm">${plan.svg}</div><div class="scale" style="left:24mm;top:231mm">М 1:${plan.scale}</div>
      <div class="side" style="left:297mm;top:10mm;width:113mm"><h4>Условные обозначения</h4><table class="leg">${legendRow(lineSym(PIPE_CODES.cold), 'В1 — водопровод хозяйственно-питьевой')}${legendRow(lineSym(PIPE_CODES.hot), 'Т3 — горячее водоснабжение (подающий)')}${legendRow(lineSym(PIPE_CODES.sewer, '', 2), 'К1 — канализация бытовая')}${legendRow(glyph('riser'), 'Стояк')}${legendRow(glyph('sink'), 'Точка подключения прибора')}</table>
        <h4>Ведомость приборов</h4><table class="tbl"><tr><th>Прибор</th><th>Подводки</th><th>Кол.</th></tr>${[...new Set(fx.map(x => x.kind))].map(k => `<tr><td>${esc(POINT_KINDS[k].name)}</td><td>${POINT_KINDS[k].needs.map(n => PIPE_CODES[n]).join(', ')}</td><td>${fx.filter(x => x.kind === k).length}</td></tr>`).join('')}</table>
        <h4>Примечания</h4><ol class="notes"><li>Трубопроводы В1 и Т3 — полипропилен ${PIPE_DIAM.cold}, К1 — ${PIPE_DIAM.sewer}, к унитазу Ø110.</li><li>Уклон канализационных отводов — не менее 0,02 в сторону стояка.</li><li>Отметки выпусков и подводок принимать по паспортам приборов.</li><li>Перед приборами установить запорную арматуру.</li></ol></div>` });
  }
  // Лист: отопление
  if (hasHeating) {
    const plan = canvas.exportGost({ layers: { furniture: false, finish: false, underlay: false }, systems: ['heating'], paperW: 268, paperH: 222 });
    list.push({ title: 'План системы отопления', code: `${base}-ОВ`, body: `<div class="area" style="left:24mm;top:8mm;width:268mm;height:222mm">${plan.svg}</div><div class="scale" style="left:24mm;top:231mm">М 1:${plan.scale}</div>
      <div class="side" style="left:297mm;top:10mm;width:113mm"><h4>Условные обозначения</h4><table class="leg">${legendRow(lineSym('Т1'), 'Т1 — трубопровод отопления подающий')}${legendRow(lineSym('Т2'), 'Т2 — трубопровод отопления обратный')}${legendRow(glyph('radiator'), 'Прибор отопительный')}${legendRow(lineSym('', '6 2 1 2'), 'ТП — контур водяного тёплого пола')}</table>
        <h4>Примечания</h4><ol class="notes"><li>Тип и мощность приборов — по теплотехническому расчёту.</li><li>Перенос радиаторов в многоквартирном доме — только по согласованию с управляющей организацией.</li></ol></div>` });
  }
  // Лист: спецификация (ГОСТ 21.110)
  {
    const rows = gostSpecification(p);
    let pos = 0, last = '';
    const trs = rows.map(r => { const head = r.section !== last ? `<tr class="sec"><td></td><td colspan="8"><b><u>${esc(r.section)}</u></b></td></tr>` : ''; last = r.section; pos++; return `${head}<tr><td>${pos}</td><td>${esc(r.name)}</td><td>${esc(r.type)}</td><td></td><td></td><td>${r.unit}</td><td>${String(r.qty).replace('.', ',')}</td><td></td><td>${esc(r.note)}</td></tr>`; }).join('');
    list.push({ title: 'Спецификация оборудования,\nизделий и материалов', code: `${base}-С`, body: `<div class="side" style="left:24mm;top:10mm;width:386mm"><table class="tbl spec"><tr><th style="width:10mm">Поз.</th><th style="width:130mm">Наименование и техническая характеристика</th><th style="width:60mm">Тип, марка, обозначение документа</th><th style="width:25mm">Код продукции</th><th style="width:40mm">Поставщик</th><th style="width:15mm">Ед. изм.</th><th style="width:20mm">Кол.</th><th style="width:20mm">Масса ед., кг</th><th>Примечание</th></tr>${trs}</table></div>` });
  }
  return list.map((s, i) => page({ ...common, ...s, sheet: i + 1, sheets: list.length }, s.body));
}

export function printSheets(title, pages) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: A3 landscape; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { font-family: "GOST type A", ISOCPEUR, "Arial Narrow", Arial, sans-serif; color: ${INK}; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { position: relative; width: 420mm; height: 297mm; overflow: hidden; page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; }
    .frame { position: absolute; inset: 0; }
    .area, .side, .scale { position: absolute; }
    .area svg { display: block; }
    .mono-svg svg { height: auto; } .mono-svg text { font-family: inherit; }
    .scale { font-size: 3.2mm; font-style: italic; }
    h4 { font-size: 3.2mm; margin: 0 0 1.5mm; font-style: italic; font-weight: 600; text-decoration: underline; }
    .side h4 + table, .side table { margin-bottom: 4mm; }
    table { border-collapse: collapse; width: 100%; font-size: 2.6mm; font-style: italic; }
    .tbl th, .tbl td { border: 0.25mm solid ${INK}; padding: 0.8mm 1.2mm; text-align: left; vertical-align: top; }
    .tbl th { font-weight: 600; text-align: center; }
    .spec td:nth-child(1), .spec td:nth-child(6), .spec td:nth-child(7) { text-align: center; }
    .spec tr.sec td { border-left-color: ${INK}; }
    .leg td { padding: 0.6mm 1mm; border-bottom: 0.15mm solid #bbb; }
    .leg td.sym { width: 20mm; text-align: center; }
    .notes { margin: 0; padding-left: 5mm; font-size: 2.6mm; font-style: italic; } .notes li { margin-bottom: 0.8mm; }
  </style></head><body>${pages.join('')}</body></html>`);
  doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 3000); }, 500);
}
