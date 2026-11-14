const {chromium}=require('playwright');
const CI={'Radagast of Rhosgobel':['G'],'Omnath, Locus of the Roil':['G','U','R'],'Silverquill, the Disputant':['W','B'],'Isshin, Two Heavens as One':['R','W','B'],'Teysa Karlov':['W','B']};
const card=(name,extra={})=>({object:'card',name,mana_cost:'{1}',type_line:/Forest/.test(name)?'Basic Land — Forest':CI[name]?'Legendary Creature — Human':'Artifact',oracle_text:name==='Time Warp'?'Target player takes an extra turn after this one.':'',set:'abc',set_name:'Test',collector_number:'1',released_at:'2020-01-01',color_identity:CI[name]||[],image_uris:{small:'https://img.test/'+encodeURIComponent(name)+'.jpg',normal:'https://img.test/n.jpg',art_crop:'https://img.test/art-'+encodeURIComponent(name)+'.jpg'},prices:{usd:name==='Rhystic Study'?'40.00':name==='Fancy Card'?'90.00':/Forest/.test(name)?'0.10':'1.00'},border_color:name==='Fancy Card'?'borderless':'black',frame_effects:[],promo:false,full_art:false,game_changer:name==='Rhystic Study',cmc:1,keywords:[],...extra});
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1300,height:900}});const errs=[];let searches=0;
 await ctx.route(/api\.scryfall\.com/,async r=>{const u=r.request().url();
  if(u.includes('/cards/collection')){const ids=JSON.parse(r.request().postData()).identifiers;const data=ids.map(i=>i.name?(i.name==='Nonexistent Card'?null:card(i.name)):card(i.set==='fin'?'Isshin, Two Heavens as One':'Sol Ring',{set:i.set,collector_number:i.collector_number,image_uris:{small:`https://img.test/print-${i.set}-${i.collector_number}.jpg`,normal:'https://img.test/pn.jpg',art_crop:`https://img.test/printart-${i.set}-${i.collector_number}.jpg`}})).filter(Boolean);return r.fulfill({json:{data}})}
  if(u.includes('/cards/search')){searches++;return r.fulfill({json:{data:[card('Fancy Card'),card('Fancy Card',{border_color:'black',prices:{usd:'2.00'}})]}})}
  if(u.includes('/cards/named')){const n=decodeURIComponent(u.split('exact=')[1]).replace(/\+/g,' ');return r.fulfill({json:card(n)})}
  if(u.includes('/cards/fin/')){return r.fulfill({json:card('Isshin, Two Heavens as One',{set:'fin',collector_number:'412'})})}
  if(u.includes('autocomplete'))return r.fulfill({json:{data:[]}});
  return r.fulfill({status:404,json:{}})});
 await ctx.route(/open\.er-api\.com/,r=>r.fulfill({json:{rates:{SGD:1.25}}}));
 await ctx.route(/edhrec|fonts\.g/,r=>r.fulfill({status:404,body:''}));
 await ctx.route(/img\.test/,r=>r.fulfill({status:404,body:''}));
 const L=(cm,extra)=>[cm,...extra,...Array(60).fill('Forest')];
 const decks={'radagast-the-brown':{list:L('Radagast of Rhosgobel',['Rhystic Study','Sol Ring','Fancy Card','Nonexistent Card']),prints:{solring:'abc/1'},updatedAt:'2026-10-01T00:00:00Z'},
  'isshin-two-heavens-as-one':{list:L('Isshin, Two Heavens as One',['Sol Ring','Time Warp']),prints:{isshintwoheavensasone:'fin/412'},updatedAt:'2026-10-01T00:00:00Z'},
  'omnath-locus-of-creation':{list:L('Omnath, Locus of the Roil',['Sol Ring']),updatedAt:'2026-10-01T00:00:00Z'},'teysa-karlov':{list:L('Teysa Karlov',['Sol Ring']),updatedAt:'2026-10-01T00:00:00Z'}};
 await ctx.addInitScript(d=>{if(!sessionStorage.getItem('seeded')){localStorage.clear();localStorage.setItem('decks',JSON.stringify(d));sessionStorage.setItem('seeded','1')}},decks);


 const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>{dialogs.push(d.message());d.dismiss()});const dialogs=[];
 const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
 const boot=async()=>{await pg.goto('http://localhost:8765/');await pg.waitForFunction(()=>/SGD \$/.test(document.querySelector('#sumbox summary')?.textContent||''),null,{timeout:20000});await pg.click('#nav-play');await pg.waitForSelector('#ptstart,#ptresume',{timeout:20000});};
 await boot();ok('no resume offered on a fresh start',!(await pg.$('#ptresume')));
 await pg.click('#ptstart');await pg.waitForSelector('#ptshortgo,.gt-bar',{timeout:30000}).catch(()=>{});if(await pg.$('#ptshortgo'))await pg.click('#ptshortgo'); /* v123: the deck has a name that never loads — the app now says so before the game */ await pg.waitForFunction(()=>window.GoldfishUI&&GoldfishUI.current&&GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull',null,{timeout:60000});await pg.click('[data-act=keep]');
 await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
 // play a land, end turn, let opponents play until my next turn
 await pg.evaluate(async()=>{const U=GoldfishUI.current,g=U.game,me=U.me;const l=me.hand.find(c=>c.isLand);if(l)await U.act(()=>g.playLand(me,l));});await pg.click('[data-act=end]');
 for(let i=0;i<300;i++){const s=await pg.evaluate(()=>{const U=GoldfishUI.current;if(U.prompt&&['priority','counter','endstep','attack'].includes(U.prompt.kind)){U.prompt.res(null);return 'p'}if(U.prompt&&U.prompt.kind==='block'){U.prompt.res(U.prompt.map);return 'b'}if(U.prompt&&U.prompt.kind==='may'){U.prompt.res(false);return 'm'}return U.myTurn&&!U.busy?'mine':'w'});if(s==='mine')break;await pg.waitForTimeout(100);}
 const before=await pg.evaluate(()=>{const g=GoldfishUI.current.game;return {turn:g.turn,names:g.players.map(p=>p.name),lands:g.players[0].battlefield.filter(b=>b.card.isLand).length,lib:g.players.map(p=>p.library.length)}});
 const saved=JSON.parse(await pg.evaluate(()=>localStorage.getItem('pt-save')));
 ok('a save exists at the start of my turn',saved&&saved.turn===before.turn&&!!saved.state&&!!saved.cfg,saved&&('turn '+saved.turn+' size '+Math.round(JSON.stringify(saved).length/1024)+'KB'));
 // back swipe: hash leaves #playtest → confirm; dismiss (cancel) keeps the game
 await pg.evaluate(()=>history.back());await pg.waitForTimeout(400);
 ok('leaving asks for confirmation',dialogs.length===1&&/Leave the game/.test(dialogs[0]),JSON.stringify(dialogs));
 ok('cancelling keeps the game and the game hash',await pg.evaluate(()=>location.hash==='#playtest/game'&&!!GoldfishUI.current.game&&!GoldfishUI.current.aborted),await pg.evaluate(()=>location.hash));
 // now confirm leaving: accept the dialog → back to setup with Resume offered, game aborted
 pg.removeAllListeners('dialog');pg.on('dialog',d=>{dialogs.push(d.message());d.accept()});await pg.evaluate(()=>history.back());await pg.waitForSelector('#ptresume',{timeout:10000}).catch(()=>null);
 ok('confirming leaves to the setup screen with Resume offered',!!(await pg.$('#ptresume')),await pg.evaluate(()=>location.hash));
 // simulate the accidental exit: reload the page entirely
 await boot();ok('resume offered after reload',!!(await pg.$('#ptresume')),await pg.$eval('.pt-resume',e=>e.textContent.replace(/\s+/g,' ').slice(0,120)).catch(()=>''));
 await pg.click('#ptresume');await pg.waitForFunction(()=>GoldfishUI.current&&GoldfishUI.current.game&&GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
 const after=await pg.evaluate(()=>{const g=GoldfishUI.current.game;return {turn:g.turn,names:g.players.map(p=>p.name),lands:g.players[0].battlefield.filter(b=>b.card.isLand).length,lib:g.players.map(p=>p.library.length),log:g.log.filter(l=>/resumed/.test(l.m)).length,ai:g.players.slice(1).map(p=>!!p.ai)}});
 ok('resumed at the same turn with the same seats and board',after.turn===before.turn&&JSON.stringify(after.names)===JSON.stringify(before.names)&&after.lands===before.lands&&after.log===1&&after.ai.every(Boolean),JSON.stringify({before,after}));
 // continue a turn after resuming
 await pg.click('[data-act=end]');for(let i=0;i<300;i++){const s=await pg.evaluate(()=>{const U=GoldfishUI.current;if(U.prompt&&['priority','counter','endstep','attack'].includes(U.prompt.kind)){U.prompt.res(null);return 'p'}if(U.prompt&&U.prompt.kind==='block'){U.prompt.res(U.prompt.map);return 'b'}if(U.prompt&&U.prompt.kind==='may'){U.prompt.res(false);return 'm'}return U.myTurn&&!U.busy?'mine':'w'});if(s==='mine')break;await pg.waitForTimeout(100);}
 const t2=await pg.evaluate(()=>GoldfishUI.current.game.turn);ok('play continues after resume',t2>after.turn,after.turn+' → '+t2);
 // discard
 await boot();await pg.click('#ptdiscard');await pg.waitForSelector('#ptstart');ok('discard removes the save',!(await pg.$('#ptresume'))&&!(await pg.evaluate(()=>localStorage.getItem('pt-save'))));
 console.log('errors',errs);await b.close();})();
