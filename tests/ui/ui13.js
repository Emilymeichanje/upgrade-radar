const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1400,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const T=Goldfish.tagCard;
 me.battlefield.push({id:888001,card:T({name:'Lander',type:'Creature — Elemental',mana:'{2}{G}',oracle:'Landfall — Whenever a land you control enters, you gain 3 life.',cmc:3,power:'2',toughness:'2'}),tapped:false,summoning:false,counters:0});
 me.battlefield.push({id:888002,card:T({name:'Evolving Wilds',type:'Land',mana:'',oracle:'{T}, Sacrifice Evolving Wilds: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.',cmc:0}),tapped:false,summoning:false,counters:0});
 me.landsThisTurn=0;const f=T({name:'Forest',type:'Basic Land — Forest',mana:'',oracle:'',cmc:0});me.hand.push(f);window.__f=f;window.__l0=me.life;U.render();});
await pg.evaluate(()=>{const U=GoldfishUI.current;U.handAct(window.__f);});
await pg.waitForFunction(()=>{const P=GoldfishUI.current.prompt;return P&&P.kind==='priority'&&P.step==='stack';},null,{timeout:15000});
const h4=await pg.$eval('.prm h4',e=>e.textContent);console.log('prompt:',h4);
const opts=await pg.$$eval('[data-popt]',els=>els.map(e=>e.textContent.trim().slice(0,40)));console.log('options:',opts.length);
const stackLen=await pg.evaluate(()=>GoldfishUI.current.game.stack.filter(o=>o.trig).length);console.log('triggers on stack:',stackLen);
// crack the fetch in response
const i=await pg.evaluate(()=>GoldfishUI.current.prompt.options.findIndex(o=>o.card.name==='Evolving Wilds'));console.log('fetch option index',i);
if(i>=0){await pg.click(`[data-popt="${i}"]`);}
// may need to pick a basic; answer any choose prompts, then pass on further windows
for(let k=0;k<12;k++){await pg.waitForTimeout(400);const st=await pg.evaluate(()=>{const U=GoldfishUI.current,P=U.prompt;return P?P.kind+'|'+(P.step||''):'none|'+U.game.stack.length;});if(st.startsWith('none|0'))break;
 if(st.startsWith('fetch')||st.startsWith('choose')||st.startsWith('pick')){const el=await pg.$('.prm .opt, .prm [data-fetch], .prm [data-ch]');if(el)await el.click();}
 else if(st.startsWith('priority')){const pass=await pg.$('[data-act=pass]')||await pg.$('[data-act=prio-pass]');if(pass)await pass.click();else break;} else {console.log('state',st);break;}}
const r=await pg.evaluate(()=>{const me=GoldfishUI.current.me;return {gained:me.life-window.__l0,wilds:me.battlefield.some(b=>b.card.name==='Evolving Wilds'),stack:GoldfishUI.current.game.stack.length};});
console.log('result',JSON.stringify(r));console.log(r.gained===6&&!r.wilds?'PASS two landfall triggers (fetch cracked in response)':'CHECK');console.log('errors',errs.length?errs:'none');await b.close();})();
