/* ============================================================
   TWINLINK — live bridge between TWIN OPS (the game) and the
   InfraVerse digital-twin program.

   The game no longer simulates its own "shadow" twins: it runs
   the REAL twin applications headless (via twinhost.js) — their
   own buildWorld geometry, their own engines, their own saved
   configurations. TwinLink wraps each real twin instance in a
   small adapter that exposes the exact interface the game
   consumes (telemetry, commands, persistence) by driving the
   twin's real public API — the same fields and methods the
   twin's own control room uses.

   Two sync channels remain:

   1. PERSISTENT — every twin persists through its own
      saveConfig() into `idt.<id>.config` (the program's store),
      so the simulator continues from the game-evolved state.

   2. LIVE — a BroadcastChannel bus (`idt-twinbus`): while a
      facility control room runs in a co-open browser tab,
      base.js publishes live snapshots and receives config
      patches from the game.
   ============================================================ */
import { storage } from '../core/storage.js';
import { createHeadlessTwin, createStubHost } from './twinhost.js';

export const BUS_CHANNEL = 'idt-twinbus';

export const FACILITIES = [
  { id: 'water',    name: 'Smart Water Tank',      code: 'H2O-02', accent: '#46a9ff', accentRgb: '70, 169, 255' },
  { id: 'solar',    name: 'Solar & Battery',       code: 'SOL-05', accent: '#a98bff', accentRgb: '169, 139, 255' },
  { id: 'conveyor', name: 'Conveyor Sorting Line', code: 'CVY-03', accent: '#ffb547', accentRgb: '246, 180, 75' },
  { id: 'cold',     name: 'Cold Storage Room',     code: 'CLD-04', accent: '#63b6ff', accentRgb: '99, 182, 255' },
  { id: 'parking',  name: 'Smart Parking Lot',     code: 'PKG-01', accent: '#36e2c2', accentRgb: '54, 226, 194' },
];

export function facilityMeta(id) { return FACILITIES.find(f => f.id === id) || null; }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function deepMerge(base, patch) {
  if (Array.isArray(base)) return Array.isArray(patch) ? patch.slice() : base.slice();
  if (base && typeof base === 'object' && patch && typeof patch === 'object' && !Array.isArray(patch)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) out[k] = k in base ? deepMerge(base[k], v) : v;
    return out;
  }
  return patch === undefined ? base : patch;
}

export function readTwinConfig(id) {
  const saved = storage.get(`idt.${id}.config`, null);
  return pruneNulls(saved && typeof saved === 'object' ? saved : {});
}

export function writeTwinConfigPatch(id, patch) {
  const current = readTwinConfig(id);
  const next = deepMerge(current, pruneNulls(patch));
  storage.set(`idt.${id}.config`, next);
  return next;
}

/* ---------------- live bus (mirrored by base.js) ---------------- */
export function createTwinBus() {
  let channel = null;
  try { channel = new BroadcastChannel(BUS_CHANNEL); } catch { channel = null; }
  const subs = new Set();
  const onMessage = (ev) => {
    const msg = ev?.data;
    if (!msg || typeof msg !== 'object') return;
    for (const fn of subs) { try { fn(msg); } catch (e) { console.warn('twinbus handler failed', e); } }
  };
  if (channel) channel.addEventListener('message', onMessage);
  return {
    kind: 'twinbus',
    publishSnapshot(snap) { if (channel) { try { channel.postMessage({ type: 'snapshot', ...snap }); } catch { /* ignore */ } } },
    sendCommand(facility, cmd, from) {
      const msg = { type: 'command', facility, cmd, from: from || 'game', t: Date.now() };
      if (channel) { try { channel.postMessage(msg); } catch { /* ignore */ } }
      return msg;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    close() { if (channel) { try { channel.close(); } catch { /* ignore */ } } subs.clear(); },
  };
}

/* ============================================================
   Adapters — one per facility, wrapping the REAL headless twin.
   Each exposes: inst, cfg, telemetry(), applyCommand(cmd),
   persistAll(), plus the concrete fields the game reads.
   ============================================================ */
class BaseAdapter {
  constructor(inst) { this.inst = inst; }
  get cfg() { return this.inst.config; }
  sensor(id) { try { return this.inst.sensorValue(id); } catch { return null; } }
  persistAll() { try { this.inst.saveConfig(false); } catch (e) { console.warn('twin persist failed', e); } }
  _save() {
    try {
      if (typeof this.inst.persistSettings === 'function') this.inst.persistSettings();  // runtime -> config sync
      else this.inst.saveSoon?.();
    } catch { /* ignore */ }
  }
  _log(title, desc, tone = 'info') { try { this.inst.logEvent(title, desc, tone); } catch { /* ignore */ } }
}

class WaterAdapter extends BaseAdapter {
  get level() { return this.inst.levelPercent(); }
  get leak() { return !!(this.inst.pump?.failed || this.inst.pump?.tripped); }
  get pumpOn() { return !!this.inst.pump?.on; }
  /* live (non-persisted) state changes a co-open twin must mirror */
  liveFor(cmd) {
    const i = this.inst;
    switch (cmd.type) {
      case 'set-leak':
        return cmd.value
          ? [{ type: 'twin-set', path: 'pump.failed', value: true, alarms: true }, { type: 'twin-set', path: 'pump.on', value: false }]
          : [{ type: 'twin-set', path: 'pump.failed', value: false }, { type: 'twin-set', path: 'pump.tripped', value: false }, { type: 'twin-call', method: 'restartPump', alarms: true }];
      case 'fill': return [{ type: 'twin-set', path: 'volumeL', value: i.volumeL, persist: false }];
      case 'set-pump': return [{ type: 'twin-call', method: 'setPump', args: [!!cmd.value], alarms: true }];
      case 'set-target-level': return [{ type: 'twin-set', path: 'targetLevel', value: i.targetLevel, persist: true }];
      case 'set-auto-fill': return [{ type: 'twin-set', path: 'autoFill', value: !!cmd.value, persist: true }];
      case 'set-auto-drain': return [{ type: 'twin-set', path: 'autoDrain', value: !!cmd.value, persist: true }];
      case 'set-demand': return [{ type: 'twin-set', path: 'demand.active', value: !!cmd.value, persist: true }];
    }
    return null;
  }
  get status() {
    const l = this.level, t = this.cfg.thresholds || {};
    if (this.leak) return 'danger';
    if (l < (t.criticalLevel ?? 8) || l >= (t.overflowLevel ?? 95)) return 'danger';
    if (l < (t.lowLevel ?? 20) || l >= (t.highLevel ?? 88)) return 'warn';
    return 'ok';
  }
  telemetry() {
    const p = this.inst.pump || {};
    return {
      primary: { label: 'Level', value: this.level, unit: '%', pct: this.level, digits: 1 },
      rows: [
        { label: 'Inlet flow', value: this.inst.inletFlow, unit: 'L/min', digits: 1 },
        { label: 'Outlet flow', value: this.inst.outletFlow, unit: 'L/min', digits: 1 },
        { label: 'Pump', value: p.failed ? 'FAILED' : p.on ? 'RUNNING' : 'STOPPED' },
        { label: 'Motor current', value: p.current, unit: 'A', digits: 1 },
        { label: 'Turbidity', value: this.inst.turbidity, unit: 'NTU', digits: 1 },
      ],
      status: this.status,
    };
  }
  applyCommand(cmd) {
    const i = this.inst;
    switch (cmd.type) {
      case 'set-target-level': i.targetLevel = clamp(+cmd.value, 1, 100); this._save(); return true;
      case 'set-auto-fill': i.autoFill = !!cmd.value; this._save(); return true;
      case 'set-auto-drain': i.autoDrain = !!cmd.value; this._save(); return true;
      case 'set-demand': i.demand.active = !!cmd.value; this._save(); return true;
      case 'set-pump': if (i.pump.failed || i.pump.tripped) i.restartPump(); else i.setPump(!!cmd.value); return true;
      case 'set-leak':
        if (cmd.value) {
          i.pump.failed = true; i.pump.on = false;
          this._log('Booster pump failure', 'P-01 tripped off line — water supply interrupted.', 'danger');
        } else {
          i.pump.failed = false; i.pump.tripped = false; i.pump.dryTimer = 0;
          i.restartPump();
          this._log('Pump restored', 'P-01 restart sequence initiated from the field.', 'ok');
        }
        i.evaluateAlarms();
        return true;
      case 'fill':
        i.volumeL = clamp(i.volumeL + i.capacityL * (cmd.value ?? 0.25), 0, i.capacityL);
        this._log('Emergency top-up', 'Field engineer dispatched a manual top-up.', 'ok');
        return true;
    }
    return false;
  }
  persistPatch() {
    return { initialLevel: +this.level.toFixed(1), targetLevel: this.inst.targetLevel, autoFill: !!this.inst.autoFill, autoDrain: !!this.inst.autoDrain, demand: { ...(this.inst.demand || {}) } };
  }
  persistAll() {
    // the water twin keeps its live level out of config — the game writes the
    // evolved operating point so the program resumes where the shift left off
    try { this.cfg.initialLevel = +this.level.toFixed(1); } catch { /* ignore */ }
    super.persistAll();
  }
}

class SolarAdapter extends BaseAdapter {
  get soc() { return this.inst.batterySoc; }
  get panelFault() { return !!this.cfg.controller?.failure; }
  get irradiance() { return this.inst.irradiance; }
  get charging() { return this.inst.chargeDC > 0.5; }
  get status() {
    const t = this.cfg.thresholds || {};
    if (this.soc < (t.batteryLow ?? 20)) return 'danger';
    if (this.panelFault || (this.inst.unservedLoad || 0) > 50) return 'warn';
    return 'ok';
  }
  telemetry() {
    return {
      primary: { label: 'Battery', value: this.soc, unit: '%', pct: this.soc, digits: 1 },
      rows: [
        { label: 'Solar output', value: (this.inst.solarPower || 0) / 1000, unit: 'kW', digits: 2 },
        { label: 'Site load', value: (this.inst.loadDemand || 0) / 1000, unit: 'kW', digits: 2 },
        { label: 'Battery current', value: this.inst.chargeCurrent, unit: 'A', digits: 1 },
        { label: 'Unserved load', value: this.inst.unservedLoad || 0, unit: 'W', digits: 0 },
        { label: 'Irradiance', value: this.inst.irradiance || 0, unit: 'W/m²', digits: 0 },
      ],
      status: this.status,
    };
  }
  applyCommand(cmd) {
    const i = this.inst;
    switch (cmd.type) {
      case 'set-load': {
        const l = (this.cfg.load?.loads || []).find(x => x.id === cmd.load);
        if (!l) return false;
        l.enabled = !!cmd.value;
        this._log(l.name, `Load ${l.enabled ? 'reconnected' : 'shed'} from the field panel.`, l.enabled ? 'ok' : 'warn');
        this._save();
        return true;
      }
      case 'set-load-watts': { const l = (this.cfg.load?.loads || []).find(x => x.id === cmd.load); if (l) { l.watts = clamp(+cmd.value || 0, 0, 4000); this._save(); } return true; }
      case 'set-cloud': this.cfg.sun.cloudCover = clamp(+cmd.value, 0, 1); this._save(); return true;
      case 'set-battery': this.cfg.battery.on = !!cmd.value; this._save(); return true;
      case 'set-panel-fault':
        this.cfg.controller.failure = !!cmd.value;
        this._log('Charge controller', cmd.value ? 'Controller fault injected — array offline.' : 'Controller restored from the field.', cmd.value ? 'danger' : 'ok');
        i.evaluateAlarms();
        return true;
    }
    return false;
  }
  liveFor(cmd) {
    switch (cmd.type) {
      case 'set-load': return [{ type: 'twin-set', path: `config.load.loads`, value: this.cfg.load.loads, persist: true }];
      case 'set-panel-fault': return [{ type: 'twin-set', path: 'config.controller.failure', value: !!cmd.value, alarms: true, persist: true }];
      case 'set-cloud': return [{ type: 'twin-set', path: 'config.sun.cloudCover', value: this.cfg.sun.cloudCover, persist: true }];
      case 'set-battery': return [{ type: 'twin-set', path: 'config.battery.on', value: !!cmd.value, persist: true }];
    }
    return null;
  }
  persistPatch() {
    return { battery: { ...(this.cfg.battery || {}), soc: +this.soc.toFixed(1) }, controller: { ...(this.cfg.controller || {}) }, load: { ...(this.cfg.load || {}) } };
  }
}

class ConveyorAdapter extends BaseAdapter {
  get speed() { const v = this.sensor('belt-speed'); return Number.isFinite(+v) ? +v : 0; }
  get jam() { return !!this.inst.jamActive; }
  get binAPct() { try { return this.inst.binPct('A'); } catch { return 0; } }
  get binBPct() { try { return this.inst.binPct('B'); } catch { return 0; } }
  get itemCount() { return this.inst.boxes?.length || 0; }
  get motorTemp() { const v = this.sensor('motor-temp'); return Number.isFinite(+v) ? +v : 30; }
  get status() {
    const t = this.cfg.thresholds || {};
    if (this.jam) return 'danger';
    if (this.binAPct >= (t.binFullPercent ?? 92) || this.binBPct >= (t.binFullPercent ?? 92)) return 'warn';
    if (this.motorTemp >= (t.motorOverheatTemp ?? 78)) return 'warn';
    return 'ok';
  }
  telemetry() {
    return {
      primary: { label: 'Belt speed', value: this.speed, unit: 'm/s', pct: (this.speed / 3) * 100, digits: 2 },
      rows: [
        { label: 'Motor', value: this.cfg.motorOn ? (this.speed > 0.02 ? 'RUNNING' : 'IDLE') : 'OFF' },
        { label: 'Cartons in transit', value: this.itemCount },
        { label: 'Bin A', value: this.binAPct, unit: '%', digits: 0 },
        { label: 'Bin B', value: this.binBPct, unit: '%', digits: 0 },
        { label: 'Motor temp', value: this.motorTemp, unit: '°C', digits: 1 },
      ],
      status: this.status,
    };
  }
  applyCommand(cmd) {
    const i = this.inst;
    switch (cmd.type) {
      case 'set-motor': this.cfg.motorOn = !!cmd.value; this._log('Drive motor', `Motor ${this.cfg.motorOn ? 'started' : 'stopped'} from the field panel.`, 'info'); this._save(); return true;
      case 'set-speed': this.cfg.beltSpeed = clamp(+cmd.value || 1.2, 0.2, 3); this._save(); return true;
      case 'set-jam':
        i.jamActive = !!cmd.value;
        i.jamCause = cmd.value ? 'Diverter obstruction (field event)' : '';
        if (cmd.value) this._log('Line jam', 'Cartons stalled at the diverter.', 'danger');
        else this._log('Jam cleared', 'Field engineer cleared the diverter obstruction.', 'ok');
        i.evaluateAlarms();
        return true;
      case 'empty-bin': try { i.clearBin(cmd.bin || 'A'); } catch { /* ignore */ } return true;
      case 'set-sort-strategy': this.cfg.sorting.strategy = String(cmd.value || 'size'); this._save(); return true;
    }
    return false;
  }
  liveFor(cmd) {
    switch (cmd.type) {
      case 'set-jam': return [{ type: 'twin-set', path: 'jamActive', value: !!cmd.value, alarms: true }];
      case 'empty-bin': return [{ type: 'twin-call', method: 'clearBin', args: [cmd.bin || 'A'], alarms: true }];
      case 'set-motor': return [{ type: 'twin-set', path: 'config.motorOn', value: !!cmd.value, persist: true }];
      case 'set-speed': return [{ type: 'twin-set', path: 'config.beltSpeed', value: this.cfg.beltSpeed, persist: true }];
      case 'set-sort-strategy': return [{ type: 'twin-set', path: 'config.sorting.strategy', value: this.cfg.sorting.strategy, persist: true }];
    }
    return null;
  }
  persistPatch() {
    return { motorOn: !!this.cfg.motorOn, beltSpeed: +this.cfg.beltSpeed, sorting: { ...(this.cfg.sorting || {}) } };
  }
}

class ColdAdapter extends BaseAdapter {
  get zoneTemps() {
    const out = {};
    for (const z of (this.inst.zones || [])) out[z.id] = z.temp;
    return out;
  }
  get zones() { return this.zoneTemps; }
  get worstZone() { const z = this.zoneTemps; return Math.max(z.A ?? -18, z.B ?? -18, z.C ?? -18, z.D ?? -18); }
  get compressorOn() { return !!this.cfg.compressor?.on && !this.inst.faults?.compressor; }
  get compressorFault() { return !!this.inst.faults?.compressor; }
  get doorOpenPct() { try { return (this.inst.doors?.openFraction ?? 0) * 100; } catch { return 0; } }
  get doorOpen() { return this.doorOpenPct > 5; }
  get stockUnits() { return (this.inst.inventory || []).reduce((a, i2) => a + (+i2.qty || 0), 0); }
  get status() {
    const t = this.cfg.thresholds || {};
    if (this.compressorFault) return 'danger';
    if (this.worstZone > (t.criticalTempC ?? -8)) return 'danger';
    if (this.worstZone > (t.safeTempC ?? -12)) return 'warn';
    return 'ok';
  }
  telemetry() {
    const z = this.zoneTemps;
    return {
      primary: { label: 'Warmest zone', value: this.worstZone, unit: '°C', pct: clamp((this.worstZone + 30) / 70 * 100, 0, 100), digits: 1 },
      rows: [
        { label: 'Zone A', value: z.A, unit: '°C', digits: 1 },
        { label: 'Zone B', value: z.B, unit: '°C', digits: 1 },
        { label: 'Zone C', value: z.C, unit: '°C', digits: 1 },
        { label: 'Zone D', value: z.D, unit: '°C', digits: 1 },
        { label: 'Compressor', value: this.compressorFault ? 'FAULT' : this.compressorOn ? 'RUNNING' : 'OFF' },
        { label: 'Door', value: this.doorOpen ? `OPEN ${Math.round(this.doorOpenPct)}%` : 'CLOSED' },
        { label: 'Stock items', value: this.stockUnits, unit: 'units' },
      ],
      status: this.status,
    };
  }
  applyCommand(cmd) {
    const i = this.inst;
    switch (cmd.type) {
      case 'set-compressor':
        this.cfg.compressor.on = !!cmd.value;
        if (cmd.value) i.faults.compressor = false;
        this._save(); i.evaluateAlarms();
        return true;
      case 'set-target-temp': this.cfg.compressor.targetTemp = clamp(+cmd.value, -30, 10); this._save(); return true;
      case 'set-door':
        try {
          if (i.doors) { i.doors.target = cmd.value ? i.doors.openAngle : 0; }
        } catch { /* door controller guards itself */ }
        return true;
      case 'set-compressor-fault':
        if (cmd.value) {
          i.faults.compressor = true;
          this._log('Compressor fault', 'Refrigeration plant tripped — cold chain drifting.', 'danger');
        } else {
          i.faults.compressor = false;
          this.cfg.compressor.on = true;
          this._log('Plant restored', 'Compressor restarted from the refrigeration hatch.', 'ok');
        }
        this._save(); i.evaluateAlarms();
        return true;
      case 'set-damper': {
        const z = String(cmd.zone || 'A').toUpperCase();
        if (this.cfg.zones?.[z]) { this.cfg.zones[z].damper = clamp(+cmd.value, 0.2, 1); this._save(); }
        return true;
      }
    }
    return false;
  }
  liveFor(cmd) {
    const i = this.inst;
    switch (cmd.type) {
      case 'set-door': return [{ type: 'twin-set', path: 'doors.target', value: cmd.value ? (i.doors?.openAngle ?? 1.4) : 0 }];
      case 'set-compressor': return [{ type: 'twin-set', path: 'config.compressor.on', value: !!cmd.value, alarms: true, persist: true }, { type: 'twin-set', path: 'faults.compressor', value: false, alarms: true }];
      case 'set-target-temp': return [{ type: 'twin-set', path: 'config.compressor.targetTemp', value: this.cfg.compressor.targetTemp, persist: true }];
      case 'set-compressor-fault': return [{ type: 'twin-set', path: 'faults.compressor', value: !!cmd.value, alarms: true }, { type: 'twin-set', path: 'config.compressor.on', value: !cmd.value, persist: true }];
      case 'set-damper': return [{ type: 'twin-set', path: `config.zones.${String(cmd.zone || 'A').toUpperCase()}.damper`, value: this.cfg.zones?.[String(cmd.zone || 'A').toUpperCase()]?.damper, persist: true }];
    }
    return null;
  }
  persistPatch() {
    return { compressor: { ...(this.cfg.compressor || {}) }, zones: this.cfg.zones };
  }
}

class ParkingAdapter extends BaseAdapter {
  constructor(inst) {
    super(inst);
    this.citedPlates = new Set();   // game-side enforcement bookkeeping
  }
  get occupied() { return this.inst.vehicles?.length || 0; }
  get total() { return this.inst.slots?.length || 18; }
  get overstayingVehicle() { try { return this.inst.overstayingVehicle() || null; } catch { return null; } }
  get overstayCount() {
    const v = this.overstayingVehicle;
    if (!v) return 0;
    const limit = (+this.cfg.thresholds?.overstayMinutes || 15) * 60;
    try { return this.inst.vehicles.filter(x => x.state === 'parked' && this.inst.simTime - x.parkedAt > limit).length; } catch { return 1; }
  }
  get occupancyPct() { return (this.occupied / Math.max(1, this.total)) * 100; }
  get status() {
    const t = this.cfg.thresholds || {};
    if (this.occupancyPct >= (t.fullPercent ?? 95)) return 'danger';
    if (this.overstayCount > 0) return 'warn';
    return 'ok';
  }
  telemetry() {
    return {
      primary: { label: 'Occupancy', value: this.occupancyPct, unit: '%', pct: this.occupancyPct, digits: 1 },
      rows: [
        { label: 'Vehicles', value: `${this.occupied}/${this.total}` },
        { label: 'Free bays', value: this.total - this.occupied },
        { label: 'Overstays', value: this.overstayCount },
        { label: 'Auto arrivals', value: this.cfg.spawn?.autoSpawn !== false ? 'ON' : 'OFF' },
        { label: 'Entered today', value: this.inst.enteredTotal ?? 0 },
      ],
      status: this.status,
    };
  }
  applyCommand(cmd) {
    const i = this.inst;
    switch (cmd.type) {
      case 'cite-overstays': {
        const v = this.overstayingVehicle;
        if (!v) return { handled: true, cited: 0 };
        let n = 0;
        for (const veh of (i.vehicles || [])) {
          if (veh.state === 'parked' && !this.citedPlates.has(veh.plate) && this._isOverstay(veh)) {
            this.citedPlates.add(veh.plate); n++;
          }
        }
        try { i.acknowledgeAlarm('overstay'); } catch { /* may not be raised */ }
        if (n > 0) this._log('Enforcement', `${n} overstay citation(s) issued from the booth.`, 'warn');
        return { handled: true, cited: n };
      }
      case 'set-auto-spawn': this.cfg.spawn.autoSpawn = !!cmd.value; this._save(); return true;
      case 'set-overstay-limit': this.cfg.thresholds.overstayMinutes = clamp(+cmd.value, 1, 240); this._save(); return true;
      case 'set-gate': {
        const bar = cmd.gate === 'exit' ? i.barriers?.exit : i.barriers?.entry;
        if (bar) { bar.target = cmd.value ? bar.openAngle : 0; bar.auto = false; }
        return true;
      }
      case 'dispatch-overstay': {
        const v = this.overstayingVehicle;
        if (v) { try { i.departVehicle(v); } catch { /* fallback: none */ } }
        return { handled: true };
      }
    }
    return false;
  }
  liveFor(cmd) {
    const i = this.inst;
    switch (cmd.type) {
      case 'cite-overstays': return [{ type: 'twin-call', method: 'acknowledgeAlarm', args: ['overstay'], alarms: true }];
      case 'set-auto-spawn': return [{ type: 'twin-set', path: 'config.spawn.autoSpawn', value: !!cmd.value, persist: true }];
      case 'set-overstay-limit': return [{ type: 'twin-set', path: 'config.thresholds.overstayMinutes', value: this.cfg.thresholds.overstayMinutes, persist: true }];
      case 'set-gate': {
        const bar = cmd.gate === 'exit' ? i.barriers?.exit : i.barriers?.entry;
        return [{ type: 'twin-set', path: `barriers.${cmd.gate === 'exit' ? 'exit' : 'entry'}.target`, value: cmd.value ? (bar?.openAngle ?? 1.46) : 0 }];
      }
    }
    return null;
  }
  _isOverstay(veh) {
    const limit = (+this.cfg.thresholds?.overstayMinutes || 15) * 60;
    return veh.state === 'parked' && this.inst.simTime - veh.parkedAt > limit;
  }
  allOverstaysCited() {
    try {
      const list = this.inst.vehicles.filter(v => v.state === 'parked' && this._isOverstay(v));
      return list.every(v => this.citedPlates.has(v.plate));
    } catch { return true; }
  }
  persistPatch() {
    return { autoSpawn: !!this.cfg.spawn?.autoSpawn, spawn: { ...(this.cfg.spawn || {}) }, thresholds: { ...(this.cfg.thresholds || {}) } };
  }
}

const ADAPTERS = { water: WaterAdapter, solar: SolarAdapter, conveyor: ConveyorAdapter, cold: ColdAdapter, parking: ParkingAdapter };

const TWIN_MODULES = {
  water: () => import('../infrastructures/water.js'),
  solar: () => import('../infrastructures/solar.js'),
  conveyor: () => import('../infrastructures/conveyor.js'),
  cold: () => import('../infrastructures/cold.js'),
  parking: () => import('../infrastructures/parking.js'),
};

/* ============================================================
   createTwinLink — builds the five real twins headless and wraps
   them in adapters. Async (module load + world build).
   ============================================================ */
export async function createTwinLink() {
  const host = createStubHost();
  const twins = {};
  const adapters = {};
  for (const f of FACILITIES) {
    const mod = await TWIN_MODULES[f.id]();
    const inst = createHeadlessTwin(mod.default, host);
    twins[f.id] = inst;
    adapters[f.id] = new (ADAPTERS[f.id])(inst);
  }

  const live = {};          // facilityId -> { t, snapshot } when co-open twin publishes
  const lastLive = {};      // facilityId -> recent live-state commands (replayed when the twin comes online)
  const pending = {};       // accumulated sim time for staggered far-district ticking
  let bus = null;
  let unsub = null;
  let clock = 10 * 3600 + 20 * 60;   // shared site clock (matches the solar twin's meaningful start)
  let persistTimer = null;

  /* dt accrues for every twin every frame (clocks stay coherent), but engine
     updates are cadenced: near districts at 30 Hz (staggered across frames),
     far culled districts at ~7.5 Hz — invisible, so the reduced rate is free
     performance. Physics steps stay small via sub-stepping. */
  function tick(dt, frame = 0, nearSet = null) {
    clock += dt;
    FACILITIES.forEach((f, idx) => {
      const inst = twins[f.id];
      inst.simTime = clock;
      pending[f.id] = Math.min((pending[f.id] || 0) + dt, 0.15);
      const near = !nearSet || nearSet.has(f.id);
      const due = near ? (frame % 2 === idx % 2) : (frame % 8 === idx % 8);
      if (due) {
        let step = pending[f.id];
        pending[f.id] = 0;
        inst.simDt = step;
        // the twins' physics assume small steps — sub-step like their own loop does
        while (step > 0.0001) {
          const s = Math.min(step, 0.04);
          try { inst.updateSimulation(s); } catch (e) { console.error(`twin ${f.id} update failed`, e); }
          step -= s;
        }
      }
    });
    // alarm + sensor-visual cadence mirrors the twins' own loop
    this._alarmAccum = (this._alarmAccum || 0) + dt;
    if (this._alarmAccum >= 0.4) {
      this._alarmAccum = 0;
      for (const f of FACILITIES) {
        try { twins[f.id].evaluateAlarms(); } catch { /* ignore */ }
      }
    }
    this._visAccum = (this._visAccum || 0) + dt;
    if (this._visAccum >= 0.2) {
      this._visAccum = 0;
      for (const f of FACILITIES) {
        try { twins[f.id].updateSensorVisuals(); } catch { /* ignore */ }
      }
    }
    const now = Date.now();
    for (const f of FACILITIES) if (live[f.id] && now - live[f.id].t > 2500) live[f.id] = null;
  }

  function handleBusMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'snapshot' && twins[msg.facility]) {
      const wasLive = !!live[msg.facility];
      live[msg.facility] = { t: Date.now(), snapshot: msg };
      // a twin control room just came online: replay the recent live-state
      // commands so its visible state matches the game (its own channel
      // subscription did not exist when they were first sent)
      if (!wasLive && Array.isArray(lastLive[msg.facility]) && lastLive[msg.facility].length) {
        for (const lc of lastLive[msg.facility]) bus?.sendCommand(msg.facility, lc, 'game-replay');
        lastLive[msg.facility] = [];
      }
    }
  }

  function commandFacility(id, cmd) {
    const ad = adapters[id];
    if (!ad) return false;
    // a twin's internal error must never surface as an uncaught Application
    // Error — log it and keep the shift running
    let res;
    try {
      res = ad.applyCommand(cmd);
    } catch (e) {
      console.warn(`twin command failed (${id}/${cmd?.type})`, e);
      return false;
    }
    if (res === true || (res && res.handled)) {
      // live state effects (door targets, fault flags, bin resets…) reach a
      // co-open twin immediately, then the persisted config patch follows
      let liveCmds = null;
      try { liveCmds = ad.liveFor?.(cmd) || null; } catch (e) { console.warn('liveFor failed', e); }
      if (Array.isArray(liveCmds)) {
        for (const lc of liveCmds) bus?.sendCommand(id, lc, 'game');
        lastLive[id] = (lastLive[id] || []).concat(liveCmds).slice(-12);
      } else {
        bus?.sendCommand(id, cmd, 'game');
      }
      if (ad.persistPatch) { try { bus?.sendCommand(id, { type: 'config-patch', patch: ad.persistPatch() }, 'game'); } catch { /* ignore */ } }
      schedulePersist();
      return res;
    }
    return false;
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistAll, 1200);
  }

  function persistAll() {
    for (const f of FACILITIES) adapters[f.id].persistAll();
  }

  function attachBus(theBus) {
    bus = theBus;
    unsub?.();
    unsub = theBus?.subscribe(handleBusMessage) || null;
  }

  function dispose() {
    unsub?.(); unsub = null;
    clearTimeout(persistTimer);
    persistAll();
  }

  return {
    twins, engines: adapters, adapters,
    get clock() { return clock; }, set clock(v) { clock = v; },
    tick, commandFacility, attachBus, dispose, persistAll,
    markDirty: () => schedulePersist(),
    isLive: (id) => !!live[id],
    liveSnapshot: (id) => live[id]?.snapshot || null,
    readConfig: readTwinConfig,
    writePatch: (id, patch) => { const out = writeTwinConfigPatch(id, patch); bus?.sendCommand(id, { type: 'config-patch', patch }, 'game'); return out; },
  };
}
