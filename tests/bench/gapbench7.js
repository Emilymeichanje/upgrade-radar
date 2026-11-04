require(__dirname+'/../../playtest.js');const {Game,AI,buildDeck,mulberry}=Goldfish;
const cards=[...require(__dirname+'/../fixtures/gap1.json'),...require(__dirname+'/../fixtures/gap2.json'),...require(__dirname+'/../fixtures/gap3.json'),...require(__dirname+'/../fixtures/gap4.json'),...require(__dirname+'/../fixtures/gap7.json')].map(a=>({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7],loyalty:a[8]}));
const N=+process.argv[2]||40, seed=+process.argv[3]||1; const rng=mulberry(seed);
const bas=['Plains','Island','Swamp','Mountain','Forest'];
const mk=()=>{const pick=[];const used=new Set();const pool=cards.filter(c=>!/Basic/.test(c.type));while(pick.length<55){const c=pool[Math.floor(rng()*pool.length)];if(used.has(c.name))continue;used.add(c.name);pick.push(c);}
 const lands=[...Array(44)].map((_,i)=>{const n=bas[i%5];return{name:n,type:'Basic Land — '+n,mana:'',oracle:'',cmc:0}});const cmd={name:'Cmdr',type:'Legendary Creature — Elf',mana:'{2}',oracle:'',cmc:2,power:'3',toughness:'3'};return buildDeck([...pick,...lands,cmd],['Cmdr']);};
let errs=[],hangs=0,turns=0,games=0;const t0=Date.now();
(async()=>{for(let k=0;k<N;k++){const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:mk(),ai:new AI(['expert','focused','cutthroat','casual'][i])})),{seed:Math.floor(rng()*1e9),hooks:{}});
 try{const w=await g.run();games++;turns+=g.turn;if(!w)hangs++;for(const e of g.errors||[])errs.push({m:e.slice(0,140),st:"op",log:[]});}catch(e){errs.push({m:e.message.slice(0,140),st:e.stack.split('\n').slice(1,3).map(s=>s.trim().replace(/\(.*playtest.js:/,'(').slice(0,90)).join(' | '),log:g.log.slice(-3).map(l=>l.m.slice(0,100))});}}
 const by={};for(const e of errs){by[e.m]=by[e.m]||{n:0,ex:e};by[e.m].n++;}
 console.log(JSON.stringify({games,hangs,avgTurns:(turns/Math.max(1,games)).toFixed(1),errs:errs.length,secs:((Date.now()-t0)/1000).toFixed(0)}));for(const [m,v] of Object.entries(by))console.log(v.n+'x',m,'\n   ',v.ex.st,'\n   ',v.ex.log.join(' || '));})();
