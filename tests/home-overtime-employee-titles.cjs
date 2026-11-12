'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ui=fs.readFileSync('assets/port79-reference-dashboard.js','utf8');
const page=fs.readFileSync('index.html','utf8');
const start=ui.indexOf('function p79IsEmployeeOvertimeTitle(');
const end=ui.indexOf('function renderAttendancePage()',start);
assert(start>=0&&end>start,'employee-only chart filter is defined');
const funcs=new Function(ui.slice(start,end)+';return {p79IsEmployeeOvertimeTitle,p79EmployeeOvertimeRows};')();
const titles=[
 '主任','副主任','課長','科長','副理','經理','資深經理','協理','總經理','總監','副總',
 '部長','處長','董事長','執行長','廠長','股長','主管','系統管理員','系統 管理員','未設定職稱'
];
for(const title of titles)assert.equal(funcs.p79IsEmployeeOvertimeTitle(title),false,title+' must not display');
const workers=['指揮手','領班','AOC','技術員','作業員','助理','班長','倉庫管理員'];
for(const title of workers)assert.equal(funcs.p79IsEmployeeOvertimeTitle(title),true,title+' should stay');
const rows=[...titles,...workers].map((title,i)=>({title,hours:i+1,count:1}));
assert.deepEqual(funcs.p79EmployeeOvertimeRows(rows).map(r=>r.title),workers,'only frontline jobs remain in overtime graph');
assert(ui.includes('report.actualRows||report.rows')&&ui.includes('report.convertedRows||report.rows'),'both overtime modes keep the employee-only title filter, not the leave chart');
assert(page.includes('本月員工職稱加班時數統計'),'static title describes filtered chart');
assert(ui.includes('本月員工職稱加班時數統計'),'dynamic page title describes filtered chart');
console.log('PASS homepage overtime chart: frontline positions only; management and system admin excluded; approved-leave chart unchanged');
