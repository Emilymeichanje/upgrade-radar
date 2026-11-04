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
const HK=(g,b,k)=>{g.refreshStatics();return (b.card.kw||[]).includes(k)||(b.kwTurn===g.turn&&(b.kwT||[]).includes(k));};
const PL=async(g,a,n='Forest')=>{const f=typeof n==='string'?L(n):n;a.hand.push(f);await g.playLand(a,f);return a.battlefield.find(b=>b.card===f);};
const abO=(g,a,card,re)=>g.abilityOptions(a,{}).find(x=>x.card===card&&(!re||re.test(x.ab.label||'')||x.ab.ops.some(o=>re.test(o.op))));
const cd=async(g,a,b,att,dmg)=>{g._cdDefender=b;g._cdDmg=dmg;await g.combatDamageTriggers(a,att);await flush(g);};
const oppLife=(g,a)=>g.opponentsOf(a).map(q=>q.life);
const cnt=(p,nm)=>p.battlefield.filter(x=>x.card.name===nm).length;
const ninja=(p=1,t=1)=>tagCard(mk('Ninj','Creature — Human Ninja','{1}{U}','',2,p,t));
const kwOf=(g,p,pm)=>{g.refreshStatics();return [...(pm.card.kw||[]),...(pm.kwT||[]),...(pm.kwS||[])];};

// ---- check lands
for(const nm of ['Eclipsed Steppe','Sodden Verdure','Cinder Glade']){
await T(nm,async()=>{let g=fresh();let [a]=g.players;W(g,a,1,'Forest');put(g,a,C('Cinder Glade'));let [pm]=await g.landEnters(a,C(nm));ok(nm+': 1 basic (+1 nonbasic Forest) -> tapped',pm.tapped);
g=fresh();[a]=g.players;W(g,a,2,'Forest');[pm]=await g.landEnters(a,C(nm));ok(nm+': 2 basics -> untapped',!pm.tapped);});
}
await T('Turbulent Steppe',async()=>{let g=fresh();let [a,b,c]=g.players;W(g,b,4,'Forest');W(g,c,4,'Forest');let [pm]=await g.landEnters(a,C('Turbulent Steppe'));ok('Turbulent Steppe: opps 8 lands (4+4) -> untapped',!pm.tapped);
g=fresh();[a,b,c]=g.players;W(g,b,4,'Forest');W(g,c,3,'Forest');W(g,a,5,'Forest');[pm]=await g.landEnters(a,C('Turbulent Steppe'));ok('Turbulent Steppe: opps 7 lands (own lands do not count) -> tapped',pm.tapped);});
await T('Fortified Village',async()=>{let g=fresh();let [a]=g.players;a.hand=[L('Plains')];let [pm]=await g.landEnters(a,C('Fortified Village'));ok('Fortified Village: Plains in hand -> untapped',!pm.tapped);
g=fresh();[a]=g.players;a.hand=[L('Island'),bear()];[pm]=await g.landEnters(a,C('Fortified Village'));ok('Fortified Village: no Forest/Plains in hand -> tapped',pm.tapped);});

// ---- Ophiomancer
await T('Ophiomancer',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Ophiomancer'));await g.fireTriggers(a,'upkeep');await flush(g);ok('Ophiomancer: no snake -> snake created',cnt(a,'Snake')===1,String(cnt(a,'Snake')));
const sn=a.battlefield.find(x=>x.card.name==='Snake');ok('Ophiomancer: snake 1/1 deathtouch',sn&&g.powerOf(a,sn)===1&&(sn.card.kw||[]).includes('deathtouch'));
// ENGINE BUG (intervening if not honoured)
g.active=1;await g.fireTriggers(b,'upkeep');await flush(g);ok('Ophiomancer: controls a Snake -> no new snake (each upkeep)',cnt(a,'Snake')===1,String(cnt(a,'Snake')));
a.battlefield=a.battlefield.filter(x=>x.card.name!=='Snake');await g.fireTriggers(b,'upkeep');await flush(g);ok("Ophiomancer: triggers on opponent's upkeep too when no snake",cnt(a,'Snake')===1);});

// ---- Ark of Hunger
await T('Ark of Hunger',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Ark of Hunger'));const x=bear(),y=bear();a.graveyard.push(x,y);b.graveyard.push(bear());await flush(g);const l0=oppLife(g,a),m0=a.life;
b.graveyard.splice(0,1);await flush(g);ok('Ark of Hunger: opponent gy card leaving -> nothing',oppLife(g,a).every((v,i)=>v===l0[i])&&a.life===m0);
a.graveyard.splice(0,2);a.hand.push(x,y);await flush(g);ok('Ark of Hunger: own gy cards leave -> 1 dmg each opp (once)',oppLife(g,a).every((v,i)=>v===l0[i]-1),JSON.stringify(oppLife(g,a)));
// ENGINE BUG
ok('Ark of Hunger: ... and you gain 1 life',a.life===m0+1,String(a.life-m0));});
await T('Ark of Hunger mill-play',async()=>{const g=fresh();const [a]=g.players;const ark=put(g,a,C('Ark of Hunger'));const ld=L('Island');a.library.push(ld);a.landsPlayed=0;const o=abO(g,a,ark.card);await g.activate(a,o);await flush(g);ok('Ark of Hunger: milled the top card',a.graveyard.includes(ld)||a.exile.includes(ld));
// ENGINE BUG
const playable=(g.canLandFromGy&&a.graveyard.includes(ld)&&g.canLandFromGy(a,ld))||(a.exileCast||[]).some(e=>e.card===ld)||(a.playFromGy||[]).includes(ld);ok('Ark of Hunger: may play the milled card this turn',!!playable);});

// ---- Drogskol Reinforcements
await T('Drogskol Reinforcements',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Drogskol Reinforcements'));const sp=opp(g,a,S('Spir','Creature — Spirit','{1}','',2,2));const br=opp(g,a,bear());const shock=tagCard(mk('Shock','Instant','{R}','Shock deals 2 damage to any target.',1));shock.colors=['R'];
await g.runOps(b,[{op:'damage',n:2,to:'target creature'}],shock,{target:sp});await flush(g);await g.sba();ok('Drogskol: targeted noncombat dmg to Spirit prevented',a.battlefield.includes(sp));await g.runOps(b,[{op:'damage',n:2,to:'target creature'}],shock,{target:br});await flush(g);await g.sba();ok('Drogskol: non-Spirit not protected',!a.battlefield.includes(br));
const pyro=tagCard(mk('Pyroclasm','Sorcery','{1}{R}','Pyroclasm deals 2 damage to each creature.',2));pyro.colors=['R'];const br2=opp(g,a,bear());await g.runOps(b,pyro.spellOps,pyro,{});await flush(g);await g.sba();
// ENGINE BUG: damage op 'each creature' destroys without checking noncombatPrevented
ok('Drogskol: sweeper (Pyroclasm) damage to Spirit prevented',a.battlefield.includes(sp));ok('Drogskol: sweeper kills non-Spirit',!a.battlefield.includes(br2));
const sp2=put(g,a,S('Spir2','Creature — Spirit','{1}','',2,2));const v=opp(g,b,S('Big','Creature — Ogre','{3}','',3,3));b.ai.chooseBlocks=()=>new Map();a.ai.chooseBlocks=()=>new Map([[v,sp2]]);g.active=1;await g.combatPhase(b,[{attacker:v,defender:a}]);await g.sba();ok('Drogskol: combat damage to Spirit NOT prevented',!a.battlefield.includes(sp2));});

// ---- Relic Retriever
await T('Relic Retriever',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Relic Retriever'));await flush(g);await g.fireTriggers(a,'eachEnd');await flush(g);ok('Relic Retriever: nothing left gy -> no treasure',cnt(a,'Treasure')===0);
const x=bear();a.graveyard.push(x);await flush(g);a.graveyard.pop();a.hand.push(x);await flush(g);await g.fireTriggers(a,'eachEnd');await flush(g);ok('Relic Retriever: card left gy -> treasure',cnt(a,'Treasure')===1);
g.turn++;await g.fireTriggers(a,'eachEnd');await flush(g);ok('Relic Retriever: next turn (nothing left) -> no new treasure',cnt(a,'Treasure')===1);});

// ---- Condescend
await T('Condescend',async()=>{const g=fresh();const [a,b]=g.players;const v=spell(g,b,tagCard(mk('Divination','Sorcery','{2}{U}','Draw two cards.',3)));W(g,b,1,'Island');const cs=C('Condescend');a.hand=[cs];W(g,a,3,'Island');a.ai.chooseX=()=>2;await g.cast(a,cs,'hand',{spell:v},{instant:true});await flush(g);ok('Condescend: opponent cannot pay X -> countered',v.countered,'x='+(g.log.slice(-8).map(l=>l.m).join('|')));});
await T('Condescend (pays)',async()=>{const g=fresh();const [a,b]=g.players;const v=spell(g,b,tagCard(mk('Divination','Sorcery','{2}{U}','Draw two cards.',3)));W(g,b,6,'Island');const cs=C('Condescend');a.hand=[cs];W(g,a,2,'Island');await g.cast(a,cs,'hand',{spell:v},{instant:true});await flush(g);ok('Condescend: opponent has plenty of mana -> pays, not countered',!v.countered,g.log.slice(-8).map(l=>l.m).join('|'));ok('Condescend: scry 2 happened',g.log.some(l=>/scry/i.test(l.m)));});
await T('Condescend X=1',async()=>{const g=fresh();const [a,b]=g.players;const v=spell(g,b,tagCard(mk('Divination','Sorcery','{2}{U}','Draw two cards.',3)));W(g,b,1,'Island');const cs=C('Condescend');a.hand=[cs];W(g,a,2,'Island');a.ai.chooseX=()=>1;await g.cast(a,cs,'hand',{spell:v},{instant:true});await flush(g);
// ENGINE BUG: {X} parsed as a fixed 3
ok('Condescend: X=1 and opponent has exactly 1 mana -> pays, not countered',!v.countered,g.log.slice(-6).map(l=>l.m).join('|'));});
await T('Condescend X=5',async()=>{const g=fresh();const [a,b]=g.players;const v=spell(g,b,tagCard(mk('Divination','Sorcery','{2}{U}','Draw two cards.',3)));W(g,b,4,'Island');const cs=C('Condescend');a.hand=[cs];W(g,a,6,'Island');a.ai.chooseX=()=>5;await g.cast(a,cs,'hand',{spell:v},{instant:true});await flush(g);
// ENGINE BUG: {X} parsed as a fixed 3
ok('Condescend: X=5 and opponent has 4 mana -> countered',v.countered,g.log.slice(-6).map(l=>l.m).join('|'));});

// ---- Lattice Library
await T('Lattice Library',async()=>{const g=fresh();const [a]=g.players;const ll=C('Lattice Library');const pm=await g.enterPerm(a,ll,{x:3});await flush(g);ok('Lattice Library: 3 study counters',pm.ck&&pm.ck.study===3,JSON.stringify(pm.ck));
await g.trigger(a,pm,ll.etbOps,{perm:pm});await flush(g);let fr=a.battlefield.filter(x=>x.card.name==='Fractal');ok('Lattice Library: ETB fractal with 3 counters',fr.length===1&&g.powerOf(a,fr[0])===3,fr.map(f=>g.powerOf(a,f)).join());
const xs=()=>tagCard(mk('Blaze','Sorcery','{X}{R}','Blaze deals X damage to any target.',1));const nx=tagCard(mk('Opt','Instant','{U}','Draw a card.',1));
a.hand=[nx];W(g,a,1,'Island');await g.cast(a,nx,'hand');await flush(g);fr=a.battlefield.filter(x=>x.card.name==='Fractal');ok('Lattice Library: non-X spell -> no fractal',fr.length===1);
const s1=xs();a.hand=[s1];W(g,a,3,'Mountain');a.ai.chooseX=()=>1;await g.cast(a,s1,'hand');await flush(g);fr=a.battlefield.filter(x=>x.card.name==='Fractal');ok('Lattice Library: first X spell -> fractal',fr.length===2,String(fr.length));
const s2=xs();a.hand=[s2];W(g,a,3,'Mountain');await g.cast(a,s2,'hand');await flush(g);fr=a.battlefield.filter(x=>x.card.name==='Fractal');ok('Lattice Library: second X spell same turn -> no fractal',fr.length===2,String(fr.length));});

// ---- Aether Gale
await T('Aether Gale',async()=>{const g=fresh();const [a,b]=g.players;const vs=[...Array(7)].map(()=>opp(g,b,bear()));W(g,b,3,'Forest');const c=C('Aether Gale');await g.runOps(a,c.spellOpsX||c.spellOps,c,{});const left=b.battlefield.filter(x=>!x.card.isLand).length;ok('Aether Gale: exactly six nonland bounced',left===1,String(left));ok('Aether Gale: lands untouched',b.battlefield.filter(x=>x.card.isLand).length===3);});

// ---- Mizzix's Mastery
await T("Mizzix's Mastery",async()=>{const g=fresh();const [a]=g.players;const div=tagCard(mk('Divination','Sorcery','{2}{U}','Draw two cards.',3));const crt=bear();a.graveyard.push(crt,div);const mm=C("Mizzix's Mastery");a.hand=[mm];W(g,a,4,'Mountain');const h0=a.hand.length;await g.cast(a,mm,'hand');await flush(g);ok("Mizzix's Mastery: sorcery exiled and copy cast (drew 2)",a.exile.includes(div)&&a.hand.length===h0-1+2,`${a.hand.length-h0}`);ok("Mizzix's Mastery: creature card not taken",a.graveyard.includes(crt));ok("Mizzix's Mastery: exiles itself",a.exile.includes(mm));});

// ---- Storm-Kiln Artist
await T('Storm-Kiln Artist',async()=>{const g=fresh();const [a]=g.players;const sk=put(g,a,C('Storm-Kiln Artist'));g.refreshStatics();const p0=g.powerOf(a,sk);put(g,a,C('Ichor Wellspring'));put(g,a,C('Ichor Wellspring'));put(g,a,C('Ophiomancer'));g.refreshStatics();ok('Storm-Kiln: +1/+0 per artifact (2 artifacts)',g.powerOf(a,sk)===p0+2&&g.toughOf(a,sk)===sk.card.toughness,`${p0}->${g.powerOf(a,sk)}`);const b=g.players[1];opp(g,b,C('Ichor Wellspring'));g.refreshStatics();ok("Storm-Kiln: opponent's artifacts don't count",g.powerOf(a,sk)===p0+2);});

// ---- World at War
await T('World at War',async()=>{const g=fresh();const [a,b]=g.players;const ww=C('World at War');const x=put(g,a,bear());x.tapped=true;x.attackTurn=g.turn;const y=put(g,a,bear());y.tapped=true;const e0=a.extraCombat;a.hand=[ww];W(g,a,5,'Mountain');await g.cast(a,ww,'hand');await flush(g);ok('World at War: schedules the post-main-2 combat',a.b9_warTurn===g.turn&&!a.extraCombat,JSON.stringify([a.b9_warTurn,a.extraCombat]));ok('World at War: rebound exile',a.exile.includes(ww));});

// ---- Haywire Mite
await T('Haywire Mite',async()=>{const g=fresh();const [a,b]=g.players;const hm=put(g,a,C('Haywire Mite'));const ac=opp(g,b,tagCard(mk('Golem','Artifact Creature — Golem','{3}','',3,3,3)));const ec=opp(g,b,tagCard(mk('Glimmer','Enchantment Creature — Spirit','{3}','',3,3,3)));W(g,a,1,'Forest');let o=abO(g,a,hm.card);if(o){await g.activate(a,o);await flush(g);}ok('Haywire Mite: artifact creature / enchantment creature not exiled',b.battlefield.includes(ac)&&b.battlefield.includes(ec));
const g2=fresh();const [a2,b2]=g2.players;const hm2=put(g2,a2,C('Haywire Mite'));const ar=opp(g2,b2,C('Ichor Wellspring'));W(g2,a2,1,'Forest');o=abO(g2,a2,hm2.card);await g2.activate(a2,o);await flush(g2);ok('Haywire Mite: noncreature artifact exiled',!b2.battlefield.includes(ar)&&b2.exile.includes(ar.card));});

// ---- Tendershoot Dryad
await T('Tendershoot Dryad',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Tendershoot Dryad'));const sap=put(g,a,S('Saproling','Token Creature — Saproling','','',1,1));const nb=put(g,a,bear());const os=opp(g,b,S('Saproling','Token Creature — Saproling','','',1,1));W(g,a,6,'Forest');g.refreshStatics();ok('Tendershoot: 9 permanents (no blessing) -> saproling 1/1',g.powerOf(a,sap)===1&&!a.blessing);W(g,a,1,'Forest');g.refreshStatics();ok('Tendershoot: 10 permanents -> city\'s blessing',!!a.blessing);ok('Tendershoot: blessing -> saproling 3/3',g.powerOf(a,sap)===3&&g.toughOf(a,sap)===3);ok('Tendershoot: non-saproling unaffected',g.powerOf(a,nb)===2);ok("Tendershoot: opponent's saproling unaffected",g.powerOf(b,os)===1);});

// ---- Defiler of Vigor
await T('Defiler of Vigor',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Defiler of Vigor'));const gc=tagCard(mk('Grizzly','Creature — Bear','{1}{G}','',2,2,2));gc.colors=['G'];const c1=g.costOf(a,gc,'hand');const rc=tagCard(mk('Ogre','Creature — Ogre','{1}{R}','',2,2,2));rc.colors=['R'];const c2=g.costOf(a,rc,'hand');const gs=tagCard(mk('Growth','Instant','{G}','Target creature gets +3/+3.',1));gs.colors=['G'];const c3=g.costOf(a,gs,'hand');
ok('Defiler: non-green permanent not reduced',c2.pips.R===1&&c2.total===2,JSON.stringify(c2));ok('Defiler: green instant not reduced',c3.pips.G===1,JSON.stringify(c3));
a.hand=[gc];W(g,a,1,'Plains');const l0=a.life;await g.cast(a,gc,'hand');await flush(g);ok('Defiler: green permanent cast for {1} + 2 life',a.battlefield.some(x=>x.card===gc)&&a.life===l0-2,`life ${a.life-l0} onbf ${a.battlefield.some(x=>x.card===gc)}`);});

// ---- Rishkar's Expertise
await T("Rishkar's Expertise",async()=>{const g=fresh();const [a]=g.players;put(g,a,bear());put(g,a,S('Big','Creature — Ogre','{3}','',4,4));const b=g.players[1];opp(g,b,S('Huge','Creature — Ogre','{3}','',9,9));const re=C("Rishkar's Expertise");const five=S('Five','Creature — Beast','{5}','',5,5);five.cmc=5;const six=S('Six','Creature — Beast','{6}','',6,6);six.cmc=6;a.hand=[re,six,five];W(g,a,6,'Forest');const h0=a.hand.length;
await g.cast(a,re,'hand');await flush(g);
// ENGINE BUG: draw clause not parsed
ok("Rishkar's Expertise: draws 4 (greatest power among YOUR creatures, not opp 9)",a.hand.filter(c=>c!==six&&c!==five).length===4,`hand ${a.hand.length-h0} names ${a.hand.map(c=>c.name)}`);ok("Rishkar's Expertise: free-cast MV<=5 (Five) not MV6",a.battlefield.some(x=>x.card===five)&&!a.battlefield.some(x=>x.card===six),a.battlefield.map(x=>x.card.name).join());});
await T("Rishkar's Expertise (only MV6)",async()=>{const g=fresh();const [a]=g.players;put(g,a,bear());const re=C("Rishkar's Expertise");const six=S('Six','Creature — Beast','{6}','',6,6);six.cmc=6;a.hand=[re,six];a.library=a.library.filter(c=>c.isLand);W(g,a,6,'Forest');await g.cast(a,re,'hand');await flush(g);ok("Rishkar's Expertise: MV6 card not cast free",a.hand.includes(six));});

// ---- Arachnogenesis
await T('Arachnogenesis',async()=>{const g=fresh();const [a,b,c]=g.players;g.active=1;g.phase='combat';const at=[opp(g,b,bear()),opp(g,b,bear()),opp(g,b,bear())];const z=opp(g,c,bear());g.attackers=at.map(x=>({attacker:x,defender:a})).concat([{attacker:z,defender:b}]);g.combat={attackers:g.attackers};const ar=C('Arachnogenesis');await g.runOps(a,ar.spellOps,ar,{});await flush(g);
// ENGINE BUG: token count parsed as fixed 2
ok('Arachnogenesis: X = creatures attacking you (3)',cnt(a,'Spider')===3,String(cnt(a,'Spider')));});
await T('Arachnogenesis spiders deal damage',async()=>{const g=fresh();const [a,b]=g.players;const ar=C('Arachnogenesis');await g.runOps(a,ar.spellOps,ar,{});const sp=put(g,a,S('Spidey','Creature — Spider','{1}','Reach',3,3));const l0=b.life;b.ai.chooseBlocks=()=>new Map();await g.combatPhase(a,[{attacker:sp,defender:b}]);
// ENGINE BUG: fog op prevents all combat damage, ignores non-Spider qualifier
ok('Arachnogenesis: Spider combat damage NOT prevented',b.life===l0-3,String(l0-b.life));const br=put(g,a,bear());const l1=b.life;await g.combatPhase(a,[{attacker:br,defender:b}]);ok('Arachnogenesis: non-Spider combat damage prevented',b.life===l1);});

// ---- Scute Swarm
await T('Scute Swarm',async()=>{const g=fresh();const [a]=g.players;const sc=put(g,a,C('Scute Swarm'));W(g,a,4,'Forest');await PL(g,a);await flush(g);ok('Scute Swarm: 5 lands -> 1/1 insect',cnt(a,'Insect')===1&&cnt(a,'Scute Swarm')===1,`${cnt(a,'Insect')} ${cnt(a,'Scute Swarm')}`);a.landsPlayed=0;a.landsPlayedTurn=-1;a.landsThisTurn=0;await PL(g,a);await flush(g);
// ENGINE BUG: six-lands copy branch not parsed
ok('Scute Swarm: 6 lands -> copy of Scute Swarm instead',cnt(a,'Scute Swarm')===2&&cnt(a,'Insect')===1,`${cnt(a,'Insect')} ${cnt(a,'Scute Swarm')}`);});

// ---- Enter the Enigma
await T('Enter the Enigma',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());const y=put(g,a,bear());const v=opp(g,b,bear());const ee=C('Enter the Enigma');a.hand=[ee];W(g,a,1,'Island');await g.cast(a,ee,'hand',x);await flush(g);const ux=!g.canBlock(v,x),uy=!g.canBlock(v,y);ok('Enter the Enigma: exactly one creature unblockable',(ux?1:0)+(uy?1:0)===1,`${ux} ${uy}`);g.turn++;ok('Enter the Enigma: only this turn',g.canBlock(v,x)&&g.canBlock(v,y));});

// ---- Director Nick Fury
await T('Director Nick Fury',async()=>{const g=fresh();const [a,b]=g.players;const nf=put(g,a,C('Director Nick Fury'));const hero=tagCard(mk('Hero Guy','Creature — Human Hero','{1}{W}','',2,2,2));a.library.push(hero,L('Forest'),L('Forest'),L('Forest'));const h0=a.hand.length;await g.attackTriggers(a,[{attacker:nf,defender:b}]);await flush(g);
// ENGINE BUG: attack trigger parsed with empty ops
ok('Nick Fury: Hero from top 4 to hand',a.hand.includes(hero),`hand+${a.hand.length-h0}`);
const g2=fresh();const [a2,b2]=g2.players;const nf2=put(g2,a2,C('Director Nick Fury'));const nh=bear();a2.library.push(nh,L('Forest'),L('Forest'),L('Forest'));const h1=a2.hand.length;await g2.attackTriggers(a2,[{attacker:nf2,defender:b2}]);await flush(g2);
// ENGINE BUG: attack trigger parsed with empty ops (rest never put on bottom)
ok('Nick Fury: no Hero -> nothing to hand, rest to bottom',a2.hand.length===h1&&a2.library.indexOf(nh)<4,`hand+${a2.hand.length-h1} idx ${a2.library.indexOf(nh)}/${a2.library.length}`);});

// ---- Burnt Offering
await T('Burnt Offering',async()=>{const g=fresh();const [a]=g.players;const big=put(g,a,S('Four','Creature — Ogre','{4}','',4,4));big.card.cmc=4;const bo=C('Burnt Offering');a.hand=[bo];W(g,a,1,'Swamp');a.pool=[];await g.cast(a,bo,'hand',null,{instant:true});const pool=(a.pool||[]).filter(m=>m.c==='B'||m.c==='R').length;ok('Burnt Offering: sacrificed creature',!a.battlefield.includes(big));ok('Burnt Offering: adds X=4 B/R mana',pool===4,String(pool)+' '+JSON.stringify(a.pool));});

// ---- Greenwarden of Murasa
await T('Greenwarden of Murasa',async()=>{const g=fresh();const [a]=g.players;const gw=put(g,a,C('Greenwarden of Murasa'));const x=bear();a.graveyard.push(x);await g.destroy(a,gw);await flush(g);
// ENGINE BUG: dies trigger returns a card without exiling Greenwarden
ok('Greenwarden: dies -> exiled itself',a.exile.includes(gw.card),`gy:${a.graveyard.includes(gw.card)}`);ok('Greenwarden: ... and returned target card to hand',a.hand.includes(x));});
await T('Greenwarden (cannot exile)',async()=>{const g=fresh();const [a]=g.players;const gw=put(g,a,C('Greenwarden of Murasa'));const x=bear();a.graveyard.push(x);a.ai.chooseMay=()=>false;const orig=g.chooseMay;g.chooseMay=async()=>false;await g.destroy(a,gw);await flush(g);g.chooseMay=orig;
// ENGINE BUG: return not conditional on exiling
ok("Greenwarden: if you don't exile it, no card returned",!a.hand.includes(x)||a.exile.includes(gw.card),`exiled ${a.exile.includes(gw.card)} hand ${a.hand.includes(x)}`);});

// ---- Shriekmaw
await T('Shriekmaw',async()=>{const g=fresh();const [a,b]=g.players;const bl=opp(g,b,tagCard(mk('Blackie','Creature — Zombie','{1}{B}','',2,5,5)));bl.card.colors=['B'];const ar=opp(g,b,tagCard(mk('Golem','Artifact Creature — Golem','{3}','',3,6,6)));const v=opp(g,b,bear());const sm=C('Shriekmaw');a.hand=[sm];W(g,a,5,'Swamp');await g.cast(a,sm,'hand');await flush(g);
// ENGINE BUG: ETB not parsed at all
ok('Shriekmaw: ETB destroys nonartifact nonblack creature',!b.battlefield.includes(v),last(g,6));ok('Shriekmaw: black and artifact creatures survive',b.battlefield.includes(bl)&&b.battlefield.includes(ar));});
await T('Shriekmaw (no legal target)',async()=>{const g=fresh();const [a,b]=g.players;const bl=opp(g,b,tagCard(mk('Blackie','Creature — Zombie','{1}{B}','',2,5,5)));bl.card.colors=['B'];const ar=opp(g,b,tagCard(mk('Golem','Artifact Creature — Golem','{3}','',3,6,6)));const sm=C('Shriekmaw');a.hand=[sm];W(g,a,5,'Swamp');await g.cast(a,sm,'hand');await flush(g);ok('Shriekmaw: only black/artifact opposing creatures -> none destroyed',b.battlefield.includes(bl)&&b.battlefield.includes(ar));ok('Shriekmaw: does not destroy itself / own creatures',a.battlefield.some(x=>x.card===sm));});

// ---- Aragorn, King of Gondor
await T('Aragorn, King of Gondor',async()=>{const g=fresh();const [a,b]=g.players;const ar=put(g,a,C('Aragorn, King of Gondor'));const v1=opp(g,b,bear()),v2=opp(g,b,bear()),v3=opp(g,b,bear());g.monarch=b;const x=put(g,a,bear());await g.attackTriggers(a,[{attacker:ar,defender:b},{attacker:x,defender:b}]);await flush(g);const nb=[v1,v2,v3].filter(v=>!g.canBlock(v,x)).length;ok('Aragorn: not monarch -> exactly one creature cannot block',nb===1,String(nb));
const g2=fresh();const [a2,b2]=g2.players;const ar2=put(g2,a2,C('Aragorn, King of Gondor'));const w1=opp(g2,b2,bear()),w2=opp(g2,b2,bear());g2.monarch=a2;const x2=put(g2,a2,bear());await g2.attackTriggers(a2,[{attacker:ar2,defender:b2},{attacker:x2,defender:b2}]);await flush(g2);ok('Aragorn: monarch -> no creature can block',!g2.canBlock(w1,x2)&&!g2.canBlock(w2,x2));});

// ---- Horn of Gondor
await T('Horn of Gondor',async()=>{const g=fresh();const [a]=g.players;const h=put(g,a,C('Horn of Gondor'));put(g,a,tagCard(mk('Man','Creature — Human Soldier','{1}','',1,1,1)));put(g,a,tagCard(mk('Man2','Creature — Human Knight','{1}','',1,1,1)));put(g,a,tagCard(mk('Man3','Creature — Human Wizard','{1}','',1,1,1)));put(g,a,bear());opp(g,g.players[1],tagCard(mk('OppMan','Creature — Human','{1}','',1,1,1)));W(g,a,3,'Plains');const o=abO(g,a,h.card);await g.activate(a,o);await flush(g);const n=a.battlefield.filter(x=>x.card.token&&/Human Soldier/.test(x.card.type)).length;
// ENGINE BUG: token count parsed as fixed 2
ok('Horn of Gondor: X = Humans you control (3)',n===3,String(n));});

// ---- Tannuk
await T('Tannuk, Memorial Ensign',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Tannuk, Memorial Ensign'));const l0=oppLife(g,a);const h0=a.hand.length;await PL(g,a);await flush(g);ok('Tannuk: first landfall -> 1 dmg each opp',oppLife(g,a).every((v,i)=>v===l0[i]-1));
// ENGINE BUG
ok('Tannuk: first resolution -> no draw',a.hand.length===h0,String(a.hand.length-h0));const h1=a.hand.length;await g.landEnters(a,L('Forest'));await g.landfall(a);await flush(g);ok('Tannuk: second resolution -> draw',a.hand.length===h1+1,String(a.hand.length-h1));const h2=a.hand.length;await g.landEnters(a,L('Forest'));await g.landfall(a);await flush(g);ok('Tannuk: third resolution -> no draw',a.hand.length===h2,String(a.hand.length-h2));});

// ---- Breena
await T('Breena, the Demagogue',async()=>{const g=fresh(4);const [a,b,c,d]=g.players;const br=put(g,a,C('Breena, the Demagogue'));const mine=put(g,a,bear());b.life=30;c.life=20;d.life=20;const x=put(g,d,bear());g.active=3;const h0=d.hand.length;await g.attackTriggers(d,[{attacker:x,defender:b}]);await flush(g);ok('Breena: attacked opp has more life than another opp -> attacker draws',d.hand.length===h0+1,String(d.hand.length-h0));ok('Breena: ... and you put two +1/+1 counters',(mine.counters||0)+(br.counters||0)===2);
const h1=d.hand.length;const c0=(mine.counters||0)+(br.counters||0);const y=put(g,d,bear());await g.attackTriggers(d,[{attacker:y,defender:c}]);await flush(g);ok('Breena: attacked opp NOT richest-than-another (20 vs 30,20) -> nothing',d.hand.length===h1&&(mine.counters||0)+(br.counters||0)===c0,`${d.hand.length-h1}`);
const h2=d.hand.length;const z=put(g,d,bear());await g.attackTriggers(d,[{attacker:z,defender:a}]);await flush(g);ok('Breena: attacking Breena controller -> nothing',d.hand.length===h2);});

// ---- Otharri
await T("Otharri, Suns' Glory",async()=>{const g=fresh();const [a,b]=g.players;const ot=put(g,a,C("Otharri, Suns' Glory"));const atk=[{attacker:ot,defender:b}];await g.attackTriggers(a,atk);await flush(g);
// ENGINE BUG: no experience counters; 1 untapped non-attacking rebel per attack
ok('Otharri: 1st attack -> 1 experience, 1 rebel attacking',cnt(a,'Rebel')===1&&(a.experience||0)===1,`${cnt(a,'Rebel')} xp ${a.experience}`);const r=a.battlefield.find(x=>x.card.name==='Rebel');ok('Otharri: rebel tapped and attacking',r&&r.tapped&&atk.some(z=>z.attacker===r));const atk2=[{attacker:ot,defender:b}];await g.attackTriggers(a,atk2);await flush(g);ok('Otharri: 2nd attack -> 2 xp, 2 more rebels',cnt(a,'Rebel')===3&&(a.experience||0)===2,`${cnt(a,'Rebel')} xp ${a.experience}`);});

// ---- Ilysian Caryatid
await T('Ilysian Caryatid',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Ilysian Caryatid'));put(g,a,S('Three','Creature — Ogre','{3}','',3,3));const m1=g.availableMana(a);ok('Ilysian Caryatid: no power-4 creature -> 1 mana',m1===1,String(m1));put(g,a,S('Huge','Creature — Ogre','{3}','',4,4));const m2=g.availableMana(a);
// ENGINE BUG: manaAb amount fixed at 1
ok('Ilysian Caryatid: with power-4 creature produces 2 instead of 1',m2===2,String(m2));});

// ---- Impact Tremors
await T('Impact Tremors',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Impact Tremors'));const l0=oppLife(g,a);const pm=await g.enterPerm(a,bear());await g.creatureEntered(a,pm);await flush(g);ok('Impact Tremors: your creature enters -> 1 dmg each opp',oppLife(g,a).every((v,i)=>v===l0[i]-1),JSON.stringify(oppLife(g,a)));const l1=oppLife(g,a);g.active=1;const op=await g.enterPerm(b,bear());await g.creatureEntered(b,op);await flush(g);ok("Impact Tremors: opponent's creature -> nothing",oppLife(g,a).every((v,i)=>v===l1[i]));g.active=0;const l2=oppLife(g,a);await g.landEnters(a,L('Forest'));await flush(g);ok('Impact Tremors: noncreature permanent -> nothing',oppLife(g,a).every((v,i)=>v===l2[i]));});

// ---- Access Tunnel
await T('Access Tunnel',async()=>{const g=fresh();const [a,b]=g.players;const at=put(g,a,C('Access Tunnel'));const big=put(g,a,S('Big','Creature — Ogre','{3}','',4,4));const v=opp(g,b,bear());W(g,a,3,'Forest');const o=abO(g,a,at.card,/unblockable/);await g.activate(a,o);
// ENGINE BUG: unblockable op ignores maxPower and target
ok('Access Tunnel: power-4 creature not made unblockable',g.canBlock(v,big));const sm=put(g,a,S('Three','Creature — Ogre','{3}','',3,3));at.tapped=false;W(g,a,3,'Forest');const o2=abO(g,a,at.card,/unblockable/);await g.activate(a,o2);
// ENGINE BUG: unblockable op ignores maxPower and target
ok('Access Tunnel: power-3 creature unblockable',!g.canBlock(v,sm));});

// ---- Walking Bulwark
await T('Walking Bulwark',async()=>{const g=fresh();const [a,b]=g.players;const wb=put(g,a,C('Walking Bulwark'));const wall=put(g,a,S('Wall','Creature — Wall','{2}','Defender',0,5));wall.summoning=true;const br=put(g,a,bear());br.summoning=true;ok('Walking Bulwark: wall cannot attack before',!g.canAttackWith(a,wall));W(g,a,2,'Plains');const o=abO(g,a,wb.card);ok('Walking Bulwark: ability offered at sorcery speed',!!o);if(o){await g.activate(a,o);await flush(g);}ok('Walking Bulwark: defender target can attack with haste',g.canAttackWith(a,wall)||g.canAttackWith(a,wb));ok('Walking Bulwark: non-defender creature not affected',!g.canAttackWith(a,br));g.phase='combat';ok('Walking Bulwark: not at instant speed',!g.abilityOptions(a,{instant:true}).some(x=>x.card===wb.card&&x.ab.ops.some(o=>o.op==='defenderAttack')));});
await T('Walking Bulwark damage = toughness',async()=>{const g=fresh();const [a,b]=g.players;const wb=put(g,a,C('Walking Bulwark'));const wall=put(g,a,S('Wall','Creature — Wall','{2}','Defender',0,5));W(g,a,2,'Plains');const o=abO(g,a,wb.card);a.ai.pickTarget=null;await g.runOps(a,o.ab.ops,wb.card,{perm:wb,target:wall});const l0=b.life;b.ai.chooseBlocks=()=>new Map();await g.combatPhase(a,[{attacker:wall,defender:b}]);
// ENGINE BUG: toughDmgTurn written but never read by combatPow
ok('Walking Bulwark: assigns damage equal to toughness (5)',l0-b.life===5,String(l0-b.life));});

// ---- Clever Concealment
await T('Clever Concealment',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());const ld=put(g,a,L('Plains'));const v=opp(g,b,bear());const cc=C('Clever Concealment');a.hand=[cc];W(g,a,4,'Plains');await g.cast(a,cc,'hand',null,{instant:true});await flush(g);
// ENGINE BUG: spell has no spellOps
ok('Clever Concealment: own nonland permanent phased out',!a.battlefield.includes(x)&&(a.phased||[]).includes(x));ok('Clever Concealment: lands and opponent permanents not phased',a.battlefield.includes(ld)&&b.battlefield.includes(v));});

// ---- Nettlecyst
await T('Nettlecyst',async()=>{const g=fresh();const [a,b]=g.players;const nc=put(g,a,C('Nettlecyst'));const x=put(g,a,bear());nc.attachedTo=x.id;put(g,a,C('Impact Tremors'));put(g,a,C('Ichor Wellspring'));put(g,a,L('Forest'));opp(g,b,C('Ichor Wellspring'));g.refreshStatics();ok('Nettlecyst: +1/+1 per artifact/enchantment you control (3)',g.powerOf(a,x)===5&&g.toughOf(a,x)===5,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);});

// ---- Ureni
await T('Ureni of the Unwritten',async()=>{const g=fresh();const [a,b]=g.players;const u=put(g,a,C('Ureni of the Unwritten'));const dr=tagCard(mk('Drake Lord','Creature — Dragon','{5}{R}','Flying',6,5,5));const nd=S('Ogre','Creature — Ogre','{5}','',5,5);a.library.push(dr,...Array(6).fill(0).map(()=>L('Forest')),nd);await g.attackTriggers(a,[{attacker:u,defender:b}]);await flush(g);ok('Ureni: Dragon creature from top 8 onto battlefield',a.battlefield.some(x=>x.card===dr));ok('Ureni: non-dragon not put',!a.battlefield.some(x=>x.card===nd));
const g2=fresh();const [a2,b2]=g2.players;const u2=put(g2,a2,C('Ureni of the Unwritten'));const dr2=tagCard(mk('Deep Drake','Creature — Dragon','{5}{R}','Flying',6,5,5));a2.library.push(dr2,...Array(8).fill(0).map(()=>L('Forest')));await g2.attackTriggers(a2,[{attacker:u2,defender:b2}]);await flush(g2);ok('Ureni: Dragon 9th from top not found',!a2.battlefield.some(x=>x.card===dr2));});

// ---- Hellkite Charger
await T('Hellkite Charger',async()=>{const g=fresh();const [a,b]=g.players;const hc=put(g,a,C('Hellkite Charger'));const x=put(g,a,bear());const e0=a.extraCombat;W(g,a,3,'Mountain');await g.attackTriggers(a,[{attacker:hc,defender:b},{attacker:x,defender:b}]);await flush(g);
// ENGINE BUG: extraCombat granted without paying {5}{R}{R}
ok('Hellkite Charger: cannot pay {5}{R}{R} -> no extra combat',!a.extraCombat,JSON.stringify([e0,a.extraCombat]));
const g2=fresh();const [a2,b2]=g2.players;const hc2=put(g2,a2,C('Hellkite Charger'));const x2=put(g2,a2,bear());W(g2,a2,7,'Mountain');await g2.attackTriggers(a2,[{attacker:hc2,defender:b2},{attacker:x2,defender:b2}]);await flush(g2);ok('Hellkite Charger: can pay -> extra combat',!!a2.extraCombat);
// ENGINE BUG: no payment taken
ok('Hellkite Charger: {5}{R}{R} actually spent',a2.battlefield.filter(z=>z.card.isLand&&z.tapped).length===7,String(a2.battlefield.filter(z=>z.card.isLand&&z.tapped).length));});

// ---- Calix
await T('Calix, Guided by Fate',async()=>{const g=fresh();const [a,b]=g.players;const cx=put(g,a,C('Calix, Guided by Fate'));put(g,a,C('Impact Tremors'));const br=put(g,a,bear());await cd(g,a,b,br,2);
// ENGINE BUG: combatDamage trigger fires for any creature you control
ok('Calix: unenchanted non-Calix creature -> no copy',cnt(a,'Impact Tremors')===1);await cd(g,a,b,cx,3);ok('Calix: Calix deals combat dmg -> copy of nonlegendary enchantment',cnt(a,'Impact Tremors')===2,String(cnt(a,'Impact Tremors')));await cd(g,a,b,cx,3);ok('Calix: only once each turn',cnt(a,'Impact Tremors')===2);});
await T('Calix enchanted creature',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Calix, Guided by Fate'));put(g,a,C('Impact Tremors'));const br=put(g,a,bear());const au=put(g,a,tagCard(mk('Aura','Enchantment — Aura','{W}','Enchant creature\nEnchanted creature gets +1/+1.',1)));au.attachedTo=br.id;await cd(g,a,b,br,2);ok('Calix: enchanted creature -> copy',cnt(a,'Impact Tremors')===2||cnt(a,'Aura')===2);});

// ---- Yuna
await T('Yuna, Hope of Spira',async()=>{const g=fresh();const [a,b]=g.players;const yu=put(g,a,C('Yuna, Hope of Spira'));const ec=put(g,a,tagCard(mk('Glimmer','Enchantment Creature — Spirit','{3}','',3,3,3)));const br=put(g,a,bear());g.active=0;g.refreshStatics();const k=x=>[...(x.card.kw||[]),...(x.kwS||[]),...(x.kwT||[]),...(x.kwL||[])];ok('Yuna: your turn -> Yuna & ench creature have trample+lifelink',HK(g,yu,'trample')&&HK(g,ec,'lifelink'));ok('Yuna: non-enchantment creature no trample',!HK(g,br,'trample'));ok('Yuna: ward 2 on your turn (Yuna & ench creature), none on non-ench creature',g.wardOf(yu)===2&&g.wardOf(ec)===2&&g.wardOf(br)===0,`${g.wardOf(yu)} ${g.wardOf(ec)} ${g.wardOf(br)}`);g.active=1;g.refreshStatics();ok("Yuna: no ward on opponent's turn",g.wardOf(yu)===0&&g.wardOf(ec)===0);ok("Yuna: opponent's turn -> no trample",!HK(g,yu,'trample')&&!HK(g,ec,'lifelink'));});

// ---- Leaf-Crowned Visionary
await T('Leaf-Crowned Visionary',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Leaf-Crowned Visionary'));const e=elf();a.hand=[e];W(g,a,3,'Forest');const h0=a.hand.length;await g.cast(a,e,'hand');await flush(g);ok('Leaf-Crowned: Elf cast + pay {G} -> draw',a.hand.length===h0,`${a.hand.length-h0}`);
// ENGINE BUG: draw is free (no {G} payment)
ok('Leaf-Crowned: paid {G}',a.battlefield.filter(x=>x.card.isLand&&x.tapped).length===3);
const nb=bear();a.hand=[nb];W(g,a,2,'Forest');const h1=a.hand.length;await g.cast(a,nb,'hand');await flush(g);ok('Leaf-Crowned: non-Elf -> no draw',a.hand.length===h1-1);
const e2=elf();a.hand=[e2];a.battlefield.forEach(x=>{if(x.card.isLand)x.tapped=true});W(g,a,2,'Forest');const h2=a.hand.length;await g.cast(a,e2,'hand');await flush(g);
// ENGINE BUG: draw is free (no {G} payment)
ok("Leaf-Crowned: can't pay {G} -> no draw",a.hand.length===h2-1,`${a.hand.length-h2}`);});

// ---- Cloudshift
await T('Cloudshift',async()=>{const g=fresh();const [a,b]=g.players;const so=opp(g,a,C('Sea Gate Oracle'));const v=opp(g,b,C('Sea Gate Oracle'));const cs=C('Cloudshift');a.hand=[cs];W(g,a,1,'Plains');const h0=a.hand.length;await g.cast(a,cs,'hand',undefined,{instant:true});await flush(g);ok('Cloudshift (no explicit target): own creature blinked (re-ETB)',a.battlefield.some(x=>x.card===so.card)&&!a.battlefield.includes(so)&&a.hand.length===h0-1+1,`${a.hand.length-h0}`);ok("Cloudshift: opponent's creature not affected",b.battlefield.includes(v));});
await T('Cloudshift (explicit target)',async()=>{const g=fresh();const [a]=g.players;const so=opp(g,a,C('Sea Gate Oracle'));const cs=C('Cloudshift');a.hand=[cs];W(g,a,1,'Plains');await g.cast(a,cs,'hand',so,{instant:true});await flush(g);
// ENGINE BUG: with a target, resolve() takes the generic 'removal' branch and exiles the creature permanently
ok('Cloudshift: targeted own creature returns to the battlefield',a.battlefield.some(x=>x.card===so.card),last(g,4));});
await T('Cloudshift (opp target)',async()=>{const g=fresh();const [a,b]=g.players;const v=opp(g,b,bear());const cs=C('Cloudshift');ok('Cloudshift: opponent creature is not a legal target',!g.targetOk(cs,v,a));});

// ---- Aang
await T('Aang, the Last Airbender',async()=>{const g=fresh();const [a,b]=g.players;const v=opp(g,b,S('Big','Creature — Ogre','{4}','',5,5));const ld=opp(g,b,L('Forest'));const ag=C('Aang, the Last Airbender');a.hand=[ag];W(g,a,4,'Plains');await g.cast(a,ag,'hand');await flush(g);ok('Aang: airbends opposing nonland permanent (exiled)',!b.battlefield.includes(v)&&b.exile.includes(v.card));ok('Aang: lands not airbended',b.battlefield.includes(ld));ok('Aang: not itself',a.battlefield.some(x=>x.card===ag));});

// ---- Earthshape
await T('Earthshape',async()=>{const g=fresh();const [a,b]=g.players;const ld=put(g,a,L('Forest'));const sm=put(g,a,bear());const big=put(g,a,S('Big','Creature — Ogre','{4}','',5,5));const es=C('Earthshape');await g.runOps(a,es.spellOps,es,{target:ld});await flush(g);g.refreshStatics();
// ENGINE BUG: only earthbend parsed
ok('Earthshape: power<=land power creature gains indestructible+hexproof',HK(g,sm,'indestructible')&&HK(g,sm,'hexproof'));ok('Earthshape: bigger creature does not',!HK(g,big,'indestructible'));
// ENGINE BUG: only earthbend parsed
ok('Earthshape: you gain hexproof',a.hexproofTurn===g.turn||!!a.playerHexproof||(a.kwEOT&&a.kwEOT.has&&a.kwEOT.has('hexproof')));});

// ---- Tale of Momo
await T('Tale of Momo',async()=>{const g=fresh();const [a]=g.players;const tm=C('Tale of Momo');ok('Tale of Momo: full cost when nothing left',g.costOf(a,tm,'hand').total===3,JSON.stringify(g.costOf(a,tm,'hand')));const x=put(g,a,bear());await g.destroy(a,x);await flush(g);
// ENGINE BUG: creatureLeftTurn is never set
ok('Tale of Momo: costs {2} less after creature left bf',g.costOf(a,tm,'hand').total===1,JSON.stringify(g.costOf(a,tm,'hand')));});
await T('Tale of Momo opp creature',async()=>{const g=fresh();const [a,b]=g.players;const tm=C('Tale of Momo');const x=opp(g,b,bear());await g.destroy(b,x);await flush(g);ok("Tale of Momo: opponent's creature leaving does not reduce",g.costOf(a,tm,'hand').total===3,JSON.stringify(g.costOf(a,tm,'hand')));});
await T('Tale of Momo search',async()=>{const g=fresh();const [a]=g.players;const tm=C('Tale of Momo');const ally=tagCard(mk('Ally Guy','Creature — Human Ally','{1}{W}','',2,2,2));const nb=bear();a.library.push(ally);a.library.push(nb);await g.runOps(a,tm.spellOpsX||tm.spellOps,tm,{});ok('Tale of Momo: Ally creature to hand (not bear)',a.hand.includes(ally)&&!a.hand.includes(nb));const g2=fresh();const [a2]=g2.players;const al2=tagCard(mk('Ally Guy','Creature — Human Ally','{1}{W}','',2,2,2));a2.graveyard.push(al2);await g2.runOps(a2,tm.spellOpsX||tm.spellOps,tm,{});
// ENGINE BUG: tutorTo ignores op.orGy
ok('Tale of Momo: Ally from graveyard',a2.hand.includes(al2));});

// ---- Knight of the White Orchid
await T('Knight of the White Orchid',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,2,'Plains');W(g,b,3,'Forest');a.library.push(L('Plains'));const k=C('Knight of the White Orchid');a.hand=[k];await g.cast(a,k,'hand');await flush(g);ok('Knight of White Orchid: opp more lands -> Plains fetched',a.battlefield.filter(x=>x.card.isLand).length===3);
const g2=fresh();const [a2,b2]=g2.players;W(g2,a2,3,'Plains');W(g2,b2,3,'Forest');a2.library.push(L('Plains'));const k2=C('Knight of the White Orchid');a2.hand=[k2];await g2.cast(a2,k2,'hand');await flush(g2);
// ENGINE BUG: intervening-if (opponent controls more lands) not parsed
ok('Knight of White Orchid: equal lands -> no Plains',a2.battlefield.filter(x=>x.card.isLand).length===3,String(a2.battlefield.filter(x=>x.card.isLand).length));});

// ---- Halana and Alena
await T('Halana and Alena, Partners',async()=>{const g=fresh();const [a]=g.players;const ha=put(g,a,C('Halana and Alena, Partners'));const x=put(g,a,bear());x.summoning=true;const pw=g.powerOf(a,ha);await g.fireTriggers(a,'combatStart');await flush(g);ok('Halana: X counters on another creature + haste',x.counters===pw&&!ha.counters&&(HK(g,x,'haste')||!x.summoning),`${x.counters} pw ${pw}`);g.active=1;const c0=x.counters;await g.fireTriggers(g.players[1],'combatStart');await flush(g);ok("Halana: not on opponent's turn",x.counters===c0);});
await T('Halana alone',async()=>{const g=fresh();const [a]=g.players;const ha=put(g,a,C('Halana and Alena, Partners'));await g.fireTriggers(a,'combatStart');await flush(g);ok('Halana: no other creature -> no counters on itself',!ha.counters);});

// ---- Yuriko
await T("Yuriko, the Tiger's Shadow",async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C("Yuriko, the Tiger's Shadow"));const n=put(g,a,ninja());const top=S('Fatty','Creature — Beast','{4}','',4,4);top.cmc=4;a.library.push(top);const l0=oppLife(g,a);await cd(g,a,b,n,1);ok('Yuriko: ninja hit -> top card to hand',a.hand.includes(top));ok('Yuriko: each opp loses MV (4)',oppLife(g,a).every((v,i)=>v===l0[i]-4),JSON.stringify(oppLife(g,a)));const br=put(g,a,bear());const t2=S('Fat2','Creature — Beast','{4}','',4,4);t2.cmc=4;a.library.push(t2);await cd(g,a,b,br,2);ok('Yuriko: non-ninja -> nothing',!a.hand.includes(t2));});

// ---- Mist-Cloaked Herald
await T('Mist-Cloaked Herald',async()=>{const g=fresh();const [a,b]=g.players;const m=put(g,a,C('Mist-Cloaked Herald'));const v=opp(g,b,bear());ok("Mist-Cloaked Herald: can't be blocked",!g.canBlock(v,m));const br=put(g,a,bear());ok('Mist-Cloaked Herald: others still blockable',g.canBlock(v,br));});

// ---- Thousand-Faced Shadow
await T('Thousand-Faced Shadow',async()=>{const g=fresh();const [a,b]=g.players;const big=put(g,a,S('Big','Creature — Ogre','{4}','',5,5));const ub=put(g,a,bear());const tf=C('Thousand-Faced Shadow');const pm=await g.enterPerm(a,tf,{tapped:true});g.curAttackers=[big,ub,pm];await g.runOps(a,tf.etbOps,tf,{perm:pm});await flush(g);ok('Thousand-Faced: attacking -> token copy of another attacker, tapped and attacking',cnt(a,'Big')===2&&g.curAttackers.some(x=>x.card.name==='Big'&&x.card.token&&x.tapped),String(cnt(a,'Big')));
const g2=fresh();const [a2]=g2.players;put(g2,a2,S('Big','Creature — Ogre','{4}','',5,5));const tf2=C('Thousand-Faced Shadow');a2.hand=[tf2];W(g2,a2,1,'Island');await g2.cast(a2,tf2,'hand');await flush(g2);ok('Thousand-Faced: cast normally (not attacking) -> no token',cnt(a2,'Big')===1&&!a2.battlefield.some(x=>x.card.token));
const g3=fresh();const [a3]=g3.players;const lone=C('Thousand-Faced Shadow');const pm3=await g3.enterPerm(a3,lone,{tapped:true});g3.curAttackers=[pm3];await g3.runOps(a3,lone.etbOps,lone,{perm:pm3});ok('Thousand-Faced: only attacker -> no copy of itself',!a3.battlefield.some(x=>x.card.token));});

// ---- Joraga Warcaller
await T('Joraga Warcaller',async()=>{const g=fresh();const [a,b]=g.players;const jw=put(g,a,C('Joraga Warcaller'));const e=put(g,a,elf());const nb=put(g,a,bear());const oe=opp(g,b,elf());g.refreshStatics();ok('Joraga: 0 counters -> elf unpumped',g.powerOf(a,e)===2);jw.counters=2;g.refreshStatics();ok('Joraga: 2 counters -> other elf +2/+2',g.powerOf(a,e)===4&&g.toughOf(a,e)===4);ok('Joraga: non-elf / opponent elf / itself unaffected',g.powerOf(a,nb)===2&&g.powerOf(b,oe)===2&&g.powerOf(a,jw)===3);});

// ---- Entrust the Spark
await T('Entrust the Spark',async()=>{const g=fresh();const [a]=g.players;const pw=put(g,a,C('Liliana Vess'));const t=C('Teferi, Hero of Dominaria');a.library.push(t);const es=C('Entrust the Spark');a.hand=[es];W(g,a,3,'Island');W(g,a,2,'Forest');await g.cast(a,es,'hand');await flush(g);ok('Entrust the Spark: fetched PW onto bf',a.battlefield.some(x=>x.card===t),a.battlefield.map(x=>x.card.name).join());
// ENGINE BUG: no sacrifice, search unconditional
ok('Entrust the Spark: the planeswalker was sacrificed',!a.battlefield.includes(pw));
const g2=fresh();const [a2]=g2.players;const t2=C('Teferi, Hero of Dominaria');a2.library.push(t2);const es2=C('Entrust the Spark');a2.hand=[es2];W(g2,a2,3,'Island');W(g2,a2,2,'Forest');await g2.cast(a2,es2,'hand');await flush(g2);
// ENGINE BUG: no sacrifice, search unconditional
ok('Entrust the Spark: no PW to sacrifice -> no search',!a2.battlefield.some(x=>x.card===t2));});

// ---- Good-Fortune Unicorn
await T('Good-Fortune Unicorn',async()=>{const g=fresh();const [a,b]=g.players;const gu=C('Good-Fortune Unicorn');const up=await g.enterPerm(a,gu);await g.creatureEntered(a,up);await flush(g);ok('Good-Fortune: not itself',!up.counters);const x=await g.enterPerm(a,bear());await g.creatureEntered(a,x);await flush(g);ok('Good-Fortune: another creature +1 counter',x.counters===1);g.active=1;const y=await g.enterPerm(b,bear());await g.creatureEntered(b,y);await flush(g);ok("Good-Fortune: opponent's creature no counter",!y.counters);});

// ---- Warden of the Grove
await T('Warden of the Grove',async()=>{const g=fresh();const [a]=g.players;const wd=put(g,a,C('Warden of the Grove'));wd.counters=2;const x=await g.enterPerm(a,bear());await g.creatureEntered(a,x);await flush(g);ok('Warden: nontoken creature endures 2',x.counters===2||a.battlefield.some(z=>z.card.name==='Spirit'&&g.powerOf(a,z)===2),String(x.counters));const tk=put(g,a,{...S('Tok','Token Creature — Soldier','','',1,1),token:true});tk.card.token=true;const n0=a.battlefield.length;await g.creatureEntered(a,tk);await flush(g);ok('Warden: token creature does not endure',!tk.counters&&a.battlefield.length===n0);});

// ---- Ascend from Avernus
await T('Ascend from Avernus',async()=>{const g=fresh();const [a]=g.players;const c2=bear();const c5=S('Five','Creature — Beast','{5}','',5,5);c5.cmc=5;const pw=C('Jace, Wielder of Mysteries');const lv=C('Liliana Vess');a.graveyard.push(lv);const ld=L('Forest');const ins=tagCard(mk('Opt','Instant','{U}','Draw a card.',1));a.graveyard.push(c2,c5,pw,ld,ins);const af=C('Ascend from Avernus');a.hand=[af];W(g,a,7,'Plains');a.ai.chooseX=()=>4;await g.cast(a,af,'hand');await flush(g);
// ENGINE BUG: no spellOps
ok('Ascend from Avernus: MV2 creature and MV4 PW returned (X=4)',a.battlefield.some(x=>x.card===c2)&&a.battlefield.some(x=>x.card===pw),a.battlefield.map(x=>x.card.name).join());ok('Ascend from Avernus: MV5 creature, MV5 PW (Liliana Vess), land, instant stay',a.graveyard.includes(c5)&&a.graveyard.includes(lv)&&a.graveyard.includes(ld)&&a.graveyard.includes(ins));ok('Ascend from Avernus: exiles itself',a.exile.includes(af));});

// ---- Nalia
await T("Nalia de'Arnise",async()=>{const g=fresh();const [a]=g.players;const na=put(g,a,C("Nalia de'Arnise"));const x=put(g,a,bear());await g.fireTriggers(a,'combatStart');await flush(g);
// ENGINE BUG: full-party intervening-if not parsed
ok('Nalia: no full party -> no counters',!x.counters&&!na.counters);
const g2=fresh();const [a2]=g2.players;const na2=put(g2,a2,C("Nalia de'Arnise"));const x2=put(g2,a2,bear());for(const t of ['Cleric','Warrior','Wizard'])put(g2,a2,tagCard(mk(t+'y','Creature — Human '+t,'{1}','',1,1,1)));await g2.fireTriggers(a2,'combatStart');await flush(g2);ok('Nalia: full party -> +1 counter each',x2.counters===1&&na2.counters===1);
// ENGINE BUG: deathtouch rider not parsed
ok('Nalia: ... and deathtouch',HK(g2,x2,'deathtouch'));});

// ---- Avacyn
await T('Avacyn, Angel of Horror',async()=>{const g=fresh();const [a,b]=g.players;const av=put(g,a,C('Avacyn, Angel of Horror'));const x=put(g,a,bear());const tk=put(g,a,S('Tok','Token Creature — Soldier','','',1,1));tk.card.token=true;const v=opp(g,b,bear());await g.destroy(a,x);await g.destroy(a,tk);await g.destroy(b,v);await flush(g);const er=(g.endReturns||[]).map(r=>r.card);ok('Avacyn: not returned immediately',!a.battlefield.some(z=>z.card===x.card));ok('Avacyn: nontoken creature scheduled to return at next end step',er.includes(x.card));ok("Avacyn: token / opponent's creature not scheduled",er.length===1);await g.destroy(a,av);await flush(g);ok('Avacyn: Avacyn herself scheduled',(g.endReturns||[]).some(r=>r.card===av.card));});

// ---- Fleshbag Marauder
await T('Fleshbag Marauder',async()=>{const g=fresh();const [a,b,c]=g.players;const v=opp(g,b,bear());const w=opp(g,c,bear());const mine=put(g,a,bear());const fm=C('Fleshbag Marauder');a.hand=[fm];W(g,a,3,'Swamp');await g.cast(a,fm,'hand');await flush(g);ok('Fleshbag: each opponent sacrificed',!b.battlefield.includes(v)&&!c.battlefield.includes(w));ok('Fleshbag: you sacrifice one too (exactly one of yours)',a.battlefield.filter(x=>x.card.isCreature).length===1);});

// ---- Kaito
await T('Kaito Shizuki phase',async()=>{const g=fresh();const [a,b]=g.players;const k=await g.enterPerm(a,C('Kaito Shizuki'));await g.fireTriggers(a,'end');g.turn++;g.active=1;
// ENGINE BUG: phaseSelfIfNew only sets protTurn for the current turn; Kaito is back on the opponents' turns
ok("Kaito: entered this turn -> phased out (still gone on the next opponent's turn)",!a.battlefield.includes(k)||k.protTurn===g.turn);const g2=fresh();const [a2]=g2.players;const k2=put(g2,a2,C('Kaito Shizuki'));k2.enteredTurn=g2.turn-1;await g2.fireTriggers(a2,'end');ok('Kaito: entered earlier -> stays (not protected)',a2.battlefield.includes(k2)&&k2.protTurn!==g2.turn);});
await T('Kaito Shizuki +1',async()=>{const g=fresh();const [a,b]=g.players;const k=put(g,a,C('Kaito Shizuki'));const h0=a.hand.length;const o=g.abilityOptions(a,{}).find(o=>o.perm===k&&o.ab.loyalty===1);await g.activate(a,o);ok('Kaito +1: not attacked -> draw then discard',a.hand.length===h0);
const g2=fresh();const [a2,b2]=g2.players;const k2=put(g2,a2,C('Kaito Shizuki'));a2.attackedTurn=g2.turn;const h1=a2.hand.length;const o2=g2.abilityOptions(a2,{}).find(o=>o.perm===k2&&o.ab.loyalty===1);await g2.activate(a2,o2);
// ENGINE BUG: discard is unconditional
ok('Kaito +1: attacked this turn -> no discard',a2.hand.length===h1+1,String(a2.hand.length-h1));});
await T('Kaito Shizuki -2',async()=>{const g=fresh();const [a,b]=g.players;const k=put(g,a,C('Kaito Shizuki'));const o=g.abilityOptions(a,{}).find(o=>o.perm===k&&o.ab.loyalty===-2);await g.activate(a,o);const t=a.battlefield.find(x=>x.card.token&&/Ninja/.test(x.card.type));const v=opp(g,b,bear());ok('Kaito -2: 1/1 blue Ninja token',t&&g.powerOf(a,t)===1&&(t.card.colors||[]).includes('U'));
// ENGINE BUG: the token's "can't be blocked" is dropped
ok("Kaito -2: token can't be blocked",t&&!g.canBlock(v,t));});

// ---- Divine Visitation
await T('Divine Visitation',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Divine Visitation'));await g.runOps(a,[{op:'tokens',n:2,pt:[1,1],kw:[],types:'Saproling',tcolors:['G']}],{name:'Src'},{});const an=a.battlefield.filter(x=>x.card.token&&/Angel/.test(x.card.type));ok('Divine Visitation: 2 creature tokens -> 2 4/4 flying vigilance Angels',an.length===2&&g.powerOf(a,an[0])===4&&HK(g,an[0],'flying')&&HK(g,an[0],'vigilance'),String(an.length));await g.runOps(a,[{op:'artifactTokens',n:1,kind:'treasure'}],{name:'Src'},{});ok('Divine Visitation: noncreature token unchanged',cnt(a,'Treasure')===1);await g.runOps(b,[{op:'tokens',n:1,pt:[1,1],kw:[],types:'Saproling',tcolors:['G']}],{name:'Src'},{});ok("Divine Visitation: opponent's token unchanged",b.battlefield.some(x=>x.card.token&&/Saproling/.test(x.card.type)));});

// ---- Harmonic Prodigy
await T('Harmonic Prodigy',async()=>{const g=fresh();const [a]=g.players;const hp=put(g,a,C('Harmonic Prodigy'));const wz=put(g,a,tagCard(mk('Wiz','Creature — Human Wizard','{1}','',1,1,1)));const sh=put(g,a,tagCard(mk('Sham','Creature — Elf Shaman','{1}','',1,1,1)));const br=put(g,a,bear());ok('Harmonic Prodigy: Wizard trigger x2',g.trigTimes(a,wz,'etb')===2);ok('Harmonic Prodigy: Shaman trigger x2',g.trigTimes(a,sh,'etb')===2);ok('Harmonic Prodigy: non-Wizard/Shaman x1',g.trigTimes(a,br,'etb')===1);ok('Harmonic Prodigy: not itself (another Wizard)',g.trigTimes(a,hp,'etb')===1);
// ENGINE BUG: trigTimes skips trigDouble for noncreature sources (!b.card.isCreature)
const ench=put(g,a,tagCard(mk('Wizard Lore','Kindred Enchantment — Wizard','{1}','',1)));ok('Harmonic Prodigy: noncreature Wizard permanent (kindred) also x2',g.trigTimes(a,ench,'etb')===2);const b=g.players[1];const ow=opp(g,b,tagCard(mk('OWiz','Creature — Human Wizard','{1}','',1,1,1)));ok("Harmonic Prodigy: opponent's Wizard x1",g.trigTimes(b,ow,'etb')===1);});

// ---- Lightning, Army of One
await T('Lightning, Army of One',async()=>{const g=fresh();const [a,b,c]=g.players;const lt=put(g,a,C('Lightning, Army of One'));const br=put(g,a,bear());const l00=b.life;await cd(g,a,b,br,2);ok('Lightning: no stagger before Lightning connects',!b.staggerUntil&&l00-b.life===0);await cd(g,a,b,lt,3);ok('Lightning: staggered',!!b.staggerUntil);const lc=b.life;await cd(g,a,b,br,2);ok('Lightning: later combat damage to staggered player doubled (extra 2)',lc-b.life===2,String(lc-b.life));const lc2=c.life;await cd(g,a,c,br,2);ok('Lightning: unstaggered player combat damage not doubled',lc2-c.life===0,String(lc2-c.life));
const l0=b.life,l1=c.life;await g.runOps(a,[{op:'damage',n:2,to:'each opponent'}],{name:'Burn',colors:['R']},{});
// ENGINE BUG: stagger only doubles combat damage to the player (combatDamageTriggers), not other sources / permanents
ok('Lightning: staggered player takes double noncombat damage',l0-b.life===4,String(l0-b.life));ok('Lightning: other player normal',l1-c.life===2,String(l1-c.life));const v=opp(g,b,S('Wall','Creature — Wall','{3}','',0,3));await g.runOps(a,[{op:'damage',n:2,to:'target creature'}],{name:'Shock',colors:['R']},{target:v});await g.sba();
// ENGINE BUG: stagger does not double damage to the player's permanents
ok("Lightning: staggered player's permanent takes double",!b.battlefield.includes(v));a.turnCount=(a.turnCount||0)+1;g.turn++;const l2=b.life;await cd(g,a,b,br,2);ok('Lightning: ends at your next turn',l2-b.life===0,String(l2-b.life));});

// ---- Aura Mutation
await T('Aura Mutation',async()=>{const g=fresh();const [a,b]=g.players;const en=opp(g,b,tagCard(mk('Big Ench','Enchantment','{3}{W}{W}','',5)));en.card.cmc=5;const am=C('Aura Mutation');a.hand=[am];W(g,a,1,'Plains');W(g,a,1,'Forest');await g.cast(a,am,'hand',en,{instant:true});await flush(g);ok('Aura Mutation: enchantment destroyed',!b.battlefield.includes(en),last(g,6));
// ENGINE BUG: token count parsed as fixed 2
ok('Aura Mutation: X = its MV (5) saprolings',a.battlefield.filter(x=>/Saproling/.test(x.card.type)).length===5,String(a.battlefield.filter(x=>/Saproling/.test(x.card.type)).length));
const g2=fresh();const [a2,b2]=g2.players;const e1=opp(g2,b2,tagCard(mk('Cheap Ench','Enchantment','{W}','',1)));e1.card.cmc=1;const am2=C('Aura Mutation');a2.hand=[am2];W(g2,a2,1,'Plains');W(g2,a2,1,'Forest');await g2.cast(a2,am2,'hand',e1,{instant:true});await flush(g2);
// ENGINE BUG: token count parsed as fixed 2
ok('Aura Mutation: MV1 enchantment -> 1 saproling',a2.battlefield.filter(x=>/Saproling/.test(x.card.type)).length===1,String(a2.battlefield.filter(x=>/Saproling/.test(x.card.type)).length));});

// ---- Jolly Balloon Man
await T('The Jolly Balloon Man',async()=>{const g=fresh();const [a]=g.players;const jb=put(g,a,C('The Jolly Balloon Man'));const big=put(g,a,S('Big','Creature — Ogre','{4}','',5,5));W(g,a,1,'Mountain');const o=abO(g,a,jb.card);await g.activate(a,o);await flush(g);const t=a.battlefield.find(x=>x.card.token&&x.card.name==='Big');ok('Jolly Balloon Man: copy of another creature, 1/1 Balloon flying haste',t&&g.powerOf(a,t)===1&&/Balloon/.test(t.card.type)&&HK(g,t,'flying')&&!t.summoning);ok('Jolly Balloon Man: not a copy of itself',!a.battlefield.some(x=>x.card.token&&/Jolly/.test(x.card.name)));ok('Jolly Balloon Man: token marked to be sacrificed at next end step',t&&t.sacAtEnd);g.phase='combat';jb.tapped=false;W(g,a,1,'Mountain');ok('Jolly Balloon Man: sorcery speed only',!g.abilityOptions(a,{instant:true}).some(x=>x.card===jb.card&&x.ab.ops.some(o=>o.op==='copyPerm')));});
await T('Jolly Balloon Man alone',async()=>{const g=fresh();const [a]=g.players;const jb=put(g,a,C('The Jolly Balloon Man'));W(g,a,1,'Mountain');const o=abO(g,a,jb.card);if(o){await g.activate(a,o);await flush(g);}ok('Jolly Balloon Man: no other creature -> no token',!a.battlefield.some(x=>x.card.token));});

// ---- Phantasmal Image
await T('Phantasmal Image',async()=>{const g=fresh();const [a,b]=g.players;const v=opp(g,b,S('Big','Creature — Ogre','{4}','',5,5));const pi=C('Phantasmal Image');a.hand=[pi];W(g,a,2,'Island');await g.cast(a,pi,'hand');await flush(g);const pm=a.battlefield.find(x=>x.card.name==='Big');ok('Phantasmal Image: copies opposing creature',!!pm&&g.powerOf(a,pm)===5);
// ENGINE BUG: clone ignores 'except it's an Illusion' and the sacrifice-when-targeted ability
ok('Phantasmal Image: is an Illusion too',pm&&/Illusion/.test(pm.card.type));});

// ---- Glint-Horn Buccaneer
await T('Glint-Horn Buccaneer',async()=>{const g=fresh();const [a,b]=g.players;const gh=put(g,a,C('Glint-Horn Buccaneer'));a.hand=[bear(),bear(),bear()];const l0=oppLife(g,a);await g.discardCard(a,a.hand[0]);await flush(g);ok('Glint-Horn: you discard (discardCard) -> 1 dmg each opp',oppLife(g,a).every((v,i)=>v===l0[i]-1),JSON.stringify(oppLife(g,a)));const l1=oppLife(g,a);b.hand=[bear()];await g.discardCard(b,b.hand[0]);await flush(g);ok('Glint-Horn: opponent discards -> nothing',oppLife(g,a).every((v,i)=>v===l1[i]));
const l2=oppLife(g,a);await g.runOps(a,[{op:'discard',n:1}],{name:'Loot'},{});await flush(g);
// ENGINE BUG: 'discard' op bypasses discardCard, so discard triggers never fire
ok('Glint-Horn: discard via an effect (discard op) -> 1 dmg each opp',oppLife(g,a).every((v,i)=>v===l2[i]-1),JSON.stringify(oppLife(g,a)));
W(g,a,2,'Mountain');
// ENGINE BUG: 'activate only if attacking' not enforced
ok('Glint-Horn: draw ability unavailable when not attacking',!g.abilityOptions(a,{}).some(x=>x.card===gh.card&&x.ab.ops.some(o=>o.op==='draw')));});
await T('Glint-Horn Buccaneer self-discard',async()=>{const g=fresh();const [a,b]=g.players;const gh=put(g,a,C('Glint-Horn Buccaneer'));gh.attackTurn=g.turn;g.curAttackers=[gh];g.phase='combat';a.hand=[bear(),bear()];W(g,a,2,'Mountain');const o=g.abilityOptions(a,{}).find(x=>x.card===gh.card&&x.ab.ops.some(o=>o.op==='draw'));ok('Glint-Horn: draw ability available while attacking',!!o);if(!o)return;const l0=oppLife(g,a);const h0=a.hand.length;await g.activate(a,o);await flush(g);ok('Glint-Horn: discarded + drew',a.hand.length===h0&&a.graveyard.length===1);
// ENGINE BUG: discard cost in activate() bypasses discardCard
ok('Glint-Horn: discarding as the ability cost triggers 1 dmg each opp',oppLife(g,a).every((v,i)=>v===l0[i]-1),JSON.stringify(oppLife(g,a)));});

// ---- Dramatic Reversal
await T('Dramatic Reversal',async()=>{const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());x.tapped=true;const ar=put(g,a,C('Ichor Wellspring'));ar.tapped=true;const ld=put(g,a,L('Island'));ld.tapped=true;const v=opp(g,b,bear());v.tapped=true;const dr=C('Dramatic Reversal');await g.runOps(a,dr.spellOps,dr,{});ok('Dramatic Reversal: your nonland permanents untapped',!x.tapped&&!ar.tapped);ok('Dramatic Reversal: lands and opponent perms stay tapped',ld.tapped&&v.tapped);});

console.log(pass+' passed, '+fails+' failed');})();
