require(__dirname+'/../playtest.js');const {tagCard,parseOps}=Goldfish;const fs=require('fs');
const seen=new Map();
for(const f of fs.readdirSync(__dirname+'/../tests/fixtures')){ if(!f.endsWith('.json'))continue; let j; try{j=JSON.parse(fs.readFileSync(__dirname+'/../tests/fixtures/'+f,'utf8'))}catch(e){continue}
  const rows=Array.isArray(j)?j:(j.cards||j.rows||[]); for(const r of rows){ if(!Array.isArray(r)||typeof r[1]!=='string'||typeof r[4]!=='string')continue; const [,name,mana,type,oracle,cmc,p,t]=r; if(seen.has(name))continue; seen.set(name,{name,mana,type,oracle,cmc,power:p,toughness:t}); } }
for(const c of seen.values()){ if(!/overload/i.test(c.oracle))continue; const t=tagCard(c); const ov=(t.abilities||[]).find(a=>a.label==='overload');
  const each=c.oracle.split('\n').filter(l=>!/^overload/i.test(l)).join(' ').toLowerCase().replace(/\btarget\b/g,'each').replace(/\([^)]*\)/g,'');
  console.log('##',c.name,'::',c.oracle.replace(/\n/g,' | ').slice(0,200));console.log('   overload ops:',JSON.stringify(ov&&ov.ops));console.log('   each-parse  :',JSON.stringify(parseOps(each)));}
