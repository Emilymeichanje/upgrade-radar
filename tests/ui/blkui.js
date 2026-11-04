const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/ui5.html');await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
const r=await pg.evaluate(async()=>{const U=GoldfishUI.current,g=U.game,me=U.me,tv=g.players[1];const {tagCard}=Goldfish;const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
  for(const q of g.players)q.battlefield=q.battlefield.filter(x=>!x.card.isCreature);
  const ar=await g.enterPerm(me,tagCard(mk('Arasta of the Endless Web','Legendary Creature — Spider','{2}{G}{G}','Reach',4,3,5)));ar.summoning=false;
  await g.runOps(me,[{op:'tokens',n:1,pt:[1,2],kw:['reach'],types:'Spider',tcolors:['G']}],ar.card,{});const sp=me.battlefield.find(x=>x.card.name==='Spider');
  const t=await g.enterPerm(tv,tagCard(mk('Teval, the Balanced Scale','Legendary Creature — Dragon Druid','{1}{B}{G}{U}','Flying',4,3,4)));t.summoning=false;const uro=await g.enterPerm(tv,tagCard(mk('Uro','Legendary Creature — Elder Giant','{1}{G}{U}','',3,6,6)));uro.summoning=false;
  // simulate the opponent's turn attacking me: run combatPhase as the engine would, with the real UI handling blocks
  g.active=1;g.phase='combat';U.myTurn=false;
  const done=g.combatPhase(tv,[{attacker:t,defender:me},{attacker:uro,defender:me}]);
  await new Promise(r=>setTimeout(r,300));
  const P=U.prompt;const state1={kind:P&&P.kind,blockers:P&&P.blockers.map(x=>x.card.name),spiderTile:!!document.querySelector('.gc[data-pid="'+sp.id+'"]'),spiderClk:document.querySelector('.gc[data-pid="'+sp.id+'"]')?.classList.contains('clk'),tevalTile:!!document.querySelector('.gc[data-pid="'+t.id+'"]')};
  const click=id=>document.querySelector('.gc[data-pid="'+id+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
  click(t.id);const atkFirst=U.prompt.atkSel&&U.prompt.atkSel.card.name;const dimmed=[...document.querySelectorAll('.gc.dim')].length;click(sp.id);const sel=['attacker-first:'+atkFirst,'dimmed:'+dimmed];const mapped=[...U.prompt.map.entries()].map(([a,bs])=>[a.card.name,bs.map(x=>x.card.name)]);const warn=U.prompt.warn;
  document.querySelector('[data-act=block-go]').dispatchEvent(new MouseEvent('click',{bubbles:true}));await done;
  return {state1,sel,mapped,warn,log:g.log.slice(-4).map(l=>l.m)}});
console.log(JSON.stringify(r,null,1),errs);await b.close();})();
