// Reproduce the reported 2026-10 例4 / 休6 / 國1 mismatch:
// ten raw 休 days plus a cloud-checked, no-punch work shift shown as 休.
// All categories must share the same allocator and the same overtime ledger.
const fs=require('node:fs'),vm=require('node:vm'),a=require('node:assert/strict');
const month='2026-10',date=n=>month+'-'+String(n).padStart(2,'0');
const dates=Array.from({length:31},(_,i)=>date(i+1));
const plannedRest=[1,4,7,10,13,16,19,22,25,28],extraOff=date(24);
const people=Array.from({length:83},(_,i)=>({
 id:'E'+i,empId:'E'+i,name:i===0?'郭昇龍':'測試人員'+i,
 role:['F/L','AQC','ARMG','領班','指揮手'][i%5],
 group:['A組','B組','C組'][i%3]
}));
const monthlyScheduleData={},monthlyScheduleMeta={};
const evidence={complete:true,month,days:{},actualShifts:{}};
for(const emp of people){
 monthlyScheduleData[emp.id]=Object.fromEntries(dates.map((d,i)=>[d,plannedRest.includes(i+1)?'休':'早']));
 monthlyScheduleMeta[emp.id]={};
 for(const d of dates)evidence.days[emp.id+'|'+d]={
  state:plannedRest.includes(Number(d.slice(-2)))||d===extraOff?'rest':'worked'
 };
}
const c={window:null,Date,Intl,Set,Map,Array,Math,Object,String,Number,JSON,console,
 employees:people,monthlyScheduleData,monthlyScheduleMeta,
 p79TyphoonDates:()=>[],p79EmploymentStartDate:()=>'',p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],
 p79MonthlyRestContext:{employmentStart:()=>''},
 p79ScheduleRestClient:()=>({status:()=>({evidence})}),
 p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',p79ScheduleSpecialNoPunchCode:()=> '',
 p79ScheduleLeaveExportCode:x=>x,scheduleLeaveTypeText:x=>x,
 scheduleTaipeiTodayKey:()=>date(31),scheduleEscapeHtml:x=>String(x||'')
};
c.window=c;c.P79SpecialOvertime={electionDates:()=>[]};
vm.createContext(c);
for(const file of ['port79-rest-allocation.js','port79-rest-attendance.js','port79-monthly-rest-overtime.js'])
 vm.runInContext(fs.readFileSync('assets/'+file,'utf8'),c);
const html=fs.readFileSync('schedule/index.html','utf8');
const extract=name=>{
 const i=html.indexOf('    function '+name+'('),j=html.indexOf('\n    }',i);
 a(i>=0&&j>i,'missing real '+name);return html.slice(i,j+6);
};
for(const name of ['p79ScheduleHasVerifiedPunch','p79RestAutomaticExcludedDates','p79RestAutomaticPlan',
 'p79AutomaticRestMetadata','p79VisibleRestKind','p79ScheduleDisplayContext',
 'p79ScheduleDisplayDay','p79VisibleRestDayAudit','p79DailyRestCount',
 'p79ScheduleRestCountCells','p79ScheduleExportDay'])
 vm.runInContext(extract(name),c);
c.p79ScheduleNoPunchRest=(id,d,shift,meta,leave,state)=>
 ['早','中','晚'].includes(shift)&&state==='rest'&&!leave&&!meta?.manualRosterShift;
const snapshot={attendanceEvidence:evidence,leaveDates:[],leaveCoverAssignments:[]};
c.p79ScheduleRestBalance=(emp,mo,meta)=>
 c.P79MonthlyRest.balance({...emp,empId:emp.id},
 {...monthlyScheduleData[emp.id],__meta:meta},mo,snapshot,'');
const json=x=>JSON.parse(JSON.stringify(x));
const categories=['例','休','國'],expected={例:4,休:5,國:2};
const count=meta=>Object.fromEntries(categories.map(cat=>
 [cat,dates.filter(d=>meta[d]?.restCategory===cat&&!meta[d]?.restQuotaOvertime).length]));
const original=JSON.stringify({monthlyScheduleData,monthlyScheduleMeta});
for(const emp of people){
 const plan=c.p79RestAutomaticPlan(emp,month);
 a.deepEqual(count(plan.meta),expected,emp.id+' 11 real rest days must cover the 2nd 國 quota');
 a.equal(plan.unresolved.length,0,emp.id+' no fictitious overtime needed');
 const balance=c.p79ScheduleRestBalance(emp,month,plan.meta);
 a.deepEqual(json(balance.off),expected,emp.id+' shared overtime ledger must agree');
 a.deepEqual(json(balance.remaining),{國:0,休:0,例:0},emp.id+' no 1-day national overtime shortage');
 a.equal(Object.values(balance.reported).reduce((sum,n)=>sum+n,0),0,'never create approved overtime');
 const context=c.p79ScheduleDisplayContext(emp,month,plan.meta);
 const selected=c.p79VisibleRestDayAudit(emp,month,plan.meta);
 a.deepEqual(Object.fromEntries(categories.map(k=>[k,selected[k].length])),expected,
  emp.id+' date grid must not show 休6 / 國1');
 a(['例','休','國'].includes(c.p79ScheduleExportDay(emp,extraOff,context)),'no-card rest appears on export');
 const exported=Object.fromEntries(categories.map(cat=>[cat,dates.filter(d=>c.p79ScheduleExportDay(emp,d,context)===cat).length]));
 a.deepEqual(exported,expected,'every exported date matches the same category totals');
 const row=c.p79ScheduleRestCountCells(emp,month,plan.meta,[],[],selected);
 a.match(row,/<span>4\/0<\/span>/);
 a.match(row,/<span>5\/0<\/span>/);
 a.match(row,/<span>2\/0<\/span>/);
 a.doesNotMatch(row,/休超額/,'false over-rest badge must disappear only after real allocation');
 const repeat=c.p79RestAutomaticPlan(emp,month,plan.meta);
 a.deepEqual(repeat.meta,plan.meta,'refresh must be idempotent');
}
a.equal(JSON.stringify({monthlyScheduleData,monthlyScheduleMeta}),original,
 'read-only reconciliation never changes official roster, report or payroll records');
// Imported explicit 國/例 cells without metadata must reserve their visible
// category, rather than leaving the allocator/ledger to count only raw 休.
for(const category of ['國','例']){
 monthlyScheduleData.E0[extraOff]=category;
 const fixed=c.p79RestAutomaticPlan(people[0],month);
 a.deepEqual(count(fixed.meta),expected,'explicit '+category+' and flexible 休 share quota');
 a.deepEqual(json(c.p79ScheduleRestBalance(people[0],month,fixed.meta).off),expected);
 a.deepEqual(json(fixed.meta),json(c.p79RestAutomaticPlan(people[0],month,fixed.meta).meta));
}
monthlyScheduleData.E0[extraOff]='早';
// A verified punch must reverse the inferred no-punch off day.
evidence.days['E0|'+extraOff].state='worked';
let recheck=c.p79RestAutomaticPlan(people[0],month);
a.deepEqual(count(recheck.meta),{例:4,休:5,國:1},'new attendance retracts a former day off');
a.equal(recheck.unresolved.filter(x=>x.category==='國').length,1);
evidence.days['E0|'+extraOff].state='rest';
// Manual shift locks, formal reports, and insufficient cloud evidence never become inferred rest.
monthlyScheduleMeta.E0[extraOff]={manualRosterShift:'早'};
recheck=c.p79RestAutomaticPlan(people[0],month);
a.deepEqual(count(recheck.meta),{例:4,休:5,國:1},'manual work shift not rewritten');
a.deepEqual(json(c.p79ScheduleRestBalance(people[0],month,recheck.meta).off),{例:4,休:5,國:1},'manual work day must not reenter the monthly ledger as an extra rest');
monthlyScheduleMeta.E0[extraOff]={overtimeReport:{id:'CLOUD-REPORT',category:'休',code:'休08-16'}};
recheck=c.p79RestAutomaticPlan(people[0],month);
a.deepEqual(count(recheck.meta),{例:4,休:4,國:2},'confirmed 休 report reserves its own day; other ten rest days fill the remaining quota once');
a.equal(recheck.meta[extraOff].overtimeReport.id,'CLOUD-REPORT');
monthlyScheduleMeta.E0={};
evidence.complete=false;
recheck=c.p79RestAutomaticPlan(people[0],month);
a.deepEqual(count(recheck.meta),{例:4,休:5,國:1},'incomplete evidence cannot invent a rest day');
console.log('PASS 83 people: 例4休6國1 -> 例4休5國2, ledger/export/UI agree; report, lock, evidence guards');
