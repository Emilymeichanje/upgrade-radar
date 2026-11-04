const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1280,height:720}});await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/ui5.html');await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
for(const z of [1,1.5,2]){await pg.evaluate(z=>GoldfishUI.current.setZoom(z),z);await pg.click('[data-act=settings]');
 const r=await pg.evaluate(()=>{const btns=[...document.querySelectorAll('.set [data-act=close-settings]')].map(b=>{const r=b.getBoundingClientRect();return [Math.round(r.top),Math.round(r.bottom)]});const box=document.querySelector('.set .box').getBoundingClientRect();return {btns,boxBottom:Math.round(box.bottom),vh:innerHeight}});
 const vis=r.btns.some(([t,bt])=>t>=0&&bt<=r.vh);console.log('zoom',z,vis?'PASS':'FAIL','Done visible',JSON.stringify(r));await pg.click('.set .sethead [data-act=close-settings]');}
await b.close();})();
