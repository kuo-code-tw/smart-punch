'use strict';
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const ctx={window:null,Date,Intl,Set,Map};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['assets/port79-rest-attendance.js','assets/port79-overtime-report.js'])vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
const api=ctx.P79Overtime,date='2026-10-28';
const time=(day,h)=>Date.parse(day+'T'+h+':00+08:00'),start=time(date,'23:35'),out=h=>time('2026-10-29',h);
const rows=[...api.defaults(),['例','例24-08',8,8,'','','24','08','full']];
const choose=(type,end,roster={[date]:'晚'},rules=rows,startTime=start)=>
 api.matchingReportPeriod(date,roster,{start:startTime,end},rules,type);
for(const [type,code] of [['國定假日加班','國24-08'],['休息日加班','休24-08'],['例假加班','例24-08'],['休假代班加班','代24-08']]){
 a.equal(choose(type,out('07:48'))?.[1],code,'night shift '+type);
 a.equal(choose(type,out('07:45'))?.[1],code,'07:45 inclusive '+type);
 a.equal(choose(type,out('07:44')),null,'07:44 cannot round up '+type);
}
for(const [shift,begin,end,endDate,code] of [
 ['早','07:36','15:48',date,'國08-16'],
 ['中','15:38','23:49',date,'國16-24'],
 ['晚','23:35','07:48','2026-10-29','國24-08']
]){
 const found=api.matchingReportPeriod(date,{[date]:shift},{start:time(date,begin),end:time(endDate,end)},rows,'國定假日加班');
 a.equal(found?.[1],code,shift+' should not default to 08-16');
}
const custom=[['國','颱24-08',8,8,'','','24','08','full','颱風日加班'],...rows];
a.equal(choose('颱風日加班',out('07:48'),{[date]:'晚'},custom)?.[1],'颱24-08');
a.equal(choose('國定假日加班',out('07:48'),{[date]:'晚'},custom)?.[1],'國24-08');
a.equal(choose('國定假日加班',null),null);
a.equal(api.matchingReportPeriod(date,{[date]:'晚'},{start,end:undefined},rows,'國定假日加班'),null);
a.equal(choose('國定假日加班',out('07:48'),{[date]:'晚'},[]),null);
a.equal(choose('國定假日加班',out('07:48'),{[date]:'早'}),null,'conflicting roster guard');
a(source.includes('autoSelectPeriodForCurrentType();'),'kind change must auto match');
a(source.includes('dateInput.value!==prefill.date'),'no cross-date punch reuse');
a(source.includes('String(empSelect.value)!==String(prefill.empId'),'no cross-staff punch reuse');
a(source.includes("select.selectedIndex=-1;select.value=''"),'no unsafe default');
a(source.includes('!prefill.savedReport&&!prefill.manualPlan'),'do not override formal reports or preplans');
console.log('PASS full staff shift-based prefill: early/middle/night, all leave types, 45 cutoff, typhoon separation, wrong date/person and missing pair');
