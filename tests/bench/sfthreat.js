// Does the table pressure a superfriends player? Seat 0 = the owner's Tam deck (AI), seats 1–3 random gap decks. Measures when they first attack seat 0.
require(__dirname+'/../../playtest.js');const {Game,AI,buildDeck,mulberry}=Goldfish;
const F=f=>require(__dirname+'/../fixtures/'+f);
const gap=[...F('gap1.json'),...F('gap2.json'),...F('gap3.json'),...F('gap4.json'),...F('gap5.json')].map(a=>({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7],loyalty:a[8]}));
const R=[...F('tamterra.json'),...F('pw8.json')].map(a=>({name:a[0],mana:a[1],type:a[2],oracle:a[3],cmc:a[4],power:a[5],toughness:a[6],loyalty:a[7]}));
const names=require(process.argv[4]||__dirname+'/../fixtures/twodecks.json').tam;
const N=+process.argv[2]||16, seed=+process.argv[3]||7; const rng=mulberry(seed);const bas=['Plains','Island','Swamp','Mountain','Forest'];
const tam=()=>{const cs=names.map(n=>R.find(c=>c.name===n)).filter(Boolean);while(cs.length<100)cs.push({name:bas[cs.length%5],type:'Basic Land — '+bas[cs.length%5],mana:'',oracle:'',cmc:0});return buildDeck(cs.slice(0,100),['Tam, the Possibility']);};
const rnd=()=>{const pick=[];const used=new Set();const pool=gap.filter(c=>!/Basic/.test(c.type));while(pick.length<55){const c=pool[Math.floor(rng()*pool.length)];if(used.has(c.name))continue;used.add(c.name);pick.push(c);}
 const lands=[...Array(44)].map((_,i)=>{const n=bas[i%5];return{name:n,type:'Basic Land — '+n,mana:'',oracle:'',cmc:0}});return buildDeck([...pick,...lands,{name:'Cmdr',type:'Legendary Creature — Elf',mana:'{2}',oracle:'',cmc:2,power:'3',toughness:'3'}],['Cmdr']);};
(async()=>{let first=[],share=[],toSeat0=0,total=0,wins0=0,errs=0;
 for(let k=0;k<N;k++){const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:i?rnd():tam(),ai:new AI('expert')})),{seed:Math.floor(rng()*1e9),hooks:{}});
  let f=null,a0=0,at=0;const orig=g.combatPhase.bind(g);g.combatPhase=async(p,as)=>{if(p!==g.players[0]&&as&&as.length){at+=as.length;const n0=as.filter(x=>x.defender===g.players[0]).length;a0+=n0;if(n0&&f==null)f=g.round;}return orig(p,as)};
  try{const w=await g.run();if(w===g.players[0])wins0++;}catch(e){errs++}
  first.push(f==null?99:f);toSeat0+=a0;total+=at;}
 first.sort((a,b)=>a-b);console.log(JSON.stringify({games:N,medianFirstAttackRound:first[Math.floor(N/2)],firstRounds:first.join(','),attacksIntoTamShare:(toSeat0/Math.max(1,total)).toFixed(2),fairShare:'0.33',tamWins:wins0,errs}));})();
