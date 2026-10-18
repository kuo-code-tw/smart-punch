const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {buildMonth,summarize,recommendSwap,movementPolicy}=require('../assets/port79-personnel-dispatch.js');
const roster=[{empId:'1',name:'甲',group:'A組'},{empId:'2',name:'乙',group:'B組'},{empId:'3',name:'丙',group:'C組'},{empId:'4',name:'丁',group:'D組'}];
const r=(id,disc,hours,extra={})=>({source:'working-report',workDate:'2026-10-01',empId:id,disc,load:0,hc:4,hours,...extra});
const build=(records,people=roster)=>buildMonth({month:'2026-10',records,roster:people,metrics:x=>x});
let people=build([r('1',100,1),r('1',100,9),r('2',80,4),r('3',50,5),r('4',60,3),r('1',999,1,{workDate:'2026-09-30'}),r('1',999,1,{source:'manual'})]);
const a=people.find(p=>p.empId==='1');assert.equal(a.eff,20);assert.equal(a.containers,200);assert.equal(a.hours,10);assert.equal(a.hc,8);assert.equal(a.eligible,true);
const before=summarize(people),after=summarize(people,{[a.key]:'B'});
assert.equal(before.groups[0].eff,20);assert.equal(after.groups[0].people,0);assert.equal(after.groups[0].eff,null);assert.equal(after.groups[1].containers,280);assert.equal(after.groups[1].hours,14);assert.equal(after.groups[1].eff,20);
for(const field of ['people','containers','hours','hc'])assert.equal(before.groups.reduce((s,g)=>s+g[field],0),after.groups.reduce((s,g)=>s+g[field],0));
assert.equal(summarize(people,{[a.key]:'UNKNOWN'}).groups[0].containers,200);
for(const hours of [0,-1,NaN]){const p=build([r('1',10,hours)]).find(p=>p.empId==='1');assert.equal(p.eff,null);assert.equal(p.eligible,false);assert.equal(p.invalid,1);assert.equal(summarize([p]).groups[0].eff,null);}
const mixed=build([r('1',20,2),r('1',10,0)]).find(p=>p.empId==='1');assert.equal(mixed.eff,null);assert.equal(mixed.containers,30);
const noWork=build([]);assert.equal(noWork.length,4);assert.ok(noWork.every(p=>p.eff===null&&!p.eligible));
const missing=build([r('9',20,2,{name:'無名冊'})]);assert.equal(missing.find(p=>p.empId==='9').confirmed,false);assert.equal(summarize(missing).excluded,1);
const duplicateNames=[{empId:'1',name:'同名',group:'A組'},{empId:'2',name:'同名',group:'B組'}];
const ambiguous=build([r('',30,2,{name:'同名'})],duplicateNames);assert.equal(ambiguous.find(p=>p.count).eligible,false);
const wrongId=build([r('9',30,2,{name:'同名'})],duplicateNames);assert.equal(wrongId.find(p=>p.count).eligible,false);
const unique=build([r('',30,2,{name:'甲'})]);assert.equal(unique.find(p=>p.empId==='1').eff,15);
const conflict=build([r('1',20,2)],[...roster,{empId:'1',name:'甲',group:'B組'}]);assert.equal(conflict.find(p=>p.empId==='1').eligible,false);
assert.equal(buildMonth({month:'invalid'}).length,0);
const html=fs.readFileSync(require('path').join(__dirname,'../aqc-efficiency/index.html'),'utf8');
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/\bsrc=|application\/ld\+json/.test(match[1]))new vm.Script(match[2]);}
assert.match(html,/data-tab="dispatch"/);assert.match(html,/view-dispatch/);assert.match(html,/personnel-dispatch\.js/);
console.log('PASS weighted volume/hour efficiency, H/C separation, month/source boundaries, invalid data, roster ambiguity, conservative simulation and group total conservation; page scripts parse');

const person=(key,group,containers,hours=10)=>({key,name:key,group,containers,hours,hc:0,count:6,invalid:0,confirmed:true,eligible:true,eff:containers/hours});
const sample=[person('a1','A',50),person('a2','A',300),person('b1','B',100),person('b2','B',350),person('c1','C',150),person('c2','C',400),person('d1','D',10),person('d2','D',990)];
const original=JSON.stringify(sample),proposal=recommendSwap(sample),policy=movementPolicy(sample);
assert.deepEqual([...policy.locked],['D']);assert.ok(!policy.movable.has('d1'));assert.ok(policy.movable.has('a2'));
assert.ok(proposal.plan);assert.equal(proposal.moves.length,6);assert.equal(JSON.stringify(sample),original);
for(const group of ['A','B','C']){assert.equal(proposal.moves.filter(m=>m.from===group).length,2);assert.equal(proposal.moves.filter(m=>m.to===group).length,2);}
assert.ok(proposal.moves.every(m=>m.from!==m.to&&m.from!=='D'&&m.to!=='D'));
for(let i=0;i<4;i++)assert.equal(proposal.before.groups[i].people,proposal.after.groups[i].people);
for(const field of ['containers','hours'])assert.equal(proposal.before.groups.reduce((s,g)=>s+g[field],0),proposal.after.groups.reduce((s,g)=>s+g[field],0));
assert.deepEqual(proposal.before.groups[3],proposal.after.groups[3]);
const smaller=recommendSwap(sample,{counts:{A:1,B:1,C:1}});assert.ok(smaller.plan);assert.equal(smaller.moves.length,3);assert.ok(smaller.moves.every(m=>m.person.key.endsWith('1')));
assert.ok(!recommendSwap(sample,{counts:{A:3}}).plan);
assert.ok(!recommendSwap(sample,{counts:{A:2,B:0,C:0}}).plan);
assert.ok(!recommendSwap(sample,{counts:{A:0,B:0,C:0}}).plan);
assert.ok(!recommendSwap(sample,{counts:{A:1.5}}).plan);
assert.ok(!recommendSwap(sample,{counts:{A:21}}).plan);
assert.ok(!recommendSwap(sample.map(p=>({...p,count:4}))).plan);
assert.ok(!recommendSwap(sample.map(p=>({...p,hours:9}))).plan);
assert.ok(!recommendSwap(sample.filter(p=>p.group!=='D')).plan);
assert.deepEqual([...movementPolicy(sample,{lockedGroups:['C','D']}).locked],['C','D']);
const balanced=sample.map(p=>({...p,containers:200,eff:20}));assert.equal(movementPolicy(balanced).movable.size,0);assert.ok(!recommendSwap(balanced).plan);
assert.match(html,/dispatchGroupSettings/);
console.log('PASS high efficiency groups locked including low individuals; six-person and three-person plans; per-group selection counts; lower efficiency candidate selection; protected destinations; staffing and totals preserved; invalid and infeasible counts');

const zeroRows=build([r('1',0,10)]),zero=zeroRows.find(p=>p.empId==='1');assert.equal(zero.eff,0);assert.equal(zero.eligible,false);assert.equal(zero.hours,0);assert.equal(zero.zeroHours,10);assert.equal(summarize(zeroRows).groups[0].eff,null);assert.equal(summarize(zeroRows).groups[0].hours,0);assert.ok(!movementPolicy(zeroRows,{lockedGroups:[]}).movable.has(zero.key));
const mixedZero=build([r('1',100,5),r('1',0,10)]).find(p=>p.empId==='1');assert.equal(mixedZero.eff,20);assert.equal(mixedZero.hours,5);assert.equal(mixedZero.zeroRecords,1);
const sampleWithZero=[...sample,{...person('zero','A',0),eff:0,eligible:true}];assert.deepEqual(summarize(sampleWithZero).groups.map(g=>g.eff),summarize(sample).groups.map(g=>g.eff));assert.ok(!movementPolicy(sampleWithZero,{lockedGroups:[]}).movable.has('zero'));
console.log('PASS zero-efficiency people excluded from group averages and transfers; zero-efficiency records and their hours excluded from monthly efficiency; raw records unchanged');

const noGain=[person('n1','A',100),person('n2','B',200),person('n3','C',300),person('n4','D',400)];
const settings={lockedGroups:[],counts:{A:1,B:1,C:1,D:1}};
assert.ok(!recommendSwap(noGain,settings).plan);
const preview=recommendSwap(noGain,{...settings,allowNonImproving:true});assert.ok(preview.plan);assert.equal(preview.recommended,false);assert.equal(preview.moves.length,4);assert.ok(preview.warning);assert.ok(preview.moves.every(m=>m.from!==m.to));
assert.ok(!recommendSwap(noGain,{lockedGroups:['A','B','C','D'],allowNonImproving:true}).plan);
assert.match(html,/dispatchGenerateButton/);assert.match(html,/dispatchConfirmState/);
console.log('PASS feasible non-improving plans available as clearly warned previews; impossible settings remain blocked; explicit generate and confirmation controls wired');
