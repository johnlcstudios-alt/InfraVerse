import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);
await page.evaluate(() => window.__NEXUS_APP__.openInfrastructure('campus'));
await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 40000 });
await page.waitForTimeout(3000);

const out = {};

/* 1 — energy: island mode sheds load, protects cold chain, drains battery */
out.island = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.config.arrivalsEnabled = false;
  c.clearTrucks();
  c.debugAdvance(120);
  c.batterySoc = 45;
  const before = { soc: c.batterySoc };
  if (!c.islandMode) c.toggleIsland();
  c.debugAdvance(300);
  const healthy = {
    soc: c.batterySoc, batteryPower: Math.round(c.batteryPower / 1000),
    island: c.islandMode, grid: Math.round(c.gridImport),
    coldServed: Math.round(c.loads.cold.served), unserved: c.unservedLoad,
  };
  // now exhaust the battery and confirm priority shedding protects the cold chain
  c.batterySoc = 5;
  c.debugAdvance(900);
  const depleted = {
    soc: +c.batterySoc.toFixed(1), shed: +c.shedLevel.toFixed(2), unserved: +c.unservedLoad.toFixed(2),
    coldServed: Math.round(c.loads.cold.served), lightServed: Math.round(c.loads.lighting.served),
    dockServed: Math.round(c.loads.dock.served),
    alarms: c.getActiveAlarms().map(a => a.id),
  };
  return {
    before, healthy, depleted,
    ok: healthy.island && healthy.grid === 0 && healthy.batteryPower < 0 && healthy.soc < before.soc
      && depleted.shed > 0 && depleted.coldServed >= depleted.dockServed,
  };
});

/* 2 — water: drained reservoir degrades cooling */
out.water = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  if (c.islandMode) c.toggleIsland();
  c.faults.compressor = false;
  c.batterySoc = 80;
  c.tankLevelPct = 90;
  c.debugAdvance(180);
  const before = { tank: c.tankLevelPct, cold: c.coldZones.map(z => +z.temp.toFixed(2)) };
  c.tankLevelPct = 6;
  c.pumpOn = false;
  c.debugAdvance(300);
  const after = { tank: c.tankLevelPct, cold: c.coldZones.map(z => +z.temp.toFixed(2)) };
  const warming = after.cold[0] > before.cold[0] + 0.25;
  return { before, after, warming, pumpFlowZero: c.pumpFlow < 1, ok: warming && c.pumpFlow < 1 };
});

/* 3 — production: no raw material stops the line and raises starvation */
out.production = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.config.arrivalsEnabled = false;
  c.clearTrucks();
  c.tankLevelPct = 85;
  c.pumpOn = true;
  c.coldZones.forEach(z => { z.temp = z.setpoint; });
  c.setThreshold('rawStarvationMinutes', 8);
  c.debugAdvance(120);
  const runningRate = c.productionRate;
  const producedBefore = c.producedToday;
  c.rawStock = 0;
  c.debugAdvance(60);
  const rawRate = c.productionRate;
  const stockBefore = c.coldInventory;
  c.debugAdvance(560);
  const stockAfterNoMaterial = c.coldInventory;
  const starved = c.getActiveAlarms().some(a => a.id === 'starvation');
  c.addRawMaterial(300, 'test delivery');
  c.debugAdvance(200);
  const resumed = c.productionRate;
  const stockAfterMaterial = c.coldInventory;
  return {
    runningRate: Math.round(runningRate), rawRate: Math.round(rawRate), resumed: Math.round(resumed),
    starved, producedBefore, produced: c.producedToday,
    stockBefore: Math.round(stockBefore), stockAfterNoMaterial: Math.round(stockAfterNoMaterial), stockAfterMaterial: Math.round(stockAfterMaterial),
    ok: runningRate > 100 && rawRate === 0 && starved && resumed > 100 && stockAfterMaterial > stockAfterNoMaterial,
  };
});

/* 4 — cold chain: compressor fault → excursion → quarantine */
out.coldChain = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.rawStock = 300;
  c.faults.compressor = true;
  const before = { cold: c.coldZones.map(z => +z.temp.toFixed(2)), quarantine: c.coldQuarantine };
  c.debugAdvance(900);
  const after = { cold: c.coldZones.map(z => +z.temp.toFixed(2)), quarantine: Math.round(c.coldQuarantine), breach: c.coldBreach(), alarms: c.getActiveAlarms().map(a => a.id) };
  c.faults.compressor = false;
  c.debugAdvance(600);
  const recovered = { cold: c.coldZones.map(z => +z.temp.toFixed(2)), breach: c.coldBreach() };
  return { before, after, recovered, ok: after.cold[0] > before.cold[0] + 1 && after.breach && after.quarantine > 0 && recovered.cold[0] < after.cold[0] };
});

/* 5 — logistics feeds production and dispatch draws stock */
out.logistics = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.config.arrivalsEnabled = false;
  c.rawStock = 100;
  const before = { raw: c.rawStock, inv: Math.round(c.coldInventory) };
  const truck = c.spawnTruck({ role: 'inbound', serviceTime: 4 });
  c.debugAdvance(120);
  const received = c.rawStock;
  c.debugAdvance(60);
  const invBefore = c.coldInventory;
  c.dispatchStock(80);
  c.debugAdvance(120);
  return {
    before, received, invBefore: Math.round(invBefore), invAfter: Math.round(c.coldInventory),
    dispatched: Math.round(c.dispatchedToday), trucks: c.trucks.length,
    ok: received > before.raw && c.coldInventory < invBefore,
  };
});

/* 6 — scenario presets move several subsystems */
out.scenario = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  const snap = () => ({
    simTime: Math.round(c.simTime), island: c.islandMode, cloud: +c.cloudCover.toFixed(2),
    arrivals: c.arrivalInterval, target: c.productionTarget, irr: Math.round(c.irradiance), load: Math.round(c.loadServed),
  });
  c.loadScenario('normal');
  c.debugAdvance(120);
  const a = snap();
  c.loadScenario('outage');
  c.debugAdvance(120);
  const b = snap();
  c.loadScenario('night');
  c.debugAdvance(120);
  const d = snap();
  c.loadScenario('heatwave');
  c.debugAdvance(60);
  const e = snap();
  return {
    normal: a, outage: b, night: d, heatwave: e,
    ok: b.island === true && a.island === false && d.irr === 0 && b.arrivals !== a.arrivals && e.target !== a.target,
    scenarioLabel: c.scenarioLabel(),
  };
});

/* 7 — restoration: everything recovers, alarms clear */
out.recovery = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.loadScenario('peak');
  c.faults.compressor = false; c.faults.pump = false; c.faults.sensor = false; c.lineJam = false;
  c.batterySoc = 92; c.tankLevelPct = 80; c.rawStock = 600; c.pumpOn = true;
  c.coldZones.forEach(z => { z.temp = z.setpoint; });
  c.releaseQuarantine();
  c.debugAdvance(900);
  const active = c.getActiveAlarms().map(a => a.id);
  return {
    cold: c.coldZones.map(z => +z.temp.toFixed(2)), breach: c.coldBreach(),
    setpoints: c.coldZones.map(z => z.setpoint),
    soc: +c.batterySoc.toFixed(1), tank: +c.tankLevelPct.toFixed(1), rate: Math.round(c.productionRate),
    activeAlarms: active, produced: c.producedToday,
    ok: active.length === 0 && c.productionRate > 100 && !c.coldBreach(),
  };
});

out.errors = errors.slice(0, 6);
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: 'docs/qa/campus-behaviour.png' });
await browser.close();
