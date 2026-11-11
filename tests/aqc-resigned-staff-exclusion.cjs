'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {isCurrentEmployee,buildMonth,collectDispatchRoster}=require('../assets/port79-personnel-dispatch.js');
const employees=[
 {empId:'A1',name:'現職甲',jobTitle:'AQC',employmentStatus:'active',group:'A組'},
 {empId:'B1',name:'離職乙',jobTitle:'AQC',employmentStatus:'resigned',group:'B組'},
 {empId:'C1',name:'離職丙',jobTitle:'AQC',employmentStatus:'inactive',group:'C組'},
 {empId:'D1',name:'留停丁',jobTitle:'AQC',employmentStatus:'leave',group:'D組'},
 {empId:'E1',name:'復職戊',jobTitle:'AQC',employmentStatus:'active',terminationDate:'2026-01-01',group:'B組'}
];
assert.deepEqual(employees.filter(isCurrentEmployee).map(e=>e.empId),['A1','E1']);
for(const status of ['resigned','terminated','retired','inactive','離職','已離職','退休','留職停薪','留停'])
 assert.equal(isCurrentEmployee({employmentStatus:status}),false,'reject '+status);
assert.equal(isCurrentEmployee({employmentStatus:'active',terminationDate:'2026-01-01'}),true,'a rehire may retain an old departure date');
assert.equal(isCurrentEmployee({employeeStatus:'inactive'}),false,'legacy status field');
assert.equal(isCurrentEmployee({['在職狀態']:'離職'}),false,'legacy Chinese status field');
const roster=employees.map(({empId,name,group})=>({empId,name,group}));
const records=employees.map(e=>({source:'working-report',workDate:'2026-11-03',empId:e.empId,name:e.name,disc:100,load:0,hc:0,hours:5}));
const actual=buildMonth({month:'2026-11',records,roster,employees,metrics:x=>x});
assert.deepEqual(actual.map(p=>p.empId).sort(),['A1','E1'],'live dispatch staff and historic rows exclude departed/leave');
assert.equal(actual.reduce((s,p)=>s+p.containers,0),200,'former staff work must not inflate current dispatch efficiency');
const store={has:()=>true,personnel:()=>[],lookup:(_,{empId})=>({status:'ok',group:employees.find(e=>e.empId===empId).group})};
const enriched=collectDispatchRoster(store,'2026-11',employees);
assert.deepEqual(enriched.map(e=>e.empId).sort(),['A1','E1'],'resigned HR rows not supplemented into live roster');
const html=fs.readFileSync(path.join(__dirname,'../aqc-efficiency/index.html'),'utf8');
function extract(name){const start=html.indexOf('function '+name+'(');assert(start>=0,name);const end=html.indexOf('\n}',start);assert(end>=0,name);return html.slice(start,end+2);}
const ctx={systemEmployees:employees,records:[],normalizePersonName:s=>String(s||'').replace(/\s+/g,''),Map,Set};
vm.createContext(ctx);
for(const name of ['currentOfficialJobTitle','isAqcEmployee','people'])vm.runInContext(extract(name),ctx);
assert.equal(ctx.isAqcEmployee(employees[1]),false,'AQC job title must not override resignation');
assert.equal(ctx.isAqcEmployee(employees[2]),false,'inactive must not count as employed');
assert.equal(ctx.isAqcEmployee(employees[3]),false,'staff on long-term leave are not available for dispatch');
assert.deepEqual(ctx.people().map(p=>p.empId).sort(),['A1','E1'],'current AQC staff count must use employment state');
assert.match(html,/personnel-dispatch\.js\?v=20261111-current-roster-v6/,'new JS must bypass stale browser cache');
console.log('PASS HR status filtering across current AQC roster, dispatch headcount, optional names, historical records, and restored staff');
