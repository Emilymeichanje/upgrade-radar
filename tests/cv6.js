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
const S=(n,ty,mana,o,p,t)=>tagCard(mk(n,ty,mana,o,0,p,t));
const SC=(n,ty,mana,o,cmc,p,t)=>tagCard(mk(n,ty,mana,o,cmc,p,t));
const PL=async(g,a,n='Forest')=>{const f=L(n);a.hand.push(f);await g.playLand(a,f);};
const abO=(g,a,card,re)=>g.abilityOptions(a,{}).find(x=>x.card===card&&(!re||re.test(x.ab.label||'')||x.ab.ops.some(o=>re.test(o.op))));
const cd=async(g,a,b,att,dmg)=>{g._cdDefender=b;g._cdDmg=dmg;await g.combatDamageTriggers(a,att);await flush(g);};
const ent=async(g,p,c)=>{const pm=await g.enterPerm(p,c);await g.creatureEntered(p,pm);await flush(g);return pm;};
const big=(p=4,t=4,n='Ogre')=>S(n,'Creature — Ogre','{3}','',p,t);
const kws=(g,pm)=>{g.refreshStatics();return pm.card.kw||[];};
const sorc=()=>SC('Divination','Sorcery','{2}{U}','Draw two cards.',3);
const opps=(g,a)=>g.opponentsOf(a).reduce((s,q)=>s+q.life,0);

// ---- Enduring Innocence
await T('Enduring Innocence: power<=2 other creature you control, once per turn',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Enduring Innocence'));const h0=a.hand.length;
  await ent(g,a,big(3,3));ok('Enduring Innocence: 3-power creature → no draw',a.hand.length===h0,String(a.hand.length-h0));
  await ent(g,b,bear());ok("Enduring Innocence: opponent's 2/2 → no draw",a.hand.length===h0);
  await ent(g,a,bear());ok('Enduring Innocence: own 2/2 → draw',a.hand.length===h0+1,String(a.hand.length-h0));
  await ent(g,a,bear());ok('Enduring Innocence: second 2/2 same turn → no draw',a.hand.length===h0+1,String(a.hand.length-h0));
  g.turn++;await ent(g,a,bear());ok('Enduring Innocence: next turn → draws again',a.hand.length===h0+2,String(a.hand.length-h0));});
await T('Enduring Innocence: itself entering is not "other"',async()=>{const g=fresh();const [a]=g.players;const h0=a.hand.length;await ent(g,a,C('Enduring Innocence'));ok('Enduring Innocence: own ETB → no draw',a.hand.length===h0);});
await T('Enduring Innocence: dies as creature → returns as enchantment; not again',async()=>{const g=fresh();const [a]=g.players;const ei=put(g,a,C('Enduring Innocence'));await g.destroy(a,ei);await flush(g);const r=a.battlefield.find(x=>x.card.name==='Enduring Innocence');ok('Enduring Innocence: returned as non-creature enchantment',r&&!r.card.isCreature&&r.card.isEnchantment);
  if(r){await g.destroy(a,r);await flush(g);ok('Enduring Innocence: enchantment going to graveyard does not return',!a.battlefield.some(x=>x.card.name==='Enduring Innocence')&&a.graveyard.some(c=>c.name==='Enduring Innocence'));}});

// ---- Skrelv's Hive
await T("Skrelv's Hive upkeep",async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C("Skrelv's Hive"));const l0=a.life;await g.fireTriggers(a,'upkeep');await flush(g);const m=a.battlefield.find(x=>x.card.token&&/Mite/.test(x.card.type));ok("Skrelv's Hive: lose 1 and Mite token",a.life===l0-1&&!!m);
  if(m){ok("Skrelv's Hive: Mite is 1/1 artifact creature",m.card.isArtifact&&m.card.isCreature&&g.powerOf(a,m)===1);/* ENGINE BUG */ ok("Skrelv's Hive: Mite has toxic 1",!!(m.card.statics&&m.card.statics.toxic===1)||(m.card.kw||[]).includes('toxic'),JSON.stringify(m.card.statics));const atk=opp(g,b,bear());/* ENGINE BUG */ ok("Skrelv's Hive: Mite can't block",!g.canBlock(m,atk));}
  const l1=a.life;await g.fireTriggers(b,'upkeep');await flush(g);ok("Skrelv's Hive: opponent's upkeep → nothing",a.life===l1);});
await T("Skrelv's Hive corrupted lifelink",async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,C("Skrelv's Hive"));const tx=put(g,a,S('Toxo','Creature — Phyrexian','{1}','Toxic 1',1,1));const nb=put(g,a,bear());b.poison=2;ok("Skrelv's Hive: 2 poison → no lifelink",!kws(g,tx).includes('lifelink'));b.poison=3;ok("Skrelv's Hive: 3 poison → toxic creature lifelink",kws(g,tx).includes('lifelink'));ok("Skrelv's Hive: non-toxic creature no lifelink",!kws(g,nb).includes('lifelink'));});

// ---- Bag of Holding
await T('Bag of Holding: you discard → exile; opponent discards → no',async()=>{const g=fresh();const [a,b]=g.players;const bag=put(g,a,C('Bag of Holding'));const x=bear();a.hand.push(x);await g.discardCard(a,x);await flush(g);ok('Bag of Holding: discarded card exiled',a.exile.includes(x)&&!a.graveyard.includes(x));
  const y=bear();b.hand.push(y);await g.discardCard(b,y);await flush(g);ok("Bag of Holding: opponent's discard stays in their graveyard",b.graveyard.includes(y));});
await T('Bag of Holding: discard via its own loot ability is exiled',async()=>{const g=fresh();const [a]=g.players;const bag=put(g,a,C('Bag of Holding'));W(g,a,2,'Island');a.hand=[bear()];const o=g.abilityOptions(a,{}).find(o=>o.card===bag.card&&o.ab.ops.some(x=>x.op==='discard'));ok('Bag of Holding: loot option',!!o);if(o){const gy0=a.graveyard.length;await g.activate(a,o);await flush(g);/* ENGINE BUG */ ok('Bag of Holding: card discarded by ability goes to exile not graveyard',a.graveyard.length===gy0&&a.exile.length>=1,`gy+${a.graveyard.length-gy0} ex=${a.exile.length}`);}});

// ---- Emeria
await T('Emeria, the Sky Ruin: needs seven Plains',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Emeria, the Sky Ruin'));W(g,a,6,'Plains');const x=bear();a.graveyard.push(x);await g.fireTriggers(a,'upkeep');await flush(g);/* ENGINE BUG */ ok('Emeria: 6 Plains → no reanimation',a.graveyard.includes(x));
  W(g,a,1,'Plains');await g.fireTriggers(a,'upkeep');await flush(g);ok('Emeria: 7 Plains → creature returns',a.battlefield.some(p=>p.card===x));});

// ---- Serra Paragon
await T('Serra Paragon: permanent mv<=3 from graveyard once per turn',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Serra Paragon'));const x=bear(),y=bear();const fat=SC('Fatty','Creature — Beast','{3}{G}','',4,4,4);const ins=SC('Shock','Instant','{R}','Shock deals 2 damage to any target.',1);a.graveyard.push(x,y,fat,ins);
  ok('Serra Paragon: mv4 not castable from graveyard',!g.gyGrant(a,fat));ok('Serra Paragon: instant not castable from graveyard',!g.gyGrant(a,ins));ok('Serra Paragon: mv2 creature castable',!!g.gyGrant(a,x));
  g.active=1;ok("Serra Paragon: not on opponent's turn",!g.gyGrant(a,x));g.active=0;
  W(g,a,4,'Forest');await g.cast(a,x,'gy');await flush(g);const pm=a.battlefield.find(p=>p.card===x);ok('Serra Paragon: cast from graveyard',!!pm);ok('Serra Paragon: second permanent same turn not allowed',!g.gyGrant(a,y));
  if(pm){const l0=a.life;await g.destroy(a,pm);await flush(g);ok('Serra Paragon: it dies → exiled and gain 2',a.exile.includes(x)&&a.life===l0+2,`ex=${a.exile.includes(x)} dl=${a.life-l0}`);}
  g.turn++;ok('Serra Paragon: next turn allowed again',!!g.gyGrant(a,y));});
await T('Serra Paragon: land from graveyard counts as the once, and gains the exile clause',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Serra Paragon'));const f=L('Forest');const x=bear();a.graveyard.push(f,x);ok('Serra Paragon: land playable from graveyard',g.canLandFromGy(a,f));await g.playLand(a,f);const pm=a.battlefield.find(p=>p.card===f);ok('Serra Paragon: land played from graveyard',!!pm);ok('Serra Paragon: after land, no permanent spell from gy this turn',!g.gyGrant(a,x));
  // ENGINE BUG
  if(pm){const l0=a.life;await g.destroy(a,pm);await flush(g);ok('Serra Paragon: land played this way → exiled + 2 life when put into graveyard',a.exile.includes(f)&&a.life===l0+2,`ex=${a.exile.includes(f)} dl=${a.life-l0}`);}});

// ---- Vanguard of the Restless
await T('Vanguard of the Restless: Spirits +1/+1 per commander cast',async()=>{const g=fresh();const [a]=g.players;const v=put(g,a,C('Vanguard of the Restless'));const sp=put(g,a,S('Spook','Creature — Spirit','{1}','',1,1));const nb=put(g,a,bear());g.refreshStatics();ok('Vanguard: 0 casts → no bonus',g.powerOf(a,sp)===1&&g.powerOf(a,v)===2);a.cmdCasts=2;g.refreshStatics();ok('Vanguard: 2 casts → Spirit +2/+2',g.powerOf(a,sp)===3&&g.toughOf(a,sp)===3,`${g.powerOf(a,sp)}/${g.toughOf(a,sp)}`);ok('Vanguard: non-Spirit unaffected',g.powerOf(a,nb)===2);
  const os=opp(g,g.players[1],S('Spook2','Creature — Spirit','{1}','',1,1));g.refreshStatics();ok("Vanguard: opponent's Spirit unaffected",g.powerOf(g.players[1],os)===1);});
await T('Vanguard of the Restless: casting from command zone increments',async()=>{const g=fresh();const [a]=g.players;const v=put(g,a,C('Vanguard of the Restless'));const cm=SC('Boss','Legendary Creature — Spirit','{1}','',1,1,1);cm.isCommander=true;a.command=[cm];W(g,a,3,'Plains');await g.cast(a,cm,'cmd');await flush(g);g.refreshStatics();ok('Vanguard: cast commander once → Vanguard is 3/3',g.powerOf(a,v)===3,String(g.powerOf(a,v)));});

// ---- Doppelgang
await T('Doppelgang: X targets, X copies each',async()=>{const g=fresh();const [a]=g.players;put(g,a,big(5,5,'Alpha'));put(g,a,big(4,4,'Beta'));put(g,a,bear());const d=C('Doppelgang');a.hand=[d];W(g,a,7,'Island');W(g,a,1,'Forest');a.ai.chooseX=()=>2;await g.cast(a,d,'hand');await flush(g);const toks=a.battlefield.filter(p=>p.card.token);ok('Doppelgang X=2: 4 tokens (2 each of 2 permanents)',toks.length===4,String(toks.length));const names=new Set(toks.map(t=>t.card.name));ok('Doppelgang X=2: copies of exactly 2 permanents',names.size===2,[...names].join(','));});
await T('Doppelgang X=1',async()=>{const g=fresh();const [a]=g.players;put(g,a,big(5,5,'Alpha'));put(g,a,bear());const d=C('Doppelgang');a.hand=[d];W(g,a,7,'Island');W(g,a,1,'Forest');a.ai.chooseX=()=>1;await g.cast(a,d,'hand');await flush(g);ok('Doppelgang X=1: 1 token',a.battlefield.filter(p=>p.card.token).length===1);});

// ---- Lifeblood Hydra
await T('Lifeblood Hydra: gain/draw = power when it dies',async()=>{const g=fresh();const [a]=g.players;const h=put(g,a,C('Lifeblood Hydra'));h.counters=3;const tmp=put(g,a,S('Lord','Creature — Elf','{1}','Other creatures you control get +1/+0.',1,1));g.refreshStatics();const pw=g.powerOf(a,h);const l0=a.life,h0=a.hand.length;await g.destroy(a,h);await flush(g);ok('Lifeblood Hydra: gain = power',a.life===l0+pw,`pw=${pw} dl=${a.life-l0}`);ok('Lifeblood Hydra: draw = power',a.hand.length===h0+pw,`dh=${a.hand.length-h0}`);});

// ---- Spectral Denial
await T('Spectral Denial: reduction counts only power>=4 creatures',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,big(4,4));put(g,a,big(4,4,'Ogre2'));W(g,a,1,'Island');const v=spell(g,b,sorc());const sd=C('Spectral Denial');a.hand=[sd];let x=-1;g.hooks.emit=e=>{if(e.type==='cast'&&e.card===sd)x=e.obj.x;};a.ai.chooseX=(gg,me,c,max)=>max;b.ai.payUnless=()=>true;await g.cast(a,sd,'hand',{spell:v},{instant:true});
  // ENGINE BUG
  ok('Spectral Denial: two 4-power creatures + 1 Island → X can be 2',x===2,'x='+x);});
await T('Spectral Denial: small creatures give no reduction',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,bear());put(g,a,bear());W(g,a,1,'Island');const v=spell(g,b,sorc());const sd=C('Spectral Denial');a.hand=[sd];let x=-1;g.hooks.emit=e=>{if(e.type==='cast'&&e.card===sd)x=e.obj.x;};a.ai.chooseX=(gg,me,c,max)=>max;await g.cast(a,sd,'hand',{spell:v},{instant:true});ok('Spectral Denial: two 2/2s + 1 Island → X=0',x===0,'x='+x);});
await T('Spectral Denial: unless pays X (X larger than opponent can pay)',async()=>{const g=fresh();const [a,b]=g.players;W(g,b,3,'Island');const v=spell(g,b,sorc());const sd=C('Spectral Denial');a.hand=[sd];W(g,a,6,'Island');a.ai.chooseX=()=>5;b.ai.payUnless=()=>true;await g.cast(a,sd,'hand',{spell:v},{instant:true});await flush(g);
  // ENGINE BUG
  ok('Spectral Denial X=5: opponent with 3 lands cannot pay → countered',!!v.countered);});
await T('Spectral Denial: unless pays X (X=1 payable)',async()=>{const g=fresh();const [a,b]=g.players;W(g,b,1,'Island');const v=spell(g,b,sorc());const sd=C('Spectral Denial');a.hand=[sd];W(g,a,2,'Island');a.ai.chooseX=()=>1;b.ai.payUnless=()=>true;await g.cast(a,sd,'hand',{spell:v},{instant:true});await flush(g);
  // ENGINE BUG
  ok('Spectral Denial X=1: opponent pays 1 → not countered',!v.countered);});

// ---- Aminatou's Augury
await T("Aminatou's Augury: land onto battlefield, one spell per nonland type",async()=>{const g=fresh();const [a]=g.players;const lib=[L('Island'),L('Forest'),bear(),S('Bear2','Creature — Bear','{1}{G}','',2,2),SC('Rock','Artifact','{1}','',1),SC('Opt1','Instant','{U}','Draw a card.',1),SC('Opt2','Instant','{U}','Draw a card.',1),SC('Ench','Enchantment','{1}','',1)];a.library.push(...lib);const aa=C("Aminatou's Augury");a.hand=[aa];W(g,a,8,'Island');const lands0=a.battlefield.filter(p=>p.card.isLand).length;await g.cast(a,aa,'hand');await flush(g);
  ok("Aminatou's Augury: exactly one land put onto battlefield",a.battlefield.filter(p=>p.card.isLand).length===lands0+1);const crs=a.battlefield.filter(p=>p.card.name==='Bear'||p.card.name==='Bear2').length;ok("Aminatou's Augury: only one creature cast",crs===1,String(crs));ok("Aminatou's Augury: artifact and enchantment cast",a.battlefield.some(p=>p.card.name==='Rock')&&a.battlefield.some(p=>p.card.name==='Ench'));const instCast=[lib[5],lib[6]].filter(c=>!a.exile.includes(c)).length;ok("Aminatou's Augury: only one instant cast",instCast===1,String(instCast));ok("Aminatou's Augury: other land stays exiled",a.exile.some(c=>c.isLand));});

// ---- Molten-Core Maestro
await T('Molten-Core Maestro: counter on instant/sorcery; mana only if 5+ spent',async()=>{const g=fresh();const [a]=g.players;const m=put(g,a,C('Molten-Core Maestro'));const cheap=SC('Opt','Instant','{U}','Draw a card.',1);a.hand=[cheap];W(g,a,1,'Island');await g.cast(a,cheap,'hand');await flush(g);ok('Molten-Core Maestro: +1 counter on instant',m.counters===1);ok('Molten-Core Maestro: 1 mana spent → no mana added',!(a.pool||[]).some(e=>e.c==='R'),JSON.stringify(a.pool));
  const cr=bear();a.hand=[cr];W(g,a,2,'Forest');await g.cast(a,cr,'hand');await flush(g);ok('Molten-Core Maestro: creature spell → no counter',m.counters===1);
  const bigS=SC('Big Sorc','Sorcery','{4}{U}','Draw a card.',5);a.hand=[bigS];W(g,a,5,'Island');a.pool=[];await g.cast(a,bigS,'hand');await flush(g);g.refreshStatics();const pw=g.powerOf(a,m);
  // ENGINE BUG
  ok('Molten-Core Maestro: 5 mana spent → adds R equal to power',(a.pool||[]).filter(e=>e.c==='R').length===pw,`pool=${JSON.stringify(a.pool)} pw=${pw}`);});

// ---- Surge to Victory
await T('Surge to Victory',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());const ins=SC('Fireball','Sorcery','{3}{R}','Draw a card.',4);a.graveyard.push(ins);const sv=C('Surge to Victory');a.hand=[sv];W(g,a,6,'Mountain');await g.cast(a,sv,'hand');await flush(g);
  // ENGINE BUG
  ok('Surge to Victory: exiles target instant/sorcery from graveyard',a.exile.includes(ins));
  // ENGINE BUG
  ok('Surge to Victory: creatures get +X/+0 (X = 4)',g.powerOf(a,x)===6&&g.toughOf(a,x)===2,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);
  const h0=a.hand.length;await cd(g,a,b,x,2);
  // ENGINE BUG
  ok('Surge to Victory: combat damage → cast copy of exiled card (draw)',a.hand.length>h0);});

// ---- Cauldron of Essence
await T('Cauldron of Essence: your creature dies → drain 1',async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,C('Cauldron of Essence'));const x=put(g,a,bear());const l0=a.life,o0=opps(g,a);await g.destroy(a,x);await flush(g);ok('Cauldron of Essence: each opponent loses 1, you gain 1',a.life===l0+1&&opps(g,a)===o0-2);
  const y=opp(g,b,bear());const l1=a.life,o1=opps(g,a);await g.destroy(b,y);await flush(g);ok("Cauldron of Essence: opponent's creature dies → nothing",a.life===l1&&opps(g,a)===o1);
  const art=put(g,a,SC('Rock','Artifact','{1}','',1));const l2=a.life;await g.destroy(a,art);await flush(g);ok('Cauldron of Essence: noncreature artifact → nothing',a.life===l2);});
await T('Cauldron of Essence: activated sorcery speed, sacrifice a creature',async()=>{const g=fresh();const [a]=g.players;const ca=put(g,a,C('Cauldron of Essence'));W(g,a,2,'Swamp');W(g,a,1,'Forest');const tgt=SC('Dead','Creature — Ogre','{4}{B}','',5,5,5);a.graveyard.push(tgt);ok('Cauldron of Essence: no creature to sacrifice → not activatable',!abO(g,a,ca.card));const v=put(g,a,bear());ok('Cauldron of Essence: not at instant speed',!g.abilityOptions(a,{instant:true}).some(o=>o.card===ca.card));g.active=1;ok("Cauldron of Essence: not on opponent's turn",!g.abilityOptions(a,{}).some(o=>o.card===ca.card));g.active=0;const o=abO(g,a,ca.card);ok('Cauldron of Essence: activatable at sorcery speed',!!o);if(o){await g.activate(a,o);await flush(g);ok('Cauldron of Essence: sacrificed and returned',!a.battlefield.includes(v)&&a.battlefield.some(p=>p.card===tgt));}});

// ---- Jarad
await T('Jarad: +1/+1 per creature card in your graveyard',async()=>{const g=fresh();const [a,b]=g.players;const j=put(g,a,C('Jarad, Golgari Lich Lord'));g.refreshStatics();ok('Jarad: empty gy → 2/2',g.powerOf(a,j)===2);a.graveyard.push(bear(),bear(),L('Forest'),sorc());b.graveyard.push(bear());g.refreshStatics();ok('Jarad: 2 creature cards (not lands/sorceries/opponent gy) → 4/4',g.powerOf(a,j)===4&&g.toughOf(a,j)===4,`${g.powerOf(a,j)}/${g.toughOf(a,j)}`);});
await T('Jarad: sacrifice another creature → opponents lose its power',async()=>{const g=fresh();const [a]=g.players;const j=put(g,a,C('Jarad, Golgari Lich Lord'));W(g,a,2,'Swamp');W(g,a,1,'Forest');ok('Jarad: no other creature → not activatable',!g.abilityOptions(a,{}).some(o=>o.card===j.card&&o.ab.sacOther));const v=put(g,a,big(5,3,'Fodder'));const o=g.abilityOptions(a,{}).find(o=>o.card===j.card&&o.ab.sacOther);const o0=opps(g,a);if(o){o.victim=v;await g.activate(a,o);await flush(g);}ok('Jarad: sacrificed Fodder, opponents each lose 5',a.battlefield.includes(j)&&!a.battlefield.includes(v)&&opps(g,a)===o0-10,String(o0-opps(g,a)));});

// ---- Turbulent Fen
await T('Turbulent Fen: tapped unless opponents control 8+ lands',async()=>{const g=fresh();const [a,b,c]=g.players;W(g,b,4,'Island');W(g,c,3,'Island');const f=C('Turbulent Fen');a.hand.push(f);await g.playLand(a,f);const pm=a.battlefield.find(p=>p.card===f);ok('Turbulent Fen: 7 opponent lands → tapped',pm&&pm.tapped);
  const g2=fresh();const [a2,b2,c2]=g2.players;W(g2,b2,4,'Island');W(g2,c2,4,'Island');const f2=C('Turbulent Fen');a2.hand.push(f2);await g2.playLand(a2,f2);const pm2=a2.battlefield.find(p=>p.card===f2);ok('Turbulent Fen: 8 opponent lands (combined) → untapped',pm2&&!pm2.tapped);});

// ---- Fierce Empath
await T('Fierce Empath: creature with mana value 6 or greater',async()=>{const g=fresh();const [a]=g.players;a.library=[SC('Huge','Creature — Beast','{6}','',6,6,6),bear(),bear()];const fe=C('Fierce Empath');const pm=put(g,a,fe);await g.runOps(a,fe.etbOps||[{op:'tutorTo',filter:'creature',dest:'hand',n:1}],fe,{perm:pm});await flush(g);ok('Fierce Empath: finds the 6-drop',a.hand.some(c=>c.name==='Huge'));
  const g2=fresh();const [a2]=g2.players;a2.library=[SC('Five','Creature — Beast','{5}','',5,5,5),bear()];const fe2=C('Fierce Empath');a2.hand=[fe2];W(g2,a2,3,'Forest');await g2.cast(a2,fe2,'hand');await flush(g2);
  // ENGINE BUG
  ok('Fierce Empath: no creature with MV>=6 → finds nothing',a2.hand.length===0,a2.hand.map(c=>c.name).join(','));});

// ---- Shaman of Forgotten Ways
await T('Shaman of Forgotten Ways: mana only for creature spells',async()=>{const g=fresh();const [a]=g.players;const sh=put(g,a,C('Shaman of Forgotten Ways'));const cr=bear();ok('Shaman: can pay for a 2-mana creature',g.canPayCost(a,g.costOf(a,cr,'hand')));
  // ENGINE BUG
  ok('Shaman: cannot pay for a 2-mana sorcery',!g.canPayCost(a,g.costOf(a,SC('Sorc','Sorcery','{1}{G}','Draw a card.',2),'hand')));});
await T('Shaman of Forgotten Ways: Formidable needs total power 8',async()=>{const g=fresh();const [a,b]=g.players;const sh=put(g,a,C('Shaman of Forgotten Ways'));W(g,a,11,'Forest');put(g,a,big(5,5));ok('Shaman: total power 7 → formidable not activatable',!g.abilityOptions(a,{}).some(o=>o.card===sh.card&&o.ab.ops[0].op==='lifeBecomesCreatures'));put(g,a,S('One','Creature — Elf','{1}','',1,1));const o=g.abilityOptions(a,{}).find(o=>o.card===sh.card&&o.ab.ops[0].op==='lifeBecomesCreatures');ok('Shaman: total power 8 → activatable',!!o);if(o){opp(g,b,bear());await g.activate(a,o);await flush(g);ok('Shaman: life totals become creature counts',a.life===3&&b.life===1&&g.players[2].life===0||g.players[2].dead,`${a.life} ${b.life} ${g.players[2].life}`);}});

// ---- Chatterfang
await T('Chatterfang: your tokens get extra squirrels; opponents do not',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Chatterfang, Squirrel General'));await g.runOps(a,[{op:'tokens',n:2,pt:[1,1],kw:[],types:'Soldier'}],{name:'X'},{});await flush(g);ok('Chatterfang: 2 tokens + 2 squirrels',a.battlefield.filter(p=>p.card.name==='Squirrel').length===2&&a.battlefield.filter(p=>p.card.name==='Soldier').length===2);
  await g.runOps(b,[{op:'tokens',n:2,pt:[1,1],kw:[],types:'Soldier'}],{name:'X'},{});await flush(g);ok("Chatterfang: opponent's tokens → no squirrels",!b.battlefield.some(p=>p.card.name==='Squirrel')&&a.battlefield.filter(p=>p.card.name==='Squirrel').length===2);
  await g.makeArtifactTokens(a,'treasure',1);await flush(g);ok('Chatterfang: noncreature token (Treasure) also adds a squirrel',a.battlefield.filter(p=>p.card.name==='Squirrel').length===3);});

// ---- Torment of Hailfire
await T('Torment of Hailfire: repeated X times; each opponent may sac/discard instead',async()=>{const g=fresh(2);const [a,b]=g.players;b.hand=[];b.battlefield=b.battlefield.filter(p=>p.card.isLand);const t=C('Torment of Hailfire');a.hand=[t];W(g,a,5,'Swamp');a.ai.chooseX=()=>3;const l0=b.life;await g.cast(a,t,'hand');await flush(g);
  // ENGINE BUG
  ok('Torment of Hailfire X=3: opponent with no cards/permanents loses 9',l0-b.life===9,String(l0-b.life));});
await T('Torment of Hailfire: opponent discards instead of losing life',async()=>{const g=fresh(2);const [a,b]=g.players;b.hand=[bear(),bear(),bear()];b.battlefield=b.battlefield.filter(p=>p.card.isLand);b.life=4;const t=C('Torment of Hailfire');a.hand=[t];W(g,a,3,'Swamp');a.ai.chooseX=()=>1;await g.cast(a,t,'hand');await flush(g);
  // ENGINE BUG
  ok('Torment of Hailfire X=1: opponent at 4 life with 3 cards may discard instead of losing 3',b.hand.length===2&&b.life===4||b.life===1,`hand=${b.hand.length} life=${b.life}`);});

// ---- Ethereal Armor
await T('Ethereal Armor: +1/+1 per enchantment you control, first strike',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());const ea=put(g,a,C('Ethereal Armor'));ea.attachedTo=x.id;g.refreshStatics();ok('Ethereal Armor: 1 enchantment → 3/3',g.powerOf(a,x)===3&&g.toughOf(a,x)===3,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);
  // ENGINE BUG
  ok('Ethereal Armor: grants first strike',kws(g,x).includes('first strike'));
  put(g,a,SC('Ench1','Enchantment','{1}','',1));put(g,a,SC('Ench2','Enchantment','{1}','',1));opp(g,b,SC('OppEnch','Enchantment','{1}','',1));g.refreshStatics();
  // ENGINE BUG
  ok('Ethereal Armor: 3 enchantments you control (opponent\'s ignored) → 5/5',g.powerOf(a,x)===5&&g.toughOf(a,x)===5,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);});

// ---- Folk Hero
await T('Folk Hero: shares creature type with commander, once per turn',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Folk Hero'));const cm=put(g,a,SC('Boss','Legendary Creature — Elf Druid','{1}','',1,1,1));cm.card.isCommander=true;W(g,a,8,'Forest');const h0=a.hand.length;
  const gob=SC('Gob','Creature — Goblin','{1}','',1,1,1);a.hand.push(gob);await g.cast(a,gob,'hand');await flush(g);ok('Folk Hero: non-sharing spell → no draw',a.hand.length===h0);
  const e1=SC('E1','Creature — Elf Warrior','{1}','',1,1,1);a.hand.push(e1);await g.cast(a,e1,'hand');await flush(g);
  // ENGINE BUG
  ok('Folk Hero: Elf spell after a non-sharing spell → still draws (non-sharing spell must not use up the once-per-turn)',a.hand.length===h0+1,String(a.hand.length-h0));});
await T('Folk Hero: once per turn',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Folk Hero'));const cm=put(g,a,SC('Boss','Legendary Creature — Elf Druid','{1}','',1,1,1));cm.card.isCommander=true;W(g,a,8,'Forest');const h0=a.hand.length;
  const e1=SC('E1','Creature — Elf Warrior','{1}','',1,1,1);a.hand.push(e1);await g.cast(a,e1,'hand');await flush(g);ok('Folk Hero: Elf spell → draw',a.hand.length===h0+1,String(a.hand.length-h0));
  const e2=SC('E2','Creature — Elf Warrior','{1}','',1,1,1);a.hand.push(e2);await g.cast(a,e2,'hand');await flush(g);ok('Folk Hero: second Elf same turn → no draw',a.hand.length===h0+1,String(a.hand.length-h0));
  g.turn++;const e3=SC('E3','Creature — Elf Warrior','{1}','',1,1,1);a.hand.push(e3);await g.cast(a,e3,'hand');await flush(g);ok('Folk Hero: next turn → draws again',a.hand.length===h0+2,String(a.hand.length-h0));});
await T('Folk Hero: commander must be on battlefield',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Folk Hero'));const cm=SC('Boss','Legendary Creature — Elf Druid','{1}','',1,1,1);cm.isCommander=true;a.command=[cm];W(g,a,2,'Forest');const h0=a.hand.length;const e1=SC('E1','Creature — Elf Warrior','{1}','',1,1,1);a.hand.push(e1);await g.cast(a,e1,'hand');await flush(g);ok('Folk Hero: commander in command zone → no draw',a.hand.length===h0);});

// ---- Cavalier of Thorns
await T('Cavalier of Thorns: dies → exile it, another card to top',async()=>{const g=fresh();const [a]=g.players;const cv=put(g,a,C('Cavalier of Thorns'));const x=bear();a.graveyard.push(x);await g.destroy(a,cv);await flush(g);ok('Cavalier of Thorns: Cavalier exiled',a.exile.includes(cv.card));ok('Cavalier of Thorns: other card on top of library',a.library[a.library.length-1]===x);});
await T('Cavalier of Thorns: if it cannot be exiled (token), nothing moves',async()=>{const g=fresh();const [a]=g.players;const tc={...C('Cavalier of Thorns'),token:true};const cv=put(g,a,tc);const x=bear();a.graveyard.push(x);await g.destroy(a,cv);await flush(g);ok('Cavalier of Thorns: token copy dies → graveyard card stays',a.graveyard.includes(x));});

// ---- Impulsivity
await T('Impulsivity: cast instant/sorcery from any graveyard free, exile it after',async()=>{const g=fresh();const [a,b]=g.players;const s=sorc();b.graveyard.push(bear(),s);const imp=C('Impulsivity');const pm=put(g,a,imp);const h0=a.hand.length;await g.runOps(a,imp.etbOps,imp,{perm:pm});await flush(g);ok("Impulsivity: cast Divination from opponent's graveyard (draw 2)",a.hand.length===h0+2,String(a.hand.length-h0));ok('Impulsivity: the card is exiled, not in a graveyard',!b.graveyard.includes(s)&&!a.graveyard.some(c=>c.name==='Divination')&&b.exile.includes(s));ok('Impulsivity: creature card untouched',b.graveyard.some(c=>c.name==='Bear'));});

// ---- Slithermuse
await T('Slithermuse: draw the difference only if opponent has more cards',async()=>{const g=fresh();const [a,b,c]=g.players;a.hand=[bear()];b.hand=[bear(),bear(),bear(),bear()];c.hand=[];const sm=put(g,a,C('Slithermuse'));await g.destroy(a,sm);await flush(g);ok('Slithermuse: opponent has 4 vs 1 → draw 3',a.hand.length===4,String(a.hand.length));
  const g2=fresh();const [a2,b2,c2]=g2.players;a2.hand=[bear(),bear(),bear()];b2.hand=[bear()];c2.hand=[bear(),bear(),bear()];const sm2=put(g2,a2,C('Slithermuse'));await g2.destroy(a2,sm2);await flush(g2);ok('Slithermuse: no opponent has more → no draw',a2.hand.length===3,String(a2.hand.length));});

// ---- Boromir
await T("Boromir, Gondor's Hope: enters → Human or artifact from top six",async()=>{const g=fresh();const [a]=g.players;const hu=SC('Guy','Creature — Human Soldier','{1}','',1,1,1);a.hand=[];a.library=[bear(),bear(),hu,bear(),bear(),bear(),bear()];const bo=C("Boromir, Gondor's Hope");const pm=put(g,a,bo);await g.runOps(a,bo.etbOps,bo,{perm:pm});await flush(g);ok('Boromir: Human taken',a.hand.includes(hu)&&a.hand.length===1);
  const g2=fresh();const [a2]=g2.players;a2.hand=[];a2.library=[...Array(7)].map(()=>bear());const bo2=C("Boromir, Gondor's Hope");const pm2=put(g2,a2,bo2);await g2.runOps(a2,bo2.etbOps,bo2,{perm:pm2});ok('Boromir: no Human/artifact → nothing taken',a2.hand.length===0);});
await T("Boromir, Gondor's Hope: attacks → also digs",async()=>{const g=fresh();const [a,b]=g.players;const bo=put(g,a,C("Boromir, Gondor's Hope"));const art=SC('Rock','Artifact','{1}','',1);a.library=[bear(),bear(),bear(),bear(),bear(),art];const h0=a.hand.length;await g.attackTriggers(a,[{attacker:bo,defender:b}]);await flush(g);
  // ENGINE BUG
  ok('Boromir: attack trigger takes the artifact',a.hand.includes(art),String(a.hand.length-h0));});

// ---- Jetmir
await T('Jetmir: thresholds 3 / 6 / 9 creatures',async()=>{const g=fresh();const [a]=g.players;const j=put(g,a,C('Jetmir, Nexus of Revels'));g.refreshStatics();
  // ENGINE BUG
  ok('Jetmir: alone (1 creature) → no bonus, no vigilance',g.powerOf(a,j)===5&&!kws(g,j).includes('vigilance'),`${g.powerOf(a,j)} ${kws(g,j)}`);
  const xs=[put(g,a,bear()),put(g,a,bear())];g.refreshStatics();ok('Jetmir: 3 creatures → +1/+0 vigilance',g.powerOf(a,xs[0])===3&&kws(g,xs[0]).includes('vigilance')&&!kws(g,xs[0]).includes('trample'));
  for(let i=0;i<3;i++)xs.push(put(g,a,bear()));g.refreshStatics();ok('Jetmir: 6 creatures → +2/+0 trample',g.powerOf(a,xs[0])===4&&kws(g,xs[0]).includes('trample')&&!kws(g,xs[0]).includes('double strike'));
  for(let i=0;i<3;i++)xs.push(put(g,a,bear()));g.refreshStatics();ok('Jetmir: 9 creatures → +3/+0 double strike',g.powerOf(a,xs[0])===5&&kws(g,xs[0]).includes('double strike'));
  const ob=opp(g,g.players[1],bear());g.refreshStatics();ok("Jetmir: opponent's creature unaffected",g.powerOf(g.players[1],ob)===2);});

// ---- Crop Rotation
await T('Crop Rotation: any land card onto battlefield',async()=>{const g=fresh();const [a]=g.players;const nb=SC('Fancy Land','Land','','{T}: Add {C}.',0);a.library=[bear(),nb,bear()];const cr=C('Crop Rotation');a.hand=[cr];W(g,a,1,'Forest');await g.cast(a,cr,'hand');await flush(g);ok('Crop Rotation: nonbasic land put onto battlefield, Forest sacrificed',a.battlefield.some(p=>p.card===nb)&&a.graveyard.some(c=>c.name==='Forest'));ok('Crop Rotation: creatures not fetched',a.library.filter(c=>c.name==='Bear').length===2);});

// ---- Terror of the Peaks
await T('Terror of the Peaks: another creature you control enters',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Terror of the Peaks'));const o0=opps(g,a);await ent(g,a,big(3,3));ok('Terror of the Peaks: 3 damage dealt',opps(g,a)===o0-3,String(o0-opps(g,a)));
  const o1=opps(g,a);await ent(g,b,big(3,3,'OppOgre'));ok("Terror of the Peaks: opponent's creature → no damage",opps(g,a)===o1&&b.battlefield.some(p=>p.card.name==='OppOgre'));});
await T('Terror of the Peaks: itself entering → no damage',async()=>{const g=fresh();const [a]=g.players;const o0=opps(g,a);await ent(g,a,C('Terror of the Peaks'));ok('Terror of the Peaks: own ETB no damage',opps(g,a)===o0);});

// ---- Commissar Severina Raine
await T('Commissar Severina Raine: X = other attacking creatures',async()=>{const g=fresh();const [a,b,c]=g.players;const cs=put(g,a,C('Commissar Severina Raine'));const xs=[put(g,a,bear()),put(g,a,bear()),put(g,a,bear())];const l0=b.life,l1=c.life;await g.attackTriggers(a,[{attacker:cs,defender:b},...xs.map(x=>({attacker:x,defender:b}))]);await flush(g);
  // ENGINE BUG
  ok('Commissar: 3 other attackers → each opponent loses 3',l0-b.life===3&&l1-c.life===3,`${l0-b.life} ${l1-c.life}`);
  const g2=fresh();const [a2,b2]=g2.players;const cs2=put(g2,a2,C('Commissar Severina Raine'));const k0=b2.life;await g2.attackTriggers(a2,[{attacker:cs2,defender:b2}]);await flush(g2);
  // ENGINE BUG
  ok('Commissar: attacking alone → no life loss',b2.life===k0,String(k0-b2.life));});

// ---- Skyhunter Strike Force
await T('Skyhunter Strike Force: melee for others only with your commander',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Skyhunter Strike Force'));const x=put(g,a,bear());g.refreshStatics();ok('Skyhunter: no commander → bear lacks melee',!kws(g,x).includes('melee'));await g.attackTriggers(a,[{attacker:x,defender:b}]);ok('Skyhunter: no commander → bear not pumped',g.powerOf(a,x)===2);
  const g2=fresh();const [a2,b2]=g2.players;put(g2,a2,C('Skyhunter Strike Force'));const cm=put(g2,a2,SC('Boss','Legendary Creature — Cat','{1}','',1,1,1));cm.card.isCommander=true;const y=put(g2,a2,bear());g2.refreshStatics();ok('Skyhunter: with commander → bear has melee',kws(g2,y).includes('melee'));await g2.attackTriggers(a2,[{attacker:y,defender:b2}]);ok('Skyhunter: melee pumps +1/+1 (one opponent)',g2.powerOf(a2,y)===3,String(g2.powerOf(a2,y)));});

// ---- Monstrous Vortex
await T('Monstrous Vortex: discover X on power>=5 creature spell',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Monstrous Vortex'));const tgt=SC('Rock','Artifact','{3}','',3);a.library.push(tgt);const fat=SC('Fatty','Creature — Beast','{4}{G}','',5,5,5);a.hand=[fat];W(g,a,5,'Forest');await g.cast(a,fat,'hand');await flush(g);
  // ENGINE BUG
  ok('Monstrous Vortex: 5-power creature → discover (Rock cast or to hand)',a.battlefield.some(p=>p.card===tgt)||a.hand.includes(tgt));
  const g2=fresh();const [a2]=g2.players;put(g2,a2,C('Monstrous Vortex'));const t2=SC('Rock','Artifact','{3}','',3);a2.library.push(t2);const m4=SC('Four','Creature — Beast','{4}{G}','',5,4,4);a2.hand=[m4];W(g2,a2,5,'Forest');await g2.cast(a2,m4,'hand');await flush(g2);ok('Monstrous Vortex: 4-power creature → nothing',a2.library[a2.library.length-1]===t2);});

// ---- Malakir Bloodwitch
await T('Malakir Bloodwitch: drain = Vampires you control',async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,S('Vamp','Creature — Vampire','{1}','',1,1));opp(g,b,S('OVamp','Creature — Vampire','{1}','',1,1));put(g,a,bear());const mb=C('Malakir Bloodwitch');const pm=put(g,a,mb);const l0=a.life,b0=b.life,c0=c.life;await g.runOps(a,mb.etbOps,mb,{perm:pm});await flush(g);ok('Malakir Bloodwitch: 2 Vampires → each opponent loses 2',b0-b.life===2&&c0-c.life===2,`${b0-b.life}`);ok('Malakir Bloodwitch: gain total lost (4)',a.life===l0+4,String(a.life-l0));});

// ---- Assault Formation
await T('Assault Formation: your creatures assign damage by toughness',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Assault Formation'));const x=put(g,a,S('Wally','Creature — Wall','{1}','',1,4));ok('Assault Formation: your 1/4 assigns 4',g.combatPow(a,x)===4);const y=opp(g,b,S('OWally','Creature — Wall','{1}','',1,4));ok("Assault Formation: opponent's 1/4 assigns 1",g.combatPow(b,y)===1);b.battlefield.splice(b.battlefield.indexOf(y),1);const l0=b.life;await g.combatPhase(a,[{attacker:x,defender:b}]);ok('Assault Formation: unblocked 1/4 deals 4',l0-b.life===4,String(l0-b.life));});

// ---- Indulging Patrician
await T('Indulging Patrician: end step, needs 3+ life gained',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Indulging Patrician'));await g.changeLife(a,2,{name:'x'});const b0=b.life;await g.fireTriggers(a,'end');await flush(g);
  // ENGINE BUG
  ok('Indulging Patrician: gained 2 → no drain',b.life===b0,String(b0-b.life));
  await g.changeLife(a,1,{name:'x'});const b1=b.life;await g.fireTriggers(a,'end');await flush(g);ok('Indulging Patrician: gained 3 total → each opponent loses 3',b1-b.life===3);});

// ---- Wall of Roots
await T('Wall of Roots: no tap, once per turn, works while summoning sick',async()=>{const g=fresh();const [a]=g.players;const w=put(g,a,C('Wall of Roots'));const c1=SC('One','Creature — Elf','{G}','',1,1,1);ok('Wall of Roots: can pay {G}',g.canPayCost(a,g.costOf(a,c1,'hand')));a.hand=[c1];await g.cast(a,c1,'hand');await flush(g);ok('Wall of Roots: -0/-1 counter after use',g.toughOf(a,w)===4,String(g.toughOf(a,w)));
  // ENGINE BUG
  ok('Wall of Roots: not tapped by its mana ability (can still block)',!w.tapped);w.tapped=false;/* ENGINE BUG */ ok('Wall of Roots: second use same turn not allowed',!g.canPayCost(a,g.costOf(a,SC('Two','Creature — Elf','{G}','',1,1,1),'hand')));
  const g2=fresh();const [a2]=g2.players;const w2=put(g2,a2,C('Wall of Roots'),{summoning:true});
  // ENGINE BUG
  ok('Wall of Roots: usable the turn it enters (no {T} in cost)',g2.canPayCost(a2,g2.costOf(a2,SC('One','Creature — Elf','{G}','',1,1,1),'hand')));});

// ---- Cloud
await T('Cloud, Midgar Mercenary: equipped → triggers of Cloud/its equipment trigger twice',async()=>{const g=fresh();const [a,b]=g.players;const cl=put(g,a,C('Cloud, Midgar Mercenary'));const eqc=SC('Lifeblade','Artifact — Equipment','{1}','Equipped creature gets +1/+0.\nWhenever equipped creature attacks, you gain 1 life.\nEquip {1}',1);const eq=put(g,a,eqc);eq.attachedTo=cl.id;g.refreshStatics();const l0=a.life;await g.attackTriggers(a,[{attacker:cl,defender:b}]);await flush(g);ok('Cloud: equipment trigger doubled (gain 2)',a.life===l0+2,String(a.life-l0));
  const x=put(g,a,bear());eq.attachedTo=x.id;g.refreshStatics();g.turn++;const l1=a.life;await g.attackTriggers(a,[{attacker:x,defender:b}]);await flush(g);ok('Cloud: equipment on another creature → once',a.life===l1+1,String(a.life-l1));});

// ---- Puresteel Paladin
await T('Puresteel Paladin: equip {0} with 3+ artifacts',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Puresteel Paladin'));const eq=put(g,a,SC('Blade','Artifact — Equipment','{1}','Equipped creature gets +1/+0.\nEquip {3}',1));put(g,a,SC('Rock','Artifact','{1}','',1));opp(g,b,SC('ORock','Artifact','{1}','',1));const ab=eq.card.abilities.find(x=>x.label==='equip');ok('Puresteel: equip ability parsed',!!ab);if(!ab)return;ok("Puresteel: 2 artifacts (+opponent's) → equip still {3}",g.abilityCost(a,eq.card,ab,eq).total===3,String(g.abilityCost(a,eq.card,ab,eq).total));put(g,a,SC('Rock2','Artifact','{1}','',1));ok('Puresteel: 3 artifacts → equip {0}',g.abilityCost(a,eq.card,ab,eq).total===0);});

// ---- Astral Dragon
await T('Astral Dragon: two 3/3 flying Dragon copies of a noncreature permanent',async()=>{const g=fresh();const [a]=g.players;put(g,a,bear());const rock=put(g,a,SC('Rock','Artifact','{1}','',1));const ad=C('Astral Dragon');const pm=put(g,a,ad);await g.runOps(a,ad.etbOps,ad,{perm:pm});await flush(g);const toks=a.battlefield.filter(p=>p.card.token);ok('Astral Dragon: two tokens copying the Rock',toks.length===2&&toks.every(t=>t.card.name==='Rock'),toks.map(t=>t.card.name).join(','));ok('Astral Dragon: tokens are 3/3 flying Dragon artifact creatures',toks.every(t=>t.card.isCreature&&t.card.isArtifact&&g.powerOf(a,t)===3&&g.toughOf(a,t)===3&&kws(g,t).includes('flying')&&/Dragon/.test(t.card.type)));});
await T('Astral Dragon: a land is a legal noncreature target',async()=>{const g=fresh();const [a,b]=g.players;b.battlefield=[];a.battlefield=[];g.players[2].battlefield=[];put(g,a,bear());put(g,a,SC('Fancy Land','Land','','{T}: Add {C}.',0));const ad=C('Astral Dragon');const pm=put(g,a,ad);await g.runOps(a,ad.etbOps,ad,{perm:pm});
  // ENGINE BUG (minor)
  ok('Astral Dragon: only noncreature permanent is a land → two 3/3 Dragon copies of it',a.battlefield.filter(p=>p.card.token&&p.card.name==='Fancy Land').length===2);});
await T('Astral Dragon: creature-only board → no copies',async()=>{const g=fresh();const [a,b]=g.players;b.battlefield=[];a.battlefield=[];g.players[2].battlefield=[];put(g,a,bear());const ad=C('Astral Dragon');const pm=put(g,a,ad);await g.runOps(a,ad.etbOps,ad,{perm:pm});ok('Astral Dragon: nothing to copy → no tokens',!a.battlefield.some(p=>p.card.token));});

// ---- Herd Heirloom
await T('Herd Heirloom: mana for creature spells only',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Herd Heirloom'));ok('Herd Heirloom: pays {G} creature',g.canPayCost(a,g.costOf(a,SC('One','Creature — Elf','{G}','',1,1,1),'hand')));
  // ENGINE BUG
  ok('Herd Heirloom: cannot pay {G} sorcery',!g.canPayCost(a,g.costOf(a,SC('Sorc','Sorcery','{G}','Draw a card.',1),'hand')));});
await T('Herd Heirloom: power>=4 creature gains trample + combat-damage draw',async()=>{const g=fresh();const [a,b]=g.players;const hh=put(g,a,C('Herd Heirloom'));put(g,a,bear());const h0=a.hand.length;const opt=g.abilityOptions(a,{}).find(o=>o.card===hh.card&&!o.ab.mana);
  // ENGINE BUG
  ok('Herd Heirloom: no power-4 creature → ability does nothing (no draw)',!opt||(await g.activate(a,opt),a.hand.length===h0),String(a.hand.length-h0));
  const g2=fresh();const [a2,b2]=g2.players;const hh2=put(g2,a2,C('Herd Heirloom'));const x=put(g2,a2,big(4,4));const h1=a2.hand.length;const o2=g2.abilityOptions(a2,{}).find(o=>o.card===hh2.card);if(o2)await g2.activate(a2,o2);await flush(g2);
  // ENGINE BUG
  ok('Herd Heirloom: target gains trample, no immediate draw',kws(g2,x).includes('trample')&&a2.hand.length===h1,`kw=${kws(g2,x)} dh=${a2.hand.length-h1}`);const h2=a2.hand.length;await cd(g2,a2,b2,x,4);
  // ENGINE BUG
  ok('Herd Heirloom: combat damage to a player → draw',a2.hand.length===h2+1);});

// ---- Estrid's Invocation
await T("Estrid's Invocation: copies an enchantment you control (not a creature)",async()=>{const g=fresh();const [a]=g.players;const x=put(g,a,bear());put(g,a,SC('Anthem','Enchantment','{2}{W}','Creatures you control get +1/+1.',3));g.refreshStatics();ok("Estrid's Invocation: setup anthem works",g.powerOf(a,x)===3);const ei=C("Estrid's Invocation");a.hand=[ei];W(g,a,3,'Island');await g.cast(a,ei,'hand');await flush(g);g.refreshStatics();
  // ENGINE BUG
  ok("Estrid's Invocation: enters as copy of the Anthem → bear 4/4",g.powerOf(a,x)===4,String(g.powerOf(a,x)));
  // ENGINE BUG
  ok("Estrid's Invocation: did not copy the creature",!a.battlefield.some(p=>p.card.name==='Bear'&&p!==x));});
await T("Estrid's Invocation: does not copy an opponent's enchantment",async()=>{const g=fresh();const [a,b]=g.players;opp(g,b,SC('OppAnthem','Enchantment','{2}{W}','Creatures you control get +1/+1.',3));const ei=C("Estrid's Invocation");a.hand=[ei];W(g,a,3,'Island');await g.cast(a,ei,'hand');await flush(g);ok("Estrid's Invocation: enters as itself",a.battlefield.some(p=>p.card.name==="Estrid's Invocation"));});

// ---- Allosaurus Shepherd
const counterAt=async(g,by,v)=>{const cs=SC('Cancel','Instant','{U}','Counter target spell.',1);by.hand=[cs];W(g,by,1,'Island');await g.cast(by,cs,'hand',{spell:v},{instant:true});await flush(g);};
await T('Allosaurus Shepherd: itself and your green spells uncounterable',async()=>{const g=fresh();const [a,b]=g.players;const v=spell(g,a,C('Allosaurus Shepherd'));await counterAt(g,b,v);ok('Allosaurus Shepherd: the Shepherd spell is not countered',!v.countered);
  const g2=fresh();const [a2,b2]=g2.players;put(g2,a2,C('Allosaurus Shepherd'));const gs=bear();gs.colors=['G'];const v2=spell(g2,a2,gs);await counterAt(g2,b2,v2);ok('Allosaurus Shepherd: your green spell not countered',!v2.countered);
  const bl=sorc();bl.colors=['U'];const v3=spell(g2,a2,bl);await counterAt(g2,b2,v3);ok('Allosaurus Shepherd: your blue spell countered',!!v3.countered);
  const og=bear();og.colors=['G'];const v4=spell(g2,b2,og);await counterAt(g2,g2.players[2],v4);ok("Allosaurus Shepherd: opponent's green spell countered",!!v4.countered);});

// ---- Maralen
await T('Maralen: cast exiled card with MV <= Elves+Faeries, once per turn',async()=>{const g=fresh();const [a,b]=g.players;const m=put(g,a,C('Maralen, Fae Ascendant'));const c3=SC('Three','Creature — Ogre','{2}{R}','',3,3,3);const c1=SC('Uno','Creature — Ogre','{R}','',1,1,1);b.library.push(c3,c1);await g.runOps(a,[{op:'maralenExile'}],m.card,{perm:m});ok('Maralen: two cards exiled',b.exile.includes(c3)&&b.exile.includes(c1));ok('Maralen: 1 Elf/Faerie → MV3 not castable',!g.castMode(a,c3,'exile'));ok('Maralen: MV1 castable free',g.castMode(a,c1,'exile')==='free');put(g,a,elf());put(g,a,elf());ok('Maralen: 3 Elves → MV3 castable',g.castMode(a,c3,'exile')==='free');await g.cast(a,c1,'exile');await flush(g);ok('Maralen: cast one',a.battlefield.some(p=>p.card===c1));ok('Maralen: second not castable same turn',!g.castMode(a,c3,'exile'));});

// ---- Felidar Guardian
await T('Felidar Guardian: blink another permanent you control',async()=>{const g=fresh();const [a,b]=g.players;const sg=put(g,a,C('Sea Gate Oracle'));opp(g,b,C('Sea Gate Oracle'));const fg=C('Felidar Guardian');const pm=put(g,a,fg);const h0=a.hand.length;await g.runOps(a,fg.etbOps,fg,{perm:pm});await flush(g);ok('Felidar Guardian: own Oracle re-enters (dig)',a.hand.length===h0+1&&!a.battlefield.includes(sg)&&a.battlefield.some(p=>p.card.name==='Sea Gate Oracle'));ok('Felidar Guardian: Felidar itself stayed',a.battlefield.includes(pm));
  const g2=fresh();const [a2,b2]=g2.players;opp(g2,b2,C('Sea Gate Oracle'));const fg2=C('Felidar Guardian');const pm2=put(g2,a2,fg2);const ob=b2.battlefield.find(p=>p.card.name==='Sea Gate Oracle');await g2.runOps(a2,fg2.etbOps,fg2,{perm:pm2});ok("Felidar Guardian: opponent's permanent not blinked; Felidar not blinked",b2.battlefield.includes(ob)&&a2.battlefield.includes(pm2));});

await T('Felidar Guardian: a land is a legal target',async()=>{const g=fresh();const [a]=g.players;a.battlefield=[];const ln=put(g,a,L('Forest'));ln.tapped=true;const fg=C('Felidar Guardian');const pm=put(g,a,fg);await g.runOps(a,fg.etbOps,fg,{perm:pm});
  // ENGINE BUG (minor)
  ok('Felidar Guardian: only other permanent is a tapped land → it is blinked (returns untapped)',!a.battlefield.includes(ln)&&a.battlefield.some(p=>p.card.name==='Forest'&&!p.tapped));});

// ---- Abandon Attachments
await T('Abandon Attachments: discard to draw two',async()=>{const g=fresh();const [a]=g.players;const aa=C('Abandon Attachments');a.hand=[aa,bear()];W(g,a,2,'Island');await g.cast(a,aa,'hand');await flush(g);
  // ENGINE BUG
  ok('Abandon Attachments: discarded 1, drew 2',a.hand.length===2&&a.graveyard.some(c=>c.name==='Bear'),`hand=${a.hand.length}`);
  const g2=fresh();const [a2]=g2.players;const aa2=C('Abandon Attachments');a2.hand=[aa2];W(g2,a2,2,'Island');await g2.cast(a2,aa2,'hand');await flush(g2);/* ENGINE BUG */ ok('Abandon Attachments: nothing to discard → no draw',a2.hand.length===0);});

// ---- Fire Lord Zuko
await T('Fire Lord Zuko: firebending X = power',async()=>{const g=fresh();const [a,b]=g.players;const z=put(g,a,C('Fire Lord Zuko'));z.counters=2;g.refreshStatics();a.pool=[];await g.attackTriggers(a,[{attacker:z,defender:b}]);ok('Fire Lord Zuko: power 4 → 4 R',(a.pool||[]).filter(e=>e.c==='R').length===4,JSON.stringify(a.pool));
  const g2=fresh();const [a2,b2]=g2.players;const z2=put(g2,a2,C('Fire Lord Zuko'));a2.pool=[];const x=put(g2,a2,bear());await g2.attackTriggers(a2,[{attacker:x,defender:b2}]);ok('Fire Lord Zuko: another creature attacking → no mana',!(a2.pool||[]).length);});

// ---- Toph
await T('Toph: earthbend X = mana spent to cast',async()=>{const g=fresh();const [a]=g.players;const t=C('Toph, Greatest Earthbender');t.isCommander=true;a.command=[t];a.cmdTax=2;W(g,a,6,'Forest');W(g,a,1,'Mountain');await g.cast(a,t,'cmd');await flush(g);const eb=a.battlefield.find(p=>p.card.earthbent);
  // ENGINE BUG
  ok('Toph: cast for 6 (with tax) → earthbend 6',eb&&eb.counters===6,eb&&String(eb.counters));});

// ---- Mentor of the Meek
await T('Mentor of the Meek: power<=2 another, pay {1}',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Mentor of the Meek'));W(g,a,1,'Plains');const h0=a.hand.length;await ent(g,a,big(3,3));ok('Mentor of the Meek: 3-power → no draw',a.hand.length===h0);await ent(g,b,bear());ok("Mentor of the Meek: opponent's creature → no draw",a.hand.length===h0);await ent(g,a,bear());ok('Mentor of the Meek: 2/2 → draw',a.hand.length===h0+1,`dh=${a.hand.length-h0}`);
  // ENGINE BUG
  ok('Mentor of the Meek: the {1} was paid',a.battlefield.filter(p=>p.card.isLand&&p.tapped).length===1);
  // ENGINE BUG
  await ent(g,a,bear());ok('Mentor of the Meek: no mana left → cannot pay → no draw',a.hand.length===h0+1,String(a.hand.length-h0));});

// ---- Havi
await T('Havi: indestructible with 4+ historic cards in graveyard',async()=>{const g=fresh();const [a]=g.players;const h=put(g,a,C('Havi, the All-Father'));a.graveyard.push(SC('Rock','Artifact','{1}','',1),SC('Leg','Legendary Creature — Elf','{1}','',1,1,1),SC('Saga1','Enchantment — Saga','{1}','',1),bear(),bear(),sorc());ok('Havi: 3 historic → not indestructible',!kws(g,h).includes('indestructible'));a.graveyard.push(SC('Rock2','Artifact','{1}','',1));ok('Havi: 4 historic → indestructible',kws(g,h).includes('indestructible'));await g.destroy(a,h);ok('Havi: survives destroy',a.battlefield.includes(h));const x=put(g,a,SC('Leg2','Legendary Creature — Elf','{1}','',1,1,1));ok('Havi: other legendary not indestructible',!kws(g,x).includes('indestructible'));});

// ---- Fallen Shinobi
await T('Fallen Shinobi: combat damage → that player exiles two, you play them free',async()=>{const g=fresh();const [a,b]=g.players;const fs=put(g,a,C('Fallen Shinobi'));const c1=big(5,5,'Exiled');const l1=L('Swamp');b.library.push(l1,c1);await cd(g,a,b,fs,5);ok("Fallen Shinobi: defending player's top two exiled",b.exile.includes(c1)&&b.exile.includes(l1));ok('Fallen Shinobi: creature castable free',g.castMode(a,c1,'exile')==='free');await g.cast(a,c1,'exile');await flush(g);ok('Fallen Shinobi: cast it',a.battlefield.some(p=>p.card===c1));});

// ---- Morphic Pool
await T('Morphic Pool: untapped with 2+ opponents',async()=>{const g=fresh(3);const [a]=g.players;const mp=C('Morphic Pool');a.hand.push(mp);await g.playLand(a,mp);ok('Morphic Pool: 2 opponents → untapped',!a.battlefield.find(p=>p.card===mp).tapped);const g2=fresh(2);const [a2]=g2.players;const mp2=C('Morphic Pool');a2.hand.push(mp2);await g2.playLand(a2,mp2);ok('Morphic Pool: 1 opponent → tapped',a2.battlefield.find(p=>p.card===mp2).tapped);});

// ---- Tormented Soul
await T("Tormented Soul: can't block and can't be blocked",async()=>{const g=fresh();const [a,b]=g.players;const ts=put(g,a,C('Tormented Soul'));const ob=opp(g,b,bear());const x=put(g,a,bear());ok('Tormented Soul: cannot block',!g.canBlock(ts,ob));ok('Tormented Soul: cannot be blocked',!g.canBlock(ob,ts));ok('Tormented Soul: control — other bear can block / be blocked',g.canBlock(x,ob)&&g.canBlock(ob,x));});

// ---- Massacre Girl, Known Killer
await T('Massacre Girl, Known Killer: opponent creature dies with toughness < 1',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Massacre Girl, Known Killer'));const h0=a.hand.length;const v=opp(g,b,bear());await g.destroy(b,v);await flush(g);
  // ENGINE BUG
  ok('Massacre Girl: opponent creature destroyed at toughness 2 → no draw',a.hand.length===h0,String(a.hand.length-h0));
  const hm=a.hand.length;const w=opp(g,b,bear());w.counters=-2;await g.sba();await flush(g);ok('Massacre Girl: opponent creature dies at toughness 0 → draw',!b.battlefield.includes(w)&&a.hand.length===hm+1,`dh=${a.hand.length-hm}`);
  const h1=a.hand.length;const mine=put(g,a,bear());mine.counters=-2;await g.sba();await flush(g);ok('Massacre Girl: own creature at toughness 0 → no draw',a.hand.length===h1);});

// ---- Loyal Tutor
await T('Loyal Tutor: planeswalker on top',async()=>{const g=fresh();const [a]=g.players;const pw=C('Liliana of the Dark Realms');a.library=[pw,bear(),bear(),bear()];const lt=C('Loyal Tutor');a.hand=[lt];W(g,a,1,'Plains');await g.cast(a,lt,'hand');await flush(g);ok('Loyal Tutor: planeswalker on top of library',a.library[a.library.length-1]===pw);ok('Loyal Tutor: not in hand',!a.hand.includes(pw));});

// ---- Hamza
await T('Hamza: self cost counts only creatures with +1/+1 counters',async()=>{const g=fresh();const [a]=g.players;const x=put(g,a,bear());x.counters=1;put(g,a,bear());const hz=C('Hamza, Guardian of Arashin');
  // ENGINE BUG
  ok('Hamza: 1 countered + 1 plain creature → costs 5',g.costOf(a,hz,'hand').total===5,String(g.costOf(a,hz,'hand').total));});
await T('Hamza: creature spells cost 1 less per countered creature',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Hamza, Guardian of Arashin'));const x=put(g,a,bear());const c4=SC('Four','Creature — Beast','{3}{G}','',4,4,4);ok('Hamza: no counters → no reduction',g.costOf(a,c4,'hand').total===4);x.counters=1;ok('Hamza: 1 countered creature → 3',g.costOf(a,c4,'hand').total===3);/* ENGINE BUG */ ok('Hamza: noncreature spell unaffected',g.costOf(a,SC('Sorc','Sorcery','{3}{G}','Draw a card.',4),'hand').total===4);});

// ---- Conduit of Worlds
await T('Conduit of Worlds: cast permanent from gy only if no spell cast; then no more spells',async()=>{const g=fresh();const [a]=g.players;const cw=put(g,a,C('Conduit of Worlds'));const x=bear();a.graveyard.push(x,sorc());W(g,a,4,'Forest');const o=abO(g,a,cw.card);ok('Conduit: activatable',!!o);ok('Conduit: not at instant speed',!g.abilityOptions(a,{instant:true}).some(q=>q.card===cw.card));if(o){await g.activate(a,o);await flush(g);}
  // ENGINE BUG
  ok('Conduit: bear cast from graveyard',a.battlefield.some(p=>p.card===x));const y=bear();a.hand=[y];ok("Conduit: can't cast additional spells this turn",!g.castMode(a,y,'hand'));
  const g2=fresh();const [a2]=g2.players;const cw2=put(g2,a2,C('Conduit of Worlds'));const x2=bear();a2.graveyard.push(x2);W(g2,a2,4,'Forest');a2.spellsThisTurn=1;const o2=abO(g2,a2,cw2.card);if(o2){await g2.activate(a2,o2);await flush(g2);}ok('Conduit: already cast a spell → nothing cast',a2.graveyard.includes(x2));});

// ---- Assault Intercessor
await T("Assault Intercessor: opponent's creature dies → that player loses 2",async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,C('Assault Intercessor'));const v=opp(g,b,bear());const b0=b.life,c0=c.life;await g.destroy(b,v);await flush(g);ok('Assault Intercessor: controller loses 2',b0-b.life===2&&c.life===c0);const l0=a.life;const m=put(g,a,bear());await g.destroy(a,m);await flush(g);ok('Assault Intercessor: own creature → nothing',a.life===l0);});

// ---- Order of Whiteclay
await T('Order of Whiteclay: untap cost, one creature MV<=3',async()=>{const g=fresh();const [a]=g.players;const o=put(g,a,C('Order of Whiteclay'));const c2=bear(),c2b=S('Bear2','Creature — Bear','{1}{G}','',2,2);const c4=SC('Four','Creature — Beast','{3}{G}','',4,4,4);a.graveyard.push(c4,c2,c2b);W(g,a,3,'Plains');ok('Order of Whiteclay: untapped → not activatable',!abO(g,a,o.card));o.tapped=true;const op=abO(g,a,o.card);ok('Order of Whiteclay: tapped → activatable',!!op);if(op){await g.activate(a,op);await flush(g);}ok('Order of Whiteclay: untapped by cost',!o.tapped);ok('Order of Whiteclay: 4-drop not returned',a.graveyard.includes(c4));const n=[c2,c2b].filter(c=>a.battlefield.some(p=>p.card===c)).length;
  // ENGINE BUG
  ok('Order of Whiteclay: exactly one creature returned',n===1,String(n));});

// ---- Apprentice Necromancer
await T('Apprentice Necromancer: returned creature has haste, sacrificed at end step',async()=>{const g=fresh();const [a]=g.players;const an=put(g,a,C('Apprentice Necromancer'));const x=big(5,5,'Dead');a.graveyard.push(x);W(g,a,1,'Swamp');const o=abO(g,a,an.card);if(o){await g.activate(a,o);await flush(g);}const pm=a.battlefield.find(p=>p.card===x);ok('Apprentice Necromancer: returned, necromancer sacrificed',!!pm&&!a.battlefield.includes(an));
  // ENGINE BUG
  ok('Apprentice Necromancer: returned creature can attack (haste)',pm&&g.canAttackWith(a,pm));
  // ENGINE BUG
  ok('Apprentice Necromancer: marked to be sacrificed at end step',pm&&!!pm.sacAtEnd);});

// ---- Liliana of the Dark Realms
await T('Liliana of the Dark Realms −3: X = Swamps you control',async()=>{const g=fresh();const [a,b]=g.players;const li=put(g,a,C('Liliana of the Dark Realms'));li.loyalty=5;W(g,a,1,'Swamp');W(g,b,5,'Swamp');const ov=opp(g,b,big(3,3,'OppOgre'));const mine=put(g,a,bear());const o=g.abilityOptions(a,{}).find(q=>q.card===li.card&&q.ab.loyalty===-3);if(o){await g.activate(a,o);await flush(g);}ok("Liliana −3: 1 Swamp (opponent's 5 ignored) → OppOgre survives",b.battlefield.includes(ov));ok('Liliana −3: own creature gets +1/+1',g.powerOf(a,mine)===3,String(g.powerOf(a,mine)));
  const g2=fresh();const [a2,b2]=g2.players;const li2=put(g2,a2,C('Liliana of the Dark Realms'));li2.loyalty=5;W(g2,a2,3,'Swamp');const ov2=opp(g2,b2,big(3,3,'OppOgre'));const o2=g2.abilityOptions(a2,{}).find(q=>q.card===li2.card&&q.ab.loyalty===-3);if(o2){await g2.activate(a2,o2);await flush(g2);}ok('Liliana −3: 3 Swamps → kills a 3/3',!b2.battlefield.includes(ov2));});

// ---- Kaito
await T('Kaito, Cunning Infiltrator +1: target creature unblockable, loot',async()=>{const g=fresh();const [a,b]=g.players;const k=put(g,a,C('Kaito, Cunning Infiltrator'));k.loyalty=3;const x=put(g,a,bear());a.hand=[L('Island')];const o=g.abilityOptions(a,{}).find(q=>q.card===k.card&&q.ab.loyalty===1);if(o){await g.activate(a,o);await flush(g);}ok('Kaito +1: looted (hand size same, 1 card in gy)',a.hand.length===1&&a.graveyard.length===1);const ob=opp(g,b,bear());
  // ENGINE BUG
  ok("Kaito +1: target creature can't be blocked this turn",x.unblockTurn===g.turn||!g.canBlock(ob,x));});

// ---- Flare of Fortitude
await T('Flare of Fortitude: your life locked, your permanents hexproof+indestructible',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());const ob=opp(g,b,bear());const f=C('Flare of Fortitude');a.hand=[f];W(g,a,4,'Plains');await g.cast(a,f,'hand');await flush(g);const l0=a.life;await g.changeLife(a,-5,{name:'x'});await g.changeLife(a,3,{name:'y'});ok('Flare: life total can\'t change',a.life===l0);await g.destroy(a,x);ok('Flare: own creature indestructible',a.battlefield.includes(x));const lb=b.life;await g.changeLife(b,-2,{name:'x'});ok("Flare: opponent's life still changes",b.life===lb-2);await g.destroy(b,ob);ok("Flare: opponent's creature not indestructible",!b.battlefield.includes(ob));g.turn++;const l1=a.life;await g.changeLife(a,-1,{name:'x'});ok('Flare: next turn life changes again',a.life===l1-1);});

// ---- Kitsa
await T("Kitsa, Otterball Elite: copy needs power 3",async()=>{const g=fresh();const [a]=g.players;const k=put(g,a,C('Kitsa, Otterball Elite'));W(g,a,2,'Island');spell(g,a,sorc());const has=()=>g.abilityOptions(a,{instant:true}).some(o=>o.card===k.card&&o.ab.ops.some(x=>x.op==='copySpell'));
  // ENGINE BUG
  ok('Kitsa: power 1 → copy not activatable',!has());k.counters=2;ok('Kitsa: power 3 → copy activatable',has());});

// ---- Bre of Clan Stoutarm
await T('Bre of Clan Stoutarm: end step only if life gained; free if MV <= life gained',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Bre of Clan Stoutarm'));const x=bear();a.library.push(L('Forest'),x);const lib0=a.library.length;await g.fireTriggers(a,'end');await flush(g);ok('Bre: no life gained → nothing',a.library.length===lib0);
  await g.changeLife(a,2,{name:'x'});await g.fireTriggers(a,'end');await flush(g);
  // ENGINE BUG
  ok('Bre: gained 2, MV2 bear → cast free',a.battlefield.some(p=>p.card===x));
  const g2=fresh();const [a2]=g2.players;put(g2,a2,C('Bre of Clan Stoutarm'));const y=SC('Three','Creature — Ogre','{2}{R}','',3,3,3);a2.library.push(y);await g2.changeLife(a2,1,{name:'x'});await g2.fireTriggers(a2,'end');await flush(g2);ok('Bre: gained 1, MV3 → to hand',a2.hand.includes(y));});

// ---- Basri Ket
await T('Basri Ket −2: soldiers for nontoken attackers this turn',async()=>{const g=fresh();const [a,b]=g.players;const bk=put(g,a,C('Basri Ket'));bk.loyalty=3;const o=g.abilityOptions(a,{}).find(q=>q.card===bk.card&&q.ab.loyalty===-2);if(o){await g.activate(a,o);await flush(g);}const x=put(g,a,bear()),y=put(g,a,bear());const t={...bear(),token:true};const tp=put(g,a,t);const atk=[{attacker:x,defender:b},{attacker:y,defender:b},{attacker:tp,defender:b}];await g.attackTriggers(a,atk);await flush(g);const sol=a.battlefield.filter(p=>p.card.name==='Soldier');ok('Basri −2: 2 nontoken attackers → 2 soldiers tapped and attacking',sol.length===2&&sol.every(s=>s.tapped)&&atk.length===5,`${sol.length} atk=${atk.length}`);
  g.turn++;const atk2=[{attacker:x,defender:b}];await g.attackTriggers(a,atk2);ok('Basri −2: next turn → no soldiers',a.battlefield.filter(p=>p.card.name==='Soldier').length===2);});

// ---- Boseiju
await T('Boseiju, Who Endures: artifact, enchantment or nonbasic land of an opponent',async()=>{const g=fresh();const [a,b,c]=g.players;b.battlefield=[];c.battlefield=[];const en=opp(g,b,SC('OppEnch','Enchantment','{3}','',3));const bo=C('Boseiju, Who Endures');a.hand=[bo];W(g,a,2,'Forest');const o=g.abilityOptions(a,{instant:true}).find(q=>q.card===bo);ok('Boseiju: channel option',!!o);if(o){await g.activate(a,o);await flush(g);}
  // ENGINE BUG
  ok("Boseiju: opponent's enchantment destroyed",!b.battlefield.includes(en));});
await T('Boseiju, Who Endures: nonbasic land, controller may search',async()=>{const g=fresh();const [a,b,c]=g.players;b.battlefield=[];c.battlefield=[];const nl=opp(g,b,SC('Fancy Land','Land','','{T}: Add {C}.',0));const bl=opp(g,b,L('Island'));b.library.push(L('Forest'));const bo=C('Boseiju, Who Endures');a.hand=[bo];W(g,a,2,'Forest');const o=g.abilityOptions(a,{instant:true}).find(q=>q.card===bo);if(o){await g.activate(a,o);await flush(g);}
  // ENGINE BUG
  ok('Boseiju: nonbasic land destroyed, basic untouched',!b.battlefield.includes(nl)&&b.battlefield.includes(bl));
  // ENGINE BUG
  ok('Boseiju: opponent fetched a basic-typed land',b.battlefield.some(p=>p.card.name==='Forest'));});
await T('Boseiju, Who Endures: costs {1} less per legendary creature',async()=>{const g=fresh();const [a]=g.players;const bo=C('Boseiju, Who Endures');a.hand=[bo];const ab=bo.abilities.find(x=>x.zone==='hand');ok('Boseiju: no legends → {1}{G}',g.abilityCost(a,bo,ab,null).total===2);put(g,a,SC('Leg','Legendary Creature — Elf','{1}','',1,1,1));ok('Boseiju: 1 legendary creature → {G}',g.abilityCost(a,bo,ab,null).total===1);put(g,a,SC('LegArt','Legendary Artifact','{1}','',1));ok('Boseiju: legendary noncreature does not count',g.abilityCost(a,bo,ab,null).total===1);});

// ---- Tezzeret the Seeker
await T('Tezzeret the Seeker −X: artifact with MV <= X',async()=>{const g=fresh();const [a]=g.players;const tz=put(g,a,C('Tezzeret the Seeker'));tz.loyalty=4;const r1=SC('Rock1','Artifact','{1}','',1),r4=SC('Rock4','Artifact','{4}','',4);a.library=[r4,r1];const o=g.abilityOptions(a,{}).find(q=>q.card===tz.card&&q.ab.ops.some(x=>x.op==='tutorTo'));
  // ENGINE BUG
  ok('Tezzeret −X: ability available',!!o);if(o){await g.activate(a,o);await flush(g);ok('Tezzeret −X: an artifact put onto battlefield with MV <= X paid',a.battlefield.some(p=>p.card===r1||p.card===r4)&&tz.loyalty>=0);}});

// ---- Jeweled Lotus
await T('Jeweled Lotus: mana only for your commander',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Jeweled Lotus'));const cm=SC('Boss','Legendary Creature — Elf','{2}{G}','',3,3,3);cm.isCommander=true;a.command=[cm];a.cmdTax=0;ok('Jeweled Lotus: pays for commander',g.canPayCost(a,g.costOf(a,cm,'cmd')));
  // ENGINE BUG
  ok('Jeweled Lotus: cannot pay for a non-commander spell',!g.canPayCost(a,g.costOf(a,SC('Three','Creature — Ogre','{2}{G}','',3,3,3),'hand')));});

// ---- Nadir Kraken
await T('Nadir Kraken: draw → may pay {1}',async()=>{const g=fresh();const [a]=g.players;const nk=put(g,a,C('Nadir Kraken'));W(g,a,1,'Island');await g.draw(a,1);await flush(g);ok('Nadir Kraken: draw → counter and Tentacle',nk.counters===1&&a.battlefield.some(p=>p.card.name==='Tentacle'));
  // ENGINE BUG
  ok('Nadir Kraken: the {1} was paid',a.battlefield.some(p=>p.card.isLand&&p.tapped));
  await g.draw(a,1);await flush(g);
  // ENGINE BUG
  ok('Nadir Kraken: no mana → no counter / token',nk.counters===1&&a.battlefield.filter(p=>p.card.name==='Tentacle').length===1,`c=${nk.counters} t=${a.battlefield.filter(p=>p.card.name==='Tentacle').length}`);
  const b=g.players[1];const k0=nk.counters;await g.draw(b,1);await flush(g);ok("Nadir Kraken: opponent's draw → nothing",nk.counters===k0);});
console.log(pass+' passed, '+fails+' failed');})();
