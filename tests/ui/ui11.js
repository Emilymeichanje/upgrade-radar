const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1400,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const T=Goldfish.tagCard;const gh=T({name:'Grim Haruspex',type:'Creature — Human Wizard',mana:'{2}{B}',oracle:'Morph {B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhenever another nontoken creature you control dies, draw a card.',cmc:3,power:'3',toughness:'2'});me.hand.push(gh);for(let i=0;i<4;i++)me.battlefield.push({id:9000+i,card:T({name:'Swamp',type:'Basic Land — Swamp',mana:'',oracle:'',cmc:0}),tapped:false,summoning:false,counters:0});window.__gh=gh;U.render();});
await pg.evaluate(()=>{const U=GoldfishUI.current;U.startCast(window.__gh,'hand');});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='payopt',null,{timeout:10000});
const labels=await pg.$$eval('[data-act=pay-alt]',els=>els.map(e=>e.textContent));console.log('pay options:',labels);
await pg.click('[data-act=pay-alt]');
for(let i=0;i<60;i++){const s=await pg.evaluate(()=>{const U=GoldfishUI.current;if(U.prompt&&['priority','counter'].includes(U.prompt.kind)){U.prompt.res(null);return 'p'}return U.busy?'busy':'idle'});if(s==='idle')break;await pg.waitForTimeout(100);}
const fd=await pg.evaluate(()=>{const me=GoldfishUI.current.me;const b=me.battlefield.find(x=>x.faceDown);return b&&[b.card.name,GoldfishUI.current.game.powerOf(me,b)]});console.log('face-down on battlefield:',fd);
const opt=await pg.evaluate(()=>{const U=GoldfishUI.current;return U.game.abilityOptions(U.me,{}).filter(o=>o.ab.label==='turn face up').length});console.log('turn face up offered:',opt);
console.log('errors',errs);await b.close();})();
