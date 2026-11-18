/* ============================================================
   COLD STORAGE ROOM — multi-zone thermal refrigeration digital twin
   Insulated walk-in freezer hall, 4 thermal zones, refrigeration
   plant, live heat map, door interlock and inventory cold-chain rules.
   ============================================================ */
import * as THREE from 'three';
import { BaseInfrastructure } from '../core/base.js';
import {
  group, box, cylinder, plane, material, emissive, roundedBox, makeControlCabinet,
  makeTowerLight, makeValve, makePallet, textSprite, canvasTexture, pipe, cylinderBetween,
  signBoard, mergeStaticGroup, shadowify, sphere, glass,
} from '../core/scene.js';
import * as ui from '../core/ui.js';

const { el } = ui;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const meta = {
  id: 'cold',
  code: 'CLD-04',
  name: 'Cold Storage Room',
  description: 'Multi-zone refrigerated cold store with insulated panels, walk-in freezer door, condensing plant, evaporator circulation, live heat map and cold-chain inventory rules.',
  icon: 'cold',
  sceneBackground: 0x040a12,
  fogDensity: 0.0040,
  fitPadding: 1.1,
};

/* ---------------- Facility envelope ---------------- */
const ROOM = { x0: -7.2, x1: 7.2, z0: -5.2, z1: 5.2, h: 4.2, wall: 0.34 };
const EXT = {
  x0: ROOM.x0 - ROOM.wall, x1: ROOM.x1 + ROOM.wall,
  z0: ROOM.z0 - ROOM.wall, z1: ROOM.z1 + ROOM.wall,
};
const DOOR = { x0: 1.15, x1: 3.15, w: 2.0, h: 2.85, hingeX: 1.15, pivotZ: 5.4 };

/* ---------------- Thermal zones ---------------- */
const ZONES = [
  { id: 'A', name: 'Freezer Zone A', short: 'ZONE A', x0: ROOM.x0, x1: 0, z0: ROOM.z0, z1: 0, coupling: 1.08, gain: 0.86, temp: -18.9, doorGain: 0.010, color: 0x2f8bff },
  { id: 'B', name: 'Freezer Zone B', short: 'ZONE B', x0: 0, x1: ROOM.x1, z0: ROOM.z0, z1: 0, coupling: 1.0, gain: 0.92, temp: -18.25, doorGain: 0.012, color: 0x2ee6d0 },
  { id: 'C', name: 'Chill Zone C', short: 'ZONE C', x0: ROOM.x0, x1: 0, z0: 0, z1: ROOM.z1, coupling: 0.82, gain: 1.14, temp: -16.4, doorGain: 0.021, color: 0xffb547 },
  { id: 'D', name: 'Medical Zone D', short: 'ZONE D', x0: 0, x1: ROOM.x1, z0: 0, z1: ROOM.z1, coupling: 0.9, gain: 1.05, temp: -17.3, doorGain: 0.017, color: 0xff6172 },
];

/* ---------------- Cold-chain inventory catalogue ---------------- */
const ITEM_CATEGORIES = {
  frozen: { label: 'Frozen Goods', color: 0x4d9fc4, accent: '#7fdcff', required: -18, icon: 'snowflake' },
  food: { label: 'Food', color: 0xc79a4e, accent: '#f0c060', required: -16, icon: 'package' },
  medicine: { label: 'Medicines', color: 0x8f79d6, accent: '#c7b3ff', required: -18, icon: 'inventory' },
  medical: { label: 'Medical Supplies', color: 0x54b78d, accent: '#8ff0c4', required: -16.5, icon: 'shieldCheck' },
};
const ITEM_CATEGORY_OPTIONS = Object.entries(ITEM_CATEGORIES).map(([value, c]) => ({ value, label: c.label }));

const INITIAL_INVENTORY = [
  { id: 'SKU-101', name: 'Frozen Beef Cuts', category: 'frozen', qty: 120, zone: 'A', requiredTemp: -18, expiration: '2027-04-12' },
  { id: 'SKU-102', name: 'Ice Cream Pallets', category: 'frozen', qty: 64, zone: 'A', requiredTemp: -18, expiration: '2027-06-01' },
  { id: 'SKU-103', name: 'Frozen Vegetables', category: 'frozen', qty: 200, zone: 'A', requiredTemp: -18, expiration: '2027-02-20' },
  { id: 'SKU-104', name: 'Atlantic Salmon Fillets', category: 'frozen', qty: 90, zone: 'B', requiredTemp: -18, expiration: '2027-03-15' },
  { id: 'SKU-105', name: 'Frozen Poultry Crates', category: 'frozen', qty: 150, zone: 'B', requiredTemp: -18, expiration: '2027-05-05' },
  { id: 'SKU-106', name: 'Influenza Vaccine Vials', category: 'medicine', qty: 480, zone: 'B', requiredTemp: -18, expiration: '2026-12-20' },
  { id: 'SKU-107', name: 'Plasma Sample Racks', category: 'medical', qty: 96, zone: 'B', requiredTemp: -17, expiration: '2026-11-26' },
  { id: 'SKU-108', name: 'Insulin Cartridges', category: 'medicine', qty: 320, zone: 'D', requiredTemp: -18, expiration: '2027-01-10' },
  { id: 'SKU-109', name: 'Antibiotic Vials', category: 'medicine', qty: 240, zone: 'D', requiredTemp: -18, expiration: '2026-12-02' },
  { id: 'SKU-110', name: 'Sterile Gauze Packs', category: 'medical', qty: 500, zone: 'D', requiredTemp: -16.5, expiration: '2028-03-01' },
  { id: 'SKU-111', name: 'IV Fluid Bags', category: 'medical', qty: 180, zone: 'D', requiredTemp: -16.5, expiration: '2027-09-14' },
  { id: 'SKU-112', name: 'Fresh Produce Crates', category: 'food', qty: 75, zone: 'C', requiredTemp: -16, expiration: '2026-11-25' },
  { id: 'SKU-113', name: 'Dairy Butter Blocks', category: 'food', qty: 140, zone: 'C', requiredTemp: -16, expiration: '2027-01-18' },
  { id: 'SKU-114', name: 'Frozen Seafood Mix', category: 'frozen', qty: 60, zone: 'C', requiredTemp: -18, expiration: '2027-01-05' },
];

/* ---------------- Storage racks ---------------- */
const RACKS = [
  { id: 'a', zone: 'A', label: 'Rack A', name: 'Frozen Store A', x: -4.4, z: -4.5, yaw: 0, width: 3.6, depth: 0.62, levels: [0.55, 1.15, 1.75, 2.35], slots: 3 },
  { id: 'b', zone: 'B', label: 'Rack B', name: 'Frozen Store B', x: 4.5, z: -4.5, yaw: 0, width: 3.4, depth: 0.62, levels: [0.55, 1.15, 1.75, 2.35], slots: 3 },
  { id: 'c', zone: 'C', label: 'Rack C', name: 'Chill Store C', x: -6.55, z: 1.9, yaw: Math.PI / 2, width: 3.2, depth: 0.6, levels: [0.55, 1.15, 1.75, 2.35], slots: 3 },
  { id: 'd', zone: 'D', label: 'Rack D', name: 'Medical Store D', x: 6.55, z: 1.7, yaw: -Math.PI / 2, width: 3.0, depth: 0.6, levels: [0.5, 1.1, 1.7, 2.3], slots: 3 },
];

const BASE_DATE = new Date(2026, 10, 16);
const HEAT_STOPS = [
  { t: -32, c: new THREE.Color(0x2646c8) },
  { t: -24, c: new THREE.Color(0x2f7bff) },
  { t: -18, c: new THREE.Color(0x2ee6d0) },
  { t: -14, c: new THREE.Color(0xffb547) },
  { t: -9, c: new THREE.Color(0xff4a5f) },
];

function tempColor(t, target = new THREE.Color()) {
  if (t <= HEAT_STOPS[0].t) return target.copy(HEAT_STOPS[0].c);
  const last = HEAT_STOPS[HEAT_STOPS.length - 1];
  if (t >= last.t) return target.copy(last.c);
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    const a = HEAT_STOPS[i - 1], b = HEAT_STOPS[i];
    if (t <= b.t) return target.copy(a.c).lerp(b.c, (t - a.t) / (b.t - a.t));
  }
  return target.copy(last.c);
}

function dayKey(offsetDays = 0) {
  const d = new Date(BASE_DATE.getTime() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function makeScreenTexture(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  return {
    canvas, ctx, tex,
    update(draw) { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); tex.needsUpdate = true; },
  };
}

/* ============================================================
   Walk-in freezer door — hinged insulated panel with animation
   ============================================================ */
class WalkInDoor {
  constructor(infra) {
    this.infra = infra;
    this.root = group('walk-in-door');
    this.root.position.set(DOOR.hingeX, 0, DOOR.pivotZ);
    this.angle = 0;
    this.target = 0;
    this.openAngle = 1.94;
    this.openElapsed = 0;
    this.lastOpenDuration = 0;
    this.cycles = 0;
    this.manualHold = false;
    this.build();
  }

  get openFraction() { return clamp(this.angle / this.openAngle, 0, 1); }
  get isOpen() { return this.angle > 0.06; }

  get state() {
    if (this.angle < 0.03) return 'CLOSED';
    if (this.target > this.angle + 0.02) return 'OPENING';
    if (this.target < this.angle - 0.02) return 'CLOSING';
    return this.angle > this.openAngle - 0.1 ? 'OPEN' : 'CLOSED';
  }

  build() {
    const cfg = this.infra.config.door;
    // exterior frame (static)
    const frameM = material(0x8a9ba6, { metalness: .72, roughness: .3 });
    const gasketM = material(0x1b242b, { roughness: .85, metalness: .05 });
    const panelSkin = material(0xc3ced6, { metalness: .35, roughness: .48 });
    const panelInner = material(0x9fb2bd, { metalness: .3, roughness: .55 });
    const steel = material(0x6f7e89, { metalness: .7, roughness: .35 });

    for (const [x, z] of [[0, 0], [DOOR.w, 0]]) {
      this.root.add(box(.16, DOOR.h + .2, .34, frameM, { pos: [x, (DOOR.h + .2) / 2, z] }));
    }
    this.root.add(box(DOOR.w + .32, .18, .36, frameM, { pos: [DOOR.w / 2, DOOR.h + .11, 0] }));
    this.root.add(box(DOOR.w + .34, .09, .5, gasketM, { pos: [DOOR.w / 2, .045, 0] }));
    // approach ramp / threshold
    this.root.add(box(DOOR.w + .5, .1, .8, material(0x50595f, { roughness: .9 }), { pos: [DOOR.w / 2, .05, .52] }));
    const hazard = new THREE.MeshBasicMaterial({ color: 0xd8b23f, transparent: true, opacity: .7 });
    for (let i = 0; i < 5; i++) this.root.add(box(.16, .012, .34, hazard, { pos: [DOOR.w / 2 - .7 + i * .35, .105, .62], cast: false, receive: false }));
    // frame latch / lock indicator
    this.root.add(box(.1, .26, .08, steel, { pos: [DOOR.w + .03, 1.18, .12] }));
    this.lockLed = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3ce58b, emissive: 0x3ce58b, emissiveIntensity: 1.8 }));
    this.lockLed.position.set(DOOR.w + .08, 1.18, .18);
    this.root.add(this.lockLed);
    // frame heater strip
    this.root.add(box(DOOR.w + .3, .03, .05, new THREE.MeshStandardMaterial({ color: 0xffb46a, emissive: 0xff9438, emissiveIntensity: 1.1 }), { pos: [DOOR.w / 2, DOOR.h - .02, .17], cast: false }));

    // hinged leaf
    this.pivot = group('door-leaf');
    this.pivot.position.set(0, 0, 0);
    this.root.add(this.pivot);
    const leaf = group('door-panel');
    leaf.add(box(DOOR.w, DOOR.h, .14, panelSkin, { pos: [DOOR.w / 2, DOOR.h / 2, 0] }));
    leaf.add(box(DOOR.w - .16, DOOR.h - .2, .15, panelInner, { pos: [DOOR.w / 2, DOOR.h / 2, -.005] }));
    // gasket on leaf edge
    leaf.add(box(DOOR.w - .12, DOOR.h - .14, .02, gasketM, { pos: [DOOR.w / 2, DOOR.h / 2, -.082] }));
    // heated viewport
    leaf.add(box(.9, .62, .02, glass(0xbcd9e8, .32), { pos: [DOOR.w / 2, 1.98, .085], cast: false }));
    leaf.add(box(.98, .7, .04, frameM, { pos: [DOOR.w / 2, 1.98, .062], cast: false }));
    leaf.add(box(.9, .62, .015, glass(0xbcd9e8, .18), { pos: [DOOR.w / 2, 1.98, .083], cast: false }));
    const heater = new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, opacity: .5 });
    for (let i = 0; i < 5; i++) leaf.add(box(.86, .012, .006, heater, { pos: [DOOR.w / 2, 1.74 + i * .12, .095], cast: false, receive: false }));
    // kick plate + push bar handle
    leaf.add(box(DOOR.w - .2, .32, .03, steel, { pos: [DOOR.w / 2, .28, .085] }));
    leaf.add(box(.52, .06, .07, steel, { pos: [DOOR.w - .3, 1.12, .13] }));
    leaf.add(box(.06, .3, .06, steel, { pos: [DOOR.w - .56, 1.12, .13] }));
    leaf.add(cylinder(.045, .045, .1, steel, { pos: [DOOR.w - .56, 1.32, .13], segments: 10 }));
    // hinges
    for (const y of [.45, DOOR.h - .45]) leaf.add(cylinder(.05, .05, .2, steel, { pos: [0, y, 0], segments: 12 }));
    // inner safety pull release
    leaf.add(box(.3, .18, .02, material(0xd8a13f, { roughness: .5 }), { pos: [DOOR.w / 2, 1.3, -.09], cast: false }));
    const plate = signBoard('COLD STORE 01', .7, .2, { bg: '#07161f', border: '#63b6ff', color: '#cfe9ff' });
    plate.position.set(DOOR.w / 2, 2.5, .09);
    leaf.add(plate);
    this.pivot.add(leaf);
    this.leaf = leaf;
    // door status beacon on frame
    this.statusMat = new THREE.MeshStandardMaterial({ color: 0x3ce58b, emissive: 0x3ce58b, emissiveIntensity: 1.8 });
    this.root.add(cylinder(.05, .05, .035, this.statusMat, { pos: [DOOR.w / 2, DOOR.h + .26, .12], rx: Math.PI / 2, segments: 12, cast: false }));
    this.autoConfig = this.infra.config.door;
  }

  open(reason = 'operator') {
    if (this.angle < .02) this.cycles++;
    this.manualHold = reason !== 'auto';
    this.target = this.openAngle;
    this.infra.logEvent('Freezer door opening', `Walk-in door commanded open (${reason}).`, 'warn');
    this.infra.evaluateAlarms();
  }

  close(reason = 'operator') {
    if (this.isOpen) this.lastOpenDuration = this.openElapsed;
    this.manualHold = false;
    this.target = 0;
    this.infra.logEvent('Freezer door closing', `Walk-in door commanded closed (${reason}).`, 'info');
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  update(dt) {
    const cfg = this.infra.config.door;
    const wasOpen = this.isOpen;
    // A door opened by an operator is held until the operator closes it;
    // presence-detected openings still respect the automatic close delay.
    if (cfg.auto && cfg.sensorEnabled && !this.manualHold && this.target > 0 && this.angle > 0.1) {
      if (this.openElapsed >= cfg.autoCloseDelay) {
        this.target = 0;
        this.infra.logEvent('Door auto-close', `Presence sensor timed out after ${ui.fmtDuration(cfg.autoCloseDelay)}.`, 'info');
      }
    }
    const rate = this.target > this.angle ? cfg.openSpeed : cfg.closeSpeed;
    const diff = this.target - this.angle;
    if (Math.abs(diff) > 1e-3) this.angle += Math.sign(diff) * Math.min(Math.abs(diff), Math.max(.05, rate) * dt);
    else this.angle = this.target;
    this.pivot.rotation.y = -this.angle;
    if (this.isOpen) this.openElapsed += dt;
    else { if (wasOpen) this.lastOpenDuration = this.openElapsed; this.openElapsed = 0; }
    const open = this.angle > .06;
    if (this.statusMat) {
      const col = open ? 0xffb547 : 0x3ce58b;
      this.statusMat.color.setHex(col);
      this.statusMat.emissive.setHex(col);
      this.statusMat.emissiveIntensity = open ? 2.2 : 1.6;
    }
    if (this.lockLed) {
      const col = open ? 0xffb547 : 0x3ce58b;
      this.lockLed.material.color.setHex(col);
      this.lockLed.material.emissive.setHex(col);
    }
  }
}

/* ============================================================
   Condensing unit — outdoor compressor with animated fan
   ============================================================ */
class CompressorUnit {
  constructor(infra) {
    this.infra = infra;
    this.root = group('condensing-unit');
    this.root.position.set(10.4, 0, 1.2);
    this.load = 0.35;
    this.rpm = 0;
    this.fanAngle = 0;
    this.current = 0;
    this.starts = 0;
    this.runtime = 0;
    this.restartTimer = 0;
    this.startPulse = 0;
    this.vibration = 0;
    this._prevOn = true;
    this.build();
  }

  get on() { return !!this.infra.config.compressor.on; }
  get healthy() { return !this.infra.faults.compressor; }
  get coolingEnabled() { return this.on && this.healthy && !!this.infra.config.compressor.liquidValve; }
  get status() {
    if (!this.healthy) return this.restartTimer > 0 ? 'RESTARTING' : 'FAULT';
    if (!this.on) return 'STANDBY';
    return this.infra.config.compressor.auto ? 'AUTO RUN' : 'RUNNING';
  }
  get tone() { return !this.healthy ? 'danger' : this.on ? 'ok' : 'muted'; }

  build() {
    const steel = material(0x8d9aa4, { metalness: .68, roughness: .34 });
    const casing = material(0xa9b5bd, { metalness: .42, roughness: .46 });
    const dark = material(0x2b353d, { metalness: .5, roughness: .48 });
    const copper = material(0xa9633c, { metalness: .82, roughness: .3 });
    const black = material(0x141a1f, { roughness: .7, metalness: .2 });

    const shell = group('comp-shell');
    // base rails
    shell.add(box(2.9, .16, 2.0, dark, { pos: [0, .08, 0] }));
    // coil section (rear) with fins
    shell.add(box(2.55, 1.42, 1.9, casing, { pos: [0, .92, -.05] }));
    shell.add(box(2.3, 1.1, .04, black, { pos: [0, .92, -1.0] }));
    for (let i = 0; i < 24; i++) {
      shell.add(box(.02, .98, .03, steel, { pos: [-1.06 + i * .092, .92, -.985], cast: false }));
    }
    // side louvres
    for (const z of [-1.02, 1.02]) {
      for (let i = 0; i < 6; i++) shell.add(box(1.7, .03, .02, dark, { pos: [0, .52 + i * .16, z], cast: false }));
    }
    // top deck + fan shroud
    shell.add(box(2.6, .1, 2.0, casing, { pos: [0, 1.68, 0] }));
    shell.add(cylinder(.72, .72, .12, dark, { pos: [-.35, 1.74, 0], segments: 22, openEnded: true }));
    shell.add(cylinder(.72, .72, .08, casing, { pos: [.72, 1.72, 0], segments: 22, openEnded: true }));
    // compressor dome + electrical box
    shell.add(cylinder(.34, .34, .95, black, { pos: [.5, 1.2, -.35], rx: Math.PI / 2, segments: 18 }));
    shell.add(box(.62, .5, .34, dark, { pos: [.92, .9, .62] }));
    // service panel with vents
    shell.add(box(1.0, .62, .02, material(0x49545c, { metalness: .4 }), { pos: [-.5, .92, 1.05], cast: false }));
    for (let i = 0; i < 5; i++) shell.add(box(.78, .018, .01, black, { pos: [-.5, .72 + i * .09, 1.07], cast: false }));
    // nameplate
    const plate = signBoard('NEXUS CONDENSING UNIT · CU-01', 1.5, .3, { bg: '#0b1a22', border: '#63b6ff', color: '#cfe9ff' });
    plate.position.set(-.35, .48, 1.075);
    shell.add(plate);
    // status lamp panel
    shell.add(box(.46, .2, .03, material(0x10171d, { roughness: .5 }), { pos: [.92, 1.28, .8], cast: false }));
    // pipe stubs + service valves
    shell.add(cylinder(.045, .045, .7, copper, { pos: [-1.1, 1.35, .55], rx: Math.PI / 2, segments: 10 }));
    shell.add(cylinder(.06, .06, .7, copper, { pos: [-1.1, 1.1, .55], rx: Math.PI / 2, segments: 10 }));
    const valve = makeValve(.13, 0xb0553f);
    valve.position.set(-1.25, .92, .75);
    valve.rotation.y = Math.PI / 2;
    shell.add(valve);
    this.valve = valve;
    // gauge
    shell.add(cylinder(.11, .11, .04, material(0xcfd8dd, { metalness: .3, roughness: .4 }), { pos: [1.28, 1.32, .35], rz: Math.PI / 2, segments: 18 }));
    this.needle = box(.008, .1, .012, material(0xff4a5f, { emissive: 0xff4a5f, emissiveIntensity: .6, roughness: .4 }), { pos: [1.3, 1.35, .35], cast: false });
    this.gaugePivot = group('gauge-needle');
    this.gaugePivot.position.set(1.3, 1.32, .35);
    const needle = box(.01, .085, .012, material(0xff4a5f, { emissive: 0xff4a5f, emissiveIntensity: .8 }), { pos: [0, .03, .022], cast: false });
    this.gaugePivot.add(needle);
    this.gaugePivot.rotation.x = 0;
    shell.add(this.gaugePivot);
    mergeStaticGroup(shell);
    this.shell = shell;
    this.root.add(shell);

    // animated fan assembly
    const fan = group('cond-fan');
    fan.position.set(-.35, 1.79, 0);
    const blades = group('fan-blades');
    for (let i = 0; i < 4; i++) {
      const b = box(.56, .028, .16, material(0x9aa8b2, { metalness: .6, roughness: .35 }), { pos: [.36, 0, 0] });
      b.rotation.y = i * Math.PI / 2 + .18;
      b.geometry.translate(0, 0, 0);
      b.position.set(Math.cos(i * Math.PI / 2 + .18) * .38, 0, Math.sin(i * Math.PI / 2 + .18) * .38);
      b.rotation.y = -(i * Math.PI / 2 + .18);
      blades.add(b);
    }
    blades.add(cylinder(.09, .09, .1, material(0x2a343c, { metalness: .6 }), { segments: 14 }));
    fan.add(blades);
    const ringM = material(0x555f68, { metalness: .7, roughness: .4 });
    for (const r of [.32, .5, .68]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .012, 5, 22), ringM);
      ring.rotation.x = Math.PI / 2;
      ring.castShadow = false;
      fan.add(ring);
    }
    for (let i = 0; i < 5; i++) {
      const spoke = box(.86, .012, .012, ringM, { pos: [0, .01, 0], cast: false });
      spoke.rotation.y = i * Math.PI / 5;
      fan.add(spoke);
    }
    this.fanBlades = blades;
    this.root.add(fan);
    this.fan = fan;

    // LED status lamps
    this.leds = [];
    const ledColors = [0x3ce58b, 0xffb547, 0xff4a5f];
    ledColors.forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .3, roughness: .35 });
      const led = new THREE.Mesh(new THREE.SphereGeometry(.026, 10, 8), m);
      led.position.set(.78 + i * .13, 1.28, .83);
      this.root.add(led);
      this.leds.push(m);
    });

    // vibration group for connected piping
    this.vibrationGroup = group('comp-vibration');
    this.root.add(this.vibrationGroup);
    const copperFlex = material(0xb26b42, { metalness: .8, roughness: .32 });
    const flexPipe = pipe([[-1.1, 1.4, .55], [-1.7, 1.55, .85], [-2.3, 1.45, .95], [-2.9, 1.2, .95]], .045, copperFlex, { radial: 8, segs: 16 });
    this.vibrationGroup.add(flexPipe);
    this.vibrationGroup.add(pipe([[-1.1, 1.1, .55], [-1.8, .95, .85], [-2.4, .9, .95], [-2.95, .95, .95]], .06, copperFlex, { radial: 8, segs: 16 }));
    // suction accumulator
    this.root.add(cylinder(.16, .16, .6, material(0x6d7a84, { metalness: .7, roughness: .38 }), { pos: [1.45, .55, -.5], segments: 16 }));
  }

  start() {
    if (!this.healthy) { ui.toast('Compressor is faulted — restart required.', { type: 'danger' }); return; }
    this.infra.config.compressor.on = true;
    this.starts++;
    this.startPulse = 1;
    this.infra.logEvent('Compressor start', 'Condensing unit energised, refrigerant circulating.', 'ok');
    this.infra.refreshLive();
  }

  stop() {
    this.infra.config.compressor.on = false;
    this.infra.logEvent('Compressor stop', 'Condensing unit de-energised. Room warming.', 'warn');
    this.infra.refreshLive();
  }

  injectFault(reason = 'High-pressure lockout') {
    this.infra.faults.compressor = true;
    this.infra.config.compressor.on = false;
    this.infra.logEvent('Compressor fault', `Refrigeration plant tripped: ${reason}.`, 'danger');
    this.infra.evaluateAlarms();
    this.infra.refreshLive();
  }

  restart() {
    if (!this.infra.faults.compressor && this.restartTimer <= 0) {
      this.infra.logEvent('Compressor restart', 'Restart requested — unit already healthy.', 'info');
    }
    this.restartTimer = 4.5;
    this.startPulse = 1;
    this.infra.logEvent('Compressor restart sequence', 'Restart delay 4.5 s · pressure equalisation.', 'warn');
    this.infra.refreshLive();
  }

  update(dt) {
    const cfg = this.infra.config.compressor;
    if (this.restartTimer > 0) {
      this.restartTimer -= dt;
      if (this.restartTimer <= 0) {
        this.restartTimer = 0;
        this.infra.faults.compressor = false;
        cfg.on = true;
        this.starts++;
        this.startPulse = 1;
        this.infra.logEvent('Compressor online', 'Restart successful. Refrigeration resumed.', 'ok');
      }
    }
    const running = this.coolingEnabled || (this.on && this.healthy);
    if (running && !this._prevOn) { this.startPulse = 1; this.starts++; }
    this._prevOn = running;
    let demand = 0;
    if (running) {
      if (cfg.auto) {
        const avg = this.infra.averageTemp();
        const doorFraction = this.infra.doors?.openFraction ?? 0;
        demand = clamp(0.58 + (avg - cfg.targetTemp) * 0.62 + doorFraction * 0.3, 0, 1);
      } else demand = clamp(cfg.intensity / 100, 0, 1);
      if (!cfg.liquidValve) demand *= 0.04;
    }
    const maxStep = dt * (running ? 1.4 : 0.8);
    this.load += clamp(demand - this.load, -maxStep, maxStep);
    this.load = clamp(this.load, 0, 1);
    if (running) this.runtime += dt;
    const baseA = running ? 2.1 + this.load * 8.6 + (cfg.speed / 100) * 1.5 : 0.03;
    this.startPulse = Math.max(0, this.startPulse - dt * 0.9);
    this.current = running ? baseA + this.startPulse * 11 : 0.02 + this.startPulse * 2;
    const fanTarget = running ? (cfg.speed / 100) * 1450 * (0.35 + 0.65 * this.load) : 0;
    this.rpm += clamp(fanTarget - this.rpm, -dt * 1000, dt * 760);
    this.rpm = Math.max(0, this.rpm);
    this.fanAngle += (this.rpm / 60) * TAU * dt;
    if (this.fanBlades) this.fanBlades.rotation.y = this.fanAngle;
    // vibration
    this.vibration += dt;
    const vib = this.load * (running ? 1 : 0);
    if (this.shell) {
      this.shell.position.y = Math.sin(this.vibration * 47) * .0035 * vib;
      this.shell.position.x = Math.sin(this.vibration * 61 + 1) * .0025 * vib;
    }
    if (this.vibrationGroup) {
      this.vibrationGroup.rotation.z = Math.sin(this.vibration * 53) * .004 * vib;
      this.vibrationGroup.position.y = Math.sin(this.vibration * 39) * .004 * vib;
    }
    if (this.gaugePivot) this.gaugePivot.rotation.z = -.9 + this.load * 1.7;
    if (this.leds) {
      this.leds[0].emissiveIntensity = running ? 2.1 : .18;
      this.leds[1].emissiveIntensity = running && this.load > .85 ? 1.9 : .12;
      this.leds[2].emissiveIntensity = !this.healthy || !this.on ? (Math.sin(this.vibration * 6) > 0 ? 2.2 : .3) : .1;
    }
  }
}

/* ============================================================
   Evaporator / fan unit — ceiling mounted room cooler
   ============================================================ */
class EvaporatorUnit {
  constructor(infra) {
    this.infra = infra;
    this.root = group('evaporator-unit');
    this.root.position.set(-1.6, 3.3, -4.72);
    this.fanAngle = 0;
    this.fanLevel = 0.3;
    this.frostLevel = 0.4;
    this.build();
  }

  build() {
    const steel = material(0x93a3ad, { metalness: .55, roughness: .38 });
    const casing = material(0x9fb0ba, { metalness: .38, roughness: .46 });
    const dark = material(0x2c353d, { metalness: .4, roughness: .5 });
    const shell = group('evap-shell');
    shell.add(roundedBox(2.9, .82, .78, casing, { pos: [0, 0, 0], radius: .05 }));
    // coil face (rear)
    shell.add(box(2.6, .6, .04, dark, { pos: [0, 0, -.4] }));
    for (let i = 0; i < 26; i++) shell.add(box(.02, .5, .03, steel, { pos: [-1.2 + i * .096, 0, -.38], cast: false }));
    // side panels / end caps
    for (const x of [-1.46, 1.46]) shell.add(box(.06, .86, .8, steel, { pos: [x, 0, 0] }));
    // drip tray
    shell.add(box(2.86, .1, .86, dark, { pos: [0, -.48, 0] }));
    shell.add(cylinder(.04, .04, .5, material(0x9aa7b0, { metalness: .5 }), { pos: [1.2, -.6, .3], segments: 10, rx: Math.PI / 2 }));
    // mounting brackets
    for (const x of [-1.1, 1.1]) {
      shell.add(box(.08, .5, .08, steel, { pos: [x, .55, -.3] }));
      shell.add(box(.5, .08, .08, steel, { pos: [x, .8, -.3] }));
    }
    // hanging rails to ceiling
    for (const x of [-1.0, 1.0]) shell.add(cylinder(.03, .03, .7, steel, { pos: [x, .95, -.2], segments: 8 }));
    // front grille
    for (let i = 0; i < 5; i++) shell.add(box(2.5, .025, .02, dark, { pos: [0, -.28 + i * .08, .41], cast: false }));
    // defrost heater strip
    shell.add(box(2.5, .03, .04, new THREE.MeshStandardMaterial({ color: 0xffa14a, emissive: 0xff8a2a, emissiveIntensity: 0.2 }), { pos: [0, .45, .4], cast: false }));
    // brand
    const plate = signBoard('EVAP-02 · NEXUS', 1.5, .22, { bg: '#0b1a22', border: '#63b6ff', color: '#cfe9ff' });
    plate.position.set(0, .58, .41);
    shell.add(plate);
    mergeStaticGroup(shell);
    this.root.add(shell);

    // front fans
    this.fans = [];
    for (const x of [-.72, .72]) {
      const fg = group('evap-fan');
      fg.position.set(x, -.02, .42);
      const blades = group();
      for (let i = 0; i < 3; i++) {
        const b = box(.5, .09, .018, material(0x8ea0ac, { metalness: .5, roughness: .4 }), { pos: [.26, 0, 0] });
        b.position.set(Math.cos(i * TAU / 3) * .26, Math.sin(i * TAU / 3) * .26, 0);
        b.rotation.z = i * TAU / 3;
        blades.add(b);
      }
      blades.add(cylinder(.06, .06, .04, dark, { pos: [0, 0, .01], segments: 12, rx: Math.PI / 2 }));
      const guard = new THREE.Mesh(new THREE.TorusGeometry(.33, .01, 5, 20), material(0x6a7882, { metalness: .6 }));
      guard.castShadow = false;
      fg.add(blades, guard);
      this.root.add(fg);
      this.fans.push({ group: fg, blades });
    }
    // frost accumulation sheet (opacity animated)
    this.frostMat = new THREE.MeshBasicMaterial({ color: 0xe9f8ff, transparent: true, opacity: .25, depthWrite: false });
    this.frostMesh = box(2.55, .62, .02, this.frostMat, { pos: [0, 0, -.43], cast: false, receive: false });
    this.root.add(this.frostMesh);
    // ice clumps
    const iceM = new THREE.MeshStandardMaterial({ color: 0xdff2ff, roughness: .25, metalness: .05, transparent: true, opacity: .55 });
    for (let i = 0; i < 8; i++) {
      const s = sphere(.05 + (i % 3) * .03, iceM, { segments: 8, pos: [-1.1 + i * .3, -.36 + (i % 2) * .06, -.32], cast: false });
      this.root.add(s);
    }
    this.hasRun = false;
  }

  get fanFraction() { return clamp(this.fanLevel, 0, 1); }

  update(dt) {
    const cfg = this.infra.config.compressor;
    const running = this.infra.compressor.coolingEnabled;
    const target = running ? clamp(cfg.fanSpeed / 100, 0, 1) : 0;
    this.fanLevel += clamp(target - this.fanLevel, -dt * .5, dt * .9);
    this.fanAngle += this.fanLevel * 24 * dt;
    for (const f of this.fans) f.blades.rotation.z = this.fanAngle;
    const defrost = this.infra.defrostTimer > 0;
    if (defrost) this.frostLevel -= dt * .16;
    else if (running) this.frostLevel += dt * .012;
    else this.frostLevel -= dt * .004;
    this.frostLevel = clamp(this.frostLevel, 0, 1);
    if (this.frostMat) this.frostMat.opacity = .06 + this.frostLevel * .55;
  }
}

/* ============================================================
   Cold Storage Room infrastructure
   ============================================================ */
export default class ColdStorageRoom extends BaseInfrastructure {
  constructor(host) {
    super(host, meta);
    this.zones = ZONES.map(z => ({ ...z }));
    this.inventory = [];
    this.faults = { compressor: false, sensor: false, doorSensor: false };
    this.ambientTemp = 23.5;
    this.ambientHumidity = 56;
    this.humidity = 71;
    this.evapCoilTemp = -27;
    this.kAmbient = 0.00022;
    this.coolGain = 0.00115;
    this.roomLights = [];
    this.stripCurtains = [];
    this.liquidValveOpen = true;
    this.defrostTimer = 0;
    this.heatmap = [];
    this.mist = null;
    this.doorFog = null;
    this.itemVisuals = new Map();
    this.inventorySlots = [];
    this.doors = null;
    this.compressor = null;
    this.evaporator = null;
    this.displays = [];
    this.displayAccum = 0;
    this.visualAccum = 0;
    this.humidityAccum = 0;
    this.consumptionAccum = 0;
    this.beacon = null;
    this.beaconTest = 0;
    this.doorLamp = null;
    this.heatColor = new THREE.Color();
    this._itemSerial = 200;
    this._energy = 0;
    this._supplyPressure = 4.2;
  }

  defaultConfig() {
    return {
      ...super.defaultConfig(),
      door: { auto: true, openSpeed: 1.15, closeSpeed: 0.9, autoCloseDelay: 20, sensorEnabled: true },
      compressor: { on: true, auto: true, intensity: 78, targetTemp: -18, speed: 70, fanSpeed: 65, liquidValve: true },
      humidity: { auto: true, target: 68, sensorEnabled: true, dehumidifier: true },
      lighting: { on: true, mood: true, level: 100 },
      heatmap: true,
      displayOn: true,
      displayBrightness: 100,
      beaconOn: true,
      defrost: { auto: false },
      zones: { A: { damper: .8 }, B: { damper: .86 }, C: { damper: 1 }, D: { damper: .94 } },
      consumption: { enabled: false, restock: false, rate: 1 },
      alarmsEnabled: {},
      thresholds: {
        safeTempC: -12, criticalTempC: -8, doorOpenSeconds: 120,
        humidityHigh: 80, humidityLow: 40, spoilageToleranceC: 0.5,
      },
      inventory: INITIAL_INVENTORY.map(i => ({ ...i })),
    };
  }

  /* =========================================================
     World construction
     ========================================================= */
  buildWorld() {
    this.inventory = (this.config.inventory || []).map(i => ({ ...i }));
    this.makeCategories();
    this.buildGround();
    this.buildFoundation();
    this.buildFloor();
    this.buildWalls();
    this.buildWindows();
    this.buildDoor();
    this.buildInteriorWalls();
    this.buildRoof();
    this.buildCeiling();
    this.buildBeamsColumns();
    this.buildPartitions();
    this.buildCompressor();
    this.buildEvaporator();
    this.buildPipes();
    this.buildControlPanel();
    this.buildDisplayBoard();
    this.buildHumidityUnit();
    this.buildAlarmBeacon();
    this.buildLighting();
    this.buildShelving();
    this.buildInventoryVisuals();
    this.buildSigns();
    this.buildWiring();
    this.buildSensors();
    this.buildAtmosphere();
    this.buildEquipmentRegistry();
    this.optimizeStaticGeometry();
    this.buildHeatmap();
    this.buildBackground();

    // First-person spawn point (cold room entrance)
    this.firstPersonSpawnPoint = { x: 0, y: 1.7, z: 6, yaw: Math.PI, pitch: 0 };
    this.initFirstPerson(this.firstPersonSpawnPoint);

    // Register detailed operational scenarios
    this.registerDetailedScenarios();
  }

  makeCategories() {
    const cats = [
      ['floor', 'Insulated Floor', 'structure'],
      ['foundation', 'Plinth & Apron', 'structure'],
      ['walls', 'Insulated Panel Walls', 'structure'],
      ['interior-walls', 'Strip Curtains & Inner Frame', 'structure'],
      ['partitions', 'Medical Cage Partitions', 'structure'],
      ['roof', 'Roof & Rooftop Plant', 'structure'],
      ['ceiling', 'Ceiling Panels', 'structure'],
      ['beams', 'Ceiling Beams', 'structure'],
      ['columns', 'Corner Columns', 'structure'],
      ['doors', 'Walk-in Freezer Door', 'structure'],
      ['windows', 'Observation Windows', 'structure'],
      ['shelves', 'Storage Racks', 'equipment'],
      ['equipment', 'Refrigeration Plant', 'equipment'],
      ['inventory', 'Stock & Inventory', 'equipment'],
      ['sensors', 'Thermal Sensors', 'equipment'],
      ['pipes', 'Refrigerant Piping', 'equipment'],
      ['wiring', 'Electrical Wiring', 'equipment'],
      ['lighting', 'Lighting', 'equipment'],
      ['signs', 'Safety Signage', 'equipment'],
      ['atmosphere', 'Frost & Cold Air', 'equipment'],
    ];
    this.cat = {};
    for (const [id, label, kind] of cats) this.cat[id] = this.category({ id, label, kind });
  }

  buildGround() {
    const earth = new THREE.Mesh(new THREE.PlaneGeometry(150, 120), material(0x11181e, { roughness: .97, metalness: 0 }));
    earth.rotation.x = -Math.PI / 2;
    earth.position.set(0, -.12, 0);
    earth.receiveShadow = true;
    this.scene.world.add(earth);
    // service yard
    const yard = plane(46, 22, material(0x1b2329, { roughness: .93, metalness: .04 }), { pos: [-4, -.05, 12.5], receive: true });
    yard.userData.ignoreFit = true;
    this.scene.world.add(yard);
    for (let i = 0; i < 7; i++) {
      this.scene.world.add(box(.12, .01, 2.6, new THREE.MeshBasicMaterial({ color: 0xc9d2d8, transparent: true, opacity: .5 }), { pos: [-18 + i * 5.2, -.035, 12.5], cast: false, receive: false }));
    }
  }

  buildFoundation() {
    const concrete = material(0x5a636b, { roughness: .9, metalness: .04 });
    const darkConcrete = material(0x3d454b, { roughness: .93, metalness: .03 });
    // apron around building
    this.cat.foundation.add(box(18.5, .18, 14.6, concrete, { pos: [0, -.09, 0] }));
    // perimeter plinth
    this.cat.foundation.add(box(EXT.x1 - EXT.x0 + .7, .32, .55, darkConcrete, { pos: [0, .16, EXT.z1 + .28] }));
    this.cat.foundation.add(box(EXT.x1 - EXT.x0 + .7, .32, .55, darkConcrete, { pos: [0, .16, EXT.z0 - .28] }));
    this.cat.foundation.add(box(.55, .32, EXT.z1 - EXT.z0 + .7, darkConcrete, { pos: [EXT.x0 - .28, .16, 0] }));
    this.cat.foundation.add(box(.55, .32, EXT.z1 - EXT.z0 + .7, darkConcrete, { pos: [EXT.x1 + .28, .16, 0] }));
    // door landing
    this.cat.foundation.add(box(3.4, .16, 1.9, concrete, { pos: [2.15, -.02, 6.5] }));
    this.cat.foundation.add(box(3.2, .05, 1.7, material(0x4b555c, { roughness: .9 }), { pos: [2.15, .08, 6.5] }));
    // compressor pad
    this.cat.foundation.add(box(3.8, .3, 2.9, concrete, { pos: [10.4, .15, 1.2] }));
    for (const [x, z] of [[8.9, 2.4], [11.9, 2.4], [8.9, 0.0], [11.9, 0.0]]) {
      this.cat.foundation.add(box(.14, .02, .14, darkConcrete, { pos: [x, .31, z], cast: false }));
    }
    // bollards
    for (const [x, z] of [[8.6, 2.6], [12.2, 2.6], [8.6, -.2], [12.2, -.2]]) {
      this.cat.foundation.add(cylinder(.09, .11, .9, material(0xd8b23f, { roughness: .6, metalness: .2 }), { pos: [x, .45, z], segments: 10 }));
    }
  }

  buildFloor() {
    const floorM = material(0x37454e, { roughness: .84, metalness: .12 });
    const liner = material(0x4a5a63, { roughness: .78, metalness: .16 });
    const seam = material(0x1e2a31, { roughness: .9, metalness: .05 });
    // insulated slab
    this.cat.floor.add(box(ROOM.x1 - ROOM.x0 + .2, .24, ROOM.z1 - ROOM.z0 + .2, floorM, { pos: [0, -.12, 0] }));
    // inner anti-slip liner panels with seams
    const pw = (ROOM.x1 - ROOM.x0) / 4, pd = (ROOM.z1 - ROOM.z0) / 3;
    for (let ix = 0; ix < 4; ix++) {
      for (let iz = 0; iz < 3; iz++) {
        const x = ROOM.x0 + pw * (ix + .5), z = ROOM.z0 + pd * (iz + .5);
        this.cat.floor.add(box(pw - .05, .02, pd - .05, liner, { pos: [x, .012, z], cast: false, receive: true }));
      }
    }
    for (let i = 0; i <= 4; i++) this.cat.floor.add(box(.035, .012, ROOM.z1 - ROOM.z0, seam, { pos: [ROOM.x0 + i * pw, .026, 0], cast: false, receive: false }));
    for (let i = 0; i <= 3; i++) this.cat.floor.add(box(ROOM.x1 - ROOM.x0, .012, .035, seam, { pos: [0, .026, ROOM.z0 + i * pd], cast: false, receive: false }));
    // zone boundary safety line
    const yellow = new THREE.MeshBasicMaterial({ color: 0xc9a83a, transparent: true, opacity: .55 });
    this.cat.floor.add(box(ROOM.x1 - ROOM.x0 - .4, .01, .07, yellow, { pos: [0, .034, 0], cast: false, receive: false }));
    this.cat.floor.add(box(.07, .01, ROOM.z1 - ROOM.z0 - .4, yellow, { pos: [0, .034, 0], cast: false, receive: false }));
    // floor drain
    this.cat.floor.add(cylinder(.24, .24, .02, material(0x828f97, { metalness: .7, roughness: .35 }), { pos: [1.7, .03, -1.4], segments: 18, cast: false }));
    this.cat.floor.add(cylinder(.17, .17, .025, material(0x2a3238, { metalness: .6, roughness: .5 }), { pos: [1.7, .032, -1.4], segments: 14, cast: false }));
    for (let i = 0; i < 5; i++) this.cat.floor.add(box(.3, .012, .02, material(0x9aa6ae, { metalness: .7 }), { pos: [1.7, .045, -1.55 + i * .075], cast: false, receive: false }));
    // painted walkway to door
    const walk = new THREE.MeshBasicMaterial({ color: 0x4f7c8c, transparent: true, opacity: .25 });
    this.cat.floor.add(box(1.9, .008, 2.6, walk, { pos: [2.15, .033, 3.6], cast: false, receive: false }));
    // door hazard chevrons
    const hazard = new THREE.MeshBasicMaterial({ color: 0xd8b23f, transparent: true, opacity: .7 });
    for (let i = 0; i < 6; i++) this.cat.floor.add(box(.28, .008, .1, hazard, { pos: [1.25 + i * .18, .036, 4.55], cast: false, receive: false }));
  }

  buildWalls() {
    const outer = material(0x35525f, { metalness: .3, roughness: .6 });
    const liner = material(0x5d7f8e, { metalness: .22, roughness: .55 });
    const trim = material(0x8ba5b2, { metalness: .55, roughness: .38 });
    const seam = material(0x1d2f3a, { roughness: .8, metalness: .1 });
    const gasket = material(0x1a242b, { roughness: .85 });
    const frost = new THREE.MeshBasicMaterial({ color: 0xe2f3ff, transparent: true, opacity: .10, depthWrite: false });

    // back wall
    this.cat.walls.add(box(EXT.x1 - EXT.x0, ROOM.h, ROOM.wall, outer, { pos: [0, ROOM.h / 2, EXT.z0 + ROOM.wall / 2] }));
    // front wall with door opening
    const leftW = DOOR.x0 - EXT.x0;
    this.cat.walls.add(box(leftW, ROOM.h, ROOM.wall, outer, { pos: [EXT.x0 + leftW / 2, ROOM.h / 2, EXT.z1 - ROOM.wall / 2] }));
    const rightW = EXT.x1 - DOOR.x1;
    this.cat.walls.add(box(rightW, ROOM.h, ROOM.wall, outer, { pos: [DOOR.x1 + rightW / 2, ROOM.h / 2, EXT.z1 - ROOM.wall / 2] }));
    this.cat.walls.add(box(DOOR.w, ROOM.h - DOOR.h, ROOM.wall, outer, { pos: [DOOR.x0 + DOOR.w / 2, DOOR.h + (ROOM.h - DOOR.h) / 2, EXT.z1 - ROOM.wall / 2] }));
    // side walls
    this.cat.walls.add(box(ROOM.wall, ROOM.h, EXT.z1 - EXT.z0, outer, { pos: [EXT.x0 + ROOM.wall / 2, ROOM.h / 2, 0] }));
    this.cat.walls.add(box(ROOM.wall, ROOM.h, EXT.z1 - EXT.z0, outer, { pos: [EXT.x1 - ROOM.wall / 2, ROOM.h / 2, 0] }));

    // interior liner skins
    const innerBack = box(ROOM.x1 - ROOM.x0, ROOM.h - .1, .04, liner, { pos: [0, ROOM.h / 2, ROOM.z0 + .02], cast: false });
    this.cat.walls.add(innerBack);
    const innerLeft = box(.04, ROOM.h - .1, ROOM.z1 - ROOM.z0, liner, { pos: [ROOM.x0 + .02, ROOM.h / 2, 0], cast: false });
    this.cat.walls.add(innerLeft);
    const innerRight = box(.04, ROOM.h - .1, ROOM.z1 - ROOM.z0, liner, { pos: [ROOM.x1 - .02, ROOM.h / 2, 0], cast: false });
    this.cat.walls.add(innerRight);
    const innerFrontL = box(DOOR.x0 - ROOM.x0, ROOM.h - .1, .04, liner, { pos: [(ROOM.x0 + DOOR.x0) / 2, ROOM.h / 2, ROOM.z1 - .02], cast: false });
    const innerFrontR = box(ROOM.x1 - DOOR.x1, ROOM.h - .1, .04, liner, { pos: [(DOOR.x1 + ROOM.x1) / 2, ROOM.h / 2, ROOM.z1 - .02], cast: false });
    this.cat.walls.add(innerFrontL, innerFrontR);

    // panel seams (vertical + horizontal) on inner faces
    const seamStep = 1.24;
    for (let x = ROOM.x0 + seamStep; x < ROOM.x1; x += seamStep) {
      this.cat.walls.add(box(.028, ROOM.h - .12, .03, seam, { pos: [x, ROOM.h / 2, ROOM.z0 + .05], cast: false, receive: false }));
      if (Math.abs(x - DOOR.x0) > .2 && Math.abs(x - DOOR.x1) > .2) this.cat.walls.add(box(.028, ROOM.h - .12, .03, seam, { pos: [x, ROOM.h / 2, ROOM.z1 - .05], cast: false, receive: false }));
    }
    for (let z = ROOM.z0 + seamStep; z < ROOM.z1; z += seamStep) {
      this.cat.walls.add(box(.03, ROOM.h - .12, .028, seam, { pos: [ROOM.x0 + .05, ROOM.h / 2, z], cast: false, receive: false }));
      this.cat.walls.add(box(.03, ROOM.h - .12, .028, seam, { pos: [ROOM.x1 - .05, ROOM.h / 2, z], cast: false, receive: false }));
    }
    for (const y of [1.4, 2.8]) {
      this.cat.walls.add(box(ROOM.x1 - ROOM.x0 - .1, .028, .03, seam, { pos: [0, y, ROOM.z0 + .05], cast: false, receive: false }));
    }
    // outer cladding ribs
    for (let x = EXT.x0 + .8; x < EXT.x1; x += .95) {
      this.cat.walls.add(box(.06, ROOM.h - .05, .03, trim, { pos: [x, ROOM.h / 2, EXT.z1 + .015], cast: false }));
      if (x < DOOR.x0 || x > DOOR.x1) this.cat.walls.add(box(.06, ROOM.h - .05, .03, trim, { pos: [x, ROOM.h / 2, EXT.z0 - .015], cast: false }));
    }
    // corner trims
    for (const [x, z] of [[EXT.x0, EXT.z0], [EXT.x1, EXT.z0], [EXT.x0, EXT.z1], [EXT.x1, EXT.z1]]) {
      this.cat.walls.add(box(.16, ROOM.h + .02, .16, trim, { pos: [x, ROOM.h / 2, z] }));
    }
    // top capping
    this.cat.walls.add(box(EXT.x1 - EXT.x0 + .2, .12, .26, trim, { pos: [0, ROOM.h + .02, EXT.z1] }));
    this.cat.walls.add(box(EXT.x1 - EXT.x0 + .2, .12, .26, trim, { pos: [0, ROOM.h + .02, EXT.z0] }));
    // door perimeter gasket + inner jamb
    this.cat.walls.add(box(.1, DOOR.h, .1, gasket, { pos: [DOOR.x0, DOOR.h / 2, EXT.z1 - ROOM.wall / 2 + .08], cast: false }));
    this.cat.walls.add(box(.1, DOOR.h, .1, gasket, { pos: [DOOR.x1, DOOR.h / 2, EXT.z1 - ROOM.wall / 2 + .08], cast: false }));
    this.cat.walls.add(box(DOOR.w, .1, .1, gasket, { pos: [DOOR.x0 + DOOR.w / 2, DOOR.h, EXT.z1 - ROOM.wall / 2 + .08], cast: false }));

    // frost accumulation at wall bases and corners
    for (const [x, z, w, d, ry] of [
      [-6.8, -4.95, 1.8, .06, 0], [-4.6, -4.95, 1.3, .06, 0], [5.9, -4.95, 1.6, .06, 0],
      [-6.95, -3.6, 1.4, .06, Math.PI / 2], [-6.95, 2.8, 1.1, .06, Math.PI / 2],
      [6.95, -2.4, 1.3, .06, Math.PI / 2], [-2.2, 4.95, 1.2, .06, 0],
    ]) {
      const f = plane(w, .9, frost, { pos: [x, .5, z], receive: false });
      f.rotation.set(0, ry, 0);
      this.cat.walls.add(f);
    }
    this.scene.addCollider(this.cat.walls);
  }

  buildWindows() {
    const frameM = material(0x778a96, { metalness: .65, roughness: .34 });
    const glassM = glass(0x9dcfe8, .25);
    const heaterM = new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, opacity: .38 });
    // front wall observation window (left of door)
    const g = group('observation-window');
    g.position.set(-3.7, 2.45, EXT.z1 + .01);
    g.add(box(1.5, 1.06, .06, frameM, { pos: [0, 0, 0] }));
    g.add(box(1.34, .9, .03, glassM, { pos: [0, 0, .035], cast: false }));
    for (let i = 0; i < 5; i++) g.add(box(1.26, .012, .008, heaterM, { pos: [0, -.32 + i * .16, .052], cast: false, receive: false }));
    g.add(box(.09, 1.06, .1, frameM, { pos: [-.74, 0, 0] }));
    g.add(box(.09, 1.06, .1, frameM, { pos: [.74, 0, 0] }));
    const sign = signBoard('OBSERVATION', .9, .18, { bg: '#0b1a22', border: '#63b6ff', color: '#a9d9ff' });
    sign.position.set(0, .72, .05);
    g.add(sign);
    this.cat.windows.add(g);
    // side wall pressure-relief window (right wall)
    const g2 = group('relief-window');
    g2.position.set(EXT.x1 + .02, 2.6, -1.9);
    g2.rotation.y = Math.PI / 2;
    g2.add(box(1.0, .8, .05, frameM));
    g2.add(box(.86, .66, .03, glassM, { pos: [0, 0, .03], cast: false }));
    for (let i = 0; i < 4; i++) g2.add(box(.8, .01, .008, heaterM, { pos: [0, -.24 + i * .15, .05], cast: false, receive: false }));
    this.cat.windows.add(g2);
  }

  buildDoor() {
    this.doors = new WalkInDoor(this);
    this.cat.doors.add(this.doors.root);
    this.addObject(this.doors.root, {
      id: 'door-freezer', label: 'Walk-in Freezer Door', kind: 'door', iconName: 'door',
      description: 'Insulated hinged walk-in door · presence sensor, frame heater and auto-close interlock.',
    });
  }

  buildInteriorWalls() {
    const steel = material(0x7c8d98, { metalness: .6, roughness: .4 });
    const pvc = new THREE.MeshStandardMaterial({
      color: 0xbfdcea, transparent: true, opacity: .34, roughness: .25, metalness: .02,
      side: THREE.DoubleSide, depthWrite: false,
    });
    // inner door jamb
    this.cat['interior-walls'].add(box(.08, DOOR.h, .26, steel, { pos: [DOOR.x0, DOOR.h / 2, ROOM.z1 - .13] }));
    this.cat['interior-walls'].add(box(.08, DOOR.h, .26, steel, { pos: [DOOR.x1, DOOR.h / 2, ROOM.z1 - .13] }));
    this.cat['interior-walls'].add(box(DOOR.w + .16, .08, .26, steel, { pos: [DOOR.x0 + DOOR.w / 2, DOOR.h, ROOM.z1 - .13] }));
    // strip curtain rail
    this.cat['interior-walls'].add(box(DOOR.w + .24, .09, .16, steel, { pos: [DOOR.x0 + DOOR.w / 2, 2.94, 4.98] }));
    for (const x of [DOOR.x0 + .02, DOOR.x1 - .02]) {
      this.cat['interior-walls'].add(box(.1, .3, .12, steel, { pos: [x, 2.94, 4.98] }));
    }
    // hanging PVC strips
    const strips = 9;
    const w = (DOOR.w + .1) / strips;
    for (let i = 0; i < strips; i++) {
      const strip = box(w - .012, 1.66, .014, pvc, { pos: [DOOR.x0 + .03 + i * w + w / 2, 2.9 - .83, 4.97], cast: false, receive: false });
      strip.userData.noMerge = true;
      this.cat['interior-walls'].add(strip);
      this.stripCurtains.push({ mesh: strip, base: 0, phase: i * .6 });
    }
    // inner walkway handrail (west side)
    for (let z = 1.4; z < 4.8; z += 1.7) {
      this.cat['interior-walls'].add(cylinder(.035, .035, 1.05, steel, { pos: [ROOM.x0 + .35, .52, z], segments: 8 }));
    }
    this.cat['interior-walls'].add(cylinder(.04, .04, 3.4, steel, { pos: [ROOM.x0 + .35, 1.02, 3.1], rx: Math.PI / 2, segments: 8 }));
  }

  buildRoof() {
    const deck = material(0x3a454c, { metalness: .42, roughness: .55 });
    const cap = material(0x53626b, { metalness: .5, roughness: .48 });
    const dark = material(0x222c33, { metalness: .4, roughness: .6 });
    const steel = material(0x7d8f9a, { metalness: .62, roughness: .4 });
    const W = EXT.x1 - EXT.x0 + .4, D = EXT.z1 - EXT.z0 + .4;
    this.cat.roof.add(box(W, .2, D, deck, { pos: [0, ROOM.h + .22, 0] }));
    this.cat.roof.add(box(W - .3, .08, D - .3, cap, { pos: [0, ROOM.h + .35, 0] }));
    // ribs
    for (let x = EXT.x0 + .6; x < EXT.x1; x += .9) {
      this.cat.roof.add(box(.07, .07, D - .2, cap, { pos: [x, ROOM.h + .4, 0], cast: false }));
    }
    // parapet flashing
    this.cat.roof.add(box(W + .1, .34, .18, steel, { pos: [0, ROOM.h + .34, D / 2] }));
    this.cat.roof.add(box(W + .1, .34, .18, steel, { pos: [0, ROOM.h + .34, -D / 2] }));
    this.cat.roof.add(box(.18, .34, D, steel, { pos: [W / 2, ROOM.h + .34, 0] }));
    this.cat.roof.add(box(.18, .34, D, steel, { pos: [-W / 2, ROOM.h + .34, 0] }));
    // rooftop plant: exhaust fan
    const fanHouse = group('roof-exhaust');
    fanHouse.position.set(-3.4, ROOM.h + .46, -1.2);
    fanHouse.add(roundedBox(1.5, .55, 1.5, material(0x6c7c86, { metalness: .5 }), { pos: [0, .28, 0], radius: .05 }));
    fanHouse.add(cylinder(.5, .5, .06, dark, { pos: [0, .58, 0], segments: 18, openEnded: true }));
    const exFan = group();
    for (let i = 0; i < 4; i++) {
      const b = box(.4, .02, .12, steel, { pos: [.22, 0, 0] });
      b.position.set(Math.cos(i * Math.PI / 2) * .22, .59, Math.sin(i * Math.PI / 2) * .22);
      b.rotation.y = -(i * Math.PI / 2);
      exFan.add(b);
    }
    fanHouse.add(exFan);
    this.cat.roof.add(fanHouse);
    // vent stacks
    for (const [x, z] of [[2.4, -2.6], [3.4, -2.6], [-5.6, 2.2]]) {
      this.cat.roof.add(cylinder(.16, .18, .9, steel, { pos: [x, ROOM.h + .8, z], segments: 14 }));
      this.cat.roof.add(cylinder(.28, .2, .12, dark, { pos: [x, ROOM.h + 1.26, z], segments: 14 }));
    }
    // rooftop condenser platform (for plant room)
    const plat = group('roof-condenser');
    plat.position.set(4.6, ROOM.h + .46, -2.4);
    plat.add(box(2.6, .12, 1.8, steel, { pos: [0, 0, 0] }));
    plat.add(roundedBox(2.3, .95, 1.4, material(0x8f9ca4, { metalness: .46, roughness: .5 }), { pos: [0, .55, 0], radius: .05 }));
    plat.add(cylinder(.48, .48, .08, dark, { pos: [-.4, 1.08, 0], segments: 16, openEnded: true }));
    for (let i = 0; i < 16; i++) plat.add(box(.02, .7, .02, steel, { pos: [-.95 + i * .12, .55, .72], cast: false }));
    for (const [x, z] of [[-.9, -.65], [.9, -.65], [-.9, .65], [.9, .65]]) {
      plat.add(box(.14, .22, .14, dark, { pos: [x, .1, z], cast: false }));
    }
    this.cat.roof.add(plat);
    // access hatch + guard rail
    this.cat.roof.add(box(1.1, .16, 1.1, material(0x697982, { metalness: .6 }), { pos: [0.6, ROOM.h + .44, 2.6] }));
    for (let i = 0; i < 7; i++) {
      this.cat.roof.add(cylinder(.03, .03, 1.05, steel, { pos: [-1.2 + i * 1.1, ROOM.h + .95, 3.5], segments: 7 }));
    }
    this.cat.roof.add(cylinder(.028, .028, 6.7, steel, { pos: [2.2, ROOM.h + 1.45, 3.5], rz: Math.PI / 2, segments: 7 }));
    // penetration for refrigerant lines
    this.cat.roof.add(cylinder(.2, .2, .3, dark, { pos: [7.0, ROOM.h + .35, 1.2], segments: 12 }));
  }

  buildCeiling() {
    const panel = material(0x778893, { metalness: .35, roughness: .5 });
    const seam = material(0x2b3942, { roughness: .8 });
    this.cat.ceiling.add(box(ROOM.x1 - ROOM.x0, .14, ROOM.z1 - ROOM.z0, panel, { pos: [0, ROOM.h - .07, 0] }));
    for (let x = ROOM.x0 + 1.0; x < ROOM.x1; x += 1.3) {
      this.cat.ceiling.add(box(.035, .02, ROOM.z1 - ROOM.z0 - .1, seam, { pos: [x, ROOM.h - .15, 0], cast: false, receive: false }));
    }
    for (let z = ROOM.z0 + 1.2; z < ROOM.z1; z += 1.3) {
      this.cat.ceiling.add(box(ROOM.x1 - ROOM.x0 - .1, .02, .035, seam, { pos: [0, ROOM.h - .15, z], cast: false, receive: false }));
    }
    // insulated ceiling liner + frost patches near evaporator
    const frost = new THREE.MeshBasicMaterial({ color: 0xe4f4ff, transparent: true, opacity: .12, depthWrite: false });
    for (const [x, z, w, d] of [[-1.6, -3.6, 2.6, 1.2], [-1.6, -2.2, 1.6, .9], [1.4, -3.0, 1.1, .8]]) {
      const f = plane(w, d, frost, { pos: [x, ROOM.h - .16, z], receive: false });
      this.cat.ceiling.add(f);
    }
    // sprinkler drops
    for (const [x, z] of [[-4.5, -2.6], [-4.5, 2.6], [4.5, -2.6], [4.5, 2.6], [0, 0]]) {
      this.cat.ceiling.add(cylinder(.012, .012, .22, material(0x9a3b3b, { roughness: .5 }), { pos: [x, ROOM.h - .26, z], segments: 6, cast: false }));
      this.cat.ceiling.add(cylinder(.035, .02, .06, material(0xb9c2c8, { metalness: .7 }), { pos: [x, ROOM.h - .4, z], segments: 8, cast: false }));
    }
  }

  buildBeamsColumns() {
    const steel = material(0x5e6f7a, { metalness: .62, roughness: .4 });
    const dark = material(0x394850, { metalness: .55, roughness: .45 });
    // interior ceiling beams
    for (const x of [-5.2, -1.7, 1.7, 5.2]) {
      this.cat.beams.add(box(.16, .26, ROOM.z1 - ROOM.z0 - .2, steel, { pos: [x, ROOM.h - .24, 0] }));
    }
    for (const z of [-2.5, 2.5]) {
      this.cat.beams.add(box(ROOM.x1 - ROOM.x0 - .2, .2, .16, steel, { pos: [0, ROOM.h - .22, z] }));
    }
    // door header beam
    this.cat.beams.add(box(2.7, .24, .34, dark, { pos: [2.15, DOOR.h + .16, EXT.z1 - .2] }));
    // corner columns outside envelope
    for (const [x, z] of [[EXT.x0 - .22, EXT.z0 - .22], [EXT.x1 + .22, EXT.z0 - .22], [EXT.x0 - .22, EXT.z1 + .22], [EXT.x1 + .22, EXT.z1 + .22]]) {
      this.cat.columns.add(box(.3, ROOM.h + .5, .3, dark, { pos: [x, (ROOM.h + .5) / 2, z] }));
      this.cat.columns.add(box(.5, .2, .5, material(0x4c555c, { roughness: .9 }), { pos: [x, .1, z] }));
      this.cat.columns.add(box(.42, .1, .42, steel, { pos: [x, ROOM.h + .42, z] }));
    }
    // door flanking columns
    for (const x of [DOOR.x0 - .3, DOOR.x1 + .3]) {
      this.cat.columns.add(box(.24, ROOM.h + .2, .24, dark, { pos: [x, (ROOM.h + .2) / 2, EXT.z1 + .18] }));
      this.cat.columns.add(box(.34, .12, .34, steel, { pos: [x, ROOM.h + .18, EXT.z1 + .18] }));
      const brace = box(.1, 1.2, .1, steel, { pos: [x, ROOM.h - .55, EXT.z1 + .48], rx: -.55 });
      this.cat.beams.add(brace);
    }
    // wall-mounted cable tray brackets
    for (let z = -4; z <= 4; z += 2) {
      this.cat.beams.add(box(.22, .06, .06, steel, { pos: [ROOM.x1 - .16, 3.4, z], cast: false }));
    }
  }

  buildPartitions() {
    const steel = material(0x71828d, { metalness: .55, roughness: .45 });
    const meshTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(150,182,198,.55)';
      ctx.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        ctx.beginPath(); ctx.moveTo(i * 16, 0); ctx.lineTo(i * 16, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 16); ctx.lineTo(w, i * 16); ctx.stroke();
      }
    });
    meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping;
    meshTex.repeat.set(2.2, 1.6);
    const meshMat = new THREE.MeshBasicMaterial({ map: meshTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    // medical cage around rack D
    const cage = group('medical-cage');
    const cx = 6.2, cz = 1.7, cw = 1.5, cd = 3.1, ch = 2.5;
    for (const [x, z] of [[cx - cw / 2, cz - cd / 2], [cx + cw / 2, cz - cd / 2], [cx - cw / 2, cz + cd / 2], [cx + cw / 2, cz + cd / 2]]) {
      cage.add(cylinder(.035, .035, ch, steel, { pos: [x, ch / 2, z], segments: 8 }));
    }
    for (const y of [.15, 1.2, ch]) {
      cage.add(box(cw, .05, .05, steel, { pos: [cx, y, cz - cd / 2] }));
      cage.add(box(cw, .05, .05, steel, { pos: [cx, y, cz + cd / 2] }));
      cage.add(box(.05, .05, cd, steel, { pos: [cx - cw / 2, y, cz] }));
    }
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(cd, ch - .2), meshMat);
    panel.rotation.y = Math.PI / 2;
    panel.position.set(cx - cw / 2, ch / 2, cz);
    cage.add(panel);
    const panel2 = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch - .2), meshMat);
    panel2.position.set(cx, ch / 2, cz - cd / 2);
    cage.add(panel2);
    this.cat.partitions.add(cage);
    // low safety divider between freezer and chill zones (west side)
    for (let x = -7.0; x <= -3.4; x += .9) {
      this.cat.partitions.add(cylinder(.035, .035, 1.05, steel, { pos: [x, .52, 0], segments: 8 }));
    }
    this.cat.partitions.add(cylinder(.045, .045, 3.7, steel, { pos: [-5.2, 1.02, 0], rz: Math.PI / 2, segments: 8 }));
    this.cat.partitions.add(cylinder(.045, .045, 3.7, steel, { pos: [-5.2, .58, 0], rz: Math.PI / 2, segments: 8 }));
    // chain gate at divider
    for (let i = 0; i < 8; i++) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(.045, .012, 4, 8), material(0xd8b23f, { metalness: .6, roughness: .4 }));
      link.position.set(-3.4 + i * .1, .84 + (i % 2) * .025, 0);
      link.rotation.y = Math.PI / 2;
      this.cat.partitions.add(link);
    }
  }

  buildCompressor() {
    this.compressor = new CompressorUnit(this);
    this.cat.equipment.add(this.compressor.root);
    this.addObject(this.compressor.root, {
      id: 'compressor', label: 'Condensing Unit CU-01', kind: 'compressor', iconName: 'compressor',
      description: 'Outdoor air-cooled condensing unit · 7.5 kW hermetic compressor, axial fan and refrigerant circuit.',
    });
  }

  buildEvaporator() {
    this.evaporator = new EvaporatorUnit(this);
    this.cat.equipment.add(this.evaporator.root);
    this.addObject(this.evaporator.root, {
      id: 'evaporator', label: 'Evaporator Unit EVAP-02', kind: 'evaporator', iconName: 'fan',
      description: 'Ceiling-mounted coil and fan unit · circulates cold air across all four thermal zones.',
    });
  }

  buildPipes() {
    const copper = material(0xa9633c, { metalness: .85, roughness: .28 });
    const foam = material(0x1c2a33, { roughness: .8, metalness: .1 });
    const steel = material(0x7b8b95, { metalness: .62, roughness: .4 });
    const pvc = material(0x8b979e, { roughness: .65, metalness: .1 });
    const brass = material(0xc49a4a, { metalness: .8, roughness: .32 });

    // suction line (insulated) compressor → wall → ceiling → evaporator
    const suctionPts = [
      [9.05, 1.32, 1.22], [8.35, 1.32, 1.22], [7.86, 1.38, 1.22], [7.78, 2.1, 1.22],
      [7.78, 3.5, 1.22], [7.7, 4.06, 1.22], [6.4, 4.06, 1.2], [4.4, 4.06, .8],
      [1.4, 4.06, .1], [-1.1, 4.06, -1.4], [-1.6, 4.02, -3.2], [-1.6, 3.8, -4.25],
    ];
    this.cat.pipes.add(pipe(suctionPts, .055, copper, { radial: 9, segs: 90 }));
    const suctionFoam = [
      [7.8, 1.6, 1.22], [7.8, 3.4, 1.22],
    ];
    this.cat.pipes.add(cylinder(.095, .095, 1.85, foam, { pos: [7.78, 2.5, 1.22], segments: 12 }));
    // liquid line
    const liquidPts = [
      [9.05, 1.02, 1.42], [8.35, 1.02, 1.42], [7.65, 1.08, 1.42], [7.65, 2.1, 1.42],
      [7.65, 3.5, 1.42], [7.58, 4.16, 1.42], [6.4, 4.16, 1.4], [4.4, 4.16, 1.0],
      [1.4, 4.16, .3], [-1.05, 4.16, -1.2], [-1.34, 4.1, -3.0], [-1.34, 3.86, -4.2],
    ];
    this.cat.pipes.add(pipe(liquidPts, .04, copper, { radial: 8, segs: 90 }));
    // hot gas line
    this.cat.pipes.add(pipe([[9.1, 1.55, 1.0], [8.4, 1.6, 1.0], [7.94, 1.9, 1.0], [7.94, 3.2, 1.0], [7.94, 4.18, 1.0], [6.2, 4.18, .4], [-1.2, 4.18, -2.2], [-1.2, 3.9, -4.1]], .035, copper, { radial: 8, segs: 70 }));
    // pipe clamps / hangers on ceiling
    for (const x of [-4.6, -2.2, .4, 2.8, 5.2]) {
      this.cat.pipes.add(box(.24, .08, .14, steel, { pos: [x, 4.13, .18], cast: false }));
      this.cat.pipes.add(cylinder(.02, .02, .22, steel, { pos: [x, 4.02, .18], segments: 6, cast: false }));
    }
    // exterior wall brackets
    for (const y of [1.7, 2.7, 3.6]) {
      this.cat.pipes.add(box(.3, .06, .3, steel, { pos: [7.62, y, 1.3], cast: false }));
    }
    // condensate drain from evaporator tray
    this.cat.pipes.add(pipe([[-.4, 2.78, -4.42], [-.4, 1.4, -4.92], [-.4, .16, -4.92], [.9, .16, -4.92], [1.6, .14, -2.4], [1.7, .1, -1.45]], .038, pvc, { radial: 8, segs: 50 }));
    this.cat.pipes.add(cylinder(.06, .06, .3, pvc, { pos: [1.7, .25, -1.45], segments: 10 }));

    // interactive refrigerant manifold / service valves
    const header = group('pipe-header');
    header.position.set(7.72, 1.9, 1.9);
    header.rotation.y = Math.PI / 2;
    header.add(box(1.1, .9, .05, material(0x34434c, { metalness: .4, roughness: .5 }), { pos: [0, 0, -.16] }));
    header.add(cylinder(.05, .05, 1.0, copper, { pos: [0, .1, 0], segments: 10 }));
    const v1 = makeValve(.14, 0xb0553f);
    v1.position.set(-.34, .24, .1);
    header.add(v1);
    const v2 = makeValve(.12, 0x3f7fb0);
    v2.position.set(.34, .24, .1);
    header.add(v2);
    // pressure gauge dial
    header.add(cylinder(.16, .16, .05, material(0xd2dbe0, { metalness: .3, roughness: .35 }), { pos: [.28, -.28, .02], rx: Math.PI / 2, segments: 20 }));
    this.pipeNeedle = box(.012, .12, .012, material(0xff4a5f, { emissive: 0xff4a5f, emissiveIntensity: .7 }), { pos: [.28, -.24, .06], cast: false });
    header.add(this.pipeNeedle);
    header.add(cylinder(.035, .035, .07, glass(0xd6efff, .5), { pos: [-.28, -.28, .04], rx: Math.PI / 2, segments: 10, cast: false }));
    const label = signBoard('REFRIGERANT CIRCUIT · R-449A', 1.3, .26, { bg: '#08161d', border: '#63b6ff', color: '#b9dcf2' });
    label.position.set(0, .46, .02);
    header.add(label);
    this.cat.pipes.add(header);
    this.addObject(header, {
      id: 'pipe-header', label: 'Refrigerant Service Manifold', kind: 'pipes', iconName: 'valve',
      description: 'Liquid and suction service valves, pressure gauge and sight glass for the R-449A circuit.',
    });
    this.pipeHeader = header;
  }

  buildControlPanel() {
    const panel = group('control-panel');
    panel.position.set(5.15, 0, 6.02);
    const cab = makeControlCabinet(1.62, 2.05, .58, { color: 0x364a56, doorColor: 0x405661 });
    panel.add(cab);
    // live controller display over the cabinet screen
    this.panelScreen = makeScreenTexture(520, 220);
    const screenMat = new THREE.MeshBasicMaterial({ map: this.panelScreen.tex });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.0, .42), screenMat);
    screen.position.set(-.13, 1.5, .318);
    panel.add(screen);
    // hood + status lamps
    panel.add(box(1.12, .05, .1, material(0x2a343b, { metalness: .5 }), { pos: [-.13, 1.74, .32] }));
    this.panelLeds = [];
    [0x3ce58b, 0xffb547, 0xff4a5f].forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.4, roughness: .35 });
      panel.add(cylinder(.028, .028, .025, m, { pos: [-.94, .82 - i * .12, .335], rx: Math.PI / 2, segments: 10, cast: false }));
      this.panelLeds.push(m);
    });
    const label = signBoard('CLIMATE CONTROLLER', 1.1, .2, { bg: '#08161d', border: '#36e2c2', color: '#bdf9ed' });
    label.position.set(-.13, 1.86, .33);
    panel.add(label);
    panel.add(box(.12, .4, .12, material(0x4a5861, { metalness: .5 }), { pos: [.82, 2.15, 0] }));
    this.cat.equipment.add(panel);
    this.controlPanel = panel;
    this.addObject(panel, {
      id: 'control-panel', label: 'Climate Controller CP-01', kind: 'panel', iconName: 'panel',
      description: 'Master refrigeration and door interlock controller with live zone display.',
    });
  }

  buildDisplayBoard() {
    const board = group('temperature-display');
    board.position.set(2.15, 3.52, EXT.z1 + .05);
    const frame = box(1.72, .92, .14, material(0x2a353c, { metalness: .5, roughness: .45 }));
    board.add(frame);
    board.add(box(1.78, .1, .2, material(0x4d5b63, { metalness: .55 }), { pos: [0, .48, .04] }));
    for (const x of [-.6, .6]) board.add(box(.08, .5, .08, material(0x5b6a73, { metalness: .6 }), { pos: [x, -.58, 0] }));
    this.displayScreen = makeScreenTexture(560, 300);
    const mat = new THREE.MeshBasicMaterial({ map: this.displayScreen.tex });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.56, .76), mat);
    screen.position.set(0, 0, .076);
    board.add(screen);
    const cap = signBoard('COLD STORE · ROOM CLIMATE', 1.5, .2, { bg: '#08161d', border: '#63b6ff', color: '#bfe2ff' });
    cap.position.set(0, .6, .06);
    board.add(cap);
    this.cat.equipment.add(board);
    this.displayBoard = board;
    this.addObject(board, {
      id: 'temp-display', label: 'Room Temperature Display', kind: 'display', iconName: 'thermometer',
      description: 'Exterior LED climate display · average temperature, setpoint, door and plant status.',
    });
  }

  buildHumidityUnit() {
    const unit = group('humidity-unit');
    unit.position.set(7.04, 2.6, 2.6);
    unit.rotation.y = -Math.PI / 2;
    unit.add(roundedBox(1.12, .76, .3, material(0x8d9ca5, { metalness: .45, roughness: .46 }), { radius: .05 }));
    unit.add(box(.86, .04, .02, material(0x28333a, { roughness: .6 }), { pos: [0, .2, .155], cast: false }));
    for (let i = 0; i < 5; i++) unit.add(box(.74, .022, .014, material(0x1c262c, { roughness: .7 }), { pos: [0, -.02 + i * .07, .158], cast: false }));
    this.humidityScreen = makeScreenTexture(220, 110);
    const mat = new THREE.MeshBasicMaterial({ map: this.humidityScreen.tex });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.44, .22), mat);
    screen.position.set(-.24, .2, .16);
    unit.add(screen);
    this.humidityLed = new THREE.MeshStandardMaterial({ color: 0x3ce58b, emissive: 0x3ce58b, emissiveIntensity: 1.5 });
    unit.add(cylinder(.022, .022, .02, this.humidityLed, { pos: [.34, .2, .16], rx: Math.PI / 2, segments: 8, cast: false }));
    unit.add(cylinder(.03, .03, .5, material(0x95a1a9, { metalness: .5 }), { pos: [.34, .52, 0], segments: 8, cast: false }));
    unit.add(cylinder(.05, .05, .14, material(0x6d7a83, { metalness: .5 }), { pos: [.34, .8, 0], segments: 8, cast: false }));
    // drip tray and drain
    unit.add(box(.8, .06, .22, material(0x39444b, { roughness: .7 }), { pos: [0, -.44, .06] }));
    unit.add(cylinder(.026, .026, .5, material(0x8b979e, { roughness: .65 }), { pos: [.3, -.68, .06], segments: 8, cast: false }));
    const sign = signBoard('HUMIDITY CONTROL · HC-01', 1.0, .2, { bg: '#0b1a22', border: '#36e2c2', color: '#a9f0e2' });
    sign.position.set(0, .58, .03);
    unit.add(sign);
    this.cat.equipment.add(unit);
    this.humidityUnit = unit;
    this.addObject(unit, {
      id: 'humidity-unit', label: 'Humidity Control Unit', kind: 'humidity', iconName: 'droplet',
      description: 'Wall-mounted humidity controller with condensation management and sensor link.',
    });
  }

  buildAlarmBeacon() {
    const tower = makeTowerLight('ok');
    tower.position.set(4.28, 0, 6.14);
    this.cat.equipment.add(tower);
    this.beacon = tower;
    tower.userData.setLamps(false, false, true);
    this.addObject(tower, {
      id: 'alarm-beacon', label: 'Safety Alarm Beacon', kind: 'beacon', iconName: 'alert',
      description: 'Tri-colour stack beacon · nominal, door-open and critical refrigeration alarms.',
    });
    // wall-mounted strobe above the door
    this.strobeMat = new THREE.MeshStandardMaterial({ color: 0xff4a5f, emissive: 0xff4a5f, emissiveIntensity: .15 });
    const strobe = box(.5, .16, .2, this.strobeMat, { pos: [2.15, 3.05, EXT.z1 + .24], cast: false });
    this.cat.equipment.add(strobe);
  }

  buildLighting() {
    const housing = material(0x3b4851, { metalness: .55, roughness: .44 });
    const reflector = material(0xc7d4db, { metalness: .3, roughness: .5 });
    const fixtures = [[-4.3, -2.7], [-4.3, 2.7], [4.3, -2.7], [4.3, 2.7]];
    fixtures.forEach(([x, z], i) => {
      const g = group(`light-fixture-${i + 1}`);
      g.position.set(x, ROOM.h - .3, z);
      g.add(roundedBox(1.65, .13, .46, housing, { pos: [0, 0, 0], radius: .03 }));
      g.add(box(1.42, .035, .3, reflector, { pos: [0, -.08, 0], cast: false }));
      const glow = new THREE.MeshStandardMaterial({ color: 0xd8f0ff, emissive: 0xcfe9ff, emissiveIntensity: 1.5, roughness: .35 });
      g.add(box(1.38, .02, .26, glow, { pos: [0, -.1, 0], cast: false }));
      for (const dx of [-.55, .55]) g.add(cylinder(.018, .018, .18, material(0x8a979f, { metalness: .6 }), { pos: [dx, .16, 0], segments: 6, cast: false }));
      const light = new THREE.PointLight(0xd4ecff, 7.5, 18, 2);
      light.position.set(0, -.28, 0);
      light.castShadow = false;
      g.add(light);
      this.cat.lighting.add(g);
      this.roomLights.push({ light, mat: glow, base: 7.5, baseEmissive: 1.5 });
      this.addObject(g, {
        id: `light-${i + 1}`, label: `Cold Room Light L-${i + 1}`, kind: 'light', iconName: 'light',
        description: 'Sealed IP65 cold-room LED luminaire · automatic thermal mood control.',
      });
    });
    // exterior door floodlight
    const lamp = group('door-floodlight');
    lamp.position.set(2.15, 3.35, EXT.z1 + .3);
    lamp.add(box(.12, .5, .12, material(0x4c5a63, { metalness: .6 }), { pos: [0, .25, 0] }));
    lamp.add(box(.5, .08, .3, material(0x2d373e, { metalness: .5 }), { pos: [0, .5, .12] }));
    const lampGlow = new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffdc9c, emissiveIntensity: 1.7, roughness: .4 });
    lamp.add(box(.36, .02, .2, lampGlow, { pos: [0, .455, .12], cast: false }));
    const flood = new THREE.PointLight(0xffe0a8, 5.5, 14, 2);
    flood.position.set(0, .5, .3);
    lamp.add(flood);
    this.cat.lighting.add(lamp);
    this.doorLamp = { light: flood, mat: lampGlow, base: 5.5, baseEmissive: 1.7 };
    this.addObject(lamp, {
      id: 'door-lamp', label: 'Exterior Door Floodlight', kind: 'light', iconName: 'light',
      description: 'Heated exterior floodlight over the walk-in door.',
    });
    // interior emergency exit light above door
    const exit = group('emergency-exit');
    exit.position.set(2.15, 2.55, ROOM.z1 - .12);
    const exitMat = new THREE.MeshStandardMaterial({ color: 0x59e08f, emissive: 0x3ce58b, emissiveIntensity: 1.6 });
    exit.add(box(.62, .22, .06, exitMat, { pos: [0, 0, 0], cast: false }));
    const exitSign = signBoard('‹ EXIT', .58, .18, { bg: '#0b2a1a', border: '#3ce58b', color: '#bffbdb' });
    exitSign.position.set(0, 0, .045);
    exit.add(exitSign);
    this.cat.lighting.add(exit);
    this.setLightingState(this.config.lighting.on !== false);
  }

  buildShelving() {
    const steel = material(0x74848e, { metalness: .58, roughness: .42 });
    const deck = material(0x9aa9b2, { metalness: .45, roughness: .48 });
    const dark = material(0x3c4952, { metalness: .4, roughness: .52 });
    this.racks = RACKS.map(def => {
      const g = group(`rack-${def.id}`);
      g.position.set(def.x, 0, def.z);
      g.rotation.y = def.yaw;
      const hw = def.width / 2, hd = def.depth / 2;
      const top = def.levels[def.levels.length - 1] + .35;
      for (const [x, z] of [[-hw + .06, -hd + .06], [hw - .06, -hd + .06], [-hw + .06, hd - .06], [hw - .06, hd - .06]]) {
        g.add(box(.07, top, .07, steel, { pos: [x, top / 2, z] }));
        g.add(box(.16, .05, .16, dark, { pos: [x, .025, z], cast: false }));
      }
      def.levels.forEach((y, li) => {
        g.add(box(def.width, .05, def.depth, deck, { pos: [0, y, 0] }));
        g.add(box(def.width, .1, .04, steel, { pos: [0, y + .05, hd - .02] }));
        g.add(box(def.width, .1, .04, steel, { pos: [0, y + .05, -hd + .02] }));
        // shelf tag rails
        g.add(box(.52, .1, .015, dark, { pos: [-hw + .4, y + .08, hd - .01], cast: false }));
        if (li === 0) {
          g.add(box(def.width - .2, .08, .05, steel, { pos: [0, .55, hd - .06] }));
        }
      });
      // diagonal braces + top rails
      for (const [x, z] of [[-hw + .06, -hd + .06], [hw - .06, -hd + .06], [-hw + .06, hd - .06], [hw - .06, hd - .06]]) {
        g.add(box(.05, top - .2, .05, steel, { pos: [x, top / 2, z], cast: false }));
      }
      g.add(box(def.width, .06, .06, steel, { pos: [0, top, hd - .06] }));
      g.add(box(def.width, .06, .06, steel, { pos: [0, top, -hd + .06] }));
      g.add(box(.06, .06, def.depth, steel, { pos: [-hw + .06, top, 0] }));
      g.add(box(.06, .06, def.depth, steel, { pos: [hw - .06, top, 0] }));
      const sign = signBoard(`${def.label.toUpperCase()} · ${def.zone}`, 1.15, .24, { bg: '#07151d', border: '#63b6ff', color: '#bfe2ff' });
      sign.position.set(0, top + .18, hd - .03);
      g.add(sign);
      const label = textSprite(`${def.name} · ${def.zone}`, { size: 30, color: '#cfe9ff', bg: 'rgba(4,14,22,.75)', border: 'rgba(99,182,255,.35)', scale: .46 });
      label.position.set(0, top + .5, 0);
      label.visible = this.labelsVisible;
      g.add(label);
      mergeStaticGroup(g);
      this.cat.shelves.add(g);
      this.addObject(g, {
        id: `shelf-${def.id}`, label: def.name, kind: 'shelf', iconName: 'inventory',
        description: `${def.label} · Zone ${def.zone} cold storage rack with live stock assignment.`,
      });
      // slot anchors
      const slots = [];
      const spacing = (def.width - .62) / Math.max(1, def.slots - 1);
      def.levels.forEach((y, li) => {
        for (let i = 0; i < def.slots; i++) {
          const along = (i - (def.slots - 1) / 2) * spacing;
          const local = new THREE.Vector3(along, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), def.yaw);
          slots.push({
            rackId: def.id, rackLabel: def.label, rackName: def.name, zone: def.zone,
            levelIndex: li, index: i, yaw: def.yaw,
            position: new THREE.Vector3(def.x + local.x, y + .04, def.z + local.z),
            occupied: null,
          });
        }
      });
      return { ...def, group: g, slots, top };
    });
    this.inventorySlots = this.racks.flatMap(r => r.slots);
  }

  rackLabel(id) { return this.racks?.find(r => r.id === id)?.label || `Rack ${String(id).toUpperCase()}`; }

  findFreeSlot(zone) {
    return this.inventorySlots.find(s => s.zone === zone && !s.occupied) || null;
  }

  stagingPoint(index) {
    const cols = 4;
    const col = index % cols, row = Math.floor(index / cols) % 3;
    return new THREE.Vector3(5.0 + col * .78, .03, 4.35 - row * .62);
  }

  makeItemVisual(item) {
    const cat = ITEM_CATEGORIES[item.category] || ITEM_CATEGORIES.frozen;
    const g = group(`item-${item.id}`);
    const baseM = material(cat.color, { roughness: .62, metalness: .08 });
    const wrapM = material(0xe7edf1, { roughness: .55, metalness: .05 });
    const frostM = material(0xdff2ff, { roughness: .72, metalness: .02, transparent: true, opacity: .55 });
    const strapM = material(0x36434c, { roughness: .6 });
    const qty = Math.max(1, item.qty || 1);
    const units = clamp(Math.round(qty / 90), 1, 3);
    if (item.category === 'food') {
      const pallet = makePallet(.8, .6);
      pallet.position.y = 0;
      g.add(pallet);
      for (let i = 0; i < units; i++) {
        const crate = box(.62, .26, .48, material(0x9a7442, { roughness: .88 }), { pos: [(i - (units - 1) / 2) * .12, .3 + i * .27, 0] });
        g.add(crate);
        for (let k = 0; k < 3; k++) {
          const fruit = sphere(.055, material(k === 0 ? 0xc4782f : k === 1 ? 0x6f9c3e : 0xa8442f, { roughness: .8 }), { segments: 8, pos: [(i - (units - 1) / 2) * .12 - .16 + k * .16, .45 + i * .27, .02] });
          fruit.castShadow = false;
          g.add(fruit);
        }
      }
    } else if (item.category === 'medicine') {
      g.add(box(.84, .06, .58, material(0xcfd8dd, { metalness: .3, roughness: .5 }), { pos: [0, .03, 0] }));
      for (let i = 0; i < units; i++) {
        const bx = (i - (units - 1) / 2) * .26;
        g.add(roundedBox(.22, .3, .3, wrapM, { pos: [bx, .22, 0], radius: .02 }));
        g.add(box(.2, .03, .31, material(0x5b8fd6, { roughness: .5 }), { pos: [bx, .3, 0], cast: false }));
        g.add(box(.05, .14, .012, material(0xcf4a5a, { roughness: .5 }), { pos: [bx, .2, .152], cast: false }));
        g.add(box(.14, .04, .012, material(0xcf4a5a, { roughness: .5 }), { pos: [bx, .22, .152], cast: false }));
      }
    } else if (item.category === 'medical') {
      g.add(box(.78, .06, .54, material(0xcfd8dd, { metalness: .3, roughness: .5 }), { pos: [0, .03, 0] }));
      const block = roundedBox(.7, .4, .48, wrapM, { pos: [0, .26, 0], radius: .03 });
      g.add(block);
      g.add(box(.7, .04, .48, material(0x7fd8b0, { roughness: .55 }), { pos: [0, .42, 0], cast: false }));
      g.add(box(.72, .045, .05, strapM, { pos: [0, .28, .2], cast: false }));
      g.add(box(.72, .045, .05, strapM, { pos: [0, .28, -.2], cast: false }));
      g.add(box(.24, .16, .012, material(0xe8eef2, { roughness: .5 }), { pos: [-.14, .27, .245], cast: false }));
      g.add(box(.1, .1, .014, material(0x54b78d, { emissive: 0x3a8a68, emissiveIntensity: .4 }), { pos: [-.14, .27, .25], cast: false }));
    } else {
      for (let i = 0; i < units; i++) {
        const bx = (i - (units - 1) / 2) * .28;
        g.add(roundedBox(.26, .34, .44, baseM, { pos: [bx, .18 + (i % 2) * .02, 0], radius: .02 }));
        g.add(box(.27, .05, .45, frostM, { pos: [bx, .36 + (i % 2) * .02, 0], cast: false }));
        g.add(box(.26, .08, .012, material(0x16232b, { roughness: .7 }), { pos: [bx, .17, .226], cast: false }));
        g.add(box(.16, .04, .014, material(0xe8eef2, { roughness: .6 }), { pos: [bx, .17, .232], cast: false }));
      }
      g.add(box(.72, .05, .5, material(0xc7d2d8, { roughness: .6 }), { pos: [0, .025, 0] }));
    }
    // product code tag
    const tag = textSprite(item.id, { size: 26, color: '#dff8f2', bg: 'rgba(4,14,22,.8)', border: 'rgba(99,182,255,.3)', scale: .3, pad: 12 });
    tag.position.set(0, .62, 0);
    tag.visible = this.labelsVisible;
    g.add(tag);
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    g.userData.itemId = item.id;
    return g;
  }

  buildInventoryVisuals() {
    for (const [objectId, root] of this.itemVisuals) {
      this.scene.unregister(objectId);
      this.objects.delete(objectId);
      if (root.parent) root.parent.remove(root);
    }
    this.itemVisuals.clear();
    for (const slot of this.inventorySlots) slot.occupied = null;
    let staging = 0;
    for (const item of this.inventory) {
      let slot = this.findFreeSlot(item.zone);
      let position, yaw;
      if (slot) {
        slot.occupied = item.id;
        item.location = `${this.rackLabel(slot.rackId)} · L${slot.levelIndex + 1}`;
        position = slot.position; yaw = slot.yaw;
      } else {
        item.location = 'Staging floor';
        position = this.stagingPoint(staging++);
        yaw = Math.PI * .15;
      }
      const visual = this.makeItemVisual(item);
      visual.position.copy(position);
      visual.rotation.y = yaw + .04;
      this.cat.inventory.add(visual);
      const objectId = `item.${item.id}`;
      this.addObject(visual, {
        id: objectId, label: item.name, kind: 'item', iconName: ITEM_CATEGORIES[item.category]?.icon || 'package',
        description: `${ITEM_CATEGORIES[item.category]?.label || item.category} · ${item.qty} units · required ≤ ${item.requiredTemp} °C · ${item.location}`,
      });
      item.objectId = objectId;
      this.itemVisuals.set(objectId, visual);
    }
    this.syncInventoryConfig();
  }

  syncInventoryConfig() {
    this.config.inventory = this.inventory.map(i => ({
      id: i.id, name: i.name, category: i.category, qty: i.qty, zone: i.zone,
      requiredTemp: i.requiredTemp, expiration: i.expiration,
    }));
  }

  nextItemId() {
    let id;
    do { this._itemSerial++; id = `SKU-${this._itemSerial}`; } while (this.inventory.some(i => i.id === id));
    return id;
  }

  addInventoryItem(input) {
    const name = (input.name || '').trim();
    if (!name) return null;
    const category = ITEM_CATEGORIES[input.category] ? input.category : 'frozen';
    const zone = ['A', 'B', 'C', 'D'].includes(input.zone) ? input.zone : 'A';
    const qty = Math.max(1, Math.round(+input.qty || 1));
    const requiredTemp = clamp(Number.isFinite(+input.requiredTemp) ? +input.requiredTemp : ITEM_CATEGORIES[category].required, -30, 5);
    const expiration = /^\d{4}-\d{2}-\d{2}$/.test(input.expiration || '') ? input.expiration : dayKey(60);
    const item = { id: this.nextItemId(), name, category, qty, zone, requiredTemp, expiration };
    this.inventory.push(item);
    this.buildInventoryVisuals();
    this.logEvent('Stock added', `${name} · ${qty} units assigned to zone ${zone}.`, 'ok');
    this.saveSoon();
    this.refreshLive();
    return item;
  }

  removeInventoryItem(id) {
    const idx = this.inventory.findIndex(i => i.id === id);
    if (idx < 0) return false;
    const [item] = this.inventory.splice(idx, 1);
    this.buildInventoryVisuals();
    this.logEvent('Stock removed', `${item.name} (${item.id}) removed from cold chain.`, 'warn');
    this.saveSoon();
    this.refreshLive();
    return true;
  }

  itemZoneTemp(item) {
    const z = this.zones.find(z => z.id === item.zone);
    return z ? z.temp : this.averageTemp();
  }

  daysToExpiry(item) {
    const exp = new Date(`${item.expiration}T00:00:00`);
    if (Number.isNaN(exp.getTime())) return 999;
    const now = new Date(BASE_DATE.getTime() + Math.floor(this.simTime / 86400) * 86400000);
    return Math.round((exp.getTime() - now.getTime()) / 86400000);
  }

  itemStatus(item) {
    const tol = this.threshold('spoilageToleranceC', 0.5);
    if (this.itemZoneTemp(item) > item.requiredTemp + tol) return 'SPOILAGE RISK';
    const days = this.daysToExpiry(item);
    if (days < 0) return 'EXPIRED';
    if (days <= 5) return 'EXPIRING';
    return 'OK';
  }

  spoilageRiskItems() {
    return this.inventory.filter(i => this.itemStatus(i) === 'SPOILAGE RISK');
  }

  buildSigns() {
    const add = (mesh, x, y, z, ry = 0) => {
      mesh.position.set(x, y, z);
      mesh.rotation.y = ry;
      this.cat.signs.add(mesh);
      return mesh;
    };
    add(signBoard('COLD STORAGE · ZONE 1', 3.0, .46, { bg: '#07161f', border: '#63b6ff', color: '#cfe9ff' }), -1.4, 3.35, EXT.z1 + .04);
    add(signBoard('AUTHORISED PERSONNEL ONLY', 2.2, .36, { bg: '#1a1004', border: '#f6b44b', color: '#ffdc9a' }), 5.85, 2.55, EXT.z1 + .04);
    add(signBoard('⚠ LOW TEMPERATURE · PPE REQUIRED', 2.5, .34, { bg: '#1a1004', border: '#f6b44b', color: '#ffdc9a' }), -5.4, 1.6, EXT.z1 + .04);
    add(signBoard('KEEP DOOR CLOSED', 1.9, .3, { bg: '#08161d', border: '#63b6ff', color: '#bfe2ff' }), 2.15, 2.72, ROOM.z1 - .12, Math.PI);
    add(signBoard('COLD CHAIN · MAX -12 °C', 2.6, .32, { bg: '#150a0a', border: '#ff6172', color: '#ffc3ca' }), -4.4, 3.0, ROOM.z0 + .08);
    add(signBoard('MEDICAL STORES · AUTHORISED ACCESS', 2.4, .34, { bg: '#07161f', border: '#36e2c2', color: '#bdf9ed' }), ROOM.x1 - .08, 2.35, -2.2, -Math.PI / 2);
    add(signBoard('EMERGENCY ALARM', 1.2, .28, { bg: '#1a1004', border: '#f6b44b', color: '#ffdc9a' }), 4.28, 2.15, EXT.z1 + .04);
    add(signBoard('NO SMOKING · NO OPEN FLAME', 2.1, .3, { bg: '#150a0a', border: '#ff6172', color: '#ffc3ca' }), ROOM.x0 + .08, 1.9, 2.4, Math.PI / 2);
    // temperature log clipboard on interior wall
    const clip = group('temp-log');
    clip.position.set(ROOM.x1 - .08, 1.75, 4.2);
    clip.rotation.y = -Math.PI / 2;
    clip.add(box(.5, .62, .03, material(0x6d7a84, { metalness: .5 }), { pos: [0, 0, 0] }));
    clip.add(box(.4, .5, .015, material(0xe6ecef, { roughness: .8 }), { pos: [0, -.02, .022], cast: false }));
    for (let i = 0; i < 6; i++) clip.add(box(.32, .012, .004, material(0x9aa6ae, { roughness: .7 }), { pos: [0, .16 - i * .07, .032], cast: false }));
    this.cat.signs.add(clip);
  }

  buildWiring() {
    const conduit = material(0x2b3a44, { roughness: .55, metalness: .3 });
    const tray = material(0x6a7a84, { metalness: .55, roughness: .45 });
    const jb = material(0x4a575f, { metalness: .4, roughness: .5 });
    // control panel to wall and door sensor / beacon
    this.cat.wiring.add(pipe([[5.15, .12, 6.4], [5.15, .12, 6.7], [6.9, .12, 6.7], [6.9, 2.9, 6.7], [4.9, 2.9, 6.5], [3.5, 2.85, 5.7]], .028, conduit, { radial: 6, segs: 40 }));
    // control panel to compressor
    this.cat.wiring.add(pipe([[6.0, .12, 6.35], [8.4, .12, 5.6], [9.5, .12, 3.4], [10.4, .12, 2.9], [10.4, .35, 2.55]], .032, conduit, { radial: 6, segs: 40 }));
    // ceiling cable tray along right side + drop to lights
    this.cat.wiring.add(box(.16, .1, 9.6, tray, { pos: [6.9, 3.55, .4] }));
    for (let z = -4.3; z <= 5; z += 1.2) this.cat.wiring.add(box(.22, .04, .12, tray, { pos: [6.9, 3.62, z], cast: false }));
    for (const [x, z] of [[4.3, -2.7], [4.3, 2.7]]) {
      this.cat.wiring.add(pipe([[6.9, 3.6, z], [4.3, 3.6, z], [4.3, 3.9, z]], .024, conduit, { radial: 6, segs: 12 }));
    }
    // sensor network conduits
    this.cat.wiring.add(pipe([[6.9, 3.5, -4.5], [5.4, 3.5, -4.5], [4.2, 3.5, -4.5]], .02, conduit, { radial: 6, segs: 12 }));
    this.cat.wiring.add(pipe([[-6.6, 3.5, -4.5], [-6.6, 3.5, -1.6], [-6.6, 3.5, 1.2]], .02, conduit, { radial: 6, segs: 16 }));
    // interior junction boxes
    for (const [x, y, z] of [[6.9, 3.7, 4.9], [6.9, 3.7, -4.4], [-6.6, 3.7, -4.4], [5.15, 2.15, 6.02]]) {
      this.cat.wiring.add(box(.2, .14, .12, jb, { pos: [x, y, z], cast: false }));
    }
    // exterior isolator beside control panel
    this.cat.wiring.add(box(.34, .5, .18, jb, { pos: [6.35, 1.2, EXT.z1 + .12] }));
    this.cat.wiring.add(box(.26, .1, .04, material(0xd8b23f, { roughness: .6 }), { pos: [6.35, 1.36, EXT.z1 + .22], cast: false }));
  }

  buildSensors() {
    const node = (id, opts) => {
      const s = this.sensors.get(id);
      if (!s) return null;
      const n = this.createSensorNode(s, opts);
      this.cat.sensors.add(n);
      return n;
    };
    node('zone-a-temp', { scale: .8, position: [-6.55, 3.4, -4.55], rotation: [0, .4, 0], label: true, labelOffset: .55, labelScale: .42 });
    node('zone-b-temp', { scale: .8, position: [6.55, 3.4, -4.55], rotation: [0, -.4, 0], label: true, labelOffset: .55, labelScale: .42 });
    node('zone-c-temp', { scale: .8, position: [-6.55, 3.4, 4.55], rotation: [0, -Math.PI - .4, 0], label: true, labelOffset: .55, labelScale: .42 });
    node('zone-d-temp', { scale: .8, position: [6.55, 3.4, 4.55], rotation: [0, Math.PI + .4, 0], label: true, labelOffset: .55, labelScale: .42 });
    node('room-humidity', { scale: .82, position: [-.55, 2.55, 4.78], rotation: [0, Math.PI, 0], label: true, labelOffset: .5, labelScale: .4 });
    node('ambient-temp', { scale: .85, position: [6.6, 2.05, 5.72], label: true, labelOffset: .5, labelScale: .42 });
    node('evaporator-temp', { scale: .72, position: [-3.05, 3.05, -4.55], rotation: [0, .9, 0], label: false });
    node('compressor-current', { scale: .72, position: [10.4, 2.05, 2.45], rotation: [0, -.4, 0], label: false });
    node('door-state', { scale: .7, position: [3.48, 2.62, 5.48], rotation: [0, 0, 0], label: false });
    node('door-open-seconds', { scale: .7, position: [.82, 2.62, 5.48], rotation: [0, 0, 0], label: false });
    // external sensor gateway
    const gw = group('sensor-gateway');
    gw.position.set(7.1, 3.3, 5.66);
    gw.add(roundedBox(.4, .5, .16, material(0x2f3d46, { metalness: .5, roughness: .45 }), { radius: .03 }));
    for (let i = 0; i < 3; i++) gw.add(cylinder(.018, .018, .02, emissive(0x36e2c2, 1.2), { pos: [-.1 + i * .1, .16, .09], rx: Math.PI / 2, segments: 8, cast: false }));
    this.cat.sensors.add(gw);
  }

  buildAtmosphere() {
    // cold mist inside the room
    const count = 120;
    const positions = new Float32Array(count * 3);
    this.mistSeeds = [];
    for (let i = 0; i < count; i++) {
      const x = ROOM.x0 + 1 + Math.random() * (ROOM.x1 - ROOM.x0 - 2);
      const y = .4 + Math.random() * 3.2;
      const z = ROOM.z0 + 1 + Math.random() * (ROOM.z1 - ROOM.z0 - 2);
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      this.mistSeeds.push({ speed: .04 + Math.random() * .08, drift: (Math.random() - .5) * .08, phase: Math.random() * TAU });
    }
    const mistGeo = new THREE.BufferGeometry();
    mistGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mistMat = new THREE.PointsMaterial({ color: 0xcfe9ff, size: .075, transparent: true, opacity: .34, depthWrite: false, sizeAttenuation: true });
    this.mist = new THREE.Points(mistGeo, mistMat);
    this.mist.userData.ignoreFit = true;
    this.cat.atmosphere.add(this.mist);
    // door fog bank outside
    const fogCount = 54;
    const fogPos = new Float32Array(fogCount * 3);
    this.fogSeeds = [];
    for (let i = 0; i < fogCount; i++) {
      fogPos[i * 3] = DOOR.x0 + Math.random() * DOOR.w;
      fogPos[i * 3 + 1] = .2 + Math.random() * 2.4;
      fogPos[i * 3 + 2] = ROOM.z1 + .3 + Math.random() * 1.8;
      this.fogSeeds.push({ speed: .1 + Math.random() * .2, phase: Math.random() * TAU, drift: (Math.random() - .5) * .3 });
    }
    const fogGeo = new THREE.BufferGeometry();
    fogGeo.setAttribute('position', new THREE.BufferAttribute(fogPos, 3));
    const fogMat = new THREE.PointsMaterial({ color: 0xe6f6ff, size: .16, transparent: true, opacity: 0, depthWrite: false });
    this.doorFog = new THREE.Points(fogGeo, fogMat);
    this.doorFog.userData.ignoreFit = true;
    this.cat.atmosphere.add(this.doorFog);
    // cold air curtain across the open doorway
    const curtainCanvas = canvasTexture(64, 256, (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(195,232,255,0)');
      grad.addColorStop(.35, 'rgba(195,232,255,.5)');
      grad.addColorStop(.8, 'rgba(220,244,255,.32)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      for (let i = 0; i < 7; i++) ctx.fillRect(4 + i * 8, 0, 2, h);
    });
    const curtainMat = new THREE.MeshBasicMaterial({ map: curtainCanvas, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.airCurtain = new THREE.Mesh(new THREE.PlaneGeometry(DOOR.w + .1, 2.9), curtainMat);
    this.airCurtain.position.set(DOOR.x0 + DOOR.w / 2, 1.45, ROOM.z1 + .06);
    this.airCurtain.userData.ignoreFit = true;
    this.cat.atmosphere.add(this.airCurtain);
    // hanging frost on inner door wall
    const frost = new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: .16, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const f = plane(.6, 1.2, frost, { pos: [DOOR.x0 - .4 + i * .22, 1.1, ROOM.z1 - .05], receive: false });
      this.cat.atmosphere.add(f);
    }
  }

  buildEquipmentRegistry() {
    const comp = this.compressor;
    this.addEquipment({ id: 'condensing-unit', name: 'Condensing Unit CU-01', type: 'refrigeration', iconName: 'compressor', objectId: 'compressor', status: () => comp.status, tone: () => comp.tone });
    this.addEquipment({ id: 'evaporator', name: 'Evaporator Unit EVAP-02', type: 'refrigeration', iconName: 'fan', objectId: 'evaporator', status: () => this.evaporator.fanFraction > .1 ? 'CIRCULATING' : 'IDLE', tone: () => this.evaporator.fanFraction > .1 ? 'ok' : 'muted' });
    this.addEquipment({ id: 'walk-in-door', name: 'Walk-in Freezer Door', type: 'envelope', iconName: 'door', objectId: 'door-freezer', status: () => this.doors.state, tone: () => this.doors.isOpen ? 'warn' : 'ok' });
    this.addEquipment({ id: 'climate-controller', name: 'Climate Controller CP-01', type: 'control', iconName: 'panel', objectId: 'control-panel', status: () => this.manualMode ? 'MANUAL' : 'AUTOMATIC', tone: () => this.manualMode ? 'warn' : 'ok' });
    this.addEquipment({ id: 'refrigerant-circuit', name: 'Refrigerant Circuit', type: 'piping', iconName: 'valve', objectId: 'pipe-header', status: () => this.config.compressor.liquidValve ? 'CIRCULATING' : 'ISOLATED', tone: () => this.config.compressor.liquidValve ? 'ok' : 'warn' });
    this.addEquipment({ id: 'humidity-control', name: 'Humidity Control HC-01', type: 'climate', iconName: 'droplet', objectId: 'humidity-unit', status: () => this.config.humidity.auto ? `AUTO ${Math.round(this.humidity)}%` : 'MANUAL', tone: () => 'ok' });
    this.addEquipment({ id: 'lighting-circuit', name: 'Cold Room Lighting', type: 'electrical', iconName: 'light', objectId: 'light-1', status: () => this.lightingOn ? 'ENERGISED' : 'OFFLINE', tone: () => this.lightingOn ? 'ok' : 'warn' });
    this.addEquipment({ id: 'sensor-array', name: 'Thermal Sensor Array', type: 'sensing', iconName: 'sensor', status: () => `${this.sensorDefs.filter(s => this.getSensor(s.id)?.enabled).length}/${this.sensorDefs.length} ONLINE`, tone: () => 'ok' });
  }

  optimizeStaticGeometry() {
    for (const id of ['floor', 'foundation', 'walls', 'interior-walls', 'partitions', 'roof', 'ceiling', 'beams', 'columns', 'signs', 'pipes', 'wiring']) {
      const g = this.cat[id];
      if (g) mergeStaticGroup(g, { forceNoShadow: id === 'wiring' || id === 'pipes' });
    }
    this.cat.sensors.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.cat.inventory.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  }

  buildHeatmap() {
    const halfW = (ROOM.x1 - ROOM.x0) / 2 - .15;
    const halfD = (ROOM.z1 - ROOM.z0) / 2 - .15;
    for (const z of this.zones) {
      const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2;
      const g = group(`heatmap-zone-${z.id.toLowerCase()}`);
      g.position.set(cx, .05, cz);
      const mat = new THREE.MeshBasicMaterial({
        color: tempColor(z.temp), transparent: true, opacity: .34, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(halfW, halfD), mat);
      quad.rotation.x = -Math.PI / 2;
      g.add(quad);
      const edgeMat = new THREE.MeshBasicMaterial({ color: tempColor(z.temp), transparent: true, opacity: .8, depthWrite: false });
      const edges = [
        box(halfW, .012, .035, edgeMat, { pos: [0, .012, -halfD / 2], cast: false, receive: false }),
        box(halfW, .012, .035, edgeMat, { pos: [0, .012, halfD / 2], cast: false, receive: false }),
        box(.035, .012, halfD, edgeMat, { pos: [-halfW / 2, .012, 0], cast: false, receive: false }),
        box(.035, .012, halfD, edgeMat, { pos: [halfW / 2, .012, 0], cast: false, receive: false }),
      ];
      for (const e of edges) g.add(e);
      this.cat.floor.add(g);
      const label = textSprite(z.short, { size: 34, color: '#dff8f2', bg: 'rgba(4,14,22,.7)', border: 'rgba(99,182,255,.3)', scale: .5 });
      label.position.set(cx, .55, cz);
      label.visible = this.labelsVisible;
      this.cat.floor.add(label);
      this.heatmap.push({ zone: z, group: g, mat, edgeMat, label });
      this.addObject(g, {
        id: `heatmap-zone-${z.id.toLowerCase()}`, label: `${z.name} Heat Map`, kind: 'heatmap', iconName: 'thermometer',
        description: `Thermal heat map overlay for ${z.name} · colour tracks live zone temperature.`,
      });
    }
    this.setHeatmapVisible(this.config.heatmap !== false);
  }

  setHeatmapVisible(visible) {
    this.config.heatmap = !!visible;
    for (const h of this.heatmap) h.group.visible = !!visible;
    this.saveSoon();
    this.refreshLive();
  }

  buildBackground() {
    const bgM = material(0x0a1118, { roughness: .97, metalness: 0 });
    for (let i = 0; i < 7; i++) {
      const w = 8 + (i % 3) * 3.5, h = 3.5 + (i % 4) * 1.6, d = 6 + (i % 2) * 3;
      const x = -38 + i * 13.5;
      const b = box(w, h, d, bgM, { pos: [x, h / 2 - .1, -34 - (i % 3) * 6], cast: false, receive: false });
      b.userData.ignoreFit = true;
      this.scene.world.add(b);
      const stripe = box(w * .6, .07, .08, new THREE.MeshBasicMaterial({ color: 0x2b7d86, transparent: true, opacity: .25 }), { pos: [x, h * .6, -34 - (i % 3) * 6 + d / 2 + .1], cast: false });
      stripe.userData.ignoreFit = true;
      this.scene.world.add(stripe);
    }
    // yard props: pallets and crates near the plant
    for (const [x, z, ry] of [[13.0, 4.6, .3], [13.7, 4.2, -.2], [12.4, 5.0, .5]]) {
      const pallet = makePallet(1.0, .8);
      pallet.position.set(x, .02, z);
      pallet.rotation.y = ry;
      pallet.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      this.cat.foundation.add(pallet);
    }
    // perimeter fence posts
    for (let x = -20; x <= 20; x += 3.2) {
      this.scene.world.add(box(.07, 1.4, .07, material(0x4d5b63, { metalness: .5 }), { pos: [x, .7, 20], cast: false }));
    }
    this.scene.world.add(box(40, .05, .05, material(0x4d5b63, { metalness: .5 }), { pos: [0, 1.25, 20], cast: false }));
    this.scene.world.add(box(40, .05, .05, material(0x4d5b63, { metalness: .5 }), { pos: [0, .7, 20], cast: false }));
  }

  setLightingState(on) {
    this.lightingOn = on;
    this.config.lighting.on = on;
    for (const l of this.roomLights) {
      l.light.intensity = on ? l.base : 0;
      l.mat.emissiveIntensity = on ? l.baseEmissive : 0;
    }
    if (this.doorLamp) {
      this.doorLamp.light.intensity = on ? this.doorLamp.base : 0;
      this.doorLamp.mat.emissiveIntensity = on ? this.doorLamp.baseEmissive : 0;
    }
  }

  /* =========================================================
     Simulation
     ========================================================= */
  averageTemp() {
    if (!this.zones.length) return -18;
    return this.zones.reduce((a, z) => a + z.temp, 0) / this.zones.length;
  }

  maxZoneTemp() { return Math.max(...this.zones.map(z => z.temp)); }
  minZoneTemp() { return Math.min(...this.zones.map(z => z.temp)); }

  zoneById(id) { return this.zones.find(z => z.id === id); }

  startDefrost(reason = 'manual') {
    if (this.defrostTimer > 0) return;
    this.defrostTimer = 24;
    this.logEvent('Defrost cycle start', `Evaporator defrost initiated (${reason}). Cooling temporarily reduced.`, 'warn');
    this.refreshLive();
  }

  updateSimulation(dt) {
    const wasDefrost = this.defrostTimer > 0;
    this.defrostTimer = Math.max(0, this.defrostTimer - dt);
    if (wasDefrost && this.defrostTimer === 0) this.logEvent('Defrost complete', 'Evaporator coil cleared, cooling capacity restored.', 'ok');
    this.doors.update(dt);
    this.compressor.update(dt);
    this.evaporator.update(dt);
    this.updateAmbient(dt);
    this.updateThermal(dt);
    this.updateHumidity(dt);
    this.updateSensors();
    this.updateHeatmap();
    this.updateChilledVisuals(dt);
    this.updateLightMood();
    this.updateDisplays(dt);
    this.updateConsumption(dt);
    this._energy += (this.compressor.load * 7.5) * dt / 3600;
    if (this.config.defrost?.auto && this.evaporator.frostLevel > .82 && this.defrostTimer <= 0 && this.compressor.coolingEnabled) {
      this.startDefrost('automatic');
    }
  }

  updateAmbient(dt) {
    const hour = (this.simTime / 3600) % 24;
    const exhaust = (this.compressor.on && this.compressor.healthy) ? .45 + this.compressor.load * .7 : 0;
    this.ambientTemp = 22.4 + Math.sin((hour - 9) / 24 * TAU) * 4.4 + exhaust + Math.sin(this.simTime / 260) * .15;
    this.ambientHumidity = 55 + Math.sin((hour - 5) / 24 * TAU) * 7;
  }

  updateThermal(dt) {
    const comp = this.compressor;
    const fan = this.evaporator.fanFraction;
    const cooling = comp.coolingEnabled;
    const defrost = this.defrostTimer > 0;
    const amb = this.ambientTemp;
    const doorOpen = this.doors.openFraction;
    const durFactor = 1 + Math.min(this.doors.openElapsed, 240) / 240 * 1.15;
    for (const z of this.zones) {
      let dT = this.kAmbient * z.gain * (amb - z.temp);
      if (doorOpen > .01) {
        dT += z.doorGain * doorOpen * durFactor * Math.max(0, amb - z.temp) / 40;
      }
      if (cooling) {
        const delta = Math.max(0, z.temp - this.evapCoilTemp);
        const damper = this.config.zones?.[z.id]?.damper ?? 1;
        dT -= this.coolGain * z.coupling * damper * delta * comp.load * (0.28 + 0.72 * fan) * (defrost ? .1 : 1);
      }
      z.temp = clamp(z.temp + dT * dt, -38, 26);
    }
    if (fan > .04) {
      const avg = this.averageTemp();
      const rate = Math.min(.5, .028 * fan * dt);
      for (const z of this.zones) z.temp += (avg - z.temp) * rate;
    }
    if (cooling && !defrost) {
      const targetCoil = this.config.compressor.targetTemp - 8.5 - 4.5 * comp.load - 1.5 * fan;
      this.evapCoilTemp += (targetCoil - this.evapCoilTemp) * Math.min(1, dt / 26);
    } else {
      const warmTarget = defrost ? -1.5 : amb - 1;
      this.evapCoilTemp += (warmTarget - this.evapCoilTemp) * Math.min(1, dt / (defrost ? 8 : 220));
    }
  }

  updateHumidity(dt) {
    const cfg = this.config.humidity;
    const cooling = this.compressor.coolingEnabled && this.evaporator.fanFraction > .05 && this.defrostTimer <= 0;
    let d = 0;
    if (cooling && cfg.dehumidifier) d -= .0019 * this.evaporator.fanFraction * (this.humidity / 70);
    d += this.doors.openFraction * .022 * (this.ambientHumidity / 55);
    d += .00025 * (this.ambientHumidity - this.humidity);
    if (this.defrostTimer > 0) d += .018;
    this.humidity += d * dt;
    if (cfg.auto && cfg.sensorEnabled && cfg.dehumidifier && !this.manualMode) {
      this.humidity += (cfg.target - this.humidity) * .006 * dt;
    }
    this.humidity = clamp(this.humidity, 20, 99);
  }

  updateSensors() {
    for (const z of this.zones) this.setSensorValue(`zone-${z.id.toLowerCase()}-temp`, z.temp);
    this.setSensorValue('average-temperature', this.averageTemp());
    this.setSensorValue('room-humidity', this.humidity);
    const dstate = this.doors.state === 'CLOSED' ? 0 : this.doors.state === 'OPENING' ? 1 : this.doors.state === 'OPEN' ? 2 : 3;
    this.setSensorValue('door-state', dstate);
    this.setSensorValue('door-open-seconds', Math.min(3600, this.doors.openElapsed));
    this.setSensorValue('compressor-current', this.compressor.current);
    this.setSensorValue('evaporator-temp', this.evapCoilTemp);
    this.setSensorValue('ambient-temp', this.ambientTemp);
  }

  updateHeatmap() {
    if (!this.heatmap.length) return;
    if (!this._heatColor) this._heatColor = new THREE.Color();
    for (const h of this.heatmap) {
      tempColor(h.zone.temp, this._heatColor);
      h.mat.color.copy(this._heatColor);
      h.edgeMat.color.copy(this._heatColor);
      h.mat.opacity = .2 + clamp((h.zone.temp + 24) / 16, 0, 1) * .26;
    }
  }

  updateLightMood() {
    if (!this.lightingOn) return;
    if (!this._mood) {
      this._mood = new THREE.Color(0xcfe9ff);
      this._cool = new THREE.Color(0xcfe9ff);
      this._warm = new THREE.Color(0xffc27a);
      this._hot = new THREE.Color(0xff8a7a);
    }
    const cfg = this.config.lighting;
    const safe = this.threshold('safeTempC', -12);
    const crit = this.threshold('criticalTempC', -8);
    const danger = clamp((this.maxZoneTemp() - (safe - 3)) / Math.max(1, crit - (safe - 3)), 0, 1);
    const level = clamp((cfg.level ?? 100) / 100, .2, 1);
    this._mood.copy(this._cool);
    if (cfg.mood) {
      if (danger < .5) this._mood.lerp(this._warm, danger * .5);
      else { this._mood.copy(this._warm).lerp(this._hot, (danger - .5) * 2); }
    }
    for (const l of this.roomLights) {
      l.light.color.copy(this._mood);
      l.mat.emissive.copy(this._mood);
      l.light.intensity = l.base * level * (cfg.mood ? 1 + danger * .3 : 1);
      l.mat.emissiveIntensity = l.baseEmissive * level * (cfg.mood ? 1 + danger * .4 : 1);
    }
    if (this.doorLamp) {
      this.doorLamp.light.intensity = this.doorLamp.base * level;
      this.doorLamp.mat.emissiveIntensity = this.doorLamp.baseEmissive * level;
    }
  }

  updateChilledVisuals(dt) {
    const doorOpen = this.doors.openFraction;
    // strip curtains sway with air movement
    for (const c of this.stripCurtains) {
      c.mesh.rotation.x = Math.sin(this.simTime * 1.7 + c.phase) * .028 * (1 + doorOpen * 2.4);
    }
    // room mist drift
    if (this.mist) {
      const pos = this.mist.geometry.attributes.position;
      for (let i = 0; i < this.mistSeeds.length; i++) {
        const s = this.mistSeeds[i];
        let y = pos.getY(i) - s.speed * dt * (0.7 + doorOpen * 1.4);
        let x = pos.getX(i) + Math.sin(this.simTime * .4 + s.phase) * s.drift * dt;
        if (y < .25) { y = 3.9; x = ROOM.x0 + 1 + Math.random() * (ROOM.x1 - ROOM.x0 - 2); }
        pos.setX(i, clamp(x, ROOM.x0 + .5, ROOM.x1 - .5));
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      this.mist.material.opacity = .22 + this.evaporator.fanFraction * .16;
    }
    // door fog bank
    if (this.doorFog) {
      const pos = this.doorFog.geometry.attributes.position;
      for (let i = 0; i < this.fogSeeds.length; i++) {
        const s = this.fogSeeds[i];
        let z = pos.getZ(i) + s.speed * dt * (0.25 + doorOpen * 1.6);
        let y = pos.getY(i) + s.speed * .35 * dt * (0.2 + doorOpen);
        let x = pos.getX(i) + Math.sin(this.simTime * .8 + s.phase) * s.drift * dt;
        if (z > ROOM.z1 + 2.6) z = ROOM.z1 + .2;
        if (y > 2.8) y = .25;
        pos.setX(i, x); pos.setY(i, y); pos.setZ(i, z);
      }
      pos.needsUpdate = true;
      const targetOpacity = doorOpen * .55;
      this.doorFog.material.opacity += (targetOpacity - this.doorFog.material.opacity) * Math.min(1, dt * 3);
    }
    if (this.airCurtain) {
      const target = doorOpen * .38;
      this.airCurtain.material.opacity += (target - this.airCurtain.material.opacity) * Math.min(1, dt * 4);
      this.airCurtain.visible = this.airCurtain.material.opacity > .01;
    }
    // beacon / strobe
    const critical = !this.compressor.healthy || this.maxZoneTemp() > this.threshold('criticalTempC', -8) || this.spoilageRiskItems().length > 0;
    const warn = this.doors.isOpen || this.humidity > this.threshold('humidityHigh', 80);
    if (this.beaconTest > 0) this.beaconTest = Math.max(0, this.beaconTest - dt);
    if (this.beacon) {
      if (this.beaconTest > 0) this.beacon.userData.setLamps(false, Math.sin(this.simTime * 12) > 0, false);
      else this.beacon.userData.setLamps(critical ? Math.sin(this.simTime * 7) > 0 : false, warn && !critical, !critical && !warn);
    }
    if (this.strobeMat) this.strobeMat.emissiveIntensity = critical ? (Math.sin(this.simTime * 9) > 0 ? 2.4 : .1) : .12;
    // panel LEDs + humidity LED
    if (this.panelLeds) {
      this.panelLeds[0].emissiveIntensity = this.compressor.on ? 1.9 : .15;
      this.panelLeds[1].emissiveIntensity = warn ? 1.9 : .12;
      this.panelLeds[2].emissiveIntensity = critical ? (Math.sin(this.simTime * 8) > 0 ? 2.3 : .2) : .1;
    }
    if (this.humidityLed) {
      const col = this.humidity > this.threshold('humidityHigh', 80) ? 0xffb547 : 0x3ce58b;
      this.humidityLed.color.setHex(col);
      this.humidityLed.emissive.setHex(col);
    }
    if (this.pipeNeedle) this.pipeNeedle.rotation.z = -.5 + this.compressor.load * 1.3;
  }

  updateDisplays(dt) {
    this.displayAccum += dt;
    if (this.displayAccum < .7) return;
    this.displayAccum = 0;
    const avg = this.averageTemp();
    const target = this.config.compressor.targetTemp;
    const crit = this.maxZoneTemp() > this.threshold('criticalTempC', -8);
    const tone = crit ? '#ff6172' : this.maxZoneTemp() > this.threshold('safeTempC', -12) ? '#ffb547' : '#63e6ff';
    if (this.panelScreen) {
      this.panelScreen.update((ctx, w, h) => {
        ctx.fillStyle = '#04121a'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(70,190,200,.35)'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = '#7fe6dc'; ctx.font = '700 17px "Cascadia Mono", monospace';
        ctx.fillText('NEXUS · CP-01 CLIMATE', 18, 30);
        ctx.fillStyle = tone; ctx.font = '700 52px "Cascadia Mono", monospace';
        ctx.fillText(`${avg.toFixed(1)}°C`, 18, 92);
        ctx.fillStyle = '#8fb4c8'; ctx.font = '600 15px "Cascadia Mono", monospace';
        ctx.fillText(`SET ${target.toFixed(1)}°C`, 18, 122);
        ctx.fillText(`RH ${this.humidity.toFixed(0)}%`, 200, 122);
        const lines = [
          `COMP ${this.compressor.status}`,
          `DOOR ${this.doors.state}`,
          `LOAD ${Math.round(this.compressor.load * 100)}%  ${this.compressor.current.toFixed(1)}A`,
        ];
        ctx.font = '600 15px "Cascadia Mono", monospace';
        lines.forEach((line, i) => {
          ctx.fillStyle = i === 0 && !this.compressor.healthy ? '#ff6172' : '#8fd6ff';
          ctx.fillText(line, 18, 158 + i * 22);
        });
      });
    }
    if (this.displayScreen) {
      this.displayScreen.update((ctx, w, h) => {
        ctx.fillStyle = '#030d14'; ctx.fillRect(0, 0, w, h);
        const grd = ctx.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, 'rgba(8,30,42,.9)'); grd.addColorStop(1, 'rgba(3,10,16,.95)');
        ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(99,182,255,.4)'; ctx.lineWidth = 4; ctx.strokeRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = '#8fd6ff'; ctx.font = '700 22px "Cascadia Mono", monospace';
        ctx.fillText('COLD STORE 01', 22, 38);
        ctx.fillStyle = tone; ctx.font = '700 96px "Cascadia Mono", monospace';
        ctx.fillText(`${avg.toFixed(1)}°`, 22, 140);
        ctx.font = '700 30px "Cascadia Mono", monospace';
        ctx.fillText('C', 240, 136);
        ctx.fillStyle = '#9fdcff'; ctx.font = '600 19px "Cascadia Mono", monospace';
        ctx.fillText(`SETPOINT ${target.toFixed(1)} °C`, 22, 186);
        ctx.fillText(`HUMIDITY ${this.humidity.toFixed(0)} %`, 22, 214);
        ctx.fillStyle = this.doors.isOpen ? '#ffb547' : '#63e6a8';
        ctx.fillText(`DOOR ${this.doors.state}`, 300, 186);
        ctx.fillStyle = this.compressor.healthy ? (this.compressor.on ? '#63e6a8' : '#8fb4c8') : '#ff6172';
        ctx.fillText(`PLANT ${this.compressor.status}`, 300, 214);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = tempColor(this.zones[i].temp).getStyle();
          ctx.fillRect(300, 228 + i * 15, 10, 10);
          ctx.fillStyle = '#8fb4c8'; ctx.font = '600 13px "Cascadia Mono", monospace';
          ctx.fillText(`${this.zones[i].short} ${this.zones[i].temp.toFixed(1)}°`, 318, 238 + i * 15);
        }
      });
    }
    if (this.humidityScreen) {
      this.humidityScreen.update((ctx, w, h) => {
        ctx.fillStyle = '#04121a'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = 'rgba(70,190,200,.35)'; ctx.lineWidth = 2; ctx.strokeRect(3, 3, w - 6, h - 6);
        ctx.fillStyle = '#7fe6dc'; ctx.font = '600 13px "Cascadia Mono", monospace';
        ctx.fillText('HUMIDITY', 10, 20);
        ctx.fillStyle = '#9fe9ff'; ctx.font = '700 34px "Cascadia Mono", monospace';
        ctx.fillText(`${this.humidity.toFixed(0)}%`, 10, 58);
        ctx.fillStyle = '#8fb4c8'; ctx.font = '600 11px "Cascadia Mono", monospace';
        ctx.fillText(`TGT ${this.config.humidity.target}%`, 10, 84);
      });
    }
  }

  updateConsumption(dt) {
    const cfg = this.config.consumption;
    if (!cfg.enabled) return;
    this.consumptionAccum += dt;
    if (this.consumptionAccum < 20) return;
    this.consumptionAccum = 0;
    let changed = false;
    for (const item of this.inventory) {
      const dec = Math.min(item.qty, Math.max(0, Math.floor((.35 + (item.qty % 7) * .11) * (cfg.rate || 1))));
      if (dec > 0) { item.qty -= dec; changed = true; }
      if (cfg.restock && item.qty < 12) { item.qty += 80; changed = true; }
    }
    this._consumptionSave = (this._consumptionSave || 0) + 20;
    if (changed) { this.syncInventoryConfig(); this.refreshLive(); }
    if (this._consumptionSave >= 120) { this._consumptionSave = 0; this.saveSoon(); }
  }

  /* =========================================================
     Sensors, alarms, analytics
     ========================================================= */
  defineSensors() {
    const zoneSensor = (z) => ({
      id: `zone-${z.id.toLowerCase()}-temp`, name: `${z.name} Temperature`, unit: '°C',
      min: -38, max: 15, digits: 1, value: z.temp, iconName: 'thermometer', alarmLow: -30, alarmHigh: -10,
    });
    return [
      ...ZONES.map(zoneSensor),
      { id: 'average-temperature', name: 'Average Room Temperature', unit: '°C', min: -38, max: 15, digits: 1, value: -17.7, iconName: 'gauge', alarmLow: -30, alarmHigh: -12 },
      { id: 'room-humidity', name: 'Room Humidity', unit: '%', min: 0, max: 100, digits: 0, value: 71, iconName: 'droplet', alarmLow: 40, alarmHigh: 80 },
      { id: 'door-state', name: 'Door Position Index', unit: '', min: 0, max: 3, digits: 0, value: 0, iconName: 'door', alarmLow: -1, alarmHigh: 4 },
      { id: 'door-open-seconds', name: 'Door Open Duration', unit: 's', min: 0, max: 3600, digits: 0, value: 0, iconName: 'clock', alarmLow: -1, alarmHigh: 120 },
      { id: 'compressor-current', name: 'Compressor Current', unit: 'A', min: 0, max: 30, digits: 1, value: 4.2, iconName: 'bolt', alarmLow: -1, alarmHigh: 22 },
      { id: 'evaporator-temp', name: 'Evaporator Coil Temperature', unit: '°C', min: -40, max: 25, digits: 1, value: -27, iconName: 'fan', alarmLow: -40, alarmHigh: 0 },
      { id: 'ambient-temp', name: 'Outside Ambient Temperature', unit: '°C', min: -15, max: 55, digits: 1, value: 23.5, iconName: 'sun', alarmLow: -5, alarmHigh: 42 },
    ];
  }

  fmtTemp(t) { return `${ui.fmt(t, 1)} °C`; }

  zoneSensorsDisabled() {
    return this.zones.filter(z => !this.getSensor(`zone-${z.id.toLowerCase()}-temp`)?.enabled);
  }

  defineAlarmRules() {
    return [
      {
        id: 'temp-high', title: 'Cold Store Above Safe Temperature', severity: 'warning',
        thresholdKey: 'safeTempC', defaultThreshold: -12, thresholdLabel: 'Safe temperature', thresholdUnit: '°C',
        thresholdMin: -30, thresholdMax: 5, thresholdStep: .5,
        message: () => `Warmest zone has reached ${this.fmtTemp(this.maxZoneTemp())}, above the ${this.threshold('safeTempC', -12)} °C safe limit.`,
        active: () => this.maxZoneTemp() > this.threshold('safeTempC', -12),
      },
      {
        id: 'temp-critical', title: 'Cold Store Critical Temperature', severity: 'critical',
        thresholdKey: 'criticalTempC', defaultThreshold: -8, thresholdLabel: 'Critical temperature', thresholdUnit: '°C',
        thresholdMin: -20, thresholdMax: 15, thresholdStep: .5,
        message: () => `Thermal excursion: warmest zone at ${this.fmtTemp(this.maxZoneTemp())}. Cold-chain integrity at risk.`,
        active: () => this.maxZoneTemp() > this.threshold('criticalTempC', -8),
      },
      {
        id: 'door-open', title: 'Walk-in Door Open Too Long', severity: 'warning',
        thresholdKey: 'doorOpenSeconds', defaultThreshold: 120, thresholdLabel: 'Open alarm delay', thresholdUnit: 's',
        thresholdMin: 10, thresholdMax: 900, thresholdStep: 10,
        message: () => `Freezer door has been open for ${ui.fmtDuration(this.doors.openElapsed)}. Warm-air ingress is raising zone temperatures.`,
        active: () => this.doors.isOpen && this.doors.openElapsed > this.threshold('doorOpenSeconds', 120),
      },
      {
        id: 'compressor-failure', title: 'Refrigeration Compressor Failure', severity: 'critical',
        message: () => `Condensing unit is faulted (${this.compressor.restartTimer > 0 ? 'restart sequence running' : 'no cooling'}). All zones will drift warm.`,
        active: () => !this.compressor.healthy,
      },
      {
        id: 'humidity-high', title: 'Abnormally High Humidity', severity: 'warning',
        thresholdKey: 'humidityHigh', defaultThreshold: 80, thresholdLabel: 'High humidity limit', thresholdUnit: '%',
        thresholdMin: 50, thresholdMax: 99, thresholdStep: 1,
        message: () => `Room humidity is ${ui.fmt(this.humidity, 0)}%. Condensation and ice-build risk elevated.`,
        active: () => this.humidity > this.threshold('humidityHigh', 80),
      },
      {
        id: 'humidity-low', title: 'Abnormally Low Humidity', severity: 'warning',
        thresholdKey: 'humidityLow', defaultThreshold: 40, thresholdLabel: 'Low humidity limit', thresholdUnit: '%',
        thresholdMin: 10, thresholdMax: 70, thresholdStep: 1,
        message: () => `Room humidity has fallen to ${ui.fmt(this.humidity, 0)}%. Product dehydration risk.`,
        active: () => this.humidity < this.threshold('humidityLow', 40),
      },
      {
        id: 'sensor-failure', title: 'Thermal Sensor Failure', severity: 'critical',
        message: () => `Zone temperature telemetry is incomplete: ${this.zoneSensorsDisabled().map(z => z.short).join(', ') || 'sensor channel fault'}.`,
        active: () => this.faults.sensor || this.zoneSensorsDisabled().length > 0,
      },
      {
        id: 'spoilage', title: 'Cold-Chain Spoilage Risk', severity: 'warning',
        thresholdKey: 'spoilageToleranceC', defaultThreshold: .5, thresholdLabel: 'Spoilage tolerance', thresholdUnit: '°C',
        thresholdMin: 0, thresholdMax: 5, thresholdStep: .1,
        message: () => {
          const items = this.spoilageRiskItems();
          return items.length ? `${items.length} stock item(s) above required temperature: ${items.slice(0, 3).map(i => i.name).join(', ')}.` : 'Stock is outside its required temperature band.';
        },
        active: () => this.spoilageRiskItems().length > 0,
      },
    ];
  }

  getAnalyticsDefs() {
    return [
      { id: 'zone-a-temp', label: 'Zone A Temperature', unit: '°C', color: '#2f8bff', get: () => this.zones[0].temp, digits: 1 },
      { id: 'zone-b-temp', label: 'Zone B Temperature', unit: '°C', color: '#2ee6d0', get: () => this.zones[1].temp, digits: 1 },
      { id: 'zone-c-temp', label: 'Zone C Temperature', unit: '°C', color: '#ffb547', get: () => this.zones[2].temp, digits: 1 },
      { id: 'zone-d-temp', label: 'Zone D Temperature', unit: '°C', color: '#ff6172', get: () => this.zones[3].temp, digits: 1 },
      { id: 'average-temperature', label: 'Average Temperature', unit: '°C', color: '#36e2c2', get: () => this.averageTemp(), digits: 1 },
      { id: 'room-humidity', label: 'Room Humidity', unit: '%', color: '#46a9ff', get: () => this.humidity, digits: 0 },
      { id: 'compressor-current', label: 'Compressor Current', unit: 'A', color: '#a98bff', get: () => this.compressor.current, digits: 1 },
      { id: 'evaporator-temp', label: 'Evaporator Coil', unit: '°C', color: '#7fdcff', get: () => this.evapCoilTemp, digits: 1 },
      { id: 'ambient-temp', label: 'Ambient Temperature', unit: '°C', color: '#ffb547', get: () => this.ambientTemp, digits: 1 },
      { id: 'compressor-load', label: 'Compressor Load', unit: '%', color: '#ff6172', get: () => this.compressor.load * 100, digits: 0 },
    ];
  }

  primarySeriesIds() { return ['zone-a-temp', 'zone-b-temp', 'zone-c-temp', 'zone-d-temp']; }

  /* =========================================================
     Overview metrics & dashboard
     ========================================================= */
  getOverviewMetrics() {
    const tempTone = () => this.maxZoneTemp() > this.threshold('criticalTempC', -8) ? 'danger' : this.maxZoneTemp() > this.threshold('safeTempC', -12) ? 'warn' : 'ok';
    return [
      { label: 'Average Temperature', bind: () => ({ value: ui.fmt(this.averageTemp(), 1), unit: '°C', tone: tempTone(), sub: `Setpoint ${this.config.compressor.targetTemp} °C` }), iconName: 'thermometer', sub: 'Four-zone mean' },
      { label: 'Room Humidity', bind: () => ({ value: ui.fmt(this.humidity, 0), unit: '%', tone: this.humidity > this.threshold('humidityHigh', 80) || this.humidity < this.threshold('humidityLow', 40) ? 'warn' : 'ok', sub: `Target ${this.config.humidity.target}%` }), iconName: 'droplet', sub: 'Relative humidity' },
      { label: 'Door State', bind: () => ({ value: this.doors.state, tone: this.doors.isOpen ? 'warn' : 'ok', sub: this.doors.isOpen ? `Open ${ui.fmtDuration(this.doors.openElapsed)}` : 'Sealed' }), iconName: 'door', sub: 'Walk-in door' },
      { label: 'Compressor', bind: () => ({ value: this.compressor.status, tone: this.compressor.tone, sub: `${ui.fmt(this.compressor.current, 1)} A · ${Math.round(this.compressor.load * 100)}% load` }), iconName: 'compressor', sub: 'Condensing plant' },
      { label: 'Cooling Capacity', bind: () => ({ value: ui.fmt(this.compressor.load * 100, 0), unit: '%', tone: this.compressor.load > 92 ? 'warn' : 'ok', sub: this.evaporator.fanFraction > .1 ? 'Evaporator circulating' : 'Evaporator idle' }), iconName: 'fan', sub: 'Plant utilisation' },
      { label: 'Cold-Chain Stock', bind: () => ({ value: String(this.inventory.length), unit: 'items', tone: this.spoilageRiskItems().length ? 'danger' : 'ok', sub: `${this.spoilageRiskItems().length} at spoilage risk` }), iconName: 'inventory', sub: 'Inventory lots' },
    ];
  }

  overviewExtra(body) {
    const sec = el('div', { class: 'section' });
    const title = el('div', { class: 'section-title' });
    title.innerHTML = `${ui.icon('thermometer', 12).outerHTML} Thermal Zone Map <span class="side">LIVE</span>`;
    sec.appendChild(title);
    const grid = el('div', { class: 'metric-grid' });
    for (const z of this.zones) {
      const m = ui.metric({
        label: z.short, iconName: 'thermometer', compact: true,
        bind: () => ({
          value: ui.fmt(z.temp, 1), unit: '°C',
          tone: z.temp > this.threshold('criticalTempC', -8) ? 'danger' : z.temp > this.threshold('safeTempC', -12) ? 'warn' : 'ok',
        }),
      });
      grid.appendChild(m);
    }
    sec.appendChild(grid);
    // zone bars
    const bars = el('div', { class: 'section-card', style: { marginTop: '8px' } });
    const barFills = [];
    for (const z of this.zones) {
      const row = el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' } });
      row.appendChild(el('span', { style: { width: '52px', fontSize: '8.5px', color: 'var(--muted)', fontFamily: 'var(--mono)' }, text: z.short }));
      const bar = el('div', { class: 'progress', style: { flex: 1 } });
      const fill = el('span', { style: { width: '0%' } });
      bar.appendChild(fill);
      const val = el('span', { style: { width: '58px', textAlign: 'right', fontSize: '8.5px', fontFamily: 'var(--mono)' }, text: '—' });
      row.append(bar, val);
      bars.appendChild(row);
      barFills.push({ z, fill, val });
    }
    sec.appendChild(bars);
    this.addPanelBind(() => {
      for (const b of barFills) {
        const pct = clamp((b.z.temp + 26) / 18 * 100, 0, 100);
        b.fill.style.width = `${pct}%`;
        b.fill.style.background = tempColor(b.z.temp).getStyle();
        b.val.textContent = `${ui.fmt(b.z.temp, 1)}°`;
        b.val.style.color = b.z.temp > this.threshold('safeTempC', -12) ? 'var(--danger)' : 'var(--text-soft)';
      }
    });
    const legend = el('div', { class: 'help', style: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '7px' } });
    [['#2f8bff', '≤ -22 °C'], ['#2ee6d0', '-18 °C'], ['#ffb547', '-14 °C'], ['#ff4a5f', '≥ -9 °C']].forEach(([c, t]) => {
      const item = el('span', { style: { display: 'flex', alignItems: 'center', gap: '4px' } });
      item.append(el('i', { style: { width: '7px', height: '7px', borderRadius: '2px', background: c, display: 'inline-block' } }), t);
      legend.appendChild(item);
    });
    sec.appendChild(legend);
    body.appendChild(sec);

    // plant telemetry
    const plantSec = el('div', { class: 'section' });
    plantSec.appendChild(el('div', { class: 'section-title' }, ui.icon('compressor', 12), 'Refrigeration Plant'));
    const plantGrid = el('div', { class: 'metric-grid' });
    plantGrid.append(
      ui.metric({ label: 'Evap Coil', iconName: 'fan', compact: true, bind: () => ({ value: ui.fmt(this.evapCoilTemp, 1), unit: '°C', tone: this.evapCoilTemp > -10 ? 'warn' : 'ok' }) }),
      ui.metric({ label: 'Ambient', iconName: 'sun', compact: true, bind: () => ({ value: ui.fmt(this.ambientTemp, 1), unit: '°C' }) }),
      ui.metric({ label: 'Comp Current', iconName: 'bolt', compact: true, bind: () => ({ value: ui.fmt(this.compressor.current, 1), unit: 'A', tone: this.compressor.current > 20 ? 'warn' : 'ok' }) }),
      ui.metric({ label: 'Defrost', iconName: 'snowflake', compact: true, bind: () => ({ value: this.defrostTimer > 0 ? 'ACTIVE' : 'IDLE', tone: this.defrostTimer > 0 ? 'warn' : 'ok' }) }),
    );
    plantSec.appendChild(plantGrid);
    body.appendChild(plantSec);

    // door + cold chain
    const chainSec = el('div', { class: 'section' });
    chainSec.appendChild(el('div', { class: 'section-title' }, ui.icon('door', 12), 'Door Interlock'));
    const doorCard = el('div', { class: 'section-card' });
    const doorRow = el('div', { class: 'row spaced' });
    const doorBadgeWrap = el('div');
    const doorInfo = el('div', { class: 'help', text: '—' });
    doorRow.append(el('b', { style: { fontSize: '10.5px' }, text: 'Walk-in freezer door' }), doorBadgeWrap);
    doorCard.append(doorRow, doorInfo);
    this.addPanelBind(() => {
      ui.mount(doorBadgeWrap, ui.badge(this.doors.state, this.doors.isOpen ? 'warn' : 'ok'));
      doorInfo.textContent = this.doors.isOpen
        ? `Open for ${ui.fmtDuration(this.doors.openElapsed)} · ${this.doors.autoConfig.auto ? `auto-close in ${ui.fmtDuration(Math.max(0, this.doors.autoConfig.autoCloseDelay - this.doors.openElapsed))}` : 'manual hold'}`
        : `Sealed · ${this.doors.cycles} actuations · last open ${this.doors.lastOpenDuration ? ui.fmtDuration(this.doors.lastOpenDuration) : '—'}`;
    });
    chainSec.appendChild(doorCard);
    const riskWrap = el('div', { class: 'section-card', style: { marginTop: '6px', padding: '6px 10px', maxHeight: '150px', overflowY: 'auto' } });
    this.addPanelBind(() => {
      const risky = this.spoilageRiskItems();
      const expiring = this.inventory.filter(i => !risky.includes(i) && ['EXPIRING', 'EXPIRED'].includes(this.itemStatus(i)));
      ui.clear(riskWrap);
      if (!risky.length && !expiring.length) {
        riskWrap.appendChild(el('div', { class: 'help', style: { padding: '7px 2px' }, text: 'All cold-chain stock within required temperature band.' }));
        return;
      }
      for (const item of risky) riskWrap.appendChild(el('div', { class: 'kv-row' }, el('span', { class: 'k', text: `⚠ ${item.name}` }), el('span', { class: 'v danger', text: this.itemStatus(item) })));
      for (const item of expiring.slice(0, 4)) riskWrap.appendChild(el('div', { class: 'kv-row' }, el('span', { class: 'k', text: item.name }), el('span', { class: 'v warn', text: this.itemStatus(item) })));
    });
    chainSec.appendChild(riskWrap);
    body.appendChild(chainSec);
  }

  getQuickActions() {
    return [
      { label: 'Open Door', icon: 'door', variant: 'subtle', onClick: () => { this.doors.open('quick action'); this.refreshLive(); } },
      { label: 'Close Door', icon: 'door', onClick: () => { this.doors.close('quick action'); this.refreshLive(); } },
      { label: this.compressor.coolingEnabled ? 'Stop Compressor' : 'Start Compressor', icon: 'power', variant: this.compressor.coolingEnabled ? 'warn' : 'subtle', onClick: () => { this.compressor.coolingEnabled ? this.compressor.stop() : this.compressor.start(); this.refreshLive(); } },
      { label: 'Heat Map', icon: 'layers', onClick: () => { this.setHeatmapVisible(!this.config.heatmap); this.renderPanel(); } },
      { label: 'Inventory', icon: 'inventory', onClick: () => this.setTab('spawn') },
    ];
  }

  getLegend() {
    return [
      { color: '#2f8bff', label: 'Deep freeze ≤ -22 °C' },
      { color: '#2ee6d0', label: 'Nominal -18 °C' },
      { color: '#ffb547', label: 'Warm -14 °C' },
      { color: '#ff4a5f', label: 'Critical ≥ -9 °C' },
      { color: '#36e2c2', label: `Target ${this.config.compressor.targetTemp} °C` },
    ];
  }

  onSimulationStart() { this.logEvent('Refrigeration resumed', 'Compressor and thermal model running.', 'ok'); }
  onSimulationStop() { this.logEvent('Refrigeration suspended', 'Simulation stopped by operator.', 'warn'); }

  /* =========================================================
     Object inspectors
     ========================================================= */
  getObjectInspector(obj) {
    switch (obj.kind) {
      case 'door': return this.doorInspector(obj);
      case 'compressor': return this.compressorInspector(obj);
      case 'evaporator': return this.evaporatorInspector(obj);
      case 'panel': return this.panelInspector(obj);
      case 'display': return this.displayInspector(obj);
      case 'humidity': return this.humidityInspector(obj);
      case 'beacon': return this.beaconInspector(obj);
      case 'light': return this.lightInspector(obj);
      case 'shelf': return this.shelfInspector(obj);
      case 'item': return this.itemInspector(obj);
      case 'heatmap': return this.heatmapInspector(obj);
      case 'pipes': return this.pipeInspector(obj);
      default: return this.defaultInspector(obj);
    }
  }

  doorInspector() {
    const d = this.doors;
    const cfg = this.config.door;
    const controls = [
      { type: 'button', label: 'Open Door', variant: 'subtle', iconName: 'door', onClick: () => { d.open(); this.refreshInspector(); } },
      { type: 'button', label: 'Close Door', iconName: 'door', onClick: () => { d.close(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Automatic close', description: 'Presence sensor closes the door after the configured delay.', value: !!cfg.auto, onChange: v => { cfg.auto = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Safety sensor enabled', description: 'Disabling suspends auto-close and the door duration channel.', value: !!cfg.sensorEnabled, onChange: v => {
        cfg.sensorEnabled = v;
        this.setSensorEnabled('door-state', v);
        this.setSensorEnabled('door-open-seconds', v);
        this.saveSoon(); this.refreshInspector();
      } },
      { type: 'slider', label: 'Opening speed', min: .2, max: 3, step: .05, value: cfg.openSpeed, unit: 'rad/s', onInput: v => { cfg.openSpeed = v; this.saveSoon(); } },
      { type: 'slider', label: 'Closing speed', min: .2, max: 3, step: .05, value: cfg.closeSpeed, unit: 'rad/s', onInput: v => { cfg.closeSpeed = v; this.saveSoon(); } },
      { type: 'slider', label: 'Auto-close delay', min: 2, max: 180, step: 2, value: cfg.autoCloseDelay, unit: 's', onInput: v => { cfg.autoCloseDelay = v; this.saveSoon(); } },
      { type: 'notice', text: 'Door-open duration drives warm-air ingress into the thermal model. Zone C warms fastest.', tone: 'info' },
    ];
    return {
      title: 'Walk-in Freezer Door',
      subtitle: 'ENVELOPE · HINGED INSULATED DOOR',
      iconName: 'door',
      badge: () => ({ text: d.state, tone: d.isOpen ? 'warn' : 'ok' }),
      fields: [
        { label: 'Door state', get: () => d.state },
        { label: 'Leaf angle', get: () => `${Math.round(d.angle * 180 / Math.PI)}°` },
        { label: 'Open duration', get: () => ui.fmtDuration(d.openElapsed) },
        { label: 'Last open duration', get: () => d.lastOpenDuration ? ui.fmtDuration(d.lastOpenDuration) : '—' },
        { label: 'Actuation cycles', get: () => String(d.cycles) },
        { label: 'Presence sensor', get: () => cfg.sensorEnabled ? 'ACTIVE' : 'DISABLED' },
        { label: 'Warm-air ingress', get: () => `${Math.round(d.openFraction * 100)}%` },
        { label: 'Average room temperature', get: () => this.fmtTemp(this.averageTemp()) },
      ],
      sections: [{ title: 'Door Controls', controls }],
      note: 'The door animates physically on its hinge. Manual mode suspends automatic closing.',
    };
  }

  compressorInspector() {
    const c = this.compressor;
    const cfg = this.config.compressor;
    const controls = [
      { type: 'toggle', label: 'Compressor power', description: 'Energise the condensing unit.', value: !!cfg.on, onChange: v => { v ? c.start() : c.stop(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Automatic cooling', description: 'Regulate load from average room temperature and door state.', value: !!cfg.auto, onChange: v => { cfg.auto = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'Manual cooling intensity', min: 5, max: 100, step: 1, value: cfg.intensity, unit: '%', onInput: v => { cfg.intensity = v; this.saveSoon(); } },
      { type: 'slider', label: 'Target temperature', min: -28, max: -6, step: .5, value: cfg.targetTemp, unit: '°C', onInput: v => { cfg.targetTemp = v; this.saveSoon(); } },
      { type: 'slider', label: 'Compressor speed', min: 10, max: 100, step: 1, value: cfg.speed, unit: '%', onInput: v => { cfg.speed = v; this.saveSoon(); } },
      { type: 'toggle', label: 'Liquid line service valve', description: 'Isolating the liquid line stops cooling while the compressor runs.', value: !!cfg.liquidValve, onChange: v => { cfg.liquidValve = v; this.logEvent(v ? 'Liquid line opened' : 'Liquid line isolated', v ? 'Refrigerant flow restored.' : 'Cooling suspended at service valve.', v ? 'ok' : 'warn'); this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Simulate compressor failure', description: 'Trips the plant; restart required.', value: !this.faults.compressor, onChange: v => { if (!v) c.injectFault('operator test trip'); else { this.faults.compressor = false; cfg.on = true; this.logEvent('Compressor fault cleared', 'Plant fault reset by operator.', 'ok'); this.evaluateAlarms(); } this.refreshInspector(); } },
      { type: 'button', label: 'Restart Compressor (4.5 s)', variant: 'warn', iconName: 'restart', onClick: () => { c.restart(); this.refreshInspector(); } },
      { type: 'button', label: 'Emergency Cooling', variant: 'subtle', iconName: 'snowflake', onClick: () => { cfg.on = true; cfg.auto = false; cfg.intensity = 100; cfg.targetTemp = -22; this.faults.compressor = false; this.saveSoon(); this.logEvent('Emergency cooling', 'Manual full-load cooling engaged at -22 °C target.', 'warn'); this.evaluateAlarms(); this.refreshInspector(); } },
    ];
    return {
      title: 'Condensing Unit CU-01',
      subtitle: 'REFRIGERATION PLANT · AIR-COOLED CONDENSER',
      iconName: 'compressor',
      badge: () => ({ text: c.status, tone: c.tone }),
      fields: [
        { label: 'Status', get: () => c.status },
        { label: 'Control mode', get: () => cfg.auto ? (this.manualMode ? 'AUTO (global manual)' : 'AUTOMATIC') : 'MANUAL' },
        { label: 'Cooling load', get: () => `${ui.fmt(c.load * 100, 0)} %` },
        { label: 'Current draw', get: () => `${ui.fmt(c.current, 1)} A` },
        { label: 'Suction pressure', get: () => `${ui.fmt(1.05 + c.load * .55, 2)} bar` },
        { label: 'Discharge pressure', get: () => `${ui.fmt(8.6 + c.load * 6.4, 2)} bar` },
        { label: 'Evaporator coil', get: () => this.fmtTemp(this.evapCoilTemp) },
        { label: 'Condenser fan', get: () => `${Math.round(c.rpm)} rpm` },
        { label: 'Runtime', get: () => ui.fmtDuration(c.runtime) },
        { label: 'Start count', get: () => String(c.starts) },
      ],
      sections: [{ title: 'Compressor Controls', controls }],
      note: 'The fan, vibration and refrigerant lines are animated from the live compressor state. Failure stops all cooling until restart.',
    };
  }

  evaporatorInspector() {
    const ev = this.evaporator;
    const cfg = this.config.compressor;
    const controls = [
      { type: 'slider', label: 'Evaporator fan speed', min: 20, max: 100, step: 1, value: cfg.fanSpeed, unit: '%', onInput: v => { cfg.fanSpeed = v; this.saveSoon(); } },
      { type: 'toggle', label: 'Automatic defrost', description: 'Initiates a defrost cycle when coil frost reaches 82%.', value: !!this.config.defrost.auto, onChange: v => { this.config.defrost.auto = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'button', label: 'Start Defrost Cycle', variant: 'subtle', iconName: 'snowflake', onClick: () => { this.startDefrost('operator'); this.refreshInspector(); } },
      { type: 'button', label: 'Inspect Condensing Unit', iconName: 'compressor', onClick: () => this.selectObject('compressor') },
      { type: 'button', label: 'Inspect Refrigerant Manifold', iconName: 'valve', onClick: () => this.selectObject('pipe-header') },
    ];
    return {
      title: 'Evaporator Unit EVAP-02',
      subtitle: 'CEILING COIL & FAN UNIT',
      iconName: 'fan',
      badge: () => ({ text: this.defrostTimer > 0 ? 'DEFROST' : ev.fanFraction > .1 ? 'CIRCULATING' : 'IDLE', tone: this.defrostTimer > 0 ? 'warn' : ev.fanFraction > .1 ? 'ok' : 'muted' }),
      fields: [
        { label: 'Fan output', get: () => `${Math.round(ev.fanFraction * 100)} %` },
        { label: 'Fan speed setting', value: `${cfg.fanSpeed} %` },
        { label: 'Coil temperature', get: () => this.fmtTemp(this.evapCoilTemp) },
        { label: 'Coil frost level', get: () => `${Math.round(ev.frostLevel * 100)} %` },
        { label: 'Defrost state', get: () => this.defrostTimer > 0 ? `ACTIVE · ${Math.ceil(this.defrostTimer)} s` : 'IDLE' },
        { label: 'Air circulation', get: () => `${ui.fmt(ev.fanFraction * 1500, 0)} m³/h` },
        { label: 'Drain', get: () => 'Condensate tray → floor drain' },
      ],
      sections: [{ title: 'Evaporator Controls', controls }],
      note: 'The evaporator distributes cooling to all four zones; higher fan speed improves mixing and equalises zone temperatures.',
    };
  }

  panelInspector() {
    return {
      title: 'Climate Controller CP-01',
      subtitle: 'MASTER REFRIGERATION & INTERLOCK CONTROLLER',
      iconName: 'panel',
      badge: () => ({ text: this.getRunState(), tone: this.getRunState() === 'RUNNING' ? 'ok' : 'warn' }),
      fields: [
        { label: 'Controller', value: 'CP-01 · NEXUS thermal node' },
        { label: 'Control mode', get: () => this.manualMode ? 'MANUAL' : 'AUTOMATIC' },
        { label: 'Average temperature', get: () => this.fmtTemp(this.averageTemp()) },
        { label: 'Setpoint', get: () => `${this.config.compressor.targetTemp} °C` },
        { label: 'Room humidity', get: () => `${ui.fmt(this.humidity, 0)} %` },
        { label: 'Door', get: () => this.doors.state },
        { label: 'Compressor', get: () => this.compressor.status },
        { label: 'Active alarms', get: () => String(this.getActiveAlarms().length) },
        { label: 'Heat map overlay', get: () => this.config.heatmap ? 'ENABLED' : 'HIDDEN' },
      ],
      sections: [{
        title: 'Controller Controls', controls: [
          { type: 'slider', label: 'Temperature setpoint', min: -28, max: -6, step: .5, value: this.config.compressor.targetTemp, unit: '°C', onInput: v => { this.config.compressor.targetTemp = v; this.saveSoon(); } },
          { type: 'toggle', label: 'Automatic cooling', value: !!this.config.compressor.auto, onChange: v => { this.config.compressor.auto = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Automatic door close', value: !!this.config.door.auto, onChange: v => { this.config.door.auto = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Automatic humidity regulation', value: !!this.config.humidity.auto, onChange: v => { this.config.humidity.auto = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Global manual mode', description: 'Suspends all automatic regulation loops.', value: this.manualMode, onChange: v => { this.setManual(v); this.refreshInspector(); } },
          { type: 'toggle', label: 'Heat map overlay', value: this.config.heatmap !== false, onChange: v => this.setHeatmapVisible(v) },
          { type: 'button', label: 'Open Door', variant: 'subtle', iconName: 'door', onClick: () => { this.doors.open('controller'); this.refreshInspector(); } },
          { type: 'button', label: 'Close Door', iconName: 'door', onClick: () => { this.doors.close('controller'); this.refreshInspector(); } },
          { type: 'button', label: 'Open Operations Panel', iconName: 'sliders', onClick: () => this.setTab('operations') },
        ],
      }],
      note: 'CP-01 coordinates the compressor, door interlock and humidity controller. All controls act on the live thermodynamic model.',
    };
  }

  displayInspector() {
    return {
      title: 'Room Temperature Display',
      subtitle: 'EXTERIOR LED CLIMATE BOARD',
      iconName: 'thermometer',
      badge: () => ({ text: this.config.displayOn ? 'DISPLAY ON' : 'DISPLAY OFF', tone: this.config.displayOn ? 'ok' : 'muted' }),
      fields: [
        { label: 'Average temperature', get: () => this.fmtTemp(this.averageTemp()) },
        { label: 'Setpoint', get: () => `${this.config.compressor.targetTemp} °C` },
        { label: 'Door state', get: () => this.doors.state },
        { label: 'Humidity', get: () => `${ui.fmt(this.humidity, 0)} %` },
        { label: 'Plant status', get: () => this.compressor.status },
        { label: 'Brightness', get: () => `${this.config.displayBrightness} %` },
      ],
      sections: [{
        title: 'Display Controls', controls: [
          { type: 'toggle', label: 'Display enabled', value: this.config.displayOn !== false, onChange: v => { this.config.displayOn = v; this.displayBoard.visible = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'slider', label: 'Display brightness', min: 10, max: 100, step: 1, value: this.config.displayBrightness ?? 100, unit: '%', onInput: v => { this.config.displayBrightness = v; this.updateDisplayBrightness(); this.saveSoon(); } },
          { type: 'slider', label: 'Temperature setpoint', min: -28, max: -6, step: .5, value: this.config.compressor.targetTemp, unit: '°C', onInput: v => { this.config.compressor.targetTemp = v; this.saveSoon(); } },
        ],
      }],
      note: 'The board reads directly from the simulation engine and refreshes continuously.',
    };
  }

  humidityInspector() {
    const cfg = this.config.humidity;
    const dew = this.averageTemp() - (100 - this.humidity) / 5;
    return {
      title: 'Humidity Control Unit HC-01',
      subtitle: 'CONDENSATION & MOISTURE MANAGER',
      iconName: 'droplet',
      badge: () => ({ text: cfg.auto && !this.manualMode ? 'AUTO' : 'MANUAL', tone: cfg.auto || this.manualMode ? 'ok' : 'warn' }),
      fields: [
        { label: 'Room humidity', get: () => `${ui.fmt(this.humidity, 0)} %` },
        { label: 'Target humidity', value: `${cfg.target} %` },
        { label: 'Humidity sensor', get: () => cfg.sensorEnabled ? 'ACTIVE' : 'DISABLED' },
        { label: 'Dehumidification', get: () => cfg.dehumidifier ? 'ENABLED' : 'DISABLED' },
        { label: 'Condensate risk', get: () => `${ui.fmt(dew, 1)} °C dew point` },
        { label: 'Door moisture ingress', get: () => this.doors.isOpen ? 'ACTIVE' : 'SEALED' },
      ],
      sections: [{
        title: 'Humidity Controls', controls: [
          { type: 'toggle', label: 'Automatic humidity regulation', value: !!cfg.auto, onChange: v => { cfg.auto = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'slider', label: 'Target humidity', min: 35, max: 90, step: 1, value: cfg.target, unit: '%', onInput: v => { cfg.target = v; this.saveSoon(); } },
          { type: 'toggle', label: 'Humidity sensor enabled', value: !!cfg.sensorEnabled, onChange: v => { cfg.sensorEnabled = v; this.setSensorEnabled('room-humidity', v); this.saveSoon(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Dehumidifier enabled', value: !!cfg.dehumidifier, onChange: v => { cfg.dehumidifier = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'button', label: 'Inspect Room Humidity Sensor', iconName: 'sensor', onClick: () => this.selectObject('sensor.room-humidity') },
        ],
      }],
      note: 'Humidity rises with door openings and falls when the cold evaporator coil condenses moisture.',
    };
  }

  beaconInspector() {
    return {
      title: 'Safety Alarm Beacon',
      subtitle: 'FACILITY ALARM ANNUNCIATION',
      iconName: 'alert',
      badge: () => {
        const critical = !this.compressor.healthy || this.maxZoneTemp() > this.threshold('criticalTempC', -8);
        return { text: critical ? 'ALARM' : this.doors.isOpen ? 'CAUTION' : 'NOMINAL', tone: critical ? 'danger' : this.doors.isOpen ? 'warn' : 'ok' };
      },
      fields: [
        { label: 'Beacon enabled', get: () => this.config.beaconOn !== false ? 'YES' : 'NO' },
        { label: 'Active alarms', get: () => String(this.getActiveAlarms().length) },
        { label: 'Critical alarms', get: () => String([...this.activeAlarms.values()].filter(a => a.severity === 'critical').length) },
        { label: 'Compressor', get: () => this.compressor.status },
        { label: 'Door', get: () => this.doors.state },
        { label: 'Warmest zone', get: () => this.fmtTemp(this.maxZoneTemp()) },
      ],
      sections: [{
        title: 'Beacon Controls', controls: [
          { type: 'toggle', label: 'Beacon annunciation', description: 'Enable or mute the stack beacon.', value: this.config.beaconOn !== false, onChange: v => { this.config.beaconOn = v; this.beacon.visible = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'button', label: 'Test Beacon (8 s)', iconName: 'alert', onClick: () => { this.beaconTest = 8; this.logEvent('Beacon test', 'Alarm beacon test sequence activated.', 'warn'); this.refreshInspector(); } },
          { type: 'button', label: 'Acknowledge All Alarms', iconName: 'check', onClick: () => { this.acknowledgeAllAlarms(); this.refreshInspector(); } },
        ],
      }],
      note: 'Green = nominal, amber = door open or warning, red flashing = critical alarm.',
    };
  }

  lightInspector(obj) {
    const idx = parseInt(String(obj.id).replace('light-', ''), 10) || 1;
    return {
      title: obj.label || `Cold Room Light L-${idx}`,
      subtitle: 'SEALED IP65 COLD-ROOM LUMINAIRE',
      iconName: 'light',
      badge: () => ({ text: this.lightingOn ? 'ENERGISED' : 'OFFLINE', tone: this.lightingOn ? 'ok' : 'warn' }),
      fields: [
        { label: 'Circuit', value: 'LED-C1 · 230 V' },
        { label: 'Output', get: () => this.lightingOn ? `${this.config.lighting.level}%` : '0%' },
        { label: 'Thermal mood response', get: () => this.config.lighting.mood ? 'ENABLED' : 'FIXED' },
        { label: 'Warmest zone', get: () => this.fmtTemp(this.maxZoneTemp()) },
        { label: 'Control', value: 'CP-01 automatic + manual override' },
      ],
      sections: [{
        title: 'Lighting Controls', controls: [
          { type: 'toggle', label: 'Lighting circuit energised', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.saveSoon(); this.refreshInspector(); this.renderPanel(); } },
          { type: 'slider', label: 'Circuit brightness', min: 20, max: 100, step: 1, value: this.config.lighting.level ?? 100, unit: '%', onInput: v => { this.config.lighting.level = v; this.updateLightMood(); this.saveSoon(); } },
          { type: 'toggle', label: 'Thermal mood response', description: 'Shift light colour warm as zone temperature rises.', value: this.config.lighting.mood !== false, onChange: v => { this.config.lighting.mood = v; this.updateLightMood(); this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
      note: 'Lighting is visual only — it never affects the thermal model.',
    };
  }

  shelfInspector(obj) {
    const rackId = String(obj.id).replace('shelf-', '');
    const rack = this.racks.find(r => r.id === rackId);
    if (!rack) return this.defaultInspector(obj);
    const zone = this.zoneById(rack.zone);
    const items = this.inventory.filter(i => i.zone === rack.zone);
    const list = el('div', { class: 'kv-list' });
    if (!items.length) list.appendChild(el('div', { class: 'help', style: { padding: '6px 2px' }, text: 'No stock assigned to this rack.' }));
    for (const item of items) {
      const row = el('div', { class: 'equip-row', style: { cursor: 'pointer' } });
      const icEl = el('div', { class: 'ic' }); icEl.innerHTML = ui.icon(ITEM_CATEGORIES[item.category]?.icon || 'package', 13).outerHTML;
      const status = this.itemStatus(item);
      const tone = status === 'OK' ? 'ok' : status === 'EXPIRING' ? 'warn' : 'danger';
      row.append(icEl, el('div', { class: 'tt' }, el('b', { text: item.name }), el('span', { text: `${item.id} · ${item.qty} units · ${item.location || rack.label}` })), el('span', { class: `state ${tone}`, text: status }));
      row.addEventListener('click', () => { if (item.objectId) this.selectObject(item.objectId); });
      list.appendChild(row);
    }
    const controls = [
      { type: 'html', node: list },
      { type: 'button', label: 'Add Sample Lot', variant: 'subtle', iconName: 'plus', onClick: () => {
        const cat = this.inventory.find(i => i.zone === rack.zone)?.category || 'frozen';
        const item = this.addInventoryItem({ name: `${ITEM_CATEGORIES[cat].label} Lot ${Math.floor(Math.random() * 900 + 100)}`, category: cat, qty: 40 + Math.floor(Math.random() * 120), zone: rack.zone, requiredTemp: ITEM_CATEGORIES[cat].required, expiration: dayKey(40 + Math.floor(Math.random() * 300)) });
        if (item) { this.renderInspector(); this.renderPanel(); }
      } },
      { type: 'button', label: 'Clear Rack Stock', variant: 'danger', iconName: 'trash', onClick: () => {
        const ids = this.inventory.filter(i => i.zone === rack.zone).map(i => i.id);
        if (!ids.length) { ui.toast('Rack already empty.', { type: 'info' }); return; }
        for (const id of ids) { const idx = this.inventory.findIndex(i => i.id === id); if (idx >= 0) this.inventory.splice(idx, 1); }
        this.buildInventoryVisuals();
        this.logEvent('Rack cleared', `${rack.label} stock removed.`, 'warn');
        this.saveSoon(); this.renderInspector(); this.renderPanel();
      } },
    ];
    return {
      title: rack.name,
      subtitle: `STORAGE RACK · ZONE ${rack.zone}`,
      iconName: 'inventory',
      badge: () => ({ text: `${items.length}/12 LOTS`, tone: items.length >= 12 ? 'warn' : 'ok' }),
      fields: [
        { label: 'Rack', value: `${rack.label} · ${rack.name}` },
        { label: 'Zone', value: `Zone ${rack.zone} · ${zone?.name || ''}` },
        { label: 'Zone temperature', get: () => this.fmtTemp(zone?.temp ?? this.averageTemp()) },
        { label: 'Stock lots', get: () => `${items.length} / 12` },
        { label: 'Total units', get: () => String(items.reduce((a, i) => a + i.qty, 0)) },
        { label: 'Spoilage risk lots', get: () => String(items.filter(i => this.itemStatus(i) === 'SPOILAGE RISK').length) },
      ],
      sections: [{ title: 'Rack Contents', controls }],
      note: 'Each rack serves one thermal zone. Add, inspect or clear lots; items appear physically on the shelves.',
    };
  }

  itemInspector(obj) {
    const item = this.inventory.find(i => obj.id === `item.${i.id}`);
    if (!item) return this.defaultInspector(obj);
    const cat = ITEM_CATEGORIES[item.category] || ITEM_CATEGORIES.frozen;
    const status = this.itemStatus(item);
    const tone = status === 'OK' ? 'ok' : status === 'EXPIRING' ? 'warn' : 'danger';
    const controls = [
      { type: 'number', label: 'Quantity', unit: 'units', min: 0, max: 5000, step: 1, value: item.qty, onChange: v => { item.qty = Math.max(0, Math.round(v)); this.syncInventoryConfig(); this.saveSoon(); this.refreshInspector(); this.renderPanel?.(); } },
      { type: 'number', label: 'Required max temperature', unit: '°C', min: -30, max: 10, step: .5, value: item.requiredTemp, onChange: v => { item.requiredTemp = v; this.syncInventoryConfig(); this.saveSoon(); this.refreshInspector(); } },
      { type: 'select', label: 'Assigned zone', options: this.zones.map(z => ({ value: z.id, label: `${z.short} · ${z.name}` })), value: item.zone, onChange: v => { item.zone = v; this.buildInventoryVisuals(); this.saveSoon(); this.refreshInspector(); } },
      { type: 'text', label: 'Expiration (YYYY-MM-DD)', value: item.expiration, onChange: v => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) item.expiration = v; this.syncInventoryConfig(); this.saveSoon(); this.refreshInspector(); } },
      { type: 'select', label: 'Category', options: ITEM_CATEGORY_OPTIONS, value: item.category, onChange: v => { item.category = v; this.buildInventoryVisuals(); this.saveSoon(); this.refreshInspector(); } },
      { type: 'button', label: 'Inspect Assigned Rack', iconName: 'inventory', onClick: () => { const rack = this.racks.find(r => r.zone === item.zone); if (rack) this.selectObject(`shelf-${rack.id}`); } },
      { type: 'button', label: 'Remove From Cold Chain', variant: 'danger', iconName: 'trash', onClick: () => { this.removeInventoryItem(item.id); this.closeInspector(); } },
    ];
    return {
      title: item.name,
      subtitle: `COLD-CHAIN LOT · ${cat.label.toUpperCase()}`,
      iconName: cat.icon || 'package',
      badge: () => ({ text: this.itemStatus(item), tone }),
      fields: [
        { label: 'Stock code', value: item.id },
        { label: 'Category', value: cat.label },
        { label: 'Quantity', get: () => `${item.qty} units` },
        { label: 'Location', get: () => item.location || 'Staging floor' },
        { label: 'Zone temperature', get: () => this.fmtTemp(this.itemZoneTemp(item)) },
        { label: 'Required max', value: `${item.requiredTemp} °C` },
        { label: 'Expiration', value: item.expiration },
        { label: 'Days to expiry', get: () => String(this.daysToExpiry(item)) },
        { label: 'Status', get: () => this.itemStatus(item) },
      ],
      sections: [{ title: 'Lot Controls', controls }],
      note: 'Spoilage risk is raised when the assigned zone exceeds the required temperature plus tolerance.',
    };
  }

  heatmapInspector(obj) {
    const zoneId = String(obj.id).replace('heatmap-zone-', '').toUpperCase();
    const zone = this.zoneById(zoneId);
    if (!zone) return this.defaultInspector(obj);
    const cfg = this.config.zones[zoneId] || (this.config.zones[zoneId] = { damper: 1 });
    const zoneItems = this.inventory.filter(i => i.zone === zoneId);
    return {
      title: `${zone.name} Heat Map`,
      subtitle: `THERMAL OVERLAY · ZONE ${zoneId}`,
      iconName: 'thermometer',
      badge: () => ({ text: `${ui.fmt(zone.temp, 1)} °C`, tone: zone.temp > this.threshold('criticalTempC', -8) ? 'danger' : zone.temp > this.threshold('safeTempC', -12) ? 'warn' : 'ok' }),
      fields: [
        { label: 'Zone', value: `${zone.short} · ${zone.name}` },
        { label: 'Live temperature', get: () => this.fmtTemp(zone.temp) },
        { label: 'Master setpoint', get: () => `${this.config.compressor.targetTemp} °C` },
        { label: 'Deviation', get: () => `${ui.fmt(zone.temp - this.config.compressor.targetTemp, 1)} °C` },
        { label: 'Zone stock lots', get: () => String(zoneItems.length) },
        { label: 'Airflow damper', get: () => `${Math.round((cfg.damper ?? 1) * 100)} %` },
        { label: 'Heat map overlay', get: () => this.config.heatmap ? 'VISIBLE' : 'HIDDEN' },
      ],
      sections: [{
        title: 'Zone Controls', controls: [
          { type: 'slider', label: 'Zone airflow damper', min: .3, max: 1.3, step: .01, value: cfg.damper ?? 1, unit: '×', onInput: v => { cfg.damper = v; this.saveSoon(); } },
          { type: 'toggle', label: 'Heat map overlay', value: this.config.heatmap !== false, onChange: v => this.setHeatmapVisible(v) },
          { type: 'button', label: 'Inspect Zone Sensor', iconName: 'sensor', onClick: () => this.selectObject(`sensor.zone-${zoneId.toLowerCase()}-temp`) },
          { type: 'button', label: 'Open Zone Inventory', iconName: 'inventory', onClick: () => this.setTab('spawn') },
        ],
      }],
      note: 'The floor overlay colour is computed from the live zone temperature. Adjusting the damper changes cold-air distribution.',
    };
  }

  pipeInspector() {
    const cfg = this.config.compressor;
    return {
      title: 'Refrigerant Service Manifold',
      subtitle: 'CIRCUIT R-449A · LIQUID / SUCTION',
      iconName: 'valve',
      badge: () => ({ text: cfg.liquidValve ? 'CIRCULATING' : 'ISOLATED', tone: cfg.liquidValve ? 'ok' : 'warn' }),
      fields: [
        { label: 'Refrigerant', value: 'R-449A · 4.2 kg charge' },
        { label: 'Liquid line valve', get: () => cfg.liquidValve ? 'OPEN' : 'CLOSED' },
        { label: 'Suction pressure', get: () => `${ui.fmt(1.05 + this.compressor.load * .55, 2)} bar` },
        { label: 'Discharge pressure', get: () => `${ui.fmt(8.6 + this.compressor.load * 6.4, 2)} bar` },
        { label: 'Liquid line temperature', get: () => this.fmtTemp(this.ambientTemp - 6) },
        { label: 'Evaporator coil', get: () => this.fmtTemp(this.evapCoilTemp) },
        { label: 'Superheat', get: () => `${ui.fmt(5.2 + this.compressor.load * 2.6, 1)} K` },
      ],
      sections: [{
        title: 'Circuit Controls', controls: [
          { type: 'toggle', label: 'Liquid line service valve', description: 'Isolating the circuit stops cooling.', value: !!cfg.liquidValve, onChange: v => { cfg.liquidValve = v; this.logEvent(v ? 'Liquid line opened' : 'Liquid line isolated', v ? 'Refrigerant flow restored.' : 'Cooling suspended at service valve.', v ? 'ok' : 'warn'); this.saveSoon(); this.refreshInspector(); } },
          { type: 'button', label: 'Start Defrost Cycle', variant: 'subtle', iconName: 'snowflake', onClick: () => { this.startDefrost('manifold'); this.refreshInspector(); } },
          { type: 'button', label: 'Inspect Compressor', iconName: 'compressor', onClick: () => this.selectObject('compressor') },
        ],
      }],
      note: 'The manifold gauge needle tracks compressor load. Isolating the liquid line suspends cooling without stopping the compressor.',
    };
  }

  updateDisplayBrightness() {
    const b = clamp((this.config.displayBrightness ?? 100) / 100, .1, 1);
    if (this.displayScreenMat) this.displayScreenMat.color.setScalar(b);
    if (this.panelScreenMat) this.panelScreenMat.color.setScalar(Math.max(.45, b));
    if (this.displayBoard) this.displayBoard.visible = this.config.displayOn !== false;
  }

  /* =========================================================
     Operations panel
     ========================================================= */
  buildOperations(container) {
    const comp = this.compressor;
    const dcfg = this.config.compressor;
    const doorCfg = this.config.door;
    const hcfg = this.config.humidity;

    const notice = el('div', { class: 'notice' });
    notice.innerHTML = `${ui.icon('info', 13).outerHTML}<span>Refrigeration, door, humidity and zone controls act directly on the live thermal model. Readings update in the 3D environment and dashboards.</span>`;
    container.appendChild(notice);

    /* --- refrigeration plant --- */
    const plantSec = el('div', { class: 'section' });
    const plantTitle = el('div', { class: 'section-title' });
    plantTitle.innerHTML = `${ui.icon('compressor', 12).outerHTML} Refrigeration Plant`;
    const plantState = el('span', { class: 'side' });
    plantTitle.appendChild(plantState);
    plantSec.appendChild(plantTitle);
    const plantCard = el('div', { class: 'section-card' });
    const plantRow = el('div', { class: 'btn-row' });
    plantRow.append(
      ui.button('Start', { size: 'small', variant: 'subtle', iconName: 'play', onClick: () => { comp.start(); this.renderPanel(); } }),
      ui.button('Stop', { size: 'small', iconName: 'stop', onClick: () => { comp.stop(); this.renderPanel(); } }),
      ui.button('Restart', { size: 'small', iconName: 'restart', onClick: () => { comp.restart(); this.renderPanel(); } }),
      ui.button('Defrost', { size: 'small', variant: 'warn', iconName: 'snowflake', onClick: () => { this.startDefrost('operator'); this.renderPanel(); } }),
      ui.button('Failure', { size: 'small', variant: 'danger', iconName: 'alert', onClick: () => { comp.injectFault('high-pressure lockout'); this.renderPanel(); } }),
    );
    plantCard.appendChild(plantRow);
    plantCard.appendChild(ui.toggle({ label: 'Compressor enabled', description: 'Master enable for the condensing unit.', value: cfgOn(comp), onChange: v => { if (v) comp.start(); else comp.stop(); this.renderPanel(); } }));
    plantCard.appendChild(ui.toggle({ label: 'Automatic cooling', description: 'Regulate load from room temperature and door state.', value: !!dcfg.auto, onChange: v => { dcfg.auto = v; this.saveSoon(); this.renderPanel(); } }));
    plantCard.appendChild(ui.slider({ label: 'Cooling intensity', min: 0, max: 100, step: 1, value: dcfg.intensity, unit: '%', disabled: !!dcfg.auto, onChange: v => { dcfg.intensity = v; this.saveSoon(); } }));
    plantCard.appendChild(ui.slider({ label: 'Target temperature', min: -26, max: -8, step: .5, value: dcfg.targetTemp, unit: '°C', onChange: v => { dcfg.targetTemp = v; this.saveSoon(); } }));
    plantCard.appendChild(ui.slider({ label: 'Compressor speed', min: 20, max: 100, step: 1, value: dcfg.speed, unit: '%', onChange: v => { dcfg.speed = v; this.saveSoon(); } }));
    plantCard.appendChild(ui.slider({ label: 'Evaporator fan speed', min: 0, max: 100, step: 1, value: dcfg.fanSpeed, unit: '%', onChange: v => { dcfg.fanSpeed = v; this.saveSoon(); } }));
    plantCard.appendChild(ui.toggle({ label: 'Liquid line service valve', description: 'Isolating the circuit suspends cooling without stopping the compressor.', value: !!dcfg.liquidValve, onChange: v => { dcfg.liquidValve = v; this.logEvent(v ? 'Liquid line opened' : 'Liquid line isolated', v ? 'Refrigerant flow restored.' : 'Cooling suspended at service valve.', v ? 'ok' : 'warn'); this.saveSoon(); } }));
    plantCard.appendChild(ui.toggle({ label: 'Automatic defrost cycle', description: 'Defrost the evaporator when frost builds up.', value: !!this.config.defrost?.auto, onChange: v => { this.config.defrost.auto = v; this.saveSoon(); } }));
    plantSec.appendChild(plantCard);
    this.addPanelBind(() => {
      plantState.textContent = `${comp.healthy && cfgOn(comp) ? 'RUNNING' : comp.restartTimer > 0 ? 'RESTARTING' : 'STOPPED'} · ${ui.fmt(comp.load * 100, 0)}%`;
      plantState.style.color = comp.healthy && cfgOn(comp) ? 'var(--ok)' : 'var(--warn)';
    });
    container.appendChild(plantSec);

    /* --- walk-in door --- */
    const doorSec = el('div', { class: 'section' });
    const doorTitle = el('div', { class: 'section-title' });
    doorTitle.innerHTML = `${ui.icon('door', 12).outerHTML} Walk-in Freezer Door`;
    const doorState = el('span', { class: 'side' });
    doorTitle.appendChild(doorState);
    doorSec.appendChild(doorTitle);
    const doorCard = el('div', { class: 'section-card' });
    doorCard.appendChild(el('div', { class: 'btn-row' },
      ui.button('Open Door', { size: 'small', variant: 'subtle', iconName: 'unlock', onClick: () => { this.doors.open('operator'); this.renderPanel(); } }),
      ui.button('Close Door', { size: 'small', iconName: 'lock', onClick: () => { this.doors.close('operator'); this.renderPanel(); } }),
      ui.button('Inspect', { size: 'small', variant: 'ghost', iconName: 'eye', onClick: () => this.selectObject('door-freezer') }),
    ));
    doorCard.appendChild(ui.toggle({ label: 'Automatic door', description: 'Open on approach and auto-close after the delay.', value: !!doorCfg.auto, onChange: v => { doorCfg.auto = v; this.doors.autoConfig.auto = v; this.saveSoon(); this.renderPanel(); } }));
    doorCard.appendChild(ui.toggle({ label: 'Door interlock sensor', description: 'Presence detection and safety interlock.', value: doorCfg.sensorEnabled !== false, onChange: v => { doorCfg.sensorEnabled = v; this.doors.autoConfig.sensorEnabled = v; this.saveSoon(); } }));
    doorCard.appendChild(ui.slider({ label: 'Opening speed', min: .2, max: 2.5, step: .05, value: doorCfg.openSpeed, unit: 'x', onChange: v => { doorCfg.openSpeed = v; this.doors.autoConfig.openSpeed = v; this.saveSoon(); } }));
    doorCard.appendChild(ui.slider({ label: 'Closing speed', min: .2, max: 2.5, step: .05, value: doorCfg.closeSpeed, unit: 'x', onChange: v => { doorCfg.closeSpeed = v; this.doors.autoConfig.closeSpeed = v; this.saveSoon(); } }));
    doorCard.appendChild(ui.slider({ label: 'Automatic close delay', min: 2, max: 120, step: 1, value: doorCfg.autoCloseDelay, unit: 's', onChange: v => { doorCfg.autoCloseDelay = v; this.doors.autoConfig.autoCloseDelay = v; this.saveSoon(); } }));
    doorSec.appendChild(doorCard);
    this.addPanelBind(() => {
      doorState.textContent = `${this.doors.state}${this.doors.isOpen ? ' · ' + ui.fmtDuration(this.doors.openElapsed) : ''}`;
      doorState.style.color = this.doors.isOpen ? 'var(--warn)' : 'var(--ok)';
    });
    container.appendChild(doorSec);

    /* --- zone airflow --- */
    const zoneSec = el('div', { class: 'section' });
    const zoneTitle = el('div', { class: 'section-title' });
    zoneTitle.innerHTML = `${ui.icon('wind', 12).outerHTML} Zone Air Distribution`;
    zoneSec.appendChild(zoneTitle);
    const zoneCard = el('div', { class: 'section-card' });
    for (const z of this.zones) {
      const cfg = this.config.zones?.[z.id] || (this.config.zones[z.id] = { damper: 1 });
      zoneCard.appendChild(ui.slider({
        label: `${z.short} damper`, min: .3, max: 1.3, step: .01, value: cfg.damper ?? 1, unit: 'x',
        onInput: v => { cfg.damper = v; },
        onChange: () => { this.saveSoon(); },
      }));
    }
    zoneSec.appendChild(zoneCard);
    container.appendChild(zoneSec);

    /* --- humidity, lighting, displays --- */
    const envSec = el('div', { class: 'section' });
    const envTitle = el('div', { class: 'section-title' });
    envTitle.innerHTML = `${ui.icon('droplet', 12).outerHTML} Climate, Lighting & Displays`;
    envSec.appendChild(envTitle);
    const envCard = el('div', { class: 'section-card' });
    envCard.appendChild(ui.toggle({ label: 'Automatic humidity regulation', value: hcfg.auto !== false, onChange: v => { hcfg.auto = v; this.saveSoon(); this.renderPanel(); } }));
    envCard.appendChild(ui.slider({ label: 'Target humidity', min: 45, max: 90, step: 1, value: hcfg.target, unit: '%', disabled: hcfg.auto !== false, onChange: v => { hcfg.target = v; this.saveSoon(); } }));
    envCard.appendChild(ui.toggle({ label: 'Dehumidifier unit', value: hcfg.dehumidifier !== false, onChange: v => { hcfg.dehumidifier = v; this.saveSoon(); } }));
    envCard.appendChild(ui.toggle({ label: 'Humidity sensor enabled', value: hcfg.sensorEnabled !== false, onChange: v => { hcfg.sensorEnabled = v; this.setSensorEnabled('room-humidity', v); this.saveSoon(); } }));
    envCard.appendChild(el('div', { class: 'divider' }));
    envCard.appendChild(ui.toggle({ label: 'Room lighting', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lighting.on = v; this.saveSoon(); } }));
    envCard.appendChild(ui.toggle({ label: 'Adaptive lighting mood', description: 'Lighting colour tracks temperature status.', value: this.config.lighting.mood !== false, onChange: v => { this.config.lighting.mood = v; this.saveSoon(); } }));
    envCard.appendChild(ui.toggle({ label: 'Local display board', value: this.config.displayOn !== false, onChange: v => { this.config.displayOn = v; this.updateDisplayBrightness(); this.saveSoon(); } }));
    envCard.appendChild(ui.slider({ label: 'Display brightness', min: 20, max: 100, step: 1, value: this.config.displayBrightness ?? 100, unit: '%', onChange: v => { this.config.displayBrightness = v; this.updateDisplayBrightness(); this.saveSoon(); } }));
    envCard.appendChild(ui.toggle({ label: 'Alarm beacon armed', value: this.config.beaconOn !== false, onChange: v => { this.config.beaconOn = v; this.saveSoon(); } }));
    envCard.appendChild(ui.toggle({ label: 'Temperature heat map overlay', description: 'Colour overlay showing live zone temperatures.', value: this.config.heatmap !== false, onChange: v => { this.setHeatmapVisible(v); this.renderPanel(); } }));
    envSec.appendChild(envCard);
    container.appendChild(envSec);

    /* --- diagnostics --- */
    const diagSec = el('div', { class: 'section' });
    const diagTitle = el('div', { class: 'section-title' });
    diagTitle.innerHTML = `${ui.icon('warning', 12).outerHTML} Diagnostics & Fault Injection`;
    diagSec.appendChild(diagTitle);
    const diagCard = el('div', { class: 'section-card' });
    diagCard.appendChild(ui.toggle({
      label: 'Simulate compressor failure', value: this.faults.compressor,
      onChange: v => {
        if (v) this.compressor.injectFault('injected by operator');
        else { this.compressor.restart(); }
        this.renderPanel();
      },
    }));
    diagCard.appendChild(ui.toggle({
      label: 'Simulate zone sensor failure', value: this.faults.sensor,
      onChange: v => {
        this.faults.sensor = v;
        for (const z of ZONES) this.setSensorEnabled(`zone-${z.id.toLowerCase()}-temp`, !v);
        this.logEvent(v ? 'Sensor fault injected' : 'Sensor fault cleared', 'Zone temperature channel diagnostic.', v ? 'warn' : 'ok');
        this.evaluateAlarms(); this.saveSoon(); this.renderPanel();
      },
    }));
    diagCard.appendChild(ui.toggle({
      label: 'Simulate door interlock failure', value: this.faults.doorSensor,
      onChange: v => {
        this.faults.doorSensor = v;
        this.setSensorEnabled('door-state', !v);
        this.logEvent(v ? 'Door interlock fault' : 'Door interlock restored', 'Interlock channel diagnostic.', v ? 'warn' : 'ok');
        this.evaluateAlarms(); this.saveSoon(); this.renderPanel();
      },
    }));
    diagCard.appendChild(el('div', { class: 'btn-row' },
      ui.button('Warm Room (test)', { size: 'small', variant: 'warn', iconName: 'thermometer', onClick: () => {
        for (const z of this.zones) z.temp += 7.5;
        this.updateSensors(); this.evaluateAlarms();
        this.logEvent('Thermal test', 'Zone temperatures raised for alarm verification.', 'warn');
        this.refreshLive();
      } }),
      ui.button('Clear All Faults', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => {
        this.faults.compressor = false; this.faults.sensor = false; this.faults.doorSensor = false;
        for (const z of ZONES) this.setSensorEnabled(`zone-${z.id.toLowerCase()}-temp`, true);
        this.setSensorEnabled('door-state', true); this.setSensorEnabled('room-humidity', true);
        this.evaluateAlarms(); this.saveSoon(); this.renderPanel();
      } }),
    ));
    diagSec.appendChild(diagCard);
    container.appendChild(diagSec);
  }

  /* =========================================================
     Inventory / stock panel
     ========================================================= */
  buildSpawning(container) {
    const notice = el('div', { class: 'notice' });
    notice.innerHTML = `${ui.icon('inventory', 13).outerHTML}<span>Stock is stored per thermal zone and validated against the live cold-chain rule: an item flags spoilage risk when its zone exceeds the required storage temperature.</span>`;
    container.appendChild(notice);

    const draft = { name: '', category: 'frozen', qty: 50, zone: 'A', requiredTemp: -18, expiration: dayKey(90) };

    /* --- metrics --- */
    const metricWrap = el('div', { class: 'metric-grid three', style: { marginBottom: '12px' } });
    metricWrap.append(
      ui.metric({ label: 'Stock Lines', bind: () => String(this.inventory.length), iconName: 'inventory', compact: true }),
      ui.metric({ label: 'Total Units', bind: () => ui.fmtInt(this.inventory.reduce((a, i) => a + i.qty, 0)), iconName: 'package', compact: true }),
      ui.metric({ label: 'Spoilage Risk', bind: () => ({ value: String(this.spoilageRiskItems().length), tone: this.spoilageRiskItems().length ? 'danger' : 'ok' }), iconName: 'alert', compact: true }),
    );
    container.appendChild(metricWrap);

    /* --- add stock --- */
    const addSec = el('div', { class: 'section' });
    const addTitle = el('div', { class: 'section-title' });
    addTitle.innerHTML = `${ui.icon('plus', 12).outerHTML} Receive New Stock`;
    addSec.appendChild(addTitle);
    const addCard = el('div', { class: 'section-card' });
    addCard.appendChild(ui.textField({ label: 'Item description', value: draft.name, placeholder: 'e.g. Frozen Berry Pallets', onChange: v => { draft.name = v; } }));
    addCard.appendChild(ui.selectField({ label: 'Category', options: ITEM_CATEGORY_OPTIONS, value: draft.category, onChange: v => { draft.category = v; draft.requiredTemp = ITEM_CATEGORIES[v].required; this.renderPanel(); } }));
    addCard.appendChild(el('div', { class: 'inline-pair' },
      ui.numberField({ label: 'Quantity', unit: 'units', min: 1, max: 100000, step: 1, value: draft.qty, onChange: v => { draft.qty = v; } }),
      ui.selectField({ label: 'Storage zone', options: ZONES.map(z => ({ value: z.id, label: `${z.id} · ${z.name}` })), value: draft.zone, onChange: v => { draft.zone = v; } }),
    ));
    addCard.appendChild(el('div', { class: 'inline-pair' },
      ui.numberField({ label: 'Required temp', unit: '°C', min: -30, max: 5, step: .5, value: draft.requiredTemp, onChange: v => { draft.requiredTemp = v; } }),
      ui.textField({ label: 'Expiration (YYYY-MM-DD)', value: draft.expiration, onChange: v => { draft.expiration = v; } }),
    ));
    addCard.appendChild(ui.button('Add Inventory Item', {
      variant: 'primary', block: true, iconName: 'plus',
      onClick: () => {
        const item = this.addInventoryItem(draft);
        if (!item) { ui.toast('Enter an item description before adding stock.', { type: 'warn' }); return; }
        ui.toast(`${item.name} added · ${item.qty} units in zone ${item.zone}.`, { type: 'ok' });
        draft.name = '';
        this.renderPanel();
      },
    }));
    addSec.appendChild(addCard);
    container.appendChild(addSec);

    /* --- quick presets --- */
    const presetSec = el('div', { class: 'section' });
    const presetTitle = el('div', { class: 'section-title' });
    presetTitle.innerHTML = `${ui.icon('bolt', 12).outerHTML} Quick Receipts`;
    presetSec.appendChild(presetTitle);
    const presetRow = el('div', { class: 'btn-row' });
    const presets = [
      { name: 'Frozen Berry Pallets', category: 'frozen', qty: 120, zone: 'A', requiredTemp: -18, expiration: dayKey(180) },
      { name: 'Chilled Dairy Crates', category: 'food', qty: 90, zone: 'C', requiredTemp: -16, expiration: dayKey(45) },
      { name: 'Vaccine Cold Boxes', category: 'medicine', qty: 60, zone: 'D', requiredTemp: -18, expiration: dayKey(240) },
      { name: 'Sterile Dressing Packs', category: 'medical', qty: 200, zone: 'D', requiredTemp: -16.5, expiration: dayKey(360) },
    ];
    for (const p of presets) {
      presetRow.appendChild(ui.button(p.category === 'frozen' ? 'Frozen' : p.category === 'food' ? 'Food' : p.category === 'medicine' ? 'Medicine' : 'Medical', {
        size: 'small', iconName: ITEM_CATEGORIES[p.category].icon,
        onClick: () => {
          const item = this.addInventoryItem(p);
          ui.toast(`${item.name} received into zone ${item.zone}.`, { type: 'ok' });
          this.renderPanel();
        },
      }));
    }
    presetSec.appendChild(presetRow);
    container.appendChild(presetSec);

    /* --- stock register --- */
    const listSec = el('div', { class: 'section' });
    const listTitle = el('div', { class: 'section-title' });
    listTitle.innerHTML = `${ui.icon('clipboard', 12).outerHTML} Cold-chain Stock Register`;
    const listCount = el('span', { class: 'side' });
    listTitle.appendChild(listCount);
    listSec.appendChild(listTitle);
    const listCard = el('div', { class: 'section-card', style: { padding: '4px 10px', maxHeight: '330px', overflowY: 'auto' } });
    listSec.appendChild(listCard);

    const renderList = () => {
      ui.clear(listCard);
      if (!this.inventory.length) {
        listCard.appendChild(el('div', { class: 'empty', text: 'No stock registered in the cold store.' }));
        return;
      }
      for (const item of this.inventory) {
        const status = this.itemStatus(item);
        const row = el('div', { class: 'alarm-item', style: { cursor: 'pointer' } });
        const sev = el('span', { class: `sev ${status === 'SPOILAGE RISK' || status === 'EXPIRED' ? 'critical' : status === 'EXPIRING' ? '' : 'info'}` });
        const temp = this.itemZoneTemp(item);
        const days = this.daysToExpiry(item);
        const tt = el('div', { class: 'tt' },
          el('b', { text: `${item.name} · ${item.qty} units` }),
          el('span', { text: `${item.id} · zone ${item.zone} ${ui.fmt(temp, 1)}°C / required ${ui.fmt(item.requiredTemp, 1)}°C · expires in ${days} d · ${ITEM_CATEGORIES[item.category]?.label || item.category}` }),
        );
        const stateCell = el('div', { class: 'tm', text: status });
        stateCell.style.color = status === 'OK' ? 'var(--ok)' : status === 'EXPIRING' ? 'var(--warn)' : 'var(--danger)';
        const del = ui.button('', { size: 'small', variant: 'ghost', iconName: 'trash', iconOnly: true, title: `Remove ${item.id}` });
        del.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const ok = await ui.confirmDialog({ title: 'Remove stock line?', message: `${item.name} (${item.id}) will be struck off the cold-chain register.`, confirmLabel: 'Remove', danger: true });
          if (!ok) return;
          this.removeInventoryItem(item.id);
          ui.toast(`${item.id} removed from inventory.`, { type: 'info' });
          this.renderPanel();
        });
        row.append(sev, tt, stateCell, del);
        row.addEventListener('click', () => {
          const objId = `item.${item.id}`;
          if (this.objects.has(objId)) this.selectObject(objId);
          else ui.toast(`${item.name} has no 3D placement (rack full).`, { type: 'info' });
        });
        listCard.appendChild(row);
      }
    };
    renderList();
    this.addPanelBind(() => {
      listCount.textContent = `${this.inventory.length} LINES · ${ui.fmtInt(this.inventory.reduce((a, i) => a + i.qty, 0))} UNITS`;
    });
    listSec.appendChild(el('div', { class: 'help', style: { marginTop: '7px' }, text: 'Select a stock line to open its 3D pallet inspector, adjust quantity or required temperature.' }));
    const bulkRow = el('div', { class: 'btn-row', style: { marginTop: '8px' } });
    bulkRow.append(
      ui.button('Remove Expired', { size: 'small', variant: 'warn', iconName: 'trash', onClick: () => {
        const expired = this.inventory.filter(i => this.daysToExpiry(i) < 0);
        if (!expired.length) { ui.toast('No expired stock on the register.', { type: 'info' }); return; }
        for (const i of expired) this.removeInventoryItem(i.id);
        ui.toast(`${expired.length} expired stock lines removed.`, { type: 'warn' });
        this.renderPanel();
      } }),
      ui.button('Inspect Shelf A', { size: 'small', variant: 'ghost', iconName: 'eye', onClick: () => this.selectObject('shelf-a') }),
    );
    listSec.appendChild(bulkRow);
    container.appendChild(listSec);

    /* --- consumption simulator --- */
    const simSec = el('div', { class: 'section' });
    const simTitle = el('div', { class: 'section-title' });
    simTitle.innerHTML = `${ui.icon('activity', 12).outerHTML} Pick & Consumption Simulator`;
    simSec.appendChild(simTitle);
    const simCard = el('div', { class: 'section-card' });
    simCard.appendChild(ui.toggle({ label: 'Simulate order picking', description: 'Stock quantities decrease as orders are picked.', value: !!this.config.consumption.enabled, onChange: v => { this.config.consumption.enabled = v; this.saveSoon(); this.renderPanel(); } }));
    simCard.appendChild(ui.slider({ label: 'Pick rate', min: .5, max: 5, step: .1, value: this.config.consumption.rate || 1, unit: 'x', onChange: v => { this.config.consumption.rate = v; this.saveSoon(); } }));
    simCard.appendChild(ui.toggle({ label: 'Automatic restock', description: 'Replenish lines that fall below safety stock.', value: !!this.config.consumption.restock, onChange: v => { this.config.consumption.restock = v; this.saveSoon(); } }));
    simSec.appendChild(simCard);
    container.appendChild(simSec);
  }

  /* =========================================================
     Detailed Operational Scenarios
     ========================================================= */
  registerDetailedScenarios() {
    /* ---- Cold Storage Room Scenario ---- */
    this.registerScenario({
      id: 'cold-storage-management',
      name: 'Cold Storage Temperature Control Cycle',
      description: 'Complete cold store operation from cool-down to temperature maintenance and door management',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-cold',
          title: 'Initialize Cold Store',
          description: 'Check initial temperatures, compressor status, door closed',
          objective: 'Verify freezer at -18°C, chiller at -2°C, door closed, compressor at 40%',
          checkComplete: (infra) => (infra.temps?.freezer || -18) < -15 && (infra.temps?.chiller || -2) < 0,
          autoAdvanceDelay: 4000,
          camera: { position: [0, 5, 6], target: [0, 2, 0] },
          narration: 'Cold store initialized. Freezer at -18.6°C, Chiller at -2.4°C. All nominal.',
        },
        {
          id: 'activate-compressor',
          title: 'Activate Compressor',
          description: 'Start refrigeration plant and begin cooling cycle',
          objective: 'Verify compressor running, condenser fan spinning, load increasing',
          checkComplete: (infra) => infra.compressor?.on && (infra.compressorLoad || 0) > 0.3,
          autoAdvanceDelay: 3000,
          camera: { position: [4, 4, -4], target: [4, 2, -4] },
          narration: 'Compressor running. Condenser fan active. Plant load at 40%.',
        },
        {
          id: 'monitor-cooling',
          title: 'Monitor Temperature Stabilization',
          description: 'Watch both zones approach and maintain setpoints',
          objective: 'Observe Freezer → -18°C, Chiller → -2°C, heatmap updating',
          checkComplete: (infra) => Math.abs((infra.temps?.freezer || -18) + 18) < 1 && Math.abs((infra.temps?.chiller || -2) + 2) < 1,
          autoAdvanceDelay: 15000,
          camera: { position: [0, 5, 6], target: [0, 2, 0] },
          narration: 'Zones stabilizing at setpoints. Heat map shows uniform temperature distribution.',
        },
        {
          id: 'door-operation',
          title: 'Walk-in Door Operation',
          description: 'Open freezer door for loading, observe temperature impact',
          objective: 'Open door, watch heatmap warm-up, door timer start, alarm at 3 minutes',
          onEnter: (infra) => { infra.setDoorState?.(true); },
          checkComplete: (infra) => infra.doorOpen && infra.doorOpen > 0.5,
          autoAdvanceDelay: 4000,
          camera: { position: [-3, 4, 4], target: [-3, 2, 0] },
          narration: 'Walk-in freezer door opening for stock access. Cold air egress begins. Door timer started.',
        },
        {
          id: 'temperature-rise',
          title: 'Temperature Rise During Door Open',
          description: 'Monitor temperature increase during extended door opening',
          objective: 'Watch Chiller rise faster, heatmap change color, door-open elapsed',
          checkComplete: (infra) => infra.doorOpenTimer > 180,
          autoAdvanceDelay: 20000,
          narration: 'Door open for 3 minutes. Chiller temperature rising. Door-open alarm will trigger.',
        },
        {
          id: 'door-alarm',
          title: 'Door Open Alarm',
          description: 'Door-open alarm triggers after configured delay',
          objective: 'Acknowledge alarm, observe cold air loss alert',
          checkComplete: (infra) => infra.getActiveAlarms?.()?.some(a => a.id === 'door-open' || a.title?.includes('Door')),
          autoAdvanceDelay: 5000,
          narration: 'ALARM: Walk-in door open for 180 seconds. Cold air loss raising store temperature.',
        },
        {
          id: 'close-door',
          title: 'Close Walk-in Door',
          description: 'Close door and observe temperature recovery',
          objective: 'Close door, watch temperature return to setpoints, alarm clears',
          onEnter: (infra) => { infra.setDoorState?.(false); },
          checkComplete: (infra) => !infra.doorOpen || infra.doorOpen < 0.1,
          autoAdvanceDelay: 10000,
          camera: { position: [-3, 4, 4], target: [-3, 2, 0] },
          narration: 'Closing walk-in door. Compressor working to restore temperatures. Alarm clearing.',
        },
        {
          id: 'abnormal-event',
          title: 'Abnormal Temperature Event',
          description: 'Simulate compressor fault causing temperature excursion',
          objective: 'Inject fault, observe rapid warming, stock quarantine if applicable',
          onEnter: (infra) => { infra.faults.compressor = true; infra.logEvent('Compressor fault', 'Simulated fault for scenario', 'danger'); },
          checkComplete: (infra) => infra.faults.compressor && (infra.temps?.freezer || -18) > -10,
          autoAdvanceDelay: 15000,
          narration: 'CRITICAL: Compressor fault! Freezer warming rapidly. Stock at risk.',
        },
        {
          id: 'restore-cooling',
          title: 'Restore Cooling',
          description: 'Clear fault, restore cooling, verify temperatures return',
          objective: 'Clear compressor fault, verify temperatures return to band',
          onEnter: (infra) => { infra.faults.compressor = false; infra.compressor.on = true; },
          checkComplete: (infra) => !infra.faults.compressor && Math.abs((infra.temps?.freezer || -18) + 18) < 2,
          autoAdvanceDelay: 20000,
          narration: 'Compressor fault cleared. Cooling restored. Temperatures returning to band.',
        },
        {
          id: 'cold-report',
          title: 'Cold Storage Condition Report',
          description: 'Generate storage condition and inventory report',
          objective: 'Review temperature logs, door cycles, compressor runtime, inventory status',
          checkComplete: () => true,
          autoAdvanceDelay: 4000,
          narration: 'Cold store cycle complete. Temperatures stable. Door cycles logged. Compressor hours recorded. Report generated.',
        },
      ],
    });

    /* ---- Defrost Cycle Scenario ---- */
    this.registerScenario({
      id: 'cold-defrost-cycle',
      name: 'Scheduled Defrost Cycle',
      description: 'Execute and monitor a scheduled evaporator defrost cycle',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-defrost',
          title: 'Pre-Defrost Conditions',
          description: 'System running normally, frost buildup detected',
          objective: 'Verify compressor running, evaporator frost > 80%, schedule defrost',
          checkComplete: (infra) => true,
          autoAdvanceDelay: 3000,
        },
        {
          id: 'start-defrost',
          title: 'Initiate Defrost',
          description: 'Start hot-gas defrost cycle',
          objective: 'Compressor pauses, hot gas valve opens, evaporator heaters energize',
          onEnter: (infra) => { infra.defrostActive = true; infra.compressor.on = false; },
          checkComplete: (infra) => infra.defrostActive,
          autoAdvanceDelay: 5000,
        },
        {
          id: 'monitor-defrost',
          title: 'Monitor Defrost Progress',
          description: 'Watch frost melt, temperature rise in evaporator, drain flow',
          objective: 'Observe evaporator temp rise above 0°C, water drain active, timer',
          checkComplete: (infra) => (infra.evapTemp || -10) > 5,
          autoAdvanceDelay: 15000,
        },
        {
          id: 'end-defrost',
          title: 'End Defrost & Restore',
          description: 'Defrost complete, restore normal refrigeration',
          objective: 'Close hot gas valve, restart compressor, verify cooling resumes',
          onEnter: (infra) => { infra.defrostActive = false; infra.compressor.on = true; },
          checkComplete: (infra) => infra.compressor.on && !infra.defrostActive,
          autoAdvanceDelay: 5000,
        },
      ],
    });
  }

  // First-person interaction handlers for cold storage
  _toggleDoor(obj) {
    if (obj.id?.includes('door') || obj.id?.includes('freezer-door') || obj.id?.includes('chiller-door')) {
      this.setDoorState?.(!this.doorOpen);
    }
  }

  _operateCompressor(obj) {
    if (this.compressor) {
      this.compressor.on = !this.compressor.on;
      this.logEvent('Compressor toggled', this.compressor.on ? 'Started' : 'Stopped', this.compressor.on ? 'ok' : 'warn');
    }
  }

  _operatePump(obj) {
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
    this.selectObject(obj.id);
  }

  _operateLever(obj) {
    this.selectObject(obj.id);
  }
}

function cfgOn(comp) { return !!comp.on; }
