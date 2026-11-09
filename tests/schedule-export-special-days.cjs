const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function body(start,next){const a=html.indexOf('    function '+start+'('),b=html.indexOf(next,a);assert(a>=0&&b>a,'function not found: '+start);return html.slice(a,b);}
const now={value:'2026-10-24'},status={state:'rest',complete:true},shifts={
 '2026-10-22':'早','2026-10-23':'晚','2026-10-25':'晚'
};
let approved=false;
const c={
 window:null,Set,Date,
 scheduleTaipeiTodayKey:()=>now.value,
 p79TyphoonDates:()=>['2026-10-23'],
 P79SpecialOvertime:{electionDates:()=>['2026-10-25']},
 P79OfficialCalendar:{get:()=>null},
 p79ScheduleRestClient:()=>({status:()=>({evidence:{complete:status.complete,days:{}}})}),
 P79RestAttendance:{state:()=>status.state},
 p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:()=>approved?{type:'特休假'}:null,
 scheduleLeaveTypeText:()=> '特休假',
 p79ScheduleLeaveExportCode:value=>value==='特休假'?'年':String(value||''),
 monthlyScheduleData:{E:shifts},
 monthlyScheduleMeta:{E:{}},
 p79AutomaticRestMetadata:()=>c.monthlyScheduleMeta.E,
 p79CoverageShift:()=>'',
 p79LeaveCoverOnDay:()=>[],
 p79ScheduleNoPunchRest:(id,date,shift)=>!c.p79ScheduleConfirmedOvertime(id,date,shift)&&['早','中','晚'].includes(shift)&&status.complete&&status.state==='rest',
 p79ScheduleRestBalance:()=>({ledger:[]}),
 p79SubstituteShiftLabel:(id,date)=>c.monthlyScheduleMeta.E[date]?.overtimeReport?.code||(/^颱\\d/.test(shifts[date]||'')?shifts[date]:''),
};
c.window=c;vm.createContext(c);
vm.runInContext(body('p79ConfirmedOvertimeReport','    function p79VisibleRestKind('),c);
vm.runInContext(body('p79OvertimePeriodLabel','    function p79SubstituteShiftLabel('),c);
vm.runInContext(body('p79CompactOvertimeCode','    function p79SubstituteShiftLabel('),c);
vm.runInContext(body('p79ScheduleConfirmedOvertime','    // 與排班畫面'),c);
vm.runInContext(body('p79ScheduleSpecialNoPunchCode','    function p79ScheduleNoPunchRest('),c);
vm.runInContext(body('p79VisibleRestKind','    function p79VisibleRestDayAudit('),c);
vm.runInContext(body('p79ScheduleExportDay','    async function exportScheduleToExcel('),c);
const emp={id:'E',name:'測試'};
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-23'),'颱','without IN/OUT, typhoon day must export 颱');
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-22'),'休','ordinary no-punch completed shift remains rest');
status.state='missing';
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-23'),'晚','a single-sided punch cannot be converted to typhoon');
status.state='worked';
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-23'),'晚','actual attendance retains shift');
shifts['2026-10-23']='颱08-11';
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-23'),'颱08-11','recorded typhoon overtime code must survive export');
shifts['2026-10-23']='晚';status.state='rest';
approved=true;
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-23'),'年','approved leave keeps its code');
approved=false;status.complete=false;
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-23'),'晚','incomplete attendance evidence must not invent absence');
status.complete=true;status.state='rest';
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-25'),'休','future absence must not be labeled election');
now.value='2026-10-26';
assert.equal(c.p79ScheduleExportDay(emp,'2026-10-25'),'選','verified election-day absence must export 選');
assert(html.includes("const shownShift=typhoonScheduledRest?'颱':specialNoPunch||approvedLeaveCode||"),'web and export use one shared resolver');
assert(html.includes('return p79ScheduleDisplayDay(emp,dayStr,context).visibleCode;'));
assert(html.includes('const selected=p79ScheduleDisplayDay(emp,dayStr,displayContext);'));
assert(html.includes('await p79ScheduleRestClient().refreshIfStale(yearMonth)'),'export waits for missing attendance evidence when special days exist');
console.log('PASS: typhoon and election no-punch export, partial/full punches, approved leave, overtime code, evidence guard and web parity');

for(const state of ['rest','open','worked','missing']){
 status.state=state;
 for(const prefix of ['颱','選']){
  c.monthlyScheduleMeta.E['2026-10-23']={overtimeReport:{id:'SAVED-'+prefix,code:prefix+'24-08',category:'國'}};
  assert.equal(c.p79ScheduleExportDay(emp,'2026-10-23'),prefix+'24-08');
  assert.equal(c.p79ScheduleSpecialNoPunchCode('E','2026-10-23','晚',null),'');
 }
 c.monthlyScheduleMeta.E={};shifts['2026-10-23']='颱24-01';
 assert.equal(c.p79ScheduleExportDay(emp,'2026-10-23'),'颱24-01');
 shifts['2026-10-23']='晚';
}
console.log('PASS saved overnight reports override stale no-punch evidence across all attendance states');
