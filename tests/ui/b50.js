// v155–v157 prompts clicked through at the table: mutate (host + over/under), artifact offering, riot, fabricate, Utopia Sprawl's Forest, Commandeer's pitched cards, Kozilek's manifest
const {chromium}=require('playwright');const J=require('../../data/cards.json');
const row=n=>{const r=J.cards.find(r=>r[0]===n);const x=r[8]||{};return {name:r[0],mana:r[1],type:r[2],oracle:r[3]||'',cmc:r[4],power:r[5]??undefined,toughness:r[6]??undefined,mana2:x.m2,power2:x.p2,toughness2:x.t2}};
(async()=>{const b=await chromium.launch();const errs=[];const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
const fresh=async()=>{const pg=await b.newPage({viewport:{width:1500,height:1000}});pg.on('pageerror',e=>errs.push(e.message));await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
 await pg.goto('file://'+__dirname+'/rec.html');await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
 await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
 await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});return pg};
// set up: clear my creatures/hand, add permanents and hand cards by name, float plenty of mana
const setup=(pg,bf,hand,extra)=>pg.evaluate(([bf,hand,extra])=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;me.battlefield=me.battlefield.filter(b=>b.card.isLand);me.hand=[];window.__seen=[];
 for(const r of bf){const c=tagCard(r);c.ownerI=g.players.indexOf(me);const pm={id:900000+Math.floor(Math.random()*90000),card:c,tapped:false,summoning:false,counters:0,damage:0,enteredTurn:g.turn-1};me.battlefield.push(pm)}
 for(const r of hand){const c=tagCard(r);c.ownerI=g.players.indexOf(me);me.hand.push(c)}
 me.pool=[];for(const c of 'WUBRG')for(let i=0;i<6;i++)me.pool.push({c});if(extra)eval(extra);g.refreshStatics();U.render()},[bf.map(row),hand.map(row),extra||'']);
const click=async(pg,name)=>{const uid=await pg.evaluate(n=>GoldfishUI.current.me.hand.find(c=>c.name===n).uid,name);await pg.click(`[data-uid="${uid}"]`)};
// answer prompts with `rule(prompt)`; every prompt seen is recorded
const drive=async(pg,rules,max=40)=>{for(let i=0;i<max;i++){const st=await pg.evaluate((rules)=>{const U=GoldfishUI.current,P=U.prompt,M=U.mode;if(!P&&!M)return U.busy?'busy':'idle';
  const info=P?{kind:P.kind,dest:P.dest||'',q:(P.question||P.title||'').slice(0,90),pool:(P.pool||[]).map(c=>c.name),alts:(P.alts||[]).map(a=>a.kind)}:{kind:'mode:'+M.kind,dest:M.dest||''};window.__seen.push(info);
  if(!P){return 'mode'}
  if(P.kind==='priority'){P.res(null);return 'p'}
  if(P.kind==='payopt'){const want=rules.alt;P.res(want?P.alts.find(a=>a.kind===want)||null:null);return 'p'}
  if(P.kind==='may'){const r=rules.may||{};let ans=true;for(const k in r)if(new RegExp(k,'i').test(P.question||''))ans=r[k];P.res(ans);return 'p'}
  if(P.kind==='search'){const r=(rules.search||{})[P.dest];let pick;if(r===undefined)pick=P.pool.slice(0,P.n||1);else if(r===null)pick=[];else pick=P.pool.filter(c=>r.includes(c.name)).slice(0,Math.max(P.n||1,r.length));P.res(pick);return 'p'}
  if(P.kind==='number'){P.res(rules.number||0);return 'p'}
  if(P.kind==='choice'){P.res(rules.choice&&P.options.includes(rules.choice)?rules.choice:P.options[0]);return 'p'}
  return 'unknown:'+P.kind},rules);
 if(st==='idle')return true;if(st==='mode'){const t=await pg.evaluate(()=>{const U=GoldfishUI.current;return JSON.stringify({k:U.mode.kind,keys:Object.keys(U.mode)})});console.log('   stuck in mode',t);return false}
 if(String(st).startsWith('unknown')){console.log('   '+st);return false}await pg.waitForTimeout(150)}return false};
const seen=pg=>pg.evaluate(()=>window.__seen);
{ const pg=await fresh();await setup(pg,['Llanowar Elves'],['Nethroi, Apex of Death']);await click(pg,'Nethroi, Apex of Death');const done=await drive(pg,{alt:'mutate',may:{'on top':true},search:{mutate:['Llanowar Elves']}});const s=await seen(pg);
  const r=await pg.evaluate(()=>{const me=GoldfishUI.current.me;const cr=me.battlefield.filter(b=>b.card.isCreature);return {n:cr.length,name:cr[0]&&cr[0].card.name,pile:cr[0]&&cr[0].card.b50_pile}});
  ok('mutate at the table: alt offered, host picked, over/under asked, one merged creature',done&&s.some(x=>x.alts.includes('mutate'))&&s.some(x=>/on top/.test(x.q))&&r.n===1&&/Nethroi/.test(r.name),JSON.stringify([r,s.map(x=>x.kind+':'+x.dest+':'+x.q.slice(0,30))]));await pg.close(); }
{ const pg=await fresh();await setup(pg,['Sol Ring','Lightning Greaves'],['Blast-Furnace Hellkite']);await click(pg,'Blast-Furnace Hellkite');const done=await drive(pg,{search:{offering:['Lightning Greaves']}});const s=await seen(pg);
  const r=await pg.evaluate(()=>{const me=GoldfishUI.current.me;return {greaves:me.battlefield.some(b=>b.card.name==='Lightning Greaves'),ring:me.battlefield.some(b=>b.card.name==='Sol Ring'),kite:me.battlefield.some(b=>/Hellkite/.test(b.card.name))}});
  ok('artifact offering at the table: I am asked which artifact (Greaves sacrificed, Sol Ring kept)',done&&s.some(x=>x.dest==='offering'&&x.pool.includes('Sol Ring'))&&!r.greaves&&r.ring&&r.kite,JSON.stringify([r,s.map(x=>x.kind+':'+x.dest)]));await pg.close(); }
{ const pg=await fresh();await setup(pg,['Rhythm of the Wild'],['Marionette Apprentice']);await click(pg,'Marionette Apprentice');const done=await drive(pg,{may:{'Riot':false,'Fabricate':false}});const s=await seen(pg);
  const r=await pg.evaluate(()=>{const me=GoldfishUI.current.me;const a=me.battlefield.find(b=>b.card.name==='Marionette Apprentice');return {summoning:a&&a.summoning,counters:a&&a.counters,servo:me.battlefield.some(b=>b.card.token&&/Servo/.test(b.card.name+b.card.type))}});
  ok('riot and fabricate at the table: both ask; No/No = haste and a Servo',done&&s.some(x=>/Riot/.test(x.q))&&s.some(x=>/Fabricate/.test(x.q))&&r.summoning===false&&r.counters===0&&r.servo,JSON.stringify([r,s.map(x=>x.kind+':'+x.q.slice(0,25))]));await pg.close(); }
{ const pg=await fresh();await setup(pg,[],['Utopia Sprawl'],"if(!me.battlefield.some(b=>/Forest/.test(b.card.type))){const c=tagCard({name:'Forest',type:'Basic Land — Forest',oracle:'({T}: Add {G}.)',mana:'',cmc:0});me.battlefield.push({id:987654,card:c,tapped:false,counters:0,damage:0})}");await click(pg,'Utopia Sprawl');const done=await drive(pg,{choice:'Black'});const s=await seen(pg);
  const r=await pg.evaluate(()=>{const me=GoldfishUI.current.me;const a=me.battlefield.find(b=>b.card.name==='Utopia Sprawl');const h=a&&me.battlefield.find(b=>b.id===a.attachedTo);return {host:h&&h.card.type,color:a&&a.chosenColor}});
  ok('Utopia Sprawl at the table: I pick the Forest and the colour',done&&s.some(x=>x.dest==='enchant')&&s.some(x=>x.kind==='choice'&&/colour/.test(x.q))&&/Forest/.test(r.host||'')&&r.color==='B',JSON.stringify([r,s.map(x=>x.kind+':'+x.dest)]));await pg.close(); }
{ const pg=await fresh();await setup(pg,[],['Kozilek, the Broken Reality','Sol Ring','Llanowar Elves','Lightning Greaves'],"me.pool=[];for(let i=0;i<12;i++)me.pool.push({c:'C'})");await click(pg,'Kozilek, the Broken Reality');const done=await drive(pg,{may:{'target yourself':true,'target (?!yourself)':false},search:{manifest:['Sol Ring','Lightning Greaves']}});const s=await seen(pg);
  const r=await pg.evaluate(()=>{const me=GoldfishUI.current.me;return {fd:me.battlefield.filter(b=>b.faceDown).length,hand:me.hand.map(c=>c.name)}});
  ok('Kozilek at the table: I choose the players, then which two cards to manifest; I draw two',done&&s.some(x=>x.dest==='manifest')&&r.fd===2&&r.hand.includes('Llanowar Elves')&&r.hand.length===3,JSON.stringify([r,s.map(x=>x.kind+':'+x.dest+':'+x.q.slice(0,28))]));await pg.close(); }
console.log('errors',errs);await b.close()})();
