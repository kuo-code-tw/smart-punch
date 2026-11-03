'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
function extract(name){
  const start=html.indexOf('        function '+name+'(');
  assert(start>=0,'missing '+name);
  const end=html.indexOf('\n        }',start);
  assert(end>start,'missing end of '+name);
  return html.slice(start,end+10);
}
const ctx={Number,Math,Array};vm.createContext(ctx);
vm.runInContext(extract('p79UnreportedOvertimeSummary'),ctx);
const rows=[
  {empId:'A',overtimeMinutes:248,reportVerified:false,planned:false,timeCheckRequired:false},
  {empId:'B',overtimeMinutes:261,reportVerified:false,planned:false,timeCheckRequired:false},
  {empId:'C',overtimeMinutes:480,reportVerified:true},
  {empId:'D',overtimeMinutes:240,planned:true},
  {empId:'E',overtimeMinutes:180,timeCheckRequired:true},
  {empId:'F',overtimeMinutes:NaN},
  {empId:'G',overtimeMinutes:0}
];
const pending=ctx.p79UnreportedOvertimeSummary(rows);
assert.equal(pending.minutes,509,'Nov 2 punch estimates 4h08+4h21 must be visible as 8h29');
assert.equal(pending.count,2,'pending count matches the two unreported shifts');
assert.equal(ctx.p79UnreportedOvertimeSummary(rows.slice(0,1)).minutes,248,'filter scope changes pending sum');
assert.equal(ctx.p79UnreportedOvertimeSummary(rows.slice(2)).minutes,0,'official, planned and invalid shifts never become pending');
assert(html.includes('id="overtimePendingEstimateHours"'),'pending hours card is visible');
assert(html.includes('p79UnreportedOvertimeSummary(rows)'),'pending hours derive from filtered current page scope, not cloud mutation');
assert(html.includes("document.getElementById('overtimePendingEstimateHours').textContent = formatDurationMinutes(pendingEstimate.minutes)"));
assert(html.includes("document.getElementById('overtimeRawReportedHours').textContent = rawMinutes%60?formatDurationMinutes(rawMinutes)"),'raw overtime cards must show even minute-level values');
assert(html.includes("document.getElementById('overtimeTotalHours').textContent = totals.missing?"),'missing cloud conversion must not display misleading 0.00');
assert(html.includes('const attendanceSignature=JSON.stringify([sourceRecords,visibleEmployees]);'));
assert.equal((html.match(/const attendanceSignature=JSON.stringify\(\[sourceRecords,visibleEmployees\]\);/g)||[]).length,1,'avoid double punch serialization');
assert(html.includes('const declaration=specialOvertimeMinutes>0?'),'non-special shifts skip needless period lookup');
console.log('PASS 2026-11-02 4h08+4h21 pending totals 8h29, filter changes, official-vs-estimate separation, optimized recompute path');
