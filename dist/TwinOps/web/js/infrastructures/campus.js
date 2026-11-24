/* ============================================================
   INTEGRATED USE-CASE SCENARIO — all five twins on one campus
   ------------------------------------------------------------
   Districts: solar & battery farm, water plant, packaging line,
   cold store and logistics yard, joined by power and water mains.
   The subsystems are genuinely coupled: energy availability drives
   the cold store, pump and line; water feeds cooling; the line feeds
   the cold store; trucks feed the line and take finished goods.
   ============================================================ */
import * as THREE from 'three';
import { BaseInfrastructure } from '../core/base.js';
import {
  group, box, cylinder, plane, material, emissive, roundedBox, edges,
  canvasTexture, textSprite, signBoard, pipe, cylinderBetween, sphere, glass,
  makeCar, makeCardboardBox, makePallet, makeControlCabinet, makeTowerLight,
  makeLampPost, makeSecurityCamera, mergeStaticGroup, shadowify, COLORS,
} from '../core/scene.js';
import * as ui from '../core/ui.js';

const { el } = ui;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const fmt = (v, d = 1) => ui.fmt(v, d);

export const meta = {
  id: 'campus',
  code: 'USE-06',
  name: 'Integrated Use-Case Scenario',
  description: 'One operating site combining all five twins: photovoltaic and battery energy supply the cold store, water plant, packaging line and logistics dock under a single scenario runner with cross-system alarms.',
  icon: 'link',
  sceneBackground: 0x050c10,
  fogDensity: 0.0042,
  fitPadding: 1.0,
};

/* ---------------- Site layout ---------------- */
const SITE = {
  solar: { x0: -34, x1: -16, z0: -14, z1: 2, rows: 4, cols: 3 },
  water: { x: -18, z: -20 },
  line: { x0: -8, x1: 8, z0: -6, z1: 4 },
  cold: { x0: 12, x1: 27, z0: -11, z1: 1, h: 4.6 },
  yard: { x0: -4, x1: 12, z0: 9, z1: 21, bays: 10 },
  control: { x: 0, z: -18 },
};
const COLD = {
  wall: .34,
  door: { x0: 16.2, x1: 18.6, h: 3.2, z: 1 + .04 },
};
const LINE = { beltY: .95, beltW: 1.5, laneZ: -1.0, straight: 12 };

/* ---------------- Domain constants (consistent with the individual twins) ---------------- */
const ENERGY = {
  panelKw: 0.62, panelCount: 12, systemLoss: 0.93, inverterEff: 0.96,
  batteryKwh: 200, batteryMaxChargeKw: 24, batteryMaxDischargeKw: 30,
  minSoc: 18, reserveSoc: 30,
};
const LOAD_DEFS = [
  { id: 'control', label: 'Control Centre', base: 3.2, priority: 0 },
  { id: 'cold', label: 'Cold Store Plant', base: 11.5, priority: 1 },
  { id: 'water', label: 'Water Pumping', base: 5.4, priority: 2 },
  { id: 'line', label: 'Packaging Line', base: 6.8, priority: 3 },
  { id: 'dock', label: 'Dock & Barriers', base: 2.1, priority: 4 },
  { id: 'lighting', label: 'Site Lighting', base: 3.6, priority: 5 },
];
const SCENARIOS = [
  { id: 'normal', label: 'Normal Operations', detail: 'Balanced production day with nominal weather.', hours: 9, cloud: .18, ambient: 27, island: false, arrivals: 42, target: 420, tariff: 1 },
  { id: 'peak', label: 'Peak Production Day', detail: 'Maximum throughput, heavy truck traffic, clear sky.', hours: 11, cloud: .05, ambient: 30, island: false, arrivals: 22, target: 760, tariff: 1.15 },
  { id: 'outage', label: 'Grid Outage · Island Mode', detail: 'Utility supply lost — battery carries priority loads.', hours: 14, cloud: .32, ambient: 29, island: true, arrivals: 60, target: 300, tariff: 0 },
  { id: 'heatwave', label: 'Heat Wave', detail: '38 °C ambient, cooling demand and water use surge.', hours: 13, cloud: .1, ambient: 38, island: false, arrivals: 40, target: 480, tariff: 1.3 },
  { id: 'night', label: 'Night Shift', detail: 'No solar input — battery discharge and lighting load.', hours: 23, cloud: .2, ambient: 22, island: false, arrivals: 70, target: 240, tariff: .8 },
  { id: 'storm', label: 'Storm Front', detail: 'Dense cloud, reduced yield, restricted dock operations.', hours: 15, cloud: .78, ambient: 24, island: false, arrivals: 90, target: 200, tariff: 1 },
];

/* ---------------- Catalogue ---------------- */
const RAW_MATERIALS = [
  { id: 'produce', label: 'Fresh Produce', unitCost: 12 },
  { id: 'dairy', label: 'Dairy Crates', unitCost: 9 },
  { id: 'pharma', label: 'Pharmaceutical Lot', unitCost: 46 },
  { id: 'seafood', label: 'Frozen Seafood', unitCost: 28 },
];

function tempColor(t, target = new THREE.Color()) {
  const stops = [
    { t: -26, c: 0x1f4fd8 }, { t: -18, c: 0x2f8bff }, { t: -10, c: 0x2ee6d0 },
    { t: -2, c: 0x8ce06a }, { t: 6, c: 0xffb547 }, { t: 14, c: 0xff4a5f },
  ];
  if (t <= stops[0].t) return target.setHex(stops[0].c);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const a = stops[i - 1], b = stops[i];
      const k = (t - a.t) / (b.t - a.t);
      return target.setHex(a.c).lerp(new THREE.Color(b.c), k);
    }
  }
  return target.setHex(stops[stops.length - 1].c);
}

/* ============================================================
   Campus
   ============================================================ */
export default class IntegratedCampus extends BaseInfrastructure {
  constructor(host) {
    super(host, meta);

    // First-person spawn point (control center)
    this.firstPersonSpawnPoint = { x: 0, y: 1.7, z: -20, yaw: 0, pitch: 0 };

    /* ---- energy ---- */
    this.irradiance = 0;
    this.pvPower = 0;
    this.panelTemp = 28;
    this.batterySoc = 68;
    this.batteryPower = 0;
    this.batteryTemp = 24;
    this.batteryHealth = 97;
    this.siteLoad = 0;
    this.loadServed = 0;
    this.gridImport = 0;
    this.shedLevel = 0;
    this.unservedLoad = 0;
    this.energyToday = 0;
    this.loads = {};
    for (const d of LOAD_DEFS) this.loads[d.id] = { ...d, demand: 0, served: 0, shed: false };

    /* ---- water ---- */
    this.tankCapacityL = 10000;
    this.tankLevelPct = 74;
    this.pumpOn = true;
    this.pumpSpeed = 70;
    this.pumpFlow = 0;
    this.waterConsumption = 0;
    this.waterToday = 0;

    /* ---- production line ---- */
    this.lineRunning = true;
    this.lineJam = false;
    this.lineSpeed = 18;          // m/min target
    this.lineRatedSpeed = 18;
    this.producedToday = 0;
    this.productionRate = 0;      // cartons/h
    this.rawStock = 520;
    this.cartonsOnLine = [];
    this.producedShift = 0;

    /* ---- cold store ---- */
    this.coldZones = [
      { id: 'A', label: 'Deep Freeze A', temp: -18.6, setpoint: -18, doorGain: 1, coupling: 1.05 },
      { id: 'B', label: 'Chill Store B', temp: -2.4, setpoint: -2, doorGain: 1.25, coupling: .8 },
    ];
    this.coldInventory = 620;
    this.coldQuarantine = 0;
    this.doorAngle = 0;
    this.doorTarget = 0;
    this.doorOpenElapsed = 0;
    this.compressorLoad = .4;
    this.evapFan = .6;

    /* ---- logistics ---- */
    this.bays = [];
    this.trucks = [];
    this.trucksWaiting = 0;
    this.loadedToday = 0;
    this.dispatchedToday = 0;
    this.arrivalTimer = 0;

    /* ---- scenario ---- */
    this.scenarioId = 'normal';
    this.scenarioElapsed = 0;
    this.scenarioRun = false;
    this.cloudCover = .18;
    this.ambientTemp = 27;
    this.islandMode = false;
    this.loadShedEnabled = true;
    this.tariff = 1;

    /* ---- misc ---- */
    this.faults = { grid: false, compressor: false, pump: false, lineMotor: false, sensor: false, doorSensor: false };
    this._truckSerial = 400;
    this._batchSerial = 0;
    this._dayKey = -1;
    this.coldBatches = [];
    this.scenarioLog = [];
    this._vfx = {};
  }

  defaultConfig() {
    return {
      ...super.defaultConfig(),
      scenarioId: 'normal',
      islandMode: false,
      loadShedEnabled: true,
      lineRunning: true,
      lineSpeed: 18,
      coldSetpointA: -18,
      coldSetpointB: -2,
      pumpSpeed: 70,
      arrivalsEnabled: true,
      arrivalInterval: 42,
      autoDispatch: true,
      lightingOn: true,
      thresholds: {
        batteryLow: 20, batteryCritical: 10, shedTolerance: 1.5,
        coldLimitA: -14, coldLimitB: 2, doorOpenSeconds: 180,
        waterLow: 25, waterCritical: 10, dockQueue: 3,
        rawStarvationMinutes: 8, throughputLow: 120, irradianceLow: 180,
      },
      alarmsEnabled: {},
      rawStockTarget: 400,
    };
  }

  /* =========================================================
     Categories
     ========================================================= */
  makeCategories() {
    const cats = [
      ['floor', 'Ground & Hardstanding', 'structure'],
      ['foundation', 'Foundations & Plinths', 'structure'],
      ['roads', 'Campus Roads & Markings', 'structure'],
      ['walls', 'Building Walls', 'structure'],
      ['interior-walls', 'Internal Partitions', 'structure'],
      ['windows', 'Windows & Glazing', 'structure'],
      ['roof', 'Roofs', 'structure'],
      ['ceiling', 'Ceilings', 'structure'],
      ['doors', 'Doors & Dock Shutters', 'structure'],
      ['columns', 'Support Structure', 'structure'],
      ['beams', 'Beams & Frames', 'structure'],
      ['fencing', 'Perimeter Fencing', 'structure'],
      ['panels', 'PV Arrays', 'equipment'],
      ['batteries', 'Battery & Power Conversion', 'equipment'],
      ['tanks', 'Water Storage', 'equipment'],
      ['pumps', 'Pumping plant', 'equipment'],
      ['pipes', 'Pipes & Water Mains', 'equipment'],
      ['conveyors', 'Packaging Line', 'equipment'],
      ['coldstore', 'Cold Store Equipment', 'equipment'],
      ['cabinets', 'Cabinets & HMI', 'equipment'],
      ['equipment', 'Campus Equipment', 'equipment'],
      ['wiring', 'Cable Trays & Energy Flow', 'equipment'],
      ['vehicles', 'Vehicles', 'equipment'],
      ['loads', 'Process Loads', 'equipment'],
      ['sensors', 'Instrumentation', 'equipment'],
      ['lighting', 'Lighting', 'equipment'],
      ['signs', 'Signage', 'equipment'],
    ];
    this.cat = {};
    for (const [id, label, kind] of cats) this.cat[id] = this.category({ id, label, kind });
  }

  /* =========================================================
     World
     ========================================================= */
  buildWorld() {
    this.makeCategories();
    this.buildGround();
    this.buildRoads();
    this.buildSolarFarm();
    this.buildPowerHouse();
    this.buildWaterPlant();
    this.buildPackagingLine();
    this.buildColdStore();
    this.buildLogisticsYard();
    this.buildControlCentre();
    this.buildEnergyRuns();
    this.buildWaterRuns();
    this.buildLighting();
    this.buildSignage();
    this.buildSensors();
    this.buildBackground();
    this.dockAtmosphere();
    this.registerEquipment();
    this.optimizeStaticGeometry();
    this.setLightingState(this.config.lightingOn !== false);
    this.loadScenario(this.config.scenarioId || 'normal', true);

    // Initialize first-person experience
    this.initFirstPerson(this.firstPersonSpawnPoint);

    // Register detailed operational scenarios
    this.registerDetailedScenarios();
  }

  /* ---------------- Ground & roads ---------------- */
  buildGround() {
    const earth = new THREE.Mesh(new THREE.PlaneGeometry(220, 170), material(0x101820, { roughness: .97, metalness: 0 }));
    earth.rotation.x = -Math.PI / 2;
    earth.position.set(-4, -.12, -4);
    earth.receiveShadow = true;
    earth.userData.ignoreFit = true;
    this.scene.world.add(earth);

    const pad = material(0x28313a, { roughness: .93, metalness: .04 });
    const apron = plane(64, 46, pad, { pos: [-4, .01, -2], receive: true });
    apron.userData.ignoreFit = true;
    this.cat.floor.add(apron);

    const concrete = material(0x535d66, { roughness: .9 });
    for (const [x, z, w, d] of [
      [-4, -24.4, 60, .5], [-4, 22.4, 60, .5], [-34.4, -1, .5, 47], [26.4, -1, .5, 47],
    ]) this.cat.foundation.add(plane(w, d, concrete, { pos: [x, .03, z], receive: true }));
  }

  buildRoads() {
    const asphalt = material(0x1d242b, { roughness: .94, metalness: .03 });
    const dash = new THREE.MeshBasicMaterial({ color: 0xc9d3d9, transparent: true, opacity: .55 });
    // ring road
    const roads = [
      { x: -4, z: 6.4, w: 62, d: 3.4 }, { x: -4, z: -22.2, w: 62, d: 3.4 },
      { x: -30.2, z: -6.4, w: 3.4, d: 44 }, { x: 24.6, z: -6.4, w: 3.4, d: 44 },
    ];
    for (const r of roads) {
      const road = plane(r.w, r.d, asphalt, { pos: [r.x, .022, r.z], receive: true });
      this.cat.roads.add(road);
    }
    // dock spur + yard loop
    this.cat.roads.add(plane(4.2, 22, asphalt, { pos: [18, .024, 8.6], receive: true }));
    this.cat.roads.add(plane(30, 4.0, asphalt, { pos: [8, .025, 16.4], receive: true }));
    // markings
    for (let x = -32; x < 26; x += 4.4) {
      this.cat.roads.add(box(2.2, .012, .1, dash, { pos: [x, .034, 6.4], cast: false, receive: false }));
      this.cat.roads.add(box(2.2, .012, .1, dash, { pos: [x, .034, 18.4], cast: false, receive: false }));
    }
    for (let z = -26; z < 20; z += 4.4) {
      this.cat.roads.add(box(.1, .012, 2.2, dash, { pos: [-30.2, .034, z], cast: false, receive: false }));
    }
    // yard bay markings
    const bayLine = new THREE.MeshBasicMaterial({ color: 0x9fb0ba, transparent: true, opacity: .5 });
    for (let i = 0; i <= SITE.yard.bays; i++) {
      const x = SITE.yard.x0 + i * ((SITE.yard.x1 - SITE.yard.x0) / SITE.yard.bays);
      this.cat.roads.add(box(.08, .012, 5.4, bayLine, { pos: [x, .036, SITE.yard.z0 + 3.6], cast: false, receive: false }));
    }
    this.cat.roads.add(box(16, .012, .1, bayLine, { pos: [4, .036, SITE.yard.z0 + 6.4], cast: false, receive: false }));
  }

  /* ---------------- Solar farm + battery ---------------- */
  buildSolarFarm() {
    const s = SITE.solar;
    const frameM = material(0x7d8d99, { metalness: .68, roughness: .34 });
    const cellM = new THREE.MeshStandardMaterial({ color: 0x14294a, metalness: .45, roughness: .28, emissive: 0x0a2140, emissiveIntensity: .35 });
    const cellTopM = new THREE.MeshStandardMaterial({ color: 0x2d5f9e, metalness: .5, roughness: .22, emissive: 0x0d2b52, emissiveIntensity: .5 });
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0x9fd0ee, transparent: true, opacity: .22, roughness: .06, metalness: 0, depthWrite: false });

    const plots = group('pv-plots');
    plots.position.set(0, 0, 0);
    this.pvField = plots;
    this.pvMats = [cellM, cellTopM];
    this.pvPanels = [];
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const px = s.x0 + 3.4 + c * 6.2;
        const pz = s.z0 + 3.2 + r * 4.4;
        const panel = group(`pv-panel-${r}-${c}`);
        panel.position.set(px, 0, pz);
        panel.rotation.y = -.16;
        // legs
        for (const dx of [-1.9, 0, 1.9]) {
          panel.add(box(.14, 1.5 + (dx === 0 ? .18 : 0), .14, frameM, { pos: [dx, .85, 0] }));
        }
        panel.add(box(4.6, .12, .12, frameM, { pos: [0, 1.62, 0] }));
        panel.add(box(4.6, .12, .12, frameM, { pos: [0, 1.05, 0] }));
        // tilted array: table + cells
        const table = group('table');
        table.rotation.x = -.42;
        table.position.set(0, 1.66, 0);
        const base = box(4.7, .09, 2.7, cellM, { pos: [0, 0, 0], cast: true });
        table.add(base);
        const top = box(4.62, .02, 2.62, cellTopM, { pos: [0, .055, 0], cast: false });
        table.add(top);
        const cover = box(4.7, .012, 2.7, glassM, { pos: [0, .075, 0], cast: false });
        table.add(cover);
        for (let i = 1; i < 5; i++) table.add(box(.03, .012, 2.6, frameM, { pos: [-2.35 + i * .94, .085, 0], cast: false }));
        for (let i = 1; i < 3; i++) table.add(box(4.64, .012, .03, frameM, { pos: [0, .085, -1.35 + i * .9], cast: false }));
        panel.add(table);
        panel.userData.table = table;
        panel.userData.cell = top.material;
        panel.userData.base = base.material;
        // junction box + string cable stub
        panel.add(box(.3, .34, .16, material(0x2b3740, { metalness: .4 }), { pos: [-2.3, 1.4, .6] }));
        plots.add(panel);
        this.pvPanels.push(panel);
      }
    }
    this.cat.panels.add(plots);
    // single invisible pick proxy for the whole field (keeps draw calls low)
    const proxy = box(s.x1 - s.x0 + 1, 3.4, s.z1 - s.z0 + 3, material(0x000000, { transparent: true, opacity: 0 }), {
      pos: [(s.x0 + s.x1) / 2, 1.7, (s.z0 + s.z1) / 2], cast: false, receive: false,
    });
    proxy.userData.noMerge = true;
    this.cat.panels.add(proxy);
    this.pvProxy = proxy;
    // combiner + inverter station
    const station = group('pv-station');
    station.position.set(s.x0 + 1.6, 0, s.z1 - 3.2);
    station.add(box(4.6, .18, 3.2, material(0x4b565f, { roughness: .9 }), { pos: [0, .09, 0] }));
    const combiner = makeControlCabinet(1.1, 1.7, .5, { color: 0x394955, doorColor: 0x46596a });
    combiner.position.set(-1.2, .18, 0);
    station.add(combiner);
    const inverter = makeControlCabinet(1.4, 1.9, .62, { color: 0x2f3f4d, doorColor: 0x415968 });
    inverter.position.set(1.0, .18, 0);
    inverter.rotation.y = -.25;
    station.add(inverter);
    const lcd = new THREE.MeshStandardMaterial({ color: 0x04202a, emissive: 0x2ad9c4, emissiveIntensity: .8 });
    station.add(box(1.0, .4, .03, lcd, { pos: [1.05, 1.35, .34], ry: -.25, cast: false }));
    this.pvStation = station;
    this.cat.panels.add(station);
    this.addObject(station, {
      id: 'pv-station', label: 'PV Combiner & Inverter Station', kind: 'pv-station', iconName: 'solar',
      description: 'String combiner, inverters and array metering for the 12-panel photovoltaic field.',
    });
    this.addObject(proxy, {
      id: 'pv-farm', label: 'Photovoltaic Array Field', kind: 'pv-farm', iconName: 'solar',
      description: '12 tracking-free tilted PV tables, 7.4 kWp nameplate capacity.',
    });

    // battery + charge controller compound
    const bank = group('battery-bank');
    bank.position.set(s.x0 + 9.4, 0, s.z1 + 1.2);
    bank.add(box(5.0, .2, 3.0, material(0x4b565f, { roughness: .9 }), { pos: [0, .1, 0] }));
    const ctrl = makeControlCabinet(1.3, 2.0, .58, { color: 0x2d4657, doorColor: 0x3d5f74 });
    ctrl.position.set(-2.0, .2, -.5);
    bank.add(ctrl);
    bank.add(box(1.0, .42, .03, new THREE.MeshStandardMaterial({ color: 0x04202a, emissive: 0x36e2c2, emissiveIntensity: .9 }), { pos: [-2.0, 1.4, .04], cast: false }));
    this.batteryModules = [];
    for (let i = 0; i < 4; i++) {
      const m = group(`battery-${i + 1}`);
      m.position.set(-.9 + i * 1.15, .2, .6);
      m.add(roundedBox(.95, 1.35, .78, material(0x1f2c36, { metalness: .35, roughness: .5 }), { pos: [0, .675, 0], radius: .05 }));
      const levelMat = new THREE.MeshStandardMaterial({ color: 0x36e2c2, emissive: 0x36e2c2, emissiveIntensity: 1.3 });
      const bar = box(.72, 1.05, .02, levelMat, { pos: [0, .66, .41], cast: false });
      m.add(bar);
      m.add(box(.72, .06, .04, material(0x8fa1ad, { metalness: .6 }), { pos: [0, 1.4, .38], cast: false }));
      for (let k = 0; k < 3; k++) m.add(box(.62, .02, .02, material(0x0d151b), { pos: [0, .35 + k * .28, .42], cast: false }));
      m.userData.barMat = levelMat;
      bank.add(m);
      this.batteryModules.push(m);
    }
    bank.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.cat.batteries.add(bank);
    this.batteryBank = bank;
    this.addObject(bank, {
      id: 'battery-bank', label: 'Battery Energy Storage', kind: 'battery', iconName: 'battery',
      description: '200 kWh lithium bank with charge controller — carries priority loads during island operation.',
    });
    // compound fence
    const fence = group('pv-fence');
    const postM = material(0x66757f, { metalness: .55, roughness: .45 });
    for (let x = s.x0; x <= s.x1 + .01; x += 3.1) {
      fence.add(box(.07, 1.5, .07, postM, { pos: [x, .75, s.z0 - .6], cast: false }));
      fence.add(box(.07, 1.5, .07, postM, { pos: [x, .75, s.z1 + 2.6], cast: false }));
    }
    for (let z = s.z0 - .6; z <= s.z1 + 2.61; z += 3.1) {
      fence.add(box(.07, 1.5, .07, postM, { pos: [s.x0 - .6, .75, z], cast: false }));
      fence.add(box(.07, 1.5, .07, postM, { pos: [s.x1 + .6, .75, z], cast: false }));
    }
    fence.add(box(s.x1 - s.x0 + 1.3, .05, .05, postM, { pos: [(s.x0 + s.x1) / 2, 1.35, s.z0 - .6], cast: false }));
    fence.add(box(s.x1 - s.x0 + 1.3, .05, .05, postM, { pos: [(s.x0 + s.x1) / 2, 1.35, s.z1 + 2.6], cast: false }));
    this.cat.fencing.add(fence);
  }

  /* ---------------- Power distribution ---------------- */
  buildPowerHouse() {
    const h = group('power-house');
    h.position.set(-13.4, 0, -8.4);
    h.add(box(4.4, .22, 3.4, material(0x4b565f, { roughness: .9 }), { pos: [0, .11, 0] }));
    const wallM = material(0x3c4d59, { metalness: .18, roughness: .62 });
    const walls = group('power-house-walls');
    for (const [x, z, w, d] of [[0, -1.6, 3.8, .22], [-1.9, 0, .22, 3.2], [1.9, 0, .22, 3.2], [-1.1, 1.6, 1.2, .22], [1.3, 1.6, .9, .22]]) {
      walls.add(box(w, 2.8, d, wallM, { pos: [x, 1.4, z] }));
    }
    this.cat.walls.add(walls);
    this.cat.roof.add(box(4.1, .2, 3.6, material(0x2b3a45, { metalness: .35 }), { pos: [-13.4, 2.9, -8.4] }));
    this.cat.doors.add((() => { const d = group(); d.position.set(-12.1, 0, -6.8); d.add(box(.9, 2.3, .08, material(0x233742, { metalness: .4 }), { pos: [0, 1.15, 0] })); return d; })());
    // distribution board inside
    const board = group('distribution');
    board.position.set(-13.4, 0, -8.4);
    const panel = makeControlCabinet(1.6, 2.1, .5, { color: 0x2a3a46, doorColor: 0x3a4f5e });
    panel.position.set(-.7, .22, .5);
    board.add(panel);
    const lights = LOAD_DEFS.map((d, i) => {
      const m = new THREE.MeshStandardMaterial({ color: 0x36e2c2, emissive: i < 3 ? 0x36e2c2 : 0x2b4a58, emissiveIntensity: i < 3 ? 1.4 : .3 });
      const led = cylinder(.035, .035, .02, m, { pos: [-1.35 + i * .26, 1.75, .78], rx: Math.PI / 2, segments: 10, cast: false });
      board.add(led);
      return { id: d.id, mat: m };
    });
    for (let i = 0; i < 3; i++) board.add(box(.5, .18, .03, new THREE.MeshStandardMaterial({ color: 0x04191f, emissive: 0x1c8f86, emissiveIntensity: .6 }), { pos: [-.7, 1.3 - i * .3, .78], cast: false }));
    this.cat.cabinets.add(board);
    this.addObject(board, {
      id: 'distribution', label: 'Main Distribution Board', kind: 'distribution', iconName: 'panel',
      description: 'Priority load bus — control centre, cold store, pumping, line, dock and lighting feeders.',
    });
    this.loadLeds = lights;
    this.addObject(walls, {
      id: 'power-house', label: 'Power House', kind: 'building', iconName: 'panel',
      description: 'Utility building housing the site distribution board and protection relays.',
    });
  }

  /* ---------------- Water plant ---------------- */
  buildWaterPlant() {
    const wx = SITE.water.x, wz = SITE.water.z;
    const steel = material(0x7d8d99, { metalness: .7, roughness: .35 });
    const dark = material(0x33424e, { metalness: .6, roughness: .45 });
    // tower
    const tower = group('tank-tower');
    tower.position.set(wx, 0, wz);
    tower.add(box(5.2, .25, 5.2, material(0x505b64, { roughness: .9 }), { pos: [0, .12, 0] }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      tower.add(box(.26, 3.1, .26, steel, { pos: [sx * 1.9, 1.7, sz * 1.9] }));
    }
    for (const y of [1.1, 2.9]) {
      tower.add(box(4.1, .18, .18, dark, { pos: [0, y, 1.9] }));
      tower.add(box(4.1, .18, .18, dark, { pos: [0, y, -1.9] }));
      tower.add(box(.18, .18, 4.1, dark, { pos: [1.9, y, 0] }));
      tower.add(box(.18, .18, 4.1, dark, { pos: [-1.9, y, 0] }));
    }
    tower.add(cylinderBetween([-1.9, .3, 1.9], [1.9, 2.9, 1.9], .045, steel, { segments: 6 }));
    tower.add(cylinderBetween([1.9, .3, -1.9], [-1.9, 2.9, -1.9], .045, steel, { segments: 6 }));
    tower.add(box(4.6, .18, 4.6, dark, { pos: [0, 3.3, 0] }));
    // tank shell + water
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xc6e9ff, transparent: true, opacity: .2, roughness: .06, metalness: 0, transmission: .45, thickness: .5, side: THREE.DoubleSide, depthWrite: false });
    const shell = cylinder(1.35, 1.35, 2.7, shellMat, { pos: [0, 4.75, 0], segments: 34, openEnded: true, cast: false });
    shell.renderOrder = 4;
    tower.add(shell);
    tower.add(cylinder(1.4, 1.4, .1, steel, { pos: [0, 3.4, 0], segments: 30 }));
    tower.add(cylinder(1.4, 1.4, .1, steel, { pos: [0, 6.14, 0], segments: 30 }));
    tower.add(new THREE.Mesh(new THREE.ConeGeometry(1.42, .4, 30), material(0x4b6474, { metalness: .55, roughness: .45 })).translateY(6.4));
    const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x49b6ff, transparent: true, opacity: .72, roughness: .12, metalness: .05, transmission: .25, thickness: .4 });
    const water = cylinder(1.31, 1.31, 1, waterMat, { pos: [0, 4.8, 0], segments: 30, cast: false });
    water.renderOrder = 3;
    tower.add(water);
    this.tankWater = water;
    // level gauge
    tower.add(box(.5, 2.8, .06, material(0x22323d), { pos: [1.6, 4.8, .8] }));
    const float = box(.22, .16, .08, emissive(0xe8483d, 1.2), { pos: [1.6, 4.8, .86], cast: false });
    tower.add(float);
    this.tankFloat = float;
    // ladder
    for (const dz of [-.24, .24]) tower.add(box(.06, 3.4, .06, steel, { pos: [-1.6, 1.9, dz] }));
    for (let i = 1; i <= 10; i++) tower.add(box(.06, .045, .5, material(0x9aa9b4, { metalness: .7 }), { pos: [-1.6, .4 + i * .3, 0], cast: false }));
    tower.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.cat.tanks.add(tower);
    this.tankTower = tower;
    // animated parts stay unmerged; the rest of the tower is merged for draw calls
    if (this.tankWater) this.tankWater.userData.noMerge = true;
    if (this.tankFloat) this.tankFloat.userData.noMerge = true;
    if (this.tankGauge) this.tankGauge.userData.noMerge = true;
    const tankProxy = box(5.4, 7.2, 5.4, material(0x000000, { transparent: true, opacity: 0 }), { pos: [wx, 3.6, wz], cast: false, receive: false });
    tankProxy.userData.noMerge = true;
    this.cat.tanks.add(tankProxy);
    this.addObject(tankProxy, {
      id: 'water-tank', label: 'Elevated Water Tank T-06', kind: 'tank', iconName: 'tank',
      description: '10 000 L elevated reservoir supplying the cold store condenser and process line.',
    });

    // pump house
    const ph = group('pump-house');
    ph.position.set(wx + 5.6, 0, wz + 1.4);
    ph.add(box(4.6, .2, 3.6, material(0x505b64, { roughness: .9 }), { pos: [0, .1, 0] }));
    const phWalls = group('pump-house-walls');
    const wallM = material(0x394a55, { metalness: .2, roughness: .6 });
    for (const [x, z, w, d] of [[0, -1.7, 4.0, .22], [-2.0, 0, .22, 3.4], [2.0, 0, .22, 3.4], [-1.2, 1.7, 1.3, .22], [1.4, 1.7, .9, .22]]) {
      phWalls.add(box(w, 2.6, d, wallM, { pos: [x, 1.3, z] }));
    }
    this.cat.walls.add(phWalls);
    this.cat.roof.add(box(4.3, .18, 3.8, material(0x2b3a45, { metalness: .35 }), { pos: [wx + 5.6, 2.7, wz + 1.4] }));
    // pump skid
    const skid = group('pump-skid');
    skid.position.set(wx + 5.6, 0, wz + 1.4);
    skid.add(box(2.6, .16, 1.3, material(0x3d4b56, { metalness: .5 }), { pos: [0, .26, 0] }));
    const pumpBody = cylinder(.42, .42, .8, material(0x6f8b9c, { metalness: .7, roughness: .34 }), { pos: [-.5, .62, 0], rx: Math.PI / 2, segments: 18 });
    skid.add(pumpBody);
    const impeller = group('impeller');
    impeller.position.set(-.5, .62, .48);
    impeller.add(cylinder(.36, .36, .05, material(0xb9c8d2, { metalness: .8 }), { segments: 16 }));
    for (let i = 0; i < 6; i++) impeller.add(box(.5, .02, .07, material(0xb9c8d2, { metalness: .8 }), { ry: i * TAU / 6, cast: false }));
    skid.add(impeller);
    this.pumpImpeller = impeller;
    skid.add(cylinder(.3, .3, .5, material(0x46545f, { metalness: .6 }), { pos: [-.5, .62, .8], rx: Math.PI / 2, segments: 14 }));
    const motor = cylinder(.4, .4, 1.0, material(0x2f4a5c, { metalness: .55, roughness: .4 }), { pos: [.72, .62, 0], rz: Math.PI / 2, segments: 18 });
    skid.add(motor);
    for (let i = 0; i < 10; i++) skid.add(box(.06, .8, .8, material(0x243945, { metalness: .5 }), { pos: [.28 + i * .1, .62, 0], cast: false }));
    skid.add(box(.5, .3, .34, material(0x2b3740, { metalness: .4 }), { pos: [.72, 1.1, 0] }));
    const pumpLed = emissive(0x36e2c2, 1.6);
    skid.add(cylinder(.05, .05, .03, pumpLed, { pos: [.72, 1.3, .17], rx: Math.PI / 2, segments: 10, cast: false }));
    // valves
    const vIn = group('valve-in');
    vIn.position.set(-1.6, .62, 0);
    vIn.add(cylinder(.24, .24, .2, material(0xb8554d, { metalness: .55 }), { rx: Math.PI / 2, segments: 16 }));
    vIn.add(cylinder(.2, .2, .26, material(0x4a5560, { metalness: .7 }), { rx: Math.PI / 2, segments: 12 }));
    const vw = group('wheel'); vw.position.y = .2;
    vw.add(cylinder(.22, .22, .04, material(0xb8554d), { segments: 18 }));
    for (let i = 0; i < 4; i++) vw.add(box(.42, .03, .04, material(0xb8554d), { ry: i * Math.PI / 4, cast: false }));
    vIn.add(vw);
    this.valveInWheel = vw;
    skid.add(vIn);
    const vOut = group('valve-out');
    vOut.position.set(-1.6, .62, .0);
    vOut.rotation.y = Math.PI;
    vOut.add(cylinder(.22, .22, .2, material(0x4a7fb8, { metalness: .55 }), { rx: Math.PI / 2, segments: 16 }));
    vOut.add(cylinder(.18, .18, .24, material(0x4a5560, { metalness: .7 }), { rx: Math.PI / 2, segments: 12 }));
    const vw2 = group('wheel'); vw2.position.y = .18;
    vw2.add(cylinder(.2, .2, .04, material(0x4a7fb8), { segments: 18 }));
    for (let i = 0; i < 4; i++) vw2.add(box(.38, .03, .04, material(0x4a7fb8), { ry: i * Math.PI / 4, cast: false }));
    vOut.add(vw2);
    this.valveOutWheel = vw2;
    skid.add(vOut);
    skid.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.cat.pumps.add(skid);
    this.pumpSkid = skid;
    if (this.pumpImpeller) this.pumpImpeller.userData.noMerge = true;
    if (this.valveInWheel) this.valveInWheel.userData.noMerge = true;
    if (this.valveOutWheel) this.valveOutWheel.userData.noMerge = true;
    mergeStaticGroup(skid);
    this.addObject(skid, {
      id: 'pump-skid', label: 'Booster Pump Set P-06', kind: 'pump', iconName: 'pump',
      description: 'Variable-speed booster set feeding the process main and cold store condenser make-up.',
    });
  }

  /* ---------------- Packaging line ---------------- */
  buildPackagingLine() {
    const l = SITE.line;
    const frameM = material(0x6d7d88, { metalness: .65, roughness: .4 });
    const beltM = material(0x252c33, { roughness: .85, metalness: .05 });
    const line = group('packaging-line');
    this.packagingLine = line;
    line.position.set(0, 0, 0);
    // U-shaped belt: three straights + two bends
    const laneZ = LINE.laneZ;
    const legs = [];
    const addLeg = (x, z) => {
      line.add(box(.16, LINE.beltY, .16, frameM, { pos: [x, LINE.beltY / 2, z] }));
      legs.push([x, z]);
    };
    const railY = LINE.beltY + .16;
    const straight = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const horiz = Math.abs(z1 - z0) < .01;
      line.add(box(horiz ? len : LINE.beltW, .1, horiz ? LINE.beltW : len, beltM, { pos: [cx, LINE.beltY, cz] }));
      line.add(box(horiz ? len : .12, .16, horiz ? .12 : len, frameM, { pos: [cx, railY, cz + (horiz ? LINE.beltW / 2 : 0)] }));
      line.add(box(horiz ? len : .12, .16, horiz ? .12 : len, frameM, { pos: [cx, railY, cz - (horiz ? LINE.beltW / 2 : 0)], cast: !horiz }));
      const steps = Math.max(2, Math.round(len / 2.4));
      for (let i = 0; i <= steps; i++) addLeg(x0 + (x1 - x0) * (i / steps), z0 + (z1 - z0) * (i / steps));
      return { len };
    };
    straight(l.x0 + 1, l.z0 + 1.6, l.x1 - 1, l.z0 + 1.6);
    straight(l.x1 - 1, l.z0 + 1.6, l.x1 - 1, l.z1 - 1.6);
    straight(l.x1 - 1, l.z1 - 1.6, l.x0 + 1, l.z1 - 1.6);
    straight(l.x0 + 1, l.z1 - 1.6, l.x0 + 1, l.z0 + 1.6);
    // rollers along the straights
    const rollerMat = material(0xa8b6c0, { metalness: .78, roughness: .3 });
    const rollerGroup = group('line-rollers');
    line.add(rollerGroup);
    const rollers = [];
    for (let x = l.x0 + 1.4; x < l.x1 - 1; x += .75) {
      const r1 = cylinder(.11, .11, LINE.beltW + .08, rollerMat, { pos: [x, LINE.beltY + .03, l.z0 + 1.6], rx: 0, rz: Math.PI / 2, segments: 10, cast: false });
      const r2 = cylinder(.11, .11, LINE.beltW + .08, rollerMat, { pos: [x, LINE.beltY + .03, l.z1 - 1.6], rx: 0, rz: Math.PI / 2, segments: 10, cast: false });
      rollerGroup.add(r1, r2);
      rollers.push(r1, r2);
    }
    for (let z = l.z0 + 2.0; z < l.z1 - 1.6; z += .75) {
      const r1 = cylinder(.11, .11, LINE.beltW + .08, rollerMat, { pos: [l.x1 - 1, LINE.beltY + .03, z], rx: Math.PI / 2, segments: 10, cast: false });
      const r2 = cylinder(.11, .11, LINE.beltW + .08, rollerMat, { pos: [l.x0 + 1, LINE.beltY + .03, z], rx: Math.PI / 2, segments: 10, cast: false });
      rollerGroup.add(r1, r2);
      rollers.push(r1, r2);
    }
    // rollers share one material and never move independently: merge them
    mergeStaticGroup(rollerGroup);
    this.lineRollers = rollerGroup.children.filter(o => o.isMesh);
    // belt surface animation strip
    const chevronMat = new THREE.MeshBasicMaterial({ color: 0x8ce06a, transparent: true, opacity: .3 });
    const chevronGroup = group('belt-chevrons');
    line.add(chevronGroup);
    for (let x = l.x0 + 1.6; x < l.x1 - 1; x += 1.3) {
      chevronGroup.add(box(.5, .012, .1, chevronMat, { pos: [x, LINE.beltY + .06, l.z0 + 1.6], cast: false, receive: false }));
      chevronGroup.add(box(.5, .012, .1, chevronMat, { pos: [x, LINE.beltY + .06, l.z1 - 1.6], cast: false, receive: false }));
    }
    mergeStaticGroup(chevronGroup);
    this.beltChevrons = chevronGroup.children.filter(o => o.isMesh);
    // drive motor + gearbox
    const motor = group('line-motor');
    motor.position.set(l.x0 + 1.0, 0, l.z0 + 1.6);
    motor.add(box(.7, .16, .7, material(0x3d4b56, { metalness: .5 }), { pos: [0, .24, 0] }));
    const mBody = cylinder(.42, .42, 1.15, material(0x2f4a5c, { metalness: .55, roughness: .42 }), { pos: [0, .72, 0], rz: Math.PI / 2, segments: 18 });
    motor.add(mBody);
    for (let i = 0; i < 12; i++) motor.add(box(.05, .82, .82, material(0x243945, { metalness: .5 }), { pos: [-.52 + i * .095, .72, 0], cast: false }));
    motor.add(cylinder(.3, .3, .45, material(0x46545f, { metalness: .6 }), { pos: [.72, .72, 0], rz: Math.PI / 2, segments: 14 }));
    const gbox = roundedBox(.8, .8, .72, material(0x3a4a55, { metalness: .55 }), { pos: [1.15, .72, 0], radius: .06 });
    motor.add(gbox);
    const fan = group('motor-fan');
    fan.position.set(-.62, .72, 0);
    fan.rotation.z = Math.PI / 2;
    for (let i = 0; i < 5; i++) fan.add(box(.36, .02, .08, material(0x9fb0ba, { metalness: .7 }), { ry: i * TAU / 5, rz: .45, cast: false }));
    motor.add(fan);
    this.lineFan = fan;
    motor.add(box(.34, .24, .2, material(0x2b3740), { pos: [0, 1.35, 0] }));
    const mled = emissive(0x36e2c2, 1.6);
    motor.add(cylinder(.05, .05, .03, mled, { pos: [0, 1.5, .11], rx: Math.PI / 2, segments: 10, cast: false }));
    motor.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    line.add(motor);
    this.lineMotor = motor;
    this.cat.conveyors.add(line);
    // pick proxy over the whole loop keeps the decorative frame mergeable
    const lineProxy = box(l.x1 - l.x0 + 1.2, 1.9, l.z1 - l.z0 + 1.2, material(0x000000, { transparent: true, opacity: 0 }), {
      pos: [(l.x0 + l.x1) / 2, .95, (l.z0 + l.z1) / 2], cast: false, receive: false,
    });
    lineProxy.userData.noMerge = true;
    this.cat.conveyors.add(lineProxy);
    this.lineProxy = lineProxy;
    this.addObject(lineProxy, {
      id: 'packaging-line', label: 'Packaging & Sorting Line LN-06', kind: 'line', iconName: 'conveyor',
      description: 'U-shaped transport loop feeding the cold store dock; throughput depends on power and raw material supply.',
    });
    this.addObject(motor, {
      id: 'line-motor', label: 'Line Drive Motor M-06', kind: 'motor', iconName: 'motor',
      description: 'Geared drive unit for the packaging line — thermal model with jam protection.',
    });

    // sort station + diverter + bins
    const station = group('sort-station');
    station.position.set(l.x1 - 1, 0, l.z0 + 1.6);
    station.add(box(1.1, 1.5, 1.1, material(0x26333d), { pos: [1.0, .75, 0] }));
    station.add(box(.9, .5, .04, new THREE.MeshStandardMaterial({ color: 0x04202a, emissive: 0x2ad9c4, emissiveIntensity: .7 }), { pos: [1.0, 1.2, .56], cast: false }));
    const scannerM = new THREE.MeshStandardMaterial({ color: 0x1a222a, emissive: 0xff4a5f, emissiveIntensity: 1.2 });
    station.add(box(.9, .12, .12, scannerM, { pos: [-.2, 1.35, 0], cast: false }));
    station.add(box(.1, 1.2, .1, material(0x6d7d88, { metalness: .6 }), { pos: [-.2, .72, 0] }));
    const arm = group('diverter-arm');
    arm.position.set(-.2, LINE.beltY + .08, .0);
    arm.add(box(1.5, .09, .12, material(0xd9a63c, { metalness: .5 }), { pos: [.75, 0, 0] }));
    arm.add(box(.16, .2, .18, material(0x2b3740), { pos: [0, 0, 0] }));
    station.add(arm);
    this.diverterArm = arm;
    station.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.cat.conveyors.add(station);
    this.addObject(station, {
      id: 'sort-station', label: 'Sort & Scan Station', kind: 'station', iconName: 'sensor',
      description: 'Barcode scan, classification and pneumatic diverter that routes cartons to storage or dispatch.',
    });

    const binM = material(0x1d2b36, { metalness: .35, roughness: .55 });
    this.lineBins = [];
    for (let i = 0; i < 2; i++) {
      const b = group(`line-bin-${i}`);
      b.position.set(l.x1 + 1.6, 0, l.z0 + 2.4 + i * 3.4);
      b.add(box(2.4, 1.9, 2.4, binM, { pos: [0, .95, 0] }));
      b.add(box(2.2, .08, 2.2, material(0x2b3d49), { pos: [0, 1.9, 0], cast: false }));
      const label = i === 0 ? 'DISPATCH' : 'STORAGE';
      const board = signBoard(label, 1.6, .34, { bg: '#07161f', border: i === 0 ? '#ffb547' : '#63b6ff', color: i === 0 ? '#ffdc9a' : '#cfe9ff' });
      board.position.set(0, 2.4, -1.22);
      b.add(board);
      const fill = box(2.1, .02, 2.1, new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffb547 : 0x63b6ff, transparent: true, opacity: .4 }), { pos: [0, .1, 0], cast: false, receive: false });
      fill.userData.noMerge = true;
      b.add(fill);
      b.userData.fill = fill;
      this.cat.conveyors.add(b);
      this.lineBins.push(b);
      this.addObject(b, {
        id: `line-bin-${i}`, label: i === 0 ? 'Dispatch Bin' : 'Storage Bin', kind: 'bin', iconName: 'inventory',
        description: i === 0 ? 'Finished goods staged for outbound trucks.' : 'Cartons transferred to the cold store dock.',
      });
    }
  }

  /* ---------------- Cold store ---------------- */
  buildColdStore() {
    const c = SITE.cold;
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const panelM = material(0x35505f, { metalness: .3, roughness: .5 });
    const innerM = material(0x8fb2c4, { metalness: .35, roughness: .45 });
    // slab
    this.cat.foundation.add(box(c.x1 - c.x0 + 1.6, .3, c.z1 - c.z0 + 1.6, material(0x535d66, { roughness: .92 }), { pos: [cx, .15, cz] }));
    // outer shell walls with panel seams
    const shell = group('cold-shell');
    const w = c.x1 - c.x0, d = c.z1 - c.z0, h = c.h;
    shell.add(box(w, h, .34, panelM, { pos: [-w / 2 + .17, h / 2, 0] }));
    shell.add(box(w, h, .34, panelM, { pos: [w / 2 - .17, h / 2, 0] }));
    shell.add(box(.34, h, d, panelM, { pos: [0, h / 2, -d / 2 + .17] }));
    // south wall with dock opening
    const doorW = COLD.door.x1 - COLD.door.x0;
    const doorCxLocal = ((COLD.door.x0 + COLD.door.x1) / 2) - cx;
    const leftW = (doorCxLocal - doorW / 2) + w / 2 - .17;
    shell.add(box(leftW, h, .34, panelM, { pos: [-w / 2 + leftW / 2, h / 2, d / 2 - .17] }));
    const rightW = w - leftW - doorW - .34;
    shell.add(box(rightW, h, .34, panelM, { pos: [w / 2 - rightW / 2, h / 2, d / 2 - .17] }));
    shell.add(box(doorW, h - COLD.door.h, .34, panelM, { pos: [doorCxLocal, COLD.door.h + (h - COLD.door.h) / 2, d / 2 - .17] }));
    for (let i = -2; i <= 2; i++) shell.add(box(.08, h + .1, .06, material(0x6e8797, { metalness: .5 }), { pos: [i * (w / 5), h / 2, -d / 2 - .02], cast: false }));
    shell.position.set(cx, .3, cz);
    this.cat.walls.add(shell);
    this.coldShell = shell;
    this.addObject(shell, {
      id: 'cold-store', label: 'Cold Storage Building CS-06', kind: 'building', iconName: 'cold',
      description: 'Insulated multi-zone cold store with dock door, shelving and cold-chain monitoring.',
    });
    // roof + ceiling
    this.cat.roof.add(box(w + .3, .26, d + .3, material(0x2b3a45, { metalness: .4 }), { pos: [cx, .3 + h + .13, cz] }));
    for (let i = -3; i <= 3; i++) this.cat.roof.add(box(.07, .06, d + .2, material(0x51636f, { metalness: .5 }), { pos: [cx + i * (w / 7), .3 + h + .28, cz], cast: false }));
    this.cat.ceiling.add(box(w - .8, .06, d - .8, material(0xd7e5ee, { roughness: .7 }), { pos: [cx, .3 + h - .08, cz], cast: false }));
    for (const [ox, oz] of [[-3.4, -2.4], [3.4, -2.4], [-3.4, 2.4], [3.4, 2.4]]) {
      const lamp = box(1.2, .08, .3, new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0xc6f2ff, emissiveIntensity: 1.1 }), { pos: [cx + ox, .3 + h - .2, cz + oz], cast: false });
      this.cat.ceiling.add(lamp);
      this.coldLights = this.coldLights || [];
      this.coldLights.push(lamp.material);
    }
    // dock door (animated shutter)
    const shutter = group('cold-door');
    shutter.position.set((COLD.door.x0 + COLD.door.x1) / 2, .3, cz + d / 2 - .17);
    const doorMat = material(0xc9d6de, { metalness: .35, roughness: .5 });
    const shutterPanel = box(doorW - .1, COLD.door.h - .1, .12, doorMat, { pos: [0, (COLD.door.h - .1) / 2, 0] });
    for (let i = 1; i < 6; i++) shutter.add(box(doorW - .12, .04, .14, material(0x8fa1ad, { metalness: .5 }), { pos: [0, i * .5, 0], cast: false }));
    shutter.add(shutterPanel);
    shutter.add(box(.16, COLD.door.h, .3, material(0x3b4d59, { metalness: .5 }), { pos: [-doorW / 2 - .05, COLD.door.h / 2, 0] }));
    shutter.add(box(.16, COLD.door.h, .3, material(0x3b4d59, { metalness: .5 }), { pos: [doorW / 2 + .05, COLD.door.h / 2, 0] }));
    const led = cylinder(.05, .05, .03, emissive(0x3ce58b, 1.6), { pos: [doorW / 2 + .05, COLD.door.h - .3, .18], rx: Math.PI / 2, segments: 10, cast: false });
    shutter.add(led);
    this.doorLed = led.material;
    this.cat.doors.add(shutter);
    this.coldDoor = shutter;
    this.addObject(shutter, {
      id: 'cold-door', label: 'Cold Store Dock Door D-06', kind: 'door', iconName: 'door',
      description: 'Insulated dock door — open longer than the alarm delay warms the store and triggers an alert.',
    });
    // interior shelving + batches
    const racks = group('cold-racks');
    racks.position.set(cx, .3, cz);
    for (const sx of [-1, 1]) {
      for (let r = 0; r < 2; r++) {
        const rx = sx * (2.6 + r * 2.2);
        for (let lvl = 0; lvl < 4; lvl++) {
          racks.add(box(1.9, .08, 2.6, material(0x4a6a7d, { metalness: .5 }), { pos: [rx, .5 + lvl * .62, 0], cast: false }));
        }
        for (const dz of [-1.2, 1.2]) racks.add(box(.09, 2.3, .09, material(0x3d586a, { metalness: .55 }), { pos: [rx, 1.15, dz] }));
      }
    }
    this.cat.coldstore.add(racks);
    this.coldRacks = racks;
    this.batchGroup = group('cold-batches');
    racks.add(this.batchGroup);
    this.batchVisuals = [];
    for (let i = 0; i < 12; i++) {
      const sx = i % 2 === 0 ? -1 : 1;
      const lvl = Math.floor(i / 3) % 4;
      const pallet = makePallet(.9, .7);
      pallet.position.set(cx + sx * (2.6 + ((i % 3) > 1 ? 2.2 : 0)), .3 + .54 + lvl * .62, cz - 1 + (i % 3) * .9);
      pallet.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      const crate = makeCardboardBox(.7, .5, .6, 0xbdd8e6, '');
      crate.position.set(pallet.position.x, pallet.position.y + .2, pallet.position.z);
      crate.traverse(o => { if (o.isMesh) o.castShadow = false; });
      this.batchGroup.add(pallet, crate);
      this.batchVisuals.push(crate);
    }
    // condenser + evaporator
    const plant = group('cold-plant');
    plant.position.set(c.x1 + 3.4, 0, cz - 2.4);
    plant.add(box(3.2, .22, 2.6, material(0x4b565f, { roughness: .9 }), { pos: [0, .11, 0] }));
    plant.add(roundedBox(2.6, 1.5, 1.5, material(0x2f3f4a, { metalness: .45, roughness: .5 }), { pos: [0, .95, 0], radius: .08 }));
    const condFan = group('cond-fan');
    condFan.position.set(0, .95, .78);
    condFan.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) condFan.add(box(.9, .04, .16, material(0x9fb0ba, { metalness: .7 }), { ry: i * TAU / 5, rz: .5, cast: false }));
    plant.add(condFan);
    this.condFan = condFan;
    plant.add(cylinder(.62, .62, .06, material(0x8a99a4, { metalness: .7 }), { pos: [0, .95, .74], rx: Math.PI / 2, segments: 22, cast: false }));
    for (let i = 0; i < 12; i++) plant.add(box(.06, 1.2, 1.4, material(0x26343d, { metalness: .5 }), { pos: [-1.1 + i * .19, .95, -.02], cast: false }));
    // refrigerant pipes
    plant.add(pipe([[-1.3, .6, .8], [-2.6, .6, .8], [-2.6, 2.4, .8], [-2.6, 2.4, -2.4], [-w / 2 + 1.2, 2.4, -2.4], [-w / 2 + 1.2, 2.4, -1.0], [-w / 2 + .3, 2.4, -1.0], [-w / 2 + .3, 1.6, -1.0]], .1, material(0x8a6a4a, { metalness: .75, roughness: .35 }), { radial: 8, segs: 60 }));
    const led2 = cylinder(.05, .05, .03, emissive(0x36e2c2, 1.5), { pos: [.9, 1.6, .78], rx: Math.PI / 2, segments: 10, cast: false });
    plant.add(led2);
    plant.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.cat.coldstore.add(plant);
    this.coldPlant = plant;
    if (this.condFan) this.condFan.children.forEach(m => { m.userData.noMerge = true; });
    mergeStaticGroup(plant);
    this.addObject(plant, {
      id: 'cold-plant', label: 'Condensing Plant CP-06', kind: 'compressor', iconName: 'compressor',
      description: 'Air-cooled condensing unit and evaporator circuit for the cold store — the site\'s largest electrical load.',
    });
    // heat map overlay
    this.coldHeat = [];
    for (let i = 0; i < 2; i++) {
      const zone = this.coldZones[i];
      const zx = cx + (i === 0 ? -w / 4 : w / 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0x2f8bff, transparent: true, opacity: .2, depthWrite: false });
      const overlay = plane(w / 2 - .6, d - .8, mat, { pos: [zx, .33, cz], receive: false });
      overlay.renderOrder = 2;
      this.cat.floor.add(overlay);
      this.coldHeat.push({ zone, mat });
    }
    // dock apron + leveller
    this.cat.foundation.add(box(doorW + 2.4, .22, 3.4, material(0x4a545d, { roughness: .9 }), { pos: [(COLD.door.x0 + COLD.door.x1) / 2, .11, cz + d / 2 + 1.6] }));
    this.cat.coldstore.add(box(doorW, .3, .5, material(0x6d7d88, { metalness: .5 }), { pos: [(COLD.door.x0 + COLD.door.x1) / 2, .3, cz + d / 2 + .34] }));
  }

  /* ---------------- Logistics yard ---------------- */
  buildLogisticsYard() {
    const y = SITE.yard;
    const booth = group('yard-booth');
    booth.position.set(y.x1 + 4.2, 0, y.z0 + 3.6);
    booth.add(box(2.6, .18, 2.6, material(0x4b565f, { roughness: .9 }), { pos: [0, .09, 0] }));
    const bw = group('yard-booth-walls');
    const bwall = material(0x36495a, { metalness: .2, roughness: .6 });
    for (const [x, z, w, d] of [[0, -1.2, 2.6, .2], [-1.2, 0, .2, 2.4], [1.2, 0, .2, 2.4], [0, 1.2, 2.6, .2]]) bw.add(box(w, 2.5, d, bwall, { pos: [x, 1.25, z] }));
    this.cat.walls.add(bw);
    this.cat.windows.add((() => { const w = group(); w.position.set(y.x1 + 4.2, 0, y.z0 + 4.8); w.add(box(1.8, 1.1, .04, glass(0x9ed6ee, .3), { pos: [0, 1.5, 0], cast: false })); return w; })());
    this.cat.roof.add(box(2.9, .18, 2.9, material(0x2b3a45, { metalness: .35 }), { pos: [y.x1 + 4.2, 2.6, y.z0 + 3.6] }));
    this.cat.cabinets.add(booth);
    this.addObject(booth, {
      id: 'gatehouse', label: 'Logistics Gatehouse', kind: 'building', iconName: 'shield',
      description: 'Vehicle check-in, dock scheduling and load dispatch office.',
    });

    // bays + barriers
    const bayW = (y.x1 - y.x0) / y.bays;
    for (let i = 0; i < y.bays; i++) {
      const x = y.x0 + bayW * (i + .5);
      const slot = { id: `D-${String(i + 1).padStart(2, '0')}`, x, z: y.z0 + 3.6, occupied: false, truckId: null, reserved: false };
      this.bays.push(slot);
      const label = textSprite(slot.id, { size: 30, scale: .5, color: '#dff8f2', bg: 'rgba(4,14,22,.7)', border: 'rgba(140,224,106,.3)' });
      label.position.set(x, .7, y.z0 + 6.6);
      label.visible = this.labelsVisible;
      this.cat.signs.add(label);
    }
    // entry/exit barriers at the yard throat
    this.barriers = {};
    for (const [id, x, name] of [['in', y.x1 + 1.6, 'Yard Entry Barrier'], ['out', y.x1 + 1.6, 'Yard Exit Barrier']]) {
      const b = group(`barrier-${id}`);
      b.position.set(x, 0, id === 'in' ? y.z0 + 1.0 : y.z1 - 1.0);
      b.add(box(.7, .1, .7, material(0x26333d, { metalness: .5 }), { pos: [0, .05, 0] }));
      b.add(cylinder(.1, .12, 1.2, material(0x8d9aa5, { metalness: .7 }), { pos: [0, .66, 0] }));
      b.add(roundedBox(.36, .56, .3, material(0x26333d, { metalness: .5 }), { pos: [0, .9, 0], radius: .04 }));
      const arm = group('arm');
      arm.position.set(0, 1.16, 0);
      for (let i = 0; i < 6; i++) arm.add(box(.82, .12, .1, material(i % 2 === 0 ? 0xe6ebee : 0xd14b52, { roughness: .55 }), { pos: [.41 + i * .82, 0, 0] }));
      b.add(arm);
      const led = cylinder(.04, .04, .025, emissive(0xff4d5e, 1.8), { pos: [0, .76, .17], rx: Math.PI / 2, segments: 10, cast: false });
      b.add(led);
      this.cat.vehicles.add(b);
      this.barriers[id] = { id, name, group: b, arm, angle: 0, target: 0, led: led.material, x, z: id === 'in' ? y.z0 + 1.0 : y.z1 - 1.0 };
      this.addObject(b, {
        id: `barrier-${id}`, label: name, kind: 'barrier', iconName: 'gate',
        description: 'Access barrier controlling heavy goods vehicles at the yard throat.',
      });
    }
    // dock ramp signage
    const sign = signBoard('COLD CHAIN DOCK  ·  CS-06', 3.4, .5, { bg: '#07161f', border: '#63b6ff', color: '#cfe9ff' });
    sign.position.set((COLD.door.x0 + COLD.door.x1) / 2, 3.8, SITE.cold.z1 + .4);
    this.cat.signs.add(sign);
  }

  /* ---------------- Control centre ---------------- */
  buildControlCentre() {
    const cc = SITE.control;
    const ccGroup = group('control-centre');
    ccGroup.position.set(cc.x, 0, cc.z);
    ccGroup.add(box(9.0, .24, 6.0, material(0x4b565f, { roughness: .9 }), { pos: [0, .12, 0] }));
    const wallM = material(0x2f4350, { metalness: .3, roughness: .5 });
    const walls = group('control-walls');
    for (const [x, z, w, d] of [[0, -2.9, 8.6, .28], [-4.3, 0, .28, 5.8], [4.3, 0, .28, 5.8], [-1.6, 2.9, 5.4, .28], [2.6, 2.9, 3.0, .28]]) {
      walls.add(box(w, 3.2, d, wallM, { pos: [x, 1.6, z] }));
    }
    this.cat.walls.add(walls);
    this.cat.windows.add((() => {
      const w = group(); w.position.set(cc.x, 0, cc.z);
      w.add(box(8.4, 1.1, .05, glass(0x9ed6ee, .28), { pos: [0, 2.1, 2.94], cast: false }));
      w.add(box(8.4, .06, .12, material(0x8fa1ad, { metalness: .6 }), { pos: [0, 2.68, 2.98], cast: false }));
      return w;
    })());
    this.cat.doors.add((() => { const d = group(); d.position.set(cc.x + 2.6, 0, cc.z + 2.94); d.add(box(1.0, 2.3, .08, glass(0xcfe9ff, .4), { pos: [0, 1.15, 0], cast: false })); return d; })());
    this.cat.roof.add(box(9.3, .22, 6.3, material(0x27353f, { metalness: .4 }), { pos: [cc.x, 3.35, cc.z] }));
    this.cat.roof.add(box(4.0, .1, .3, new THREE.MeshBasicMaterial({ color: 0x63b6ff, transparent: true, opacity: .35 }), { pos: [cc.x, 3.5, cc.z], cast: false }));
    // mast + dishes
    ccGroup.add(cylinder(.09, .13, 6.2, material(0x6d7d88, { metalness: .6 }), { pos: [4.0, 3.6, -2.6] }));
    for (let i = 0; i < 2; i++) {
      const dish = group('dish');
      dish.position.set(4.0, 5.2 + i * 1.2, -2.6);
      dish.rotation.set(-.4, i * 1.6, 0);
      const d = new THREE.Mesh(new THREE.SphereGeometry(.68, 16, 10, 0, TAU, 0, Math.PI / 2.6), material(0xd7e2e8, { metalness: .35, roughness: .45, side: THREE.DoubleSide }));
      d.rotation.x = Math.PI;
      dish.add(d);
      dish.add(cylinder(.05, .05, .5, material(0x8fa1ad, { metalness: .7 }), { pos: [0, .25, 0], segments: 8 }));
      ccGroup.add(dish);
    }
    const beacon = makeTowerLight();
    beacon.position.set(-3.6, 3.5, -2.4);
    ccGroup.add(beacon);
    this.controlBeacon = beacon;
    ccGroup.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.cat.cabinets.add(ccGroup);
    this.addObject(ccGroup, {
      id: 'control-centre', label: 'Integrated Control Centre', kind: 'control', iconName: 'grid',
      description: 'Unified SCADA room supervising energy, water, cold chain, production and logistics for the whole campus.',
    });
  }

  /* ---------------- Distribution runs ---------------- */
  buildEnergyRuns() {
    const conduit = material(0x2b3a44, { roughness: .55, metalness: .3 });
    const tray = material(0x6a7a84, { metalness: .55, roughness: .45 });
    // solar station -> power house
    this.cat.wiring.add(pipe([[-16.4, .5, -11.2], [-14.6, .5, -10.4], [-13.4, .5, -10.0], [-13.4, 1.2, -9.6]], .07, conduit, { radial: 6, segs: 30 }));
    // power house -> control centre
    this.cat.wiring.add(pipe([[-13.4, .5, -6.8], [-9.0, .5, -6.0], [-4.5, .5, -8.0], [-1.5, .5, -12.0], [0, .5, -15.2]], .08, conduit, { radial: 6, segs: 60 }));
    // cable tray spine with drops to each district
    this.cat.wiring.add(pipe([[-13.4, .45, -6.8], [-10, .45, -4.5], [-6, .45, -3.0], [2, .45, -3.0], [8, .45, -2.0], [12, .45, -1.0], [17, .45, -1.0], [21, .45, -2.2]], .075, conduit, { radial: 6, segs: 70 }));
    this.cat.wiring.add(pipe([[2, .45, -3.0], [2, .45, 2.0], [4, .45, 5.0], [8, .45, 8.0], [12, .45, 10.0], [18, .45, 8.6]], .07, conduit, { radial: 6, segs: 60 }));
    // drop to water plant
    this.cat.wiring.add(pipe([[-10, .45, -4.5], [-11.5, .45, -8.0], [-12.4, .45, -14.0], [-12.4, 1.4, -18.2]], .07, conduit, { radial: 6, segs: 40 }));
    this.cat.wiring.add(pipe([[-12.4, 1.4, -18.2], [-12.4, 2.2, -19.6], [-12.4, 2.2, -20.0]], .06, conduit, { radial: 6, segs: 12 }));
    // drop to cold store plant
    this.cat.wiring.add(pipe([[21, .45, -2.2], [24, .45, -3.4], [29, .45, -4.6], [29, 1.6, -4.6], [28.4, 1.6, -4.0]], .07, conduit, { radial: 6, segs: 30 }));
    // drop to line motor
    this.cat.wiring.add(pipe([[2, .45, -3.0], [0, .45, -3.6], [-4, .45, -3.9], [-7, .45, -4.2], [-7, 1.7, -4.4]], .06, conduit, { radial: 6, segs: 30 }));
    // junction boxes
    for (const [x, y, z] of [[-10, .7, -4.5], [2, .7, -3.0], [8, .7, -2.0], [21, .7, -2.2], [12, .7, 10.0]]) {
      this.cat.wiring.add(box(.34, .24, .2, material(0x33414b, { metalness: .4 }), { pos: [x, y, z], cast: false }));
    }
    // overhead tray over the line
    this.cat.wiring.add(box(.18, .1, 12.4, tray, { pos: [-2, 3.4, -.6] }));
    for (let i = 0; i < 6; i++) this.cat.wiring.add(box(.26, .05, .14, tray, { pos: [-2, 3.48, -5.6 + i * 2.2], cast: false }));
    // animated energy pulses along the main spine
    this.energyFlows = [];
    const flowDefs = [
      { id: 'generation', color: 0xffc247, points: [[-16.6, .55, -11.0], [-14.6, .5, -10.4], [-13.4, .55, -9.4], [-11.5, .5, -8.6], [-9.4, .5, -9.2], [-1.5, .5, -12.0], [0, .55, -15.0]], count: 8, maxPower: 8000 },
      { id: 'site', color: 0x8ce06a, points: [[-13.0, .5, -6.8], [-10, .5, -4.5], [-6, .5, -3.0], [2, .5, -3.0], [8, .5, -2.0], [17, .5, -1.0], [21, .5, -2.2]], count: 14, maxPower: 9000 },
      { id: 'cold', color: 0x63b6ff, points: [[21, .5, -2.2], [25, .5, -3.6], [28.4, 1.4, -4.2]], count: 6, maxPower: 5000 },
      { id: 'line', color: 0xffb547, points: [[2, .5, -3.0], [0, .5, -3.6], [-4, .5, -3.9], [-7, 1.5, -4.3]], count: 6, maxPower: 4000 },
      { id: 'water', color: 0x46a9ff, points: [[-10, .5, -4.5], [-11.5, .5, -8.0], [-12.4, .5, -14.0], [-12.4, 1.9, -19.8]], count: 6, maxPower: 3000 },
      { id: 'dock', color: 0xa98bff, points: [[2, .5, -3.0], [2, .5, 2.0], [4, .5, 5.0], [8, .5, 8.0], [14, .5, 9.4], [18, .5, 8.8]], count: 8, maxPower: 3000 },
    ];
    for (const def of flowDefs) {
      const curve = new THREE.CatmullRomCurve3(def.points.map(p => new THREE.Vector3(...p)), false, 'catmullrom', .3);
      const conduitMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, .055, 6, false), material(0x223039, { roughness: .6, metalness: .25 }));
      conduitMesh.castShadow = false;
      conduitMesh.receiveShadow = true;
      this.cat.wiring.add(conduitMesh);
      const geo = new THREE.SphereGeometry(.062, 6, 5);
      const mat = new THREE.MeshBasicMaterial({ color: def.color, toneMapped: false });
      const dots = new THREE.InstancedMesh(geo, mat, def.count);
      dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      dots.frustumCulled = false;
      dots.castShadow = false;
      dots.receiveShadow = false;
      dots.count = 0;
      this.cat.wiring.add(dots);
      this.energyFlows.push({ ...def, curve, length: curve.getLength(), dots, offset: 0, ratio: 0 });
    }
  }

  buildWaterRuns() {
    const pipeM = material(0x5f7d8c, { metalness: .6, roughness: .4 });
    const wm = material(0x4a6b7a, { metalness: .5, roughness: .45 });
    // tank -> pump skid
    this.cat.pipes.add(pipe([[-16.2, 3.5, -20], [-14.2, 3.5, -20], [-14.2, 1.0, -19.2], [-13.6, .8, -19.0]], .16, pipeM, { radial: 10, segs: 40 }));
    // pump -> process main -> cold store condenser and line
    this.cat.pipes.add(pipe([[-11.2, .85, -19.0], [-9.0, .85, -18.0], [-6.0, .85, -16.0], [-2.0, .85, -12.0], [2.0, .85, -10.0], [6.0, .85, -10.0], [12.0, .85, -9.0], [20.0, .85, -8.0], [28.0, .85, -6.0], [30.2, .85, -4.6]], .14, wm, { radial: 10, segs: 80 }));
    // branch to the line
    this.cat.pipes.add(pipe([[-2.0, .85, -12.0], [-2.0, .85, -6.0], [-2.5, .85, -3.0], [-3.5, .9, -1.0]], .1, wm, { radial: 8, segs: 30 }));
    // valves + meters
    for (const [x, z] of [[-11.2, -19.0], [6.0, -10.0], [20.0, -8.0]]) {
      const v = group('water-valve');
      v.position.set(x, .85, z);
      v.add(cylinder(.28, .28, .22, material(0x4a7fb8, { metalness: .55 }), { rx: Math.PI / 2, segments: 16 }));
      v.add(cylinder(.34, .34, .2, material(0x39505e, { metalness: .5 }), { segments: 14 }));
      const w2 = group('wheel'); w2.position.y = .3;
      w2.add(cylinder(.24, .24, .04, material(0x4a7fb8), { segments: 16 }));
      v.add(w2);
      v.userData.wheel = w2;
      this.cat.pipes.add(v);
      this.waterValves = this.waterValves || [];
      this.waterValves.push(v);
    }
    // flow meter
    const fm = group('flow-meter');
    fm.position.set(-6.0, .85, -16.0);
    fm.add(cylinder(.26, .26, .3, material(0x8a99a4, { metalness: .7 }), { rx: Math.PI / 2, segments: 14 }));
    fm.add(cylinder(.2, .2, .16, material(0x2b3740), { segments: 12 }));
    this.cat.pipes.add(fm);
    this.flowMeter = fm;
    // condenser make-up reservoir
    this.cat.pipes.add(cylinder(.85, .85, 1.2, material(0x4a5d6a, { metalness: .5 }), { pos: [30.2, .9, -4.6], segments: 18 }));
    this.cat.pipes.add(cylinder(.9, .9, .08, material(0x6d7d88, { metalness: .6 }), { pos: [30.2, 1.54, -4.6], segments: 18 }));
  }

  buildLighting() {
    const lights = [[-30, 4], [-16, 4], [-2, 4], [12, 4], [24, 4], [-30, -18], [-16, -18], [0, -22], [22, -18]];
    this.siteLights = [];
    lights.forEach(([x, z], i) => {
      const lamp = makeLampPost(6.4);
      lamp.position.set(x, 0, z);
      lamp.rotation.y = (i % 2 ? -1 : 1) * .6;
      this.cat.lighting.add(lamp);
      this.siteLights.push({ light: lamp.userData.light, mat: lamp.userData.lampMaterial, base: 7.5, baseEmissive: 1.7 });
    });
    // cold store interior + dock lamps
    const dockLamp = makeLampPost(5.2);
    dockLamp.position.set(COLD.door.x0 - 1.6, 0, SITE.cold.z1 + 2.4);
    dockLamp.rotation.y = Math.PI;
    this.cat.lighting.add(dockLamp);
    this.siteLights.push({ light: dockLamp.userData.light, mat: dockLamp.userData.lampMaterial, base: 5.5, baseEmissive: 1.5 });
  }

  setLightingState(on) {
    this.lightingOn = on;
    for (const l of this.siteLights || []) {
      l.light.intensity = on ? l.base : 0;
      l.mat.emissiveIntensity = on ? l.baseEmissive : 0.05;
    }
    for (const m of this.coldLights || []) m.emissiveIntensity = on ? 1.1 : .08;
  }

  buildSignage() {
    const add = (text, x, y, z, w, h, opts = {}, ry = 0) => {
      const s = signBoard(text, w, h, opts);
      s.position.set(x, y, z);
      s.rotation.y = ry;
      this.cat.signs.add(s);
      return s;
    };
    add('NEXUS INTEGRATED CAMPUS', 0, 4.2, -24.6, 6.4, .7, { bg: '#06141e', border: '#8ce06a', color: '#d6ffbe' });
    add('SOLAR & BATTERY FARM', -25, 2.6, -15.6, 3.4, .5, { bg: '#07161f', border: '#ffc247', color: '#ffe0a3' });
    add('WATER TREATMENT', -18, 3.9, -23.8, 3.0, .46, { bg: '#07161f', border: '#46a9ff', color: '#cfe9ff' });
    add('PACKAGING & SORTING', 0, 2.6, 6.0, 3.6, .5, { bg: '#1a1004', border: '#ffb547', color: '#ffdc9a' });
    add('COLD STORAGE · ZONE 1', 19.5, 4.6, -11.6, 4.0, .56, { bg: '#07161f', border: '#63b6ff', color: '#cfe9ff' });
    add('LOGISTICS & DISPATCH', 6, 2.4, 10.4, 3.4, .48, { bg: '#08161d', border: '#a98bff', color: '#e0d4ff' });
    add('HIGH VOLTAGE · AUTHORISED ACCESS', -30, 2.2, -6, 3.2, .4, { bg: '#1a1004', border: '#f6b44b', color: '#ffdc9a' }, Math.PI / 2);
    add('PRIORITY: COLD CHAIN', 0, 3.6, -14.8, 3.0, .44, { bg: '#150a0a', border: '#8ce06a', color: '#d6ffbe' });
    for (const [x, z, ry] of [[-16.5, 6.0, 0], [26.5, 6.0, Math.PI]]) {
      const arrow = add('▶', x, 1.5, z, .7, .5, { bg: '#07161f', border: '#8ce06a', color: '#d6ffbe' }, ry);
    }
  }

  buildBackground() {
    const bgM = material(0x0a1218, { roughness: .97, metalness: 0 });
    for (let i = 0; i < 9; i++) {
      const w = 9 + (i % 4) * 4, h = 4 + (i % 5) * 2.2, d = 7 + (i % 3) * 4;
      const x = -70 + i * 18;
      const b = box(w, h, d, bgM, { pos: [x, h / 2 - .1, -52 - (i % 3) * 9], cast: false, receive: false });
      b.userData.ignoreFit = true;
      this.scene.world.add(b);
      const stripe = box(w * .6, .07, .08, new THREE.MeshBasicMaterial({ color: 0x2b7d86, transparent: true, opacity: .25 }), { pos: [x, h * .6, -52 - (i % 3) * 9 + d / 2 + .1], cast: false });
      stripe.userData.ignoreFit = true;
      this.scene.world.add(stripe);
    }
    // distant treeline
    const treeM = material(0x16281f, { roughness: .95 });
    for (let i = 0; i < 26; i++) {
      const x = -90 + i * 7.4 + (i % 3);
      const h = 2.6 + (i % 4) * .9;
      const t = new THREE.Mesh(new THREE.ConeGeometry(1.5, h, 7), treeM);
      t.position.set(x, h / 2, 34 + (i % 3) * 2.2);
      t.userData.ignoreFit = true;
      this.scene.world.add(t);
    }
  }

  dockAtmosphere() {
    // cool-air plumes at the dock door and condenser exhaust, plus dust at the yard
    const plume = new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: .1, depthWrite: false });
    this.coldPlumes = [];
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(.7 + i * .12, 10, 8), plume.clone());
      p.position.set((COLD.door.x0 + COLD.door.x1) / 2 + (i % 2 ? .8 : -.8), .6 + i * .3, SITE.cold.z1 + 1.8 + i * .25);
      p.userData.ignoreFit = true;
      this.cat.coldstore.add(p);
      this.coldPlumes.push({ mesh: p, phase: i * 1.1 });
    }
    const exhaust = new THREE.MeshBasicMaterial({ color: 0xdfe9ee, transparent: true, opacity: .065, depthWrite: false });
    this.exhaustPlumes = [];
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(.55 + i * .16, 10, 8), exhaust.clone());
      p.position.set(SITE.cold.x1 + 3.4, 1.6 + i * .45, (SITE.cold.z0 + SITE.cold.z1) / 2 - 2.4 + i * .2);
      p.userData.ignoreFit = true;
      this.cat.coldstore.add(p);
      this.exhaustPlumes.push({ mesh: p, phase: i * .8 });
    }
  }

  registerEquipment() {
    this.addEquipment({ id: 'pv-farm', name: 'Photovoltaic Array', type: 'generation', iconName: 'solar', objectId: 'pv-farm', status: () => `${ui.fmt(this.pvPower / 1000, 2)} kW`, tone: () => this.pvPower > 500 ? 'ok' : 'muted' });
    this.addEquipment({ id: 'battery', name: 'Battery Energy Storage', type: 'storage', iconName: 'battery', objectId: 'battery-bank', status: () => `${Math.round(this.batterySoc)}% · ${this.batteryPower >= 0 ? 'CHARGING' : 'DISCHARGE'}`, tone: () => this.batterySoc < this.threshold('batteryLow', 20) ? 'danger' : this.batterySoc < 45 ? 'warn' : 'ok' });
    this.addEquipment({ id: 'distribution', name: 'Main Distribution Board', type: 'electrical', iconName: 'panel', objectId: 'distribution', status: () => this.shedLevel > 0 ? `SHEDDING ${Math.round(this.shedLevel * 100)}%` : 'NOMINAL', tone: () => this.shedLevel > 0 ? 'warn' : 'ok' });
    this.addEquipment({ id: 'water-tank', name: 'Elevated Water Tank', type: 'storage', iconName: 'tank', objectId: 'water-tank', status: () => `${ui.fmt(this.tankLevelPct, 1)}%`, tone: () => this.tankLevelPct < this.threshold('waterLow', 25) ? 'warn' : 'ok' });
    this.addEquipment({ id: 'pump', name: 'Booster Pump Set', type: 'pump', iconName: 'pump', objectId: 'pump-skid', status: () => this.pumpOn ? `RUNNING · ${ui.fmt(this.pumpFlow, 0)} L/min` : 'STANDBY', tone: () => this.pumpOn ? 'ok' : 'muted' });
    this.addEquipment({ id: 'line', name: 'Packaging Line', type: 'production', iconName: 'conveyor', objectId: 'packaging-line', status: () => this.lineJam ? 'JAMMED' : this.lineRunning ? `RUNNING · ${ui.fmt(this.productionRate, 0)}/h` : 'STOPPED', tone: () => this.lineJam ? 'danger' : this.lineRunning ? 'ok' : 'warn' });
    this.addEquipment({ id: 'cold-plant', name: 'Condensing Plant', type: 'refrigeration', iconName: 'compressor', objectId: 'cold-plant', status: () => this.faults.compressor ? 'FAULT' : `LOAD ${Math.round(this.compressorLoad * 100)}%`, tone: () => this.faults.compressor ? 'danger' : 'ok' });
    this.addEquipment({ id: 'cold-store', name: 'Cold Store Zones', type: 'thermal', iconName: 'cold', objectId: 'cold-store', status: () => this.coldZones.map(z => `${ui.fmt(z.temp, 1)}°C`).join(' / '), tone: () => this.coldBreach() ? 'danger' : 'ok' });
    this.addEquipment({ id: 'dock', name: 'Logistics Dock', type: 'logistics', iconName: 'vehicle', objectId: 'gatehouse', status: () => `${this.dockOccupancy()}/${SITE.yard.bays} bays · ${this.trucksWaiting} waiting`, tone: () => this.trucksWaiting > this.threshold('dockQueue', 3) ? 'warn' : 'ok' });
    this.addEquipment({ id: 'control-centre', name: 'Control Centre', type: 'scada', iconName: 'grid', objectId: 'control-centre', status: () => this.islandMode ? 'ISLAND MODE' : 'GRID CONNECTED', tone: () => this.islandMode ? 'warn' : 'ok' });
    this.addEquipment({ id: 'lighting', name: 'Site Lighting', type: 'electrical', iconName: 'light', objectId: 'control-centre', status: () => this.lightingOn ? 'ENERGISED' : 'OFF', tone: () => this.lightingOn ? 'ok' : 'muted' });
    this.addEquipment({ id: 'scenario', name: 'Scenario Runner', type: 'orchestration', iconName: 'play', objectId: 'control-centre', status: () => this.scenarioRun ? `${this.scenarioLabel()} · ${Math.round(this.scenarioProgress() * 100)}%` : 'IDLE', tone: () => this.scenarioRun ? 'ok' : 'muted' });
    this.addEquipment({ id: 'gatehouse', name: 'Gatehouse', type: 'facility', iconName: 'shield', objectId: 'gatehouse', status: () => 'STAFFED', tone: () => 'ok' });
    this.addEquipment({ id: 'pipeline', name: 'Process Water Main', type: 'utility', iconName: 'pipe', objectId: 'distribution', status: () => `${ui.fmt(this.waterConsumption, 0)} L/min draw`, tone: () => this.tankLevelPct < this.threshold('waterCritical', 10) ? 'danger' : 'ok' });
  }

  optimizeStaticGeometry() {
    for (const id of ['roads', 'fencing', 'beams', 'columns', 'signs', 'foundation', 'windows', 'pipes', 'wiring', 'lighting']) {
      const g = this.cat[id];
      if (g) mergeStaticGroup(g, { forceNoShadow: true });
    }
    // decorative static clusters that carry no animation
    mergeStaticGroup(this.pvField || group('empty-pv'), { forceNoShadow: true });
    if (this.packagingLine) mergeStaticGroup(this.packagingLine, { forceNoShadow: true });
    if (this.tankTower) mergeStaticGroup(this.tankTower, { forceNoShadow: true });
    if (this.batchGroup) mergeStaticGroup(this.batchGroup, { forceNoShadow: true });
    if (this.coldRacks) mergeStaticGroup(this.coldRacks, { forceNoShadow: true });
    for (const idx of [0, 1]) {
      const bin = this.lineBins?.[idx];
      if (bin) mergeStaticGroup(bin, { forceNoShadow: true });
    }
    // the merged line and tank groups were flattened above, so re-flag shadowing
    for (const g of [this.packagingLine, this.tankTower]) {
      if (!g) continue;
      g.traverse(o => { if (o.isMesh && o.userData.mergedStatic) o.castShadow = true; });
    }
  }

  /* =========================================================
     Sensors
     ========================================================= */
  defineSensors() {
    return [
      { id: 'pv-power', name: 'PV Array Output', unit: 'kW', min: 0, max: 14, digits: 2, value: 4.6, iconName: 'solar', alarmLow: -1, alarmHigh: 12 },
      { id: 'irradiance', name: 'Solar Irradiance', unit: 'W/m²', min: 0, max: 1300, digits: 0, value: 780, iconName: 'sun', alarmLow: -1, alarmHigh: 1250 },
      { id: 'battery-soc', name: 'Battery State of Charge', unit: '%', min: 0, max: 100, digits: 0, value: 68, iconName: 'battery', alarmLow: 20, alarmHigh: 101 },
      { id: 'battery-power', name: 'Battery Power', unit: 'kW', min: -32, max: 32, digits: 2, value: 0, iconName: 'bolt', alarmLow: -100, alarmHigh: 100 },
      { id: 'site-load', name: 'Site Load', unit: 'kW', min: 0, max: 70, digits: 1, value: 24, iconName: 'gauge', alarmLow: -1, alarmHigh: 52 },
      { id: 'grid-import', name: 'Utility Import', unit: 'kW', min: 0, max: 70, digits: 1, value: 12, iconName: 'panel', alarmLow: -1, alarmHigh: 48 },
      { id: 'tank-level', name: 'Reservoir Level', unit: '%', min: 0, max: 100, digits: 1, value: 74, iconName: 'tank', alarmLow: 25, alarmHigh: 101 },
      { id: 'pump-flow', name: 'Pump Delivery', unit: 'L/min', min: 0, max: 460, digits: 0, value: 0, iconName: 'pump', alarmLow: -1, alarmHigh: 440 },
      { id: 'water-draw', name: 'Process Water Draw', unit: 'L/min', min: 0, max: 220, digits: 0, value: 0, iconName: 'droplet', alarmLow: -1, alarmHigh: 190 },
      { id: 'line-speed', name: 'Line Belt Speed', unit: 'm/min', min: 0, max: 26, digits: 1, value: 18, iconName: 'conveyor', alarmLow: -1, alarmHigh: 25 },
      { id: 'throughput', name: 'Carton Throughput', unit: 'ctn/h', min: 0, max: 1000, digits: 0, value: 420, iconName: 'package', alarmLow: 120, alarmHigh: 950 },
      { id: 'raw-stock', name: 'Raw Material Stock', unit: 'units', min: 0, max: 2400, digits: 0, value: 520, iconName: 'inventory', alarmLow: 60, alarmHigh: 2300 },
      { id: 'cold-zone-a', name: 'Cold Store Zone A', unit: '°C', min: -32, max: 16, digits: 1, value: -18.6, iconName: 'thermometer', alarmLow: -28, alarmHigh: -14 },
      { id: 'cold-zone-b', name: 'Cold Store Zone B', unit: '°C', min: -32, max: 16, digits: 1, value: -2.4, iconName: 'thermometer', alarmLow: -28, alarmHigh: 2 },
      { id: 'cold-inventory', name: 'Cold Store Inventory', unit: 'units', min: 0, max: 3000, digits: 0, value: 620, iconName: 'inventory', alarmLow: -1, alarmHigh: 2800 },
      { id: 'dock-occupancy', name: 'Dock Occupancy', unit: 'vehicles', min: 0, max: 12, digits: 0, value: 0, iconName: 'vehicle', alarmLow: -1, alarmHigh: 11 },
    ];
  }

  buildSensors() {
    const cluster = group('sensor-cluster');
    this.cat.sensors.add(cluster);
    this.sensorCluster = cluster;
    const place = (id, position, opts = {}) => {
      const s = this.sensors.get(id);
      if (!s) return;
      const node = this.createSensorNode(s, { scale: opts.scale ?? .72, position, rotation: opts.rotation, label: opts.label !== false, labelOffset: opts.labelOffset ?? .5, labelScale: .46 });
      cluster.add(node);
    };
    place('pv-power', [-16.2, 1.6, -11.4]);
    place('irradiance', [-25, 2.1, -12.6], { label: true });
    place('battery-soc', [-23.6, 1.5, 2.6]);
    place('battery-power', [-25.1, 1.5, 2.6], { label: false });
    place('site-load', [-12.2, 1.5, -8.4]);
    place('grid-import', [-14.6, 1.5, -8.4], { label: false });
    place('tank-level', [-16.6, 4.2, -20.0]);
    place('pump-flow', [-10.9, 1.5, -19.0]);
    place('water-draw', [-8.4, 1.5, -17.4], { label: false });
    place('line-speed', [-7.4, 1.6, -4.2]);
    place('throughput', [-5.2, 1.6, -4.2], { label: false });
    place('raw-stock', [9.2, 1.6, 11.0]);
    place('cold-zone-a', [15.0, 2.4, -8.6]);
    place('cold-zone-b', [22.6, 2.4, -8.6], { label: false });
    place('cold-inventory', [19.0, 2.6, -10.4], { label: false });
    place('dock-occupancy', [14.2, 1.5, 9.4]);
    // merge every instrument housing into a handful of meshes, keeping the
    // animated status LEDs and label sprites intact
    for (const vis of this.sensorVisuals.values()) {
      if (vis.led) vis.led.userData.noMerge = true;
    }
    mergeStaticGroup(cluster, { forceNoShadow: true });
  }

  /* =========================================================
     Alarms
     ========================================================= */
  defineAlarmRules() {
    return [
      {
        id: 'battery-low', title: 'Battery State of Charge Low', severity: 'warning',
        thresholdKey: 'batteryLow', defaultThreshold: 20, thresholdLabel: 'Low SOC', thresholdUnit: '%', thresholdMin: 5, thresholdMax: 60, thresholdStep: 1,
        message: () => `Battery at ${fmt(this.batterySoc, 1)}% — reserve margin reduced on site loads.`,
        active: () => this.batterySoc <= this.threshold('batteryLow', 20),
      },
      {
        id: 'battery-critical', title: 'Battery Depleted — Load Shedding', severity: 'critical',
        thresholdKey: 'batteryCritical', defaultThreshold: 10, thresholdLabel: 'Critical SOC', thresholdUnit: '%', thresholdMin: 2, thresholdMax: 30, thresholdStep: 1,
        message: () => `Battery at ${fmt(this.batterySoc, 1)}%. Priority loads only — cold chain protected.`,
        active: () => this.batterySoc <= this.threshold('batteryCritical', 10),
      },
      {
        id: 'load-shed', title: 'Load Shedding Active', severity: 'warning',
        thresholdKey: 'shedTolerance', defaultThreshold: 1.5, thresholdLabel: 'Unserved load', thresholdUnit: 'kW', thresholdMin: .5, thresholdMax: 20, thresholdStep: .5,
        message: () => `${fmt(this.unservedLoad, 1)} kW of demand is unserved — ${this.shedList() || 'no loads'} shed.`,
        active: () => this.unservedLoad > this.threshold('shedTolerance', 1.5),
      },
      {
        id: 'cold-breach', title: 'Cold Chain Breach', severity: 'critical',
        thresholdKey: 'coldLimitA', defaultThreshold: -14, thresholdLabel: 'Zone A limit', thresholdUnit: '°C', thresholdMin: -22, thresholdMax: -2, thresholdStep: .5,
        message: () => `Cold store exceeding limits (A ${fmt(this.coldZones[0].temp, 1)} °C / B ${fmt(this.coldZones[1].temp, 1)} °C). ${this.coldQuarantine} units quarantined.`,
        active: () => this.coldZones[0].temp > this.threshold('coldLimitA', -14) || this.coldZones[1].temp > this.threshold('coldLimitB', 2),
      },
      {
        id: 'door-open', title: 'Cold Store Door Open', severity: 'warning',
        thresholdKey: 'doorOpenSeconds', defaultThreshold: 180, thresholdLabel: 'Open alarm delay', thresholdUnit: 's', thresholdMin: 20, thresholdMax: 900, thresholdStep: 10,
        message: () => `Dock door open for ${ui.fmtDuration(this.doorOpenElapsed)} — warm-air ingress raising store temperature.`,
        active: () => this.doorAngle > .1 && this.doorOpenElapsed > this.threshold('doorOpenSeconds', 180),
      },
      {
        id: 'water-low', title: 'Reservoir Level Low', severity: 'warning',
        thresholdKey: 'waterLow', defaultThreshold: 25, thresholdLabel: 'Low level', thresholdUnit: '%', thresholdMin: 5, thresholdMax: 70, thresholdStep: 1,
        message: () => `Reservoir at ${fmt(this.tankLevelPct, 1)}% — condenser make-up capacity reduced.`,
        active: () => this.tankLevelPct < this.threshold('waterLow', 25),
      },
      {
        id: 'water-critical', title: 'Reservoir Critically Low', severity: 'critical',
        thresholdKey: 'waterCritical', defaultThreshold: 10, thresholdLabel: 'Critical level', thresholdUnit: '%', thresholdMin: 2, thresholdMax: 30, thresholdStep: 1,
        message: () => `Reservoir at ${fmt(this.tankLevelPct, 1)}% — cooling capacity is being degraded.`,
        active: () => this.tankLevelPct < this.threshold('waterCritical', 10),
      },
      {
        id: 'pump-dry', title: 'Pump Running Dry', severity: 'critical',
        message: () => 'Booster pump has lost suction — reservoir effectively empty.',
        active: () => this.pumpOn && this.tankLevelPct < 4 && !this.faults.pump,
      },
      {
        id: 'starvation', title: 'Production Starved of Material', severity: 'warning',
        thresholdKey: 'rawStarvationMinutes', defaultThreshold: 8, thresholdLabel: 'Starve delay', thresholdUnit: 'min', thresholdMin: 1, thresholdMax: 60, thresholdStep: 1,
        message: () => `Line running with no raw material for ${ui.fmtDuration(this.starveTimer)} — schedule a delivery.`,
        active: () => this.lineRunning && !this.lineJam && this.rawStock <= 0 && this.starveTimer > this.threshold('rawStarvationMinutes', 8) * 60,
      },
      {
        id: 'line-jam', title: 'Packaging Line Jam', severity: 'critical',
        message: () => 'Carton obstruction detected at the transfer — line stopped, throughput lost.',
        active: () => this.lineJam,
      },
      {
        id: 'dock-congestion', title: 'Dock Congestion', severity: 'warning',
        thresholdKey: 'dockQueue', defaultThreshold: 3, thresholdLabel: 'Queue limit', thresholdUnit: 'vehicles', thresholdMin: 1, thresholdMax: 8, thresholdStep: 1,
        message: () => `${this.trucksWaiting} vehicles waiting for a dock — inbound supply chain backing up.`,
        active: () => this.trucksWaiting > this.threshold('dockQueue', 3),
      },
      {
        id: 'quarantine', title: 'Stock Quarantined', severity: 'critical',
        message: () => `${this.coldQuarantine} units quarantined after a temperature excursion.`,
        active: () => this.coldQuarantine > 0,
      },
      {
        id: 'low-generation', title: 'Low Solar Generation', severity: 'warning',
        thresholdKey: 'irradianceLow', defaultThreshold: 180, thresholdLabel: 'Irradiance threshold', thresholdUnit: 'W/m²', thresholdMin: 50, thresholdMax: 800, thresholdStep: 10,
        message: () => `Irradiance ${fmt(this.irradiance, 0)} W/m² yet the array is producing ${fmt(this.pvPower, 2)} kW.`,
        active: () => this.isDaylight() && this.irradiance > this.threshold('irradianceLow', 180) && this.pvPower < 0.9 && !this.arrayDisabled,
      },
      {
        id: 'compressor-fault', title: 'Refrigeration Plant Fault', severity: 'critical',
        message: () => 'Condensing plant faulted — cold store is warming on residual capacity.',
        active: () => this.faults.compressor,
      },
      {
        id: 'sensor-fault', title: 'Instrumentation Fault', severity: 'critical',
        message: () => 'One or more campus instrument channels are not responding.',
        active: () => this.faults.sensor,
      },
    ];
  }

  getAnalyticsDefs() {
    return [
      { id: 'pv-power', label: 'PV Output', unit: 'kW', color: '#ffc247', get: () => this.pvPower / 1000, digits: 2 },
      { id: 'site-load', label: 'Site Load', unit: 'kW', color: '#46a9ff', get: () => this.loadServed / 1000, digits: 2 },
      { id: 'battery-soc', label: 'Battery SOC', unit: '%', color: '#8ce06a', get: () => this.batterySoc, digits: 1 },
      { id: 'tank-level', label: 'Reservoir', unit: '%', color: '#63d6ff', get: () => this.tankLevelPct, digits: 1 },
      { id: 'throughput', label: 'Throughput', unit: 'ctn/h', color: '#ffb547', get: () => this.productionRate, digits: 0 },
      { id: 'cold-avg', label: 'Cold Store Avg', unit: '°C', color: '#a98bff', get: () => this.averageColdTemp(), digits: 1 },
      { id: 'raw-stock', label: 'Raw Stock', unit: 'units', color: '#e8735a', get: () => this.rawStock, digits: 0 },
      { id: 'dock-occupancy', label: 'Dock Occupancy', unit: 'veh', color: '#9fd7ff', get: () => this.dockOccupancy(), digits: 0 },
    ];
  }

  primarySeriesIds() { return ['pv-power', 'site-load']; }

  /* =========================================================
     Helpers
     ========================================================= */
  isDaylight() { return this.solarElevation > 0.02; }
  averageColdTemp() { return this.coldZones.reduce((a, z) => a + z.temp, 0) / this.coldZones.length; }
  coldBreach() { return this.coldZones[0].temp > this.threshold('coldLimitA', -14) || this.coldZones[1].temp > this.threshold('coldLimitB', 2); }
  dockOccupancy() { return this.trucks.filter(t => t.state === 'docked' || t.state === 'arriving').length; }
  scenarioById(id) { return SCENARIOS.find(s => s.id === id) || SCENARIOS[0]; }
  scenarioLabel() { return this.scenarioById(this.scenarioId).label; }
  scenarioProgress() { return clamp(this.scenarioElapsed / (this.scenarioById(this.scenarioId).hours * 3600), 0, 1); }
  shedList() { return LOAD_DEFS.filter(d => this.loads[d.id].shed).map(d => d.label).join(', '); }

  loadScenario(id, silent = false) {
    const s = this.scenarioById(id);
    this.scenarioId = s.id;
    this.config.scenarioId = s.id;
    if (!silent) {
      this.simTime = s.hours * 3600;
      this.islandMode = s.island;
      this.config.islandMode = s.island;
      this.cloudCover = s.cloud;
      this.arrivalInterval = s.arrivals;
      this.productionTarget = s.target;
      this.tariff = s.tariff;
      this.scenarioElapsed = 0;
      this.scenarioRun = true;
      this.logEvent('Scenario loaded', `${s.label} — ${s.detail}`, 'info');
      this.scenarioLog.unshift({ at: this.simTime, text: `Scenario loaded: ${s.label}` });
      if (this.scenarioLog.length > 40) this.scenarioLog.pop();
      ui.toast(`Scenario: ${s.label}`, { type: 'info', title: 'Use-Case Scenario' });
      this.refreshLive();
      this.saveSoon();
    } else {
      this.arrivalInterval = s.arrivals;
      this.productionTarget = s.target;
      this.cloudCover = s.cloud;
      this.tariff = s.tariff;
    }
    return s;
  }

  stopScenario() {
    this.scenarioRun = false;
    this.logEvent('Scenario stopped', 'Manual operation — scenario timeline paused.', 'info');
    this.refreshLive();
  }

  /* =========================================================
     Simulation
     ========================================================= */
  updateSimulation(dt) {
    if (!this.scene) return;
    this.updateEnvironment(dt);
    this.updateEnergy(dt);
    this.updateWater(dt);
    this.updateCold(dt);
    this.updateProduction(dt);
    this.updateLogistics(dt);
    this.updateSensors();
    this.updateVisuals(dt);
    if (this.scenarioRun) this.scenarioElapsed += dt;
  }

  updateEnvironment(dt) {
    const hour = (this.simTime / 3600) % 24;
    const dayFrac = hour / 24;
    if (this.scenarioRun) {
      const s = this.scenarioById(this.scenarioId);
      this.cloudCover = lerp(this.cloudCover, s.cloud, dt * .0006);
      this.ambientTarget = s.ambient;
    }
    // clear-sky elevation curve
    const elev = Math.sin((dayFrac - .25) * TAU);
    this.solarElevation = elev;
    const clear = clamp(elev, 0, 1) * 1050;
    const cloud = clamp(this.cloudCover, 0, .95);
    this.irradiance = Math.max(0, clear * (1 - cloud * .72));
    const baseAmbient = 24 + Math.sin((dayFrac - .3) * TAU) * 6.5;
    this.ambientTemp = lerp(this.ambientTemp, (this.ambientTarget ?? baseAmbient) + (baseAmbient - 24) * .6, dt * .002);
    this.simClockLabel = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
  }

  /* ---------------- Energy ---------------- */
  updateEnergy(dt) {
    // panel thermal model: cell temperature settles above ambient with irradiance
    const panelTarget = this.ambientTemp + (this.irradiance / 1000) * 28 * (this.cloudCover > .5 ? .55 : 1);
    this.panelTemp += (panelTarget - this.panelTemp) * clamp(dt * .02, 0, 1);
    const derate = clamp(1 - Math.max(0, this.panelTemp - 25) * .0038, .62, 1);
    const enabled = this.arrayDisabled ? 0 : (this.enabledPanels ?? 1);
    const pv = ENERGY.panelKw * 1000 * ENERGY.panelCount * (this.irradiance / 1000) * derate * ENERGY.systemLoss * ENERGY.inverterEff * enabled;
    this.pvPower = Math.max(0, pv);
    this.energyToday += this.pvPower * dt / 3600 / 1000;

    // demands
    const night = !this.isDaylight();
    const dockFactor = .35 + .13 * this.dockOccupancy();
    const demands = {
      control: this.loads.control.base,
      cold: this.loads.cold.base * (.5 + 1.05 * this.compressorLoad),
      water: this.loads.water.base * (this.pumpOn ? clamp(this.pumpSpeed / 70, 0, 1.25) : 0),
      line: this.loads.line.base * (this.lineRunning && !this.lineJam ? clamp(this.lineSpeed / this.lineRatedSpeed, 0, 1.2) : 0),
      dock: this.loads.dock.base * dockFactor,
      lighting: this.loads.lighting.base * (this.lightingOn ? (night ? 1.2 : .4) : 0),
    };
    let total = 0;
    for (const d of LOAD_DEFS) { this.loads[d.id].demand = demands[d.id] * 1000; total += this.loads[d.id].demand; }
    this.siteLoad = total;

    // supply
    const gridAvailable = !this.islandMode && !this.faults.grid;
    const gridMax = 46 * 1000;
    let remaining = total;
    let pvUsed = Math.min(this.pvPower, remaining);
    remaining -= pvUsed;
    let gridUsed = 0;
    if (gridAvailable) { gridUsed = Math.min(remaining, gridMax); remaining -= gridUsed; }
    let battUsed = 0;
    const battDischargeCap = Math.min(ENERGY.batteryMaxDischargeKw * 1000, Math.max(0, (this.batterySoc - 4) / 100 * ENERGY.batteryKwh / Math.max(dt / 3600, 1e-4)));

    let served = pvUsed + gridUsed;
    let unserved = 0;
    // priority allocation
    const ordered = [...LOAD_DEFS].sort((a, b) => a.priority - b.priority);
    let pool = served;
    for (const d of ordered) {
      const l = this.loads[d.id];
      const take = Math.min(l.demand, pool);
      l.served = take;
      l.shed = l.demand - take > 40;
      pool -= take;
    }
    unserved = Math.max(0, total - served);
    if (unserved > 0 && this.loadShedEnabled) {
      // island or grid fault: battery covers what it can, in priority order
      const avail = Math.min(unserved, battDischargeCap);
      battUsed = avail;
      let pool2 = avail;
      for (const d of ordered) {
        const l = this.loads[d.id];
        const shortfall = l.demand - l.served;
        if (shortfall <= 0) continue;
        const take = Math.min(shortfall, pool2);
        l.served += take;
        l.shed = (l.demand - l.served) > 40;
        pool2 -= take;
        if (pool2 <= 0) break;
      }
      served += avail;
      unserved = Math.max(0, total - served);
    } else if (!this.loadShedEnabled) {
      // no shedding: everything is wanted, deficit becomes a brownout
      unserved = Math.max(0, total - served);
    }
    this.loadServed = served;
    this.unservedLoad = unserved / 1000;
    this.shedLevel = total > 0 ? clamp(unserved / total, 0, 1) : 0;
    this.gridImport = gridUsed;

    // battery power flow: surplus charges, deficit (island) discharges
    let battPowerW = 0;
    const surplus = this.pvPower + gridUsed - served;
    const hours = dt / 3600;
    if (surplus > 0) {
      battPowerW = Math.min(surplus, ENERGY.batteryMaxChargeKw * 1000);
      const addedKwh = (battPowerW / 1000) * .95 * hours;
      this.batterySoc = clamp(this.batterySoc + addedKwh / ENERGY.batteryKwh * 100, 0, 100);
    } else if (this.islandMode || this.faults.grid) {
      battPowerW = -battUsed;
      const drawnKwh = (battUsed / 1000) / .95 * hours;
      this.batterySoc = clamp(this.batterySoc - drawnKwh / ENERGY.batteryKwh * 100, 0, 100);
    }
    this.batteryPower = battPowerW;
    const stress = Math.abs(battPowerW) / 1000 / ENERGY.batteryMaxDischargeKw;
    this.batteryTemp = clamp(this.batteryTemp + (stress * 3.4 - (this.batteryTemp - this.ambientTemp) * .05) * dt * .06, -5, 60);
    if (this.batteryTemp > 40) this.batteryHealth = clamp(this.batteryHealth - dt * .0035, 40, 100);

    // load LEDs on the distribution board
    for (const led of this.loadLeds || []) {
      const l = this.loads[led.id];
      const ratio = l.demand > 0 ? l.served / l.demand : 1;
      led.mat.emissiveIntensity = l.shed ? (Math.sin(this.simTime * 6) > 0 ? 1.9 : .25) : (ratio > .5 ? 1.3 : .5);
      led.mat.emissive.setHex(l.shed ? 0xff4d5e : 0x36e2c2);
      led.mat.color.setHex(l.shed ? 0xff4d5e : 0x36e2c2);
    }
    // battery module bars
    (this.batteryModules || []).forEach((m, i) => {
      const mat = m.userData.barMat;
      if (!mat) return;
      const seg = clamp((this.batterySoc - i * 25) / 25, 0, 1);
      const col = this.batterySoc < 20 ? 0xff4a5f : this.batterySoc < 45 ? 0xffb547 : 0x36e2c2;
      mat.color.setHex(col);
      mat.emissive.setHex(col);
      mat.emissiveIntensity = .35 + seg * 1.4;
    });
  }

  /* ---------------- Water ---------------- */
  updateWater(dt) {
    // level control: modulate pump speed to hold the reservoir in its working band
    if (this.pumpOn && !this.faults.pump) {
      if (this.tankLevelPct > 92) this.pumpSpeed = Math.max(15, this.pumpSpeed - 12 * dt);
      else if (this.tankLevelPct < 55) this.pumpSpeed = Math.min(110, this.pumpSpeed + 9 * dt);
      else if (this.tankLevelPct > 80) this.pumpSpeed = Math.max(30, this.pumpSpeed - 3 * dt);
    }
    const powerRatio = this.loads.water.demand > 0 ? clamp(this.loads.water.served / this.loads.water.demand, 0, 1) : 0;
    this.pumpFlow = this.pumpOn && !this.faults.pump
      ? clamp(this.pumpSpeed / 100 * 420 * powerRatio * (this.tankLevelPct > 95 ? .2 : 1), 0, 430)
      : 0;
    // consumption: condenser make-up, line rinse, dock activity
    const makeup = this.compressorLoad * 22 + (this.doorAngle > .1 ? 9 : 0);
    const rinse = this.lineRunning && !this.lineJam ? this.lineSpeed * .85 : 0;
    const yard = this.dockOccupancy() * 2.4;
    this.waterConsumption = makeup + rinse + yard;
    if (this.faults.pump) this.waterConsumption += 0;
    const net = (this.pumpFlow - this.waterConsumption) / 60 * dt;
    this.tankLevelPct = clamp(this.tankLevelPct + net / this.tankCapacityL * 100, 0, 100);
    this.pumpDeliveryL = (this.pumpDeliveryL || 0) + Math.max(0, this.pumpFlow) * dt / 60;
    this.waterToday += this.waterConsumption * dt / 60;
    // pump cavitation / dry protection
    if (this.tankLevelPct < 2 && this.pumpOn && !this.faults.pump) {
      this.dryTimer = (this.dryTimer || 0) + dt;
      if (this.dryTimer > 20) {
        this.pumpOn = false;
        this.faults.pump = true;
        this.dryTimer = 0;
        this.logEvent('Pump trip', 'Booster set tripped on dry-run protection.', 'danger');
      }
    } else if (this.tankLevelPct > 6) this.dryTimer = 0;
  }

  /* ---------------- Cold chain ---------------- */
  updateCold(dt) {
    const c = this.loads.cold;
    const powerRatio = c.demand > 0 ? clamp(c.served / c.demand, 0, 1) : 0;
    const waterFactor = this.tankLevelPct < 5 ? .25 : this.tankLevelPct < 15 ? .55 : this.tankLevelPct < 25 ? .85 : 1;
    const faultFactor = this.faults.compressor ? .08 : 1;
    const coolingKw = (this.loads.cold.base * (.5 + 1.05 * this.compressorLoad)) * powerRatio * waterFactor * faultFactor;
    this.compressorLoad = clamp(lerp(this.compressorLoad, this.faults.compressor ? 0 : clamp(.35 + (this.averageColdTemp() - (-10)) * .045, .2, 1), dt * .2), 0, 1);
    const doorOpen = this.doorAngle > .1;
    const doorFactor = doorOpen ? clamp(this.doorAngle / 1.6, 0, 1) : 0;
    let totalCoolingDemand = 0;
    for (const z of this.coldZones) {
      totalCoolingDemand += Math.max(.15, (this.ambientTemp - z.temp) * .022 * z.coupling * 20);
    }
    const zoneCount = this.coldZones.length || 1;
    for (const z of this.coldZones) {
      const heat = (this.ambientTemp - z.temp) * .026 * z.coupling + doorFactor * z.doorGain * (this.ambientTemp - z.temp) * .022;
      const zoneWeight = Math.max(.15, (this.ambientTemp - z.temp) * .022 * z.coupling * 20) / totalCoolingDemand;
      // each zone also receives an equal share so no zone is starved by the weighting
      const share = zoneWeight * .65 + (1 / zoneCount) * .35;
      // proportional control: cooling backs off as the zone approaches/below setpoint
      const cold = z.setpoint - z.temp;              // >0 when the zone is colder than setpoint
      const authority = clamp(1 - cold * .15, .12, 2.1);
      const cool = coolingKw * 1.6 * .17 * share * authority;
      z.temp = clamp(z.temp + (heat - cool) * dt / 60, z.setpoint - 8, 30);
    }
    // doser: dock activity drives door cycling
    if (this.doorTarget > 0) this.doorAngle = clamp(this.doorAngle + dt * 1.3, 0, 1.6);
    else this.doorAngle = clamp(this.doorAngle - dt * 1.0, 0, 1.6);
    if (this.doorAngle > .1) this.doorOpenElapsed += dt; else this.doorOpenElapsed = 0;
    if (this.doorHold > 0) this.doorHold -= dt;
    // once the hold expires the door is commanded closed again
    if (this.doorHold <= 0 && this.doorTarget > 0) this.doorTarget = 0;
    // quarantine on excursion
    if (this.coldBreach() && this.coldInventory > 0) {
      const move = Math.min(this.coldInventory, 1.6 * dt);
      this.coldInventory -= move;
      this.coldQuarantine += move;
    } else if (!this.coldBreach() && this.coldQuarantine > 0) {
      // slow release back to saleable stock once back in band
      const back = Math.min(this.coldQuarantine, .35 * dt);
      this.coldQuarantine -= back;
      this.coldInventory += back;
    }
    this.coldInventory = clamp(this.coldInventory, 0, 3000);
  }

  /* ---------------- Production ---------------- */
  updateProduction(dt) {
    const l = this.loads.line;
    const powerRatio = l.demand > 0 ? clamp(l.served / l.demand, 0, 1) : 0;
    const running = this.lineRunning && !this.lineJam && powerRatio > .15;
    this.linePowerRatio = powerRatio;
    const material = this.rawStock > 0 ? 1 : 0;
    const speedFactor = clamp(this.lineSpeed / this.lineRatedSpeed, 0, 1.25);
    this.productionRate = running ? 470 * speedFactor * powerRatio * material : 0;
    this._cartonAccum = (this._cartonAccum || 0) + this.productionRate * dt / 3600;
    while (this._cartonAccum >= 1) {
      this._cartonAccum -= 1;
      this.rawStock = Math.max(0, this.rawStock - 1);
      this.producedToday++;
      this.producedShift++;
      this.spawnCarton();
    }
    if (this.lineRunning && !this.lineJam && this.rawStock <= 0) this.starveTimer = (this.starveTimer || 0) + dt;
    else this.starveTimer = 0;
    // carton motion along the U path
    for (const carton of [...this.cartonsOnLine]) {
      carton.t += (this.lineSpeed / this.lineCurveLength) * dt / 60 * (running ? 1 : 0);
      if (carton.t >= 1) {
        this.transferCarton(carton);
        continue;
      }
      const p = this.lineCurve.getPointAt(clamp(carton.t, 0, .999));
      const tan = this.lineCurve.getTangentAt(clamp(carton.t, 0, .999));
      carton.mesh.position.set(p.x, p.y + .05, p.z);
      carton.mesh.rotation.y = Math.atan2(-tan.z, tan.x);
    }
  }

  spawnCarton() {
    if (!this.lineCurve) {
      const l = SITE.line;
      this.lineCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(l.x0 + 1, LINE.beltY, l.z0 + 1.6),
        new THREE.Vector3(l.x1 - 1, LINE.beltY, l.z0 + 1.6),
        new THREE.Vector3(l.x1 - 1, LINE.beltY, l.z1 - 1.6),
        new THREE.Vector3(l.x0 + 1, LINE.beltY, l.z1 - 1.6),
        new THREE.Vector3(l.x0 + 1, LINE.beltY, l.z0 + 1.6),
      ], true, 'catmullrom', .2);
      this.lineCurveLength = this.lineCurve.getLength();
    }
    if (this.cartonsOnLine.length >= 16) return;
    const mesh = makeCardboardBox(.62, .48, .62, 0xd9c09a, `C${(this.producedToday % 999)}`);
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    this.cat.conveyors.add(mesh);
    this.cartonsOnLine.push({ mesh, t: 0 });
  }

  transferCarton(carton) {
    this.cat.conveyors.remove(carton.mesh);
    this.cartonsOnLine = this.cartonsOnLine.filter(c => c !== carton);
    this.lineBins[1].userData.fill.material.opacity = .55;
    setTimeout(() => { if (this.lineBins) this.lineBins[1].userData.fill.material.opacity = .4; }, 400);
    this.coldInventory = clamp(this.coldInventory + 1, 0, 3000);
    this.transferredToday = (this.transferredToday || 0) + 1;
    this.coldBatches.unshift({ id: `B-${++this._batchSerial}`, at: this.simTime, units: 1 });
    if (this.coldBatches.length > 12) this.coldBatches.pop();
  }

  /* ---------------- Logistics ---------------- */
  updateLogistics(dt) {
    if (this.config.arrivalsEnabled !== false && !this.manualMode) {
      this.arrivalTimer += dt;
      if (this.arrivalTimer >= (this.arrivalInterval || 42)) {
        this.arrivalTimer = 0;
        this.spawnTruck();
      }
    }
    for (const truck of [...this.trucks]) {
      if (truck.state === 'arriving') {
        truck.progress = clamp(truck.progress + dt / 9, 0, 1);
        this.moveTruckVisual(truck);
        if (truck.progress >= 1) {
          truck.state = 'docked';
          truck.timer = truck.serviceTime;
          this.doorTarget = 1.6;
          this.doorHold = 14;
        }
      } else if (truck.state === 'docked') {
        truck.timer -= dt;
        if (truck.timer <= 0) {
          truck.state = 'departing';
          truck.progress = 0;
          if (truck.cargo.role === 'inbound') {
            this.rawStock = Math.min(2400, this.rawStock + truck.cargo.units);
            this.loadedToday += truck.cargo.units;
          } else {
            const out = Math.min(this.coldInventory, truck.cargo.units);
            this.coldInventory -= out;
            this.dispatchedToday += out;
          }
          if (truck.bay != null) {
            const bay = this.bays.find(b => b.id === truck.bay);
            if (bay) { bay.occupied = false; bay.truckId = null; }
          }
          this.logEvent('Truck serviced', `${truck.plate} · ${truck.cargo.role === 'inbound' ? 'unloaded' : 'loaded'} ${Math.round(truck.cargo.units)} units (${truck.cargo.label}).`, 'ok');
          this.doorHold = 8;
        }
      } else if (truck.state === 'departing') {
        truck.progress = clamp(truck.progress + dt / 9, 0, 1);
        this.moveTruckVisual(truck);
        if (truck.progress >= 1) this.removeTruck(truck);
      }
    }
    this.trucksWaiting = this.trucks.filter(t => t.state === 'arriving' && t.bay == null).length;
    // barriers react to moving vehicles
    const active = this.trucks.some(t => t.state !== 'docked');
    for (const key of ['in', 'out']) {
      const b = this.barriers?.[key];
      if (!b) continue;
      b.target = active ? 1.45 : 0;
      const diff = b.target - b.angle;
      if (Math.abs(diff) > .002) b.angle += Math.sign(diff) * Math.min(Math.abs(diff), dt * 1.6);
      b.arm.rotation.z = b.angle;
      b.led.color.setHex(b.angle > 1.2 ? 0x3ce58b : 0xff4d5e);
      b.led.emissive.setHex(b.angle > 1.2 ? 0x3ce58b : 0xff4d5e);
    }
  }

  spawnTruck(opts = {}) {
    const free = this.bays.filter(b => !b.occupied);
    const inbound = opts.role ? opts.role === 'inbound' : Math.random() < .62;
    const cargo = opts.cargo || (inbound
      ? { role: 'inbound', label: RAW_MATERIALS[Math.floor(Math.random() * RAW_MATERIALS.length)].label, units: 55 + Math.round(Math.random() * 70) }
      : { role: 'outbound', label: 'Finished goods', units: 60 + Math.round(Math.random() * 80) });
    const truck = {
      id: `truck-${++this._truckSerial}`, plate: `CG-${this._truckSerial}`,
      state: 'arriving', progress: 0, timer: 0, bay: null, cargo,
      serviceTime: opts.serviceTime ?? (34 + Math.random() * 34),
      color: inbound ? 0x3d6fa8 : 0xd3913f,
    };
    const mesh = makeCar(truck.color, { type: 'van' });
    mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.cat.vehicles.add(mesh);
    const label = textSprite(truck.plate, { size: 28, scale: .46, color: '#dff8f2', bg: 'rgba(4,14,22,.7)', border: 'rgba(140,224,106,.3)' });
    label.position.set(0, 2.5, 0);
    label.visible = this.labelsVisible;
    mesh.add(label);
    truck.mesh = mesh;
    this.trucks.push(truck);
    this.addObject(mesh, {
      id: truck.id, label: `Truck ${truck.plate}`, kind: 'truck', iconName: 'vehicle',
      description: `${cargo.role === 'inbound' ? 'Inbound raw material' : 'Outbound dispatch'} vehicle — ${cargo.label}.`,
    });
    if (free.length) {
      const bay = free[0];
      bay.occupied = true; bay.truckId = truck.id;
      truck.bay = bay.id;
      truck.path = { from: [SITE.yard.x1 + 1.6, SITE.yard.z0 + 1.0], to: [bay.x, bay.z] };
    } else {
      truck.path = { from: [SITE.yard.x1 + 1.6, SITE.yard.z0 + 1.0], to: [SITE.yard.x1 + 2.4, SITE.yard.z0 + 1.0 + (this.trucks.length % 4) * 3.6] };
    }
    this.logEvent(inbound ? 'Truck inbound' : 'Truck dispatched',
      `${truck.plate} — ${cargo.label} (${Math.round(cargo.units)} units) ${inbound ? 'arriving for unload' : 'collecting finished goods'}.`, 'info');
    return truck;
  }

  moveTruckVisual(truck) {
    const p = truck.state === 'departing'
      ? { from: truck.path.to, to: [SITE.yard.x1 + 6.0, SITE.yard.z1 + 6.0] }
      : truck.path;
    const k = truck.progress;
    const x = lerp(p.from[0], p.to[0], k);
    const z = lerp(p.from[1], p.to[1], k);
    truck.mesh.position.set(x, 0, z);
    truck.mesh.rotation.y = Math.atan2(-(p.to[1] - p.from[1]), (p.to[0] - p.from[0]));
    const wheels = truck.mesh.userData.wheels || [];
    for (const w of wheels) w.rotation.z -= .22;
  }

  removeTruck(truck) {
    this.scene.unregister(truck.id);
    this.objects.delete(truck.id);
    if (truck.mesh.parent) truck.mesh.parent.remove(truck.mesh);
    this.trucks = this.trucks.filter(t => t !== truck);
    if (this.selectedId === truck.id) this.closeInspector();
  }

  clearTrucks() {
    for (const t of [...this.trucks]) this.removeTruck(t);
    for (const b of this.bays) { b.occupied = false; b.truckId = null; }
    ui.toast('Logistics yard cleared.', { type: 'info' });
  }

  /* ---------------- Sensors ---------------- */
  updateSensors() {
    this.setSensorValue('pv-power', this.pvPower / 1000);
    this.setSensorValue('irradiance', this.irradiance);
    this.setSensorValue('battery-soc', this.batterySoc);
    this.setSensorValue('battery-power', this.batteryPower / 1000);
    this.setSensorValue('site-load', this.loadServed / 1000);
    this.setSensorValue('grid-import', this.gridImport / 1000);
    this.setSensorValue('tank-level', this.tankLevelPct);
    this.setSensorValue('pump-flow', this.pumpFlow);
    this.setSensorValue('water-draw', this.waterConsumption);
    this.setSensorValue('line-speed', this.linePowerRatio > .15 && this.lineRunning && !this.lineJam ? this.lineSpeed : 0);
    this.setSensorValue('throughput', this.productionRate);
    this.setSensorValue('raw-stock', this.rawStock);
    this.setSensorValue('cold-zone-a', this.coldZones[0].temp);
    this.setSensorValue('cold-zone-b', this.coldZones[1].temp);
    this.setSensorValue('cold-inventory', this.coldInventory);
    this.setSensorValue('dock-occupancy', this.dockOccupancy());
  }

  /* ---------------- Visual updates ---------------- */
  updateVisuals(dt) {
    // PV brightness follows irradiance
    const pvRatio = clamp(this.irradiance / 1000, 0, 1);
    for (const m of this.pvMats || []) m.emissiveIntensity = .12 + pvRatio * .9;
    // tank water level + float
    if (this.tankWater) {
      const frac = clamp(this.tankLevelPct / 100, 0, 1);
      const h = Math.max(.05, 2.5 * frac);
      this.tankWater.scale.y = h;
      this.tankWater.position.y = 3.55 + h / 2;
      this.tankWater.material.opacity = .55 + frac * .3;
    }
    if (this.tankFloat) this.tankFloat.position.y = 3.62 + 2.52 * clamp(this.tankLevelPct / 100, 0, 1);
    // pump impeller + valves
    if (this.pumpImpeller) this.pumpImpeller.rotation.z += (this.pumpFlow / 420) * 14 * dt;
    if (this.valveInWheel) this.valveInWheel.rotation.y += dt * (this.pumpOn ? .5 : 0);
    if (this.lineFan) this.lineFan.rotation.z += (this.lineRunning && !this.lineJam ? 12 : 0) * dt;
    // rollers + chevrons
    const belt = this.lineRunning && !this.lineJam ? this.lineSpeed / 18 : 0;
    for (const r of this.lineRollers || []) r.rotation.x += belt * dt * 6;
    for (const c of this.beltChevrons || []) {
      c.visible = belt > .05;
      c.material.opacity = .18 + Math.abs(Math.sin((this.simTime * 2 + c.position.x) * .5)) * .3;
    }
    // diverter swings toward active destination
    if (this.diverterArm) {
      const target = this._diverterTarget || 0;
      this.diverterArm.rotation.y = lerp(this.diverterArm.rotation.y, target, clamp(dt * 3, 0, 1));
    }
    // cold store door shutter
    if (this.coldDoor) {
      const openFrac = clamp(this.doorAngle / 1.6, 0, 1);
      this.coldDoor.position.y = .3 + openFrac * (COLD.door.h - .2);
      if (this.doorLed) {
        const col = this.doorAngle > .1 ? 0xffb547 : 0x3ce58b;
        this.doorLed.color.setHex(col);
        this.doorLed.emissive.setHex(col);
      }
    }
    if (this.condFan) this.condFan.rotation.z += (this.faults.compressor ? 0 : .35 + this.compressorLoad) * 9 * dt;
    // heat map
    const tmpColor = new THREE.Color();
    for (const h of this.coldHeat || []) {
      tempColor(h.zone.temp, tmpColor);
      h.mat.color.copy(tmpColor);
      h.mat.opacity = .12 + clamp((h.zone.temp - h.zone.setpoint) / 14, 0, 1) * .4;
    }
    // plumes
    for (const p of this.coldPlumes || []) {
      const k = (this.simTime * .35 + p.phase) % 1;
      p.mesh.position.y = .5 + k * 3.2;
      p.mesh.material.opacity = .12 * (1 - k) * (this.doorAngle > .1 ? 1.6 : .45);
      p.mesh.scale.setScalar(.7 + k * .8);
    }
    for (const p of this.exhaustPlumes || []) {
      const k = (this.simTime * .3 + p.phase) % 1;
      p.mesh.position.y = 1.5 + k * 3.4;
      p.mesh.material.opacity = .07 * (1 - k) * (this.faults.compressor ? .3 : 1);
      p.mesh.scale.setScalar(.7 + k * 1.1);
    }
    // energy flow pulses — dot density and speed follow the real power on each run
    const powerOf = {
      generation: this.pvPower,
      site: this.loadServed,
      cold: this.loads.cold.served,
      line: this.loads.line.served,
      water: this.loads.water.served,
      dock: this.loads.dock.served,
    };
    const m4 = new THREE.Matrix4();
    const v3 = new THREE.Vector3();
    for (const f of this.energyFlows || []) {
      const power = powerOf[f.id] || 0;
      const ratio = clamp(power / f.maxPower, 0, 1);
      f.ratio = ratio;
      const active = ratio > .06 ? Math.max(1, Math.round(f.count * ratio)) : 0;
      if (active > 0) {
        f.offset = (f.offset + dt * (.22 + ratio * .8)) % 1;
        for (let i = 0; i < active; i++) {
          const t = ((i / f.count) + f.offset) % 1;
          const p = f.curve.getPointAt(t);
          v3.copy(p);
          m4.makeTranslation(v3.x, v3.y, v3.z);
          m4.scale(new THREE.Vector3(.7 + ratio * .8, .7 + ratio * .8, .7 + ratio * .8));
          f.dots.setMatrixAt(i, m4);
        }
        f.dots.instanceMatrix.needsUpdate = true;
      }
      f.dots.count = active;
    }
    // control beacon
    if (this.controlBeacon?.userData?.setLamps) {
      const a = this.getActiveAlarms();
      const crit = a.some(x => x.severity === 'critical');
      this.controlBeacon.userData.setLamps(crit, a.length > 0 && !crit, a.length === 0);
    }
  }

  /* =========================================================
     Tab naming
     ========================================================= */
  getTabLabel(kind) { return kind === 'spawn' ? 'Scenario & Supply' : super.getTabLabel(kind); }
  spawnIcon() { return 'link'; }

  onAfterMount() {
    setTimeout(() => {
      if (this._destroyed) return;
      this.spawnTruck({ role: 'inbound', serviceTime: 40 });
      setTimeout(() => { if (!this._destroyed) this.spawnTruck({ role: 'outbound', serviceTime: 55 }); }, 600);
    }, 200);
  }

  onSimulationStart() { this.logEvent('Campus engine resumed', 'Cross-system automation active.', 'ok'); }
  onSimulationStop() { this.logEvent('Campus engine stopped', 'All automatic processing halted.', 'warn'); }

  /* =========================================================
     Overview
     ========================================================= */
  getOverviewMetrics() {
    return [
      {
        label: 'Power Balance', iconName: 'bolt', sub: 'Generation vs demand',
        bind: () => {
          const net = (this.pvPower - this.loadServed) / 1000;
          return {
            value: `${net >= 0 ? '+' : ''}${fmt(net, 2)}`, unit: 'kW',
            tone: net >= 0 ? 'ok' : (this.batterySoc < 25 ? 'danger' : 'warn'),
            sub: `PV ${fmt(this.pvPower / 1000, 2)} · load ${fmt(this.loadServed / 1000, 2)} kW`,
          };
        },
      },
      {
        label: 'Battery SOC', iconName: 'battery', sub: () => '',
        bind: () => ({
          value: fmt(this.batterySoc, 1), unit: '%',
          tone: this.batterySoc < 20 ? 'danger' : this.batterySoc < 45 ? 'warn' : 'ok',
          sub: this.islandMode
            ? `ISLAND · battery ${this.batteryPower >= 0 ? 'charging' : 'discharging'} ${fmt(Math.abs(this.batteryPower) / 1000, 1)} kW`
            : `grid import ${fmt(this.gridImport / 1000, 1)} kW · battery ${this.batteryPower >= 0 ? 'charging' : 'discharging'} ${fmt(Math.abs(this.batteryPower) / 1000, 1)} kW`,
        }),
      },
      {
        label: 'Reservoir', iconName: 'tank', sub: 'Process water',
        bind: () => ({
          value: fmt(this.tankLevelPct, 1), unit: '%',
          tone: this.tankLevelPct < 15 ? 'danger' : this.tankLevelPct < 30 ? 'warn' : 'ok',
          sub: `pump ${fmt(this.pumpFlow, 0)} · draw ${fmt(this.waterConsumption, 0)} L/min`,
        }),
      },
      {
        label: 'Throughput', iconName: 'package', sub: 'Cartons per hour',
        bind: () => ({
          value: fmt(this.productionRate, 0), unit: 'ctn/h',
          tone: !this.lineRunning ? 'muted' : this.rawStock <= 0 ? 'danger' : this.productionRate < 120 ? 'warn' : 'ok',
          sub: `${this.producedToday} produced · raw ${Math.round(this.rawStock)}`,
        }),
      },
      {
        label: 'Cold Chain', iconName: 'cold', sub: 'Store temperatures',
        bind: () => ({
          value: this.coldZones.map(z => fmt(z.temp, 1)).join(' / '), unit: '°C',
          tone: this.coldBreach() ? 'danger' : 'ok',
          sub: `${Math.round(this.coldInventory)} units · ${Math.round(this.coldQuarantine)} quarantine`,
        }),
      },
      {
        label: 'Logistics', iconName: 'vehicle', sub: 'Dock activity',
        bind: () => ({
          value: `${this.dockOccupancy()}/${SITE.yard.bays}`,
          tone: this.trucksWaiting > this.threshold('dockQueue', 3) ? 'warn' : 'ok',
          sub: `${this.trucksWaiting} waiting · ${this.dispatchedToday} dispatched`,
        }),
      },
    ];
  }

  overviewExtra(body) {
    /* ---------------- cross-system coupling board ---------------- */
    const sec = el('div', { class: 'section' });
    const title = el('div', { class: 'section-title' });
    title.innerHTML = `${ui.icon('link', 12).outerHTML} Cross-System Coupling`;
    title.appendChild(el('span', { class: 'side', text: 'LIVE CAUSALITY' }));
    sec.appendChild(title);
    const card = el('div', { class: 'section-card' });
    const rows = [
      ['energy', 'Solar + battery → site loads', () => `${fmt(this.pvPower / 1000, 2)} kW generated · ${fmt(this.loadServed / 1000, 2)} kW served${this.shedLevel > .01 ? ` · shedding ${Math.round(this.shedLevel * 100)}%` : ''}`],
      ['water', 'Reservoir → cooling make-up', () => `${fmt(this.pumpFlow, 0)} L/min in · ${fmt(this.waterConsumption, 0)} L/min out · level ${fmt(this.tankLevelPct, 1)}%`],
      ['cold', 'Cold store ← power + water', () => `${this.coldZones.map(z => `${z.label.split(' ')[0]} ${fmt(z.temp, 1)}°C`).join(' · ')} · plant load ${Math.round(this.compressorLoad * 100)}%`],
      ['line', 'Line ← power + raw material', () => `${this.lineRunning && !this.lineJam ? 'running' : this.lineJam ? 'jammed' : 'stopped'} · raw stock ${Math.round(this.rawStock)} · ${fmt(this.productionRate, 0)} ctn/h`],
      ['dock', 'Dock ↔ trucks ↔ stock', () => `${this.dockOccupancy()} vehicles on site · ${this.trucksWaiting} queued · ${Math.round(this.loadedToday)} units received`],
      ['scenario', 'Scenario runner', () => this.scenarioRun ? `${this.scenarioLabel()} · ${Math.round(this.scenarioProgress() * 100)}% · target ${this.productionTarget ?? '—'} ctn` : 'idle — manual operation'],
    ];
    const list = el('div', { class: 'kv-list' });
    for (const [id, label, text] of rows) {
      const row = el('div', { class: 'kv-row live-field' });
      row.append(el('span', { class: 'k' }, ui.statusDot('live'), label));
      const v = el('span', { class: 'v text' });
      list.appendChild(row);
      row.appendChild(v);
      this.addPanelBind(() => { v.textContent = text(); });
    }
    card.appendChild(list);
    sec.appendChild(card);
    body.appendChild(sec);

    /* ---------------- load allocation ---------------- */
    const loadSec = el('div', { class: 'section' });
    const loadTitle = el('div', { class: 'section-title' });
    loadTitle.innerHTML = `${ui.icon('panel', 12).outerHTML} Priority Load Allocation`;
    loadSec.appendChild(loadTitle);
    const loadCard = el('div', { class: 'section-card' });
    for (const d of LOAD_DEFS) {
      const row = el('div', { class: 'kv-row' });
      row.append(el('span', { class: 'k' }, `${d.priority + 1}. ${d.label}`));
      const v = el('span', { class: 'v' });
      const bar = ui.progressBar(0);
      const wrap = el('div', { style: { minWidth: '120px', flex: '1' } }, bar);
      row.appendChild(wrap);
      const vt = el('span', { class: 'v', style: { minWidth: '86px', textAlign: 'right' } });
      row.appendChild(vt);
      loadCard.appendChild(row);
      this.addPanelBind(() => {
        const l = this.loads[d.id];
        const ratio = l.demand > 0 ? l.served / l.demand : 1;
        bar._set(ratio * 100);
        bar.className = `progress ${l.shed ? 'danger' : ratio < .95 ? 'warn' : ''}`;
        vt.textContent = `${fmt(l.served / 1000, 1)}/${fmt(l.demand / 1000, 1)} kW`;
        vt.style.color = l.shed ? 'var(--danger)' : '';
      });
    }
    loadSec.appendChild(loadCard);
    loadSec.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Loads are served in priority order. During island operation the cold chain is protected first, then water, production and finally dock and lighting.' }));
    body.appendChild(loadSec);

    /* ---------------- stock & batches ---------------- */
    const stockSec = el('div', { class: 'section' });
    const stockTitle = el('div', { class: 'section-title' });
    stockTitle.innerHTML = `${ui.icon('inventory', 12).outerHTML} Cold Store Batches`;
    stockSec.appendChild(stockTitle);
    const stockCard = el('div', { class: 'section-card', style: { padding: '2px 10px', maxHeight: '150px', overflowY: 'auto' } });
    let lastBatch = -1;
    const renderBatches = () => {
      ui.clear(stockCard);
      if (!this.coldBatches.length) { stockCard.appendChild(el('div', { class: 'empty', style: { padding: '10px' }, text: 'No batches transferred from the line yet.' })); return; }
      for (const b of this.coldBatches.slice(0, 8)) {
        stockCard.appendChild(el('div', { class: 'kv-row' },
          el('span', { class: 'k', text: `${b.id} · ${b.units} units` }),
          el('span', { class: 'v', text: ui.fmtTime(b.at) })));
      }
    };
    renderBatches();
    this.addPanelBind(() => {
      if (lastBatch === this.coldBatches.length) return;
      lastBatch = this.coldBatches.length;
      renderBatches();
    });
    stockSec.appendChild(stockCard);
    body.appendChild(stockSec);

    /* ---------------- scenario log ---------------- */
    const logSec = el('div', { class: 'section' });
    const logTitle = el('div', { class: 'section-title' });
    logTitle.innerHTML = `${ui.icon('timeline', 12).outerHTML} Scenario Timeline`;
    logSec.appendChild(logTitle);
    const logCard = el('div', { class: 'section-card', style: { padding: '2px 10px', maxHeight: '140px', overflowY: 'auto' } });
    let lastLog = -1;
    this.addPanelBind(() => {
      if (lastLog === this.scenarioLog.length) return;
      lastLog = this.scenarioLog.length;
      ui.clear(logCard);
      if (!this.scenarioLog.length) { logCard.appendChild(el('div', { class: 'empty', style: { padding: '10px' }, text: 'No scenario events recorded.' })); return; }
      for (const entry of this.scenarioLog.slice(0, 8)) {
        logCard.appendChild(el('div', { class: 'kv-row' }, el('span', { class: 'k', text: entry.text }), el('span', { class: 'v', text: ui.fmtTime(entry.at) })));
      }
    });
    logSec.appendChild(logCard);
    body.appendChild(logSec);
  }

  getQuickActions() {
    return [
      { label: 'Run Peak Day', icon: 'play', variant: 'subtle', onClick: () => this.loadScenario('peak') },
      { label: this.islandMode ? 'Reconnect Grid' : 'Island Mode', icon: 'bolt', variant: this.islandMode ? 'warn' : undefined, onClick: () => this.toggleIsland() },
      { label: 'Receive Truck', icon: 'vehicle', onClick: () => { this.spawnTruck({ role: 'inbound' }); } },
      { label: this.lineRunning ? 'Stop Line' : 'Start Line', icon: this.lineRunning ? 'stop' : 'play', onClick: () => { this.setLineRunning(!this.lineRunning); } },
      { label: 'Scenario Panel', icon: 'sliders', onClick: () => this.setTab('spawn') },
    ];
  }

  getLegend() {
    return [
      { color: '#ffc247', label: 'Solar generation' },
      { color: '#8ce06a', label: 'Site distribution' },
      { color: '#63b6ff', label: 'Cold store feed' },
      { color: '#ffb547', label: 'Line feed' },
      { color: '#46a9ff', label: 'Water feed' },
      { color: '#a98bff', label: 'Dock feed' },
    ];
  }

  /* =========================================================
     Controls used by inspectors and panels
     ========================================================= */
  toggleIsland() {
    this.islandMode = !this.islandMode;
    this.config.islandMode = this.islandMode;
    this.faults.grid = this.islandMode;
    this.logEvent(this.islandMode ? 'Island mode engaged' : 'Grid reconnected',
      this.islandMode ? 'Utility supply isolated — battery carries priority loads.' : 'Utility supply restored, battery returns to charging.',
      this.islandMode ? 'warn' : 'ok');
    this.saveSoon();
    this.refreshLive();
  }

  setLoadShed(enabled) {
    this.loadShedEnabled = !!enabled;
    this.config.loadShedEnabled = this.loadShedEnabled;
    this.logEvent('Load shedding ' + (enabled ? 'enabled' : 'disabled'), enabled ? 'Priority shedding may occur on deficit.' : 'All loads attempted — brownout risk on deficit.', enabled ? 'info' : 'warn');
    this.saveSoon();
    this.refreshLive();
  }

  setLineRunning(run) {
    this.lineRunning = !!run;
    this.config.lineRunning = this.lineRunning;
    this.logEvent(`Line ${this.lineRunning ? 'started' : 'stopped'}`, this.lineRunning ? 'Packaging line commanded to run.' : 'Packaging line stopped by operator.', this.lineRunning ? 'ok' : 'warn');
    this.saveSoon();
    this.refreshLive();
  }

  setLineSpeed(v) {
    this.lineSpeed = clamp(+v || 0, 0, 24);
    this.config.lineSpeed = this.lineSpeed;
    this.saveSoon();
  }

  setColdSetpoint(zoneIndex, v) {
    const z = this.coldZones[zoneIndex];
    if (!z) return;
    z.setpoint = clamp(+v, -26, 6);
    if (zoneIndex === 0) this.config.coldSetpointA = z.setpoint; else this.config.coldSetpointB = z.setpoint;
    this.saveSoon();
    this.refreshLive();
  }

  setPump(on, speed) {
    if (on !== undefined) this.pumpOn = !!on;
    if (speed !== undefined) this.pumpSpeed = clamp(+speed, 10, 120);
    this.config.pumpSpeed = this.pumpSpeed;
    this.logEvent('Pumping ' + (this.pumpOn ? 'started' : 'stopped'), `Booster set ${this.pumpOn ? 'running' : 'off'} at ${Math.round(this.pumpSpeed)}% speed.`, this.pumpOn ? 'ok' : 'info');
    this.saveSoon();
    this.refreshLive();
  }

  clearPumpFault() { this.faults.pump = false; this.dryTimer = 0; this.logEvent('Pump fault cleared', 'Dry-run protection reset.', 'ok'); this.refreshLive(); }
  clearCompressorFault() { this.faults.compressor = false; this.logEvent('Refrigeration fault cleared', 'Condensing plant available again.', 'ok'); this.refreshLive(); }
  clearLinkedList() { this.lineJam = false; this.logEvent('Line jam cleared', 'Obstruction removed, line ready.', 'ok'); this.refreshLive(); }

  injectLineJam() {
    this.lineJam = true;
    this.logEvent('Line jam', 'Carton obstruction at the transfer — throughput lost.', 'danger');
    this.refreshLive();
  }

  addRawMaterial(amount = 120, label = 'Mixed pallets') {
    const before = this.rawStock;
    this.rawStock = clamp(this.rawStock + amount, 0, 2400);
    this.scenarioLog.unshift({ at: this.simTime, text: `Raw material received: +${Math.round(this.rawStock - before)} units (${label})` });
    this.logEvent('Raw material received', `+${Math.round(this.rawStock - before)} units · ${label}.`, 'ok');
    this.saveSoon();
    this.refreshLive();
  }

  dispatchStock(amount = 60) {
    const out = Math.min(this.coldInventory, amount);
    this.coldInventory -= out;
    this.dispatchedToday += out;
    const truck = this.spawnTruck({ role: 'outbound' });
    truck.cargo.units = out;
    this.logEvent('Dispatch scheduled', `${Math.round(out)} units assigned to ${truck.plate}.`, 'info');
    this.refreshLive();
  }

  releaseQuarantine() {
    this.coldInventory += this.coldQuarantine;
    this.logEvent('Quarantine released', `${Math.round(this.coldQuarantine)} units reclassified after review.`, 'warn');
    this.coldQuarantine = 0;
    this.refreshLive();
  }

  /* =========================================================
     Object inspectors
     ========================================================= */
  getObjectInspector(obj) {
    switch (obj.kind) {
      case 'pv-farm': return this.pvFarmInspector();
      case 'pv-station': return this.pvStationInspector();
      case 'battery': return this.batteryInspector();
      case 'distribution': return this.distributionInspector();
      case 'building': return this.buildingInspector(obj);
      case 'control': return this.controlInspector();
      case 'tank': return this.tankInspector();
      case 'pump': return this.pumpInspector();
      case 'line': return this.lineInspector();
      case 'motor': return this.motorInspector();
      case 'station': return this.sortStationInspector();
      case 'bin': return this.binInspector(obj);
      case 'cold-store': return this.coldStoreInspector();
      case 'door': return this.doorInspector();
      case 'compressor': return this.compressorInspector();
      case 'barrier': return this.barrierInspector(obj);
      case 'truck': return this.truckInspector(obj);
      default: return this.defaultInspector(obj);
    }
  }

  pvFarmInspector() {
    const panelsOn = Math.round((this.enabledPanels ?? 1) * ENERGY.panelCount);
    return {
      title: 'Photovoltaic Array Field',
      subtitle: 'PV-06 · 12 TILTED TABLES',
      iconName: 'solar',
      badge: () => ({ text: this.arrayDisabled ? 'ISOLATED' : `${fmt(this.pvPower / 1000, 2)} kW`, tone: this.arrayDisabled ? 'warn' : this.pvPower > 500 ? 'ok' : 'muted' }),
      fields: [
        { label: 'Irradiance', get: () => `${fmt(this.irradiance, 0)} W/m²` },
        { label: 'Array output', get: () => `${fmt(this.pvPower / 1000, 2)} kW` },
        { label: 'Panel temperature', get: () => `${fmt(this.panelTemp, 1)} °C` },
        { label: 'Derate factor', get: () => `${fmt(clamp(1 - Math.max(0, this.panelTemp - 25) * .0038, .55, 1) * 100, 1)} %` },
        { label: 'Panels online', get: () => `${panelsOn} / ${ENERGY.panelCount}` },
        { label: 'Energy today', get: () => `${fmt(this.energyToday, 1)} kWh` },
      ],
      sections: [{
        title: 'Array Controls', iconName: 'solar', controls: [
          { type: 'toggle', label: 'Array connected', description: 'Isolate the whole photovoltaic field.', value: !this.arrayDisabled, onChange: v => { this.arrayDisabled = !v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'slider', label: 'Panels enabled', min: 0, max: 1, step: 1 / ENERGY.panelCount, value: this.enabledPanels ?? 1, unit: 'ratio', format: v => `${Math.round(v * ENERGY.panelCount)} of ${ENERGY.panelCount}`, onChange: v => { this.enabledPanels = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'slider', label: 'Cloud cover', min: 0, max: .9, step: .01, value: this.cloudCover, unit: '', onChange: v => { this.cloudCover = v; this.saveSoon(); } },
          { type: 'button', label: 'Inspect inverter station', iconName: 'panel', onClick: () => this.selectObject('pv-station') },
        ],
      }],
      note: 'Array output follows irradiance, cell temperature derating and inverter efficiency. Isolating the field forces the site onto battery and grid.',
    };
  }

  pvStationInspector() {
    return {
      title: 'PV Combiner & Inverter Station',
      subtitle: 'STRINGS · MPPT · METERING',
      iconName: 'panel',
      badge: () => ({ text: this.arrayDisabled ? 'OFFLINE' : 'ONLINE', tone: this.arrayDisabled ? 'muted' : 'ok' }),
      fields: [
        { label: 'DC strings', value: '4 × 3 tables' },
        { label: 'AC output', get: () => `${fmt(this.pvPower / 1000, 2)} kW` },
        { label: 'Conversion efficiency', get: () => `${fmt(ENERGY.inverterEff * 100, 1)} %` },
        { label: 'Curtailment', get: () => this.loadShedEnabled && this.shedLevel > .01 ? 'ACTIVE' : 'NONE' },
        { label: 'Energy today', get: () => `${fmt(this.energyToday, 1)} kWh` },
      ],
      sections: [{
        title: 'Station Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Array connected', value: !this.arrayDisabled, onChange: v => { this.arrayDisabled = !v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Priority load shedding', description: 'Protect the cold chain by shedding lower-priority loads.', value: this.loadShedEnabled, onChange: v => { this.setLoadShed(v); this.refreshInspector(); } },
          { type: 'button', label: 'Open battery bank', iconName: 'battery', onClick: () => this.selectObject('battery-bank') },
        ],
      }],
    };
  }

  batteryInspector() {
    return {
      title: 'Battery Energy Storage',
      subtitle: `BESS-06 · ${ENERGY.batteryKwh} kWh`,
      iconName: 'battery',
      badge: () => ({ text: this.islandMode ? 'ISLAND SUPPLY' : (this.batteryPower >= 0 ? 'CHARGING' : 'DISCHARGING'), tone: this.batterySoc < 20 ? 'danger' : this.batterySoc < 45 ? 'warn' : 'ok' }),
      fields: [
        { label: 'State of charge', get: () => `${fmt(this.batterySoc, 1)} %` },
        { label: 'Stored energy', get: () => `${fmt(this.batterySoc / 100 * ENERGY.batteryKwh, 1)} kWh` },
        { label: 'Power flow', get: () => `${this.batteryPower >= 0 ? '+' : ''}${fmt(this.batteryPower / 1000, 2)} kW` },
        { label: 'Battery temperature', get: () => `${fmt(this.batteryTemp, 1)} °C` },
        { label: 'State of health', get: () => `${fmt(this.batteryHealth, 1)} %` },
        { label: 'Grid import', get: () => this.islandMode ? 'ISOLATED' : `${fmt(this.gridImport / 1000, 2)} kW` },
      ],
      sections: [{
        title: 'Battery Controls', iconName: 'battery', controls: [
          { type: 'toggle', label: 'Island mode', description: 'Disconnect the utility and run on battery plus solar.', value: this.islandMode, onChange: v => { if (v !== this.islandMode) this.toggleIsland(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Load shedding enabled', value: this.loadShedEnabled, onChange: v => { this.setLoadShed(v); this.refreshInspector(); } },
          { type: 'slider', label: 'Set state of charge', min: 0, max: 100, step: 1, value: this.batterySoc, unit: '%', onChange: v => { this.batterySoc = v; this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
      note: 'During island operation the battery supplies the deficit in strict priority order — the cold chain is never shed first.',
    };
  }

  distributionInspector() {
    const row = (l) => `${fmt(l.served / 1000, 1)} / ${fmt(l.demand / 1000, 1)} kW${l.shed ? ' · SHED' : ''}`;
    return {
      title: 'Main Distribution Board',
      subtitle: 'PRIORITY LOAD BUS',
      iconName: 'panel',
      badge: () => ({ text: this.shedLevel > .01 ? `SHEDDING ${Math.round(this.shedLevel * 100)}%` : 'NOMINAL', tone: this.shedLevel > .01 ? 'warn' : 'ok' }),
      fields: LOAD_DEFS.map(d => ({ label: d.label, get: () => row(this.loads[d.id]) })),
      sections: [{
        title: 'Bus Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Load shedding', value: this.loadShedEnabled, onChange: v => { this.setLoadShed(v); this.refreshInspector(); } },
          { type: 'toggle', label: 'Island mode', value: this.islandMode, onChange: v => { if (v !== this.islandMode) this.toggleIsland(); this.refreshInspector(); } },
          { type: 'toggle', label: 'Site lighting', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); this.refreshInspector(); } },
        ],
      }],
      note: 'Feeder priority: control centre → cold store → water pumping → packaging line → dock → lighting.',
    };
  }

  buildingInspector(obj) {
    const isControl = obj.id === 'control-centre';
    const isGate = obj.id === 'gatehouse';
    return {
      title: obj.label,
      subtitle: isControl ? 'SCADA · SITE SUPERVISION' : isGate ? 'LOGISTICS CHECK-IN' : 'UTILITY BUILDING',
      iconName: isControl ? 'grid' : isGate ? 'shield' : 'panel',
      badge: () => ({ text: isControl ? (this.islandMode ? 'ISLAND MODE' : 'GRID CONNECTED') : 'OPERATIONAL', tone: isControl && this.islandMode ? 'warn' : 'ok' }),
      fields: isGate
        ? [
          { label: 'Vehicles on site', get: () => String(this.dockOccupancy()) },
          { label: 'Queue', get: () => `${this.trucksWaiting} waiting` },
          { label: 'Units received', get: () => String(Math.round(this.loadedToday)) },
          { label: 'Units dispatched', get: () => String(Math.round(this.dispatchedToday)) },
          { label: 'Bays free', get: () => `${this.bays.filter(b => !b.occupied).length} / ${SITE.yard.bays}` },
        ]
        : [
          { label: 'Site load', get: () => `${fmt(this.loadServed / 1000, 2)} kW` },
          { label: 'Generation', get: () => `${fmt(this.pvPower / 1000, 2)} kW` },
          { label: 'Battery SOC', get: () => `${fmt(this.batterySoc, 1)} %` },
          { label: 'Scenario', get: () => this.scenarioRun ? `${this.scenarioLabel()} (${Math.round(this.scenarioProgress() * 100)}%)` : 'idle' },
          { label: 'Active alarms', get: () => String(this.getActiveAlarms().length) },
        ],
      sections: [{
        title: isGate ? 'Gate Controls' : 'Supervision Controls', iconName: 'sliders', controls: isGate
          ? [
            { type: 'toggle', label: 'Automatic truck arrivals', value: this.config.arrivalsEnabled !== false, onChange: v => { this.config.arrivalsEnabled = v; this.saveSoon(); this.refreshInspector(); } },
            { type: 'slider', label: 'Arrival interval', min: 12, max: 150, step: 2, value: this.arrivalInterval ?? 42, unit: 's', onChange: v => { this.arrivalInterval = v; this.saveSoon(); } },
            { type: 'button', label: 'Admit truck now', iconName: 'plus', onClick: () => { this.spawnTruck(); this.refreshInspector(); } },
            { type: 'button', label: 'Clear yard', variant: 'warn', iconName: 'trash', onClick: () => { this.clearTrucks(); this.refreshInspector(); } },
          ]
          : [
            { type: 'toggle', label: 'Island mode', value: this.islandMode, onChange: v => { if (v !== this.islandMode) this.toggleIsland(); this.refreshInspector(); } },
            { type: 'button', label: 'Scenario & Supply', iconName: 'link', onClick: () => this.setTab('spawn') },
            { type: 'button', label: 'Simulation Centre', iconName: 'sliders', onClick: () => this.setTab('simulation') },
          ],
      }],
    };
  }

  controlInspector() { return this.buildingInspector({ id: 'control-centre', label: 'Integrated Control Centre', kind: 'control' }); }

  tankInspector() {
    return {
      title: 'Elevated Water Tank T-06',
      subtitle: 'RESERVOIR · 10 000 L',
      iconName: 'tank',
      badge: () => ({ text: `${fmt(this.tankLevelPct, 1)}%`, tone: this.tankLevelPct < 15 ? 'danger' : this.tankLevelPct < 30 ? 'warn' : 'ok' }),
      fields: [
        { label: 'Level', get: () => `${fmt(this.tankLevelPct, 1)} %` },
        { label: 'Stored volume', get: () => `${ui.fmtInt(this.tankLevelPct / 100 * this.tankCapacityL)} L` },
        { label: 'Pump delivery', get: () => `${fmt(this.pumpFlow, 0)} L/min` },
        { label: 'Process draw', get: () => `${fmt(this.waterConsumption, 0)} L/min` },
        { label: 'Cold store make-up', get: () => `${fmt(this.compressorLoad * 22 + (this.doorAngle > .1 ? 9 : 0), 0)} L/min` },
        { label: 'Water used today', get: () => `${ui.fmtInt(this.waterToday)} L` },
      ],
      sections: [{
        title: 'Reservoir Controls', iconName: 'droplet', controls: [
          { type: 'slider', label: 'Manual level set', min: 0, max: 100, step: 1, value: this.tankLevelPct, unit: '%', onChange: v => { this.tankLevelPct = v; this.saveSoon(); this.refreshInspector(); } },
          { type: 'button', label: 'Fill to 90%', iconName: 'arrowUp', onClick: () => { this.tankLevelPct = 90; this.saveSoon(); this.refreshInspector(); } },
          { type: 'button', label: 'Inspect pump set', iconName: 'pump', onClick: () => this.selectObject('pump-skid') },
        ],
      }],
      note: 'Reservoir level couples directly to the cold chain: below 15% condenser make-up is throttled, below 5% cooling capacity is degraded.',
    };
  }

  pumpInspector() {
    return {
      title: 'Booster Pump Set P-06',
      subtitle: 'VARIABLE SPEED · PROCESS MAIN',
      iconName: 'pump',
      badge: () => ({ text: this.faults.pump ? 'FAULT' : (this.pumpOn ? 'RUNNING' : 'STANDBY'), tone: this.faults.pump ? 'danger' : this.pumpOn ? 'ok' : 'muted' }),
      fields: [
        { label: 'State', get: () => this.faults.pump ? 'TRIPPED' : (this.pumpOn ? 'RUNNING' : 'STANDBY') },
        { label: 'Speed', get: () => `${Math.round(this.pumpSpeed)} %` },
        { label: 'Delivery', get: () => `${fmt(this.pumpFlow, 0)} L/min` },
        { label: 'Electrical demand', get: () => `${fmt(this.loads.water.demand / 1000, 1)} kW` },
        { label: 'Power served', get: () => `${fmt(this.loads.water.served / 1000, 1)} kW` },
        { label: 'Discharge pressure', get: () => `${fmt(1.8 + this.pumpFlow / 420 * 3.2, 2)} bar` },
      ],
      sections: [{
        title: 'Pump Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Pump running', value: this.pumpOn, onChange: v => { this.setPump(v); this.refreshInspector(); } },
          { type: 'slider', label: 'Pump speed', min: 10, max: 120, step: 1, value: this.pumpSpeed, unit: '%', onInput: v => { this.pumpSpeed = v; }, onChange: () => { this.config.pumpSpeed = this.pumpSpeed; this.saveSoon(); } },
          { type: 'button', label: 'Clear dry-run trip', variant: 'warn', iconName: 'reset', onClick: () => { this.clearPumpFault(); this.refreshInspector(); } },
        ],
      }],
      note: 'The pump only delivers what the energy model can serve — during shedding its output drops with the feeder allocation.',
    };
  }

  lineInspector() {
    return {
      title: 'Packaging & Sorting Line LN-06',
      subtitle: 'U-SHAPED TRANSPORT LOOP',
      iconName: 'conveyor',
      badge: () => ({ text: this.lineJam ? 'JAMMED' : this.lineRunning ? 'RUNNING' : 'STOPPED', tone: this.lineJam ? 'danger' : this.lineRunning ? 'ok' : 'warn' }),
      fields: [
        { label: 'Belt speed', get: () => `${fmt(this.lineRunning && this.linePowerRatio > .15 ? this.lineSpeed : 0, 1)} m/min` },
        { label: 'Throughput', get: () => `${fmt(this.productionRate, 0)} ctn/h` },
        { label: 'Cartons on line', get: () => String(this.cartonsOnLine.length) },
        { label: 'Produced today', get: () => String(this.producedToday) },
        { label: 'Raw material stock', get: () => `${Math.round(this.rawStock)} units` },
        { label: 'Power served', get: () => `${fmt(this.loads.line.served / 1000, 1)} / ${fmt(this.loads.line.demand / 1000, 1)} kW` },
        { label: 'Transferred to store', get: () => String(this.transferredToday || 0) },
      ],
      sections: [{
        title: 'Line Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Line running', value: this.lineRunning, onChange: v => { this.setLineRunning(v); this.refreshInspector(); } },
          { type: 'slider', label: 'Belt speed', min: 0, max: 24, step: .5, value: this.lineSpeed, unit: 'm/min', onInput: v => { this.lineSpeed = v; }, onChange: () => { this.config.lineSpeed = this.lineSpeed; this.saveSoon(); } },
          { type: 'button', label: 'Clear jam', variant: 'warn', iconName: 'reset', onClick: () => { this.clearLinkedList(); this.refreshInspector(); } },
          { type: 'button', label: 'Inspect drive motor', iconName: 'motor', onClick: () => this.selectObject('line-motor') },
        ],
      }],
      note: 'Throughput depends on three things at once: available electrical power, raw material stock and belt speed.',
    };
  }

  motorInspector() {
    const loadRatio = this.loads.line.demand > 0 ? this.loads.line.served / this.loads.line.demand : 0;
    return {
      title: 'Line Drive Motor M-06',
      subtitle: 'GEARED DRIVE · 7.5 kW',
      iconName: 'motor',
      badge: () => ({ text: this.lineRunning && !this.lineJam ? 'ENERGISED' : 'OFF', tone: this.lineRunning && !this.lineJam ? 'ok' : 'muted' }),
      fields: [
        { label: 'State', get: () => this.lineRunning && !this.lineJam ? 'RUNNING' : 'STOPPED' },
        { label: 'Electrical demand', get: () => `${fmt(this.loads.line.demand / 1000, 2)} kW` },
        { label: 'Served power', get: () => `${fmt(this.loads.line.served / 1000, 2)} kW` },
        { label: 'Current (est.)', get: () => `${fmt(loadRatio * 14.5, 1)} A` },
        { label: 'Winding temperature', get: () => `${fmt(this.ambientTemp + 12 + loadRatio * 26, 1)} °C` },
        { label: 'Jam interlock', get: () => this.lineJam ? 'TRIPPED' : 'READY' },
      ],
      sections: [{
        title: 'Motor Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Start drive', variant: 'subtle', iconName: 'play', onClick: () => { this.setLineRunning(true); this.refreshInspector(); } },
          { type: 'button', label: 'Stop drive', iconName: 'stop', onClick: () => { this.setLineRunning(false); this.refreshInspector(); } },
          { type: 'button', label: 'Inject jam', variant: 'danger', iconName: 'warning', onClick: () => { this.injectLineJam(); this.refreshInspector(); } },
        ],
      }],
    };
  }

  sortStationInspector() {
    return {
      title: 'Sort & Scan Station',
      subtitle: 'BARCODE + DIVERTER',
      iconName: 'sensor',
      badge: () => ({ text: this.lineRunning ? 'SCANNING' : 'IDLE', tone: this.lineRunning ? 'ok' : 'muted' }),
      fields: [
        { label: 'Scans today', get: () => String(this.producedToday) },
        { label: 'Destination mix', get: () => `storage ${this.transferredToday || 0} · dispatch ${this.dispatchedToday}` },
        { label: 'Diverter position', get: () => `${Math.round((this._diverterTarget || 0) * 57.3)}°` },
        { label: 'Reject rate', get: () => this.lineJam ? 'HIGH' : '0.4 %' },
      ],
      sections: [{
        title: 'Station Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Route to storage', iconName: 'inventory', onClick: () => { this._diverterTarget = 0; this.refreshInspector(); } },
          { type: 'button', label: 'Route to dispatch', iconName: 'package', onClick: () => { this._diverterTarget = .55; this.refreshInspector(); } },
        ],
      }],
    };
  }

  binInspector(obj) {
    const isDispatch = obj.id === 'line-bin-0';
    return {
      title: obj.label,
      subtitle: isDispatch ? 'OUTBOUND STAGING' : 'TRANSFER TO COLD STORE',
      iconName: 'inventory',
      badge: { text: 'READY', tone: 'ok' },
      fields: [
        { label: 'Role', value: isDispatch ? 'Dispatch staging' : 'Cold store transfer' },
        { label: 'Units staged', get: () => isDispatch ? String(Math.round(this.dispatchedToday)) : String(Math.round(this.coldInventory)) },
        { label: 'Handling', value: isDispatch ? 'Loaded by forklift to trucks' : 'Palletised to racks' },
      ],
      sections: [{
        title: 'Bin Controls', iconName: 'sliders', controls: [
          { type: 'button', label: isDispatch ? 'Dispatch a load' : 'Transfer to store', iconName: 'plus', onClick: () => { if (isDispatch) this.dispatchStock(60); else this.addRawMaterial(0, 'transfer'); this.refreshInspector(); } },
        ],
      }],
    };
  }

  coldStoreInspector() {
    return {
      title: 'Cold Storage Building CS-06',
      subtitle: 'MULTI-ZONE · DOCK SERVED',
      iconName: 'cold',
      badge: () => ({ text: this.coldBreach() ? 'EXCURSION' : 'IN BAND', tone: this.coldBreach() ? 'danger' : 'ok' }),
      fields: [
        ...this.coldZones.map((z, i) => ({ label: z.label, get: () => `${fmt(z.temp, 1)} °C · setpoint ${fmt(z.setpoint, 1)} °C` })),
        { label: 'Inventory', get: () => `${Math.round(this.coldInventory)} units` },
        { label: 'Quarantined', get: () => `${Math.round(this.coldQuarantine)} units` },
        { label: 'Door', get: () => this.doorAngle > .1 ? `OPEN ${ui.fmtDuration(this.doorOpenElapsed)}` : 'CLOSED' },
        { label: 'Condensing plant', get: () => this.faults.compressor ? 'FAULTED' : `LOAD ${Math.round(this.compressorLoad * 100)} %` },
        { label: 'Cooling power', get: () => `${fmt(this.loads.cold.served / 1000, 1)} kW` },
      ],
      sections: [{
        title: 'Store Controls', iconName: 'cold', controls: [
          ...this.coldZones.map((z, i) => ({
            type: 'slider', label: `${z.label} setpoint`, min: -26, max: 6, step: .5, value: z.setpoint, unit: '°C',
            onInput: v => { z.setpoint = v; }, onChange: () => { this.setColdSetpoint(i, z.setpoint); },
          })),
          { type: 'button', label: 'Open dock door', variant: 'subtle', iconName: 'unlock', onClick: () => { this.doorTarget = 1.6; this.doorHold = 20; this.logEvent('Dock door opened', 'Manual door command — warm-air ingress will follow.', 'warn'); this.refreshInspector(); } },
          { type: 'button', label: 'Close dock door', iconName: 'lock', onClick: () => { this.doorTarget = 0; this.doorHold = 0; this.refreshInspector(); } },
          { type: 'button', label: 'Release quarantine', variant: 'warn', iconName: 'shieldCheck', onClick: () => { this.releaseQuarantine(); this.refreshInspector(); } },
        ],
      }],
      note: 'Cooling depends on the cold feeder allocation and on water availability; a breached band quarantines stock automatically.',
    };
  }

  doorInspector() {
    return {
      title: 'Cold Store Dock Door D-06',
      subtitle: 'INSULATED SHUTTER',
      iconName: 'door',
      badge: () => ({ text: this.doorAngle > .1 ? 'OPEN' : 'CLOSED', tone: this.doorAngle > .1 ? 'warn' : 'ok' }),
      fields: [
        { label: 'Position', get: () => `${Math.round(this.doorAngle / 1.6 * 100)} %` },
        { label: 'Open duration', get: () => ui.fmtDuration(this.doorOpenElapsed) },
        { label: 'Cycles held by dock', get: () => String(this.trucks.filter(t => t.state === 'docked').length) },
        { label: 'Warm-air ingress', get: () => this.doorAngle > .1 ? 'ACTIVE' : 'NONE' },
      ],
      sections: [{
        title: 'Door Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Open door', variant: 'subtle', iconName: 'unlock', onClick: () => { this.doorTarget = 1.6; this.doorHold = 25; this.refreshInspector(); } },
          { type: 'button', label: 'Close door', iconName: 'lock', onClick: () => { this.doorTarget = 0; this.doorHold = 0; this.refreshInspector(); } },
        ],
      }],
      note: 'Opening the door is the fastest way to warm the store — watch the heat map and the temperature sensors respond.',
    };
  }

  compressorInspector() {
    return {
      title: 'Condensing Plant CP-06',
      subtitle: 'AIR-COOLED · R-449A',
      iconName: 'compressor',
      badge: () => ({ text: this.faults.compressor ? 'FAULT' : 'RUNNING', tone: this.faults.compressor ? 'danger' : 'ok' }),
      fields: [
        { label: 'Load', get: () => `${Math.round(this.compressorLoad * 100)} %` },
        { label: 'Electrical demand', get: () => `${fmt(this.loads.cold.demand / 1000, 1)} kW` },
        { label: 'Power served', get: () => `${fmt(this.loads.cold.served / 1000, 1)} kW` },
        { label: 'Water make-up', get: () => `${fmt(this.compressorLoad * 22, 0)} L/min` },
        { label: 'Refrigerant circuits', get: () => this.faults.compressor ? 'ISOLATED' : 'CIRCULATING' },
      ],
      sections: [{
        title: 'Plant Controls', iconName: 'sliders', controls: [
          { type: 'toggle', label: 'Plant healthy', description: 'Clearing the fault restores refrigeration.', value: !this.faults.compressor, onChange: v => { this.faults.compressor = !v; if (v) this.clearCompressorFault(); else this.logEvent('Refrigeration fault', 'Condensing plant faulted — cold store warming.', 'danger'); this.refreshInspector(); } },
          { type: 'slider', label: 'Duty demand', min: .2, max: 1, step: .02, value: this.compressorLoad, unit: 'ratio', onChange: v => { this.compressorLoad = v; this.saveSoon(); } },
          { type: 'button', label: 'Inspect cold store', iconName: 'cold', onClick: () => this.selectObject('cold-store') },
        ],
      }],
    };
  }

  barrierInspector(obj) {
    const id = obj.id.replace('barrier-', '');
    const b = this.barriers[id];
    return {
      title: obj.label,
      subtitle: 'ACCESS CONTROL',
      iconName: 'gate',
      badge: () => ({ text: b && b.angle > 1.2 ? 'OPEN' : 'CLOSED', tone: b && b.angle > 1.2 ? 'warn' : 'ok' }),
      fields: [
        { label: 'State', get: () => b && b.angle > 1.2 ? 'OPEN' : b && b.angle > .05 ? 'MOVING' : 'CLOSED' },
        { label: 'Arm angle', get: () => `${Math.round((b?.angle || 0) * 57.3)}°` },
        { label: 'Vehicles on site', get: () => String(this.dockOccupancy()) },
        { label: 'Queue', get: () => `${this.trucksWaiting} waiting` },
      ],
      sections: [{
        title: 'Barrier Controls', iconName: 'sliders', controls: [
          { type: 'button', label: 'Open barrier', variant: 'subtle', iconName: 'unlock', onClick: () => { if (b) { b.target = 1.45; b.manual = true; } this.refreshInspector(); } },
          { type: 'button', label: 'Close barrier', iconName: 'lock', onClick: () => { if (b) { b.target = 0; b.manual = true; } this.refreshInspector(); } },
          { type: 'button', label: 'Release to automatic', iconName: 'reset', onClick: () => { if (b) b.manual = false; this.refreshInspector(); } },
        ],
      }],
      note: 'Barriers follow vehicle movement automatically unless a manual position is held.',
    };
  }

  truckInspector(obj) {
    const truck = this.trucks.find(t => t.id === obj.id);
    if (!truck) return this.defaultInspector(obj);
    const stateLabel = truck.state === 'arriving' ? 'ARRIVING' : truck.state === 'docked' ? 'AT DOCK' : 'DEPARTING';
    return {
      title: `Truck ${truck.plate}`,
      subtitle: `${truck.cargo.role === 'inbound' ? 'INBOUND SUPPLY' : 'OUTBOUND DISPATCH'} · ${truck.cargo.label}`,
      iconName: 'vehicle',
      badge: () => ({ text: stateLabel, tone: truck.state === 'docked' ? 'ok' : 'info' }),
      fields: [
        { label: 'Vehicle', value: truck.plate },
        { label: 'Cargo role', value: truck.cargo.role === 'inbound' ? 'Raw material delivery' : 'Finished goods collection' },
        { label: 'Cargo', value: `${truck.cargo.label} · ${Math.round(truck.cargo.units)} units` },
        { label: 'Assigned bay', value: truck.bay || 'waiting' },
        { label: 'State', get: () => stateLabel },
        { label: 'Service remaining', get: () => truck.state === 'docked' ? ui.fmtDuration(Math.max(0, truck.timer)) : '—' },
      ],
      sections: [{
        title: 'Truck Controls', iconName: 'sliders', controls: [
          { type: 'number', label: 'Service time', unit: 's', min: 5, max: 300, step: 5, value: Math.round(truck.serviceTime), onChange: v => { truck.serviceTime = v; if (truck.state === 'docked') truck.timer = Math.min(truck.timer, v); this.saveSoon(); } },
          { type: 'button', label: 'Service immediately', variant: 'subtle', iconName: 'check', onClick: () => { if (truck.state === 'docked') truck.timer = 0; this.refreshInspector(); } },
          { type: 'button', label: 'Remove vehicle', variant: 'danger', iconName: 'trash', onClick: () => { this.removeTruck(truck); this.closeInspector(); } },
        ],
      }],
      note: 'Inbound trucks replenish raw material stock; outbound trucks draw finished goods from the cold store.',
    };
  }

  /* =========================================================
     Operations panel
     ========================================================= */
  buildOperations(container) {
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ui.icon('link', 13).outerHTML}<span>Master controls act on all five subsystems at once. Energy, water, cold chain, production and logistics are coupled — watch the coupling board react.</span>`;
    container.appendChild(note);

    /* scenario runner */
    const scSec = el('div', { class: 'section' });
    const scTitle = el('div', { class: 'section-title' });
    scTitle.innerHTML = `${ui.icon('play', 12).outerHTML} Use-Case Scenario Runner`;
    const scState = el('span', { class: 'side' });
    scTitle.appendChild(scState);
    scSec.appendChild(scTitle);
    const scCard = el('div', { class: 'section-card' });
    const presetRow = el('div', { class: 'btn-row' });
    for (const s of SCENARIOS) {
      const b = ui.button(s.label.split(' · ')[0], { size: 'small', variant: this.scenarioId === s.id ? 'subtle' : undefined, iconName: 'play', onClick: () => { this.loadScenario(s.id); this.renderPanel(); } });
      b.title = s.detail;
      presetRow.appendChild(b);
    }
    scCard.appendChild(presetRow);
    const prog = ui.progressBar(0);
    const progWrap = el('div', { style: { marginTop: '9px' } }, prog);
    scCard.appendChild(progWrap);
    const scRow = el('div', { class: 'btn-row', style: { marginTop: '8px' } });
    scRow.append(
      ui.button('Stop Scenario', { size: 'small', variant: 'ghost', iconName: 'stop', onClick: () => { this.stopScenario(); this.renderPanel(); } }),
      ui.button('Restart Timeline', { size: 'small', iconName: 'restart', onClick: () => { this.loadScenario(this.scenarioId); this.renderPanel(); } }),
    );
    scCard.appendChild(scRow);
    scSec.appendChild(scCard);
    this.addPanelBind(() => {
      const s = this.scenarioById(this.scenarioId);
      scState.textContent = `${s.label} · ${Math.round(this.scenarioProgress() * 100)}%`;
      prog._set(this.scenarioProgress() * 100);
      prog.className = `progress ${this.scenarioRun ? '' : 'warn'}`;
    });
    scSec.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Loading a scenario sets the time of day, weather, tariff, truck arrival rate and production target, then runs the timeline.' }));
    container.appendChild(scSec);

    /* master energy controls */
    const enSec = el('div', { class: 'section' });
    const enTitle = el('div', { class: 'section-title' });
    enTitle.innerHTML = `${ui.icon('bolt', 12).outerHTML} Energy & Demand Master`;
    enSec.appendChild(enTitle);
    const enCard = el('div', { class: 'section-card' });
    enCard.appendChild(ui.toggle({ label: 'Island mode', description: 'Disconnect the utility; battery and PV carry the site.', value: this.islandMode, onChange: v => { if (v !== this.islandMode) this.toggleIsland(); this.renderPanel(); } }));
    enCard.appendChild(ui.toggle({ label: 'Priority load shedding', description: 'Shed lower-priority loads to protect the cold chain.', value: this.loadShedEnabled, onChange: v => { this.setLoadShed(v); this.renderPanel(); } }));
    enCard.appendChild(ui.toggle({ label: 'Photovoltaic array connected', value: !this.arrayDisabled, onChange: v => { this.arrayDisabled = !v; this.saveSoon(); this.renderPanel(); } }));
    enCard.appendChild(ui.slider({ label: 'Cloud cover', min: 0, max: .9, step: .01, value: this.cloudCover, unit: '', onChange: v => { this.cloudCover = v; this.saveSoon(); } }));
    enCard.appendChild(ui.toggle({ label: 'Site lighting', value: this.lightingOn, onChange: v => { this.setLightingState(v); this.config.lightingOn = v; this.saveSoon(); } }));
    enSec.appendChild(enCard);
    container.appendChild(enSec);

    /* process controls */
    const prSec = el('div', { class: 'section' });
    const prTitle = el('div', { class: 'section-title' });
    prTitle.innerHTML = `${ui.icon('conveyor', 12).outerHTML} Process Master`;
    prSec.appendChild(prTitle);
    const prCard = el('div', { class: 'section-card' });
    prCard.appendChild(ui.toggle({ label: 'Packaging line running', value: this.lineRunning, onChange: v => { this.setLineRunning(v); this.renderPanel(); } }));
    prCard.appendChild(ui.slider({ label: 'Belt speed', min: 0, max: 24, step: .5, value: this.lineSpeed, unit: 'm/min', onInput: v => { this.lineSpeed = v; }, onChange: () => { this.config.lineSpeed = this.lineSpeed; this.saveSoon(); } }));
    prCard.appendChild(ui.toggle({ label: 'Pump running', value: this.pumpOn, onChange: v => { this.setPump(v); this.renderPanel(); } }));
    prCard.appendChild(ui.slider({ label: 'Pump speed', min: 10, max: 120, step: 1, value: this.pumpSpeed, unit: '%', onInput: v => { this.pumpSpeed = v; }, onChange: () => { this.config.pumpSpeed = this.pumpSpeed; this.saveSoon(); } }));
    for (let i = 0; i < this.coldZones.length; i++) {
      const z = this.coldZones[i];
      prCard.appendChild(ui.slider({
        label: `${z.label} setpoint`, min: -26, max: 6, step: .5, value: z.setpoint, unit: '°C',
        onInput: v => { z.setpoint = v; },
        onChange: v => { this.setColdSetpoint(i, v); },
      }));
    }
    prCard.appendChild(el('div', { class: 'btn-row', style: { marginTop: '4px' } },
      ui.button('Open dock door', { size: 'small', variant: 'subtle', iconName: 'unlock', onClick: () => { this.doorTarget = 1.6; this.doorHold = 25; } }),
      ui.button('Close dock door', { size: 'small', iconName: 'lock', onClick: () => { this.doorTarget = 0; this.doorHold = 0; } }),
    ));
    prSec.appendChild(prCard);
    container.appendChild(prSec);

    /* logistics master */
    const lgSec = el('div', { class: 'section' });
    const lgTitle = el('div', { class: 'section-title' });
    lgTitle.innerHTML = `${ui.icon('vehicle', 12).outerHTML} Logistics Master`;
    lgSec.appendChild(lgTitle);
    const lgCard = el('div', { class: 'section-card' });
    lgCard.appendChild(ui.toggle({ label: 'Automatic truck arrivals', value: this.config.arrivalsEnabled !== false, onChange: v => { this.config.arrivalsEnabled = v; this.saveSoon(); this.renderPanel(); } }));
    lgCard.appendChild(ui.slider({ label: 'Arrival interval', min: 12, max: 150, step: 2, value: this.arrivalInterval ?? 42, unit: 's', onInput: v => { this.arrivalInterval = v; }, onChange: () => this.saveSoon() }));
    lgCard.appendChild(el('div', { class: 'btn-row' },
      ui.button('Inbound truck', { size: 'small', iconName: 'plus', onClick: () => { this.spawnTruck({ role: 'inbound' }); this.renderPanel(); } }),
      ui.button('Outbound truck', { size: 'small', iconName: 'exit', onClick: () => { this.spawnTruck({ role: 'outbound' }); this.renderPanel(); } }),
      ui.button('Clear yard', { size: 'small', variant: 'danger', iconName: 'trash', onClick: () => { this.clearTrucks(); this.renderPanel(); } }),
    ));
    const queue = el('div', { class: 'help', style: { marginTop: '6px' } });
    this.addPanelBind(() => { queue.textContent = `${this.dockOccupancy()} vehicles on site · ${this.trucksWaiting} queued · ${this.bays.filter(b => !b.occupied).length} bays free`; });
    lgCard.appendChild(queue);
    lgSec.appendChild(lgCard);
    container.appendChild(lgSec);

    /* diagnostics */
    const dgSec = el('div', { class: 'section' });
    const dgTitle = el('div', { class: 'section-title' });
    dgTitle.innerHTML = `${ui.icon('warning', 12).outerHTML} Diagnostics & Cross-System Tests`;
    dgSec.appendChild(dgTitle);
    const dgCard = el('div', { class: 'section-card' });
    dgCard.appendChild(el('div', { class: 'btn-row' },
      ui.button('Simulate grid loss', { size: 'small', variant: 'warn', iconName: 'bolt', onClick: () => { if (!this.islandMode) this.toggleIsland(); this.renderPanel(); } }),
      ui.button('Force refrigeration fault', { size: 'small', variant: 'danger', iconName: 'alert', onClick: () => { this.faults.compressor = true; this.logEvent('Refrigeration fault injected', 'Cold chain excursion test started.', 'danger'); this.refreshLive(); this.renderPanel(); } }),
      ui.button('Drain reservoir', { size: 'small', variant: 'warn', iconName: 'droplet', onClick: () => { this.tankLevelPct = 8; this.logEvent('Reservoir drained', 'Cooling make-up throttled for test.', 'warn'); this.refreshLive(); this.renderPanel(); } }),
    ));
    dgCard.appendChild(el('div', { class: 'btn-row', style: { marginTop: '6px' } },
      ui.button('Inject line jam', { size: 'small', variant: 'danger', iconName: 'warning', onClick: () => { this.injectLineJam(); this.renderPanel(); } }),
      ui.button('Starve the line', { size: 'small', variant: 'warn', iconName: 'inventory', onClick: () => { this.rawStock = 0; this.logEvent('Raw material exhausted', 'Line will starve within the configured delay.', 'warn'); this.refreshLive(); this.renderPanel(); } }),
      ui.button('Sensor fault', { size: 'small', onChange: null, iconName: 'sensor', onClick: () => { this.faults.sensor = !this.faults.sensor; for (const s of this.sensorDefs) this.setSensorEnabled(s.id, !this.faults.sensor); this.evaluateAlarms(); this.renderPanel(); } }),
    ));
    dgCard.appendChild(el('div', { class: 'btn-row', style: { marginTop: '6px' } },
      ui.button('Clear all faults', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => {
        this.faults.compressor = false; this.faults.pump = false; this.faults.lineMotor = false; this.faults.sensor = false;
        this.lineJam = false; this.dryTimer = 0;
        for (const s of this.sensorDefs) this.setSensorEnabled(s.id, true);
        this.logEvent('Faults cleared', 'All injected faults removed.', 'ok');
        this.evaluateAlarms(); this.refreshLive(); this.renderPanel();
      } }),
    ));
    dgSec.appendChild(dgCard);
    container.appendChild(dgSec);

    /* counters */
    const ctSec = el('div', { class: 'section' });
    const ctTitle = el('div', { class: 'section-title' });
    ctTitle.innerHTML = `${ui.icon('chart', 12).outerHTML} Production & Logistics Counters`;
    ctSec.appendChild(ctTitle);
    const ctCard = el('div', { class: 'kv-list' });
    ctCard.append(
      ui.kvRow('Cartons produced', '0', { bind: () => String(this.producedToday) }),
      ui.kvRow('Transferred to cold store', '0', { bind: () => String(this.transferredToday || 0) }),
      ui.kvRow('Units received', '0', { bind: () => String(Math.round(this.loadedToday)) }),
      ui.kvRow('Units dispatched', '0', { bind: () => String(Math.round(this.dispatchedToday)) }),
      ui.kvRow('Energy generated today', '0', { bind: () => `${fmt(this.energyToday, 1)} kWh` }),
      ui.kvRow('Water pumped', '0', { bind: () => `${ui.fmtInt(this.waterToday)} L` }),
    );
    ctSec.appendChild(el('div', { class: 'section-card' }, ctCard));
    ctSec.appendChild(el('div', { class: 'btn-row', style: { marginTop: '7px' } },
      ui.button('Reset counters', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => {
        this.producedToday = 0; this.transferredToday = 0; this.loadedToday = 0; this.dispatchedToday = 0; this.energyToday = 0; this.waterToday = 0;
        this.refreshLive(); this.renderPanel();
      } }),
    ));
    container.appendChild(ctSec);
  }

  /* =========================================================
     Scenario & supply panel
     ========================================================= */
  buildSpawning(container) {
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ui.icon('link', 13).outerHTML}<span>Scenario presets drive real inputs across every subsystem. Supply controls feed the line and the cold store; dispatch draws finished goods back out.</span>`;
    container.appendChild(note);

    const metricWrap = el('div', { class: 'metric-grid three', style: { marginBottom: '12px' } });
    metricWrap.append(
      ui.metric({ label: 'Raw Stock', bind: () => ({ value: Math.round(this.rawStock).toString(), tone: this.rawStock <= 0 ? 'danger' : this.rawStock < 100 ? 'warn' : 'ok' }), iconName: 'inventory', compact: true }),
      ui.metric({ label: 'Cold Inventory', bind: () => ({ value: Math.round(this.coldInventory).toString(), tone: this.coldBreach() ? 'warn' : 'ok' }), iconName: 'cold', compact: true }),
      ui.metric({ label: 'Quarantine', bind: () => ({ value: Math.round(this.coldQuarantine).toString(), tone: this.coldQuarantine > 0 ? 'danger' : 'ok' }), iconName: 'alert', compact: true }),
    );
    container.appendChild(metricWrap);

    /* scenario presets */
    const scSec = el('div', { class: 'section' });
    const scTitle = el('div', { class: 'section-title' });
    scTitle.innerHTML = `${ui.icon('play', 12).outerHTML} Scenario Presets`;
    scSec.appendChild(scTitle);
    for (const s of SCENARIOS) {
      const card = el('div', { class: 'section-card', style: { marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '9px' } });
      const tt = el('div', { style: { flex: 1, minWidth: 0 } },
        el('div', { style: { fontSize: '10.5px', fontWeight: '650' }, text: s.label }),
        el('div', { class: 'help', text: s.detail }));
      card.append(tt, ui.button(this.scenarioId === s.id && this.scenarioRun ? 'Running' : 'Load', { size: 'small', variant: this.scenarioId === s.id ? 'subtle' : undefined, iconName: 'play', onClick: () => { this.loadScenario(s.id); this.renderPanel(); } }));
      scSec.appendChild(card);
    }
    container.appendChild(scSec);

    /* raw material supply */
    const rmSec = el('div', { class: 'section' });
    const rmTitle = el('div', { class: 'section-title' });
    rmTitle.innerHTML = `${ui.icon('inventory', 12).outerHTML} Raw Material Supply`;
    rmSec.appendChild(rmTitle);
    const rmCard = el('div', { class: 'section-card' });
    const draft = { qty: 140, material: RAW_MATERIALS[0].label };
    rmCard.appendChild(ui.selectField({ label: 'Material', options: RAW_MATERIALS.map(m => ({ value: m.label, label: `${m.label} · ${m.unitCost} u` })), value: draft.material, onChange: v => { draft.material = v; } }));
    rmCard.appendChild(ui.numberField({ label: 'Quantity', unit: 'units', min: 10, max: 1200, step: 10, value: draft.qty, onChange: v => { draft.qty = v; } }));
    rmCard.appendChild(ui.button('Receive delivery', { variant: 'primary', block: true, iconName: 'plus', onClick: () => { this.addRawMaterial(draft.qty, draft.material); this.renderPanel(); } }));
    rmCard.appendChild(ui.button('Auto-replenish below safety stock', {
      size: 'small', variant: 'ghost', block: true, iconName: 'refresh',
      onClick: () => { this.config.autoReplenish = !this.config.autoReplenish; this.saveSoon(); this.renderPanel(); },
    }));
    const autoState = el('div', { class: 'help', style: { marginTop: '6px' } });
    this.addPanelBind(() => { autoState.textContent = this.config.autoReplenish ? `Auto-replenish ON — deliveries top the stock up to ${this.config.rawStockTarget || 400} units.` : 'Auto-replenish OFF — deliveries are manual.'; });
    rmCard.appendChild(autoState);
    rmSec.appendChild(rmCard);
    container.appendChild(rmSec);

    /* dispatch + batches */
    const dpSec = el('div', { class: 'section' });
    const dpTitle = el('div', { class: 'section-title' });
    dpTitle.innerHTML = `${ui.icon('package', 12).outerHTML} Dispatch & Batch Register`;
    dpTitle.appendChild(el('span', { class: 'side', text: 'FIFO' }));
    dpSec.appendChild(dpTitle);
    const dpCard = el('div', { class: 'section-card', style: { padding: '4px 10px', maxHeight: '230px', overflowY: 'auto' } });
    let lastBatches = -1;
    const renderRegister = () => {
      ui.clear(dpCard);
      if (!this.coldBatches.length) { dpCard.appendChild(el('div', { class: 'empty', style: { padding: '12px' }, text: 'No batches registered in the cold store.' })); return; }
      for (const b of this.coldBatches) {
        const row = el('div', { class: 'alarm-item' });
        const sev = el('span', { class: `sev ${this.coldBreach() ? 'critical' : 'info'}` });
        const tt = el('div', { class: 'tt' },
          el('b', { text: `${b.id} · ${b.units} units` }),
          el('span', { text: `transferred ${ui.fmtTime(b.at)} · zones ${this.coldZones.map(z => fmt(z.temp, 1)).join('/')} °C` }));
        const del = ui.button('', { size: 'small', variant: 'ghost', iconName: 'trash', iconOnly: true, title: 'Strike off batch' });
        del.addEventListener('click', () => {
          const out = Math.min(this.coldInventory, b.units);
          this.coldInventory -= out;
          this.coldBatches = this.coldBatches.filter(x => x !== b);
          ui.toast(`${b.id} struck off (${Math.round(out)} units).`, { type: 'info' });
          this.renderPanel();
        });
        row.append(sev, tt, del);
        dpCard.appendChild(row);
      }
    };
    renderRegister();
    this.addPanelBind(() => {
      if (lastBatches === this.coldBatches.length && !this.coldBreach()) return;
      lastBatches = this.coldBatches.length;
      renderRegister();
    });
    dpSec.appendChild(dpCard);
    dpSec.appendChild(el('div', { class: 'btn-row', style: { marginTop: '8px' } },
      ui.button('Dispatch 60 units', { size: 'small', variant: 'subtle', iconName: 'exit', onClick: () => { this.dispatchStock(60); this.renderPanel(); } }),
      ui.button('Release quarantine', { size: 'small', variant: 'warn', iconName: 'shieldCheck', onClick: () => { this.releaseQuarantine(); this.renderPanel(); } }),
    ));
    container.appendChild(dpSec);

    /* bay allocation */
    const baySec = el('div', { class: 'section' });
    const bayTitle = el('div', { class: 'section-title' });
    bayTitle.innerHTML = `${ui.icon('vehicle', 12).outerHTML} Yard & Dock Allocation`;
    const baySide = el('span', { class: 'side' });
    bayTitle.appendChild(baySide);
    baySec.appendChild(bayTitle);
    const bayCard = el('div', { class: 'section-card', style: { padding: '4px 10px' } });
    baySec.appendChild(bayCard);
    const renderBays = () => {
      ui.clear(bayCard);
      for (const bay of this.bays) {
        const truck = this.trucks.find(t => t.id === bay.truckId);
        const row = el('div', { class: 'kv-row' });
        row.append(
          el('span', { class: 'k' }, ui.statusDot(bay.occupied ? 'live' : ''), `Bay ${bay.id}`),
          el('span', { class: 'v text', text: truck ? `${truck.plate} · ${truck.state === 'docked' ? 'docked' : 'arriving'}` : 'free' }),
        );
        bayCard.appendChild(row);
      }
    };
    renderBays();
    let lastTruckSig = '';
    this.addPanelBind(() => {
      const sig = this.trucks.map(t => `${t.id}${t.state}${t.bay || ''}`).join('|');
      if (sig === lastTruckSig) return;
      lastTruckSig = sig;
      renderBays();
      baySide.textContent = `${this.bays.filter(b => !b.occupied).length}/${SITE.yard.bays} FREE`;
    });
    baySec.appendChild(el('div', { class: 'btn-row', style: { marginTop: '7px' } },
      ui.button('Schedule inbound', { size: 'small', iconName: 'plus', onClick: () => { this.spawnTruck({ role: 'inbound' }); this.renderPanel(); } }),
      ui.button('Schedule outbound', { size: 'small', iconName: 'exit', onClick: () => { this.spawnTruck({ role: 'outbound' }); this.renderPanel(); } }),
    ));
    container.appendChild(baySec);
  }

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
          objective: 'Confirm entrance/exit barriers closed, all bays showing free, occupancy at 0%',
          checkComplete: (infra) => infra.dockOccupancy() === 0,
          autoAdvanceDelay: 5000,
          camera: { position: [0, 15, -10], target: [0, 0, 5] },
          narration: 'Welcome to the Smart Parking Lot. We start with an empty facility, all barriers secured.',
        },
        {
          id: 'activate-entrance',
          title: 'Activate Entrance Barrier',
          description: 'Power on and test the entrance barrier system',
          objective: 'Open entrance barrier, verify sensor detection, then close',
          onEnter: (infra) => { infra.barriers.in.target = 1.45; },
          checkComplete: (infra) => infra.barriers.in.angle > 1.2,
          autoAdvanceDelay: 3000,
          camera: { position: [12, 8, -2], target: [12, 0, -1] },
          narration: 'Activating the entrance barrier. Watch the arm rise and the LED turn green.',
        },
        {
          id: 'vehicle-arrival',
          title: 'Vehicle Arrival Detection',
          description: 'Simulate an inbound vehicle approaching the entrance',
          objective: 'Observe vehicle detection and automatic barrier operation',
          onEnter: (infra) => { infra.spawnTruck({ role: 'inbound', serviceTime: 20 }); },
          checkComplete: (infra) => infra.trucks.some(t => t.state === 'docked'),
          autoAdvanceDelay: 15000,
          camera: { position: [12, 8, -2], target: [12, 0, -1] },
          narration: 'An inbound vehicle approaches. The system detects it and opens the barrier automatically.',
        },
        {
          id: 'assign-bay',
          title: 'Bay Assignment',
          description: 'System assigns an available parking bay to the vehicle',
          objective: 'Watch the vehicle navigate to its assigned bay and park',
          checkComplete: (infra) => infra.trucks.some(t => t.state === 'docked' && t.bay),
          autoAdvanceDelay: 10000,
          camera: { position: [4, 12, 12], target: [4, 0, 12] },
          narration: 'The vehicle is assigned Bay D-01 and navigates to its parking spot.',
        },
        {
          id: 'occupancy-update',
          title: 'Occupancy Update',
          description: 'Verify occupancy sensors detect the parked vehicle',
          objective: 'Confirm bay shows occupied, availability decreases, timer starts',
          checkComplete: (infra) => infra.bays.some(b => b.occupied),
          autoAdvanceDelay: 3000,
          narration: 'Occupancy sensors confirm the vehicle. Bay D-01 now shows occupied. Parking timer started.',
        },
        {
          id: 'second-vehicle',
          title: 'Second Vehicle Arrival',
          description: 'Process another inbound vehicle to demonstrate multi-vehicle handling',
          objective: 'Observe second vehicle assigned to next available bay',
          onEnter: (infra) => { infra.spawnTruck({ role: 'inbound', serviceTime: 25 }); },
          checkComplete: (infra) => infra.bays.filter(b => b.occupied).length >= 2,
          autoAdvanceDelay: 15000,
          narration: 'A second vehicle arrives. The system efficiently assigns Bay D-02.',
        },
        {
          id: 'overstay-simulation',
          title: 'Overstay Warning',
          description: 'Simulate a vehicle exceeding maximum parking duration',
          objective: 'Trigger overstay alarm and observe warning generation',
          onEnter: (infra) => {
            const truck = infra.trucks.find(t => t.state === 'docked');
            if (truck) truck.timer = -1; // Force overstay
          },
          checkComplete: (infra) => infra.getActiveAlarms().some(a => a.id === 'dock-congestion' || a.title.includes('overstay')),
          autoAdvanceDelay: 8000,
          narration: 'Vehicle in Bay D-01 has overstayed. The system generates an overstay warning alarm.',
        },
        {
          id: 'acknowledge-alarm',
          title: 'Acknowledge Overstay Alarm',
          description: 'Operator acknowledges the overstay warning',
          objective: 'Acknowledge the alarm from the alarm panel',
          checkComplete: (infra) => !infra.getActiveAlarms().some(a => a.title.includes('overstay')),
          allowSkip: true,
          narration: 'Acknowledge the overstay alarm to continue normal operations.',
        },
        {
          id: 'vehicle-departure',
          title: 'Vehicle Departure',
          description: 'Process vehicle exit through the exit barrier',
          objective: 'Watch vehicle leave bay, navigate to exit, and barrier operation',
          onEnter: (infra) => {
            const truck = infra.trucks.find(t => t.state === 'docked');
            if (truck) truck.timer = 0;
          },
          checkComplete: (infra) => infra.trucks.filter(t => t.state === 'docked').length === 0,
          autoAdvanceDelay: 15000,
          camera: { position: [12, 8, 12], target: [12, 0, 12] },
          narration: 'The vehicle completes its stay and departs. Exit barrier opens automatically.',
        },
        {
          id: 'final-report',
          title: 'Parking Activity Report',
          description: 'Generate final parking operations summary',
          objective: 'Review the parking activity report with vehicle counts and durations',
          checkComplete: () => true,
          autoAdvanceDelay: 5000,
          narration: 'Parking cycle complete. Two vehicles processed successfully. Report generated.',
        },
      ],
    });

    /* ---- Smart Water Tank Scenario ---- */
    this.registerScenario({
      id: 'water-tank-management',
      name: 'Water Tank Fill & Distribution Cycle',
      description: 'Complete water management from tank fill to distribution and low-level response',
      infrastructure: this.id,
      steps: [
        {
          id: 'init-water',
          title: 'Initialize Water Tank',
          description: 'Check initial tank level and system status',
          objective: 'Verify tank at 74%, pump in auto mode, valves operational',
          checkComplete: (infra) => infra.tankLevelPct > 70,
          autoAdvanceDelay: 4000,
          camera: { position: [-16, 10, -20], target: [-16, 5, -20] },
          narration: 'Starting water tank operations. Current level is 74% - within normal operating range.',
        },
        {
          id: 'check-valves',
          title: 'Verify Valve Positions',
          description: 'Confirm inlet and outlet valves are in correct positions',
          objective: 'Inlet valve open, outlet valve closed for fill operation',
          checkComplete: (infra) => true,
          autoAdvanceDelay: 3000,
          camera: { position: [-11, 5, -19], target: [-11, 1, -19] },
          narration: 'Checking valve positions. Inlet valve should be open for filling, outlet closed.',
        },
        {
          id: 'activate-pump',
          title: 'Activate Inlet Pump',
          description: 'Start the booster pump to fill the tank',
          objective: 'Turn on pump, verify 70% speed, observe flow rate increasing',
          onEnter: (infra) => { infra.setPump(true, 80); },
          checkComplete: (infra) => infra.pumpOn && infra.pumpFlow > 100,
          autoAdvanceDelay: 5000,
          camera: { position: [-11, 5, -19], target: [-11, 1, -19] },
          narration: 'Activating the booster pump at 80% speed. Water begins flowing into the tank.',
        },
        {
          id: 'monitor-fill',
          title: 'Monitor Tank Fill',
          description: 'Observe water level rising and sensor updates',
          objective: 'Watch tank level increase, flow rate stabilize, level sensor respond',
          checkComplete: (infra) => infra.tankLevelPct > 85,
          autoAdvanceDelay: 15000,
          camera: { position: [-16, 10, -20], target: [-16, 5, -20] },
          narration: 'Tank is filling. Level rising steadily. Pump flow stabilized at 350 L/min.',
        },
        {
          id: 'target-reached',
          title: 'Target Level Reached',
          description: 'Tank reaches configured high level, pump auto-stops',
          objective: 'Observe automatic pump shutdown at 90% level',
          checkComplete: (infra) => !infra.pumpOn || infra.tankLevelPct > 90,
          autoAdvanceDelay: 5000,
          narration: 'Tank reached 90% - target level. Pump automatically stops. Inlet valve closes.',
        },
        {
          id: 'outlet-valve',
          title: 'Open Outlet Valve',
          description: 'Begin water distribution to cold store and process line',
          objective: 'Open outlet valve, observe flow to consumers',
          onEnter: (infra) => { infra.valveOutWheel.rotation.y = 0; },
          checkComplete: (infra) => infra.waterConsumption > 50,
          autoAdvanceDelay: 5000,
          camera: { position: [-11, 5, -19], target: [-11, 1, -19] },
          narration: 'Opening outlet valve. Water now flows to cold store condenser and process line.',
        },
        {
          id: 'level-decrease',
          title: 'Monitor Level Decrease',
          description: 'Observe tank level dropping as water is consumed',
          objective: 'Watch level sensor, flow meter, and consumption rate',
          checkComplete: (infra) => infra.tankLevelPct < 60,
          autoAdvanceDelay: 15000,
          camera: { position: [-16, 10, -20], target: [-16, 5, -20] },
          narration: 'Water being consumed by cold store and production. Level dropping at 45 L/min.',
        },
        {
          id: 'low-level-warning',
          title: 'Low Level Warning',
          description: 'Tank reaches low-level threshold, alarm triggers',
          objective: 'Respond to low-level alarm, prepare for pump restart',
          checkComplete: (infra) => infra.getActiveAlarms().some(a => a.id === 'water-low'),
          autoAdvanceDelay: 8000,
          narration: 'WARNING: Reservoir level at 25%. Low level alarm activated. Pump restart needed.',
        },
        {
          id: 'restore-operation',
          title: 'Restore Normal Operation',
          description: 'Restart pump and return to normal operating band',
          objective: 'Activate pump, verify fill resumes, clear alarm',
          onEnter: (infra) => { infra.setPump(true, 85); },
          checkComplete: (infra) => infra.tankLevelPct > 55 && !infra.getActiveAlarms().some(a => a.id === 'water-low'),
          autoAdvanceDelay: 15000,
          narration: 'Pump restarted at 85%. Tank refilling. Low-level alarm will clear automatically.',
        },
        {
          id: 'water-report',
          title: 'Water Operations Summary',
          description: 'Generate water management operational report',
          objective: 'Review fill/drain cycles, pump runtime, and total volume',
          checkComplete: () => true,
          autoAdvanceDelay: 4000,
          narration: 'Water cycle complete. Tank restored to normal operating range. Report generated.',
        },
      ],
    });

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
          objective: 'Confirm line stopped, raw stock at 520, no jams',
          checkComplete: (infra) => !infra.lineRunning && infra.rawStock > 500,
          autoAdvanceDelay: 4000,
          camera: { position: [0, 8, -4], target: [0, 1, -4] },
          narration: 'Starting conveyor sorting line. System idle, 520 units of raw material available.',
        },
        {
          id: 'start-motor',
          title: 'Start Drive Motor',
          description: 'Energize the line drive motor and verify rotation',
          objective: 'Start motor, confirm fan spinning, belt at 0 m/min',
          onEnter: (infra) => { infra.setLineRunning(true); },
          checkComplete: (infra) => infra.lineRunning && !infra.lineJam,
          autoAdvanceDelay: 3000,
          camera: { position: [-7, 5, -4], target: [-7, 1, -4] },
          narration: 'Starting drive motor M-06. Motor fan spinning up. Belt beginning to move.',
        },
        {
          id: 'set-speed',
          title: 'Set Belt Speed',
          description: 'Ramp conveyor to target production speed',
          objective: 'Increase speed to 18 m/min, verify rollers synchronized',
          onEnter: (infra) => { infra.setLineSpeed(18); },
          checkComplete: (infra) => infra.lineSpeed >= 17.5,
          autoAdvanceDelay: 4000,
          narration: 'Ramping belt speed to 18 meters per minute. Rollers synchronized.',
        },
        {
          id: 'start-spawning',
          title: 'Begin Box Spawning',
          description: 'Activate automatic box spawning at entry station',
          objective: 'Observe first boxes entering conveyor, sensor detection',
          checkComplete: (infra) => infra.cartonsOnLine.length > 0,
          autoAdvanceDelay: 5000,
          camera: { position: [-7, 5, -4], target: [-7, 1, -4] },
          narration: 'Auto-spawning activated. First cartons entering the conveyor at entry sensor.',
        },
        {
          id: 'sorting-operation',
          title: 'Sorting Operation',
          description: 'Watch boxes travel, get scanned, and diverted to correct bins',
          objective: 'Observe diverter arm operation, boxes routed to storage/dispatch',
          checkComplete: (infra) => infra.producedToday > 20,
          autoAdvanceDelay: 20000,
          camera: { position: [7, 8, 0], target: [7, 1, 0] },
          narration: 'Cartons moving along U-loop. Scanner reading barcodes. Diverter routing to storage bin.',
        },
        {
          id: 'counter-updates',
          title: 'Counter Updates',
          description: 'Verify production and transfer counters incrementing',
          objective: 'Confirm produced today, transferred to store, dispatch counts',
          checkComplete: (infra) => infra.transferredToday > 10,
          autoAdvanceDelay: 5000,
          narration: 'Counters updating in real-time. 25 produced, 12 transferred to cold store.',
        },
        {
          id: 'jam-simulation',
          title: 'Conveyor Jam Event',
          description: 'Simulate a carton obstruction at the transfer station',
          objective: 'Observe jam detection, line stop, and alarm generation',
          onEnter: (infra) => { infra.injectLineJam(); },
          checkComplete: (infra) => infra.lineJam,
          autoAdvanceDelay: 3000,
          camera: { position: [7, 5, 0], target: [7, 1, 0] },
          narration: 'ALARM: Carton jam at transfer station! Line stopped automatically. Throughput lost.',
        },
        {
          id: 'clear-jam',
          title: 'Clear Jam & Restart',
          description: 'Operator clears obstruction and restarts production',
          objective: 'Clear jam, verify line restarts, production resumes',
          onEnter: (infra) => { infra.clearLinkedList(); infra.setLineRunning(true); },
          checkComplete: (infra) => !infra.lineJam && infra.lineRunning,
          autoAdvanceDelay: 5000,
          narration: 'Jam cleared. Restarting line. Production resuming at 18 m/min.',
        },
        {
          id: 'complete-production',
          title: 'Complete Production Run',
          description: 'Finish production target and generate report',
          objective: 'Reach production target, verify all counters, stop line',
          checkComplete: (infra) => infra.producedToday >= 100,
          autoAdvanceDelay: 15000,
          narration: 'Production target reached. 100 cartons produced and sorted. Stopping line.',
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
          objective: 'Verify Zone A at -18°C, Zone B at -2°C, door closed, compressor at 40%',
          checkComplete: (infra) => infra.coldZones[0].temp < -15 && infra.coldZones[1].temp < 0,
          autoAdvanceDelay: 4000,
          camera: { position: [20, 8, -5], target: [20, 2, -5] },
          narration: 'Cold store initialized. Deep Freeze at -18.6°C, Chill Store at -2.4°C. All nominal.',
        },
        {
          id: 'activate-compressor',
          title: 'Activate Compressor',
          description: 'Start refrigeration plant and begin cooling cycle',
          objective: 'Verify compressor running, condenser fan spinning, load increasing',
          checkComplete: (infra) => !infra.faults.compressor && infra.compressorLoad > 0.3,
          autoAdvanceDelay: 3000,
          camera: { position: [30, 6, -4], target: [28, 2, -4] },
          narration: 'Compressor CP-06 running. Condenser fan active. Plant load at 40%.',
        },
        {
          id: 'monitor-cooling',
          title: 'Monitor Temperature Stabilization',
          description: 'Watch both zones approach and maintain setpoints',
          objective: 'Observe Zone A → -18°C, Zone B → -2°C, heat map updating',
          checkComplete: (infra) => Math.abs(infra.coldZones[0].temp + 18) < 1 && Math.abs(infra.coldZones[1].temp + 2) < 1,
          autoAdvanceDelay: 15000,
          camera: { position: [20, 8, -5], target: [20, 2, -5] },
          narration: 'Zones stabilizing at setpoints. Heat map shows uniform temperature distribution.',
        },
        {
          id: 'door-operation',
          title: 'Dock Door Operation',
          description: 'Open dock door for truck loading, observe temperature impact',
          objective: 'Open door, watch heat map warm-up, door timer start, alarm at 3 minutes',
          onEnter: (infra) => { infra.doorTarget = 1.6; infra.doorHold = 20; },
          checkComplete: (infra) => infra.doorAngle > 1.0,
          autoAdvanceDelay: 4000,
          camera: { position: [17, 6, 2], target: [17, 2, 1] },
          narration: 'Dock door opening for truck access. Warm air ingress begins. Door timer started.',
        },
        {
          id: 'temperature-rise',
          title: 'Temperature Rise During Door Open',
          description: 'Monitor temperature increase during extended door opening',
          objective: 'Watch Zone B rise faster, heat map change color, door-open elapsed',
          checkComplete: (infra) => infra.doorOpenElapsed > 180,
          autoAdvanceDelay: 20000,
          narration: 'Door open for 3 minutes. Zone B temperature rising. Door-open alarm will trigger.',
        },
        {
          id: 'door-alarm',
          title: 'Door Open Alarm',
          description: 'Door-open alarm triggers after configured delay',
          objective: 'Acknowledge alarm, observe warm-air ingress alert',
          checkComplete: (infra) => infra.getActiveAlarms().some(a => a.id === 'door-open'),
          autoAdvanceDelay: 5000,
          narration: 'ALARM: Dock door open for 180 seconds. Warm-air ingress raising store temperature.',
        },
        {
          id: 'close-door',
          title: 'Close Dock Door',
          description: 'Close door and observe temperature recovery',
          objective: 'Close door, watch temperature return to setpoints, alarm clears',
          onEnter: (infra) => { infra.doorTarget = 0; infra.doorHold = 0; },
          checkComplete: (infra) => infra.doorAngle < 0.1,
          autoAdvanceDelay: 10000,
          camera: { position: [17, 6, 2], target: [17, 2, 1] },
          narration: 'Closing dock door. Compressor working to restore temperatures. Alarm clearing.',
        },
        {
          id: 'abnormal-event',
          title: 'Abnormal Temperature Event',
          description: 'Simulate compressor fault causing temperature excursion',
          objective: 'Inject fault, observe rapid warming, quarantine activation',
          onEnter: (infra) => { infra.faults.compressor = true; infra.logEvent('Compressor fault', 'Simulated fault for scenario', 'danger'); },
          checkComplete: (infra) => infra.faults.compressor && infra.coldQuarantine > 0,
          autoAdvanceDelay: 15000,
          narration: 'CRITICAL: Compressor fault! Both zones warming rapidly. Stock quarantine initiated.',
        },
        {
          id: 'restore-cooling',
          title: 'Restore Cooling & Release Quarantine',
          description: 'Clear fault, restore cooling, release quarantined stock after review',
          objective: 'Clear compressor fault, verify temperatures return, release quarantine',
          onEnter: (infra) => { infra.faults.compressor = false; infra.clearCompressorFault?.(); },
          checkComplete: (infra) => !infra.faults.compressor && infra.coldBreach() === false,
          autoAdvanceDelay: 20000,
          narration: 'Compressor fault cleared. Cooling restored. Temperatures returning to band. Quarantine review needed.',
        },
        {
          id: 'cold-report',
          title: 'Cold Storage Condition Report',
          description: 'Generate storage condition and inventory report',
          objective: 'Review temperature logs, door cycles, quarantine events, inventory status',
          checkComplete: () => true,
          autoAdvanceDelay: 4000,
          narration: 'Cold store cycle complete. Temperatures stable. 15 units quarantined, reviewed, and released. Report generated.',
        },
      ],
    });

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
          objective: 'Verify 780 W/m² irradiance, 4.6 kW PV output, 68% battery SOC',
          checkComplete: (infra) => infra.irradiance > 700 && infra.batterySoc > 60,
          autoAdvanceDelay: 4000,
          camera: { position: [-25, 8, -12], target: [-25, 2, -12] },
          narration: 'Solar farm operational. Clear sky, 780 W/m². Battery at 68% SOC. Grid connected.',
        },
        {
          id: 'activate-panels',
          title: 'Activate Solar Array',
          description: 'Ensure PV array connected and generating',
          objective: 'Confirm array online, 12 panels active, inverter converting',
          checkComplete: (infra) => infra.pvPower > 4,
          autoAdvanceDelay: 3000,
          camera: { position: [-25, 8, -12], target: [-25, 2, -12] },
          narration: 'Photovoltaic array online. 12 tilted tables generating 4.6 kW DC. Inverter at 96% efficiency.',
        },
        {
          id: 'battery-charging',
          title: 'Battery Charging',
          description: 'Observe surplus solar charging the battery',
          objective: 'Watch battery SOC increase, charge power flow, module bars illuminate',
          checkComplete: (infra) => infra.batteryPower > 1000,
          autoAdvanceDelay: 10000,
          camera: { position: [-24, 6, 2], target: [-24, 1.5, 2] },
          narration: 'Surplus solar power charging battery. Charge rate 2.1 kW. Module SOC bars rising.',
        },
        {
          id: 'activate-inverter',
          title: 'Activate Inverter & Loads',
          description: 'Connect inverter and energize site loads',
          objective: 'Start inverter, connect priority loads, observe energy flow to loads',
          checkComplete: (infra) => infra.loads.control.served > 0,
          autoAdvanceDelay: 4000,
          camera: { position: [-13, 6, -8], target: [-13, 1.5, -8] },
          narration: 'Inverter online. Priority loads connected: Control centre, cold store, water pumping.',
        },
        {
          id: 'load-management',
          title: 'Load Management',
          description: 'Balance solar, battery, and grid to serve all loads',
          objective: 'Verify all 6 load feeders served, grid import minimal, battery stable',
          checkComplete: (infra) => infra.loadServed > 25000 && infra.gridImport < 10000,
          autoAdvanceDelay: 8000,
          camera: { position: [-13, 6, -8], target: [-13, 1.5, -8] },
          narration: 'All priority loads served. Grid import only 8 kW. Battery holding at 72% SOC.',
        },
        {
          id: 'increase-demand',
          title: 'Increased Electrical Demand',
          description: 'Simulate peak production increasing site load',
          objective: 'Activate packaging line and dock, observe battery discharge support',
          onEnter: (infra) => { infra.setLineRunning(true); infra.setLineSpeed(22); },
          checkComplete: (infra) => infra.loads.line.served > 5000,
          autoAdvanceDelay: 8000,
          camera: { position: [0, 8, -4], target: [0, 1, -4] },
          narration: 'Packaging line at full speed. Dock barriers active. Battery discharging to support peak.',
        },
        {
          id: 'low-battery-warning',
          title: 'Low Battery Warning',
          description: 'Battery drops to low SOC threshold during extended discharge',
          objective: 'Observe 20% SOC alarm, load shedding activation, cold chain protection',
          checkComplete: (infra) => infra.getActiveAlarms().some(a => a.id === 'battery-low'),
          autoAdvanceDelay: 20000,
          narration: 'WARNING: Battery at 20% SOC. Load shedding activated. Cold chain protected. Dock & lighting shed.',
        },
        {
          id: 'adjust-loads',
          title: 'Operator Load Adjustment',
          description: 'Reduce non-critical loads to preserve battery',
          objective: 'Shed dock and lighting loads, verify cold chain and water maintained',
          onEnter: (infra) => { infra.setLoadShed(true); },
          checkComplete: (infra) => infra.loads.dock.shed && infra.loads.lighting.shed,
          autoAdvanceDelay: 5000,
          narration: 'Operator shed dock and lighting loads. Cold store and water pumping fully protected.',
        },
        {
          id: 'restore-normal',
          title: 'Restore Normal Energy Conditions',
          description: 'Solar recovers, battery recharges, all loads restored',
          objective: 'Increase irradiance, watch battery charge, restore shed loads',
          onEnter: (infra) => { infra.cloudCover = 0.1; infra.setLoadShed(false); },
          checkComplete: (infra) => infra.batterySoc > 50 && !infra.shedLevel,
          autoAdvanceDelay: 15000,
          narration: 'Clouds clearing. Solar output rising. Battery recharging. All loads restored. Grid import normal.',
        },
        {
          id: 'energy-report',
          title: 'Energy Production & Consumption Report',
          description: 'Generate daily energy summary',
          objective: 'Review kWh generated, consumed, stored, grid exchange, battery cycles',
          checkComplete: () => true,
          autoAdvanceDelay: 4000,
          narration: 'Energy cycle complete. 42 kWh generated. 38 kWh consumed. Battery 2 cycles. Report ready.',
        },
      ],
    });
  }

  // First-person interaction handlers for campus
  _toggleDoor(obj) {
    if (obj.id === 'cold-door') {
      this.doorTarget = this.doorAngle > 0.1 ? 0 : 1.6;
      this.doorHold = this.doorTarget > 0 ? 20 : 0;
      this.logEvent('Door toggled', `Dock door ${this.doorTarget > 0 ? 'opened' : 'closed'} via first-person`, 'info');
    }
  }

  _operatePump(obj) {
    this.setPump(!this.pumpOn, this.pumpSpeed);
  }

  _toggleValve(obj) {
    // Valve interaction handled via pump inspector
    this.selectObject(obj.id);
  }

  _controlConveyor(obj) {
    this.setLineRunning(!this.lineRunning);
  }

  _operateMotor(obj) {
    this.setLineRunning(!this.lineRunning);
  }

  _operateCompressor(obj) {
    this.faults.compressor = !this.faults.compressor;
    this.logEvent('Compressor toggled', this.faults.compressor ? 'Fault injected' : 'Fault cleared', this.faults.compressor ? 'danger' : 'ok');
    this.refreshLive();
  }

  _operateBarrier(obj) {
    const barrierId = obj.id.replace('barrier-', '');
    const barrier = this.barriers[barrierId];
    if (barrier) {
      barrier.target = barrier.target > 0 ? 0 : 1.45;
      barrier.manual = true;
      this.logEvent('Barrier toggled', `${barrier.name} ${barrier.target > 0 ? 'opened' : 'closed'} manually`, 'info');
    }
  }

  _inspectVehicle(obj) {
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
