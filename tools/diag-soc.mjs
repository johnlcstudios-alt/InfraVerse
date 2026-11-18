import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--use-angle=swiftshader','--enable-webgl'] });
const page = await b.newPage({ viewport:{width:1200,height:700} });
await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
await page.evaluate(()=>window.__NEXUS_APP__.openInfrastructure('campus'));
await page.waitForFunction(()=>!!window.__NEXUS_APP__.current,null,{timeout:40000}); await page.waitForTimeout(2500);
const out = await page.evaluate(()=>{
  const c = window.__NEXUS_APP__.current;
  c.config.arrivalsEnabled = false;
  c.pauseSimulation();
  c.batterySoc = 60;
  if (!c.islandMode) c.toggleIsland();
  const rows=[];
  for (let i=0;i<5;i++){
    const before = c.batterySoc;
    c.updateSimulation(0.05);
    rows.push({ step:i, socBefore:+before.toFixed(4), socAfter:+c.batterySoc.toFixed(4), battKW:+(c.batteryPower/1000).toFixed(2), servedKW:+(c.loadServed/1000).toFixed(2), unservedKW:+c.unservedLoad.toFixed(2) });
  }
  return { rows, island:c.islandMode, loadShedEnabled:c.loadShedEnabled };
});
console.log(JSON.stringify(out,null,1));
await b.close();
