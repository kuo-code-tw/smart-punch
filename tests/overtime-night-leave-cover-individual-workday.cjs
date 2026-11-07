'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const global={};vm.runInNewContext(fs.readFileSync('assets/port79-leave-cover-suggest.js','utf8'),{window:global,Date,Map,Set,Error});
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),{window:global,Date,Intl,Map,Set,TextEncoder});
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-shift-match.js','utf8'),{window:global,Date,Intl,Map,Set});
const api=global.P79LeaveCoverSuggest,date='2026-11-07';
const mid=api.coverWorkday(date,'晚','two',0),early=api.coverWorkday(date,'晚','two',1);
assert.equal(mid.workDate,'2026-11-07');
assert.equal(mid.overtimeDate,'2026-11-07','middle-shift 24-04 credit belongs to original leave night');
assert.equal(mid.code,'延16-04');assert.equal(mid.normalStart,'16');assert.equal(mid.normalEnd,'24');
assert.equal(mid.overtimeStart,'24');assert.equal(mid.overtimeEnd,'04');assert.equal(mid.position,'after');
assert.equal(early.workDate,'2026-11-08','physical clock-in and 08-16 normal shift remain on next day');
assert.equal(early.overtimeDate,'2026-11-07','04-08 overtime credit belongs to original 11/07 leave night');
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
assert.equal(second.workDate,'2026-11-08');assert.equal(second.overtimeDate,'2026-11-07');
assert.match(second.periodHint,/加班歸屬日 2026-11-07/);
assert.match(second.periodHint,/正常班 08-16/);
assert.match(second.periodHint,/平日延時加班 04-08/);
assert.throws(()=>global.P79Overtime.resolveLeaveCoverReport(cloud,context,{date,coverDate:date,empId:'EARLY',forEmpId:'LEAVER'}),/2026-11-08/);
// An approved leave may replace the leaver's current shift cell with 休,
// while the preserved original shift still proves the two 4-hour extensions.
const placeholder=JSON.parse(JSON.stringify(cloud));
placeholder.schedules[0].schedule[date]='休';
placeholder.schedules[0].schedule.__meta={[date]:{leaveOriginalShift:'晚'}};
placeholder.schedules[2].schedule['2026-11-08']='休';
placeholder.schedules[2].schedule.__meta={'2026-11-08':{reportOriginalShift:'早'}};
assert.equal(global.P79Overtime.resolveLeaveCoverReport(placeholder,context,
 {date:'2026-11-08',coverDate:date,empId:'EARLY',forEmpId:'LEAVER'}).code,'延04-16',
 'saved original-shift metadata outranks temporary leave/rest cell');

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
const auditStart=work.indexOf('function p79OvertimeCoverDateWarning(row){');
const auditEnd=work.indexOf('function p79ReportWorkOvertimeRow(',auditStart);
assert(auditStart>=0&&auditEnd>auditStart);
const ctx={window:{P79LeaveCoverSuggest:api},Map,Set,Date,
 normalizeScheduleDateKey:x=>String(x||'').replaceAll('/','-'),
 p79WorkOvertimeMonths:new Map([['2026-11',{
  ready:true,covers:cloud.leaveCoverAssignments,rows:cloud.schedules
 }]])};
vm.createContext(ctx);vm.runInContext(work.slice(auditStart,auditEnd),ctx);
const wrong=ctx.p79OvertimeCoverDateWarning({
 empId:'EARLY',rosterDate:date,forEmpId:'LEAVER',overtimeReport:{id:'OLD-PLAN',planned:true,
 category:'延',normalStart:'08',normalEnd:'16',overtimeStart:'04',overtimeEnd:'08'}
});
assert.equal(wrong?.date,'2026-11-07','legacy one-date report must be reviewed while overtime credit remains on 11/07');
assert.match(wrong.message,/原報單使用單一日期/);
assert.equal(ctx.p79OvertimeCoverDateWarning({
 empId:'MID',rosterDate:date,forEmpId:'LEAVER',overtimeReport:{id:'VALID-PLAN',planned:true,
 category:'延',normalStart:'16',normalEnd:'24',overtimeStart:'24',overtimeEnd:'04'}}),null,
 'mid-shift 24-04 belongs to 11/07 and must not be flagged');

assert(work.includes('function p79OvertimeCoverDateWarning(row)'),'old wrong-date plan is visibly audited');
assert(work.includes('歸屬待核→'),'existing single-date report must warn without silently moving its cloud ID');
assert(work.includes('map[linked.workDate]'),'virtual night-cover plan uses the worker workdate');
assert(work.includes('overtimeDate:linked.overtimeDate'),'virtual night-cover ledger also preserves original-night overtime date');
assert(leave.includes('p79BuildLeaveCoverWorkdayEntries(leaveId,leave.empId,assignments)'),'existing leave covers use the fixed date handoff');
assert(leave.includes('p79BuildLeaveCoverWorkdayEntries(adminCreateLeaveId,employee.empId,assignments)'),'new leave creation also uses the fixed date handoff');
assert(leave.includes("date=String(e?.date||''),coverDate=String(e?.coverDate||date)"),'leave coverage and work dates are separate');
for(const m of work.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
for(const m of leave.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/\bsrc=|application\/json|importmap/.test(m[1])&&m[2].trim())new vm.Script(m[2]);
console.log('PASS night leave: 11/08 04-08 credit -> 11/07, normal 08-16 physically on 11/08; confirmed no duplicate or silent GAS rewrite; scripts parse');
