'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const gasPatch=require('../scripts/apply-gas-overtime-punch-time.cjs');
const root={},logs={info(){},log(){},warn(){},error(){}};
const ctx={window:root,console:logs,Date,Intl,Map,Set};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('attendance/v6-engine.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),ctx);
vm.runInContext(gasPatch.helperSource(),ctx);
const api=root.P79Overtime,engine=root.P79AttendanceV6,day='2026-11-23';
const r=api.report(['延','延20-08',4,6.02,'24','08','20','24','before','平日延時加班']);
const start=Date.parse(day+'T19:36:00+08:00'),end=Date.parse('2026-11-24T07:46:00+08:00');
const cases=[
 ['2026/11/23 19:36:00','2026/11/24 07:46:00'],
 ['115/11/23 19:36','115/11/24 07:46'],
 ['2026-11-23T19:36:00','2026-11-24T07:46:00'],
 ['2026-11-23T11:36:00Z','2026-11-23T23:46:00Z'],
 ['2026-11-23T19:36:00+08:00','2026-11-24T07:46:00+0800']
];
const record=(timeStr,i,empId='WORKER')=>({id:i?'OUT':'IN',empId,attNo:'232',status:i?'下班簽退':'上班簽到',timeStr});
for(const times of cases){
 const data=times.map((t,i)=>record(t,i));
 assert.equal(ctx.p79OvertimePunchEpochV1_(data[0]),start);
 assert.equal(ctx.p79OvertimePunchEpochV1_(data[1]),end);
 const pairs=api.reportAttendancePairs(data,'WORKER',day,r);
 assert.equal(pairs.length,1);
 assert.equal(pairs[0].start,start);assert.equal(pairs[0].end,end);
 assert.equal(api.overtimeMinutes(start,end,day,{overtimeReport:r}),240);
 assert.equal(api.ruleAttendanceIssue(start,end,day,['延','延20-08',4,6.02,'24','08','20','24','before','平日延時加班']),'');
 assert.equal(pairs[0].row.clockIn.id,'IN');assert.equal(pairs[0].row.clockOut.id,'OUT');
}
const isoPairs=engine.buildShifts(cases[3].map((t,i)=>record(t,i)));assert.equal(isoPairs.filter(row=>row.clockIn&&row.clockOut).length,1);
assert.equal(api.reportAttendancePairs([record(cases[0][0],0)],'WORKER',day,r).length,0);
assert.equal(api.reportAttendancePairs(cases[0].map((t,i)=>record(t,i,'OTHER')),'WORKER',day,r).length,0);
assert(Number.isNaN(api.canonicalReportPunchEpoch({timeStr:'2026/11/31 19:36'})));
assert(Number.isNaN(api.canonicalReportPunchEpoch({timeStr:'2026/11/23'})));
assert.throws(()=>api.reportAttendancePairs([record(cases[0][0],0),record('2026/11/23 22:00',0)],'WORKER',day,r),/識別碼/);
const row=['延','延20-08',4,6.02,'24','08','20','24','before','平日延時加班'];
const late=Date.parse(day+'T21:00:00+08:00');
const issue=api.ruleAttendanceIssue(late,end,day,row);
assert.match(issue,/起點不符/);
assert.match(api.reportAttendanceIssueDetail(issue,late,end,day,r),/2026\/11\/23 21:00:00.*2026\/11\/23 20:00:00/);
for(const path of ['leave/index.html','work-hours/index.html','schedule/index.html']){
 const html=fs.readFileSync(path,'utf8');
 assert(html.includes('P79Overtime.reportAttendancePairs(raw,employeeId,draft.date,draft.rule,'),path);
 assert(html.includes('punchTime=20261126-v1'),path);
}
if(process.argv[2])new vm.Script(gasPatch(fs.readFileSync(process.argv[2],'utf8')));
console.log('PASS cross-midnight 19:36–07:46, 240 min, 5 timestamp formats, exact ID/scope, invalid time, missing punch, late-punch guard, 3 hosts');
