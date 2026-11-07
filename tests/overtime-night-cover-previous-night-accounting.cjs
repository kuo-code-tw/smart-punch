'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const global={};
vm.runInNewContext(fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8'),{window:global,Date,Map,Set,Error});
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),{window:global,Date,Intl,Map,Set,TextEncoder,Error});
const date='2026-11-07',next='2026-11-08',api=global.P79LeaveCoverSuggest;
const middle=api.coverWorkday(date,'晚','two',0),early=api.coverWorkday(date,'晚','two',1);
assert.equal(middle.workDate,date);assert.equal(middle.overtimeDate,date);
assert.equal(early.workDate,next,'physical 04-16 punch shift is on 11/08');
assert.equal(early.overtimeDate,date,'04-08 overtime is credited to original 11/07');
assert.equal(early.overtimeStart,'04');assert.equal(early.overtimeEnd,'08');
assert.equal(early.normalStart,'08');assert.equal(early.normalEnd,'16');
const cloud={leaveCoverAssignments:[{leaveId:'L1',leaveEmpId:'LEAVE',workerIds:['MID','EARLY'],startDate:date,endDate:date,mode:'two'}],
 schedules:[{empId:'LEAVE',schedule:{[date]:'晚'}},{empId:'MID',schedule:{[date]:'中'}},{empId:'EARLY',schedule:{[next]:'早'}}]};
const legacy={empId:'EARLY',forEmpId:'LEAVE',leaveId:'L1',date,code:'延04-16'};
const migrated=global.P79Overtime.normalizeLeaveCoverHandoffEntry(cloud,{id:'L1'},legacy);
assert.equal(migrated.date,next,'old queue now targets actual workday');
assert.equal(migrated.overtimeDate,date,'old queue retains overtime credit date');
assert.equal(migrated.coverDate,date);
const resolved=global.P79Overtime.resolveLeaveCoverReport(cloud,{id:'L1'},migrated);
assert.equal(resolved.workDate,next);assert.equal(resolved.overtimeDate,date);
assert.match(resolved.periodHint,/加班歸屬日 2026-11-07/);
assert.throws(()=>global.P79Overtime.resolveLeaveCoverReport(cloud,{id:'L1'}, {...migrated,overtimeDate:next}),/加班歸屬日應為/);
const leave=fs.readFileSync('leave/index.html','utf8'),work=fs.readFileSync('work-hours/index.html','utf8');
const l=leave.indexOf('async function p79SaveWorkOvertimeDraft(draft){');
const h=leave.indexOf('\nlet p79LeaveOvertimeConfig=',l);
assert(l>=0&&h>l);
let writes=0;
const fake={ok:true,records:[],schedules:cloud.schedules,revision:11};
const ctx={Date,Intl,Error,String,AbortController,setTimeout,clearTimeout,encodeURIComponent,
 leaveRequestToken:()=> 'T',p79CanReportOvertime:()=>true,GAS_URL:'https://example.invalid/gas',
 P79Overtime:{takeSaveContext:()=>fake},fetch:async()=>{writes++;throw Error('network request must not happen');}};
vm.createContext(ctx);vm.runInContext(leave.slice(l,h),ctx);
const draft={date:next,overtimeDate:date,empId:'EARLY',rule:{category:'延',code:'延04-16'},leaveHandoffId:'L1'};
(async()=>{
 await assert.rejects(ctx.p79SaveWorkOvertimeDraft(draft),/正式 GAS 尚未確認/);
 assert.equal(writes,0,'legacy GAS must not receive a wrong-date POST');
 assert(work.includes('overtimeDate:linked.overtimeDate'),'work-hours planned ledger carries 11/07 credit');
 assert(work.includes('歸屬待核→'),'work-hours shows unresolved legacy cloud attribution');
 assert(leave.includes('overtimeDate:plan?.overtimeDate'),'leave handoff retains both dates');
 assert(leave.includes('workDate:draft.date,overtimeDate'),'GAS POST requires separate work/credit dates');
 assert(leave.includes("String(result.report?.overtimeDate||'')!==overtimeDate"),'GAS success must read back the right credit date');
 assert(leave.includes("cloud?.capabilities?.nightCoverOvertimeAccountingV1!==true"),'server capability is mandatory');
 const attendance=fs.readFileSync('attendance/v6-engine.js','utf8');
 assert(attendance.includes('accountingDateForSession'),'punch pairing/workday engine stays independent of overtime accounting');
 for(const file of ['leave/index.html','work-hours/index.html']){
  for(const m of fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(!/\bsrc=|application\/json|importmap/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
  }
 }
 console.log('PASS previous-night credit 11/07, next-morning 11/08 normal attendance and physical punches, old GAS write blocked; scripts parse');
})().catch(e=>{console.error(e);process.exitCode=1;});
