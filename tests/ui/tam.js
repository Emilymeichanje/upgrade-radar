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
// mid-turn win: kill everyone on your own main phase → end screen
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game;U.act(async()=>{for(const q of g.opponentsOf(U.me))await g.kill(q,'test');})});
await pg.waitForFunction(()=>GoldfishUI.current.ended&&!!document.querySelector('.over'),null,{timeout:15000}).catch(()=>{});
ok('winning during your own main phase shows the end screen',await pg.evaluate(()=>GoldfishUI.current.ended&&!!document.querySelector('.over')));
console.log('errors',errs.filter(e=>!/404/.test(e)));await b.close();})();
