require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
const C=n=>{const a=R.find(x=>x[1]===n);return tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const fresh=()=>{const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:deck(),ai:new AI('expert')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=6;return g};
let fails=0;const ok=(n,c,x='')=>{if(!c){fails++;console.log('FAIL',n,x)}else console.log('PASS',n)};
(async()=>{
 { const g=fresh();const [a]=g.players;const cf=await g.enterPerm(a,C('Carrion Feeder'));cf.summoning=false;await a.ai.useAbilities(g,a,false);await g.emit({type:'tick'});
   ok('Carrion Feeder never sacrificed to itself',a.battlefield.includes(cf)); }
 { const g=fresh();const [a]=g.players;const cf=await g.enterPerm(a,C('Carrion Feeder'));cf.summoning=false;const tok=await g.enterPerm(a,tagCard({...mk('Shapeshifter','Token Creature — Shapeshifter','','',0,3,2),token:true}));tok.card.token=true;
   await a.ai.useAbilities(g,a,false);await g.emit({type:'tick'});ok('with a token available, the outlet survives',a.battlefield.includes(cf)); }
 { const g=fresh();const [a]=g.players;const bmc=await g.enterPerm(a,C('Black Market Connections'));a.life=4;const t0=a.battlefield.filter(b=>b.card.name==='Treasure').length;const h0=a.hand.length;await g.fireTriggers(a,'main1');await g.emit({type:'tick'});
   ok('at 4 life BMC takes only one cheap mode and survives',a.life>=1&&!a.dead,'life '+a.life); }
 { const g=fresh();const [a]=g.players;const bmc=await g.enterPerm(a,C('Black Market Connections'));a.life=40;await g.fireTriggers(a,'main1');await g.emit({type:'tick'});ok('at 40 life BMC takes several modes',a.life<=37,'life '+a.life); }
 console.log(fails+' failed');})();
