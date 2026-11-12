const {chromium}=require('playwright');const fs=require('fs');
(async()=>{const rec=fs.readFileSync(process.argv[2],'utf8');const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});pg.on('pageerror',e=>console.log('ERR',e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/../tests/ui/rec.html');
const r=await pg.evaluate(async txt=>{const rec=JSON.parse(txt);const el=document.querySelector('#gt')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'gt'}));
  const T=GoldfishUI.replay(el,rec,{onExit:()=>{}});T.rp.delay=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const t0=Date.now();while(Date.now()-t0<100000){await sleep(30);if(T.rpDone||(T.game&&T.game.winner&&T.ended))break}
  const log=T.game.log.map(x=>x.m);return {done:!!T.rpDone,desync:T.rpDesync||T.rp&&T.rp.desync||null,turn:T.game.turn,winner:T.game.winner&&T.game.winner.name,reb:log.filter(m=>/rebound|Distortion Strike/.test(m)),tail:log.slice(-4)}},rec);
console.log(JSON.stringify(r,null,1));await b.close()})();
