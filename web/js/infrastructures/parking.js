/* ============================================================
   SMART PARKING LOT — fully simulated parking facility
   ============================================================ */
import * as THREE from 'three';
import { BaseInfrastructure } from '../core/base.js';
import {
  group, box, cylinder, plane, material, emissive, roundedBox, makeCar, makeLampPost,
  makeSecurityCamera, makeRoadSign, signBoard, textSprite, canvasTexture, pipe,
  shadowify, glass, makePerson, makeControlCabinet, mergeStaticGroup, COLORS,
} from '../core/scene.js';
import * as ui from '../core/ui.js';

const { el, toast } = ui;

export const meta = {
  id: 'parking',
  code: 'PKG-01',
  name: 'Smart Parking Lot',
  description: '18 smart parking bays with automated barriers, vehicle routing, occupancy analytics and overstay management.',
  icon: 'parking',
  sceneBackground: 0x050b12,
  fogDensity: 0.0046,
  fitPadding: 1.02,
};

const CAR_COLORS = [
  { name: 'Aqua', hex: 0x33c7b0 }, { name: 'Cobalt', hex: 0x3d7fc4 }, { name: 'Graphite', hex: 0x5a6773 },
  { name: 'Pearl', hex: 0xd6dde2 }, { name: 'Crimson', hex: 0xb94b50 }, { name: 'Amber', hex: 0xd3913f },
  { name: 'Forest', hex: 0x3e7d5c }, { name: 'Indigo', hex: 0x5c5fa7 },
];
const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' }, { value: 'suv', label: 'SUV' }, { value: 'van', label: 'Van' },
];
const SLOT_STATUS = {
  available: { color: 0x35e28d, css: '#35e28d', label: 'AVAILABLE' },
  reserved: { color: 0xffb547, css: '#ffb547', label: 'RESERVED' },
  occupied: { color: 0xff4f60, css: '#ff4f60', label: 'OCCUPIED' },
  disabled: { color: 0x64717c, css: '#64717c', label: 'DISABLED' },
};

let vehicleSerial = 1000;

class Barrier {
  constructor(infra, cfg) {
    this.infra = infra;
    this.id = cfg.id;
    this.name = cfg.name;
    this.group = group(`barrier-${cfg.id}`);
    this.group.position.set(cfg.x, 0, cfg.z);
    this.autoConfig = infra.config.gates[cfg.id];
    this.angle = 0;
    this.target = 0;
    this.openAngle = 1.46;
    this.cycles = 0;
    this.openSince = null;
    this.lastNear = 0;
    this.near = false;
    this.crossPoint = new THREE.Vector3(cfg.crossX, 0, cfg.crossZ);
    this.speed = 1.5;
    this.sensorEnabled = this.autoConfig.sensorEnabled;
    this.auto = this.autoConfig.auto;
    this.build(cfg);
    infra.cat.gates.add(this.group);
    infra.addObject(this.group, {
      id: `gate-${cfg.id}`, label: this.name, kind: 'gate', iconName: 'gate',
      description: `${this.name} barrier · automatic vehicle access`,
    });
    this.syncConfig();
  }

  build(cfg) {
    const dark = material(0x26333d, { metalness: .55, roughness: .45 });
    const steel = material(0x8d9aa5, { metalness: .7, roughness: .3 });
    const base = box(.8, .1, .8, dark, { pos: [0, .05, 0] });
    this.group.add(base);
    this.group.add(cylinder(.11, .13, 1.25, steel, { pos: [0, .68, 0] }));
    const housing = roundedBox(.4, .62, .34, dark, { pos: [0, .92, 0], radius: .04 });
    this.group.add(housing);
    const screen = box(.26, .18, .02, new THREE.MeshStandardMaterial({ color: 0x06161d, emissive: 0x1f8f84, emissiveIntensity: .55 }), { pos: [0, 1.06, .18], cast: false });
    this.group.add(screen);
    this.ledMat = new THREE.MeshStandardMaterial({ color: 0xff4d5e, emissive: 0xff4d5e, emissiveIntensity: 2.1, roughness: .3 });
    this.group.add(cylinder(.045, .045, .025, this.ledMat, { pos: [0, .77, .18], rx: Math.PI / 2, segments: 10 }));
    this.group.add(box(.18, .025, .025, this.ledMat, { pos: [0, .7, .18], cast: false }));

    this.pivot = group('barrier-arm');
    this.pivot.position.set(0, 1.18, .02);
    const stripes = 7;
    const len = cfg.armLength ?? 5.3;
    const seg = len / stripes;
    for (let i = 0; i < stripes; i++) {
      const mat = material(i % 2 === 0 ? 0xe6ebee : 0xd14b52, { roughness: .55, metalness: .15 });
      this.pivot.add(box(seg, .13, .11, mat, { pos: [seg * (i + .5), 0, 0] }));
    }
    this.pivot.add(box(.12, .18, .16, dark, { pos: [-.02, 0, 0] }));
    this.group.add(this.pivot);
    const sign = signBoard(cfg.id === 'entry' ? 'ENTRY' : 'EXIT', 1.1, .4, { bg: '#071923', border: cfg.id === 'entry' ? '#36e2c2' : '#ffb547' });
    sign.position.set(0, 1.65, 0);
    this.group.add(sign);
    // ground loop
    const loop = box(3.4, .012, 2.2, new THREE.MeshBasicMaterial({ color: 0x24313a, transparent: true, opacity: .85 }), { pos: [2.1, .022, .3], cast: false, receive: false });
    this.group.add(loop);
    const loopLine = box(3.0, .014, .04, new THREE.MeshBasicMaterial({ color: cfg.id === 'entry' ? 0x36e2c2 : 0xffb547 }), { pos: [2.1, .03, 1.2], cast: false, receive: false });
    this.group.add(loopLine);
  }

  syncConfig() {
    this.autoConfig.auto = this.auto;
    this.autoConfig.sensorEnabled = this.sensorEnabled;
  }

  open() {
    this.target = this.openAngle;
    this.lastNear = this.infra.simTime;
    this.manualHoldUntil = this.infra.simTime + 30;
    this.infra.logEvent(`${this.name} commanded open`, 'Barrier arm raising. Vehicle detection held for 30 s.', 'ok');
  }

  close() {
    this.target = 0;
    this.manualHoldUntil = this.infra.simTime + 30;
    this.infra.logEvent(`${this.name} commanded closed`, 'Barrier arm lowering. Vehicle detection held for 30 s.', 'info');
  }

  detectNear() {
    if (!this.sensorEnabled) return false;
    const nearList = this.infra.vehicles.filter(v => v.state === (this.id === 'entry' ? 'arriving' : 'departing'));
    for (const v of nearList) {
      const d = v.group.position.distanceTo(this.crossPoint);
      if (d < 10) return true;
    }
    return false;
  }

  update(dt) {
    this.near = this.detectNear();
    const held = this.infra.simTime < (this.manualHoldUntil || 0);
    if (this.auto && !held) {
      if (this.near) {
        this.target = this.openAngle;
        this.lastNear = this.infra.simTime;
      } else if (this.target > 0 && this.angle > .05) {
        const idle = this.infra.simTime - this.lastNear;
        if (idle > (this.autoConfig.autoCloseDelay ?? 4)) this.target = 0;
      }
    }
    if (this.target > 0 && this.angle < .02 && !this._openingCounted) {
      this.cycles++;
      this._openingCounted = true;
    }
    if (this.angle < .02 && this.target === 0) this._openingCounted = false;
    const rate = this.target > this.angle ? (this.autoConfig.openSpeed ?? 1.5) : (this.autoConfig.closeSpeed ?? 1.3);
    const diff = this.target - this.angle;
    if (Math.abs(diff) > .002) {
      this.angle += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    } else this.angle = this.target;
    this.pivot.rotation.z = this.angle;
    if (this.angle < .05 && this.openSince !== null) this.openSince = null;
    if (this.angle > 1.25 && this.openSince === null) this.openSince = this.infra.simTime;
    if (this.ledMat) {
      const open = this.angle > 1.15;
      const col = open ? 0x3ce58b : 0xff4d5e;
      this.ledMat.color.setHex(col);
      this.ledMat.emissive.setHex(col);
      this.ledMat.emissiveIntensity = open ? 2.2 : 1.2;
    }
  }

  get state() {
    if (this.angle < .03) return 'CLOSED';
    if (this.target > this.angle + .02) return 'OPENING';
    if (this.target > 0 && this.angle > 1.4) return 'OPEN';
    if (this.target < this.angle - .02) return 'CLOSING';
    return this.angle > 1.2 ? 'OPEN' : 'CLOSED';
  }

  statusTone() {
    return this.state === 'OPEN' ? 'warn' : 'ok';
  }
}

export default class SmartParkingLot extends BaseInfrastructure {
  constructor(host) {
    super(host, meta);
    this.slots = [];
    this.slotById = new Map();
    this.vehicles = [];
    this.vehicleByObjectId = new Map();
    this.barriers = {};
    this.faults = { sensor: false };
    this.unauthorizedSlot = null;
    this.pendingArrivals = [];
    this.enteredTotal = 0;
    this.exitedTotal = 0;
    this.spawnTimer = 0;
    this.popupCooldown = 0;
    this.lights = [];
    this.cctv = [];
    this.overstayTriggered = new Set();
    this.manualGateTest = false;
    this.lightingOn = true;
    this._plateCounter = 0;
  }

  defaultConfig() {
    return {
      ...super.defaultConfig(),
      autoSpawn: true,
      gates: {
        entry: { auto: true, openSpeed: 1.6, closeSpeed: 1.35, autoCloseDelay: 4, sensorEnabled: true },
        exit: { auto: true, openSpeed: 1.5, closeSpeed: 1.3, autoCloseDelay: 4, sensorEnabled: true },
      },
      spawn: {
        autoSpawn: true, arrivalMode: 'random', interval: 22, maxVehicles: 12, speed: 2.6,
        type: 'sedan', color: 'Aqua', preferredSlot: 'random', durationMin: 180, durationMax: 540,
        manualDuration: 5, arrivalDelay: 0,
      },
      lightingOn: true,
      thresholds: { overstayMinutes: 15, gateOpenSeconds: 60, fullPercent: 95 },
    };
  }

  /* =========================================================
     World
     ========================================================= */
  buildWorld() {
    this.makeCategories();
    this.buildGround();
    this.buildCanopy();
    this.buildBooth();
    this.buildFence();
    this.buildBarriers();
    this.buildBays();
    this.buildSlotSensorNodes();
    this.buildLighting();
    this.buildRoadFurniture();
    this.buildSecurity();
    this.buildWiring();
    this.buildAmbientSensors();
    this.buildEquipment();
    this.buildBackground();
    this.optimizeStaticGeometry();

    // First-person spawn point (security booth)
    this.firstPersonSpawnPoint = { x: -13.5, y: 1.7, z: 13, yaw: -Math.PI / 4, pitch: 0 };
    this.initFirstPerson(this.firstPersonSpawnPoint);

    // Register detailed operational scenarios
    this.registerDetailedScenarios();
  }

  optimizeStaticGeometry() {
    for (const id of ['floor', 'foundation', 'fencing', 'roof', 'beams', 'columns', 'ceiling', 'signs', 'wiring']) {
      const group = this.cat[id];
      if (group) mergeStaticGroup(group, { forceNoShadow: id === 'fencing' || id === 'floor' });
    }
    for (const slot of this.slots) {
      slot.root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    }
  }

  makeCategories() {
    const cats = [
      ['floor', 'Ground & Pavement', 'structure'],
      ['foundation', 'Kerbs & Foundation', 'structure'],
      ['walls', 'Booth Walls', 'structure'],
      ['windows', 'Booth Windows', 'structure'],
      ['doors', 'Booth Door', 'structure'],
      ['roof', 'Canopy Roof', 'structure'],
      ['ceiling', 'Canopy Ceiling', 'structure'],
      ['beams', 'Structural Beams', 'structure'],
      ['columns', 'Support Columns', 'structure'],
      ['fencing', 'Perimeter Fencing', 'structure'],
      ['slots', 'Parking Bays', 'equipment'],
      ['vehicles', 'Vehicles', 'equipment'],
      ['sensors', 'Detection Sensors', 'equipment'],
      ['gates', 'Barriers & Gates', 'equipment'],
      ['lighting', 'Lighting', 'equipment'],
      ['security', 'Security Systems', 'equipment'],
      ['equipment', 'Control Equipment', 'equipment'],
      ['wiring', 'Electrical Wiring', 'equipment'],
      ['signs', 'Signage', 'equipment'],
    ];
    this.cat = {};
    for (const [id, label, kind] of cats) this.cat[id] = this.category({ id, label, kind });
  }

  buildGround() {
    const ground = material(0x151d24, { roughness: .96, metalness: 0 });
    const earth = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), ground);
    earth.rotation.x = -Math.PI / 2;
    earth.position.set(0, -.08, -4);
    earth.receiveShadow = true;
    this.scene.world.add(earth);

    const asphalt = material(0x20272e, { roughness: .92, metalness: .05 });
    const lot = plane(31, 21, asphalt, { pos: [-1.5, .01, 0], receive: true });
    this.cat.floor.add(lot);
    // outer road
    const road = plane(46, 8.2, asphalt, { pos: [-2, .012, 14.6], receive: true });
    road.userData.ignoreFit = true;
    this.cat.floor.add(road);
    const driveEntry = plane(4.6, 6.4, asphalt, { pos: [-11.5, .014, 10.6], receive: true });
    const driveExit = plane(4.6, 6.4, asphalt, { pos: [10.4, .014, 10.6], receive: true });
    this.cat.floor.add(driveEntry, driveExit);
    // pale concrete edges
    const concrete = material(0x59636b, { roughness: .9 });
    for (const [x, z, w, d] of [[-1.5, 10.55, 31, .5], [-1.5, -10.55, 31, .5], [-17, 0, .5, 21.4], [14, 0, .5, 21.4]]) {
      this.cat.foundation.add(plane(w, d, concrete, { pos: [x, .03, z], receive: true }));
    }
    // road center dashes
    const paint = new THREE.MeshBasicMaterial({ color: 0xd7dde1 });
    for (let x = -23; x < 20; x += 4) this.cat.floor.add(box(2.1, .012, .1, paint, { pos: [x, .028, 15.3], cast: false, receive: false }));
    for (let x = -23; x < 20; x += 4) this.cat.floor.add(box(2.1, .012, .1, paint, { pos: [x, .028, 13.9], cast: false, receive: false }));
    // curbs around lot
    for (const [x, z, w, d] of [[-1.5, -10.25, 32, .24], [-16.8, 0, .24, 21], [13.8, 0, .24, 21]]) {
      this.cat.foundation.add(box(w, .18, d, concrete, { pos: [x, .09, z] }));
    }
    // central aisle markings
    const aisleLine = new THREE.MeshBasicMaterial({ color: 0xaab6bf, transparent: true, opacity: .45 });
    this.cat.floor.add(box(25.5, .01, .1, aisleLine, { pos: [-1.8, .03, 0], cast: false, receive: false }));
    this.cat.floor.add(box(.1, .01, 5.2, aisleLine, { pos: [-14.6, .03, 0], cast: false, receive: false }));
    // arrows
    for (const [x, z, rot] of [[-7, 0, 0], [1.5, 0, 0], [10, 0, 0]]) {
      const arrow = this.groundArrow();
      arrow.position.set(x, .034, z);
      arrow.rotation.z = rot;
      this.cat.floor.add(arrow);
    }
    this.scene.addCollider(lot);
  }

  groundArrow() {
    const tex = canvasTexture(256, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(220,230,235,.55)';
      ctx.beginPath(); ctx.moveTo(6, 54); ctx.lineTo(150, 54); ctx.lineTo(150, 30); ctx.lineTo(236, 64); ctx.lineTo(150, 98); ctx.lineTo(150, 74); ctx.lineTo(6, 74); ctx.closePath(); ctx.fill();
    });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), mat);
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  buildCanopy() {
    const steel = material(0x5e7180, { metalness: .65, roughness: .38 });
    const darkSteel = material(0x394852, { metalness: .62, roughness: .45 });
    const roofMat = material(0x536a78, { metalness: .48, roughness: .55 });
    const panelMat = material(0x2b3d49, { metalness: .4, roughness: .5 });
    const x0 = -14.2, x1 = 10.4, z0 = -8.9, z1 = -3.1;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const canopy = new THREE.Group();
    // roof plates
    const roof = box(x1 - x0, .18, z1 - z0, roofMat, { pos: [cx, 5.86, cz] });
    this.cat.roof.add(roof);
    for (let x = x0 + 1.2; x < x1; x += 2.1) {
      this.cat.roof.add(box(.07, .04, z1 - z0 - .3, darkSteel, { pos: [x, 5.97, cz], cast: false, receive: false }));
    }
    // fascia + lights
    const fascia = box(x1 - x0 + .2, .4, .12, material(0x24343f, { metalness: .5 }), { pos: [cx, 5.68, z1 + .06] });
    this.cat.beams.add(fascia);
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x9fe9ff, emissive: 0x7fdfff, emissiveIntensity: 1.7 });
    this.cat.ceiling.add(box(x1 - x0 - 1, .035, .04, stripMat, { pos: [cx, 5.74, z1 + .02], cast: false }));
    // beams
    for (const z of [z0 + .3, cz, z1 - .3]) {
      this.cat.beams.add(box(x1 - x0, .18, .18, steel, { pos: [cx, 5.6, z] }));
    }
    for (let x = x0; x <= x1 + .01; x += (x1 - x0) / 5) {
      this.cat.beams.add(box(.16, .16, z1 - z0, steel, { pos: [x, 5.55, cz] }));
    }
    // ceiling light fixtures
    for (const [x, z] of [[-11, -6], [-4.5, -6], [2, -6], [8.5, -6]]) {
      const fixture = roundedBox(.9, .08, .28, material(0x1e2c35, { metalness: .5 }), { pos: [x, 5.48, z], radius: .03 });
      this.cat.ceiling.add(fixture);
      const glow = new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0xc6f2ff, emissiveIntensity: 1.4 });
      this.cat.ceiling.add(box(.78, .02, .18, glow, { pos: [x, 5.435, z], cast: false }));
      const pl = new THREE.PointLight(0xd6f2ff, 3.2, 10, 2);
      pl.position.set(x, 5.25, z);
      this.cat.ceiling.add(pl);
      this.lights.push({ light: pl, base: 3.2, mat: glow, baseEmissive: 1.4 });
    }
    // columns
    for (const x of [-13.7, -8.1, -2.5, 3.1, 8.7]) {
      this.cat.columns.add(box(.36, 5.7, .36, steel, { pos: [x, 2.85, -8.65] }));
      this.cat.columns.add(box(.9, .14, .9, darkSteel, { pos: [x, .07, -8.65] }));
      // diagonal brace
      const brace = box(.12, 3.5, .12, steel, { pos: [x, 4.5, -8.0], rx: -.35 });
      this.cat.beams.add(brace);
    }
    // canopy edge sensor/gateway
    const sign = signBoard('NEXUS SMART PARKING · LEVEL P1', 6.4, .72, { bg: '#06141e', border: '#36e2c2', color: '#bdf9ed' });
    sign.position.set(-1.5, 6.35, z1 + .08);
    this.cat.signs.add(sign);
  }

  buildBooth() {
    const bx = -14.2, bz = 7.0;
    const wallM = material(0x354856, { metalness: .2, roughness: .6 });
    const trim = material(0x80919c, { metalness: .4, roughness: .4 });
    const glassM = glass(0x9ed6ee, .3);
    const screenM = new THREE.MeshStandardMaterial({ color: 0x051a20, emissive: 0x2aa8a0, emissiveIntensity: .9 });
    const lightM = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffe6b0, emissiveIntensity: 1.2 });

    // foundation slab
    this.cat.foundation.add(box(3.7, .2, 3.7, material(0x3f4851), { pos: [bx, .1, bz] }));

    // walls (hideable category)
    const boothWalls = group('booth-walls');
    boothWalls.position.set(bx, 0, bz);
    for (const [x, z, w, d, h, y] of [
      [0, -1.68, 3.5, .14, 2.8, 1.5], [-1.68, 0, .14, 3.5, 2.8, 1.5], [1.68, 0, .14, 3.5, 2.8, 1.5],
      [-1.25, 1.68, 1.0, .14, 2.8, 1.5], [1.4, 1.68, .7, .14, 2.8, 1.5], [0, 2.4, 3.5, .8, .8, 2.4],
    ]) boothWalls.add(box(w, h, d, wallM, { pos: [x, y, z] }));
    this.cat.walls.add(boothWalls);

    // window and door
    const windows = group('booth-windows');
    windows.position.set(bx, 0, bz);
    windows.add(box(1.9, 1.35, .03, glassM, { pos: [.08, 1.55, 1.775], cast: false }));
    windows.add(box(1.9, .07, .09, trim, { pos: [.08, 2.25, 1.83] }));
    windows.add(box(1.9, .07, .09, trim, { pos: [.08, .86, 1.83] }));
    windows.add(box(.07, 1.35, .09, trim, { pos: [-.89, 1.55, 1.83] }));
    this.cat.windows.add(windows);
    const doorGroup = group('booth-door');
    doorGroup.position.set(bx, 0, bz);
    doorGroup.add(box(.8, 2.25, .08, material(0x223743, { metalness: .4, roughness: .5 }), { pos: [1.4, 1.125, 1.77] }));
    doorGroup.add(box(.58, .72, .02, glass(0xd8efff, .25), { pos: [1.4, 1.55, 1.82], cast: false }));
    doorGroup.add(cylinder(.025, .025, .16, trim, { pos: [1.08, 1.12, 1.84], rz: Math.PI / 2 }));
    this.cat.doors.add(doorGroup);

    // roof
    this.cat.roof.add(box(3.8, .2, 3.8, material(0x283b46, { metalness: .35 }), { pos: [bx, 3.02, bz] }));
    this.cat.roof.add(box(3.9, .1, 3.9, trim, { pos: [bx, 2.91, bz] }));

    // interior console, monitors, operator & light (equipment category)
    const interior = group('booth-interior');
    interior.position.set(bx, 0, bz);
    interior.add(box(2.4, .75, .65, material(0x20313c), { pos: [0, .55, .8] }));
    interior.add(box(2.2, .04, .6, material(0x50616d), { pos: [0, .95, .8] }));
    for (const x of [-.55, .4]) {
      interior.add(box(.62, .4, .05, screenM, { pos: [x, 1.32, 1.12], rx: -.22, cast: false }));
      interior.add(box(.68, .45, .02, material(0x0b1319), { pos: [x, 1.32, 1.08], rx: -.22, cast: false }));
    }
    const person = makePerson(0x24587a);
    person.position.set(-.5, 0, .3);
    person.rotation.y = -.2;
    interior.add(person);
    interior.add(box(1.6, .04, .2, lightM, { pos: [0, 2.8, .2], cast: false }));
    const pl = new THREE.PointLight(0xffe0aa, 1.6, 6, 2);
    pl.position.set(0, 2.55, .2);
    interior.add(pl);
    interior.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.cat.equipment.add(interior);
    this.scene.addCollider(boothWalls);
    this.boothGroup = interior;
    this.addObject(interior, { id: 'booth', label: 'Security Booth', kind: 'booth', iconName: 'shield', description: 'Staffed access control and monitoring point.' });
    this.addObject(boothWalls, { id: 'booth-shell', label: 'Security Booth Structure', kind: 'booth', iconName: 'shield', description: 'Insulated security cabin / access control booth.' });

    // access control cabinet outside booth
    const cab = makeControlCabinet(1.15, 1.9, .55, { color: 0x34434e });
    cab.position.set(-12.4, 0, 5.0);
    cab.rotation.y = -Math.PI / 2;
    this.cat.equipment.add(cab);
    this.addObject(cab, { id: 'access-controller', label: 'Access Control Node', kind: 'controller', iconName: 'shield', description: 'Barrier, occupancy and access policy controller.' });
    this.controlCabinet = cab;
  }

  buildFence() {
    const postM = material(0x5c6c78, { metalness: .55, roughness: .45 });
    const railM = material(0x778995, { metalness: .5, roughness: .5 });
    const fence = group('perimeter-fence');
    const segments = [
      [-16.35, -10.2, 13.7, -10.2], [-16.35, -10.2, -16.35, 10.2], [13.35, -10.2, 13.35, 10.2],
    ];
    for (const [x1, z1, x2, z2] of segments) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const steps = Math.ceil(len / 3.2);
      for (let i = 0; i <= steps; i++) {
        const x = x1 + (x2 - x1) * (i / steps), z = z1 + (z2 - z1) * (i / steps);
        fence.add(box(.08, 1.4, .08, postM, { pos: [x, .7, z] }));
      }
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const horiz = Math.abs(z2 - z1) < .01;
      fence.add(box(horiz ? len : .06, .06, horiz ? .06 : len, railM, { pos: [cx, .58, cz] }));
      fence.add(box(horiz ? len : .06, .06, horiz ? .06 : len, railM, { pos: [cx, 1.18, cz] }));
    }
    // south low fence segments leave gate openings
    for (const [x1, x2] of [[-16.35, -14.6], [-8.7, 7.9], [13.0, 13.35]]) {
      const len = x2 - x1;
      fence.add(box(len, .06, .06, railM, { pos: [(x1 + x2) / 2, .62, 10.2] }));
      fence.add(box(len, .06, .06, railM, { pos: [(x1 + x2) / 2, 1.15, 10.2] }));
      for (let x = x1; x <= x2; x += 3.2) fence.add(box(.08, 1.4, .08, postM, { pos: [x, .7, 10.2] }));
    }
    this.cat.fencing.add(fence);
    shadowify(fence);
  }

  buildBarriers() {
    this.barriers.entry = new Barrier(this, {
      id: 'entry', name: 'Entrance Barrier', x: -14.2, z: 11.0, crossX: -11.5, crossZ: 10.6, armLength: 5.1,
    });
    this.barriers.exit = new Barrier(this, {
      id: 'exit', name: 'Exit Barrier', x: 8.1, z: 11.0, crossX: 10.4, crossZ: 10.6, armLength: 5.1,
    });
  }

  buildBays() {
    const lineM = new THREE.MeshBasicMaterial({ color: 0xc6d1d9, transparent: true, opacity: .6 });
    const rows = [{ key: 'A', z: -5.8, suffix: 'A' }, { key: 'B', z: 5.8, suffix: 'B' }];
    let n = 1;
    for (const row of rows) {
      for (let i = 0; i < 9; i++) {
        const x = -12 + i * 2.6;
        const id = `P-${String(n).padStart(2, '0')}`;
        const slot = {
          id, num: n, row: row.key, x, z: row.z, status: 'available',
          vehicleId: null, disabled: false, reserved: false, sensorId: `slot-${String(n).padStart(2, '0')}`,
          fillMat: null, lineMat: null, root: null, label: null, unauthorized: false,
        };
        const root = group(`slot-${id}`);
        const fillMat = new THREE.MeshBasicMaterial({ color: SLOT_STATUS.available.color, transparent: true, opacity: .11, depthWrite: false });
        const fill = new THREE.Mesh(new THREE.PlaneGeometry(2.28, 4.8), fillMat);
        fill.rotation.x = -Math.PI / 2;
        fill.position.set(x, .035, row.z);
        root.add(fill);
        const innerZ = row.z + (row.z > 0 ? -2.36 : 2.36);
        const lineMat = new THREE.MeshBasicMaterial({ color: SLOT_STATUS.available.color, transparent: true, opacity: .9 });
        const line = box(2.3, .016, .09, lineMat, { pos: [x, .04, innerZ], cast: false, receive: false });
        root.add(line);
        // side separators
        root.add(box(.06, .014, 4.8, lineM, { pos: [x - 1.3, .034, row.z], cast: false, receive: false }));
        // front curb
        root.add(box(2.5, .1, .16, material(0x565f66, { roughness: .85 }), { pos: [x, .05, row.z + (row.z > 0 ? 2.45 : -2.45)], cast: false }));
        const label = textSprite(id, { size: 38, color: '#d5f6ee', bg: 'rgba(4,14,22,.72)', border: 'rgba(54,226,194,.32)', scale: .6 });
        label.position.set(x, .85, innerZ + (row.z > 0 ? .1 : -.1));
        label.visible = this.labelsVisible;
        root.add(label);
        this.cat.slots.add(root);
        this.addObject(root, {
          id: `slot.${id}`, label: `Parking Bay ${id}`, kind: 'slot', iconName: 'parking',
          description: `${row.key === 'A' ? 'North canopy row' : 'South open row'} · occupancy sensing bay`,
        });
        slot.root = root; slot.fillMat = fillMat; slot.lineMat = lineMat; slot.label = label;
        this.slots.push(slot); this.slotById.set(id, slot);
        n++;
      }
    }
    // row signs
    for (const [label, z] of [['ROW A', -10.0], ['ROW B', 10.0]]) {
      const sign = signBoard(label, 1.8, .5, { bg: '#07141d', border: '#2a7f8d' });
      sign.position.set(12.3, 1.8, z);
      this.cat.signs.add(sign);
      this.cat.signs.add(box(.1, 1.8, .1, material(0x64737e, { metalness: .6 }), { pos: [12.3, .9, z] }));
    }
    // EV-style chargers at ends? small bollards
    for (const x of [-13.4, 9.5]) {
      const post = cylinder(.18, .22, 1.1, material(0x43545f, { metalness: .4 }), { pos: [x, .55, 2.8] });
      this.cat.equipment.add(post);
      const led = new THREE.Mesh(new THREE.SphereGeometry(.05, 10, 8), emissive(0x36e2c2, 1.4));
      led.position.set(x, 1.05, 2.8);
      this.cat.equipment.add(led);
    }
  }

  buildSlotSensorNodes() {
    for (const slot of this.slots) {
      const sensor = this.sensors.get(slot.sensorId);
      if (!sensor) continue;
      const innerZ = slot.z + (slot.z > 0 ? -2.05 : 2.05);
      const node = this.createSensorNode(sensor, {
        scale: .7, position: [slot.x, .2, innerZ], rotation: [0, slot.z > 0 ? Math.PI : 0, 0], label: false,
      });
      node.userData.slotId = slot.id;
      this.cat.sensors.add(node);
      slot.sensorNode = node;
    }
  }

  buildLighting() {
    const positions = [[-15.3, -6.5], [12.6, -6.5], [-15.3, 6.5], [12.6, 6.5]];
    positions.forEach(([x, z], i) => {
      const lamp = makeLampPost(6.3);
      lamp.position.set(x, 0, z);
      lamp.rotation.y = x < 0 ? 0 : Math.PI;
      this.cat.lighting.add(lamp);
      this.lights.push({ light: lamp.userData.light, mat: lamp.userData.lampMaterial, base: 8, baseEmissive: 1.8 });
      this.addObject(lamp, { id: `lamp-${i + 1}`, label: `Perimeter Light L-${i + 1}`, kind: 'lamp', iconName: 'light', description: 'Automated LED site lighting.' });
    });
    this.setLightingState(this.config.lightingOn !== false);
  }

  setLightingState(on) {
    this.lightingOn = on;
    for (const l of this.lights) {
      if (!l.light) continue;
      l.light.intensity = on ? l.base : 0;
      if (l.mat) l.mat.emissiveIntensity = on ? l.baseEmissive : 0;
    }
  }

  buildRoadFurniture() {
    const pSign = makeRoadSign('P', { height: 3.1, w: 1.2, h: 1.2, bg: '#0a3550', border: '#48b2e8', color: '#dcf4ff' });
    pSign.position.set(-16.4, 0, 13.0);
    this.cat.signs.add(pSign);
    const entrySign = makeRoadSign('SMART PARKING  ›', { height: 2.4, w: 2.2, h: .5, bg: '#071a20', border: '#36e2c2' });
    entrySign.position.set(-17.1, 0, 12.2);
    this.cat.signs.add(entrySign);
    const exitSign = makeRoadSign('‹  EXIT', { height: 2.3, w: 1.7, h: .5, bg: '#1a1307', border: '#ffb547' });
    exitSign.position.set(13.5, 0, 12.3);
    this.cat.signs.add(exitSign);
    for (const [x, z] of [[-7.8, 11.6], [7.2, 11.6], [-6.2, 10.4], [8.7, 10.4]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(.16, .6, 14), material(0xe67a37, { roughness: .8 }));
      cone.position.set(x, .3, z);
      cone.castShadow = true;
      this.cat.signs.add(cone);
      this.cat.signs.add(box(.36, .04, .36, material(0x3b3f42), { pos: [x, .02, z] }));
    }
    // speed bump at exit
    const bump = box(4.8, .12, .5, material(0xc6a13e, { roughness: .8 }), { pos: [10.4, .08, 8.4] });
    this.cat.floor.add(bump);
    // painted "EV" bays end markers
    const ev = signBoard('EV', .7, .34, { bg: '#06281f', border: '#3ce58b' });
    ev.position.set(-13.4, 1.45, 2.8);
    ev.rotation.y = -.2;
    this.cat.signs.add(ev);
  }

  buildSecurity() {
    const cam1 = makeSecurityCamera();
    cam1.position.set(-14.2, 3.1, 7.0);
    cam1.rotation.y = -.8;
    this.cat.security.add(cam1);
    this.addObject(cam1, { id: 'cctv-1', label: 'CCTV Camera 01', kind: 'camera', iconName: 'camera', description: 'Security booth overview camera.' });
    const cam2 = makeSecurityCamera(0xb8c5ce);
    cam2.position.set(9.9, 5.9, -3.3);
    cam2.rotation.set(0, Math.PI, 0);
    this.cat.security.add(cam2);
    this.addObject(cam2, { id: 'cctv-2', label: 'CCTV Camera 02', kind: 'camera', iconName: 'camera', description: 'Canopy aisle surveillance camera.' });
    this.cctv = [{ id: 'cctv-1', on: true, group: cam1 }, { id: 'cctv-2', on: true, group: cam2 }];
    // warning signage
    const cctvSign = signBoard('CCTV IN OPERATION', 2.0, .36, { bg: '#1b1004', border: '#f6b44b', color: '#ffdc9a' });
    cctvSign.position.set(-15.9, 2.0, 8.75);
    cctvSign.rotation.y = .1;
    this.cat.signs.add(cctvSign);
  }

  buildWiring() {
    const cableM = material(0x22333f, { roughness: .6, metalness: .2 });
    const path = pipe([[-14.2, .12, 8.55], [-14.0, .12, 9.6], [-13.9, .12, 10.6], [-9.5, .12, 10.4], [-9.2, .12, 7.2], [-9.5, .12, 2.3], [7.5, .12, 2.3], [8.0, .12, 8.9], [8.2, .12, 10.5]], .045, cableM, { radial: 6 });
    this.cat.wiring.add(path);
    for (const x of [-14.0, -9.5, 7.5]) {
      this.cat.wiring.add(box(.24, .12, .4, material(0x2d3c45), { pos: [x, .06, 2.3] }));
    }
  }

  buildAmbientSensors() {
    const temp = this.createSensorNode('ambient-temp', { scale: .85, position: [-14.2, 1.7, 8.4], label: true, labelOffset: .5, labelScale: .48 });
    this.cat.sensors.add(temp);
    const hum = this.createSensorNode('booth-humidity', { scale: .8, position: [-13.0, 1.7, 8.4], label: false });
    this.cat.sensors.add(hum);
    // entry / exit loop sensor nodes
    const entry = this.createSensorNode('entry-loop', { scale: .8, position: [-14.2, .95, 12.4], label: false });
    this.cat.sensors.add(entry);
    const exit = this.createSensorNode('exit-loop', { scale: .8, position: [8.1, .95, 12.4], label: false });
    this.cat.sensors.add(exit);
  }

  buildEquipment() {
    this.addEquipment({ id: 'entry-barrier', name: 'Entrance Barrier', type: 'barrier', iconName: 'gate', objectId: 'gate-entry', status: () => this.barriers.entry.state, tone: () => this.barriers.entry.statusTone() });
    this.addEquipment({ id: 'exit-barrier', name: 'Exit Barrier', type: 'barrier', iconName: 'gate', objectId: 'gate-exit', status: () => this.barriers.exit.state, tone: () => this.barriers.exit.statusTone() });
    this.addEquipment({ id: 'occupancy-array', name: 'Occupancy Sensor Array', type: 'sensing', iconName: 'sensor', status: () => `${this.slots.filter(s => s.status === 'occupied').length}/18 OCCUPIED`, tone: () => 'ok' });
    this.addEquipment({ id: 'access-controller', name: 'Access Control Node', type: 'controller', iconName: 'shield', objectId: 'access-controller', status: () => this.manualMode ? 'MANUAL' : 'AUTO', tone: () => this.manualMode ? 'warn' : 'ok' });
    this.addEquipment({ id: 'cctv-1', name: 'CCTV Camera 01', type: 'surveillance', iconName: 'camera', objectId: 'cctv-1', status: () => this.cctv[0].on ? 'RECORDING' : 'STANDBY', tone: () => this.cctv[0].on ? 'ok' : 'muted' });
    this.addEquipment({ id: 'cctv-2', name: 'CCTV Camera 02', type: 'surveillance', iconName: 'camera', objectId: 'cctv-2', status: () => this.cctv[1].on ? 'RECORDING' : 'STANDBY', tone: () => this.cctv[1].on ? 'ok' : 'muted' });
    this.addEquipment({ id: 'lighting', name: 'Site Lighting Circuit', type: 'electrical', iconName: 'light', objectId: 'lamp-1', status: () => this.lightingOn ? 'ENERGISED' : 'OFFLINE', tone: () => this.lightingOn ? 'ok' : 'warn' });
    this.addEquipment({ id: 'booth', name: 'Security Booth', type: 'facility', iconName: 'shield', objectId: 'booth', status: () => 'STAFFED', tone: () => 'ok' });
    this.addEquipment({ id: 'canopy', name: 'Canopy Structure', type: 'structure', iconName: 'layers', objectId: 'lamp-1', status: () => 'STRUCTURAL', tone: () => 'muted' });
  }

  buildBackground() {
    const bgM = material(0x0a1219, { roughness: .96, metalness: 0 });
    for (let i = 0; i < 7; i++) {
      const w = 7 + Math.random() * 8, h = 2.5 + Math.random() * 4.5, d = 5 + Math.random() * 5;
      const x = -52 + i * 17 + Math.random() * 4;
      const b = box(w, h, d, bgM, { pos: [x, h / 2 - .1, -52 - Math.random() * 14], cast: false, receive: false });
      this.scene.world.add(b);
      const stripe = box(w * .7, .06, .08, new THREE.MeshBasicMaterial({ color: 0x2b7d86, transparent: true, opacity: .3 }), { pos: [x, h * .62, -52 + d / 2 + .1], cast: false });
      this.scene.world.add(stripe);
    }
  }

  /* =========================================================
     Sensors & alarms
     ========================================================= */
  defineSensors() {
    const defs = [];
    for (let i = 1; i <= 18; i++) {
      defs.push({
        id: `slot-${String(i).padStart(2, '0')}`, name: `Occupancy P-${String(i).padStart(2, '0')}`,
        unit: '', min: 0, max: 1, digits: 0, value: 0, iconName: 'parking',
        alarmLow: -1, alarmHigh: 2, kind: 'occupancy',
      });
    }
    defs.push({ id: 'entry-loop', name: 'Entry Loop Detector', unit: 'm', min: 0, max: 8, digits: 1, value: 8, iconName: 'sensor', alarmLow: -1, alarmHigh: 9 });
    defs.push({ id: 'exit-loop', name: 'Exit Loop Detector', unit: 'm', min: 0, max: 8, digits: 1, value: 8, iconName: 'sensor', alarmLow: -1, alarmHigh: 9 });
    defs.push({ id: 'ambient-temp', name: 'Ambient Temperature', unit: '°C', min: -10, max: 55, digits: 1, value: 22.5, iconName: 'thermometer', alarmLow: 2, alarmHigh: 44 });
    defs.push({ id: 'booth-humidity', name: 'Booth Humidity', unit: '%', min: 0, max: 100, digits: 0, value: 44, iconName: 'droplet', alarmLow: 15, alarmHigh: 85 });
    return defs;
  }

  defineAlarmRules() {
    return [
      {
        id: 'parking-full', title: 'Parking Facility Near Capacity', severity: 'warning',
        thresholdKey: 'fullPercent', defaultThreshold: 95, thresholdLabel: 'Full threshold', thresholdUnit: '%', thresholdMin: 50, thresholdMax: 100, thresholdStep: 1,
        message: () => `Occupancy has reached ${this.occupancyPercent().toFixed(1)}% of usable bays.`,
        active: () => this.occupancyPercent() >= this.threshold('fullPercent', 95),
      },
      {
        id: 'overstay', title: 'Vehicle Overstay', severity: 'warning',
        thresholdKey: 'overstayMinutes', defaultThreshold: 15, thresholdLabel: 'Overstay limit', thresholdUnit: 'min', thresholdMin: 1, thresholdMax: 240, thresholdStep: 1,
        message: () => {
          const v = this.overstayingVehicle();
          return v ? `${v.plate} in ${v.slotId} exceeded ${this.threshold('overstayMinutes', 15)} min parking limit.` : 'A vehicle exceeded the permitted parking duration.';
        },
        active: () => !!this.overstayingVehicle(),
      },
      {
        id: 'gate-open', title: 'Gate Left Open', severity: 'warning',
        thresholdKey: 'gateOpenSeconds', defaultThreshold: 60, thresholdLabel: 'Open alarm delay', thresholdUnit: 's', thresholdMin: 5, thresholdMax: 900, thresholdStep: 5,
        message: () => 'A barrier remains open with no vehicle present.',
        active: () => {
          const limit = this.threshold('gateOpenSeconds', 60);
          return Object.values(this.barriers).some(b => b.angle > 1.25 && b.openSince !== null && this.simTime - b.openSince > limit && !b.near);
        },
      },
      {
        id: 'sensor-fault', title: 'Detection Sensor Failure', severity: 'critical',
        message: () => 'Entry loop detector is not responding. Barrier safety degraded.',
        active: () => this.faults.sensor,
      },
      {
        id: 'unauthorized', title: 'Unauthorized Occupancy', severity: 'warning',
        message: () => this.unauthorizedSlot ? `Bay ${this.unauthorizedSlot.id} reports occupancy with no registered vehicle.` : 'Unregistered occupancy detected.',
        active: () => !!this.unauthorizedSlot,
      },
    ];
  }

  getAnalyticsDefs() {
    return [
      { id: 'occupancy', label: 'Occupancy', unit: '%', color: '#36e2c2', get: () => this.occupancyPercent(), digits: 1, primary: true },
      { id: 'occupied', label: 'Occupied Bays', unit: 'bays', color: '#ff6172', get: () => this.slots.filter(s => s.status === 'occupied').length, digits: 0 },
      { id: 'available', label: 'Available Bays', unit: 'bays', color: '#3ce58b', get: () => this.slots.filter(s => s.status === 'available').length, digits: 0 },
      { id: 'entered', label: 'Vehicles Entered', unit: 'vehicles', color: '#46a9ff', get: () => this.enteredTotal, digits: 0 },
    ];
  }

  primarySeriesIds() { return ['occupancy']; }

  occupancyPercent() {
    const usable = this.slots.filter(s => !s.disabled).length || 1;
    const occupied = this.slots.filter(s => s.status === 'occupied' || s.status === 'reserved').length;
    return (occupied / usable) * 100;
  }

  overstayingVehicle() {
    const limit = this.threshold('overstayMinutes', 15) * 60;
    return this.vehicles.find(v => v.state === 'parked' && this.simTime - v.parkedAt > limit);
  }

  /* =========================================================
     Simulation
     ========================================================= */
  updateSimulation(dt) {
    this.popupCooldown = Math.max(0, this.popupCooldown - dt);
    this.barriers.entry.update(dt);
    this.barriers.exit.update(dt);
    this.updateVehicles(dt);
    this.updatePendingArrivals(dt);
    this.updateAutomaticSpawning(dt);
    this.updateSensorValues();
    this.updateCCTV(dt);
    this.updateSlotPulse(dt);
  }

  updateSensorValues() {
    for (const slot of this.slots) {
      this.setSensorValue(slot.sensorId, slot.status === 'occupied' || slot.unauthorized ? 1 : 0);
    }
    const entryDist = this.nearestVehicleDistance('arriving', this.barriers.entry.crossPoint);
    const exitDist = this.nearestVehicleDistance('departing', this.barriers.exit.crossPoint);
    this.setSensorValue('entry-loop', entryDist === null ? 8 : Math.min(8, entryDist));
    this.setSensorValue('exit-loop', exitDist === null ? 8 : Math.min(8, exitDist));
    const hour = (this.simTime / 3600) % 24;
    this.setSensorValue('ambient-temp', 21 + Math.sin((hour - 8) / 24 * Math.PI * 2) * 5 + this.slots.filter(s => s.status === 'occupied').length * .08);
    this.setSensorValue('booth-humidity', 43 + Math.sin(this.simTime / 700) * 4);
  }

  nearestVehicleDistance(state, point) {
    let best = null;
    for (const v of this.vehicles) {
      if (v.state !== state) continue;
      const d = v.group.position.distanceTo(point);
      if (best === null || d < best) best = d;
    }
    return best;
  }

  updateCCTV(dt) {
    this._cctvTime = (this._cctvTime || 0) + dt;
    for (const c of this.cctv) {
      const led = c.group.userData.led;
      if (led) led.material.emissiveIntensity = c.on ? (Math.sin(this._cctvTime * 3) > 0 ? 2 : .2) : .01;
    }
  }

  updateSlotPulse(dt) {
    this._pulseTime = (this._pulseTime || 0) + dt;
    for (const slot of this.slots) {
      if (!slot.fillMat) continue;
      const base = slot.status === 'available' ? .085 : slot.status === 'reserved' ? .17 : slot.status === 'occupied' ? .15 : .06;
      slot.fillMat.opacity = base + (slot.status === 'reserved' ? Math.sin(this._pulseTime * 3) * .05 : 0);
    }
  }

  updateAutomaticSpawning(dt) {
    const spawn = this.config.spawn;
    if (!spawn.autoSpawn || this.manualMode || !this.running) return;
    this.spawnTimer += dt;
    const base = Math.max(4, spawn.interval || 22);
    if (this._nextSpawnInterval === undefined) {
      this._nextSpawnInterval = spawn.arrivalMode === 'random' ? base * (0.6 + Math.random() * .9) : base;
    }
    if (this.spawnTimer < this._nextSpawnInterval) return;
    this.spawnTimer = 0;
    this._nextSpawnInterval = spawn.arrivalMode === 'random' ? base * (0.6 + Math.random() * .9) : base;
    if (this.vehicles.length >= (spawn.maxVehicles || 12)) return;
    const free = this.slots.filter(s => s.status === 'available' && !s.disabled);
    if (!free.length) {
      if (this.popupCooldown <= 0) { this.popupCooldown = 60; this.logEvent('Facility full', 'No available bays for arriving vehicle.', 'warn'); }
      return;
    }
    this.spawnVehicle({ automatic: true });
  }

  updatePendingArrivals(dt) {
    if (!this.pendingArrivals.length) return;
    const due = this.pendingArrivals.filter(p => p.due <= this.simTime);
    this.pendingArrivals = this.pendingArrivals.filter(p => p.due > this.simTime);
    for (const p of due) this.spawnVehicle(p.options);
  }

  updateVehicles(dt) {
    for (const v of [...this.vehicles]) {
      if (v.state === 'parked') {
        if (this.simTime >= v.departAt) this.departVehicle(v);
        continue;
      }
      // gate holds
      const gate = v.state === 'arriving' ? this.barriers.entry : this.barriers.exit;
      const gateDist = v.group.position.distanceTo(gate.crossPoint);
      if (gateDist < 5.2 && gate.angle < 1.05) {
        v.waiting = true;
        continue;
      }
      v.waiting = false;
      const move = (v.speed * dt) / v.pathLength;
      v.t += move;
      const t = Math.min(v.t, .999999);
      const p = v.curve.getPointAt(t);
      const tan = v.curve.getTangentAt(t);
      v.group.position.set(p.x, 0, p.z);
      v.group.rotation.y = Math.atan2(-tan.z, tan.x);
      const wheelDelta = (v.speed * dt) / .37;
      for (const w of v.group.userData.wheels || []) w.rotation.z -= wheelDelta;
      if (v.t >= 1) {
        if (v.state === 'arriving') this.parkVehicle(v);
        else this.completeDeparture(v);
      }
    }
  }

  updateSimulationUi() { /* panel bindings handle UI */ }

  /* =========================================================
     Vehicle lifecycle
     ========================================================= */
  spawnVehicle(options = {}) {
    const spawn = this.config.spawn;
    let slot = null;
    const preferred = options.slotId || (spawn.preferredSlot !== 'random' ? spawn.preferredSlot : null);
    if (preferred) {
      const s = this.slotById.get(preferred);
      if (s && s.status === 'available' && !s.disabled && !s.unauthorized) slot = s;
    }
    if (!slot) {
      const free = this.slots.filter(s => s.status === 'available' && !s.disabled && !s.unauthorized);
      if (!free.length) {
        toast('No available parking bays.', { type: 'warn', title: 'Parking Full' });
        this.logEvent('Spawn rejected', 'No available bays.', 'warn');
        return null;
      }
      slot = free[Math.floor(Math.random() * free.length)];
    }
    const colorName = options.color || spawn.color || 'Aqua';
    const color = options.colorHex ?? (CAR_COLORS.find(c => c.name === colorName)?.hex ?? 0x33c7b0);
    const type = options.type || spawn.type || 'sedan';
    const plate = this.makePlate();
    const car = makeCar(color, { type });
    this.cat.vehicles.add(car);
    const path = this.makeArrivalPath(slot);
    const t0 = path.getPointAt(0);
    car.position.set(t0.x, 0, t0.z);
    const label = textSprite(plate, { size: 30, scale: .52, color: '#dff8f2', bg: 'rgba(4,14,22,.7)', border: 'rgba(54,226,194,.3)' });
    label.position.set(0, 2.15, 0);
    label.visible = this.labelsVisible;
    car.add(label);
    const id = `vehicle.${plate}`;
    this.addObject(car, { id, label: `${plate} · ${type.toUpperCase()}`, kind: 'vehicle', iconName: 'vehicle', description: `Registered vehicle assigned to bay ${slot.id}.` });
    const duration = options.durationSeconds ?? this.pickParkingDuration();
    const v = {
      id, plate, slotId: slot.id, colorName, color, type, group: car, curve: path,
      pathLength: path.getLength(), t: 0, speed: options.speed ?? spawn.speed ?? 2.6,
      state: 'arriving', arrivalSim: this.simTime, parkedAt: null,
      departAt: this.simTime + duration, duration, waiting: false, createdAt: this.simTime,
      label, automatic: !!options.automatic,
    };
    this.vehicles.push(v);
    this.vehicleByObjectId.set(id, v);
    slot.status = 'reserved'; slot.vehicleId = plate; this.refreshSlot(slot);
    this.logEvent('Vehicle arriving', `${plate} routed to bay ${slot.id}.`, 'info');
    this.saveSoon();
    return v;
  }

  pickParkingDuration() {
    const s = this.config.spawn;
    const min = Math.max(30, s.durationMin || 180), max = Math.max(min, s.durationMax || 540);
    return min + Math.random() * (max - min);
  }

  makePlate() {
    this._plateCounter = (this._plateCounter || 0) + 1;
    const n = 1000 + vehicleSerial + this._plateCounter * 7;
    return `NX-${String(n).slice(-4)}`;
  }

  makeArrivalPath(slot) {
    const sx = slot.x;
    const inner = slot.z > 0 ? 2.55 : -2.55;
    const points = [
      new THREE.Vector3(-27, 0, 14.4),
      new THREE.Vector3(-18, 0, 14.4),
      new THREE.Vector3(-13.2, 0, 13.2),
      new THREE.Vector3(-11.5, 0, 11.2),
      new THREE.Vector3(-11.5, 0, 6.2),
      new THREE.Vector3(-11.5, 0, 1.0),
      new THREE.Vector3(sx, 0, 1.0),
      new THREE.Vector3(sx, 0, inner),
      new THREE.Vector3(sx, 0, slot.z),
    ];
    return new THREE.CatmullRomCurve3(points, false, 'centripetal', .25);
  }

  makeDeparturePath(slot) {
    const sx = slot.x;
    const points = [
      new THREE.Vector3(sx, 0, slot.z),
      new THREE.Vector3(sx, 0, slot.z > 0 ? 1.6 : -1.6),
      new THREE.Vector3(sx, 0, 1.0),
      new THREE.Vector3(4.8, 0, 1.0),
      new THREE.Vector3(9.4, 0, 3.0),
      new THREE.Vector3(10.4, 0, 7.5),
      new THREE.Vector3(10.4, 0, 11.2),
      new THREE.Vector3(12.2, 0, 13.3),
      new THREE.Vector3(18, 0, 14.4),
      new THREE.Vector3(28, 0, 14.4),
    ];
    return new THREE.CatmullRomCurve3(points, false, 'centripetal', .25);
  }

  parkVehicle(v) {
    v.state = 'parked';
    v.parkedAt = this.simTime;
    const slot = this.slotById.get(v.slotId);
    const p = v.curve.getPointAt(1);
    v.group.position.set(p.x, 0, p.z);
    const tan = v.curve.getTangentAt(.999);
    v.group.rotation.y = Math.atan2(-tan.z, tan.x);
    if (slot) { slot.status = 'occupied'; slot.vehicleId = v.plate; this.refreshSlot(slot); }
    this.enteredTotal++;
    this.logEvent('Vehicle parked', `${v.plate} occupied bay ${v.slotId}.`, 'ok');
    this.saveSoon();
  }

  departVehicle(v) {
    if (!v || v.state === 'departing' || v.state === 'gone') return;
    const slot = this.slotById.get(v.slotId);
    if (v.state === 'arriving') { this.removeVehicle(v, 'removed before arrival'); return; }
    v.state = 'departing';
    v.curve = this.makeDeparturePath(slot || { x: 0, z: 0 });
    v.pathLength = v.curve.getLength();
    v.t = 0;
    v.departAt = this.simTime;
    v.departing = true;
    if (slot) { slot.status = 'reserved'; this.refreshSlot(slot); }
    this.logEvent('Vehicle departing', `${v.plate} leaving bay ${v.slotId}.`, 'info');
    this.saveSoon();
  }

  completeDeparture(v) {
    const slot = this.slotById.get(v.slotId);
    if (slot) { slot.status = 'available'; slot.vehicleId = null; this.refreshSlot(slot); }
    this.exitedTotal++;
    this.logEvent('Vehicle exited', `${v.plate} passed the exit barrier.`, 'ok');
    this.removeVehicle(v, 'departed');
    this.saveSoon();
  }

  removeVehicle(v, reason = '') {
    if (!v) return;
    const slot = this.slotById.get(v.slotId);
    if (slot) {
      slot.status = slot.disabled ? 'disabled' : 'available';
      slot.vehicleId = null;
      this.refreshSlot(slot);
    }
    this.scene.unregister(v.id);
    this.objects.delete(v.id);
    if (v.group.parent) v.group.parent.remove(v.group);
    this.vehicleByObjectId.delete(v.id);
    this.vehicles = this.vehicles.filter(x => x !== v);
    if (reason && reason !== 'departed') this.logEvent('Vehicle removed', `${v.plate} removed from facility.`, 'warn');
    if (this.selectedId === v.id) this.closeInspector();
    this.saveSoon();
  }

  clearVehicles() {
    for (const v of [...this.vehicles]) this.removeVehicle(v, 'cleared');
    toast('All vehicles removed from the facility.', { type: 'info' });
  }

  refreshSlot(slot) {
    if (!slot) return;
    const st = SLOT_STATUS[slot.status] || SLOT_STATUS.available;
    if (slot.fillMat) { slot.fillMat.color.setHex(st.color); slot.fillMat.opacity = slot.status === 'disabled' ? .06 : .13; }
    if (slot.lineMat) { slot.lineMat.color.setHex(st.color); slot.lineMat.opacity = slot.status === 'disabled' ? .3 : .9; }
    if (slot.sensorNode) slot.sensorNode.userData.status = slot.status;
  }

  /* =========================================================
     Initial population
     ========================================================= */
  onAfterMount() {
    setTimeout(() => { if (this._destroyed) return; this.populateInitialParkedVehicles(5); }, 120);
  }

  populateInitialParkedVehicles(count) {
    const free = this.slots.filter(s => s.status === 'available' && !s.disabled);
    for (let i = 0; i < Math.min(count, free.length); i++) {
      const slot = free[Math.floor(Math.random() * free.length)];
      if (slot.status !== 'available') continue;
      const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
      const type = VEHICLE_TYPES[Math.floor(Math.random() * VEHICLE_TYPES.length)].value;
      const car = makeCar(color.hex, { type });
      car.position.set(slot.x, 0, slot.z);
      car.rotation.y = slot.z > 0 ? -Math.PI / 2 : Math.PI / 2;
      const plate = this.makePlate();
      const label = textSprite(plate, { size: 30, scale: .52, color: '#dff8f2', bg: 'rgba(4,14,22,.7)', border: 'rgba(54,226,194,.3)' });
      label.position.set(0, 2.15, 0); label.visible = this.labelsVisible; car.add(label);
      this.cat.vehicles.add(car);
      const id = `vehicle.${plate}`;
      this.addObject(car, { id, label: `${plate} · ${type.toUpperCase()}`, kind: 'vehicle', iconName: 'vehicle', description: `Registered vehicle assigned to bay ${slot.id}.` });
      const alreadyParked = 120 + Math.random() * 420;
      const v = {
        id, plate, slotId: slot.id, colorName: color.name, color: color.hex, type, group: car,
        curve: null, pathLength: 0, t: 1, speed: this.config.spawn.speed, state: 'parked',
        arrivalSim: this.simTime - alreadyParked, parkedAt: this.simTime - alreadyParked, departAt: this.simTime + this.pickParkingDuration(),
        duration: 0, waiting: false, label, createdAt: this.simTime - alreadyParked,
      };
      this.vehicles.push(v);
      this.vehicleByObjectId.set(id, v);
      slot.status = 'occupied'; slot.vehicleId = plate; this.refreshSlot(slot);
      this.setSensorValue(slot.sensorId, 1);
    }
    this.enteredTotal = this.vehicles.length;
    this.logEvent('Initial occupancy', `${this.enteredTotal} vehicles present at facility start.`, 'info');
  }

  /* =========================================================
     Inspector
     ========================================================= */
  getObjectInspector(obj) {
    switch (obj.kind) {
      case 'slot': return this.slotInspector(obj);
      case 'vehicle': return this.vehicleInspector(obj);
      case 'gate': return this.gateInspector(obj);
      case 'booth': return this.boothInspector(obj);
      case 'lamp': return this.lampInspector(obj);
      case 'camera': return this.cameraInspector(obj);
      case 'controller': return this.controllerInspector(obj);
      default: return this.defaultInspector(obj);
    }
  }

  slotInspector(obj) {
    const slotId = obj.id.replace('slot.', '');
    const slot = this.slotById.get(slotId);
    if (!slot) return this.defaultInspector(obj);
    const vehicle = this.vehicles.find(v => v.slotId === slot.id);
    const status = () => slot.unauthorized ? 'UNAUTHORIZED' : (SLOT_STATUS[slot.status]?.label || 'AVAILABLE');
    const tone = () => slot.status === 'occupied' || slot.unauthorized ? 'danger' : slot.status === 'reserved' ? 'warn' : slot.status === 'disabled' ? 'muted' : 'ok';
    const controls = [
      { type: 'toggle', label: 'Disable parking bay', description: 'Closes the bay to new arrivals.', value: slot.disabled, onChange: v => {
        if (slot.vehicleId || vehicle) { toast('Remove or depart the assigned vehicle first.', { type: 'warn' }); return; }
        slot.disabled = v; slot.status = v ? 'disabled' : 'available'; this.refreshSlot(slot); this.saveSoon(); this.renderInspector();
      } },
    ];
    if (!vehicle && !slot.disabled && slot.status === 'available') {
      controls.push({ type: 'button', label: 'Reserve Bay', variant: 'subtle', iconName: 'clock', onClick: () => {
        slot.status = 'reserved'; slot.reserved = true; this.refreshSlot(slot); this.logEvent('Bay reserved', `${slot.id} manually reserved.`, 'info'); this.saveSoon(); this.renderInspector();
      } });
    }
    if (!vehicle && (slot.status === 'reserved' || slot.reserved)) {
      controls.push({ type: 'button', label: 'Release Reservation', variant: 'ghost', iconName: 'close', onClick: () => {
        slot.status = 'available'; slot.reserved = false; this.refreshSlot(slot); this.logEvent('Reservation released', `${slot.id} returned to available.`, 'info'); this.saveSoon(); this.renderInspector();
      } });
    }
    if (vehicle) {
      const departMinutes = Math.max(1, Math.round((vehicle.departAt - this.simTime) / 60));
      controls.push({ type: 'number', label: 'Departure in (minutes)', unit: 'min', min: 1, max: 720, step: 1, value: departMinutes, onChange: v => { vehicle.departAt = this.simTime + v * 60; this.saveSoon(); this.refreshInspector(); } });
      controls.push({ type: 'button', label: 'Open Vehicle Inspector', variant: 'subtle', iconName: 'vehicle', onClick: () => this.selectObject(vehicle.id) });
      controls.push({ type: 'button', label: 'Extend Stay +15 min', iconName: 'clock', onClick: () => { vehicle.departAt += 900; this.saveSoon(); this.renderInspector(); toast(`Departure extended for ${vehicle.plate}.`, { type: 'ok' }); } });
      controls.push({ type: 'button', label: 'Depart Now', variant: 'warn', iconName: 'exit', onClick: () => { this.departVehicle(vehicle); this.renderInspector(); } });
      controls.push({ type: 'button', label: 'Remove Vehicle', variant: 'danger', iconName: 'trash', onClick: () => { this.removeVehicle(vehicle); this.renderInspector(); } });
    }
    const vehicleLabel = vehicle ? `${vehicle.plate} · ${vehicle.type.toUpperCase()}` : (slot.reserved ? 'Reserved · no vehicle' : slot.unauthorized ? 'Unauthorized vehicle object' : '—');
    return {
      title: `Parking Bay ${slot.id}`,
      subtitle: `BAY · ${slot.row === 'A' ? 'NORTH CANOPY ROW' : 'SOUTH OPEN ROW'}`,
      iconName: 'parking',
      badge: { text: status(), tone: tone() },
      fields: [
        { label: 'Bay ID', value: slot.id },
        { label: 'Row', value: slot.row === 'A' ? 'A · Canopy' : 'B · Open air' },
        { label: 'Occupancy sensor', value: slot.sensorId },
        { label: 'Assigned vehicle', value: vehicleLabel },
        { label: 'Arrival', get: () => vehicle ? ui.fmtTime(vehicle.arrivalSim) : '—' },
        { label: 'Parked duration', get: () => vehicle && vehicle.parkedAt ? ui.fmtDuration(this.simTime - vehicle.parkedAt) : '—' },
        { label: 'Departure schedule', get: () => vehicle ? ui.fmtTime(vehicle.departAt) : '—' },
      ],
      sections: [{ title: 'Bay Controls', controls }],
      note: 'Bay state is driven by the live occupancy model. Reservations and disabled bays are excluded from automatic assignment.',
    };
  }

  vehicleInspector(obj) {
    const v = this.vehicleByObjectId.get(obj.id) || this.vehicles.find(x => x.plate === obj.id.replace('vehicle.', ''));
    if (!v) return this.defaultInspector(obj);
    const stateLabel = v.state === 'parked' ? 'PARKED' : v.state === 'arriving' ? (v.waiting ? 'WAITING AT GATE' : 'ARRIVING') : 'DEPARTING';
    const tone = v.waiting ? 'warn' : v.state === 'parked' ? 'ok' : 'info';
    const controls = [];
    if (v.state === 'parked') {
      controls.push({ type: 'number', label: 'Departure in (minutes)', unit: 'min', min: 1, max: 720, step: 1, value: Math.max(1, Math.round((v.departAt - this.simTime) / 60)), onChange: val => { v.departAt = this.simTime + val * 60; this.saveSoon(); this.refreshInspector(); } });
      controls.push({ type: 'button', label: 'Change Assigned Bay', variant: 'ghost', iconName: 'parking', onClick: () => this.moveVehicleToAvailableBay(v) });
    }
    if (v.state === 'parked' || v.waiting) controls.push({ type: 'button', label: 'Depart Now', variant: 'warn', iconName: 'exit', onClick: () => { this.departVehicle(v); this.refreshInspector(); } });
    controls.push({ type: 'button', label: 'Remove Vehicle', variant: 'danger', iconName: 'trash', onClick: () => { this.removeVehicle(v); this.closeInspector(); } });
    return {
      title: v.plate,
      subtitle: `${v.type.toUpperCase()} · ${v.id}`,
      iconName: 'vehicle',
      badge: { text: stateLabel, tone },
      fields: [
        { label: 'Vehicle ID', value: v.plate },
        { label: 'Type', value: v.type.toUpperCase() },
        { label: 'Colour', value: v.colorName },
        { label: 'Assigned bay', value: v.slotId },
        { label: 'Arrival time', get: () => v.state === 'parked' ? ui.fmtTime(v.arrivalSim) : 'In transit' },
        { label: 'Parked duration', get: () => v.state === 'parked' ? ui.fmtDuration(this.simTime - v.parkedAt) : '—' },
        { label: 'Departure schedule', get: () => ui.fmtTime(v.departAt) },
        { label: 'Status', get: () => stateLabel },
      ],
      sections: controls.length ? [{ title: 'Vehicle Controls', controls }] : [],
      note: 'Departure may also be triggered automatically by the parking-duration scheduler.',
    };
  }

  moveVehicleToAvailableBay(v) {
    const free = this.slots.filter(s => s.status === 'available' && !s.disabled && !s.unauthorized);
    if (!free.length) { toast('No available bay to reassign.', { type: 'warn' }); return; }
    const old = this.slotById.get(v.slotId);
    const next = free[0];
    if (old) { old.status = 'available'; old.vehicleId = null; this.refreshSlot(old); }
    v.slotId = next.id;
    next.status = 'occupied'; next.vehicleId = v.plate; this.refreshSlot(next);
    v.group.position.set(next.x, 0, next.z);
    v.group.rotation.y = next.z > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.logEvent('Vehicle reassigned', `${v.plate} moved to bay ${next.id}.`, 'info');
    this.saveSoon(); this.renderInspector();
  }

  gateInspector(obj) {
    const id = obj.id.replace('gate-', '');
    const b = this.barriers[id];
    if (!b) return this.defaultInspector(obj);
    const cfg = b.autoConfig;
    const state = () => b.state;
    const controls = [
      { type: 'button', label: 'Open Gate', variant: 'subtle', iconName: 'unlock', onClick: () => { b.open(); this.refreshInspector(); } },
      { type: 'button', label: 'Close Gate', iconName: 'lock', onClick: () => { b.close(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Automatic barrier', description: 'Detect vehicles and operate automatically.', value: b.auto, onChange: v => { b.auto = v; cfg.auto = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Gate sensor enabled', description: 'Vehicle presence detection at this barrier.', value: b.sensorEnabled, onChange: v => { b.sensorEnabled = v; cfg.sensorEnabled = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'Opening speed', min: .3, max: 4, step: .1, value: cfg.openSpeed, unit: 'rad/s', onChange: v => { cfg.openSpeed = v; this.saveSoon(); } },
      { type: 'slider', label: 'Closing speed', min: .3, max: 4, step: .1, value: cfg.closeSpeed, unit: 'rad/s', onChange: v => { cfg.closeSpeed = v; this.saveSoon(); } },
      { type: 'slider', label: 'Automatic close delay', min: 1, max: 30, step: 1, value: cfg.autoCloseDelay, unit: 's', onChange: v => { cfg.autoCloseDelay = v; this.saveSoon(); } },
    ];
    return {
      title: b.name,
      subtitle: `BARRIER · ${b.id.toUpperCase()}`,
      iconName: 'gate',
      badge: { get text() { return state(); }, tone: b.state === 'OPEN' ? 'warn' : 'ok' },
      fields: [
        { label: 'Barrier', value: b.name },
        { label: 'State', get: state },
        { label: 'Arm angle', get: () => `${Math.round(b.angle * 57.3)}°` },
        { label: 'Automatic mode', get: () => b.auto ? 'AUTOMATIC' : 'MANUAL' },
        { label: 'Vehicle present', get: () => b.near ? 'DETECTED' : 'CLEAR' },
        { label: 'Actuation cycles', get: () => String(b.cycles) },
      ],
      sections: [{ title: 'Barrier Controls', controls }],
      note: 'The barrier animates in real time. When automatic mode is off, vehicles will wait at the gate until it is opened.',
    };
  }

  boothInspector(obj) {
    return {
      title: 'Security Booth',
      subtitle: 'STAFFED FACILITY · ACCESS CONTROL',
      iconName: 'shield',
      badge: { text: 'OPERATIONAL', tone: 'ok' },
      fields: [
        { label: 'Operator', value: 'On duty · Shift A' },
        { label: 'Access policy', value: 'Registered vehicles only' },
        { label: 'CCTV feed', value: '2 cameras online' },
        { label: 'Interior temperature', get: () => this.sensorText('ambient-temp') },
        { label: 'Interior humidity', get: () => this.sensorText('booth-humidity') },
        { label: 'Entry gate', get: () => this.barriers.entry.state },
        { label: 'Exit gate', get: () => this.barriers.exit.state },
      ],
      sections: [{ title: 'Booth Controls', controls: [
        { type: 'toggle', label: 'Site lighting circuit', description: 'Canopy, streetlights and booth task lighting.', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); this.refreshInspector(); } },
        { type: 'button', label: 'Open Access Controller', iconName: 'shield', onClick: () => this.selectObject('access-controller') },
      ] }],
      note: 'Security booth status is integrated with barrier and CCTV control.',
    };
  }

  lampInspector(obj) {
    return {
      title: obj.label,
      subtitle: 'SITE LIGHTING',
      iconName: 'light',
      badge: { text: this.lightingOn ? 'ENERGISED' : 'OFFLINE', tone: this.lightingOn ? 'ok' : 'warn' },
      fields: [
        { label: 'Circuit', value: 'LED-01 · 230 V' },
        { label: 'Output', get: () => this.lightingOn ? '100%' : '0%' },
        { label: 'Control', value: 'Photocell + manual override' },
      ],
      sections: [{ title: 'Lighting Controls', controls: [
        { type: 'toggle', label: 'Lighting circuit energised', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); this.refreshInspector(); } },
      ] }],
    };
  }

  cameraInspector(obj) {
    const cam = this.cctv.find(c => c.id === obj.id);
    if (!cam) return this.defaultInspector(obj);
    return {
      title: obj.label,
      subtitle: 'CCTV SURVEILLANCE',
      iconName: 'camera',
      badge: { text: cam.on ? 'RECORDING' : 'STANDBY', tone: cam.on ? 'ok' : 'muted' },
      fields: [
        { label: 'Camera', value: obj.id.toUpperCase() },
        { label: 'Resolution', value: '1080p · 25 fps' },
        { label: 'Recording', get: () => cam.on ? 'ACTIVE' : 'PAUSED' },
        { label: 'Storage', value: 'Local · 7 day retention' },
      ],
      sections: [{ title: 'Camera Controls', controls: [
        { type: 'toggle', label: 'Recording enabled', value: cam.on, onChange: v => { cam.on = v; this.saveSoon(); this.refreshInspector(); } },
      ] }],
    };
  }

  controllerInspector() {
    return {
      title: 'Access Control Node',
      subtitle: 'BARRIER & OCCUPANCY CONTROLLER',
      iconName: 'shield',
      badge: { text: 'ONLINE', tone: 'ok' },
      fields: [
        { label: 'Controller', value: 'ACN-01' },
        { label: 'Mode', get: () => this.manualMode ? 'MANUAL' : 'AUTOMATIC' },
        { label: 'Uptime', get: () => ui.fmtDuration(this.realTime) },
        { label: 'Barrier cycles', get: () => String(this.barriers.entry.cycles + this.barriers.exit.cycles) },
        { label: 'Registered vehicles', get: () => String(this.vehicles.length) },
      ],
      sections: [{ title: 'Controller Controls', controls: [
        { type: 'toggle', label: 'Automatic occupancy control', description: 'Master automation for incoming vehicles.', value: !this.manualMode, onChange: v => { this.setManual(!v); this.refreshInspector(); } },
        { type: 'toggle', label: 'Automatic vehicle spawning', value: this.config.spawn.autoSpawn, onChange: v => { this.config.spawn.autoSpawn = v; this.saveSoon(); this.refreshInspector(); } },
        { type: 'button', label: 'Open Simulation Center', iconName: 'sliders', onClick: () => this.setTab('simulation') },
      ] }],
    };
  }

  /* =========================================================
     Panel content
     ========================================================= */
  getOverviewMetrics() {
    const available = () => this.slots.filter(s => s.status === 'available' && !s.disabled).length;
    const occupied = () => this.slots.filter(s => s.status === 'occupied').length;
    const reserved = () => this.slots.filter(s => s.status === 'reserved').length;
    return [
      { label: 'Available Bays', bind: () => ({ value: `${available()}/18`, tone: available() === 0 ? 'danger' : 'ok', sub: `${occupied()} occupied · ${reserved()} reserved` }), iconName: 'parking', sub: 'Ready to accept' },
      { label: 'Occupancy', bind: () => ({ value: ui.fmt(this.occupancyPercent(), 1), unit: '%', tone: this.occupancyPercent() > 90 ? 'warn' : 'ok', sub: `${this.slots.filter(s => !s.disabled).length} usable bays` }), iconName: 'gauge', sub: `${occupied()} occupied · ${reserved()} reserved` },
      { label: 'Vehicles Inside', bind: () => String(this.vehicles.length), iconName: 'vehicle', sub: 'Current facility count' },
      { label: 'Entered Today', bind: () => String(this.enteredTotal), iconName: 'download', sub: 'Total arrivals' },
      { label: 'Exited Today', bind: () => String(this.exitedTotal), iconName: 'exit', sub: 'Total departures' },
      { label: 'Gate Status', bind: () => ({ value: `${this.barriers.entry.state} / ${this.barriers.exit.state}`, tone: Object.values(this.barriers).some(b => b.state === 'OPEN') ? 'warn' : 'ok' }), iconName: 'gate', sub: 'Entry / exit barriers' },
    ];
  }

  overviewExtra(body) {
    const sec = el('div', { class: 'section' });
    const title = el('div', { class: 'section-title' });
    title.innerHTML = `${ui.icon('parking', 12).outerHTML} Facility Dashboard`;
    sec.appendChild(title);
    const grid = el('div', { class: 'metric-grid' });
    const occM = ui.metric({ label: 'Occupied', bind: () => String(this.slots.filter(s => s.status === 'occupied').length), iconName: 'vehicle', compact: true });
    const resM = ui.metric({ label: 'Reserved', bind: () => String(this.slots.filter(s => s.status === 'reserved').length), iconName: 'clock', compact: true });
    const entryM = ui.metric({ label: 'Entry Gate', bind: () => ({ value: this.barriers.entry.state, tone: this.barriers.entry.state === 'OPEN' ? 'warn' : 'ok' }), iconName: 'gate', compact: true });
    const exitM = ui.metric({ label: 'Exit Gate', bind: () => ({ value: this.barriers.exit.state, tone: this.barriers.exit.state === 'OPEN' ? 'warn' : 'ok' }), iconName: 'gate', compact: true });
    grid.append(occM, resM, entryM, exitM);
    sec.appendChild(grid);
    const bar = ui.progressBar(0);
    const barWrap = el('div', { style: { marginTop: '10px' } }, el('div', { class: 'section-title', style: { margin: '0 0 5px' } }, 'LOT OCCUPANCY'), bar);
    sec.appendChild(barWrap);
    this.addPanelBind(() => { bar._set(this.occupancyPercent()); bar.className = `progress ${this.occupancyPercent() > 90 ? 'warn' : ''}`; });
    body.appendChild(sec);
    // activity log
    const logSec = el('div', { class: 'section' });
    const logTitle = el('div', { class: 'section-title' });
    logTitle.innerHTML = `${ui.icon('timeline', 12).outerHTML} Vehicle Activity Log`;
    logSec.appendChild(logTitle);
    const list = el('div', { class: 'section-card', style: { padding: '2px 10px', maxHeight: '160px', overflowY: 'auto' } });
    let last = -1;
    this.addPanelBind(() => {
      if (last === this.events.length) return;
      last = this.events.length;
      ui.clear(list);
      const items = this.events.filter(e => /Vehicle|gate|barrier|parking|Facility full/i.test(e.title)).slice(0, 6);
      if (!items.length) { list.appendChild(el('div', { class: 'empty', style: { padding: '12px' }, text: 'No vehicle activity yet.' })); return; }
      for (const e of items) list.appendChild(el('div', { class: 'kv-row' }, el('span', { class: 'k', text: e.title }), el('span', { class: 'v', text: e.time })));
    });
    logSec.appendChild(list);
    body.appendChild(logSec);
  }

  getQuickActions() {
    return [
      { label: 'Spawn Vehicle', icon: 'plus', variant: 'subtle', onClick: () => { const v = this.spawnVehicle(); if (v) toast(`${v.plate} routed to ${v.slotId}.`, { type: 'ok' }); } },
      { label: 'Open Entry Gate', icon: 'unlock', onClick: () => this.barriers.entry.open() },
      { label: 'Auto Spawn', icon: 'refresh', variant: this.config.spawn.autoSpawn ? 'subtle' : undefined, onClick: () => { this.config.spawn.autoSpawn = !this.config.spawn.autoSpawn; this.saveSoon(); this.renderPanel(); toast(`Automatic spawning ${this.config.spawn.autoSpawn ? 'enabled' : 'disabled'}.`, { type: 'info' }); } },
      { label: 'Simulation Center', icon: 'sliders', onClick: () => this.setTab('simulation') },
    ];
  }

  getLegend() {
    return [
      { color: '#35e28d', label: 'Available' },
      { color: '#ffb547', label: 'Reserved' },
      { color: '#ff4f60', label: 'Occupied' },
      { color: '#64717c', label: 'Disabled' },
    ];
  }

  buildOperations(container) {
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ui.icon('info', 13).outerHTML}<span>Barriers, vehicles, sensors and lighting are connected to the live model. Commands take effect immediately.</span>`;
    container.appendChild(note);

    const gSec = el('div', { class: 'section' });
    gSec.appendChild(el('div', { class: 'section-title' }, ui.icon('gate', 12), 'Barrier Operations'));
    for (const id of ['entry', 'exit']) {
      const b = this.barriers[id];
      const card = el('div', { class: 'section-card', style: { marginBottom: '7px' } });
      const head = el('div', { class: 'row spaced', style: { marginBottom: '7px' } });
      const state = el('span');
      this.addPanelBind(() => {
        const st = b.state;
        state.innerHTML = '';
        state.appendChild(ui.badge(st, st === 'OPEN' ? 'warn' : 'ok'));
      });
      head.append(el('b', { style: { fontSize: '10.5px' }, text: b.name }), state);
      const btns = el('div', { class: 'btn-row' });
      btns.append(
        ui.button('Open', { size: 'small', iconName: 'unlock', onClick: () => { b.open(); this.refreshLive(); } }),
        ui.button('Close', { size: 'small', iconName: 'lock', onClick: () => { b.close(); this.refreshLive(); } }),
        ui.button('Inspect', { size: 'small', variant: 'ghost', iconName: 'eye', onClick: () => this.selectObject(`gate-${id}`) }),
      );
      const autoRow = ui.toggle({ label: 'Automatic', value: b.auto, onChange: v => { b.auto = v; b.autoConfig.auto = v; this.saveSoon(); } });
      card.append(head, btns, autoRow);
      gSec.appendChild(card);
    }
    container.appendChild(gSec);

    const vSec = el('div', { class: 'section' });
    vSec.appendChild(el('div', { class: 'section-title' }, ui.icon('vehicle', 12), 'Vehicle Operations'));
    const vBtns = el('div', { class: 'btn-row' });
    vBtns.append(
      ui.button('Spawn Vehicle', { size: 'small', variant: 'subtle', iconName: 'plus', onClick: () => { this.spawnVehicle(); this.refreshLive(); } }),
      ui.button('Spawn 3 Vehicles', { size: 'small', iconName: 'plus', onClick: () => { for (let i = 0; i < 3; i++) this.pendingArrivals.push({ due: this.simTime + i * 18, options: { automatic: false } }); toast('3 vehicles queued for arrival.', { type: 'info' }); } }),
      ui.button('Clear All Vehicles', { size: 'small', variant: 'danger', iconName: 'trash', onClick: async () => {
        const ok = await ui.confirmDialog({ title: 'Clear all vehicles?', message: 'All vehicles will be removed and bays released.', confirmLabel: 'Clear Vehicles', danger: true });
        if (ok) { this.clearVehicles(); this.refreshLive(); }
      } }),
    );
    vSec.appendChild(vBtns);
    vSec.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Vehicles enter through the entry lane, park in their assigned bay, and depart automatically at the scheduled time.' }));
    container.appendChild(vSec);

    const dSec = el('div', { class: 'section' });
    dSec.appendChild(el('div', { class: 'section-title' }, ui.icon('warning', 12), 'Diagnostics & Alarm Testing'));
    dSec.appendChild(ui.toggle({ label: 'Simulate entry sensor failure', value: this.faults.sensor, onChange: v => {
      this.faults.sensor = v;
      this.setSensorEnabled('entry-loop', !v);
      this.logEvent(v ? 'Sensor fault injected' : 'Sensor fault cleared', 'Entry loop detector diagnostic.', v ? 'warn' : 'ok');
      this.evaluateAlarms();
      this.refreshLive();
    } }));
    dSec.appendChild(ui.toggle({ label: 'Inject unauthorized occupancy', value: !!this.unauthorizedSlot, onChange: v => {
      if (v) {
        const slot = this.slots.find(s => s.status === 'available' && !s.disabled);
        if (!slot) { toast('No available bay to inject.', { type: 'warn' }); return; }
        slot.unauthorized = true; slot.status = 'occupied'; this.unauthorizedSlot = slot; this.refreshSlot(slot); this.setSensorValue(slot.sensorId, 1);
        this.logEvent('Unauthorized occupancy', `Bay ${slot.id} latched with no registered vehicle.`, 'warn');
      } else {
        if (this.unauthorizedSlot) {
          const slot = this.unauthorizedSlot;
          slot.unauthorized = false; slot.status = 'available'; slot.vehicleId = null; this.refreshSlot(slot); this.setSensorValue(slot.sensorId, 0);
          this.unauthorizedSlot = null;
        }
        this.logEvent('Unauthorized occupancy cleared', 'Bay returned to available.', 'ok');
      }
      this.evaluateAlarms(); this.saveSoon(); this.refreshLive();
    } }));
    dSec.appendChild(ui.button('Trigger Overstay Demo', { size: 'small', variant: 'warn', iconName: 'clock', onClick: () => {
      const v = this.vehicles.find(x => x.state === 'parked');
      if (!v) { toast('No parked vehicle available for overstay test.', { type: 'warn' }); return; }
      v.arrivalSim = this.simTime - (this.threshold('overstayMinutes', 15) * 60 + 30);
      v.parkedAt = v.arrivalSim;
      this.evaluateAlarms();
      toast(`Overstay condition set for ${v.plate}.`, { type: 'warn' });
      this.refreshLive();
    } }));
    dSec.appendChild(ui.button('Restore Diagnostic State', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => {
      this.faults.sensor = false; this.setSensorEnabled('entry-loop', true);
      if (this.unauthorizedSlot) { const s = this.unauthorizedSlot; s.unauthorized = false; s.status = 'available'; this.refreshSlot(s); this.unauthorizedSlot = null; }
      this.evaluateAlarms(); this.refreshLive();
    } }));
    container.appendChild(dSec);

    const lSec = el('div', { class: 'section' });
    lSec.appendChild(el('div', { class: 'section-title' }, ui.icon('light', 12), 'Lighting & Security'));
    lSec.appendChild(ui.toggle({ label: 'Site lighting energised', description: 'Canopy, streetlights and booth lighting.', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); } }));
    this.cctv.forEach((c, i) => lSec.appendChild(ui.toggle({ label: `CCTV Camera 0${i + 1} recording`, value: c.on, onChange: v => { c.on = v; this.saveSoon(); } })));
    container.appendChild(lSec);

    const rSec = el('div', { class: 'section' });
    rSec.appendChild(el('div', { class: 'section-title' }, ui.icon('reset', 12), 'Counters'));
    rSec.appendChild(el('div', { class: 'kv-list' },
      ui.kvRow('Vehicles entered', '0', { bind: () => String(this.enteredTotal) }),
      ui.kvRow('Vehicles exited', '0', { bind: () => String(this.exitedTotal) }),
      ui.kvRow('Barrier actuations', '0', { bind: () => String(this.barriers.entry.cycles + this.barriers.exit.cycles) }),
    ));
    rSec.appendChild(ui.button('Reset Counters', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => { this.enteredTotal = 0; this.exitedTotal = 0; this.refreshLive(); toast('Counters reset.', { type: 'ok' }); } }));
    container.appendChild(rSec);
  }

  buildSpawning(container) {
    const spawn = this.config.spawn;
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ui.icon('vehicle', 13).outerHTML}<span>Configure arrivals, schedules and parking duration. Automatic operation obeys the selected mode and maximum vehicle count.</span>`;
    container.appendChild(note);

    const sSec = el('div', { class: 'section' });
    sSec.appendChild(el('div', { class: 'section-title' }, ui.icon('vehicle', 12), 'Spawn Manager'));
    sSec.appendChild(ui.toggle({ label: 'Automatic vehicle spawning', description: 'Generate arrivals at the configured interval.', value: spawn.autoSpawn, onChange: v => { spawn.autoSpawn = v; this.saveSoon(); } }));
    sSec.appendChild(ui.toggle({ label: 'Manual override active', description: 'When enabled, automatic arrivals are suspended.', value: this.manualMode, onChange: v => { this.setManual(v); this.renderPanel(); } }));
    sSec.appendChild(ui.segmentedControl('Arrival scheduling mode', [{ value: 'random', label: 'Random arrivals' }, { value: 'fixed', label: 'Fixed schedule' }], spawn.arrivalMode, v => { spawn.arrivalMode = v; this.saveSoon(); this.renderPanel(); }));
    sSec.appendChild(ui.slider({ label: 'Arrival interval', min: 5, max: 120, step: 1, value: spawn.interval, unit: 's', onInput: v => { spawn.interval = v; }, onChange: () => this.saveSoon() }));
    sSec.appendChild(ui.slider({ label: 'Maximum vehicle count', min: 1, max: 20, step: 1, value: spawn.maxVehicles, unit: 'vehicles', onInput: v => { spawn.maxVehicles = v; }, onChange: () => this.saveSoon() }));
    sSec.appendChild(ui.slider({ label: 'Vehicle travel speed', min: 1, max: 8, step: .1, value: spawn.speed, unit: 'm/s', onInput: v => { spawn.speed = v; }, onChange: () => this.saveSoon() }));
    container.appendChild(sSec);

    const cSec = el('div', { class: 'section' });
    cSec.appendChild(el('div', { class: 'section-title' }, ui.icon('settings', 12), 'Vehicle Profile'));
    cSec.appendChild(ui.selectField({ label: 'Vehicle type', options: VEHICLE_TYPES, value: spawn.type, onChange: v => { spawn.type = v; this.saveSoon(); } }));
    cSec.appendChild(ui.selectField({ label: 'Vehicle colour', options: CAR_COLORS.map(c => ({ value: c.name, label: c.name })), value: spawn.color, onChange: v => { spawn.color = v; this.saveSoon(); } }));
    cSec.appendChild(ui.selectField({ label: 'Preferred parking bay', options: [{ value: 'random', label: 'Random available bay' }, ...this.slots.map(s => ({ value: s.id, label: `${s.id} · Row ${s.row}` }))], value: spawn.preferredSlot, onChange: v => { spawn.preferredSlot = v; this.saveSoon(); } }));
    cSec.appendChild(ui.button('Spawn Now', { variant: 'primary', iconName: 'plus', block: true, onClick: () => {
      const v = this.spawnVehicle();
      if (v) { toast(`${v.plate} is entering · assigned ${v.slotId}.`, { type: 'ok' }); }
    } }));
    container.appendChild(cSec);

    const dSec = el('div', { class: 'section' });
    dSec.appendChild(el('div', { class: 'section-title' }, ui.icon('clock', 12), 'Schedule & Duration'));
    dSec.appendChild(ui.slider({ label: 'Minimum parking duration', min: 1, max: 30, step: 1, value: Math.round(spawn.durationMin / 60), unit: 'min', onInput: v => { spawn.durationMin = v * 60; }, onChange: () => this.saveSoon() }));
    dSec.appendChild(ui.slider({ label: 'Maximum parking duration', min: 1, max: 60, step: 1, value: Math.round(spawn.durationMax / 60), unit: 'min', onInput: v => { spawn.durationMax = Math.max(spawn.durationMin, v * 60); }, onChange: () => this.saveSoon() }));
    dSec.appendChild(ui.numberField({ label: 'Manual spawn · arrival delay', unit: 's', min: 0, max: 600, step: 1, value: spawn.arrivalDelay, onChange: v => { spawn.arrivalDelay = v; this.saveSoon(); } }));
    dSec.appendChild(ui.numberField({ label: 'Manual spawn · parking duration', unit: 'min', min: 1, max: 720, step: 1, value: spawn.manualDuration, onChange: v => { spawn.manualDuration = v; this.saveSoon(); } }));
    const scheduleBtn = ui.button('Schedule Vehicle Arrival', { size: 'small', variant: 'subtle', iconName: 'timeline', block: true, onClick: () => {
      const opts = { color: spawn.color, type: spawn.type, slotId: spawn.preferredSlot !== 'random' ? spawn.preferredSlot : null, durationSeconds: spawn.manualDuration * 60 };
      if (spawn.arrivalDelay > 0) {
        this.pendingArrivals.push({ due: this.simTime + spawn.arrivalDelay, options: opts });
        this.logEvent('Arrival scheduled', `Vehicle scheduled in ${spawn.arrivalDelay} s · departure in ${spawn.manualDuration} min.`, 'info');
        toast(`Arrival scheduled in ${spawn.arrivalDelay} s.`, { type: 'ok' });
      } else { const v = this.spawnVehicle(opts); if (v) toast(`${v.plate} is entering now.`, { type: 'ok' }); }
      this.refreshLive();
    } });
    dSec.appendChild(scheduleBtn);
    container.appendChild(dSec);

    const bSec = el('div', { class: 'section' });
    bSec.appendChild(el('div', { class: 'section-title' }, ui.icon('plus', 12), 'Batch Arrivals'));
    const row = el('div', { class: 'btn-row' });
    row.append(
      ui.button('Spawn 3', { size: 'small', iconName: 'plus', onClick: () => { for (let i = 0; i < 3; i++) this.pendingArrivals.push({ due: this.simTime + i * 12, options: { automatic: false } }); toast('3 arrivals queued.', { type: 'info' }); } }),
      ui.button('Spawn 5', { size: 'small', iconName: 'plus', onClick: () => { for (let i = 0; i < 5; i++) this.pendingArrivals.push({ due: this.simTime + i * 10, options: { automatic: false } }); toast('5 arrivals queued.', { type: 'info' }); } }),
      ui.button('Spawn 10', { size: 'small', iconName: 'plus', onClick: () => { for (let i = 0; i < 10; i++) this.pendingArrivals.push({ due: this.simTime + i * 8, options: { automatic: false } }); toast('10 arrivals queued.', { type: 'info' }); } }),
    );
    bSec.appendChild(row);
    const queue = el('div', { class: 'help', style: { marginTop: '6px' } });
    this.addPanelBind(() => { queue.textContent = `${this.pendingArrivals.length} scheduled arrivals pending · ${this.vehicles.length} vehicles on site`; });
    bSec.appendChild(queue);
    container.appendChild(bSec);

    const mSec = el('div', { class: 'section' });
    mSec.appendChild(el('div', { class: 'section-title' }, ui.icon('warning', 12), 'Facility Capacity'));
    const allRow = el('div', { class: 'btn-row' });
    allRow.append(ui.button('Clear All Vehicles', { size: 'small', variant: 'danger', iconName: 'trash', onClick: async () => {
      const ok = await ui.confirmDialog({ title: 'Clear all vehicles?', message: 'Every vehicle will be removed and all bays released.', confirmLabel: 'Clear', danger: true });
      if (ok) { this.clearVehicles(); this.renderPanel(); }
    } }));
    mSec.appendChild(allRow);
    container.appendChild(mSec);
  }

  getTabLabel(kind) { return kind === 'spawn' ? 'Vehicle Spawning' : super.getTabLabel(kind); }

  onSimulationStart() { this.logEvent('Automation resumed', 'Barriers and automatic spawning active.', 'ok'); }
  onSimulationStop() { this.logEvent('Automation suspended', 'Simulation stopped by operator.', 'warn'); }

  /* =========================================================
     Detailed Operational Scenarios
     ========================================================= */
  registerDetailedScenarios() {
    /* ---- Smart Parking Lot Scenario ---- */
    this.registerScenario({
      id: 'parking-full-cycle',
      name: 'Parking Lot Full Operations Cycle',
      description: 'Complete parking facility operation from vehicle arrival to departure',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-parking',
          title: 'Initialize Parking Facility',
          description: 'Verify all barriers, sensors, and bays are operational',
          objective: 'Confirm entrance/exit barriers closed, all 18 bays showing available, occupancy at 0%',
          checkComplete: (infra) => infra.vehicles.length === 0,
          autoAdvanceDelay: 5000,
          camera: { position: [-2, 15, 10], target: [-2, 0, 2] },
          narration: 'Welcome to the Smart Parking Lot. We start with an empty facility, all barriers secured, 18 bays available.',
        },
        {
          id: 'activate-entrance',
          title: 'Activate Entrance Barrier',
          description: 'Power on and test the entrance barrier system',
          objective: 'Open entrance barrier, verify sensor detection, then close',
          onEnter: (infra) => { if (infra.barriers.entry) infra.barriers.entry.target = infra.barriers.entry.openAngle; },
          checkComplete: (infra) => infra.barriers.entry && infra.barriers.entry.angle > 1.2,
          autoAdvanceDelay: 3000,
          camera: { position: [-12, 6, 12], target: [-12, 0, 12] },
          narration: 'Activating the ENTRY barrier. Watch the arm rise and the LED turn green.',
        },
        {
          id: 'vehicle-arrival',
          title: 'First Vehicle Arrival',
          description: 'Simulate an inbound vehicle approaching the entrance',
          objective: 'Observe vehicle detection and automatic barrier operation',
          onEnter: (infra) => { infra.spawnVehicle({ automatic: false }); },
          checkComplete: (infra) => infra.vehicles.some(v => v.slotId && v.phase === 'parked'),
          autoAdvanceDelay: 15000,
          camera: { position: [-12, 6, 12], target: [-12, 0, 12] },
          narration: 'An inbound vehicle approaches. The ground loop detects it and the ENTRY barrier opens automatically.',
        },
        {
          id: 'bay-assignment',
          title: 'Bay Assignment',
          description: 'System assigns an available parking bay to the vehicle',
          objective: 'Watch the vehicle navigate to its assigned bay and park',
          checkComplete: (infra) => infra.vehicles.some(v => v.phase === 'parked'),
          autoAdvanceDelay: 10000,
          camera: { position: [-2, 8, 2], target: [-2, 0, 2] },
          narration: 'Vehicle assigned to the nearest available bay. Navigating to parking spot.',
        },
        {
          id: 'occupancy-update',
          title: 'Occupancy Update',
          description: 'Verify occupancy sensors detect the parked vehicle',
          objective: 'Confirm bay shows occupied (red), availability decreases to 17, timer starts',
          checkComplete: (infra) => infra.slots.some(s => s.status === 'occupied'),
          autoAdvanceDelay: 3000,
          narration: 'Occupancy sensor confirms the vehicle. Bay now shows occupied. Parking timer started.',
        },
        {
          id: 'second-vehicle',
          title: 'Second Vehicle Arrival',
          description: 'Process another inbound vehicle to demonstrate multi-vehicle handling',
          objective: 'Observe second vehicle assigned to next available bay',
          onEnter: (infra) => { infra.spawnVehicle({ automatic: false }); },
          checkComplete: (infra) => infra.slots.filter(s => s.status === 'occupied').length >= 2,
          autoAdvanceDelay: 15000,
          narration: 'A second vehicle arrives. The system efficiently assigns the next available bay.',
        },
        {
          id: 'overstay-simulation',
          title: 'Overstay Warning',
          description: 'Simulate a vehicle exceeding maximum parking duration',
          objective: 'Trigger overstay alarm and observe warning generation',
          onEnter: (infra) => {
            const vehicle = infra.vehicles.find(v => v.phase === 'parked');
            if (vehicle) {
              vehicle.overstay = true;
              vehicle.overstayNotified = true;
              infra.logEvent('Overstay detected', `${vehicle.plate} exceeded maximum duration`, 'warn');
            }
          },
          checkComplete: (infra) => infra.getActiveAlarms?.()?.some(a => a.id === 'overstay' || a.title?.includes('Overstay')),
          autoAdvanceDelay: 8000,
          narration: 'Vehicle in bay has overstayed maximum duration. Overstay warning generated.',
        },
        {
          id: 'acknowledge-alarm',
          title: 'Acknowledge Overstay Alarm',
          description: 'Operator acknowledges the overstay warning',
          objective: 'Acknowledge the alarm from the alarm panel',
          checkComplete: (infra) => !infra.getActiveAlarms?.()?.some(a => a.id === 'overstay' || a.title?.includes('Overstay')),
          allowSkip: true,
          narration: 'Acknowledge the overstay alarm to continue normal operations.',
        },
        {
          id: 'vehicle-departure',
          title: 'Vehicle Departure',
          description: 'Process vehicle exit through the exit barrier',
          objective: 'Watch vehicle leave bay, navigate to exit, and EXIT barrier operation',
          onEnter: (infra) => {
            const vehicle = infra.vehicles.find(v => v.phase === 'parked');
            if (vehicle) {
              vehicle.departing = true;
              vehicle.overstay = false;
            }
          },
          checkComplete: (infra) => infra.vehicles.filter(v => v.phase === 'parked').length === 0,
          autoAdvanceDelay: 15000,
          camera: { position: [10, 6, 12], target: [10, 0, 12] },
          narration: 'The vehicle completes its stay and departs. EXIT barrier opens automatically.',
        },
        {
          id: 'exit-barrier',
          title: 'Exit Barrier Operation',
          description: 'Verify exit barrier opens and closes correctly',
          objective: 'Observe EXIT barrier arm rise, vehicle pass, arm lower',
          checkComplete: (infra) => infra.barriers.exit && infra.barriers.exit.angle > 1.2,
          autoAdvanceDelay: 5000,
          camera: { position: [10, 6, 12], target: [10, 0, 12] },
          narration: 'Exit barrier operating correctly. Vehicle has left the facility.',
        },
        {
          id: 'final-report',
          title: 'Parking Activity Report',
          description: 'Generate final parking operations summary',
          objective: 'Review the parking activity report with vehicle counts and durations',
          checkComplete: () => true,
          autoAdvanceDelay: 5000,
          narration: 'Parking cycle complete. Two vehicles processed successfully. All bays available. Report generated.',
        },
      ],
    });

    /* ---- Peak Hours Scenario ---- */
    this.registerScenario({
      id: 'parking-peak-hours',
      name: 'Peak Hours Traffic Management',
      description: 'Handle high-volume arrivals during peak hours',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-peak',
          title: 'Initialize Peak Hours',
          description: 'Facility at 50% capacity, peak hour begins',
          objective: 'Verify 9 bays occupied, 9 available, barriers auto',
          checkComplete: (infra) => infra.slots.filter(s => s.status === 'occupied').length >= 8,
          autoAdvanceDelay: 3000,
        },
        {
          id: 'burst-arrivals',
          title: 'Burst of Arrivals',
          description: 'Multiple vehicles arrive in quick succession',
          objective: 'Observe queue management, barrier cycling, bay assignment',
          onEnter: (infra) => { for (let i = 0; i < 5; i++) setTimeout(() => infra.spawnVehicle({ automatic: false }), i * 3000); },
          checkComplete: (infra) => infra.slots.filter(s => s.status === 'occupied').length >= 14,
          autoAdvanceDelay: 20000,
        },
        {
          id: 'manage-capacity',
          title: 'Capacity Management',
          description: 'Monitor near-capacity operations',
          objective: 'Watch for 18/18 occupancy, disabled entry when full',
          checkComplete: (infra) => infra.slots.filter(s => s.status === 'occupied').length === 18,
          autoAdvanceDelay: 15000,
        },
        {
          id: 'departures-free-space',
          title: 'Departures Free Space',
          description: 'Vehicles leave, creating availability for new arrivals',
          objective: 'Observe natural turnover, barriers adapting to flow',
          checkComplete: (infra) => infra.slots.filter(s => s.status === 'occupied').length < 12,
          autoAdvanceDelay: 20000,
        },
      ],
    });
  }

  // First-person interaction handlers for parking
  _toggleDoor(obj) {
    // Parking booth door
    if (obj.id?.includes('booth') || obj.id?.includes('door')) {
      this.selectObject(obj.id);
    }
  }

  _operateBarrier(obj) {
    if (obj.id === 'gate-entry' || obj.id === 'gate-exit') {
      const barrier = this.barriers[obj.id === 'gate-entry' ? 'entry' : 'exit'];
      if (barrier) {
        barrier.target = barrier.target > 0 ? 0 : barrier.openAngle;
        barrier.auto = false;
        this.logEvent('Barrier manual override', `${barrier.name} ${barrier.target > 0 ? 'opened' : 'closed'} manually`, 'info');
      }
    }
  }

  _inspectVehicle(obj) {
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
}
