import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:8765/index.html', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);

const out = {};
out.menuCards = await page.locator('.facility-card').count();
out.menuOverview = (await page.locator('.overview-card').innerText()).includes('System Overview');
out.themeDefault = await page.evaluate(() => document.documentElement.dataset.theme);

// open two facilities in sequence, return to menu between them
for (const id of ['water', 'solar']) {
  await page.locator('.facility-card').nth(id === 'water' ? 1 : 4).click();
  await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  out[id] = await page.evaluate(() => ({ name: window.__NEXUS_APP__.current.meta.name, tabs: window.__NEXUS_APP__.current.tabs().length }));
  await page.getByRole('button', { name: 'Main Menu' }).click();
  await page.waitForTimeout(900);
  out[`${id}BackToMenu`] = await page.locator('.menu-screen').count() === 1;
}

// independence + persistence: save a distinct setting per facility, then reload
await page.evaluate(() => {
  const s = window.__NEXUS_APP__;
  s.openInfrastructure('parking');
});
await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 30000 });
await page.waitForTimeout(2400);
await page.evaluate(() => {
  const c = window.__NEXUS_APP__.current;
  c.setSpeed(5);
  c.saveConfig(false);
});
await page.getByRole('button', { name: 'Main Menu' }).click();
await page.waitForTimeout(800);

// global theme change + reload persistence
await page.evaluate(() => {
  document.documentElement.dataset.theme = 'light';
  window.__NEXUS_APP__.global = { ...window.__NEXUS_APP__.global, theme: 'light' };
  window.localStorage.setItem('idt.idt.global', JSON.stringify(window.__NEXUS_APP__.global));
  window.__NEXUS_APP__.current?.saveConfig?.(false);
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
out.afterReloadTheme = await page.evaluate(() => window.__NEXUS_APP__.global.theme);
out.afterReloadMenu = await page.locator('.facility-card').count();

await page.evaluate(() => window.__NEXUS_APP__.openInfrastructure('parking'));
await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 30000 });
await page.waitForTimeout(2500);
out.parkingSpeedPersisted = await page.evaluate(() => window.__NEXUS_APP__.current.speed);

await page.evaluate(() => window.__NEXUS_APP__.openInfrastructure('water'));
await page.waitForFunction(() => !!window.__NEXUS_APP__.current, null, { timeout: 30000 });
await page.waitForTimeout(2500);
out.waterSpeedIndependent = await page.evaluate(() => window.__NEXUS_APP__.current.speed);

out.errors = errors.slice(0, 5);
console.log(JSON.stringify(out, null, 1));
await browser.close();
