/* TWIN OPS verification — run: node tools/test-game.mjs
   Serves web/ locally, opens the game, and asserts the live
   twin <-> game bridge in both directions with zero errors. */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'web');
const PORT = 8799;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = join(WEB, p);
  if (!existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

function findChrome() {
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ]) if (existsSync(p)) return p;
  throw new Error('No Chrome/Edge found for the test browser.');
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 1500, height: 860 } });
const errors = [];
const track = (page, tag) => {
  page.on('pageerror', e => errors.push(`${tag} PAGEERR ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${tag} ${m.text()}`); });
};
const APP_URL = `http://127.0.0.1:${PORT}/index.html`;

const out = { checks: {} };
const ok = (name, cond, detail = '') => { out.checks[name] = cond ? 'PASS' : `FAIL ${detail}`; };

/* ---------- page 1: launcher card + solo game ---------- */
const pageA = await ctx.newPage();
track(pageA, 'A');
await pageA.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await pageA.waitForTimeout(800);
out.menuCards = await pageA.locator('.facility-card').count();
ok('menuHasGameCard', out.menuCards === 6, `got ${out.menuCards}`);
const cardText = await pageA.locator('.facility-card').last().innerText();
ok('gameCardLabelled', /TWIN OPS/i.test(cardText), cardText.slice(0, 60));

// fresh twin config for deterministic seed
await pageA.evaluate(() => { localStorage.removeItem('idt.idt.water.config'); });
await pageA.reload({ waitUntil: 'domcontentloaded' });
await pageA.waitForTimeout(700);

await pageA.evaluate(() => window.__INFRAVERSE_APP__.openInfrastructure('game'));
await pageA.waitForFunction(() => window.__INFRAVERSE_APP__.current?.meta?.id === 'game', null, { timeout: 30000 });
await pageA.waitForTimeout(3500);
ok('gameMounted', await pageA.evaluate(() => !!window.__INFRAVERSE_APP__.current?.scene));
ok('twinBusRegistered', await pageA.evaluate(() => window.__TWINBUS__?.kind === 'twinbus'));
ok('hudCanvasPresent', await pageA.locator('.twops-gl').count() === 1);

// the game's main menu greets the player; resume enables the controls
ok('deploymentMenuShows', await pageA.evaluate(() => !!document.querySelector('.twops-deploy-grid')));
await pageA.evaluate(() => window.__INFRAVERSE_APP__.current.deploy('resume'));
await pageA.waitForTimeout(400);
ok('controlsEnabledAfterDeploy', await pageA.evaluate(() => window.__INFRAVERSE_APP__.current.controls.enabled === true));

// real twin engines seeded from the twins' configs and evolving — advance
// sim time deterministically (headless renderers run too slow for wall time)
const lvl0 = await pageA.evaluate(() => window.__INFRAVERSE_APP__.current.twinLink.engines.water.level);
await pageA.evaluate(() => {
  const g = window.__INFRAVERSE_APP__.current;
  for (let i = 0; i < 150; i++) g.twinLink.tick(0.2);   // +30 sim-seconds
});
const lvl1 = await pageA.evaluate(() => window.__INFRAVERSE_APP__.current.twinLink.engines.water.level);
ok('waterEngineEvolves', Math.abs(lvl1 - lvl0) > 0.05, `${lvl0.toFixed(2)} -> ${lvl1.toFixed(2)}`);
let hudLive = false;
try {
  await pageA.waitForFunction(() => /\d/.test(document.querySelector('.twops-card .pv')?.textContent || ''), null, { timeout: 20000 });
  hudLive = true;
} catch { /* headless loop throttling */ }
ok('hudTelemetryLive', hudLive);

/* game -> twin PERSISTENT: target level change reaches the twin's config store */
await pageA.evaluate(() => {
  const g = window.__INFRAVERSE_APP__.current;
  g.twinLink.commandFacility('water', { type: 'set-target-level', value: 55 });
  g.twinLink.commandFacility('water', { type: 'set-auto-fill', value: false });
  g.twinLink.persistAll();
});
await pageA.waitForTimeout(400);
const stored = await pageA.evaluate(() => JSON.parse(localStorage.getItem('idt.idt.water.config') || '{}'));
ok('gameWritesTwinConfig', stored.targetLevel === 55 && stored.autoFill === false, JSON.stringify({ targetLevel: stored.targetLevel, autoFill: stored.autoFill }));

// leave the game (its evolved operating point persists), reopen as the twin
// choosing an infrastructure in the deployment menu opens its twin control room
await pageA.evaluate(() => window.__INFRAVERSE_APP__.openInfrastructure('game'));
await pageA.waitForFunction(() => window.__INFRAVERSE_APP__.current?.meta?.id === 'game', null, { timeout: 40000 });
await pageA.waitForTimeout(2500);
await pageA.evaluate(() => window.__INFRAVERSE_APP__.current.deploy('water'));
try {
  await pageA.waitForFunction(() => window.__INFRAVERSE_APP__.current?.meta?.id === 'water', null, { timeout: 60000 });
  ok('deployOpensTwin', true);
} catch {
  const diag = await pageA.evaluate(() => ({
    current: window.__INFRAVERSE_APP__.current?.meta?.id || null,
    menu: !!document.querySelector('.menu-screen'),
    loading: !!document.querySelector('.loading-overlay'),
    toasts: [...document.querySelectorAll('.toast, .twops-toast')].map(t => t.textContent.slice(0, 90)),
  }));
  console.log('DEPLOY-DIAG:', JSON.stringify(diag));
  ok('deployOpensTwin', false, JSON.stringify(diag));
}
// back to the platform menu — the control room had replaced the game view
await pageA.evaluate(() => window.__INFRAVERSE_APP__.closeInfrastructure());
await pageA.waitForTimeout(900);
ok('gameClosedToMenu', await pageA.locator('.menu-screen').count() === 1);
ok('twinBusRemoved', await pageA.evaluate(() => !window.__TWINBUS__));
// now open the water twin for the persistence checks
await pageA.evaluate(() => window.__INFRAVERSE_APP__.openInfrastructure('water'));
await pageA.waitForFunction(() => window.__INFRAVERSE_APP__.current?.meta?.id === 'water', null, { timeout: 40000 });
await pageA.waitForTimeout(2500);
ok('twinPickedUpGameChanges', await pageA.evaluate(() => {
  const c = window.__INFRAVERSE_APP__.current;
  return c.config.targetLevel === 55 && c.config.autoFill === false;
}), await pageA.evaluate(() => { const c = window.__INFRAVERSE_APP__.current; return JSON.stringify({ t: c.config.targetLevel, a: c.config.autoFill }); }));
// water resumes from the level the game evolved to
const twinLvl = await pageA.evaluate(() => window.__INFRAVERSE_APP__.current.sensorValue('level'));
ok('twinResumesFromGameLevel', Math.abs(twinLvl - lvl1) < 3, `twin ${twinLvl.toFixed(1)} vs game-left ${lvl1.toFixed(1)}`);

/* ---------- page 2: co-open live bridge ---------- */
const pageB = await ctx.newPage();
track(pageB, 'B');
await pageB.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await pageB.waitForTimeout(700);
await pageB.evaluate(() => window.__INFRAVERSE_APP__.openInfrastructure('game'));
await pageB.waitForFunction(() => window.__INFRAVERSE_APP__.current?.meta?.id === 'game', null, { timeout: 30000 });
await pageB.bringToFront();
let seesLive = false;
try {
  await pageB.waitForFunction(() => window.__INFRAVERSE_APP__.current.twinLink.isLive('water'), null, { timeout: 8000 });
  seesLive = true;
} catch { /* not live in time */ }
ok('gameSeesLiveTwin', seesLive);
const twinNow = await pageA.evaluate(() => window.__INFRAVERSE_APP__.current.sensorValue('level'));
const gameMirror = await pageB.evaluate(() => window.__INFRAVERSE_APP__.current.twinLink.engines.water.level);
ok('twinStateMirrorsToGame', Math.abs(twinNow - gameMirror) < 2.5, `twin ${twinNow.toFixed(1)} vs game ${gameMirror.toFixed(1)}`);

/* game -> twin LIVE: auto-drain command reaches the running twin through the bus */
await pageB.evaluate(() => window.__INFRAVERSE_APP__.current.twinLink.commandFacility('water', { type: 'set-auto-drain', value: true }));
await pageA.bringToFront();
await pageA.waitForTimeout(1500);
ok('gameCommandsRunningTwin', await pageA.evaluate(() => window.__INFRAVERSE_APP__.current.config.autoDrain === true));
// advance the running twin deterministically (background-tab rAF throttling makes
// wall-time waits unreliable) — the patched config must drive the outlet valve
ok('twinReactsLive', await pageA.evaluate(() => {
  const c = window.__INFRAVERSE_APP__.current;
  try { c.debugAdvance(30, 0.05); } catch { /* ignore */ }
  return c.outletFlow > 0 || c.outletValve.target > 0 || c.outletValve.pct > 0;
}));

/* mission + incident system sanity (game page) */
await pageB.bringToFront();
await pageB.waitForTimeout(1500);
ok('missionsPipelineRuns', await pageB.evaluate(() => Array.isArray(window.__INFRAVERSE_APP__.current.missions)));
ok('noFatalHud', await pageB.locator('.twops-fatal').count() === 0);

/* game -> twin LIVE state sync: a pump failure in the game mirrors onto the
   running water twin, and the freezer door the player opens opens on the twin */
await pageB.evaluate(() => window.__INFRAVERSE_APP__.current.twinLink.commandFacility('water', { type: 'set-leak', value: true }));
ok('pumpFailureSyncsToTwin', await pageA.evaluate(() => window.__INFRAVERSE_APP__.current?.pump?.failed === true));

await pageA.evaluate(() => window.__INFRAVERSE_APP__.openInfrastructure('cold'));
await pageA.waitForFunction(() => window.__INFRAVERSE_APP__.current?.meta?.id === 'cold', null, { timeout: 90000 });
// wait until the cold twin's live channel is publishing before commanding it
await pageB.bringToFront();
try {
  await pageB.waitForFunction(() => window.__INFRAVERSE_APP__.current.twinLink.isLive('cold'), null, { timeout: 25000 });
} catch { /* proceed — the replay mechanism covers late arrival */ }
await pageB.evaluate(() => window.__INFRAVERSE_APP__.current.twinLink.commandFacility('cold', { type: 'set-door', value: true }));
await pageA.bringToFront();
await pageA.waitForTimeout(800);
ok('doorSyncsToTwin', await pageA.evaluate(() => {
  const c = window.__INFRAVERSE_APP__.current;
  try { c.debugAdvance(6, 0.05); } catch { /* ignore */ }
  return (c.doors?.openFraction ?? 0) > 0.1;
}));

/* exit game cleanly */
await pageB.evaluate(() => window.__INFRAVERSE_APP__.closeInfrastructure());
await pageB.waitForTimeout(900);
ok('secondGameClosed', await pageB.locator('.menu-screen').count() === 1);

/* ---------- report ---------- */
let failed = 0;
for (const [k, v] of Object.entries(out.checks)) {
  if (!v.startsWith('PASS')) failed++;
  console.log(`${v.startsWith('PASS') ? '✓' : '✗'} ${k}${v.startsWith('PASS') ? '' : '  ' + v.slice(5)}`);
}
console.log(`menu cards: ${out.menuCards}`);
if (errors.length) {
  console.log(`\nconsole/page errors (${errors.length}):`);
  for (const e of errors.slice(0, 20)) console.log('  ' + e);
} else console.log('\nzero console/page errors');
await browser.close();
server.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);

