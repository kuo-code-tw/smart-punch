const fs=require('fs'),vm=require('vm'),a=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const extract=n=>{const i=html.indexOf('    function '+n+'('),j=html.indexOf('\n    }',i);a(i>=0&&j>i,'missing '+n);return html.slice(i,j+6)};
const month='2026-10',day=n=>month+'-'+String(n).padStart(2,'0');
const restDays=[1,4,7,10,13,16,19,22,23,25,28],typhoon=day(23);
const people=Array.from({length:83},(_,i)=>({id:'E'+i,name:'員工'+i,role:i%2?'AQC':'ARMG',group:i%4?'C組':'D組'}));
const monthlyScheduleData={},monthlyScheduleMeta={},messages=[];
let writes=0,renders=0,mutations=0;
const c={window:null,Date,Map,Set,Array,Math,JSON,String,Number,Object,console,
 employees:people,monthlyScheduleData,monthlyScheduleMeta,
 document:{getElementById:()=>({value:month})},activeRoleTab:'AQC',activeGroupFilter:'D組',
 approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],
 p79TyphoonDates:()=>[typhoon],p79EmploymentStartDate:()=>'',p79EmployeeDateEligible:()=>true,
 requireScheduleEditLock:()=>true,queueScheduleCloudSave:()=>{writes++},
 p79MarkScheduleLocalMutation:()=>{mutations++},buildRoleTabsAndRender:()=>{renders++},
 alert:x=>messages.push(x)};
c.window=c;c.P79SpecialOvertime={electionDates:()=>[]};
vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/port79-rest-allocation.js','utf8'),c);
for(const n of ['p79RestAutomaticExcludedDates','p79RestAutomaticPlan',
 'p79AutomaticRestMetadata','p79AutoAllocateRest'])vm.runInContext(extract(n),c);
c.p79VisibleRestDayAudit=(emp,m,meta)=>{
 const dates={例:[],休:[],國:[]};
 for(let n=1;n<=31;n++){const d=day(n),v=monthlyScheduleData[emp.id][d],cat=v==='休'?(meta[d]?.restCategory||'休'):v;
  if(d!==typhoon&&dates[cat]&&meta[d]?.restCategory)dates[cat].push(d);
 }
 return dates;
};
for(const emp of people){
 monthlyScheduleData[emp.id]=Object.fromEntries(Array.from({length:31},(_,i)=>[day(i+1),restDays.includes(i+1)?'休':'早']));
 // Reproduce four existing 例 allocations with a previous typhoon-day label that can now be rebalanced.
 const old=c.p79AllocateRestMonth(monthlyScheduleData[emp.id],{},month);
 let item=Object.entries(old.meta).find(([date,x])=>x.restCategory==='例'&&date!==typhoon);
 old.meta[typhoon]={...old.meta[typhoon],restCategory:'例',restAllocationSource:'auto-v1',restSourceDate:item[1].restSourceDate,restQuotaOvertime:false};
 // hide the previously allocated fourth 例 to leave exactly three visible
 old.meta[item[0]]={...old.meta[item[0]],restCategory:'休',restAllocationSource:'auto-v1'};
 monthlyScheduleMeta[emp.id]=old.meta;
}
const before=JSON.stringify(monthlyScheduleData),reports=JSON.stringify(monthlyScheduleMeta);
let plan=c.p79RestAutomaticPlan(people[0],month);
const counts=kind=>Object.entries(plan.meta).filter(([date,m])=>date.startsWith(month)&&m?.restCategory===kind&&!m.restQuotaOvertime).length;
a.equal(counts('例'),4,'例 first: 4 visible allocations must not be on typhoon day');
a.equal(counts('休'),5,'next 休=5');
a.equal(counts('國'),2,'typhoon day originally 休 retains 例/休 allocation, freeing ordinary 休 to complete 國');
a(['例','休'].includes(plan.meta[typhoon]?.restCategory),'the typhoon rest remains an assigned 例/休, never 國');
a.equal(JSON.stringify(monthlyScheduleData),before,'do not rewrite underlying original 休 while reallocating its visible category');
c.p79AutoAllocateRest();
a.equal(writes,1,'single queued official cloud save for all 83');
a.equal(renders,1);
a.equal(mutations,1);
a.equal(c.p79VisibleRestDayAudit(people[0],month,monthlyScheduleMeta[people[0].id]).例.length,4);
a(messages.at(-1).includes('例 → 休 → 國')&&messages.at(-1).includes('實際調整 83 人'));
const updated=JSON.stringify(monthlyScheduleMeta);
c.p79AutoAllocateRest();
a.equal(writes,1,'second click with unchanged correct data never resaves');
a.equal(JSON.stringify(monthlyScheduleMeta),updated,'repeating priority is idempotent');
a.notEqual(updated,reports);
a.equal(JSON.stringify(monthlyScheduleData),before);
a(html.includes('p79RestAutomaticExcludedDates(emp,month)'));
a(html.includes('p79RestAutomaticPlan(emp,month)'));
a(html.includes('const visible=p79VisibleRestDayAudit(emp,month,result.meta)'));
console.log('PASS 83-person typhoon rest retains 例/休, 國 is fully refilled from 休, cloud save once, no raw shift/report rewrite, rerun idempotent');
