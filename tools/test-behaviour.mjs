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

const results = {};
async function open(id) {
  errors.length = 0;
  await page.evaluate(f => window.__NEXUS_APP__.openInfrastructure(f), id);
  await page.waitForTimeout(2400);
}
async function close() { await page.evaluate(() => window.__NEXUS_APP__.current.host.closeInfrastructure()); await page.waitForTimeout(350); }

/* ---------- WATER: hydraulics respond to pump and valves ---------- */
await open('water');
results.water = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.setManual(true);
  c.pump.on = true; c.pump.auto = false; c.pump.failed = false;
  c.inletValve.auto = false; c.inletValve.pct = 100; c.inletValve.target = 100;
  c.outletValve.auto = false; c.outletValve.pct = 0; c.outletValve.target = 0;
  c.volumeL = c.capacityL * 0.4;
  c.debugAdvance(120);
  const inletOn = c.inletFlow, lvl0 = c.levelPercent();
  c.debugAdvance(180);
  const rising = c.levelPercent() - lvl0;
  c.pump.on = false;
  c.debugAdvance(60);
  const inletOff = c.inletFlow;
  const lvl1 = c.levelPercent();
  c.outletValve.pct = 100; c.outletValve.target = 100;
  c.debugAdvance(120);
  const outletOn = c.outletFlow;
  const draining = c.levelPercent() - lvl1;
  // manual level set
  const okSet = typeof c.setLevelPercent === 'function';
  let setLevel = null;
  if (okSet) { c.setLevelPercent(35); setLevel = Math.round(c.levelPercent()); }
  return {
    inletOn: Math.round(inletOn), inletOff: Math.round(inletOff), outletOn: Math.round(outletOn),
    rising: +rising.toFixed(2), draining: +draining.toFixed(2), okSet, setLevel,
    level: +c.levelPercent().toFixed(1), volume: Math.round(c.volumeL),
    ok: inletOn > 50 && inletOff < 5 && outletOn > 50 && rising > 1 && draining < -1,
  };
});
await close();

/* ---------- CONVEYOR: cartons travel, sort into bins, jam ---------- */
await open('conveyor');
results.conveyor = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.startLine();
  c.clearBoxes(true);
  c.debugAdvance(20);
  for (let i = 0; i < 6; i++) c.spawnBox({});
  const t0 = c.boxes.map(b => ({ id: b.id, x: +b.group.position.x.toFixed(2), z: +b.group.position.z.toFixed(2) }));
  c.debugAdvance(45);
  const moved = c.boxes.filter(b => { const p = t0.find(x => x.id === b.id); return p && (Math.abs(p.x - b.group.position.x) > .25 || Math.abs(p.z - b.group.position.z) > .25); }).length;
  c.debugAdvance(300);
  const sorted = c.sortedA + c.sortedB;
  const inBins = c.boxesInBins;
  const bins = { a: c.binData.A.count, b: c.binData.B.count };
  c.injectJam();
  c.debugAdvance(6);
  const jammed = !!c.jamActive;
  c.resetJam();
  c.debugAdvance(4);
  const cleared = !c.jamActive;
  return { spawned: t0.length, moved, sorted, inBins, bins, jammed, cleared, beltSpeed: +c.belt.speed.toFixed(2), lineState: c.lineState, ok: moved > 0 && sorted > 0 && jammed && cleared };
});
await close();

/* ---------- COLD: compressor, door, heat map ---------- */
await open('cold');
results.cold = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.debugAdvance(60);
  const t0 = c.averageTemp();
  c.compressor.stop();
  c.debugAdvance(300);
  const warmed = c.averageTemp() - t0;
  c.compressor.start();
  c.debugAdvance(420);
  const netAfterRestart = c.averageTemp() - t0;
  const beforeDoor = c.averageTemp();
  c.doors.open('behaviour test');
  c.debugAdvance(120);
  const doorRise = c.averageTemp() - beforeDoor;
  const doorOpenState = c.doors.state;
  c.doors.close('behaviour test');
  c.debugAdvance(60);
  const doorClosedState = c.doors.state;
  c.setHeatmapVisible(true);
  return {
    warmed: +warmed.toFixed(2), netAfterRestart: +netAfterRestart.toFixed(2), doorRise: +doorRise.toFixed(2),
    doorOpenState, doorClosedState, heatmap: c.heatmap.every(h => h.group.visible),
    zones: c.zones.map(z => +z.temp.toFixed(1)), avg: +c.averageTemp().toFixed(1), humidity: Math.round(c.humidity),
    ok: warmed > .1 && doorRise > .03 && doorClosedState === 'CLOSED' && netAfterRestart < warmed,
  };
});
await close();

/* ---------- SOLAR: SOC integration, load response, panel disable ---------- */
await open('solar');
results.solar = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.debugAdvance(180);
  const soc0 = c.batterySoc;
  c.debugAdvance(600);
  const soc1 = c.batterySoc;
  const gen0 = c.solarPower;
  // force heavy load
  if (typeof c.addLoadCircuit === 'function') c.addLoadCircuit('Test Load', 9000);
  c.debugAdvance(600);
  const soc2 = c.batterySoc;
  // disable the PV array
  let genOff = gen0;
  if (typeof c.setArrayEnabled === 'function') { c.setArrayEnabled(false); c.debugAdvance(60); genOff = c.solarPower; }
  else if (typeof c.setPanelEnabled === 'function') { for (const p of c.panels || []) c.setPanelEnabled(p, false); c.debugAdvance(60); genOff = c.solarPower; }
  const flows = c.flowDots || c.energyDots || c.flowPulses || null;
  return {
    soc0: +soc0.toFixed(1), soc1: +soc1.toFixed(1), soc2: +soc2.toFixed(1),
    gen0: Math.round(gen0), genOff: Math.round(genOff),
    charge: Math.round(c.chargeCurrent), load: Math.round(c.loadServed), demand: Math.round(c.loadDemand),
    flows: Array.isArray(flows) ? flows.length : (flows ? 'present' : 'n/a'),
    ok: soc1 !== soc0 && (soc2 < soc1 || soc2 <= 20) && genOff < Math.max(30, gen0 * .5),
  };
});
await close();

/* ---------- PARKING: entry, park, exit, barriers ---------- */
await open('parking');
results.parking = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.debugAdvance(30);
  const v0 = c.vehicles.length;
  const created = c.spawnVehicle();
  c.debugAdvance(90);
  const parked = c.vehicles.filter(v => v.state === 'parked').length;
  const occ = c.slots.filter(s => s.status === 'occupied').length;
  const entered = c.enteredTotal;
  const first = c.vehicles.find(v => v.state === 'parked');
  c.departVehicle(first);
  c.debugAdvance(180);
  const exited = c.exitedTotal;
  c.barriers.entry.open();
  c.debugAdvance(4);
  const gateOpen = c.barriers.entry.state;
  c.barriers.entry.close();
  c.debugAdvance(8);
  const gateClosed = c.barriers.entry.state;
  return { v0, created: !!created, parked, occ, entered, exited, gateOpen, gateClosed, occupancy: +c.occupancyPercent().toFixed(1), ok: parked > 0 && occ > 0 && exited > 0 && gateClosed === 'CLOSED' };
});
await close();

console.log(JSON.stringify({ results, errors: errors.slice(0, 5) }, null, 1));
await browser.close();
