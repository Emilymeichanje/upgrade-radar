const {chromium}=require('playwright');
const CI={'Radagast of Rhosgobel':['G'],'Omnath, Locus of the Roil':['G','U','R'],'Silverquill, the Disputant':['W','B'],'Isshin, Two Heavens as One':['R','W','B'],'Teysa Karlov':['W','B']};
const card=(name,extra={})=>({object:'card',name,mana_cost:'{1}',type_line:/Forest/.test(name)?'Basic Land — Forest':CI[name]?'Legendary Creature — Human':'Artifact',oracle_text:name==='Time Warp'?'Target player takes an extra turn after this one.':'',set:'abc',set_name:'Test',collector_number:'1',released_at:'2020-01-01',color_identity:CI[name]||[],image_uris:{small:'https://img.test/'+encodeURIComponent(name)+'.jpg',normal:'https://img.test/n.jpg',art_crop:'https://img.test/art-'+encodeURIComponent(name)+'.jpg'},prices:{usd:name==='Rhystic Study'?'40.00':name==='Fancy Card'?'90.00':/Forest/.test(name)?'0.10':'1.00'},border_color:name==='Fancy Card'?'borderless':'black',frame_effects:[],promo:false,full_art:false,game_changer:['Rhystic Study','Smothering Tithe','Cyclonic Rift','Demonic Tutor'].includes(name),cmc:1,keywords:[],...extra});
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

 await ctx.route(/data\/combos\.json/,r=>r.fulfill({json:{n:2,timestamp:'t',c:[["Demonic Consultation","Thassa's Oracle",3,"Win the game","1-2","R"],["Exquisite Blood","Sanguine Bond",8,"Infinite lifeloss","8","P"]]}}));
 const L=(cm,extra)=>[cm,...extra,...Array(60).fill('Forest')];
 const decks={'radagast-the-brown':{bracket:'2',list:L('Radagast of Rhosgobel',['Rhystic Study','Smothering Tithe','Cyclonic Rift','Demonic Tutor',"Thassa's Oracle",'Demonic Consultation']),updatedAt:'2026-10-01T00:00:00Z'},
  'isshin-two-heavens-as-one':{bracket:'3',list:L('Isshin, Two Heavens as One',['Rhystic Study','Exquisite Blood','Sanguine Bond']),updatedAt:'2026-10-20T00:00:00Z'}};
 await ctx.addInitScript(d=>{if(!sessionStorage.getItem('seeded')){localStorage.clear();localStorage.setItem('decks',JSON.stringify(d));sessionStorage.setItem('seeded','1')}},decks);
 const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.dismiss());
 await pg.goto('http://localhost:8765/');await pg.waitForFunction(()=>/SGD \$/.test(document.querySelector('#sumbox summary')?.textContent||''),null,{timeout:20000});
 await pg.waitForTimeout(2000);
 const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
 const groupOf=async slug=>pg.evaluate(s=>{const el=document.querySelector(`.deck[data-slug="${s}"]`);if(!el)return null;let g=el.closest('.grid').previousElementSibling;return g&&g.textContent},slug);
 const gR=await groupOf('radagast-the-brown');ok('Radagast grouped under Bracket 4',/^Bracket 4/.test(gR||''),gR);
 const gI=await groupOf('isshin-two-heavens-as-one');ok('Isshin stays Bracket 3 (late combo + 1 GC)',/^Bracket 3/.test(gI||''),gI);
 const badge=await pg.textContent('.deck[data-slug="radagast-the-brown"]');ok('badge set B2 · plays B4',/set B2 · plays B4/.test(badge),badge.slice(0,200));
 ok('list indicator ✓',/✓ list/.test(badge));
 const miss=await pg.$eval('.missing',e=>e.textContent).catch(()=>'');ok('missing-list banner',/no decklist/.test(miss),miss.slice(0,120));
 const noListCard=await pg.evaluate(()=>{const b=[...document.querySelectorAll('.deck')].find(x=>/no list/.test(x.textContent));return b&&b.dataset.slug});ok('a deck card shows ✗ no list',!!noListCard);
 const sumTxt=await pg.textContent('#sumbox');ok('summary lists over-bracket',/plays B4/.test(sumTxt)&&/Set all 1/.test(sumTxt));
 // open Radagast → Your list
 await pg.click('.deck[data-slug="radagast-the-brown"]');await pg.waitForSelector('#brhint');await pg.waitForTimeout(800);
 const hint=await pg.textContent('#brhint');ok('header hint',/plays as Bracket 4/.test(hint),hint);
 await pg.click('#brwhy');await pg.waitForSelector('.brbox h4');await pg.waitForTimeout(500);
 const box=await pg.textContent('.brbox');
 ok('box heading',/Plays as Bracket 4 \(Optimized\) — you set Bracket 2/.test(box),box.slice(0,160));
 ok('lists 4 Game Changers',/Game Changers \(4\)/.test(box)&&/Smothering Tithe/.test(box));
 ok('lists early combo',/Demonic Consultation \+ Thassa's Oracle → Win the game/.test(box)&&/early/.test(box));
 ok('fix advice',/To fit Bracket 2/.test(box)&&/Cut all 4 Game Changers/.test(box)&&/Break this combo/.test(box),box.slice(box.indexOf('To fit'),box.indexOf('To fit')+200));
 ok('list saved status',/List saved/.test(box));
 await pg.click('#brmove');await pg.waitForTimeout(400);
 const br=await pg.evaluate(()=>JSON.parse(localStorage.getItem('decks'))['radagast-the-brown'].bracket);ok('Move saved bracket 4',br==='4',br);
 ok('select updated',(await pg.$eval('#brsel',e=>e.value))==='4');
 // a deck with no list: open from banner, save a list
 await pg.click('#back');await pg.waitForTimeout(500);
 const slug=await pg.$eval('.missing [data-open]',e=>e.dataset.open);await pg.click('.missing [data-open]');
 await pg.waitForFunction(()=>document.querySelector('#lst'),null,{timeout:15000});
 ok('opened on Your list',await pg.$eval('[data-t=list]',e=>e.getAttribute('aria-selected'))==='true');
 ok('tab dot shown',!!(await pg.$('[data-t=list] .dot')));
 ok('no-list status',/No list yet/.test(await pg.textContent('.brbox')));
 await pg.fill('#lst',['Sol Ring',...Array(70).fill('Forest')].join('\n'));await pg.click('#savelist');await pg.waitForTimeout(1500);
 const dk=await pg.evaluate(s=>JSON.parse(localStorage.getItem('decks'))[s],slug);ok('listAt stamped',!!dk.listAt&&!dk.listAtApprox,JSON.stringify(dk.listAt));
 ok('dot removed',!(await pg.$('[data-t=list] .dot')));ok('status ✓',/List saved today/.test(await pg.textContent('.brbox')),(await pg.textContent('.brbox')).slice(0,80));
 // bracket change alone must not move listAt
 const la=dk.listAt;await pg.selectOption('#brsel','4');await pg.waitForTimeout(300);const dk2=await pg.evaluate(s=>JSON.parse(localStorage.getItem('decks'))[s],slug);ok('bracket change keeps listAt',dk2.listAt===la);
 // migrated approx date on Isshin
 const iz=await pg.evaluate(()=>JSON.parse(localStorage.getItem('decks'))['isshin-two-heavens-as-one']);ok('old list dated from last change',iz.listAt==='2026-10-20T00:00:00Z'&&iz.listAtApprox===true);
 await pg.setViewportSize({width:390,height:844});await pg.click('#back');await pg.waitForTimeout(400);
 const ov=await pg.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1);ok('no horizontal scroll at phone width',ov);
 await pg.screenshot({path:'brk-home.png'});
 await pg.click('.deck[data-slug="radagast-the-brown"]');await pg.waitForSelector('#brhint');await pg.click('[data-t=list]');await pg.waitForSelector('.brbox h4');await pg.waitForTimeout(500);await pg.screenshot({path:'brk-list.png',fullPage:false});
 ok('page errors',!errs.length,errs.join(' | '));await b.close()})();
