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
console.log('PASS AQC 例休 auto refill, stable reload, explicit manual 例, locks, formal overtime and zero 國 quota');
