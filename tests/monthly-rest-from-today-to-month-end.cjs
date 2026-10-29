'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const html=fs.readFileSync('work-hours/index.html','utf8');
let now='2026-10-28',next=0;
const g={window:null,console,Date,crypto:{randomUUID:()=>String(++next)},
 Intl:{DateTimeFormat:function(){return{format:()=>now}}}};g.window=g;
g.p79RestQuota=()=>({days:31,slots:[{category:'國',sourceDate:'2026-10-10'}]});
g.p79AllocateRestMonth=()=>({meta:{}});
g.p79MonthlyRestContext={employmentStart:()=>''};
const days=Array.from({length:31},(_,i)=>'2026-10-'+String(i+1).padStart(2,'0'));
g.P79RestAttendance={isLeaveDay:()=>false,state:(snap,id,date)=>snap.states?.[id+'|'+date]||(date>now?'open':'worked')};
g.P79Overtime={inferRule:(start,end,date,rules)=>rules[0]||null};
vm.createContext(g);vm.runInContext(source,g);
const rules=['國','休','例'].map(c=>[c,c+'08-16',8,8,'','','08','16']);
const employees=Array.from({length:16},(_,i)=>({empId:'E'+(i+1),name:'測試'+(i+1),
 dept:i<11?'F/L單位':'其他單位',jobTitle:i<11?'F/L':['ARMG','AQC','指揮手','領班','理貨'][i-11],
 companyName:i%2?'乙公司':'甲公司',groupName:i%3?'A組':'B組'}));
const start=Date.parse('2026-10-28T08:00:00+08:00');
const snap={schedules:employees.map(emp=>({empId:emp.empId,schedule:Object.fromEntries(days.map(d=>[d,'早']))})),
 pairs:[...employees.slice(0,3).map(emp=>({empId:emp.empId,date:now,start,end:start+8*3600000})),{empId:'E5',date:now,start,end:null}],
 states:{},leaveDates:[],attendanceEvidence:{complete:true,days:{}}};
const realPairs=new Set(snap.pairs.map(p=>p.empId));
for(const emp of employees)for(const date of days){
 snap.states[emp.empId+'|'+date]=date>now?'open':date===now&&emp.empId==='E4'?'open':date===now&&emp.empId==='E5'?'missing':'worked';
 if(realPairs.has(emp.empId)&&date===now)snap.attendanceEvidence.days[emp.empId+'|'+date]={state:'worked'};
}
const original=JSON.stringify(snap);
const result=g.P79MonthlyRest.plan(snap,employees,'2026-10',rules);
assert.equal(result.rows.length,0,'ordinary workdays cannot be relabeled as holiday overtime');
assert.equal(result.plannedRows.length,0,'no unconfirmed cycle or work period may create future overtime');
assert.equal(result.balances.length,16,'all companies and roles remain in quota review');
assert.equal(JSON.stringify(snap),original,'planning preserves all original source records');
assert.equal(g.P79MonthlyRest.reviewAllUnits(result,employees).staffCount,16);
// Positive control: three verified rest-day workers remain eligible on their actual date.
g.p79RestQuota=()=>({days:31,slots:[{category:'休',sourceDate:'2026-10-28'}]});
for(const row of snap.schedules)row.schedule['2026-10-28']='休';
const attended=g.P79MonthlyRest.plan(snap,employees,'2026-10',rules);
assert.equal(attended.rows.length,3);
assert(attended.rows.every(r=>r.date==='2026-10-28'&&r.category==='休'&&!r.planned));
assert.equal(attended.plannedRows.length,0,'missing and open punches cannot become confirmed work');
assert.equal(attended.balances.length,16);
assert.equal(g.P79MonthlyRest.plan(snap,employees,'2026-10',rules,{manualOnly:true}).plannedRows.length,0);
now='2026-10-29';
const later=g.P79MonthlyRest.plan(snap,employees,'2026-10',rules);
assert.equal(later.rows.length,3,'completed work stays on the original day during later review');
assert(later.rows.every(r=>r.date==='2026-10-28'));
assert(source.includes('visiblePlannedRows()'));
assert(html.includes('row.reportVerified===true')&&html.includes('!row.p79RestDraft'));
console.log('PASS 16 staff across companies/roles: no invented holidays/future work, genuine rest-day attendance, original dates and read-only planning');
