const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
await pg.goto('file://'+__dirname+'/rec.html');await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
// 1. retired table: a second boot on the same element must not double-handle clicks
await pg.evaluate(()=>{window.__dl=0;const orig=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__dl++;else orig.call(this)};window.__first=GoldfishUI.current;Math.random=Goldfish.mulberry(6);boot();});
await pg.waitForFunction(()=>GoldfishUI.current&&GoldfishUI.current!==window.__first&&GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
await pg.click('[data-act=export-log]');const dl=await pg.evaluate(()=>window.__dl);ok('after starting a new game on the same page, Export log downloads ONE file',dl===1,'downloads '+dl);
const nm=await pg.evaluate(()=>{const U=GoldfishUI.current;return U.stamp()});ok('export file stamp has date_time-with-seconds and a game tag',/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[gt]\w+$/.test(nm),nm);
// 2. crown icon for the monarch
await pg.evaluate(()=>{const U=GoldfishUI.current;U.game.monarch=U.me;U.render()});ok('monarch shows a crown on their seat',await pg.evaluate(()=>!!document.querySelector('.gs.me .crown')));
// 3. scry 3 with ordering
await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const {tagCard}=Goldfish;const [c1,c2,c3]=['Alpha','Bravo','Charlie'].map(n=>tagCard({name:n,type:'Instant',mana:'{U}',cmc:1,oracle:''}));me.library.push(c3,c2,c1);window.__cs=[c1,c2,c3];me.hand.push(tagCard({name:'Preordain X',type:'Sorcery',mana:'{U}',cmc:1,oracle:'Scry 3.'}));me.pool=[{c:'U'}];const c=me.hand.find(x=>x.name==='Preordain X');U.act(()=>U.exec('cast',me,c,'hand',null))});
await pg.waitForFunction(()=>{const U=GoldfishUI.current;const P=U.prompt;if(P&&P.kind==='priority'){P.res(null);return false}return P&&P.kind==='search'&&P.dest==='scry'},null,{timeout:15000});
const ords=await pg.evaluate(()=>[...document.querySelectorAll('.sopt')].map(e=>e.dataset.name+':'+((e.querySelector('.ord')||{}).textContent||'')));
ok('scry shows TOP / 2nd / 3rd on the kept cards',ords.join('|')==='alpha:TOP|bravo:2nd|charlie:3rd',ords.join('|'));
await pg.click('.sopt[data-name="charlie"] [data-act=ord-up]');await pg.click('.sopt[data-name="charlie"] [data-act=ord-up]');
const ords2=await pg.evaluate(()=>[...document.querySelectorAll('.sopt')].map(e=>e.dataset.name+':'+((e.querySelector('.ord')||{}).textContent||'')));
ok('◀ moves a card toward the top',ords2.join('|')==='charlie:TOP|alpha:2nd|bravo:3rd',ords2.join('|'));
await pg.click('.sopt[data-name="bravo"]');await pg.click('[data-act=search-go]');
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return false}return !U.busy},null,{timeout:15000});
const lib=await pg.evaluate(()=>{const me=GoldfishUI.current.me;return {top:me.library.slice(-2).reverse().map(c=>c.name).join(','),bottom:me.library[0].name}});
ok('library: Charlie on top, then Alpha; Bravo on the bottom',lib.top==='Charlie,Alpha'&&lib.bottom==='Bravo',JSON.stringify(lib));
// 4. "Pass my triggers this turn" with Stops: all and nothing to respond with
await pg.evaluate(()=>{const U=GoldfishUI.current;U.s.stops='all';});
const stops=await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me,g=U.game;const trig={caster:me,trig:true,kind:'ability',card:{name:'Shared Animosity — attack',type:'Triggered ability',colors:[]}};const ctx={step:'stack',stack:[trig,trig,trig],options:[],active:me};const a=U.shouldStop(ctx);U.passOwnTrigTurn=g.turn;const b=U.shouldStop(ctx);return {before:a,after:b}});
ok('Stops: all + own triggers only: prompts until you press "Pass my triggers", then stops asking',stops.before===true&&stops.after===false,JSON.stringify(stops));
// 5. damage lines carry the source and life change
const line=await pg.evaluate(async()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const o=g.opponentsOf(me)[0];const l0=o.life;await g.runOps(me,[{op:'damage',n:3,to:'each opponent'}],{name:'Aragorn, the Uniter',colors:['R']},{});return g.log.map(l=>l.m).filter(m=>/3 damage to/.test(m)).pop()});
ok('log: "… 3 damage to P1 [P1 40 → 37]"',/3 damage to .*\[\S+ 40 → 37\]$/.test(line||''),line);
console.log('errors',errs);await b.close()})();
