/* TWIN OPS controls verification — run: node tools/test-game-controls.mjs
   Asserts the controller mechanics deterministically (the full campus renders
   slowly under SwiftShader, so wall-time waits span zero frames):
   mouse look (drag fallback + pointer lock), key mapping, walking, exact
   ground rest, single-jump-then-settle with no bounce, wall collision. */
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'web');
const PORT = 8809;
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

function findChrome() {
  for (const p of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ]) if (existsSync(p)) return p;
  throw new Error('No Chrome/Edge found.');
}

const browser = await chromium.launch({
  executablePath: findChrome(),
  headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);
await page.evaluate(() => window.__INFRAVERSE_APP__.openInfrastructure('game'));
await page.waitForFunction(() => window.__INFRAVERSE_APP__.current?.meta?.id === 'game', null, { timeout: 40000 });
await page.waitForTimeout(2500);

const out = {};
const ok = (name, cond, detail = '') => { out[name] = cond ? 'PASS' : `FAIL ${detail}`; };

/* the game's main menu must greet the player on entry */
await page.waitForTimeout(500);
ok('deploymentMenuShows', await page.evaluate(() => !!document.querySelector('.twops-deploy-grid')));

// resume the shift (closes the menu and enables the controls)
await page.evaluate(() => window.__INFRAVERSE_APP__.current.deploy('resume'));
await page.waitForTimeout(600);
ok('menuClosedEnablesControls', await page.evaluate(() => window.__INFRAVERSE_APP__.current.controls.enabled === true));

// enter the look session (the click path the player uses)
await page.evaluate(() => { document.querySelector('.twops-lock').style.display = 'none'; window.__INFRAVERSE_APP__.current.controls.requestLook(); });
await page.waitForTimeout(800);
ok('lookSessionEntered', await page.evaluate(() => window.__INFRAVERSE_APP__.current.controls.hasEntered === true));

/* mouse look via drag fallback (works everywhere incl. VMs) */
const yaw0 = await page.evaluate(() => window.__INFRAVERSE_APP__.current.controls.yaw);
const pitch0 = await page.evaluate(() => window.__INFRAVERSE_APP__.current.controls.pitch);
await page.mouse.move(640, 360);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(640 + i * 30, 360 - i * 8);
await page.mouse.up();
await page.waitForTimeout(150);
const yaw1 = await page.evaluate(() => window.__INFRAVERSE_APP__.current.controls.yaw);
const pitch1 = await page.evaluate(() => window.__INFRAVERSE_APP__.current.controls.pitch);
ok('mouseLookChangesYaw', Math.abs(yaw1 - yaw0) > 0.1, `Δyaw=${Math.abs(yaw1 - yaw0).toFixed(3)}`);
ok('mouseLookChangesPitch', Math.abs(pitch1 - pitch0) > 0.02, `Δpitch=${Math.abs(pitch1 - pitch0).toFixed(3)}`);

/* key mapping through the real event path */
await page.keyboard.down('KeyW');
const keysHeld = await page.evaluate(() => window.__INFRAVERSE_APP__.current.controls._keys.has('fwd'));
await page.keyboard.up('KeyW');
ok('keyMappingW', keysHeld === true);

/* walking: drive the controller deterministically */
const before = await page.evaluate(() => {
  const g = window.__INFRAVERSE_APP__.current;
  g.controls.teleportTo(0, 1.7, 20, 0, 0);   // open road, facing -Z
  return { x: g.camera.position.x, z: g.camera.position.z, y: g.camera.position.y };
});
await page.evaluate(() => {
  const g = window.__INFRAVERSE_APP__.current;
  const c = g.controls;
  c._keys.add('fwd');
  for (let i = 0; i < 60; i++) c.update(1 / 30);   // 2 sim-seconds of walking
  c._keys.delete('fwd');
});
const after = await page.evaluate(() => {
  const g = window.__INFRAVERSE_APP__.current;
  return { x: g.camera.position.x, z: g.camera.position.z, y: +g.camera.position.y.toFixed(3) };
});
const moved = Math.hypot(after.x - before.x, after.z - before.z);
ok('walkMovesPlayer', moved > 1.5, `moved=${moved.toFixed(2)}m`);
ok('eyeStaysAtStandingHeight', Math.abs(after.y - 1.7) < 0.02, `y=${after.y}`);

/* jump: one arc driven deterministically, settles at standing height, no bounce */
await page.keyboard.press('Space');   // real event path sets the jump impulse
const jumped = await page.evaluate(() => {
  const g = window.__INFRAVERSE_APP__.current;
  const c = g.controls;
  let apex = 0;
  for (let i = 0; i < 120; i++) { c.update(1 / 30); apex = Math.max(apex, g.camera.position.y); }
  return { apex: +apex.toFixed(3), settled: +g.camera.position.y.toFixed(3), grounded: c.grounded };
});
ok('jumpRises', jumped.apex > 1.7 + 0.3, `apex=${jumped.apex}`);
ok('jumpSettlesExactly', Math.abs(jumped.settled - 1.7) < 0.02, `y=${jumped.settled}`);
ok('groundedAfterLanding', jumped.grounded === true);
await page.evaluate(() => {
  const g = window.__INFRAVERSE_APP__.current;
  for (let i = 0; i < 60; i++) g.controls.update(1 / 30);
});
const settled2 = await page.evaluate(() => +window.__INFRAVERSE_APP__.current.camera.position.y.toFixed(3));
ok('noBounceAfterJump', Math.abs(settled2 - 1.7) < 0.02, `y drifted to ${settled2}`);

/* walking into the control centre must not pass through it */
await page.evaluate(() => { window.__INFRAVERSE_APP__.current.controls.teleportTo(0, 1.7, -4, 0, 0); }); // face -Z toward the centre
await page.evaluate(() => {
  const g = window.__INFRAVERSE_APP__.current;
  const c = g.controls;
  c._keys.add('fwd');
  for (let i = 0; i < 90; i++) c.update(1 / 30);
  c._keys.delete('fwd');
});
const blocked = await page.evaluate(() => +window.__INFRAVERSE_APP__.current.camera.position.z.toFixed(2));
ok('collisionBlocksWalls', blocked > -11.2, `z=${blocked} (centre wall at -8.2/-11.2)`);

let failed = 0;
for (const [k, v] of Object.entries(out)) { if (!v.startsWith('PASS')) failed++; console.log(`${v.startsWith('PASS') ? '✓' : '✗'} ${k}${v.startsWith('PASS') ? '' : '  ' + v.slice(5)}`); }
console.log('errors:', errors.length ? errors.slice(0, 10) : 'zero');
await browser.close(); server.close();
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
