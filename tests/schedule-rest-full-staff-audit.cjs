const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
function extract(name){
 const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
 assert(start>=0&&end>start,'missing '+name);
 return html.slice(start,end+6);
}
const month='2026-10',days=Array.from({length:31},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
const employees=Array.from({length:83},(_,i)=>({id:'EMP'+i,name:'測試員工'+i,role:i%2?'ARMG':'AQC',group:i%4?'B組':'C組'}));
const monthlyScheduleData={},monthlyScheduleMeta={},alerts=[];
let saves=0,renders=0,mutations=0;
const c={window:null,Date,Map,Set,Math,JSON,String,Number,Array,Object,console,
 employees,monthlyScheduleData,monthlyScheduleMeta,
 activeRoleTab:'ARMG',activeGroupFilter:'C組',
 approvedLeaveForEmployee:()=>false,p79LeaveCoverOnDay:()=>[],
 p79EmploymentStartDate:()=>'',requireScheduleEditLock:()=>true,
 document:{getElementById:()=>({value:month})},
 queueScheduleCloudSave:()=>saves++,buildRoleTabsAndRender:()=>renders++,
 p79MarkScheduleLocalMutation:()=>mutations++,
 alert:message=>alerts.push(message)};
c.window=c;
vm.createContext(c);
vm.runInContext(fs.readFileSync('assets/port79-rest-allocation.js','utf8'),c);
for(const n of ['p79DailyRestCount','p79RestQuotaAuditSnapshot','p79AutoAllocateRest'])vm.runInContext(extract(n),c);
c.p79AutomaticRestMetadata=(id,mo)=>{
 const quota=c.p79RestQuota(mo);
 const excluded=days.filter(day=>c.approvedLeaveForEmployee(id,day)||c.p79LeaveCoverOnDay(id,day).length);
 return c.p79AllocateRestMonth(monthlyScheduleData[id],monthlyScheduleMeta[id],mo,excluded,'').meta;
};
const originalRestDays=[1,4,7,10,13,16,19,22,25,28,31];
for(const emp of employees){
 const shifts=Object.fromEntries(days.map((d,i)=>[d,originalRestDays.includes(i+1)?'休':'早']));
 monthlyScheduleData[emp.id]=shifts;
 monthlyScheduleMeta[emp.id]=c.p79AllocateRestMonth(shifts,{},month).meta;
}
const example=employees[0],previous=monthlyScheduleMeta[example.id];
const staleDay=Object.keys(previous).find(day=>previous[day]?.restCategory==='例');
delete previous[staleDay];
let old=c.p79DailyRestCount(example,month,previous);
assert.equal(old.counts.例,3,'reproduce stale 3-day example');
const fresh=c.p79DailyRestCount(example,month,c.p79AutomaticRestMetadata(example.id,month));
assert.deepEqual(JSON.parse(JSON.stringify(fresh.counts)),{例:4,休:5,國:2},'visible row is recomputed and priority filled');
const oldAll=JSON.stringify(monthlyScheduleMeta);
let report=c.p79RestQuotaAuditSnapshot(month);
assert.equal(report.totals.checked,83,'audit all employees, not just current role or group');
assert.equal(report.totals.needsUpdate,1);
assert.equal(report.totals.unresolved,0);
assert.equal(JSON.stringify(monthlyScheduleMeta),oldAll,'audit must not change source data');
assert.equal(saves,0,'audit has no cloud writes');
assert(report.findings[0].includes(example.name));
// True shortage: 10 rest days cannot silently invent an eleventh approved off day.
const ten=employees[1];monthlyScheduleData[ten.id][month+'-31']='早';
report=c.p79RestQuotaAuditSnapshot(month);
assert.equal(report.totals.unresolved,1);
assert(report.findings.some(s=>s.includes(ten.name)&&s.includes('少1天')));
const shortageBefore=JSON.stringify(monthlyScheduleMeta[ten.id]);
c.p79AutoAllocateRest();
assert.equal(saves,1,'all-staff action queues a single cloud save');
assert.equal(renders,1);
assert.equal(mutations,1);
assert.equal(c.p79DailyRestCount(example,month,monthlyScheduleMeta[example.id]).counts.例,4,'persist refreshed fourth example day');
assert.notEqual(monthlyScheduleMeta[ten.id][month+'-31']?.restQuotaOvertime,true,'do not auto-assign overtime');
assert.equal(Object.values(monthlyScheduleMeta[ten.id]).filter(m=>m?.restQuotaOvertime===true).length,0,'shortfall must not fabricate overtime');
assert(alerts.at(-1).includes('全員 83 人'));
const paid=employees[2],saved={id:'SAVED-REPORT',category:'國',code:'國08-16'},paidDate=month+'-20';
monthlyScheduleMeta[paid.id][paidDate]={overtimeReport:saved,restCategory:'國',restQuotaOvertime:true,restAllocationSource:'manual'};
c.p79AutoAllocateRest();
assert.equal(monthlyScheduleMeta[paid.id][paidDate].overtimeReport.id,'SAVED-REPORT','keep formal overtime');
const manual=employees[3],manualDay=month+'-04';
monthlyScheduleMeta[manual.id][manualDay]={restCategory:'休',restAllocationSource:'manual'};
c.p79AutoAllocateRest();
assert.equal(monthlyScheduleMeta[manual.id][manualDay].restCategory,'休','manual designation preserved');
const blocked=employees[4];delete monthlyScheduleData[blocked.id][month+'-31'];
const beforeBlocked=JSON.stringify(monthlyScheduleMeta);
const savesBefore=saves;
c.p79AutoAllocateRest();
assert.equal(saves,savesBefore,'one incomplete employee blocks all-staff write');
assert.equal(JSON.stringify(monthlyScheduleMeta),beforeBlocked,'failed batch never partially mutates');
assert(alerts.at(-1).includes('未執行'));
assert(html.includes('p79ScheduleRestCountCells(emp,yearMonth,automaticRestMeta)'));
assert(html.includes('p79AuditAllRestQuota()'));
assert(html.includes('const selected=employees.slice()'));
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS 83 staff full-month audit, stale 3->4 example priority, workday shortfall, preservation, read-only audit, all-or-none global allocation');
