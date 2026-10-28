const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('work-hours/index.html','utf8');
const from=html.indexOf('        function p79WorkhoursScopePrincipal()');
const end=html.indexOf('        function initAttendanceStatsFilters()',from);
assert(from>=0&&end>from,'workhours scope functions are present');
const functions=html.slice(from,end);
const sourceStart=html.indexOf('        function buildOvertimeStatisticsRows()');
const sourceEnd=html.indexOf('        function replaceOvertimeOptions(',sourceStart);
assert(sourceStart>=0&&sourceEnd>sourceStart);
const overtimeSource=html.slice(sourceStart,sourceEnd);
assert(!overtimeSource.includes('canCurrentAdminViewEmployee(employee)'),'overtime must not apply unrelated admin/employee account visibility rule');
assert(!overtimeSource.includes('rowVisibility.has(rowId)'),'records must use workhours scoped employee set');
assert(overtimeSource.includes('return rowId ? visibleEmployeeIds.has(rowId)'),'known disallowed IDs are blocked even with matching attendance numbers');
const people=[
 {empId:'LEADER-ADMIN',name:'領班(管理員)',jobTitle:'領班',dept:'第二事業處',adminRole:'admin',attNo:'101'},
 {empId:'LEADER-STAFF',name:'領班(員工)',jobTitle:'領班',dept:'第三事業處',adminRole:'employee',attNo:'102'},
 {empId:'ARMG-ADMIN',jobTitle:'ARMG',dept:'第二事業處',adminRole:'admin',attNo:'103'},
 {empId:'AQC-STAFF',jobTitle:'AQC',dept:'第二事業處',adminRole:'employee',attNo:'104'},
 {empId:'SUPERVISOR',jobTitle:'主任',dept:'第二事業處',adminRole:'employee',attNo:'105'},
 {empId:'ADMIN',jobTitle:'領班',dept:'第二事業處',adminRole:'superadmin',attNo:'999'}
];
const base={empId:'SONG',name:'宋文豪',dept:'第二事業處',jobTitle:'ARMG',adminRole:'admin',
 systemPermissions:{workhours:'view'},finePermissions:{workhours:{'overtime.view':true}},
 dataScope:{workhours:'assigned'},dataScopeJobs:{workhours:['領班']}};
let cached={...base};
const c={Map,Set,String,Array,JSON,Object,Number,console,
 employees:people,currentEmp:{...base},
 getAuthoritativeAdminSessionRole:()=> 'admin',isCurrentViewerSuperAdmin:()=>false,
 sessionStorage:{getItem:key=>key==='aqc_admin_id'?'SONG':key==='port79_user_session'?JSON.stringify(cached):null}};
vm.createContext(c);vm.runInContext(functions,c);
const ids=()=>c.p79WorkhoursEligibleEmployees().map(x=>x.empId).sort();
assert.deepEqual(ids(),['LEADER-ADMIN','LEADER-STAFF'],'assigned 領班 is visible irrespective of target account being admin');
const allowed=c.p79WorkhoursScopePrincipal();
assert.equal(allowed.dataScope.workhours,'assigned');
assert.deepEqual(Array.from(allowed.dataScopeJobs.workhours),['領班']);
cached={...base,dataScope:{workhours:'department'},dataScopeJobs:{workhours:[]}};
assert.deepEqual(ids(),['AQC-STAFF','ARMG-ADMIN','LEADER-ADMIN'],'department restricts to own department but includes a leader with admin role');
cached={...base,dataScope:{workhours:'all'},dataScopeJobs:{workhours:[]}};
assert.deepEqual(ids(),['AQC-STAFF','ARMG-ADMIN','LEADER-ADMIN','LEADER-STAFF'],'all does not exclude leader with admin role, but supervisor and ADMIN synthetic account remain out');
cached={...base,dataScope:{workhours:'self'}};
assert.deepEqual(ids(),[],'self may only see own ID');
cached={...base,dataScope:{workhours:'assigned'},dataScopeJobs:{workhours:['AQC']}};
assert.deepEqual(ids(),['AQC-STAFF'],'assigned role cannot access non-granted leader');
cached={...base,dataScope:{workhours:'assigned'},dataScopeJobs:{workhours:[]}};
assert.deepEqual(ids(),[],'empty job scope fails closed');
cached={...base,systemPermissions:{workhours:'none'},dataScope:{workhours:'all'}};
assert.deepEqual(ids(),[],'no workhours permission cannot be bypassed by all scope');
cached={...base,finePermissions:{workhours:{'overtime.view':false}},dataScope:{workhours:'all'}};
assert.deepEqual(ids(),[],'explicit fine permission deny is authoritative');
cached={...base,dataScope:{workhours:'unexpected'}};
assert.deepEqual(ids(),[],'invalid scope fails closed');
c.isCurrentViewerSuperAdmin=()=>true;
assert.deepEqual(ids(),['AQC-STAFF','ARMG-ADMIN','LEADER-ADMIN','LEADER-STAFF'],'verified superadmin may see both employee and admin accounts, still excluding supervisor per existing business policy');
c.isCurrentViewerSuperAdmin=()=>false;c.getAuthoritativeAdminSessionRole=()=> 'employee';
assert.deepEqual(ids(),[],'ordinary employee cannot gain overtime access by crafting scope preferences');
console.log('PASS 宋文豪 assigned 領班: multi-department leaders including admin-role accounts visible; department/all/self/assigned boundaries; fine/system denies; principal identity; no attendance-scope leak or supervisor exposure');
