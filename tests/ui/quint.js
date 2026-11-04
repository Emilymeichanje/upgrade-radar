const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text())});
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/../fixtures/gap'+i+'.json'));
const rows=Object.fromEntries(['Quintorius, History Chaser','Deification','Ghost Vacuum',"Gideon's Memorial",'Staff of the Storyteller','Hofri Ghostforge','Banon, the Returners\' Leader'].map(n=>{const a=R.find(x=>x[1]===n);return [n,a?{name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]}:null]}));
await pg.evaluate((rows)=>{window.__rows=rows;const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;let id=9000;
  const mk=(name,type,mana,oracle,cmc)=>({name,type,mana,oracle,cmc});
  me.battlefield=me.battlefield.filter(b=>!b.card.isLand);for(let i=0;i<8;i++)me.battlefield.push({id:id++,card:tagCard(mk('Plains','Basic Land — Plains','','',0)),tapped:false,summoning:false,counters:0});
  for(const n of ['Quintorius, History Chaser','Ghost Vacuum',"Gideon's Memorial",'Staff of the Storyteller','Hofri Ghostforge']){const c=tagCard(rows[n]);const pm={id:id++,card:c,tapped:false,summoning:false,counters:0};if(c.isPlaneswalker)pm.loyalty=9;me.battlefield.push(pm);}
  me.hand=[tagCard(mk('Opt','Instant','{U}','Draw a card.',1)),tagCard(mk('Bear','Creature — Bear','{1}{G}','',2)),tagCard(rows['Deification'])];
  for(let i=0;i<19;i++)me.graveyard.push(tagCard(mk('Dead'+i,i%2?'Creature — Zombie':'Sorcery','{B}','',1)));
  g.players[1].graveyard.push(tagCard(mk('OppDead','Creature — Elf','{G}','',1)));
  me.pool=[];U.render();},rows);
// 1) Gideon's Memorial must NOT offer its damage ability outside combat / from battlefield
let opts=await pg.evaluate(()=>(GoldfishUI.current.game.abilityOptions(GoldfishUI.current.me,{})||[]).map(o=>o.card.name+':'+(o.ab.label||o.ab.text||'').slice(0,40)));
ok("Gideon's Memorial damage ability not offered on battlefield outside combat",!opts.some(s=>/Memorial.*(4 damage|deals)/i.test(s)),JSON.stringify(opts));
// 2) Quintorius +1 via UI: must prompt, not hang
const q=await pg.evaluate(async()=>{const U=GoldfishUI.current,me=U.me;const o=U.game.abilityOptions(me,{}).find(o=>/Quintorius/.test(o.card.name)&&/discard|draw/i.test(JSON.stringify(o.ab.ops)));if(!o)return {noOpt:true};const p=U.act(()=>U.game.activate(me,o));const t0=Date.now();let seen=[];while(Date.now()-t0<4000){await new Promise(r=>setTimeout(r,100));if(U.prompt&&!seen.includes(U.prompt.kind))seen.push(U.prompt.kind);if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);}else if(U.prompt&&U.prompt.kind==='may'){const y=document.querySelector('[data-act=may-yes],[data-act=yes]');if(y)y.click();}else if(U.prompt&&U.prompt.kind==='discard'){U.prompt.res(me.hand[0]);}else if(!U.busy)break;}
  return {busy:U.busy,seen,hand:me.hand.length,gy:me.graveyard.length,log:U.game.log.slice(-6).map(l=>l.m)}});
ok('Quintorius +1 resolves without hanging',q.busy===false,JSON.stringify(q));
// 3) Deification cast from hand → must prompt the human for a planeswalker type
const d=await pg.evaluate(async()=>{const U=GoldfishUI.current,me=U.me;const c=me.hand.find(c=>c.name==='Deification');const p=U.act(()=>U.game.cast(me,c,'hand'));const t0=Date.now();let seen=[];while(Date.now()-t0<4000){await new Promise(r=>setTimeout(r,100));if(U.prompt&&!seen.includes(U.prompt.kind))seen.push(U.prompt.kind);if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);}else if(U.prompt&&U.prompt.kind==='choice'){const b=[...document.querySelectorAll('[data-act=pick-choice]')];const o=b.find(x=>/quintorius/i.test(x.textContent))||b[0];if(o)o.click();}else if(!U.busy&&!U.prompt)break;}
  const pm=me.battlefield.find(b=>b.card.name==='Deification');return {seen,chosen:pm&&pm.chosenType,busy:U.busy,log:U.game.log.slice(-3).map(l=>l.m)}});
ok('Deification prompts for a planeswalker type',d.seen.includes('choice')&&d.chosen==='quintorius',JSON.stringify(d));
// 4) Ghost Vacuum tap: human must choose which graveyard card
const v=await pg.evaluate(async()=>{const U=GoldfishUI.current,me=U.me;const o=U.game.abilityOptions(me,{}).find(o=>/Vacuum/.test(o.card.name)&&o.ab.cost.total===0);if(!o)return {noOpt:true};const p=U.act(()=>U.game.activate(me,o));const t0=Date.now();let seen=[],n=0;while(Date.now()-t0<4000){await new Promise(r=>setTimeout(r,100));if(U.prompt&&!seen.includes(U.prompt.kind))seen.push(U.prompt.kind);if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);}else if(U.prompt&&U.prompt.kind==='search'){n=document.querySelectorAll('.sopt').length;const own=document.querySelectorAll('.sopt .own').length;if(own<n)seen.push('no-owner-labels');const b=[...document.querySelectorAll('.sopt')].find(x=>x.dataset.name==='dead3');b.click();}else if(!U.busy&&!U.prompt)break;}
  const vac=me.battlefield.find(b=>b.card.name==='Ghost Vacuum');return {seen,n,held:vac&&(vac.held||[]).map(c=>c.name),busy:U.busy,log:U.game.log.slice(-3).map(l=>l.m)}});
ok('Ghost Vacuum lets the human pick the graveyard card (own gy allowed)',v.seen.includes('search')&&!v.seen.includes('no-owner-labels')&&v.n>=20&&(v.held||[]).includes('Dead3'),JSON.stringify(v));
const m=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const R=window.__rows;const c=tagCard(R["Gideon's Memorial"]);me.hand.push(c);
  const none=g.abilityOptions(me,{instant:true}).some(o=>o.card===c);
  const bear={id:9900,card:tagCard({name:'Bear',type:'Creature — Bear',mana:'{1}{G}',oracle:'',cmc:2,power:2,toughness:2}),tapped:false,summoning:false,counters:0};g.players[1].battlefield.push(bear);const ph=g.phase;g.phase='combat';g.curAttackers=[bear];
  const some=g.abilityOptions(me,{instant:true}).some(o=>o.card===c);g.phase=ph;g.curAttackers=[];return {none,some}});
ok("Gideon's Memorial offered only while a creature is attacking/blocking",m.none===false&&m.some===true,JSON.stringify(m));
// export log works while busy and carries a state line
const ex=await pg.evaluate(()=>{const U=GoldfishUI.current;U.busy=true;U.render();const btn=document.querySelector('[data-act=export-log]');const vis=!!btn&&getComputedStyle(btn).display!=='none';const txt=U.logText();U.busy=false;U.render();return {vis,state:(txt.split('\n').find(l=>/^state:/.test(l))||'')}});
ok('export log available while busy, with state line',ex.vis&&/ui busy/.test(ex.state),JSON.stringify(ex));
console.log('errors',errs);await b.close();})();
