'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const cacheSource=fs.readFileSync('assets/port79-data-cache.js','utf8');
const workerHtml=fs.readFileSync('assets/port79-cache-worker.html','utf8');
const native=fs.readFileSync('desktop-lite/MainForm.cs','utf8');
const modal=cacheSource.slice(cacheSource.indexOf("if(act==='all')"),cacheSource.indexOf("function setProgress(",cacheSource.indexOf("if(act==='all')")));
function batchHarness(shared,scope='team-A'){
 const calls=[],progress=[];
 const start=cacheSource.indexOf('const SYSTEM_REUSE_MAX_AGE_MS=');
 const end=cacheSource.indexOf('\nfunction ensureStyle()',start);
 assert(start>0&&end>start,'batch and reusable local snapshot are available');
 const context={
  Date,Array,Object,Number,String,Error,Set,JSON,console,
  viewerKey:()=> 'USER@admin',token:()=> 'TOKEN',
  gasUrl:()=> 'https://script.google.com/macros/s/TEST/exec',
  displayScope:()=>scope,mutationStamp:()=>0,ymNow:()=> '2026-11',
  currentSystem:()=> 'home',getDisplaySnapshot:async sys=>shared.get(sys)||null,
  getSystemSnapshot:async sys=>shared.get(sys)||null,
  put:async row=>{shared.set(row.system,row);},
  saveSystemSnapshot:async(sys,data)=>{
   shared.set(sys,{key:'USER@admin|system|'+sys,system:sys,kind:'system',displayScope:scope,
    cacheEndpoint:'https://script.google.com/macros/s/TEST/exec',
    savedAt:Date.now(),month:sys==='efficiency'?'2026-11':undefined,
    data});
  },
  downloadAttendanceDatabase:async()=>{calls.push('attendance');return {ok:true,fullDatabase:true};},
  downloadSystem:async sys=>{calls.push(sys);return {ok:true,system:sys};}
 };
 vm.createContext(context);vm.runInContext(cacheSource.slice(start,end),context);
 return {calls,progress,run:()=>context.downloadAll((...args)=>progress.push(args),{quickFirst:true})};
}
function monthHarness(){
 const start=cacheSource.indexOf('function verifyAttendanceDownloadContext(');
 const end=cacheSource.indexOf('\nasync function downloadSystem(',start);
 assert(start>0&&end>start,'attendance with revision-safe month checkpoint is available');
 const shared=new Map(),calls=[],full=[];
 let revision='cloud-20261121-v1',scope='all';
 const rowsForMonth=month=>[{id:'punch-'+month,empId:'USER',date:month+'-01'}];
 const context={
  Date,Array,Object,Number,String,Error,Set,Map,JSON,Promise,Math,console,
  window:{chrome:{webview:{postMessage(){}}}},
  token:()=> 'TOKEN',viewerKey:()=> 'USER@admin',displayScope:()=>scope,
  mutationStamp:()=>0,gasUrl:()=> 'https://script.google.com/macros/s/TEST/exec',
  ymNow:()=> '2026-11',currentSystem:()=> 'home',
  systemKey:sys=>'USER@admin|system|'+sys,
  getDisplaySnapshot:async()=>null,
  currentViewerRow:row=>row.key.startsWith('USER@admin|'),
  get:async key=>shared.get(key)||null,
  put:async row=>{row.cacheEndpoint='https://script.google.com/macros/s/TEST/exec';
   row.displayScope=scope;shared.set(row.key,row);return true;},
  saveSystemSnapshot:async (sys,data)=>{full.push({sys,data});return data;},
  applyAttendanceSnapshotToPage:async()=>null,
  mergeAttendanceRows:rows=>rows,
  safeSize:data=>JSON.stringify(data).length,
  fetchJson:async(action,params)=>{
   calls.push(action+(params?.month?':'+params.month:''));
   if(action==='getSyncMeta')return {ok:true,revision};
   if(action==='getAttendanceMonths')return {ok:true,months:['2026-09','2026-10','2026-11']};
   if(action==='getAttendanceEmployeeMaster')return {ok:true,employees:[{empId:'USER'}]};
   if(action==='getAttendanceMonthData')return {ok:true,records:rowsForMonth(params.month)};
   if(action==='getAttendanceMainDirect')return {ok:true,records:[]};
   throw Error('Unexpected GAS action '+action);
  }
 };
 vm.createContext(context);vm.runInContext(cacheSource.slice(start,end),context);
 return {run:()=>context.readAttendanceDatabase('attendance',()=>{}, {interactive:true}),
  calls,shared,full,revision(value){revision=value},scope(value){scope=value}};
}
test('Windows background worker is its own WebView2 document, not the active navigation target',()=>{
 assert.match(native,/private WebView2 cloudWorker;/);
 assert.match(native,/await cloudWorker\.EnsureCoreWebView2Async\(env\)/);
 assert.match(native,/cloudWorker\.CoreWebView2\.Navigate\(LocalRoot\+"assets\/port79-cache-worker\.html"\)/);
 assert.match(native,/cloudWorker\.CoreWebView2\.WebMessageReceived\+=OnCacheMessage/);
 assert.match(native,/if\(cloudWorkerJobActive\)\{[\s\S]*?cachePanel\.Visible=true;[\s\S]*?cachePanel\.BringToFront\(\)/);
 assert.match(native,/await cloudWorker\.CoreWebView2\.ExecuteScriptAsync/);
 assert.match(native,/private readonly WebView2 web;/);
 assert.match(native,/if\(sender==cloudWorker\?\.CoreWebView2/);
 assert(!workerHtml.includes('TOKEN_HARDCODED'));
});
test('worker accepts a manager and keeps running when the other page navigates',()=>{
 const inline=workerHtml.match(/<script>\s*([\s\S]*?)<\/script>/);
 assert(inline,'Worker includes an inline coordinator');
 const messages=[],events=[],storage=new Map();
 const sessionStorage={
  clear(){storage.clear();},
  setItem(k,v){storage.set(k,v);},
  getItem:k=>storage.get(k)||null
 };
 const window={
  chrome:{webview:{postMessage(msg){messages.push(JSON.parse(msg));}}},
  Port79DataCache:{downloadAll:async()=>{}},
  dispatchEvent(ev){events.push(ev.type);}
 };
 const context={window,sessionStorage,Event:class{constructor(type){this.type=type}},
  JSON,Array,Date,Object,Number,String,Error,RegExp,Promise};
 vm.createContext(context);vm.runInContext(inline[1],context);
 assert.equal(messages[0].kind,'port79-background-worker-ready-v1');
 const input={storage:{port79_user_session:JSON.stringify({empId:'USER',adminRole:'admin'})},
  token:'SECRET',gas:'https://script.google.com/macros/s/TEST/exec'};
 assert.equal(window.port79StartCloudSync(input),true);
 assert.deepEqual(events,['port79-desktop-force-sync']);
 assert.equal(storage.get('port79_user_token'),'SECRET');
 assert.equal(JSON.stringify(messages).includes('SECRET'),false,'Never send credentials in native status messages');
 // Navigation on the OTHER WebView2 cannot unload this worker.
 assert.equal(window.port79StartCloudSync(input),false,'Must not duplicate active download after page navigation');
 window.__port79CloudWorkerDone();
 assert.equal(window.port79StartCloudSync(input),true,'Completed worker can start another authorized sync');
 assert.equal(events.length,2);
});
test('no employee or absent token may initiate persistent worker session',()=>{
 const inline=workerHtml.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
 const window={chrome:{webview:{postMessage(){}}},Port79DataCache:{downloadAll(){}},
  dispatchEvent(){throw Error('Unauthorized dispatch')}};
 const context={window,sessionStorage:{clear(){},setItem(){}},Event:class{},JSON,Array,Object,String,Error,RegExp};
 vm.createContext(context);vm.runInContext(inline,context);
 assert.equal(window.port79StartCloudSync({storage:{
  port79_user_session:JSON.stringify({empId:'USER',adminRole:'employee'})},
  token:'TOKEN',gas:'https://script.google.com/macros/s/TEST/exec'}),false);
 assert.equal(window.port79StartCloudSync({storage:{
  port79_user_session:JSON.stringify({empId:'USER',adminRole:'admin'})},
  token:'',gas:'https://script.google.com/macros/s/TEST/exec'}),false);
});
test('cloud-data center delegates to Windows worker, never another page-local downloading job',()=>{
 assert.match(modal,/if\(window\.chrome\?\.webview\?\.postMessage\)/);
 assert.match(modal,/kind:'port79-cache-command-v1',action:'download-all'/);
 assert.match(modal,/可切換考勤、排班等頁面/);
 assert.match(cacheSource,/window\.__port79CloudWorkerDone\?\.\(fullyCompleted\)/);
 assert.match(native,/if\(payload\.kind=="port79-cache-command-v1"\)/);
});
test('completed independent modules survive page refresh and skip unnecessary re-downloads',async()=>{
 const disk=new Map();
 const a=batchHarness(disk);
 const initial=await a.run();
 assert.equal(initial.filter(x=>x.ok).length,7);
 assert.equal(a.calls.filter(x=>x!=='attendance').length,5);
 const b=batchHarness(disk);
 const resumed=await b.run();
 assert.equal(resumed.filter(x=>x.ok).length,7);
 assert.deepEqual(b.calls,['attendance'],'All five independent system snapshots reused from persistent storage');
 assert.equal(resumed.filter(x=>x.reused).length,5);
});
test('stale or wrong-permission snapshots must be revalidated, not falsely called fresh',async()=>{
 const disk=new Map(),initial=batchHarness(disk);await initial.run();
 const wrongScope=batchHarness(disk,'team-B');await wrongScope.run();
 assert(wrongScope.calls.includes('leave'),'Permission scope change rejects earlier downloads');
 for(const row of disk.values())row.savedAt=Date.now()-31*60*1000;
 const expired=batchHarness(disk,'team-B');await expired.run();
 assert(expired.calls.includes('hr'),'Expired snapshots refresh, not reused indefinitely');
});
test('attendance month checkpoints are reused when cloud revision and employee catalog match',async()=>{
 const f=monthHarness();
 const first=await f.run();
 assert.equal(first.monthStats.length,3);
 assert.equal(f.calls.filter(x=>x.startsWith('getAttendanceMonthData')).length,3);
 const second=await f.run();
 assert.equal(second.monthStats.length,3);
 assert.equal(f.calls.filter(x=>x.startsWith('getAttendanceMonthData')).length,3,
  'Second run reuses all three persisted months, not redownloading originals');
 assert(f.shared.has('USER@admin|system|attendance|checkpoint|2026-09'));
 f.revision('cloud-v2');await f.run();
 assert.equal(f.calls.filter(x=>x.startsWith('getAttendanceMonthData')).length,6,
  'Cloud revision changed, so historical checkpoints are invalidated');
 f.scope('team-C');await f.run();
 assert.equal(f.calls.filter(x=>x.startsWith('getAttendanceMonthData')).length,9,
  'Scope change invalidates older checkpoint identity');
});
test('worker JS and C# integration remain private and do not add fake cloud totals',()=>{
 assert(!workerHtml.includes('local-data/'));
 assert(!workerHtml.includes('yard.xlsx'));
 assert(!native.includes('TOKEN_HARDCODED'));
 assert.match(native,/cacheInProgress=false/); // legacy failure still detected
 assert.match(native,/cloudWorkerJobActive=false/);
 assert.match(native,/source\.Host\.Equals\(Host/);
});
