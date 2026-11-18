import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--use-angle=swiftshader','--enable-webgl'] });
const page = await b.newPage({ viewport:{width:1200,height:700} });
await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(700);
await page.evaluate(()=>window.__NEXUS_APP__.openInfrastructure('campus'));
await page.waitForFunction(()=>!!window.__NEXUS_APP__.current,null,{timeout:40000}); await page.waitForTimeout(6000);
const out = await page.evaluate(()=>{
  const c = window.__NEXUS_APP__.current; const rows=[];
  for (const cat of c.scene.categoryOrder){ let n=0, inst=0; cat.group.traverse(o=>{ if(o.isMesh){ if(o.isInstancedMesh) inst++; else n++; } }); rows.push({cat:cat.id, meshes:n, instanced:inst}); }
  rows.sort((a,b)=>(b.meshes+b.instanced)-(a.meshes+a.instanced));
  return rows.filter(r=>r.meshes+r.instanced>0).slice(0,16);
});
console.log(JSON.stringify(out));
await b.close();
