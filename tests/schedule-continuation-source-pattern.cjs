const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const c={console,Date,Map,Set,JSON,String,Array,Object};vm.createContext(c);vm.runInContext(fs.readFileSync('assets/port79-schedule-continuation.js','utf8'),c);
const people=[{empId:'E1',name:'甲'},{empId:'E2',name:'乙'}],pattern=['早','早','早','早','休','休'];
const schedule=Object.fromEntries(Array.from({length:31},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),pattern[i%6]]));
schedule.__personnel={group:'C組'};
const fixed=Object.fromEntries(Array.from({length:31},(_,i)=>['2026-10-'+String(i+1).padStart(2,'0'),'早']));
const source={schedules:[{empId:'E1',month:'2026-10',schedule},{empId:'E2',month:'2026-10',schedule:fixed}],leaveRecords:[],leaveCoverAssignments:[]};
const target={schedules:[{empId:'E1',month:'2026-11',schedule:{'2026-11-02':'年'}}],leaveRecords:[],leaveCoverAssignments:[]};
function plan(rule){return c.P79ScheduleContinuation.buildPlan({sourceMonth:'2026-10',targetMonth:'2026-11',source,target,people,rule,eligible:()=>true});}
const before=JSON.stringify(source),p=plan({algo:'INVALID',counts:[]});
assert.equal(p.changes.length,59);assert.equal(p.rows.find(r=>r.empId==='E1').schedule['2026-11-01'],pattern[31%6]);assert.equal(p.rows.find(r=>r.empId==='E1').schedule['2026-11-02'],'年');assert(p.rows.find(r=>r.empId==='E2').schedule['2026-11-30']==='早');
assert.equal(JSON.stringify(plan({algo:'FOUR_TWO'}).changes),JSON.stringify(p.changes),'configured rule has no effect');
assert.equal(JSON.stringify(source),before,'source remains unchanged');
schedule['2026-10-15']='年';source.leaveRecords=[{empId:'E1',status:'已核准',startDate:'2026-10-15',endDate:'2026-10-15'}];
assert.equal(plan({}).summaries[0].added,29,'leave exception does not become a cycle shift');
for(let i=1;i<=31;i++)delete schedule['2026-10-'+String(i).padStart(2,'0')];
schedule['2026-10-31']='早';assert.equal(plan({}).summaries[0].added,0,'insufficient source pattern must not invent a roster');
console.log('PASS per-person source cycles, ignored UI rules, continuous month boundary, preserved target and group, leave exceptions and insufficient evidence');
