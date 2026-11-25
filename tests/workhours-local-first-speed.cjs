'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('work-hours/index.html','utf8');
const cache=fs.readFileSync('assets/port79-workhours-cache.js','utf8');
const dashboard=fs.readFileSync('assets/port79-workhours-reference-dashboard.js','utf8');
new vm.Script(cache);new vm.Script(dashboard);
assert(page.includes('const bundle=await window.P79WorkhoursCache.load(month);'),
 'restoring an existing full local snapshot cannot force a fresh multi-month cloud download');
assert(page.includes('port79-workhours-cache.js?v=20261116-attendance-preview-v1&reuse=20261117-local-first-v2'),
 'browser must see the updated locally optimized cache module');
const dashboardScript=page.match(/src="([^"]*port79-workhours-reference-dashboard\.js\?[^"]+)"/)?.[1];
assert(dashboardScript,'dashboard must load a versioned script');
const dashboardParams=new URL(dashboardScript,'https://fixture.invalid/').searchParams;
assert.equal(dashboardParams.get('reuse'),'20261117-local-first-v3','local reuse must remain versioned');
assert.equal(dashboardParams.get('query'),'20261125-official-retry-v1','browser must load the official read retry update');
assert(dashboard.includes("{cache:'default'}"),'versioned static HTML should use normal browser caching');
assert(page.includes("'p79-workhours-data-changed'"),'official bundle must signal the cached month as soon as it is applied');
assert(dashboard.includes("window.addEventListener('p79-workhours-data-changed',refreshOnChange)"),
 'dashboard must update promptly on source changes, not after another timer cycle');
assert(dashboard.includes('setInterval(refreshOnChange,12000)'),
 'unchanged data must not rebuild the entire dashboard at fixed intervals');
assert(!dashboard.includes("window.addEventListener('focus',refresh);"),
 'switching back to the browser must not always repaint a large unchanged report');
const start=dashboard.indexOf(' function verifiedAttendance(month){');
const end=dashboard.indexOf('\n const job=',start);
assert(start>=0&&end>start,'original authenticated attendance reader remains present');
const fn=dashboard.slice(start,end);
const fingerprintStart=dashboard.indexOf(' function recordFingerprint(rows){');
assert(fingerprintStart>=0&&fingerprintStart<start,'dashboard fingerprint helper must be included in extracted reader');
const fingerprintSource=dashboard.slice(fingerprintStart,start);
let token='TOKEN',cloudCalls=0,cacheCalls=0,revision='v1';
const states=new Map([['2026-11',{appliedCacheBundle:revision,revision,pending:false}]]);
const ctx={
 URL,Date,Intl,JSON,Array,Promise,setTimeout,clearTimeout,
 currentPort79SsoToken:()=>token,
 p79WorkOvertimeMonths:states,lastAttendanceCloudRevision:'r1',
 p79WorkRestMonths:()=>['2026-10','2026-11','2026-12'],
 p79ReadWorkRestMonth:async month=>{cloudCalls++;return {month,records:[]}},
 mergeAttendanceRecordCollections:(a,b)=>[...a,...b],
 refresh:()=>{},
 window:{
  sessionStorage:{getItem:()=>''},
  P79WorkhoursCache:{verifiedRawMonths:(month,who)=>{
   cacheCalls++;
   return who==='TOKEN'&&month==='2026-11'?[
    {month:'2026-10',records:[{id:'oct'}]},
    {month:'2026-11',records:[{id:'nov'}]},
    {month:'2026-12',records:[{id:'dec'}]}]:null;
  }}
 }
};
vm.createContext(ctx);
const read=vm.runInContext("const rawCloud={month:'',token:'',revision:'',rows:null,fingerprint:'',readAt:0,attemptAt:0,inflight:null,error:''};\n"+fingerprintSource+fn+"\nverifiedAttendance;",ctx);
const first=read('2026-11');
assert.deepEqual([...first].map(r=>r.id),['oct','nov','dec'],'dashboard uses previously verified official raw months');
assert.equal(cloudCalls,0,'no duplicate GAS getAttendanceMonthRaw calls after main verified load');
assert.equal(read('2026-11'),first,'unchanged view reuses already displayed local array');
assert.equal(cacheCalls,1,'local attendance is not cloned/reaggregated on every view refresh');
revision='v2';states.set('2026-11',{appliedCacheBundle:revision,revision,pending:false});
const changed=read('2026-11');
assert.notEqual(changed,first,'cloud revision change invalidates old computed evidence');
assert.equal(cacheCalls,2);assert.equal(cloudCalls,0,'new verified bundle is reused too');
token='OTHER';
assert.equal(read('2026-11'),null,'a different user must not see the old account raw evidence');
assert.equal(cloudCalls,3,'another account must perform new authenticated raw-month reads instead of inheriting a cache');
console.log('PASS workhours fast local load, verified-month sharing, stable rendering, revision and account isolation');
