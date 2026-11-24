/* ============================================================
   SOLAR PANEL & BATTERY SYSTEM — 12-panel photovoltaic array,
   MPPT charge controller, 200 Ah battery bank, 5 kW inverter and
   managed AC loads with live energy-flow visualisation.
   ============================================================ */
import * as THREE from 'three';
import { BaseInfrastructure } from '../core/base.js';
import {
  group, box, cylinder, plane, material, emissive, roundedBox, textSprite, canvasTexture,
  signBoard, glass, makeControlCabinet, makeLampPost, pipe, mergeStaticGroup, shadowify,
} from '../core/scene.js';
import * as ui from '../core/ui.js';

const { el } = ui;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = ui.fmt;

export const meta = {
  id: 'solar',
  code: 'SOL-05',
  name: 'Solar & Battery System',
  description: '12-panel photovoltaic array with MPPT charge control, battery storage, 5 kW inverter, managed AC loads and animated energy-flow visualisation.',
  icon: 'solar',
  sceneBackground: 0x05090f,
  fogDensity: 0.0032,
  fitPadding: 1.04,
};

/* ---------------- Site layout constants ---------------- */
const PANEL_OFFSETS = [-11.0, -8.3, -5.6, -2.9];
const ARRAY_ROWS = [
  { id: 'A', z: -9.5 },
  { id: 'B', z: -4.2 },
  { id: 'C', z: 1.1 },
];
const PANELS_PER_STRING = 4;
const PANEL_AREA = 2.8;           // m² of active cell area used by the energy model
const NOMINAL_VOLTAGE = 48;       // battery bus voltage
const FLOW = {
  generation: 0xffc247,
  charging: 0x3ce58b,
  discharging: 0xff8a3d,
  load: 0x46a9ff,
};
const LOAD_ICON = { lighting: 'light', hvac: 'fan', pump: 'pump', machines: 'motor', comms: 'wifi', loadbank: 'bolt' };
const DEFAULT_LOADS = [
  { id: 'office_lighting', name: 'Office Lighting', watts: 320, enabled: true, essential: true, startHour: 7, endHour: 19, category: 'lighting', zones: ['main', 'meeting', 'reception'] },
  { id: 'hvac', name: 'HVAC System', watts: 1200, enabled: true, essential: false, startHour: 7, endHour: 19, category: 'hvac', zones: ['cooling', 'heating', 'ventilation'] },
  { id: 'workstations', name: 'Computer Workstations', watts: 800, enabled: true, essential: true, startHour: 7, endHour: 19, category: 'computers', count: 8 },
  { id: 'server_rack', name: 'Server & Network Rack', watts: 450, enabled: true, essential: true, startHour: 0, endHour: 24, category: 'it' },
  { id: 'printer_copier', name: 'Printer/Copier', watts: 600, enabled: true, essential: false, startHour: 8, endHour: 18, category: 'office_equip' },
  { id: 'kitchen', name: 'Kitchen Appliances', watts: 1100, enabled: true, essential: false, startHour: 7, endHour: 18, category: 'kitchen', items: ['coffee', 'microwave', 'fridge'] },
  { id: 'security', name: 'Security & Access', watts: 80, enabled: true, essential: true, startHour: 0, endHour: 24, category: 'security' },
  { id: 'loadbank', name: 'Manual Load Bank', watts: 0, enabled: true, essential: false, startHour: 0, endHour: 24, category: 'test' },
];

/* ---------------- Canvas helpers ---------------- */
function radialGlowTexture(inner = 'rgba(255,244,200,.95)', mid = 'rgba(255,222,140,.5)', outer = 'rgba(255,205,110,0)') {
  return canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(.3, mid);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function gravelTexture() {
  const tex = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1a1e22';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 3400; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = .6 + Math.random() * 2.4;
      const g = 34 + Math.random() * 48;
      ctx.fillStyle = `rgba(${g},${g + 4},${g + 8},${.3 + Math.random() * .55})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(10,13,16,.5)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * w, Math.random() * h);
      ctx.lineTo(Math.random() * w, Math.random() * h);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 7);
  return tex;
}

function cellTexture() {
  const cols = 6, rows = 10;
  return canvasTexture(256, 384, (ctx, w, h) => {
    ctx.fillStyle = '#081526';
    ctx.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + 2, y = r * ch + 2, ww = cw - 4, hh = ch - 4;
        const tint = 14 + Math.floor(Math.random() * 16);
        const g = ctx.createLinearGradient(x, y, x + ww, y + hh);
        g.addColorStop(0, `rgb(${tint},${46 + tint},${92 + tint})`);
        g.addColorStop(1, `rgb(${tint + 8},${36 + tint},${76 + tint})`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, ww, hh);
        ctx.strokeStyle = 'rgba(150,190,228,.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, ww, hh);
        ctx.strokeStyle = 'rgba(205,224,240,.10)';
        ctx.beginPath();
        ctx.moveTo(x + ww / 2, y); ctx.lineTo(x + ww / 2, y + hh);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = 'rgba(170,200,225,.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  });
}

function cloudTexture() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = 30 + Math.random() * (w - 60);
      const y = 40 + Math.random() * (h - 70);
      const r = 18 + Math.random() * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(210,228,244,.55)');
      g.addColorStop(1, 'rgba(180,205,228,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function dialTexture(title, unit, color) {
  return canvasTexture(192, 192, (ctx, w, h) => {
    const c = w / 2;
    ctx.fillStyle = '#0b141b';
    ctx.beginPath(); ctx.arc(c, c, c - 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,175,195,.5)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c, c, c - 8, 0, Math.PI * 2); ctx.stroke();
    // scale arc
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    for (let i = 0; i <= 30; i++) {
      const a = Math.PI * .82 + (i / 30) * Math.PI * 1.36;
      const big = i % 5 === 0;
      const r1 = c - 15, r2 = c - (big ? 27 : 21);
      ctx.beginPath();
      ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
      ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.fillStyle = '#cfe2ee';
    ctx.font = '700 17px "Cascadia Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(title, c, c - 26);
    ctx.fillStyle = color;
    ctx.font = '600 14px "Cascadia Mono", monospace';
    ctx.fillText(unit, c, c + 28);
  });
}

/* ---------------- Live LCD display surface ---------------- */
class Display {
  constructor(w = 1, h = .5, px = 320) {
    this.w = w;
    this.h = h;
    this.canvas = document.createElement('canvas');
    this.canvas.width = px;
    this.canvas.height = Math.max(32, Math.round(px * h / w));
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this._lastDraw = '';
    this.draw((ctx, cw, ch) => {
      ctx.fillStyle = '#04121a';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#2b6f74';
      ctx.font = '700 16px "Cascadia Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('NEXUS ENERGY · STANDBY', cw / 2, ch / 2);
    });
  }
  draw(fn) {
    const { ctx, canvas } = this;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    fn(ctx, w, h);
    this.texture.needsUpdate = true;
  }
}

/* ---------------- Animated energy-flow path ---------------- */
class EnergyFlow {
  constructor(infra, opts) {
    this.infra = infra;
    this.id = opts.id;
    this.color = opts.color;
    this.maxPower = opts.maxPower ?? 5000;
    this.speed = opts.speed ?? 1.25;
    this.count = opts.count ?? 14;
    this.dotScale = opts.dotScale ?? 1;
    this.baseColor = opts.color;
    const pts = opts.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .18);
    // physical cable / conduit that follows the exact dot path
    const tube = new THREE.TubeGeometry(this.curve, Math.max(24, opts.points.length * 12), opts.radius ?? .05, 6, false);
    this.cable = new THREE.Mesh(tube, material(opts.cableColor ?? 0x1a232b, { metalness: .35, roughness: .55 }));
    this.cable.castShadow = false;
    this.cable.receiveShadow = false;
    infra.cat.wiring.add(this.cable);
    // travelling pulses
    const geo = new THREE.SphereGeometry(opts.dotSize ?? .058, 6, 5);
    this.dotMat = new THREE.MeshBasicMaterial({ color: this.color, toneMapped: false });
    this.dots = new THREE.InstancedMesh(geo, this.dotMat, this.count);
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.frustumCulled = false;
    this.dots.castShadow = false;
    this.dots.receiveShadow = false;
    this.dots.count = 0;
    infra.cat.wiring.add(this.dots);
    this.phase = Math.random();
    this.power = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  update(dt, power) {
    this.power = power;
    const ratio = clamp(power / this.maxPower, 0, 1);
    if (power < 2) {
      this.dots.count = 0;
      this.phase = 0;
      return;
    }
    this.phase = (this.phase + dt * this.speed * (0.5 + 1.9 * Math.sqrt(ratio))) % 1;
    const active = Math.max(1, Math.min(this.count, Math.round(this.count * (0.32 + 0.68 * ratio))));
    const scale = (0.7 + ratio * 0.75) * this.dotScale;
    for (let i = 0; i < active; i++) {
      const t = (this.phase + i / active) % 1;
      this.curve.getPointAt(t, this._p);
      this._m.compose(this._p, this._q, this._s.set(scale, scale, scale));
      this.dots.setMatrixAt(i, this._m);
    }
    this.dots.count = active;
    this.dots.instanceMatrix.needsUpdate = true;
  }
}

/* ============================================================
   SOLAR & BATTERY SYSTEM
   ============================================================ */
export default class SolarBatterySystem extends BaseInfrastructure {
  constructor(host) {
    super(host, meta);
    // runtime simulation state
    this.arrayEnabled = true;
    this.panelStates = [];
    this.flows = [];
    this.lampLights = [];
    this.meterNeedles = [];
    this.batteryModules = [];
    this.loadVisuals = {};
    this.irradiance = 0;
    this.sunElev = 0;
    this.sunDir = new THREE.Vector3(0, 1, .4);
    this.ambientTemp = 23;
    this.rawSolarPower = 0;
    this.solarPower = 0;
    this.pvVoltage = 0;
    this.pvCurrent = 0;
    this.panelTemp = 36;
    this.batterySoc = 62;
    this.batteryVoltage = 48;
    this.batteryTemp = 24;
    this.batteryHealth = 96;
    this.chargeDC = 0;
    this.dischargeDC = 0;
    this.chargeCurrent = 0;
    this.loadDemand = 0;
    this.activeDemand = 0;
    this.loadServed = 0;
    this.unservedLoad = 0;
    this.shedding = false;
    this.inverterOut = 0;
    this.curtailed = 0;
    this.netPower = 0;
    this.systemEff = 0;
    this.energyTodayWh = 0;
    this.consumedTodayWh = 0;
    this.chargedTodayWh = 0;
    this.dischargedTodayWh = 0;
    this._energyDay = 0;
    this._displayTimer = 0;
    this._animT = 0;
    this._lastShed = false;
    this._ready = false;
    this._loadSerial = 0;
    this.lightingOn = true;
    // start mid-morning so the energy model is immediately meaningful
    this.simTime = 10 * 3600 + 20 * 60;
  }

  /* =========================================================
     Configuration
     ========================================================= */
  defaultConfig() {
    return {
      ...super.defaultConfig(),
      sun: { mode: 'auto', irradiance: 850, intensity: 1, cloudCover: .08 },
      panel: { enabled: true, voltage: 41.2, current: 14.5, efficiency: 22, temp: 38, tempMode: 'auto' },
      battery: {
        on: true, soc: 62, capacity: 200, chargeRate: .5, temp: 24, tempMode: 'auto',
        health: 96, failure: false, overheat: false, mode: 'auto',
      },
      controller: {
        enabled: true, mode: 'mppt', auto: true, maxCurrent: 130,
        chargeVoltage: 57.6, priority: 'battery', protection: true, failure: false,
      },
      inverter: { on: true, outputVoltage: 230, efficiency: 94, failure: false, maxOutput: 5000 },
      load: {
        enabled: true, autoProfile: false, reserveSoc: 30,
        loads: DEFAULT_LOADS.map(l => ({ ...l })),
      },
      thresholds: { batteryLow: 20, batteryHighTemp: 45, lowSolar: 250, panelHighTemp: 65, excessLoad: 4300 },
    };
  }

  /* Pull the persisted operating point back into runtime state. */
  loadConfig() {
    const cfg = super.loadConfig();
    try {
      cfg.load.loads = (cfg.load.loads && cfg.load.loads.length ? cfg.load.loads : DEFAULT_LOADS.map(l => ({ ...l }))).map((l, i) => ({
        id: l.id || `load-${i + 1}`,
        name: l.name || `Load ${i + 1}`,
        watts: clamp(+l.watts || 0, 0, 4000),
        enabled: l.enabled !== false,
        essential: !!l.essential,
        startHour: clamp(+l.startHour || 0, 0, 24),
        endHour: clamp(l.endHour === 0 ? 24 : (+l.endHour || 24), 0, 24),
      }));
      this.batterySoc = clamp(+cfg.battery.soc || 62, 0, 100);
      this.batteryTemp = clamp(+cfg.battery.temp ?? 24, -10, 90);
      this.batteryHealth = clamp(+cfg.battery.health ?? 96, 0, 100);
      this.panelTemp = clamp(+cfg.panel.temp ?? 36, -10, 100);
    } catch (err) {
      console.warn('solar config restore failed', err);
    }
    return cfg;
  }

  onSaveConfig(cfg) {
    // persist the live operating point alongside the editable settings
    cfg.battery = { ...cfg.battery, soc: +this.batterySoc.toFixed(1), temp: +this.batteryTemp.toFixed(1), health: +this.batteryHealth.toFixed(1) };
    cfg.panel = { ...cfg.panel, temp: +this.panelTemp.toFixed(1) };
  }

  /* =========================================================
     World construction
     ========================================================= */
  buildWorld() {
    this.makeCategories();
    this.buildGround();
    this.buildSolarArrays();
    this.buildWeatherStation();
    this.buildController();
    this.buildBatteryBank();
    this.buildInverter();
    this.buildDistribution();
    this.buildLoadCentre();
    this.buildMeters();
    this.buildCableNetwork();
    this.buildLighting();
    this.buildSignage();
    this.buildFence();
    this.buildSky();
    this.buildBackground();
    this.buildInstrumentation();
    this.buildEquipment();
    this.optimizeStaticGeometry();
    this._ready = true;

    // First-person spawn point (main electrical control station)
    this.firstPersonSpawnPoint = { x: 0, y: 1.7, z: -15, yaw: 0, pitch: 0 };
    this.initFirstPerson(this.firstPersonSpawnPoint);

    // Register detailed operational scenarios
    this.registerDetailedScenarios();
  }

  makeCategories() {
    const cats = [
      ['floor', 'Site Ground & Gravel', 'structure'],
      ['foundation', 'Concrete Pads & Kerbs', 'structure'],
      ['walls', 'Load Centre Walls', 'structure'],
      ['roof', 'Load Centre Roof', 'structure'],
      ['columns', 'Array Mounting Posts', 'structure'],
      ['beams', 'Array Frames & Trestles', 'structure'],
      ['fencing', 'Perimeter Fence', 'structure'],
      ['panels', 'PV Panels', 'equipment'],
      ['batteries', 'Battery Bank', 'equipment'],
      ['cabinets', 'Power Cabinets', 'equipment'],
      ['equipment', 'Machinery & Plant', 'equipment'],
      ['loads', 'Connected Loads', 'equipment'],
      ['wiring', 'Cable Trays & Energy Flow', 'equipment'],
      ['sensors', 'Instrumentation', 'equipment'],
      ['lighting', 'Site Lighting', 'equipment'],
      ['signs', 'Signage', 'equipment'],
    ];
    this.cat = {};
    for (const [id, label, kind] of cats) this.cat[id] = this.category({ id, label, kind });
  }

  /* ---------------- Ground, gravel & pads ---------------- */
  buildGround() {
    const earth = new THREE.Mesh(new THREE.PlaneGeometry(240, 200), material(0x0a1016, { roughness: .97, metalness: 0 }));
    earth.rotation.x = -Math.PI / 2;
    earth.position.y = -.14;
    earth.receiveShadow = true;
    earth.userData.ignoreFit = true;
    this.scene.world.add(earth);

    const gravelMat = new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: .97, metalness: .02, color: 0x8f979d });
    const gravel = new THREE.Mesh(new THREE.PlaneGeometry(58, 38), gravelMat);
    gravel.rotation.x = -Math.PI / 2;
    gravel.position.set(-1.5, -.02, -.5);
    gravel.receiveShadow = true;
    this.cat.floor.add(gravel);

    // service road along the south edge
    const roadMat = material(0x1d242b, { roughness: .93, metalness: .04 });
    this.cat.floor.add(plane(58, 6.5, roadMat, { pos: [-1.5, .015, 15.5], receive: true }));
    const paint = new THREE.MeshBasicMaterial({ color: 0xc3ccd3, transparent: true, opacity: .5 });
    for (let x = -28; x < 26; x += 5) this.cat.floor.add(box(2.6, .012, .1, paint, { pos: [x, .04, 16.4], cast: false, receive: false }));

    // concrete equipment pad
    const padMat = material(0x545d64, { roughness: .92, metalness: .03 });
    this.cat.foundation.add(box(15.6, .16, 9.4, padMat, { pos: [9.4, .06, 2.0], receive: true }));
    // kerbs around the arrays
    const kerb = material(0x464f57, { roughness: .9 });
    for (const z of [-12.4, -1.2, 3.9]) this.cat.foundation.add(box(13.4, .16, .26, kerb, { pos: [-6.95, .08, z] }));
    for (const x of [-13.6, -0.3]) this.cat.foundation.add(box(.26, .16, 16.5, kerb, { pos: [x, .08, -6.9] }));

    // building plinth
    this.cat.foundation.add(box(7.2, .26, 6.0, material(0x4c555d, { roughness: .9 }), { pos: [9.5, .13, -8.0], receive: true }));

    // hazard keep-clear markings around plant
    const hazard = new THREE.MeshBasicMaterial({ color: 0xd8b23c, transparent: true, opacity: .5 });
    for (let i = 0; i < 8; i++) {
      this.cat.floor.add(box(.34, .01, .12, hazard, { pos: [3.6 + i * .55, .04, 7.1], ry: .6, cast: false, receive: false }));
    }
    // drain channel
    this.cat.foundation.add(box(15.4, .06, .34, material(0x2c343b, { roughness: .8 }), { pos: [9.4, .02, 7.4], cast: false }));
    // a few site rocks
    const rockMat = material(0x3b4248, { roughness: .96 });
    for (let i = 0; i < 12; i++) {
      const s = .18 + Math.random() * .3;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
      rock.position.set(-24 + Math.random() * 50, s * .4, -17 + Math.random() * 32);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      rock.userData.noMerge = true;
      this.cat.floor.add(rock);
    }
    this.scene.addCollider(gravel);
  }

  /* ---------------- PV arrays ---------------- */
  buildSolarArrays() {
    const frameMat = material(0x9aa7b2, { metalness: .72, roughness: .32 });
    const postMat = material(0x596570, { metalness: .6, roughness: .45 });
    const darkMat = material(0x1b242c, { metalness: .4, roughness: .5 });
    this.cellTexture = cellTexture();
    let serial = 1;

    for (const row of ARRAY_ROWS) {
      // torque tube and trestle posts
      this.cat.beams.add(box(10.9, .1, .1, frameMat, { pos: [-6.95, .92, row.z] }));
      this.cat.beams.add(box(.08, .06, .06, frameMat, { pos: [-6.95, 1.0, row.z] }));
      for (const x of [-12.0, -6.95, -1.9]) {
        this.cat.columns.add(box(.11, .92, .11, postMat, { pos: [x, .46, row.z] }));
        this.cat.columns.add(box(.42, .06, .42, material(0x3a444d), { pos: [x, .03, row.z] }));
        // diagonal brace
        const brace = box(.07, 1.05, .07, postMat, { pos: [x, .72, row.z + .34], rx: .55 });
        this.cat.beams.add(brace);
      }
      // row end rails
      for (const x of [-12.15, -1.75]) this.cat.beams.add(box(.08, .5, .08, frameMat, { pos: [x, .7, row.z] }));

      for (let i = 0; i < PANEL_OFFSETS.length; i++) {
        const px = PANEL_OFFSETS[i];
        const g = group(`panel-${serial}`);
        // merged static frame
        const frame = group('panel-frame');
        frame.add(box(2.5, .07, 1.5, frameMat, { pos: [0, 0, 0] }));
        frame.add(box(2.56, .07, .07, frameMat, { pos: [0, .03, .73] }));
        frame.add(box(2.56, .07, .07, frameMat, { pos: [0, .03, -.73] }));
        frame.add(box(.07, .07, 1.44, frameMat, { pos: [1.24, .02, 0] }));
        frame.add(box(.07, .07, 1.44, frameMat, { pos: [-1.24, .02, 0] }));
        frame.add(box(.24, .1, .18, darkMat, { pos: [.92, -.1, -.42] }));
        for (const cx of [-.9, .9]) {
          frame.add(box(.14, .06, .16, darkMat, { pos: [cx, -.07, .58] }));
          frame.add(box(.14, .06, .16, darkMat, { pos: [cx, -.07, -.58] }));
        }
        mergeStaticGroup(frame);
        g.add(frame);
        const cellMat = new THREE.MeshStandardMaterial({
          map: this.cellTexture, color: 0xdfe8f2, emissive: 0x2f6fd0,
          emissiveIntensity: .4, roughness: .28, metalness: .32,
        });
        const cells = new THREE.Mesh(new THREE.PlaneGeometry(2.36, 1.36), cellMat);
        cells.rotation.x = -Math.PI / 2;
        cells.position.y = .038;
        cells.castShadow = false;
        cells.receiveShadow = false;
        g.add(cells);
        g.position.set(px, 1.0, row.z);
        g.rotation.x = .58;
        this.cat.panels.add(g);
        this.addObject(g, {
          id: `panel-${serial}`,
          label: `PV Panel ${row.id}${i + 1}`,
          kind: 'panel',
          iconName: 'panel',
          description: `Row ${row.id} photovoltaic module · 2.8 m² monocrystalline array with MPPT output.`,
        });
        this.panelStates.push({ id: `panel-${serial}`, serial, row: row.id, index: i, group: g, cellMat, enabled: true });
        serial++;
      }

      // row junction + string cable toward the combiner
      const junction = box(.3, .24, .22, darkMat, { pos: [-1.55, .62, row.z] });
      this.cat.wiring.add(junction);
      const stringCable = pipe([[-1.55, .55, row.z], [-.9, .42, row.z], [.2, .42, row.z + .2], [0.7, .7, 1.3]], .035, material(0x141b21), { radial: 5, segs: 22 });
      this.cat.wiring.add(stringCable);
    }
    // pull all string cables to the combiner at (0.7, 1.3)
    for (const row of ARRAY_ROWS) {
      const c = pipe([[-.55, .42, row.z], [0.15, .45, row.z + (1.3 - row.z) * .3], [.7, .55, 1.3]], .035, material(0x141b21), { radial: 5, segs: 18 });
      this.cat.wiring.add(c);
    }
  }

  /* ---------------- Weather station / pyranometer ---------------- */
  buildWeatherStation() {
    const g = group('weather-station');
    g.position.set(-1.6, 0, 4.6);
    const pole = cylinder(.055, .07, 2.6, material(0x778791, { metalness: .65, roughness: .4 }), { pos: [0, 1.3, 0] });
    g.add(pole);
    g.add(box(.9, .06, .06, material(0x778791, { metalness: .6 }), { pos: [.42, 2.5, 0] }));
    const pryan = cylinder(.17, .2, .1, material(0x2b343c, { metalness: .4 }), { pos: [.82, 2.58, 0], segments: 16 });
    g.add(pryan);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass(0xbfe8ff, .5));
    dome.position.set(.82, 2.63, 0);
    g.add(dome);
    g.add(box(.34, .3, .2, material(0x2f3a43), { pos: [0, 1.9, 0] }));
    // wind vane
    g.add(cylinder(.01, .01, .5, material(0x8b99a3), { pos: [-.2, 2.75, 0], segments: 6 }));
    g.add(box(.3, .12, .015, material(0x9aa8b2), { pos: [-.05, 2.95, 0] }));
    this.cat.equipment.add(g);
    this.addObject(g, {
      id: 'weather-station', label: 'Solar Monitoring Station', kind: 'station', iconName: 'sun',
      description: 'Pyranometer, air temperature probe and wind sensor feeding the irradiance model.',
    });
    shadowify(g);
  }

  /* =========================================================
     Optimisation (decorative static geometry -> merged draws)
     ========================================================= */
  optimizeStaticGeometry() {
    for (const id of ['floor', 'foundation', 'fencing', 'columns', 'beams', 'signs', 'wiring']) {
      const cat = this.cat[id];
      if (cat) mergeStaticGroup(cat, { forceNoShadow: id === 'floor' || id === 'fencing' || id === 'wiring' });
    }
  }
  /* ---------------- MPPT charge controller ---------------- */
  buildController() {
    const cab = makeControlCabinet(1.5, 2.05, .72, { color: 0x3a4550, doorColor: 0x424e5a });
    cab.position.set(4.8, 0, 4.8);
    cab.add(cylinder(.14, .14, .06, material(0x242d35, { metalness: .5 }), { pos: [.45, 2.04, .16], segments: 16 }));
    cab.add(box(.92, .07, .5, material(0x2c353d, { metalness: .4 }), { pos: [0, .035, -.1] }));
    for (const x of [-.4, -.1, .2, .5]) cab.add(cylinder(.045, .045, .1, material(0x1d242b), { pos: [x, .06, .3], rx: Math.PI / 2, segments: 8 }));
    // live LCD
    const disp = new Display(.92, .5, 320);
    disp.mesh.position.set(.02, 1.62, .376);
    cab.add(disp.mesh);
    this.controllerDisplay = disp;
    // status lamps
    this.controllerLeds = [];
    const ledCols = [0x3ce58b, 0xffb547, 0xff4a5f];
    ledCols.forEach((col, i) => {
      const led = new THREE.Mesh(new THREE.SphereGeometry(.028, 8, 6), emissive(col, i === 0 ? 1.9 : .35));
      led.position.set(-.5 + i * .09, 1.28, .376);
      cab.add(led);
      this.controllerLeds.push(led);
    });
    // fuse switch handle
    cab.add(box(.16, .22, .05, material(0xc9d2d8, { metalness: .5 }), { pos: [.42, 1.28, .38], cast: false }));
    // brand strip
    cab.add(box(1.1, .1, .012, material(0x1c4f5c, { emissive: 0x1d6f74, emissiveIntensity: .6 }), { pos: [0, 1.96, .372], cast: false }));
    this.cat.cabinets.add(cab);
    this.addObject(cab, {
      id: 'controller', label: 'MPPT Charge Controller', kind: 'controller', iconName: 'bolt',
      description: '130 A maximum power point tracking charge controller with battery protection.',
    });
  }

  /* ---------------- Battery bank ---------------- */
  buildBatteryBank() {
    const frameMat = material(0x39444e, { metalness: .6, roughness: .4 });
    const rackDeco = group('battery-rack-deco');
    rackDeco.position.set(9.1, 0, 4.0);
    const rackFrame = group('rack');
    rackFrame.add(box(4.8, .14, .95, material(0x2a323a, { metalness: .4 }), { pos: [0, .07, 0] }));
    for (const x of [-2.35, 0, 2.35]) rackFrame.add(box(.09, 1.6, .09, frameMat, { pos: [x, .86, -.42] }));
    rackFrame.add(box(4.7, .09, .08, frameMat, { pos: [0, 1.64, -.42] }));
    rackFrame.add(box(4.5, .05, .42, material(0x232b33, { metalness: .45 }), { pos: [0, 1.7, -.1] }));
    for (const x of [-2.35, 2.35]) rackFrame.add(box(.16, .1, .12, material(0xb04a44), { pos: [x, 1.2, .38], cast: false }));
    mergeStaticGroup(rackFrame);
    rackDeco.add(rackFrame);
    this.cat.batteries.add(rackDeco);
    this.addObject(rackDeco, {
      id: 'battery-rack', label: 'Battery Storage Rack', kind: 'battery-rack', iconName: 'battery',
      description: 'Ventilated steel rack holding four 48 V LiFePO4 battery modules.',
    });

    const caseMat = material(0x2c3742, { metalness: .35, roughness: .5 });
    const faceMat = material(0x37424e, { metalness: .42, roughness: .45 });
    const termMat = material(0x9aa6b0, { metalness: .8, roughness: .3 });
    const moduleX = [7.55, 8.65, 9.75, 10.85];
    moduleX.forEach((x, i) => {
      const g = group(`battery-${i + 1}`);
      g.position.set(x, 0, 4.0);
      const c = group('case');
      c.add(roundedBox(.96, 1.32, .66, caseMat, { pos: [0, .78, 0], radius: .04 }));
      c.add(box(.86, 1.14, .02, faceMat, { pos: [0, .78, .335] }));
      c.add(box(.7, .05, .03, material(0x1d242b), { pos: [0, 1.21, .345], cast: false }));
      c.add(cylinder(.035, .035, .07, termMat, { pos: [-.28, 1.46, 0], segments: 10 }));
      c.add(cylinder(.035, .035, .07, material(0xb04a44, { metalness: .7 }), { pos: [.28, 1.46, 0], segments: 10 }));
      for (let v = 0; v < 5; v++) c.add(box(.5, .028, .014, material(0x222a32), { pos: [0, .28 + v * .07, .347], cast: false }));
      c.add(box(.36, .1, .015, material(0x4b3a1d), { pos: [0, .5, .348], cast: false }));
      mergeStaticGroup(c);
      g.add(c);
      // state-of-charge level bar
      g.add(box(.17, .8, .02, material(0x0b1218, { roughness: .8 }), { pos: [.3, .84, .352], cast: false }));
      const fillMat = new THREE.MeshStandardMaterial({ color: 0x3ce58b, emissive: 0x3ce58b, emissiveIntensity: 1.2, roughness: .4, metalness: .1 });
      const fill = box(.115, .74, .03, fillMat, { pos: [.3, .84, .36], cast: false });
      g.add(fill);
      for (let t = 1; t < 4; t++) g.add(box(.06, .012, .02, material(0x8794a0, { metalness: .6 }), { pos: [.39, .47 + t * .19, .358], cast: false }));
      const led = new THREE.Mesh(new THREE.SphereGeometry(.028, 8, 6), emissive(0x3ce58b, 1.6));
      led.position.set(-.33, 1.28, .348);
      g.add(led);
      const tag = textSprite(`BAT-0${i + 1}`, { size: 26, scale: .3, color: '#d8f6ea', bg: 'rgba(5,14,22,.72)', border: 'rgba(60,229,139,.3)' });
      tag.position.set(0, 1.66, .2);
      tag.visible = this.labelsVisible;
      g.add(tag);
      this.cat.batteries.add(g);
      this.addObject(g, {
        id: `battery-${i + 1}`, label: `Battery Module BAT-0${i + 1}`, kind: 'battery', iconName: 'battery',
        description: '48 V LiFePO4 storage module · one quarter of the 200 Ah battery bank.',
      });
      this.batteryModules.push({ id: `battery-${i + 1}`, group: g, fill, fillMat, led, fillHeight: .74, fillBaseY: .84, tag });
    });
    this.batteryRack = rackDeco;
  }

  /* ---------------- Inverter ---------------- */
  buildInverter() {
    const cab = makeControlCabinet(1.6, 2.35, .8, { color: 0x3c4046, doorColor: 0x474c53 });
    cab.position.set(13.4, 0, 4.2);
    cab.rotation.y = 0;
    // heat-sink fins
    for (let i = 0; i < 7; i++) cab.add(box(.05, .95, .07, material(0x2b3138, { metalness: .6 }), { pos: [-.85, 1.35, -.24 + i * .08] }));
    for (const x of [-.5, -.18, .14, .46]) cab.add(cylinder(.05, .05, .1, material(0x1f262c), { pos: [x, .06, .3], rx: Math.PI / 2, segments: 8 }));
    const disp = new Display(.98, .56, 340);
    disp.mesh.position.set(-.03, 1.72, .416);
    cab.add(disp.mesh);
    this.inverterDisplay = disp;
    this.inverterLed = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), emissive(0x3ce58b, 2));
    this.inverterLed.position.set(.55, 2.16, .416);
    cab.add(this.inverterLed);
    // AC output terminal shroud
    cab.add(box(.5, .3, .18, material(0x2c353d, { metalness: .5 }), { pos: [.44, .85, .34] }));
    cab.add(box(.34, .13, .06, material(0x1b232a), { pos: [.44, .85, .44], cast: false }));
    this.cat.cabinets.add(cab);
    this.addObject(cab, {
      id: 'inverter', label: 'Hybrid Inverter', kind: 'inverter', iconName: 'inverter',
      description: '5 kW pure sine wave inverter · 230 V AC 50 Hz output with 94% conversion efficiency.',
    });
  }

  /* ---------------- Distribution panel ---------------- */
  buildDistribution() {
    const g = group('distribution');
    g.position.set(13.6, 0, -1.0);
    const steel = material(0x39424b, { metalness: .5, roughness: .45 });
    g.add(box(.1, 1.25, .1, material(0x5b6670, { metalness: .6 }), { pos: [-.62, .62, -.12] }));
    g.add(box(.1, 1.25, .1, material(0x5b6670, { metalness: .6 }), { pos: [.62, .62, -.12] }));
    g.add(roundedBox(1.5, 1.35, .44, steel, { pos: [0, 1.9, 0], radius: .03 }));
    g.add(box(1.36, 1.2, .02, material(0x424b54, { metalness: .4 }), { pos: [0, 1.9, .23] }));
    this.distributionLevers = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 6; c++) {
        const mat = new THREE.MeshStandardMaterial({ color: 0x3ce58b, emissive: 0x3ce58b, emissiveIntensity: .35, roughness: .55 });
        const lever = box(.13, .2, .04, mat, { pos: [-.5 + c * .2, 2.1 - r * .26, .245], cast: false });
        g.add(lever);
        this.distributionLevers.push(mat);
      }
    }
    g.add(box(1.25, .05, .03, material(0x8c6a33, { metalness: .7 }), { pos: [0, 1.44, .245], cast: false }));
    g.add(cylinder(.06, .06, .07, material(0x9aa6b0, { metalness: .8 }), { pos: [-.6, 1.32, .24], rx: Math.PI / 2, segments: 10 }));
    // live bus label
    const lbl = textSprite('AC DISTRIBUTION · 230 V', { size: 24, scale: .5, color: '#cfe4f2', bg: 'rgba(6,14,20,.8)', border: 'rgba(70,169,255,.35)' });
    lbl.position.set(0, 2.72, 0);
    lbl.visible = this.labelsVisible;
    g.add(lbl);
    this.cat.cabinets.add(g);
    this.addObject(g, {
      id: 'distribution', label: 'AC Distribution Panel', kind: 'distribution', iconName: 'equipment',
      description: 'Breaker panel distributing inverter output to the utility load centre.',
    });
  }

  /* ---------------- Office Load Centre ---------------- */
  buildLoadCentre() {
    const bx = 9.5, bz = -8.0;
    const wallMat = material(0x4a5259, { metalness: .12, roughness: .78 });
    const trim = material(0x7d8a94, { metalness: .45, roughness: .42 });
    const glassM = glass(0xa8d4e8, .3);
    const carpetMat = material(0x2d3a45, { roughness: .95, metalness: .02 });
    const deskMat = material(0x5d4a35, { metalness: .1, roughness: .85 });
    const metalFrameMat = material(0x3d444c, { metalness: .65, roughness: .35 });
    const screenMat = material(0x1a2a3a, { roughness: .1, metalness: .05 });
    const screenGlowMat = new THREE.MeshBasicMaterial({ color: 0x4ecdc4, transparent: true, opacity: .15 });
    const chairMat = material(0x1f252d, { metalness: .05, roughness: .9 });
    const whiteboardMat = material(0xf5f5f0, { roughness: .98, metalness: 0 });

    // ---- Building shell ----
    const walls = group('office-walls');
    walls.position.set(bx, 0, bz);
    // back and side walls
    walls.add(box(6.4, 3.0, .18, wallMat, { pos: [0, 1.5, -2.5] }));
    walls.add(box(.18, 3.0, 5.2, wallMat, { pos: [-3.1, 1.5, 0] }));
    walls.add(box(.18, 3.0, 5.2, wallMat, { pos: [3.1, 1.5, 0] }));
    // front wall with windows + door
    walls.add(box(1.0, 3.0, .18, wallMat, { pos: [-2.7, 1.5, 2.5] }));
    walls.add(box(1.0, .8, .18, wallMat, { pos: [-1.9, .4, 2.5] }));
    walls.add(box(1.0, .8, .18, wallMat, { pos: [-1.9, 2.6, 2.5] }));
    walls.add(box(.45, 3.0, .18, wallMat, { pos: [1.125, 1.5, 2.5] }));
    walls.add(box(1.0, .8, .18, wallMat, { pos: [1.85, 2.6, 2.5] }));
    walls.add(box(.85, 3.0, .18, wallMat, { pos: [2.775, 1.5, 2.5] }));
    // large window glazing
    walls.add(box(1.6, 1.5, .025, glassM, { pos: [-1.9, 1.6, 2.51], cast: false }));
    walls.add(box(1.0, 1.5, .025, glassM, { pos: [1.85, 1.6, 2.51], cast: false }));
    // window frames
    walls.add(box(1.8, .08, .22, trim, { pos: [-1.9, .8, 2.51] }));
    walls.add(box(1.8, .08, .22, trim, { pos: [-1.9, 2.4, 2.51] }));
    walls.add(box(1.2, .08, .22, trim, { pos: [1.85, .8, 2.51] }));
    walls.add(box(1.2, .08, .22, trim, { pos: [1.85, 2.4, 2.51] }));
    walls.add(box(.08, 1.7, .2, trim, { pos: [-2.7, 1.6, 2.51] }));
    walls.add(box(.08, 1.7, .2, trim, { pos: [-1.1, 1.6, 2.51] }));
    walls.add(box(.08, 1.7, .2, trim, { pos: [1.35, 1.6, 2.51] }));
    walls.add(box(.08, 1.7, .2, trim, { pos: [2.35, 1.6, 2.51] }));
    // door
    walls.add(box(.96, 2.2, .08, material(0x2f3a44, { metalness: .4, roughness: .5 }), { pos: [1.85, 1.1, 2.52] }));
    walls.add(box(.42, .52, .02, glassM, { pos: [1.85, 1.66, 2.57], cast: false }));
    walls.add(cylinder(.025, .025, .14, trim, { pos: [1.45, 1.05, 2.58], rz: Math.PI / 2, segments: 8 }));
    // cable entry
    walls.add(box(.44, .44, .06, material(0x2c353d), { pos: [-2.0, .3, 2.6] }));
    walls.add(cylinder(.06, .06, .18, material(0x1e262d), { pos: [2.5, .24, 2.6], rx: Math.PI / 2, segments: 8 }));
    this.cat.walls.add(walls);
    this.scene.addCollider(walls);
    this.addObject(walls, {
      id: 'load-building', label: 'Office Building', kind: 'building', iconName: 'inventory',
      description: 'Modern office facility with workstations, meeting room, server rack and kitchen.',
    });

    // ---- Roof with HVAC units ----
    const roof = group('office-roof');
    roof.position.set(bx, 0, bz);
    roof.add(box(6.9, .2, 5.7, material(0x3d454c, { metalness: .3, roughness: .55 }), { pos: [0, 3.1, 0] }));
    for (const [x, z, w, d] of [[0, -2.8, 6.9, .16], [0, 2.8, 6.9, .16], [-3.4, 0, .16, 5.7], [3.4, 0, .16, 5.7]]) {
      roof.add(box(w, .3, d, trim, { pos: [x, 3.29, z] }));
    }
    // HVAC units on roof
    for (const [x, z] of [[-2.0, -1.5], [2.0, -1.5], [0, 1.8]]) {
      const hvac = group('roof-hvac');
      hvac.position.set(x, 3.35, z);
      hvac.add(box(1.8, .5, 1.4, material(0x6d7880, { metalness: .4 }), { pos: [0, .25, 0] }));
      hvac.add(box(1.6, .08, .1, material(0x3d444c, { metalness: .5 }), { pos: [0, .55, 0], cast: false }));
      const fan = group('hvac-fan');
      fan.position.set(0, .3, 0);
      for (let i = 0; i < 4; i++) {
        const blade = box(.04, .2, .02, material(0x8a97a2, { metalness: .6 }), { pos: [0, 0, 0] });
        blade.rotation.z = i * Math.PI / 4;
        fan.add(blade);
      }
      hvac.add(fan);
      hvac.userData.fan = fan;
      roof.add(hvac);
      this.roofHvacFans = this.roofHvacFans || [];
      this.roofHvacFans.push(fan);
    }
    // solar skylights
    roof.add(box(2.5, .04, 1.8, glass(0x9fd0e6, .35), { pos: [0, 3.23, -1.5], cast: false }));
    roof.add(box(1.5, .04, 1.2, glass(0x9fd0e6, .35), { pos: [0, 3.23, 1.8], cast: false }));
    this.cat.roof.add(roof);

    // ---- Floor carpet ----
    this.cat.floor.add(plane(6.0, 4.8, carpetMat, { pos: [bx, .02, bz], receive: true }));

    // ---- Interior office layout ----
    this.officeDesks = [];
    this.officeComputers = [];
    this.officeChairs = [];
    this.officeLights = [];
    this.officeLightMats = [];

    // Reception area (near entrance)
    this._buildReception(bx, bz, deskMat, metalFrameMat, screenMat, screenGlowMat, chairMat);

    // Open plan workstations (4 desks)
    this._buildWorkstations(bx, bz, deskMat, metalFrameMat, screenMat, screenGlowMat, chairMat);

    // Meeting room
    this._buildMeetingRoom(bx, bz, deskMat, metalFrameMat, screenMat, screenGlowMat, chairMat, whiteboardMat);

    // Server/Network rack room
    this._buildServerRoom(bx, bz, metalFrameMat);

    // Kitchen/break area
    this._buildKitchen(bx, bz, deskMat, metalFrameMat);

    // HVAC vents and ceiling lights
    this._buildCeilingSystems(bx, bz, trim);

    // Load control panel (moved to server room)
    const cp = makeControlCabinet(.9, 1.7, .45, { color: 0x333c45 });
    cp.position.set(12.8, 0, -11.2);
    cp.rotation.y = Math.PI / 2;
    const cpDisp = new Display(.56, .3, 192);
    cpDisp.mesh.position.set(0, 1.25, .236);
    cp.add(cpDisp.mesh);
    this.loadDisplay = cpDisp;
    this.cat.loads.add(cp);
    this.addObject(cp, { id: 'load-control', label: 'Office Load Control Panel', kind: 'loadcontrol', iconName: 'sliders', description: 'Main breaker panel and energy meter for office circuits.' });

    // Load bank (testing equipment in server room)
    this.loadBankMats = [];
    const bank = group('loadbank');
    bank.position.set(12.5, 0, -9.8);
    bank.add(box(1.9, .1, .5, material(0x2a323a, { metalness: .4 }), { pos: [0, .05, 0] }));
    bank.add(box(2.0, .06, .5, material(0x232b32, { metalness: .45 }), { pos: [0, 1.02, 0] }));
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x803028, emissive: 0xff5a30, emissiveIntensity: .04, roughness: .55, metalness: .2 });
      bank.add(cylinder(.085, .085, .6, mat, { pos: [-.65 + i * .26, .62, 0], segments: 10 }));
      bank.add(box(.05, .06, .05, material(0x8794a0, { metalness: .7 }), { pos: [-.65 + i * .26, .95, 0], cast: false }));
      this.loadBankMats.push(mat);
    }
    bank.add(box(1.8, .34, .06, material(0x2c353d, { metalness: .5 }), { pos: [0, .5, .27], cast: false }));
    this.cat.loads.add(bank);
    this.addObject(bank, { id: 'load-bank', label: 'Resistive Load Bank', kind: 'loadbank', iconName: 'bolt', description: 'Commissioning load bank used to absorb surplus generation and test the inverter.' });
  }

  _buildReception(bx, bz, deskMat, metalFrameMat, screenMat, screenGlowMat, chairMat) {
    const desk = group('reception-desk');
    desk.position.set(bx + 2.0, 0, bz + 2.0);
    desk.add(box(1.8, .75, .8, deskMat, { pos: [0, .375, 0] }));
    desk.add(box(1.8, .08, .8, material(0x4a555e, { metalness: .5 }), { pos: [0, .79, 0] }));
    // Reception computer
    const monitor = group('reception-monitor');
    monitor.position.set(0, 1.0, .3);
    monitor.add(box(.55, .35, .04, screenMat, { pos: [0, .2, 0] }));
    monitor.add(box(.55, .35, .02, screenGlowMat, { pos: [0, .2, .03], cast: false }));
    monitor.add(cylinder(.03, .03, .3, metalFrameMat, { pos: [0, -.1, .15] }));
    desk.add(monitor);
    desk.add(cylinder(.08, .08, .15, metalFrameMat, { pos: [-.6, 1.0, .3] }));
    desk.add(cylinder(.08, .08, .15, metalFrameMat, { pos: [.6, 1.0, .3] }));
    // Chair
    const chair = group('reception-chair');
    chair.position.set(0, 0, 1.1);
    chair.add(box(.5, .05, .5, chairMat, { pos: [0, .45, 0] }));
    chair.add(box(.5, .5, .06, chairMat, { pos: [0, .72, -.22] }));
    chair.add(cylinder(.02, .02, .45, metalFrameMat, { pos: [-.22, .22, .22], rx: -Math.PI / 6 }));
    chair.add(cylinder(.02, .02, .45, metalFrameMat, { pos: [.22, .22, .22], rx: -Math.PI / 6 }));
    desk.add(chair);
    this.cat.loads.add(desk);
    this.addObject(desk, { id: 'reception-desk', label: 'Reception Desk', kind: 'load', iconName: 'computers', description: 'Reception workstation with computer and visitor check-in system.' });
    this.officeDesks.push({ group: desk, loadId: 'computers' });
  }

  _buildWorkstations(bx, bz, deskMat, metalFrameMat, screenMat, screenGlowMat, chairMat) {
    const positions = [
      { x: bx - 2.5, z: bz - 1.0, rotation: 0 },
      { x: bx - 2.5, z: bz + 1.0, rotation: 0 },
      { x: bx + 0.5, z: bz - 1.0, rotation: 0 },
      { x: bx + 0.5, z: bz + 1.0, rotation: 0 },
    ];

    positions.forEach((pos, idx) => {
      const desk = group(`workstation-${idx}`);
      desk.position.set(pos.x, 0, pos.z);
      desk.rotation.y = pos.rotation;
      desk.add(box(1.4, .75, .7, deskMat, { pos: [0, .375, 0] }));
      desk.add(box(1.4, .08, .7, material(0x4a555e, { metalness: .5 }), { pos: [0, .79, 0] }));
      // Cable management tray
      desk.add(box(1.2, .06, .15, metalFrameMat, { pos: [0, .05, .35] }));

      // Dual monitor setup
      for (const mx of [-.35, .35]) {
        const monitor = group(`monitor-${idx}-${mx > 0 ? 'right' : 'left'}`);
        monitor.position.set(mx, 1.0, .2);
        const screen = box(.45, .3, .04, screenMat, { pos: [0, .18, 0] });
        monitor.add(screen);
        monitor.add(box(.45, .3, .02, screenGlowMat, { pos: [0, .18, .03], cast: false }));
        monitor.add(cylinder(.025, .025, .25, metalFrameMat, { pos: [0, -.08, .12] }));
        desk.add(monitor);
        this.officeComputers.push({ screen, glowMat: screenGlowMat, loadId: 'workstations' });
      }

      // Keyboard/tray
      desk.add(box(.55, .03, .2, material(0x2a3238), { pos: [0, .85, .5] }));

      // Office chair
      const chair = group(`chair-${idx}`);
      chair.position.set(0, 0, 1.0);
      chair.add(box(.5, .05, .5, chairMat, { pos: [0, .45, 0] }));
      chair.add(box(.5, .5, .06, chairMat, { pos: [0, .72, -.22] }));
      chair.add(cylinder(.02, .02, .45, metalFrameMat, { pos: [-.22, .22, .22], rx: -Math.PI / 6 }));
      chair.add(cylinder(.02, .02, .45, metalFrameMat, { pos: [.22, .22, .22], rx: -Math.PI / 6 }));
      desk.add(chair);
      this.officeChairs.push(chair);

      // Desk lamp
      const lamp = group(`desk-lamp-${idx}`);
      lamp.position.set(-.5, 1.1, -.2);
      const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff5e0, emissive: 0xffe8c0, emissiveIntensity: 1.5 });
      lamp.add(cylinder(.025, .025, .4, metalFrameMat, { pos: [0, .2, 0] }));
      lamp.add(cylinder(.08, .04, .08, lampMat, { pos: [0, .6, 0] }));
      lamp.add(new THREE.PointLight(0xffe8c0, 0.8, 3, 2));
      desk.add(lamp);
      this.officeLights.push(lamp);
      this.officeLightMats.push(lampMat);

      this.cat.loads.add(desk);
      this.addObject(desk, { id: `workstation-${idx}`, label: `Workstation ${idx + 1}`, kind: 'load', iconName: 'computers', description: 'Dual-monitor workstation with ergonomic chair and task lighting.' });
      this.officeDesks.push({ group: desk, loadId: 'workstations' });
    });
  }

  _buildMeetingRoom(bx, bz, deskMat, metalFrameMat, screenMat, screenGlowMat, chairMat, whiteboardMat) {
    const room = group('meeting-room');
    room.position.set(bx + 2.5, 0, bz - 2.0);
    // Conference table
    room.add(box(2.2, .75, 1.0, deskMat, { pos: [0, .375, 0] }));
    room.add(box(2.2, .08, 1.0, material(0x4a555e, { metalness: .5 }), { pos: [0, .79, 0] }));
    // Center piece
    room.add(cylinder(.15, .15, .15, material(0x3a4a55, { metalness: .5 }), { pos: [0, .87, 0] }));
    // TV screen on wall
    const tv = group('meeting-tv');
    tv.position.set(0, 1.6, .65);
    tv.add(box(1.4, .8, .05, screenMat, { pos: [0, 0, 0] }));
    tv.add(box(1.38, .78, .03, screenGlowMat, { pos: [0, 0, .04], cast: false }));
    room.add(tv);
    // Chairs around table (6)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const chair = group(`meeting-chair-${i}`);
      chair.position.set(Math.sin(angle) * 1.3, 0, Math.cos(angle) * 1.3);
      chair.rotation.y = angle + Math.PI;
      chair.add(box(.45, .05, .45, chairMat, { pos: [0, .45, 0] }));
      chair.add(box(.45, .45, .05, chairMat, { pos: [0, .7, -.2] }));
      chair.add(cylinder(.02, .02, .4, metalFrameMat, { pos: [-.2, .22, .2], rx: -Math.PI / 6 }));
      chair.add(cylinder(.02, .02, .4, metalFrameMat, { pos: [.2, .22, .2], rx: -Math.PI / 6 }));
      room.add(chair);
      this.officeChairs.push(chair);
    }
    // Whiteboard
    const wb = group('whiteboard');
    wb.position.set(0, 1.4, -.6);
    wb.add(box(1.5, 1.0, .02, whiteboardMat, { pos: [0, 0, 0] }));
    wb.add(box(1.54, .04, 1.04, metalFrameMat, { pos: [0, 0, -.01] }));
    room.add(wb);
    // Meeting room light
    const ml = group('meeting-light');
    ml.position.set(0, 2.8, 0);
    const mlMat = new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffe6b0, emissiveIntensity: 1.0 });
    ml.add(box(1.0, .05, .2, mlMat, { pos: [0, 0, 0], cast: false }));
    ml.add(new THREE.PointLight(0xffe2ae, 1.5, 6, 2));
    room.add(ml);
    this.officeLights.push(ml);
    this.officeLightMats.push(mlMat);

    this.cat.loads.add(room);
    this.addObject(room, { id: 'meeting-room', label: 'Meeting Room', kind: 'load', iconName: 'meeting', description: 'Conference room with 6-seat table, display screen and whiteboard.' });
    this.officeDesks.push({ group: room, loadId: 'office_lighting' });
  }

  _buildServerRoom(bx, bz, metalFrameMat) {
    const rack = group('server-rack');
    rack.position.set(bx + 3.0, 0, bz - 2.0);
    // Server rack cabinet
    rack.add(box(.8, 2.5, .6, material(0x1a1f26, { metalness: .6 }), { pos: [0, 1.25, 0] }));
    rack.add(box(.82, 2.5, .04, material(0x3d444c, { metalness: .7 }), { pos: [0, 1.25, .32] }));
    // Rack units (visual)
    for (let i = 0; i < 12; i++) {
      const ru = group(`rack-unit-${i}`);
      ru.position.set(0, 2.4 - i * .2, .31);
      ru.add(box(.7, .18, .02, material(0x2a3038, { metalness: .5 }), { pos: [0, 0, 0] }));
      // Blinking LED
      const led = new THREE.Mesh(new THREE.SphereGeometry(.015, 6, 4), new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }));
      led.position.set(-.3, 0, .02);
      ru.add(led);
      ru.userData.led = led;
      rack.add(ru);
      this.serverRackLeds = this.serverRackLeds || [];
      this.serverRackLeds.push(led);
    }
    // Cooling fan on top
    const rackFan = group('rack-fan');
    rackFan.position.set(0, 2.5, 0);
    for (let i = 0; i < 4; i++) {
      const blade = box(.04, .2, .02, material(0x8a97a2, { metalness: .6 }), { pos: [0, 0, 0] });
      blade.rotation.z = i * Math.PI / 4;
      rackFan.add(blade);
    }
    rack.add(rackFan);
    this.serverRackFan = rackFan;
    // UPS unit next to rack
    const ups = group('ups-unit');
    ups.position.set(-1.0, 0, 0);
    ups.add(box(.5, .6, .5, material(0x2a3038, { metalness: .5 }), { pos: [0, .3, 0] }));
    ups.add(box(.4, .1, .3, material(0x3d444c, { metalness: .7 }), { pos: [0, .65, 0] }));
    ups.add(box(.1, .06, .06, new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }), { pos: [0, .65, .18], cast: false }));
    rack.add(ups);

    this.cat.loads.add(rack);
    this.addObject(rack, { id: 'server-rack', label: 'Server & Network Rack', kind: 'load', iconName: 'server', description: '12U rack with network switches, firewall, NAS and UPS backup.' });
    this.officeDesks.push({ group: rack, loadId: 'server_rack' });
  }

  _buildKitchen(bx, bz, deskMat, metalFrameMat) {
    const kitchen = group('kitchen-area');
    kitchen.position.set(bx - 2.8, 0, bz + 2.0);
    // Counter
    kitchen.add(box(1.6, .9, .6, deskMat, { pos: [0, .45, -.3] }));
    kitchen.add(box(1.6, .08, .6, material(0x4a555e, { metalness: .5 }), { pos: [0, .94, -.3] }));
    // Upper cabinets
    kitchen.add(box(1.6, .6, .35, deskMat, { pos: [0, 1.8, -.55] }));
    // Coffee machine
    const coffee = group('coffee-machine');
    coffee.position.set(-.4, 1.0, -.2);
    coffee.add(box(.25, .35, .25, material(0x2a2f36, { metalness: .5 }), { pos: [0, .175, 0] }));
    coffee.add(box(.1, .2, .15, material(0x3d444c, { metalness: .7 }), { pos: [-.12, .3, 0] }));
    coffee.add(box(.06, .06, .06, new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }), { pos: [0, .38, .1], cast: false }));
    kitchen.add(coffee);
    this.coffeeMachine = coffee;
    // Microwave
    const microwave = group('microwave');
    microwave.position.set(.4, 1.0, -.2);
    microwave.add(box(.35, .25, .3, material(0x3d444c, { metalness: .6 }), { pos: [0, .125, 0] }));
    microwave.add(box(.25, .15, .02, material(0x1a2a3a), { pos: [.1, .125, .16], cast: false }));
    microwave.add(box(.03, .03, .03, new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }), { pos: [.1, .125, .17], cast: false }));
    kitchen.add(microwave);
    this.microwave = microwave;
    // Fridge
    const fridge = group('fridge');
    fridge.position.set(.9, 0, -.5);
    fridge.add(box(.55, 1.6, .55, material(0xe8eef2, { metalness: .05, roughness: .95 }), { pos: [0, .8, 0] }));
    fridge.add(box(.04, .04, .06, new THREE.MeshBasicMaterial({ color: 0x4ecdc4 }), { pos: [.28, 1.4, .28], cast: false }));
    kitchen.add(fridge);
    this.fridge = fridge;
    // Sink
    const sink = group('sink');
    sink.position.set(-.9, .9, -.1);
    sink.add(box(.4, .1, .35, material(0x8a95a0, { metalness: .8 }), { pos: [0, .05, 0] }));
    sink.add(cylinder(.03, .03, .15, metalFrameMat, { pos: [.1, .15, 0], rx: Math.PI / 2 }));
    kitchen.add(sink);

    this.cat.loads.add(kitchen);
    this.addObject(kitchen, { id: 'kitchen-area', label: 'Kitchen / Break Area', kind: 'load', iconName: 'coffee', description: 'Coffee machine, microwave, refrigerator and sink.' });
    this.officeDesks.push({ group: kitchen, loadId: 'kitchen' });
  }

  _buildCeilingSystems(bx, bz, trim) {
    // Ceiling grid with LED panels and HVAC vents
    const lightPanelMat = new THREE.MeshStandardMaterial({ color: 0xfff8e8, emissive: 0xfff0d0, emissiveIntensity: 1.0 });
    const ventMat = material(0x7d8a94, { metalness: .5, roughness: .4 });

    // LED light panels (4x2 grid)
    for (let x = -2.0; x <= 2.0; x += 2.0) {
      for (let z = -1.5; z <= 1.5; z += 1.5) {
        const panel = group(`ceiling-light-${x}-${z}`);
        panel.position.set(bx + x, 2.98, bz + z);
        panel.add(box(1.2, .04, .6, lightPanelMat, { pos: [0, 0, 0], cast: false }));
        this.cat.loads.add(panel);
        this.officeLights.push(panel);
        this.officeLightMats.push(lightPanelMat);
      }
    }
    // HVAC supply vents
    for (const [x, z] of [[-2.5, -2.0], [2.5, -2.0], [0, 2.0]]) {
      const vent = group(`hvac-vent-${x}-${z}`);
      vent.position.set(bx + x, 2.98, bz + z);
      vent.add(box(.5, .02, .3, ventMat, { pos: [0, 0, 0], cast: false }));
      for (let i = 0; i < 4; i++) vent.add(box(.05, .02, .25, ventMat, { pos: [-.2 + i * .13, 0, 0], cast: false }));
      this.cat.loads.add(vent);
      this.hvacVents = this.hvacVents || [];
      this.hvacVents.push(vent);
    }
    // Return air grille
    const returnGrille = group('return-air');
    returnGrille.position.set(bx, 2.98, bz);
    returnGrille.add(box(1.0, .02, .5, ventMat, { pos: [0, 0, 0], cast: false }));
    for (let i = 0; i < 8; i++) returnGrille.add(box(.08, .02, .4, ventMat, { pos: [-.35 + i * .1, 0, 0], cast: false }));
    this.cat.loads.add(returnGrille);
  }

  /* ---------------- Meter boxes ---------------- */
  buildMeter(pos, id, label, title, unit, color) {
    const g = group(id);
    g.position.set(pos[0], 0, pos[1]);
    const steel = material(0x5e6a74, { metalness: .6, roughness: .42 });
    g.add(cylinder(.055, .07, 1.15, steel, { pos: [0, .58, 0] }));
    g.add(box(.5, .58, .2, material(0x39434d, { metalness: .45, roughness: .5 }), { pos: [0, 1.35, 0] }));
    g.add(box(.44, .5, .02, material(0x2a323b, { metalness: .4 }), { pos: [0, 1.35, .11] }));
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(.38, .38), new THREE.MeshBasicMaterial({ map: dialTexture(title, unit, color), toneMapped: false }));
    dial.position.set(0, 1.36, .125);
    g.add(dial);
    const needle = box(.014, .16, .006, material(0x151b20, { roughness: .5 }), { pos: [0, .07, 0], cast: false });
    needle.geometry.translate(0, .08, 0);
    const pivot = group('needle');
    pivot.position.set(0, 1.3, .135);
    pivot.add(needle);
    g.add(pivot);
    const tag = textSprite(label, { size: 24, scale: .4, color: '#cfe4f2', bg: 'rgba(6,14,20,.78)', border: 'rgba(70,169,255,.3)' });
    tag.position.set(0, 1.78, .05);
    tag.visible = this.labelsVisible;
    g.add(tag);
    this.cat.equipment.add(g);
    this.addObject(g, { id, label, kind: 'meter', iconName: 'gauge', description: `${title} analog metering point.` });
    this.meterNeedles.push({ pivot, get: title === 'PV ARRAY' ? () => this.solarPower / 7000 : () => this.loadServed / 5000 });
    return g;
  }

  buildMeters() {
    this.buildMeter([2.5, 8.5], 'pv-meter', 'PV METER', 'PV ARRAY', 'kW', '#ffc247');
    this.buildMeter([12.0, 8.5], 'load-meter', 'LOAD METER', 'AC LOAD', 'kW', '#46a9ff');
  }

  /* =========================================================
     Cable trays, conduits & animated energy flow
     ========================================================= */
  buildCableNetwork() {
    // combiner box at the array edge
    const combiner = group('combiner');
    combiner.position.set(0.7, 0, 1.3);
    combiner.add(box(.1, .85, .1, material(0x5b6670, { metalness: .6 }), { pos: [-.22, .42, 0] }));
    combiner.add(box(.1, .85, .1, material(0x5b6670, { metalness: .6 }), { pos: [.22, .42, 0] }));
    combiner.add(roundedBox(.8, .6, .36, material(0x39434c, { metalness: .45, roughness: .5 }), { pos: [0, .82, 0], radius: .03 }));
    combiner.add(box(.68, .46, .02, material(0x2f3841, { metalness: .4 }), { pos: [0, .82, .19], cast: false }));
    for (let i = 0; i < 3; i++) combiner.add(box(.16, .1, .04, material(i === 0 ? 0x8a5a2a : 0x7a858f), { pos: [-.22 + i * .22, .9, .205], cast: false }));
    combiner.add(box(.5, .06, .02, material(0x1a2128), { pos: [0, .64, .2], cast: false }));
    for (const x of [-.25, 0, .25]) combiner.add(cylinder(.04, .04, .1, material(0x1b232a), { pos: [x, .5, .1], segments: 8 }));
    this.cat.cabinets.add(combiner);
    this.addObject(combiner, {
      id: 'combiner', label: 'PV String Combiner', kind: 'combiner', iconName: 'panel',
      description: 'Combines three PV strings with per-string fusing before the charge controller.',
    });

    // animated energy-flow routes (dots follow these exact curves)
    const add = (opts) => { const f = new EnergyFlow(this, opts); this.flows.push(f); return f; };
    this.flowGeneration = add({ id: 'generation', color: FLOW.generation, maxPower: 7200, count: 16, dotSize: .06, radius: .05, speed: 1.15, points: [[-1.4, 1.02, 1.1], [.7, .92, 1.3], [2.35, .4, 2.6], [3.9, .4, 4.2], [4.7, 1.2, 4.88]] });
    this.flowCharging = add({ id: 'charging', color: FLOW.charging, maxPower: 5200, count: 10, dotSize: .055, radius: .045, speed: 1.45, points: [[4.95, 1.1, 4.85], [5.9, .4, 4.55], [6.9, .4, 4.1], [7.35, 1.1, 4.0]] });
    this.flowDischarging = add({ id: 'discharging', color: FLOW.discharging, maxPower: 5200, count: 8, dotSize: .055, radius: .045, speed: 1.4, points: [[11.25, 1.08, 4.0], [12.2, .4, 3.96], [13.3, 1.16, 4.2]] });
    this.flowLoad = add({ id: 'load', color: FLOW.load, maxPower: 5200, count: 12, dotSize: .055, radius: .045, speed: 1.3, points: [[13.62, 1.3, 4.05], [14.18, .48, 2.4], [13.98, .48, .1], [13.72, 1.08, -.62]] });
    this.flowDeliver = add({ id: 'deliver', color: FLOW.load, maxPower: 5200, count: 14, dotSize: .05, radius: .045, speed: 1.2, points: [[13.45, 1.0, -1.32], [13.2, .42, -2.4], [12.4, .4, -4.9], [11.2, .4, -6.05], [10.1, 1.22, -6.3]] });

    // elevated cable trays following the routes
    this.buildTray([[.7, .3, 1.3], [2.35, .3, 2.6], [3.9, .3, 4.2]]);
    this.buildTray([[5.05, .3, 4.6], [6.9, .3, 4.1], [7.35, .3, 4.0], [11.25, .3, 4.0], [12.2, .3, 3.96], [13.2, .3, 4.1]]);
    this.buildTray([[13.85, .3, 3.9], [14.18, .3, 2.4], [13.98, .3, .1], [13.72, .3, -.7], [13.2, .3, -2.4], [12.4, .3, -4.9], [11.2, .3, -6.05], [10.1, .3, -6.3]]);

    // earthing rods and green earth conductors
    const earthMat = material(0x2f6b46, { metalness: .4, roughness: .6 });
    const rodMat = material(0x8c6a33, { metalness: .7, roughness: .4 });
    for (const [x, z] of [[3.4, 6.6], [12.6, 7.1], [13.9, -2.6]]) {
      this.cat.wiring.add(cylinder(.03, .03, 1.2, rodMat, { pos: [x, .18, z], segments: 8 }));
      this.cat.wiring.add(pipe([[x, .7, z], [x + .4, .12, z], [x + 1.3, .12, z]], .022, earthMat, { radial: 5, segs: 14 }));
    }
    // spare cable drums near the plant room
    for (const [x, z] of [[16.4, 6.2], [17.0, 4.4]]) {
      const drum = cylinder(.5, .5, .4, material(0x2b333b, { metalness: .3, roughness: .7 }), { pos: [x, .5, z], rz: Math.PI / 2, segments: 18 });
      this.cat.equipment.add(drum);
      this.cat.equipment.add(cylinder(.16, .16, .44, material(0x5c666f), { pos: [x, .5, z], rz: Math.PI / 2, segments: 10 }));
    }
  }

  buildTray(points) {
    const baseMat = material(0x252d35, { metalness: .5, roughness: .5 });
    const railMat = material(0x39434d, { metalness: .55, roughness: .45 });
    const legMat = material(0x3c464f, { metalness: .55, roughness: .45 });
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const seg = group('tray-seg');
      seg.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
      seg.rotation.y = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]) + .06;
      seg.add(box(len, .035, .44, baseMat, { pos: [0, 0, 0] }));
      seg.add(box(len, .15, .04, railMat, { pos: [0, .07, .21] }));
      seg.add(box(len, .15, .04, railMat, { pos: [0, .07, -.21] }));
      this.cat.wiring.add(seg);
      this.cat.wiring.add(box(.07, a[1], .07, legMat, { pos: [a[0], a[1] / 2, a[2]] }));
      this.cat.wiring.add(box(.24, .04, .24, legMat, { pos: [a[0], .02, a[2]] }));
    }
    const last = points[points.length - 1];
    this.cat.wiring.add(box(.07, last[1], .07, legMat, { pos: [last[0], last[1] / 2, last[2]] }));
  }

  /* ---------------- Site lighting ---------------- */
  buildLighting() {
    const spots = [[-2.4, 0, 8.0, 0], [16.4, 0, -5.2, Math.PI]];
    spots.forEach(([x, z, ry], i) => {
      const lamp = makeLampPost(6.0);
      lamp.position.set(x, 0, z);
      lamp.rotation.y = ry;
      this.cat.lighting.add(lamp);
      this.lampLights.push({ light: lamp.userData.light, mat: lamp.userData.lampMaterial, base: 7 });
      this.addObject(lamp, {
        id: `lamp-${i + 1}`, label: `Site Light L-${i + 1}`, kind: 'lamp', iconName: 'light',
        description: 'LED area light with dusk-to-dawn photocell control.',
      });
    });
  }

  /* ---------------- Signage ---------------- */
  buildSignage() {
    const mainSign = group('sign-main');
    mainSign.position.set(-4.2, 0, 11.2);
    mainSign.add(box(.12, 2.3, .12, material(0x6a7681, { metalness: .6 }), { pos: [-2.45, 1.15, 0] }));
    mainSign.add(box(.12, 2.3, .12, material(0x6a7681, { metalness: .6 }), { pos: [2.45, 1.15, 0] }));
    const board = signBoard('NEXUS SOLAR FARM · SOL-05', 5.6, .8, { bg: '#0a1018', border: '#a98bff', color: '#e9e2ff' });
    board.position.set(0, 2.05, .05);
    mainSign.add(board);
    const sub = signBoard('PHOTOVOLTAIC + BATTERY STORAGE', 4.5, .4, { bg: '#0b1220', border: '#46a9ff', color: '#c7e4ff' });
    sub.position.set(0, 1.42, .06);
    mainSign.add(sub);
    this.cat.signs.add(mainSign);
    this.addObject(mainSign, {
      id: 'sign-main', label: 'Facility Sign', kind: 'sign', iconName: 'sign',
      description: 'Site identification signage for the grid-independent solar plant.',
    });

    for (const row of ARRAY_ROWS) {
      const s = signBoard(`ARRAY ${row.id}`, 1.5, .4, { bg: '#0a121a', border: '#ffc247', color: '#ffe4a8' });
      s.position.set(-13.9, 1.45, row.z);
      s.rotation.y = Math.PI / 2;
      this.cat.signs.add(s);
      this.cat.signs.add(box(.08, 1.5, .08, material(0x6a7681, { metalness: .6 }), { pos: [-13.94, .75, row.z] }));
    }
    const extra = [
      ['HIGH VOLTAGE · DC', 1.9, .36, [4.8, 2.42, 5.18], 0, '#2a0c0c', '#ff6b6b'],
      ['BATTERY STORAGE', 1.9, .38, [9.1, 2.05, 4.52], 0, '#071a12', '#3ce58b'],
      ['INVERTER · 5 kW', 1.6, .36, [13.4, 2.68, 4.62], 0, '#0a1220', '#46a9ff'],
      ['UTILITY LOAD CENTRE', 2.8, .44, [9.5, 3.35, -5.34], 0, '#0a141c', '#a98bff'],
    ];
    for (const [text, w, h, pos, ry, bg, border] of extra) {
      const s = signBoard(text, w, h, { bg, border, color: '#e6f2fa' });
      s.position.set(pos[0], pos[1], pos[2]);
      s.rotation.y = ry;
      this.cat.signs.add(s);
    }
    const hazard = signBoard('DANGER · NO STEP', 1.4, .32, { bg: '#1b1004', border: '#f6b44b', color: '#ffdc9a' });
    hazard.position.set(3.3, 2.5, 4.2);
    hazard.rotation.y = -.5;
    this.cat.signs.add(hazard);
  }

  /* ---------------- Perimeter fence ---------------- */
  buildFence() {
    const postMat = material(0x5a6a76, { metalness: .55, roughness: .5 });
    const railMat = material(0x74848f, { metalness: .5, roughness: .5 });
    const fence = group('perimeter-fence');
    const segments = [
      [[-17, -15.6], [17, -15.6]],
      [[-17, -15.6], [-17, 12.6]],
      [[17, -15.6], [17, 12.6]],
      [[-17, 12.6], [-4.2, 12.6]],
      [[4.6, 12.6], [17, 12.6]],
    ];
    for (const [[x1, z1], [x2, z2]] of segments) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const steps = Math.max(1, Math.ceil(len / 3.4));
      for (let i = 0; i <= steps; i++) {
        const x = x1 + (x2 - x1) * (i / steps);
        const z = z1 + (z2 - z1) * (i / steps);
        fence.add(box(.08, 1.45, .08, postMat, { pos: [x, .72, z] }));
      }
      const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
      const horiz = Math.abs(z2 - z1) < .01;
      fence.add(box(horiz ? len : .06, .06, horiz ? .06 : len, railMat, { pos: [cx, .6, cz] }));
      fence.add(box(horiz ? len : .06, .06, horiz ? .06 : len, railMat, { pos: [cx, 1.2, cz] }));
    }
    this.cat.fencing.add(fence);
    shadowify(fence);
  }

  /* ---------------- Sky, sun, moon, clouds ---------------- */
  buildSky() {
    const tex = canvasTexture(64, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#03060b');
      g.addColorStop(.42, '#071320');
      g.addColorStop(.7, '#0d2133');
      g.addColorStop(.88, '#163348');
      g.addColorStop(1, '#254a60');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(300, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    dome.userData.ignoreFit = true;
    this.scene.world.add(dome);
    this.skyDome = dome;

    this.sunGroup = group('sun');
    this.sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3.0, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c9, toneMapped: false, fog: false }));
    this.sunGroup.add(this.sunDisc);
    const glowTex = radialGlowTexture();
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.sunGlow.scale.set(30, 30, 1);
    this.sunGroup.add(this.sunGlow);
    this.scene.world.add(this.sunGroup);

    this.moonGroup = group('moon');
    this.moonDisc = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), new THREE.MeshBasicMaterial({ color: 0xd6e4f2, toneMapped: false, fog: false }));
    this.moonGroup.add(this.moonDisc);
    const mGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialGlowTexture('rgba(214,232,255,.7)', 'rgba(150,190,235,.28)', 'rgba(120,160,220,0)'),
      transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    mGlow.scale.set(16, 16, 1);
    this.moonGroup.add(mGlow);
    this.scene.world.add(this.moonGroup);

    // stars
    const count = 420;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * .5;
      const r = 280;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r + 10;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xcfe4ff, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false,
    }));
    this.stars.userData.ignoreFit = true;
    this.scene.world.add(this.stars);

    // a few drifting clouds
    this.clouds = [];
    const cloudTex = cloudTexture();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: .2, depthWrite: false, fog: false }));
      c.position.set(-90 + i * 52, 62 + Math.random() * 22, -80 + Math.random() * 60);
      c.scale.set(55 + Math.random() * 30, 20 + Math.random() * 10, 1);
      c.userData.drift = .35 + Math.random() * .3;
      this.scene.world.add(c);
      this.clouds.push(c);
    }
  }

  buildBackground() {
    const bgMat = material(0x0a1219, { roughness: .97, metalness: 0 });
    for (let i = 0; i < 6; i++) {
      const w = 9 + Math.random() * 10, h = 2.4 + Math.random() * 4.2, d = 6 + Math.random() * 6;
      const x = -54 + i * 20 + Math.random() * 5;
      const b = box(w, h, d, bgMat, { pos: [x, h / 2 - .1, -58 - Math.random() * 14], cast: false, receive: false });
      b.userData.ignoreFit = true;
      this.scene.world.add(b);
      const stripe = box(w * .7, .06, .08, new THREE.MeshBasicMaterial({ color: 0x2b7d86, transparent: true, opacity: .28 }), { pos: [x, h * .62, -58 + d / 2 + .1], cast: false });
      this.scene.world.add(stripe);
    }
  }

  /* ---------------- Equipment registry ---------------- */
  buildEquipment() {
    this.addEquipment({
      id: 'pv-array', name: 'Photovoltaic Array', type: 'generation', iconName: 'solar', objectId: 'panel-1',
      status: () => `${this.onlinePanels()}/12 ONLINE`, tone: () => this.solarPower > 100 ? 'ok' : 'muted',
    });
    this.addEquipment({
      id: 'controller', name: 'MPPT Charge Controller', type: 'power electronics', iconName: 'bolt', objectId: 'controller',
      status: () => this.config.controller.failure ? 'FAULT' : this.config.controller.enabled ? (this.config.controller.mode === 'pwm' ? 'PWM' : 'MPPT') : 'OFFLINE',
      tone: () => this.config.controller.failure ? 'danger' : this.config.controller.enabled ? 'ok' : 'warn',
    });
    this.addEquipment({
      id: 'battery-bank', name: 'Battery Bank', type: 'storage', iconName: 'battery', objectId: 'battery-rack',
      status: () => `${fmt(this.batterySoc, 0)}% · ${(this.energyStoredWh() / 1000).toFixed(1)} kWh`,
      tone: () => this.batterySoc < 20 ? 'danger' : this.batterySoc < 40 ? 'warn' : 'ok',
    });
    this.addEquipment({
      id: 'inverter', name: 'Hybrid Inverter', type: 'power conversion', iconName: 'inverter', objectId: 'inverter',
      status: () => this.config.inverter.failure ? 'FAULT' : this.config.inverter.on ? `ON · ${(this.inverterOut / 1000).toFixed(2)} kW` : 'OFFLINE',
      tone: () => this.config.inverter.failure ? 'danger' : this.config.inverter.on ? 'ok' : 'warn',
    });
    this.addEquipment({
      id: 'distribution', name: 'AC Distribution Panel', type: 'distribution', iconName: 'equipment', objectId: 'distribution',
      status: () => this.config.load.enabled ? 'ENERGISED' : 'ISOLATED', tone: () => this.config.load.enabled ? 'ok' : 'warn',
    });
    this.addEquipment({
      id: 'loads', name: 'Connected Loads', type: 'demand', iconName: 'motor', objectId: 'load-building',
      status: () => `${(this.loadServed / 1000).toFixed(2)} / ${(this.loadDemand / 1000).toFixed(2)} kW`,
      tone: () => this.loadDemand > this.threshold('excessLoad', 4300) ? 'warn' : 'ok',
    });
    this.addEquipment({
      id: 'meters', name: 'Revenue Metering', type: 'instrumentation', iconName: 'gauge', objectId: 'pv-meter',
      status: () => 'METERING', tone: () => 'ok',
    });
    this.addEquipment({
      id: 'weather', name: 'Solar Monitoring Station', type: 'instrumentation', iconName: 'sun', objectId: 'weather-station',
      status: () => `${fmt(this.irradiance, 0)} W/m²`, tone: () => 'ok',
    });
    this.addEquipment({
      id: 'lighting', name: 'Site Lighting', type: 'electrical', iconName: 'light', objectId: 'lamp-1',
      status: () => this.sunElev < .12 ? 'DUSK ACTIVE' : 'STANDBY', tone: () => 'muted',
    });
  }

  /* =========================================================
     Sensors
     ========================================================= */
  defineSensors() {
    return [
      { id: 'pv-voltage', name: 'PV Array Voltage', unit: 'V', min: 0, max: 400, digits: 1, value: 165, iconName: 'bolt', alarmLow: 90, alarmHigh: 370, kind: 'dc' },
      { id: 'pv-current', name: 'PV Array Current', unit: 'A', min: 0, max: 80, digits: 1, value: 20, iconName: 'activity', alarmLow: .5, alarmHigh: 70, kind: 'dc' },
      { id: 'solar-power', name: 'Solar Generation', unit: 'W', min: 0, max: 9000, digits: 0, value: 3600, iconName: 'solar', alarmLow: 100, alarmHigh: 8200, kind: 'power' },
      { id: 'irradiance', name: 'Solar Irradiance', unit: 'W/m²', min: 0, max: 1400, digits: 0, value: 640, iconName: 'sun', alarmLow: 30, alarmHigh: 1320, kind: 'solar' },
      { id: 'panel-temp', name: 'Panel Temperature', unit: '°C', min: -10, max: 110, digits: 1, value: 36, iconName: 'thermometer', alarmLow: -5, alarmHigh: 65, kind: 'thermal' },
      { id: 'battery-soc', name: 'Battery State of Charge', unit: '%', min: 0, max: 100, digits: 1, value: 62, iconName: 'battery', alarmLow: 20, alarmHigh: 100, kind: 'storage' },
      { id: 'battery-voltage', name: 'Battery Voltage', unit: 'V', min: 40, max: 60, digits: 2, value: 52, iconName: 'bolt', alarmLow: 44.5, alarmHigh: 58.6, kind: 'storage' },
      { id: 'battery-temp', name: 'Battery Temperature', unit: '°C', min: -10, max: 95, digits: 1, value: 24, iconName: 'thermometer', alarmLow: 0, alarmHigh: 45, kind: 'thermal' },
      { id: 'battery-health', name: 'Battery Health', unit: '%', min: 0, max: 100, digits: 0, value: 96, iconName: 'shieldCheck', alarmLow: 70, alarmHigh: 100, kind: 'storage' },
      { id: 'charge-current', name: 'Charge Current', unit: 'A', min: 0, max: 180, digits: 1, value: 0, iconName: 'activity', alarmLow: 0, alarmHigh: 165, kind: 'dc' },
      { id: 'inverter-output', name: 'Inverter Output', unit: 'W', min: 0, max: 6000, digits: 0, value: 0, iconName: 'inverter', alarmLow: 0, alarmHigh: 5600, kind: 'power' },
      { id: 'load-power', name: 'Load Power', unit: 'W', min: 0, max: 6500, digits: 0, value: 3400, iconName: 'motor', alarmLow: 0, alarmHigh: 6000, kind: 'power' },
    ];
  }

  buildInstrumentation() {
    const place = (id, pos, opts = {}) => {
      const node = this.createSensorNode(id, {
        scale: opts.scale ?? .8,
        position: pos,
        label: opts.label ?? false,
        labelOffset: opts.labelOffset ?? .5,
        labelScale: .44,
      });
      this.cat.sensors.add(node);
      return node;
    };
    place('pv-voltage', [1.08, .95, 1.3], { scale: .7 });
    place('pv-current', [.32, .95, 1.3], { scale: .66 });
    place('solar-power', [4.12, 1.32, 5.08], { scale: .7 });
    place('irradiance', [-.78, 2.66, 4.6], { scale: .85, label: true, labelOffset: .58 });
    place('panel-temp', [-5.6, 1.72, -4.85], { scale: .58 });
    place('battery-soc', [9.1, 1.94, 4.0], { scale: .82, label: true, labelOffset: .52 });
    place('battery-voltage', [10.85, 1.76, 4.0], { scale: .62 });
    place('battery-temp', [11.62, 1.06, 4.18], { scale: .62 });
    place('battery-health', [8.55, 1.94, 3.83], { scale: .58 });
    place('charge-current', [5.62, 2.16, 4.86], { scale: .64 });
    place('inverter-output', [13.4, 2.18, 4.58], { scale: .68 });
    place('load-power', [13.6, 1.52, -.68], { scale: .68, label: true, labelOffset: .54 });
  }

  /* =========================================================
     Alarms
     ========================================================= */
  defineAlarmRules() {
    return [
      {
        id: 'battery-low', title: 'Battery State of Charge Low', severity: 'warning',
        thresholdKey: 'batteryLow', defaultThreshold: 20, thresholdLabel: 'Low SOC limit', thresholdUnit: '%', thresholdMin: 5, thresholdMax: 60, thresholdStep: 1,
        message: () => `Battery state of charge has fallen to ${fmt(this.batterySoc, 1)}%. Loads may be shed to protect the bank.`,
        active: () => this.batterySoc <= this.threshold('batteryLow', 20),
      },
      {
        id: 'battery-overheat', title: 'Battery Over Temperature', severity: 'critical',
        thresholdKey: 'batteryHighTemp', defaultThreshold: 45, thresholdLabel: 'Battery temperature limit', thresholdUnit: '°C', thresholdMin: 25, thresholdMax: 90, thresholdStep: 1,
        message: () => `Battery temperature is ${fmt(this.batteryTemp, 1)} °C — above the safe operating limit.`,
        active: () => this.batteryTemp >= this.threshold('batteryHighTemp', 45),
      },
      {
        id: 'low-solar', title: 'Low Solar Generation', severity: 'warning',
        thresholdKey: 'lowSolar', defaultThreshold: 250, thresholdLabel: 'Minimum generation', thresholdUnit: 'W', thresholdMin: 50, thresholdMax: 3000, thresholdStep: 10,
        message: () => `Solar output is only ${fmt(this.solarPower, 0)} W despite ${fmt(this.irradiance, 0)} W/m² irradiance.`,
        active: () => this.irradiance > 200 && this.solarPower < this.threshold('lowSolar', 250),
      },
      {
        id: 'panel-overheat', title: 'Abnormal Panel Temperature', severity: 'warning',
        thresholdKey: 'panelHighTemp', defaultThreshold: 65, thresholdLabel: 'Panel temperature limit', thresholdUnit: '°C', thresholdMin: 35, thresholdMax: 100, thresholdStep: 1,
        message: () => `PV module temperature is ${fmt(this.panelTemp, 1)} °C. Efficiency and output are derated.`,
        active: () => this.panelTemp >= this.threshold('panelHighTemp', 65),
      },
      {
        id: 'controller-failure', title: 'Charge Controller Failure', severity: 'critical',
        message: () => 'MPPT charge controller is not responding. Photovoltaic generation is disconnected.',
        active: () => !!this.config.controller.failure,
      },
      {
        id: 'inverter-failure', title: 'Inverter Failure', severity: 'critical',
        message: () => 'Hybrid inverter fault. AC loads are not being supplied.',
        active: () => !!this.config.inverter.failure,
      },
      {
        id: 'battery-failure', title: 'Battery Bank Failure', severity: 'critical',
        message: () => 'Battery management system reports a critical fault. Storage is unavailable.',
        active: () => !!this.config.battery.failure,
      },
      {
        id: 'excess-load', title: 'Excessive Load Demand', severity: 'warning',
        thresholdKey: 'excessLoad', defaultThreshold: 4300, thresholdLabel: 'Demand limit', thresholdUnit: 'W', thresholdMin: 500, thresholdMax: 8000, thresholdStep: 50,
        message: () => `Connected load demand of ${fmt(this.loadDemand, 0)} W exceeds the configured limit.`,
        active: () => this.loadDemand > this.threshold('excessLoad', 4300),
      },
    ];
  }

  /* =========================================================
     Analytics
     ========================================================= */
  getAnalyticsDefs() {
    return [
      { id: 'solar', label: 'Solar Output', unit: 'W', color: '#ffc247', get: () => this.solarPower, digits: 0 },
      { id: 'load', label: 'Load Power', unit: 'W', color: '#46a9ff', get: () => this.loadServed, digits: 0 },
      { id: 'soc', label: 'Battery SOC', unit: '%', color: '#3ce58b', get: () => this.batterySoc, digits: 1 },
      { id: 'pv', label: 'PV Array Voltage', unit: 'V', color: '#a98bff', get: () => this.pvVoltage, digits: 1 },
      { id: 'charge', label: 'Charge Current', unit: 'A', color: '#4fe3c1', get: () => this.chargeCurrent, digits: 1 },
      { id: 'btemp', label: 'Battery Temperature', unit: '°C', color: '#ff8a3d', get: () => this.batteryTemp, digits: 1 },
    ];
  }

  primarySeriesIds() { return ['solar', 'load']; }

  onlinePanels() {
    if (!this.arrayEnabled) return 0;
    return this.panelStates.filter(p => p.enabled).length;
  }

  energyStoredWh() {
    return (this.config.battery.capacity * NOMINAL_VOLTAGE) * (this.batterySoc / 100) * (this.batteryHealth / 100);
  }
  /* =========================================================
     Simulation
     ========================================================= */
  computeLoadDemand(hour) {
    if (!this.config.load.enabled) return 0;
    const auto = this.config.load.autoProfile && !this.manualMode;
    let total = 0;
    for (const l of this.config.load.loads) {
      if (!l.enabled) continue;
      if (auto) {
        const inWindow = l.startHour <= l.endHour
          ? (hour >= l.startHour && hour < l.endHour)
          : (hour >= l.startHour || hour < l.endHour);
        if (!inWindow) continue;
      }
      total += Math.max(0, l.watts);
    }
    return total;
  }

  essentialDemand() {
    if (!this.config.load.enabled) return 0;
    return this.config.load.loads.reduce((s, l) => s + (l.enabled && l.essential ? Math.max(0, l.watts) : 0), 0);
  }

  /* --- operator helpers (shared by inspectors, operations & tests) --- */
  setPanelEnabled(panel, enabled) {
    const p = typeof panel === 'string' ? this.panelStates.find(x => x.id === panel) : panel;
    if (!p) return;
    p.enabled = !!enabled;
    this.logEvent(enabled ? 'Panel connected' : 'Panel isolated', `${p.id.toUpperCase()} · row ${p.row}`, enabled ? 'ok' : 'warn');
    this.saveSoon();
    this.refreshInspector();
    this.refreshLive();
  }

  setArrayEnabled(enabled) {
    this.arrayEnabled = !!enabled;
    this.config.panel.enabled = this.arrayEnabled;
    this.logEvent(enabled ? 'PV array enabled' : 'PV array isolated', enabled ? 'All connected modules generating.' : 'All modules disconnected from the controller.', enabled ? 'ok' : 'warn');
    this.saveSoon();
    this.refreshInspector();
    this.refreshLive();
  }

  setAllPanels(enabled) {
    for (const p of this.panelStates) p.enabled = !!enabled;
    this.saveSoon();
    this.refreshInspector();
    this.refreshLive();
  }

  setBatterySoc(v) {
    this.batterySoc = clamp(+v, 0, 100);
    this.config.battery.soc = this.batterySoc;
    this.saveSoon();
    this.refreshInspector();
    this.refreshLive();
  }

  setBatteryMode(mode) {
    this.config.battery.mode = mode;
    this.logEvent('Battery mode changed', `Battery operating mode set to ${mode.toUpperCase()}.`, 'info');
    this.saveSoon();
    this.refreshInspector();
    this.refreshLive();
  }

  setLoadWatts(loadId, watts) {
    const l = this.config.load.loads.find(x => x.id === loadId);
    if (!l) return;
    l.watts = clamp(+watts || 0, 0, 4000);
    this.saveSoon();
  }

  /* --- main simulation entry point --- */
  updateSimulation(dt) {
    if (!this._ready) return;
    this._animT += dt;
    this.animateEnvironment(dt);
    this.updateEnergyModel(dt);
    this.updateFlows(dt);
    this.updatePanelVisuals();
    this.updateBatteryVisuals();
    this.updateLoadVisuals(dt);
    this.updateDisplays(dt);
    this.updateMeters();
    this.updateSensors();
  }

  /* --- day / night sky, lighting and weather --- */
  animateEnvironment(dt) {
    const hour = (this.simTime / 3600) % 24;
    const dayAngle = ((hour - 6) / 12) * Math.PI;
    const elev = Math.sin(dayAngle);
    const az = Math.cos(dayAngle);
    this.sunElev = elev;
    const dir = this._sunVec || (this._sunVec = new THREE.Vector3());
    dir.set(az * .82, elev, .52);
    if (dir.lengthSq() < .0001) dir.set(0, 1, .2);
    dir.normalize();
    this.sunDir.copy(dir);
    this.sunGroup.position.copy(dir).multiplyScalar(150);
    this.sunGroup.visible = elev > -.16;
    this.moonGroup.position.copy(dir).multiplyScalar(-150);
    this.moonGroup.visible = elev < .16;
    this.stars.material.opacity = clamp((0.16 - elev) * 2.4, 0, .85);
    const cloud = clamp(this.config.sun.cloudCover, 0, .9);
    this.sunGlow.material.opacity = clamp(elev * 1.6 + .08, 0, .92) * (1 - cloud * .6);
    const cloudFade = clamp(elev * 2 + .12, .05, 1) * (.18 + cloud * .85);
    for (const c of this.clouds) {
      c.position.x += dt * c.userData.drift;
      if (c.position.x > 140) c.position.x = -140;
      c.material.opacity = cloudFade;
    }
    // sun drives the scene key light (shadows follow the sun)
    const key = this.scene.keyLight;
    if (key) {
      const ldir = this._lightVec || (this._lightVec = new THREE.Vector3());
      ldir.copy(dir);
      ldir.y = Math.max(ldir.y, .1);
      ldir.normalize();
      key.position.copy(ldir).multiplyScalar(44);
      const dayF = clamp(elev, 0, 1);
      key.intensity = .14 + dayF * 2.15 * (.55 + .45 * clamp(this.config.sun.intensity, 0, 2));
      const warm = clamp(1 - dayF * 2.4, 0, 1);
      key.color.setRGB(1, .94 - warm * .16, .84 - warm * .3);
    }
    if (this.scene.rim) this.scene.rim.intensity = .12 + Math.max(0, elev) * .42;
    // dusk-to-dawn site lighting
    const dusk = elev < .1;
    for (const l of this.lampLights) {
      if (l.light) l.light.intensity = dusk ? l.base : l.base * .12;
      if (l.mat) l.mat.emissiveIntensity = dusk ? 1.9 : .12;
    }
    this.skyDome.rotation.y += dt * .004;
  }

  /* --- irradiance, generation, storage, balance & demand --- */
  updateEnergyModel(dt) {
    const cfg = this.config;
    const hour = (this.simTime / 3600) % 24;
    const elev = this.sunElev;
    this.ambientTemp = 21 + 6 * Math.sin((hour - 9) / 24 * Math.PI * 2) + Math.max(0, elev) * 1.6;

    // irradiance --------------------------------------------------
    if (cfg.sun.mode === 'auto') {
      const clear = Math.pow(Math.max(0, elev), 1.15) * 1000;
      this.irradiance = clear * (1 - clamp(cfg.sun.cloudCover, 0, .9) * .55) * clamp(cfg.sun.intensity, 0, 2);
    } else {
      this.irradiance = clamp(cfg.sun.irradiance, 0, 1400) * clamp(cfg.sun.intensity, 0, 2);
    }
    if (!(this.irradiance > 0)) this.irradiance = 0;

    // module thermal model ----------------------------------------
    if (cfg.panel.tempMode === 'manual') {
      this.panelTemp = clamp(cfg.panel.temp, -10, 100);
    } else {
      const target = this.ambientTemp + (this.irradiance / 1000) * 30;
      this.panelTemp += (target - this.panelTemp) * (1 - Math.exp(-dt / 70));
      this.panelTemp = clamp(this.panelTemp, -12, 108);
    }

    const ctrlOn = cfg.controller.enabled && !cfg.controller.failure;
    const invOn = cfg.inverter.on && !cfg.inverter.failure;
    const batteryOn = cfg.battery.on && !cfg.battery.failure;
    const activePanels = this.arrayEnabled ? this.panelStates.filter(p => p.enabled).length : 0;
    const eff = clamp(cfg.panel.efficiency, 4, 45) / 100;
    const tempDerate = Math.max(.35, 1 - .0035 * (this.panelTemp - 25));
    const irrNorm = clamp(this.irradiance / 1000, 0, 1.35);
    const strings = Math.max(1, Math.ceil(activePanels / PANELS_PER_STRING));
    const vmp = PANELS_PER_STRING * clamp(cfg.panel.voltage, 15, 60) * (.92 + .08 * Math.min(irrNorm, 1)) * (1 - .0028 * (this.panelTemp - 25));
    this.pvVoltage = activePanels > 0 ? Math.max(0, vmp * (ctrlOn ? 1 : 1.1)) : 0;
    this.rawSolarPower = activePanels > 0 ? activePanels * PANEL_AREA * this.irradiance * eff * tempDerate : 0;
    const iLimitTotal = clamp(cfg.panel.current, 1, 30) * strings;
    if (vmp > 1 && this.rawSolarPower / vmp > iLimitTotal) this.rawSolarPower = iLimitTotal * vmp;
    this.mpptEfficiency = cfg.controller.mode === 'pwm' ? .87 : .97;
    this.solarPower = ctrlOn ? this.rawSolarPower * this.mpptEfficiency : 0;
    const genDC = this.solarPower;

    // demand ------------------------------------------------------
    this.loadDemand = this.computeLoadDemand(hour);
    let demand = this.loadDemand;
    const reserve = clamp(cfg.load.reserveSoc, 5, 85);
    let shedding = false;
    if (!this.manualMode && batteryOn && cfg.controller.protection && cfg.controller.priority === 'battery'
      && this.batterySoc < reserve && demand > this.essentialDemand()) {
      demand = this.essentialDemand();
      shedding = true;
    }
    if (!this.manualMode && batteryOn && cfg.battery.mode === 'charge' && demand > this.essentialDemand()) {
      demand = this.essentialDemand();
      shedding = true;
    }
    if (shedding !== this._lastShed) {
      this._lastShed = shedding;
      if (shedding) this.logEvent('Load shedding active', `Battery at ${fmt(this.batterySoc, 0)}% — non-essential loads disconnected.`, 'warn');
      else this.logEvent('Load shedding released', 'Non-essential loads reconnected to the AC bus.', 'ok');
    }
    this.shedding = shedding;
    this.activeDemand = demand;

    const invEff = clamp(cfg.inverter.efficiency, 50, 99) / 100;
    const desiredDC = invOn ? demand / invEff : 0;

    // battery electrical parameters -------------------------------
    const healthFactor = clamp(this.batteryHealth, 0, 100) / 100;
    const capacityWh = Math.max(1, cfg.battery.capacity * NOMINAL_VOLTAGE * healthFactor);
    const battV0 = clamp(44 + (this.batterySoc / 100) * 13.6, 40, 58.4);
    const cRate = clamp(cfg.battery.chargeRate, .05, 2);
    const chargeLimit = Math.min(cfg.controller.maxCurrent, cfg.battery.capacity * cRate) * battV0;
    const dischargeLimit = cfg.battery.capacity * 1.0 * battV0;
    const availDischarge = Math.max(0, (this.batterySoc - 2) / 100) * capacityWh / Math.max(dt / 3600, 1e-6);
    const socAvail = Math.min(dischargeLimit, availDischarge);

    // power balance ------------------------------------------------
    this.chargeDC = 0;
    this.dischargeDC = 0;
    this.curtailed = 0;
    let loadDC = 0;
    const chargeAllowed = batteryOn && (cfg.controller.auto || cfg.battery.mode === 'charge');
    const mode = batteryOn ? cfg.battery.mode : 'idle';
    if (!batteryOn || mode === 'idle') {
      loadDC = invOn ? Math.min(desiredDC, genDC) : 0;
      this.curtailed = Math.max(0, genDC - loadDC);
    } else if (mode === 'charge') {
      loadDC = invOn ? Math.min(desiredDC, genDC) : 0;
      const surplus = Math.max(0, genDC - loadDC);
      const accept = this.batterySoc >= 99.5 ? 0 : Math.max(0, chargeLimit);
      if (chargeAllowed) this.chargeDC = Math.min(surplus, accept);
      this.curtailed = Math.max(0, surplus - this.chargeDC);
      if (invOn && genDC < desiredDC && this.batterySoc > 4) {
        this.dischargeDC = Math.min(desiredDC - genDC, socAvail);
        loadDC = genDC + this.dischargeDC;
      }
    } else if (mode === 'discharge') {
      this.dischargeDC = invOn ? Math.min(desiredDC, socAvail) : 0;
      loadDC = Math.min(desiredDC, genDC + this.dischargeDC);
      this.dischargeDC = Math.max(0, loadDC - genDC);
      this.curtailed = Math.max(0, genDC - Math.max(0, loadDC - this.dischargeDC));
    } else {
      const net = genDC - desiredDC;
      if (net >= 0) {
        loadDC = desiredDC;
        const accept = this.batterySoc >= 99.5 ? 0 : Math.max(0, chargeLimit);
        this.chargeDC = chargeAllowed ? Math.min(net, accept) : 0;
        this.curtailed = Math.max(0, net - this.chargeDC);
      } else {
        this.dischargeDC = Math.min(-net, socAvail);
        loadDC = Math.min(desiredDC, genDC + this.dischargeDC);
      }
    }
    if (!invOn) loadDC = 0;
    this.inverterOut = invOn ? loadDC * invEff : 0;
    this.loadServed = this.inverterOut;
    this.unservedLoad = Math.max(0, this.loadDemand - this.loadServed);

    // state of charge integration ---------------------------------
    const chEff = .95;
    const disEff = .93;
    const chargeW = this.chargeDC * chEff;
    const dischargeWh = this.dischargeDC > 0 ? this.dischargeDC / disEff : 0;
    const deltaWh = (chargeW - dischargeWh) * (dt / 3600);
    this.batterySoc = clamp(this.batterySoc + (deltaWh / capacityWh) * 100, 0, 100);
    this.batteryVoltage = clamp(44 + (this.batterySoc / 100) * 13.6 + (this.chargeDC / 1000) * .22 - (this.dischargeDC / 1000) * .3, 40, 58.6);
    this.chargeCurrent = this.batteryVoltage > 1 ? this.chargeDC / this.batteryVoltage : 0;

    // battery thermal + health ------------------------------------
    if (cfg.battery.overheat) {
      this.batteryTemp += (78 - this.batteryTemp) * (1 - Math.exp(-dt / 55));
    } else if (cfg.battery.tempMode === 'manual') {
      this.batteryTemp = clamp(cfg.battery.temp, -10, 88);
    } else {
      const target = this.ambientTemp + (this.chargeDC + this.dischargeDC) / 1000 * 4.2;
      this.batteryTemp += (target - this.batteryTemp) * (1 - Math.exp(-dt / 150));
    }
    this.batteryTemp = clamp(this.batteryTemp, -12, 92);
    if (!cfg.battery.failure) {
      const stress = Math.max(0, this.batteryTemp - 35) / 12 + Math.abs(this.chargeDC - this.dischargeDC) / 6000;
      this.batteryHealth = clamp(this.batteryHealth - dt * .000012 * stress, 30, 100);
    }

    // counters -----------------------------------------------------
    const dayIndex = Math.floor(this.simTime / 86400);
    if (dayIndex !== this._energyDay) {
      this._energyDay = dayIndex;
      this.energyTodayWh = 0;
      this.consumedTodayWh = 0;
      this.chargedTodayWh = 0;
      this.dischargedTodayWh = 0;
    }
    this.energyTodayWh += this.solarPower * dt / 3600;
    this.consumedTodayWh += this.loadServed * dt / 3600;
    this.chargedTodayWh += chargeW * dt / 3600;
    this.dischargedTodayWh += dischargeWh * dt / 3600;
    this.netPower = this.chargeDC - this.dischargeDC;
    this.systemEff = this.solarPower > 5 ? clamp(((this.loadServed + chargeW) / this.solarPower) * 100, 0, 99.9) : 0;
    this.pvCurrent = this.pvVoltage > 1 ? this.solarPower / this.pvVoltage : 0;
  }

  updateFlows(dt) {
    const ctrlOn = this.config.controller.enabled && !this.config.controller.failure && this.arrayEnabled;
    const battOn = this.config.battery.on && !this.config.battery.failure;
    const invOn = this.config.inverter.on && !this.config.inverter.failure;
    const powers = {
      generation: ctrlOn ? this.solarPower : 0,
      charging: battOn ? this.chargeDC : 0,
      discharging: battOn ? this.dischargeDC : 0,
      load: invOn ? this.inverterOut : 0,
      deliver: invOn ? this.inverterOut : 0,
    };
    for (const f of this.flows) f.update(dt, powers[f.id] || 0);
  }

  updatePanelVisuals() {
    const ctrlOn = this.config.controller.enabled && !this.config.controller.failure;
    const irrN = clamp(this.irradiance / 1000, 0, 1.4);
    for (const p of this.panelStates) {
      const live = this.arrayEnabled && p.enabled && ctrlOn && irrN > .01;
      p.cellMat.emissiveIntensity = live ? .22 + irrN * 1.75 : 0;
      if (live) {
        p.cellMat.emissive.setHex(0x2f6fd0);
        p.cellMat.color.setHex(0xdfe8f2);
      } else {
        p.cellMat.emissive.setHex(0x101820);
        p.cellMat.color.setHex(p.enabled && this.arrayEnabled ? 0x66707a : 0x4c545c);
      }
    }
  }

  updateBatteryVisuals() {
    const cfg = this.config;
    const off = !cfg.battery.on || cfg.battery.failure;
    const soc = this.batterySoc;
    const col = off ? 0x4a545e : soc <= 20 ? 0xff4a5f : soc <= 45 ? 0xffb547 : 0x3ce58b;
    const hot = this.batteryTemp >= this.threshold('batteryHighTemp', 45);
    for (const m of this.batteryModules) {
      const s = Math.max(.02, soc / 100);
      m.fill.scale.y = s;
      m.fill.position.y = m.fillBaseY - (m.fillHeight * (1 - s)) / 2;
      m.fillMat.color.setHex(col);
      m.fillMat.emissive.setHex(col);
      m.fillMat.emissiveIntensity = off ? .05 : 1.05 + (this.chargeDC > 50 ? Math.sin(this._animT * 4) * .2 : 0);
      const ledCol = off ? 0x3a434c : hot ? 0xff4a5f : 0x3ce58b;
      m.led.material.emissive.setHex(ledCol);
      m.led.material.color.setHex(ledCol);
      m.led.material.emissiveIntensity = off ? .1 : hot ? (Math.sin(this._animT * 7) > 0 ? 2.4 : .3) : 1.7;
    }
  }

  updateLoadVisuals(dt) {
    const served = this.loadServed;
    const ratio = clamp(served / Math.max(600, this.loadDemand), 0, 1);
    const spin = .8 + ratio * 9;

    // Helper: get load circuit enabled state
    const loadOn = id => {
      const l = this.config.load.loads.find(x => x.id === id);
      return l ? l.enabled : false;
    };

    // Roof HVAC fans (from office building) — responds to HVAC circuit
    if (this.roofHvacFans) {
      const hvacOn = loadOn('hvac') && this.config.load.enabled;
      for (const fan of this.roofHvacFans) {
        if (hvacOn) fan.rotation.y += dt * (.3 + ratio * 7);
        else fan.rotation.y = Math.max(0, fan.rotation.y - dt * 2); // slow down when off
      }
    }

    // Server rack cooling fan — responds to server_rack circuit
    if (this.serverRackFan) {
      const rackOn = loadOn('server_rack') && this.config.load.enabled;
      if (rackOn) this.serverRackFan.rotation.z += dt * (5 + ratio * 15);
      else this.serverRackFan.rotation.z = Math.max(0, this.serverRackFan.rotation.z - dt * 4);
    }

    // Server rack LED blinking — responds to server_rack circuit
    if (this.serverRackLeds) {
      const rackOn = loadOn('server_rack') && this.config.load.enabled;
      for (let i = 0; i < this.serverRackLeds.length; i++) {
        const led = this.serverRackLeds[i];
        const phase = this._animT * 3 + i * 0.5;
        led.material.emissiveIntensity = rackOn && served > 10 ? 1.0 + Math.sin(phase) * 0.5 : 0.1;
      }
    }

    // Office ceiling lights — responds to office_lighting circuit
    if (this.officeLightMats) {
      const lightsOn = loadOn('office_lighting') && this.config.load.enabled && served > 10;
      const lightIntensity = lightsOn ? 1.0 : 0.05;
      for (const mat of this.officeLightMats) {
        mat.emissiveIntensity = lightIntensity;
      }
    }

    // Desk lamps — responds to office_lighting circuit
    if (this.officeLights) {
      const lightsOn = loadOn('office_lighting') && this.config.load.enabled && served > 10;
      for (const lamp of this.officeLights) {
        const pl = lamp.children.find(c => c.isPointLight);
        if (pl) pl.intensity = lightsOn ? 0.8 : 0.02;
      }
    }

    // Coffee machine LED — responds to kitchen circuit
    if (this.coffeeMachine) {
      const led = this.coffeeMachine.children.find(c => c.material && c.material.emissiveIntensity !== undefined);
      if (led) {
        const kitchenOn = loadOn('kitchen') && this.config.load.enabled && served > 10;
        led.material.emissiveIntensity = kitchenOn ? 1.5 : 0.05;
      }
    }

    // Microwave LED — responds to kitchen circuit
    if (this.microwave) {
      const led = this.microwave.children.find(c => c.material && c.material.emissiveIntensity !== undefined);
      if (led) {
        const kitchenOn = loadOn('kitchen') && this.config.load.enabled && served > 10;
        led.material.emissiveIntensity = kitchenOn ? 1.5 : 0.05;
      }
    }

    // Fridge LED — responds to kitchen circuit (fridge runs 24/7 when enabled)
    if (this.fridge) {
      const led = this.fridge.children.find(c => c.material && c.material.emissiveIntensity !== undefined);
      if (led) {
        const kitchenOn = loadOn('kitchen') && this.config.load.enabled;
        led.material.emissiveIntensity = kitchenOn ? 1.5 : 0.05;
      }
    }

    // Computer monitor glow — responds to workstations circuit
    if (this.officeComputers) {
      const wsOn = loadOn('workstations') && this.config.load.enabled && served > 10;
      for (const comp of this.officeComputers) {
        if (comp.glowMat) {
          comp.glowMat.opacity = wsOn ? 0.15 : 0.01;
        }
      }
    }

    // Load bank — responds to loadbank circuit
    const bank = this.config.load.loads.find(l => l.id === 'loadbank');
    const bankLevel = bank && bank.enabled && this.config.load.enabled && served > 20 ? clamp(bank.watts / 2500, 0, 1) : 0;
    for (const m of this.loadBankMats || []) {
      m.emissiveIntensity = .03 + bankLevel * (1.5 + Math.sin(this._animT * 5) * .25);
    }

    // Load control panel lights
    if (this.loadPointLight) this.loadPointLight.intensity = (.35 + ratio * 2.2) * (this.config.load.enabled && served > 10 ? 1 : .05);
    if (this.loadLightMat) this.loadLightMat.emissiveIntensity = this.config.load.enabled && served > 10 ? .7 + ratio * .8 : .05;

    const trip = this.loadDemand > this.threshold('excessLoad', 4300) || this.shedding;
    for (const m of this.distributionLevers || []) {
      const col = !this.config.load.enabled ? 0x3a434c : trip ? 0xffb547 : 0x3ce58b;
      m.color.setHex(col);
      m.emissive.setHex(col);
      m.emissiveIntensity = .35;
    }
  }

  updateMeters() {
    for (const n of this.meterNeedles) {
      const v = clamp(n.get(), 0, 1);
      n.pivot.rotation.z = Math.PI * (.78 - v * 1.56);
    }
  }

  /* --- live LCD displays & status lamps --- */
  updateDisplays(dt) {
    const setLed = (led, col, intensity) => {
      led.material.color.setHex(col);
      led.material.emissive.setHex(col);
      led.material.emissiveIntensity = intensity;
    };
    const cfg = this.config;
    if (this.controllerLeds) {
      const run = cfg.controller.enabled && !cfg.controller.failure;
      setLed(this.controllerLeds[0], run ? 0x3ce58b : 0x3a434c, run ? 1.9 : .1);
      setLed(this.controllerLeds[1], this.chargeDC > 5 ? 0xffb547 : 0x4a3a20, this.chargeDC > 5 ? 1.8 : .12);
      setLed(this.controllerLeds[2], cfg.controller.failure ? 0xff4a5f : 0x3a434c, cfg.controller.failure ? 2.2 : .1);
    }
    if (this.inverterLed) {
      const run = cfg.inverter.on && !cfg.inverter.failure;
      setLed(this.inverterLed, cfg.inverter.failure ? 0xff4a5f : run ? 0x3ce58b : 0x3a434c, cfg.inverter.failure ? 2.3 : run ? 1.9 : .1);
    }
    this._displayTimer += dt;
    if (this._displayTimer < .35) return;
    this._displayTimer = 0;

    const gold = '#ffc247', cyan = '#cfe4f2', green = '#3ce58b', dim = '#4c6f74', violet = '#a98bff', orange = '#ff8a3d';
    if (this.controllerDisplay) {
      this.controllerDisplay.draw((ctx, w, h) => {
        ctx.fillStyle = '#04121a'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#0a2b2b'; ctx.fillRect(0, 0, w, 32);
        ctx.fillStyle = '#8ff0da'; ctx.font = '700 16px "Cascadia Mono", monospace'; ctx.textAlign = 'left';
        ctx.fillText('MPPT CHARGE CONTROLLER', 10, 23);
        ctx.fillStyle = this.config.controller.failure ? '#ff4a5f' : this.config.controller.enabled ? '#3ce58b' : '#4c6f74';
        ctx.beginPath(); ctx.arc(w - 20, 16, 6, 0, Math.PI * 2); ctx.fill();
        this._lcdRow(ctx, 12, 50, 'PV POWER', `${fmt(this.solarPower / 1000, 2)} kW`, gold);
        this._lcdRow(ctx, 12, 92, 'PV VOLTAGE', `${fmt(this.pvVoltage, 1)} V`, cyan);
        this._lcdRow(ctx, 12, 134, 'PV CURRENT', `${fmt(this.pvCurrent, 1)} A`, cyan);
        this._lcdRow(ctx, w / 2 + 8, 50, 'BATTERY', `${fmt(this.batterySoc, 0)} %`, green);
        this._lcdRow(ctx, w / 2 + 8, 92, 'CHARGE', `${fmt(this.chargeCurrent, 1)} A`, this.chargeDC > 5 ? green : dim);
        this._lcdRow(ctx, w / 2 + 8, 134, 'MODE', this.config.controller.mode.toUpperCase(), violet);
      });
    }
    if (this.inverterDisplay) {
      const dcIn = this.inverterOut > 0 ? this.inverterOut / (clamp(this.config.inverter.efficiency, 50, 99) / 100) : 0;
      this.inverterDisplay.draw((ctx, w, h) => {
        ctx.fillStyle = '#040d16'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#0a1c33'; ctx.fillRect(0, 0, w, 32);
        ctx.fillStyle = '#9fc9ff'; ctx.font = '700 16px "Cascadia Mono", monospace'; ctx.textAlign = 'left';
        ctx.fillText('HYBRID INVERTER · 5 kW', 10, 23);
        ctx.fillStyle = this.config.inverter.failure ? '#ff4a5f' : this.config.inverter.on ? '#3ce58b' : '#4c6f74';
        ctx.beginPath(); ctx.arc(w - 20, 16, 6, 0, Math.PI * 2); ctx.fill();
        this._lcdRow(ctx, 12, 52, 'AC OUTPUT', `${fmt(this.inverterOut / 1000, 2)} kW`, '#46a9ff');
        this._lcdRow(ctx, 12, 108, 'OUTPUT VOLTAGE', `${this.config.inverter.outputVoltage} V`, cyan);
        this._lcdRow(ctx, w / 2 + 8, 52, 'DC INPUT', `${fmt(dcIn / 1000, 2)} kW`, orange);
        this._lcdRow(ctx, w / 2 + 8, 108, 'EFFICIENCY', `${fmt(this.config.inverter.efficiency, 0)} %`, violet);
      });
    }
    if (this.loadDisplay) {
      this.loadDisplay.draw((ctx, w, h) => {
        ctx.fillStyle = '#050e14'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#4c6f74'; ctx.font = '600 10px "Cascadia Mono", monospace'; ctx.textAlign = 'left';
        ctx.fillText('LOAD BUS · 230 V', 8, 16);
        ctx.fillStyle = '#46a9ff'; ctx.font = '700 24px "Cascadia Mono", monospace';
        ctx.fillText(`${fmt(this.loadServed / 1000, 2)} kW`, 8, 46);
        ctx.fillStyle = '#4c6f74'; ctx.font = '600 10px "Cascadia Mono", monospace';
        ctx.fillText(`DEMAND ${fmt(this.loadDemand, 0)} W`, 8, 68);
        ctx.fillText(`${this.config.load.enabled ? 'BUS ENERGISED' : 'BUS ISOLATED'}`, 8, 88);
      });
    }
  }

  _lcdRow(ctx, x, y, label, value, color) {
    ctx.fillStyle = '#4c6f74';
    ctx.font = '600 10px "Cascadia Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y);
    ctx.fillStyle = color;
    ctx.font = '700 19px "Cascadia Mono", monospace';
    ctx.fillText(value, x, y + 21);
  }

  updateSensors() {
    this.setSensorValue('pv-voltage', this.pvVoltage);
    this.setSensorValue('pv-current', this.pvCurrent);
    this.setSensorValue('solar-power', this.solarPower);
    this.setSensorValue('irradiance', this.irradiance);
    this.setSensorValue('panel-temp', this.panelTemp);
    this.setSensorValue('battery-soc', this.batterySoc);
    this.setSensorValue('battery-voltage', this.batteryVoltage);
    this.setSensorValue('battery-temp', this.batteryTemp);
    this.setSensorValue('battery-health', this.batteryHealth);
    this.setSensorValue('charge-current', this.chargeCurrent);
    this.setSensorValue('inverter-output', this.inverterOut);
    this.setSensorValue('load-power', this.loadServed);
  }
  /* =========================================================
     Object inspectors
     ========================================================= */
  getObjectInspector(obj) {
    switch (obj.kind) {
      case 'panel': return this.panelInspector(obj);
      case 'controller': return this.controllerInspector(obj);
      case 'battery': return this.batteryInspector(obj, false);
      case 'battery-rack': return this.batteryInspector(obj, true);
      case 'inverter': return this.inverterInspector(obj);
      case 'distribution': return this.distributionInspector(obj);
      case 'combiner': return this.combinerInspector(obj);
      case 'meter': return this.meterInspector(obj);
      case 'building': return this.buildingInspector(obj);
      case 'load':
        if (obj.id === 'workstation-0' || obj.id === 'workstation-1' || obj.id === 'workstation-2' || obj.id === 'workstation-3') return this.workstationInspector(obj);
        if (obj.id === 'meeting-room') return this.meetingRoomInspector();
        if (obj.id === 'server-rack') return this.serverRackInspector();
        if (obj.id === 'kitchen-area') return this.kitchenInspector();
        if (obj.id === 'reception-desk') return this.receptionInspector();
        return this.loadInspector(obj);
      case 'loadbank': return this.loadBankInspector(obj);
      case 'loadcontrol': return this.loadControlInspector(obj);
      case 'sign': return this.signInspector(obj);
      case 'lamp': return this.lampInspector(obj);
      case 'station': return this.stationInspector(obj);
      default: return this.defaultInspector(obj);
    }
  }

  panelInspector(obj) {
    const p = this.panelStates.find(x => x.id === obj.id);
    if (!p) return this.defaultInspector(obj);
    const online = this.onlinePanels();
    const perPanel = online > 0 ? this.solarPower / online : 0;
    const controls = [
      { type: 'toggle', label: 'Module connected', description: 'Isolate this panel from its PV string.', value: p.enabled, onChange: v => this.setPanelEnabled(p, v) },
      { type: 'slider', label: 'Module tilt angle', min: 10, max: 55, step: 1, value: Math.round(p.group.rotation.x * 180 / Math.PI), unit: '°', onChange: v => { p.group.rotation.x = v * Math.PI / 180; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Array master enable', value: this.arrayEnabled, onChange: v => this.setArrayEnabled(v) },
    ];
    return {
      title: obj.label,
      subtitle: `PV MODULE · STRING ${p.row} · ${p.id.toUpperCase()}`,
      iconName: 'panel',
      badge: () => ({
        text: !p.enabled ? 'ISOLATED' : !this.arrayEnabled ? 'ARRAY OFF' : perPanel > 5 ? 'GENERATING' : 'ONLINE',
        tone: !p.enabled || !this.arrayEnabled ? 'warn' : 'ok',
      }),
      fields: [
        { label: 'Module', value: `${p.id.toUpperCase()} · row ${p.row}` },
        { label: 'Irradiance', get: () => `${fmt(this.irradiance, 0)} W/m²` },
        { label: 'Cell temperature', get: () => `${fmt(this.panelTemp, 1)} °C` },
        { label: 'Module output', get: () => `${fmt(p.enabled && this.arrayEnabled ? perPanel : 0, 0)} W` },
        { label: 'String voltage', get: () => `${fmt(this.pvVoltage, 1)} V` },
        { label: 'Temperature derating', get: () => `${fmt(clamp((1 - .0035 * (this.panelTemp - 25)) * 100, 50, 105), 1)} %` },
        { label: 'Array status', get: () => `${online}/12 modules connected` },
      ],
      sections: [{ title: 'Module Controls', controls }],
      note: 'Module performance is driven by live irradiance, cell temperature and the MPPT operating point. Isolating a module reduces array output immediately.',
    };
  }

  controllerInspector() {
    const cfg = this.config;
    const controls = [
      { type: 'toggle', label: 'Controller enabled', description: 'Connect or disconnect the PV input stage.', value: cfg.controller.enabled, onChange: v => { cfg.controller.enabled = v; this.logEvent(v ? 'Controller enabled' : 'Controller disabled', 'MPPT charge controller input stage.', v ? 'ok' : 'warn'); this.saveSoon(); this.refreshInspector(); } },
      { type: 'segment', label: 'Tracking algorithm', options: [{ value: 'mppt', label: 'MPPT' }, { value: 'pwm', label: 'PWM' }], value: cfg.controller.mode, onChange: v => { cfg.controller.mode = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Automatic charging', description: 'When disabled, the bank only charges in Force Charge mode.', value: cfg.controller.auto, onChange: v => { cfg.controller.auto = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'Maximum charge current', min: 10, max: 180, step: 1, value: cfg.controller.maxCurrent, unit: 'A', onChange: v => { cfg.controller.maxCurrent = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'Charge voltage limit', min: 48, max: 60, step: .1, value: cfg.controller.chargeVoltage, unit: 'V', onChange: v => { cfg.controller.chargeVoltage = v; this.saveSoon(); } },
      { type: 'segment', label: 'Power priority', options: [{ value: 'battery', label: 'Battery first' }, { value: 'load', label: 'Load first' }], value: cfg.controller.priority, onChange: v => { cfg.controller.priority = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Deep-discharge protection', description: 'Sheds non-essential loads below the reserve SOC.', value: cfg.controller.protection, onChange: v => { cfg.controller.protection = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Inject controller failure', description: 'Diagnostic fault injection — disconnects generation.', value: cfg.controller.failure, onChange: v => { cfg.controller.failure = v; this.logEvent(v ? 'Controller failure injected' : 'Controller failure cleared', 'MPPT power stage diagnostic.', v ? 'danger' : 'ok'); this.evaluateAlarms(); this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Array master enable', value: this.arrayEnabled, onChange: v => this.setArrayEnabled(v) },
    ];
    return {
      title: 'MPPT Charge Controller',
      subtitle: 'POWER ELECTRONICS · MPPT-130',
      iconName: 'bolt',
      badge: () => ({
        text: cfg.controller.failure ? 'FAULT' : !cfg.controller.enabled ? 'OFFLINE' : cfg.controller.mode === 'pwm' ? 'PWM' : 'MPPT',
        tone: cfg.controller.failure ? 'danger' : cfg.controller.enabled ? 'ok' : 'warn',
      }),
      fields: [
        { label: 'PV input power', get: () => `${fmt(this.solarPower / 1000, 2)} kW` },
        { label: 'PV input voltage', get: () => `${fmt(this.pvVoltage, 1)} V` },
        { label: 'PV input current', get: () => `${fmt(this.pvCurrent, 1)} A` },
        { label: 'Charge current', get: () => `${fmt(this.chargeCurrent, 1)} A` },
        { label: 'Battery voltage', get: () => `${fmt(this.batteryVoltage, 2)} V` },
        { label: 'Tracking efficiency', get: () => `${fmt(this.mpptEfficiency * 100, 0)} %` },
        { label: 'Curtailed surplus', get: () => `${fmt(this.curtailed, 0)} W` },
      ],
      sections: [{ title: 'Controller Controls', controls }],
      note: 'The charge controller regulates the MPPT operating point and limits charge current to protect the battery bank. MPPT tracking is ~97% efficient; PWM falls back to ~87%.',
    };
  }

  batteryInspector(obj, rack) {
    const cfg = this.config;
    const controls = [
      { type: 'toggle', label: 'Battery bank enabled', description: 'Open the battery contactor to isolate storage.', value: cfg.battery.on, onChange: v => { cfg.battery.on = v; this.logEvent(v ? 'Battery connected' : 'Battery disconnected', 'Main battery contactor.', v ? 'ok' : 'warn'); this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'State of charge setpoint', min: 0, max: 100, step: 1, value: Math.round(this.batterySoc), unit: '%', onInput: v => { cfg.battery.soc = v; this.batterySoc = v; }, onChange: () => { this.saveSoon(); this.refreshInspector(); } },
      { type: 'segment', label: 'Operating mode', options: [{ value: 'auto', label: 'Auto' }, { value: 'charge', label: 'Charge' }, { value: 'discharge', label: 'Discharge' }, { value: 'idle', label: 'Idle' }], value: cfg.battery.mode, onChange: v => this.setBatteryMode(v) },
      { type: 'slider', label: 'Rated capacity', min: 50, max: 400, step: 5, value: cfg.battery.capacity, unit: 'Ah', onChange: v => { cfg.battery.capacity = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'Charge rate limit', min: .1, max: 1.5, step: .05, value: cfg.battery.chargeRate, unit: 'C', onChange: v => { cfg.battery.chargeRate = v; this.saveSoon(); } },
      { type: 'toggle', label: 'Manual temperature', description: 'Override the battery thermal model.', value: cfg.battery.tempMode === 'manual', onChange: v => { cfg.battery.tempMode = v ? 'manual' : 'auto'; if (v) cfg.battery.temp = Math.round(this.batteryTemp); this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'Battery temperature', min: -5, max: 80, step: 1, value: Math.round(this.batteryTemp), unit: '°C', onChange: v => { cfg.battery.temp = v; cfg.battery.tempMode = 'manual'; this.batteryTemp = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'State of health', min: 30, max: 100, step: 1, value: Math.round(this.batteryHealth), unit: '%', onChange: v => { this.batteryHealth = v; cfg.battery.health = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Inject battery failure', value: cfg.battery.failure, onChange: v => { cfg.battery.failure = v; this.evaluateAlarms(); this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Simulate over-temperature', value: cfg.battery.overheat, onChange: v => { cfg.battery.overheat = v; if (v) cfg.battery.tempMode = 'auto'; this.evaluateAlarms(); this.saveSoon(); this.refreshInspector(); } },
      { type: 'pair', controls: [
        { type: 'button', label: 'SOC 20%', onClick: () => this.setBatterySoc(20) },
        { type: 'button', label: 'SOC 80%', onClick: () => this.setBatterySoc(80) },
      ] },
    ];
    return {
      title: rack ? 'Battery Storage Rack' : obj.label,
      subtitle: rack ? 'STORAGE BANK · 4 × 48 V MODULES' : 'STORAGE MODULE · 48 V LiFePO4',
      iconName: 'battery',
      badge: () => ({
        text: cfg.battery.failure ? 'FAULT' : !cfg.battery.on ? 'ISOLATED' : this.chargeDC > 5 ? 'CHARGING' : this.dischargeDC > 5 ? 'DISCHARGING' : 'IDLE',
        tone: cfg.battery.failure ? 'danger' : !cfg.battery.on ? 'warn' : this.batterySoc < 20 ? 'warn' : 'ok',
      }),
      fields: [
        { label: 'State of charge', get: () => `${fmt(this.batterySoc, 1)} %` },
        { label: 'Stored energy', get: () => `${fmt(this.energyStoredWh() / 1000, 2)} kWh` },
        { label: 'Bank voltage', get: () => `${fmt(this.batteryVoltage, 2)} V` },
        { label: 'Charge current', get: () => `${fmt(this.chargeCurrent, 1)} A` },
        { label: 'Charge / discharge', get: () => `${fmt(this.chargeDC, 0)} / ${fmt(this.dischargeDC, 0)} W` },
        { label: 'Temperature', get: () => `${fmt(this.batteryTemp, 1)} °C` },
        { label: 'State of health', get: () => `${fmt(this.batteryHealth, 0)} %` },
        { label: 'Configuration', get: () => `${cfg.battery.capacity} Ah · 48 V · ${cfg.battery.mode.toUpperCase()}` },
      ],
      sections: [{ title: 'Battery Controls', controls }],
      note: 'State of charge integrates charge and discharge energy against usable capacity and state of health. Temperature and health are tracked continuously and affect available capacity.',
    };
  }

  inverterInspector() {
    const cfg = this.config;
    const controls = [
      { type: 'toggle', label: 'Inverter output enabled', description: 'Energise or isolate the AC output stage.', value: cfg.inverter.on, onChange: v => { cfg.inverter.on = v; this.logEvent(v ? 'Inverter enabled' : 'Inverter disabled', 'AC output stage.', v ? 'ok' : 'warn'); this.saveSoon(); this.refreshInspector(); } },
      { type: 'segment', label: 'Output voltage', options: [{ value: 220, label: '220 V' }, { value: 230, label: '230 V' }, { value: 240, label: '240 V' }], value: cfg.inverter.outputVoltage, onChange: v => { cfg.inverter.outputVoltage = +v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'slider', label: 'Conversion efficiency', min: 70, max: 99, step: .5, value: cfg.inverter.efficiency, unit: '%', onChange: v => { cfg.inverter.efficiency = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Inject inverter failure', value: cfg.inverter.failure, onChange: v => { cfg.inverter.failure = v; this.evaluateAlarms(); this.saveSoon(); this.refreshInspector(); } },
    ];
    return {
      title: 'Hybrid Inverter',
      subtitle: 'POWER CONVERSION · INV-5K',
      iconName: 'inverter',
      badge: () => ({ text: cfg.inverter.failure ? 'FAULT' : cfg.inverter.on ? 'RUNNING' : 'OFFLINE', tone: cfg.inverter.failure ? 'danger' : cfg.inverter.on ? 'ok' : 'warn' }),
      fields: [
        { label: 'AC output', get: () => `${fmt(this.inverterOut / 1000, 2)} kW` },
        { label: 'Output voltage', get: () => `${cfg.inverter.outputVoltage} V AC` },
        { label: 'DC input', get: () => `${fmt(this.inverterOut / (clamp(cfg.inverter.efficiency, 50, 99) / 100), 0)} W` },
        { label: 'Efficiency', get: () => `${fmt(cfg.inverter.efficiency, 1)} %` },
        { label: 'Load demand', get: () => `${fmt(this.loadDemand, 0)} W` },
        { label: 'Unserved load', get: () => `${fmt(this.unservedLoad, 0)} W` },
      ],
      sections: [{ title: 'Inverter Controls', controls }],
      note: 'The inverter converts the 48 V DC bus to 230 V AC. Output is limited to 5 kW and efficiency losses are included in the energy balance.',
    };
  }

  distributionInspector() {
    const cfg = this.config;
    const activeLoads = cfg.load.loads.filter(l => l.enabled);
    return {
      title: 'AC Distribution Panel',
      subtitle: 'DISTRIBUTION · 230 V / 50 Hz',
      iconName: 'equipment',
      badge: () => ({ text: cfg.load.enabled ? 'ENERGISED' : 'ISOLATED', tone: cfg.load.enabled ? 'ok' : 'warn' }),
      fields: [
        { label: 'Connected circuits', value: String(cfg.load.loads.length) },
        { label: 'Active circuits', get: () => String(activeLoads.length) },
        { label: 'Total demand', get: () => `${fmt(this.loadDemand, 0)} W` },
        { label: 'Served load', get: () => `${fmt(this.loadServed, 0)} W` },
        { label: 'Unserved', get: () => `${fmt(this.unservedLoad, 0)} W` },
        { label: 'Load shedding', get: () => this.shedding ? 'ACTIVE' : 'INACTIVE' },
        { label: 'Bus voltage', get: () => `${cfg.inverter.outputVoltage} V` },
      ],
      sections: [{ title: 'Distribution Controls', controls: [
        { type: 'toggle', label: 'Load bus energised', value: cfg.load.enabled, onChange: v => { cfg.load.enabled = v; this.saveSoon(); this.refreshInspector(); } },
        { type: 'toggle', label: 'Automatic load profile', value: cfg.load.autoProfile, onChange: v => { cfg.load.autoProfile = v; this.saveSoon(); this.refreshInspector(); } },
        { type: 'segment', label: 'Power priority', options: [{ value: 'battery', label: 'Battery first' }, { value: 'load', label: 'Load first' }], value: cfg.controller.priority, onChange: v => { cfg.controller.priority = v; this.saveSoon(); } },
        { type: 'button', label: 'Open Load Management', iconName: 'bolt', onClick: () => this.setTab('spawn') },
      ] }],
      note: 'The distribution panel splits inverter output between circuit breakers. Non-essential circuits are shed automatically when the battery reserve is reached.',
    };
  }

  combinerInspector() {
    const online = this.onlinePanels();
    return {
      title: 'PV String Combiner',
      subtitle: 'DC COMBINER · 3 STRINGS · FUSED',
      iconName: 'panel',
      badge: () => ({ text: online > 0 ? 'ONLINE' : 'ISOLATED', tone: online > 0 ? 'ok' : 'warn' }),
      fields: [
        { label: 'Strings connected', value: '3 × 4 modules' },
        { label: 'Modules online', get: () => `${online} / 12` },
        { label: 'String voltage', get: () => `${fmt(this.pvVoltage, 1)} V DC` },
        { label: 'String current', get: () => `${fmt(this.pvCurrent, 1)} A` },
        { label: 'Array power', get: () => `${fmt(this.solarPower, 0)} W` },
        { label: 'Fuse status', get: () => online > 0 ? 'ALL HEALTHY' : 'NO INPUT' },
      ],
      sections: [{ title: 'Combiner Controls', controls: [
        { type: 'toggle', label: 'Array master enable', value: this.arrayEnabled, onChange: v => this.setArrayEnabled(v) },
        { type: 'button', label: 'Enable All Modules', iconName: 'check', onClick: () => this.setAllPanels(true) },
        { type: 'button', label: 'Isolate All Modules', variant: 'warn', iconName: 'eyeOff', onClick: () => this.setAllPanels(false) },
      ] }],
      note: 'Each string is individually fused. Module isolation upstream is reflected in the combiner current and array output.',
    };
  }

  meterInspector(obj) {
    const isPv = obj.id === 'pv-meter';
    return {
      title: obj.label,
      subtitle: 'REVENUE METERING',
      iconName: 'gauge',
      badge: { text: 'METERING', tone: 'ok' },
      fields: [
        { label: 'Reading', get: () => isPv ? `${fmt(this.solarPower / 1000, 2)} kW` : `${fmt(this.loadServed / 1000, 2)} kW` },
        { label: 'Energy today', get: () => isPv ? `${fmt(this.energyTodayWh / 1000, 2)} kWh` : `${fmt(this.consumedTodayWh / 1000, 2)} kWh` },
        { label: 'Meter class', value: 'Class 0.5S · bidirectional' },
        { label: 'Service', value: 'Local microgrid · no export' },
      ],
      sections: [{ title: 'Meter Controls', controls: [{ type: 'button', label: 'Open Analytics', iconName: 'chart', onClick: () => this.setTab('analytics') }] }],
    };
  }

  buildingInspector() {
    const cfg = this.config;
    return {
      title: 'Office Building',
      subtitle: 'MODERN WORKPLACE · CONNECTED LOADS',
      iconName: 'inventory',
      badge: () => ({ text: cfg.load.enabled ? (this.unservedLoad > 50 ? 'PARTIAL SUPPLY' : 'SUPPLIED') : 'ISOLATED', tone: !cfg.load.enabled ? 'warn' : this.unservedLoad > 50 ? 'danger' : 'ok' }),
      fields: [
        { label: 'Circuits', get: () => String(cfg.load.loads.filter(l => l.enabled).length) },
        { label: 'Demand', get: () => `${fmt(this.loadDemand, 0)} W` },
        { label: 'Served', get: () => `${fmt(this.loadServed, 0)} W` },
        { label: 'Unserved', get: () => `${fmt(this.unservedLoad, 0)} W` },
        { label: 'Bus voltage', get: () => `${cfg.inverter.outputVoltage} V AC` },
        { label: 'Load shedding', get: () => this.shedding ? 'ACTIVE · non-essential shed' : 'INACTIVE' },
        { label: 'Interior temperature', get: () => `${fmt(this.ambientTemp, 1)} °C` },
        { label: 'Occupancy', get: () => this._getOfficeOccupancy() },
        { label: 'Workstations active', get: () => this._getActiveWorkstations() },
        { label: 'Server rack', get: () => this._getServerRackStatus() },
      ],
      sections: [{ title: 'Office Controls', controls: [
        { type: 'toggle', label: 'Main AC breaker', value: cfg.load.enabled, onChange: v => { cfg.load.enabled = v; this.logEvent(v ? 'Office bus energised' : 'Office bus isolated', 'Office main breaker.', v ? 'ok' : 'warn'); this.saveSoon(); this.updateLoadVisuals(0); this.refreshInspector(); } },
        { type: 'toggle', label: 'Automatic load profile', value: cfg.load.autoProfile, onChange: v => { cfg.load.autoProfile = v; this.saveSoon(); this.refreshInspector(); } },
        { type: 'button', label: 'Open Load Management', variant: 'subtle', iconName: 'bolt', onClick: () => this.setTab('spawn') },
        { type: 'button', label: 'Inspect Workstations', variant: 'subtle', iconName: 'computers', onClick: () => this.selectObject('workstation-0') },
        { type: 'button', label: 'Inspect Server Rack', variant: 'subtle', iconName: 'server', onClick: () => this.selectObject('server-rack') },
        { type: 'button', label: 'Inspect Meeting Room', variant: 'subtle', iconName: 'meeting', onClick: () => this.selectObject('meeting-room') },
        { type: 'button', label: 'Inspect Kitchen', variant: 'subtle', iconName: 'coffee', onClick: () => this.selectObject('kitchen-area') },
      ] }],
      note: 'Modern office facility with 4 dual-monitor workstations, meeting room, server/network rack, kitchen/break area. All loads served from the inverter bus with priority-based shedding.',
    };
  }

  _getOfficeOccupancy() {
    const hour = (this.simTime / 3600) % 24;
    if (hour >= 7 && hour < 19) return 'OCCUPIED (Business hours)';
    if (hour >= 6 && hour < 22) return 'PARTIAL (Extended hours)';
    return 'EMPTY (After hours - security only)';
  }

  _getActiveWorkstations() {
    const hour = (this.simTime / 3600) % 24;
    const ws = this.config.load.loads.find(l => l.id === 'workstations');
    if (!ws || !ws.enabled) return '0/8 (Powered off)';
    if (hour >= 7 && hour < 19) return '8/8 (All active)';
    if (hour >= 6 && hour < 22) return '4/8 (Partial)';
    return '0/8 (After hours)';
  }

  _getServerRackStatus() {
    const sr = this.config.load.loads.find(l => l.id === 'server_rack');
    if (!sr || !sr.enabled) return 'OFFLINE';
    return `ONLINE · ${sr.watts}W continuous`;
  }

  loadInspector(obj) {
    const map = {
      'load-pump': 'pump',
      'load-compressor': 'hvac',
      'load-machines': 'machines',
      'load-bank': 'loadbank',
      'load-control': 'comms',
      'workstation-0': 'workstations',
      'workstation-1': 'workstations',
      'workstation-2': 'workstations',
      'workstation-3': 'workstations',
      'meeting-room': 'office_lighting',
      'server-rack': 'server_rack',
      'kitchen-area': 'kitchen',
      'reception-desk': 'comms',
    };
    const loadId = map[obj.id] || 'machines';
    const load = this.config.load.loads.find(l => l.id === loadId);
    const served = this.loadDemand > 0 ? this.loadServed * (load && load.watts ? load.watts / this.loadDemand : 0) : 0;
    const controls = load ? [
      { type: 'toggle', label: 'Circuit enabled', value: load.enabled, onChange: v => { load.enabled = v; this.saveSoon(); this.updateLoadVisuals(0); this.refreshInspector(); } },
      { type: 'slider', label: 'Rated power', min: 0, max: 3000, step: 10, value: load.watts, unit: 'W', onChange: v => { load.watts = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'toggle', label: 'Essential load', description: 'Essential circuits are never shed.', value: load.essential, onChange: v => { load.essential = v; this.saveSoon(); this.refreshInspector(); } },
      { type: 'button', label: 'Open Load Management', iconName: 'bolt', onClick: () => this.setTab('spawn') },
    ] : [];
    return {
      title: obj.label,
      subtitle: `CONNECTED LOAD · ${loadId.toUpperCase()}`,
      iconName: obj.iconName || 'motor',
      badge: () => ({ text: !load ? 'UNKNOWN' : !load.enabled ? 'OFFLINE' : served > 5 ? 'RUNNING' : 'WAITING', tone: !load ? 'muted' : !load.enabled ? 'warn' : served > 5 ? 'ok' : 'warn' }),
      fields: [
        { label: 'Circuit', value: load ? load.name : '—' },
        { label: 'Rated power', get: () => `${load ? load.watts : 0} W` },
        { label: 'Allocated supply', get: () => `${fmt(served, 0)} W` },
        { label: 'Priority', get: () => load && load.essential ? 'ESSENTIAL' : 'NON-ESSENTIAL' },
        { label: 'Bus state', get: () => this.config.load.enabled ? 'ENERGISED' : 'ISOLATED' },
      ],
      sections: controls.length ? [{ title: 'Load Controls', controls }] : [],
      note: 'Each machine draws from the shared AC bus. Demand changes are reflected immediately in the energy balance and inverter output.',
    };
  }

  workstationInspector(obj) {
    const load = this.config.load.loads.find(l => l.id === 'workstations');
    const served = this.loadDemand > 0 ? this.loadServed * (load && load.watts ? load.watts / this.loadDemand : 0) : 0;
    const hour = (this.simTime / 3600) % 24;
    const isBusinessHours = hour >= 7 && hour < 19;
    return {
      title: obj.label,
      subtitle: 'DUAL-MONITOR WORKSTATION',
      iconName: 'computers',
      badge: () => ({ text: !load ? 'UNKNOWN' : !load.enabled ? 'OFFLINE' : isBusinessHours ? 'ACTIVE' : 'IDLE', tone: !load ? 'muted' : !load.enabled ? 'warn' : isBusinessHours ? 'ok' : 'muted' }),
      fields: [
        { label: 'Circuit', value: 'Computer Workstations' },
        { label: 'Rated power', get: () => `${load ? load.watts : 0} W` },
        { label: 'Allocated supply', get: () => `${fmt(served, 0)} W` },
        { label: 'Workstations', value: '4 × Dual-monitor setups' },
        { label: 'Status', get: () => isBusinessHours ? 'ACTIVE (Business hours)' : 'IDLE (After hours)' },
        { label: 'Priority', get: () => load && load.essential ? 'ESSENTIAL' : 'NON-ESSENTIAL' },
        { label: 'Bus state', get: () => this.config.load.enabled ? 'ENERGISED' : 'ISOLATED' },
      ],
      sections: [{
        title: 'Workstation Controls', controls: [
          { type: 'toggle', label: 'Circuit enabled', value: load.enabled, onChange: v => { load.enabled = v; this.saveSoon(); this.updateLoadVisuals(0); this.refreshInspector(); } },
          { type: 'slider', label: 'Rated power', min: 0, max: 1500, step: 10, value: load.watts, unit: 'W', onChange: v => { load.watts = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Essential load', description: 'Essential circuits are never shed.', value: load.essential, onChange: v => { load.essential = v; this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
      note: 'Each workstation features dual monitors, ergonomic chair, task lighting, and cable management. Power draw scales with active usage during business hours.',
    };
  }

  meetingRoomInspector() {
    const load = this.config.load.loads.find(l => l.id === 'office_lighting');
    const served = this.loadDemand > 0 ? this.loadServed * (load && load.watts ? load.watts / this.loadDemand : 0) : 0;
    return {
      title: 'Meeting Room',
      subtitle: 'CONFERENCE FACILITY · 6-SEAT',
      iconName: 'meeting',
      badge: () => ({ text: this.config.load.enabled ? 'AVAILABLE' : 'POWER OFF', tone: this.config.load.enabled ? 'ok' : 'warn' }),
      fields: [
        { label: 'Circuit', value: 'Office Lighting (shared)' },
        { label: 'Allocated supply', get: () => `${fmt(served, 0)} W` },
        { label: 'Capacity', value: '6 persons' },
        { label: 'Equipment', value: 'Display screen, whiteboard, LED lighting' },
        { label: 'Bus state', get: () => this.config.load.enabled ? 'ENERGISED' : 'ISOLATED' },
      ],
      sections: [],
      note: 'Meeting room shares the office lighting circuit. Features wall-mounted display, whiteboard, and dedicated LED lighting panel.',
    };
  }

  serverRackInspector() {
    const load = this.config.load.loads.find(l => l.id === 'server_rack');
    const served = this.loadDemand > 0 ? this.loadServed * (load && load.watts ? load.watts / this.loadDemand : 0) : 0;
    return {
      title: 'Server & Network Rack',
      subtitle: '12U RACK · NETWORK & STORAGE',
      iconName: 'server',
      badge: () => ({ text: load && load.enabled ? 'ONLINE' : 'OFFLINE', tone: load && load.enabled ? 'ok' : 'warn' }),
      fields: [
        { label: 'Circuit', value: 'Server Rack (24/7 Essential)' },
        { label: 'Rated power', get: () => `${load ? load.watts : 0} W` },
        { label: 'Allocated supply', get: () => `${fmt(served, 0)} W` },
        { label: 'Equipment', value: 'Network switches, firewall, NAS, UPS' },
        { label: 'Rack units', value: '12U occupied' },
        { label: 'Cooling', value: 'Active rack fan + roof HVAC' },
        { label: 'Priority', get: () => load && load.essential ? 'ESSENTIAL (Never shed)' : 'NON-ESSENTIAL' },
        { label: 'Bus state', get: () => this.config.load.enabled ? 'ENERGISED' : 'ISOLATED' },
      ],
      sections: [{
        title: 'Server Rack Controls', controls: [
          { type: 'toggle', label: 'Circuit enabled', value: load.enabled, onChange: v => { load.enabled = v; this.saveSoon(); this.updateLoadVisuals(0); this.refreshInspector(); } },
          { type: 'slider', label: 'Rated power', min: 200, max: 800, step: 10, value: load.watts, unit: 'W', onChange: v => { load.watts = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Essential load', description: 'Essential circuits are never shed.', value: load.essential, onChange: v => { load.essential = v; this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
      note: 'Critical 24/7 infrastructure. Contains managed switches, firewall appliance, NAS storage, and UPS backup. Protected from load shedding.',
    };
  }

  kitchenInspector() {
    const load = this.config.load.loads.find(l => l.id === 'kitchen');
    const served = this.loadDemand > 0 ? this.loadServed * (load && load.watts ? load.watts / this.loadDemand : 0) : 0;
    const hour = (this.simTime / 3600) % 24;
    const isActive = hour >= 7 && hour < 18;
    return {
      title: 'Kitchen / Break Area',
      subtitle: 'COFFEE · MICROWAVE · FRIDGE · SINK',
      iconName: 'coffee',
      badge: () => ({ text: isActive ? 'IN USE' : 'IDLE', tone: isActive ? 'ok' : 'muted' }),
      fields: [
        { label: 'Circuit', value: 'Kitchen Appliances' },
        { label: 'Rated power', get: () => `${load ? load.watts : 0} W` },
        { label: 'Allocated supply', get: () => `${fmt(served, 0)} W` },
        { label: 'Appliances', value: 'Coffee machine (800W), Microwave (1000W), Fridge (150W)' },
        { label: 'Status', get: () => isActive ? 'ACTIVE (Break hours)' : 'STANDBY (Fridge only)' },
        { label: 'Priority', get: () => load && load.essential ? 'ESSENTIAL' : 'NON-ESSENTIAL' },
        { label: 'Bus state', get: () => this.config.load.enabled ? 'ENERGISED' : 'ISOLATED' },
      ],
      sections: [{
        title: 'Kitchen Controls', controls: [
          { type: 'toggle', label: 'Circuit enabled', value: load.enabled, onChange: v => { load.enabled = v; this.saveSoon(); this.updateLoadVisuals(0); this.refreshInspector(); } },
          { type: 'slider', label: 'Rated power', min: 300, max: 2000, step: 10, value: load.watts, unit: 'W', onChange: v => { load.watts = v; this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
      note: 'Kitchen circuit powers coffee machine, microwave, and refrigerator. Fridge runs 24/7. Coffee machine and microwave active during break hours (7-18). Non-essential load subject to shedding.',
    };
  }

  receptionInspector() {
    const load = this.config.load.loads.find(l => l.id === 'comms');
    const served = this.loadDemand > 0 ? this.loadServed * (load && load.watts ? load.watts / this.loadDemand : 0) : 0;
    return {
      title: 'Reception Desk',
      subtitle: 'VISITOR CHECK-IN · WORKSTATION',
      iconName: 'computers',
      badge: () => ({ text: this.config.load.enabled ? 'ONLINE' : 'OFFLINE', tone: this.config.load.enabled ? 'ok' : 'warn' }),
      fields: [
        { label: 'Circuit', value: 'Control & Comms (Essential)' },
        { label: 'Rated power', get: () => `${load ? load.watts : 0} W` },
        { label: 'Allocated supply', get: () => `${fmt(served, 0)} W` },
        { label: 'Equipment', value: 'Single monitor workstation, check-in system' },
        { label: 'Priority', get: () => load && load.essential ? 'ESSENTIAL' : 'NON-ESSENTIAL' },
        { label: 'Bus state', get: () => this.config.load.enabled ? 'ENERGISED' : 'ISOLATED' },
      ],
      sections: [{
        title: 'Reception Controls', controls: [
          { type: 'toggle', label: 'Circuit enabled', value: load.enabled, onChange: v => { load.enabled = v; this.saveSoon(); this.updateLoadVisuals(0); this.refreshInspector(); } },
          { type: 'toggle', label: 'Essential load', description: 'Essential circuits are never shed.', value: load.essential, onChange: v => { load.essential = v; this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
      note: 'Reception workstation runs on the essential Control & Comms circuit. Always powered for security and visitor management.',
    };
  }

  loadBankInspector() {
    const load = this.config.load.loads.find(l => l.id === 'loadbank');
    return {
      title: 'Resistive Load Bank',
      subtitle: 'COMMISSIONING LOAD · 0–2.5 kW',
      iconName: 'bolt',
      badge: () => ({ text: load && load.enabled && load.watts > 0 ? 'LOADING' : 'STANDBY', tone: load && load.watts > 0 ? 'warn' : 'muted' }),
      fields: [
        { label: 'Set power', get: () => `${load ? load.watts : 0} W` },
        { label: 'Absorbed', get: () => `${fmt(this.config.load.loads.find(l => l.id === 'loadbank') && load && load.enabled ? Math.min(load.watts, this.loadServed * (load.watts / Math.max(1, this.loadDemand))) : 0, 0)} W` },
        { label: 'Element temperature', get: () => this.loadBankMats && this.loadBankMats[0] ? `${fmt(28 + this.loadBankMats[0].emissiveIntensity * 46, 0)} °C` : '—' },
        { label: 'Demand limit', get: () => `${this.threshold('excessLoad', 4300)} W` },
      ],
      sections: [{ title: 'Load Bank Controls', controls: [
        { type: 'slider', label: 'Load power setpoint', min: 0, max: 2500, step: 10, value: load ? load.watts : 0, unit: 'W', onChange: v => { if (load) { load.watts = v; this.saveSoon(); this.refreshInspector(); } } },
        { type: 'toggle', label: 'Circuit enabled', value: load ? load.enabled : false, onChange: v => { if (load) { load.enabled = v; this.saveSoon(); this.refreshInspector(); } } },
        { type: 'button', label: 'Open Load Management', iconName: 'bolt', onClick: () => this.setTab('spawn') },
      ] }],
      note: 'The load bank absorbs surplus generation for commissioning tests. Increasing it demonstrates inverter limits, demand alarms and battery discharge.',
    };
  }

  loadControlInspector() {
    return {
      title: 'Load Control Panel',
      subtitle: 'LOCAL BREAKER PANEL & METER',
      iconName: 'sliders',
      badge: () => ({ text: this.config.load.enabled ? 'ENERGISED' : 'ISOLATED', tone: this.config.load.enabled ? 'ok' : 'warn' }),
      fields: [
        { label: 'Bus voltage', get: () => `${this.config.inverter.outputVoltage} V AC` },
        { label: 'Bus frequency', value: '50.0 Hz' },
        { label: 'Served power', get: () => `${fmt(this.loadServed, 0)} W` },
        { label: 'Demand', get: () => `${fmt(this.loadDemand, 0)} W` },
        { label: 'Circuits', get: () => `${this.config.load.loads.filter(l => l.enabled).length} / ${this.config.load.loads.length} active` },
      ],
      sections: [{ title: 'Panel Controls', controls: [
        { type: 'toggle', label: 'Main AC breaker', value: this.config.load.enabled, onChange: v => { this.config.load.enabled = v; this.saveSoon(); this.refreshInspector(); } },
        { type: 'button', label: 'Open Load Management', iconName: 'bolt', onClick: () => this.setTab('spawn') },
      ] }],
    };
  }

  signInspector(obj) {
    return {
      title: obj.label,
      subtitle: 'FACILITY SIGNAGE',
      iconName: 'sign',
      badge: { text: 'STATIC ASSET', tone: 'muted' },
      fields: [
        { label: 'Text', value: 'NEXUS SOLAR FARM · SOL-05' },
        { label: 'Facility', value: this.meta.name },
        { label: 'Code', value: this.meta.code },
      ],
      sections: [],
      note: 'Static asset — not part of the live simulation loop.',
    };
  }

  lampInspector(obj) {
    const dusk = this.sunElev < .1;
    return {
      title: obj.label,
      subtitle: 'SITE LIGHTING · PHOTOCELL',
      iconName: 'light',
      badge: { text: dusk ? 'LIT' : 'STANDBY', tone: dusk ? 'ok' : 'muted' },
      fields: [
        { label: 'Circuit', value: 'LED-01 · 230 V AC' },
        { label: 'Control', value: 'Dusk-to-dawn photocell' },
        { label: 'Ambient irradiance', get: () => `${fmt(this.irradiance, 0)} W/m²` },
        { label: 'State', get: () => this.sunElev < .1 ? 'ON' : 'OFF (daylight)' },
      ],
      sections: [],
    };
  }

  stationInspector(obj) {
    return {
      title: 'Solar Monitoring Station',
      subtitle: 'PYRANOMETER · AIR TEMPERATURE · WIND',
      iconName: 'sun',
      badge: () => ({ text: 'ONLINE', tone: 'ok' }),
      fields: [
        { label: 'Irradiance', get: () => `${fmt(this.irradiance, 0)} W/m²` },
        { label: 'Air temperature', get: () => `${fmt(this.ambientTemp, 1)} °C` },
        { label: 'Panel temperature', get: () => `${fmt(this.panelTemp, 1)} °C` },
        { label: 'Cloud cover', get: () => `${fmt(this.config.sun.cloudCover * 100, 0)} %` },
        { label: 'Sun elevation', get: () => `${fmt(this.sunElev * 90, 0)}°` },
        { label: 'Irradiance source', get: () => this.config.sun.mode === 'auto' ? 'SUN CURVE' : 'MANUAL SETPOINT' },
      ],
      sections: [{ title: 'Instrumentation', controls: [
        { type: 'slider', label: 'Sunlight intensity', min: 0, max: 2, step: .05, value: this.config.sun.intensity, unit: '×', onChange: v => { this.config.sun.intensity = v; this.saveSoon(); this.refreshInspector(); } },
        { type: 'slider', label: 'Cloud cover', min: 0, max: .9, step: .01, value: this.config.sun.cloudCover, unit: '', onChange: v => { this.config.sun.cloudCover = v; this.saveSoon(); this.refreshInspector(); } },
      ] }],
    };
  }

  /* =========================================================
     Dashboard / overview
     ========================================================= */
  getOverviewMetrics() {
    return [
      {
        label: 'Solar Generation', iconName: 'solar',
        bind: () => ({ value: fmt(this.solarPower / 1000, 2), unit: 'kW', tone: this.solarPower > 100 ? 'ok' : 'muted', sub: `${fmt(this.irradiance, 0)} W/m² irradiance` }),
      },
      {
        label: 'Battery SOC', iconName: 'battery',
        bind: () => ({ value: fmt(this.batterySoc, 0), unit: '%', tone: this.batterySoc < 20 ? 'danger' : this.batterySoc < 40 ? 'warn' : 'ok', sub: `${fmt(this.energyStoredWh() / 1000, 1)} kWh stored` }),
      },
      {
        label: 'Load Served', iconName: 'motor',
        bind: () => ({ value: fmt(this.loadServed / 1000, 2), unit: 'kW', tone: this.unservedLoad > 50 ? 'danger' : this.loadDemand > this.threshold('excessLoad', 4300) ? 'warn' : 'ok', sub: `${fmt(this.loadDemand / 1000, 2)} kW demand` }),
      },
      {
        label: 'PV Energy Today', iconName: 'chart',
        bind: () => ({ value: fmt(this.energyTodayWh / 1000, 2), unit: 'kWh', tone: 'ok', sub: 'Cumulative yield' }),
      },
      {
        label: 'System Efficiency', iconName: 'gauge',
        bind: () => ({ value: fmt(this.systemEff, 1), unit: '%', tone: this.systemEff > 70 ? 'ok' : this.systemEff > 30 ? 'warn' : 'muted', sub: 'PV → load + charge' }),
      },
      {
        label: 'Power Balance', iconName: 'bolt',
        bind: () => ({
          value: `${this.netPower >= 0 ? '+' : ''}${fmt(this.netPower / 1000, 2)}`,
          unit: 'kW',
          tone: this.chargeDC > 5 ? 'ok' : this.dischargeDC > 5 ? 'warn' : 'muted',
          sub: this.chargeDC > 5 ? 'Charging battery' : this.dischargeDC > 5 ? 'Battery discharging' : 'Battery idle',
        }),
      },
    ];
  }

  overviewExtra(body) {
    // ---- live energy flow -------------------------------------------------
    const sec = el('div', { class: 'section' });
    sec.appendChild(el('div', { class: 'section-title' }, ui.icon('bolt', 12), 'Energy Flow', el('span', { class: 'side', text: 'LIVE ROUTING' })));
    const card = el('div', { class: 'section-card' });
    const flowDefs = [
      { label: 'Generation', color: '#ffc247', get: () => this.solarPower, max: 7200 },
      { label: 'Charging', color: '#3ce58b', get: () => this.chargeDC, max: 5200 },
      { label: 'Discharging', color: '#ff8a3d', get: () => this.dischargeDC, max: 5200 },
      { label: 'Load Delivery', color: '#46a9ff', get: () => this.inverterOut, max: 5200 },
    ];
    for (const f of flowDefs) {
      const row = el('div', { style: { marginBottom: '8px' } });
      const top = el('div', { class: 'row spaced', style: { marginBottom: '3px' } });
      const lab = el('span', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '8.5px', color: 'var(--muted)', letterSpacing: '.04em' } });
      lab.append(el('span', { style: { width: '7px', height: '7px', borderRadius: '50%', background: f.color, boxShadow: `0 0 6px ${f.color}` } }), f.label.toUpperCase());
      const val = el('b', { style: { fontFamily: 'var(--mono)', fontSize: '9.5px', color: f.color } });
      top.append(lab, val);
      const bar = ui.progressBar(0);
      row.append(top, bar);
      this.addPanelBind(() => {
        const v = Math.max(0, f.get());
        val.textContent = v >= 1000 ? `${(v / 1000).toFixed(2)} kW` : `${Math.round(v)} W`;
        bar._set((v / f.max) * 100);
        bar.firstChild.style.background = f.color;
      });
      card.appendChild(row);
    }
    const battRow = el('div', { class: 'row spaced', style: { marginTop: '2px', marginBottom: '3px' } });
    const bVal = el('b', { style: { fontFamily: 'var(--mono)', fontSize: '9.5px' } });
    battRow.append(el('span', { style: { fontSize: '8.5px', color: 'var(--muted)' }, text: 'BATTERY STATE OF CHARGE' }), bVal);
    const socBar = ui.progressBar(0);
    card.append(battRow, socBar);
    this.addPanelBind(() => {
      const soc = this.batterySoc;
      bVal.textContent = `${fmt(soc, 0)} %`;
      bVal.style.color = soc < 20 ? 'var(--danger)' : soc < 40 ? 'var(--warn)' : 'var(--ok)';
      socBar._set(soc);
      socBar.className = `progress ${soc < 20 ? 'danger' : soc < 40 ? 'warn' : ''}`;
    });
    sec.appendChild(card);
    body.appendChild(sec);

    // ---- energy accounting ----------------------------------------------
    const balSec = el('div', { class: 'section' });
    balSec.appendChild(el('div', { class: 'section-title' }, ui.icon('chart', 12), 'Energy Accounting', el('span', { class: 'side', text: 'TODAY' })));
    const kv = el('div', { class: 'kv-list section-card', style: { padding: '4px 10px' } });
    kv.append(
      ui.kvRow('PV produced', '', { bind: () => `${fmt(this.energyTodayWh / 1000, 2)} kWh` }),
      ui.kvRow('Load consumed', '', { bind: () => `${fmt(this.consumedTodayWh / 1000, 2)} kWh` }),
      ui.kvRow('Energy charged', '', { bind: () => `${fmt(this.chargedTodayWh / 1000, 2)} kWh` }),
      ui.kvRow('Energy discharged', '', { bind: () => `${fmt(this.dischargedTodayWh / 1000, 2)} kWh` }),
      ui.kvRow('System efficiency', '', { bind: () => `${fmt(this.systemEff, 1)} %` }),
      ui.kvRow('Curtailed surplus', '', { bind: () => `${fmt(this.curtailed, 0)} W` }),
    );
    balSec.appendChild(kv);
    body.appendChild(balSec);

    // ---- load profile snapshot ------------------------------------------
    const loadSec = el('div', { class: 'section' });
    loadSec.appendChild(el('div', { class: 'section-title' }, ui.icon('motor', 12), 'Load Snapshot', el('span', { class: 'side' })));
    const listCard = el('div', { class: 'section-card', style: { padding: '4px 10px' } });
    const list = el('div');
    let sig = '';
    const renderList = () => {
      const key = `${this.config.load.loads.map(l => `${l.id}${l.enabled}${l.watts}${l.essential}`).join('|')}${this.shedding}`;
      if (key === sig) return;
      sig = key;
      ui.clear(list);
      for (const l of this.config.load.loads) {
        const on = l.enabled && !(this.shedding && !l.essential) && this.config.load.enabled;
        const row = el('div', { class: 'kv-row', style: { minHeight: '24px' } });
        const dot = el('span', { style: { width: '6px', height: '6px', borderRadius: '50%', marginRight: '6px', background: on ? '#3ce58b' : '#4a545e' } });
        row.append(el('span', { class: 'k', style: { flex: 1 } }, dot, l.name), el('span', { class: 'v', text: `${l.watts} W${l.essential ? ' · E' : ''}` }));
        list.appendChild(row);
      }
      if (!this.config.load.loads.length) list.appendChild(el('div', { class: 'empty', text: 'No load circuits configured.' }));
    };
    renderList();
    this.addPanelBind(renderList);
    listCard.appendChild(list);
    this.addPanelBind(() => {
      const side = loadSec.querySelector('.side');
      if (side) side.textContent = `${fmt(this.loadDemand, 0)} W DEMAND`;
    });
    loadSec.appendChild(listCard);
    body.appendChild(loadSec);
  }

  getQuickActions() {
    return [
      {
        label: this.arrayEnabled ? 'Isolate PV Array' : 'Enable PV Array', icon: 'solar',
        variant: this.arrayEnabled ? undefined : 'subtle',
        onClick: () => { this.setArrayEnabled(!this.arrayEnabled); this.renderPanel(); },
      },
      { label: 'Force Battery Charge', icon: 'battery', onClick: () => { this.setBatteryMode('charge'); ui.toast('Battery operating mode set to FORCE CHARGE.', { type: 'info' }); } },
      { label: 'Battery SOC 60%', icon: 'reset', onClick: () => { this.setBatterySoc(60); ui.toast('Battery state of charge set to 60%.', { type: 'ok' }); } },
      { label: 'Load Management', icon: 'bolt', onClick: () => this.setTab('spawn') },
    ];
  }

  getLegend() {
    return [
      { color: '#ffc247', label: 'Generation flow', value: 'PV → controller' },
      { color: '#3ce58b', label: 'Charging flow', value: 'Controller → battery' },
      { color: '#ff8a3d', label: 'Discharging flow', value: 'Battery → inverter' },
      { color: '#46a9ff', label: 'Load delivery', value: 'Inverter → loads' },
      { color: '#a98bff', label: 'High voltage DC', value: 'Site accent' },
    ];
  }

  /* =========================================================
     Operations tab
     ========================================================= */
  buildOperations(container) {
    const cfg = this.config;
    container.appendChild(ui.notice('Every control acts on the live energy model. Changes are reflected immediately in the 3D environment, sensors and dashboards.'));

    /* ---- generation ---- */
    const genSec = el('div', { class: 'section' });
    genSec.appendChild(el('div', { class: 'section-title' }, ui.icon('solar', 12), 'Photovoltaic Generation', el('span', { class: 'side', text: '12 MODULES' })));
    const genCard = el('div', { class: 'section-card' });
    genCard.appendChild(ui.toggle({ label: 'Array master enable', description: 'Connect or isolate the full PV array.', value: this.arrayEnabled, onChange: v => { this.setArrayEnabled(v); this.renderPanel(); } }));
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', margin: '8px 0' } });
    for (const p of this.panelStates) {
      const b = el('button', {
        class: `btn small ${p.enabled ? 'subtle' : 'ghost'}`,
        title: `Row ${p.row} · module ${p.serial}`,
        style: { padding: '4px 0', minWidth: '0', fontSize: '8px', justifyContent: 'center' },
        text: `P${p.serial}`,
        onClick: () => { this.setPanelEnabled(p, !p.enabled); this.renderPanel(); },
      });
      grid.appendChild(b);
    }
    genCard.appendChild(grid);
    genCard.appendChild(ui.kvRow('Array output', '', { bind: () => `${fmt(this.solarPower / 1000, 2)} kW · ${fmt(this.pvCurrent, 1)} A @ ${fmt(this.pvVoltage, 1)} V` }));
    genCard.appendChild(ui.segmentedControl('Irradiance source', [{ value: 'auto', label: 'Sun curve' }, { value: 'manual', label: 'Manual' }], cfg.sun.mode, v => { cfg.sun.mode = v; this.saveSoon(); this.renderPanel(); }));
    genCard.appendChild(ui.slider({ label: 'Manual irradiance', min: 0, max: 1200, step: 10, value: cfg.sun.irradiance, unit: 'W/m²', disabled: cfg.sun.mode !== 'manual', onInput: v => { cfg.sun.irradiance = v; }, onChange: () => this.saveSoon() }));
    genCard.appendChild(ui.slider({ label: 'Sunlight intensity', min: 0, max: 2, step: .05, value: cfg.sun.intensity, unit: '×', onInput: v => { cfg.sun.intensity = v; }, onChange: () => this.saveSoon() }));
    genCard.appendChild(ui.slider({ label: 'Cloud cover', min: 0, max: .9, step: .01, value: cfg.sun.cloudCover, unit: '×', onInput: v => { cfg.sun.cloudCover = v; }, onChange: () => this.saveSoon() }));
    genCard.appendChild(ui.slider({ label: 'Nameplate module voltage', min: 20, max: 55, step: .1, value: cfg.panel.voltage, unit: 'V', onInput: v => { cfg.panel.voltage = v; }, onChange: () => this.saveSoon() }));
    genCard.appendChild(ui.slider({ label: 'String current limit', min: 4, max: 20, step: .1, value: cfg.panel.current, unit: 'A', onInput: v => { cfg.panel.current = v; }, onChange: () => this.saveSoon() }));
    genCard.appendChild(ui.slider({ label: 'Module efficiency', min: 8, max: 32, step: .5, value: cfg.panel.efficiency, unit: '%', onInput: v => { cfg.panel.efficiency = v; }, onChange: () => this.saveSoon() }));
    genCard.appendChild(ui.toggle({ label: 'Manual module temperature', description: 'Override the thermal derating model.', value: cfg.panel.tempMode === 'manual', onChange: v => { cfg.panel.tempMode = v ? 'manual' : 'auto'; if (v) cfg.panel.temp = Math.round(this.panelTemp); this.saveSoon(); this.renderPanel(); } }));
    genCard.appendChild(ui.slider({ label: 'Module temperature', min: -5, max: 90, step: 1, value: Math.round(cfg.panel.tempMode === 'manual' ? cfg.panel.temp : this.panelTemp), unit: '°C', disabled: cfg.panel.tempMode !== 'manual', onInput: v => { cfg.panel.temp = v; }, onChange: () => this.saveSoon() }));
    const showAll = el('div', { class: 'btn-row' });
    showAll.append(
      ui.button('Enable All Modules', { size: 'small', iconName: 'check', onClick: () => { this.setAllPanels(true); this.renderPanel(); } }),
      ui.button('Isolate All Modules', { size: 'small', variant: 'warn', iconName: 'eyeOff', onClick: () => { this.setAllPanels(false); this.renderPanel(); } }),
    );
    genCard.appendChild(showAll);
    genSec.appendChild(genCard);
    container.appendChild(genSec);

    /* ---- battery ---- */
    const batSec = el('div', { class: 'section' });
    batSec.appendChild(el('div', { class: 'section-title' }, ui.icon('battery', 12), 'Battery Storage', el('span', { class: 'side', text: `${cfg.battery.capacity} Ah` })));
    const batCard = el('div', { class: 'section-card' });
    batCard.appendChild(ui.toggle({ label: 'Battery bank enabled', description: 'Main contactor. When open, storage is unavailable.', value: cfg.battery.on, onChange: v => { cfg.battery.on = v; this.logEvent(v ? 'Battery connected' : 'Battery disconnected', 'Main battery contactor.', v ? 'ok' : 'warn'); this.saveSoon(); this.renderPanel(); } }));
    batCard.appendChild(ui.kvRow('State of charge', '', { bind: () => `${fmt(this.batterySoc, 1)} % · ${fmt(this.energyStoredWh() / 1000, 2)} kWh` }));
    const socBar = ui.progressBar(0);
    batCard.appendChild(socBar);
    this.addPanelBind(() => { socBar._set(this.batterySoc); socBar.className = `progress ${this.batterySoc < 20 ? 'danger' : this.batterySoc < 40 ? 'warn' : ''}`; });
    batCard.appendChild(ui.slider({ label: 'State of charge setpoint', min: 0, max: 100, step: 1, value: Math.round(this.batterySoc), unit: '%', onChange: v => { this.setBatterySoc(v); this.renderPanel(); } }));
    batCard.appendChild(ui.segmentedControl('Operating mode', [{ value: 'auto', label: 'Auto' }, { value: 'charge', label: 'Charge' }, { value: 'discharge', label: 'Discharge' }, { value: 'idle', label: 'Idle' }], cfg.battery.mode, v => { this.setBatteryMode(v); this.renderPanel(); }));
    batCard.appendChild(ui.slider({ label: 'Rated capacity', min: 50, max: 400, step: 5, value: cfg.battery.capacity, unit: 'Ah', onInput: v => { cfg.battery.capacity = v; }, onChange: () => this.saveSoon() }));
    batCard.appendChild(ui.slider({ label: 'Charge rate limit', min: .1, max: 1.5, step: .05, value: cfg.battery.chargeRate, unit: 'C', onInput: v => { cfg.battery.chargeRate = v; }, onChange: () => this.saveSoon() }));
    batCard.appendChild(ui.toggle({ label: 'Manual battery temperature', value: cfg.battery.tempMode === 'manual', onChange: v => { cfg.battery.tempMode = v ? 'manual' : 'auto'; if (v) cfg.battery.temp = Math.round(this.batteryTemp); this.saveSoon(); this.renderPanel(); } }));
    batCard.appendChild(ui.slider({ label: 'Battery temperature', min: -5, max: 80, step: 1, value: Math.round(this.batteryTemp), unit: '°C', disabled: cfg.battery.tempMode !== 'manual', onInput: v => { cfg.battery.temp = v; this.batteryTemp = v; }, onChange: () => this.saveSoon() }));
    batCard.appendChild(ui.slider({ label: 'State of health', min: 30, max: 100, step: 1, value: Math.round(this.batteryHealth), unit: '%', onInput: v => { this.batteryHealth = v; cfg.battery.health = v; }, onChange: () => this.saveSoon() }));
    batCard.appendChild(ui.toggle({ label: 'Inject battery failure', value: cfg.battery.failure, onChange: v => { cfg.battery.failure = v; this.evaluateAlarms(); this.saveSoon(); this.renderPanel(); } }));
    batCard.appendChild(ui.toggle({ label: 'Simulate battery over-temperature', description: 'Ramps the bank temperature to the trip range.', value: cfg.battery.overheat, onChange: v => { cfg.battery.overheat = v; this.evaluateAlarms(); this.saveSoon(); this.renderPanel(); } }));
    const socRow = el('div', { class: 'btn-row' });
    socRow.append(
      ui.button('SOC 20%', { size: 'small', iconName: 'battery', onClick: () => { this.setBatterySoc(20); this.renderPanel(); } }),
      ui.button('SOC 50%', { size: 'small', iconName: 'battery', onClick: () => { this.setBatterySoc(50); this.renderPanel(); } }),
      ui.button('SOC 80%', { size: 'small', iconName: 'battery', onClick: () => { this.setBatterySoc(80); this.renderPanel(); } }),
    );
    batCard.appendChild(socRow);
    batSec.appendChild(batCard);
    container.appendChild(batSec);

    /* ---- controller ---- */
    const ctrlSec = el('div', { class: 'section' });
    ctrlSec.appendChild(el('div', { class: 'section-title' }, ui.icon('bolt', 12), 'MPPT Charge Controller'));
    const ctrlCard = el('div', { class: 'section-card' });
    ctrlCard.appendChild(ui.toggle({ label: 'Controller enabled', value: cfg.controller.enabled, onChange: v => { cfg.controller.enabled = v; this.saveSoon(); this.renderPanel(); } }));
    ctrlCard.appendChild(ui.segmentedControl('Tracking algorithm', [{ value: 'mppt', label: 'MPPT' }, { value: 'pwm', label: 'PWM' }], cfg.controller.mode, v => { cfg.controller.mode = v; this.saveSoon(); this.renderPanel(); }));
    ctrlCard.appendChild(ui.toggle({ label: 'Automatic charging', description: 'When off, only Force Charge mode replenishes the bank.', value: cfg.controller.auto, onChange: v => { cfg.controller.auto = v; this.saveSoon(); this.renderPanel(); } }));
    ctrlCard.appendChild(ui.slider({ label: 'Maximum charge current', min: 10, max: 180, step: 1, value: cfg.controller.maxCurrent, unit: 'A', onInput: v => { cfg.controller.maxCurrent = v; }, onChange: () => this.saveSoon() }));
    ctrlCard.appendChild(ui.slider({ label: 'Charge voltage limit', min: 48, max: 60, step: .1, value: cfg.controller.chargeVoltage, unit: 'V', onInput: v => { cfg.controller.chargeVoltage = v; }, onChange: () => this.saveSoon() }));
    ctrlCard.appendChild(ui.segmentedControl('Power priority', [{ value: 'battery', label: 'Battery first' }, { value: 'load', label: 'Load first' }], cfg.controller.priority, v => { cfg.controller.priority = v; this.saveSoon(); this.renderPanel(); }));
    ctrlCard.appendChild(ui.toggle({ label: 'Deep-discharge protection', value: cfg.controller.protection, onChange: v => { cfg.controller.protection = v; this.saveSoon(); this.renderPanel(); } }));
    ctrlCard.appendChild(ui.toggle({ label: 'Inject controller failure', value: cfg.controller.failure, onChange: v => { cfg.controller.failure = v; this.evaluateAlarms(); this.saveSoon(); this.renderPanel(); } }));
    ctrlCard.appendChild(ui.kvRow('Charge power', '', { bind: () => `${fmt(this.chargeDC / 1000, 2)} kW · ${fmt(this.chargeCurrent, 1)} A` }));
    ctrlSec.appendChild(ctrlCard);
    container.appendChild(ctrlSec);

    /* ---- inverter ---- */
    const invSec = el('div', { class: 'section' });
    invSec.appendChild(el('div', { class: 'section-title' }, ui.icon('inverter', 12), 'Hybrid Inverter'));
    const invCard = el('div', { class: 'section-card' });
    invCard.appendChild(ui.toggle({ label: 'Inverter output enabled', value: cfg.inverter.on, onChange: v => { cfg.inverter.on = v; this.saveSoon(); this.renderPanel(); } }));
    invCard.appendChild(ui.segmentedControl('Output voltage', [{ value: 220, label: '220 V' }, { value: 230, label: '230 V' }, { value: 240, label: '240 V' }], cfg.inverter.outputVoltage, v => { cfg.inverter.outputVoltage = +v; this.saveSoon(); this.renderPanel(); }));
    invCard.appendChild(ui.slider({ label: 'Conversion efficiency', min: 70, max: 99, step: .5, value: cfg.inverter.efficiency, unit: '%', onInput: v => { cfg.inverter.efficiency = v; }, onChange: () => this.saveSoon() }));
    invCard.appendChild(ui.toggle({ label: 'Inject inverter failure', value: cfg.inverter.failure, onChange: v => { cfg.inverter.failure = v; this.evaluateAlarms(); this.saveSoon(); this.renderPanel(); } }));
    invCard.appendChild(ui.kvRow('AC output', '', { bind: () => `${fmt(this.inverterOut / 1000, 2)} kW · ${fmt(this.unservedLoad, 0)} W unserved` }));
    invSec.appendChild(invCard);
    container.appendChild(invSec);

    /* ---- loads ---- */
    const loadSec = el('div', { class: 'section' });
    loadSec.appendChild(el('div', { class: 'section-title' }, ui.icon('motor', 12), 'Load Management', el('span', { class: 'side', text: `${cfg.load.loads.length} CIRCUITS` })));
    const loadCard = el('div', { class: 'section-card' });
    loadCard.appendChild(ui.toggle({ label: 'Load bus energised', description: 'Main AC breaker for the utility load centre.', value: cfg.load.enabled, onChange: v => { cfg.load.enabled = v; this.saveSoon(); this.updateLoadVisuals(0); this.renderPanel(); } }));
    const bank = cfg.load.loads.find(l => l.id === 'loadbank');
    loadCard.appendChild(ui.slider({ label: 'Load power setpoint', min: 0, max: 2500, step: 10, value: bank ? bank.watts : 0, unit: 'W', onInput: v => { if (bank) bank.watts = v; }, onChange: () => this.saveSoon() }));
    loadCard.appendChild(ui.toggle({ label: 'Automatic load profile', description: 'Apply per-circuit time schedules in automatic mode.', value: cfg.load.autoProfile, onChange: v => { cfg.load.autoProfile = v; this.saveSoon(); this.renderPanel(); } }));
    loadCard.appendChild(ui.slider({ label: 'Battery reserve for shedding', min: 5, max: 80, step: 1, value: cfg.load.reserveSoc, unit: '%', onInput: v => { cfg.load.reserveSoc = v; }, onChange: () => this.saveSoon() }));
    loadCard.appendChild(ui.kvRow('Connected demand', '', { bind: () => `${fmt(this.loadDemand, 0)} W${this.shedding ? ' · SHEDDING' : ''}` }));
    loadCard.appendChild(ui.button('Open Load Management', { variant: 'subtle', iconName: 'bolt', block: true, onClick: () => this.setTab('spawn') }));
    loadSec.appendChild(loadCard);
    container.appendChild(loadSec);

    /* ---- diagnostics ---- */
    const diagSec = el('div', { class: 'section' });
    diagSec.appendChild(el('div', { class: 'section-title' }, ui.icon('warning', 12), 'Diagnostics & Fault Injection'));
    const diagCard = el('div', { class: 'section-card' });
    const faultBtn = (label, fn) => ui.button(label, { size: 'small', variant: 'warn', iconName: 'alert', onClick: fn });
    diagCard.appendChild(faultBtn('Force Panel Over-Temperature', () => {
      cfg.panel.tempMode = 'manual';
      cfg.panel.temp = 78;
      this.panelTemp = 78;
      this.logEvent('Panel over-temperature injected', 'Thermal fault injection for diagnostics.', 'warn');
      this.evaluateAlarms();
      this.saveSoon();
      this.renderPanel();
    }));
    diagCard.appendChild(faultBtn('Force Low Battery (Shed Test)', () => { this.setBatterySoc(12); this.evaluateAlarms(); this.renderPanel(); }));
    diagCard.appendChild(faultBtn('Disable All Panels (Low Solar)', () => { this.setAllPanels(false); this.evaluateAlarms(); this.renderPanel(); }));
    diagCard.appendChild(ui.button('Restore Diagnostic State', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => {
      cfg.controller.failure = false; cfg.inverter.failure = false; cfg.battery.failure = false; cfg.battery.overheat = false;
      cfg.panel.tempMode = 'auto'; this.batteryHealth = 96; cfg.battery.health = 96;
      this.arrayEnabled = true;
      for (const p of this.panelStates) p.enabled = true;
      this.logEvent('Diagnostic state restored', 'Faults cleared and all generation restored.', 'ok');
      this.evaluateAlarms();
      this.saveSoon();
      this.renderPanel();
    } }));
    diagCard.appendChild(el('div', { class: 'divider' }));
    diagCard.appendChild(el('div', { class: 'kv-list' },
      ui.kvRow('PV produced today', '', { bind: () => `${fmt(this.energyTodayWh / 1000, 2)} kWh` }),
      ui.kvRow('Load consumed today', '', { bind: () => `${fmt(this.consumedTodayWh / 1000, 2)} kWh` }),
      ui.kvRow('Charged / discharged', '', { bind: () => `${fmt(this.chargedTodayWh / 1000, 2)} / ${fmt(this.dischargedTodayWh / 1000, 2)} kWh` }),
      ui.kvRow('System efficiency', '', { bind: () => `${fmt(this.systemEff, 1)} %` }),
      ui.kvRow('Curtailed surplus', '', { bind: () => `${fmt(this.curtailed, 0)} W` }),
    ));
    diagCard.appendChild(ui.button('Reset Energy Counters', { size: 'small', variant: 'ghost', iconName: 'refresh', onClick: () => {
      this.energyTodayWh = 0; this.consumedTodayWh = 0; this.chargedTodayWh = 0; this.dischargedTodayWh = 0;
      this.saveSoon(); this.renderPanel(); ui.toast('Energy counters reset.', { type: 'ok' });
    } }));
    diagSec.appendChild(diagCard);
    container.appendChild(diagSec);
  }

  addLoadCircuit(name, watts) {
    this._loadSerial++;
    const id = `load-${this._loadSerial}`;
    this.config.load.loads.push({
      id, name: name || `Auxiliary Load ${this._loadSerial}`,
      watts: clamp(+watts || 400, 0, 4000), enabled: true, essential: false, startHour: 0, endHour: 24,
    });
    this.logEvent('Load added', `Auxiliary circuit ${id} connected to the AC bus.`, 'ok');
    this.saveSoon();
    this.renderPanel();
    ui.toast('Auxiliary load circuit added.', { type: 'ok' });
  }

  /* =========================================================
     Load Management tab (spawn tab)
     ========================================================= */
  buildSpawning(container) {
    const cfg = this.config;
    container.appendChild(ui.notice('Manage the connected AC load profile. Demand is served from the inverter bus; circuits can be enabled, resized, added or removed live.'));

    const sumSec = el('div', { class: 'section' });
    sumSec.appendChild(el('div', { class: 'section-title' }, ui.icon('motor', 12), 'Demand Summary', el('span', { class: 'side', text: 'LIVE' })));
    const grid = el('div', { class: 'metric-grid' });
    grid.append(
      ui.metric({ label: 'Demand', bind: () => ({ value: fmt(this.loadDemand / 1000, 2), unit: 'kW', tone: this.loadDemand > this.threshold('excessLoad', 4300) ? 'warn' : 'ok' }), iconName: 'motor', compact: true }),
      ui.metric({ label: 'Served', bind: () => ({ value: fmt(this.loadServed / 1000, 2), unit: 'kW', tone: this.unservedLoad > 50 ? 'danger' : 'ok' }), iconName: 'bolt', compact: true }),
      ui.metric({ label: 'Essential', bind: () => ({ value: fmt(this.essentialDemand() / 1000, 2), unit: 'kW' }), iconName: 'shield', compact: true }),
      ui.metric({ label: 'Unserved', bind: () => ({ value: fmt(this.unservedLoad, 0), unit: 'W', tone: this.unservedLoad > 0 ? 'danger' : 'ok' }), iconName: 'alert', compact: true }),
    );
    sumSec.appendChild(grid);
    const supplyBar = ui.progressBar(0);
    sumSec.appendChild(el('div', { style: { marginTop: '8px' } },
      el('div', { class: 'row spaced', style: { marginBottom: '4px', fontSize: '8.5px', color: 'var(--muted)' } },
        el('span', { text: 'AC SUPPLY · SERVED vs DEMAND' }),
        el('span', { text: '' })),
      supplyBar));
    this.addPanelBind(() => {
      const d = Math.max(1, this.loadDemand);
      supplyBar._set((this.loadServed / d) * 100);
      supplyBar.className = `progress ${this.unservedLoad > 50 ? 'danger' : this.shedding ? 'warn' : ''}`;
    });
    container.appendChild(sumSec);

    const listSec = el('div', { class: 'section' });
    listSec.appendChild(el('div', { class: 'section-title' }, ui.icon('bolt', 12), 'Connected Loads', el('span', { class: 'side', text: `${cfg.load.loads.length} CIRCUITS` })));
    for (const load of cfg.load.loads) {
      const card = el('div', { class: 'section-card', style: { marginBottom: '8px' } });
      const head = el('div', { class: 'row spaced', style: { marginBottom: '6px' } });
      const tt = el('div', {},
        el('b', { style: { fontSize: '10.5px', display: 'block' }, text: load.name }),
        el('span', { style: { fontSize: '8px', color: 'var(--muted)' }, text: `${load.id.toUpperCase()} · ${load.essential ? 'ESSENTIAL' : 'NON-ESSENTIAL'} · ${load.enabled ? 'ENABLED' : 'DISABLED'}` }));
      const watts = el('b', { style: { fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--accent)' }, text: `${load.watts} W` });
      head.append(tt, watts);
      card.appendChild(head);
      card.appendChild(ui.slider({
        label: 'Rated power', min: 0, max: 3000, step: 10, value: load.watts, unit: 'W',
        onInput: v => { load.watts = v; watts.textContent = `${v} W`; },
        onChange: () => this.saveSoon(),
      }));
      card.appendChild(ui.toggle({ label: 'Circuit enabled', value: load.enabled, onChange: v => { load.enabled = v; this.saveSoon(); this.updateLoadVisuals(0); this.renderPanel(); } }));
      const btns = el('div', { class: 'btn-row' });
      btns.append(
        ui.button(load.essential ? 'Essential' : 'Non-essential', { size: 'small', variant: load.essential ? 'subtle' : 'ghost', iconName: 'shield', onClick: () => { load.essential = !load.essential; this.saveSoon(); this.renderPanel(); } }),
        ui.button('Remove', { size: 'small', variant: 'danger', iconName: 'trash', onClick: () => {
          this.config.load.loads = this.config.load.loads.filter(l => l !== load);
          this.logEvent('Load removed', `${load.name} disconnected from the AC bus.`, 'warn');
          this.saveSoon();
          this.renderPanel();
        } }),
      );
      card.append(btns);
      listSec.appendChild(card);
    }
    listSec.appendChild(ui.button('Add Load Circuit', { variant: 'subtle', iconName: 'plus', block: true, onClick: () => this.addLoadCircuit() }));
    container.appendChild(listSec);

    const setSec = el('div', { class: 'section' });
    setSec.appendChild(el('div', { class: 'section-title' }, ui.icon('sliders', 12), 'Demand Control'));
    const setCard = el('div', { class: 'section-card' });
    const bank = cfg.load.loads.find(l => l.id === 'loadbank');
    setCard.appendChild(ui.slider({ label: 'Load power setpoint', min: 0, max: 2500, step: 10, value: bank ? bank.watts : 0, unit: 'W', onInput: v => { if (bank) bank.watts = v; }, onChange: () => this.saveSoon() }));
    setCard.appendChild(ui.toggle({ label: 'Load bus energised', value: cfg.load.enabled, onChange: v => { cfg.load.enabled = v; this.saveSoon(); this.renderPanel(); } }));
    setCard.appendChild(ui.toggle({ label: 'Automatic load profile', description: 'Apply per-circuit time schedules in automatic mode.', value: cfg.load.autoProfile, onChange: v => { cfg.load.autoProfile = v; this.saveSoon(); this.renderPanel(); } }));
    setCard.appendChild(ui.slider({ label: 'Battery reserve for load shedding', min: 5, max: 80, step: 1, value: cfg.load.reserveSoc, unit: '%', onInput: v => { cfg.load.reserveSoc = v; }, onChange: () => this.saveSoon() }));
    setCard.appendChild(ui.kvRow('Load shedding', '', { bind: () => this.shedding ? 'ACTIVE · non-essential disconnected' : 'INACTIVE' }));
    setSec.appendChild(setCard);
    container.appendChild(setSec);

    const bulkSec = el('div', { class: 'section' });
    bulkSec.appendChild(el('div', { class: 'section-title' }, ui.icon('reset', 12), 'Bulk Actions'));
    const row = el('div', { class: 'btn-row' });
    row.append(
      ui.button('Enable All', { size: 'small', iconName: 'check', onClick: () => { for (const l of this.config.load.loads) l.enabled = true; this.saveSoon(); this.renderPanel(); } }),
      ui.button('Non-essential Off', { size: 'small', iconName: 'eyeOff', onClick: () => { for (const l of this.config.load.loads) if (!l.essential) l.enabled = false; this.saveSoon(); this.renderPanel(); } }),
      ui.button('Reset Load List', { size: 'small', variant: 'danger', iconName: 'reset', onClick: () => {
        this.config.load.loads = DEFAULT_LOADS.map(l => ({ ...l }));
        this.saveSoon();
        this.renderPanel();
        ui.toast('Load list restored to defaults.', { type: 'ok' });
      } }),
    );
    bulkSec.appendChild(row);
    const info = el('div', { class: 'help', style: { marginTop: '8px' } });
    this.addPanelBind(() => {
      info.textContent = `${this.config.load.loads.length} circuits · ${fmt(this.loadDemand, 0)} W demanded · ${fmt(this.loadServed, 0)} W served${this.shedding ? ' · load shedding active' : ''}`;
    });
    bulkSec.appendChild(info);
    container.appendChild(bulkSec);
  }

  /* =========================================================
     Lifecycle hooks
     ========================================================= */
  onAfterMount() {
    this.logEvent('Energy site online', `12 PV modules · ${this.config.battery.capacity} Ah battery bank · ${this.config.inverter.maxOutput / 1000} kW inverter.`, 'ok');
  }

  onSimulationStart() {
    this.logEvent('Automatic regulation resumed', 'MPPT tracking and load management active.', 'ok');
  }

  onSimulationStop() {
    this.logEvent('Energy routing halted', 'Simulation stopped by operator.', 'warn');
  }

  /* =========================================================
     Detailed Operational Scenarios
     ========================================================= */
  registerDetailedScenarios() {
    /* ---- Solar Panel & Battery System Scenario ---- */
    this.registerScenario({
      id: 'solar-battery-energy',
      name: 'Solar & Battery Energy Management Cycle',
      description: 'Complete solar generation, battery charging, and load management through day/night cycle',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-solar',
          title: 'Initialize Solar System',
          description: 'Check irradiance, panel output, battery SOC, inverter status',
          objective: 'Verify 800 W/m² irradiance, 5 kW PV output, 70% battery SOC, inverter online',
          checkComplete: (infra) => (infra.irradiance || 0) > 700 && (infra.pvPower || 0) > 4000,
          autoAdvanceDelay: 4000,
          camera: { position: [0, 10, -12], target: [0, 2, -12] },
          narration: 'Solar farm operational. Clear sky, 800 W/m² irradiance. Battery at 70% SOC. Inverter online.',
        },
        {
          id: 'activate-panels',
          title: 'Activate Solar Array',
          description: 'Ensure PV array connected and generating',
          objective: 'Confirm array online, 12 panels active, MPPT tracking, inverter converting',
          checkComplete: (infra) => (infra.pvPower || 0) > 4000,
          autoAdvanceDelay: 3000,
          camera: { position: [0, 10, -12], target: [0, 2, -12] },
          narration: 'Photovoltaic array online. 12 modules generating 5 kW DC. MPPT efficiency at 98%.',
        },
        {
          id: 'battery-charging',
          title: 'Battery Charging',
          description: 'Observe surplus solar charging the battery',
          objective: 'Watch battery SOC increase, charge power flow, battery voltage rise',
          checkComplete: (infra) => (infra.batteryChargePower || 0) > 1000,
          autoAdvanceDelay: 10000,
          camera: { position: [8, 6, -5], target: [8, 1.5, -5] },
          narration: 'Surplus solar power charging battery. Charge rate 2.5 kW. Battery voltage rising.',
        },
        {
          id: 'activate-inverter',
          title: 'Activate Inverter & Loads',
          description: 'Connect inverter and energize site loads',
          objective: 'Start inverter, connect essential loads, observe energy flow to loads',
          checkComplete: (infra) => (infra.inverterPower || 0) > 1000,
          autoAdvanceDelay: 4000,
          camera: { position: [0, 4, -8], target: [0, 1.5, -8] },
          narration: 'Inverter online. Essential loads connected: lighting, security, communications.',
        },
        {
          id: 'load-management',
          title: 'Load Management',
          description: 'Balance solar, battery, and grid to serve all loads',
          objective: 'Verify all loads served, grid export minimal, battery stable',
          checkComplete: (infra) => (infra.loadServed || 0) > 5000 && (infra.gridExport || 0) < 1000,
          autoAdvanceDelay: 8000,
          camera: { position: [0, 4, -8], target: [0, 1.5, -8] },
          narration: 'All priority loads served. Grid export only 500 W. Battery holding at 75% SOC.',
        },
        {
          id: 'increase-demand',
          title: 'Increased Electrical Demand',
          description: 'Simulate additional loads coming online',
          objective: 'Activate non-essential loads, observe battery discharge support',
          onEnter: (infra) => { infra.enableLoad?.('hvac'); infra.enableLoad?.('pumps'); },
          checkComplete: (infra) => (infra.loadDemand || 0) > 8000,
          autoAdvanceDelay: 8000,
          camera: { position: [8, 6, -5], target: [8, 1.5, -5] },
          narration: 'HVAC and pumps activated. Battery discharging to support peak demand.',
        },
        {
          id: 'low-battery-warning',
          title: 'Low Battery Warning',
          description: 'Battery drops to low SOC threshold during extended discharge',
          objective: 'Observe 20% SOC alarm, load shedding activation, essential loads protected',
          checkComplete: (infra) => infra.getActiveAlarms?.()?.some(a => a.id?.includes('battery') || a.title?.includes('Battery')),
          autoAdvanceDelay: 20000,
          narration: 'WARNING: Battery at 20% SOC. Load shedding activated. Essential loads protected.',
        },
        {
          id: 'adjust-loads',
          title: 'Operator Load Adjustment',
          description: 'Reduce non-essential loads to preserve battery',
          objective: 'Shed non-essential loads, verify essential loads maintained',
          onEnter: (infra) => { infra.disableLoad?.('hvac'); infra.disableLoad?.('pumps'); },
          checkComplete: (infra) => (infra.loadServed || 0) < (infra.loadDemand || 0),
          autoAdvanceDelay: 5000,
          narration: 'Operator shed non-essential loads. Essential loads fully protected on battery.',
        },
        {
          id: 'restore-normal',
          title: 'Restore Normal Energy Conditions',
          description: 'Solar recovers, battery recharges, all loads restored',
          objective: 'Increase irradiance, watch battery charge, restore shed loads',
          onEnter: (infra) => { infra.irradiance = 900; infra.enableLoad?.('hvac'); infra.enableLoad?.('pumps'); },
          checkComplete: (infra) => (infra.batterySOC || 0) > 60 && !infra.shedding,
          autoAdvanceDelay: 15000,
          narration: 'Solar output rising. Battery recharging. All loads restored. Grid import normal.',
        },
        {
          id: 'energy-report',
          title: 'Energy Production & Consumption Report',
          description: 'Generate daily energy summary',
          objective: 'Review kWh generated, consumed, stored, grid exchange, battery cycles',
          checkComplete: () => true,
          autoAdvanceDelay: 4000,
          narration: 'Energy cycle complete. 45 kWh generated. 38 kWh consumed. Battery 1.5 cycles. Report ready.',
        },
      ],
    });

    /* ---- Off-Grid Island Mode Scenario ---- */
    this.registerScenario({
      id: 'solar-island-mode',
      name: 'Grid Outage - Island Mode Operation',
      description: 'Operate completely off-grid using solar and battery only',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-island',
          title: 'Normal Grid-Connected',
          description: 'System online, grid connected, battery at 80%',
          objective: 'Verify grid import/export, battery float, all loads served',
          checkComplete: (infra) => (infra.batterySOC || 0) > 75,
          autoAdvanceDelay: 3000,
        },
        {
          id: 'grid-loss',
          title: 'Grid Loss Detected',
          description: 'Utility power fails, transition to island mode',
          objective: 'Observe grid disconnect, seamless transfer to battery, inverter island mode',
          onEnter: (infra) => { infra.gridConnected = false; infra.islandMode = true; },
          checkComplete: (infra) => !infra.gridConnected && infra.islandMode,
          autoAdvanceDelay: 5000,
        },
        {
          id: 'battery-only',
          title: 'Battery-Only Operation',
          description: 'All loads served by solar + battery',
          objective: 'Monitor battery discharge rate, solar contribution, load prioritization',
          checkComplete: (infra) => (infra.batteryDischargePower || 0) > 1000,
          autoAdvanceDelay: 15000,
        },
        {
          id: 'load-shedding',
          title: 'Automatic Load Shedding',
          description: 'Battery drops, non-essential loads shed automatically',
          objective: 'Observe shedding sequence, essential loads maintained, SOC preserved',
          checkComplete: (infra) => infra.shedding && (infra.batterySOC || 0) < 50,
          autoAdvanceDelay: 20000,
        },
        {
          id: 'grid-restore',
          title: 'Grid Restored',
          description: 'Utility power returns, synchronize and recharge',
          objective: 'Grid reconnect, battery charge mode, all loads restored',
          onEnter: (infra) => { infra.gridConnected = true; infra.islandMode = false; },
          checkComplete: (infra) => infra.gridConnected && (infra.batteryChargePower || 0) > 0,
          autoAdvanceDelay: 10000,
        },
      ],
    });
  }

  // First-person interaction handlers for solar
  _toggleDoor(obj) {
    if (obj.id?.includes('door') || obj.id?.includes('cabinet')) {
      this.selectObject(obj.id);
    }
  }

  _operatePump(obj) {
    this.selectObject(obj.id);
  }

  _operateCompressor(obj) {
    this.selectObject(obj.id);
  }

  _inspectTank(obj) {
    this.selectObject(obj.id);
  }

  _openPanel(obj) {
    if (obj.id?.includes('panel') || obj.id?.includes('distribution') || obj.id?.includes('controller') || obj.id === 'load-control') {
      this.selectObject(obj.id);
    }
  }

  _openCabinet(obj) {
    if (obj.id === 'server-rack') {
      this.selectObject(obj.id);
    } else {
      this.selectObject(obj.id);
    }
  }

  _toggleSwitch(obj) {
    if (obj.id?.includes('inverter') || obj.id?.includes('breaker') || obj.id?.includes('disconnect')) {
      // Toggle inverter or breaker
      this.selectObject(obj.id);
    }
    // Workstation power buttons, monitor power, etc.
    if (obj.id?.includes('workstation')) {
      const ws = this.config.load.loads.find(l => l.id === 'workstations');
      if (ws) {
        ws.enabled = !ws.enabled;
        this.logEvent('Workstations toggled', `Computer workstations ${ws.enabled ? 'powered on' : 'powered off'} via first-person`, ws.enabled ? 'ok' : 'warn');
        this.saveSoon();
        this.refreshLive();
      }
    }
  }

  _pressButton(obj) {
    // Coffee machine button
    if (obj.id === 'kitchen-area') {
      const kitchen = this.config.load.loads.find(l => l.id === 'kitchen');
      if (kitchen && kitchen.enabled) {
        this.logEvent('Coffee machine', 'Brewing coffee...', 'info');
        // Visual feedback - coffee machine LED pulses
        if (this.coffeeMachine) {
          const led = this.coffeeMachine.children.find(c => c.material && c.material.emissiveIntensity !== undefined);
          if (led) {
            led.material.emissiveIntensity = 2.0;
            setTimeout(() => { led.material.emissiveIntensity = 1.5; }, 2000);
          }
        }
      }
    }
    // Microwave button
    if (obj.id === 'kitchen-area') {
      this.logEvent('Microwave', 'Heating...', 'info');
    }
    this.selectObject(obj.id);
  }

  _operateLever(obj) {
    this.selectObject(obj.id);
  }
}
