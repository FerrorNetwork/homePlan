// Состояние приложения: текущий проект, история отмены (100 шагов), автосохранение, версии, пользователь.
import { createProject, migrate } from './core/model.js';
import { api } from './api.js';

const INDEX = 'dp.index', PREFIX = 'dp.project.', VERS = 'dp.versions.', CURRENT = 'dp.current', HIST = 'dp.history.';
const UNDO_LIMIT = 100;

const ls = {
  get(k, def = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export const S = {
  project: null,
  user: null,
  server: { online: false, providers: {} },
  saveState: 'saved', // saved | saving | local | error
  ui: { page: 'home', view: '2d', tool: 'select', selection: null, layerPanel: false },
  undo: [], redo: [],
  readOnly: false,
};

const listeners = new Set();
export const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const emit = (what = 'all') => listeners.forEach(fn => fn(what));

// ——— Проекты ———
export function projectIndex() { return ls.get(INDEX, []); }

function writeIndex(p) {
  const idx = projectIndex().filter(x => x.id !== p.id);
  idx.unshift({ id: p.id, name: p.name, city: p.city, updatedAt: p.updatedAt, area: p.rooms.reduce((s, r) => s + areaOf(r.poly), 0) });
  ls.set(INDEX, idx.slice(0, 50));
}
const areaOf = poly => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2e6; };

export function openProject(id) {
  const data = ls.get(PREFIX + id);
  if (!data) return false;
  S.project = migrate(data);
  S.undo = ls.get(HIST + id, []) || []; S.redo = [];
  ls.set(CURRENT, id);
  S.ui.selection = null;
  emit();
  return true;
}

export function newProject(opts) {
  const p = createProject(opts);
  const prov = S.server.providers || {};
  if (prov.gemini || prov.openai) p.brief.provider = prov.gemini ? 'gemini' : 'openai';
  S.project = p; S.undo = []; S.redo = [];
  persist(true);
  ls.set(CURRENT, p.id);
  emit();
  return p;
}

export function loadInitial() {
  const id = ls.get(CURRENT);
  if (id && openProject(id)) return;
  // Перенос проекта из первой версии MVP
  const legacy = ls.get('domproekt.mvp.v1');
  if (legacy) { S.project = migrate(legacy); persist(true); ls.set(CURRENT, S.project.id); return; }
  const idx = projectIndex();
  if (idx[0] && openProject(idx[0].id)) return;
  S.project = null;
}

export function deleteProject(id) {
  ls.del(PREFIX + id); ls.del(VERS + id); ls.del(HIST + id);
  ls.set(INDEX, projectIndex().filter(x => x.id !== id));
  if (S.project?.id === id) { S.project = null; ls.del(CURRENT); }
  if (S.user) api(`/api/projects/${id}`, { method: 'DELETE' }).catch(() => {});
  emit();
}

export function duplicateProject(id) {
  const data = ls.get(PREFIX + id); if (!data) return;
  const copy = migrate(JSON.parse(JSON.stringify(data)));
  copy.id = 'prj-' + Math.random().toString(36).slice(2, 9); copy.name += ' (копия)'; copy.updatedAt = new Date().toISOString();
  ls.set(PREFIX + copy.id, copy); writeIndex(copy); emit();
}

// ——— Изменения и история ———
let saveTimer = null;
export function commit(mutator, { render = 'all' } = {}) {
  if (S.readOnly || !S.project) return;
  const before = JSON.stringify(S.project);
  mutator(S.project);
  const after = JSON.stringify(S.project);
  if (before === after) { emit(render); return; }
  pushUndo(before);
  S.project.updatedAt = new Date().toISOString();
  persist();
  emit(render);
}

function pushUndo(snapshot) {
  S.undo.push(snapshot); if (S.undo.length > UNDO_LIMIT) S.undo.shift();
  S.redo = [];
  saveHistorySoon();
}
let histTimer = null;
function saveHistorySoon() {
  clearTimeout(histTimer);
  histTimer = setTimeout(() => {
    // История хранится в localStorage; при нехватке места сохраняем укороченную
    let list = S.undo.slice();
    while (list.length && !ls.set(HIST + S.project.id, list)) list = list.slice(Math.ceil(list.length / 2));
  }, 600);
}

// Для перетаскивания: снимок берётся в начале жеста, в истории фиксируется один шаг.
let gesture = null;
export function beginGesture() { if (S.project && !S.readOnly) gesture = JSON.stringify(S.project); }
export function endGesture() {
  if (!gesture || !S.project) return;
  const now = JSON.stringify(S.project);
  if (now !== gesture) { pushUndo(gesture); S.project.updatedAt = new Date().toISOString(); persist(); }
  gesture = null;
  emit();
}

export function undo() {
  if (!S.undo.length) return false;
  S.redo.push(JSON.stringify(S.project));
  S.project = migrate(JSON.parse(S.undo.pop()));
  persist(); saveHistorySoon(); emit(); return true;
}
export function redo() {
  if (!S.redo.length) return false;
  S.undo.push(JSON.stringify(S.project));
  S.project = migrate(JSON.parse(S.redo.pop()));
  persist(); saveHistorySoon(); emit(); return true;
}

export function persist(immediate = false) {
  if (!S.project || S.readOnly) return;
  const ok = ls.set(PREFIX + S.project.id, S.project);
  writeIndex(S.project);
  S.saveState = ok ? (S.user ? 'saving' : 'local') : 'error';
  clearTimeout(saveTimer);
  const push = () => {
    if (!S.user) { emit('status'); return; }
    api(`/api/projects/${S.project.id}`, { method: 'PUT', body: S.project, timeout: 20000 })
      .then(() => { S.saveState = 'saved'; emit('status'); })
      .catch(() => { S.saveState = 'local'; emit('status'); });
  };
  if (immediate) push(); else saveTimer = setTimeout(push, 800);
  emit('status');
}

// ——— Версии (FR-7) ———
export function versions() { return ls.get(VERS + S.project?.id, []); }
export async function saveVersion(name) {
  const list = versions();
  const v = { id: 'v-' + Date.now().toString(36), name: name || `Версия ${list.length + 1}`, date: new Date().toISOString(), data: JSON.stringify(S.project) };
  list.unshift(v);
  let trimmed = list.slice(0, 30);
  while (trimmed.length > 1 && !ls.set(VERS + S.project.id, trimmed)) trimmed = trimmed.slice(0, -1);
  if (S.user) api(`/api/projects/${S.project.id}/versions`, { method: 'POST', body: { name: v.name, data: S.project } }).catch(() => {});
  emit();
  return v;
}
export function restoreVersion(id) {
  const v = versions().find(x => x.id === id); if (!v) return;
  commit(p => { const data = migrate(JSON.parse(v.data)); Object.keys(p).forEach(k => delete p[k]); Object.assign(p, data); });
}
export function deleteVersion(id) { ls.set(VERS + S.project.id, versions().filter(v => v.id !== id)); emit(); }

// ——— Пользователь ———
export async function refreshUser() {
  try { const r = await api('/api/auth/me', { timeout: 4000 }); S.user = r.user || null; } catch { S.user = null; }
  emit('status');
}
export async function syncFromServer() {
  if (!S.user) return;
  try {
    const list = await api('/api/projects');
    for (const meta of list.projects || []) {
      const local = ls.get(PREFIX + meta.id);
      if (!local || new Date(meta.updatedAt) > new Date(local.updatedAt)) {
        const full = await api(`/api/projects/${meta.id}`);
        ls.set(PREFIX + meta.id, migrate(full)); writeIndex(migrate(full));
      }
    }
    emit();
  } catch {}
}

// Гость: только планировка. Регистрация нужна для ИИ, сметы и сохранения на сервере (2 и 9.2 ТЗ).
export function can(feature) {
  if (!S.server.online) return true; // локальный режим без сервера
  if (S.user) return true;
  return !['ai', 'estimate', 'cloud', 'share'].includes(feature);
}

export { ls };
