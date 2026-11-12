'use strict';
// Homepage overtime must show official SAVED conversion hours, not declared/raw
// hours and not planned, canceled, or a fabricated current-rule conversion.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('assets/port79-monthly-dashboard.js','utf8');
const home=fs.readFileSync('index.html','utf8');
const chart=fs.readFileSync('assets/port79-reference-dashboard.js','utf8');
const api=require('../assets/port79-monthly-dashboard.js');
const ot=(id,declaredHours,convertedHours,extra={})=>({id,declaredHours,convertedHours,...extra});
const data={employees:[{empId:'E1',name:'甲',jobTitle:'AQC'},{empId:'E2',name:'乙',jobTitle:'F/L'}],
 schedules:[
 {empId:'E1',schedule:{__meta:{
 '2026-11-01':{overtimeReport:ot('A',4,6.02)},
 '2026-11-02':{overtimeReport:ot('B',8,12.70)},
 '2026-11-03':{overtimeReport:ot('P',8,9,{planned:true})},
 '2026-11-04':{overtimeReport:ot('D',5,7.5,{deleted:true})},
 '2026-11-05':{overtimeReport:ot('R',6,8,{revoked:true})},
 '2026-11-06':{overtimeReport:ot('C',5,8,{cancelled:true})},
 '2026-11-07':{overtimeReport:ot('Z',5,8),overtimeRevocations:[{reportId:'Z',confirmed:true}]}
 }}},
 {empId:'E2',schedule:{__meta:{
 '2026-11-08':{overtimeReport:ot('M',2,null)},
 '2026-11-09':{overtimeReport:ot('ZERO',1,0)},
 '2026-11-10':{overtimeReport:ot('B',8,12.70)}
 }}}
 ]};
const a=api.analyzeOvertime(data,'2026-11');
assert.equal(a.hours,23,'legacy raw ledger includes planned, not intended for converted KPI');
assert.equal(a.count,5,'one report ID counted once, deleted and revoked excluded');
assert.equal(a.declaredSubmittedHours,15,'submitted raw hours must exclude plans');
assert.equal(a.officialCount,4,'four formally submitted unique reports');
assert.equal(a.plannedCount,1);
assert.equal(a.convertedHours,18.72,'save-persisted conversion values 6.02+12.70+0 only');
assert.equal(a.missingConversion,1,'missing saved conversion never inferred from current tariff');
assert.equal(a.details.find(r=>r.id==='P').convertedHours,null,'planned has no official conversion');
assert.equal(a.details.find(r=>r.id==='ZERO').convertedHours,0,'configured zero is valid');
assert.equal(a.convertedRows.find(r=>r.title==='AQC').hours,18.72);
assert.equal(a.convertedRows.find(r=>r.title==='F/L').hours,0);
const showStart=src.indexOf('function showOvertime('),showEnd=src.indexOf('function ensurePendingReview()',showStart);
assert(showStart>=0&&showEnd>showStart);
const metrics={},notes={};let shown=null;
const context={
 data:a,fmt:(n,d=0)=>Number(n).toFixed(d),
 setMetric:(id,value)=>{metrics[id]=value;},
 statusText:(id,value)=>{notes[id]=value;},
 renderHomeOvertimeList:()=>{},
 root:{P79ReferenceDashboard:{setOvertimeReport:value=>{shown=value;}}}
};
vm.createContext(context);
const showSource=src.slice(showStart,showEnd);
vm.runInContext(showSource+'\nshowOvertime(data)',context);
assert.equal(metrics.p79DashOvertimeHours,'待換算','no partial 18.7h figure as confirmed converted grand total');
assert.equal(metrics.p79DashOvertimeUnit,'','no trailing hours suffix on pending status');
assert.match(notes.p79DashScheduleSource,/1 筆正式申報缺少已儲存換算值/);
assert.equal(shown,a);
context.data={...a,missingConversion:0};vm.runInContext('showOvertime(data)',context);
assert.equal(metrics.p79DashOvertimeHours,'18.7');
assert.equal(metrics.p79DashOvertimeUnit,'小時');
assert.match(notes.p79DashScheduleSource,/原始 15.0 小時 → 換算後 18.7 小時/);
context.data={...a,sourceWarning:'history fallback'};vm.runInContext('showOvertime(data)',context);
assert.equal(metrics.p79DashOvertimeHours,'待核對','unverified live source cannot claim converted value');
assert(home.includes('本月換算後加班工時'));
assert(home.includes('<th>申報時數</th><th>換算時數</th>'));
assert(src.includes("item.planned?'預排':item.convertedHours===null?'待換算'"));
assert(chart.includes('report.convertedRows||report.rows'),'job-title chart must use same official conversion source');
for(const script of home.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(!/\bsrc=|application\/json|importmap/i.test(script[1])&&script[2].trim())new vm.Script(script[2]);
}
console.log('PASS home saved converted hours, planned/cancelled/revoked/duplicate exclusion, missing and zero conversion, KPI, list, chart, source warnings');
