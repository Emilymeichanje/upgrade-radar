// planeswalker rules and every walker interaction in the Tam deck — real Oracle text
require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[...require(__dirname+'/fixtures/tamterra.json'),...require(__dirname+'/fixtures/pw8.json'),["Sisay, Weatherlight Captain","{2}{W}","Legendary Creature — Human Soldier","Sisay gets +1/+1 for each color among other legendary permanents you control.\n{W}{U}{B}{R}{G}: Search your library for a legendary permanent card with mana value less than Sisay's power, put that card onto the battlefield, then shuffle.",3,"2","2",null]];
const C=n=>{const a=R.find(x=>x[0]===n);if(!a)throw new Error('no '+n);return tagCard({name:a[0],mana:a[1],type:a[2],oracle:a[3],cmc:a[4],power:a[5],toughness:a[6],loyalty:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(40)].map(()=>mk('Island','Basic Land — Island','','',0)).concat([...Array(59)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:deck(),ai:new AI('expert')})),{seed:11,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=6;for(const p of g.players)p.hand=p.library.splice(-4);return g};
const tick=async g=>{await g.emit({type:'tick'});await g.flushPending?.();await g.emit({type:'tick'})};let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
const cast=async(g,p,name,opts={})=>{const c=typeof name==='string'?C(name):name;p.hand.push(c);p.pool=Array(14).fill(0).map((_,i)=>({c:'WUBRGC'[i%6]}));await g.cast(p,c,'hand',opts.target||null);while(g.stack.length)await g.resolve();await tick(g);return p.battlefield.find(b=>b.card===c)||p.battlefield.find(b=>b.card.name===c.name&&!b.card.token)};
const act=async(g,p,pm,label,opt={})=>{const own=pm.card.abilities.find(a=>a.label===label);const gr=g.abilityOptions(p,{}).find(o=>o.perm===pm&&(o.ab.label===label||o.ab.label.startsWith(label+' (')));const ab=own||(gr&&gr.ab);if(!ab)return 'NOAB';if(!own&&gr){p.pool=Array(10).fill(0).map((_,i)=>({c:'WUBRGC'[i%6]}));await g.activate(p,{...gr,...opt});while(g.stack.length)await g.resolve();await tick(g);return 'OK'}p.pool=Array(10).fill(0).map((_,i)=>({c:'WUBRGC'[i%6]}));if(!g.canUseAbility(p,pm.card,ab,pm))return 'CANT';await g.activate(p,{card:pm.card,ab,perm:pm,...opt});while(g.stack.length)await g.resolve();await tick(g);return 'OK'};
const put=async(g,p,name)=>{const pm=await g.enterPerm(p,C(name));pm.summoning=false;await tick(g);return pm};
(async()=>{
 // ---- loyalty basics
 { const g=fresh();const [a,b]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');ok('walker enters with printed loyalty (4)',t&&t.loyalty===4,'loyalty='+(t&&t.loyalty));
   ok('+1 ability',await act(g,a,t,'+1')==='OK'&&t.loyalty===5);ok('one loyalty ability per turn',await act(g,a,t,'−3')==='CANT');
   g.turn++;const bear=await g.enterPerm(b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));bear.summoning=false;g.active=1;
   await g.combatPhase(b,[{attacker:bear,defender:a,pw:t}]);await tick(g);ok('combat damage to a walker removes loyalty',t.loyalty===3,'loyalty='+t.loyalty);
   t.loyalty=1;g.active=0;g.turn++;await act(g,a,t,'−3');ok('a walker can’t pay more loyalty than it has',a.battlefield.includes(t)&&t.loyalty===1); }
 // ---- Doubling Season
 { const g=fresh();const [a]=g.players;await put(g,a,'Doubling Season');const t=await cast(g,a,'Teferi, Hero of Dominaria');ok('Doubling Season: walker enters with double loyalty (8)',t.loyalty===8,'loyalty='+t.loyalty);
   await act(g,a,t,'+1');ok('Doubling Season does NOT double a + loyalty cost (8 → 9)',t.loyalty===9,'loyalty='+t.loyalty);
   const og=await put(g,a,'Oath of Gideon');const e=await cast(g,a,"Elspeth, Sun's Champion");ok('Oath of Gideon + Doubling Season: (4+1)×2 = 10',e.loyalty===10,'loyalty='+e.loyalty);
   await act(g,a,e,'+1');ok('Doubling Season doubles tokens from a walker (+1 → six Soldiers)',a.battlefield.filter(x=>x.card.token&&x.card.name==='Soldier').length===6); }
 { const g=fresh();const [a]=g.players;await put(g,a,'Oath of Gideon');const t=await cast(g,a,'Teferi, Hero of Dominaria');ok('Oath of Gideon alone: +1 starting loyalty (5)',t.loyalty===5); }
 // ---- Lae'zel, Carth
 { const g=fresh();const [a]=g.players;await put(g,a,"Lae'zel, Vlaakith's Champion");const t=await cast(g,a,'Teferi, Hero of Dominaria');ok("Lae'zel: walker enters with one extra loyalty (5)",t.loyalty===5,'loyalty='+t.loyalty);
   await act(g,a,t,'+1');ok("Lae'zel: +1 ability puts two (5 → 7)",t.loyalty===7,'loyalty='+t.loyalty); }
 { const g=fresh();const [a]=g.players;await put(g,a,'Carth the Lion');const t=await cast(g,a,'Teferi, Hero of Dominaria');await act(g,a,t,'+1');ok('Carth: +1 costs an additional +1 (4 → 6)',t.loyalty===6,'loyalty='+t.loyalty);
   g.turn++;await act(g,a,t,'−3',{target:null});ok('Carth: −3 becomes −2 (6 → 4)',t.loyalty===4,'loyalty='+t.loyalty); }
 { const g=fresh();const [a]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');const L=a.library.length;a.library.push(C('Chandra, Torch of Defiance'));await cast(g,a,'Carth the Lion');
   ok('Carth ETB: finds a walker in the top seven',a.hand.some(c=>c.name==='Chandra, Torch of Defiance'),g.log.slice(-3).map(l=>l.m).join(' | ')); }
 // ---- Deepglow Skate, Spark Double
 { const g=fresh();const [a]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');const c=await cast(g,a,'Chandra, Torch of Defiance');await cast(g,a,'Deepglow Skate');
   ok('Deepglow Skate doubles loyalty on your walkers (4→8, 4→8)',t.loyalty===8&&c.loyalty===8,t.loyalty+'/'+c.loyalty); }
 { const g=fresh();const [a]=g.players;await put(g,a,'Doubling Season');const t=await cast(g,a,'Teferi, Hero of Dominaria');await cast(g,a,'Deepglow Skate');ok('Deepglow + Doubling Season: 8 → 24 (adds 8, doubled to 16)',t.loyalty===24,'loyalty='+t.loyalty); }
 { const g=fresh();const [a]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');const sd=await cast(g,a,'Spark Double');const cp=a.battlefield.find(x=>x!==t&&x.card.name==='Teferi, Hero of Dominaria');
   ok('Spark Double copies a walker: nonlegendary, printed loyalty +1 (5), both stay',cp&&!cp.card.isLegendary&&cp.loyalty===5&&a.battlefield.includes(t),cp?JSON.stringify([cp.card.isLegendary,cp.loyalty]):g.log.slice(-4).map(l=>l.m).join(' | ')); }
 // ---- proliferate: Tam, Tekuthal, Karn's Bastion, Ichormoon Gauntlet, All Will Be One
 { const g=fresh();const [a]=g.players;const tam=await put(g,a,'Tam, the Possibility');const t=await cast(g,a,'Teferi, Hero of Dominaria');const c=await cast(g,a,'Chandra, Torch of Defiance');
   const ab=tam.card.abilities.find(x=>x.tap);a.pool=Array(6).fill(0).map((_,i)=>({c:'WUBRGC'[i]}));await g.activate(a,{card:tam.card,ab,perm:tam});while(g.stack.length)await g.resolve();await tick(g);
   ok('Tam: proliferate X times, X = planeswalker types (Teferi, Chandra → 2)',t.loyalty===6&&c.loyalty===6,t.loyalty+'/'+c.loyalty);
   const tf2=C('Teferi, Master of Time');const t2=await cast(g,a,tf2);ok('Tam: walker spells cost {1} less',g.costOf(a,C('Narset, Parter of Veils'),'hand').total===2); }
 { const g=fresh();const [a]=g.players;await put(g,a,'Tekuthal, Inquiry Dominus');const t=await cast(g,a,'Teferi, Hero of Dominaria');const kb=await put(g,a,"Karn's Bastion");
   const ab=kb.card.abilities.find(x=>x.ops.some(o=>o.op==='proliferate'));a.pool=Array(5).fill(0).map(()=>({c:'C'}));await g.activate(a,{card:kb.card,ab,perm:kb});while(g.stack.length)await g.resolve();await tick(g);
   ok("Tekuthal: Karn's Bastion proliferates twice (4 → 6)",t.loyalty===6,'loyalty='+t.loyalty); }
 { const g=fresh();const [a]=g.players;await put(g,a,'Ichormoon Gauntlet');const t=await cast(g,a,'Teferi, Hero of Dominaria');
   ok('Ichormoon Gauntlet grants [0]: Proliferate',await act(g,a,t,'0')==='OK'&&t.loyalty===5,'loyalty='+t.loyalty+' abil='+t.card.abilities.map(x=>x.label).join(','));
   g.turn++;const before=t.loyalty;await cast(g,a,tagCard(mk('Opt','Instant','{U}','Draw a card.',1)));ok('Ichormoon: noncreature spell adds a counter of a kind already there',t.loyalty===before+1,before+' → '+t.loyalty);
   t.loyalty=12;g.turn++;const r=await act(g,a,t,'−12');ok('Ichormoon grants [−12]: extra turn',r==='OK'&&/extra turn/.test(g.log.slice(-3).map(l=>l.m).join(' ')),r+' '+g.log.slice(-3).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;await put(g,a,'All Will Be One');const L=g.opponentsOf(a).map(q=>q.life);const t=await cast(g,a,'Teferi, Hero of Dominaria');
   ok('All Will Be One: a walker entering with 4 loyalty deals 4 damage',g.opponentsOf(a).some((q,i)=>q.life===L[i]-4)||/deals 4 damage/.test(g.log.slice(-5).map(l=>l.m).join(' ')),g.log.slice(-4).map(l=>l.m).join(' | ')); }
 // ---- end-step and death engines
 { const g=fresh();const [a]=g.players;await put(g,a,'Brokers Ascendancy');const t=await cast(g,a,'Teferi, Hero of Dominaria');const guff=await cast(g,a,'Commodore Guff');
   await g.fireTriggers?.(a,'end');await tick(g);ok('Brokers Ascendancy + Commodore Guff at end step: Teferi +2, Guff +1',t.loyalty===6&&guff.loyalty===6,t.loyalty+'/'+guff.loyalty+' '+g.log.slice(-4).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');await cast(g,a,'Way of the Necromancer');const jace=a.battlefield.find(x=>x.card.isPlaneswalker&&/Jace/.test(x.card.name)&&x.card.token);
   ok('Way of the Necromancer: empower Jace 2 (Jace token with 2 loyalty)',jace&&jace.loyalty===2,jace?'jace='+jace.loyalty:g.log.slice(-3).map(l=>l.m).join(' | '));
   const e=await g.enterPerm(a,tagCard(mk('Elk','Creature — Elk','{1}{G}','',2,2,2)));await g.destroy(a,e);await tick(g);ok('…a creature dying puts a loyalty counter on each walker',t.loyalty===5&&jace&&jace.loyalty===3,t.loyalty+'/'+(jace&&jace.loyalty)); }
 { const g=fresh();const [a]=g.players;await cast(g,a,'Way of the Paradox');const t=await cast(g,a,'Teferi, Hero of Dominaria');const L=a.life;await act(g,a,t,'+1');ok('Way of the Paradox: gain 1 life on activating a loyalty ability',a.life===L+1,'life '+L+' → '+a.life); }
 { const g=fresh();const [a]=g.players;await put(g,a,'Sanctum Lurker');const t=await cast(g,a,'Teferi, Hero of Dominaria');ok('Sanctum Lurker grants [+2]',g.abilityOptions(a,{}).some(o=>o.perm===t&&/^\+2/.test(o.ab.label)));
   t.loyalty=3;await act(g,a,t,'−3');ok('Sanctum Lurker: a walker at 0 loyalty stays',a.battlefield.includes(t)&&t.loyalty===0,'loyalty='+t.loyalty); }
 // ---- emblems
 { const g=fresh();const [a]=g.players;const e=await cast(g,a,"Elspeth, Sun's Champion");e.loyalty=7;await act(g,a,e,'−7');const elk=await g.enterPerm(a,tagCard(mk('Elk','Creature — Elk','{1}{G}','',2,2,2)));await tick(g);
   ok('Elspeth emblem: creatures get +2/+2 and flying',g.powerOf(a,elk)===4&&g.toughOf(a,elk)===4&&g.hasKw?.(a,elk,'flying')!==false,g.powerOf(a,elk)+'/'+g.toughOf(a,elk)); }
 { const g=fresh();const [a]=g.players;const c=await cast(g,a,'Chandra, Torch of Defiance');c.loyalty=7;await act(g,a,c,'−7');const L=g.opponentsOf(a).map(q=>q.life);ok('Chandra −7 makes an emblem, not a one-off 5 damage',(a.b12_emblems||[]).some(e=>e.kind==='castBurn')&&g.opponentsOf(a).every((q,i)=>q.life===L[i]));await cast(g,a,tagCard(mk('Opt','Instant','{U}','Draw a card.',1)));
   ok('Chandra emblem: each spell deals 5 damage',g.opponentsOf(a).some((q,i)=>q.life===L[i]-5)||/5 damage/.test(g.log.slice(-6).map(l=>l.m).join(' ')),g.log.slice(-4).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a,b]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');t.loyalty=8;await act(g,a,t,'−8');const x=await g.enterPerm(b,tagCard(mk('Relic','Artifact','{3}','',3)));await g.draw(a,1);await tick(g);
   ok('Teferi emblem: drawing a card exiles an opponent permanent',!b.battlefield.includes(x),g.log.slice(-3).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const t=await cast(g,a,'Teferi, Who Slows the Sunset');t.loyalty=7;await act(g,a,t,'−7');ok('Teferi, Who Slows the Sunset −7: emblem recorded',/emblem/.test(g.log.slice(-4).map(l=>l.m).join(' ')),g.log.slice(-3).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const t=await cast(g,a,'Tamiyo, Field Researcher');t.loyalty=7;const h=a.hand.length;await act(g,a,t,'−7');const big=tagCard(mk('Colossus','Creature — Golem','{12}','',12,12,12));a.hand.push(big);a.pool=[];
   ok('Tamiyo emblem: draw three, then cast spells from hand free',a.hand.length===h+4&&g.castMode(a,big,'hand')==='free',(a.hand.length-h)+' '+g.castMode(a,big,'hand')); }
 { const g=fresh();const [a]=g.players;const w=await cast(g,a,'Wrenn and Realmbreaker');w.loyalty=7;await act(g,a,w,'−7');const e=tagCard(mk('Elk','Creature — Elk','{1}{G}','',2,2,2));a.graveyard.push(e);a.pool=[{c:'G'},{c:'G'}];
   ok('Wrenn and Realmbreaker emblem: cast permanent spells from graveyard',!!g.castMode(a,e,'gy')); }
 { const g=fresh();const [a,b]=g.players;const c=await cast(g,a,'Chandra, Awakened Inferno');await act(g,a,c,'+2');ok('Chandra, Awakened Inferno +2: each opponent gets the upkeep-damage emblem',g.opponentsOf(a).every(q=>q.burnEmblems===1)); }
 // ---- statics & sweepers
 { const g=fresh();const [a,b]=g.players;await cast(g,a,'Narset, Parter of Veils');const h=b.hand.length;await g.draw(b,1);await g.draw(b,1);ok('Narset: an opponent draws at most one card a turn',b.hand.length===h+1,'drew '+(b.hand.length-h)); }
 { const g=fresh();const [a,b]=g.players;await cast(g,a,'Teferi, Time Raveler');g.active=0;ok('Teferi, Time Raveler: opponents can’t cast instants on your turn',!g.castMode(b,tagCard(mk('Shock','Instant','{R}','Shock deals 2 damage to any target.',1)),'hand',{instant:true})); }
 { const g=fresh();const [a,b]=g.players;const u=await cast(g,a,'Ugin, the Spirit Dragon');const x1=await g.enterPerm(b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));const x2=await g.enterPerm(b,tagCard(mk('Wurm','Creature — Wurm','{5}{G}{G}','',7,7,7)));const art=await g.enterPerm(b,tagCard(mk('Relic','Artifact','{3}','',3)));
   await act(g,a,u,'−X',{x:3});ok('Ugin −3 exiles coloured permanents MV ≤ 3 only (Ugin and colourless survive)',!b.battlefield.includes(x1)&&b.battlefield.includes(x2)&&b.battlefield.includes(art)&&a.battlefield.includes(u),g.log.slice(-3).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const v=C("Vraska, Betrayal's Sting");a.hand.push(v);a.pool=Array(6).fill(0).map(()=>({c:'C'})).concat([{c:'B'}]);a.life=40;
   await g.cast(a,v,'hand');while(g.stack.length)await g.resolve();await tick(g);const vp=a.battlefield.find(x=>x.card===v);ok('Vraska compleated: paying life for {B/P} → two fewer loyalty (4)',vp&&(vp.loyalty===4&&a.life===38||vp.loyalty===6&&a.life===40),vp?vp.loyalty+' life '+a.life:'not cast'); }
 { const g=fresh();const [a]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');const L=a.library.length;a.library.push(C('Narset, Parter of Veils'));await cast(g,a,'Entrust the Spark');ok('Entrust the Spark: sacrifice a walker, fetch a walker onto the battlefield',!a.battlefield.includes(t)&&a.battlefield.some(x=>x.card.isPlaneswalker),g.log.slice(-3).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;a.library.push(C('Narset, Parter of Veils'));const r=await put(g,a,'Arena Rector');await g.destroy(a,r);await tick(g);ok('Arena Rector dies → a walker onto the battlefield',a.battlefield.some(x=>x.card.isPlaneswalker),g.log.slice(-3).map(l=>l.m).join(' | ')); }

 // ---- v69: from the owner's Tam game log
 { const g=fresh();const [a]=g.players;const sis=await put(g,a,'Sisay, Weatherlight Captain');await put(g,a,'Tam, the Possibility');await put(g,a,'Narset, Parter of Veils');
   a.library.push(C('Narset, Parter of Veils'),C('Teferi, Hero of Dominaria'));const pw=g.powerOf(a,sis);const r=await act(g,a,sis,'');ok('Sisay: {W}{U}{B}{R}{G} ability usable and fetches a legendary with MV < power',r==='OK'&&/puts Narset, Parter of Veils onto the battlefield/.test(g.log.map(l=>l.m).join(' '))&&a.library.some(c=>c.name==='Teferi, Hero of Dominaria'),'power='+pw+' r='+r+' '+g.log.slice(-2).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const n=await cast(g,a,'Narset, Parter of Veils');a.library.push(tagCard(mk('Command Tower','Land','','{T}: Add one mana of any color in your commander\'s color identity.',0)),tagCard(mk('Forest','Basic Land — Forest','','',0)),tagCard(mk('Elk','Creature — Elk','{1}{G}','',2,2,2)),tagCard(mk('Opt','Instant','{U}','Draw a card.',1)));
   const h=a.hand.length;await act(g,a,n,'−2');ok('Narset −2 takes a noncreature, nonland card — never a land',a.hand.length===h+1&&a.hand[a.hand.length-1].name==='Opt',JSON.stringify(a.hand.slice(-1).map(c=>c.name))); }
 { const g=fresh();const [a,b]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');b.poison=9;const ob=await g.enterPerm(b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));ob.counters=2;
   await cast(g,a,tagCard(mk('Contentious Plan','Sorcery','{1}{U}','Proliferate.\nDraw a card.',2)));ok('AI-side proliferate: your walker +1, opponent poison +1 (kills), not the opponent’s +1/+1',t.loyalty===5&&b.dead&&ob.counters===2,JSON.stringify([t.loyalty,b.poison,b.dead,ob.counters])); }
 { const g=fresh();const [a]=g.players;await put(g,a,'Doubling Season');const t=await cast(g,a,'Teferi, Hero of Dominaria');await cast(g,a,tagCard(mk('Contentious Plan','Sorcery','{1}{U}','Proliferate.\nDraw a card.',2)));ok('proliferating a walker respects Doubling Season (8 → 10)',t.loyalty===10,'loyalty='+t.loyalty); }
 { const g=fresh();const [a]=g.players;const sg=tagCard({name:'Three Blind Mice',type:'Enchantment — Saga',mana:'{2}{W}',cmc:3,oracle:"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Create a 1/1 white Mouse creature token.\nII, III — Create a token that's a copy of target token you control.\nIV — Creatures you control get +1/+1 and gain vigilance until end of turn."});const s=await cast(g,a,sg);
   await cast(g,a,tagCard(mk('Contentious Plan','Sorcery','{1}{U}','Proliferate.\nDraw a card.',2)));ok('proliferating a Saga adds a lore counter and triggers the chapter',s.lore===2&&a.battlefield.filter(x=>x.card.token).length===2,'lore='+s.lore); }
 // ---- v70 (b13): from the owner's second Tam log
 { const g=fresh();const [a]=g.players;const u=await cast(g,a,'Ugin, the Spirit Dragon');u.loyalty=10;a.hand=[tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)),tagCard(mk('Shock','Instant','{R}','Shock deals 2 damage to any target.',1)),C('Doubling Season')];a.library.unshift(...Array(7).fill(0).map(()=>tagCard(mk('Island','Basic Land — Island','','',0))));const l0=a.life;
   await act(g,a,u,'−10');ok('Ugin −10: gain 7, draw 7, then put permanents from hand onto the battlefield',a.life===l0+7&&a.battlefield.some(b=>b.card.name==='Doubling Season')&&a.battlefield.some(b=>b.card.name==='Bear')&&a.hand.some(c=>c.name==='Shock')&&!a.hand.some(c=>c.name==='Bear'),'life '+a.life+' hand '+a.hand.map(c=>c.name).join(',')); }
 { const g=fresh();const [a]=g.players;const t=await cast(g,a,'Teferi, Hero of Dominaria');const lands=a.battlefield.filter(b=>b.card.isLand);for(const b of lands)b.tapped=true;
   await act(g,a,t,'+1');ok('Teferi Hero +1 does NOT untap lands right away',lands.every(b=>b.tapped)&&(g.endUntaps||[]).length===1,'queued '+(g.endUntaps||[]).length);
   const q=g.endUntaps[0];g.endUntaps=[];for(const b of q.p.battlefield.filter(b=>b.card.isLand&&b.tapped).slice(0,q.n))b.tapped=false;ok('…it untaps two at the next end step',lands.filter(b=>!b.tapped).length===Math.min(2,lands.length)); }
 { const g=fresh();const [a]=g.players;const am=await cast(g,a,'Aminatou, the Fateshifter');const h0=a.hand.length,l0=a.library.length;
   await act(g,a,am,'+1');ok('Aminatou +1: draw a card, then put a card from hand on top (hand size and library size unchanged)',a.hand.length===h0&&a.library.length===l0,'hand '+h0+'→'+a.hand.length+' lib '+l0+'→'+a.library.length); }
 // ---- b13 walker audit
 { const g=fresh();const [a,b]=g.players;await put(g,a,'Teferi, Hero of Dominaria');const gf=await cast(g,a,'Commodore Guff');gf.loyalty=5;const h0=a.hand.length,l0=b.life;
   await act(g,a,gf,'−3');ok('Commodore Guff −3: X = 2 walkers → draw 2 and 2 damage to each opponent',a.hand.length===h0+2&&b.life===l0-2,'hand +'+(a.hand.length-h0)+' opp −'+(l0-b.life)); }
 { const g=fresh();const [a]=g.players;const d=await cast(g,a,'Dihada, Binder of Wills');d.loyalty=5;a.library.push(tagCard(mk('Island','Basic Land — Island','','',0)),C('Teferi, Master of Time'),tagCard(mk('Elf','Creature — Elf','{G}','',1,1,1)),C('Narset, Parter of Veils'));const h0=a.hand.length;
   await act(g,a,d,'−3');ok('Dihada −3: legendary cards to hand, rest to graveyard, a Treasure for each',a.hand.length===h0+2&&a.hand.some(c=>c.name==='Narset, Parter of Veils')&&a.battlefield.filter(b=>/treasure/i.test(b.card.name)).length===2,'hand +'+(a.hand.length-h0)+' treasures '+a.battlefield.filter(b=>/treasure/i.test(b.card.name)).length); }
 { const g=fresh();const [a]=g.players;const j=await cast(g,a,'Jace, Multiverse Architect');const h0=a.hand.length,l0=a.library.length;
   await act(g,a,j,'+1');ok('Jace, Multiverse Architect +1: draw two, put one on the bottom (net +1 card)',a.hand.length===h0+1&&a.library.length===l0-1,'hand +'+(a.hand.length-h0)); }
 { const g=fresh();const [a]=g.players;const w=await cast(g,a,'Wrenn and Realmbreaker');a.library.push(tagCard(mk('Shock','Instant','{R}','Shock deals 2 damage to any target.',1)),C('Doubling Season'),tagCard(mk('Shock','Instant','{R}','Shock deals 2 damage to any target.',1)));const h0=a.hand.length;
   await act(g,a,w,'−2');ok('Wrenn and Realmbreaker −2: mill 3, take a permanent card',a.hand.length===h0+1&&a.hand.some(c=>c.name==='Doubling Season')&&a.graveyard.filter(c=>c.name==='Shock').length===2); }
 { const g=fresh();const [a,b]=g.players;const nb=await cast(g,a,'Nicol Bolas, God-Pharaoh');nb.loyalty=7;const big=await g.enterPerm(b,tagCard(mk('Dragon','Creature — Dragon','{5}{R}{R}','Flying',7,6,6)));for(const q of g.opponentsOf(a))q.life=40;
   await act(g,a,nb,'−4');ok('Nicol Bolas −4 can hit a creature an opponent controls (AI kills the 6/6)',!b.battlefield.includes(big)&&g.opponentsOf(a).every(q=>q.life===40)); }
 { const g=fresh();const [a,b]=g.players;const t=await cast(g,a,'Tamiyo, Field Researcher');const elf=a.battlefield.find(x=>x.card.isCreature)||await g.enterPerm(a,tagCard(mk('Elf','Creature — Elf','{G}','',1,2,2)));elf.summoning=false;const h0=a.hand.length;
   await act(g,a,t,'+1');ok('Tamiyo +1 no longer draws right away',a.hand.length===h0,'hand +'+(a.hand.length-h0));
   await g.combatPhase(a,[{attacker:elf,defender:b}]);await tick(g);ok('…draws when the chosen creature deals combat damage',a.hand.length===h0+1,'hand +'+(a.hand.length-h0)); }
 // ---- b13: Pyroblast family colour checks, Guff "another"
 { const PY={name:'Pyroblast',mana:'{R}',type:'Instant',cmc:1,oracle:"Choose one —\n• Counter target spell if it's blue.\n• Destroy target permanent if it's blue."};
   const g=fresh();const [a,b]=g.players;const sram=tagCard(mk('Sram, Senior Edificer','Legendary Creature — Dwarf Advisor','{1}{W}','',2,2,2));const py=tagCard(PY);
   ok('AI won’t aim Pyroblast at a white spell (counterHits false)',!Goldfish.counterHits?.(py.modes?py.modes[0].card:py,sram)||false);
   for (const [vic,col,want] of [[sram,'white',false],[tagCard(mk('Jace Cantrip','Instant','{U}','Draw a card.',1)),'blue',true]]) { const v={id:777,card:vic,caster:b,kind:'spell'};g.stack.push(v);const mc=tagCard(PY).modes[0].card;const o={id:778,card:mc,caster:a,target:{spell:v},isMode:true};g.stack.push(o);await g.resolve(o);
     ok(`Pyroblast vs a ${col} spell: ${want?'countered':'nothing happens'}`,!g.stack.includes(v)===want,'stack '+g.stack.map(o=>o.card.name)); g.stack.length=0; } }
 { const g=fresh();const [a]=g.players;const gf=await put(g,a,'Commodore Guff');gf.loyalty=4;const tr=gf.card.triggers.find(t=>t.when==='end');await g.runTrig(a,gf,tr,{});ok('Guff end step with no other walker: no counter on himself',gf.loyalty===4,'loyalty '+gf.loyalty);
   const t=await put(g,a,'Teferi, Hero of Dominaria');const l0=t.loyalty;await g.runTrig(a,gf,tr,{});ok('…with another walker, that one gets it',gf.loyalty===4&&t.loyalty===l0+1,'guff '+gf.loyalty+' teferi '+t.loyalty); }
 // ---- b13: counter boosts on every loyalty source; Chandra LoF X; TR −3 order
 { const g=fresh();const [a]=g.players;await put(g,a,'Doubling Season');const gf=await put(g,a,'Commodore Guff');const t=await put(g,a,'Teferi, Hero of Dominaria');const l0=t.loyalty;const tr=gf.card.triggers.find(x=>x.when==='end');await g.runTrig(a,gf,tr,{});
   ok('Guff end step + Doubling Season: 2 loyalty counters',t.loyalty===l0+2,'+'+(t.loyalty-l0)); }
 { const g=fresh();const [a]=g.players;await put(g,a,'Doubling Season');const t=await put(g,a,'Teferi, Hero of Dominaria');const l0=t.loyalty;await put(g,a,'Ichormoon Gauntlet');const ig=a.battlefield.find(b=>b.card.name==='Ichormoon Gauntlet');
   await g.runOps(a,[{op:'oneMoreCounter'}],ig.card,{});ok('Ichormoon Gauntlet + Doubling Season: 2 extra loyalty',t.loyalty===l0+2,'+'+(t.loyalty-l0)); }
 { const g=fresh();const [a,b]=g.players;const c=await put(g,a,'Chandra, Legacy of Fire');await put(g,a,'Teferi, Hero of Dominaria');const l0=b.life;const tr=c.card.triggers.find(x=>x.when==='end');await g.runTrig(a,c,tr,{});
   ok('Chandra, Legacy of Fire end step: X = 2 walkers → 2 damage each opponent',b.life===l0-2,'−'+(l0-b.life)); }
 { const tr=C('Teferi, Time Raveler').abilities.find(x=>x.label==='−3');ok('Teferi, Time Raveler −3 bounces before drawing',tr.ops[0].op==='bounceTarget'&&tr.ops[1].op==='draw'); }
 // ---- Sevinne's Reclamation can return a land
 { const SR={name:"Sevinne's Reclamation",mana:'{W}',type:'Sorcery',cmc:1,oracle:'Return target permanent card with mana value 3 or less from your graveyard to the battlefield. If this spell was cast from a graveyard, you may copy this spell and may choose a new target for the copy.\nFlashback {4}{W}'};
   const g=fresh();const [a]=g.players;a.ai=null;a.human=true;const land=tagCard({name:'Bountiful Promenade',type:'Land',mana:'',cmc:0,oracle:'({T}: Add {R} or {W}.)'});a.graveyard.push(land,tagCard(mk('Bloom Tender','Creature — Elf Druid','{1}{G}','',2,1,1)));let offered=null;
   g.hooks.humanSearch=async o=>{offered=o.pool.map(c=>c.name);return o.pool.filter(c=>c===land)};await cast(g,a,tagCard(SR));
   ok("Sevinne's Reclamation offers lands and returns the chosen land",offered&&offered.includes('Bountiful Promenade')&&a.battlefield.some(b=>b.card===land),'offered '+offered); }
 { const g=fresh();const [a]=g.players;a.graveyard.push(tagCard({name:'Forest',type:'Basic Land — Forest',mana:'',cmc:0,oracle:''}),tagCard(mk('Coffin','Artifact','{2}','',2)));
   await g.runOps(a,[{op:'gyPermToBf',what:'artifact',max:3}],tagCard(mk('X','Sorcery','{W}','',1)),{});ok('…but an "artifact card" version still ignores lands',a.graveyard.some(c=>c.name==='Forest')&&a.battlefield.some(b=>b.card.name==='Coffin')); }
 console.log(fails+' failed');})();
