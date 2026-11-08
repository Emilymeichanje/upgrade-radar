require(__dirname+'/../playtest.js');const {TESTED,tagCard}=Goldfish;const fs=require('fs');
const seenFx=new Set();for(const f of fs.readdirSync(__dirname+'/../tests/fixtures')){if(f==='owner.json'||!f.endsWith('.json'))continue;const j=JSON.parse(fs.readFileSync(__dirname+'/../tests/fixtures/'+f,'utf8'));const rr=Array.isArray(j)?j:Object.values(j).flat();for(const r of rr){if(Array.isArray(r)){const nm=typeof r[0]==='number'?r[1]:r[0];if(typeof nm==='string')seenFx.add(nm.split(' // ')[0])}}}
const rows=JSON.parse(fs.readFileSync(__dirname+'/../tests/fixtures/owner.json','utf8'));const byName=new Map(rows.map(r=>[String(r[1]).split(' // ')[0].toLowerCase(),r]));
const exp=JSON.parse(fs.readFileSync(process.argv[2]||'mtg-dashboard-data.json','utf8')).decks;
const out=[];
for(const [slug,d] of Object.entries(exp)){let fresh=0,untested=0,complex=0;const names=[];for(const n of d.list||[]){const k=String(n).split(' // ')[0].toLowerCase();const r=byName.get(k);if(!r)continue;const nm=String(r[1]).split(' // ')[0];const isNew=!seenFx.has(nm);const tested=TESTED.has(nm)||TESTED.has(r[1]);const lines=(r[4]||'').split('\n').filter(l=>l&&!/^\{T\}: Add/.test(l)).length;if(isNew){fresh++;if(lines>=2){complex++;names.push(nm)}}if(!tested)untested++;}
 out.push({slug,fresh,complex,untested,names:names.slice(0,8)})}
out.sort((a,b)=>b.complex-a.complex||b.fresh-a.fresh);
for(const o of out.slice(0,8))console.log(o.complex,'complex-new /',o.fresh,'new /',o.untested,'untested ::',o.slug,'::',o.names.join('; '));
