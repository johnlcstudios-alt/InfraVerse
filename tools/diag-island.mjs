import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--use-angle=swiftshader','--enable-webgl'] });
const page = await b.newPage({ viewport:{width:1200,height:700} });
await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
await page.evaluate(()=>window.__NEXUS_APP__.openInfrastructure('campus'));
await page.waitForFunction(()=>!!window.__NEXUS_APP__.current,null,{timeout:40000}); await page.waitForTimeout(2500);
const out = await page.evaluate(()=>{
  const c = window.__NEXUS_APP__.current;
  c.config.arrivalsEnabled = false;
  c.batterySoc = 60;
  if (!c.islandMode) c.toggleIsland();
  const rows=[];
  for (let i=0;i<6;i++){
    c.debugAdvance(60);
    rows.push({ t:Math.round(c.simTime), soc:+c.batterySoc.toFixed(2), pv:Math.round(c.pvPower), demand:Math.round(c.siteLoad), served:Math.round(c.loadServed), unserved:+c.unservedLoad.toFixed(2), batt:Math.round(c.batteryPower), shed:+c.shedLevel.toFixed(3), coldServed:Math.round(c.loads.cold.served), loadShedEnabled:c.loadShedEnabled });
  }
  return rows;
});
console.log(JSON.stringify(out,null,1));
await b.close();
