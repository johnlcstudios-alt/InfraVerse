/* ============================================================
   NEXUS 3D — renderer, camera, interaction, visibility, models
   ============================================================ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const T = THREE;

export const COLORS = {
  accent: 0x36e2c2,
  accent2: 0x46a9ff,
  ok: 0x3ce58b,
  warn: 0xf6b44b,
  danger: 0xff6172,
  info: 0x63b6ff,
  steel: 0x7d8fa0,
  darkSteel: 0x34424f,
  concrete: 0x6d7680,
  asphalt: 0x1b232b,
  white: 0xe7eef3,
  black: 0x0b1117,
};

const matCache = new Map();
export function material(color = 0x8899aa, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.62,
    metalness: opts.metalness ?? 0.16,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide,
    flatShading: opts.flatShading ?? false,
    depthWrite: opts.depthWrite ?? true,
  });
  if (opts.transmission) { m.transparent = true; m.opacity = opts.opacity ?? 0.4; }
  if (!opts.unique) matCache.set(key, m);
  return m;
}

export function glass(color = 0xa9dcff, opacity = 0.28) {
  return new THREE.MeshPhysicalMaterial({
    color, transparent: true, opacity, roughness: 0.08, metalness: 0.0,
    transmission: 0.25, thickness: 0.4, side: THREE.DoubleSide, depthWrite: false,
  });
}

export function emissive(color = 0x36e2c2, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, metalness: 0.1 });
}

/* ---------------- Geometry helpers ---------------- */
export function group(name = 'group') {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

export function box(w, h, d, mat, opts = {}) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat);
  if (opts.x !== undefined) m.position.set(opts.x, opts.y ?? 0, opts.z ?? 0);
  else if (opts.pos) m.position.fromArray(opts.pos);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

export function cylinder(radiusTop, radiusBottom, height, mat, opts = {}) {
  const seg = opts.segments ?? 20;
  const g = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, seg, 1, opts.openEnded ?? false);
  const m = new THREE.Mesh(g, mat);
  if (opts.pos) m.position.fromArray(opts.pos);
  if (opts.x !== undefined) m.position.set(opts.x, opts.y ?? 0, opts.z ?? 0);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

export function sphere(radius, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, opts.segments ?? 20, opts.segments ? Math.max(8, opts.segments / 2) : 12), mat);
  if (opts.pos) m.position.fromArray(opts.pos);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? false;
  return m;
}

export function plane(w, h, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.rotation.x = opts.rx ?? -Math.PI / 2;
  if (opts.pos) m.position.fromArray(opts.pos);
  m.receiveShadow = opts.receive ?? true;
  return m;
}

export function roundedBoxGeometry(w, h, d, r = 0.08) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + d - r);
  shape.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  shape.lineTo(x + r, y + d);
  shape.quadraticCurveTo(x, y + d, x, y + d - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h, bevelEnabled: true, bevelSize: Math.min(r * .45, .04), bevelThickness: Math.min(r * .45, .04),
    bevelSegments: 2, curveSegments: 5,
  });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  return geo;
}

export function roundedBox(w, h, d, mat, opts = {}) {
  const m = new THREE.Mesh(roundedBoxGeometry(w, h, d, opts.radius ?? .08), mat);
  if (opts.pos) m.position.fromArray(opts.pos);
  if (opts.x !== undefined) m.position.set(opts.x, opts.y ?? 0, opts.z ?? 0);
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? true;
  return m;
}

export function edges(mesh, color = 0x9fc4d9, opacity = 0.16, threshold = 22) {
  const line = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, threshold), new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  mesh.add(line);
  return line;
}

export function cylinderBetween(a, b, radius, mat, opts = {}) {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(vb, va);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, opts.segments ?? 12), mat);
  m.position.copy(va).add(vb).multiplyScalar(.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = opts.receive ?? false;
  return m;
}

export function pipe(points, radius, mat, opts = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', .25);
  const geo = new THREE.TubeGeometry(curve, opts.segs ?? Math.max(12, points.length * 10), radius, opts.radial ?? 10, false);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.cast ?? true;
  m.receiveShadow = true;
  return m;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function textSprite(text, opts = {}) {
  const size = opts.size ?? 48;
  const pad = opts.pad ?? 18;
  const font = opts.font ?? `600 ${size}px "Segoe UI", sans-serif`;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const tw = Math.ceil(ctx.measureText(text).width);
  canvas.width = Math.max(64, tw + pad * 2);
  canvas.height = Math.max(64, size + pad * 2);
  const c2 = canvas.getContext('2d');
  if (opts.bg !== 'none') {
    c2.fillStyle = opts.bg ?? 'rgba(7,16,25,.86)';
    roundRectPath(c2, 2, 2, canvas.width - 4, canvas.height - 4, opts.radius ?? 14);
    c2.fill();
    if (opts.border !== false) { c2.strokeStyle = opts.border ?? 'rgba(84,201,188,.45)'; c2.lineWidth = 2; c2.stroke(); }
  }
  c2.font = font; c2.textAlign = 'center'; c2.textBaseline = 'middle';
  c2.fillStyle = opts.color ?? '#dff8f2';
  c2.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: opts.depthTest ?? true });
  const sprite = new THREE.Sprite(mat);
  const scale = opts.scale ?? 1;
  sprite.scale.set((canvas.width / canvas.height) * .82 * scale, .82 * scale, 1);
  sprite.renderOrder = opts.renderOrder ?? 3;
  if (opts.pos) sprite.position.fromArray(opts.pos);
  sprite.userData.isLabel = true;
  return sprite;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function signBoard(text, w = 2, h = .6, opts = {}) {
  const tex = canvasTexture(512, Math.round(512 * h / w), (ctx, cw, ch) => {
    ctx.fillStyle = opts.bg ?? '#0b2230'; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = opts.border ?? '#36e2c2'; ctx.lineWidth = 10; ctx.strokeRect(5, 5, cw - 10, ch - 10);
    ctx.fillStyle = opts.color ?? '#dff8f2'; ctx.font = `700 ${Math.round(ch * .38)}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cw / 2, ch / 2 + 2);
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .7, metalness: .1 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .06), mat);
  m.castShadow = true;
  return m;
}

export function floorGrid(size = 40, divisions = 40, color = 0x24506a, opacity = .18) {
  const grid = new THREE.GridHelper(size, divisions, color, color);
  grid.material.transparent = true;
  grid.material.opacity = opacity;
  grid.position.y = .012;
  return grid;
}

export function shadowify(root, cast = true, receive = true) {
  root.traverse(o => {
    if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; }
  });
  return root;
}

/* Merge static meshes sharing a material into single draw calls.
   Intended for decorative structure categories with no animated or
   interactive children. Meshes with children / noMerge are left alone. */
export function mergeStaticGroup(root, opts = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const remove = [];
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.userData.noMerge || o.userData.interactiveId) return;
    let parent = o.parent;
    while (parent && parent !== root) {
      if (parent.userData?.noMerge) return;
      parent = parent.parent;
    }
    if (o.children.length) return;
    if (Array.isArray(o.material)) return;
    if (!o.geometry?.attributes?.position) return;
    const relative = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(relative);
    const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
    buckets.get(key).geos.push(geo);
    remove.push(o);
  });
  if (!buckets.size) return root;
  remove.forEach(o => o.parent?.remove(o));
  for (const b of buckets.values()) {
    if (b.geos.length < 2) {
      // single: leave geometry removed? put it back as a mesh to avoid losing it
      const geo = b.geos[0];
      const m = new THREE.Mesh(geo, b.mat);
      m.castShadow = opts.forceNoShadow ? false : b.cast;
      m.receiveShadow = b.receive;
      m.userData.mergedStatic = true;
      root.add(m);
      continue;
    }
    let merged;
    try { merged = mergeGeometries(b.geos, false); } catch (err) { merged = null; }
    if (!merged) {
      for (const geo of b.geos) root.add(new THREE.Mesh(geo, b.mat));
      continue;
    }
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = opts.forceNoShadow ? false : b.cast;
    mesh.receiveShadow = b.receive;
    mesh.userData.mergedStatic = true;
    root.add(mesh);
  }
  return root;
}

/* ---------------- Common industrial props ---------------- */
export function makeCar(color = 0x43c6ac, opts = {}) {
  const g = group('vehicle');
  const type = opts.type || 'sedan';
  const paint = material(color, { metalness: .58, roughness: .32, unique: true });
  const trim = material(0x121a20, { roughness: .5, metalness: .3 });
  const chrome = material(0xb8c6d0, { metalness: .9, roughness: .22 });
  const glassM = glass(0x8fc7e8, .38);
  const tyre = material(0x0b0e11, { roughness: .92, metalness: .02 });
  const rimM = material(0x9aabb7, { metalness: .85, roughness: .28 });
  const head = emissive(0xfff3d0, 2);
  const tail = emissive(0xff3546, 1.5);
  const length = type === 'van' ? 4.9 : type === 'suv' ? 4.6 : 4.35;
  const width = type === 'van' ? 1.95 : 1.82;
  const height = type === 'suv' ? 1.15 : type === 'van' ? 1.5 : .92;
  const bodyY = .58, bodyH = type === 'van' ? .9 : .52;
  const body = roundedBox(length, bodyH, width, paint, { pos: [0, bodyY + bodyH / 2, 0], radius: .18 });
  g.add(body);
  // lower sill + bumpers
  const bumper = box(length + .12, .17, width + .06, trim, { pos: [0, .42, 0] });
  g.add(bumper);
  // cabin / cargo
  if (type === 'van') {
    const cargo = roundedBox(3.3, 1.05, width - .12, paint, { pos: [-.35, 1.17, 0], radius: .1 });
    g.add(cargo);
    const windshield = box(.1, .62, width - .32, glassM, { pos: [1.35, 1.28, 0] });
    g.add(windshield);
    const sideWin = box(1.0, .5, .04, glassM, { pos: [.35, 1.35, width / 2 - .025] });
    g.add(sideWin);
    const sideWin2 = sideWin.clone(); sideWin2.position.z *= -1; g.add(sideWin2);
    g.add(box(1.3, .05, .05, trim, { pos: [.35, 1.05, width / 2 - .01] }));
  } else {
    const cabH = type === 'suv' ? .78 : .58;
    const cab = roundedBox(type === 'suv' ? 2.6 : 2.25, cabH, width - .18, glassM, { pos: [-.25, 1.18, 0], radius: .14 });
    g.add(cab);
    const roof = roundedBox(type === 'suv' ? 2.3 : 1.95, .12, width - .25, paint, { pos: [-.3, 1.18 + cabH / 2 + .02, 0], radius: .08 });
    g.add(roof);
    // pillars
    const pill = (x, z) => g.add(box(.09, cabH + .02, .08, paint, { pos: [x, 1.18, z] }));
    for (const z of [-(width / 2 - .14), width / 2 - .14]) { pill(-1.2, z); pill(.7, z); }
  }
  // wheels
  const wheelR = type === 'van' ? .43 : .37;
  const wheelZ = width / 2 - .04;
  const wheels = [];
  for (const [x, z] of [[-length * .31, wheelZ], [-length * .31, -wheelZ], [length * .31, wheelZ], [length * .31, -wheelZ]]) {
    const wg = new THREE.Group();
    wg.position.set(x, wheelR, z);
    const wheel = cylinder(wheelR, wheelR, .25, tyre, { rx: Math.PI / 2, segments: 18 });
    wheel.castShadow = true;
    const rim = cylinder(wheelR * .55, wheelR * .55, .27, rimM, { rx: Math.PI / 2, segments: 12 });
    const hub = cylinder(wheelR * .17, wheelR * .17, .29, chrome, { rx: Math.PI / 2, segments: 10 });
    wg.add(wheel, rim, hub);
    wg.userData.noMerge = true;
    wg.traverse(o => { o.userData.noMerge = true; });
    g.add(wg);
    wheels.push(wg);
  }
  // lights
  const frontX = length / 2 + .01;
  for (const z of [-width * .3, width * .3]) {
    g.add(box(.06, .16, .32, head, { pos: [frontX, .8, z], cast: false }));
    g.add(box(.06, .13, .28, tail, { pos: [-frontX, .82, z], cast: false }));
  }
  // plate + mirrors
  g.add(box(.03, .14, .5, material(0xdde7ee), { pos: [frontX + .03, .6, 0], cast: false }));
  for (const z of [-(width / 2 + .05), width / 2 + .05]) {
    g.add(box(.22, .1, .12, trim, { pos: [.85, 1.1, z] }));
  }
  g.userData.wheels = wheels;
  g.userData.length = length;
  g.userData.type = type;
  mergeStaticGroup(g, { forceNoShadow: false });
  return g;
}

export function makeCardboardBox(w = .8, h = .7, d = .8, color = 0xb98a52, label = '') {
  const g = group('carton');
  const paper = material(color, { roughness: .92, metalness: 0, unique: true });
  const body = roundedBox(w, h, d, paper, { pos: [0, h / 2, 0], radius: .025 });
  g.add(body);
  edges(body, 0x5d3c20, .28, 18);
  const tape = material(0xdfc39a, { roughness: .75 });
  g.add(box(w * .18, .012, d + .01, tape, { pos: [0, h + .005, 0], cast: false }));
  // flaps
  g.add(box(w * .47, .012, d * .44, paper, { pos: [-w * .25, h + .012, d * .24], cast: false, ry: .02 }));
  g.add(box(w * .47, .012, d * .44, paper, { pos: [w * .25, h + .012, -d * .24], cast: false, ry: -.02 }));
  if (label) {
    const tex = canvasTexture(256, 128, (ctx, cw, ch) => {
      ctx.fillStyle = '#f2e9d8'; ctx.fillRect(0, 0, cw, ch);
      ctx.strokeStyle = '#9b8061'; ctx.lineWidth = 4; ctx.strokeRect(3, 3, cw - 6, ch - 6);
      ctx.fillStyle = '#463728'; ctx.font = '700 46px "Cascadia Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cw / 2, ch / 2);
    });
    const labelM = new THREE.Mesh(new THREE.PlaneGeometry(w * .52, d * .32), new THREE.MeshBasicMaterial({ map: tex }));
    labelM.rotation.x = -Math.PI / 2;
    labelM.position.set(0, h + .022, 0);
    g.add(labelM);
  }
  g.userData.size = { w, h, d };
  return g;
}

export function makePallet(w = 1.2, d = 1.0) {
  const g = group('pallet');
  const wood = material(0x8e6b45, { roughness: .9 });
  for (let i = 0; i < 5; i++) g.add(box(.16, .07, d, wood, { pos: [-w / 2 + .16 + i * ((w - .32) / 4), .18, 0] }));
  for (const z of [-d / 2 + .08, 0, d / 2 - .08]) g.add(box(w, .12, .12, wood, { pos: [0, .1, z] }));
  for (const x of [-w / 2 + .1, 0, w / 2 - .1]) g.add(box(.1, .1, d, wood, { pos: [x, .05, 0] }));
  return g;
}

export function makeTowerLight(state = 'ok') {
  const g = group('tower-light');
  g.add(cylinder(.03, .03, 1.9, material(0x6c7b87, { metalness: .6 }), { pos: [0, .95, 0] }));
  const base = cylinder(.16, .19, .09, material(0x2a3540), { pos: [0, .045, 0] });
  g.add(base);
  const colors = { red: 0xff4c5c, amber: 0xffb547, green: 0x3ce58b };
  const lamps = [];
  const order = ['red', 'amber', 'green'];
  order.forEach((name, i) => {
    const m = new THREE.MeshStandardMaterial({ color: colors[name], emissive: colors[name], emissiveIntensity: 0.04, roughness: .35, transparent: true, opacity: .9 });
    const lamp = cylinder(.125, .125, .18, m, { pos: [0, 1.98 - i * .21, 0], segments: 16 });
    g.add(lamp); lamps[i] = m;
  });
  g.add(cylinder(.16, .13, .1, material(0x2a3540), { pos: [0, 2.28, 0] }));
  g.userData.lamps = lamps;
  g.userData.setLamps = (red, amber, green) => {
    lamps[0].emissiveIntensity = red ? 2.2 : .04;
    lamps[1].emissiveIntensity = amber ? 2.2 : .04;
    lamps[2].emissiveIntensity = green ? 2.2 : .04;
  };
  g.userData.setLamps(false, false, true);
  return g;
}

export function makeSecurityCamera(color = 0xd8e2e9) {
  const g = group('camera');
  g.add(cylinder(.03, .03, .35, material(0x5c6b77, { metalness: .7 }), { pos: [0, .175, 0] }));
  const head = roundedBox(.38, .16, .18, material(color, { roughness: .5, metalness: .2 }), { pos: [0, .33, .06], radius: .05 });
  head.rotation.x = -.35;
  g.add(head);
  g.add(cylinder(.055, .055, .04, material(0x111a22), { pos: [0, .3, .17], rx: Math.PI / 2, cast: false }));
  const led = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 6), emissive(0xff4455, 2));
  led.position.set(.1, .37, .14); g.add(led);
  g.userData.led = led;
  return g;
}

export function makeLampPost(height = 6) {
  const g = group('lamp-post');
  const poleM = material(0x77838d, { metalness: .65, roughness: .4 });
  g.add(cylinder(.06, .09, height, poleM, { pos: [0, height / 2, 0] }));
  const arm = box(1.15, .08, .08, poleM, { pos: [.5, height - .1, 0] });
  g.add(arm);
  const headM = material(0x222d36, { metalness: .5 });
  const head = roundedBox(.55, .12, .28, headM, { pos: [1.0, height - .16, 0], radius: .05 });
  g.add(head);
  const lampM = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe6ad, emissiveIntensity: 1.8, roughness: .4 });
  g.add(box(.42, .03, .18, lampM, { pos: [1.0, height - .225, 0], cast: false }));
  const light = new THREE.PointLight(0xffe0a8, 8, 15, 2);
  light.position.set(1.0, height - .5, 0);
  light.castShadow = false;
  g.add(light);
  g.userData.light = light;
  g.userData.lampMaterial = lampM;
  return g;
}

export function makeControlCabinet(w = 1.2, h = 2.0, d = .6, opts = {}) {
  const g = group('control-cabinet');
  const bodyM = material(opts.color ?? 0x3a4854, { metalness: .42, roughness: .48, unique: true });
  g.add(roundedBox(w, h, d, bodyM, { pos: [0, h / 2, 0], radius: .03 }));
  const door = box(w - .08, h - .12, .015, material(opts.doorColor ?? 0x44535f, { metalness: .4, roughness: .5 }), { pos: [0, h / 2, d / 2 + .01] });
  g.add(door);
  edges(door, 0xa9bfd0, .18, 30);
  // display
  const screenM = new THREE.MeshStandardMaterial({ color: 0x07222a, emissive: 0x1a7a78, emissiveIntensity: .8, roughness: .3 });
  g.add(box(w * .55, h * .17, .02, screenM, { pos: [-w * .08, h * .73, d / 2 + .03], cast: false }));
  // buttons
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshStandardMaterial({ color: i === 0 ? 0x32e58b : i === 1 ? 0xffb547 : 0x60a9d0, emissive: i === 0 ? 0x32e58b : i === 1 ? 0xffb547 : 0x1c4f68, emissiveIntensity: i < 2 ? 1.2 : .3 });
    g.add(cylinder(.035, .035, .02, m, { pos: [-w * .28 + i * .16, h * .46, d / 2 + .03], rx: Math.PI / 2 }));
  }
  // vents
  for (let i = 0; i < 4; i++) g.add(box(w * .4, .015, .012, material(0x1d262d), { pos: [0, h * .16 + i * .04, d / 2 + .02], cast: false }));
  g.add(box(.035, .12, .035, material(0xa9b7c2, { metalness: .8 }), { pos: [w / 2 - .07, h / 2, d / 2 + .05] }));
  g.add(cylinder(.055, .055, .025, material(0x27313a), { pos: [0, h - .03, 0], segments: 16 }));
  // base plinth
  g.add(box(w + .08, .06, d + .08, material(0x202b33), { pos: [0, .03, 0] }));
  return g;
}

export function makeValve(radius = .28, color = 0xb8554d) {
  const g = group('valve');
  const m = material(color, { metalness: .55, roughness: .4 });
  g.add(cylinder(radius, radius, .22, m, { pos: [0, .0, 0], rz: Math.PI / 2, segments: 16 }));
  g.add(cylinder(radius * .55, radius * .55, .3, material(0x49545e, { metalness: .7 }), { pos: [0, 0, 0], rz: Math.PI / 2, segments: 12 }));
  const wheel = new THREE.Group();
  wheel.add(cylinder(radius * .95, radius * .95, .045, m, { segments: 24 }));
  for (let i = 0; i < 4; i++) wheel.add(box(radius * 1.8, .035, .04, m, { ry: i * Math.PI / 4, cast: false }));
  wheel.position.y = radius * .45;
  g.add(wheel);
  g.userData.wheel = wheel;
  return g;
}

export function makePerson(color = 0x2e5b82) {
  const g = group('person');
  const skin = material(0xc79c7b);
  const cloth = material(color, { roughness: .85 });
  g.add(cylinder(.15, .18, .62, cloth, { pos: [0, .95, 0] }));
  g.add(sphere(.105, skin, { pos: [0, 1.36, 0] }));
  g.add(cylinder(.055, .06, .55, material(0x26313a), { pos: [-.08, .4, 0] }));
  g.add(cylinder(.055, .06, .55, material(0x26313a), { pos: [.08, .4, 0] }));
  g.add(box(.36, .08, .18, cloth, { pos: [0, 1.23, 0] }));
  return g;
}

export function makeRoadSign(text, opts = {}) {
  const g = group('sign');
  const poleM = material(0x7d8b96, { metalness: .6, roughness: .4 });
  g.add(cylinder(.035, .045, opts.height ?? 2.6, poleM, { pos: [0, (opts.height ?? 2.6) / 2, 0] }));
  const sign = signBoard(text, opts.w ?? 1.2, opts.h ?? .55, opts);
  sign.position.y = (opts.height ?? 2.6) - .1;
  g.add(sign);
  return g;
}

export function makeCone() {
  const g = group('cone');
  const orange = material(0xf47b31, { roughness: .7 });
  const white = material(0xf0f3f5, { roughness: .7 });
  g.add(box(.34, .04, .34, orange, { pos: [0, .02, 0] }));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(.14, .55, 16), orange);
  cone.position.y = .3; cone.castShadow = true; g.add(cone);
  g.add(cylinder(.095, .105, .09, white, { pos: [0, .28, 0], segments: 16 }));
  return g;
}

/* ---------------- SceneView ---------------- */
export class SceneView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.info.autoReset = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050b12);
    this.scene.fog = new THREE.FogExp2(0x050b12, 0.0045);

    this.camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
    this.camera.position.set(18, 14, 20);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 2.5;
    this.controls.maxDistance = 260;
    this.controls.maxPolarAngle = Math.PI * 0.493;
    this.controls.minPolarAngle = 0.015;
    this.controls.target.set(0, 2, 0);
    this.controls.zoomSpeed = 0.85;
    this.controls.panSpeed = 0.7;
    this.controls.rotateSpeed = 0.62;
    this.controls.update();

    this.world = group('world');
    this.scene.add(this.world);
    this.categories = new Map();
    this.categoryOrder = [];
    this.interactives = new Map();
    this.interactiveMeshes = [];
    this.colliders = [];
    this.selectedRoot = null;
    this.selectedId = null;
    this.boxHelper = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.home = null;
    this.tween = null;
    this.hoverTimer = 0;
    this.collisionTimer = 0;
    this.fps = { frames: 0, last: performance.now(), value: 60, tris: 0, calls: 0 };
    this.onSelect = null;
    this.onDoubleClick = null;
    this.onHover = null;
    this._xray = false;
    this._transparentWalls = false;
    this._savedMats = new Map();
    this._setupEnvironment();
    this._setupPointer();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.renderer.domElement.parentElement || this.renderer.domElement);
    this.resize();
  }

  _setupEnvironment() {
    const hemi = new THREE.HemisphereLight(0x9cc9ff, 0x182531, 1.0);
    hemi.position.set(0, 30, 0);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff1dd, 2.3);
    key.position.set(22, 34, 16);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -34;
    key.shadow.camera.right = 34;
    key.shadow.camera.top = 34;
    key.shadow.camera.bottom = -34;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 100;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key);
    this.keyLight = key;
    const fill = new THREE.DirectionalLight(0x7db5ff, 0.55);
    fill.position.set(-24, 16, -18);
    this.scene.add(fill);
    this.rim = new THREE.DirectionalLight(0x4fd6c3, 0.42);
    this.rim.position.set(-8, 8, 22);
    this.scene.add(this.rim);
    this.scene.add(new THREE.AmbientLight(0x3b4e63, 0.46));
  }

  addCategory({ id, label, kind = 'structure', parent = null, hidden = false }) {
    if (this.categories.has(id)) return this.categories.get(id).group;
    const g = group(`cat-${id}`);
    (parent || this.world).add(g);
    const cat = { id, label, kind, group: g, hidden };
    this.categories.set(id, cat);
    this.categoryOrder.push(cat);
    g.visible = !hidden;
    return g;
  }

  getCategory(id) { return this.categories.get(id); }

  registerInteractive(root, spec) {
    root.userData.interactiveId = spec.id;
    root.traverse(o => {
      if (o.isMesh) {
        o.userData.interactiveId = spec.id;
        this.interactiveMeshes.push(o);
      }
      if (o.isSprite) o.raycast = () => {};
    });
    this.interactives.set(spec.id, { ...spec, root });
    return root;
  }

  unregister(id) {
    const rec = this.interactives.get(id);
    if (!rec) return;
    rec.root.traverse(o => { if (o.isMesh) { const idx = this.interactiveMeshes.indexOf(o); if (idx >= 0) this.interactiveMeshes.splice(idx, 1); } });
    this.interactives.delete(id);
  }

  addCollider(obj) {
    obj.traverse(o => { if (o.isMesh) this.colliders.push(o); });
    return obj;
  }

  setBackground(color, fogDensity = 0.0045) {
    this.scene.background = new THREE.Color(color);
    this.scene.fog = new THREE.FogExp2(color, fogDensity);
  }

  _setupPointer() {
    const dom = this.renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, button: e.button, t: performance.now() };
    });
    dom.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const dt = performance.now() - down.t;
      const wasButton = down.button;
      down = null;
      if (moved < 6 && dt < 600 && wasButton === 0) {
        const hit = this.pick(e);
        if (hit) {
          const id = hit.object.userData.interactiveId;
          if (id && this.onSelect) this.onSelect(id, hit);
          else if (this.onSelect) this.onSelect(null, hit);
        } else if (this.onSelect) this.onSelect(null, null);
      }
    });
    dom.addEventListener('dblclick', e => {
      const hit = this.pick(e);
      if (hit) {
        const id = hit.object.userData.interactiveId;
        const root = id ? this.interactives.get(id)?.root : hit.object;
        if (root) { this.focusObject(root); this.onDoubleClick?.(id, root); }
      }
    });
    dom.addEventListener('pointermove', e => {
      this.pointer.x = (e.clientX / dom.clientWidth) * 2 - 1;
      this.pointer.y = -(e.clientY / dom.clientHeight) * 2 + 1;
      this._lastClient = { x: e.clientX, y: e.clientY };
      const now = performance.now();
      if (now - this.hoverTimer > 80) {
        this.hoverTimer = now;
        const hit = this.pick(e);
        if (hit) {
          const id = hit.object.userData.interactiveId;
          if (id) {
            dom.style.cursor = 'pointer';
            this.onHover?.(id, this.interactives.get(id), e.clientX, e.clientY);
            return;
          }
        }
        dom.style.cursor = 'grab';
        this.onHover?.(null, null, e.clientX, e.clientY);
      }
    });
    dom.addEventListener('pointerleave', () => this.onHover?.(null, null));
  }

  pick(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactiveMeshes, false);
    for (const hit of hits) {
      if (!this._isVisible(hit.object)) continue;
      return hit;
    }
    return null;
  }

  _isVisible(obj) {
    let o = obj;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  }

  select(id) {
    if (this.boxHelper) { this.scene.remove(this.boxHelper); this.boxHelper.geometry?.dispose(); this.boxHelper.material?.dispose(); this.boxHelper = null; }
    this.selectedId = id;
    this.selectedRoot = null;
    if (!id) return;
    const rec = this.interactives.get(id);
    if (!rec) return;
    this.selectedRoot = rec.root;
    this.boxHelper = new THREE.BoxHelper(rec.root, 0x36e2c2);
    this.boxHelper.material.transparent = true;
    this.boxHelper.material.opacity = .82;
    this.boxHelper.material.depthTest = false;
    this.boxHelper.renderOrder = 15;
    this.scene.add(this.boxHelper);
    this.updateSelectionBox();
  }

  clearSelection() { this.select(null); }

  updateSelectionBox() {
    if (this.boxHelper && this.selectedRoot) { this.boxHelper.setFromObject(this.selectedRoot); }
  }

  focusObject(obj) {
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const center = sphere.center.clone();
    const size = Math.max(sphere.radius, .8);
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.controls.target).normalize();
    if (dir.lengthSq() < .01) dir.set(1, .8, 1).normalize();
    const dist = Math.min(70, Math.max(4.5, size * 3.0));
    const pos = center.clone().add(dir.multiplyScalar(dist));
    pos.y = Math.max(pos.y, center.y + size * 1.15);
    this.animateCamera(pos, center, 520);
  }

  /* Bounding box of the meaningful (non-ground) visible geometry. Oversized
     flat ground/road planes would otherwise dominate framing and push the
     facility into a corner of the viewport. */
  computeFitBox(out = new THREE.Box3()) {
    const candidates = [];
    for (const cat of this.categoryOrder) {
      if (!cat.group.visible) continue;
      cat.group.traverse(o => { if (o.isMesh && !o.userData.ignoreFit) candidates.push(o); });
    }
    if (!candidates.length) return out.setFromObject(this.world);
    const tmp = new THREE.Box3();
    const boxes = [];
    let maxSolid = 0;
    for (const o of candidates) {
      tmp.setFromObject(o);
      if (tmp.isEmpty()) continue;
      const sx = tmp.max.x - tmp.min.x, sz = tmp.max.z - tmp.min.z, sy = tmp.max.y - tmp.min.y;
      const horiz = Math.max(sx, sz);
      const flat = sy < 0.9;
      if (!flat) maxSolid = Math.max(maxSolid, horiz);
      boxes.push({ o, horiz, flat });
    }
    // Ground slabs / roadways are flat and far larger than the built facility:
    // including them would shrink the facility into a corner of the viewport.
    const limit = Math.max(maxSolid * 1.6, 30);
    const keep = boxes.filter(b => !(b.flat && b.horiz > limit)).map(b => b.o);
    const use = keep.length ? keep : candidates;
    out.makeEmpty();
    for (const o of use) out.expandByObject(o);
    return out;
  }

  /* Choose a camera distance that fills the viewport for the given direction
     by projecting the box corners and iterating. Wide flat sites would look
     tiny with a naive bounding-sphere fit. */
  _frameDistance(box, dir, fillX = .88, fillY = .86) {
    const center = box.getCenter(new THREE.Vector3());
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const spirit = box.getBoundingSphere(new THREE.Sphere());
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    let d = Math.max(5, spirit.radius / Math.sin(fov / 2));
    const probe = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect, .1, 2000);
    probe.up.set(0, 1, 0);
    for (let i = 0; i < 10; i++) {
      probe.position.copy(center).addScaledVector(dir, d);
      probe.lookAt(center);
      probe.updateMatrixWorld(true);
      probe.updateProjectionMatrix();
      let mx = 0, my = 0;
      for (const c of corners) {
        const p = c.clone().project(probe);
        mx = Math.max(mx, Math.abs(p.x));
        my = Math.max(my, Math.abs(p.y));
      }
      const ratio = Math.max(mx / fillX, my / fillY);
      if (!Number.isFinite(ratio) || ratio <= 0.001) break;
      const next = d * ratio;
      if (Math.abs(next - d) / d < 0.008) { d = next; break; }
      d = next;
    }
    return { center, distance: Math.max(3.2, Math.min(d * 1.05, 240)) };
  }

  fitAll(padding = 1.3, instant = false, fill = 1) {
    const box = this.computeFitBox();
    if (box.isEmpty()) box.setFromObject(this.world);
    if (box.isEmpty()) return;
    const dir = new THREE.Vector3(1, .72, 1).normalize();
    const fit = this._frameDistance(box, dir, .90 * fill, .88 * fill);
    const center = fit.center;
    const dist = Math.min(fit.distance * (padding > 1 ? padding * .96 : 1), 240);
    const pos = center.clone().addScaledVector(dir, dist);
    pos.y = Math.max(pos.y, center.y + 1.2);
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(center);
      this.controls.update();
    } else {
      this.animateCamera(pos, center, 560);
    }
  }

  setView(name) {
    const box = this.computeFitBox();
    if (box.isEmpty()) return;
    if (name === 'home' && this.home) { this.animateCamera(this.home.position.clone(), this.home.target.clone(), 600); return; }
    const dirs = {
      top: new THREE.Vector3(0.001, 1, 0.02),
      front: new THREE.Vector3(0, .34, 1),
      side: new THREE.Vector3(1, .34, 0),
      iso: new THREE.Vector3(1, .85, 1),
    };
    const dir = (dirs[name] || dirs.iso).clone().normalize();
    const fit = this._frameDistance(box, dir, .90, .88);
    const center = fit.center;
    const pos = center.clone().addScaledVector(dir, fit.distance);
    if (name !== 'top') pos.y = Math.max(pos.y, center.y + 1.2);
    this.animateCamera(pos, center, 540);
  }

  _visibleSphere() {
    const box = this.computeFitBox();
    if (box.isEmpty()) return new THREE.Sphere(new THREE.Vector3(0, 2, 0), 10);
    const s = box.getBoundingSphere(new THREE.Sphere());
    s.radius = Math.max(4, s.radius);
    return s;
  }

  captureHome() {
    this.home = { position: this.camera.position.clone(), target: this.controls.target.clone() };
  }

  animateCamera(position, target, duration = 520) {
    this.tween = {
      fromPos: this.camera.position.clone(), toPos: position.clone(),
      fromTarget: this.controls.target.clone(), toTarget: target.clone(),
      start: performance.now(), duration, eased: false,
    };
  }

  _updateTween() {
    if (!this.tween) return;
    const t = Math.min(1, (performance.now() - this.tween.start) / this.tween.duration);
    const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, e);
    this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, e);
    if (t >= 1) this.tween = null;
  }

  _enforceCameraSafety() {
    if (this.camera.position.y < .45) this.camera.position.y = .45;
    // pull camera in front of structural colliders
    if (this.tween || this.colliders.length === 0) return;
    const target = this.controls.target;
    const dir = new THREE.Vector3().subVectors(this.camera.position, target);
    const dist = dir.length();
    if (dist < 3) return;
    dir.normalize();
    this.raycaster.set(target, dir);
    this.raycaster.far = dist - .35;
    const hits = this.raycaster.intersectObjects(this.colliders.filter(o => this._isVisible(o)), false);
    if (hits.length) {
      const hit = hits[0];
      const want = Math.max(2.6, hit.distance - .35);
      if (want < dist - .05) {
        this.camera.position.copy(target).addScaledVector(dir, want);
        this.controls.update();
      }
    }
    this.raycaster.far = Infinity;
  }

  setCategoryVisible(id, visible) {
    const cat = this.categories.get(id);
    if (!cat) return;
    cat.group.visible = visible;
    cat.hidden = !visible;
    if (!visible && this.selectedRoot && cat.group.getObjectById(this.selectedRoot.id)) {
      // keep selection info, but the object is not raycastable while hidden
    }
  }

  getVisibility() {
    const out = {};
    for (const cat of this.categoryOrder) out[cat.id] = cat.group.visible;
    return out;
  }

  setVisibility(map) {
    for (const [id, v] of Object.entries(map || {})) this.setCategoryVisible(id, !!v);
  }

  showAll() { for (const cat of this.categoryOrder) { cat.group.visible = true; cat.hidden = false; } }
  hideAll() { for (const cat of this.categoryOrder) { cat.group.visible = false; cat.hidden = true; } }
  hideKind(kind) { for (const cat of this.categoryOrder) if (cat.kind === kind) { cat.group.visible = false; cat.hidden = true; } }
  showKind(kind) { for (const cat of this.categoryOrder) if (cat.kind === kind) { cat.group.visible = true; cat.hidden = false; } }

  _forEachMaterial(groupRoot, fn) {
    groupRoot.traverse(o => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) fn(mat, o);
    });
  }

  setXray(on) {
    this._xray = on;
    if (on) {
      this._restoreMaterials();
      this._applyGhost((mesh) => true, .085, 0x2fbfd1);
    } else {
      this._restoreMaterials();
    }
  }

  setTransparentWalls(on) {
    this._transparentWalls = on;
    const ids = ['walls', 'interior-walls', 'partitions', 'roof', 'ceiling', 'floor', 'doors', 'windows'];
    if (on) {
      this._restoreMaterials();
      this._applyGhost((mesh) => {
        let n = mesh;
        while (n && n !== this.world) { if (ids.includes(n.name?.replace(/^cat-/, ''))) return true; n = n.parent; }
        return false;
      }, .32);
    } else {
      this._restoreMaterials();
    }
  }

  _applyGhost(filter, opacity, tint = null) {
    for (const cat of this.categoryOrder) {
      if (cat.kind !== 'structure') continue;
      cat.group.visible = true;
      cat.group.traverse(mesh => {
        if (!mesh.isMesh || !mesh.material) return;
        if (!filter(mesh)) return;
        if (Array.isArray(mesh.material)) return;
        if (!mesh.userData._ghostOrig) {
          mesh.userData._ghostOrig = mesh.material;
          mesh.userData._ghostCast = mesh.castShadow;
          mesh.userData._ghostMat = mesh.material.clone();
        }
        const m = mesh.userData._ghostMat;
        m.transparent = true;
        m.opacity = opacity;
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        if (tint && m.color) m.color.lerp(new THREE.Color(tint), .35);
        if (m.emissive) m.emissive.setHex(0x0a2a33);
        m.needsUpdate = true;
        mesh.material = m;
        mesh.castShadow = false;
      });
    }
  }

  _restoreMaterials() {
    for (const cat of this.categoryOrder) {
      cat.group.traverse(mesh => {
        if (!mesh.isMesh || !mesh.userData._ghostOrig) return;
        mesh.material = mesh.userData._ghostOrig;
        mesh.castShadow = mesh.userData._ghostCast ?? true;
        if (mesh.userData._ghostMat) mesh.userData._ghostMat.dispose?.();
        delete mesh.userData._ghostOrig;
        delete mesh.userData._ghostCast;
        delete mesh.userData._ghostMat;
      });
    }
    this._savedMats.clear();
  }

  isolateCategory(id) {
    for (const cat of this.categoryOrder) {
      const show = cat.id === id;
      cat.group.visible = show;
      cat.hidden = !show;
    }
  }

  resize() {
    const parent = this.renderer.domElement.parentElement;
    if (!parent) return;
    const w = parent.clientWidth, h = parent.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(realDt) {
    this._updateTween();
    this.controls.update();
    this._enforceCameraSafety();
    this.updateSelectionBox();
    this.fps.frames++;
    const now = performance.now();
    if (now - this.fps.last >= 700) {
      this.fps.value = Math.round((this.fps.frames * 1000) / (now - this.fps.last));
      this.fps.frames = 0;
      this.fps.last = now;
      this.fps.tris = this.renderer.info.render.triangles;
      this.fps.calls = this.renderer.info.render.calls;
    }
  }

  render() {
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    if (this.boxHelper) { this.boxHelper.geometry?.dispose(); this.boxHelper.material?.dispose(); }
    this.scene.traverse(o => {
      if (o.isMesh || o.isLine || o.isPoints) {
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        mats.forEach(m => {
          for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) if (m[k]) m[k].dispose();
          m.dispose?.();
        });
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}

/* ---------------- Camera presets metadata ---------------- */
export const CAMERA_PRESETS = [
  { id: 'iso', label: 'Isometric', icon: 'iso' },
  { id: 'top', label: 'Top View', icon: 'top' },
  { id: 'front', label: 'Front View', icon: 'front' },
  { id: 'side', label: 'Side View', icon: 'side' },
  { id: 'home', label: 'Reset Camera', icon: 'rotate' },
];
