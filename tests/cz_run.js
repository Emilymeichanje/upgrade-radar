require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
const fresh=()=>{const g=new Game([0,1,2].map(i=>({name:'P'+i,deck:deck(),ai:new AI('focused')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;return g};
(async()=>{
 // human: bounce → asked; No → hand
 { const g=fresh();const [a,b]=g.players;a.human=true;a.ai=null;const cm=a.command.shift();const pm=await g.enterPerm(a,cm);let q=null;g.hooks.humanMay=async c=>{q=c.question;return false};
   await g.bounce(a,pm,b);ok('human asked about command zone',/command zone/.test(q||''),q);ok('No → commander in hand',a.hand.includes(cm)&&!a.command.includes(cm)); }
 // human: Yes → command zone
 { const g=fresh();const [a,b]=g.players;a.human=true;a.ai=null;const cm=a.command.shift();const pm=await g.enterPerm(a,cm);g.hooks.humanMay=async()=>true;await g.bounce(a,pm,b);ok('Yes → command zone',a.command.includes(cm)&&!a.hand.includes(cm)); }
 // human: destroyed → No → graveyard
 { const g=fresh();const [a]=g.players;a.human=true;a.ai=null;const cm=a.command.shift();const pm=await g.enterPerm(a,cm);g.hooks.humanMay=async()=>false;await g.destroy(a,pm);ok('destroyed, No → graveyard',a.graveyard.includes(cm)&&!a.command.includes(cm)); }
 // human: exiled → Yes → command zone
 { const g=fresh();const [a]=g.players;a.human=true;a.ai=null;const cm=a.command.shift();const pm=await g.enterPerm(a,cm);g.hooks.humanMay=async()=>true;await g.exilePerm(a,pm);ok('exiled, Yes → command zone',a.command.includes(cm)&&!a.exile.includes(cm)); }
 // AI: bounce with tax → keeps in hand; no tax → command zone; destroy → command zone
 { const g=fresh();const [a,b]=g.players;const cm=a.command.shift();let pm=await g.enterPerm(a,cm);a.cmdTax=2;a.cmdTaxBy[cm.name]=2;await g.bounce(a,pm,b);ok('AI with tax keeps bounced commander in hand',a.hand.includes(cm));
   a.hand.splice(a.hand.indexOf(cm),1);pm=await g.enterPerm(a,cm);a.cmdTax=0;a.cmdTaxBy[cm.name]=0;await g.bounce(a,pm,b);ok('AI without tax → command zone',a.command.includes(cm));
   a.command.splice(a.command.indexOf(cm),1);pm=await g.enterPerm(a,cm);await g.destroy(a,pm);ok('AI destroyed → command zone',a.command.includes(cm)); }
 // block prompt skipped when nothing can block
 { const g=fresh();const [a,b]=g.players;b.human=true;b.ai=null;let asked=0;g.hooks.humanBlocks=async()=>{asked++;return new Map()};g.hooks.humanRespond=async()=>null;
   const fl=await g.enterPerm(a,tagCard(mk('Bird','Creature — Bird','{1}{U}','Flying',2,2,2)));fl.summoning=false;const grd=await g.enterPerm(b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));
   await g.combatPhase(a,[{attacker:fl,defender:b}]);ok('no prompt when only a flier attacks and I have no reach/flying',asked===0&&b.life===38,asked+' '+b.life);
   const bear2=await g.enterPerm(a,bear=tagCard(mk('Ogre','Creature — Ogre','{2}{R}','',3,3,3)));bear2.summoning=false;fl.tapped=false;await g.combatPhase(a,[{attacker:fl,defender:b},{attacker:bear2,defender:b}]);ok('prompt when a ground attacker can be blocked',asked===1,String(asked)); }
 console.log(fails?fails+' FAILED':'ALL PASS');})();
