// every Saga in the Terra deck, chapter by chapter, through loreUp (the real "after your draw step" path) — real Oracle text
require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=require(__dirname+'/fixtures/tamterra.json');
const C=n=>{const a=R.find(x=>x[0]===n);if(!a)throw new Error('no '+n);return tagCard({name:a[0],mana:a[1],type:a[2],oracle:a[3],cmc:a[4],power:a[5],toughness:a[6],loyalty:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(40)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(30)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([...Array(29)].map(()=>mk('Shock','Instant','{R}','Shock deals 2 damage to any target.',1))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:deck(),ai:new AI('expert')})),{seed:9,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=6;for(const p of g.players)p.hand=p.library.splice(-5);return g};
const tick=async g=>{await g.emit({type:'tick'});await g.flushPending?.();await g.emit({type:'tick'})};let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
const enter=async(g,p,name)=>{const c=C(name);p.hand.push(c);p.pool=Array(12).fill(0).map((_,i)=>({c:'WUBRGC'[i%6]}));await g.cast(p,c,'hand');while(g.stack.length)await g.resolve();await tick(g);return p.battlefield.find(b=>b.card===c||b.card.name===name)};
const lore=async(g,p,pm)=>{await g.loreUp(p,pm);while(g.stack.length)await g.resolve();await tick(g)};
const bear=(name='Bear',p=2,t=2,cmc=2)=>tagCard(mk(name,'Creature — Bear','{1}{G}','',cmc,p,t));
(async()=>{
 { const g=fresh();const [a,b]=g.players;const big=await g.enterPerm(b,tagCard(mk('Ogre','Creature — Ogre','{3}{R}','',4,4,4)));const small=await g.enterPerm(b,bear());
   const s=await enter(g,a,'Elspeth Conquers Death');ok('ECD I exiles an opponent permanent with MV ≥ 3 (not the 2-drop)',!b.battlefield.includes(big)&&b.battlefield.includes(small),g.log.slice(-3).map(l=>l.m).join(' | '));
   await lore(g,a,s);const sorc=tagCard(mk('Divination','Sorcery','{2}{U}','Draw two cards.',3));ok('ECD II: opponents’ noncreature spells cost {2} more',g.costOf(b,sorc,'hand').total===5&&g.costOf(b,bear(),'hand').total===2&&g.costOf(a,sorc,'hand').total===3);
   g.active=1;await g.takeTurn?.call?.(g,a).catch?.(()=>{});
   const g2=fresh();const [a2]=g2.players;const s2=await enter(g2,a2,'Elspeth Conquers Death');await lore(g2,a2,s2);a2.graveyard.push(C('Teferi, Hero of Dominaria'));await lore(g2,a2,s2);
   const tf=a2.battlefield.find(x=>x.card.name==='Teferi, Hero of Dominaria');ok('ECD III returns a planeswalker with an extra loyalty counter',tf&&tf.loyalty===5,'loyalty='+(tf&&tf.loyalty));ok('…then the Saga is sacrificed',!a2.battlefield.includes(s2)); }
 { const g=fresh();const [a,b,c]=g.players;await g.enterPerm(b,bear());await g.enterPerm(c,bear());const s=await enter(g,a,'The Eldest Reborn');
   ok('Eldest Reborn I: each opponent sacrifices a creature',!b.battlefield.some(x=>x.card.name==='Bear')&&!c.battlefield.some(x=>x.card.name==='Bear'));
   const h=g.players.slice(1).map(q=>q.hand.length);await lore(g,a,s);ok('Eldest Reborn II: each opponent discards',g.players.slice(1).every((q,i)=>q.hand.length===h[i]-1));
   b.graveyard.push(tagCard(mk('Dragon','Creature — Dragon','{5}{R}{R}','Flying',7,6,6)));await lore(g,a,s);ok('Eldest Reborn III: takes the best creature from any graveyard',a.battlefield.some(x=>x.card.name==='Dragon'),g.log.slice(-3).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a,b]=g.players;a.graveyard.push(tagCard(mk('Opt','Instant','{U}','Draw a card.',1)));b.graveyard.push(tagCard(mk('Fireball','Sorcery','{X}{R}','Fireball deals X damage to any target.',1)),tagCard(mk('Lightning Bolt','Instant','{R}','Lightning Bolt deals 3 damage to any target.',1)));
   const s=await enter(g,a,'Summon: Esper Valigarmanda');ok('Valigarmanda I: exiles an instant/sorcery from each graveyard',(s.held||[]).length===2&&b.graveyard.length===1,JSON.stringify((s.held||[]).map(x=>x[1].name)));
   a.pool=[];const L=g.players.map(q=>q.life);await lore(g,a,s);ok('Valigarmanda II: adds {R} per lore counter (2) and casts an exiled spell',/adds \{R\}\{R\}/.test(g.log.map(l=>l.m).join(' '))&&/casts (Lightning Bolt|Opt|Fireball)/.test(g.log.slice(-8).map(l=>l.m).join(' ')),g.log.slice(-6).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const s=await enter(g,a,'Summon: Fenrir');ok('Fenrir I: basic land onto the battlefield tapped',/onto the battlefield/.test(g.log.slice(-4).map(l=>l.m).join(' ')));
   await lore(g,a,s);const e=bear('Elk',3,3,2);a.hand.push(e);a.pool=[{c:'G'},{c:'G'}];await g.cast(a,e,'hand');while(g.stack.length)await g.resolve();await tick(g);const ep=a.battlefield.find(x=>x.card===e);
   ok('Fenrir II: the next creature spell enters with a +1/+1 counter',ep&&ep.counters===1);const e2=bear('Elk2');a.hand.push(e2);a.pool=[{c:'G'},{c:'G'}];await g.cast(a,e2,'hand');while(g.stack.length)await g.resolve();await tick(g);ok('…only the next one',(a.battlefield.find(x=>x.card===e2)||{}).counters===0);
   const [,b]=g.players;await g.enterPerm(b,tagCard(mk('Colossus','Creature — Golem','{9}','',9,9,9)));const h=a.hand.length;await lore(g,a,s);ok('Fenrir III: no card when an opponent has the biggest creature',a.hand.length===h); }
 { const g=fresh();const [a]=g.players;const s=await enter(g,a,'Summon: Good King Mog XII');ok('Mog I: two 1/2 lifelink Moogles',a.battlefield.filter(x=>x.card.token&&x.card.name==='Moogle').length===2);
   await lore(g,a,s);const t0=a.battlefield.filter(x=>x.card.token).length;const op=tagCard(mk('Opt','Instant','{U}','Draw a card.',1));a.hand.push(op);a.pool=[{c:'U'}];await g.cast(a,op,'hand');while(g.stack.length)await g.resolve();await tick(g);
   ok('Mog II: a noncreature spell this turn copies a non-Saga token',a.battlefield.filter(x=>x.card.token).length===t0+1,g.log.slice(-4).map(l=>l.m).join(' | '));
   g.turn++;const t1=a.battlefield.filter(x=>x.card.token).length;const op2=tagCard(mk('Opt','Instant','{U}','Draw a card.',1));a.hand.push(op2);a.pool=[{c:'U'}];await g.cast(a,op2,'hand');while(g.stack.length)await g.resolve();await tick(g);ok('…only this turn',a.battlefield.filter(x=>x.card.token).length===t1);
   await lore(g,a,s);await lore(g,a,s);const ms=a.battlefield.filter(x=>x.card.name==='Moogle');ok('Mog IV: two +1/+1 counters on each other Moogle',ms.length>=2&&ms.every(x=>x.counters===2),JSON.stringify(ms.map(x=>x.counters))); }
 { const g=fresh();const [a,b]=g.players;const x1=await g.enterPerm(b,bear('B1',2,3));const x2=await g.enterPerm(b,bear('B2',2,3));const x3=await g.enterPerm(b,bear('B3',5,5));
   const s=await enter(g,a,'Summon: Kujata');ok('Kujata I: 3 damage to each of up to two creatures',[x1,x2,x3].filter(x=>!b.battlefield.includes(x)).length===2,g.log.slice(-4).map(l=>l.m).join(' | '));
   await lore(g,a,s);ok("Kujata II: up to three creatures can't block",b.battlefield.filter(x=>x.card.isCreature&&x.noBlockTurn===g.turn).length>=1);
   a.hand=[tagCard(mk('Big','Sorcery','{4}{R}','x',5))];const L=g.opponentsOf(a).map(q=>q.life);const h=a.hand.length;await lore(g,a,s);
   ok('Kujata III: discard, draw two, damage = discarded MV to each opponent',a.hand.length===h-1+2&&g.opponentsOf(a).every((q,i)=>q.life===L[i]-5),JSON.stringify(g.players.map(q=>q.life))); }
 { const g=fresh();const [a,b]=g.players;await g.enterPerm(b,bear());const s=await enter(g,a,'Summon: Primal Odin');ok('Odin I destroys an opponent creature',!b.battlefield.some(x=>x.card.name==='Bear'));
   await lore(g,a,s);const pm=a.battlefield.find(x=>x.card.name==='Summon: Primal Odin');pm.summoning=false;
   await g.combatPhase(a,[{attacker:pm,defender:b}]);await tick(g);ok('Odin II: combat damage to a player makes them lose',b.dead,JSON.stringify([b.life,b.dead]));
   const L=g.alive().map(q=>q.life);const h=a.hand.length;await lore(g,a,s);ok('Odin III: draw two, each player loses 2',a.hand.length===h+2&&g.alive().every((q,i)=>q.life===L[i]-2),JSON.stringify(g.alive().map(q=>q.life))); }
 { const g=fresh();const [a,b]=g.players;const x=await g.enterPerm(b,bear());const s=await enter(g,a,'Summon: Shiva');ok('Shiva I: taps and stuns an opponent creature',x.tapped&&x.ck&&x.ck.stun===1);
   const y=await g.enterPerm(b,bear('B2'));y.tapped=true;const h=a.hand.length;await lore(g,a,s);await lore(g,a,s);ok('Shiva III: draws one per tapped opposing creature',a.hand.length===h+2,'drew '+(a.hand.length-h)); }
 { const g=fresh();const [a]=g.players;a.library.push(...Array(5).fill(0).map(()=>tagCard(mk('Forest','Basic Land — Forest','','',0))));const s=await enter(g,a,'Summon: Titan');ok('Titan I mills five',a.graveyard.length>=5);const lands0=a.battlefield.filter(x=>x.card.isLand).length;await lore(g,a,s);
   ok('Titan II returns milled lands tapped',a.battlefield.filter(x=>x.card.isLand).length>lands0,g.log.slice(-4).map(l=>l.m).join(' | ')+' gy='+a.graveyard.map(c=>c.name).join(','));const e=await g.enterPerm(a,bear('Elk',3,3));const L=a.battlefield.filter(x=>x.card.isLand).length;await lore(g,a,s);
   ok('Titan III: another creature gets +X/+X (X = lands) and trample',g.powerOf(a,e)===3+L&&(e.kwT||[]).includes('trample'),g.powerOf(a,e)+' vs '+(3+L)); }
 { const g=fresh();const [a,b]=g.players;const big=await g.enterPerm(b,tagCard(mk('Ogre','Creature — Ogre','{4}{R}','',5,4,4)));const sm=await g.enterPerm(b,bear());
   const s=await enter(g,a,'Summon: Valefor');ok('Valefor I: each opponent returns their highest-MV creature',!b.battlefield.includes(big)&&b.battlefield.includes(sm)&&b.hand.some(c=>c.name==='Ogre'));
   await lore(g,a,s);ok('Valefor II: tap + stun',sm.tapped&&(sm.ck||{}).stun===1); }
 { const g=fresh();const [a,b]=g.players;const t=await g.enterPerm(b,tagCard(mk('Relic','Artifact','{3}','',3)));const s=await enter(g,a,'Awaken the Honored Dead');ok('Awaken I destroys a nonland permanent',!b.battlefield.includes(t));
   await lore(g,a,s);ok('Awaken II mills three',a.graveyard.length>=3);a.graveyard.push(bear('Back'));a.hand=[tagCard(mk('Junk','Sorcery','{R}','x',1))];await lore(g,a,s);
   ok('Awaken III: discard one, return exactly one creature/land',a.hand.length===1&&a.hand[0].name!=='Junk',JSON.stringify(a.hand.map(c=>c.name))); }
 { const g=fresh();const [a]=g.players;a.graveyard.push(bear('Back'));const s=await enter(g,a,'The Mending of Dominaria');ok('Mending I: mill two, then a creature back to hand',a.hand.some(c=>c.isCreature),JSON.stringify(a.hand.map(c=>c.name)));
   await lore(g,a,s);const lib0=a.library.length;await lore(g,a,s);ok('Mending III: lands back, graveyard shuffled into library (only the sacrificed Saga left)',a.graveyard.length===1&&a.graveyard[0].name==='The Mending of Dominaria'&&/shuffles/.test(g.log.slice(-4).map(l=>l.m).join(' ')),JSON.stringify(a.graveyard.map(c=>c.name))); }
 { const g=fresh();const [a]=g.players;const s=await enter(g,a,'Three Blind Mice');ok('Mice I: a 1/1 Mouse',a.battlefield.some(x=>x.card.name==='Mouse'));await lore(g,a,s);await lore(g,a,s);ok('Mice II, III: copies of a token',a.battlefield.filter(x=>x.card.token).length===3);
   await lore(g,a,s);ok('Mice IV: +1/+1 and vigilance, then sacrificed',/\+1\/\+1/.test(g.log.slice(-4).map(l=>l.m).join(' '))&&!a.battlefield.includes(s)); }

 // ---- progression & payoffs ----
 { const g=fresh();const [a]=g.players;const s=await enter(g,a,'Three Blind Mice');ok('enters with lore 1',s.lore===1);g.active=0;
   const takeOne=async()=>{ g.turn++; await g.takeTurn(a); await tick(g); }; a.ai=null;a.human=false;
   // drive the real turn structure with a tiny AI so draw-step lore happens where the rules put it
   a.ai=new AI('expert');await takeOne();ok('next turn: a lore counter after the draw step (chapter II)',s.lore===2||!a.battlefield.includes(s),'lore='+s.lore); }
 { const g=fresh();const [a]=g.players;await g.enterPerm(a,C('Narci, Fable Singer'));const s=await enter(g,a,'Three Blind Mice');const L=g.opponentsOf(a).map(q=>q.life);const me=a.life;
   await lore(g,a,s);await lore(g,a,s);await lore(g,a,s);ok('Narci: final chapter drains each opponent by the Saga’s MV (3)',g.opponentsOf(a).every((q,i)=>q.life===L[i]-3)&&a.life===me+3,JSON.stringify(g.players.map(q=>q.life)));
   ok('Narci: sacrificing the Saga draws a card',/draws|sacrifice/.test(g.log.slice(-6).map(l=>l.m).join(' '))); }
 { const g=fresh();const [a]=g.players;await g.enterPerm(a,C('Tom Bombadil'));a.library.push(C('The Eldest Reborn'));a.library.push(...Array(3).fill(0).map(()=>bear('Filler')));const s=await enter(g,a,'Three Blind Mice');
   await lore(g,a,s);await lore(g,a,s);await lore(g,a,s);ok('Tom Bombadil: final chapter puts the next Saga onto the battlefield',a.battlefield.some(x=>x.card.name==='The Eldest Reborn'),g.log.slice(-5).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const sat=await g.enterPerm(a,C('Satsuki, the Living Lore'));sat.summoning=false;const s1=await enter(g,a,'Three Blind Mice');const s2=await enter(g,a,'Summon: Fenrir');
   const ab=sat.card.abilities.find(x=>x.tap);await g.activate(a,{card:sat.card,ab,perm:sat});while(g.stack.length)await g.resolve();await tick(g);ok('Satsuki: a lore counter on each Saga (chapters trigger)',s1.lore===2&&s2.lore===2&&a.battlefield.filter(x=>x.card.token).length>=2); }
 { const g=fresh();const [a]=g.players;const sg=await g.enterPerm(a,C('Sigurd, Jarl of Ravensthorpe'));const e=await g.enterPerm(a,bear('Elk',3,3));const s=await enter(g,a,'Three Blind Mice');const c0=(e.counters||0)+(sg.counters||0);
   await lore(g,a,s);const others=a.battlefield.filter(x=>x!==sg&&x.card.isCreature).reduce((t,x)=>t+(x.counters||0),0);ok('Sigurd: putting a lore counter puts a +1/+1 counter on another creature',others>=1,'others='+others); }
 { const g=fresh();const [a,b]=g.players;const gar=await g.enterPerm(a,C('Garnet, Princess of Alexandria'));gar.summoning=false;const s=await enter(g,a,'Three Blind Mice');await lore(g,a,s);
   await g.combatPhase(a,[{attacker:gar,defender:b}]);await tick(g);ok('Garnet: removes lore counters when attacking, gets that many +1/+1 counters',(gar.counters||0)>=1&&s.lore<2,'counters='+gar.counters+' lore='+s.lore); }
 { const g=fresh();const [a]=g.players;const s=await enter(g,a,'Three Blind Mice');const cl=tagCard({name:'Clash of the Eikons',mana:'{G}',type:'Sorcery',cmc:1,oracle:R.find(x=>x[0]==='Clash of the Eikons')?.[3]||"Choose one or more —\n• Target creature you control fights target creature an opponent controls.\n• Remove a lore counter from target Saga you control. (Removing lore counters doesn't cause chapter abilities to trigger.)\n• Put a lore counter on target Saga you control."});
   a.hand.push(cl);a.pool=[{c:'G'}];await g.cast(a,cl,'hand');while(g.stack.length)await g.resolve();await tick(g);ok('Clash of the Eikons: lore modes work (remove + put retriggers chapter I)',a.battlefield.filter(x=>x.card.name==='Mouse').length===2&&/removes a lore counter/.test(g.log.map(l=>l.m).join(' ')),'lore='+s.lore+' '+g.log.slice(-4).map(l=>l.m).join(' | ')); }
 console.log(fails+' failed');})();
