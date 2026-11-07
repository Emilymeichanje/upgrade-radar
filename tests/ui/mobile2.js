const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage({viewport:{width:390,height:800},hasTouch:true,isMobile:true});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route(/api\.scryfall\.com/,r=>r.fulfill({status:404,json:{}}));const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
await pg.goto('file://'+__dirname+'/rec.html');await pg.evaluate(()=>{Math.random=Goldfish.mulberry(5);boot()});
await pg.waitForFunction(()=>GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull');await pg.click('[data-act=keep]');
await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy&&!GoldfishUI.current.prompt,null,{timeout:60000});
await pg.evaluate(()=>{GoldfishUI.current.mobile=true;GoldfishUI.current.render()});ok('phone layout active',await pg.evaluate(()=>GoldfishUI.current.mobile));
// a defeated opponent disappears from the carousel, its pager chip shows ✕ and toggles it back
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game;const d=g.players.find(q=>q!==U.me);d.dead=true;d.battlefield=[];window.__d=d.i;U.render();});
ok('defeated opponent board hidden on phones',await pg.evaluate(()=>!document.querySelector(`.gt-opps .gs[data-seat="${window.__d}"]`)&&document.querySelectorAll('.gt-opps .gs').length===2));
ok('its pager chip is struck through with ✕',await pg.evaluate(()=>{const c=document.querySelector(`.opp-pager .op[data-seat="${window.__d}"]`);return !!c&&c.classList.contains('dead')&&/✕/.test(c.textContent)}));
await pg.click(`.opp-pager .op[data-seat="${await pg.evaluate(()=>window.__d)}"]`);
ok('tapping the chip peeks the defeated board',await pg.evaluate(()=>!!document.querySelector(`.gt-opps .gs[data-seat="${window.__d}"]`)));
await pg.click(`.opp-pager .op[data-seat="${await pg.evaluate(()=>window.__d)}"]`);
ok('…and again hides it',await pg.evaluate(()=>!document.querySelector(`.gt-opps .gs[data-seat="${window.__d}"]`)));
// counterspell targeting: the targetable spell is offered as a chip in the control row
await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const {tagCard}=Goldfish;const opp=g.players.find(q=>q!==me&&!q.dead);
  const ss=tagCard({name:'Scapeshift',mana:'{2}{G}{G}',type:'Sorcery',cmc:4,oracle:'Sacrifice any number of lands. Search your library for that many land cards, put them onto the battlefield tapped, then shuffle.'});
  g.stack.push({id:777,kind:'spell',card:ss,caster:opp,zone:'hand'});
  const c=tagCard({name:"An Offer You Can't Refuse",mana:'{U}',type:'Instant',cmc:1,oracle:'Counter target noncreature spell. Its controller creates two Treasure tokens.'});me.hand.push(c);me.pool=[{c:'U'}];
  U.mode={kind:'target',card:c,zone:'hand',respond:true,players:false,spells:U.targetsSpells(c)};window.__c=c.uid;const ft=U.finishTarget.bind(U);U.finishTarget=t=>{window.__t=t;U.mode=null;U.render()};U.render();});
ok('a "Scapeshift · <caster>" chip appears next to the Cancel button',await pg.evaluate(()=>{const ch=document.querySelector('.gt-ctl .tgtchip[data-sid="777"]');return !!ch&&/Scapeshift/.test(ch.textContent)}));
await pg.click('.gt-ctl .tgtchip[data-sid="777"]');
await pg.waitForFunction(()=>{const U=GoldfishUI.current;if(U.prompt&&U.prompt.kind==='priority'){U.prompt.res(null);return false}return !U.mode},null,{timeout:15000}).catch(()=>{});
ok('tapping the chip targets Scapeshift',await pg.evaluate(()=>!GoldfishUI.current.mode&&window.__t&&window.__t.spell&&window.__t.spell.id===777));
console.log('errors',errs);await b.close()})();
