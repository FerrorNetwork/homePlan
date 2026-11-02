// Экспорт и импорт: DXF, PNG, Excel (с формулами), CSV, печать в PDF.
import { openingGeometry, POINT_KINDS, SYSTEMS, uid, WALL_TYPES } from './model.js';
import { centroid } from './geometry.js';

export function download(name, content, type = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ——— DXF (R12, ASCII) ———
export function toDXF(p, floor = p.activeFloor) {
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER'];
  const layers = { WALLS: 7, WALLS_AXIS: 8, OPENINGS: 4, ROOMS: 3, ELECTRIC: 30, WATER: 5, SEWER: 34, HEATING: 1, VENT: 6, ROUTES: 2 };
  for (const [n, c] of Object.entries(layers)) out.push('0', 'LAYER', '2', n, '70', '0', '62', String(c), '6', 'CONTINUOUS');
  out.push('0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES');
  const line = (layer, a, b) => out.push('0', 'LINE', '8', layer, '10', f(a.x), '20', f(-a.y), '30', '0', '11', f(b.x), '21', f(-b.y), '31', '0');
  const text = (layer, pt, s, h = 200) => out.push('0', 'TEXT', '8', layer, '10', f(pt.x), '20', f(-pt.y), '30', '0', '40', String(h), '1', s);
  const circle = (layer, pt, r) => out.push('0', 'CIRCLE', '8', layer, '10', f(pt.x), '20', f(-pt.y), '30', '0', '40', String(r));
  for (const w of p.walls.filter(w => w.floor === floor)) {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, nx = -(w.b.y - w.a.y) / len * w.thickness / 2, ny = (w.b.x - w.a.x) / len * w.thickness / 2;
    line('WALLS_AXIS', w.a, w.b);
    line('WALLS', { x: w.a.x + nx, y: w.a.y + ny }, { x: w.b.x + nx, y: w.b.y + ny });
    line('WALLS', { x: w.a.x - nx, y: w.a.y - ny }, { x: w.b.x - nx, y: w.b.y - ny });
  }
  for (const o of p.openings) { const g = openingGeometry(p, o); if (g && g.wall.floor === floor) { line('OPENINGS', g.a, g.b); text('OPENINGS', g.center, `${o.kind === 'window' ? 'ОК' : 'ДВ'} ${o.width}`, 120); } }
  for (const r of p.rooms.filter(r => r.floor === floor)) { r.poly.forEach((q, i) => line('ROOMS', q, r.poly[(i + 1) % r.poly.length])); text('ROOMS', centroid(r.poly), r.name, 220); }
  for (const pt of p.points.filter(x => x.floor === floor)) { const k = POINT_KINDS[pt.kind]; const L = k?.system === 'electric' ? 'ELECTRIC' : k?.system === 'heating' ? 'HEATING' : k?.system === 'vent' ? 'VENT' : 'WATER'; circle(L, pt, 60); text(L, { x: pt.x + 80, y: pt.y }, `${k?.name || pt.kind} h=${pt.h}`, 80); }
  for (const r of p.routes.filter(x => x.floor === floor)) for (let i = 1; i < r.path.length; i++) line(r.system === 'sewer' ? 'SEWER' : r.system === 'electric' ? 'ELECTRIC' : r.system === 'heating' ? 'HEATING' : r.system === 'vent' ? 'VENT' : 'WATER', r.path[i - 1], r.path[i]);
  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\r\n');
}
const f = v => (Math.round(v * 10) / 10).toString();

export function fromDXF(text, floor = 'f1') {
  const lines = text.split(/\r?\n/).map(s => s.trim());
  const segs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    if (lines[i] !== '0') continue;
    const type = lines[i + 1];
    if (type !== 'LINE' && type !== 'LWPOLYLINE') continue;
    const ent = { pts: [], closed: false, layer: '' };
    let j = i + 2, cx = null;
    while (j < lines.length - 1 && lines[j] !== '0') {
      const code = lines[j], val = lines[j + 1];
      if (code === '8') ent.layer = val;
      if (type === 'LINE') { if (code === '10') ent.x1 = +val; if (code === '20') ent.y1 = +val; if (code === '11') ent.x2 = +val; if (code === '21') ent.y2 = +val; }
      else { if (code === '10') cx = +val; if (code === '20' && cx !== null) { ent.pts.push({ x: cx, y: +val }); cx = null; } if (code === '70') ent.closed = (+val & 1) === 1; }
      j += 2;
    }
    if (type === 'LINE') segs.push([{ x: ent.x1, y: ent.y1 }, { x: ent.x2, y: ent.y2 }, ent.layer]);
    else { for (let k = 1; k < ent.pts.length; k++) segs.push([ent.pts[k - 1], ent.pts[k], ent.layer]); if (ent.closed && ent.pts.length > 2) segs.push([ent.pts[ent.pts.length - 1], ent.pts[0], ent.layer]); }
  }
  const valid = segs.filter(([a, b]) => isFinite(a.x + a.y + b.x + b.y) && Math.hypot(b.x - a.x, b.y - a.y) > 0);
  if (!valid.length) return [];
  const ext = Math.max(...valid.flatMap(([a, b]) => [Math.abs(a.x), Math.abs(a.y), Math.abs(b.x), Math.abs(b.y)]));
  const k = ext < 200 ? 1000 : 1; // чертёж в метрах → мм
  const preferAxis = valid.some(s => /AXIS/i.test(s[2]));
  return valid.filter(s => !preferAxis || /AXIS/i.test(s[2]) || !/WALL/i.test(s[2]))
    .filter(s => !/ROOM|OPEN|ELECTR|WATER|SEWER|HEAT|VENT|TEXT|DIM/i.test(s[2]))
    .map(([a, b]) => ({ id: uid('w'), floor, a: { x: a.x * k, y: -a.y * k }, b: { x: b.x * k, y: -b.y * k }, type: 'partition', thickness: WALL_TYPES.partition.thickness, status: 'existing', imported: true }));
}

// ——— PNG из SVG ———
export async function svgToPng(svgEl, scale = 2) {
  const clone = svgEl.cloneNode(true);
  const vb = svgEl.viewBox.baseVal; const W = svgEl.clientWidth || vb.width / 10, H = svgEl.clientHeight || vb.height / 10;
  clone.setAttribute('width', W * scale); clone.setAttribute('height', H * scale);
  const styles = getComputedStyle(document.documentElement);
  // Подставляем значения CSS-переменных, чтобы картинка выглядела как на экране
  let xml = new XMLSerializer().serializeToString(clone).replace(/var\((--[\w-]+)\)/g, (_, v) => styles.getPropertyValue(v).trim() || '#000');
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml); });
  const c = document.createElement('canvas'); c.width = W * scale; c.height = H * scale;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(res, 'image/png'));
}

export function svgString(svgEl) {
  const styles = getComputedStyle(document.documentElement);
  return new XMLSerializer().serializeToString(svgEl).replace(/var\((--[\w-]+)\)/g, (_, v) => styles.getPropertyValue(v).trim() || '#000');
}

// ——— Excel через SheetJS (загружается по требованию) ———
let xlsxPromise = null;
function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  xlsxPromise ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('Не удалось загрузить модуль Excel')); document.head.append(s); });
  return xlsxPromise;
}

// sheets: [{name, rows: [[...]], formulas: (rowIdx) => {...}, cols}]
export async function exportXlsx(filename, sheets) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    for (const [addr, formula] of Object.entries(sh.formulas || {})) ws[addr] = { t: 'n', f: formula };
    if (sh.cols) ws['!cols'] = sh.cols.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}

export function toCSV(rows) {
  return '﻿' + rows.map(r => r.map(v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(';')).join('\r\n');
}

// ——— Печать / PDF ———
export function printDocument(title, bodyHtml) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.append(frame);
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${title}</title><style>
    @page{size:A4;margin:14mm}body{font:11px/1.45 "Manrope",system-ui,sans-serif;color:#1d1c19}h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
    table{width:100%;border-collapse:collapse;margin:6px 0}th,td{border-bottom:1px solid #e3ddd0;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f4f1ea;font-weight:600}td.n,th.n{text-align:right;white-space:nowrap}
    .muted{color:#6f6a5f}.total{font-weight:700}.box{border:1px solid #e3ddd0;padding:8px 10px;border-radius:6px;margin:8px 0}svg{max-width:100%;height:auto}.pb{page-break-before:always}
  </style></head><body>${bodyHtml}</body></html>`);
  doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 2000); }, 400);
}
