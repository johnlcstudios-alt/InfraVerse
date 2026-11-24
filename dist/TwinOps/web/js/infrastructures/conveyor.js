/* ============================================================
   CONVEYOR SORTING LINE — U-shaped transport loop with a
   pneumatic swing-arm diverter, two collection bins, live carton
   tracking and a full motor thermal / jam-recovery model.
   ============================================================ */
import * as THREE from 'three';
import { BaseInfrastructure } from '../core/base.js';
import {
  group, box, cylinder, plane, material, emissive, roundedBox, makeCardboardBox,
  makeControlCabinet, makeTowerLight, makeLampPost, signBoard, textSprite, canvasTexture,
  pipe, sphere, shadowify, mergeStaticGroup, cylinderBetween, COLORS,
} from '../core/scene.js';
import * as ui from '../core/ui.js';

const { el } = ui;

export const meta = {
  id: 'conveyor',
  code: 'CVY-03',
  name: 'Conveyor Sorting Line',
  description: 'U-shaped transport loop with live carton tracking, rule-based swing-arm diverter sorting, two collection bins, motor thermal model and jam recovery.',
  icon: 'conveyor',
  sceneBackground: 0x080a0d,
  fogDensity: 0.0040,
  fitPadding: 1.0,
};

/* ------------------------------------------------------------
   Static design data
   ------------------------------------------------------------ */
const BOX_PROFILES = {
  small: { key: 'small', label: 'Small', w: 0.42, h: 0.34, d: 0.42, weight: [2, 5] },
  medium: { key: 'medium', label: 'Medium', w: 0.56, h: 0.44, d: 0.56, weight: [6, 12] },
  large: { key: 'large', label: 'Large', w: 0.70, h: 0.52, d: 0.68, weight: [13, 22] },
};
const BOX_COLORS = [
  { key: 'kraft', label: 'Kraft Brown', hex: 0xb98a52, css: '#b98a52' },
  { key: 'red', label: 'Signal Red', hex: 0xb84f46, css: '#b84f46' },
  { key: 'blue', label: 'Cobalt Blue', hex: 0x4a6fa5, css: '#4a6fa5' },
  { key: 'white', label: 'Pearl White', hex: 0xd6dade, css: '#d6dade' },
  { key: 'amber', label: 'Amber', hex: 0xc9963f, css: '#c9963f' },
];
const CLASSIFICATIONS = [
  { key: 'standard', label: 'Standard' },
  { key: 'fragile', label: 'Fragile' },
  { key: 'express', label: 'Express' },
  { key: 'bulk', label: 'Bulk' },
];
const SIZE_KEYS = Object.keys(BOX_PROFILES);

/* Layout of the U-shaped line (metres, belt surface height = 1.35). */
const L = Object.freeze({
  beltY: 1.35,
  beltHalf: 0.39,
  legAZ: 6.8,
  legBZ: 0.2,
  infeedX: -11.4,
  legAEndX: 6.8,
  arcCX: 6.8,
  arcCZ: 3.5,
  arcR: 3.3,
  beltEndX: -5.2,
  sortX: -2.2,
  binAX: -2.2, binAZ: 2.55,
  binBX: -6.45, binBZ: 2.55,
  binW: 2.05, binD: 1.55, binH: 1.16,
  cabinetX: -9.4, cabinetZ: 3.6,
  roomCX: -15.4, roomCZ: 4.8, roomW: 4.2, roomD: 5.6, roomH: 2.9,
});

/* ------------------------------------------------------------
   Small helpers
   ------------------------------------------------------------ */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const yawFor = (dx, dz) => Math.atan2(-dz, dx);
const num = (v, d = 1) => (Number.isFinite(+v) ? ui.fmt(+v, d) : '—');

const ARROW_UP = new THREE.Vector3(0, 1, 0);

/** Flat belt ribbon that follows a CatmullRom curve. */
function ribbonGeometry(curve, samples, halfWidth, yOffset = 0, uvScale = 1.15) {
  const positions = [], uvs = [], indices = [];
  let dist = 0;
  let prev = null;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const lat = new THREE.Vector3(t.z, 0, -t.x);
    if (lat.lengthSq() < 1e-8) lat.set(0, 0, 1); else lat.normalize();
    const cx = p.x, cz = p.z;
    if (prev) dist += Math.hypot(cx - prev[0], cz - prev[1]);
    prev = [cx, cz];
    for (const side of [-1, 1]) {
      positions.push(cx + lat.x * halfWidth * side, p.y + yOffset, cz + lat.z * halfWidth * side);
      uvs.push(dist / uvScale, side < 0 ? 0 : 1);
    }
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Vertical ribbon (skirt / chute wall) following a curve, offset sideways. */
function skirtGeometry(curve, samples, offset, yTopDelta, yBottomDelta, uvScale = 1.15) {
  const positions = [], uvs = [], indices = [];
  let dist = 0;
  let prev = null;
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const lat = new THREE.Vector3(t.z, 0, -t.x);
    if (lat.lengthSq() < 1e-8) lat.set(0, 0, 1); else lat.normalize();
    const cx = p.x + lat.x * offset, cz = p.z + lat.z * offset;
    if (prev) dist += Math.hypot(cx - prev[0], cz - prev[1]);
    prev = [cx, cz];
    positions.push(cx, p.y + yTopDelta, cz, cx, p.y + yBottomDelta, cz);
    uvs.push(dist / uvScale, 1, dist / uvScale, 0);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Dark rubber belt texture with travelling chevrons. */
function makeBeltTexture() {
  const tex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#1c2327';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#1f282d' : '#232d33';
      ctx.fillRect(0, (i * h) / 8, w, h / 8);
    }
    ctx.strokeStyle = 'rgba(126,158,174,.34)';
    ctx.lineWidth = 9;
    for (let x = -h; x < w + h; x += 76) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h * 0.62, 0);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0, 0, w, 7);
    ctx.fillRect(0, h - 7, w, 7);
    ctx.fillStyle = 'rgba(196,214,224,.08)';
    ctx.fillRect(0, 0, 3, h);
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

/** Procedural floor arrow decal (MeshBasicMaterial plane). */
function makeFloorArrow() {
  const tex = canvasTexture(256, 140, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(214,182,74,.62)';
    ctx.beginPath();
    ctx.moveTo(8, h * 0.36); ctx.lineTo(w * 0.6, h * 0.36); ctx.lineTo(w * 0.6, h * 0.12);
    ctx.lineTo(w - 10, h * 0.5); ctx.lineTo(w * 0.6, h * 0.88); ctx.lineTo(w * 0.6, h * 0.64);
    ctx.lineTo(8, h * 0.64); ctx.closePath(); ctx.fill();
  });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 1.42),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.024;
  return m;
}

/* ============================================================
   Module class
   ============================================================ */
export default class ConveyorSortingLine extends BaseInfrastructure {
  constructor(host) {
    super(host, meta);
    this.cat = {};
    this.pathCurve = null;
    this.pathLength = 1;
    this.uEntry = 0.02;
    this.uScanner = 0.83;
    this.uSort = 0.925;
    this.uExit = 0.978;
    this.uEnd = 0.995;
    this.boxes = [];
    this._boxSerial = 0;
    this.pendingBoxes = [];
    this.binData = {};
    this.belt = null;
    this.motor = null;
    this.diverter = null;
    this.rollers = null;
    this.pulleys = [];
    this.fanAngle = 0;
    this.lights = [];
    this.towerLights = [];
    this.estopLamp = null;
    this.scannerLamp = null;
    this.scannerFlash = 0;
    this.spawnTimer = 0;
    this._nextSpawn = 0;
    this.jamActive = false;
    this.jamCause = '';
    this.unexpectedStop = false;
    this.sortedA = 0;
    this.sortedB = 0;
    this.sortedTotal = 0;
    this.sortFailures = 0;
    this.scanCount = 0;
    this.jamEvents = 0;
    this.thermalTrips = 0;
    this.throughput = [];
    this.flowDir = 1;
    this.lightingOn = true;
    this.faults = { entrySensor: false, scanner: false };
    this._lastNow = '';
    this._initialised = false;
    this._diverterHold = 0;
    this._tempAcc = 0;
    this._ambient = 23;
    this._lastStatusText = '';
    this._sortRate = 0;
    this._sensorAcc = 0;
    this._fanAngle = 0;
  }

  /* ----------------------------------------------------------
     Configuration
     ---------------------------------------------------------- */
  defaultConfig() {
    return {
      ...super.defaultConfig(),
      beltSpeed: 1.2,
      acceleration: 0.55,
      deceleration: 0.9,
      direction: 1,
      motorOn: true,
      coolingFan: true,
      autoStart: true,
      lightingOn: true,
      sorting: { strategy: 'size', successRate: 96, auto: true },
      diverter: { auto: true, position: 0 },
      rules: {
        size: { small: 'A', medium: 'A', large: 'B' },
        color: { kraft: 'A', red: 'A', blue: 'B', white: 'A', amber: 'B' },
        classification: { standard: 'B', fragile: 'A', express: 'B', bulk: 'A' },
      },
      spawn: {
        auto: true, interval: 8, mode: 'random', maxItems: 12, quantity: 1,
        size: 'random', color: 'random', classification: 'random', weight: 'random',
        destination: 'auto', delay: 0, randomProfile: true,
      },
      bins: { capacityA: 12, capacityB: 12 },
      thresholds: {
        jamSeconds: 6,
        motorOverheatTemp: 78,
        binFullPercent: 92,
        sortingFailurePercent: 25,
        motorTripCurrent: 9.5,
      },
    };
  }

  /* ==========================================================
     WORLD
     ========================================================== */
  buildWorld() {
    this.makeCategories();
    this.buildPath();
    this.buildGround();
    this.buildFoundations();
    this.buildControlRoom();
    this.buildConveyor();
    this.buildGantries();
    this.buildLampPosts();
    this.buildDriveStation();
    this.buildSortStation();
    this.buildChutes();
    this.buildBins();
    this.buildScanner();
    this.buildInfeed();
    this.buildCabinet();
    this.buildEstop();
    this.buildTowerLights();
    this.buildWiring();
    this.buildSignage();
    this.buildSensorNodes();
    this.buildBackground();
    this.buildEquipmentList();
    this.optimizeStaticGeometry();

    // First-person spawn point (control room)
    this.firstPersonSpawnPoint = { x: -14, y: 1.7, z: -4, yaw: Math.PI / 4, pitch: 0 };
    this.initFirstPerson(this.firstPersonSpawnPoint);

    // Register detailed operational scenarios
    this.registerDetailedScenarios();
  }

  makeCategories() {
    const cats = [
      ['floor', 'Ground & Floor Slab', 'structure'],
      ['foundation', 'Foundations & Plinths', 'structure'],
      ['walls', 'Control Room Walls', 'structure'],
      ['roof', 'Control Room Roof', 'structure'],
      ['columns', 'Gantry Columns', 'structure'],
      ['beams', 'Canopy Beams & Trusses', 'structure'],
      ['conveyors', 'Conveyor Line & Cartons', 'equipment'],
      ['machines', 'Drive & Sorting Machinery', 'equipment'],
      ['equipment', 'Control Equipment', 'equipment'],
      ['sensors', 'Sensor Nodes', 'equipment'],
      ['wiring', 'Electrical Wiring', 'equipment'],
      ['bins', 'Collection Bins', 'equipment'],
      ['lighting', 'Lighting', 'equipment'],
      ['signs', 'Signage & Markings', 'equipment'],
    ];
    this.cat = {};
    for (const [id, label, kind] of cats) this.cat[id] = this.category({ id, label, kind });
  }

  /* ----------------------------------------------------------
     U-shaped belt path
     ---------------------------------------------------------- */
  buildPath() {
    const pts = [];
    const nA = 30, nArc = 40, nB = 26;
    for (let i = 0; i < nA; i++) {
      const t = i / (nA - 1);
      pts.push(V3(L.infeedX + (L.legAEndX - L.infeedX) * t, L.beltY, L.legAZ));
    }
    for (let i = 1; i <= nArc; i++) {
      const ang = Math.PI / 2 - Math.PI * (i / nArc);
      pts.push(V3(L.arcCX + Math.cos(ang) * L.arcR, L.beltY, L.arcCZ + Math.sin(ang) * L.arcR));
    }
    for (let i = 1; i <= nB; i++) {
      const t = i / nB;
      pts.push(V3(L.legAEndX + (L.beltEndX - L.legAEndX) * t, L.beltY, L.legBZ));
    }
    this.pathCurve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.25);
    this.pathLength = Math.max(1, this.pathCurve.getLength());
    this.uEntry = this.findU(-10.9, L.legAZ);
    this.uScanner = this.findU(1.6, L.legBZ);
    this.uSort = this.findU(L.sortX, L.legBZ);
    this.uExit = this.findU(-4.4, L.legBZ);
    this.uEnd = 0.995;
    this._pathPts = pts;
  }

  findU(x, z) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i <= 1400; i++) {
      const u = i / 1400;
      const p = this.pathCurve.getPointAt(u);
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bestD) { bestD = d; best = u; }
    }
    return best;
  }

  pointAt(u) { return this.pathCurve.getPointAt(clamp(u, 0, 1)); }
  tangentAt(u) { return this.pathCurve.getTangentAt(clamp(u, 0, 1)); }
  lateralAt(u) {
    const t = this.tangentAt(u);
    return V3(t.z, 0, -t.x).normalize();
  }
  yawAt(u) {
    const t = this.tangentAt(u);
    return Math.atan2(-t.z, t.x);
  }

  /* ----------------------------------------------------------
     Ground & floor markings
     ---------------------------------------------------------- */
  buildGround() {
    const concrete = material(0x1a2026, { roughness: 0.95, metalness: 0.02 });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(78, 52), concrete);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(-2, -0.02, 3.2);
    apron.receiveShadow = true;
    this.scene.world.add(apron);

    const slabMat = material(0x242b32, { roughness: 0.9, metalness: 0.05 });
    this.cat.floor.add(plane(35, 16.5, slabMat, { pos: [-2, 0.004, 3.4], receive: true }));
    const zoneMat = material(0x2a323a, { roughness: 0.88, metalness: 0.06 });
    this.cat.floor.add(plane(25, 8.0, zoneMat, { pos: [1.2, 0.006, 3.5], receive: true }));

    // painted safety lines both sides of the line
    const paint = material(0xc9a227, { roughness: 0.8, metalness: 0.05, emissive: 0x3a2c05, emissiveIntensity: 0.7 });
    const paintCool = material(0x9aa6ad, { roughness: 0.85, metalness: 0.05, emissive: 0x20272b, emissiveIntensity: 0.4 });
    const line = (x1, z1, x2, z2, mat = paint, w = 0.1) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const m = box(len, 0.012, w, mat, { pos: [(x1 + x2) / 2, 0.022, (z1 + z2) / 2], cast: false, receive: false });
      m.rotation.y = yawFor(x2 - x1, z2 - z1);
      this.cat.floor.add(m);
    };
    // leg A keep-clear
    line(L.infeedX - 0.7, L.legAZ + 1.05, 7.4, L.legAZ + 1.05);
    line(L.infeedX - 0.7, L.legAZ - 1.05, 7.4, L.legAZ - 1.05);
    // leg B keep-clear
    line(-6.6, L.legBZ + 1.05, 7.4, L.legBZ + 1.05);
    line(-6.6, L.legBZ - 1.05, 7.4, L.legBZ - 1.05);
    // arc outer continuous marking
    for (let i = 0; i < 24; i++) {
      const a0 = Math.PI / 2 - Math.PI * (i / 24);
      const a1 = Math.PI / 2 - Math.PI * ((i + 1) / 24);
      const r = L.arcR + 1.05;
      line(
        L.arcCX + Math.cos(a0) * r, L.arcCZ + Math.sin(a0) * r,
        L.arcCX + Math.cos(a1) * r, L.arcCZ + Math.sin(a1) * r, paint, 0.1,
      );
    }
    // walkway / crossing marks at infeed
    line(-13.1, 8.8, -9.7, 8.8, paintCool, 0.08);
    line(-13.1, 5.0, -9.7, 5.0, paintCool, 0.08);
    for (let i = 0; i < 7; i++) line(-13.1 + i * 0.56, 5.0, -13.1 + i * 0.56, 8.8, paintCool, 0.07);
    // hazard hatch at drive station
    for (let i = 0; i < 9; i++) {
      const m = box(0.9, 0.012, 0.16, i % 2 ? material(0x1c2226) : paint, { pos: [9.4 + i * 0.55, 0.024, -1.35], cast: false, receive: false });
      m.rotation.y = -0.6;
      this.cat.floor.add(m);
    }
    // directional floor arrows
    for (const [x, z, rot] of [[-8.2, L.legAZ, 0], [-2.0, L.legAZ, 0], [4.4, L.legAZ, 0], [2.4, -1.9, Math.PI]]) {
      const arrow = makeFloorArrow();
      arrow.position.set(x, 0.024, z);
      arrow.rotation.z = rot;
      this.cat.floor.add(arrow);
    }
    // floor drains + expansion joints
    for (let i = 0; i < 7; i++) {
      this.cat.floor.add(box(0.02, 0.012, 14, material(0x151a1e, { roughness: 0.95 }), { pos: [-12 + i * 4, 0.018, 3.4], cast: false, receive: false }));
    }
  }

  buildFoundations() {
    const pad = material(0x3c454d, { roughness: 0.9, metalness: 0.08 });
    const padDark = material(0x2c343b, { roughness: 0.92, metalness: 0.06 });
    // control room slab
    this.cat.foundation.add(box(L.roomW + 0.6, 0.2, L.roomD + 0.6, pad, { pos: [L.roomCX, 0.1, L.roomCZ] }));
    // cabinet + estop plinths
    this.cat.foundation.add(box(1.9, 0.14, 1.1, padDark, { pos: [L.cabinetX, 0.07, L.cabinetZ] }));
    // drive plinth
    this.cat.foundation.add(box(3.8, 0.2, 2.5, pad, { pos: [11.5, 0.1, 3.5] }));
    // bin pads
    for (const key of ['A', 'B']) {
      const b = key === 'A' ? L : null;
      const bx = key === 'A' ? L.binAX : L.binBX;
      const bz = key === 'A' ? L.binAZ : L.binBZ;
      this.cat.foundation.add(box(L.binW + 0.5, 0.1, L.binD + 0.5, padDark, { pos: [bx, 0.05, bz] }));
    }
    // chute support pads
    this.cat.foundation.add(box(0.5, 0.1, 0.5, padDark, { pos: [-2.2, 0.05, 1.1] }));
    // gantry footings
    for (const gx of [-3.5, 4.5]) for (const gz of [-1.75, 8.65]) {
      this.cat.foundation.add(box(0.68, 0.18, 0.68, pad, { pos: [gx, 0.09, gz] }));
    }
    // lamp post bases
    for (const [x, z] of [[0, -2.6], [8.5, -2.6]]) this.cat.foundation.add(box(0.5, 0.14, 0.5, padDark, { pos: [x, 0.07, z] }));
    // safety curbs around the line footprint
    const curb = material(0x4a5259, { roughness: 0.9 });
    this.cat.foundation.add(box(0.22, 0.16, 15.4, curb, { pos: [-17.4, 0.08, 3.4] }));
    // infeed table feet
    for (const [x, z] of [[-13.4, 6.35], [-13.4, 7.25], [-11.5, 6.35], [-11.5, 7.25]]) {
      this.cat.foundation.add(box(0.22, 0.03, 0.22, padDark, { pos: [x, 0.015, z], cast: false }));
    }
  }

  /* ----------------------------------------------------------
     Control room (walls / roof / interior)
     ---------------------------------------------------------- */
  buildControlRoom() {
    const cx = L.roomCX, cz = L.roomCZ;
    const w = L.roomW, d = L.roomD, h = L.roomH;
    const wallM = material(0x3b4a55, { metalness: 0.18, roughness: 0.62 });
    const trimM = material(0x7c8d98, { metalness: 0.45, roughness: 0.42 });
    const glassM = material(0x9ed6ee, { transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.1, depthWrite: false });
    const screenM = new THREE.MeshStandardMaterial({ color: 0x04161c, emissive: 0x1f8f84, emissiveIntensity: 0.9, roughness: 0.3 });
    const lightM = new THREE.MeshStandardMaterial({ color: 0xf3f8ff, emissive: 0xdfeeff, emissiveIntensity: 1.4, roughness: 0.4 });

    const shell = group('control-room-shell');
    const zS = cz - d / 2, zN = cz + d / 2, xW = cx - w / 2, xE = cx + w / 2;
    // south / north / west walls
    shell.add(box(w, h, 0.14, wallM, { pos: [cx, h / 2, zS] }));
    shell.add(box(w, h, 0.14, wallM, { pos: [cx, h / 2, zN] }));
    shell.add(box(0.14, h, d, wallM, { pos: [xW, h / 2, cz] }));
    // east wall with a door opening (door around z = 4.1..5.1)
    const dz0 = 4.0, dz1 = 5.1;
    shell.add(box(0.14, h, dz0 - zS, wallM, { pos: [xE, h / 2, (zS + dz0) / 2] }));
    shell.add(box(0.14, h, zN - dz1, wallM, { pos: [xE, h / 2, (zN + dz1) / 2] }));
    shell.add(box(0.14, h - 2.2, dz1 - dz0, wallM, { pos: [xE, 2.2 + (h - 2.2) / 2, (dz0 + dz1) / 2] }));
    // buttress corners + window band
    for (const [x, z] of [[xW, zS], [xW, zN], [xE, zS], [xE, zN]]) shell.add(box(0.26, h, 0.26, trimM, { pos: [x, h / 2, z] }));
    shell.add(box(w - 0.5, 1.15, 0.03, glassM, { pos: [cx, 1.75, zS - 0.09], cast: false }));
    shell.add(box(w - 0.5, 0.07, 0.12, trimM, { pos: [cx, 2.35, zS - 0.08] }));
    shell.add(box(w - 0.5, 0.07, 0.12, trimM, { pos: [cx, 1.15, zS - 0.08] }));
    for (let i = 0; i < 3; i++) shell.add(box(0.08, 1.2, 0.1, trimM, { pos: [cx - 1.4 + i * 1.4, 1.75, zS - 0.08] }));
    // door leaf
    const door = group('control-room-door');
    door.add(box(0.06, 2.05, 0.98, material(0x243843, { metalness: 0.4, roughness: 0.5 }), { pos: [xE + 0.06, 1.02, (dz0 + dz1) / 2] }));
    door.add(box(0.02, 0.8, 0.6, glassM, { pos: [xE + 0.1, 1.45, (dz0 + dz1) / 2], cast: false }));
    door.add(cylinder(0.03, 0.03, 0.18, trimM, { pos: [xE + 0.1, 1.0, dz0 + 0.14], rz: Math.PI / 2 }));
    shell.add(door);
    // roof
    this.cat.roof.add(box(w + 0.5, 0.16, d + 0.5, material(0x2b3944, { metalness: 0.35, roughness: 0.55 }), { pos: [cx, h + 0.08, cz] }));
    this.cat.roof.add(box(w + 0.7, 0.1, d + 0.7, trimM, { pos: [cx, h + 0.18, cz] }));
    // roof-mounted HVAC
    this.cat.roof.add(box(1.0, 0.5, 0.8, material(0x8a969e, { metalness: 0.5, roughness: 0.45 }), { pos: [cx + 0.9, h + 0.5, cz - 1.2] }));
    this.cat.roof.add(cylinder(0.24, 0.24, 0.09, material(0x313c44, { metalness: 0.6 }), { pos: [cx + 0.9, h + 0.78, cz - 1.2] }));
    this.cat.walls.add(shell);
    this.scene.addCollider(shell);
    this.addObject(shell, {
      id: 'control-room', label: 'Line Control Room', kind: 'room', iconName: 'shield',
      description: 'Operator control room for the sorting line, HMI and alarm annunciation.',
    });

    // interior console + monitors (equipment category)
    const interior = group('control-room-interior');
    interior.position.set(cx, 0, cz);
    interior.add(box(2.6, 0.08, 0.8, material(0x44545f, { metalness: 0.3, roughness: 0.5 }), { pos: [0, 0.86, -0.7] }));
    interior.add(box(2.5, 0.72, 0.14, material(0x263440, { metalness: 0.3 }), { pos: [0, 0.52, -0.55] }));
    for (const x of [-0.6, 0.1, 0.8]) {
      interior.add(box(0.66, 0.42, 0.04, screenM, { pos: [x, 1.14, -0.68], rx: -0.24, cast: false }));
      interior.add(box(0.09, 0.28, 0.09, material(0x222c33), { pos: [x, 1.0, -0.66] }));
    }
    interior.add(box(0.4, 0.03, 0.3, material(0x303c46), { pos: [-0.2, 0.92, 0.1], cast: false }));
    interior.add(box(0.06, 1.0, 0.06, material(0x3a464f), { pos: [1.0, 0.5, 0.0] }));
    interior.add(box(0.5, 0.06, 0.5, material(0x2a343c), { pos: [1.0, 0.06, 0.0] }));
    interior.add(box(0.46, 0.42, 0.06, screenM, { pos: [1.0, 1.3, -0.15], rx: -0.2, cast: false }));
    interior.add(box(1.4, 0.03, 0.24, lightM, { pos: [0, h - 0.1, -0.6], cast: false }));
    const pl = new THREE.PointLight(0xffe2b0, 2.2, 7, 2);
    pl.position.set(0, h - 0.35, 0);
    interior.add(pl);
    this.cat.equipment.add(interior);
    this.addObject(interior, {
      id: 'control-room.console', label: 'Operator Console', kind: 'hmi', iconName: 'sliders',
      description: 'SCADA workstation monitoring the sorting line, bins and motor condition.',
    });
    this.addObject(door, {
      id: 'control-room.door', label: 'Control Room Door', kind: 'door', iconName: 'door',
      description: 'Access door to the line control room.',
    });
  }

  /* ----------------------------------------------------------
     Conveyor structure, belt, rollers and pulleys
     ---------------------------------------------------------- */
  buildConveyor() {
    const frameMat = material(0x5b6a75, { metalness: 0.68, roughness: 0.36 });
    const darkFrame = material(0x36434d, { metalness: 0.6, roughness: 0.48 });
    const guardMat = material(0xc9a227, { metalness: 0.35, roughness: 0.55 });

    /* -- static support frame -- */
    const frameGroup = group('conveyor-frame');
    const supports = Math.max(10, Math.floor(this.pathLength / 2.5));
    for (let i = 0; i <= supports; i++) {
      const u = 0.012 + (0.976 * i) / Math.max(1, supports);
      const p = this.pointAt(u);
      const lat = this.lateralAt(u);
      for (const side of [-1, 1]) {
        const lx = p.x + lat.x * 0.5 * side;
        const lz = p.z + lat.z * 0.5 * side;
        frameGroup.add(box(0.085, L.beltY - 0.14, 0.085, frameMat, { pos: [lx, (L.beltY - 0.14) / 2, lz] }));
        frameGroup.add(box(0.26, 0.035, 0.26, darkFrame, { pos: [lx, 0.022, lz], cast: false }));
      }
      const l1 = V3(p.x + lat.x * 0.5, 0.36, p.z + lat.z * 0.5);
      const l2 = V3(p.x - lat.x * 0.5, 0.36, p.z - lat.z * 0.5);
      frameGroup.add(cylinderBetween([l1.x, l1.y, l1.z], [l2.x, l2.y, l2.z], 0.032, frameMat, { segments: 8 }));
      frameGroup.add(cylinderBetween([l1.x, l1.y - 0.18, l1.z], [l2.x, l2.y + 0.18, l2.z], 0.024, darkFrame, { segments: 6 }));
      // lateral cradle under the belt
      const cradle = box(0.94, 0.06, 0.06, darkFrame, { pos: [p.x, L.beltY - 0.13, p.z] });
      cradle.rotation.y = yawFor(lat.x, lat.z);
      frameGroup.add(cradle);
    }
    // longitudinal rails at both edges (upper + lower)
    const railPts = (u) => {
      const out = [];
      for (let i = 0; i <= 44; i++) {
        const uu = 0.004 + (0.992 * i) / 44;
        const p = this.pointAt(uu);
        const lat = this.lateralAt(uu);
        out.push([p.x + lat.x * u, p.y + (u > 0.4 ? 0.02 : 0.02), p.z + lat.z * u]);
      }
      return out;
    };
    for (const side of [-1, 1]) {
      frameGroup.add(pipe(railPts(0.475 * side), 0.034, frameMat, { segs: 120, radial: 6 }));
      const lower = railPts(0.5 * side).map(([x, y, z]) => [x, y - 0.22, z]);
      frameGroup.add(pipe(lower, 0.028, darkFrame, { segs: 120, radial: 6 }));
      // safety rail with vertical posts above belt level
      const guardSamples = [];
      for (let i = 0; i <= 40; i++) {
        const uu = 0.01 + (0.98 * i) / 40;
        const p = this.pointAt(uu);
        const lat = this.lateralAt(uu);
        guardSamples.push([p.x + lat.x * 0.56 * side, L.beltY + 0.16, p.z + lat.z * 0.56 * side]);
      }
      frameGroup.add(pipe(guardSamples, 0.022, guardMat, { segs: 110, radial: 5, cast: false }));
    }
    for (let i = 0; i <= 16; i++) {
      const u = 0.02 + (0.96 * i) / 16;
      const p = this.pointAt(u);
      const lat = this.lateralAt(u);
      for (const side of [-1, 1]) {
        frameGroup.add(cylinder(0.018, 0.018, 0.34, guardMat, {
          pos: [p.x + lat.x * 0.56 * side, L.beltY + 0.02, p.z + lat.z * 0.56 * side], segments: 6, cast: false,
        }));
      }
    }
    mergeStaticGroup(frameGroup);
    this.cat.conveyors.add(frameGroup);

    /* -- belt surface -- */
    this.beltTexture = makeBeltTexture();
    const beltMat = new THREE.MeshStandardMaterial({
      map: this.beltTexture, color: 0xdfe8ed, roughness: 0.88, metalness: 0.06,
      emissive: 0x0a0f12, emissiveIntensity: 1,
    });
    const belt = new THREE.Mesh(ribbonGeometry(this.pathCurve, 320, L.beltHalf, 0.0), beltMat);
    belt.castShadow = true;
    belt.receiveShadow = true;
    belt.name = 'belt-top';
    this.cat.conveyors.add(belt);
    this.beltMesh = belt;

    // return strand below the deck
    const returnMat = material(0x1b2328, { roughness: 0.9, metalness: 0.1 });
    const ret = new THREE.Mesh(ribbonGeometry(this.pathCurve, 220, L.beltHalf - 0.03, -0.27), returnMat);
    ret.castShadow = false;
    ret.receiveShadow = true;
    this.cat.conveyors.add(ret);

    // side skirts
    const skirtMat = material(0x2c3840, { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(skirtGeometry(this.pathCurve, 240, 0.455 * side, -0.02, -0.21), skirtMat);
      skirt.castShadow = false;
      skirt.receiveShadow = true;
      this.cat.conveyors.add(skirt);
    }
    // underside deck panel
    const deckMat = material(0x232c33, { metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide });
    const deck = new THREE.Mesh(ribbonGeometry(this.pathCurve, 220, L.beltHalf + 0.02, -0.235), deckMat);
    deck.castShadow = false;
    this.cat.conveyors.add(deck);

    this.buildRollers();
    this.buildPulleys();

    /* -- register the conveyor body -- */
    const body = group('conveyor-body');
    body.position.set(0, 0, 0);
    const proxy = box(0.5, 0.5, 0.5, material(0x000000, { transparent: true, opacity: 0 }), { pos: [0, -20, 0], cast: false, receive: false });
    proxy.userData.ignoreFit = true;
    proxy.userData.noMerge = true;
    body.add(proxy);
    this.cat.conveyors.add(body);
    // register actual belt + frame as interactive root
    this.addObject(belt, {
      id: 'conveyor.line', label: 'Sorting Conveyor CVY-03', kind: 'conveyor', iconName: 'conveyor',
      description: 'U-shaped belt conveyor · 40.6 m transport loop with swing-arm diverter.',
    });
  }

  buildRollers() {
    const count = Math.max(12, Math.round(this.pathLength / 0.62));
    const barrelGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.9, 12, 1, false);
    const ridgeGeo = new THREE.BoxGeometry(0.032, 0.86, 0.034);
    ridgeGeo.translate(0.069, 0, 0);
    const barrel = new THREE.InstancedMesh(barrelGeo, material(0x93a2ad, { metalness: 0.78, roughness: 0.3 }), count);
    const ridge = new THREE.InstancedMesh(ridgeGeo, material(0x243039, { metalness: 0.5, roughness: 0.5 }), count);
    barrel.castShadow = true; barrel.receiveShadow = true;
    ridge.castShadow = false; ridge.receiveShadow = false;
    barrel.frustumCulled = false; ridge.frustumCulled = false;
    const positions = [], quats = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const u = (i + 0.5) / count;
      const p = this.pointAt(u);
      const lat = this.lateralAt(u);
      const q = new THREE.Quaternion().setFromUnitVectors(ARROW_UP, lat);
      positions.push(V3(p.x, L.beltY - 0.075, p.z));
      quats.push(q);
      dummy.position.copy(positions[i]);
      dummy.quaternion.copy(q);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      barrel.setMatrixAt(i, dummy.matrix);
      ridge.setMatrixAt(i, dummy.matrix);
    }
    barrel.instanceMatrix.needsUpdate = true;
    ridge.instanceMatrix.needsUpdate = true;
    this.cat.conveyors.add(barrel, ridge);
    this.rollers = { barrel, ridge, count, positions, quats, angle: 0, spin: new THREE.Quaternion() };
  }

  buildPulleys() {
    const steel = material(0x8796a1, { metalness: 0.82, roughness: 0.28 });
    const dark = material(0x2c3942, { metalness: 0.6, roughness: 0.45 });
    const configs = [
      { u: 0.004, drive: false }, { u: 0.5, drive: true }, { u: 0.996, drive: false },
    ];
    this.pulleys = [];
    for (const cfg of configs) {
      const p = this.pointAt(cfg.u);
      const lat = this.lateralAt(cfg.u);
      const g = group(`pulley-${cfg.u}`);
      g.position.set(p.x, L.beltY - 0.23, p.z);
      g.quaternion.setFromUnitVectors(ARROW_UP, lat);
      const drum = cylinder(0.23, 0.23, 0.94, steel, { segments: 20 });
      g.add(drum);
      for (const s of [-1, 1]) {
        g.add(cylinder(0.255, 0.255, 0.05, dark, { pos: [0, 0.49 * s, 0], segments: 20 }));
        g.add(cylinder(0.09, 0.09, 0.12, dark, { pos: [0, 0.55 * s, 0], segments: 12 }));
      }
      for (let i = 0; i < 3; i++) {
        const spoke = box(0.06, 0.44, 0.05, dark, { pos: [0, 0, 0], cast: false });
        spoke.rotation.y = (i * Math.PI) / 3;
        g.add(spoke);
      }
      this.cat.conveyors.add(g);
      this.pulleys.push({ obj: g, baseQuat: g.quaternion.clone(), angle: 0, drive: cfg.drive, u: cfg.u });
      // bearing pillow blocks + floor support for end pulleys
      if (!cfg.drive) {
        const bearing = group('pulley-bearing');
        bearing.position.set(p.x, L.beltY - 0.23, p.z);
        for (const s of [-1, 1]) {
          bearing.add(box(0.16, 0.2, 0.3, dark, { pos: [lat.x * 0.56 * s, 0, lat.z * 0.56 * s] }));
        }
        this.cat.conveyors.add(bearing);
      }
    }
  }

  /* ----------------------------------------------------------
     Overhead gantries (columns / beams / lighting)
     ---------------------------------------------------------- */
  buildGantries() {
    const steel = material(0x5c6d79, { metalness: 0.66, roughness: 0.38 });
    const darkSteel = material(0x36444e, { metalness: 0.6, roughness: 0.5 });
    const lightPanel = new THREE.MeshStandardMaterial({ color: 0xf3f8ff, emissive: 0xdfeeff, emissiveIntensity: 1.5, roughness: 0.4 });
    for (const gx of [-3.5, 4.5]) {
      for (const gz of [-1.75, 8.65]) {
        this.cat.columns.add(box(0.2, 4.0, 0.2, steel, { pos: [gx, 2.0, gz] }));
        this.cat.columns.add(box(0.3, 0.1, 0.3, darkSteel, { pos: [gx, 3.96, gz] }));
        // hazard band at the base
        const band = box(0.24, 0.4, 0.24, material(0xc9a227, { roughness: 0.6 }), { pos: [gx, 0.55, gz], cast: false });
        this.cat.columns.add(band);
      }
      // main cross beam + truss
      this.cat.beams.add(box(0.24, 0.24, 10.9, steel, { pos: [gx, 4.08, 3.45] }));
      this.cat.beams.add(box(0.16, 0.16, 10.9, darkSteel, { pos: [gx, 3.9, 3.45] }));
      for (let i = 0; i < 4; i++) {
        this.cat.beams.add(cylinderBetween(
          [gx, 3.9, -1.3 + i * 2.5], [gx, 4.08, 0.0 + i * 2.5], 0.03, darkSteel, { segments: 6 },
        ));
      }
      // high-bay LED fixtures above each leg
      for (const lz of [L.legAZ, L.legBZ]) {
        this.cat.lighting.add(roundedBox(0.95, 0.1, 0.3, darkSteel, { pos: [gx, 3.82, lz], radius: 0.03 }));
        this.cat.lighting.add(box(0.84, 0.03, 0.22, lightPanel, { pos: [gx, 3.76, lz], cast: false }));
        this.cat.lighting.add(cylinder(0.02, 0.02, 0.24, darkSteel, { pos: [gx, 3.95, lz], segments: 5, cast: false }));
      }
      const pl = new THREE.PointLight(0xdfeeff, 5.0, 16, 2);
      pl.position.set(gx, 3.55, 3.45);
      this.cat.lighting.add(pl);
      this.lights.push({ light: pl, base: 5.0, mat: lightPanel, baseEmissive: 1.5 });
    }
    // gantry sign hanger
    const sign = signBoard('CVY-03 · U-LOOP SORTER', 3.4, 0.56, { bg: '#0b1720', border: '#ffb547', color: '#ffe6b0' });
    sign.position.set(0.5, 3.55, 9.1);
    this.cat.signs.add(sign);
    this.cat.signs.add(box(3.4, 0.06, 0.06, steel, { pos: [0.5, 3.9, 9.1], cast: false }));
    this.cat.columns.add(box(0.14, 3.9, 0.14, steel, { pos: [-1.2, 1.95, 9.1] }));
    this.cat.columns.add(box(0.14, 3.9, 0.14, steel, { pos: [2.2, 1.95, 9.1] }));
  }

  buildLampPosts() {
    for (const [x, z, id] of [[0, -2.6, 'lamp-1'], [8.5, -2.6, 'lamp-2']]) {
      const lamp = makeLampPost(5.6);
      lamp.position.set(x, 0, z);
      lamp.rotation.y = -Math.PI / 2;
      this.cat.lighting.add(lamp);
      this.lights.push({ light: lamp.userData.light, base: 7, mat: lamp.userData.lampMaterial, baseEmissive: 1.8 });
      this.addObject(lamp, {
        id, label: `Floodlight ${id.endsWith('1') ? '01' : '02'}`, kind: 'lamp', iconName: 'light',
        description: 'Automatic LED floodlighting for the sorting line.',
      });
    }
    this.setLightingState(this.config.lightingOn !== false);
  }

  setLightingState(on) {
    this.lightingOn = !!on;
    for (const l of this.lights) {
      if (!l.light) continue;
      l.light.intensity = on ? l.base : 0;
      if (l.mat) l.mat.emissiveIntensity = on ? l.baseEmissive : 0;
    }
  }

  /* ----------------------------------------------------------
     Drive station (motor, gearbox, fan)
     ---------------------------------------------------------- */
  buildDriveStation() {
    const cast = material(0x50606c, { metalness: 0.55, roughness: 0.45 });
    const dark = material(0x2c363e, { metalness: 0.55, roughness: 0.5 });
    const yellow = material(0xc9a227, { metalness: 0.3, roughness: 0.55 });
    const copper = material(0x9d6b3d, { metalness: 0.7, roughness: 0.35 });

    const motorGroup = group('drive-motor');
    motorGroup.position.set(11.7, 1.02, 3.5);
    const body = cylinder(0.27, 0.27, 0.98, cast, { rz: Math.PI / 2, segments: 20 });
    motorGroup.add(body);
    for (let i = 0; i < 8; i++) {
      motorGroup.add(cylinder(0.305, 0.305, 0.022, cast, { pos: [-0.42 + i * 0.12, 0, 0], rz: Math.PI / 2, segments: 18 }));
    }
    for (const s of [-1, 1]) {
      motorGroup.add(cylinder(0.29, 0.29, 0.09, dark, { pos: [0.53 * s, 0, 0], rz: Math.PI / 2, segments: 20 }));
    }
    // terminal box + data plate
    motorGroup.add(box(0.36, 0.19, 0.3, dark, { pos: [-0.1, 0.33, 0] }));
    motorGroup.add(box(0.3, 0.02, 0.24, material(0x1a2329, { metalness: 0.4 }), { pos: [-0.1, 0.43, 0], cast: false }));
    const plate = signBoard('M-03 · 11 kW', 0.5, 0.16, { bg: '#0d151b', border: '#7f939f', color: '#cfe4ee' });
    plate.position.set(0.05, 0.0, 0.285);
    motorGroup.add(plate);
    motorGroup.add(cylinder(0.03, 0.03, 0.08, copper, { pos: [-0.3, 0.36, 0.1], segments: 6 }));
    // cooling fan shroud + blades at the non-drive end
    const shroud = cylinder(0.32, 0.32, 0.2, dark, { pos: [-0.66, 0, 0], rz: Math.PI / 2, segments: 20, openEnded: true });
    motorGroup.add(shroud);
    for (let i = 0; i < 6; i++) {
      const grille = box(0.34, 0.02, 0.02, dark, { pos: [-0.72, Math.sin(i * Math.PI / 6) * 0.14, Math.cos(i * Math.PI / 6) * 0.14], cast: false });
      grille.rotation.x = (i * Math.PI) / 6;
      motorGroup.add(grille);
    }
    const fan = group('motor-fan');
    fan.position.set(-0.6, 0, 0);
    for (let i = 0; i < 6; i++) {
      const blade = box(0.03, 0.19, 0.11, material(0xa9b7c1, { metalness: 0.6, roughness: 0.35 }), { pos: [0, 0, 0], cast: false });
      blade.rotation.x = (i * Math.PI) / 3;
      blade.position.set(0, Math.cos((i * Math.PI) / 3) * 0.1, Math.sin((i * Math.PI) / 3) * 0.1);
      fan.add(blade);
    }
    fan.add(cylinder(0.045, 0.045, 0.06, dark, { rz: Math.PI / 2, segments: 8 }));
    motorGroup.add(fan);
    this.fanGroup = fan;
    // motor mounting feet
    for (const x of [-0.32, 0.32]) {
      motorGroup.add(box(0.22, 0.12, 0.62, dark, { pos: [x, -0.31, 0] }));
    }
    this.cat.machines.add(motorGroup);
    this.addObject(motorGroup, {
      id: 'drive.motor', label: 'Belt Drive Motor M-03', kind: 'motor', iconName: 'motor',
      description: '11 kW asynchronous drive motor with forced-air cooling fan and thermal protection.',
    });
    this.motorGroup = motorGroup;

    // gearbox + coupling
    const gear = group('drive-gearbox');
    gear.position.set(10.6, 0.86, 3.5);
    gear.add(roundedBox(0.78, 0.86, 0.72, material(0x596977, { metalness: 0.55, roughness: 0.4 }), { pos: [0, 0.12, 0], radius: 0.06 }));
    for (let i = 0; i < 4; i++) gear.add(box(0.8, 0.03, 0.74, dark, { pos: [0, -0.12 + i * 0.2, 0], cast: false }));
    gear.add(cylinder(0.1, 0.1, 0.24, dark, { pos: [0.48, 0.12, 0], rz: Math.PI / 2, segments: 14 }));
    gear.add(cylinder(0.07, 0.07, 0.1, material(0x2a343b, { metalness: 0.7 }), { pos: [0.32, 0.6, 0.1], segments: 10 }));
    // oil sight glass
    gear.add(cylinder(0.05, 0.05, 0.04, material(0xd8b25a, { transparent: true, opacity: 0.8, emissive: 0x6b4f14, emissiveIntensity: 0.6 }), { pos: [0, 0.16, 0.37], rx: Math.PI / 2, segments: 10, cast: false }));
    gear.add(box(0.6, 0.1, 0.24, dark, { pos: [0, -0.3, 0] }));
    this.cat.machines.add(gear);
    this.addObject(gear, {
      id: 'drive.gearbox', label: 'Helical Gearbox GB-03', kind: 'gearbox', iconName: 'equipment',
      description: 'Reduction gearbox transmitting drive-motor torque to the head pulley.',
    });
    this.gearGroup = gear;

    // coupling guard
    const guard = group('drive-coupling-guard');
    guard.position.set(10.02, 1.1, 3.5);
    guard.add(roundedBox(0.55, 0.5, 0.6, yellow, { pos: [0, 0, 0], radius: 0.04 }));
    for (let i = 0; i < 4; i++) guard.add(box(0.57, 0.02, 0.62, dark, { pos: [0, -0.18 + i * 0.12, 0], cast: false }));
    guard.add(box(0.14, 0.05, 0.62, dark, { pos: [-0.2, 0.26, 0], cast: false }));
    this.cat.machines.add(guard);
    this.addObject(guard, {
      id: 'drive.guard', label: 'Coupling Guard', kind: 'guard', iconName: 'shieldCheck',
      description: 'Interlocked guard over the head-pulley drive coupling.',
    });

    // safety fence around drive station
    const fenceMat = material(0xc9a227, { metalness: 0.4, roughness: 0.5 });
    for (const [x, z] of [[9.5, 2.3], [9.5, 4.7], [13.4, 2.3], [13.4, 4.7]]) {
      this.cat.machines.add(box(0.07, 1.1, 0.07, fenceMat, { pos: [x, 0.55, z] }));
    }
    this.cat.machines.add(box(0.06, 0.06, 2.5, fenceMat, { pos: [9.5, 1.02, 3.5] }));
    this.cat.machines.add(box(0.06, 0.06, 2.5, fenceMat, { pos: [13.4, 1.02, 3.5] }));
    this.cat.machines.add(box(3.9, 0.06, 0.06, fenceMat, { pos: [11.45, 1.02, 4.7] }));
    const warn = signBoard('DRIVE UNIT · KEEP CLEAR', 1.6, 0.34, { bg: '#1c1403', border: '#ffb547', color: '#ffe0a3' });
    warn.position.set(9.5, 1.55, 3.5);
    warn.rotation.y = Math.PI / 2;
    this.cat.signs.add(warn);
    this.setLightingState(this.config.lightingOn !== false);
  }

  /* ----------------------------------------------------------
     Sort station & swing-arm diverter
     ---------------------------------------------------------- */
  buildSortStation() {
    const steel = material(0x5b6a75, { metalness: 0.66, roughness: 0.4 });
    const dark = material(0x2f3b44, { metalness: 0.55, roughness: 0.5 });
    const yellow = material(0xc9a227, { metalness: 0.3, roughness: 0.55 });

    const station = group('sort-station');
    // frame posts + beam on the south side of leg B
    for (const x of [-3.6, -0.5]) {
      station.add(box(0.11, 2.15, 0.11, steel, { pos: [x, 1.075, -0.95] }));
      station.add(box(0.22, 0.06, 0.22, dark, { pos: [x, 0.03, -0.95], cast: false }));
    }
    station.add(box(3.3, 0.15, 0.14, steel, { pos: [-2.05, 2.15, -0.95] }));
    station.add(box(3.3, 0.06, 0.08, yellow, { pos: [-2.05, 2.03, -0.95], cast: false }));
    // pedestal + control box at the station
    station.add(box(0.42, 0.22, 0.34, dark, { pos: [-2.05, 2.32, -0.95] }));
    this.cat.machines.add(station);

    const lampM = new THREE.MeshStandardMaterial({ color: 0xffb547, emissive: 0xffb547, emissiveIntensity: 1.8, roughness: 0.35 });
    station.add(cylinder(0.075, 0.075, 0.06, lampM, { pos: [-2.05, 2.52, -0.95], rx: Math.PI / 2, segments: 12, cast: false }));
    this.divertBeacon = lampM;
    const plate = signBoard('SORT STATION', 1.5, 0.36, { bg: '#0e1a20', border: '#ffb547', color: '#ffe6b0' });
    plate.position.set(-2.05, 1.86, -0.88);
    this.cat.signs.add(plate);
    this.addObject(station, {
      id: 'sort.station', label: 'Swing-Arm Sort Station', kind: 'station', iconName: 'conveyor',
      description: 'Photoelectric sort point with pneumatic swing-arm diverter and two discharge chutes.',
    });

    // --- diverter pivot and swinging arm ---
    const pivot = group('diverter-pivot');
    pivot.position.set(-1.05, L.beltY + 0.2, -0.95);
    pivot.add(cylinder(0.09, 0.09, 0.58, dark, { pos: [0, -0.1, 0], segments: 14 }));
    pivot.add(roundedBox(0.3, 0.16, 0.3, steel, { pos: [0, 0.2, 0], radius: 0.03 }));
    const arm = group('diverter-arm');
    // alternating hazard bars along the arm
    const segLen = 0.46;
    for (let i = 0; i < 5; i++) {
      arm.add(box(segLen, 0.16, 0.12, i % 2 === 0 ? yellow : dark, { pos: [0.23 + i * segLen, 0, 0] }));
    }
    // pusher paddle at the tip
    arm.add(box(0.08, 0.5, 0.62, yellow, { pos: [2.36, -0.22, 0] }));
    arm.add(box(0.1, 0.06, 0.66, dark, { pos: [2.36, 0.05, 0], cast: false }));
    arm.add(cylinder(0.05, 0.05, 0.3, dark, { pos: [2.36, 0.18, 0], segments: 8 }));
    pivot.add(arm);
    this.cat.machines.add(pivot);

    // pneumatic cylinder: barrel + piston rod (animated)
    const barrel = cylinder(0.06, 0.06, 1, material(0x8d9aa5, { metalness: 0.7, roughness: 0.35 }), { segments: 12 });
    const rod = cylinder(0.028, 0.028, 1, material(0xc5d1d9, { metalness: 0.85, roughness: 0.25 }), { segments: 10 });
    this.cat.machines.add(barrel, rod);
    // air preparation unit
    const frl = group('air-prep');
    frl.position.set(-3.7, 0.6, -1.2);
    frl.add(box(0.42, 0.5, 0.18, dark, { pos: [0, 0, 0] }));
    frl.add(cylinder(0.06, 0.06, 0.22, material(0x9fb3bf, { metalness: 0.5 }), { pos: [-0.12, 0.2, 0.12], segments: 10 }));
    frl.add(cylinder(0.05, 0.05, 0.05, material(0xd8e2e8, { transparent: true, opacity: 0.7 }), { pos: [-0.12, 0.38, 0.12], segments: 10, cast: false }));
    frl.add(cylinder(0.03, 0.03, 0.12, material(0x8d9aa5), { pos: [0.06, 0.26, 0.12], segments: 8 }));
    frl.add(box(0.06, 0.24, 0.06, yellow, { pos: [0.15, 0.28, 0.12], cast: false }));
    this.cat.machines.add(frl);
    this.addObject(frl, {
      id: 'sort.airprep', label: 'Pneumatic Air Preparation', kind: 'panel', iconName: 'wind',
      description: 'FRL unit supplying filtered, regulated air to the diverter cylinder.',
    });
    // air hose from FRL to cylinder
    this.cat.wiring.add(pipe([[-3.55, 0.86, -1.2], [-3.0, 1.2, -1.35], [-2.0, 1.35, -1.6], [-1.45, 1.35, -1.62]], 0.022, material(0x22303a, { roughness: 0.7 }), { radial: 5, cast: false }));

    this.diverter = {
      pivot, arm, barrel, rod,
      angle: 0, target: 0, auto: this.config.diverter.auto !== false,
      position: this.config.diverter.position || 0,
      cycles: 0, angleNow: 0,
      parkYaw: Math.PI,
      sweep: 1.05, speed: 2.8,
      anchor: V3(-1.05, L.beltY - 0.12, -1.62),
      _attachLocal: V3(0.95, 0, 0),
      pressure: 6.2,
    };
    this.addObject(arm, {
      id: 'diverter.arm', label: 'Pneumatic Diverter Arm', kind: 'diverter', iconName: 'conveyor',
      description: 'Swing-arm diverter that pushes cartons into Bin A chute. Retracted cartons discharge to Bin B.',
    });
    this.applyDiverterTransform(0);
    this.updateDiverterRod();
  }

  applyDiverterTransform(angle) {
    if (!this.diverter) return;
    const d = this.diverter;
    const yaw = d.parkYaw + clamp(angle, 0, 1) * d.sweep;
    d.pivot.rotation.y = yaw;
    d.angle = angle;
    d.angleNow = yaw;
  }

  updateDiverterRod() {
    const d = this.diverter;
    if (!d || !d.rod) return;
    const attachWorld = d._attachLocal.clone().applyAxisAngle(ARROW_UP, d.angleNow).add(d.pivot.position);
    const a = d.anchor, b = attachWorld;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(ARROW_UP, dir.normalize());
    d.barrel.position.copy(mid).add(new THREE.Vector3(0, 0, 0));
    d.barrel.quaternion.copy(q);
    d.barrel.scale.set(1, Math.max(0.001, len * 0.62), 1);
    d.barrel.position.lerp(a, 0.31);
    d.rod.position.copy(mid);
    d.rod.quaternion.copy(q);
    d.rod.scale.set(1, Math.max(0.001, len), 1);
  }

  /* ----------------------------------------------------------
     Discharge chutes
     ---------------------------------------------------------- */
  buildChutes() {
    const sheet = material(0x6f7f8b, { metalness: 0.7, roughness: 0.38, side: THREE.DoubleSide });
    const dark = material(0x333f48, { metalness: 0.55, roughness: 0.5 });
    const yellow = material(0xc9a227, { metalness: 0.3, roughness: 0.55 });
    const mk = (points, id, label, desc) => {
      const curve = new THREE.CatmullRomCurve3(points.map(p => V3(...p)), false, 'centripetal', 0.4);
      const g = group(id);
      const floor = new THREE.Mesh(ribbonGeometry(curve, 26, 0.44, 0), sheet);
      floor.castShadow = true; floor.receiveShadow = true;
      g.add(floor);
      const wallMat = material(0x4a5862, { metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide });
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(skirtGeometry(curve, 26, 0.44 * side, 0.02, -0.2), wallMat);
        wall.castShadow = false;
        g.add(wall);
      }
      // side guard rails
      for (const side of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 12; i++) {
          const u = i / 12;
          const p = curve.getPointAt(u);
          const t = curve.getTangentAt(u);
          const lat = V3(t.z, 0, -t.x).normalize();
          pts.push([p.x + lat.x * 0.46 * side, p.y + 0.16, p.z + lat.z * 0.46 * side]);
        }
        g.add(pipe(pts, 0.022, yellow, { segs: 30, radial: 5, cast: false }));
      }
      // support legs
      for (const u of [0.35, 0.75, 1.0]) {
        const p = curve.getPointAt(u);
        g.add(cylinder(0.035, 0.035, Math.max(0.05, p.y - 0.18), dark, { pos: [p.x, (p.y - 0.18) / 2, p.z], segments: 8 }));
        g.add(box(0.16, 0.03, 0.16, dark, { pos: [p.x, 0.015, p.z], cast: false }));
      }
      this.cat.machines.add(g);
      this.addObject(g, { id: `chute.${id.slice(-1)}`, label, kind: 'chute', iconName: 'chevronRight', description: desc });
      return curve;
    };
    this.chuteCurveA = mk([
      [-2.2, L.beltY + 0.01, 0.56], [-2.2, 1.32, 1.02], [-2.2, 1.22, 1.44], [-2.2, 1.13, 1.8],
    ], 'chute-A', 'Discharge Chute A', 'Gravity chute directing diverted cartons into collection Bin A.');
    this.chuteCurveB = mk([
      [-5.25, L.beltY + 0.01, 0.56], [-5.5, 1.3, 1.05], [-5.95, 1.2, 1.45], [-6.35, 1.11, 1.8],
    ], 'chute-B', 'Discharge Chute B', 'End-of-line gravity chute feeding cartons into collection Bin B.');
  }

  /* ----------------------------------------------------------
     Collection bins
     ---------------------------------------------------------- */
  buildBins() {
    const frame = material(0x44525e, { metalness: 0.6, roughness: 0.42 });
    const dark = material(0x263139, { metalness: 0.55, roughness: 0.5 });
    const wall = material(0x506472, { metalness: 0.45, roughness: 0.5, transparent: true, opacity: 0.52, depthWrite: false, side: THREE.DoubleSide });
    const yellow = material(0xc9a227, { metalness: 0.3, roughness: 0.55 });
    for (const key of ['A', 'B']) {
      const bx = key === 'A' ? L.binAX : L.binBX;
      const bz = key === 'A' ? L.binAZ : L.binBZ;
      const w = L.binW, d = L.binD, h = L.binH;
      const g = group(`bin-${key}`);
      g.position.set(bx, 0, bz);
      // base + casters
      g.add(box(w, 0.1, d, frame, { pos: [0, 0.07, 0] }));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(cylinder(0.075, 0.075, 0.05, dark, { pos: [sx * (w / 2 - 0.16), 0.05, sz * (d / 2 - 0.16)], rx: Math.PI / 2, segments: 12 }));
        g.add(box(0.16, 0.04, 0.1, dark, { pos: [sx * (w / 2 - 0.16), 0.11, sz * (d / 2 - 0.16)], cast: false }));
      }
      // walls
      g.add(box(w, h - 0.12, 0.045, wall, { pos: [0, 0.12 + (h - 0.12) / 2, d / 2 - 0.02], cast: false }));
      g.add(box(w, h - 0.12, 0.045, wall, { pos: [0, 0.12 + (h - 0.12) / 2, -d / 2 + 0.02], cast: false }));
      g.add(box(0.045, h - 0.12, d, wall, { pos: [w / 2 - 0.02, 0.12 + (h - 0.12) / 2, 0], cast: false }));
      g.add(box(0.045, h - 0.12, d, wall, { pos: [-w / 2 + 0.02, 0.12 + (h - 0.12) / 2, 0], cast: false }));
      // corner posts + rim
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        g.add(box(0.1, h, 0.1, frame, { pos: [sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03)] }));
      }
      for (const sz of [-1, 1]) g.add(box(w + 0.06, 0.07, 0.1, frame, { pos: [0, h - 0.035, sz * (d / 2 - 0.03)] }));
      for (const sx of [-1, 1]) g.add(box(0.1, 0.07, d + 0.06, frame, { pos: [sx * (w / 2 - 0.03), h - 0.035, 0] }));
      // side ribs + hazard band
      for (let i = 0; i < 3; i++) {
        for (const sz of [-1, 1]) g.add(box(0.08, 0.72, 0.05, dark, { pos: [-0.72 + i * 0.72, 0.55, sz * (d / 2 + 0.03)], cast: false }));
      }
      g.add(box(w + 0.02, 0.12, d + 0.02, yellow, { pos: [0, 0.18, 0], cast: false }));
      // label sign
      const label = signBoard(key === 'A' ? 'BIN A · SORT' : 'BIN B · DISCHARGE', 1.35, 0.34, { bg: '#0c1720', border: key === 'A' ? '#ffb547' : '#46a9ff', color: '#e4f2fa' });
      label.position.set(0, 0.86, d / 2 + 0.06);
      g.add(label);
      // fill level gauge on the front face
      g.add(box(0.12, h - 0.26, 0.03, dark, { pos: [w / 2 - 0.22, 0.12 + (h - 0.26) / 2, d / 2 + 0.05], cast: false }));
      const fillMat = new THREE.MeshStandardMaterial({ color: 0x36e2c2, emissive: 0x36e2c2, emissiveIntensity: 1.4, roughness: 0.4 });
      const fillBar = box(0.07, h - 0.32, 0.022, fillMat, { pos: [w / 2 - 0.22, 0.16, d / 2 + 0.068], cast: false });
      fillBar.scale.y = 0.01;
      g.add(fillBar);
      // status beacon post
      g.add(cylinder(0.03, 0.03, 0.3, dark, { pos: [-w / 2 + 0.22, h + 0.12, d / 2 - 0.12], segments: 6 }));
      const beaconMat = new THREE.MeshStandardMaterial({ color: 0x3ce58b, emissive: 0x3ce58b, emissiveIntensity: 1.8, roughness: 0.35 });
      g.add(sphere(0.055, beaconMat, { pos: [-w / 2 + 0.22, h + 0.3, d / 2 - 0.12], segments: 10, cast: false }));
      // contents container (boxes get reparented here)
      const contents = group('bin-contents');
      g.add(contents);
      this.cat.bins.add(g);
      const cap = key === 'A' ? (this.config.bins.capacityA || 12) : (this.config.bins.capacityB || 12);
      this.binData[key] = {
        key, name: key === 'A' ? 'Collection Bin A' : 'Collection Bin B',
        x: bx, z: bz, x0: 0, z0: 0, count: 0, capacity: cap,
        group: g, contents, fillBar, fillMat, beaconMat,
        full: false, lastFullWarn: 0, sorted: 0, sensorId: key === 'A' ? 'bin-a-fill' : 'bin-b-fill',
      };
      this.addObject(g, {
        id: `bin.${key}`, label: this.binData[key].name, kind: 'bin', iconName: 'inventory',
        description: key === 'A' ? 'Collection bin for diverted cartons (Bin A).' : 'Collection bin at the end of the line (Bin B).',
      });
      this.updateBinVisual(this.binData[key]);
    }
  }

  updateBinVisual(bin) {
    if (!bin) return;
    const pct = bin.capacity > 0 ? (bin.count / bin.capacity) * 100 : 0;
    bin.fill = pct;
    bin.full = pct >= 100;
    if (bin.fillBar) bin.fillBar.scale.y = clamp(pct / 100, 0.01, 1);
    if (bin.fillMat) {
      const col = pct >= 100 ? 0xff4a5f : pct >= 80 ? 0xffb547 : 0x36e2c2;
      bin.fillMat.color.setHex(col);
      bin.fillMat.emissive.setHex(col);
    }
    if (bin.beaconMat) {
      const col = pct >= 100 ? 0xff4a5f : pct >= 80 ? 0xffb547 : 0x3ce58b;
      bin.beaconMat.color.setHex(col);
      bin.beaconMat.emissive.setHex(col);
    }
  }

  /* ----------------------------------------------------------
     Barcode scanner gantry
     ---------------------------------------------------------- */
  buildScanner() {
    const steel = material(0x53636f, { metalness: 0.65, roughness: 0.4 });
    const dark = material(0x2b363e, { metalness: 0.6, roughness: 0.5 });
    const g = group('barcode-scanner');
    g.position.set(1.6, 0, L.legBZ);
    for (const sz of [-1, 1]) {
      g.add(box(0.1, 2.2, 0.1, steel, { pos: [0, 1.1, sz * 0.82] }));
      g.add(box(0.26, 0.05, 0.26, dark, { pos: [0, 0.03, sz * 0.82], cast: false }));
    }
    g.add(box(0.16, 0.16, 1.9, steel, { pos: [0, 2.2, 0] }));
    g.add(box(0.2, 0.08, 1.94, dark, { pos: [0, 2.31, 0] }));
    // scanner heads
    for (const sz of [-0.55, 0, 0.55]) {
      g.add(roundedBox(0.26, 0.16, 0.2, dark, { pos: [0, 2.02, sz], radius: 0.03 }));
      g.add(cylinder(0.04, 0.04, 0.05, emissive(0xff3344, 2.0), { pos: [0, 1.94, sz], rx: Math.PI / 2, segments: 10, cast: false }));
    }
    // laser curtain across the belt
    const laser = box(0.03, 0.012, 1.0, new THREE.MeshBasicMaterial({ color: 0xff3344, transparent: true, opacity: 0.7 }), { pos: [0, 1.52, 0], cast: false });
    g.add(laser);
    this.scannerLamp = laser;
    // side display
    g.add(box(0.05, 0.34, 0.46, dark, { pos: [0.14, 1.5, 0.95] }));
    const screenM = new THREE.MeshStandardMaterial({ color: 0x04171c, emissive: 0x2aa8a0, emissiveIntensity: 0.9, roughness: 0.3 });
    g.add(box(0.02, 0.26, 0.36, screenM, { pos: [0.17, 1.5, 0.95], cast: false }));
    const label = signBoard('BARCODE SCAN', 1.1, 0.28, { bg: '#06161d', border: '#36e2c2', color: '#bdf9ed' });
    label.position.set(0, 2.54, 0);
    g.add(label);
    this.cat.equipment.add(g);
    this.addObject(g, {
      id: 'scanner.barcode', label: 'Barcode Scan Tunnel', kind: 'scanner', iconName: 'search',
      description: 'Laser barcode scanner that classifies each carton before the sort point.',
    });
    this.scannerGroup = g;
  }

  /* ----------------------------------------------------------
     Infeed station
     ---------------------------------------------------------- */
  buildInfeed() {
    const steel = material(0x5a6a76, { metalness: 0.65, roughness: 0.4 });
    const dark = material(0x2d3841, { metalness: 0.55, roughness: 0.5 });
    const g = group('infeed-station');
    g.position.set(-12.5, 0, L.legAZ);
    // roller table
    g.add(box(2.3, 0.1, 1.0, steel, { pos: [0, 1.3, 0] }));
    for (let i = 0; i < 6; i++) {
      g.add(cylinder(0.05, 0.05, 0.92, dark, { pos: [-1.0 + i * 0.4, 1.37, 0], rx: Math.PI / 2, segments: 10, cast: false }));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(box(0.08, 1.3, 0.08, steel, { pos: [sx * 1.05, 0.65, sz * 0.42] }));
    }
    // side guides
    for (const sz of [-1, 1]) g.add(box(2.4, 0.12, 0.06, dark, { pos: [0, 1.45, sz * 0.5], cast: false }));
    // hazard band
    g.add(box(2.32, 0.1, 1.02, material(0xc9a227, { roughness: 0.6 }), { pos: [0, 1.24, 0], cast: false }));
    // static carton magazine
    for (let i = 0; i < 3; i++) {
      const carton = makeCardboardBox(0.5, 0.4, 0.5, 0xb98a52, '');
      carton.position.set(-0.9 + i * 0.02, 1.36 + i * 0.4, 0.1 * (i - 1));
      carton.rotation.y = 0.12 * i;
      g.add(carton);
    }
    const sign = signBoard('INFEED', 1.2, 0.36, { bg: '#071821', border: '#36e2c2', color: '#c8f7ee' });
    sign.position.set(0, 2.0, 0.55);
    g.add(sign);
    g.add(box(0.08, 0.9, 0.08, steel, { pos: [0.4, 1.6, 0.62] }));
    this.cat.machines.add(g);
    this.addObject(g, {
      id: 'infeed.station', label: 'Carton Infeed Station', kind: 'infeed', iconName: 'package',
      description: 'Manual/automatic carton infeed with photo-eye entry detection.',
    });
    this.infeedGroup = g;
  }

  /* ----------------------------------------------------------
     Control cabinet, HMI, E-stop, tower lights
     ---------------------------------------------------------- */
  buildCabinet() {
    const cab = makeControlCabinet(1.35, 2.05, 0.62, { color: 0x394854, doorColor: 0x465661 });
    cab.position.set(L.cabinetX, 0, L.cabinetZ);
    this.cat.equipment.add(cab);
    this.addObject(cab, {
      id: 'cabinet.main', label: 'Line Control Cabinet', kind: 'cabinet', iconName: 'panel',
      description: 'PLC cabinet with motor starter, VFD, safety relay and line HMI.',
    });
    // extra HMI display + status beacon on top of the cabinet
    const screenM = new THREE.MeshStandardMaterial({ color: 0x04161c, emissive: 0x1f8f84, emissiveIntensity: 0.9, roughness: 0.3 });
    cab.add(box(0.6, 0.34, 0.02, screenM, { pos: [0, 1.62, 0.33], cast: false }));
    cab.add(box(0.66, 0.4, 0.015, material(0x0b1319), { pos: [0, 1.62, 0.32], cast: false }));
    const beaconM = new THREE.MeshStandardMaterial({ color: 0x3ce58b, emissive: 0x3ce58b, emissiveIntensity: 1.6, roughness: 0.35 });
    cab.add(cylinder(0.055, 0.055, 0.1, beaconM, { pos: [0, 2.14, 0], segments: 12, cast: false }));
    this.cabinetBeacon = beaconM;
    const plate = signBoard('SORT CONTROLLER · PLC-03', 1.25, 0.26, { bg: '#0b1620', border: '#7f939f', color: '#cfe4ee' });
    plate.position.set(0, 1.98, 0.33);
    cab.add(plate);

    // operator HMI pedestal beside the cabinet
    const hmi = group('hmi-pedestal');
    hmi.position.set(-8.35, 0, 4.35);
    hmi.add(cylinder(0.08, 0.12, 1.05, material(0x3c4a55, { metalness: 0.5 }), { pos: [0, 0.52, 0] }));
    hmi.add(box(0.16, 0.04, 0.16, material(0x2b363e), { pos: [0, 0.02, 0], cast: false }));
    hmi.add(box(0.62, 0.42, 0.24, material(0x2f3d47, { metalness: 0.45, roughness: 0.5 }), { pos: [0, 1.18, 0], rx: -0.35 }));
    hmi.add(box(0.54, 0.34, 0.02, screenM, { pos: [0, 1.2, 0.13], rx: -0.35, cast: false }));
    this.cat.equipment.add(hmi);
    this.addObject(hmi, {
      id: 'panel.hmi', label: 'Operator HMI Panel', kind: 'panel', iconName: 'sliders',
      description: 'Touch HMI for line start/stop, sorting recipes and jam recovery.',
    });
  }

  buildEstop() {
    const body = material(0x3a4650, { metalness: 0.45, roughness: 0.5 });
    const yellow = material(0xc9a227, { metalness: 0.3, roughness: 0.55 });
    const g = group('estop');
    g.position.set(-7.55, 0, 4.55);
    g.add(box(0.3, 0.95, 0.3, body, { pos: [0, 0.48, 0] }));
    g.add(box(0.4, 0.04, 0.4, material(0x262f36), { pos: [0, 0.02, 0], cast: false }));
    g.add(box(0.42, 0.2, 0.36, body, { pos: [0, 1.02, 0], rx: -0.35 }));
    g.add(box(0.42, 0.16, 0.02, yellow, { pos: [0, 0.98, 0.19], rx: -0.35, cast: false }));
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xff3344, emissiveIntensity: 1.8, roughness: 0.35 });
    const btn = cylinder(0.115, 0.115, 0.07, lampMat, { pos: [0, 1.13, 0.07], rx: -0.35, segments: 18 });
    g.add(btn);
    const ring = cylinder(0.16, 0.16, 0.03, yellow, { pos: [0, 1.1, 0.06], rx: -0.35, segments: 20 });
    g.add(ring);
    this.estopLamp = lampMat;
    const sign = signBoard('E-STOP', 0.42, 0.16, { bg: '#1c0608', border: '#ff4a5f', color: '#ffd0d5' });
    sign.position.set(0, 0.78, 0.17);
    g.add(sign);
    this.cat.equipment.add(g);
    this.addObject(g, {
      id: 'estop.button', label: 'Emergency Stop Pushbutton', kind: 'estop', iconName: 'power',
      description: 'Line emergency stop. Press to trip the drive, release and reset to recover.',
    });
    this.estopGroup = g;
  }

  buildTowerLights() {
    const mk = (x, z, id, label) => {
      const tower = makeTowerLight('ok');
      tower.position.set(x, 0, z);
      this.cat.lighting.add(tower);
      this.towerLights.push(tower);
      this.addObject(tower, {
        id, label, kind: 'stacklight', iconName: 'light',
        description: 'Three-colour stack light indicating line status.',
      });
      return tower;
    };
    this.towerLight = mk(-8.9, 4.9, 'tower.light', 'Line Stack Light');
    mk(12.9, 2.05, 'tower.light.2', 'Drive Stack Light');
  }

  /* ----------------------------------------------------------
     Wiring
     ---------------------------------------------------------- */
  buildWiring() {
    const cable = material(0x1f2c34, { roughness: 0.65, metalness: 0.15 });
    const tray = material(0x49565f, { metalness: 0.55, roughness: 0.5 });
    // main cable tray from cabinet to drive station along the floor
    this.cat.wiring.add(pipe([
      [-9.4, 0.12, 3.9], [-7.2, 0.12, 3.4], [-4.0, 0.12, 2.9], [0.5, 0.12, 2.7],
      [5.5, 0.12, 2.4], [9.4, 0.12, 2.3], [11.0, 0.12, 2.6], [11.7, 0.12, 3.0], [12.0, 0.85, 3.3],
    ], 0.05, cable, { radial: 6, cast: false }));
    // tray covers + junction boxes
    for (const [x, z] of [[-7.2, 3.4], [-1.0, 2.8], [5.5, 2.4], [10.2, 2.35]]) {
      this.cat.wiring.add(box(0.4, 0.1, 0.3, tray, { pos: [x, 0.06, z], cast: false }));
    }
    // drop to sort station
    this.cat.wiring.add(pipe([[-2.6, 0.12, 2.9], [-2.3, 0.5, 1.4], [-2.2, 1.2, 0.2], [-2.0, 1.9, -0.6], [-2.05, 2.2, -0.9]], 0.035, cable, { radial: 5, cast: false }));
    // conduit along the belt frame (south side)
    const conduitPts = [];
    for (let i = 0; i <= 30; i++) {
      const u = 0.04 + (0.92 * i) / 30;
      const p = this.pointAt(u);
      const lat = this.lateralAt(u);
      conduitPts.push([p.x - lat.x * 0.6, p.y - 0.18, p.z - lat.z * 0.6]);
    }
    this.cat.wiring.add(pipe(conduitPts, 0.028, cable, { segs: 100, radial: 5, cast: false }));
    // cabinet conduit up
    this.cat.wiring.add(pipe([[-9.4, 0.1, 2.9], [-9.4, 1.2, 3.1], [-9.4, 2.1, 3.2]], 0.04, tray, { radial: 6, cast: false }));
  }

  /* ----------------------------------------------------------
     Signage
     ---------------------------------------------------------- */
  buildSignage() {
    const steel = material(0x6a7a85, { metalness: 0.6, roughness: 0.42 });
    // line identification gantry sign
    const sign = signBoard('NEXUS · SORTATION LINE 03', 4.2, 0.66, { bg: '#08141c', border: '#ffb547', color: '#ffe6b0' });
    sign.position.set(-0.6, 3.4, 9.12);
    this.cat.signs.add(sign);
    this.cat.signs.add(box(4.2, 0.06, 0.1, steel, { pos: [-0.6, 3.78, 9.12] }));
    // direction boards above the chutes
    const aSign = signBoard('BIN A  ◂', 1.2, 0.36, { bg: '#120d03', border: '#ffb547', color: '#ffe6b0' });
    aSign.position.set(-2.2, 2.1, 1.25);
    aSign.rotation.y = 0;
    this.cat.signs.add(aSign);
    const bSign = signBoard('BIN B  ◂', 1.2, 0.36, { bg: '#060f18', border: '#46a9ff', color: '#d6ecff' });
    bSign.position.set(-6.4, 2.1, 1.25);
    this.cat.signs.add(bSign);
    // hazard / safety signage
    const hazard = signBoard('PINCH POINT · KEEP HANDS CLEAR', 1.7, 0.32, { bg: '#1c1403', border: '#ffb547', color: '#ffe0a3' });
    hazard.position.set(4.9, 1.55, -0.55);
    this.cat.signs.add(hazard);
    const eye = signBoard('AUTOMATED EQUIPMENT', 1.7, 0.3, { bg: '#071821', border: '#36e2c2', color: '#c8f7ee' });
    eye.position.set(-9.9, 1.7, 5.8);
    eye.rotation.y = 0.4;
    this.cat.signs.add(eye);
    const eyePost = box(0.1, 2.2, 0.1, steel, { pos: [-9.9, 1.1, 5.85] });
    this.cat.signs.add(eyePost);
    // exit marking on the floor
    const exitSign = signBoard('CARTON FLOW →', 2.2, 0.4, { bg: '#071821', border: '#36e2c2', color: '#c8f7ee' });
    exitSign.position.set(-10.4, 2.2, L.legAZ - 0.62);
    exitSign.rotation.y = 0.15;
    this.cat.signs.add(exitSign);
  }

  /* ----------------------------------------------------------
     Sensor nodes (9 physical devices)
     ---------------------------------------------------------- */
  buildSensorNodes() {
    const nodes = [
      ['entry-present', [-10.85, 1.16, L.legAZ + 0.86], [0, -0.6, 0], 0.95],
      ['exit-present', [-4.35, 1.16, L.legBZ + 0.86], [0, 0.6, 0], 0.95],
      ['sort-sensor', [-2.9, 1.12, L.legBZ + 0.8], [0, 0.9, 0], 0.9],
      ['belt-speed', [-10.6, 0.72, L.legAZ - 0.6], [0, 0, 0], 0.8],
      ['motor-current', [11.7, 1.5, 3.95], [0, 0, 0], 0.8],
      ['motor-temp', [11.35, 1.32, 3.15], [0, 0.7, 0], 0.8],
      ['jam-sensor', [-3.8, 1.2, L.legBZ + 0.85], [0, 0.9, 0], 0.9],
      ['bin-a-fill', [L.binAX - L.binW / 2 + 0.2, 1.42, L.binAZ + L.binD / 2 + 0.1], [0, 0.2, 0], 0.85],
      ['bin-b-fill', [L.binBX - L.binW / 2 + 0.2, 1.42, L.binBZ + L.binD / 2 + 0.1], [0, 0.2, 0], 0.85],
    ];
    for (const [id, pos, rot, scale] of nodes) {
      const s = this.sensors.get(id);
      if (!s) continue;
      const node = this.createSensorNode(s, { position: pos, rotation: rot, scale, label: true, labelOffset: 0.42, labelScale: 0.44 });
      this.cat.sensors.add(node);
    }
    // sensor mounting brackets / reflectors (decorative)
    const bracket = material(0x4b5a66, { metalness: 0.6, roughness: 0.4 });
    for (const [x, y, z, dz] of [[-10.85, 1.05, L.legAZ + 0.62, 0], [-4.35, 1.05, L.legBZ + 0.62, 0], [-2.9, 1.05, L.legBZ + 0.58, 0]]) {
      this.cat.conveyors.add(box(0.06, 0.06, 0.28, bracket, { pos: [x, y, z], cast: false }));
    }
    // reflectors on the opposite side of the belt
    const reflector = emissive(0xd9e4ea, 0.6);
    for (const [x, z] of [[-10.85, L.legAZ - 0.52], [-4.35, L.legBZ - 0.28], [-2.9, L.legBZ - 0.26]]) {
      this.cat.conveyors.add(box(0.1, 0.1, 0.02, reflector, { pos: [x, 1.12, z], cast: false }));
    }
  }

  /* ----------------------------------------------------------
     Distant backdrop
     ---------------------------------------------------------- */
  buildBackground() {
    const bgM = material(0x0b1116, { roughness: 0.96, metalness: 0 });
    for (let i = 0; i < 7; i++) {
      const w = 8 + Math.random() * 9, h = 3 + Math.random() * 5, d = 6 + Math.random() * 6;
      const x = -46 + i * 15 + Math.random() * 4;
      const b = box(w, h, d, bgM, { pos: [x, h / 2 - 0.1, -34 - Math.random() * 12], cast: false, receive: false });
      this.scene.world.add(b);
      const stripe = box(w * 0.7, 0.07, 0.09, new THREE.MeshBasicMaterial({ color: 0x2b7d86, transparent: true, opacity: 0.28 }), { pos: [x, h * 0.62, -34 + d / 2 + 0.1], cast: false });
      this.scene.world.add(stripe);
    }
    // perimeter fence behind the line
    const fenceM = material(0x39474f, { metalness: 0.5, roughness: 0.55 });
    for (let x = -20; x <= 16; x += 2.4) this.scene.world.add(box(0.08, 1.6, 0.08, fenceM, { pos: [x, 0.8, 12.4], cast: false }));
    this.scene.world.add(box(36.4, 0.06, 0.06, fenceM, { pos: [-2, 1.35, 12.4], cast: false }));
    this.scene.world.add(box(36.4, 0.06, 0.06, fenceM, { pos: [-2, 0.55, 12.4], cast: false }));
  }

  /* ----------------------------------------------------------
     Static geometry optimisation
     ---------------------------------------------------------- */
  optimizeStaticGeometry() {
    for (const id of ['floor', 'foundation', 'walls', 'roof', 'columns', 'beams', 'wiring', 'signs']) {
      const g = this.cat[id];
      if (!g) continue;
      try { mergeStaticGroup(g, { forceNoShadow: id === 'floor' }); } catch (err) { console.warn('merge failed', id, err); }
    }
  }

  /* ----------------------------------------------------------
     Equipment registry
     ---------------------------------------------------------- */
  buildEquipmentList() {
    this.addEquipment({ id: 'conveyor-line', name: 'Belt Conveyor CVY-03', type: 'conveyor', iconName: 'conveyor', objectId: 'conveyor.line', status: () => this.lineState, tone: () => this.lineState === 'RUNNING' ? 'ok' : this.lineState === 'FAULT' ? 'danger' : 'warn' });
    this.addEquipment({ id: 'drive-motor', name: 'Drive Motor M-03', type: 'motor', iconName: 'motor', objectId: 'drive.motor', status: () => this.motor?.on ? (this.motor.trip ? 'THERMAL TRIP' : 'ENERGISED') : 'OFF', tone: () => this.motor?.trip ? 'danger' : this.motor?.on ? 'ok' : 'muted' });
    this.addEquipment({ id: 'gearbox', name: 'Helical Gearbox GB-03', type: 'gearbox', iconName: 'equipment', objectId: 'drive.gearbox', status: () => this.belt?.speed > 0.05 ? 'TRANSMITTING' : 'IDLE', tone: () => this.belt?.speed > 0.05 ? 'ok' : 'muted' });
    this.addEquipment({ id: 'diverter', name: 'Pneumatic Diverter', type: 'sorter', iconName: 'conveyor', objectId: 'diverter.arm', status: () => this.diverter?.auto ? (this.diverter.angle > 0.5 ? 'DIVERTING' : 'STRAIGHT') : 'MANUAL', tone: () => this.diverter?.auto ? 'ok' : 'warn' });
    this.addEquipment({ id: 'scanner', name: 'Barcode Scan Tunnel', type: 'scanner', iconName: 'search', objectId: 'scanner.barcode', status: () => this.faults.scanner ? 'FAULT' : 'SCANNING', tone: () => this.faults.scanner ? 'danger' : 'ok' });
    this.addEquipment({ id: 'bin-a', name: 'Collection Bin A', type: 'bin', iconName: 'inventory', objectId: 'bin.A', status: () => `${Math.round(this.binPct('A'))}% · ${this.binData.A?.count ?? 0}/${this.binData.A?.capacity ?? 0}`, tone: () => this.binPct('A') >= 100 ? 'danger' : this.binPct('A') >= 80 ? 'warn' : 'ok' });
    this.addEquipment({ id: 'bin-b', name: 'Collection Bin B', type: 'bin', iconName: 'inventory', objectId: 'bin.B', status: () => `${Math.round(this.binPct('B'))}% · ${this.binData.B?.count ?? 0}/${this.binData.B?.capacity ?? 0}`, tone: () => this.binPct('B') >= 100 ? 'danger' : this.binPct('B') >= 80 ? 'warn' : 'ok' });
    this.addEquipment({ id: 'controller', name: 'Line Control Cabinet', type: 'controller', iconName: 'panel', objectId: 'cabinet.main', status: () => this.manualMode ? 'MANUAL' : 'AUTOMATIC', tone: () => this.manualMode ? 'warn' : 'ok' });
    this.addEquipment({ id: 'stacklight', name: 'Line Stack Light', type: 'signalling', iconName: 'light', objectId: 'tower.light', status: () => this.stackLightState.toUpperCase(), tone: () => this.stackLightState === 'red' ? 'danger' : this.stackLightState === 'amber' ? 'warn' : 'ok' });
  }

  /* ==========================================================
     SENSORS / ALARMS / ANALYTICS
     ========================================================== */
  defineSensors() {
    return [
      { id: 'entry-present', name: 'Entry Presence', unit: '', min: 0, max: 1, digits: 0, value: 0, iconName: 'sensor', alarmLow: -1, alarmHigh: 2 },
      { id: 'exit-present', name: 'Exit Presence', unit: '', min: 0, max: 1, digits: 0, value: 0, iconName: 'sensor', alarmLow: -1, alarmHigh: 2 },
      { id: 'sort-sensor', name: 'Sort Photocell', unit: '', min: 0, max: 1, digits: 0, value: 0, iconName: 'sensor', alarmLow: -1, alarmHigh: 2 },
      { id: 'belt-speed', name: 'Belt Speed', unit: 'm/s', min: 0, max: 3, digits: 2, value: 0, iconName: 'activity', alarmLow: -1, alarmHigh: 3 },
      { id: 'motor-current', name: 'Motor Current', unit: 'A', min: 0, max: 12, digits: 2, value: 0, iconName: 'bolt', alarmLow: -1, alarmHigh: 9 },
      { id: 'motor-temp', name: 'Motor Temperature', unit: '°C', min: 0, max: 120, digits: 1, value: 24, iconName: 'thermometer', alarmLow: -1, alarmHigh: 90 },
      { id: 'bin-a-fill', name: 'Bin A Fill Level', unit: '%', min: 0, max: 100, digits: 0, value: 0, iconName: 'inventory', alarmLow: -1, alarmHigh: 95 },
      { id: 'bin-b-fill', name: 'Bin B Fill Level', unit: '%', min: 0, max: 100, digits: 0, value: 0, iconName: 'inventory', alarmLow: -1, alarmHigh: 95 },
      { id: 'jam-sensor', name: 'Jam Detector', unit: '', min: 0, max: 1, digits: 0, value: 0, iconName: 'warning', alarmLow: -1, alarmHigh: 2 },
    ];
  }

  defineAlarmRules() {
    return [
      {
        id: 'jam', title: 'Conveyor Jam Detected', severity: 'critical',
        thresholdKey: 'jamSeconds', defaultThreshold: 6, thresholdLabel: 'Jam detection time', thresholdUnit: 's', thresholdMin: 1, thresholdMax: 60, thresholdStep: 1,
        message: () => this.jamActive
          ? `Carton blocked on the belt for more than ${this.threshold('jamSeconds', 6)} s (${this.jamCause || 'obstruction'}). Drive tripped.`
          : 'A carton is not advancing along the conveyor.',
        active: () => this.jamActive,
      },
      {
        id: 'motor-overheat', title: 'Motor Overheating', severity: 'critical',
        thresholdKey: 'motorOverheatTemp', defaultThreshold: 78, thresholdLabel: 'Overheat trip temperature', thresholdUnit: '°C', thresholdMin: 40, thresholdMax: 120, thresholdStep: 1,
        message: () => `Drive motor temperature ${num(this.motor?.temp, 1)} °C exceeds the ${this.threshold('motorOverheatTemp', 78)} °C trip limit.`,
        active: () => (this.motor?.temp ?? 0) >= this.threshold('motorOverheatTemp', 78),
      },
      {
        id: 'unexpected-stop', title: 'Unexpected Conveyor Stop', severity: 'warning',
        message: () => `Conveyor stopped unexpectedly (${this.stopReason || 'drive fault'}). Restart required after inspection.`,
        active: () => !!this.unexpectedStop,
      },
      {
        id: 'sensor-failure', title: 'Detection Sensor Failure', severity: 'critical',
        message: () => 'Entry presence photo-eye is not responding. Carton tracking degraded.',
        active: () => !!this.faults.entrySensor,
      },
      {
        id: 'bin-full', title: 'Collection Bin Full', severity: 'warning',
        thresholdKey: 'binFullPercent', defaultThreshold: 92, thresholdLabel: 'Bin full warning', thresholdUnit: '%', thresholdMin: 50, thresholdMax: 100, thresholdStep: 1,
        message: () => {
          const full = [];
          if (this.binPct('A') >= this.threshold('binFullPercent', 92)) full.push(`A (${Math.round(this.binPct('A'))}%)`);
          if (this.binPct('B') >= this.threshold('binFullPercent', 92)) full.push(`B (${Math.round(this.binPct('B'))}%)`);
          return `Collection bin${full.length > 1 ? 's' : ''} ${full.join(' and ')} at capacity. Clear bins to continue sorting.`;
        },
        active: () => this.binPct('A') >= this.threshold('binFullPercent', 92) || this.binPct('B') >= this.threshold('binFullPercent', 92),
      },
      {
        id: 'sorting-failure', title: 'Sorting Failure Rate High', severity: 'warning',
        thresholdKey: 'sortingFailurePercent', defaultThreshold: 25, thresholdLabel: 'Sort failure limit', thresholdUnit: '%', thresholdMin: 1, thresholdMax: 100, thresholdStep: 1,
        message: () => `Sorting failure rate ${num(this.sortFailureRate, 1)}% exceeds the ${this.threshold('sortingFailurePercent', 25)}% limit.`,
        active: () => this.sortedTotal >= 5 && this.sortFailureRate >= this.threshold('sortingFailurePercent', 25),
      },
    ];
  }

  getAnalyticsDefs() {
    return [
      { id: 'belt-speed', label: 'Belt Speed', unit: 'm/s', color: '#ffb547', get: () => this.belt?.speed ?? 0, digits: 2 },
      { id: 'motor-temp', label: 'Motor Temp', unit: '°C', color: '#ff6172', get: () => this.motor?.temp ?? 0, digits: 1 },
      { id: 'motor-current', label: 'Motor Current', unit: 'A', color: '#46a9ff', get: () => this.motor?.current ?? 0, digits: 2 },
      { id: 'bin-a', label: 'Bin A Fill', unit: '%', color: '#36e2c2', get: () => this.binPct('A'), digits: 0 },
      { id: 'bin-b', label: 'Bin B Fill', unit: '%', color: '#a98bff', get: () => this.binPct('B'), digits: 0 },
      { id: 'throughput', label: 'Sort Throughput', unit: 'ctn/min', color: '#3ce58b', get: () => this.sortRatePerMin(), digits: 1 },
    ];
  }

  primarySeriesIds() { return ['belt-speed', 'motor-temp']; }

  binPct(key) {
    const b = this.binData[key];
    if (!b) return 0;
    return b.capacity > 0 ? (b.count / b.capacity) * 100 : 0;
  }

  get sortFailureRate() {
    if (this.sortedTotal <= 0) return 0;
    return (this.sortFailures / this.sortedTotal) * 100;
  }

  sortRatePerMin() {
    const now = this.simTime;
    while (this.throughput.length && now - this.throughput[0] > 60) this.throughput.shift();
    return this.throughput.length;
  }

  get stackLightState() {
    if (this.belt?.state === 'ESTOP' || this.motor?.trip) return 'red';
    if (this.jamActive) return 'red';
    if (this.binData.A?.full || this.binData.B?.full) return 'amber';
    if (this.belt?.state === 'RUNNING') return 'green';
    return 'amber';
  }

  get lineState() {
    if (!this.belt) return 'STOPPED';
    if (this.belt.state === 'ESTOP') return 'E-STOP';
    if (this.motor?.trip) return 'FAULT';
    if (this.jamActive) return 'FAULT';
    if (this.belt.state === 'RUNNING') return 'RUNNING';
    if (this.belt.state === 'PAUSED') return 'PAUSED';
    return 'STOPPED';
  }

  get stopReason() {
    if (this.motor?.trip) return 'motor thermal trip';
    if (this.jamActive) return 'carton jam';
    return 'drive fault';
  }

  /* ==========================================================
     RUNTIME INITIALISATION
     ========================================================== */
  initLineState() {
    const cfg = this.config;
    const autoStart = cfg.autoStart !== false;
    this.belt = {
      state: autoStart ? 'RUNNING' : 'STOPPED',
      speed: 0,
      target: 0,
      direction: cfg.direction >= 0 ? 1 : -1,
      motorOn: cfg.motorOn !== false,
    };
    this.motor = {
      on: this.belt.motorOn,
      temp: 27.5,
      current: 0,
      trip: false,
      tripReason: '',
      fan: cfg.coolingFan !== false,
    };
    this.flowDir = this.belt.direction;
    this._nextSpawn = Math.max(2, cfg.spawn.interval || 8);
    this.spawnTimer = 0;
    this.jamActive = false;
    this.unexpectedStop = false;
    for (const key of ['A', 'B']) {
      const bin = this.binData[key];
      if (!bin) continue;
      bin.capacity = key === 'A' ? (cfg.bins.capacityA || 12) : (cfg.bins.capacityB || 12);
      bin.count = 0;
      bin.sorted = 0;
      this.updateBinVisual(bin);
    }
    this.diverter.auto = cfg.diverter.auto !== false;
    this.diverter.position = cfg.diverter.position === 1 ? 1 : 0;
    if (cfg.direction < 0) this.flowDir = -1;
    this.applyDiverterTransform(this.diverter.auto ? 0 : (this.diverter.position ? 1 : 0));
    this.updateDiverterRod();
    this._initialised = true;
  }

  onAfterMount() {
    this.initLineState();
    setTimeout(() => {
      if (this._destroyed) return;
      this.seedInitialBoxes();
      this.logEvent('Sorting line online', 'Belt running, automatic sort recipes loaded.', 'ok');
      this.refreshLive();
    }, 140);
  }

  onSimulationStart() {
    if (!this.belt) return;
    if (this.belt.state === 'STOPPED' && !this.motor?.trip && this.belt.state !== 'ESTOP') this.belt.state = 'RUNNING';
    this.logEvent('Automation resumed', 'Conveyor drive and automatic sorting active.', 'ok');
  }

  onSimulationStop() {
    this.logEvent('Automation suspended', 'Global simulation stopped by operator.', 'warn');
  }

  /* ==========================================================
     SIMULATION LOOP
     ========================================================== */
  updateSimulation(dt) {
    if (!this.belt) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.updateConveyorDrive(dt);
    this.updateMotor(dt);
    this.updateDiverterSim(dt);
    this.updateBoxesSim(dt);
    this.updateSpawning(dt);
    this.updateJamDetection(dt);
    this.updateIndicators(dt);
    this.updateSensors();
  }

  /* ---------------- belt drive & animation ---------------- */
  updateConveyorDrive(dt) {
    const b = this.belt;
    const eStop = b.state === 'ESTOP';
    const canRun = b.state === 'RUNNING' && b.motorOn && !this.jamActive && !this.motor.trip && !eStop;
    b.target = canRun ? clamp(+this.config.beltSpeed || 1.2, 0.05, 3) : 0;
    b.direction = this.config.direction >= 0 ? 1 : -1;
    const normalRate = b.target > b.speed ? Math.max(0.05, +this.config.acceleration || 0.55) : Math.max(0.05, +this.config.deceleration || 0.9);
    const fastStop = eStop || this.jamActive || this.motor.trip;
    const rate = fastStop ? 2.8 : normalRate;
    const diff = b.target - b.speed;
    if (Math.abs(diff) > 0.0005) b.speed += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    else b.speed = b.target;
    if (b.speed < 0.0001) b.speed = 0;

    if (this.beltTexture && b.speed > 0.0001) {
      this.beltTexture.offset.x -= ((b.speed * dt) / 1.15) * b.direction;
    }
    this.updateRollers(dt);
    this.updatePulleys(dt);

    // motor cooling fan spins while the motor is energised
    const fanSpeed = this.motor.on ? (2.0 + b.speed * 5.5) : 0;
    this._fanAngle = (this._fanAngle + fanSpeed * dt) % (Math.PI * 2);
    if (this.fanGroup) this.fanGroup.rotation.x = this._fanAngle;
  }

  updateRollers(dt) {
    const r = this.rollers;
    if (!r) return;
    const spin = (this.belt.speed * dt / 0.075) * this.belt.direction;
    if (Math.abs(spin) < 1e-7) return;
    r.angle += spin;
    const qSpin = new THREE.Quaternion().setFromAxisAngle(ARROW_UP, r.angle);
    if (!this._rollerDummy) this._rollerDummy = new THREE.Object3D();
    const dummy = this._rollerDummy;
    for (let i = 0; i < r.count; i++) {
      dummy.position.copy(r.positions[i]);
      dummy.quaternion.copy(r.quats[i]).multiply(qSpin);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      r.barrel.setMatrixAt(i, dummy.matrix);
      r.ridge.setMatrixAt(i, dummy.matrix);
    }
    r.barrel.instanceMatrix.needsUpdate = true;
    r.ridge.instanceMatrix.needsUpdate = true;
  }

  updatePulleys(dt) {
    const delta = (this.belt.speed * dt / 0.23) * this.belt.direction;
    if (Math.abs(delta) < 1e-7) return;
    const q = new THREE.Quaternion();
    for (const p of this.pulleys) {
      p.angle += delta;
      q.setFromAxisAngle(ARROW_UP, p.angle);
      p.obj.quaternion.copy(p.baseQuat).multiply(q);
    }
  }

  /* ---------------- motor thermal model ---------------- */
  updateMotor(dt) {
    const m = this.motor, b = this.belt;
    m.fan = this.config.coolingFan !== false;
    const onBelt = this.boxes.filter((x) => x.state === 'belt').length;
    const running = b.state === 'RUNNING' && b.motorOn && !this.jamActive && !m.trip;
    const load = b.speed / Math.max(0.05, +this.config.beltSpeed || 1);
    const targetCurrent = !m.on || m.trip || b.state === 'ESTOP'
      ? 0
      : running
        ? 0.65 + load * 2.6 + onBelt * 0.055 + (b.direction < 0 ? 0.15 : 0)
        : 0.32;
    const rate = Math.abs(targetCurrent - m.current) > 3 ? 3.4 : 1.1;
    m.current += clamp(targetCurrent - m.current, -rate * dt, rate * dt);
    if (m.current < 0.02) m.current = 0;

    this._ambient = 22.5 + Math.sin(this.simTime / 1400) * 1.6;
    const heatTarget = this._ambient + m.current * (m.on ? 5.2 : 0) + (m.trip ? 3.5 : 0);
    const tau = heatTarget > m.temp ? 26 : (m.fan ? 17 : 34);
    m.temp += (heatTarget - m.temp) * Math.min(1, dt / tau);
    m.temp = clamp(m.temp, this._ambient - 2, 150);

    const overheat = this.threshold('motorOverheatTemp', 78);
    if (!m.trip && m.temp >= overheat) this.thermalTrip('overheat');
    const overcurrent = this.threshold('motorTripCurrent', 9.5);
    if (!m.trip && m.on && m.current >= overcurrent) this.thermalTrip('overcurrent');
  }

  thermalTrip(reason = 'overheat') {
    const m = this.motor;
    if (!m || m.trip) return;
    m.trip = true;
    m.tripReason = reason;
    m.on = false;
    this.config.motorOn = false;
    this.belt.motorOn = false;
    this.belt.state = 'FAULT';
    this.unexpectedStop = true;
    this.thermalTrips++;
    this.logEvent('Motor thermal trip', `Drive motor tripped (${reason}). Temperature ${num(m.temp, 1)} °C.`, 'danger');
    this.evaluateAlarms();
    this.refreshLive();
    this.saveSoon();
  }

  resetMotorTrip() {
    const m = this.motor;
    if (!m) return;
    m.trip = false;
    m.tripReason = '';
    m.on = true;
    this.config.motorOn = true;
    this.belt.motorOn = true;
    this.belt.state = 'STOPPED';
    m.temp = Math.min(m.temp, 48);
    this.unexpectedStop = false;
    this.logEvent('Motor thermal trip reset', 'Thermal protection reset. Conveyor ready to start.', 'ok');
    ui.toast('Motor trip reset. Press Start to resume.', { type: 'ok' });
    this.evaluateAlarms();
    this.refreshLive();
    this.saveSoon();
  }

  setMotor(on) {
    const m = this.motor;
    if (!m) return;
    if (on && m.trip) {
      ui.toast('Reset the motor thermal trip first.', { type: 'warn' });
      return;
    }
    m.on = !!on;
    this.config.motorOn = m.on;
    this.belt.motorOn = m.on;
    this.logEvent(m.on ? 'Motor energised' : 'Motor de-energised', m.on ? 'Drive motor contactor closed.' : 'Drive motor contactor opened; belt will coast to a stop.', m.on ? 'ok' : 'warn');
    this.refreshLive();
    this.saveSoon();
  }

  /* ---------------- diverter actuation ---------------- */
  updateDiverterSim(dt) {
    const d = this.diverter;
    if (!d) return;
    d.auto = this.config.diverter.auto !== false && this.config.sorting.auto !== false && !this.manualMode;
    d.position = this.config.diverter.position === 1 ? 1 : 0;
    this._diverterHold = Math.max(0, this._diverterHold - dt);

    let want;
    if (!d.auto) {
      want = d.position;
    } else if (this._diverterHold > 0) {
      want = 1;
    } else {
      want = 0;
      let nearest = null;
      for (const b of this.boxes) {
        if (b.state !== 'belt' || b.sortedPassed) continue;
        if (b.u > this.uSort) continue;
        if (!nearest || b.u > nearest.u) nearest = b;
      }
      if (nearest) {
        const dist = (this.uSort - nearest.u) * this.pathLength;
        if (nearest.dest === 'A' && dist < 1.9) want = 1;
      }
    }
    if (this.belt.state === 'ESTOP') want = 0;
    d.target = want;
    const diff = d.target - d.angle;
    if (Math.abs(diff) > 0.002) {
      const speed = clamp(d.speed * clamp((d.pressure || 6.2) / 6.2, 0.4, 1.4), 0.4, 6);
      d.angle = clamp(d.angle + Math.sign(diff) * Math.min(Math.abs(diff), speed * dt), 0, 1);
    } else d.angle = d.target;
    if (d.angle <= 0.5 && d.target > 0.5) d.cycles += 1;
    this.applyDiverterTransform(d.angle);
    this.updateDiverterRod();
  }

  /* ---------------- carton transport ---------------- */
  updateBoxesSim(dt) {
    const speed = this.belt.speed;
    const dir = this.belt.direction >= 0 ? 1 : -1;
    const inv = 1 / this.pathLength;
    for (const b of this.boxes.slice()) {
      if (b.state === 'belt') {
        const moved = speed > 0.002 && !this.jamActive ? dir * speed * dt * inv : 0;
        b.u += moved;
        if (Math.abs(moved) < 1e-8) b.still = (b.still || 0) + dt;
        else b.still = 0;
        b.prevU = b.u;
        if (dir < 0 && b.u <= 0.002) { this.removeBox(b, 'returned to the infeed'); continue; }
        if (b.u < 0) b.u = 0;
        if (dir > 0) {
          if (b.u >= this.uEnd) {
            b.u = this.uEnd;
            this.tryDischarge(b);
          }
          if (b.state !== 'belt') continue;
          if (!b.scanned && b.u >= this.uScanner) this.scanBox(b);
          if (b.state === 'belt' && !b.sortedPassed && b.u >= this.uSort) this.crossSortPoint(b);
        }
        if (b.state === 'belt') this.positionBoxOnBelt(b);
      } else if (b.state === 'chute') {
        this.advanceChute(b, dt);
      }
    }
    this.applyBeltSpacing();
  }

  positionBoxOnBelt(b) {
    const p = this.pointAt(b.u);
    b.group.position.set(p.x, L.beltY + 0.004, p.z);
    b.group.rotation.y = this.yawAt(b.u);
  }

  applyBeltSpacing() {
    const beltBoxes = this.boxes.filter((b) => b.state === 'belt').sort((a, b) => a.u - b.u);
    const gap = 0.92 / this.pathLength;
    for (let i = beltBoxes.length - 2; i >= 0; i--) {
      const behind = beltBoxes[i];
      const ahead = beltBoxes[i + 1];
      const limit = ahead.u - gap;
      if (behind.u > limit) {
        behind.u = Math.max(0, limit);
        this.positionBoxOnBelt(behind);
        if (behind.still === 0) behind.still = 0.001;
      }
    }
  }

  scanBox(box) {
    box.scanned = true;
    const ruleDest = this.ruleDestination(box);
    box.expectedDest = ruleDest;
    let dest = ruleDest;
    if (!this.faults.scanner) {
      this.scanCount++;
      this.scannerFlash = 1.5;
      const failChance = clamp(100 - (+this.config.sorting.successRate || 0), 0, 100) / 100;
      if (Math.random() < failChance) dest = ruleDest === 'A' ? 'B' : 'A';
    }
    box.dest = dest;
    box.destOverride = null;
    const target = this.binData[dest];
    if (target && target.count >= target.capacity) {
      const otherKey = dest === 'A' ? 'B' : 'A';
      const other = this.binData[otherKey];
      if (other && other.count < other.capacity) {
        box.dest = otherKey;
        box.overflowRouted = true;
      }
    }
    this.logEvent('Carton scanned', `${box.serial} · ${box.sizeKey} / ${box.colorKey} / ${box.classification} → Bin ${box.dest}.`, 'info');
  }

  ruleDestination(box) {
    if (box.destOverride === 'A' || box.destOverride === 'B') return box.destOverride;
    const rules = this.config.rules || {};
    const strategy = this.config.sorting.strategy || 'size';
    if (strategy === 'color') {
      const v = rules.color?.[box.colorKey];
      return v === 'B' ? 'B' : 'A';
    }
    if (strategy === 'classification') {
      const v = rules.classification?.[box.classification];
      return v === 'B' ? 'B' : 'A';
    }
    if (strategy === 'priority') {
      if (box.classification === 'express' || box.classification === 'fragile') return 'A';
      return box.sizeKey === 'large' ? 'B' : 'A';
    }
    const v = rules.size?.[box.sizeKey];
    return v === 'B' ? 'B' : 'A';
  }

  crossSortPoint(box) {
    box.sortedPassed = true;
    const deployed = this.diverter && this.diverter.angle > 0.5;
    if (deployed) {
      const ok = this.divertToChute(box, 'A');
      if (ok) return;
    }
    box.passedSort = true;
  }

  tryDischarge(box) {
    const bin = this.binData.B;
    if (bin && bin.count < bin.capacity) {
      const ok = this.divertToChute(box, 'B');
      if (ok) return;
    }
    box.blockedAtEnd = true;
  }

  divertToChute(box, key) {
    const bin = this.binData[key];
    if (!bin || bin.count >= bin.capacity) return false;
    box.state = 'chute';
    box.chute = key;
    box.chuteT = 0;
    box.chuteCurve = key === 'A' ? this.chuteCurveA : this.chuteCurveB;
    box.chuteDuration = 0.9 + (box.weight > 12 ? 0.25 : 0);
    box.dest = key;
    box.blockedAtEnd = false;
    if (key === 'A') this._diverterHold = Math.max(this._diverterHold, 0.34);
    this.logEvent('Carton diverted', `${box.serial} → ${key === 'A' ? 'Bin A chute' : 'discharge chute B'}.`, 'info');
    return true;
  }

  advanceChute(box, dt) {
    box.chuteT += dt / box.chuteDuration;
    const t = clamp(box.chuteT, 0, 1);
    const p = box.chuteCurve.getPointAt(t);
    box.group.position.set(p.x, p.y + 0.12, p.z);
    const tan = box.chuteCurve.getTangentAt(t);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(ARROW_UP, Math.atan2(-tan.z, tan.x));
    const tipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), t * 0.55);
    box.group.quaternion.copy(yawQ).multiply(tipQ);
    if (t >= 1) this.settleBoxInBin(box);
  }

  settleBoxInBin(box) {
    const key = box.chute || box.dest || 'B';
    const bin = this.binData[key];
    if (!bin || bin.count >= bin.capacity) { this.removeBox(box, 'rejected (bin full)'); return; }
    const slot = bin.count;
    bin.count += 1;
    bin.sorted += 1;
    box.state = 'bin';
    box.binKey = key;
    box.chute = null;
    const layer = Math.floor(slot / 4);
    const idx = slot % 4;
    const lx = idx % 2 === 0 ? -0.46 : 0.46;
    const lz = idx < 2 ? -0.34 : 0.34;
    const ly = 0.1 + layer * 0.3;
    bin.contents.add(box.group);
    box.group.position.set(lx, ly, lz);
    box.group.quaternion.identity();
    box.group.rotation.set(0, (slot % 5) * 0.16 - 0.32, 0);
    const expected = box.expectedDest;
    if (expected && key !== expected) {
      this.sortFailures += 1;
      box.missorted = true;
    }
    this.sortedTotal += 1;
    if (key === 'A') this.sortedA += 1; else this.sortedB += 1;
    this.throughput.push(this.simTime);
    if (this.throughput.length > 300) this.throughput.shift();
    this.updateBinVisual(bin);
    if (bin.count >= bin.capacity) {
      bin.full = true;
      this.logEvent('Collection bin full', `Bin ${key} reached capacity (${bin.capacity} cartons).`, 'warn');
    }
    this.logEvent('Carton sorted', `${box.serial} → Bin ${key}${box.missorted ? ' · MIS-SORT' : ''}.`, box.missorted ? 'warn' : 'ok');
    if (this.selectedId === box.id) this.refreshInspector();
    this.saveSoon();
  }

  /* ---------------- inbound spawning ---------------- */
  updateSpawning(dt) {
    if (this.pendingBoxes.length) {
      const due = this.pendingBoxes.filter((p) => p.due <= this.simTime);
      this.pendingBoxes = this.pendingBoxes.filter((p) => p.due > this.simTime);
      for (const p of due) this.spawnBox(p.options || {}, { scheduled: true });
    }
    const s = this.config.spawn;
    if (!s.auto || this.manualMode || !this.running || this.paused) return;
    if (this.belt.state !== 'RUNNING' || this.jamActive || this.belt.speed < 0.05) return;
    this.spawnTimer += dt;
    const base = Math.max(2, +s.interval || 8);
    if (this._nextSpawn <= 0) this._nextSpawn = base;
    if (this.spawnTimer >= this._nextSpawn) {
      this.spawnTimer = 0;
      this._nextSpawn = s.mode === 'fixed' ? base : base * (0.65 + Math.random() * 0.7);
      this.spawnBox({}, { automatic: true });
    }
  }

  resolveCartonProfile(options = {}) {
    const s = this.config.spawn || {};
    const requestedSize = options.size || (s.randomProfile === false ? s.size : null);
    const sizeKey = requestedSize && requestedSize !== 'random' && BOX_PROFILES[requestedSize]
      ? requestedSize
      : (s.size && s.size !== 'random' && options.size !== 'random' ? s.size : pick(SIZE_KEYS));
    const profile = BOX_PROFILES[sizeKey] || BOX_PROFILES.medium;
    const colorKey = options.color && options.color !== 'random'
      ? options.color
      : (s.color && s.color !== 'random' ? s.color : pick(BOX_COLORS).key);
    const color = BOX_COLORS.find((c) => c.key === colorKey) || BOX_COLORS[0];
    const classification = options.classification && options.classification !== 'random'
      ? options.classification
      : (s.classification && s.classification !== 'random' ? s.classification : pick(CLASSIFICATIONS).key);
    let weight;
    if (Number.isFinite(+options.weight)) weight = +options.weight;
    else if (Number.isFinite(+s.weight)) weight = +s.weight;
    else weight = rand(profile.weight[0], profile.weight[1]);
    return { sizeKey, profile, color, colorKey, classification, weight: Math.round(weight * 10) / 10 };
  }

  spawnBox(options = {}, meta = {}) {
    if (!this.belt) return null;
    const s = this.config.spawn || {};
    const alive = this.boxes.filter((b) => b.state !== 'bin').length;
    if (alive >= (s.maxItems || 12)) {
      if (!meta.silent) ui.toast('Maximum cartons in transit reached.', { type: 'warn' });
      return null;
    }
    if (!meta.seeded) {
      const beltBoxes = this.boxes.filter((b) => b.state === 'belt');
      const minU = beltBoxes.reduce((m, b) => Math.min(m, b.u), 1);
      if (beltBoxes.length && minU < 0.032) return null;
      if (meta.automatic && (this.jamActive || this.belt.state !== 'RUNNING')) return null;
    }
    const { sizeKey, profile, color, colorKey, classification, weight } = this.resolveCartonProfile(options);
    const serial = `BX-${String(++this._boxSerial).padStart(4, '0')}`;
    const carton = makeCardboardBox(profile.w, profile.h, profile.d, color.hex, serial.slice(-4));
    const label = textSprite(serial, {
      size: 26, scale: 0.34, color: '#eaf7fa', bg: 'rgba(4,12,18,.72)', border: 'rgba(255,181,71,.4)',
    });
    label.position.set(0, profile.h + 0.4, 0);
    label.visible = this.labelsVisible;
    carton.add(label);
    const p = this.pointAt(0);
    carton.position.set(p.x, L.beltY + 0.004, p.z);
    this.cat.conveyors.add(carton);
    const rec = {
      id: `box.${serial}`, serial, sizeKey, colorKey, colorHex: color.hex, colorCss: color.css,
      weight, classification, profile,
      u: 0, prevU: 0, still: 0, state: 'belt',
      dest: null, expectedDest: null, scanned: false, sortedPassed: false,
      group: carton, label, createdAt: this.simTime, h: profile.h,
      destOverride: options.destOverride === 'A' || options.destOverride === 'B' ? options.destOverride : null,
    };
    rec.expectedDest = this.ruleDestination(rec);
    rec.dest = rec.expectedDest;
    this.boxes.push(rec);
    this.addObject(carton, {
      id: rec.id, label: `Carton ${serial}`, kind: 'box', iconName: 'package',
      description: `${profile.label} carton · ${color.label} · ${classification} · ${weight} kg`,
    });
    this.positionBoxOnBelt(rec);
    if (!meta.silent) this.logEvent('Carton inducted', `${serial} · ${profile.label} ${color.label.toLowerCase()} · ${weight} kg`, 'info');
    this.saveSoon();
    return rec;
  }

  seedInitialBoxes() {
    const seeds = [
      { u: 0.2, size: 'medium', color: 'red', classification: 'fragile' },
      { u: 0.33, size: 'small', color: 'kraft', classification: 'standard' },
      { u: 0.48, size: 'large', color: 'blue', classification: 'express' },
      { u: 0.62, size: 'medium', color: 'white', classification: 'bulk' },
      { u: 0.75, size: 'small', color: 'amber', classification: 'standard' },
      { u: 0.88, size: 'medium', color: 'blue', classification: 'fragile' },
    ];
    let n = 0;
    for (const sd of seeds) {
      const b = this.spawnBox({ size: sd.size, color: sd.color, classification: sd.classification, silent: true }, { seeded: true, silent: true });
      if (!b) continue;
      b.u = sd.u;
      b.prevU = b.u;
      b.still = 0;
      b.scanned = b.u > this.uScanner;
      b.sortedPassed = b.u > this.uSort;
      b.expectedDest = this.ruleDestination(b);
      b.dest = b.expectedDest;
      this.positionBoxOnBelt(b);
      n++;
    }
    if (n) this.logEvent('Initial cartons', `${n} cartons already in transit on the loop.`, 'info');
  }

  /* ---------------- jam detection ---------------- */
  updateJamDetection(dt) {
    if (this.jamActive) return;
    if (this.belt.state !== 'RUNNING' || this.belt.speed < 0.1) return;
    const limit = Math.max(1, this.threshold('jamSeconds', 6));
    const stuck = this.boxes.find((b) => b.state === 'belt' && (b.still || 0) > limit);
    if (stuck) this.triggerJam(`carton ${stuck.serial} blocked`);
  }

  triggerJam(cause = 'carton obstruction') {
    if (this.jamActive) return;
    this.jamActive = true;
    this.jamCause = cause;
    this.jamEvents += 1;
    this.unexpectedStop = true;
    this.belt.state = 'FAULT';
    this.logEvent('Conveyor jam', `Drive tripped: ${cause}.`, 'danger');
    this.evaluateAlarms();
    this.refreshLive();
    this.saveSoon();
  }

  resetJam() {
    this.jamActive = false;
    this.jamCause = '';
    this.unexpectedStop = !!this.motor?.trip || this.belt.state === 'ESTOP';
    for (const b of this.boxes) { b.still = 0; b.prevU = b.u; b.blockedAtEnd = false; }
    if (this.belt.state !== 'ESTOP' && !this.motor?.trip) {
      this.belt.state = 'RUNNING';
      ui.toast('Jam cleared — conveyor restarting.', { type: 'ok', title: 'Jam Reset' });
      this.logEvent('Jam cleared', 'Belt restarting after jam clearance.', 'ok');
    } else {
      this.logEvent('Jam cleared', 'Reset the E-stop / motor trip to restart the line.', 'warn');
    }
    this.evaluateAlarms();
    this.refreshLive();
    this.saveSoon();
  }

  injectJam() {
    this.triggerJam('operator-injected obstruction');
    ui.toast('Jam injected for training — clear with Reset Jam.', { type: 'warn', title: 'Fault Injection' });
    this.refreshLive();
  }

  /* ---------------- line commands ---------------- */
  startLine() {
    if (!this.belt) return;
    if (this.belt.state === 'ESTOP') { ui.toast('Reset the emergency stop before starting.', { type: 'warn' }); return; }
    if (this.motor.trip) { ui.toast('Reset the motor thermal trip before starting.', { type: 'warn' }); return; }
    if (this.jamActive) { ui.toast('Clear the conveyor jam before restarting.', { type: 'warn' }); return; }
    this.unexpectedStop = false;
    this.belt.state = 'RUNNING';
    this.motor.on = true;
    this.config.motorOn = true;
    this.belt.motorOn = true;
    this.logEvent('Conveyor started', 'Belt drive energised; automatic sorting active.', 'ok');
    this.evaluateAlarms();
    this.refreshLive();
    this.saveSoon();
  }

  stopLine(reason = 'operator command') {
    if (!this.belt) return;
    this.belt.state = 'STOPPED';
    this.unexpectedStop = false;
    this.logEvent('Conveyor stopped', `Controlled stop (${reason}).`, 'info');
    this.refreshLive();
    this.saveSoon();
  }

  pauseLine() {
    if (!this.belt) return;
    this.belt.state = 'PAUSED';
    this.logEvent('Conveyor paused', 'Belt decelerating to a controlled pause.', 'info');
    this.refreshLive();
    this.saveSoon();
  }

  resumeLine() {
    if (!this.belt) return;
    if (this.belt.state === 'ESTOP') { ui.toast('Reset the emergency stop before resuming.', { type: 'warn' }); return; }
    if (this.motor.trip) { ui.toast('Reset the motor thermal trip before resuming.', { type: 'warn' }); return; }
    if (this.jamActive) { ui.toast('Clear the conveyor jam before resuming.', { type: 'warn' }); return; }
    this.belt.state = 'RUNNING';
    this.unexpectedStop = false;
    this.logEvent('Conveyor resumed', 'Belt drive re-energised.', 'ok');
    this.evaluateAlarms();
    this.refreshLive();
    this.saveSoon();
  }

  emergencyStopLine() {
    if (!this.belt) return;
    this.belt.state = 'ESTOP';
    this.motor.on = false;
    this.belt.motorOn = false;
    this.config.motorOn = false;
    this.unexpectedStop = false;
    this.logEvent('EMERGENCY STOP', 'Line emergency stop activated — drive de-energised.', 'danger');
    ui.toast('Emergency stop activated. Reset to recover.', { type: 'danger', title: 'E-STOP' });
    this.evaluateAlarms();
    this.refreshLive();
    this.saveSoon();
  }

  resetEmergencyStop() {
    if (!this.belt || this.belt.state !== 'ESTOP') return;
    this.belt.state = 'STOPPED';
    this.motor.on = true;
    this.config.motorOn = true;
    this.belt.motorOn = true;
    this.logEvent('E-stop reset', 'Safety circuit reset. Conveyor ready to start.', 'ok');
    ui.toast('Emergency stop reset. Press Start to resume.', { type: 'ok' });
    this.refreshLive();
    this.saveSoon();
  }

  /* ---------------- sensors from the live model ---------------- */
  updateSensors() {
    const beltBoxes = this.boxes.filter((b) => b.state === 'belt');
    const near = (u, metres) => beltBoxes.some((b) => Math.abs(b.u - u) * this.pathLength < metres);
    this.setSensorValue('entry-present', near(this.uEntry, 0.9) ? 1 : 0);
    this.setSensorValue('exit-present', near(this.uExit, 1.0) ? 1 : 0);
    this.setSensorValue('sort-sensor', near(this.uSort, 0.85) ? 1 : 0);
    this.setSensorValue('belt-speed', this.belt.speed);
    this.setSensorValue('motor-current', this.motor.current);
    this.setSensorValue('motor-temp', this.motor.temp);
    this.setSensorValue('bin-a-fill', this.binPct('A'));
    this.setSensorValue('bin-b-fill', this.binPct('B'));
    this.setSensorValue('jam-sensor', this.jamActive ? 1 : 0);
  }

  /* ---------------- lamps / indicators ---------------- */
  updateIndicators(dt) {
    const blink = Math.sin(this.simTime * 7.5) > 0;
    const st = this.stackLightState;
    const red = st === 'red' ? (this.jamActive || this.motor?.trip ? blink : true) : false;
    const amber = st === 'amber';
    const green = st === 'green' && !blink === false ? true : st === 'green';
    for (const tower of this.towerLights) {
      if (!tower?.userData?.setLamps) continue;
      tower.userData.setLamps(red, amber, st === 'green');
    }
    if (this.estopLamp) {
      const active = this.belt?.state === 'ESTOP';
      this.estopLamp.emissiveIntensity = active ? (blink ? 2.6 : 0.4) : 1.5;
    }
    if (this.cabinetBeacon) {
      const col = st === 'red' ? 0xff4a5f : st === 'amber' ? 0xffb547 : 0x3ce58b;
      this.cabinetBeacon.color.setHex(col);
      this.cabinetBeacon.emissive.setHex(col);
      this.cabinetBeacon.emissiveIntensity = st === 'green' ? 1.6 : (blink ? 2.4 : 0.8);
    }
    if (this.scannerLamp?.material) {
      this.scannerFlash = Math.max(0, this.scannerFlash - dt * 2.2);
      const base = this.faults.scanner ? 0 : 0.3 + Math.sin(this.simTime * 21) * 0.07;
      this.scannerLamp.material.opacity = clamp(base + this.scannerFlash, 0.05, 1);
      this.scannerLamp.material.color.setHex(this.faults.scanner ? 0x333333 : 0xff3344);
    }
    if (this.divertBeacon) this.divertBeacon.emissiveIntensity = this.diverter?.angle > 0.5 ? 2.6 : (blink ? 1.3 : 0.45);
  }

  /* ==========================================================
     OPERATOR SETTINGS
     ========================================================== */
  setBeltSpeed(v) {
    this.config.beltSpeed = clamp(+v || 0, 0.05, 3);
    this.saveSoon();
    this.refreshLive();
  }

  setSortingStrategy(v) {
    this.config.sorting.strategy = v;
    this.logEvent('Sort recipe changed', `Rule strategy set to ${v.toUpperCase()}.`, 'info');
    this.saveSoon();
    this.refreshLive();
  }

  setRule(group, key, value) {
    if (!this.config.rules[group]) this.config.rules[group] = {};
    this.config.rules[group][key] = value === 'A' ? 'A' : 'B';
    this.saveSoon();
    this.refreshLive();
  }

  setSuccessRate(v) {
    this.config.sorting.successRate = clamp(+v || 0, 0, 100);
    this.saveSoon();
    this.refreshLive();
  }

  setDirection(dir) {
    this.config.direction = dir < 0 ? -1 : 1;
    this.logEvent('Belt direction changed', `Transport direction set to ${this.config.direction > 0 ? 'FORWARD' : 'REVERSE'}.`, 'info');
    this.saveSoon();
    this.refreshLive();
  }

  setBinCapacity(key, v) {
    const bin = this.binData[key];
    if (!bin) return;
    bin.capacity = Math.max(1, Math.round(+v || 1));
    if (key === 'A') this.config.bins.capacityA = bin.capacity; else this.config.bins.capacityB = bin.capacity;
    this.updateBinVisual(bin);
    this.saveSoon();
    this.refreshInspector();
  }

  clearBin(key) {
    const bin = this.binData[key];
    if (!bin) return;
    for (const b of [...this.boxes]) {
      if (b.state === 'bin' && b.binKey === key) this.removeBox(b, '');
    }
    bin.count = 0;
    bin.sorted = 0;
    bin.full = false;
    this.updateBinVisual(bin);
    this.logEvent('Bin cleared', `Collection Bin ${key} emptied.`, 'ok');
    ui.toast(`Bin ${key} cleared.`, { type: 'ok' });
    this.refreshLive();
    this.refreshInspector();
    this.saveSoon();
  }

  removeBox(box, reason = 'removed') {
    if (!box) return;
    const idx = this.boxes.indexOf(box);
    if (idx >= 0) this.boxes.splice(idx, 1);
    this.scene.unregister(box.id);
    this.objects.delete(box.id);
    if (box.group?.parent) box.group.parent.remove(box.group);
    box.group?.traverse?.((o) => {
      if (o.isMesh || o.isLine) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.map) m.map.dispose?.();
          m.dispose?.();
        }
      }
    });
    if (this.selectedId === box.id) this.closeInspector();
    if (reason) this.logEvent('Carton removed', `${box.serial} ${reason}.`, 'warn');
    this.refreshLive();
    this.saveSoon();
  }

  clearBoxes(includeBins = true) {
    const count = this.boxes.length;
    for (const b of [...this.boxes]) {
      if (!includeBins && b.state === 'bin') continue;
      this.removeBox(b, '');
    }
    if (includeBins) {
      for (const key of ['A', 'B']) {
        const bin = this.binData[key];
        if (!bin) continue;
        bin.count = 0;
        bin.sorted = 0;
        bin.full = false;
        this.updateBinVisual(bin);
      }
    }
    this.logEvent('Cartons cleared', `${count} cartons removed from the line.`, 'info');
    ui.toast(`Conveyor cleared (${count} cartons removed).`, { type: 'info' });
    this.refreshLive();
    this.refreshInspector();
    this.saveSoon();
  }

  removeSelectedBox() {
    const obj = this.objects.get(this.selectedId);
    if (!obj || obj.kind !== 'box') { ui.toast('Select a carton in the 3D view first.', { type: 'warn' }); return; }
    const box = this.boxes.find((b) => b.id === obj.id);
    this.removeBox(box || { id: obj.id, group: obj.root, serial: obj.id.replace('box.', '') }, 'removed by operator');
    this.closeInspector();
  }

  /* ==========================================================
     OVERVIEW / ANALYTICS HELPERS
     ========================================================== */
  get boxesOnBelt() { return this.boxes.filter((b) => b.state === 'belt').length; }
  get boxesInBins() { return this.boxes.filter((b) => b.state === 'bin').length; }
  get divertedTotal() { return this.sortedA; }

  getOverviewMetrics() {
    const pctA = () => this.binPct('A');
    const pctB = () => this.binPct('B');
    return [
      {
        label: 'Line Status', iconName: 'conveyor', sub: () => '',
        bind: () => ({
          value: this.lineState,
          tone: this.lineState === 'RUNNING' ? 'ok' : this.lineState === 'STOPPED' ? 'warn' : this.lineState === 'PAUSED' ? 'warn' : 'danger',
          sub: `${num(this.belt?.speed, 2)} / ${num(this.config.beltSpeed, 2)} m/s`,
        }),
      },
      {
        label: 'Belt Speed', iconName: 'activity',
        bind: () => ({ value: num(this.belt?.speed, 2), unit: 'm/s', tone: this.belt?.speed > 0.05 ? 'ok' : 'muted', sub: `${this.config.direction > 0 ? 'FORWARD' : 'REVERSE'} · target ${num(this.config.beltSpeed, 2)}` }),
      },
      {
        label: 'Cartons In Transit', iconName: 'package',
        bind: () => ({ value: String(this.boxesOnBelt), tone: this.boxesOnBelt > 0 ? 'ok' : 'muted', sub: `${this.boxes.length} total tracked` }),
      },
      {
        label: 'Bin A Fill', iconName: 'inventory',
        bind: () => ({ value: ui.fmt(pctA(), 0), unit: '%', tone: pctA() >= 100 ? 'danger' : pctA() >= 80 ? 'warn' : 'ok', sub: `${this.binData.A?.count ?? 0}/${this.binData.A?.capacity ?? 0} cartons` }),
      },
      {
        label: 'Bin B Fill', iconName: 'inventory',
        bind: () => ({ value: ui.fmt(pctB(), 0), unit: '%', tone: pctB() >= 100 ? 'danger' : pctB() >= 80 ? 'warn' : 'ok', sub: `${this.binData.B?.count ?? 0}/${this.binData.B?.capacity ?? 0} cartons` }),
      },
      {
        label: 'Motor', iconName: 'motor',
        bind: () => ({
          value: ui.fmt(this.motor?.temp ?? 0, 1), unit: '°C',
          tone: (this.motor?.temp ?? 0) >= this.threshold('motorOverheatTemp', 78) - 8 ? 'danger' : this.motor?.on ? 'ok' : 'muted',
          sub: `${num(this.motor?.current, 2)} A · ${this.motor?.trip ? 'TRIPPED' : this.motor?.on ? 'ENERGISED' : 'OFF'}`,
        }),
      },
    ];
  }

  overviewExtra(body) {
    const sec = el('div', { class: 'section' });
    const title = el('div', { class: 'section-title' });
    title.innerHTML = `${ui.icon('conveyor', 12).outerHTML} Line Dashboard`;
    sec.appendChild(title);
    const grid = el('div', { class: 'metric-grid' });
    const sortedM = ui.metric({ label: 'Sorted A', bind: () => String(this.sortedA), iconName: 'inventory', compact: true });
    const sortedBM = ui.metric({ label: 'Sorted B', bind: () => String(this.sortedB), iconName: 'inventory', compact: true });
    const diverterM = ui.metric({ label: 'Diverter', bind: () => ({ value: this.diverter?.auto ? (this.diverter.angle > 0.5 ? 'DIVERT' : 'STRAIGHT') : 'MANUAL', tone: this.diverter?.auto ? 'ok' : 'warn' }), iconName: 'conveyor', compact: true });
    const jamM = ui.metric({ label: 'Jam', bind: () => ({ value: this.jamActive ? 'JAMMED' : 'CLEAR', tone: this.jamActive ? 'danger' : 'ok' }), iconName: 'warning', compact: true });
    grid.append(sortedM, sortedBM, diverterM, jamM);
    sec.appendChild(grid);

    const barA = ui.progressBar(0);
    const barB = ui.progressBar(0);
    const bars = el('div', { style: { marginTop: '10px' } },
      el('div', { class: 'section-title', style: { margin: '0 0 5px' } }, 'BIN A FILL', el('span', { class: 'side' })), barA,
      el('div', { class: 'section-title', style: { margin: '9px 0 5px' } }, 'BIN B FILL', el('span', { class: 'side' })), barB);
    sec.appendChild(bars);
    this.addPanelBind(() => {
      const a = this.binPct('A'), b = this.binPct('B');
      barA._set(a); barA.className = `progress ${a >= 100 ? 'danger' : a >= 80 ? 'warn' : ''}`;
      barB._set(b); barB.className = `progress ${b >= 100 ? 'danger' : b >= 80 ? 'warn' : ''}`;
      bars.firstChild.querySelector('.side').textContent = `${this.binData.A?.count ?? 0}/${this.binData.A?.capacity ?? 0}`;
      bars.children[2].querySelector('.side').textContent = `${this.binData.B?.count ?? 0}/${this.binData.B?.capacity ?? 0}`;
    });
    body.appendChild(sec);

    // cartons in transit list
    const listSec = el('div', { class: 'section' });
    listSec.appendChild(el('div', { class: 'section-title' }, ui.icon('package', 12), 'Cartons In Transit', el('span', { class: 'side', text: 'LIVE TRACKING' })));
    const list = el('div', { class: 'section-card', style: { padding: '2px 10px', maxHeight: '170px', overflowY: 'auto' } });
    let lastSig = '';
    this.addPanelBind(() => {
      const sig = this.boxes.map((b) => `${b.serial}${b.state}`).join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      ui.clear(list);
      const beltBoxes = this.boxes.filter((b) => b.state === 'belt').slice(-8).reverse();
      if (!beltBoxes.length) { list.appendChild(el('div', { class: 'empty', style: { padding: '10px' }, text: 'No cartons on the belt.' })); return; }
      for (const b of beltBoxes) {
        const row = el('div', { class: 'kv-row', style: { minHeight: '26px' } });
        row.append(
          el('span', { class: 'k' }, ui.statusDot(b.scanned ? 'live' : 'warn'), `${b.serial}`),
          el('span', { class: 'v text', text: `${b.sizeKey} · ${b.colorKey} · ${b.dest ? 'BIN ' + b.dest : '—'}` }),
        );
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => this.selectObject(b.id));
        list.appendChild(row);
      }
    });
    listSec.appendChild(list);
    body.appendChild(listSec);

    // line activity log
    const logSec = el('div', { class: 'section' });
    logSec.appendChild(el('div', { class: 'section-title' }, ui.icon('timeline', 12), 'Line Activity Log', el('span', { class: 'side', text: 'EVENT LOG' })));
    const log = el('div', { class: 'section-card', style: { padding: '2px 10px', maxHeight: '150px', overflowY: 'auto' } });
    let lastEv = -1;
    this.addPanelBind(() => {
      if (lastEv === this.events.length) return;
      lastEv = this.events.length;
      ui.clear(log);
      const items = this.events.filter((e) => /carton|conveyor|motor|jam|bin|diverter|sort/i.test(e.title)).slice(0, 8);
      if (!items.length) { log.appendChild(el('div', { class: 'empty', style: { padding: '12px' }, text: 'No line activity yet.' })); return; }
      for (const e of items) log.appendChild(el('div', { class: 'kv-row' }, el('span', { class: 'k', text: e.title }), el('span', { class: 'v', text: e.time })));
    });
    logSec.appendChild(log);
    body.appendChild(logSec);
  }

  getQuickActions() {
    return [
      { label: 'Start Line', icon: 'play', variant: 'subtle', onClick: () => this.startLine() },
      { label: 'Stop Line', icon: 'stop', onClick: () => this.stopLine() },
      { label: 'Spawn Carton', icon: 'plus', onClick: () => { const b = this.spawnBox({}); if (b) ui.toast(`${b.serial} inducted.`, { type: 'ok' }); } },
      { label: 'Inject Jam', icon: 'warning', variant: 'warn', onClick: () => this.injectJam() },
      { label: 'Box Spawning', icon: 'package', onClick: () => this.setTab('spawn') },
    ];
  }

  getLegend() {
    return [
      { color: '#ffb547', label: 'Conveyor / Bin A route' },
      { color: '#46a9ff', label: 'Bin B discharge' },
      { color: '#3ce58b', label: 'Line running' },
      { color: '#ff4a5f', label: 'Jam / E-stop' },
      { color: '#d6dade', label: 'Cartons (sizes/colours)' },
    ];
  }

  /* ==========================================================
     SHARED CONTROL BUILDERS
     ========================================================== */
  lineTone() {
    const st = this.lineState;
    return st === 'RUNNING' ? 'ok' : st === 'STOPPED' ? 'warn' : st === 'PAUSED' ? 'warn' : 'danger';
  }

  lineCommandControls() {
    return [
      { type: 'button', label: 'Start Line', variant: 'subtle', iconName: 'play', onClick: () => { this.startLine(); this.refreshInspector(); } },
      { type: 'button', label: 'Stop Line', iconName: 'stop', onClick: () => { this.stopLine(); this.refreshInspector(); } },
      { type: 'button', label: 'Pause', iconName: 'pause', onClick: () => { this.pauseLine(); this.refreshInspector(); } },
      { type: 'button', label: 'Resume', iconName: 'play', onClick: () => { this.resumeLine(); this.refreshInspector(); } },
      { type: 'button', label: 'Emergency Stop', variant: 'danger', iconName: 'power', onClick: () => { this.emergencyStopLine(); this.refreshInspector(); } },
      { type: 'button', label: 'Reset E-Stop', variant: 'ghost', iconName: 'reset', onClick: () => { this.resetEmergencyStop(); this.refreshInspector(); } },
      { type: 'button', label: 'Reset Jam', variant: 'warn', iconName: 'reset', onClick: () => { this.resetJam(); this.refreshInspector(); } },
      { type: 'button', label: 'Inject Jam', variant: 'ghost', iconName: 'warning', onClick: () => { this.injectJam(); this.refreshInspector(); } },
    ];
  }

  beltDynamicsControls() {
    return [
      { type: 'slider', label: 'Belt speed', min: 0.1, max: 2.5, step: 0.05, value: this.config.beltSpeed, unit: 'm/s', onInput: (v) => { this.config.beltSpeed = v; }, onChange: () => this.saveSoon() },
      { type: 'slider', label: 'Acceleration ramp', min: 0.05, max: 2.5, step: 0.05, value: this.config.acceleration, unit: 'm/s²', onInput: (v) => { this.config.acceleration = v; }, onChange: () => this.saveSoon() },
      { type: 'slider', label: 'Deceleration ramp', min: 0.05, max: 3, step: 0.05, value: this.config.deceleration, unit: 'm/s²', onInput: (v) => { this.config.deceleration = v; }, onChange: () => this.saveSoon() },
      { type: 'segment', options: [{ value: 1, label: 'Forward' }, { value: -1, label: 'Reverse' }], value: this.config.direction, onChange: (v) => { this.setDirection(+v); this.refreshInspector(); } },
      { type: 'toggle', label: 'Motor energised', description: 'De-energising lets the belt coast to a stop.', value: !!this.motor?.on, onChange: (v) => { this.setMotor(v); this.refreshInspector(); } },
    ];
  }

  setDiverterAuto(on) {
    this.config.diverter.auto = !!on;
    this.diverter.auto = !!on;
    this.logEvent(on ? 'Diverter automatic' : 'Diverter manual', on ? 'Diverter follows the sort recipe.' : 'Diverter held at the operator position.', on ? 'ok' : 'warn');
    this.saveSoon(); this.refreshLive(); this.refreshInspector();
  }

  setDiverterPosition(pos) {
    this.config.diverter.auto = false;
    this.config.diverter.position = pos === 1 ? 1 : 0;
    this.diverter.position = this.config.diverter.position;
    this.logEvent('Diverter manual position', `Arm held ${this.diverter.position ? 'DIVERT (Bin A)' : 'STRAIGHT (Bin B)'}.`, 'warn');
    this.saveSoon(); this.refreshLive(); this.refreshInspector();
  }

  setSortingAuto(on) {
    this.config.sorting.auto = !!on;
    this.logEvent(on ? 'Automatic sorting enabled' : 'Manual sorting enabled', on ? 'Recipes drive the diverter.' : 'Operator controls the diverter.', on ? 'ok' : 'warn');
    this.saveSoon(); this.refreshLive(); this.refreshInspector();
  }

  setCoolingFan(on) {
    this.config.coolingFan = !!on;
    this.logEvent(on ? 'Motor cooling fan on' : 'Motor cooling fan off', 'Forced-air cooling circuit.', on ? 'ok' : 'warn');
    this.saveSoon(); this.refreshLive(); this.refreshInspector();
  }

  toggleEntrySensorFault(on) {
    this.faults.entrySensor = !!on;
    this.setSensorEnabled('entry-present', !on);
    this.logEvent(on ? 'Sensor fault injected' : 'Sensor fault cleared', 'Entry presence photo-eye diagnostic.', on ? 'warn' : 'ok');
    this.evaluateAlarms(); this.refreshLive();
  }

  toggleScannerFault(on) {
    this.faults.scanner = !!on;
    this.logEvent(on ? 'Scanner fault injected' : 'Scanner fault cleared', 'Barcode tunnel diagnostic.', on ? 'warn' : 'ok');
    this.evaluateAlarms(); this.refreshLive();
  }

  resetCounters() {
    this.sortedA = 0; this.sortedB = 0; this.sortedTotal = 0; this.sortFailures = 0;
    this.scanCount = 0; this.jamEvents = 0; this.thermalTrips = 0;
    this.throughput = [];
    this.logEvent('Counters reset', 'Sorting performance counters cleared.', 'info');
    this.refreshLive(); this.refreshInspector();
  }

  removeLastCartonFromBin(key) {
    const bin = this.binData[key];
    if (!bin) return;
    const last = [...this.boxes].reverse().find((b) => b.state === 'bin' && b.binKey === key);
    if (!last) { ui.toast(`Bin ${key} is already empty.`, { type: 'info' }); return; }
    bin.count = Math.max(0, bin.count - 1);
    bin.sorted = Math.max(0, bin.sorted - 1);
    this.removeBox(last, '');
    this.updateBinVisual(bin);
    this.logEvent('Carton removed from bin', `${last.serial} removed from Bin ${key}.`, 'info');
    this.refreshInspector(); this.refreshLive();
  }

  addTestCartonsToBin(key, count = 3) {
    const bin = this.binData[key];
    if (!bin) return;
    let added = 0;
    for (let i = 0; i < count; i++) {
      if (bin.count >= bin.capacity) break;
      const b = this.spawnBox({}, { silent: true, seeded: true, bypassLimits: true });
      if (!b) break;
      b.state = 'chute';
      b.chute = key;
      b.dest = key;
      b.expectedDest = key;
      b.sortedPassed = true;
      b.scanned = true;
      b.chuteT = 1;
      this.settleBoxInBin(b);
      added++;
    }
    this.updateBinVisual(bin);
    if (added) ui.toast(`${added} test cartons loaded into Bin ${key}.`, { type: 'info' });
    this.refreshLive();
  }

  fillBinToCapacity(key) {
    const bin = this.binData[key];
    if (!bin) return;
    this.addTestCartonsToBin(key, bin.capacity - bin.count);
    this.evaluateAlarms();
    this.refreshLive();
  }

  restoreDiagnostics() {
    if (this.faults.entrySensor) this.toggleEntrySensorFault(false);
    if (this.faults.scanner) this.toggleScannerFault(false);
    this.jamActive = false;
    this.jamCause = '';
    this.motor.trip = false;
    this.motor.tripReason = '';
    this.motor.on = true;
    this.belt.motorOn = true;
    this.config.motorOn = true;
    this.belt.state = 'STOPPED';
    this.unexpectedStop = false;
    for (const b of this.boxes) b.still = 0;
    this.logEvent('Diagnostics restored', 'Fault injections cleared; line ready.', 'ok');
    this.evaluateAlarms(); this.refreshLive(); this.saveSoon();
  }

  testTowerLight() {
    for (const t of this.towerLights) t.userData?.setLamps?.(true, true, true);
    ui.toast('Stack light lamp test — all three segments illuminated.', { type: 'info' });
    setTimeout(() => { if (!this._destroyed) this.updateIndicators(0); }, 1600);
  }

  boxStateLabel(b) {
    if (!b) return '—';
    if (b.state === 'belt') return 'ON BELT';
    if (b.state === 'chute') return `IN CHUTE ${b.chute || ''}`.trim();
    if (b.state === 'bin') return `IN BIN ${b.binKey || ''}`.trim();
    return 'UNKNOWN';
  }

  setBoxClassification(box, classification) {
    if (!box) return;
    box.classification = classification;
    if (box.state === 'belt' && !box.scanned) {
      box.expectedDest = this.ruleDestination(box);
      box.dest = box.expectedDest;
    }
    this.logEvent('Carton reclassified', `${box.serial} → ${classification}.`, 'info');
    this.saveSoon(); this.refreshInspector(); this.refreshLive();
  }

  routeBoxTo(box, key) {
    if (!box) return;
    if (box.state === 'bin') { ui.toast('Carton is already sorted into a bin.', { type: 'warn' }); return; }
    box.destOverride = key;
    box.expectedDest = key;
    if (box.state === 'belt' && !box.sortedPassed) box.dest = key;
    this.logEvent('Carton rerouted', `${box.serial} manually assigned to Bin ${key}.`, 'info');
    this.saveSoon(); this.refreshInspector(); this.refreshLive();
  }

  spawnBatch(count = 3) {
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (this.spawnBox({}, { silent: true })) spawned++;
    }
    this.logEvent(spawned ? 'Cartons inducted' : 'Batch spawn blocked', `${spawned} cartons queued onto the belt.`, spawned ? 'ok' : 'warn');
    ui.toast(`${spawned} carton${spawned === 1 ? '' : 's'} introduced to the belt.`, { type: spawned === count ? 'ok' : 'warn' });
    this.refreshLive();
  }

  scheduleCarton(delay) {
    const s = this.config.spawn;
    const opts = {
      size: s.size !== 'random' ? s.size : undefined,
      color: s.color !== 'random' ? s.color : undefined,
      classification: s.classification !== 'random' ? s.classification : undefined,
      destOverride: s.destination !== 'auto' ? s.destination : undefined,
    };
    if (delay > 0) {
      this.pendingBoxes.push({ due: this.simTime + delay, options: opts });
      this.logEvent('Carton scheduled', `Induction scheduled in ${Math.round(delay)} s.`, 'info');
      ui.toast(`Carton scheduled in ${Math.round(delay)} s.`, { type: 'info' });
    } else {
      const b = this.spawnBox(opts, {});
      if (b) ui.toast(`${b.serial} inducted onto the line.`, { type: 'ok' });
    }
    this.refreshLive();
  }

  /* ==========================================================
     OBJECT INSPECTORS
     ========================================================== */
  getObjectInspector(obj) {
    switch (obj.kind) {
      case 'conveyor': return this.conveyorInspector(obj);
      case 'motor': return this.motorInspector(obj);
      case 'gearbox': return this.gearboxInspector(obj);
      case 'dial': return this.defaultInspector(obj);
      case 'diverter': return this.diverterInspector(obj);
      case 'station': return this.stationInspector(obj);
      case 'chute': return this.chuteInspector(obj);
      case 'bin': return this.binInspector(obj);
      case 'box': return this.boxInspector(obj);
      case 'scanner': return this.scannerInspector(obj);
      case 'infeed': return this.infeedInspector(obj);
      case 'cabinet': return this.cabinetInspector(obj);
      case 'estop': return this.estopInspector(obj);
      case 'stacklight': return this.stackLightInspector(obj);
      case 'lamp': return this.lampInspector(obj);
      case 'guard': return this.guardInspector(obj);
      case 'room': return this.roomInspector(obj);
      case 'door': return this.doorInspector(obj);
      case 'hmi': return this.hmiInspector(obj);
      case 'panel': return this.panelInspector(obj);
      default: return this.defaultInspector(obj);
    }
  }

  conveyorInspector(obj) {
    return {
      title: 'Sorting Conveyor CVY-03',
      subtitle: `U-SHAPED BELT LOOP · ${num(this.pathLength, 1)} m`,
      iconName: 'conveyor',
      badge: () => ({ text: this.lineState, tone: this.lineTone() }),
      fields: [
        { label: 'Line state', get: () => this.lineState },
        { label: 'Belt speed', get: () => `${num(this.belt?.speed, 2)} m/s · target ${num(this.config.beltSpeed, 2)}` },
        { label: 'Transport direction', get: () => (this.config.direction > 0 ? 'FORWARD' : 'REVERSE') },
        { label: 'Drive motor', get: () => (this.motor?.trip ? 'THERMAL TRIP' : this.motor?.on ? 'ENERGISED' : 'OFF') },
        { label: 'Cartons in transit', get: () => String(this.boxesOnBelt) },
        { label: 'Sorted total', get: () => `${this.sortedTotal} (A ${this.sortedA} · B ${this.sortedB})` },
        { label: 'Sort failure rate', get: () => `${num(this.sortFailureRate, 1)} %` },
        { label: 'Jam detector', get: () => (this.jamActive ? 'JAMMED' : 'CLEAR') },
      ],
      sections: [
        { title: 'Line Commands', iconName: 'play', controls: this.lineCommandControls() },
        { title: 'Belt Dynamics', iconName: 'sliders', controls: this.beltDynamicsControls() },
      ],
      actions: [
        { label: 'Box Spawning', icon: 'package', onClick: () => this.setTab('spawn') },
        { label: 'Open Diverter', icon: 'conveyor', onClick: () => this.selectObject('diverter.arm') },
      ],
      note: 'Belt surface, rollers, pulleys and the drive fan animate only while the belt is actually moving. Hiding layers never pauses the simulation.',
    };
  }

  motorInspector(obj) {
    return {
      title: 'Belt Drive Motor M-03',
      subtitle: '11 kW ASYNCHRONOUS DRIVE · IE3',
      iconName: 'motor',
      badge: () => ({ text: this.motor?.trip ? 'TRIPPED' : this.motor?.on ? 'ENERGISED' : 'OFF', tone: this.motor?.trip ? 'danger' : this.motor?.on ? 'ok' : 'muted' }),
      fields: [
        { label: 'Winding temperature', get: () => `${num(this.motor?.temp, 1)} °C` },
        { label: 'Stator current', get: () => `${num(this.motor?.current, 2)} A` },
        { label: 'Thermal trip limit', get: () => `${num(this.threshold('motorOverheatTemp', 78), 1)} °C` },
        { label: 'Cooling fan', get: () => (this.config.coolingFan ? 'RUNNING' : 'DISABLED') },
        { label: 'Belt speed demand', get: () => `${num(this.config.beltSpeed, 2)} m/s` },
        { label: 'Trip reason', get: () => (this.motor?.trip ? this.motor.tripReason.toUpperCase() : '—') },
        { label: 'Thermal trips', get: () => String(this.thermalTrips) },
      ],
      sections: [{
        title: 'Motor Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Motor energised', description: 'Main contactor for the drive motor.', value: !!this.motor?.on, onChange: (v) => { this.setMotor(v); this.refreshInspector(); } },
          { type: 'toggle', label: 'Cooling fan enabled', description: 'Forced-air cooling across the motor fins.', value: this.config.coolingFan !== false, onChange: (v) => this.setCoolingFan(v) },
          { type: 'button', label: 'Reset Thermal Trip', variant: 'warn', iconName: 'reset', onClick: () => { this.resetMotorTrip(); this.refreshInspector(); } },
          { type: 'button', label: 'Simulate Overload Trip', variant: 'danger', iconName: 'warning', onClick: () => {
            this.motor.temp = this.threshold('motorOverheatTemp', 78) + 2;
            this.thermalTrip('overheat (commissioning test)');
            this.refreshInspector();
          } },
        ],
      }],
      note: 'Thermal model: winding temperature rises with load current and ambient temperature, and falls when the motor is de-energised or the cooling fan is running.',
    };
  }

  gearboxInspector(obj) {
    return {
      title: 'Helical Gearbox GB-03',
      subtitle: 'REDUCTION DRIVE · RATIO 18.4:1',
      iconName: 'equipment',
      badge: () => ({ text: this.belt?.speed > 0.05 ? 'TRANSMITTING' : 'IDLE', tone: this.belt?.speed > 0.05 ? 'ok' : 'muted' }),
      fields: [
        { label: 'Ratio', value: '18.4 : 1' },
        { label: 'Output speed', get: () => `${num((this.belt?.speed || 0) / 0.23 * 60 / (2 * Math.PI), 1)} rpm` },
        { label: 'Oil temperature', get: () => `${num((this._ambient || 23) + (this.motor?.current || 0) * 0.35, 1)} °C` },
        { label: 'Oil level', value: 'NORMAL' },
        { label: 'Coupling guard', get: () => (this.motor?.on ? 'INTERLOCKED' : 'SAFE') },
      ],
      sections: [{
        title: 'Gearbox Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Open Motor Inspector', iconName: 'motor', onClick: () => this.selectObject('drive.motor') },
          { type: 'button', label: 'Open Coupling Guard', iconName: 'shieldCheck', onClick: () => this.selectObject('drive.guard') },
        ],
      }],
      note: 'The gearbox transmits motor torque to the head pulley. Oil temperature is derived from the live drive load.',
    };
  }

  diverterInspector(obj) {
    const d = this.diverter;
    return {
      title: 'Pneumatic Diverter Arm',
      subtitle: 'SWING-ARM SORTER · 6 bar',
      iconName: 'conveyor',
      badge: () => ({ text: d ? (d.angle > 0.5 ? 'DIVERTING' : 'STRAIGHT') : '—', tone: d?.angle > 0.5 ? 'warn' : 'ok' }),
      fields: [
        { label: 'Control mode', get: () => (this.diverter?.auto ? 'AUTOMATIC' : 'MANUAL') },
        { label: 'Arm position', get: () => `${Math.round((this.diverter?.angle || 0) * 100)} % swing` },
        { label: 'Target position', get: () => (this.diverter?.target ? 'DIVERT' : 'STRAIGHT') },
        { label: 'Actuation cycles', get: () => String(this.diverter?.cycles || 0) },
        { label: 'Air pressure', get: () => `${num(this.diverter?.pressure, 1)} bar` },
        { label: 'Sort recipe', get: () => (this.config.sorting.strategy || 'size').toUpperCase() },
        { label: 'Success rate', get: () => `${num(this.config.sorting.successRate, 0)} %` },
      ],
      sections: [
        {
          title: 'Diverter Controls', iconName: 'sliders', controls: [
            { type: 'toggle', label: 'Automatic diverter', description: 'Follow the active sort recipe automatically.', value: !!this.diverter?.auto, onChange: (v) => this.setDiverterAuto(v) },
            { type: 'segment', options: [{ value: 0, label: 'Straight · Bin B' }, { value: 1, label: 'Divert · Bin A' }], value: this.config.diverter.position, onChange: (v) => this.setDiverterPosition(+v) },
            { type: 'slider', label: 'Air pressure', min: 3, max: 8, step: 0.1, value: this.diverter?.pressure ?? 6.2, unit: 'bar', onInput: (v) => { if (this.diverter) this.diverter.pressure = v; }, onChange: () => this.refreshInspector() },
            { type: 'button', label: 'Swing Arm to Bin A', variant: 'subtle', iconName: 'chevronRight', onClick: () => { this.setDiverterPosition(1); } },
            { type: 'button', label: 'Return Arm Straight', iconName: 'chevronLeft', onClick: () => { this.setDiverterPosition(0); } },
          ],
        },
        {
          title: 'Live Sorting Recipe', iconName: 'sliders', controls: [
            { type: 'slider', label: 'Sorting success rate', min: 0, max: 100, step: 1, value: this.config.sorting.successRate, unit: '%', onInput: (v) => { this.config.sorting.successRate = v; }, onChange: () => this.saveSoon() },
            { type: 'toggle', label: 'Automatic sorting', value: this.config.sorting.auto !== false, onChange: (v) => this.setSortingAuto(v) },
          ],
        },
      ],
      note: 'When retracted, cartons travel to the end of the line and discharge into Bin B. When the arm swings, cartons are pushed into the Bin A chute.',
    };
  }

  stationInspector(obj) {
    return {
      title: 'Swing-Arm Sort Station',
      subtitle: 'PHOTOELECTRIC SORT POINT',
      iconName: 'conveyor',
      badge: () => ({ text: this.jamActive ? 'BLOCKED' : 'READY', tone: this.jamActive ? 'danger' : 'ok' }),
      fields: [
        { label: 'Sort photocell', get: () => this.sensorText('sort-sensor') },
        { label: 'Diverter', get: () => (this.diverter?.angle > 0.5 ? 'DIVERT (Bin A)' : 'STRAIGHT (Bin B)') },
        { label: 'Barcodes scanned', get: () => String(this.scanCount) },
        { label: 'Cartons sorted', get: () => String(this.sortedTotal) },
        { label: 'Jam detected', get: () => (this.jamActive ? 'YES' : 'NO') },
      ],
      sections: [{
        title: 'Station Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Open Diverter Inspector', iconName: 'conveyor', onClick: () => this.selectObject('diverter.arm') },
          { type: 'button', label: 'Inject Carton Jam', variant: 'warn', iconName: 'warning', onClick: () => { this.injectJam(); this.refreshInspector(); } },
          { type: 'button', label: 'Reset Jam', variant: 'ghost', iconName: 'reset', onClick: () => { this.resetJam(); this.refreshInspector(); } },
          { type: 'button', label: 'Induct Carton', iconName: 'plus', onClick: () => { this.spawnBox({}); this.refreshLive(); } },
        ],
      }],
    };
  }

  chuteInspector(obj) {
    const key = obj.id.endsWith('A') ? 'A' : 'B';
    const bin = this.binData[key];
    return {
      title: obj.label || `Discharge Chute ${key}`,
      subtitle: `GRAVITY CHUTE · BIN ${key}`,
      iconName: 'chevronRight',
      badge: { text: this.jamActive ? 'BLOCKED' : 'CLEAR', tone: this.jamActive ? 'danger' : 'ok' },
      fields: [
        { label: 'Destination', value: `Collection Bin ${key}` },
        { label: 'Bin fill', get: () => `${ui.fmt(this.binPct(key), 0)} %` },
        { label: 'Bin contents', get: () => `${bin?.count ?? 0} / ${bin?.capacity ?? 0} cartons` },
        { label: 'Chute surface', value: 'Stainless steel · 20° incline' },
      ],
      sections: [{
        title: 'Chute Controls', iconName: 'sliders', controls: [
          { type: 'button', label: `Open Bin ${key} Inspector`, iconName: 'inventory', onClick: () => this.selectObject(`bin.${key}`) },
          { type: 'button', label: 'Clear Target Bin', variant: 'ghost', iconName: 'trash', onClick: () => { this.clearBin(key); this.refreshInspector(); } },
          { type: 'button', label: 'Force Diverter to This Bin', iconName: 'conveyor', onClick: () => this.setDiverterPosition(key === 'A' ? 1 : 0) },
        ],
      }],
    };
  }

  binInspector(obj) {
    const key = obj.id.replace('bin.', '');
    const bin = this.binData[key];
    if (!bin) return this.defaultInspector(obj);
    const pct = () => this.binPct(key);
    const top = () => [...this.boxes].reverse().find((b) => b.state === 'bin' && b.binKey === key);
    return {
      title: bin.name,
      subtitle: `COLLECTION BIN ${key} · ${this.config.sorting.strategy.toUpperCase()} SORT`,
      iconName: 'inventory',
      badge: () => ({ text: pct() >= 100 ? 'FULL' : pct() >= 80 ? 'NEAR FULL' : 'ACCEPTING', tone: pct() >= 100 ? 'danger' : pct() >= 80 ? 'warn' : 'ok' }),
      fields: [
        { label: 'Cartons held', get: () => `${bin.count} / ${bin.capacity}` },
        { label: 'Fill level', get: () => `${ui.fmt(pct(), 0)} %` },
        { label: 'Full detection', get: () => (pct() >= this.threshold('binFullPercent', 92) ? 'FULL THRESHOLD REACHED' : 'NORMAL') },
        { label: 'Cartons sorted here', get: () => String(bin.sorted) },
        { label: 'Top carton', get: () => top()?.serial || '—' },
        { label: 'Bin sensor', get: () => this.sensorText(bin.sensorId) },
      ],
      sections: [
        {
          title: 'Bin Controls', iconName: 'sliders', controls: [
            { type: 'number', label: 'Bin capacity', unit: 'cartons', min: 1, max: 60, step: 1, value: bin.capacity, onChange: (v) => this.setBinCapacity(key, v) },
            { type: 'button', label: 'Clear Bin', variant: 'warn', iconName: 'trash', onClick: () => { this.clearBin(key); } },
            { type: 'button', label: 'Remove Last Carton', variant: 'ghost', iconName: 'minus', onClick: () => { this.removeLastCartonFromBin(key); } },
            { type: 'button', label: 'Load 3 Test Cartons', variant: 'ghost', iconName: 'plus', onClick: () => { this.addTestCartonsToBin(key, 3); this.refreshInspector(); } },
            { type: 'button', label: 'Fill To Capacity (test)', variant: 'danger', iconName: 'warning', onClick: () => { this.fillBinToCapacity(key); this.refreshInspector(); } },
          ],
        },
        {
          title: 'Contents', iconName: 'package', controls: (() => {
            const held = this.boxes.filter((b) => b.state === 'bin' && b.binKey === key).slice(-6);
            if (!held.length) return [{ type: 'label', text: 'Bin is empty.' }];
            return held.map((b) => ({ type: 'button', label: `${b.serial} · ${b.sizeKey} · ${b.colorKey}`, iconName: 'package', variant: 'ghost', onClick: () => this.selectObject(b.id) }));
          })(),
        },
      ],
      note: 'When the inventory reaches capacity, boxes can no longer be accepted and cartons block at the sort point causing a jam until the bin is cleared.',
    };
  }

  boxInspector(obj) {
    const box = this.boxes.find((b) => b.id === obj.id);
    if (!box) return this.defaultInspector(obj);
    const pct = () => clamp(box.u * 100, 0, 100);
    const dist = () => box.u * this.pathLength;
    return {
      title: `Carton ${box.serial}`,
      subtitle: `${box.profile.label.toUpperCase()} · ${box.colorKey.toUpperCase()} · ${box.weight} kg`,
      iconName: 'package',
      badge: () => {
        const tone = box.state === 'bin' ? (box.missorted ? 'warn' : 'ok') : box.state === 'belt' ? 'ok' : 'warn';
        return { text: this.boxStateLabel(box), tone };
      },
      fields: [
        { label: 'Carton ID', value: box.serial },
        { label: 'Size class', value: `${box.profile.label} (${box.sizeKey})` },
        { label: 'Colour', value: box.colorKey.toUpperCase() },
        { label: 'Weight', value: `${box.weight} kg` },
        { label: 'Classification', get: () => box.classification.toUpperCase() },
        { label: 'Sort location', get: () => (box.state === 'belt' ? `${num(dist(), 1)} m · ${ui.fmt(pct(), 0)} %` : this.boxStateLabel(box)) },
        { label: 'Scanned', get: () => (box.scanned ? 'YES' : 'PENDING') },
        { label: 'Assigned bin', get: () => (box.dest ? `BIN ${box.dest}` : 'NOT ASSIGNED') },
        { label: 'Expected bin', get: () => (box.expectedDest ? `BIN ${box.expectedDest}` : '—') },
        { label: 'Result', get: () => (box.state === 'bin' ? (box.missorted ? 'MIS-SORT' : 'SORTED OK') : 'IN PROGRESS') },
      ],
      sections: [
        {
          title: 'Handling', iconName: 'package', controls: [
            { type: 'select', label: 'Change classification', options: CLASSIFICATIONS.map((c) => ({ value: c.key, label: c.label })), value: box.classification, onChange: (v) => this.setBoxClassification(box, v) },
            { type: 'select', label: 'Manual destination', options: [{ value: 'auto', label: 'Automatic (recipe)' }, { value: 'A', label: 'Bin A' }, { value: 'B', label: 'Bin B' }], value: box.destOverride || 'auto', onChange: (v) => {
              if (v === 'auto') { box.destOverride = null; box.expectedDest = this.ruleDestination(box); if (box.state === 'belt' && !box.sortedPassed) box.dest = box.expectedDest; this.saveSoon(); this.refreshInspector(); }
              else this.routeBoxTo(box, v);
            } },
            { type: 'button', label: 'Route to Bin A', variant: 'ghost', iconName: 'chevronLeft', onClick: () => this.routeBoxTo(box, 'A') },
            { type: 'button', label: 'Route to Bin B', variant: 'ghost', iconName: 'chevronRight', onClick: () => this.routeBoxTo(box, 'B') },
          ],
        },
        {
          title: 'Actions', iconName: 'sliders', controls: [
            { type: 'button', label: box.state === 'bin' ? `Open Bin ${box.binKey}` : 'Open Bin A Inspector', iconName: 'inventory', onClick: () => this.selectObject(box.state === 'bin' ? `bin.${box.binKey}` : 'bin.A') },
            { type: 'button', label: 'Remove Carton From Line', variant: 'danger', iconName: 'trash', onClick: () => { this.removeBox(box, 'removed by operator'); } },
          ],
        },
      ],
      note: 'Carton identity, routing and bin inventory are simulated. Removing a carton releases its space for new induction.',
    };
  }

  scannerInspector(obj) {
    return {
      title: 'Barcode Scan Tunnel',
      subtitle: 'LASER CLASSIFICATION · PRE-SORT',
      iconName: 'search',
      badge: () => ({ text: this.faults.scanner ? 'FAULT' : 'SCANNING', tone: this.faults.scanner ? 'danger' : 'ok' }),
      fields: [
        { label: 'Scans performed', get: () => String(this.scanCount) },
        { label: 'Scanner state', get: () => (this.faults.scanner ? 'FAULT INJECTED' : 'OPERATIONAL') },
        { label: 'Laser class', value: 'Class 2 · 650 nm' },
        { label: 'Sort recipe', get: () => (this.config.sorting.strategy || 'size').toUpperCase() },
        { label: 'Success rate', get: () => `${num(this.config.sorting.successRate, 0)} %` },
      ],
      sections: [{
        title: 'Scanner Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Scanner fault (diagnostic)', description: 'Disables barcode scanning; cartons keep their default route.', value: !!this.faults.scanner, onChange: (v) => { this.toggleScannerFault(v); this.refreshInspector(); } },
          { type: 'button', label: 'Trigger Test Scan', iconName: 'search', onClick: () => { this.scannerFlash = 2; this.scanCount += 1; ui.toast('Test scan captured.', { type: 'ok' }); this.refreshInspector(); } },
          { type: 'button', label: 'Open Sort Station', iconName: 'conveyor', onClick: () => this.selectObject('sort.station') },
        ],
      }],
      note: 'Every carton is classified at the scan tunnel before reaching the sort point. Scans drive the automatic diverter recipe.',
    };
  }

  infeedInspector(obj) {
    return {
      title: 'Carton Infeed Station',
      subtitle: 'INDUCTION & PHOTO-EYE',
      iconName: 'package',
      badge: () => ({ text: this.config.spawn.auto ? 'AUTO FEED' : 'MANUAL', tone: this.config.spawn.auto ? 'ok' : 'warn' }),
      fields: [
        { label: 'Entry photo-eye', get: () => this.sensorText('entry-present') },
        { label: 'Cartons in transit', get: () => String(this.boxesOnBelt) },
        { label: 'Scheduled inductions', get: () => String(this.pendingBoxes.length) },
        { label: 'Auto spawn', get: () => (this.config.spawn.auto ? 'ENABLED' : 'DISABLED') },
        { label: 'Spawn interval', get: () => `${num(this.config.spawn.interval, 0)} s` },
        { label: 'Max cartons', get: () => String(this.config.spawn.maxItems) },
      ],
      sections: [{
        title: 'Induction Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Automatic induct', value: this.config.spawn.auto !== false, onChange: (v) => { this.config.spawn.auto = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'button', label: 'Induct Carton', variant: 'subtle', iconName: 'plus', onClick: () => { const b = this.spawnBox({}); if (b) ui.toast(`${b.serial} inducted.`, { type: 'ok' }); this.refreshInspector(); } },
          { type: 'button', label: 'Induct 3 Cartons', iconName: 'plus', onClick: () => { this.spawnBatch(3); this.refreshInspector(); } },
          { type: 'button', label: 'Box Spawning Manager', iconName: 'package', onClick: () => this.setTab('spawn') },
        ],
      }],
    };
  }

  cabinetInspector(obj) {
    return {
      title: 'Line Control Cabinet',
      subtitle: 'PLC-03 · VFD + SAFETY RELAY',
      iconName: 'panel',
      badge: () => ({ text: this.lineState, tone: this.lineTone() }),
      fields: [
        { label: 'PLC mode', get: () => (this.manualMode ? 'MANUAL' : 'AUTOMATIC') },
        { label: 'Global simulation', get: () => (this.running ? (this.paused ? 'PAUSED' : 'RUNNING') : 'STOPPED') },
        { label: 'Drive state', get: () => this.lineState },
        { label: 'Belt speed', get: () => `${num(this.belt?.speed, 2)} m/s` },
        { label: 'Active alarms', get: () => String(this.getActiveAlarms().length) },
        { label: 'Uptime', get: () => ui.fmtDuration(this.realTime) },
      ],
      sections: [
        { title: 'Control Cabinet', iconName: 'sliders', controls: this.lineCommandControls().slice(0, 6) },
        {
          title: 'Automation', iconName: 'sliders', controls: [
            { type: 'toggle', label: 'Manual control mode', description: 'Suspends automatic carton induct and auto sorting.', value: this.manualMode, onChange: (v) => { this.setManual(v); this.refreshInspector(); } },
            { type: 'toggle', label: 'Automatic carton induct', value: this.config.spawn.auto !== false, onChange: (v) => { this.config.spawn.auto = v; this.saveSoon(); this.refreshInspector(); } },
            { type: 'button', label: 'Open Simulation Center', iconName: 'sliders', onClick: () => this.setTab('simulation') },
            { type: 'button', label: 'Open Operator HMI', iconName: 'panel', onClick: () => this.selectObject('panel.hmi') },
          ],
        },
      ],
      note: 'The cabinet PLC supervises the VFD, safety relay and sorting recipe. All controls act on the live engine.',
    };
  }

  estopInspector(obj) {
    const active = () => this.belt?.state === 'ESTOP';
    return {
      title: 'Emergency Stop Pushbutton',
      subtitle: 'SAFETY CIRCUIT · CAT 3',
      iconName: 'power',
      badge: () => ({ text: active() ? 'PRESSED' : 'RELEASED', tone: active() ? 'danger' : 'ok' }),
      fields: [
        { label: 'Button state', get: () => (active() ? 'LATCHED (PRESSED)' : 'RELEASED') },
        { label: 'Safety circuit', get: () => (active() ? 'OPEN' : 'CLOSED') },
        { label: 'Drive contactor', get: () => (this.motor?.on ? 'CLOSED' : 'OPEN') },
        { label: 'Line state', get: () => this.lineState },
      ],
      sections: [{
        title: 'E-Stop Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Press Emergency Stop', variant: 'danger', iconName: 'power', onClick: () => { this.emergencyStopLine(); this.refreshInspector(); } },
          { type: 'button', label: 'Reset / Release E-Stop', variant: 'subtle', iconName: 'reset', onClick: () => { this.resetEmergencyStop(); this.refreshInspector(); } },
          { type: 'button', label: 'Start Line', iconName: 'play', onClick: () => { this.startLine(); this.refreshInspector(); } },
        ],
      }],
      note: 'Pressing the E-stop immediately de-energises the drive and stops the belt with a fast deceleration ramp.',
    };
  }

  stackLightInspector(obj) {
    const st = this.stackLightState;
    return {
      title: obj.label || 'Line Stack Light',
      subtitle: 'THREE-COLOUR STATUS BEACON',
      iconName: 'light',
      badge: () => ({ text: st === 'green' ? 'RUNNING' : st === 'amber' ? 'ATTENTION' : 'FAULT', tone: st === 'green' ? 'ok' : st === 'amber' ? 'warn' : 'danger' }),
      fields: [
        { label: 'Line state', get: () => this.lineState },
        { label: 'Red lamp', get: () => (st === 'red' ? 'ON' : 'OFF') },
        { label: 'Amber lamp', get: () => (st === 'amber' ? 'ON' : 'OFF') },
        { label: 'Green lamp', get: () => (st === 'green' ? 'ON' : 'OFF') },
        { label: 'Alarm count', get: () => String(this.getActiveAlarms().length) },
      ],
      sections: [{
        title: 'Beacon Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Run Lamp Test', iconName: 'light', onClick: () => this.testTowerLight() },
          { type: 'button', label: 'Open Alarm Panel', iconName: 'alert', onClick: () => this.setTab('alarms') },
          { type: 'button', label: 'Open Line Inspector', iconName: 'conveyor', onClick: () => this.selectObject('conveyor.line') },
        ],
      }],
    };
  }

  lampInspector(obj) {
    return {
      title: obj.label || 'Floodlight',
      subtitle: 'INDUSTRIAL LED LUMINAIRE',
      iconName: 'light',
      badge: () => ({ text: this.lightingOn ? 'ENERGISED' : 'OFFLINE', tone: this.lightingOn ? 'ok' : 'warn' }),
      fields: [
        { label: 'Circuit', value: 'LED-03 · 230 V' },
        { label: 'Output', get: () => (this.lightingOn ? '100 %' : '0 %') },
        { label: 'Mounting height', value: '5.6 m' },
      ],
      sections: [{
        title: 'Lighting Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Line lighting energised', value: this.lightingOn, onChange: (v) => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
    };
  }

  guardInspector(obj) {
    return {
      title: 'Coupling Guard',
      subtitle: 'SAFETY GUARD · INTERLOCKED',
      iconName: 'shieldCheck',
      badge: () => ({ text: this.motor?.on ? 'INTERLOCKED' : 'SAFE', tone: this.motor?.on ? 'ok' : 'muted' }),
      fields: [
        { label: 'Guard state', value: 'CLOSED' },
        { label: 'Interlock', get: () => (this.motor?.on ? 'ARMED' : 'STANDBY') },
        { label: 'Drive status', get: () => this.lineState },
      ],
      sections: [{
        title: 'Guard Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Emergency Stop', variant: 'danger', iconName: 'power', onClick: () => { this.emergencyStopLine(); this.refreshInspector(); } },
          { type: 'button', label: 'Open Motor Inspector', iconName: 'motor', onClick: () => this.selectObject('drive.motor') },
        ],
      }],
    };
  }

  roomInspector(obj) {
    return {
      title: 'Line Control Room',
      subtitle: 'OPERATOR STATION · ACCESS CONTROL',
      iconName: 'shield',
      badge: () => ({ text: this.manualMode ? 'MANUAL' : 'AUTOMATED', tone: this.manualMode ? 'warn' : 'ok' }),
      fields: [
        { label: 'Operator', value: 'On duty · Shift A' },
        { label: 'Line state', get: () => this.lineState },
        { label: 'Ambient temperature', get: () => `${num(this._ambient, 1)} °C` },
        { label: 'Active alarms', get: () => String(this.getActiveAlarms().length) },
        { label: 'Cartons in transit', get: () => String(this.boxesOnBelt) },
      ],
      sections: [{
        title: 'Control Room', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Manual control mode', value: this.manualMode, onChange: (v) => { this.setManual(v); this.refreshInspector(); } },
          { type: 'button', label: 'Open Operator Console', iconName: 'sliders', onClick: () => this.selectObject('control-room.console') },
          { type: 'button', label: 'Open Line Cabinet', iconName: 'panel', onClick: () => this.selectObject('cabinet.main') },
        ],
      }],
    };
  }

  doorInspector(obj) {
    return {
      title: 'Control Room Door',
      subtitle: 'ACCESS DOOR · SAFETY GLASS',
      iconName: 'door',
      badge: { text: 'CLOSED', tone: 'ok' },
      fields: [
        { label: 'State', value: 'CLOSED' },
        { label: 'Access', value: 'Authorised operators' },
        { label: 'Glazing', value: 'Laminated safety glass' },
      ],
      sections: [{
        title: 'Door Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Open Control Room', iconName: 'door', onClick: () => this.selectObject('control-room') },
        ],
      }],
    };
  }

  hmiInspector(obj) {
    return {
      title: 'Operator Console',
      subtitle: 'SCADA WORKSTATION · LINE 03',
      iconName: 'sliders',
      badge: () => ({ text: this.lineState, tone: this.lineTone() }),
      fields: [
        { label: 'Line state', get: () => this.lineState },
        { label: 'Belt speed', get: () => `${num(this.belt?.speed, 2)} m/s` },
        { label: 'Bin A / B fill', get: () => `${ui.fmt(this.binPct('A'), 0)} % / ${ui.fmt(this.binPct('B'), 0)} %` },
        { label: 'Scans', get: () => String(this.scanCount) },
        { label: 'Active alarms', get: () => String(this.getActiveAlarms().length) },
      ],
      sections: [
        { title: 'HMI Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Automatic sorting', value: this.config.sorting.auto !== false, onChange: (v) => this.setSortingAuto(v) },
          { type: 'slider', label: 'Belt speed', min: 0.1, max: 2.5, step: 0.05, value: this.config.beltSpeed, unit: 'm/s', onInput: (v) => { this.config.beltSpeed = v; }, onChange: () => this.saveSoon() },
          { type: 'button', label: 'Start Line', variant: 'subtle', iconName: 'play', onClick: () => { this.startLine(); this.refreshInspector(); } },
          { type: 'button', label: 'Stop Line', iconName: 'stop', onClick: () => { this.stopLine(); this.refreshInspector(); } },
          { type: 'button', label: 'Box Spawning', iconName: 'package', onClick: () => this.setTab('spawn') },
        ] },
      ],
    };
  }

  panelInspector(obj) {
    if (obj.id === 'sort.airprep') {
      return {
        title: 'Pneumatic Air Preparation',
        subtitle: 'FRL UNIT · DIVERTER SUPPLY',
        iconName: 'wind',
        badge: { text: 'SUPPLY OK', tone: 'ok' },
        fields: [
          { label: 'Supply pressure', get: () => `${num(this.diverter?.pressure, 1)} bar` },
          { label: 'Filter', value: '5 µm · dry' },
          { label: 'Diverter cycles', get: () => String(this.diverter?.cycles || 0) },
        ],
        sections: [{
          title: 'Air Controls', iconName: 'sliders', controls: [
            { type: 'slider', label: 'Regulated pressure', min: 3, max: 8, step: 0.1, value: this.diverter?.pressure ?? 6.2, unit: 'bar', onInput: (v) => { if (this.diverter) this.diverter.pressure = v; }, onChange: () => this.refreshInspector() },
            { type: 'button', label: 'Open Diverter Inspector', iconName: 'conveyor', onClick: () => this.selectObject('diverter.arm') },
          ],
        }],
      };
    }
    return {
      title: 'Operator HMI Panel',
      subtitle: 'TOUCH PANEL · LINE CONTROL',
      iconName: 'sliders',
      badge: () => ({ text: this.lineState, tone: this.lineTone() }),
      fields: [
        { label: 'Line state', get: () => this.lineState },
        { label: 'Drive motor', get: () => (this.motor?.on ? 'ENERGISED' : 'OFF') },
        { label: 'Auto sort', get: () => (this.config.sorting.auto !== false ? 'ON' : 'OFF') },
        { label: 'Cartons in transit', get: () => String(this.boxesOnBelt) },
        { label: 'Bins A / B', get: () => `${this.binData.A?.count ?? 0} / ${this.binData.B?.count ?? 0}` },
      ],
      sections: [{
        title: 'HMI Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Start Line', variant: 'subtle', iconName: 'play', onClick: () => { this.startLine(); this.refreshInspector(); } },
          { type: 'button', label: 'Pause Line', iconName: 'pause', onClick: () => { this.pauseLine(); this.refreshInspector(); } },
          { type: 'button', label: 'Reset Jam', variant: 'warn', iconName: 'reset', onClick: () => { this.resetJam(); this.refreshInspector(); } },
          { type: 'button', label: 'Box Spawning', iconName: 'package', onClick: () => this.setTab('spawn') },
        ] },
      ],
    };
  }

  /* ==========================================================
     OPERATIONS PANEL
     ========================================================== */
  buildOperations(container) {
    const addSection = (title, iconName, ...children) => {
      const sec = el('div', { class: 'section' });
      const head = el('div', { class: 'section-title' });
      head.innerHTML = `${ui.icon(iconName, 12).outerHTML}<span>${title}</span>`;
      sec.appendChild(head);
      for (const c of children.flat(Infinity)) if (c) sec.appendChild(c);
      container.appendChild(sec);
      return sec;
    };
    const row = (...nodes) => {
      const r = el('div', { class: 'btn-row' });
      r.append(...nodes.filter(Boolean));
      return r;
    };
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ui.icon('info', 13).outerHTML}<span>All conveyor commands act on the live simulation engine. Belt, rollers, pulleys and fan animate only while running.</span>`;
    container.appendChild(note);

    /* ---- line control ---- */
    const stateWrap = el('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } });
    this.addPanelBind(() => {
      stateWrap.innerHTML = '';
      stateWrap.appendChild(ui.badge(this.lineState, this.lineTone()));
      stateWrap.appendChild(el('span', { class: 'help', style: { marginLeft: '8px' }, text: `${num(this.belt?.speed, 2)} m/s · ${this.config.direction > 0 ? 'FWD' : 'REV'} · motor ${this.motor?.on ? 'ON' : 'OFF'}` }));
    });
    addSection('Line Control', 'play',
      stateWrap,
      row(
        ui.button('Start', { size: 'small', variant: 'subtle', iconName: 'play', onClick: () => this.startLine() }),
        ui.button('Stop', { size: 'small', iconName: 'stop', onClick: () => this.stopLine() }),
        ui.button('Pause', { size: 'small', iconName: 'pause', onClick: () => this.pauseLine() }),
        ui.button('Resume', { size: 'small', iconName: 'play', onClick: () => this.resumeLine() }),
      ),
      row(
        ui.button('Emergency Stop', { size: 'small', variant: 'danger', iconName: 'power', onClick: () => this.emergencyStopLine() }),
        ui.button('Reset E-Stop', { size: 'small', iconName: 'reset', onClick: () => this.resetEmergencyStop() }),
        ui.button('Reset Jam', { size: 'small', variant: 'warn', iconName: 'reset', onClick: () => this.resetJam() }),
        ui.button('Inject Jam', { size: 'small', variant: 'ghost', iconName: 'warning', onClick: () => this.injectJam() }),
      ),
    );

    /* ---- belt dynamics ---- */
    addSection('Belt Dynamics', 'sliders',
      ui.slider({ label: 'Belt speed', min: 0.1, max: 2.5, step: 0.05, value: this.config.beltSpeed, unit: 'm/s', onInput: (v) => { this.config.beltSpeed = v; }, onChange: () => this.saveSoon() }),
      ui.slider({ label: 'Acceleration ramp', min: 0.05, max: 2.5, step: 0.05, value: this.config.acceleration, unit: 'm/s²', onInput: (v) => { this.config.acceleration = v; }, onChange: () => this.saveSoon() }),
      ui.slider({ label: 'Deceleration ramp', min: 0.05, max: 3, step: 0.05, value: this.config.deceleration, unit: 'm/s²', onInput: (v) => { this.config.deceleration = v; }, onChange: () => this.saveSoon() }),
      ui.segmentedControl('Transport direction', [{ value: 1, label: 'Forward' }, { value: -1, label: 'Reverse' }], this.config.direction, (v) => { this.setDirection(+v); this.renderPanel(); }),
      ui.toggle({ label: 'Motor energised', description: 'Main drive contactor.', value: !!this.motor?.on, onChange: (v) => { this.setMotor(v); this.renderPanel(); } }),
      el('div', { class: 'help', style: { marginTop: '6px' }, text: 'The belt ramps to the target speed using the configured acceleration and deceleration. Reverse direction transports cartons back toward the infeed.' }),
    );

    /* ---- sorting & diverter ---- */
    addSection('Sorting & Diverter', 'conveyor',
      ui.segmentedControl('Sorting strategy', [
        { value: 'size', label: 'Size' }, { value: 'color', label: 'Colour' },
        { value: 'classification', label: 'Class' }, { value: 'priority', label: 'Priority' },
      ], this.config.sorting.strategy, (v) => { this.setSortingStrategy(v); this.renderPanel(); }),
      ui.toggle({ label: 'Automatic sorting', description: 'Diverter follows the active sort recipe.', value: this.config.sorting.auto !== false, onChange: (v) => { this.setSortingAuto(v); this.renderPanel(); } }),
      ui.slider({ label: 'Sorting success rate', min: 0, max: 100, step: 1, value: this.config.sorting.successRate, unit: '%', onInput: (v) => { this.config.sorting.successRate = v; }, onChange: () => this.saveSoon() }),
      ui.segmentedControl('Diverter manual position', [{ value: 0, label: 'Straight · Bin B' }, { value: 1, label: 'Divert · Bin A' }], this.config.diverter.position, (v) => { this.setDiverterPosition(+v); this.renderPanel(); }),
      ui.button('Open Diverter Inspector', { size: 'small', iconName: 'conveyor', onClick: () => this.selectObject('diverter.arm') }),
      el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Rules are evaluated at the barcode scan tunnel for every carton. Changes apply immediately to cartons already on the belt.' }),
    );

    /* ---- live rule matrix ---- */
    const ruleSec = addSection('Live Sort Rules', 'filter');
    const ruleGrid = el('div');
    const ruleRow = (group, key, label, current) => {
      const f = ui.selectField({
        label,
        options: [{ value: 'A', label: 'Bin A' }, { value: 'B', label: 'Bin B' }],
        value: current,
        onChange: (v) => { this.setRule(group, key, v); },
      });
      return f;
    };
    ruleGrid.append(
      ruleRow('size', 'small', 'Small cartons →', this.config.rules.size.small),
      ruleRow('size', 'medium', 'Medium cartons →', this.config.rules.size.medium),
      ruleRow('size', 'large', 'Large cartons →', this.config.rules.size.large),
      ruleRow('color', 'red', 'Red cartons →', this.config.rules.color.red),
      ruleRow('color', 'blue', 'Blue cartons →', this.config.rules.color.blue),
      ruleRow('color', 'kraft', 'Kraft cartons →', this.config.rules.color.kraft),
      ruleRow('color', 'white', 'White cartons →', this.config.rules.color.white),
      ruleRow('color', 'amber', 'Amber cartons →', this.config.rules.color.amber),
      ruleRow('classification', 'fragile', 'Fragile cartons →', this.config.rules.classification.fragile),
      ruleRow('classification', 'standard', 'Standard cartons →', this.config.rules.classification.standard),
      ruleRow('classification', 'express', 'Express cartons →', this.config.rules.classification.express),
      ruleRow('classification', 'bulk', 'Bulk cartons →', this.config.rules.classification.bulk),
    );
    ruleSec.appendChild(ruleGrid);
    ruleSec.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Only the rules for the active strategy are used for each new scan.' }));

    /* ---- carton handling ---- */
    addSection('Carton Handling', 'package',
      row(
        ui.button('Induct Carton', { size: 'small', variant: 'subtle', iconName: 'plus', onClick: () => { const b = this.spawnBox({}); if (b) ui.toast(`${b.serial} inducted.`, { type: 'ok' }); } }),
        ui.button('Induct 3', { size: 'small', iconName: 'plus', onClick: () => this.spawnBatch(3) }),
        ui.button('Induct 5', { size: 'small', iconName: 'plus', onClick: () => this.spawnBatch(5) }),
      ),
      row(
        ui.button('Clear Conveyor', { size: 'small', variant: 'danger', iconName: 'trash', onClick: async () => {
          const ok = await ui.confirmDialog({ title: 'Clear the conveyor?', message: 'Every carton on the belt and in the bins will be removed.', confirmLabel: 'Clear Conveyor', danger: true });
          if (ok) this.clearBoxes(true);
        } }),
        ui.button('Box Spawning Manager', { size: 'small', iconName: 'package', onClick: () => this.setTab('spawn') }),
      ),
      el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Cartons are tracked individually: colour, size, weight, classification, destination and position along the U-loop.' }),
    );

    /* ---- motor & thermal ---- */
    addSection('Motor & Thermal', 'motor',
      ui.toggle({ label: 'Motor energised', value: !!this.motor?.on, onChange: (v) => { this.setMotor(v); this.renderPanel(); } }),
      ui.toggle({ label: 'Cooling fan enabled', description: 'Forced-air cooling of the drive motor.', value: this.config.coolingFan !== false, onChange: (v) => { this.setCoolingFan(v); this.renderPanel(); } }),
      ui.slider({ label: 'Motor overheat trip limit', min: 40, max: 120, step: 1, value: this.threshold('motorOverheatTemp', 78), unit: '°C', onInput: (v) => this.setThreshold('motorOverheatTemp', v), onChange: () => this.saveSoon() }),
      row(
        ui.button('Reset Thermal Trip', { size: 'small', variant: 'warn', iconName: 'reset', onClick: () => this.resetMotorTrip() }),
        ui.button('Simulate Overload', { size: 'small', variant: 'danger', iconName: 'warning', onClick: () => {
          this.motor.temp = this.threshold('motorOverheatTemp', 78) + 2;
          this.thermalTrip('overheat (commissioning test)');
        } }),
      ),
      el('div', { class: 'kv-list' },
        ui.kvRow('Winding temperature', '—', { bind: () => `${num(this.motor?.temp, 1)} °C` }),
        ui.kvRow('Stator current', '—', { bind: () => `${num(this.motor?.current, 2)} A` }),
        ui.kvRow('Thermal trips', '0', { bind: () => String(this.thermalTrips) }),
        ui.kvRow('Fan status', '—', { bind: () => (this.config.coolingFan ? 'RUNNING' : 'DISABLED') }),
      ),
    );

    /* ---- diagnostics ---- */
    addSection('Diagnostics & Fault Injection', 'warning',
      ui.toggle({ label: 'Entry sensor failure', description: 'Disables the infeed photo-eye channel.', value: !!this.faults.entrySensor, onChange: (v) => { this.toggleEntrySensorFault(v); this.renderPanel(); } }),
      ui.toggle({ label: 'Barcode scanner failure', description: 'Cartons keep their default route without scanning.', value: !!this.faults.scanner, onChange: (v) => { this.toggleScannerFault(v); this.renderPanel(); } }),
      row(
        ui.button('Inject Jam', { size: 'small', variant: 'warn', iconName: 'warning', onClick: () => this.injectJam() }),
        ui.button('Fill Bin A', { size: 'small', variant: 'ghost', iconName: 'inventory', onClick: () => this.fillBinToCapacity('A') }),
        ui.button('Fill Bin B', { size: 'small', variant: 'ghost', iconName: 'inventory', onClick: () => this.fillBinToCapacity('B') }),
      ),
      row(
        ui.button('Restore Diagnostic State', { size: 'small', iconName: 'reset', onClick: () => { this.restoreDiagnostics(); this.renderPanel(); } }),
        ui.button('Tamper Sorting (low success)', { size: 'small', variant: 'ghost', iconName: 'sliders', onClick: () => { this.setSuccessRate(40); ui.toast('Sorting success rate set to 40 % for failure testing.', { type: 'warn' }); this.renderPanel(); } }),
      ),
    );

    /* ---- counters ---- */
    addSection('Counters & Throughput', 'activity',
      el('div', { class: 'kv-list' },
        ui.kvRow('Barcodes scanned', '0', { bind: () => String(this.scanCount) }),
        ui.kvRow('Sorted to Bin A', '0', { bind: () => String(this.sortedA) }),
        ui.kvRow('Sorted to Bin B', '0', { bind: () => String(this.sortedB) }),
        ui.kvRow('Sort failures', '0', { bind: () => `${this.sortFailures} (${num(this.sortFailureRate, 1)} %)` }),
        ui.kvRow('Jam events', '0', { bind: () => String(this.jamEvents) }),
        ui.kvRow('Throughput', '0', { bind: () => `${num(this.sortRatePerMin(), 1)} ctn/min` }),
      ),
      ui.button('Reset Counters', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => this.resetCounters() }),
    );
  }

  /* ==========================================================
     BOX SPAWNING PANEL
     ========================================================== */
  buildSpawning(container) {
    const s = this.config.spawn;
    const addSection = (title, iconName, ...children) => {
      const sec = el('div', { class: 'section' });
      const head = el('div', { class: 'section-title' });
      head.innerHTML = `${ui.icon(iconName, 12).outerHTML}<span>${title}</span>`;
      sec.appendChild(head);
      for (const c of children.flat(Infinity)) if (c) sec.appendChild(c);
      container.appendChild(sec);
      return sec;
    };
    const row = (...nodes) => { const r = el('div', { class: 'btn-row' }); r.append(...nodes.filter(Boolean)); return r; };
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ui.icon('package', 13).outerHTML}<span>Configure carton induction, profiles and sorting recipes. Automatic spawning obeys the global manual mode and the maximum in-transit limit.</span>`;
    container.appendChild(note);

    /* ---- spawn manager ---- */
    addSection('Spawn Manager', 'package',
      ui.toggle({ label: 'Automatic carton induct', description: 'Generate cartons at the configured interval.', value: s.auto !== false, onChange: (v) => { s.auto = v; this.saveSoon(); } }),
      ui.toggle({ label: 'Manual mode (suspend automation)', value: this.manualMode, onChange: (v) => { this.setManual(v); this.renderPanel(); } }),
      ui.slider({ label: 'Induction interval', min: 2, max: 60, step: 1, value: s.interval, unit: 's', onInput: (v) => { s.interval = v; }, onChange: () => this.saveSoon() }),
      ui.segmentedControl('Scheduling mode', [{ value: 'random', label: 'Random' }, { value: 'fixed', label: 'Fixed' }], s.mode, (v) => { s.mode = v; this.saveSoon(); this.renderPanel(); }),
      ui.slider({ label: 'Maximum cartons in transit', min: 1, max: 30, step: 1, value: s.maxItems, unit: 'cartons', onInput: (v) => { s.maxItems = v; }, onChange: () => this.saveSoon() }),
      ui.numberField({ label: 'Batch quantity', min: 1, max: 20, step: 1, value: s.quantity, onChange: (v) => { s.quantity = v; this.saveSoon(); } }),
    );

    /* ---- carton profile ---- */
    addSection('Carton Profile', 'settings',
      ui.selectField({ label: 'Size class', options: [{ value: 'random', label: 'Random size' }, ...SIZE_KEYS.map((k) => ({ value: k, label: BOX_PROFILES[k].label }))], value: s.size, onChange: (v) => { s.size = v; this.saveSoon(); } }),
      ui.selectField({ label: 'Carton colour', options: [{ value: 'random', label: 'Random colour' }, ...BOX_COLORS.map((c) => ({ value: c.key, label: c.label }))], value: s.color, onChange: (v) => { s.color = v; this.saveSoon(); } }),
      ui.selectField({ label: 'Classification', options: [{ value: 'random', label: 'Random class' }, ...CLASSIFICATIONS.map((c) => ({ value: c.key, label: c.label }))], value: s.classification, onChange: (v) => { s.classification = v; this.saveSoon(); } }),
      ui.selectField({ label: 'Weight mode', options: [{ value: 'random', label: 'Random weight (by size)' }, { value: 'fixed', label: 'Fixed weight' }], value: s.weight === 'random' ? 'random' : 'fixed', onChange: (v) => { s.weight = v === 'random' ? 'random' : 8; this.saveSoon(); this.renderPanel(); } }),
      (s.weight !== 'random' ? ui.numberField({ label: 'Fixed carton weight', unit: 'kg', min: 1, max: 30, step: 0.5, value: +s.weight || 8, onChange: (v) => { s.weight = v; this.saveSoon(); } }) : null),
      ui.selectField({ label: 'Manual destination override', options: [{ value: 'auto', label: 'Use sorting rules' }, { value: 'A', label: 'Force Bin A' }, { value: 'B', label: 'Force Bin B' }], value: s.destination || 'auto', onChange: (v) => { s.destination = v; this.saveSoon(); } }),
    );

    /* ---- spawn actions ---- */
    addSection('Spawn Actions', 'plus',
      row(
        ui.button('Spawn Now', { size: 'small', variant: 'subtle', iconName: 'plus', onClick: () => this.scheduleCarton(0) }),
        ui.button('Spawn Batch', { size: 'small', iconName: 'plus', onClick: () => this.spawnBatch(s.quantity || 1) }),
        ui.button('Spawn 10', { size: 'small', iconName: 'plus', onClick: () => this.spawnBatch(10) }),
      ),
      row(
        ui.button('Schedule +15 s', { size: 'small', iconName: 'clock', onClick: () => this.scheduleCarton(15) }),
        ui.button('Schedule +30 s', { size: 'small', iconName: 'clock', onClick: () => this.scheduleCarton(30) }),
        ui.button('Remove Selected Carton', { size: 'small', variant: 'ghost', iconName: 'trash', onClick: () => this.removeSelectedBox() }),
      ),
      el('div', { class: 'help', style: { marginTop: '6px', text: '' }, bind: null }),
      (() => {
        const q = el('div', { class: 'help', style: { marginTop: '6px' } });
        this.addPanelBind(() => { q.textContent = `${this.boxesOnBelt} cartons in transit · ${this.pendingBoxes.length} scheduled · ${this.boxesInBins} in bins`; });
        return q;
      })(),
    );

    /* ---- live sort rules ---- */
    const ruleSec = addSection('Sorting Rules (live)', 'filter');
    ruleSec.appendChild(ui.segmentedControl('Strategy', [
      { value: 'size', label: 'Size' }, { value: 'color', label: 'Colour' },
      { value: 'classification', label: 'Class' }, { value: 'priority', label: 'Priority' },
    ], this.config.sorting.strategy, (v) => { this.setSortingStrategy(v); this.renderPanel(); }));
    const ruleRow = (group, key, label) => ui.selectField({
      label,
      options: [{ value: 'A', label: 'Bin A' }, { value: 'B', label: 'Bin B' }],
      value: this.config.rules[group][key],
      onChange: (v) => this.setRule(group, key, v),
    });
    for (const k of SIZE_KEYS) ruleSec.appendChild(ruleRow('size', k, `${BOX_PROFILES[k].label} →`));
    for (const c of BOX_COLORS) ruleSec.appendChild(ruleRow('color', c.key, `${c.label} →`));
    for (const c of CLASSIFICATIONS) ruleSec.appendChild(ruleRow('classification', c.key, `${c.label} →`));
    ruleSec.appendChild(ui.slider({ label: 'Sorting success rate', min: 0, max: 100, step: 1, value: this.config.sorting.successRate, unit: '%', onInput: (v) => { this.config.sorting.successRate = v; }, onChange: () => this.saveSoon() }));

    /* ---- capacities & bins ---- */
    addSection('Bin Capacity & Clearing', 'inventory',
      ui.numberField({ label: 'Bin A capacity', unit: 'cartons', min: 1, max: 60, step: 1, value: this.config.bins.capacityA, onChange: (v) => this.setBinCapacity('A', v) }),
      ui.numberField({ label: 'Bin B capacity', unit: 'cartons', min: 1, max: 60, step: 1, value: this.config.bins.capacityB, onChange: (v) => this.setBinCapacity('B', v) }),
      ui.slider({ label: 'Bin full warning threshold', min: 50, max: 100, step: 1, value: this.threshold('binFullPercent', 92), unit: '%', onInput: (v) => this.setThreshold('binFullPercent', v), onChange: () => this.saveSoon() }),
      row(
        ui.button('Clear Bin A', { size: 'small', variant: 'warn', iconName: 'trash', onClick: () => this.clearBin('A') }),
        ui.button('Clear Bin B', { size: 'small', variant: 'warn', iconName: 'trash', onClick: () => this.clearBin('B') }),
        ui.button('Clear Conveyor', { size: 'small', variant: 'danger', iconName: 'trash', onClick: async () => {
          const ok = await ui.confirmDialog({ title: 'Clear the conveyor?', message: 'All cartons on the belt and in the bins will be removed.', confirmLabel: 'Clear', danger: true });
          if (ok) this.clearBoxes(true);
        } }),
      ),
      el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Bins detect full inventory. When both bins are full, cartons can no longer discharge and the line jams.' }),
    );
  }

  destroy() {
    try { clearTimeout(this._infeedTimer); } catch { /* ignore */ }
    super.destroy();
  }

  /* =========================================================
     Detailed Operational Scenarios
     ========================================================= */
  registerDetailedScenarios() {
    /* ---- Conveyor Belt Sorting Scenario ---- */
    this.registerScenario({
      id: 'conveyor-sorting',
      name: 'Conveyor Sorting Line Production Run',
      description: 'Complete automated sorting operation from startup to production completion',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-conveyor',
          title: 'Initialize Conveyor System',
          description: 'Verify conveyor stopped, no boxes on line, motor ready',
          objective: 'Confirm line stopped, belt at 0 m/min, no jams, bins empty',
          checkComplete: (infra) => !infra.running && infra.boxesOnBelt === 0,
          autoAdvanceDelay: 4000,
          camera: { position: [-14, 8, -4], target: [-14, 1, -4] },
          narration: 'Starting conveyor sorting line. System idle, conveyor stopped, bins empty.',
        },
        {
          id: 'start-motor',
          title: 'Start Drive Motor',
          description: 'Energize the line drive motor and verify rotation',
          objective: 'Start motor, confirm fan spinning, belt at 0 m/min',
          onEnter: (infra) => { infra.setRunning?.(true); },
          checkComplete: (infra) => infra.running && !infra.jammed,
          autoAdvanceDelay: 3000,
          camera: { position: [-14, 5, -4], target: [-14, 1, -4] },
          narration: 'Starting drive motor. Motor fan spinning up. Belt beginning to move.',
        },
        {
          id: 'set-speed',
          title: 'Set Belt Speed',
          description: 'Ramp conveyor to target production speed',
          objective: 'Increase speed to 1.8 m/s, verify rollers synchronized',
          onEnter: (infra) => { infra.setSpeed?.(1.8); },
          checkComplete: (infra) => infra.currentSpeed >= 1.7,
          autoAdvanceDelay: 4000,
          narration: 'Ramping belt speed to 1.8 meters per second. Rollers synchronized.',
        },
        {
          id: 'start-spawning',
          title: 'Begin Box Spawning',
          description: 'Activate automatic box spawning at infeed',
          objective: 'Observe first boxes entering conveyor, sensor detection at infeed',
          checkComplete: (infra) => infra.boxesOnBelt > 0,
          autoAdvanceDelay: 5000,
          camera: { position: [-14, 5, -4], target: [-14, 1, -4] },
          narration: 'Auto-spawning activated. First cartons entering the conveyor at infeed sensor.',
        },
        {
          id: 'sorting-operation',
          title: 'Sorting Operation',
          description: 'Watch boxes travel, get scanned, and diverted to correct bins',
          objective: 'Observe scanner reading, diverter gate operation, boxes routed to bins',
          checkComplete: (infra) => infra.boxesInBins > 10,
          autoAdvanceDelay: 20000,
          camera: { position: [0, 8, 4], target: [0, 1, 4] },
          narration: 'Cartons moving along belt. Scanner reading classifications. Diverter routing to Bin A and B.',
        },
        {
          id: 'counter-updates',
          title: 'Counter Updates',
          description: 'Verify production and bin counters incrementing',
          objective: 'Confirm infeed count, Bin A count, Bin B count',
          checkComplete: (infra) => (infra.stats?.infeed || 0) > 25,
          autoAdvanceDelay: 5000,
          narration: 'Counters updating in real-time. 30 cartons infeed, 15 in Bin A, 15 in Bin B.',
        },
        {
          id: 'jam-simulation',
          title: 'Conveyor Jam Event',
          description: 'Simulate a carton obstruction at the sort station',
          objective: 'Observe jam detection, line stop, tower light red, alarm generation',
          onEnter: (infra) => { infra.injectJam?.(); },
          checkComplete: (infra) => infra.jammed,
          autoAdvanceDelay: 3000,
          camera: { position: [0, 5, 4], target: [0, 1, 4] },
          narration: 'ALARM: Carton jam at sort station! Line stopped automatically. Tower light red.',
        },
        {
          id: 'clear-jam',
          title: 'Clear Jam & Restart',
          description: 'Operator clears obstruction and restarts production',
          objective: 'Clear jam, verify line restarts, production resumes',
          onEnter: (infra) => { infra.clearJam?.(); infra.setRunning?.(true); },
          checkComplete: (infra) => !infra.jammed && infra.running,
          autoAdvanceDelay: 5000,
          narration: 'Jam cleared. Restarting line. Production resuming at 1.8 m/s.',
        },
        {
          id: 'complete-production',
          title: 'Complete Production Run',
          description: 'Finish production target and generate report',
          objective: 'Reach production target, verify all counters, stop line',
          checkComplete: (infra) => (infra.stats?.infeed || 0) >= 100,
          autoAdvanceDelay: 15000,
          narration: 'Production target reached. 100 cartons processed and sorted. Stopping line.',
        },
        {
          id: 'conveyor-report',
          title: 'Production Report',
          description: 'Generate conveyor sorting production summary',
          objective: 'Review throughput, jam events, sort accuracy, motor runtime',
          checkComplete: () => true,
          autoAdvanceDelay: 4000,
          narration: 'Production run complete. Zero jam recovery time. 98% sort accuracy. Report ready.',
        },
      ],
    });

    /* ---- Peak Production Scenario ---- */
    this.registerScenario({
      id: 'conveyor-peak-production',
      name: 'Peak Production High-Speed Run',
      description: 'Run conveyor at maximum speed with maximum sorting complexity',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-peak',
          title: 'Initialize Peak Production',
          description: 'System at nominal speed, ready for high-speed test',
          objective: 'Verify line running at 1.8 m/s, bins at 50% capacity',
          checkComplete: (infra) => infra.running && infra.currentSpeed >= 1.7,
          autoAdvanceDelay: 3000,
        },
        {
          id: 'max-speed',
          title: 'Maximum Speed',
          description: 'Ramp to maximum belt speed of 2.5 m/s',
          objective: 'Increase speed to 2.5 m/s, observe motor load, roller sync',
          onEnter: (infra) => { infra.setSpeed?.(2.5); },
          checkComplete: (infra) => infra.currentSpeed >= 2.4,
          autoAdvanceDelay: 5000,
        },
        {
          id: 'high-volume',
          title: 'High Volume Sorting',
          description: 'Spawn maximum carton rate, observe sorting performance',
          objective: 'Spawn batch of 20, observe diverter at high speed, bin fill rate',
          onEnter: (infra) => { infra.spawnBatch?.(20); },
          checkComplete: (infra) => infra.boxesOnBelt >= 15,
          autoAdvanceDelay: 15000,
        },
        {
          id: 'bin-management',
          title: 'Bin Capacity Management',
          description: 'Monitor bins approaching capacity, clear when needed',
          objective: 'Watch bin fill % approach 90%, clear bins to prevent jam',
          checkComplete: (infra) => infra.boxesInBins >= 50,
          autoAdvanceDelay: 20000,
        },
        {
          id: 'sustained-run',
          title: 'Sustained High-Speed Run',
          description: 'Maintain peak production for extended period',
          objective: 'Monitor motor temperature, belt tracking, zero defects',
          checkComplete: (infra) => (infra.stats?.infeed || 0) >= 200,
          autoAdvanceDelay: 30000,
        },
      ],
    });
  }

  // First-person interaction handlers for conveyor
  _toggleDoor(obj) {
    if (obj.id?.includes('control-room') || obj.id?.includes('door')) {
      this.selectObject(obj.id);
    }
  }

  _controlConveyor(obj) {
    this.setRunning?.(!this.running);
  }

  _operateMotor(obj) {
    this.setRunning?.(!this.running);
  }

  _operatePump(obj) {
    // Not applicable for conveyor
    this.selectObject(obj.id);
  }

  _inspectTank(obj) {
    this.selectObject(obj.id);
  }

  _openPanel(obj) {
    this.selectObject(obj.id);
  }

  _openCabinet(obj) {
    this.selectObject(obj.id);
  }

  _toggleSwitch(obj) {
    this.selectObject(obj.id);
  }

  _pressButton(obj) {
    // Emergency stop button
    if (obj.id?.includes('estop') || obj.id?.includes('emergency')) {
      this.setRunning?.(false);
      this.injectJam?.(); // Simulate emergency stop
      this.logEvent('Emergency stop', 'E-stop pressed - line halted', 'danger');
    }
  }

  _operateLever(obj) {
    this.selectObject(obj.id);
  }
}
