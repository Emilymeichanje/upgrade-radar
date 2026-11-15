const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
await pg.goto('file://'+__dirname+'/rec.html');await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
const cur=()=>pg.evaluate(()=>{const e=[...document.querySelectorAll('#ptphase [data-ph]')].find(e=>/font-weight:700/.test(e.getAttribute('style')));return e?e.textContent:''});
ok('the phase bar shows the current phase',/^Main 1/.test(await cur()),await cur());
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;me.battlefield.push({id:Math.random(),card:tagCard({name:'Grizzly Bears',type:'Creature — Bear',mana:'{1}{G}',oracle:'',cmc:2,power:'2',toughness:'2'}),tapped:false,counters:0,enteredTurn:0,summoning:false});
  me.hand.push(tagCard({name:'Free Sorcery',type:'Sorcery',mana:'{0}',oracle:'You gain 1 life.',cmc:0}));U.render()});
await pg.click('[data-act=attack]');await pg.waitForFunction(()=>GoldfishUI.current.mode&&GoldfishUI.current.mode.kind==='attack');
ok('choosing attackers is the combat phase, and the bar says so',/Combat · choosing attackers/.test(await cur()),await cur());
const uid=await pg.evaluate(()=>GoldfishUI.current.me.hand.find(c=>c.name==='Free Sorcery').uid);const life=await pg.evaluate(()=>GoldfishUI.current.me.life);await pg.click(`[data-hand="${uid}"]`);await pg.waitForTimeout(500);
const st=await pg.evaluate(()=>({mode:GoldfishUI.current.mode&&GoldfishUI.current.mode.kind,inHand:GoldfishUI.current.me.hand.some(c=>c.name==='Free Sorcery'),life:GoldfishUI.current.me.life,note:(document.querySelector('#ptflash')||{}).textContent||''}));
ok('a sorcery cannot be cast while choosing attackers, and the table says why',st.mode==='attack'&&st.inHand&&st.life===life&&/instant-speed/.test(st.note),JSON.stringify(st));
await pg.click('[data-act=atk-cancel]').catch(()=>{});await pg.waitForTimeout(400);
// a long stack is collapsed so the response buttons stay in view
const r=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const c=me.battlefield.find(b=>b.card.isCreature).card;for(let i=0;i<20;i++)g.stack.push({id:9000+i,card:c,caster:me,trig:true,ops:[]});U.mode=null;U.stackOpen=false;U.render();const a=document.querySelectorAll('.stkp .si[data-sid]').length;document.querySelector('[data-act=stack-toggle]').click();const b2=document.querySelectorAll('.stkp .si[data-sid]').length;g.stack.length=0;U.render();return [a,b2]});
ok('a 20-item stack shows 4 rows until expanded',r[0]===4&&r[1]===20,JSON.stringify(r));
// v147: identical abilities share one chip; long rows fold
const ab=await pg.evaluate(()=>{const U=GoldfishUI.current,me=U.me;const {tagCard}=Goldfish;const mk=n=>tagCard({name:n,type:'Artifact',mana:'{1}',oracle:'{T}: You gain 1 life.',cmc:1});
  for(let i=0;i<3;i++)me.battlefield.push({id:Math.random(),card:mk('Twin Idol'),tapped:false,counters:0,enteredTurn:0,summoning:false});
  for(let i=0;i<16;i++)me.battlefield.push({id:Math.random(),card:mk('Idol '+String.fromCharCode(65+i)),tapped:false,counters:0,enteredTurn:0,summoning:false});
  U.mode=null;U.abilOpen=false;U.game.refreshStatics();U.refreshMain&&U.refreshMain();U.render();
  const chips=[...document.querySelectorAll('.abil-row .chip.abil')].map(e=>e.textContent);const tw=chips.filter(t=>/Twin Idol/.test(t));const tog=document.querySelector('#ptabiltoggle');const n1=chips.length;if(tog)tog.click();const n2=document.querySelectorAll('.abil-row .chip.abil').length;return {n1,n2,tw,opts:U.mainOpts.length}});
ok('three identical abilities are one chip marked ×3, and a long row folds to 12 until expanded',ab.tw.length<=1&&(ab.n1===12)&&ab.n2>=17&&(ab.tw.length===0||/×3/.test(ab.tw[0])),JSON.stringify(ab));
ok('no page errors',!errs.length,errs.join('|'));await b.close();})();
