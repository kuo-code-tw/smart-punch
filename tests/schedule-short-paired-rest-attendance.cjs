const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const c={Date,Map,Set,JSON,Number,String,Math,Array,Promise,Intl,console};c.window=c;
c.P79AttendanceV6=require('../attendance/v6-engine.js');
vm.createContext(c);
for(const file of ['port79-schedule-punch-restore.js','port79-rest-attendance.js','port79-schedule-rest-evidence.js','port79-rest-allocation.js','port79-monthly-rest-overtime.js'])
 vm.runInContext(fs.readFileSync('assets/'+file,'utf8'),c,{filename:file});
const month='2026-10',day=d=>month+'-'+String(d).padStart(2,'0');
const dates=Array.from({length:31},(_,i)=>day(i+1));
const people=[{id:'E1',empId:'E1',attNo:'73',name:'模擬短時出勤者'}, {id:'E2',empId:'E2',attNo:'74',name:'模擬例假出勤者'}, {id:'E3',empId:'E3',attNo:'75',name:'單邊打卡者'}];
const rosters=Object.fromEntries(people.map(e=>{
 const r={...Object.fromEntries(dates.map(d=>[d,'早'])),__meta:{}};
 r[day(11)]=e.id==='E2'?'早':'休';
 if(e.id==='E2')r[day(27)]='例';
 if(e.id==='E1'||e.id==='E3')r.__meta[day(11)]={restCategory:'例',restAllocationSource:'auto-v1'};
 return [e.id,r];
}));
const before=JSON.stringify(rosters);
const recs=[
 {id:'E1-I',empId:'E1',attNo:'73',timeStr:'2026/10/11 15:33:00',status:'上班簽到'},
 {id:'E1-O',empId:'E1',attNo:'73',timeStr:'2026/10/11 17:59:00',status:'下班簽退'},
 {id:'E2-I',empId:'E2',attNo:'74',timeStr:'2026/10/27 07:41:00',status:'上班簽到'},
 {id:'E2-O',empId:'E2',attNo:'74',timeStr:'2026/10/27 08:09:00',status:'下班簽退'},
 {id:'E3-I',empId:'E3',attNo:'75',timeStr:'2026/10/11 15:32:00',status:'上班簽到'}
];
const ts=r=>Date.parse(r.timeStr.replaceAll('/','-').replace(' ','T')+'+08:00');
const schedules=people.map(e=>({empId:e.id,schedule:rosters[e.id]}));
const client=c.P79ScheduleRestEvidence.create({
 now:()=>Date.parse('2026-10-27T22:30:00+08:00'),token:()=> 'FIXTURE',employees:()=>people,schedules:()=>schedules,
 buildShifts:c.P79AttendanceV6.buildShifts,timestamp:ts,leaveDates:()=>[],
 shiftForSession:row=>c.P79SchedulePunchRestore.shiftFromClockIn(row.clockIn,row.clockOut),
 read:async m=>({ok:true,month:m,records:m===month?recs:[]}),update:()=>{}
});
const extract=name=>{
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 assert(start>=0&&end>start,'missing helper '+name);
 return html.slice(start,end+6);
};
c.employees=people;c.monthlyScheduleData=rosters;
c.monthlyScheduleMeta=Object.fromEntries(people.map(e=>[e.id,rosters[e.id].__meta]));
c.p79ScheduleRestClient=()=>client;c.p79AutomaticRestMetadata=(id)=>c.monthlyScheduleMeta[id]||{};
c.p79EmployeeDateEligible=()=>true;c.approvedLeaveForEmployee=()=>null;c.p79LeaveCoverOnDay=()=>[];
c.p79ScheduleRestBalance=()=>({ledger:[]});
c.p79TyphoonDates=()=>[];c.scheduleTaipeiTodayKey=()=>day(27);
c.p79ScheduleNoPunchRest=()=>false;c.p79CoverageShift=()=>'';c.p79SubstituteShiftLabel=()=>'';c.p79ScheduleSpecialNoPunchCode=()=>'';c.p79ScheduleLeaveExportCode=()=>'';c.scheduleLeaveTypeText=()=>'';c.P79SpecialOvertime={electionDates:()=>[]};
c.p79EmploymentStartDate=()=>'';c.p79MonthlyRestContext={employmentStart:()=>''};
for(const name of ['p79ScheduleHasVerifiedPunch','p79VisibleRestKind','p79ScheduleDisplayContext','p79ScheduleDisplayDay','p79RestAutomaticExcludedDates'])
 vm.runInContext(extract(name),c);
(async()=>{
 const evidence=await client.refresh(month);
 assert.equal(evidence.complete,true);
 assert.equal(evidence.actualShifts['E1|'+day(11)],undefined,'under-three-hour punch does not claim full middle shift');
 assert.equal(evidence.actualShifts['E2|'+day(27)],undefined,'28-minute pair does not claim full early shift');
 assert.equal(c.P79RestAttendance.state({attendanceEvidence:evidence},'E1',day(11)),'worked','2h26 must count');
 assert.equal(c.P79RestAttendance.state({attendanceEvidence:evidence},'E2',day(27)),'worked','28 minutes must count');
 assert.equal(c.P79RestAttendance.state({attendanceEvidence:evidence},'E3',day(11)),'missing','single IN must not count');
 for(const [person,date] of [[people[0],day(11)],[people[1],day(27)]]){
  const view=c.p79ScheduleDisplayDay(person,date);
  assert.equal(view.shownShift,'已出勤',person.id+' paired short work must be visible');
  assert.equal(view.visibleRestKind,'',person.id+' must not be an entire used 例/休/國 rest day');
  assert.equal(view.verifiedRestAttendance,true);
  assert(c.p79RestAutomaticExcludedDates(person,month).includes(date),'paired day excluded from rest quota allocation');
 }
 const unpaired=c.p79ScheduleDisplayDay(people[2],day(11));
 assert.equal(unpaired.verifiedRestAttendance,false);
 assert.equal(unpaired.shownShift,'例','one IN cannot overwrite original rest category');
 const attendancePairs=[
  {empId:'E1',date:day(11),start:ts(recs[0]),end:ts(recs[1])},
  {empId:'E2',date:day(27),start:ts(recs[2]),end:ts(recs[3])}
 ];
 for(const [person,date] of [[people[0],day(11)],[people[1],day(27)]]){
  const balance=c.P79MonthlyRest.balance(person,rosters[person.id],month,{attendanceEvidence:evidence,pairs:attendancePairs});
  const item=balance.ledger.find(x=>x.date===date);
  assert.equal(item.kind,'workedRestUnreported','attendance must not be counted as an off day');
  assert(balance.conflicts.some(x=>x.date===date&&x.reason.includes('有完整上下班打卡')),'warn audit without mislabeling leave type');
  assert(!balance.ledger.some(x=>x.date===date&&x.kind==='off'),'no used quota on attended day');
 }
 assert.equal(JSON.stringify(rosters),before,'no roster / overtime declarations are written during presentation and audit');
 console.log('PASS 2h26 and 28min paired attendance: visible 已出勤, no full-shift inference, no consumed rest quota, accurate warnings, lone IN guard, unchanged official roster');
})().catch(e=>{console.error(e);process.exitCode=1});
