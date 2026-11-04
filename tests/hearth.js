require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
const C=n=>{const a=R.find(x=>x[1]===n);return tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2].map(i=>({name:'P'+i,deck:deck(),ai:new AI('expert')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;return g};
const tick=async g=>{await g.emit({type:'tick'});await g.flushPending?.();await g.emit({type:'tick'})};let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
(async()=>{
 { const g=fresh();const [a,b]=g.players;for(let i=0;i<4;i++)await g.enterPerm(a,tagCard(mk('Forest','Basic Land — Forest','','',0)));const h=await g.enterPerm(a,C('Hearthhull, the Worldseed'));await tick(g);const land=a.battlefield.find(x=>x.card.isLand);
   const ab=h.card.abilities.find(x=>x.thr===2);ok('2+ ability unusable at 0 charge',!g.canUseAbility(a,h.card,ab,h));
   const L=b.life;await g.sacrifice(a,land);await tick(g);ok('8+ drain silent at 0 charge',b.life===L,'opp life '+b.life);
   h.charge=5;await tick(g);ok('2+ ability usable at 5 charge',g.canUseAbility(a,h.card,ab,h));await g.sacrifice(a,a.battlefield.find(x=>x.card.isLand));await tick(g);ok('8+ drain silent at 5 charge',b.life===L,'opp life '+b.life);
   h.charge=8;await tick(g);await g.sacrifice(a,a.battlefield.find(x=>x.card.isLand));await tick(g);ok('8+ drain fires at 8 charge',b.life===L-2,'opp life '+b.life); }
 { const g=fresh();const [a,b]=g.players;const md=tagCard(mk('Mayhem Devil','Creature — Devil','{1}{B}{R}','Whenever a player sacrifices a permanent, this creature deals 1 damage to any target.',3,3,3));await g.enterPerm(a,md);await tick(g);
   const t=await g.enterPerm(b,tagCard({...mk('Treasure','Token Artifact — Treasure','','{T}, Sacrifice this artifact: Add one mana of any color.',0),token:true}));await tick(g);const L0=g.players.map(p=>p.life);await g.sacrifice(b,t);await tick(g);
   ok('Mayhem Devil deals exactly 1 per sacrifice',g.players.reduce((s,p,i)=>s+(L0[i]-p.life),0)===1,JSON.stringify(g.players.map((p,i)=>p.life-L0[i]))); }
 { const g=fresh();const [a,b]=g.players;const cc=await g.enterPerm(b,C('Currency Converter'));await tick(g);const ad=C('Astral Dragon');a.hand.push(ad);a.pool='UUUUUUUU'.split('').map(c=>({c}));await g.cast(a,ad,'hand');while(g.stack.length)await g.resolve();await tick(g);
   const cp=a.battlefield.filter(x=>x.card.name==='Currency Converter');ok('Astral Dragon makes two 3/3 flying Dragon copies, labelled',cp.length===2&&cp.every(x=>x.card.isCreature&&g.powerOf(a,x)===3&&/altered|copy/.test(x.card.altered||'')&&(x.card.kw||[]).includes('flying')),JSON.stringify(cp.map(x=>[x.card.altered,x.card.power,x.card.kw]))); }
 console.log(fails+' failed');})();
