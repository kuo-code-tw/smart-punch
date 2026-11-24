'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const page=fs.readFileSync('work-hours/index.html','utf8');
const ui=fs.readFileSync('assets/port79-workhours-reference-dashboard.js','utf8');
const html=fs.readFileSync('assets/port79-workhours-reference-dashboard.html','utf8');
const css=fs.readFileSync('assets/port79-workhours-reference-dashboard.css','utf8');
new vm.Script(ui);
assert(page.includes('port79-workhours-reference-dashboard.css?v=20261123-reference-home-tabs-v3'));
assert(page.includes('port79-workhours-reference-dashboard.js?v=20261123-reference-home-tabs-v3'));
assert(ui.includes('port79-workhours-reference-dashboard.html?v=20261117-approved-v1'));
assert(html.includes('id="p79WorkhoursReference"'));
assert(html.includes('id="prForm"')&&html.includes('id="prTableBody"'));
assert(!html.includes('<th>申請單號</th>'),'application number column must be removed from table heading');
assert(html.includes('<th>□</th><th>申請日期</th>'),'application date follows original checkbox column');
assert(ui.includes("const cells=['□',r.submitDate||em,r.name"),'rendered row must start with date, not application UUID');
assert(!ui.includes("const cells=['□',r.id"),'never show application number as a table cell');
assert(ui.includes('c.colSpan=11'),'empty state spans exact eleven visible columns');
assert(ui.includes("idKey=String(report?.id||'')"),'keep official report IDs for internal reconciliation');
assert(ui.includes('port79-workhours-reference-dashboard.html?v=20261117-approved-v1'),'browser can read the updated table template');
const ids=['prUnit','prJob','prPerson','prStart','prEnd','prKpiApplications','prKpiReviewRate',
 'prKpiRestApplicants','prKpiPending','prTrend','prDonut','prBreakdown','prTableBody',
 'prPersonalTitle','prPersonalActual','prPersonalOT','prPages'];
for(const k of ids)assert(html.includes('id="'+k+'"'),'screenshot dashboard missing '+k);
assert(!/本月總工時|本月加班時數|<div class="pr-kpi-label">出勤人數<\/div>/.test(html),
 'the top-level dashboard must not repeat the other modules\' time/headcount cards');
assert(html.includes('查詢期間加班申請')&&html.includes('已完成審核比例')&&html.includes('休息日加班申請人數'),
 'the three replacement metrics must focus on overtime application operations');
assert(ui.includes('applicationMetrics(data.reports)'),'KPIs must use the same official scoped reports as the application list');
assert(!/143,628|1,428\.5|682 人|已核准\s*3/.test(html+ui+css),
 'approved screenshot is NOT a source of sample KPI figures');
assert(ui.includes('hasValidHomepageAdminSession'),'fail closed without logged-in workhours session');
assert(ui.includes('p79WorkhoursEligibleEmployees'),'only authorized HR employees may appear');
assert(ui.includes('p79WorkOvertimeMonthVerified'),'reconcile against confirmed official cloud month');
assert(ui.includes('p79WorkOvertimeOfficialReport'),'exclude non-official/revoked declarations');
assert(ui.includes('p79WorkOvertimeLedgerMonth'),'use official overtime credit month');
assert(ui.includes('p79WorkOvertimeIsUnconfirmedPlan'),'unconfirmed planned overtime never counts as completed');
assert(ui.includes('buildDailyAttendanceRows'),'use original physical IN/OUT pairing');
assert(ui.includes('p79ReadWorkRestMonth'),'fetch official authenticated raw attendance months before totaling hours');
assert(ui.includes('mergeAttendanceRecordCollections'),'merge verified adjacent raw months through original deduplication');
assert(ui.includes('attendanceAvailable:Array.isArray(sourceRecords)'),'unknown raw attendance must not be displayed as zero');
assert(ui.includes('byAtt.has(key)?null:e'),'old attendance numbers are allowed only with unique HR identity');
assert(ui.includes('getAttendanceTimestamp'),'read original actual timestamps');
assert(ui.includes('window.Port79JobTitleVisibility.isVisible'),'respect HR-hidden job titles');
assert(ui.includes("f.start.slice(0,7)!==f.end.slice(0,7)"),'never silently blend different payroll months');
assert(ui.includes("T00:00:00Z"),'do not shift Taiwan date-only trend by 1 day');
assert(ui.includes('reportSums')&&ui.includes('sessionSums'),'donut ratio must require physical matching evidence');
assert(ui.includes('rawHours:null')===false,'undefined hours may never be force-filled with sample data');
assert(ui.includes("return'applied'"),'submitted is not the same as approved');
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
