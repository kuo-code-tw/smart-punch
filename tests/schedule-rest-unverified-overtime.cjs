// Regression: incomplete roster annotations are not formal/pending overtime reports.
// All employees are checked; no cloud record is mutated by this test.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const source=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const month='2026-10',day=n=>month+'-'+String(n).padStart(2,'0'),typhoon=day(23);
const people=Array.from({length:83},(_,i)=>({id:'E'+i,empId:'E'+i,name:'員工'+i}));
const restDays=[1,4,7,10,13,16,19,22,23,25,28];
const c={
 console,employees:people,monthlyScheduleData:{},monthlyScheduleMeta:{},
 p79TyphoonDates:()=>[typhoon],p79EmploymentStartDate:()=>'',p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],
 p79MonthlyRestContext:{employmentStart:()=>''},
 P79SpecialOvertime:{electionDates:()=>[]},
 P79RestAttendance:{
   state:(snapshot,emp,date)=>snapshot?.states?.[emp+'|'+date]||'worked',
   isLeaveDay:()=>false
 },
 p79ScheduleRestClient:()=>({status:()=>({evidence:{complete:true}})}),
 p79ScheduleRestBalance:()=>({ledger:[]}),p79ScheduleNoPunchRest:()=>false,
 p79CoverageShift:()=>'',p79SubstituteShiftLabel:(emp,date)=>date===day(22)?'國08-16':'',
 p79ScheduleLeaveExportCode:x=>x,scheduleLeaveTypeText:x=>x,
 p79ScheduleSpecialNoPunchCode:()=>'',scheduleTaipeiTodayKey:()=>day(31)
};c.window=c;vm.createContext(c);
vm.runInContext(source,c);
vm.runInContext(fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),c);
const extract=n=>{
 const i=html.indexOf('    function '+n+'('),j=html.indexOf('\n    }',i);
 assert(i>=0&&j>i,'missing function '+n);return html.slice(i,j+6);
};
for(const n of ['p79RestAutomaticExcludedDates','p79RestAutomaticPlan','p79VisibleRestKind',
 'p79ConfirmedRestOvertime','p79ScheduleDisplayContext','p79ScheduleDisplayDay',
 'p79ScheduleExportDay','p79VisibleRestDayAudit','p79DailyRestCount'])
 vm.runInContext(extract(n),c);
let confirmed=0,revoked=0,weak=0,timed=0,idless=0,typhoonCases=0;
for(let i=0;i<people.length;i++){
 const emp=people[i],id=emp.id,scenario=i%6;
 const roster=Object.fromEntries(Array.from({length:31},(_,j)=>
   [day(j+1),restDays.includes(j+1)?'休':'早']));
 const meta=Object.fromEntries(restDays.map(n=>[day(n),
   {restCategory:'休',restAllocationSource:'manual'}]));
 if(scenario===0||scenario===1){
   roster[day(22)]='早';
   meta[day(22)]={restCategory:'國',restQuotaOvertime:true,
     restAllocationSource:'manual',overtime:true,
     ...(scenario===1?{overtimeType:'rest',overtimeStart:'08:00',overtimeEnd:'16:00'}:{})};
 }
 if(scenario===2||scenario===3){
   const reportId='SAVED-'+i;
   meta[day(12)]={restCategory:'國',restQuotaOvertime:true,restAllocationSource:'manual',
     overtimeReport:{id:reportId,category:'國'},
     ...(scenario===3?{overtimeRevocations:[{confirmed:true,reportId}]}:{})};
 }
 if(scenario===4)meta[day(12)]={restCategory:'國',restQuotaOvertime:true,
   restAllocationSource:'manual',overtimeReport:{category:'國'}};
 if(scenario===5)meta[typhoon]={restCategory:'國',restAllocationSource:'manual'};
 roster.__meta=meta;c.monthlyScheduleData[id]=roster;c.monthlyScheduleMeta[id]=meta;
 const states=Object.fromEntries(Array.from({length:31},(_,j)=>
   [id+'|'+day(j+1),roster[day(j+1)]==='休'?'rest':'worked']));
 const original=JSON.stringify(roster);
 const balance=c.P79MonthlyRest.balance(emp,roster,month,
   {states,leaveDates:[],leaveCoverAssignments:[]},'');
 const plan=c.p79RestAutomaticPlan(emp,month);
 assert.equal(balance.conflicts.filter(x=>/休假加班已排入班表|已列入待確認額度/.test(x.reason)).length,0,
   id+' must not create phantom pending report');
 assert.equal(balance.ledger.find(x=>x.date===typhoon)?.kind,'typhoon');
 assert.equal(JSON.stringify(roster),original,'no destructive metadata/roster change');
 if(scenario===0){
   weak++;
   assert.equal(balance.conflicts.some(x=>x.date===day(22)),false);
   assert.equal(balance.reported.國,0);
   assert.equal(balance.ledger.some(x=>x.date===day(22)&&x.kind==='reservedOvertime'),false);
 }else if(scenario===1){
   timed++;
   assert(balance.conflicts.some(x=>x.date===day(22)&&x.reason.includes('人工加班時段')));
   assert.equal(balance.reported.國,0);
 }else if(scenario===2){
   confirmed++;
   assert.equal(balance.reported.國,1,'verified cloud id counts exactly once');
 }else if(scenario===3){
   revoked++;
   assert.equal(balance.reported.國,0,'revoked report cannot consume quota');
 }else if(scenario===4){
   idless++;
   assert.equal(balance.reported.國,0);
   assert(balance.conflicts.some(x=>x.date===day(12)&&x.reason.includes('缺少正式申報編號')));
 }else{
   typhoonCases++;
   assert.equal(plan.meta[typhoon]?.restCategory,undefined);
 }
 // Only confirmed workday rest OT (or an actual off day) appears in the display audit.
 const audit=c.p79DailyRestCount(emp,month,plan.meta);
 if(scenario===0||scenario===1)assert.equal(audit.dates.國.includes('22'),false);
 const view=c.p79ScheduleDisplayContext(emp,month,plan.meta);
 if(scenario===0||scenario===1){
   const cell=c.p79ScheduleDisplayDay(emp,day(22),view);
   assert.equal(cell.visibleRestKind,'','an unverified time-label must not count as 例/休/國');
 }
 assert.equal(c.p79ScheduleExportDay(emp,typhoon,view),'颱');
}
console.log('PASS 83 employee scenarios: weak '+weak+', assigned '+timed+
 ', verified '+confirmed+', revoked '+revoked+', idless '+idless+
 ', typhoon '+typhoonCases+'; no ghost quota, no ghost warnings, no cloud mutation');
