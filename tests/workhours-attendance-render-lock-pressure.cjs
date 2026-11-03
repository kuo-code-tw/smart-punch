'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('work-hours/index.html','utf8');
const cache=fs.readFileSync('assets/port79-workhours-cache.js','utf8');
assert(html.includes('body.innerHTML = pageRows.map((row, rowIndex) => {'),'monthly attendance rows must receive row index');
assert(html.includes('const p79WorkOvertimeLoadLanes=[Promise.resolve()];'),'background schedule reads must be serialized by month');
assert(html.includes("await (state?.promise||Promise.resolve());"),'manual overtime refresh must finish schedule read before attendance read');
assert(cache.includes('await context()?.recentRoster?.(month,s.token,s.stamp)')&&cache.includes("await request(s,'getScheduleDataSecure',month)"),'secure roster may reuse the same-session request but must retain cloud fallback');
assert(cache.includes('offset<months.length;offset+=2'),'raw month reads limited to 2 requests');
const block=html.match(/const renderRows = \(\) => \{\s*body\.innerHTML = pageRows\.map\(\(row, rowIndex\) => \{([\s\S]*?)\}\)\.join\(''\);\s*\};/);
assert(block,'attendance page rendering callback present');
const code='const renderRows = () => { body.innerHTML = pageRows.map((row, rowIndex) => {'+block[1]+"}).join(''); }; renderRows();";
const employees=[
 {empId:'E1',name:'甲',dept:'甲部',jobTitle:'指揮手'},
 {empId:'E2',name:'乙',dept:'乙部',jobTitle:'領班'}
];
const pageRows=employees.map(emp=>({emp,days:new Set([1,5]),totalDays:2}));
const body={innerHTML:''};
const escapeHtml=v=>String(v).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const work=new Function('pageRows','body','groupByDept','daysInMonth','escapeHtml','rowIndex',code);
work(pageRows,body,true,31,escapeHtml,undefined);
assert(body.innerHTML.includes('甲部')&&body.innerHTML.includes('乙部'));
assert(body.innerHTML.includes('E1')&&body.innerHTML.includes('E2'));
assert(!body.innerHTML.includes('正在整理本頁統計'));
console.log('PASS attendance statistics list renders all rows and grouped departments; overtime cloud reads are bounded');
