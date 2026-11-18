import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--use-angle=swiftshader','--enable-webgl'] });
const page = await b.newPage({ viewport:{width:1200,height:700} });
await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
await page.evaluate(()=>window.__NEXUS_APP__.openInfrastructure('campus'));
await page.waitForFunction(()=>!!window.__NEXUS_APP__.current,null,{timeout:40000}); await page.waitForTimeout(2500);
const out = await page.evaluate(()=>{
  const c = window.__NEXUS_APP__.current;
  c.config.arrivalsEnabled = false; c.clearTrucks();
  c.rawStock = 0;
  const rule = c.alarmRules.find(r=>r.id==='starvation');
  const rows=[];
  for (let i=0;i<5;i++){ c.debugAdvance(150); rows.push({ t:Math.round(c.simTime), raw:+c.rawStock.toFixed(1), rate:Math.round(c.productionRate), running:c.lineRunning, jam:c.lineJam, starve:Math.round(c.starveTimer||0), threshold:c.threshold('rawStarvationMinutes',8), active: rule? rule.active(): null, alarms:c.getActiveAlarms().map(a=>a.id) }); }
  return { rows, hasRule: !!rule, alarmsEnabled: c.config.alarmsEnabled };
});
console.log(JSON.stringify(out,null,1));
await b.close();
