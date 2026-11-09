const fs=require('fs'),vm=require('vm'),a=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const extract=n=>{
 const x=html.indexOf('    function '+n+'('),y=html.indexOf('\n    }',x);
 a(x>=0&&y>x,'missing '+n);return html.slice(x,y+6);
};
const month='2026-10',day=n=>month+'-'+String(n).padStart(2,'0'),typhoon=day(23);
const days=Array.from({length:31},(_,i)=>day(i+1)),restDays=[1,4,7,10,13,16,19,22,23,25,28];
const employees=Array.from({length:83},(_,i)=>({id:'E'+i,name:'員工'+i,role:i%2?'AQC':'ARMG',group:'A組'}));
const monthlyScheduleData={},monthlyScheduleMeta={};
const c={window:null,Date,Set,Map,Array,Math,Object,String,Number,JSON,
 employees,monthlyScheduleData,monthlyScheduleMeta,
 p79TyphoonDates:()=>[typhoon],p79EmploymentStartDate:()=>'',p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[]};
c.window=c;c.P79SpecialOvertime={electionDates:()=>[]};
c.p79ScheduleRestClient=()=>({status:()=>({evidence:{complete:false,days:{}}})});
vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/port79-rest-allocation.js','utf8'),c);
for(const name of ['p79ScheduleHasVerifiedPunch','p79RestAutomaticExcludedDates','p79RestAutomaticPlan'])vm.runInContext(extract(name),c);
for(let i=0;i<employees.length;i++){
 const id=employees[i].id;
 const roster=Object.fromEntries(days.map((d,j)=>[d,restDays.includes(j+1)?'休':'早']));
 const old=Object.fromEntries(restDays.map(n=>[day(n),{restCategory:'休',restAllocationSource:'manual'}]));
 if(i%6===0)old[typhoon]={restCategory:'國',restAllocationSource:'manual'};
 if(i%6===1)old[day(1)]={restCategory:'例',restAllocationSource:'manual'};
 monthlyScheduleData[id]=roster;monthlyScheduleMeta[id]=old;
}
const saved=JSON.stringify(monthlyScheduleData),order=['例','休','國'];
const counts=m=>Object.fromEntries(order.map(cat=>[cat,days.filter(d=>d!==typhoon&&m[d]?.restCategory===cat&&!m[d]?.restQuotaOvertime).length]));
for(const emp of employees){
 const plan=c.p79RestAutomaticPlan(emp,month);
 const actual=counts(plan.meta);
 a.deepEqual(actual,{例:4,休:5,國:1},emp.id+' 10 ordinary off days can fill 4例5休1國; typhoon is not a quota');
 a(!plan.meta[typhoon]?.restCategory,emp.id+' typhoon must never retain a 例休國 restCategory');
 a.equal(plan.unresolved.length,1,emp.id+' 國少 1 天，不可用颱補足');
 const repeated=c.p79RestAutomaticPlan(emp,month,plan.meta);
 a.deepEqual(repeated.meta,plan.meta,emp.id+' clicking twice must not reshuffle dates');
}
a.equal(JSON.stringify(monthlyScheduleData),saved,'allocator may reclassify rest quota but never overwrite formal shift cells');
const emp=employees[2],base=monthlyScheduleData[emp.id],prior=monthlyScheduleMeta[emp.id];
base[day(28)]='早';let shortage=c.p79RestAutomaticPlan(emp,month);
a.deepEqual(counts(shortage.meta),{例:4,休:5,國:0},'9 valid rest days after excluding 颱 and work, 國 must remain unfilled');
a.equal(shortage.unresolved.length,2);
a.equal(shortage.unresolved[0].category,'國','shortage must be specifically 國, not fabricated on a work day');
base[day(28)]='休';
prior[day(7)]={overtimeReport:{id:'SAVED',code:'國08-16',category:'國'}};
shortage=c.p79RestAutomaticPlan(emp,month);
a.equal(shortage.unresolved.length,1,'formal 國 report consumes exactly one quota and its rest day remains protected');
a.equal(Object.values(shortage.meta).filter(x=>x.restCategory==='國'&&!x.restQuotaOvertime).length,0,'the same 國 quota is not allocated twice');
a.equal(shortage.meta[day(7)].overtimeReport.id,'SAVED','never delete confirmed overtime');
delete prior[day(7)];
const locked=day(22);prior[locked]={restAllocationLocked:true};
shortage=c.p79RestAutomaticPlan(emp,month);
a.equal(shortage.unresolved.length,2,'explicit locked rest day cannot be overwritten');
a(!shortage.meta[locked].restCategory,'locked untouched');
delete prior[locked];
// Exercise real screen and export resolver with a typhoon-day originally marked 休.
c.P79RestAttendance={state:(snapshot,id,date)=>base[date]==='休'?'rest':'worked'};
c.p79ScheduleRestClient=()=>({status:()=>({evidence:{complete:true,days:{}}})});
c.p79ScheduleRestBalance=()=>({ledger:[]});
c.p79CoverageShift=()=>'';c.p79SubstituteShiftLabel=()=>'';c.p79ScheduleNoPunchRest=()=>false;
c.p79ScheduleLeaveExportCode=x=>x;c.scheduleLeaveTypeText=x=>x;c.scheduleTaipeiTodayKey=()=>day(31);
c.p79ScheduleSpecialNoPunchCode=(id,date,shift)=>date===typhoon?'颱':'';
for(const name of ['p79VisibleRestKind','p79ScheduleDisplayContext','p79ScheduleDisplayDay','p79ScheduleExportDay'])
 vm.runInContext(extract(name),c);
const planned=c.p79RestAutomaticPlan(emp,month),context=c.p79ScheduleDisplayContext(emp,month,planned.meta);
const selected=c.p79ScheduleDisplayDay(emp,typhoon,context);
a.equal(selected.visibleCode,'颱','原本排休的颱風日只顯示颱，不能是例／休／國');
a.equal(selected.specialNoPunch,'颱','颱風停班時顯示颱');
a.equal(c.p79ScheduleExportDay(emp,typhoon,context),selected.visibleCode,'Excel and screen must agree on same typhoon rest day');
const verified=order.reduce((o,k)=>(o[k]=0,o),{});
for(const d of days){const v=c.p79ScheduleDisplayDay(emp,d,context);if(verified[v.visibleRestKind]!==undefined)verified[v.visibleRestKind]++;}
a.deepEqual(verified,{例:4,休:5,國:1},'颱風日不計例／休／國，畫面數量要真實');
// The separate monthly unworked-rest overtime calculator must use the same rule.
c.P79RestAttendance.state=(snapshot,id,date)=>base[date]==='休'?'rest':'worked';
c.P79RestAttendance.isLeaveDay=()=>false;
c.p79MonthlyRestContext={employmentStart:()=>''};
vm.runInContext(fs.readFileSync('assets/port79-monthly-rest-overtime.js','utf8'),c);
const balance=c.P79MonthlyRest.balance({...emp,empId:emp.id},
 {...base,__meta:planned.meta},month,{leaveDates:[],leaveCoverAssignments:[]},'');
a.equal(balance.off.例,4);
a.equal(balance.off.休,5);
a.equal(balance.off.國,1,'颱風日不得被未休假加班計算器補成國');
a.equal(balance.remaining.國,1);
a.equal(balance.ledger.find(x=>x.date===typhoon)?.kind,'typhoon');
console.log('PASS 83 employees: 颱 fixed; ordinary rests 4/5/1, overtime calculator excludes 颱, screen=Excel, idempotent');
