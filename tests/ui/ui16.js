// audio styles, music engine, arena fx: every path runs without errors; settings persist
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
const names=['draw','land','cast','castCreature','castInstant','castSorcery','castArtifact','castEnchantment','castPlaneswalker','resolve','counterCast','counter','attack','block','hit','bigHit','destroy','wipe','gain','lifeLoss','token','turn','prompt','click','die','win','lose','combo','tap','equip','exile','shuffle'];
const r=await pg.evaluate(async(names)=>{const U=GoldfishUI.current;const S=U.sfx;S.s.sound=true;const out={};for(const st of ['classic','arcane','retro','cinematic']){S.s.sfxStyle=st;let n=0;for(const k of names){try{S.play(k);n++}catch(e){out[st+':'+k]=String(e)}}out[st]=n}
  for(const m of ['ambient','tavern','battle']){S.s.music=m;try{S.musicStart();await new Promise(r=>setTimeout(r,700));out['music:'+m]=!!S.musicTimer&&!!S.musicBus;S.musicStop()}catch(e){out['music:'+m]=String(e)}}
  out.ctxState=S.ctx&&S.ctx.state;return out},names);
ok('all 32 sounds × 4 styles play without throwing',['classic','arcane','retro','cinematic'].every(s=>r[s]===names.length),JSON.stringify(r));
ok('three music moods schedule and stop',r['music:ambient']===true&&r['music:tavern']===true&&r['music:battle']===true,JSON.stringify(r));
// arena fx: cast burst, hit slash+shake, lightning, shards, confetti
const fx=await pg.evaluate(async()=>{const U=GoldfishUI.current;U.s.fx='arena';U.s.anim=true;U.ff=false;const me=U.me;const rect={left:200,top:200,width:60,height:80};
  U.fxCast({colors:['R']},rect);U.fxHit(U.game.players[1],9);const el=document.querySelector('.gc');U.fxLightning(el);U.fxShatter(el);U.fxConfetti();await new Promise(r=>setTimeout(r,50));
  return {burst:!!document.querySelector('.fx.burst'),slash:!!document.querySelector('.fx.slash'),shake:document.body.classList.contains('fx-shake'),bolt:!!document.querySelector('.fx.bolt'),shards:document.querySelectorAll('.fx.shards i').length,confetti:document.querySelectorAll('.fx.confetti i').length}});
ok('arena effects render',fx.burst&&fx.slash&&fx.shake&&fx.bolt&&fx.shards===10&&fx.confetti===60,JSON.stringify(fx));
await pg.waitForTimeout(4000);
ok('effects clean themselves up',await pg.evaluate(()=>document.querySelectorAll('.fx').length)===0);
// settings UI round trip
await pg.click('[data-act=settings]');await pg.selectOption('#st-sfx','retro');await pg.selectOption('#st-music','tavern');await pg.selectOption('#st-fx','arena');await pg.click('[data-act=close-settings]');
const saved=JSON.parse(await pg.evaluate(()=>localStorage.getItem('pt-settings')));
ok('settings persisted',saved.sfxStyle==='retro'&&saved.music==='tavern'&&saved.fx==='arena',JSON.stringify(saved));
ok('music running after selecting it',await pg.evaluate(()=>!!GoldfishUI.current.sfx.musicTimer));
await pg.click('[data-act=leave]');await pg.waitForTimeout(300);
ok('music stops on leave',await pg.evaluate(()=>!GoldfishUI.current.sfx.musicTimer));
console.log('errors',errs);await b.close();})();
