/* TWINHOST prototype verification — run: node tools/test-twinhost.mjs
   Builds all five REAL twin applications headless (their own buildWorld
   geometry + engines + saved configs) and ticks them, asserting the twin
   worlds construct cleanly and evolve. This is the gate for using the
   exact twin models in the game. */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'web');
const PORT = 8812;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = join(WEB, p);
  if (!existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__TWINOPS_GAME__, null, { timeout: 40000 });
await page.waitForTimeout(2500);

// Prototype: build all five twins headless inside the live game page
const result = await page.evaluate(async () => {
  const { createHeadlessTwin, createStubHost, extractWorld } = await import('./js/game/twinhost.js');
  const loader = {
    water: () => import('./js/infrastructures/water.js'),
    solar: () => import('./js/infrastructures/solar.js'),
    conveyor: () => import('./js/infrastructures/conveyor.js'),
    cold: () => import('./js/infrastructures/cold.js'),
    parking: () => import('./js/infrastructures/parking.js'),
  };
  const out = {};
  const host = createStubHost();
  for (const id of ['water', 'solar', 'conveyor', 'cold', 'parking']) {
    try {
      const mod = await loader[id]();
      const t0 = performance.now();
      const inst = createHeadlessTwin(mod.default, host);
      const buildMs = Math.round(performance.now() - t0);
      // tick the real engine 20 sim-seconds
      for (let i = 0; i < 100; i++) {
        inst.simTime += 0.2;
        inst.simDt = 0.2;
        inst.updateSimulation(0.2);
      }
      inst.evaluateAlarms();
      inst.updateSensorVisuals();
      const world = extractWorld(inst);
      let meshes = 0;
      world.traverse(o => { if (o.isMesh) meshes++; });
      // sample the real telemetry the twins expose
      const sample = {};
      for (const s of inst.sensorDefs.slice(0, 4)) {
        try { sample[s.id] = inst.sensorValue(s.id); } catch { sample[s.id] = null; }
      }
      out[id] = { ok: true, buildMs, meshes, alarms: inst.getActiveAlarms().length, sample, categories: inst.scene.categoryOrder.length };
    } catch (err) {
      out[id] = { ok: false, error: String(err && err.stack || err).slice(0, 400) };
    }
  }
  return out;
});

let failed = 0;
for (const [id, r] of Object.entries(result)) {
  if (!r.ok) { failed++; console.log(`✗ ${id}: ${r.error}`); }
  else console.log(`✓ ${id}: ${r.meshes} meshes · ${r.categories} categories · built in ${r.buildMs}ms · alarms ${r.alarms} · sample ${JSON.stringify(r.sample)}`);
}
console.log('errors:', errors.length ? errors.slice(0, 12) : 'zero');
await browser.close(); server.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
