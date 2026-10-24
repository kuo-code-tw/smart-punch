const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{webcrypto}=require('crypto');
const source=fs.readFileSync(require('path').join(__dirname,'../assets/port79-data-cache.js'),'utf8');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
function directory(name='79號碼頭雲端資料庫'){
 const files=new Map(),dirs=new Map();let permission='granted',fail=false,writes=0,reads=0;
 return {name,files,dirs,counts:()=>({writes,reads}),setPermission:p=>permission=p,setFailure:v=>fail=v,queryPermission:async()=>permission,requestPermission:async()=>permission,
 async getDirectoryHandle(n,{create=false}={}){if(!dirs.has(n)){if(!create)throw Error('NotFound');dirs.set(n,directory(n))}return dirs.get(n)},
 async getFileHandle(n,{create=false}={}){if(!files.has(n)){if(!create)throw Error('NotFound');files.set(n,'')}return {getFile:async()=>({size:Buffer.byteLength(files.get(n)),text:async()=>{reads++;return files.get(n)}}),createWritable:async()=>{let pending;return {write:async s=>{if(fail)throw Error('disk full');pending=s},close:async()=>{files.set(n,pending);writes++},abort:async()=>{}}}}}
 };
}
function setup({folder=directory(),stores=new Map(),persistent=false,dbFails=false,doc={},timer=setTimeout}={}){
 const ss=storage(),ls=storage();ss.setItem('port79_user_session',JSON.stringify({empId:'A',adminRole:'admin'}));ss.setItem('port79_user_token','TOKEN');
 const db={objectStoreNames:{contains:k=>stores.has(k)},createObjectStore:k=>stores.set(k,new Map()),close(){},transaction(name){const tx={},map=stores.get(name)||new Map();stores.set(name,map);tx.objectStore=()=>({get(key){const req={};queueMicrotask(()=>{req.result=map.get(key);req.onsuccess?.();tx.oncomplete?.()});return req},put(row){map.set(row.key,row);queueMicrotask(()=>tx.oncomplete?.())},getAll(){const req={};queueMicrotask(()=>{req.result=[...map.values()];req.onsuccess?.()});return req},clear(){map.clear();queueMicrotask(()=>tx.oncomplete?.())}});return tx}};
 const window={crypto:webcrypto,navigator:{storage:{persist:async()=>persistent,persisted:async()=>persistent}},fetch:async()=>{throw Error('unexpected cloud write')},showDirectoryPicker:async()=>folder};
 const ctx={window,sessionStorage:ss,localStorage:ls,URL,URLSearchParams,Request,Response,Blob,TextEncoder,Uint8Array,Date,JSON,Map,Set,Promise,console,setTimeout:timer,clearTimeout,document:doc,location:{pathname:'/smart-punch/hr/',href:'https://example.com/smart-punch/hr/'},indexedDB:{open(){const req={};queueMicrotask(()=>{if(dbFails){req.error=Error('quota');req.onerror?.();return}req.result=db;if(!stores.has('settings'))req.onupgradeneeded?.();req.onsuccess?.()});return req}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {api:window.Port79DataCache,stores,folder,ss,window};
}
function noticeDom(){
 const nodes=new Map(),timers=[];
 function element(){return {children:[],attrs:{},style:{},dataset:{},setAttribute(k,v){this.attrs[k]=v;},appendChild(e){this.children.push(e);if(e.id)nodes.set(e.id,e);},querySelector(){return this.children[0];},remove(){nodes.delete(this.id);}};}
 const doc={body:element(),createElement:element,getElementById:id=>nodes.get(id)||null};return{doc,nodes,timers};
}
const row=(version=1,key='A@admin|system|hr')=>({key,kind:'system',system:'hr',savedAt:Date.now()+version-10,size:10,data:{ok:true,version}});
let passed=0;async function test(name,f){await f();passed++;console.log('PASS '+name)}
(async()=>{
 await test('existing snapshots mirror into folder; browser clear recovers exact data',async()=>{const x=setup();await x.api.put(row());await x.api.connectFolder();await x.api.clear();assert.equal((await x.api.get(row().key)).data.version,1);assert.equal(x.folder.dirs.size,1)});
 await test('cleared Chrome storage can reconnect existing folder in a new session',async()=>{const a=setup();await a.api.connectFolder();await a.api.put(row(2));await a.api.flushFolder();const b=setup({folder:a.folder});await b.api.connectFolder();assert.equal((await b.api.get(row().key)).data.version,2)});
 await test('persisted handle reconnects silently when permission remains granted',async()=>{const a=setup();await a.api.connectFolder();await a.api.put(row(3));await a.api.flushFolder();const b=setup({folder:a.folder,stores:a.stores});await b.api.clear();assert.equal((await b.api.get(row().key)).data.version,3)});
 await test('revoked permission falls back safely and does not prompt automatically',async()=>{const x=setup();await x.api.connectFolder();await x.api.put(row());await x.api.flushFolder();await x.api.clear();x.folder.setPermission('prompt');assert.equal(await x.api.get(row().key),null);assert((await x.api.deviceStatus()).folder.includes('重新授權'));await assert.rejects(x.api.reconnectFolder())});
 await test('another signed-in viewer cannot read or mirror old account snapshots',async()=>{const x=setup();await x.api.connectFolder();await x.api.put(row());await x.api.flushFolder();await x.api.clear();x.ss.setItem('port79_user_session',JSON.stringify({empId:'B',adminRole:'admin'}));assert.equal(await x.api.get(row().key),null);await x.api.put(row(4));await x.api.flushFolder();await x.api.clear();assert.equal(await x.api.get('B@admin|system|hr'),null)});
 await test('malformed folder JSON and mismatched request key are ignored',async()=>{const x=setup();await x.api.connectFolder();await x.api.put(row());await x.api.flushFolder();await x.api.clear();const dir=[...x.folder.dirs.values()][0],key=[...dir.files.keys()][0];dir.files.set(key,'{bad');assert.equal(await x.api.get(row().key),null);dir.files.set(key,JSON.stringify({format:'port79-cache',version:1,row:row(1,'A@admin|system|leave')}));assert.equal(await x.api.get(row().key),null)});
 await test('out-of-order responses cannot overwrite newer disk snapshot',async()=>{const x=setup();await x.api.connectFolder();const newer=row(20),older={...row(1),savedAt:newer.savedAt-1000};await x.api.put(newer);await x.api.put(older);await x.api.flushFolder();await x.api.clear();assert.equal((await x.api.get(newer.key)).data.version,20)});
 await test('unavailable IndexedDB still restores from a selected folder',async()=>{const a=setup();await a.api.connectFolder();await a.api.put(row(8));await a.api.flushFolder();const b=setup({folder:a.folder,dbFails:true});await b.api.connectFolder();assert.equal((await b.api.get(row().key)).data.version,8);await b.api.put(row(9));await b.api.flushFolder()});
 await test('disk errors do not fail a successful browser cache save',async()=>{const x=setup();await x.api.connectFolder();const d=await x.folder.getDirectoryHandle('port79-snapshots-v1',{create:true});d.setFailure(true);await x.api.put(row());await x.api.flushFolder();assert((await x.api.deviceStatus()).folder.includes('保存失敗'));assert.equal((await x.api.get(row().key)).data.version,1)});
 await test('disconnect leaves disk files intact and disables later restores',async()=>{const x=setup();await x.api.connectFolder();await x.api.put(row());await x.api.flushFolder();await x.api.disconnectFolder();await x.api.clear();assert.equal(await x.api.get(row().key),null);assert([...x.folder.dirs.values()][0].files.size>0)});
 await test('mobile retain button reports actual browser decision',async()=>{for(const persistent of [false,true]){const x=setup({persistent});delete x.window.showDirectoryPicker;const message=await x.api.retainDeviceData();assert(message.includes(persistent?'已獲准':'尚未同意'));assert.equal((await x.api.deviceStatus()).folderSupported,false)}});
 await test('signed-out sessions cannot connect or restore folder cache',async()=>{const x=setup();x.ss.removeItem('port79_user_token');await assert.rejects(x.api.connectFolder(),/登入/);assert.equal(await x.api.get(row().key),null)});
 await test('schedule preview restores the existing whole-system folder download and selects only requested month',async()=>{
  const a=setup(),data={ok:true,employees:[{empId:'QA',name:'Fixture'}],schedules:[{empId:'QA',month:'2026-10',schedule:{'2026-10-01':'早'}},{empId:'QA',month:'2026-11',schedule:{'2026-11-01':'晚'}}],leaveRecords:[],leaveCoverAssignments:[]};
  await a.api.connectFolder();await a.api.put({key:'A@admin|system|schedule',kind:'system',system:'schedule',savedAt:Date.now()-86400000,size:100,data});await a.api.flushFolder();
  const b=setup({folder:a.folder,stores:a.stores});await b.api.clear();
  const preview=await b.api.getSchedulePreview('2026-10');assert(preview);assert.equal(preview.data.schedules.length,1);assert.equal(preview.data.schedules[0].schedule['2026-10-01'],'早');assert.equal(preview.data.month,'2026-10');
  assert.equal(await b.api.getSchedulePreview('2026-12'),null,'missing month must not use another month');
 });
 await test('successful ordinary roster read stores a detached monthly preview, newer complete download wins',async()=>{
  const x=setup();await x.api.connectFolder();const data={ok:true,employees:[{empId:'QA'}],schedules:[{empId:'QA',month:'2026-10',schedule:{'2026-10-01':'中'}}]};
  const at=Date.now()-1000;assert(await x.api.storeSchedulePreview('2026-10',data,'A@admin','TOKEN',at));data.schedules[0].schedule['2026-10-01']='UNSAVED';
  assert.equal((await x.api.getSchedulePreview('2026-10')).data.schedules[0].schedule['2026-10-01'],'中');
  await x.api.flushFolder();await x.api.clear();assert.equal((await x.api.getSchedulePreview('2026-10')).savedAt,at,'normal read persisted to folder');
  await x.api.put({key:'A@admin|system|schedule',kind:'system',system:'schedule',savedAt:Date.now(),size:100,data:{...data,schedules:[{empId:'QA',month:'2026-10',schedule:{'2026-10-01':'晚'}}]}});
  assert.equal((await x.api.getSchedulePreview('2026-10')).data.schedules[0].schedule['2026-10-01'],'晚');
 });
 await test('schedule preview account and token guards prevent cross-login cache writes',async()=>{
  const x=setup(),data={ok:true,employees:[],schedules:[]};assert.equal(await x.api.storeSchedulePreview('2026-10',data,'B@admin','TOKEN'),false);assert.equal(await x.api.storeSchedulePreview('2026-10',data,'A@admin','OLD'),false);
  assert(await x.api.storeSchedulePreview('2026-10',data,'A@admin','TOKEN'));assert(await x.api.getSchedulePreview('2026-10'),'explicit empty month is a valid cached response');
  x.ss.setItem('port79_user_session',JSON.stringify({empId:'B',adminRole:'admin'}));assert.equal(await x.api.getSchedulePreview('2026-10'),null);
  x.ss.removeItem('port79_user_token');assert.equal(await x.api.getSchedulePreview('2026-10'),null);
 });
 await test('folder permission loss cannot create a fake cached month or a cloud write',async()=>{
  const x=setup();await x.api.connectFolder();await x.api.storeSchedulePreview('2026-10',{ok:true,employees:[],schedules:[]},'A@admin','TOKEN');await x.api.flushFolder();await x.api.clear();x.folder.setPermission('prompt');
  assert.equal(await x.api.getSchedulePreview('2026-10'),null);assert((await x.api.deviceStatus()).folder.includes('重新授權'));
 });
 await test('completed folder backup stays silent; no success popup or acknowledgment button',async()=>{
  const {doc,nodes,timers}=noticeDom(),x=setup({doc});
  await x.api.connectFolder();await x.api.put(row());await x.api.flushFolder();
  assert.equal(nodes.size,0,'disk backup must not create the green success popup');
  assert.equal(timers.length,0);
  assert.equal((await x.api.getFolderSyncStatus()).state,'done','computer status light still shows successful save');
 });
 await test('writes are coalesced by key and repeated identical data does not touch the disk',async()=>{
  const x=setup();await x.api.connectFolder();
  await x.api.put(row(1));await x.api.put(row(2));await x.api.put(row(3));
  const dir=await x.folder.getDirectoryHandle('port79-snapshots-v1',{create:true}),before=dir.counts();
  assert.equal(before.writes,0,'no immediate write during burst');
  assert.equal((await x.api.getFolderSyncStatus()).state,'busy','pending backup is visible as saving');
  await x.api.flushFolder();
  assert.equal(dir.counts().writes,1,'one disk write for three updates to the same key');
  assert.equal((await x.api.getFolderSyncStatus()).state,'done');
  await x.api.put(row(4));await x.api.flushFolder();assert.equal(dir.counts().writes,2);
  const same={...row(5),data:{ok:true,version:4}};
  await x.api.put(same);await x.api.flushFolder();
  assert.equal(dir.counts().writes,2,'unchanged snapshot does not write again');
 });
 await test('failed close, failed write and revoked permission never claim disk-save success',async()=>{
  for(const mode of ['write','close','permission']){
   const {doc,nodes,timers}=noticeDom(),x=setup({doc,timer:fn=>{timers.push(fn);return timers.length}});await x.api.connectFolder();
   const d=await x.folder.getDirectoryHandle('port79-snapshots-v1',{create:true});
   if(mode==='write')d.setFailure(true);
   if(mode==='close'){const original=d.getFileHandle;d.getFileHandle=async(...args)=>{const h=await original(...args),open=h.createWritable;h.createWritable=async()=>{const w=await open();w.close=async()=>{throw Error('close failed')};return w;};return h;};}
   if(mode==='permission')x.folder.setPermission('prompt');
   await x.api.put(row());await x.api.flushFolder();assert.equal(nodes.size,0,mode);assert.equal(timers.length,0,mode);
  }
 });
 await test('raw export cache persists to the existing folder and restores after browser storage is cleared',async()=>{
  const x=setup();await x.api.connectFolder();const month='2026-10',data={ok:true,month,records:[{empId:'A',timeStr:'2026/10/01 08:00'}]};
  assert(await x.api.storeExportSnapshot('getAttendanceMonthRaw',month,data,'A@admin','TOKEN'));await x.api.flushFolder();await x.api.clear();
  const hit=await x.api.getExportSnapshot('getAttendanceMonthRaw',month);assert.equal(hit.data.records[0].timeStr,'2026/10/01 08:00');assert(hit.savedAt>0);
  x.ss.setItem('port79_user_session',JSON.stringify({empId:'B',adminRole:'admin'}));assert.equal(await x.api.getExportSnapshot('getAttendanceMonthRaw',month),null);
 });
 await test('complete downloaded database supplies only the requested month; partial month data is never a raw export',async()=>{
  const x=setup(),key='A@admin|system|attendance',month='2026-10';
  await x.api.put({key,kind:'system',system:'attendance',savedAt:Date.now(),data:{ok:true,fullDatabase:true,months:[month],monthStats:[{month,ok:true}],records:[{timeStr:'115/10/01 08:00'},{timeStr:'2026/09/30 23:30'}]}});
  assert.equal((await x.api.getExportSnapshot('getAttendanceMonthRaw',month)).data.records.length,1);assert.equal(await x.api.getExportSnapshot('getAttendanceMonthRaw','2026-09'),null);
  await x.api.put({key,kind:'system',system:'attendance',savedAt:Date.now(),data:{ok:true,month,records:[]}});assert.equal(await x.api.getExportSnapshot('getAttendanceMonthRaw',month),null);
 });
 await test('local mutations and changed credentials invalidate export snapshots',async()=>{
  const x=setup(),month='2026-10',data={ok:true,month,records:[]};
  assert.equal(await x.api.storeExportSnapshot('getAttendanceMonthRaw',month,data,'A@admin','OLD'),false);
  assert(await x.api.storeExportSnapshot('getAttendanceMonthRaw',month,data,'A@admin','TOKEN',Date.now()-1000));
  x.ss.setItem('port79_cache_mutated_at',String(Date.now()));assert.equal(await x.api.getExportSnapshot('getAttendanceMonthRaw',month),null);
  assert.equal(await x.api.storeExportSnapshot('getAttendanceMonthRaw',month,data,'A@admin','TOKEN',Date.now()-2000),false);
 });
 await test('a newly downloaded complete database supersedes an older export snapshot',async()=>{
  const x=setup(),month='2026-10',stamp=Date.now();
  assert(await x.api.storeExportSnapshot('getAttendanceMonthRaw',month,{ok:true,month,records:[{id:'old'}]},'A@admin','TOKEN',stamp-1000));
  await x.api.put({key:'A@admin|system|attendance',kind:'system',system:'attendance',savedAt:stamp,data:{ok:true,fullDatabase:true,months:[month],monthStats:[{month,ok:true}],records:[{id:'new',timeStr:'2026/10/01 08:00'}]}});
  assert.equal((await x.api.getExportSnapshot('getAttendanceMonthRaw',month)).data.records[0].id,'new');
 });
 await test('computer light distinguishes unconnected, connected and an actually completed disk write',async()=>{
  const x=setup();assert.equal((await x.api.getFolderSyncStatus()).state,'idle');await x.api.connectFolder();
  let state=await x.api.getFolderSyncStatus();assert.equal(state.label,'已連接，待保存');assert.equal(state.savedAt,0);
  await x.api.put(row());await x.api.flushFolder();state=await x.api.getFolderSyncStatus();assert.equal(state.state,'done');assert(state.savedAt>0);
  const fresh=setup({folder:x.folder,stores:x.stores});assert.equal((await fresh.api.getFolderSyncStatus()).savedAt,state.savedAt,'same authorized folder retains last actual save time after reload');
  await x.api.disconnectFolder();assert.equal((await x.api.getFolderSyncStatus()).label,'未連接');
 });
 await test('pending close stays busy; failed close stays red even if another file saves',async()=>{
  const x=setup();await x.api.connectFolder();const d=await x.folder.getDirectoryHandle('port79-snapshots-v1',{create:true}),original=d.getFileHandle;let release,entered;
  const waiting=new Promise(r=>entered=r);d.getFileHandle=async(...args)=>{const h=await original(...args),open=h.createWritable;h.createWritable=async()=>{const w=await open(),close=w.close;w.close=async()=>{entered();await new Promise(r=>release=r);await close()};return w;};return h;};
  await x.api.put(row());const pending=x.api.flushFolder();await waiting;let status=await x.api.getFolderSyncStatus();assert.equal(status.state,'busy');assert.equal(status.savedAt,0);release();await pending;assert.equal((await x.api.getFolderSyncStatus()).state,'done');
  d.getFileHandle=async(...args)=>{const h=await original(...args),open=h.createWritable;h.createWritable=async()=>{const w=await open();w.close=async()=>{throw Error('disk close failed')};return w;};return h;};
  await x.api.put(row(2));await x.api.flushFolder();assert.equal((await x.api.getFolderSyncStatus()).state,'error');
  d.getFileHandle=original;await x.api.put(row(3,'A@admin|system|leave'));await x.api.flushFolder();assert.equal((await x.api.getFolderSyncStatus()).state,'error','a different file succeeding cannot mask a failed snapshot');
  await x.api.put(row(4));await x.api.flushFolder();assert.equal((await x.api.getFolderSyncStatus()).state,'done','successful retry of the failed snapshot clears its error');
 });
 await test('permission loss, account switches and a different folder cannot inherit a green light',async()=>{
  const x=setup();await x.api.connectFolder();await x.api.put(row());await x.api.flushFolder();x.folder.setPermission('prompt');assert.equal((await x.api.getFolderSyncStatus()).state,'permission');
  x.folder.setPermission('granted');x.ss.setItem('port79_user_session',JSON.stringify({empId:'B',adminRole:'admin'}));assert.equal((await x.api.getFolderSyncStatus()).savedAt,0);
  x.ss.setItem('port79_user_session',JSON.stringify({empId:'A',adminRole:'admin'}));const other=directory('另一個資料夾');x.window.showDirectoryPicker=async()=>other;await x.api.clear();await x.api.connectFolder();assert.equal((await x.api.getFolderSyncStatus()).savedAt,0);
 });
 console.log(JSON.stringify({passed,scope:'Simulated folder permissions, IndexedDB resets and disk failures; no cloud data'}));
})().catch(e=>{console.error(e);process.exitCode=1});
