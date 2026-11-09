'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c={window:null,Date,Intl,console};c.window=c;vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/port79-rest-attendance.js','utf8'),c);
const ts=x=>Date.parse(x+'+08:00'),id='AP0870085',day='2026-10-31';
const build=(shift,sessions)=>c.P79RestAttendance.build({
 complete:true,month:'2026-10',now:ts('2026-11-01T13:00:00'),
 schedules:[{empId:id,schedule:{'2026-10-30':'早',[day]:shift}}],
 sessions:sessions.map(x=>({empId:id,...x}))
});
for(const session of [
 {start:ts('2026-11-01T07:31:00'),end:null},
 {start:null,end:ts('2026-11-01T07:31:00')},
 {start:ts('2026-11-01T07:31:00'),end:ts('2026-11-01T15:45:00')}
]){
 const snapshot=build('休',[session]);
 assert.equal(snapshot.days[id+'|'+day].state,'rest','11/1 morning punch may not turn 10/31 rest into a missing punch');
}
assert.equal(build('休',[]).days[id+'|'+day].state,'rest');
assert.equal(build('早',[]).days[id+'|'+day].state,'rest','a completed 10/31 early shift with no punches is absence');
assert.equal(build('晚',[{start:null,end:ts('2026-11-01T07:40:00')}]).days[id+'|'+day].state,'missing',
 'real night-shift incomplete checkout remains unresolved across midnight');
assert.equal(build('晚',[{start:ts('2026-10-31T23:45:00'),end:ts('2026-11-01T07:40:00')}]).days[id+'|'+day].state,'worked',
 'real paired overnight shift remains attendance');
const html=fs.readFileSync('schedule/index.html','utf8');
const begin=html.indexOf('function p79ScheduleDisplayDay('),end=html.indexOf('// On-demand full staff check',begin);
assert(begin>=0&&end>begin);
let checkedAbsence={complete:false,absenceAuditReady:false,absenceConfirmedDays:{},days:{}};
const mock={
 window:{P79RestAttendance:{state:()=> 'missing'}}, p79EmployeeDateEligible:()=>true,
 p79ScheduleRestClient:()=>({status:()=>({evidence:checkedAbsence})}),
 monthlyScheduleData:{[id]:{[day]:'休'}},monthlyScheduleMeta:{[id]:{[day]:{restCategory:'休'}}},
 approvedLeaveForEmployee:()=>null,p79ScheduleHasVerifiedPunch:()=>false,
 p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=> '',
 p79LeaveCoverOnDay:()=>[], p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=> '',
 p79ScheduleSpecialNoPunchCode:()=>'',p79VisibleRestKind:(v)=>/^(休|例|國)/.exec(v)?.[1]||'',
 scheduleTaipeiTodayKey:()=> '2026-11-01'
};
vm.createContext(mock);
const helperStart=html.indexOf('function p79ScheduleNoPunchRest('),
 helperEnd=html.indexOf('// Rest totals',helperStart);
assert(helperStart>=0&&helperEnd>helperStart);
vm.runInContext(html.slice(helperStart,helperEnd),mock);
vm.runInContext(html.slice(begin,end),mock);
const emp={id,name:'黃亦輝'};
function render(state,complete,shift,worked){
 mock.monthlyScheduleData[id][day]=shift;
 mock.window.P79RestAttendance.state=()=>state;
 mock.p79ScheduleHasVerifiedPunch=()=>worked;
 checkedAbsence={complete,absenceAuditReady:complete,
  absenceConfirmedDays:complete&&state==='rest'?{[id+'|'+day]:true}:{},
  days:{[id+'|'+day]:{state}}};
 const ctx={automaticRestMeta:{},restBalance:{ledger:[]},attendanceEvidence:{complete},
 attendanceSnapshot:{attendanceEvidence:{complete}},typhoonDays:new Set(),
 electionDays:new Set(),typhoonToday:'2026-11-01'};
 return mock.p79ScheduleDisplayDay(emp,day,ctx);
}
assert.equal(render('missing',true,'休',false).visibleCode,'休','original rest survives an unrelated next-day single punch');
assert.equal(render('unknown',false,'休',false).visibleCode,'休','a known scheduled rest survives historical read unavailability');
assert.equal(render('missing',true,'早',false).visibleCode,'打卡待核','lone real scheduled-work punch still needs reconciliation');
assert.equal(render('unknown',false,'早',false).visibleCode,'打卡待核','no official evidence is not fabricated as a rest');
assert.equal(render('rest',true,'早',false).visibleCode,'休','confirmed no-card workday becomes rest');
assert.equal(render('worked',true,'休',true).visibleCode,'已出勤','complete punches override a scheduled rest');
assert.match(html,/row\[String\(d\)\]=p79ScheduleExcelShiftCode\(selected\.visibleCode\)/,'Excel must map the same selected day to time notation');
console.log('PASS October 31 false pending: real 11/1 07:31 scenario, REST precedence, true night shift, uncertain punches, and export');
