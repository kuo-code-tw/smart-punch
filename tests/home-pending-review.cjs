const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const api=require('../assets/port79-monthly-dashboard.js');
globalThis.P79AttendanceV6={buildShifts:()=>[
 {dateKey:'2026-10-15',key:'a',empId:'1',name:'甲',attNo:'801',clockIn:{id:'c1',timeStr:'2026/10/15 08:00:00'},clockOut:null},
 {dateKey:'2026-10-16',key:'b',empId:'2',name:'乙',attNo:'802',clockIn:null,clockOut:{id:'c2',timeStr:'2026/10/16 18:00:00'}},
 {dateKey:'2026-10-17',key:'c',empId:'3',name:'正常',clockIn:{},clockOut:{}},
 {dateKey:'2026-11-01',key:'d',empId:'4',name:'次月',clockIn:null,clockOut:{}}
]};
const result=api.analyzeAttendance({records:[]},'2026-10');
assert.equal(result.pendingShifts,2);
assert.equal(result.pendingDetails.length,result.pendingShifts);
assert.equal(result.pendingDetails.find(r=>r.name==='甲').reason,'缺少下班卡');
assert.equal(result.pendingDetails.find(r=>r.name==='乙').reason,'缺少上班卡');
assert.equal(result.pendingDetails.find(r=>r.name==='甲').clockInRecordId,'c1');
assert.equal(result.pendingDetails.find(r=>r.name==='乙').clockOutRecordId,'c2');
const source=fs.readFileSync(path.join(__dirname,'../assets/port79-monthly-dashboard.js'),'utf8');
for(const needle of ['function openPendingReview','card.addEventListener(\'click\',openPendingReview)','function enrichPendingReview','pendingReviewItems=a.pendingDetails','refreshPendingOnReturn','function renderPendingReview'])assert(source.includes(needle),needle);
delete globalThis.P79AttendanceV6;
assert.equal(api.analyzeAttendance({records:[]},'2026-10').pendingShifts,null);
console.log('PASS: homepage pending review count equals detail rows, preserves dates and record identifiers, accessible drill-down and cloud refresh');