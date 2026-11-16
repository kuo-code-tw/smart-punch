'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-rest-allocation.js','utf8');
const html=fs.readFileSync('schedule/index.html','utf8');
const css=fs.readFileSync('assets/port79-schedule-reference-design.css','utf8');
const f=Function(source+';return {p79AllocateRestMonth,p79RestQuota};')();
const month='2026-11',d=n=>month+'-'+String(n).padStart(2,'0');
const clone=x=>JSON.parse(JSON.stringify(x));
const assertSame=(a,b)=>assert.deepEqual(clone(a),clone(b));
const rests=[1,5,8,12,15,19,22,26,29];
const schedule=()=>Object.fromEntries(Array.from({length:30},(_,i)=>
 [d(i+1),rests.includes(i+1)?'休':'早']));
assertSame(f.p79RestQuota(month).counts,{例:5,休:4,國:0});

// Real-world AQC D rotation shape: three visible bare 例 plus five explicit
// manual 例 stored in the off-day metadata. This was previously an exception
// that silently aborted the entire employee's auto-audit.
{
 const roster=schedule();
 for(const n of [1,5,13])roster[d(n)]='例';
 const extra=[2,3,10,16,23,30];
 for(const n of extra)roster[d(n)]='休';
 const meta=Object.fromEntries([
  ...[1,5,13].map(n=>[d(n),{
   manualRosterShift:'例',restCategory:'例',restAllocationSource:'manual',
   restCategoryLocked:true
  }]),
  ...[3,10,16,23,30].map(n=>[d(n),{
   manualRosterShift:'例',restCategory:'例',restAllocationSource:'manual'
  }])
 ]);
 const before=JSON.stringify({roster,meta});
 const plan=f.p79AllocateRestMonth(roster,meta,month);
 assert(plan.conflicts.length>=3,'existing over-quota dates are flagged, not thrown');
 assert(plan.conflicts.every(x=>x.reason==='既有例休國超過配額'));
 assert.equal(JSON.stringify({roster,meta}),before,'original roster/manual meta not overwritten');
 for(const n of [3,10,16,23,30])assert.equal(plan.meta[d(n)].restCategory,'例','existing manual labels remain');
 const reload=f.p79AllocateRestMonth(roster,plan.meta,month);
 assert(reload.conflicts.length>=3,'conflicts survive rerun instead of disappearing');
}

// A valid manual 例 with an old source date mismatch is still reserved once;
// it must be explicitly audited, never trigger 5/4 by double assignment.
{
 const roster=schedule(),meta={[d(5)]:{
  restCategory:'例',restSourceDate:'2026-11-99',
  restAllocationSource:'manual',manualRosterShift:'例'
 }};
 const before=JSON.stringify({roster,meta});
 const plan=f.p79AllocateRestMonth(roster,meta,month);
 assert(plan.conflicts.some(x=>x.reason==='來源日期不符'));
 assert.equal(plan.meta[d(5)].restSourceDate,'2026-11-99');
 assert.equal(JSON.stringify({roster,meta}),before);
}

// Ordinary nine off-days still allocate correctly and idempotently.
{
 const roster=schedule(),metadata=Object.fromEntries(rests.map(n=>[d(n),{manualRosterShift:'休'}]));
 const result=f.p79AllocateRestMonth(roster,metadata,month);
 assert.equal(result.conflicts.length,0);
 assertSame(Object.fromEntries(['例','休','國'].map(cat=>[cat,Object.values(result.meta).filter(x=>x.restCategory===cat).length])),
 {例:5,休:4,國:0});
 assert.equal(result.unresolved.length,0);
}

// No off days are fabricated for missing/incomplete schedules, including
// new staff whose first eight calendar days are legitimately blank.
{
 const roster=schedule();for(let n=1;n<=8;n++)roster[d(n)]='';
 assert.throws(()=>f.p79AllocateRestMonth(roster,{},month),/未排班日期/);
 const limited=f.p79AllocateRestMonth(roster,{},month,[],d(9));
 assert(limited.unresolved.length>=0,'valid hire date narrows the eligible quota window');
}

// Current browser schedule must audit all loaded employees, in small idle
// batches, after month render, and provide individual details without
// adding a write or requiring a new manual action.
assert(!html.includes('id="p79RestAuditLiveStatus"'),'unwanted yellow audit banner removed');
assert(!html.includes('p79QueueLiveRestQuotaAudit();'),'no automatic audit banner render');
assert(html.includes('function p79RestQuotaAuditSnapshot('),'read-only diagnostic remains available');
assert(html.includes("emp.group!=='不輪班'"),'fixed non-rotators are exempt from no-roster warnings');
assert(html.includes('result.conflicts||[]'));
assert(html.includes("pre.textContent=findings.join"));
assert(!css.includes('.p79-audit-attention'),'old banner CSS removed');
assert(html.includes('function p79ApplyAutomaticRestMetadata(planned=null)'));
assert(html.includes('Re-enable automatic quota metadata persistence ONLY as part of an'),'verified saves may persist auto 例休國');
assert(html.includes('!scheduleEditLockState.mine'),'auto-write requires a valid editor lock');
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
 if(/\bsrc=|application\/json|importmap/.test(match[1]))continue;
 new vm.Script(match[2]);
}
console.log('PASS all-staff 86-style rest quota audit: manual overage, source-date conflicts, safe 5/4, partial staff, auto UI and syntax');
