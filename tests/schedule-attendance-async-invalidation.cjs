'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const engine=require('../attendance/v6-engine.js');
const vmctx={window:{P79AttendanceV6:engine},Date,Map,Set,Promise,Intl,console};
vm.createContext(vmctx);
for(const file of ['port79-schedule-punch-restore.js','port79-rest-attendance.js','port79-schedule-rest-evidence.js'])
 vm.runInContext(fs.readFileSync('assets/'+file,'utf8'),vmctx,{filename:file});
const employees=[{id:'E1',attNo:'11',company:'甲',group:'C'},{id:'E2',attNo:'12',company:'乙',group:'D'}];
const month='2026-10',date='2026-10-24',rosters=employees.map(p=>({empId:p.id,schedule:{[date]:'休'}}));
const a={id:'E2-I',empId:'E2',attNo:'12',timeStr:'2026/10/24 08:00:00',status:'上班簽到'};
const b={id:'E2-O',empId:'E2',attNo:'12',timeStr:'2026/10/24 16:00:00',status:'下班簽退'};
const parse=r=>Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00');
let releaseFirst,resolveStarted;
const firstStarted=new Promise(resolve=>resolveStarted=resolve);
const counters={};
const read=async m=>{
 counters[m]=(counters[m]||0)+1;
 if(m!==month)return {ok:true,month:m,records:[]};
 if(counters[m]===1){resolveStarted();await new Promise(resolve=>releaseFirst=resolve);return {ok:true,month:m,records:[a]};}
 return {ok:true,month:m,records:[a,b]};
};
const client=vmctx.window.P79ScheduleRestEvidence.create({
 now:()=>Date.parse('2026-10-27T18:00:00+08:00'),token:()=> 'TOKEN',employees:()=>employees,schedules:()=>rosters,
 buildShifts:engine.buildShifts,timestamp:parse,leaveDates:()=>[],
 shiftForSession:row=>vmctx.window.P79SchedulePunchRestore.shiftFromClockIn(row.clockIn,row.clockOut),read,update:()=>{}
});
(async()=>{
 const stale=client.refresh(month);
 await firstStarted;
 const current=await client.invalidate(month);
 assert.equal(current.actualShifts['E2|'+date],'早','latest complete punch pair must determine the real shift');
 releaseFirst();
 assert.equal(await stale,null,'late old server response must never replace newer audit');
 assert.equal(client.status(month).evidence.actualShifts['E2|'+date],'早','latest audit survives stale response');
 await client.refresh('2026-09');
 await client.invalidate(month);
 assert.equal(client.status('2026-09').evidence.complete,false,'a previously viewed month audit is invalidated');
 await client.refreshIfStale('2026-09');
 assert.equal(client.status('2026-09').evidence.complete,true,'prior month must rebuild audit after notification');
 assert.equal(client.status(month).evidence.actualShifts['E2|'+date],'早','cross-month refresh must not corrupt October');
 console.log('PASS late cloud response isolation, current-month official shift and adjacent-month stale audit invalidation');
})().catch(e=>{console.error(e);process.exitCode=1});
