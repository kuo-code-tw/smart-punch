'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('aqc-efficiency/index.html','utf8');
const begin=src.indexOf('const P79_WR_5260210_SOURCE_CLOCKS=[');
const end=src.indexOf('let p79LegacyWorkingClockRepairBusy=false;',begin);
assert.ok(begin>=0 && end>begin);
const c={normalizeAqcNo:v=>String(v||'').replace(/[^0-9]/g,'')};vm.createContext(c);
vm.runInContext(src.slice(begin,end),c);
const shifted=(start,end,hours,date='2026-11-05',no='5260225',aqc='8005')=>({
 id:'WR_'+no+'_'+aqc+'_'+date+'_DRIVER_'+start.replace(':','')+'_'+end.replace(':',''),
 source:'working-report',workDate:date,workingNo:no,number:aqc,
 startTime:c.p79AddClockHours(start,hours),endTime:c.p79AddClockHours(end,hours),
 workingSheetRuleVersion:'IN_HATCH_X1__SHIFT_X2__BILL_DISC_LOAD__V19',
 disc:45,load:23,hatches:1,containers:68,timeHours:2,rawDisc:45,rawLoad:23,bundleDeduct:1,gph:34.5
});
const a=shifted('09:02','12:00',-8);
const b=shifted('22:00','00:00',8);
const d=shifted('00:00','00:41',8,'2026-11-06');
const rows=[a,b,d];
const out=c.p79RepairKnownLegacyWorkingClocks(rows);
assert.equal(out.changed,3);
assert.deepEqual(out.records.map(x=>[x.startTime,x.endTime]),[['09:02','12:00'],['22:00','00:00'],['00:00','00:41']]);
for(const row of out.records){assert.equal(row.disc,45);assert.equal(row.load,23);assert.equal(row.timeHours,2);assert.equal(row.gph,34.5);assert.equal(row.bundleDeduct,1);}
assert.equal(c.p79RepairKnownLegacyWorkingClocks(out.records).changed,0);
assert.equal(c.p79RepairKnownLegacyWorkingClocks([{...a,startTime:'03:15'}]).changed,0);
assert.equal(c.p79RepairKnownLegacyWorkingClocks([{...a,editedAt:'manual'}]).changed,0);
assert.equal(c.p79RepairKnownLegacyWorkingClocks([{...a,workDate:'2026-11-10'}]).changed,0);
assert.equal(c.p79RepairKnownLegacyWorkingClocks([{...a,source:'manual'}]).changed,0);
console.log('PASS: WORKING REPORT local cache repairs precisely +/-8-hour shifts without touching manual edits or metrics');
