const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now='2026-10-14',next=0;
const g={window:null,console,Date,crypto:{randomUUID:()=>String(++next)},Intl:{DateTimeFormat:function(){return{format:()=>now}}}};
g.window=g;vm.createContext(g);
vm.runInContext(fs.readFileSync('assets/port79-rest-allocation.js','utf8'),g);
g.p79MonthlyRestContext={employmentStart:()=>''};
g.P79RestAttendance={state:()=> 'worked',isLeaveDay:()=>false};
g.P79Overtime={inferRule:(_start,_end,_date,allowed)=>allowed[0]||null};
vm.runInContext(fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),g);
const api=g.P79MonthlyRest,month='2026-10',days=Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
const roster=Object.fromEntries(days.map(d=>[d,'早']));roster.__meta={};
const emp={empId:'A',name:'測試員工'},rules=['國','休','例'].map(cat=>[cat,cat+'08-16',8,8,'','','08','16']);
const snapshot={schedules:[{empId:'A',schedule:roster}],pairs:[16,17,25,26].map(day=>({empId:'A',date:month+'-'+day,start:'2026-10-'+day+'T08:00',end:'2026-10-'+day+'T16:00'})),leaveDates:[],attendanceEvidence:{complete:true,days:{}}};
const json=x=>JSON.parse(JSON.stringify(x));
const before=JSON.stringify(snapshot);
for(const [date,phase,canSuggest,canSubmit] of [
 ['2026-10-01','audit',false,false],['2026-10-14','audit',false,false],['2026-10-15','preview',true,false],
 ['2026-10-24','preview',true,false],['2026-10-25','submit',true,true],['2026-10-31','submit',true,true],
 ['2026-11-01','closing',true,true]
]){
 const w=api.workflowStage(month,date);
 assert.equal(w.key,phase,date);
 assert.equal(w.canSuggest,canSuggest,date);
 assert.equal(w.canSubmit,canSubmit,date);
}
assert.equal(api.workflowStage('2026-11','2026-10-26').key,'audit','Future months must not auto-create payable work');
assert.equal(api.workflowStage('2026-09','2026-10-26').key,'closing','Past months enter closing review');
now='2026-10-14';
let model=api.plan(snapshot,[emp],month,rules);
assert.equal(model.rows.length,0,'Before the 15th only audit the monthly quota; do not manufacture suggested dates');
assert(model.balances.length===1,'Early audit still reads and computes the actual existing rest ledger');
assert.equal(model.workflow.key,'audit');
now='2026-10-20';
model=api.plan(snapshot,[emp],month,rules);
assert.equal(model.workflow.key,'preview');
assert.equal(model.rows.length,0,'Before the 25th no formal month-end overtime should be offered');
assert(model.rows.every(x=>x.rule[2]===8),'Suggested hours originate from configured overtime rules');
assert(model.rows.every(x=>!x.planned&&x.date<='2026-10-20'),'Future work cannot appear in actual eight-hour suggestions');
const audit=api.workflowAudit(model);
assert(audit.people.length===1 && audit.shortage.例>=0 && audit.shortage.休>=0 && audit.shortage.國>=0);
now='2026-10-26';
const active=api.plan(snapshot,[emp],month,rules);
assert.equal(active.workflow.key,'submit');
assert(active.rows.every(x=>!x.planned&&x.date>='2026-10-25'),'Only completed actual month-end work appears as formal overtime');
assert(active.rows.every(x=>!x.planned&&x.date<='2026-10-26'),'Future or unworked dates cannot be listed');
assert.equal(JSON.stringify(snapshot),before,'Reading and planning may never mutate original roster, punches or reports');
const source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
assert(source.includes("q('#mrLoad').click()"),'Opening monthly-rest dialog should automatically refresh read-only audit');
assert(source.includes("autoPlan?!selectedPlans.length:!phase.canSubmit||"),'The save control is unavailable until the 25th');
assert(source.includes("if(selected.some(r=>r.planned||r.date>today()))"),'No future or planned dates can be submitted');
assert(source.includes("attendance.length!==1"),'Save must re-read and require one complete attendance pair');
assert(source.includes("JSON.stringify(latestRule)!==JSON.stringify(r.rule)"),'Save must match existing system overtime rule exactly');
assert(source.includes("selected.some(r=>r.category==='例')&&!confirm"),'Rest-day legal-exception review must be explicit');
assert(!/q\('#mrLoad'\)\.click\(\);\s*q\('#mrSave'\)\.click/.test(source),'Daily auto audit may never auto-submit');
assert(fs.readFileSync('work-hours/index.html','utf8').includes('port79-monthly-rest-overtime.js?v=20261028-forward-from-today-v5'));
console.log(JSON.stringify({passed:21,failed:0,scope:'Monthly rest workflow boundaries, open-only read, real configured overtime hours, actual vs planned, legal review, readback and source record integrity'}));
