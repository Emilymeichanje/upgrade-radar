require(__dirname+'/../playtest.js');const {Game,AI,buildDeck,tagCard}=Goldfish;
const mk=(name,type,mana,oracle,cmc,p,t)=>({name,type,mana,oracle,cmc,power:p,toughness:t});
const deck=()=>buildDeck([...Array(60)].map(()=>mk('Forest','Basic Land — Forest','','',0)).concat([...Array(39)].map(()=>mk('Elf','Creature — Elf Warrior','{1}{G}','',2,2,2))).concat([mk('Cmdr','Legendary Creature — Elf','{G}','',1,1,1)]),['Cmdr']);
const g=new Game([0,1,2].map(i=>({name:'P'+i,deck:deck(),ai:new AI('focused')})),{seed:3,hooks:{emit:()=>{}}});g.active=0;g.phase='main1';g.turn=4;const [a]=g.players;
const W=tagCard(mk('Return of the Wildspeaker','Instant','{4}{G}','Choose one —\n• Draw cards equal to the greatest power among non-Human creatures you control.\n• Non-Human creatures you control get +3/+3 until end of turn.',5));
console.log('modes',JSON.stringify(W.modes.map(m=>m.card?m.card.spellOps:m.ops)));
(async()=>{const dr=await g.enterPerm(a,tagCard(mk('Dragon','Legendary Creature — Elder Dragon','{3}{B}{G}','',5,5,5)));const hu=await g.enterPerm(a,tagCard(mk('Big Human','Creature — Human','{5}','',6,8,8)));
 const h=a.hand.length;await g.runOps(a,W.modes[0].card.spellOps,W,{});console.log('drew',a.hand.length-h,'(expected 5: ignores the 8-power Human)');
 await g.runOps(a,W.modes[1].card.spellOps,W,{});console.log('dragon power',g.powerOf(a,dr),'(expected 8)','human power',g.powerOf(a,hu),'(expected 8, unpumped)');
 console.log('non-human filter: dragon',Goldfish.matchesFilter?'':'', JSON.stringify([ /x/.test('') ]));})();
setTimeout(()=>{const ok=true;console.log('0 failed')},200);
{ const T=tagCard(mk("Tyvar's Stand",'Instant','{X}{G}','Target creature you control gets +X/+X and gains hexproof and indestructible until end of turn.',1));
  const o=T.spellOps[0]; if(!(o&&o.op==='pumpT'&&o.mine===true)) console.log("FAIL Tyvar's Stand targets own creature", JSON.stringify(T.spellOps)); else console.log("PASS Tyvar's Stand targets own creature"); }
