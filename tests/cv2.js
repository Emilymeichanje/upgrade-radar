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
const PLc=async(g,a,c)=>{a.landsThisTurn=0;a.hand.push(c);await g.playLand(a,c);return a.battlefield.find(b=>b.card===c||b.card.orig===c);};
const abO=(g,a,card,re)=>g.abilityOptions(a,{}).find(x=>x.card===card&&(!re||re.test(x.ab.label||'')||x.ab.ops.some(o=>re.test(o.op))));
const cd=async(g,a,b,att,dmg)=>{g._cdOnce=null;g._cdDefender=b;g._cdDmg=dmg;await g.combatDamageTriggers(a,att);await flush(g);};
const ent=async(g,p,card)=>{const pm=await g.enterPerm(p,card);if(pm.card.etbOps)await g.trigger(p,pm,pm.card.etbOps,{perm:pm},'ETB');await g.creatureEntered(p,pm);await g.permEntered(p,pm);await flush(g);return pm;};
const tok=(n='Tok',ty='Token Creature — Soldier',p=1,t=1)=>{const c=S(n,ty,'','',p,t);c.token=true;return c;};
const cnt=(p,name)=>p.battlefield.filter(b=>b.card.name===name).length;
const oppLife=(g,a)=>g.opponentsOf(a).reduce((s,q)=>s+q.life,0);
const lib=(a,cards)=>{a.library.push(...cards);};

// ---------------- conditional enters-tapped lands
await T('Castle Ardenvale',async()=>{let g=fresh();let [a]=g.players;W(g,a,1,'Plains');let pm=await PLc(g,a,C('Castle Ardenvale'));ok('Castle Ardenvale: Plains -> untapped',pm&&!pm.tapped);
  g=fresh();[a]=g.players;W(g,a,2,'Island');pm=await PLc(g,a,C('Castle Ardenvale'));ok('Castle Ardenvale: no Plains -> tapped',pm&&pm.tapped);});
await T('Turbulent Springs',async()=>{let g=fresh();let [a,b,c]=g.players;W(g,b,4,'Forest');W(g,c,4,'Forest');let pm=await PLc(g,a,C('Turbulent Springs'));ok('Turbulent Springs: opponents control 8 lands -> untapped',pm&&!pm.tapped);
  g=fresh();[a,b,c]=g.players;W(g,b,4,'Forest');W(g,c,3,'Forest');W(g,a,5,'Island');pm=await PLc(g,a,C('Turbulent Springs'));ok('Turbulent Springs: opponents control 7 lands (you 5) -> tapped',pm&&pm.tapped);});
await T('Training Center',async()=>{let g=fresh(3);let [a]=g.players;let pm=await PLc(g,a,C('Training Center'));ok('Training Center: two opponents -> untapped',pm&&!pm.tapped);
  g=fresh(2);[a]=g.players;pm=await PLc(g,a,C('Training Center'));ok('Training Center: one opponent -> tapped',pm&&pm.tapped);});
await T('Primal Beyond',async()=>{let g=fresh();let [a]=g.players;a.hand=[S('Elemmy','Creature — Elemental','{2}','',2,2)];let pm=await PLc(g,a,C('Primal Beyond'));ok('Primal Beyond: Elemental in hand -> untapped',pm&&!pm.tapped);
  g=fresh();[a]=g.players;a.hand=[bear()];pm=await PLc(g,a,C('Primal Beyond'));ok('Primal Beyond: no Elemental in hand -> tapped',pm&&pm.tapped);});
// ENGINE BUG (last case: 'legendary creature' matched as a type-line substring, so a Legendary Artifact Creature does not count)
await T('Minas Tirith enters',async()=>{let g=fresh();let [a]=g.players;put(g,a,S('Lord','Legendary Creature — Human','{2}','',2,2));let pm=await PLc(g,a,C('Minas Tirith'));ok('Minas Tirith: legendary creature -> untapped',pm&&!pm.tapped);
  g=fresh();[a]=g.players;put(g,a,bear());put(g,a,S('Relic','Legendary Artifact','{2}','',0,0));pm=await PLc(g,a,C('Minas Tirith'));ok('Minas Tirith: nonlegendary creature + legendary noncreature -> tapped',pm&&pm.tapped);
  g=fresh();[a]=g.players;put(g,a,S('Golem Lord','Legendary Artifact Creature — Golem','{2}','',2,2));pm=await PLc(g,a,C('Minas Tirith'));ok('Minas Tirith: legendary ARTIFACT creature -> untapped',pm&&!pm.tapped);});
await T('Mistrise Village enters',async()=>{let g=fresh();let [a]=g.players;W(g,a,1,'Forest');let pm=await PLc(g,a,C('Mistrise Village'));ok('Mistrise Village: Forest -> untapped',pm&&!pm.tapped);
  g=fresh();[a]=g.players;W(g,a,1,'Mountain');pm=await PLc(g,a,C('Mistrise Village'));ok('Mistrise Village: Mountain -> untapped',pm&&!pm.tapped);
  g=fresh();[a]=g.players;W(g,a,2,'Plains');pm=await PLc(g,a,C('Mistrise Village'));ok('Mistrise Village: neither -> tapped',pm&&pm.tapped);});

// ---------------- Jadar
// ENGINE BUG (condition "if you control no creatures with decayed" ignored; token lacks decayed)
await T('Jadar, Ghoulcaller of Nephalia',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Jadar, Ghoulcaller of Nephalia'));await g.fireTriggers(a,'end');await flush(g);const z=a.battlefield.filter(b=>b.card.name==='Zombie');ok('Jadar: no decayed creature -> Zombie created',z.length===1);ok('Jadar: Zombie token has decayed',z[0]&&(z[0].card.kw||[]).includes('decayed'),JSON.stringify(z[0]&&z[0].card.kw));
  await g.fireTriggers(a,'end');await flush(g);ok('Jadar: decayed Zombie already controlled -> no second Zombie',a.battlefield.filter(b=>b.card.name==='Zombie').length===1,String(a.battlefield.filter(b=>b.card.name==='Zombie').length));});

// ---------------- Welcoming Vampire
await T('Welcoming Vampire',async()=>{const g=fresh();const [a,b]=g.players;await ent(g,a,C('Welcoming Vampire'));let h=a.hand.length;ok('Welcoming Vampire: itself entering does not draw',a.hand.length===h);
  await ent(g,a,S('Big','Creature — Ogre','{3}','',3,3));ok('Welcoming Vampire: power 3 creature -> no draw',a.hand.length===h);
  await ent(g,b,bear());ok('Welcoming Vampire: opponent creature -> no draw',a.hand.length===h);
  await ent(g,a,bear());ok('Welcoming Vampire: power 2 creature -> draw',a.hand.length===h+1);
  await ent(g,a,bear());ok('Welcoming Vampire: second one same turn -> no draw',a.hand.length===h+1);
  g.turn++;await ent(g,a,elf(1,1));ok('Welcoming Vampire: next turn -> draws again',a.hand.length===h+2);});
await T('Welcoming Vampire once-per-turn not used up by non-qualifying',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Welcoming Vampire'));const h=a.hand.length;await ent(g,a,S('Big','Creature — Ogre','{3}','',4,4));await ent(g,a,bear());ok('Welcoming Vampire: big creature first does not consume the once-per-turn',a.hand.length===h+1);});

// ---------------- Containment Construct
await T('Containment Construct',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Containment Construct'));const c=bear();a.hand=[c];await g.discardCard(a,c);await flush(g);ok('Containment Construct: discarded card exiled',a.exile.includes(c)&&!a.graveyard.includes(c));W(g,a,2,'Forest');ok('Containment Construct: may play it this turn',!!g.castMode(a,c,'exile'));
  await g.cleanup(a);g.turn++;ok('Containment Construct: not after this turn',!g.castMode(a,c,'exile'));
  const d=bear();b.hand=[d];await g.discardCard(b,d);await flush(g);ok('Containment Construct: opponent discard -> nothing',b.graveyard.includes(d)&&!a.exile.includes(d));});

// ---------------- Hofri
await T('Hofri Ghostforge',async()=>{const g=fresh();const [a,b]=g.players;const h=put(g,a,C('Hofri Ghostforge'));const bc=bear();const x=put(g,a,bc);await g.destroy(a,x);await flush(g);const t=a.battlefield.find(z=>z.card.token&&z.card.hofriCard===bc);ok('Hofri: own nontoken dies -> exiled + Spirit token copy',a.exile.includes(bc)&&!!t&&/Spirit/.test(t.card.type));
  if(t){g.refreshStatics();ok('Hofri: Spirit token gets +1/+1',g.powerOf(a,t)===3,String(g.powerOf(a,t)));await g.destroy(a,t);await flush(g);ok('Hofri: token leaves -> exiled card to graveyard',a.graveyard.includes(bc)&&!a.exile.includes(bc));}
  const tk=put(g,a,tok());const n=a.battlefield.length;await g.destroy(a,tk);await flush(g);ok('Hofri: token dies -> no copy',a.battlefield.length===n-1);
  const oc=bear();const ob=opp(g,b,oc);await g.destroy(b,ob);await flush(g);ok('Hofri: opponent creature dies -> not exiled',b.graveyard.includes(oc)&&!a.battlefield.some(z=>z.card.hofriCard===oc));
  await g.destroy(a,h);await flush(g);ok('Hofri: Hofri itself dies -> no copy of itself',!a.battlefield.some(z=>z.card.hofriCard&&z.card.name==='Hofri Ghostforge'));});

// ---------------- Tersa
await T('Tersa Lightshatter',async()=>{let g=fresh();let [a,b]=g.players;let t=put(g,a,C('Tersa Lightshatter'));a.graveyard=[...Array(7)].map(()=>bear());await g.attackTriggers(a,[{attacker:t,defender:b}]);await flush(g);ok('Tersa: 7 cards in graveyard -> exile one, playable',a.graveyard.length===6&&a.exile.length===1&&(a.exileCast||[]).some(e=>e.card===a.exile[0]));
  g=fresh();[a,b]=g.players;t=put(g,a,C('Tersa Lightshatter'));a.graveyard=[...Array(6)].map(()=>bear());await g.attackTriggers(a,[{attacker:t,defender:b}]);await flush(g);ok('Tersa: 6 cards in graveyard -> nothing',a.graveyard.length===6&&a.exile.length===0);
  g=fresh();[a,b]=g.players;t=put(g,a,C('Tersa Lightshatter'));const o=put(g,a,bear());a.graveyard=[...Array(8)].map(()=>bear());await g.attackTriggers(a,[{attacker:o,defender:b}]);await flush(g);ok('Tersa: other creature attacks -> nothing',a.graveyard.length===8);});

// ---------------- Astral Cornucopia
await T('Astral Cornucopia',async()=>{const g=fresh();const [a]=g.players;const pm=put(g,a,C('Astral Cornucopia'));pm.charge=3;ok('Astral Cornucopia: 3 charge -> 3 mana',g.availableMana(a)===3,String(g.availableMana(a)));pm.charge=0;ok('Astral Cornucopia: 0 charge -> 0 mana',g.availableMana(a)===0,String(g.availableMana(a)));
  const pm2=await g.enterPerm(a,C('Astral Cornucopia'),{x:2});ok('Astral Cornucopia: enters with X=2 charge',pm2.charge===2);});

// ---------------- Goldvein Hydra
await T('Goldvein Hydra',async()=>{const g=fresh();const [a]=g.players;const h=put(g,a,C('Goldvein Hydra'));h.counters=4;await g.destroy(a,h);await flush(g);const tr=a.battlefield.filter(b=>b.card.name==='Treasure');ok('Goldvein Hydra: dies with power 4 -> 4 tapped treasures',tr.length===4&&tr.every(b=>b.tapped),tr.length+'');
  const h2=put(g,a,C('Goldvein Hydra'));const n=cnt(a,'Treasure');await g.destroy(a,h2);await flush(g);ok('Goldvein Hydra: power 0 -> no treasures',cnt(a,'Treasure')===n);});

// ---------------- Oran-Rief
await T('Oran-Rief, the Vastwood',async()=>{const g=fresh();const [a]=g.players;const o=put(g,a,C('Oran-Rief, the Vastwood'));const gNew=put(g,a,bear(),{enteredTurn:g.turn});gNew.card.colors=['G'];const gOld=put(g,a,bear(),{enteredTurn:g.turn-1});gOld.card.colors=['G'];const r=S('Red','Creature — Goblin','{1}{R}','',2,2);r.colors=['R'];const rNew=put(g,a,r,{enteredTurn:g.turn});
  const opt=abO(g,a,o.card,/oranRief/);ok('Oran-Rief: ability offered',!!opt);if(opt){await g.activate(a,opt);await flush(g);}
  ok('Oran-Rief: green creature entered this turn gets counter',gNew.counters===1);ok('Oran-Rief: older green creature does not',!gOld.counters);ok('Oran-Rief: nongreen new creature does not',!rNew.counters);});

// ---------------- Unbound Flourishing
await T('Unbound Flourishing',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Unbound Flourishing'));const xs=SC('Xsap','Sorcery','{X}{G}','Create X 1/1 green Saproling creature tokens.',1);a.hand=[xs];W(g,a,3,'Forest');await g.cast(a,xs,'hand');await flush(g);const n1=cnt(a,'Saproling');ok('Unbound Flourishing: X sorcery copied (two resolutions)',n1>0&&n1%2===0&&g.log.some(l=>/copies Xsap/.test(l.m)),String(n1));
  const g2=fresh();const [a2]=g2.players;put(g2,a2,C('Unbound Flourishing'));const nx=SC('Div','Sorcery','{2}{U}','Draw two cards.',3);a2.hand=[nx];W(g2,a2,3,'Island');await g2.cast(a2,nx,'hand');await flush(g2);ok('Unbound Flourishing: non-X sorcery not copied',a2.hand.length===2&&!g2.log.some(l=>/copies Div/.test(l.m)),String(a2.hand.length));
  const g3=fresh();const [a3]=g3.players;put(g3,a3,C('Unbound Flourishing'));const xc=SC('Xguy','Creature — Hydra','{X}{G}','',1,0,0);a3.hand=[xc];W(g3,a3,3,'Forest');await g3.cast(a3,xc,'hand');await flush(g3);ok('Unbound Flourishing: X creature spell not copied (only instant/sorcery)',a3.battlefield.filter(b=>b.card.name==='Xguy'||b.card.name==='Xguy token').length<=1&&!g3.log.some(l=>/copies Xguy/.test(l.m)));});
// ---------------- Hit the Mother Lode
// ENGINE BUG (no treasure tokens for the difference)
await T('Hit the Mother Lode',async()=>{const g=fresh();const [a]=g.players;const hm=C('Hit the Mother Lode');a.library.push(SC('Div','Sorcery','{2}{U}','Draw two cards.',3));await g.runOps(a,hm.spellOps,hm,{});await flush(g);const tr=a.battlefield.filter(b=>b.card.name==='Treasure');ok('Hit the Mother Lode: MV 3 discovered -> 7 tapped treasures',tr.length===7&&tr.every(b=>b.tapped),String(tr.length));
  const g2=fresh();const [a2]=g2.players;a2.library.push(SC('Ten','Sorcery','{10}','Draw two cards.',10));await g2.runOps(a2,hm.spellOps,hm,{});await flush(g2);ok('Hit the Mother Lode: MV 10 discovered -> no treasures',cnt(a2,'Treasure')===0);});

// ---------------- Resonating Lute
await T('Resonating Lute mana',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Resonating Lute'));W(g,a,2,'Island');const so=SC('Big Sorc','Sorcery','{3}{R}','Draw two cards.',4);const cr=SC('Big Guy','Creature — Ogre','{3}{R}','',4,4,4);a.hand=[so,cr];ok('Resonating Lute: 2 lands pay a 4-MV sorcery',!!g.castMode(a,so,'hand'));ok('Resonating Lute: 2 lands do NOT pay a 4-MV creature',!g.castMode(a,cr,'hand'));});
// ENGINE BUG ("Activate only if you have seven or more cards in your hand" not enforced)
await T('Resonating Lute draw',async()=>{const g=fresh();const [a]=g.players;const l=put(g,a,C('Resonating Lute'));a.hand=[...Array(7)].map(()=>bear());ok('Resonating Lute: 7 cards in hand -> draw offered',!!abO(g,a,l.card,/^draw$/));a.hand=[...Array(6)].map(()=>bear());ok('Resonating Lute: 6 cards in hand -> draw NOT offered',!abO(g,a,l.card,/^draw$/));});

// ---------------- Disciple of Freyalise
// ENGINE BUG (ETB parsed as a flat "gain 2": no sacrifice, no draw, X not the sacrificed creature's power)
await T('Disciple of Freyalise',async()=>{const g=fresh();const [a]=g.players;put(g,a,S('Fatty','Creature — Beast','{4}','',4,4));const l0=a.life,h0=a.hand.length,n0=a.battlefield.filter(b=>b.card.isCreature).length;await ent(g,a,C('Disciple of Freyalise'));const sacd=a.battlefield.filter(b=>b.card.isCreature).length===n0;ok('Disciple of Freyalise: sacrificed another creature',sacd&&a.graveyard.some(c=>c.name==='Fatty'));ok('Disciple of Freyalise: gain X=4 life and draw 4',a.life===l0+4&&a.hand.length===h0+4,`life+${a.life-l0} hand+${a.hand.length-h0}`);
  const g2=fresh();const [a2]=g2.players;const l1=a2.life,h1=a2.hand.length;await ent(g2,a2,C('Disciple of Freyalise'));ok('Disciple of Freyalise: no other creature -> no life, no cards',a2.life===l1&&a2.hand.length===h1,`life+${a2.life-l1}`);});

// ---------------- Pest Rescuer
// ENGINE BUG (upkeep trigger ignores "if you don't control a Pest creature token" and adds a spurious "gain 1 life")
await T('Pest Rescuer upkeep',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Pest Rescuer'));const l0=a.life;await g.fireTriggers(a,'upkeep');await flush(g);ok('Pest Rescuer: no Pest -> create one',cnt(a,'Pest')===1);ok('Pest Rescuer: the upkeep trigger gains no life',a.life===l0,String(a.life-l0));
  await g.fireTriggers(b,'upkeep');await flush(g);ok('Pest Rescuer: already controls a Pest -> no new Pest (opponent upkeep)',cnt(a,'Pest')===1,String(cnt(a,'Pest')));});
await T('Pest Rescuer each upkeep',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Pest Rescuer'));g.active=1;await g.fireTriggers(b,'upkeep');await flush(g);ok("Pest Rescuer: triggers on an opponent's upkeep too",cnt(a,'Pest')===1&&cnt(b,'Pest')===0);});
await T('Pest Rescuer lifegain',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Pest Rescuer'));let l=a.life;await g.changeLife(a,3,{name:'x'});ok('Pest Rescuer: gain 3 -> gain 4',a.life===l+4,String(a.life-l));l=a.life;await g.changeLife(a,-3,{name:'x'});ok('Pest Rescuer: loss unaffected',a.life===l-3);const lb=b.life;await g.changeLife(b,3,{name:'x'});ok('Pest Rescuer: opponent gain unaffected',b.life===lb+3);});

// ---------------- Ashaya
// ENGINE BUG (nontoken creatures are not made Forest lands: Ashaya's P/T does not count them)
await T('Ashaya, Soul of the Wild',async()=>{const g=fresh();const [a]=g.players;const as=put(g,a,C('Ashaya, Soul of the Wild'));W(g,a,3,'Forest');g.refreshStatics();const bb=put(g,a,bear());const tk=put(g,a,tok());g.refreshStatics();ok('Ashaya: P/T = lands incl. nontoken creatures (3 lands + Ashaya + Bear = 5)',g.powerOf(a,as)===5&&g.toughOf(a,as)===5,`${g.powerOf(a,as)}/${g.toughOf(a,as)}`);});
await T('Ashaya forests tap for G',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Ashaya, Soul of the Wild'));const bb=put(g,a,bear());const tk=put(g,a,tok());const m=g.manaSrcs(a);ok('Ashaya: nontoken creature taps for G',m.some(s=>s.b===bb&&s.colors.includes('G')));ok('Ashaya: token creature is not a Forest',!m.some(s=>s.b===tk));const sick=put(g,a,bear(),{summoning:true});ok('Ashaya: summoning-sick creature cannot tap for mana',!g.manaSrcs(a).some(s=>s.b===sick));});

// ---------------- Karametra's Acolyte
// ENGINE BUG (adds a flat {G} instead of G equal to devotion to green)
await T("Karametra's Acolyte",async()=>{const g=fresh();const [a]=g.players;put(g,a,C("Karametra's Acolyte"));put(g,a,SC('GG Guy','Creature — Elf','{G}{G}','',2,2,2));const m=g.manaSrcs(a).find(s=>s.b&&s.b.card.name==="Karametra's Acolyte");ok("Karametra's Acolyte: devotion 3 -> adds GGG",m&&m.amount===3,String(m&&m.amount));});

// ---------------- Tribute to the World Tree
// ENGINE BUG (always draws; the power>=3 condition and the "otherwise two +1/+1 counters" branch are ignored)
await T('Tribute to the World Tree',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Tribute to the World Tree'));let h=a.hand.length;const big=await ent(g,a,S('Big','Creature — Ogre','{3}','',3,3));ok('Tribute: power 3 enters -> draw, no counters',a.hand.length===h+1&&!big.counters);h=a.hand.length;const sm=await ent(g,a,bear());ok('Tribute: power 2 enters -> two +1/+1 counters, no draw',sm.counters===2&&a.hand.length===h,`counters=${sm.counters} drew=${a.hand.length-h}`);h=a.hand.length;await ent(g,b,S('Big2','Creature — Ogre','{3}','',4,4));ok('Tribute: opponent creature -> nothing',a.hand.length===h);});

// ---------------- Genesis Wave
await T('Genesis Wave',async()=>{const g=fresh();const [a]=g.players;const gw=C('Genesis Wave');const c2=SC('Two','Creature — Elf','{1}{G}','',2,2,2),c4=SC('Four','Creature — Beast','{3}{G}','',4,4,4),so=SC('Sorc','Sorcery','{G}','Draw a card.',1),ld=L('Forest');a.library=[...a.library.slice(0,10),c4,so,ld,c2];await g.runOps(a,gw.spellOps,gw,{x:4});await flush(g);ok('Genesis Wave: permanents with MV<=X put onto battlefield (creature MV2, land)',a.battlefield.some(b=>b.card===c2)&&a.battlefield.some(b=>b.card===ld));ok('Genesis Wave: MV4 permanent with X=4 included',a.battlefield.some(b=>b.card===c4));ok('Genesis Wave: sorcery goes to graveyard',a.graveyard.includes(so));
  const g2=fresh();const [a2]=g2.players;const d2=SC('Two','Creature — Elf','{1}{G}','',2,2,2),d4=SC('Four','Creature — Beast','{3}{G}','',4,4,4);a2.library=[...a2.library.slice(0,10),d4,d2,L('Forest')];await g2.runOps(a2,gw.spellOps,gw,{x:3});await flush(g2);ok('Genesis Wave: MV4 with X=3 -> graveyard, not battlefield',a2.graveyard.includes(d4)&&!a2.battlefield.some(b=>b.card===d4)&&a2.battlefield.some(b=>b.card===d2));ok('Genesis Wave: only X cards revealed (4th card stays in library)',a2.library.includes(d4)===false&&a2.library.length===10,String(a2.library.length));});

// ---------------- Aqueous Form
await T('Aqueous Form',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());const y=put(g,a,bear());const af=put(g,a,C('Aqueous Form'));af.attachedTo=x.id;g.refreshStatics();const v=opp(g,b,bear());ok('Aqueous Form: enchanted creature cannot be blocked',!g.canBlock(v,x));ok('Aqueous Form: other creature can be blocked',g.canBlock(v,y));});

// ---------------- Sheltered by Ghosts
// ENGINE BUG (ETB "exile target nonland permanent an opponent controls until this Aura leaves" not implemented)
await T('Sheltered by Ghosts',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());const v=opp(g,b,S('Threat','Creature — Horror','{4}','',5,5));const ld=opp(g,b,L('Forest'));const sb=C('Sheltered by Ghosts');a.hand=[sb];W(g,a,2,'Plains');await g.cast(a,sb,'hand',x);await flush(g);const ap=a.battlefield.find(z=>z.card===sb);ok('Sheltered by Ghosts: attached to own creature',ap&&ap.attachedTo===x.id);ok('Sheltered by Ghosts: opponent nonland permanent exiled',!b.battlefield.includes(v)&&b.exile.includes(v.card));ok('Sheltered by Ghosts: land not exiled',b.battlefield.includes(ld));if(ap){await g.destroy(a,ap);await flush(g);ok('Sheltered by Ghosts: returns when aura leaves',b.battlefield.some(z=>z.card===v.card));}});

// ---------------- Endurance
await T('Endurance',async()=>{const g=fresh();const [a,b,c]=g.players;b.graveyard=[bear(),bear(),bear()];c.graveyard=[bear()];a.graveyard=[bear()];const bl=b.library.length;const e=C('Endurance');await g.runOps(a,e.etbOps,e,{});ok('Endurance: target player graveyard to bottom of library',b.graveyard.length===0&&b.library.length===bl+3);ok('Endurance: only one player affected',c.graveyard.length===1&&a.graveyard.length===1);});

// ---------------- Twinflame Travelers
await T('Twinflame Travelers',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Twinflame Travelers'));put(g,a,S('Lander','Creature — Elemental','{1}','Landfall — Whenever a land you control enters, you gain 1 life.',1,1));let l0=a.life;const f=L('Forest');a.hand.push(f);await g.playLand(a,f);await flush(g);ok('Twinflame Travelers: Elemental trigger doubled',a.life===l0+2,String(a.life-l0));
  const g2=fresh();const [a2]=g2.players;put(g2,a2,C('Twinflame Travelers'));put(g2,a2,S('Lander','Creature — Elf','{1}','Landfall — Whenever a land you control enters, you gain 1 life.',1,1));l0=a2.life;const f2=L('Forest');a2.hand.push(f2);await g2.playLand(a2,f2);await flush(g2);ok('Twinflame Travelers: non-Elemental trigger not doubled',a2.life===l0+1,String(a2.life-l0));});

// ---------------- Fallaji Wayfarer
await T('Fallaji Wayfarer',async()=>{const c=C('Fallaji Wayfarer');ok('Fallaji Wayfarer: is all colors',['W','U','B','R','G'].every(x=>c.colors.includes(x)));});

// ---------------- Minas Tirith ability
// ENGINE BUG ("Activate only if you attacked with two or more creatures this turn" not enforced)
await T('Minas Tirith draw',async()=>{const g=fresh();const [a,b]=g.players;const mt=put(g,a,C('Minas Tirith'));W(g,a,2,'Plains');ok('Minas Tirith: no attack this turn -> draw NOT offered',!abO(g,a,mt.card,/^draw$/));const x=put(g,a,bear());x.tapped=true;a.attackedWithTurn=g.turn;a.attackedWith=1;a.attackedTurn=g.turn;ok('Minas Tirith: attacked with one creature -> draw NOT offered',!abO(g,a,mt.card,/^draw$/));a.attackedWith=2;ok('Minas Tirith: attacked with two -> draw offered',!!abO(g,a,mt.card,/^draw$/));});

// ---------------- Parallel Lives
await T('Parallel Lives',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Parallel Lives'));await g.runOps(a,[{op:'tokens',n:1,pt:[1,1],kw:[],types:'Soldier',tcolors:['W']}],{name:'x'},{});ok('Parallel Lives: your creature token doubled',cnt(a,'Soldier')===2);await g.makeArtifactTokens(a,'treasure',1,false);ok('Parallel Lives: noncreature token doubled',cnt(a,'Treasure')===2);await g.runOps(b,[{op:'tokens',n:1,pt:[1,1],kw:[],types:'Soldier',tcolors:['W']}],{name:'x'},{});ok("Parallel Lives: opponent's tokens not doubled",cnt(b,'Soldier')===1);});

// ---------------- Ainok Strike Leader
// ENGINE BUG (second check: attackingTokens op ignores the parsed Goblin type / red color)
await T('Ainok Strike Leader',async()=>{const g=fresh(3);const [a,b,c]=g.players;const ai=put(g,a,C('Ainok Strike Leader'));const atk=[{attacker:ai,defender:b}];await g.attackTriggers(a,atk);await flush(g);const toks=atk.slice(1);ok('Ainok: attacks -> one token attacking each opponent',toks.length===2&&toks.some(t=>t.defender===b)&&toks.some(t=>t.defender===c)&&toks.every(t=>t.attacker.tapped));ok('Ainok: tokens are 1/1 red Goblins',toks.length&&toks.every(t=>/Goblin/.test(t.attacker.card.type)&&(t.attacker.card.colors||[]).includes('R')),toks[0]&&toks[0].attacker.card.type+' '+JSON.stringify(toks[0].attacker.card.colors));
  const g2=fresh(3);const [a2,b2]=g2.players;put(g2,a2,C('Ainok Strike Leader'));const cm=put(g2,a2,S('Boss','Legendary Creature — Dog','{3}','',3,3));cm.card.isCommander=true;const atk2=[{attacker:cm,defender:b2}];await g2.attackTriggers(a2,atk2);ok('Ainok: commander attacks alone -> tokens',atk2.length===3);
  const g3=fresh(3);const [a3,b3]=g3.players;put(g3,a3,C('Ainok Strike Leader'));const o=put(g3,a3,bear());const atk3=[{attacker:o,defender:b3}];await g3.attackTriggers(a3,atk3);ok('Ainok: other non-commander attacks -> no tokens',atk3.length===1);
  const g4=fresh(3);const [a4,b4]=g4.players;const ai4=put(g4,a4,C('Ainok Strike Leader'));const cm4=put(g4,a4,S('Boss','Legendary Creature — Dog','{3}','',3,3));cm4.card.isCommander=true;const atk4=[{attacker:ai4,defender:b4},{attacker:cm4,defender:b4}];await g4.attackTriggers(a4,atk4);ok('Ainok: both attack -> triggers once (2 tokens)',atk4.length===4,String(atk4.length));});

// ---------------- Krenko, Tin Street Kingpin
// ENGINE BUG (second check: tokens parsed without types/colors -> not red Goblins)
await T('Krenko, Tin Street Kingpin',async()=>{const g=fresh();const [a,b]=g.players;const k=put(g,a,C('Krenko, Tin Street Kingpin'));k.counters=2;await g.attackTriggers(a,[{attacker:k,defender:b}]);await flush(g);const gob=a.battlefield.filter(x=>x.card.token&&x.card.isCreature);ok('Krenko: counter added first, then tokens = power (1+3=4)',k.counters===3&&gob.length===4,`${k.counters} ${gob.length}`);ok('Krenko: tokens are red Goblins',gob.length&&gob.every(x=>/Goblin/.test(x.card.type)&&(x.card.colors||[]).includes('R')),gob[0]&&gob[0].card.type);
  const o=put(g,a,bear());const n=a.battlefield.length;await g.attackTriggers(a,[{attacker:o,defender:b}]);ok('Krenko: other attacker -> nothing',a.battlefield.length===n);});

// ---------------- Eshki
// ENGINE BUG (draws on every creature spell; power 4 / power 6 conditions ignored, no damage)
await T("Eshki, Temur's Roar",async()=>{const g=fresh();const [a]=g.players;const e=put(g,a,C("Eshki, Temur's Roar"));const castC=async(p,t)=>{const c=SC('C'+p,'Creature — Beast','{1}',''  ,1,p,t);a.hand.push(c);W(g,a,1,'Forest');await g.cast(a,c,'hand');await flush(g);};
  let h=a.hand.length,ol=oppLife(g,a);await castC(2,2);ok('Eshki: power 2 creature -> counter, no draw, no damage',e.counters===1&&a.hand.length===h&&oppLife(g,a)===ol,`c=${e.counters} drew=${a.hand.length-h}`);
  h=a.hand.length;ol=oppLife(g,a);await castC(4,4);ok('Eshki: power 4 -> draw, no damage',e.counters===2&&a.hand.length===h+1&&oppLife(g,a)===ol);
  h=a.hand.length;ol=oppLife(g,a);await castC(6,6);const pw=g.powerOf(a,e);ok('Eshki: power 6 -> draw and damage = Eshki power to each opponent',a.hand.length===h+1&&ol-oppLife(g,a)===pw*g.opponentsOf(a).length,`drew=${a.hand.length-h} dmg=${ol-oppLife(g,a)} pw=${pw}`);
  h=a.hand.length;const so=SC('Div','Sorcery','{1}','Scry 1.',1);a.hand.push(so);W(g,a,1,'Forest');const c0=e.counters;await g.cast(a,so,'hand');await flush(g);ok('Eshki: noncreature spell -> nothing',e.counters===c0);});

// ---------------- Baron Bertram Graywater
await T('Baron Bertram Graywater (artifact token)',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Baron Bertram Graywater'));await g.makeArtifactTokens(a,'treasure',1,false);await flush(g);ok('Baron: Treasure token enters -> Vampire',cnt(a,'Vampire Rogue')===1);await g.makeArtifactTokens(a,'treasure',1,false);await flush(g);ok('Baron: second token same turn -> no more',cnt(a,'Vampire Rogue')===1);});
// ENGINE BUG (the generic creature-'tokens' op never calls permEntered, so 'permEnters' token triggers miss creature tokens)
await T('Baron Bertram Graywater',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Baron Bertram Graywater'));const mkT=async(p)=>{await g.runOps(p,[{op:'tokens',n:1,pt:[1,1],kw:[],types:'Soldier',tcolors:['W']}],{name:'x'},{});await flush(g);};
  await ent(g,a,bear());ok('Baron: nontoken enters -> nothing',cnt(a,'Vampire Rogue')===0);await mkT(b);ok("Baron: opponent's token -> nothing",cnt(a,'Vampire Rogue')===0);
  await mkT(a);const v=a.battlefield.filter(x=>x.card.name==='Vampire Rogue');ok('Baron: your token enters -> 1/1 lifelink Vampire',v.length===1&&(v[0].card.kw||[]).includes('lifelink'));await mkT(a);ok('Baron: second token same turn -> no more',cnt(a,'Vampire Rogue')===1,String(cnt(a,'Vampire Rogue')));g.turn++;await mkT(a);ok('Baron: next turn -> again',cnt(a,'Vampire Rogue')===2);});

// ---------------- Sanctum Seeker
await T('Sanctum Seeker',async()=>{const g=fresh();const [a,b]=g.players;const ss=put(g,a,C('Sanctum Seeker'));const v2=put(g,a,S('Vamp','Creature — Vampire','{1}','',1,1));const o=put(g,a,bear());let l=a.life,ol=oppLife(g,a);await g.attackTriggers(a,[{attacker:o,defender:b}]);await flush(g);ok('Sanctum Seeker: non-Vampire attacks -> nothing',a.life===l&&oppLife(g,a)===ol);
  await g.attackTriggers(a,[{attacker:ss,defender:b},{attacker:v2,defender:b}]);await flush(g);const n=g.opponentsOf(a).length;ok('Sanctum Seeker: two Vampires attack -> each opp loses 2, you gain 2',a.life===l+2&&ol-oppLife(g,a)===2*n,`gain ${a.life-l} lost ${ol-oppLife(g,a)}`);});
await T('Sanctum Seeker opponent vampire',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Sanctum Seeker'));const v=opp(g,b,S('Vamp','Creature — Vampire','{1}','',1,1));const l=a.life;g.active=1;await g.attackTriggers(b,[{attacker:v,defender:a}]);await flush(g);ok("Sanctum Seeker: opponent's Vampire attacks -> nothing",a.life===l);});

// ---------------- Doran
await T('Doran, the Siege Tower',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Doran, the Siege Tower'));const w=put(g,a,S('Wally','Creature — Wall','{2}','',1,4));b.ai.chooseBlocks=()=>new Map();const l=b.life;await g.combatPhase(a,[{attacker:w,defender:b}]);ok('Doran: unblocked 1/4 deals 4',l-b.life===4,String(l-b.life));});
await T('Doran blocks',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Doran, the Siege Tower'));const at=put(g,a,S('Atk','Creature — Ogre','{2}','',3,3));const bl=opp(g,b,S('Blk','Creature — Wall','{2}','',1,5));b.ai.chooseBlocks=()=>new Map([[at,bl]]);await g.combatPhase(a,[{attacker:at,defender:b}]);ok("Doran: opponent's 1/5 blocker deals 5 to a 3/3 (each creature)",!a.battlefield.includes(at));ok('Doran: 3/3 attacker deals 3 to the 1/5',b.battlefield.includes(bl));});

// ---------------- Sapling of Colfenor
// ENGINE BUG (op 'sapling' has no implementation in runOpsCore: nothing happens)
await T('Sapling of Colfenor',async()=>{const g=fresh();const [a,b]=g.players;const sp=put(g,a,C('Sapling of Colfenor'));const top=S('Top','Creature — Treefolk','{3}','',2,5);a.library.push(top);const l=a.life;await g.attackTriggers(a,[{attacker:sp,defender:b}]);await flush(g);ok('Sapling: creature on top -> gain toughness 5, lose power 2, to hand',a.life===l+3&&a.hand.includes(top),`life ${a.life-l}`);
  const top2=SC('Sorc','Sorcery','{1}','Draw a card.',1);a.library.push(top2);const l2=a.life,h=a.hand.length;await g.attackTriggers(a,[{attacker:sp,defender:b}]);await flush(g);ok('Sapling: noncreature on top -> stays, no life change',a.library[a.library.length-1]===top2&&a.life===l2&&a.hand.length===h);});

// ---------------- Armored Skyhunter
await T('Armored Skyhunter',async()=>{const g=fresh();const [a,b]=g.players;const sk=put(g,a,C('Armored Skyhunter'));const eq=S('Sword','Artifact — Equipment','{2}','Equipped creature gets +2/+2.\nEquip {2}');const fill=()=>SC('Div','Sorcery','{2}','Draw two cards.',3);a.library.push(fill(),fill(),eq,fill(),fill(),fill());const L0=a.library.length;await g.attackTriggers(a,[{attacker:sk,defender:b}]);await flush(g);const ep=a.battlefield.find(x=>x.card===eq);ok('Armored Skyhunter: Equipment in top six onto battlefield',!!ep);ok('Armored Skyhunter: may attach it to a creature',ep&&a.battlefield.some(x=>x.id===ep.attachedTo&&x.card.isCreature));ok('Armored Skyhunter: rest on bottom (library size -1)',a.library.length===L0-1&&a.library.slice(0,5).every(c=>c.name==='Div'));
  const g2=fresh();const [a2,b2]=g2.players;const sk2=put(g2,a2,C('Armored Skyhunter'));const eq2=S('Sword','Artifact — Equipment','{2}','Equipped creature gets +2/+2.\nEquip {2}');a2.library.push(eq2,...[...Array(6)].map(()=>SC('Div','Sorcery','{2}','Draw two cards.',3)));await g2.attackTriggers(a2,[{attacker:sk2,defender:b2}]);await flush(g2);ok('Armored Skyhunter: Equipment 7th from top -> not found',!a2.battlefield.some(x=>x.card===eq2));
  const g3=fresh();const [a3,b3]=g3.players;const sk3=put(g3,a3,C('Armored Skyhunter'));const cr=S('Guy','Creature — Knight','{2}','',5,5);a3.library.push(cr);await g3.attackTriggers(a3,[{attacker:sk3,defender:b3}]);await flush(g3);ok('Armored Skyhunter: non-Aura/Equipment not put onto battlefield',!a3.battlefield.some(x=>x.card===cr));});

// ---------------- Forge Anew
await T('Forge Anew',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Forge Anew'));const e=put(g,a,S('Sword','Artifact — Equipment','{2}','Equipped creature gets +2/+2.\nEquip {3}'));const c=put(g,a,bear());const c2=put(g,a,bear());
  const eo=()=>g.abilityOptions(a,{instant:true}).find(x=>x.card===e.card&&x.ab.label==='equip');g.phase='combat';ok('Forge Anew: equip at instant speed during your turn (first one free with no mana)',!!eo());
  const o=eo();if(o){await g.activate(a,o);await flush(g);}ok('Forge Anew: equipped for {0}',a.battlefield.some(x=>x.id===e.attachedTo));ok('Forge Anew: second equip this turn not free (no mana -> not offered)',!eo());W(g,a,3,'Plains');ok('Forge Anew: second equip payable with {3}',!!eo());
  g.active=1;ok("Forge Anew: not on an opponent's turn",!g.abilityOptions(a,{instant:true}).some(x=>x.card===e.card&&x.ab.label==='equip'));
  g.active=0;g.turn++;a.battlefield=a.battlefield.filter(x=>!x.card.isLand);ok('Forge Anew: next own turn first equip free again',!!eo());});

// ---------------- Vincent
await T('Vincent, Vengeful Atoner',async()=>{const g=fresh(3);const [a,b,c]=g.players;const v=put(g,a,C('Vincent, Vengeful Atoner'));v.counters=7-v.card.power;const lb=b.life,lc=c.life;await cd(g,a,b,v,7);ok('Vincent: power 7 hits opponent -> each other opponent takes that much',lc-c.life===7,String(lc-c.life));ok('Vincent: damaged player not hit again',b.life===lb);
  const g2=fresh(3);const [a2,b2,c2]=g2.players;const v2=put(g2,a2,C('Vincent, Vengeful Atoner'));v2.counters=5-v2.card.power;const l2=c2.life;await cd(g2,a2,b2,v2,5);ok('Vincent: power 5 (6 after its own counter) -> no chaos damage',c2.life===l2,String(l2-c2.life));});

// ---------------- Deceptive Frostkite
// ENGINE BUG (copy ignores "with power 4 or greater", and copy does not keep Dragon type / flying)
await T('Deceptive Frostkite',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,bear());opp(g,b,S('OppBig','Creature — Giant','{5}','',6,6));const pm=await g.enterPerm(a,C('Deceptive Frostkite'));ok('Deceptive Frostkite: only a 2/2 -> does not copy it',pm.card.name==='Deceptive Frostkite',pm.card.name);
  const g2=fresh();const [a2]=g2.players;put(g2,a2,S('Big','Creature — Giant','{5}','',5,5));put(g2,a2,bear());const pm2=await g2.enterPerm(a2,C('Deceptive Frostkite'));g2.refreshStatics();ok('Deceptive Frostkite: copies power-4+ creature',pm2.card.name==='Big');ok('Deceptive Frostkite: copy is a Dragon with flying',/Dragon/.test(pm2.card.type)&&pm2.card.kw.includes('flying'),pm2.card.type+' '+JSON.stringify(pm2.card.kw));});

// ---------------- Scourge of Valkas
// ENGINE BUG (X = number of Dragons you control is read from ctx.x, which is unset for an ETB trigger -> 0 damage)
await T('Scourge of Valkas',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Scourge of Valkas'));const ol=oppLife(g,a);await ent(g,a,S('Drake','Creature — Dragon','{2}','Flying',2,2));ok('Scourge: another Dragon enters -> 2 damage (2 Dragons)',ol-oppLife(g,a)===2,String(ol-oppLife(g,a)));
  const ol2=oppLife(g,a);await ent(g,a,bear());ok('Scourge: non-Dragon enters -> no damage',oppLife(g,a)===ol2);const ol3=oppLife(g,a);await ent(g,b,S('OD','Creature — Dragon','{2}','',2,2));ok("Scourge: opponent's Dragon -> no damage",oppLife(g,a)===ol3);});

// ---------------- Satsuki
await T('Satsuki, the Living Lore',async()=>{const g=fresh();const [a,b]=g.players;const st=put(g,a,C('Satsuki, the Living Lore'));const sg=put(g,a,S('Saga Test','Enchantment — Saga','{2}','(As this Saga enters and after your draw step, add a lore counter.)\nI — Draw a card.\nII — Draw a card.\nIII — Draw a card.'));sg.lore=1;const os=opp(g,b,S('Saga Opp','Enchantment — Saga','{2}','(As this Saga enters and after your draw step, add a lore counter.)\nI — Draw a card.\nII — Draw a card.\nIII — Draw a card.'));os.lore=1;
  ok('Satsuki: not at instant speed',!g.abilityOptions(a,{instant:true}).some(x=>x.card===st.card));g.active=1;ok("Satsuki: not on opponent's turn",!g.abilityOptions(a,{}).some(x=>x.card===st.card));g.active=0;const o=abO(g,a,st.card);ok('Satsuki: sorcery speed in main phase',!!o);if(o){await g.activate(a,o);await flush(g);}ok('Satsuki: lore counter on your Saga',sg.lore===2);ok("Satsuki: opponent's Saga untouched",os.lore===1);});

// ---------------- Elvish Warmaster
await T('Elvish Warmaster',async()=>{const g=fresh();const [a,b]=g.players;await ent(g,a,C('Elvish Warmaster'));const nT=()=>a.battlefield.filter(x=>x.card.token).length;ok('Elvish Warmaster: itself entering -> no token',nT()===0);await ent(g,a,bear());ok('Elvish Warmaster: non-Elf -> no token',nT()===0);await ent(g,b,elf());ok("Elvish Warmaster: opponent's Elf -> no token",nT()===0);await ent(g,a,elf());ok('Elvish Warmaster: Elf enters -> token',nT()===1&&/Elf/.test(a.battlefield.find(x=>x.card.token).card.type));await ent(g,a,elf());ok('Elvish Warmaster: second Elf same turn -> no token',nT()===1,String(nT()));g.turn++;await ent(g,a,elf());ok('Elvish Warmaster: next turn -> token',nT()===2);});

// ---------------- Timberwatch Elf
await T('Timberwatch Elf',async()=>{const g=fresh();const [a,b]=g.players;const tw=put(g,a,C('Timberwatch Elf'));put(g,a,elf());opp(g,b,elf());put(g,a,bear());const t=put(g,a,S('Big','Creature — Ogre','{3}','',4,4));const o=abO(g,a,tw.card);ok('Timberwatch Elf: option',!!o);if(o){await g.activate(a,o);await flush(g);}const pumped=a.battlefield.filter(x=>x.card.isCreature&&g.powerOf(a,x)>(x.card.power||0));ok('Timberwatch Elf: +3/+3 (3 Elves on battlefield, opponent Elf counted, Bear not)',pumped.length===1&&g.powerOf(a,pumped[0])-pumped[0].card.power===3&&g.toughOf(a,pumped[0])-pumped[0].card.toughness===3,pumped.map(x=>x.card.name+g.powerOf(a,x)).join());});

// ---------------- Spellseeker
await T('Spellseeker',async()=>{const g=fresh();const [a]=g.players;const s3=SC('Big Sorc','Sorcery','{2}{U}','Draw two cards.',3),cr=SC('Guy','Creature — Elf','{G}','',1,1,1),in2=SC('Quick','Instant','{1}{U}','Draw a card.',2);a.library.push(s3,cr,in2);const sp=C('Spellseeker');await g.runOps(a,sp.etbOps,sp,{});ok('Spellseeker: finds instant MV2',a.hand.includes(in2)&&!a.hand.includes(s3)&&!a.hand.includes(cr));
  const g2=fresh();const [a2]=g2.players;a2.library=[SC('Big Sorc','Sorcery','{2}{U}','Draw two cards.',3),SC('Guy','Creature — Elf','{G}','',1,1,1),L('Island')];const h=a2.hand.length;await g2.runOps(a2,sp.etbOps,sp,{});ok('Spellseeker: no instant/sorcery MV<=2 -> nothing',a2.hand.length===h);});

// ---------------- Ba Sing Se
await T('Ba Sing Se',async()=>{const g=fresh();const [a]=g.players;const bs=put(g,a,C('Ba Sing Se'));W(g,a,3,'Forest');const isEB=x=>x.card===bs.card&&x.ab.ops.some(o=>o.op==='earthbend');ok('Ba Sing Se: not at instant speed',!g.abilityOptions(a,{instant:true}).some(isEB));g.active=1;ok("Ba Sing Se: not on opponent's turn",!g.abilityOptions(a,{}).some(isEB));g.active=0;const o=g.abilityOptions(a,{}).find(isEB);ok('Ba Sing Se: sorcery speed in main phase',!!o);if(o){await g.activate(a,o);await flush(g);}const t=a.battlefield.find(x=>x.card.isLand&&x.card.isCreature);ok('Ba Sing Se: a land became a creature with 2 counters and haste',t&&t.counters===2&&t.card.kw.includes('haste'));});

// ---------------- Katara
await T('Katara, the Fearless',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Katara, the Fearless'));put(g,a,S('Ally Guy','Creature — Human Ally','{1}','Landfall — Whenever a land you control enters, you gain 1 life.',1,1));let l=a.life;const f=L('Forest');a.hand.push(f);await g.playLand(a,f);await flush(g);ok('Katara: Ally trigger doubled',a.life===l+2,String(a.life-l));
  const g2=fresh();const [a2]=g2.players;put(g2,a2,C('Katara, the Fearless'));put(g2,a2,S('Non Ally','Creature — Human','{1}','Landfall — Whenever a land you control enters, you gain 1 life.',1,1));l=a2.life;const f2=L('Forest');a2.hand.push(f2);await g2.playLand(a2,f2);await flush(g2);ok('Katara: non-Ally trigger not doubled',a2.life===l+1,String(a2.life-l));});

// ---------------- Waterbender Ascension
await T('Waterbender Ascension (artifacts pay)',async()=>{const g=fresh();const [a,b]=g.players;const wa=put(g,a,C('Waterbender Ascension'));const x=put(g,a,S('Big','Creature — Ogre','{3}','',4,4));const y=put(g,a,bear());for(let i=0;i<4;i++)put(g,a,S('Rock'+i,'Artifact','{1}','',0,0));const v=opp(g,b,bear());const o=g.abilityOptions(a,{}).find(z=>z.card===wa.card&&z.ab.waterbend);ok('Waterbender Ascension: waterbend payable by tapping 4 artifacts',!!o);if(o){await g.activate(a,o);await flush(g);}ok('Waterbender Ascension: target creature cannot be blocked',!g.canBlock(v,x));ok('Waterbender Ascension: other creature can still be blocked',g.canBlock(v,y));g.turn++;ok('Waterbender Ascension: only this turn',g.canBlock(v,x));});
// ENGINE BUG (waterbend taps your creatures as helpers, then the 'unblockable' op only accepts untapped creatures -> no creature gets the effect)
await T('Waterbender Ascension',async()=>{const g=fresh();const [a,b]=g.players;const wa=put(g,a,C('Waterbender Ascension'));const x=put(g,a,S('Big','Creature — Ogre','{3}','',4,4));const y=put(g,a,bear());W(g,a,4,'Island');const v=opp(g,b,bear());const o=g.abilityOptions(a,{}).find(z=>z.card===wa.card&&z.ab.waterbend);ok('Waterbender Ascension: waterbend option',!!o);if(o){await g.activate(a,o);await flush(g);}ok('Waterbender Ascension (lands available): some creature becomes unblockable',!g.canBlock(v,x)||!g.canBlock(v,y));});
await T('Waterbender Ascension tap helpers',async()=>{const g=fresh();const [a,b]=g.players;const wa=put(g,a,C('Waterbender Ascension'));const x=put(g,a,S('Big','Creature — Ogre','{3}','',4,4));put(g,a,S('Rock','Artifact','{1}','',0,0));put(g,a,S('Rock2','Artifact','{1}','',0,0));W(g,a,2,'Island');ok('Waterbender Ascension: 2 lands + 2 artifacts pay waterbend {4}',g.abilityOptions(a,{}).some(z=>z.card===wa.card&&z.ab.waterbend));});

// ---------------- Cadric
// ENGINE BUG ("legend rule doesn't apply to tokens you control" not parsed: the legendary token copy is immediately put into the graveyard)
await T('Cadric, Soul Kindler',async()=>{const g=fresh();const [a]=g.players;a.ai.opsValue=()=>10;await ent(g,a,C('Cadric, Soul Kindler'));ok('Cadric: itself entering -> no copy',a.battlefield.filter(x=>x.card.token).length===0);W(g,a,3,'Mountain');const lg=S('Lord','Legendary Creature — Human','{2}','',3,3);await ent(g,a,lg);const t=a.battlefield.find(x=>x.card.token&&x.card.name==='Lord');ok('Cadric: nontoken legendary enters + pay {1} -> token copy with haste',!!t&&(t.card.kw.includes('haste')||t.hasteUntil!=null||!t.summoning));ok('Cadric: token sacrificed at end step',t&&(t.sacAtEnd||t.sacEnd||t.sacNextEnd));ok('Cadric: {1} paid',a.battlefield.filter(x=>x.card.isLand&&x.tapped).length===1);
  const n=a.battlefield.length;await ent(g,a,bear());ok('Cadric: nonlegendary -> no copy',a.battlefield.length===n+1);const lt=S('Legend Tok','Legendary Creature — Human','{2}','',2,2);lt.token=true;const n2=a.battlefield.length;await ent(g,a,lt);ok('Cadric: legendary token -> no copy',a.battlefield.length===n2+1);
  const g2=fresh();const [a2]=g2.players;a2.ai.opsValue=()=>10;put(g2,a2,C('Cadric, Soul Kindler'));await ent(g2,a2,S('Lord','Legendary Creature — Human','{2}','',3,3));ok('Cadric: cannot pay {1} -> no copy',!a2.battlefield.some(x=>x.card.token));
  const g3=fresh();const [a3]=g3.players;a3.ai.opsValue=()=>10;put(g3,a3,C('Cadric, Soul Kindler'));W(g3,a3,2,'Mountain');await ent(g3,a3,S('Relic','Legendary Artifact','{2}','',0,0));ok('Cadric: legendary noncreature permanent also copied',a3.battlefield.some(x=>x.card.token&&x.card.name==='Relic'));});

// ---------------- Rakdos Joins Up
await T('Rakdos Joins Up',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Rakdos Joins Up'));const lg=put(g,a,S('Lord','Legendary Creature — Human','{2}','',3,3));lg.counters=1;let ol=oppLife(g,a);await g.destroy(a,lg);await flush(g);ok('Rakdos Joins Up: legendary dies -> damage = power (4) to an opponent',ol-oppLife(g,a)===4,String(ol-oppLife(g,a)));
  ol=oppLife(g,a);await g.destroy(a,put(g,a,bear()));await flush(g);ok('Rakdos Joins Up: nonlegendary dies -> nothing',oppLife(g,a)===ol);const ob=opp(g,b,S('OLord','Legendary Creature — Human','{2}','',3,3));ol=oppLife(g,a);await g.destroy(b,ob);await flush(g);ok("Rakdos Joins Up: opponent's legendary dies -> nothing",oppLife(g,a)===ol);});

// ---------------- Unbound Flourishing (activated abilities with {X})
// ENGINE BUG (activating an ability whose cost contains {X} is never copied)
await T('Unbound Flourishing ability',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Unbound Flourishing'));const rod=put(g,a,S('Xrod','Artifact','{1}','{X}, {T}: Draw a card.',0,0));W(g,a,2,'Island');const o=abO(g,a,rod.card);ok('Unbound Flourishing: X ability offered',!!o);const h=a.hand.length;if(o){await g.activate(a,o);await flush(g);}ok('Unbound Flourishing: {X} ability copied (draws 2)',a.hand.length===h+2,String(a.hand.length-h));
  const g2=fresh();const [a2]=g2.players;put(g2,a2,C('Unbound Flourishing'));const rod2=put(g2,a2,S('Rod','Artifact','{1}','{1}, {T}: Draw a card.',0,0));W(g2,a2,2,'Island');const o2=abO(g2,a2,rod2.card);const h2=a2.hand.length;if(o2){await g2.activate(a2,o2);await flush(g2);}ok('Unbound Flourishing: non-X ability not copied',a2.hand.length===h2+1,String(a2.hand.length-h2));});

// ---------------- Gudul Lurker
await T('Gudul Lurker',async()=>{const g=fresh();const [a,b]=g.players;const gl=put(g,a,C('Gudul Lurker'));const v=opp(g,b,bear());ok("Gudul Lurker: can't be blocked",!g.canBlock(v,gl));const fd=put(g,a,g.faceDownCard(C('Gudul Lurker')),{faceDown:true});ok('Gudul Lurker: face-down 2/2 can be blocked',g.canBlock(v,fd));});

// ---------------- Silent-Blade Oni
await T('Silent-Blade Oni',async()=>{const g=fresh();const [a,b]=g.players;const o=put(g,a,C('Silent-Blade Oni'));const dv=SC('Div','Sorcery','{2}{U}','Draw two cards.',3);b.hand=[dv,L('Island')];const h=a.hand.length;await cd(g,a,b,o,6);ok("Silent-Blade Oni: casts a spell from damaged player's hand for free (you draw 2)",a.hand.length===h+2&&!b.hand.includes(dv),String(a.hand.length-h));
  const g2=fresh();const [a2,b2]=g2.players;const o2=put(g2,a2,C('Silent-Blade Oni'));b2.hand=[L('Island'),L('Forest')];await cd(g2,a2,b2,o2,6);ok('Silent-Blade Oni: only lands in hand -> nothing cast',b2.hand.length===2);
  const g3=fresh();const [a3,b3]=g3.players;put(g3,a3,C('Silent-Blade Oni'));const x=put(g3,a3,bear());const dv3=SC('Div','Sorcery','{2}{U}','Draw two cards.',3);b3.hand=[dv3];await cd(g3,a3,b3,x,2);ok('Silent-Blade Oni: another creature hitting -> nothing',b3.hand.includes(dv3));});

// ---------------- Elderfang Venom
await T('Elderfang Venom',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Elderfang Venom'));let l=a.life,ol=oppLife(g,a);const n=g.opponentsOf(a).length;await g.destroy(a,put(g,a,elf()));await flush(g);ok('Elderfang Venom: your Elf dies -> drain 1 each',a.life===l+1&&ol-oppLife(g,a)===n,`${a.life-l} ${ol-oppLife(g,a)}`);
  l=a.life;ol=oppLife(g,a);await g.destroy(a,put(g,a,bear()));await flush(g);ok('Elderfang Venom: non-Elf dies -> nothing',a.life===l&&oppLife(g,a)===ol);await g.destroy(b,opp(g,b,elf()));await flush(g);ok("Elderfang Venom: opponent's Elf dies -> nothing",a.life===l);});

// ---------------- Tam
// ENGINE BUG (proliferates once regardless of planeswalker types)
await T('Tam, the Possibility',async()=>{const mkG=()=>{const g=fresh();const [a]=g.players;const t=put(g,a,C('Tam, the Possibility'));['Plains','Island','Swamp','Mountain','Forest'].forEach(n=>W(g,a,1,n));const x=put(g,a,bear());x.counters=1;return [g,a,t,x];};
  let [g,a,t,x]=mkG();const p1=put(g,a,C('Liliana Vess'));const p2=put(g,a,C('Teferi, Hero of Dominaria'));const l1=p1.loyalty;let o=abO(g,a,t.card,/proliferate/);if(o){await g.activate(a,o);await flush(g);}ok('Tam: 2 planeswalker types -> proliferate twice',x.counters===3&&p1.loyalty===l1+2,`${x.counters} ${p1.loyalty-l1}`);
  [g,a,t,x]=mkG();o=abO(g,a,t.card,/proliferate/);if(o){await g.activate(a,o);await flush(g);}ok('Tam: no planeswalkers -> proliferate 0 times',x.counters===1,String(x.counters));
  [g,a,t,x]=mkG();put(g,a,C('Liliana Vess'));o=abO(g,a,t.card,/proliferate/);if(o){await g.activate(a,o);await flush(g);}ok('Tam: 1 planeswalker type -> once',x.counters===2,String(x.counters));});

// ---------------- Conclave Mentor
await T('Conclave Mentor',async()=>{const g=fresh();const [a,b]=g.players;const cm=put(g,a,C('Conclave Mentor'));const x=put(g,a,bear());await g.runOps(a,[{op:'counters',n:1,to:'this card'}],{name:'s'},{perm:x});ok('Conclave Mentor: 1 counter -> 2',x.counters===2,String(x.counters));await g.runOps(a,[{op:'counters',n:2,to:'this card'}],{name:'s'},{perm:x});ok('Conclave Mentor: 2 counters -> 3 (total 5)',x.counters===5,String(x.counters));const y=opp(g,b,bear());await g.runOps(b,[{op:'counters',n:1,to:'this card'}],{name:'s'},{perm:y});ok("Conclave Mentor: opponent's creature unaffected",y.counters===1,String(y.counters));});
await T('Conclave Mentor dies',async()=>{const g=fresh();const [a]=g.players;const cm=put(g,a,C('Conclave Mentor'));cm.counters=2;const pw=g.powerOf(a,cm);const l=a.life;await g.destroy(a,cm);await flush(g);ok('Conclave Mentor: dies -> gain life equal to its power (4)',a.life===l+pw&&pw===4,`${a.life-l} pw=${pw}`);});

// ---------------- Rosie Cotton
await T('Rosie Cotton of South Lane',async()=>{const g=fresh();const [a,b]=g.players;const r=put(g,a,C('Rosie Cotton of South Lane'));const x=put(g,a,bear());await g.makeArtifactTokens(a,'treasure',1,false);await flush(g);ok('Rosie: token created -> counter on another creature',x.counters===1&&!r.counters,`${x.counters} rosie=${r.counters}`);
  await g.makeArtifactTokens(b,'treasure',1,false);await flush(g);ok("Rosie: opponent's token -> nothing",x.counters===1&&!r.counters);
  const g2=fresh();const [a2]=g2.players;const r2=put(g2,a2,C('Rosie Cotton of South Lane'));await g2.makeArtifactTokens(a2,'treasure',1,false);await flush(g2);ok('Rosie: only Rosie -> no counter on Rosie',!r2.counters);});

// ---------------- Scouring Swarm
// ENGINE BUG (the "seven or more land cards in graveyard -> token copy" branch is missing; always makes an Insect)
await T('Scouring Swarm',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Scouring Swarm'));a.graveyard=[...Array(4)].map(()=>L('Forest'));await g.sacrifice(a,put(g,a,L('Forest')));await flush(g);const ins=a.battlefield.filter(x=>x.card.token);ok('Scouring Swarm: <7 lands in gy -> tapped 1/1 flying Insect',ins.length===1&&ins[0].tapped&&/Insect/.test(ins[0].card.type)&&ins[0].card.kw.includes('flying'));
  const n=a.battlefield.length;await g.sacrifice(a,put(g,a,bear()));await flush(g);ok('Scouring Swarm: sacrificing a nonland -> nothing',a.battlefield.length===n);});
// ENGINE BUG
await T('Scouring Swarm 7 lands',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Scouring Swarm'));a.graveyard=[...Array(7)].map(()=>L('Forest'));await g.sacrifice(a,put(g,a,L('Forest')));await flush(g);const t=a.battlefield.find(x=>x.card.token);ok('Scouring Swarm: 7+ lands in gy -> tapped token copy of Scouring Swarm',t&&t.card.name==='Scouring Swarm'&&t.tapped,t&&t.card.name);});

// ---------------- Harper Recruiter
await T('Harper Recruiter',async()=>{const g=fresh();const [a,b]=g.players;const h=put(g,a,C('Harper Recruiter'));const cl1=S('Cler1','Creature — Human Cleric','{1}','',1,1),cl2=S('Cler2','Creature — Human Cleric','{1}','',1,1),wz=S('Wiz','Creature — Human Wizard','{1}','',1,1),bb=bear(),wa=S('War5','Creature — Human Warrior','{1}','',1,1);a.library.push(wa,bb,cl2,wz,cl1);await g.attackTriggers(a,[{attacker:h,defender:b}]);await flush(g);const got=a.hand.filter(c=>[cl1,cl2,wz,bb,wa].includes(c));ok('Harper Recruiter: takes one Cleric and the Wizard',got.length===2&&got.includes(wz)&&(got.includes(cl1)||got.includes(cl2)),got.map(c=>c.name).join());ok('Harper Recruiter: Warrior 5th from top not taken',!a.hand.includes(wa));ok('Harper Recruiter: rest on bottom',a.library.indexOf(bb)<3&&a.library[a.library.length-1]===wa);});

// ---------------- Stick Together
await T('Stick Together',async()=>{const g=fresh();const [a,b]=g.players;const cl=put(g,a,S('Cler','Creature — Human Cleric','{1}','',1,1)),w1=put(g,a,S('War1','Creature — Human Warrior','{1}','',1,1)),w2=put(g,a,S('War2','Creature — Human Warrior','{1}','',1,1)),bb=put(g,a,bear()),art=put(g,a,S('Rock','Artifact','{1}','',0,0));const wz=opp(g,b,S('Wiz','Creature — Human Wizard','{1}','',1,1)),ob=opp(g,b,bear());const st=C('Stick Together');await g.runOps(a,st.spellOps,st,{});await flush(g);ok('Stick Together: keeps Cleric and one Warrior',a.battlefield.includes(cl)&&(a.battlefield.includes(w1)!==a.battlefield.includes(w2)));ok('Stick Together: non-party creature sacrificed',!a.battlefield.includes(bb));ok('Stick Together: noncreature untouched',a.battlefield.includes(art));ok('Stick Together: opponent keeps Wizard, loses Bear',b.battlefield.includes(wz)&&!b.battlefield.includes(ob));});

// ---------------- Demon's Disciple
await T("Demon's Disciple",async()=>{const g=fresh(3);const [a,b,c]=g.players;const dd=C("Demon's Disciple");const me=put(g,a,dd);const pw=put(g,b,C('Liliana Vess'));const ld=put(g,b,L('Forest'));const cc=put(g,c,bear());const art=put(g,c,S('Rock','Artifact','{1}','',0,0));await g.runOps(a,dd.etbOps,dd,{perm:me});await flush(g);ok("Demon's Disciple: opponent with only a planeswalker sacrifices it",!b.battlefield.includes(pw)&&b.battlefield.includes(ld));ok("Demon's Disciple: other opponent sacrifices creature, keeps artifact",!c.battlefield.includes(cc)&&c.battlefield.includes(art));ok("Demon's Disciple: you sacrifice too (each player)",!a.battlefield.includes(me));});

// ---------------- Satoru Umezawa
// ENGINE BUG ("This ability triggers only once each turn" not enforced)
await T('Satoru Umezawa',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Satoru Umezawa'));for(let i=0;i<20;i++)a.library.push(bear());const doNinja=async()=>{const at=put(g,a,elf(1,1));at.attackTurn=g.turn;const nj=S('Ninja Big','Creature — Ninja','{5}','',5,5);a.hand.push(nj);a.battlefield=a.battlefield.filter(x=>!x.card.isLand);W(g,a,2,'Island');W(g,a,2,'Swamp');const live=[{attacker:at,defender:b}];const L0=a.library.length;await g.ninjutsuWindow(a,live,new Map());await flush(g);return {did:a.battlefield.some(x=>x.card===nj),dug:L0-a.library.length};};
  const r1=await doNinja();ok('Satoru: granted ninjutsu used',r1.did);ok('Satoru: first ninjutsu this turn -> look at 3, take 1',r1.dug===1,String(r1.dug));const r2=await doNinja();ok('Satoru: second ninjutsu same turn -> no trigger',r2.did&&r2.dug===0,String(r2.dug));});

// ---------------- Sepulchral Primordial
await T('Sepulchral Primordial',async()=>{const g=fresh(3);const [a,b,c]=g.players;const sp=C('Sepulchral Primordial');const bc=S('BGuy','Creature — Ogre','{3}','',3,3),cc=S('CGuy','Creature — Ogre','{3}','',3,3),ac=S('AGuy','Creature — Ogre','{3}','',3,3),so=SC('Div','Sorcery','{2}','Draw two cards.',3);b.graveyard=[bc,so];c.graveyard=[cc];a.graveyard=[ac];await g.runOps(a,sp.etbOps,sp,{});await flush(g);ok("Sepulchral Primordial: one creature from each opponent's graveyard under your control",a.battlefield.some(x=>x.card===bc)&&a.battlefield.some(x=>x.card===cc));ok('Sepulchral Primordial: not from your own graveyard; noncreature left',a.graveyard.includes(ac)&&b.graveyard.includes(so));});

// ---------------- Prava
// ENGINE BUG (last check: 'during your turn' anthem applies on every turn)
await T('Prava of the Steel Legion',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Prava of the Steel Legion'));const t=put(g,a,tok());const nt=put(g,a,bear());const ot=opp(g,b,tok());g.refreshStatics();ok('Prava: your turn -> token +1/+4',g.powerOf(a,t)===2&&g.toughOf(a,t)===5,`${g.powerOf(a,t)}/${g.toughOf(a,t)}`);ok('Prava: nontoken unaffected',g.powerOf(a,nt)===2&&g.toughOf(a,nt)===2);ok("Prava: opponent's token unaffected",g.powerOf(b,ot)===1);g.active=1;g.refreshStatics();ok("Prava: opponent's turn -> no bonus",g.powerOf(a,t)===1&&g.toughOf(a,t)===1,`${g.powerOf(a,t)}/${g.toughOf(a,t)}`);});

// ---------------- Taunt from the Rampart
// ENGINE BUG (goadAll sets goad but nothing makes the goaded creatures unable to block)
await T('Taunt from the Rampart',async()=>{const g=fresh();const [a,b]=g.players;const v=opp(g,b,bear());const mine=put(g,a,bear());const tf=C('Taunt from the Rampart');await g.runOps(a,tf.spellOps,tf,{});ok('Taunt: opponent creatures goaded',v.goadedBy===a);ok('Taunt: own creatures not goaded',!mine.goadedBy);const atk=put(g,a,bear());ok("Taunt: goaded creature can't block",!g.canBlock(v,atk));});

// ---------------- Steelshaper's Gift
await T("Steelshaper's Gift",async()=>{const g=fresh();const [a]=g.players;const eq=S('Sword','Artifact — Equipment','{2}','Equipped creature gets +2/+2.\nEquip {2}');const cr=bear();a.library.push(eq,cr);const sg=C("Steelshaper's Gift");a.hand=[sg];W(g,a,1,'Plains');await g.cast(a,sg,'hand');await flush(g);ok("Steelshaper's Gift: Equipment to hand",a.hand.includes(eq)&&!a.hand.includes(cr));
  const g2=fresh();const [a2]=g2.players;a2.library=[bear(),S('Rock','Artifact','{1}','',0,0)];const sg2=C("Steelshaper's Gift");a2.hand=[sg2];W(g2,a2,1,'Plains');await g2.cast(a2,sg2,'hand');await flush(g2);ok("Steelshaper's Gift: no Equipment -> nothing",a2.hand.length===0,a2.hand.map(c=>c.name).join());});

// ---------------- Invasion of Ikoria
await T('Invasion of Ikoria',async()=>{const g=fresh();const [a]=g.players;const iv=C('Invasion of Ikoria // Zilortha, Apex of Ikoria');const hu=SC('Hum','Creature — Human','{2}','',2,2,2),e4=SC('Elf4','Creature — Elf','{4}','',4,4,4),e3=SC('Elf3','Creature — Elf','{3}','',3,3,3);a.library=[hu,e4,e3];await g.runOps(a,iv.etbOps,iv,{x:3});await flush(g);ok('Invasion of Ikoria: non-Human creature MV<=X onto battlefield',a.battlefield.some(b=>b.card===e3)&&!a.battlefield.some(b=>b.card===hu||b.card===e4));});
// ENGINE BUG (filter 'nonhuman creature' drops 'creature' so non-creature cards (lands) qualify; graveyard not searched)
await T('Invasion of Ikoria conditions',async()=>{const g=fresh();const [a]=g.players;const iv=C('Invasion of Ikoria // Zilortha, Apex of Ikoria');const ld=L('Forest'),rk=SC('Rock','Artifact','{1}','',1,0,0);a.library=[ld,rk,SC('Hum','Creature — Human','{2}','',2,2,2)];await g.runOps(a,iv.etbOps,iv,{x:3});await flush(g);ok('Invasion of Ikoria: land / noncreature not put onto battlefield',!a.battlefield.some(b=>b.card===ld||b.card===rk));
  const g2=fresh();const [a2]=g2.players;const ge=SC('GyElf','Creature — Elf','{2}','',2,2,2);a2.library=[L('Forest')];a2.graveyard=[ge];await g2.runOps(a2,iv.etbOps,iv,{x:3});await flush(g2);ok('Invasion of Ikoria: may find it in the graveyard',a2.battlefield.some(b=>b.card===ge));});

// ---------------- Mistrise Village ability
await T('Mistrise Village ability',async()=>{const g=fresh();const [a,b]=g.players;const mv=put(g,a,C('Mistrise Village'));W(g,a,1,'Island');const o=abO(g,a,mv.card,/nextUncounterable/);ok('Mistrise Village: ability offered',!!o);if(o){await g.activate(a,o);await flush(g);}
  const s1=SC('Div1','Sorcery','{1}','Draw two cards.',1);a.hand.push(s1);W(g,a,1,'Island');const cs=SC('Counterspell','Instant','{U}{U}','Counter target spell.',2);b.hand=[cs];W(g,b,2,'Island');b.ai.stackResponse=()=>null;const h0=a.hand.length;const o1=await g.putOnStack(a,s1,'hand');ok('Mistrise Village: next spell cannot be countered',o1&&g.isUncounterable(o1));if(o1){await g.cast(b,cs,'hand',{spell:o1},{instant:true});await flush(g);}ok('Mistrise Village: Counterspell fails, spell resolves',o1&&!o1.countered);
  g.stack=[];const s2=SC('Div2','Sorcery','{1}','Draw two cards.',1);a.hand.push(s2);W(g,a,1,'Island');const o2=await g.putOnStack(a,s2,'hand');ok('Mistrise Village: only the next spell',o2&&!g.isUncounterable(o2));g.stack=[];
  const g2=fresh();const [a2]=g2.players;const mv2=put(g2,a2,C('Mistrise Village'));W(g2,a2,1,'Island');await g2.activate(a2,abO(g2,a2,mv2.card,/nextUncounterable/));await flush(g2);g2.turn++;const s3=SC('Div3','Sorcery','{1}','Draw two cards.',1);a2.hand.push(s3);W(g2,a2,1,'Island');const o3=await g2.putOnStack(a2,s3,'hand');ok('Mistrise Village: expires at end of turn',o3&&!g2.isUncounterable(o3));});

// ---------------- Birthing Pod
// ENGINE BUG (activated ability not parsed at all; card only has a spell-style tutor)
await T('Birthing Pod',async()=>{const g=fresh();const [a]=g.players;const bp=C('Birthing Pod');const c3=SC('Three','Creature — Beast','{3}','',3,3,3),c4=SC('Four','Creature — Beast','{4}','',4,4,4);a.library.push(c4,c3);a.hand=[bp];W(g,a,4,'Forest');await g.cast(a,bp,'hand');await flush(g);ok('Birthing Pod: casting it does not tutor anything',!a.battlefield.some(b=>b.card===c3||b.card===c4));const pod=a.battlefield.find(b=>b.card===bp);if(pod)pod.summoning=false;
  const s2=put(g,a,SC('Two','Creature — Bear','{2}','',2,2,2));W(g,a,2,'Forest');const o=g.abilityOptions(a,{}).find(x=>x.card===bp);ok('Birthing Pod: activated ability offered',!!o);if(o){await g.activate(a,o);await flush(g);}ok('Birthing Pod: sac MV2 -> MV3 creature onto battlefield',!a.battlefield.includes(s2)&&a.battlefield.some(b=>b.card===c3)&&!a.battlefield.some(b=>b.card===c4));g.phase='combat';ok('Birthing Pod: not at instant speed',!g.abilityOptions(a,{instant:true}).some(x=>x.card===bp));});

// ---------------- Abdel Adrian
// ENGINE BUG (ETB parsed as one Soldier token; no exile, no count)
await T("Abdel Adrian, Gorion's Ward",async()=>{const g=fresh();const [a]=g.players;const bb=put(g,a,bear());const rk=put(g,a,S('Rock','Artifact','{1}','',0,0));const ld=put(g,a,L('Plains'));a.ai.chooseCards=(gg,me,pool,n)=>pool.slice(0,n);const ab=C("Abdel Adrian, Gorion's Ward");const pm=await ent(g,a,ab);const sol=cnt(a,'Soldier');const ex=[bb,rk].filter(x=>!a.battlefield.includes(x)).length;ok('Abdel Adrian: one Soldier per permanent exiled',ex>=1&&sol===ex,`exiled=${ex} soldiers=${sol}`);ok('Abdel Adrian: lands not exiled',a.battlefield.includes(ld));
  if(ex){await g.destroy(a,pm);await flush(g);ok('Abdel Adrian: exiled permanents return when he leaves',[bb,rk].some(x=>a.battlefield.some(b=>b.card===x.card)));}
  const g2=fresh();const [a2]=g2.players;await ent(g2,a2,C("Abdel Adrian, Gorion's Ward"));ok('Abdel Adrian: nothing to exile -> no Soldier',cnt(a2,'Soldier')===0,String(cnt(a2,'Soldier')));});
console.log(pass+' passed, '+fails+' failed');})();
