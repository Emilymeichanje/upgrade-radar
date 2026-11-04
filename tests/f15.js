require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;
const RAW=[...require(__dirname+'/fixtures/gap1.json'),...require(__dirname+'/fixtures/gap2.json'),...require(__dirname+'/fixtures/gap3.json'),...require(__dirname+'/fixtures/gap4.json'),...require(__dirname+'/fixtures/gap5.json')].map(a=>({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7],loyalty:a[8]}));
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
await T('bloodthirster',async()=>{const g=fresh();const [a,b]=g.players;const bt=put(g,a,C('Bloodthirster'));bt.tapped=true;g._cdDefender=b;await g.combatDamageTriggers(a,bt);ok('untaps + extra combat',!bt.tapped&&a.extraCombat);});
await T('koma ward',async()=>{const k=C('Koma, World-Eater');ok('ward 4',k.statics.ward===4);});
await T('offer refuse',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,1,'Island');const sp=spell(g,b,tagCard(mk('Think','Sorcery','{3}','Draw a card.',3)));const of=C("An Offer You Can't Refuse");a.hand=[of];await g.cast(a,of,'hand',{spell:sp},{instant:true});ok('countered & caster gets 2 treasures',b.battlefield.filter(x=>x.card.name==='Treasure').length===2);g.stack=[];});
await T('mana drain',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,2,'Island');const sp=spell(g,b,tagCard(mk('Big','Sorcery','{5}','Draw a card.',5)));const md=C('Mana Drain');a.hand=[md];await g.cast(a,md,'hand',{spell:sp},{instant:true});ok('pending mana 5',a.pendingMainMana===5);g.stack=[];});
const B=n=>tagCard(mk(n,'Basic Land — '+n,'','',0));const tok=(g,p,n='Soldier')=>put(g,p,{...tagCard(mk(n,'Token Creature — Soldier','','',0,1,1)),token:true});
const kill=async(g,p,pm)=>{await g.destroy(p,pm);await flush(g);};
const oppLife=g=>g.players.slice(1).map(q=>q.life);
const ctr=(g,a,t,n=1)=>g.runOps(a,[{op:'counters',n,to:'target creature'}],{name:'x'},{target:t});
// drain on death
for(const [nm,self] of [['Bastion of Remembrance',0],['Zulaport Cutthroat',0],['Elas il-Kor, Sadistic Pilgrim',0]])
 await T(nm,async()=>{const g=fresh();const [a]=g.players;put(g,a,C(nm));const e=put(g,a,elf());await kill(g,a,e);ok(nm+' drains on own creature death',oppLife(g).every(x=>x===39),oppLife(g)+'');});
await T('zulaport opp creature no',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Zulaport Cutthroat'));const e=opp(g,b,elf());await kill(g,b,e);ok('no drain on opp death',oppLife(g).every(x=>x===40));});
await T('kokusho',async()=>{const g=fresh();const [a]=g.players;const k=put(g,a,C('Kokusho, the Evening Star'));await kill(g,a,k);ok('each opp -5, gain 10',oppLife(g).every(x=>x===35)&&a.life===50,a.life+' '+oppLife(g));});
await T('dictate',async()=>{const g=fresh();const [a,b,c]=g.players;put(g,a,C('Dictate of Erebos'));opp(g,b,elf());opp(g,c,elf());const e=put(g,a,elf());await kill(g,a,e);ok('each opp sacs',!b.battlefield.some(x=>x.card.isCreature)&&!c.battlefield.some(x=>x.card.isCreature));});
await T('morbid opp once',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Morbid Opportunist'));const h=a.hand.length;await kill(g,a,put(g,a,elf()));await kill(g,a,put(g,a,elf()));ok('draws once per turn',a.hand.length===h+1,''+(a.hand.length-h));});
await T('corpse knight',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Corpse Knight'));const e=await g.enterPerm(a,elf());await g.creatureEntered(a,e);await flush(g);ok('enters → opp -1',oppLife(g).every(x=>x===39));});
await T('fleshraker',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Glaring Fleshraker'));const e=await g.enterPerm(a,elf());await g.creatureEntered(a,e);await flush(g);ok('colored → no dmg',oppLife(g).every(x=>x===40));const m=await g.enterPerm(a,tagCard(mk('Myr','Artifact Creature — Myr','{2}','',2,1,1)));await g.creatureEntered(a,m);await flush(g);ok('colorless → 1 dmg',oppLife(g).every(x=>x===39),oppLife(g)+'');});
// counter replacement
await T('hardened scales',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Hardened Scales'));const e=put(g,a,elf());await ctr(g,a,e,1);ok('+1 extra',e.counters===2);const o=opp(g,b,elf());await ctr(g,b,o,1);ok('not opp',o.counters===1);});
await T('ozolith',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Ozolith, the Shattered Spire'));const e=put(g,a,elf());await ctr(g,a,e,2);ok('+1 extra',e.counters===3);});
await T('earth crystal',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('The Earth Crystal'));const e=put(g,a,elf());await ctr(g,a,e,2);ok('doubles',e.counters===4,''+e.counters);});
// cast restrictions
await T('kutzil',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Kutzil, Malamet Exemplar'));ok('opp locked on my turn',g.castLocked(b,'hand',true));g.active=1;ok('free on their turn',!g.castLocked(b,'hand',false));});
await T('dromoka',async()=>{const g=fresh();const [a,b]=g.players;const d=C('Dragonlord Dromoka');ok('uncounterable',d.uncounterable);put(g,a,d);ok('opp locked my turn',g.castLocked(b,'hand',true));});
await T('silence',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,1,'Plains');const s=C('Silence');a.hand=[s];await g.cast(a,s);ok('opp locked',g.castLocked(b,'hand',true));});
for(const nm of ['Supreme Verdict',"Dovin's Veto"]) await T(nm,async()=>{ok(nm+' uncounterable',C(nm).uncounterable);});
await T('chimil',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Chimil, the Inner Sun'));const obj={card:elf(),caster:a};ok('my spells uncounterable',g.isUncounterable(obj));});
// counterspell filters
await T('negate',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,2,'Island');const sp=spell(g,b,elf());const n=C('Negate');a.hand=[n];ok('cannot target creature spell',!g.targetOk||!g.targetOk(n,{spell:sp},a)||!(await g.cast(a,n,'hand',{spell:sp},{instant:true}))||g.stack.includes(sp));g.stack=[];});
await T('flusterstorm',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,1,'Island');W(g,b,1,'Island');const sp=spell(g,b,tagCard(mk('Bolt','Instant','{R}','Draw a card.',1)));const f=C('Flusterstorm');a.hand=[f];await g.cast(a,f,'hand',{spell:sp},{instant:true});ok('opp paid 1 or countered',!g.stack.includes(sp)||b.battlefield.some(x=>x.tapped),last(g,4));g.stack=[];});
// statics
await T('authority',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Authority of the Consuls'));const e=await g.enterPerm(b,elf());ok('opp creature enters tapped',e.tapped);await g.creatureEntered(b,e);await flush(g);ok('I gain 1',a.life===41);});
await T('carrion feeder',async()=>{const g=fresh();const [a,b]=g.players;const cf=put(g,a,C('Carrion Feeder'));ok("can't block",!g.canBlock(cf,opp(g,b,elf())));});
await T('elesh norn',async()=>{const g=fresh();const [a,b]=g.players;const e=opp(g,b,elf(3,3));const m=put(g,a,elf());put(g,a,C('Elesh Norn, Grand Cenobite'));g.refreshStatics();ok('opp -2/-2',g.powerOf(b,e)===1);ok('mine +2/+2',g.powerOf(a,m)===4);});
await T('herald',async()=>{const g=fresh();const [a,b]=g.players;put(g,a,C('Herald of Secret Streams'));const e=put(g,a,elf());const bl=opp(g,b,elf());ok('blockable w/o counter',g.canBlock(bl,e));e.counters=1;ok('unblockable w/ counter',!g.canBlock(bl,e));});
await T('lambholt',async()=>{const g=fresh();const [a,b]=g.players;const ch=put(g,a,C('Champion of Lambholt'));ch.counters=3;const e=put(g,a,elf());const bl=opp(g,b,elf(2,2));ok('small cant block',!g.canBlock(bl,e));const big=opp(g,b,elf(5,5));ok('big can',g.canBlock(big,e));});
await T('geyser drake',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Geyser Drake'));const c=tagCard(mk('Think','Instant','{2}{U}','Draw a card.',3));ok('full on my turn',g.costOf(a,c,'hand').total===3);g.active=1;ok('-1 off turn',g.costOf(a,c,'hand').total===2);});
await T('anger',async()=>{const g=fresh();const [a]=g.players;a.graveyard.push(C('Anger'));const e=put(g,a,elf(),{summoning:true});g.refreshStatics();ok('no haste w/o mountain',!e.card.kw.includes('haste'));W(g,a,1,'Mountain');g.refreshStatics();ok('haste w/ mountain',e.card.kw.includes('haste'));});
// sacrifice effects
await T('plaguecrafter',async()=>{const g=fresh();const [a,b,c]=g.players;W(g,a,3,'Swamp');opp(g,b,elf());const hc=c.hand.length;const pc=C('Plaguecrafter');a.hand=[pc];await g.cast(a,pc);ok('b sacs creature',!b.battlefield.some(x=>x.card.isCreature));ok('c (none) discards',c.hand.length===hc-1,hc+'→'+c.hand.length);});
await T('accursed marauder',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,2,'Swamp');opp(g,b,elf());const t=put(g,b,{...elf(),token:true});const am=C('Accursed Marauder');a.hand=[am];await g.cast(a,am);ok('nontoken sacrificed, token stays',b.battlefield.filter(x=>x.card.isCreature).length===1&&b.battlefield.some(x=>x.card.token));});
// removal riders
await T('rapid hybridization',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,1,'Island');const t=opp(g,b,elf(5,5));const r=C('Rapid Hybridization');a.hand=[r];await g.cast(a,r,'hand',t);ok('destroyed + 3/3 frog lizard',!b.battlefield.includes(t)&&b.battlefield.some(x=>x.card.isCreature&&x.card.power===3));});
await T('stroke',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,3,'Plains');const t=opp(g,b,elf(5,5));const r=C('Stroke of Midnight');a.hand=[r];await g.cast(a,r,'hand',t);ok('destroyed + 1/1 human',!b.battlefield.includes(t)&&b.battlefield.some(x=>x.card.isCreature&&x.card.power===1));});
await T('anguished',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,1,'Plains');W(g,a,2,'Swamp');const t=opp(g,b,elf());const r=C('Anguished Unmaking');a.hand=[r];await g.cast(a,r,'hand',t);ok('exiled, lose 3',b.exile.some(c=>c.name==='Elfy')&&a.life===37);});
await T('rift',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,2,'Island');const t=opp(g,b,elf());const r=C('Cyclonic Rift');a.hand=[r];await g.cast(a,r,'hand',t);ok('bounced',b.hand.some(c=>c.name==='Elfy'));});
await T('meteor golem',async()=>{const g=fresh();const [a,b]=g.players;W(g,a,7);const t=opp(g,b,tagCard(mk('Rock','Artifact','{3}','',3)));const r=C('Meteor Golem');a.hand=[r];await g.cast(a,r,'hand',t);ok('destroys opp nonland',!b.battlefield.includes(t));});
await T('craterhoof',async()=>{const g=fresh();const [a]=g.players;W(g,a,8,'Forest');const e=put(g,a,elf());const r=C('Craterhoof Behemoth');a.hand=[r];await g.cast(a,r);g.refreshStatics();ok('+2/+2 & trample (2 creatures)',g.powerOf(a,e)===4&&e.card.kw.includes('trample'),''+g.powerOf(a,e));});
// enduring
for(const nm of ['Enduring Tenacity','Enduring Curiosity']) await T(nm,async()=>{const g=fresh();const [a]=g.players;const e=put(g,a,C(nm));await kill(g,a,e);const back=a.battlefield.find(x=>x.card.name===nm);ok(nm+' returns as non-creature enchantment',back&&!back.card.isCreature);if(back){await kill(g,a,back);ok(nm+' does not return twice',!a.battlefield.some(x=>x.card.name===nm));}});
// tutors
for(const [nm,where] of [['Demonic Tutor','hand'],['Diabolic Intent','hand'],['Vampiric Tutor','top'],['Enlightened Tutor','top'],['Mystical Tutor','top'],["Eladamri's Call",'hand'],['Entomb','gy'],["Nature's Lore",'bf']]) await T(nm,async()=>{const g=fresh();const [a]=g.players;W(g,a,4,'Swamp');W(g,a,2,'Forest');W(g,a,2,'Plains');W(g,a,2,'Island');const tgt=tagCard(mk(/Enlightened/.test(nm)?'Relic':/Mystical/.test(nm)?'Ritual':'Target','Instant','{1}','Draw a card.',1));if(/Enlightened/.test(nm)){tgt.type='Artifact';tgt.isArtifact=true;tgt.isInstant=false;}if(/Eladamri/.test(nm)){Object.assign(tgt,tagCard(mk('Target','Creature — Elf','{1}','',1,1,1)));}if(/Nature/.test(nm)){Object.assign(tgt,B('Forest'));}a.library.push(tgt);const c=C(nm);a.hand=[c];if(/Diabolic/.test(nm))put(g,a,elf());const lib=a.library.length,gy=a.graveyard.length,bf=a.battlefield.length,life=a.life;await g.cast(a,c);const o=where==='hand'?a.hand.length>=1:where==='top'?a.library.length===lib:where==='gy'?a.graveyard.length>=gy+2:a.battlefield.length===bf+1;ok(nm+' → '+where,o,last(g,3));if(nm==='Vampiric Tutor')ok('vamp -2 life',a.life===life-2);});
console.log(pass+' passed, '+fails+' failed');})();
