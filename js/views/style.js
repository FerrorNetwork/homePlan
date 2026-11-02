// Шаг 3. Стиль: готовые стили, описание, референсы с разбором до генерации, параметры, комнаты и приоритеты.
import { S, commit } from '../store.js';
import { completeStep } from '../main.js';
import { esc, icon, toast, num, money, downscaleImage } from '../ui.js';
import { STYLES, styleById } from '../data/styles.js';
import { paletteFromImage, interpret } from '../core/analysis.js';
import { roomMetrics } from '../core/model.js';
import { api, uploadImage } from '../api.js';

const MAX_REFS = 20, MAX_SIZE = 10 * 1024 * 1024, TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function mount(el) {
  let busy = false;
  function render() {
    const p = S.project, b = p.brief;
    const st = styleById(b.style);
    const a = b.analysis;
    const prov = S.server.providers || {};
    el.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="eyebrow">Шаг 3 из 6</div><h1>Стиль и пожелания</h1><p>Выберите готовый стиль или опишите свой и загрузите референсы. Перед генерацией вы увидите, как система поняла ваши примеры.</p></div></div>

      <div class="card" style="margin-bottom:16px"><div class="card-head"><div><h3>Готовые стили</h3><p>${STYLES.length} стилей: у каждого палитра, материалы и правила расстановки</p></div></div>
        <div class="style-grid">${STYLES.map(s => `<button class="style-card ${b.style === s.id ? 'on' : ''}" data-style="${s.id}"><div class="sw">${s.palette.map(c => `<i style="background:${c}"></i>`).join('')}</div><div class="body"><b>${s.name}</b><small>${s.mood}</small></div></button>`).join('')}</div>
        <div class="notice accent" style="margin-top:14px">${icon('palette')}<div><b>${st.name}.</b> Материалы: ${st.materials.join(', ')}. Мебель: ${st.furniture.join(', ')}.<br>Правила: ${st.rules.join('; ')}.</div></div>
      </div>

      <div class="grid2" style="align-items:start;gap:16px">
        <div class="stack loose">
          <div class="card"><div class="card-head"><div><h3>Своё описание</h3><p>Свободным текстом: настроение, материалы, чего избегать</p></div></div>
            <textarea class="input" data-b="prompt" rows="3" placeholder="Например: светлая кухня-гостиная, дерево и чёрный металл, без глянца">${esc(b.prompt)}</textarea></div>

          <div class="card"><div class="card-head"><div><h3>Референсы</h3><p>1–20 изображений JPG, PNG или WebP до 10 МБ</p></div><span class="badge">${b.references.length}/${MAX_REFS}</span></div>
            <div class="refs">${b.references.map((r, i) => `<div class="ref"><img src="${esc(r.url)}" alt="Референс ${i + 1}"><button data-del-ref="${i}" aria-label="Удалить">${icon('close', 14)}</button></div>`).join('')}
              ${b.references.length < MAX_REFS ? `<label class="dropzone" data-drop>${icon('upload', 20)}<span>Добавить<br>фото</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden data-refs></label>` : ''}</div>
            <label class="check small" style="margin-top:12px"><input type="checkbox" data-b="consent" ${b.consent ? 'checked' : ''}> Разрешаю передать изображения сервису подбора для анализа</label>
            <div class="row wrap" style="margin-top:12px"><button class="btn" data-act="analyze" ${busy || (!b.references.length && !b.prompt) ? 'disabled' : ''}>${icon('sparkles', 15)} ${busy ? 'Анализирую…' : 'Разобрать референсы и текст'}</button></div>
          </div>

          ${a ? `<div class="understood"><div class="row between" style="margin-bottom:10px"><h3>Как система поняла ваши примеры</h3><span class="badge ${a.confirmed ? 'ok' : 'warn'}">${a.confirmed ? 'подтверждено' : 'нужно подтвердить'}</span></div>
            <div class="stack tight small">
              <div class="row"><span class="muted" style="width:110px">Палитра</span><div class="row" style="gap:4px">${a.palette.map(c => `<span class="swatch" style="background:${c}" title="${c}"></span>`).join('')}</div></div>
              <div class="row"><span class="muted" style="width:110px;flex:none">Настроение</span><span>${esc(a.mood)}</span></div>
              <div class="row"><span class="muted" style="width:110px;flex:none">Материалы</span><input class="input sm" data-an="materials" value="${esc(a.materials.join(', '))}"></div>
              <div class="row"><span class="muted" style="width:110px;flex:none">Типы мебели</span><input class="input sm" data-an="furniture" value="${esc((a.furniture || []).join(', '))}" placeholder="не определено"></div>
              <div class="row"><span class="muted" style="width:110px;flex:none">Ближе всего</span><span><b>${esc(styleById(a.styleId).name)}</b>${a.styleAlt?.length ? ` · также ${a.styleAlt.map(x => styleById(x).name).join(', ')}` : ''}</span></div>
              <div class="tiny muted">Источник: ${a.source === 'local' ? 'анализ цвета и текста на устройстве' : 'расширенный анализ на сервере'}</div>
            </div>
            <div class="row wrap" style="margin-top:12px">${!a.confirmed ? `<button class="btn primary sm" data-act="confirm">${icon('check', 14)} Верно, учитывать</button>` : ''}${a.styleId !== b.style ? `<button class="btn sm" data-act="apply-style">Выбрать стиль «${esc(styleById(a.styleId).name)}»</button>` : ''}<button class="btn sm ghost" data-act="drop-analysis">Сбросить</button></div></div>` : ''}
        </div>

        <div class="stack loose">
          <div class="card"><div class="card-head"><div><h3>Параметры</h3><p>Учитываются при подборе</p></div></div><div class="stack">
            <label class="field"><span>Бюджет на мебель и отделку, ₽</span><input class="input num" type="number" min="0" step="10000" data-b="budget" value="${b.budget}"><small>${money(b.budget)} · на мебель ориентируемся на 55%</small></label>
            <div class="grid2"><label class="field"><span>Жильцов</span><input class="input num" type="number" min="1" max="12" data-b="occupants" value="${b.occupants}"></label>
              <div class="field"><span>&nbsp;</span><label class="check"><input type="checkbox" data-b="children" ${b.children ? 'checked' : ''}> Есть дети</label><label class="check"><input type="checkbox" data-b="pets" ${b.pets ? 'checked' : ''}> Есть животные</label></div></div>
            <label class="field"><span>Обязательные предметы</span><input class="input" data-b="mustHave" value="${esc(b.mustHave)}" placeholder="рабочий стол, угловой диван"></label>
            <label class="field"><span>Запрещённые материалы и цвета</span><input class="input" data-b="avoid" value="${esc(b.avoid)}" placeholder="глянец, бархат"></label>
            <label class="check"><input type="checkbox" data-b="decor" ${b.decor ? 'checked' : ''}> Добавлять декор, текстиль и растения</label>
          </div></div>

          <div class="card"><div class="card-head"><div><h3>Комнаты для дизайна</h3><p>Приоритет 1 — подбирается первым и получает лучший бюджет</p></div></div>
            <div class="stack tight">${p.rooms.map(r => { const rr = b.rooms[r.id] || {}; return `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><label class="check" style="flex:1"><input type="checkbox" data-room-inc="${r.id}" ${rr.include !== false ? 'checked' : ''}> <b>${esc(r.name)}</b> <span class="muted small">${num(roomMetrics(p, r).area, 1)} м²</span></label>
              <div class="seg sm">${[1, 2, 3].map(n => `<button class="${(rr.priority || 2) === n ? 'on' : ''}" data-room-pr="${r.id}" data-n="${n}">${n}</button>`).join('')}</div></div>`; }).join('')}</div></div>

          <div class="card"><div class="card-head"><div><h3>Режим подбора</h3><p>Товары берутся только из каталога; расстановку проверяют правила эргономики</p></div></div>
            <div class="stack tight">${[['local', 'Базовый подбор', 'работает без интернета, прямо в браузере', true], ['gemini', 'Расширенный подбор · сервер 1', prov.gemini ? 'учитывает фото-референсы и текст пожеланий' : 'не подключён на сервере', !!prov.gemini], ['openai', 'Расширенный подбор · сервер 2', prov.openai ? 'резервный сервер расширенного подбора' : 'не подключён на сервере', !!prov.openai]].map(([k, n, d, ok]) => `<label class="list-btn ${b.provider === k ? 'on' : ''}" style="cursor:${ok ? 'pointer' : 'not-allowed'};opacity:${ok ? 1 : .55}"><input type="radio" name="prov" value="${k}" ${b.provider === k ? 'checked' : ''} ${ok ? '' : 'disabled'} data-prov style="accent-color:var(--accent)"><span><b>${n}</b><small>${d}</small></span></label>`).join('')}</div></div>
        </div>
      </div>
      <div class="row end" style="margin-top:24px"><button class="btn primary lg" data-act="complete">Сохранить и перейти к дизайну ${icon('arrowRight', 16)}</button></div>
    </div>`;
  }

  async function addFiles(files) {
    const b = S.project.brief;
    const list = [...files];
    const room = MAX_REFS - b.references.length;
    if (list.length > room) toast(`Можно добавить ещё ${room}`);
    const added = [];
    for (const f of list.slice(0, room)) {
      if (!TYPES.includes(f.type)) { toast(`${f.name}: поддерживаются JPG, PNG, WebP`, 'err'); continue; }
      if (f.size > MAX_SIZE) { toast(`${f.name}: больше 10 МБ`, 'err'); continue; }
      let url = null, id = null;
      if (S.server.online && S.user) { try { const up = await uploadImage(f); url = up.url; id = up.id; } catch (e) { toast(e.message, 'err'); } }
      if (!url) url = await downscaleImage(f, 640, 0.8);
      added.push({ id, url, name: f.name });
    }
    if (added.length) commit(p => { p.brief.references.push(...added); p.brief.analysis = null; });
  }

  async function analyze() {
    const b = S.project.brief;
    busy = true; render();
    try {
      let result = null;
      if (b.provider !== 'local' && S.server.online && S.server.providers?.[b.provider]) {
        if (b.references.length && !b.consent) { toast('Отметьте согласие на передачу изображений провайдеру', 'err'); return; }
        try {
          const r = await api(`/api/analyze/${b.provider}`, { method: 'POST', timeout: 120000, body: { prompt: b.prompt, references: b.consent ? b.references.map(x => x.id).filter(Boolean) : [], styles: STYLES.map(s => ({ id: s.id, name: s.name })) } });
          result = { ...r, source: 'расширенный анализ' };
        } catch (e) { toast('Расширенный анализ недоступен: ' + e.message + '. Выполняю базовый.'); }
      }
      if (!result) {
        const pals = [];
        for (const r of b.references) { try { pals.push(await paletteFromImage(r.url)); } catch {} }
        result = interpret(pals, b.prompt);
      }
      commit(p => { p.brief.analysis = { ...result, confirmed: false }; if (result.avoid?.length && !p.brief.avoid) p.brief.avoid = result.avoid.join(', '); });
    } finally { busy = false; render(); }
  }

  el.addEventListener('click', e => {
    const s = e.target.closest('[data-style]'); if (s) return commit(p => { p.brief.style = s.dataset.style; });
    const d = e.target.closest('[data-del-ref]'); if (d) return commit(p => { p.brief.references.splice(+d.dataset.delRef, 1); p.brief.analysis = null; });
    const pr = e.target.closest('[data-room-pr]'); if (pr) return commit(p => { p.brief.rooms[pr.dataset.roomPr] = { ...(p.brief.rooms[pr.dataset.roomPr] || {}), priority: +pr.dataset.n }; });
    const a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'analyze') analyze();
    if (a === 'confirm') commit(p => { p.brief.analysis.confirmed = true; });
    if (a === 'apply-style') commit(p => { p.brief.style = p.brief.analysis.styleId; });
    if (a === 'drop-analysis') commit(p => { p.brief.analysis = null; });
    if (a === 'complete') {
      const b = S.project.brief;
      if (b.analysis && !b.analysis.confirmed) return toast('Подтвердите разбор референсов или сбросьте его');
      if (!S.project.rooms.some(r => b.rooms[r.id]?.include !== false)) return toast('Выберите хотя бы одну комнату');
      completeStep('style');
    }
  });
  el.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.b) commit(p => { const k = t.dataset.b; p.brief[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Number(t.value) || 0 : t.value; });
    if (t.dataset.an) commit(p => { p.brief.analysis[t.dataset.an] = t.value.split(',').map(x => x.trim()).filter(Boolean); });
    if (t.dataset.roomInc) commit(p => { p.brief.rooms[t.dataset.roomInc] = { ...(p.brief.rooms[t.dataset.roomInc] || {}), include: t.checked }; });
    if (t.dataset.prov !== undefined && t.name === 'prov') commit(p => { p.brief.provider = t.value; p.brief.providerTouched = true; });
    if (t.dataset.refs !== undefined && t.files?.length) addFiles(t.files);
  });
  el.addEventListener('dragover', e => { const dz = e.target.closest('[data-drop]'); if (dz) { e.preventDefault(); dz.classList.add('over'); } });
  el.addEventListener('dragleave', e => e.target.closest('[data-drop]')?.classList.remove('over'));
  el.addEventListener('drop', e => { const dz = e.target.closest('[data-drop]'); if (dz) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
  render();
  return { update: what => { if (what === 'canvas') return; render(); } };
}
