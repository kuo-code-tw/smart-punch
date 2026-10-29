const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const a=html.indexOf('    function p79PreserveLinkedScheduleDays('),b=html.indexOf('    function p79PreserveHiddenScheduleRows(',a);assert(a>=0&&b>a);
const c={};vm.createContext(c);vm.runInContext(html.slice(a,b),c);
const preserve=c.p79PreserveLinkedScheduleDays,month='2026-10',day=month+'-09',copy=x=>JSON.parse(JSON.stringify(x));
const official=[{empId:'AN1150001',name:'指揮手',month,schedule:{[day]:'早',__meta:{[day]:{forEmpId:'LEAVE-OWNER',overtimeReport:{id:'FORMAL',leaveId:'LEAVE1'},overtimeAmendments:[{eventId:'HISTORY'}]}}}},
 {empId:'ARMG1',name:'ARMG',month,schedule:{[day]:'中'}}];
const incoming=copy(official);incoming[0].schedule[day]='年';incoming[0].schedule.__meta[day]={restCategory:'例'};incoming[1].schedule[day]='晚';
// Same rejection condition as the deployed p79AssertLeaveScheduleIntact_:
// protected days compare original shift and leave-linked report, across all roles.
const guard=(rows)=>{
 const before=new Map(official.map(r=>[r.empId,r.schedule]));
 const after=new Map(rows.map(r=>[r.empId,r.schedule]));
 const id='AN1150001',old=before.get(id),next=after.get(id),om=old.__meta?.[day]||{},nm=next?.__meta?.[day]||{},linked=om.forEmpId||om.overtimeReport?.leaveId;
 const changedLink=linked&&(String(om.forEmpId||'')!==String(nm.forEmpId||'')||JSON.stringify(om.overtimeReport||null)!==JSON.stringify(nm.overtimeReport||null));
 if(!next||changedLink||String(next[day]||'')!==String(old[day]||''))throw Error(id+' '+day+' 仍連結請假／代班');
};
assert.throws(()=>guard(incoming),/AN1150001 2026-10-09/,'reproduce unrelated dispatcher blocking ARMG save');
const before=JSON.stringify(official),candidate=JSON.stringify(incoming);
let saved=preserve(incoming,official,month,()=>false);guard(saved);
assert.deepEqual(copy(saved[0]),official[0],'original linked date, report ID and history survive unchanged');
assert.equal(saved[1].schedule[day],'晚','intended ARMG edit remains');
assert.equal(JSON.stringify(official),before);assert.equal(JSON.stringify(incoming),candidate);
saved[0].schedule.__meta[day].overtimeReport.id='LOCAL';assert.equal(official[0].schedule.__meta[day].overtimeReport.id,'FORMAL');
// Approved leave / cover can be protected even without legacy link metadata.
for(const oldMeta of [undefined,null,{note:'original'}]){
 const row={empId:'P',month,schedule:{[day]:'中',...(oldMeta===undefined?{}:{__meta:{[day]:oldMeta}})}};
 const edit={empId:'P',month,schedule:{[day]:'年',__meta:{[day]:{restCategory:'例'},[month+'-10']:{note:'keep'}}}};
 const result=preserve([edit],[row],month,(id,date)=>id==='P'&&date===day)[0];
 assert.equal(result.schedule[day],'中');assert.deepEqual(copy(result.schedule.__meta?.[day]??null),oldMeta??null);
 assert.equal(result.schedule.__meta[month+'-10'].note,'keep');
}
const missing={empId:'P',month,schedule:{__meta:{[day]:{forEmpId:'LINK'}}}};
assert(!Object.hasOwn(preserve([{empId:'P',month,schedule:{[day]:'早'}}],[missing],month,()=>false)[0].schedule,day),'missing original date is not invented');
assert.equal(preserve(incoming,official,'2026-11',()=>true)[0].schedule[day],'年','another month cannot supply the baseline');
assert.equal(preserve([incoming[1]],official,month,()=>false)[0].schedule[day],'晚','ordinary shift edits remain editable');
assert(html.includes('p79PreserveLinkedScheduleDays(schedules,p79ScheduleCloudRows,yearMonth'));
assert(html.includes("if(approvedLeaveForEmployee(empId,dayStr)||p79LeaveCoverOnDay(empId,dayStr).length)"),'direct linked-date editing still guarded');
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
console.log('PASS dispatcher 10/09 rejection reproduced; unchanged linked snapshot passes guard while ARMG edit survives; approved leave/cover/null metadata/month isolation and manual protection');
