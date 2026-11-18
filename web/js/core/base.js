/* ============================================================
   BaseInfrastructure — shared control-room shell, simulation loop,
   sensors, alarms, persistence, charts, inspector and visibility.
   Each infrastructure extends this class and supplies its own
   world, sensors, rules, operations and object inspectors.
   ============================================================ */
import * as THREE from 'three';
import { SceneView, CAMERA_PRESETS, COLORS, material, emissive, roundedBox, box, cylinder, sphere, textSprite, shadowify, group, glass } from './scene.js';
import * as ui from './ui.js';
import { storage, loadGlobal, saveGlobal } from './storage.js';
import { FirstPersonControls, FirstPersonPauseMenu, showExperienceModeDialog } from './firstperson.js';
import { ScenarioManager, createStandardScenarios } from './scenario.js';

const { el, icon, button, badge, toast, modal, confirmDialog } = ui;
const ic = (name, size = 14) => icon(name, size).outerHTML;
const BASE_HISTORY_LIMIT = 950;
const HISTORY_INTERVAL = 2;

const DEFAULT_CONFIG = {
  simSpeed: 1,
  manual: false,
  autoSave: true,
  labels: true,
  visibility: {},
  xray: false,
  transparentWalls: false,
  camera: null,
  sensors: {},
  thresholds: {},
  analyticsRange: 900,
  renderScale: null,
};

function deepMerge(base, patch) {
  if (Array.isArray(base)) return Array.isArray(patch) ? patch.slice() : base.slice();
  if (base && typeof base === 'object' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) out[k] = k in base ? deepMerge(base[k], v) : v;
    return out;
  }
  return patch === undefined ? base : patch;
}

export class BaseInfrastructure {
  constructor(host, meta) {
    this.host = host;
    this.meta = meta;
    this.id = meta.id;
    this.root = host.root;
    this.config = null;
    this.scene = null;
    this.objects = new Map();
    this.equipment = [];
    this.sensorDefs = [];
    this.sensors = new Map();
    this.sensorVisuals = new Map();
    this.history = { times: [], series: {} };
    this.events = [];
    this.panelBindings = [];
    this.panelCharts = [];
    this.inspectorBindings = [];
    this.inspectorCharts = [];
    this.selectedId = null;
    this.activeTab = 'overview';
    this.manualMode = false;
    this.running = true;
    this.paused = false;
    this.stopped = false;
    this.speed = 1;
    this.simTime = 8 * 3600 + 30 * 60;
    this.realTime = 0;
    this.simDt = 0;
    this.range = 900;
    this.lastSaveAt = 0;
    this.savePending = false;
    this._raf = null;
    this._destroyed = false;
    this._skipSave = false;
    this._clock = new THREE.Clock();
    this._refreshAccum = 0;
    this._alarmAccum = 0;
    this._chartAccum = 0;
    this._historyAccum = 0;
    this._historySaveAccum = 0;
    this._saveTimer = null;
    this._alarmVersion = 0;
    this._renderedAlarmVersion = -1;
    this.activeAlarms = new Map();
    this.alarmHistory = [];
    this.alarmRules = [];
    this._audioCtx = null;
    this._boundKey = (e) => this._onKey(e);
    this._lastEventText = '';
    this._panelTitle = '';
    this._panelSub = '';
    this._tabsBuilt = false;
    this._initAudioGesture = () => this._initAudio();

    // First-Person Experience
    this.firstPersonControls = null;
    this.firstPersonPauseMenu = null;
    this.firstPersonMode = null; // 'monitor'
    this.firstPersonEnabled = false;
    this.collisionMeshes = [];
    this._pointerLockExiting = false;

    // Scenario System
    this.scenarioManager = new ScenarioManager(this);
    this.registeredScenarios = {};
  }

  /* =========================================================
     Lifecycle
     ========================================================= */
  async mount() {
    this.config = this.loadConfig();
    this.speed = this.config.simSpeed || 1;
    this.manualMode = !!this.config.manual;
    this.range = this.config.analyticsRange || 900;
    this.sensorDefs = this.defineSensors();
    this.initSensors();
    this.initAlarmRules();
    this.loadHistory();
    this.buildWorkspace();
    this.scene = new SceneView(this.shell.querySelector('.scene-canvas'));
    this.scene.setBackground(this.meta.sceneBackground ?? 0x050b12, this.meta.fogDensity ?? 0.0045);
    if (this.config.renderScale === 'performance') this.scene.renderer.setPixelRatio(1);
    else if (this.config.renderScale === 'high') this.scene.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1.65));
    else if (this.config.renderScale === 'balanced') this.scene.renderer.setPixelRatio(Math.min(1.35, window.devicePixelRatio || 1.25));
    this.buildWorld();
    this.applyInitialCamera();
    this.restoreVisibility();
    this.restoreLabels();
    this.bindScene();
    this.buildNav();
    this.setTab(this.config.lastTab && this.getTab(this.config.lastTab) ? this.config.lastTab : 'overview', { initial: true });
    this.scene.resize();
    this._updateAllChrome();
    this._startLoop();
    window.addEventListener('keydown', this._boundKey);
    document.addEventListener('pointerdown', this._initAudioGesture, { once: true });
    setTimeout(() => { this.shell.querySelector('.viewport-loading')?.classList.add('done'); this.scene.resize(); }, 450);
    this.onAfterMount?.();
    this.logEvent('Facility online', `${this.meta.name} simulation engine initialised.`, 'ok');
    this.refreshLive();
    return this;
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._saveTimer);
    window.removeEventListener('keydown', this._boundKey);
    document.removeEventListener('pointerdown', this._initAudioGesture);
    if (!this._skipSave) {
      try { this.saveConfig(false); this.saveHistoryNow(); } catch (e) { console.warn('save on destroy failed', e); }
    }
    try { this.scene?.dispose(); } catch (e) { console.warn('scene dispose failed', e); }
    try { this._audioCtx?.close(); } catch { /* ignore */ }
    this.root.innerHTML = '';
  }

  /* =========================================================
     Configuration & persistence
     ========================================================= */
  defaultConfig() { return { ...DEFAULT_CONFIG }; }

  loadConfig() {
    const defaults = deepMerge(DEFAULT_CONFIG, this.defaultConfig());
    const saved = storage.get(`idt.${this.id}.config`, {}) || {};
    const cfg = deepMerge(defaults, saved);
    cfg.simSpeed = Math.max(0.05, Math.min(100, +cfg.simSpeed || 1));
    cfg.thresholds = cfg.thresholds || {};
    cfg.sensors = cfg.sensors || {};
    cfg.visibility = cfg.visibility || {};
    return cfg;
  }

  configKey() { return `idt.${this.id}.config`; }
  historyKey() { return `idt.${this.id}.history`; }

  saveConfig(notify = false) {
    if (!this.scene) return;
    try {
      const cfg = { ...this.config };
      cfg.simSpeed = this.speed;
      cfg.manual = this.manualMode;
      cfg.visibility = this.scene.getVisibility();
      cfg.labels = this.labelsVisible;
      cfg.analyticsRange = this.range;
      cfg.lastTab = this.activeTab;
      cfg.camera = {
        position: this.scene.camera.position.toArray().map(v => +v.toFixed(3)),
        target: this.scene.controls.target.toArray().map(v => +v.toFixed(3)),
      };
      cfg.sensors = this.serializeSensors();
      this.onSaveConfig?.(cfg);
      storage.set(this.configKey(), cfg);
      this.config = cfg;
      this.lastSaveAt = Date.now();
      if (notify) toast('Configuration saved.', { type: 'ok', title: this.meta.name });
      this._updateSaveIndicator('SAVED');
    } catch (err) {
      console.error('save config failed', err);
      toast('Unable to save configuration.', { type: 'danger' });
    }
  }

  saveSoon() {
    if (!this.config?.autoSave) return;
    this.savePending = true;
    this._updateSaveIndicator('PENDING');
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.savePending = false;
      this.saveConfig(false);
    }, 750);
  }

  loadSavedConfiguration() {
    this._skipSave = true;
    this.host.reopenCurrent({ keepConfig: false });
  }

  resetConfiguration() {
    storage.remove(this.configKey());
    storage.remove(this.historyKey());
    this._skipSave = true;
    this.host.reopenCurrent({ keepConfig: false });
  }

  exportConfiguration() {
    const cfg = this.config || {};
    ui.downloadJSON(`nexus-${this.id}-config.json`, {
      app: 'NEXUS Industrial Digital Twin Simulator',
      schema: 1,
      facility: this.id,
      facilityName: this.meta.name,
      exportedAt: new Date().toISOString(),
      config: cfg,
    });
    toast('Facility configuration exported.', { type: 'ok' });
  }

  async importConfiguration() {
    const file = await ui.pickFile('.json,application/json');
    if (!file) return;
    try {
      const data = JSON.parse(file.text);
      const cfg = data.config || data;
      if (!cfg || typeof cfg !== 'object') throw new Error('No configuration object found.');
      storage.set(this.configKey(), cfg);
      toast('Configuration imported. Reloading facility…', { type: 'ok' });
      this._skipSave = true;
      setTimeout(() => this.host.reopenCurrent({ keepConfig: false }), 500);
    } catch (err) {
      toast(`Import failed: ${err.message}`, { type: 'danger', title: 'Invalid configuration' });
    }
  }

  serializeSensors() {
    const out = {};
    for (const s of this.sensorDefs) {
      const cfg = this.config.sensors?.[s.id] || {};
      out[s.id] = {
        enabled: cfg.enabled ?? s.enabled ?? true,
        calibration: cfg.calibration ?? s.calibration ?? 0,
        manual: cfg.manual ?? null,
        alarmLow: cfg.alarmLow ?? s.alarmLow ?? s.min,
        alarmHigh: cfg.alarmHigh ?? s.alarmHigh ?? s.max,
      };
    }
    return out;
  }

  loadHistory() {
    const saved = storage.get(this.historyKey(), null);
    const defs = this.getAnalyticsDefs();
    this.history = { times: [], series: {} };
    for (const d of defs) this.history.series[d.id] = [];
    if (saved && saved.series) {
      this.history.times = Array.isArray(saved.times) ? saved.times.slice(-BASE_HISTORY_LIMIT) : [];
      for (const d of defs) {
        const s = saved.series[d.id];
        if (s && Array.isArray(s.data)) this.history.series[d.id] = s.data.slice(-BASE_HISTORY_LIMIT);
      }
    }
  }

  saveHistoryNow() {
    const series = {};
    for (const [id, data] of Object.entries(this.history.series)) series[id] = { data: data.slice(-BASE_HISTORY_LIMIT) };
    storage.set(this.historyKey(), { updatedAt: Date.now(), times: this.history.times.slice(-BASE_HISTORY_LIMIT), series });
  }

  recordHistoryPoint() {
    const defs = this.getAnalyticsDefs();
    const t = this.simTime;
    this.history.times.push(t);
    for (const d of defs) {
      if (!this.history.series[d.id]) this.history.series[d.id] = [];
      let v = null;
      try { v = d.get(); } catch { v = null; }
      this.history.series[d.id].push(Number.isFinite(+v) ? +v : null);
      if (this.history.series[d.id].length > BASE_HISTORY_LIMIT) this.history.series[d.id].shift();
    }
    if (this.history.times.length > BASE_HISTORY_LIMIT) this.history.times.shift();
  }

  seriesData(id, count = 120) {
    return (this.history.series[id] || []).slice(-count);
  }

  getAnalyticsDefs() {
    if (this.sensorDefs.length) {
      return this.sensorDefs.map((s, i) => ({
        id: s.id, label: s.name, unit: s.unit, color: ['#36e2c2', '#46a9ff', '#a98bff', '#ffb547'][i % 4],
        get: () => this.sensorValue(s.id), digits: s.digits ?? 1,
      }));
    }
    return [];
  }

  /* =========================================================
     Sensors
     ========================================================= */
  initSensors() {
    const saved = this.config.sensors || {};
    for (const s of this.sensorDefs) {
      const cfg = saved[s.id] || {};
      const def = {
        ...s,
        enabled: cfg.enabled ?? s.enabled ?? true,
        calibration: cfg.calibration ?? s.calibration ?? 0,
        manual: cfg.manual ?? null,
        alarmLow: cfg.alarmLow ?? s.alarmLow ?? s.min,
        alarmHigh: cfg.alarmHigh ?? s.alarmHigh ?? s.max,
        rawValue: s.value ?? s.min,
        iconName: s.iconName || 'sensor',
        digits: s.digits ?? (Math.abs(s.max - s.min) <= 5 ? 2 : Math.abs(s.max - s.min) <= 50 ? 1 : 0),
      };
      if (!this.config.sensors[s.id]) {
        this.config.sensors[s.id] = {
          enabled: def.enabled, calibration: def.calibration, manual: def.manual,
          alarmLow: def.alarmLow, alarmHigh: def.alarmHigh,
        };
      }
      this.sensors.set(s.id, def);
    }
  }

  getSensor(id) { return this.sensors.get(id); }

  sensorCfg(id) {
    if (!this.config.sensors[id]) this.config.sensors[id] = {};
    return this.config.sensors[id];
  }

  setSensorValue(id, raw) {
    const s = this.sensors.get(id);
    if (!s) return;
    s.rawValue = raw;
    if (s.rawValue < s.min) s.rawValue = s.min;
    if (s.rawValue > s.max) s.rawValue = s.max;
  }

  sensorValue(id) {
    const s = this.sensors.get(id);
    if (!s) return null;
    if (!s.enabled) return null;
    let v = s.manual !== null && s.manual !== undefined ? s.manual : s.rawValue;
    v += s.calibration || 0;
    return Math.round(v * 10000) / 10000;
  }

  sensorStatus(id) {
    const s = this.sensors.get(id);
    if (!s) return 'unknown';
    if (!s.enabled) return 'disabled';
    const v = this.sensorValue(id);
    if (v === null) return 'disabled';
    if (v <= s.alarmLow || v >= s.alarmHigh) return 'alarm';
    if (v <= s.alarmLow + (s.alarmHigh - s.alarmLow) * .08 || v >= s.alarmHigh - (s.alarmHigh - s.alarmLow) * .08) return 'warn';
    return 'ok';
  }

  sensorTone(id) {
    const st = this.sensorStatus(id);
    return st === 'alarm' ? 'danger' : st === 'warn' ? 'warn' : st === 'disabled' ? 'muted' : 'ok';
  }

  sensorText(id) {
    const s = this.sensors.get(id);
    if (!s) return '—';
    const v = this.sensorValue(id);
    if (v === null) return s.enabled ? '—' : 'OFF';
    return `${ui.fmt(v, s.digits)}${s.unit ? ' ' + s.unit : ''}`;
  }

  setSensorEnabled(id, enabled) {
    const s = this.sensors.get(id);
    if (!s) return;
    s.enabled = enabled;
    this.sensorCfg(id).enabled = enabled;
    this.logEvent(enabled ? 'Sensor enabled' : 'Sensor disabled', `${s.name} (${id})`, enabled ? 'ok' : 'warn');
    this.saveSoon();
    this.refreshInspector();
    this.refreshLive();
  }

  setSensorCalibration(id, value) {
    const s = this.sensors.get(id);
    if (!s) return;
    s.calibration = value;
    this.sensorCfg(id).calibration = value;
    this.saveSoon();
  }

  setSensorManual(id, value) {
    const s = this.sensors.get(id);
    if (!s) return;
    s.manual = value;
    this.sensorCfg(id).manual = value;
    this.saveSoon();
  }

  createSensorNode(sensor, opts = {}) {
    const s = typeof sensor === 'string' ? this.sensors.get(sensor) : sensor;
    if (!s) return group('missing-sensor');
    const g = group(`sensor-${s.id}`);
    const scale = opts.scale ?? 1;
    const housing = material(0x2d3a44, { metalness: .55, roughness: .45 });
    const trim = material(0x8395a3, { metalness: .7, roughness: .35 });
    const base = roundedBox(.24, .30, .14, housing, { pos: [0, 0, 0], radius: .025 });
    g.add(base);
    const face = box(.15, .19, .015, material(0x0b1820, { roughness: .28, metalness: .2 }), { pos: [0, .015, .075], cast: false });
    g.add(face);
    const lens = cylinder(.026, .026, .017, material(0xcbd9e2), { pos: [0, .015, .09], rx: Math.PI / 2, segments: 12, cast: false });
    g.add(lens);
    const led = new THREE.Mesh(new THREE.SphereGeometry(.018, 10, 8), emissive(0x3ce58b, 1.9));
    led.position.set(-.072, .1, .078);
    g.add(led);
    g.add(cylinder(.008, .008, .11, trim, { pos: [.06, .19, 0], segments: 6 }));
    g.add(sphere(.012, emissive(0x36e2c2, 1.2), { pos: [.06, .25, 0] }));
    g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    g.scale.setScalar(scale);
    if (opts.position) g.position.fromArray(opts.position);
    if (opts.rotation) g.rotation.set(...opts.rotation);
    this.attachSensor(s.id, g, { label: opts.label, led, labelOffset: opts.labelOffset ?? .55, labelScale: opts.labelScale ?? .55 });
    return g;
  }

  attachSensor(sensorId, node, opts = {}) {
    const s = this.sensors.get(sensorId);
    if (!s) return node;
    const id = `sensor.${sensorId}`;
    this.addObject(node, {
      id, label: s.name, kind: 'sensor', sensorId, iconName: 'sensor',
      description: `${s.name} · ${s.unit || 'value'}`,
    });
    if (opts.label !== false) {
      const sprite = textSprite(`${s.id} · ${s.name}`, { size: 34, color: '#bfeee6', bg: 'rgba(5,14,22,.78)', border: 'rgba(54,226,194,.35)', scale: opts.labelScale ?? .5 });
      sprite.position.set(0, opts.labelOffset ?? .55, 0);
      sprite.visible = this.config.labels !== false;
      node.add(sprite);
      node.userData.sensorLabel = sprite;
    }
    this.sensorVisuals.set(sensorId, { node, led: opts.led, sensorId });
    return node;
  }

  updateSensorVisuals() {
    for (const [id, vis] of this.sensorVisuals) {
      if (!vis.led?.material) continue;
      const status = this.sensorStatus(id);
      const col = status === 'alarm' ? 0xff4a5f : status === 'warn' ? 0xffb547 : status === 'disabled' ? 0x4d5a64 : 0x3ce58b;
      vis.led.material.emissive.setHex(col);
      vis.led.material.color.setHex(col);
      vis.led.material.emissiveIntensity = status === 'alarm' ? 2.4 : 1.6;
    }
  }

  /* =========================================================
     Alarms
     ========================================================= */
  defineAlarmRules() { return []; }

  initAlarmRules() {
    this.alarmRules = this.defineAlarmRules();
    for (const r of this.alarmRules) {
      if (r.thresholdKey && r.defaultThreshold !== undefined && this.config.thresholds[r.thresholdKey] === undefined) {
        this.config.thresholds[r.thresholdKey] = r.defaultThreshold;
      }
      if (this.config.alarmsEnabled?.[r.id] === undefined) {
        this.config.alarmsEnabled = this.config.alarmsEnabled || {};
        this.config.alarmsEnabled[r.id] = true;
      }
    }
  }

  threshold(key, fallback) {
    const v = this.config.thresholds?.[key];
    return Number.isFinite(+v) ? +v : fallback;
  }

  setThreshold(key, value) {
    this.config.thresholds[key] = +value;
    this.saveSoon();
    this.evaluateAlarms();
    this.refreshLive();
  }

  evaluateAlarms() {
    if (!this.running || this.paused) return;
    let changed = false;
    for (const rule of this.alarmRules) {
      if (this.config.alarmsEnabled?.[rule.id] === false) {
        if (this.activeAlarms.has(rule.id)) {
          this.activeAlarms.delete(rule.id);
          changed = true;
        }
        continue;
      }
      let active = false;
      try { active = !!rule.active(); } catch { active = false; }
      const current = this.activeAlarms.get(rule.id);
      if (active && !current) {
        let message = typeof rule.message === 'function' ? rule.message() : rule.message;
        if (!message) message = rule.title;
        const a = {
          rid: `${rule.id}-${Date.now()}`, id: rule.id, title: rule.title, message,
          severity: rule.severity || 'warning', raisedAt: Date.now(), raisedSim: this.simTime, ack: false,
        };
        this.activeAlarms.set(rule.id, a);
        this._alarmVersion++;
        this.logEvent(`ALARM · ${rule.title}`, message, rule.severity === 'critical' ? 'danger' : 'warn');
        toast(message, { type: rule.severity === 'critical' ? 'danger' : 'warn', title: rule.title, duration: rule.severity === 'critical' ? 8000 : 6000 });
        if (rule.severity === 'critical') this._beep(true);
        changed = true;
      } else if (!active && current) {
        this.activeAlarms.delete(rule.id);
        this.alarmHistory.unshift({
          ...current, clearedAt: Date.now(), clearedSim: this.simTime, resolved: true,
        });
        if (this.alarmHistory.length > 120) this.alarmHistory.pop();
        this._alarmVersion++;
        this.logEvent(`Cleared · ${rule.title}`, 'Condition returned to normal.', 'ok');
        changed = true;
      }
    }
    if (changed) this._updateAlarmBadges();
  }

  acknowledgeAlarm(id) {
    for (const a of this.activeAlarms.values()) if (a.id === id) a.ack = true;
    this._alarmVersion++;
    this.saveSoon();
    this.refreshInspector();
    this.refreshLive();
  }

  acknowledgeAllAlarms() {
    for (const a of this.activeAlarms.values()) a.ack = true;
    this._alarmVersion++;
    this.saveSoon();
    toast('All active alarms acknowledged.', { type: 'ok' });
    this.refreshLive();
  }

  getActiveAlarms() { return [...this.activeAlarms.values()].filter(a => !a.ack); }

  /* =========================================================
     Audio
     ========================================================= */
  _initAudio() {
    if (this._audioCtx) return;
    try { this._audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this._audioCtx = null; }
  }

  _beep(critical = false) {
    if (!loadGlobal().alarmSound || !this._audioCtx) return;
    try {
      const ctx = this._audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      for (let i = 0; i < (critical ? 2 : 1); i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = critical ? 620 : 480;
        gain.gain.setValueAtTime(0.0001, now + i * .22);
        gain.gain.exponentialRampToValueAtTime(.09, now + i * .22 + .015);
        gain.gain.exponentialRampToValueAtTime(.0001, now + i * .22 + .16);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * .22); osc.stop(now + i * .22 + .18);
      }
    } catch { /* ignore */ }
  }

  /* =========================================================
     World helpers
     ========================================================= */
  category({ id, label, kind = 'structure', parent = null, hidden = false }) {
    return this.scene.addCategory({ id, label, kind, parent, hidden });
  }

  addObject(root, spec) {
    this.scene.registerInteractive(root, spec);
    this.objects.set(spec.id, { ...spec, root });
    return root;
  }

  addEquipment(def) {
    const item = { status: () => 'READY', detail: () => '', tone: () => 'ok', ...def };
    this.equipment.push(item);
    return item;
  }

  equipmentById(id) { return this.equipment.find(e => e.id === id); }

  bindScene() {
    this.scene.onSelect = (id) => {
      if (!id) { if (this.selectedId) this.closeInspector(); return; }
      this.selectObject(id);
    };
    this.scene.onHover = (id, rec, x, y) => this._showHoverTooltip(id, rec, x, y);
    this.scene.onDoubleClick = (id) => {
      if (id) toast(`Focused on ${this.objects.get(id)?.label || id}.`, { type: 'info', duration: 1600 });
    };
  }

  selectObject(id) {
    const obj = this.objects.get(id);
    if (!obj) return;
    this.selectedId = id;
    this.scene.select(id);
    this.activeTabBeforeInspector = this.activeTab;
    const spec = obj.kind === 'sensor' ? this.sensorInspector(obj) : this.getObjectInspector(obj);
    this.inspectorSpec = spec || this.defaultInspector(obj);
    this.renderInspector();
    if (this.viewFlags?.isolate) this.scene.isolateCategory(this._categoryForObject(obj));
  }

  closeInspector() {
    this.selectedId = null;
    this.inspectorSpec = null;
    this.scene.clearSelection();
    this.setTab(this.activeTabBeforeInspector || this.activeTab);
  }

  defaultInspector(obj) {
    return {
      title: obj.label || obj.id,
      subtitle: (obj.kind || 'object') + ' · ' + obj.id,
      iconName: obj.iconName || 'equipment',
      badge: { text: 'ONLINE', tone: 'ok' },
      fields: [
        { label: 'Identifier', value: obj.id },
        { label: 'Type', value: obj.kind || 'component' },
        { label: 'Description', value: obj.description || 'Interactive infrastructure component' },
      ],
      sections: [],
    };
  }

  sensorInspector(obj) {
    const s = this.sensors.get(obj.sensorId);
    if (!s) return this.defaultInspector(obj);
    const cfg = this.sensorCfg(s.id);
    const reading = () => this.sensorText(s.id);
    const status = () => this.sensorStatus(s.id).toUpperCase();
    const fields = [
      { label: 'Sensor ID', value: s.id },
      { label: 'Reading', get: reading },
      { label: 'Measurement', value: `${s.name}${s.unit ? ' · ' + s.unit : ''}` },
      { label: 'Range', value: `${ui.fmt(s.min, s.digits)} — ${ui.fmt(s.max, s.digits)} ${s.unit}` },
      { label: 'Calibration offset', get: () => `${s.calibration > 0 ? '+' : ''}${ui.fmt(s.calibration, 2)} ${s.unit}` },
      { label: 'Status', get: () => status() },
    ];
    const controls = [
      { type: 'toggle', label: 'Sensor enabled', description: 'Disabling maintains state but suspends live readings.', value: s.enabled, onChange: v => this.setSensorEnabled(s.id, v) },
      { type: 'slider', label: 'Calibration offset', min: -10, max: 10, step: .1, value: s.calibration, unit: s.unit, onChange: v => { this.setSensorCalibration(s.id, v); } },
      { type: 'toggle', label: 'Manual value override', description: 'Inject a fixed reading for testing and commissioning.', value: s.manual !== null && s.manual !== undefined, onChange: v => {
        this.setSensorManual(s.id, v ? (this.sensorValue(s.id) ?? s.rawValue) : null);
        this.refreshInspector();
      } },
    ];
    if (s.manual !== null && s.manual !== undefined) {
      controls.push({ type: 'number', label: 'Override value', unit: s.unit, min: s.min, max: s.max, step: .1, value: s.manual, onChange: v => { this.setSensorManual(s.id, v); } });
    }
    controls.push(
      { type: 'pair', controls: [
        { type: 'number', label: 'Alarm low', unit: s.unit, min: s.min, max: s.max, step: .1, value: s.alarmLow, onChange: v => { cfg.alarmLow = v; s.alarmLow = v; this.saveSoon(); this.refreshInspector(); } },
        { type: 'number', label: 'Alarm high', unit: s.unit, min: s.min, max: s.max, step: .1, value: s.alarmHigh, onChange: v => { cfg.alarmHigh = v; s.alarmHigh = v; this.saveSoon(); this.refreshInspector(); } },
      ] },
      { type: 'button', label: 'Reset calibration', variant: 'ghost', iconName: 'reset', onClick: () => { this.setSensorCalibration(s.id, 0); this.setSensorManual(s.id, null); this.refreshInspector(); } },
    );
    return {
      title: s.name,
      subtitle: `SENSOR · ${s.id}`,
      iconName: 'sensor',
      badge: { get text() { return status(); }, tone: this.sensorTone(s.id) },
      fields,
      sections: [{ title: 'Sensor Controls', controls }],
      note: 'Calibration and overrides affect only this sensor channel. Process simulation continues independently.',
      live: () => { this._updateInspectorBadge(); },
    };
  }

  /* =========================================================
     Workspace shell
     ========================================================= */
  buildWorkspace() {
    const meta = this.meta;
    const theme = document.documentElement.dataset.theme || 'dark';
    const alarmCount = this.activeAlarms.size;
    this.root.innerHTML = `
      <div class="workspace" id="nexus-workspace">
        <header class="topbar">
          <button class="back-btn" id="btn-menu">${ic('back', 15)}<span>Main Menu</span></button>
          <div class="topbar-divider"></div>
          <div class="facility-chip">
            <div class="ic">${ic(meta.icon, 17)}</div>
            <div class="tt"><h1>${meta.name}</h1><div class="st"><span class="dot-status live"></span><span id="top-facility-state">${meta.code} · DIGITAL TWIN ONLINE</span></div></div>
          </div>
          <div class="topbar-center">
            <div class="topbar-live">
              <span class="pill"><span class="dot-status live"></span> SCADA LINK <b style="color:var(--ok)">ONLINE</b></span>
              <span class="pill">${ic('shieldCheck', 12)} ENTERPRISE MONITORING</span>
            </div>
          </div>
          <div class="topbar-right">
            <div class="sim-clock"><b id="top-clock">--:--:--</b><span>Simulation time</span></div>
            <button class="btn icon ghost topbar-icon" id="btn-alarms" title="Alarms">${ic('alert', 16)}<span class="nav-badge" id="top-alarm-count" style="position:absolute;margin-left:20px;margin-top:-16px">0</span></button>
            <button class="btn icon ghost topbar-icon" id="btn-pause" title="Pause simulation">${ic('pause', 16)}</button>
            <div class="speed-select-wrap"><label>SPEED</label><select class="speed-select" id="speed-select">
              ${[0.25,0.5,1,2,5,10].map(s => `<option value="${s}" ${this.speed === s ? 'selected' : ''}>${s}x</option>`).join('')}
              <option value="custom">CUSTOM</option>
            </select></div>
            <button class="btn icon ghost topbar-icon" id="btn-theme" title="Toggle theme">${ic(theme === 'light' ? 'moon' : 'sun', 16)}</button>
            <button class="btn icon ghost topbar-icon" id="btn-focus" title="Fullscreen 3D view">${ic('maximize', 16)}</button>
          </div>
        </header>
        <div class="ws-body">
          <aside class="sidebar">
            <div class="side-facility">
              <div class="thumb">${ic(meta.icon, 18)}</div>
              <div class="tt"><div class="name">${meta.name}</div><div class="code">${meta.code} · LOCAL NODE</div></div>
              <span class="badge ok"><span class="dot"></span>LIVE</span>
            </div>
            <nav class="side-nav" id="side-nav"></nav>
            <div class="side-sim">
              <div class="side-sim-head"><span class="dot-status live" id="side-state-dot"></span><span class="lbl">SIMULATION</span><span class="state" id="side-state">RUNNING</span></div>
              <div class="side-sim-clock"><span id="side-clock">08:30:00</span><span>SIM TIME</span></div>
              <div class="side-sim-controls">
                <button class="btn subtle small" id="side-pause">${ic('pause', 12)}<span>Pause</span></button>
                <button class="btn ghost small" id="side-restart" title="Restart simulation">${ic('restart', 12)}</button>
                <button class="btn ghost small" id="side-simtab" title="Simulation control center">${ic('sliders', 12)}</button>
              </div>
              <div class="sim-speeds" id="side-speeds">
                ${[0.25,0.5,1,2,5,10].map(s => `<button data-speed="${s}" class="${this.speed === s ? 'active' : ''}">${s}x</button>`).join('')}
              </div>
            </div>
            <div class="side-footer"><span>NEXUS CORE</span><span>v1.0.0</span></div>
          </aside>
          <main class="viewport">
            <canvas class="scene-canvas"></canvas>
            <div class="viewport-vignette"></div>
            <div class="viewport-top">
              <div class="viewport-pill">${ic('activity', 12)} <b id="vp-state">RUNNING</b> · LIVE</div>
              <div class="viewport-pill">${ic('cube', 12)} <b id="vp-objects">0</b> INTERACTIVE OBJECTS</div>
              <div class="viewport-pill" id="vp-alarm-pill" style="display:none">${ic('alert', 12)} <b id="vp-alarms">0</b> ACTIVE ALARMS</div>
            </div>
            <div class="camera-toolbar" id="camera-toolbar">
              ${CAMERA_PRESETS.map(p => `<button class="cam-btn" data-cam="${p.id}" data-tip="${p.label}">${ic(p.icon, 16)}</button>`).join('')}
              <div class="cam-sep"></div>
              <button class="cam-btn" id="cam-fit" data-tip="Fit Entire Infrastructure">${ic('fit', 16)}</button>
              <button class="cam-btn" id="cam-roof" data-tip="Toggle Roof & Ceiling">${ic('layers', 16)}</button>
              <button class="cam-btn" id="cam-xray" data-tip="X-Ray Mode">${ic('xray', 16)}</button>
              <div class="cam-sep"></div>
              <button class="cam-btn" id="cam-focus" data-tip="Fullscreen 3D">${ic('maximize', 16)}</button>
            </div>
            <div class="object-tip" id="object-tip"></div>
            <div class="viewport-bottom">
              <div class="scene-legend" id="scene-legend"></div>
              <div class="camera-hint"><b>LMB</b> orbit · <b>RMB</b> pan · <b>Scroll</b> zoom · <b>Double-click</b> focus</div>
            </div>
            <div class="viewport-loading"><div class="loader-ring"></div><div class="txt">Streaming 3D environment</div></div>
          </main>
          <div class="panel-resizer" id="panel-resizer"></div>
          <aside class="sidepanel" id="sidepanel">
            <div class="panel-head">
              <div class="tt"><h2 id="panel-title">Overview</h2><div class="sub" id="panel-sub">Facility telemetry</div></div>
              <div class="panel-head-actions" id="panel-head-actions"></div>
            </div>
            <div class="panel-body" id="panel-body"></div>
          </aside>
        </div>
        <footer class="statusbar">
          <div class="it"><span class="dot-status live" id="st-dot"></span> ENGINE <b id="st-state">RUNNING</b></div>
          <div class="it">SIM <b id="st-clock">08:30:00</b></div>
          <div class="it">RATE <b id="st-speed">1.0x</b></div>
          <div class="it">MODE <b id="st-mode">AUTOMATIC</b></div>
          <div class="it" style="max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><span style="color:var(--muted-2)">●</span> <span id="st-event">Initialising…</span></div>
          <div class="right">
            <div class="it">STORAGE <b id="st-save">SAVED</b></div>
            <div class="div"></div>
            <div class="it">FPS <b id="st-fps">60</b></div>
            <div class="it">DRAW <b id="st-draw">0</b></div>
            <div class="it">TRIS <b id="st-tris">0</b></div>
            <div class="it">WEBGL2</div>
          </div>
        </footer>
      </div>`;
    this.shell = this.root.querySelector('.workspace');
    this.viewportEl = this.shell.querySelector('.viewport');
    this.panelEl = this.shell.querySelector('.sidepanel');
    this.panelBody = this.shell.querySelector('#panel-body');
    this.panelTitle = this.shell.querySelector('#panel-title');
    this.panelSub = this.shell.querySelector('#panel-sub');
    this.panelHeadActions = this.shell.querySelector('#panel-head-actions');
    this.sideNav = this.shell.querySelector('#side-nav');
    this.labelsVisible = this.config.labels !== false;
    this.viewFlags = { xray: !!this.config.xray, transparentExplicit: false, equipmentOnly: false, isolate: false };

    // panel width
    const g = loadGlobal();
    const width = Math.max(330, Math.min(620, g.panelWidth || 404));
    this.shell.style.setProperty('--panel-w', `${width}px`);
    this._bindShellEvents();
  }

  _bindShellEvents() {
    const ws = this.shell;
    ws.querySelector('#btn-menu').addEventListener('click', () => {
      this.saveConfig(false);
      this.host.closeInfrastructure();
    });
    ws.querySelector('#btn-alarms').addEventListener('click', () => this.setTab('alarms'));
    ws.querySelector('#btn-pause').addEventListener('click', () => this.togglePause());
    ws.querySelector('#speed-select').addEventListener('change', (e) => {
      if (e.target.value === 'custom') { e.target.value = String(this.speed); this.openCustomSpeed(); }
      else this.setSpeed(+e.target.value);
    });
    ws.querySelector('#btn-theme').addEventListener('click', () => this.toggleTheme());
    ws.querySelector('#btn-focus').addEventListener('click', () => this.toggleFocusMode());
    ws.querySelector('#side-pause').addEventListener('click', () => this.togglePause());
    ws.querySelector('#side-restart').addEventListener('click', () => this.restartSimulation());
    ws.querySelector('#side-simtab').addEventListener('click', () => this.setTab('simulation'));
    ws.querySelectorAll('#side-speeds button').forEach(b => b.addEventListener('click', () => this.setSpeed(+b.dataset.speed)));
    ws.querySelectorAll('[data-cam]').forEach(b => b.addEventListener('click', () => {
      this.scene.setView(b.dataset.cam);
      ws.querySelectorAll('[data-cam]').forEach(x => x.classList.toggle('active', x === b));
    }));
    ws.querySelector('#cam-fit').addEventListener('click', () => this.scene.fitAll(1.25));
    ws.querySelector('#cam-roof').addEventListener('click', () => this.quickToggleRoof());
    ws.querySelector('#cam-xray').addEventListener('click', () => this.toggleXray());
    ws.querySelector('#cam-focus').addEventListener('click', () => this.toggleFocusMode());
    this._bindResizer();
  }

  _bindResizer() {
    const handle = this.shell.querySelector('#panel-resizer');
    let drag = null;
    handle.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, width: this.panelEl.getBoundingClientRect().width };
      handle.classList.add('dragging');
      handle.setPointerCapture?.(e.pointerId);
    });
    const move = (e) => {
      if (!drag) return;
      const width = Math.max(330, Math.min(640, drag.width + (drag.x - e.clientX)));
      this.shell.style.setProperty('--panel-w', `${width}px`);
      this._panelWidthNow = width;
      this.scene?.resize();
    };
    const up = () => {
      if (!drag) return;
      drag = null;
      handle.classList.remove('dragging');
      if (this._panelWidthNow) {
        const g = loadGlobal();
        saveGlobal({ panelWidth: Math.round(this._panelWidthNow) });
        g.panelWidth = this._panelWidthNow;
      }
    };
    handle.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  buildNav() {
    const groups = [];
    const byGroup = new Map();
    for (const t of this.tabs()) {
      if (!byGroup.has(t.group)) { byGroup.set(t.group, []); groups.push(t.group); }
      byGroup.get(t.group).push(t);
    }
    for (const gname of groups) {
      const groupEl = el('div', { class: 'nav-group' });
      groupEl.appendChild(el('div', { class: 'nav-label', text: gname }));
      for (const t of byGroup.get(gname)) {
        const item = el('button', { class: 'nav-item', dataset: { tab: t.id }, onClick: () => this.setTab(t.id) });
        item.innerHTML = `${ic(t.icon, 15)}<span class="txt">${t.label}</span>`;
        if (t.id === 'alarms') {
          const b = el('span', { class: 'nav-badge zero', id: 'nav-alarm-badge', text: '0' });
          item.appendChild(b);
        } else if (t.id === 'equipment') {
          item.appendChild(el('span', { class: 'nav-badge zero', text: '0' }));
        }
        groupEl.appendChild(item);
      }
      this.sideNav.appendChild(groupEl);
    }
    this._layoutIcons = { pause: ic('pause', 16), play: ic('play', 16), stop: ic('stop', 16) };
  }

  tabs() {
    return [
      { id: 'overview', label: 'Overview', icon: 'grid', group: 'MONITOR' },
      { id: 'simulation', label: 'Simulation', icon: 'play', group: 'MONITOR' },
      { id: 'view', label: '3D View', icon: 'cube', group: 'MONITOR' },
      { id: 'equipment', label: 'Equipment', icon: 'equipment', group: 'MONITOR' },
      { id: 'sensors', label: 'Sensors', icon: 'sensor', group: 'MONITOR' },
      { id: 'operations', label: 'Operations', icon: 'sliders', group: 'CONTROL' },
      { id: 'spawn', label: this.getTabLabel('spawn'), icon: this.spawnIcon(), group: 'CONTROL' },
      { id: 'visibility', label: 'Visibility', icon: 'eye', group: 'SYSTEM' },
      { id: 'alarms', label: 'Alarms', icon: 'alert', group: 'SYSTEM' },
      { id: 'analytics', label: 'Analytics', icon: 'chart', group: 'SYSTEM' },
      { id: 'settings', label: 'Settings', icon: 'settings', group: 'SYSTEM' },
    ];
  }

  getTab(id) { return this.tabs().find(t => t.id === id); }
  getTabLabel(kind) {
    if (kind === 'spawn') {
      return { parking: 'Vehicle Spawning', water: 'Flow Scenarios', conveyor: 'Box Spawning', cold: 'Inventory', solar: 'Load Management' }[this.id] || 'Spawning';
    }
    return kind;
  }
  spawnIcon() {
    return { parking: 'vehicle', water: 'droplet', conveyor: 'package', cold: 'inventory', solar: 'bolt' }[this.id] || 'package';
  }

  /* =========================================================
     Tabs & panel rendering
     ========================================================= */
  setTab(id, opts = {}) {
    const tab = this.getTab(id);
    if (!tab) return;
    if (!opts.initial && this.selectedId) {
      this.selectedId = null;
      this.inspectorSpec = null;
      this.scene?.clearSelection();
    }
    this.activeTab = id;
    this.shell?.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === id));
    if (this.shell && !opts.initial) this.renderPanel();
    else if (this.shell && opts.initial) this.renderPanel();
    this.saveSoon();
  }

  renderPanel() {
    if (!this.panelBody) return;
    this._disposePanelCharts();
    this.panelBindings = [];
    this.panelBody.scrollTop = 0;
    const tab = this.getTab(this.activeTab) || this.tabs()[0];
    this.panelTitle.textContent = tab.label;
    this.panelSub.textContent = this.panelSubtitle(tab.id);
    this.panelHeadActions.innerHTML = '';
    ui.clear(this.panelBody);
    switch (tab.id) {
      case 'overview': this.renderOverview(this.panelBody); break;
      case 'simulation': this.renderSimulation(this.panelBody); break;
      case 'view': this.renderView(this.panelBody); break;
      case 'equipment': this.renderEquipment(this.panelBody); break;
      case 'sensors': this.renderSensors(this.panelBody); break;
      case 'operations': {
        this.panelBody.appendChild(this.operationsHeader());
        const wrap = el('div');
        this.buildOperations(wrap);
        this.panelBody.appendChild(wrap);
        break;
      }
      case 'spawn': {
        const wrap = el('div');
        this.buildSpawning(wrap);
        this.panelBody.appendChild(wrap);
        break;
      }
      case 'visibility': this.renderVisibility(this.panelBody); break;
      case 'alarms': this.renderAlarms(this.panelBody); break;
      case 'analytics': this.renderAnalytics(this.panelBody); break;
      case 'settings': this.renderSettings(this.panelBody); break;
      default: this.panelBody.appendChild(el('div', { class: 'empty', text: 'Panel unavailable.' }));
    }
    this._collectBinds(this.panelBody);
    this._executePanelBinds();
    this._renderedAlarmVersion = this._alarmVersion;
  }

  panelSubtitle(id) {
    const map = {
      overview: 'Facility telemetry & operational status',
      simulation: 'Global simulation control center',
      view: 'Interactive 3D environment controls',
      equipment: 'Connected machinery & components',
      sensors: 'Live measurement channels & calibration',
      operations: 'Operational controls & automatic sequences',
      spawn: this.getTabLabel('spawn') + ' & scheduling',
      visibility: 'Structural & equipment layer manager',
      alarms: 'Active events, history & thresholds',
      analytics: 'Historical trends & performance statistics',
      settings: 'Facility configuration & data management',
    };
    return map[id] || '';
  }

  _collectBinds(root) {
    root.querySelectorAll('*').forEach(node => {
      if (typeof node._bind === 'function') this.panelBindings.push(node._bind);
    });
  }

  addPanelBind(fn) {
    this.panelBindings.push(fn);
    try { fn(); } catch (e) { console.warn(e); }
  }

  _executePanelBinds() {
    for (const fn of this.panelBindings) { try { fn(); } catch (e) { console.warn('binding failed', e); } }
  }

  _disposePanelCharts() {
    for (const c of this.panelCharts) { try { c.chart?.destroy?.(); } catch { /* ignore */ } }
    this.panelCharts = [];
  }

  registerPanelChart(chart, ids, opts = {}) {
    this.panelCharts.push({ chart, ids, opts });
    this._updateChart(chart, ids, opts);
    return chart;
  }

  _updateChart(chart, ids, opts = {}) {
    const defs = this.getAnalyticsDefs();
    const count = opts.count || 120;
    const series = ids.map(id => {
      const d = defs.find(x => x.id === id) || { label: id, color: '#36e2c2' };
      return { label: d.label, color: d.color || '#36e2c2', unit: d.unit, data: this.seriesData(id, count) };
    });
    if (chart.setSeries) chart.setSeries(series);
    else chart.update(series);
  }

  operationsHeader() {
    const wrap = el('div', { class: 'section' });
    const note = el('div', { class: 'notice' });
    note.innerHTML = `${ic('sliders', 13)}<span>Operational controls act on the live simulation engine. Changes are reflected immediately in the 3D environment and dashboards.</span>`;
    wrap.appendChild(note);
    const row = el('div', { class: 'btn-row' });
    row.append(
      button('Pause', { size: 'small', iconName: 'pause', onClick: () => this.pauseSimulation() }),
      button('Resume', { size: 'small', iconName: 'play', onClick: () => this.resumeSimulation() }),
      button('Simulation Center', { size: 'small', iconName: 'sliders', onClick: () => this.setTab('simulation') }),
    );
    wrap.appendChild(row);
    return wrap;
  }

  /* =========================================================
     Overview panel
     ========================================================= */
  renderOverview(body) {
    const hero = el('div', { class: 'section-card', style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' } });
    const icn = el('div', { style: { width: '36px', height: '36px', borderRadius: '9px', display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' } });
    icn.innerHTML = ic(this.meta.icon, 18);
    const txt = el('div', { style: { flex: 1, minWidth: 0 } }, el('div', { style: { fontSize: '11.5px', fontWeight: '650' }, text: this.meta.name }), el('div', { style: { fontSize: '8.5px', color: 'var(--muted)', marginTop: '2px' }, text: `${this.meta.code} · local simulation node` }));
    const stateWrap = el('div');
    this.addPanelBind(() => {
      const state = this.getRunState();
      stateWrap.innerHTML = '';
      stateWrap.appendChild(badge(state, state === 'RUNNING' ? 'ok' : state === 'PAUSED' ? 'warn' : 'muted'));
    });
    hero.append(icn, txt, stateWrap);
    body.appendChild(hero);

    const metricsWrap = el('div', { class: 'metric-grid three', style: { marginBottom: '12px' } });
    const metrics = this.getOverviewMetrics();
    for (const m of metrics) {
      const node = ui.metric(m);
      metricsWrap.appendChild(node);
    }
    body.appendChild(metricsWrap);

    // primary trend
    const chartWrap = el('div', { class: 'section' });
    chartWrap.appendChild(el('div', { class: 'section-title' }, ic('chart', 12), 'Primary Trend', el('span', { class: 'side', text: 'LIVE HISTORY' })));
    const primary = this.getPrimarySeries();
    const chart = new ui.LineChart({ height: 128, unit: primary.unit, series: [] });
    chartWrap.appendChild(chart.wrap);
    this.panelCharts.push({ chart, ids: primary.ids, opts: { count: 90 } });
    this._updateChart(chart, primary.ids, { count: 90 });
    const axis = el('div', { class: 'axis-note' }, el('span', { text: `${this.getRunState()} · ${this.speed}x` }), el('span', { text: '2 s sample' }));
    chartWrap.appendChild(axis);
    this.addPanelBind(() => { axis.firstChild.textContent = `${this.getRunState()} · ${this.speed}x`; });
    body.appendChild(chartWrap);

    // alarms
    const alarmSection = el('div', { class: 'section' });
    const alarmHead = el('div', { class: 'section-title' }, ic('alert', 12), 'Active Alarms', el('span', { class: 'side' }));
    alarmSection.appendChild(alarmHead);
    const alarmBox = el('div', { class: 'section-card' });
    alarmSection.appendChild(alarmBox);
    this.addPanelBind(() => {
      const active = this.getActiveAlarms();
      alarmHead.querySelector('.side').textContent = `${active.length} ACTIVE`;
      if (!active.length) {
        if (alarmBox.dataset.state !== 'none') {
          alarmBox.dataset.state = 'none';
          alarmBox.dataset.sig = '';
          ui.mount(alarmBox, el('div', { class: 'empty', style: { padding: '12px 4px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' } }, (() => { const d = el('span', { class: 'dot-status live' }); return d; })(), 'All monitored conditions nominal'));
        }
        return;
      }
      const sig = active.map(a => a.rid).join('|');
      if (alarmBox.dataset.sig === sig) return;
      alarmBox.dataset.sig = sig;
      alarmBox.dataset.state = 'active';
      ui.clear(alarmBox);
      const frag = document.createDocumentFragment();
      for (const a of active.slice(0, 3)) {
        const item = el('div', { class: 'alarm-banner', style: { marginBottom: '6px' } });
        const aic = el('div', { class: 'ic' }); aic.innerHTML = ic(a.severity === 'critical' ? 'alert' : 'warning', 15);
        const tt = el('div', { class: 'tt' }, el('b', { text: a.title }), el('span', { text: a.message }));
        item.append(aic, tt);
        item.addEventListener('click', () => this.setTab('alarms'));
        frag.appendChild(item);
      }
      if (active.length > 3) frag.appendChild(el('div', { class: 'help', style: { textAlign: 'center', cursor: 'pointer' }, text: `+${active.length - 3} more active alarms`, onClick: () => this.setTab('alarms') }));
      ui.mount(alarmBox, frag);
    });
    body.appendChild(alarmSection);

    // events
    const evSection = el('div', { class: 'section' });
    evSection.appendChild(el('div', { class: 'section-title' }, ic('timeline', 12), 'Recent Activity', el('span', { class: 'side', text: 'EVENT LOG' })));
    const evBox = el('div', { class: 'section-card', style: { padding: '4px 10px' } });
    evSection.appendChild(evBox);
    let lastCount = -1;
    this.addPanelBind(() => {
      if (lastCount === this.events.length && !this._eventDirty) return;
      lastCount = this.events.length; this._eventDirty = false;
      ui.clear(evBox);
      if (!this.events.length) { evBox.appendChild(el('div', { class: 'empty', text: 'No events recorded yet.' })); return; }
      for (const ev of this.events.slice(0, 5)) {
        const row = el('div', { class: 'kv-row', style: { minHeight: '30px' } });
        row.append(el('span', { class: 'k', style: { flex: 1, minWidth: 0 } }, ui.statusDot(ev.tone === 'danger' ? 'danger' : ev.tone === 'warn' ? 'warn' : 'live'), el('span', { text: ev.title, style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } })), el('span', { class: 'v', text: ev.time }));
        evBox.appendChild(row);
      }
    });
    body.appendChild(evSection);

    const quick = this.getQuickActions();
    if (quick.length) {
      const sec = el('div', { class: 'section' });
      sec.appendChild(el('div', { class: 'section-title' }, ic('bolt', 12), 'Quick Actions'));
      const row = el('div', { class: 'btn-row' });
      quick.forEach(a => row.appendChild(button(a.label, { size: 'small', variant: a.variant, iconName: a.icon, onClick: a.onClick })));
      sec.appendChild(row);
      body.appendChild(sec);
    }
    this.overviewExtra?.(body);
    if (this.shouldShowStarterNotice?.()) {
      body.appendChild(ui.notice('Use the 3D viewport objects or the side navigation to operate this facility. All controls are connected to the live engine.', 'info'));
    }
  }

  getOverviewMetrics() {
    return [
      { label: 'Sensors Online', bind: () => { const on = this.sensorDefs.filter(s => this.getSensor(s.id)?.enabled).length; return { value: `${on}/${this.sensorDefs.length}`, tone: on === this.sensorDefs.length ? 'ok' : 'warn' }; }, iconName: 'sensor', tone: 'ok', sub: 'Live channels' },
      { label: 'Equipment Online', bind: () => { const on = this.equipment.filter(e => ['ok', 'muted'].includes(ui.statusTone(e.status()))).length; return { value: `${on}/${this.equipment.length || 0}`, tone: 'ok' }; }, iconName: 'equipment', sub: 'Connected assets' },
      { label: 'Active Alarms', bind: () => ({ value: String(this.getActiveAlarms().length), tone: this.getActiveAlarms().length ? 'danger' : 'ok' }), iconName: 'alert', sub: 'Unacknowledged' },
      { label: 'Simulation', bind: () => ({ value: this.getRunState(), tone: this.getRunState() === 'RUNNING' ? 'ok' : 'warn' }), iconName: 'activity', sub: 'Engine status' },
      { label: 'Sim Speed', bind: () => `${this.speed}x`, iconName: 'clock', sub: 'Time acceleration' },
      { label: 'Mode', bind: () => this.manualMode ? 'MANUAL' : 'AUTO', iconName: 'sliders', sub: 'Control mode' },
    ];
  }

  getPrimarySeries() {
    const defs = this.getAnalyticsDefs();
    let ids = defs.slice(0, 2).map(d => d.id);
    if (this.primarySeriesIds) ids = this.primarySeriesIds();
    return { ids, unit: defs.find(d => d.id === ids[0])?.unit || '' };
  }

  getQuickActions() { return []; }

  /* =========================================================
     Simulation panel
     ========================================================= */
  renderSimulation(body) {
    const stateCard = el('div', { class: 'section-card', style: { display: 'flex', alignItems: 'center', gap: '12px' } });
    const stateInfo = el('div', { style: { flex: 1 } }, el('div', { class: 'section-title', style: { margin: '0 0 4px' }, text: 'ENGINE STATE' }), el('div', { style: { fontFamily: 'var(--mono)', fontSize: '22px', fontWeight: '500' }, text: 'RUNNING' }));
    const stateDot = el('span', { class: 'dot-status live', style: { width: '10px', height: '10px' } });
    this.addPanelBind(() => {
      const state = this.getRunState();
      stateInfo.lastChild.textContent = state;
      stateInfo.lastChild.style.color = state === 'RUNNING' ? 'var(--ok)' : state === 'PAUSED' ? 'var(--warn)' : 'var(--muted)';
      stateDot.className = `dot-status ${state === 'RUNNING' ? 'live' : state === 'PAUSED' ? 'warn' : ''}`;
    });
    const clock = el('div', { style: { textAlign: 'right' } }, el('div', { class: 'section-title', style: { margin: '0 0 4px' }, text: 'SIM CLOCK' }), el('div', { class: 'mono', style: { fontSize: '18px' }, text: '--:--:--' }));
    this.addPanelBind(() => { clock.lastChild.textContent = ui.fmtTime(this.simTime); });
    stateCard.append(stateDot, stateInfo, clock);
    body.appendChild(stateCard);

    const controls = el('div', { class: 'section' });
    controls.appendChild(el('div', { class: 'section-title' }, ic('play', 12), 'Global Controls'));
    const grid = el('div', { class: 'btn-row' });
    grid.append(
      button('Start', { size: 'small', variant: 'subtle', iconName: 'play', onClick: () => this.startSimulation() }),
      button('Pause', { size: 'small', iconName: 'pause', onClick: () => this.pauseSimulation() }),
      button('Resume', { size: 'small', iconName: 'play', onClick: () => this.resumeSimulation() }),
      button('Stop', { size: 'small', variant: 'warn', iconName: 'stop', onClick: () => this.stopSimulation() }),
      button('Restart', { size: 'small', iconName: 'restart', onClick: () => this.restartSimulation() }),
      button('Reset Infrastructure', { size: 'small', variant: 'danger', iconName: 'reset', onClick: () => this.resetInfrastructure() }),
    );
    controls.appendChild(grid);
    body.appendChild(controls);

    const speedSec = el('div', { class: 'section' });
    speedSec.appendChild(el('div', { class: 'section-title' }, ic('clock', 12), 'Simulation Speed', el('span', { class: 'side', text: 'TIME ACCELERATION' })));
    const speeds = el('div', { class: 'seg', style: { marginBottom: '7px' } });
    [0.25, 0.5, 1, 2, 5, 10].forEach(v => {
      const b = el('button', { class: this.speed === v ? 'active' : '', text: `${v}x`, onClick: () => { this.setSpeed(v); this.renderPanel(); } });
      speeds.appendChild(b);
    });
    speedSec.appendChild(speeds);
    const custom = el('div', { class: 'input-row' });
    const customInput = el('input', { class: 'number-input', type: 'number', min: .1, max: 100, step: .1, value: this.speed, placeholder: 'Custom speed' });
    const applyBtn = button('Apply Custom', { size: 'small', onClick: () => { const v = Math.max(.05, Math.min(100, +customInput.value || 1)); this.setSpeed(v); this.renderPanel(); } });
    custom.append(customInput, applyBtn);
    speedSec.appendChild(custom);
    speedSec.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Speed affects spawning, transport, temperature, water level, energy flow, pump cycles and alarm timers.' }));
    body.appendChild(speedSec);

    const modeSec = el('div', { class: 'section' });
    modeSec.appendChild(el('div', { class: 'section-title' }, ic('sliders', 12), 'Control Mode'));
    const modeRow = el('div', { class: 'seg' });
    const autoBtn = el('button', { class: !this.manualMode ? 'active' : '', text: 'Automatic', onClick: () => { this.setManual(false); this.renderPanel(); } });
    const manualBtn = el('button', { class: this.manualMode ? 'active' : '', text: 'Manual', onClick: () => { this.setManual(true); this.renderPanel(); } });
    modeRow.append(autoBtn, manualBtn);
    modeSec.appendChild(modeRow);
    modeSec.appendChild(el('div', { class: 'help', style: { marginTop: '7px' }, text: 'Automatic mode runs schedules and regulation loops. Manual mode suspends automation and leaves equipment under operator control.' }));
    body.appendChild(modeSec);

    const timeSec = el('div', { class: 'section' });
    timeSec.appendChild(el('div', { class: 'section-title' }, ic('clock', 12), 'Time Management'));
    const timeRow = el('div', { class: 'btn-row' });
    timeRow.append(
      button('Synchronize to Local Time', { size: 'small', iconName: 'refresh', onClick: () => this.syncTime() }),
      button('Advance 1 Hour', { size: 'small', iconName: 'chevronRight', onClick: () => { this.simTime += 3600; this.logEvent('Clock advanced', 'Simulation time advanced by 1 hour.', 'info'); this.refreshLive(); } }),
      button('Reset Clock', { size: 'small', iconName: 'reset', onClick: () => { this.simTime = 8 * 3600; this.logEvent('Clock reset', 'Simulation clock reset to 08:00.', 'info'); this.refreshLive(); } }),
    );
    timeSec.appendChild(timeRow);
    body.appendChild(timeSec);

    const configSec = el('div', { class: 'section' });
    configSec.appendChild(el('div', { class: 'section-title' }, ic('save', 12), 'Configuration'));
    const saveRow = el('div', { class: 'btn-row' });
    saveRow.append(
      button('Save Current Configuration', { size: 'small', variant: 'subtle', iconName: 'save', onClick: () => this.saveConfig(true) }),
      button('Load Saved Configuration', { size: 'small', iconName: 'upload', onClick: () => this.loadSavedConfiguration() }),
      button('Restart Simulation', { size: 'small', iconName: 'restart', onClick: () => this.restartSimulation() }),
    );
    configSec.appendChild(saveRow);
    configSec.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Configurations include schedules, thresholds, calibration, equipment settings, camera and visibility state.' }));
    body.appendChild(configSec);
  }

  /* =========================================================
     ￼3D View panel
     ========================================================= */
  renderView(body) {
    const camSec = el('div', { class: 'section' });
    camSec.appendChild(el('div', { class: 'section-title' }, ic('camera', 12), 'Camera'));
    const grid = el('div', { class: 'btn-row' });
    CAMERA_PRESETS.forEach(p => {
      grid.appendChild(button(p.label, { size: 'small', iconName: p.icon, onClick: () => this.scene.setView(p.id) }));
    });
    grid.appendChild(button('Fit Entire Infrastructure', { size: 'small', iconName: 'fit', onClick: () => this.scene.fitAll(1.25) }));
    grid.appendChild(button('Fullscreen 3D', { size: 'small', iconName: 'maximize', onClick: () => this.toggleFocusMode() }));
    camSec.appendChild(grid);
    camSec.appendChild(el('div', { class: 'help', style: { marginTop: '8px' }, text: 'Drag with the left mouse button to orbit, right mouse button to pan, scroll to zoom. Double-click any object to focus the camera. Use WASD-free free-orbit navigation; the camera collision system prevents clipping through walls.' }));
    body.appendChild(camSec);

    const visSec = el('div', { class: 'section' });
    visSec.appendChild(el('div', { class: 'section-title' }, ic('eye', 12), 'Quick Visibility'));
    const vrow = el('div', { class: 'btn-row' });
    vrow.append(
      button('Hide Roof', { size: 'small', iconName: 'layers', onClick: () => this.quickToggleRoof(true) }),
      button('Hide Walls', { size: 'small', iconName: 'eyeOff', onClick: () => this.hideCategoryIds(['walls', 'interior-walls', 'partitions']) }),
      button('Show All', { size: 'small', iconName: 'eye', onClick: () => this.showAllCategories() }),
      button('X-Ray', { size: 'small', iconName: 'xray', onClick: () => this.toggleXray() }),
      button('Equipment Only', { size: 'small', iconName: 'equipment', onClick: () => this.equipmentOnly() }),
    );
    visSec.appendChild(vrow);
    body.appendChild(visSec);

    const labelSec = el('div', { class: 'section' });
    labelSec.appendChild(el('div', { class: 'section-title' }, ic('clipboard', 12), 'Scene Display'));
    labelSec.appendChild(ui.toggle({ label: 'Object labels', description: 'Show sensor and equipment identification labels in the scene.', value: this.labelsVisible, onChange: v => { this.labelsVisible = v; this.applyLabels(); this.saveSoon(); } }));
    body.appendChild(labelSec);

    const listSec = el('div', { class: 'section' });
    listSec.appendChild(el('div', { class: 'section-title' }, ic('cube', 12), 'Interactive Object Directory', el('span', { class: 'side', text: `${this.objects.size} OBJECTS` })));
    const search = el('input', { class: 'input', placeholder: 'Filter objects…', style: { marginBottom: '7px' } });
    listSec.appendChild(search);
    const list = el('div', { class: 'equip-list' });
    const render = () => {
      const q = search.value.trim().toLowerCase();
      ui.clear(list);
      let n = 0;
      for (const obj of this.objects.values()) {
        if (q && !`${obj.label} ${obj.id} ${obj.kind}`.toLowerCase().includes(q)) continue;
        if (obj.kind === 'sensor' && n > 30) continue;
        n++;
        const row = el('button', { class: 'equip-row', onClick: () => this.selectObject(obj.id) });
        const icEl = el('div', { class: 'ic' }); icEl.innerHTML = ic(obj.iconName || (obj.kind === 'sensor' ? 'sensor' : 'equipment'), 14);
        row.append(icEl, el('div', { class: 'tt' }, el('b', { text: obj.label || obj.id }), el('span', { text: `${obj.kind} · ${obj.id}` })), el('span', { class: 'state', text: 'INSPECT' }));
        list.appendChild(row);
      }
      if (!n) list.appendChild(el('div', { class: 'empty', text: 'No matching objects.' }));
    };
    search.addEventListener('input', render);
    render();
    listSec.appendChild(list);
    body.appendChild(listSec);

    const stats = el('div', { class: 'section' });
    stats.appendChild(el('div', { class: 'section-title' }, ic('activity', 12), 'Renderer Diagnostics'));
    const kv = el('div', { class: 'kv-list' });
    kv.append(ui.kvRow('WebGL renderer', 'WebGL 2.0'));
    const fpsRow = ui.kvRow('Frame rate', '60 FPS', { bind: () => `${this.scene.fps.value} FPS` });
    const drawRow = ui.kvRow('Draw calls', '0', { bind: () => String(this.scene.fps.calls) });
    const triRow = ui.kvRow('Triangles', '0', { bind: () => ui.fmtInt(this.scene.fps.tris) });
    kv.append(fpsRow, drawRow, triRow, ui.kvRow('Visibility categories', String(this.scene.categoryOrder.length)));
    stats.appendChild(kv);
    body.appendChild(stats);

    const legend = this.getLegend();
    if (legend.length) {
      const sec = el('div', { class: 'section' });
      sec.appendChild(el('div', { class: 'section-title' }, ic('info', 12), 'Scene Legend'));
      const list2 = el('div', { class: 'kv-list' });
      for (const l of legend) {
        const row = el('div', { class: 'kv-row' });
        const dot = el('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: l.color, boxShadow: `0 0 7px ${l.color}`, marginRight: '6px' } });
        row.append(el('span', { class: 'k' }, dot, l.label), el('span', { class: 'v text', text: l.value || '' }));
        list2.appendChild(row);
      }
      sec.appendChild(list2);
      body.appendChild(sec);
    }
  }

  /* =========================================================
     Equipment panel
     ========================================================= */
  renderEquipment(body) {
    if (!this.equipment.length) {
      body.appendChild(el('div', { class: 'empty', text: 'No equipment registered for this facility.' }));
      return;
    }
    body.appendChild(ui.notice('Select an asset to open its control inspector. Status reflects the live simulation engine.'));
    const list = el('div', { class: 'equip-list' });
    for (const eq of this.equipment) {
      const row = el('button', { class: 'equip-row', onClick: () => {
        if (eq.objectId && this.objects.has(eq.objectId)) this.selectObject(eq.objectId);
        else toast(`${eq.name}: ${eq.detail()}`, { type: 'info', title: eq.name });
      } });
      const icEl = el('div', { class: 'ic' }); icEl.innerHTML = ic(eq.iconName || 'equipment', 14);
      const tt = el('div', { class: 'tt' }, el('b', { text: eq.name }), el('span', { text: `${eq.type || 'equipment'} · ${eq.id}` }));
      const state = el('span', { class: 'state', text: '—' });
      const chev = el('span', { class: 'chev' }); chev.innerHTML = ic('chevronRight', 12);
      row.append(icEl, tt, state, chev);
      this.addPanelBind(() => {
        const st = eq.status();
        state.textContent = st;
        state.className = `state ${eq.tone ? eq.tone() : ui.statusTone(st)}`;
      });
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  /* =========================================================
     Sensors panel
     ========================================================= */
  renderSensors(body) {
    body.appendChild(ui.notice('Sensor channels update continuously. Calibration, thresholds and manual overrides are available per channel.'));
    if (!this.sensorDefs.length) {
      body.appendChild(el('div', { class: 'empty', text: 'No sensors registered.' }));
      return;
    }
    for (const s of this.sensorDefs) {
      const card = el('div', { class: 'sensor-card' });
      const head = el('div', { class: 'sensor-head' });
      const icEl = el('div', { class: 'ic' }); icEl.innerHTML = ic(s.iconName || 'sensor', 13);
      const tt = el('div', { class: 'tt' }, el('b', { text: s.name }), el('span', { text: `${s.id} · ${s.enabled ? 'ACTIVE' : 'DISABLED'}` }));
      const reading = el('div', { class: 'reading' }, el('b', { text: '—' }), el('span', { text: s.unit }));
      head.append(icEl, tt, reading);
      const bar = ui.progressBar(0);
      const barWrap = el('div', { class: 'bar-wrap' }, bar, el('div', { class: 'range-labels' }, el('span', { text: `${ui.fmt(s.min, s.digits)} ${s.unit}` }), el('span', { text: `${ui.fmt(s.max, s.digits)} ${s.unit}` })));
      const foot = el('div', { class: 'sensor-footer' });
      const detailBtn = button('Configure', { size: 'small', variant: 'ghost', iconName: 'sliders' });
      const statusBadge = badge('OK', 'ok');
      const sw = el('button', { class: `switch ${s.enabled ? 'on' : ''}`, title: 'Enable / disable sensor', onClick: (e) => { e.stopPropagation(); this.setSensorEnabled(s.id, !s.enabled); renderSensorCards(); } });
      foot.append(detailBtn, statusBadge, sw);
      const detail = el('div', { class: 'sensor-detail' });
      const dCfg = this.sensorCfg(s.id);
      detail.append(
        el('div', { class: 'inline-pair', style: { marginBottom: '7px' } },
          ui.numberField({ label: 'Alarm low', unit: s.unit, min: s.min, max: s.max, step: .1, value: s.alarmLow, onChange: v => { s.alarmLow = v; dCfg.alarmLow = v; this.saveSoon(); renderSensorCards(); } }),
          ui.numberField({ label: 'Alarm high', unit: s.unit, min: s.min, max: s.max, step: .1, value: s.alarmHigh, onChange: v => { s.alarmHigh = v; dCfg.alarmHigh = v; this.saveSoon(); renderSensorCards(); } }),
        ),
        ui.slider({ label: 'Calibration offset', min: -10, max: 10, step: .1, value: s.calibration, unit: s.unit, onChange: v => { this.setSensorCalibration(s.id, v); } }),
        ui.toggle({ label: 'Manual override', description: 'Use a fixed value for commissioning tests.', value: s.manual !== null && s.manual !== undefined, onChange: v => { this.setSensorManual(s.id, v ? (this.sensorValue(s.id) ?? s.rawValue) : null); renderSensorCards(); } }),
      );
      if (s.manual !== null && s.manual !== undefined) {
        detail.appendChild(ui.numberField({ label: 'Override value', unit: s.unit, min: s.min, max: s.max, step: .1, value: s.manual, onChange: v => { this.setSensorManual(s.id, v); } }));
      }
      detail.appendChild(button('Reset to automatic', { size: 'small', variant: 'ghost', iconName: 'reset', onClick: () => { this.setSensorCalibration(s.id, 0); this.setSensorManual(s.id, null); renderSensorCards(); } }));
      detailBtn.addEventListener('click', () => {
        card.classList.toggle('open');
        const label = detailBtn.querySelector('span');
        if (label) label.textContent = card.classList.contains('open') ? 'Close' : 'Configure';
      });
      card.append(head, barWrap, foot, detail);
      this.addPanelBind(() => {
        const val = this.sensorValue(s.id);
        const st = this.sensorStatus(s.id);
        const digits = s.digits;
        reading.querySelector('b').textContent = val === null ? '—' : ui.fmt(val, digits);
        reading.querySelector('b').style.color = st === 'alarm' ? 'var(--danger)' : st === 'warn' ? 'var(--warn)' : 'var(--text)';
        tt.querySelector('span').textContent = `${s.id} · ${st.toUpperCase()}`;
        bar._set(val === null ? 0 : ((val - s.min) / (s.max - s.min)) * 100);
        bar.className = `progress ${st === 'alarm' ? 'danger' : st === 'warn' ? 'warn' : ''}`;
        statusBadge.className = `badge ${this.sensorTone(s.id)}`;
        statusBadge.lastChild.textContent = st.toUpperCase();
        sw.className = `switch ${s.enabled ? 'on' : ''}`;
      });
      body.appendChild(card);
    }
    const renderSensorCards = () => { this.renderPanel(); };
  }

  /* =========================================================
     Visibility panel
     ========================================================= */
  renderVisibility(body) {
    body.appendChild(ui.notice('Hiding components changes only their visual representation. Simulation, sensors and physical logic continue unchanged.'));
    const actions = el('div', { class: 'visibility-actions' });
    actions.append(
      button('Show All', { size: 'small', iconName: 'eye', onClick: () => { this.showAllCategories(); this.renderPanel(); } }),
      button('Hide All', { size: 'small', iconName: 'eyeOff', onClick: () => { this.scene.hideAll(); this.saveSoon(); this.renderPanel(); } }),
      button('Hide Roof', { size: 'small', iconName: 'layers', onClick: () => { this.hideCategoryIds(['roof', 'ceiling']); this.renderPanel(); } }),
      button('Hide Walls', { size: 'small', iconName: 'layers', onClick: () => { this.hideCategoryIds(['walls', 'interior-walls', 'partitions']); this.renderPanel(); } }),
      button('Hide Ceiling', { size: 'small', iconName: 'layers', onClick: () => { this.hideCategoryIds(['ceiling']); this.renderPanel(); } }),
      button('Hide Structural', { size: 'small', iconName: 'equipment', onClick: () => { this.scene.hideKind('structure'); this.saveSoon(); this.renderPanel(); } }),
      button('Equipment Only', { size: 'small', iconName: 'equipment', onClick: () => { this.equipmentOnly(); this.renderPanel(); } }),
      button('X-Ray Mode', { size: 'small', iconName: 'xray', onClick: () => { this.toggleXray(); this.renderPanel(); } }),
      button('Transparent Walls', { size: 'small', iconName: 'transparent', onClick: () => { this.toggleTransparentWalls(); this.renderPanel(); } }),
      button('Isolated Object', { size: 'small', iconName: 'isolate', onClick: () => { this.toggleIsolate(); this.renderPanel(); } }),
    );
    body.appendChild(actions);

    const groups = { structure: [], equipment: [] };
    for (const c of this.scene.categoryOrder) {
      (groups[c.kind] || groups.equipment).push(c);
    }
    const groupTitles = { structure: 'Structural Components', equipment: 'Infrastructure & Equipment' };
    for (const kind of ['structure', 'equipment']) {
      if (!groups[kind].length) continue;
      const sec = el('div', { class: 'section vis-group' });
      sec.appendChild(el('div', { class: 'section-title' }, ic(kind === 'structure' ? 'layers' : 'equipment', 12), groupTitles[kind], el('span', { class: 'side', text: `${groups[kind].filter(c => c.group.visible).length}/${groups[kind].length} VISIBLE` })));
      const list = el('div', { class: 'section-card', style: { padding: '4px 10px' } });
      for (const cat of groups[kind]) {
        const count = this._countMeshes(cat.group);
        const row = el('div', { class: 'vis-item' });
        const eye = el('button', { class: `eye ${cat.group.visible ? '' : 'off'}`, title: cat.group.visible ? 'Hide' : 'Show' });
        eye.innerHTML = ic(cat.group.visible ? 'eye' : 'eyeOff', 12);
        eye.addEventListener('click', () => {
          this.scene.setCategoryVisible(cat.id, !cat.group.visible);
          if (cat.id === 'roof' || cat.id === 'ceiling') this.quickRoofState = cat.group.visible;
          this.saveSoon(); this.renderPanel();
        });
        row.append(el('span', { class: 'tt', text: cat.label }), el('span', { class: 'cnt', text: String(count) }), eye);
        list.appendChild(row);
      }
      sec.appendChild(list);
      body.appendChild(sec);
    }
    if (this.viewFlags.xray) body.appendChild(ui.notice('X-Ray mode active — structural shells are transparent, equipment remains fully visible.', 'warn'));
    if (this.viewFlags.equipmentOnly) body.appendChild(ui.notice('Equipment Only mode active — structural layers hidden.', 'warn'));
  }

  _countMeshes(root) {
    let n = 0;
    root.traverse(o => { if (o.isMesh) n++; });
    return n;
  }

  showAllCategories() {
    this.scene.showAll();
    this.viewFlags.xray = false; this.viewFlags.equipmentOnly = false; this.viewFlags.isolate = false;
    this.shell?.querySelector('#cam-xray')?.classList.remove('active');
    this.saveSoon();
    this.refreshLive();
  }

  hideCategoryIds(ids) {
    for (const id of ids) if (this.scene.getCategory(id)) this.scene.setCategoryVisible(id, false);
    if (ids.includes('roof')) this.quickRoofState = false;
    this.saveSoon();
    this.refreshLive();
  }

  quickToggleRoof(forceHide = null) {
    const ids = ['roof', 'ceiling'];
    const existing = ids.map(id => this.scene.getCategory(id)).filter(Boolean);
    if (!existing.length) { toast('No roof or ceiling layer in this facility.', { type: 'info' }); return; }
    const visible = existing.some(c => c.group.visible);
    const hide = forceHide === true ? true : visible;
    for (const c of existing) this.scene.setCategoryVisible(c.id, !hide);
    this.quickRoofState = !hide;
    this.shell?.querySelector('#cam-roof')?.classList.toggle('active', hide);
    this.saveSoon();
    this.refreshLive();
  }

  toggleXray() {
    this.viewFlags.xray = !this.viewFlags.xray;
    if (this.viewFlags.xray) {
      this.scene.showAll();
      this.scene.setXray(true);
    } else this.scene.setXray(false);
    this.shell?.querySelector('#cam-xray')?.classList.toggle('active', this.viewFlags.xray);
    this.config.xray = this.viewFlags.xray;
    this.saveSoon();
    toast(this.viewFlags.xray ? 'X-Ray mode enabled.' : 'X-Ray mode disabled.', { type: 'info' });
    this.refreshLive();
  }

  toggleTransparentWalls() {
    this.viewFlags.transparentExplicit = !this.viewFlags.transparentExplicit;
    this.scene.setTransparentWalls(this.viewFlags.transparentExplicit);
    this.saveSoon();
  }

  equipmentOnly() {
    this.viewFlags.equipmentOnly = true;
    this.scene.hideKind('structure');
    this.scene.showKind('equipment');
    this.viewFlags.xray = false;
    this.shell?.querySelector('#cam-xray')?.classList.remove('active');
    this.saveSoon();
    this.refreshLive();
  }

  toggleIsolate() {
    if (!this.selectedId) {
      toast('Select an object in the 3D view first, then activate Isolated Object mode.', { type: 'warn' });
      return;
    }
    this.viewFlags.isolate = !this.viewFlags.isolate;
    if (this.viewFlags.isolate) {
      const obj = this.objects.get(this.selectedId);
      this.scene.isolateCategory(this._categoryForObject(obj));
    } else {
      this.scene.showAll();
    }
    this.saveSoon();
  }

  _categoryForObject(obj) {
    if (!obj) return null;
    let node = obj.root;
    while (node && node !== this.scene.world) {
      if (node.name?.startsWith('cat-')) return node.name.slice(4);
      node = node.parent;
    }
    return this.scene.categoryOrder[0]?.id || null;
  }

  applyInitialCamera() {
    this.scene.fitAll(this.meta.fitPadding ?? 1.3, true);
    this.scene.captureHome();
    const cam = this.config.camera;
    if (cam?.position?.length === 3 && cam?.target?.length === 3) {
      this.scene.camera.position.fromArray(cam.position);
      this.scene.controls.target.fromArray(cam.target);
      this.scene.controls.update();
    }
    this.quickRoofState = true;
  }

  restoreVisibility() {
    const v = this.config.visibility || {};
    for (const [id, visible] of Object.entries(v)) this.scene.setCategoryVisible(id, !!visible);
    if (this.config.labels === false) this.applyLabels();
    if (this.config.xray) { this.viewFlags.xray = true; this.scene.setXray(true); this.shell?.querySelector('#cam-xray')?.classList.add('active'); }
  }

  restoreLabels() { this.applyLabels(); }

  applyLabels() {
    this.scene.scene.traverse(o => { if (o.userData?.isLabel) o.visible = !!this.labelsVisible; });
  }

  /* =========================================================
     Alarms panel
     ========================================================= */
  renderAlarms(body) {
    const active = this.getActiveAlarms();
    const summary = el('div', { class: 'alarm-summary' });
    summary.append(
      ui.metric({ label: 'Active', value: String(active.length), tone: active.length ? 'danger' : 'ok', iconName: 'alert', compact: true }),
      ui.metric({ label: 'Critical', value: String(active.filter(a => a.severity === 'critical').length), tone: active.some(a => a.severity === 'critical') ? 'danger' : '', iconName: 'warning', compact: true }),
      ui.metric({ label: 'History', value: String(this.alarmHistory.length), iconName: 'timeline', compact: true }),
    );
    body.appendChild(summary);

    const topRow = el('div', { class: 'btn-row', style: { marginBottom: '10px' } });
    topRow.append(
      button('Acknowledge All', { size: 'small', variant: 'subtle', iconName: 'check', onClick: () => { this.acknowledgeAllAlarms(); this.renderPanel(); } }),
      button('Clear History', { size: 'small', variant: 'ghost', iconName: 'trash', onClick: async () => {
        if (this.alarmHistory.length === 0) { toast('No alarm history to clear.', { type: 'info' }); return; }
        const ok = await confirmDialog({ title: 'Clear alarm history?', message: 'Resolved alarm records for this facility will be removed.', confirmLabel: 'Clear History', danger: true });
        if (ok) { this.alarmHistory = []; this.saveSoon(); this.renderPanel(); }
      } }),
    );
    body.appendChild(topRow);

    const activeSec = el('div', { class: 'section' });
    activeSec.appendChild(el('div', { class: 'section-title' }, ic('alert', 12), 'Active Alarms'));
    const activeList = el('div', { class: 'section-card', style: { padding: '4px 10px' } });
    if (!active.length) activeList.appendChild(el('div', { class: 'empty', style: { padding: '16px 6px' }, text: 'No active alarms. All monitored conditions nominal.' }));
    else for (const a of active) {
      const item = el('div', { class: 'alarm-item' });
      const sev = el('span', { class: `sev ${a.severity === 'critical' ? 'critical' : ''}` });
      const tt = el('div', { class: 'tt' }, el('b', { text: a.title }), el('span', { text: a.message }));
      const tm = el('div', { class: 'tm', text: ui.fmtTime(a.raisedSim) });
      const ack = button('ACK', { size: 'small', variant: 'ghost', onClick: () => { this.acknowledgeAlarm(a.id); this.renderPanel(); } });
      item.append(sev, tt, tm, ack);
      activeList.appendChild(item);
    }
    activeSec.appendChild(activeList);
    body.appendChild(activeSec);

    const histSec = el('div', { class: 'section' });
    histSec.appendChild(el('div', { class: 'section-title' }, ic('timeline', 12), 'Alarm History'));
    const histList = el('div', { class: 'section-card', style: { padding: '4px 10px', maxHeight: '260px', overflowY: 'auto' } });
    if (!this.alarmHistory.length) histList.appendChild(el('div', { class: 'empty', style: { padding: '16px 6px' }, text: 'No resolved alarm records.' }));
    else for (const a of this.alarmHistory.slice(0, 30)) {
      const item = el('div', { class: 'alarm-item resolved' });
      const sev = el('span', { class: 'sev' });
      const tt = el('div', { class: 'tt' }, el('b', { text: a.title }), el('span', { text: a.message }));
      const tm = el('div', { class: 'tm', text: ui.fmtTime(a.raisedSim) });
      item.append(sev, tt, tm);
      histList.appendChild(item);
    }
    histSec.appendChild(histList);
    body.appendChild(histSec);

    const thSec = el('div', { class: 'section' });
    thSec.appendChild(el('div', { class: 'section-title' }, ic('sliders', 12), 'Alarm Thresholds & Notification', el('span', { class: 'side', text: 'FACILITY' })));
    const thCard = el('div', { class: 'section-card' });
    const thresholdRules = this.alarmRules.filter(r => r.thresholdKey);
    if (!thresholdRules.length) thCard.appendChild(el('div', { class: 'help', text: 'This facility uses fixed safety limits.' }));
    for (const r of thresholdRules) {
      const val = this.threshold(r.thresholdKey, r.defaultThreshold);
      const row = el('div', { class: 'threshold-row' });
      row.append(el('span', { class: 'tt', text: r.thresholdLabel || r.title }), ui.numberField({ min: r.thresholdMin ?? -Infinity, max: r.thresholdMax ?? Infinity, step: r.thresholdStep ?? 1, value: val, onChange: v => this.setThreshold(r.thresholdKey, v) }), el('span', { class: 'u', text: r.thresholdUnit || '' }));
      thCard.appendChild(row);
    }
    thCard.appendChild(el('div', { class: 'divider' }));
    const ruleToggles = el('div', { class: 'control-list' });
    for (const rule of this.alarmRules) {
      ruleToggles.appendChild(ui.toggle({
        label: `${rule.title} monitoring`,
        description: `Severity: ${(rule.severity || 'warning').toUpperCase()}`,
        value: this.config.alarmsEnabled?.[rule.id] !== false,
        onChange: v => {
          if (!this.config.alarmsEnabled) this.config.alarmsEnabled = {};
          this.config.alarmsEnabled[rule.id] = v;
          this.evaluateAlarms();
          this.saveSoon();
          this.refreshLive();
        },
      }));
    }
    thCard.appendChild(ruleToggles);
    thCard.appendChild(el('div', { class: 'divider' }));
    const notify = el('div', { class: 'btn-row' });
    notify.append(button('Test Alarm Tone', { size: 'small', iconName: 'alert', onClick: () => { this._initAudio(); this._beep(true); toast('Alarm notification test.', { type: 'warn' }); } }));
    thCard.appendChild(notify);
    thCard.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'Threshold changes take effect immediately. Notification tone can be disabled in Platform Settings.' }));
    thSec.appendChild(thCard);
    body.appendChild(thSec);
  }

  /* =========================================================
     Analytics panel
     ========================================================= */
  renderAnalytics(body) {
    const defs = this.getAnalyticsDefs();
    if (!defs.length) { body.appendChild(el('div', { class: 'empty', text: 'No historical channels available.' })); return; }
    const rangeSec = el('div', { class: 'section' });
    rangeSec.appendChild(el('div', { class: 'section-title' }, ic('clock', 12), 'History Range'));
    const seg = el('div', { class: 'seg' });
    [[300, '5 MIN'], [900, '15 MIN'], [1800, '30 MIN']].forEach(([v, l]) => {
      seg.appendChild(el('button', { class: this.range === v ? 'active' : '', text: l, onClick: () => { this.range = v; this.config.analyticsRange = v; this.saveSoon(); this.renderPanel(); } }));
    });
    rangeSec.appendChild(seg);
    body.appendChild(rangeSec);

    const chartSec = el('div', { class: 'section' });
    chartSec.appendChild(el('div', { class: 'section-title' }, ic('chart', 12), 'Historical Trends', el('span', { class: 'side', text: '2 s sampling' })));
    const ids = defs.slice(0, 4).map(d => d.id);
    const chart = new ui.LineChart({ height: 190, series: [] });
    chartSec.appendChild(chart.wrap);
    this.panelCharts.push({ chart, ids, opts: { count: this._rangePoints() } });
    this._updateChart(chart, ids, { count: this._rangePoints() });
    chartSec.appendChild(el('div', { class: 'help', text: `Displaying ${ids.length} channels · ${Math.round(this._rangePoints() * 2 / 60)} min window` }));
    body.appendChild(chartSec);

    const statSec = el('div', { class: 'section' });
    statSec.appendChild(el('div', { class: 'section-title' }, ic('activity', 12), 'Channel Statistics'));
    const rows = el('div', { class: 'section-card', style: { padding: '4px 10px' } });
    for (const d of defs.slice(0, 8)) {
      const arr = this.seriesData(d.id, this._rangePoints()).filter(v => v !== null && Number.isFinite(v));
      const min = arr.length ? Math.min(...arr) : null, max = arr.length ? Math.max(...arr) : null;
      const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
      const row = el('div', { class: 'kv-row' });
      const color = el('span', { style: { width: '6px', height: '6px', borderRadius: '2px', background: d.color, marginRight: '6px' } });
      row.append(el('span', { class: 'k' }, color, d.label), el('span', { class: 'v', text: `${avg === null ? '—' : ui.fmt(avg, 1)} / ${max === null ? '—' : ui.fmt(max, 1)} ${d.unit}` }));
      rows.appendChild(row);
    }
    statSec.appendChild(rows);
    body.appendChild(statSec);

    const exportRow = el('div', { class: 'btn-row' });
    exportRow.append(
      button('Export History CSV', { size: 'small', iconName: 'download', onClick: () => this.exportHistoryCSV() }),
      button('Clear History', { size: 'small', variant: 'ghost', iconName: 'trash', onClick: async () => {
        const ok = await confirmDialog({ title: 'Clear history?', message: 'Collected telemetry history for this facility will be erased.', confirmLabel: 'Clear', danger: true });
        if (!ok) return;
        for (const k of Object.keys(this.history.series)) this.history.series[k] = [];
        this.history.times = [];
        this.saveHistoryNow();
        this.renderPanel();
        toast('History cleared.', { type: 'ok' });
      } }),
    );
    body.appendChild(exportRow);
    body.appendChild(el('div', { class: 'help', style: { marginTop: '6px' }, text: 'History is stored locally and restored when the facility is reopened.' }));
  }

  _rangePoints() { return Math.max(60, Math.round(this.range / 2)); }

  exportHistoryCSV() {
    const defs = this.getAnalyticsDefs();
    const count = this._rangePoints();
    const header = ['sim_time', ...defs.map(d => `${d.label} (${d.unit || ''})`)];
    const lines = [header.join(',')];
    const times = this.history.times.slice(-count);
    const series = defs.map(d => this.seriesData(d.id, count));
    for (let i = 0; i < times.length; i++) {
      lines.push([ui.fmtTime(times[i]), ...series.map(a => (a[i] ?? '')).join(',')].join(','));
    }
    ui.downloadText(`nexus-${this.id}-history.csv`, lines.join('\n'), 'text/csv');
    toast('History exported as CSV.', { type: 'ok' });
  }

  /* =========================================================
     Settings panel
     ========================================================= */
  renderSettings(body) {
    const settingsSec = el('div', { class: 'section' });
    settingsSec.appendChild(el('div', { class: 'section-title' }, ic('settings', 12), 'Facility Preferences'));
    settingsSec.appendChild(ui.toggle({ label: 'Auto-save configuration', description: 'Persist settings automatically after changes.', value: this.config.autoSave !== false, onChange: v => { this.config.autoSave = v; this.saveSoon(); } }));
    settingsSec.appendChild(ui.toggle({ label: 'Show object labels', description: 'Sensor and equipment callouts in the 3D scene.', value: this.labelsVisible, onChange: v => { this.labelsVisible = v; this.applyLabels(); this.saveSoon(); } }));
    settingsSec.appendChild(ui.numberField({ label: 'Panel width', unit: 'px', min: 330, max: 640, step: 1, value: this.panelEl.getBoundingClientRect().width, onChange: v => { this.shell.style.setProperty('--panel-w', `${v}px`); saveGlobal({ panelWidth: v }); this.scene.resize(); } }));
    settingsSec.appendChild(ui.selectField({ label: 'Render quality', options: [
      { value: 'performance', label: 'Performance · 1.0x' }, { value: 'balanced', label: 'Balanced · 1.25x' }, { value: 'high', label: 'High · 1.65x' },
    ], value: this.config.renderScale || 'balanced', onChange: v => {
      const pr = v === 'performance' ? 1 : v === 'high' ? Math.min(2, window.devicePixelRatio || 1.65) : Math.min(1.35, window.devicePixelRatio || 1.25);
      this.scene.renderer.setPixelRatio(pr);
      this.scene.resize();
      this.config.renderScale = v;
      this.saveSoon();
    } }));

    /* --- Experience Mode --- */
    const expSec = el('div', { class: 'section' });
    expSec.appendChild(el('div', { class: 'section-title' }, ic('eye', 12), 'Experience Mode'));
    expSec.appendChild(ui.notice('Switch between monitoring and immersive first-person experience.'));
    const expRow = el('div', { class: 'btn-row' });
    const modes = [
      { id: 'monitor', label: 'Digital Twin Monitoring', icon: 'grid', desc: 'Professional SCADA oversight (Default)' },
    ];
    for (const m of modes) {
      const active = this.firstPersonMode === m.id || (!this.firstPersonMode && m.id === 'monitor');
      expRow.appendChild(button(m.label, {
        size: 'small',
        variant: active ? 'subtle' : 'ghost',
        iconName: m.icon,
        onClick: async () => {
          if (active && m.id !== 'monitor') {
            this.exitFirstPersonToMonitoring?.();
          } else if (m.id === 'monitor') {
            this.exitFirstPersonToMonitoring?.();
          } else {
            await this.enterFirstPerson?.(m.id);
          }
          this.renderPanel();
        },
      }));
    }
    expSec.appendChild(expRow);
    body.appendChild(settingsSec);
    body.appendChild(expSec);

    const cfgSec = el('div', { class: 'section' });
    cfgSec.appendChild(el('div', { class: 'section-title' }, ic('save', 12), 'Configuration Management'));
    const row = el('div', { class: 'btn-row' });
    row.append(
      button('Save Configuration', { size: 'small', variant: 'subtle', iconName: 'save', onClick: () => this.saveConfig(true) }),
      button('Load Saved', { size: 'small', iconName: 'upload', onClick: () => this.loadSavedConfiguration() }),
      button('Export', { size: 'small', iconName: 'download', onClick: () => this.exportConfiguration() }),
      button('Import', { size: 'small', iconName: 'upload', onClick: () => this.importConfiguration() }),
      button('Reset Configuration', { size: 'small', variant: 'danger', iconName: 'reset', onClick: async () => {
        const ok = await confirmDialog({ title: 'Reset facility configuration?', message: 'Custom settings, thresholds, calibration, camera and visibility will return to factory defaults. Historical telemetry will also be erased.', confirmLabel: 'Reset Configuration', danger: true });
        if (ok) this.resetConfiguration();
      } }),
    );
    cfgSec.appendChild(row);
    cfgSec.appendChild(el('div', { class: 'help', style: { marginTop: '7px' }, text: 'Configurations are stored locally as structured JSON and survive application restarts.' }));
    body.appendChild(cfgSec);

    const dataSec = el('div', { class: 'section' });
    dataSec.appendChild(el('div', { class: 'section-title' }, ic('database', 12), 'Local Data'));
    dataSec.appendChild(el('div', { class: 'kv-list' },
      ui.kvRow('Facility ID', this.id, { text: true }),
      ui.kvRow('Sensor channels', String(this.sensorDefs.length)),
      ui.kvRow('Equipment assets', String(this.equipment.length)),
      ui.kvRow('History samples', String(this.history.times.length)),
      ui.kvRow('Last saved', this.lastSaveAt ? new Date(this.lastSaveAt).toLocaleTimeString('en-GB') : 'Not yet', { text: true }),
      ui.kvRow('Storage', storage.native ? 'Native JSON file' : 'Local profile storage', { text: true }),
    ));
    body.appendChild(dataSec);

    const infoSec = el('div', { class: 'section' });
    infoSec.appendChild(el('div', { class: 'section-title' }, ic('info', 12), 'Facility Information'));
    infoSec.appendChild(el('p', { class: 'section-desc', text: this.meta.description }));
    infoSec.appendChild(el('div', { class: 'kv-list' },
      ui.kvRow('Application', this.meta.name),
      ui.kvRow('Asset code', this.meta.code, { text: true }),
      ui.kvRow('Simulation engine', 'Independent local engine', { text: true }),
      ui.kvRow('Network dependency', 'None', { text: true }),
    ));
    body.appendChild(infoSec);

    const globalSec = el('div', { class: 'section' });
    globalSec.appendChild(el('div', { class: 'section-title' }, ic('sliders', 12), 'Platform'));
    const growRow = el('div', { class: 'btn-row' });
    growRow.append(
      button('Platform Settings', { size: 'small', iconName: 'settings', onClick: () => this.host.openSettings() }),
      button('Back to Main Menu', { size: 'small', iconName: 'back', onClick: () => { this.saveConfig(false); this.host.closeInfrastructure(); } }),
    );
    globalSec.appendChild(growRow);
    body.appendChild(globalSec);
  }

  /* =========================================================
     Inspector
     ========================================================= */
  renderInspector() {
    if (!this.inspectorSpec) return;
    this._disposeInspectorCharts();
    this.inspectorBindings = [];
    this.panelTitle.textContent = 'Object Inspector';
    this.panelSub.textContent = `${this.inspectorSpec.subtitle || this.selectedId || ''}`;
    this.panelHeadActions.innerHTML = '';
    const back = el('button', { class: 'panel-back', title: 'Back', onClick: () => this.closeInspector() });
    back.innerHTML = ic('back', 14);
    this.panelHeadActions.appendChild(back);
    this.panelBody.scrollTop = 0;
    ui.clear(this.panelBody);
    const spec = this.inspectorSpec;
    const obj = this.objects.get(this.selectedId);
    const head = el('div', { class: 'inspector-object' });
    const icEl = el('div', { class: 'ic' }); icEl.innerHTML = ic(spec.iconName || obj?.iconName || 'equipment', 19);
    const tt = el('div', { class: 'tt' }, el('h3', { text: spec.title || obj?.label || 'Object' }), el('div', { class: 'sub', text: spec.subtitle || spec.kind || '' }));
    const badgeWrap = el('div');
    const setBadge = () => {
      let b = spec.badge;
      if (typeof b === 'function') b = b();
      if (b) { badgeWrap.innerHTML = ''; badgeWrap.appendChild(badge(b.text || 'ONLINE', b.tone || 'ok')); }
    };
    setBadge();
    this.inspectorBindings.push(setBadge);
    head.append(icEl, tt, badgeWrap);
    this.panelBody.appendChild(head);

    if (spec.fields?.length) {
      const kv = el('div', { class: 'kv-list', style: { marginBottom: '10px' } });
      for (const f of spec.fields) {
        const row = el('div', { class: 'kv-row live-field' });
        row.append(el('span', { class: 'k', text: f.label }));
        const v = el('span', { class: `v ${f.text ? 'text' : ''}` });
        if (f.get) { v.textContent = '—'; this.inspectorBindings.push(() => { v.textContent = f.get(); }); }
        else if (f.value instanceof Node) v.appendChild(f.value);
        else v.textContent = f.value ?? '—';
        row.appendChild(v);
        kv.appendChild(row);
      }
      this.panelBody.appendChild(kv);
    }

    for (const sec of spec.sections || []) {
      const wrap = el('div', { class: 'section' });
      wrap.appendChild(el('div', { class: 'section-title' }, sec.iconName ? ic(sec.iconName, 12) : null, sec.title));
      if (sec.desc) wrap.appendChild(el('p', { class: 'section-desc', text: sec.desc }));
      const card = el('div', { class: 'section-card' });
      ui.renderControls(card, sec.controls || []);
      wrap.appendChild(card);
      this.panelBody.appendChild(wrap);
    }
    if (spec.note) this.panelBody.appendChild(el('div', { class: 'inspector-note', text: spec.note }));
    const actions = spec.actions || [];
    if (actions.length) {
      const row = el('div', { class: 'btn-row', style: { marginTop: '9px' } });
      actions.forEach(a => row.appendChild(button(a.label, { size: 'small', variant: a.variant, iconName: a.icon, onClick: a.onClick })));
      this.panelBody.appendChild(row);
    }
    if (spec.live) this.inspectorBindings.push(spec.live);
    this._executeInspectorBinds();
    this._renderedAlarmVersion = this._alarmVersion;
  }

  _updateInspectorBadge() {
    // handled by bindings; kept for API compatibility
  }

  refreshInspector() {
    if (this.selectedId && this.inspectorSpec) this.renderInspector();
  }

  _executeInspectorBinds() {
    for (const fn of this.inspectorBindings) { try { fn(); } catch (e) { console.warn('inspector binding failed', e); } }
  }

  _disposeInspectorCharts() {
    for (const c of this.inspectorCharts) { try { c.chart?.destroy?.(); } catch { /* ignore */ } }
    this.inspectorCharts = [];
  }

  /* =========================================================
     Simulation control
     ========================================================= */
  getRunState() {
    if (!this.running) return 'STOPPED';
    if (this.paused) return 'PAUSED';
    return 'RUNNING';
  }

  togglePause() {
    if (!this.running) this.startSimulation();
    else if (this.paused) this.resumeSimulation();
    else this.pauseSimulation();
  }

  startSimulation() {
    const wasStopped = !this.running;
    this.running = true;
    this.paused = false;
    this.stopped = false;
    if (wasStopped) {
      this.logEvent('Simulation started', 'Engine resumed operation.', 'ok');
      this.onSimulationStart?.();
      toast('Simulation started.', { type: 'ok' });
    }
    this.saveSoon();
    this.refreshLive();
    this._updateAllChrome();
  }

  pauseSimulation() {
    if (!this.running) return;
    this.paused = true;
    this.logEvent('Simulation paused', 'Engine clock frozen.', 'warn');
    toast('Simulation paused.', { type: 'info' });
    this.saveSoon();
    this.refreshLive();
    this._updateAllChrome();
  }

  resumeSimulation() {
    if (!this.running) { this.startSimulation(); return; }
    if (!this.paused) return;
    this.paused = false;
    this.logEvent('Simulation resumed', 'Engine clock running.', 'ok');
    toast('Simulation resumed.', { type: 'ok' });
    this.saveSoon();
    this.refreshLive();
    this._updateAllChrome();
  }

  stopSimulation() {
    this.running = false;
    this.paused = false;
    this.stopped = true;
    this.logEvent('Simulation stopped', 'All automatic processing halted.', 'warn');
    this.onSimulationStop?.();
    toast('Simulation stopped.', { type: 'warn' });
    this.saveSoon();
    this.refreshLive();
    this._updateAllChrome();
  }

  restartSimulation() {
    toast('Restarting simulation…', { type: 'info', duration: 1600 });
    this.saveConfig(false);
    this.host.reopenCurrent({ keepConfig: true });
  }

  async resetInfrastructure() {
    const ok = await confirmDialog({ title: 'Reset infrastructure?', message: 'Runtime state will return to its initial condition. Saved configuration and preferences are retained.', confirmLabel: 'Reset Infrastructure' });
    if (!ok) return;
    this.saveConfig(false);
    this.host.reopenCurrent({ keepConfig: true });
  }

  setSpeed(v) {
    this.speed = Math.max(.05, Math.min(100, +v || 1));
    this.config.simSpeed = this.speed;
    this.shell?.querySelectorAll('#side-speeds button').forEach(b => b.classList.toggle('active', +b.dataset.speed === this.speed));
    const sel = this.shell?.querySelector('#speed-select');
    if (sel) {
      sel.value = [0.25, 0.5, 1, 2, 5, 10].includes(this.speed) ? String(this.speed) : 'custom';
    }
    this.logEvent('Speed changed', `Simulation speed set to ${this.speed}x.`, 'info');
    this.saveSoon();
    this.refreshLive();
  }

  setManual(v) {
    this.manualMode = !!v;
    this.config.manual = this.manualMode;
    this.logEvent(this.manualMode ? 'Manual control enabled' : 'Automatic control enabled', this.manualMode ? 'Operator overrides are now active.' : 'Automatic regulation and schedules resumed.', this.manualMode ? 'warn' : 'ok');
    this.saveSoon();
    this.refreshLive();
  }

  syncTime() {
    const d = new Date();
    this.simTime = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    this.logEvent('Clock synchronised', 'Simulation clock set to local time.', 'info');
    this.refreshLive();
    toast('Simulation clock synchronised to local time.', { type: 'ok' });
  }

  openCustomSpeed() {
    const body = el('div', { class: 'control-list' });
    body.appendChild(ui.notice('Custom time acceleration from 0.05x to 100x. Higher values increase simulation update frequency but do not increase render frame rate.'));
    const field = ui.numberField({ label: 'Simulation speed', unit: 'x', min: .05, max: 100, step: .05, value: this.speed, onChange: v => { this.setSpeed(v); } });
    body.appendChild(field);
    const apply = button('Apply Speed', { variant: 'primary', onClick: () => { this.setSpeed(parseFloat(field.querySelector('input').value)); m.close(); } });
    const m = modal({ title: 'Custom Simulation Speed', subtitle: 'Time acceleration', body, footer: [button('Cancel', { onClick: () => m.close() }), apply] });
  }

  toggleTheme() {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    saveGlobal({ theme: next });
    const b = this.shell?.querySelector('#btn-theme');
    if (b) { b.innerHTML = ic(next === 'light' ? 'moon' : 'sun', 16); }
    this.saveSoon();
  }

  toggleFocusMode() {
    const ws = this.shell;
    ws.classList.toggle('focus-mode');
    const active = ws.classList.contains('focus-mode');
    const b = this.shell.querySelector('#btn-focus');
    if (b) b.innerHTML = ic(active ? 'minimize' : 'maximize', 16);
    const c = this.shell.querySelector('#cam-focus');
    if (c) { c.innerHTML = ic(active ? 'minimize' : 'maximize', 16); c.classList.toggle('active', active); }
    setTimeout(() => this.scene?.resize(), 320);
  }

  _onKey(e) {
    if (document.querySelector('.modal-backdrop')) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    switch (e.key.toLowerCase()) {
      case ' ': e.preventDefault(); this.togglePause(); break;
      case 'r': this.scene.setView('home'); break;
      case 'f': this.scene.fitAll(1.25); break;
      case 'v': this.toggleFocusMode(); break;
      case 'escape': if (this.selectedId) this.closeInspector(); break;
      case '1': this.setTab('overview'); break;
      case '2': this.setTab('simulation'); break;
      case '3': this.setTab('view'); break;
      case '4': this.setTab('equipment'); break;
      case '5': this.setTab('sensors'); break;
      case 'h': this.toggleXray(); break;
      default: break;
    }
  }

  /* =========================================================
     Loop & live refresh
     ========================================================= */
  _startLoop() {
    this._clock.start();
    const loop = () => {
      if (this._destroyed) return;
      this._raf = requestAnimationFrame(loop);
      const raw = Math.min(this._clock.getDelta(), 0.1);
      this.realTime += raw;
      if (this.running && !this.paused) {
        let scaled = raw * this.speed;
        const steps = Math.min(18, Math.max(1, Math.ceil(scaled / 0.04)));
        const dt = scaled / steps;
        for (let i = 0; i < steps; i++) {
          this.simTime += dt;
          this.simDt = dt;
          try { this.updateSimulation(dt); } catch (err) { console.error('simulation update failed', err); }
        }
        this._alarmAccum += raw;
        this._historyAccum += raw * this.speed;
        if (this._alarmAccum >= .4) { this._alarmAccum = 0; this.evaluateAlarms(); }
        if (this._historyAccum >= HISTORY_INTERVAL) {
          this._historyAccum = 0;
          this.recordHistoryPoint();
        }
        this._historySaveAccum += raw * this.speed;
        if (this._historySaveAccum > 30) { this._historySaveAccum = 0; this.saveHistoryNow(); }
      }
      // Update first-person experience
      this.updateFirstPerson(raw);
      this.scene.update(raw);
      this.scene.render();
      this._refreshAccum += raw;
      if (this._refreshAccum >= .2) {
        this._refreshAccum = 0;
        this.refreshLive();
      }
      this._chartAccum += raw;
      if (this._chartAccum >= 1) {
        this._chartAccum = 0;
        this._updateCharts();
      }
    };
    this._raf = requestAnimationFrame(loop);
  }

  updateSimulation(dt) { /* subclass */ }

  /* Deterministic time advance for automated verification and commissioning. */
  debugAdvance(seconds = 60, step = 0.05) {
    if (!this.scene) return;
    const total = Math.max(0, +seconds || 0);
    let elapsed = 0, historyAccum = 0;
    while (elapsed < total) {
      const dt = Math.min(step, total - elapsed);
      this.simTime += dt;
      this.simDt = dt;
      try { this.updateSimulation(dt); } catch (e) { console.error(e); }
      this.evaluateAlarms();
      elapsed += dt;
      historyAccum += dt;
      if (historyAccum >= HISTORY_INTERVAL) { historyAccum = 0; this.recordHistoryPoint(); }
    }
    this.refreshLive();
    this._updateCharts();
    return this.simTime;
  }

  _updateCharts() {
    for (const rec of this.panelCharts) this._updateChart(rec.chart, rec.ids, rec.opts);
    if (this.activeTab === 'analytics' && this._renderedAlarmVersion !== this._alarmVersion) { /* no-op */ }
  }

  refreshLive() {
    if (this._destroyed || !this.shell) return;
    for (const fn of this.panelBindings) { try { fn(); } catch { /* ignore */ } }
    for (const fn of this.inspectorBindings) { try { fn(); } catch { /* ignore */ } }
    this._updateAllChrome();
    this.updateSensorVisuals();
    if (this.activeTab === 'alarms' && this._renderedAlarmVersion !== this._alarmVersion) {
      if (!this.panelBody.contains(document.activeElement)) this.renderPanel();
    }
    if (this.activeTab === 'overview' && this._renderedAlarmVersion !== this._alarmVersion) {
      if (!this.panelBody.contains(document.activeElement)) { this._renderedAlarmVersion = this._alarmVersion; /* bindings handle alarms */ }
    }
  }

  _updateAllChrome() {
    const state = this.getRunState();
    const c = (sel) => this.shell.querySelector(sel);
    const set = (sel, text) => { const n = c(sel); if (n) n.textContent = text; };
    set('#top-clock', ui.fmtTime(this.simTime));
    set('#side-clock', ui.fmtTime(this.simTime));
    set('#side-state', state);
    set('#st-state', state);
    set('#st-clock', ui.fmtTime(this.simTime));
    set('#st-speed', `${ui.fmt(this.speed, 2)}x`);
    set('#st-mode', this.manualMode ? 'MANUAL' : 'AUTOMATIC');
    set('#vp-state', state);
    set('#vp-objects', String(this.objects.size));
    const sideDot = c('#side-state-dot');
    if (sideDot) sideDot.className = `dot-status ${state === 'RUNNING' ? 'live' : state === 'PAUSED' ? 'warn' : ''}`;
    const stDot = c('#st-dot');
    if (stDot) stDot.className = `dot-status ${state === 'RUNNING' ? 'live' : state === 'PAUSED' ? 'warn' : ''}`;
    const pauseBtn = c('#side-pause');
    if (pauseBtn) {
      const paused = this.paused || !this.running;
      pauseBtn.innerHTML = `${ic(paused ? 'play' : 'pause', 12)}<span>${paused ? (this.paused ? 'Resume' : 'Start') : 'Pause'}</span>`;
    }
    const topPause = c('#btn-pause');
    if (topPause) topPause.innerHTML = ic(this.paused || !this.running ? 'play' : 'pause', 16);
    const alarmCountEl = c('#top-alarm-count');
    if (alarmCountEl) {
      const n = this.getActiveAlarms().length;
      alarmCountEl.textContent = String(n);
      alarmCountEl.style.display = n ? 'grid' : 'none';
    }
    const navBadge = c('#nav-alarm-badge');
    if (navBadge) {
      const n = this.getActiveAlarms().length;
      navBadge.textContent = String(n);
      navBadge.classList.toggle('zero', !n);
    }
    const av = this.getActiveAlarms().length;
    const vpAlarm = c('#vp-alarm-pill');
    if (vpAlarm) vpAlarm.style.display = av ? 'inline-flex' : 'none';
    set('#vp-alarms', String(av));
    set('#st-event', this._lastEventText || 'All systems nominal');
    if (this.scene) {
      set('#st-fps', String(this.scene.fps.value));
      set('#st-draw', String(this.scene.fps.calls));
      set('#st-tris', ui.fmtInt(this.scene.fps.tris));
    }
    if (this.savePending) set('#st-save', 'PENDING');
    this._updateSaveIndicator(this.savePending ? 'PENDING' : 'SAVED');
  }

  _updateSaveIndicator(state) {
    const elNode = this.shell?.querySelector('#st-save');
    if (!elNode) return;
    elNode.textContent = state;
    elNode.style.color = state === 'PENDING' ? 'var(--warn)' : state === 'SAVED' ? 'var(--ok)' : '';
  }

  _updateAlarmBadges() {
    const n = this.getActiveAlarms().length;
    for (const sel of ['#top-alarm-count', '#nav-alarm-badge']) {
      const node = this.shell?.querySelector(sel);
      if (node) { node.textContent = String(n); node.classList.toggle('zero', !n); if (sel.includes('top')) node.style.display = n ? 'grid' : 'none'; }
    }
    const vp = this.shell?.querySelector('#vp-alarm-pill');
    if (vp) vp.style.display = n ? 'inline-flex' : 'none';
    const vpa = this.shell?.querySelector('#vp-alarms');
    if (vpa) vpa.textContent = String(n);
  }

  _showHoverTooltip(id, rec, x, y) {
    const tip = this.shell?.querySelector('#object-tip');
    if (!tip) return;
    if (!id || !rec) { tip.classList.remove('visible'); return; }
    const rect = this.viewportEl.getBoundingClientRect();
    tip.style.left = `${x - rect.left + 12}px`;
    tip.style.top = `${y - rect.top + 12}px`;
    tip.innerHTML = `${rec.label || id}<span>${rec.kind || 'object'}</span>`;
    tip.classList.add('visible');
  }

  logEvent(title, description = '', tone = 'info') {
    this.events.unshift({ title, description, tone, time: ui.fmtTime(this.simTime), ts: Date.now() });
    if (this.events.length > 60) this.events.pop();
    this._lastEventText = title;
    this._eventDirty = true;
  }

  getLegend() { return []; }

  /* =========================================================
     Optional hooks / defaults used by modules
     ========================================================= */
  buildWorld() { }
  defineSensors() { return []; }
  getObjectInspector(obj) { return this.defaultInspector(obj); }
  buildOperations(container) {
    container.appendChild(ui.notice('No specialised operations are registered for this facility.'));
  }
  buildSpawning(container) {
    container.appendChild(ui.notice('No spawning or inventory interface is registered for this facility.'));
  }

  /* =========================================================
     First-Person Experience Mode
     ========================================================= */

  /**
   * Initialize first-person experience for this infrastructure
   * Call this in buildWorld() after building the 3D scene
   */
  initFirstPerson(spawnPoint = null) {
    if (!this.scene) return;

    // Create first-person controls
    this.firstPersonControls = new FirstPersonControls(
      this.scene.camera,
      this.scene.renderer.domElement
    );

    // Configure collision meshes
    this._collectCollisionMeshes();
    this.firstPersonControls.setCollisionMeshes(this.collisionMeshes);

    // Set up interaction callbacks
    this.firstPersonControls.onInteractableEnter = (interactable) => {
    };
    this.firstPersonControls.onInteractableLeave = (interactable) => {
    };
    this.firstPersonControls.onInteract = (interactable) => {
      this._handleFirstPersonInteract(interactable);
    };
    this.firstPersonControls.onInspect = (interactable) => {
      this._handleFirstPersonInspect(interactable);
    };
    this.firstPersonControls.onPointerLock = (locked) => {
      if (locked) {
        this._hideMonitoringUI();
      } else if (!this._pointerLockExiting) {
        this._pointerLockExiting = true;
        this._showMonitoringUI();
        this.exitFirstPersonToMonitoring();
        this._pointerLockExiting = false;
      }
    };
    this.firstPersonControls.onPrimaryAction = () => {
      if (this.firstPersonControls.currentInteractable) {
        this.firstPersonControls.interact();
      }
    };
    this.firstPersonControls.onPauseMenu = () => {
      this._pointerLockExiting = true;
      this.firstPersonControls.exitPointerLock();
      this.firstPersonPauseMenu.show();
    };
    // Create pause menu
    this.firstPersonPauseMenu = new FirstPersonPauseMenu(
      this,
      () => {
        this._pointerLockExiting = false;
        setTimeout(() => {
          try {
            this.firstPersonControls?.requestPointerLock();
          } catch (e) {
            console.warn('Pointer lock re-acquisition blocked:', e.message);
          }
        }, 200);
      },
      () => this.exitFirstPersonToMonitoring(),
      () => this.exitFirstPersonToSelection()
    );
    this.firstPersonPauseMenu.create();

    // Register interactable objects
    this._registerFirstPersonInteractables();

    // Set spawn point
    if (spawnPoint) {
      this.firstPersonControls.teleportTo(
        spawnPoint.x, spawnPoint.y, spawnPoint.z,
        spawnPoint.yaw || 0, spawnPoint.pitch || 0
      );
    } else {
      this._findDefaultSpawnPoint();
    }

    // Orbit controls are disabled only when entering Play Mode (in enterFirstPerson)
    // Keep them enabled during Monitoring Mode
  }

  _collectCollisionMeshes() {
    this.collisionMeshes = [];
    this.scene.world.traverse((obj) => {
      if (obj.isMesh && obj.castShadow && obj.receiveShadow) {
        // Exclude small decorative objects
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        if (size.x > 0.2 || size.y > 0.2 || size.z > 0.2) {
          this.collisionMeshes.push(obj);
        }
      }
    });
  }

  _findDefaultSpawnPoint() {
    // Try to find a good spawn point near the control center or entrance
    let spawnPoint = { x: 0, y: 1.7, z: 0, yaw: 0, pitch: 0 };

    // Look for specific spawn markers or use infrastructure-specific logic
    if (this.firstPersonSpawnPoint) {
      spawnPoint = { ...this.firstPersonSpawnPoint };
    } else if (this.objects.has('control-centre') || this.objects.has('gatehouse')) {
      const obj = this.objects.get('control-centre') || this.objects.get('gatehouse');
      if (obj?.root) {
        const pos = new THREE.Vector3();
        obj.root.getWorldPosition(pos);
        spawnPoint = { x: pos.x, y: pos.y + 1.7, z: pos.z + 5, yaw: Math.PI, pitch: 0 };
      }
    }

    this.firstPersonControls.teleportTo(spawnPoint.x, spawnPoint.y, spawnPoint.z, spawnPoint.yaw, spawnPoint.pitch);
  }

  _registerFirstPersonInteractables() {
    // Register equipment and interactive objects
    for (const [id, obj] of this.objects) {
      if (obj.kind === 'sensor') continue; // Sensors handled separately
      if (obj.root) {
        const data = this._getInteractableData(obj);
        if (data) {
          this.firstPersonControls.addInteractable(id, obj.root, data);
        }
      }
    }
  }

  _getInteractableData(obj) {
    const kind = obj.kind;
    const baseData = {
      name: obj.label || obj.id,
      kind: obj.kind,
      description: obj.description,
    };

    // Define interactions based on object kind
    const interactions = {
      door: { action: 'Open/Close Door', prompt: '[E] Toggle Door', onInteract: () => this._toggleDoor(obj) },
      pump: { action: 'Operate Pump', prompt: '[E] Operate Pump', onInteract: () => this._operatePump(obj) },
      valve: { action: 'Operate Valve', prompt: '[E] Toggle Valve', onInteract: () => this._toggleValve(obj) },
      conveyor: { action: 'Control Conveyor', prompt: '[E] Control Conveyor', onInteract: () => this._controlConveyor(obj) },
      motor: { action: 'Operate Motor', prompt: '[E] Start/Stop Motor', onInteract: () => this._operateMotor(obj) },
      compressor: { action: 'Operate Compressor', prompt: '[E] Operate Compressor', onInteract: () => this._operateCompressor(obj) },
      barrier: { action: 'Operate Barrier', prompt: '[E] Toggle Barrier', onInteract: () => this._operateBarrier(obj) },
      vehicle: { action: 'Inspect Vehicle', prompt: '[E] Inspect Vehicle', onInteract: () => this._inspectVehicle(obj) },
      tank: { action: 'Inspect Tank', prompt: '[E] Inspect Tank', onInteract: () => this._inspectTank(obj) },
      panel: { action: 'Open Control Panel', prompt: '[E] Open Panel', onInteract: () => this._openPanel(obj) },
      cabinet: { action: 'Open Cabinet', prompt: '[E] Open Cabinet', onInteract: () => this._openCabinet(obj) },
      switch: { action: 'Toggle Switch', prompt: '[E] Toggle Switch', onInteract: () => this._toggleSwitch(obj) },
      button: { action: 'Press Button', prompt: '[E] Press Button', onInteract: () => this._pressButton(obj) },
      lever: { action: 'Operate Lever', prompt: '[E] Operate Lever', onInteract: () => this._operateLever(obj) },
    };

    const interaction = interactions[kind] || { action: 'Inspect', prompt: `[E] Inspect ${obj.label || obj.id}`, onInteract: () => this.selectObject(obj.id) };

    return {
      ...baseData,
      ...interaction,
      onInspect: () => this.selectObject(obj.id),
    };
  }

  _handleFirstPersonInteract(interactable) {
    if (interactable.data?.onInteract) {
      try {
        interactable.data.onInteract();
        this.logEvent('First-person interaction', `${interactable.data.action} on ${interactable.data.name}`, 'info');
      } catch (e) {
        console.error('Interaction error:', e);
      }
    } else {
      this.selectObject(interactable.id);
    }
  }

  _handleFirstPersonInspect(interactable) {
    this.selectObject(interactable.id);
  }

  // Interaction handlers (override in subclasses)
  _toggleDoor(obj) { this.selectObject(obj.id); }
  _operatePump(obj) { this.selectObject(obj.id); }
  _toggleValve(obj) { this.selectObject(obj.id); }
  _controlConveyor(obj) { this.selectObject(obj.id); }
  _operateMotor(obj) { this.selectObject(obj.id); }
  _operateCompressor(obj) { this.selectObject(obj.id); }
  _operateBarrier(obj) { this.selectObject(obj.id); }
  _inspectVehicle(obj) { this.selectObject(obj.id); }
  _inspectTank(obj) { this.selectObject(obj.id); }
  _openPanel(obj) { this.selectObject(obj.id); }
  _openCabinet(obj) { this.selectObject(obj.id); }
  _toggleSwitch(obj) { this.selectObject(obj.id); }
  _pressButton(obj) { this.selectObject(obj.id); }
  _operateLever(obj) { this.selectObject(obj.id); }

  /**
   * Enter first-person experience mode
   */
  async enterFirstPerson(mode = 'monitor', spawnPoint = null) {
    if (this.firstPersonMode) return; // Already in first-person

    // Only Digital Twin Monitoring Mode is supported
    const mappedMode = 'monitor';

    this.firstPersonMode = mappedMode;
    this.firstPersonEnabled = true;

    // Initialize if not already done
    if (!this.firstPersonControls) {
      this.initFirstPerson(spawnPoint);
    }

    // Pause simulation updates
    this._wasPaused = this.paused;
    this._wasRunning = this.running;

    // Hide monitoring UI
    this._hideMonitoringUI();

    // Request pointer lock after a short delay to let the DOM settle
    setTimeout(() => {
      try {
        this.firstPersonControls?.requestPointerLock();
      } catch (e) {
        console.warn('Pointer lock acquisition blocked:', e.message);
      }
    }, 300);

    this.logEvent('First-person mode entered', `Mode: ${mappedMode}`, 'ok');
  }

  /**
   * Exit first-person mode back to monitoring
   */
  exitFirstPersonToMonitoring() {
    if (!this.firstPersonMode) return;

    this.firstPersonMode = null;
    this.firstPersonEnabled = false;

    this.firstPersonControls?.exitPointerLock();
    this.firstPersonPauseMenu?.hide();

    // Re-enable OrbitControls fully
    if (this.scene) {
      const c = this.scene.controls;
      c.connect();
      c.enabled = true;
      c.enableZoom = true;
      c.enableRotate = true;
      c.enablePan = true;
      c.autoRotate = false;
      c.update();
    }

    this._showMonitoringUI();
    this.logEvent('First-person mode exited', 'Returned to monitoring mode', 'info');
  }

  /**
   * Exit first-person mode back to infrastructure selection
   */
  exitFirstPersonToSelection() {
    this.exitFirstPersonToMonitoring();
    this.saveConfig(false);
    this.host.closeInfrastructure();
  }

  _hideMonitoringUI() {
    if (this.shell) {
      this.shell.querySelector('.topbar')?.classList.add('fp-hidden');
      this.shell.querySelector('.sidebar')?.classList.add('fp-hidden');
      this.shell.querySelector('.sidepanel')?.classList.add('fp-hidden');
      this.shell.querySelector('.viewport-top')?.classList.add('fp-hidden');
      this.shell.querySelector('.camera-toolbar')?.classList.add('fp-hidden');
      this.shell.querySelector('.viewport-bottom')?.classList.add('fp-hidden');
      this.shell.querySelector('.statusbar')?.classList.add('fp-hidden');
    }
  }

  _showMonitoringUI() {
    if (this.shell) {
      this.shell.querySelector('.topbar')?.classList.remove('fp-hidden');
      this.shell.querySelector('.sidebar')?.classList.remove('fp-hidden');
      this.shell.querySelector('.sidepanel')?.classList.remove('fp-hidden');
      this.shell.querySelector('.viewport-top')?.classList.remove('fp-hidden');
      this.shell.querySelector('.camera-toolbar')?.classList.remove('fp-hidden');
      this.shell.querySelector('.viewport-bottom')?.classList.remove('fp-hidden');
      this.shell.querySelector('.statusbar')?.classList.remove('fp-hidden');
    }
  }

  /**
   * Update first-person systems (call in updateSimulation or render loop)
   */
  updateFirstPerson(delta) {
    if (!this.firstPersonEnabled || !this.firstPersonControls) return;

    this.firstPersonControls.update(delta);
  }

  /* =========================================================
     Scenario System Integration
     ========================================================= */

  /**
   * Register a scenario for this infrastructure
   */
  registerScenario(scenario) {
    this.scenarioManager.registerScenario(scenario);
    this.registeredScenarios[scenario.id] = scenario;
  }

  /**
   * Register multiple scenarios
   */
  registerScenarios(scenarios) {
    for (const s of scenarios) this.registerScenario(s);
  }

  /**
   * Initialize standard scenarios for this infrastructure
   */
  initStandardScenarios() {
    const scenarios = createStandardScenarios(this.id);
    this.registerScenarios(Object.values(scenarios));
  }

  /**
   * Start a scenario
   */
  async startScenario(scenarioId) {
    return this.scenarioManager.startScenario(scenarioId);
  }

  /**
   * Stop current scenario
   */
  stopScenario() {
    this.scenarioManager.stop();
  }

  /**
   * Restart current scenario
   */
  restartScenario() {
    this.scenarioManager.restart();
  }

  /**
   * Pause current scenario
   */
  pauseScenario() {
    this.scenarioManager.pause();
  }

  /**
   * Resume current scenario
   */
  resumeScenario() {
    this.scenarioManager.resume();
  }

  /**
   * Skip current scenario step
   */
  skipScenarioStep() {
    this.scenarioManager.skipStep();
  }

  /**
   * Go to previous scenario step
   */
  previousScenarioStep() {
    this.scenarioManager.previousStep();
  }

  /**
   * Get scenario manager state for saving
   */
  getScenarioState() {
    return this.scenarioManager.getState();
  }

  /**
   * Restore scenario manager state
   */
  restoreScenarioState(state) {
    this.scenarioManager.restoreState(state);
  }

  /* =========================================================
     Enhanced Camera Animation for Scenarios
     ========================================================= */

  /**
   * Animate camera to position (for scenario auto-camera)
   */
  animateCamera(position, target, duration = 2000) {
    if (!this.scene) return Promise.resolve();

    return new Promise((resolve) => {
      const startPos = this.scene.camera.position.clone();
      const startTarget = this.scene.controls.target.clone();
      const endPos = new THREE.Vector3(...position);
      const endTarget = target ? new THREE.Vector3(...target) : null;
      const startTime = performance.now();

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // easeInOutQuad

        this.scene.camera.position.lerpVectors(startPos, endPos, eased);
        if (endTarget) {
          this.scene.controls.target.lerpVectors(startTarget, endTarget, eased);
        }
        this.scene.controls.update();

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      animate();
    });
  }
}
