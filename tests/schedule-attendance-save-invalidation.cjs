'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const engine=require('../attendance/v6-engine.js');
const ctx={window:{P79AttendanceV6:engine},Date,Map,Set,Promise,Intl,console};
vm.createContext(ctx);
for(const file of ['port79-schedule-punch-restore.js','port79-rest-attendance.js','port79-schedule-rest-evidence.js'])
 vm.runInContext(fs.readFileSync('assets/'+file,'utf8'),ctx,{filename:file});
const people=[{id:'E1',attNo:'11',company:'甲',group:'C'},{id:'E2',attNo:'12',company:'乙',group:'D'}],month='2026-10',date='2026-10-24';
const schedule=people.map(p=>({empId:p.id,schedule:{[date]:'休'}}));
const raw=(id,kind,time,attNo)=>({id,empId:id.split('-')[0],attNo,timeStr:'2026/10/24 '+time+':00',status:kind});
let records=[raw('E1-I','上班簽到','08:05','11'),raw('E1-O','下班簽退','16:05','11'),raw('E2-I','上班簽到','08:04','12')];
const parse=r=>Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00');
const counts={};
const client=ctx.window.P79ScheduleRestEvidence.create({
 now:()=>Date.parse('2026-10-27T18:00:00+08:00'),token:()=> 'USER-A',employees:()=>people,schedules:()=>schedule,
 buildShifts:engine.buildShifts,timestamp:parse,leaveDates:()=>[],
 shiftForSession:row=>ctx.window.P79SchedulePunchRestore.shiftFromClockIn(row.clockIn,row.clockOut),
 read:async m=>{counts[m]=(counts[m]||0)+1;return {ok:true,month:m,records:m===month?records.map(r=>({...r})):[]}},update:()=>{}
});
(async()=>{
 const before=await client.refresh(month);
 assert.equal(before.actualShifts['E2|'+date],undefined,'a lone punch cannot create a shift');
 assert.equal(before.days['E2|'+date].state,'missing');
 records.push(raw('E2-O','下班簽退','16:04','12'));
 const stale=await client.refresh(month);
 assert.equal(stale.actualShifts['E2|'+date],undefined,'an immediate default refresh still uses the 30s cloud cache');
 const after=await client.invalidate(month);
 assert.equal(after.actualShifts['E2|'+date],'早','confirmed saved punches must recheck official records immediately');
 assert.equal(after.days['E2|'+date].state,'worked');
 assert.equal(after.actualShifts['E1|'+date],'早','every company and group remains part of the audit');
 assert.equal(counts[month],2,'invalidation bypasses cached official month');
 const html=fs.readFileSync('schedule/index.html','utf8');
 assert(html.includes("event.key==='port79_attendance_sync_notice_v1'"),'schedule listens to confirmed saves in another tab');
 assert(html.includes('p79ScheduleRestClient().invalidate(currentMonth)'),'schedule forces a fresh official audit');
 assert(html.includes('p79AttendanceNoticeRefreshTimer=setTimeout'),'burst saves coalesce before refreshing official data');
 assert(html.includes('20261122-attendance-save-invalidation-v1'),'browser must load the updated evidence client');
 console.log('PASS attendance save notice invalidates cache and updates cross-company roster without modifying formal shifts');
})().catch(e=>{console.error(e);process.exitCode=1});
