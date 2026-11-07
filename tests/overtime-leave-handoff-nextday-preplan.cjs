'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const report=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const suggest=fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8');
const leave=fs.readFileSync('leave/index.html','utf8');
const g={};
vm.runInNewContext(suggest,{window:g,Date,Map,Set,Error});
vm.runInNewContext(report,{window:g,Date,Intl,Map,Set,TextEncoder,Error});
const day='2026-11-07',tomorrow='2026-11-08';
const cover={leaveId:'L1',leaveEmpId:'LEAVER',startDate:day,endDate:day,mode:'two',workerIds:['MID','EARLY']};
const origin={ok:true,leaveCoverAssignments:[cover],records:[],revision:1,
 schedules:[{empId:'LEAVER',schedule:{[day]:'晚'}},{empId:'EARLY',schedule:{[day]:'早',[tomorrow]:'早'}},{empId:'MID',schedule:{[day]:'中'}}]};
const future={ok:true,leaveCoverAssignments:[],records:[],revision:1,
 schedules:[{empId:'EARLY',schedule:{[tomorrow]:'早'}}]};
const legacy={empId:'EARLY',forEmpId:'LEAVER',leaveId:'L1',name:'黃信興',date:day};
const mapped=g.P79Overtime.normalizeLeaveCoverHandoffEntry(origin,{id:'L1'},legacy);
assert.equal(mapped.date,tomorrow,'legacy next-day worker must be assigned to next workday');
assert.equal(mapped.coverDate,day,'keep original approved leave date');
assert.equal(mapped.code,'延04-16');
assert.equal(mapped.preferredType,'平日延時加班');
assert.equal(g.P79Overtime.resolveLeaveCoverReport({...future,leaveCoverAssignments:[cover]},
 {id:'L1'},mapped).code,'延04-16','next-day cloud roster verifies proper early pre-shift extension');
assert.equal(g.P79Overtime.normalizeLeaveCoverHandoffEntry(origin,{id:'L1'},mapped).date,tomorrow,
 'already-corrected handoff remains stable');

const begin=leave.indexOf('function p79LeaveHandoffEntryState(');
const end=leave.indexOf('function p79UpdateLeaveHandoffBanner()',begin);
assert(begin>0&&end>begin,'actual handoff reconciler must exist');
const code=leave.slice(begin,end);
async function run(initial,original=origin){
 const session={id:'L1',createdAt:1700000000000,pendingReports:true,entries:[initial]};
 let store=JSON.stringify(session),calls=[];
 const context={
  P79Overtime:g.P79Overtime,
  p79GetLeaveHandoff:()=>JSON.parse(store),
  p79UpdateLeaveHandoffBanner:()=>{},
  p79HandoffSync:null,p79CurrentHandoff:'',
  p79LeaveHandoffContext:null,adminSession:{role:'admin'},
  p79CanReportOvertime:()=>true,leaveRequestToken:()=> 'TEST_TOKEN',GAS_URL:'https://example.invalid/gas',
  sessionStorage:{setItem:(k,v)=>{assert.equal(k,'port79_leave_overtime_handoff_v1');store=v;},
   removeItem:(k)=>{assert.equal(k,'port79_leave_overtime_handoff_v1');store='null';}},
  jsonFetch:async url=>{
   const d=new URL(url).searchParams.get('date');calls.push(d);
   return d===day?original:future;
  },
  normalizeLeaveFilterDate:x=>x,
  Date,JSON,Map,Set,Array,String,Error,encodeURIComponent
 };
 vm.createContext(context);vm.runInContext(code,context);
 const result=await context.p79ReconcileLeaveHandoff();
 return {context,result,store,calls};
}
(async()=>{
 const old=await run(legacy);
 assert.equal(old.result.entries[0].date,tomorrow);
 assert.equal(old.result.entries[0].coverDate,day);
 assert.equal(JSON.parse(old.store).entries[0].date,tomorrow,'persist corrected queue for next open');
 assert.deepEqual(old.calls,[day,tomorrow],'fetch both original leave and next worker work date');
 assert.equal(old.context.p79LeaveHandoffContext.date,tomorrow);
 assert.equal(old.context.p79LeaveHandoffContext.leaveCoverAssignments.length,1,
  'fresh next-day context retains the verified original cover for preplan display');
 const period=g.P79Overtime.resolveLeaveCoverReport(old.context.p79LeaveHandoffContext,
  {id:'L1'},old.result.entries[0]);
 assert.equal(period.code,'延04-16');
 assert.match(period.periodHint,/加班 04-08/);
 const again=await run(old.result.entries[0]);
 assert.equal(again.result.entries[0].date,tomorrow,'preplan reload must not shift a second day');
 assert.deepEqual(again.calls,[tomorrow,day],'reverify original approval even for shifted queue');
 const duplicate=JSON.parse(JSON.stringify(origin));
 duplicate.schedules.find(r=>r.empId==='EARLY').schedule.__meta={
  [day]:{overtimeReport:{id:'WRONG-DAY-ID',category:'延',overtimeStart:'04',overtimeEnd:'08'}}
 };
 const rejected=await run(legacy,duplicate).then(()=>null,e=>e);
 assert.match(String(rejected?.message||''),/原預排仍在.*2026-11-07/,
  'do not create a duplicate next-day plan when original wrong-day ID exists');
 assert(report.includes('prefill.coverDate||dateInput.value'),'link date selector to original leave date');
 assert(report.includes('p79OtCoverPlanPreview'),'pending four-hour overtime period must remain visible without a punch');
 assert(report.includes("if(prefill.leaveHandoffId)return;dateInput.value=leaveDateSelect.value;"),
  'original leave picker cannot overwrite verified next-day worker date');
 assert(leave.includes('p79ReconcileLeaveHandoff()'));
 for(const m of leave.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
  if(!/\bsrc=|application\/json|importmap/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
 new vm.Script(report);
 console.log('PASS old 11/07 night leave queue opens next-day 11/08 04-08 planned overtime; original leave stays 11/07; future punches not required; repeat/duplicate safe');
})().catch(e=>{console.error(e);process.exitCode=1;});
