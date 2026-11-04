'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const home=fs.readFileSync('index.html','utf8');
const dashboard=fs.readFileSync('assets/port79-monthly-dashboard.js','utf8');
const overtime=fs.readFileSync('assets/port79-overtime-report.js','utf8');
const workhours=fs.readFileSync('work-hours/index.html','utf8');
const win={};
const moduleRef={exports:{}};
vm.runInNewContext(dashboard,{window:win,module:moduleRef,Intl,Date,Map,Set,Number,JSON});
const api=moduleRef.exports;
const data={schedules:[{empId:'EMP-001',name:'示例員工',dept:'作業部',jobTitle:'指揮手',
 schedule:{__meta:{
 '2026-11-01':{overtimeReport:{id:'a1',code:'延04-08',declaredHours:4,planned:true}},
 '2026-11-02':{overtimeReport:{id:'a2',code:'休16-24',declaredHours:8,planned:false}},
 '2026-11-03':{overtimeReport:{id:'a2',code:'休16-24',declaredHours:8,planned:false}},
 '2026-11-04':{overtimeReport:{id:'a3',code:'休16-24',declaredHours:8,deleted:true}}
 }} }],employees:[{empId:'EMP-001',name:'示例員工',dept:'作業部',jobTitle:'指揮手'}]};
const result=api.analyzeOvertime(data,'2026-11');
assert.equal(result.count,2,'same report ID counted once, deleted excluded');
assert.equal(result.details.length,2);
assert.deepEqual([...result.details.map(x=>x.status)].sort(),['已申報','預排／待核對'].sort());
assert(result.details.every(x=>x.name==='示例員工'));
assert(home.includes('id="p79DashOvertimeList"'));
assert(home.includes('前往加班管理：申報／修改／刪除'));
assert(home.includes('id="p79DashOvertimeRecords"'));
assert(home.includes('const phone=role===\'admin\'&&actualRole!==\'superadmin\''),'superadmin mobile layout intact');
assert(dashboard.includes('if(!permissions().schedule)'),'home overtime list must be permission scoped');
assert(dashboard.includes('rows.slice(0,100)'),'home list capped for performance');
assert(dashboard.includes('td.textContent=String(value||\'—\')'),'table data must be treated as text');
assert(overtime.includes('matchesOfficialRosterPeriod(row)'),'new period choices depend on roster');
assert(overtime.includes('choices.length===1'),'only unique period auto-selected');
assert(overtime.includes('請選擇實際加班時段'),'never auto-submit arbitrary first period');
assert(workhours.includes('id="p79PlannedBulkSave"'),'batch overtime controls remain in the work-hours management page');
assert(workhours.includes('function p79BatchConfirmPlannedOvertime()'));
new vm.Script(dashboard);
new vm.Script(overtime);
for(const tag of workhours.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(!/\bsrc=|application\/json|importmap/.test(tag[1]))new vm.Script(tag[2]);
}
console.log('PASS permission-scoped read-only home list, dedup and history retention, unique roster-based periods, separate batch management');
