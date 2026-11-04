const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1400,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
const ids=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me,o=g.players.find(p=>p!==me);const T=Goldfish.tagCard;
 const pw={id:777001,card:T({name:'Jace Test',type:'Legendary Planeswalker — Jace',mana:'{3}',oracle:'+1: Draw a card.',cmc:3,loyalty:'4'}),tapped:false,summoning:false,counters:0,loyalty:4};o.battlefield.push(pw);
 const c={id:777002,card:T({name:'Ogre',type:'Creature — Ogre',mana:'{3}',oracle:'',cmc:3,power:'5',toughness:'5'}),tapped:false,summoning:false,counters:0};me.battlefield.push(c);U.render();return [pw.id,c.id];});
await pg.click('[data-act=attack]');
const hasPw=await pg.$('[data-act=defpw]');console.log('planeswalker attack button:',!!hasPw);
await pg.click('[data-act=defpw]');await pg.click(`[data-pid="${ids[1]}"]`);
await pg.click('[data-act=atk-go]');
for(let i=0;i<300;i++){const s=await pg.evaluate(()=>{const U=GoldfishUI.current;if(U.prompt&&['priority','counter','endstep','attack','may'].includes(U.prompt.kind)){U.prompt.res(U.prompt.kind==='may'?false:null);return 'p'}if(U.prompt&&U.prompt.kind==='block'){U.prompt.res(new Map());return 'b'}return U.game.players.find(p=>p!==U.me).battlefield.some(b=>b.id===777001)?'wait':'gone'});if(s==='gone')break;await pg.waitForTimeout(100);}
const res=await pg.evaluate(()=>{const g=GoldfishUI.current.game,o=g.players.find(p=>p!==GoldfishUI.current.me);return {pwAlive:o.battlefield.some(b=>b.id===777001),life:o.life,log:g.log.filter(l=>/Jace Test/.test(l.m||'')).map(l=>l.m).slice(-3)}});console.log(JSON.stringify(res));
console.log('errors',errs);await b.close();})();
