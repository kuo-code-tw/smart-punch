'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('leave/index.html','utf8');
const start=html.indexOf('function p79LeaveHandoffMatchesOvertime('),end=html.indexOf('async function p79ReconcileLeaveHandoff()',start);
assert(start>=0&&end>start,'live association and queue functions found');
const ctx={Date,Error,Map,Set,Array,Math,String,normalizeLeaveFilterDate:value=>String(value||'').slice(0,10)};
vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
const queue=ctx.p79LeaveHandoffEntryState,day='2026-11-14',leaveId='LEAVE-14',h={id:leaveId};
const entry={date:day,coverDate:day,overtimeDate:day,code:'延16-04',
 empId:'WORKER',forEmpId:'LEAVER',leaveId};
const cover={leaveId,leaveEmpId:'LEAVER',startDate:day,endDate:day,workerIds:['WORKER','SECOND']};
const cloud=(entry,report,meta={})=>({
 leaveCoverAssignments:[cover],
 schedules:[{empId:entry.empId,schedule:{__meta:{[entry.date]:{...meta,...(report?{overtimeReport:report}:{})}}}}]
});
const independent={id:'OWN',category:'延',code:'延16-20',normalStart:'08',normalEnd:'16',
 overtimeStart:'16',overtimeEnd:'20',planned:false};
const linked={id:'COVER',category:'延',code:'延16-04',leaveId,
 normalStart:'16',normalEnd:'24',overtimeStart:'24',overtimeEnd:'04',planned:false};
assert.equal(queue(h,entry,cloud(entry,independent),true),'pending',
 'standalone 08-16 + 16-20 must not finish original leave cover 24-04');
assert.equal(queue(h,entry,cloud(entry,{...independent,leaveId}),true),'pending',
 'even linking WRONG period to original leave must not falsely complete');
assert.equal(queue(h,entry,cloud(entry,{...linked,leaveId:'OTHER'}),true),'pending',
 'correct overtime from a DIFFERENT leave does not finish this leave');
assert.equal(queue(h,entry,cloud(entry,{...linked,leaveId:undefined}),true),'pending',
 'unknown leave and absent worker association must not finish leave');
assert.equal(queue(h,entry,cloud(entry,linked),true),'reported',
 'only original approved leave plus correct overtime period completes');
assert.equal(queue(h,entry,cloud(entry,{...linked,leaveId:undefined},{forEmpId:'LEAVER'}),true),'reported',
 'legacy linked person metadata plus correct period remains supported');
assert.equal(queue(h,entry,cloud(entry,linked,{overtimeExcluded:true}),true),'pending',
 'deleted/excluded overtime is not proof of completed leave');
const next={...entry,date:'2026-11-15',workDate:'2026-11-15',overtimeDate:day,code:'延04-16'};
const nextReport={...independent,code:'延16-20',overtimeDate:'2026-11-15'};
assert.equal(queue(h,next,cloud(next,nextReport),true),'pending',
 'unrelated next-day extension must not be flagged as wrong-date cover');
const nextLinked={...linked,code:'延04-16',normalStart:'08',normalEnd:'16',overtimeStart:'04',overtimeEnd:'08',overtimeDate:day};
assert.equal(queue(h,next,cloud(next,nextLinked),true),'reported',
 'original-night credit is recognized when both dates and source link match');
assert.equal(queue(h,next,cloud(next,{...nextLinked,overtimeDate:'2026-11-15'}),true),'wrong-workdate',
 'linked but wrong accounting date remains quarantined');
assert(html.includes('p79LeaveHandoffMatchesOvertime({...h,id:e.leaveId||h.id},corrected,oldMeta)'),
 'wrong-date original-day scan is also source-aware');
console.log('PASS independent overtime never closes approved cover; exact leave and period are required, cross-day attribution remains verified');
