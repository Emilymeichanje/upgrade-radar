require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;
const mk=(name,type,mana,oracle,cmc,p,t,extra={})=>({name,type,mana,oracle,cmc,power:p,toughness:t,...extra});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Swamp','Basic Land — Swamp','','',0)).concat([...Array(39)].map(()=>mk('Bear','Creature — Bear','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const L=(n)=>mk(n,'Basic Land — '+n,'','',0);
let fails=0;const ok=(name,cond,extra='')=>{console.log((cond?'PASS ':'FAIL ')+name+(extra?' — '+extra:''));if(!cond)fails++;};
function fresh(n=3){const seats=[...Array(n)].map((_,i)=>({name:'P'+i,deck:deck(),ai:new AI('focused')}));const g=new Game(seats,{seed:7,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=3;return g;}
const put=(g,p,card,opt={})=>{const pm={id:Math.random(),card:card.uid?card:tagCard(card),tapped:false,summoning:false,counters:0,...opt};if(pm.card.isPlaneswalker)pm.loyalty=pm.card.startLoyalty;p.battlefield.push(pm);return pm};
const lands=(g,p,names)=>names.forEach(n=>put(g,p,L(n)));
const last=(g,k=4)=>g.log.slice(-k).map(l=>l.m).join(' | ');
const C={
 signet:mk('Dimir Signet','Artifact','{2}','{1}, {T}: Add {U}{B}.',2),
 tithe:mk('Smothering Tithe','Enchantment','{3}{W}','Whenever an opponent draws a card, that player may pay {2}. If the player doesn\'t, you create a Treasure token.',4),
 rhystic:mk('Rhystic Study','Enchantment','{2}{U}','Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.',3),
 sentinel:mk('Esper Sentinel','Artifact Creature — Human Soldier','{W}','Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is Esper Sentinel\'s power.',1,1,1),
 urborg:mk('Urborg, Tomb of Yawgmoth','Legendary Land','','Each land is a Swamp in addition to its other land types.',0),
 lantern:mk('Chromatic Lantern','Artifact','{3}','Lands you control have "{T}: Add one mana of any color."\n{T}: Add one mana of any color.',3),
 aqueduct:mk('Dimir Aqueduct','Land','','This land enters tapped.\nWhen this land enters, return a land you control to its owner\'s hand.\n{T}: Add {U}{B}.',0),
 battle:mk('Prairie Stream','Land — Plains Island','','({T}: Add {W} or {U}.)\nThis land enters tapped unless you control two or more basic lands.',0),
 season:mk('Doubling Season','Enchantment','{4}{G}','If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.',5),
 raise:mk('Raise the Alarm','Instant','{1}{W}','Create two 1/1 white Soldier creature tokens.',2),
 bigScore:mk('Big Score','Instant','{3}{R}','As an additional cost to cast this spell, discard a card.\nDraw two cards and create two Treasure tokens.',4),
 seedborn:mk('Seedborn Muse','Creature — Spirit','{3}{G}{G}','Untap all permanents you control during each other player\'s untap step.',5,2,4),
 vault:mk('Mana Vault','Artifact','{1}','Mana Vault doesn\'t untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap Mana Vault.\n{T}: Add {C}{C}{C}.',1),
 abolisher:mk('Grand Abolisher','Creature — Human Cleric','{W}{W}','During your turn, your opponents can\'t cast spells or activate abilities of artifacts, creatures, or enchantments.',2,2,2),
 cruise:mk('Treasure Cruise','Sorcery','{7}{U}','Delve\nDraw three cards.',8),
 rites:mk('Village Rites','Instant','{B}','As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards.',1),
 command:mk('Prismari Command','Instant','{1}{U}{R}','Choose two —\n• Prismari Command deals 2 damage to any target.\n• Target player draws two cards, then discards two cards.\n• Target player creates a Treasure token.\n• Destroy target artifact.',3),
 jace:mk('Jace, Test Mage','Legendary Planeswalker — Jace','{2}{U}{U}','+1: Draw a card.\n−3: Return target creature to its owner\'s hand.',4,null,null,{loyalty:'3'}),
 clone:mk('Clone','Creature — Shapeshifter','{3}{U}','You may have this creature enter as a copy of any creature on the battlefield.',4,0,0),
 mutation:mk('Darksteel Mutation','Enchantment — Aura','{1}{W}','Enchant creature\nEnchanted creature is an Insect artifact creature with base power and toughness 0/1 and has indestructible, and it loses all other abilities, card types, and creature types.',2),
 rancor:mk('Rancor','Enchantment — Aura','{G}','Enchant creature\nEnchanted creature gets +2/+0 and has trample.',1),
 mdfc:mk('Shatterskull Smashing // Shatterskull, the Hammer Pass','Sorcery // Land','{X}{R}{R}','Shatterskull Smashing deals X damage divided as you choose among up to two target creatures and/or planeswalkers.\n//\nAs Shatterskull, the Hammer Pass enters, you may pay 3 life. If you don\'t, it enters tapped.\n{T}: Add {R}.',2),
 bond:mk('Sanguine Bond','Enchantment','{3}{B}{B}','Whenever you gain life, target opponent loses that much life.',5),
 blood:mk('Exquisite Blood','Enchantment','{4}{B}','Whenever an opponent loses life, you gain that much life.',5),
 wheel:mk('Wheel of Fortune','Sorcery','{2}{R}','Each player discards their hand, then draws seven cards.',3),
 labman:mk('Laboratory Maniac','Creature — Human Wizard','{2}{U}','If you would draw a card while your library has no cards in it, you win the game instead.',3,2,2),
 dragon:mk('Big Dragon','Creature — Dragon','{4}{R}{R}','Flying',6,6,6),
 pain:mk('Ancient Tomb','Land','','{T}: Add {C}{C}. This land deals 2 damage to you.',0),
 prison:mk('Ghostly Prison','Enchantment','{2}{W}','Creatures can\'t attack you unless their controller pays {2} for each creature they control that\'s attacking you.',3),
};
(async()=>{
 // 1. Signet nets one mana
 { const g=fresh();const [a]=g.players;lands(g,a,['Island']);put(g,a,C.signet);ok('signet adds net 1',g.availableMana(a)===2,'mana '+g.availableMana(a)); }
 // 2. Urborg makes Forest tap for B; Lantern gives any colour
 { const g=fresh();const [a]=g.players;put(g,a,L('Forest'));put(g,a,C.urborg);const cost={generic:0,pips:{W:0,U:0,B:2,R:0,G:0},total:2};ok('urborg grants black',g.canPayCost(a,cost));
   const g2=fresh();const [b]=g2.players;put(g2,b,L('Forest'));put(g2,b,C.lantern);ok('lantern: forest pays U',g2.canPayCost(b,{generic:0,pips:{W:0,U:2,B:0,R:0,G:0},total:2})); }
 // 3. Bounce land returns a land
 { const g=fresh();const [a]=g.players;lands(g,a,['Island','Swamp']);const aq=tagCard(C.aqueduct);a.hand.push(aq);a.landsThisTurn=0;await g.playLand(a,aq);ok('aqueduct bounces a land',a.battlefield.filter(b=>b.card.isLand).length===2&&a.hand.some(c=>c.isLand),last(g,1)); }
 // 4. Battle land: tapped with <2 basics, untapped with 2
 { const g=fresh();const [a]=g.players;lands(g,a,['Plains']);const bl=tagCard(C.battle);const [pm]=await g.landEnters(a,bl);lands(g,a,['Island']);const [pm2]=await g.landEnters(a,tagCard(C.battle));ok('battle land conditions',pm.tapped&&!pm2.tapped); }
 // 5. Doubling Season: tokens and counters; Big Score treasures + additional discard cost
 { const g=fresh();const [a]=g.players;lands(g,a,['Plains','Plains','Mountain','Mountain','Mountain','Mountain']);put(g,a,C.season);const ra=tagCard(C.raise);a.hand.push(ra);await g.cast(a,ra);
   ok('season doubles creature tokens',a.battlefield.filter(b=>b.card.isCreature&&b.card.token).length===4);
   const bs=tagCard(C.bigScore);a.hand.push(bs,tagCard(L('Swamp')));for(const b of a.battlefield)b.tapped=false;const hb=a.hand.length;await g.cast(a,bs);const tr=a.battlefield.filter(b=>b.card.name==='Treasure').length;
   ok('big score: 4 treasures (doubled), discard cost paid',tr===4&&a.graveyard.length>=2,`treasures ${tr} gy ${a.graveyard.map(c=>c.name)}`);
   const m0=g.availableMana(a);ok('treasures are mana',m0>=4,'mana '+m0);
   const x={generic:5,pips:{W:0,U:0,B:0,R:0,G:0},total:5};for(const b of a.battlefield)b.tapped=false;g.payCost(a,x);ok('lands used before treasures',a.battlefield.filter(b=>b.card.name==='Treasure').length===4,'left '+a.battlefield.filter(b=>b.card.name==='Treasure').length); }
 // 6. Rhystic Study: opponent who can't pay -> draw
 { const g=fresh();const [a,b]=g.players;put(g,b,C.rhystic);lands(g,a,['Forest','Forest']);const bear=a.library.find(c=>c.name==='Bear');a.library.splice(a.library.indexOf(bear),1);a.hand.push(bear);const hb=b.hand.length;await g.cast(a,bear);ok('rhystic draws when tax unpaid',b.hand.length===hb+1,last(g,3)); }
 // 7. Rhystic with spare mana: AI pays
 { const g=fresh();const [a,b]=g.players;put(g,b,C.rhystic);lands(g,a,['Forest','Forest','Forest','Forest']);g.active=1;g.phase='end';const bear=a.library.find(c=>c.name==='Bear');a.library.splice(a.library.indexOf(bear),1);a.hand.push(bear);bear.flash=true;const hb=b.hand.length;await g.cast(a,bear,'hand',null,{instant:true});ok('rhystic tax paid off-turn with spare mana',b.hand.length===hb,last(g,3)); }
 // 8. Smothering Tithe on draw
 { const g=fresh();const [a,b]=g.players;put(g,b,C.tithe);await g.draw(a,1);ok('tithe makes a treasure',b.battlefield.some(x=>x.card.name==='Treasure'),last(g,2)); }
 // 9. Esper Sentinel first noncreature spell
 { const g=fresh();const [a,b]=g.players;put(g,b,C.sentinel);lands(g,a,['Island','Island','Island']);const s=tagCard(C.signet);a.hand.push(s);const hb=b.hand.length;g.phase='main1';await g.cast(a,s);ok('esper sentinel trigger/tax',b.hand.length===hb+1||/pays \{1\}/.test(last(g,4)),last(g,3)); }
 // 10. Seedborn untaps on other turns; Mana Vault stays tapped
 { const g=fresh();const [a,b]=g.players;const sm=put(g,a,C.seedborn);const f=put(g,a,L('Forest'));f.tapped=true;const mv=put(g,b,C.vault);mv.tapped=true;await g.beginTurn(b);ok('seedborn untaps on opponent turn',!f.tapped);ok('mana vault does not untap',mv.tapped); }
 // 11. Grand Abolisher locks opponents on its controller's turn
 { const g=fresh();const [a,b]=g.players;put(g,a,C.abolisher);lands(g,b,['Island','Island']);const o=tagCard(mk('Opt','Instant','{U}','Scry 1.\nDraw a card.',1));b.hand.push(o);g.active=0;ok('abolisher lock',!g.castMode(b,o,'hand',{instant:true}));g.active=1;g.phase='main1';ok('can cast on own turn',!!g.castMode(b,o,'hand')); }
 // 12. Delve
 { const g=fresh();const [a]=g.players;lands(g,a,['Island','Island']);for(let k=0;k<6;k++)a.graveyard.push(tagCard(L('Swamp')));const tc=tagCard(C.cruise);a.hand.push(tc);ok('delve makes cruise castable',!!g.castMode(a,tc));const hb=a.hand.length;await g.cast(a,tc);ok('delve exiles and draws',a.exile.length===6&&a.hand.length===hb+2,`exile ${a.exile.length} hand ${a.hand.length-hb}`); }
 // 13. Village Rites sacrifice cost
 { const g=fresh();const [a]=g.players;lands(g,a,['Swamp']);const vr=tagCard(C.rites);a.hand.push(vr);ok('rites needs a creature',!g.castMode(a,vr));put(g,a,mk('Bear','Creature — Bear','{1}{G}','',2,2,2));ok('rites castable with creature',!!g.castMode(a,vr));const hb=a.hand.length;await g.cast(a,vr);ok('rites sacrificed and drew',!a.battlefield.some(b=>b.card.isCreature)&&a.hand.length===hb+1,last(g,3)); }
 // 14. Modal: Prismari Command picks two modes
 { const g=fresh();const [a,b]=g.players;lands(g,a,['Island','Mountain','Mountain']);put(g,b,mk('Bird','Creature — Bird','{U}','Flying',1,1,1));const pc=tagCard(C.command);ok('modes parsed',pc.modes&&pc.modes.length===4,pc.modes&&pc.modes.map(m=>m.text).join(' / '));a.hand.push(pc);await g.cast(a,pc);ok('command resolves two modes',/Prismari Command: .+ \+ /.test(g.log.map(l=>l.m).join('\n')),last(g,5)); }
 // 15. Planeswalker loyalty once per turn
 { const g=fresh();const [a]=g.players;const j=put(g,a,C.jace);ok('loyalty from card',j.loyalty===3);const opts=g.abilityOptions(a);const plus=opts.find(o=>o.ab.loyalty===1);ok('plus ability available',!!plus);await g.activate(a,plus);ok('loyalty went up',j.loyalty===4);ok('only once per turn',!g.abilityOptions(a).some(o=>o.ab.loyalty!=null)); }
 // 16. Clone copies the best creature
 { const g=fresh();const [a,b]=g.players;put(g,b,C.dragon);lands(g,a,['Island','Island','Island','Island']);const cl=tagCard(C.clone);a.hand.push(cl);await g.cast(a,cl);const pm=a.battlefield.find(x=>x.card.orig&&x.card.orig.name==='Clone');ok('clone copied dragon',pm&&pm.card.name==='Big Dragon'&&g.powerOf(a,pm)===6);await g.destroy(a,pm);ok('clone goes to graveyard as Clone',a.graveyard.some(c=>c.name==='Clone')); }
 // 17. Darksteel Mutation neutralises; Rancor buffs
 { const g=fresh();const [a,b]=g.players;const d=put(g,b,C.dragon);d.owner=1;lands(g,a,['Plains','Plains','Forest']);const dm=tagCard(C.mutation);ok('mutation counts as removal',dm.roles.includes('removal'));a.hand.push(dm);await g.cast(a,dm,'hand',d);g.refreshStatics();ok('dragon neutralised 0/1 no flying',g.powerOf(b,d)===0&&!d.card.kw.includes('flying')&&b.battlefield.includes(d),`p ${g.powerOf(b,d)} kw ${d.card.kw}`);
   const bear=put(g,a,mk('Bear','Creature — Bear','{1}{G}','',2,2,2));const r=tagCard(C.rancor);a.hand.push(r);await g.cast(a,r);g.refreshStatics();ok('rancor +2 trample',g.powerOf(a,bear)===4&&bear.card.kw.includes('trample'),`p ${g.powerOf(a,bear)}`);
   await g.destroy(a,bear);g.refreshStatics();ok('aura falls off to graveyard',a.graveyard.some(c=>c.name==='Rancor')); }
 // 18. MDFC land back
 { const g=fresh();const [a]=g.players;const md=tagCard(C.mdfc);ok('mdfc has land back',!!md.backLand&&md.backLand.produces.includes('R'));a.hand=[md];a.landsThisTurn=0;const land=a.ai.chooseLand(a,g);ok('AI plays MDFC as land when no lands',land===md);await g.playLand(a,md);const pm=a.battlefield.find(b=>b.card.isLand);ok('land face on battlefield',pm&&pm.card.produces.includes('R'),pm&&pm.card.name); }
 // 19. Sanguine Bond + Exquisite Blood loop kills
 { const g=fresh(2);const [a,b]=g.players;put(g,a,C.bond);put(g,a,C.blood);await g.changeLife(a,1,null);ok('bond+blood loop wins',b.dead,`opp life ${b.life}`); }
 // 20. Wheel
 { const g=fresh();const [a,b]=g.players;lands(g,a,['Mountain','Mountain','Mountain']);a.hand=[tagCard(C.wheel)];b.hand=[];await g.cast(a,a.hand[0]);ok('wheel: everyone has 7',a.hand.length===7&&b.hand.length===7); }
 // 21. Lab Man
 { const g=fresh(2);const [a,b]=g.players;put(g,a,C.labman);a.library=[];await g.draw(a,1);ok('lab man wins',b.dead&&!a.dead); }
 // 22. Ancient Tomb hurts
 { const g=fresh();const [a]=g.players;put(g,a,C.pain);const l0=a.life;g.payCost(a,{generic:2,pips:{W:0,U:0,B:0,R:0,G:0},total:2});await g.flushPending();ok('ancient tomb deals 2',a.life===l0-2,`${l0}->${a.life}`); }
 // 23. Ghostly Prison tax
 { const g=fresh();const [a,b]=g.players;put(g,b,C.prison);const bears=[0,1,2].map(()=>put(g,a,mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));lands(g,a,['Forest','Forest']);await g.combatPhase(a,bears.map(x=>({attacker:x,defender:b})));ok('prison lets only one bear through',b.life===38,`life ${b.life}`); }
 console.log(fails?fails+' FAILED':'ALL PASS');
})().catch(e=>{console.log('CRASH',e.stack);});
