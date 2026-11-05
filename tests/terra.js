require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
const C=n=>{const a=R.find(x=>x[1]===n);if(!a)throw new Error('no '+n);return tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const FOLLY=()=>tagCard(mk("The Apprentice's Folly",'Enchantment — Saga','{2}{U}{R}',"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Choose target nontoken creature you control that doesn't have the same name as a token you control. Create a token that's a copy of it, except it isn't legendary, is a Reflection in addition to its other types, and has haste.\nIII — Sacrifice all Reflections you control.",4));
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:deck(),ai:new AI('expert')})),{seed:5,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=6;return g};
const tick=async g=>{await g.emit({type:'tick'});await g.flushPending?.();await g.emit({type:'tick'})};let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
(async()=>{
 // pieces in isolation
 { const g=fresh();const [a]=g.players;const terra=await g.enterPerm(a,C('Terra, Magical Adept // Esper Terra'));terra.summoning=false;await tick(g);
   a.pool='RGCCCC'.split('').map(c=>({c}));const tr=terra.card.abilities.find(x=>x.ops.some(o=>o.op==='exileReturnTransformed'));
   await g.activate(a,{card:terra.card,ab:tr,perm:terra});while(g.stack.length)await g.resolve();await tick(g);
   const es=a.battlefield.find(b=>b.card.name==='Esper Terra');ok('Trance: Terra returns as Esper Terra with a lore counter',es&&es.lore===1,g.log.slice(-4).map(l=>l.m).join(' | '));
   ok('no nonlegendary enchantment: chapter I does nothing',/no nonlegendary enchantment/.test(g.log.map(l=>l.m).join(' ')));
   // chapter IV: ten mana and back to the front face
   const p0=(a.pool||[]).length;es.lore=3;await g.loreUp(a,es);await tick(g);
   ok('chapter IV adds WWUUBBRRGG',(a.pool||[]).length-p0===10&&['W','U','B','R','G'].every(c=>(a.pool||[]).filter(m=>m.c===c).length>=2),JSON.stringify((a.pool||[]).map(m=>m.c)));
   ok('…and Terra returns front face up (and mills on entering)',a.battlefield.some(b=>b.card.name.startsWith('Terra, Magical Adept')&&!b.card.saga)&&/mills five|mill/.test(g.log.slice(-6).map(l=>l.m).join(' ')),g.log.slice(-4).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const bear=await g.enterPerm(a,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));const fo=await g.enterPerm(a,FOLLY());await tick(g);
   ok('Folly I copies a nontoken creature as a hasty nonlegendary Reflection',a.battlefield.some(b=>b.card.token&&b.card.name==='Bear'&&/Reflection/.test(b.card.type)&&!b.summoning));
   await g.loreUp(a,fo);await tick(g);ok('Folly II: no legal target while a Bear token exists',a.battlefield.filter(b=>b.card.token&&b.card.name==='Bear').length===1);
   await g.loreUp(a,fo);await tick(g);ok('Folly III sacrifices the Reflections, then Folly goes',!a.battlefield.some(b=>b.card.token)&&!a.battlefield.includes(fo)); }
 // the combo, from Terra + Folly on the battlefield, with real mana and real Trance
 { const g=fresh();const [a,b,c,d]=g.players;const terra=await g.enterPerm(a,C('Terra, Magical Adept // Esper Terra'));terra.summoning=false;const fo=await g.enterPerm(a,FOLLY());await tick(g);
   for(const t of a.battlefield.filter(x=>x.card.token))await g.sacrifice(a,t);await tick(g); // the Folly's own chapter I copied Terra when it entered — clear it like a real board where Folly is mid-saga
   const blk=await g.enterPerm(b,tagCard(mk('Wall','Creature — Wall','{1}{U}','Defender, reach',2,0,4)));
   a.pool='RGCCCC'.split('').map(c=>({c}));const tr=terra.card.abilities.find(x=>x.ops.some(o=>o.op==='exileReturnTransformed'));
   await g.activate(a,{card:terra.card,ab:tr,perm:terra});while(g.stack.length)await g.resolve();await tick(g);
   const lg=g.log.map(l=>l.m).join(' | ');
   ok('loop recognised and declared',/∞ Esper Terra loop/.test(lg),lg.slice(-900));
   ok('infinite five-colour mana: {5}{W}{U}{B}{R}{G} payable twice',(()=>{const cost={generic:5,pips:{W:1,U:1,B:1,R:1,G:1},total:10};if(!g.canPayCost(a,cost))return false;g.payCost(a,cost);return g.canPayCost(a,cost)})());
   const toks=a.battlefield.filter(x=>x.card.token&&x.card.name==='Esper Terra'&&x.sacAtEnd);
   ok('lethal number of hasty flying Esper Terra tokens kept',toks.length>=10&&toks.every(x=>!x.summoning&&x.card.kw.includes('flying')&&x.sacAtEnd),'tokens='+toks.length);
   ok('they survived Folly III (III resolved before I)',toks.length>0);
   const L=g.opponentsOf(a).map(q=>q.life);await g.combatPhase(a,a.battlefield.filter(x=>g.canAttackWith(a,x)).map((x,i)=>({attacker:x,defender:g.opponentsOf(a)[i%3]})));await tick(g);
   ok('combat with them finishes the table',g.players.slice(1).every(q=>q.dead)||!!g.winner,JSON.stringify(g.players.map(q=>[q.life,q.dead])));
 }
 // the AI does it on its own turn
 { const g=fresh();const [a]=g.players;const terra=await g.enterPerm(a,C('Terra, Magical Adept // Esper Terra'));terra.summoning=false;await g.enterPerm(a,FOLLY());await tick(g);for(const t of a.battlefield.filter(x=>x.card.token))await g.sacrifice(a,t);
   for(let i=0;i<7;i++){const l=await g.enterPerm(a,tagCard(mk(i%2?'Mountain':'Forest','Basic Land — '+(i%2?'Mountain':'Forest'),'','',0)));l.summoning=false;}await tick(g);
   await a.ai.mainPhase(g,a,false);await tick(g);ok('the AI activates Trance and goes infinite',/∞ Esper Terra loop/.test(g.log.map(l=>l.m).join(' ')),g.log.slice(-5).map(l=>l.m).join(' | ')); }
 { const g=fresh();const [a]=g.players;const terra=await g.enterPerm(a,C('Terra, Magical Adept // Esper Terra'));terra.summoning=false;await g.enterPerm(a,FOLLY());await tick(g);for(const t of a.battlefield.filter(x=>x.card.token))await g.sacrifice(a,t);await tick(g);
   ok('combo bar entry: not ready without {4}{R}{G}',(g.availableCombos(a).find(c=>c.id==='esper')||{}).ready===false,JSON.stringify(g.availableCombos(a)));
   a.pool='RGCCCC'.split('').map(c=>({c}));const c=g.availableCombos(a).find(c=>c.id==='esper');ok('ready with the mana, and the Spellbook duplicate is hidden',c&&c.ready&&g.availableCombos(a).filter(x=>/Terra/.test(x.pieces.join())).length===1);
   await g.declareCombo(a,'esper');ok('declaring it runs Trance and the loop',/∞ Esper Terra loop/.test(g.log.map(l=>l.m).join(' ')),g.log.slice(-6).map(l=>l.m).join(' | ')); }
 console.log(fails+' failed');})();
