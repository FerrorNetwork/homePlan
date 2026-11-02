// Общие помощники интерфейса: экранирование, форматы, иконки, тосты, модальные окна, миниатюры товаров.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(Number(n) || 0)) + ' ₽';
export const num = (n, d = 1) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(Number(n) || 0);
export const dateRu = d => d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const dateTimeRu = d => d ? new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many; };

const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  plan: 'M4 4h16v16H4zM4 10h7M11 4v10M15 14h5M15 10v10',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.9 1.2-1.7-.4-.9.2-1.8 1.2-1.8H17a4 4 0 0 0 4-4c0-5-4-10.5-9-10.5zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01M17 11.5h.01',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  cart: 'M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6.2M9 20.5h.01M17 20.5h.01',
  calc: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cube: 'M12 2l9 5v10l-9 5-9-5V7zM12 22V12M21 7l-9 5-9-5',
  walk: 'M13 4.5a1.5 1.5 0 1 0 0-.01M9 21l2-6 3 3v3M7 12l3-4 4 1 2 4M11 15l-1-4',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16',
  wall: 'M3 6h18v12H3zM3 12h18M8 6v6M16 6v6M12 12v6',
  door: 'M5 21V4a1 1 0 0 1 1-1h9l4 2v16M5 21h14M12 12h.01',
  window: 'M4 4h16v16H4zM12 4v16M4 12h16',
  room: 'M4 4h16v16H4z',
  cursor: 'M5 3l13 8-6 1.5L9 19z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5h.01',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  chevron: 'M9 6l6 6-6 6', chevronDown: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  chat: 'M4 5h16v11H8l-4 4z',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  tile: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  camera: 'M4 8h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  arrowRight: 'M5 12h14M13 6l6 6-6 6', arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  stairs: 'M3 21h5v-5h5v-5h5V6h3',
  column: 'M8 3h8v18H8zM6 3h12M6 21h12',
  pipe: 'M4 8h10a4 4 0 0 1 4 4v8M4 12h10M14 20h8',
  fire: 'M12 22c4 0 7-3 7-7 0-4-3-6-4-9-2 2-2 4-3 5-1-2-1-4-3-6-1 4-4 6-4 10 0 4 3 7 7 7z',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7',
  drop: 'M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z',
  socket: 'M5 5h14v14H5zM9.5 11v.01M14.5 11v.01M12 15v.01',
  print: 'M6 9V3h12v6M6 18H4v-8h16v8h-2M8 14h8v7H8z',
  star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  menu: 'M4 6h16M4 12h16M4 18h16',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
};
export const icon = (name, size = 18, cls = '') => `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || P.info}"/></svg>`;

let toastTimer;
export function toast(text, kind = '') {
  const el = document.getElementById('toast');
  el.className = 'toast show ' + kind; el.textContent = text;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// Модальное окно. content — HTML; buttons — [{label, value, primary, danger}]. Возвращает Promise со значением кнопки и данными формы.
export function modal({ title, content = '', buttons = [{ label: 'Закрыть', value: null }], wide = false, onMount }) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Закрыть">${icon('close')}</button></header>
      <form class="modal-body" novalidate>${content}</form>
      <footer>${buttons.map((b, i) => `<button type="button" class="btn ${b.primary ? 'primary' : ''} ${b.danger ? 'danger' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</footer></div>`;
    document.body.append(wrap);
    const form = wrap.querySelector('form');
    const close = value => { wrap.remove(); document.removeEventListener('keydown', onKey); resolve(value); };
    const data = () => Object.fromEntries([...form.elements].filter(e => e.name && (e.type !== 'radio' || e.checked)).map(e => [e.name, e.type === 'checkbox' ? e.checked : e.value]));
    const onKey = e => { if (e.key === 'Escape') close({ value: null }); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) return close({ value: null });
      const b = e.target.closest('footer [data-i]');
      if (b) { const btn = buttons[+b.dataset.i]; if (btn.primary && !form.reportValidity()) return; close({ value: btn.value, data: data() }); }
    });
    form.addEventListener('submit', e => { e.preventDefault(); const pb = buttons.find(b => b.primary); if (pb && form.reportValidity()) close({ value: pb.value, data: data() }); });
    onMount?.(wrap, close);
    setTimeout(() => (form.querySelector('input,select,textarea') || wrap.querySelector('footer .primary'))?.focus(), 30);
  });
}

export async function confirmDialog(title, text, okLabel = 'Подтвердить', danger = false) {
  const r = await modal({ title, content: `<p>${esc(text)}</p>`, buttons: [{ label: 'Отмена', value: false }, { label: okLabel, value: true, primary: !danger, danger }] });
  return r.value === true;
}

// Миниатюра товара: нарисованная пиктограмма в цвете товара (фото поставщика подключается из фида).
export function thumb(product, size = 56) {
  if (product?.picture) return `<img class="thumb" src="${esc(product.picture)}" width="${size}" height="${size}" alt="" loading="lazy">`;
  const c = product?.color || '#cfc8bb', k = product?.kind || 'decor';
  const dark = '#3b3934';
  const shapes = {
    sofa: `<rect x="10" y="30" width="60" height="22" rx="6" fill="${c}"/><rect x="14" y="20" width="52" height="16" rx="5" fill="${c}" opacity=".85"/><rect x="8" y="28" width="9" height="24" rx="4" fill="${c}"/><rect x="63" y="28" width="9" height="24" rx="4" fill="${c}"/><path d="M14 52v6M66 52v6" stroke="${dark}" stroke-width="2.5"/>`,
    'sofa-corner': `<path d="M10 22h24v18h36v16H10z" fill="${c}"/><path d="M10 22h24v8H10zM34 40h36v-6H34z" fill="${dark}" opacity=".12"/>`,
    armchair: `<rect x="22" y="18" width="36" height="22" rx="8" fill="${c}"/><rect x="18" y="34" width="44" height="18" rx="6" fill="${c}"/><path d="M24 52v8M56 52v8" stroke="${dark}" stroke-width="2.5"/>`,
    'coffee-table': `<ellipse cx="40" cy="38" rx="26" ry="9" fill="${c}"/><path d="M24 42l-3 16M56 42l3 16M40 47v12" stroke="${dark}" stroke-width="2.5"/>`,
    'dining-table': `<rect x="10" y="28" width="60" height="7" rx="2" fill="${c}"/><path d="M16 35v24M64 35v24" stroke="${dark}" stroke-width="3"/>`,
    desk: `<rect x="10" y="28" width="60" height="7" rx="2" fill="${c}"/><rect x="48" y="35" width="18" height="22" fill="${c}" opacity=".8"/><path d="M14 35v24" stroke="${dark}" stroke-width="3"/>`,
    chair: `<rect x="28" y="14" width="24" height="22" rx="3" fill="${c}"/><rect x="26" y="36" width="28" height="7" rx="2" fill="${c}"/><path d="M29 43v17M51 43v17" stroke="${dark}" stroke-width="2.5"/>`,
    'office-chair': `<rect x="27" y="12" width="26" height="24" rx="6" fill="${c}"/><rect x="24" y="38" width="32" height="7" rx="3" fill="${c}"/><path d="M40 45v10M28 62l12-7 12 7" stroke="${dark}" stroke-width="2.5"/>`,
    bed: `<rect x="10" y="20" width="60" height="16" rx="4" fill="${c}"/><rect x="10" y="34" width="60" height="18" rx="3" fill="#f4f1ea"/><rect x="16" y="28" width="20" height="9" rx="3" fill="#fff"/><rect x="44" y="28" width="20" height="9" rx="3" fill="#fff"/><rect x="10" y="50" width="60" height="6" fill="${c}"/>`,
    nightstand: `<rect x="24" y="24" width="32" height="30" rx="3" fill="${c}"/><path d="M24 39h32M38 31h4M38 46h4" stroke="${dark}" stroke-width="1.5"/>`,
    wardrobe: `<rect x="18" y="8" width="44" height="58" rx="2" fill="${c}"/><path d="M40 8v58M36 36v6M44 36v6" stroke="${dark}" stroke-width="1.5"/>`,
    dresser: `<rect x="14" y="22" width="52" height="36" rx="2" fill="${c}"/><path d="M14 31h52M14 40h52M14 49h52" stroke="${dark}" stroke-width="1.2" opacity=".6"/>`,
    bookshelf: `<rect x="20" y="8" width="40" height="60" fill="none" stroke="${c}" stroke-width="4"/><path d="M20 23h40M20 38h40M20 53h40" stroke="${c}" stroke-width="3"/><rect x="25" y="13" width="5" height="10" fill="${dark}" opacity=".5"/><rect x="33" y="43" width="12" height="10" fill="${dark}" opacity=".35"/>`,
    'tv-stand': `<rect x="10" y="40" width="60" height="16" rx="2" fill="${c}"/><rect x="18" y="14" width="44" height="24" rx="2" fill="${dark}"/>`,
    'kitchen-set': `<rect x="8" y="34" width="64" height="26" fill="${c}"/><rect x="8" y="10" width="64" height="16" fill="${c}" opacity=".85"/><path d="M8 38h64M24 38v22M40 38v22M56 38v22" stroke="${dark}" stroke-width="1.2" opacity=".5"/>`,
    fridge: `<rect x="24" y="6" width="32" height="62" rx="4" fill="${c}" stroke="#b9b4aa"/><path d="M24 28h32M50 14v8M50 34v10" stroke="${dark}" stroke-width="2"/>`,
    bath: `<path d="M10 34h60v8a14 14 0 0 1-14 14H24a14 14 0 0 1-14-14z" fill="${c}" stroke="#b9c7cc"/><path d="M16 24v10M16 24h6" stroke="${dark}" stroke-width="2"/>`,
    shower: `<rect x="18" y="10" width="44" height="54" fill="${c}" stroke="#9fb6bd" stroke-width="2"/><path d="M28 16h10M33 16v6" stroke="${dark}" stroke-width="2"/>`,
    vanity: `<rect x="18" y="34" width="44" height="26" fill="${c}"/><ellipse cx="40" cy="32" rx="20" ry="5" fill="#fff" stroke="#b9c7cc"/><path d="M40 20v8" stroke="${dark}" stroke-width="2"/>`,
    toilet: `<rect x="28" y="12" width="24" height="16" rx="3" fill="${c}" stroke="#c3c9cc"/><path d="M26 30h28c0 14-6 22-14 22s-14-8-14-22z" fill="${c}" stroke="#c3c9cc"/>`,
    washer: `<rect x="20" y="10" width="40" height="54" rx="3" fill="${c}" stroke="#c3c9cc"/><circle cx="40" cy="40" r="13" fill="#dfe8ec" stroke="${dark}" stroke-width="1.5"/>`,
    mirror: `<circle cx="40" cy="36" r="22" fill="#e3ecef" stroke="${c}" stroke-width="3"/>`,
    pendant: `<path d="M40 6v20" stroke="${dark}" stroke-width="1.5"/><path d="M24 44a16 16 0 0 1 32 0z" fill="${c}"/><circle cx="40" cy="47" r="4" fill="#ffd77a"/>`,
    'ceiling-light': `<ellipse cx="40" cy="30" rx="26" ry="8" fill="${c}" stroke="#d6d1c6"/><path d="M24 44l-6 10M40 46v12M56 44l6 10" stroke="#e9b74a" stroke-width="2" opacity=".7"/>`,
    track: `<rect x="8" y="20" width="64" height="5" rx="2" fill="${c}"/><rect x="16" y="25" width="8" height="12" rx="2" fill="${c}"/><rect x="36" y="25" width="8" height="12" rx="2" fill="${c}"/><rect x="56" y="25" width="8" height="12" rx="2" fill="${c}"/>`,
    'floor-lamp': `<path d="M30 22h20l6 16H24z" fill="${c}"/><path d="M40 38v26M30 64h20" stroke="${dark}" stroke-width="2.5"/>`,
    sconce: `<path d="M30 30h20l-4 14H34z" fill="${c}"/><path d="M40 44v6M34 50h12" stroke="${dark}" stroke-width="2"/>`,
    rug: `<rect x="10" y="20" width="60" height="40" rx="3" fill="${c}"/><rect x="16" y="26" width="48" height="28" rx="2" fill="none" stroke="#fff" stroke-width="1.5" opacity=".6"/>`,
    curtains: `<path d="M12 10h56" stroke="${dark}" stroke-width="2"/><path d="M14 12c4 16-2 34 2 54h16c-4-20 2-38-2-54zM66 12c-4 16 2 34-2 54H48c4-20-2-38 2-54z" fill="${c}"/>`,
    plant: `<path d="M30 48h20l-3 18H33z" fill="#b98a62"/><path d="M40 48c-14-6-18-22-10-32 4 10 10 14 10 32zM40 48c14-6 18-22 10-32-4 10-10 14-10 32zM40 48c0-12 0-22 0-34" fill="${c}" stroke="${c}"/>`,
    decor: `<path d="M28 60c-6-12 0-20 4-26V20h8v14c4 6 10 14 4 26z" fill="${c}"/><path d="M48 60c-3-8 0-14 2-18v-8h6v8c2 4 5 10 2 18z" fill="${c}" opacity=".7"/>`,
    'tile-floor': `<g fill="${c}" stroke="#fff" stroke-width="2"><rect x="10" y="10" width="30" height="30"/><rect x="40" y="10" width="30" height="30"/><rect x="10" y="40" width="30" height="30"/><rect x="40" y="40" width="30" height="30"/></g>`,
    'tile-wall': `<g fill="${c}" stroke="#fff" stroke-width="2"><rect x="8" y="12" width="32" height="14"/><rect x="40" y="12" width="32" height="14"/><rect x="24" y="26" width="32" height="14"/><rect x="8" y="40" width="16" height="14"/><rect x="56" y="26" width="16" height="14"/><rect x="24" y="54" width="32" height="14"/><rect x="40" y="40" width="32" height="14"/><rect x="8" y="26" width="16" height="14"/></g>`,
    'tile-decor': `<rect x="14" y="14" width="52" height="52" fill="${c}"/><path d="M40 20l18 20-18 20-18-20z" fill="#fff" opacity=".6"/>`,
    'floor-covering': `<g fill="${c}" stroke="#fff" stroke-width="1.6"><rect x="8" y="12" width="40" height="11"/><rect x="48" y="12" width="24" height="11"/><rect x="8" y="23" width="22" height="11"/><rect x="30" y="23" width="42" height="11"/><rect x="8" y="34" width="34" height="11"/><rect x="42" y="34" width="30" height="11"/><rect x="8" y="45" width="48" height="11"/><rect x="56" y="45" width="16" height="11"/></g>`,
    paint: `<path d="M22 22h36v38a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4z" fill="#dcd8d0"/><rect x="22" y="30" width="36" height="20" fill="${c}"/><path d="M20 22h40" stroke="${dark}" stroke-width="2"/>`,
    wallpaper: `<rect x="16" y="10" width="34" height="54" fill="${c}"/><circle cx="50" cy="20" r="10" fill="${c}" stroke="#bbb"/><path d="M22 20l6 6M34 32l6 6M22 44l6 6" stroke="#fff" opacity=".6" stroke-width="2"/>`,
    door: `<rect x="24" y="6" width="32" height="62" fill="${c}" stroke="#bdb6a8"/><circle cx="50" cy="38" r="2" fill="${dark}"/><rect x="29" y="12" width="22" height="22" fill="none" stroke="#000" opacity=".1"/>`,
    socket: `<rect x="20" y="20" width="40" height="40" rx="6" fill="${c}" stroke="#bbb"/><circle cx="40" cy="40" r="12" fill="none" stroke="#999"/><circle cx="35" cy="40" r="2" fill="#555"/><circle cx="45" cy="40" r="2" fill="#555"/>`,
    switch: `<rect x="20" y="20" width="40" height="40" rx="6" fill="${c}" stroke="#bbb"/><rect x="30" y="26" width="20" height="28" rx="3" fill="#eee" stroke="#aaa"/>`,
    'shoe-cabinet': `<rect x="14" y="24" width="52" height="38" fill="${c}"/><path d="M31 24v38M48 24v38" stroke="${dark}" stroke-width="1.3" opacity=".5"/>`,
    'coat-rack': `<path d="M18 14h44M22 14v52M58 14v52M18 46h44" stroke="${c}" stroke-width="4"/><path d="M30 14v10M40 14v12M50 14v10" stroke="${dark}" stroke-width="2"/>`,
  };
  return `<svg class="thumb" width="${size}" height="${size}" viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" rx="12" fill="var(--thumb-bg)"/>${shapes[k] || shapes.decor}</svg>`;
}

export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

export function readFileAsDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
export function readFileAsText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }

export async function downscaleImage(file, maxSide = 900, quality = 0.82) {
  const url = await readFileAsDataURL(file);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const k = Math.min(1, maxSide / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
