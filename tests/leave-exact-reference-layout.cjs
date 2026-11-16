'use strict';
// Screenshot reference-match: visual presentation may relocate existing
// admin controls; it cannot write, delete, clone approvals or change cloud data.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('leave/index.html','utf8');
const js=fs.readFileSync('assets/port79-leave-exact-reference.js','utf8');
const css=fs.readFileSync('assets/port79-leave-exact-reference.css','utf8');
new vm.Script(js,{filename:'leave-exact-reference.js'});
assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);
assert.match(html,/port79-leave-exact-reference\.js\?v=20261116-reference-match-v1/);
assert.match(html,/port79-leave-exact-reference\.css\?v=20261116-reference-match-v1/);
const assetOrder=html.indexOf('port79-leave-exact-reference.css');
assert(assetOrder>html.indexOf('port79-management-workspace.css'),'reference rules run after shared workspace');
assert(assetOrder>html.indexOf('port79-leave-reference-visual.css'),'new rules override the older partial design');
const original=[
 'id="employeeMode"','id="adminMode"','id="leaveStickyTabs"','id="tabEmployee"',
 'id="tabAdmin"','id="adminCreateLeaveBtn"','id="adminBalancePanel"',
 'id="adminBalanceBody"','id="adminLeaveBody"','id="filterMonth"','id="filterDept"',
 'id="filterJob"','id="filterStatus"','id="globalStatus"',
 'id="adminLeaveSummary"','id="adminReadOnly"',
 'function leaveBalanceInfo(emp)','function renderAdmin(){',
 'function renderAdminBalances(){',"function switchMode(m)",
 'function leaveDays(l)', 'function renderAll(){',
 'async function submitLeave()', 'async function setLeaveStatus',
 'async function deleteLeave'
];
for(const x of original)assert(html.includes(x),'original business feature removed: '+x);
for(const bad of [
 /fetch\s*\(/,/XMLHttpRequest/,/postCloud\s*\(/,/localStorage/,
 /sessionStorage/,/deleteLeave\s*\(/,/submitLeave\s*\(/,
 /setLeaveStatus\s*\(/,/leaveRecords\s*=(?!=)/,
 /employees\s*=(?!=)/,/adminLeaveBody\.innerHTML\s*=/,
 /adminBalanceBody\.innerHTML\s*=/
])assert(!bad.test(js),'new overlay cannot change business data: '+bad);
assert(css.includes('html.p79-leave-pixel-admin body.p79-workspace[data-p79-system="leave"]'),
 'all brand/sidebar changes must be isolated to the leave manager');
assert(css.includes('grid-template-columns:minmax(0,1fr) 342px'),
 'screenshot shows left table plus right quota/calendar from the first KPI row');
assert(css.includes('#p79PixelFilterBar')&&css.includes('#p79PixelQuotaTable'));
assert(css.includes('#p79PixelPages')&&css.includes('.p79-leave-visual-calendar'));
assert(css.includes('#p79LeaveVisualStats')&&css.includes('repeat(5,minmax(0,1fr))'));
assert(js.includes("const pageSize=7"),'reference screenshot has seven display rows');
assert(js.includes("const createButton=document.getElementById('adminCreateLeaveBtn')"),
 'must reuse the real new-leave action');
assert(js.includes("filter.append(createButton)"),'must move existing real button, never clone');
assert(js.includes("for(const field of fields)filter.append(field)"),
 'must move original filters with existing handlers');
assert(js.includes("const rows=[\n    ['特休','annual']"),
 'right category table represents real data without sample quotas');
assert(js.includes("entitled.textContent='—';remaining.textContent='—';"),
 'unknown nonannual entitlements must not be fabricated');
assert(js.includes("if(kind==='annual')"),'annual entitlement uses original leaveBalanceInfo');
assert(js.includes("const entries=typeof leaveRecords"),'other usage comes from original record data');
assert(js.includes("const employeeTab=document.getElementById('tabEmployee')"),
 'original employee application tab preserved');
assert(js.includes("balanceTab.textContent='員工年假剩餘天數'"),
 'requested third annual balance tab retained');
assert(js.includes("const closeHistory=()=>"),'history tab can return to original approval view');
assert(js.includes('tr.hidden=!keep.has(tr)'), 'pagination only toggles row visibility');
console.log('PASS leave reference visual: header/nav/KPIs/records/quotas/calendar aligned, original operations and cloud data retained');
