'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('schedule/index.html','utf8');
const rest=fs.readFileSync('assets/port79-rest-attendance.js','utf8');
const ledger=fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8');
function extract(name){
 const markers={
  p79CompactOvertimeCode:'    function p79OvertimePeriodLabel(',
  p79ConfirmedOvertimeReport:'    function p79ConfirmedRestOvertime(',
  p79ScheduleHasVerifiedPunch:'    // 20:00–24:00',
  p79ScheduleNoPunchRest:'    // Rest totals',
  p79VisibleRestKind:'    // Single source of truth',
  p79ScheduleDisplayDay:'    // On-demand full staff check',
  p79ScheduleOvertimeExportRows_:'    async function exportScheduleToExcel()'
 };
 const start=html.indexOf('    function '+name+'('),end=html.indexOf(markers[name],start);
 assert(start>=0&&end>start,name+' extract boundary');
 return html.slice(start,end);
}

const day='2026-11-05',month='2026-11',id='E1';
const report={id:'OT-05',category:'休',code:'休24-08',status:'已核對出勤',convertedHours:8,declaredHours:8};
const meta={restCategory:'休',overtime:true,overtimeReport:report};
const fullRoster=Object.fromEntries(Array.from({length:30},(_,i)=>[month+'-'+String(i+1).padStart(2,'0'),'早']));
fullRoster[day]='晚';fullRoster.__meta={[day]:meta};
let proof=true,absenceState='rest',ownLeave=null;
function evidence(){
 return {complete:true,absenceAuditReady:proof,absenceConfirmedDays:{[id+'|'+day]:proof},
  days:{[id+'|'+day]:{state:absenceState}},actualShifts:{[id+'|'+day]:absenceState==='worked'?'晚':''},
  actualWorkedMinutes:{[id+'|'+day]:absenceState==='worked'?480:0}};
}
const c={Date,Set,Map,Intl,console,monthlyScheduleData:{[id]:fullRoster},monthlyScheduleMeta:{[id]:{[day]:meta}},
 p79EmployeeDateEligible:()=>true,approvedLeaveForEmployee:()=>ownLeave,
 p79LeaveCoverOnDay:()=>[],p79CoverageShift:()=> '休24-08',
 p79SubstituteShiftLabel:()=> '休24-08',p79ScheduleSpecialNoPunchCode:()=> '',
 p79ScheduleLeaveExportCode:()=> '年',scheduleLeaveTypeText:()=> '特休假',
 p79ScheduleRestClient:()=>({status:()=>({evidence:evidence()})}),
 scheduleTaipeiTodayKey:()=> '2026-11-06',
 p79RestQuota:()=>({days:30,slots:[{category:'休',sourceDate:day}]}),
 p79MonthlyRestContext:{employmentStart:()=>''},
 p79AllocateRestMonth:()=>({meta:{}})};
c.window=c;vm.createContext(c);vm.runInContext(rest,c);vm.runInContext(ledger,c);
for(const name of ['p79CompactOvertimeCode','p79ConfirmedOvertimeReport','p79ScheduleHasVerifiedPunch',
 'p79ScheduleNoPunchRest','p79VisibleRestKind','p79ScheduleDisplayDay','p79ScheduleOvertimeExportRows_'])
 vm.runInContext(extract(name),c);
function context(){
 const e=evidence();return {automaticRestMeta:{},restBalance:{ledger:[]},attendanceEvidence:e,
  attendanceSnapshot:{attendanceEvidence:e},typhoonDays:new Set(),electionDays:new Set(),typhoonToday:'2026-11-06'};
}
let result=c.p79ScheduleDisplayDay({id,name:'陳韋陞'},day,context());
assert.equal(result.visibleCode,'休','verified no-work 休24-08 must show 休');
assert.equal(result.visibleRestKind,'休','rest day counted in visible category');
assert.equal(result.unworkedOvertime,true);
assert.equal(result.visibleSubstituteLabel,'');
assert.equal(result.dayMeta.overtimeReport,undefined,'historical report excluded from selected day view only');
assert.equal(meta.overtimeReport.id,'OT-05','original report must not be silently deleted');
let exported=c.p79ScheduleOvertimeExportRows_([{id,name:'陳韋陞',role:'ARMG'}],month);
assert.equal(exported.detail[0]['申報狀態'],'未出勤（待正式取消）');
assert.equal(exported.detail[0]['納入核對小計'],'否');
assert.equal(exported.detail[0]['核對小計時數'],0);
assert.equal(exported.totals[0]['已核對換算時數'],0);
let balance=c.P79MonthlyRest.balance({empId:id,name:'陳韋陞'},fullRoster,month,{attendanceEvidence:evidence()});
assert.equal(balance.reported.休,0,'proved absent report does not count as overtime');
assert.equal(balance.reserved.休,0,'proved absent report does not reserve overtime');
assert.equal(balance.off.休,1,'verified absent overtime becomes day off');
assert(balance.ledger.some(x=>x.date===day&&x.kind==='off'&&x.reportId==='OT-05'));

proof=false;result=c.p79ScheduleDisplayDay({id},day,context());
assert.equal(result.unworkedOvertime,false,'incomplete absence audit cannot cancel declaration');
assert.equal(result.visibleCode,'休24-08','unverified absence keeps filed overtime label');
exported=c.p79ScheduleOvertimeExportRows_([{id,role:'ARMG'}],month);
assert.equal(exported.detail[0]['納入核對小計'],'是','no verified absence proof means existing formally checked report retained');
balance=c.P79MonthlyRest.balance({empId:id,name:'陳韋陞'},fullRoster,month,{attendanceEvidence:evidence()});
assert.equal(balance.reserved.休,1,'absence unverified remains pending, not automatically rest');

proof=true;absenceState='missing';result=c.p79ScheduleDisplayDay({id},day,context());
assert.equal(result.unworkedOvertime,false,'single-sided punch cannot be rest');
assert.notEqual(result.visibleCode,'休','a single punch never means no work');
absenceState='worked';result=c.p79ScheduleDisplayDay({id},day,context());
assert.equal(result.unworkedOvertime,false,'verified night work is protected');
assert.equal(result.visibleCode,'休24-08','actual worked overtime retains its report');
absenceState='rest';ownLeave={leaveType:'特休假'};
result=c.p79ScheduleDisplayDay({id},day,context());
assert.equal(result.visibleCode,'年','own approved legal leave remains a leave, not forcibly rewritten to 休');
balance=c.P79MonthlyRest.balance({empId:id,name:'陳韋陞'},fullRoster,month,{attendanceEvidence:evidence(),approvedLeaves:[{empId:id,start:day,end:day}]});
assert.equal(balance.reported.休,0,'approved leave without work must not also count overtime');
ownLeave=null;
for(const kind of ['休','例','國']){
 fullRoster[day]=kind;
 result=c.p79ScheduleDisplayDay({id},day,context());
 const expected=kind==='國'?'休':kind;
 assert.equal(result.visibleCode,expected,
   kind==='國'?'November has no statutory national quota: stale bare 國 is displayed as 休':
   'valid original '+kind+' is preserved when no work');
}
fullRoster[day]='晚';
assert(!html.includes("postCloud({action:'deleteOvertime"),'displaying absence never posts a delete to cloud');
for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(!/\bsrc=|application\/json|importmap/.test(script[1])&&script[2].trim())new vm.Script(script[2]);
}
console.log('PASS verified absent night overtime: shows/rest counts, no-work export hours zero, incomplete/single-punch protected, legal leave/status and raw report preserved');
