import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const EXE = 'C:\\xampp\\htdocs\\3DInfra\\dist\\IndustrialDigitalTwinSimulator\\IndustrialDigitalTwinSimulator.exe';
const cwd = 'C:\\xampp\\htdocs\\3DInfra\\dist\\IndustrialDigitalTwinSimulator';

const port = 9400 + Math.floor(Math.random() * 500);
const child = spawn(EXE, [], {
  cwd,
  env: { ...process.env, IDT_DEBUG_PORT: String(port) },
  detached: false, stdio: 'ignore',
});

let endpoint = null;
for (let i = 0; i < 40; i++) {
  await sleep(700);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (res.ok) { endpoint = (await res.json()).webSocketDebuggerUrl; break; }
  } catch { /* not up yet */ }
}
if (!endpoint) { console.log(JSON.stringify({ ok: false, reason: 'devtools endpoint never appeared' })); child.kill(); process.exit(0); }

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const contexts = browser.contexts();
const pages = contexts.flatMap(c => c.pages());
const page = pages.find(p => p.url().includes('app.idt.local')) || pages[0];
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

async function settle(p, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    try {
      const state = await p.evaluate(() => document.readyState);
      if (state === 'complete' || state === 'interactive') {
        const ready = await p.evaluate(() => !!window.__NEXUS_APP__);
        if (ready) return true;
      }
    } catch { /* navigating */ }
    await sleep(600);
  }
  return false;
}

await settle(page);
const out = { ok: true };
out.url = page.url();
out.title = await page.title();
out.nativeBootConfig = await page.evaluate(() => {
  const b = window.__IDT_BOOT_CONFIG__;
  return b ? { present: true, keys: Object.keys(b) } : { present: false };
});
out.nativeBridge = await page.evaluate(() => !!(window.chrome && window.chrome.webview));
out.cards = await page.locator('.facility-card').count();
out.storageEngine = await page.evaluate(() => (window.chrome && window.chrome.webview) ? 'native' : 'localStorage');

// open the Solar facility inside the real desktop host
await page.locator('.facility-card').nth(4).click();
await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 40000 });
await page.waitForTimeout(4000);
out.opened = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.debugAdvance(60);
  return {
    name: c.meta.name, sensors: c.sensorDefs.length, objects: c.objects.size,
    soc: Math.round(c.batterySoc), solarPower: Math.round(c.solarPower),
    flows: c.flows.map(f => f.dots.count), tab: c.activeTab,
  };
});
// exercise a control and confirm it reaches the native store
out.batteryTest = await page.evaluate(async () => {
  const c = window.__NEXUS_APP__.current;
  if (c.setArrayEnabled) c.setArrayEnabled(false);
  c.debugAdvance(30);
  const gen = Math.round(c.solarPower);
  if (c.setArrayEnabled) c.setArrayEnabled(true);
  c.saveConfig(true);
  return { genWithPanelsOff: gen };
});
await page.screenshot({ path: 'C:\\xampp\\htdocs\\3DInfra\\assets\\native-solar.png' });
await page.getByRole('button', { name: 'Main Menu' }).click();
await page.waitForTimeout(1500);
out.backToMenu = await page.locator('.menu-screen').count() === 1;

// toggle 3D visibility inside the native host (roof/walls) and confirm simulation continues
await page.locator('.facility-card').nth(3).click();
await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 40000 });
await page.waitForTimeout(3500);
out.visibility = await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  const t0 = c.simTime;
  c.hideCategoryIds(['roof', 'ceiling', 'walls']);
  c.debugAdvance(30);
  const vis = c.scene.getVisibility();
  const state = c.getRunState();
  c.showAllCategories();
  return { roofHidden: vis.roof === false, wallsHidden: vis.walls === false, simAdvanced: c.simTime > t0, state };
});
await page.screenshot({ path: 'C:\\xampp\\htdocs\\3DInfra\\assets\\native-cold.png' });
out.errors = errors.slice(0, 6);

console.log(JSON.stringify(out, null, 1));
try { await browser.close(); } catch { /* ignore */ }
child.kill();
