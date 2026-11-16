'use strict';
// Regression: restore the pre-redesign leave page while preserving all
// existing business and cloud logic. Do not load any added dashboard skin.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('leave/index.html','utf8');
for(const asset of [
 'port79-leave-reference-visual.css',
 'port79-leave-reference-visual.js',
 'port79-leave-exact-reference.css',
 'port79-leave-exact-reference.js'
])assert(!html.includes(asset), 'retired UI asset still active: '+asset);
const required=[
 'id="employeeMode"','id="adminMode"','id="leaveStickyTabs"',
 'id="tabEmployee"','id="tabAdmin"','id="adminLeaveBody"',
 'id="adminBalancePanel"','id="adminBalanceBody"',
 'id="filterMonth"','id="filterDept"','id="filterJob"',
 'id="filterStatus"','id="adminLeaveSummary"',
 'id="adminCreateLeaveBtn"','id="submitLeaveBtn"',
 'id="adminReadOnly"','id="leaveBalanceImportFile"',
 'onclick="submitLeave()"','onclick="openAdminCreateLeave()"',
 'function renderAdmin(){','function renderAdminBalances(){',
 'function leaveBalanceInfo(emp)','function switchMode(m)',
 'async function submitLeave()','async function setLeaveStatus',
 'async function deleteLeave','function renderAll(){',
 'function p79LeaveSavedOvertimePeriod(report)'
];
for(const marker of required)assert(html.includes(marker),
 'original leave business control missing: '+marker);
assert(html.includes('port79-management-workspace.css'),
 'original shared workspace skin must remain active');
assert(html.includes('port79-management-workspace.js'),
 'original shared menu behavior must remain active');
assert(html.includes('id="adminLeaveBody"'),
 'the leave table must use its original live cloud records');
assert(!/id="p79PixelFilterBar"|id="p79LeaveVisualStats"/.test(html),
 'redesigned dashboard markup must not be persisted');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
let checked=0;
for(const [,attrs,code] of scripts){
 if(/\bsrc\s*=|application\/json|importmap/i.test(attrs)||!code.trim())continue;
 new vm.Script(code,{filename:'leave-inline-script-'+checked+'.js'});
 checked++;
}
assert(checked>=1,'original inline controllers must stay parseable');
console.log('PASS original leave appearance restored; application, admin review, annual balances, cover, cloud and HR logic retained');
