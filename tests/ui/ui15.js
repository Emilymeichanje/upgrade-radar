// manual tap-for-mana (float then cast), colour picker, Phyrexian pay-life option, Exotic Orchard colours
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
const mk=(name,type,mana,oracle,cmc)=>({name,type,mana,oracle,cmc});
// stage: two Islands + one Plains, an Opt in hand
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const mk=(name,type,mana,oracle,cmc)=>({name,type,mana,oracle,cmc});
  me.battlefield=me.battlefield.filter(b=>!b.card.isLand);let id=7000;const L=n=>({id:id++,card:tagCard(mk(n,'Basic Land — '+n,'','',0)),tapped:false,summoning:false,counters:0});
  me.battlefield.push(L('Island'),L('Island'),L('Plains'));me.pool=[];me.hand=[tagCard(mk('Opt','Instant','{U}','Draw a card.',1)),tagCard(mk('Gitaxian Probe','Sorcery','{U/P}','Look at target player\'s hand.\nDraw a card.',1))];U.render();});
// click the Island group → one Island taps, {U} floats
await pg.click(`[data-lg="0:Island"]`);
await pg.waitForFunction(()=>!GoldfishUI.current.busy);
let st=await pg.evaluate(()=>{const me=GoldfishUI.current.me;return {pool:me.pool.map(m=>m.c),tapped:me.battlefield.filter(b=>b.card.isLand&&b.tapped).map(b=>b.card.name)}});
ok('clicking a land floats its mana',st.pool.join('')==='U'&&st.tapped.join()==='Island',JSON.stringify(st));
ok('pool shown in the control bar',await pg.$$eval('.pool .pip',e=>e.map(x=>x.textContent).join(''))==='U');
// cast Opt: should use the floating {U}, leaving the second Island untapped
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const c=me.hand.find(c=>c.name==='Opt');return U.act(()=>U.game.cast(me,c,'hand'))});
await pg.waitForFunction(()=>!GoldfishUI.current.busy);
st=await pg.evaluate(()=>{const me=GoldfishUI.current.me;return {pool:me.pool.map(m=>m.c),untapped:me.battlefield.filter(b=>b.card.isLand&&!b.tapped).map(b=>b.card.name).sort()}});
ok('cast spent the floating mana; other lands untouched',st.pool.length===0&&st.untapped.join()==='Island,Plains',JSON.stringify(st));
// Phyrexian: casting Probe offers the pay-life option even though an Island is open
const probeBtns=await pg.evaluate(async()=>{const U=GoldfishUI.current,me=U.me;const c=me.hand.find(c=>c.name==='Gitaxian Probe');const p=U.act(()=>U.game.cast(me,c,'hand'));await new Promise(r=>setTimeout(r,150));const btns=[...document.querySelectorAll('[data-act=pay-alt],[data-act=pay-normal]')].map(b=>b.textContent);const alt=document.querySelector('[data-act=pay-alt]');if(alt)alt.click();window.__probe=p;return btns}); /* v110: don't await — Probe now prompts (whose hand / show hand); answered below */
// v110: Probe now asks whose hand and shows it — answer both prompts (it used to resolve silently)
{ let sawPick=false, sawHand=false; for(let i=0;i<40;i++){ const k=await pg.evaluate(()=>{const U=GoldfishUI.current;return U.busy?(U.prompt?U.prompt.kind:'busy'):'idle'}); if(k==='idle')break;
  if(k==='priority'){await pg.evaluate(()=>GoldfishUI.current.prompt.res(null));}
  else if(k==='player'){sawPick=true;await pg.click('[data-act=pick-player]');} else if(k==='may'){sawHand=await pg.evaluate(()=>!!(GoldfishUI.current.prompt.cards&&GoldfishUI.current.prompt.ok));await pg.click('[data-act=may-yes]');} else await pg.waitForTimeout(100); }
  ok('Gitaxian Probe asks whose hand, then shows it',sawPick&&sawHand,JSON.stringify({sawPick,sawHand})); }
await pg.waitForFunction(()=>!GoldfishUI.current.busy);
ok('Phyrexian cast offers normal + pay-life',probeBtns.some(t=>/Normal cost/.test(t))&&probeBtns.some(t=>/Pay 2 life for \{U\/P\}/.test(t)),JSON.stringify(probeBtns));
st=await pg.evaluate(()=>{const me=GoldfishUI.current.me;return {life:me.life,untapped:me.battlefield.filter(b=>b.card.isLand&&!b.tapped).length}});
ok('paid 2 life, lands untouched',st.life===38&&st.untapped===2,JSON.stringify(st));
// multi-colour source → colour picker; Exotic Orchard offers only opponents' colours
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const mk=(name,type,mana,oracle,cmc)=>({name,type,mana,oracle,cmc});
  me.battlefield.push({id:7100,card:tagCard(mk('Exotic Orchard','Land','','{T}: Add one mana of any color that a land an opponent controls could produce.',0)),tapped:false,summoning:false,counters:0});
  for(const q of g.players.slice(1))q.battlefield=q.battlefield.filter(b=>!b.card.isLand);g.players[1].battlefield.push({id:7101,card:tagCard(mk('Swamp','Basic Land — Swamp','','',0)),tapped:false,counters:0},{id:7102,card:tagCard(mk('Mountain','Basic Land — Mountain','','',0)),tapped:false,counters:0});U.render();});
await pg.click(`[data-lg="0:Exotic Orchard"]`);
const cols=await pg.$$eval('[data-act=tap-col]',e=>e.map(x=>x.dataset.c).sort().join(''));
ok('Orchard picker offers exactly opponents\' colours',cols==='BR',cols);
await pg.click('[data-act=tap-col][data-c="R"]');await pg.waitForFunction(()=>!GoldfishUI.current.busy);
st=await pg.evaluate(()=>GoldfishUI.current.me.pool.map(m=>m.c).join(''));ok('chosen colour floated',st==='R',st);
// undo reverses a manual tap
await pg.click('[data-act=undo]');await pg.waitForFunction(()=>!GoldfishUI.current.busy);
st=await pg.evaluate(()=>{const me=GoldfishUI.current.me;return {pool:me.pool.length,orch:me.battlefield.find(b=>b.card.name==='Exotic Orchard').tapped}});
ok('undo untaps and clears the pool',st.pool===0&&st.orch===false,JSON.stringify(st));
// log export: header + every engine line, downloaded as a file
const dl=pg.waitForEvent('download',{timeout:5000}).catch(()=>null);await pg.click('[data-act=export-log]');const d=await dl;
const txt=await pg.evaluate(()=>GoldfishUI.current.logText());
ok('export downloads a .txt',!!d&&/^playtest-.*\.txt$/.test(d.suggestedFilename()),d&&d.suggestedFilename());
ok('log text has header, seats and turn markers',/engine (v\d+|\?)/.test(txt)&&/seat 1: You/.test(txt)&&/== turn \d+ ==/.test(txt)&&txt.split('\n').length>6,txt.split('\n').slice(0,6).join(' | '));
// counter badge: quest counter shows on a non-creature permanent
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const {tagCard}=Goldfish;me.battlefield.push({id:7200,card:tagCard({name:'Questy',type:'Enchantment',mana:'{W}',oracle:'',cmc:1}),tapped:false,counters:0,quest:3});U.render();});
ok('quest counters shown on the tile',/3Q/.test(await pg.$eval('.gc[data-pid="7200"] .ctr',e=>e.textContent).catch(()=>'')),'');
// clicking a permanent with one tap ability activates it
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const {tagCard}=Goldfish;const c=tagCard({name:'Pinger',type:'Creature — Wizard',mana:'{U}',oracle:'{T}: Draw a card.',cmc:1,power:1,toughness:1});me.battlefield.push({id:7300,card:c,tapped:false,summoning:false,counters:0});U.render();});
const h0=await pg.evaluate(()=>GoldfishUI.current.me.hand.length);
await pg.click('.gc[data-pid="7300"]');
// v112: if an instant is in hand you correctly get priority to respond to your own ability — pass it (the test was flaky on the random Probe draw)
for(let i=0;i<50;i++){const st=await pg.evaluate(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return 'passed'}return U.game.stack.length?'stack':'done'});if(st==='done')break;await pg.waitForTimeout(100);}console.log('dbg',await pg.evaluate(()=>{const U=GoldfishUI.current;return {busy:U.busy,prompt:U.prompt&&U.prompt.kind,mode:U.mode&&U.mode.kind,myTurn:U.myTurn,opts:(U.mainOpts||[]).length,log:U.game.log.slice(-3).map(l=>l.m)}}));
const r2=await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const p=me.battlefield.find(b=>b.id===7300);return {tapped:p.tapped,hand:me.hand.length,prompt:U.prompt&&U.prompt.kind,opts:U.prompt&&U.prompt.options&&U.prompt.options.map(o=>o.kind+':'+(o.card&&o.card.name)),log:U.game.log.slice(-4).map(l=>l.m)}});
ok('click on a permanent activates its tap ability',r2.tapped&&r2.hand===h0+1,JSON.stringify(r2)+' h0='+h0);
console.log('errors',errs);await b.close();})();
