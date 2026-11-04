require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
const C=n=>{const a=R.find(x=>x[1]===n);if(!a)throw new Error('no '+n);return tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2].map(i=>({name:'P'+i,deck:deck(),ai:new AI('focused')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;return g};
const tick=g=>g.emit({type:'tick'});
(async()=>{
 { const g=fresh();const [a,b]=g.players;const m=await g.enterPerm(a,C('Ministrant of Obligation'));const x=await g.enterPerm(b,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));await g.destroy(b,x);await tick(g);
   console.log('Ministrant: opp creature died → spirits:',a.battlefield.filter(p=>p.card.name==='Spirit').length,'(expected 0)');await g.destroy(a,m);await tick(g);console.log('Ministrant itself died → spirits:',a.battlefield.filter(p=>p.card.name==='Spirit').length,'(expected 2)'); }
 { const g=fresh();const [a]=g.players;const sh=await g.enterPerm(a,C('Soulherder'));const dk=await g.enterPerm(a,tagCard(mk('Drake','Creature — Drake','{4}{U}','Flying',5,2,3)));g.phase='combat';await g.exilePerm(a,dk);await tick(g);console.log('Soulherder counter on exile:',sh.counters,'(expected 1)'); }
})();
