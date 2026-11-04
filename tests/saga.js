require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Plains','Basic Land — Plains','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2].map(i=>({name:'P'+i,deck:deck(),ai:new AI('expert')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;return g};
const tick=async g=>{await g.emit({type:'tick'});await g.flushPending?.();await g.emit({type:'tick'})};let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
const SAGA=()=>tagCard({name:'The Restoration of Eiganjo // Architect of Restoration',type:'Enchantment — Saga // Enchantment Creature — Fox Monk',mana:'{1}{W}',cmc:2,power:3,toughness:4,oracle:'(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Search your library for a basic Plains card, reveal it, put it into your hand, then shuffle.\nII — You may discard a card. When you do, return target permanent card with mana value 2 or less from your graveyard to the battlefield tapped.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.\n//\nVigilance\nWhenever Architect of Restoration attacks or blocks, create a 1/1 colorless Spirit creature token.'});
(async()=>{
 const g=fresh();const [a]=g.players;const s=SAGA();a.hand.push(s);a.pool=[{c:'W'},{c:'W'}];const h0=a.hand.length-1;
 await g.cast(a,s,'hand');while(g.stack.length)await g.resolve();await tick(g);
 const pm=a.battlefield.find(b=>b.card.name.startsWith('The Restoration'));
 ok('chapter I on entering: lore 1',pm&&pm.lore===1,'lore='+(pm&&pm.lore)+' log='+g.log.slice(-3).map(l=>l.m).join(' | '));
 ok('chapter I fetched a Plains to hand',a.hand.length===h0+1&&a.hand.some(c=>c.name==='Plains'),'hand='+a.hand.map(c=>c.name).join(','));
 // chapter II: discard, return MV<=2 permanent from gy
 a.graveyard.push(tagCard(mk('Signet','Artifact','{2}','',2)));a.hand.push(tagCard(mk('Junk','Sorcery','{R}','',1)));
 await g.loreUp(a,pm);await tick(g);
 ok('chapter II returned the MV≤2 permanent (after discarding)',a.battlefield.some(b=>b.card.name==='Signet'),'log='+g.log.slice(-4).map(l=>l.m).join(' | '));
 await g.loreUp(a,pm);await tick(g);
 const arch=a.battlefield.find(b=>b.card.name==='Architect of Restoration');
 ok('chapter III: returns transformed as Architect of Restoration 3/4',!!arch&&arch.card.isCreature&&g.powerOf(a,arch)===3,'bf='+a.battlefield.map(b=>b.card.name).join(',')+' log='+g.log.slice(-3).map(l=>l.m).join(' | '));

 { const c=tagCard({name:'Architect of Restoration',type:'Enchantment Creature — Fox Monk',mana:'',cmc:0,power:3,toughness:4,oracle:'Vigilance\nWhenever Architect of Restoration attacks or blocks, create a 1/1 colorless Spirit creature token.'});
   ok('Architect: attack + block triggers parsed',c.triggers.some(t=>t.when==='attack')&&c.triggers.some(t=>t.when==='blocks'),JSON.stringify(c.triggers.map(t=>t.when))); }
 console.log(fails+' failed');})();
