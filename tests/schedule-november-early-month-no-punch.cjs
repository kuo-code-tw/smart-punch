'use strict';
// Regression: November 9 must not require ten future dates of punch history.
// Verify all roles, complete shifts, one-sided punches, sparse feeds and
// read-only roster/export resolution without changing cloud source records.
const assert=require('node:assert/strict'),fs=require('node:fs');
const source=p=>fs.readFileSync(p,'utf8');
const v6=require('../attendance/v6-engine.js');
const rest=Function('const window={};'+source('assets/port79-rest-attendance.js')+';return window.P79RestAttendance;')();
const shift=Function('engine','const window={P79AttendanceV6:engine};let module={exports:{}};'+source('assets/port79-schedule-punch-restore.js')+';return module.exports;')(v6);
const api=Function('window',source('assets/port79-schedule-rest-evidence.js')+';return window.P79ScheduleRestEvidence;')({P79RestAttendance:rest});
const month='2026-11',day=n=>month+'-'+String(n).padStart(2,'0');
const people=Array.from({length:83},(_,i)=>({id:'E'+String(i+1).padStart(3,'0'),attNo:String(i+1),
 role:['領班','AQC','ARMG','指揮手','F/L'][i%5],group:['A組','B組','C組','D組'][i%4]}));
const schedules=people.map(p=>({empId:p.id,schedule:Object.fromEntries(Array.from({length:30},(_,i)=>[day(i+1),'早']))}));
const timestamp=r=>Date.parse(v6.normalizeTime(r.timeStr).replace(/\//g,'-').replace(' ','T')+'+08:00');
const punch=(emp,n,h,type)=>({id:emp+'-'+n+'-'+h+'-'+type,empId:emp,attNo:String(Number(emp.slice(1))),
 timeStr:'2026/11/'+String(n).padStart(2,'0')+' '+h,
 status:type==='IN'?'上班簽到':'下班簽退'});
const healthy=[];
for(let n=1;n<=8;n++)for(let i=2;i<=25;i++){
 const who='E'+String(i).padStart(3,'0');
 healthy.push(punch(who,n,'08:00','IN'),punch(who,n,'16:00','OUT'));
}
const make=(official,raw=null)=>api.create({
 token:()=> 'verified',employees:()=>people,schedules:()=>schedules,
 buildShifts:r=>v6.buildShifts(r),timestamp,leaveDates:()=>[],
 shiftForSession:r=>shift.displayShiftFromClockIn(r.clockIn,r.clockOut),
 read:async m=>({ok:true,month:m,records:m===month?official:[],
  absenceReferenceRecords:raw===null?null:m===month?raw:[]}),
 update:()=>{},now:()=>Date.parse('2026-11-09T09:00:00+08:00')
}).refresh(month);
(async()=>{
 const key='E001|'+day(8);
 const audit=await make(healthy);
 assert.equal(audit.complete,true);
 assert.equal(audit.absenceConfirmedDays[key],true,'Nov 8: fully completed zero-punch workday is 休');
 assert.equal(audit.absenceConfirmationModes[key],'official-coverage');
 assert.equal(audit.days[key].state,'rest');
 assert.equal(audit.auditSummary.employees,83,'check all 83 employees, not only the selected group');
 assert.equal(audit.absenceConfirmedDays['E001|'+day(9)],undefined,'Nov 9 work shift has not finished');
 assert.equal(audit.days['E001|'+day(9)].state,'open');
 const one=await make([...healthy,punch('E001',8,'08:03','IN')]);
 assert.equal(one.days[key].state,'missing','single IN is not a day off');
 assert.equal(one.absenceConfirmedDays[key],undefined);
 const paired=await make([...healthy,punch('E001',8,'08:03','IN'),punch('E001',8,'16:02','OUT')]);
 assert.equal(paired.days[key].state,'worked','complete IN/OUT outranks rest');
 assert.equal(paired.absenceConfirmedDays[key],undefined);
 const sparse=await make(healthy.filter(r=>r.timeStr.includes('/11/08 ')));
 assert.notEqual(sparse.days[key].state,'rest','one day of bulk data is not proof of complete month-to-date feed');
 const empty=await make([]);
 assert.notEqual(empty.days[key].state,'rest','empty official feed must not mark everyone off');
 const contradictory=await make(healthy,[...healthy,punch('E001',8,'08:03','IN')]);
 assert.notEqual(contradictory.days[key].state,'rest','unpaired raw punch blocks zero-punch classification');
 const html=source('schedule/index.html'),start=html.indexOf('    function p79ScheduleNoPunchRest(');
 const end=html.indexOf('    // On-demand full staff check',start);
 assert(start>=0&&end>start);
 const originalRoster={E001:{[day(8)]:'中'}},originalMeta={E001:{}},before=JSON.stringify({originalRoster,originalMeta});
 const env={
  monthlyScheduleData:originalRoster,monthlyScheduleMeta:originalMeta,
  approvedLeaveForEmployee:()=>null,p79EmployeeDateEligible:()=>true,
  window:{P79RestAttendance:rest},
  p79ScheduleRestClient:()=>({status:()=>({evidence:audit})}),
  p79ScheduleHasVerifiedPunch:()=>false,
  p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',p79LeaveCoverOnDay:()=>[],
  p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=>'',p79ScheduleSpecialNoPunchCode:()=>'',scheduleTaipeiTodayKey:()=>day(9)
 };
 const get=Function('env','with(env){'+html.slice(start,end)+';return p79ScheduleDisplayDay;}')(env);
 const context={automaticRestMeta:{[day(8)]:{restCategory:'國'}},restBalance:{ledger:[]},
  attendanceEvidence:audit,attendanceSnapshot:{attendanceEvidence:audit},
  typhoonDays:new Set(),electionDays:new Set(),typhoonToday:day(9)};
 const shown=get({id:'E001'},day(8),context);
 assert.equal(shown.visibleCode,'休','saved 中 and stale 國 metadata both yield 休');
 assert.equal(shown.visibleRestKind,'休');
 assert.equal(JSON.stringify({originalRoster,originalMeta}),before,'display must not write cloud roster');
 assert(html.includes('row[String(d)]=selected.visibleCode'),'Excel and calendar use the same attendance-resolved code');
 console.log('PASS Nov9: 83-person/month-to-date zero-punch rest, pair/single/early/sparse/dual safety, screen/export parity, no writes');
})().catch(e=>{console.error(e);process.exitCode=1});
