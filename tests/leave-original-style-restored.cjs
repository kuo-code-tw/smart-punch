'use strict';
// Historical test forced an OLD appearance that contradicts the approved screenshot.
// Keep all original leave functions but require the screenshot layout to load.
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('leave/index.html','utf8');
for(const asset of [
 'port79-leave-reference-visual.css','port79-leave-reference-visual.js',
 'port79-leave-exact-reference.css','port79-leave-exact-reference.js'
])assert(html.includes(asset),'reference dashboard asset missing: '+asset);
const visualCss=fs.readFileSync('assets/port79-leave-exact-reference.css','utf8');
const restore=visualCss.slice(visualCss.indexOf('2026-11-17: Restore the ORIGINAL shared top toolbar'));
assert(restore.includes('#p79WorkspaceTopbar{')&&restore.includes('display:flex!important'),
 'the original functional top toolbar must remain visible in the admin screen');
assert(restore.includes('#p79WorkspaceStatus{')&&restore.includes('display:block!important'),
 'the actual live status tray must be restored (not cloned)');
assert(restore.includes('#p79SevenStatus{')&&restore.includes('flex-wrap:nowrap!important'),
 'live system status chips must be visible and scrollable');
assert(restore.includes('.p79-nav-collapsed #p79WorkspaceTopbar'),
 'the original menu toggle must still open and collapse the sidebar');
assert(html.includes('topbar=20261117-restore-v1'),
 'changed shared toolbar styles must not be shadowed by old browser cache');
assert(html.indexOf('port79-leave-exact-reference.css')>html.indexOf('port79-leave-ui-v115.css'),
 'screenshot CSS must override prior V115 page styles');
for(const marker of [
 'id="employeeMode"','id="adminMode"','id="adminBalanceMode"',
 'id="leaveStickyTabs"','id="tabEmployee"','id="tabAdmin"','id="tabBalance"',
 'id="adminLeaveBody"','id="adminBalancePanel"','id="adminBalanceBody"',
 'id="filterMonth"','id="filterDept"','id="filterJob"','id="filterStatus"',
 'id="adminLeaveSummary"','id="adminCreateLeaveBtn"','id="submitLeaveBtn"',
 'id="adminReadOnly"','id="leaveBalanceImportFile"',
 'onclick="submitLeave()"','onclick="openAdminCreateLeave()"',
 'function renderAdmin(){','function renderAdminBalances(){',
 'function leaveBalanceInfo(emp)','function switchMode(m)',
 'async function submitLeave()','async function setLeaveStatus',
 'async function deleteLeave','function renderAll(){',
 'function p79LeaveSavedOvertimePeriod(report)'
])assert(html.includes(marker),'original leave operation missing: '+marker);
assert(!/id="p79PixelFilterBar"|id="p79LeaveVisualStats"/.test(html),
 'visual nodes must be created once by the read-only scripts');
let checked=0;
for(const [,attrs,code] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(/\bsrc\s*=|application\/json|importmap/i.test(attrs)||!code.trim())continue;
 new vm.Script(code,{filename:'leave-inline-script-'+checked+'.js'});checked++;
}
assert(checked>=1,'original controller must remain parseable');
console.log('PASS screenshot dashboard enabled; original leave and cloud flows preserved');
