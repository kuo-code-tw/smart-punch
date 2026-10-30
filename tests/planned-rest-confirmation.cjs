'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const api=require('../assets/port79-planned-rest-reconciliation.js'),date='2026-10-28',now='2026-10-30T12:00:00+08:00';
const rows=['例','休','國','颱'].map((category,i)=>({empId:'E'+i,schedule:{[date]:'早',__meta:{[date]:{reportOriginalShift:category,overtime:true,overtimeAssignedShift:'早',overtimeReport:{id:'R'+i,planned:true,category,code:category+'08-16'}}}}}));
const evidence={complete:true,days:Object.fromEntries(rows.map(r=>[r.empId+'|'+date,{state:'rest',shiftEnd:Date.parse(date+'T16:00:00+08:00')}]))};
const input={rows,date,today:'2026-10-30',now,evidence,confirmed:true,actor:'ADMIN'},before=JSON.stringify(rows);
let plan=api.plan(input);a.equal(plan.cancelled,4);a.equal(JSON.stringify(rows),before,'pure plan preserves source');
for(let i=0;i<4;i++){const s=plan.rows[i].schedule,m=s.__meta[date];a.equal(s[date],['例','休','國','颱'][i]);a.equal(m.overtimeReport,undefined);a.equal(m.plannedRestResolution.report.id,'R'+i);if(i===3)a.equal(m.restCategory,undefined);}
a.equal(api.plan({...input,rows:plan.rows}).cancelled,0,'repeat cannot cancel twice');
for(const change of [{confirmed:false},{today:date},{evidence:{complete:false}}])a.equal(api.plan({...input,...change}).cancelled,0);
for(const state of ['missing','worked','open','unknown']){
 const proof={...evidence,days:Object.fromEntries(rows.map(r=>[r.empId+'|'+date,{state,shiftEnd:Date.parse(date+'T16:00:00+08:00')}]))};
 const result=api.plan({...input,evidence:proof});a.equal(result.cancelled,0);for(const row of result.rows)a(row.schedule.__meta[date].overtimeReport,'retain original report');
 if(state==='missing')a.equal(result.rows[0].schedule.__meta[date].overtimeReport.attendanceReview,'打卡待核');
}
for(const field of ['approvedAt','reviewedBy','approvalStatus']){const sample=structuredClone(rows);sample[0].schedule.__meta[date].overtimeReport[field]='confirmed';a.equal(api.plan({...input,rows:sample}).results[0].state,'approved-review');}
let sample=structuredClone(rows);sample[0].schedule.__meta[date].reportOriginalShift='早';a.equal(api.plan({...input,rows:sample}).results[0].state,'ordinary-workday');
sample[0].schedule[date]='休';a.equal(api.plan({...input,rows:sample}).results[0].state,'ordinary-workday','a later rest label cannot erase the recorded original workday');
sample=structuredClone(rows);sample[0].schedule.__meta[date].forEmpId='OTHER';a.equal(api.plan({...input,rows:sample}).results[0].state,'linked-review');
const c={window:null,console:{info(){}},Date,Intl,Map,Set};c.window=c;vm.createContext(c);
for(const f of ['attendance/v6-engine.js','assets/port79-rest-attendance.js','assets/port79-planned-rest-reconciliation.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
const time=r=>Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00');
const raw=[{id:'IN',empId:'E0',timeStr:'2026/10/28 23:48:00',status:'上班簽到'},{id:'OUT',empId:'E0',timeStr:'2026/10/29 07:52:00',status:'下班簽退'}];
const night=structuredClone(rows.slice(0,1));night[0].schedule[date]='晚';Object.assign(night[0].schedule.__meta[date].overtimeReport,{overtimeStart:'24',overtimeEnd:'08'});
const pairs=c.P79AttendanceV6.buildShifts(raw),proof=c.P79RestAttendance.build({complete:true,month:'2026-10',now:Date.parse(now),schedules:night,sessions:pairs.map(r=>({empId:r.empId,start:r.clockIn?time(r.clockIn):null,end:r.clockOut?time(r.clockOut):null}))});
a.equal(proof.days['E0|'+date].state,'worked','next-day OUT belongs to original night shift');a.equal(c.P79PlannedRestReconciliation.plan({...input,rows:night,evidence:proof}).cancelled,0);
const source=fs.readFileSync('schedule/index.html','utf8');a(!source.includes("monthlyScheduleData[emp.id][date]='休'"),'ordinary absence cannot overwrite roster');
const patch=require('../scripts/apply-gas-planned-rest.cjs');a.throws(()=>patch('function unknown(){}'),/Unsupported/);
console.log('PASS confirmed holiday-only cancellation, all four original categories, future/current/unconfirmed/partial/approved/link guards, night pairing, audit retention, idempotent cancellation, no ordinary workday conversion');
