require(__dirname+'/../playtest.js');const R=[1,2,3,4,5,6,7].flatMap(i=>require(__dirname+'/fixtures/gap'+i+'.json'));
for(const n of process.argv.slice(2)){const a=R.find(x=>x[1]===n);const c=Goldfish.tagCard({name:a[1],mana:a[2],type:a[3],oracle:a[4],cmc:a[5],power:a[6],toughness:a[7],loyalty:a[8]});
const ex=o=>JSON.stringify(o);console.log('##',n,ex({sp:c.spellOps,tr:(c.triggers||[]).map(t=>[t.when,t.ops]),ab:(c.abilities||[]).map(x=>x.ops),modes:c.modes&&c.modes.map(m=>m.card&&m.card.spellOps),roles:c.roles}).slice(0,600));}
