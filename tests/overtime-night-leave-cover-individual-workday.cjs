'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const global={};vm.runInNewContext(fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8'),{window:global,Date,Map,Set,Error});
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),{window:global,Date,Intl,Map,Set,TextEncoder});
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-shift-match.js','utf8'),{window:global,Date,Intl,Map,Set});
const api=global.P79LeaveCoverSuggest,date='2026-11-07';
const mid=api.coverWorkday(date,'晚','two',0),early=api.coverWorkday(date,'晚','two',1);
assert.equal(mid.workDate,'2026-11-07');
assert.equal(mid.code,'延16-04');assert.equal(mid.normalStart,'16');assert.equal(mid.normalEnd,'24');
assert.equal(mid.overtimeStart,'24');assert.equal(mid.overtimeEnd,'04');assert.equal(mid.position,'after');
assert.equal(early.workDate,'2026-11-08','second night-cover worker belongs to the next early-shift workday');
assert.equal(early.code,'延04-16');assert.equal(early.normalStart,'08');assert.equal(early.normalEnd,'16');
assert.equal(early.overtimeStart,'04');assert.equal(early.overtimeEnd,'08');assert.equal(early.position,'before');
const cloud={leaveCoverAssignments:[{leaveId:'L1',leaveEmpId:'LEAVER',workerIds:['MID','EARLY'],mode:'two',startDate:date,endDate:date}],
 schedules:[{empId:'LEAVER',schedule:{[date]:'晚'}},{empId:'MID',schedule:{[date]:'中'}},
 {empId:'EARLY',schedule:{[date]:'早','2026-11-08':'早'}}]};
const context={id:'L1'};
const first=global.P79Overtime.resolveLeaveCoverReport(cloud,context,{date,coverDate:date,empId:'MID',forEmpId:'LEAVER'});
const second=global.P79Overtime.resolveLeaveCoverReport(cloud,context,{date:'2026-11-08',coverDate:date,empId:'EARLY',forEmpId:'LEAVER'});
assert.equal(first.code,'延16-04');assert.equal(first.requirePeriodSelection,false);
assert.equal(second.code,'延04-16');assert.equal(second.requirePeriodSelection,false);
assert.match(second.periodHint,/正常班 08-16/);
assert.match(second.periodHint,/平日延時加班 04-08/);
assert.throws(()=>global.P79Overtime.resolveLeaveCoverReport(cloud,context,{date,coverDate:date,empId:'EARLY',forEmpId:'LEAVER'}),/2026-11-08/);
assert.equal(api.coverWorkday(date,'中','two',1),null,'unknown split is not guessed');
assert.equal(api.coverWorkday(date,'晚','one',1),null,'single-worker coverage is unchanged');
assert.equal(api.coverWorkday(date,'早','two',0).workDate,'2026-11-06','early leave first worker follows prior night workday');
const earlyRule=global.P79Overtime.report(['延','延04-16',4,6.02,'08','16','04','08','before']);
const normalIn=Date.parse('2026-11-07T07:39:00+08:00'),normalOut=Date.parse('2026-11-07T16:00:00+08:00');
assert.match(global.P79Overtime.ruleAttendanceIssue(normalIn,normalOut,date,
 ['延','延04-16',4,6.02,'08','16','04','08','before'],{[date]:'早'}),/打卡上班時間/);
assert.equal(global.P79OvertimeShiftMatch.resolve({date,roster:{[date]:'早'},report:{category:'延'},rules:[
 ['延','延04-16',4,6.02,'08','16','04','08','before']],start:normalIn,end:normalOut,attendanceIssue:false}).confirmed,false,
 '07:39-16:00 normal shift cannot verify a 04-08 four-hour overtime');
const chenRule=global.P79Overtime.report(['延','延16-04',4,6.02,'16','24','24','04','after']);
assert.equal(global.P79Overtime.overtimeMinutes(Date.parse('2026-11-07T15:36:00+08:00'),
 Date.parse('2026-11-08T03:46:00+08:00'),date,{overtimeReport:chenRule}),226);
assert.equal(global.P79Overtime.overtimeMinutes(Date.parse('2026-11-08T03:37:00+08:00'),
 Date.parse('2026-11-08T16:00:00+08:00'),'2026-11-08',{overtimeReport:earlyRule}),240);
const work=fs.readFileSync('work-hours/index.html','utf8'),leave=fs.readFileSync('leave/index.html','utf8');
assert(work.includes('function p79OvertimeCoverDateWarning(row)'),'old wrong-date plan is visibly audited');
assert(work.includes('日期待更正→'),'existing wrong-date plan must display a warning, never silently move its cloud ID');
assert(work.includes('map[linked.workDate]'),'virtual night-cover plan uses the worker workdate');
assert(leave.includes('p79BuildLeaveCoverWorkdayEntries(leaveId,leave.empId,assignments)'),'existing leave covers use the fixed date handoff');
assert(leave.includes('p79BuildLeaveCoverWorkdayEntries(adminCreateLeaveId,employee.empId,assignments)'),'new leave creation also uses the fixed date handoff');
assert(leave.includes("date=String(e?.date||''),coverDate=String(e?.coverDate||date)"),'leave coverage and work dates are separate');
for(const m of work.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
for(const m of leave.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|application\/json|importmap/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
console.log('PASS night leave: Chen 11/07 16-24 + 24-04; Huang 11/07 normal 08-16, 11/08 cover 04-16 with 04-08 overtime; no old-date false confirmation; scripts parse');
