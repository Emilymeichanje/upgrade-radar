require(__dirname+'/../playtest.js');const {tagCard}=Goldfish;const fs=require('fs');
const seen=new Map();
for(const f of fs.readdirSync(__dirname+'/../tests/fixtures')){ if(!f.endsWith('.json'))continue; let j; try{j=JSON.parse(fs.readFileSync(__dirname+'/../tests/fixtures/'+f,'utf8'))}catch(e){continue}
  const rows=Array.isArray(j)?j:(j.cards||j.rows||[]); for(const r of rows){ if(!Array.isArray(r)||typeof r[1]!=='string'||typeof r[4]!=='string')continue; const [,name,mana,type,oracle,cmc,p,t]=r; if(seen.has(name))continue; seen.set(name,{name,mana,type,oracle,cmc,power:p,toughness:t}); } }
let n=0;
for(const c of seen.values()){ if(!/Instant|Sorcery/.test(c.type)||/Adventure|\/\//.test(c.type))continue; const t=tagCard(c); if(t.spellOps&&t.spellOps.length)continue; if(t.modes&&t.modes.length)continue; if(t.counter)continue; n++;
  console.log('##',c.name,'['+(t.roles||[]).join(',')+']','::',c.oracle.replace(/\([^)]*\)/g,'').replace(/\n/g,' | ').slice(0,220)); }
console.log('role-only spells:',n);
