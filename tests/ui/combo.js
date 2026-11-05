// combo bar → Go infinite → ∞ pool → cast a big spell; Win with combo ends the game; both survive record → replay
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/rec.html');
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
await pg.evaluate(()=>{Math.random=Goldfish.mulberry(3);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
// stage: Basalt Monolith + Kinnan on my side, a 12-drop in hand. (recorded as a direct state edit, so we stage through the engine before any decisions… we use exec-free staging and compare only post-staging behaviour)
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
  me.battlefield.push({id:91001,card:tagCard(mk('Basalt Monolith','Artifact','{3}',"This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact.",3)),tapped:false,summoning:false,counters:0});
  me.battlefield.push({id:91002,card:tagCard(mk('Kinnan, Bonder Prodigy','Legendary Creature — Human Druid','{G}{U}','Whenever you tap a nonland permanent for mana, add one mana of any type that permanent produced.\n{5}{G}{U}: Look at the top five cards of your library. You may put a non-Human creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order.',2,2,2)),tapped:false,summoning:false,counters:0});
  me.hand.push(tagCard(mk('Colossus','Artifact Creature — Golem','{12}','Trample',12,12,12)));U.render();});
const bar=await pg.evaluate(()=>({txt:(document.querySelector('.combo-row')||{}).textContent||'',btn:!!document.querySelector('[data-act=combo-go]')}));
ok('combo bar offers Monolith + Kinnan',/Basalt Monolith \+ Kinnan/.test(bar.txt)&&/infinite colorless mana/.test(bar.txt)&&bar.btn,bar.txt);
ok('Colossus not castable before going infinite',await pg.evaluate(()=>{const U=GoldfishUI.current;return !U.game.castMode(U.me,U.me.hand.find(c=>c.name==='Colossus'),'hand')}));
await pg.click('[data-act=combo-go]');await pg.waitForFunction(()=>!GoldfishUI.current.busy);
const st=await pg.evaluate(()=>({pool:(document.querySelector('.pool')||{}).textContent||'',msg:[...document.querySelectorAll('.gt-ctl .msg')].map(x=>x.textContent).join(' '),log:GoldfishUI.current.game.log.slice(-2).map(l=>l.m)}));
ok('pool shows ∞C and "∞ mana"',/∞C/.test(st.pool)&&/∞ mana/.test(st.msg),JSON.stringify(st));
await pg.evaluate(()=>{const U=GoldfishUI.current;const c=U.me.hand.find(c=>c.name==='Colossus');U.act(()=>U.exec('cast',U.me,c,'hand',null))});
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority')U.prompt.res(null);return !U.busy&&U.me.battlefield.some(b=>b.card.name==='Colossus')},null,{timeout:20000}).catch(()=>{});
ok('12-mana Colossus cast with infinite mana',await pg.evaluate(()=>GoldfishUI.current.me.battlefield.some(b=>b.card.name==='Colossus')));
// win combo: Citadel + Top + Aetherflux
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const mk=(name,type,mana,oracle,cmc)=>({name,type,mana,oracle,cmc});
  me.battlefield.push({id:91010,card:tagCard(mk("Bolas's Citadel",'Legendary Artifact','{3}{B}{B}{B}',"You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.\n{T}, Sacrifice ten nonland permanents: Each opponent loses 10 life.",6)),tapped:false,summoning:false,counters:0});
  me.battlefield.push({id:91011,card:tagCard(mk('Aetherflux Reservoir','Artifact','{4}','Whenever you cast a spell, you gain 1 life for each spell you\'ve cast this turn.\nPay 50 life: This artifact deals 50 damage to any target.',4)),tapped:false,summoning:false,counters:0});
  me.library.push(tagCard(mk("Sensei's Divining Top",'Artifact','{1}',"{1}: Look at the top three cards of your library, then put them back in any order.\n{T}: Draw a card, then put Sensei's Divining Top on top of its owner's library.",1)));U.render();});
ok('win combo offered',await pg.evaluate(()=>[...document.querySelectorAll('[data-act=combo-go]')].some(b=>/Win with combo/.test(b.textContent))));
await pg.evaluate(()=>[...document.querySelectorAll('[data-act=combo-go]')].find(b=>/Win with combo/.test(b.textContent)).click());
await pg.waitForFunction(()=>GoldfishUI.current.game.winner,null,{timeout:60000}).catch(()=>{});
const w=await pg.evaluate(()=>({w:GoldfishUI.current.game.winner&&GoldfishUI.current.game.winner.name,log:GoldfishUI.current.game.log.slice(-5).map(l=>l.m)}));
ok('declaring the Citadel loop wins the game',w.w==='You · P0',JSON.stringify(w));
console.log('errors',errs.filter(e=>!/404/.test(e)));await b.close();})();
