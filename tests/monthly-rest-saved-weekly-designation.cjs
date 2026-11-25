'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:null,Date,Intl:{DateTimeFormat:function(){return {format:()=>'2026-11-25'};}},crypto:require('node:crypto').webcrypto};
context.window=context;
context.p79MonthlyRestContext={employmentStart:()=>""};
vm.createContext(context);
for(const name of ['rest-allocation','rest-attendance','monthly-rest-overtime']){
 vm.runInContext(fs.readFileSync('assets/port79-'+name+'.js','utf8'),context);
}
const api=context.P79MonthlyRest;
const emp={empId:'TEST',name:'測試員工',weeklyCycleStart:'2026-11-23'};
const week=start=>Object.fromEntries(Array.from({length:7},(_,i)=>[
 new Date(Date.parse(start+'T00:00:00Z')+i*86400000).toISOString().slice(0,10),'早'
]));
const example={restAllocationSource:'auto-v1',restCategory:'例',restQuotaOvertime:false};
const roster={...week('2026-11-23'),'2026-11-26':'休','2026-11-29':'休',
 __meta:{'2026-11-29':{manualRosterShift:'休',...example}}};
assert.equal(api.futureRestPlanIssue(roster,'2026-11-26','2026-11',emp,'休'),'');
assert.match(api.futureRestPlanIssue(roster,'2026-11-29','2026-11',emp,'休'),/假別/);
assert.match(api.weeklyPlanIssue({...roster,'2026-11-29':'早'},'2026-11-26',emp.weeklyCycleStart),/無受保護/);
assert.match(api.weeklyPlanIssue({...roster,'2026-11-26':'早'},'2026-11-29',emp.weeklyCycleStart),/無原排休息日/);
for(const state of ['worked','missing']){
 const snapshot={attendanceEvidence:{complete:true,days:{'TEST|2026-11-29':{state}}}};
 assert.match(api.futureRestPlanIssue(roster,'2026-11-26','2026-11',emp,'休',snapshot),/無受保護/);
}
const next=week('2026-11-30');
delete next['2026-11-30'];
next['2026-12-06']='休';
next.__meta={'2026-12-06':example};
const november={...roster,'2026-11-30':'休'};
const snapshot={schedules:[{empId:'TEST',schedule:november}],adjacentSchedules:[{empId:'TEST',schedule:next}]};
assert.match(api.futureRestPlanIssue(november,'2026-11-30','2026-11',emp,'休'),/缺少正式班表 2026-12-01/);
const merged=api.weeklyRoster(snapshot,'TEST',november);
assert.equal(api.futureRestPlanIssue(merged,'2026-11-30','2026-11',emp,'休'),'');
assert.equal(api.weeklyReviewSummary(snapshot,[emp],'2026-11').find(w=>w.start==='2026-11-30').missing,0);
const monthly=Object.fromEntries(Array.from({length:30},(_,i)=>[
 '2026-11-'+String(i+1).padStart(2,'0'),'早'
]));
Object.assign(monthly,november);
monthly.__meta={...november.__meta,
 '2026-11-26':{overtimeStart:'08',overtimeEnd:'16'},
 '2026-11-30':{overtimeStart:'08',overtimeEnd:'16'}};
const fresh={...snapshot,schedules:[{empId:'TEST',schedule:monthly}],
 attendanceEvidence:{complete:true,days:{}},pairs:[]};
const rule=['休','休08-16',8,8,'','','08','16','full'];
const planned=api.plan(fresh,[emp],'2026-11',[rule]);
assert.deepEqual(Array.from(planned.plannedRows,r=>r.date),['2026-11-26','2026-11-27','2026-11-28','2026-11-30']);
const withoutProtectedRest={...monthly,'2026-11-29':'早',__meta:{...monthly.__meta}};
delete withoutProtectedRest.__meta['2026-11-29'];
const warningSnapshot={...fresh,schedules:[{empId:'TEST',schedule:withoutProtectedRest}]};
const warned=api.plan(warningSnapshot,[emp],'2026-11',[rule]);
assert(warned.plannedRows.some(r=>r.date==='2026-11-27'&&r.needsWeeklyReview));
assert.equal(api.manualRestPlanIssue(warningSnapshot,emp,'2026-11','2026-11-27',rule,'2026-11-25'),'',
 'a missing protected weekly rest day remains a warning when saving a preplan');
assert.equal(planned.rows.length,0,'future plans must never appear as formal applications');
const requested=planned.plannedRows.map(r=>({...r,date:'2026-11-27'})).slice(0,1);
assert.equal(api.rematchSelectedRestCandidates(requested,planned.plannedRows).matched.length,1);
console.log('PASS saved regular rest designation, adjacent roster, invalid rest evidence and batch rematching');
