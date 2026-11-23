'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-monthly-rest-dashboard.js','utf8');
const original=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
new vm.Script(source,{filename:'assets/port79-monthly-rest-dashboard.js'});
new vm.Script(original,{filename:'assets/port79-monthly-rest-overtime.js'});
const context={window:{},document:{},console,MutationObserver:class{},Event:class{}};
vm.runInNewContext(source,context);
const app=context.window.P79MonthlyRestDashboard;
assert(app&&typeof app.mount==='function'&&typeof app.sourceRows==='function');
assert.equal(app.periodLabel('休16-24'),'休 16:00 – 24:00');
assert.equal(app.periodLabel('休08-16'),'休 08:00 – 16:00');
assert.equal(app.periodLabel('原始已設定時段'),'原始已設定時段');

const input=(value,extra={})=>({value,...extra});
const ready={
 dataset:{row:'7'},hasAttribute:x=>x==='data-row',
 cells:[{}, {}, {}, {}, {},{textContent:'8 小時'},{textContent:'可申報'}],
 querySelector:selector=>({
  '.pick':input('',{checked:false,disabled:false}),
  '.date':input('2026-11-17'),
  '.person':{firstChild:{textContent:'張奉琪 '}},
  '.category':input('休'),
  '.rule':{selectedOptions:[{textContent:'休16-24'}]},
  '[data-audit]':{dataset:{audit:'STAFF01'}}
 })[selector]||null
};
const plan={
 cells:[{}, {textContent:'2026-11-27'}, {}, {textContent:'陳雅婷'},
  {textContent:'休'}, {textContent:'休09-18'},{textContent:'預排草案（未申報）'}],
 querySelector:selector=>selector==='.plan-pick'?input('',{dataset:{planIndex:'5'},checked:true,disabled:false}):null
};
const existing={
 cells:[{textContent:'2026-11-11'},{textContent:'F/L'},{textContent:'王榮章'},
  {textContent:'休'},{textContent:'休08-16'},{textContent:'已核對出勤'},
  {textContent:'每月未休假加班'},{textContent:'FORMAL001'}]
};
const root={querySelectorAll:selector=>({
 '#mrRows tr[data-row]':[ready],
 '#mrPlannedRows tr':[plan],
 '#mrExistingRows tr':[existing]
})[selector]||[]};
const snap=JSON.stringify(root.querySelectorAll('#mrRows tr[data-row]')[0].dataset);
const data=app.sourceRows(root);
assert.equal(data.ready.length,1);
assert.deepEqual({date:data.ready[0].date,name:data.ready[0].name,category:data.ready[0].category,hours:data.ready[0].hours},
 {date:'2026-11-17',name:'張奉琪',category:'休',hours:'8 小時'});
assert.equal(data.ready[0].audit,'STAFF01');
assert.equal(data.planned.length,1);
assert.equal(data.planned[0].status,'預排草案（未申報）');
assert.equal(data.prior.length,1);
assert.equal(data.prior[0].status,'已核對出勤');
assert.equal(JSON.stringify(root.querySelectorAll('#mrRows tr[data-row]')[0].dataset),snap,'render source is read only');

for(const label of ['待處理','可正式申報','待核對','已完成','月份','部門','姓名','狀態',
 '一鍵自動編排','批次核對','匯出','待處理名單','待核對原因','日期','休假類型',
 '建議時段','工時','操作','儲存變更','正式申報'])
 assert(source.includes(label),'Missing approved design control: '+label);
assert(source.includes("q('#mrUxMonth').onchange"));
assert(source.includes("q('#mrUxDept').onchange"));
assert(source.includes("q('#mrUxBatch').onclick"));
assert(source.includes("q('#mrUxSubmit').onclick"));
assert(source.includes("q('#mrUxSavePlan').onclick"));
assert(source.includes("q('#mrUxExport').onclick"));
assert(source.includes("nativePick("));
assert(source.includes("if(/預排/.test(submit.textContent||''))"),
 'Formal button must never accidentally submit a plan via existing mode-dependent save');
assert(!/\b(?:saveReport|updateSchedule|saveConfig|hrGetOrgOptions)\s*\(/.test(source),
 'New dashboard may not write cloud records or invoke extra backend actions');
assert(original.includes("g.P79MonthlyRestDashboard?.mount(el)"),
 'Actual monthly modal must mount dashboard');
assert(original.includes("port79-monthly-rest-dashboard.js?v=20261123-observer-fix-v2"),
 'Production load path must bypass browser cache');
assert(original.includes("if(!fullDayEvidence(fresh,r.empId,r.date,attendance[0]))"),
 'Official eight-hour attendance guard must remain');
assert(original.includes("if(meta.overtimeReport||meta.overtime||meta.forEmpId"),
 'Existing declaration duplicate guard must remain');
console.log('PASS approved monthly rest dashboard: 4 summary cards, live-source table, filters, status, batch actions, guarded formal submission, existing cloud safeguards unchanged');
