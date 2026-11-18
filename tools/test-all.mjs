import { chromium } from 'playwright-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const ADVANCE = Number(process.argv[2] || 120);
const only = process.argv[3] || null;

const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const results = [];
const ids = ['parking', 'water', 'conveyor', 'cold', 'solar', 'campus'];
for (const id of ids) {
  if (only && only !== id) continue;
  errors.length = 0;
  const r = { id, ok: false, phases: {}, errors: [] };

  await page.evaluate((fid) => window.__NEXUS_APP__.openInfrastructure(fid), id);
  await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const c = window.__NEXUS_APP__.current;
    if (!c) return null;
    return {
      name: c.meta.name, sensors: c.sensorDefs.length, objects: c.objects.size,
      equipment: c.equipment.length, categories: c.scene.categoryOrder.length,
      tabs: c.tabs().map(t => t.id),
      missing: ['buildWorld', 'defineSensors', 'defineAlarmRules', 'getAnalyticsDefs',
        'updateSimulation', 'getObjectInspector', 'buildOperations', 'buildSpawning',
        'getOverviewMetrics'].filter(m => typeof c[m] !== 'function' || c[m] === Object.getPrototypeOf(Object.getPrototypeOf(c))[m]),
    };
  });
  r.phases.load = info;
  if (!info) { r.errors = errors.slice(); results.push(r); continue; }

  // tab sweep
  const tabErrors = [];
  for (const tab of info.tabs) {
    errors.length = 0;
    try {
      await page.evaluate((t) => window.__NEXUS_APP__.current.setTab(t), tab);
      await page.waitForTimeout(320);
    } catch (e) { tabErrors.push(`${tab}: ${e.message}`); }
    const bodyLen = await page.locator('#panel-body').innerText().catch(() => '');
    if (!bodyLen || bodyLen.trim().length < 20) tabErrors.push(`${tab}: empty panel`);
    if (errors.length) tabErrors.push(`${tab}: ${errors[0]}`);
  }
  r.phases.tabs = tabErrors;

  // simulate
  errors.length = 0;
  const sim = await page.evaluate((secs) => {
    const c = window.__NEXUS_APP__.current;
    const before = c.history.times.length;
    c.debugAdvance(secs);
    return {
      simTime: Math.round(c.simTime), history: c.history.times.length - before,
      sensors: c.sensorDefs.map(s => ({ id: s.id, v: c.sensorValue(s.id), st: c.sensorStatus(s.id) })),
      alarms: c.getActiveAlarms().length, events: c.events.length,
    };
  }, ADVANCE);
  r.phases.sim = { simTime: sim.simTime, newHistory: sim.history, alarms: sim.alarms, events: sim.events, errors: errors.slice(0, 4) };
  const nullSensors = sim.sensors.filter(s => s.v === null).map(s => s.id);
  r.phases.nullSensors = nullSensors;
  const distinct = new Set(sim.sensors.map(s => s.v)).size;
  r.phases.sensorVariety = distinct;

  // object inspectors
  errors.length = 0;
  const insp = await page.evaluate(() => {
    const c = window.__NEXUS_APP__.current;
    const kinds = new Map();
    for (const o of c.objects.values()) if (!kinds.has(o.kind)) kinds.set(o.kind, o.id);
    const out = [];
    for (const [kind, oid] of kinds) {
      try {
        c.selectObject(oid);
        const spec = c.inspectorSpec;
        out.push({ kind, id: oid, title: spec?.title || null, sections: (spec?.sections || []).length, fields: (spec?.fields || []).length, controls: (spec?.sections || []).reduce((a, s) => a + (s.controls?.length || 0), 0) });
      } catch (e) { out.push({ kind, id: oid, error: e.message }); }
    }
    try { c.closeInspector(); } catch {}
    return out;
  });
  r.phases.inspectors = insp;
  r.phases.inspectorErrors = errors.slice(0, 4);

  // visibility
  errors.length = 0;
  const vis = await page.evaluate(() => {
    const c = window.__NEXUS_APP__.current;
    const before = c.simTime;
    c.hideCategoryIds(['roof', 'ceiling', 'walls']);
    c.debugAdvance(20);
    const after = c.simTime;
    const hidden = c.scene.getVisibility();
    c.showAllCategories();
    c.toggleXray(); c.debugAdvance(5); c.toggleXray();
    c.toggleTransparentWalls(); c.toggleTransparentWalls();
    return { simAdvanced: after > before, hiddenRoof: hidden.roof === false, state: c.getRunState() };
  });
  r.phases.visibility = vis;
  r.phases.visibilityErrors = errors.slice(0, 4);

  // restart / persistence
  errors.length = 0;
  const persist = await page.evaluate(() => {
    const c = window.__NEXUS_APP__.current;
    c.saveConfig(false);
    const cfg = JSON.parse(localStorage.getItem('idt.' + c.id + '.config') || 'null');
    return { saved: !!cfg, sensors: Object.keys(cfg?.sensors || {}).length, samples: c.history.times.length };
  });
  r.phases.persistence = persist;
  r.errors = errors.slice(0, 6);
  r.ok = tabErrors.length === 0 && r.phases.sim.errors.length === 0 && insp.every(i => !i.error) && errors.length === 0;
  await page.screenshot({ path: `assets/final-${id}.png` });
  await page.evaluate(() => window.__NEXUS_APP__.current.host.closeInfrastructure());
  await page.waitForTimeout(400);
  results.push(r);
}

console.log(JSON.stringify(results, null, 1));
await browser.close();
