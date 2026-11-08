require(__dirname+'/../playtest.js');const {auditCard}=Goldfish;const fs=require('fs');
const seen=new Map();
for(const f of fs.readdirSync(__dirname+'/../tests/fixtures')){ if(!f.endsWith('.json'))continue; let j; try{j=JSON.parse(fs.readFileSync(__dirname+'/../tests/fixtures/'+f,'utf8'))}catch(e){continue}
  const rows=Array.isArray(j)?j:(j.cards||j.rows||[]); for(const r of rows){ if(!Array.isArray(r)||typeof r[1]!=='string'||typeof r[4]!=='string')continue; const [,name,mana,type,oracle,cmc,p,t]=r; if(seen.has(name))continue; seen.set(name,{name,mana,type,oracle,cmc,power:p,toughness:t}); } }
for(const c of seen.values()){ const a=auditCard(c); for(const l of a.lines) if(l.status==='generic'||l.status==='missing') console.log(l.status.padEnd(8),'|',c.name,'::',l.line.slice(0,170)); }
