'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('schedule/index.html','utf8');
function functionSource(name,next){
  const start=html.indexOf('    function '+name+'(');
  assert(start>=0,'missing '+name);
  const end=html.indexOf(next,start);
  assert(end>start,'missing next boundary for '+name);
  return html.slice(start,end);
}
const getNoPunch=functionSource('p79ScheduleNoPunchRest','    // Rest totals must');
const getResolver=functionSource('p79ScheduleDisplayDay','    // On-demand full staff check');
const original={E1:{'2026-10-01':'早','2026-10-30':'晚'}};
const meta={E1:{}};
const env={
 p79EmployeeDateEligible:()=>true,p79ScheduleDisplayContext:()=>{},
 monthlyScheduleData:original,monthlyScheduleMeta:meta,
 approvedLeaveForEmployee:()=>null,
 window:{P79RestAttendance:{state:()=> 'rest'}},
 p79ScheduleHasVerifiedPunch:()=>false,
 p79LeaveCoverOnDay:()=>[],p79ConfirmedOvertimeReport:()=>false,
 scheduleTaipeiTodayKey:()=> '2026-11-01',
 p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=> '',
 p79ScheduleLeaveExportCode:()=> '',scheduleLeaveTypeText:()=> '',
 p79ScheduleSpecialNoPunchCode:()=>'',p79VisibleRestKind:()=> ''
};
const get=Function('env','with(env){'+getNoPunch+getResolver+';return {noPunch:p79ScheduleNoPunchRest,day:p79ScheduleDisplayDay}}')(env);
const ctx={automaticRestMeta:{},restBalance:{ledger:[]},attendanceEvidence:{complete:true,days:{}},
 attendanceSnapshot:{attendanceEvidence:{complete:true,days:{}}},typhoonDays:new Set(),electionDays:new Set(),typhoonToday:'2026-11-01'};
assert.equal(get.noPunch('E1','2026-10-01','早',{},null,'rest'),false,'no raw punches may not rewrite scheduled early to rest');
assert.equal(get.day({id:'E1'},'2026-10-01',ctx).visibleCode,'早','October first must retain the saved early shift');
assert.equal(get.day({id:'E1'},'2026-10-30',ctx).visibleCode,'晚','October thirtieth must retain the saved night shift');
assert.equal(original.E1['2026-10-01'],'早');
assert.equal(original.E1['2026-10-30'],'晚');
assert(html.includes('function p79QueueScheduleNoPunchReconcile(yearMonth){\n      // EMERGENCY HOLD'),'background autosave hold is mandatory');
assert(html.includes('function p79ApplyAutomaticRestMetadata() {\n      // EMERGENCY HOLD'),'implicit quota assignment must be stopped');
assert(html.includes("if(yearMonth==='2026-10'){"),'October full-month save guard is mandatory');
console.log('PASS emergency: no mass rest, preserve cloud early/night shifts, stop auto overwrite and October bulk save');
