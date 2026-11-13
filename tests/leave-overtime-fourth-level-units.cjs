'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const Org=require('../assets/port79-org-context.js');
const leave=fs.readFileSync('leave/index.html','utf8');
const work=fs.readFileSync('work-hours/index.html','utf8');
const between=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert(i>=0&&j>i,'missing function boundary '+a);return s.slice(i,j)};
const staff=[
 {empId:'E1',attNo:'001',name:'作業甲',dept:'第二事業部',unit:'79W作業課',jobTitle:'F/L'},
 {empId:'E2',attNo:'002',name:'未分派乙',dept:'第二事業部',jobTitle:'領班'},
 {empId:'E3',attNo:'003',name:'舊單位已清除',dept:'第二事業部',section:'',unit:'79W作業課',jobTitle:'F/L'},
 {empId:'E4',attNo:'004',name:'行政丙',dept:'第二事業部',section:'63W總務會計課',jobTitle:'行政人員'},
 {empId:'E5',attNo:'005',name:'錯層級丁',dept:'第二事業部',unit:'第二事業部',jobTitle:'行政人員'}
];
const raw=JSON.stringify(staff);
const records=[
 {empId:'E1',attNo:'001',name:'作業甲',dept:'第二事業部',jobTitle:'F/L'},
 {empId:'E2',attNo:'002',name:'未分派乙',dept:'第二事業部',jobTitle:'領班'},
 {empId:'E3',attNo:'003',name:'舊單位已清除',dept:'第二事業部',unit:'79W作業課'},
 {empId:'E4',attNo:'004',name:'行政丙',dept:'第二事業部'},
 {empId:'X',name:'舊申請無員工',dept:'第二事業部'}
];
const nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',innerHTML:'',dataset:{}});return nodes.get(id)};
const lctx={window:{Port79OrgContext:Org},employees:staff,leaveRecords:records,$:node,
 String,Object,Array,Set,Intl,console,esc:x=>String(x??'')};
vm.createContext(lctx);
vm.runInContext(between(leave,'function p79LeaveUnitOfPerson(','function normalizeLeaveFilterDate('),lctx);
vm.runInContext(between(leave,'function p79LeaveJobForRecord(','async function p79ComparisonOutput('),lctx);
assert.equal(lctx.p79LeaveUnitOfPerson(staff[0]),'79W作業課');
assert.equal(lctx.p79LeaveUnitOfPerson(staff[1]),'');
assert.equal(lctx.p79LeaveUnitOfPerson(staff[2]),'','explicit blank wins over stale legacy unit');
assert.equal(lctx.p79LeaveUnitOfPerson(staff[4]),'','a division may never be a unit');
assert.equal(lctx.p79LeaveRecordUnit(records[0]),'79W作業課');
assert.equal(lctx.p79LeaveRecordUnit(records[2]),'','old leave unit cannot revive cleared HR unit');
assert.equal(lctx.p79LeaveRecordUnit(records[4]),'','old department in unmatched record is not a unit');
lctx.populateDepartments();
assert(node('filterDept').innerHTML.includes('全部單位'));
assert(node('filterDept').innerHTML.includes('79W作業課'));
assert(node('filterDept').innerHTML.includes('63W總務會計課'));
assert(!node('filterDept').innerHTML.includes('第二事業部'));
node('filterDept').value='79W作業課';lctx.populateLeaveAdminJobs();
assert(node('filterJob').innerHTML.includes('F/L'));
assert(!node('filterJob').innerHTML.includes('領班'));
assert(leave.includes("(!dept||p79LeaveRecordUnit(l)===dept)"),'leave filtering must use fourth-level unit');
assert(leave.includes("<td>\${esc(p79LeaveRecordUnit(l)||'—')}</td>"),'leave table must show unit');
assert(leave.includes("<td>\${esc(p79LeaveUnitOfPerson(e)||'—')}</td>"),'balance table must show unit');
assert(leave.includes('<th>人員</th><th>單位</th>'),'leave table label is unit');
const wctx={window:{Port79OrgContext:Org},employees:staff,String,Array,Set,Map,Object,Date,Intl,console,document:{getElementById:()=>null}};
vm.createContext(wctx);
vm.runInContext(between(work,'        function p79OvertimeUnitOfPerson(','        function initOvertimeFilters('),wctx);
assert.equal(wctx.p79OvertimeUnitForRow({empId:'E1',dept:'第二事業部'}),'79W作業課');
assert.equal(wctx.p79OvertimeUnitForRow({empId:'E2',dept:'第二事業部'}),'');
assert.equal(wctx.p79OvertimeUnitForRow({empId:'E3',unit:'79W作業課'}),'');
assert.equal(wctx.p79OvertimeUnitForRow({empId:'E4',dept:'第二事業部'}),'63W總務會計課');
assert.equal(wctx.p79OvertimeUnitForRow({empId:'E5',unit:'第二事業部'}),'');
assert.equal(wctx.p79OvertimeUnitForRow({empId:'MISSING',dept:'第二事業部'}),'');
const elements=new Map();
function el(id){if(!elements.has(id))elements.set(id,{id,value:id==='overtimeMonthFilter'?'2026-11':'ALL',dataset:id==='overtimeMonthFilter'?{p79MonthInitialized:'1'}:{},values:[]});return elements.get(id)}
wctx.document.getElementById=el;
wctx.replaceOvertimeOptions=(target,label,vals)=>{const values=[...new Set(vals)].filter(Boolean);target.values=values;target.label=label;if(target.value!=='ALL'&&!values.includes(target.value))target.value='ALL';};
wctx.buildOvertimeStatisticsRows=()=>[];
vm.runInContext(between(work,'        function initOvertimeFilters(','        async function p79ReloadOvertimeMonth('),wctx);
const overtimeRows=staff.map(emp=>({empId:emp.empId,dept:'第二事業部',monthKey:'2026-11',jobTitle:emp.jobTitle,name:emp.name}));
wctx.initOvertimeFilters(overtimeRows);
assert.equal(el('overtimeDeptFilter').label,'全部單位');
assert.deepEqual(el('overtimeDeptFilter').values,['63W總務會計課','79W作業課']);
el('overtimeDeptFilter').value='79W作業課';
wctx.initOvertimeFilters(overtimeRows);
assert.deepEqual(el('overtimeJobTitleFilter').values,['F/L']);
assert.deepEqual(el('overtimeEmployeeFilter').values,['E1']);
assert(work.includes("(dept === 'ALL' || p79OvertimeUnitForRow(row) === dept)"),'daily stats filter unit');
assert(work.includes("(dept==='ALL'||p79OvertimeUnitOfPerson(emp)===dept)"),'staff totals filter unit');
assert(work.includes("(dept==='ALL'||p79OvertimeUnitForRow(row)===dept)"),'planned filter unit');
assert(work.includes('data-label="單位"'),'overtime detail labels unit');
assert.equal(JSON.stringify(staff),raw,'HR personnel and saved work records must not mutate');
console.log('PASS leave+overtime fourth-level unit: dropdown, saved records, job/name cascade, planned rows, official department separation, clear unit, totals, labels and source safety');
