/* ============================================================
   SMART WATER TANK — utility infrastructure digital twin
   Elevated transparent potable-water reservoir, booster pump skid,
   motorised valves, flow instrumentation and hydraulic simulation.
   Facility: H2O-02 · NEXUS Industrial Digital Twin
   ============================================================ */
import * as THREE from 'three';
import { BaseInfrastructure } from '../core/base.js';
import {
  group, box, cylinder, sphere, plane, material, emissive, roundedBox,
  makeLampPost, makeControlCabinet, makeValve, makeTowerLight, makePerson,
  signBoard, textSprite, canvasTexture, pipe, cylinderBetween, shadowify,
  mergeStaticGroup,
} from '../core/scene.js';
import * as ui from '../core/ui.js';

const { el, toast } = ui;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const meta = {
  id: 'water',
  code: 'H2O-02',
  name: 'Smart Water Tank',
  description: 'Elevated transparent reservoir with live hydrostatic level model, variable-speed booster pump, motorised isolation valves, flow metering and potable-water quality monitoring.',
  icon: 'water',
  sceneBackground: 0x040a11,
  fogDensity: 0.0044,
  fitPadding: 1.04,
};

/* ---------------- Facility geometry constants ---------------- */
const TANK = {
  x: 0, z: -2.2, baseY: 3.49,
  r: 1.55, waterR: 1.42,
  waterBottom: 0.14, maxWaterH: 2.94, shellH: 3.18,
};
const PUMP = { x: -5.8, z: 3.4 };
const RATED_CURRENT = 15;
const AMBIENT_TEMP = 22;
const OUTLET_FLOW_MAX = 460;
const MIN_CAP = 2000;
const MAX_CAP = 20000;
const MAX_FLOW_SENSOR = 520;

const C = {
  steel: 0x70889a, darkSteel: 0x33434f, pipe: 0x6f8698, flange: 0x46555f,
  concrete: 0x5d666e, accent: 0x46a9ff, brass: 0x9a7b46, hazard: 0xd9a63c,
};

const LEVEL_BANDS = [
  { max: 10, color: 0xff4a5f, label: 'CRITICAL' },
  { max: 20, color: 0xffb547, label: 'LOW' },
  { max: 88, color: 0x3ce58b, label: 'NORMAL' },
  { max: 95, color: 0xffb547, label: 'HIGH' },
  { max: 100.01, color: 0xff4a5f, label: 'OVERFLOW' },
];

/* ---------------- Procedural textures ---------------- */
function levelScaleTexture() {
  return canvasTexture(180, 840, (ctx, w, h) => {
    ctx.fillStyle = '#0a161d'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2e5563'; ctx.lineWidth = 4; ctx.strokeRect(3, 3, w - 6, h - 6);
    for (let i = 0; i <= 20; i++) {
      const y = h - 26 - (i / 20) * (h - 52);
      const major = i % 5 === 0;
      ctx.strokeStyle = major ? '#8fe9dd' : '#4d7c88';
      ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(major ? 66 : 38, y); ctx.stroke();
      if (major) {
        ctx.fillStyle = '#cfeef7';
        ctx.font = '600 24px "Segoe UI", sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`${i * 5}%`, 74, y);
      }
    }
    ctx.save();
    ctx.translate(w - 16, h / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#46a9ff'; ctx.font = '700 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('T-01 LEVEL', 0, 0);
    ctx.restore();
  });
}

function flowDialTexture(title, max, unit) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, R = 118;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a141b';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#39525f'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#4b8797'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R - 12, 0, Math.PI * 2); ctx.stroke();
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    for (let i = 0; i <= 10; i++) {
      const a = a0 + (a1 - a0) * (i / 10);
      const major = i % 2 === 0;
      ctx.strokeStyle = major ? '#a8e7f2' : '#4d7c88';
      ctx.lineWidth = major ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
      ctx.lineTo(cx + Math.cos(a) * (R - (major ? 34 : 24)), cy + Math.sin(a) * (R - (major ? 34 : 24)));
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#cfeef7'; ctx.font = '600 17px "Segoe UI", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.round(max * i / 10)), cx + Math.cos(a) * (R - 54), cy + Math.sin(a) * (R - 54));
      }
    }
    ctx.fillStyle = '#d9f6ff'; ctx.font = '700 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(title, cx, cy - 26);
    ctx.fillStyle = '#6ea9b8'; ctx.font = '600 15px "Segoe UI", sans-serif';
    ctx.fillText(unit, cx, cy + 30);
    ctx.fillStyle = '#2d6b7a'; ctx.font = '600 11px "Segoe UI", sans-serif';
    ctx.fillText('NEXUS INSTRUMENTS', cx, cy + 74);
  });
}

function rippleTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    ctx.clearRect(0, 0, w, h);
    for (let i = 1; i <= 12; i++) {
      const r = (i / 12) * (w * 0.47);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(190,240,255,${0.5 - i * 0.032})`;
      ctx.lineWidth = 2.4; ctx.stroke();
    }
    for (let i = 0; i < 42; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * w * 0.45;
      ctx.fillStyle = `rgba(210,245,255,${0.06 + Math.random() * 0.12})`;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1 + Math.random() * 2.4, 0, Math.PI * 2); ctx.fill();
    }
  });
}

function hazardTexture() {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#171a1c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d9a63c';
    for (let x = -h; x < w + h; x += 42) {
      ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + h, 0); ctx.lineTo(x + h + 20, 0); ctx.lineTo(x + 20, h); ctx.closePath(); ctx.fill();
    }
  });
}

function floorTextTexture(text) {
  return canvasTexture(512, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(214,226,232,.62)';
    ctx.font = '800 150px "Segoe UI", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2);
  });
}

function chainlinkTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(150,176,190,.55)'; ctx.lineWidth = 3;
    for (let i = -h; i < w + h; i += 24) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke();
    }
  });
}

const _now = () => performance.now();

/* ============================================================
   SmartWaterTank
   ============================================================ */
export default class SmartWaterTank extends BaseInfrastructure {
  constructor(host) {
    super(host, meta);

    /* storage / hydraulic runtime state */
    this.capacityL = 10000;
    this.volumeL = 6500;
    this._visualLevel = 0.65;
    this.targetLevel = 80;
    this.drainTarget = 15;
    this.autoFill = true;
    this.autoDrain = false;
    this.inletFlow = 0;
    this.outletFlow = 0;
    this.inletPressureBar = 0;
    this.turbidity = 3.2;
    this.totalInflowL = 0;
    this.totalOutflowL = 0;

    this.pump = {
      on: false, speed: 100, auto: true, load: 1,
      failed: false, tripped: false, restarting: false, restartTimer: 0,
      current: 0, temperature: AMBIENT_TEMP, dry: false, dryTimer: 0,
      fanAngle: 0, starts: 0, runtime: 0,
    };
    this.pumpFlowCap = 420;

    this.inletValve = { pct: 0, target: 0, auto: true, speed: 25 };
    this.outletValve = { pct: 0, target: 0, auto: true, speed: 25 };

    this.demand = { active: false, mode: 'residential', factor: 1 };
    this.transfer = null;

    this.faults = { pumpFailure: false, sensorFailure: false, flowMeter: false, motorOverload: false };

    this.lightingOn = true;
    this._time = 0;
    this._hmiAccum = 0;
    this._statusAccum = 0;
    this._eventAccum = 0;

    /* scene references */
    this.cat = {};
    this.waterMesh = null;
    this.waterSurface = null;
    this.waterSurfaceInner = null;
    this.gaugeFloat = null;
    this.pumpFan = null;
    this.pumpImpeller = null;
    this.pumpHousingGlow = null;
    this.valves = {};
    this.flowMeters = {};
    this.pressureGaugeNeedle = null;
    this.towerLight = null;
    this.leds = {};
    this.lights = [];
    this.doorPivot = null;
    this._hmiCanvas = null;
    this._hmiCtx = null;
    this._hmiTex = null;
    this._hmiScreen = null;
    this._bubbles = [];
    this._bubbleMat = null;
    this._levelScaleTex = null;
    this._pendingAlarmTest = null;
  }

  /* =========================================================
     Configuration
     ========================================================= */
  defaultConfig() {
    return {
      ...super.defaultConfig(),
      capacity: 10000,
      initialLevel: 65,
      targetLevel: 80,
      drainTarget: 15,
      autoFill: true,
      autoDrain: false,
      pump: { speed: 100, flowCapacity: 420, auto: true, motorLoad: 1.0 },
      inletValve: { pct: 0, auto: true, speed: 25 },
      outletValve: { pct: 0, auto: true, speed: 25 },
      lightingOn: true,
      demand: { active: false, mode: 'residential', factor: 1.0 },
      thresholds: {
        lowLevel: 20, criticalLevel: 8, highLevel: 88, overflowLevel: 95,
        dryRunSeconds: 4, abnormalFlow: 480, overheatTemp: 80,
      },
    };
  }

  applyRuntimeConfig() {
    const c = this.config || {};
    const pumpCfg = c.pump || {};
    const iValve = c.inletValve || {};
    const oValve = c.outletValve || {};
    const demandCfg = c.demand || {};
    this.capacityL = clamp(+(c.capacity ?? 10000), MIN_CAP, MAX_CAP);
    this.targetLevel = clamp(+(c.targetLevel ?? 80), 1, 100);
    this.drainTarget = clamp(+(c.drainTarget ?? 15), 0, 99);
    this.autoFill = c.autoFill !== false;
    this.autoDrain = !!c.autoDrain;
    this.pump.speed = clamp(+(pumpCfg.speed ?? 100), 10, 120);
    this.pump.auto = pumpCfg.auto !== false;
    this.pump.load = clamp(+(pumpCfg.motorLoad ?? 1), 0.4, 1.4);
    this.pumpFlowCap = clamp(+(pumpCfg.flowCapacity ?? 420), 60, 600);
    this.inletValve.pct = clamp(+(iValve.pct ?? 0), 0, 100);
    this.inletValve.target = this.inletValve.pct;
    this.inletValve.auto = iValve.auto !== false;
    this.inletValve.speed = clamp(+(iValve.speed ?? 25), 5, 100);
    this.outletValve.pct = clamp(+(oValve.pct ?? 0), 0, 100);
    this.outletValve.target = this.outletValve.pct;
    this.outletValve.auto = oValve.auto !== false;
    this.outletValve.speed = clamp(+(oValve.speed ?? 25), 5, 100);
    this.lightingOn = c.lightingOn !== false;
    this.demand.active = !!demandCfg.active;
    this.demand.mode = demandCfg.mode || 'residential';
    this.demand.factor = clamp(+(demandCfg.factor ?? 1), 0.2, 2);
    const lvl = clamp(+(c.initialLevel ?? 65), 0, 100);
    this.volumeL = this.capacityL * (lvl / 100);
    this._visualLevel = lvl / 100;
  }

  persistSettings() {
    if (!this.config) return;
    const c = this.config;
    c.capacity = this.capacityL;
    c.targetLevel = this.targetLevel;
    c.drainTarget = this.drainTarget;
    c.autoFill = this.autoFill;
    c.autoDrain = this.autoDrain;
    c.pump = { speed: this.pump.speed, flowCapacity: this.pumpFlowCap, auto: this.pump.auto, motorLoad: this.pump.load };
    c.inletValve = { pct: Math.round(this.inletValve.pct), auto: this.inletValve.auto, speed: this.inletValve.speed };
    c.outletValve = { pct: Math.round(this.outletValve.pct), auto: this.outletValve.auto, speed: this.outletValve.speed };
    c.lightingOn = this.lightingOn;
    c.demand = { active: this.demand.active, mode: this.demand.mode, factor: this.demand.factor };
    this.saveSoon();
  }

  /* =========================================================
     Derived process values
     ========================================================= */
  levelPercent() {
    return this.capacityL > 0 ? clamp((this.volumeL / this.capacityL) * 100, 0, 100) : 0;
  }

  visualLevelFrac() { return clamp(this._visualLevel, 0, 1); }

  levelTone() {
    const l = this.levelPercent();
    const crit = this.threshold('criticalLevel', 8);
    const low = this.threshold('lowLevel', 20);
    const high = this.threshold('highLevel', 88);
    const over = this.threshold('overflowLevel', 95);
    if (l < crit || l >= over) return 'danger';
    if (l < low || l >= high) return 'warn';
    return 'ok';
  }

  levelBand() {
    const l = this.levelPercent();
    for (const b of LEVEL_BANDS) if (l < b.max) return b;
    return LEVEL_BANDS[LEVEL_BANDS.length - 1];
  }

  pumpLabel() {
    const p = this.pump;
    if (p.failed) return 'FAILED';
    if (p.tripped) return 'TRIPPED';
    if (p.restarting) return 'STARTING';
    if (p.dry) return 'DRY RUN';
    return p.on ? 'RUNNING' : 'STANDBY';
  }

  pumpTone() {
    const p = this.pump;
    if (p.failed || p.tripped) return 'danger';
    if (p.dry || p.restarting) return 'warn';
    return p.on ? 'ok' : 'muted';
  }

  valveLabel(ref) {
    const v = ref === 'inlet' ? this.inletValve : this.outletValve;
    if (v.pct <= 0.5) return 'CLOSED';
    if (v.pct >= 99.5) return 'OPEN';
    return Math.abs(v.target - v.pct) > 0.5 ? 'MOVING' : 'PARTIAL';
  }

  valveTone(ref) {
    const v = ref === 'inlet' ? this.inletValve : this.outletValve;
    if (Math.abs(v.target - v.pct) > 0.5) return 'warn';
    return v.pct > 1 ? 'ok' : 'muted';
  }

  displayCapacity() { return ui.fmtInt(this.capacityL); }

  demandFactor() {
    if (!this.demand.active) return 1;
    const base = clamp(this.demand.factor, 0.2, 2);
    const phase = ((this.simTime / 3600) % 24) / 24 * Math.PI * 2;
    let curve;
    if (this.demand.mode === 'industrial') curve = 0.88 + 0.22 * Math.sin(phase * 2 + 1.2);
    else if (this.demand.mode === 'night') curve = 0.4 + 0.1 * Math.sin(phase);
    else curve = 0.72 + 0.5 * Math.abs(Math.sin(phase + 0.6));
    return clamp(base * curve, 0.15, 2.4);
  }

  /* =========================================================
     World
     ========================================================= */
  buildWorld() {
    this.applyRuntimeConfig();
    this.makeCategories();
    this.buildGround();
    this.buildFoundation();
    this.buildSupportStructure();
    this.buildTank();
    this.buildLevelGauge();
    this.buildPumpSkid();
    this.buildPumpCanopy();
    this.buildPumpHouse();
    this.buildPipelines();
    this.buildValves();
    this.buildFlowMeters();
    this.buildPressureGauge();
    this.buildControlCabinet();
    this.buildPumpPanel();
    this.buildLighting();
    this.buildWiring();
    this.buildSignage();
    this.buildSensors();
    this.buildBackground();
    this.buildEquipmentList();
    this.optimizeStaticGeometry();
    this.setLightingState(this.lightingOn);
    this.drawHmi();
    this._updateVisuals(0.016);

    // First-person spawn point (pump house entrance)
    this.firstPersonSpawnPoint = { x: -5.8, y: 1.7, z: 6, yaw: Math.PI / 2, pitch: 0 };
    this.initFirstPerson(this.firstPersonSpawnPoint);

    // Register detailed operational scenarios
    this.registerDetailedScenarios();
  }

  makeCategories() {
    const cats = [
      ['floor', 'Ground & Hardstanding', 'structure'],
      ['foundation', 'Concrete Plinth & Kerbs', 'structure'],
      ['walls', 'Pump House Walls', 'structure'],
      ['roof', 'Roofs & Canopies', 'structure'],
      ['ceiling', 'Internal Ceilings', 'structure'],
      ['doors', 'Doors', 'structure'],
      ['windows', 'Windows', 'structure'],
      ['columns', 'Steel Support Structure', 'structure'],
      ['fencing', 'Perimeter Fencing', 'structure'],
      ['tanks', 'Reservoir & Tank Shell', 'equipment'],
      ['pumps', 'Pumping Plant', 'equipment'],
      ['valves', 'Motorised Valves', 'equipment'],
      ['pipes', 'Pipelines & Flanges', 'equipment'],
      ['sensors', 'Instrumentation', 'equipment'],
      ['equipment', 'Utility Equipment', 'equipment'],
      ['cabinets', 'Control Cabinets & HMI', 'equipment'],
      ['wiring', 'Cabling & Conduits', 'equipment'],
      ['lighting', 'Lighting', 'equipment'],
      ['signs', 'Signage', 'equipment'],
    ];
    this.cat = {};
    for (const [id, label, kind] of cats) this.cat[id] = this.category({ id, label, kind });
  }

  /* ---------------- Ground ---------------- */
  buildGround() {
    const earth = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), material(0x111922, { roughness: .97, metalness: 0 }));
    earth.rotation.x = -Math.PI / 2;
    earth.position.set(0, -.1, -8);
    earth.receiveShadow = true;
    this.scene.world.add(earth);

    const yardMat = material(0x242c33, { roughness: .93, metalness: .04 });
    const yard = plane(22, 18, yardMat, { pos: [0, .02, 0], receive: true });
    this.cat.floor.add(yard);
    this.scene.addCollider(yard);

    // service road heading away from the compound
    const road = plane(7, 20, yardMat, { pos: [3.4, .012, 17], receive: true });
    road.userData.ignoreFit = true;
    this.cat.floor.add(road);
    const roadLine = new THREE.MeshBasicMaterial({ color: 0xc9d3d9, transparent: true, opacity: .5 });
    for (let z = 10; z < 26; z += 3.2) this.cat.floor.add(box(.1, .01, 1.6, roadLine, { pos: [3.4, .028, z], cast: false, receive: false }));

    // painted containments and hazard markings
    const paint = new THREE.MeshBasicMaterial({ color: 0xd8b23c, transparent: true, opacity: .55 });
    const inner = 3.55;
    for (const [x, z, w, d] of [[0, -2.2 + inner, 2 * inner, .13], [0, -2.2 - inner, 2 * inner, .13], [TANK.x - inner, TANK.z, .13, 2 * inner], [TANK.x + inner, TANK.z, .13, 2 * inner]]) {
      this.cat.floor.add(box(w, .012, d, paint, { pos: [x, .034, z], cast: false, receive: false }));
    }
    // turbine hall keep-clear around pump skid
    for (const [x, z, w, d] of [[PUMP.x, PUMP.z + 2.55, 6.6, .12], [PUMP.x, PUMP.z - 2.55, 6.6, .12], [PUMP.x - 3.3, PUMP.z, .12, 5.1], [PUMP.x + 3.3, PUMP.z, .12, 5.1]]) {
      this.cat.floor.add(box(w, .012, d, new THREE.MeshBasicMaterial({ color: 0x46a9ff, transparent: true, opacity: .32 }), { pos: [x, .034, z], cast: false, receive: false }));
    }
    // painted tank identification on hardstanding
    const floorText = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: floorTextTexture('T-01'), transparent: true, depthWrite: false }));
    floorText.rotation.x = -Math.PI / 2;
    floorText.position.set(-8.2, .03, 6.3);
    this.cat.floor.add(floorText);

    // hazard band around plinth face
    const hazardMat = new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: .7, metalness: .1 });
    for (const [x, z, ry] of [[0, TANK.z + 2.92, 0], [0, TANK.z - 2.92, Math.PI], [-2.92, TANK.z, Math.PI / 2], [2.92, TANK.z, -Math.PI / 2]]) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(5.84, .3), hazardMat);
      band.position.set(x, .48, z);
      band.rotation.y = ry;
      band.receiveShadow = true;
      this.cat.floor.add(band);
    }

    // drainage channel + grate in front of outlet valve
    const grateMat = material(0x2a333a, { metalness: .55, roughness: .5 });
    this.cat.floor.add(box(2.6, .05, .62, material(0x1b2228, { roughness: .8 }), { pos: [4.2, .055, 2.2], cast: false }));
    for (let i = 0; i < 8; i++) this.cat.floor.add(box(2.4, .03, .05, grateMat, { pos: [4.2, .075, 1.93 + i * .077], cast: false }));
    // sump cover
    this.cat.floor.add(cylinder(.34, .34, .04, grateMat, { pos: [5.1, .06, .9], segments: 18, cast: false }));

    // kerbs around yard perimeter
    const kerb = material(0x545d64, { roughness: .88 });
    for (const [x, z, w, d] of [[0, 8.9, 22, .3], [0, -8.9, 22, .3], [-10.9, 0, .3, 18], [10.9, 0, .3, 18]]) {
      this.cat.foundation.add(box(w, .2, d, kerb, { pos: [x, .1, z] }));
    }
  }

  /* ---------------- Plinth & foundations ---------------- */
  buildFoundation() {
    const concrete = material(C.concrete, { roughness: .9, metalness: .04 });
    const concreteDark = material(0x474f57, { roughness: .92 });
    const steel = material(C.steel, { metalness: .7, roughness: .38 });
    const CX = TANK.x, CZ = TANK.z;

    // main elevated tank plinth
    this.cat.foundation.add(box(5.9, .62, 5.9, concrete, { pos: [CX, .31, CZ] }));
    this.cat.foundation.add(box(6.15, .09, 6.15, concreteDark, { pos: [CX, .655, CZ] }));
    this.cat.foundation.add(box(6.3, .16, 6.3, concreteDark, { pos: [CX, .08, CZ] }));
    // steps at the front
    for (let i = 0; i < 2; i++) {
      this.cat.foundation.add(box(2.1, .16, .42, concrete, { pos: [CX - .6, .08 + i * .16, CZ + 3.08 + i * .4] }));
    }
    // leg anchor plates + grout pads
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = CX + sx * 1.85, z = CZ + sz * 1.85;
      this.cat.foundation.add(box(.66, .05, .66, steel, { pos: [x, .68, z] }));
      for (const bx of [-.22, .22]) for (const bz of [-.22, .22]) {
        this.cat.foundation.add(cylinder(.028, .028, .11, material(0x9fb0bb, { metalness: .8 }), { pos: [x + bx, .75, z + bz], segments: 8 }));
      }
    }
    // containment kerb around plinth
    for (const [x, z, w, d] of [[CX, CZ + 3.0, 6.4, .18], [CX, CZ - 3.0, 6.4, .18], [CX - 3.0, CZ, .18, 6.2], [CX + 3.0, CZ, .18, 6.2]]) {
      this.cat.foundation.add(box(w, .3, d, concreteDark, { pos: [x, .15, z] }));
    }

    // pipe supports across the yard
    this._pipeSupport([-10.4, .275, 5.2], .55, .11);
    this._pipeSupport([-8.6, .275, 4.2], .55, .11);
    this._pipeSupport([-3.1, .275, 2.6], .55, .1);
    this._pipeSupport([4.6, .275, 4.8], .55, .12);
    this._pipeSupport([6.6, .275, 4.8], .55, .12);
    this._pipeSupport([8.4, .275, 4.8], .55, .12);

    // cable trench / duct covers
    const duct = material(0x3a454d, { roughness: .8, metalness: .25 });
    for (let i = 0; i < 5; i++) this.cat.foundation.add(box(1.1, .07, .5, duct, { pos: [7.6, .05, -1.4 + i * .62], cast: false }));

    // pump skid foundation pads
    this.cat.foundation.add(box(3.9, .18, 2.2, concreteDark, { pos: [PUMP.x, .09, PUMP.z] }));
    for (const sx of [-1.55, 1.55]) for (const sz of [-.78, .78]) {
      this.cat.foundation.add(box(.36, .05, .36, steel, { pos: [PUMP.x + sx, .19, PUMP.z + sz] }));
    }
    // control cabinet pad
    this.cat.foundation.add(box(2.2, .14, 1.5, concreteDark, { pos: [4.7, .07, -2.2] }));

    // municipal supply chamber
    this.cat.foundation.add(cylinder(.86, .94, .5, concrete, { pos: [-13.5, .25, 6.4], segments: 22 }));
    this.cat.foundation.add(cylinder(.95, .95, .1, concreteDark, { pos: [-13.5, .53, 6.4], segments: 22 }));
    this.cat.foundation.add(cylinder(.16, .16, .9, material(C.pipe, { metalness: .7, roughness: .35 }), { pos: [-13.5, .95, 6.4], segments: 12 }));
    this.cat.foundation.add(cylinder(.3, .3, .08, material(0xb0483f, { metalness: .6 }), { pos: [-13.5, 1.42, 6.4], segments: 14 }));
  }

  _pipeSupport(pos, height, radius) {
    const steel = material(0x5a6b77, { metalness: .65, roughness: .42 });
    const pad = material(0x424a51, { roughness: .9 });
    const g = group('pipe-support');
    g.add(cylinder(radius, radius, height, steel, { pos: [pos[0], height / 2, pos[2]], segments: 10 }));
    g.add(box(.4, .06, .4, pad, { pos: [pos[0], .03, pos[2]] }));
    g.add(box(.5, .05, .12, steel, { pos: [pos[0], height - .02, pos[2]] }));
    this.cat.foundation.add(g);
  }

  /* ---------------- Steel support tower + platform ---------------- */
  buildSupportStructure() {
    const CX = TANK.x, CZ = TANK.z;
    const steel = material(C.steel, { metalness: .72, roughness: .36 });
    const dark = material(C.darkSteel, { metalness: .62, roughness: .46 });
    const tower = group('support-tower');
    const legH = 2.68, legY = .69 + legH / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = CX + sx * 1.85, z = CZ + sz * 1.85;
      tower.add(box(.28, legH, .28, steel, { pos: [x, legY, z] }));
      // column base gussets
      tower.add(box(.4, .06, .4, dark, { pos: [x, .72, z] }));
    }
    // horizontal ring beams at the top
    tower.add(box(3.98, .22, .22, dark, { pos: [CX, 3.3, CZ + 1.85] }));
    tower.add(box(3.98, .22, .22, dark, { pos: [CX, 3.3, CZ - 1.85] }));
    tower.add(box(.22, .22, 3.98, dark, { pos: [CX + 1.85, 3.3, CZ] }));
    tower.add(box(.22, .22, 3.98, dark, { pos: [CX - 1.85, 3.3, CZ] }));
    // cross bracing on all four faces
    const diag = (a, b) => tower.add(cylinderBetween(a, b, .05, steel, { segments: 8 }));
    for (const sx of [-1, 1]) {
      diag([CX + sx * 1.85, .78, CZ - 1.85], [CX + sx * 1.85, 3.1, CZ + 1.85]);
      diag([CX + sx * 1.85, 3.1, CZ - 1.85], [CX + sx * 1.85, .78, CZ + 1.85]);
    }
    for (const sz of [-1, 1]) {
      diag([CX - 1.85, .78, CZ + sz * 1.85], [CX + 1.85, 3.1, CZ + sz * 1.85]);
      diag([CX + 1.85, .78, CZ + sz * 1.85], [CX - 1.85, 3.1, CZ + sz * 1.85]);
    }
    mergeStaticGroup(tower);
    this.cat.columns.add(tower);
    this.addObject(tower, {
      id: 'support-tower', label: 'Elevated Tank Support Tower', kind: 'structure', iconName: 'columns' in {} ? 'columns' : 'layers',
      description: 'Four-leg braced steel tower carrying the elevated reservoir and walkway.',
    });

    // platform deck + guard rails (static structural detail)
    const deck = group('tank-platform');
    deck.add(box(4.3, .16, 4.3, material(0x4b5c68, { metalness: .55, roughness: .5 }), { pos: [CX, 3.42, CZ] }));
    deck.add(box(4.34, .05, .34, dark, { pos: [CX, 3.53, CZ + 2.0] }));
    deck.add(box(4.34, .05, .34, dark, { pos: [CX, 3.53, CZ - 2.0] }));
    deck.add(box(.34, .05, 4.34, dark, { pos: [CX + 2.0, 3.53, CZ] }));
    deck.add(box(.34, .05, 4.34, dark, { pos: [CX - 2.0, 3.53, CZ] }));
    // railing posts + rails, with a gap on the +x side for the ladder
    const postM = material(0x7d909c, { metalness: .68, roughness: .38 });
    const perimeter = [
      [CX - 2.1, CZ - 2.1], [CX - 0.7, CZ - 2.1], [CX + 0.7, CZ - 2.1], [CX + 2.1, CZ - 2.1],
      [CX + 2.1, CZ - 1.1], [CX + 2.1, CZ + 1.1], [CX + 2.1, CZ + 2.1],
      [CX + 0.7, CZ + 2.1], [CX - 0.7, CZ + 2.1], [CX - 2.1, CZ + 2.1],
      [CX - 2.1, CZ + 1.1], [CX - 2.1, CZ - 1.1],
    ];
    for (const [x, z] of perimeter) deck.add(box(.07, 1.06, .07, postM, { pos: [x, 4.02, z] }));
    const rail = (x1, z1, x2, z2, y) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < .05) return;
      deck.add(box(Math.abs(x2 - x1) || .05, .055, Math.abs(z2 - z1) || .05, postM, { pos: [(x1 + x2) / 2, y, (z1 + z2) / 2] }));
    };
    rail(CX - 2.1, CZ - 2.1, CX + 2.1, CZ - 2.1, 4.55);
    rail(CX - 2.1, CZ + 2.1, CX + 2.1, CZ + 2.1, 4.55);
    rail(CX - 2.1, CZ - 2.1, CX - 2.1, CZ + 2.1, 4.55);
    rail(CX + 2.1, CZ - 2.1, CX + 2.1, CZ + 2.1, 4.55);
    rail(CX - 2.1, CZ - 2.1, CX + 2.1, CZ - 2.1, 4.12);
    rail(CX - 2.1, CZ + 2.1, CX + 2.1, CZ + 2.1, 4.12);
    rail(CX - 2.1, CZ - 2.1, CX - 2.1, CZ + 2.1, 4.12);
    rail(CX + 2.1, CZ - 2.1, CX + 2.1, CZ + 2.1, 4.12);
    // toe boards
    for (const [x, z, w, d] of [[CX, CZ - 2.12, 4.2, .04], [CX, CZ + 2.12, 4.2, .04], [CX - 2.12, CZ, .04, 4.2], [CX + 2.12, CZ, .04, 4.2]]) {
      deck.add(box(w, .14, d, dark, { pos: [x, 3.6, z] }));
    }
    mergeStaticGroup(deck);
    this.cat.columns.add(deck);
    this.scene.addCollider(tower);

    // access ladder with safety cage on the +x face
    const ladder = group('access-ladder');
    const lx = CX + 2.42;
    const bottom = .55, top = 3.46;
    for (const z of [CZ - .22, CZ + .22]) ladder.add(box(.06, top - bottom, .06, postM, { pos: [lx, (bottom + top) / 2, z] }));
    const rungs = Math.floor((top - bottom) / .3);
    for (let i = 1; i <= rungs; i++) ladder.add(box(.06, .045, .48, material(0x9aa9b4, { metalness: .7, roughness: .4 }), { pos: [lx, bottom + i * .3, CZ] }));
    // safety cage hoops from 2.1 m up
    for (let i = 0; i < 4; i++) {
      const y = 2.15 + i * .4;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(.34, .022, 6, 18, Math.PI * 1.15), material(0x8b9aa5, { metalness: .65, roughness: .4 }));
      hoop.rotation.x = Math.PI / 2;
      hoop.rotation.z = -Math.PI / 2;
      hoop.position.set(lx - .16, y, CZ);
      ladder.add(hoop);
    }
    ladder.add(box(.5, .06, .56, dark, { pos: [lx, .56, CZ] }));
    mergeStaticGroup(ladder);
    this.cat.equipment.add(ladder);
    this.addObject(ladder, {
      id: 'access-ladder', label: 'Tank Access Ladder', kind: 'ladder', iconName: 'equipment',
      description: 'Caged vertical access ladder to the elevated tank walkway and inspection platform.',
    });
    this.scene.addCollider(ladder);
  }

  /* ---------------- Elevated transparent tank ---------------- */
  buildTank() {
    const g = group('tank-T01');
    g.position.set(TANK.x, TANK.baseY, TANK.z);
    const CX = TANK.x, CZ = TANK.z;
    const steel = material(C.steel, { metalness: .72, roughness: .34 });
    const dark = material(0x2c3a44, { metalness: .6, roughness: .46 });
    const tankBody = material(0x8fb4c6, { metalness: .55, roughness: .4 });

    // base cradle + bottom plate
    g.add(cylinder(1.66, 1.7, .18, dark, { pos: [0, .09, 0], segments: 34 }));
    const bottomPlate = cylinder(1.6, 1.6, .08, material(0x516977, { metalness: .62, roughness: .4 }), { pos: [0, .2, 0], segments: 34 });
    g.add(bottomPlate);
    // transparent shell
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xc6e9ff, transparent: true, opacity: .17, roughness: .05, metalness: 0,
      transmission: .5, thickness: .6, side: THREE.DoubleSide, depthWrite: false,
    });
    this.shellMat = shellMat;
    const shell = cylinder(TANK.r, TANK.r, TANK.shellH, shellMat, { pos: [0, .2 + TANK.shellH / 2, 0], segments: 42, openEnded: true, cast: false });
    shell.renderOrder = 4;
    g.add(shell);
    // rims
    g.add(cylinder(1.59, 1.59, .1, steel, { pos: [0, .22, 0], segments: 34 }));
    g.add(cylinder(1.59, 1.59, .1, steel, { pos: [0, .2 + TANK.shellH, 0], segments: 34 }));
    // domed / conical roof + vent
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.64, .46, 34), material(0x4d6779, { metalness: .55, roughness: .45 }));
    roof.position.y = .2 + TANK.shellH + .23;
    roof.castShadow = true; roof.receiveShadow = true;
    g.add(roof);
    g.add(cylinder(.3, .3, .05, steel, { pos: [0, .2 + TANK.shellH + .48, 0], segments: 20 }));
    // manway hatch
    g.add(cylinder(.27, .3, .16, dark, { pos: [.55, .2 + TANK.shellH + .5, .3], segments: 18 }));
    g.add(cylinder(.31, .31, .05, steel, { pos: [.55, .2 + TANK.shellH + .59, .3], segments: 18 }));
    // vent pipe
    g.add(cylinder(.055, .055, .52, steel, { pos: [-.82, .2 + TANK.shellH + .58, .38], segments: 10 }));
    g.add(cylinder(.12, .12, .07, dark, { pos: [-.82, .2 + TANK.shellH + .86, .38], segments: 12 }));
    // inlet nozzle boss (connects to inlet riser at -x)
    g.add(cylinder(.24, .24, .16, material(0x5d7382, { metalness: .65, roughness: .4 }), { pos: [-1.52, .2 + 2.66, 0], rz: Math.PI / 2, segments: 16 }));
    // outlet nozzle boss
    g.add(cylinder(.22, .22, .14, material(0x5d7382, { metalness: .65, roughness: .4 }), { pos: [1.48, .52, .58], rx: Math.PI / 2, segments: 16 }));

    // shell reinforcement ribs + hoops (merged static detail)
    const ribs = group('tank-ribs');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ribs.add(box(.06, TANK.shellH - .2, .09, steel, { pos: [Math.sin(a) * 1.57, .2 + TANK.shellH / 2, Math.cos(a) * 1.57], ry: a }));
    }
    for (const y of [.55, 1.75, 2.95]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.58, .045, 6, 40), steel);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = .2 + y;
      hoop.castShadow = true;
      ribs.add(hoop);
    }
    mergeStaticGroup(ribs);
    g.add(ribs);

    // tank identification plate on the front face
    const plate = signBoard('T-01 · POTABLE WATER · 10 000 L', 2.35, .42, { bg: '#061a24', border: '#46a9ff', color: '#d6f2ff' });
    plate.position.set(0, .2 + 2.42, 1.66);
    g.add(plate);
    g.add(box(.08, .08, .2, steel, { pos: [-.9, .2 + 2.42, 1.56] }));
    g.add(box(.08, .08, .2, steel, { pos: [.9, .2 + 2.42, 1.56] }));
    const tag = textSprite('T-01', { size: 40, scale: .62, color: '#cfefff', bg: 'rgba(4,14,22,.75)', border: 'rgba(70,169,255,.4)' });
    tag.position.set(0, 4.35, 0);
    tag.visible = this.labelsVisible;
    g.add(tag);

    // water body (animated height)
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x2b93c8, transparent: true, opacity: .68, roughness: .12, metalness: .03,
      transmission: .12, side: THREE.DoubleSide, depthWrite: false,
      emissive: 0x0a3d58, emissiveIntensity: .45,
    });
    this.waterMat = waterMat;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(TANK.waterR, TANK.waterR, 1, 38, 1, true), waterMat);
    water.position.set(0, TANK.waterBottom + .5, 0);
    water.renderOrder = 3;
    water.userData.noMerge = true;
    g.add(water);
    this.waterMesh = water;

    // animated surface disc
    const surfPivot = group('water-surface');
    surfPivot.position.set(0, TANK.waterBottom + .5, 0);
    surfPivot.rotation.x = -Math.PI / 2;
    surfPivot.userData.noMerge = true;
    const surfMat = new THREE.MeshStandardMaterial({
      color: 0x8fe4ff, emissive: 0x1f7fa8, emissiveIntensity: .9, roughness: .18, metalness: .1,
      transparent: true, opacity: .92, map: rippleTexture(), depthWrite: false,
    });
    const surfInner = new THREE.Mesh(new THREE.CircleGeometry(TANK.waterR - .01, 40), surfMat);
    surfInner.rotation.z = .3;
    surfPivot.add(surfInner);
    g.add(surfPivot);
    this.waterSurface = surfPivot;
    this.waterSurfaceInner = surfInner;

    // aeration bubbles while filling
    const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xcfeeff, emissive: 0x7fd6ff, emissiveIntensity: .6, transparent: true, opacity: .55 });
    this._bubbleMat = bubbleMat;
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(.02 + Math.random() * .022, 7, 5), bubbleMat);
      b.userData.seed = Math.random();
      b.userData.rad = Math.random() * (TANK.waterR - .12);
      b.userData.ang = Math.random() * Math.PI * 2;
      b.userData.speed = .25 + Math.random() * .5;
      g.add(b);
      this._bubbles.push(b);
    }

    // tank shell needs no shadow casting (transparent), keep for internal objects only
    g.traverse(o => { if (o.isMesh) { if (o === shell || o === water) { o.castShadow = false; o.receiveShadow = false; } } });
    this.cat.tanks.add(g);
    this.scene.addCollider(bottomPlate);
    this.addObject(g, {
      id: 'tank', label: 'Reservoir Tank T-01', kind: 'tank', iconName: 'tank',
      description: 'Elevated transparent 10 000 L potable water reservoir with live volume model and hydrostatic level measurement.',
    });
    this.tankGroup = g;
  }

  /* ---------------- Level gauge ---------------- */
  buildLevelGauge() {
    const g = group('level-gauge');
    g.position.set(TANK.x + .95, TANK.baseY + .16, TANK.z + 1.62);
    const steel = material(0x7b8f9c, { metalness: .68, roughness: .38 });
    const dark = material(0x2d3a44, { metalness: .55, roughness: .5 });

    // mounting brackets back to the shell
    for (const y of [.4, 2.5]) g.add(box(.34, .07, .07, steel, { pos: [-.22, y, -.16] }));
    // scale board
    const scaleMat = new THREE.MeshStandardMaterial({ map: levelScaleTexture(), roughness: .55, metalness: .18 });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(.44, 3.02), scaleMat);
    board.position.set(.32, 1.52, 0);
    board.castShadow = true; board.receiveShadow = true;
    g.add(board);
    g.add(box(.46, 3.06, .03, dark, { pos: [.32, 1.52, -.03] }));
    // sight tube
    const tubeMat = new THREE.MeshPhysicalMaterial({ color: 0xc6e9ff, transparent: true, opacity: .3, roughness: .06, metalness: 0, depthWrite: false });
    g.add(cylinder(.078, .078, 3.0, tubeMat, { pos: [0, 1.52, 0], segments: 16, cast: false }));
    g.add(cylinder(.115, .115, .09, steel, { pos: [0, 3.06, 0], segments: 14 }));
    g.add(cylinder(.115, .115, .09, steel, { pos: [0, -.02, 0], segments: 14 }));
    g.add(cylinder(.026, .026, .26, dark, { pos: [0, 3.2, 0], segments: 8 }));
    mergeStaticGroup(g);

    // moving float indicator
    const floatMat = material(0xe8483d, { roughness: .5, metalness: .15, unique: true });
    const float = cylinder(.055, .055, .1, floatMat, { pos: [0, 1.5, 0], segments: 12, cast: false });
    g.add(float);
    const cap = cylinder(.06, .06, .03, material(0xf2f6f8, { roughness: .6 }), { pos: [0, 1.5, 0], segments: 12, cast: false });
    g.add(cap);
    float.userData.cap = cap;
    // tie the cap to the float by parenting
    float.add(cap);
    cap.position.set(0, .065, 0);
    this.gaugeFloat = float;

    this.cat.equipment.add(g);
    this.addObject(g, {
      id: 'level-gauge', label: 'Sight Glass Level Gauge', kind: 'gauge', iconName: 'gauge',
      description: 'Local magnetic sight-glass level indicator with graduated 0–100 % scale.',
    });
  }

  /* ---------------- Ladder already built in support structure ---------------- */

  /* ---------------- Pump skid ---------------- */
  buildPumpSkid() {
    const steel = material(0x5d7382, { metalness: .72, roughness: .36 });
    const dark = material(C.darkSteel, { metalness: .58, roughness: .48 });
    const brass = material(C.brass, { metalness: .82, roughness: .32 });
    const cast = material(0x46596a, { metalness: .6, roughness: .42 });

    const skid = group('pump-skid');
    skid.position.set(PUMP.x, 0, PUMP.z);
    // frame rails
    skid.add(box(3.62, .2, 1.86, dark, { pos: [0, .1, 0] }));
    skid.add(box(3.62, .16, .18, steel, { pos: [0, .26, .84] }));
    skid.add(box(3.62, .16, .18, steel, { pos: [0, .26, -.84] }));
    for (const x of [-1.5, -.05, 1.4]) skid.add(box(.18, .14, 1.7, steel, { pos: [x, .24, 0] }));
    // nameplate
    const namePl = signBoard('P-01  BOOSTER PUMP', 1.0, .26, { bg: '#08171f', border: '#46a9ff' });
    namePl.position.set(.1, .5, .9);
    skid.add(namePl);
    // pump volute
    skid.add(cylinder(.46, .52, .5, cast, { pos: [-.78, .72, 0], rz: Math.PI / 2, segments: 26 }));
    skid.add(cylinder(.3, .3, .54, material(0x3d5162, { metalness: .6, roughness: .4 }), { pos: [-.78, .72, 0], rz: Math.PI / 2, segments: 20 }));
    // suction + discharge flanges
    skid.add(cylinder(.21, .21, .16, brass, { pos: [-1.34, .72, 0], rz: Math.PI / 2, segments: 18 }));
    skid.add(cylinder(.19, .19, .14, brass, { pos: [-.78, 1.12, 0], segments: 18 }));
    // volute feet
    skid.add(box(.56, .24, .8, dark, { pos: [-.78, .4, 0] }));
    // coupling guard
    skid.add(box(.62, .3, .34, material(0xd9a63c, { roughness: .55, metalness: .3 }), { pos: [.15, .72, 0] }));
    for (let i = 0; i < 5; i++) skid.add(box(.07, .3, .36, dark, { pos: [-.12 + i * .14, .72, 0], cast: false }));
    // sight glass window on the volute front (impeller visible through it)
    const winMat = new THREE.MeshPhysicalMaterial({ color: 0xd8f2ff, transparent: true, opacity: .34, roughness: .05, metalness: 0, depthWrite: false });
    skid.add(cylinder(.17, .17, .03, material(0x27343d, { metalness: .6 }), { pos: [-.78, .78, .46], rx: Math.PI / 2, segments: 22 }));
    skid.add(cylinder(.145, .145, .02, winMat, { pos: [-.78, .78, .485], rx: Math.PI / 2, segments: 22, cast: false }));
    // impeller behind the window
    const imp = group('impeller');
    imp.position.set(-.78, .78, .43);
    for (let i = 0; i < 4; i++) {
      const blade = box(.17, .035, .012, brass, {});
      const holder = group();
      holder.rotation.z = (i / 4) * Math.PI * 2;
      blade.position.set(.09, 0, 0);
      holder.add(blade);
      imp.add(holder);
    }
    imp.add(cylinder(.036, .036, .045, steel, { rx: Math.PI / 2, segments: 10 }));
    imp.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    imp.userData.noMerge = true;
    skid.add(imp);
    this.pumpImpeller = imp;

    // discharge column stub up to the discharge line
    skid.add(cylinder(.16, .16, .52, steel, { pos: [-.78, 1.44, 0], segments: 14 }));
    skid.add(cylinder(.2, .2, .1, brass, { pos: [-.78, 1.7, 0], segments: 16 }));

    mergeStaticGroup(skid);
    // animated parts must be (re)added after merging
    imp.position.set(-.78, .78, .43);
    skid.add(imp);
    this.cat.pumps.add(skid);
    this.addObject(skid, {
      id: 'pump', label: 'Booster Pump P-01', kind: 'pump', iconName: 'pump',
      description: 'Variable-speed end-suction booster pump raising municipal supply pressure into the elevated reservoir.',
    });
    this.scene.addCollider(skid);

    // motor assembly (separate interactive object)
    const motor = group('pump-motor');
    motor.position.set(PUMP.x + .88, 0, PUMP.z);
    motor.add(box(.9, .16, .7, dark, { pos: [0, .22, 0] }));
    const body = cylinder(.34, .34, 1.06, material(0x4f6474, { metalness: .6, roughness: .42 }), { pos: [0, .74, 0], rz: Math.PI / 2, segments: 26 });
    motor.add(body);
    for (let i = 0; i < 7; i++) motor.add(cylinder(.37, .37, .035, steel, { pos: [-.34 + i * .12, .74, 0], rz: Math.PI / 2, segments: 24, cast: false }));
    // terminal box + nameplate
    motor.add(box(.3, .2, .26, material(0x394b58, { metalness: .5 }), { pos: [.12, 1.13, 0] }));
    motor.add(box(.2, .1, .02, material(0xd9c27a, { roughness: .5, metalness: .4 }), { pos: [.12, 1.13, .14], cast: false }));
    const mPlate = signBoard('M-01  15 kW', .5, .16, { bg: '#1b1d1f', border: '#8fa6b4', color: '#e6eef3' });
    mPlate.position.set(.1, .78, .36);
    motor.add(mPlate);
    // motor feet
    motor.add(box(.9, .14, .14, dark, { pos: [0, .3, .42] }));
    motor.add(box(.9, .14, .14, dark, { pos: [0, .3, -.42] }));
    // cooling fan at the drive end + guard rings
    const fanHouse = cylinder(.3, .3, .14, steel, { pos: [.66, .74, 0], rz: Math.PI / 2, segments: 22 });
    motor.add(fanHouse);
    const fan = group('motor-fan');
    fan.position.set(.68, .74, 0);
    for (let i = 0; i < 6; i++) {
      const holder = group(); holder.rotation.x = (i / 6) * Math.PI * 2;
      const blade = box(.02, .24, .08, material(0xa9bcc9, { metalness: .6, roughness: .4 }), {});
      blade.position.set(0, .14, 0);
      blade.rotation.x = .42;
      holder.add(blade);
      fan.add(holder);
    }
    fan.add(cylinder(.05, .05, .05, steel, { rx: Math.PI / 2, segments: 12 }));
    fan.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    motor.add(fan);
    this.pumpFan = fan;
    // fan guard rings
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.08 + i * .08, .012, 5, 16), material(0x93a6b2, { metalness: .7, roughness: .4 }));
      ring.rotation.y = Math.PI / 2;
      ring.position.set(.77, .74, 0);
      motor.add(ring);
    }
    const glowMat = new THREE.MeshStandardMaterial({ color: 0x46a9ff, emissive: 0x46a9ff, emissiveIntensity: .2, roughness: .4 });
    this.leds.motorGlow = new THREE.Mesh(new THREE.BoxGeometry(.5, .022, .02), glowMat);
    this.leds.motorGlow.position.set(0, 1.01, .34);
    this.leds.motorGlow.castShadow = false;
    motor.add(this.leds.motorGlow);
    mergeStaticGroup(motor);
    fan.position.set(.68, .74, 0);
    motor.add(fan);
    this.leds.motorGlow.position.set(0, 1.01, .34);
    motor.add(this.leds.motorGlow);
    this.cat.pumps.add(motor);
    this.addObject(motor, {
      id: 'pump-motor', label: 'Pump Motor M-01', kind: 'motor', iconName: 'motor',
      description: '15 kW TEFC induction motor driving the booster pump through a guarded coupling.',
    });
  }

  buildPumpCanopy() {
    const g = group('pump-canopy');
    const steel = material(0x5b7182, { metalness: .66, roughness: .4 });
    const dark = material(C.darkSteel, { metalness: .6, roughness: .45 });
    const cx = PUMP.x, cz = PUMP.z - .2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      g.add(box(.16, 2.86, .16, steel, { pos: [cx + sx * 1.95, 1.43, cz + sz * 1.62] }));
      g.add(box(.42, .08, .42, dark, { pos: [cx + sx * 1.95, .04, cz + sz * 1.62] }));
    }
    g.add(box(4.3, .18, 3.6, material(0x4e6373, { metalness: .5, roughness: .5 }), { pos: [cx, 2.95, cz] }));
    g.add(box(4.4, .1, 3.7, dark, { pos: [cx, 2.83, cz] }));
    // gutter + downpipe
    g.add(box(4.5, .07, .1, steel, { pos: [cx, 2.86, cz + 1.88] }));
    g.add(cylinder(.05, .05, 2.8, steel, { pos: [cx + 2.1, 1.42, cz + 1.86], segments: 8 }));
    // work light
    const lampM = new THREE.MeshStandardMaterial({ color: 0xd6f2ff, emissive: 0xc6f2ff, emissiveIntensity: 1.5 });
    g.add(box(1.0, .05, .22, lampM, { pos: [cx, 2.66, cz], cast: false }));
    const light = new THREE.PointLight(0xd6f2ff, 4.2, 9, 2);
    light.position.set(cx, 2.4, cz);
    light.castShadow = false;
    g.add(light);
    this.lights.push({ light, mat: lampM, base: 4.2, baseEmissive: 1.5 });
    this.cat.roof.add(g);
    this.addObject(g, {
      id: 'pump-canopy', label: 'Pump Shelter Canopy', kind: 'structure', iconName: 'layers',
      description: 'Weather canopy over the booster pump skid with maintenance work lighting.',
    });
  }

  /* ---------------- Pump house / control room ---------------- */
  buildPumpHouse() {
    const px = 6.1, pz = -4.9, w = 3.8, d = 3.6, h = 2.7;
    const wallMat = material(0x3c4c58, { metalness: .22, roughness: .62 });
    const trim = material(0x7d909c, { metalness: .45, roughness: .45 });
    const dark = material(0x25323b, { metalness: .5, roughness: .5 });

    const walls = group('pump-house');
    walls.position.set(px, 0, pz);
    walls.add(box(w, h, .18, wallMat, { pos: [0, h / 2, -d / 2] }));
    walls.add(box(.18, h, d, wallMat, { pos: [-w / 2, h / 2, 0] }));
    walls.add(box(.18, h, d, wallMat, { pos: [w / 2, h / 2, 0] }));
    // front wall with a door opening on the left
    walls.add(box(.5, h, .18, wallMat, { pos: [-w / 2 + .25, h / 2, d / 2] }));
    walls.add(box(2.3, h, .18, wallMat, { pos: [w / 2 - 1.15, h / 2, d / 2] }));
    walls.add(box(1.0, h - 2.15, .18, wallMat, { pos: [-.9, 2.15 + (h - 2.15) / 2, d / 2] }));
    // corner trims + cill
    for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) walls.add(box(.14, h, .14, trim, { pos: [x, h / 2, z] }));
    walls.add(box(w + .2, .12, d + .2, dark, { pos: [0, .06, 0] }));
    walls.add(box(w + .16, .1, d + .16, trim, { pos: [0, h + .05, 0] }));
    // roof slab (separate roof category)
    const roof = group('pump-house-roof');
    roof.position.set(px, 0, pz);
    roof.add(box(w + .5, .18, d + .5, material(0x4a5c68, { metalness: .4, roughness: .55 }), { pos: [0, h + .2, 0] }));
    roof.add(box(w + .56, .1, d + .56, dark, { pos: [0, h + .34, 0] }));
    for (const x of [-1.2, 1.2]) roof.add(box(.7, .18, .5, material(0x566874, { metalness: .5 }), { pos: [x, h + .38, -.6] }));
    this.cat.roof.add(roof);
    this.cat.walls.add(walls);
    this.scene.addCollider(walls);
    this.addObject(walls, {
      id: 'pump-house', label: 'Pump House Control Room', kind: 'room', iconName: 'inventory',
      description: 'Weatherproof control room housing the plant telemetry rack, mimic panel and operator workstation.',
    });

    // door (interactive, animated)
    const doorPivot = group('pump-house-door');
    doorPivot.position.set(px - 1.4, 0, pz + d / 2 + .1);
    doorPivot.add(box(.98, 2.13, .07, material(0x2f4a58, { metalness: .45, roughness: .5 }), { pos: [.49, 1.07, 0] }));
    doorPivot.add(box(.62, .78, .02, new THREE.MeshPhysicalMaterial({ color: 0xcfe9f6, transparent: true, opacity: .35, roughness: .1, depthWrite: false }), { pos: [.49, 1.5, .05], cast: false }));
    doorPivot.add(cylinder(.025, .025, .17, trim, { pos: [.86, 1.08, .06], rz: Math.PI / 2 }));
    doorPivot.add(box(1.02, .06, .1, trim, { pos: [.49, 2.16, .02] }));
    this.doorPivot = doorPivot;
    this.doorOpen = false;
    this.cat.doors.add(doorPivot);
    this.addObject(doorPivot, {
      id: 'pump-house-door', label: 'Pump House Door', kind: 'door', iconName: 'door',
      description: 'Personnel door to the pump house control room.',
    });

    // windows
    const winM = new THREE.MeshPhysicalMaterial({ color: 0xbfe2f5, transparent: true, opacity: .3, roughness: .08, metalness: 0, depthWrite: false });
    const windows = group('pump-house-windows');
    windows.position.set(px, 0, pz);
    windows.add(box(1.25, .95, .04, winM, { pos: [.9, 1.62, d / 2 + .05], cast: false }));
    windows.add(box(1.33, .07, .1, trim, { pos: [.9, 2.02, d / 2 + .07] }));
    windows.add(box(1.33, .07, .1, trim, { pos: [.9, 1.22, d / 2 + .07] }));
    windows.add(box(1.33, .05, .08, trim, { pos: [.9, 1.62, d / 2 + .07] }));
    windows.add(box(.04, .95, 1.25, winM, { pos: [w / 2 + .05, 1.62, -.3], cast: false }));
    windows.add(box(.1, .07, 1.33, trim, { pos: [w / 2 + .07, 2.02, -.3] }));
    windows.add(box(.1, .07, 1.33, trim, { pos: [w / 2 + .07, 1.22, -.3] }));
    this.cat.windows.add(windows);

    // interior fit-out
    const interior = group('pump-house-interior');
    interior.position.set(px, 0, pz);
    interior.add(box(1.9, .08, .8, material(0x5a4a3a, { roughness: .7 }), { pos: [.1, .78, -.15] }));
    for (const x of [-.75, .95]) for (const z of [-.5, .2]) interior.add(box(.07, .74, .07, dark, { pos: [x, .38, z] }));
    const monMat = new THREE.MeshStandardMaterial({ color: 0x061820, emissive: 0x2a9f96, emissiveIntensity: .9 });
    interior.add(box(.6, .38, .04, monMat, { pos: [-.35, 1.12, -.13], rx: -.16, cast: false }));
    interior.add(box(.6, .38, .04, monMat, { pos: [.4, 1.12, -.13], rx: -.16, cast: false }));
    interior.add(box(.68, .44, .02, material(0x141c22), { pos: [-.35, 1.12, -.17], rx: -.16, cast: false }));
    interior.add(box(.68, .44, .02, material(0x141c22), { pos: [.4, 1.12, -.17], rx: -.16, cast: false }));
    // wall mimic panel
    interior.add(box(1.5, .95, .1, material(0x2c3b46, { metalness: .4 }), { pos: [0, 1.62, -d / 2 + .12] }));
    const mimic = new THREE.MeshStandardMaterial({ color: 0x071b23, emissive: 0x1c6f7c, emissiveIntensity: .8 });
    interior.add(box(1.3, .7, .02, mimic, { pos: [0, 1.62, -d / 2 + .19], cast: false }));
    // operator
    const person = makePerson(0x2b5f86);
    person.position.set(.15, 0, .55);
    person.rotation.y = Math.PI + .25;
    interior.add(person);
    // ceiling light + UV
    const ceilM = new THREE.MeshStandardMaterial({ color: 0xfff3d5, emissive: 0xffe9b8, emissiveIntensity: 1.4 });
    interior.add(box(1.3, .05, .3, ceilM, { pos: [0, 2.55, 0], cast: false }));
    const light = new THREE.PointLight(0xffe6c0, 3.4, 7, 2);
    light.position.set(0, 2.4, 0);
    interior.add(light);
    this.lights.push({ light, mat: ceilM, base: 3.4, baseEmissive: 1.4 });
    this.cat.equipment.add(interior);
    this.cat.ceiling.add(box(2.0, .06, 3.0, material(0x2a353d), { pos: [px, h, pz], cast: false }));

    // wall sign
    const sign = signBoard('PUMP HOUSE · NO. 2', 1.55, .32, { bg: '#071a24', border: '#46a9ff' });
    sign.position.set(px + 1.0, 2.28, pz + d / 2 + .12);
    this.cat.signs.add(sign);
  }

  /* ---------------- Pipelines ---------------- */
  buildPipelines() {
    const pipeMat = material(C.pipe, { metalness: .74, roughness: .3 });
    const flangeMat = material(C.flange, { metalness: .7, roughness: .4 });
    const CX = TANK.x, CZ = TANK.z;

    // municipal supply main into the pump suction
    const supply = this._pipeRun([
      [-13.5, .55, 6.4], [-13.5, .72, 6.4], [-12.2, .72, 6.1],
      [-10.4, .72, 5.2], [-8.6, .72, 4.2], [-7.08, .74, 3.4],
    ], .17, pipeMat, { flangeMat, name: 'supply-main' });
    this.cat.pipes.add(supply);
    this.addObject(supply, {
      id: 'supply-main', label: 'Municipal Supply Main', kind: 'pipe', iconName: 'link',
      description: 'DN300 municipal supply main and chamber feeding the booster pump suction header.',
    });

    // pump discharge to the elevated tank inlet (riser at -x of tower)
    const inletRun = this._pipeRun([
      [-6.58, 1.72, 3.4], [-6.58, 1.78, 3.4], [-4.9, 1.78, 3.4], [-3.4, 1.78, 3.4],
      [-2.4, 1.78, 3.4], [-2.4, 1.78, 2.6], [-2.4, 1.78, CZ], [-2.4, 6.28, CZ], [-1.56, 6.28, CZ],
    ], .155, pipeMat, { flangeMat, name: 'inlet-riser' });
    this.cat.pipes.add(inletRun);
    this.addObject(inletRun, {
      id: 'inlet-pipeline', label: 'Inlet Pipeline & Riser', kind: 'pipe', iconName: 'link',
      description: 'Pump discharge header rising to the tank inlet nozzle at the top of the reservoir.',
    });
    // inlet riser clamps against the tower leg
    for (const y of [2.2, 3.4, 4.6, 5.8]) {
      this.cat.pipes.add(box(.1, .1, .34, material(0x4b5a65, { metalness: .6 }), { pos: [-2.4, y, CZ + .18] }));
    }

    // tank outlet to the distribution header
    const outletRun = this._pipeRun([
      [1.45, 3.86, CZ + .55], [2.62, 3.86, CZ + .55], [2.62, .78, CZ + .55],
      [2.62, .78, 2.9], [2.62, .78, 4.8], [9.2, .78, 4.8],
    ], .155, pipeMat, { flangeMat, name: 'outlet-main' });
    this.cat.pipes.add(outletRun);
    this.addObject(outletRun, {
      id: 'outlet-pipeline', label: 'Outlet & Distribution Header', kind: 'pipe', iconName: 'link',
      description: 'Reservoir outlet main, gravity distribution header and service take-off branches.',
    });
    // decorative service branches off the distribution header
    const branchG = group('outlet-branches');
    for (const x of [6.3, 7.5, 8.4]) {
      const b = this._pipeRun([[x, .78, 4.8], [x, .78, 6.3]], .11, pipeMat, { flangeMat });
      branchG.add(b);
      b.add(cylinder(.2, .2, .12, flangeMat, { pos: [x, .78, 6.35], rx: Math.PI / 2, segments: 14 }));
    }
    branchG.add(this._pipeRun([[8.6, .78, 4.8], [8.6, 1.4, 4.8]], .1, pipeMat, { flangeMat }));
    this.cat.pipes.add(branchG);
    // outlet pipe support brackets
    for (const z of [-1.1, .6, 2.0, 3.6]) {
      this.cat.pipes.add(box(.12, .5, .12, material(0x4b5a65, { metalness: .6 }), { pos: [2.62, .5, z] }));
    }
    // thrust blocks at pipe bends
    const concreteM = material(C.concrete, { roughness: .9 });
    for (const [x, z] of [[-2.4, 2.9], [2.62, -1.4], [2.62, 4.4], [-10.6, 5.0]]) {
      this.cat.foundation.add(box(.7, .6, .7, concreteM, { pos: [x, .3, z] }));
    }
    // pipe name tags
    for (const [text, pos, ry] of [
      ['INLET DN300', [-2.4, 5.1, CZ + .4], 0],
      ['OUTLET DN300', [2.62, 1.9, CZ + .9], Math.PI / 2],
      ['SUPPLY', [-9.4, 1.15, 4.75], 0],
    ]) {
      const tag = textSprite(text, { size: 30, scale: .42, color: '#bfeee6', bg: 'rgba(4,14,22,.72)', border: 'rgba(70,169,255,.3)' });
      tag.position.set(...pos);
      tag.rotation.y = ry;
      this.cat.signs.add(tag);
    }
  }

  _flange(pos, dir, radius, mat) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .06, 14), mat);
    m.position.copy(pos);
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  _pipeRun(points, radius, mat, opts = {}) {
    const g = group(opts.name || 'pipe-run');
    const flangeMat = opts.flangeMat || material(C.flange, { metalness: .7, roughness: .4 });
    const vecs = points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    for (let i = 0; i < vecs.length - 1; i++) {
      g.add(cylinderBetween(points[i], points[i + 1], radius, mat, { segments: opts.segments ?? 12 }));
    }
    for (let i = 1; i < vecs.length - 1; i++) g.add(sphere(radius * 1.08, mat, { pos: points[i], segments: 12, cast: true, receive: true }));
    for (let i = 0; i < vecs.length - 1; i++) {
      const a = vecs[i], b = vecs[i + 1];
      const len = a.distanceTo(b);
      if (len < .02) continue;
      const dir = new THREE.Vector3().subVectors(b, a).normalize();
      const n = Math.max(1, Math.round(len / (opts.flangeStep ?? 1.9)));
      for (let k = 0; k < n; k++) {
        const p = a.clone().lerp(b, (k + .5) / n);
        g.add(this._flange(p, dir, radius * 1.42, flangeMat));
      }
    }
    mergeStaticGroup(g);
    return g;
  }

  /* ---------------- Valves ---------------- */
  buildValves() {
    this.valves.inlet = this._buildValve({
      id: 'inlet-valve', label: 'Inlet Isolation Valve V-01', position: [-4.9, 1.78, PUMP.z], axis: 'x', ref: 'inlet', bodyColor: 0x3d6d9c,
    });
    this.valves.outlet = this._buildValve({
      id: 'outlet-valve', label: 'Outlet Control Valve V-02', position: [2.62, .78, 1.6], axis: 'z', ref: 'outlet', bodyColor: 0x9c5b3d,
    });
  }

  /* Flag every mesh below a node as non-mergeable (animated / live material). */
  _noMergeDeep(node) {
    node?.traverse(o => { if (o.isMesh) o.userData.noMerge = true; });
    return node;
  }

  _buildValve({ id, label, position, axis, ref, bodyColor }) {
    const g = group(id);
    g.position.set(...position);
    const steel = material(C.steel, { metalness: .7, roughness: .36 });
    const dark = material(0x2b3842, { metalness: .55, roughness: .5 });
    // valve body (makeValve is oriented along X)
    const valve = makeValve(.3, bodyColor);
    if (axis === 'z') valve.rotation.y = Math.PI / 2;
    g.add(valve);
    // pipe flanges either side of the body along its axis
    const off = .34;
    for (const s of [-1, 1]) {
      const fl = cylinder(.24, .24, .07, material(C.flange, { metalness: .7, roughness: .4 }), { segments: 16 });
      if (axis === 'x') { fl.position.set(s * off, 0, 0); fl.rotation.z = Math.PI / 2; }
      else { fl.position.set(0, 0, s * off); fl.rotation.x = Math.PI / 2; }
      g.add(fl);
    }
    // actuator stack
    g.add(cylinder(.055, .055, .28, steel, { pos: [0, .48, 0], segments: 10 }));
    g.add(roundedBox(.42, .36, .32, material(0x354754, { metalness: .5, roughness: .46 }), { pos: [0, .78, 0], radius: .04 }));
    g.add(box(.34, .05, .26, dark, { pos: [0, .97, 0] }));
    // position indicator dial
    const dialMat = new THREE.MeshStandardMaterial({ map: flowDialTexture('OPEN %', 100, 'VALVE POSITION'), roughness: .5, metalness: .2 });
    const dial = new THREE.Mesh(new THREE.CircleGeometry(.12, 24), dialMat);
    dial.position.set(0, .8, .165);
    g.add(dial);
    const needlePivot = group();
    needlePivot.position.set(0, .8, .172);
    const needle = box(.012, .085, .008, material(0xe24b4b, { emissive: 0x801515, emissiveIntensity: .4 }), { pos: [0, .042, 0], cast: false });
    needlePivot.add(needle);
    needlePivot.add(cylinder(.015, .015, .012, steel, { rx: Math.PI / 2, segments: 10 }));
    g.add(needlePivot);
    // status LED
    const led = new THREE.Mesh(new THREE.SphereGeometry(.032, 10, 8), emissive(0xff4a5f, 1.6));
    led.position.set(.17, .93, .1);
    g.add(led);
    // hand wheel remains animated
    const wheel = valve.userData.wheel;
    // gearbox label
    const tag = textSprite(id === 'inlet-valve' ? 'V-01 INLET' : 'V-02 OUTLET', { size: 28, scale: .38, color: '#dff8f2', bg: 'rgba(4,14,22,.72)', border: 'rgba(70,169,255,.3)' });
    tag.position.set(0, 1.18, 0);
    tag.visible = this.labelsVisible;
    g.add(tag);
    mergeStaticGroup(g);
    // animated: wheel + indicator needle + led
    wheel.position.y = .135;
    g.add(wheel);
    g.add(needlePivot);
    g.add(led);
    this.cat.valves.add(g);
    this.addObject(g, {
      id, label, kind: 'valve', iconName: 'valve',
      description: `${axis === 'x' ? 'Inlet' : 'Outlet'} motorised butterfly isolation valve with manual hand wheel override.`,
    });
    return { group: g, wheel, needle: needlePivot, led };
  }

  /* ---------------- Flow meters ---------------- */
  buildFlowMeters() {
    this.flowMeters.inlet = this._buildFlowMeter({
      id: 'inlet-flow-meter', label: 'Inlet Flow Meter FT-03', position: [-3.4, 1.78, PUMP.z], axis: 'x', title: 'INLET', max: MAX_FLOW_SENSOR, unit: 'L/min',
    });
    this.flowMeters.outlet = this._buildFlowMeter({
      id: 'outlet-flow-meter', label: 'Outlet Flow Meter FT-04', position: [2.62, .78, 2.9], axis: 'z', title: 'OUTLET', max: MAX_FLOW_SENSOR, unit: 'L/min',
    });
  }

  _buildFlowMeter({ id, label, position, axis, title, max, unit }) {
    const g = group(id);
    g.position.set(...position);
    const steel = material(C.steel, { metalness: .7, roughness: .36 });
    const dark = material(0x2c3a44, { metalness: .55, roughness: .5 });
    const bodyM = material(C.brass, { metalness: .8, roughness: .34 });
    const body = cylinder(.185, .185, .46, bodyM, { segments: 18 });
    if (axis === 'x') body.rotation.z = Math.PI / 2;
    else body.rotation.x = Math.PI / 2;
    g.add(body);
    for (const s of [-1, 1]) {
      const fl = cylinder(.24, .24, .07, material(C.flange, { metalness: .7, roughness: .4 }), { segments: 16 });
      if (axis === 'x') { fl.position.x = s * .25; fl.rotation.z = Math.PI / 2; }
      else { fl.position.z = s * .25; fl.rotation.x = Math.PI / 2; }
      g.add(fl);
    }
    // dial head, angled toward the camera
    const dialGroup = group('meter-dial');
    dialGroup.position.set(0, .24, 0);
    dialGroup.rotation.x = -Math.PI / 2 + .62;
    dialGroup.rotation.z = axis === 'x' ? 0 : -.35;
    const rim = cylinder(.2, .2, .06, dark, { pos: [0, 0, -.03], segments: 24 });
    rim.rotation.x = Math.PI / 2;
    dialGroup.add(rim);
    const faceMat = new THREE.MeshStandardMaterial({ map: flowDialTexture(title, max, unit), roughness: .5, metalness: .2, emissive: 0x0a2028, emissiveIntensity: .4 });
    const face = new THREE.Mesh(new THREE.CircleGeometry(.18, 30), faceMat);
    face.position.z = .012;
    dialGroup.add(face);
    const needlePivot = group();
    needlePivot.position.set(0, 0, .02);
    const needle = box(.01, .13, .006, material(0xe24b4b, { emissive: 0x7a1212, emissiveIntensity: .5 }), { pos: [0, .062, 0], cast: false });
    needlePivot.add(needle);
    needlePivot.add(cylinder(.014, .014, .012, steel, { rx: Math.PI / 2, segments: 10 }));
    dialGroup.add(needlePivot);
    g.add(dialGroup);
    // sensor junction box on top of the pipe
    g.add(box(.2, .14, .16, material(0x33454f, { metalness: .5 }), { pos: [0, -.02, .28] }));
    mergeStaticGroup(g);
    g.add(dialGroup);
    const tag = textSprite(`${title} FLOW`, { size: 28, scale: .4, color: '#dff8f2', bg: 'rgba(4,14,22,.72)', border: 'rgba(70,169,255,.3)' });
    tag.position.set(0, .78, 0);
    tag.visible = this.labelsVisible;
    g.add(tag);
    this.cat.equipment.add(g);
    this.addObject(g, {
      id, label, kind: 'flowmeter', iconName: 'gauge',
      description: `Electromagnetic ${title.toLowerCase()} flow meter with local rate indicator and pulse output to the SCADA totaliser.`,
    });
    return { group: g, needle: needlePivot };
  }

  buildPressureGauge() {
    const g = group('pressure-gauge');
    g.position.set(-6.58, 2.28, PUMP.z);
    const steel = material(C.steel, { metalness: .7, roughness: .36 });
    g.add(cylinder(.035, .035, .5, steel, { pos: [0, -.24, 0], segments: 8 }));
    g.add(cylinder(.24, .24, .1, material(0x2c3a44, { metalness: .55, roughness: .5 }), { pos: [0, 0, 0], segments: 22 }));
    const faceMat = new THREE.MeshStandardMaterial({ map: flowDialTexture('INLET', 10, 'bar'), roughness: .5, metalness: .2, emissive: 0x0a2028, emissiveIntensity: .4 });
    const face = new THREE.Mesh(new THREE.CircleGeometry(.19, 28), faceMat);
    face.position.z = .053;
    g.add(face);
    const pivot = group();
    pivot.position.set(0, 0, .062);
    const needle = box(.01, .14, .006, material(0xe24b4b, { emissive: 0x7a1212, emissiveIntensity: .5 }), { pos: [0, .065, 0], cast: false });
    pivot.add(needle);
    g.add(pivot);
    g.add(cylinder(.06, .06, .12, material(0x30414c, { metalness: .5 }), { pos: [0, .08, 0], segments: 12 }));
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.pressureGaugeNeedle = pivot;
    this.cat.equipment.add(g);
    this.addObject(g, {
      id: 'pressure-gauge', label: 'Discharge Pressure Gauge PI-07', kind: 'gauge', iconName: 'gauge',
      description: 'Local analogue indicator of pump discharge pressure (bar).',
    });
  }

  /* ---------------- Control cabinet ---------------- */
  buildControlCabinet() {
    const cab = makeControlCabinet(1.25, 2.05, .62, { color: 0x344854, doorColor: 0x3f5866 });
    cab.position.set(4.7, .14, -2.2);
    cab.rotation.y = -.18;
    this.cat.cabinets.add(cab);
    // status lamps on the cabinet door
    const lampPositions = [[-.4, 1.72], [-.2, 1.72], [0, 1.72]];
    const lampColors = [0x3ce58b, 0xffb547, 0xff4a5f];
    this.leds.cabinet = lampPositions.map((p, i) => {
      const mat = emissive(lampColors[i], .25);
      const m = new THREE.Mesh(new THREE.SphereGeometry(.028, 10, 8), mat);
      m.position.set(p[0], p[1], .33);
      cab.add(m);
      return { mesh: m, mat };
    });
    // tower signal beacon
    const tower = makeTowerLight('ok');
    tower.position.set(3.6, 0, -1.0);
    this.towerLight = tower;
    this.cat.equipment.add(tower);
    this.addObject(tower, {
      id: 'signal-beacon', label: 'Plant Status Beacon', kind: 'beacon', iconName: 'light',
      description: 'Three-aspect signal beacon reporting plant alarm state (red / amber / green).',
    });
    mergeStaticGroup(cab);
    this.cat.cabinets.add(cab);
    this.addObject(cab, {
      id: 'control-cabinet', label: 'Water SCADA Control Cabinet', kind: 'cabinet', iconName: 'equipment',
      description: 'PLC control cabinet with telemetry radio, status lamps and hard-wired pump/valve interlocks.',
    });
    this.scene.addCollider(cab);
  }

  /* ---------------- Pump house HMI panel ---------------- */
  buildPumpPanel() {
    const g = group('pump-house-panel');
    g.position.set(-3.55, 0, 5.05);
    g.rotation.y = .62;
    const steel = material(0x5f7484, { metalness: .68, roughness: .38 });
    const dark = material(0x27343d, { metalness: .5, roughness: .52 });
    g.add(box(.86, .12, .62, dark, { pos: [0, .06, 0] }));
    g.add(cylinder(.09, .1, .92, steel, { pos: [0, .56, 0], segments: 14 }));
    g.add(box(.2, .16, .2, dark, { pos: [0, 1.04, 0] }));
    // panel head
    const head = group('hmi-head');
    head.position.set(0, 1.36, .02);
    head.rotation.x = -.24;
    head.add(roundedBox(1.06, .72, .16, material(0x35505f, { metalness: .45, roughness: .45 }), { pos: [0, 0, 0], radius: .04 }));
    head.add(box(.96, .56, .04, material(0x0b171d, { metalness: .3 }), { pos: [0, 0, .085], cast: false }));
    // live HMI screen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 288;
    this._hmiCanvas = canvas;
    this._hmiCtx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._hmiTex = tex;
    const screenMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: .62, roughness: .28, metalness: .1 });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.86, .48), screenMat);
    screen.position.set(0, 0, .115);
    this._hmiScreen = screen;
    head.add(screen);
    // row of push buttons under the screen
    const cols = [0x3ce58b, 0xffb547, 0x46a9ff, 0xff4a5f, 0x9fb0bb];
    cols.forEach((c, i) => {
      const m = emissive(c, .35);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .02, 12), m);
      b.rotation.x = Math.PI / 2;
      b.position.set(-.3 + i * .15, -.29, .1);
      head.add(b);
    });
    this.leds.hmi = emissive(0x3ce58b, 1.8);
    const hmiLed = new THREE.Mesh(new THREE.SphereGeometry(.02, 10, 8), this.leds.hmi);
    hmiLed.position.set(.44, .29, .1);
    head.add(hmiLed);
    g.add(head);
    // side cable gland
    g.add(cylinder(.05, .07, .3, dark, { pos: [0, .22, -.2], rx: .4, segments: 8 }));
    this.cat.cabinets.add(g);
    this.addObject(g, {
      id: 'pump-house-panel', label: 'Pump House HMI Panel', kind: 'panel', iconName: 'panel',
      description: 'Local operator HMI with live level, flow, pump and alarm telemetry plus manual control pushbuttons.',
    });
  }

  /* ---------------- Lighting ---------------- */
  buildLighting() {
    const positions = [[-10.4, 0, 1.6, .55], [10.2, 0, -1.2, -2.5], [10.2, 0, 6.2, Math.PI]];
    positions.forEach(([x, z, ry], i) => {
      const lamp = makeLampPost(6.1);
      lamp.position.set(x, 0, z);
      if (typeof ry === 'number') lamp.rotation.y = ry;
      this.cat.lighting.add(lamp);
      this.lights.push({ light: lamp.userData.light, mat: lamp.userData.lampMaterial, base: 8, baseEmissive: 1.8 });
      this.addObject(lamp, {
        id: `lamp-${i + 1}`, label: `Yard Floodlight L-${i + 1}`, kind: 'lamp', iconName: 'light',
        description: 'LED yard floodlight on the site lighting circuit.',
      });
    });
  }

  setLightingState(on) {
    this.lightingOn = !!on;
    for (const l of this.lights) {
      if (!l.light) continue;
      l.light.intensity = on ? l.base : 0;
      if (l.mat) l.mat.emissiveIntensity = on ? l.baseEmissive : 0;
    }
  }

  /* ---------------- Wiring ---------------- */
  buildWiring() {
    const cableMat = material(0x1f303c, { roughness: .7, metalness: .2 });
    const conduitMat = material(0x6b7f8d, { metalness: .6, roughness: .44 });
    const tray = group('cable-tray');
    tray.add(this._pipeRun([[7.6, .12, -2.4], [7.6, .12, 1.6], [3.2, .12, 1.6], [-2.4, .12, 2.2], [-4.6, .12, 2.4]], .055, cableMat, { flangeStep: 4 }));
    tray.add(this._pipeRun([[7.6, .12, -2.4], [7.6, .12, -4.6], [6.2, .12, -4.9]], .05, cableMat, { flangeStep: 4 }));
    // conduit up the tower to the level instruments
    tray.add(this._pipeRun([[2.2, .1, -1.2], [2.2, 3.3, -1.2], [1.6, 3.6, -1.2], [1.2, 3.9, -1.4]], .045, conduitMat, { flangeStep: 3 }));
    tray.add(this._pipeRun([[2.6, .1, -1.65], [2.6, 1.2, -1.65], [2.9, 1.6, -1.65]], .04, conduitMat, { flangeStep: 3 }));
    tray.add(this._pipeRun([[-4.9, .1, 4.3], [-4.9, .1, 3.7], [-4.9, .8, 3.7], [-4.9, 1.3, 3.6]], .04, conduitMat, { flangeStep: 2 }));
    // junction boxes
    for (const [x, y, z] of [[7.6, .18, 1.6], [2.2, .16, -1.2], [-4.9, .16, 4.3], [3.2, .18, 1.6]]) {
      tray.add(box(.3, .18, .22, material(0x35454f, { metalness: .5 }), { pos: [x, y, z] }));
    }
    this.cat.wiring.add(tray);
  }

  /* ---------------- Signage ---------------- */
  buildSignage() {
    const steel = material(0x778b98, { metalness: .6, roughness: .42 });
    // main facility board at the entrance
    const signGroup = group('facility-sign');
    signGroup.position.set(-1.2, 0, 9.3);
    for (const x of [-1.9, 1.9]) {
      signGroup.add(cylinder(.08, .1, 2.6, steel, { pos: [x, 1.3, 0], segments: 10 }));
    }
    const board = signBoard('NEXUS WATER AUTHORITY · TANK FARM T-01', 5.0, .78, { bg: '#06141e', border: '#46a9ff', color: '#cdeeff' });
    board.position.set(0, 2.42, .02);
    signGroup.add(board);
    const sub = signBoard('POTABLE WATER · RESTRICTED ACCESS', 3.2, .32, { bg: '#081a20', border: '#2f7183' });
    sub.position.set(0, 1.9, .03);
    signGroup.add(sub);
    mergeStaticGroup(signGroup);
    this.cat.signs.add(signGroup);
    this.addObject(signGroup, {
      id: 'facility-sign', label: 'Facility Identification Board', kind: 'sign', iconName: 'info',
      description: 'Site identification and access restriction notice for the potable water tank farm.',
    });
    this.scene.addCollider(signGroup);

    // hazard signage near the pressurised inlet
    const hazard = group('hazard-sign');
    hazard.position.set(-1.1, 0, 4.9);
    hazard.rotation.y = .5;
    hazard.add(cylinder(.05, .06, 2.0, steel, { pos: [0, 1.0, 0], segments: 8 }));
    const hb = signBoard('CAUTION · PRESSURISED PIPE', 1.55, .38, { bg: '#1b1305', border: '#f6b44b', color: '#ffd98f' });
    hb.position.set(0, 1.78, 0);
    hazard.add(hb);
    mergeStaticGroup(hazard);
    this.cat.signs.add(hazard);
    this.addObject(hazard, {
      id: 'hazard-sign', label: 'Pressurised Pipe Warning Sign', kind: 'sign', iconName: 'warning',
      description: 'Safety notice for the pressurised booster discharge pipeline.',
    });

    // tank outlet notice
    const notice = signBoard('NOTICE · TANK OUTLET', 1.3, .3, { bg: '#071a20', border: '#3f8fa0' });
    notice.position.set(3.3, 2.35, -1.3);
    notice.rotation.y = -.35;
    this.cat.signs.add(notice);

    // pump house identification plate
    const doorPlate = signBoard('MCC / CONTROL', .9, .24, { bg: '#0a1a22', border: '#46a9ff' });
    doorPlate.position.set(4.72, 2.42, -3.06);
    this.cat.signs.add(doorPlate);
  }

  /* ---------------- Instrumentation ---------------- */
  buildSensors() {
    const specs = [
      ['level', [1.42, 6.44, -1.22], .82, -.7, true, .52],
      ['volume', [1.62, 3.66, -.95], .74, .5, false],
      ['inlet-flow', [-3.4, 2.16, PUMP.z], .74, 0, true, .5],
      ['outlet-flow', [2.98, 1.12, 2.9], .72, -Math.PI / 2, false],
      ['pump-current', [-4.92, 1.44, PUMP.z], .72, 0, false],
      ['pump-temp', [-6.58, 1.32, PUMP.z + .5], .72, 0, false],
      ['inlet-pressure', [-6.58, 2.68, PUMP.z], .72, 0, false],
      ['turbidity', [2.94, 1.94, TANK.z + .55], .72, -Math.PI / 2, false],
    ];
    for (const [id, pos, scale, rotY, label, labelOffset] of specs) {
      const node = this.createSensorNode(id, {
        scale, position: pos, rotation: [0, rotY || 0, 0], label: !!label, labelOffset: labelOffset ?? .5, labelScale: .46,
      });
      this.cat.sensors.add(node);
    }
  }

  /* ---------------- Background context ---------------- */
  buildBackground() {
    const bgM = material(0x0b141c, { roughness: .96, metalness: 0 });
    const winM = new THREE.MeshBasicMaterial({ color: 0x2b7d86, transparent: true, opacity: .25 });
    for (let i = 0; i < 8; i++) {
      const w = 8 + Math.random() * 10, h = 3 + Math.random() * 6, d = 6 + Math.random() * 8;
      const x = -56 + i * 16 + Math.random() * 4;
      const b = box(w, h, d, bgM, { pos: [x, h / 2 - .2, -46 - Math.random() * 16], cast: false, receive: false });
      b.userData.ignoreFit = true;
      this.scene.world.add(b);
      const stripe = box(w * .65, .08, .1, winM, { pos: [x, h * .62, -46 + d / 2 + .2], cast: false });
      stripe.userData.ignoreFit = true;
      this.scene.world.add(stripe);
    }
    // distant water towers for industrial context
    for (const [x, z, h] of [[-34, -34, 13], [30, -30, 11]]) {
      const towerGroup = group('bg-tower');
      towerGroup.position.set(x, 0, z);
      towerGroup.add(cylinder(.32, .42, h, material(0x16222b, { roughness: .9 }), { pos: [0, h / 2, 0], segments: 10, cast: false }));
      towerGroup.add(cylinder(2.2, 2.2, 3.4, material(0x16222b, { roughness: .9 }), { pos: [0, h + 1.2, 0], segments: 16, cast: false }));
      towerGroup.add(new THREE.Mesh(new THREE.ConeGeometry(2.3, 1.1, 16), material(0x121c24, { roughness: .9 })));
      towerGroup.children[towerGroup.children.length - 1].position.set(0, h + 3.45, 0);
      towerGroup.traverse(o => { if (o.isMesh) o.userData.ignoreFit = true; });
      this.scene.world.add(towerGroup);
    }
  }

  /* ---------------- Equipment register ---------------- */
  buildEquipmentList() {
    this.addEquipment({ id: 'tank', name: 'Reservoir Tank T-01', type: 'storage', iconName: 'tank', objectId: 'tank', status: () => this.levelBand().label, tone: () => this.levelTone() });
    this.addEquipment({ id: 'pump', name: 'Booster Pump P-01', type: 'pump', iconName: 'pump', objectId: 'pump', status: () => this.pumpLabel(), tone: () => this.pumpTone() });
    this.addEquipment({ id: 'motor', name: 'Pump Motor M-01', type: 'motor', iconName: 'motor', objectId: 'pump-motor', status: () => `${ui.fmt(this.pump.current, 1)} A · ${ui.fmt(this.pump.temperature, 0)} °C`, tone: () => this.pumpTone() });
    this.addEquipment({ id: 'inlet-valve', name: 'Inlet Valve V-01', type: 'valve', iconName: 'valve', objectId: 'inlet-valve', status: () => this.valveLabel('inlet'), tone: () => this.valveTone('inlet') });
    this.addEquipment({ id: 'outlet-valve', name: 'Outlet Valve V-02', type: 'valve', iconName: 'valve', objectId: 'outlet-valve', status: () => this.valveLabel('outlet'), tone: () => this.valveTone('outlet') });
    this.addEquipment({ id: 'inlet-flow', name: 'Inlet Flow Meter FT-03', type: 'instrument', iconName: 'gauge', objectId: 'inlet-flow-meter', status: () => `${ui.fmt(this.inletFlow, 1)} L/min`, tone: () => this.faults.flowMeter ? 'danger' : 'ok' });
    this.addEquipment({ id: 'outlet-flow', name: 'Outlet Flow Meter FT-04', type: 'instrument', iconName: 'gauge', objectId: 'outlet-flow-meter', status: () => `${ui.fmt(this.outletFlow, 1)} L/min`, tone: () => 'ok' });
    this.addEquipment({ id: 'level-transmitter', name: 'Level Transmitter LT-01', type: 'instrument', iconName: 'sensor', objectId: 'sensor.level', status: () => this.sensorText('level'), tone: () => this.sensorTone('level') });
    this.addEquipment({ id: 'PLC', name: 'SCADA Control Cabinet', type: 'controller', iconName: 'equipment', objectId: 'control-cabinet', status: () => this.manualMode ? 'MANUAL' : 'AUTOMATIC', tone: () => this.manualMode ? 'warn' : 'ok' });
  }

  /* ---------------- Draw call optimisation ---------------- */
  optimizeStaticGeometry() {
    for (const id of ['floor', 'foundation', 'columns', 'walls', 'roof', 'ceiling', 'fencing', 'wiring', 'pipes']) {
      const catGroup = this.cat[id];
      if (catGroup) mergeStaticGroup(catGroup, { forceNoShadow: id === 'floor' });
    }
    // tiny instrument props: never cast shadows
    for (const vis of this.sensorVisuals.values()) {
      vis.node?.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    }
  }

  /* =========================================================
     Sensors
     ========================================================= */
  defineSensors() {
    const cap = clamp(+(this.config?.capacity ?? 10000), MIN_CAP, MAX_CAP);
    const volMax = Math.max(20000, Math.ceil(cap));
    return [
      { id: 'level', name: 'Tank Level', unit: '%', min: 0, max: 100, digits: 1, value: 65, iconName: 'tank', alarmLow: 20, alarmHigh: 95 },
      { id: 'volume', name: 'Stored Volume', unit: 'L', min: 0, max: volMax, digits: 0, value: cap * .65, iconName: 'droplet', alarmLow: cap * .1, alarmHigh: cap * .98 },
      { id: 'inlet-flow', name: 'Inlet Flow', unit: 'L/min', min: 0, max: MAX_FLOW_SENSOR, digits: 1, value: 0, iconName: 'activity', alarmLow: -1, alarmHigh: 480 },
      { id: 'outlet-flow', name: 'Outlet Flow', unit: 'L/min', min: 0, max: MAX_FLOW_SENSOR, digits: 1, value: 0, iconName: 'activity', alarmLow: -1, alarmHigh: 480 },
      { id: 'pump-current', name: 'Pump Motor Current', unit: 'A', min: 0, max: 40, digits: 2, value: 0, iconName: 'bolt', alarmLow: -1, alarmHigh: 20 },
      { id: 'pump-temp', name: 'Pump Temperature', unit: '°C', min: 0, max: 120, digits: 1, value: AMBIENT_TEMP, iconName: 'thermometer', alarmLow: -1, alarmHigh: 80 },
      { id: 'inlet-pressure', name: 'Inlet Pressure', unit: 'bar', min: 0, max: 10, digits: 2, value: 0, iconName: 'gauge', alarmLow: .3, alarmHigh: 8 },
      { id: 'turbidity', name: 'Water Turbidity', unit: 'NTU', min: 0, max: 50, digits: 1, value: 3.2, iconName: 'droplet', alarmLow: -1, alarmHigh: 15 },
    ];
  }

  defineAlarmRules() {
    return [
      {
        id: 'level-low', title: 'Reservoir Level Low', severity: 'warning',
        thresholdKey: 'lowLevel', defaultThreshold: 20, thresholdLabel: 'Low level', thresholdUnit: '%', thresholdMin: 5, thresholdMax: 80, thresholdStep: 1,
        message: () => `Reservoir level at ${ui.fmt(this.levelPercent(), 1)} % — below the ${this.threshold('lowLevel', 20)} % low limit.`,
        active: () => this.levelPercent() < this.threshold('lowLevel', 20),
      },
      {
        id: 'level-critical', title: 'Reservoir Level Critical', severity: 'critical',
        thresholdKey: 'criticalLevel', defaultThreshold: 8, thresholdLabel: 'Critical level', thresholdUnit: '%', thresholdMin: 1, thresholdMax: 40, thresholdStep: 1,
        message: () => `Reservoir critically low at ${ui.fmt(this.levelPercent(), 1)} % — supply risk.`,
        active: () => this.levelPercent() < this.threshold('criticalLevel', 8),
      },
      {
        id: 'level-high', title: 'Reservoir Level High', severity: 'warning',
        thresholdKey: 'highLevel', defaultThreshold: 88, thresholdLabel: 'High level', thresholdUnit: '%', thresholdMin: 50, thresholdMax: 100, thresholdStep: 1,
        message: () => `Reservoir level at ${ui.fmt(this.levelPercent(), 1)} % — above the ${this.threshold('highLevel', 88)} % high limit.`,
        active: () => this.levelPercent() >= this.threshold('highLevel', 88),
      },
      {
        id: 'overflow', title: 'Tank Overflow Risk', severity: 'critical',
        thresholdKey: 'overflowLevel', defaultThreshold: 95, thresholdLabel: 'Overflow level', thresholdUnit: '%', thresholdMin: 80, thresholdMax: 100, thresholdStep: 1,
        message: () => `Overflow risk: reservoir at ${ui.fmt(this.levelPercent(), 1)} % of capacity.`,
        active: () => this.levelPercent() >= this.threshold('overflowLevel', 95),
      },
      {
        id: 'pump-dry', title: 'Pump Dry Run', severity: 'critical',
        thresholdKey: 'dryRunSeconds', defaultThreshold: 4, thresholdLabel: 'Dry-run trip delay', thresholdUnit: 's', thresholdMin: 1, thresholdMax: 60, thresholdStep: 1,
        message: () => this.pump.tripped ? 'Booster pump tripped on dry-run protection — prime the pump before restart.' : 'Booster pump running without suction flow.',
        active: () => (this.pump.on && this.pump.dry) || this.pump.tripped,
      },
      {
        id: 'pump-failure', title: 'Pump Motor Failure', severity: 'critical',
        message: () => 'Booster pump motor failure latched. Pump is unavailable until the fault is cleared.',
        active: () => this.pump.failed || this.faults.pumpFailure,
      },
      {
        id: 'abnormal-flow', title: 'Abnormal Flow Detected', severity: 'warning',
        thresholdKey: 'abnormalFlow', defaultThreshold: 480, thresholdLabel: 'Flow limit', thresholdUnit: 'L/min', thresholdMin: 100, thresholdMax: 520, thresholdStep: 5,
        message: () => {
          const v = Math.max(this.sensorValue('inlet-flow') ?? 0, this.sensorValue('outlet-flow') ?? 0);
          return `Measured flow ${ui.fmt(v, 1)} L/min exceeds the ${this.threshold('abnormalFlow', 480)} L/min limit.`;
        },
        active: () => {
          const v = Math.max(this.sensorValue('inlet-flow') ?? 0, this.sensorValue('outlet-flow') ?? 0);
          return this.faults.flowMeter || v > this.threshold('abnormalFlow', 480);
        },
      },
      {
        id: 'sensor-failure', title: 'Instrument Failure', severity: 'critical',
        message: () => 'Turbidity analyser AT-08 is not responding. Water quality assurance degraded.',
        active: () => this.faults.sensorFailure,
      },
      {
        id: 'pump-overheat', title: 'Pump Motor Overheating', severity: 'warning',
        thresholdKey: 'overheatTemp', defaultThreshold: 80, thresholdLabel: 'Overheat limit', thresholdUnit: '°C', thresholdMin: 40, thresholdMax: 120, thresholdStep: 1,
        message: () => `Pump motor temperature ${ui.fmt(this.pump.temperature, 1)} °C exceeds the ${this.threshold('overheatTemp', 80)} °C limit.`,
        active: () => this.pump.temperature > this.threshold('overheatTemp', 80),
      },
    ];
  }

  getAnalyticsDefs() {
    return [
      { id: 'level', label: 'Tank Level', unit: '%', color: '#46a9ff', get: () => this.levelPercent(), digits: 1 },
      { id: 'inlet-flow', label: 'Inlet Flow', unit: 'L/min', color: '#36e2c2', get: () => this.inletFlow, digits: 1 },
      { id: 'outlet-flow', label: 'Outlet Flow', unit: 'L/min', color: '#a98bff', get: () => this.outletFlow, digits: 1 },
      { id: 'pump-current', label: 'Pump Current', unit: 'A', color: '#ffb547', get: () => this.pump.current, digits: 1 },
      { id: 'turbidity', label: 'Turbidity', unit: 'NTU', color: '#ff8095', get: () => this.turbidity, digits: 1 },
    ];
  }

  primarySeriesIds() { return ['level', 'inlet-flow']; }

  /* =========================================================
     Simulation
     ========================================================= */
  updateSimulation(dt) {
    if (!this.scene) return;
    this._time += dt;
    this._autoControl(dt);
    this._moveValves(dt);
    this._pumpPhysics(dt);
    this._hydraulics(dt);
    this._transferUpdate(dt);
    this._updateSensors();
    this._updateVisuals(dt);
  }

  _autoControl(dt) {
    if (this.manualMode) return;
    const p = this.pump;
    const level = this.levelPercent();

    if (this.inletValve.auto) {
      this.inletValve.target = (p.on && !p.failed) ? 100 : 0;
    }
    if (this.outletValve.auto) {
      const drain = (this.autoDrain && level > this.drainTarget + 0.5);
      const demand = this.demand.active && level > 2;
      this.outletValve.target = (drain || demand) ? 100 : 0;
    }

    if (p.auto && !p.failed && !p.restarting) {
      if (p.tripped) {
        p.on = false;
      } else if (this.autoFill) {
        if (level >= this.targetLevel) p.on = false;
        else if (level < this.targetLevel - 1.5 && level > 3) p.on = true;
        if (level < 4) p.on = false;
      } else if (this.autoDrain || this.demand.active) {
        p.on = false;
      } else {
        p.on = false;
      }
    }
    // suppress dry run from automatic logic
    if (p.on && level < 1.5 && p.auto) p.on = false;
  }

  _moveValves(dt) {
    for (const v of [this.inletValve, this.outletValve]) {
      const rate = clamp(v.speed, 5, 100) * dt;
      const diff = v.target - v.pct;
      if (Math.abs(diff) <= rate) v.pct = v.target;
      else v.pct += Math.sign(diff) * rate;
      v.pct = clamp(v.pct, 0, 100);
    }
  }

  _pumpPhysics(dt) {
    const p = this.pump;
    if (p.failed) {
      p.on = false;
      p.restarting = false;
      p.dry = false;
      p.dryTimer = 0;
    }
    if (p.restarting) {
      p.restartTimer -= dt;
      if (p.restartTimer <= 0) {
        p.restarting = false;
        p.on = true;
        p.starts++;
        this.logEvent('Pump started', 'Booster pump P-01 restart sequence complete.', 'ok');
      }
    }
    const levelFrac = this.levelPercent() / 100;
    p.dry = !!p.on && !p.failed && levelFrac < 0.016;
    if (p.dry) {
      p.dryTimer += dt;
      const limit = this.threshold('dryRunSeconds', 4);
      if (p.dryTimer >= limit && !p.tripped) {
        p.tripped = true;
        p.on = false;
        p.dryTimer = 0;
        this.logEvent('Pump dry-run trip', 'P-01 tripped on low-suction protection. Prime and restart.', 'danger');
      }
    } else if (p.dryTimer > 0) {
      p.dryTimer = Math.max(0, p.dryTimer - dt * 2);
    }

    let targetCurrent = 0;
    if (p.on && !p.failed) {
      const speedF = 0.55 + 0.45 * (clamp(p.speed, 10, 120) / 100);
      const valveF = 0.62 + 0.38 * (this.inletValve.pct / 100);
      targetCurrent = RATED_CURRENT * speedF * valveF * p.load;
      if (p.dry) targetCurrent = RATED_CURRENT * 0.32 * speedF;
      if (this.faults.motorOverload) targetCurrent *= 1.55;
    }
    p.current += (targetCurrent - p.current) * Math.min(1, dt * 2.6);
    p.current = clamp(p.current, 0, 40);

    const heatTarget = AMBIENT_TEMP + p.current * 2.7 + (p.dry ? 10 : 0) + (p.failed ? 16 : 0);
    p.temperature += (heatTarget - p.temperature) * Math.min(1, dt / 42);
    p.temperature = clamp(p.temperature, 15, 140);

    if (p.on && !p.failed) {
      p.runtime += dt;
      p.fanAngle += (1.4 + (p.speed / 100) * 7.2) * dt;
    }
  }

  _hydraulics(dt) {
    const cap = this.capacityL;
    const frac = clamp(this.volumeL / cap, 0, 1);
    const p = this.pump;
    const suctionOk = this.volumeL > cap * 0.003;
    let inlet = 0;
    if (p.on && !p.failed && suctionOk) {
      const speedF = clamp(p.speed / 100, 0.1, 1.2);
      const valveF = this.inletValve.pct / 100;
      const headF = clamp(1 - Math.pow(frac, 2.4) * 0.55, 0.35, 1);
      const loadF = 0.86 + 0.14 * p.load;
      inlet = this.pumpFlowCap * speedF * valveF * headF * loadF;
      if (p.dry) inlet *= 0.12;
    }
    const outletF = this.outletValve.pct / 100;
    const headOut = Math.sqrt(clamp(frac - 0.005, 0, 1));
    let outlet = OUTLET_FLOW_MAX * outletF * (0.3 + 0.7 * headOut);
    if (this.demand.active) outlet *= this.demandFactor();
    if (this.faults.flowMeter) inlet = Math.min(this.pumpFlowCap * 1.25, MAX_FLOW_SENSOR);

    this.inletFlow = Math.max(0, inlet);
    this.outletFlow = Math.max(0, outlet);

    const before = this.volumeL;
    const netL = (this.inletFlow - this.outletFlow) / 60 * dt;
    this.volumeL = clamp(this.volumeL + netL, 0, cap);
    const actual = this.volumeL - before;
    if (actual >= 0) { this.totalInflowL += actual; this._inletTotaliser = (this._inletTotaliser || 0) + actual; }
    else { this.totalOutflowL += -actual; this._outletTotaliser = (this._outletTotaliser || 0) + -actual; }

    // pump discharge pressure
    let pressure = 0.04 + frac * 0.16;
    if (p.on && !p.failed) {
      const speedF = clamp(p.speed / 100, 0, 1.2);
      const valveF = this.inletValve.pct / 100;
      pressure = 0.55 + 4.3 * speedF * (0.28 + 0.72 * (1 - valveF * 0.6)) + frac * 0.15;
      if (p.dry) pressure *= 0.3;
      if (this.faults.motorOverload) pressure *= 1.08;
    }
    this.inletPressureBar = clamp(pressure, 0, 9.9);

    // potable water quality model (sediment resuspension at low level, fresh inflow dilution)
    const turbTarget = 2.1 + (this.inletFlow + this.outletFlow) * 0.006
      + Math.max(0, (25 - this.levelPercent()) / 25) * 6
      + (this.demand.active ? 0.4 : 0) + Math.sin(this._time * 0.31) * 0.22;
    this.turbidity += (turbTarget - this.turbidity) * Math.min(1, dt / 6);
    this.turbidity = clamp(this.turbidity, 0.4, 48);
  }

  _transferUpdate(dt) {
    if (!this.transfer) return;
    const step = Math.min(this.transfer.remaining, (this.transfer.rate / 60) * dt);
    const before = this.volumeL;
    if (this.transfer.type === 'fill') this.volumeL = clamp(this.volumeL + step, 0, this.capacityL);
    else this.volumeL = clamp(this.volumeL - step, 0, this.capacityL);
    const done = Math.abs(this.volumeL - before);
    if (this.transfer.type === 'fill') this.totalInflowL += done;
    else this.totalOutflowL += done;
    this.transfer.remaining -= step;
    if (this.transfer.remaining <= 0.02) {
      this.logEvent('Batch transfer complete', `${ui.fmtInt(this.transfer.total)} L ${this.transfer.type === 'fill' ? 'transferred into' : 'drained from'} T-01.`, 'ok');
      this.transfer = null;
    }
  }

  _updateSensors() {
    this.setSensorValue('level', this.levelPercent());
    this.setSensorValue('volume', this.volumeL);
    this.setSensorValue('inlet-flow', this.inletFlow);
    this.setSensorValue('outlet-flow', this.outletFlow);
    this.setSensorValue('pump-current', this.pump.current);
    this.setSensorValue('pump-temp', this.pump.temperature);
    this.setSensorValue('inlet-pressure', this.inletPressureBar);
    this.setSensorValue('turbidity', this.turbidity);
  }

  /* =========================================================
     Visual updates
     ========================================================= */
  _updateVisuals(dt) {
    const frac = clamp(this.levelPercent() / 100, 0, 1);
    this._visualLevel += (frac - this._visualLevel) * Math.min(1, Math.max(dt, 0.001) * 3.2);
    if (Math.abs(frac - this._visualLevel) < 0.0005) this._visualLevel = frac;
    const h = clamp(this._visualLevel, 0, 1) * TANK.maxWaterH;
    const bottomLocal = TANK.waterBottom;

    if (this.waterMesh) {
      const hh = Math.max(0.001, h);
      this.waterMesh.scale.y = hh;
      this.waterMesh.position.y = bottomLocal + hh / 2;
    }
    if (this.waterSurface) {
      this.waterSurface.position.y = bottomLocal + h + 0.012 + Math.sin(this._time * 1.9) * 0.008;
      if (this.waterSurfaceInner) this.waterSurfaceInner.rotation.z += dt * 0.16;
    }
    // aeration bubbles
    const filling = this.inletFlow > 0.5;
    if (this._bubbles.length) {
      for (const b of this._bubbles) {
        b.visible = filling && h > 0.1;
        if (!b.visible) continue;
        b.position.y += b.userData.speed * dt;
        if (b.position.y > h) b.position.y = 0.05;
        const rad = b.userData.rad * Math.sin(this._time * .5 + b.userData.seed * 6) * .35 + b.userData.rad;
        b.position.x = Math.cos(b.userData.ang + this._time * .25) * rad;
        b.position.z = Math.sin(b.userData.ang + this._time * .25) * rad;
      }
    }
    // sight-glass float
    if (this.gaugeFloat) {
      this.gaugeFloat.position.y = clamp(h - 0.02, 0.05, TANK.maxWaterH);
      if (this.gaugeFloat.userData.cap) this.gaugeFloat.userData.cap.position.y = .065;
    }
    // pump rotating parts
    const running = this.pump.on && !this.pump.failed;
    if (this.pumpFan) this.pumpFan.rotation.x = this.pump.fanAngle;
    if (this.pumpImpeller) this.pumpImpeller.rotation.z -= (running ? (2.6 + this.pump.speed / 22) : 0) * dt;
    // motor status strip
    if (this.leds.motorGlow) {
      const mat = this.leds.motorGlow.material;
      const on = running;
      mat.emissiveIntensity = on ? (1.2 + Math.sin(this._time * 3) * .25) : (this.pump.failed ? 1.6 : .08);
      mat.color.setHex(this.pump.failed ? 0xff4a5f : on ? 0x46a9ff : 0x33424d);
      mat.emissive.setHex(this.pump.failed ? 0xff4a5f : on ? 0x46a9ff : 0x22303a);
    }
    // valve animation / indication
    for (const ref of ['inlet', 'outlet']) {
      const v = this.valves[ref];
      if (!v) continue;
      const state = ref === 'inlet' ? this.inletValve : this.outletValve;
      if (v.wheel) v.wheel.rotation.y = (state.pct / 100) * Math.PI * 2 * 3.5;
      if (v.needle) v.needle.rotation.z = -2.1 + (state.pct / 100) * 4.2;
      if (v.led) {
        const moving = Math.abs(state.target - state.pct) > .5;
        const col = moving ? 0xffb547 : state.pct > 1 ? 0x3ce58b : 0xff4a5f;
        v.led.material.color.setHex(col);
        v.led.material.emissive.setHex(col);
        v.led.material.emissiveIntensity = moving ? 2.4 : 1.7;
      }
    }
    // flow meter needles
    if (this.flowMeters.inlet?.needle) this.flowMeters.inlet.needle.rotation.z = -2.2 + clamp(this.inletFlow / MAX_FLOW_SENSOR, 0, 1) * 4.4;
    if (this.flowMeters.outlet?.needle) this.flowMeters.outlet.needle.rotation.z = -2.2 + clamp(this.outletFlow / MAX_FLOW_SENSOR, 0, 1) * 4.4;
    if (this.pressureGaugeNeedle) this.pressureGaugeNeedle.rotation.z = -2.2 + clamp(this.inletPressureBar / 10, 0, 1) * 4.4;

    // status / beacon / HMI (throttled)
    this._statusAccum += dt;
    if (this._statusAccum >= 0.12) {
      this._statusAccum = 0;
      this._updateStatusVisuals();
    }
    this._hmiAccum += dt;
    if (this._hmiAccum >= 0.45) {
      this._hmiAccum = 0;
      this.drawHmi();
    }
  }

  _updateStatusVisuals() {
    const alarms = [...this.activeAlarms.values()];
    const critical = alarms.some(a => a.severity === 'critical');
    const any = alarms.length > 0;
    if (this.towerLight?.userData?.setLamps) this.towerLight.userData.setLamps(critical, !critical && any, !any);
    const pumpRunning = this.pump.on && !this.pump.failed;
    const valvesMoving = Math.abs(this.inletValve.target - this.inletValve.pct) > .5 || Math.abs(this.outletValve.target - this.outletValve.pct) > .5;
    const cab = this.leds.cabinet;
    if (cab) {
      const set = (i, active, color) => {
        if (!cab[i]) return;
        cab[i].mat.color.setHex(color);
        cab[i].mat.emissive.setHex(color);
        cab[i].mat.emissiveIntensity = active ? 2.1 : .18;
      };
      set(0, pumpRunning, 0x3ce58b);
      set(1, valvesMoving || this.pump.restarting, 0xffb547);
      set(2, this.pump.failed || this.pump.tripped || critical, 0xff4a5f);
    }
    if (this.leds.hmi) {
      this.leds.hmi.color.setHex(critical ? 0xff4a5f : any ? 0xffb547 : 0x3ce58b);
      this.leds.hmi.emissive.setHex(critical ? 0xff4a5f : any ? 0xffb547 : 0x3ce58b);
      this.leds.hmi.emissiveIntensity = any ? 2.4 : 1.7;
    }
    // door animation
    if (this.doorPivot) {
      const target = this.doorOpen ? -1.3 : 0;
      const diff = target - this.doorPivot.rotation.y;
      if (Math.abs(diff) > .01) this.doorPivot.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), 1.6 * 0.12);
    }
  }

  drawHmi() {
    const ctx = this._hmiCtx;
    if (!ctx) return;
    const c = this._hmiCanvas;
    const w = c.width, h = c.height;
    ctx.fillStyle = '#04141b'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0b3340'; ctx.fillRect(0, 0, w, 36);
    ctx.fillStyle = '#7fe9dc'; ctx.font = '700 19px "Segoe UI", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('PUMP HOUSE HMI · T-01', 12, 19);
    const rows = [
      ['LEVEL', `${ui.fmt(this.levelPercent(), 1)} %`, `${ui.fmtInt(this.volumeL)} L`],
      ['INLET', `${ui.fmt(this.inletFlow, 1)} L/min`, `VLV ${Math.round(this.inletValve.pct)} %`],
      ['OUTLET', `${ui.fmt(this.outletFlow, 1)} L/min`, `VLV ${Math.round(this.outletValve.pct)} %`],
      ['PUMP', this.pumpLabel(), `${ui.fmt(this.pump.current, 1)} A`],
      ['TEMP', `${ui.fmt(this.pump.temperature, 1)} °C`, `${ui.fmt(this.inletPressureBar, 2)} bar`],
      ['QUALITY', `${ui.fmt(this.turbidity, 1)} NTU`, this.manualMode ? 'MANUAL' : 'AUTOMATIC'],
    ];
    rows.forEach((r, i) => {
      const y = 62 + i * 34;
      ctx.fillStyle = '#5f98a6'; ctx.font = '600 14px "Segoe UI", sans-serif'; ctx.fillText(r[0], 14, y);
      ctx.fillStyle = '#d9f6ff'; ctx.font = '700 19px "Cascadia Mono", monospace'; ctx.fillText(r[1], 132, y);
      ctx.fillStyle = '#7fb6c4'; ctx.font = '600 14px "Segoe UI", sans-serif'; ctx.fillText(r[2], 332, y);
    });
    const alarms = [...this.activeAlarms.values()];
    if (alarms.length) {
      ctx.fillStyle = '#3a0b12'; ctx.fillRect(0, h - 36, w, 36);
      ctx.fillStyle = '#ff8a99'; ctx.font = '700 15px "Segoe UI", sans-serif';
      ctx.fillText(`ALARM · ${alarms[0].title}`, 14, h - 18);
    } else {
      ctx.fillStyle = '#07251a'; ctx.fillRect(0, h - 36, w, 36);
      ctx.fillStyle = '#5fe0a0'; ctx.font = '700 15px "Segoe UI", sans-serif';
      ctx.fillText('● ALL CONDITIONS NOMINAL', 14, h - 18);
    }
    if (this._hmiTex) this._hmiTex.needsUpdate = true;
  }

  /* =========================================================
     Level / capacity commands
     ========================================================= */
  setLevelPercent(pct, silent = false) {
    const p = clamp(+pct || 0, 0, 100);
    this.volumeL = this.capacityL * p / 100;
    this._visualLevel = p / 100;
    this._updateVisuals(0.016);
    if (!silent) {
      this.logEvent('Level command', `Reservoir level set to ${ui.fmt(p, 1)} % (${ui.fmtInt(this.volumeL)} L).`, 'info');
      this.refreshLive();
    }
    return p;
  }

  nudgeLevel(deltaPct) {
    this.setLevelPercent(this.levelPercent() + deltaPct);
  }

  setCapacity(value) {
    const cap = clamp(+value || this.capacityL, MIN_CAP, MAX_CAP);
    const pct = this.levelPercent();
    this.capacityL = cap;
    this.volumeL = cap * pct / 100;
    this.updateVolumeSensorRange();
    this.config.capacity = cap;
    this.saveSoon();
    this.logEvent('Capacity changed', `Tank working capacity set to ${ui.fmtInt(cap)} L.`, 'info');
    this.refreshInspector();
    this.refreshLive();
  }

  updateVolumeSensorRange() {
    const cap = this.capacityL;
    const max = Math.max(20000, Math.ceil(cap));
    const low = cap * 0.1, high = cap * 0.98;
    const def = this.sensorDefs.find(s => s.id === 'volume');
    const live = this.sensors.get('volume');
    for (const t of [def, live]) {
      if (!t) continue;
      t.max = max; t.alarmLow = low; t.alarmHigh = high;
    }
    const cfg = this.sensorCfg('volume');
    cfg.alarmLow = low; cfg.alarmHigh = high;
  }

  /* =========================================================
     Actuator commands
     ========================================================= */
  setPump(on, quiet = false) {
    const p = this.pump;
    if (on) {
      if (p.failed) { toast('Pump motor failure latched — clear the fault first.', { type: 'danger', title: 'Pump unavailable' }); return false; }
      if (p.tripped) { toast('Pump tripped on dry-run protection — use Restart to reset.', { type: 'warn', title: 'Pump tripped' }); return false; }
      if (!p.on) {
        p.on = true;
        p.starts++;
        if (!quiet) this.logEvent('Pump started', 'Booster pump P-01 running.', 'ok');
      }
      p.auto = false;
    } else {
      if (p.on) this.logEvent('Pump stopped', 'Booster pump P-01 stopped by operator.', 'info');
      p.on = false;
      p.restarting = false;
      p.auto = false;
    }
    this.persistSettings();
    this.refreshLive();
    return true;
  }

  restartPump() {
    const p = this.pump;
    if (p.failed) { toast('Cannot restart: motor failure is latched. Clear the injected fault first.', { type: 'danger', title: 'Restart blocked' }); return; }
    p.on = false;
    p.tripped = false;
    p.dryTimer = 0;
    p.restarting = true;
    p.restartTimer = 2.2;
    p.temperature = Math.min(p.temperature, 55);
    this.logEvent('Pump restart sequence', 'Motor starting — 2.2 s spin-up with soft start.', 'info');
    toast('Pump restart sequence initiated.', { type: 'info', title: 'P-01' });
    this.refreshLive();
    this.refreshInspector();
  }

  setPumpSpeed(v) {
    this.pump.speed = clamp(+v, 10, 120);
    this.persistSettings();
    this.refreshLive();
  }

  setPumpFlowCapacity(v) {
    this.pumpFlowCap = clamp(+v, 60, 600);
    this.persistSettings();
    this.refreshLive();
  }

  setMotorLoad(v) {
    this.pump.load = clamp(+v, 0.4, 1.4);
    this.persistSettings();
    this.refreshLive();
  }

  setMotorOverload(on) {
    this.faults.motorOverload = !!on;
    if (on) { this.pump.load = Math.max(this.pump.load, 1.25); this.logEvent('Motor overload test', 'Simulated winding overload injected.', 'warn'); }
    this.persistSettings();
    this.evaluateAlarms();
    this.refreshInspector();
    this.refreshLive();
  }

  injectPumpFailure(on) {
    this.faults.pumpFailure = !!on;
    this.pump.failed = !!on;
    if (on) {
      this.pump.on = false;
      this.pump.restarting = false;
      this.logEvent('Pump failure injected', 'Motor protection trip simulated — pump locked out.', 'danger');
    } else {
      this.pump.tripped = false;
      this.logEvent('Pump failure cleared', 'Motor protection reset. Pump available for restart.', 'ok');
    }
    this.evaluateAlarms();
    this.refreshInspector();
    this.refreshLive();
  }

  setValvePct(ref, pct, autoOff = true) {
    const v = ref === 'inlet' ? this.inletValve : this.outletValve;
    v.target = clamp(+pct, 0, 100);
    if (autoOff) v.auto = false;
    this.persistSettings();
    this.refreshLive();
    this.refreshInspector();
  }

  setValveAuto(ref, auto) {
    const v = ref === 'inlet' ? this.inletValve : this.outletValve;
    v.auto = !!auto;
    if (!auto) v.target = v.pct;
    this.persistSettings();
    this.refreshInspector();
    this.refreshLive();
  }

  setValveSpeed(ref, speed) {
    const v = ref === 'inlet' ? this.inletValve : this.outletValve;
    v.speed = clamp(+speed, 5, 100);
    this.persistSettings();
    this.refreshLive();
  }

  /* =========================================================
     Batch transfers / scenarios
     ========================================================= */
  queueTransfer(type, liters, rateLpm = 300) {
    const amount = clamp(+liters || 0, 1, MAX_CAP);
    this.transfer = { type, remaining: amount, total: amount, rate: clamp(+rateLpm || 300, 20, 600) };
    this.logEvent('Batch transfer queued', `${ui.fmtInt(amount)} L ${type === 'fill' ? 'fill' : 'drain'} at ${this.transfer.rate} L/min.`, 'info');
    this.refreshLive();
  }

  cancelTransfer() {
    if (!this.transfer) { toast('No batch transfer in progress.', { type: 'info' }); return; }
    this.transfer = null;
    this.logEvent('Batch transfer cancelled', 'Operator cancelled the batch flow.', 'warn');
    this.refreshLive();
  }

  runFillCycle() {
    this.autoFill = true;
    this.autoDrain = false;
    this.targetLevel = Math.max(90, this.targetLevel);
    this.pump.auto = true;
    this.inletValve.auto = true;
    this.outletValve.auto = true;
    this.outletValve.target = 0;
    this.demand.active = false;
    this.setManual(false);
    this.persistSettings();
    this.logEvent('Scenario · Fill cycle', `Automatic fill engaged toward ${ui.fmt(this.targetLevel, 0)} %.`, 'ok');
    toast('Fill cycle scenario running.', { type: 'ok', title: 'Flow Scenario' });
    this.refreshLive();
  }

  runDrainCycle() {
    this.autoFill = false;
    this.autoDrain = true;
    this.drainTarget = 15;
    this.pump.auto = true;
    this.pump.on = false;
    this.inletValve.auto = true;
    this.outletValve.auto = true;
    this.demand.active = false;
    this.setManual(false);
    this.persistSettings();
    this.logEvent('Scenario · Drain cycle', 'Gravity drain engaged toward the 15 % reserve.', 'ok');
    toast('Drain cycle scenario running.', { type: 'ok', title: 'Flow Scenario' });
    this.refreshLive();
  }

  runDemandProfile() {
    this.demand.active = true;
    this.demand.mode = 'industrial';
    this.demand.factor = 1.2;
    this.autoFill = true;
    this.autoDrain = false;
    this.targetLevel = Math.max(85, this.targetLevel);
    this.pump.auto = true;
    this.inletValve.auto = true;
    this.outletValve.auto = true;
    const d = this.config.demand || (this.config.demand = {});
    d.active = true; d.mode = this.demand.mode; d.factor = this.demand.factor;
    this.setManual(false);
    this.persistSettings();
    this.logEvent('Scenario · Demand profile', 'Industrial demand curve applied to the distribution header.', 'ok');
    toast('Demand profile scenario running.', { type: 'ok', title: 'Flow Scenario' });
    this.refreshLive();
  }

  runNightMode() {
    this.demand.active = true;
    this.demand.mode = 'night';
    this.demand.factor = 0.45;
    this.autoFill = false;
    this.autoDrain = true;
    this.drainTarget = 55;
    this.pump.auto = true;
    this.outletValve.auto = true;
    this.persistSettings();
    this.logEvent('Scenario · Night setback', 'Reduced night demand and reserve draw-down.', 'info');
    this.refreshLive();
  }

  stopScenarios() {
    this.autoFill = false;
    this.autoDrain = false;
    this.demand.active = false;
    this.transfer = null;
    this.pump.auto = false;
    this.pump.on = false;
    this.pump.tripped = false;
    this.pump.restarting = false;
    this.pump.failed = false;
    this.faults.pumpFailure = false;
    this.faults.flowMeter = false;
    this.inletValve.auto = true;
    this.outletValve.auto = true;
    this.persistSettings();
    this.evaluateAlarms();
    this.logEvent('Scenarios stopped', 'All automatic scenarios suspended; plant in manual standby.', 'warn');
    this.refreshLive();
    this.refreshInspector();
  }

  emergencyStop() {
    this.pump.on = false;
    this.pump.auto = false;
    this.transfer = null;
    this.inletValve.auto = false;
    this.inletValve.target = 0;
    this.outletValve.auto = false;
    this.outletValve.target = 0;
    this.persistSettings();
    this.logEvent('EMERGENCY STOP', 'Pump stopped and all motorised valves commanded closed.', 'danger');
    toast('Emergency stop executed — pump off, valves closing.', { type: 'danger', title: 'E-STOP' });
    this.refreshLive();
  }

  resetCounters() {
    this.totalInflowL = 0;
    this.totalOutflowL = 0;
    this._inletTotaliser = 0;
    this._outletTotaliser = 0;
    this.pump.starts = 0;
    this.pump.runtime = 0;
    toast('Flow totalisers and counters reset.', { type: 'ok' });
    this.refreshLive();
  }

  /* =========================================================
     Object inspectors
     ========================================================= */
  getObjectInspector(obj) {
    switch (obj.kind) {
      case 'tank': return this.tankInspector(obj);
      case 'pump': return this.pumpInspector(obj, false);
      case 'motor': return this.pumpInspector(obj, true);
      case 'valve': return this.valveInspector(obj);
      case 'flowmeter': return this.flowMeterInspector(obj);
      case 'gauge': return this.gaugeInspector(obj);
      case 'panel': return this.panelInspector(obj);
      case 'cabinet': return this.cabinetInspector(obj);
      case 'ladder': return this.ladderInspector(obj);
      case 'pipe': return this.pipeInspector(obj);
      case 'room': return this.roomInspector(obj);
      case 'door': return this.doorInspector(obj);
      case 'lamp': return this.lampInspector(obj);
      case 'beacon': return this.beaconInspector(obj);
      case 'sign': return this.signInspector(obj);
      case 'structure': return this.structureInspector(obj);
      default: return this.defaultInspector(obj);
    }
  }

  tankInspector() {
    return {
      title: 'Reservoir Tank T-01',
      subtitle: 'ELEVATED POTABLE WATER STORAGE',
      iconName: 'tank',
      badge: () => ({ text: this.levelBand().label, tone: this.levelTone() }),
      fields: [
        { label: 'Level', get: () => `${ui.fmt(this.levelPercent(), 1)} %` },
        { label: 'Stored volume', get: () => `${ui.fmtInt(this.volumeL)} L` },
        { label: 'Working capacity', get: () => `${ui.fmtInt(this.capacityL)} L` },
        { label: 'Level height', get: () => `${ui.fmt((this.levelPercent() / 100) * 3.3, 2)} m` },
        { label: 'Water temperature', value: '18.4 °C' },
        { label: 'Net flow', get: () => `${this.inletFlow >= this.outletFlow ? '+' : ''}${ui.fmt(this.inletFlow - this.outletFlow, 1)} L/min` },
        { label: 'Turbidity', get: () => this.sensorText('turbidity') },
        { label: 'Auto fill', get: () => this.autoFill ? 'ENABLED' : 'DISABLED' },
      ],
      sections: [{
        title: 'Storage & Level Controls', iconName: 'tank', controls: [
          { type: 'pair', controls: [
            { type: 'button', label: 'Increase +5 %', variant: 'subtle', iconName: 'plus', onClick: () => { this.nudgeLevel(5); this.refreshInspector(); } },
            { type: 'button', label: 'Decrease −5 %', variant: 'subtle', iconName: 'minus', onClick: () => { this.nudgeLevel(-5); this.refreshInspector(); } },
          ] },
          { type: 'slider', label: 'Set level', min: 0, max: 100, step: .5, value: Math.round(this.levelPercent()), unit: '%', onInput: v => this.setLevelPercent(v, true), onChange: v => { this.setLevelPercent(v); this.refreshInspector(); } },
          { type: 'slider', label: 'Auto-fill target', min: 5, max: 100, step: 1, value: this.targetLevel, unit: '%', onInput: v => { this.targetLevel = v; this.persistSettings(); }, onChange: () => { this.persistSettings(); this.refreshLive(); } },
          { type: 'number', label: 'Working capacity', unit: 'L', min: MIN_CAP, max: MAX_CAP, step: 500, value: this.capacityL, onChange: v => { this.setCapacity(v); this.refreshInspector(); } },
          { type: 'toggle', label: 'Automatic filling', description: 'Pump fills the tank to the target level.', value: this.autoFill, onChange: v => { this.autoFill = v; this.autoDrain = false; this.persistSettings(); this.refreshInspector(); this.refreshLive(); } },
          { type: 'toggle', label: 'Automatic draining', description: 'Outlet valve opens and drains to the reserve target.', value: this.autoDrain, onChange: v => { this.autoDrain = v; this.autoFill = false; this.persistSettings(); this.refreshInspector(); this.refreshLive(); } },
          { type: 'divider' },
          { type: 'row', controls: [
            { type: 'button', label: 'Fill to Target', iconName: 'droplet', onClick: () => { this.runFillCycle(); this.refreshInspector(); } },
            { type: 'button', label: 'Fill to 100 %', iconName: 'droplet', onClick: () => { this.autoFill = true; this.targetLevel = 100; this.pump.auto = true; this.persistSettings(); this.refreshInspector(); } },
            { type: 'button', label: 'Drain to Reserve', variant: 'warn', iconName: 'download', onClick: () => { this.runDrainCycle(); this.refreshInspector(); } },
          ] },
        ],
      }],
      note: 'Water level is computed from the storage volume; all level commands update the 3D water body and every dashboard immediately.',
    };
  }

  pumpInspector(obj, isMotor) {
    const p = this.pump;
    const controls = isMotor ? [] : [
      { type: 'row', controls: [
        { type: 'button', label: 'Start Pump', variant: 'subtle', iconName: 'play', onClick: () => { this.setPump(true); this.refreshInspector(); } },
        { type: 'button', label: 'Stop Pump', iconName: 'pause', onClick: () => { this.setPump(false); this.refreshInspector(); } },
      ] },
      { type: 'button', label: 'Restart Sequence', variant: 'warn', iconName: 'restart', onClick: () => { this.restartPump(); } },
      { type: 'toggle', label: 'Automatic pump control', description: 'Pump follows the auto-fill target.', value: p.auto, onChange: v => { p.auto = v; this.persistSettings(); this.refreshInspector(); } },
      { type: 'slider', label: 'Pump speed setpoint', min: 10, max: 120, step: 1, value: p.speed, unit: '%', onInput: v => { p.speed = v; }, onChange: v => { this.setPumpSpeed(v); } },
      { type: 'slider', label: 'Rated flow capacity', min: 60, max: 600, step: 10, value: this.pumpFlowCap, unit: 'L/min', onInput: v => { this.pumpFlowCap = v; }, onChange: v => { this.setPumpFlowCapacity(v); } },
      { type: 'slider', label: 'Motor load factor', min: .4, max: 1.4, step: .05, value: p.load, unit: '×', onInput: v => { p.load = v; }, onChange: v => { this.setMotorLoad(v); } },
      { type: 'divider' },
      { type: 'toggle', label: 'Simulate motor failure', description: 'Latch a motor protection fault (diagnostic).', value: this.faults.pumpFailure, onChange: v => { this.injectPumpFailure(v); this.refreshInspector(); } },
      { type: 'toggle', label: 'Simulate motor overload', description: 'Raises winding current and heat for alarm testing.', value: this.faults.motorOverload, onChange: v => { this.setMotorOverload(v); this.refreshInspector(); } },
    ];
    if (isMotor) {
      controls.push(
        { type: 'slider', label: 'Motor load factor', min: .4, max: 1.4, step: .05, value: p.load, unit: '×', onInput: v => { p.load = v; }, onChange: v => { this.setMotorLoad(v); } },
        { type: 'toggle', label: 'Simulate motor overload', description: 'Raises winding current and heat for alarm testing.', value: this.faults.motorOverload, onChange: v => { this.setMotorOverload(v); this.refreshInspector(); } },
        { type: 'toggle', label: 'Simulate motor failure', value: this.faults.pumpFailure, onChange: v => { this.injectPumpFailure(v); this.refreshInspector(); } },
      );
    }
    return {
      title: isMotor ? 'Pump Motor M-01' : 'Booster Pump P-01',
      subtitle: isMotor ? '15 kW TEFC INDUCTION MOTOR' : 'VARIABLE-SPEED BOOSTER PUMP',
      iconName: isMotor ? 'motor' : 'pump',
      badge: { text: this.pumpLabel(), tone: this.pumpTone() },
      fields: [
        { label: isMotor ? 'Motor' : 'Pump', value: isMotor ? 'M-01 · 15 kW · 400 V' : 'P-01 · end-suction centrifugal' },
        { label: 'Status', get: () => this.pumpLabel() },
        { label: 'Speed', get: () => `${ui.fmt(p.speed, 0)} %` },
        { label: 'Motor current', get: () => `${ui.fmt(p.current, 2)} A` },
        { label: 'Winding temperature', get: () => `${ui.fmt(p.temperature, 1)} °C` },
        { label: 'Discharge pressure', get: () => `${ui.fmt(this.inletPressureBar, 2)} bar` },
        { label: 'Running hours', get: () => ui.fmtDuration(p.runtime) },
        { label: 'Start count', get: () => String(p.starts) },
        { label: 'Dry-run protection', get: () => p.dry ? 'ACTIVE — NO SUCTION' : p.tripped ? 'TRIPPED' : 'HEALTHY' },
      ],
      sections: controls.length ? [{ title: isMotor ? 'Motor Controls' : 'Pump Controls', iconName: isMotor ? 'motor' : 'pump', controls }] : [],
      note: isMotor ? 'Motor current and winding temperature are produced by the pump load model; failure and overload injection are available for commissioning tests.' : 'The pump impeller and motor fan animate while running. Suction protection trips the pump if the reservoir is drained below the low-low level.',
    };
  }

  valveInspector(obj) {
    const ref = obj.id === 'inlet-valve' ? 'inlet' : 'outlet';
    const v = ref === 'inlet' ? this.inletValve : this.outletValve;
    const flow = ref === 'inlet' ? this.inletFlow : this.outletFlow;
    return {
      title: ref === 'inlet' ? 'Inlet Isolation Valve V-01' : 'Outlet Control Valve V-02',
      subtitle: 'MOTORISED BUTTERFLY VALVE · HAND WHEEL OVERRIDE',
      iconName: 'valve',
      badge: { text: this.valveLabel(ref), tone: this.valveTone(ref) },
      fields: [
        { label: 'Valve', value: ref === 'inlet' ? 'V-01 · DN300 inlet isolation' : 'V-02 · DN300 outlet control' },
        { label: 'Position', get: () => `${ui.fmt(v.pct, 0)} %` },
        { label: 'Setpoint', get: () => `${ui.fmt(v.target, 0)} %` },
        { label: 'Control mode', get: () => v.auto ? 'AUTOMATIC' : 'MANUAL' },
        { label: 'Flow through valve', get: () => `${ui.fmt(flow, 1)} L/min` },
        { label: 'Actuator', value: 'Electric · 24 V · 25 s travel' },
      ],
      sections: [{
        title: 'Valve Controls', iconName: 'valve', controls: [
          { type: 'row', controls: [
            { type: 'button', label: 'Open Valve', variant: 'subtle', iconName: 'unlock', onClick: () => { this.setValvePct(ref, 100); this.refreshInspector(); } },
            { type: 'button', label: 'Close Valve', iconName: 'lock', onClick: () => { this.setValvePct(ref, 0); this.refreshInspector(); } },
          ] },
          { type: 'slider', label: 'Valve position setpoint', min: 0, max: 100, step: 1, value: Math.round(v.target), unit: '%', onInput: v2 => { v.target = clamp(v2, 0, 100); }, onChange: v2 => { this.setValvePct(ref, v2); } },
          { type: 'toggle', label: 'Automatic valve control', description: ref === 'inlet' ? 'Follows the pump run command.' : 'Follows drain and demand commands.', value: v.auto, onChange: v2 => { this.setValveAuto(ref, v2); } },
          { type: 'slider', label: 'Actuator travel speed', min: 5, max: 100, step: 1, value: v.speed, unit: '%/s', onInput: v2 => { v.speed = v2; }, onChange: v2 => { this.setValveSpeed(ref, v2); } },
        ],
      }],
      note: 'The hand wheel and position indicator animate with the valve stem. In automatic mode the valve follows the pump/drain interlock logic.',
    };
  }

  flowMeterInspector(obj) {
    const ref = obj.id === 'inlet-flow-meter' ? 'inlet' : 'outlet';
    const flow = ref === 'inlet' ? this.inletFlow : this.outletFlow;
    const total = ref === 'inlet' ? (this._inletTotaliser || 0) : (this._outletTotaliser || 0);
    return {
      title: ref === 'inlet' ? 'Inlet Flow Meter FT-03' : 'Outlet Flow Meter FT-04',
      subtitle: 'ELECTROMAGNETIC FLOW METER · PULSE OUTPUT',
      iconName: 'gauge',
      badge: { text: flow > 1 ? 'FLOWING' : 'NO FLOW', tone: flow > 1 ? 'ok' : 'muted' },
      fields: [
        { label: 'Meter', value: ref === 'inlet' ? 'FT-03 · DN300 inlet' : 'FT-04 · DN300 outlet' },
        { label: 'Instantaneous flow', get: () => `${ui.fmt(flow, 1)} L/min` },
        { label: 'Flow (m³/h)', get: () => ui.fmt(flow * 0.06, 2) },
        { label: 'Totaliser', get: () => `${ui.fmtInt(total)} L` },
        { label: 'Signal', value: '4–20 mA + pulse' },
        { label: 'Calibration', value: 'Factory · ±0.5 %' },
      ],
      sections: [{
        title: 'Instrument Controls', iconName: 'gauge', controls: [
          { type: 'button', label: 'Reset Totaliser', variant: 'ghost', iconName: 'reset', onClick: () => { if (ref === 'inlet') this._inletTotaliser = 0; else this._outletTotaliser = 0; this.refreshInspector(); } },
          { type: 'toggle', label: 'Inject flow signal fault', description: 'Drive the meter to full scale for alarm testing.', value: this.faults.flowMeter, onChange: v => { this.faults.flowMeter = v; this.evaluateAlarms(); this.refreshInspector(); this.refreshLive(); } },
        ],
      }],
      note: 'The local dial needle tracks the instantaneous flow. The totaliser accumulates measured volume.',
    };
  }

  gaugeInspector(obj) {
    if (obj.id === 'pressure-gauge') {
      return {
        title: 'Discharge Pressure Gauge PI-07',
        subtitle: 'ANALOGUE PRESSURE INDICATOR',
        iconName: 'gauge',
        badge: { text: `${ui.fmt(this.inletPressureBar, 2)} bar`, tone: this.inletPressureBar > this.threshold('highLevel', 88) ? 'warn' : 'ok' },
        fields: [
          { label: 'Pressure', get: () => `${ui.fmt(this.inletPressureBar, 2)} bar` },
          { label: 'Range', value: '0–10 bar' },
          { label: 'Pump running', get: () => this.pump.on ? 'YES' : 'NO' },
          { label: 'Inlet valve', get: () => `${ui.fmt(this.inletValve.pct, 0)} %` },
        ],
        sections: [{
          title: 'Process Controls', iconName: 'pump', controls: [
            { type: 'button', label: 'Open Inlet Valve', iconName: 'unlock', onClick: () => { this.setValvePct('inlet', 100); this.refreshInspector(); } },
            { type: 'button', label: 'Stop Pump', iconName: 'pause', onClick: () => { this.setPump(false); this.refreshInspector(); } },
          ],
        }],
        note: 'Discharge pressure is derived from pump speed, valve position and static head.',
      };
    }
    return {
      title: 'Sight Glass Level Gauge',
      subtitle: 'LOCAL LEVEL INDICATOR · 0–100 %',
      iconName: 'gauge',
      badge: { text: `${ui.fmt(this.levelPercent(), 1)} %`, tone: this.levelTone() },
      fields: [
        { label: 'Indicated level', get: () => `${ui.fmt(this.levelPercent(), 1)} %` },
        { label: 'Float height', get: () => `${ui.fmt(this.levelPercent() * TANK.maxWaterH / 100, 2)} m` },
        { label: 'Capacity', get: () => `${ui.fmtInt(this.capacityL)} L` },
        { label: 'Volume', get: () => `${ui.fmtInt(this.volumeL)} L` },
      ],
      sections: [{
        title: 'Level Controls', iconName: 'tank', controls: [
          { type: 'row', controls: [
            { type: 'button', label: 'Raise +10 %', iconName: 'plus', onClick: () => { this.nudgeLevel(10); this.refreshInspector(); } },
            { type: 'button', label: 'Lower −10 %', iconName: 'minus', onClick: () => { this.nudgeLevel(-10); this.refreshInspector(); } },
          ] },
          { type: 'slider', label: 'Set indicated level', min: 0, max: 100, step: .5, value: Math.round(this.levelPercent()), unit: '%', onInput: v => this.setLevelPercent(v, true), onChange: v => { this.setLevelPercent(v); this.refreshInspector(); } },
        ],
      }],
      note: 'The float follows the real water surface; the graduated scale mirrors the tank volume model.',
    };
  }

  panelInspector() {
    return {
      title: 'Pump House HMI Panel',
      subtitle: 'LOCAL OPERATOR INTERFACE',
      iconName: 'panel',
      badge: { text: this.manualMode ? 'MANUAL' : 'AUTOMATIC', tone: this.manualMode ? 'warn' : 'ok' },
      fields: [
        { label: 'Level', get: () => this.sensorText('level') },
        { label: 'Inlet flow', get: () => this.sensorText('inlet-flow') },
        { label: 'Outlet flow', get: () => this.sensorText('outlet-flow') },
        { label: 'Pump', get: () => this.pumpLabel() },
        { label: 'Active alarms', get: () => String(this.activeAlarms.size) },
        { label: 'Screen refresh', value: 'Live · 0.45 s' },
      ],
      sections: [{
        title: 'HMI Controls', iconName: 'panel', controls: [
          { type: 'row', controls: [
            { type: 'button', label: 'Start Pump', variant: 'subtle', iconName: 'play', onClick: () => { this.setPump(true); this.refreshInspector(); } },
            { type: 'button', label: 'Stop Pump', iconName: 'pause', onClick: () => { this.setPump(false); this.refreshInspector(); } },
          ] },
          { type: 'row', controls: [
            { type: 'button', label: 'Open Inlet', iconName: 'unlock', onClick: () => { this.setValvePct('inlet', 100); this.refreshInspector(); } },
            { type: 'button', label: 'Close Inlet', iconName: 'lock', onClick: () => { this.setValvePct('inlet', 0); this.refreshInspector(); } },
            { type: 'button', label: 'Open Outlet', iconName: 'unlock', onClick: () => { this.setValvePct('outlet', 100); this.refreshInspector(); } },
          ] },
          { type: 'toggle', label: 'Automatic filling', value: this.autoFill, onChange: v => { this.autoFill = v; this.autoDrain = false; this.persistSettings(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Automatic draining', value: this.autoDrain, onChange: v => { this.autoDrain = v; this.autoFill = false; this.persistSettings(); this.refreshInspector(); } },
          { type: 'button', label: 'Open Flow Scenarios', iconName: 'droplet', onClick: () => this.setTab('spawn') },
        ],
      }],
      note: 'The HMI screen is a live canvas texture rendered from the simulation every 0.45 simulated seconds.',
    };
  }

  cabinetInspector() {
    return {
      title: 'Water SCADA Control Cabinet',
      subtitle: 'PLC-01 · PLANT MASTER CONTROLLER',
      iconName: 'equipment',
      badge: { text: 'ONLINE', tone: 'ok' },
      fields: [
        { label: 'Controller', value: 'PLC-01 · redundant CPU' },
        { label: 'Control mode', get: () => this.manualMode ? 'MANUAL' : 'AUTOMATIC' },
        { label: 'Pump command', get: () => this.pump.on ? 'RUN' : 'STOP' },
        { label: 'Inlet valve', get: () => `${ui.fmt(this.inletValve.pct, 0)} %` },
        { label: 'Outlet valve', get: () => `${ui.fmt(this.outletValve.pct, 0)} %` },
        { label: 'Auto-fill target', get: () => `${ui.fmt(this.targetLevel, 0)} %` },
        { label: 'Active alarms', get: () => String(this.activeAlarms.size) },
        { label: 'Uptime', get: () => ui.fmtDuration(this.realTime) },
      ],
      sections: [{
        title: 'Master Controller', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Automatic plant control', description: 'Master enabling signal for pump and valve automation.', value: !this.manualMode, onChange: v => { this.setManual(!v); this.refreshInspector(); } },
          { type: 'toggle', label: 'Automatic filling', value: this.autoFill, onChange: v => { this.autoFill = v; this.autoDrain = false; this.persistSettings(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Automatic draining', value: this.autoDrain, onChange: v => { this.autoDrain = v; this.autoFill = false; this.persistSettings(); this.refreshInspector(); } },
          { type: 'button', label: 'Emergency Stop', variant: 'danger', iconName: 'stop', onClick: () => { this.emergencyStop(); this.refreshInspector(); } },
          { type: 'button', label: 'Open Operations Center', iconName: 'sliders', onClick: () => this.setTab('operations') },
        ],
      }],
      note: 'All equipment commands flow through this cabinet; status lamps mirror pump, valve and alarm states.',
    };
  }

  ladderInspector(obj) {
    return {
      title: obj.label,
      subtitle: 'STRUCTURAL ACCESS',
      iconName: 'equipment',
      badge: { text: 'SAFE ACCESS', tone: 'ok' },
      fields: [
        { label: 'Access', value: 'Caged vertical ladder' },
        { label: 'Height', value: '2.9 m' },
        { label: 'Platform', value: '4.3 × 4.3 m walkway' },
        { label: 'Inspection due', value: '2027-04-18' },
        { label: 'Level gauge', get: () => this.sensorText('level') },
      ],
      sections: [{
        title: 'Inspection', iconName: 'clipboard', controls: [
          { type: 'button', label: 'Inspect Tank Shell', iconName: 'tank', onClick: () => this.selectObject('tank') },
          { type: 'button', label: 'Inspect Level Gauge', iconName: 'gauge', onClick: () => this.selectObject('level-gauge') },
        ],
      }],
      note: 'The walkway and ladder provide access for roof-hatch and instrument maintenance.',
    };
  }

  pipeInspector(obj) {
    const id = obj.id;
    const names = {
      'supply-main': 'Municipal Supply Main',
      'inlet-pipeline': 'Inlet Pipeline & Riser',
      'outlet-pipeline': 'Outlet & Distribution Header',
    };
    const isInlet = id === 'supply-main' || id === 'inlet-pipeline';
    return {
      title: names[id] || obj.label,
      subtitle: 'PRESSURISED PIPELINE DN300',
      iconName: 'link',
      badge: { text: this.pump.on || this.outletValve.pct > 1 ? 'IN SERVICE' : 'STANDBY', tone: this.pump.on ? 'ok' : 'muted' },
      fields: [
        { label: 'Pipeline', value: names[id] || id },
        { label: 'Diameter', value: 'DN300 · 155 mm bore' },
        { label: 'Inlet flow', get: () => this.sensorText('inlet-flow') },
        { label: 'Outlet flow', get: () => this.sensorText('outlet-flow') },
        { label: 'Discharge pressure', get: () => `${ui.fmt(this.inletPressureBar, 2)} bar` },
        { label: 'Pipe material', value: 'Ductile iron · epoxy lined' },
      ],
      sections: [{
        title: 'Pipeline Controls', iconName: 'valve', controls: [
          isInlet
            ? { type: 'button', label: this.inletValve.pct > 1 ? 'Close Inlet Valve' : 'Open Inlet Valve', variant: this.inletValve.pct > 1 ? 'ghost' : 'subtle', iconName: 'valve', onClick: () => { this.setValvePct('inlet', this.inletValve.pct > 1 ? 0 : 100); this.refreshInspector(); } }
            : { type: 'button', label: this.outletValve.pct > 1 ? 'Close Outlet Valve' : 'Open Outlet Valve', variant: this.outletValve.pct > 1 ? 'ghost' : 'subtle', iconName: 'valve', onClick: () => { this.setValvePct('outlet', this.outletValve.pct > 1 ? 0 : 100); this.refreshInspector(); } },
          { type: 'button', label: 'Inspect Inlet Valve', iconName: 'valve', onClick: () => this.selectObject('inlet-valve') },
          { type: 'button', label: 'Inspect Outlet Valve', iconName: 'valve', onClick: () => this.selectObject('outlet-valve') },
        ],
      }],
      note: 'Pipelines carry the simulated flows between the municipal main, booster pump, reservoir and distribution header.',
    };
  }

  roomInspector() {
    return {
      title: 'Pump House Control Room',
      subtitle: 'WEATHERPROOF CONTROL ROOM',
      iconName: 'inventory',
      badge: { text: this.manualMode ? 'MANUAL' : 'AUTOMATIC', tone: this.manualMode ? 'warn' : 'ok' },
      fields: [
        { label: 'Room', value: 'Pump house No. 2' },
        { label: 'Temperature', value: '21.5 °C · HVAC' },
        { label: 'Door', get: () => this.doorOpen ? 'OPEN' : 'CLOSED' },
        { label: 'Operator', value: 'Shift A · on site' },
        { label: 'Lighting', get: () => this.lightingOn ? 'ENERGISED' : 'OFFLINE' },
        { label: 'Active alarms', get: () => String(this.activeAlarms.size) },
      ],
      sections: [{
        title: 'Room Controls', iconName: 'door', controls: [
          { type: 'toggle', label: 'Hold door open', value: this.doorOpen, onChange: v => { this.doorOpen = v; this.logEvent(v ? 'Pump house door opened' : 'Pump house door closed', 'Access door state changed.', 'info'); this.refreshInspector(); } },
          { type: 'toggle', label: 'Site lighting circuit', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'button', label: 'Inspect HMI Panel', iconName: 'panel', onClick: () => this.selectObject('pump-house-panel') },
          { type: 'button', label: 'Inspect Control Cabinet', iconName: 'equipment', onClick: () => this.selectObject('control-cabinet') },
        ],
      }],
      note: 'Hiding the walls and roof in the Visibility tab exposes the interior instruments while the simulation continues unchanged.',
    };
  }

  doorInspector() {
    return {
      title: 'Pump House Door',
      subtitle: 'PERSONNEL ACCESS DOOR',
      iconName: 'door',
      badge: { text: this.doorOpen ? 'OPEN' : 'CLOSED', tone: this.doorOpen ? 'warn' : 'ok' },
      fields: [
        { label: 'Door', value: 'D-01 · steel security door' },
        { label: 'State', get: () => this.doorOpen ? 'OPEN' : 'CLOSED' },
        { label: 'Access control', value: 'Key card · level 2' },
        { label: 'Interlock', value: 'None' },
      ],
      sections: [{
        title: 'Door Controls', iconName: 'door', controls: [
          { type: 'toggle', label: 'Open door', value: this.doorOpen, onChange: v => { this.doorOpen = v; this.logEvent(v ? 'Pump house door opened' : 'Pump house door closed', 'Access door state changed.', 'info'); this.refreshInspector(); } },
        ],
      }],
      note: 'The door animates on its hinge and is independent of the process simulation.',
    };
  }

  lampInspector() {
    return {
      title: 'Yard Floodlight',
      subtitle: 'SITE LIGHTING CIRCUIT',
      iconName: 'light',
      badge: { text: this.lightingOn ? 'ENERGISED' : 'OFFLINE', tone: this.lightingOn ? 'ok' : 'warn' },
      fields: [
        { label: 'Circuit', value: 'LED-02 · 230 V' },
        { label: 'Output', get: () => this.lightingOn ? '100 %' : '0 %' },
        { label: 'Control', value: 'Photocell + manual override' },
        { label: 'Lamp power', value: '120 W' },
      ],
      sections: [{
        title: 'Lighting Controls', iconName: 'light', controls: [
          { type: 'toggle', label: 'Site lighting energised', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
    };
  }

  beaconInspector() {
    const alarms = [...this.activeAlarms.values()];
    const critical = alarms.some(a => a.severity === 'critical');
    return {
      title: 'Plant Status Beacon',
      subtitle: 'THREE-ASPECT SIGNAL LAMP',
      iconName: 'light',
      badge: { text: critical ? 'CRITICAL' : alarms.length ? 'WARNING' : 'NOMINAL', tone: critical ? 'danger' : alarms.length ? 'warn' : 'ok' },
      fields: [
        { label: 'Beacon', value: 'BL-01 · LED stack' },
        { label: 'Green', get: () => alarms.length ? 'OFF' : 'ON' },
        { label: 'Amber', get: () => !critical && alarms.length ? 'ON' : 'OFF' },
        { label: 'Red', get: () => critical ? 'ON' : 'OFF' },
        { label: 'Alarm count', get: () => String(alarms.length) },
      ],
      sections: [{
        title: 'Diagnostics', iconName: 'warning', controls: [
          { type: 'button', label: 'Test Beacon (5 s)', variant: 'subtle', iconName: 'light', onClick: () => { this.towerLight?.userData?.setLamps(true, true, true); setTimeout(() => this._updateStatusVisuals(), 5000); toast('Beacon lamp test executed.', { type: 'info' }); } },
          { type: 'button', label: 'Open Alarms', iconName: 'alert', onClick: () => this.setTab('alarms') },
        ],
      }],
      note: 'The beacon follows the active alarm state: green nominal, amber warning, red critical.',
    };
  }

  signInspector(obj) {
    return {
      title: obj.label,
      subtitle: 'SITE SIGNAGE',
      iconName: 'info',
      badge: { text: 'DISPLAYED', tone: 'ok' },
      fields: [
        { label: 'Sign', value: obj.label },
        { label: 'Facility', value: 'NEXUS Water Authority · T-01' },
        { label: 'Classification', value: 'Potable water · restricted access' },
        { label: 'Condition', value: 'Good · no defects' },
      ],
      sections: [],
      note: obj.description || 'Static site identification signage.',
    };
  }

  structureInspector(obj) {
    return {
      title: obj.label,
      subtitle: 'STRUCTURAL COMPONENT',
      iconName: 'layers',
      badge: { text: 'SERVICEABLE', tone: 'ok' },
      fields: [
        { label: 'Asset', value: obj.label },
        { label: 'Type', value: 'Steel support structure' },
        { label: 'Protection', value: 'Hot-dip galvanised' },
        { label: 'Tank level', get: () => this.sensorText('level') },
        { label: 'Load indication', get: () => `${ui.fmt(this.volumeL / 1000, 1)} t water` },
      ],
      sections: [{
        title: 'Navigation', iconName: 'eye', controls: [
          { type: 'button', label: 'Inspect Reservoir', iconName: 'tank', onClick: () => this.selectObject('tank') },
          { type: 'button', label: 'Fit View', iconName: 'fit', onClick: () => this.scene.fitAll(1.15) },
        ],
      }],
      note: obj.description || 'Structural load-bearing element of the elevated tank and pump shelter.',
    };
  }

  /* =========================================================
     Overview / dashboard
     ========================================================= */
  getOverviewMetrics() {
    return [
      {
        label: 'Water Level', iconName: 'tank',
        bind: () => ({ value: ui.fmt(this.levelPercent(), 1), unit: '%', tone: this.levelTone(), sub: `${ui.fmtInt(this.volumeL)} / ${ui.fmtInt(this.capacityL)} L` }),
      },
      {
        label: 'Inlet Flow', iconName: 'activity',
        bind: () => ({ value: ui.fmt(this.inletFlow, 1), unit: 'L/min', tone: this.inletFlow > 1 ? 'ok' : 'muted', sub: `Inlet valve ${ui.fmt(this.inletValve.pct, 0)} %` }),
      },
      {
        label: 'Outlet Flow', iconName: 'activity',
        bind: () => ({ value: ui.fmt(this.outletFlow, 1), unit: 'L/min', tone: this.outletFlow > 1 ? 'info' : 'muted', sub: `Outlet valve ${ui.fmt(this.outletValve.pct, 0)} %` }),
      },
      {
        label: 'Pump P-01', iconName: 'pump',
        bind: () => ({ value: this.pumpLabel(), tone: this.pumpTone(), sub: `${ui.fmt(this.pump.current, 1)} A · ${ui.fmt(this.pump.temperature, 0)} °C` }),
      },
      {
        label: 'Discharge Pressure', iconName: 'gauge',
        bind: () => ({ value: ui.fmt(this.inletPressureBar, 2), unit: 'bar', tone: this.inletPressureBar > 8 ? 'danger' : 'ok', sub: 'Pump discharge header' }),
      },
      {
        label: 'Turbidity', iconName: 'droplet',
        bind: () => ({ value: ui.fmt(this.turbidity, 1), unit: 'NTU', tone: this.turbidity > 15 ? 'danger' : this.turbidity > 10 ? 'warn' : 'ok', sub: 'Potable water quality' }),
      },
    ];
  }

  overviewExtra(body) {
    const sec = el('div', { class: 'section' });
    const title = el('div', { class: 'section-title' });
    title.innerHTML = `${ui.icon('tank', 12).outerHTML} Hydraulic Dashboard`;
    sec.appendChild(title);
    const grid = el('div', { class: 'metric-grid' });
    const capM = ui.metric({ label: 'Capacity', bind: () => ({ value: ui.fmtInt(this.capacityL), unit: 'L' }), iconName: 'database', compact: true });
    const pumpM = ui.metric({ label: 'Pump Speed', bind: () => ({ value: ui.fmt(this.pump.speed, 0), unit: '%' }), iconName: 'pump', compact: true });
    const startsM = ui.metric({ label: 'Starts', bind: () => String(this.pump.starts), iconName: 'restart', compact: true });
    const inM = ui.metric({ label: 'Total In', bind: () => `${ui.fmt(this.totalInflowL / 1000, 2)} m³`, iconName: 'download', compact: true });
    grid.append(capM, pumpM, startsM, inM);
    sec.appendChild(grid);

    const bar = ui.progressBar(0);
    const levelRow = el('div', { style: { marginTop: '10px' } },
      el('div', { class: 'section-title', style: { margin: '0 0 5px' } }, 'RESERVOIR LEVEL'),
      bar,
    );
    this.addPanelBind(() => {
      const l = this.levelPercent();
      bar._set(l);
      bar.className = `progress ${this.levelTone() === 'danger' ? 'danger' : this.levelTone() === 'warn' ? 'warn' : ''}`;
    });
    sec.appendChild(levelRow);

    const balance = el('div', { class: 'kv-list', style: { marginTop: '8px' } });
    balance.append(
      ui.kvRow('Inlet flow totaliser', '0', { bind: () => `${ui.fmtInt(this._inletTotaliser || 0)} L` }),
      ui.kvRow('Outlet flow totaliser', '0', { bind: () => `${ui.fmtInt(this._outletTotaliser || 0)} L` }),
      ui.kvRow('Net transfer', '0', { bind: () => `${this.inletFlow >= this.outletFlow ? '+' : ''}${ui.fmt(this.inletFlow - this.outletFlow, 1)} L/min` }),
      ui.kvRow('Auto fill target', '0', { bind: () => `${ui.fmt(this.targetLevel, 0)} % · ${this.autoFill ? 'ENABLED' : 'OFF'}` }),
      ui.kvRow('Pump running hours', '0', { bind: () => ui.fmtDuration(this.pump.runtime) }),
    );
    sec.appendChild(balance);

    const scen = el('div', { class: 'btn-row', style: { marginTop: '8px' } });
    scen.append(
      ui.button('Fill Cycle', { size: 'small', iconName: 'droplet', onClick: () => { this.runFillCycle(); this.refreshLive(); } }),
      ui.button('Drain Cycle', { size: 'small', iconName: 'download', onClick: () => { this.runDrainCycle(); this.refreshLive(); } }),
      ui.button('Demand Profile', { size: 'small', iconName: 'activity', onClick: () => { this.runDemandProfile(); this.refreshLive(); } }),
      ui.button('Flow Scenarios', { size: 'small', variant: 'subtle', iconName: 'sliders', onClick: () => this.setTab('spawn') }),
    );
    sec.appendChild(scen);
    body.appendChild(sec);

    // activity log
    const logSec = el('div', { class: 'section' });
    const logTitle = el('div', { class: 'section-title' });
    logTitle.innerHTML = `${ui.icon('timeline', 12).outerHTML} Process Activity Log`;
    logSec.appendChild(logTitle);
    const list = el('div', { class: 'section-card', style: { padding: '2px 10px', maxHeight: '150px', overflowY: 'auto' } });
    let last = -1;
    this.addPanelBind(() => {
      if (last === this.events.length) return;
      last = this.events.length;
      ui.clear(list);
      const items = this.events.filter(e => /pump|valve|level|flow|tank|scenario|transfer/i.test(e.title)).slice(0, 6);
      if (!items.length) { list.appendChild(el('div', { class: 'empty', style: { padding: '12px' }, text: 'No process activity recorded yet.' })); return; }
      for (const e of items) list.appendChild(el('div', { class: 'kv-row' }, el('span', { class: 'k', text: e.title }), el('span', { class: 'v', text: e.time })));
    });
    logSec.appendChild(list);
    body.appendChild(logSec);
  }

  getQuickActions() {
    return [
      { label: 'Fill to Target', icon: 'droplet', variant: 'subtle', onClick: () => { this.runFillCycle(); toast('Automatic fill cycle engaged.', { type: 'ok' }); } },
      { label: 'Toggle Pump', icon: 'pump', onClick: () => { if (this.pump.failed || this.pump.tripped) this.restartPump(); else this.setPump(!this.pump.on); } },
      { label: 'Auto Fill ' + (this.autoFill ? 'ON' : 'OFF'), icon: 'refresh', variant: this.autoFill ? 'subtle' : undefined, onClick: () => { this.autoFill = !this.autoFill; if (this.autoFill) this.autoDrain = false; this.persistSettings(); this.refreshLive(); toast(`Automatic filling ${this.autoFill ? 'enabled' : 'disabled'}.`, { type: 'info' }); } },
      { label: 'Flow Scenarios', icon: 'sliders', onClick: () => this.setTab('spawn') },
      { label: 'Alarms', icon: 'alert', onClick: () => this.setTab('alarms') },
    ];
  }

  getLegend() {
    return [
      { color: '#3ce58b', label: 'Normal level (20–88 %)' },
      { color: '#ffb547', label: 'Low / high level' },
      { color: '#ff4a5f', label: 'Critical / overflow' },
      { color: '#46a9ff', label: 'Water volume' },
    ];
  }

  /* =========================================================
     Operations panel
     ========================================================= */
  buildOperations(container) {
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ui.icon('info', 13).outerHTML}<span>Every command below acts on the live hydraulic engine. Pump, valves, level and 3D water volume respond immediately.</span>`;
    container.appendChild(note);

    /* --- level & storage --- */
    const stSec = el('div', { class: 'section' });
    stSec.appendChild(el('div', { class: 'section-title' }, ui.icon('tank', 12), 'Storage & Level Control'));
    const stCard = el('div', { class: 'section-card' });
    const stRow = el('div', { class: 'btn-row' });
    stRow.append(
      ui.button('Level +5 %', { size: 'small', iconName: 'plus', onClick: () => { this.nudgeLevel(5); } }),
      ui.button('Level −5 %', { size: 'small', iconName: 'minus', onClick: () => { this.nudgeLevel(-5); } }),
      ui.button('Fill to 100 %', { size: 'small', variant: 'subtle', iconName: 'droplet', onClick: () => { this.autoFill = true; this.autoDrain = false; this.targetLevel = 100; this.pump.auto = true; this.persistSettings(); this.refreshLive(); } }),
      ui.button('Drain to 15 %', { size: 'small', variant: 'warn', iconName: 'download', onClick: () => { this.runDrainCycle(); } }),
    );
    stCard.appendChild(stRow);
    const lvlBar = ui.progressBar(0);
    stCard.appendChild(el('div', { style: { margin: '9px 0 4px' } }, lvlBar));
    const lvlLabel = el('div', { class: 'help' });
    this.addPanelBind(() => {
      lvlBar._set(this.levelPercent());
      lvlBar.className = `progress ${this.levelTone() === 'danger' ? 'danger' : this.levelTone() === 'warn' ? 'warn' : ''}`;
      lvlLabel.textContent = `${ui.fmt(this.levelPercent(), 1)} % · ${ui.fmtInt(this.volumeL)} of ${ui.fmtInt(this.capacityL)} L`;
    });
    stCard.appendChild(lvlLabel);
    stCard.appendChild(ui.slider({ label: 'Set level', min: 0, max: 100, step: .5, value: Math.round(this.levelPercent()), unit: '%', onInput: v => this.setLevelPercent(v, true), onChange: v => { this.setLevelPercent(v); } }));
    stCard.appendChild(ui.slider({ label: 'Auto-fill target', min: 5, max: 100, step: 1, value: this.targetLevel, unit: '%', onInput: v => { this.targetLevel = v; }, onChange: () => { this.persistSettings(); this.refreshLive(); } }));
    stCard.appendChild(ui.numberField({ label: 'Working capacity', unit: 'L', min: MIN_CAP, max: MAX_CAP, step: 500, value: this.capacityL, onChange: v => this.setCapacity(v) }));
    stCard.appendChild(ui.toggle({ label: 'Automatic filling', description: 'Run the pump until the target level is reached.', value: this.autoFill, onChange: v => { this.autoFill = v; if (v) this.autoDrain = false; this.persistSettings(); this.refreshLive(); } }));
    stCard.appendChild(ui.toggle({ label: 'Automatic draining', description: 'Open the outlet valve and drain to the reserve target.', value: this.autoDrain, onChange: v => { this.autoDrain = v; if (v) this.autoFill = false; this.persistSettings(); this.refreshLive(); } }));
    stSec.appendChild(stCard);
    container.appendChild(stSec);

    /* --- pump --- */
    const pSec = el('div', { class: 'section' });
    pSec.appendChild(el('div', { class: 'section-title' }, ui.icon('pump', 12), 'Booster Pump Control'));
    const pCard = el('div', { class: 'section-card' });
    const pumpBadge = el('div', { class: 'row spaced', style: { marginBottom: '8px' } });
    this.addPanelBind(() => {
      pumpBadge.innerHTML = '';
      pumpBadge.append(el('b', { style: { fontSize: '10.5px' }, text: this.pumpLabel() }), ui.badge(`${ui.fmt(this.pump.current, 1)} A`, this.pumpTone()));
    });
    pCard.appendChild(pumpBadge);
    const pRow = el('div', { class: 'btn-row' });
    pRow.append(
      ui.button('Start', { size: 'small', variant: 'subtle', iconName: 'play', onClick: () => this.setPump(true) }),
      ui.button('Stop', { size: 'small', iconName: 'pause', onClick: () => this.setPump(false) }),
      ui.button('Restart', { size: 'small', variant: 'warn', iconName: 'restart', onClick: () => this.restartPump() }),
      ui.button('Emergency Stop', { size: 'small', variant: 'danger', iconName: 'stop', onClick: () => this.emergencyStop() }),
    );
    pCard.appendChild(pRow);
    pCard.appendChild(ui.toggle({ label: 'Automatic pump control', description: 'Pump follows the fill / demand logic when enabled.', value: this.pump.auto, onChange: v => { this.pump.auto = v; this.persistSettings(); this.refreshLive(); } }));
    pCard.appendChild(ui.slider({ label: 'Pump speed setpoint', min: 10, max: 120, step: 1, value: this.pump.speed, unit: '%', onInput: v => { this.pump.speed = v; }, onChange: v => this.setPumpSpeed(v) }));
    pCard.appendChild(ui.slider({ label: 'Rated flow capacity', min: 60, max: 600, step: 10, value: this.pumpFlowCap, unit: 'L/min', onInput: v => { this.pumpFlowCap = v; }, onChange: v => this.setPumpFlowCapacity(v) }));
    pCard.appendChild(ui.slider({ label: 'Motor load factor', min: .4, max: 1.4, step: .05, value: this.pump.load, unit: '×', onInput: v => { this.pump.load = v; }, onChange: v => this.setMotorLoad(v) }));
    const pumpKv = el('div', { class: 'kv-list', style: { marginTop: '6px' } });
    pumpKv.append(
      ui.kvRow('Current', '0', { bind: () => `${ui.fmt(this.pump.current, 2)} A` }),
      ui.kvRow('Winding temperature', '0', { bind: () => `${ui.fmt(this.pump.temperature, 1)} °C` }),
      ui.kvRow('Discharge pressure', '0', { bind: () => `${ui.fmt(this.inletPressureBar, 2)} bar` }),
      ui.kvRow('Dry-run protection', '0', { bind: () => this.pump.tripped ? 'TRIPPED' : this.pump.dry ? 'ACTIVE' : 'HEALTHY' }),
    );
    pCard.appendChild(pumpKv);
    pSec.appendChild(pCard);
    container.appendChild(pSec);

    /* --- valves --- */
    const vSec = el('div', { class: 'section' });
    vSec.appendChild(el('div', { class: 'section-title' }, ui.icon('valve', 12), 'Motorised Valve Control'));
    for (const ref of ['inlet', 'outlet']) {
      const v = ref === 'inlet' ? this.inletValve : this.outletValve;
      const card = el('div', { class: 'section-card', style: { marginBottom: '7px' } });
      const head = el('div', { class: 'row spaced', style: { marginBottom: '7px' } });
      const state = el('span');
      this.addPanelBind(() => {
        state.innerHTML = '';
        state.appendChild(ui.badge(this.valveLabel(ref), this.valveTone(ref)));
      });
      head.append(el('b', { style: { fontSize: '10.5px' }, text: ref === 'inlet' ? 'Inlet isolation V-01' : 'Outlet control V-02' }), state);
      card.appendChild(head);
      const row = el('div', { class: 'btn-row' });
      row.append(
        ui.button('Open', { size: 'small', iconName: 'unlock', onClick: () => this.setValvePct(ref, 100) }),
        ui.button('Close', { size: 'small', iconName: 'lock', onClick: () => this.setValvePct(ref, 0) }),
        ui.button('Inspect', { size: 'small', variant: 'ghost', iconName: 'eye', onClick: () => this.selectObject(`${ref}-valve`) }),
      );
      card.appendChild(row);
      card.appendChild(ui.slider({ label: 'Position setpoint', min: 0, max: 100, step: 1, value: Math.round(v.target), unit: '%', onInput: v2 => { v.target = clamp(v2, 0, 100); }, onChange: v2 => this.setValvePct(ref, v2) }));
      card.appendChild(ui.toggle({ label: 'Automatic control', value: v.auto, onChange: v2 => this.setValveAuto(ref, v2) }));
      card.appendChild(ui.slider({ label: 'Travel speed', min: 5, max: 100, step: 1, value: v.speed, unit: '%/s', onInput: v2 => { v.speed = v2; }, onChange: v2 => this.setValveSpeed(ref, v2) }));
      vSec.appendChild(card);
    }
    container.appendChild(vSec);

    /* --- diagnostics --- */
    const dSec = el('div', { class: 'section' });
    dSec.appendChild(el('div', { class: 'section-title' }, ui.icon('warning', 12), 'Diagnostics & Alarm Testing'));
    const dCard = el('div', { class: 'section-card' });
    dCard.appendChild(ui.toggle({ label: 'Inject pump motor failure', description: 'Latch motor protection fault for alarm testing.', value: this.faults.pumpFailure, onChange: v => { this.injectPumpFailure(v); } }));
    dCard.appendChild(ui.toggle({ label: 'Inject flow-meter fault', description: 'Drive the inlet meter to full scale.', value: this.faults.flowMeter, onChange: v => { this.faults.flowMeter = v; this.evaluateAlarms(); this.refreshLive(); } }));
    dCard.appendChild(ui.toggle({ label: 'Simulate motor overload', value: this.faults.motorOverload, onChange: v => { this.setMotorOverload(v); } }));
    dCard.appendChild(ui.toggle({ label: 'Disable turbidity analyser', description: 'Simulate an instrument failure on AT-08.', value: this.faults.sensorFailure, onChange: v => {
      this.faults.sensorFailure = v;
      this.setSensorEnabled('turbidity', !v);
      this.logEvent(v ? 'Instrument fault injected' : 'Instrument fault cleared', 'Turbidity analyser AT-08 diagnostic.', v ? 'warn' : 'ok');
      this.evaluateAlarms();
      this.refreshLive();
    } }));
    const dRow = el('div', { class: 'btn-row', style: { marginTop: '6px' } });
    dRow.append(
      ui.button('Trigger Dry-Run Test', { size: 'small', variant: 'warn', iconName: 'droplet', onClick: () => {
        this.autoFill = false; this.autoDrain = false; this.pump.auto = false;
        this.setLevelPercent(1.2, true);
        this.pump.on = true;
        this.logEvent('Dry-run test armed', 'Reservoir drained to 1.2 % with the pump running.', 'warn');
        toast('Dry-run test armed — pump will trip.', { type: 'warn' });
        this.refreshLive();
      } }),
      ui.button('Trigger Overheat', { size: 'small', variant: 'warn', iconName: 'thermometer', onClick: () => {
        this.pump.temperature = 96;
        this.evaluateAlarms();
        toast('Pump winding temperature forced to 96 °C.', { type: 'warn' });
        this.refreshLive();
      } }),
    );
    dCard.appendChild(dRow);
    const dRow2 = el('div', { class: 'btn-row', style: { marginTop: '6px' } });
    dRow2.append(
      ui.button('Force Low Level Alarm', { size: 'small', iconName: 'alert', onClick: () => { this.autoFill = false; this.setLevelPercent(12); this.evaluateAlarms(); this.refreshLive(); } }),
      ui.button('Force Overflow Alarm', { size: 'small', iconName: 'alert', onClick: () => { this.setLevelPercent(97); this.evaluateAlarms(); this.refreshLive(); } }),
      ui.button('Reset All Faults', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => {
        this.faults.pumpFailure = false; this.faults.sensorFailure = false; this.faults.flowMeter = false; this.faults.motorOverload = false;
        this.pump.failed = false; this.pump.tripped = false;
        this.pump.load = 1;
        this.setSensorEnabled('turbidity', true);
        this.evaluateAlarms();
        this.logEvent('Diagnostics reset', 'All injected faults cleared.', 'ok');
        this.refreshLive();
      } }),
    );
    dCard.appendChild(dRow2);
    dSec.appendChild(dCard);
    container.appendChild(dSec);

    /* --- utilities & counters --- */
    const uSec = el('div', { class: 'section' });
    uSec.appendChild(el('div', { class: 'section-title' }, ui.icon('light', 12), 'Utilities & Counters'));
    uSec.appendChild(ui.toggle({ label: 'Site lighting circuit energised', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); } }));
    uSec.appendChild(ui.toggle({ label: 'Pump house door held open', value: this.doorOpen, onChange: v => { this.doorOpen = v; this.logEvent(v ? 'Pump house door opened' : 'Pump house door closed', 'Access door state changed.', 'info'); this.refreshLive(); } }));
    const countKv = el('div', { class: 'kv-list', style: { marginTop: '6px' } });
    countKv.append(
      ui.kvRow('Inflow totaliser', '0', { bind: () => `${ui.fmtInt(this.totalInflowL)} L` }),
      ui.kvRow('Outflow totaliser', '0', { bind: () => `${ui.fmtInt(this.totalOutflowL)} L` }),
      ui.kvRow('Pump starts', '0', { bind: () => String(this.pump.starts) }),
      ui.kvRow('Pump running hours', '0', { bind: () => ui.fmtDuration(this.pump.runtime) }),
      ui.kvRow('Sensor channels', String(this.sensorDefs.length)),
    );
    uSec.appendChild(countKv);
    uSec.appendChild(ui.button('Reset Counters', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => this.resetCounters() }));
    container.appendChild(uSec);
  }

  /* =========================================================
     Flow scenarios ("spawning") panel
     ========================================================= */
  buildSpawning(container) {
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ui.icon('droplet', 13).outerHTML}<span>Flow scenarios drive realistic fill, drain and demand cycles. All actions are connected to the hydraulic engine and 3D reservoir.</span>`;
    container.appendChild(note);

    const sSec = el('div', { class: 'section' });
    sSec.appendChild(el('div', { class: 'section-title' }, ui.icon('activity', 12), 'Scenario Presets'));
    const grid = el('div', { class: 'btn-row' });
    grid.append(
      ui.button('Fill Cycle', { size: 'small', variant: 'subtle', iconName: 'droplet', onClick: () => { this.runFillCycle(); } }),
      ui.button('Drain Cycle', { size: 'small', variant: 'subtle', iconName: 'download', onClick: () => { this.runDrainCycle(); } }),
      ui.button('Demand Profile', { size: 'small', variant: 'subtle', iconName: 'activity', onClick: () => { this.runDemandProfile(); } }),
      ui.button('Night Setback', { size: 'small', variant: 'subtle', iconName: 'moon', onClick: () => { this.runNightMode(); } }),
      ui.button('Stop Scenarios', { size: 'small', variant: 'ghost', iconName: 'stop', onClick: () => { this.stopScenarios(); } }),
    );
    sSec.appendChild(grid);
    const statusCard = el('div', { class: 'section-card', style: { marginTop: '8px' } });
    const statusTxt = el('div', { class: 'help' });
    this.addPanelBind(() => {
      const bits = [];
      bits.push(this.autoFill ? 'AUTO-FILL' : this.autoDrain ? 'AUTO-DRAIN' : this.demand.active ? 'DEMAND' : 'IDLE');
      bits.push(`target ${ui.fmt(this.targetLevel, 0)} %`);
      bits.push(`level ${ui.fmt(this.levelPercent(), 1)} %`);
      if (this.transfer) bits.push(`batch ${ui.fmtInt(this.transfer.remaining)} L left`);
      statusTxt.textContent = bits.join(' · ');
    });
    statusCard.appendChild(statusTxt);
    sSec.appendChild(statusCard);
    container.appendChild(sSec);

    const dSec = el('div', { class: 'section' });
    dSec.appendChild(el('div', { class: 'section-title' }, ui.icon('chart', 12), 'Demand Profile'));
    dSec.appendChild(ui.segmentedControl('Demand curve', [
      { value: 'residential', label: 'Residential' },
      { value: 'industrial', label: 'Industrial' },
      { value: 'night', label: 'Night' },
    ], this.demand.mode, v => { this.demand.mode = v; this.persistSettings(); this.refreshLive(); }));
    dSec.appendChild(ui.slider({ label: 'Demand multiplier', min: .2, max: 2, step: .05, value: this.demand.factor, unit: '×', onInput: v => { this.demand.factor = v; }, onChange: () => this.persistSettings() }));
    dSec.appendChild(ui.toggle({ label: 'Demand profile active', description: 'Outlet valve follows the demand curve.', value: this.demand.active, onChange: v => { this.demand.active = v; this.persistSettings(); this.refreshLive(); } }));
    const demandKv = el('div', { class: 'kv-list', style: { marginTop: '6px' } });
    demandKv.append(
      ui.kvRow('Demand multiplier', '0', { bind: () => `${ui.fmt(this.demandFactor(), 2)} ×` }),
      ui.kvRow('Outlet flow', '0', { bind: () => `${ui.fmt(this.outletFlow, 1)} L/min` }),
      ui.kvRow('Outlet valve', '0', { bind: () => `${ui.fmt(this.outletValve.pct, 0)} %` }),
    );
    dSec.appendChild(demandKv);
    container.appendChild(dSec);

    const bSec = el('div', { class: 'section' });
    bSec.appendChild(el('div', { class: 'section-title' }, ui.icon('droplet', 12), 'Batch Fill / Drain'));
    const bCard = el('div', { class: 'section-card' });
    const amountField = ui.numberField({ label: 'Batch volume', unit: 'L', min: 50, max: 20000, step: 50, value: 1000 });
    const rateField = ui.numberField({ label: 'Transfer rate', unit: 'L/min', min: 20, max: 600, step: 10, value: 300 });
    bCard.append(amountField, rateField);
    const bRow = el('div', { class: 'btn-row', style: { marginTop: '7px' } });
    bRow.append(
      ui.button('Batch Fill', { size: 'small', variant: 'subtle', iconName: 'plus', onClick: () => {
        this.queueTransfer('fill', +amountField.querySelector('input').value || 1000, +rateField.querySelector('input').value || 300);
        this.refreshLive();
      } }),
      ui.button('Batch Drain', { size: 'small', iconName: 'minus', onClick: () => {
        this.queueTransfer('drain', +amountField.querySelector('input').value || 1000, +rateField.querySelector('input').value || 300);
        this.refreshLive();
      } }),
      ui.button('Cancel Transfer', { size: 'small', variant: 'ghost', iconName: 'close', onClick: () => this.cancelTransfer() }),
    );
    bCard.appendChild(bRow);
    const quickRow = el('div', { class: 'btn-row', style: { marginTop: '6px' } });
    quickRow.append(
      ui.button('+1 000 L', { size: 'small', iconName: 'plus', onClick: () => { this.queueTransfer('fill', 1000, 300); } }),
      ui.button('+2 500 L', { size: 'small', iconName: 'plus', onClick: () => { this.queueTransfer('fill', 2500, 400); } }),
      ui.button('−1 000 L', { size: 'small', iconName: 'minus', onClick: () => { this.queueTransfer('drain', 1000, 300); } }),
      ui.button('Fill to 100 %', { size: 'small', variant: 'subtle', iconName: 'droplet', onClick: () => { this.queueTransfer('fill', Math.max(1, this.capacityL - this.volumeL), 420); } }),
      ui.button('Drain to 10 %', { size: 'small', variant: 'warn', iconName: 'download', onClick: () => { this.queueTransfer('drain', Math.max(1, this.volumeL - this.capacityL * .1), 380); } }),
    );
    bCard.appendChild(quickRow);
    const transferState = el('div', { class: 'help', style: { marginTop: '6px' } });
    this.addPanelBind(() => {
      transferState.textContent = this.transfer
        ? `Transferring ${this.transfer.type === 'fill' ? 'into' : 'out of'} T-01 · ${ui.fmtInt(this.transfer.remaining)} L remaining at ${ui.fmt(this.transfer.rate, 0)} L/min`
        : 'No batch transfer in progress.';
    });
    bCard.appendChild(transferState);
    bSec.appendChild(bCard);
    container.appendChild(bSec);

    const eSec = el('div', { class: 'section' });
    eSec.appendChild(el('div', { class: 'section-title' }, ui.icon('warning', 12), 'Scenario Safety'));
    eSec.appendChild(ui.button('Emergency Stop (Pump + Valves)', { variant: 'danger', iconName: 'stop', block: true, onClick: () => this.emergencyStop() }));
    eSec.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Scenarios pause automatically when the master control mode is MANUAL. Batch transfers continue only while the simulation is running.' }));
    container.appendChild(eSec);
  }

  /* =========================================================
     Lifecycle hooks
     ========================================================= */
  onAfterMount() {
    this.setSensorValue('level', this.levelPercent());
    this.setSensorValue('volume', this.volumeL);
    this.drawHmi();
    this.logEvent(
      'Tank farm ready',
      `T-01 at ${ui.fmt(this.levelPercent(), 1)} % · ${ui.fmtInt(this.volumeL)} L · ${this.autoFill ? 'auto-fill armed' : 'manual standby'}.`,
      'ok',
    );
  }

  onSimulationStart() { this.logEvent('Hydraulic engine resumed', 'Pump and valve automation active.', 'ok'); }
  onSimulationStop() { this.logEvent('Hydraulic engine stopped', 'Automatic process halted by operator.', 'warn'); }

  /* =========================================================
     Detailed Operational Scenarios
     ========================================================= */
  registerDetailedScenarios() {
    /* ---- Smart Water Tank Scenario ---- */
    this.registerScenario({
      id: 'water-tank-full-cycle',
      name: 'Water Tank Fill & Distribution Cycle',
      description: 'Complete water management from tank fill to distribution and low-level response',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-water',
          title: 'Initialize Water Tank',
          description: 'Check initial tank level and system status',
          objective: 'Verify tank at 65%, pump in standby, valves closed, auto-fill armed',
          checkComplete: (infra) => infra.levelPercent() > 60 && infra.levelPercent() < 70,
          autoAdvanceDelay: 4000,
          camera: { position: [0, 12, -8], target: [0, 5, -8] },
          narration: 'Welcome to the Smart Water Tank. Current level is 65% - within normal operating range.',
        },
        {
          id: 'check-valves',
          title: 'Verify Valve Positions',
          description: 'Confirm inlet and outlet valves are in correct positions for fill',
          objective: 'Inlet valve closed, outlet valve closed, ready for fill operation',
          checkComplete: (infra) => true,
          autoAdvanceDelay: 3000,
          camera: { position: [-2, 5, 3], target: [-2, 1, 3] },
          narration: 'Checking valve positions. Both inlet and outlet valves should be closed initially.',
        },
        {
          id: 'activate-pump',
          title: 'Activate Inlet Pump',
          description: 'Start the booster pump to fill the tank',
          objective: 'Turn on pump, verify speed at 100%, observe flow rate increasing',
          onEnter: (infra) => { infra.setPumpState?.(true); infra.setPumpSpeed?.(100); },
          checkComplete: (infra) => infra.pump?.on && (infra.inletFlow || 0) > 100,
          autoAdvanceDelay: 5000,
          camera: { position: [-6, 5, 4], target: [-6, 1, 4] },
          narration: 'Activating the booster pump at 100% speed. Water begins flowing into the tank.',
        },
        {
          id: 'monitor-fill',
          title: 'Monitor Tank Fill',
          description: 'Observe water level rising and sensor updates',
          objective: 'Watch tank level increase, flow rate stabilize, level gauge respond',
          checkComplete: (infra) => infra.levelPercent() > 80,
          autoAdvanceDelay: 15000,
          camera: { position: [0, 12, -8], target: [0, 5, -8] },
          narration: 'Tank is filling. Level rising steadily. Pump flow stabilized at 400 L/min.',
        },
        {
          id: 'target-reached',
          title: 'Target Level Reached',
          description: 'Tank reaches configured high level, pump auto-stops',
          objective: 'Observe automatic pump shutdown at 80% level, inlet valve closes',
          checkComplete: (infra) => !infra.pump?.on || infra.levelPercent() > 85,
          autoAdvanceDelay: 5000,
          narration: 'Tank reached 80% - target level. Pump automatically stops. Inlet valve closes.',
        },
        {
          id: 'open-outlet',
          title: 'Open Outlet Valve',
          description: 'Begin water distribution to consumers',
          objective: 'Open outlet valve, observe flow to process demand',
          onEnter: (infra) => { infra.setOutletValve?.(100); },
          checkComplete: (infra) => (infra.outletFlow || 0) > 50,
          autoAdvanceDelay: 5000,
          camera: { position: [-2, 5, 3], target: [-2, 1, 3] },
          narration: 'Opening outlet valve. Water now flows to process demand and distribution network.',
        },
        {
          id: 'level-decrease',
          title: 'Monitor Level Decrease',
          description: 'Observe tank level dropping as water is consumed',
          objective: 'Watch level gauge, flow meter, and consumption rate',
          checkComplete: (infra) => infra.levelPercent() < 50,
          autoAdvanceDelay: 15000,
          camera: { position: [0, 12, -8], target: [0, 5, -8] },
          narration: 'Water being consumed by process demand. Level dropping at 85 L/min.',
        },
        {
          id: 'low-level-warning',
          title: 'Low Level Warning',
          description: 'Tank reaches low-level threshold, alarm triggers',
          objective: 'Respond to low-level alarm, prepare for pump restart',
          checkComplete: (infra) => infra.getActiveAlarms?.()?.some(a => a.id?.includes('low') || a.title?.includes('Low')),
          autoAdvanceDelay: 8000,
          narration: 'WARNING: Tank level at 20%. Low level alarm activated. Pump restart needed.',
        },
        {
          id: 'restore-operation',
          title: 'Restore Normal Operation',
          description: 'Restart pump and return to normal operating band',
          objective: 'Activate pump, verify fill resumes, clear alarm',
          onEnter: (infra) => { infra.setPumpState?.(true); infra.setPumpSpeed?.(100); },
          checkComplete: (infra) => infra.levelPercent() > 60 && !infra.getActiveAlarms?.()?.some(a => a.id?.includes('low')),
          autoAdvanceDelay: 15000,
          narration: 'Pump restarted at 100%. Tank refilling. Low-level alarm will clear automatically.',
        },
        {
          id: 'water-report',
          title: 'Water Operations Summary',
          description: 'Generate water management operational report',
          objective: 'Review fill/drain cycles, pump runtime, total volume, alarm events',
          checkComplete: () => true,
          autoAdvanceDelay: 4000,
          narration: 'Water cycle complete. Tank restored to normal operating range. Report generated.',
        },
      ],
    });

    /* ---- Emergency Response Scenario ---- */
    this.registerScenario({
      id: 'water-emergency-response',
      name: 'Emergency Response Drill',
      description: 'Practice responding to pump failure and sensor faults',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-emergency',
          title: 'Normal Operations',
          description: 'System running normally, tank at 70%',
          objective: 'Verify normal operation before emergency',
          checkComplete: (infra) => infra.pump?.on,
          autoAdvanceDelay: 3000,
        },
        {
          id: 'pump-failure',
          title: 'Pump Failure Event',
          description: 'Simulate pump motor overload trip',
          objective: 'Observe pump trip, flow stop, alarm generation',
          onEnter: (infra) => { infra.pump.failed = true; infra.pump.on = false; infra.faults.pumpFailure = true; infra.logEvent('Pump failure', 'Motor overload trip simulated', 'danger'); },
          checkComplete: (infra) => infra.faults.pumpFailure && !infra.pump.on,
          autoAdvanceDelay: 4000,
        },
        {
          id: 'respond-failure',
          title: 'Emergency Response',
          description: 'Execute emergency procedures for pump failure',
          objective: 'Acknowledge alarm, isolate pump, activate backup if available',
          checkComplete: (infra) => true,
          allowSkip: true,
          autoAdvanceDelay: 10000,
        },
        {
          id: 'restore-pump',
          title: 'Restore Pump Operation',
          description: 'Clear fault and restart pump',
          objective: 'Reset overload, restart pump, verify flow restored',
          onEnter: (infra) => { infra.pump.failed = false; infra.faults.pumpFailure = false; infra.setPumpState?.(true); },
          checkComplete: (infra) => infra.pump?.on && !infra.faults.pumpFailure,
          autoAdvanceDelay: 5000,
        },
      ],
    });
  }

  // First-person interaction handlers
  _toggleDoor(obj) {
    // Water tank doesn't have doors, open inspector instead
    this.selectObject(obj.id);
  }

  _operatePump(obj) {
    this.setPumpState?.(!this.pump?.on);
  }

  _toggleValve(obj) {
    if (obj.id?.includes('inlet')) {
      this.setInletValve?.(this.inletValve?.pct > 0 ? 0 : 100);
    } else if (obj.id?.includes('outlet')) {
      this.setOutletValve?.(this.outletValve?.pct > 0 ? 0 : 100);
    }
  }

  _operateMotor(obj) {
    this.setPumpState?.(!this.pump?.on);
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
}
