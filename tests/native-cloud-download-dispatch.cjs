'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const data=fs.readFileSync('assets/port79-data-cache.js','utf8');
const native=fs.readFileSync('desktop-lite/MainForm.cs','utf8');
const begin=data.indexOf('let nativeCloudSyncBusy=false;');
const end=data.indexOf('window.Port79DataCache={',begin);
assert(begin>0&&end>begin,'Data cache registers a real native download event handler');
const portion=data.slice(begin,end);
function setup({role='admin',token='VALID',pending=false,behavior='success'}={}){
 const messages=[],progress=[],listeners={},calls=[];
 let resolvePending;
 const held=new Promise(resolve=>{resolvePending=resolve;});
 const window={__port79CachedSessionRefreshPending:pending,chrome:{webview:{postMessage(raw){messages.push(JSON.parse(raw));}}},
  addEventListener(name,cb){listeners[name]=cb;}};
 const sessionStorage={getItem(key){if(key==='port79_user_session')return JSON.stringify({adminRole:role,empId:'TEST'});return null;}};
 const systems=['attendance','workhours','leave','schedule','efficiency','hr','history'];
 const downloadAll=async (cb,options={})=>{
  calls.push('downloadAll');
  if(behavior==='throw')throw Error('test cloud timeout');
  if(behavior==='hold')await held;
  const selected=options.historyOnDemand===true?systems.filter(sys=>sys!=='history'):systems;
  return selected.map((sys,i)=>{
   cb(sys,i,selected.length,'loading');
   cb(sys,i,selected.length,behavior==='partial'&&i===3?'error':'done',behavior==='partial'&&i===3?new Error('cloud error'):null);
   return {system:sys,ok:!(behavior==='partial'&&i===3),error:behavior==='partial'&&i===3?'cloud error':undefined};
  });
 };
 const context={window,sessionStorage,token:()=>token,downloadAll,setProgress:x=>progress.push(x),
  SYSTEM_LABELS:Object.fromEntries(systems.map(x=>[x,x])),JSON,Set,Error,Number,Object,Array,String};
 vm.createContext(context);
 vm.runInContext(portion,context,{timeout:3000});
 return {window,messages,progress,listeners,calls,resolvePending};
}
test('Windows tray reports real 0/6 to 6/6 basic sync with historical months on demand',async()=>{
 const f=setup();
 assert.equal(f.window.__port79NativeCloudSyncReady,true);
 await f.listeners['port79-desktop-force-sync']();
 assert.deepEqual(f.calls,['downloadAll']);
 assert.equal(f.messages[0].kind,'port79-cache-status-v1');
 assert.equal(f.messages[0].phase,'downloading');
 assert.equal(f.messages[0].completed,0);
 assert.equal(f.messages.at(-1).phase,'complete');
 assert.equal(f.messages.at(-1).completed,6);
 assert.equal(f.messages.at(-1).total,6,'A missing historical catalog must not leave a 6/7 startup');
 assert.match(f.messages.at(-1).detail,/歷史資料依月份/);
});
test('not logged in and punch/employee role are rejected before cloud calls',async()=>{
 for(const params of [{token:''},{role:'employee'}]){
  const f=setup(params);await f.listeners['port79-desktop-force-sync']();
  assert.equal(f.calls.length,0);assert.equal(f.messages.at(-1).phase,'failed');
  assert.match(f.messages.at(-1).detail,/管理員登入/);
 }
});
test('login permission verification pending is visible, not a silent click',async()=>{
 const f=setup({pending:true});await f.listeners['port79-desktop-force-sync']();
 assert.equal(f.calls.length,0);assert.equal(f.messages.at(-1).phase,'failed');
 assert.match(f.messages.at(-1).detail,/登入權限正在/);
});
test('two clicks do not start duplicate downloads',async()=>{
 const f=setup({behavior:'hold'});
 const first=f.listeners['port79-desktop-force-sync']();
 const second=f.listeners['port79-desktop-force-sync']();
 await second;assert.equal(f.calls.length,1);assert(f.messages.some(x=>x.phase==='stalled'));
 f.resolvePending();await first;
 assert.equal(f.messages.at(-1).phase,'complete');
});
test('partial and thrown cloud errors display immediately',async()=>{
 for(const behavior of ['partial','throw']){
  const f=setup({behavior});await f.listeners['port79-desktop-force-sync']();
  assert.equal(f.messages.at(-1).phase,behavior==='partial'?'partial':'failed');
  assert.match(f.messages.at(-1).detail,behavior==='partial'?/cloud error/:/test cloud timeout/);
 }
});
test('C# caller must prove listener exists and report errors to existing progress UI',()=>{
 assert.match(native,/cloudWorkerReady/);
 assert.match(native,/await cloudWorker\.CoreWebView2\.ExecuteScriptAsync/);
 assert.match(native,/window\.port79StartCloudSync\(/);
 assert.match(native,/UpdateCacheStatus\(new CacheStatusPayload\{/);
 assert.match(native,/if\(!String\.Equals\(started,"true"/);
});
