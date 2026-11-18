import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true, args:['--use-angle=swiftshader','--enable-webgl'] });
const page = await browser.newPage({ viewport:{width:1600,height:900} });
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'}); await page.waitForTimeout(900);
console.log('cards', await page.locator('.facility-card').count(), 'platformBar', await page.locator('.platform-bar').count());
console.log('scrollH', await page.evaluate(()=>document.querySelector('.menu-main').scrollHeight), 'clientH', await page.evaluate(()=>document.querySelector('.menu-main').clientHeight));
await page.screenshot({path:'docs/qa/menu-six.png'});
// About + credits
await page.getByRole('button',{name:'About'}).first().click(); await page.waitForTimeout(500);
const txt = await page.locator('.modal').innerText();
console.log('credits cards', await page.locator('.credit-card').count(), 'members listed', await page.locator('.credit-list li').count());
console.log('has groups:', ['Group 1','Group 3','Group 4','Group 5','Group 6'].every(g=>txt.includes(g)));
console.log('sample names:', txt.includes('GERMAN, EARL ZACHARRY P.'), txt.includes('SAMAR, ANGELYN C.'));
await page.screenshot({path:'docs/qa/about-credits.png'});
console.log('ERRORS', JSON.stringify(errs.slice(0,4)));
await browser.close();
