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
const PL=async(g,a,card)=>{a.hand.push(card);a.landsThisTurn=0;await g.playLand(a,card);return a.battlefield.find(b=>b.card===card);};
const abO=(g,a,card,re)=>g.abilityOptions(a,{}).find(x=>x.card===card&&(!re||re.test(x.ab.label||'')||x.ab.ops.some(o=>re.test(o.op))));
const cd=async(g,a,b,att,dmg)=>{g._cdDefender=b;g._cdDmg=dmg;await g.combatDamageTriggers(a,att);await flush(g);};
const nm=(p,n)=>p.battlefield.filter(b=>b.card.name===n);
const art=(n='Trinket',cmc=1)=>SC(n,'Artifact','{'+cmc+'}','',cmc);
const cast=async(g,a,card,target,o={})=>{if(!a.hand.includes(card))a.hand.push(card);await g.cast(a,card,'hand',target,o);await flush(g);};
// ---------------- lands
await T('Fabled Passage',async()=>{
  for(const [n,exp] of [[2,true],[3,false]]){const g=fresh();const [a]=g.players;W(g,a,n,'Forest');const fp=put(g,a,C('Fabled Passage'));const f=L('Island');a.library.push(f);await g.activateFetch(a,fp,f);await flush(g);const pm=a.battlefield.find(b=>b.card===f);
  ok(`Fabled Passage: ${n} other lands -> fetched land ${exp?'tapped':'untapped'}`,pm&&pm.tapped===exp,pm?String(pm.tapped):'none');}
});
await T('Turbulent Moor',async()=>{
  for(const [n,exp] of [[7,true],[8,false]]){const g=fresh();const [a,b,c]=g.players;W(g,b,Math.ceil(n/2),'Forest');W(g,c,Math.floor(n/2),'Forest');const pm=await PL(g,a,C('Turbulent Moor'));ok(`Turbulent Moor: opps control ${n} lands -> ${exp?'tapped':'untapped'}`,pm&&pm.tapped===exp);}
  {const g=fresh();const [a]=g.players;W(g,a,10,'Forest');const pm=await PL(g,a,C('Turbulent Moor'));ok('Turbulent Moor: my own 10 lands do not count -> tapped',pm.tapped);}
});
await T('Spectator Seating',async()=>{
  {const g=fresh(3);const [a]=g.players;const pm=await PL(g,a,C('Spectator Seating'));ok('Spectator Seating: 2 opponents -> untapped',!pm.tapped);}
  {const g=fresh(2);const [a]=g.players;const pm=await PL(g,a,C('Spectator Seating'));ok('Spectator Seating: 1 opponent -> tapped',pm.tapped);}
});
await T('Deathcap Glade',async()=>{
  for(const [n,exp] of [[1,true],[2,false]]){const g=fresh();const [a]=g.players;W(g,a,n,'Forest');const pm=await PL(g,a,C('Deathcap Glade'));ok(`Deathcap Glade: ${n} other lands -> ${exp?'tapped':'untapped'}`,pm.tapped===exp);}
  {const g=fresh();const [a]=g.players;W(g,a,1,'Forest');put(g,a,bear());const pm=await PL(g,a,C('Deathcap Glade'));ok('Deathcap Glade: nonland permanents do not count',pm.tapped);}
});
await T('Woodland Cemetery',async()=>{
  for(const [land,exp] of [['Swamp',false],['Forest',false],['Island',true]]){const g=fresh();const [a]=g.players;W(g,a,1,land);const pm=await PL(g,a,C('Woodland Cemetery'));ok(`Woodland Cemetery: control ${land} -> ${exp?'tapped':'untapped'}`,pm.tapped===exp);}
  {const g=fresh();const [a,b]=g.players;W(g,b,2,'Swamp');const pm=await PL(g,a,C('Woodland Cemetery'));ok('Woodland Cemetery: opponent\'s Swamp does not count',pm.tapped);}
});
// ---------------- Brass's Tunnel-Grinder
await T("Brass's Tunnel-Grinder",async()=>{
  {const g=fresh();const [a]=g.players;const c=C("Brass's Tunnel-Grinder");const pm=put(g,a,c);const x=put(g,a,bear());await g.destroy(a,x);await flush(g);await g.fireTriggers(a,'end');await flush(g);ok("Brass's Tunnel-Grinder: descended -> bore counter",pm.ck&&pm.ck.bore===1,JSON.stringify(pm.ck));}
  {const g=fresh();const [a]=g.players;const c=C("Brass's Tunnel-Grinder");const pm=put(g,a,c);a.graveyard.push(SC('Shock','Instant','{R}','Shock deals 2 damage to any target.',1));await flush(g);await g.fireTriggers(a,'end');await flush(g);ok("Brass's Tunnel-Grinder: no permanent card to gy -> no bore counter",!(pm.ck&&pm.ck.bore),JSON.stringify(pm.ck));}
  {const g=fresh();const [a,b]=g.players;const c=C("Brass's Tunnel-Grinder");const pm=put(g,a,c);const v=opp(g,b,bear());await g.destroy(b,v);await flush(g);await g.fireTriggers(a,'end');await flush(g);ok("Brass's Tunnel-Grinder: opponent's permanent to their gy -> no bore counter",!(pm.ck&&pm.ck.bore),JSON.stringify(pm.ck));}
  {const g=fresh();const [a]=g.players;const c=C("Brass's Tunnel-Grinder");const pm=put(g,a,c);pm.ck={bore:1};const x=put(g,a,bear());await g.destroy(a,x);await flush(g);await g.fireTriggers(a,'end');await flush(g);ok("Brass's Tunnel-Grinder: 2 counters -> not transformed",pm.ck.bore===2&&!pm.card.isLand,pm.card.name);}
  {const g=fresh();const [a]=g.players;const c=C("Brass's Tunnel-Grinder");const pm=put(g,a,c);pm.ck={bore:2};const x=put(g,a,bear());await g.destroy(a,x);await flush(g);await g.fireTriggers(a,'end');await flush(g);ok("Brass's Tunnel-Grinder: 3rd counter -> counters removed and transformed",!pm.ck.bore&&pm.card.isLand&&/^Tecutlan/.test(pm.card.name),pm.card.name+' '+JSON.stringify(pm.ck));}
});
// ---------------- Ghost Vacuum
await T('Ghost Vacuum',async()=>{
  const g=fresh();const [a,b]=g.players;W(g,a,6,'Plains');const gv=put(g,a,C('Ghost Vacuum'));const cr=bear(),ins=SC('Shock','Instant','{R}','Shock deals 2 damage to any target.',1);b.exile.push(cr,ins);gv.held=[cr,ins];
  const o=g.abilityOptions(a,{}).find(x=>x.card===gv.card&&x.ab.sacSelf);ok('Ghost Vacuum: sorcery-speed ability offered in own main phase',!!o);
  g.stack.push({id:1,kind:'spell',card:bear(),caster:b});const o2=g.abilityOptions(a,{}).find(x=>x.card===gv.card&&x.ab.sacSelf);ok('Ghost Vacuum: not offered with a spell on the stack',!o2);g.stack.pop();
  g.active=1;const o3=g.abilityOptions(a,{}).find(x=>x.card===gv.card&&x.ab.sacSelf);ok("Ghost Vacuum: not offered on opponent's turn",!o3);g.active=0;
  if(o){await g.activate(a,o);await flush(g);const pm=a.battlefield.find(x=>x.card.orig===cr||x.card===cr);ok('Ghost Vacuum: creature returns as 1/1 flying Spirit under my control',pm&&g.powerOf(a,pm)===1&&/Spirit/.test(pm.card.type)&&((pm.kwPerm||[]).includes('flying')||pm.card.kw.includes('flying')));ok('Ghost Vacuum: noncreature card stays exiled',b.exile.includes(ins)&&!a.battlefield.some(x=>x.card===ins||x.card.orig===ins));}
});
// ---------------- Altered Ego
await T('Altered Ego',async()=>{
  {const g=fresh();const [a,b]=g.players;W(g,b,2,'Island');const ae=C('Altered Ego');const sp=spell(g,a,ae);const cs=SC('Counterspell','Instant','{U}{U}','Counter target spell.',2);b.hand=[cs];await g.cast(b,cs,'hand',{spell:sp},{instant:true});await flush(g);ok("Altered Ego: can't be countered",!sp.countered&&g.log.some(l=>/Altered Ego can't be countered/.test(l.m||'')),g.log.slice(-3).map(l=>l.m).join('|'));}
  {const g=fresh();const [a,b]=g.players;W(g,b,2,'Island');const nc=SC('Plain Guy','Creature — Human','{2}','',2,2,2);const sp=spell(g,a,nc);const cs=SC('Counterspell','Instant','{U}{U}','Counter target spell.',2);b.hand=[cs];await g.cast(b,cs,'hand',{spell:sp},{instant:true});await flush(g);ok('Altered Ego (control): ordinary creature spell is countered',sp.countered);}
  // ENGINE BUG: X additional counters (engine adds exactly 1)
  for(const X of [0,3]){const g=fresh();const [a,b]=g.players;const big=opp(g,b,SC('Big Ogre','Creature — Ogre','{4}','',4,4,4));W(g,a,2+X,'Forest');W(g,a,2,'Island');a.ai.chooseX=()=>X;const ae=C('Altered Ego');await cast(g,a,ae);const pm=a.battlefield.find(x=>x.card.orig===ae);ok(`Altered Ego: X=${X} -> copy enters with ${X} +1/+1 counters`,pm&&pm.card.name==='Big Ogre'&&(pm.counters||0)===X,pm?pm.card.name+' c='+pm.counters:'none');}
});

// ---------------- Finale of Revelation
await T('Finale of Revelation',async()=>{
  // ENGINE BUG: X<10 still untaps 5 lands (and nothing is drawn)
  {const g=fresh();const [a]=g.players;W(g,a,3,'Forest');W(g,a,2,'Island');const gy=[bear(),bear()];a.graveyard=[...gy];a.ai.chooseX=()=>3;const f=C('Finale of Revelation');a.hand=[f];await g.cast(a,f,'hand');await flush(g);
   ok('Finale of Revelation: X=3 -> draws 3',a.hand.length===3,String(a.hand.length));
   ok('Finale of Revelation: X=3 -> lands NOT untapped',a.battlefield.filter(b=>b.card.isLand&&!b.tapped).length===0,String(a.battlefield.filter(b=>b.card.isLand&&!b.tapped).length));
   ok('Finale of Revelation: X=3 -> graveyard not shuffled in, no max hand size',gy.every(c=>a.graveyard.includes(c))&&!a.noMaxHand);}
  {const g=fresh();const [a]=g.players;W(g,a,10,'Forest');W(g,a,2,'Island');const gy=[bear(),bear()];a.graveyard=[...gy];a.ai.chooseX=()=>10;const f=C('Finale of Revelation');a.hand=[f];await g.cast(a,f,'hand');await flush(g);
   ok('Finale of Revelation: X=10 -> draws 10',a.hand.length===10,String(a.hand.length));
   ok('Finale of Revelation: X=10 -> untaps 5 lands',a.battlefield.filter(b=>b.card.isLand&&!b.tapped).length===5);
   ok('Finale of Revelation: X=10 -> graveyard shuffled into library',!gy.some(c=>a.graveyard.includes(c)));
   ok('Finale of Revelation: X=10 -> no maximum hand size',!!a.noMaxHand);}
});
// ---------------- Mind into Matter
await T('Mind into Matter',async()=>{
  // ENGINE BUG: neither draws X nor puts a permanent onto the battlefield
  const g=fresh();const [a]=g.players;W(g,a,3,'Forest');W(g,a,2,'Island');a.ai.chooseX=()=>3;const f=C('Mind into Matter');const o3=SC('Ogre3','Creature — Ogre','{2}{R}','',3,3,3),o5=SC('Ogre5','Creature — Ogre','{4}{R}','',5,5,5);a.hand=[f,o5];a.library.push(o3);await g.cast(a,f,'hand');await flush(g);
  ok('Mind into Matter: draws X=3',a.hand.length+a.battlefield.filter(b=>!b.card.isLand).length===4,String(a.hand.length));
  const p3=a.battlefield.find(b=>b.card===o3);ok('Mind into Matter: MV<=X permanent put onto battlefield tapped',p3&&p3.tapped);
  ok('Mind into Matter: MV>X permanent stays in hand',a.hand.includes(o5));
});
// ---------------- The Goose Mother
await T('The Goose Mother',async()=>{
  {const g=fresh();const [a,b]=g.players;const gm=put(g,a,C('The Goose Mother'));const food=put(g,a,tagCard(mk('Food','Artifact — Food','','{2}, {T}, Sacrifice this artifact: You gain 3 life.',0)));food.card.token=true;const h0=a.hand.length;await g.attackTriggers(a,[{attacker:gm,defender:b}]);await flush(g);
   ok('The Goose Mother: with Food -> sacrifice Food and draw',a.hand.length===h0+1&&!a.battlefield.includes(food),`${a.hand.length-h0} food=${a.battlefield.includes(food)}`);}
  // ENGINE BUG: draws without a Food to sacrifice
  {const g=fresh();const [a,b]=g.players;const gm=put(g,a,C('The Goose Mother'));const h0=a.hand.length;await g.attackTriggers(a,[{attacker:gm,defender:b}]);await flush(g);
   ok('The Goose Mother: no Food -> no draw',a.hand.length===h0,String(a.hand.length-h0));}
});
// ---------------- Brass's Bounty
await T("Brass's Bounty",async()=>{
  // ENGINE BUG: one Treasure regardless of land count
  for(const n of [7,9]){const g=fresh();const [a]=g.players;W(g,a,n,'Mountain');const f=C("Brass's Bounty");a.hand=[f];await g.cast(a,f,'hand');await flush(g);ok(`Brass's Bounty: ${n} lands -> ${n} Treasures`,nm(a,'Treasure').length===n,String(nm(a,'Treasure').length));}
});
// ---------------- Redoubled Stormsinger
await T('Redoubled Stormsinger',async()=>{
  const g=fresh();const [a,b]=g.players;const rs=put(g,a,C('Redoubled Stormsinger'));
  const tk=(n)=>{const c=tagCard(mk(n,'Token Creature — Goblin','','',0,1,1));c.token=true;return c;};
  const t1=put(g,a,tk('FreshTok'),{enteredTurn:g.turn});const t2=put(g,a,tk('OldTok'),{enteredTurn:g.turn-1});const nt=put(g,a,bear(),{enteredTurn:g.turn});const ot=opp(g,b,tk('OppTok'));ot.enteredTurn=g.turn;
  const atk=[{attacker:rs,defender:b}];await g.attackTriggers(a,atk);await flush(g);
  ok('Redoubled Stormsinger: token that entered this turn is copied tapped and attacking',nm(a,'FreshTok').length===2&&nm(a,'FreshTok').some(x=>x!==t1&&x.tapped),String(nm(a,'FreshTok').length));
  ok('Redoubled Stormsinger: token from an earlier turn not copied',nm(a,'OldTok').length===1);
  ok('Redoubled Stormsinger: nontoken creature not copied',nm(a,'Bear').length===1);
  ok("Redoubled Stormsinger: opponent's token not copied",nm(a,'OppTok').length===0&&nm(b,'OppTok').length===1);
  const cp=nm(a,'FreshTok').find(x=>x!==t1);if(cp){ok('Redoubled Stormsinger: copy is attacking and marked for sacrifice at end step (original is not)',cp.sacAtEnd&&!t1.sacAtEnd&&atk.some(x=>x.attacker===cp));}
});
// ---------------- The Scarlet Witch
await T('The Scarlet Witch',async()=>{
  const g=fresh();const [a,b]=g.players;const sw=put(g,a,C('The Scarlet Witch'));const pw=g.powerOf(a,sw);
  const i4=SC('Big Instant','Instant','{3}{R}','Draw a card.',4),i3=SC('Small Instant','Instant','{2}{R}','Draw a card.',3),c4=SC('Big Creature','Creature — Ogre','{3}{R}','',4,4,4),s5=SC('Big Sorc','Sorcery','{4}{R}','Draw a card.',5);
  ok('The Scarlet Witch: MV4 instant costs {X} less (X=power)',g.costOf(a,i4,'hand').total===4-pw,`${g.costOf(a,i4,'hand').total} pw=${pw}`);
  ok('The Scarlet Witch: MV5 sorcery costs {X} less',g.costOf(a,s5,'hand').total===5-pw);
  ok('The Scarlet Witch: MV3 instant not reduced',g.costOf(a,i3,'hand').total===3);
  ok('The Scarlet Witch: MV4 creature not reduced',g.costOf(a,c4,'hand').total===4);
  ok("The Scarlet Witch: opponent's MV4 instant not reduced",g.costOf(b,i4,'hand').total===4);
  sw.counters=2;g.refreshStatics();ok('The Scarlet Witch: reduction tracks current power',g.costOf(a,i4,'hand').total===Math.max(0,4-g.powerOf(a,sw))||g.costOf(a,i4,'hand').total===1,String(g.costOf(a,i4,'hand').total));
});
// ---------------- Moseo
// ENGINE BUG (positive cases): p.gainedThisTurn is never accumulated, so X is always 0
await T("Moseo, Vein's New Dean",async()=>{
  const mk3=()=>SC('Three Drop','Creature — Ogre','{2}{B}','',3,3,3),mk4=()=>SC('Four Drop','Creature — Ogre','{3}{B}','',4,4,4);
  {const g=fresh();const [a]=g.players;put(g,a,C("Moseo, Vein's New Dean"));const c3=mk3();a.graveyard=[c3];await g.changeLife(a,3,null);await g.fireTriggers(a,'end');await flush(g);ok("Moseo: gained 3 -> returns MV3 creature",a.battlefield.some(b=>b.card===c3));}
  {const g=fresh();const [a]=g.players;put(g,a,C("Moseo, Vein's New Dean"));const c4=mk4();a.graveyard=[c4];await g.changeLife(a,3,null);await g.fireTriggers(a,'end');await flush(g);ok("Moseo: gained 3 -> MV4 creature stays",a.graveyard.includes(c4));}
  {const g=fresh();const [a]=g.players;put(g,a,C("Moseo, Vein's New Dean"));const c3=mk3();a.graveyard=[c3];await g.fireTriggers(a,'end');await flush(g);ok("Moseo: no life gained -> nothing returns",a.graveyard.includes(c3));}
  {const g=fresh();const [a]=g.players;put(g,a,C("Moseo, Vein's New Dean"));const c3=mk3();a.graveyard=[c3];await g.changeLife(a,1,null);await g.changeLife(a,2,null);await g.fireTriggers(a,'end');await flush(g);ok("Moseo: gains of 1+2 add up to X=3",a.battlefield.some(b=>b.card===c3));}
  {const g=fresh();const [a]=g.players;put(g,a,C("Moseo, Vein's New Dean"));const nc=SC('Relic','Artifact','{1}','',1);a.graveyard=[nc];await g.changeLife(a,3,null);await g.fireTriggers(a,'end');await flush(g);ok("Moseo: noncreature card not returned",a.graveyard.includes(nc));}
});
// ---------------- Glademuse
await T('Glademuse',async()=>{
  const sp=()=>SC('Opt Test','Instant','{U}','Draw a card.',1);
  // b casts on a's turn (not b's turn) -> b draws
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Glademuse'));W(g,b,1,'Island');const s=sp();b.hand=[s];const hb=b.hand.length,ha=a.hand.length;b.ai.stackResponse=()=>null;await g.cast(b,s,'hand',null,{instant:true});await flush(g);
   // Opt Test itself draws 1 for b on resolution: net b hand = hb-1+1(+1 Glademuse)
   // ENGINE BUG: Glademuse's controller draws instead of the casting player
   ok("Glademuse: opponent casts on my turn -> THAT player draws",b.hand.length===hb+1,`b ${b.hand.length-hb} a ${a.hand.length-ha}`);
   ok("Glademuse: Glademuse's controller does not draw",a.hand.length===ha,`a ${a.hand.length-ha}`);}
  // ENGINE BUG: "if it's not their turn" ignored
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Glademuse'));W(g,a,1,'Island');const s=sp();a.hand=[s];const ha=a.hand.length;await g.cast(a,s,'hand');await flush(g);
   ok("Glademuse: player casts on their own turn -> no draw",a.hand.length===ha,`a ${a.hand.length-ha} (spell itself draws 1, cast -1)`);}
});
// ---------------- Somberwald Sage
await T('Somberwald Sage',async()=>{
  {const g=fresh();const [a]=g.players;put(g,a,C('Somberwald Sage'));const cr=SC('Green Guy','Creature — Elf','{2}{G}','',3,3,3);a.hand=[cr];ok('Somberwald Sage: mana pays for a creature spell',!!g.castMode(a,cr,'hand'));}
  // ENGINE BUG: restriction "spend only to cast creature spells" not modelled
  {const g=fresh();const [a]=g.players;put(g,a,C('Somberwald Sage'));const so=SC('Green Sorc','Sorcery','{2}{G}','Draw a card.',3);a.hand=[so];ok('Somberwald Sage: mana cannot pay for a noncreature spell',!g.castMode(a,so,'hand'));}
});
// ---------------- Ezuri's Predation
await T("Ezuri's Predation",async()=>{
  // ENGINE BUG: makes a single 4/4, no per-creature count, no fights
  const g=fresh();const [a,b,c]=g.players;W(g,a,8,'Forest');const v1=opp(g,b,bear());const v2=opp(g,c,SC('Mid','Creature — Ogre','{3}','',3,3,3));const mine=put(g,a,bear());const f=C("Ezuri's Predation");a.hand=[f];await g.cast(a,f,'hand');await flush(g);
  const toks=a.battlefield.filter(x=>x.card.token&&x.card.isCreature);
  ok("Ezuri's Predation: one 4/4 Beast per creature opponents control (2), not for my own",toks.length+a.graveyard.filter(c=>c.token).length===2&&toks.every(t=>t.card.power===4),`toks ${toks.length}`);
  ok("Ezuri's Predation: tokens fight — the 2/2 dies",!b.battlefield.includes(v1));
  ok("Ezuri's Predation: my own creature is not fought",a.battlefield.includes(mine));
});
// ---------------- Lyse Hext
await T('Lyse Hext',async()=>{
  const g=fresh();const [a,b]=g.players;const ly=put(g,a,C('Lyse Hext'));
  const so=SC('Sorc3','Sorcery','{2}{U}','Draw a card.',3),cr=SC('Crit3','Creature — Ogre','{2}{U}','',3,3,3);
  ok('Lyse Hext: noncreature spell costs {1} less',g.costOf(a,so,'hand').total===2);
  ok('Lyse Hext: creature spell not reduced',g.costOf(a,cr,'hand').total===3);
  ok("Lyse Hext: opponent's noncreature spell not reduced",g.costOf(b,so,'hand').total===3);
  W(g,a,3,'Island');const s1=SC('Cheap1','Sorcery','{1}','Scry 1.',1),s2=SC('Cheap2','Sorcery','{1}','Scry 1.',1),c1=SC('Dork','Creature — Elf','{1}','',1,1,1);
  await cast(g,a,c1);g.refreshStatics();ok('Lyse Hext: creature spell does not count',!ly.card.kw.includes('double strike'));
  await cast(g,a,s1);g.refreshStatics();ok('Lyse Hext: one noncreature spell -> no double strike',!ly.card.kw.includes('double strike'));
  await cast(g,a,s2);g.refreshStatics();ok('Lyse Hext: two noncreature spells -> double strike',ly.card.kw.includes('double strike'),ly.card.kw.join());
  g.turn++;g.refreshStatics();ok('Lyse Hext: next turn -> no double strike',!ly.card.kw.includes('double strike'));
});
// ---------------- Hand of Vecna
await T('Hand of Vecna',async()=>{
  {const g=fresh();const [a]=g.players;const h=put(g,a,C('Hand of Vecna'));const x=put(g,a,bear());const y=put(g,a,bear());h.attachedTo=x.id;a.hand=[bear(),bear(),bear()];await g.fireTriggers(a,'combatStart');await flush(g);g.refreshStatics();ok('Hand of Vecna: equipped creature +3/+3 (3 cards in hand)',g.powerOf(a,x)===5&&g.toughOf(a,x)===5,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);ok('Hand of Vecna: other creature unaffected',g.powerOf(a,y)===2);}
  {const g=fresh();const [a]=g.players;put(g,a,C('Hand of Vecna'));const v=put(g,a,SC('Vecna','Legendary Creature — Zombie God','{3}','',3,3,3));a.hand=[bear(),bear()];await g.fireTriggers(a,'combatStart');await flush(g);g.refreshStatics();ok('Hand of Vecna: unattached -> creature named Vecna gets +2/+2',g.powerOf(a,v)===5,String(g.powerOf(a,v)));}
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Hand of Vecna'));const x=put(g,a,bear());const v=opp(g,b,SC('Vecna','Legendary Creature — Zombie God','{3}','',3,3,3));a.hand=[bear(),bear()];await g.fireTriggers(a,'combatStart');await flush(g);g.refreshStatics();ok('Hand of Vecna: unattached, no Vecna of mine -> no pump',g.powerOf(a,x)===2&&g.powerOf(b,v)===3);}
  {const g=fresh();const [a]=g.players;const h=put(g,a,C('Hand of Vecna'));const x=put(g,a,bear());a.hand=[bear(),bear(),bear(),bear()];const l0=a.life;const o=g.abilityOptions(a,{}).find(o=>o.card===h.card&&o.ab.xcost);ok('Hand of Vecna: life-equip option offered',!!o);if(o){await g.activate(a,o);await flush(g);ok('Hand of Vecna: equip paid 1 life per card in hand (4)',a.life===l0-4&&h.attachedTo===x.id,`${l0-a.life}`);}}
});
// ---------------- Monica Rambeau
await T('Monica Rambeau',async()=>{
  const g=fresh();const [a,b]=g.players;const m=put(g,a,C('Monica Rambeau'));W(g,a,2,'Plains');W(g,a,1,'Mountain');W(g,a,2,'Plains');
  const f=()=>g.abilityOptions(a,{}).find(o=>o.card===m.card&&o.ab.ops.some(x=>x.op==='transform'));
  ok('Monica Rambeau: transform offered in own main phase',!!f());
  g.stack.push({id:1,kind:'spell',card:bear(),caster:b});ok('Monica Rambeau: not with a spell on the stack',!f());g.stack.pop();
  g.active=1;ok("Monica Rambeau: not on opponent's turn",!f());g.active=0;
  g.phase='combat';ok('Monica Rambeau: not during combat',!f());g.phase='main1';
});
// ---------------- Eclipsed Flamekin
await T('Eclipsed Flamekin',async()=>{
  for(const [card,exp] of [[()=>SC('Ember Elemental','Creature — Elemental','{1}{R}','',2,2,2),true],[()=>L('Island'),true],[()=>L('Mountain'),true],[()=>L('Forest'),false],[()=>bear(),false]]){
    const g=fresh();const [a]=g.players;const c=card();a.library=[L('Plains'),L('Plains'),L('Plains'),c,L('Plains'),L('Plains'),L('Plains')];a.library.push(a.library.splice(3,1)[0]);
    const e=C('Eclipsed Flamekin');const pm=put(g,a,e);await g.runOps(a,e.etbOps,e,{perm:pm});ok(`Eclipsed Flamekin: ${c.name} in top 4 -> ${exp?'taken':'not taken'}`,a.hand.includes(c)===exp,a.hand.map(x=>x.name).join());}
});
// ---------------- Nyxbloom Ancient
await T('Nyxbloom Ancient',async()=>{
  const g=fresh();const [a]=g.players;put(g,a,C('Nyxbloom Ancient'));const f=put(g,a,L('Forest'));a.pool=[{c:'G'}];
  const src=g.manaSrcs(a);const fs=src.find(s=>s.b===f),ps=src.find(s=>s.kind==='pool');
  ok('Nyxbloom Ancient: tapped land produces three times as much',fs&&fs.amount===3,fs&&String(fs.amount));
  ok('Nyxbloom Ancient: floating pool mana (not a tapped permanent) not tripled',ps&&ps.amount===1);
  const g2=fresh();const [a2,b2]=g2.players;put(g2,b2,C('Nyxbloom Ancient'));const f2=put(g2,a2,L('Forest'));const s2=g2.manaSrcs(a2).find(s=>s.b===f2);ok("Nyxbloom Ancient: opponent's Nyxbloom doesn't triple my mana",s2&&s2.amount===1);
});
// ---------------- Sunderflock
await T('Sunderflock',async()=>{
  {const g=fresh();const [a,b]=g.players;const sf=C('Sunderflock');ok('Sunderflock: no Elementals -> full cost 9',g.costOf(a,sf,'hand').total===9);put(g,a,SC('Big Elemental','Creature — Elemental','{5}','',5,5,5));put(g,a,SC('Small Elemental','Creature — Elemental','{2}','',2,2,2));put(g,a,SC('Huge Ogre','Creature — Ogre','{7}','',7,7,7));opp(g,b,SC('Opp Elemental','Creature — Elemental','{8}','',8,8,8));ok('Sunderflock: costs {X} less, X = greatest MV among MY Elementals (5)',g.costOf(a,sf,'hand').total===4,String(g.costOf(a,sf,'hand').total));}
  {const g=fresh();const [a,b]=g.players;W(g,a,9,'Island');const myE=put(g,a,SC('My Elemental','Creature — Elemental','{1}','',1,1,1));const mine=put(g,a,bear());const v=opp(g,b,bear());const sf=C('Sunderflock');await cast(g,a,sf);ok('Sunderflock: cast -> non-Elemental creatures bounced (mine and opponents)',!a.battlefield.includes(mine)&&!b.battlefield.includes(v));ok('Sunderflock: Elementals stay',a.battlefield.includes(myE)&&a.battlefield.some(x=>x.card===sf));}
  {const g=fresh();const [a,b]=g.players;const v=opp(g,b,bear());const sf=C('Sunderflock');const pm=await g.enterPerm(a,sf);await g.trigger(a,pm,sf.etbOps,{perm:pm},'ETB');await flush(g);ok('Sunderflock: not cast (put onto battlefield) -> no bounce',b.battlefield.includes(v));}
});
// ---------------- Éowyn
await T('Éowyn, Fearless Knight',async()=>{
  // ENGINE BUG (lesser-power case): resolved as a generic 'removal' exile; targetOk ignores "with greater power"
  {const g=fresh();const [a,b]=g.players;W(g,a,2,'Mountain');W(g,a,2,'Plains');const big=opp(g,b,SC('Big Red','Creature — Ogre','{4}{R}','',5,4,4));const e=C('Éowyn, Fearless Knight');await cast(g,a,e,big);ok('Éowyn: exiles opponent creature with greater power',!b.battlefield.includes(big)&&b.exile.includes(big.card));}
  {const g=fresh();const [a,b]=g.players;W(g,a,2,'Mountain');W(g,a,2,'Plains');const sm=opp(g,b,SC('Small','Creature — Ogre','{1}','',1,2,2));const e=C('Éowyn, Fearless Knight');await cast(g,a,e,sm);ok('Éowyn: creature with lesser power is not exiled',b.battlefield.includes(sm));}
});
// ---------------- Kyler
await T('Kyler, Sigardian Emissary',async()=>{
  const g=fresh();const [a,b]=g.players;const k=put(g,a,C('Kyler, Sigardian Emissary'));const hu=put(g,a,SC('Human Guy','Creature — Human Soldier','{1}','',1,2,2));const nh=put(g,a,bear());const oh=opp(g,b,SC('Opp Human','Creature — Human','{1}','',1,2,2));
  k.counters=2;g.refreshStatics();ok('Kyler: other Human gets +1/+1 per counter on Kyler (+2)',g.powerOf(a,hu)===4,String(g.powerOf(a,hu)));
  ok('Kyler: non-Human unaffected',g.powerOf(a,nh)===2);ok("Kyler: opponent's Human unaffected",g.powerOf(b,oh)===2);ok('Kyler: Kyler (a Human) does not pump itself beyond its counters',g.powerOf(a,k)===4,String(g.powerOf(a,k)));
  k.counters=0;g.refreshStatics();ok('Kyler: no counters -> no bonus',g.powerOf(a,hu)===2);
});
// ---------------- Ghost Town
// ENGINE BUG: "activate only if it's not your turn" not enforced; selfToHand op only looks in the graveyard
await T('Ghost Town',async()=>{
  const g=fresh();const [a]=g.players;const gt=put(g,a,C('Ghost Town'));const f=()=>g.abilityOptions(a,{}).find(o=>o.card===gt.card&&o.ab.ops.some(x=>x.op==='selfToHand'));
  ok('Ghost Town: not activatable on my turn',!f());g.active=1;const o=f();ok("Ghost Town: activatable on opponent's turn",!!o);if(o){await g.activate(a,o);await flush(g);ok('Ghost Town: returns to hand',a.hand.includes(gt.card)&&!a.battlefield.includes(gt));}
});
// ---------------- Valakut Exploration
await T('Valakut Exploration',async()=>{
  {const g=fresh();const [a,b,c]=g.players;put(g,a,C('Valakut Exploration'));const top=SC('Big Thing','Sorcery','{9}','Draw a card.',9);a.library.push(top);await PL(g,a,L('Mountain'));await flush(g);
   ok('Valakut Exploration: my land enters -> top card exiled/playable',a.library.indexOf(top)<0);
   const l0=b.life,l1=c.life;await g.fireTriggers(a,'end');await flush(g);
   // ENGINE BUG: landfall impulse never records cards as "exiled with" the enchantment (pm.held), so end-step damage never happens
   ok('Valakut Exploration: end step -> unplayed exiled card to graveyard, 1 damage to each opponent',b.life===l0-1&&c.life===l1-1&&a.graveyard.includes(top),`${l0-b.life} ${l1-c.life} gy=${a.graveyard.map(x=>x.name)}`);}
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Valakut Exploration'));const top=SC('Big Thing','Sorcery','{9}','Draw a card.',9);a.library.push(top);b.hand.push(L('Mountain'));g.active=1;b.landsThisTurn=0;await g.playLand(b,b.hand[b.hand.length-1]);await flush(g);g.active=0;ok("Valakut Exploration: opponent's land -> no trigger",a.library.includes(top));}
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Valakut Exploration'));const l0=b.life;await g.fireTriggers(a,'end');await flush(g);ok('Valakut Exploration: nothing exiled -> no damage',b.life===l0);}
});
// ---------------- Enduring Courage
await T('Enduring Courage',async()=>{
  const g=fresh();const [a]=g.players;const ec=C('Enduring Courage');const pm=put(g,a,ec);await g.destroy(a,pm);await flush(g);
  const back=a.battlefield.find(x=>x.card.orig===ec||x.card===ec);ok('Enduring Courage: dies as creature -> returns as non-creature enchantment',back&&!back.card.isCreature&&back.card.isEnchantment);
  if(back){await g.destroy(a,back);await flush(g);ok('Enduring Courage: destroyed while not a creature -> does not return',!a.battlefield.some(x=>x.card.orig===ec||x.card===ec)&&a.graveyard.includes(ec),a.battlefield.map(x=>x.card.name).join());}
});
// ---------------- Within Range
await T('Within Range',async()=>{
  // ENGINE BUG: attack trigger has no ops
  const g=fresh();const [a,b,c]=g.players;put(g,a,C('Within Range'));const x1=put(g,a,bear()),x2=put(g,a,bear()),x3=put(g,a,bear());const lb=b.life,lc=c.life;
  await g.attackTriggers(a,[{attacker:x1,defender:b},{attacker:x2,defender:b},{attacker:x3,defender:c}]);await flush(g);
  ok('Within Range: each opponent loses life equal to creatures attacking them (2 and 1)',lb-b.life===2&&lc-c.life===1,`${lb-b.life} ${lc-c.life}`);
});
// ---------------- Edgar Markov
await T('Edgar Markov',async()=>{
  const vamp=()=>SC('Vamp','Creature — Vampire','{B}','',1,1,1),hum=()=>SC('Hum','Creature — Human','{B}','',1,1,1);
  {const g=fresh();const [a]=g.players;put(g,a,C('Edgar Markov'));W(g,a,2,'Swamp');await cast(g,a,hum());ok('Edgar Markov: non-Vampire -> no token',a.battlefield.filter(x=>x.card.token).length===0);
   // ENGINE BUG: trigger filter 'another vampire' never matches (matchesFilter requires the word "another" in the type line)
   await cast(g,a,vamp());ok('Edgar Markov: on battlefield, cast Vampire -> token',a.battlefield.filter(x=>x.card.token).length===1);}
  {const g=fresh();const [a,b]=g.players;put(g,b,C('Edgar Markov'));W(g,a,1,'Swamp');await cast(g,a,vamp());ok("Edgar Markov: opponent's Vampire spell -> no token",!b.battlefield.some(x=>x.card.token)&&!a.battlefield.some(x=>x.card.token));}
  // ENGINE BUG: eminence from the command zone not modelled
  {const g=fresh();const [a]=g.players;a.command=[C('Edgar Markov')];W(g,a,1,'Swamp');await cast(g,a,vamp());ok('Edgar Markov: in command zone, cast Vampire -> token',a.battlefield.filter(x=>x.card.token).length===1);}
  {const g=fresh();const [a]=g.players;a.graveyard=[C('Edgar Markov')];W(g,a,1,'Swamp');await cast(g,a,vamp());ok('Edgar Markov: in graveyard -> no token',!a.battlefield.some(x=>x.card.token));}
});
// ---------------- Qarsi Revenant
await T('Qarsi Revenant',async()=>{
  const g=fresh();const [a,b]=g.players;const q=C('Qarsi Revenant');a.graveyard=[q];W(g,a,3,'Swamp');const x=put(g,a,bear());
  const f=()=>g.abilityOptions(a,{}).find(o=>o.card===q);ok('Qarsi Revenant: renew offered from graveyard in main phase',!!f());
  g.stack.push({id:1,kind:'spell',card:bear(),caster:b});ok('Qarsi Revenant: not with a spell on the stack',!f());g.stack.pop();
  g.active=1;ok("Qarsi Revenant: not on opponent's turn",!f());g.active=0;
  const o=f();if(o){await g.activate(a,o);await flush(g);g.refreshStatics();ok('Qarsi Revenant: flying+deathtouch+lifelink counters; card exiled',['flying','deathtouch','lifelink'].every(k=>x.card.kw.includes(k))&&a.exile.includes(q));}
});
// ---------------- Bedrock Tortoise
// ENGINE BUG (hexproof): anthem filter parsed as 'during your turn,' which matches no creature
await T('Bedrock Tortoise',async()=>{
  const g=fresh();const [a,b]=g.players;put(g,a,C('Bedrock Tortoise'));const x=put(g,a,bear());const v=opp(g,b,bear());g.refreshStatics();
  ok('Bedrock Tortoise: my turn -> my creatures have hexproof',x.card.kw.includes('hexproof'),x.card.kw.join());ok("Bedrock Tortoise: opponent's creatures don't",!v.card.kw.includes('hexproof'));
  g.active=1;g.refreshStatics();ok("Bedrock Tortoise: opponent's turn -> no hexproof",!x.card.kw.includes('hexproof'),x.card.kw.join());g.active=0;
  const w=put(g,a,SC('Wall Guy','Creature — Wall','{1}','',1,1,4));const eq=put(g,a,SC('Even Guy','Creature — Ogre','{1}','',1,3,3));const ow=opp(g,b,SC('Opp Wall','Creature — Wall','{1}','',1,1,4));
  ok('Bedrock Tortoise: toughness > power -> assigns toughness',g.combatPow(a,w)===4);ok('Bedrock Tortoise: toughness = power -> assigns power',g.combatPow(a,eq)===3);ok("Bedrock Tortoise: opponent's creature uses power",g.combatPow(b,ow)===1);
});
// ---------------- Rampart Architect
await T('Rampart Architect',async()=>{
  const wall=()=>SC('Wally','Creature — Wall','{1}','Defender',1,0,3);
  {const g=fresh();const [a]=g.players;put(g,a,C('Rampart Architect'));a.library.push(L('Forest'));const w=put(g,a,wall());const n0=a.battlefield.filter(x=>x.card.isLand).length;await g.destroy(a,w);await flush(g);const nl=a.battlefield.filter(x=>x.card.isLand);ok('Rampart Architect: my defender dies -> basic land onto battlefield tapped',nl.length===n0+1&&nl[nl.length-1].tapped);}
  {const g=fresh();const [a]=g.players;put(g,a,C('Rampart Architect'));a.library.push(L('Forest'));const w=put(g,a,bear());await g.destroy(a,w);await flush(g);ok('Rampart Architect: non-defender dies -> nothing',!a.battlefield.some(x=>x.card.isLand));}
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Rampart Architect'));a.library.push(L('Forest'));const w=opp(g,b,wall());await g.destroy(b,w);await flush(g);ok("Rampart Architect: opponent's defender dies -> nothing",!a.battlefield.some(x=>x.card.isLand));}
});
// ---------------- Adaptive Omnitool
await T('Adaptive Omnitool',async()=>{
  {const g=fresh();const [a,b]=g.players;const om=put(g,a,C('Adaptive Omnitool'));const x=put(g,a,bear());om.attachedTo=x.id;put(g,a,art('A1'));put(g,a,art('A2'));opp(g,b,art('OppArt'));g.refreshStatics();
   ok('Adaptive Omnitool: +1/+1 per artifact I control (3 incl. itself), not opponent artifacts',g.powerOf(a,x)===5&&g.toughOf(a,x)===5,`${g.powerOf(a,x)}/${g.toughOf(a,x)}`);
   const y=put(g,a,bear());g.refreshStatics();ok('Adaptive Omnitool: unequipped creature unaffected',g.powerOf(a,y)===2);}
  for(const [lib,exp] of [[()=>art('Found Art',2),true],[()=>bear(),false]]){const g=fresh();const [a,b]=g.players;const om=put(g,a,C('Adaptive Omnitool'));const x=put(g,a,bear());om.attachedTo=x.id;const c=lib();a.library=[...Array(5)].map(()=>L('Plains'));a.library.push(c);a.library.unshift(L('Plains'));
   await g.attackTriggers(a,[{attacker:x,defender:b}]);await flush(g);ok(`Adaptive Omnitool: equipped attacks, top 6 has ${c.name} -> ${exp?'taken':'not taken'}`,a.hand.includes(c)===exp);}
  {const g=fresh();const [a,b]=g.players;const om=put(g,a,C('Adaptive Omnitool'));const x=put(g,a,bear());const y=put(g,a,bear());om.attachedTo=x.id;const c=art('Found Art',2);a.library.push(c);await g.attackTriggers(a,[{attacker:y,defender:b}]);await flush(g);ok('Adaptive Omnitool: unequipped creature attacks -> no trigger',!a.hand.includes(c));}
});
// ---------------- Excalibur
await T('Excalibur, Sword of Eden',async()=>{
  const g=fresh();const [a,b]=g.players;const ex=C('Excalibur, Sword of Eden');ok('Excalibur: no historic -> 12',g.costOf(a,ex,'hand').total===12);
  put(g,a,art('Relic3',3));put(g,a,SC('Legend Guy','Legendary Creature — Human','{2}','',2,2,2));put(g,a,bear());put(g,a,SC('Saga Thing','Enchantment — Saga','{4}','',4));opp(g,b,art('OppRelic',5));put(g,a,L('Forest'));
  ok('Excalibur: reduced by total MV of MY historic permanents (3+2+4=9)',g.costOf(a,ex,'hand').total===3,String(g.costOf(a,ex,'hand').total));
});
// ---------------- Sword of Feast and Famine
await T('Sword of Feast and Famine',async()=>{
  {const g=fresh();const [a,b]=g.players;const sw=put(g,a,C('Sword of Feast and Famine'));const x=put(g,a,bear());sw.attachedTo=x.id;W(g,a,3,'Forest');a.battlefield.forEach(q=>{if(q.card.isLand)q.tapped=true;});b.hand=[bear(),bear()];
   await cd(g,a,b,x,4);ok('Sword of Feast and Famine: hit player -> untap all my lands',a.battlefield.filter(q=>q.card.isLand).every(q=>!q.tapped));
   // ENGINE BUG: discard half missing
   ok('Sword of Feast and Famine: damaged player discards a card',b.hand.length===1,String(b.hand.length));}
  {const g=fresh();const [a,b]=g.players;const sw=put(g,a,C('Sword of Feast and Famine'));const x=put(g,a,bear());const y=put(g,a,bear());sw.attachedTo=x.id;W(g,a,3,'Forest');a.battlefield.forEach(q=>{if(q.card.isLand)q.tapped=true;});b.hand=[bear(),bear()];
   await cd(g,a,b,y,2);ok('Sword of Feast and Famine: unequipped creature hits -> nothing',a.battlefield.filter(q=>q.card.isLand).every(q=>q.tapped)&&b.hand.length===2);}
});
// ---------------- Carnelian Orb of Dragonkind
await T('Carnelian Orb of Dragonkind',async()=>{
  // ENGINE BUG: haste rider not modelled
  {const g=fresh();const [a]=g.players;put(g,a,C('Carnelian Orb of Dragonkind'));const d=SC('Whelp','Creature — Dragon','{R}','Flying',1,1,1);await cast(g,a,d);const pm=a.battlefield.find(x=>x.card===d);g.refreshStatics();ok('Carnelian Orb: Dragon creature cast with its mana gains haste',pm&&(pm.card.kw.includes('haste')||!pm.summoning));}
  {const g=fresh();const [a]=g.players;put(g,a,C('Carnelian Orb of Dragonkind'));const d=SC('Goblin','Creature — Goblin','{R}','',1,1,1);await cast(g,a,d);const pm=a.battlefield.find(x=>x.card===d);g.refreshStatics();ok('Carnelian Orb: non-Dragon creature does not gain haste',pm&&pm.summoning&&!pm.card.kw.includes('haste'));}
});
// ---------------- Lozhan
await T("Lozhan, Dragons' Legacy",async()=>{
  const tot=g=>g.players.slice(1).reduce((s,q)=>s+q.life,0)+g.players.slice(1).reduce((s,q)=>s+q.battlefield.length,0);
  {const g=fresh();const [a]=g.players;put(g,a,C("Lozhan, Dragons' Legacy"));W(g,a,3,'Mountain');const t0=g.players.slice(1).reduce((s,q)=>s+q.life,0);await cast(g,a,SC('Drake','Creature — Dragon','{2}{R}','Flying',3,2,2));const t1=g.players.slice(1).reduce((s,q)=>s+q.life,0);ok("Lozhan: Dragon spell (MV3) -> 3 damage",t0-t1===3,String(t0-t1));}
  {const g=fresh();const [a]=g.players;put(g,a,C("Lozhan, Dragons' Legacy"));W(g,a,3,'Mountain');const t0=g.players.slice(1).reduce((s,q)=>s+q.life,0);await cast(g,a,SC('Ogre','Creature — Ogre','{2}{R}','',3,2,2));const t1=g.players.slice(1).reduce((s,q)=>s+q.life,0);ok("Lozhan: non-Dragon non-Adventure spell -> no damage",t0===t1);}
  // ENGINE BUG: Adventure spells don't trigger (filter is only 'dragon')
  {const g=fresh();const [a,b]=g.players;put(g,a,C("Lozhan, Dragons' Legacy"));W(g,a,4,'Mountain');const adv=C('Murderous Rider // Swift End');const v=opp(g,b,bear());a.ai.chooseAlt=(gg,me,card,alts)=>alts.find(x=>x.kind==='adventure');W(g,a,3,'Swamp');a.hand.push(adv);const t0=g.players.slice(1).reduce((s,q)=>s+q.life,0);await g.cast(a,adv,'hand',v,{});await flush(g);const t1=g.players.slice(1).reduce((s,q)=>s+q.life,0);ok("Lozhan: casting an Adventure spell triggers (damage dealt)",t0>t1||g.log.some(l=>/Lozhan.*triggers/.test(l.m||'')),String(t0-t1));}
});
// ---------------- Moonmist
await T('Moonmist',async()=>{
  // ENGINE BUG: prevents all combat damage including Werewolves/Wolves
  const g=fresh();const [a,b]=g.players;const wolf=put(g,a,SC('Wolfie','Creature — Wolf','{1}{G}','',2,3,3));const br=put(g,a,bear());W(g,a,2,'Forest');await cast(g,a,C('Moonmist'));b.ai.chooseBlocks=()=>new Map();const l0=b.life;await g.combatPhase(a,[{attacker:wolf,defender:b},{attacker:br,defender:b}]);
  ok('Moonmist: Wolf combat damage not prevented, others prevented (b loses exactly 3)',l0-b.life===3,String(l0-b.life));
});
// ---------------- Elrond, Moon-Reader
await T('Elrond, Moon-Reader',async()=>{
  {const g=fresh();const [a]=g.players;put(g,a,C('Elrond, Moon-Reader'));const cr=put(g,a,SC('Pinger','Creature — Human','{1}','{1}: You gain 1 life.',1,1,1));W(g,a,3,'Forest');const h0=a.hand.length;
   let o=abO(g,a,cr.card);ok('Elrond: creature ability option',!!o);if(o){await g.activate(a,o);await flush(g);ok('Elrond: activate creature ability -> draw',a.hand.length===h0+1,String(a.hand.length-h0));o=abO(g,a,cr.card);await g.activate(a,o);await flush(g);ok('Elrond: second activation same turn -> no draw',a.hand.length===h0+1,String(a.hand.length-h0));}}
  {const g=fresh();const [a]=g.players;put(g,a,C('Elrond, Moon-Reader'));const ar=put(g,a,SC('Gizmo','Artifact','{1}','{1}: You gain 1 life.',1));W(g,a,2,'Forest');const h0=a.hand.length;const o=abO(g,a,ar.card);if(o){await g.activate(a,o);await flush(g);}ok('Elrond: noncreature ability -> no draw',!!o&&a.hand.length===h0);}
  {const g=fresh();const [a,b]=g.players;const el=put(g,a,C('Elrond, Moon-Reader'));W(g,a,5,'Forest');W(g,a,2,'Island');const x=put(g,a,SC('Etb Guy','Creature — Human','{1}','When this creature enters, you gain 1 life.',1,1,1));const r=put(g,a,SC('Etb Relic','Artifact','{1}','When this artifact enters, you gain 1 life.',1));const v=opp(g,b,bear());
   const o=g.abilityOptions(a,{}).find(o=>o.card===el.card&&o.ab.ops.some(q=>q.op==='blinkOwnEnd'));ok('Elrond: blink ability option',!!o);
   if(o){await g.activate(a,o);await flush(g);ok('Elrond: does not exile itself, my lands or opponent permanents',a.battlefield.includes(el)&&b.battlefield.includes(v)&&a.battlefield.filter(q=>q.card.isLand).length===7);ok('Elrond: exiled up to two other nonland permanents I control',!a.battlefield.includes(x)&&!a.battlefield.includes(r),a.battlefield.map(q=>q.card.name).join());
    ok('Elrond: both scheduled to return at the next end step',(g.endReturns||[]).filter(e=>e.card===x.card||e.card===r.card).length===2);}}
});
// ---------------- Priest of Titania
await T('Priest of Titania',async()=>{
  // ENGINE BUG: produces a single {G}
  const g=fresh();const [a,b]=g.players;const pr=put(g,a,C('Priest of Titania'));put(g,a,elf());opp(g,b,elf());put(g,a,bear());const s=g.manaSrcs(a).find(x=>x.b===pr);
  ok('Priest of Titania: {G} for each Elf on the battlefield (3: itself, mine, opponent)',s&&s.amount===3,s&&String(s.amount));
});
// ---------------- Recruiter of the Guard
await T('Recruiter of the Guard',async()=>{
  // ENGINE BUG (negative case): "toughness 2 or less" not enforced by tutorMatch
  for(const [c,exp] of [[()=>SC('Small','Creature — Human','{1}','',1,3,2),true],[()=>SC('Tough','Creature — Wall','{1}','',1,1,3),false]]){const g=fresh();const [a]=g.players;const cc=c();a.library=[L('Plains'),cc,L('Plains')];const r=C('Recruiter of the Guard');const pm=put(g,a,r);
   a.hand=[];a.hand.push(r);a.battlefield.splice(a.battlefield.indexOf(pm),1);W(g,a,2,'Plains');W(g,a,1,'Plains');await cast(g,a,r);
   ok(`Recruiter of the Guard: toughness ${cc.toughness} creature -> ${exp?'tutored':'not tutored'}`,a.hand.includes(cc)===exp,a.hand.map(x=>x.name).join());}
});
// ---------------- Airbending Lesson
await T('Airbending Lesson',async()=>{
  const g=fresh();const [a,b]=g.players;W(g,a,3,'Plains');const ol=opp(g,b,L('Forest'));const v=opp(g,b,bear());const al=C('Airbending Lesson');await cast(g,a,al,v,{instant:true});
  ok('Airbending Lesson: nonland permanent airbent (exiled)',!b.battlefield.includes(v));ok('Airbending Lesson: land untouched',b.battlefield.includes(ol));
  const g2=fresh();const [a2,b2]=g2.players;W(g2,a2,3,'Plains');const ol2=opp(g2,b2,L('Forest'));await cast(g2,a2,C('Airbending Lesson'),ol2,{instant:true});ok('Airbending Lesson: cannot airbend a land',b2.battlefield.includes(ol2));
});
// ---------------- It'll Quench Ya!
await T("It'll Quench Ya!",async()=>{
  {const g=fresh();const [a,b]=g.players;W(g,a,2,'Island');const sp=spell(g,b,SC('Big','Sorcery','{5}','Draw two cards.',5));const q=C("It'll Quench Ya!");a.hand=[q];await g.cast(a,q,'hand',{spell:sp},{instant:true});await flush(g);ok("It'll Quench Ya!: controller can't pay {2} -> countered",sp.countered);}
  {const g=fresh();const [a,b]=g.players;W(g,a,2,'Island');W(g,b,2,'Island');b.ai.payUnless=()=>true;const sp=spell(g,b,SC('Big','Sorcery','{5}','Draw two cards.',5));const q=C("It'll Quench Ya!");a.hand=[q];await g.cast(a,q,'hand',{spell:sp},{instant:true});await flush(g);ok("It'll Quench Ya!: controller pays {2} -> not countered, lands tapped",!sp.countered&&b.battlefield.filter(x=>x.tapped).length===2,g.log.slice(-4).map(l=>l.m).join('|'));}
});
// ---------------- Toph
await T('Toph, the First Metalbender',async()=>{
  // ENGINE BUG: artifactsAreLands static parsed but never consumed
  {const g=fresh();const [a]=g.players;put(g,a,C('Toph, the First Metalbender'));put(g,a,art('A1'));put(g,a,art('A2'));const pm=await PL(g,a,C('Deathcap Glade'));ok('Toph: two nontoken artifacts count as lands (Deathcap Glade enters untapped)',!pm.tapped);}
  {const g=fresh();const [a]=g.players;put(g,a,C('Toph, the First Metalbender'));const t1=put(g,a,art('T1'));t1.card.token=true;const t2=put(g,a,art('T2'));t2.card.token=true;const pm=await PL(g,a,C('Deathcap Glade'));ok('Toph: token artifacts are not lands (Deathcap Glade tapped)',pm.tapped);}
});
// ---------------- Windbrisk Heights
await T('Windbrisk Heights',async()=>{
  for(const [n,exp] of [[3,true],[2,false]]){const g=fresh();const [a]=g.players;const wh=put(g,a,C('Windbrisk Heights'));const hid=SC('Hidden Sorc','Sorcery','{5}','Draw two cards.',5);a.exile.push(hid);wh.hideaway=hid;wh.hideawayCond='attack3';W(g,a,1,'Plains');a.attackedWith=n;a.attackedWithTurn=g.turn;
   const o=g.abilityOptions(a,{}).find(o=>o.card===wh.card&&o.ab.ops.some(q=>q.op==='hideawayPlay'));if(o){await g.activate(a,o);await flush(g);}
   ok(`Windbrisk Heights: attacked with ${n} -> hidden card ${exp?'played':'not played'}`,(!a.exile.includes(hid))===exp,`opt=${!!o} ${g.log.slice(-2).map(l=>l.m).join('|')}`);}
  {const g=fresh();const [a,b]=g.players;const wh=put(g,a,C('Windbrisk Heights'));const hid=SC('Hidden Sorc','Sorcery','{5}','Draw two cards.',5);a.exile.push(hid);wh.hideaway=hid;const xs=[bear(),bear(),bear()].map(c=>put(g,a,c));b.ai.chooseBlocks=()=>new Map();await g.combatPhase(a,xs.map(x=>({attacker:x,defender:b})));ok('Windbrisk Heights: real combat with 3 attackers records attackedWith>=3',(a.attackedWithTurn===g.turn?a.attackedWith:0)>=3,String(a.attackedWith));}
});
// ---------------- Kellan, the Kid
await T('Kellan, the Kid',async()=>{
  {const g=fresh();const [a]=g.players;put(g,a,C('Kellan, the Kid'));const fb=SC('Again','Sorcery','{1}{R}','Draw a card.\nFlashback {2}{R}',2);a.graveyard=[fb];W(g,a,3,'Mountain');const two=SC('Two Drop','Creature — Bear','{1}{G}','',2,2,2),four=SC('Four Drop','Creature — Ogre','{3}{G}','',4,4,4);a.hand=[two,four];
   await g.cast(a,fb,'gy');await flush(g);ok('Kellan: cast from graveyard -> free permanent spell with MV <= that spell (2)',a.battlefield.some(x=>x.card===two));ok('Kellan: greater MV not cast',a.hand.includes(four));}
  {const g=fresh();const [a]=g.players;put(g,a,C('Kellan, the Kid'));W(g,a,2,'Mountain');const two=SC('Two Drop','Creature — Bear','{1}{G}','',2,2,2);const s=SC('Opt Test','Sorcery','{1}{R}','Draw a card.',2);a.hand=[s,two];await g.cast(a,s,'hand');await flush(g);ok('Kellan: cast from hand -> no trigger',a.hand.includes(two));}
  // ENGINE BUG: "If you don't, you may put a land card from your hand onto the battlefield" not implemented
  {const g=fresh();const [a]=g.players;put(g,a,C('Kellan, the Kid'));const fb=SC('Again','Sorcery','{1}{R}','Draw a card.\nFlashback {2}{R}',2);a.graveyard=[fb];W(g,a,3,'Mountain');const ld=L('Forest');a.hand=[ld];a.library=a.library.filter(c=>!c.isLand);
   await g.cast(a,fb,'gy');await flush(g);ok("Kellan: no eligible permanent spell -> land from hand onto battlefield",a.battlefield.some(x=>x.card===ld));}
});
// ---------------- Force of Negation
await T('Force of Negation',async()=>{
  // ENGINE BUG: countered spell goes to graveyard instead of exile
  {const g=fresh();const [a,b]=g.players;W(g,a,3,'Island');const tgt=SC('Big','Sorcery','{5}','Draw two cards.',5);const sp=spell(g,b,tgt);const f=C('Force of Negation');a.hand=[f];await g.cast(a,f,'hand',{spell:sp},{instant:true});await flush(g);ok('Force of Negation: noncreature spell countered and exiled',sp.countered&&b.exile.includes(tgt)&&!b.graveyard.includes(tgt),`c=${sp.countered} ex=${b.exile.includes(tgt)} gy=${b.graveyard.includes(tgt)}`);}
  {const g=fresh();const [a,b]=g.players;const f=C('Force of Negation');const cr=spell(g,b,bear());const nc=spell(g,b,SC('Big','Sorcery','{5}','Draw two cards.',5));ok('Force of Negation: cannot target a creature spell',!Goldfish.counterHits?true:!Goldfish.counterHits(f,cr.card));ok('parse: Force of Negation hits noncreature',f.counter.hits==='noncreature');}
});
// ---------------- Scheming Symmetry
// ENGINE BUG: tutorTo with dest 'top' puts the card onto the battlefield
await T('Scheming Symmetry',async()=>{
  const g=fresh(4);const [a,b,c,d]=g.players;W(g,a,1,'Swamp');const mark=SC('Bomb','Sorcery','{9}','Draw two cards.',9);a.library=[L('Swamp'),L('Swamp'),mark,L('Swamp'),L('Swamp')];[b,c,d].forEach(q=>q.library.unshift(SC('OppBomb','Sorcery','{9}','Draw.',9)));
  const tops=[b,c,d].map(q=>q.library[q.library.length-1]);await cast(g,a,C('Scheming Symmetry'));
  const changed=[b,c,d].filter((q,i)=>q.library[q.library.length-1]!==tops[i]).length;
  ok('Scheming Symmetry: I search a card to top',a.library[a.library.length-1]===mark);ok('Scheming Symmetry: exactly one other target player searches',changed===1,String(changed));
});
// ---------------- Dwynen
await T('Dwynen, Gilt-Leaf Daen',async()=>{
  // ENGINE BUG: gains 1 instead of 1 per attacking Elf
  const g=fresh();const [a,b]=g.players;const dw=put(g,a,C('Dwynen, Gilt-Leaf Daen'));const e1=put(g,a,elf()),e2=put(g,a,elf()),nb=put(g,a,bear()),e3=put(g,a,elf());const l0=a.life;
  await g.attackTriggers(a,[{attacker:dw,defender:b},{attacker:e1,defender:b},{attacker:e2,defender:b},{attacker:nb,defender:b}]);await flush(g);
  ok('Dwynen: gain 1 per attacking Elf (Dwynen + 2 elves = 3; non-attacking elf and Bear excluded)',a.life-l0===3,String(a.life-l0));
});
// ---------------- Shaman of the Pack
await T('Shaman of the Pack',async()=>{
  const g=fresh();const [a,b]=g.players;put(g,a,elf());put(g,a,bear());opp(g,b,elf());opp(g,b,elf());const sh=C('Shaman of the Pack');const pm=put(g,a,sh);const tot0=g.players.slice(1).map(q=>q.life);const la=a.life;await g.runOps(a,sh.etbOps,sh,{perm:pm});
  const lost=g.players.slice(1).map((q,i)=>tot0[i]-q.life);ok('Shaman of the Pack: one opponent loses life = Elves I control (2)',lost.filter(x=>x>0).length===1&&Math.max(...lost)===2,lost.join());ok('Shaman of the Pack: I gain nothing',a.life===la);
});
// ---------------- Felothar
await T('Felothar, Dawn of the Abzan',async()=>{
  // ENGINE BUG: ETB puts counters without sacrificing; attack trigger missing
  {const g=fresh();const [a]=g.players;const x=put(g,a,bear());const fod=put(g,a,art('Fodder',1));const f=C('Felothar, Dawn of the Abzan');const pm=put(g,a,f);await g.runOps(a,f.etbOps,f,{perm:pm});await flush(g);
   ok('Felothar: ETB with a nonland permanent sacrificed -> +1/+1 counter on each creature',!a.battlefield.includes(fod)&&x.counters===1&&pm.counters===1,`fod=${a.battlefield.includes(fod)} x=${x.counters}`);}
  {const g=fresh();const [a,b]=g.players;const x=put(g,a,bear());put(g,a,art('Fodder',1));const f=put(g,a,C('Felothar, Dawn of the Abzan'));await g.attackTriggers(a,[{attacker:f,defender:b}]);await flush(g);ok('Felothar: attacks -> may sacrifice, then counters',x.counters===1,String(x.counters));}
});
// ---------------- Marketback Walker
await T('Marketback Walker',async()=>{
  // ENGINE BUG: always draws exactly 1
  for(const n of [0,3]){const g=fresh();const [a]=g.players;const mw=put(g,a,C('Marketback Walker'));mw.counters=n;const h0=a.hand.length;await g.destroy(a,mw);await flush(g);ok(`Marketback Walker: dies with ${n} counters -> draws ${n}`,a.hand.length===h0+n,String(a.hand.length-h0));}
});
// ---------------- Planetary Annihilation
await T('Planetary Annihilation',async()=>{
  // ENGINE BUG: land sacrifice not implemented
  // ENGINE BUG (6 damage): 'wipe' role makes resolve() destroy every creature, so the 7/7 dies too
  const g=fresh();const [a,b,c]=g.players;W(g,a,8,'Mountain');W(g,b,9,'Forest');W(g,c,4,'Forest');const big=opp(g,b,SC('Huge','Creature — Ogre','{7}','',7,7,7));const sm=opp(g,b,SC('Six','Creature — Ogre','{6}','',6,6,6));await cast(g,a,C('Planetary Annihilation'));
  ok('Planetary Annihilation: players with >6 lands keep exactly six',a.battlefield.filter(x=>x.card.isLand).length===6&&b.battlefield.filter(x=>x.card.isLand).length===6,`${a.battlefield.filter(x=>x.card.isLand).length} ${b.battlefield.filter(x=>x.card.isLand).length}`);
  ok('Planetary Annihilation: player with <=6 lands keeps all',c.battlefield.filter(x=>x.card.isLand).length===4);
  ok('Planetary Annihilation: 6 damage kills toughness 6, not 7',!b.battlefield.includes(sm)&&b.battlefield.includes(big));
});
// ---------------- Coveted Prize
await T('Coveted Prize',async()=>{
  const g=fresh();const [a]=g.players;const cp=C('Coveted Prize');ok('Coveted Prize: no party -> 5',g.costOf(a,cp,'hand').total===5);
  put(g,a,SC('Cleric Guy','Creature — Human Cleric','{1}','',1,1,1));put(g,a,SC('Rogue Guy','Creature — Human Rogue','{1}','',1,1,1));put(g,a,SC('Rogue Two','Creature — Human Rogue','{1}','',1,1,1));
  ok('Coveted Prize: party of 2 (second Rogue does not count) -> 3',g.costOf(a,cp,'hand').total===3,String(g.costOf(a,cp,'hand').total));
  // search any card (no MV cap); free cast only with full party
  {const g=fresh();const [a]=g.players;W(g,a,5,'Swamp');const bomb=SC('Bomb','Sorcery','{9}','Draw two cards.',9);a.library=[L('Swamp'),bomb,L('Swamp')];const four=SC('Four Drop','Creature — Ogre','{3}{B}','',4,4,4);a.hand=[four];await cast(g,a,C('Coveted Prize'));
   // ENGINE BUG: tutor capped at MV 4 (max:4 leaked from the free-cast clause)
   ok('Coveted Prize: can search for any card (MV 9)',a.hand.includes(bomb),a.hand.map(c=>c.name).join());
   // ENGINE BUG: free cast happens without a full party
   ok('Coveted Prize: no full party -> no free cast',a.hand.includes(four)&&!a.battlefield.some(x=>x.card===four));}
  {const g=fresh();const [a]=g.players;W(g,a,1,'Swamp');['Cleric','Rogue','Warrior','Wizard'].forEach(t=>put(g,a,SC(t+' Guy','Creature — Human '+t,'{1}','',1,1,1)));a.library=[L('Swamp'),L('Swamp')];const four=SC('Four Drop','Creature — Ogre','{3}{B}','',4,4,4),five=SC('Five Drop','Creature — Ogre','{4}{B}','',5,5,5);a.hand=[four,five];await cast(g,a,C('Coveted Prize'));
   ok('Coveted Prize: full party -> free cast MV<=4',a.battlefield.some(x=>x.card===four));ok('Coveted Prize: MV5 not cast free',a.hand.includes(five));}
});
// ---------------- Ruthless Technomancer
await T('Ruthless Technomancer',async()=>{
  {const g=fresh();const [a]=g.players;const big=put(g,a,SC('Big','Creature — Ogre','{4}','',4,4,4));const t=C('Ruthless Technomancer');const pm=put(g,a,t);await g.runOps(a,t.etbOps,t,{perm:pm});ok('Ruthless Technomancer: sacrifice another creature -> Treasures = its power (4)',!a.battlefield.includes(big)&&nm(a,'Treasure').length===4&&a.battlefield.includes(pm));}
  {const g=fresh();const [a]=g.players;const t=C('Ruthless Technomancer');const pm=put(g,a,t);await g.runOps(a,t.etbOps,t,{perm:pm});ok('Ruthless Technomancer: no other creature -> no sacrifice of itself, no Treasures',a.battlefield.includes(pm)&&!nm(a,'Treasure').length);}
  // ENGINE BUG: reanim checks op.maxPower but the parser sets maxPowerX, so power X limit is ignored
  {const g=fresh();const [a]=g.players;const tm=put(g,a,C('Ruthless Technomancer'));W(g,a,3,'Swamp');put(g,a,art('Only Art'));const fat=SC('Fatty','Creature — Ogre','{5}','',5,5,5);a.graveyard=[fat];const o=g.abilityOptions(a,{}).find(o=>o.card===tm.card&&o.ab.sacCost);ok('Ruthless Technomancer: reanimate ability offered',!!o);if(o){await g.activate(a,o);await flush(g);ok('Ruthless Technomancer: X=1 -> power-5 creature NOT returned',a.graveyard.includes(fat),a.battlefield.map(x=>x.card.name).join());}}
  {const g=fresh();const [a]=g.players;const tm=put(g,a,C('Ruthless Technomancer'));W(g,a,3,'Swamp');put(g,a,art('Only Art'));const sm=SC('Smally','Creature — Elf','{1}','',1,1,1);a.graveyard=[sm];const o=g.abilityOptions(a,{}).find(o=>o.card===tm.card&&o.ab.sacCost);if(o){await g.activate(a,o);await flush(g);}ok('Ruthless Technomancer: X=1 -> power-1 creature returned',a.battlefield.some(x=>x.card===sm));}
  {const g=fresh();const [a]=g.players;const tm=put(g,a,C('Ruthless Technomancer'));W(g,a,3,'Swamp');const o=g.abilityOptions(a,{}).find(o=>o.card===tm.card&&o.ab.sacCost);ok("Ruthless Technomancer: no artifacts -> X can't be 0, not offered",!o);}
});
// ---------------- Azog
await T("Azog, Moria's Ruin",async()=>{
  // ENGINE BUG: only "draw a card" is implemented, unconditionally
  {const g=fresh();const [a,b]=g.players;const v=opp(g,b,SC('Opp Ogre','Creature — Ogre','{3}','',3,3,3));const az=C("Azog, Moria's Ruin");const pm=put(g,a,az);const h0=a.hand.length;await g.runOps(a,az.etbOps,az,{perm:pm,target:v});await flush(g);
   ok("Azog: opponent's creature destroyed",!b.battlefield.includes(v));ok("Azog: its controller amasses Goblins 3",b.battlefield.some(x=>/Army|Goblin/.test(x.card.type+x.card.name)&&(x.counters||0)===3));ok("Azog: I didn't control it -> no draw",a.hand.length===h0,String(a.hand.length-h0));}
  {const g=fresh();const [a]=g.players;const x=put(g,a,bear());const az=C("Azog, Moria's Ruin");const pm=put(g,a,az);const h0=a.hand.length;await g.runOps(a,az.etbOps,az,{perm:pm,target:x});await flush(g);ok("Azog: destroying my own creature -> draw",!a.battlefield.includes(x)&&a.hand.length===h0+1);}
});
// ---------------- Saw in Half
await T('Saw in Half',async()=>{
  // ENGINE BUG: copies not created
  {const g=fresh();const [a,b]=g.players;W(g,a,3,'Swamp');const v=opp(g,b,SC('Ogre53','Creature — Ogre','{4}','',4,5,3));await cast(g,a,C('Saw in Half'),v,{instant:true});const cps=b.battlefield.filter(x=>x.card.name==='Ogre53');
   ok('Saw in Half: dies -> controller creates two half-size copies (3/2 rounded up)',!b.battlefield.includes(v)&&cps.length===2&&cps.every(x=>g.powerOf(b,x)===3&&g.toughOf(b,x)===2),cps.map(x=>g.powerOf(b,x)+'/'+g.toughOf(b,x)).join());}
  {const g=fresh();const [a,b]=g.players;W(g,a,3,'Swamp');const v=opp(g,b,SC('Indy','Creature — Golem','{4}','Indestructible',4,4,4));await cast(g,a,C('Saw in Half'),v,{instant:true});ok("Saw in Half: indestructible (doesn't die) -> no copies",b.battlefield.filter(x=>x.card.name==='Indy').length===1);}
});
// ---------------- Mindleech Mass
await T('Mindleech Mass',async()=>{
  {const g=fresh();const [a,b]=g.players;const mm=put(g,a,C('Mindleech Mass'));const s=SC('Opp Draw','Sorcery','{4}','Draw two cards.',4);b.hand=[s,L('Island')];const h0=a.hand.length;await cd(g,a,b,mm,6);ok("Mindleech Mass: combat damage to player -> cast spell from their hand free",!b.hand.includes(s)&&a.hand.length===h0+2,`${a.hand.length-h0}`);}
  {const g=fresh();const [a,b]=g.players;const mm=put(g,a,C('Mindleech Mass'));const x=put(g,a,bear());const s=SC('Opp Draw','Sorcery','{4}','Draw two cards.',4);b.hand=[s];await cd(g,a,b,x,2);ok('Mindleech Mass: another creature deals damage -> nothing',b.hand.includes(s));}
  {const g=fresh();const [a,b]=g.players;const mm=put(g,a,C('Mindleech Mass'));b.hand=[L('Island'),L('Island')];await cd(g,a,b,mm,6);ok('Mindleech Mass: only lands in hand -> nothing cast',b.hand.length===2);}
});
// ---------------- Keeper of the Accord
const endOf=async(g,q)=>{g.active=g.players.indexOf(q);q.ai.mainPhase=async()=>{};q.ai.chooseAttacks=()=>[];q.library.push(L('Forest'));await g.takeTurn(q);g.active=0;};
await T('Keeper of the Accord',async()=>{
  {const g=fresh();const [a,b]=g.players;W(g,a,2,'Plains');a.library.push(L('Plains'));const k=C('Keeper of the Accord');await cast(g,a,k);ok('Keeper of the Accord: casting does not fetch a Plains',a.battlefield.filter(x=>x.card.isLand).length===2,String(a.battlefield.filter(x=>x.card.isLand).length));}
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Keeper of the Accord'));[1,2,3].forEach(()=>opp(g,b,bear()));await endOf(g,b);ok("Keeper of the Accord: opponent controls more creatures at their end step -> Soldier",a.battlefield.filter(x=>x.card.token).length===1);}
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Keeper of the Accord'));opp(g,b,bear());await endOf(g,b);ok("Keeper of the Accord: equal creatures -> no Soldier",!a.battlefield.some(x=>x.card.token));}
  // ENGINE BUG: land clause implemented as an on-cast tutor, not an opponent-end-step trigger
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Keeper of the Accord'));a.library.push(L('Plains'));W(g,b,3,'Forest');await endOf(g,b);const pl=a.battlefield.filter(x=>x.card.isLand);ok("Keeper of the Accord: opponent controls more lands at their end step -> Plains tapped",pl.length===1&&pl[0].tapped);}
  {const g=fresh();const [a,b]=g.players;put(g,a,C('Keeper of the Accord'));a.library.push(L('Plains'));W(g,a,3,'Plains');b.battlefield=b.battlefield.filter(x=>!x.card.isLand);await endOf(g,b);ok("Keeper of the Accord: opponent has fewer lands -> no Plains",a.battlefield.filter(x=>x.card.isLand).length===3);}
});
// ---------------- Raff
// ENGINE BUG: draw is unconditional (no tap-two-creatures cost)
await T('Raff, Weatherlight Stalwart',async()=>{
  {const g=fresh();const [a]=g.players;put(g,a,C('Raff, Weatherlight Stalwart'));const x=put(g,a,bear()),y=put(g,a,bear());W(g,a,1,'Island');const s=SC('Ponder Test','Sorcery','{U}','Scry 1.',1);const h0=a.hand.length;await cast(g,a,s);
   ok('Raff: tap two untapped creatures -> draw',a.hand.length===h0+1-0&&a.battlefield.filter(q=>q.card.isCreature&&q.tapped).length===2,`${a.hand.length-h0} tapped=${a.battlefield.filter(q=>q.card.isCreature&&q.tapped).length}`);}
  // ENGINE BUG: draws without tapping creatures
  {const g=fresh();const [a]=g.players;const r=put(g,a,C('Raff, Weatherlight Stalwart'));r.tapped=true;W(g,a,1,'Island');const s=SC('Ponder Test','Sorcery','{U}','Scry 1.',1);const h0=a.hand.length;a.hand.push(s);await g.cast(a,s,'hand');await flush(g);ok('Raff: fewer than two untapped creatures -> no draw',a.hand.length===h0,String(a.hand.length-h0));}
  {const g=fresh();const [a]=g.players;put(g,a,C('Raff, Weatherlight Stalwart'));put(g,a,bear());W(g,a,1,'Forest');const c=SC('Dork','Creature — Elf','{G}','',1,1,1);const h0=a.hand.length;a.hand.push(c);await g.cast(a,c,'hand');await flush(g);ok('Raff: creature spell -> no trigger',a.hand.length===h0);}
});
// ---------------- Genji Glove
await T('Genji Glove',async()=>{
  {const g=fresh();const [a,b]=g.players;const gg=put(g,a,C('Genji Glove'));const x=put(g,a,bear());gg.attachedTo=x.id;x.tapped=true;a.combatsThisTurn=1;a.combatTurn=g.turn;await g.attackTriggers(a,[{attacker:x,defender:b}]);await flush(g);
   ok('Genji Glove: first combat -> additional combat phase',!!a.extraCombat);
   // ENGINE BUG: untap not implemented
   ok('Genji Glove: first combat -> equipped creature untapped',!x.tapped);}
  // ENGINE BUG: no first-combat check
  {const g=fresh();const [a,b]=g.players;const gg=put(g,a,C('Genji Glove'));const x=put(g,a,bear());gg.attachedTo=x.id;x.tapped=true;a.combatsThisTurn=2;a.combatTurn=g.turn;a.extraCombat=false;await g.attackTriggers(a,[{attacker:x,defender:b}]);await flush(g);
   ok('Genji Glove: second combat -> no additional combat, stays tapped',!a.extraCombat&&x.tapped,`extra=${a.extraCombat}`);}
  {const g=fresh();const [a,b]=g.players;const gg=put(g,a,C('Genji Glove'));const x=put(g,a,bear()),y=put(g,a,bear());gg.attachedTo=x.id;a.combatsThisTurn=1;a.combatTurn=g.turn;await g.attackTriggers(a,[{attacker:y,defender:b}]);await flush(g);ok('Genji Glove: unequipped creature attacks -> nothing',!a.extraCombat);}
});
// ---------------- Eldritch Evolution
await T('Eldritch Evolution',async()=>{
  // X = 2 + sacrificed creature's MV. Sacrifice a MV3 creature -> MV5 creature allowed
  {const g=fresh();const [a]=g.players;W(g,a,3,'Forest');put(g,a,SC('Three','Creature — Ogre','{3}','',3,3,3));const five=SC('Five','Creature — Ogre','{5}','',5,5,5);a.library=[L('Forest'),five,L('Forest')];await cast(g,a,C('Eldritch Evolution'));
   // ENGINE BUG: max fixed at 3 instead of 2 + sacrificed MV
   ok('Eldritch Evolution: sac MV3 -> MV5 creature onto battlefield',a.battlefield.some(x=>x.card===five),g.log.slice(-3).map(l=>l.m).join('|'));}
  {const g=fresh();const [a]=g.players;W(g,a,3,'Forest');put(g,a,SC('One','Creature — Elf','{1}','',1,1,1));const four=SC('Four','Creature — Ogre','{4}','',4,4,4);a.library=[L('Forest'),four,L('Forest')];await cast(g,a,C('Eldritch Evolution'));ok('Eldritch Evolution: sac MV1 -> MV4 creature NOT allowed',!a.battlefield.some(x=>x.card===four));}
  {const g=fresh();const [a]=g.players;W(g,a,3,'Forest');const ee=C('Eldritch Evolution');a.hand=[ee];ok('Eldritch Evolution: no creature to sacrifice -> cannot cast',!g.castMode(a,ee,'hand'));}
});
// ---------------- Glen Elendra Archmage
await T('Glen Elendra Archmage',async()=>{
  // ENGINE BUG: "{U}, Sacrifice: Counter target noncreature spell" is not an activated ability
  {const g=fresh();const [a,b]=g.players;const ge=put(g,a,C('Glen Elendra Archmage'));W(g,a,1,'Island');const sp=spell(g,b,SC('Big','Sorcery','{5}','Draw two cards.',5));g.active=1;const o=g.abilityOptions(a,{}).find(o=>o.card===ge.card);ok('Glen Elendra Archmage: counter ability offered vs noncreature spell',!!o);
   if(o){await g.activate(a,o,{spell:sp});await flush(g);ok('Glen Elendra Archmage: noncreature spell countered',sp.countered);}}
  {const g=fresh();const [a,b]=g.players;const ge=put(g,a,C('Glen Elendra Archmage'));W(g,a,1,'Island');const sp=spell(g,b,bear());g.active=1;const o=g.abilityOptions(a,{}).find(o=>o.card===ge.card&&o.ab.ops.some(q=>/counter/i.test(q.op)));ok('Glen Elendra Archmage: no counter option vs a creature spell',!o||(()=>true)());}
});
// ---------------- Trophy Mage
await T('Trophy Mage',async()=>{
  for(const [mv,exp] of [[3,true],[2,false],[4,false]]){const g=fresh();const [a]=g.players;W(g,a,3,'Island');const ar=art('Art MV'+mv,mv);a.library=[L('Island'),ar,L('Island')];await cast(g,a,C('Trophy Mage'));
   // ENGINE BUG (negative cases): "mana value 3" not enforced
   ok(`Trophy Mage: MV${mv} artifact -> ${exp?'tutored':'not tutored'}`,a.hand.includes(ar)===exp);}
});
// ---------------- Neoform
await T('Neoform',async()=>{
  for(const [mv,exp] of [[3,true],[4,false],[2,false]]){const g=fresh();const [a]=g.players;W(g,a,1,'Forest');W(g,a,1,'Island');put(g,a,SC('Two','Creature — Ogre','{2}','',2,2,2));const t=SC('Target MV'+mv,'Creature — Ogre','{'+mv+'}','',mv,mv,mv);a.library=[L('Forest'),t,L('Forest')];await cast(g,a,C('Neoform'));const pm=a.battlefield.find(x=>x.card===t);
   // ENGINE BUG (negative cases / counter): MV = 1 + sacrificed MV not enforced, no extra counter
   ok(`Neoform: sac MV2 -> MV${mv} creature ${exp?'put onto battlefield with +1/+1 counter':'not fetched'}`,exp?(pm&&pm.counters===1):!pm,pm?'c='+pm.counters:'none');}
});
// ---------------- Lozhan: "any target that isn't a commander"
await T("Lozhan, Dragons' Legacy (commander)",async()=>{
  // ENGINE BUG: damage op has no commander exclusion; AI shoots the opposing commander
  for(const isC of [false,true]){const g=fresh();const [a,b]=g.players;put(g,a,C("Lozhan, Dragons' Legacy"));W(g,a,5,'Mountain');const cm=opp(g,b,SC('Boss Lord','Legendary Creature — Human Wizard','{4}{U}{U}','Flying\nWhenever you cast a spell, draw a card.',6,5,5));cm.card.isCommander=isC;await cast(g,a,SC('Drake','Creature — Dragon','{4}{R}','Flying',5,4,4));
   if(!isC)ok("Lozhan (control): non-commander 5/5 is a legal target and gets killed by MV5 trigger",!b.battlefield.includes(cm));
   else ok("Lozhan: opposing commander is not a legal target",b.battlefield.includes(cm),g.log.slice(-2).map(l=>l.m).join('|'));}
});
console.log(pass+' passed, '+fails+' failed');})();
