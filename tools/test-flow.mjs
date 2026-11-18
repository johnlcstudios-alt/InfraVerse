import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--use-angle=swiftshader','--enable-webgl'] });
const page = await browser.newPage({ viewport:{width:1400,height:860} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(600);
await page.evaluate(()=>window.__NEXUS_APP__.openInfrastructure('solar'));
await page.waitForTimeout(2600);
const r = await page.evaluate(()=>{
  const c=window.__NEXUS_APP__.current;
  c.debugAdvance(60);
  const snap = () => c.flows.map(f=>({id:f.id, count:f.dots.count, u:+f.u?.toFixed?.(3) ?? null, ratio:+(f.ratio??0).toFixed(2)}));
  const before = snap();
  // advance the visual animation a few frames
  for (let i=0;i<30;i++){ c.updateSimulation(0.05); c._updateVisuals?.(0.05); }
  const mid = snap();
  // kill generation
  if (c.setArrayEnabled) c.setArrayEnabled(false);
  c.debugAdvance(45);
  const off = snap();
  if (c.setArrayEnabled) c.setArrayEnabled(true);
  c.debugAdvance(45);
  const back = snap();
  return { before, mid, off, back, ok: before.some(f=>f.count>0) && off.filter(f=>f.id==='generation').every(f=>f.count===0) && back.some(f=>f.count>0) };
});
console.log(JSON.stringify(r,null,1));
console.log('ERRORS', JSON.stringify(errs.slice(0,3)));
await browser.close();
