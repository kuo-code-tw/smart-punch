'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname,'../aqc-efficiency/driver-workstation-dashboard.js'),'utf8');
const root = {};
const context = {
  window:root,document:{readyState:'loading',addEventListener(){}},Intl,Set,Map,Math,Number,String,Array,
  normalizeAqcNo:r=>String(r||'').replace(/^AQC/i,''),
  displayPersonName:r=>String(r||''),
  operationGroupForRecord:r=>r.group||'',
  workloadRecordMetrics:r=>({disc:r.disc,load:r.load,hc:r.hc,hours:r.hours}),
  effectiveBundleRecord:r=>({bundleDeduct:r.bundle||0})
};
vm.createContext(context);
vm.runInContext(src,context);
const api=root.P79DriverDashboard;
const rows=[
 {id:'A',workingNo:'5260218',shipName:'TEST SHIP',voyage:'V001',name:'司機A',group:'A組',number:'AQC7901',workDate:'2026-11-09',startTime:'08:00',endTime:'14:11',disc:86,load:46,hc:3,hours:6.11,bundle:2}
];
const x=api.build({allRows:rows,visibleRows:rows,audit:{status:'match'},readStatus:'ready'});
assert.equal(x.full.containers,132);
assert.equal(x.visible.disc,86);
assert.equal(x.visible.load,46);
assert.equal(x.visible.hc,3);
assert.equal(x.visible.hours,6.11);
assert.equal(x.visible.bundle,2);
assert.equal(x.visible.gph,22.09);
assert.equal(x.days.length,1);
assert.equal(x.days[0].drivers[0],'司機A');
assert.equal(x.days[0].aqcs[0],'7901');
assert.equal(x.details[0].workingNo,'5260218');
assert.equal(x.details[0].vessel,'TEST SHIP');
assert.equal(x.details[0].group,'A組');
assert.equal(x.details[0].period,'08:00 ～ 14:11');
assert.equal(x.details[0].containers,132);
assert.equal(x.details[0].gph,22.09);
const single=api.trendMarkup(x.days);
assert(single.includes('唯一作業日'));
assert(single.includes('132'));
assert(!single.includes('<svg'),'one day must not pretend to form a trend');
assert(api.craneBarsMarkup(x.visibleCranes).includes('AQC 7901'));
assert(api.craneBarsMarkup(x.visibleCranes).includes('只有 1 台 AQC'));
const another={...rows[0],id:'B',name:'司機B',number:'AQC7902',workDate:'2026-11-10',disc:15,load:20,hc:0,hours:2};
const two=api.build({allRows:[...rows,another],visibleRows:[...rows,another],audit:{status:'match'},readStatus:'ready'});
assert.equal(two.full.containers,167);
assert.equal(two.details.length,2);
assert.equal(two.days.length,2);
assert.equal(two.visibleCranes.length,2);
assert(api.trendMarkup(two.days).includes('<svg'));
assert.equal(two.full.containers,two.days.reduce((s,d)=>s+d.totals.containers,0));
const filtered=api.build({allRows:[...rows,another],visibleRows:[another],audit:{status:'match'},readStatus:'ready'});
assert.equal(filtered.full.containers,167,'full-ship scope preserved across filters');
assert.equal(filtered.visible.containers,35,'filtered daily quantities remain independent');
assert.equal(filtered.visibleCranes.length,1);
assert.equal(filtered.details.length,1);
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
assert(html.includes('driver-workstation-dashboard.js?v=20261111-v2'));
assert(html.includes('driver-workstation-dashboard.css?v=20261111-v2'));
assert(src.includes('WORKING REPORT｜逐筆來源明細'));
assert(src.includes('作業日期'));
assert(src.includes('p79driverDayFoot'));
assert(!/apiPost\(|saveLocal\(|fetch\(/.test(src),'statistics must remain read-only');
console.log('PASS driver workstation data explanation: single-day metrics, raw records, AQC, multi-day, filters, sources, version');
