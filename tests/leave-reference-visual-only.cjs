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
console.log('PASS leave reference page: only admin visual skin and read-only KPI/calendar; existing application, review, balance, cover, auth and cloud functions preserved');
