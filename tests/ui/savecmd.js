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

 // v146: Save list always keeps the commander, even when the export files it under SIDEBOARD
 await pg.click('.deck[data-slug="isshin-two-heavens-as-one"]');await pg.click('[data-t=list]');await pg.waitForSelector('#lst');
 await pg.fill('#lst','1 Sol Ring\n20 Forest\n\nSIDEBOARD:\n1 Time Warp\n1 Isshin, Two Heavens as One');await pg.click('#savelist');await pg.waitForTimeout(600);
 const l=await pg.evaluate(()=>JSON.parse(localStorage.getItem('decks'))['isshin-two-heavens-as-one'].list);
 ok('commander under SIDEBOARD is still saved with the list; other sideboard cards are not',l.length===22&&l.filter(n=>n==='Isshin, Two Heavens as One').length===1&&!l.includes('Time Warp'),JSON.stringify([l.length,l.slice(-2)]));
 await pg.fill('#lst','1 Isshin, Two Heavens as One\n1 Sol Ring\n20 Forest');await pg.click('#savelist');await pg.waitForTimeout(600);
 const l2=await pg.evaluate(()=>JSON.parse(localStorage.getItem('decks'))['isshin-two-heavens-as-one'].list);
 ok('a list that already names the commander is not given a second copy',l2.length===22&&l2.filter(n=>n==='Isshin, Two Heavens as One').length===1,String(l2.length));
 ok('no page errors',!errs.length,errs.join('|'));await b.close();})();
