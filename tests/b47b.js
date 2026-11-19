const T=require('./dfc.js');const {DC,ok,mkGame,put,run}=T;
(async()=>{
 { // AI's Valakut trigger; I Swat it and point it at the AI's own creature
   let asked=[];const [g,me]=await mkGame({hooks:{humanChoice:async q=>{asked.push(q.options.slice());return q.options.find(o=>/Dreadmaw/.test(o))||q.options[0]},humanSearch:async q=>{asked.push(q.pool.map(c=>c.name));return q.pool.filter(c=>/Dreadmaw/.test(c.name)).slice(0,1)}}});
   const ai=g.players[1];ai.battlefield=[];const v=put(g,ai,DC('Valakut, the Molten Pinnacle'));for(let i=0;i<5;i++)put(g,ai,DC('Mountain'));const maw=put(g,ai,DC('Colossal Dreadmaw'));const mine=put(g,me,DC('Llanowar Elves'));
   const sw=DC('Deflecting Swat');me.hand=[sw];me.command=[];put(g,me,{...DC('Kinnan, Bonder Prodigy'),isCommander:true});let ab=null,can=false,r=false,opts=[];
   g.hooks.humanPriority=async ctx=>{const top=g.stack[g.stack.length-1];opts.push((ctx.options||[]).map(o=>o.kind+':'+(o.card&&o.card.name)).join());if(!r&&top&&top.kind==='ability'&&top.caster===ai){ab=top;can=g.redirectable(me);const o=(ctx.options||[]).find(o=>o.kind==='cast'&&o.card===sw);if(o){r=true;return {...o,target:{spell:ab}}}}return null};
   g.active=1;g.phase='main1';await g.landEnters(ai,DC('Mountain'));await g.flushPending();await g.runStack(ai);
   ok('Deflecting Swat on an AI Valakut trigger: I choose the target, including its controller\'s own creature',!!ab&&can&&!!r&&ab.b47_by===me&&maw.marked===3||!ai.battlefield.includes(maw)&&false||(maw.marked||0)>=3,JSON.stringify([!!ab,can,!!r,maw.marked,mine&&me.battlefield.includes(mine),asked.slice(0,2),opts.slice(0,3),g.log.slice(-6).map(x=>x.m)]));
   console.log('  ',JSON.stringify([maw.marked,ab&&ab.b47_by===me,asked.slice(0,2).map(a=>a.slice(0,8)),g.log.slice(-7).map(x=>x.m)]));ok('…and the AI is an AI again afterwards',!ai.human&&!!ai.ai&&!g.b47_redir); }
 { // plain spell redirect unchanged
   const [g,me]=await mkGame();ok('Misdirection-style cards (spell only) are not offered abilities',!DC('Misdirection').redirectAb&&DC('Deflecting Swat').redirectAb&&DC('Bolt Bend').redirectAb); }
 console.log(T.fails()+' failed (swat)');})().catch(e=>console.log('ERR',e.stack));
