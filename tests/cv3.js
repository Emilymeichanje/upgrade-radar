require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;
const RAW=[...require(__dirname+'/fixtures/gap1.json'),...require(__dirname+'/fixtures/gap2.json'),...require(__dirname+'/fixtures/gap3.json'),...require(__dirname+'/fixtures/gap4.json'),...require(__dirname+'/fixtures/gap5.json'),...require(__dirname+'/fixtures/gap6.json'),...require(__dirname+'/fixtures/gap7.json')].map(a=>({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7],loyalty:a[8]}));
const C=n=>{const r=RAW.find(x=>x.name===n||x.name.startsWith(n+' //'));if(!r)throw new Error('no card '+n);return tagCard(r);};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const L=n=>tagCard(mk(n,'Basic Land — '+n,'','',0));
let fails=0,pass=0;const ok=(n,c,x='')=>{if(c)pass++;else{fails++;console.log('FAIL '+n+(x?' — '+x:''));}};
function fresh(n=3){const g=new Game([...Array(n)].map((_,i)=>({name:'P'+i,deck:deck(),ai:new AI('focused')})),{seed:11,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;g.players.forEach(p=>p.turnCount=2);return g;}
const put=(g,p,card,o={})=>{const c=card.uid?card:tagCard(card);const pm={id:Math.random(),card:c,tapped:false,summoning:false,counters:0,...o};if(c.isPlaneswalker)pm.loyalty=c.startLoyalty;p.battlefield.push(pm);return pm};
const lands=(g,p,ns)=>ns.forEach(n=>put(g,p,L(n)));const last=(g,k=3)=>g.log.slice(-k).map(l=>l.m).join(' | ');
const bear=()=>tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2));
const T=async(name,fn)=>{try{await fn();}catch(e){fails++;console.log('CRASH '+name+': '+e.stack.split('\n').slice(0,3).join(' / '));}};
const elf=(p=2,t=2)=>tagCard(mk('Elfy','Creature — Elf Warrior','{1}{G}','',2,p,t));
const flush=async g=>{await g.emit({type:'tick'});};
const W=(g,a,n,nm='Mountain')=>lands(g,a,Array(n).fill(nm));
const opp=(g,b,c)=>{const t=put(g,b,c);t.owner=g.players.indexOf(b);return t};
const spell=(g,b,c)=>{g.stack.push({id:900+Math.floor(Math.random()*99),kind:'spell',card:c,caster:b,target:null,zone:'hand'});return g.stack[g.stack.length-1]};
(async()=>{
const S=(n,ty,mana,o,p,t,cmc=0)=>tagCard(mk(n,ty,mana,o,cmc,p,t));
const R=(g,p,ops,src,ctx={})=>g.held(()=>g.runOps(p,ops,src,ctx));
const abO=(g,a,card,pred)=>g.abilityOptions(a,{}).find(x=>x.card===card&&(!pred||pred(x)));
const abOI=(g,a,card,pred)=>g.abilityOptions(a,{instant:true}).find(x=>x.card===card&&(!pred||pred(x)));
const kwOf=(g,p,pm)=>{g.refreshStatics();return [...(pm.card.kw||[]),...(pm.kwT||[]),...(pm.kwPerm||[]),...((p.kwEOT&&pm.card.isCreature)?[...p.kwEOT]:[])];};
const sorc=(n='Sorc',mana='{1}',cmc=1)=>tagCard(mk(n,'Sorcery',mana,'You gain 1 life.',cmc));
const inst=(n='Inst',mana='{1}',cmc=1)=>tagCard(mk(n,'Instant',mana,'You gain 1 life.',cmc));
const cre=(n,p,t,cmc,ty='Creature — Ogre',mana)=>tagCard(mk(n,ty,mana||('{'+Math.max(0,cmc-1)+'}{G}'),'',cmc,p,t));
const art=(n='Rock',cmc=1)=>tagCard(mk(n,'Artifact','{'+cmc+'}','',cmc));
const ench=(n='Glyph',cmc=1)=>tagCard(mk(n,'Enchantment','{'+cmc+'}','',cmc));
const bBlock=(g)=>{for(const q of g.players)q.ai.stackResponse=()=>null;};
const pool=(a,c)=>(a.pool||[]).filter(e=>!c||e.c===c).length;
const gyN=(a,n)=>a.graveyard.filter(c=>c.name===n).length;
const bfN=(a,n)=>a.battlefield.filter(b=>b.card.name===n).length;
const cdx=async(g,a,b,att,dmg)=>{g._cdDefender=b;g._cdDmg=dmg;await g.combatDamageTriggers(a,att);await flush(g);};

// ---- Dark Petition
// ENGINE BUG
await T('Dark Petition tutor + spell mastery met',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const dp=C('Dark Petition');a.hand=[dp];W(g,a,5,'Swamp');a.graveyard.push(sorc('S1'),inst('I1'));const tgt=cre('Tutored Guy',5,5,5);a.library.push(tgt);const lib0=a.library.length;const bf0=a.battlefield.length;
  await g.cast(a,dp,'hand');await flush(g);
  ok('Dark Petition: a library card was put into hand',a.hand.length===1&&a.hand[0]===tgt,`hand=${a.hand.map(c=>c.name)}`);
  // ENGINE BUG (spell mastery not implemented)
  ok('Dark Petition: spell mastery (2 inst/sorc in gy) adds {B}{B}{B}',pool(a,'B')>=3,JSON.stringify(a.pool));
  // ENGINE BUG (ramp role fetches a land)
  ok('Dark Petition: no land put onto battlefield',a.battlefield.length===bf0,`${bf0}->${a.battlefield.length}`);});
await T('Dark Petition spell mastery not met',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const dp=C('Dark Petition');a.hand=[dp];W(g,a,5,'Swamp');a.graveyard.push(sorc('S1'),cre('Dead',1,1,1));
  await g.cast(a,dp,'hand');await flush(g);
  ok('Dark Petition: only 1 inst/sorc in gy (itself not counted) -> no mana',pool(a,'B')===0,JSON.stringify(a.pool));});

// ---- Kambal
await T('Kambal L1 opp tokens copied, once per turn, for each',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Kambal, Profiteering Mayor'));
  await R(g,b,[{op:'tokens',n:2,pt:[1,1],kw:[],types:'Goblin'}],{name:'X'});await flush(g);
  const cps=a.battlefield.filter(x=>x.card.name==='Goblin');
  ok('Kambal: copy of each opp token (2), tapped',cps.length===2&&cps.every(x=>x.tapped),`${cps.length}`);
  await R(g,b,[{op:'tokens',n:1,pt:[1,1],kw:[],types:'Goblin'}],{name:'X'});await flush(g);
  ok('Kambal: second batch same turn -> no copies',bfN(a,'Goblin')===2,`${bfN(a,'Goblin')}`);
  g.turn++;await R(g,b,[{op:'tokens',n:1,pt:[1,1],kw:[],types:'Goblin'}],{name:'X'});await flush(g);
  ok('Kambal: next turn triggers again',bfN(a,'Goblin')===3,`${bfN(a,'Goblin')}`);});
await T('Kambal L1 own tokens not copied',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Kambal, Profiteering Mayor'));
  await R(g,a,[{op:'tokens',n:1,pt:[1,1],kw:[],types:'Goblin'}],{name:'X'});await flush(g);
  ok('Kambal: own token -> no copy',bfN(a,'Goblin')===1,`${bfN(a,'Goblin')}`);});
// ENGINE BUG
await T('Kambal L2 your tokens drain once per batch',async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,C('Kambal, Profiteering Mayor'));const la=a.life,lb=b.life,lc=c.life;
  await R(g,a,[{op:'tokens',n:3,pt:[1,1],kw:[],types:'Soldier'}],{name:'X'});await flush(g);
  ok('Kambal: tokens you control enter -> each opp loses 1 (once for the batch)',lb-b.life===1&&lc-c.life===1,`b ${lb-b.life} c ${lc-c.life}`);
  ok('Kambal: you gain 1',a.life-la===1,`${a.life-la}`);});
await T('Kambal L2 negatives',async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,C('Kambal, Profiteering Mayor'));const lb=b.life,la=a.life;
  const x=await g.enterPerm(a,bear());await g.creatureEntered(a,x);await g.permEntered(a,x);await flush(g);
  ok('Kambal: nontoken creature -> no drain',b.life===lb&&a.life===la);
  const lc=c.life;const sq=put(g,c,bear());await R(g,c,[{op:'tokenCopyOf',n:1}],{name:'X'},{target:sq});await flush(g);ok("Kambal: opponent's token entering (under their control) -> no drain from Kambal's L2",c.life>=lc-0&&b.life===lb,`b ${lb-b.life}`);});
// ENGINE BUG
await T('Kambal L2 batch via tokenCopyOf',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Kambal, Profiteering Mayor'));const x=put(g,a,bear());const lb=b.life;
  await R(g,a,[{op:'tokenCopyOf',n:2}],{name:'X'},{target:x});await flush(g);ok('Kambal: two tokens created at once -> opponent loses 1 (one or more = one trigger)',lb-b.life===1,`${lb-b.life}`);});

// ---- Quintorius
// ENGINE BUG
await T('Quintorius +1 discard-then-draw',async()=>{const g=fresh();const [a]=g.players;const q=put(g,a,C('Quintorius, History Chaser'));a.hand=[cre('H1',1,1,1),cre('H2',1,1,1)];const h0=a.hand.length;
  const o=g.abilityOptions(a,{}).find(x=>x.perm===q&&x.ab.loyalty===1);ok('Quintorius +1 option',!!o);if(!o)return;await g.activate(a,o);await flush(g);
  ok('Quintorius +1: draws only if a card was discarded (hand +1 or unchanged, never +2)',a.hand.length===h0+1||a.hand.length===h0,`hand ${h0}->${a.hand.length}`);});
// ENGINE BUG
await T('Quintorius +1 with empty hand',async()=>{const g=fresh();const [a]=g.players;const q=put(g,a,C('Quintorius, History Chaser'));a.hand=[];
  const o=g.abilityOptions(a,{}).find(x=>x.perm===q&&x.ab.loyalty===1);if(!o){ok('Quintorius +1 option (empty hand)',false);return;}await g.activate(a,o);await flush(g);
  ok('Quintorius +1: empty hand -> no discard -> no draw',a.hand.length===0,`hand ${a.hand.length}`);});

// ---- Court of Ardenvale
await T('Court of Ardenvale not monarch -> hand',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Court of Ardenvale'));g.monarch=b;const c3=cre('Three',3,3,3),c4=cre('Four',4,4,4);a.graveyard.push(c3,c4);
  await g.fireTriggers(a,'upkeep');await flush(g);
  ok('Court: MV3 permanent card to hand (not monarch)',a.hand.includes(c3)&&!a.battlefield.some(x=>x.card===c3));ok('Court: MV4 card stays',a.graveyard.includes(c4));});
await T('Court of Ardenvale monarch -> battlefield',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Court of Ardenvale'));g.monarch=a;const c3=cre('Three',3,3,3);a.graveyard.push(c3);
  await g.fireTriggers(a,'upkeep');await flush(g);
  ok('Court: monarch -> MV3 card onto battlefield',a.battlefield.some(x=>x.card===c3)&&!a.hand.includes(c3));});
await T('Court of Ardenvale nonpermanent ignored',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Court of Ardenvale'));g.monarch=b;const s=sorc('Sorcy');a.graveyard.push(s);
  await g.fireTriggers(a,'upkeep');await flush(g);ok('Court: sorcery card not returned',a.graveyard.includes(s));});

// ---- Moonshaker Cavalry
await T('Moonshaker Cavalry X = creatures you control',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());put(g,a,bear());const v=opp(g,b,bear());const c=C('Moonshaker Cavalry');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});g.refreshStatics();
  ok('Moonshaker: bear gets +3/+3 (3 creatures)',g.powerOf(a,x)===5&&g.toughOf(a,x)===5,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);
  ok('Moonshaker: bear gains flying',kwOf(g,a,x).includes('flying'));
  ok('Moonshaker: opponent creature unaffected',g.powerOf(b,v)===2&&!kwOf(g,b,v).includes('flying'));});
await T('Moonshaker Cavalry X with 2 creatures',async()=>{const g=fresh();const [a]=g.players;const x=put(g,a,bear());const c=C('Moonshaker Cavalry');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});ok('Moonshaker: X=2 -> bear 4/4',g.powerOf(a,x)===4,`${g.powerOf(a,x)}`);});

// ---- Teshar
// ENGINE BUG
await T('Teshar historic cast returns one MV<=3 creature',async()=>{const g=fresh();const [a]=g.players;bBlock(g);put(g,a,C("Teshar, Ancestor's Apostle"));const c2=cre('Two',2,2,2),c3=cre('Three',3,3,3),c4=cre('Four',4,4,4);a.graveyard.push(c2,c3,c4);const r=art('Relic',1);a.hand=[r];W(g,a,1,'Plains');
  await g.cast(a,r,'hand');await flush(g);
  const back=[c2,c3,c4].filter(c=>a.battlefield.some(x=>x.card===c));
  ok('Teshar: exactly one creature card returned',back.length===1,back.map(c=>c.name).join());ok('Teshar: MV4 not returned',!back.includes(c4));});
await T('Teshar nonhistoric cast does nothing',async()=>{const g=fresh();const [a]=g.players;bBlock(g);put(g,a,C("Teshar, Ancestor's Apostle"));const c2=cre('Two',2,2,2);a.graveyard.push(c2);const s=sorc('Plain Sorc');a.hand=[s];W(g,a,1,'Plains');
  await g.cast(a,s,'hand');await flush(g);ok('Teshar: nonhistoric spell -> no return',a.graveyard.includes(c2));});
await T('Teshar legendary creature spell is historic',async()=>{const g=fresh();const [a]=g.players;bBlock(g);put(g,a,C("Teshar, Ancestor's Apostle"));const c2=cre('Two',2,2,2);a.graveyard.push(c2);const l=tagCard(mk('Leggy','Legendary Creature — Human','{1}','',1,1,1));a.hand=[l];W(g,a,1,'Plains');
  await g.cast(a,l,'hand');await flush(g);ok('Teshar: legendary spell -> return',a.battlefield.some(x=>x.card===c2));});

// ---- Benevolent Hydra
await T('Benevolent Hydra another creature +1',async()=>{const g=fresh();const [a]=g.players;const h=put(g,a,C('Benevolent Hydra'));h.counters=2;const x=put(g,a,bear());
  await R(g,a,[{op:'counters',n:1,to:'target creature'}],{name:'Src'},{target:x});ok('Hydra: another creature gets 1+1',x.counters===2,`${x.counters}`);
  await R(g,a,[{op:'counters',n:1,to:'this card'}],h.card,{perm:h});ok('Hydra: itself gets no bonus',h.counters===3,`${h.counters}`);});
// ENGINE BUG
await T('Benevolent Hydra creature putting counters on itself still gets +1',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Benevolent Hydra'));const x=put(g,a,bear());
  await R(g,a,[{op:'counters',n:1,to:'this card'}],x.card,{perm:x});ok('Hydra: bear puts a counter on itself -> 2 (bear is another creature)',x.counters===2,`${x.counters}`);});
await T('Benevolent Hydra opponent creature no bonus',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Benevolent Hydra'));const v=opp(g,b,bear());
  await R(g,b,[{op:'counters',n:1,to:'this card'}],v.card,{perm:v});ok('Hydra: opponent creature gets just 1',v.counters===1,`${v.counters}`);});

// ---- Here Comes a New Hero!
// ENGINE BUG
await T('Here Comes a New Hero! X=2',async()=>{const g=fresh();const [a,b]=g.players;const c=C('Here Comes a New Hero!');const big=opp(g,b,cre('Huge',6,6,4));const sm=put(g,a,cre('Smallish',2,2,2));const h0=a.hand.length;
  await R(g,a,c.spellOps,c,{x:2});
  const toks=[...a.battlefield,...b.battlefield].filter(x=>x.card.token);
  ok('New Hero: a player drew 2',a.hand.length===h0+2||g.players.some((q,i)=>i>0&&q.hand.length===2),`${a.hand.length-h0}`);
  ok('New Hero: no token copy of MV4 creature when X=2',!toks.some(x=>x.card.name==='Huge'),toks.map(x=>x.card.name).join());
  ok('New Hero: token copy of the MV<=2 creature',toks.some(x=>x.card.name==='Smallish'),toks.map(x=>x.card.name).join());});
await T('Here Comes a New Hero! X=4 allows MV4',async()=>{const g=fresh();const [a,b]=g.players;const c=C('Here Comes a New Hero!');opp(g,b,cre('Huge',6,6,4));
  await R(g,a,c.spellOps,c,{x:4});ok('New Hero: X=4 copies MV4 creature',a.battlefield.some(x=>x.card.token&&x.card.name==='Huge'));});

// ---- Primordial Hydra
await T('Primordial Hydra trample at 10 counters',async()=>{const g=fresh();const [a]=g.players;const h=put(g,a,C('Primordial Hydra'));h.counters=9;ok('Primordial: 9 counters no trample',!kwOf(g,a,h).includes('trample'));h.counters=10;ok('Primordial: 10 counters trample',kwOf(g,a,h).includes('trample'));});

// ---- Yavimaya Bloomsage
await T('Yavimaya Bloomsage prepared only at power 7',async()=>{const g=fresh();const [a]=g.players;const ys=put(g,a,C('Yavimaya Bloomsage'));const x=put(g,a,cre('Mid',5,5,5));
  await g.fireTriggers(a,'end');await flush(g);ok('Bloomsage: counter put',x.counters===1||ys.counters===1);ok('Bloomsage: power 6 -> not prepared',!ys.prepared);
  await g.fireTriggers(a,'end');await flush(g);ok('Bloomsage: power 7 -> prepared',!!ys.prepared,`${g.powerOf(a,x)}`);});

// ---- Magnus the Red
await T('Magnus the Red reduction per creature token',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Magnus the Red'));const s=tagCard(mk('Big Sorc','Sorcery','{4}{U}','Draw two cards.',5));const base=g.costOf(a,s,'hand').total;
  await R(g,a,[{op:'tokens',n:2,pt:[1,1],kw:[],types:'Spawn'}],{name:'X'});await R(g,a,[{op:'artifactTokens',n:1,kind:'treasure'}],{name:'X'});
  ok('Magnus: 2 creature tokens -> sorcery 2 less (treasure ignored)',g.costOf(a,s,'hand').total===base-2,`${base}->${g.costOf(a,s,'hand').total}`);
  const cc=cre('Crea',3,3,5);ok('Magnus: creature spell not reduced',g.costOf(a,cc,'hand').total===5,`${g.costOf(a,cc,'hand').total}`);
  const i=tagCard(mk('Big Inst','Instant','{3}{U}','Draw two cards.',4));ok('Magnus: instant reduced',g.costOf(a,i,'hand').total===2);});

// ---- Rionya
await T('Rionya X = 1 + inst/sorc cast this turn',async()=>{const g=fresh();const [a]=g.players;bBlock(g);put(g,a,C('Rionya, Fire Dancer'));const x=put(g,a,cre('Target Ogre',3,3,3));
  await g.fireTriggers(a,'combatStart');await flush(g);ok('Rionya: 0 spells -> 1 copy',a.battlefield.filter(b=>b.card.token&&b.card.name==='Target Ogre').length===1);
  const s1=sorc('S1'),s2=inst('I2');a.hand=[s1,s2];W(g,a,2,'Mountain');await g.cast(a,s1,'hand');await g.cast(a,s2,'hand');await flush(g);
  const n0=a.battlefield.filter(b=>b.card.token&&b.card.name==='Target Ogre').length;await g.fireTriggers(a,'combatStart');await flush(g);
  const nn=a.battlefield.filter(b=>b.card.token&&b.card.name==='Target Ogre');ok('Rionya: 2 spells -> 3 more copies',nn.length-n0===3,`${nn.length-n0}`);ok('Rionya: copies have haste',nn.every(b=>!b.summoning||kwOf(g,a,b).includes('haste')));});
await T('Rionya alone makes no copies',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Rionya, Fire Dancer'));await g.fireTriggers(a,'combatStart');await flush(g);ok('Rionya: no other creature -> no token',!a.battlefield.some(b=>b.card.token));});
await T('Rionya copies exiled at end step',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Rionya, Fire Dancer'));put(g,a,cre('Target Ogre',3,3,3));await g.fireTriggers(a,'combatStart');await flush(g);
  await g.fireTriggers(a,'end');await flush(g);await g.cleanup(a);ok('Rionya: tokens gone after end step',!a.battlefield.some(b=>b.card.token));});

// ---- Dina
// ENGINE BUG
await T('Dina draw once per turn on creature sacrifice',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Dina, Essence Brewer'));const x=put(g,a,bear()),y=put(g,a,bear());const r=put(g,a,art('Rock'));const h0=a.hand.length;
  await g.sacrifice(a,r);await flush(g);ok('Dina: artifact sacrificed -> no draw',a.hand.length===h0);
  await g.sacrifice(a,x);await flush(g);ok('Dina: creature sacrificed -> draw',a.hand.length===h0+1);
  await g.sacrifice(a,y);await flush(g);ok('Dina: second sacrifice same turn -> no draw (once each turn)',a.hand.length===h0+1,`${a.hand.length-h0}`);});
// ENGINE BUG
await T('Dina ability X = sacrificed power',async()=>{const g=fresh();const [a]=g.players;const d=put(g,a,C('Dina, Essence Brewer'));const big=put(g,a,cre('Big',4,4,4));W(g,a,2,'Swamp');const l0=a.life;
  const o=abO(g,a,d.card,x=>!x.ab.loyalty);ok('Dina ability option',!!o);if(!o)return;await g.activate(a,o);await flush(g);
  ok('Dina: sacrificed the 4-power creature',!a.battlefield.includes(big));
  ok('Dina: gain X=4 life',a.life-l0===4,`${a.life-l0}`);ok('Dina: X=4 counters on target',(d.counters||0)===4,`${d.counters}`);});

// ---- Feral Appetite
// ENGINE BUG
await T('Feral Appetite exile creature card -> pest',async()=>{const g=fresh();const [a,b]=g.players;const f=put(g,a,C('Feral Appetite'));const dc=cre('Dead Guy',2,2,2);b.graveyard=[dc];W(g,a,2,'Forest');const l0=a.life;
  const o=abOI(g,a,f.card);ok('Feral Appetite option',!!o);if(!o)return;await g.activate(a,o);await flush(g);
  ok('Feral Appetite: creature card exiled',b.exile.includes(dc)&&!b.graveyard.includes(dc));ok('Feral Appetite: pest created',bfN(a,'Pest')===1);ok('Feral Appetite: no life gained on activation',a.life===l0,`${a.life-l0}`);});
// ENGINE BUG
await T('Feral Appetite exile noncreature -> no pest',async()=>{const g=fresh();const [a,b]=g.players;const f=put(g,a,C('Feral Appetite'));const s=sorc('Old Sorc');b.graveyard=[s];a.graveyard=[];W(g,a,2,'Forest');
  const o=abOI(g,a,f.card);if(!o){ok('Feral Appetite option (noncreature)',false);return;}await g.activate(a,o);await flush(g);
  ok('Feral Appetite: noncreature card exiled',b.exile.includes(s));ok('Feral Appetite: no pest for noncreature',bfN(a,'Pest')===0);});

// ---- Rise of the Witch-king
// ENGINE BUG
await T('Rise of the Witch-king return when sacrificed',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());opp(g,b,bear());const r=art('Relic',3);a.graveyard=[r];const c=C('Rise of the Witch-king');
  await R(g,a,c.spellOps,c,{});ok('Witch-king: you sacrificed',!a.battlefield.includes(x));ok('Witch-king: opponent sacrificed',!b.battlefield.some(v=>v.card.name==='Bear'));
  ok('Witch-king: another permanent card returned',a.battlefield.some(v=>v.card===r));ok('Witch-king: sacrificed creature not returned',!a.battlefield.some(v=>v.card===x.card));});
await T('Rise of the Witch-king no sacrifice -> no return',async()=>{const g=fresh();const [a,b]=g.players;opp(g,b,bear());const r=art('Relic',3);a.graveyard=[r];const c=C('Rise of the Witch-king');
  await R(g,a,c.spellOps,c,{});ok('Witch-king: no creature to sacrifice -> no return',a.graveyard.includes(r)&&!a.battlefield.some(v=>v.card===r));});

// ---- Bane of Progress
// ENGINE BUG
await T('Bane of Progress counters per destroyed',async()=>{const g=fresh();const [a,b]=g.players;opp(g,b,art('A1'));opp(g,b,art('A2'));opp(g,b,ench('E1'));const ia=opp(g,b,tagCard(mk('Indy','Artifact','{2}','Indestructible',2)));const x=put(g,a,bear());const c=C('Bane of Progress');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});
  ok('Bane: artifacts and enchantments destroyed',!b.battlefield.some(v=>['A1','A2','E1'].includes(v.card.name)),b.battlefield.map(v=>v.card.name).join());
  ok('Bane: 3 counters (indestructible not counted)',pm.counters===3,`${pm.counters}`);ok('Bane: creatures untouched',a.battlefield.includes(x));});
// ENGINE BUG
await T('Bane of Progress nothing destroyed -> 0 counters',async()=>{const g=fresh();const [a]=g.players;const c=C('Bane of Progress');const pm=put(g,a,c);await R(g,a,c.etbOps,c,{perm:pm});ok('Bane: 0 counters when nothing destroyed',!pm.counters,`${pm.counters}`);});

// ---- Nylea
await T('Nylea devotion',async()=>{const g=fresh();const [a]=g.players;const n=put(g,a,C('Nylea, Keen-Eyed'));g.refreshStatics();ok('Nylea: devotion 1 -> not a creature',!n.card.isCreature);
  put(g,a,tagCard(mk('GG','Creature — Elf','{G}{G}','',2,1,1)));put(g,a,tagCard(mk('GG2','Creature — Elf','{G}{G}','',2,1,1)));g.refreshStatics();ok('Nylea: devotion 5 -> creature',n.card.isCreature);});
await T('Nylea ability creature to hand',async()=>{const g=fresh();const [a]=g.players;const n=put(g,a,C('Nylea, Keen-Eyed'));W(g,a,3,'Forest');const c=cre('TopCre',2,2,2);a.library.push(c);
  const o=abOI(g,a,n.card);ok('Nylea option',!!o);if(!o)return;await g.activate(a,o);await flush(g);ok('Nylea: creature card to hand',a.hand.includes(c));});
await T('Nylea ability noncreature not to hand',async()=>{const g=fresh();const [a]=g.players;const n=put(g,a,C('Nylea, Keen-Eyed'));W(g,a,3,'Forest');const c=sorc('TopSorc');a.library.push(c);
  const o=abOI(g,a,n.card);if(!o){ok('Nylea option',false);return;}await g.activate(a,o);await flush(g);ok('Nylea: noncreature not to hand (gy or top)',!a.hand.includes(c)&&(a.graveyard.includes(c)||a.library[a.library.length-1]===c));});

// ---- Wood Elves
await T('Wood Elves fetches a Forest untapped',async()=>{const g=fresh();const [a]=g.players;a.library=[L('Mountain'),L('Forest'),L('Mountain'),cre('X',1,1,1)];const c=C('Wood Elves');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});const f=a.battlefield.filter(b=>b.card.name==='Forest');ok('Wood Elves: Forest onto battlefield untapped',f.length===1&&!f[0].tapped);ok('Wood Elves: no Mountain',!a.battlefield.some(b=>b.card.name==='Mountain'));});
await T('Wood Elves nonbasic Forest card',async()=>{const g=fresh();const [a]=g.players;const dual=tagCard(mk('Breeding Pool','Land — Forest Island','','({T}: Add {G} or {U}.)',0));a.library=[L('Mountain'),dual];const c=C('Wood Elves');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});ok('Wood Elves: Forest-typed nonbasic fetched',a.battlefield.some(b=>b.card===dual));});
await T('Wood Elves no Forest',async()=>{const g=fresh();const [a]=g.players;a.library=[L('Mountain'),L('Island')];const c=C('Wood Elves');const pm=put(g,a,c);const n0=a.battlefield.length;
  await R(g,a,c.etbOps,c,{perm:pm});ok('Wood Elves: no Forest -> nothing enters',a.battlefield.length===n0);});

// ---- Green Sun's Zenith
// ENGINE BUG
await T("Green Sun's Zenith X=2",async()=>{const g=fresh();const [a]=g.players;bBlock(g);const z=C("Green Sun's Zenith");a.hand=[z];W(g,a,3,'Forest');a.ai.chooseX=()=>2;
  const g2=tagCard(mk('Green Two','Creature — Elf','{1}{G}','',2,2,2)),g3=tagCard(mk('Green Three','Creature — Elf','{2}{G}','',3,3,3)),r1=tagCard(mk('Red One','Creature — Goblin','{R}','',1,1,1));a.library=[g2,g3,r1];
  await g.cast(a,z,'hand');await flush(g);
  ok("GSZ: green MV<=2 creature onto battlefield",a.battlefield.some(b=>b.card===g2),a.battlefield.map(b=>b.card.name).join());ok("GSZ: not the MV3 one",!a.battlefield.some(b=>b.card===g3));ok("GSZ: not nongreen",!a.battlefield.some(b=>b.card===r1));
  ok("GSZ: shuffled into library, not graveyard",a.library.includes(z)&&!a.graveyard.includes(z));});
// ENGINE BUG
await T("Green Sun's Zenith X=1 nongreen only",async()=>{const g=fresh();const [a]=g.players;bBlock(g);const z=C("Green Sun's Zenith");a.hand=[z];W(g,a,2,'Forest');a.ai.chooseX=()=>1;
  const r1=tagCard(mk('Red One','Creature — Goblin','{R}','',1,1,1)),g3=tagCard(mk('Green Three','Creature — Elf','{2}{G}','',3,3,3));a.library=[r1,g3];
  await g.cast(a,z,'hand');await flush(g);ok("GSZ: no legal card -> nothing",!a.battlefield.some(b=>b.card===r1||b.card===g3));});

// ---- Combat Research
await T('Combat Research legendary bonus',async()=>{const g=fresh();const [a]=g.players;const cr=put(g,a,C('Combat Research'));const lg=put(g,a,tagCard(mk('Lord','Legendary Creature — Human','{2}','',2,2,2)));cr.attachedTo=lg.id;g.refreshStatics();
  ok('Combat Research: legendary +1/+1',g.powerOf(a,lg)===3&&g.toughOf(a,lg)===3,`${g.powerOf(a,lg)}`);ok('Combat Research: legendary ward 1',g.wardOf(lg)>=1,`${g.wardOf(lg)}`);
  const nl=put(g,a,bear());cr.attachedTo=nl.id;g.refreshStatics();ok('Combat Research: nonlegendary no bonus',g.powerOf(a,nl)===2&&g.powerOf(a,lg)===2,`${g.powerOf(a,nl)} ${g.powerOf(a,lg)}`);ok('Combat Research: nonlegendary no ward',!g.wardOf(nl),`${g.wardOf(nl)}`);});

// ---- Slip Through Space
await T('Slip Through Space',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,cre('Big',4,4,4));const y=put(g,a,bear());const v=opp(g,b,cre('Wall',0,8,3));const c=C('Slip Through Space');
  await R(g,a,c.spellOps,c,{});ok('Slip: target cannot be blocked',!g.canBlock(v,x));ok('Slip: other creature still blockable',g.canBlock(v,y));g.turn++;ok('Slip: only this turn',g.canBlock(v,x));});

// ---- West Coast Expansion
// ENGINE BUG
await T('West Coast Expansion X=5 free Hero',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const w=C('West Coast Expansion');const h=tagCard(mk('Big Hero','Creature — Human Hero','{6}','',6,6,6));a.hand=[w,h];W(g,a,7,'Island');a.ai.chooseX=()=>5;
  await g.cast(a,w,'hand');await flush(g);ok('WCE: drew 5',a.hand.filter(c=>c!==h).length===5||a.battlefield.some(b=>b.card===h)&&a.hand.length===5,`${a.hand.length}`);ok('WCE: X=5 -> Hero cast free',a.battlefield.some(b=>b.card===h));});
// ENGINE BUG
await T('West Coast Expansion X=4 no free Hero',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const w=C('West Coast Expansion');const h=tagCard(mk('Big Hero','Creature — Human Hero','{6}','',6,6,6));a.hand=[w,h];W(g,a,6,'Island');a.ai.chooseX=()=>4;
  await g.cast(a,w,'hand');await flush(g);ok('WCE: X=4 drew 4',a.hand.length===5,`${a.hand.length}`);ok('WCE: X=4 -> Hero not cast',a.hand.includes(h));});

// ---- Flamebraider
// ENGINE BUG
await T('Flamebraider mana restriction',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Flamebraider'));const nb=cre('Nonelem',2,2,2,'Creature — Bear','{1}{G}');const el=cre('Elem',2,2,2,'Creature — Elemental','{1}{G}');a.hand=[nb,el];
  ok('Flamebraider: can pay for an Elemental spell',!!g.castMode(a,el,'hand'));ok('Flamebraider: cannot pay for a non-Elemental spell',!g.castMode(a,nb,'hand'));});

// ---- Risen Reef
await T('Risen Reef triggers',async()=>{const g=fresh();const [a,b]=g.players;const rr=C('Risen Reef');const l1=L('Island');a.library.push(L('Forest'),l1);const pm=await g.enterPerm(a,rr);await g.creatureEntered(a,pm);await flush(g);
  ok('Risen Reef: itself entering -> land onto battlefield tapped',a.battlefield.some(b=>b.card===l1&&b.tapped));
  const top=cre('NonLand',1,1,1);a.library.push(top);const el=await g.enterPerm(a,cre('Elemy',1,1,1,'Creature — Elemental'));await g.creatureEntered(a,el);await flush(g);ok('Risen Reef: another Elemental -> nonland top card to hand',a.hand.includes(top));
  const t2=cre('NL2',1,1,1);a.library.push(t2);const nb=await g.enterPerm(a,bear());await g.creatureEntered(a,nb);await flush(g);ok('Risen Reef: non-Elemental -> no trigger',a.library.includes(t2)&&!a.hand.includes(t2));
  const oe=await g.enterPerm(b,cre('OppElem',1,1,1,'Creature — Elemental'));await g.creatureEntered(b,oe);await flush(g);ok("Risen Reef: opponent's Elemental -> no trigger",a.library.includes(t2));});

// ---- Yarok
await T('Yarok doubles ETB triggers of your permanents only',async()=>{const g=fresh();const [a,b]=g.players;bBlock(g);put(g,a,C('Yarok, the Desecrated'));const d=tagCard(mk('Seer','Creature — Human','{1}','When this creature enters, draw a card.',1,1,1));a.hand=[d];W(g,a,1,'Island');
  await g.cast(a,d,'hand');await flush(g);ok('Yarok: own ETB draw twice',a.hand.length===2,`${a.hand.length}`);
  g.active=1;const d2=tagCard(mk('Seer','Creature — Human','{1}','When this creature enters, draw a card.',1,1,1));b.hand=[d2];W(g,b,1,'Island');await g.cast(b,d2,'hand');await flush(g);ok("Yarok: opponent's ETB not doubled",b.hand.length===1,`${b.hand.length}`);});
await T('Yarok does not double non-ETB triggers',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Yarok, the Desecrated'));put(g,a,tagCard(mk('Upk','Enchantment','{1}','At the beginning of your upkeep, draw a card.',1)));const h0=a.hand.length;await g.fireTriggers(a,'upkeep');await flush(g);ok('Yarok: upkeep trigger once',a.hand.length===h0+1,`${a.hand.length-h0}`);});

// ---- Faramir
// ENGINE BUG
await T('Faramir end step tokens only as monarch',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Faramir, Steward of Gondor'));g.monarch=b;
  await g.fireTriggers(a,'end');await flush(g);ok('Faramir: not monarch -> no tokens',bfN(a,'Human Soldier')===0,`${bfN(a,'Human Soldier')}`);
  g.monarch=a;await g.fireTriggers(a,'end');await flush(g);ok('Faramir: monarch -> two tokens',bfN(a,'Human Soldier')===2,`${bfN(a,'Human Soldier')}`);});

// ---- Warleader's Call
await T("Warleader's Call",async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,C("Warleader's Call"));const lb=b.life,lc=c.life;
  const x=await g.enterPerm(a,bear());await g.creatureEntered(a,x);await flush(g);ok("Warleader's Call: your creature -> 1 to each opp",lb-b.life===1&&lc-c.life===1,`${lb-b.life} ${lc-c.life}`);
  const v=await g.enterPerm(b,bear());await g.creatureEntered(b,v);await flush(g);ok("Warleader's Call: opponent creature -> no damage",lb-b.life===1&&lc-c.life===1);
  const r=await g.enterPerm(a,art('Rock'));await g.permEntered(a,r);await flush(g);ok("Warleader's Call: noncreature -> no damage",lb-b.life===1);});

// ---- Purphoros
await T('Purphoros devotion + another',async()=>{const g=fresh();const [a,b]=g.players;const pc=C('Purphoros, God of the Forge');const pu=await g.enterPerm(a,pc);await g.creatureEntered(a,pu);await flush(g);const lb=b.life;
  g.refreshStatics();ok('Purphoros: devotion 1 -> not a creature',!pu.card.isCreature);
  const x=await g.enterPerm(a,bear());await g.creatureEntered(a,x);await flush(g);ok('Purphoros: another creature -> 2 to each opp',lb-b.life===2,`${lb-b.life}`);
  const v=await g.enterPerm(b,bear());await g.creatureEntered(b,v);await flush(g);ok('Purphoros: opponent creature -> nothing',lb-b.life===2);
  put(g,a,tagCard(mk('RR','Creature — Goblin','{R}{R}','',2,1,1)));put(g,a,tagCard(mk('RR2','Creature — Goblin','{R}{R}','',2,1,1)));g.refreshStatics();ok('Purphoros: devotion 5 -> creature',pu.card.isCreature);});
await T('Purphoros itself entering no damage',async()=>{const g=fresh();const [a,b]=g.players;const lb=b.life;const pc=C('Purphoros, God of the Forge');put(g,a,tagCard(mk('RRRR','Creature — Goblin','{R}{R}{R}{R}','',4,1,1)));const pu=await g.enterPerm(a,pc);g.refreshStatics();await g.creatureEntered(a,pu);await flush(g);ok('Purphoros: own entry (as creature) does not trigger',b.life===lb,`${lb-b.life}`);});

// ---- Anim Pakal
await T('Anim Pakal non-Gnome attack',async()=>{const g=fresh();const [a,b]=g.players;const ap=put(g,a,C('Anim Pakal, Thousandth Moon'));const x=put(g,a,bear());const atk=[{attacker:x,defender:b}];await g.attackTriggers(a,atk);
  ok('Anim Pakal: +1 counter',ap.counters===1);const gn=a.battlefield.filter(v=>v.card.name==='Gnome');ok('Anim Pakal: 1 Gnome tapped & attacking',gn.length===1&&gn[0].tapped&&atk.some(q=>q.attacker===gn[0]));});
await T('Anim Pakal only Gnomes attack',async()=>{const g=fresh();const [a,b]=g.players;const ap=put(g,a,C('Anim Pakal, Thousandth Moon'));const gn=put(g,a,tagCard(mk('Gnomey','Artifact Creature — Gnome','{1}','',1,1,1)));await g.attackTriggers(a,[{attacker:gn,defender:b}]);ok('Anim Pakal: Gnome-only attack -> nothing',!ap.counters&&bfN(a,'Gnome')===0);});

// ---- Luxury Suite
await T('Luxury Suite 2+ opponents untapped',async()=>{const g=fresh(3);const [a]=g.players;const c=C('Luxury Suite');a.hand=[c];await g.playLand(a,c);const pm=a.battlefield.find(b=>b.card===c);ok('Luxury Suite: two opponents -> untapped',pm&&!pm.tapped);});
await T('Luxury Suite 1 opponent tapped',async()=>{const g=fresh(2);const [a]=g.players;const c=C('Luxury Suite');a.hand=[c];await g.playLand(a,c);const pm=a.battlefield.find(b=>b.card===c);ok('Luxury Suite: one opponent -> tapped',pm&&pm.tapped);});
await T('Luxury Suite counts living opponents',async()=>{const g=fresh(3);const [a,b]=g.players;b.dead=true;const c=C('Luxury Suite');a.hand=[c];await g.playLand(a,c);const pm=a.battlefield.find(b=>b.card===c);ok('Luxury Suite: one living opponent -> tapped',pm&&pm.tapped);});

// ---- Dragonhawk
// ENGINE BUG
await T('Dragonhawk exile X = power>=4 creatures, no immediate damage',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,cre('Four',4,4,4));put(g,a,bear());const c=C("Dragonhawk, Fate's Tempest");const pm=put(g,a,c);const lb=b.life;const e0=a.exile.length;
  await R(g,a,c.etbOps||[],c,{perm:pm});ok('Dragonhawk: ETB exiles X=2 cards',a.exile.length-e0===2,`${a.exile.length-e0}`);ok('Dragonhawk: no damage on ETB',b.life===lb,`${lb-b.life}`);});

// ---- Bloodline Keeper
// ENGINE BUG
await T('Bloodline Keeper transform needs 5 vampires',async()=>{const g=fresh();const [a]=g.players;const k=put(g,a,C('Bloodline Keeper'));W(g,a,2,'Swamp');for(let i=0;i<3;i++)put(g,a,tagCard(mk('Vampire','Creature — Vampire','','',0,2,2)));
  const tr=()=>g.abilityOptions(a,{}).find(x=>x.card===k.card&&x.ab.ops.some(o=>o.op==='transform'));ok('Bloodline Keeper: 4 vampires -> no transform option',!tr());
  put(g,a,tagCard(mk('Vampire','Creature — Vampire','','',0,2,2)));ok('Bloodline Keeper: 5 vampires -> transform option',!!tr());});

// ---- Twilight Prophet
await T('Twilight Prophet needs blessing',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Twilight Prophet'));const top=cre('Three',3,3,3);a.library.push(top);const lb=b.life,la=a.life;
  await g.fireTriggers(a,'upkeep');await flush(g);ok('Twilight Prophet: no blessing -> nothing',a.library.includes(top)&&b.life===lb);
  a.blessing=true;await g.fireTriggers(a,'upkeep');await flush(g);ok('Twilight Prophet: blessing -> card to hand',a.hand.includes(top));ok('Twilight Prophet: each opp loses 3, you gain 3',lb-b.life===3&&a.life-la===3,`${lb-b.life} ${a.life-la}`);});
await T('Twilight Prophet ascend gives blessing',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Twilight Prophet'));W(g,a,8);g.refreshStatics();ok('Ascend: 9 permanents -> no blessing',!a.blessing);W(g,a,1);g.refreshStatics();ok('Ascend: 10 permanents -> blessing',!!a.blessing);});

// ---- Expel the Interlopers
await T('Expel the Interlopers destroys an upward-closed power set',async()=>{const g=fresh();const [a,b]=g.players;bBlock(g);const ps=[0,1,3,5,7];const ms=ps.map(p=>opp(g,b,cre('P'+p,p,9,3)));const c=C('Expel the Interlopers');a.hand=[c];W(g,a,5,'Plains');
  await g.cast(a,c,'hand');await flush(g);const dead=ms.map(x=>!b.battlefield.includes(x));const firstDead=dead.indexOf(true);
  ok('Expel: destroyed set is {power >= N} for some N',firstDead<0||dead.slice(firstDead).every(Boolean),JSON.stringify(dead));});

// ---- Sidar Kondo
await T('Sidar Kondo blocking restriction',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Sidar Kondo of Jamuraa'));const sm=put(g,a,bear()),bg=put(g,a,cre('Big',3,3,3));const v=opp(g,b,bear());const fl=opp(g,b,tagCard(mk('Bird','Creature — Bird','{1}','Flying',1,1,1)));const rc=opp(g,b,tagCard(mk('Spider','Creature — Spider','{1}','Reach',1,1,1)));
  ok('Kondo: ground creature cannot block power 2',!g.canBlock(v,sm));ok('Kondo: flyer can block power 2',g.canBlock(fl,sm));ok('Kondo: reach can block power 2',g.canBlock(rc,sm));ok('Kondo: ground can block power 3',g.canBlock(v,bg));
  const ob=opp(g,b,bear());const mine=put(g,a,bear());ok("Kondo: your own creatures may block opponents' power-2 creatures",g.canBlock(mine,ob));});

// ---- Bruenor
await T('Bruenor +2/+0 per Equipment',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Bruenor Battlehammer'));const x=put(g,a,bear());const e1=put(g,a,tagCard(mk('Stick','Artifact — Equipment','{1}','Equipped creature gets +1/+0.\nEquip {2}',1)));const e2=put(g,a,tagCard(mk('Stick2','Artifact — Equipment','{1}','Equipped creature gets +1/+0.\nEquip {2}',1)));const y=put(g,a,bear());
  e1.attachedTo=x.id;g.refreshStatics();ok('Bruenor: 1 equipment (+1/+0) -> 5/2',g.powerOf(a,x)===5&&g.toughOf(a,x)===2,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);e2.attachedTo=x.id;g.refreshStatics();ok('Bruenor: 2 equipment -> 8/2',g.powerOf(a,x)===8,`${g.powerOf(a,x)}`);ok('Bruenor: unequipped no bonus',g.powerOf(a,y)===2);});
// ENGINE BUG (Equipment without a parsed static bonus is not counted)
await T('Bruenor counts an Equipment with no static bonus',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Bruenor Battlehammer'));const x=put(g,a,bear());const e=put(g,a,tagCard(mk('Bare Rod','Artifact — Equipment','{1}','Equip {2}',1)));e.attachedTo=x.id;g.refreshStatics();ok('Bruenor: bare Equipment attached -> +2/+0',g.powerOf(a,x)===4,`${g.powerOf(a,x)}`);});
await T('Bruenor first equip each turn free',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Bruenor Battlehammer'));const x=put(g,a,bear());const e1=put(g,a,tagCard(mk('Stick','Artifact — Equipment','{1}','Equip {2}',1)));const e2=put(g,a,tagCard(mk('Stick2','Artifact — Equipment','{1}','Equip {2}',1)));
  const o1=g.abilityOptions(a,{}).find(o=>o.card===e1.card&&o.ab.label==='equip');ok('Bruenor: equip option with no mana',!!o1);if(!o1)return;ok('Bruenor: first equip costs 0',g.abilityCost(a,e1.card,o1.ab,e1).total===0);await g.activate(a,o1);
  const ab2=e2.card.abilities.find(x=>x.label==='equip');ok('Bruenor: second equip costs full',g.abilityCost(a,e2.card,ab2,e2).total===2,`${g.abilityCost(a,e2.card,ab2,e2).total}`);g.turn++;ok('Bruenor: next turn free again',g.abilityCost(a,e2.card,ab2,e2).total===0);});

// ---- Inventory Management
await T('Inventory Management attaches your Equipment to your creature',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());const e1=put(g,a,tagCard(mk('Stick','Artifact — Equipment','{1}','Equipped creature gets +1/+1.\nEquip {2}',1)));const oe=opp(g,b,tagCard(mk('OppStick','Artifact — Equipment','{1}','Equipped creature gets +1/+1.\nEquip {2}',1)));const v=opp(g,b,bear());const c=C('Inventory Management');
  await R(g,a,c.spellOps,c,{});ok('Inventory Management: your equipment attached to your creature',e1.attachedTo===x.id);ok("Inventory Management: opponent's equipment untouched",oe.attachedTo==null||oe.attachedTo===v.id);});

// ---- Wrecking Ball Arm
await T('Wrecking Ball Arm',async()=>{const g=fresh();const [a,b]=g.players;const w=put(g,a,C('Wrecking Ball Arm'));const x=put(g,a,bear());w.attachedTo=x.id;g.refreshStatics();const v=opp(g,b,bear());const v3=opp(g,b,cre('Three',3,3,3));
  ok('Wrecking Ball Arm: base 7/7',g.powerOf(a,x)===7&&g.toughOf(a,x)===7,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);ok('Wrecking Ball Arm: power-2 cannot block',!g.canBlock(v,x));ok('Wrecking Ball Arm: power-3 can block',g.canBlock(v3,x));
  const y=put(g,a,bear());ok('Wrecking Ball Arm: unequipped creature blockable by power 2',g.canBlock(v,y));});

// ---- Dragon Tempest
await T('Dragon Tempest dragon enters X = dragons',async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,C('Dragon Tempest'));put(g,a,tagCard(mk('Old Dragon','Creature — Dragon','{4}','Flying',4,4,4)));const tot=()=>b.life+c.life;const t0=tot();
  const d=await g.enterPerm(a,tagCard(mk('New Dragon','Creature — Dragon','{4}','Flying',4,4,4)));await g.creatureEntered(a,d);await flush(g);ok('Dragon Tempest: 2 damage (2 dragons)',t0-tot()===2,`${t0-tot()}`);
  const t1=tot();const nb=await g.enterPerm(a,bear());await g.creatureEntered(a,nb);await flush(g);ok('Dragon Tempest: non-dragon -> no damage',tot()===t1);
  const t2=tot()+a.life;const od=await g.enterPerm(b,tagCard(mk('Opp Dragon','Creature — Dragon','{4}','',4,4,4)));await g.creatureEntered(b,od);await flush(g);ok("Dragon Tempest: opponent's dragon -> no damage",tot()+a.life===t2);});

// ---- Terra
// ENGINE BUG
await T('Terra ETB mill 5, enchantment to hand',async()=>{const g=fresh();const [a]=g.players;const en=ench('Milled Ench',2);a.library.push(en,L('Forest'),cre('X',1,1,1),L('Forest'),sorc('Y'));const c=C('Terra, Magical Adept');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});ok('Terra: milled enchantment put into hand',a.hand.includes(en));ok('Terra: 4 other cards milled',a.graveyard.length===4,`${a.graveyard.length}`);});
await T('Terra Trance sorcery speed',async()=>{const g=fresh();const [a]=g.players;const t=put(g,a,C('Terra, Magical Adept'));W(g,a,5,'Forest');W(g,a,1,'Mountain');
  ok('Terra: trance available at sorcery speed',!!g.abilityOptions(a,{}).find(o=>o.card===t.card&&o.ab.label==='transform'));ok('Terra: trance not at instant speed',!g.abilityOptions(a,{instant:true}).find(o=>o.card===t.card&&o.ab.label==='transform'));});

// ---- Sterling Grove
// ENGINE BUG
await T('Sterling Grove tutor ability',async()=>{const g=fresh();const [a]=g.players;const sg=put(g,a,C('Sterling Grove'));W(g,a,1,'Forest');const en=ench('Wanted Ench',3);a.library.unshift(en);a.library.unshift(cre('Nope',5,5,5));
  const o=g.abilityOptions(a,{instant:true}).find(o=>o.card===sg.card);ok('Sterling Grove: sac ability exists',!!o);if(!o)return;await g.activate(a,o);await flush(g);ok('Sterling Grove: enchantment on top',a.library[a.library.length-1]===en);ok('Sterling Grove: sacrificed',!a.battlefield.includes(sg));});

// ---- Harmonized Crescendo
// ENGINE BUG
await T('Harmonized Crescendo draws per permanent of chosen type',async()=>{const g=fresh();const [a,b]=g.players;bBlock(g);for(let i=0;i<4;i++)put(g,a,elf());opp(g,b,elf());const c=C('Harmonized Crescendo');a.hand=[c];W(g,a,6,'Island');
  await g.cast(a,c,'hand',null,{instant:true});await flush(g);ok('Harmonized Crescendo: draws 4 (elves you control)',a.hand.length===4,`${a.hand.length}`);});

// ---- Tyvar
await T('Tyvar mana counters once per turn',async()=>{const g=fresh();const [a]=g.players;bBlock(g);put(g,a,C('Tyvar the Bellicose'));const ll=put(g,a,tagCard(mk('Llanowar','Creature — Elf Druid','{G}','{T}: Add {G}.',1,1,1)));
  const s1=cre('One',1,1,1,'Creature — Bear','{G}');a.hand=[s1];await g.cast(a,s1,'hand');await flush(g);ok('Tyvar: mana creature gets 1 counter',ll.counters===1,`${ll.counters}`);
  ll.tapped=false;const s2=cre('One2',1,1,1,'Creature — Bear','{G}');a.hand=[s2];await g.cast(a,s2,'hand');await flush(g);ok('Tyvar: second time same turn no counter',ll.counters===1,`${ll.counters}`);});
await T('Tyvar lands get no counters',async()=>{const g=fresh();const [a]=g.players;bBlock(g);put(g,a,C('Tyvar the Bellicose'));W(g,a,1,'Forest');const s1=cre('One',1,1,1,'Creature — Bear','{G}');a.hand=[s1];await g.cast(a,s1,'hand');await flush(g);ok('Tyvar: land mana -> no counters',a.battlefield.every(b=>!b.counters));});

// ---- Tribute Mage
await T('Tribute Mage MV 2 artifact only',async()=>{const g=fresh();const [a]=g.players;const a3=art('Three Art',3),a2=art('Two Art',2);a.library=[a3,a2,L('Forest')];const c=C('Tribute Mage');const pm=put(g,a,c);await R(g,a,c.etbOps||[],c,{perm:pm});if(!c.etbOps)await g.doTutor(a,c);
  ok('Tribute Mage: MV2 artifact fetched',a.hand.includes(a2));ok('Tribute Mage: MV3 artifact not fetched',!a.hand.includes(a3));});
// ENGINE BUG
await T('Tribute Mage no MV2 artifact',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const a3=art('Three Art',3);a.library=[a3,L('Forest')];const c=C('Tribute Mage');a.hand=[c];W(g,a,3,'Island');await g.cast(a,c,'hand');await flush(g);ok('Tribute Mage: only MV3 artifact -> nothing fetched',!a.hand.includes(a3));});
await T('Tribute Mage cast fetches MV2',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const a3=art('Three Art',3),a2=art('Two Art',2);a.library=[a2,a3];const c=C('Tribute Mage');a.hand=[c];W(g,a,3,'Island');await g.cast(a,c,'hand');await flush(g);ok('Tribute Mage (cast): MV2 artifact to hand',a.hand.includes(a2)&&!a.hand.includes(a3),a.hand.map(x=>x.name).join());});

// ---- Bumi
// ENGINE BUG
await T('Bumi combat damage untaps lands + extra combat',async()=>{const g=fresh();const [a,b]=g.players;const bu=put(g,a,C('Bumi, Unleashed'));W(g,a,3,'Forest');a.battlefield.filter(x=>x.card.isLand).forEach(x=>x.tapped=true);g._cdDefender=b;g._cdDmg=5;await g.combatDamageTriggers(a,bu);await flush(g);
  ok('Bumi: lands untapped',a.battlefield.filter(x=>x.card.isLand).every(x=>!x.tapped));ok('Bumi: extra combat',!!a.extraCombat);
  // ENGINE BUG
  ok('parse: Bumi extra combat restricted to land creatures',(C('Bumi, Unleashed').triggers[0].ops.find(o=>o.op==='extraCombat')||{}).landOnly===true);});

// ---- Sokka's Charge
// ENGINE BUG
await T("Sokka's Charge during your turn",async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C("Sokka's Charge"));const al=put(g,a,tagCard(mk('Ally Guy','Creature — Human Ally','{1}','',1,2,2)));const nb=put(g,a,bear());g.active=0;
  g.refreshStatics();const k1=kwOf(g,a,al);ok("Sokka's Charge: ally DS+lifelink (your turn)",k1.includes('double strike')&&k1.includes('lifelink'),k1.join());ok("Sokka's Charge: non-ally nothing",!kwOf(g,a,nb).includes('double strike'));
  g.active=1;g.refreshStatics();const k2=kwOf(g,a,al);ok("Sokka's Charge: not on opponent's turn",!k2.includes('double strike')&&!k2.includes('lifelink'),k2.join());});

// ---- Yue
await T('Yue free noncreature spell',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const y=put(g,a,C('Yue, the Moon Spirit'));W(g,a,5,'Island');const cr=cre('Hand Cre',5,5,5);const sp=tagCard(mk('Big Draw','Sorcery','{5}{U}','Draw two cards.',6));a.hand=[cr,sp];
  const o=abOI(g,a,y.card);ok('Yue: ability option',!!o);if(!o)return;await g.activate(a,o);await flush(g);ok('Yue: noncreature cast free',!a.hand.includes(sp)&&a.graveyard.includes(sp));ok('Yue: creature not cast',a.hand.includes(cr)&&!a.battlefield.some(b=>b.card===cr));});
await T('Yue only creature in hand',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const y=put(g,a,C('Yue, the Moon Spirit'));W(g,a,5,'Island');const cr=cre('Hand Cre',5,5,5);a.hand=[cr];
  const o=abOI(g,a,y.card);if(o){await g.activate(a,o);await flush(g);}ok('Yue: creature never cast for free',a.hand.includes(cr));});

// ---- Djeru and Hazoret
await T('Djeru and Hazoret hand-size static',async()=>{const g=fresh();const [a]=g.players;const d=put(g,a,C('Djeru and Hazoret'));a.hand=[cre('A',1,1,1)];ok('Djeru: 1 card -> vigilance & haste',kwOf(g,a,d).includes('vigilance')&&kwOf(g,a,d).includes('haste'));a.hand.push(cre('B',1,1,1));ok('Djeru: 2 cards -> neither',!kwOf(g,a,d).includes('vigilance')&&!kwOf(g,a,d).includes('haste'));});
// ENGINE BUG
await T('Djeru and Hazoret attack: legendary creature from top six',async()=>{const g=fresh();const [a,b]=g.players;bBlock(g);const d=put(g,a,C('Djeru and Hazoret'));const lg=tagCard(mk('Top Legend','Legendary Creature — Human','{4}','',4,4,4));const nl=cre('Plain Guy',5,5,5);const deep=tagCard(mk('Deep Legend','Legendary Creature — Elf','{3}','',3,3,3));
  a.library.push(deep,L('Forest'),L('Forest'),nl,L('Forest'),lg,L('Forest'),L('Forest'));
  await g.attackTriggers(a,[{attacker:d,defender:b}]);await flush(g);
  const got=a.battlefield.some(x=>x.card===lg)||a.exile.includes(lg)&&(a.exileCast||[]).some(e=>e.card===lg&&e.free);
  ok('Djeru: legendary creature in top six exiled/cast free',got);ok('Djeru: nonlegendary not taken',!a.battlefield.some(x=>x.card===nl)&&!a.exile.includes(nl));ok('Djeru: 7th+ card not taken',!a.battlefield.some(x=>x.card===deep)&&!a.exile.includes(deep));});

// ---- Ratadrabik
await T('Ratadrabik legendary dies -> nonlegendary 2/2 Zombie copy',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Ratadrabik of Urborg'));const lg=put(g,a,tagCard(mk('Hero Lord','Legendary Creature — Human Knight','{3}','Flying',4,4,4)));
  await g.destroy(a,lg);await flush(g);const t=a.battlefield.find(x=>x.card.token&&/Hero Lord/.test(x.card.name));ok('Ratadrabik: token copy created',!!t);if(!t)return;
  ok('Ratadrabik: copy is not legendary',!t.card.isLegendary);ok('Ratadrabik: copy is 2/2',g.powerOf(a,t)===2&&g.toughOf(a,t)===2,`${g.powerOf(a,t)}/${g.toughOf(a,t)}`);ok('Ratadrabik: copy is a Zombie',/Zombie/.test(t.card.type),t.card.type);});
await T('Ratadrabik negatives',async()=>{const g=fresh();const [a,b]=g.players;const r=put(g,a,C('Ratadrabik of Urborg'));const nb=put(g,a,bear());await g.destroy(a,nb);await flush(g);ok('Ratadrabik: nonlegendary dies -> no token',!a.battlefield.some(x=>x.card.token));
  const ol=opp(g,b,tagCard(mk('Opp Lord','Legendary Creature — Human','{3}','',3,3,3)));await g.destroy(b,ol);await flush(g);ok("Ratadrabik: opponent's legendary -> no token",!a.battlefield.some(x=>x.card.token)&&!b.battlefield.some(x=>x.card.token));
  await g.destroy(a,r);await flush(g);ok('Ratadrabik: itself dying -> no token (another)',!a.battlefield.some(x=>x.card.token));});

// ---- Hope of Ghirapur
// ENGINE BUG
await T('Hope of Ghirapur requires combat damage to the target',async()=>{const g=fresh();const [a,b]=g.players;const h=put(g,a,C('Hope of Ghirapur'));const nc=sorc('Opp Sorc');
  const o=abOI(g,a,h.card);if(o){await g.activate(a,o);await flush(g);}ok('Hope: no combat damage dealt -> opponent can still cast noncreature spells',g.addCostOk(b,nc));});
// ENGINE BUG
await T('Hope of Ghirapur after hitting a player',async()=>{const g=fresh();const [a,b,c]=g.players;const h=put(g,a,C('Hope of Ghirapur'));g._cdDefender=b;g._cdDmg=1;await g.combatDamageTriggers(a,h);await flush(g);b.dmgBy=b.dmgBy;
  const o=abOI(g,a,h.card);ok('Hope: sac option',!!o);if(!o)return;await g.activate(a,o);await flush(g);ok('Hope: hit player cannot cast noncreature',!g.addCostOk(b,sorc('X')));ok('Hope: hit player can cast creatures',g.addCostOk(b,bear()));
  ok('Hope: other opponent unaffected (single target)',g.addCostOk(c,sorc('X')));g.turn++;g.active=1;ok("Hope: still locked on the opponent's next turn (until your next turn)",!g.addCostOk(b,sorc('X')));});

// ---- Slither Blade / Silent Hallcreeper
await T('Slither Blade unblockable',async()=>{const g=fresh();const [a,b]=g.players;const s=put(g,a,C('Slither Blade'));const v=opp(g,b,tagCard(mk('Bird','Creature — Bird','{1}','Flying, reach',1,1,1)));const x=put(g,a,bear());ok('Slither Blade: cannot be blocked',!g.canBlock(v,s));ok('control: bear blockable',g.canBlock(v,x));});
await T('Silent Hallcreeper unblockable',async()=>{const g=fresh();const [a,b]=g.players;const s=put(g,a,C('Silent Hallcreeper'));const v=opp(g,b,cre('Wall',0,8,3));ok('Silent Hallcreeper: cannot be blocked',!g.canBlock(v,s));});

// ---- Elven Ambush
// ENGINE BUG
await T('Elven Ambush tokens per Elf you control',async()=>{const g=fresh();const [a,b]=g.players;bBlock(g);put(g,a,elf());put(g,a,elf());put(g,a,elf());put(g,a,bear());opp(g,b,elf());const c=C('Elven Ambush');a.hand=[c];W(g,a,4,'Forest');const n0=a.battlefield.filter(x=>x.card.token).length;
  await g.cast(a,c,'hand',null,{instant:true});await flush(g);const n=a.battlefield.filter(x=>x.card.token).length-n0;ok('Elven Ambush: 3 tokens (3 elves; bear and opp elf ignored)',n===3,`${n}`);});

// ---- Arena Rector
// ENGINE BUG
await T('Arena Rector dies -> exile it, planeswalker onto battlefield',async()=>{const g=fresh();const [a]=g.players;const ar=put(g,a,C('Arena Rector'));const pw=tagCard(mk('Some Walker','Legendary Planeswalker — Test','{4}','+1: You gain 1 life.',4));pw.startLoyalty=pw.startLoyalty||4;a.library.unshift(pw);
  await g.destroy(a,ar);await flush(g);ok('Arena Rector: planeswalker onto battlefield',a.battlefield.some(x=>x.card===pw));ok('Arena Rector: Rector exiled (cost of "if you do")',a.exile.includes(ar.card)&&!a.graveyard.includes(ar.card));});

// ---- Dusk Legion Duelist
await T('Dusk Legion Duelist once per turn',async()=>{const g=fresh();const [a]=g.players;const d=put(g,a,C('Dusk Legion Duelist'));const x=put(g,a,bear());const h0=a.hand.length;
  await R(g,a,[{op:'counters',n:1,to:'target creature'}],{name:'S'},{target:x});ok('Duelist: counters on another creature -> no draw',a.hand.length===h0);
  await R(g,a,[{op:'counters',n:2,to:'target creature'}],{name:'S'},{target:d});ok('Duelist: counters on it -> draw',a.hand.length===h0+1);
  await R(g,a,[{op:'counters',n:1,to:'target creature'}],{name:'S'},{target:d});ok('Duelist: second time same turn -> no draw',a.hand.length===h0+1);
  g.turn++;await R(g,a,[{op:'counters',n:1,to:'target creature'}],{name:'S'},{target:d});ok('Duelist: next turn draws again',a.hand.length===h0+2);});

// ---- Sovereign Okinec Ahau
await T('Sovereign Okinec Ahau counters = power - base power',async()=>{const g=fresh();const [a,b]=g.players;const so=put(g,a,C('Sovereign Okinec Ahau'));const x=put(g,a,bear());x.counters=2;const y=put(g,a,bear());const z=put(g,a,cre('Shrunk',3,3,3));z.counters=-1;
  await g.attackTriggers(a,[{attacker:so,defender:b}]);await flush(g);ok('Okinec: bear with 2 counters (4 vs base 2) gets 2 more',x.counters===4,`${x.counters}`);ok('Okinec: unmodified bear none',!y.counters);ok('Okinec: creature below base gets none',z.counters===-1);});

// ---- Springbloom Druid
// ENGINE BUG
await T('Springbloom Druid sacrifice a land to fetch two',async()=>{const g=fresh();const [a]=g.players;W(g,a,3,'Forest');a.library=[L('Forest'),L('Island'),L('Plains')];const c=C('Springbloom Druid');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});const nl=a.battlefield.filter(x=>x.card.isLand).length;ok('Springbloom: lands = 3 - 1 + 2 (or 3 if declined), never 5',nl===4||nl===3,`${nl}`);if(nl===4)ok('Springbloom: a land went to graveyard',a.graveyard.some(c=>c.isLand));});
// ENGINE BUG
await T('Springbloom Druid no land to sacrifice',async()=>{const g=fresh();const [a]=g.players;a.library=[L('Forest'),L('Island')];const c=C('Springbloom Druid');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});ok('Springbloom: no land -> no search',a.battlefield.filter(x=>x.card.isLand).length===0);});

// ---- Mindblade Render
await T('Mindblade Render warrior damage',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Mindblade Render'));const w=put(g,a,cre('Warrior Guy',2,2,2,'Creature — Human Warrior'));const x=put(g,a,bear());const h0=a.hand.length,l0=a.life;
  await cdx(g,a,b,x,2);ok('Mindblade: non-warrior damage -> nothing',a.hand.length===h0&&a.life===l0);await cdx(g,a,b,w,2);ok('Mindblade: warrior damage -> draw, lose 1',a.hand.length===h0+1&&a.life===l0-1,`${a.hand.length-h0} ${a.life-l0}`);});

await T('Mindblade Render one trigger per combat damage event',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Mindblade Render'));const w1=put(g,a,cre('Warrior A',2,2,2,'Creature — Human Warrior'));const w2=put(g,a,cre('Warrior B',2,2,2,'Creature — Human Warrior'));b.battlefield=b.battlefield.filter(x=>!x.card.isCreature);const h0=a.hand.length,l0=a.life;
  await g.combatPhase(a,[{attacker:w1,defender:b},{attacker:w2,defender:b}]);await flush(g);ok('Mindblade: two Warriors hit -> one draw, lose 1',a.hand.length-h0===1&&l0-a.life===1,`draw ${a.hand.length-h0} lose ${l0-a.life}`);});
// ---- Thwart the Grave
await T('Thwart the Grave party reduction',async()=>{const g=fresh();const [a]=g.players;const c=C('Thwart the Grave');const base=g.costOf(a,c,'hand').total;put(g,a,cre('Cl1',1,1,1,'Creature — Human Cleric'));put(g,a,cre('Cl2',1,1,1,'Creature — Human Cleric'));ok('Thwart: two clerics -> 1 less',g.costOf(a,c,'hand').total===base-1,`${base} ${g.costOf(a,c,'hand').total}`);
  put(g,a,cre('Ro',1,1,1,'Creature — Human Rogue'));put(g,a,cre('Wz',1,1,1,'Creature — Human Wizard'));ok('Thwart: cleric+rogue+wizard -> 3 less',g.costOf(a,c,'hand').total===base-3);put(g,a,bear());ok('Thwart: non-party creature adds nothing',g.costOf(a,c,'hand').total===base-3);});

// ---- Disciple of Bolas
// ENGINE BUG
await T('Disciple of Bolas X = sacrificed power',async()=>{const g=fresh();const [a]=g.players;const big=put(g,a,cre('Big',4,4,4));const c=C('Disciple of Bolas');const pm=put(g,a,c);const l0=a.life,h0=a.hand.length;
  await R(g,a,c.etbOps,c,{perm:pm});ok('Disciple: other creature sacrificed',!a.battlefield.includes(big));ok('Disciple: still on battlefield',a.battlefield.includes(pm));ok('Disciple: gain 4',a.life-l0===4,`${a.life-l0}`);ok('Disciple: draw 4',a.hand.length-h0===4,`${a.hand.length-h0}`);});
// ENGINE BUG
await T('Disciple of Bolas no other creature',async()=>{const g=fresh();const [a]=g.players;const c=C('Disciple of Bolas');const pm=put(g,a,c);const l0=a.life,h0=a.hand.length;await R(g,a,c.etbOps,c,{perm:pm});ok('Disciple: nothing to sacrifice -> no life, no cards',a.life===l0&&a.hand.length===h0,`${a.life-l0} ${a.hand.length-h0}`);});

// ---- Hoarding Broodlord
// ENGINE BUG
await T('Hoarding Broodlord exile any card, playable',async()=>{const g=fresh();const [a]=g.players;const want=cre('Wanted',3,3,3);a.library.push(want);const c=C('Hoarding Broodlord');const pm=put(g,a,c);const e0=a.exile.length;
  await R(g,a,c.etbOps,c,{perm:pm});const ex=a.exile.slice(e0);ok('Hoarding Broodlord: searched card not put onto the battlefield',!a.battlefield.some(x=>x.card===want));ok('Hoarding Broodlord: one card exiled from library',ex.length===1);ok('Hoarding Broodlord: exiled card playable',ex.length===1&&(a.exileCast||[]).some(e=>e.card===ex[0]));g.turn+=3;ok('Hoarding Broodlord: still playable later turns',ex.length===1&&g.castMode(a,ex[0],'exile')!==null&&g.castMode(a,ex[0],'exile')!==false||!!(a.exileCast||[]).find(e=>e.card===ex[0]&&(e.forever||e.until==null)));});

// ---- Alania
// ENGINE BUG
await T('Alania first instant -> opponent draws, spell copied',async()=>{const g=fresh();const [a,b,c]=g.players;bBlock(g);put(g,a,C('Alania, Divergent Storm'));const tr=()=>bfN(a,'Treasure');const i1=tagCard(mk('Treas Inst','Instant','{U}','Create a Treasure token.',1));a.hand=[i1];W(g,a,3,'Island');const ha=a.hand.length,ho=b.hand.length+c.hand.length;
  await g.cast(a,i1,'hand',null,{instant:true});await flush(g);const oppDrew=b.hand.length+c.hand.length-ho;ok('Alania: you do not draw',a.hand.length===ha-1,`${a.hand.length}`);ok('Alania: first instant -> an opponent draws 1 and the spell is copied',oppDrew===1&&tr()===2,`oppDrew ${oppDrew} treasures ${tr()}`);
  const i2=tagCard(mk('Treas Inst2','Instant','{U}','Create a Treasure token.',1));a.hand=[i2];const t1=tr(),ho1=b.hand.length+c.hand.length;await g.cast(a,i2,'hand',null,{instant:true});await flush(g);ok('Alania: second instant -> no trigger',tr()-t1===1&&b.hand.length+c.hand.length===ho1&&a.hand.length===0,`${tr()-t1} hand ${a.hand.length}`);
  const s1=tagCard(mk('Treas Sorc','Sorcery','{U}','Create a Treasure token.',1));a.hand=[s1];const t2=tr();await g.cast(a,s1,'hand');await flush(g);ok('Alania: first sorcery (after instants) -> copied too',tr()-t2===2,`${tr()-t2}`);});
// ENGINE BUG
await T('Alania creature spell (non-Otter) -> nothing',async()=>{const g=fresh();const [a,b,c]=g.players;bBlock(g);put(g,a,C('Alania, Divergent Storm'));const cr=cre('Bearish',2,2,1,'Creature — Bear','{U}');a.hand=[cr];W(g,a,1,'Island');const ho=b.hand.length+c.hand.length;
  await g.cast(a,cr,'hand');await flush(g);ok('Alania: non-Otter creature -> no draw for anyone',a.hand.length===0&&b.hand.length+c.hand.length===ho,`${a.hand.length}`);ok('Alania: no copy',a.battlefield.filter(x=>x.card.name==='Bearish').length===1);});

// ---- The Emperor of Palamecia
// ENGINE BUG
await T('Emperor of Palamecia mana only for noncreature',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('The Emperor of Palamecia'));const cr=cre('Blue Cre',1,1,1,'Creature — Bear','{U}');const nc=tagCard(mk('Blue Sorc','Sorcery','{U}','You gain 1 life.',1));
  ok('Emperor: mana pays for noncreature',!!g.castMode(a,nc,'hand'));ok('Emperor: mana cannot pay for creature',!g.castMode(a,cr,'hand'));});
// ENGINE BUG
await T('Emperor of Palamecia counter needs 4 mana spent',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const em=put(g,a,C('The Emperor of Palamecia'));em.tapped=true;W(g,a,6,'Island');
  const s2=tagCard(mk('Cheap Sorc','Sorcery','{1}{U}','You gain 1 life.',2));a.hand=[s2];await g.cast(a,s2,'hand');await flush(g);ok('Emperor: 2 mana spent -> no counter',!em.counters,`${em.counters}`);
  const s4=tagCard(mk('Big Sorc','Sorcery','{3}{U}','You gain 1 life.',4));a.hand=[s4];await g.cast(a,s4,'hand');await flush(g);ok('Emperor: 4 mana spent -> counter',em.counters===1,`${em.counters}`);
  const cr=cre('Big Cre',4,4,4,'Creature — Bear','{3}{U}');a.hand=[cr];a.battlefield.forEach(x=>{if(x.card.isLand)x.tapped=false});await g.cast(a,cr,'hand');await flush(g);ok('Emperor: creature spell -> no counter',em.counters===1);});
// ENGINE BUG
await T('Emperor of Palamecia transforms at 3 counters',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const em=put(g,a,C('The Emperor of Palamecia'));em.counters=2;W(g,a,4,'Island');const s4=tagCard(mk('Big Sorc','Sorcery','{3}{U}','You gain 1 life.',4));a.hand=[s4];await g.cast(a,s4,'hand');await flush(g);
  ok('Emperor: third counter -> transformed',em.card.name==='The Lord Master of Hell'||em.transformed,em.card.name);});

// ---- Take the Bait
await T('Take the Bait timing',async()=>{const g=fresh();const [a,b]=g.players;const c=C('Take the Bait');g.active=0;g.phase='combat';ok("Take the Bait: not on your own turn's combat",!g.addCostOk(a,c));g.active=1;g.phase='main1';ok("Take the Bait: not in opponent's main phase",!g.addCostOk(a,c));g.phase='combat';ok("Take the Bait: OK in opponent's combat",g.addCostOk(a,c));});

// ---- Ranger-Captain of Eos
await T('Ranger-Captain tutor MV<=1 creature',async()=>{const g=fresh();const [a]=g.players;const c1=cre('One Drop',1,1,1),c2=cre('Two Drop',3,3,2),c0=tagCard(mk('Zero','Artifact Creature — Golem','{0}','',0,0,0));a.library=[c1,c2,c0,L('Forest')];const c=C('Ranger-Captain of Eos');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});ok('Ranger-Captain: MV<=1 creature to hand',a.hand.includes(c1)||a.hand.includes(c0));ok('Ranger-Captain: MV2 not fetched',!a.hand.includes(c2));});
// ENGINE BUG
await T('Ranger-Captain finds nothing without a creature',async()=>{const g=fresh();const [a]=g.players;const f=L('Forest'),s1=sorc('One Sorc');a.library=[f,s1];const c=C('Ranger-Captain of Eos');const pm=put(g,a,c);
  await R(g,a,c.etbOps,c,{perm:pm});ok('Ranger-Captain: noncreature (land MV0 / sorcery MV1) never fetched',!a.hand.includes(f)&&!a.hand.includes(s1),a.hand.map(x=>x.name).join());});
await T('Ranger-Captain sacrifice silences opponents this turn',async()=>{const g=fresh();const [a,b]=g.players;const rc=put(g,a,C('Ranger-Captain of Eos'));const o=abOI(g,a,rc.card);ok('Ranger-Captain: sac option',!!o);if(!o)return;await g.activate(a,o);await flush(g);
  ok('Ranger-Captain: opponent cannot cast noncreature',!g.addCostOk(b,sorc('X')));ok('Ranger-Captain: opponent can cast creature',g.addCostOk(b,bear()));ok('Ranger-Captain: you can cast noncreature',g.addCostOk(a,sorc('X')));g.turn++;ok('Ranger-Captain: next turn opponent free',g.addCostOk(b,sorc('X')));});

// ---- Nezahal
await T("Nezahal can't be countered",async()=>{const g=fresh();const [a,b]=g.players;const nz=C('Nezahal, Primal Tide');const obj=spell(g,a,nz);ok("Nezahal: uncounterable",g.isUncounterable(obj));const cs=tagCard(mk('Counterspell','Instant','{U}{U}','Counter target spell.',2));W(g,b,2,'Island');b.hand=[cs];
  await g.cast(b,cs,'hand',{spell:obj},{instant:true});await flush(g);ok('Nezahal: not countered (resolves)',!obj.countered&&(g.stack.includes(obj)||a.battlefield.some(x=>x.card===nz)),`countered=${obj.countered}`);const bb=spell(g,a,bear());ok('control: bear counterable',!g.isUncounterable(bb));});

// ---- Bring to Light
// ENGINE BUG
await T('Bring to Light converge with 5 colors',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const c=C('Bring to Light');a.hand=[c];lands(g,a,['Forest','Island','Swamp','Mountain','Plains']);const c5=tagCard(mk('Five Drop','Creature — Giant','{4}{G}','',5,5,5)),c2=cre('Two Drop',2,2,2);a.library=[c5,c2,L('Forest')];
  await g.cast(a,c,'hand');await flush(g);ok('Bring to Light: 5 colors spent -> MV5 creature eligible (AI takes biggest)',a.battlefield.some(x=>x.card===c5),a.battlefield.filter(x=>!x.card.isLand).map(x=>x.card.name).join());});
await T('Bring to Light converge with 2 colors',async()=>{const g=fresh();const [a]=g.players;bBlock(g);const c=C('Bring to Light');a.hand=[c];lands(g,a,['Forest','Forest','Forest','Island','Island']);const c3=cre('Three Drop',3,3,3),c2=cre('Two Drop',2,2,2);a.library=[c3,c2,L('Forest')];
  await g.cast(a,c,'hand');await flush(g);ok('Bring to Light: 2 colors -> MV3 not allowed',!a.battlefield.some(x=>x.card===c3));ok('Bring to Light: 2 colors -> MV2 cast',a.battlefield.some(x=>x.card===c2));});

// ---- Ad Nauseam
await T('Ad Nauseam life loss = MV',async()=>{const g=fresh();const [a]=g.players;const c=C('Ad Nauseam');a.library=[...Array(10)].map((_,i)=>i%2?L('Swamp'):cre('C'+i,1,1,3));const l0=a.life;const lib0=[...a.library];
  await R(g,a,c.spellOps,c,{});const got=lib0.filter(x=>a.hand.includes(x));const mv=got.reduce((s,x)=>s+(x.cmc||0),0);ok('Ad Nauseam: revealed at least one',got.length>=1);ok('Ad Nauseam: life lost = total MV of cards taken',l0-a.life===mv,`${l0-a.life} vs ${mv}`);ok('Ad Nauseam: took from the top',got.every(x=>lib0.indexOf(x)>=lib0.length-got.length));});
console.log(pass+' passed, '+fails+' failed');})();
