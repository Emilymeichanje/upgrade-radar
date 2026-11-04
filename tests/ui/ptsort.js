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
  'omnath-locus-of-creation':{list:L('Omnath, Locus of the Roil',['Sol Ring']),bracket:'4',updatedAt:'2026-10-01T00:00:00Z'}};
 await ctx.addInitScript(d=>{if(!sessionStorage.getItem('seeded')){localStorage.clear();localStorage.setItem('decks',JSON.stringify(d));sessionStorage.setItem('seeded','1')}},decks);
 const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.dismiss());
 await pg.goto('http://localhost:8765/');await pg.waitForFunction(()=>/SGD \$/.test(document.querySelector('#sumbox summary')?.textContent||''),null,{timeout:20000});
 await pg.waitForTimeout(1500);

 const ok=(n,c,x='')=>console.log((c?'PASS ':'FAIL ')+n+(x?' — '+x:''));
 await pg.click('#nav-play');await pg.waitForSelector('#ptsort',{timeout:20000});
 const grp=await pg.$$eval('#s0 optgroup',g=>g.map(x=>[x.label,[...x.children].map(o=>o.textContent)]));
 ok('bracket mode groups by bracket',grp.length>=2,JSON.stringify(grp));
 const ORD=['Bracket 2','Bracket 3','Bracket 4','cEDH'];
 ok('groups ordered 2→3→4→cEDH',grp.map(g=>g[0]).join('|')===grp.map(g=>g[0]).sort((a,b)=>ORD.indexOf(a)-ORD.indexOf(b)).join('|'),grp.map(g=>g[0]).join('|'));
 ok('alphabetical within a group',grp.every(g=>g[1].join()===[...g[1]].sort((a,b)=>a.localeCompare(b)).join()));
 await pg.selectOption('#s1','omnath-locus-of-creation');
 await pg.selectOption('#ptsort','alpha');await pg.waitForTimeout(100);
 const al=await pg.$$eval('#s0 option',o=>o.map(x=>x.textContent));
 ok('alpha mode has no groups',(await pg.$$('#s0 optgroup')).length===0);
 ok('alpha mode sorted A–Z with bracket tag',al.join()===[...al].sort((a,b)=>a.localeCompare(b)).join()&&al.every(t=>/ · (B\d|cEDH)$/.test(t)),JSON.stringify(al));
 ok('selection survives re-sort',await pg.$eval('#s1',s=>s.value)==='omnath-locus-of-creation');
 await pg.reload();await pg.waitForFunction(()=>/SGD \$/.test(document.querySelector('#sumbox summary')?.textContent||''),null,{timeout:20000});await pg.click('#nav-play');await pg.waitForSelector('#ptsort');
 ok('sort choice persists',await pg.$eval('#ptsort',s=>s.value)==='alpha');
 console.log('pageerrors',errs);await b.close();})();
