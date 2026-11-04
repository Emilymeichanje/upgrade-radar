// zoom control, multi-blocker selection, token art lookup, commander-damage badges
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
let tokQ=[];
await pg.route(/api\.scryfall\.com\/cards\/search/,r=>{const u=decodeURIComponent(r.request().url());tokQ.push(u);
  if(/!"Elephant"/.test(u))return r.fulfill({json:{data:[{name:'Elephant',image_uris:{small:'https://img.test/elephant_small.jpg'}}]}});
  return r.fulfill({status:404,json:{object:'error'}})});
await pg.route(/img\.test/,r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')}));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));}
// --- zoom
const z0=await pg.$eval('.gt',e=>getComputedStyle(e).zoom);
await pg.click('[data-act=zoom-in]');await pg.click('[data-act=zoom-in]');
const z1=await pg.$eval('.gt',e=>getComputedStyle(e).zoom);const lbl=await pg.$eval('.gt-bar .zm b',e=>e.textContent);
ok('zoom-in raises CSS zoom',parseFloat(z1)>parseFloat(z0),z0+' → '+z1+' label '+lbl);
ok('zoom persisted',JSON.parse(await pg.evaluate(()=>localStorage.getItem('pt-settings'))).zoom>1);
await pg.keyboard.press('0');ok('key 0 resets to 100%',await pg.$eval('.gt-bar .zm b',e=>e.textContent)==='100%');
await pg.keyboard.press('-');ok('key - zooms out',parseFloat(await pg.$eval('.gt',e=>getComputedStyle(e).zoom))<1);
await pg.keyboard.press('0');
// --- token art + commander damage badge: stage board state
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me,opp=g.players[1];
  const tok={uid:9001,name:'Elephant',type:'Token Creature — Elephant',isCreature:true,power:3,toughness:3,kw:[],roles:[],colors:['G'],mana:Goldfish.manaInfo(''),cmc:0,token:true,oracle:'',triggers:[],abilities:[],statics:{},produces:[]};
  me.battlefield.push({id:9001,card:tok,tapped:false,summoning:false,counters:0},{id:9002,card:{...tok,uid:9002},tapped:false,summoning:false,counters:0});
  const cm=opp.command[0];opp.command=[];opp.battlefield.push({id:9100,card:cm,tapped:false,summoning:false,counters:0});
  me.cmdDmgBy={[cm.name]:15};me.cmdDamage[opp.i]=15;U.render();});
await pg.waitForFunction(()=>document.querySelectorAll('.gc[data-pid="9001"] img').length===1,null,{timeout:15000});
ok('token tiles got artwork',await pg.$$eval('.gc img[src*="elephant_small"]',e=>e.length)===2);
ok('lookup queried Scryfall tokens by name/PT/colour',tokQ.some(u=>/t:token !"Elephant" pow=3 tou=3 c=g/.test(u)),tokQ[0]);
ok('art cached in localStorage',/elephant_small/.test(await pg.evaluate(()=>localStorage.getItem('pt-tokart'))));
const badge=await pg.$eval('.gc[data-pid="9100"] .cd',e=>e.textContent).catch(()=>null);
ok('commander-damage badge over opposing commander',badge&&/15\/21 on you/.test(badge),String(badge));
ok('badge turns hot at 14+',await pg.$eval('.gc[data-pid="9100"] .cd',e=>e.classList.contains('hot')));
// --- 21 commander damage kills, per commander (engine)
const kill=await pg.evaluate(async()=>{const U=GoldfishUI.current,g=U.game,me=U.me,opp=g.players[1];const cm=opp.battlefield.find(b=>b.id===9100);cm.card.power=6;me.cmdDmgBy={[cm.card.name]:15};
  g.fogTurn=null;me.b9_cmbSafe=null;const hb=g.hooks.humanBlocks,hr=g.hooks.humanRespond;g.hooks.humanBlocks=async()=>new Map();g.hooks.humanRespond=async()=>null;const wasH=me.human;me.human=false;me.ai=new Goldfish.AI('casual');try{await g.combatPhase(opp,[{attacker:cm,defender:me}]);}finally{g.hooks.humanBlocks=hb;g.hooks.humanRespond=hr;me.human=wasH;me.ai=null;}return {dead:!!me.dead,by:me.cmdDmgBy,log:g.log.slice(-6).map(l=>l.m).join(' | ')}});
ok('21 commander damage registers a loss',kill.dead,JSON.stringify(kill).slice(0,300));
// --- multi-block selection (fresh prompt object, pure UI logic)
const mb=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const atk={id:9200,card:{uid:9200,name:'Brute',type:'Creature — Ogre',isCreature:true,power:5,toughness:5,kw:[],roles:[],colors:[],oracle:'',mana:Goldfish.manaInfo(''),cmc:5,triggers:[],abilities:[],statics:{},produces:[]},tapped:true,summoning:false,counters:0};
  me.dead=false;g.winner=null;U.ended=false;me.life=20;const mkb=id=>({id,card:{uid:id,name:'Bear',type:'Creature — Bear',isCreature:true,power:2,toughness:2,kw:[],roles:[],colors:['G'],oracle:'',mana:Goldfish.manaInfo(''),cmc:2,triggers:[],abilities:[],statics:{},produces:[]},tapped:false,summoning:false,counters:0});const bl=[mkb(9001),mkb(9002)];me.battlefield=me.battlefield.filter(b=>b.id!==9001&&b.id!==9002).concat(bl);let out=null;
  U.prompt={kind:'block',attacker:g.players[2],attacks:[{attacker:atk,defender:me}],blockers:bl,map:new Map(),sel:[],res:v=>{out=v;U.prompt=null}};g.players[2].battlefield.push(atk);U.render();
  const click=id=>document.querySelector('.gc[data-pid="'+id+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
  click(9001);click(9002);const selN=U.prompt.sel.length;click(9200);const mapped=(U.prompt.map.get(atk)||[]).length;
  document.querySelector('[data-act=block-go]').dispatchEvent(new MouseEvent('click',{bubbles:true}));return {selN,mapped,res:out&&[...out.values()].map(a=>a.length)}});
ok('two blockers selected together',mb.selN===2,JSON.stringify(mb));ok('both assigned to the attacker and submitted',mb.mapped===2&&mb.res&&mb.res[0]===2,JSON.stringify(mb));
console.log('errors',errs);await b.close();})();
