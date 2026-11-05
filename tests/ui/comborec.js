// natural combo game: you assemble Monolith + Kinnan and go infinite; an AI assembles Citadel + Top + Aetherflux and wins; replay must match line for line
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/rec.html');
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
const SEED=+(process.argv[2]||4);await pg.evaluate(sd=>{Math.random=Goldfish.mulberry(sd);bootCombo()},SEED);
const r=await pg.evaluate(async()=>{const U=GoldfishUI.current;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const t0=Date.now();let declared=0,colossi=0;
  while(Date.now()-t0<150000){await sleep(10);const g=U.game;if(!g)continue;if(g.winner&&U.ended)break;const P=U.prompt,me=U.me;
    if(P){if(P.kind==='mull'){document.querySelector('[data-act=keep]').click();continue}if(P.kind==='priority'){P.res(null);continue}if(P.kind==='block'){P.res(new Map());continue}if(P.kind==='search'){P.res(P.pool.slice(0,1));continue}if(P.kind==='discard'){P.res(me.hand[0]);continue}if(P.res){P.res(P.options&&P.options[0]||true);continue}continue}
    if(U.busy)continue;
    if(U.myTurn&&U.turnPhase==='main1'){
      const go=document.querySelector('[data-act=combo-go]');if(go&&U._dec!==g.turn){U._dec=g.turn;declared++;go.click();continue}
      if(U._t!==g.turn){U._t=g.turn;const land=me.hand.find(c=>c.isLand);if(land&&me.landsThisTurn<g.landLimit(me)){U.act(()=>U.exec('playLand',me,land));continue}}
      const c=me.hand.find(c=>!c.isLand&&g.castMode(me,c,'hand')&&(c.name!=='Kinnan, Bonder Prodigy'||!me.battlefield.some(b=>b.card.name===c.name))&&(c.name!=='Basalt Monolith'||!me.battlefield.some(b=>b.card.name===c.name)));
      if(c&&(U._casts||0)<12){U._casts=(U._cT===g.turn?U._casts||0:0)+1;U._cT=g.turn;if(c.name==='Colossus')colossi++;U.act(()=>U.exec('cast',me,c,'hand',null));continue}
      if(U.endTurn)U.endTurn({action:'end'})}
    else if(U.myTurn&&U.endTurn)U.endTurn({action:'end'});}
  await sleep(400);const g=U.game;const L=await GoldfishUI.replays.list();return {w:g.winner&&g.winner.name,turn:g.turn,declared,colossi,log:g.log.map(l=>l.m),id:L[0]&&L[0].id,combos:g.log.filter(l=>/∞/.test(l.m)).map(l=>l.m)}});
ok('you went infinite at least once',r.declared>0&&r.combos.some(l=>/You · P0.*infinite colorless/.test(l)),JSON.stringify({d:r.declared,combos:r.combos.slice(0,4)}));
ok('cast Colossus off infinite mana',r.colossi>0||r.log.some(l=>/You · P0: casts Colossus/.test(l)),'colossi='+r.colossi);
ok('game ended (someone won)',!!r.w,JSON.stringify({w:r.w,t:r.turn,last:r.log.slice(-3)}));
const rp=await pg.evaluate(async id=>{const e=await GoldfishUI.replays.get(id);GoldfishUI.current.aborted=true;const el=document.getElementById('t');el.innerHTML='';const T=GoldfishUI.replay(el,JSON.parse(JSON.stringify(e.rec)),{onExit:()=>{}});T.rp.delay=0;const t0=Date.now();while(Date.now()-t0<150000){await new Promise(r=>setTimeout(r,30));if(T.rpDone||(T.game.winner&&T.ended))break}return {done:T.rpDone||null,log:T.game.log.map(l=>l.m)}},r.id);
const a=r.log,c=rp.log;let d=-1;for(let i=0;i<Math.max(a.length,c.length);i++)if(a[i]!==c[i]){d=i;break}
ok('replay matches line for line (combos included)',d<0,d<0?a.length+' lines':`diff at ${d}: "${a[d]}" vs "${c[d]}" ${rp.done||''}`);
console.log('combo lines:',r.combos.slice(0,6).join(' || '));
console.log('errors',errs.filter(e=>!/404/.test(e)));await b.close();})();
