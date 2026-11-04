const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1400,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.goto('file://'+__dirname+'/ui5.html');
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
await pg.evaluate(async()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const l=me.hand.find(c=>c.isLand);await U.act(()=>g.playLand(me,l));});
await pg.click('[data-act=undo]');await pg.evaluate(async()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const l=me.hand.find(c=>c.isLand);await U.act(()=>g.playLand(me,l));});
const t0=await pg.evaluate(()=>GoldfishUI.current.game.turn);await pg.click('[data-act=end]');
// auto-pass any priority prompts during opponents' turns
for(let i=0;i<400;i++){const s=await pg.evaluate(()=>{const U=GoldfishUI.current;if(U.prompt&&['priority','counter','endstep','attack'].includes(U.prompt.kind)){U.prompt.res(null);return 'passed'}if(U.prompt&&U.prompt.kind==='block'){U.prompt.res(U.prompt.map);return 'blk'}if(U.prompt&&U.prompt.kind==='may'){U.prompt.res(false);return 'may'}return U.myTurn&&!U.busy?'mine':(U.prompt?U.prompt.kind:'wait')});if(s==='mine')break;if(!['passed','blk','may','wait'].includes(s)){console.log('stuck prompt',s);break}await pg.waitForTimeout(100);}
console.log('turn before',t0,'now',await pg.evaluate(()=>[GoldfishUI.current.game.turn,GoldfishUI.current.myTurn,GoldfishUI.current.me.battlefield.length]),'errors',errs);
await b.close();})();
