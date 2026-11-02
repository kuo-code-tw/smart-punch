'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const engine=require('../attendance/v6-engine.js');
const raw=(id,emp,attNo,status,time)=>({id,empId:emp,attNo,name:emp,
  status:status==='IN'?'上班簽到':'下班簽退',timeStr:time,source:'manual-admin'});
const person='AP264',att='264';
const example=[
  raw('I1',person,att,'IN','2026/10/01 15:51'),
  raw('O1',person,att,'OUT','2026/10/01 23:50'),
  raw('I2',person,att,'IN','2026/10/01 15:32'),
  raw('O2',person,att,'OUT','2026/10/01 23:46')
];
const before=JSON.stringify(example);
const result=engine.buildShifts(example),complete=result.filter(x=>x.clockIn&&x.clockOut);
assert.equal(complete.length,2,'do not silently drop an original completed shift');
assert(complete.every(x=>x.overlapIssue===true),'both screenshot rows must be flagged');
assert(complete.every(x=>x.attendanceStatus==='同人班次重疊待核'));
assert(complete.every(x=>x.overlapPeerCount===1&&x.overlapMinutes===475));
assert(complete.every(x=>x.attendanceCheckLabels.includes('同人班次時段重疊待核')));
assert.equal(JSON.stringify(example),before,'raw punch times and records remain unchanged');
assert.equal(new Set(complete.flatMap(x=>x.records.map(r=>r.id))).size,4,'four original sides remain recoverable');

const html=fs.readFileSync('attendance/index.html','utf8');
function f(name){
  const start=html.indexOf('        function '+name+'(');
  assert(start>=0,name);
  const end=html.indexOf('\n        }',start);
  assert(end>start,name);
  return html.slice(start,end+10);
}
const view={Date,Number,String,getAttendanceTimestamp:r=>{
  const text=String(r.timeStr||'').replaceAll('/','-').replace(' ','T');
  return new Date(text).getTime();
}};
vm.createContext(view);
for(const name of ['p79AttendanceRowAssessment','p79FilterAttendanceStatus'])
  vm.runInContext(f(name),view);
const abnormal=view.p79FilterAttendanceStatus(complete,'ABNORMAL',new Date('2026-11-02T00:00:00').getTime());
assert.equal(abnormal.length,2,'both overlapping complete shifts are listed in the month-wide abnormal filter');
assert(abnormal.every(r=>r.attendanceStatus==='同人班次重疊待核'));
assert(abnormal.every(r=>r.attendanceAssessmentReasons.some(t=>t.includes('475 分鐘'))));
assert.equal(view.p79FilterAttendanceStatus(complete,'NORMAL').length,0);

function session(emp,attNo,inTime,outTime){
  return [raw('IN-'+emp+'-'+inTime,emp,attNo,'IN',inTime),raw('OUT-'+emp+'-'+outTime,emp,attNo,'OUT',outTime)];
}
const normal=engine.buildShifts([
  ...session('E45','45','2026/10/01 07:30','2026/10/01 15:30'),
  ...session('E45','45','2026/10/01 15:30','2026/10/01 23:30'),
  ...session('E46','46','2026/10/01 15:51','2026/10/01 23:50')
]);
assert.equal(normal.length,3,'valid same-person split and different employee retained');
assert(normal.every(r=>!r.overlapIssue),'adjacent sessions and other people never flagged');
const cross=engine.buildShifts([
  ...session('E65','65','2026/10/31 23:30','2026/11/01 07:45'),
  ...session('E65','65','2026/11/01 08:00','2026/11/01 16:00')
]);
assert.equal(cross.length,2);assert(cross.every(r=>!r.overlapIssue),'adjacent cross-month and next-day shifts are separate');
assert.equal(cross.find(r=>r.accountingMonthKey==='2026-10').clockOut.timeStr,'2026/11/01 07:45:00');
const overlapAcrossMidnight=engine.buildShifts([
  ...session('E80','80','2026/10/31 23:30','2026/11/01 07:45'),
  ...session('E80','80','2026/11/01 06:30','2026/11/01 13:30')
]);
assert(overlapAcrossMidnight.every(x=>x.overlapIssue),'physical overlap across month must be flagged');
const other=engine.buildShifts([...example,...session('E65','65','2026/10/01 15:51','2026/10/01 23:50')]);
assert.equal(other.filter(x=>x.overlapIssue).length,2,'flag only implicated employee, never all company');
const hourHtml=fs.readFileSync('work-hours/index.html','utf8');
assert(html.includes('v6-engine.js?v=20261101-ship-workday-tooltip&overlap=20261102'));
assert(hourHtml.includes('v6-engine.js?v=20261101-ship-workday-tooltip&overlap=20261102'));
assert(html.includes('&& !row.overlapIssue'),'inline overtime button must be suppressed on overlap');
assert(html.includes('同人完整班次時段重疊待核'),'existing duplicate audit panel lists overlaps separately');
assert(html.includes('p79DuplicateReviewRows = list;'),'automatic duplicate deletion remains limited to original confirmed near-duplicates');
const issueStart=hourHtml.indexOf('function p79OvertimeAttendanceIssue(session,start,end) {');
const issueEnd=hourHtml.indexOf('\n        }',issueStart);
assert(issueStart>=0&&issueEnd>issueStart,'work-hours overtime issue function exists');
const hCtx={Number,Date};vm.createContext(hCtx);vm.runInContext(hourHtml.slice(issueStart,issueEnd+10),hCtx);
const out=hCtx.p79OvertimeAttendanceIssue(complete[0],0,0);
assert.match(out,/同人完整出勤班次重疊待核/,'overlap blocks automatic overtime estimation for all staff');


const ov=fs.readFileSync('assets/port79-attendance-overtime.js','utf8');
assert(ov.includes('officialRows.some(row=>row.overlapIssue'),'cloud-saving must recheck official overlapping pairs');
assert(ov.includes('sessions.some(p=>p.row.overlapIssue'),'official prefill cannot select one overlapping pair');
assert(ov.includes("if(row?.overlapIssue)throw Error"),'overtime dialog cannot open stale overlapping row');
for(const page of [html,hourHtml])
 for(const match of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
  if(!/\bsrc=|application\/json|importmap/.test(match[1])&&match[2].trim())new vm.Script(match[2]);
console.log('PASS October 1 #264 two complete overlapping manual pairs flagged; all staff, shifts, month boundary, source integrity, anomaly filter, overtime safeguards, scripts');
