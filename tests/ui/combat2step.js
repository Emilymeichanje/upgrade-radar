const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
await pg.goto('file://'+__dirname+'/rec.html');await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
// v106: Gandalf, Party Guest (beginning of combat: free I/S) must prompt BEFORE attackers are declared
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;
  const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
  put(me,tagCard({name:'Gandalf, Party Guest',type:'Legendary Creature — Avatar Wizard',mana:'{1}{U}{R}{W}',oracle:'At the beginning of combat on your turn, you may cast an instant or sorcery spell with mana value X or less from your hand without paying its mana cost, where X is twice the number of legendary Wizards you control.',cmc:4,power:'3',toughness:'4'}));
  put(me,tagCard({name:'Grizzly Bears',type:'Creature — Bear',mana:'{1}{G}',oracle:'',cmc:2,power:'2',toughness:'2'}));
  me.hand.push(tagCard({name:'Divination',type:'Sorcery',mana:'{1}{U}',oracle:'Draw two cards.',cmc:2}));
  g.refreshStatics();U.render();});
const label=await pg.$eval('[data-act=attack]',e=>e.textContent);
await pg.click('[data-act=attack]');
// a search prompt (cast free) should appear before any attack mode
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='search',null,{timeout:10000}).catch(()=>{});
const st=await pg.evaluate(()=>({prompt:GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind,dest:GoldfishUI.current.prompt&&GoldfishUI.current.prompt.dest,mode:GoldfishUI.current.mode&&GoldfishUI.current.mode.kind,phase:GoldfishUI.current.game.phase}));
ok('Attack button goes to combat first; Gandalf prompts before attackers',label==='Attack'&&st.prompt==='search'&&st.dest==='cast free'&&!st.mode&&st.phase==='combat',JSON.stringify(st));
const hand0=await pg.evaluate(()=>GoldfishUI.current.me.hand.length);
await pg.click('.sopt[data-name=divination]');
await pg.waitForFunction(()=>GoldfishUI.current.mode&&GoldfishUI.current.mode.kind==='attack',null,{timeout:15000}).catch(()=>{});
const st2=await pg.evaluate(()=>({mode:GoldfishUI.current.mode&&GoldfishUI.current.mode.kind,phase:GoldfishUI.current.turnPhase,hand:GoldfishUI.current.me.hand.length,btn:(document.querySelector('[data-act=attack]')||{}).textContent}));
ok('after the free cast resolves, attack mode opens in the declare step',st2.mode==='attack'&&st2.phase==='declare'&&st2.hand===hand0+1,JSON.stringify(st2));
// v113: Cancel in the attacker picker goes back to main 1 (it used to skip combat silently); sorcery-speed actions work again; re-entering combat does not re-fire Gandalf
await pg.click('[data-act=cancel]');
await pg.waitForFunction(()=>GoldfishUI.current.turnPhase==='main1'&&GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:10000}).catch(()=>{});
const back=await pg.evaluate(()=>({phase:GoldfishUI.current.turnPhase,engine:GoldfishUI.current.game.phase,mode:GoldfishUI.current.mode&&GoldfishUI.current.mode.kind,atk:!!document.querySelector('[data-act=attack]:not([disabled])')}));
ok('Cancel returns to main 1 with Attack still available',back.phase==='main1'&&back.engine==='main1'&&!back.mode&&back.atk,JSON.stringify(back));
// v123: a second tap/click landing on Attack right after a picker closes must not start combat (Lightning Greaves equip → combat)
{ const g1=await pg.evaluate(()=>{const U=GoldfishUI.current;U.pickClosedAt=Date.now();document.querySelector('[data-act=attack]').click();return U.turnPhase+':'+U.myTurn+':'+(U.mode&&U.mode.kind)});
  ok('a click on Attack within half a second of a picker closing is ignored',g1==='main1:true:null',g1); await pg.waitForTimeout(650); }
const trigBefore=await pg.evaluate(()=>GoldfishUI.current.game.log.filter(x=>/Gandalf, Party Guest triggers/.test(x.m)).length);
await pg.click('[data-act=attack]');
await pg.waitForFunction(()=>GoldfishUI.current.mode&&GoldfishUI.current.mode.kind==='attack',null,{timeout:10000}).catch(()=>{});
const again=await pg.evaluate(()=>({mode:GoldfishUI.current.mode&&GoldfishUI.current.mode.kind,phase:GoldfishUI.current.turnPhase,prompt:GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind,trig:GoldfishUI.current.game.log.filter(x=>/Gandalf, Party Guest triggers/.test(x.m)).length}));
ok('re-entering combat opens the picker without re-firing beginning-of-combat triggers',again.mode==='attack'&&again.phase==='declare'&&!again.prompt&&again.trig===trigBefore,JSON.stringify(again)+' before='+trigBefore);
// pick the bear and go
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const bear=me.battlefield.find(b=>b.card.name==='Grizzly Bears');U.mode.map.set(bear,U.mode.def);U.render();});
await pg.click('[data-act=atk-go]');
await pg.waitForFunction(()=>GoldfishUI.current.turnPhase==='main2'&&GoldfishUI.current.myTurn,null,{timeout:30000}).catch(()=>{});
const st3=await pg.evaluate(()=>({phase:GoldfishUI.current.turnPhase,log:GoldfishUI.current.game.log.slice(-20).map(x=>x.m).filter(m=>/attacks|hits|Gandalf|Divination/.test(m))}));
ok('attack happened and we reach main 2',st3.phase==='main2'&&st3.log.some(m=>/attacks: Grizzly Bears/.test(m)),JSON.stringify(st3));
console.log('errors',errs);await b.close()})();
