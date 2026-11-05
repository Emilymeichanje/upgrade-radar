// proliferate picker, All Will Be One targets, mid-turn win ends the game — through the real table
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/rec.html');
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const mk=(name,type,mana,oracle,cmc,p,t,l)=>({name,type,mana,oracle,cmc,power:p,toughness:t,loyalty:l});
  const tf=tagCard(mk('Teferi, Hero of Dominaria','Legendary Planeswalker — Teferi','{3}{W}{U}','+1: Draw a card. At the beginning of the next end step, untap up to two lands.\n−3: Put target nonland permanent into its owner\'s library third from the top.\n−8: You get an emblem with "Whenever you draw a card, exile target permanent an opponent controls."',5,null,null,'4'));
  me.battlefield.push({id:93001,card:tf,tapped:false,summoning:false,counters:0,loyalty:4});
  const opp=g.players[1];opp.poison=8;opp.battlefield.push({id:93002,card:tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)),tapped:false,summoning:false,counters:3});
  me.hand.push(tagCard(mk('Contentious Plan','Sorcery','{1}{U}','Proliferate.\nDraw a card.',2)));U.render();});
// cast Contentious Plan → the picker
await pg.evaluate(()=>{const U=GoldfishUI.current;const c=U.me.hand.find(c=>c.name==='Contentious Plan');U.me.pool=[{c:'U'},{c:'U'}];U.act(()=>U.exec('cast',U.me,c,'hand',null))});
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return false}return U.prompt&&U.prompt.kind==='search'&&U.prompt.dest==='proliferate'},null,{timeout:15000}).catch(()=>{});
const pk=await pg.evaluate(()=>{const U=GoldfishUI.current;const P=U.prompt;return P?{kind:P.kind,dest:P.dest,names:P.pool.map(c=>c.name),head:(document.querySelector('.prm h4')||{}).textContent}:null});
ok('proliferate shows a picker with your walker, the opponent’s Bear and their poison',pk&&pk.names.some(n=>/Teferi/.test(n))&&pk.names.includes('Bear')&&pk.names.some(n=>/poison 8/.test(n)),JSON.stringify(pk));
// choose Teferi + opponent poison, not the Bear
await pg.evaluate(()=>{const U=GoldfishUI.current;const P=U.prompt;P.sel=P.pool.filter(c=>/Teferi|poison/.test(c.name));U.render();});await pg.click('[data-act=search-go]');
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return false}return !U.busy},null,{timeout:15000});
const st=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game;return {tf:U.me.battlefield.find(b=>b.id===93001).loyalty,poison:g.players[1].poison,bear:g.players[1].battlefield.find(b=>b.id===93002).counters}});
ok('only the chosen ones got counters (Teferi 5, poison 9, Bear still 3)',st.tf===5&&st.poison===9&&st.bear===3,JSON.stringify(st));
// All Will Be One: the human may choose the opponent's creature
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;me.battlefield.push({id:93003,card:tagCard({name:'All Will Be One',type:'Enchantment',mana:'{3}{R}{R}',cmc:5,oracle:'Whenever you put one or more counters on a permanent or player, this enchantment deals that much damage to target opponent, creature an opponent controls, or planeswalker an opponent controls.'}),tapped:false,counters:0});
  me.hand.push(tagCard({name:'Contentious Plan',type:'Sorcery',mana:'{1}{U}',cmc:2,oracle:'Proliferate.\nDraw a card.'}));me.pool=[{c:'U'},{c:'U'}];const c=me.hand.find(c=>c.name==='Contentious Plan');U.act(()=>U.exec('cast',me,c,'hand',null))});
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return false}if(U.prompt&&U.prompt.kind==='search'){const P=U.prompt;P.sel=P.pool.filter(c=>/Teferi/.test(c.name));U.render();document.querySelector('[data-act=search-go]').click();return false}return U.prompt&&U.prompt.kind==='choice'},null,{timeout:15000}).catch(()=>{});
const ch=await pg.evaluate(()=>{const P=GoldfishUI.current.prompt;return P&&P.kind==='choice'?P.options:null});
ok('All Will Be One offers opponents AND their creatures',ch&&ch.some(o=>/^Bear/.test(o))&&ch.some(o=>/life\)$/.test(o)),JSON.stringify(ch));
await pg.evaluate(()=>{const P=GoldfishUI.current.prompt;P.res(P.options.find(o=>/^Bear/.test(o)))});
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return false}return !U.busy},null,{timeout:15000});
const bd=await pg.evaluate(()=>{const b=GoldfishUI.current.game.players[1].battlefield.find(b=>b.id===93002);return b?{dmg:GoldfishUI.current.game.markedOf(b)}:"dead"});
ok('…and 1 damage (one counter placed) goes to the Bear',bd==='dead'||bd.dmg===1,JSON.stringify(bd));
// b13: proliferating an OPPONENT's permanent / poison triggers All Will Be One
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const opp=g.players[2];opp.poison=3;opp.battlefield.push({id:93010,card:tagCard({name:'Ox',type:'Creature — Ox',mana:'{3}',cmc:3,power:2,toughness:4,oracle:''}),tapped:false,summoning:false,counters:1});
  me.hand.push(tagCard({name:'Contentious Plan',type:'Sorcery',mana:'{1}{U}',cmc:2,oracle:'Proliferate.\nDraw a card.'}));me.pool=[{c:'U'},{c:'U'}];window.__ch=[];const c=me.hand.find(c=>c.name==='Contentious Plan');U.act(()=>U.exec('cast',me,c,'hand',null))});
await pg.waitForFunction(()=>{const U=GoldfishUI.current;const P=U.prompt;if(P&&P.kind==='priority'){P.res(null);return false}if(P&&P.kind==='search'&&P.dest==='proliferate'){P.sel=P.pool.filter(c=>c.name==='Ox'||/poison 3/.test(c.name));U.render();document.querySelector('[data-act=search-go]').click();return false}if(P&&P.kind==='choice'){window.__ch.push(P.options.join('|'));P.res(P.options[0]);return false}return !U.busy&&!P},null,{timeout:20000}).catch(()=>{});
const aw=await pg.evaluate(()=>({n:window.__ch.length,ox:GoldfishUI.current.game.players[2].battlefield.find(b=>b.id===93010)?.counters,poison:GoldfishUI.current.game.players[2].poison}));
ok('proliferating an opponent’s creature and their poison triggers All Will Be One twice',aw.n===2&&aw.ox===2&&aw.poison===4,JSON.stringify(aw));
// b13: surveil 1 / scry 1 can keep the card on top
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const {tagCard}=Goldfish;window.__top=me.library[me.library.length-1];me.hand.push(tagCard({name:'Consider',type:'Instant',mana:'{U}',cmc:1,oracle:'Surveil 1.\nDraw a card.'}));me.pool=[{c:'U'}];const c=me.hand.find(c=>c.name==='Consider');window.__hn=me.hand.length;U.act(()=>U.exec('cast',me,c,'hand',null))});
await pg.waitForFunction(()=>{const U=GoldfishUI.current;const P=U.prompt;if(P&&P.kind==='priority'){P.res(null);return false}return P&&P.kind==='search'&&P.dest==='surveil'},null,{timeout:15000}).catch(()=>{});
const sv=await pg.evaluate(()=>({btn:(document.querySelector('[data-act=search-go]')||{}).textContent||null}));
ok('surveil 1 shows a “Keep it on top” button',sv.btn&&/Keep it on top/.test(sv.btn),JSON.stringify(sv));
await pg.click('.sopt');const sv2=await pg.evaluate(()=>({open:!!GoldfishUI.current.prompt,btn:document.querySelector('[data-act=search-go]').textContent}));
ok('tapping the card selects it instead of resolving',sv2.open&&/1 to the graveyard/.test(sv2.btn),JSON.stringify(sv2));
await pg.click('.sopt');await pg.click('[data-act=search-go]');
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return false}return !U.busy},null,{timeout:15000});
ok('…kept on top, then drawn by Consider',await pg.evaluate(()=>GoldfishUI.current.me.hand.includes(window.__top)&&!GoldfishUI.current.me.graveyard.includes(window.__top)));
// b13: Dawn Charm is offered when an opponent attacks you, and its fog mode prevents the damage
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;me.hand.push(tagCard({name:'Dawn Charm',mana:'{1}{W}',type:'Instant',cmc:2,oracle:'Choose one —\n• Prevent all combat damage that would be dealt this turn.\n• Regenerate target creature.\n• Counter target spell that targets you.'}));
  for(let i=0;i<2;i++)me.battlefield.push({id:93100+i,card:tagCard({name:'Plains',type:'Basic Land — Plains',mana:'',cmc:0,oracle:'({T}: Add {W}.)'}),tapped:false,counters:0});
  const o=g.players[1];const bm=o.battlefield.find(b=>b.id===93002)||null;const atk={id:93200,card:tagCard({name:'Ogre',type:'Creature — Ogre',mana:'{2}{R}',cmc:3,power:5,toughness:3,oracle:''}),tapped:false,summoning:false,counters:0};o.battlefield.push(atk);
  window.__life=me.life;window.__seen=null;window.__mode=null;g.active=1;U.game.combatPhase(o,[{attacker:atk,defender:me}]).then(()=>window.__done=1)});
await pg.waitForFunction(()=>{const U=GoldfishUI.current;const P=U.prompt;if(!P)return !!window.__done;
  if(P.kind==='priority'&&P.step==='declareAttackers'&&!window.__seen){window.__seen=(P.options||[]).map(o=>o.card&&o.card.name).join(',');const o=P.options.find(o=>o.card&&o.card.name==='Dawn Charm');if(o){P.res(o);return false}}
  if(P.kind==='priority'){P.res(null);return false}
  if(P.kind==='blocks'||P.kind==='block'){P.res&&P.res(new Map());return false}
  if(P.kind==='choice'||P.kind==='modes'||P.kind==='search'){const opts=P.options||P.pool||[];const f=opts.find(x=>/prevent all combat damage/i.test(typeof x==='string'?x:(x.text||x.name||'')));window.__mode=P.kind;if(P.kind==='search'){P.res([f||opts[0]])}else P.res(f||opts[0]);return false}
  return !!window.__done},null,{timeout:20000}).catch(()=>{});
const dc=await pg.evaluate(()=>({seen:window.__seen,mode:window.__mode,lifeBefore:window.__life,life:GoldfishUI.current.me.life,prompt:GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind,done:!!window.__done}));
ok('Dawn Charm is offered when an opponent declares attacks on you',dc.seen&&/Dawn Charm/.test(dc.seen),JSON.stringify(dc));
ok('…and its fog mode prevents the 5 damage',dc.life===dc.lifeBefore,JSON.stringify(dc));
await pg.evaluate(()=>{GoldfishUI.current.game.active=0});
// mid-turn win: kill everyone on your own main phase → end screen
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game;U.act(async()=>{for(const q of g.opponentsOf(U.me))await g.kill(q,'test');})});
await pg.waitForFunction(()=>GoldfishUI.current.ended&&!!document.querySelector('.over'),null,{timeout:15000}).catch(()=>{});
ok('winning during your own main phase shows the end screen',await pg.evaluate(()=>GoldfishUI.current.ended&&!!document.querySelector('.over')));
console.log('errors',errs.filter(e=>!/404/.test(e)));await b.close();})();
