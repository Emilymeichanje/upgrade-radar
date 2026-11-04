require(__dirname+'/../../playtest.js');const {Game,AI,buildDeck,mulberry}=Goldfish;
const cards=[...require(__dirname+'/../fixtures/gap1.json'),...require(__dirname+'/../fixtures/gap2.json'),...require(__dirname+'/../fixtures/gap3.json'),...require(__dirname+'/../fixtures/gap4.json')].map(a=>({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7],loyalty:a[8]}));
const rng=mulberry(9);const bas=['Plains','Island','Swamp','Mountain','Forest'];
const mk=()=>{const pick=[];const used=new Set();while(pick.length<55){const c=cards[Math.floor(rng()*cards.length)];if(used.has(c.name))continue;used.add(c.name);pick.push(c);}return buildDeck([...pick,...[...Array(44)].map((_,i)=>({name:bas[i%5],type:'Basic Land — '+bas[i%5],mana:'',oracle:'',cmc:0})),{name:'Cmdr',type:'Legendary Creature — Elf',mana:'{2}',oracle:'',cmc:2,power:'3',toughness:'3'}],['Cmdr']);};
const sig=g=>JSON.stringify(g.players.map(p=>({l:p.life,h:p.hand.map(c=>c.uid),lib:p.library.map(c=>c.uid),b:p.battlefield.map(b=>[b.id,b.card.uid,b.tapped,b.counters]),gy:p.graveyard.map(c=>c.uid),pool:p.pool,lt:p.landsThisTurn})).concat([g.stack.length,g.turn,g.log.length]));
let ok=0,bad=0;
(async()=>{for(let s=1;s<=30;s++){let snapAt=null;
 const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:mk(),ai:new AI('focused')})),{seed:s,hooks:{}});
 // hook: when P0 starts main1 on round 3+, snapshot, let AI play, then restore and verify; then continue playing
 const orig=g.players[0].ai.mainPhase.bind(g.players[0].ai);let done=false;
 g.players[0].ai.mainPhase=async function(game,me,second){ if(done||game.turn<6||second) return orig(game,me,second); done=true;
   const before=sig(g);const pRef=g.players[0],arrRef=g.players;const snap=g.snapshot();await orig(game,me,second);const mid=sig(g);
   g.restore(snap);const after=sig(g);const same=before===after&&g.players===arrRef&&g.players[0]===pRef;
   if(same)ok++;else{bad++;console.log('MISMATCH seed',s,before===after,mid===before);}
   return game.players[0].ai.mainPhase===this.mainPhase?orig(game,me,second):orig(game,me,second);};
 try{await g.run();}catch(e){bad++;console.log('CRASH after restore seed',s,e.stack.split('\n').slice(0,3).join(' | '));}}
console.log('restore ok',ok,'bad',bad);})();
