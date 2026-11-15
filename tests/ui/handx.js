const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
await pg.goto('file://'+__dirname+'/rec.html');await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
// v141: what the hand strip offers beside the hand
const st=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;
  const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false};pl.battlefield.push(b);return b};
  const L=(n,t)=>tagCard({name:n,type:'Basic Land — '+t,mana:'',oracle:'',cmc:0});
  put(me,tagCard({name:"Titania, Nature's Force",type:'Legendary Creature — Elemental',mana:'{4}{G}{G}',oracle:"You may play Forests from your graveyard.",cmc:6,power:'6',toughness:'6'}));
  put(me,tagCard({name:'Traveling Chocobo',type:'Creature — Bird',mana:'{2}{G}',oracle:"You may look at the top card of your library any time.\nYou may play lands and cast Bird spells from the top of your library.",cmc:3,power:'3',toughness:'2'}));
  me.graveyard.push(L('Forest','Forest'),L('Mountain','Mountain'));
  me.library.push(tagCard({name:'Top Spell',type:'Sorcery',mana:'{1}{G}',oracle:'Draw a card.',cmc:2}));
  const stale=tagCard({name:'Stale Exile',type:'Sorcery',mana:'{G}',oracle:'Draw a card.',cmc:1}); me.graveyard.push(stale); (me.exileCast=me.exileCast||[]).push({card:stale,owner:me,forever:true});
  me.landsThisTurn=0; g.refreshStatics();U.render();
  const lab=()=>[...document.querySelectorAll('.gt-hand .hcd')].map(e=>[(e.querySelector('img')||{}).alt||e.textContent.trim().slice(0,20),(e.querySelector('.hbadge')||{}).textContent||'',e.dataset.act||'']).filter(x=>x[1]);
  const a=lab(); me.landsThisTurn=g.landLimit(me); U.render(); const b2=lab(); return {a,b:b2}});
const names=st.a.map(x=>x[0]+'|'+x[1]);
ok('Titania: only Forests are offered from the graveyard',st.a.some(x=>x[0].startsWith('Forest')&&x[1]==='graveyard land')&&!st.a.some(x=>x[0].startsWith('Mountain')),JSON.stringify(st.a));
ok('Traveling Chocobo: the top card is shown even when it cannot be played, and is not clickable',st.a.some(x=>x[0].startsWith('Top Spell')&&/look only/.test(x[1])&&x[2]===''),JSON.stringify(st.a));
ok('a card that has left exile is no longer offered from exile',!st.a.some(x=>x[0].startsWith('Stale Exile')));
ok('no graveyard lands once the land drop is used',!st.b.some(x=>/graveyard land/.test(x[1])),JSON.stringify(st.b));
// redirect spells may only target the stack
const v=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const sw=tagCard({name:'Deflecting Swat',type:'Instant',mana:'{2}{R}',oracle:"If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability.",cmc:3});const cs=tagCard({name:'Counterspell',type:'Instant',mana:'{U}{U}',oracle:'Counter target spell.',cmc:2});const pm=me.battlefield.find(b=>b.card.isCreature);
  U.mode={kind:'target',card:sw,zone:'hand',spells:true};const a=U.validTarget(pm,me);U.mode={kind:'target',card:cs,zone:'hand',spells:true};const b=U.validTarget(pm,me);U.mode=null;return [a,b]});
ok('Deflecting Swat and Counterspell cannot be pointed at a permanent',v[0]===false&&v[1]===false,JSON.stringify(v));
ok('no page errors',!errs.length,errs.join('|'));await b.close();})();
