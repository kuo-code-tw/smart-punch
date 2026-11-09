'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');

const page=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('assets/port79-reference-dashboard.css','utf8');
const js=fs.readFileSync('assets/port79-monthly-dashboard.js','utf8');

const listMarkup=page.match(/<article id="p79DashOvertimeList"[\s\S]*?<\/article>/)?.[0];
assert(listMarkup,'home overtime card exists');
assert(listMarkup.includes('<th>日期</th><th>姓名</th><th>部門</th>'),
  'name remains the second of seven home overtime columns');
assert(listMarkup.includes('id="p79DashOvertimeRecords"'),
  'centered header and data belong to the same table');
const generic=css.indexOf('#p79Dashboard .p79d-table-scroll td:nth-child(2){text-align:left!important;');
assert(generic>=0,'generic left-aligned compact ranking selector remains unchanged');

const scoped=css.match(/#p79Dashboard #p79DashOvertimeList \.p79d-table-scroll th:nth-child\(2\),\s*html body\.p79-workspace:has\(#systems\.show\):has\(#p79Dashboard\) #p79Dashboard #p79DashOvertimeList \.p79d-table-scroll td:nth-child\(2\)\s*\{([^}]+)\}/);
assert(scoped,'specific second-column rule for overtime header and employee-name cells');
assert(scoped.index>generic,'scoped overtime centering follows generic second-column left alignment');
assert.match(scoped[1],/text-align\s*:\s*center\s*!important/);
assert.match(scoped[1],/max-width\s*:\s*none\s*!important/);
assert.match(scoped[1],/text-overflow\s*:\s*clip\s*!important/);
assert(page.includes('port79-reference-dashboard.css?v=20261109-home-overtime-name-center-v1'),
  'browser loads updated stylesheet instead of cached earlier CSS');
assert(js.includes("for(const value of [item.date,item.name,item.dept,item.title"),
  'employee name remains sourced from genuine monthly overtime rows');
assert(js.includes("td.textContent=String(value||'—')"),
  'overtime data still uses safe textContent; no content rewrite required');
assert(css.includes('#p79Dashboard .p79r-people-panel tbody td:nth-child(2)'),
  'other people-efficiency ranking retains its independently centered names');

console.log('PASS homepage overtime list 姓名 heading and name cells centered only in their table, original data and other dashboards unchanged');
