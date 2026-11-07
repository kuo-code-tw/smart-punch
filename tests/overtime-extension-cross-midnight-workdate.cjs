'use strict';
// A post-midnight 24-04 extension belongs to the prior day's 16-24 shift.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const g={};
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-report.js','utf8'),{window:g,Date,Intl,Map,Set,TextEncoder});
vm.runInNewContext(fs.readFileSync('assets/port79-overtime-shift-match.js','utf8'),{window:g,Date,Intl,Map,Set});
const api=g.P79Overtime,workday='2026-11-06';
const at=s=>Date.parse(s);
const start=at('2026-11-06T15:37:00+08:00'),end=at('2026-11-07T03:46:00+08:00');
const row=['延','延16-04',4,6.02,'16','24','24','04','after'];
const report=api.report(row),meta={overtimeReport:report};
assert.equal(report.declaredHours,4);
assert.equal(report.convertedHours,6.02);
assert.equal(api.overtimeMinutes(start,end,workday,meta),226,
 '11/06 normal 16-24 + 11/07 00-03:46 must overlap the previous workday overtime by 226 raw minutes');
assert.equal(api.ruleAttendanceIssue(start,end,workday,row,{[workday]:'中'}),'',
 '03:46 qualifies for 04:00 declaration under the existing inclusive 45-minute rounding policy');
assert.equal(api.inferRule(start,end,workday,[row])?.[1],'延16-04');
const resolved=g.P79OvertimeShiftMatch.resolve({
 date:workday,roster:{[workday]:'中'},report:{category:'延',typeName:'平日延時加班'},
 rules:[row],start,end,attendanceIssue:false
});
assert.equal(resolved.state,'completed','actual cross-midnight official pair must match the extension');
assert.equal(resolved.suggested?.code,'延16-04');
assert.equal(resolved.confirmed,true);
assert.equal(api.overtimeMinutes(start,end,'2026-11-07',meta),0,
 'the same 00-04 period must NOT be booked as a second overtime report on 11/07');
assert.match(api.ruleAttendanceIssue(start,at('2026-11-07T03:44:00+08:00'),workday,row,{[workday]:'中'}),/45/,
 '03:44 must not be silently rounded to 04:00');
assert.equal(api.overtimeMinutes(start,NaN,workday,meta),null,'a missing check-out cannot create overtime');
const before={overtimeReport:api.report(['延','延12-24',4,6.02,'16','24','12','16','before'])};
assert.equal(api.overtimeMinutes(at('2026-11-06T11:35:00+08:00'),at('2026-11-06T23:50:00+08:00'),workday,before),240,
 'pre-shift extension must keep its original workday');
const late={overtimeReport:api.report(['延','延24-12',4,6.02,'24','08','08','12','after'])};
assert.equal(api.overtimeMinutes(at('2026-11-06T23:37:00+08:00'),at('2026-11-07T11:46:00+08:00'),workday,late),226,
 'night 24-08 followed by next-day 08-12 must still be aligned correctly');
const ordinary={overtimeReport:api.report(['延','延08-20',4,6.02,'08','16','16','20','after'])};
assert.equal(api.overtimeMinutes(at('2026-11-06T07:36:00+08:00'),at('2026-11-06T19:46:00+08:00'),workday,ordinary),226,
 'ordinary same-day extension is unchanged');
const work=fs.readFileSync('work-hours/index.html','utf8');
assert(work.includes('P79Overtime.overtimeMinutes(pair.start,pair.end,draft.date,{overtimeReport:draft.rule})>0'),
 'planned-to-official form must use the fixed interval calculation');
assert(work.includes('過去日期須有包含所選時段的完整出勤；未生成實際加班'),
 'regression targets the real displayed error path');
console.log('PASS 11/06 16-24 + 11/07 03:46 extension; previous-workday attribution, 45-minute cutoff, no duplicate next-day, early/night/ordinary shifts');
