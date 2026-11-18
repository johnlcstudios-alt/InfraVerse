# NEXUS Infrastructure Module Contract

Each facility lives in exactly one file under `web/js/infrastructures/<id>.js`.
It must extend `BaseInfrastructure` and export both a metadata object and the class.
Do not edit shared core files; report needed core changes to the Lead.

## File shape

```js
import * as THREE from 'three';
import { BaseInfrastructure } from '../core/base.js';
import { group, box, cylinder, plane, material, emissive, roundedBox, textSprite, ... } from '../core/scene.js';
import * as ui from '../core/ui.js';

const { el } = ui; // use `el` for DOM construction in panels

export const meta = {
  id: 'water', code: 'H2O-02', name: 'Smart Water Tank',
  description: '…', icon: 'water',
  sceneBackground: 0x050b12, fogDensity: 0.0045, fitPadding: 1.05,
};

export default class WaterTank extends BaseInfrastructure {
  constructor(host) { super(host, meta); /* runtime fields */ }
  defaultConfig() { return { ...super.defaultConfig(), /* facility settings */ }; }
  buildWorld() { /* categories + geometry + interactive objects */ }
  defineSensors() { return [/* 8 definitions */]; }
  defineAlarmRules() { return [/* rules */]; }
  getAnalyticsDefs() { return [/* 3–5 series */]; }
  updateSimulation(dt) { /* advance all facility logic */ }
  getObjectInspector(obj) { /* return inspector spec by obj.kind */ }
  buildOperations(container) { /* custom controls */ }
  buildSpawning(container) { /* inventory/spawn/load controls */ }
  getOverviewMetrics() { return [/* 6 metric descriptors */]; }
  getQuickActions() { return [/* buttons */]; }
  getLegend() { return [/* swatches */]; }
}
```

## Required hooks / conventions

- `buildWorld()` runs after the renderer exists. Create categories through
  `this.category({id,label,kind})` where kind is `structure` or `equipment`.
  Recommended IDs: `floor, foundation, walls, interior-walls, partitions, roof, ceiling,
  doors, windows, beams, columns, fencing` (structure); `machines, equipment, sensors,
  pipes, wiring, conveyors, panels, vehicles, tanks, pumps, batteries, cabinets, shelves,
  bins, lighting, signs, loads` (equipment). The universal Visibility panel uses these.
- Visual-only layers: hiding a category must never change simulation state.
- Add objects with `this.addObject(root, {id,label,kind,iconName,description})`.
  The base raycasts and opens an inspector. Implement `getObjectInspector(obj)` for
  every kind you expose (door, pump, valve, compressor, machine, conveyor, box, bin,
  solar panel, battery, inverter, sensor node, etc.). Include working controls.
- Sensors: `defineSensors()` returns `{id,name,unit,min,max,value,digits,iconName,
  alarmLow,alarmHigh}`. On every update call `this.setSensorValue(id, value)`.
  Physical devices: use `this.createSensorNode(sensor,{position,scale,rotation,label})`
  then add the returned group to your sensor category. Readings must be produced by
  the simulation, not random disconnected numbers.
- Simulation: `updateSimulation(dt)` where `dt` is already scaled by speed and paused
  automatically. All machine movement, flows, temperatures, spawning and timers belong
  here. Do not use `setInterval`.
- Alarms: `defineAlarmRules()` returns rules:
  `{id,title,severity:'critical'|'warning'|'info',message:()=>string,active:()=>bool,
    thresholdKey?,defaultThreshold?,thresholdLabel?,thresholdUnit?,thresholdMin?,
    thresholdMax?,thresholdStep?}`. Read thresholds via `this.threshold(key, fallback)`.
  The base handles toasts, acknowledgement, history and sound.
- History/analytics: `getAnalyticsDefs()` returns `{id,label,unit,color,get(),digits}[]`.
  Base records every 2 simulated seconds, retains history, renders charts/CSV.
- Overview: `getOverviewMetrics()` returns 6 `ui.metric` descriptors, e.g.
  `{label, bind:()=>({value,tone,unit,sub}), iconName, sub}`. Bindings refresh live.
- Persistence: put all editable settings in `this.config` (deep-merged with defaults)
  and call `this.saveSoon()` when changed. Runtime state (levels, positions) need not
  persist. `defaultConfig()` MUST include every setting used by UI controls.
- Manual/Automatic: `this.manualMode` mirrors the global control; automatic loops must
  suspend when true. The Simulation tab and topbar provide master controls.
- Operations tab: `buildOperations(container)` should expose all important machinery
  controls, automatic/manual toggles, fault injection/testing, and facility diagnostics.
- Spawn/Inventory tab: `buildSpawning(container)` must expose spawning, schedules,
  capacities, object colour/size/type, and add/remove actions relevant to the facility.
- Top 3D UI: use `this.toggleFocusMode()`, `scene.setView()`, `scene.fitAll()`.
- Do not add a custom navigation shell; the base provides it.
- Use `this.debugAdvance(seconds)` in browser automation to advance simulation quickly
  (headless software WebGL runs at low FPS).
- Every control must alter actual simulation state and visible 3D/dashboards. No dead
  buttons, no placeholder cards, no static mockups.
- Use procedural models from `core/scene.js` and add detail. Avoid representing major
  machinery with plain untextured cubes — compose housing, pipes, panels, lights,
  displays, frames, moving parts and labels.
- Performance: merge purely decorative static groups with `mergeStaticGroup(group)` from
  scene.js where safe; disable shadows on tiny props/sensors; target < 900 draw calls.
- Aesthetic: dark industrial SCADA, emissive status lights, clean proportions, labels.

## Inspector spec

```js
{
  title, subtitle, iconName,
  badge: {text:'RUNNING', tone:'ok'}, // or badge: () => ({text,tone})
  fields: [ {label, value}, {label, get:()=>liveValue} ],
  sections: [ {title, iconName, controls:[ controlDefs ]} ],
  actions: [ {label, icon, variant, onClick} ],
  note: 'context note'
}
```

Control definitions supported by `ui.renderControls`:
`button`, `toggle`, `slider`, `select`, `number`, `text`, `segment`, `pair`, `row`,
`divider`, `label`, `notice`.
Slider: `{type:'slider', label,min,max,step,value,unit,onInput,onChange}`.
Toggle: `{type:'toggle', label,description,value,onChange}`.
After mutating state call `this.refreshInspector()` and `this.saveSoon()`.

## Testing (mandatory before completing)

1. Static server is at `http://127.0.0.1:8765` (start if not running:
   `python -m http.server 8765 --directory web`).
2. Use Playwright (`playwright-core`, Chrome at
   `C:\Program Files\Google\Chrome\Application\chrome.exe`, headless with SwiftShader).
3. Open the card matching your facility, wait for `.workspace`, capture page errors.
4. Exercise each tab; call `page.evaluate(() => window.__NEXUS_APP__.current.debugAdvance(120))`
   to advance; assert no console errors and live values changed.
5. Click 3D objects via `page.evaluate` calling `current.selectObject(id)` to verify
   inspector; manipulate controls with selectors.
6. Toggle visibility categories and verify simulation continues.
7. Take screenshots at 1600×900; inspect visually with the Read image tool.
8. Report paths, tests performed, remaining limitations in the final message.

## Write scope

Only your own infrastructure file (e.g. `web/js/infrastructures/water.js`). Do not edit
`web/index.html`, `web/js/main.js`, `web/js/core/*`, `web/css/*`, `desktop/*`, or other
modules. If a core fix is required, message the Lead with the exact issue.
