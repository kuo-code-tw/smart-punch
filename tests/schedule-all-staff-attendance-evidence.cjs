// Every employee/company/role must reflect official paired attendance without rewriting the planned roster.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const overlaySource=fs.readFileSync('assets/port79-schedule-attendance-display.js','utf8');
const evidenceSource=fs.readFileSync('assets/port79-rest-attendance.js','utf8');
const html=fs.readFileSync('schedule/index.html','utf8');
const context={window:{},Date,Set,Map,Promise};
vm.createContext(context);
vm.runInContext(evidenceSource,context);
vm.runInContext(overlaySource,context);
const api=context.window.P79RestAttendance,resolve=context.window.P79ScheduleAttendanceDisplay.resolve;
const workers=[
 {empId:'C1',company:'公司一',group:'C組',role:'領班',date:'2026-10-24',shift:'休'},
 {empId:'C2',company:'公司一',group:'C組',role:'ARMG',date:'2026-10-25',shift:'例'},
 {empId:'D1',company:'公司二',group:'D組',role:'AQC',date:'2026-10-24',shift:'國'},
 {empId:'A1',company:'公司三',group:'A組',role:'指揮手',date:'2026-10-25',shift:'早'}
];
const original=workers.map(w=>({empId:w.empId,schedule:{[w.date]:w.shift}}));
const schedules=[...original,{empId:'C3',schedule:{'2026-10-24':'例'}}];
const sessions=workers.map(w=>({
 empId:w.empId,start:Date.parse(w.date+'T08:00:00+08:00'),end:Date.parse(w.date+'T16:00:00+08:00')
}));
sessions.push({empId:'C3',start:Date.parse('2026-10-24T08:00:00+08:00'),end:null});
const evidence=api.build({complete:true,month:'2026-10',now:Date.parse('2026-10-27T15:00:00+08:00'),schedules,sessions});
for(const w of workers){
 const state=api.state({attendanceEvidence:evidence},w.empId,w.date),marker=resolve({state,shift:w.shift});
 assert.equal(state,'worked',w.empId+' has paired punches');
 assert.equal(marker.worked,true,w.empId+' worked marker');
 assert.equal(marker.excludeRestCount,w.shift!=='早',w.empId+' rest quota');
 assert.equal(schedules.find(s=>s.empId===w.empId).schedule[w.date],w.shift,'never rewrite legal roster');
}
const incomplete=resolve({state:api.state({attendanceEvidence:evidence},'C3','2026-10-24'),shift:'例'});
assert.equal(incomplete.pending,true,'single punch is pending, not confirmed worked');
assert.equal(incomplete.excludeRestCount,false,'unpaired punch cannot change statutory rest count');
const noPunch=resolve({state:'rest',shift:'休'});
assert.equal(noPunch.label,'');assert.equal(noPunch.excludeRestCount,false);
assert(html.includes('port79-schedule-attendance-display.js'),'shared script loaded in roster');
assert(html.includes('attendanceMarker=window.P79ScheduleAttendanceDisplay?.resolve?.('),'all daily cells use same attendance mapper');
assert(html.includes('attendanceMarker.excludeRestCount'),'actual work removed from used rest quota');
assert(html.includes('attendanceMarker.worked ||'),'actual work included in workday count');
assert(html.includes('data-attendance-state="${scheduleEscapeHtml(attendanceState)}"'),'evidence state visible for diagnosis');
assert(html.includes('p79ScheduleRestClient().refresh(currentScheduleMonthKey())'),'manual refresh must reload punch evidence');
console.log('PASS all-staff official attendance overlay, real paired and incomplete punches, statutory rest preservation, quota totals, cloud refresh');
