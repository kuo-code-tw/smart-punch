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
assert.match(result.pendingDetails.find(r=>r.name==='甲').explanation,/上班打卡/);
assert.match(result.pendingDetails.find(r=>r.name==='乙').explanation,/下班打卡/);
assert.match(result.pendingDetails.find(r=>r.name==='甲').suggestion,/補登下班卡/);
assert.match(result.pendingDetails.find(r=>r.name==='乙').suggestion,/補登上班卡/);
const markup=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
assert.match(markup,/<button[^>]+id="p79DashPendingReviewTrigger"/);
assert.match(markup,/id="p79DashReviewHint"/);
assert.match(markup,/port79-monthly-dashboard\.js\?v=20261031-ship-schedule-board-v1/);
const css=fs.readFileSync(path.join(__dirname,'../assets/port79-monthly-dashboard.css'),'utf8');
assert.match(css,/p79d-kpi-review:focus-visible/);
const source=fs.readFileSync(path.join(__dirname,'../assets/port79-monthly-dashboard.js'),'utf8');
for(const needle of ['function openPendingReview','card.addEventListener(\'click\',openPendingReview)','function enrichPendingReview','pendingReviewItems=a.pendingDetails','function renderPendingReview','function refreshPendingReviewFromCloud','系統為什麼列為待核？'])assert(source.includes(needle),needle);
assert(!source.includes('refreshPendingOnReturn'),'首頁不可在重新取得焦點時背景刷新考勤');
assert(!source.includes("root.addEventListener('focus'"),'首頁不可註冊自動焦點重讀');
assert(!source.includes("root.document.addEventListener('visibilitychange'"),'首頁不可註冊背景重讀');
delete globalThis.P79AttendanceV6;
assert.equal(api.analyzeAttendance({records:[]},'2026-10').pendingShifts,null);
console.log('PASS: homepage pending review count equals detail rows, preserves dates and record identifiers, accessible drill-down and cloud refresh');