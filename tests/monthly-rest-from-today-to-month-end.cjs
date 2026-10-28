'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
const html=fs.readFileSync('work-hours/index.html','utf8');
let now='2026-10-28',next=0;
const g={window:null,console,Date,crypto:{randomUUID:()=>String(++next)},
 Intl:{DateTimeFormat:()=>({format:()=>now})}};g.window=g;
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
 pairs:employees.slice(0,3).map(emp=>({empId:emp.empId,date:now,start,end:start+8*3600000})),
 states:{},leaveDates:[],attendanceEvidence:{complete:true,days:{}}};
const realPairs=new Set(snap.pairs.map(p=>p.empId));
for(const emp of employees)for(const date of days){
 snap.states[emp.empId+'|'+date]=date>now?'open':date===now&&emp.empId==='E4'?'open':'worked';
 if(realPairs.has(emp.empId)&&date===now)snap.attendanceEvidence.days[emp.empId+'|'+date]={state:'worked'};
}
const original=JSON.stringify(snap);
const result=g.P79MonthlyRest.plan(snap,employees,'2026-10',rules);
assert.equal(result.rows.length,3,'Only three complete 8h punches are genuine formal candidates on Oct 28');
assert.equal(result.plannedRows.length,13,'The other thirteen people receive a today-or-future draft rather than disappearing');
assert.equal(result.rows.filter(x=>x.empId.startsWith('E')).length,3);
assert.equal(new Set([...result.rows,...result.plannedRows].map(r=>r.empId)).size,16,'All 16 staff across both companies and every role are covered');
assert.equal(result.plannedRows.filter(x=>Number(x.empId.slice(1))<=11).length,8,'All eleven F/L are accounted for: three formal, eight draft');
assert.equal(result.plannedRows.find(x=>x.empId==='E4').date,'2026-10-28','An ongoing shift may be tentatively scheduled today');
assert(result.plannedRows.filter(x=>x.empId!=='E4').every(x=>x.date==='2026-10-29'),'Unfinished staff start on the next possible day, not last day of month');
assert(result.plannedRows.every(x=>x.planned&&!x.saved&&x.status.includes('預排草案')),'Drafts never masquerade as formal reports');
assert(result.plannedRows.every(x=>x.needsWeeklyReview),'Missing weekly rest is a visible warning, not silent deletion');
assert(result.plannedRows.every(x=>x.rule[2]===8),'Uses configured 8 hour rules, does not manufacture durations');
assert(!result.rows.some(x=>x.date>now),'Future days cannot become formal reported work');
assert.equal(JSON.stringify(snap),original,'No roster, punch, leave or report source is mutated');
const stats=g.P79MonthlyRest.reviewAllUnits(result,employees);
assert.equal(stats.staffCount,16);
assert.equal(stats.ready,3);
assert.equal(stats.planned,13);
assert.equal(stats.groups.filter(x=>x.role==='F/L').reduce((n,x)=>n+x.planned,0),8);
assert(source.includes('visiblePlannedRows()'),'Drafts must appear inside the same monthly-rest dialog');
assert(source.includes("g.p79UpdateMonthlyRestPlans?.(loadedMonth,model.plannedRows||[],loadedPeople)"),'Drafts are passed to the overtime page');
assert(html.includes('if(date<todayKey||savedKeys.has('),'Overtime page includes today pending drafts');
assert(html.includes('needsWeeklyReview:row.needsWeeklyReview===true'),'Weekly review status crosses the page boundary');
assert(html.includes('preview=20261028-month-end-all-roles-v6'),'Updated script invalidates old browser cache');
now='2026-10-29';const nextDay=g.P79MonthlyRest.plan(snap,employees,'2026-10',rules);
assert(nextDay.plannedRows.every(x=>x.date>=now),'Yesterday cannot persist as a new future plan');
console.log('PASS month-end: 16 staff across companies and roles incl. 11 F/L (3 formal + 8 draft), Oct28-31, no false declarations, verified cross-page binding and latest cache');
