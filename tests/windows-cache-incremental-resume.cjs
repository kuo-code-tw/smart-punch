'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const src=fs.readFileSync('assets/port79-data-cache.js','utf8');
const worker=fs.readFileSync('assets/port79-cache-worker.html','utf8');
const login=fs.readFileSync('desktop-lite/app/login-progress.js','utf8');
const native=fs.readFileSync('desktop-lite/MainForm.cs','utf8');
const systems=['leave','schedule','efficiency','hr','history','attendance','workhours'];
const start=src.indexOf('const SYSTEM_REUSE_MAX_AGE_MS=');
const end=src.indexOf('\nfunction ensureStyle()',start);
assert(start>0&&end>start,'Production batch source must be present');
const body=src.slice(start,end);
function fixture({ageMinutes=70,missing=[],scope='all',changedScope='',savedMonth='2026-11'}={}){
 const disk=new Map(),calls=[],progress=[],writes=[];
 const originalScope=scope;
 for(const sys of systems){
  if(missing.includes(sys))continue;
  const data=['attendance','workhours'].includes(sys)
   ?{ok:true,fullDatabase:true,months:['2026-11'],monthStats:[{month:'2026-11',ok:true}],records:[]}
   :{ok:true};
  disk.set(sys,{system:sys,kind:'system',displayScope:changedScope||originalScope,
   cacheEndpoint:'https://script.google.com/macros/s/TEST/exec',
   savedAt:Date.now()-ageMinutes*60000,
   month:sys==='efficiency'?savedMonth:undefined,data});
 }
 const context={
  Date,Array,Object,Number,String,Set,JSON,console,
  token:()=> 'AUTH',viewerKey:()=> 'USER@admin',
  displayScope:()=>scope,mutationStamp:()=>0,gasUrl:()=> 'https://script.google.com/macros/s/TEST/exec',
  currentSystem:()=> 'home',ymNow:()=> '2026-11',
  getDisplaySnapshot:async sys=>{
   const row=disk.get(sys);
   // Stand in for the production account/scope/endpoint/mutation checks.
   return row&&row.displayScope===scope&&row.cacheEndpoint==='https://script.google.com/macros/s/TEST/exec'?row:null;
  },
  getSystemSnapshot:async sys=>disk.get(sys)||null,
  put:async row=>{disk.set(row.system,row);return true},
  saveSystemSnapshot:async (sys,data)=>{
   writes.push(sys);disk.set(sys,{system:sys,kind:'system',savedAt:Date.now(),
    displayScope:scope,month:sys==='efficiency'?'2026-11':undefined,data});return data;
  },
  downloadAttendanceDatabase:async ()=>{calls.push('attendance');return {
   ok:true,fullDatabase:true,months:['2026-11'],monthStats:[{month:'2026-11',ok:true}],records:[]};},
  downloadSystem:async sys=>{calls.push(sys);return {ok:true}},
  applyAttendanceSnapshotToPage:async ()=>{}
 };
 vm.createContext(context);vm.runInContext(body,context);
 return {disk,calls,progress,writes,run:(opts={quickFirst:true,resumeExisting:true})=>
  context.downloadAll((...args)=>progress.push(args),opts)};
}
test('Windows automatic login reuses all seven scoped IndexedDB snapshots older than the prior 30-minute cap',async()=>{
 const f=fixture();const result=await f.run();
 assert.equal(result.length,7);
 assert.equal(result.filter(x=>x.reused).length,7);
 assert.deepEqual(f.calls,[],'No repeated full cloud download on restart');
 assert(f.progress.some(x=>x[3]==='reused'&&String(x[5]).includes('未重抓')));
});
test('interrupted 6/7 previous download resumes only the missing history catalog',async()=>{
 const f=fixture({missing:['history']});
 const result=await f.run();
 assert.deepEqual(f.calls,['history']);
 assert.equal(result.filter(x=>x.reused).length,6);
 assert.equal(result.filter(x=>x.ok).length,7);
});
test('Windows startup completes 6/6 while missing history catalog stays on demand',async()=>{
 const f=fixture({missing:['history'],ageMinutes:72});
 const result=await f.run({quickFirst:true,resumeExisting:true,historyOnDemand:true});
 assert.equal(result.length,6);
 assert.equal(result.filter(x=>x.reused).length,6);
 assert.deepEqual(f.calls,[],'No history server call and no repeated fetches');
 assert(result.every(x=>x.system!=='history'));
 assert(f.progress.every(x=>x[2]===6),'Never display stale 6/7 count');
});
test('Windows manual refresh verifies six modules only, with history requested by month',async()=>{
 const f=fixture({missing:['history'],ageMinutes:72});
 const result=await f.run({quickFirst:true,historyOnDemand:true});
 assert.equal(result.length,6);
 assert.deepEqual(f.calls,['leave','schedule','efficiency','hr','attendance']);
});
test('manual refresh is not suppressed by long startup resume cache',async()=>{
 const f=fixture({ageMinutes:70});await f.run({quickFirst:true});
 assert.deepEqual(f.calls,['leave','schedule','efficiency','hr','history','attendance']);
});
test('permission change, expired cache, or wrong month force cloud revalidation',async()=>{
 const wrongScope=fixture({changedScope:'restricted'});await wrongScope.run();
 assert(wrongScope.calls.includes('hr'));
 const old=fixture({ageMinutes:24*60+1});await old.run();
 assert(old.calls.includes('history')&&old.calls.includes('attendance'));
 const month=fixture({savedMonth:'2026-10'});await month.run();
 assert(month.calls.includes('efficiency'));
});
test('partial attendance download is never considered an already-complete local snapshot',async()=>{
 const f=fixture();
 f.disk.get('attendance').data.monthStats[0].ok=false;
 await f.run();assert(f.calls.includes('attendance'));
});
test('automatic history catalog does not retrieve three large monthly histories',async()=>{
 const a=src.indexOf('async function downloadSystem(sys,');
 const b=src.indexOf('// Successfully downloaded independent systems',a);
 assert(a>0&&b>a);
 const calls=[],ctx={token:()=> 'AUTH',ymNow:()=> '2026-11',
  fetchJson:async action=>{calls.push(action);return {ok:true}},Error};
 vm.createContext(ctx);vm.runInContext(src.slice(a,b),ctx);
 await ctx.downloadSystem('history',null,{interactive:true,resumeExisting:true});
 assert.deepEqual(calls,['getHistoricalDataCatalog']);
});
test('startup resume is explicit while the user-triggered sync still refreshes cloud',()=>{
 assert.match(login,/kind:'port79-cache-command-v1',action:'download-resume'/);
 assert.match(native,/if\(payload.action=="download-all"\)_=ForceDownload\(\)/);
 assert.match(native,/if\(payload.action=="download-resume"\)_=ForceDownload\(true\)/);
 assert.match(native,/payload\["resumeOnly"\]=resumeOnly/);
 assert.match(worker,/__port79WorkerResumeOnly=data.resumeOnly===true/);
 assert.match(src,/resumeExisting:window.__port79WorkerResumeOnly===true/);
 assert.match(native,/if\(sender==cloudWorker\?\.CoreWebView2&&!cloudWorkerJobActive/);
 assert.match(src,/row\.savedAt<mutationStamp\(\)/);
 assert.match(src,/row\.cacheEndpoint&&row\.cacheEndpoint!==gasUrl\(\)/);
 assert(src.includes('historyOnDemand=options?.historyOnDemand===true'));
 assert(src.includes('historyOnDemand?6:7'));
 assert(src.includes('resumeExisting:window.__port79WorkerResumeOnly===true,historyOnDemand'));
 assert(native.includes('重新核對六項基本資料（歷史按月）'));
});
