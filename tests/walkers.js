var window_pool;
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
 // ---- b13: Cultivate / Kodama's Reach, Esper Sentinel, Annie Joins Up
 { const g=fresh();const [a]=g.players;a.library.push(tagCard({name:'Hallowed Fountain',type:'Land — Plains Island',mana:'',cmc:0,oracle:'({T}: Add {W} or {U}.)'}),tagCard({name:'Forest',type:'Basic Land — Forest',mana:'',cmc:0,oracle:''}),tagCard({name:'Plains',type:'Basic Land — Plains',mana:'',cmc:0,oracle:''}));
   const bf0=a.battlefield.filter(b=>b.card.isLand).length,h0=a.hand.length;await cast(g,a,tagCard({name:"Kodama's Reach",mana:'{2}{G}',type:'Sorcery — Arcane',cmc:3,oracle:'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.'}));
   const got=a.battlefield.filter(b=>b.card.isLand).slice(bf0);ok("Kodama's Reach: one BASIC land to the battlefield tapped, another to hand",got.length===1&&/Basic/.test(got[0].card.type)&&got[0].tapped&&a.hand.length===h0+1&&a.hand.some(c=>/Basic/.test(c.type))&&!a.battlefield.some(b=>b.card.name==='Hallowed Fountain'),'bf +'+got.map(b=>b.card.name)+' hand +'+(a.hand.length-h0)); }
 { const g=fresh();const [a,b]=g.players;await g.enterPerm(a,tagCard({name:'Esper Sentinel',mana:'{W}',type:'Artifact Creature — Human Soldier',cmc:1,power:1,toughness:1,oracle:"Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power."}));
   b.ai.payTax=()=>false;const h0=a.hand.length;await cast(g,b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));await cast(g,b,tagCard(mk('Signet','Artifact','{2}','',2)));
   ok('Esper Sentinel fires on the first NONCREATURE spell even after a creature',a.hand.length===h0+1,'hand +'+(a.hand.length-h0)); }
 { const g=fresh();const [a,b]=g.players;const x=await g.enterPerm(b,tagCard(mk('Ox','Creature — Ox','{3}','',3,2,4)));const y=await g.enterPerm(b,tagCard(mk('Yak','Creature — Yak','{3}','',3,2,4)));
   await cast(g,a,tagCard({name:'Annie Joins Up',mana:'{1}{R}{G}{W}',type:'Legendary Enchantment',cmc:4,oracle:'When Annie Joins Up enters, it deals 5 damage to target creature or planeswalker an opponent controls.\nIf a triggered ability of a legendary creature you control triggers, that ability triggers an additional time.'}));
   ok('Annie Joins Up deals its 5 damage once (one creature dies, not two)',[x,y].filter(v=>b.battlefield.includes(v)).length===1,'alive '+[x,y].filter(v=>b.battlefield.includes(v)).length); }
 // ---- b13: permanents with removal text only in triggers/activations are not cast-time removal; commander won't suicide when 'ahead'
 { const g=fresh();const [a,b]=g.players;const clamp=await g.enterPerm(b,tagCard(mk('Skullclamp','Artifact — Equipment','{1}','Equipped creature gets +1/-1.',1)));
   await cast(g,a,tagCard({name:'Aura Shards',type:'Enchantment',mana:'{1}{G}{W}',cmc:3,oracle:'Whenever a creature you control enters, you may destroy target artifact or enchantment.'}));
   ok('Aura Shards does nothing on cast (Skullclamp survives)',b.battlefield.includes(clamp));
   await cast(g,a,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));await tick(g);ok('…but a creature entering lets it destroy the artifact',!b.battlefield.includes(clamp),'clamp alive '+b.battlefield.includes(clamp)); }
 { const g=fresh();const [a,b]=g.players;const cm=a.battlefield.find(x=>x.card.isCommander)||await g.enterPerm(a,Object.assign(tagCard(mk('Cmdr2','Legendary Creature — X','{2}','',2,2,3)),{isCommander:true}));cm.card.isCommander=true;cm.summoning=false;
   for(let i=0;i<3;i++){const t=await g.enterPerm(a,tagCard(mk('Brute '+i,'Creature — Ogre','{3}','',3,4,4)));t.summoning=false;}
   const wall=await g.enterPerm(b,tagCard(mk('Wall','Creature — Wall','{2}','',2,3,5)));wall.summoning=false;g.round=4;
   const as=a.ai.chooseAttacks(g,a);ok("'ahead' AI attacks with the team but keeps a commander that would die to the 3/5 home",as.length>=3&&!as.some(x=>x.attacker===cm),as.map(x=>x.attacker.card.name).join(',')); }
 // ---- b13 (v79): shroud targeting, Counterspell vs abilities, Chulane land, scry order, blockers vs 'ahead'
 { const g=fresh();const [a,b]=g.players;const au=await g.enterPerm(b,tagCard(mk('Aurelia','Legendary Creature — Angel','{2}{R}{W}','Flying',4,4,4)));const gr=await g.enterPerm(b,tagCard({name:'Lightning Greaves',type:'Artifact — Equipment',mana:'{2}',cmc:2,oracle:'Equipped creature has haste and shroud.\nEquip {0}'}));gr.attachedTo=au.id;g.recompute&&g.recompute();g.refreshStatics&&g.refreshStatics();
   const other=await g.enterPerm(b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));a.ai=null;a.human=true;let offered=null;g.hooks.pickTarget=async o=>{offered=(o.options||o.pool||[]).map(t=>(t.card||t).name);return null};g.hooks.humanSearch=async o=>{offered=o.pool.map(c=>c.name);return []};
   await g.runOps(a,[{op:'cantBlockTarget'}],tagCard(mk('X','Sorcery','{W}','',1)),{});ok('a shroud (Greaves) creature is never offered as a target',au.card.kw.includes('shroud')&&offered&&!offered.includes('Aurelia')&&offered.includes('Bear'),'kw '+au.card.kw+' offered '+offered); }
 { const cs=tagCard({name:'Counterspell',mana:'{U}{U}',type:'Instant',cmc:2,oracle:'Counter target spell.'});ok('Counterspell cannot hit a triggered ability',!Goldfish.counterHits(cs,{name:'Aragorn — cast',type:'Triggered ability',colors:[]})&&Goldfish.counterHits(cs,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)))); }
 { const g=fresh();const [a]=g.players;a.ai=null;a.human=true;await g.enterPerm(a,tagCard({name:'Chulane, Teller of Tales',mana:'{2}{G}{W}{U}',type:'Legendary Creature — Human Druid',cmc:5,power:2,toughness:4,oracle:'Vigilance\nWhenever you cast a creature spell, draw a card, then you may put a land card from your hand onto the battlefield.'}));
   const isl=tagCard({name:'Island',type:'Basic Land — Island',mana:'',cmc:0,oracle:''});a.library.push(isl);let asked=null;g.hooks.humanSearch=async o=>{asked={dest:o.dest,pool:o.pool.map(c=>c.name)};return o.pool.filter(c=>c===isl)};
   const bf0=a.battlefield.filter(b=>b.card.isLand).length;await cast(g,a,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));
   ok('Chulane: draw, then you choose a land from hand (including the one just drawn) to put onto the battlefield',asked&&asked.dest==='battlefield'&&asked.pool.includes('Island')&&a.battlefield.some(b=>b.card===isl),JSON.stringify(asked)); }
 { const g=fresh();const [a]=g.players;a.ai=null;a.human=true;const [c1,c2,c3]=['A1','B2','C3'].map(n=>tagCard(mk(n,'Instant','{U}','',1)));a.library.push(c3,c2,c1); // c1 on top
   g.hooks.humanSearch=async o=>{const r=[];r.keepOrder=[c3,c1,c2];return r};await g.runOps(a,[{op:'scry',n:3}],tagCard(mk('X','Sorcery','{U}','',1)),{});
   ok('scry 3: the kept cards take the order you chose (C3 on top, then A1, B2)',a.library.slice(-3).reverse().map(c=>c.name).join(',')==='C3,A1,B2',a.library.slice(-3).reverse().map(c=>c.name).join(',')); }
 { const g=fresh();const [a,b]=g.players;const cm=await g.enterPerm(b,tagCard(mk('Aragorn, the Uniter','Legendary Creature — Human','{R}{G}{W}{U}','',4,5,5)));cm.summoning=false;
   const el=await g.enterPerm(a,tagCard(mk('Elemental','Token Creature — Elemental','','',0,4,4)));const ar=await g.enterPerm(a,tagCard(mk('Archivist','Creature — Halfling','{1}{W}','Flying',2,2,2)));const me=await g.enterPerm(a,tagCard(mk('Merry','Legendary Creature — Halfling','{1}{R}{W}','',3,3,3)));for(const x of [el,ar,me])x.summoning=false;g.round=4;
   const as=a.ai.chooseAttacks(g,a);ok("'ahead' AI no longer throws a 4/4 and a 3/3 into an untapped 5/5 — only the flyer attacks",as.length===1&&as[0].attacker===ar,as.map(x=>x.attacker.card.name).join(',')); }
 // ---- Sylvan Library (human): may draw 2, put back up to 2 in chosen order, pay 4 per kept
 { const SL={name:'Sylvan Library',type:'Enchantment',mana:'{1}{G}',cmc:2,oracle:'At the beginning of your draw step, you may draw two additional cards. If you do, choose two cards in your hand drawn this turn. For each of those cards, pay 4 life or put that card on top of your library.'};
   const g=fresh();const [a]=g.players;a.ai=null;a.human=true;const sl=await g.enterPerm(a,tagCard(SL));const tr=sl.card.triggers.find(t=>t.when==='draw'||/draw/.test(t.when));
   const [c1,c2,c3]=['N1','N2','N3'].map(n=>tagCard(mk(n,'Instant','{G}','',1)));a.library.push(c3,c2,c1);g.turn=(g.turn||0)+1;await g.draw(a,1); // the normal draw: N1
   g.hooks.humanChoice=async o=>o.options[0];g.hooks.humanSearch=async o=>{window_pool=o.pool.map(c=>c.name);const r=[c3,c2];r.keepOrder=[c3,c2];return r};const l0=a.life;
   await g.runTrig(a,sl,tr,{});ok('Sylvan: draws 2 more, offers this turn’s 3 draws, puts the 2 chosen back in order (N3 on top), pays 0',window_pool.join(',')==='N1,N2,N3'&&a.library.slice(-2).reverse().map(c=>c.name).join(',')==='N3,N2'&&a.life===l0&&a.hand.includes(c1),'pool '+window_pool+' top '+a.library.slice(-2).reverse().map(c=>c.name)+' life '+(l0-a.life));
   g.hooks.humanSearch=async o=>[];a.library.push(c3,c2);a.hand.splice(0);await g.runTrig(a,sl,tr,{});ok('…keeping both costs 8 life',a.life===l0-8,'paid '+(l0-a.life));
   g.hooks.humanChoice=async o=>o.options[1];const h=a.hand.length,lf=a.life;await g.runTrig(a,sl,tr,{});ok('…and you can decline the extra draws',a.hand.length===h&&a.life===lf); }
 { const g=fresh();const [a,b]=g.players;const ht=await g.enterPerm(a,tagCard({name:'Hellkite Tyrant',type:'Creature — Dragon',mana:'{4}{R}{R}',cmc:6,power:6,toughness:5,oracle:'Flying, trample\nAt the beginning of your upkeep, if you control twenty or more artifacts, you win the game.'}));await g.enterPerm(a,tagCard(mk('Signet','Artifact','{2}','',2)));
   await g.runTrig(a,ht,ht.card.triggers[0],{});ok('Hellkite Tyrant does NOT win with one artifact',!b.dead&&!g.winner);for(let i=0;i<19;i++)await g.enterPerm(a,tagCard(mk('Sig'+i,'Artifact','{2}','',2)));await g.runTrig(a,ht,ht.card.triggers[0],{});ok('…but does with twenty',b.dead,'dead '+b.dead); }
 // ---- Naya Charm: tap all creatures target player controls (and mode 2)
 { const g=fresh();const [a,b,c]=g.players;a.ai=null;a.human=true;for(const q of [b,c])for(let i=0;i<2;i++){const x=await g.enterPerm(q,tagCard(mk('Dragon'+i,'Creature — Dragon','{4}{R}{R}','Flying',6,6,6)));x.summoning=false;}
   const nc=tagCard({name:'Naya Charm',mana:'{R}{G}{W}',type:'Instant',cmc:3,oracle:'Choose one —\n• Naya Charm deals 3 damage to any target.\n• Return target card from a graveyard to its owner\'s hand.\n• Tap all creatures target player controls.'});
   g.hooks.humanModes=async o=>[o.modes[2].card];let askedPlayers=null;g.hooks.humanChoosePlayer=async o=>{askedPlayers=o.players.map(q=>q.name);return b};a.hand.push(nc);a.pool=['R','G','W'].map(c=>({c}));await g.cast(a,nc,'hand',null);await tick(g);
   ok('Naya Charm mode 3: you pick the player and all their creatures tap',askedPlayers&&askedPlayers.length>=3&&b.battlefield.filter(x=>x.card.isCreature).every(x=>x.tapped)&&c.battlefield.filter(x=>x.card.isCreature).every(x=>!x.tapped),'players '+askedPlayers);
   const bolt=tagCard(mk('Bolt','Instant','{R}','',1));b.graveyard.push(bolt);g.hooks.humanModes=async o=>[o.modes[1].card];g.hooks.humanSearch=async o=>o.pool.filter(x=>x===bolt);a.hand.push(nc);a.pool=['R','G','W'].map(c=>({c}));await g.cast(a,nc,'hand',null);await tick(g);
   ok('…mode 2 returns a card from ANY graveyard to its owner’s hand',b.hand.includes(bolt)); }
 // ---- Noble Hierarch: "{T}: Add {G}, {W}, or {U}" is a three-colour choice (was green only → Flowering of the White Tree uncastable)
 { const g=fresh();const [a]=g.players;a.ai=null;a.human=true;a.battlefield.length=0;const pl={id:1,card:tagCard({name:'Plains',type:'Basic Land — Plains',mana:'',cmc:0,oracle:''}),tapped:false,counters:0};a.battlefield.push(pl);
   const nh={id:2,card:tagCard({name:'Noble Hierarch',type:'Creature — Human Druid',mana:'{G}',cmc:1,power:0,toughness:1,oracle:'Exalted\n{T}: Add {G}, {W}, or {U}.'}),tapped:false,summoning:false,counters:0};a.battlefield.push(nh);
   const fl=tagCard({name:'Flowering of the White Tree',type:'Legendary Enchantment',mana:'{W}{W}',cmc:2,oracle:'Legendary creatures you control get +2/+1 and have ward {1}.\nNonlegendary creatures you control get +1/+1.'});a.hand.push(fl);
   ok('Noble Hierarch counts as a W source: {W}{W} payable with Plains + Hierarch',nh.card.manaAb&&nh.card.manaAb.colors.join('')==='GWU'&&g.canPayCost(a,g.costOf(a,fl,'hand')),JSON.stringify(nh.card.manaAb)); }
 // ---- Brokers Charm / modal targeting at resolution
 { const g=fresh();const [a,b]=g.players;a.ai=null;a.human=true;const bear=await g.enterPerm(b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,3,3)));const kn=await g.enterPerm(a,tagCard(mk('Knight','Creature — Knight','{1}{W}','',2,2,2)));
   const BC={name:'Brokers Charm',mana:'{G}{W}{U}',type:'Instant',cmc:3,oracle:'Choose one —\n• Target creature you control gets +1/+0 until end of turn. It deals damage equal to its power to target creature or planeswalker an opponent controls.\n• Destroy target enchantment.\n• Draw two cards.'};
   g.hooks.humanModes=async o=>[o.modes[0].card];g.hooks.humanSearch=async o=>o.pool.slice(0,1);a.hand.push(tagCard(BC));a.pool=['G','W','U'].map(c=>({c}));await g.cast(a,a.hand[a.hand.length-1],'hand',null);await tick(g);
   ok('Brokers Charm mode 1: +1/+0 once, then bites for its power (3/3 Bear dies)',!b.battlefield.includes(bear)&&g.powerOf(a,kn)===3,'bear alive '+b.battlefield.includes(bear)+' power '+g.powerOf(a,kn));
   g.hooks.humanModes=async o=>[o.modes[2].card];const h0=a.hand.length;a.hand.push(tagCard(BC));a.pool=['G','W','U'].map(c=>({c}));await g.cast(a,a.hand[a.hand.length-1],'hand',null);await tick(g);ok('…mode 3 draws two',a.hand.length===h0+2,'hand '+h0+'→'+a.hand.length); }
 // ---- MDFC back face: Esika // The Prismatic Bridge; Chaos Warp vs indestructible; Saga copy chapter I
 { const ES={name:'Esika, God of the Tree // The Prismatic Bridge',mana:'{1}{G}{G} // {W}{U}{B}{R}{G}',type:'Legendary Creature — God // Legendary Enchantment',cmc:3,power:1,toughness:4,oracle:'Vigilance\n{T}: Add one mana of any color.\nOther legendary creatures you control have vigilance and "{T}: Add one mana of any color."\n//\nAt the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.'};
   const g=fresh();const [a]=g.players;a.ai=null;a.human=true;const es=tagCard(ES);a.hand.push(es);a.pool=['W','U','B','R','G'].map(c=>({c}));let offered=null;g.hooks.humanPayOpt=async o=>{offered=o.alts.map(x=>x.kind+':'+(x.name||''));return o.alts.find(x=>x.kind==='mdfc')};
   const r=await g.cast(a,es,'hand',null);await tick(g);const pm=a.battlefield.find(b=>b.card.name==='The Prismatic Bridge');
   ok('Esika can be cast as The Prismatic Bridge (alternate option offered, enchantment enters)',r&&offered&&offered.includes('mdfc:The Prismatic Bridge')&&pm&&pm.card.isEnchantment&&!pm.card.isCreature,'offered '+offered+' pm '+(pm&&pm.card.type));
   a.library.push(tagCard(mk('Dragon','Creature — Dragon','{4}{R}','Flying',5,4,4)),tagCard(mk('Bolt','Instant','{R}','',1)));const tr=pm.card.triggers[0];await g.runTrig(a,pm,tr,{});
   ok('…its upkeep trigger digs to a creature and puts it onto the battlefield, rest to the bottom',a.battlefield.some(b=>b.card.name==='Dragon')&&a.library[0].name==='Bolt','bf '+a.battlefield.map(b=>b.card.name).join(',')); }
 { const g=fresh();const [a,b]=g.players;const havi=await g.enterPerm(b,tagCard(mk('Havi','Legendary Creature — God','{3}{R}{G}{W}','Indestructible',6,6,6)));const cw=tagCard({name:'Chaos Warp',mana:'{2}{R}',type:'Instant',cmc:3,oracle:'The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it\'s a permanent card, they put it onto the battlefield.'});
   a.hand.push(cw);a.pool=['R','R','R'].map(c=>({c}));await g.cast(a,cw,'hand',havi);await tick(g);ok('Chaos Warp shuffles away an indestructible creature',!b.battlefield.includes(havi)&&b.library.some(c=>c.name==='Havi')); }
 { const g=fresh();const [a]=g.players;const saga=await g.enterPerm(a,tagCard({name:'Summon: Titan',type:'Enchantment Creature — Saga Giant',mana:'{3}{G}{G}',cmc:5,power:7,toughness:7,oracle:'(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Mill five cards.\nII — Return all land cards from your graveyard to the battlefield tapped.\nIII — Until end of turn, another target creature you control gains trample and gets +X/+X, where X is the number of lands you control.\nReach, trample'}));
   for(let i=0;i<6;i++)a.library.push(tagCard(mk('Filler'+i,'Instant','{U}','',1)));const l0=a.library.length;await g.runOps(a,[{op:'copyPerm',useTarget:true}],tagCard(mk('Ondu','Creature — Kor','{3}{W}','',4,2,2)),{target:saga});
   const cp=a.battlefield.filter(b=>b.card.name==='Summon: Titan'&&b.card.token)[0];ok('a plain token copy of a Saga enters with ONE lore counter (chapter I mills 5, nothing more)',cp&&cp.lore===1&&a.library.length===l0-5,'lore '+(cp&&cp.lore)+' lib '+l0+'→'+a.library.length); }
 // ---- Edgar game: Clavileño, Farewell exile ≠ dies, Lawbringer optional sac, Broodship affordability
 { const g=fresh();const [a,b]=g.players;const cl=await g.enterPerm(a,tagCard({name:'Clavileño, First of the Blessed',mana:'{1}{W}{B}',type:'Legendary Creature — Vampire Cleric',cmc:3,power:2,toughness:2,oracle:'Whenever you attack, target attacking Vampire that isn\'t a Demon becomes a Demon in addition to its other types. It gains "When this creature dies, draw a card and create a tapped 4/3 white and black Vampire Demon creature token with flying."'}));
   const v=await g.enterPerm(a,tagCard(mk('Vampire','Token Creature — Vampire','','',0,1,1)));v.summoning=false;cl.summoning=false;const wall=await g.enterPerm(b,tagCard(mk('Wall','Creature — Wall','{1}','',1,0,5)));wall.summoning=false;
   const h0=a.hand.length;await g.combatPhase(a,[{attacker:v,defender:b}]);await tick(g);
   ok('Clavileño: attacking Vampire becomes a Demon, no token yet',/Demon/.test(v.card.type)&&!a.battlefield.some(x=>x.card.name==='Vampire Demon'),'type '+v.card.type+' tokens '+a.battlefield.filter(x=>/Demon/.test(x.card.name)).length);
   await g.destroy(a,v);await tick(g);const tok=a.battlefield.find(x=>x.card.name==='Vampire Demon');ok('…when it dies: draw a card + tapped 4/3 flying Vampire Demon',tok&&tok.tapped&&tok.card.kw.includes('flying')&&a.hand.length===h0+1,'tok '+!!tok+' hand +'+(a.hand.length-h0)); }
 { const g=fresh();const [a,b]=g.players;const cc=await g.enterPerm(a,tagCard({name:'Cruel Celebrant',mana:'{W}{B}',type:'Creature — Vampire',cmc:2,power:1,toughness:2,oracle:'Whenever Cruel Celebrant or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life.'}));for(let i=0;i<3;i++)await g.enterPerm(a,tagCard(mk('V'+i,'Creature — Vampire','{B}','',1,1,1)));
   const l0=b.life;b.ai.chooseModes=(g2,p,card,subs)=>subs.filter(x=>/creatures/.test(x.oracle.toLowerCase()));const fw=tagCard({name:'Farewell',mana:'{4}{W}{W}',type:'Sorcery',cmc:6,oracle:'Choose one or more —\n• Exile all artifacts.\n• Exile all creatures.\n• Exile all enchantments.\n• Exile all graveyards.'});b.hand.push(fw);b.pool=['W','W','W','W','W','W'].map(c=>({c}));await g.cast(b,fw,'hand',null);await tick(g);
   ok('Farewell (exile all creatures): creatures are exiled, Cruel Celebrant does NOT trigger',!a.battlefield.some(x=>x.card.isCreature)&&a.exile.length>=4&&b.life===l0,'exile '+a.exile.length+' gy '+a.graveyard.length+' opp life '+l0+'→'+b.life); }
 { const g=fresh();const [a,b]=g.players;a.ai=null;a.human=true;await g.enterPerm(b,tagCard(mk('Signet','Artifact','{2}','',2)));const rl=tagCard({name:'Ruthless Lawbringer',mana:'{1}{W}{B}',type:'Creature — Vampire Assassin',cmc:3,power:3,toughness:2,oracle:'When this creature enters, you may sacrifice another creature. When you do, destroy target nonland permanent.'});
   ok('Ruthless Lawbringer needs no cast-time target (optional sacrifice handled on entry)',!rl.roles.includes('removal'));let asked=0;g.hooks.humanSearch=async o=>{asked++;return []};a.hand.push(rl);a.pool=['W','B','B'].map(c=>({c}));const my=await g.enterPerm(a,tagCard(mk('Bat','Creature — Bat','{B}','',1,1,1)));await g.cast(a,rl,'hand',null);await tick(g);
   ok('…you can decline the sacrifice and keep your creature',asked===1&&a.battlefield.includes(my)&&a.battlefield.some(x=>x.card.name==='Ruthless Lawbringer')); }
 { const g=fresh();const [a]=g.players;await g.enterPerm(a,tagCard({name:'Exploration Broodship',mana:'{G}',type:'Artifact — Spacecraft',cmc:1,oracle:'Station\nOnce during each of your turns, you may cast a permanent spell from your graveyard by sacrificing a land in addition to paying its other costs.'}));
   a.battlefield=a.battlefield.filter(b=>!b.card.isLand);for(let i=0;i<2;i++)a.battlefield.push({id:9900+i,card:tagCard({name:'Forest',type:'Basic Land — Forest',mana:'',cmc:0,oracle:''}),tapped:false,counters:0});a.pool=[];
   const big=tagCard(mk('Frog','Creature — Frog','{3}{B}{G}','',5,6,6));a.graveyard.push(big);g.active=0;g.phase='main1';const r=await g.cast(a,big,'gy',null);
   ok('Broodship: a land is NOT sacrificed when the spell could not be paid afterwards',!r&&a.battlefield.filter(b=>b.card.isLand).length===2&&a.graveyard.includes(big),'lands '+a.battlefield.filter(b=>b.card.isLand).length); }
 // ---- Path of Ancestry scry; Door of Destinies asks the human for a type
 { const g=fresh();const [a]=g.players;a.ai=null;a.human=true;const cm=a.battlefield.find(b=>b.card.isCommander)||null;const edgar=tagCard(mk('Edgar Markov','Legendary Creature — Vampire Knight','{3}{R}{W}{B}','',6,4,4));edgar.isCommander=true;a.command.push(edgar);
   a.battlefield=a.battlefield.filter(b=>!b.card.isLand);const poa={id:7001,card:tagCard({name:'Path of Ancestry',type:'Land',mana:'',cmc:0,oracle:'Path of Ancestry enters tapped.\n{T}: Add one mana of any color. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1.'}),tapped:false,counters:0};a.battlefield.push(poa);
   let scried=0;g.hooks.humanSearch=async o=>{if(o.dest==='scry')scried++;return []};const vamp=tagCard(mk('Vampire Cutthroat','Creature — Vampire Rogue','{B}','',1,1,1));a.hand.push(vamp);await g.cast(a,vamp,'hand',null);await tick(g);
   ok('Path of Ancestry mana on a Vampire (shares a type with Edgar) → scry 1',scried===1,'scried '+scried);
   poa.tapped=false;a.pool=[];const bear=tagCard(mk('Bear','Creature — Bear','{G}','',1,2,2));a.hand.push(bear);await g.cast(a,bear,'hand',null);await tick(g);ok('…but not on a Bear',scried===1,'scried '+scried); }
 { const g=fresh();const [a]=g.players;a.ai=null;a.human=true;let q=null;g.hooks.humanChoice=async o=>{q=o;return 'Zombie'};a.library.push(tagCard(mk('Vampire Nighthawk','Creature — Vampire Shaman','{1}{B}{B}','',3,2,3)));
   const door=tagCard({name:'Door of Destinies',type:'Artifact',mana:'{4}',cmc:4,oracle:'As Door of Destinies enters, choose a creature type.\nWhenever you cast a spell of the chosen type, put a charge counter on Door of Destinies.\nCreatures you control of the chosen type get +1/+1 for each charge counter on Door of Destinies.'});const pm=await g.enterPerm(a,door);
   ok('Door of Destinies asks you for the creature type (deck counts offered, free text allowed)',q&&/creature type/.test(q.question)&&q.free&&q.options.some(o=>/^Vampire/.test(o))&&pm.chosenType==='zombie','q '+(q&&q.options)+' chosen '+pm.chosenType); }

 // ==== v85: Bolas's Citadel — pay life for a creature in main phase, and cast an instant from the top on an opponent's turn ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; me.life=29;
   const cit=tagCard(mk("Bolas's Citadel",'Legendary Artifact','{3}{B}{B}{B}',"You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.\n{T}, Sacrifice ten nonland permanents: Each opponent loses 10 life.",6));
   const cp=await g.enterPerm(me,cit); cp.summoning=false;
   const ga=tagCard(mk('Gifted Aetherborn','Creature — Aetherborn Vampire','{B}{B}','Deathtouch, lifelink',2,2,3)); me.library.push(ga); me.pool=[];
   ok('Citadel: creature on top is castable for life in main phase',g.castMode(me,ga,'top')==='free',String(g.castMode(me,ga,'top')));
   await g.cast(me,ga,'top'); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Citadel: paid 2 life, Gifted Aetherborn on the battlefield',me.life===27&&me.battlefield.some(b=>b.card===ga),'life '+me.life);
   const mort=tagCard(mk('Mortify','Instant','{1}{W}{B}','Destroy target creature or enchantment.',3)); me.library.push(mort);
   g.active=1; g.phase='main1'; me.pool=[];
   const la=g.legalActions(me); const o=la.find(x=>x.kind==='cast'&&x.card===mort);
   ok("Citadel: instant on top is offered at instant speed on an opponent's turn",!!o&&o.zone==='top',JSON.stringify(la.map(x=>x.kind+':'+(x.card&&x.card.name))));
   const bear=await g.enterPerm(g.players[1],tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));
   await g.doAction(me,{...o,target:bear}); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Citadel: Mortify from the top paid 3 life and destroyed the Bear',me.life===24&&!g.players[1].battlefield.includes(bear),'life '+me.life+' bear '+g.players[1].battlefield.includes(bear));
 }

 { const g=fresh(); const me=g.players[0];
   const cv=await g.enterPerm(me,tagCard(mk('Cordial Vampire','Creature — Vampire','{1}{B}','Whenever Cordial Vampire or another creature dies, you may put a +1/+1 counter on each Vampire you control.',2,1,1))); cv.summoning=false;
   const bear=await g.enterPerm(g.players[1],tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));
   await g.destroy(g.players[1],bear,false); while(g.stack.length)await g.resolve(); await tick(g);
   ok("Cordial Vampire: 'this or another creature dies' fires when an opponent's creature dies",cv.counters===1,'counters '+cv.counters);
 }

 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; let asked=null;
   g.hooks.humanChoice=async c=>{asked=c;return 'Vampire'};
   me.library.push(tagCard(mk('Gifted Aetherborn','Creature — Aetherborn Vampire','{B}{B}','Deathtouch, lifelink',2,2,3)));
   const cav=tagCard(mk('Cavern of Souls','Land','',"As Cavern of Souls enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered.",0));
   me.hand.push(cav); await g.playLand(me,cav); await tick(g);
   const pm=me.battlefield.find(b=>b.card===cav);
   ok('Cavern of Souls asks you for the creature type on entering',!!asked&&pm&&pm.chosenType==='vampire','asked '+!!asked+' type '+(pm&&pm.chosenType));
   ok('…and offers a searchable list of every creature type in the deck',!!asked&&Array.isArray(asked.list)&&asked.list.some(x=>/^Elf \(\d+ in deck\)$/.test(x))&&asked.list.some(x=>/^Aetherborn/.test(x)),JSON.stringify(asked&&asked.list));
   asked=null; g.hooks.humanChoice=async c=>{asked=c;return 'Elf (59 in deck)'};
   const horn=tagCard(mk("Herald's Horn",'Artifact','{3}',"As Herald's Horn enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand.",3));
   const hp=await g.enterPerm(me,horn);
   ok("Herald's Horn: the picked chip label is stripped to the type",!!asked&&hp.chosenType==='elf','type '+hp.chosenType);
 }

 // ==== v86: every "choose a creature type" card behaves after the choice ====
 { const T=(n,m,t,o,c,pw,tg)=>tagCard(mk(n,t,m,o,c,pw,tg)); const setup=async()=>{const g=fresh();const me=g.players[0];me.human=true;me.ai=null;g.hooks.humanChoice=async()=>'Elf';g.hooks.humanMay=async()=>true;const elf=await g.enterPerm(me,T('Elf1','{1}{G}','Creature — Elf Warrior','',2,'2','2'));elf.summoning=false;const bear=await g.enterPerm(g.players[1],T('Bear','{1}{G}','Creature — Bear','',2,'2','2'));return {g,me,elf,bear}};
   { const {g,me,elf}=await setup(); await g.enterPerm(me,T('Brass Herald','{6}','Artifact Creature — Golem',"As Brass Herald enters, choose a creature type.\nWhen Brass Herald enters, reveal the top four cards of your library. Put all creature cards of the chosen type revealed this way into your hand and the rest on the bottom of your library in any order.\nCreatures of the chosen type get +1/+1.",6,'4','4')); g.refreshStatics();
     const oe=await g.enterPerm(g.players[1],T('OppElf','{1}{G}','Creature — Elf','',2,'2','2')); g.refreshStatics();
     ok('Brass Herald: +1/+1 to every Elf, yours and theirs',g.powerOf(me,elf)===3&&g.powerOf(g.players[1],oe)===3,g.powerOf(me,elf)+' '+g.powerOf(g.players[1],oe)); }
   { const {g,me,elf}=await setup(); await g.enterPerm(me,T('Steely Resolve','{1}{G}','Enchantment',"As Steely Resolve enters, choose a creature type.\nCreatures of the chosen type have shroud.",2)); g.refreshStatics();
     ok('Steely Resolve: Elves have shroud (not targetable)',!g.canTarget(g.players[1],elf,{}),''); }
   { const {g,me,elf}=await setup(); await g.enterPerm(me,T('Coat of Arms','{5}','Artifact',"Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it.",5)); await g.enterPerm(me,T('Elf3','{1}{G}','Creature — Elf Warrior','',2,'2','2')); await g.enterPerm(g.players[2],T('Elf4','{1}{G}','Creature — Elf','',2,'2','2')); g.refreshStatics();
     ok('Coat of Arms: an Elf with two other Elves on the table (any owner) is +2/+2',g.powerOf(me,elf)===4,'power '+g.powerOf(me,elf)); }
   { const {g,me,elf,bear}=await setup(); const cf=T('Crippling Fear','{2}{B}{B}','Sorcery',"Choose a creature type. Creatures that aren't of the chosen type get -3/-3 until end of turn.",4); me.hand.push(cf); me.pool=Array(14).fill(0).map((_,i)=>({c:'WUBRGC'[i%6]})); await g.cast(me,cf,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
     ok('Crippling Fear: you name Elf, the Bear dies, the Elf lives',!g.players[1].battlefield.includes(bear)&&me.battlefield.includes(elf),''); }
   { const {g,me}=await setup(); me.graveyard.push(T('Elf2','{1}{G}','Creature — Elf Warrior','',2,'2','2')); g.players[1].graveyard.push(T('Bear2','{1}{G}','Creature — Bear','',2,'2','2')); const pb=T("Patriarch's Bidding",'{3}{B}{B}','Sorcery',"Each player chooses a creature type. Each player returns all creature cards of a type chosen this way from their graveyard to the battlefield.",5); me.hand.push(pb); me.pool=Array(14).fill(0).map((_,i)=>({c:'WUBRGC'[i%6]})); await g.cast(me,pb,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
     ok("Patriarch's Bidding: your Elf and the opponent's Bear both come back",me.battlefield.some(b=>b.card.name==='Elf2')&&g.players[1].battlefield.some(b=>b.card.name==='Bear2'),''); }
   { const {g,me,elf}=await setup(); await g.enterPerm(me,T('Door of Destinies','{4}','Artifact',"As Door of Destinies enters, choose a creature type.\nWhenever you cast a spell of the chosen type, put a charge counter on Door of Destinies.\nCreatures you control of the chosen type get +1/+1 for each charge counter on Door of Destinies.",4)); const e2=T('Elf2','{1}{G}','Creature — Elf Warrior','',2,'2','2'); me.hand.push(e2); me.pool=[{c:'G'},{c:'G'},{c:'G'}]; await g.cast(me,e2,'hand'); while(g.stack.length)await g.resolve(); await tick(g); g.refreshStatics();
     ok('Door of Destinies: casting an Elf adds a charge counter and pumps Elves',g.powerOf(me,elf)===3,'power '+g.powerOf(me,elf)); }
   { const {g,me}=await setup(); await g.enterPerm(me,T('Reflections of Littjara','{4}{U}','Enchantment',"As Reflections of Littjara enters, choose a creature type.\nWhenever you cast a spell of the chosen type, copy that spell. (A copy of a permanent spell becomes a token.)",5)); const e2=T('Elf2','{1}{G}','Creature — Elf Warrior','',2,'2','2'); me.hand.push(e2); me.pool=[{c:'G'},{c:'G'},{c:'G'}]; await g.cast(me,e2,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
     ok('Reflections of Littjara: an Elf spell is copied (two Elf2s)',me.battlefield.filter(b=>b.card.name==='Elf2').length===2,String(me.battlefield.filter(b=>b.card.name==='Elf2').length)); }
   { const {g,me}=await setup(); await g.enterPerm(me,T('Metallic Mimic','{2}','Artifact Creature — Shapeshifter',"As Metallic Mimic enters, choose a creature type.\nMetallic Mimic is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters the battlefield with an additional +1/+1 counter on it.",2,'2','1')); const e2=await g.enterPerm(me,T('Elf2','{1}{G}','Creature — Elf Warrior','',2,'2','2'));
     ok('Metallic Mimic: the next Elf enters with a +1/+1 counter',(e2.counters||0)===1,'counters '+e2.counters); }
 }

 { const g=fresh(); const ai=g.players[1]; const me=g.players[0];
   const god=await g.enterPerm(me,tagCard(mk('Xenagos, God of Revels','Legendary Enchantment Creature — God','{3}{R}{G}','Indestructible\nAs long as your devotion to red and green is less than seven, Xenagos isn\'t a creature.\nAt the beginning of combat on your turn, another target creature you control gains haste and gets +X/+X until end of turn, where X is that creature\'s power.',5,'6','5')));
   const bear=await g.enterPerm(me,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2')));
   const gift=tagCard(mk('Generous Gift','Instant','{2}{W}','Destroy target permanent. Its controller creates a 3/3 green Elephant creature token.',3));
   const t=ai.ai.bestTarget(g,ai,g.aiRmOk(gift,b=>!b.card.isLand));
   ok("AI won't aim Generous Gift at an indestructible God when a Bear is available",t&&t.perm===bear,t&&t.perm.card.name);
 }
 { const g=fresh(); const ai=g.players[1]; ai.life=2; const tomb=await g.enterPerm(ai,tagCard(mk('Ancient Tomb','Land','',"{T}: Add {C}{C}. Ancient Tomb deals 2 damage to you.",0)));
   ok("AI at 2 life doesn't count Ancient Tomb as a mana source",!g.manaSrcs(ai).some(x=>x.b===tomb),'');
   ai.life=10; ok('…but does at 10 life',g.manaSrcs(ai).some(x=>x.b===tomb),''); }

 // ==== v86b: Ashling g0129 — Fury evoke pitch + divided damage are your choices; token copies / myriad fire ETBs ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; const picks=[]; const choices=[];
   const fury=tagCard(mk('Fury','Creature — Elemental Incarnation','{3}{R}{R}',"When this creature enters, it deals 4 damage divided as you choose among any number of target creatures and/or planeswalkers.\nEvoke—Exile a red card from your hand.",5,'3','3'));
   const red1=tagCard(mk('Red One','Creature — Elemental','{R}','',1,'1','1')), red2=tagCard(mk('Red Two','Instant','{1}{R}','Red Two deals 2 damage to any target.',2));
   me.hand.push(fury,red1,red2);
   const b1=await g.enterPerm(g.players[1],tagCard(mk('Bear A','Creature — Bear','{1}{G}','',2,'2','2'))), b2=await g.enterPerm(g.players[2],tagCard(mk('Bear B','Creature — Bear','{1}{G}','',2,'2','2')));
   g.hooks.humanSearch=async c=>{picks.push(c.dest+':'+c.pool.map(x=>x.name).join('|')); if(c.dest==='exile')return [red2]; if(c.dest==='damage')return [c.pool.find(x=>x.name===(picks.filter(x=>x.startsWith('damage')).length===1?'Bear B':'Bear A'))]; return [c.pool[0]]};
   g.hooks.humanChoice=async c=>{choices.push(c.question); return '2'};
   g.hooks.humanAlt=async c=>c.blues&&c.blues[0]; g.hooks.humanPay=async c=>c.opts&&c.opts.find(o=>o.kind==='alt'||o.pitch)||null;
   const alts=g.altOptions(me,fury,'hand'); const evoke=alts.find(a=>a.pitch||/evoke/i.test(a.label||a.kind||''));
   ok('Fury: evoke is offered as an alt cost',!!evoke,JSON.stringify(alts).slice(0,200));
   if(evoke){ me.pool=[]; await g.cast(me,fury,'hand',null,{alt:evoke}); while(g.stack.length)await g.resolve(); await tick(g);
     ok('Fury evoke: you choose which red card to exile (Red Two, not the cheapest)',me.exile.includes(red2)&&me.hand.includes(red1),'exile '+me.exile.map(c=>c.name)+' hand '+me.hand.map(c=>c.name));
     ok('Fury: you split the 4 damage (2 to Bear B, 2 to Bear A) — both die',!g.players[1].battlefield.includes(b1)&&!g.players[2].battlefield.includes(b2),JSON.stringify({picks,choices,b1:g.players[1].battlefield.includes(b1),b2:g.players[2].battlefield.includes(b2)}).slice(0,300)); }
 }
 { const g=fresh(); const me=g.players[0]; me.ai=null; me.human=true; g.hooks.humanSearch=async c=>[c.pool[0]];
   const fb=tagCard(mk('Foundation Breaker','Creature — Elemental','{3}{G}',"When this creature enters, you may destroy target artifact or enchantment.\nEvoke {1}{G}",4,'2','2'));
   const art=await g.enterPerm(g.players[1],tagCard(mk('Shiny Rock','Artifact','{2}','',2)));
   const pm=await g.enterPerm(me,fb);
   await g.runOps(me,[{op:'copyDeadToken'}],{name:'Ashling, the Limitless',uid:999},{sacrificed:pm});
   ok('Ashling token copy of Foundation Breaker gets its ETB (destroys the artifact)',!g.players[1].battlefield.includes(art)&&me.battlefield.some(b=>b.card.token&&b.card.name==='Foundation Breaker'),'art '+g.players[1].battlefield.includes(art));
 }

 // ==== v88: behold / blight are the player's choice ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; let asked=null; g.hooks.humanSearch=async c=>{asked=c;return [c.pool.find(x=>x.name==='Bane of Progress')]};
   const bane=tagCard(mk('Bane of Progress','Creature — Elemental','{4}{G}{G}','When this creature enters, destroy all artifacts and enchantments.',6,'2','2')); const sm=tagCard(mk('Smokebraider','Creature — Elemental','{1}{R}','',2,'2','2'));
   me.hand.push(bane,sm); const ch=tagCard(mk('Champion of the Path','Creature — Elemental','{2}{R}','As an additional cost to cast this spell, behold an Elemental and exile it.\nWhen this creature dies, return the exiled card to its owner\'s hand.',3,'3','3'));
   me.hand.push(ch); me.pool=[{c:'R'},{c:'R'},{c:'R'}]; await g.cast(me,ch,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Behold: you choose which Elemental to exile (Bane, not the cheapest Smokebraider)',!!asked&&me.exile.includes(bane)&&me.hand.includes(sm),'asked '+!!asked+' exile '+me.exile.map(c=>c.name));
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; let asked=null;
   const a=await g.enterPerm(me,tagCard(mk('Big','Creature — Elemental','{3}{G}','',4,'4','4'))); const b=await g.enterPerm(me,tagCard(mk('Small','Creature — Elemental','{G}','',1,'1','1')));
   g.hooks.humanPick=async c=>{asked=c;return c.pool.find(x=>x===a||x.card===a.card)||c.pool[0]}; g.hooks.humanSearch=async c=>{asked=c;return [c.pool.find(x=>x.name==='Big')||c.pool[0]]};
   const morc=await g.enterPerm(g.players[1],tagCard(mk('High Perfect Morcant','Legendary Creature — Elf Warlock','{2}{B}{G}','Whenever this creature or another Elf you control enters, each opponent blights 1.',4,'3','3')));
   await g.creatureEntered(g.players[1],morc); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Blight: the blighted player chooses the creature (Big took the -1/-1 counter, Small untouched)',!!asked&&a.counters===-1&&!b.counters,'asked '+!!asked+' a '+a.counters+' b '+b.counters);
 }

 // ==== v89: March of Swirling Mist phases out anyone's creatures ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; const opp=g.players[1];
   const a1=await g.enterPerm(opp,tagCard(mk('Dragon','Creature — Dragon','{4}{R}','Flying',5,'5','5'))); const a2=await g.enterPerm(opp,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2'))); const mine=await g.enterPerm(me,tagCard(mk('Elf1','Creature — Elf','{G}','',1,'1','1')));
   g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Dragon'),c.pool.find(x=>x.name==='Bear')].filter(Boolean).slice(0,c.n||c.max||2);
   const m=tagCard(mk('March of Swirling Mist','Instant','{X}{U}','Choose up to X target creatures. Each of them phases out.',1)); me.hand.push(m); me.pool=[{c:'U'},{c:'U'},{c:'U'}];
   await g.cast(me,m,'hand',null,{x:2}); while(g.stack.length)await g.resolve(); await tick(g);
   ok("March of Swirling Mist: you can phase out two of the opponent's creatures",!opp.battlefield.includes(a1)&&!opp.battlefield.includes(a2)&&me.battlefield.includes(mine),'opp bf '+opp.battlefield.map(b=>b.card.name)+' phased '+(opp.phased||[]).length);
 }

 // ==== v91: Thranduil log — Dionus on any tap, Thranduil's graveyard mana abilities, Fauna Shaman ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   await g.enterPerm(me,tagCard(mk('Dionus, Elvish Archdruid','Legendary Creature — Elf Druid','{3}{G}','Elves you control have "Whenever this creature becomes tapped during your turn, untap it and put a +1/+1 counter on it. This ability triggers only once each turn."',4,'3','3')));
   const dd=await g.enterPerm(me,tagCard(mk('Devoted Druid','Creature — Elf Druid','{1}{G}',"{T}: Add {G}.\nPut a -1/-1 counter on this creature: Untap this creature.",2,'0','2'))); dd.summoning=false; g.refreshStatics(); me.pool=[];
   await g.tapForMana(me,dd,'G'); ok('Dionus: tapping an Elf for mana untaps it with a +1/+1 counter (once)',!dd.tapped&&dd.counters===1&&me.pool.length===1,'tapped '+dd.tapped+' counters '+dd.counters);
   await g.tapForMana(me,dd,'G'); ok('…and the second tap that turn stays tapped',dd.tapped&&dd.counters===1&&me.pool.length===2,'tapped '+dd.tapped);
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   const th=await g.enterPerm(me,tagCard(mk('Thranduil, the Elvenking','Legendary Creature — Elf Noble','{2}{B}{G}{U}','Thranduil has all activated abilities of all Elf cards in your graveyard.\nWhenever another legendary Elf you control enters, draw two cards, then discard a card.',5,'3','3'))); th.summoning=false;
   const dd=tagCard(mk('Devoted Druid','Creature — Elf Druid','{1}{G}',"{T}: Add {G}.\nPut a -1/-1 counter on this creature: Untap this creature.",2,'0','2')); me.graveyard.push(dd); me.pool=[]; th.counters=3;
   ok('Thranduil taps for {G} with Devoted Druid in the graveyard',g.manaSrcs(me).some(x=>x.b===th&&x.colors.includes('G')),'');
   await g.tapForMana(me,th,'G'); const u=g.abilityOptions(me,{}).find(o=>o.perm===th&&o.card===dd); if(u){await g.activate(me,u);while(g.stack.length)await g.resolve();}
   ok("…and Druid's untap (via Thranduil) untaps Thranduil for a -1/-1 counter on Thranduil",!!u&&!th.tapped&&th.counters===2&&me.pool.length===1,'tapped '+th.tapped+' counters '+th.counters);
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; let asked=null; g.hooks.humanSearch=async c=>{asked=c;return [c.pool[0]]};
   const fs=await g.enterPerm(me,tagCard(mk('Fauna Shaman','Creature — Elf Shaman','{G}{G}',"{G}, {T}, Discard a creature card: Search your library for a creature card, reveal it, put it into your hand, then shuffle.",2,'2','2'))); fs.summoning=false;
   me.hand=[tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2')),tagCard(mk('Forest','Basic Land — Forest','','',0))]; me.pool=[{c:'G'}];
   const o=g.abilityOptions(me,{}).find(x=>x.perm===fs); ok('Fauna Shaman: ability offered with a creature in hand and {G} open',!!o,'');
   if(o){await g.activate(me,o);while(g.stack.length)await g.resolve();}
   ok('…discards the creature (not the land) and tutors a creature to hand',!!asked&&!me.hand.some(c=>c.name==='Bear')&&me.hand.some(c=>c.name==='Forest')&&me.hand.some(c=>c.isCreature),'hand '+me.hand.map(c=>c.name));
   me.hand=[tagCard(mk('Forest','Basic Land — Forest','','',0))]; fs.tapped=false; me.pool=[{c:'G'}];
   ok('…and is not offered with only a land in hand',!g.abilityOptions(me,{}).some(x=>x.perm===fs),'');
 }

 // ==== v94: reducers apply to alternative costs; Impulsivity lets you choose ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   const an=await g.enterPerm(me,tagCard(mk('Animar, Soul of Elements','Legendary Creature — Elemental','{U}{R}{G}','Protection from white and from black\nWhenever you cast a creature spell, put a +1/+1 counter on Animar.\nCreature spells you cast cost {1} less to cast for each +1/+1 counter on Animar.',3,'1','1'))); an.counters=3;
   await g.enterPerm(me,tagCard(mk('Ashling, the Limitless','Legendary Creature — Elemental Incarnation','{R}',"Elemental permanent spells you cast from your hand gain evoke {4} as you cast them.\nWhenever you sacrifice a nontoken Elemental, create a token that's a copy of it. The token gains haste until end of turn. At the beginning of your next end step, sacrifice it unless you pay {W}{U}{B}{R}{G}.",1,'2','3')));
   const bane=tagCard(mk('Bane of Progress','Creature — Elemental','{4}{G}{G}','When this creature enters, destroy all artifacts and enchantments.',6,'2','2')); me.hand.push(bane); me.pool=[{c:'G'},{c:'G'},{c:'U'},{c:'U'},{c:'R'}];
   const ev=g.altOptions(me,bane,'hand').find(a=>a.kind==='evoke');
   ok("Animar (3 counters) reduces Ashling's evoke {4} to {1}",!!ev&&ev.cost.generic===1&&ev.cost.total===1,JSON.stringify(ev&&ev.cost));
   const mull=tagCard(mk('Mulldrifter','Creature — Elemental','{4}{U}','Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U}',5,'2','2')); me.hand.push(mull);
   const ev2=g.altOptions(me,mull,'hand').find(a=>a.kind==='evoke'&&a.cost.pips.U===1);
   ok("…and Mulldrifter's own evoke {2}{U} becomes {U}",!!ev2&&ev2.cost.generic===0&&ev2.cost.total===1,JSON.stringify(ev2&&ev2.cost));
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; let asked=null; g.hooks.humanSearch=async c=>{asked=c;return [c.pool.find(x=>x.name==='Blasphemous Act')]};
   g.players[1].graveyard.push(tagCard(mk('Brainstorm','Instant','{U}','Draw three cards, then put two cards from your hand on top of your library in any order.',1)));
   g.players[2].graveyard.push(tagCard(mk('Blasphemous Act','Sorcery','{8}{R}','This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature.',9)));
   const bear=await g.enterPerm(g.players[1],tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2')));
   const imp=tagCard(mk('Impulsivity','Creature — Elemental Incarnation','{6}{R}',"When this creature enters, you may cast target instant or sorcery card from a graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.",7,'6','6'));
   const pm=await g.enterPerm(me,imp); await g.runOps(me,imp.etbOps,imp,{perm:pm}); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Impulsivity: you choose the instant/sorcery from any graveyard (Blasphemous Act, not the first card)',!!asked&&asked.pool.length===2&&!g.players[1].battlefield.includes(bear)&&g.players[2].exile.some(c=>c.name==='Blasphemous Act'),'asked '+(asked&&asked.pool.map(c=>c.name))+' bear alive '+g.players[1].battlefield.includes(bear));
 }

 // ==== v95: Kogla's cast-time target is its ETB fight; spree parsed from its mode lines ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; const opp=g.players[1];
   const ring=await g.enterPerm(opp,tagCard(mk('Sol Ring','Artifact','{1}','{T}: Add {C}{C}.',1))); const bear=await g.enterPerm(opp,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2')));
   const kg=tagCard(mk('Kogla, the Titan Ape','Legendary Creature — Ape','{3}{G}{G}{G}',"When Kogla enters, it fights up to one target creature you don't control.\nWhenever Kogla attacks, destroy target artifact or enchantment defending player controls.\n{1}{G}: Return target Human you control to its owner's hand. Kogla gains indestructible until end of turn.",6,'7','6'));
   ok('Kogla: cast-time targets are creatures (ETB fight), not artifacts (attack trigger)',!g.targetOk(kg,ring,me)&&g.targetOk(kg,bear,me),'');
   me.hand.push(kg); me.pool=Array(6).fill(0).map(()=>({c:'G'})); const n0=g.log.length; await g.cast(me,kg,'hand',bear); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Kogla fights the chosen creature (no bounce, Sol Ring untouched)',!opp.battlefield.includes(bear)&&opp.battlefield.includes(ring)&&g.log.slice(n0).some(x=>/fights Bear/.test(x.m))&&!g.log.slice(n0).some(x=>/returns to/.test(x.m)),g.log.slice(n0).map(x=>x.m).join(' | '));
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   const ss=tagCard(mk("Smuggler's Surprise",'Instant','{1}{G}',"+ {2} — Mill four cards. You may put up to two creature and/or land cards from among the milled cards into your hand.\n+ {4}{G} — You may put up to two creature cards from your hand onto the battlefield.\n+ {1} — Creatures you control with power 4 or greater gain hexproof and indestructible until end of turn.",2));
   ok('Spree recognised from its + {cost} — lines even without the reminder line',!!ss.costModes&&ss.modes.length===3&&ss.modes[0].cost.total===2,'');
   me.pool=[{c:'G'},{c:'G'}]; me.hand.push(ss);
   ok('…and with 2 mana it is not castable (base {1}{G} + cheapest mode {1} = 3)',!g.castMode(me,ss,'hand'),String(g.castMode(me,ss,'hand')));
 }

 // ==== v96: foretell with reminder text ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   const fs=tagCard(mk('The Foretold Soldier','Creature — Alien Zombie Soldier','{2}{G}{G}',"This creature must be blocked if able.\nThis creature can't be blocked by more than one creature.\nWhenever this creature deals damage, exile it face down. It becomes foretold.\nForetell {1}{G} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)",4,'6','6'));
   me.hand.push(fs); me.pool=[{c:'G'},{c:'G'}];
   const o=g.abilityOptions(me,{}).find(x=>x.card===fs&&x.ab&&x.ab.label==='foretell');
   ok('The Foretold Soldier offers foretell from hand (reminder text no longer breaks the parse)',!!o,'');
   if(o){await g.activate(me,o);while(g.stack.length)await g.resolve();}
   ok('…foretelling exiles it for {2}',!me.hand.includes(fs)&&me.exile.includes(fs)&&me.pool.length===0,'hand '+me.hand.includes(fs)+' exile '+me.exile.includes(fs)+' pool '+me.pool.length);
   ok('…and it cannot be cast the same turn',!g.castMode(me,fs,'exile'),String(g.castMode(me,fs,'exile')));
   g.turn+=4; me.pool=[{c:'G'},{c:'G'}];
   const e=(me.exileCast||[]).find(x=>x.card===fs); ok('…but on a later turn it casts for its foretell cost {1}{G}',!!g.castMode(me,fs,'exile')&&e&&e.cost.total===2&&e.cost.pips.G===1,'mode '+g.castMode(me,fs,'exile')+' cost '+JSON.stringify(e&&e.cost).slice(0,60));
 }

 // ==== v97: dungeons, manifest, face-down keywords with reminder text, plot ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; const asked=[]; g.hooks.humanChoice=async c=>{asked.push(c.question);return c.options.find(o=>/Tomb of Annihilation/.test(o))||c.options.find(o=>/Oubliette/.test(o))||c.options[0]}; g.hooks.humanSearch=async c=>[c.pool[0]]; g.hooks.humanDiscard=async q=>q.hand[0];
   const nad=tagCard(mk('Nadaar, Selfless Paladin','Legendary Creature — Dragon Knight','{2}{W}',"Vigilance\nWhenever Nadaar enters or attacks, venture into the dungeon. (Enter the first room or advance to the next room.)\nOther creatures you control get +1/+1 as long as you've completed a dungeon.",3,'3','3'));
   ok('Nadaar: "enters or attacks, venture" parses to an ETB and an attack trigger',!!(nad.etbOps||[]).some(o=>o.op==='venture')&&nad.triggers.some(t=>t.when==='attack'&&t.ops.some(o=>o.op==='venture')),JSON.stringify(nad.etbOps)+' '+JSON.stringify(nad.triggers.map(t=>t.when)));
   const pm=await g.enterPerm(me,nad); await g.runOps(me,nad.etbOps,nad,{perm:pm}); while(g.stack.length)await g.resolve(); await tick(g);
   ok('…entering asks which dungeon and enters Tomb of Annihilation: Trapped Entry (each player loses 1)',asked.some(q=>/Which dungeon/.test(q))&&me.dungeon&&me.dungeon.key==='tomb'&&me.dungeon.room==='entry'&&me.life===39&&g.players[1].life===39,'asked '+asked.join('|')+' dungeon '+JSON.stringify(me.dungeon)+' life '+me.life);
   me.hand=[tagCard(mk('Forest','Basic Land — Forest','','',0))]; const art=await g.enterPerm(me,tagCard(mk('Sol Ring','Artifact','{1}','{T}: Add {C}{C}.',1))); await g.enterPerm(me,tagCard(mk('Plains','Basic Land — Plains','','',0)));
   await g.runOps(me,nad.etbOps,nad,{perm:pm}); while(g.stack.length)await g.resolve(); await tick(g);
   ok('…the second venture asks for the room (Veils of Fear vs Oubliette) and Oubliette discards + sacrifices artifact/creature/land',asked.filter(q=>/which room/.test(q)).length===1&&me.dungeon.room==='oubliette'&&me.hand.length===0&&!me.battlefield.includes(art),'room '+me.dungeon.room+' hand '+me.hand.length+' art '+me.battlefield.includes(art));
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   const top=tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2')); me.library.push(top);
   const ss=tagCard(mk('Soul Summons','Sorcery','{1}{W}',"Manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)",2));
   ok('manifest parses',!!(ss.spellOpsX||ss.spellOps||[]).some&&JSON.stringify(ss.spellOpsX||ss.spellOps).includes('manifest'),JSON.stringify(ss.spellOpsX||ss.spellOps));
   me.hand.push(ss); me.pool=[{c:'W'},{c:'W'}]; await g.cast(me,ss,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   const fd=me.battlefield.find(b=>b.faceDown); ok('…a face-down 2/2 enters',!!fd&&g.powerOf(me,fd)===2&&fd.card.faceDownOf===top,'');
   me.pool=[{c:'G'},{c:'G'}]; const up=g.abilityOptions(me,{}).find(o=>o.perm===fd); if(up){await g.activate(me,up);while(g.stack.length)await g.resolve();}
   ok('…and turns face up for the Bear\'s mana cost',!!up&&fd.card===top&&!fd.faceDown,'');
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   const dp=tagCard(mk('Den Protector','Creature — Human Warrior','{1}{G}',"Creatures with power less than Den Protector's power can't block it.\nMegamorph {1}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)\nWhen Den Protector is turned face up, return target card from your graveyard to your hand.",2,'2','1'));
   me.hand.push(dp); me.pool=[{c:'G'},{c:'G'},{c:'G'}]; const alt=g.altOptions(me,dp,'hand').find(a=>a.kind==='faceDown');
   ok('Megamorph (with reminder text): face-down cast for {3} offered',!!alt&&alt.cost.total===3,'');
   g.hooks.humanPayOpt=async c=>c.alts.find(a=>a.kind==='faceDown'); await g.cast(me,dp,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   const fd=me.battlefield.find(b=>b.faceDown); me.pool=[{c:'G'},{c:'G'}]; const up=fd&&g.abilityOptions(me,{}).find(o=>o.perm===fd); if(up){await g.activate(me,up);while(g.stack.length)await g.resolve();}
   ok('…turning it face up for {1}{G} adds a +1/+1 counter',!!fd&&fd.card===dp&&fd.counters===1,'fd '+!!fd+' counters '+(fd&&fd.counters));
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   const fb=tagCard(mk('Fblthp, Lost on the Range','Legendary Creature — Homunculus','{2}{U}',"You may look at the top card of your library any time.\nPlot {2}{U} (You may pay {2}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",3,'1','1'));
   me.hand.push(fb); me.pool=[{c:'U'},{c:'U'},{c:'U'}]; const o=g.abilityOptions(me,{}).find(x=>x.card===fb&&x.ab.label==='plot');
   ok('Plot (with reminder text) offered from hand',!!o,''); if(o){await g.activate(me,o);while(g.stack.length)await g.resolve();}
   ok('…plotted card is exiled and not castable this turn',me.exile.includes(fb)&&!g.castMode(me,fb,'exile'),''); g.turn+=4;
   ok('…and is castable free on a later turn',g.castMode(me,fb,'exile')==='free',String(g.castMode(me,fb,'exile')));
 }

 // ==== v98: Farseek tapped, Banneret, Assassin's Trophy rider, Cavalier cycle ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; let mayAsked=0; g.hooks.humanMay=async()=>{mayAsked++;return true}; g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Breeding Pool')||c.pool[0]];
   me.library.push(tagCard(mk('Breeding Pool','Land — Forest Island','',"({T}: Add {G} or {U}.)\nAs Breeding Pool enters, you may pay 2 life. If you don't, it enters tapped.",0)));
   const fs=tagCard(mk('Farseek','Sorcery','{1}{G}','Search your library for a Plains, Island, Swamp, or Mountain card, put it onto the battlefield tapped, then shuffle.',2)); me.hand.push(fs); me.pool=[{c:'G'},{c:'G'}];
   await g.cast(me,fs,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   const bp=me.battlefield.find(b=>b.card.name==='Breeding Pool'); ok('Farseek: the shockland enters tapped with no pay-2-life question',!!bp&&bp.tapped&&mayAsked===0&&me.life===40,'bp '+!!bp+' tapped '+(bp&&bp.tapped)+' asked '+mayAsked);
 }
 { const g=fresh(); const me=g.players[0];
   await g.enterPerm(me,tagCard(mk('Brighthearth Banneret','Creature — Elemental Warrior','{1}{R}',"Elemental spells and Warrior spells you cast cost {1} less to cast.\nReinforce 1—{1}{R} ({1}{R}, Discard this card: Put a +1/+1 counter on target creature.)",2,'1','1')));
   const rr=tagCard(mk('Risen Reef','Creature — Elemental','{1}{G}{U}','',3,'1','1')); const c=g.costOf(me,rr,'hand');
   ok('Brighthearth Banneret: Risen Reef costs {G}{U}',c.total===2&&c.generic===0,JSON.stringify(c).slice(0,80));
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; const ai=g.players[1]; let searched=null; g.hooks.humanSearch=async c=>{searched=c;return [c.pool[0]]};
   me.library.push(tagCard(mk('Forest','Basic Land — Forest','','',0))); const bear=await g.enterPerm(me,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2')));
   const tro=tagCard(mk("Assassin's Trophy",'Instant','{B}{G}',"Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.",2)); ai.hand.push(tro); ai.pool=[{c:'B'},{c:'G'}];
   const n0=me.battlefield.length; await g.cast(ai,tro,'hand',bear); while(g.stack.length)await g.resolve(); await tick(g);
   ok("Assassin's Trophy: the victim searches for a basic land (untapped)",!me.battlefield.includes(bear)&&!!searched&&me.battlefield.length===n0&&me.battlefield.some(b=>b.card.isLand&&!b.tapped&&b.enteredTurn===g.turn),'bear '+me.battlefield.includes(bear)+' searched '+!!searched);
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; let asked=null; g.hooks.humanSearch=async c=>{asked=c;return [c.pool.find(x=>x.name==='Island')||c.pool[0]]}; g.hooks.humanMay=async()=>true;
   me.library.push(tagCard(mk('Elf','Creature — Elf','{G}','',1,'1','1')),tagCard(mk('Island','Basic Land — Island','','',0)),tagCard(mk('Elf','Creature — Elf','{G}','',1,'1','1')),tagCard(mk('Forest','Basic Land — Forest','','',0)),tagCard(mk('Elf','Creature — Elf','{G}','',1,'1','1')));
   const cav=tagCard(mk('Cavalier of Thorns','Creature — Elemental Knight','{2}{G}{G}{G}',"Reach\nWhen this creature enters, reveal the top five cards of your library. Put a land card from among them onto the battlefield and the rest into your graveyard.\nWhen this creature dies, you may exile it. If you do, put another target card from your graveyard on top of your library.",5,'5','6'));
   const pm=await g.enterPerm(me,cav); await g.runOps(me,cav.etbOps,cav,{perm:pm}); await tick(g);
   ok('Cavalier of Thorns: you choose which revealed land enters (Island over Forest)',!!asked&&asked.pool.length===2&&me.battlefield.some(b=>b.card.name==='Island')&&!me.battlefield.some(b=>b.card.name==='Forest'),'asked '+(asked&&asked.pool.map(c=>c.name)));
   asked=null; g.hooks.humanSearch=async c=>{asked=c;return [c.pool.find(x=>x.name==='Forest')]}; await g.destroy(me,pm,false); while(g.stack.length)await g.resolve(); await tick(g);
   ok('…and on death you choose the graveyard card to put on top (Forest)',!!asked&&me.exile.includes(cav)&&me.library[me.library.length-1].name==='Forest','asked '+!!asked+' top '+me.library[me.library.length-1].name);
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanSearch=async c=>c.pool.slice(0,2); me.graveyard.push(tagCard(mk('Forest','Basic Land — Forest','','',0)),tagCard(mk('Forest','Basic Land — Forest','','',0)),tagCard(mk('Forest','Basic Land — Forest','','',0)));
   const cf=tagCard(mk('Cavalier of Flame','Creature — Elemental Knight','{2}{R}{R}{R}',"{1}{R}: Creatures you control get +1/+0 and gain haste until end of turn.\nWhen Cavalier of Flame enters, discard any number of cards, then draw that many cards.\nWhen Cavalier of Flame dies, it deals X damage to each opponent and each planeswalker they control, where X is the number of land cards in your graveyard.",5,'6','5'));
   me.hand=[tagCard(mk('A','Sorcery','{5}','',5)),tagCard(mk('B','Sorcery','{6}','',6)),tagCard(mk('C','Sorcery','{7}','',7))]; const pm=await g.enterPerm(me,cf); await g.runOps(me,cf.etbOps,cf,{perm:pm}); await tick(g);
   ok('Cavalier of Flame: discards the cards you choose and draws that many',me.hand.length===3&&!me.hand.some(c=>c.name==='A'),'hand '+me.hand.map(c=>c.name));
   const l0=g.players[1].life; await g.destroy(me,pm,false); while(g.stack.length)await g.resolve(); await tick(g);
   ok('…and on death deals X = land cards in your graveyard (3) to each opponent',g.players[1].life===l0-3&&g.players[2].life===l0-3,'life '+g.players[1].life);
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanSearch=async c=>[c.pool[0]]; g.hooks.humanMay=async()=>true;
   const cn=tagCard(mk('Cavalier of Night','Creature — Elemental Knight','{2}{B}{B}{B}',"Lifelink\nWhen Cavalier of Night enters, you may sacrifice another creature. When you do, destroy target creature an opponent controls.\nWhen Cavalier of Night dies, return target creature card with mana value 3 or less from your graveyard to the battlefield.",5,'4','5'));
   const fod=await g.enterPerm(me,tagCard(mk('Elf','Creature — Elf','{G}','',1,'1','1'))); const bear=await g.enterPerm(g.players[1],tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2')));
   const pm=await g.enterPerm(me,cn); await g.runOps(me,cn.etbOps,cn,{perm:pm}); await tick(g);
   ok('Cavalier of Night: sacrifice another creature → destroy an opponent\'s creature',!me.battlefield.includes(fod)&&!g.players[1].battlefield.includes(bear),'fod '+me.battlefield.includes(fod)+' bear '+g.players[1].battlefield.includes(bear));
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanSearch=async c=>[c.pool[0]];
   const cg=tagCard(mk('Cavalier of Gales','Creature — Elemental Knight','{2}{U}{U}{U}',"Flying\nWhen Cavalier of Gales enters, draw three cards, then put two cards from your hand on top of your library in any order.\nWhen Cavalier of Gales dies, shuffle it into its owner's library, then scry 2.",5,'5','5'));
   const h0=me.hand.length, l0=me.library.length; const pm=await g.enterPerm(me,cg); await g.runOps(me,cg.etbOps,cg,{perm:pm}); await tick(g);
   ok('Cavalier of Gales: draw three, put two back (net +1 card, library −1)',me.hand.length===h0+1&&me.library.length===l0-1,'hand '+me.hand.length+' lib '+me.library.length);
   await g.destroy(me,pm,false); while(g.stack.length)await g.resolve(); await tick(g);
   ok('…and on death it is shuffled into the library (not in the graveyard)',me.library.includes(cg)&&!me.graveyard.includes(cg),'');
 }

 // ==== v99: auto-pay prefers Path of Ancestry / Cavern of Souls for qualifying creatures ====
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; let scried=false; g.hooks.humanSearch=async c=>{if(c.dest==='scry')scried=true;return c.pool||[]};
   me.command=[tagCard(mk('Ashling, the Limitless','Legendary Creature — Elemental Incarnation','{R}','',1,'2','3'))]; me.command[0].isCommander=true;
   const [poa]=await g.landEnters(me,tagCard(mk('Path of Ancestry','Land','',"Path of Ancestry enters tapped.\n{T}: Add one mana of any color. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1.",0))); poa.tapped=false;
   for(let i=0;i<3;i++)await g.landEnters(me,tagCard(mk('Mountain','Basic Land — Mountain','','',0))); me.pool=[];
   const fb=tagCard(mk('Flamebraider','Creature — Elemental Shaman','{2}{R}','',3,'2','2')); me.hand.push(fb);
   await g.cast(me,fb,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Auto-pay uses Path of Ancestry for an Elemental (commander Elemental) and scries',poa.tapped&&scried,'poa tapped '+poa.tapped+' scried '+scried);
   const [poa2]=[poa]; poa.tapped=false; me.battlefield.filter(b=>b.card.isLand).forEach(b=>b.tapped=false); me.pool=[]; scried=false;
   const bear=tagCard(mk('Bear','Creature — Bear','{1}{R}','',2,'2','2')); me.hand.push(bear); await g.cast(me,bear,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   ok('…but a non-matching creature is paid with the basics first (Path untapped, no scry)',!poa.tapped&&!scried,'poa tapped '+poa.tapped+' scried '+scried);
 }
 { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanChoice=async()=>'Elemental';
   const cav=tagCard(mk('Cavern of Souls','Land','',"As Cavern of Souls enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered.",0)); me.hand.push(cav); await g.playLand(me,cav); const cp=me.battlefield.find(b=>b.card===cav);
   for(let i=0;i<3;i++)await g.landEnters(me,tagCard(mk('Mountain','Basic Land — Mountain','','',0))); me.pool=[];
   const fb=tagCard(mk('Flamebraider','Creature — Elemental Shaman','{2}{R}','',3,'2','2')); me.hand.push(fb); const n0=g.log.length; await g.cast(me,fb,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Cavern of Souls (Elemental) pays for an Elemental and makes it uncounterable',cp.tapped&&g.lastSpend.cavern===true&&g.log.slice(n0).some(x=>/can't be countered \(Cavern of Souls mana\)/.test(x.m)),'tapped '+cp.tapped+' cavern '+g.lastSpend.cavern);
   me.battlefield.filter(b=>b.card.isLand).forEach(b=>b.tapped=false); me.pool=[]; const n1=g.log.length;
   const bear=tagCard(mk('Bear','Creature — Bear','{1}{R}','',2,'2','2')); me.hand.push(bear); await g.cast(me,bear,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   ok('…a Bear is paid with Mountains and is counterable',!cp.tapped&&!g.lastSpend.cavern&&!g.log.slice(n1).some(x=>/can't be countered/.test(x.m)),'tapped '+cp.tapped+' cavern '+g.lastSpend.cavern);
 }

 { // v100: Toxic Deluge X is chosen and gives -X/-X; Aura Shards offers enchantments; Sapling logs life; atk-all uses combatPow
   const g=fresh(); const me=g.players[0], op=g.players[1]; me.human=true; me.life=20;
   for(let i=0;i<3;i++)await g.landEnters(me,tagCard(mk('Swamp','Basic Land — Swamp','','',0))); me.pool=[];
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const wall=put(me,tagCard(mk('Wall of Tanglecord','Creature — Wall','{2}','Defender',2,'0','6'))); const bear=put(op,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2'))); const ogre=put(op,tagCard(mk('Ogre','Creature — Ogre','{3}{R}','',4,'4','4')));
   const td=tagCard(mk('Toxic Deluge','Sorcery','{2}{B}',"As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.",3)); me.hand.push(td);
   ok('Toxic Deluge parses -X/-X',td.spellOps&&td.spellOps.some(o=>o.op==='shrinkAll'&&o.n==='X'),JSON.stringify(td.spellOps));
   let asked=null; g.hooks.humanNumber=async c=>{asked=c;return 2};
   await g.cast(me,td,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   ok('Toxic Deluge asks for X and takes that much life',asked&&asked.max>=2&&me.life===18,'life '+me.life+' asked '+JSON.stringify(asked&&{min:asked.min,max:asked.max}));
   ok('X=2 kills the 2/2, not the 4/4 or the 0/6 wall',!op.battlefield.includes(bear)&&op.battlefield.includes(ogre)&&me.battlefield.includes(wall),op.battlefield.map(b=>b.card.name).join()+' | '+me.battlefield.filter(b=>b.card.isCreature).map(b=>b.card.name).join());
   // Aura Shards
   const g2=fresh(); const m2=g2.players[0], o2=g2.players[1]; m2.human=true; m2.ai=null;
   put(m2,tagCard(mk('Aura Shards','Enchantment','{1}{G}{W}','Whenever a creature you control enters, you may destroy target artifact or enchantment.',3)));
   put(o2,tagCard(mk('Propaganda','Enchantment','{2}{U}',"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.",3))); put(o2,tagCard(mk('Talisman','Artifact','{2}','{T}: Add {C}.',2)));
   let pool=null; g2.hooks.humanMay=async()=>true; g2.hooks.humanSearch=async c=>{pool=(c.pool||[]).map(x=>x.name);return [c.pool.find(x=>x.name==='Propaganda')]};
   { const pm=await g2.enterPerm(m2,tagCard(mk('Elf','Creature — Elf','{1}{G}','',2,'2','2'))); await g2.creatureEntered(m2,pm); await tick(g2); }
   ok('Aura Shards offers artifacts AND enchantments, destroys the chosen enchantment',pool&&pool.includes('Propaganda')&&pool.includes('Talisman')&&!o2.battlefield.some(b=>b.card.name==='Propaganda'),JSON.stringify(pool));
   // Sapling
   const g3=fresh(); const m3=g3.players[0]; m3.human=true; m3.life=20; let shown=null; g3.hooks.humanMay=async c=>{if(c.cards)shown=c;return true};
   const sap=put(m3,tagCard(mk('Sapling of Colfenor','Legendary Creature — Treefolk Shaman','{3}{G}{G}',"Indestructible\nWhenever Sapling of Colfenor attacks, reveal the top card of your library. If it's a creature card, you gain life equal to that card's toughness, lose life equal to its power, then put it into your hand.",5,'2','5')));
   m3.library.push(tagCard(mk('Stalwart Shield-Bearers','Creature — Human Soldier','{1}{W}','Defender\nOther creatures you control with defender get +0/+2.',2,'0','3')));
   const n3=g3.log.length; await g3.runOps(m3,sap.card.triggers[0].ops,sap.card,{perm:sap});
   ok('Sapling shows the revealed card and logs the life',shown&&shown.ok&&shown.cards[0].name==='Stalwart Shield-Bearers'&&m3.life===23&&m3.hand.some(c=>c.name==='Stalwart Shield-Bearers')&&g3.log.slice(n3).some(x=>/gains 3 life/.test(x.m)),'life '+m3.life+' shown '+!!shown);
   // Stalwart lord + combatPow
   const fel=put(m3,tagCard(mk('Felothar the Steadfast','Legendary Creature — Human Warrior','{1}{W}{B}{G}',"Each creature you control assigns combat damage equal to its toughness rather than its power.\nCreatures you control can attack as though they didn't have defender.",4,'0','5')));
   const sb=put(m3,m3.hand.find(c=>c.name==='Stalwart Shield-Bearers')); const wo=put(m3,tagCard(mk('Wall of Omens','Creature — Wall','{1}{W}','Defender',2,'0','4'))); g3.refreshStatics();
   ok('Stalwart gives other defenders +0/+2 and Felothar makes a 0-power wall hit for its toughness',g3.toughOf(m3,wo)===6&&g3.toughOf(m3,sb)===3&&g3.combatPow(m3,wo)===6,'wo '+g3.toughOf(m3,wo)+' sb '+g3.toughOf(m3,sb)+' pow '+g3.combatPow(m3,wo));
 }

 { // v101: Duelist's Heritage fires on anyone's attack and the controller picks; Ardenn asks target + pieces; Mother of Runes asks colour
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const g=fresh(); const me=g.players[0], op=g.players[1]; me.human=true; me.ai=null;
   const dh=tagCard(mk("Duelist's Heritage",'Enchantment','{2}{W}','Whenever one or more creatures attack, you may have target attacking creature gain double strike until end of turn.',3));
   ok('Duelist parses as any-attack trigger',dh.triggers&&dh.triggers[0].anyAttack&&dh.triggers[0].ops[0].any,JSON.stringify(dh.triggers));
   put(me,dh); const a1=put(me,tagCard(mk('Knight','Creature — Knight','{1}{W}','',2,'2','2'))), a2=put(me,tagCard(mk('Giant','Creature — Giant','{3}{R}','',4,'4','4')));
   let pool=null; g.hooks.humanSearch=async c=>{pool=c.pool.map(x=>x.name);return [c.pool.find(x=>x.name==='Knight')]};
   await g.attackTriggers(me,[{attacker:a1,defender:op},{attacker:a2,defender:op}]);
   ok('Duelist: human picks the attacker (not auto-biggest)',pool&&pool.length===2&&(a1.kwT||[]).includes('double strike')&&!(a2.kwT||[]).includes('double strike'),JSON.stringify(pool)+' '+JSON.stringify([a1.kwT,a2.kwT]));
   // opponent attacks: my Duelist still triggers, offering their attackers
   const g2=fresh(); const m2=g2.players[0], o2=g2.players[1]; m2.human=true; m2.ai=null; put(m2,tagCard(mk("Duelist's Heritage",'Enchantment','{2}{W}','Whenever one or more creatures attack, you may have target attacking creature gain double strike until end of turn.',3)));
   const ob=put(o2,tagCard(mk('Orc','Creature — Orc','{2}{R}','',3,'3','3'))); let pool2=null; g2.hooks.humanSearch=async c=>{pool2=c.pool.map(x=>x.name);return []};
   await g2.attackTriggers(o2,[{attacker:ob,defender:g2.players[2]}]);
   ok("Duelist fires on an opponent's attack and I may decline",pool2&&pool2.includes('Orc')&&!(ob.kwT||[]).includes('double strike'),JSON.stringify(pool2));
   // Ardenn
   const g3=fresh(); const m3=g3.players[0]; m3.human=true; m3.ai=null;
   const ard=put(m3,tagCard(mk('Ardenn, Intrepid Archaeologist','Legendary Creature — Kor Scout','{2}{W}','At the beginning of combat on your turn, you may attach any number of Auras and Equipment you control to target permanent or player.',3,'2','2')));
   const big=put(m3,tagCard(mk('Big','Creature — Giant','{4}{G}','',5,'5','5'))), small=put(m3,tagCard(mk('Small','Creature — Elf','{G}','',1,'1','1')));
   const e1=put(m3,tagCard(mk('Hammer','Artifact — Equipment','{1}','Equipped creature gets +10/+10.\nEquip {8}',1))), e2=put(m3,tagCard(mk('Boots','Artifact — Equipment','{1}','Equipped creature has haste.\nEquip {1}',1)));
   const asked=[]; g3.hooks.humanSearch=async c=>{asked.push(c.pool.map(x=>x.name)); if(c.dest==='attach') return [c.pool.find(x=>x.name==='Hammer')]; return [c.pool.find(x=>x.name==='Small')]};
   await g3.runOps(m3,ard.card.triggers[0].ops,ard.card,{perm:ard});
   ok('Ardenn: I pick the creature and which pieces move',asked.length===2&&e1.attachedTo===small.id&&e2.attachedTo==null,JSON.stringify(asked)+' '+(e1.attachedTo===small.id));
   // Mother of Runes
   const g4=fresh(); const m4=g4.players[0]; m4.human=true; m4.ai=null;
   const mom=tagCard(mk('Mother of Runes','Creature — Human Cleric','{W}','{T}: Target creature you control gains protection from the color of your choice until end of turn.',1,'1','1'));
   ok('Mother of Runes parses protColor',mom.abilities&&mom.abilities.some(a=>a.ops.some(o=>o.op==='protColor')),JSON.stringify(mom.abilities));
   const mm=put(m4,mom), kn=put(m4,tagCard(mk('Knight','Creature — Knight','{1}{W}','',2,'2','2')));
   let q=null; g4.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Knight')]; g4.hooks.humanChoice=async c=>{q=c;return 'green'};
   await g4.runOps(m4,mom.abilities.find(a=>a.ops.some(o=>o.op==='protColor')).ops,mom,{perm:mm});
   ok('Mother of Runes: colour is my choice',q&&q.options.length===5&&kn.protColor&&kn.protColor.c==='G','q '+JSON.stringify(q&&q.options)+' prot '+JSON.stringify(kn.protColor));
 }

 { // v102: Command Tower only offers identity colours; Spelunking's 4 life needs a Cave; drain logs life totals
   const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
   const ct=tagCard(mk('Command Tower','Land','',"{T}: Add one mana of any color in your commander's color identity.",0)); const [pm]=await g.landEnters(me,ct);
   const src=g.manualSrcs(me).find(x=>x.b===pm); const id=g.b1_opalColors(me);
   ok('Command Tower offers only commander-identity colours',src&&id.length&&src.colors.every(c=>id.includes(c))&&src.colors.length===id.length,JSON.stringify([src&&src.colors,id]));
   const sp=tagCard(mk('Spelunking','Enchantment','{2}{G}',"When this enchantment enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life.\nLands you control enter untapped.",3));
   ok('Spelunking: no flat gain 4',!(sp.etbOps||[]).some(o=>o.op==='gain')&&(sp.etbOps||[]).some(o=>o.op==='landFromHand'&&o.caveGain===4),JSON.stringify(sp.etbOps));
   me.life=20; me.hand=[tagCard(mk('Swamp','Basic Land — Swamp','','',0))]; g.hooks.humanSearch=async c=>[c.pool[0]];
   await g.runOps(me,sp.etbOps.filter(o=>o.op==='landFromHand'),sp,{}); ok('Spelunking: a Swamp gives no life',me.life===20,'life '+me.life);
   me.hand=[tagCard(mk('Hidden Cataract','Land — Cave','','{T}: Add {U}.',0))]; await g.runOps(me,sp.etbOps.filter(o=>o.op==='landFromHand'),sp,{}); ok('Spelunking: a Cave gives 4',me.life===24,'life '+me.life);
   const n0=g.log.length; g.players[1].life=3; await g.runOps(me,[{op:'drain',n:5,each:true,gainLost:true}],{name:'Kokusho'},{});
   const lines=g.log.slice(n0).map(x=>x.m).join('\n'); ok('drain logs every opponent and the gain',/P1 3 → -2/.test(lines)&&/gains 15/.test(lines),lines);
 }

 { // v103: Adeline's attacking tokens are Human, white, and enter properly (lords apply, Cathars' Crusade fires)
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const g=fresh(); const me=g.players[0], op=g.players[1]; me.human=true; me.ai=null;
   const ad=tagCard(mk('Adeline, Resplendent Cathar','Legendary Creature — Human Knight','{1}{W}{W}',"Vigilance\nAdeline, Resplendent Cathar's power is equal to the number of creatures you control.\nWhenever you attack, for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker they control.",3,'*','4'));
   const tr=(ad.triggers||[]).find(t=>t.when==='attack'); ok('Adeline parses attacking Human tokens',tr&&tr.ops[0].op==='attackingTokens'&&tr.ops[0].types==='Human'&&JSON.stringify(tr.ops[0].tcolors)==='["W"]',JSON.stringify(ad.triggers));
   const pa=put(me,ad); const banner=tagCard(mk('Patchwork Banner','Artifact','{3}','As this artifact enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1.\n{T}: Add one mana of any color.',3)); const pb=put(me,g.chosenTypeCard(banner,'human')); pb.chosenType='human';
   put(me,tagCard(mk("Cathars' Crusade",'Enchantment','{3}{W}{W}','Whenever a creature you control enters, put a +1/+1 counter on each creature you control.',5)));
   g.refreshStatics(); const before=me.battlefield.length;
   await g.attackTriggers(me,[{attacker:pa,defender:op}]); await tick(g);
   const toks=me.battlefield.filter(b=>b.card.token); g.refreshStatics();
   ok('three Human tokens, typed and white',toks.length===3&&toks.every(b=>/Human/.test(b.card.type)&&b.card.colors.includes('W')),toks.map(b=>b.card.type+'/'+b.card.colors).join());
   ok("Cathars' Crusade put counters on them (3 triggers → 3 counters each)",toks.every(b=>(b.counters||0)===3),toks.map(b=>b.counters).join());
   ok('Patchwork Banner (Human) buffs them: toughness 1+3+1',toks.every(b=>g.toughOf(me,b)===5),toks.map(b=>g.powerOf(me,b)+'/'+g.toughOf(me,b)).join());
 }

 { // v104: Intangible Virtue is one anthem (+1/+1 vigilance), not two
   const iv=tagCard(mk('Intangible Virtue','Enchantment','{1}{W}','Creature tokens you control get +1/+1 and have vigilance.',2));
   const an=(iv.anthems||[]).filter(a=>a.filter==='token'); ok('Intangible Virtue: single token anthem with vigilance',an.length===1&&an[0].pump[0]===1&&an[0].kws.includes('vigilance'),JSON.stringify(iv.anthems));
   const iv2=tagCard(mk('Plain Virtue','Enchantment','{1}{W}','Creature tokens you control get +2/+2.',2)); ok('plain token anthem still parses',(iv2.anthems||[]).length===1&&iv2.anthems[0].pump[0]===2,JSON.stringify(iv2.anthems));
 }

 { // v106: Jori En draws on the second spell each turn (and only then)
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; for(let i=0;i<6;i++)await g.landEnters(me,tagCard(mk('Island','Basic Land — Island','','',0)));
   put(me,tagCard(mk('Jori En, Ruin Diver','Legendary Creature — Merfolk Wizard','{1}{U}{R}','Whenever you cast your second spell each turn, draw a card.',3,'2','3')));
   const s1=tagCard(mk('Opt','Instant','{U}','Scry 1. Draw a card.',1)), s2=tagCard(mk('Opt','Instant','{U}','Scry 1. Draw a card.',1)), s3=tagCard(mk('Opt','Instant','{U}','Scry 1. Draw a card.',1)); s1.spellOps=s2.spellOps=s3.spellOps=[]; me.hand.push(s1,s2,s3); me.spellsThisTurn=0;
   const h0=me.hand.length; g.hooks.humanSearch=async c=>[]; 
   await g.cast(me,s1,'hand'); while(g.stack.length)await g.resolve(); await tick(g); const h1=me.hand.length;
   await g.cast(me,s2,'hand'); while(g.stack.length)await g.resolve(); await tick(g); const h2=me.hand.length;
   await g.cast(me,s3,'hand'); while(g.stack.length)await g.resolve(); await tick(g); const h3=me.hand.length;
   ok('Jori En: no draw on 1st, draw on 2nd, none on 3rd',h1===h0&&h2===h1+1&&h3===h2,[h0,h1,h2,h3].join());
 }

 { // v107: Gandalf the Grey never offers a mode already chosen; Mizzix's Mastery overload is the graveyard flashback, not a Rift
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; for(let i=0;i<8;i++)await g.landEnters(me,tagCard(mk('Island','Basic Land — Island','','',0)));
   const gg=put(me,tagCard(mk('Gandalf the Grey','Legendary Creature — Avatar Wizard','{3}{U}{R}',"Whenever you cast an instant or sorcery spell, choose one that hasn't been chosen —\n• You may tap or untap target permanent.\n• Gandalf deals 3 damage to each opponent.\n• Copy target instant or sorcery spell you control. You may choose new targets for the copy.\n• Put Gandalf on top of its owner's library.",5,'3','4')));
   const offered=[]; g.hooks.humanModes=async c=>{offered.push(c.modes.map(m=>m.text)); const dmg=c.modes.find(m=>/3 damage/.test(m.text)); return [ (dmg||c.modes[0]).card ];}; g.hooks.humanSearch=async c=>[]; g.hooks.humanMay=async()=>false;
   const mkOpt=()=>{const c=tagCard(mk('Opt','Instant','{U}','Scry 1. Draw a card.',1)); c.spellOps=[]; return c};
   for(let k=0;k<3;k++){const c=mkOpt(); me.hand.push(c); await g.cast(me,c,'hand'); while(g.stack.length)await g.resolve(); await tick(g);}
   ok('Gandalf the Grey: 4 modes, then 3, then 2 (chosen ones drop out)',offered.length===3&&offered[0].length===4&&offered[1].length===3&&!offered[1].some(t=>/3 damage/.test(t))&&offered[2].length===2,JSON.stringify(offered.map(o=>o.length)));
   // Mizzix overload
   const g2=fresh(); const m2=g2.players[0]; m2.human=true; m2.ai=null;
   const mm=tagCard(mk("Mizzix's Mastery",'Sorcery','{3}{R}',"Exile target card that's an instant or sorcery from your graveyard. For each card exiled this way, copy it and you may cast the copy without paying its mana cost. Exile Mizzix's Mastery.\nOverload {5}{U}{R}{R}",4));
   const ov=(mm.abilities||[]).find(a=>a.label==='overload');
   ok("Mizzix's Mastery overload = cast every instant/sorcery in the graveyard free",ov&&ov.ops[0].op==='mizzix'&&ov.ops[0].overload===true,JSON.stringify(ov&&ov.ops));
 }

 { // v108: overload derived from text (Vandalblast = only opponents' artifacts); Expel the Interlopers asks for a number; Bloodline Bidding returns the chosen type
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const g=fresh(); const me=g.players[0], op=g.players[1]; me.human=true; me.ai=null;
   const vb=tagCard(mk('Vandalblast','Sorcery','{R}',"Destroy target artifact you don't control.\nOverload {4}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")",1));
   const ov=(vb.abilities||[]).find(a=>a.label==='overload'); ok('Vandalblast overload = destroy all artifacts you don\'t control',ov&&ov.ops[0].op==='destroyAll'&&ov.ops[0].what==='artifacts'&&ov.ops[0].oppOnly===true,JSON.stringify(ov&&ov.ops));
   const mine=put(me,tagCard(mk('Sol Ring','Artifact','{1}','{T}: Add {C}{C}.',1))), theirs=put(op,tagCard(mk('Arcane Signet','Artifact','{2}','{T}: Add one mana of any color in your commander\'s color identity.',2)));
   await g.runOps(me,ov.ops,vb,{}); ok('…keeps my Sol Ring, destroys their Signet',me.battlefield.includes(mine)&&!op.battlefield.includes(theirs),me.battlefield.map(b=>b.card.name).join()+' | '+op.battlefield.map(b=>b.card.name).join());
   const rift=tagCard(mk('Cyclonic Rift','Instant','{1}{U}',"Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U}",2)); const ro=(rift.abilities||[]).find(a=>a.label==='overload'); ok('Cyclonic Rift overload = bounce opponents\' nonland permanents',ro&&ro.ops[0].op==='bounceAllOpp'&&!ro.ops[0].all,JSON.stringify(ro&&ro.ops));
   // Expel
   const ex=tagCard(mk('Expel the Interlopers','Sorcery','{3}{W}','Choose a number between 0 and 10. Destroy all creatures with power greater than or equal to the chosen number.',4)); ok('Expel parses to b13_expel',ex.spellOps&&ex.spellOps[0].op==='b13_expel',JSON.stringify(ex.spellOps));
   const s2=put(op,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2'))), b5=put(op,tagCard(mk('Ogre','Creature — Ogre','{4}{R}','',5,'5','5'))), my3=put(me,tagCard(mk('Knight','Creature — Knight','{2}{W}','',3,'3','3')));
   g.hooks.humanNumber=async c=>4; await g.runOps(me,ex.spellOps,ex,{}); ok('Expel at 4: kills the 5/5 only',!op.battlefield.includes(b5)&&op.battlefield.includes(s2)&&me.battlefield.includes(my3),op.battlefield.filter(b=>b.card.isCreature).map(b=>b.card.name).join());
   // Bloodline Bidding
   const bb=tagCard(mk('Bloodline Bidding','Sorcery','{3}{B}{B}','Convoke\nChoose a creature type. Return all creature cards of the chosen type from your graveyard to the battlefield.',5)); ok('Bloodline Bidding parses',bb.spellOps&&bb.spellOps[0].op==='b13_bidding'&&bb.spellOps[0].selfOnly,JSON.stringify(bb.spellOps));
   me.graveyard.push(tagCard(mk('Vampire Nighthawk','Creature — Vampire Shaman','{1}{B}{B}','Flying, deathtouch, lifelink',3,'2','3')),tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2'))); op.graveyard.push(tagCard(mk('Blood Artist','Creature — Vampire','{1}{B}','',2,'0','1')));
   g.hooks.humanChoice=async c=>'vampire'; await g.runOps(me,bb.spellOps,bb,{});
   ok('…returns only my Vampires',me.battlefield.some(b=>b.card.name==='Vampire Nighthawk')&&!me.battlefield.some(b=>b.card.name==='Bear')&&op.graveyard.some(c=>c.name==='Blood Artist'),me.battlefield.map(b=>b.card.name).join());
 }

 { // v109: owner-deck audit — Touch the Spirit Realm (exile until leaves), Reunion of the House, Damning Verdict, Force of Despair
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const g=fresh(); const me=g.players[0], op=g.players[1]; me.human=true; me.ai=null;
   const tsr=tagCard(mk('Touch the Spirit Realm','Enchantment','{2}{W}','When this enchantment enters, exile up to one target artifact or creature until this enchantment leaves the battlefield.\nChannel — {1}{W}, Discard this card: Exile target artifact or creature. Return it to the battlefield under its owner\'s control at the beginning of the next end step.',3));
   ok('Touch the Spirit Realm parses exile-until',tsr.etbOps&&tsr.etbOps.some(o=>o.op==='b2_exileOppUntil'&&o.what==='artifact or creature'),JSON.stringify(tsr.etbOps));
   const bear=put(op,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2'))), ench=put(op,tagCard(mk('Propaganda','Enchantment','{2}{U}','',3)));
   let pool=null; g.hooks.humanSearch=async c=>{pool=c.pool.map(x=>x.name);return [c.pool.find(x=>x.name==='Bear')]};
   const pm=await g.enterPerm(me,tsr); await g.trigger(me,pm,pm.card.etbOps,{perm:pm},'ETB'); await tick(g);
   ok('…offers only artifacts/creatures and exiles the Bear',pool&&pool.includes('Bear')&&!pool.includes('Propaganda')&&!op.battlefield.includes(bear)&&op.exile.some(c=>c.name==='Bear'),JSON.stringify(pool));
   await g.destroy(me,pm); await tick(g); ok('…Bear returns when it leaves',op.battlefield.some(b=>b.card.name==='Bear'),op.battlefield.map(b=>b.card.name).join());
   // Reunion of the House
   const g2=fresh(); const m2=g2.players[0]; m2.human=true; m2.ai=null;
   const ru=tagCard(mk('Reunion of the House','Sorcery','{3}{W}{W}','Return any number of target creature cards with total power 10 or less from your graveyard to the battlefield. Exile Reunion of the House.',5)); ok('Reunion parses',ru.spellOps&&ru.spellOps[0].op==='b13_reunion',JSON.stringify(ru.spellOps));
   m2.graveyard.push(tagCard(mk('Big','Creature — Giant','{5}{G}','',6,'7','7')),tagCard(mk('Mid','Creature — Elf','{2}{G}','',3,'4','4')),tagCard(mk('Small','Creature — Elf','{G}','',1,'1','1')));
   g2.hooks.humanSearch=async c=>c.pool; await g2.runOps(m2,ru.spellOps,ru,{});
   const names=m2.battlefield.filter(b=>b.card.isCreature).map(b=>b.card.name).sort(); ok('Reunion: 7+4 exceeds 10 → Big and Small (8), Mid skipped',names.join()==='Big,Small',names.join());
   // Damning Verdict / Force of Despair
   const g3=fresh(); const m3=g3.players[0], o3=g3.players[1]; m3.human=true; m3.ai=null; g3.turn=9;
   const a=put(o3,tagCard(mk('Plain','Creature — Bear','{1}{G}','',2,'2','2'))), b=put(o3,tagCard(mk('Countered','Creature — Bear','{1}{G}','',2,'2','2'))); b.counters=1; const c=put(m3,tagCard(mk('Fresh','Creature — Elf','{G}','',1,'1','1'))); c.enteredTurn=9;
   const dv=tagCard(mk('Damning Verdict','Sorcery','{3}{W}{W}','Destroy all creatures with no counters on them.',5)); await g3.runOps(m3,dv.spellOps,dv,{});
   ok('Damning Verdict spares the creature with a counter',!o3.battlefield.includes(a)&&o3.battlefield.includes(b)&&!m3.battlefield.includes(c),o3.battlefield.map(x=>x.card.name).join());
   const d=put(o3,tagCard(mk('Old','Creature — Bear','{1}{G}','',2,'2','2'))); d.enteredTurn=3; const e=put(o3,tagCard(mk('New','Creature — Bear','{1}{G}','',2,'2','2'))); e.enteredTurn=9;
   const fd=tagCard(mk('Force of Despair','Instant','{1}{B}{B}',"If it's not your turn, you may exile a black card from your hand rather than pay this spell's mana cost.\nDestroy all creatures that entered this turn.",3)); await g3.runOps(m3,fd.spellOps,fd,{});
   ok('Force of Despair kills only creatures that entered this turn',o3.battlefield.includes(d)&&!o3.battlefield.includes(e),o3.battlefield.map(x=>x.card.name).join());
 }

 { // v110 (Lyse Hext game): Gitaxian Probe shows the chosen hand; Water Wings base 4/4 flying hexproof; Lightfoot flying+indestructible on the countered creature; Apostle's Blessing protection from artifacts; casual commander not thrown into a free kill; damage lines tagged once
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const lands=async(g,pl,n)=>{for(let i=0;i<n;i++)await g.landEnters(pl,tagCard(mk('Island','Basic Land — Island','','',0)))};
   // Gitaxian Probe
   { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; await lands(g,me,2);
     const gp=tagCard(mk('Gitaxian Probe','Sorcery','{U/P}','Look at target player\'s hand.\nDraw a card.',1)); me.hand.push(gp);
     let asked=null, shown=null; g.hooks.humanChoosePlayer=async c=>{asked=c.players.map(q=>q.name);return g.players[2]}; g.hooks.humanMay=async c=>{if(c.cards)shown=c;return true}; g.hooks.humanPayOpt=async c=>c.options?c.options[0]:null;
     await g.cast(me,gp,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
     ok('Gitaxian Probe: I choose the player and see that hand',asked&&asked.length===3&&shown&&shown.cards.length===g.players[2].hand.length&&shown.cards.every(c=>g.players[2].hand.includes(c)),JSON.stringify({asked,n:shown&&shown.cards.length}));
     ok('…and the log names whose hand',g.log.some(x=>/looks at P2's hand \(\d+ card/.test(x.m)),g.log.slice(-6).map(x=>x.m).join(' / ')); }
   // Water Wings
   { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; await lands(g,me,1);
     const lyse=put(me,tagCard(mk('Lyse Hext','Legendary Creature — Human Rebel Monk','{W}{U}','Noncreature spells you cast cost {1} less to cast.',2,'2','2'))); lyse.counters=1;
     const ww=tagCard(mk('Water Wings','Instant','{1}{U}','Until end of turn, target creature you control has base power and toughness 4/4 and gains flying and hexproof. (It can\'t be the target of spells or abilities your opponents control.)',2)); me.hand.push(ww);
     g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Lyse Hext')]; await g.cast(me,ww,'hand'); while(g.stack.length)await g.resolve(); await tick(g); g.refreshStatics();
     ok('Water Wings: Lyse is 5/5 (base 4/4 + counter) with flying and hexproof',g.powerOf(me,lyse)===5&&g.toughOf(me,lyse)===5&&lyse.card.kw.includes('flying')&&lyse.card.kw.includes('hexproof'),g.powerOf(me,lyse)+'/'+g.toughOf(me,lyse)+' '+lyse.card.kw.join());
     ok('…and no generic "protects" line',!g.log.some(x=>/protects Lyse/.test(x.m)),g.log.slice(-4).map(x=>x.m).join(' / ')); }
   // Lightfoot Technique
   { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; await g.landEnters(me,tagCard(mk('Plains','Basic Land — Plains','','',0)));
     const a=put(me,tagCard(mk('Small','Creature — Elf','{G}','',1,'1','1'))), b=put(me,tagCard(mk('Big','Creature — Giant','{4}{G}','',5,'5','5')));
     const lt=tagCard(mk('Lightfoot Technique','Instant','{W}','Put a +1/+1 counter on target creature. It gains flying and indestructible until end of turn.',1)); me.hand.push(lt);
     g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Small')]; await g.cast(me,lt,'hand'); while(g.stack.length)await g.resolve(); await tick(g); g.refreshStatics();
     ok('Lightfoot: counter, flying and indestructible all on the chosen creature',a.counters===1&&a.card.kw.includes('flying')&&a.card.kw.includes('indestructible')&&!b.card.kw.includes('flying'),JSON.stringify([a.counters,a.card.kw,b.card.kw])); }
   // Apostle's Blessing
   { const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null;
     const ab=tagCard(mk("Apostle's Blessing",'Instant','{1}{W/P}','({W/P} can be paid with either {W} or 2 life.)\nTarget artifact or creature you control gains protection from artifacts or from the color of your choice until end of turn.',2));
     ok("Apostle's Blessing parses to protColor with artifacts",ab.spellOps&&ab.spellOps[0].op==='protColor'&&ab.spellOps[0].artifacts,JSON.stringify(ab.spellOps));
     const k=put(me,tagCard(mk('Knight','Creature — Knight','{1}{W}','',2,'2','2'))); let opts=null; g.hooks.humanSearch=async c=>[c.pool[0]]; g.hooks.humanChoice=async c=>{opts=c.options;return 'artifacts'};
     await g.runOps(me,ab.spellOps,ab,{}); g.refreshStatics();
     const bolt=tagCard(mk('Artifact Bolt','Artifact','{2}','',2));
     ok('…offers "artifacts" and then artifact sources can\'t target it',opts&&opts.includes('artifacts')&&g.protectedFrom(k,bolt)&&!g.targetOk(bolt,k,g.players[1]),JSON.stringify({opts,pc:k.protColors})); }
   // casual AI: commander not into a free kill
   { const g=fresh(); const ai=g.players[1], me=g.players[0]; ai.ai=new AI('casual'); me.life=18; ai.life=40; g.players[2].life=40; g.players[3].life=40; g.round=4;
     const ysh=put(ai,tagCard(mk("Y'shtola, Night's Blessed",'Legendary Creature — Cat Warlock','{1}{W}{U}{B}','Vigilance',4,'2','4'))); ysh.card.isCommander=true; ysh.summoning=false;
     const drake=put(ai,tagCard(mk('Geyser Drake','Creature — Drake','{3}{U}','Flying',4,'2','2'))); drake.summoning=false;
     const lyse=put(me,tagCard(mk('Lyse Hext','Legendary Creature — Human Rebel Monk','{W}{U}','First strike',2,'5','5')));
     g.refreshStatics(); const as=ai.ai.chooseAttacks(g,ai); const names=as.map(x=>x.attacker.card.name);
     ok('casual AI keeps its commander home rather than feed it to a 5/5 first striker',!names.includes("Y'shtola, Night's Blessed"),JSON.stringify(names)); }
   // pain mana logged once
   { const g=fresh(); const me=g.players[0]; me.life=20; g.pendingLife=[[me,-1,{name:'Talisman of Progress'}]]; const n0=g.log.length;
     for (const [q, d, c] of (g.pendingLife || []).splice(0)) { if (d < 0 && c) g.say(`— ${c.name} deals ${-d} damage to ${q.name}`, q); await g.changeLife(q, d, c); }
     const lines=g.log.slice(n0).map(x=>x.m); ok('damage announcement carries the [a → b] tag; no second "loses" line',lines.length===1&&/\[P0 20 → 19\]/.test(lines[0]),JSON.stringify(lines)); }
 }

 { // v112 (Jodah game g5474): free casts are not "from your hand" — Jodah no longer chains; "you may cast" is optional; a genuine free hand cast still counts
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
   const JODAH="Legendary creatures you control get +X/+X, where X is the number of legendary creatures you control.\nWhenever you cast a legendary spell from your hand, exile cards from the top of your library until you exile a legendary nonland card with lesser mana value. You may cast that card without paying its mana cost. Put the rest on the bottom of your library in a random order.";
   const leg=(n,mv)=>tagCard(mk(n,'Legendary Creature — Human',`{${mv}}`,'',mv,'2','2'));
   const setup=()=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; put(me,tagCard(mk('Jodah, the Unifier','Legendary Creature — Human Wizard','{W}{U}{B}{R}{G}',JODAH,5,'5','5')));
     for(let i=0;i<12;i++) me.library.push(tagCard(mk('Forest','Basic Land — Forest','','',0)));
     // top of library is the END: first hit is a legendary MV3, beneath it another legendary MV2 (would be the chained hit)
     me.library.push(leg('Second Hit',2)); for(let i=0;i<3;i++) me.library.push(tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2'))); me.library.push(leg('First Hit',3));
     return [g,me]; };
   { const [g,me]=setup(); let asked=0; g.hooks.humanMay=async c=>{asked++;return true}; g.hooks.humanSearch=async c=>[];
     const samut=leg('Samut',5); me.hand.push(samut); g.freeCasts=1; await g.castFreeCard(me,samut,me,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
     const trig=g.log.filter(x=>/Jodah, the Unifier triggers/.test(x.m)).length;
     ok('Jodah triggers once for the hand cast and NOT for the card it casts from exile',trig===1&&me.battlefield.some(b=>b.card.name==='First Hit')&&!me.battlefield.some(b=>b.card.name==='Second Hit'),'triggers '+trig+' bf '+me.battlefield.map(b=>b.card.name).join());
     ok('…and "you may cast" was actually asked',asked===1,'asked '+asked);
     ok('…and the log shows how many were exiled and the hit',g.log.some(x=>/exiles 1 card, hits First Hit \(mana value 3 < 5\)/.test(x.m)),g.log.filter(x=>/hits First Hit/.test(x.m)).map(x=>x.m).join()); }
   { const [g,me]=setup(); g.hooks.humanMay=async c=>false; const n0=me.library.length;
     await g.runOps(me,[{op:'jodahCascade'}],{name:'Jodah, the Unifier'},{castCard:leg('Samut',5)});
     ok('declining puts the hit on the bottom (library size unchanged, hit not cast)',me.library.length===n0&&me.library[0]&&!me.battlefield.some(b=>b.card.name==='First Hit')&&me.library.some(c=>c.name==='First Hit'),'lib '+n0+'→'+me.library.length); }
   { const [g,me]=setup(); g.hooks.humanMay=async c=>true; const c=leg('Default Free',5); await g.castFreeCard(me,c,me); while(g.stack.length)await g.resolve(); await tick(g);
     ok('a free cast from exile (default) does not trigger Jodah',!g.log.some(x=>/Jodah, the Unifier triggers/.test(x.m)),g.log.slice(-4).map(x=>x.m).join(' / ')); }
 }

 { // v112: Inga and Esika draws only if 3+ mana from creatures was spent (not on free casts, not on land mana)
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false};pl.battlefield.push(b);return b};
   const INGA="Creatures you control have vigilance and \"{T}: Add one mana of any color. Spend this mana only to cast a creature spell.\"\nWhenever you cast a creature spell, if three or more mana from creatures was spent to cast it, draw a card.";
   const run=async(how)=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; put(me,tagCard(mk('Inga and Esika','Legendary Creature — Human Elf','{2}{G}{U}',INGA,4,'3','4')));
     if(how==='elves') for(let i=0;i<3;i++) put(me,tagCard(mk('Llanowar Elves','Creature — Elf Druid','{G}','{T}: Add {G}.',1,'1','1')));
     if(how==='lands') for(let i=0;i<3;i++) await g.landEnters(me,tagCard(mk('Forest','Basic Land — Forest','','',0)));
     const ogre=tagCard(mk('Ogre','Creature — Ogre','{2}{G}','',3,'3','3')); const n0=g.log.length;
     if(how==='free'){ await g.castFreeCard(me,ogre,me,'hand'); } else { me.hand.push(ogre); await g.cast(me,ogre,'hand'); }
     while(g.stack.length)await g.resolve(); await tick(g);
     return {drew:g.log.slice(n0).filter(x=>/draws a card/.test(x.m)).length, trig:g.log.some(x=>/Inga and Esika triggers/.test(x.m)), cast:me.battlefield.some(b=>b.card.name==='Ogre')}; };
   const a=await run('elves'), b=await run('lands'), c=await run('free');
   ok('Inga: 3 mana from creatures → draws',a.cast&&a.trig&&a.drew===1,JSON.stringify(a));
   ok('Inga: paid with lands → no draw',b.cast&&!b.trig&&b.drew===0,JSON.stringify(b));
   ok('Inga: cast free → no draw (Hajar in g5474)',c.cast&&!c.trig&&c.drew===0,JSON.stringify(c));
 }

 { // v113: Arcane Denial — the countered spell's controller may draw up to two, and you draw one, at the next turn's upkeep
   const g=fresh(); const me=g.players[0], op=g.players[1]; me.human=true; me.ai=null; for(let i=0;i<3;i++)await g.landEnters(me,tagCard(mk('Island','Basic Land — Island','','',0)));
   const ad=tagCard(mk('Arcane Denial','Instant','{1}{U}',"Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep.\nYou draw a card at the beginning of the next turn's upkeep.",2));
   const victim={id:991,card:tagCard(mk('Basilisk Collar','Artifact — Equipment','{1}','',1)),caster:op,kind:'spell'}; g.stack.push(victim); const o={id:992,card:ad,caster:me,target:{spell:victim},kind:'spell'}; g.stack.push(o); await g.resolve(o); await tick(g);
   ok('Arcane Denial counters and schedules both draws',victim&&victim.countered&&(g.upkeepDelayed||[]).length===2,JSON.stringify((g.upkeepDelayed||[]).map(d=>[d.p.name,d.n])));
   g.turn++; const n0=g.log.length; g.hooks.humanTurn=async()=>({action:'end'}); await g.takeTurn(g.players[2]);
   const lines=g.log.slice(n0).map(x=>x.m).filter(m=>/Arcane Denial/.test(m));
   ok('next upkeep: the opponent draws 2 and I draw 1',lines.some(m=>/P1 draws 2/.test(m))&&lines.some(m=>/P0 draws 1/.test(m))&&!(g.upkeepDelayed||[]).length,JSON.stringify(lines));
 }

 { // v114: rebound happens once — the recast from exile goes to the graveyard, not back to exile
   const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false};pl.battlefield.push(b);return b};
   const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; await g.landEnters(me,tagCard(mk('Island','Basic Land — Island','','',0)));
   put(me,tagCard(mk('Lyse Hext','Legendary Creature — Human Rebel Monk','{W}{U}','',2,'2','2')));
   const ds=tagCard(mk('Distortion Strike','Sorcery','{U}',"Target creature gets +1/+0 until end of turn and can't be blocked this turn.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)",1));
   ok('Distortion Strike has rebound',!!ds.rebound,'');
   me.hand.push(ds); g.hooks.humanSearch=async c=>[c.pool[0]]; g.hooks.humanMay=async()=>true; g.hooks.humanTurn=async()=>({action:'end'});
   await g.cast(me,ds,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
   ok('cast from hand: exiled with rebound',me.exile.includes(ds)&&(me.rebound||[]).includes(ds),'exile '+me.exile.includes(ds));
   g.turn++; g.active=0; await g.takeTurn(me); await tick(g);
   ok('next upkeep: recast from exile, then to the graveyard — no second rebound',me.graveyard.includes(ds)&&!me.exile.includes(ds)&&!(me.rebound||[]).includes(ds)&&g.log.filter(x=>/is exiled \(rebound\)/.test(x.m)).length===1,JSON.stringify({gy:me.graveyard.includes(ds),ex:me.exile.includes(ds),n:g.log.filter(x=>/is exiled \(rebound\)/.test(x.m)).length}));
 }

 { // v115: paradigm — resolves → exiled + a free copy each first main phase; countered or fizzled → graveyard and nothing set up; the copy never re-exiles; a countered copy doesn't end it
   const PARA="Paradigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without paying its mana cost at the beginning of each of your first main phases.)";
   const mkLesson=()=>tagCard(mk('Study Session','Sorcery — Lesson','{2}{U}',"Draw a card.\n"+PARA,3));
   const base=async()=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; for(let i=0;i<3;i++)await g.landEnters(me,tagCard(mk('Island','Basic Land — Island','','',0))); g.hooks.humanMay=async()=>true; g.hooks.humanSearch=async c=>c.pool; g.hooks.humanTurn=async()=>({action:'end'}); return [g,me]};
   { const [g,me]=await base(); const c=mkLesson(); ok('paradigm parses',c.paradigm===true,''); me.hand.push(c); await g.cast(me,c,'hand'); while(g.stack.length)await g.resolve(); await tick(g);
     ok('resolved: exiled and registered',me.exile.includes(c)&&(me.paradigms||[]).includes(c)&&!me.graveyard.includes(c),'');
     g.turn++; g.active=0; const n0=g.log.length; await g.takeTurn(me); await tick(g); const L=g.log.slice(n0).map(x=>x.m);
     ok('next first main phase: a copy is cast free; the original stays exiled; the copy is not exiled again',L.some(m=>/casts a copy of Study Session \(paradigm\)/.test(m))&&me.exile.filter(x=>x.name==='Study Session').length===1&&me.exile.includes(c)&&L.filter(m=>/is exiled \(paradigm/.test(m)).length===0&&!me.graveyard.some(x=>x.name==='Study Session'),JSON.stringify(L.filter(m=>/Study|paradigm/.test(m))));
     g.turn++; const n1=g.log.length; await g.takeTurn(me); ok('…and again the turn after',g.log.slice(n1).some(x=>/casts a copy of Study Session \(paradigm\)/.test(x.m)),''); }
   { const [g,me]=await base(); const c=mkLesson(); const o={id:901,kind:'spell',card:c,caster:me,owner:me,zone:'hand',countered:true}; await g.leaveStack(o);
     ok('countered: goes to the graveyard, no paradigm',me.graveyard.includes(c)&&!me.exile.includes(c)&&!(me.paradigms||[]).includes(c),JSON.stringify([me.graveyard.includes(c),me.exile.includes(c)])); }
   { const [g,me]=await base(); const c=mkLesson(); const o={id:902,kind:'spell',card:c,caster:me,owner:me,zone:'hand',fizzled:true}; await g.leaveStack(o);
     ok('fizzled (illegal target): graveyard, no paradigm',me.graveyard.includes(c)&&!(me.paradigms||[]).includes(c),''); }
   { const [g,me]=await base(); const c=mkLesson(); me.exile.push(c); me.paradigms=[c]; const cp={...c,uid:99999,token:true,paradigm:false}; const o={id:903,kind:'spell',card:cp,caster:me,owner:me,zone:'hand',countered:true,fromExile:true}; await g.leaveStack(o);
     ok('a countered paradigm copy just vanishes; the original keeps giving copies',me.exile.includes(c)&&me.paradigms.includes(c)&&!me.graveyard.some(x=>x.name==='Study Session'),JSON.stringify(me.graveyard.map(x=>x.name))); }
   // Improvisation Capstone: you choose which exiled spells to cast
   { const [g,me]=await base(); const cap=tagCard(mk('Improvisation Capstone','Sorcery — Lesson','{5}{R}{R}',"Exile cards from the top of your library until you exile cards with total mana value 4 or greater. You may cast any number of spells from among them without paying their mana costs.\n"+PARA,7));
     me.library.push(tagCard(mk('Ogre','Creature — Ogre','{2}{R}','',3,'3','3')),tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,'2','2')));
     let pool=null; g.hooks.humanSearch=async c=>{pool=c.pool.map(x=>x.name);return [c.pool.find(x=>x.name==='Bear')]}; await g.runOps(me,cap.spellOps,cap,{}); while(g.stack.length)await g.resolve(); await tick(g);
     ok('Capstone: I choose which exiled spells to cast; the rest stay exiled',pool&&pool.length===2&&me.battlefield.some(b=>b.card.name==='Bear')&&me.exile.some(c=>c.name==='Ogre')&&!me.battlefield.some(b=>b.card.name==='Ogre'),JSON.stringify(pool)); }
 }

 { // v116: owner's Burakos game — Flawless Maneuver, Fire Magic, Folk Hero/changelings, party, Revel in Riches, Wrexial vs an eliminated player, melee under Isshin
   const O=require(__dirname+'/fixtures/owner.json'); const OR=O.cards||O; const OC=n=>{const r=OR.find(r=>r[1]===n); if(!r)throw new Error('no '+n); return tagCard({name:r[1],mana:r[2],type:r[3],oracle:r[4],cmc:r[5],power:r[6],toughness:r[7]})};
   const put=(g,pl,c,o={})=>{const b={id:900000+Math.floor(Math.random()*1e6),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false,...o};pl.battlefield.push(b);g.refreshStatics();return b};
   const cr=(n,t,p=2,q=2,o='')=>tagCard(mk(n,'Creature — '+t,'{1}{W}',o,2,String(p),String(q)));
   const base=()=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanMay=async()=>true; g.hooks.humanSearch=async c=>c.pool.slice(0,c.n||1); g.hooks.humanTurn=async()=>({action:'end'}); return [g,me]};
   // Flawless Maneuver
   { const [g,me]=base(); const fh=OC('Folk Hero'); fh.isCommander=true; put(g,me,fh); const fm=OC('Flawless Maneuver');
     ok('Folk Hero (a Background) is a commander: Flawless Maneuver is free with only Folk Hero out',g.castMode?g.castMode(me,fm,'hand')==='free':true,'');
     const bear=put(g,me,cr('Bear','Bear')); const rock=put(g,me,tagCard(mk('Rock','Artifact','{2}','',2)));
     await g.runOps(me,fm.spellOps,fm,{}); g.refreshStatics();
     ok('Flawless Maneuver: creatures are indestructible',g.isIndestructible(bear),'');
     ok('…and nothing gets hexproof or blanket protection; noncreatures get nothing',bear.protTurn!==g.turn&&rock.protTurn!==g.turn&&!g.isIndestructible(rock)&&me.hexproofTurn!==g.turn,JSON.stringify([bear.protTurn,rock.protTurn]));
     const sp={id:1,kind:'spell',card:fm,caster:me,owner:me,zone:'hand'}; const n0=g.log.length; g.stack.push(sp); await g.resolve(sp); ok('no generic "protects N permanents" line',!g.log.slice(n0).some(x=>/protects \d+ permanents|hexproof/.test(x.m)),JSON.stringify(g.log.slice(n0).map(x=>x.m))); }
   // Fire Magic — 1 damage is not a board wipe
   { const [g,me]=base(); const opp=g.players[1]; const small=put(g,opp,cr('Squire','Human Soldier',1,1)); const big=put(g,opp,cr('Ogre','Ogre',3,4)); const mine=put(g,me,cr('Wall','Wall',0,5)); const z=put(g,me,OC('Zulaport Cutthroat')); const w1=put(g,me,cr('Pup','Dog',1,1));
     const fmg=OC('Fire Magic'); const L=g.players.map(p=>p.life); const sp={id:2,kind:'spell',card:fmg,caster:opp,owner:opp,zone:'hand',modes:[fmg.modes[0].card]}; await g.resolve(sp); while(g.stack.length)await g.resolve(); await tick(g); while(g.stack.length)await g.resolve();
     ok('Fire Magic (Fire, 1 damage): only toughness-1 creatures die',!opp.battlefield.includes(small)&&opp.battlefield.includes(big)&&me.battlefield.includes(mine)&&!me.battlefield.includes(w1)&&!me.battlefield.includes(z),JSON.stringify([opp.battlefield.map(b=>b.card.name),me.battlefield.map(b=>b.card.name)]));
     ok('Zulaport Cutthroat sees itself and the other creature die together (2 drains)',g.players[2].life===L[2]-2&&me.life===L[0]+2,JSON.stringify(g.players.map(p=>p.life))); }
   { const [g,me]=base(); const opp=g.players[1]; const big=put(g,opp,cr('Ogre','Ogre',3,3)); const huge=put(g,opp,cr('Giant','Giant',5,5)); const fmg=OC('Fire Magic'); const sp={id:3,kind:'spell',card:fmg,caster:me,owner:me,zone:'hand',modes:[fmg.modes[2].card]}; await g.resolve(sp); await tick(g);
     ok('Fire Magic (Firaga, 3 damage): a 3/3 dies, a 5/5 lives',!opp.battlefield.includes(big)&&opp.battlefield.includes(huge),''); }
   // party + changelings, Burakos attack
   { const [g,me]=base(); const opp=g.players[1]; const bu=OC('Burakos, Party Leader'); bu.isCommander=true; const b=put(g,me,bu);
     ok('Burakos alone is a party of 1',g.partySize(me)===1,'n='+g.partySize(me));
     put(g,me,cr('Mimic','Shapeshifter',1,1,'Changeling')); ok('a changeling fills a party slot (2)',g.partySize(me)===2,'n='+g.partySize(me));
     put(g,me,cr('Mimic B','Shapeshifter',1,1,'Changeling')); put(g,me,cr('Mimic C','Shapeshifter',1,1,'Changeling')); put(g,me,cr('Extra','Human Cleric'));
     ok('Burakos + three changelings is a full party (4), never more',g.partySize(me)===4,'n='+g.partySize(me));
     const L=opp.life; g.active=0; await g.combatPhase(me,[{attacker:b,defender:opp}]); await tick(g);
     ok('Burakos attacks with a full party: defender loses 4 (+2 combat) and I make 4 Treasures',opp.life===L-4-2&&me.battlefield.filter(x=>x.card.name==='Treasure').length===4,JSON.stringify([L,opp.life,me.battlefield.filter(x=>x.card.name==='Treasure').length])); }
   // Folk Hero: needs the commander creature on the battlefield; changeling spells count; once per turn
   { const [g,me]=base(); const fh=OC('Folk Hero'); fh.isCommander=true; put(g,me,fh); const bu=OC('Burakos, Party Leader'); bu.isCommander=true; me.command.push(bu); for(let i=0;i<8;i++)await g.landEnters(me,tagCard(mk('Plains','Basic Land — Plains','','',0)));
     const castIt=async c=>{for(const l of me.battlefield)l.tapped=false;me.hand.push(c); const h=me.hand.length; await g.cast(me,c,'hand'); while(g.stack.length)await g.resolve(); await tick(g); while(g.stack.length)await g.resolve(); return me.hand.length-(h-1)};
     ok('Folk Hero: no draw while Burakos is in the command zone',await castIt(cr('Wiz','Human Wizard'))===0,'');
     me.command.splice(me.command.indexOf(bu),1); put(g,me,bu); g.turn++;
     ok('Folk Hero: a changeling spell shares a type with Burakos → draw',await castIt(cr('Mimic','Shapeshifter',1,1,'Changeling'))===1,'');
     ok('…only once each turn',await castIt(cr('Wiz2','Human Wizard'))===0,''); g.turn++;
     ok('Folk Hero: a Wizard spell draws; ',await castIt(cr('Wiz3','Human Wizard'))===1,''); g.turn++;
     ok('Folk Hero: an unrelated creature (Bird) does not',await castIt(cr('Bird','Bird'))===0,''); }
   // Revel in Riches
   { const [g,me]=base(); const opp=g.players[1]; put(g,me,OC('Revel in Riches')); const v=put(g,opp,cr('Victim','Bear')); const own=put(g,me,cr('Mine','Bear')); const tk=put(g,opp,{...cr('Tok','Goblin',1,1),token:true});
     const T=()=>me.battlefield.filter(x=>x.card.name==='Treasure').length;
     await g.destroy(opp,v); await tick(g); while(g.stack.length)await g.resolve(); ok("Revel in Riches: an opponent's creature dies → Treasure",T()===1,'T='+T());
     await g.destroy(opp,tk); await tick(g); while(g.stack.length)await g.resolve(); ok('…tokens count too',T()===2,'T='+T());
     await g.destroy(me,own); await tick(g); while(g.stack.length)await g.resolve(); ok('…my own creature dying does not',T()===2,'T='+T());
     await g.makeArtifactTokens(me,'treasure',7); g.turn++; g.active=0; await g.takeTurn(me); ok('nine Treasures at upkeep: no win',!g.winner,'');
     if(!g.winner){ await g.makeArtifactTokens(me,'treasure',10-T()); g.turn++; await g.takeTurn(me); ok('ten Treasures at upkeep: I win',g.winner===me,'T='+T()); } }
   // an eliminated player's graveyard leaves with them
   { const [g,me]=base(); const opp=g.players[1]; opp.graveyard.push(OC('Flawless Maneuver')); await g.kill(opp,'test'); const wx=put(g,me,OC('Wrexial, the Risen Deep')); const n0=g.log.length; await g.runOps(me,[{op:'wrexial'}],wx.card,{defender:opp,perm:wx});
     ok("Wrexial can't cast from an eliminated player's graveyard",!g.log.slice(n0).some(x=>/casts .* from/.test(x.m))&&opp.graveyard.length===0,''); }
   // melee is an attack trigger: Isshin doubles it
   { const [g,me]=base(); const o1=g.players[1],o2=g.players[2]; put(g,me,tagCard(mk('Isshin, Two Heavens as One','Legendary Creature — Human Samurai','{R}{W}{B}','If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.',3,'3','4')));
     const a=put(g,me,cr('Meleer','Cat Knight',2,2,'Melee')); const b2=put(g,me,cr('Other','Cat',2,2)); const L=o1.life; g.active=0; await g.combatPhase(me,[{attacker:a,defender:o1},{attacker:b2,defender:o2}]); await tick(g);
     ok('melee with Isshin, two opponents attacked: +4/+4 (2 power → 6 damage)',o1.life===L-6,JSON.stringify([L,o1.life])); }
   // commander hit shows the life change on the hit line
   { const [g,me]=base(); const opp=g.players[1]; const c=tagCard(mk('Cmd','Legendary Creature — Orc','{B}','',1,'3','3')); c.isCommander=true; const b=put(g,me,c); g.active=0; const n0=g.log.length; await g.combatPhase(me,[{attacker:b,defender:opp}]); await tick(g);
     const hl=g.log.slice(n0).map(x=>x.m).find(m=>/Cmd hits/.test(m)); ok('commander hit line carries [life a → b]',/\[P1 \d+ → \d+\]$/.test(hl||''),hl); }
 }

 { // v117: owner's second Burakos game — per-commander tax, protection in combat, Lossarnach Captain, Kutzil timing, Reconnaissance
   const O=require(__dirname+'/fixtures/owner.json'); const OR=O.cards||O; const OC=n=>{const r=OR.find(r=>r[1]===n); if(!r)throw new Error('no '+n); return tagCard({name:r[1],mana:r[2],type:r[3],oracle:r[4],cmc:r[5],power:r[6],toughness:r[7]})};
   const put=(g,pl,c,o={})=>{const b={id:800000+Math.floor(Math.random()*1e6),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false,...o};pl.battlefield.push(b);g.refreshStatics();return b};
   const cr=(n,t,p=2,q=2,o='',mana='{1}{W}')=>tagCard(mk(n,'Creature — '+t,mana,o,2,String(p),String(q)));
   // commander tax is per commander
   { const bu=OC('Burakos, Party Leader'), fh=OC('Folk Hero'); const dk=buildDeck([...Array(60)].map(()=>mk('Plains','Basic Land — Plains','','',0)).concat([...Array(38)].map(()=>mk('Swamp','Basic Land — Swamp','','',0))).concat([mk('Burakos, Party Leader','Legendary Creature — Orc','{3}{B}',bu.oracle,4,'2','4'),mk('Folk Hero','Legendary Enchantment — Background','{1}{W}',fh.oracle,2)]),['Burakos, Party Leader','Folk Hero']);
     const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:i?deck():dk,ai:new AI('expert')})),{seed:5,hooks:{emit:()=>{}}}); g.active=0; g.phase='main1'; g.turn=6; const me=g.players[0];
     for(let i=0;i<5;i++)await g.landEnters(me,tagCard(mk('Plains','Basic Land — Plains','','',0))); for(let i=0;i<5;i++)await g.landEnters(me,tagCard(mk('Swamp','Basic Land — Swamp','','',0)));
     const B=me.command.find(c=>c.name==='Burakos, Party Leader'), F=me.command.find(c=>c.name==='Folk Hero');
     ok('two commanders in the command zone',!!B&&!!F,''); ok('Burakos costs 4 before anything is cast',g.costOf(me,B,'cmd').total===4,'');
     await g.cast(me,F,'cmd'); while(g.stack.length)await g.resolve(g.stack[g.stack.length-1]); await tick(g);
     ok('casting Folk Hero does NOT tax Burakos (still 4)',g.costOf(me,B,'cmd').total===4&&g.cmdTaxOf(me,B)===0,'cost='+g.costOf(me,B,'cmd').total);
     ok('Folk Hero itself is now taxed (+2)',g.cmdTaxOf(me,F)===2,''); 
     for(const l of me.battlefield)l.tapped=false; await g.cast(me,B,'cmd'); await tick(g);
     ok('after casting Burakos once his tax is 2 (6 to recast), Folk Hero stays at 2',g.cmdTaxOf(me,B)===2&&g.cmdTaxOf(me,F)===2,JSON.stringify(me.cmdTaxBy)); }
   // protection prevents combat damage to the protected creature
   { const g=fresh(); const [me,opp]=g.players; const agent=put(g,me,cr('Agent','Human Rogue',3,2,'','{2}{B}')); const om=put(g,opp,tagCard(mk('Omnath','Legendary Creature — Elemental','{1}{G}{U}{R}','',4,'7','7')));
     agent.protColor={turn:g.turn,c:'G'}; g.refreshStatics(); ok('protection from green applies against a green-blue-red creature',g.protectedFrom(agent,om.card),JSON.stringify([agent.protColors,om.card.colors]));
     g.active=1; g.hooks.humanBlocks=null; const n0=g.log.length; await g.fightCombat(opp,om,me,agent,[]); await tick(g);
     ok('blocker with protection from the attacker’s colour survives and still deals damage',me.battlefield.includes(agent)&&g.log.slice(n0).some(x=>/prevented \(protection\)/.test(x.m)),JSON.stringify(g.log.slice(n0).map(x=>x.m))); }
   { const g=fresh(); const [me,opp]=g.players; const a=put(g,me,cr('Knight','Human Knight',2,2)); const b1=put(g,opp,cr('Bear','Bear',5,5,'','{1}{G}')); a.protColor={turn:g.turn,c:'G'}; g.refreshStatics();
     await g.fightCombat(me,a,opp,b1,[]); await tick(g); ok('attacker with protection takes no damage from a blocker of that colour',me.battlefield.includes(a),''); }
   // Lossarnach Captain taps creatures only
   { const g=fresh(); const [me,opp]=g.players; put(g,opp,tagCard(mk('Sol Ring','Artifact','{1}','{T}: Add {C}{C}.',1))); put(g,opp,tagCard(mk('Forest','Basic Land — Forest','','',0))); const n0=g.log.length;
     await g.runOps(me,OC('Lossarnach Captain').triggers[0].ops,OC('Lossarnach Captain'),{}); ok('Lossarnach Captain: no creature to tap → taps nothing (not a land or Sol Ring)',!g.log.slice(n0).some(x=>/taps /.test(x.m))&&opp.battlefield.every(b=>!b.tapped),JSON.stringify(g.log.slice(n0).map(x=>x.m)));
     const c=put(g,opp,cr('Bear','Bear')); await g.runOps(me,OC('Lossarnach Captain').triggers[0].ops,OC('Lossarnach Captain'),{}); ok('…with a creature there, it taps the creature',c.tapped,''); }
   // Kutzil checks power when damage is dealt
   { const g=fresh(); const [me,opp]=g.players; put(g,me,OC('Kutzil, Malamet Exemplar')); const v=put(g,me,OC('Vincent, Vengeful Atoner')); const h=me.hand.length; g.active=0; await g.combatPhase(me,[{attacker:v,defender:opp}]); await tick(g);
     ok('Kutzil: an unpumped Vincent hitting does not draw (his counter arrives after the damage)',me.hand.length===h&&v.counters===1,JSON.stringify([h,me.hand.length,v.counters]));
     v.tapped=false; g.turn++; const h2=me.hand.length; await g.combatPhase(me,[{attacker:v,defender:opp}]); await tick(g); ok('…next turn, with the counter, it draws',me.hand.length===h2+1,JSON.stringify([h2,me.hand.length])); }
   // Reconnaissance needs one of my attackers
   { const g=fresh(); const [me]=g.players; const r=put(g,me,OC('Reconnaissance')); g.curAttackers=[]; ok('Reconnaissance is not offered with none of my creatures attacking',!g.abilityOptions(me,{}).some(o=>o.perm===r),'');
     const a=put(g,me,cr('Knight','Human Knight')); g.curAttackers=[a]; g.phase='combat'; ok('…and is offered when one is',g.abilityOptions(me,{instant:true}).some(o=>o.perm===r)||g.abilityOptions(me,{}).some(o=>o.perm===r),''); }
 }

 { // v118: owner's Peter Parker game — permanent-wide anthems, Bloom Tender, Selvala/Myojin, Ghalta and Mavren, back faces, Absolute Virtue
   const O=require(__dirname+'/fixtures/owner.json'); const OR=O.cards||O; const OC=(n,x={})=>{const r=OR.find(r=>r[1]===n); if(!r)throw new Error('no '+n); return tagCard({name:r[1],mana:r[2],type:r[3],oracle:r[4],cmc:r[5],power:r[6],toughness:r[7],...x})};
   const put=(g,pl,c,o={})=>{const b={id:700000+Math.floor(Math.random()*1e6),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false,...o};pl.battlefield.push(b);g.refreshStatics();return b};
   const cr=(n,t,p=2,q=2,o='',mana='{1}{W}')=>tagCard(mk(n,'Creature — '+t,mana,o,2,String(p),String(q)));
   // Avacyn
   { const g=fresh(); const [me,opp]=g.players; const av=put(g,me,OC('Avacyn, Angel of Hope')); const pup=put(g,me,cr('Pup','Dog',1,1)); const rock=put(g,me,tagCard(mk('Rock','Artifact','{2}','',2))); const land=put(g,me,tagCard(mk('Plains','Basic Land — Plains','','',0))); const theirs=put(g,opp,cr('Theirs','Bear'));
     ok('Avacyn: my other creature, artifact and land are indestructible',g.isIndestructible(pup)&&g.isIndestructible(rock)&&g.isIndestructible(land),JSON.stringify([pup.card.kw,rock.card.kw,land.card.kw]));
     ok("…an opponent's creature is not",!g.isIndestructible(theirs),'');
     const big=put(g,opp,cr('Ogre','Ogre',5,5)); await g.fightCombat(opp,big,me,pup,[]); await tick(g); ok('a 1/1 blocker survives lethal combat damage with Avacyn out',me.battlefield.includes(pup),'');
     await g.destroy(me,rock); ok('destroy does nothing to my artifact',me.battlefield.includes(rock),'');
     me.battlefield.splice(me.battlefield.indexOf(av),1); g.refreshStatics(); ok('Avacyn gone: indestructible goes away',!g.isIndestructible(pup)&&!g.isIndestructible(rock)&&!g.isIndestructible(land),JSON.stringify([pup.card.kw,rock.card.kw])); }
   { const g=fresh(); const [me]=g.players; put(g,me,OC("Avacyn's Memorial")); const leg=put(g,me,tagCard(mk('Hero','Legendary Creature — Human','{W}','',1,'2','2'))); const non=put(g,me,cr('Pup','Dog',1,1)); const lrock=put(g,me,tagCard(mk('Crown','Legendary Artifact','{2}','',2)));
     ok("Avacyn's Memorial: other legendary permanents only",g.isIndestructible(leg)&&g.isIndestructible(lrock)&&!g.isIndestructible(non),JSON.stringify([leg.card.kw,lrock.card.kw,non.card.kw])); }
   // Bloom Tender / Faeburrow Elder
   for (const nm of ['Bloom Tender','Faeburrow Elder']) { const g=fresh(); const [me]=g.players; me.human=true; me.ai=null; const bt=put(g,me,OC(nm)); put(g,me,cr('Wh','Bird',1,1,'','{W}')); put(g,me,tagCard(mk('Blue Thing','Enchantment','{U}','',1)));
     me.pool=[]; const okTap=await g.tapForMana(me,bt,'W'); const got=(me.pool||[]).map(m=>m.c).sort().join(''); const want=nm==='Bloom Tender'?'GUW':'GUW';
     ok(nm+': one mana of EACH colour among my permanents (G, U, W), not three of one',okTap&&got===want,got); }
   { const g=fresh(); const [me]=g.players; me.human=true; me.ai=null; const bt=put(g,me,OC('Bloom Tender')); me.pool=[]; await g.tapForMana(me,bt,'G'); ok('Bloom Tender alone: just {G}',(me.pool||[]).map(m=>m.c).join('')==='G',JSON.stringify(me.pool)); }
   // Selvala + Myojin
   { const g=fresh(); const [me]=g.players; me.human=true; me.ai=null; let asks=0; g.hooks.humanMay=async()=>{asks++;return true}; put(g,me,OC('Selvala, Heart of the Wilds')); put(g,me,cr('Big','Giant',6,6)); const my=put(g,me,OC('Myojin of Blooming Dawn'),{indestructibleCounter:1});
     const n0=g.log.length; const perms=me.battlefield.length; await g.runOps(me,[{op:'tokensPerPerm'}],my.card,{perm:my}); await tick(g); const L=g.log.slice(n0).map(x=>x.m);
     ok('Myojin: one Spirit per permanent I control',me.battlefield.filter(b=>b.card.name==='Spirit'||/Spirit/.test(b.card.type)&&b.card.token).length===perms,JSON.stringify([perms,L[0]]));
     ok('…and Selvala does not trigger for 1/1 tokens (no stack items, no prompts)',!L.some(m=>/Selvala/.test(m))&&asks===0,JSON.stringify(L.filter(m=>/Selvala/.test(m)).length));
     const h=me.hand.length; const hu=cr('Huge','Wurm',9,9); const b=await g.enterPerm(me,hu); await g.creatureEntered(me,b); await tick(g); ok('Selvala: the biggest creature entering still draws',me.hand.length===h+1,JSON.stringify([h,me.hand.length])); }
   // Ghalta and Mavren
   { const g=fresh(); const [me,opp]=g.players; const gh=put(g,me,OC('Ghalta and Mavren')); const a1=put(g,me,cr('Seven','Giant',7,7)); const a2=put(g,me,cr('Two','Bear',2,2)); const a3=put(g,me,cr('One','Dog',1,1));
     const modes=gh.card.triggers[0].ops[0].modes; ok('both Ghalta modes have real effects',modes.every(m=>m.ops.length===1&&m.ops[0].op==='b15_ghalta'),JSON.stringify(modes.map(m=>m.ops)));
     const atk=[gh,a1,a2,a3].map(b=>({attacker:b,defender:opp})); await g.runOps(me,modes[1].ops,gh.card,{perm:gh,atk,defender:opp}); ok('Vampires: one per OTHER attacking creature (3)',me.battlefield.filter(b=>b.card.name==='Vampire').length===3,''+me.battlefield.filter(b=>b.card.name==='Vampire').length);
     await g.runOps(me,modes[0].ops,gh.card,{perm:gh,atk,defender:opp}); const d=me.battlefield.find(b=>b.card.name==='Dinosaur');
     ok('Dinosaur: X/X where X = greatest power among other attackers (7), trample, tapped and attacking',!!d&&g.powerOf(me,d)===7&&g.toughOf(me,d)===7&&d.card.kw.includes('trample')&&d.tapped&&atk.some(a=>a.attacker===d&&a.defender===opp),d?JSON.stringify([g.powerOf(me,d),d.card.kw,d.tapped]):'none'); }
   // Peter Parker // Amazing Spider-Man with Scryfall-shaped data (back cost / stats / picture live on the second face)
   { const g=fresh(); const [me]=g.players; const r=OR.find(r=>r[1]==='Peter Parker // Amazing Spider-Man'); const pp=tagCard({name:r[1],mana:'{1}{W}',mana2:'{1}{G}{W}{U}',type:r[3],oracle:r[4],cmc:2,power:'0',toughness:'1',power2:'4',toughness2:'4',img:'front.jpg',img2:'back.jpg'});
     ok('front is Peter Parker 0/1 for {1}{W}',pp.power===0&&pp.toughness===1&&pp.mana.total===2&&pp.name==='Peter Parker // Amazing Spider-Man','');
     ok('back face known: Amazing Spider-Man 4/4 with its own picture, castable for {1}{G}{W}{U}',!!pp.backFace&&pp.backFace.power===4&&pp.backFace.toughness===4&&pp.backFace.img==='back.jpg'&&!!pp.mdfcBack&&pp.mdfcBack.mana.total===4,JSON.stringify(pp.backFace&&[pp.backFace.power,pp.backFace.img]));
     const b=put(g,me,pp); await g.runOps(me,[{op:'transform'}],pp,{perm:b}); g.refreshStatics();
     ok('transformed: name, 4/4, back picture, green-white-blue, vigilance + reach',b.card.name==='Amazing Spider-Man'&&g.powerOf(me,b)===4&&g.toughOf(me,b)===4&&b.card.img==='back.jpg'&&['G','U','W'].every(c=>b.card.colors.includes(c))&&b.card.kw.includes('reach')&&b.card.kw.includes('vigilance'),JSON.stringify([b.card.name,g.powerOf(me,b),b.card.img,b.card.colors,b.card.kw]));
     const tapped=put(g,me,cr('Elf','Elf',1,1),{tapped:true}); for(const [n,t] of [['Forest','Forest'],['Plains','Plains'],['Island','Island']])await g.landEnters(me,tagCard(mk(n,'Basic Land — '+t,'','',0))); const leg=tagCard(mk('Big Legend','Legendary Creature — Angel','{5}{W}{W}{W}','',8,'8','8')); const nonleg=tagCard(mk('Plain Guy','Creature — Angel','{5}{W}{W}{W}','',8,'8','8')); me.hand.push(leg,nonleg);
     ok('web-slinging is offered for a legendary coloured spell, not a nonlegendary one',g.altOptions(me,leg,'hand').some(a=>a.kind==='webSling'&&a.cost.total===3)&&!g.altOptions(me,nonleg,'hand').some(a=>a.kind==='webSling'),JSON.stringify(g.altOptions(me,leg,'hand').map(a=>a.kind)));
     await g.runOps(me,[{op:'transform'}],b.card,{perm:b}); g.refreshStatics(); ok('…and it transforms back to Peter Parker 0/1',g.powerOf(me,b)===0&&g.toughOf(me,b)===1&&b.card.img==='front.jpg',JSON.stringify([b.card.name,g.powerOf(me,b)])); }
   { const es=tagCard({name:'Esika, God of the Tree // The Prismatic Bridge',mana:'{1}{G}{G}',mana2:'{W}{U}{B}{R}{G}',type:'Legendary Creature — God // Legendary Enchantment',oracle:'Vigilance\n{T}: Add one mana of any color.\n//\nAt the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.',cmc:3,power:'1',toughness:'4'});
     ok('a modal double-faced card from Scryfall data gets its castable back, and does not "transform"',!!es.mdfcBack&&es.mdfcBack.mana.total===5&&!es.backFace&&es.mdfcBack.isEnchantment&&!es.mdfcBack.isCreature,JSON.stringify([!!es.mdfcBack,!!es.backFace])); }
   // Absolute Virtue
   { const g=fresh(); const [me,opp]=g.players; put(g,me,OC('Absolute Virtue')); const L=me.life; const a=put(g,opp,cr('Hitter','Ogre',5,5)); g.active=1; await g.combatPhase(opp,[{attacker:a,defender:me}]); await tick(g);
     ok("Absolute Virtue: an opponent's creature deals me no combat damage",me.life===L,JSON.stringify([L,me.life]));
     await g.runOps(opp,[{op:'damage',n:3,to:'each opponent'}],cr('Burn','Elemental'),{}); ok('…nor burn from an opponent',me.life===L&&g.players[2].life===37,JSON.stringify([me.life,g.players[2].life]));
     ok('…I cannot be chosen as a target by an opponent',!(await g.choosePlayer(opp,cr('X','Elemental'),[me],'t')),''); 
     const mine=put(g,me,cr('Own','Elemental')); await g.changeLife(me,-2,mine.card); ok('…my own effects still work on me',me.life===L-2,''); }
 }

 { // v118b: back faces — transform-only cards use the back's stats/picture; a commander's castable back can be cast from the command zone
   { const t=tagCard({name:'Front Guy // Back Beast',mana:'{1}{G}',type:'Creature — Human // Creature — Beast',oracle:'{2}{G}: Transform this creature.\n//\nTrample',cmc:2,power:'1',toughness:'1',power2:'6',toughness2:'5',img:'f.jpg',img2:'b.jpg'});
     ok('transform-only card: back face has its own stats and picture',!!t.backFace&&!t.mdfcBack&&t.backFace.power===6&&t.backFace.toughness===5&&t.backFace.img==='b.jpg',JSON.stringify(t.backFace&&[t.backFace.power,t.backFace.toughness,t.backFace.img])); }
   { const O=require(__dirname+'/fixtures/owner.json'); const r=(O.cards||O).find(r=>r[1]==='Peter Parker // Amazing Spider-Man'); const PP={name:r[1],mana:'{1}{W}',mana2:'{1}{G}{W}{U}',type:r[3],oracle:r[4],cmc:2,power:'0',toughness:'1',power2:'4',toughness2:'4',img:'front.jpg',img2:'back.jpg'};
     const dk=buildDeck([...Array(33)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(33)].map(()=>mk('Plains','Basic Land — Plains','','',0)),[...Array(33)].map(()=>mk('Island','Basic Land — Island','','',0)),[PP]),[PP.name]);
     const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:i?deck():dk,ai:new AI('expert')})),{seed:5,hooks:{emit:()=>{}}}); g.active=0; g.phase='main1'; g.turn=6; const me=g.players[0]; me.human=true; me.ai=null;
     for(const n of ['Forest','Plains','Island','Forest','Plains','Island','Forest'])await g.landEnters(me,tagCard(mk(n,'Basic Land — '+n,'','',0)));
     const c=me.command[0]; g.hooks.humanPayOpt=async({alts})=>alts.find(a=>a.kind==='mdfc'); await g.cast(me,c,'cmd'); while(g.stack.length)await g.resolve(g.stack[g.stack.length-1]); await tick(g);
     const b=me.battlefield.find(x=>x.card.name==='Amazing Spider-Man');
     ok('commander back face cast from the command zone: Amazing Spider-Man 4/4 for 4, no Spider token (that is Peter’s trigger)',!!b&&g.powerOf(me,b)===4&&b.card.img==='back.jpg'&&!me.battlefield.some(x=>x.card.name==='Spider')&&me.battlefield.filter(x=>x.card.isLand&&x.tapped).length===4,JSON.stringify(me.battlefield.filter(x=>!x.card.isLand).map(x=>x.card.name)));
     ok('…it is taxed as that commander',g.cmdTaxOf(me,c)===2,JSON.stringify(me.cmdTaxBy));
     if(b){ await g.destroy(me,b); await tick(g); ok('…and goes back to the command zone when it dies',me.command.some(x=>x.name===PP.name)&&!me.graveyard.some(x=>/Peter|Spider-Man/.test(x.name)),JSON.stringify([me.command.map(x=>x.name),me.graveyard.map(x=>x.name)])); } }
 }

 { // v119: owner's Rootha game — scry/surveil lands, rituals fetching lands, nonlegendary copies, legend-rule labels, Plargg and Nassari, Aether Gale
   const O=require(__dirname+'/fixtures/owner.json'); const OR=O.cards||O; const OC=(n,x={})=>{const r=OR.find(r=>r[1]===n); if(!r)throw new Error('no '+n); return tagCard({name:r[1],mana:r[2],type:r[3],oracle:r[4],cmc:r[5],power:r[6],toughness:r[7],...x})};
   const put=(g,pl,c,o={})=>{const b={id:600000+Math.floor(Math.random()*1e6),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false,...o};pl.battlefield.push(b);g.refreshStatics();return b};
   const cr=(n,t,p=2,q=2,o='',mana='{1}{W}')=>tagCard(mk(n,'Creature — '+t,mana,o,2,String(p),String(q)));
   const base=()=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanMay=async()=>true; return [g,me]};
   for (const [nm,word] of [['Temple of Epiphany','scry'],['Temple of Malady','scry'],['Zhalfirin Void','scry'],['Commercial District','surveil']]) { const [g,me]=base(); let asked=null; g.hooks.humanSearch=async c=>{asked=c;return c.pool.slice(0,1)}; const c=OC(nm); me.hand.push(c); const top=me.library[me.library.length-1]; const n0=g.log.length; await g.playLand(me,c); await tick(g);
     ok(nm+': '+word+' 1 when it enters, and I am asked',!!asked&&asked.pool.length===1&&asked.pool[0]===top&&g.log.slice(n0).some(x=>new RegExp(word+' 1').test(x.m))&&(word==='scry'?me.library[0]===top:me.graveyard.includes(top)),JSON.stringify(g.log.slice(n0).map(x=>x.m))); }
   { const g=fresh(); const me=g.players[0]; const c=OC('Temple of Triumph'); me.hand.push(c); const n0=g.log.length; await g.playLand(me,c); await tick(g); ok('AI scries with its Temple too',g.log.slice(n0).some(x=>/scry 1/.test(x.m)),''); }
   for (const nm of ['Seething Song','Big Score']) { const [g,me]=base(); g.hooks.humanSearch=async c=>c.pool.slice(0,c.n||1); const c=OC(nm); const lands=me.battlefield.filter(b=>b.card.isLand).length; const n0=g.log.length; await g.resolve({id:1,kind:'spell',card:c,caster:me,owner:me,zone:'hand'}); await tick(g);
     ok(nm+': no land is fetched',me.battlefield.filter(b=>b.card.isLand).length===lands&&!g.log.slice(n0).some(x=>/fetches/.test(x.m)),JSON.stringify(g.log.slice(n0).map(x=>x.m))); }
   { const [g,me]=base(); g.hooks.humanSearch=async c=>c.pool.slice(0,c.n||1); const c=tagCard(mk('Rampant Growth','Sorcery','{1}{G}','Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.',2)); const lands=me.battlefield.filter(b=>b.card.isLand).length; await g.resolve({id:2,kind:'spell',card:c,caster:me,owner:me,zone:'hand'}); await tick(g); ok('a real land-ramp spell still fetches',me.battlefield.filter(b=>b.card.isLand).length===lands+1,''); }
   // Ember Island Production
   { const [g,me]=base(); const opp=g.players[1]; const ro=put(g,me,OC('Rootha, Mastering the Moment')); const eip=OC('Ember Island Production'); const modes=eip.modes.map(m=>m.card.spellOps);
     ok('both Ember Island modes parse as nonlegendary copies with set stats',modes[0][0].nonlegendary&&!modes[0][0].opp&&modes[0][0].pt.join()==='4,4'&&modes[1][0].opp&&modes[1][0].pt.join()==='2,2',JSON.stringify(modes));
     g.hooks.humanSearch=async c=>c.pool.slice(0,1); const n0=g.log.length; await g.runOps(me,modes[0],eip,{}); await tick(g); await g.sba(); const tk=me.battlefield.find(b=>b.card.token&&/Rootha/.test(b.card.name));
     ok('copy of my legendary commander: a 4/4 nonlegendary Hero token, and the original stays (no legend rule)',!!tk&&!tk.card.isLegendary&&g.powerOf(me,tk)===4&&g.toughOf(me,tk)===4&&/Hero/.test(tk.card.type)&&!/Legendary/.test(tk.card.type)&&me.battlefield.includes(ro)&&!g.log.slice(n0).some(x=>/legend rule/.test(x.m)),JSON.stringify([tk&&tk.card.type,g.log.slice(n0).map(x=>x.m)]));
     const th=put(g,opp,cr('Their Guy','Ogre',6,6)); await g.runOps(me,modes[1],eip,{}); await tick(g); const co=me.battlefield.find(b=>b.card.token&&b.card.name==='Their Guy');
     ok("second mode copies an opponent's creature as a 2/2 Coward",!!co&&g.powerOf(me,co)===2&&/Coward/.test(co.card.type),co?co.card.type:'none'); }
   { const [g,me]=base(); const ro=put(g,me,OC('Rootha, Mastering the Moment')); let pool=null; g.hooks.humanSearch=async c=>{pool=c.pool;return c.pool.slice(0,1)}; await g.runOps(me,OC('Quantum Misalignment').spellOpsX||OC('Quantum Misalignment').spellOps,OC('Quantum Misalignment'),{}); await tick(g); await g.sba();
     ok('Quantum Misalignment may copy a legendary creature; the token is not legendary and both stay',!!pool&&pool.some(c=>/Rootha/.test(c.name))&&me.battlefield.filter(b=>/Rootha/.test(b.card.name)).length===2&&me.battlefield.includes(ro),JSON.stringify(pool&&pool.map(c=>c.name))); }
   // legend rule labels
   { const [g,me]=base(); const a=put(g,me,OC('Rootha, Mastering the Moment')); const b=put(g,me,{...OC('Rootha, Mastering the Moment'),token:true}); let tags=null; g.hooks.humanSearch=async c=>{tags=c.pool.map(x=>x.pickTag);return [c.pool.find(x=>!x.token)]}; await g.sba();
     ok('legend rule prompt labels the original and the token copy',!!tags&&tags.includes('original')&&tags.includes('token copy')&&me.battlefield.includes(a)&&!me.battlefield.includes(b)&&!a.card.pickTag,JSON.stringify(tags)); }
   // Plargg and Nassari
   { const [g,me]=base(); const pn=put(g,me,OC('Plargg and Nassari')); const mine=cr('Mine','Bear'); me.library.push(mine); const tops=[]; g.players.slice(1).forEach((q,i)=>{const c=tagCard(mk('Opp Spell '+i,'Creature — Ogre','{'+(i+3)+'}','',i+3,'3','3')); q.library.push(c); tops.push(c)});
     let offered=null; g.hooks.humanSearch=async c=>{offered=c.pool.map(x=>x.name);return [c.pool.find(x=>x.name==='Mine')]}; const n0=g.log.length; await g.runOps(me,[{op:'plargg'}],pn.card,{perm:pn}); while(g.stack.length)await g.resolve(g.stack[g.stack.length-1]); await tick(g); const L=g.log.slice(n0).map(x=>x.m);
     ok('Plargg and Nassari: the exiled cards are logged; the opponent removes the most expensive; I choose among the rest',L.some(m=>/exiled: /.test(m))&&L.some(m=>/picks Opp Spell 2/.test(m))&&!!offered&&offered.length===3&&!offered.includes('Opp Spell 2'),JSON.stringify([offered,L.slice(0,3)]));
     ok('…only what I chose is cast',me.battlefield.some(b=>b.card.name==='Mine')&&!me.battlefield.some(b=>/Opp Spell/.test(b.card.name)),JSON.stringify(me.battlefield.map(b=>b.card.name))); }
   // Aether Gale
   { const [g,me]=base(); const opp=g.players[1]; const own=put(g,me,cr('My Guy','Bear')); const t1=put(g,opp,cr('T1','Ogre')); const t2=put(g,opp,cr('T2','Ogre')); const t3=put(g,opp,tagCard(mk('Their Rock','Artifact','{2}','',2))); const land=put(g,opp,tagCard(mk('Forest','Basic Land — Forest','','',0)));
     let pool=null; g.hooks.humanSearch=async c=>{pool=c.pool.map(x=>x.name);return c.pool.filter(x=>x.name==='My Guy'||x.name==='T2')}; await g.runOps(me,OC('Aether Gale').spellOps,OC('Aether Gale'),{}); await tick(g);
     ok('Aether Gale: I pick the targets (lands are not offered, my own permanents are)',!!pool&&pool.includes('My Guy')&&pool.includes('Their Rock')&&!pool.includes('Forest'),JSON.stringify(pool));
     ok('…and only the ones I picked return to hand',!me.battlefield.includes(own)&&!opp.battlefield.includes(t2)&&opp.battlefield.includes(t1)&&opp.battlefield.includes(t3)&&me.hand.some(c=>c.name==='My Guy'),''); }
 }

 { // v120: owner's second Rootha game — Ashling's Command modes, Pyrohemia / Elspeth no longer sweep on cast
   const O=require(__dirname+'/fixtures/owner.json'); const OR=O.cards||O; const OC=(n,x={})=>{const r=OR.find(r=>r[1]===n); if(!r)throw new Error('no '+n); return tagCard({name:r[1],mana:r[2],type:r[3],oracle:r[4],cmc:r[5],power:r[6],toughness:r[7],...x})};
   const put=(g,pl,c,o={})=>{const b={id:500000+Math.floor(Math.random()*1e6),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false,...o};pl.battlefield.push(b);g.refreshStatics();return b};
   const cr=(n,t,p=2,q=2,o='',mana='{1}{W}')=>tagCard(mk(n,'Creature — '+t,mana,o,2,String(p),String(q)));
   const base=()=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanMay=async()=>true; return [g,me]};
   const ac=OC("Ashling's Command"); const M=ac.modes.map(m=>m.card);
   ok("Ashling's Command: all four modes have effects",M.every(c=>c.spellOps&&c.spellOps.length),JSON.stringify(M.map(c=>c.spellOps)));
   { const [g,me]=base(); const big=put(g,me,{...cr('Elemental','Elemental',8,8),token:true}); const small=put(g,me,{...cr('Elemental','Elemental',5,5),token:true}); const bear=put(g,me,cr('Bear','Bear',9,9));
     let pool=null; g.hooks.humanSearch=async c=>{pool=c.pool;return [c.pool.find(x=>x.power===5)]}; await g.resolve({id:1,kind:'spell',card:ac,caster:me,owner:me,zone:'hand',modes:[M[0],M[1]]}); await tick(g);
     ok('copy mode: I choose which Elemental (non-Elementals are not offered)',!!pool&&pool.length===2&&pool.every(c=>/Elemental/.test(c.type)),JSON.stringify(pool&&pool.map(c=>c.name+c.power)));
     ok('…and I get a copy of the one I picked',me.battlefield.filter(b=>b.card.name==='Elemental'&&b.card.power===5).length===2&&me.battlefield.filter(b=>b.card.name==='Elemental').length===3,JSON.stringify(me.battlefield.map(b=>b.card.name+b.card.power))); }
   { const [g,me]=base(); const [,o1,o2]=g.players; const mine=put(g,me,cr('Mine','Bear',1,1)); const a=put(g,o1,cr('A','Elf',2,2)); const a2=put(g,o1,cr('A2','Ogre',4,4)); const b=put(g,o2,cr('B','Elf',1,1));
     g.hooks.humanChoosePlayer=async c=>c.players.find(q=>q===o1)||c.players[0]; const n0=g.log.length; await g.resolve({id:2,kind:'spell',card:ac,caster:me,owner:me,zone:'hand',modes:[M[2],M[3]]}); await tick(g);
     ok("damage mode: 2 damage only to the chosen player's creatures",!o1.battlefield.includes(a)&&o1.battlefield.includes(a2)&&o2.battlefield.includes(b)&&me.battlefield.includes(mine),JSON.stringify(g.log.slice(n0).map(x=>x.m)));
     ok('Treasure mode: the chosen player gets two Treasures',o1.battlefield.filter(x=>x.card.name==='Treasure').length===2,JSON.stringify(g.players.map(q=>q.battlefield.filter(x=>x.card.name==='Treasure').length))); }
   for (const nm of ['Pyrohemia',"Elspeth, Sun's Champion"]) { const [g,me]=base(); const opp=g.players[1]; const w=put(g,opp,cr('Weenie','Elf',1,1)); const f=put(g,opp,cr('Fatty','Giant',6,6)); const c=OC(nm); const n0=g.log.length; await g.resolve({id:3,kind:'spell',card:c,caster:me,owner:me,zone:'hand'}); await tick(g);
     ok(nm+': casting it destroys nothing',opp.battlefield.includes(w)&&opp.battlefield.includes(f)&&me.battlefield.some(b=>b.card.name===nm),JSON.stringify(g.log.slice(n0).map(x=>x.m))); }
   { const [g,me]=base(); const opp=g.players[1]; const w=put(g,opp,cr('Weenie','Elf',1,1)); const py=put(g,me,OC('Pyrohemia')); const L=g.players.map(q=>q.life); await g.runOps(me,py.card.abilities[0].ops,py.card,{perm:py}); await tick(g);
     ok('Pyrohemia ability: 1 damage to each creature AND each player',!opp.battlefield.includes(w)&&g.players.every((q,i)=>q.life===L[i]-1),JSON.stringify(g.players.map(q=>q.life))); }
   { const [g,me]=base(); const opp=g.players[1]; const w=put(g,opp,cr('Weenie','Elf',1,1)); const c=tagCard(mk('Day of Judgment','Sorcery','{2}{W}{W}','Destroy all creatures.',4)); await g.resolve({id:4,kind:'spell',card:c,caster:me,owner:me,zone:'hand'}); await tick(g); ok('a real sweeper spell still sweeps',!opp.battlefield.includes(w),''); }
 }

 { // v121: execution-sweep batch — every line that parsed to nothing, plus redirecting a counterspell onto the redirect spell
   const O=require(__dirname+'/fixtures/owner.json'); const OR=O.cards||O; const OC=(n,x={})=>{const r=OR.find(r=>r[1]===n); if(!r)throw new Error('no '+n); return tagCard({name:r[1],mana:r[2],type:r[3],oracle:r[4],cmc:r[5],power:r[6],toughness:r[7],...x})};
   const put=(g,pl,c,o={})=>{const b={id:400000+Math.floor(Math.random()*1e6),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false,...o};pl.battlefield.push(b);g.refreshStatics();return b};
   const cr=(n,t,p=2,q=2,o='',mana='{1}{W}')=>tagCard(mk(n,'Creature — '+t,mana,o,2,String(p),String(q)));
   const base=()=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanMay=async()=>true; g.hooks.humanSearch=async c=>c.pool.slice(0,c.n||1); g.hooks.humanChoosePlayer=async c=>c.players.find(q=>q!==me)||c.players[0]; return [g,me]};
   const mode=(c,i)=>c.modes[i].card.spellOps; const tmode=(ops,i)=>ops[0].modes[i].ops;
   // --- redirect: Deflecting Swat points a Counterspell at itself ---
   for (const human of [true,false]) { const g=fresh(); const [me,opp]=g.players; let cands=null; if(human){me.human=true;me.ai=null;g.hooks.humanRetarget=async c=>{cands=c.candidates;return c.candidates.find(t=>t.spell&&t.spell.card.name==='Deflecting Swat')||null}}
     const bomb=tagCard(mk('My Bomb','Sorcery','{4}{U}','Draw three cards.',5)); const mine={id:1,kind:'spell',card:bomb,caster:me,owner:me,zone:'hand'}; const cs=tagCard(mk('Counterspell','Instant','{U}{U}','Counter target spell.',2)); const csO={id:2,kind:'spell',card:cs,caster:opp,owner:opp,zone:'hand',target:{spell:mine}}; const sw=OC('Deflecting Swat'); const swO={id:3,kind:'spell',card:sw,caster:me,owner:me,zone:'hand',target:{spell:csO}};
     g.stack.push(mine,csO); me.hand.push(sw); ok((human?'human':'AI')+': a redirect spell is usable when the only thing on the stack is a counterspell aimed at my spell',g.redirectable(me),'');
     g.stack.push(swO); const h=me.hand.length; const n0=g.log.length; g.stack.pop(); await g.resolve(swO); g.stack.pop(); await g.resolve(csO); if(g.stack.includes(mine)){g.stack.pop(); await g.resolve(mine)} const L=g.log.slice(n0).map(x=>x.m);
     ok((human?'human':'AI')+': Deflecting Swat points the Counterspell at itself → it fizzles and my spell resolves',L.some(m=>/Counterspell now targets Deflecting Swat/.test(m))&&L.some(m=>/Counterspell fizzles/.test(m))&&me.hand.length===h+3&&!L.some(m=>/My Bomb is countered/.test(m)),JSON.stringify(L)); }
   { const g=fresh(); const [me,opp,o2]=g.players; const theirs={id:5,kind:'spell',card:tagCard(mk('Their Bomb','Sorcery','{4}{B}','Each opponent loses 5 life.',5)),caster:o2,owner:o2,zone:'hand'}; const bomb={id:1,kind:'spell',card:tagCard(mk('My Bomb','Sorcery','{4}{U}','Draw three cards.',5)),caster:me,owner:me,zone:'hand'}; const csO={id:2,kind:'spell',card:tagCard(mk('Counterspell','Instant','{U}{U}','Counter target spell.',2)),caster:opp,owner:opp,zone:'hand',target:{spell:bomb}}; const swO={id:3,kind:'spell',card:OC('Deflecting Swat'),caster:me,owner:me,zone:'hand',target:{spell:csO}};
     g.stack.push(theirs,bomb,csO); await g.resolve(swO); ok("AI prefers pointing the counterspell at another opponent's spell when there is one",csO.target.spell===theirs,csO.target.spell.card.name); }
   // --- modal spells ---
   { const [g,me]=base(); g.players.forEach(q=>q.graveyard.push(cr('G','Bear'))); await g.runOps(me,mode(OC("Kaya's Guile"),1),OC("Kaya's Guile"),{}); ok("Kaya's Guile: exiles every opponent's graveyard, not mine",g.players.slice(1).every(q=>!q.graveyard.length&&q.exile.some(c=>c.name==='G'))&&me.graveyard.length===1,''); }
   { const [g,me]=base(); const a=cr('A','Bear'),b=cr('B','Bear'),c=cr('C','Bear'); me.hand.push(a,b,c); g.hooks.humanSearch=async q=>q.pool.filter(x=>x===a||x===c); await g.runOps(me,mode(OC("Smuggler's Surprise"),1),OC("Smuggler's Surprise"),{}); ok("Smuggler's Surprise: puts the two creatures I chose onto the battlefield",me.battlefield.some(x=>x.card===a)&&me.battlefield.some(x=>x.card===c)&&me.hand.includes(b),''); }
   { const [g,me]=base(); const opp=g.players[1]; const x=put(g,opp,cr('X','Ogre')),y=put(g,opp,cr('Y','Ogre')),z=put(g,opp,cr('Z','Ogre')); let k=0; g.hooks.humanSearch=async q=>[q.pool[0]]; await g.runOps(me,mode(OC('Untimely Malfunction'),2),OC('Untimely Malfunction'),{}); ok("Untimely Malfunction: two creatures can't block this turn",[x,y,z].filter(b=>b.noBlockTurn===g.turn).length===2&&!g.canBlock(x.noBlockTurn===g.turn?x:y,put(g,me,cr('Atk','Bear'))),''); }
   { const [g,me]=base(); const top=me.library.slice(-3).reverse(); const lib=me.library.length; g.hooks.humanSearch=async q=>q.pool.slice(0,2); await g.runOps(me,mode(OC("Thassa's Intervention"),0),OC("Thassa's Intervention"),{x:3}); ok("Thassa's Intervention (X=3): two of the top three go to hand, the third to the bottom",me.hand.includes(top[0])&&me.hand.includes(top[1])&&me.library[0]===top[2]&&me.library.length===lib-2,''); }
   { const [g,me]=base(); const opp=g.players[1]; put(g,me,cr('M1','Bear')); put(g,me,cr('M2','Bear')); put(g,me,cr('M3','Bear')); const t3=put(g,opp,cr('T3','Ogre',3,3)); const t5=put(g,opp,cr('T5','Giant',5,5)); g.hooks.humanSearch=async q=>[q.pool.find(c=>c.name==='T3')]; await g.runOps(me,mode(OC('Will of the Mardu'),1),OC('Will of the Mardu'),{}); await tick(g); ok('Will of the Mardu: damage equal to my creature count (3) kills a 3/3',!opp.battlefield.includes(t3)&&opp.battlefield.includes(t5),''); }
   // --- modal triggers / enter effects ---
   { const [g,me]=base(); const opp=g.players[1]; const as=put(g,me,OC('Astarion, the Decadent')); const M=as.card.triggers.find(t=>t.when==='end').ops; opp.lostTurn=g.turn; opp.lostThisTurn=5; const L=opp.life; await g.runOps(me,tmode(M,0),as.card,{perm:as}); ok('Astarion — Feed: the opponent loses as much again as they lost this turn (5)',opp.life===L-5,JSON.stringify([L,opp.life]));
     me.gainedTurn=g.turn; me.gainedThisTurn=4; const L2=me.life; await g.runOps(me,tmode(M,1),as.card,{perm:as}); ok('Astarion — Friends: I gain as much as I gained this turn (4)',me.life===L2+4,JSON.stringify([L2,me.life])); }
   { const [g,me]=base(); const ap=put(g,me,OC('Appa, Loyal Sky Bison')); const bear=put(g,me,cr('Bear','Bear')); const rock=put(g,me,tagCard(mk('Rock','Artifact','{2}','',2))); const M=ap.card.triggers.find(t=>t.when==='attack').ops; g.hooks.humanSearch=async q=>[q.pool.find(c=>c.name==='Bear')]; await g.runOps(me,tmode(M,0),ap.card,{perm:ap}); ok('Appa: target creature I control gains flying until end of turn',bear.card.kw.includes('flying'),JSON.stringify(bear.card.kw));
     g.hooks.humanSearch=async q=>[q.pool.find(c=>c.name==='Rock')]; await g.runOps(me,tmode(M,1),ap.card,{perm:ap}); ok('Appa: airbends another nonland permanent of mine (exiled, castable for {2})',!me.battlefield.includes(rock)&&me.exile.some(c=>c.name==='Rock')&&(me.exileCast||[]).some(e=>e.card.name==='Rock'),JSON.stringify(me.exile.map(c=>c.name)));
     ok('Appa has the same choices when it enters',ap.card.etbOps[0].modes.every(m=>m.ops.length),''); }
   { const [g,me]=base(); const opp=g.players[1]; const tc=put(g,me,OC('Tax Collector')); const M=tc.card.etbOps; const sp=tagCard(mk('Opp Bear','Creature — Bear','{1}{G}','',2,'2','2')); const c0=g.costOf(opp,sp,'hand').total; await g.runOps(me,tmode(M,0),tc.card,{perm:tc}); ok("Tax Collector — Tax: opponents' spells, creatures included, cost {1} more; mine don't",g.costOf(opp,sp,'hand').total===c0+1&&g.costOf(me,sp,'hand').total===c0,JSON.stringify([c0,g.costOf(opp,sp,'hand').total]));
     const v=put(g,opp,tagCard(mk('Victim','Creature — Ogre','{2}{R}','{T}: Draw a card.',3,'3','3'))); await g.runOps(me,tmode(M,1),tc.card,{perm:tc}); ok("Tax Collector — Arrest: the detained creature can't attack, block or use abilities",!!v.b18_detain&&!g.canAttackWith(opp,v)&&!g.canBlock(v,put(g,me,cr('Atk','Bear')))&&!g.abilityOptions(opp,{}).some(o=>o.perm===v),'');
     g.active=0; g.hooks.humanTurn=async()=>({action:'end'}); await g.takeTurn(me); ok('…and detain ends at my next turn',!v.b18_detain,''); }
   { const [g,me]=base(); const ti=put(g,me,OC('Titan of Industry')); const M=ti.card.etbOps; ok('Titan of Industry: all four modes have effects',M[0].modes.every(m=>m.ops.length),''); g.hooks.humanChoosePlayer=async c=>me; const L=me.life; await g.runOps(me,tmode(M,1),ti.card,{perm:ti}); ok('…target player gains 5',me.life===L+5,''); await g.runOps(me,tmode(M,3),ti.card,{perm:ti}); ok('…a creature of mine gets a shield counter',me.battlefield.some(b=>b.ck&&b.ck.shield>0),''); }
   { const [g,me]=base(); const ju=put(g,me,OC('Junji, the Midnight Sky')); const M=ju.card.triggers.find(t=>t.when==='dies').ops; const before=g.players.slice(1).map(q=>[q.hand.length,q.life]); await g.runOps(me,tmode(M,0),ju.card,{perm:ju,dead:ju}); await tick(g); ok('Junji: each opponent discards two and loses 2',g.players.slice(1).every((q,i)=>q.hand.length===before[i][0]-2&&q.life===before[i][1]-2),JSON.stringify([before,g.players.slice(1).map(q=>[q.hand.length,q.life])])); }
   { const [g,me]=base(); const se=put(g,me,OC('Silverback Elder')); const M=se.card.triggers.find(t=>t.when==='cast').ops; const land=tagCard(mk('Forest','Basic Land — Forest','','',0)); me.library.push(cr('L1','Bear'),land,cr('L2','Bear'),cr('L3','Bear'),cr('L4','Bear')); const lib=me.library.length; const lands=me.battlefield.filter(b=>b.card.isLand).length; await g.runOps(me,tmode(M,1),se.card,{perm:se}); const lb=me.battlefield.find(b=>b.card===land);
     ok('Silverback Elder: a land from the top five enters tapped, the other four go to the bottom',!!lb&&lb.tapped&&me.library.length===lib-1&&me.library.slice(0,4).every(c=>/^L\d$/.test(c.name)),JSON.stringify([!!lb,me.library.slice(0,4).map(c=>c.name)])); }
   { const [g,me]=base(); const sh=put(g,me,OC('Silent Hallcreeper')); const big=put(g,me,cr('Big','Giant',6,6,'Trample')); const M=sh.card.triggers.find(t=>t.when==='combatDamage').ops; const mi=M[0].modes.findIndex(m=>/copy/.test(m.text)); g.hooks.humanSearch=async q=>[q.pool.find(c=>c.name==='Big')]; await g.runOps(me,M[0].modes[mi].ops,sh.card,{perm:sh}); ok('Silent Hallcreeper becomes a copy of another creature I control',sh.card.name==='Big'&&g.powerOf(me,sh)===6&&me.battlefield.includes(big),sh.card.name); }
   { const [g,me]=base(); const sa=put(g,me,OC('Satsuki, the Living Lore')); const saga=put(g,me,tagCard(mk('Old Tale','Enchantment — Saga','{1}{G}','',2))); const M=sa.card.triggers.find(t=>t.when==='dies').ops; await g.runOps(me,tmode(M,0),sa.card,{perm:sa,dead:sa}); ok('Satsuki: returns a Saga I control to hand',!me.battlefield.includes(saga)&&me.hand.some(c=>c.name==='Old Tale'),''); }
   { const [g,me]=base(); const q=put(g,me,OC('Avengers Quinjet')); const hero=tagCard(mk('Cap','Legendary Creature — Human Hero','{W}','',1,'2','2')); const non=cr('Nobody','Bear'); me.hand.push(hero,non); let pool=null; g.hooks.humanSearch=async c=>{pool=c.pool;return c.pool.slice(0,1)}; await g.runOps(me,tmode(q.card.etbOps,0),q.card,{perm:q}); ok('Avengers Quinjet: a Hero creature from hand enters; non-Heroes are not offered',me.battlefield.some(b=>b.card===hero)&&pool.length===1,JSON.stringify(pool&&pool.map(c=>c.name))); }
   { const [g,me]=base(); const opp=g.players[1]; const ac=put(g,me,OC('Aether Channeler')); const t=put(g,opp,cr('Their Guy','Ogre')); const mi=ac.card.etbOps[0].modes.findIndex(m=>/return another/.test(m.text)); g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Their Guy')]; await g.runOps(me,ac.card.etbOps[0].modes[mi].ops,ac.card,{perm:ac}); ok('Aether Channeler: bounces the nonland permanent I pick',!opp.battlefield.includes(t)&&opp.hand.some(c=>c.name==='Their Guy'),''); }
   { const [g,me]=base(); const cp=put(g,me,OC('Charming Prince')); const mine=put(g,me,cr('ETB Guy','Bear')); const mi=cp.card.etbOps[0].modes.findIndex(m=>/exile another/.test(m.text)); g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='ETB Guy')]; await g.runOps(me,cp.card.etbOps[0].modes[mi].ops,cp.card,{perm:cp}); ok('Charming Prince: my creature is exiled now…',!me.battlefield.includes(mine)&&me.exile.some(c=>c.name==='ETB Guy')&&(g.endReturns||[]).some(e=>e.card.name==='ETB Guy'),''); }
   // --- "whenever you attack" effects and Colfenor ---
   { const [g,me]=base(); const opp=g.players[1]; const ck=put(g,me,OC('Chocobo Knights')); const a=put(g,me,cr('Countered','Bear'),{counters:1}); const b2=put(g,me,cr('Plain','Bear')); ok('Chocobo Knights trigger has an effect',ck.card.triggers[0].ops.length>0,''); await g.runOps(me,ck.card.triggers[0].ops,ck.card,{perm:ck,atk:[{attacker:a,defender:opp}]}); ok('…creatures with counters gain double strike; others do not',a.card.kw.includes('double strike')&&!b2.card.kw.includes('double strike'),JSON.stringify([a.card.kw,b2.card.kw])); }
   { const [g,me]=base(); const opp=g.players[1]; const ar=put(g,me,OC('Araña, Heart of the Spider')); const a=put(g,me,cr('Atk','Bear')); g.curAttackers=[a]; await g.runOps(me,ar.card.triggers[0].ops,ar.card,{perm:ar,atk:[{attacker:a,defender:opp}]}); ok('Araña: +1/+1 counter on the attacking creature',a.counters===1,''+a.counters); }
   { const [g,me]=base(); const dd=put(g,me,OC('Daredevil, Man Without Fear')); const hero=tagCard(mk('Cap','Legendary Creature — Human Hero','{W}','',1,'2','2')); me.library.push(hero); const p0=g.powerOf(me,dd),t0=g.toughOf(me,dd); await g.runOps(me,dd.card.triggers[0].ops,dd.card,{perm:dd}); ok('Daredevil: exiles the top card to play this turn; a Hero gives +2/+1',me.hand.includes(hero)&&!!hero.impulse&&g.powerOf(me,dd)===p0+2&&g.toughOf(me,dd)===t0+1,JSON.stringify([p0,t0,g.powerOf(me,dd),g.toughOf(me,dd)]));
     const non=cr('Nobody','Bear'); me.library.push(non); const p1=g.powerOf(me,dd); await g.runOps(me,dd.card.triggers[0].ops,dd.card,{perm:dd}); ok('…a non-Hero is still playable but gives no bonus',me.hand.includes(non)&&g.powerOf(me,dd)===p1,''); }
   { const [g,me]=base(); const co=put(g,me,OC('Colfenor, the Last Yew')); ok('Colfenor triggers have effects',co.card.triggers.every(t=>t.ops.length>0),JSON.stringify(co.card.triggers.map(t=>t.ops)));
     const small=cr('Small','Bear',1,1), big=cr('Big','Giant',6,6), deadc=cr('Dead Guy','Ogre',3,3); me.graveyard.push(small,big,deadc); let pool=null; g.hooks.humanSearch=async c=>{pool=c.pool.map(x=>x.name);return c.pool.slice(0,1)}; await g.runOps(me,co.card.triggers[0].ops,co.card,{perm:co,dead:{card:deadc}});
     ok('Colfenor: only creature cards with lesser toughness than the one that died are offered',!!pool&&pool.length===1&&pool[0]==='Small'&&me.hand.includes(small),JSON.stringify(pool)); }
   // --- Indulge // Excess, Safewright, Eerie Interlude ---
   { const [g,me]=base(); const opp=g.players[1]; const ind=OC('Indulge // Excess'); ok('Indulge has an effect',!!(ind.spellOpsX&&ind.spellOpsX.length),''); await g.resolve({id:1,kind:'spell',card:ind,caster:me,owner:me,zone:'hand'}); const a=put(g,me,cr('A','Bear')), b=put(g,me,cr('B','Bear')); g.active=0; await g.combatPhase(me,[{attacker:a,defender:opp},{attacker:b,defender:opp}]); await tick(g);
     ok('Indulge: each attacking creature brings a tapped, attacking 1/1 Citizen',me.battlefield.filter(x=>x.card.name==='Citizen').length===2,''+me.battlefield.filter(x=>x.card.name==='Citizen').length);
     const T0=me.battlefield.filter(x=>x.card.name==='Treasure').length; await g.runOps(me,ind.aftermath.spellOps,ind.aftermath,{}); const made=me.battlefield.filter(x=>x.card.name==='Treasure').length-T0; ok('Excess: one Treasure per creature that dealt combat damage to a player this turn (not a flat 1)',made>=2,'made '+made); }
   { const [g,me]=base(); const elf=put(g,me,cr('Elfy','Elf Druid')); const ogre=put(g,me,cr('Ogrey','Ogre')); const sw=put(g,me,OC('Selfless Safewright')); sw.chosenType='ogre'; await g.runOps(me,sw.card.etbOps,sw.card,{perm:sw}); ok('Selfless Safewright protects the type I chose, not the most common one',g.isIndestructible(ogre)&&!g.isIndestructible(elf),JSON.stringify([ogre.card.kw,elf.card.kw])); }
   { const [g,me]=base(); const a=put(g,me,cr('Keep','Bear')), b=put(g,me,cr('Blink','Bear')); g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Blink')]; await g.runOps(me,OC('Eerie Interlude').spellOps,OC('Eerie Interlude'),{}); ok('Eerie Interlude: only the creatures I choose are exiled',me.battlefield.includes(a)&&!me.battlefield.includes(b),''); }
 }

 { // v122: Rooms (doors), casualty, a player leaving with things on the stack, Forgotten Ancient
   const O=require(__dirname+'/fixtures/owner.json'); const OR=O.cards||O; const OC=(n,x={})=>{const r=OR.find(r=>r[1]===n); if(!r)throw new Error('no '+n); return tagCard({name:r[1],mana:r[2],type:r[3],oracle:r[4],cmc:r[5],power:r[6],toughness:r[7],...x})};
   const put=(g,pl,c,o={})=>{const b={id:300000+Math.floor(Math.random()*1e6),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false,...o};pl.battlefield.push(b);g.refreshStatics();return b};
   const cr=(n,t,p=2,q=2,o='',mana='{1}{W}')=>tagCard(mk(n,'Creature — '+t,mana,o,2,String(p),String(q)));
   const base=()=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanMay=async()=>true; g.hooks.humanSearch=async c=>c.pool.slice(0,c.n||1); return [g,me]};
   const lands=async(g,me,n,t)=>{for(let i=0;i<n;i++)await g.landEnters(me,tagCard(mk(t,'Basic Land — '+t,'','',0)))};
   // --- Rooms ---
   { const cf=OC('Charred Foyer // Warped Space'); ok('Room parses: two doors, the right one castable',cf.room&&!!cf.mdfcBack&&cf.doorName==='Charred Foyer'&&cf.mdfcBack.doorName==='Warped Space'&&cf.mdfcBack.mana.total===6&&cf.mdfcBack.statics.freeExileOnce===true,JSON.stringify([cf.room,cf.doorName,cf.mdfcBack&&cf.mdfcBack.statics]));
     const [g,me]=base(); await lands(g,me,12,'Mountain'); const c=OC('Charred Foyer // Warped Space'); me.hand.push(c); g.hooks.humanPayOpt=async()=>null; await g.cast(me,c,'hand'); while(g.stack.length){const o=g.stack.pop(); await g.resolve(o)} await tick(g); const pm=me.battlefield.find(b=>b.doors);
     ok('cast as the left half: Charred Foyer unlocked, Warped Space locked',!!pm&&pm.doors.L&&!pm.doors.R&&pm.card.name==='Charred Foyer'&&pm.card.triggers.some(t=>t.when==='upkeep')&&!pm.card.statics.freeExileOnce,pm?JSON.stringify([pm.doors,pm.card.name]):'no perm');
     const ua=pm.card.abilities.find(a=>a.roomUnlock); ok('…with an ability to unlock the other door for its mana cost, at sorcery speed',!!ua&&ua.cost.total===6&&ua.speed==='sorcery'&&/Warped Space/.test(ua.label),ua&&ua.label);
     await g.runOps(me,ua.ops,pm.card,{perm:pm}); ok('unlocking: both doors open, both texts active, no unlock ability left',pm.doors.L&&pm.doors.R&&pm.card.name==='Charred Foyer // Warped Space'&&pm.card.statics.freeExileOnce===true&&pm.card.triggers.some(t=>t.when==='upkeep')&&!pm.card.abilities.some(a=>a.roomUnlock),JSON.stringify([pm.card.name,pm.card.statics]));
     const ex=tagCard(mk('Big Spell','Sorcery','{5}{R}{R}','Draw a card.',7)); ex.impulse={turn:g.turn}; me.hand.push(ex); ok('Warped Space: a spell cast from exile may be cast for {0}, once each turn',g.altOptions(me,ex,'hand').some(a=>a.cond==='warped'&&a.cost.total===0),JSON.stringify(g.altOptions(me,ex,'hand').map(a=>a.kind+':'+a.cond)));
     me.b19_freeExTurn=g.turn; ok('…not a second time that turn',!g.altOptions(me,ex,'hand').some(a=>a.cond==='warped'),'');
     await g.destroy(me,pm); ok('the Room card goes to the graveyard as one card',me.graveyard.some(x=>x.name==='Charred Foyer // Warped Space')&&me.graveyard.filter(x=>/Foyer|Warped/.test(x.name)).length===1,JSON.stringify(me.graveyard.map(x=>x.name))); }
   { const [g,me]=base(); await lands(g,me,12,'Forest'); const c=OC('Walk-In Closet // Forgotten Cellar'); me.hand.push(c); g.hooks.humanPayOpt=async({alts})=>alts.find(a=>a.kind==='mdfc'); await g.cast(me,c,'hand'); while(g.stack.length){const o=g.stack.pop(); await g.resolve(o)} await tick(g); while(g.stack.length){const o=g.stack.pop(); await g.resolve(o)} const pm=me.battlefield.find(b=>b.doors);
     ok('cast as the right half: Forgotten Cellar unlocked, Walk-In Closet locked (no lands from graveyard yet)',!!pm&&pm.doors.R&&!pm.doors.L&&pm.card.name==='Forgotten Cellar'&&!pm.card.statics.landsFromGy,pm?JSON.stringify([pm.doors,pm.card.name,pm.card.statics]):'no perm');
     ok('"When you unlock this door" fires as it enters: I may cast spells from my graveyard this turn',me.b19_cellar===g.turn,''+me.b19_cellar);
     const gs=tagCard(mk('Gy Spell','Sorcery','{1}{G}','Draw a card.',2)); me.graveyard.push(gs); const gg=g.gyGrant(me,gs); ok('…a graveyard spell is castable and will be exiled afterwards',!!gg&&gg.exileAfter===true,JSON.stringify(gg));
     const ua=pm.card.abilities.find(a=>a.roomUnlock); await g.runOps(me,ua.ops,pm.card,{perm:pm}); ok('unlocking Walk-In Closet later turns on lands from the graveyard',pm.card.statics.landsFromGy===true&&pm.doors.L,''); }
   { const [g,me]=base(); const c=OC('Charred Foyer // Warped Space'); const pm=await g.enterPerm(me,c); ok('a Room put onto the battlefield without being cast has both doors locked and two unlock abilities',pm.doors&&!pm.doors.L&&!pm.doors.R&&pm.card.abilities.filter(a=>a.roomUnlock).length===2&&!pm.card.triggers.length,JSON.stringify(pm.doors)); }
   // --- casualty ---
   { const [g,me]=base(); const opp=g.players[1]; await lands(g,me,4,'Mountain'); put(g,me,OC('Silverquill, the Disputant')); const fod=put(g,me,{...cr('Fodder','Spirit',1,1),token:true}); const t1=put(g,opp,cr('T1','Ogre',2,2)); const t2=put(g,opp,cr('T2','Ogre',2,2));
     const bolt=tagCard(mk('Zap','Instant','{R}','Zap deals 3 damage to target creature.',1)); me.hand.push(bolt); let asked=null; g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Fodder')||c.pool[0]]; g.hooks.humanRetarget=async c=>{asked=c.candidates.map(t=>t.card?t.card.name:'?');return c.candidates.find(t=>t.card&&t.card.name==='T2')||null};
     const n0=g.log.length; await g.cast(me,bolt,'hand',t1); while(g.stack.length){const o=g.stack.pop(); await g.resolve(o)} await tick(g); const L=g.log.slice(n0).map(x=>x.m);
     ok('casualty: sacrificing a power-1 creature copies the spell',!me.battlefield.includes(fod)&&L.some(m=>/casualty: sacrifices Fodder/.test(m))&&L.some(m=>/copies Zap \(casualty\)/.test(m)),JSON.stringify(L));
     ok('…the copy resolves first and I may give it a new target',!!asked&&asked.includes('T2')&&L.findIndex(m=>/damage to T2/.test(m))>=0&&L.findIndex(m=>/damage to T2/.test(m))<L.findIndex(m=>/damage to T1/.test(m)),JSON.stringify([asked,L]));
     ok('…so both creatures die',!opp.battlefield.includes(t1)&&!opp.battlefield.includes(t2),JSON.stringify(opp.battlefield.filter(b=>b.card.isCreature).map(b=>b.card.name))); }
   { const [g,me]=base(); await lands(g,me,4,'Mountain'); put(g,me,OC('Silverquill, the Disputant')); const fod=put(g,me,cr('Zero','Wall',0,3)); const bolt=tagCard(mk('Zap','Instant','{R}','Draw a card.',1)); me.hand.push(bolt); let asks=0; g.hooks.humanMay=async()=>{asks++;return true}; g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='Zero')].filter(Boolean); const n0=g.log.length; await g.cast(me,bolt,'hand'); ok('casualty 1 cannot be paid with a power-0 creature',me.battlefield.includes(fod)&&!g.log.slice(n0).some(x=>/sacrifices Zero/.test(x.m)),JSON.stringify(g.log.slice(n0).map(x=>x.m))); }
   { const g=fresh(); const [me,opp]=g.players; for(let i=0;i<4;i++)await g.landEnters(me,tagCard(mk('Mountain','Basic Land — Mountain','','',0))); put(g,me,OC('Silverquill, the Disputant')); const fod=put(g,me,{...cr('Fodder','Spirit',1,1),token:true}); const t1=put(g,opp,cr('T1','Ogre',2,2)); const t2=put(g,opp,cr('T2','Ogre',2,2)); const bolt=tagCard(mk('Zap','Instant','{R}','Zap deals 3 damage to target creature.',1)); me.hand.push(bolt); const n0=g.log.length; await g.cast(me,bolt,'hand',t1); while(g.stack.length){const o=g.stack.pop(); await g.resolve(o)} await tick(g); const L=g.log.slice(n0).map(x=>x.m);
     ok('AI casualty: sacrifices a token and aims the copy at a different creature (both die)',!me.battlefield.includes(fod)&&!opp.battlefield.includes(t1)&&!opp.battlefield.includes(t2),JSON.stringify(L)); }
   // --- a player leaves the game with things on the stack ---
   { const g=fresh(); const [me,opp,o2]=g.players; const theirSpell={id:1,kind:'spell',card:tagCard(mk('Their Bomb','Sorcery','{4}{B}','Each opponent loses 5 life.',5)),caster:opp,owner:opp,zone:'hand'}; const theirAb={id:2,kind:'ability',card:tagCard(mk('Their Thing','Artifact','{2}','',2)),caster:opp,ops:[{op:'draw',n:1}]}; const mine={id:3,kind:'spell',card:tagCard(mk('My Spell','Sorcery','{1}{U}','Draw a card.',2)),caster:me,owner:me,zone:'hand'}; const cs={id:4,kind:'spell',card:tagCard(mk('Counterspell','Instant','{U}{U}','Counter target spell.',2)),caster:o2,owner:o2,zone:'hand',target:{spell:theirSpell}};
     g.stack.push(theirSpell,theirAb,mine,cs); const stolen=put(g,opp,cr('Stolen From Me','Bear')); stolen.owner=0; const lent=put(g,me,cr('Owned By Opp','Ogre')); lent.owner=1; const n0=g.log.length; const L0=me.life; await g.kill(opp,'test'); const L=g.log.slice(n0).map(x=>x.m);
     ok("a player who leaves takes their spells and abilities off the stack; everyone else's stay",!g.stack.includes(theirSpell)&&!g.stack.includes(theirAb)&&g.stack.includes(mine)&&g.stack.includes(cs)&&L.some(m=>/leaves the stack/.test(m)),JSON.stringify(L));
     ok('…a creature they had stolen goes back to its owner',me.battlefield.includes(stolen),'');
     ok('…and a permanent they own under my control leaves the game',!me.battlefield.includes(lent),'');
     g.stack.pop(); await g.resolve(cs); ok("…a counterspell aimed at one of their spells fizzles, and the spell never resolves",g.log.slice(n0).some(x=>/Counterspell fizzles/.test(x.m))&&me.life===L0,JSON.stringify(g.log.slice(n0).map(x=>x.m))); }
   // --- Forgotten Ancient ---
   { const [g,me]=base(); const fa=put(g,me,OC('Forgotten Ancient'),{counters:3}); const a=put(g,me,cr('A','Bear')); g.hooks.humanSearch=async c=>[c.pool.find(x=>x.name==='A')]; g.hooks.humanNumber=async()=>2; let turns=0; const tr=fa.card.triggers.find(t=>t.when==='upkeep'); const orig=g.hooks.humanSearch; g.hooks.humanSearch=async c=>{turns++; return turns===1?[c.pool.find(x=>x.name==='A')]:[]}; await g.runOps(me,tr.ops,fa.card,{perm:fa});
     ok('Forgotten Ancient: I choose where its counters go and how many',fa.counters===1&&a.counters===2,JSON.stringify([fa.counters,a.counters])); }
 }
 { // v123: Teval's land return, Terra's Trance flying, choosing sacrifices for a cost, Animate Dead put onto the battlefield, three dropped second sentences
   const O=require(__dirname+'/fixtures/owner.json'); const OR=O.cards||O; const OC=(n,x={})=>{const r=OR.find(r=>r[1]===n); if(!r)throw new Error('no '+n); return tagCard({name:r[1],mana:r[2],type:r[3],oracle:r[4],cmc:r[5],power:r[6],toughness:r[7],...x})};
   const put=(g,pl,c,o={})=>{const b={id:400000+Math.floor(Math.random()*1e6),card:c,tapped:false,counters:0,enteredTurn:0,summoning:false,...o};pl.battlefield.push(b);g.refreshStatics();return b};
   const cr=(n,t,p=2,q=2,o='',mana='{1}{W}')=>tagCard(mk(n,'Creature — '+t,mana,o,2,String(p),String(q)));
   const base=()=>{const g=fresh(); const me=g.players[0]; me.human=true; me.ai=null; g.hooks.humanMay=async()=>true; g.hooks.humanSearch=async c=>c.pool.slice(0,c.n||1); return [g,me]};
   const lands=async(g,me,n,t)=>{for(let i=0;i<n;i++)await g.landEnters(me,tagCard(mk(t,'Basic Land — '+t,'','',0)))};
   // --- Teval, the Balanced Scale ---
   { const [g,me]=base(); const tv=put(g,me,OC('Teval, the Balanced Scale')); const wf=tagCard(mk('Wooded Foothills','Land','','{T}, Pay 1 life, Sacrifice this land: Search your library for a Mountain or Forest card, put it onto the battlefield, then shuffle.',0)); me.graveyard.push(wf); const asked=[]; g.hooks.humanSearch=async c=>{asked.push(c.dest+':'+c.pool.map(x=>x.name).join(',')); return [c.pool.find(x=>x.name==='Wooded Foothills')||c.pool[0]].filter(Boolean)}; const tr=tv.card.triggers.find(t=>t.when==='attack'); const lib0=me.library.length; await g.runOps(me,tr.ops,tv.card,{perm:tv}); await tick(g); const land=me.battlefield.find(b=>b.card===wf);
     ok('Teval attack: mills three, then I may return a land card from my graveyard — it enters tapped',me.library.length===lib0-3&&!!land&&land.tapped===true&&asked.some(a=>/Wooded Foothills/.test(a)),JSON.stringify(asked));
     ok('…and that is a card leaving my graveyard: Teval makes a Zombie Druid',me.battlefield.some(b=>b.card.token&&/Zombie/.test(b.card.type||b.card.name)),JSON.stringify(me.battlefield.map(b=>b.card.name))); }
   { const [g,me]=base(); const tv=put(g,me,OC('Teval, the Balanced Scale')); const wf=tagCard(mk('Forest','Basic Land — Forest','','',0)); me.graveyard.push(wf); g.hooks.humanSearch=async()=>[]; const tr=tv.card.triggers.find(t=>t.when==='attack'); await g.runOps(me,tr.ops,tv.card,{perm:tv}); ok('Teval: "you may" — choosing nothing leaves the land in the graveyard',me.graveyard.includes(wf)); }
   // --- Terra, Herald of Hope ---
   { const [g,me]=base(); const opp=g.players[1]; const terra=put(g,me,OC('Terra, Herald of Hope')); const bear=put(g,opp,cr('Ground Bear','Bear',3,3)); const bird=put(g,opp,tagCard(mk('Sky Bird','Creature — Bird','{1}{U}','Flying',2,'1','1'))); const tr=terra.card.triggers.find(t=>t.when==='combatStart'); await g.runOps(me,tr.ops,terra.card,{perm:terra}); g.refreshStatics();
     ok('Terra Trance: she has flying this turn',(terra.card.kw||[]).includes('flying')||g.hasKw&&g.hasKw(me,terra,'flying'),JSON.stringify(terra.card.kw));
     ok('…a creature without flying or reach cannot block her; a flyer can',!g.canBlock(bear,terra)&&!!g.canBlock(bird,terra),JSON.stringify([g.canBlock(bear,terra),g.canBlock(bird,terra)]));
     g.turn++; g.refreshStatics(); ok('…and it wears off next turn',!(terra.card.kw||[]).includes('flying')); }
   // --- Dread Return flashback: I choose the three creatures ---
   { const [g,me]=base(); const tv=put(g,me,cr('Keep Me','Dragon',4,4)); const a=put(g,me,cr('Fod A','Zombie')), b=put(g,me,cr('Fod B','Zombie')), c=put(g,me,cr('Fod C','Zombie')); const big=cr('Big Target','Giant',7,7); me.graveyard.push(big); const dr=OC('Dread Return'); me.graveyard.push(dr); let sacAsk=null;
     g.hooks.humanSearch=async q=>{ if(q.dest==='sacrifice'){sacAsk={n:q.n,pool:q.pool.map(x=>x.name)}; return q.pool.filter(x=>/^Fod/.test(x.name))} return [q.pool.find(x=>x.name==='Big Target')||q.pool[0]] }; await g.cast(me,dr,'gy'); while(g.stack.length){const o=g.stack.pop(); await g.resolve(o)} await tick(g);
     ok('Dread Return flashback asks which three creatures to sacrifice',!!sacAsk&&sacAsk.n===3&&sacAsk.pool.length===4,JSON.stringify(sacAsk));
     ok('…sacrifices exactly the ones I chose and keeps the fourth',me.battlefield.includes(tv)&&![a,b,c].some(x=>me.battlefield.includes(x)),JSON.stringify(me.battlefield.map(x=>x.card.name)));
     ok('…and the spell still returns the creature',me.battlefield.some(x=>x.card===big),JSON.stringify(g.log.slice(-8).map(x=>x.m))); }
   // --- Sevinne's Reclamation returning Animate Dead ---
   { const [g,me]=base(); const opp=g.players[1]; const ad=OC('Animate Dead'); const mine=cr('My Dead Guy','Knight',3,3); const theirs=cr('Their Dead Titan','Giant',8,8); me.graveyard.push(ad,mine); opp.graveyard.push(theirs); const asks=[];
     g.hooks.humanSearch=async q=>{asks.push(q.dest+':'+q.pool.map(x=>x.name).join(',')); if(q.pool.includes(ad))return [ad]; return [q.pool.find(x=>x.name==='Their Dead Titan')||q.pool[0]]}; await g.runOps(me,[{op:'gyPermToBf',what:'permanent',max:3}],OC("Sevinne's Reclamation"),{}); await tick(g); const aura=me.battlefield.find(b=>b.card===ad), titan=me.battlefield.find(b=>b.card===theirs);
     ok("Sevinne's Reclamation → Animate Dead: I choose a creature card from any graveyard and it returns under my control",!!aura&&!!titan&&aura.attachedTo===titan.id&&asks.some(a=>/^reanimate:.*Their Dead Titan/.test(a)),JSON.stringify(asks));
     ok('…the returned creature gets -1/-0 from Animate Dead',!!titan&&g.powerOf(me,titan)===7,titan?String(g.powerOf(me,titan)):'none'); }
   { const [g,me]=base(); const ad=OC('Animate Dead'); me.graveyard.push(ad); for(const q of g.players)q.graveyard=q.graveyard.filter(c=>!c.isCreature); await g.runOps(me,[{op:'gyPermToBf',what:'permanent',max:3}],OC("Sevinne's Reclamation"),{}); await tick(g);
     ok('Animate Dead put onto the battlefield with no creature card in any graveyard goes to the graveyard',!me.battlefield.some(b=>b.card===ad)&&me.graveyard.includes(ad)); }
   // --- second sentences that were dropped ---
   { const [g,me]=base(); const wa=put(g,me,OC('Waterbender Ascension')); const tr=wa.card.triggers.find(t=>t.when==='combatDamage'); const h0=me.hand.length; for(let i=0;i<3;i++)await g.runOps(me,tr.ops,wa.card,{perm:wa}); const h3=me.hand.length; await g.runOps(me,tr.ops,wa.card,{perm:wa});
     ok('Waterbender Ascension: no card for the first three quest counters, a card from the fourth on',h3===h0&&me.hand.length===h0+1,JSON.stringify([h0,h3,me.hand.length])); }
   { const [g,me]=base(); const ip=put(g,me,OC('Ingenious Prodigy'),{counters:2}); const tr=ip.card.triggers.find(t=>t.when==='upkeep'); const h0=me.hand.length; await g.runOps(me,tr.ops,ip.card,{perm:ip}); ok('Ingenious Prodigy: removing a counter is what draws the card',ip.counters===1&&me.hand.length===h0+1,JSON.stringify([ip.counters,me.hand.length-h0])); ip.counters=0; await g.runOps(me,tr.ops,ip.card,{perm:ip}); ok('…no counters, no card',me.hand.length===h0+1); }
   { const [g,me]=base(); await lands(g,me,3,'Forest'); const host=put(g,me,cr('Host Hydra','Hydra',5,5)); const sn=put(g,me,OC('Springheart Nantuko'),{attachedTo:host.id,bestowed:true}); const tr=sn.card.triggers.find(t=>t.when==='landfall'); await g.runOps(me,tr.ops,sn.card,{perm:sn}); await tick(g);
     ok('Springheart Nantuko attached to a creature: paying {1}{G} makes a token copy of it',me.battlefield.filter(b=>b.card.name==='Host Hydra').length===2&&!me.battlefield.some(b=>b.card.name==='Insect'),JSON.stringify(me.battlefield.map(b=>b.card.name)));
     g.hooks.humanMay=async()=>false; await g.runOps(me,tr.ops,sn.card,{perm:sn}); await tick(g); ok('…declining gives the 1/1 Insect instead',me.battlefield.some(b=>b.card.token&&/Insect/.test(b.card.type||b.card.name)),JSON.stringify(me.battlefield.map(b=>b.card.name))); }
   { const [g,me]=base(); await lands(g,me,3,'Plains'); const h=OC('Hop to It'); me.hand.push(h); const n0=g.log.length; await g.cast(me,h,'hand'); while(g.stack.length){const o=g.stack.pop(); await g.resolve(o)} await tick(g); const rs=me.battlefield.filter(b=>b.card.token);
     ok('Hop to It: three 1/1 white Rabbits (named, typed and coloured — not "Hop to It token"), and the log says so',rs.length===3&&rs.every(b=>b.card.name==='Rabbit'&&/Rabbit/.test(b.card.type)&&b.card.colors.join()==='W'&&b.card.power===1)&&g.log.slice(n0).some(x=>/creates 3 1\/1 Rabbit/.test(x.m)),JSON.stringify(rs.map(b=>[b.card.name,b.card.type,b.card.colors]))+JSON.stringify(g.log.slice(n0).map(x=>x.m))); }
 }
 console.log(fails+' failed');})();
