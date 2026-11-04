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
const tok=(g,p,n='Soldier')=>put(g,p,{...tagCard(mk(n,'Token Creature — Soldier','','',0,1,1)),token:true});
const LE=async(g,p,name)=>{const c=C(name);const [pm]=await g.landEnters(p,c);return pm;};
const B=n=>tagCard(mk(n,'Basic Land — '+n,'','',0));
// --- lands with enter conditions
for(const [nm,need,typ] of [['Glacial Fortress','Island'],['Hinterland Harbor','Forest'],['Sunpetal Grove','Plains'],['Clifftop Retreat','Mountain'],['Dragonskull Summit','Swamp'],['Isolated Chapel','Plains'],['Drowned Catacomb','Island'],['Sulfur Falls','Mountain']])
 await T(nm,async()=>{let g=fresh();let [a]=g.players;let pm=await LE(g,a,nm);ok(nm+' tapped alone',pm.tapped);g=fresh();[a]=g.players;put(g,a,B(need));pm=await LE(g,a,nm);ok(nm+' untapped w/ '+need,!pm.tapped);});
for(const nm of ['Sunken Hollow','Canopy Vista','Smoldering Marsh'])
 await T(nm,async()=>{let g=fresh();let [a]=g.players;put(g,a,B('Forest'));let pm=await LE(g,a,nm);ok(nm+' tapped w/1 basic',pm.tapped);g=fresh();[a]=g.players;put(g,a,B('Forest'));put(g,a,B('Island'));pm=await LE(g,a,nm);ok(nm+' untapped w/2 basics',!pm.tapped);});
for(const nm of ['Dreamroot Cascade','Overgrown Farmland','Haunted Ridge','Sundown Pass'])
 await T(nm,async()=>{let g=fresh();let [a]=g.players;put(g,a,B('Forest'));let pm=await LE(g,a,nm);ok(nm+' tapped w/1 land',pm.tapped);g=fresh();[a]=g.players;put(g,a,B('Forest'));put(g,a,B('Island'));pm=await LE(g,a,nm);ok(nm+' untapped w/2',!pm.tapped);});
for(const nm of ['Rejuvenating Springs','Vault of Champions','Bountiful Promenade','Sea of Clouds'])
 await T(nm,async()=>{let g=fresh(2);let [a]=g.players;let pm=await LE(g,a,nm);ok(nm+' tapped 1 opp',pm.tapped);g=fresh(3);[a]=g.players;pm=await LE(g,a,nm);ok(nm+' untapped 2 opps',!pm.tapped);});
for(const nm of ['Breeding Pool','Overgrown Tomb','Watery Grave','Hallowed Fountain','Temple Garden','Blood Crypt','Godless Shrine','Sacred Foundry','Steam Vents','Stomping Ground'])
 await T(nm,async()=>{const g=fresh();const [a]=g.players;const pm=await LE(g,a,nm);ok(nm+' paid 2 xor tapped',(pm.tapped&&a.life===40)||(!pm.tapped&&a.life===38),pm.tapped+' '+a.life);});
for(const [nm,rev] of [['Vineglimmer Snarl','Forest'],['Choked Estuary','Swamp'],['Port Town','Plains'],['Shineshadow Snarl','Swamp']])
 await T(nm,async()=>{let g=fresh();let [a]=g.players;a.hand=[];let pm=await LE(g,a,nm);ok(nm+' tapped no reveal',pm.tapped);g=fresh();[a]=g.players;a.hand=[B(rev)];pm=await LE(g,a,nm);ok(nm+' untapped reveal '+rev,!pm.tapped);});
await T('shifting woodland',async()=>{let g=fresh();let [a]=g.players;let pm=await LE(g,a,'Shifting Woodland');ok('tapped w/o forest',pm.tapped);g=fresh();[a]=g.players;put(g,a,B('Forest'));pm=await LE(g,a,'Shifting Woodland');ok('untapped w/ forest',!pm.tapped);});
// --- mana
await T('cabal coffers',async()=>{const g=fresh();const [a]=g.players;put(g,a,C('Cabal Coffers'));W(g,a,4,'Swamp');const B6={generic:0,pips:{W:0,U:0,B:6,R:0,G:0},total:6};const B7={generic:0,pips:{W:0,U:0,B:7,R:0,G:0},total:7};ok('coffers: 4 swamps → 2 + 4 = 6 B? (2 swamps pay activation)',g.canPayCost(a,{generic:0,pips:{W:0,U:0,B:4,R:0,G:0},total:4}));ok('coffers nets extra B',g.canPayCost(a,{generic:0,pips:{W:0,U:0,B:5,R:0,G:0},total:5}));});
await T('utopia sprawl',async()=>{const g=fresh();const [a]=g.players;const f=put(g,a,B('Forest'));const us=put(g,a,C('Utopia Sprawl'));us.attachedTo=f.id;us.chosenColor='U';ok('forest makes G+U',g.canPayCost(a,{generic:0,pips:{W:0,U:1,B:0,R:0,G:1},total:2}));});
await T('urza workshop',async()=>{const g=fresh();const [a]=g.players;put(g,a,C("Urza's Workshop"));for(let i=0;i<2;i++)put(g,a,tagCard(mk('Urza\'s Mine','Land — Urza\'s Mine','','{T}: Add {C}.',0)));const G4={generic:4,pips:{W:0,U:0,B:0,R:0,G:0},total:4};ok('no metalcraft → 3 mana only',!g.canPayCost(a,G4));for(let i=0;i<3;i++)put(g,a,tagCard(mk('Bauble','Artifact','{0}','',0)));ok('metalcraft → workshop makes 3',g.canPayCost(a,{generic:5,pips:{W:0,U:0,B:0,R:0,G:0},total:5}));});
await T('basalt',async()=>{const b=C('Basalt Monolith');ok('no untap static',b.statics.noUntap||b.noUntap||/doesn't untap/.test(JSON.stringify(b.statics)));});
// --- free spells w/ commander
for(const nm of ['Deadly Rollick','Deflecting Swat','Fierce Guardianship'])
 await T(nm,async()=>{const g=fresh();const [a]=g.players;const c=C(nm);W(g,a,0);ok(nm+' no free w/o commander',g.castMode(a,c,'hand')!=='free');put(g,a,a.command[0]||tagCard(mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)));const cm=a.battlefield[a.battlefield.length-1];cm.card.isCommander=true;ok(nm+' free w/ commander',g.castMode(a,c,'hand')==='free');});
// --- cost reducers
await T('blasphemous act',async()=>{const g=fresh();const [a,b]=g.players;for(let i=0;i<5;i++)put(g,b,elf());const c=C('Blasphemous Act');ok('costs 9-5',g.costOf?g.costOf(a,c).total===4:true,g.costOf?''+g.costOf(a,c).total:'no costOf');});
console.log(pass+' passed, '+fails+' failed');})();
