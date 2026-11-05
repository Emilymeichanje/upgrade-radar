require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
const C=n=>{const a=R.find(x=>x[1]===n);if(!a)throw new Error('no '+n);return tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const TOP=()=>tagCard(mk("Sensei's Divining Top",'Artifact','{1}',"{1}: Look at the top three cards of your library, then put them back in any order.\n{T}: Draw a card, then put Sensei's Divining Top on top of its owner's library.",1));
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Island','Basic Land — Island','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:deck(),ai:new AI('expert')})),{seed:5,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=6;return g};
const tick=async g=>{await g.emit({type:'tick'});await g.flushPending?.();await g.emit({type:'tick'})};let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
const srcOf=(g,p,b)=>g.manaSrcs(p).find(s=>s.b===b);
(async()=>{
 // 1) Forsaken Monument + Basalt Monolith: 3 + 1 = 4 colorless per tap, untap costs 3 → +1 per loop
 { const g=fresh();const [a]=g.players;const mono=await g.enterPerm(a,C('Basalt Monolith'));mono.summoning=false;
   ok('Monolith alone taps for 3',(srcOf(g,a,mono)||{}).amount===3,JSON.stringify(srcOf(g,a,mono)&&srcOf(g,a,mono).amount));
   await g.enterPerm(a,C('Forsaken Monument'));await tick(g);
   ok('Monument: Monolith taps for 4',(srcOf(g,a,mono)||{}).amount===4,JSON.stringify(srcOf(g,a,mono)&&srcOf(g,a,mono).amount));
   const w=await g.enterPerm(a,tagCard(mk('Wastes','Basic Land','','{T}: Add {C}.',0)));ok('Monument applies to lands tapped for {C} too',(srcOf(g,a,w)||{}).amount===2);
   const isl=a.battlefield.find(b=>b.card.name==='Island')||await g.enterPerm(a,tagCard(mk('Island','Basic Land — Island','','',0)));ok('…but not to an Island tapped for {U}',(srcOf(g,a,isl)||{}).amount===1); }
 // 2) Kinnan + Basalt Monolith: nonland permanent tapped for mana → +1
 { const g=fresh();const [a]=g.players;const mono=await g.enterPerm(a,C('Basalt Monolith'));mono.summoning=false;await g.enterPerm(a,C('Kinnan, Bonder Prodigy'));await tick(g);
   ok('Kinnan: Monolith taps for 4',(srcOf(g,a,mono)||{}).amount===4);
   const isl=await g.enterPerm(a,tagCard(mk('Island','Basic Land — Island','','',0)));ok('Kinnan ignores lands',(srcOf(g,a,isl)||{}).amount===1); }
 // 3) Bolas's Citadel + Top + Aetherflux: cast Top off the top for 1 life, tap to draw + put back, Aetherflux gains 1,2,3…
 { const g=fresh();const [a]=g.players;a.life=10;await g.enterPerm(a,C("Bolas's Citadel"));await g.enterPerm(a,C('Aetherflux Reservoir'));await tick(g);
   a.library.push(TOP());const lifeLog=[];let castOk=0;
   for(let i=0;i<14;i++){const top=a.library[a.library.length-1];if(top.name!=="Sensei's Divining Top")break;const mode=g.castMode(a,top,'top');if(!mode)break;await g.cast(a,top,'top');while(g.stack.length)await g.resolve();await tick(g);castOk++;
     const pm=a.battlefield.find(b=>b.card.name==="Sensei's Divining Top");if(!pm)break;const ab=pm.card.abilities.find(x=>x.tap);await g.activate(a,{card:pm.card,ab,perm:pm});while(g.stack.length)await g.resolve();await tick(g);lifeLog.push(a.life);}
   ok('Top re-cast from the top of library 14 times (1 life each, via Citadel)',castOk===14,'casts='+castOk+' life='+lifeLog.join(','));
   ok('Aetherflux: life climbs (gain n on the n-th spell, pay 1)',a.life===10+14*15/2-14,'life='+a.life);
   const af=a.battlefield.find(b=>b.card.name==='Aetherflux Reservoir');const ab=af.card.abilities.find(x=>x.life===50);const opp=g.players[1];
   ok('Aetherflux 50-damage ability available',g.canUseAbility(a,af.card,ab,af)); }
 // 4) Oath of Teferi + Aminatou + Nicol Bolas, God-Pharaoh: Aminatou −1 twice a turn, each flicker gives a fresh Bolas
 { const g=fresh();const [a,b]=g.players;await g.enterPerm(a,C('Oath of Teferi'));const am=await g.enterPerm(a,C('Aminatou, the Fateshifter'));am.loyalty=5;const BC=C('Nicol Bolas, God-Pharaoh');BC.startLoyalty=7;BC.loyalty=7;let bo=await g.enterPerm(a,BC);bo.loyalty=7;await tick(g);
   const minus4=x=>x.card.abilities.find(y=>y.label==='−4');const amM1=am.card.abilities.find(y=>y.label==='−1');
   const L0=b.life;let acts=0;
   for(let k=0;k<3;k++){bo=a.battlefield.find(x=>x.card.name==='Nicol Bolas, God-Pharaoh');if(!bo)break;if(g.canUseAbility(a,bo.card,minus4(bo),bo)){await g.activate(a,{card:bo.card,ab:minus4(bo),perm:bo,target:b});while(g.stack.length)await g.resolve();await tick(g);acts++;}
     if(k<2){bo=a.battlefield.find(x=>x.card.name==='Nicol Bolas, God-Pharaoh');const can=g.canUseAbility(a,am.card,amM1,am);if(!can)break;await g.activate(a,{card:am.card,ab:amM1,perm:am,target:bo});while(g.stack.length)await g.resolve();await tick(g);}}
   const bo2=a.battlefield.find(x=>x.card.name==='Nicol Bolas, God-Pharaoh');
   ok('three Bolas −4 activations in one turn (Oath lets Aminatou −1 twice)',acts===3,'acts='+acts+' log='+g.log.slice(-6).map(l=>l.m).join(' | '));
   ok('Aminatou can’t −1 a third time',!g.canUseAbility(a,am.card,amM1,am));
   ok('a flickered Bolas returns with fresh loyalty',bo2&&bo2.loyalty===3,'loyalty='+(bo2&&bo2.loyalty)); }
 // 5) Aragorn, the Uniter: your multicolored spells trigger each colour; opponents' spells don't
 { const g=fresh();const [a,b]=g.players;await g.enterPerm(a,C('Aragorn, the Uniter'));await tick(g);
   const wu=tagCard(mk('Azorius Charm','Instant','{W}{U}','Draw a card.',2));a.hand.push(wu);a.pool=[{c:'W'},{c:'U'}];const t0=a.battlefield.filter(x=>x.card.token).length;
   await g.cast(a,wu,'hand');while(g.stack.length)await g.resolve();await tick(g);
   const lg=g.log.map(l=>l.m).join(' | ');ok('W/U spell → Soldier token (white)',a.battlefield.filter(x=>x.card.token).length===t0+1,lg.slice(-300));ok('W/U spell → scry 2 (blue)',/scry/i.test(lg));
   const rg=tagCard(mk('Rg','Instant','{R}{G}','Draw a card.',2));a.hand.push(rg);a.pool=[{c:'R'},{c:'G'}];const L=g.players.slice(1).map(q=>q.life);await g.cast(a,rg,'hand');while(g.stack.length)await g.resolve();await tick(g);
   ok('R/G spell → 3 damage to an opponent (red)',g.players.slice(1).some((q,i)=>q.life===L[i]-3),JSON.stringify(g.players.map(q=>q.life)));
   ok('R/G spell → +4/+4 (green)',/\+4\/\+4|gets \+4/.test(g.log.slice(-6).map(l=>l.m).join(' ')),g.log.slice(-6).map(l=>l.m).join(' | '));
   const n0=a.battlefield.filter(x=>x.card.token).length;const ow=tagCard(mk('OppW','Instant','{W}','Draw a card.',1));b.hand.push(ow);b.pool=[{c:'W'}];g.active=1;await g.cast(b,ow,'hand');while(g.stack.length)await g.resolve();await tick(g);
   ok("opponent's white spell does not trigger Aragorn",a.battlefield.filter(x=>x.card.token).length===n0); }

 // ===== infinite detection / declaration =====
 { const g=fresh();const [a]=g.players;const mono=await g.enterPerm(a,C('Basalt Monolith'));mono.summoning=false;const kin=await g.enterPerm(a,C('Kinnan, Bonder Prodigy'));kin.summoning=false;await tick(g);
   const cs=g.availableCombos(a);const m=cs.find(c=>c.kind==='mana');
   ok('Kinnan + Monolith detected as infinite colorless mana, ready',m&&m.ready&&m.colors.join()==='C'&&m.pieces.includes('Kinnan, Bonder Prodigy'),JSON.stringify(cs));
   mono.tapped=true;ok('tapped Monolith with no other mana: not ready',!(g.availableCombos(a).find(c=>c.kind==='mana')||{}).ready);mono.tapped=false;
   await g.declareCombo(a,m.id);ok('declared: 50 generic is payable',g.canPayCost(a,{generic:50,pips:{W:0,U:0,B:0,R:0,G:0},total:50}));
   const dig=kin.card.abilities.find(x=>x.label==='dig');ok("…but Kinnan's {5}{G}{U} is not (colorless only, no converter)",!g.canPayCost(a,dig.cost));
   const f=await g.enterPerm(a,tagCard(mk('Forest','Basic Land — Forest','','',0)));const i=await g.enterPerm(a,tagCard(mk('Island','Basic Land — Island','','',0)));
   ok('with a Forest and an Island untapped, Kinnan’s ability is payable once',g.canPayCost(a,dig.cost));
   g.payCost(a,dig.cost);ok('lands spent, colorless still infinite: not payable again',!g.canPayCost(a,dig.cost)&&g.canPayCost(a,{generic:30,pips:{W:0,U:0,B:0,R:0,G:0},total:30}));
   const orr=await g.enterPerm(a,tagCard(mk('Chromatic Orrery','Legendary Artifact','{7}','You may spend mana as though it were mana of any color.\n{T}: Add {C}{C}{C}{C}{C}{C}{C}.\n{5}, {T}: Draw a card for each color among permanents you control.',7)));await tick(g);
   a.infMana=null;const m2=g.availableCombos(a).find(c=>c.kind==='mana');await g.declareCombo(a,m2.id);
   ok('with Chromatic Orrery the loop is infinite mana of any color → Kinnan spammable',g.canPayCost(a,dig.cost)&&(g.payCost(a,dig.cost),g.canPayCost(a,dig.cost)),JSON.stringify(m2&&m2.colors));
   g.turn++;ok('infinite mana ends with the turn',!g.canPayCost(a,{generic:30,pips:{W:0,U:0,B:0,R:0,G:0},total:30})); }
 { const g=fresh();const [a]=g.players;a.life=10;await g.enterPerm(a,C("Bolas's Citadel"));await g.enterPerm(a,C('Aetherflux Reservoir'));a.library.push(TOP());await tick(g);
   const c=g.availableCombos(a).find(x=>x.id==='citadelTop');ok('Citadel + Top + Aetherflux detected',c&&c.ready);
   await g.declareCombo(a,'citadelTop');await tick(g);
   ok('declaring it runs the real loop and kills every opponent',g.opponentsOf(a).length===0&&g.players.slice(1).every(q=>q.dead),g.log.slice(-6).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;Goldfish.setCombos([['Exquisite Blood','Sanguine Bond',0,'Infinite lifeloss + Infinite lifegain','1-2','R'],['Peregrine Drake','Deadeye Navigator',0,'Infinite mana + Infinite ETB','3-4','R']]);
   await g.enterPerm(a,tagCard(mk('Exquisite Blood','Enchantment','{4}{B}','Whenever an opponent loses life, you gain that much life.',5)));
   ok('one piece only: nothing offered',!g.availableCombos(a).some(c=>c.source));
   await g.enterPerm(a,tagCard(mk('Sanguine Bond','Enchantment','{3}{B}{B}','Whenever you gain life, target opponent loses that much life.',5)));
   const w=g.availableCombos(a).find(c=>c.source);ok('Spellbook combo found and classed as a win',w&&w.kind==='win',JSON.stringify(w));
   await g.declareCombo(a,w.id);ok('declared → opponents out',g.players.slice(1).every(q=>q.dead));Goldfish.setCombos([]); }
 { const g=fresh();const [a,b]=g.players;b.life=40;await g.enterPerm(b,C("Bolas's Citadel"));await g.enterPerm(b,C('Aetherflux Reservoir'));b.library.push(TOP());await tick(g);g.active=1;
   await b.ai.mainPhase(g,b,false);ok('the AI declares its own combo and wins',g.players.filter(q=>q!==b).every(q=>q.dead),g.log.slice(-4).map(l=>l.m).join(' | ')); }
 console.log(fails+' failed');})();
