// split attacks between two opponents; own-trigger stops once per source; Badgersaur casts without a target prompt
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const {tagCard}=Goldfish;let id=9500;const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
  for(let i=0;i<3;i++)me.battlefield.push({id:id++,card:tagCard({...mk('Spirit','Token Creature — Spirit','','',0,3,2),token:true}),tapped:false,summoning:false,counters:0});
  me.battlefield.push({id:id++,card:tagCard(mk('Shared Animosity','Enchantment','{2}{R}','Whenever a creature you control attacks, it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it.',3)),tapped:false,summoning:false,counters:0});
  me.battlefield.push({id:id++,card:tagCard(mk('Selfless Spirit','Creature — Spirit Cleric','{1}{W}','Flying\nSacrifice this creature: Creatures you control gain indestructible until end of turn.',2,2,1)),tapped:false,summoning:false,counters:0});
  me.hand.push(tagCard(mk('Surly Badgersaur','Creature — Badger Dinosaur','{3}{R}','Whenever you discard a creature card, put a +1/+1 counter on this creature.\nWhenever you discard a land card, create a Treasure token.\nWhenever you discard a noncreature, nonland card, this creature fights up to one target creature you don\'t control.',4,3,3)));
  U.render();});
ok('Badgersaur needs no target on cast',await pg.evaluate(()=>!GoldfishUI.current.needsTarget(GoldfishUI.current.me.hand.find(c=>c.name==='Surly Badgersaur'))));
// split: Attack → pick opp 1, click two spirits → pick opp 2, click third spirit
await pg.click('[data-act=attack]');
const ids=await pg.evaluate(()=>GoldfishUI.current.me.battlefield.filter(b=>b.card.name==='Spirit').map(b=>b.id));
const opps=await pg.$$eval('[data-act=def]',e=>e.map(x=>x.dataset.p));
await pg.click(`[data-act=def][data-p="${opps[0]}"]`);await pg.click(`.gc[data-pid="${ids[0]}"]`);await pg.click(`.gc[data-pid="${ids[1]}"]`);
await pg.click(`[data-act=def][data-p="${opps[1]}"]`);await pg.click(`.gc[data-pid="${ids[2]}"]`);
let m=await pg.evaluate(()=>[...GoldfishUI.current.mode.map].map(([k,v])=>k.id+'>'+v.i));
ok('picking a second target keeps earlier assignments',m.length===3&&new Set(m.map(x=>x.split('>')[1])).size===2,JSON.stringify(m));
// click an assigned spirit while a different target is selected → it moves
await pg.click(`.gc[data-pid="${ids[0]}"]`);m=await pg.evaluate(()=>[...GoldfishUI.current.mode.map].map(([k,v])=>k.id+'>'+v.i));
ok('clicking an assigned creature moves it to the current target',m.find(x=>x.startsWith(ids[0]+'>')).endsWith('>'+opps[1]),JSON.stringify(m));
// go: engine receives two defenders; Shared Animosity triggers → at most one stop for them
const r=await pg.evaluate(async()=>{const U=GoldfishUI.current;let stops=0;const t0=Date.now();const p=(async()=>{while(Date.now()-t0<8000){await new Promise(r=>setTimeout(r,60));if(U.prompt&&U.prompt.kind==='priority'){const top=U.prompt.stack&&U.prompt.stack[U.prompt.stack.length-1];if(top&&top.caster===U.me&&top.trig)stops++;U.prompt.res(null);}else if(U.prompt&&U.prompt.kind==='block'){U.prompt.res(new Map());}else if(!U.busy&&!U.prompt&&U.turnPhase!=='combat')break;}})();
  document.querySelector('[data-act=atk-go]').click();await p;const defs=new Set((U.game._atkList||[]).map(a=>a.defender&&a.defender.i));return {stops,defs:[...defs],log:U.game.log.slice(-8).map(l=>l.m)}});
ok('attack went to two different players',r.defs.length===2||/→ AI · P1.*→ AI · P2|→ AI · P2.*→ AI · P1/.test(r.log.join(' ')),JSON.stringify(r));
ok('own Shared Animosity triggers stopped at most once',r.stops<=1,'stops='+r.stops);
// graveyard / exile viewer
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const {tagCard}=Goldfish;for(let i=0;i<4;i++)me.graveyard.push(tagCard({name:'Dead'+i,type:'Creature — Zombie',mana:'{B}',oracle:'',cmc:1,power:1,toughness:1}));me.exile.push(tagCard({name:'Gone',type:'Sorcery',mana:'{R}',oracle:'',cmc:1}));U.render();});
await pg.click(`[data-act=zone][data-p="0"][data-z="graveyard"]`);
let z=await pg.evaluate(()=>({open:!!document.querySelector('.set.zone'),n:document.querySelectorAll('.set.zone .sopt').length,title:(document.querySelector('.set.zone h3')||{}).textContent}));
ok('graveyard viewer opens and lists the cards',z.open&&z.n>=4&&/graveyard/.test(z.title),JSON.stringify(z));
await pg.click('.set.zone [data-act=zone][data-z="exile"]');
z=await pg.evaluate(()=>({n:document.querySelectorAll('.set.zone .sopt').length,title:(document.querySelector('.set.zone h3')||{}).textContent}));
ok('switches to exile',z.n===1&&/exile/.test(z.title),JSON.stringify(z));
await pg.click('[data-act=close-zone]');ok('closes',await pg.evaluate(()=>!document.querySelector('.set.zone')));
console.log('errors',errs);await b.close();})();
