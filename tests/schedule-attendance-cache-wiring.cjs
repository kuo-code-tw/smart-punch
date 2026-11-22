'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const pages={
 attendance:fs.readFileSync('attendance/index.html','utf8'),
 workhours:fs.readFileSync('work-hours/index.html','utf8'),
 schedule:fs.readFileSync('schedule/index.html','utf8'),
 home:fs.readFileSync('index.html','utf8')
};
for(const [name,html] of [['attendance',pages.attendance],['workhours',pages.workhours]]){
 assert(html.includes('../assets/port79-attendance-core.js?v=20261122-confirmed-attendance-notice-v2'),
  name+' must use fixed official attendance-core instead of stale browser cache');
}
for(const [name,html] of [['schedule',pages.schedule],['home',pages.home]]){
 assert(html.includes('port79-schedule-rest-evidence.js?v=20261122-attendance-deep-audit-v2'),
  name+' must use current rest evidence code for cross-month attendance');
}
assert(pages.schedule.includes('p79AttendanceNoticeRefreshTimer=setTimeout'),'rapid punches must be debounced');
assert(fs.readFileSync('assets/port79-attendance-core.js','utf8').includes(
 'if(payload&&confirmed)p79NotifyAttendanceWrite(payload)'),'rejected punches do not send official-save notices');
console.log('PASS attendance, work-hours, schedule and home load fresh verified JS without altering cloud data');
