require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2].map(i=>({name:'P'+i,deck:deck(),ai:new AI('focused')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;return g};
const tick=g=>g.emit({type:'tick'});const L=(g,a,n)=>{for(let i=0;i<n;i++)a.battlefield.push({id:1000+i+Math.random(),card:tagCard(mk('Forest','Basic Land — Forest','','',0)),tapped:false,counters:0})};
const REAPER=tagCard(mk('Midnight Reaper','Creature — Zombie Knight','{2}{B}','Whenever a nontoken creature you control dies, Midnight Reaper deals 1 damage to you and you draw a card.',3,3,2));
const BW=()=>tagCard(mk('Beast Within','Instant','{2}{G}','Destroy target permanent. Its controller creates a 3/3 green Beast creature token.',3));
const PI=()=>tagCard(mk('Pest Infestation','Sorcery','{X}{G}',"Choose up to X target artifacts and/or enchantments. Destroy them. Create twice X 1/1 black and green Pest creature tokens with \"When this creature dies, you gain 1 life.\"",1));
const ET=tagCard(mk('Enduring Tenacity','Enchantment Creature — Snake Glimmer','{2}{B}{B}','Whenever you gain life, target opponent loses that much life.\nWhen this creature dies, if it was a creature, return it to the battlefield under its owner\'s control. It\'s an enchantment. (It\'s not a creature.)',4,4,3));
console.log('Reaper parse',JSON.stringify(REAPER.triggers));console.log('BW parse',JSON.stringify(BW().spellOps),BW().roles);console.log('PI parse',JSON.stringify(PI().spellOps),PI().roles,PI().tokenCount);
(async()=>{
 { const g=fresh();const [a]=g.players;const r=await g.enterPerm(a,{...REAPER,uid:1});const h=a.hand.length,l=a.life;await g.destroy(a,r);await tick(g);console.log('Reaper dies itself → draw',a.hand.length-h,'life',a.life-l,'(expected 1, -1)');
   const r2=await g.enterPerm(a,{...REAPER,uid:2});const x=await g.enterPerm(a,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));const h2=a.hand.length,l2=a.life;await g.destroy(a,x);await tick(g);console.log('other nontoken dies → draw',a.hand.length-h2,'life',a.life-l2,'(expected 1, -1)'); }
 { const g=fresh();const [a,b]=g.players;const x=await g.enterPerm(b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));x.owner=b.i;const bw=BW();a.hand=[bw];L(g,a,3);await g.cast(a,bw,'hand',x);await tick(g);console.log('Beast Within: target gone',!b.battlefield.includes(x),'beast for controller:',b.battlefield.filter(p=>p.card.name==='Beast').length,'(expected true,1)'); }
 { const g=fresh();const [a,b]=g.players;const et=await g.enterPerm(a,{...ET,uid:5});const pi=PI();a.hand=[pi];L(g,a,5);const l=b.life;const lo=a.life;await g.cast(a,pi,'hand');await tick(g);
   console.log('Pest Infestation X: pests',a.battlefield.filter(p=>p.card.name==='Pest').length,'my life change',a.life-lo,'(expected 0 gain at cast)','opp life change',b.life-l,'(expected 0)');
   const pest=a.battlefield.find(p=>p.card.name==='Pest');if(pest){const l2=a.life,o2=b.life;await g.destroy(a,pest);await tick(g);console.log('pest dies → gain',a.life-l2,'opp loses',b.life-o2,'(expected +1, -1)');} }
})();

setTimeout(()=>{},0);
