// Replays page: upload a .txt log (stored as log-only) and a recording (.json), list, view log, watch, delete; 200 cap
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const os=require('os');
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1400,height:1000},acceptDownloads:true});const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
// 1) make a recording on the same origin (all-AI game, fast)
await pg.goto('http://localhost:8765/tests/ui/rec.html');
const recJson=await pg.evaluate(async()=>{Math.random=Goldfish.mulberry(42);const T=boot(true);const t0=Date.now();while(!(T.game&&T.game.winner&&T.ended)&&Date.now()-t0<120000)await new Promise(r=>setTimeout(r,100));await new Promise(r=>setTimeout(r,300));return T.recordingJson()});
ok('all-AI game produced a recording',!!recJson&&JSON.parse(recJson).seats.length===4);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rp-'));const recF=path.join(dir,'game.json');fs.writeFileSync(recF,recJson);
const logF=path.join(dir,'old.txt');fs.writeFileSync(logF,'MTG Dashboard playtest log · engine v61 · 2026-11-04T14:02:07.249Z\nclient: x\nseat 1: You · Quintorius — Quintorius, History Chaser · life 35\nseat 2: AI · Cloud — Cloud, Ex-SOLDIER · expert · life 27\nresult: Cloud wins · round 9 · turn 32\n\n== turn 1 ==\nYou · Quintorius: plays Mountain\n');
// 2) the app page
await pg.goto('http://localhost:8765/#replays');
await pg.waitForSelector('#repup',{state:'attached',timeout:30000});
let n0=await pg.$$eval('.repitem',e=>e.length);ok('Replays tab opens and lists the stored game',n0>=1,'items='+n0);
await pg.setInputFiles('#repup',[logF,recF]);await pg.waitForFunction(n=>document.querySelectorAll('.repitem').length===n+2,n0,{timeout:10000}).catch(()=>{});
const items=await pg.$$eval('.repitem',e=>e.map(x=>x.textContent.replace(/\s+/g,' ').trim()));
ok('uploads added (log + recording)',items.length===n0+2,items.slice(0,3).join(' || '));
ok('text log marked log only, no Watch button',await pg.evaluate(()=>[...document.querySelectorAll('.repitem')].some(x=>/log only/.test(x.textContent)&&!x.querySelector('[data-r=play]'))));
await pg.evaluate(()=>[...document.querySelectorAll('.repitem')].find(x=>/log only/.test(x.textContent)).querySelector('[data-r=log]').click());
await pg.waitForFunction(()=>/plays Mountain/.test(document.querySelector('#replog').textContent),null,{timeout:5000}).catch(()=>{});ok('log viewer shows the text',/plays Mountain/.test(await pg.textContent('#replog')));
// watch the uploaded recording
await pg.evaluate(()=>[...document.querySelectorAll('.repitem')].find(x=>x.querySelector('[data-r=play]')).querySelector('[data-r=play]').click());
await pg.waitForSelector('.rpbar',{timeout:20000});
ok('replay starts with a transport bar',true);
await pg.click('[data-act=rp-speed][data-ms="150"]');ok('paced: game not over right after start',await pg.evaluate(()=>!GoldfishUI.current.game.winner));
await pg.waitForFunction(()=>{const T=GoldfishUI.current;return T.game&&T.game.turn>=3},null,{timeout:60000});
await pg.click('[data-act=rp-play]');await pg.waitForTimeout(300);const t1=await pg.evaluate(()=>GoldfishUI.current.game.log.length);await pg.waitForTimeout(1500);const t2=await pg.evaluate(()=>GoldfishUI.current.game.log.length);
ok('Pause stops playback',t1===t2,t1+' vs '+t2);
await pg.click('[data-act=rp-step]');await pg.waitForTimeout(400);
await pg.click('[data-act=leave]');await pg.waitForSelector('#repup',{state:'attached',timeout:10000});
ok('Exit replay returns to the list',await pg.$$eval('.repitem',e=>e.length)===n0+2);
// delete
await pg.evaluate(()=>document.querySelector('.repitem [data-r=del]').click());await pg.waitForTimeout(500);
ok('delete removes one',await pg.$$eval('.repitem',e=>e.length)===n0+1);
// cap at 200
const cnt=await pg.evaluate(async()=>{const R=GoldfishUI.replays;for(let i=0;i<205;i++)await R.put({id:1e12+i,name:'cap'+i,result:'',logOnly:true,text:'x'});return (await R.list()).length});
ok('store keeps at most 200',cnt===200,'count='+cnt);
console.log('errors',errs.filter(e=>!/404/.test(e)));await b.close();})();
