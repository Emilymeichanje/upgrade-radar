require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
const C=n=>{const a=R.find(x=>x[1]===n);return tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2].map(i=>({name:'P'+i,deck:deck(),ai:new AI('focused')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;return g};
const tick=g=>g.emit({type:'tick'});let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
const story=p=>{const s=p.battlefield.find(b=>b.card.name==='Staff of the Storyteller');return s?((s.ck&&s.ck.story)||0):-1};
(async()=>{
 { const g=fresh();const [a]=g.players;const st=C('Staff of the Storyteller');a.hand.push(st);a.pool=[{c:'W'},{c:'W'}];await g.cast(a,st,'hand');await g.settleTriggers?.(a);await tick(g);while(g.stack.length)await g.resolve();await tick(g);await g.flushPending?.();await tick(g);
   ok('Staff ETB: its own Spirit gives 1 story counter',story(a)===1,'story='+story(a)+' log='+g.log.slice(-4).map(l=>l.m).join(' | ')); 
   const q=await g.enterPerm(a,C('Quintorius, History Chaser'));a.graveyard.push(tagCard(mk('Dead','Sorcery','{B}','',1)));await tick(g);const vac=await g.enterPerm(a,C('Ghost Vacuum'));
   await g.runOps(a,vac.card.abilities[0].ops,vac.card,{perm:vac});await tick(g);await g.flushPending?.();await tick(g);
   const sp=a.battlefield.filter(b=>b.card.name==='Spirit').length;console.log('  spirits on bf',sp,'| log:',g.log.slice(-4).map(l=>l.m).join(' | '));
   ok('Quintorius token → second story counter',story(a)===2,'story='+story(a)); }
 { const g=fresh();const [a]=g.players;const st=C('Staff of the Storyteller');a.hand.push(st);a.pool=[{c:'W'},{c:'W'}];await g.cast(a,st,'hand');while(g.stack.length)await g.resolve();await tick(g);await g.flushPending?.();await tick(g);await g.runOps(a,[{op:'tokens',n:2,pt:[1,1],kw:[],types:'Soldier',tcolors:['W']}],C('Staff of the Storyteller'),{});await tick(g);
   ok('two tokens at once → one more counter (not two)',story(a)===2,'story='+story(a)); }

 { const g=fresh();const [a]=g.players;const st=C('Staff of the Storyteller');a.hand.push(st);a.pool=[{c:'W'},{c:'W'}];await g.cast(a,st,'hand');while(g.stack.length)await g.resolve();await tick(g);await g.flushPending?.();await tick(g);
   await g.enterPerm(a,C('Hofri Ghostforge'));const bear=await g.enterPerm(a,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));await g.destroy(a,bear);await tick(g);await g.flushPending?.();await tick(g);
   console.log('  bf:',a.battlefield.map(b=>b.card.name+(b.card.token?'(t)':'')).join(','),'| log:',g.log.slice(-4).map(l=>l.m).join(' | '));
   ok('Hofri copy token → story counter',story(a)===2,'story='+story(a)); }
 console.log(fails+' failed');})();
