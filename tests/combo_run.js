require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
const C=n=>{const a=R.find(x=>x[1]===n);return tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7]})};
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const g=new Game([0,1,2,3].map(i=>({name:'P'+i,deck:deck(),ai:new AI('focused')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=9;const [a,b,c,d]=g.players;a.human=true;a.ai=null;
(async()=>{const mal=await g.enterPerm(a,C('Malcolm, Keen-Eyed Navigator'));mal.summoning=false;const buc=await g.enterPerm(a,C('Glint-Horn Buccaneer'));buc.summoning=false;
 for(let i=0;i<2;i++)a.battlefield.push({id:100+i,card:tagCard(mk('Mountain','Basic Land — Mountain','','',0)),tapped:false,counters:0});a.hand=[...Array(6)].map((_,i)=>tagCard(mk('Filler'+i,'Sorcery','{5}','Draw a card.',5)));
 const ab=buc.card.abilities[0];
 console.log('usable in main phase (should be false):',g.canUseAbility(a,buc.card,ab,buc,{instant:true}));
 g.phase='combat';g.curAttackers=[buc,mal];for(const x of [buc,mal]){x.tapped=true;x.attackTurn=g.turn;}
 console.log('usable while attacking:',g.canUseAbility(a,buc.card,ab,buc,{instant:true}));
 g.hooks.humanDiscard=async p=>p.hand[0];g.hooks.humanMay=async()=>true;
 const l0=[b,c,d].map(q=>q.life);let loops=0;
 while(loops<12){const opts=g.abilityOptions(a,{instant:true});const o=opts.find(x=>x.card===buc.card);if(!o)break;await g.activate(a,o);await g.emit({type:'tick'});loops++;}
 const tr=a.battlefield.filter(x=>x.card.name==='Treasure').length;
 console.log('loops',loops,'| opponents life',l0.join(','),'→',[b,c,d].map(q=>q.life).join(','),'| treasures left',tr,'| hand',a.hand.length);
 const fails=(loops===12&&[b,c,d].every(q=>q.life===28)&&tr>=12?0:1)+(g.canUseAbility(a,buc.card,ab,buc,{instant:true})?0:1);console.log(fails+' failed');})();
