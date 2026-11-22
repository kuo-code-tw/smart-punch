const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const engine=require('../attendance/v6-engine.js');
const html=fs.readFileSync('schedule/index.html','utf8');
const ctx={window:{P79AttendanceV6:engine},Date,Map,Set,Promise,Intl,console};
vm.createContext(ctx);
for(const file of ['assets/port79-schedule-punch-restore.js','assets/port79-rest-attendance.js','assets/port79-schedule-rest-evidence.js'])
 vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
const people=[{id:'E1',attNo:'0011',company:'甲',group:'C'},{id:'E2',attNo:'0012',company:'乙',group:'D'}];
const date='2026-10',records=[
 {id:'E1-IN24',empId:'E1',attNo:'0011',timeStr:'2026/10/24 08:05:00',status:'上班簽到'},
 {id:'E1-OUT24',empId:'E1',attNo:'0011',timeStr:'2026/10/24 16:05:00',status:'下班簽退'},
 {id:'E1-IN25',empId:'E1',attNo:'0011',timeStr:'2026/10/25 16:06:00',status:'上班簽到'},
 {id:'E1-OUT25',empId:'E1',attNo:'0011',timeStr:'2026/10/26 00:06:00',status:'下班簽退'},
 {id:'E2-IN24',empId:'E2',attNo:'0012',timeStr:'2026/10/24 08:04:00',status:'上班簽到'}
];
const schedule=[{empId:'E1',schedule:{'2026-10-24':'休','2026-10-25':'休'}},{empId:'E2',schedule:{'2026-10-24':'休'}}];
const parse=record=>Date.parse(record.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00');
const client=ctx.window.P79ScheduleRestEvidence.create({
 now:()=>Date.parse('2026-10-27T18:00:00+08:00'),token:()=> 'TEST',employees:()=>people,schedules:()=>schedule,
 buildShifts:engine.buildShifts,timestamp:parse,leaveDates:()=>[],
 shiftForSession:row=>ctx.window.P79SchedulePunchRestore.shiftFromClockIn(row.clockIn,row.clockOut),
 read:async month=>({ok:true,month,records:month===date?records:[]}),update:()=>{}
});
(async()=>{
 const evidence=await client.refresh(date);
 assert.equal(evidence.complete,true);
 assert.equal(evidence.actualShifts['E1|2026-10-24'],'早','Saturday complete punch overrides stale rest');
 assert.equal(evidence.actualShifts['E1|2026-10-25'],'中','Sunday cross-midnight OUT yields Sunday work shift');
 assert.equal(evidence.actualShifts['E2|2026-10-24'],undefined,'lone punch never auto-assigns a shift');
 assert.equal(ctx.window.P79RestAttendance.state({attendanceEvidence:evidence},'E1','2026-10-24'),'worked');
 const display = html.slice(html.indexOf('    function p79ScheduleDisplayDay('),
   html.indexOf('    // On-demand full staff check'));
 Object.assign(ctx, {
  monthlyScheduleData: Object.fromEntries(schedule.map(row => [row.empId, row.schedule])),
  monthlyScheduleMeta: {},
  p79EmployeeDateEligible: () => true,
  approvedLeaveForEmployee: () => null,
  p79LeaveCoverOnDay: () => [],
  p79ScheduleHasVerifiedPunch: (id, day, source) => source.days?.[id+'|'+day]?.state === 'worked',
  p79ScheduleNoPunchRest: () => false,
  scheduleTaipeiTodayKey: () => '2026-10-27',
  p79CoverageShift: () => '',
  p79SubstituteShiftLabel: () => '',
  p79ScheduleSpecialNoPunchCode: () => '',
 });
 const restKind = html.slice(html.indexOf('    function p79VisibleRestKind('),
   html.indexOf('    function p79ScheduleDisplayDay('));
 vm.runInContext(restKind + display, ctx);
 const context = {
  automaticRestMeta: {}, restBalance: {}, typhoonDays: new Set(), electionDays: new Set(),
  attendanceSnapshot: {attendanceEvidence: evidence}, attendanceEvidence: evidence,
 };
 for (const [person, day, code] of [
  [people[0], '2026-10-24', '早'],
  [people[0], '2026-10-25', '中'],
  [people[1], '2026-10-24', '打卡待核'],
 ]) {
  const cell = ctx.p79ScheduleDisplayDay(person, day, context);
  assert.equal(cell.visibleCode, code, person.id+' '+day);
  assert.equal(cell.visibleRestKind, '', 'attendance must exclude the date from visible rest counts');
  assert.equal(ctx.monthlyScheduleData[person.id][day], '休', 'display must preserve the stored roster');
 }
 const noShiftEvidence = {...evidence, actualShifts: {}};
 const shortWork = ctx.p79ScheduleDisplayDay(people[0], '2026-10-24',
  {...context, attendanceEvidence: noShiftEvidence, attendanceSnapshot: {attendanceEvidence: noShiftEvidence}});
 assert.equal(shortWork.visibleCode, '已出勤', 'paired attendance with no inferred shift');
 const unverified = ctx.p79ScheduleDisplayDay(people[1], '2026-10-24',
  {...context, attendanceEvidence: {complete: false}, attendanceSnapshot: {}});
 assert.equal(unverified.visibleCode, '休', 'unfinished attendance reads must preserve the roster display');
 assert(html.includes('allowUnmarked:true'),'legacy incorrect roster fixed automatically, not by manual button');
 assert(!html.includes('補卡後修正排班'),'manual button removed');
 assert(!html.includes('p79RecheckCorrectedAttendance'),'manual workflow removed');
 console.log('PASS actual work shift override 10/24 and 10/25; paired night-out, pending punch guard, rest quota and automatic reconciliation');
})().catch(e=>{console.error(e);process.exitCode=1;});
