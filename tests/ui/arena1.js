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
ok('arena fx default on',await pg.evaluate(()=>GoldfishUI.current.s.fx==='arena'));
console.log('errors',errs);await b.close()})();
