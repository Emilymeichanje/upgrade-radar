const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
await pg.goto('file://'+__dirname+'/rec.html');await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
// a card exiled from an opponent's library that Maralen lets me cast for free
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me,g=U.game;const {tagCard}=Goldfish;const opp=g.players.find(q=>q!==me);
  for(let i=0;i<3;i++)me.battlefield.push({id:9000+i,card:tagCard({name:'Elf'+i,mana:'{G}',type:'Creature — Elf',cmc:1,power:'1',toughness:'1',oracle:''}),tapped:false,summoning:false,counters:0});
  const t=tagCard({name:'Mystical Tutor',mana:'{U}',type:'Instant',cmc:1,oracle:'Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.'});opp.exile.push(t);
  me.exileCast=[{card:t,owner:opp,free:true,maralen:true,turn:g.turn}];window.__opp=opp.i;window.__uid=t.uid;U.render();});
ok('hand row shows the exiled card as castable (glowing, "exile · free")',await pg.evaluate(()=>{const el=document.querySelector(`.gt-hand [data-act="xcast"][data-uid="${window.__uid}"]`);return !!el&&el.classList.contains('can')&&/exile · free/.test(el.textContent)}));
await pg.click(`[data-act="zone"][data-p="${await pg.evaluate(()=>window.__opp)}"][data-z="exile"]`);
ok('opponent exile viewer marks it castable too',await pg.evaluate(()=>{const el=document.querySelector(`.zone .sopt[data-uid="${window.__uid}"]`);return !!el&&el.classList.contains('can')&&el.dataset.act==='xcast'}));
await pg.click(`.zone .sopt[data-uid="${await pg.evaluate(()=>window.__uid)}"]`);
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return false}if(U.prompt&&U.prompt.kind==='search'){U.prompt.res([]);return false}return !U.busy&&!U.prompt&&!U.zoneView&&!(U.game.players[window.__opp].exile.some(c=>c.uid===window.__uid))},null,{timeout:20000}).catch(()=>{});
ok('clicking it in the viewer casts it (left the exile zone, viewer closed)',await pg.evaluate(()=>!GoldfishUI.current.zoneView&&!GoldfishUI.current.game.players[window.__opp].exile.some(c=>c.uid===window.__uid)));
console.log('errors',errs);await b.close()})();
