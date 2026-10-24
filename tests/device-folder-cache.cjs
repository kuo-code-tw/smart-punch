const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{webcrypto}=require('crypto');
const source=fs.readFileSync(require('path').join(__dirname,'../assets/port79-data-cache.js'),'utf8');
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}};
function directory(name='79號碼頭雲端資料庫'){
 const files=new Map(),dirs=new Map();let permission='granted',fail=false;
 return {name,files,dirs,setPermission:p=>permission=p,setFailure:v=>fail=v,queryPermission:async()=>permission,requestPermission:async()=>permission,
 async getDirectoryHandle(n,{create=false}={}){if(!dirs.has(n)){if(!create)throw Error('NotFound');dirs.set(n,directory(n))}return dirs.get(n)},
 async getFileHandle(n,{create=false}={}){if(!files.has(n)){if(!create)throw Error('NotFound');files.set(n,'')}return {getFile:async()=>({size:Buffer.byteLength(files.get(n)),text:async()=>files.get(n)}),createWritable:async()=>{let pending;return {write:async s=>{if(fail)throw Error('disk full');pending=s},close:async()=>{files.set(n,pending)},abort:async()=>{}}}}}
 };
}
function setup({folder=directory(),stores=new Map(),persistent=false,dbFails=false}={}){
 const ss=storage(),ls=storage();ss.setItem('port79_user_session',JSON.stringify({empId:'A',adminRole:'admin'}));ss.setItem('port79_user_token','TOKEN');
 const db={objectStoreNames:{contains:k=>stores.has(k)},createObjectStore:k=>stores.set(k,new Map()),close(){},transaction(name){const tx={},map=stores.get(name)||new Map();stores.set(name,map);tx.objectStore=()=>({get(key){const req={};queueMicrotask(()=>{req.result=map.get(key);req.onsuccess?.();tx.oncomplete?.()});return req},put(row){map.set(row.key,row);queueMicrotask(()=>tx.oncomplete?.())},getAll(){const req={};queueMicrotask(()=>{req.result=[...map.values()];req.onsuccess?.()});return req},clear(){map.clear();queueMicrotask(()=>tx.oncomplete?.())}});return tx}};
 const window={crypto:webcrypto,navigator:{storage:{persist:async()=>persistent,persisted:async()=>persistent}},fetch:async()=>{throw Error('unexpected cloud write')},showDirectoryPicker:async()=>folder};
 const ctx={window,sessionStorage:ss,localStorage:ls,URL,URLSearchParams,Request,Response,Blob,TextEncoder,Uint8Array,Date,JSON,Map,Set,Promise,console,setTimeout,clearTimeout,document:{},location:{pathname:'/smart-punch/hr/',href:'https://example.com/smart-punch/hr/'},indexedDB:{open(){const req={};queueMicrotask(()=>{if(dbFails){req.error=Error('quota');req.onerror?.();return}req.result=db;if(!stores.has('settings'))req.onupgradeneeded?.();req.onsuccess?.()});return req}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);return {api:window.Port79DataCache,stores,folder,ss,window};
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
 console.log(JSON.stringify({passed,scope:'Simulated folder permissions, IndexedDB resets and disk failures; no cloud data'}));
})().catch(e=>{console.error(e);process.exitCode=1});
