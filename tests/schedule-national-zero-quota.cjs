'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(p,'utf8');
const asset=read('assets/port79-rest-allocation.js'),html=read('schedule/index.html');
const quota=Function(asset+';return {p79RestQuota,p79AllocateRestMonth,p79RestVisibleCategory};')();
const nov='2026-11',oct='2026-10',dec='2026-12',date=(month,n)=>month+'-'+String(n).padStart(2,'0');
assert.equal(quota.p79RestQuota(nov).counts.國,0,'2026 November contains no ordinary national holiday');
assert(quota.p79RestQuota(oct).counts.國>0,'October national quota must remain supported');
assert(quota.p79RestQuota(dec).counts.國>0,'December national quota must remain supported');
assert.equal(quota.p79RestVisibleCategory(nov,'國'),'休');
assert.equal(quota.p79RestVisibleCategory(oct,'國'),'國');
assert.equal(quota.p79RestVisibleCategory(nov,'例'),'例');

const no5=date(nov,5),no6=date(nov,6),restDays=new Set([1,7,8,14,15,21,22,28,29]);
const roster=Object.fromEntries(Array.from({length:30},(_,i)=>{
 const day=i+1;return [date(nov,day),restDays.has(day)?'休':'早'];
}));
roster[no5]='國';roster[no6]='休';
const meta={[no5]:{restCategory:'國',restSourceDate:'2026-10-25',
  restAllocationSource:'manual',manualRosterShift:'國'},
 [no6]:{restCategory:'國',restAllocationSource:'manual'}};
const before=JSON.stringify({roster,meta});
const allocated=quota.p79AllocateRestMonth(roster,meta,nov);
assert.equal(allocated.quota.國,0);
assert(Object.values(allocated.meta).every(x=>x?.restCategory!=='國'),
 'invalid manual/imported national metadata must not survive zero-national allocation');
assert.equal(JSON.stringify({roster,meta}),before,'allocator must not rewrite cloud-source input');
const repeat=quota.p79AllocateRestMonth(roster,allocated.meta,nov);
assert(Object.values(repeat.meta).every(x=>x?.restCategory!=='國'),'repeated allocation must not reintroduce 國');

function extract(name){
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 assert(start>=0&&end>start,'missing function '+name);return html.slice(start,end+6);
}
const s={console,p79RestQuota:quota.p79RestQuota,p79EmployeeDateEligible:()=>true,
 monthlyScheduleData:{E1:{...roster}},monthlyScheduleMeta:{E1:{...meta}},
 approvedLeaveForEmployee:()=>null,p79ScheduleHasVerifiedPunch:()=>false,
 p79LeaveCoverOnDay:()=>[],p79ConfirmedOvertimeReport:m=>!!m?.overtimeReport?.id,
 p79ScheduleNoPunchRest:()=>false,p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=> '',
 p79ScheduleSpecialNoPunchCode:()=>'',p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=> '',
 scheduleTaipeiTodayKey:()=> '2026-11-01',p79TyphoonDates:()=>[],
 p79DailyRestCount:()=>({dates:{例:[],休:['05'],國:[]}}),
 p79ScheduleRestBalance:()=>({quota:{例:5,休:4,國:0},remaining:{例:0,休:0,國:0},ledger:[]}),
 scheduleEscapeHtml:x=>String(x||''),p79ScheduleSpecialSummaryColumns:()=>({typhoon:false,election:false}),
 p79EmployeeDateEligible:()=>true,p79ScheduleHasOfficialData:()=>true,port79ScheduleDirty:false
};
s.window=s;s.P79RestAttendance={state:()=> 'unknown'};
s.P79ScheduleRestSummary={confirmedDates:(emp,month,cat)=>cat==='國'?[no5]:[]};
vm.createContext(s);
for(const name of ['p79VisibleRestKind','p79ScheduleDisplayDay','p79ScheduleRestCountCells'])
 vm.runInContext(extract(name),s);
const emp={id:'E1'},evidence={complete:true,actualShifts:{},actualWorkedMinutes:{}};
const ctx=()=>({automaticRestMeta:{[no5]:{restCategory:'國'},[no6]:{restCategory:'國'}},
 restBalance:{ledger:[]},attendanceEvidence:evidence,attendanceSnapshot:{attendanceEvidence:evidence},
 typhoonDays:new Set(),electionDays:new Set(),typhoonToday:'2026-11-01'});
let shown=s.p79ScheduleDisplayDay(emp,no5,ctx());
assert.equal(shown.shownShift,'休','saved bare 國 must display 休 in November');
assert.equal(shown.visibleRestKind,'休');
assert.equal(shown.oldNationalLabel,true,'preserve audit notice');
shown=s.p79ScheduleDisplayDay(emp,no6,ctx());
assert.equal(shown.shownShift,'休','stale restCategory 國 must not change 休 back to 國');
assert.equal(shown.dayMeta.restCategory,'休');
assert.equal(s.monthlyScheduleMeta.E1[no6].restCategory,'國','official metadata must remain untouched');
assert.equal(s.p79VisibleRestKind('國','',nov),'休');
assert.equal(s.p79VisibleRestKind('早','國08-16',nov),'','historic national overtime must require audit, not count as leave');
assert.equal(s.p79VisibleRestKind('國','',oct),'國');
assert.equal(s.p79VisibleRestKind('國','',dec),'國');
// A real matched punch must still override a mistaken old holiday tag.
s.p79ScheduleHasVerifiedPunch=()=>true;evidence.actualShifts['E1|'+no5]='早';
assert.equal(s.p79ScheduleDisplayDay(emp,no5,ctx()).shownShift,'早');
s.p79ScheduleHasVerifiedPunch=()=>false;delete evidence.actualShifts['E1|'+no5];
const counter=s.p79ScheduleRestCountCells(emp,nov,{},[],[],{例:[],休:[no5],國:[no5]},
 {typhoon:false,election:false});
const span=kind=>counter.match(new RegExp('data-rest-category="'+kind+'"[^>]*><span>([^<]+)</span>'))?.[1];
assert.equal(span('國'),'0/0','a saved/formally reported 國 cannot create November national days');
assert.match(counter,/歷史國假標記/,'flag preserved formal anomaly for manual audit');
assert.equal(span('休'),'1/3','valid rest day stays in the rest category');
assert(html.includes("if(val==='國'&&p79RestQuota(dayStr.slice(0,7)).counts.國===0)"),
 'manual editor must reject national leave with no monthly quota');
assert(html.includes("p79RestQuota(yearMonth).counts.國>0"),'November dropdown must not offer 國');
for(let i=0;i<83;i++){
 const id='STAFF'+String(i).padStart(3,'0');
 s.monthlyScheduleData[id]={...roster};
 s.monthlyScheduleMeta[id]=JSON.parse(JSON.stringify(meta));
 const original=JSON.stringify({roster:s.monthlyScheduleData[id],meta:s.monthlyScheduleMeta[id]});
 assert.equal(s.p79ScheduleDisplayDay({id},no5,ctx()).visibleRestKind,'休',
   'employee '+id+' must not show a nonexistent November national holiday');
 assert.equal(JSON.stringify({roster:s.monthlyScheduleData[id],meta:s.monthlyScheduleMeta[id]}),
   original,'employee '+id+' must retain exact raw cloud-source data');
}
console.log('PASS: November national=0, legacy allocation/display/counts, 83 staff, October/December and punch protections, no cloud rewrite');
