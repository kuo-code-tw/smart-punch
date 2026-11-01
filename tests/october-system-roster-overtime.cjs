'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const color=fs.readFileSync('assets/port79-attendance-overtime.js','utf8');
const marker='function p79ScheduleOvertimeExportRows_(staff,month){';
const a=html.indexOf(marker),b=html.indexOf('async function exportScheduleToExcel()',a);
assert(a>=0&&b>a,'Roster export with overtime breakdown must exist');
const fn=vm.runInNewContext('('+html.slice(a,b).trim()+')');
const report=(id,status,hours=8)=>({id,code:'休08-16',status,declaredHours:hours,convertedHours:hours});
const rows=[
 {id:'E001',name:'測試一',role:'AQC',group:'A組'},
 {id:'E002',name:'測試二',role:'AQC',group:'B組'}
];
const data={
 E001:{
 '2026-10-14':{overtimeReport:report('R1','已核對出勤'),overtimeReports:[report('R1','已核對出勤')]},
 '2026-10-15':{overtimeReport:report('R2','預排待出勤',4)},
 '2026-10-16':{overtimeReport:report('R3','已核對出勤',3),overtimeRevocations:[{reportId:'R3',confirmed:true}]},
 '2026-11-01':{overtimeReport:report('R4','已核對出勤',7)}
 },
 E002:{'2026-10-20':{overtimeReport:report('R5','已核對出勤',2)}}
};
const result=vm.runInNewContext('('+html.slice(a,b).trim()+')',{monthlyScheduleMeta:data})(rows,'2026-10');
assert.equal(result.detail.length,4,'duplicate ID and November must not be exported into October');
assert.equal(result.detail.filter(r=>r['納入核對小計']==='是').length,2);
assert.equal(result.totals.find(r=>r['工號']==='E001')['已核對換算時數'],8);
assert.equal(result.totals.find(r=>r['工號']==='E001')['已取消筆數'],1);
assert.equal(result.totals.find(r=>r['工號']==='E001')['待核對筆數'],1);
assert.equal(result.totals.find(r=>r['工號']==='E002')['已核對換算時數'],2);
assert.match(html,/historyGetProvisionalScheduleMonth/);
assert.match(html,/p79ScheduleOfficialMonth='';p79ScheduleOfficialToken='';p79ScheduleBaseDigest='';/);
assert.match(html,/kind:'provisional'/);
assert.match(html,/\\['cache','provisional'\\]\\.includes/);
assert.match(html,/XLSX\\.utils\\.book_append_sheet\\(wb,XLSX\\.utils\\.json_to_sheet\\(details\\),'加班申報明細'\\)/);
assert.match(html,/XLSX\\.utils\\.book_append_sheet\\(wb,XLSX\\.utils\\.json_to_sheet\\(overtime\\.totals/);
assert.match(color,/p79RestoreOctoberOvertimeColors/);
assert.match(color,/source:'2026-10-provisional'/);
assert.match(color,/10\\/28歷史備援，非月底核薪定稿/);
new vm.Script(color);
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
for(const [,body] of scripts){if(body.trim())new vm.Script(body);}
console.log('PASS: native October roster display, 4-sheet system export, overtime colors, dedup, cancelled hours, provisional save guard');
