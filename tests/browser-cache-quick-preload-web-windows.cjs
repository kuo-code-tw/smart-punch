'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync('assets/port79-data-cache.js','utf8');
const start=source.indexOf('// Browser/WebView2 quick warm-up:');
const end=source.indexOf('let lastAllDownload=null;',start);
assert(start>0&&end>start,'production quick-preload implementation must exist');
new vm.Script(source);
const quick=source.slice(start,end);
function harness({role='admin',permissions={hr:'view',schedule:'view',leave:'view'},punchOnly=false,
 pending=false,offline=false,live=false}={}){
 const store=new Map([['port79_user_token','TEST_TOKEN'],
  ['port79_user_session',JSON.stringify({empId:'QA',adminRole:role,systemPermissions:permissions,punchOnly})]]);
 const ss={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value))};
 const fetches=[],reads=[],events=new Map(),snapshots=new Map(),stats={viewer:'QA@'+role,scope:'scope-A',stamp:0,gas:'https://script.google.com/macros/s/TEST/exec'};
 const win={__port79CachedSessionRefreshPending:pending,navigator:{onLine:!offline},addEventListener:(type,fn)=>events.set(type,fn)};
 const ctx={window:win,sessionStorage:ss,JSON,Date,Promise,Set,Error,
  viewerKey:()=>stats.viewer,token:()=>ss.getItem('port79_user_token'),
  displayScope:()=>stats.scope,gasUrl:()=>stats.gas,mutationStamp:()=>stats.stamp,ymNow:()=> '2026-11',
  getDisplaySnapshot:async sys=>{reads.push(sys);return snapshots.get(sys)||null},
  downloadSystem:async sys=>{fetches.push(sys);if(live&&sys==='hr')await new Promise(resolve=>{stats.resume=resolve});return {ok:true}},
 };
 vm.createContext(ctx);vm.runInContext(quick,ctx);
 return {api:vm.runInContext('preloadCurrent',ctx),win,ss,fetches,reads,events,snapshots,stats};
}
(async()=>{
 const a=harness();
 let output=await a.api();
 assert.equal(output.status,'local');
 assert.equal(a.fetches.length,0,'homepage silently warms browser cache without full cloud downloads');
 assert.deepEqual([...a.reads],['hr','schedule','leave']);
 const warm=harness();
 warm.snapshots.set('hr',{savedAt:Date.now(),data:{ok:true}});
 const progress=[];
 output=await warm.api({network:true,onProgress:(sys,phase)=>progress.push(sys+':'+phase)});
 assert.equal(output.status,'completed');
 assert.deepEqual([...warm.fetches],['schedule','leave'],'fresh scoped snapshots are reused');
 assert.equal(output.results.filter(x=>x.ok).length,3);
 assert(progress.includes('hr:reused'));
 const limited=harness({permissions:{leave:'view',hr:'none',schedule:'none'}});
 output=await limited.api({network:true});
 assert.deepEqual([...limited.fetches],['leave'],'fetch only authorized modules');
 const employee=harness({role:'employee'});
 assert.equal((await employee.api({network:true})).status,'denied');
 assert.equal(employee.fetches.length,0);
 const punch=harness({punchOnly:true});
 assert.equal((await punch.api({network:true})).status,'denied');
 const verifying=harness({pending:true});
 assert.equal((await verifying.api({network:true})).status,'verifying');
 assert.equal(verifying.fetches.length,0,'never warm before server verifies restored permissions');
 verifying.win.__port79CachedSessionRefreshPending=false;
 verifying.events.get('port79-home-session-refreshed')();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(verifying.fetches.length,0,'home event must only warm existing IndexedDB');
 const switched=harness({live:true});
 const running=switched.api({network:true});
 await new Promise(resolve=>setImmediate(resolve));
 switched.ss.setItem('port79_user_token','OTHER_TOKEN');
 switched.stats.resume();
 output=await running;
 assert.equal(output.status,'changed','abort remaining modules after account change');
 assert.deepEqual([...switched.fetches],['hr']);
 const stale=harness();
 stale.snapshots.set('hr',{savedAt:Date.now()-3600000,data:{ok:true}});
 await stale.api({network:true});
 assert.deepEqual([...stale.fetches],['hr','schedule','leave'],'old data requires cloud refresh');
 assert(source.includes('data-cache-action="quick"'));
 assert(source.includes("const result=await preloadCurrent({network:true"));
 assert(source.includes('downloadSystem(sys,null,{interactive:true})'));
 assert(!quick.includes("downloadAttendanceDatabase("),'home fast prefetch never starts massive attendance history');
 assert(!quick.includes("downloadAll("),'home fast prefetch never downloads seven systems');
 for(const path of ['index.html','attendance/index.html','work-hours/index.html','leave/index.html',
  'schedule/index.html','aqc-efficiency/index.html','hr/index.html','history-data/index.html']){
  const html=fs.readFileSync(path,'utf8');
  assert(html.includes('port79-data-cache.js?v=20261123-quick-preload-shared-v1'),path+' must load the new web/Windows shared cache');
 }
 const win=fs.readFileSync('desktop-lite/build-portable.ps1','utf8');
 assert(/assets/i.test(win),'Windows package must retain shared browser assets');
 assert(/work-hours/i.test(win),'Windows package must retain workhours and cache consumers');
 assert(source.includes("row.displayScope!==undefined&&row.displayScope!==scope"),'no cross-permission cache reuse');
 console.log('PASS scoped browser quick prefetch: manual three-module warm, no automatic bulk read, role and account guards, cache-busted Web and Windows consumers');
})().catch(e=>{console.error(e);process.exitCode=1});
