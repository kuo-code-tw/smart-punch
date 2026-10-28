'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-attendance-overtime.js','utf8');
new vm.Script(source);
const date='2026-10-12',states=[],store=new Map();
const old={id:'REVOKED',code:'休08-16',declaredHours:8};
const audit={confirmed:true,reportId:'REVOKED',report:old,empId:'E1',date,
 actor:'主管',at:'2026-10-18T15:00:00+08:00'};
const meta={overtimeRevocations:[audit],overtimeReport:{id:'NEW',code:'休08-16',declaredHours:8}};
const month={ready:true,rows:[{empId:'E1',schedule:{__meta:{[date]:meta}}}],people:[{empId:'E1',name:'測試員工'}]};
const styleValues={},button={dataset:{},style:{
 setProperty(k,v){styleValues[k]=v},removeProperty(k){delete styleValues[k]}
},removeAttribute(){},setAttribute(){},
 getAttribute:k=>k==='data-p79-attendance-date'?date:null};
const strip={querySelectorAll(){return [button]},querySelector(){return null},appendChild(){}};
const document={readyState:'complete',getElementById:id=>id==='p79AttendanceDateStrip'?strip:null,
 createElement:()=>({style:{}})};
const context={document,addEventListener(){},renderRecordsPagination(){},
 p79AttendanceOvertimeMonths:new Map([['2026-10',month]]),
 localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};
context.window=context;vm.createContext(context);vm.runInContext(source,context);
const api=context.P79AttendanceOvertimeDayStatus;
function view(expected,label){
 api.decorateOvertimeDateStrip([date],date);
 assert.equal(styleValues['background-color'],expected,label);
 return {color:styleValues['background-color'],kind:button.dataset.p79OvertimeAudit,title:button.title};
}
let r=view('#dcfce7','historically cancelled but newly reported => green');
assert.equal(r.kind,'reported');assert.match(r.title,/已取消 1/);
meta.overtimeReport={...meta.overtimeReport,reportedAt:'original',modifiedAt:'corrected'};
r=view('#fef3c7','current amended effective report needs review');
assert.equal(r.kind,'amended');
assert(api.markReviewed(date,true),'review saves current version');
r=view('#dcfce7','current amended report reviewed => green');
assert.equal(r.kind,'reported');assert.match(r.title,/修改歷史保留/);
assert(!button.title.includes('✓'),'no artificial checkmark');
meta.overtimeReport.code='休16-24';
r=view('#fef3c7','new amendment invalidates previous review');
assert(!api.isReviewed(date));
meta.overtimeReport=null;
r=view('#fee2e2','only old cancelled report left => red');
meta.overtimeRevocations=[];
r=view('#ffffff','no effective or historical report => white');
month.ready=false;
r=view('#f1f5f9','unverified cloud => grey');
assert(!api.markReviewed(date,true),'cannot review without confirmed cloud');
console.log('PASS 10/12: newly reported overrides past cancellation; reviewed amendments turn green; new edits invalidate; cancellation/red; no reports/white; unknown/grey');
