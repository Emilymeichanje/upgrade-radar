const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1400,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
// set up: an opponent's menace attacker vs two of my creatures, open the real block prompt
const ids=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me,o=g.players.find(p=>p!==me);const T=Goldfish.tagCard;
 const mkP=(p,c)=>{const pm={id:Math.floor(Math.random()*1e9),card:T(c),tapped:false,summoning:false,counters:0};p.battlefield.push(pm);return pm};
 const a=mkP(o,{name:'Brute',type:'Creature — Ogre',mana:'{4}',oracle:'Menace',cmc:4,power:'4',toughness:'4'});const x=mkP(me,{name:'Bear A',type:'Creature — Bear',mana:'{2}',oracle:'',cmc:2,power:'2',toughness:'2'});const y=mkP(me,{name:'Bear B',type:'Creature — Bear',mana:'{2}',oracle:'',cmc:2,power:'2',toughness:'2'});
 window.__blk=U.humanBlocks({defender:me,attacker:o,attacks:[{attacker:a,defender:me}],blockers:[x,y],game:g});return [a.id,x.id,y.id];});
const [aid,xid,yid]=ids;
await pg.click(`[data-pid="${xid}"]`);await pg.click(`[data-pid="${aid}"]`);await pg.click('[data-act=block-go]');
const warn=await pg.evaluate(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.warn);console.log('single block refused:',!!warn,warn);
await pg.click(`[data-pid="${yid}"]`);await pg.click(`[data-pid="${aid}"]`);await pg.click('[data-act=block-go]');
const res=await pg.evaluate(async()=>{const m=await window.__blk;return [...m].map(([a,bs])=>[a.card.name,bs.map(b=>b.card.name)])});console.log('blocks:',JSON.stringify(res));
await pg.screenshot({path:__dirname+'/ui10.png'});
console.log('errors',errs);await b.close();})();
