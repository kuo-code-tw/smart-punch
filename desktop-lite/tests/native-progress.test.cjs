'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/login-progress.js'),'utf8');
const nativeSource=fs.readFileSync(path.join(__dirname,'../MainForm.cs'),'utf8');

async function eventLoop(){await new Promise(resolve=>setImmediate(resolve));}
function fixture(){
 let shown=false,role='',token='',online=true,downloads=0,behavior='success',nowMs=1000000,hasLocalCache=false;
 let onTick,initialTick;
 const events=new Map(),received=[],elements=new Map();
 const document={
  body:{append(node){if(node.id)elements.set(node.id,node)}},
  getElementById(id){
   return id==='systems'?{classList:{contains(name){return name==='show'&&shown}}}:elements.get(id)||null;
  },
  createElement(tag){
   return {tag,style:{},children:[],id:'',textContent:'',
    setAttribute(){},addEventListener(){},
    append(node){this.children.push(node)},
    querySelector(selector){
     const i=selector==='.p79-desktop-label'?0:selector==='.p79-desktop-detail'?1:2;
     return this.children[i];
    }
   };
  }
 };
 const sessionStorage={getItem(name){
  if(name==='port79_user_session')return role?JSON.stringify({empId:'USER',adminRole:role,dataScope:{group:'A'}}):null;
  if(name==='port79_user_token')return token;
  return null;
 }};
 const cache={
  async downloadAll(cb){
   downloads++;
   if(behavior==='stall'){cb('attendance',0,7,'loading');return new Promise(()=>{});}
   const names=['attendance','workhours','leave','schedule','efficiency','hr','history'];
   return names.map((sys,i)=>{
    cb(sys,i,7,'loading');
    if(sys==='attendance')cb(sys,i,7,'detail',null,'讀取 2026-10 2/12');
    const fail=behavior==='partial'&&sys==='history';
    cb(sys,i,7,fail?'error':'done',fail?new Error('test failure'):null);
    return {system:sys,ok:!fail};
   });
  },
  async getSystemSnapshot(sys){return {size:sys==='attendance'?1048576:2048,savedAt:hasLocalCache?nowMs:0};},
  async getFolderSyncStatus(){return {state:'idle',label:'未連接'};}
 };
 const window={
  chrome:{webview:{postMessage(raw){received.push(JSON.parse(raw));}}},
  Port79DataCache:cache,
  addEventListener(type,fn){events.set(type,fn);}
 };
 const navigator={get onLine(){return online}};
 const localStorage={getItem(){return null},setItem(){}};
 const clock=class extends Date{static now(){return nowMs;}};
 const ctx={window,document,navigator,sessionStorage,localStorage,Date:clock,JSON,console,
  setInterval(fn){onTick=fn;return 1},
  setTimeout(fn){initialTick=fn;return 1},
  clearInterval(){}};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 return {events,received,cache,async tick(){onTick();await eventLoop()},async initial(){initialTick();await eventLoop()},
   get downloads(){return downloads},setAuth(r,s=true,t='TOKEN'){role=r;shown=s;token=t},
   setOnline(value){online=value},setBehavior(value){behavior=value},advance(ms){nowMs+=ms},setCached(value){hasLocalCache=value}};
}
test('permanently visible native bar receives true module and month progress only after manager login',async()=>{
 const x=fixture();
 assert.equal(x.received[0].phase,'idle');
 assert.equal(x.received[0].completed,0);
 assert.equal(x.downloads,0);
 await x.initial();await x.tick();assert.equal(x.downloads,0);
 x.setAuth('employee');await x.tick();assert.equal(x.downloads,0);
 x.setAuth('admin',false);await x.tick();assert.equal(x.downloads,0);
 x.setAuth('admin',true,'');await x.tick();assert.equal(x.downloads,0);
 x.setAuth('admin');x.setOnline(false);await x.tick();assert.equal(x.downloads,0);
 assert(x.received.some(v=>v.phase==='waiting'&&/離線/.test(v.title)));
 x.setOnline(true);await x.tick();await eventLoop();
 assert.equal(x.downloads,1);
 assert(x.received.some(v=>v.phase==='downloading'&&/2026-10 2\/12/.test(v.detail)),
  'Must show the real downloaded attendance month');
 assert(x.received.some(v=>v.phase==='downloading'&&v.completed>0&&v.completed<7),
  'Native bar must receive intermediate completion counts');
 const final=x.received.at(-1);
 assert.equal(final.kind,'port79-cache-status-v1');
 assert.equal(final.phase,'complete');
 assert.equal(final.completed,7);
 assert.match(final.detail,/7／7/);
 assert.match(final.detail,/1\.01 MB|1\.02 MB|1\.00 MB/);
 assert(!JSON.stringify(x.received).includes('TOKEN'),'No login token may be sent to native bridge');
 await x.tick();assert.equal(x.downloads,1,'Must not redownload after completed batch');
 x.events.get('port79-desktop-force-sync')();await eventLoop();assert.equal(x.downloads,2,'Explicit tray retry must work');
 x.setAuth('');await x.tick();assert.equal(x.received.at(-1).phase,'idle','Logout resets persistent native display');
});
test('explicit retry displays errors without fake success when one module fails',async()=>{
 const x=fixture();x.setAuth('superadmin');x.setBehavior('partial');
 await x.tick();await eventLoop();
 assert.equal(x.downloads,1);
 const last=x.received.at(-1);
 assert.equal(last.phase,'partial');
 assert.equal(last.completed,6,'Failed module must not count as downloaded');
 assert.match(last.detail,/成功 6／7，失敗 1 項/);
 assert.match(last.detail,/第一個錯誤：歷史資料：test failure/);
 assert(x.received.some(v=>v.detail?.includes('（失敗）')));
 await x.tick();assert.equal(x.received.at(-1).phase,'partial','Failed state remains visible until user retries');
});
test('cloud timeout heartbeat makes stalled first month visible without fake 100%, and page switch reports interruption',async()=>{
 const x=fixture();x.setAuth('admin');x.setBehavior('stall');
 await x.tick();assert.equal(x.downloads,1);
 x.advance(15000);await x.tick();
 assert.equal(x.received.at(-1).phase,'downloading');
 assert.match(x.received.at(-1).detail,/已等待 15 秒/);
 assert.equal(x.received.at(-1).completed,0,'Heartbeat must never pretend a month or system finished');
 x.advance(72000);await x.tick();
 assert.equal(x.received.at(-1).phase,'stalled');
 assert.match(x.received.at(-1).detail,/已等待 87 秒/);
 x.events.get('pagehide')();
 assert.equal(x.received.at(-1).phase,'interrupted','Navigate away must disclose interrupted download');
 assert.equal(x.received.at(-1).completed,0);
});
test('installed Windows cache is automatically recognized without asking to pick folder',async()=>{
 const x=fixture();
 const original=await x.cache.getFolderSyncStatus();
 assert.equal(original.label,'未連接','No login still uses original security state');
 x.setAuth('admin');
 const initial=await x.cache.getFolderSyncStatus();
 assert.equal(initial.label,'已連接，待下載');
 assert.equal(initial.folder,'Windows local-data/BrowserProfile');
 assert.equal(initial.state,'idle');
 x.setCached(true);
 const saved=await x.cache.getFolderSyncStatus();
 assert.equal(saved.state,'done');
 assert.equal(saved.label,'本機快取已保存');
 assert.equal(saved.savedAt,1000000);
});
test('native WinForms integration shows status permanently and in tray without accepting commands',()=>{
 assert.match(nativeSource,/Dock=DockStyle.Bottom,Height=74/);
 assert.match(nativeSource,/cacheBar\.Value=completed/);
 assert.match(nativeSource,/ProgressBarStyle.Marquee/);
 assert.match(nativeSource,/cacheInProgress/);
 assert.match(nativeSource,/cacheStatusMenu\.Text=/);
 assert.match(nativeSource,/Settings\.IsWebMessageEnabled=true/);
 assert.match(nativeSource,/WebMessageReceived\+=OnCacheMessage/);
 assert.match(nativeSource,/source\.Host\.Equals\(Host/);
 assert.match(nativeSource,/payload\.kind!="port79-cache-status-v1"/);
 assert.match(nativeSource,/TryGetWebMessageAsString/);
 assert.match(nativeSource,/private void UpdateCacheStatus/);
 assert(!nativeSource.includes('ExecuteScriptAsync("window.Port79DataCache.downloadAll()'));
});
