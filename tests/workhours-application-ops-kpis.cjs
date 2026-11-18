'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ui=fs.readFileSync('assets/port79-workhours-reference-dashboard.js','utf8');
const html=fs.readFileSync('assets/port79-workhours-reference-dashboard.html','utf8');
new vm.Script(ui);
const start=ui.indexOf(' function applicationMetrics(reports){');
const end=ui.indexOf('\n function compute(){',start);
assert(start>=0&&end>start,'official application-metrics helper must exist');
const context={Set,round:n=>Math.round(n*10)/10};
vm.createContext(context);
vm.runInContext(ui.slice(start,end)+'\nthis.metrics=applicationMetrics;',context);
const f=context.metrics;
const clone=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(clone(f([])),{applications:0,reviewRate:null,restApplicants:0},
 'no official reports means 0 applications, 0 rest applicants, unknown rate—not a fake 0%');
const rows=[
 {id:'r1',empId:'E01',status:'approved',category:'休'},
 {id:'r2',empId:'E01',status:'review',category:'休'},
 {id:'r3',empId:'E02',status:'rejected',category:'延'},
 {id:'r4',empId:'E03',status:'applied',category:'休'},
 {id:'r5',empId:'E02',status:'approved',category:'例'}
];
assert.deepEqual(clone(f(rows)),{applications:5,reviewRate:60,restApplicants:2},
 'finished approvals + rejections / all submitted; distinct rest-day applicants only');
assert.deepEqual(clone(f(rows.filter(x=>x.empId==='E01'))),
 {applications:2,reviewRate:50,restApplicants:1},
 'unit/person filtered reports must preserve selected scope');
assert.deepEqual(clone(f([{empId:'E99',status:'approved',category:'延'}])),
 {applications:1,reviewRate:100,restApplicants:0},
 'all completed approvals yield 100% without inventing rest-day applicants');
assert.deepEqual(clone(f([{empId:'E99',status:'applied',category:'休'}])),
 {applications:1,reviewRate:0,restApplicants:1},
 'an application alone must not be misrepresented as approved');
for(const id of ['prKpiApplications','prKpiReviewRate','prKpiRestApplicants','prKpiPending'])
 assert(html.includes('id="'+id+'"'),'missing actual dashboard KPI element '+id);
assert(ui.includes("const metrics=ok?applicationMetrics(data.reports):null"),
 'unverified cloud months must not expose estimated application counts');
assert(ui.includes("if(!idKey||!allow.has(who)||row.reportVerified!==true"),
 'applications must be official, access-scoped and verified');
assert(ui.includes("String(p79WorkOvertimeLedgerMonth(row))!==month"),
 'application counters must respect official credited month');
assert(ui.includes("if(credit<f.start||credit>f.end)continue"),
 'application counters must respect selected date range');
assert(ui.includes("if(seen.has(unique))continue;seen.add(unique)"),
 'one official overtime report cannot be counted multiple times');
assert(ui.includes("say('prKpiReviewRate',ok&&metrics.reviewRate!==null?format(metrics.reviewRate):em)"),
 'a month with no applications must show a dash, not fabricated 0 percent');
assert(ui.includes("say('prKpiPending',ok?data.pending:em)"),
 'existing pending-review KPI must remain accurate');
console.log('PASS official overtime application KPIs: no fake values, scope/date, status distinctions, deduped rest-day people and review percentage');
