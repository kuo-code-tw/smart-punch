'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const engine=Function("let module={exports:{}};"+file('attendance/v6-engine.js')+";return module.exports;")();
const rest=Function("const window={};"+file('assets/port79-rest-attendance.js')+";return window.P79RestAttendance;")();
const classify=Function("engine","const window={P79AttendanceV6:engine};let module={exports:{}};"+file('assets/port79-schedule-punch-restore.js')+";return module.exports;")(engine);
const API=Function("window",file('assets/port79-schedule-rest-evidence.js')+";return window.P79ScheduleRestEvidence;")({P79RestAttendance:rest});
const people=[{id:'E1',attNo:'1',startDate:'2026-10-01'},{id:'E2',attNo:'2',startDate:'2026-10-28'},{id:'E3',attNo:'3',startDate:'2026-10-01'},{id:'E4',attNo:'4',startDate:'2026-10-01'}];
let roster=people.map(p=>({empId:p.id,schedule:{'2026-10-27':'中','2026-10-29':'早'}}));
let reads=0,updates=0;
const client=API.create({
 token:()=> 'test',employees:()=>people,schedules:()=>roster,
 dateEligible:(person,date)=>date>=person.startDate,
 buildShifts:r=>engine.buildShifts(r),timestamp:r=>Date.parse(engine.normalizeTime(r.timeStr).replace(/\//g,'-').replace(' ','T')+'+08:00'),
 leaveDates:()=>[],shiftForSession:r=>classify.displayShiftFromClockIn(r.clockIn,r.clockOut),
 read:async month=>{reads++;return {ok:true,month,records:[],absenceReferenceRecords:null}},
 update:()=>{updates++},now:()=>Date.parse('2026-11-02T08:00:00+08:00')
});
(async()=>{
 let r=await client.refreshIfStale('2026-10');
 assert.equal(r.auditSummary.daysChecked,7,'late hire has one eligible date and three full-month employees each have two');
 const updatesInitial=updates;
 r=await client.refreshIfStale('2026-10');
 assert.equal(updates,updatesInitial,'unchanged fresh audit does not refresh');
 people[1].startDate='2026-10-01';
 r=await client.refreshIfStale('2026-10');
 assert.equal(r.auditSummary.daysChecked,8,'start-date changes must invalidate the cached audit immediately');
 assert(updates>updatesInitial,'personnel change triggers rebuild');
 const updatedAfterPersonnel=updates;
 roster[0].schedule['2026-10-27']='休';
 r=await client.refreshIfStale('2026-10');
 assert(updates>updatedAfterPersonnel,'original roster changes must invalidate cache before 60 seconds');
 assert.equal(r.auditSummary.daysChecked,8);
 assert(reads>0);
 console.log('PASS: unchanged refresh cached; personnel start date & saved roster immediately invalidate audit.');
})().catch(e=>{console.error(e);process.exitCode=1});
