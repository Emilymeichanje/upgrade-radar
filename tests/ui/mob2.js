const {chromium}=require('playwright');
const CI={'Radagast of Rhosgobel':['G'],'Omnath, Locus of the Roil':['G','U','R'],'Silverquill, the Disputant':['W','B'],'Isshin, Two Heavens as One':['R','W','B'],'Teysa Karlov':['W','B']};
const card=(name,extra={})=>({object:'card',name,mana_cost:'{1}',type_line:/Forest/.test(name)?'Basic Land — Forest':CI[name]?'Legendary Creature — Human':'Artifact',oracle_text:name==='Time Warp'?'Target player takes an extra turn after this one.':'',set:'abc',set_name:'Test',collector_number:'1',released_at:'2020-01-01',color_identity:CI[name]||[],image_uris:{small:'https://img.test/'+encodeURIComponent(name)+'.jpg',normal:'https://img.test/n.jpg',art_crop:'https://img.test/art-'+encodeURIComponent(name)+'.jpg'},prices:{usd:name==='Rhystic Study'?'40.00':name==='Fancy Card'?'90.00':/Forest/.test(name)?'0.10':'1.00'},border_color:name==='Fancy Card'?'borderless':'black',frame_effects:[],promo:false,full_art:false,game_changer:name==='Rhystic Study',cmc:1,keywords:[],...extra});
(async()=>{const b=await chromium.launch();const VP=process.argv[2]==='land'?{width:915,height:412}:{width:412,height:915};const ctx=await b.newContext({viewport:VP,isMobile:true,hasTouch:true,deviceScaleFactor:2});const errs=[];let searches=0;
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

 const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(e.message));pg.on('dialog',d=>d.dismiss());
 await pg.goto('http://localhost:8765/');await pg.waitForFunction(()=>/SGD \$/.test(document.querySelector('#sumbox summary')?.textContent||''),null,{timeout:20000});
 await pg.click('#nav-play');await pg.waitForSelector('#ptstart',{timeout:20000});await pg.click('#ptstart');await pg.waitForSelector('#ptshortgo,.gt-bar',{timeout:30000}).catch(()=>{});if(await pg.$('#ptshortgo'))await pg.click('#ptshortgo'); /* v123: the deck has a name that never loads — the app now says so before the game */ 
 await pg.waitForFunction(()=>window.GoldfishUI&&GoldfishUI.current&&GoldfishUI.current.prompt&&GoldfishUI.current.prompt.kind==='mull',null,{timeout:60000});await pg.click('[data-act=keep]');
 await pg.waitForFunction(()=>GoldfishUI.current.myTurn&&!GoldfishUI.current.busy,null,{timeout:60000});
 await pg.evaluate(()=>{const U=GoldfishUI.current,g=U.game;const {tagCard}=Goldfish;let id=5000;for(const p of g.players){for(let i=0;i<4;i++)p.battlefield.push({id:id++,card:tagCard({name:'Bear'+i,type:'Creature — Bear',mana:'{1}{G}',oracle:'',cmc:2,power:2,toughness:2}),tapped:false,summoning:false,counters:0});for(let i=0;i<3;i++)p.battlefield.push({id:id++,card:tagCard({name:'Forest',type:'Basic Land — Forest',mana:'',oracle:'',cmc:0}),tapped:false,counters:0});}U.render();window.scrollTo(0,0);});
 await pg.waitForTimeout(400);
 const name=process.argv[2]==='land'?'landscape':'portrait';await pg.screenshot({path:'real_'+name+'.png'});
 const m=await pg.evaluate(()=>{const U=GoldfishUI.current;const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();return [Math.round(b.top),Math.round(b.bottom),Math.round(b.left),Math.round(b.width)]};return {iw:innerWidth,ih:innerHeight,mobile:U.mobile,header:r('header.top'),opps:r('.gt-opps'),pager:r('.opp-pager'),me:r('.gs.me'),dock:r('.gt-dock'),docW:document.documentElement.scrollWidth}});
 console.log(name,JSON.stringify(m),'errors',errs);
 // portrait: scroll down to the hand and check the opponent strip stays pinned
 if(name==='portrait'){await pg.evaluate(()=>window.scrollTo(0,600));await pg.waitForTimeout(200);const m2=await pg.evaluate(()=>{const b=document.querySelector('.gt-opps-wrap').getBoundingClientRect();return [Math.round(b.top),Math.round(b.bottom)]});console.log('after scroll, opp strip at',JSON.stringify(m2));await pg.screenshot({path:'real_portrait_scrolled.png'});}
 await b.close();})();
