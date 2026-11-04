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
const PL=async(g,a,c)=>{a.hand.push(c);await g.playLand(a,c);return a.battlefield.find(x=>x.card===c);};
const abO=(g,a,card,re)=>g.abilityOptions(a,{}).find(x=>x.card===card&&(!re||re.test(x.ab.label||'')||x.ab.ops.some(o=>re.test(o.op))));
const cd=async(g,a,b,att,dmg)=>{g._cdDefender=b;g._cdDmg=dmg;await g.combatDamageTriggers(a,att);await flush(g);};
const cr=(n,mana,cmc,p=2,t=2,sub='Elf')=>S(n,'Creature — '+sub,mana,'',p,t,cmc);
const K=nm=>(l,c,x)=>ok(nm+': '+l,c,x);
const ins=(n='Opt',mana='{U}',cmc=1,o='Draw a card.')=>S(n,'Instant',mana,o,0,0,cmc);
const noResp=g=>g.players.forEach(p=>{p.ai.stackResponse=()=>null;});
const lib=(p,cards)=>{p.library.push(...cards);}; // last element = top

// ===== Exsanguinate
// ENGINE BUG (X ignored, fixed 2)
await T('Exsanguinate',async()=>{const k=K('Exsanguinate');for(const [lands,X] of [[7,5],[3,1]]){const g=fresh();noResp(g);const [a,b,c]=g.players;const s=C('Exsanguinate');a.hand=[s];W(g,a,lands,'Swamp');const l0=a.life;await g.cast(a,s,'hand');await flush(g);
  k(`X=${X}: each opponent loses X`,b.life===40-X&&c.life===40-X,`${b.life},${c.life}`);k(`X=${X}: gain life lost (2X)`,a.life===l0+2*X,String(a.life-l0));}});

// ===== Sram's Expertise
await T("Sram's Expertise",async()=>{const k=K("Sram's Expertise");{const g=fresh();noResp(g);const [a]=g.players;const s=C("Sram's Expertise");const c3=cr('Three','{2}{G}',3),c4=cr('Four','{3}{G}',4);a.hand=[s,c3,c4];W(g,a,4,'Plains');await g.cast(a,s,'hand');await flush(g);
  k('MV3 cast free',a.battlefield.some(x=>x.card===c3));k('MV4 not cast',a.hand.includes(c4));}
 {const g=fresh();noResp(g);const [a]=g.players;const s=C("Sram's Expertise");const c4=cr('Four','{3}{G}',4);a.hand=[s,c4];W(g,a,4,'Plains');await g.cast(a,s,'hand');await flush(g);k('only MV4 in hand: nothing cast',a.hand.includes(c4)&&!a.battlefield.some(x=>x.card===c4));}});

// ===== Banon
await T("Banon, the Returners' Leader pray",async()=>{const k=K("Banon pray");const g=fresh();noResp(g);const [a]=g.players;put(g,a,C("Banon, the Returners' Leader"));W(g,a,6,'Forest');
  const d=cr('Discarded','{1}{G}',2);a.hand=[d];await g.runOps(a,[{op:'discard',n:1}],{name:'x'},{});await flush(g);
  const v=put(g,a,cr('Died','{1}{G}',2));await g.destroy(a,v);await flush(g);const dc=v.card.orig||v.card;
  k('discarded creature: gy cast allowed',a.graveyard.includes(d)&&!!g.castMode(a,d,'gy'));
  k('creature that died from battlefield: not allowed',!g.castMode(a,dc,'gy'));
  await g.cast(a,d,'gy');await flush(g);k('cast from gy',a.battlefield.some(x=>x.card===d));
  const d2=cr('Discarded2','{1}{G}',2);a.hand=[d2];await g.runOps(a,[{op:'discard',n:1}],{name:'x'},{});await flush(g);k('second time same turn: not allowed',!g.castMode(a,d2,'gy'));
  g.turn++;g.active=1;const d3=cr('D3','{1}{G}',2);a.hand=[d3];await g.runOps(a,[{op:'discard',n:1}],{name:'x'},{});await flush(g);k("not on opponent's turn",!g.castMode(a,d3,'gy'));});
// ENGINE BUG (Banon attack trigger ignores "pay {1} and discard")
await T("Banon, the Returners' Leader attack",async()=>{const k=K("Banon attack");{const g=fresh();const [a,b]=g.players;const bn=put(g,a,C("Banon, the Returners' Leader"));bn.summoning=false;const x=cr('Junk','{1}{G}',2);a.hand=[x];W(g,a,1,'Mountain');const h0=a.hand.length;await g.attackTriggers(a,[{attacker:bn,defender:b}]);await flush(g);
  k('paid {1} + discarded + drew: hand size unchanged, card discarded',a.hand.length===h0&&a.graveyard.includes(x),`hand ${a.hand.length-h0} gy ${a.graveyard.length}`);}
 {const g=fresh();const [a,b]=g.players;const bn=put(g,a,C("Banon, the Returners' Leader"));a.hand=[cr('Junk','{1}{G}',2)];const h0=a.hand.length;await g.attackTriggers(a,[{attacker:bn,defender:b}]);await flush(g);k('no mana to pay {1}: no draw',a.hand.length===h0,String(a.hand.length-h0));}});

// ===== Excava
await T('Excava, the Risen Past',async()=>{const k=K('Excava');{const g=fresh();const [a,b]=g.players;const ex=put(g,a,C('Excava, the Risen Past'));const c3=cr('Three','{2}{G}',3,3,3),c4=cr('Four','{3}{G}',4,4,4);const au=S('Aura','Enchantment — Aura','{W}','Enchant creature',0,0,1);a.graveyard.push(c3,c4,au);await g.attackTriggers(a,[{attacker:ex,defender:b}]);await flush(g);
  const pm=a.battlefield.find(x=>(x.card.orig||x.card)===c3);k('MV3 creature returned',!!pm);k('MV4 stays',a.graveyard.includes(c4));k('Aura stays',a.graveyard.includes(au));
  if(pm){g.refreshStatics();k('1/1 Spirit flying with finality',g.powerOf(a,pm)===1&&g.toughOf(a,pm)===1&&/Spirit/.test(pm.card.type)&&pm.card.kw.includes('flying')&&pm.finality,`${g.powerOf(a,pm)}/${g.toughOf(a,pm)} ${pm.card.type}`);}}
 {const g=fresh();const [a,b]=g.players;const ex=put(g,a,C('Excava, the Risen Past'));const ench=S('Ench','Enchantment','{2}{W}','',0,0,3);a.graveyard.push(ench);await g.attackTriggers(a,[{attacker:ex,defender:b}]);await flush(g);k('non-Aura enchantment MV3 returned',a.battlefield.some(x=>(x.card.orig||x.card)===ench));}
 {const g=fresh();const [a,b]=g.players;const ex=put(g,a,C('Excava, the Risen Past'));const o=put(g,a,bear());const c3=cr('Three','{2}{G}',3);a.graveyard.push(c3);await g.attackTriggers(a,[{attacker:o,defender:b}]);await flush(g);k('another creature attacking: no trigger',a.graveyard.includes(c3));}});

// ===== Shared Animosity
await T('Shared Animosity',async()=>{const k=K('Shared Animosity');const g=fresh();const [a,b]=g.players;put(g,a,C('Shared Animosity'));const e1=put(g,a,elf()),e2=put(g,a,elf()),e3=put(g,a,elf()),br=put(g,a,bear());const atk=[e1,e2,e3,br].map(x=>({attacker:x,defender:b}));g.curAttackers=atk.map(x=>x.attacker);await g.attackTriggers(a,atk);await flush(g);
  k('elf +2/+0 (two other elves)',g.powerOf(a,e1)===4&&g.toughOf(a,e1)===2,`${g.powerOf(a,e1)}/${g.toughOf(a,e1)}`);k('bear shares no type: +0',g.powerOf(a,br)===2,String(g.powerOf(a,br)));});

// ===== Zimone
await T('Zimone, Infinite Analyst',async()=>{const k=K('Zimone');const g=fresh();noResp(g);const [a]=g.players;const z=put(g,a,C('Zimone, Infinite Analyst'));z.counters=2;
  const xs=S('Blaze','Sorcery','{X}{R}','Blaze deals X damage to any target.',0,0,1);const nx=S('Divination','Sorcery','{2}{U}','Draw two cards.',0,0,3);
  k('first X spell costs 2 less',g.costOf(a,xs,'hand').generic===0&&g.costOf(a,xs,'hand').total===1,JSON.stringify(g.costOf(a,xs,'hand')));
  k('non-X spell not reduced',g.costOf(a,nx,'hand').generic===2);
  const x1=S('Tiny X','Sorcery','{X}{G}','You gain X life.',0,0,1);a.hand=[x1];W(g,a,1,'Forest');await g.cast(a,x1,'hand');await flush(g);
  const xs2=S('Blaze2','Sorcery','{X}{R}{R}','Blaze deals X damage to any target.',0,0,2);xs2.mana={...xs2.mana,generic:3,total:5};k('second X spell this turn not reduced',g.costOf(a,xs2,'hand').generic===3,JSON.stringify(g.costOf(a,xs2,'hand')));});

// ===== Elusive Otter
await T('Elusive Otter',async()=>{const k=K('Elusive Otter');const g=fresh();const [a,b]=g.players;const ot=put(g,a,C('Elusive Otter'));ot.counters=2;const small=opp(g,b,bear()),eq=opp(g,b,S('Three','Creature — Ape','{2}','',3,3,2)),big=opp(g,b,S('Big','Creature — Ape','{2}','',5,5,2));
  k('power 2 < 3 cannot block',!g.canBlock(small,ot));k('equal power can block',g.canBlock(eq,ot));k('greater power can block',g.canBlock(big,ot));});

// ===== Mana Bloom
await T('Mana Bloom',async()=>{const k=K('Mana Bloom');const g=fresh();noResp(g);const [a]=g.players;const mb=C('Mana Bloom');a.hand=[mb];W(g,a,4,'Forest');await g.cast(a,mb,'hand');await flush(g);const pm=a.battlefield.find(x=>x.card===mb);
  k('enters with X=3 charge',pm&&pm.charge===3,pm&&String(pm.charge));
  if(pm){const has=()=>g.manaSrcs(a).some(s=>s.b===pm);k('is a mana source with charge',has());const cst={generic:0,pips:{W:0,U:0,B:0,R:0,G:1},total:1};a.battlefield.filter(x=>x.card.isLand).forEach(x=>x.tapped=true);g.payCost(a,cst);k('used: charge 2',pm.charge===2,String(pm.charge));k('only once each turn',!has());
   pm.tapped=false;pm.charge=0;k('no charge: no mana',!has());
   pm.charge=1;await g.fireTriggers(a,'upkeep');await flush(g);k('upkeep with charge: stays',a.battlefield.includes(pm));pm.charge=0;await g.fireTriggers(a,'upkeep');await flush(g);k('upkeep with no charge: returned to hand',a.hand.includes(mb)&&!a.battlefield.includes(pm));}});

// ===== Syncopate
// ENGINE BUG (X is fixed at 3)
await T('Syncopate X',async()=>{const k=K('Syncopate');const g=fresh();const [a,b]=g.players;const v=bear();const sp=spell(g,b,v);W(g,b,2,'Forest');b.ai.choosePayUnless=()=>true;const sy=C('Syncopate');a.hand=[sy];W(g,a,2,'Island');await g.cast(a,sy,'hand',{spell:sp},{instant:true});await flush(g);
  k('X=1 and controller can pay 1: not countered',!sp.countered,`countered=${sp.countered} untapped=${b.battlefield.filter(x=>!x.tapped).length}`);});
// ENGINE BUG (countered spell goes to graveyard)
await T('Syncopate exile',async()=>{const k=K('Syncopate');const g=fresh();const [a,b]=g.players;const v=bear();const sp=spell(g,b,v);const sy=C('Syncopate');a.hand=[sy];W(g,a,4,'Island');await g.cast(a,sy,'hand',{spell:sp},{instant:true});await flush(g);
  k('cannot pay: countered',!!sp.countered);k('countered spell exiled, not in graveyard',b.exile.includes(v)&&!b.graveyard.includes(v),`gy=${b.graveyard.includes(v)} ex=${b.exile.includes(v)}`);});

// ===== Ashling
await T('Ashling, Rekindled',async()=>{const k=K('Ashling');{const g=fresh();const [a]=g.players;const c=C('Ashling, Rekindled');const junk=S('Junk','Sorcery','{9}','',0,0,9);a.hand=[c,junk];a.ai.castValue=(gm,me,x)=>x===junk?-5:5;W(g,a,2,'Mountain');noResp(g);await g.cast(a,c,'hand');await flush(g);
  k('ETB: discard + draw',a.graveyard.includes(junk)&&a.hand.length===1,`hand=${a.hand.length}`);}
 {const g=fresh();const [a]=g.players;const c=C('Ashling, Rekindled');a.hand=[c];W(g,a,2,'Mountain');noResp(g);await g.cast(a,c,'hand');await flush(g);k('ETB with empty hand: no draw',a.hand.length===0);}
 {const g=fresh();const [a]=g.players;const pm=put(g,a,C('Ashling, Rekindled'));W(g,a,1,'Island');await g.fireTriggers(a,'main1');await flush(g);k('main1 with {U}: transforms',/Rimebound/.test(pm.card.name),pm.card.name);
  const junk=S('Junk','Sorcery','{9}','',0,0,9);a.hand=[junk];a.ai.castValue=(gm,me,x)=>x===junk?-5:5;a.battlefield.forEach(x=>x.tapped=false);W(g,a,1,'Mountain');a.battlefield.filter(x=>x.card.name==='Island').forEach(x=>x.tapped=true);g.turn++;await g.fireTriggers(a,'main1');await flush(g);
  // ENGINE BUG (cannot transform back into Rekindled / no loot on transform)
  k('Rimebound pays {R}: transforms back into Rekindled',/Rekindled/.test(pm.card.name),pm.card.name);k('transforming into Rekindled: discard + draw',a.graveyard.includes(junk),a.graveyard.map(c=>c.name).join());}
 {const g=fresh();const [a]=g.players;const pm=put(g,a,C('Ashling, Rekindled'));W(g,a,1,'Mountain');await g.fireTriggers(a,'main1');await flush(g);k('main1 without {U}: no transform',/Rekindled/.test(pm.card.name));}});

// ===== Plargg and Nassari
await T('Plargg and Nassari',async()=>{const k=K('Plargg and Nassari');const g=fresh(4);noResp(g);const [a]=g.players;put(g,a,C('Plargg and Nassari'));const nl=[];g.players.forEach((p,i)=>{const c=S('Gain'+i,'Sorcery','{'+(i+1)+'}','You gain 1 life.',0,0,i+1);nl.push(c);p.library.push(c,L('Forest'));});
  await g.fireTriggers(a,'upkeep');await flush(g);const stillEx=nl.filter((c,i)=>g.players[i].exile.includes(c));
  k('lands above were exiled too',g.players.every(p=>p.exile.some(c=>c.name==='Forest')));k('each player exiled one nonland',nl.every((c,i)=>!g.players[i].library.includes(c)));
  k('exactly two cast (two stay exiled: opp pick + one)',stillEx.length===2,stillEx.map(c=>c.name).join());});

// ===== Tablet of Discovery
await T('Tablet of Discovery',async()=>{const k=K('Tablet of Discovery');const g=fresh();noResp(g);const [a]=g.players;const f=L('Forest');lib(a,[f]);const t=C('Tablet of Discovery');a.hand=[t];W(g,a,3,'Mountain');a.landsThisTurn=1;g.turn=4;a.landsThisTurn=0;await g.cast(a,t,'hand');await flush(g);
  k('milled card',a.graveyard.includes(f));const playable=()=>g.castMode?(!!g.castMode(a,f,'gy')||(g.landOptions?g.landOptions(a).some(o=>o.card===f||o===f):false)):false;
  const tp=a.battlefield.find(x=>x.card===t);const ins2=ins('Bolt','{R}{R}',2);const crt=cr('Red','{R}{R}',2);
  k('RR for instant',g.manaSrcs(a,{...g.costOf(a,ins2,'hand')}).some(s=>s.b===tp&&s.amount===2));
  k('not RR for a creature spell',!g.manaSrcs(a,g.costOf(a,crt,'hand')).some(s=>s.b===tp&&s.amount===2));
  // ENGINE BUG (the plain {T}: Add {R} ability is lost)
  k('{T}: Add {R} still available for a creature spell',g.manaSrcs(a,g.costOf(a,crt,'hand')).some(s=>s.b===tp&&s.amount===1));});
// ENGINE BUG (no play permission for milled card)
await T('Tablet of Discovery play milled',async()=>{const k=K('Tablet of Discovery');const g=fresh();noResp(g);const [a]=g.players;const s=S('Gain','Sorcery','{R}','You gain 3 life.',0,0,1);lib(a,[s]);const t=C('Tablet of Discovery');const pm=put(g,a,t);await g.runOps(a,t.etbOps,t,{perm:pm});await flush(g);W(g,a,1,'Mountain');
  k('milled card playable this turn',a.graveyard.includes(s)&&!!g.castMode(a,s,'gy'));g.turn++;k('not next turn',!g.castMode(a,s,'gy'));});

// ===== Culling Ritual
// ENGINE BUG (no destruction parsed) [test fixed: 4 Swamps cannot pay {2}{B}{G}; now 3 Swamps + 1 Forest]
await T('Culling Ritual',async()=>{const k=K('Culling Ritual');const g=fresh();noResp(g);const [a,b]=g.players;const c=C('Culling Ritual');a.hand=[c];W(g,a,3,'Swamp');W(g,a,1,'Forest');const v2=opp(g,b,bear());const v1=opp(g,b,S('One','Artifact','{1}','',0,0,1));const v3=opp(g,b,cr('Three','{2}{G}',3));const ln=opp(g,b,L('Forest'));a.pool=[];const lib0=a.library.length;
  await g.cast(a,c,'hand');await flush(g);k('MV2 creature destroyed',!b.battlefield.includes(v2));k('MV1 artifact destroyed',!b.battlefield.includes(v1));k('MV3 survives',b.battlefield.includes(v3));k('land survives',b.battlefield.includes(ln));
  k('no land fetched',a.library.length===lib0,String(lib0-a.library.length));});
// ENGINE BUG (mana not tied to number destroyed)
await T('Culling Ritual mana',async()=>{const k=K('Culling Ritual');for(const n of [0,3]){const g=fresh();const [a,b]=g.players;for(let i=0;i<n;i++)opp(g,b,bear());opp(g,b,cr('Three','{2}{G}',3));const c=C('Culling Ritual');a.pool=[];await g.runOps(a,c.spellOps,c,{});k(`${n} destroyable: adds ${n} mana`,(a.pool||[]).length===n,String((a.pool||[]).length));}});

// ===== Jenova
// ENGINE BUG ('during your turn' req ignored on dies trigger)
await T('Jenova, Ancient Calamity',async()=>{const k=K('Jenova');{const g=fresh();const [a]=g.players;const j=put(g,a,C('Jenova, Ancient Calamity'));const x=put(g,a,bear());const pw=g.powerOf(a,j);await g.fireTriggers(a,'combatStart');await flush(g);k('other creature gets counters = power, becomes Mutant',x.counters===pw&&/Mutant/.test(x.card.type),`${x.counters}/${pw}`);k('Jenova gets none',!j.counters);}
 {const g=fresh();const [a]=g.players;const j=put(g,a,C('Jenova, Ancient Calamity'));await g.fireTriggers(a,'combatStart');await flush(g);k('alone: no counters on Jenova',!j.counters);}
 const mut=()=>S('Mut','Creature — Mutant','{2}','',3,3,2);
 {const g=fresh();const [a]=g.players;put(g,a,C('Jenova, Ancient Calamity'));const m=put(g,a,mut());const h0=a.hand.length;await g.destroy(a,m);await flush(g);k('Mutant dies on your turn: draw 3',a.hand.length===h0+3,String(a.hand.length-h0));
  const nm=put(g,a,bear());const h1=a.hand.length;await g.destroy(a,nm);await flush(g);k('non-Mutant: no draw',a.hand.length===h1);}
 {const g=fresh();const [a,b]=g.players;put(g,a,C('Jenova, Ancient Calamity'));g.active=1;const m=put(g,a,mut());const h0=a.hand.length;await g.destroy(a,m);await flush(g);k("Mutant dies on opponent's turn: no draw",a.hand.length===h0,String(a.hand.length-h0));}
 {const g=fresh();const [a,b]=g.players;put(g,a,C('Jenova, Ancient Calamity'));const m=opp(g,b,mut());const h0=a.hand.length;await g.destroy(b,m);await flush(g);k("opponent's Mutant: no draw",a.hand.length===h0);}});

// ===== Vernal Fen / Undergrowth Stadium / Rockfall Vale
await T('Vernal Fen',async()=>{const k=K('Vernal Fen');{const g=fresh();const [a]=g.players;W(g,a,2,'Swamp');const pm=await PL(g,a,C('Vernal Fen'));k('2 basics: untapped',pm&&!pm.tapped);}
 {const g=fresh();const [a]=g.players;W(g,a,1,'Swamp');put(g,a,C('Rockfall Vale'));const pm=await PL(g,a,C('Vernal Fen'));k('1 basic + nonbasic: tapped',pm&&pm.tapped);}});
await T('Undergrowth Stadium',async()=>{const k=K('Undergrowth Stadium');{const g=fresh(3);const [a]=g.players;const pm=await PL(g,a,C('Undergrowth Stadium'));k('2 opponents: untapped',pm&&!pm.tapped);}
 {const g=fresh(2);const [a]=g.players;const pm=await PL(g,a,C('Undergrowth Stadium'));k('1 opponent: tapped',pm&&pm.tapped);}});
await T('Rockfall Vale',async()=>{const k=K('Rockfall Vale');{const g=fresh();const [a]=g.players;W(g,a,2,'Forest');const pm=await PL(g,a,C('Rockfall Vale'));k('2 other lands: untapped',pm&&!pm.tapped);}
 {const g=fresh();const [a]=g.players;W(g,a,1,'Forest');const pm=await PL(g,a,C('Rockfall Vale'));k('1 other land: tapped',pm&&pm.tapped);}});

// ===== Formidable Speaker
await T('Formidable Speaker',async()=>{const k=K('Formidable Speaker');{const g=fresh();const [a]=g.players;const tc=cr('Target','{4}{G}',5,5,5);lib(a,[tc]);a.hand=[];const fs=C('Formidable Speaker');const pm=put(g,a,fs);await g.runOps(a,fs.etbOps,fs,{perm:pm});
  // ENGINE BUG (searches without discarding)
  k('empty hand (cannot discard): no search',!a.hand.includes(tc)&&a.library.includes(tc));}
 {const g=fresh();const [a]=g.players;const tc=cr('Target','{4}{G}',5,5,5);lib(a,[tc]);const j=L('Forest');a.hand=[j];const fs=C('Formidable Speaker');const pm=put(g,a,fs);await g.runOps(a,fs.etbOps,fs,{perm:pm});k('discard + search: creature in hand, card discarded',a.hand.includes(tc)&&a.graveyard.includes(j),a.hand.map(c=>c.name).join());}});

// ===== Shamanic Revelation
// ENGINE BUG (draws 1, gains 8 flat)
await T('Shamanic Revelation',async()=>{const k=K('Shamanic Revelation');const g=fresh();noResp(g);const [a]=g.players;put(g,a,bear());put(g,a,bear());put(g,a,S('Big','Creature — Ape','{4}','',4,4,4));put(g,a,S('Big2','Creature — Ape','{4}','',5,1,4));const s=C('Shamanic Revelation');a.hand=[s];W(g,a,5,'Forest');const h0=a.hand.length-1,l0=a.life;await g.cast(a,s,'hand');await flush(g);
  k('draw 4 (one per creature)',a.hand.length===h0+4,String(a.hand.length-h0));k('gain 8 (two creatures power>=4)',a.life===l0+8,String(a.life-l0));});
// ENGINE BUG (gains 8 flat)
await T('Shamanic Revelation ferocious',async()=>{const k=K('Shamanic Revelation');for(const [n,exp] of [[0,0],[1,4]]){const g=fresh();noResp(g);const [a]=g.players;put(g,a,bear());for(let i=0;i<n;i++)put(g,a,S('Big','Creature — Ape','{4}','',4,4,4));const s=C('Shamanic Revelation');a.hand=[s];W(g,a,5,'Forest');const l0=a.life;await g.cast(a,s,'hand');await flush(g);k(`${n} creature(s) power>=4: gain ${exp}`,a.life===l0+exp,String(a.life-l0));}});

// ===== Chord of Calling
// ENGINE BUG (X fixed at 3)
await T('Chord of Calling',async()=>{const k=K('Chord of Calling');for(const [n,X] of [[4,1],[6,3]]){const g=fresh();noResp(g);const [a]=g.players;const c1=cr('One','{G}',1),c3=cr('Three','{2}{G}',3,3,3);a.library=[c3,c1,...a.library.filter(c=>!c.isCreature)];const ch=C('Chord of Calling');a.hand=[ch];W(g,a,n,'Forest');a.ai.chooseX=(gm,me,card,max)=>X;
  await g.cast(a,ch,'hand',null,{instant:true});await flush(g);const got=a.battlefield.filter(x=>x.card===c1||x.card===c3).map(x=>x.card.cmc);
  if(X===1)k('X=1: only MV1 fetched',got.length===1&&got[0]===1,JSON.stringify(got));else k('X=3: MV3 fetched',got.includes(3),JSON.stringify(got));}});

// ===== Flare of Faith
await T('Flare of Faith',async()=>{const k=K('Flare of Faith');{const g=fresh();noResp(g);const [a]=g.players;const x=put(g,a,bear());const s=C('Flare of Faith');a.hand=[s];W(g,a,2,'Plains');await g.cast(a,s,'hand',x,{instant:true});await flush(g);g.refreshStatics();k('non-Human +2/+2',g.powerOf(a,x)===4&&g.toughOf(a,x)===4,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);k('non-Human not indestructible',!g.isIndestructible(x));}
 // ENGINE BUG (Human clause ignored)
 {const g=fresh();noResp(g);const [a]=g.players;const x=put(g,a,S('Hum','Creature — Human Soldier','{1}{W}','',2,2,2));const s=C('Flare of Faith');a.hand=[s];W(g,a,2,'Plains');await g.cast(a,s,'hand',x,{instant:true});await flush(g);g.refreshStatics();k('Human +3/+3',g.powerOf(a,x)===5&&g.toughOf(a,x)===5,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);k('Human indestructible',g.isIndestructible(x));}});

// ===== Heroic Sacrifice
// ENGINE BUG (no effect parsed)
await T('Heroic Sacrifice',async()=>{const k=K('Heroic Sacrifice');const g=fresh();noResp(g);const [a,b]=g.players;const ch=put(g,a,S('Wall','Creature — Wall','{3}','',0,10,3));const s=C('Heroic Sacrifice');a.hand=[s];W(g,a,2,'Plains');await g.cast(a,s,'hand',ch,{instant:true});await flush(g);const l0=a.life;await g.runOps(b,[{op:'damage',n:3,to:'each opponent'}],{name:'Burn'},{});await flush(g);
  k('damage to you dealt to the chosen creature instead',a.life===l0&&(ch.marked||0)===3,`life ${l0-a.life} marked ${ch.marked}`);});

// ===== Distant Melody
// ENGINE BUG (no effect parsed)
await T('Distant Melody',async()=>{const k=K('Distant Melody');const g=fresh();noResp(g);const [a]=g.players;put(g,a,elf());put(g,a,elf());put(g,a,elf());put(g,a,bear());const s=C('Distant Melody');a.hand=[s];W(g,a,4,'Island');const h0=a.hand.length-1;await g.cast(a,s,'hand');await flush(g);k('choose Elf: draw 3 (not 4)',a.hand.length===h0+3,String(a.hand.length-h0));});

// ===== Incandescent Soulstoke
await T('Incandescent Soulstoke',async()=>{const k=K('Incandescent Soulstoke');{const g=fresh();const [a]=g.players;const is=put(g,a,C('Incandescent Soulstoke'));const el=S('Ele','Creature — Elemental','{5}{R}','',5,5,6);a.hand=[el];W(g,a,2,'Mountain');const o=abO(g,a,is.card,/putFromHand/);k('option',!!o);if(o){await g.activate(a,o);await flush(g);const pm=a.battlefield.find(x=>x.card===el);k('Elemental put in with haste, sac at end',pm&&!pm.summoning&&pm.sacAtEnd);}}
 {const g=fresh();const [a]=g.players;const is=put(g,a,C('Incandescent Soulstoke'));const nb=cr('Elfy','{5}{G}',6);a.hand=[nb];W(g,a,2,'Mountain');const o=abO(g,a,is.card,/putFromHand/);if(o){await g.activate(a,o);await flush(g);}k('non-Elemental stays in hand',a.hand.includes(nb));}});

// ===== Smokebraider
// ENGINE BUG (spend restriction ignored)
await T('Smokebraider',async()=>{const k=K('Smokebraider');const g=fresh();const [a]=g.players;const sb=put(g,a,C('Smokebraider'));const el=S('Ele','Creature — Elemental','{1}{R}','',2,2,2);const nb=cr('Bear','{1}{G}',2);
  k('2 mana for an Elemental spell',g.manaSrcs(a,g.costOf(a,el,'hand')).some(s=>s.b===sb&&s.amount===2));k('no mana for a non-Elemental spell',!g.manaSrcs(a,g.costOf(a,nb,'hand')).some(s=>s.b===sb));});

// ===== Éomer
// ENGINE BUG (generic "enters with a +1/+1 counter" regex adds an extra counter)
await T('Éomer, King of Rohan',async()=>{const k=K('Éomer');for(const nh of [2,0]){const g=fresh();noResp(g);const [a,b,c]=g.players;for(let i=0;i<nh;i++)put(g,a,S('Hum','Creature — Human','{W}','',1,1,1));const e=C('Éomer, King of Rohan');a.hand=[e];W(g,a,4,'Plains');W(g,a,1,'Mountain');const tot0=b.life+c.life+g.players.flatMap(p=>p.battlefield).length;await g.cast(a,e,'hand');await flush(g);const pm=a.battlefield.find(x=>x.card===e);const pw=g.powerOf(a,pm);
  k(`${nh} other Humans: ${nh} counters`,pm.counters===nh,String(pm.counters));k('you become the monarch',g.monarch===a);const lost=80-(b.life+c.life);k('damage equal to its power dealt to an opponent',lost===pw,`lost ${lost} pw ${pw}`);}});

// ===== Knight of New Alara
await T('Knight of New Alara',async()=>{const k=K('Knight of New Alara');const g=fresh();const [a,b]=g.players;const kn=put(g,a,C('Knight of New Alara'));const two=put(g,a,S('Gold','Creature — Elf','{G}{W}','',2,2,2));two.card.colors=['G','W'];const three=put(g,a,S('Gold3','Creature — Elf','{G}{W}{U}','',1,1,3));three.card.colors=['G','W','U'];const mono=put(g,a,bear());mono.card.colors=['G'];const oc=opp(g,b,S('OG','Creature — Elf','{G}{W}','',2,2,2));oc.card.colors=['G','W'];g.refreshStatics();
  k('2-color +2/+2',g.powerOf(a,two)===4&&g.toughOf(a,two)===4,`${g.powerOf(a,two)}/${g.toughOf(a,two)}`);k('3-color +3/+3',g.powerOf(a,three)===4);k('mono +0',g.powerOf(a,mono)===2);k('not itself',g.powerOf(a,kn)===kn.card.power,String(g.powerOf(a,kn)));k("opponent's not pumped",g.powerOf(b,oc)===2);});

// ===== Entish Restoration
// ENGINE BUG (no effect parsed; generic ramp fetch instead)
await T('Entish Restoration',async()=>{const k=K('Entish Restoration');for(const big of [false,true]){const g=fresh();noResp(g);const [a]=g.players;if(big)put(g,a,S('Big','Creature — Ape','{4}','',4,4,4));const s=C('Entish Restoration');a.hand=[s];W(g,a,3,'Forest');const n0=a.battlefield.filter(x=>x.card.isLand).length;const lb0=a.library.filter(c=>c.isLand).length;await g.cast(a,s,'hand',null,{instant:true});await flush(g);const n1=a.battlefield.filter(x=>x.card.isLand).length;const fetched=lb0-a.library.filter(c=>c.isLand).length;
  k(big?'power 4: fetch 3 basics':'no power 4: fetch 2 basics',fetched===(big?3:2),String(fetched));k('a land was sacrificed',a.graveyard.some(c=>c.isLand));k('fetched lands tapped',a.battlefield.filter(x=>x.card.isLand).slice(-fetched||-1).every(x=>x.tapped));}});

// ===== Traveling Chocobo
await T('Traveling Chocobo',async()=>{const k=K('Traveling Chocobo');{const g=fresh();const [a]=g.players;put(g,a,C('Traveling Chocobo'));put(g,a,S('LF','Creature — Elemental','{2}','Landfall — Whenever a land you control enters, you gain 1 life.',1,1,2));const l0=a.life;await PL(g,a,L('Forest'));await flush(g);k('landfall triggers twice',a.life===l0+2,String(a.life-l0));}
 const watcher=()=>S('Watch','Creature — Elemental','{2}','Whenever another creature you control enters, you gain 1 life.',1,1,2);
 // ENGINE BUG (Bird half not implemented)
 {const g=fresh();const [a]=g.players;put(g,a,C('Traveling Chocobo'));put(g,a,watcher());const l0=a.life;const bd=await g.enterPerm(a,S('Birdy','Creature — Bird','{1}','',1,1,1));await g.creatureEntered(a,bd);await flush(g);k('Bird entering: trigger twice',a.life===l0+2,String(a.life-l0));}
 {const g=fresh();const [a]=g.players;put(g,a,C('Traveling Chocobo'));put(g,a,watcher());const l0=a.life;const bd=await g.enterPerm(a,bear());await g.creatureEntered(a,bd);await flush(g);k('non-Bird: once',a.life===l0+1,String(a.life-l0));}});

// ===== Eiganjo
await T('Eiganjo, Seat of the Empire',async()=>{const k=K('Eiganjo');const ei=()=>C('Eiganjo, Seat of the Empire');{const g=fresh();const [a]=g.players;const e=ei();a.hand=[e];W(g,a,1,'Plains');put(g,a,S('L1','Legendary Creature — Human','{1}','',1,1,1));put(g,a,S('L2','Legendary Creature — Elf','{1}','',1,1,1));const ab=e.abilities.find(x=>x.zone==='hand');const c=g.abilityCost(a,e,ab,e);k('2 legendary: costs {W}',c.total===1,JSON.stringify(c));}
 {const g=fresh();const [a]=g.players;const e=ei();a.hand=[e];const ab=e.abilities.find(x=>x.zone==='hand');k('0 legendary: costs 3',g.abilityCost(a,e,ab,e).total===3);}
 {const g=fresh();const [a,b]=g.players;const e=ei();const v=opp(g,b,S('Tough','Creature — Ape','{3}','',3,4,3));const atk=opp(g,b,S('Att','Creature — Ape','{3}','',3,4,3));g.curAttackers=[atk];atk.attackTurn=g.turn;g.phase='combat';g.active=1;await g.runOps(a,e.abilities.find(x=>x.zone==='hand').ops,e,{});await g.sba();k('hits the attacking creature',!b.battlefield.includes(atk));k('not the non-attacking one',b.battlefield.includes(v));}
 {const g=fresh();const [a,b]=g.players;const e=ei();const v=opp(g,b,S('Tough','Creature — Ape','{3}','',3,4,3));g.curAttackers=[];g.phase='combat';g.active=1;await g.runOps(a,e.abilities.find(x=>x.zone==='hand').ops,e,{});await g.sba();k('no attacking/blocking creature: nothing damaged',b.battlefield.includes(v)&&!(v.marked>0));}});

// ===== Winota
await T('Winota, Joiner of Forces',async()=>{const k=K('Winota');{const g=fresh();const [a,b]=g.players;put(g,a,C('Winota, Joiner of Forces'));const h=S('Hum','Creature — Human Soldier','{3}','',3,3,3);lib(a,[h,L('Forest'),L('Forest')]);const x=put(g,a,bear());const atk=[{attacker:x,defender:b}];await g.attackTriggers(a,atk);await flush(g);const pm=a.battlefield.find(y=>y.card===h);
  k('non-Human attack: Human put in tapped attacking',pm&&pm.tapped&&atk.some(z=>z.attacker===pm));if(pm)k('indestructible',g.isIndestructible(pm));}
 {const g=fresh();const [a,b]=g.players;put(g,a,C('Winota, Joiner of Forces'));const h=S('Hum','Creature — Human Soldier','{3}','',3,3,3);lib(a,[h]);const x=put(g,a,S('Hum2','Creature — Human','{1}','',1,1,1));await g.attackTriggers(a,[{attacker:x,defender:b}]);await flush(g);k('Human attacks: no trigger',a.library.includes(h));}
 {const g=fresh();const [a,b]=g.players;put(g,a,C('Winota, Joiner of Forces'));const nh=cr('NonHum','{3}',3);lib(a,[nh]);const x=put(g,a,bear());await g.attackTriggers(a,[{attacker:x,defender:b}]);await flush(g);k('non-Human creature card not put in',!a.battlefield.some(y=>y.card===nh));}});

// ===== Nighthawk Scavenger
await T('Nighthawk Scavenger',async()=>{const k=K('Nighthawk Scavenger');const g=fresh();const [a,b,c]=g.players;const n=put(g,a,C('Nighthawk Scavenger'));g.refreshStatics();k('empty gys: power 1',g.powerOf(a,n)===1,String(g.powerOf(a,n)));b.graveyard.push(bear(),L('Forest'));c.graveyard.push(ins());a.graveyard.push(S('Art','Artifact','{1}','',0,0,1));g.refreshStatics();k('creature+land+instant in opp gys (own artifact ignored): power 4',g.powerOf(a,n)===4,String(g.powerOf(a,n)));});

// ===== Baldin
await T('Baldin, Century Herdmaster',async()=>{const k=K('Baldin');{const g=fresh();const [a,b]=g.players;put(g,a,C('Baldin, Century Herdmaster'));const w=put(g,a,S('Wall','Creature — Wall','{1}','',1,5,1));const l0=b.life;await g.combatPhase(a,[{attacker:w,defender:b}]);k('your turn: 1/5 deals 5',l0-b.life===5,String(l0-b.life));}
 {const g=fresh();const [a,b]=g.players;put(g,a,C('Baldin, Century Herdmaster'));g.active=1;const w=opp(g,b,S('Wall','Creature — Wall','{1}','',1,5,1));a.ai.chooseBlocks=()=>new Map();const l0=a.life;await g.combatPhase(b,[{attacker:w,defender:a}]);k("opponent's turn: 1/5 deals 1",l0-a.life===1,String(l0-a.life));}
 {const g=fresh();const [a,b]=g.players;const bd=put(g,a,C('Baldin, Century Herdmaster'));const x=put(g,a,bear());const v=opp(g,b,bear());a.hand=[L('Forest'),L('Forest'),L('Forest')];await g.attackTriggers(a,[{attacker:bd,defender:b}]);await flush(g);k('attack: my creature +0/+3 (hand 3)',g.toughOf(a,x)===5,String(g.toughOf(a,x)));k('power unchanged',g.powerOf(a,x)===2);}});

// ===== Jaws of Defeat
await T('Jaws of Defeat',async()=>{const k=K('Jaws of Defeat');const g=fresh();const [a,b,c]=g.players;put(g,a,C('Jaws of Defeat'));const tot=()=>b.life+c.life;let t0=tot();const w=await g.enterPerm(a,S('Wall','Creature — Wall','{1}','',1,4,1));await g.creatureEntered(a,w);await flush(g);k('1/4 enters: an opponent loses 3',t0-tot()===3,String(t0-tot()));
  t0=tot();const br=await g.enterPerm(a,bear());await g.creatureEntered(a,br);await flush(g);k('2/2: loses 0',t0-tot()===0);t0=tot();const l0=a.life;const ow=await g.enterPerm(b,S('Wall','Creature — Wall','{1}','',1,4,1));await g.creatureEntered(b,ow);await flush(g);k("opponent's creature: no trigger",t0-tot()===0&&a.life===l0);});

// ===== Cloud
// ENGINE BUG (draws 1 and makes treasures unconditionally)
await T('Cloud, Ex-SOLDIER',async()=>{const k=K('Cloud');{const g=fresh();const [a,b]=g.players;const cl=put(g,a,C('Cloud, Ex-SOLDIER'));const h0=a.hand.length;await g.attackTriggers(a,[{attacker:cl,defender:b}]);await flush(g);k('no equipped attackers: draw 0',a.hand.length===h0,String(a.hand.length-h0));k('power <7: no treasures',!a.battlefield.some(x=>x.card.name==='Treasure'));}
 {const g=fresh();const [a,b]=g.players;const cl=put(g,a,C('Cloud, Ex-SOLDIER'));cl.counters=3;const x=put(g,a,bear());const e1=put(g,a,S('Eq','Artifact — Equipment','{1}','Equip {1}',0,0,1));const e2=put(g,a,S('Eq2','Artifact — Equipment','{1}','Equip {1}',0,0,1));e1.attachedTo=cl.id;e2.attachedTo=x.id;g.refreshStatics();const h0=a.hand.length;await g.attackTriggers(a,[{attacker:cl,defender:b},{attacker:x,defender:b}]);await flush(g);k('two equipped attackers: draw 2',a.hand.length===h0+2,String(a.hand.length-h0));k('power 7: two treasures',a.battlefield.filter(x=>x.card.name==='Treasure').length===2,String(g.powerOf(a,cl)));}});

// ===== Conqueror's Flail
await T("Conqueror's Flail",async()=>{const k=K("Conqueror's Flail");const g=fresh();const [a,b]=g.players;const f=put(g,a,C("Conqueror's Flail"));const x=put(g,a,bear());x.card.colors=['G'];const r=put(g,a,S('Red','Enchantment','{R}','',0,0,1));r.card.colors=['R'];f.attachedTo=x.id;W(g,b,1,'Island');g.refreshStatics();k('+2/+2 (G,R)',g.powerOf(a,x)===4&&g.toughOf(a,x)===4,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);
  const o=ins();k('attached, your turn: opponent cannot cast',!g.castMode(b,o,'hand',{instant:true}));g.active=1;k("attached, opponent's turn: opponent can cast",!!g.castMode(b,o,'hand',{instant:true}));g.active=0;
  // ENGINE BUG (lock applies while unattached)
  f.attachedTo=null;k('unattached: opponent can cast',!!g.castMode(b,o,'hand',{instant:true}));});

// ===== Reyav
await T('Reyav, Master Smith',async()=>{const k=K('Reyav');const g=fresh();const [a,b]=g.players;put(g,a,C('Reyav, Master Smith'));const x=put(g,a,bear()),y=put(g,a,bear()),z=put(g,a,bear());const eq=put(g,a,S('Eq','Artifact — Equipment','{1}','Equip {1}',0,0,1));eq.attachedTo=x.id;const au=put(g,a,S('Au','Enchantment — Aura','{W}','Enchant creature',0,0,1));au.attachedTo=z.id;await g.attackTriggers(a,[{attacker:x,defender:b},{attacker:y,defender:b},{attacker:z,defender:b}]);await flush(g);g.refreshStatics();const ds=p=>(p.kwT||[]).includes('double strike')||p.card.kw.includes('double strike');
  k('equipped gains double strike',ds(x));k('enchanted gains double strike',ds(z));k('plain attacker does not',!ds(y));});

// ===== Broodcaller Scourge
await T('Broodcaller Scourge',async()=>{const k=K('Broodcaller Scourge');{const g=fresh();const [a,b]=g.players;const d=put(g,a,C('Broodcaller Scourge'));const c3=cr('Three','{3}',3),c4=cr('Four','{4}',4);a.hand=[c3,c4];await cd(g,a,b,d,3);k('Dragon deals 3: MV3 put in',a.battlefield.some(x=>x.card===c3));k('MV4 stays',a.hand.includes(c4));}
 {const g=fresh();const [a,b]=g.players;put(g,a,C('Broodcaller Scourge'));const x=put(g,a,bear());const c1=cr('One','{1}',1);a.hand=[c1];await cd(g,a,b,x,2);k('non-Dragon damage: nothing',a.hand.includes(c1));}});

// ===== Klauth
await T('Klauth, Unrivaled Ancient',async()=>{const k=K('Klauth');const g=fresh();const [a,b]=g.players;const kl=put(g,a,C('Klauth, Unrivaled Ancient'));const x=put(g,a,bear());const y=put(g,a,bear());a.pool=[];g.curAttackers=[kl,x];const atk=[{attacker:kl,defender:b},{attacker:x,defender:b}];await g.attackTriggers(a,atk);await flush(g);const X=g.powerOf(a,kl)+2;
  k('adds total attacking power (non-attacker excluded)',a.pool.length===X,`${a.pool.length} vs ${X}`);k("doesn't empty",a.pool.every(e=>e.eot));
  // ENGINE BUG (Klauth mana can pay activated abilities)
  const pa=put(g,a,S('Pinger','Artifact','{1}','{1}: You gain 1 life.',0,0,1));a.battlefield.filter(z=>z.card.isLand).forEach(z=>z.tapped=true);const o=abO(g,a,pa.card);k('mana cannot pay an activated ability',!o,o?'ability offered':'');});

// ===== Garnet
// ENGINE BUG (counter added without removing lore counters)
await T('Garnet, Princess of Alexandria',async()=>{const k=K('Garnet');{const g=fresh();const [a,b]=g.players;const gn=put(g,a,C('Garnet, Princess of Alexandria'));await g.attackTriggers(a,[{attacker:gn,defender:b}]);await flush(g);k('no Sagas: no counter',!gn.counters,String(gn.counters));}
 {const g=fresh();const [a,b]=g.players;const gn=put(g,a,C('Garnet, Princess of Alexandria'));const s1=put(g,a,S('Saga1','Enchantment — Saga','{2}','I — You gain 1 life.\nII — You gain 1 life.\nIII — You gain 1 life.',0,0,2));s1.lore=1;const s2=put(g,a,S('Saga2','Enchantment — Saga','{2}','I — You gain 1 life.\nII — You gain 1 life.\nIII — You gain 1 life.',0,0,2));s2.lore=2;await g.attackTriggers(a,[{attacker:gn,defender:b}]);await flush(g);k('two Sagas: up to 2 counters, lore removed',gn.counters>=1&&gn.counters<=2&&(s1.lore+s2.lore)===3-gn.counters,`c=${gn.counters} lore=${s1.lore},${s2.lore}`);}});

// ===== Eladamri
await T('Eladamri, Korvecdal',async()=>{const k=K('Eladamri');{const g=fresh();const [a]=g.players;const el=put(g,a,C('Eladamri, Korvecdal'));put(g,a,bear());put(g,a,bear());W(g,a,1,'Forest');const big=cr('Big','{6}',6,6,6);a.hand=[big];const o=abO(g,a,el.card,/eladamri/);k('your turn + 2 untapped: option',!!o);if(o){await g.activate(a,o);await flush(g);k('creature from hand onto battlefield',a.battlefield.some(x=>x.card===big));k('two creatures tapped',a.battlefield.filter(x=>x.card.name==='Bear'&&x.tapped).length===2);}}
 {const g=fresh();const [a]=g.players;const el=put(g,a,C('Eladamri, Korvecdal'));put(g,a,bear());put(g,a,bear());W(g,a,1,'Forest');g.active=1;k("opponent's turn: no option",!abO(g,a,el.card,/eladamri/));}
 {const g=fresh();const [a]=g.players;const el=put(g,a,C('Eladamri, Korvecdal'));put(g,a,bear());W(g,a,1,'Forest');k('only 1 other untapped creature: no option',!abO(g,a,el.card,/eladamri/));}
 {const g=fresh();const [a]=g.players;const el=put(g,a,C('Eladamri, Korvecdal'));put(g,a,bear());put(g,a,bear());W(g,a,1,'Forest');const ld=L('Forest');a.hand=[];lib(a,[ld]);const o=abO(g,a,el.card,/eladamri/);if(o){await g.activate(a,o);await flush(g);}k('revealed land stays put',a.library.includes(ld));}});

// ===== Marwyn
// ENGINE BUG (fixed 1 mana)
await T('Marwyn, the Nurturer',async()=>{const k=K('Marwyn');const g=fresh();const [a]=g.players;const m=put(g,a,C('Marwyn, the Nurturer'));m.counters=3;g.refreshStatics();const pw=g.powerOf(a,m);const s=g.manaSrcs(a).find(s=>s.b===m);k('adds G equal to power',s&&s.amount===pw,`${s&&s.amount} vs ${pw}`);});

// ===== Phyrexian Metamorph
await T('Phyrexian Metamorph',async()=>{const k=K('Phyrexian Metamorph');{const g=fresh();const [a,b]=g.players;const v=opp(g,b,S('Big','Creature — Ape','{4}','',6,6,4));const pm=await g.enterPerm(a,C('Phyrexian Metamorph'));k('copies creature',pm.card.name==='Big');
  // ENGINE BUG (artifact type not added)
  k('copy is also an artifact',pm.card.isArtifact&&/Artifact/.test(pm.card.type),pm.card.type);}
 {const g=fresh();const [a,b]=g.players;opp(g,b,S('Ench','Enchantment','{4}','',0,0,4));const pm=await g.enterPerm(a,C('Phyrexian Metamorph'));k('only an enchantment: not copied',pm.card.name==='Phyrexian Metamorph',pm.card.name);}});

// ===== Airbender Ascension
// ENGINE BUG (quest-counter condition ignored)
await T('Airbender Ascension',async()=>{const k=K('Airbender Ascension');for(const q of [0,4]){const g=fresh();const [a]=g.players;const aa=put(g,a,C('Airbender Ascension'));aa.quest=q;const x=put(g,a,bear());await g.fireTriggers(a,'end');await flush(g);const flick=!a.battlefield.includes(x)&&a.battlefield.some(y=>y.card===x.card||(y.card.orig||y.card)===x.card);
  k(q?'4 quest counters: flickered':'0 quest counters: not flickered',q?flick:a.battlefield.includes(x));}
 {const g=fresh();const [a]=g.players;const aa=put(g,a,C('Airbender Ascension'));const e=await g.enterPerm(a,bear());await g.creatureEntered(a,e);await flush(g);const o=await g.enterPerm(g.players[1],bear());await g.creatureEntered(g.players[1],o);await flush(g);k('quest counter only for your creature',aa.quest===1,String(aa.quest));}});

// ===== General Tazri
// ENGINE BUG (pumps all creatures by creature count)
await T('General Tazri',async()=>{const k=K('General Tazri');const g=fresh();const [a]=g.players;const tz=put(g,a,C('General Tazri'));tz.card.colors=['W'];const al=put(g,a,S('Ally','Creature — Human Ally','{R}','',1,1,1));al.card.colors=['R'];const br=put(g,a,bear());br.card.colors=['G'];W(g,a,1,'Plains');W(g,a,1,'Island');W(g,a,1,'Swamp');W(g,a,1,'Mountain');W(g,a,1,'Forest');const o=g.abilityOptions(a,{}).find(x=>x.card===tz.card&&x.ab.cost.total===5);k('option',!!o);
  if(o){await g.activate(a,o);await flush(g);g.refreshStatics();k('Ally gets +2/+2 (W,R among Allies)',g.powerOf(a,al)===3,String(g.powerOf(a,al)));k('non-Ally not pumped',g.powerOf(a,br)===2,String(g.powerOf(a,br)));}});

// ===== Toph
await T('Toph, Hardheaded Teacher',async()=>{const k=K('Toph');{const g=fresh();const [a]=g.players;const s=ins();a.graveyard.push(s);a.hand=[];const t=C('Toph, Hardheaded Teacher');const pm=put(g,a,t);await g.runOps(a,t.etbOps,t,{perm:pm});
  // ENGINE BUG (returns without discarding)
  k('empty hand: nothing returned',a.graveyard.includes(s));}
 {const g=fresh();const [a]=g.players;const s=ins();a.graveyard.push(s);const j=L('Forest');a.hand=[j];const t=C('Toph, Hardheaded Teacher');const pm=put(g,a,t);await g.runOps(a,t.etbOps,t,{perm:pm});k('discard + return instant',a.hand.includes(s)&&a.graveyard.includes(j),a.hand.map(c=>c.name).join());}
 const run=async(lesson)=>{const g=fresh();noResp(g);const [a]=g.players;put(g,a,C('Toph, Hardheaded Teacher'));W(g,a,1,'Island');const sp=S('Study',lesson?'Sorcery — Lesson':'Sorcery','{U}','You gain 1 life.',0,0,1);a.hand=[sp];await g.cast(a,sp,'hand');await flush(g);return a.battlefield.filter(x=>x.card.earthbent).map(x=>x.counters);};
 {const r=await run(false);k('non-Lesson: earthbend 1',r.length===1&&r[0]===1,JSON.stringify(r));}
 // ENGINE BUG (Lesson rider ignored)
 {const r=await run(true);k('Lesson: 2 counters',r.length===1&&r[0]===2,JSON.stringify(r));}});

// ===== Weathered Wayfarer
await T('Weathered Wayfarer',async()=>{const k=K('Weathered Wayfarer');{const g=fresh();const [a,b]=g.players;const ww=put(g,a,C('Weathered Wayfarer'));W(g,a,1,'Plains');W(g,b,3,'Forest');k('opponent has more lands: option',!!abO(g,a,ww.card));}
 // ENGINE BUG (activation restriction ignored)
 {const g=fresh();const [a,b]=g.players;const ww=put(g,a,C('Weathered Wayfarer'));W(g,a,2,'Plains');W(g,b,2,'Forest');k('no opponent has more lands: no option',!abO(g,a,ww.card));}});

// ===== Jegantha
// ENGINE BUG (WUBRG treated as 5 any-colour mana usable for generic)
await T('Jegantha, the Wellspring',async()=>{const k=K('Jegantha');const g=fresh();const [a]=g.players;const j=put(g,a,C('Jegantha, the Wellspring'));const gen=cr('Gen','{3}',3);k("can't pay generic {3}",!g.canPayCost(a,g.costOf(a,gen,'hand')));const gg=cr('GG','{G}{G}',2);k("can't pay {G}{G} (only one G)",!g.canPayCost(a,g.costOf(a,gg,'hand')));const wubrg=cr('All','{W}{U}{B}{R}{G}',5);k('pays {W}{U}{B}{R}{G}',g.canPayCost(a,g.costOf(a,wubrg,'hand')));});

// ===== Flare of Malice
await T('Flare of Malice',async()=>{const k=K('Flare of Malice');const g=fresh();noResp(g);const [a,b,c]=g.players;const b5=opp(g,b,cr('Five','{5}',5)),b2=opp(g,b,bear());const cpw=opp(g,c,C('Teferi, Who Slows the Sunset'));const c3=opp(g,c,cr('Three','{3}',3));const s=C('Flare of Malice');a.hand=[s];W(g,a,4,'Swamp');a.ai.chooseAlt=()=>null;await g.cast(a,s,'hand',null,{instant:true});await flush(g);
  k('greatest MV creature sacrificed',!b.battlefield.includes(b5)&&b.battlefield.includes(b2));k('planeswalker with greatest MV sacrificed',!c.battlefield.includes(cpw)&&c.battlefield.includes(c3));});

// ===== Satoru
await T('Satoru, the Infiltrator',async()=>{const k=K('Satoru');{const g=fresh();const [a]=g.players;put(g,a,C('Satoru, the Infiltrator'));const h0=a.hand.length;const e=await g.enterPerm(a,bear());await g.creatureEntered(a,e);await flush(g);k('put onto battlefield (not cast): draw',a.hand.length===h0+1);}
 {const g=fresh();noResp(g);const [a]=g.players;put(g,a,C('Satoru, the Infiltrator'));const c=bear();a.hand=[c];W(g,a,2,'Forest');const h0=a.hand.length-1;await g.cast(a,c,'hand');await flush(g);k('cast with mana: no draw',a.hand.length===h0,String(a.hand.length-h0));}
 {const g=fresh();const [a]=g.players;put(g,a,C('Satoru, the Infiltrator'));const h0=a.hand.length;await g.runOps(a,[{op:'tokens',n:1,pt:[1,1],kw:[]}],{name:'T'},{});await flush(g);k('token: no draw',a.hand.length===h0);}
 {const g=fresh();const [a,b]=g.players;put(g,a,C('Satoru, the Infiltrator'));const h0=a.hand.length;const e=await g.enterPerm(b,bear());await g.creatureEntered(b,e);await flush(g);k("opponent's creature: no draw",a.hand.length===h0);}});

// ===== Triton Shorestalker
await T('Triton Shorestalker',async()=>{const k=K('Triton Shorestalker');const g=fresh();const [a,b]=g.players;const t=put(g,a,C('Triton Shorestalker'));const v=opp(g,b,bear());const x=put(g,a,bear());k("can't be blocked",!g.canBlock(v,t));k('others can',g.canBlock(v,x));});

// ===== Poison-Tip Archer
await T('Poison-Tip Archer',async()=>{const k=K('Poison-Tip Archer');const g=fresh();const [a,b,c]=g.players;const pa=put(g,a,C('Poison-Tip Archer'));const x=opp(g,b,bear());await g.destroy(b,x);await flush(g);k("opponent's creature dies: each opp loses 1",b.life===39&&c.life===39,`${b.life},${c.life}`);
  const y=put(g,a,bear());await g.destroy(a,y);await flush(g);k('own other creature dies: each opp loses 1',b.life===38&&c.life===38);await g.destroy(a,pa);await flush(g);k('Archer itself dies: no trigger',b.life===38&&c.life===38,`${b.life},${c.life}`);});

// ===== Teferi, Who Slows the Sunset
// ENGINE BUG (+1 only gains life; -7 draws immediately, no emblem) [test fixed: +1 picks only ONE creature, so it can't both untap my creature and tap the opponent's; the tap check now uses an opponent's artifact]
await T('Teferi, Who Slows the Sunset',async()=>{const k=K('Teferi WSS');{const g=fresh();const [a,b]=g.players;const t=put(g,a,C('Teferi, Who Slows the Sunset'));t.pwTurn=-1;const ml=put(g,a,L('Forest'));ml.tapped=true;const mc=put(g,a,bear());mc.tapped=true;const oc=opp(g,b,bear());const oa=opp(g,b,S('Rock','Artifact','{2}','',0,0,2));const l0=a.life;const o=g.abilityOptions(a,{}).find(o=>o.perm===t&&o.ab.loyalty===1);await g.activate(a,o);await flush(g);
  k('+1: gain 2',a.life===l0+2);k('+1: untaps my land and creature',!ml.tapped&&!mc.tapped,`${ml.tapped},${mc.tapped}`);k("+1: taps opponent's artifact",oa.tapped);k("+1: only one creature chosen (opponent's creature untapped)",!oc.tapped);}
 {const g=fresh();const [a,b]=g.players;const t=put(g,a,C('Teferi, Who Slows the Sunset'));t.loyalty=8;t.pwTurn=-1;const h0=a.hand.length;const o=g.abilityOptions(a,{}).find(o=>o.perm===t&&o.ab.loyalty===-7);await g.activate(a,o);await flush(g);k('-7: no immediate draw',a.hand.length===h0,String(a.hand.length-h0));
  const h1=a.hand.length;g.active=1;await g.fireTriggers(b,'drawStep');await flush(g);k("-7 emblem: draw during opponent's draw step",a.hand.length===h1+1,String(a.hand.length-h1));}});

// ===== Host of the Hereafter
// ENGINE BUG (dies triggers have no ops)
await T('Host of the Hereafter',async()=>{const k=K('Host of the Hereafter');{const g=fresh();const [a]=g.players;put(g,a,C('Host of the Hereafter'));const x=put(g,a,bear());x.counters=2;const y=put(g,a,bear());await g.destroy(a,x);await flush(g);k('creature with 2 counters dies: counters moved',y.counters===2,String(y.counters));}
 {const g=fresh();const [a]=g.players;const h=put(g,a,C('Host of the Hereafter'));h.counters=2;const y=put(g,a,bear());await g.destroy(a,h);await flush(g);k('Host itself dies with 2 counters: moved',y.counters===2,String(y.counters));}
 {const g=fresh();const [a]=g.players;const h=put(g,a,C('Host of the Hereafter'));const x=put(g,a,bear());await g.destroy(a,x);await flush(g);k('no counters: nothing',!h.counters);}});

// ===== Moraug
await T('Moraug, Fury of Akoum',async()=>{const k=K('Moraug');{const g=fresh();const [a,b]=g.players;put(g,a,C('Moraug, Fury of Akoum'));const x=put(g,a,bear()),y=put(g,a,bear());await g.attackTriggers(a,[{attacker:x,defender:b}]);g.refreshStatics();k('attacked once: +1/+0',g.powerOf(a,x)===3&&g.toughOf(a,x)===2,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);k('did not attack: +0',g.powerOf(a,y)===2);await g.attackTriggers(a,[{attacker:x,defender:b}]);g.refreshStatics();k('attacked twice: +2/+0',g.powerOf(a,x)===4);}
 {const g=fresh();const [a]=g.players;put(g,a,C('Moraug, Fury of Akoum'));a.extraCombat=0;await PL(g,a,L('Mountain'));await flush(g);k('main phase landfall: extra combat',!!a.extraCombat);}
 {const g=fresh();const [a]=g.players;put(g,a,C('Moraug, Fury of Akoum'));a.extraCombat=0;g.phase='combat';const pm=put(g,a,L('Mountain'));await g.landfall(a,pm);await flush(g);k('landfall outside main phase: no extra combat',!a.extraCombat);}});

// ===== Blind Obedience / Dauntless Dismantler
await T('Blind Obedience',async()=>{const k=K('Blind Obedience');const g=fresh();const [a,b]=g.players;put(g,a,C('Blind Obedience'));const oc=await g.enterPerm(b,bear());const oa=await g.enterPerm(b,S('Art','Artifact','{1}','',0,0,1));const ol=await g.enterPerm(b,L('Forest'));const mc=await g.enterPerm(a,bear());
  k("opponent's creature tapped",oc.tapped);k("opponent's artifact tapped",oa.tapped);k("opponent's land untapped",!ol.tapped);k('own creature untapped',!mc.tapped);});
await T('Dauntless Dismantler',async()=>{const k=K('Dauntless Dismantler');{const g=fresh();const [a,b]=g.players;put(g,a,C('Dauntless Dismantler'));const oa=await g.enterPerm(b,S('Art','Artifact','{1}','',0,0,1));const oc=await g.enterPerm(b,bear());const ma=await g.enterPerm(a,S('Art','Artifact','{1}','',0,0,1));k("opponent's artifact tapped",oa.tapped);k("opponent's creature untapped",!oc.tapped);k('own artifact untapped',!ma.tapped);}
 {const g=fresh();const [a,b]=g.players;const dd=put(g,a,C('Dauntless Dismantler'));W(g,a,3,'Plains');const o1=opp(g,b,S('A1','Artifact','{1}','',0,0,1)),o1b=opp(g,b,S('A1b','Artifact','{1}','',0,0,1)),o2=opp(g,b,S('A2','Artifact','{2}','',0,0,2));const m1=put(g,a,S('M1','Artifact','{1}','',0,0,1));const o=abO(g,a,dd.card,/dismantle/);k('option',!!o);
  if(o){await g.activate(a,o);await flush(g);k('X=1: each MV1 artifact destroyed (incl. own)',!b.battlefield.includes(o1)&&!b.battlefield.includes(o1b)&&!a.battlefield.includes(m1));k('MV2 artifact survives',b.battlefield.includes(o2));k('sacrificed',!a.battlefield.includes(dd));}}});

// ===== Rumor Gatherer
// ENGINE BUG (draws every time, scries too)
await T('Rumor Gatherer',async()=>{const k=K('Rumor Gatherer');const g=fresh();const [a,b]=g.players;put(g,a,C('Rumor Gatherer'));const h0=a.hand.length;const e1=await g.enterPerm(a,bear());await g.creatureEntered(a,e1);await flush(g);k('first: scry only, no draw',a.hand.length===h0,String(a.hand.length-h0));
  const e2=await g.enterPerm(a,bear());await g.creatureEntered(a,e2);await flush(g);k('second this turn: draw',a.hand.length===h0+1,String(a.hand.length-h0));const e3=await g.enterPerm(a,bear());await g.creatureEntered(a,e3);await flush(g);k('third: scry only',a.hand.length===h0+1,String(a.hand.length-h0));
  const h1=a.hand.length;const oe=await g.enterPerm(b,bear());await g.creatureEntered(b,oe);await flush(g);k("opponent's creature: nothing",a.hand.length===h1);});

// ===== Ayara
await T('Ayara, First of Locthwain',async()=>{const k=K('Ayara');const blk=()=>{const c=S('Blk','Creature — Zombie','{1}{B}','',2,2,2);c.colors=['B'];return c;};const g=fresh();const [a,b,c]=g.players;const ay=C('Ayara, First of Locthwain');const ap=await g.enterPerm(a,ay);await g.creatureEntered(a,ap);await flush(g);k('Ayara enters: drain',b.life===39&&c.life===39&&a.life===41,`${b.life} ${a.life}`);
  const x=await g.enterPerm(a,blk());await g.creatureEntered(a,x);await flush(g);k('black creature: drain',b.life===38&&a.life===42);const nb=await g.enterPerm(a,bear());await g.creatureEntered(a,nb);await flush(g);k('non-black: nothing',b.life===38&&a.life===42);const ob=await g.enterPerm(b,blk());await g.creatureEntered(b,ob);await flush(g);k("opponent's black creature: nothing",c.life===38&&a.life===42,`${c.life} ${a.life}`);});

// ===== Merciless Executioner
await T('Merciless Executioner',async()=>{const k=K('Merciless Executioner');{const g=fresh();const [a,b,c]=g.players;const x=put(g,a,bear());const v=opp(g,b,bear());const me=C('Merciless Executioner');const pm=put(g,a,me);await g.runOps(a,me.etbOps,me,{perm:pm});await flush(g);k('each player sacrifices one (opponent)',!b.battlefield.includes(v));k('you sacrifice one',a.battlefield.filter(y=>y.card.isCreature).length===1);}
 // ENGINE BUG (sacrifice implemented as destroy)
 {const g=fresh();const [a,b]=g.players;const v=opp(g,b,S('Ind','Creature — Golem','{3}','Indestructible',3,3,3));const me=C('Merciless Executioner');const pm=put(g,a,me);await g.runOps(a,me.etbOps,me,{perm:pm});await flush(g);k('indestructible creature is still sacrificed',!b.battlefield.includes(v));}});

// ===== Lord of the Void
await T('Lord of the Void',async()=>{const k=K('Lord of the Void');{const g=fresh();const [a,b]=g.players;const lv=put(g,a,C('Lord of the Void'));const deep=cr('Deep','{5}',5);const c2=cr('Shallow','{2}',2);b.library=[deep,...Array(3).fill(0).map(()=>L('Forest')),c2,...Array(5).fill(0).map(()=>L('Forest'))];await cd(g,a,b,lv,7);k('creature among top 7 put under your control',a.battlefield.some(x=>x.card===c2));k('card below top 7 untouched',b.library.includes(deep));k('7 cards left library',b.library.length===3,String(b.library.length));}
 {const g=fresh();const [a,b]=g.players;const lv=put(g,a,C('Lord of the Void'));b.library=Array(9).fill(0).map(()=>L('Forest'));const n0=a.battlefield.length;await cd(g,a,b,lv,7);k('no creature: nothing enters',a.battlefield.length===n0);}});

// ===== Haliya
// ENGINE BUG (end-step draw unconditional)
await T('Haliya, Guided by Light',async()=>{const k=K('Haliya');{const g=fresh();const [a]=g.players;put(g,a,C('Haliya, Guided by Light'));const h0=a.hand.length;await g.fireTriggers(a,'end');await flush(g);k('no life gained: no draw',a.hand.length===h0,String(a.hand.length-h0));}
 {const g=fresh();const [a]=g.players;put(g,a,C('Haliya, Guided by Light'));await g.changeLife(a,3,{name:'x'});const h0=a.hand.length;await g.fireTriggers(a,'end');await flush(g);k('gained 3: draw',a.hand.length===h0+1);}
 {const g=fresh();const [a]=g.players;put(g,a,C('Haliya, Guided by Light'));await g.changeLife(a,2,{name:'x'});const h0=a.hand.length;await g.fireTriggers(a,'end');await flush(g);k('gained 2: no draw',a.hand.length===h0,String(a.hand.length-h0));}});

// ===== Kwain
// ENGINE BUG (only controller draws; no life)
await T('Kwain, Itinerant Meddler',async()=>{const k=K('Kwain');const g=fresh();const [a,b]=g.players;const kw=put(g,a,C('Kwain, Itinerant Meddler'));const h0=a.hand.length,l0=a.life,hb=b.hand.length,lb=b.life;const o=abO(g,a,kw.card);await g.activate(a,o);await flush(g);k('you draw and gain 1',a.hand.length===h0+1&&a.life===l0+1,`${a.hand.length-h0} ${a.life-l0}`);k('opponent who draws gains 1',b.hand.length===hb+1&&b.life===lb+1||b.hand.length===hb&&b.life===lb,`${b.hand.length-hb} ${b.life-lb}`);k('opponents may draw (AI opponent drew)',b.hand.length===hb+1);});

// ===== Disrupt Decorum
await T('Disrupt Decorum',async()=>{const k=K('Disrupt Decorum');const g=fresh();noResp(g);const [a,b]=g.players;const v=opp(g,b,bear());const m=put(g,a,bear());const s=C('Disrupt Decorum');a.hand=[s];W(g,a,4,'Mountain');await g.cast(a,s,'hand');await flush(g);k("opponent's creature goaded",v.goadedBy===a);k('own creature not goaded',!m.goadedBy);});

// ===== Clever Impersonator
await T('Clever Impersonator',async()=>{const k=K('Clever Impersonator');{const g=fresh();const [a,b]=g.players;opp(g,b,S('Ench','Enchantment','{4}','',0,0,4));const pm=await g.enterPerm(a,C('Clever Impersonator'));k('copies nonland enchantment',pm.card.name==='Ench');}
 {const g=fresh();const [a,b]=g.players;opp(g,b,C('Rockfall Vale'));const pm=await g.enterPerm(a,C('Clever Impersonator'));k('lands not copied',pm.card.name==='Clever Impersonator',pm.card.name);}});

// ===== Thrasios
// ENGINE BUG (always draws; lands not put onto battlefield)
await T('Thrasios, Triton Hero',async()=>{const k=K('Thrasios');{const g=fresh();const [a]=g.players;const th=put(g,a,C('Thrasios, Triton Hero'));W(g,a,4,'Island');a.library=Array(10).fill(0).map(()=>L('Forest'));const h0=a.hand.length,n0=a.battlefield.filter(x=>x.card.isLand).length;const o=abO(g,a,th.card);await g.activate(a,o);await flush(g);const nl=a.battlefield.filter(x=>x.card.isLand);
  k('top is land: onto battlefield tapped, no draw',nl.length===n0+1&&nl[nl.length-1].tapped&&a.hand.length===h0,`lands +${nl.length-n0} hand +${a.hand.length-h0}`);}
 {const g=fresh();const [a]=g.players;const th=put(g,a,C('Thrasios, Triton Hero'));W(g,a,4,'Island');a.library=Array(10).fill(0).map(()=>bear());const h0=a.hand.length,n0=a.battlefield.length;const o=abO(g,a,th.card);await g.activate(a,o);await flush(g);k('top nonland: draw',a.hand.length===h0+1&&a.battlefield.length===n0);}});

// ===== Mental Misstep
await T('Mental Misstep',async()=>{const k=K('Mental Misstep');for(const mv of [1,2]){const g=fresh();const [a,b]=g.players;const v=S('Sp'+mv,'Sorcery','{'+mv+'}','You gain 1 life.',0,0,mv);const sp=spell(g,b,v);const mm=C('Mental Misstep');a.hand=[mm];W(g,a,1,'Island');const offered=g.stackOptions(a).some(o=>o.card===mm);
  if(mv===1){k('MV1 spell: can respond',offered);await g.cast(a,mm,'hand',{spell:sp},{instant:true});await flush(g);k('MV1 spell countered',!!sp.countered);}else k('MV2 spell: not a legal target (no response offered)',!offered);}});

// ===== Training Grounds
await T('Training Grounds',async()=>{const k=K('Training Grounds');const g=fresh();const [a,b]=g.players;put(g,a,C('Training Grounds'));const c3=put(g,a,S('C3','Creature — Elf','{1}','{3}: You gain 1 life.',1,1,1));const c1=put(g,a,S('C1','Creature — Elf','{1}','{1}: You gain 1 life.',1,1,1));const c2g=put(g,a,S('C2G','Creature — Elf','{1}','{1}{G}: You gain 1 life.',1,1,1));const ar=put(g,a,S('A3','Artifact','{1}','{3}: You gain 1 life.',0,0,1));const oc=opp(g,b,S('O3','Creature — Elf','{1}','{3}: You gain 1 life.',1,1,1));
  const cost=(p,pm)=>{const ab=pm.card.abilities[0];return ab?g.abilityCost(p,pm.card,ab,pm).total:null;};
  k('{3} creature ability -> {1}',cost(a,c3)===1,String(cost(a,c3)));k('{1} stays {1} (min one mana)',cost(a,c1)===1);k('{1}{G} -> {G}',cost(a,c2g)===1,String(cost(a,c2g)));k('noncreature artifact not reduced',cost(a,ar)===3);k("opponent's creature not reduced",cost(b,oc)===3);});

console.log(pass+' passed, '+fails+' failed');})();
