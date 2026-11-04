// derived from the user's 2026-11-03 game log: Ministrant afterlife, Midnight Reaper self-death, Beast Within token, Pest Infestation
const {execSync}=require('child_process');let fails=0;
const out1=execSync('node log1.js 2>&1').toString();const out2=execSync('node log2_run.js 2>&1').toString();
const chk=(re,src,name)=>{if(!re.test(src)){fails++;console.log('FAIL '+name)}};
chk(/opp creature died → spirits: 0/,out1,'Ministrant ignores other deaths');chk(/itself died → spirits: 2/,out1,'Ministrant afterlife 2');chk(/Soulherder counter on exile: 1/,out1,'Soulherder on generic exile');
chk(/Reaper dies itself → draw 1 life -1/,out2,'Reaper sees own death');chk(/other nontoken dies → draw 1 life -1/,out2,'Reaper damage+draw');
chk(/beast for controller: 1/,out2,'Beast Within token');chk(/my life change 0 \(expected 0 gain at cast\) opp life change 0/,out2,'Pest Infestation no cast gain');chk(/pest dies → gain 1 opp loses -1/,out2,'Pest death gain drains');
console.log(fails?fails+' failed':'ALL PASS');
