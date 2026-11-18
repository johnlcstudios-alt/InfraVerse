import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EXE = 'C:\\xampp\\htdocs\\3DInfra\\dist\\IndustrialDigitalTwinSimulator\\IndustrialDigitalTwinSimulator.exe';
const cwd = 'C:\\xampp\\htdocs\\3DInfra\\dist\\IndustrialDigitalTwinSimulator';
const port = 9500 + Math.floor(Math.random() * 400);
const child = spawn(EXE, [], { cwd, env: { ...process.env, IDT_DEBUG_PORT: String(port) }, stdio: 'ignore' });

let ok = false;
for (let i = 0; i < 40; i++) { await sleep(700); try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) { ok = true; break; } } catch {} }
if (!ok) { console.log(JSON.stringify({ ok: false })); child.kill(); process.exit(0); }

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
let page = null;
for (let i = 0; i < 30 && !page; i++) {
  const pages = (await browser.contexts()).flatMap(c => c.pages());
  page = pages.find(p => p.url().includes('app.idt.local')) || (pages.length === 1 ? pages[0] : null);
  if (!page) await sleep(500);
}
if (!page) { console.log(JSON.stringify({ ok: false, reason: 'no page target' })); try { await browser.close(); } catch {} child.kill(); process.exit(0); }
for (let i = 0; i < 15; i++) { try { if (await page.evaluate(() => !!window.__NEXUS_APP__)) break; } catch {} await sleep(500); }

const rows = [];
for (const id of ['parking', 'water', 'conveyor', 'cold', 'solar']) {
  await page.evaluate(f => window.__NEXUS_APP__.openInfrastructure(f), id);
  await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 40000 });
  await page.waitForTimeout(9000);
  const s = await page.evaluate(() => {
    const c = window.__NEXUS_APP__.current;
    return { id: c.id, fps: c.scene.fps.value, calls: c.scene.fps.calls, tris: c.scene.fps.tris, objects: c.objects.size };
  });
  rows.push(s);
  await page.evaluate(() => window.__NEXUS_APP__.current.host.closeInfrastructure());
  await page.waitForTimeout(600);
}
console.log(JSON.stringify(rows, null, 1));
try { await browser.close(); } catch {}
child.kill();
