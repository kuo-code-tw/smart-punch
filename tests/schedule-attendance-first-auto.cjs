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
 assert(html.includes("const shiftVal=noPunchRest?'休':actualShift||((verifiedRestAttendance||pairedWork&&rosterShift==='待排班')?'已出勤':rosterShift);"),'complete paired short work displays 已出勤');
 assert(html.includes("visibleRestKind:(actualShift||verifiedRestAttendance)?''"),'actual worked day not counted as used rest');
 assert(html.includes('punchShifts?.[String(emp.id).trim().toUpperCase()+\'|\'+date]'),'summary skips proven work as taken rest');
 assert(html.includes('allowUnmarked:true'),'legacy incorrect roster fixed automatically, not by manual button');
 assert(!html.includes('補卡後修正排班'),'manual button removed');
 assert(!html.includes('p79RecheckCorrectedAttendance'),'manual workflow removed');
 console.log('PASS actual work shift override 10/24 and 10/25; paired night-out, pending punch guard, rest quota and automatic reconciliation');
})().catch(e=>{console.error(e);process.exitCode=1;});
