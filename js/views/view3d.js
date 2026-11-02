// 3D-обзор и прогулка от первого лица (раздел 3, FR-25, FR-41). Модель строится из плана:
// стены с проёмами, отделка по комнатам, плитка текстурой, мебель — упрощённые модели по размерам карточки.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { S } from '../store.js';
import { openingGeometry, POINT_KINDS, SYSTEMS, WALL_TYPES, pointLayer, roomAt } from '../core/model.js';
import { productById } from '../core/catalog.js';
import { KIND_RULES } from '../core/rules.js';
import { surfaceFromSpec } from '../core/tiles.js';
import { dist, centroid, bbox, segmentsIntersect, projectOnSegment } from '../core/geometry.js';

const M = 0.001; // мм → м

export function createView3D(host, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light' || document.documentElement.dataset.theme === 'dark';
  scene.background = new THREE.Color(dark ? 0x191a17 : 0xf1eee7);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.49;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcabfae, 1.25));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  let world = new THREE.Group(); scene.add(world);
  let mode = 'orbit', center = new THREE.Vector3(), walls2d = [];
  const keys = new Set();
  let yaw = 0, pitch = 0, raf = 0, last = performance.now();
  const P = () => S.project;

  function size() { const w = host.clientWidth, h = host.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(size); ro.observe(host); size();

  function mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.85, metalness: 0.02, ...extra }); }
  function box(w, h, d, color, x, y, z, extra) { const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)), extra?.material || mat(color, extra)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; }

  function tileTexture(product, params) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#d9d4ca'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = product.color; g.fillRect(3, 3, 250, 250);
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(3, 3, 250, 60);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
    const tw = (product.dims.w + (params?.joint || 2)) * M, th = ((product.dims.d || product.dims.w) + (params?.joint || 2)) * M;
    t.userData = { tw, th };
    if (params?.pattern === 'diagonal') t.rotation = Math.PI / 4;
    return t;
  }

  function rebuild() {
    const p = P(); if (!p) return;
    scene.remove(world); world.traverse(o => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach(m => { m.map?.dispose(); m.dispose(); }); });
    world = new THREE.Group(); scene.add(world);
    const f = p.activeFloor;
    const design = opts.getDesign?.();
    const floorH = (p.floors.find(x => x.id === f)?.height || 2700);
    const L = p.layers;
    walls2d = [];
    // Полы
    for (const r of p.rooms.filter(r => r.floor === f)) {
      const shape = new THREE.Shape(r.poly.map(q => new THREE.Vector2(q.x * M, q.y * M)));
      const geo = new THREE.ShapeGeometry(shape); geo.rotateX(Math.PI / 2);
      const spec = p.tiles.find(t => t.surface.type === 'floor' && t.surface.roomId === r.id);
      const tp = spec && productById(p, spec.productId);
      let material;
      if (tp && L.finish) {
        const tex = tileTexture(tp, spec.params);
        const uv = geo.attributes.uv; const pos = geo.attributes.position;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tex.userData.tw, pos.getZ(i) / tex.userData.th);
        material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, side: THREE.DoubleSide });
      } else {
        const fid = design?.finishes?.[r.id]?.floor; const fp = fid && productById(p, fid);
        material = mat(L.finish && fp ? fp.color : '#d8cfbf', { side: THREE.DoubleSide, roughness: 0.75 });
      }
      const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; world.add(mesh);
      if (mode === 'walk') { const cg = new THREE.ShapeGeometry(shape); cg.rotateX(Math.PI / 2); const cm = new THREE.Mesh(cg, mat('#fbfaf7', { side: THREE.DoubleSide })); cm.position.y = (r.ceiling || floorH) * M; world.add(cm); }
    }
    // Стены с проёмами
    for (const w of p.walls.filter(w => w.floor === f && w.status !== 'demolish')) {
      const len = dist(w.a, w.b); if (len < 1) continue;
      const ang = Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
      const ops = p.openings.filter(o => o.wall === w.id).map(o => ({ o, s: o.offset - o.width / 2, e: o.offset + o.width / 2 })).sort((a, b) => a.s - b.s);
      const color = w.status === 'new' ? '#e9efe9' : w.type === 'bearing' ? '#e6e2da' : '#efece6';
      const segs = []; let cur = 0;
      for (const op of ops) { if (op.s > cur) segs.push([cur, op.s, 0, floorH]); cur = Math.max(cur, op.e);
        const top = (op.o.sill || 0) + op.o.height; if (top < floorH) segs.push([op.s, op.e, top, floorH]); if (op.o.sill > 0) segs.push([op.s, op.e, 0, op.o.sill]);
        if (op.o.kind === 'window' || op.o.kind === 'balcony') segs.push({ glass: true, s: op.s, e: op.e, z0: op.o.sill || 0, z1: top }); }
      if (cur < len) segs.push([cur, len, 0, floorH]);
      for (const sg of segs) {
        const glass = !Array.isArray(sg);
        const [s, e, z0, z1] = glass ? [sg.s, sg.e, sg.z0, sg.z1] : sg;
        const mid = (s + e) / 2;
        const cx = w.a.x + Math.cos(ang) * mid, cy = w.a.y + Math.sin(ang) * mid;
        const m = glass
          ? box((e - s) * M, (z1 - z0) * M, 0.02, '#a9cde0', cx * M, (z0 + z1) / 2 * M, cy * M, { transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1 })
          : box((e - s) * M, (z1 - z0) * M, w.thickness * M, color, cx * M, (z0 + z1) / 2 * M, cy * M);
        m.rotation.y = -ang; if (glass) m.castShadow = false;
        world.add(m);
      }
      walls2d.push({ w, ops });
    }
    // Отделка стен изнутри комнат: краска и плитка по раскладке
    if (L.finish) for (const r of p.rooms.filter(r => r.floor === f)) {
      const paintId = design?.finishes?.[r.id]?.walls; const paint = paintId && productById(p, paintId);
      r.poly.forEach((a, i) => {
        const b = r.poly[(i + 1) % r.poly.length];
        const panels = [];
        const tileSpecs = p.tiles.filter(t => t.surface.type === 'wall' && t.surface.roomId === r.id && t.surface.edge === i);
        if (paint) panels.push({ from: 0, to: r.ceiling || floorH, color: paint.color });
        for (const t of tileSpecs) { const tp = productById(p, t.productId); if (tp) panels.push({ from: t.surface.from ?? 0, to: t.surface.to ?? (r.ceiling || floorH), product: tp, params: t.params }); }
        for (const pn of panels) addPanel(p, r, i, a, b, pn);
      });
    }
    // Мебель
    if (design && L.furniture) for (const pl of design.placements) {
      const room = p.rooms.find(x => x.id === pl.roomId); if (!room || room.floor !== f) continue;
      const g = furniture(pl, productById(p, pl.productId), room.ceiling || floorH);
      if (g) world.add(g);
    }
    // Инженерия
    for (const pt of p.points.filter(x => x.floor === f)) {
      if (!L[pointLayer(pt.kind)]) continue;
      const g = pointObject(p, pt, floorH);
      if (g) world.add(g);
    }
    for (const r of p.routes.filter(x => x.floor === f)) {
      if (!L[SYSTEMS[r.system]?.layer]) continue;
      const y = (r.via === 'ceiling' ? floorH - 30 : r.via === 'floor' || r.system === 'sewer' || r.system === 'electric' ? 15 : 320) * M; // кабель по стене — в стяжке/штробе у пола
      const pts = r.path.map(q => new THREE.Vector3(q.x * M, y, q.y * M));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]; const len = a.distanceTo(b); if (len < 0.01) continue;
        const rad = r.system === 'sewer' ? 0.03 : r.system === 'vent' ? 0.05 : r.system === 'electric' ? 0.006 : 0.012;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 8), mat(SYSTEMS[r.system].color));
        c.position.copy(a).add(b).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        world.add(c);
      }
    }
    // Камера и свет
    const pts = p.rooms.filter(r => r.floor === f).flatMap(r => r.poly);
    const bb = pts.length ? bbox(pts) : { center: { x: 5000, y: 3000 }, w: 10000, h: 6000 };
    center.set(bb.center.x * M, 0, bb.center.y * M);
    sun.position.set(center.x + 6, 12, center.z + 4); sun.target.position.copy(center);
    const ext = Math.max(bb.w, bb.h) * M; const sc = sun.shadow.camera; sc.left = sc.bottom = -ext; sc.right = sc.top = ext; sc.near = 1; sc.far = 40; sc.updateProjectionMatrix();
    if (!rebuild.done) { resetCamera(bb); rebuild.done = true; }
  }

  function addPanel(p, room, edge, a, b, pn) {
    const surf = surfaceFromSpec(p, { type: 'wall', roomId: room.id, edge, from: pn.from, to: pn.to });
    if (!surf) return;
    const pb = bbox(surf.poly), H = surf.height;
    const shape = new THREE.Shape([new THREE.Vector2(pb.minX, 0), new THREE.Vector2(pb.maxX, 0), new THREE.Vector2(pb.maxX, H), new THREE.Vector2(pb.minX, H)]);
    for (const o of surf.obstacles.filter(o => !o.small)) {
      const bb = bbox(o.poly);
      if (bb.maxX <= pb.minX || bb.minX >= pb.maxX) continue;
      // y вниз от верхней границы → в координаты панели (y вверх от from); отверстие обрезаем по краям панели
      const hx0 = Math.max(bb.minX, pb.minX + 1), hx1 = Math.min(bb.maxX, pb.maxX - 1), hy0 = Math.max(1, H - bb.maxY), hy1 = Math.min(H - 1, H - bb.minY);
      if (hx1 - hx0 < 5 || hy1 - hy0 < 5) continue;
      const hole = new THREE.Path([new THREE.Vector2(hx0, hy0), new THREE.Vector2(hx1, hy0), new THREE.Vector2(hx1, hy1), new THREE.Vector2(hx0, hy1)]);
      shape.holes.push(hole);
    }
    const geo = new THREE.ShapeGeometry(shape);
    let material;
    if (pn.product) {
      const tex = tileTexture(pn.product, pn.params);
      const uv = geo.attributes.uv, pos = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * M / tex.userData.tw, pos.getY(i) * M / tex.userData.th);
      material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, side: THREE.DoubleSide });
    } else material = mat(pn.color, { side: THREE.DoubleSide, roughness: 0.9 });
    geo.scale(M, M, M);
    const mesh = new THREE.Mesh(geo, material);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    // Нормаль внутрь комнаты
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; const c = centroid(room.poly);
    let n = { x: -(b.y - a.y), y: b.x - a.x }; const nl = Math.hypot(n.x, n.y) || 1; n = { x: n.x / nl, y: n.y / nl };
    if ((c.x - mid.x) * n.x + (c.y - mid.y) * n.y < 0) n = { x: -n.x, y: -n.y };
    const off = pn.product ? 8 : 4;
    mesh.position.set((a.x + n.x * off) * M, pn.from * M, (a.y + n.y * off) * M);
    mesh.rotation.y = -ang;
    mesh.receiveShadow = true;
    world.add(mesh);
  }

  function furniture(pl, product, ceiling) {
    const kr = KIND_RULES[pl.kind] || {};
    const g = new THREE.Group();
    const w = pl.w * M, d = pl.d * M, h = Math.max(0.01, (pl.h || 400) * M);
    const col = product?.color || '#cccccc';
    const dark = '#3a3833';
    const k = pl.kind;
    if (kr.ceiling) {
      const y = ceiling * M;
      if (k === 'pendant') { const cord = box(0.01, 0.6, 0.01, dark, 0, y - 0.3, 0); const shade = new THREE.Mesh(new THREE.ConeGeometry(Math.min(w, 0.6) / 2, 0.25, 24, 1, true), mat(col, { side: THREE.DoubleSide })); shade.position.y = y - 0.7; g.add(cord, shade); }
      else if (k === 'track') g.add(box(w, 0.05, 0.05, col, 0, y - 0.03, 0));
      else { const disk = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(w, 0.6) / 2, Math.min(w, 0.6) / 2, 0.08, 24), mat(col, { emissive: new THREE.Color('#fff4d6'), emissiveIntensity: 0.6 })); disk.position.y = y - 0.05; g.add(disk); }
      const bulb = new THREE.PointLight(0xffe7c2, 0.6, 5, 2); bulb.position.y = y - 0.8; g.add(bulb);
    } else if (k === 'sofa' || k === 'sofa-corner' || k === 'armchair') {
      g.add(box(w, h * 0.45, d, col, 0, h * 0.225, 0));
      g.add(box(w, h * 0.55, d * 0.22, col, 0, h * 0.45 + h * 0.275, -d / 2 + d * 0.11));
      g.add(box(w * 0.08, h * 0.65, d, col, -w / 2 + w * 0.04, h * 0.325, 0), box(w * 0.08, h * 0.65, d, col, w / 2 - w * 0.04, h * 0.325, 0));
      if (k === 'sofa-corner') g.add(box(w * 0.33, h * 0.45, d * 0.9, col, w / 2 - w * 0.165, h * 0.225, d * 0.45 + d * 0.45));
    } else if (k === 'bed') {
      g.add(box(w, h * 0.32, d, col, 0, h * 0.16, 0), box(w * 0.96, 0.18, d * 0.92, '#f6f4ef', 0, h * 0.32 + 0.09, d * 0.03), box(w, h, 0.08, col, 0, h / 2, -d / 2 + 0.04));
    } else if (['dining-table', 'coffee-table', 'desk', 'nightstand'].includes(k) && k !== 'nightstand') {
      g.add(box(w, 0.04, d, col, 0, h - 0.02, 0));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.04, h - 0.04, 0.04, dark, sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.05)));
    } else if (k === 'chair' || k === 'office-chair') {
      g.add(box(w, 0.05, d, col, 0, 0.45, 0), box(w, h - 0.45, 0.04, col, 0, 0.45 + (h - 0.45) / 2, -d / 2 + 0.02));
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.03, 0.45, 0.03, dark, sx * (w / 2 - 0.03), 0.225, sz * (d / 2 - 0.03)));
    } else if (k === 'rug') {
      const m = box(w, 0.008, d, col, 0, 0.004, 0); m.castShadow = false; g.add(m);
    } else if (k === 'curtains') {
      g.add(box(w, (ceiling - 100) * M, 0.04, col, 0, (ceiling - 100) * M / 2, 0, { transparent: true, opacity: 0.92 }));
    } else if (k === 'plant') {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.3, w * 0.24, h * 0.3, 16), mat('#b98a62')));
      g.children[0].position.y = h * 0.15;
      const leaves = new THREE.Mesh(new THREE.SphereGeometry(w * 0.5, 16, 12), mat(col)); leaves.position.y = h * 0.62; leaves.scale.y = 1.3; leaves.castShadow = true; g.add(leaves);
    } else if (k === 'floor-lamp') {
      g.add(box(0.03, h, 0.03, dark, 0, h / 2, 0));
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 20), mat(col, { emissive: new THREE.Color('#fff1cf'), emissiveIntensity: 0.4 })); shade.position.y = h - 0.15; g.add(shade);
    } else if (k === 'bath') {
      g.add(box(w, h, d, '#fbfbfb', 0, h / 2, 0, { roughness: 0.25 }), box(w * 0.86, 0.02, d * 0.72, '#cfe3ea', 0, h + 0.002, 0));
    } else if (kr.wall) {
      const y = k === 'mirror' ? 1.5 : k === 'sconce' ? 1.6 : 1.4;
      g.add(box(w, Math.max(h, 0.1), Math.max(d, 0.03), col, 0, y, -d / 2, k === 'mirror' ? { roughness: 0.05, metalness: 0.6 } : {}));
    } else if (k === 'kitchen-set') {
      g.add(box(w, 0.86, d, col, 0, 0.43, 0), box(w, 0.04, d + 0.02, '#e8e4dc', 0, 0.88, 0.01), box(w, 0.72, 0.35, col, 0, 1.85, -d / 2 + 0.175));
      for (let x = -w / 2 + 0.6; x < w / 2 - 0.05; x += 0.6) g.add(box(0.006, 0.8, 0.004, '#000000', x, 0.43, d / 2 + 0.003, { transparent: true, opacity: 0.25 }));
    } else {
      g.add(box(w, h, d, col, 0, h / 2, 0));
      if (['wardrobe', 'dresser', 'shoe-cabinet', 'tv-stand', 'nightstand'].includes(k)) g.add(box(0.008, h * 0.92, 0.005, '#000000', 0, h / 2, d / 2 + 0.003, { transparent: true, opacity: 0.25 }));
    }
    g.position.set(pl.x * M, 0, pl.y * M);
    g.rotation.y = -(pl.rotation || 0) * Math.PI / 180;
    g.userData.placement = pl.id;
    return g;
  }

  // Инженерные точки как узнаваемые объекты: накладки на стене, потолочные светильники, выводы труб и т. д.
  function wallFrame(p, pt) {
    const room = roomAt(p, pt, pt.floor);
    if (!room) return { x: pt.x, y: pt.y, nx: 0, ny: 1 };
    let best = null;
    room.poly.forEach((a, i) => { const b = room.poly[(i + 1) % room.poly.length]; const pr = projectOnSegment(pt, a, b); if (!best || pr.distance < best.d) best = { d: pr.distance, q: pr.point, a, b }; });
    const len = dist(best.a, best.b) || 1;
    let nx = -(best.b.y - best.a.y) / len, ny = (best.b.x - best.a.x) / len;
    const c = centroid(room.poly);
    if ((c.x - best.q.x) * nx + (c.y - best.q.y) * ny < 0) { nx = -nx; ny = -ny; }
    return best.d < 400 ? { x: best.q.x, y: best.q.y, nx, ny } : { x: pt.x, y: pt.y, nx, ny };
  }
  function pointObject(p, pt, floorH) {
    const g = new THREE.Group();
    const k = pt.kind, h = Math.min(pt.h ?? POINT_KINDS[k]?.h ?? 300, floorH - 20) * M;
    const white = '#f7f6f2', dark = '#2b2b2b', chrome = '#c9cdd1';
    const plate = (w, hh, d, color = white) => { const m = box(w, hh, d, color, 0, 0, d / 2); m.castShadow = false; return m; };
    const add = (...m) => m.forEach(x => g.add(x));
    const cyl = (r, len, color, extra) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), mat(color, extra)); return m; };
    if (k === 'light') {
      const disk = cyl(0.16, 0.04, '#ffffff', { emissive: new THREE.Color('#fff2cc'), emissiveIntensity: 0.9 });
      disk.position.y = (floorH - 25) * M - h; g.add(disk);
      g.position.set(pt.x * M, h, pt.y * M);
      return g;
    }
    if (k === 'socket' || k === 'socket-kitchen' || k === 'socket-power') {
      const big = k === 'socket-power';
      add(plate(big ? 0.1 : 0.085, big ? 0.1 : 0.085, 0.012, big ? '#f0e6dc' : white));
      const ring = cyl(0.03, 0.006, '#e4e2dc'); ring.rotation.x = Math.PI / 2; ring.position.z = 0.014; add(ring);
      for (const sx of [-0.011, 0.011]) { const hole = cyl(0.0035, 0.004, dark); hole.rotation.x = Math.PI / 2; hole.position.set(sx, 0, 0.017); add(hole); }
      if (big) add(box(0.02, 0.012, 0.004, '#c0392b', 0, 0.035, 0.016));
    } else if (k === 'switch') {
      add(plate(0.085, 0.085, 0.012), box(0.05, 0.06, 0.008, '#ecebe6', 0, 0, 0.016));
    } else if (k === 'wall-light') {
      add(plate(0.1, 0.06, 0.02, chrome), box(0.14, 0.12, 0.12, '#f3e6c4', 0, 0.06, 0.08, { emissive: new THREE.Color('#ffe9b0'), emissiveIntensity: 0.6 }));
    } else if (k === 'panel') {
      add(plate(0.36, 0.48, 0.1, '#e6e6e2'), box(0.3, 0.34, 0.004, '#bfc4c8', 0, 0.02, 0.102), box(0.02, 0.06, 0.01, dark, 0.13, 0.02, 0.105));
    } else if (k === 'junction') {
      const c = cyl(0.045, 0.03, '#9aa0a6'); c.rotation.x = Math.PI / 2; c.position.z = 0.015; add(c);
    } else if (POINT_KINDS[k]?.needs) {
      // Выводы под прибор: холодная и горячая вода, канализация
      const needs = POINT_KINDS[k].needs;
      const pipe = (r, len, color, x, y) => { const m = cyl(r, len, color, { metalness: 0.3, roughness: 0.4 }); m.rotation.x = Math.PI / 2; m.position.set(x, y, len / 2); return m; };
      const both = needs.includes('hot');
      if (needs.includes('cold')) add(pipe(0.012, 0.08, SYSTEMS.cold.color, both ? 0.05 : 0, 0), box(0.03, 0.03, 0.02, chrome, both ? 0.05 : 0, 0, 0.09));
      if (both) add(pipe(0.012, 0.08, SYSTEMS.hot.color, -0.05, 0), box(0.03, 0.03, 0.02, chrome, -0.05, 0, 0.09));
      if (needs.includes('sewer')) add(pipe(0.025, 0.1, '#8b8f93', 0, -h + 0.1));
    } else if (k === 'riser') {
      const H = floorH * M;
      const main = cyl(0.055, H, '#9aa0a6', { metalness: 0.2 }); main.position.set(0, H / 2 - h, 0.07); add(main);
      for (const [x, c] of [[0.1, SYSTEMS.cold.color], [0.15, SYSTEMS.hot.color]]) { const m = cyl(0.014, H, c); m.position.set(x, H / 2 - h, 0.05); add(m); }
    } else if (k === 'collector') {
      add(box(0.4, 0.05, 0.05, '#c9a24a', 0, 0, 0.06, { metalness: 0.6, roughness: 0.3 }));
      for (let i = 0; i < 4; i++) add(box(0.02, 0.06, 0.02, i % 2 ? '#2f6fb3' : '#b33', -0.15 + i * 0.1, 0.05, 0.06));
    } else if (k === 'radiator') {
      const w = 0.8, hh = 0.5;
      for (let i = 0; i < 10; i++) add(box(w / 10 - 0.006, hh, 0.08, white, -w / 2 + w / 20 + i * w / 10, hh / 2, 0.06));
      add(box(0.02, 0.02, 0.04, chrome, w / 2 + 0.02, hh - 0.05, 0.06));
    } else if (k === 'boiler') {
      add(plate(0.4, 0.7, 0.3, white), box(0.12, 0.06, 0.01, '#2d333b', 0, 0.2, 0.305));
    } else if (k === 'vent-channel') {
      add(plate(0.2, 0.2, 0.012, '#eeeeea'));
      for (let i = 0; i < 6; i++) add(box(0.17, 0.008, 0.006, '#9aa0a6', 0, -0.075 + i * 0.03, 0.015));
    } else if (k === 'hood') {
      add(box(0.6, 0.12, 0.5, chrome, 0, 0, 0.25, { metalness: 0.5, roughness: 0.3 }), box(0.25, 0.4, 0.25, chrome, 0, 0.26, 0.13, { metalness: 0.5, roughness: 0.3 }));
    } else {
      add(plate(0.08, 0.08, 0.02, '#cccccc'));
    }
    const fr = wallFrame(p, pt);
    g.position.set(fr.x * M, h, fr.y * M);
    g.rotation.y = Math.atan2(fr.nx, fr.ny);
    return g;
  }

  function resetCamera(bb) {
    const ext = Math.max(bb.w, bb.h) * M;
    camera.position.set(center.x + ext * 0.45, ext * 1.25, center.z + ext * 1.05);
    controls.target.copy(center); controls.update();
  }

  // ——— Прогулка ———
  function setMode(m) {
    mode = m;
    controls.enabled = m === 'orbit';
    if (m === 'walk') {
      const p = P();
      const room = p.rooms.find(r => r.id === opts.focusRoom?.()) || p.rooms.find(r => r.floor === p.activeFloor && /гостин|кухня-гост/i.test(r.type)) || p.rooms[0];
      const c = room ? centroid(room.poly) : { x: center.x / M, y: center.z / M };
      camera.position.set(c.x * M, 1.6, c.y * M); pitch = 0;
      // Смотрим на середину самой дальней стены комнаты
      const mids = room ? room.poly.map((q, i) => { const n = room.poly[(i + 1) % room.poly.length]; return { x: (q.x + n.x) / 2, y: (q.y + n.y) / 2 }; }) : [];
      const far = mids.length ? mids.reduce((a, q) => dist(q, c) > dist(a, c) ? q : a) : null;
      yaw = far ? Math.atan2(-(far.x - c.x), -(far.y - c.y)) : 0;
      // Встаём у противоположной стены, чтобы видеть всю комнату
      if (far) camera.position.set((c.x - (far.x - c.x) * 0.7) * M, 1.6, (c.y - (far.y - c.y) * 0.7) * M);
      applyLook();
    } else { const pts = P().rooms.flatMap(r => r.poly); resetCamera(pts.length ? bbox(pts) : { w: 10000, h: 6000 }); }
    rebuild();
  }
  // Крен всегда обнуляем — иначе после режима обзора камера остаётся наклонённой
  function applyLook() { camera.up.set(0, 1, 0); camera.rotation.set(pitch, yaw, 0, 'YXZ'); }
  let look = null;
  const down = e => { if (mode !== 'walk') return; look = { x: e.clientX, y: e.clientY, yaw, pitch }; renderer.domElement.setPointerCapture(e.pointerId); };
  const move = e => { if (!look) return; yaw = look.yaw - (e.clientX - look.x) * 0.005; pitch = Math.max(-1.2, Math.min(1.2, look.pitch - (e.clientY - look.y) * 0.004)); applyLook(); };
  const up = () => { look = null; };
  renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerup', up);
  const kd = e => { if (e.target.closest('input, textarea, select')) return; if (mode === 'walk' && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) { keys.add(e.code); e.preventDefault(); } };
  const ku = e => keys.delete(e.code);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  function blocked(from, to) {
    const a = { x: from.x / M, y: from.z / M }, b = { x: to.x / M, y: to.z / M };
    const ext = { x: b.x + (b.x - a.x) * 4, y: b.y + (b.y - a.y) * 4 };
    for (const { w, ops } of walls2d) {
      const hit = segmentsIntersect(a, ext, w.a, w.b);
      if (!hit) continue;
      const along = hit.u * dist(w.a, w.b);
      const door = ops.find(op => op.o.kind !== 'window' && along > op.s + 80 && along < op.e - 80);
      if (!door) return true;
    }
    return false;
  }

  function tick(t) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (mode === 'walk' && keys.size) {
      const sp = 1.6 * dt; const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)); const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const dv = new THREE.Vector3();
      if (keys.has('KeyW') || keys.has('ArrowUp')) dv.add(fwd); if (keys.has('KeyS') || keys.has('ArrowDown')) dv.sub(fwd);
      if (keys.has('KeyD')) dv.add(right); if (keys.has('KeyA')) dv.sub(right);
      if (keys.has('ArrowLeft')) { yaw += 1.6 * dt; applyLook(); } if (keys.has('ArrowRight')) { yaw -= 1.6 * dt; applyLook(); }
      if (dv.lengthSq()) { const next = camera.position.clone().add(dv.normalize().multiplyScalar(sp)); if (!blocked(camera.position, next)) camera.position.copy(next); }
    }
    if (mode === 'orbit') controls.update();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(tick);
  rebuild();

  return {
    rebuild, setMode, getMode: () => mode,
    press(code, on) { if (on) keys.add(code); else keys.delete(code); },
    snapshot(roomId) {
      if (roomId) {
        const room = P().rooms.find(r => r.id === roomId);
        if (room) { const b = bbox(room.poly); const c = centroid(room.poly); const prev = { mode, pos: camera.position.clone(), rot: camera.rotation.clone() };
          controls.enabled = false; camera.position.set(b.minX * M + 0.3, 1.5, b.maxY * M - 0.3); camera.lookAt(c.x * M, 0.9, c.y * M); renderer.render(scene, camera);
          const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
          camera.position.copy(prev.pos); camera.rotation.copy(prev.rot); controls.enabled = prev.mode === 'orbit'; return url; }
      }
      renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', 0.88);
    },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); },
  };
}
