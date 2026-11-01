'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const file=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const v6=Function("let module={exports:{}};"+file('attendance/v6-engine.js')+";return module.exports;")();
const rest=Function("const window={};"+file('assets/port79-rest-attendance.js')+";return window.P79RestAttendance;")();
const shift=Function("engine","const window={P79AttendanceV6:engine};let module={exports:{}};"+file('assets/port79-schedule-punch-restore.js')+";return module.exports;")(v6);
const evidenceApi=Function("window",file('assets/port79-schedule-rest-evidence.js')+";return window.P79ScheduleRestEvidence;")({P79RestAttendance:rest});
const punch=(id,emp,time,type)=>({id,empId:emp,attNo:emp==='E1'?'1':'2',name:emp,timeStr:time,status:type==='IN'?'上班簽到':'下班簽退'});
const people=[{id:'E1',attNo:'1',name:'甲'},{id:'E2',attNo:'2',name:'乙'}];
const schedules=people.map(p=>({empId:p.id,schedule:{'2026-10-29':'晚','2026-10-30':'早'}}));
const timestamp=rec=>Date.parse(v6.normalizeTime(rec.timeStr).replace(/\//g,'-').replace(' ','T')+'+08:00');
const make=(official,reference)=>evidenceApi.create({
 token:()=> 'test',employees:()=>people,schedules:()=>schedules,
 buildShifts:records=>v6.buildShifts(records),timestamp,leaveDates:()=>[],
 shiftForSession:row=>shift.displayShiftFromClockIn(row.clockIn,row.clockOut),
 read:async month=>({
  ok:true,month,records:month==='2026-10'?official:[],
  absenceReferenceRecords:reference===null?null:month==='2026-10'?reference:[]
 }),
 update:()=>{},now:()=>Date.parse('2026-11-01T12:00:00+08:00')
});
const other=[punch('b1','E2','2026/10/30 07:38','IN'),punch('b2','E2','2026/10/30 16:00','OUT')];
const scenarios=[
 ['confirmed zero punches',other,other,'2026-10-30','rest',true],
 ['one-sided punch',[...other,punch('a1','E1','2026/10/30 07:38','IN')],[...other,punch('a1','E1','2026/10/30 07:38','IN')],'2026-10-30','missing',false],
 ['complete prior-night attendance',[...other,punch('a1','E1','2026/10/30 05:35','IN'),punch('a2','E1','2026/10/30 07:53','OUT')],[...other,punch('a1','E1','2026/10/30 05:35','IN'),punch('a2','E1','2026/10/30 07:53','OUT')],'2026-10-29','worked',false],
 ['raw feed contains unmatched punch',other,[...other,punch('a1','E1','2026/10/30 07:38','IN')],'2026-10-30','unknown',false],
 ['raw feed unavailable',other,null,'2026-10-30','unknown',false],
 ['empty month in both feeds',[],[],'2026-10-30','unknown',false]
];
const html=file('schedule/index.html');
const a=html.indexOf('    function p79ScheduleNoPunchRest(');
const b=html.indexOf('    // On-demand full staff check',a);
assert(a>=0&&b>a,'roster-day resolver available');
(async()=>{
 for(const [name,official,reference,date,expectedState,restExpected] of scenarios){
  const evidence=await make(official,reference).refresh('2026-10');
  const key='E1|'+date;
  assert.equal(evidence.days[key]?.state,expectedState,name+' attendance state');
  assert.equal(evidence.absenceConfirmedDays[key]===true,restExpected,name+' confirmed absence');
 }
 const context={automaticRestMeta:{},restBalance:{ledger:[]},typhoonDays:new Set(),
  electionDays:new Set(),typhoonToday:'2026-11-01'};
 const env={
  monthlyScheduleData:{E1:{'2026-10-30':'早'}},monthlyScheduleMeta:{E1:{}},
  approvedLeaveForEmployee:()=>null,p79EmployeeDateEligible:()=>true,
  p79ScheduleDisplayContext:()=>context,
  window:{P79RestAttendance:rest},p79ScheduleRestClient:()=>({status:()=>({evidence:context.attendanceEvidence})}),
  p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',p79LeaveCoverOnDay:()=>[],
  p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=>'',p79ScheduleSpecialNoPunchCode:()=>'',scheduleTaipeiTodayKey:()=> '2026-11-01'
 };
 const day=Function('env','with(env){'+html.slice(a,b)+';return p79ScheduleDisplayDay;}')(env);
 const cases=[
  [{complete:true,absenceAuditReady:true,absenceConfirmedDays:{'E1|2026-10-30':true},days:{'E1|2026-10-30':{state:'rest'}}},'休'],
  [{complete:true,absenceAuditReady:false,absenceConfirmedDays:{},days:{'E1|2026-10-30':{state:'unknown'}}},'早'],
  [{complete:true,absenceAuditReady:true,absenceConfirmedDays:{},days:{'E1|2026-10-30':{state:'missing'}}},'打卡待核'],
  [{complete:true,absenceAuditReady:true,absenceConfirmedDays:{},days:{'E1|2026-10-30':{state:'worked'}},actualShifts:{'E1|2026-10-30':'晚'},actualWorkedMinutes:{'E1|2026-10-30':78}},'晚']
 ];
 for(const [data,expected] of cases){
  context.attendanceEvidence=data;context.attendanceSnapshot={attendanceEvidence:data};
  assert.equal(day({id:'E1'},'2026-10-30',context).visibleCode,expected,'roster display for '+expected);
 }
 assert.equal(env.monthlyScheduleData.E1['2026-10-30'],'早','display must never rewrite cloud roster');
 assert(html.includes("if(yearMonth==='2026-10'){"),'October bulk-write safety remains enabled');
 console.log('PASS: 6 dual-source attendance scenarios and 4 roster display scenarios');
})().catch(e=>{console.error(e);process.exitCode=1});
