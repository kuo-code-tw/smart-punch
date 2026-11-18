'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ui=fs.readFileSync('assets/port79-workhours-reference-dashboard.js','utf8');
const policySource=fs.readFileSync('assets/port79-hidden-job-titles.js','utf8');
const filterSource=fs.readFileSync('assets/port79-workhours-hidden-job-ui.js','utf8');
new vm.Script(ui);new vm.Script(policySource);new vm.Script(filterSource);
function extract(begin,end){
 const a=ui.indexOf(begin),b=ui.indexOf(end,a+begin.length);
 assert(a>=0&&b>a,'missing runtime function '+begin);
 return ui.slice(a,b);
}
const fpSource=extract(' function recordFingerprint(rows){','\n function verifiedAttendance(month){');
const sigSource=extract(' function autoSignature(){','\n let lastAutoSignature=');
const attendanceSource=extract(' function verifiedAttendance(month){','\n const job=e=>');
const fpContext={Math,JSON};vm.createContext(fpContext);
vm.runInContext(fpSource+'\nthis.fingerprint=recordFingerprint;',fpContext);
const rowA={id:'1',empId:'A01',type:'IN',timeStr:'2026-11-18 08:00'};
const rowB={id:'2',empId:'A01',type:'OUT',timeStr:'2026-11-18 17:00'};
assert.equal(fpContext.fingerprint([rowA,rowB]),fpContext.fingerprint([rowB,rowA]),
 'reordered identical cloud records must have the same content signature');
assert.notEqual(fpContext.fingerprint([rowA,rowB]),fpContext.fingerprint([rowA,{...rowB,timeStr:'2026-11-18 18:00'}]),
 'actual time changes must invalidate the signature');
const monthState={revision:'rev-1',appliedCacheBundle:'v1',at:100,pending:false};
const sigContext={
 id:()=>({value:'2026-11-01'}),p79WorkOvertimeMonths:new Map([['2026-11',monthState]]),
 currentPort79SsoToken:()=> 'token',lastAttendanceCloudRevision:'rev-1',
 window:{sessionStorage:{getItem:()=>''},Port79JobTitleVisibility:{status:()=> 'ready',revision:()=>1}},
 rawCloud:{readAt:123, fingerprint:'same',error:''},JSON
};
vm.createContext(sigContext);vm.runInContext(sigSource+'\nthis.signature=autoSignature;',sigContext);
const unchanged=sigContext.signature();
monthState.at=99999;sigContext.rawCloud.readAt=876543;
assert.equal(sigContext.signature(),unchanged,
 'new fetch timestamps alone must not redraw the dashboard');
sigContext.rawCloud.fingerprint='new-verified-records';
assert.notEqual(sigContext.signature(),unchanged,'changed verified records must repaint');
sigContext.rawCloud.fingerprint='same';
sigContext.window.Port79JobTitleVisibility.revision=()=>2;
assert.notEqual(sigContext.signature(),unchanged,'a newly hidden job title must repaint');

async function run(){
 const waiting=[];
 const policyContext={module:{exports:{}},window:{},Date,AbortController,setTimeout,clearTimeout,
  fetch:()=>new Promise((resolve,reject)=>waiting.push({resolve,reject}))};
 vm.createContext(policyContext);vm.runInContext(policySource,policyContext);
 const policy=policyContext.window.Port79JobTitleVisibility;
 const credentials={gasUrl:'https://example.invalid/exec',token:'session-token'};
 const resolvePolicy=hidden=>waiting.shift().resolve({ok:true,json:async()=>({
  ok:true,config:{hrOrgOptionsV2:{hiddenJobTitles:hidden}}
 })});
 let request=policy.load(credentials);
 assert.equal(policy.ready(),false,'initial titles must fail closed');
 resolvePolicy(['司機']);await request;
 assert.equal(policy.ready(),true);assert.equal(policy.isVisible('司機'),false);
 const revision=policy.revision();
 request=policy.load({...credentials,force:true});
 assert.equal(policy.ready(),true,'revalidation must not blank a verified policy');
 assert.equal(policy.isVisible('司機'),false,'hidden title remains hidden during refresh');
 assert.equal(policy.revision(),revision,'background revalidation must not invent a change');
 resolvePolicy(['司機']);await request;
 assert.equal(policy.revision(),revision,'same title policy must not bump revision');
 request=policy.load({...credentials,force:true});
 assert.equal(policy.ready(),true);
 resolvePolicy(['司機','領班']);await request;
 assert.equal(policy.isVisible('領班'),false,'new official hidden title must be applied');
 assert(policy.revision()>revision,'real HR changes must advance policy revision');
 request=policy.load({...credentials,force:true});
 assert.equal(policy.ready(),true);
 waiting.shift().reject(new Error('simulated cloud failure'));
 await assert.rejects(request);
 assert.equal(policy.ready(),false,'failed official verification must continue to fail closed');

 let clock=1000000,paints=0;const requests=[];
 class FakeDate extends Date{static now(){return clock}}
 const ctx={Date:FakeDate,Promise,JSON,Math,Map,Array,window:{sessionStorage:{getItem:()=>''}},
  rawCloud:{month:'',token:'',revision:'',rows:null,fingerprint:'',readAt:0,attemptAt:0,inflight:null,error:''},
  currentPort79SsoToken:()=> 'token',p79WorkOvertimeMonths:new Map(),
  p79WorkRestMonths:()=>['2026-11'],p79ReadWorkRestMonth:()=>new Promise(resolve=>requests.push(resolve)),
  mergeAttendanceRecordCollections:(a,b)=>a.concat(b),
  recordFingerprint:fpContext.fingerprint,refresh:()=>{paints++}};
 vm.createContext(ctx);
 vm.runInContext(attendanceSource+'\nthis.verifiedAttendance=verifiedAttendance;',ctx);
 assert.equal(ctx.verifiedAttendance('2026-11'),null,'initial raw data is not guessed');
 assert.equal(requests.length,1);
 requests.shift()({records:[rowA,rowB]});await new Promise(setImmediate);
 assert.equal(paints,1,'first verified cloud snapshot paints once');
 assert.equal(ctx.verifiedAttendance('2026-11').length,2);
 clock+=300001;
 assert.equal(ctx.verifiedAttendance('2026-11').length,2,'stale verified data stays visible during revalidation');
 assert.equal(requests.length,1);
 requests.shift()({records:[rowB,rowA]});await new Promise(setImmediate);
 assert.equal(paints,1,'same records in another order must NOT repaint');
 clock+=300001;ctx.verifiedAttendance('2026-11');
 requests.shift()({records:[rowA,{...rowB,timeStr:'2026-11-18 18:00'}]});await new Promise(setImmediate);
 assert.equal(paints,2,'genuinely changed punch time must repaint');
 clock+=300001;ctx.verifiedAttendance('2026-11');
 requests.shift()({records:[rowA,{...rowB,timeStr:'2026-11-18 18:00'}]});await new Promise(setImmediate);
 assert.equal(paints,2,'repeated same source remains still');
 assert(filterSource.includes("root?.addEventListener?.('focus',()=>{void load()})"),
  'focus handler must respect throttled HR policy refresh');
 console.log('PASS no-flicker: HR revalidation, unchanged official timestamps, same-content/reordered fetches, real data change, fail-closed errors');
}
run().catch(e=>{console.error(e);process.exitCode=1});
