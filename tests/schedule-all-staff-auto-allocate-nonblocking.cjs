'use strict';
// The real "全員自動配對例／休／國" button must never abort 83 valid
// employees because three others have no monthly roster. Locked/manual
// categories, official reports and original shift codes must stay intact.
const fs=require('node:fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('schedule/index.html','utf8');
const source=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const {p79AllocateRestMonth,p79RestQuota}=Function(source+
 ';return {p79AllocateRestMonth,p79RestQuota};')();
function extract(name,next){
 const i=html.indexOf('    function '+name+'('),j=html.indexOf(next,i);
 assert(i>=0&&j>i,'missing '+name);
 return html.slice(i,j);
}
const apply=extract('p79ApplyAutomaticRestMetadata','    // Audit the whole loaded month');
const action=extract('p79AutoAllocateRest','    function autoScheduleCurrentTab()');
const month='2026-11',d=n=>month+'-'+String(n).padStart(2,'0');
assert.deepEqual(p79RestQuota(month).counts,{例:5,休:4,國:0});
const people=Array.from({length:86},(_,i)=>({
 id:'E'+(i+1),
 name:i===16?'黃柏源':'測試員'+(i+1),
 group:['A組','B組','C組','D組','不分組','不輪班'][i%6]
}));
// Real browser updateDailyShift('例') persists raw 休 with manual metadata.
const chosenExamples=[1,3,5,7,9,11,13],chosenRests=[15,17,19];
const original=()=>{
 const row=Object.fromEntries(Array.from({length:30},(_,i)=>[d(i+1),'中']));
 for(const n of [...chosenExamples,...chosenRests])row[d(n)]='休';
 return row;
};
const roster=Object.fromEntries(people.map(p=>[p.id,original()]));
const meta=Object.fromEntries(people.map(p=>[p.id,Object.fromEntries([
 ...chosenExamples.map(n=>[d(n),{manualRosterShift:'例',restCategory:'例',
  restAllocationSource:'manual'}]),
 ...chosenRests.map(n=>[d(n),{manualRosterShift:'休'}])
])]));
for(const id of ['E84','E85','E86']){roster[id]={};meta[id]={};} // no monthly roster
meta.E17[d(1)]={...meta.E17[d(1)],restCategoryLocked:true,note:'locked manual'};
meta.E18[d(3)]={overtimeReport:{id:'CLOUD-18',category:'例',
 code:'例08-16'},note:'formal original'};
const unchanged=JSON.stringify(roster);
let pending=0,draws=0,dirty=0;
const notices=[];
const ctx={
 employees:people,monthlyScheduleData:roster,monthlyScheduleMeta:meta,
 document:{getElementById:()=>({value:month})},
 scheduleEditLockState:{mine:true},p79ScheduleHasOfficialData:()=>true,
 p79RestAutomaticPlan:(p,m,prior)=>p79AllocateRestMonth(roster[p.id],prior||meta[p.id],m),
 p79EmployeeDateEligible:()=>true,
 approvedLeaveForEmployee:()=>null,p79LeaveCoverOnDay:()=>[],
 p79MarkScheduleLocalMutation:()=>{dirty++;},
 requireScheduleEditLock:()=>true,
 queueScheduleCloudSave:()=>{pending++;},
 buildRoleTabsAndRender:()=>{draws++;},
 showScheduleNotice:(msg)=>notices.push(msg),
 console:{warn:()=>{}},
 alert:()=>{throw Error('blocking alert must not appear');}
};
const allocate=Function('ctx','with(ctx){'+apply+action+
 '\nreturn p79AutoAllocateRest;}')(ctx);
allocate();
assert.equal(pending,1,'valid staff are saved as one cloud batch');
assert.equal(draws,1,'monthly date cells and summary refresh once');
assert.equal(dirty,1,'one local data mutation event');
assert.equal(JSON.stringify(roster),unchanged,'source shifts unchanged for everyone');
const classes=Object.values(meta.E17).reduce((acc,v)=>{
 if(['例','休','國'].includes(v.restCategory))acc[v.restCategory]++;
 return acc;
},{例:0,休:0,國:0});
assert.equal(classes.例,5,'7 actual manually selected 例 rebalanced to 5 valid 例');
assert.equal(classes.休,5,'3 manual 休 + 2 surplus manual 例 become 5 actual rest days');
assert.equal(meta.E17[d(1)].restCategory,'例','manual lock protected');
assert.equal(meta.E17[d(1)].note,'locked manual');
assert(['auto-v1','auto-excess-v1'].includes(meta.E17[d(3)].restAllocationSource),
 'nonlocked manually selected 例 is eligible for auto quota reconciliation');
assert.equal(meta.E18[d(3)].overtimeReport.id,'CLOUD-18','cloud overtime untouched');
assert.deepEqual(meta.E84,{});
assert.deepEqual(meta.E85,{});
assert.deepEqual(meta.E86,{});
assert.match(notices[0],/83人已處理，3人因無完整班表略過/);
assert(!notices[0].includes('全員配對未執行'));
assert(!html.includes('id="p79RestAuditLiveStatus"'),'yellow audit strip removed');
assert(!html.includes('p79QueueLiveRestQuotaAudit();'),'no background audit banner');
allocate();
assert.equal(pending,1,'repeated pairing is idempotent');
assert.equal(dirty,1,'second click does not mark data dirty');
assert.equal(draws,2,'second click still refreshes visible personnel');
console.log('PASS all 86 people scanned, 83 qualified rebalanced, 3 blank rosters skipped, visible refresh and single save; no alert or yellow banner; locks and official data preserved');
