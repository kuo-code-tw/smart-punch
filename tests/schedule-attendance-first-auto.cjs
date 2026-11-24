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
 // Exercise actual production cell selection with the real attendance evidence.
 const extract=name=>{const a=html.indexOf('    function '+name+'('),b=html.indexOf('\n    }',a);assert(a>=0&&b>a,name);return html.slice(a,b+6);};
 Object.assign(ctx,{monthlyScheduleData:Object.fromEntries(schedule.map(r=>[r.empId,r.schedule])),monthlyScheduleMeta:{},p79EmployeeDateEligible:()=>true,approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',p79ScheduleSpecialNoPunchCode:()=>'',scheduleTaipeiTodayKey:()=> '2026-10-27',p79ScheduleRestClient:()=>({status:()=>({evidence})})});
 for(const name of ['p79ScheduleHasVerifiedPunch','p79VisibleRestKind','p79ScheduleNoPunchRest','p79ScheduleDisplayDay'])vm.runInContext(extract(name),ctx);
 const render=(emp,day,ev=evidence)=>ctx.p79ScheduleDisplayDay(emp,day,{automaticRestMeta:{},restBalance:{ledger:[]},attendanceEvidence:ev,attendanceSnapshot:{attendanceEvidence:ev},typhoonDays:new Set(),electionDays:new Set(),typhoonToday:'2026-10-27'});
 assert.equal(render(people[0],'2026-10-24').visibleCode,'早');
 assert.equal(render(people[0],'2026-10-25').visibleCode,'中');
 assert.equal(render(people[0],'2026-10-24').visibleRestKind,'','actual work never counts as taken rest');
 assert.equal(render(people[0],'2026-10-24',{...evidence,actualShifts:{}}).visibleCode,'已出勤','paired short work with unresolved shift displays actual attendance');
 assert.equal(render(people[1],'2026-10-24').visibleCode,'打卡待核','single punch on a rest day is pending, not confirmed rest');
 assert.equal(render(people[1],'2026-10-24',{complete:false,days:{}}).visibleCode,'休','unread attendance does not invent missing punches');
 assert.equal(ctx.monthlyScheduleData.E1['2026-10-24'],'休','display does not overwrite source roster');
 assert(html.includes('allowUnmarked:true'),'legacy incorrect roster fixed automatically, not by manual button');
 assert(!html.includes('補卡後修正排班'),'manual button removed');
 assert(!html.includes('p79RecheckCorrectedAttendance'),'manual workflow removed');
 console.log('PASS actual work shift override 10/24 and 10/25; paired night-out, pending punch guard, rest quota and automatic reconciliation');
})().catch(e=>{console.error(e);process.exitCode=1;});
