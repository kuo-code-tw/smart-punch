const fs=require('fs'),vm=require('vm'),a=require('assert/strict');
const context={};context.window=context;vm.createContext(context);
for(const p of ['assets/port79-rest-attendance.js','assets/port79-overtime-report.js'])vm.runInContext(fs.readFileSync(p,'utf8'),context);
const api=context.P79Overtime,date='2026-10-23',ts=t=>Date.parse(date+'T'+t+':00+08:00'),roster={[date]:'早'};
const three=['國','颱08-11',3,3,'','','08','11','full','颱風日加班'],four=['國','颱08-12',4,4,'','','08','12','full','颱風日加班'];
for(const [out,hours] of [['11:23',3],['11:45',3],['11:46',4],['12:05',4]]){
 const w=api.declarationWindow(ts('07:32'),ts(out),date,roster);a.equal(w.start,ts('08:00'));a.equal(w.minutes,hours*60,out);
 const rule=api.suggestRule(ts('07:32'),ts(out),date,roster,[four,three],[{code:'颱'}]);a.equal(rule[1],hours===3?'颱08-11':'颱08-12',out);
}
a.equal(api.declarationEnd(Date.parse(date+'T11:45:59+08:00')),ts('11:00'),'entire minute 45 does not advance');
a.equal(api.declarationWindow(ts('08:05'),ts('11:23'),date,roster).minutes,180,'scheduled start, not next clock-in hour');
a.equal(api.declarationWindow(ts('07:32'),ts('11:23'),date,{}),null,'unknown roster is not guessed');
a.match(api.ruleAttendanceIssue(ts('07:32'),ts('11:23'),date,four),/45/);a.equal(api.ruleAttendanceIssue(ts('07:32'),ts('11:46'),date,four),'');
a.equal(api.inferRule(ts('07:32'),ts('11:23'),date,[four]),null,'cannot default to four hours using old 45-minute proximity');
a.match(api.ruleAttendanceIssue(ts('07:32'),ts('11:23'),date,['國','颱07-11',4,4,'','','07','11','full','颱風日加班'],roster),/排定班別/);
const national=['國','國08-11',3,3,'','','08','11','full'];a.equal(api.suggestRule(ts('07:32'),ts('11:23'),date,roster,[national,three],[{code:'颱'}])[1],'颱08-11','custom typhoon type is preferred to generic holiday');
const nightStart=Date.parse(date+'T23:36:00+08:00'),next=t=>Date.parse('2026-10-24T'+t+':00+08:00');
for(const [out,h] of [['07:45',7],['07:46',8]])a.equal(api.declarationWindow(nightStart,next(out),date,{[date]:'晚'}).minutes,h*60,'overnight '+out);
const nextMidnight=api.declarationEnd(Date.parse(date+'T23:46:00+08:00'));a.equal(nextMidnight,next('00:00'));
console.log('PASS scheduled-start hours, 45/46 cutoff, exact typhoon period auto-selection, unknown roster, and overnight boundaries');
