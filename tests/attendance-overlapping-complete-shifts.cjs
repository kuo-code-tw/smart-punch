'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const engine=require('../attendance/v6-engine.js');
const raw=(id,emp,attNo,status,time)=>({id,empId:emp,attNo,name:emp,
  status:status==='IN'?'上班簽到':'下班簽退',timeStr:time,source:'manual-admin'});
const linkedPair=(prefix,emp,attNo,inTime,outTime)=>{
  const i=raw(prefix+'-IN',emp,attNo,'IN',inTime);
  const o=raw(prefix+'-OUT',emp,attNo,'OUT',outTime);
  i.v5PairTargetId=o.id;o.v5PairTargetId=i.id;return [i,o];
};
const person='AP264',att='264';
const example=[
  ...linkedPair('G1',person,att,'2026/10/01 15:51','2026/10/01 23:50'),
  ...linkedPair('G2',person,att,'2026/10/01 15:32','2026/10/01 23:46')
];
const before=JSON.stringify(example);
const result=engine.buildShifts(example),complete=result.filter(x=>x.clockIn&&x.clockOut);
assert.equal(complete.length,1,'overlapping versions of one scheduled shift render once');
assert.equal(complete[0].clockIn.timeStr,'2026/10/01 15:51:00');
assert.equal(complete[0].clockOut.timeStr,'2026/10/01 23:50:00');
assert.equal(complete[0].shiftAligned,true,'primary shift flagged as scheduled alignment');
assert.equal(complete[0].shiftAlignedAlternateCount,1,'other complete version retained as read-only audit');
assert.equal(complete[0].overlapIssue,undefined,'selected, well-aligned shift is not unresolved');
assert.equal(complete[0].duplicateRecordCount,0,'never pass suppressed pairs to cloud duplicate deletion');
assert.equal(JSON.stringify(example),before,'raw punch times and records remain unchanged');
assert.equal(new Set([complete[0],...complete[0].shiftAlignedAlternates].flatMap(x=>x.records.map(r=>r.id))).size,4,'four original sides remain recoverable');

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
assert.equal(abnormal.length,0,'high-confidence nearest scheduled shift is not double-counted as abnormal');
assert.equal(view.p79FilterAttendanceStatus(complete,'NORMAL').length,1,'selected shift stays in normal attendance');

const oct02=engine.buildShifts([
  ...linkedPair('Z1','AN1150010','472','2026/10/02 15:36','2026/10/02 23:47'),
  ...linkedPair('Z2','AN1150010','472','2026/10/02 15:34','2026/10/02 17:47')
]);
assert.equal(oct02.length,1,'10/02 #472 must display one scheduled shift');
assert.equal(oct02[0].clockIn.timeStr,'2026/10/02 15:36:00');
assert.equal(oct02[0].clockOut.timeStr,'2026/10/02 23:47:00');
assert.equal(oct02[0].shiftAlignedAlternateCount,1);
const morning=engine.buildShifts([
  ...linkedPair('M1','AP0920091','248','2026/10/01 07:35','2026/10/01 15:55'),
  ...linkedPair('M2','AP0920091','248','2026/10/01 07:31','2026/10/01 15:47')
]);
assert.equal(morning.length,1,'08-16 follows the same nearest-boundary rule');
assert.equal(morning[0].clockIn.timeStr,'2026/10/01 07:35:00');
assert.equal(morning[0].clockOut.timeStr,'2026/10/01 15:55:00');
const lateAnother=engine.buildShifts([
  ...linkedPair('H1','AP1080060','293','2026/10/02 15:34','2026/10/02 23:48'),
  ...linkedPair('H2','AP1080060','293','2026/10/02 15:39','2026/10/02 23:50'),
  ...linkedPair('H3','AP1080060','293','2026/10/02 15:34','2026/10/02 17:46')
]);
const h293Complete=lateAnother.filter(x=>x.clockIn&&x.clockOut);
assert.equal(h293Complete.length,1,'all 16-24 personnel: only one completed #293 shift counts');
assert.equal(h293Complete[0].clockIn.timeStr,'2026/10/02 15:39:00');
assert.equal(h293Complete[0].clockOut.timeStr,'2026/10/02 23:50:00');
assert(lateAnother.filter(x=>!x.clockIn||!x.clockOut).every(x=>x.attendanceStatus!=='正常'),
  'unused orphan punches remain visible for review, never count as completed hours');
// A corrected 15:50 OUT and its previous 16:50 version share exactly
// one record ID. The edited sourceEventKey identifies the superseded time.
const in240=raw('W-IN','AP0900032','240','IN','2026/10/30 07:40');
const previous240=raw('W-OUT','AP0900032','240','OUT','2026/10/30 16:50');
const corrected240={...previous240,timeStr:'2026/10/30 15:50',
  manuallyEdited:true,manuallyEditedAt:'2026-10-30T09:04:44.015Z',
  sourceEventKey:'240|2026/10/30 16:50|下班簽退'};
const correctedRows=engine.buildShifts([in240,previous240,corrected240]);
const correctedComplete=correctedRows.filter(x=>x.clockIn&&x.clockOut);
assert.equal(correctedComplete.length,1,'same-ID corrected OUT must not create a second shift');
assert.equal(correctedComplete[0].clockOut.timeStr,'2026/10/30 15:50:00',
  'confirmed later edit must take priority over original earlier version');
const night=engine.buildShifts([
  ...linkedPair('N1','NIGHT','455','2026/10/01 23:30','2026/10/02 07:48'),
  ...linkedPair('N2','NIGHT','455','2026/10/01 23:38','2026/10/02 07:46')
]);
assert.equal(night.length,1,'00-08 cross-day shift follows same rule');
assert.equal(night[0].clockIn.timeStr,'2026/10/01 23:38:00');
assert.equal(night[0].clockOut.timeStr,'2026/10/02 07:48:00','07:48 is closer to scheduled 08:00 end');
const unresolved=engine.buildShifts([
  ...linkedPair('U1','UNKNOWN','456','2026/10/01 23:40','2026/10/02 01:00'),
  ...linkedPair('U2','UNKNOWN','456','2026/10/01 23:36','2026/10/02 02:00')
]);
assert.equal(unresolved.length,2,'no near-shift-end clock-out: keep both pending, do not invent 8 hours');
assert(unresolved.every(x=>x.overlapIssue),'unresolved overlaps remain visible and block overtime');
assert.equal(view.p79FilterAttendanceStatus(unresolved,'ABNORMAL').length,2);

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
const crossAdjacent=engine.buildShifts([
  ...linkedPair('CJ1','AN1140010','428','2026/09/30 23:37','2026/10/01 07:49'),
  ...linkedPair('CJ2','AN1140010','428','2026/10/01 07:33','2026/10/01 15:48')
]);
assert.equal(crossAdjacent.length,2,'genuine 00-08 and 08-16 sessions remain separate');
assert(crossAdjacent.every(x=>x.overlapIssue===true),'16-minute cross-shift overlap remains an abnormal review');
const other=engine.buildShifts([...example,...session('E65','65','2026/10/01 15:51','2026/10/01 23:50')]);
assert.equal(other.filter(x=>x.shiftAligned).length,1,'only the conflict owner is aligned');
assert.equal(other.filter(x=>x.overlapIssue).length,0);
assert.equal(other.length,2,'an unrelated employee is never suppressed');
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
const out=hCtx.p79OvertimeAttendanceIssue(unresolved[0],0,0);
assert.match(out,/同人完整出勤班次重疊待核/,'overlap blocks automatic overtime estimation for all staff');


const ov=fs.readFileSync('assets/port79-attendance-overtime.js','utf8');
assert(ov.includes('officialRows.some(row=>row.overlapIssue'),'cloud-saving must recheck official overlapping pairs');
assert(ov.includes('sessions.some(p=>p.row.overlapIssue'),'official prefill cannot select one overlapping pair');
assert(ov.includes("if(row?.overlapIssue)throw Error"),'overtime dialog cannot open stale overlapping row');
for(const page of [html,hourHtml])
 for(const match of page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))
  if(!/\bsrc=|application\/json|importmap/.test(match[1])&&match[2].trim())new vm.Script(match[2]);
console.log('PASS nearest 16-24 / 08-16 / 00-08 shift selection, Oct 02 #472, unresolved guards, boundaries and raw history');
