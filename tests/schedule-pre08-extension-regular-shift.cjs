'use strict';
// Huang Xin-Xing pattern: 11/07 extension 04–08 remains on the 7th,
// 11/08 03:38–15:53 spans extension 04–08 and regular 08–16.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('schedule/index.html','utf8');
const engine=require('../attendance/v6-engine.js');
const restore=Function('engine','const window={P79AttendanceV6:engine};let module={exports:{}};'+
  fs.readFileSync('assets/port79-schedule-punch-restore.js','utf8')+';return module.exports;')(engine);
const date7='2026-11-07',date8='2026-11-08',empId='E1';
const punch=(date,time,type)=>({id:date+time+type,empId,attNo:'465',
  timeStr:date.replaceAll('-','/')+' '+time,status:type==='IN'?'上班簽到':'下班簽退'});
const inRec=punch(date8,'03:38:00','IN'),outRec=punch(date8,'15:53:00','OUT');
const paired=engine.buildShifts([inRec,outRec]).filter(r=>r.clockIn&&r.clockOut);
assert.equal(paired.length,1,'03:38–15:53 is a complete official pair');
const actual=restore.displayShiftFromClockIn(paired[0].clockIn,paired[0].clockOut);
assert.equal(actual.date,date8,'normal day shift belongs to November 8, not November 7');
assert.equal(actual.shift,'早','08–16 regular shift is detected even with 04–08 preceding overtime');
assert.equal(Math.round((actual.end-actual.start)/60000),735,'raw 12h15 duration is retained');
assert.equal(restore.shiftFromClockIn(inRec,outRec).shift,'早','automatic restoration uses identical time range');
const standalone=restore.displayShiftFromClockIn(inRec,punch(date8,'07:58:00','OUT'));
assert.notEqual(standalone?.shift,'早','standalone 04–08 must not manufacture regular 08–16');
assert.equal(standalone?.date,date7,'04–08-only period retains existing previous-day night attribution');
assert.equal(restore.displayShiftFromClockIn(inRec,punch(date8,'11:20:00','OUT')),null,
 'an early short session cannot fabricate a completed regular shift');
assert.equal(restore.displayShiftFromClockIn(punch(date7,'23:36:00','IN'),punch(date8,'07:57:00','OUT')).shift,'晚',
 'valid prior-night shift must remain night');
assert.equal(restore.displayShiftFromClockIn(punch(date8,'00:06:00','IN'),punch(date8,'07:57:00','OUT')).date,date7,
 '00–08 complete work must still belong to the previous workday');

const meta={E1:{
 [date7]:{overtimeReport:{id:'EXT-7',category:'延',code:'延04-08',overtimeStart:'04',overtimeEnd:'08',overtimeDate:date7}},
 [date8]:{overtimeReport:{id:'EXT-8',category:'延',code:'延04-08',
  overtimeStart:'04',overtimeEnd:'08',overtimeDate:date8}}
}};
const roster={E1:{[date7]:'休',[date8]:'早'}};
const before=JSON.stringify({meta,roster});
const env={
 monthlyScheduleData:roster,monthlyScheduleMeta:meta,
 p79EmployeeDateEligible:()=>true,p79RestQuota:()=>({counts:{例:5,休:4,國:0}}),
 approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],
 p79ScheduleHasVerifiedPunch:(id,date)=>date===date8,
 p79ScheduleNoPunchRest:()=>false,p79CoverageShift:()=>'',p79ScheduleSpecialNoPunchCode:()=> '',
 p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=> '',
 p79VisibleRestKind:()=>'',scheduleTaipeiTodayKey:()=> '2026-11-09',
 window:{P79RestAttendance:{state:(snapshot,id,date)=>date===date8?'worked':'unknown'}}
};
vm.createContext(env);
const start=html.indexOf('    function p79CompactOvertimeCode(');
const end=html.indexOf('    function p79LeaveCoverBadge(',start);
assert(start>=0&&end>start);
vm.runInContext(html.slice(start,end),env);
const confirmStart=html.indexOf('    function p79ConfirmedOvertimeReport(');
const confirmEnd=html.indexOf('    function p79ConfirmedRestOvertime(',confirmStart);
vm.runInContext(html.slice(confirmStart,confirmEnd),env);
const resolveStart=html.indexOf('    function p79ScheduleDisplayDay(');
const resolveEnd=html.indexOf('    // On-demand full staff check',resolveStart);
assert(resolveStart>=0&&resolveEnd>resolveStart);
vm.runInContext(html.slice(resolveStart,resolveEnd),env);
const evidence={complete:true,actualShifts:{['E1|'+date8]:'早'},
 actualWorkedMinutes:{['E1|'+date8]:735}};
const context={automaticRestMeta:{},restBalance:{ledger:[]},attendanceEvidence:evidence,
 attendanceSnapshot:{attendanceEvidence:evidence},typhoonDays:new Set(),electionDays:new Set(),
 typhoonToday:'2026-11-09'};
const show=day=>env.p79ScheduleDisplayDay({id:empId,name:'測試指揮手'},day,context);
const d7=show(date7),d8=show(date8);
assert.equal(d7.visibleCode,'延04-08','Nov 7 confirmed extension remains untouched');
assert.equal(d7.earlyExtensionWithRegularShift,false);
assert.equal(d8.shownShift,'早','Nov 8 regular 08–16 is displayed in primary shift');
assert.equal(d8.visibleSubstituteLabel,'延04-08','Nov 8 independent overtime report stays intact');
assert.equal(d8.earlyExtensionWithRegularShift,true);
assert.equal(d8.visibleCode,'早＋延04-08','Excel and grid show both same-day components');
assert.equal(d8.visibleRestKind,'','a worked normal day must never count as rest');
assert.equal(JSON.stringify({meta,roster}),before,'display never mutates original official reports or roster');
assert(html.includes("const showMainShiftSelection=!visibleSubstituteLabel||earlyExtensionWithRegularShift"),
 'when both exist, early main shift stays selected in the day dropdown');
assert(html.includes('earlyExtensionWithRegularShift?')&&html.includes('延04-08</span>'),
 'the filed overtime is visibly shown as a second line');
assert(html.includes('row[String(d)]=selected.visibleCode'),
 'Excel uses the same both-interval day code');

// Unconfirmed/revoked/moved reports cannot create a second overtime label.
meta.E1[date8].overtimeRevocations=[{reportId:'EXT-8',confirmed:true}];
let after=show(date8);
assert.equal(after.visibleCode,'早','a revoked extension must disappear, normal shift remains');
delete meta.E1[date8].overtimeRevocations;
meta.E1[date8].overtimeReport.overtimeDate=date7;
after=show(date8);
assert.equal(after.visibleCode,'早','extension credited to Nov 7 must not be manufactured on Nov 8');
assert.equal(show(date7).visibleCode,'延04-08','a cross-credited extension stays on its correct accounting date (fixture only)');
console.log('PASS Nov7 延04-08 / Nov8 03:38-15:53 early 08-16 + 延04-08, separate dates, screen/export, source unchanged');
