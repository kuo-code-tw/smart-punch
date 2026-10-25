const fs=require('fs'),vm=require('vm'),a=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const extract=n=>{
 const i=html.indexOf('    function '+n+'('),j=html.indexOf('\n    }',i);
 a(i>=0&&j>i,'missing '+n);return html.slice(i,j+6);
};
const month='2026-10',day=d=>month+'-'+String(d).padStart(2,'0');
const restDays=[1,2,7,8,13,15,19,21,27,28,30];
const classes={例:[2,13,19,27],休:[1,8,15,21,30],國:[7,28]};
const employees=Array.from({length:83},(_,i)=>({id:'E'+i,name:'測試員工'+i}));
const monthlyScheduleData={},monthlyScheduleMeta={};
for(const e of employees){
 monthlyScheduleData[e.id]=Object.fromEntries(Array.from({length:31},(_,i)=>[day(i+1),restDays.includes(i+1)?'休':'早']));
 monthlyScheduleMeta[e.id]=Object.fromEntries(Object.entries(classes).flatMap(([kind,days])=>days.map(n=>[day(n),{restCategory:kind,restAllocationSource:'auto-v1'}])));
}
const initial=JSON.stringify(monthlyScheduleMeta);
const c={window:null,Map,Set,Array,Number,Object,Date,Math,JSON,String,console,
 employees,monthlyScheduleData,monthlyScheduleMeta,p79RestQuota:()=>({days:31,counts:{例:4,休:5,國:2}}),
 p79AllocateRestMonth:(roster,meta)=>({meta,quota:{例:4,休:5,國:2},unresolved:[]}),
 p79EmploymentStartDate:()=>'',p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:(id,d)=>id==='E0'&&d===day(27)?{leaveType:'颱風假'}:null,
 p79LeaveCoverOnDay:()=>[],p79ScheduleRestBalance:()=>({ledger:[]}),
 p79ScheduleRestClient:()=>({status:()=>({evidence:{complete:false,days:{}}})}),
 p79TyphoonDates:()=>[],scheduleTaipeiTodayKey:()=>day(25),
 p79ScheduleNoPunchRest:()=>false,p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',p79ScheduleSpecialNoPunchCode:()=> '',
 p79ScheduleLeaveExportCode:x=>x==='颱風假'?'颱':'',scheduleLeaveTypeText:x=>x.leaveType||''};
c.window=c;c.P79RestAttendance={state:()=> 'unknown'};
c.P79SpecialOvertime={electionDates:()=>[]};
vm.createContext(c);
for(const n of ['p79VisibleRestKind','p79VisibleRestDayAudit','p79DailyRestCount','p79RestAutomaticExcludedDates','p79RestAutomaticPlan','p79RestQuotaAuditSnapshot'])vm.runInContext(extract(n),c);
let raw=c.p79DailyRestCount(employees[0],month,monthlyScheduleMeta.E0);
a.equal(raw.counts.例,4,'reproduce faulty four examples in metadata');
let visible=c.p79VisibleRestDayAudit(employees[0],month,monthlyScheduleMeta.E0);
a.equal(visible.例.length,3,'approved typhoon covers one of four assigned examples');
a.deepEqual([...visible.例].map(d=>d.slice(-2)),['02','13','19']);
const result=c.p79RestQuotaAuditSnapshot(month);
a.equal(result.totals.checked,83,'must audit all 83 staff not just selected role');
a.equal(result.totals.unresolved,1);
a.equal(result.totals.needsUpdate,1);
a.equal(result.totals.complete,82);
a(result.findings.some(line=>line.includes('測試員工0')&&line.includes('例3天(02、13、19)')&&line.includes('例少1天')),'audit must explain whose example was hidden, dates and shortage');
a.equal(JSON.stringify(monthlyScheduleMeta),initial,'audit must be read-only');
console.log('PASS all 83 people checked: hidden fourth 例 from approved typhoon is flagged 例3/1, exact dates, no underlying schedule mutation');
