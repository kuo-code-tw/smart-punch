'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync('backend/night-cover-dual-date-v108-core.gs','utf8');
new vm.Script(source);
const ctx={Date,Map,Set,JSON,Number,Object,String,Error,
 normalizeEmpId_:v=>String(v||'').trim().toUpperCase(),
 p79AssertOvertimeReportNotRevoked_:()=>{}};
vm.createContext(ctx);vm.runInContext(source,ctx);
function fixture(day='2026-11-07',work='2026-11-08',index=1){
 const id=index?'EARLY':'MID',date=index?work:day;
 return {rows:[{empId:'LEAVER',schedule:{[day]:'年',__meta:{[day]:{leaveOriginalShift:'晚'}}}},{empId:id,schedule:{[date]:index?'早':'中',__meta:{}}}],
 request:{id:'REPORT1',empId:id,forEmpId:'LEAVER',leaveHandoffId:'LEAVE1',date,workDate:date,overtimeDate:day,coverDate:day,month:date.slice(0,7),planned:true},
 rule:index?['延','延04-08',4,6.02,'08','16','04','08','before','平日延時加班']:['延','延24-04',4,6.02,'16','24','24','04','after','平日延時加班'],
 covers:[{leaveId:'LEAVE1',leaveEmpId:'LEAVER',startDate:day,endDate:day,mode:'two',workerIds:['MID','EARLY']}],leaves:[{id:'LEAVE1',empId:'LEAVER',startDate:day,endDate:day,status:'已核准'}]};
}
const plan=f=>ctx.p79PlanDirectReport_(f.rows,f.request,f.rule,null,f.covers,f.leaves,f.extra||[]);
let f=fixture(),r=plan(f),saved=r.report;
assert.equal(saved.workDate,'2026-11-08');assert.equal(saved.overtimeDate,'2026-11-07');assert.equal(saved.declaredHours,4);assert.equal(saved.actualMinutes,null);
assert.equal(r.rows[1].schedule['2026-11-08'],'早');assert(!r.rows[1].schedule.__meta['2026-11-07']);assert(!f.rows[1].schedule.__meta['2026-11-08']);
const people={EARLY:{},MID:{}};
assert.equal(Object.keys(ctx.p79OtEntriesFromRowsV108_('2026-11-07',people,r.rows)).length,1);
assert.equal(Object.keys(ctx.p79OtEntriesFromRowsV108_('2026-11-08',people,r.rows)).length,0);
f.rows=r.rows;assert.equal(plan(f).duplicate,true);
for(const mutate of [x=>x.request.overtimeDate='2026-11-08',x=>x.request.workDate='2026-11-07',x=>x.covers[0].workerIds=['MID','OTHER'],x=>x.leaves[0].status='已取消',x=>x.rows[1].schedule[x.request.date]='中',x=>x.rule[6]='16']){
 const x=fixture();mutate(x);assert.throws(()=>plan(x));
}
// A legacy source-day report blocks a second next-day report even with a new UUID.
f=fixture();f.rows[1].schedule.__meta['2026-11-07']={forEmpId:'LEAVER',overtimeReport:{id:'OLD',leaveId:'LEAVE1',planned:true}};assert.throws(()=>plan(f),/原代班已有申報/);
f=fixture('2026-10-31','2026-11-01');r=plan(f);assert.equal(r.report.overtimeDate,'2026-10-31');assert.equal(r.report.workDate,'2026-11-01');
assert.equal(Object.keys(ctx.p79OtEntriesFromRowsV108_('2026-10-31',people,r.rows)).length,1);assert.equal(Object.keys(ctx.p79OtEntriesFromRowsV108_('2026-11-01',people,r.rows)).length,0);
assert.throws(()=>ctx.p79OtEntriesFromRowsV108_('2026-10-31',people,r.rows.concat(r.rows)),/ID重複/);
r.rows[1].schedule.__meta['2026-11-01'].overtimeRevocations=[{reportId:'REPORT1',confirmed:true}];assert.equal(Object.keys(ctx.p79OtEntriesFromRowsV108_('2026-10-31',people,r.rows)).length,0);
assert.equal(plan(fixture('2026-11-07','2026-11-08',0)).report.overtimeDate,'2026-11-07');
// Exercise the actual save adapter against isolated storage, including readback,
// permission rejection and an idempotent retry after the revision changes.
f=fixture();let database=JSON.parse(JSON.stringify(f.rows)),writes=0,deny=false,revision='S';
Object.assign(ctx,{
 SHEET_LEAVE:'leave',P79_LEAVE_DELETE_PERMIT_:{},
 gcRequireActionPermission_:()=>{if(deny)throw Error('permission denied');return {empId:'ADMIN'};},
 p79DateOnly_:s=>String(s||'').slice(0,10),
 p79GetEmployeeMasterCached_:()=>[{empId:'EARLY'}],p79CanReadScopedEmployee_:()=>true,
 readScheduleMonthOnly_:()=>JSON.parse(JSON.stringify(database)),
 getScheduleSyncRevision_:()=>revision,getLeaveSyncRevision_:()=> 'L',getEmployeeAuthRevision_:()=> 'E',
 scheduleReadEditLock_:()=>null,getSystemConfig_:()=>({overtimeConversionRowsV1:[f.rule]}),
 Utilities:{formatDate:()=> '2026-11-08'},
 p79ReadLeaveCoverAssignments_:()=>f.covers,readLeaveRecords_:()=>f.leaves,
 syncSchedules_:(ss,payload)=>{database=JSON.parse(JSON.stringify(payload.schedules));writes++;revision='S2';}
});
const db={getSheetByName:()=>({getLastRow:()=>2})},request={...f.request,category:f.rule[0],code:f.rule[1],expectedRevision:'S:L:E:2026-11',gcToken:'test'};
const receipt=ctx.p79SaveDirectOvertimeReport_(db,request);
assert.equal(receipt.report.overtimeDate,'2026-11-07');assert.equal(receipt.report.workDate,'2026-11-08');assert.equal(database[1].schedule['2026-11-08'],'早');
const retry=ctx.p79SaveDirectOvertimeReport_(db,request);assert.equal(retry.duplicate,true);assert.equal(Object.keys(database[1].schedule.__meta).length,1);
deny=true;const before=writes;assert.throws(()=>ctx.p79SaveDirectOvertimeReport_(db,request),/permission denied/);assert.equal(writes,before);
// Export uses credit day, punch review uses physical day; converted hours are unchanged.
const global={};vm.runInNewContext(fs.readFileSync('assets/port79-overtime-application.js','utf8'),{window:global,Date,Intl,Map,Set,TextEncoder,TextDecoder,Uint8Array,DataView,Error,Blob});
const record={empId:'EARLY',schedule:{'2026-11-08':'早',__meta:{'2026-11-08':{overtimeReport:{...saved,planned:false}}}}};
let reviewed;global.P79RestAttendance={reportIssue:(snapshot,id,d)=>{reviewed=d;return '';}};
const snapshot={schedules:[record]},employee={empId:'EARLY',name:'TEST',jobTitle:'指揮手'};
const a=global.P79OvertimeApplication.collect([snapshot],[employee],['2026-11-07'],'',[],'actual');
assert.equal(a.rows.length,1);assert.equal(a.rows[0].date,'2026-11-07');assert.equal(a.rows[0].workDate,'2026-11-08');assert.equal(reviewed,'2026-11-08');assert.equal(a.rows[0].actual,4);assert.equal(a.rows[0].converted,6.02);
assert.equal(global.P79OvertimeApplication.collect([snapshot],[employee],['2026-11-08'],'',[],'actual').rows.length,0);
for(const file of ['work-hours/index.html','leave/index.html'])for(const m of fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|application\/json|importmap/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
console.log('PASS GAS dual-date planner, server-derived credit, wrong-date rejection, legacy duplicate block, month boundary, idempotency, revocations, statement date and unchanged hours; HTML parses');
