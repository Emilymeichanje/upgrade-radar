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
  'omnath-locus-of-creation':{list:L('Omnath, Locus of the Roil',['Sol Ring']),updatedAt:'2026-10-01T00:00:00Z'}};
 await ctx.addInitScript(d=>{if(!sessionStorage.getItem('seeded')){localStorage.clear();localStorage.setItem('decks',JSON.stringify(d));sessionStorage.setItem('seeded','1')}},decks);
 const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.dismiss());
 await pg.goto('http://localhost:8765/');await pg.waitForFunction(()=>/SGD \$/.test(document.querySelector('#sumbox summary')?.textContent||''),null,{timeout:20000});
 await pg.waitForTimeout(1500);
 const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
 ok('title',await pg.title()==='MTG Dashboard');ok('h1',(await pg.textContent('h1')).startsWith('MTG Dashboard'));
 const sum=await pg.textContent('#sumbox summary');ok('summary total',/SGD \$/.test(sum),sum.replace(/\s+/g,' '));
 ok('regular printing searched once for borderless default',searches===1,''+searches);
 const radTile=await pg.locator('.deck[data-slug="radagast-the-brown"]').innerText();ok('Radagast renamed',/Radagast of Rhosgobel/.test(radTile),radTile.replace(/\s+/g,' '));ok('plays B3 flag',/plays B3/i.test(radTile));
 // 1 + 40 + 1 + 2(regular) + 60*0.1 = 50 USD → 62.5 SGD
 ok('deck price 63',/SGD \$63/.test(radTile));
 ok('Omnath renamed',/Locus of the Roil/.test(await pg.locator('.deck[data-slug="omnath-locus-of-creation"]').innerText()));
 await pg.click('#sumbox summary');const body=await pg.innerText('.sumbody');ok('colour counts + combos',/Simic|Temur/.test(body)&&/Mono-Green/.test(body),body.slice(0,300).replace(/\s+/g,' '));ok('above bracket listed',/Playing above the bracket you set/.test(body));
 // colour filter: green only, exactly
 await pg.click('.chip[data-c=G]');let shown=await pg.locator('#home .deck').count();ok('filter includes G',shown===2,''+shown);
 await pg.selectOption('#cmode','exact');shown=await pg.locator('#home .deck').count();ok('filter exactly G',shown===1,''+shown);
 await pg.click('#fclear');await pg.click('.chip[data-b="3"]');const hasB3=await pg.locator('#home .deck[data-slug="isshin-two-heavens-as-one"]').count();ok('bracket 3 hidden',hasB3===0);await pg.click('.chip[data-b="3"]');
 // isshin tile uses FIN print art
 const isrc=await pg.locator('.deck[data-slug="isshin-two-heavens-as-one"] img').getAttribute('src');ok('alt art tile',/printart-fin-412/.test(isrc||''),isrc);
 await pg.click('.deck[data-slug="isshin-two-heavens-as-one"]');await pg.click('[data-t=list]');await pg.waitForSelector('.dg-c img');
 const gsrc=await pg.locator('.dg-s').first().locator('img').getAttribute('src');ok('grid commander alt art',/print-fin-412/.test(gsrc),gsrc);
 const ta=await pg.inputValue('#lst');ok('textarea keeps printing',/Isshin, Two Heavens as One \(FIN\) 412/.test(ta));
 const cost=await pg.innerText('#costbox');ok('cost box',/Deck cost SGD \$/.test(cost),cost.slice(0,120));ok('gishath links',await pg.locator('#costbox a[href*="gishathfetch.com/?s="]').count()>3);
 ok('extra turns not flagged for 1 card',!/looks like/.test(await pg.innerText('#brhint')));
 // bracket change
 await pg.selectOption('#brsel','4');await pg.waitForTimeout(200);ok('bracket saved',await pg.evaluate(()=>JSON.parse(localStorage.getItem('decks'))['isshin-two-heavens-as-one'].bracket==='4'));
 // edit commander: printing only
 await pg.click('#editcmd');await pg.fill('#ecset','fin');await pg.fill('#eccn','412');await pg.click('#ecsave');await pg.waitForTimeout(800);
 ok('cmdrPrint saved',await pg.evaluate(()=>JSON.parse(localStorage.getItem('decks'))['isshin-two-heavens-as-one'].cmdrPrint==='fin/412'));
 // edit commander: rename Omnath deck to Teysa, replacing in list
 await pg.click('#back');await pg.click('.deck[data-slug="omnath-locus-of-creation"]');await pg.click('#editcmd');await pg.fill('#ecname','Teysa Karlov');await pg.click('#ecsave');await pg.waitForTimeout(800);
 const dk=await pg.evaluate(()=>JSON.parse(localStorage.getItem('decks'))['omnath-locus-of-creation']);ok('renamed + list replaced',dk.rename==='Teysa Karlov'&&dk.list.includes('Teysa Karlov')&&!dk.list.includes('Omnath, Locus of the Roil'),JSON.stringify({r:dk.rename,l:dk.list.slice(0,3)}));
 ok('hero shows new name',/Teysa Karlov/.test(await pg.textContent('.hero h2')));
 await pg.reload();await pg.waitForTimeout(2500);ok('rename persists after reload',/Teysa Karlov/.test(await pg.locator('.deck[data-slug="omnath-locus-of-creation"]').innerText()));
 // playtest randomize all
 await pg.click('#nav-play');await pg.waitForSelector('#ptrandall',{timeout:15000});const seen=new Set();for(let i=0;i<12;i++){await pg.click('#ptrandall');seen.add(await pg.inputValue('#s0'))}ok('randomize all moves seat 1',seen.size>1,[...seen].join(','));
 // mobile layout: no horizontal scroll, filters visible
 await pg.setViewportSize({width:375,height:800});await pg.click('#nav-decks');await pg.waitForTimeout(300);ok('mobile no h-scroll',await pg.evaluate(()=>document.documentElement.scrollWidth<=376),''+await pg.evaluate(()=>document.documentElement.scrollWidth));ok('filters visible on mobile',await pg.isVisible('#filters'));
 await pg.screenshot({path:__dirname+'/dash_mobile.png'});await pg.setViewportSize({width:1300,height:900});await pg.click('#sumbox summary').catch(()=>{});await pg.screenshot({path:__dirname+'/dash_desk.png'});
 console.log('pageerrors',errs);await b.close();})();
