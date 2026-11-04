require(__dirname+'/../playtest.js');
const files=process.argv.slice(2);const R=files.flatMap(f=>require('./'+f)).map(a=>({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7],loyalty:a[8]}));
let m=0,g=0,ok=0;const out=[];for(const c of R){const a=Goldfish.auditCard(c);if(a.missing)m++;else if(a.generic)g++;else ok++;if(a.missing)out.push(c.name+' :: '+a.lines.filter(x=>x.status==='missing').map(x=>x.line).join(' / ').slice(0,200));}
console.log('cards',R.length,'ok',ok,'cond',g,'missing',m);if(process.env.V)console.log(out.join('\n'));
