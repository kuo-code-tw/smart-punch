
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../aqc-efficiency/driver-workstation-dashboard.js'), 'utf8');
const root = {};
const document = {readyState:'loading',addEventListener(){}};
const context = {
  window: root, document, Intl, Set, Map, Math, Number, String, Array,
  normalizeAqcNo: v=>String(v||'').replace(/^AQC/i,''),
  workloadRecordMetrics:r=>({disc:r.disc,load:r.load,hc:r.hc,hours:r.hours}),
  effectiveBundleRecord:r=>({bundleDeduct:r.bundle||0})
};
vm.createContext(context);
vm.runInContext(src,context);
const api=root.P79DriverDashboard;
const row=(id,workingNo,date,aqc,disc,load,hc,hours,bundle=0)=>({id,workingNo,workDate:date,number:aqc,disc,load,hc,hours,bundle,name:id});
const all=[row('A','5260218','2026-11-10','7901',10,20,1,2,2),
           row('B','5260218','2026-11-10','7902',5,15,0,1),
           row('C','5260218','2026-11-09','7901',20,10,1,2)];
let x=api.build({allRows:all,visibleRows:all,audit:{status:'match'},readStatus:'ready'});
assert.equal(x.full.containers,80);
assert.equal(x.full.disc,35);assert.equal(x.full.load,45);
assert.equal(x.full.bundle,2);assert.equal(x.full.hc,2);
assert.equal(x.full.hours,5);assert.equal(x.full.gph,16.4);
assert.equal(x.cranes.length,2);assert.equal(x.cranes[0].totals.containers,60);
assert.deepEqual([...x.days.map(d=>d.date)],['2026-11-10','2026-11-09']);
assert.equal(x.status,'match');assert.equal(x.integrity,true);
let filtered=api.build({allRows:all,visibleRows:[all[1]],audit:{status:'match'},readStatus:'ready'});
assert.equal(filtered.full.containers,80);
assert.equal(filtered.visible.containers,20);
assert.equal(filtered.cranes.reduce((s,g)=>s+g.totals.containers,0),80);
assert.equal(filtered.days[0].totals.containers,20);
assert.equal(filtered.status,'match');
for(const readStatus of ['', 'loading','partial','error']) {
  x=api.build({allRows:all,visibleRows:all,audit:{status:'match'},readStatus});
  assert.equal(x.status,'pending');
}
assert.equal(api.build({allRows:all,visibleRows:all,audit:{status:'mismatch'},readStatus:'ready'}).status,'mismatch');
assert.equal(api.build({allRows:all,visibleRows:all,audit:{status:'match'},readStatus:'ready',ambiguous:true}).status,'pending');
const bad=[...all,{...all[0],id:'D',workDate:''}];
assert.equal(api.build({allRows:bad,visibleRows:bad,audit:{status:'match'},readStatus:'ready'}).status,'mismatch');
const zero=api.sum([{name:'Zero',disc:0,load:0,hc:0,hours:0}]);
assert.equal(zero.gph,null);
assert.equal(/apiPost\(|saveLocal\(|fetch\(/.test(src),false,'Dashboard must be presentation-only');
console.log('PASS driver dashboard: metrics, filtered totals, AQC sum, daily sum, source states, invalid date, zero-hours, read-only');
