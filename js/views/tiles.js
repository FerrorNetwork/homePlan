// Раскладка плитки (раздел 6): выбор поверхности кликом, параметры, автоподбор, ручной сдвиг, декор, ведомость подрезок.
import { S, commit, beginGesture, endGesture, emit } from '../store.js';
import { esc, icon, toast, num, money, thumb } from '../ui.js';
import { surfaceFromSpec, computeLayout, suggestLayouts, tileFromProduct, PATTERNS, STARTS } from '../core/tiles.js';
import { allProducts, productById, bestOffer, isUsable } from '../core/catalog.js';
import { bbox, dist } from '../core/geometry.js';
import { uid, WALL_TYPES, openingGeometry } from '../core/model.js';
import { printDocument } from '../core/export.js';
import { selectedDesign } from './design.js';

export function mountTiles(host) {
  host.innerHTML = `<div class="tile-layout" style="margin-top:12px;border-top:1px solid var(--line)"><aside data-left></aside><div class="tile-stage" data-stage></div><aside data-right></aside></div>`;
  const left = host.querySelector('[data-left]'), stage = host.querySelector('[data-stage]'), right = host.querySelector('[data-right]');
  let suggestions = null, layout = null, drag = null;
  const P = () => S.project;
  const spec = () => P().tiles.find(t => t.id === S.ui.tileSpec) || P().tiles[0] || null;

  function compute() {
    const sp = spec(); layout = null;
    if (!sp) return;
    const product = productById(P(), sp.productId), surface = surfaceFromSpec(P(), sp.surface, selectedDesign());
    if (!product || !surface) return;
    layout = { product, surface, tile: tileFromProduct(product), result: computeLayout(surface, tileFromProduct(product), sp.params) };
  }

  function renderAll() { compute(); renderLeft(); renderStage(); renderRight(); }

  function renderLeft() {
    const p = P(), sp = spec();
    left.innerHTML = `<section style="padding:16px"><h4 style="margin-bottom:8px">Поверхность</h4><p class="tiny muted" style="margin-bottom:8px">Кликните по полу комнаты или по стене (ребру), чтобы добавить раскладку.</p>
      <div class="surface-pick">${pickSvg(p, sp)}</div>
      ${sp?.surface.type === 'wall' ? `<div class="row wrap" style="margin-top:8px;gap:4px"><span class="tiny muted">Участок:</span>${[['Целиком', 0, null], ['До 1,2 м', 0, 1200], ['Фартук 0,9–1,5 м', 900, 1500], ['До 2,1 м', 0, 2100]].map(([n, f, t]) => `<button class="chip ${sp.surface.from === f && (sp.surface.to ?? null) === (t ?? (p.rooms.find(r => r.id === sp.surface.roomId)?.ceiling || 2700)) ? 'on' : ''}" data-range="${f}:${t ?? ''}">${n}</button>`).join('')}</div>` : ''}
    </section>
    <section style="padding:0 16px 16px"><h4 style="margin-bottom:8px">Раскладки проекта <span class="muted">${p.tiles.length}</span></h4><div class="stack tight">
      ${p.tiles.map(t => { const r = p.rooms.find(x => x.id === t.surface.roomId); const pr = productById(p, t.productId); return `<button class="list-btn ${sp?.id === t.id ? 'on' : ''}" data-spec="${t.id}">${pr ? thumb(pr, 34) : ''}<span style="flex:1;min-width:0"><b class="small">${t.surface.type === 'floor' ? 'Пол' : `Стена ${t.surface.edge + 1}${t.surface.from || t.surface.to < (r?.ceiling || 2700) ? ` (${t.surface.from}–${t.surface.to})` : ''}`} · ${esc(r?.name || '?')}</b><small>${esc(pr?.name || 'нет плитки')}${t.origin === 'design' ? ' · из дизайна' : ''}</small></span></button>`; }).join('') || '<p class="small muted">Раскладок нет. Выберите поверхность на мини-плане.</p>'}
    </div></section>`;
  }

  function pickSvg(p, sp) {
    const f = p.activeFloor;
    const pts = p.rooms.filter(r => r.floor === f).flatMap(r => r.poly);
    if (!pts.length) return '<p class="small muted">Нет помещений</p>';
    const b = bbox(pts), pad = 400;
    const out = [`<svg viewBox="${b.minX - pad} ${b.minY - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}">`];
    for (const r of p.rooms.filter(r => r.floor === f)) {
      const on = sp?.surface.roomId === r.id && sp.surface.type === 'floor';
      out.push(`<polygon class="room-hit" data-pick-floor="${r.id}" points="${r.poly.map(q => `${q.x},${q.y}`).join(' ')}" fill="${on ? 'var(--accent)' : r.color}" fill-opacity="${on ? 0.35 : 1}" stroke="var(--line-strong)" stroke-width="20"><title>Пол: ${esc(r.name)}</title></polygon>`);
      r.poly.forEach((a, i) => { const c = r.poly[(i + 1) % r.poly.length]; const on2 = sp?.surface.roomId === r.id && sp.surface.type === 'wall' && sp.surface.edge === i; const has = p.tiles.some(t => t.surface.roomId === r.id && t.surface.type === 'wall' && t.surface.edge === i);
        out.push(`<line class="edge-hit" data-pick-wall="${r.id}:${i}" x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}"><title>${esc(r.name)}: стена ${i + 1} (${Math.round(dist(a, c))} мм)</title></line><line class="edge-vis" x1="${a.x}" y1="${a.y}" x2="${c.x}" y2="${c.y}" stroke="${on2 ? 'var(--warm)' : has ? 'var(--accent)' : 'var(--ink-2)'}" stroke-width="${on2 ? 140 : 60}" pointer-events="none"/>`); });
      const c = bbox(r.poly).center;
      out.push(`<text x="${c.x}" y="${c.y}" text-anchor="middle" font-size="260" fill="var(--ink-2)" pointer-events="none">${esc(r.name.slice(0, 10))}</text>`);
    }
    out.push('</svg>');
    return out.join('');
  }

  function renderStage() {
    if (!layout) { stage.innerHTML = `<div class="empty" style="margin:auto">${icon('tile', 32)}<p>Выберите поверхность слева и плитку справа</p></div>`; return; }
    const { surface, result, product } = layout;
    const sp = spec(); const decor = new Set(sp.params.decor || []);
    const decorColor = productById(P(), sp.decorProduct || 'tile-decor-insert')?.color || '#b56b45';
    const b = bbox(surface.poly); const pad = Math.max(b.w, b.h) * 0.08 + 200;
    const narrowKeys = new Set(result.warnings.flatMap(w => w.keys || []));
    const out = [`<svg viewBox="${b.minX - pad} ${b.minY - pad} ${b.w + pad * 2} ${b.h + pad * 2}" data-schema style="cursor:grab;touch-action:none">`];
    out.push(`<defs><pattern id="obh" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0V60" stroke="#b4413a" stroke-opacity=".5" stroke-width="12"/></pattern></defs>`);
    out.push(`<polygon points="${surface.poly.map(q => `${q.x},${q.y}`).join(' ')}" fill="#cfc7b8"/>`);
    for (const t of result.tiles) {
      const fill = decor.has(t.key) ? decorColor : t.full ? product.color : shade(product.color, -0.08);
      out.push(`<polygon data-tile="${t.key}" points="${t.poly.map(q => `${q.x},${q.y}`).join(' ')}" fill="${fill}" stroke="${narrowKeys.has(t.key) ? '#b4413a' : 'rgba(0,0,0,.22)'}" stroke-width="${narrowKeys.has(t.key) ? 14 : 3}"/>`);
      if (!t.full && t.cut && (b.w < 4000 || t.poly.length)) { const c = bbox(t.poly).center; const fs = Math.min(70, Math.max(30, Math.min(bbox(t.poly).w, bbox(t.poly).h) / 3)); if (Math.min(bbox(t.poly).w, bbox(t.poly).h) > 90) out.push(`<text x="${c.x}" y="${c.y + fs / 3}" text-anchor="middle" font-size="${fs}" fill="#1d1c19" fill-opacity=".7" pointer-events="none" font-family="JetBrains Mono">${Math.round(t.cut.w)}×${Math.round(t.cut.h)}</text>`); }
    }
    for (const o of surface.obstacles) out.push(`<polygon points="${o.poly.map(q => `${q.x},${q.y}`).join(' ')}" fill="${o.small ? '#fff' : 'url(#obh)'}" stroke="#b4413a" stroke-width="10"><title>${esc(o.label)}</title></polygon>${o.small ? '' : `<text x="${bbox(o.poly).center.x}" y="${bbox(o.poly).center.y}" text-anchor="middle" font-size="90" fill="#b4413a" font-weight="700" pointer-events="none">${esc(o.label)}</text>`}`);
    for (const w of result.warnings.filter(w => w.at)) out.push(`<circle cx="${w.at.x}" cy="${w.at.y}" r="60" fill="none" stroke="#b4413a" stroke-width="16"/>`);
    // Номера рядов слева
    if (['straight', 'half', 'third'].includes(result.params.pattern)) for (const row of result.rows) {
      const ts = result.tiles.filter(t => t.rowNo === row.no); if (!ts.length) continue;
      const y = bbox(ts.flatMap(t => t.poly)).center.y;
      out.push(`<text x="${b.minX - 60}" y="${y + 25}" text-anchor="end" font-size="75" fill="var(--muted)" font-family="JetBrains Mono">${row.no}</text>`);
    }
    out.push(`<text x="${b.center.x}" y="${b.minY - 70}" text-anchor="middle" font-size="90" fill="var(--muted)" font-family="JetBrains Mono">${Math.round(b.w)} мм</text><text x="${b.maxX + 70}" y="${b.center.y}" font-size="90" fill="var(--muted)" font-family="JetBrains Mono" transform="rotate(90 ${b.maxX + 70} ${b.center.y})" text-anchor="middle">${Math.round(b.h)} мм</text>`);
    out.push('</svg>');
    stage.innerHTML = `<div class="stage-bar" style="position:static;padding:12px"><div class="float" style="padding:6px 12px"><b>${esc(surface.title)}</b>&nbsp;<span class="muted small">· ${num(result.areaM2, 2)} м² · расчёт ${Math.max(1, Math.round(result.ms))} мс</span></div><span class="spacer"></span><div class="float" style="padding:6px 10px"><span class="small muted">Перетащите схему — сдвиг сетки · клик по плитке — декор-вставка</span></div></div>${out.join('')}`;
  }

  function renderRight() {
    const p = P(), sp = spec();
    if (!sp) { right.innerHTML = `<section style="padding:16px"><p class="muted small">Раскладка ещё не выбрана.</p></section>`; return; }
    const kind = sp.surface.type === 'floor' ? 'tile-floor' : 'tile-wall';
    const options = allProducts(p).filter(x => (x.kind === 'tile-floor' || x.kind === 'tile-wall') && isUsable(p, x, p.city)).sort((a, b) => (a.kind === kind ? 0 : 1) - (b.kind === kind ? 0 : 1));
    const pr = productById(p, sp.productId);
    const R = layout?.result; const P2 = sp.params;
    const offer = pr && bestOffer(pr, p.city);
    right.innerHTML = `<section style="padding:16px;border-bottom:1px solid var(--line)"><h4 style="margin-bottom:10px">Плитка из каталога</h4>
      <select class="select sm" data-sp="productId">${options.map(x => `<option value="${x.id}" ${x.id === sp.productId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      ${pr ? `<div class="prod-row" style="margin-top:10px">${thumb(pr, 46)}<div><div class="sub">${pr.dims.w}×${pr.dims.d}×${pr.dims.h} мм · ${pr.shape === 'hex' ? 'шестигранник' : 'прямоугольник'} · ${pr.pack} шт/уп.</div><div class="sub">${offer ? `${money(offer.price)}/${pr.unit} · ${esc(offer.storeName)}` : 'нет предложения'}</div></div></div>` : ''}
    </section>
    <section style="padding:16px;border-bottom:1px solid var(--line)"><h4 style="margin-bottom:10px">Укладка</h4><div class="prop-grid">
      <label class="field"><span>Рисунок</span><select class="select sm" data-sp="pattern" ${pr?.shape === 'hex' ? 'disabled' : ''}>${Object.entries(PATTERNS).filter(([k]) => pr?.shape === 'hex' ? k === 'hex' : k !== 'hex').map(([k, v]) => `<option value="${k}" ${P2.pattern === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
      <label class="field"><span>Старт</span><select class="select sm" data-sp="start">${Object.entries(STARTS).map(([k, v]) => `<option value="${k}" ${P2.start === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${P2.start === 'visible' ? `<label class="field"><span>Видимая сторона</span><select class="select sm" data-sp="visibleSide">${[['left', 'Слева'], ['right', 'Справа'], ['top', 'Сверху'], ['bottom', 'Снизу']].map(([k, n]) => `<option value="${k}" ${(P2.visibleSide || 'bottom') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
      <label class="field"><span>Шов, мм</span><input class="input sm num" type="number" min="1" max="5" step="0.5" data-sp="joint" value="${P2.joint ?? 2}"></label>
      <label class="field"><span>Зазор у стен, мм</span><input class="input sm num" type="number" min="0" max="20" data-sp="gap" value="${P2.gap ?? 0}"></label>
      <label class="field"><span>Мин. подрезка, доля</span><select class="select sm" data-sp="minCut">${[[1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2']].map(([v, n]) => `<option value="${v}" ${Math.abs((P2.minCut ?? 1 / 3) - v) < 0.01 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>Запас на бой, %</span><input class="input sm num" type="number" min="0" max="40" data-sp="waste" value="${P2.waste ?? PATTERNS[P2.pattern]?.waste ?? 10}"></label>
      <label class="field"><span>Сдвиг X, мм</span><input class="input sm num" type="number" step="5" data-sp="offsetX" value="${Math.round(P2.offsetX || 0)}"></label>
      <label class="field"><span>Сдвиг Y, мм</span><input class="input sm num" type="number" step="5" data-sp="offsetY" value="${Math.round(P2.offsetY || 0)}"></label>
    </div>
    ${sp.surface.type === 'floor' ? `<label class="check small" style="margin-top:10px"><input type="checkbox" data-surf="excludeFixtures" ${sp.surface.excludeFixtures ? 'checked' : ''}> Не класть под ванну и встроенную мебель</label>` : ''}
    <div class="row wrap" style="margin-top:10px"><button class="btn sm" data-act="suggest">${icon('sparkles', 14)} Автоподбор 3 вариантов</button></div>
    ${suggestions ? `<div class="variant-pills" style="margin-top:10px">${suggestions.map((s, i) => `<button class="vpill" data-sugg="${i}"><b>${s.name}</b><span>${s.result.totalPcs} шт · отход ${Math.max(0, Math.round((s.result.totalPcs * s.result.tileM2 / s.result.areaM2 - 1) * 100))}% · мин. ${Math.round(s.result.minEdge * 100)}%</span></button>`).join('')}</div>` : ''}
    </section>
    ${R ? `<section style="padding:16px;border-bottom:1px solid var(--line)"><h4 style="margin-bottom:10px">Расчёт</h4>
      <dl class="stat-list"><dt>Площадь укладки</dt><dd>${num(R.areaM2, 2)} м²</dd><dt>Целых плиток</dt><dd>${R.whole}</dd><dt>Подрезанных</dt><dd>${R.cutCount}</dd><dt>Кусков из обрезков</dt><dd>${Math.max(0, R.cutCount - R.cutTiles)}</dd><dt>Нужно без запаса</dt><dd>${R.net} шт</dd><dt>С запасом ${R.waste}%</dt><dd><b>${R.totalPcs} шт</b></dd>${R.packs ? `<dt>Упаковок</dt><dd><b>${R.packs}</b> (${num(R.packs * (pr.pack || 1) * R.tileM2, 2)} м²)</dd>` : ''}${R.decorCount ? `<dt>Декор-вставок</dt><dd>${R.decorCount} шт</dd>` : ''}
      <dt>Клей</dt><dd>${num(R.adhesiveKg, 0)} кг · ${R.adhesiveBags} меш.</dd><dt>Затирка</dt><dd>${num(R.groutKg, 1)} кг · ${R.groutPacks} уп.</dd><dt>Мин. подрезка у краёв</dt><dd>${Math.round(R.minEdge * 100)}%</dd></dl>
      <div class="issues" style="margin-top:10px">${R.warnings.length ? R.warnings.map(w => `<div class="issue ${w.level}">${icon('alert', 14)}<span>${esc(w.text)}</span></div>`).join('') : `<div class="issue ok">${icon('check', 14)}<span>Подрезка не уже минимума, швы не попадают на розетки</span></div>`}</div>
      <p class="tiny muted" style="margin-top:8px">Количество попадает в смету автоматически. 3D-вид показывает плитку на этой поверхности.</p></section>
    <section style="padding:16px;border-bottom:1px solid var(--line)"><h4 style="margin-bottom:8px">Подрезки для мастера</h4>
      <div class="table-wrap" style="max-height:220px;overflow:auto"><table class="t"><tr><th>Ряд</th><th class="n">Целых</th><th>Подрезки, мм</th></tr>${R.rows.map(r => `<tr><td>${r.no}</td><td class="n">${r.whole}</td><td class="small mono">${r.cuts.map(c => `${c.n}×${c.size}`).join(', ') || '—'}</td></tr>`).join('')}</table></div>
      <div class="row wrap" style="margin-top:10px"><button class="btn sm" data-act="pdf">${icon('print', 14)} Схема в PDF</button><button class="btn sm danger" data-act="delete">${icon('trash', 14)}</button></div></section>` : ''}`;
  }

  // ——— События ———
  function addSpec(surface) {
    const p = P();
    const existing = p.tiles.find(t => t.surface.roomId === surface.roomId && t.surface.type === surface.type && (surface.type === 'floor' || t.surface.edge === surface.edge));
    if (existing) { S.ui.tileSpec = existing.id; suggestions = null; renderAll(); return; }
    const kind = surface.type === 'floor' ? 'tile-floor' : 'tile-wall';
    const d = selectedDesign(); const fin = d?.finishes?.[surface.roomId] || {};
    const prod = productById(p, surface.type === 'floor' ? fin.floor : fin.wallTile || fin.apron);
    const productId = prod?.kind === kind ? prod.id : allProducts(p).find(x => x.kind === kind && isUsable(p, x, p.city))?.id;
    if (!productId) return toast('В каталоге нет подходящей плитки для города', 'err');
    const room = p.rooms.find(r => r.id === surface.roomId);
    const t = { id: uid('t'), origin: 'user', surface: surface.type === 'wall' ? { ...surface, from: 0, to: room.ceiling || 2700 } : { ...surface, excludeFixtures: true }, productId, params: { joint: 2, pattern: 'straight', start: surface.type === 'floor' ? 'door' : 'visible', visibleSide: 'bottom', minCut: 1 / 3, offsetX: 0, offsetY: 0, decor: [] } };
    commit(pp => pp.tiles.push(t)); S.ui.tileSpec = t.id; suggestions = null; renderAll();
  }
  function updateSpec(fn) { const id = spec()?.id; commit(p => { const t = p.tiles.find(x => x.id === id); if (t) { fn(t); t.origin = 'user'; } }); }

  host.addEventListener('click', e => {
    const f = e.target.closest('[data-pick-floor]'); if (f) return addSpec({ type: 'floor', roomId: f.dataset.pickFloor });
    const w = e.target.closest('[data-pick-wall]'); if (w) { const [roomId, edge] = w.dataset.pickWall.split(':'); return addSpec({ type: 'wall', roomId, edge: +edge }); }
    const s = e.target.closest('[data-spec]'); if (s) { S.ui.tileSpec = s.dataset.spec; suggestions = null; return renderAll(); }
    const rg = e.target.closest('[data-range]'); if (rg) { const [fr, to] = rg.dataset.range.split(':'); return updateSpec(t => { t.surface.from = +fr; const room = P().rooms.find(r => r.id === t.surface.roomId); t.surface.to = to ? +to : (room?.ceiling || 2700); }); }
    const sg = e.target.closest('[data-sugg]'); if (sg) { const v = suggestions[+sg.dataset.sugg]; return updateSpec(t => { t.params = { ...t.params, ...v.params }; }); }
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'suggest' && layout) { suggestions = suggestLayouts(layout.surface, layout.tile, spec().params); renderRight(); }
    if (a === 'delete') { const id = spec().id; commit(p => { p.tiles = p.tiles.filter(t => t.id !== id); }); S.ui.tileSpec = null; suggestions = null; renderAll(); }
    if (a === 'pdf') exportPdf();
  });
  host.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.sp) updateSpec(sp => { const k = t.dataset.sp; if (k === 'productId') { sp.productId = t.value; const pr = productById(P(), t.value); if (pr?.shape === 'hex') sp.params.pattern = 'hex'; else if (sp.params.pattern === 'hex') sp.params.pattern = 'straight'; } else sp.params[k] = ['pattern', 'start', 'visibleSide'].includes(k) ? t.value : Number(t.value); if (k === 'pattern') delete sp.params.waste; });
    if (t.dataset.surf) updateSpec(sp => { sp.surface[t.dataset.surf] = t.checked; });
  });
  // Ручной сдвиг сетки перетаскиванием и декор-вставки кликом
  stage.addEventListener('pointerdown', e => {
    const svg = e.target.closest('[data-schema]'); if (!svg || !layout) return;
    const m = svg.getScreenCTM().inverse(); const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
    drag = { svg, m, x: pt.x, y: pt.y, ox: spec().params.offsetX || 0, oy: spec().params.offsetY || 0, moved: false, tile: e.target.dataset.tile };
    svg.setPointerCapture(e.pointerId); beginGesture();
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(drag.m);
    const dx = Math.round((pt.x - drag.x) / 5) * 5, dy = Math.round((pt.y - drag.y) / 5) * 5;
    if (Math.abs(dx) + Math.abs(dy) < 10 && !drag.moved) return;
    drag.moved = true;
    const sp = spec(); sp.params.offsetX = drag.ox + dx; sp.params.offsetY = drag.oy + dy;
    compute(); renderStage();
  });
  stage.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved && d.tile) { const sp = spec(); const set = new Set(sp.params.decor || []); set.has(d.tile) ? set.delete(d.tile) : set.add(d.tile); sp.params.decor = [...set]; sp.decorProduct ||= 'tile-decor-insert'; }
    else if (d.moved) spec().origin = 'user';
    endGesture();
  });

  function exportPdf() {
    const { surface, result, product } = layout; const p = P();
    const svg = stage.querySelector('[data-schema]').outerHTML.replace(/var\(--muted\)/g, '#7b7569');
    printDocument('Раскладка плитки', `<h1>Раскладка плитки</h1><div class="muted">${esc(p.name)} · ${esc(surface.title)} · ${new Date().toLocaleDateString('ru-RU')}</div>
      <div class="box">${svg}</div>
      <table><tr><th>Плитка</th><td>${esc(product.name)} (${product.dims.w}×${product.dims.d} мм)</td></tr><tr><th>Рисунок / старт</th><td>${PATTERNS[result.params.pattern]?.name} · ${STARTS[result.params.start]} · шов ${result.params.joint} мм</td></tr>
      <tr><th>Площадь</th><td>${result.areaM2.toFixed(2)} м²</td></tr><tr><th>Целых / подрезанных</th><td>${result.whole} / ${result.cutCount}</td></tr><tr><th>К покупке</th><td><b>${result.totalPcs} шт</b> (запас ${result.waste}%)${result.packs ? `, ${result.packs} уп.` : ''}</td></tr>
      <tr><th>Клей</th><td>${result.adhesiveKg.toFixed(0)} кг (${result.adhesiveBags} меш. по 25 кг)</td></tr><tr><th>Затирка</th><td>${result.groutKg.toFixed(1)} кг (${result.groutPacks} уп. по 2 кг)</td></tr></table>
      <h2>Нумерованные ряды и подрезки</h2><table><tr><th>Ряд</th><th class="n">Целых</th><th>Подрезки (кол-во × Ш×В, мм)</th></tr>${result.rows.map(r => `<tr><td>${r.no}</td><td class="n">${r.whole}</td><td>${r.cuts.map(c => `${c.n} × ${c.size}`).join(', ') || '—'}</td></tr>`).join('')}</table>
      <h2>Сводка подрезок</h2><table><tr><th>Размер, мм</th><th class="n">Кол-во</th></tr>${result.cutList.map(c => `<tr><td>${c.size}</td><td class="n">${c.n}</td></tr>`).join('')}</table>
      ${result.warnings.length ? `<h2>Предупреждения</h2><ul>${result.warnings.map(w => `<li>${esc(w.text)}</li>`).join('')}</ul>` : ''}`);
  }

  renderAll();
  return { update(what) { if (what === 'server' || drag) return; renderAll(); }, destroy() {} };
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v * (1 + k))));
  return '#' + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
}
