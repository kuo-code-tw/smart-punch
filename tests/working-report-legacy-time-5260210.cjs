'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const page = fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
const start = page.indexOf('const P79_WR_5260210_SOURCE_CLOCKS=[');
const end = page.indexOf('let p79LegacyWorkingClockRepairBusy=false;',start);
assert.ok(start>0 && end>start,'legacy clock patch functions missing');
const ctx={normalizeAqcNo:v=>String(v??'').replace(/[^0-9]/g,'')};
vm.createContext(ctx);
vm.runInContext(page.slice(start,end),ctx);
const source = vm.runInContext('P79_WR_5260210_SOURCE_CLOCKS',ctx);
const plus = (t,h)=>ctx.p79AddClockHours(t,h);
const fix = rows=>ctx.p79RepairKnownLegacyWorkingClocks(rows);
assert.equal(plus('09:02',8),'17:02');
assert.equal(plus('22:00',8),'06:00');
assert.equal(plus('00:41',8),'08:41');
const original=source.map((r,i)=>({
 id:'rec'+i,workingNo:'5260210',number:r[0],sourceRow:r[1],source:'working-report',
 startTime:plus(r[2],8),endTime:plus(r[3],8),workDate:'2026-11-07',
 workingSheetRuleVersion:'IN_HATCH_X1__SHIFT_X2__BILL_DISC_LOAD__V19',
 disc:i,load:i+3,timeHours:i+0.5,bundleDeduct:i===5?1:0
}));
const result=fix(original);
assert.equal(result.changed,14);
result.records.forEach((row,i)=>{
 const [aqc,sourceRow,start,end,date]=source[i];
 assert.equal(row.number,aqc);
 assert.equal(row.sourceRow,sourceRow);
 assert.equal(row.startTime,start);
 assert.equal(row.endTime,end);
 assert.equal(row.workDate,date);
 assert.equal(row.disc,i);
 assert.equal(row.load,i+3);
 assert.equal(row.timeHours,i+0.5);
 assert.equal(row.bundleDeduct,i===5?1:0);
});
assert.equal(fix(result.records).changed,0);
const stale={...result.records[0],startTime:original[0].startTime,endTime:original[0].endTime};
assert.equal(fix([stale]).changed,1,'cloud must not reintroduce +8h');
assert.equal(fix([{...original[0],startTime:'18:22'}]).changed,0,'do not overwrite manual edits');
assert.equal(fix([{...original[0],workingNo:'5260210-2'}]).changed,0,'do not touch sibling jobs');
assert.equal(fix([{...original[0],workingSheetRuleVersion:'IN_HATCH_X1__SHIFT_X2__BILL_DISC_LOAD__V20_EXCEL_LOCAL_CLOCK'}]).changed,0,'do not modify corrected imports');
const noSourceRow={...original[0]};
delete noSourceRow.sourceRow;
assert.equal(fix([noSourceRow]).changed,1,'allow unique verified time when legacy sourceRow was dropped');
console.log('PASS 14 legacy WORKING REPORT clocks, midnight, quantities unchanged, cloud regression and safety guards');
