'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const page=fs.readFileSync('work-hours/index.html','utf8');
const ui=fs.readFileSync('assets/port79-workhours-reference-dashboard.js','utf8');
const html=fs.readFileSync('assets/port79-workhours-reference-dashboard.html','utf8');
const css=fs.readFileSync('assets/port79-workhours-reference-dashboard.css','utf8');
new vm.Script(ui);
assert(page.includes('port79-workhours-reference-dashboard.css?v=20261117-approved-v1'));
assert(page.includes('port79-workhours-reference-dashboard.js?v=20261117-approved-v1'));
assert(ui.includes('port79-workhours-reference-dashboard.html?v=20261117-approved-v1'));
assert(html.includes('id="p79WorkhoursReference"'));
assert(html.includes('id="prForm"')&&html.includes('id="prTableBody"'));
const ids=['prUnit','prJob','prPerson','prStart','prEnd','prKpiWork','prKpiOvertime',
 'prKpiPeople','prKpiPending','prTrend','prDonut','prBreakdown','prTableBody',
 'prPersonalTitle','prPersonalActual','prPersonalOT','prPages'];
for(const k of ids)assert(html.includes('id="'+k+'"'),'screenshot dashboard missing '+k);
assert(!/143,628|1,428\.5|682 人|已核准\s*3/.test(html+ui+css),
 'approved screenshot is NOT a source of sample KPI figures');
assert(ui.includes('hasValidHomepageAdminSession'),'fail closed without logged-in workhours session');
assert(ui.includes('p79WorkhoursEligibleEmployees'),'only authorized HR employees may appear');
assert(ui.includes('p79WorkOvertimeMonthVerified'),'reconcile against confirmed official cloud month');
assert(ui.includes('p79WorkOvertimeOfficialReport'),'exclude non-official/revoked declarations');
assert(ui.includes('p79WorkOvertimeLedgerMonth'),'use official overtime credit month');
assert(ui.includes('p79WorkOvertimeIsUnconfirmedPlan'),'unconfirmed planned overtime never counts as completed');
assert(ui.includes('buildDailyAttendanceRows'),'use original physical IN/OUT pairing');
assert(ui.includes('getAttendanceTimestamp'),'read original actual timestamps');
assert(ui.includes('window.Port79JobTitleVisibility.isVisible'),'respect HR-hidden job titles');
assert(ui.includes("f.start.slice(0,7)!==f.end.slice(0,7)"),'never silently blend different payroll months');
assert(ui.includes("T00:00:00Z"),'do not shift Taiwan date-only trend by 1 day');
assert(ui.includes('reportSums')&&ui.includes('sessionSums'),'donut ratio must require physical matching evidence');
assert(ui.includes('rawHours:null')===false,'undefined hours may never be force-filled with sample data');
assert(ui.includes('return\\'applied\\'')||ui.includes("return'applied'"),'submitted is not the same as approved');
assert(ui.includes('p79OvertimeCalculationCache'),'original work-hours ledger remains source of report records');
assert(ui.includes("em='—'"),'unknown data must display a dash rather than invented zero');
assert(ui.includes("id('prPersonalScheduled',")===false,'cannot invent the expected hours from an attendance interval');
assert(css.includes('body.p79-work-hours-page #viewAdmin.p79-ref-active'),'scope styles only to work-hours dashboard');
assert(css.includes('body.p79-work-hours-page #viewAdmin:not(.p79-ref-active) #p79WorkhoursReference'),'original dashboard remains available');
for(const route of ['attendance/index.html','leave/index.html','hr/index.html','schedule/index.html']){
 const original=fs.readFileSync(route,'utf8');
 assert(!original.includes('port79-workhours-reference-dashboard.'),'no unrelated module may load this layout: '+route);
}
console.log('PASS screenshot-locked dashboard: real source API, permissions, month and time validation, no demo values, no unrelated module edits');
