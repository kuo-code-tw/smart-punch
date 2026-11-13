'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('attendance/index.html','utf8');
const Org=require('../assets/port79-org-context.js');
function extract(name){
  const marker='        function '+name+'(';
  const start=html.indexOf(marker);
  assert(start>=0,'missing function '+name);
  const end=html.indexOf('\n        }',start);
  assert(end>start,'missing function closing brace '+name);
  return html.slice(start,end+10);
}
const resolver=extract('p79AttendanceSectionValue');
const builder=extract('updateRecordEmployeeFilterOptions');
const init=extract('initDropdowns');
const renderer=extract('renderAdminRecordsTable');
assert(!init.includes('recordDeptFilter.innerHTML'),'startup must not first populate unit filter from legacy departments');
assert(builder.includes('p79AttendanceSectionValue(e)'),'quick unit dropdown must use canonical resolver');
assert(renderer.includes('const currentDept = p79AttendanceSectionValue(emp, r);'),'actual record filter must agree with dropdown');
assert(renderer.includes('const displayUnit = p79AttendanceSectionValue(displayEmp, row);'),'visible table must agree with dropdown');
assert(!builder.includes('e?.dept ||'),'an unknown unit cannot fall back to department');
const people=[
 {empId:'DIV',name:'事業部只有部門',dept:'第二事業部',jobTitle:'課長'},
 {empId:'UNIT79',name:'作業課甲',dept:'第二事業部',unit:'79W作業課',jobTitle:'F/L'},
 {empId:'UNIT63',name:'會計課乙',dept:'第二事業部',section:'63W總務會計課',jobTitle:'行政人員'},
 {empId:'PARENTUNIT',name:'錯誤舊值',unit:'第二事業部',dept:'第二事業部',jobTitle:'領班'},
 {empId:'EXPLICITBLANK',name:'已清除單位',section:'',unit:'79W作業課',dept:'第二事業部'},
 {empId:'NESTED',name:'巢狀正式單位',orgHierarchy:{section:'79W維修廠'},dept:'第二事業部'},
 {empId:'LEGACY',name:'舊版單位',dept:'第二事業處',deptUnit:'79W倉庫課',jobTitle:'ARMG'},
 {empId:'LEGACYPARENT',name:'舊版錯層級',deptUnit:'第二事業部',jobTitle:'經理'}
];
const original=JSON.stringify(people);
const dom=new Map();
function node(id){
 if(!dom.has(id))dom.set(id,{id,value:'ALL',innerHTML:''});
 return dom.get(id);
}
const env={window:{Port79OrgContext:Org},String,Object,Array,Map,Set,console,
 document:{getElementById:node},repairAttendanceNamesInMemory:()=>{},
 getAdminAttendanceEmployees:()=>people,
 escapeHtml:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;'}[c])),
 attendanceEmployeeOptionValue:e=>e.empId,attendanceEmployeeDisplayLabel:e=>e.name};
vm.createContext(env);
vm.runInContext(resolver+'\n'+builder,env,{timeout:3000});
assert.equal(env.p79AttendanceSectionValue(people[0]),'');
assert.equal(env.p79AttendanceSectionValue(people[1]),'79W作業課');
assert.equal(env.p79AttendanceSectionValue(people[2]),'63W總務會計課');
assert.equal(env.p79AttendanceSectionValue(people[3]),'');
assert.equal(env.p79AttendanceSectionValue(people[4]),'','explicit blank must not resurrect stale unit');
assert.equal(env.p79AttendanceSectionValue(people[5]),'79W維修廠');
assert.equal(env.p79AttendanceSectionValue(people[6]),'79W倉庫課');
assert.equal(env.p79AttendanceSectionValue(people[7]),'');
assert.equal(env.p79AttendanceSectionValue(null,{unit:'第二事業部',dept:'第二事業部'}),'');
assert.equal(env.p79AttendanceSectionValue(null,{unit:'79W作業課',dept:'第二事業部'}),'79W作業課');
env.updateRecordEmployeeFilterOptions();
const choices=node('recordDeptFilter').innerHTML;
for(const valid of ['79W作業課','63W總務會計課','79W維修廠','79W倉庫課'])assert(choices.includes(valid),valid);
for(const invalid of ['第二事業部','第二事業處','一般'])assert(!choices.includes(invalid),'unit select must exclude '+invalid);
assert(choices.includes('全部單位'));
node('recordDeptFilter').value='79W作業課';
env.updateRecordEmployeeFilterOptions();
assert(node('recordNameFilter').innerHTML.includes('作業課甲'));
assert(!node('recordNameFilter').innerHTML.includes('事業部只有部門'));
assert(!node('recordNameFilter').innerHTML.includes('已清除單位'));
assert.equal(JSON.stringify(people),original,'source personnel/attendance roster unchanged');
console.log('PASS attendance quick query: no division in unit selector; canonical unit/row filtering consistent; valid legacy unit retained; explicit blank and personnel records protected');
