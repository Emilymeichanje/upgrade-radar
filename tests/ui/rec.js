// record a game with real human decisions (mulligan, lands, casts with targets, modes, attacks, blocks), store it, replay it, compare logs
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:1000}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));
await pg.goto('file://'+__dirname+'/rec.html');
const ok=(n,c,x='')=>{console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));};
const SEED=+(process.argv[2]||7);await pg.evaluate(sd=>{Math.random=Goldfish.mulberry(sd);boot()},SEED);
// scripted human: plays a land, casts the first castable thing, attacks with everything at a rotating player, blocks with first creature, answers prompts with the first option
const r=await pg.evaluate(async()=>{const U=GoldfishUI.current;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const t0=Date.now();let acts=0,turnsSeen=new Set();
  while(Date.now()-t0<150000){await sleep(15);const g=U.game;if(!g)continue;if(g.winner&&U.ended)break;const P=U.prompt,me=U.me;
    if(P){acts++;
      if(P.kind==='mull'){if(!U._m){U._m=1;document.querySelector('[data-act=mull]').click();await sleep(5);document.querySelector('[data-act=mull-yes]').click();await sleep(5);}document.querySelector('[data-act=keep]').click();continue}
      if(P.kind==='mull-bottom'){P.sel=me.hand.slice(0,P.n);U.render();await sleep(5);document.querySelector('[data-act=bottom-go]').click();continue}
      if(P.kind==='priority'){const o=P.options.find(o=>o.kind==='cast'&&!U.needsTarget(o.card));P.res(o&&(acts%3===0)?o:null);continue}
      if(P.kind==='block'){const atk=P.attacks[0];const bl=atk&&(P.blockers||[]).find(x=>g.canBlock(x,atk.attacker));if(bl)P.map.set(atk.attacker,[bl]);P.res(P.map);continue}
      if(P.kind==='modes'){P.res([P.modes[0].card||P.modes[0]]);continue}
      if(P.kind==='search'){P.res(P.pool.slice(0,Math.min(1,P.n||1)));continue}
      if(P.kind==='discard'){P.res(me.hand[0]);continue}
      if(P.kind==='may'){P.res(true);continue}
      if(P.kind==='player'){P.res(P.players[0]);continue}
      if(P.kind==='choice'){P.res(P.options[0]);continue}
      if(P.kind==='num'){P.res(P.min||1);continue}
      if(P.res){P.res(P.options&&P.options[0]||null);continue}continue}
    if(U.busy)continue;
    if(U.mode&&U.mode.kind==='target'){const t=g.opponentsOf(me).flatMap(q=>q.battlefield).find(x=>x.card.isCreature);U.mode=null;if(t){U.act(()=>U.exec('cast',me,U._tc,U._tz,t))}continue}
    if(U.myTurn){acts++;turnsSeen.add(g.turn);const ph=U.turnPhase;
      if(ph==='main1'&&U._did!==g.turn){U._did=g.turn;const land=me.hand.find(c=>c.isLand);if(land&&me.landsThisTurn<g.landLimit(me)){U.act(()=>U.exec('playLand',me,land));continue}}
      if(ph==='main1'&&U._did===g.turn&&(U._casts||0)<3){const tgt=g.opponentsOf(me).flatMap(q=>q.battlefield).find(x=>x.card.isCreature);const c=me.hand.filter(c=>!c.isLand&&g.castMode(me,c,'hand')).find(c=>!U.needsTarget(c)||tgt);if(c&&U._ct!==g.turn+':'+c.uid){U._ct=g.turn+':'+c.uid;U._casts=(U._cTurn===g.turn?U._casts||0:0)+1;U._cTurn=g.turn;U.act(()=>U.exec('cast',me,c,'hand',U.needsTarget(c)?tgt:null));continue}}
      if(ph==='main1'&&U._atk!==g.turn){U._casts=0;U._atk=g.turn;const opps=g.opponentsOf(me).filter(q=>!q.dead);const asg=me.battlefield.filter(x=>g.canAttackWith(me,x)&&g.powerOf(me,x)>0).map((x,i)=>({attacker:x,defender:opps[(g.turn+i)%opps.length]}));if(asg.length&&U.endTurn){U.endTurn({action:'attack',assignments:asg});continue}}
      if(U.endTurn)U.endTurn({action:'end'});}
  }
  const g=U.game;await sleep(300);const list=await GoldfishUI.replays.list();window.__recDiag=(U.diag||[]).slice();return {winner:g.winner&&g.winner.name,turn:g.turn,acts,moves:U.rec.moves.length,kinds:[...new Set(U.rec.moves.map(m=>m.h||m.m))],log:g.log.map(l=>l.m),stored:list.length,id:list[0]&&list[0].id,dead:g.players.map(p=>p.dead)}});
ok('recorded game finished',!!r.winner||r.turn>20,JSON.stringify({w:r.winner,t:r.turn,acts:r.acts,moves:r.moves,kinds:r.kinds}));
ok('stored in Replays',r.stored===1);
ok('recording covers casts, attacks and blocks',['cast','humanTurn','humanBlocks'].every(k=>r.kinds.includes(k)),r.kinds.join(','));
// replay from storage
if(!r.id){console.log('no stored id');await b.close();return}
const rp=await pg.evaluate(async(id)=>{const e=await GoldfishUI.replays.get(id);const rec=JSON.parse(JSON.stringify(e.rec));const el=document.getElementById('t');el.innerHTML='';GoldfishUI.current.aborted=true;
  const T=GoldfishUI.replay(el,rec,{onExit:()=>{}});T.rp.delay=0;const sleep=ms=>new Promise(r=>setTimeout(r,ms));const t0=Date.now();while(Date.now()-t0<150000){await sleep(30);if(T.rpDone||(T.game&&T.game.winner&&T.ended))break}
  return {done:T.rpDone||null,winner:T.game.winner&&T.game.winner.name,log:T.game.log.map(l=>l.m),pos:T.rpPos,n:rec.moves.length,bar:!!document.querySelector('.rpbar')}},r.id);
const strip=l=>l.filter(x=>!/game resumed/.test(x));
const a=strip(r.log),c=strip(rp.log);let firstDiff=-1;for(let i=0;i<Math.max(a.length,c.length);i++)if(a[i]!==c[i]){firstDiff=i;break}
if(firstDiff>=0)console.log('REC CONTEXT:\n'+a.slice(Math.max(0,firstDiff-6),firstDiff+2).join('\n')+'\nREPLAY:\n'+c.slice(Math.max(0,firstDiff-2),firstDiff+2).join('\n'));
ok('replay reproduces the game line for line',firstDiff<0,firstDiff<0?`${a.length} lines`:`first diff at ${firstDiff}: rec="${a[firstDiff]}" vs replay="${c[firstDiff]}" (${rp.done})`);
ok('replay consumed every recorded decision',rp.pos===rp.n,rp.pos+'/'+rp.n);
ok('transport bar shown',rp.bar);
console.log('errors',errs.filter(e=>!/404/.test(e)));console.log('recdiag',JSON.stringify(await pg.evaluate(()=>window.__recDiag||[])).slice(0,1800));await b.close();})();
