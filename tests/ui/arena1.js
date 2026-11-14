const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1300,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
await pg.goto('file://'+__dirname+'/rec.html');await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
// v105: live state in the card reader
const r=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;
  const put=(pl,c)=>{const b={id:Math.random(),card:c,tapped:false,counters:0,enteredTurn:0};pl.battlefield.push(b);return b};
  const bear=put(me,tagCard({name:'Grizzly Bears',type:'Creature — Bear',mana:'{1}{G}',oracle:'',cmc:2,power:'2',toughness:'2'}));bear.counters=2;bear.tapped=true;
  put(me,tagCard({name:'Glorious Anthem',type:'Enchantment',mana:'{1}{W}{W}',oracle:'Creatures you control get +1/+1.',cmc:3}));
  const boots=put(me,tagCard({name:'Swiftfoot Boots',type:'Artifact — Equipment',mana:'{2}',oracle:'Equipped creature has hexproof and haste.\nEquip {1}',cmc:2}));boots.attachedTo=bear.id;
  g.refreshStatics();U.render();U.preview(bear.card.uid);const now=U.pv.querySelector('.now');return {html:now?now.textContent:'',pt:g.powerOf(me,bear)+'/'+g.toughOf(me,bear),fan:!!document.querySelector('.gt-hand.fan'),rot:(document.querySelector('.gt-hand .hcd')||{}).style?.getPropertyValue('--rot')};});
ok('reader shows live P/T with printed base',/5\/5/.test(r.html)&&/printed 2\/2/.test(r.html),r.html);
ok('reader lists counters, granted keywords, equipment and tapped',/\+2 \+1\/\+1 counters/.test(r.html)&&/hexproof/.test(r.html)&&/haste/.test(r.html)&&/Swiftfoot Boots/.test(r.html)&&/tapped/.test(r.html),r.html);
ok('desktop hand is fanned',r.fan&&/deg/.test(r.rot||''),JSON.stringify([r.fan,r.rot]));
// v111: the fanned hand must not clip its outer cards (leftmost was cut off; bottoms too)
for(const n of [7,20]){const c=await pg.evaluate(n=>{const U=GoldfishUI.current,me=U.me;const {tagCard}=Goldfish;me.hand=[...Array(n)].map((_,i)=>tagCard({name:'C'+i,type:'Creature — Elf',mana:'{G}',oracle:'',cmc:1,power:'1',toughness:'1'}));U.render();
  const h=document.querySelector('.gt-hand');h.scrollLeft=0;const hr=h.getBoundingClientRect();const cs=[...h.querySelectorAll('.hcd')];const L=cs[0].getBoundingClientRect();h.scrollLeft=h.scrollWidth;const R=cs[cs.length-1].getBoundingClientRect();
  const bot=hr.bottom-(h.offsetHeight-h.clientHeight);return {left:Math.round(L.left-hr.left),right:Math.round(hr.right-R.right),bottom:Math.round(bot-Math.max(...cs.map(x=>x.getBoundingClientRect().bottom)))}},n);
  ok(`fanned hand of ${n}: outer cards fully inside the strip`,c.left>=0&&c.right>=0&&c.bottom>=0,JSON.stringify(c));}
// v115: prepared badge on the tile + in the reader; the recording export carries the text log
{ const r=await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const c=tagCard({name:'Dirgur Focusmage // Braingeyser',type:'Creature — Djinn Monk // Sorcery',mana:'{2}{U} // {X}{U}{U}',oracle:'Instant and sorcery spells you cast cost {1} less to cast.\nWhenever you cast an instant or sorcery spell with mana value 5 or greater from your hand, this creature becomes prepared.\n//\nTarget player draws X cards.',cmc:3,power:'2',toughness:'4'});
  const b={id:8800,card:c,tapped:false,counters:0,enteredTurn:0,summoning:false};me.battlefield.push(b);g.refreshStatics();U.render();const before=!!document.querySelector('.gc[data-pid="8800"] .ctr.prep');b.prepared=true;U.render();const badge=document.querySelector('.gc[data-pid="8800"] .ctr.prep');U.preview(c.uid);const now=U.pv.querySelector('.now');
  const rec=U.recordingJson();const j=rec?JSON.parse(rec):null;return {spell:c.prepareSpell&&c.prepareSpell.name,before,badge:badge&&badge.textContent,now:now&&now.textContent,hasText:!!(j&&typeof j.text==='string'&&/playtest log · engine/.test(j.text)&&/== turn/.test(j.text)),hasMoves:!!(j&&j.moves&&j.seed!=null)}});
  ok('prepared creature shows a badge only while prepared',!r.before&&/prepared/.test(r.badge||''),JSON.stringify(r));
  ok('reader says it is prepared and names the spell',/prepared/.test(r.now||'')&&/Braingeyser/.test(r.now||''),r.now);
  ok('recording export contains the full text log plus the replay data',r.hasText&&r.hasMoves,JSON.stringify([r.hasText,r.hasMoves])); }
// v122: Room door indicator on the tile and in the reader
{ const r=await pg.evaluate(async()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const c=tagCard({name:'Charred Foyer // Warped Space',type:'Enchantment — Room // Enchantment — Room',mana:'{3}{R} // {4}{R}{R}',oracle:'At the beginning of your upkeep, exile the top card of your library. You may play it this turn.\n//\nOnce each turn, you may pay {0} rather than pay the mana cost for a spell you cast from exile.',cmc:4});
  g._roomCast=true;const pm=await g.enterPerm(me,c);g._roomCast=false;g.refreshStatics();U.render();const el=document.querySelector('.gc[data-pid="'+pm.id+'"] .ctr.doors');const one=el?[...el.querySelectorAll('i')].map(i=>i.className+':'+i.textContent.trim()):null;U.preview(pm.card.uid);const now=(U.pv.querySelector('.now')||{}).textContent||'';
  pm.doors.R=true;pm.card=g.roomView(pm.card.orig,pm.doors);U.render();const el2=document.querySelector('.gc[data-pid="'+pm.id+'"] .ctr.doors');const two=el2?[...el2.querySelectorAll('i')].map(i=>i.className):null;return {one,now,two}});
  ok('Room tile shows which door is open and which is locked',!!r.one&&/^open:.*Foyer/.test(r.one[0])&&/^shut:.*Space/.test(r.one[1]),JSON.stringify(r.one));
  ok('reader explains the doors and the unlock cost',/Charred Foyer: door UNLOCKED/.test(r.now)&&/Warped Space: door locked/.test(r.now),r.now);
  ok('after unlocking, both doors show open',!!r.two&&r.two.every(c=>c==='open'),JSON.stringify(r.two)); }
ok('arena fx default on',await pg.evaluate(()=>GoldfishUI.current.s.fx==='arena'));
console.log('errors',errs);await b.close()})();
