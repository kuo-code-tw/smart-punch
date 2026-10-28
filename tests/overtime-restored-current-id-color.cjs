'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const day='2026-10-12',oldId='a1871d11-07dc-45d0-b680-87b437747553',
 newId='68fbd206-ae0f-468b-889f-4d710d6405ea';
const oldAudit={confirmed:true,at:'2026-10-27T14:02:40.174Z',actor:'管理員',reportId:oldId};
const revoked={confirmed:true,reportId:oldId,report:{id:oldId,code:'休08-16'},
 empId:'E1',date:day,at:'2026-10-27T14:05:45.884Z',actor:'管理員'};
const report={id:newId,category:'休',code:'休08-16',declaredHours:8};
const meta={overtimeReport:report,overtimeAmendments:[oldAudit],overtimeRevocations:[revoked]};
const month={ready:true,rows:[{empId:'E1',schedule:{__meta:{[day]:meta}}}],people:[{empId:'E1',name:'員工'}]};
const btn={dataset:{},style:{setProperty(k,v){this[k]=v},removeProperty(k){delete this[k]}},
 removeAttribute(){},setAttribute(){}};
const strip={querySelectorAll(){return [btn]},querySelector(){return null},appendChild(){}};
const doc={readyState:'complete',getElementById:id=>id==='p79AttendanceDateStrip'?strip:null,
 createElement(){return {style:{}}}};
const ctx={document:doc,addEventListener(){},renderRecordsPagination(){},
 p79AttendanceOvertimeMonths:new Map([['2026-10',month]])};
ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(fs.readFileSync('assets/port79-attendance-overtime.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('assets/port79-overtime-reason.js','utf8'),ctx);
const ui=ctx.P79AttendanceOvertimeDayStatus,reason=ctx.P79OvertimeReason;
ui.decorateOvertimeDateStrip([day],day);
assert.equal(ui.overtimeDayIndicator(day,month).kind,'reported','old edits cannot amend restored report');
assert.equal(btn.dataset.p79OvertimeAudit,'reported');
assert.equal(btn.style['background-color'],'#dcfce7','new valid report displays green');
assert.equal(reason.amended(report,meta).verified,false,'accounting uses only current ID');
assert.equal(reason.amended({id:oldId},{overtimeAmendments:[oldAudit]}).verified,true,'old edits preserved');
assert.equal((meta.overtimeRevocations||[])[0].reportId,oldId,'old cancelled ID stays in audit');
meta.overtimeAmendments.push({...oldAudit,reportId:newId});
assert.equal(reason.amended(report,meta).verified,true,'future new-ID edit still detected');
assert.equal(ui.overtimeDayIndicator(day,month).kind,'amended','new-ID edit returns yellow');
console.log('PASS restored report: green for current ID, historical cancellation/amendment retained; future edits yellow');
