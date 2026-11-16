'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const ctx={Date,Set,Map,JSON,Math,Array,String,Number,Object};
vm.createContext(ctx);vm.runInContext(source,ctx);
const month='2026-11',day=n=>month+'-'+String(n).padStart(2,'0');
const rests=[1,5,8,12,15,19,22,26,29];
const roster=Object.fromEntries(Array.from({length:30},(_,i)=>[day(i+1),rests.includes(i+1)?'休':'早']));
const manualRest=()=>Object.fromEntries(rests.map(n=>[day(n),{manualRosterShift:'休'}]));
const count=meta=>Object.fromEntries(['例','休','國'].map(kind=>[kind,Object.values(meta).filter(v=>v?.restCategory===kind&&!v.restQuotaOvertime).length]));
const plain=x=>JSON.parse(JSON.stringify(x));
const clone=x=>JSON.parse(JSON.stringify(x));
assert.deepEqual(plain(ctx.p79RestQuota(month).counts),{例:5,休:4,國:0},'November quota');

// Regression: AQC ungrouped employees with 9 real "休" days should not show
// the erroneous 0/5 and 9/0 when those dates were manually set or imported.
{
 const raw=clone(roster),meta=manualRest(),snapshot=JSON.stringify({raw,meta});
 const result=ctx.p79AllocateRestMonth(raw,meta,month);
 assert.deepEqual(count(result.meta),{例:5,休:4,國:0},'nine real rest days fill five 例 and four 休');
 assert.equal(result.unresolved.length,0,'no false quota shortage');
 for(const n of rests)assert.equal(result.meta[day(n)].manualRosterShift,'休','manual shift remains untouched');
 assert.equal(JSON.stringify({raw,meta}),snapshot,'source records remain immutable');
 const again=ctx.p79AllocateRestMonth(raw,result.meta,month);
 assert.deepEqual(count(again.meta),{例:5,休:4,國:0});
 assert.equal(JSON.stringify(again.meta),JSON.stringify(result.meta),'recomputed result is stable after reload');
}
// Keep two explicit and locked 例 dates; fill only the three missing 例 from
// seven flexible 休 dates without moving those original manual decisions.
{
 const meta=manualRest();
 for(const n of [1,8])meta[day(n)]={manualRosterShift:'例',restCategory:'例',restAllocationSource:'manual',restCategoryLocked:true};
 const result=ctx.p79AllocateRestMonth(roster,meta,month);
 assert.deepEqual(count(result.meta),{例:5,休:4,國:0},'2/3 and 7/0 becomes 5/0 and 4/0');
 assert.equal(result.unresolved.length,0);
 for(const n of [1,8])assert.deepEqual(plain(result.meta[day(n)]),meta[day(n)],'locked manual 例 is unchanged');
}
// A protected day cannot be changed merely to make the counters look full.
{
 const meta=manualRest();
 meta[day(1)]={manualRosterShift:'休',restAllocationLocked:true,lockReason:'approved'};
 const result=ctx.p79AllocateRestMonth(roster,meta,month);
 assert.equal(result.meta[day(1)].restCategory,undefined);
 assert.equal(result.meta[day(1)].lockReason,'approved');
 assert(result.unresolved.length>=1,'protected day keeps real quota shortage');
}
// A confirmed rest-day overtime report is accounted once; don't overwrite it
// with a fabricated off-day or double count its category.
{
 const meta=manualRest();
 meta[day(1)]={manualRosterShift:'休',overtimeReport:{id:'FORMAL-777',category:'休'}};
 const result=ctx.p79AllocateRestMonth(roster,meta,month);
 assert.equal(result.meta[day(1)].overtimeReport.id,'FORMAL-777');
 assert.equal(result.meta[day(1)].restCategory,undefined);
 assert.equal(result.unresolved.length,0);
}
// Not all "manualRosterShift" values are flexible: a manual work shift is
// protected from becoming a statutory off-day solely to reach a quota.
{
 const raw=clone(roster);raw[day(1)]='早';
 const meta=manualRest();meta[day(1)].manualRosterShift='早';
 const result=ctx.p79AllocateRestMonth(raw,meta,month);
 assert.equal(result.meta[day(1)].restCategory,undefined);
 assert(result.unresolved.length>=1,'insufficient real off-days remain unresolved');
}
// On a month with 0 national holidays, never invent 國 even from stale meta.
{
 const meta=manualRest();
 meta[day(1)]={manualRosterShift:'休',restCategory:'國',restAllocationSource:'auto-v1'};
 const result=ctx.p79AllocateRestMonth(roster,meta,month);
 assert.deepEqual(count(result.meta),{例:5,休:4,國:0});
 assert.equal(result.meta[day(1)].manualRosterShift,'休');
}
// Verify the real monthly roster cell classifier, not only the allocator:
// the existing renderer already calls automatic metadata at render time,
// so the user sees 例/休 automatically without clicking 全員自動配對.
{
 const html=fs.readFileSync('schedule/index.html','utf8');
 const extract=name=>{
  const start=html.indexOf('    function '+name+'('),end=html.indexOf('\n    }',start);
  assert(start>=0&&end>start,'missing live display function '+name);
  return html.slice(start,end+6);
 };
 const state={window:null,Date,Set,Map,JSON,Math,Array,String,Number,Object,
  p79RestQuota:ctx.p79RestQuota,p79EmployeeDateEligible:()=>true,
  monthlyScheduleData:{E1:clone(roster)},monthlyScheduleMeta:{E1:manualRest()},
  approvedLeaveForEmployee:()=>null,p79ScheduleHasVerifiedPunch:()=>false,
  p79ScheduleNoPunchRest:()=>false,p79LeaveCoverOnDay:()=>[],
  p79CoverageShift:()=>'',p79SubstituteShiftLabel:()=>'',p79ScheduleSpecialNoPunchCode:()=>'',p79ScheduleLeaveExportCode:()=>'',scheduleLeaveTypeText:()=> '',
  p79ConfirmedOvertimeReport:()=>false,scheduleTaipeiTodayKey:()=>day(1)
 };
 state.window=state;state.P79RestAttendance={state:()=> 'unknown'};
 vm.createContext(state);
 for(const name of ['p79VisibleRestKind','p79ScheduleDisplayDay'])
  vm.runInContext(extract(name),state);
 const plan=ctx.p79AllocateRestMonth(roster,manualRest(),month);
 const evidence={complete:false,actualShifts:{},actualWorkedMinutes:{}};
 const view={automaticRestMeta:plan.meta,restBalance:{ledger:[]},
  attendanceEvidence:evidence,attendanceSnapshot:{attendanceEvidence:evidence},
  typhoonDays:new Set(),electionDays:new Set(),typhoonToday:day(1)};
 const visible={例:[],休:[],國:[]};
 for(let n=1;n<=30;n++){
  const result=state.p79ScheduleDisplayDay({id:'E1'},day(n),view);
  if(result.visibleRestKind)visible[result.visibleRestKind].push(day(n));
 }
 assert.deepEqual(plain(Object.fromEntries(Object.entries(visible).map(([key,value])=>[key,value.length]))),
  {例:5,休:4,國:0},'actual month grid automatically displays 5 例 and 4 休 without a button click');
 assert.equal(state.monthlyScheduleData.E1[day(1)],'休','grid uses new category without rewriting the original shift');
 assert(html.includes('const automaticRestMeta = p79AutomaticRestMetadata(emp.id, yearMonth);'),
  'live roster calculates classifications automatically during render');
}
console.log('PASS AQC 例休 auto refill, visible monthly grid, reload stability, manual locks, formal overtime and zero 國 quota');
