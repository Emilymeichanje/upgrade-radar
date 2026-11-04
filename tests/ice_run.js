require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
const C=n=>{const a=R.find(x=>x[1]===n);return tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:deck(),ai:new AI('focused')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;const [a,b,c,d]=g.players;a.human=true;a.ai=null;
(async()=>{const bears=[];for(const q of [b,c,d]){const x=await g.enterPerm(q,tagCard(mk('Bear','Creature — Bear','{1}{G}','',2,2,2)));bears.push(x);}let picks=0;
 g.hooks.humanChooseFetch=null;const origPick=g.pickPerm.bind(g);g.pickPerm=async(p,src,pool,o)=>{picks++;console.log('pool offered:',pool.length,'perms across',new Set(pool.map(x=>g.ownerOf(x).name)).size,'players');return pool[0]};
 const ice=await g.enterPerm(a,C("Aang's Iceberg"));await g.runOps(a,ice.card.etbOps,ice.card,{perm:ice});await g.emit({type:'tick'});
 const exiled=[b,c,d].filter(q=>q.exile.length).length;console.log('opponents who lost a permanent:',exiled,'(expected 1) · prompts:',picks,'(expected 1)');
 await g.destroy(a,ice);await g.emit({type:'tick'});console.log('returned when Iceberg left:',[b,c,d].every(q=>q.exile.length===0&&q.battlefield.some(x=>x.card.name==='Bear')));
 // Katara: cancelling X aborts and untaps nothing / costs nothing
 const kat=await g.enterPerm(a,C("Katara, Water Tribe's Hope"));kat.summoning=false;g.hooks.humanNumber=async c=>{console.log('X prompt cancellable:',!!c.cancel);return null};
 const ab=kat.card.abilities[0];const opts=g.abilityOptions(a,{});const o=opts.find(x=>x.card===kat.card)||{kind:'ability',card:kat.card,perm:kat,ab,ai:0};const r=await g.activate(a,o);const fails=(exiled!==1?1:0)+(r!==false?1:0)+(kat.tapped?1:0);console.log(fails+' failed');})();
setTimeout(()=>{},0);
