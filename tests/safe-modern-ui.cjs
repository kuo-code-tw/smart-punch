/* Guard rails for the management-only UI refresh. No cloud/API or punch behavior is changed. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const home=read('index.html');
const shared=read('assets/port79-seven-top.css');
const internal=read('assets/port79-modern-system-ui.css');
const dashboard=read('assets/port79-modern-home.css');
const history=read('history-data/index.html');
const expected=[
 ['attendance','cardAttendance',"launchSystem('attendance')"],
 ['workhours','cardWorkhours',"launchSystem('workhours')"],
 ['leave','cardLeave',"launchSystem('leave')"],
 ['schedule','cardSchedule',"launchSystem('schedule')"],
 ['efficiency','cardEfficiency',"launchSystem('efficiency')"],
 ['hr','cardHr',"launchSystem('hr')"]
];
for(const [system,id,handler] of expected){
 assert(home.includes('id="'+id+'"'),'retains '+id);
 assert(home.includes('onclick="'+handler+'"'),'retains original navigation '+system);
}
assert(home.includes('id="cardHistory"')&&home.includes("onclick=\"location.href='./history-data/'\""),'original history destination preserved');
assert(home.includes('歷史資料庫／歷史資料中心'),'history is prominent on the dashboard');
assert(home.includes('id="punchLoginBtn"')&&home.includes('id="manageLoginBtn"'),'login and punch entry points unchanged');
assert(home.includes('assets/port79-modern-home.css'),'dashboard stylesheet is linked');
assert(shared.startsWith('@import url("./port79-modern-system-ui.css'),'internal UI loaded by original shared system stylesheet');
assert(dashboard.includes('body:has(#systems.show)'),'dashboard changes only activate after login');
assert(internal.includes('p79-attendance-management-chrome:not(.p79-punch-only)'),'attendance-only punch mode excluded');
for(const sys of ['leave','schedule','efficiency','hr','history','workhours'])assert(internal.includes('body[data-p79-system="'+sys+'"]'),'internal subpage styling for '+sys);
assert(internal.includes('#vesselMonthlyExportDialog'),'vessel export dialog included');
assert(internal.includes('.p79-month-schedule-table'),'schedule cell semantics intentionally left intact');
assert(internal.includes('.history-excel-bar'),'history export and backup controls included');
for(const id of ['historyBackupNow','historyExportExcel','historyExcelTemplate','historyImportExcel','loadBtn','month'])assert(history.includes('id="'+id+'"'),'history interface retained '+id);
for(const action of ['historyGetMonthData','historyBackupCapabilities'])assert(history.includes(action),'original historical data connection retained');
console.log('PASS safe modern UI: module routing, history access, punch isolation, 7-module internal surfaces and unchanged historical-data connections');
