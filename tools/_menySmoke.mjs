import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const exe = 'C:/xampp/htdocs/3DInfra/dist/TwinOps/TwinOps.exe';
const proc = spawn(exe, [], { env: { ...process.env, IDT_DEBUG_PORT: '9343' }, stdio: 'ignore' });
const errors = [];
try {
  let browser = null;
  for (let i = 0; i < 40 && !browser; i++) { await new Promise(r => setTimeout(r, 500)); try { browser = await chromium.connectOverCDP('http://127.0.0.1:9343'); } catch { } }
  if (!browser) throw new Error('no CDP endpoint');
  const page = await browser.contexts()[0].pages()[0];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.waitForFunction(() => !!window.__TWINOPS_GAME__, null, { timeout: 40000 });
  await page.waitForTimeout(5000);
  const out = {};
  out.menuShows = await page.evaluate(() => !!document.querySelector('.twops-deploy-grid'));
  out.menuCards = await page.evaluate(() => document.querySelectorAll('.twops-deploy-card').length);
  // deploy to cold storage through the real menu card click path
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.twops-deploy-card')];
    const cold = cards.find(c => c.textContent.includes('CLD-04'));
    cold.click();
  });
  await page.waitForTimeout(1500);
  out.spawnedAtCold = await page.evaluate(() => {
    const g = window.__TWINOPS_GAME__;
    const p = g.camera.position;
    return { x: +p.x.toFixed(1), z: +p.z.toFixed(1), nearColdPlot: Math.hypot(p.x + 54, p.z - 12) < 25 };
  });
  // district culling: far districts hidden, cold visible
  out.culling = await page.evaluate(() => {
    const g = window.__TWINOPS_GAME__;
    const vis = {};
    for (const [id, w] of Object.entries(g.twinWrappers)) vis[id] = w.visible;
    return vis;
  });
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = (out.menuShows && out.menuCards >= 6 && out.spawnedAtCold.nearColdPlot && out.culling.cold === true) ? 0 : 1;
} catch (e) { console.log('SMOKE FAIL:', e.message); process.exitCode = 1; } finally { setTimeout(() => { try { proc.kill(); } catch { } }, 9000); }
