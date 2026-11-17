'use strict';
// Contract: user-approved screenshot redesign may add read-only UI and CSS,
// but it must NEVER change application/approval/cover/back-end behavior.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('leave/index.html','utf8');
const css=fs.readFileSync('assets/port79-leave-reference-visual.css','utf8');
const visual=fs.readFileSync('assets/port79-leave-reference-visual.js','utf8');
const has=x=>assert(html.includes(x),'original leave control missing: '+x);
for(const marker of [
 'id="employeeMode"','id="adminMode"','id="leaveStickyTabs"',
 'id="leaveType"','id="leaveStart"','id="leaveEnd"','id="leaveDays"',
 'id="leaveReason"','id="submitLeaveBtn"','id="adminLeaveBody"',
 'id="adminBalancePanel"','id="adminBalanceBody"','id="adminLeaveSummary"',
 'id="filterMonth"','id="filterDept"','id="filterJob"','id="filterStatus"',
 'id="adminCreateLeaveBtn"','id="adminReadOnly"',
 'onclick="submitLeave()"','onclick="openAdminCreateLeave()"',
 'onclick="loadCloud(true)"','onclick="switchMode(\'admin\')"',
 "function renderAdmin()","function renderAdminBalances()",
 "function leaveBalanceInfo(emp)","async function submitLeave()",
 "async function setLeaveStatus","async function deleteLeave",
 "function switchMode(m)"
])has(marker);
assert(html.includes('<link rel="stylesheet" href="../assets/port79-leave-reference-visual.css?v='));
assert(html.includes('<script src="../assets/port79-leave-reference-visual.js?v='));
assert.equal((html.match(/port79-leave-reference-visual\.js\?v=/g)||[]).length,1);
assert.equal((html.match(/port79-leave-reference-visual\.css\?v=/g)||[]).length,1);
new vm.Script(visual,{filename:'port79-leave-reference-visual.js'});
for(const code of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(/\bsrc=|application\/json|importmap/.test(code[1])||!code[2].trim())continue;
 new vm.Script(code[2],{filename:'leave-inline.js'});
}
// Only presentation DOM may be mutated by this new, independently scoped file.
for(const forbidden of [
 /fetch\s*\(/,/postCloud\s*\(/,/cloudPost\s*\(/,/XMLHttpRequest/,
 /localStorage\s*\.\s*setItem/,/sessionStorage\s*\.\s*setItem/,
 /leaveRecords\s*=(?!=)/,/employees\s*=(?!=)/,
 /setLeaveStatus\s*\(/,/deleteLeave\s*\(/,/submitLeave\s*\(/,
 /window\s*\.\s*leaveRecords\s*=/,/innerHTML\s*=\s*rows/
]){
 assert(!forbidden.test(visual),'visual script must not change original data or cloud: '+forbidden);
}
assert(visual.includes('!admin.classList.contains(\'hidden\')'),'visual mode only when admin is visible');
assert(visual.includes("classList.toggle('p79-leave-reference-admin',active)"));
assert(css.includes('html.p79-leave-reference-admin'),'all custom styles must be scoped to admin view');
assert(css.includes('html.p79-leave-reference-admin #p79SevenTop'),'existing shared menu styled instead of replaced');
assert(css.includes('#p79LeaveVisualStats')&&css.includes('#p79LeaveVisualSide'));
assert(!css.includes('#employeeMode .grid'),'original employee form layout is untouched');
assert(!css.includes('#submitLeaveBtn'),'original employee submission controls not restyled');
assert(!css.includes('#adminCreateLeaveDialog'),'original dialog fields not restyled');
assert(!css.includes('#p79LeaveCoverModal'),'original cover modal is untouched');
assert(css.split('{').length===css.split('}').length,'CSS brace balance');
assert(/num\.dataset\.leaveVisualStat=key/.test(visual),'metrics reflect actual data, not static screenshot numbers');
assert(visual.includes("leaveBalanceInfo(e)"),'quota uses existing read-only calculation');
assert(visual.includes("const rs=records().filter(permitted)"),'admin visuals respect current org scope');

// New view-only third tab must reuse the actual original annual-balance table.
assert(visual.includes("balanceTab.id='tabLeaveBalances'"));
assert(visual.includes("tabs.insertBefore(balanceTab,adminTab.nextSibling)"));
assert(visual.includes("balancePanel.open=true"),'annual tab opens the real original balance panel');
assert(visual.includes("renderAdminBalances()"),'annual tab uses the original quota calculation');
assert(!visual.includes("adminBalanceBody.innerHTML="),'visual must not replace annual-balance source rows');
assert(css.includes('html.p79-leave-reference-admin.p79-leave-balance-only #adminMode>div.card'),
 'new annual tab hides just the original records card, not data');
assert(css.includes('html.p79-leave-reference-admin:not(.p79-leave-balance-only) #adminBalancePanel'),
 'original annual table appears ONLY in the new tab, not twice');
assert(html.includes('port79-leave-reference-visual.css?v=20261116-reference-tab-stroke-v2'));
assert(html.includes('port79-leave-reference-visual.js?v=20261116-reference-tab-stroke-v3'));
assert(css.includes('html.p79-leave-reference-admin body.p79-workspace[data-p79-system="leave"] #p79SevenTop.p79-workspace-sidebar'),
 'reference-blue sidebar must style the actual shared workspace sidebar');
assert(visual.includes('p79LeaveCloudUnverified'),'failed official reads must never be presented as zero records');
assert(visual.includes('p79LeaveCloudDataReady'),'cloud read verification uses existing source flag');
assert(visual.includes('const unverified=!cloudReady;'),'unverified cloud cache stays marked even with stale rows');
assert(visual.includes("tabs?.insertAdjacentElement('afterend',statusBanner)"),
 'cloud warning remains visible in annual balance tab');
assert(visual.includes('筆數待確認'));
// Cascade is unit (real existing admin filter) → job title → employee name.
assert(visual.includes('id="p79LeaveVisualJob"'),'quota contains a left-hand job selector');
assert(visual.includes('id="p79LeaveVisualPerson"'),'quota contains the right-hand name selector');
assert(visual.includes("const selectedUnit=()=>String(document.getElementById('filterDept')?.value||'').trim()"),'quota uses the existing selected unit');
assert(visual.includes('officialUnit(x)===unit'),'quota must match official fourth-level HR unit');
assert(visual.includes('activeEmployee(x)'),'resigned employees must not be shown');
assert(visual.includes("new Intl.Collator('zh-TW-u-co-stroke'"),'jobs and names retain stroke order');
const sourceBegin=visual.indexOf(' const leaveStrokeCollator=');
const sourceEnd=visual.indexOf(' const showDays=',sourceBegin);
assert(sourceBegin>0&&sourceEnd>sourceBegin,'production picker section available for test');
const pickerSource=visual.slice(sourceBegin,sourceEnd);
const people=[
 {empId:'E3',name:'黃柏源',jobTitle:'司機',section:'A單位',status:'在職'},
 {empId:'E1',name:'王子明',jobTitle:'司機',section:'A單位',status:'在職'},
 {empId:'E2',name:'林小華',jobTitle:'技術員',section:'A單位',status:'在職'},
 {empId:'E4',name:'許大同',jobTitle:'司機',section:'B單位',status:'在職'},
 {empId:'E5',name:'吳怡君',jobTitle:'司機',section:'A單位',status:'離職'},
 {empId:'E6',name:'郭芳芳',jobTitle:'司機',section:'',status:'在職'}
];
const before=JSON.stringify(people);
const mkSelect=()=>({value:'',dataset:{},children:[],
 replaceChildren(){this.children=[];this.value='';},
 append(child){this.children.push(child);}
});
const unit={value:'A單位'},job=mkSelect(),person=mkSelect();
const doc={getElementById:id=>id==='filterDept'?unit:null,createElement:tag=>({tag,value:'',textContent:''})};
const checks=Function('people','permitted','document','jobSelect','personSelect','p79LeaveUnitOfPerson','leaveEmployeeIsActive','window','unit',
 pickerSource+`
 updatePeople();
 const initial={jobs:jobSelect.children.map(x=>x.textContent),people:personSelect.children.map(x=>x.textContent)};
 jobSelect.value='司機';updatePeople();
 const aNames=personSelect.children.map(x=>x.textContent);
 personSelect.value='E1';
 unit.value='B單位';jobSelect.value='';updatePeople();
 const bInitial={jobs:jobSelect.children.map(x=>x.textContent),people:personSelect.children.map(x=>x.textContent),person:personSelect.value};
 jobSelect.value='司機';updatePeople();
 const bNames=personSelect.children.map(x=>x.textContent);
 unit.value='';updatePeople();
 const noUnit={jobs:jobSelect.children.map(x=>x.textContent),people:personSelect.children.map(x=>x.textContent),person:personSelect.value};
 jobSelect.value='司機';updatePeople();
 const allUnitsSelectedJob={job:jobSelect.value,people:personSelect.children.map(x=>x.textContent)};
 unit.value='A單位';updatePeople();
 const afterUnit={job:jobSelect.value,people:personSelect.children.map(x=>x.textContent)};
 return {initial,aNames,bInitial,bNames,noUnit,allUnitsSelectedJob,afterUnit};`)(
 ()=>people,()=>true,doc,job,person,x=>x.section,x=>x.status==='在職',{},unit);
assert.deepEqual(checks.initial.jobs,['請選擇職稱','司機','技術員']);
assert.deepEqual(checks.initial.people,['請先選擇職稱'],'do not show all employee names before job is chosen');
assert.deepEqual(checks.aNames,['請選擇姓名','王子明','黃柏源'],'A unit drivers only, names by stroke');
assert.deepEqual(checks.bInitial.jobs,['請選擇職稱','司機']);
assert.deepEqual(checks.bInitial.people,['請先選擇職稱']);
assert.equal(checks.bInitial.person,'','changing unit clears previous employee');
assert.deepEqual(checks.bNames,['請選擇姓名','許大同'],'do not leak A unit employees into B unit');
assert.deepEqual(checks.noUnit.jobs,['請選擇職稱','司機','技術員'],
 'job dropdown must have options while unit is still 全部單位');
assert.deepEqual(checks.noUnit.people,['請先選擇單位'],'ALL units never expands to every employee');
assert.equal(checks.noUnit.person,'');
assert.deepEqual(checks.allUnitsSelectedJob,{job:'司機',people:['請先選擇單位']},
 'choosing job under 全部單位 never leaks all employee names');
assert.deepEqual(checks.afterUnit,{job:'司機',people:['請選擇姓名','王子明','黃柏源']},
 'selecting a real unit should immediately populate only its job-matching employees');
assert.equal(JSON.stringify(people),before,'filter is read-only and cannot mutate HR roster');
console.log('PASS leave quota: selected unit → job → name, active-only, traditional stroke order, no cross-unit leaks');

console.log('PASS leave reference page: only admin visual skin and read-only KPI/calendar; existing application, review, balance, cover, auth and cloud functions preserved');
