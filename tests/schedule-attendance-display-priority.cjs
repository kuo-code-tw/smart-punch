'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('schedule/index.html','utf8');
const start=html.indexOf('    function p79ScheduleDisplayDay(emp,dayStr,context=null) {');
const end=html.indexOf('    // On-demand full staff check',start);
assert(start>=0&&end>start,'schedule day resolver must exist');
const source=html.slice(start,end);
const roster={E1:{'2026-10-30':'早'}};
const meta={E1:{'2026-10-30':{manualRosterShift:'早'}}};
let approvedLeave=null,covered=false;
const env={
 p79EmployeeDateEligible:()=>true,p79ScheduleDisplayContext:()=>{},
 monthlyScheduleData:roster,monthlyScheduleMeta:meta,
 approvedLeaveForEmployee:()=>approvedLeave,
 window:{P79RestAttendance:{state:()=> 'worked'}},
 p79ScheduleHasVerifiedPunch:()=>true,
 p79LeaveCoverOnDay:()=>covered?[{kind:'worker',data:{}}]:[],
 p79ConfirmedOvertimeReport:()=>false,p79ScheduleNoPunchRest:()=>false,
 scheduleTaipeiTodayKey:()=> '2026-11-01',
 p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=> '',
 p79ScheduleLeaveExportCode:()=> '年',scheduleLeaveTypeText:()=> '年',
 p79ScheduleSpecialNoPunchCode:()=>'',p79VisibleRestKind:()=> ''
};
const display=Function('env','with(env){'+source+';return p79ScheduleDisplayDay}')(env);
const context=(candidate)=>({
 automaticRestMeta:{},restBalance:{ledger:[]},
 attendanceEvidence:{complete:true,actualShifts:candidate?{'E1|2026-10-30':candidate}:{},actualWorkedMinutes:{'E1|2026-10-30':85}},
 attendanceSnapshot:{attendanceEvidence:{complete:true}},
 typhoonDays:new Set(),electionDays:new Set(),typhoonToday:'2026-11-01'
});
const employee={id:'E1'};
let result=display(employee,'2026-10-30',context('晚'));
assert.equal(result.visibleCode,'晚','official complete night attendance must beat stale manually tagged early shift');
assert.equal(result.attendanceRosterConflict,true);
assert.equal(result.shiftSource,'已配對正式考勤推定');
assert.equal(roster.E1['2026-10-30'],'早','official saved roster must not be overwritten by display rendering');
assert.equal(meta.E1['2026-10-30'].manualRosterShift,'早');
result=display(employee,'2026-10-30',context(''));
assert.equal(result.visibleCode,'早','unknown actual shift must not fabricate a night shift');
assert.equal(result.shiftSource,'原始儲存班表');
result=display(employee,'2026-10-30',context('早'));
assert.equal(result.visibleCode,'早','genuine paired early shift must remain early');
assert.equal(result.attendanceRosterConflict,false);
approvedLeave={leaveType:'年'};
result=display(employee,'2026-10-30',context('晚'));
assert.equal(result.visibleCode,'年','approved leave retains its own legal status');
approvedLeave=null;covered=true;
result=display(employee,'2026-10-30',context('晚'));
assert.equal(result.actualShift,'','covered shift remains protected from overwrite');
assert.equal(roster.E1['2026-10-30'],'早');
assert(html.includes("attendanceRosterConflict?'<span"),'a conflict should be visible without changing saved roster');
console.log('PASS: verified night wins display; saved roster untouched; unknown/real early, leave and cover stay safe');
