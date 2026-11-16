'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('schedule/index.html','utf8');
const css=fs.readFileSync('assets/port79-schedule-reference-design.css','utf8');
function check(condition,label){assert(condition,label)}
check(html.includes('id="p79ScheduleRefHero"'),'visual page heading exists');
check(html.includes('id="p79ReferenceKpis"'),'five headline KPI cards exist');
check(['p79RefAllCount','p79RefPresentCount','p79RefAbsentCount','p79RefLeaveCount','p79RefCoverCount'].every(x=>html.includes('id="'+x+'"')),'all live KPI targets exist');
check(html.includes("currentAttendance=p79ScheduleAttendanceHasSynced"),'attendance figures require verified fresh source');
check(html.includes("isScheduleEmployeeClockedIn(e.id)"),'signed-in figure derives from actual attendance');
check(html.includes("Math.max(0,allIncluded.size-checkedIn)"),'pending figure derives from roster');
check(html.includes("allIncluded.size+' 人'"),'total derives from roster');
check(!html.includes('id="p79RefAllCount">86')&&!html.includes('id="p79RefPresentCount">63'),'example-image figures are not hardcoded');
check(html.includes("p79-ref-no-cover")&&html.includes("p79GoScheduleView(event"),'fifth column handles empty state with working page navigation');
check(html.includes('port79-schedule-reference-design.css?v='),'reference CSS stylesheet is linked');
check(css.includes('grid-template-columns:1.4fr repeat(4,1fr)'),'five top cards align as reference');
check(css.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'five today columns align as reference');
check(css.includes('html[data-p79-schedule-page="month"] #p79ReferenceKpis{display:none!important}'),'monthly view stays separate');
check(css.includes('#p79RosterScroll .p79-month-schedule-table'),'monthly grid still scrolls');
check(['"早"','"中"','"晚"','"休"'].every(x=>css.includes('data-display-shift='+x)||css.includes('[data-display-shift='+x)),'colored actual shift values have styles');
check(html.includes('flushSchedulePendingWrites')&&html.includes('p79SelectSchedulePage'),'safety guards persist');
check(html.includes('id="scheduleEditLockStatus"')&&html.includes("host.appendChild(lock)"),'original edit lock remains accessible');
check(html.includes('id="scheduleActiveEditorBanner"')&&html.includes('host.appendChild(banner)'),'current editor state remains accessible');
check(html.includes('id="schedule-import-btn"')&&html.includes('id="schedule-cloud-sync-btn"'),'original importing and cloud syncing are retained');
check(html.includes('id="p79RefAdvancedToggle"')&&html.includes('p79ToggleReferenceAdminTools'),'advanced functions remain accessible');
check(html.match(/id="p79ScheduleViewNav"/g)?.length===1,'one page navigation, no duplicate state');
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(/\bsrc=|application\/json|importmap/.test(match[1]))continue;
 new vm.Script(match[2]);
}
const fn=html.match(/<script id="p79-schedule-reference-design-controller">([\s\S]*?)<\/script>/);
check(!!fn,'new controls inline controller exists and is syntactically valid');
console.log('PASS reference-aligned daily and monthly design, real data metrics, safe navigation, and syntax');
