const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {buildMonth,summarize}=require('../assets/port79-personnel-dispatch.js');
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
