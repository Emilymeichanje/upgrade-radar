// a game interrupted mid-way, resumed from the save, finished, then replayed from the stored recording must match the uninterrupted run
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
await pg.goto('file://'+__dirname+'/rec.html');
const play=async(stopAtTurn)=>pg.evaluate(async(stopAt)=>{const U=GoldfishUI.current;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const t0=Date.now();
  while(Date.now()-t0<120000){await sleep(10);const g=U.game;if(!g)continue;if(g.winner&&U.ended)return 'ended';if(stopAt&&g.turn>=stopAt&&U.myTurn&&!U.busy&&!U.prompt)return 'stopped';const P=U.prompt,me=U.me;
    if(P){if(P.kind==='mull'){document.querySelector('[data-act=keep]').click();continue}if(P.kind==='priority'){P.res(null);continue}if(P.kind==='block'){const atk=P.attacks[0];const bl=atk&&(P.blockers||[]).find(x=>g.canBlock(x,atk.attacker));if(bl)P.map.set(atk.attacker,[bl]);P.res(P.map);continue}if(P.kind==='search'){P.res(P.pool.slice(0,1));continue}if(P.kind==='discard'){P.res(me.hand[0]);continue}if(P.kind==='modes'){P.res([P.modes[0].card||P.modes[0]]);continue}if(P.res){P.res(P.options&&P.options[0]||true);continue}continue}
    if(U.busy)continue;
    if(U.myTurn){if(U.turnPhase==='main1'&&U._t!==g.turn){U._t=g.turn;const land=me.hand.find(c=>c.isLand);if(land&&me.landsThisTurn<g.landLimit(me)){U.act(()=>U.exec('playLand',me,land));continue}const c=me.hand.find(c=>!c.isLand&&!U.needsTarget(c)&&g.castMode(me,c,'hand'));if(c){U.act(()=>U.exec('cast',me,c,'hand',null));continue}}
      if(U.turnPhase==='main1'&&U._a!==g.turn){U._a=g.turn;const opp=g.opponentsOf(me).find(q=>!q.dead);const asg=me.battlefield.filter(x=>g.canAttackWith(me,x)&&g.powerOf(me,x)>0).map(x=>({attacker:x,defender:opp}));if(asg.length&&U.endTurn){U.endTurn({action:'attack',assignments:asg});continue}}
      if(U.endTurn)U.endTurn({action:'end'})}}
  return 'timeout'},stopAtTurn);
// run 1: play to turn ~9 (a save exists at each turn start), then "close the tab"
await pg.evaluate(()=>{Math.random=Goldfish.mulberry(99);boot()});
ok('reached the interruption point',await play(9)==='stopped');
const saved=await pg.evaluate(()=>{const s=JSON.parse(localStorage.getItem('pt-save'));return {has:!!s,rec:s&&s.rec&&s.rec.moves.length,turn:s&&s.turn}});
ok('save carries the recording',saved.has&&saved.rec>0,JSON.stringify(saved));
// reload and resume
await pg.goto('file://'+__dirname+'/rec.html');
await pg.evaluate(()=>{const s=GoldfishUI.savedGame();GoldfishUI.resume(document.getElementById('t'),s,{onExit:()=>{}})});
const end=await play(0);ok('resumed game finished',end==='ended',end);
await pg.waitForTimeout(500);
const res=await pg.evaluate(async()=>{const L=await GoldfishUI.replays.list();const e=await GoldfishUI.replays.get(L[0].id);return {n:L.length,log:GoldfishUI.current.game.log.map(l=>l.m),rec:e.rec}});
ok('stored after resume',res.n===1);
const rp=await pg.evaluate(async rec=>{GoldfishUI.current.aborted=true;const el=document.getElementById('t');el.innerHTML='';const T=GoldfishUI.replay(el,rec,{onExit:()=>{}});T.rp.delay=0;const t0=Date.now();while(Date.now()-t0<120000){await new Promise(r=>setTimeout(r,30));if(T.rpDone||(T.game.winner&&T.ended))break}return {done:T.rpDone||null,log:T.game.log.map(l=>l.m)}},res.rec);
const strip=l=>l.filter(x=>!/game resumed/.test(x));const a=strip(res.log),c=strip(rp.log);let d=-1;for(let i=0;i<Math.max(a.length,c.length);i++)if(a[i]!==c[i]){d=i;break}
ok('replay of the resumed game matches line for line',d<0,d<0?a.length+' lines':`diff at ${d}: "${a[d]}" vs "${c[d]}" ${rp.done||''}`);
console.log('errors',errs.filter(e=>!/404/.test(e)));await b.close();})();
