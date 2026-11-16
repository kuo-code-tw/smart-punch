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
assert(css.includes('html.p79-leave-reference-admin body.p79-workspace[data-p79-system="leave"] #p79SevenTop.p79-workspace-sidebar'),
 'reference-blue sidebar must style the actual shared workspace sidebar');
assert(visual.includes('p79LeaveCloudUnverified'),'failed official reads must never be presented as zero records');
assert(visual.includes('p79LeaveCloudDataReady'),'cloud read verification uses existing source flag');
assert(visual.includes('筆數待確認'));
// The personnel dropdown shows actual job title + name, ordered by stroke.
assert(visual.includes("new Intl.Collator('zh-TW-u-co-stroke'"));
assert(visual.includes("personTitle(x)+'｜'+personName(x)") );
assert(visual.includes("sort((a,b)=>leaveStrokeCollator.compare(personName(a),personName(b))"));
const sourceBegin=visual.indexOf(' const leaveStrokeCollator=');
const sourceEnd=visual.indexOf(' const showDays=',sourceBegin);
assert(sourceBegin>0&&sourceEnd>sourceBegin,'isolate production dropdown implementation');
const nameSource=visual.slice(sourceBegin,sourceEnd);
const people=[
 {empId:'E3',name:'黃柏源',jobTitle:'技術員'},
 {empId:'E1',name:'王子明',jobTitle:'領班'},
 {empId:'E2',name:'林小華',deptDetail:'操作員'}
];
const before=JSON.stringify(people);
const select={
 value:'',dataset:{},children:[],
 replaceChildren(){this.children=[]},
 append(child){this.children.push(child);}
};
const documentMock={createElement:tag=>({tag,value:'',textContent:''})};
const getChoices=Function('people','permitted','document','personSelect',
 nameSource+'\nupdatePeople();return personSelect.children.map(x=>({value:x.value,label:x.textContent}));');
const options=getChoices(()=>people,()=>true,documentMock,select);
assert.deepEqual(options.map(x=>x.value),['','E1','E2','E3'],
 'names use traditional stroke order: 王, 林, 黃');
assert.equal(options[1].label,'領班｜王子明（E1）');
assert.equal(options[2].label,'操作員｜林小華（E2）');
assert.equal(options[3].label,'技術員｜黃柏源（E3）');
assert.equal(JSON.stringify(people),before,'dropdown must never mutate HR employee records');
console.log('PASS annual-balance adjacent tab, blue workspace reference layout, official cloud unknown state, stroke-sorted job-title/name selector');

console.log('PASS leave reference page: only admin visual skin and read-only KPI/calendar; existing application, review, balance, cover, auth and cloud functions preserved');
