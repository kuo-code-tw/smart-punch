'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const restoreCode=fs.readFileSync('assets/port79-schedule-punch-restore.js','utf8');
const schedule=fs.readFileSync('schedule/index.html','utf8');
const evidence=fs.readFileSync('assets/port79-schedule-rest-evidence.js','utf8');
new vm.Script(restoreCode);new vm.Script(evidence);
const ctx={window:{P79AttendanceV6:{normalizeTime:x=>String(x||'')}},Date,console};
vm.createContext(ctx);vm.runInContext(restoreCode,ctx);
const api=ctx.window.P79SchedulePunchRestore;
const inside={timeStr:'2026/10/11 15:33:00'},outside={timeStr:'2026/10/11 17:59:00'};
assert.equal(api.shiftFromClockIn(inside,outside),null,'under 3h may not cause automatic full roster rewrite');
const value=api.displayShiftFromClockIn(inside,outside);
assert.equal(value.shift,'中','15:33 belongs to middle shift');
assert.equal(Math.round((value.end-value.start)/60000),146,'must preserve 2h26m worked duration');
assert.equal(api.displayShiftFromClockIn(inside,{timeStr:'2026/10/11 15:33:00'}),null,'a zero-length pair is not attendance');
const begin=schedule.indexOf('    function p79ScheduleDisplayDay('),end=schedule.indexOf('\n    }',begin);
assert(begin>0&&end>begin,'daily display function available');
const roster={'2026-10-11':'休'},meta={'2026-10-11':{restCategory:'例',restAllocationSource:'auto-v1'}};
const testCtx={
 p79EmployeeDateEligible:()=>true,monthlyScheduleData:{E1:roster},monthlyScheduleMeta:{E1:meta},
 approvedLeaveForEmployee:()=>null,p79ScheduleHasVerifiedPunch:()=>true,
 p79ScheduleDisplayContext:()=>({
  automaticRestMeta:meta,restBalance:{ledger:[]},
  attendanceEvidence:{complete:true,actualShifts:{'E1|2026-10-11':'中'},actualWorkedMinutes:{'E1|2026-10-11':146}},
  attendanceSnapshot:{attendanceEvidence:{complete:true}},
  typhoonDays:new Set(),electionDays:new Set(),typhoonToday:'2026-10-28'
 }),
 p79ScheduleNoPunchRest:()=>false,p79LeaveCoverOnDay:()=>[],p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',p79ScheduleSpecialNoPunchCode:()=>'',p79VisibleRestKind:()=>'',p79ConfirmedRestOvertime:()=>false,
 window:{P79RestAttendance:{state:()=> 'worked'}}
};
const fn=new Function(...Object.keys(testCtx),schedule.slice(begin,end+6)+';return p79ScheduleDisplayDay')(...Object.values(testCtx));
const display=fn({id:'E1',name:'李家和'},'2026-10-11');
assert.equal(display.shownShift,'中','date cell displays real middle shift');
assert.equal(display.shortWorkMinutes,146,'short duration labeled separately');
assert.equal(display.visibleRestKind,'','actual attendance not counted as visible rest day');
assert.equal(roster['2026-10-11'],'休','original statutory classification stays intact');
assert(schedule.includes('displayShiftFromClockIn(row.clockIn,row.clockOut)'),'cloud evidence uses short-pair display resolver');
assert(!schedule.includes('・已出勤</span>'),'legacy status-only badge removed');
console.log('PASS: 10/11 15:33-17:59 displays 中 and short attendance, with no false 8h roster write');
