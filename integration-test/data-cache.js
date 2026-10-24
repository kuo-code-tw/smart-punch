(function(){
'use strict';
if(window.Port79DataCache)return;

const DB_NAME='port79-system-cache-v1';
const DB_VERSION=2;
const STORE='snapshots';
const SETTINGS='settings';
const FOLDER_LABEL='79號碼頭雲端資料庫';
const CANONICAL_GAS_URL='https://script.google.com/macros/s/AKfycbzPD0v8QQol_7cMuMUFGnjHxo-9jFnRLEwoWQhW-n3g5GlbbHnaL7EhRAtcymUcdYOEzg/exec';
const DOWNLOAD_TIMEOUT_MS=60000;
let recoveredGasUrl='';
let folderHandle=null,folderLoaded=false,folderLoading=null,folderMessage='尚未連接電腦資料夾';
let folderWrites=Promise.resolve();

// PORT79 FAST CORE V2:
// 1) IndexedDB connection reuse
// 2) memory front-cache
// 3) duplicate GET coalescing
// 4) short fresh-cache TTL by endpoint
// 5) 250ms stale fallback instead of waiting ~1s
// 6) mutation stamp invalidates stale read cache
// 7) XLSX loads only when import/export is actually used
const MAX_FALLBACK_AGE_MS=3*60*1000;
const NETWORK_GRACE_MS=250;
const READ_ACTIONS=new Set([
 'getAttendanceCoreData','getAttendanceMonthData','getAttendanceMonths','getAttendanceEmployeeMaster','getAttendanceMainDirect',
 'getLeaveData','getScheduleDataSecure','getScheduleData','getData','gcGetData','getHistoricalDataCatalog',
 'historyGetMonthData','hrGetEmployees','getEmployeeSnapshot'
]);
const SYSTEM_LABELS={attendance:'考勤',workhours:'工時統計',leave:'請假',schedule:'排班',efficiency:'效率',hr:'人資',history:'歷史資料'};
const memoryCache=new Map();
// Explicit management opt-in; punch-only sessions keep their current cache behavior.
const MANAGEMENT_MEMORY_MAX_ENTRIES=12;
const MANAGEMENT_MEMORY_MAX_PAYLOAD_BYTES=8*1024*1024;
const memoryWeights=new Map();
let memoryPayloadBytes=0;
function boundedManagementMemory(){
 if(window.P79ManagementTestMode!==true&&window.P79ManagementOptimizationMode!==true)return false;
 try{
  const s=JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null');
  return s?.punchOnly!==true&&['admin','superadmin'].includes(String(s?.adminRole||s?.role||'').toLowerCase());
 }catch(_){return false;}
}
function forgetMemory(key){
 memoryCache.delete(key);
 if(memoryWeights.has(key)){memoryPayloadBytes-=memoryWeights.get(key);memoryWeights.delete(key);}
}
function memoryPayloadSize(row){
 const size=Number(row?.size);
 // Snapshot producers already measure serialized payload size; reuse it instead of serializing each hit.
 return Number.isFinite(size)&&size>=0?size:safeSize(row?.data??row);
}
function trimManagementMemory(){
 // Account for snapshots admitted before the management session became available.
 for(const [key,row] of memoryCache)if(!memoryWeights.has(key)){
  const size=memoryPayloadSize(row);memoryWeights.set(key,size);memoryPayloadBytes+=size;
 }
 while(memoryCache.size>MANAGEMENT_MEMORY_MAX_ENTRIES||memoryPayloadBytes>MANAGEMENT_MEMORY_MAX_PAYLOAD_BYTES){
  forgetMemory(memoryCache.keys().next().value);
 }
}
function rememberMemory(row){
 if(!row?.key)return;
 const bounded=boundedManagementMemory();
 forgetMemory(row.key);
 if(bounded){
  const size=memoryPayloadSize(row);
  // Large snapshots still persist in IndexedDB and are returned to their caller.
  if(size>MANAGEMENT_MEMORY_MAX_PAYLOAD_BYTES){trimManagementMemory();return;}
  memoryWeights.set(row.key,size);memoryPayloadBytes+=size;
 }
 memoryCache.set(row.key,row);
 if(bounded)trimManagementMemory();
}
function recallMemory(key){
 const bounded=boundedManagementMemory();if(bounded)trimManagementMemory();
 const row=memoryCache.get(key);
 if(row&&bounded){memoryCache.delete(key);memoryCache.set(key,row);}
 return row;
}
function clearMemory(){memoryCache.clear();memoryWeights.clear();memoryPayloadBytes=0;}
window.addEventListener?.('pagehide',()=>{if(boundedManagementMemory())clearMemory();});
const inflightReads=new Map();
const readVersions=new Map();
let startupPreview=null;
let dbPromise=null;
let mutationGeneration=0;

function currentSystem(){
 const p=location.pathname.toLowerCase();
 if(p.includes('/work-hours/'))return 'workhours';if(p.includes('/attendance/'))return 'attendance';
 if(p.includes('/leave/'))return 'leave';if(p.includes('/schedule/'))return 'schedule';
 if(p.includes('/aqc-efficiency/'))return 'efficiency';if(p.includes('/hr/'))return 'hr';
 if(p.includes('/history-data/'))return 'history';return 'attendance';
}
function token(){
 try{const active=window.P79ManagementContext?.token?.();if(active)return String(active).trim()}catch(_){}
 try{return String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||sessionStorage.getItem('port79_gc_superadmin_token')||'').trim()}catch(e){return''}
}
function viewerKey(){
 try{
  const s=JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null');
  const id=String(s?.empId||sessionStorage.getItem('aqc_admin_id')||sessionStorage.getItem('port79_leave_emp_id')||'guest').trim().toUpperCase()||'guest';
  const role=String(s?.adminRole||s?.role||sessionStorage.getItem('aqc_admin_role')||'employee').toLowerCase();
  return id+'@'+role;
 }catch(e){return 'guest@employee'}
}
function gasUrl(){
 if(recoveredGasUrl)return recoveredGasUrl;
 try{const active=window.P79ManagementContext?.gas?.();if(validDownloadGasUrl(active))return String(active).trim()}catch(_){}
 try{if(typeof GAS_URL!=='undefined'&&GAS_URL)return String(GAS_URL)}catch(e){}
 try{if(window.GAS_URL)return String(window.GAS_URL)}catch(e){}
 try{for(const k of ['port79_gas_url','gasUrl','GAS_URL']){const v=sessionStorage.getItem(k)||localStorage.getItem(k);if(v&&/script\.google\.com/i.test(v))return v}}catch(e){}
 return '';
}
function validDownloadGasUrl(value){try{const u=new URL(String(value||'').trim());return u.origin==='https://script.google.com'&&/^\/macros\/s\/[\w-]+\/exec$/.test(u.pathname)}catch(_){return false}}
function ymNow(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function openDb(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});if(!db.objectStoreNames.contains(SETTINGS))db.createObjectStore(SETTINGS,{keyPath:'key'})};
  r.onblocked=()=>{setProgress('請關閉其他舊版系統分頁，再重新開啟。')};
  r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{try{db.close()}catch(e){}dbPromise=null};resolve(db)};
  r.onerror=()=>{dbPromise=null;reject(r.error)};
 });
 return dbPromise;
}
async function put(row){
 rememberMemory(row);
 const disk=mirrorSnapshot(row);
 try{await putLocal(row);return true}catch(error){if(await disk)return true;throw error}
}
async function putLocal(row){
 const db=await openDb();
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(row);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
}
async function get(key){
 const cached=recallMemory(key);if(cached)return cached;
 let row=null;
 try{const db=await openDb();row=await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}catch(_){}
 if(!row)row=await readFolderSnapshot(key);
 if(row)rememberMemory(row);
 return row;
}

// A folder is a read-cache mirror, never an upload queue or a source of cloud writes.
// Only snapshots for the signed-in viewer and exact request key may be restored.
async function folderSetting(value){
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(SETTINGS,value===undefined?'readonly':'readwrite'),s=tx.objectStore(SETTINGS);
  if(value===undefined){const r=s.get('folder');r.onsuccess=()=>resolve(r.result?.handle||null);r.onerror=()=>reject(r.error)}
  else{s.put({key:'folder',handle:value});tx.oncomplete=()=>resolve(true)}
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
async function loadFolder(){
 if(folderLoading)await folderLoading;
 if(!folderLoaded){folderLoading=(async()=>{try{folderHandle=await folderSetting()}catch(_){}finally{folderLoaded=true;folderLoading=null}})();await folderLoading}
 return folderHandle;
}
async function allowedFolder(){
 const h=await loadFolder();if(!h)return null;
 try{if(await h.queryPermission({mode:'readwrite'})==='granted')return h;
  folderMessage='資料夾需要重新授權，請按「重新授權資料夾」';
 }catch(_){folderMessage='資料夾暫時無法存取，請重新選擇'}
 return null;
}
async function folderFilename(key){
 const hash=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')+'.json';
}
async function snapshotDirectory(handle,create=false){return handle.getDirectoryHandle('port79-snapshots-v1',{create})}
function currentViewerRow(row){return !!token()&&row?.key?.startsWith(viewerKey()+'|')&&['api','system'].includes(row.kind)&&row.data&&Number.isFinite(row.savedAt)}
function mirrorSnapshot(row){
 // Serialize writes so an older response cannot finish after a newer snapshot.
 const task=folderWrites.then(async()=>{
  if(!currentViewerRow(row))return false;
  const handle=await allowedFolder();if(!handle)return false;
  const dir=await snapshotDirectory(handle,true),name=await folderFilename(row.key);
  try{const old=JSON.parse(await(await(await dir.getFileHandle(name)).getFile()).text());if(old?.row?.key===row.key&&old.row.savedAt>row.savedAt)return true}catch(_){}
  const file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable();
  try{await writer.write(JSON.stringify({format:'port79-cache',version:1,row}));await writer.close()}
  catch(error){try{await writer.abort()}catch(_){}throw error}
  folderMessage='已連接：'+handle.name+'；讀取資料會自動保存至電腦';return true;
 }).catch(error=>{folderMessage='資料夾保存失敗：'+String(error?.message||error);return false});
 folderWrites=task;return task;
}
async function readFolderSnapshot(key){
 if(!token()||!key.startsWith(viewerKey()+'|'))return null;
 try{
  const handle=await allowedFolder();if(!handle)return null;
  const dir=await snapshotDirectory(handle),file=await(await dir.getFileHandle(await folderFilename(key))).getFile();
  if(file.size>64*1024*1024)return null;
  const doc=JSON.parse(await file.text()),row=doc?.row;
  if(doc.format!=='port79-cache'||doc.version!==1||row?.key!==key||!currentViewerRow(row)||row.savedAt>Date.now()+60000)return null;
  await putLocal(row).catch(()=>{});return row;
 }catch(_){return null}
}
async function connectFolder(){
 if(!token())throw new Error('請先登入系統');
 if(typeof window.showDirectoryPicker!=='function')throw new Error('此裝置請使用「保留手機／瀏覽器資料」');
 // Keep the picker as the first awaited operation to preserve user activation.
 const selected=await window.showDirectoryPicker({id:'port79-cloud-cache',mode:'readwrite',startIn:'documents'});
 folderHandle=selected;folderLoaded=true;
 let remembered=true;try{await folderSetting(selected)}catch(_){remembered=false}
 const rows=await all().catch(()=>[]);let saved=0,failed=0;
 for(const row of rows)if(currentViewerRow(row)){if(await mirrorSnapshot(row))saved++;else failed++}
 const writable=await allowedFolder();if(!writable)throw new Error(folderMessage);
 if(failed)throw new Error('已連接資料夾，但有 '+failed+' 份快取保存失敗；請確認硬碟空間與權限');
 folderMessage='已連接：'+selected.name+'；已保存 '+saved+' 份快取'+(remembered?'':'；此分頁關閉後需重新選擇');
 return folderMessage;
}
async function reconnectFolder(){
 const h=await loadFolder();if(!h)return connectFolder();
 if(await h.requestPermission({mode:'readwrite'})!=='granted')throw new Error('尚未授權資料夾，仍使用瀏覽器快取');
 folderMessage='已重新連接：'+h.name;return folderMessage;
}
async function disconnectFolder(){
 await folderWrites;folderHandle=null;folderLoaded=true;
 await folderSetting(null).catch(()=>{});folderMessage='已停止使用資料夾；硬碟檔案仍保留';return folderMessage;
}
async function retainDeviceData(){
 const storage=window.navigator?.storage;
 if(!storage?.persist) return '此瀏覽器未提供保留資料功能；仍可使用本機快取';
 const granted=await storage.persist();
 return granted?'已獲准保留本機資料；手動清除網站資料仍會刪除快取':'瀏覽器尚未同意保留；仍可使用快取，建議加入主畫面後再試';
}
async function deviceStatus(){
 const h=await allowedFolder();
 if(h&&(folderMessage==='尚未連接電腦資料夾'||folderMessage.startsWith('資料夾需要重新授權')))folderMessage='已連接：'+h.name;
 let retained=false;try{retained=await window.navigator?.storage?.persisted?.()}catch(_){}
 return {folderSupported:typeof window.showDirectoryPicker==='function',folder:folderMessage,retained:!!retained};
}
async function all(){
 const db=await openDb();
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)});
}
async function managementSystemMetadata(){
 const db=await openDb(),viewer=viewerKey();
 return new Promise((resolve,reject)=>{
  const rows=[],tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);
  tx.oncomplete=()=>resolve(rows);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('快取清單讀取中止'));
  // The management summary needs seven current-viewer headers, not every historical payload.
  Object.keys(SYSTEM_LABELS).forEach(system=>{
   const request=store.get(viewer+'|system|'+system);
   request.onsuccess=()=>{
    const r=request.result;if(!r)return;
    rows.push({key:r.key,kind:r.kind,system:r.system,savedAt:r.savedAt,size:r.size});
   };
   request.onerror=()=>reject(request.error);
  });
 });
}
async function clear(){
 clearMemory();
 const db=await openDb();
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)});
}
function safeSize(obj){try{return new Blob([JSON.stringify(obj)]).size}catch(e){return 0}}
function fmtBytes(n){n=Number(n||0);if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1)+' KB';return (n/1024/1024).toFixed(2)+' MB'}
function fmtTime(ts){if(!ts)return'尚未下載';try{return new Date(ts).toLocaleString('zh-TW',{hour12:false})}catch(e){return String(ts)}}
function urlInfo(urlLike){
 try{
  const u=new URL(String(urlLike),location.href);
  return {u,action:u.searchParams.get('action')||''};
 }catch(e){return {u:null,action:''}}
}
function actionKey(urlLike){
 const {u,action}=urlInfo(urlLike);
 if(!u||!READ_ACTIONS.has(action))return null;
 const params=new URLSearchParams(u.searchParams);
 ['token','userToken','gcToken','adminToken','t','_','ts','fresh'].forEach(k=>params.delete(k));
 params.sort();
 return viewerKey()+'|api|'+u.origin+u.pathname+'?'+params;
}
function systemKey(sys){return viewerKey()+'|system|'+sys}
function mutationStamp(){
 try{return Number(sessionStorage.getItem('port79_cache_mutated_at')||0)}catch(e){return 0}
}
function markMutation(){
 const now=Math.max(Date.now(),mutationStamp()+1);
 mutationGeneration++;
 try{sessionStorage.setItem('port79_cache_mutated_at',String(now))}catch(e){}
 clearMemory();
 inflightReads.clear();
}
function cacheFreshTtl(action,urlLike){
 const {u}=urlInfo(urlLike);
 if(action==='getAttendanceEmployeeMaster'||action==='hrGetEmployees'||action==='getEmployeeSnapshot')return 30000;
 if(action==='getAttendanceMonths'||action==='getHistoricalDataCatalog')return 60000;
 if(action==='historyGetMonthData')return 120000;
 if(action==='getAttendanceMonthData'){
  const m=u?.searchParams.get('month')||'';
  return m&&m!==ymNow()?60000:3000;
 }
 if(action==='getScheduleDataSecure'||action==='getLeaveData'||action==='gcGetData')return 5000;
 if(action==='getAttendanceCoreData'||action==='getAttendanceMainDirect'||action==='getData'||action==='getScheduleData')return 2000;
 return 0;
}
function requestAction(input,init){
 try{
  const method=String(init?.method||'GET').toUpperCase();
  if(method==='GET')return urlInfo(typeof input==='string'?input:input?.url).action;
  const b=init?.body;
  if(typeof b==='string'){
   try{return String(JSON.parse(b)?.action||'')}catch(e){}
   try{return String(new URLSearchParams(b).get('action')||'')}catch(e){}
  }
 }catch(e){}
 return '';
}
function isMutationAction(action){
 const a=String(action||'');
 if(!a)return false;
 if(/^(ping|deploymentCheck|verify|login|lookup|get|gcGet|historyGet)/i.test(a))return false;
 if(/Lock|Heartbeat/i.test(a))return false;
 return /save|sync|add|create|update|delete|remove|reset|approve|reject|punch|clock|leave|import|upsert|set/i.test(a);
}

async function getSystemSnapshot(sys){
 if(!token())return null;
 const viewer=viewerKey(),credential=token();
 const row=await get(systemKey(sys));
 return viewer===viewerKey()&&credential===token()&&row&&currentViewerRow(row)&&row.data?row:null;
}
// Explicit read-only roster previews: ordinary authoritative fetches still bypass cache.
function schedulePreviewData(data,month,scoped=false){
 if(!data||data.ok!==true||!Array.isArray(data.employees)||!Array.isArray(data.schedules))return null;
 if(data.month&&String(data.month)!==month)return null;
 const schedules=data.schedules.filter(row=>row&&String(row.month||'')===month&&row.schedule&&typeof row.schedule==='object'&&!Array.isArray(row.schedule));
 if(!scoped&&!schedules.length)return null;
 if(scoped&&schedules.length!==data.schedules.length)return null;
 return {ok:true,month,employees:data.employees,schedules,
  leaveRecords:Array.isArray(data.leaveRecords)?data.leaveRecords:[],
  leaveCoverAssignments:Array.isArray(data.leaveCoverAssignments)?data.leaveCoverAssignments:[],
  scheduleGroups:Array.isArray(data.scheduleGroups)?data.scheduleGroups:[]};
}
async function getSchedulePreview(month){
 if(!/^\d{4}-\d{2}$/.test(month)||!token())return null;
 const viewer=viewerKey(),credential=token(),base=systemKey('schedule');
 const rows=await Promise.all([get(base+'|'+month),get(base)].map(p=>p.catch(()=>null)));
 if(viewerKey()!==viewer||token()!==credential)return null;
 const candidates=rows.map(row=>{
  if(!row||!currentViewerRow(row)||row.kind!=='system'||row.system!=='schedule'||row.savedAt<=0||row.savedAt>Date.now()+60000)return null;
  const scoped=row.key===base+'|'+month&&row.month===month;
  const data=schedulePreviewData(row.data,month,scoped);
  return data?{data,savedAt:row.savedAt}:null;
 }).filter(Boolean).sort((a,b)=>b.savedAt-a.savedAt);
 return candidates[0]||null;
}
async function storeSchedulePreview(month,data,expectedViewer,expectedToken,readAt=Date.now()){
 if(!/^\d{4}-\d{2}$/.test(month)||!token()||viewerKey()!==expectedViewer||token()!==expectedToken)return false;
 const selected=schedulePreviewData(data,month,false);
 // A successful month-scoped response may legitimately contain no schedules yet.
 const payload=selected||(!data?.schedules?.length?schedulePreviewData(data,month,true):null);
 if(!payload)return false;
 const key=systemKey('schedule')+'|'+month;
 // Detach from mutable page state before storing in memory, IndexedDB or the folder.
 const snapshot=JSON.parse(JSON.stringify(payload));
 await put({key,kind:'system',system:'schedule',month,savedAt:readAt,size:safeSize(snapshot),data:snapshot});
 return true;
}
async function restoreSystemSnapshot(sys,options={}){
 const row=await getSystemSnapshot(sys);
 if(!row?.data)return null;
 if((sys==='attendance'||sys==='workhours')&&typeof window.p79ApplyAttendanceFullCache==='function'){
   await window.p79ApplyAttendanceFullCache(row.data,{showAll:options.showAll!==false,fromIndexedDb:true,silent:options.silent!==false});
 }
 return row;
}
async function storeApi(url,data,sys='',savedAt=Date.now()){
 const key=actionKey(url);
 const row={key,kind:'api',system:sys||currentSystem(),savedAt,size:safeSize(data),data};
 if(key)await put(row);
 if(sys)await put({key:systemKey(sys),kind:'system',system:sys,savedAt:Date.now(),size:safeSize(data),data});
}
function jsonResponse(data,cacheState='1'){
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json;charset=UTF-8','X-PORT79-CACHE':cacheState}});
}

// Render read-only DOM without passing disk snapshots through business renderers:
// those renderers can repair records, populate write queues or change permissions.
async function showStartupPreview(options){
 try{
 const {system,actions,canShow,select,host,month}=options;
 if(!token()||!canShow())return false;
 const viewer=viewerKey(),credential=token(),generation=mutationGeneration;
 const versions=actions.map(a=>readVersions.get(a)||0);
 const candidates=await Promise.all([getSystemSnapshot(system),...(month?[get(systemKey(system)+'|'+month)]:[])].map(p=>p.catch(()=>null)));
 const row=candidates.filter(r=>r&&currentViewerRow(r)&&r.savedAt>0&&r.savedAt<=Date.now()+60000).sort((a,b)=>b.savedAt-a.savedAt)[0];
 if(!row||row.data?.ok!==true||viewer!==viewerKey()||credential!==token()||generation!==mutationGeneration||!canShow()||actions.some((a,i)=>(readVersions.get(a)||0)!==versions[i]))return false;
 if(startupPreview)return true;
 const model=select(row.data,row.scope||{});
 if(!model||!Array.isArray(model.rows)||!model.rows.length)return false;
 const parent=document.querySelector(host);if(!parent)return false;
 const card=document.createElement('section');card.id='p79StartupCacheStatus';card.setAttribute('aria-label','本機快取預覽');
 card.style.cssText='margin:12px 0;padding:16px;border:1px solid #93c5fd;border-radius:14px;background:#eff6ff;color:#0f172a';
 const heading=document.createElement('h2');heading.style.cssText='font-size:16px;font-weight:700;margin:0 0 8px';heading.textContent=SYSTEM_LABELS[system]+' · 本機快取預覽';card.appendChild(heading);
 const status=document.createElement('p');status.setAttribute('role','status');status.style.cssText='font-size:12px;margin:0 0 10px';status.textContent=fmtTime(row.savedAt)+'｜'+(model.label||'')+'｜唯讀；正在讀取雲端最新資料。';card.appendChild(status);
 const scroller=document.createElement('div');scroller.style.cssText='max-height:320px;overflow:auto';
 const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;font-size:13px;background:white;color:#0f172a';
 const head=document.createElement('thead'),tr=document.createElement('tr');
 for(const title of model.columns){const cell=document.createElement('th');cell.textContent=title;cell.style.cssText='text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;white-space:nowrap';tr.appendChild(cell);}head.appendChild(tr);table.appendChild(head);
 const body=document.createElement('tbody');
 for(const values of model.rows.slice(0,100)){const tr=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=String(value??'');cell.style.cssText='padding:8px;border-bottom:1px solid #e2e8f0;white-space:nowrap';tr.appendChild(cell);}body.appendChild(tr);}
 table.appendChild(body);scroller.appendChild(table);card.appendChild(scroller);
 const footer=document.createElement('p');footer.style.cssText='font-size:12px;margin:10px 0 0';footer.textContent='共 '+model.rows.length+' 筆'+(model.rows.length>100?'，預覽前 100 筆':'')+'；最新資料讀取完成後自動切回完整操作畫面。';card.appendChild(footer);
 const retry=document.createElement('a');retry.href=location.href;retry.textContent='重新讀取';retry.style.cssText='display:inline-block;margin-top:8px;color:#1d4ed8;text-decoration:underline';card.appendChild(retry);
 parent.prepend(card);
 startupPreview={system,actions,close(){card.remove();startupPreview=null;}};
 return true;
 }catch(error){console.warn('本機預覽無法顯示，繼續讀取雲端',error);return false;}
}
function finishStartupPreview(system){if(startupPreview?.system===system)startupPreview.close();}
async function getHistoryPreview(url){
 const info=urlInfo(url),key=actionKey(url),viewer=viewerKey(),credential=token();
 if(!credential||info.action!=='historyGetMonthData'||!key)return null;
 const row=await get(key).catch(()=>null);
 if(!row||viewer!==viewerKey()||credential!==token()||row.data?.ok!==true||row.savedAt<mutationStamp()||row.savedAt>Date.now()+60000)return null;
 if(row.data.month&&row.data.month!==info.u.searchParams.get('month'))return null;
 return {...row.data,sourceLabel:'本機歷史快取 · '+fmtTime(row.savedAt)};
}
const rawFetch=window.fetch.bind(window);
function nativeFetch(input,init){
 const url=typeof input==='string'?input:input?.url||String(input);
 const method=String(init?.method||input?.method||'GET').toUpperCase(),info=urlInfo(url);
 const key=method==='GET'?actionKey(url):null;
 const viewer=viewerKey(),credential=token(),generation=mutationGeneration,startedAt=Date.now();
 const requestCredentials=['token','userToken','gcToken','adminToken'].map(k=>info.u?.searchParams.get(k)).filter(Boolean);
 return rawFetch(input,init).then(response=>{
  if(key){
   readVersions.set(info.action,(readVersions.get(info.action)||0)+1);
   if(response.ok){
    // Parsing and both disk stores run in the background, never on the response path.
    void response.clone().json().then(async data=>{
     if(data?.ok!==true||data.retryable||!requestCredentials.length||requestCredentials.some(t=>t!==credential)||viewer!==viewerKey()||credential!==token()||!credential||generation!==mutationGeneration)return;
     const writes=[storeApi(url,data,'',startedAt)];
     const sys={getLeaveData:'leave',hrGetEmployees:'hr',gcGetData:'efficiency',getHistoricalDataCatalog:'history'}[info.action];
     // Preserve the request scope so a downloaded month cannot masquerade as all data.
     if(sys)writes.push(put({key:systemKey(sys),kind:'system',system:sys,savedAt:startedAt,size:safeSize(data),scope:Object.fromEntries(['month','year','scope','type'].filter(k=>info.u.searchParams.has(k)).map(k=>[k,info.u.searchParams.get(k)])),data}));
     const month=info.u.searchParams.get('month');
     if(info.action==='getAttendanceMonthData'&&/^\d{4}-\d{2}$/.test(month||'')&&Array.isArray(data.records)&&(!data.month||data.month===month)){
      for(const target of ['attendance','workhours'])writes.push(put({key:systemKey(target)+'|'+month,kind:'system',system:target,month,savedAt:startedAt,size:safeSize(data),data}));
     }
     await Promise.allSettled(writes);
    }).catch(()=>{});
   }
  }
  return response;
 });
}
function coalescedNetwork(key,input,init,url){
 let p=inflightReads.get(key);
 if(!p){
  p=nativeFetch(input,init).finally(()=>{if(inflightReads.get(key)===p)inflightReads.delete(key)});
  inflightReads.set(key,p);
 }
 return p.then(r=>r.clone());
}

window.fetch=async function(input,init){
 const method=String(init?.method||'GET').toUpperCase();
 let url=typeof input==='string'?input:input?.url;
 const info=urlInfo(url);
 // 舊版 GET 也必須帶登入權杖；限定 Apps Script，不傳送到其他來源。
 if(method==='GET'&&info.u?.origin==='https://script.google.com'&&info.u.pathname.startsWith('/macros/s/')&&!['token','userToken','gcToken','adminToken'].some(k=>String(info.u.searchParams.get(k)||'').trim())){
  const tk=token();if(tk){info.u.searchParams.set('token',tk);url=info.u.toString();input=typeof input==='string'?url:new Request(url,input);}
 }

 if(method!=='GET'){
   const action=requestAction(input,init);
   const mutation=isMutationAction(action);
   if(mutation)markMutation();
   const r=await nativeFetch(input,init);
   if(r.ok&&mutation)markMutation();
   return r;
 }

 // 排班正式讀取帶有月版本與逾時控制；不可共用跨請求的 inflight fetch/快取。
 // 先讓排班專用完整 GET 經由原生 fetch，避免共用請求的 abort/response 影響正式讀取。
 if(window.P79FullRefreshRunning===true || init?.signal || init?.cache==='no-store' || ['getScheduleDataSecure','getAttendanceMainDirect'].includes(info.action)||info.u?.searchParams.get('fresh')==='1')return nativeFetch(input,init);
 const key=actionKey(url);
 if(!key)return nativeFetch(input,init);

 let cached=null;
 try{cached=await Promise.race([get(key),new Promise(resolve=>setTimeout(()=>resolve(null),40))])}catch(e){}
 const stamp=mutationStamp();
 if(cached&&Number(cached.savedAt||0)<stamp)cached=null;

 const action=urlInfo(url).action;
 const age=cached?Date.now()-Number(cached.savedAt||0):Infinity;
 const ttl=cacheFreshTtl(action,url);

 // Very recent data: answer immediately and skip a redundant GAS request.
 if(cached&&ttl>0&&age<=ttl)return jsonResponse(cached.data,'fresh');

 const network=coalescedNetwork(key,input,init,url);
 if(!cached||age>MAX_FALLBACK_AGE_MS)return network;

 const winner=await Promise.race([
  network.then(r=>({type:'network',r})).catch(e=>({type:'error',e})),
  new Promise(resolve=>setTimeout(()=>resolve({type:'cache'}),NETWORK_GRACE_MS))
 ]);
 if(winner.type==='network')return winner.r;
 if(winner.type==='error')return jsonResponse(cached.data,'fallback');
 network.catch(()=>{});
 return jsonResponse(cached.data,'stale');
};

function p79EnsureXlsx(){
 if(window.XLSX)return Promise.resolve(window.XLSX);
 if(window.__p79XlsxPromise)return window.__p79XlsxPromise;
 // 下載只在用到 Excel 時才執行；來源故障時依序備援，下一次可重新嘗試。
 const sources=[
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
 ];
 window.__p79XlsxPromise=(async()=>{
  let lastError=null;
  for(const src of sources){
   if(window.XLSX)return window.XLSX;
   try{
    await new Promise((resolve,reject)=>{
     const tag=document.createElement('script');
     tag.src=src;tag.async=true;tag.dataset.p79XlsxLazy='1';
     let settled=false;
     const timer=setTimeout(()=>finish(new Error('Excel 下載超時')),12000);
     function finish(error){
      if(settled)return;
      settled=true;clearTimeout(timer);
      tag.onload=null;tag.onerror=null;
      if(error){tag.remove();reject(error)}
      else resolve();
     }
     tag.onload=()=>window.XLSX?finish(null):finish(new Error('Excel 元件不完整'));
     tag.onerror=()=>finish(new Error('Excel 來源連線失敗'));
     document.head.appendChild(tag);
    });
    if(window.XLSX)return window.XLSX;
   }catch(error){lastError=error}
  }
  throw new Error('所有 Excel 下載來源均無法使用，請檢查網路連線：'+(lastError?.message||''));
 })().catch(error=>{window.__p79XlsxPromise=null;throw error});
 return window.__p79XlsxPromise;
}
window.p79EnsureXlsx=p79EnsureXlsx;

function buildUrl(action,params={}){
 const base=gasUrl();if(!base)throw new Error('找不到 Google Apps Script 網址');
 const u=new URL(base);u.searchParams.set('action',action);Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v))});
 // Downloads use nativeFetch, so they do not pass through the fetch auth wrapper.
 if(u.origin==='https://script.google.com'&&u.pathname.startsWith('/macros/s/')&&!['token','userToken','gcToken','adminToken'].some(k=>String(u.searchParams.get(k)||'').trim())){
  const t=token();if(t)u.searchParams.set('token',t);
 }
 u.searchParams.set('_',Date.now());return u.toString();
}
async function fetchJson(action,params={},sys=''){
 const viewer=viewerKey(),credential=token();
 if(!credential)throw Object.assign(new Error('請先由首頁重新登入，再下載資料'),{code:'P79_AUTH'});
 let url=buildUrl(action,params),lastError;
 const primary=new URL(url),canonical=new URL(CANONICAL_GAS_URL);
 if(!validDownloadGasUrl(primary.toString()))throw new Error('雲端網址設定不正確，請由首頁重新進入系統');
 const labels={getAttendanceMonths:'考勤月份清單',getAttendanceEmployeeMaster:'員工主檔',getAttendanceMonthData:'考勤月份資料',getAttendanceMainDirect:'考勤主表',getLeaveData:'請假',getScheduleDataSecure:'排班',gcGetData:'效率',hrGetEmployees:'人資',getHistoricalDataCatalog:'歷史資料',historyGetMonthData:'歷史月份資料'};
 const label=labels[action]||'雲端資料';
 for(let attempt=0;attempt<2;attempt++){
  const c=new AbortController();let timedOut=false,data;
  const to=setTimeout(()=>{timedOut=true;c.abort()},DOWNLOAD_TIMEOUT_MS);
  try{
   if(viewerKey()!==viewer||token()!==credential)throw Object.assign(new Error('登入狀態已變更，請重新開啟快取中心'),{code:'P79_AUTH'});
   const r=await rawFetch(url,{method:'GET',cache:'no-store',redirect:'follow',signal:c.signal});
   const raw=await r.text();
   if(!r.ok)throw Object.assign(new Error(label+'：HTTP '+r.status),{status:r.status,retryable:[404,408,429,500,502,503,504].includes(r.status),code:'P79_TRANSPORT'});
   try{data=JSON.parse(raw)}catch(_){throw Object.assign(new Error(label+'：雲端回傳網頁，部署網址可能已失效'),{retryable:true,code:'P79_TRANSPORT'})}
   if(!data||typeof data!=='object')throw new Error(label+'：雲端資料格式不正確');
   if(data.ok===false||data.retryable){
    const message=String(data.error||'雲端暫時無法讀取');
    const auth=/請.*登入|登入.*(?:逾時|過期|不存在|失效|重新)|(?:token|憑證).*(?:失效|過期|不存在)/i.test(message);
    throw Object.assign(new Error(label+'：'+message),{code:auth?'P79_AUTH':'P79_CLOUD',retryable:!auth&&data.retryable===true});
   }
   if(viewerKey()!==viewer||token()!==credential)throw Object.assign(new Error('登入狀態已變更，未保存其他帳號資料'),{code:'P79_AUTH'});
  }catch(error){
   if(timedOut||error?.name==='AbortError')error=Object.assign(new Error(label+'：雲端讀取逾時（60 秒），請稍後重試'),{retryable:true,code:'P79_TRANSPORT'});
   else if(error?.name==='TypeError')error=Object.assign(new Error(label+'：無法連接雲端，請檢查網路'),{retryable:true,code:'P79_TRANSPORT'});
   lastError=error;
   if(attempt===1||!error.retryable)throw error;
   // Only safe reads are retried. A retired deployment may recover through the
   // same official /exec URL used by the system entrance; never change access.
   const next=new URL(url);
   if(error.status===404||/回傳網頁/.test(error.message)){
    next.protocol=canonical.protocol;next.host=canonical.host;next.pathname=canonical.pathname;
   }
   next.searchParams.set('_',String(Date.now()+attempt+1));url=next.toString();
   setProgress(label+'連線未完成，正在重試一次…');
   continue;
  }finally{clearTimeout(to)}
  readVersions.set(action,(readVersions.get(action)||0)+1);
  // Storage failures must not trigger another cloud request.
  await storeApi(url,data,sys);
  if(new URL(url).pathname!==primary.pathname)recoveredGasUrl=CANONICAL_GAS_URL;
  return data;
 }
 throw lastError;
}
async function saveSystemSnapshot(sys,data){
 await put({key:systemKey(sys),kind:'system',system:sys,savedAt:Date.now(),size:safeSize(data),data});
 return data;
}
function attendanceRecordStableKey(r){
 const id=String(r?.id||'').trim();if(id)return 'id:'+id;
 const sk=String(r?.sourceEventKey||r?.eventKey||'').trim();if(sk)return 'key:'+sk;
 return ['row',String(r?.empId||r?.attNo||r?.name||''),String(r?.timeStr||''),String(r?.type||r?.action||r?.status||'')].join('|');
}
function mergeAttendanceRows(rows){
 const m=new Map();(rows||[]).forEach(r=>{if(!r||typeof r!=='object')return;m.set(attendanceRecordStableKey(r),r)});return [...m.values()];
}
async function applyAttendanceSnapshotToPage(snapshot,showAll=true){
 try{
  if(typeof window.p79ApplyAttendanceFullCache==='function'){
   return await window.p79ApplyAttendanceFullCache(snapshot,{showAll});
  }
 }catch(e){console.warn('套用考勤完整快取失敗',e)}
 return null;
}
async function downloadAttendanceDatabase(targetSys='attendance',onProgress){
 const t=token();
 if(!t)throw new Error('找不到登入 Token，請重新由首頁登入');
 onProgress?.('attendance',0,1,'catalog','讀取月份清單');
 const catalog=await fetchJson('getAttendanceMonths',{token:t},'');
 if(!Array.isArray(catalog?.months))throw new Error('考勤月份清單格式不正確，請重新下載');
 const months=[...new Set((Array.isArray(catalog?.months)?catalog.months:[]).filter(m=>/^\d{4}-\d{2}$/.test(String(m))))].sort();
 if(!months.length)months.push(ymNow());

 onProgress?.('attendance',0,months.length+1,'master','讀取員工主檔');
 const master=await fetchJson('getAttendanceEmployeeMaster',{token:t},'');
 if(!Array.isArray(master?.employees))throw new Error('員工主檔格式不正確，已保留原有快取');
 const employees=master.employees;

 let allRecords=[];const monthStats=[];
 for(let i=0;i<months.length;i++){
  const month=months[i];
  onProgress?.('attendance',i+1,months.length,'month',`讀取 ${month}`);
  try{
   const d=await fetchJson('getAttendanceMonthData',{month,token:t},'');
   if(!Array.isArray(d?.records))throw new Error('考勤月份資料格式不正確');
   let rows=d.records;
   const direct=await fetchJson('getAttendanceMainDirect',{month,token:t},'');
   if(!Array.isArray(direct?.records))throw new Error('考勤主表資料格式不正確');
   if(direct.records.length)rows=mergeAttendanceRows(rows.concat(direct.records));
   allRecords=mergeAttendanceRows(allRecords.concat(rows));
   monthStats.push({month,count:rows.length,ok:true});
  }catch(e){
   if(['P79_AUTH','P79_TRANSPORT'].includes(e?.code))throw e;
   monthStats.push({month,count:0,ok:false,error:String(e?.message||e)});
  }
 }
 const failedMonths=monthStats.filter(x=>!x.ok);
 if(failedMonths.length)throw new Error('考勤／工時未完整下載：'+failedMonths.map(x=>x.month+'（'+x.error+'）').join('、')+'；已保留原有完整快取，請重試');
 const snapshot={
  ok:true,action:'port79AttendanceFullCache',fullDatabase:true,
  generatedAt:Date.now(),months,monthStats,records:allRecords,employees,
  recordCount:allRecords.length,employeeCount:employees.length,
  revision:String(master?.revision||catalog?.revision||'')
 };
 await saveSystemSnapshot('attendance',snapshot);
 await saveSystemSnapshot('workhours',snapshot);
 if(targetSys==='attendance'||targetSys==='workhours')await applyAttendanceSnapshotToPage(snapshot,true);
 return snapshot;
}
async function downloadSystem(sys,onProgress){
 const t=token(),m=ymNow();
 if(sys==='attendance'||sys==='workhours')return downloadAttendanceDatabase(sys,onProgress);
 if(sys==='leave')return fetchJson('getLeaveData',{token:t},sys);
 if(sys==='schedule')return fetchJson('getScheduleDataSecure',{token:t},sys);
 if(sys==='efficiency')return fetchJson('gcGetData',{token:t,month:m,scope:'month'},sys);
 if(sys==='hr')return fetchJson('hrGetEmployees',{token:t},sys);
 if(sys==='history'){
  const catalog=await fetchJson('getHistoricalDataCatalog',{token:t},sys);
  for(const type of ['attendance','schedule','vessel']){try{await fetchJson('historyGetMonthData',{token:t,type,month:m},'')}catch(e){}}
  return catalog;
 }
 throw new Error('未知系統：'+sys);
}
async function downloadAll(onProgress){
 const systems=['attendance','workhours','leave','schedule','efficiency','hr','history'];const result=[];
 let attendanceSnapshot=null,attendanceError=null,connectionError=null;
 for(let i=0;i<systems.length;i++){
  const sys=systems[i];onProgress?.(sys,i,systems.length,'loading');
  try{
   if(connectionError)throw connectionError;
   if(sys==='attendance')attendanceSnapshot=await downloadAttendanceDatabase('attendance',(s,mi,mt,state,label)=>onProgress?.(sys,i,systems.length,'detail',null,`${label||state} ${mi}/${mt}`));
   else if(sys==='workhours'&&attendanceError)throw attendanceError;
   else if(sys==='workhours'&&attendanceSnapshot){await saveSystemSnapshot('workhours',attendanceSnapshot);if(currentSystem()==='workhours')await applyAttendanceSnapshotToPage(attendanceSnapshot,true)}
   else await downloadSystem(sys);
   result.push({system:sys,ok:true});onProgress?.(sys,i,systems.length,'done');
  }catch(e){if(['P79_AUTH','P79_TRANSPORT'].includes(e?.code))connectionError=e;if(sys==='attendance')attendanceError=e;result.push({system:sys,ok:false,error:String(e?.message||e)});onProgress?.(sys,i,systems.length,'error',e)}
 }
 if(currentSystem()==='attendance'&&attendanceSnapshot)await applyAttendanceSnapshotToPage(attendanceSnapshot,true);
 return result;
}

function ensureStyle(){if(document.getElementById('p79CacheStyle'))return;const s=document.createElement('style');s.id='p79CacheStyle';s.textContent=`
#p79CacheBackdrop{position:fixed;inset:0;z-index:16000;background:rgba(2,6,23,.5);display:none;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(5px)}
#p79CacheBackdrop.open{display:flex}#p79CacheModal{width:min(780px,100%);max-height:min(84vh,820px);overflow:auto;background:#fff;color:#0f172a;border-radius:22px;border:1px solid #e2e8f0;box-shadow:0 30px 80px rgba(2,6,23,.35);padding:18px}
.dark #p79CacheModal{background:#0f172a;color:#e2e8f0;border-color:#334155}.p79-cache-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.p79-cache-title{font-size:20px;font-weight:950}.p79-cache-sub{font-size:11px;color:#64748b;margin-top:3px}.dark .p79-cache-sub{color:#94a3b8}.p79-cache-close{border:1px solid #cbd5e1;background:#fff;border-radius:10px;width:36px;height:36px;font-weight:900}.dark .p79-cache-close{background:#111827;color:#e5e7eb;border-color:#475569}
.p79-cache-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.p79-cache-row{border:1px solid #e2e8f0;border-radius:14px;padding:11px 12px;background:#f8fafc}.dark .p79-cache-row{background:#111827;border-color:#334155}.p79-cache-row b{display:block;font-size:13px}.p79-cache-meta{font-size:11px;color:#64748b;margin-top:5px;line-height:1.45}.dark .p79-cache-meta{color:#94a3b8}.p79-cache-state{font-size:11px;font-weight:900;margin-top:5px;color:#047857}.p79-cache-state.error{color:#be123c}.p79-cache-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px;padding-top:14px;border-top:1px solid #e2e8f0}.dark .p79-cache-actions{border-color:#334155}.p79-cache-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:12px;padding:10px 13px;font-size:12px;font-weight:900;cursor:pointer}.p79-cache-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.p79-cache-btn.all{background:#0f766e;border-color:#0f766e;color:#fff}.p79-cache-btn.danger{color:#be123c}.p79-cache-btn:disabled{opacity:.5;cursor:not-allowed}.dark .p79-cache-btn:not(.primary):not(.all){background:#111827;color:#e2e8f0;border-color:#475569}.p79-cache-note{margin-top:12px;padding:10px 12px;border-radius:12px;background:#eff6ff;color:#1e40af;font-size:11px;line-height:1.55}.dark .p79-cache-note{background:rgba(30,64,175,.18);color:#bfdbfe}
@media(max-width:680px){.p79-cache-grid{grid-template-columns:1fr}#p79CacheModal{padding:14px}}
`;document.head.appendChild(s)}
function ensureModal(){
 ensureStyle();let b=document.getElementById('p79CacheBackdrop');if(b)return b;
 b=document.createElement('div');b.id='p79CacheBackdrop';b.innerHTML=`<div id="p79CacheModal" role="dialog" aria-modal="true"><div class="p79-cache-head"><div><div class="p79-cache-title">☁️ 79號碼頭雲端資料庫</div><div class="p79-cache-sub">本機加速讀取，修改仍透過各系統同步雲端。</div></div><button class="p79-cache-close" type="button">✕</button></div><div id="p79DeviceStatus" class="p79-cache-note" role="status"></div><div class="p79-cache-actions"><button class="p79-cache-btn" data-cache-action="folder">選擇電腦資料夾</button><button class="p79-cache-btn" data-cache-action="reconnect">重新授權資料夾</button><button class="p79-cache-btn" data-cache-action="disconnect">停用資料夾</button><button class="p79-cache-btn" data-cache-action="persist">保留手機／瀏覽器資料</button></div><div class="p79-cache-note">電腦：請先建立並選擇「79號碼頭雲端資料庫」資料夾。手機：按「保留手機／瀏覽器資料」，也可將系統加入主畫面。清除網站資料後，電腦檔案仍保留，但需重新選擇資料夾。資料夾快取不會自行覆寫雲端；請以各系統的儲存／同步狀態確認上傳結果。</div><div id="p79CacheRows" class="p79-cache-grid"></div><div class="p79-cache-actions"><button class="p79-cache-btn primary" data-cache-action="current">下載目前系統完整資料</button><button class="p79-cache-btn all" data-cache-action="all">下載七大系統完整快取</button><button class="p79-cache-btn danger" data-cache-action="clear">清除本機快取</button></div><div id="p79CacheProgress" class="p79-cache-note">考勤／工時按「下載」會讀取全部考勤月份＋員工主檔，完成後直接套用畫面；其他系統依各自雲端資料建立本機快取。</div></div>`;
 document.body.appendChild(b);b.querySelector('.p79-cache-close').onclick=()=>b.classList.remove('open');b.addEventListener('click',e=>{if(e.target===b)b.classList.remove('open')});
 b.addEventListener('click',async e=>{const btn=e.target.closest('[data-cache-action]');if(!btn)return;const act=btn.dataset.cacheAction;const buttons=[...b.querySelectorAll('[data-cache-action]')];buttons.forEach(x=>x.disabled=true);try{
   if(act==='folder'){setProgress(await connectFolder());await refreshModal()}
   if(act==='reconnect'){setProgress(await reconnectFolder());await refreshModal()}
   if(act==='disconnect'){setProgress(await disconnectFolder());await refreshModal()}
   if(act==='persist'){setProgress(await retainDeviceData());await refreshModal()}
   if(act==='clear'){if(confirm('確定清除此瀏覽器的七大系統本機快取？')){await clear();setProgress('已清除瀏覽器快取；硬碟資料夾檔案仍保留，啟用時可重新讀取。');await refreshModal()}}
   if(act==='current'){const sys=currentSystem();setProgress(`正在下載 ${SYSTEM_LABELS[sys]}…`);const snap=await downloadSystem(sys,(s,i,total,state,label)=>setProgress(`⬇️ ${label||SYSTEM_LABELS[sys]} ${i}/${total}`));setProgress(sys==='attendance'||sys==='workhours'?`✅ ${SYSTEM_LABELS[sys]}完整資料已載入｜考勤 ${Number(snap?.recordCount||0)} 筆｜員工主檔 ${Number(snap?.employeeCount||0)} 人`:`✅ ${SYSTEM_LABELS[sys]} 快取完成。`);await refreshModal()}
   if(act==='all'){const res=await downloadAll((sys,i,total,state,err,detail)=>{setProgress(detail?`⬇️ ${SYSTEM_LABELS[sys]}｜${detail}`:`${state==='error'?'⚠️':'⬇️'} ${i+1}/${total} ${SYSTEM_LABELS[sys]} ${state==='loading'?'下載中…':state==='done'?'完成':state==='detail'?'整理中…':'失敗'}`)});const ok=res.filter(x=>x.ok).length;const bad=res.filter(x=>!x.ok);setProgress(`完成：${ok}/7 個系統${bad.length?'；未完成：'+bad.map(x=>SYSTEM_LABELS[x.system]+'：'+x.error).join('；'):''}`);await refreshModal()}
  }catch(err){setProgress(err?.name==='AbortError'?'已取消選擇，原有快取保持不變。':'❌ '+String(err?.message||err))}finally{buttons.forEach(x=>x.disabled=false)}});
 return b;
}
function setProgress(t){const e=document.getElementById('p79CacheProgress');if(e)e.textContent=t}
async function refreshModal(){
 const status=await deviceStatus(),el=document.getElementById('p79DeviceStatus');
 if(el)el.textContent=(status.folderSupported?status.folder:'此裝置使用手機／瀏覽器內部快取')+'｜本機保留：'+(status.retained?'已獲准':'尚未獲准');
 const folderButton=document.querySelector('[data-cache-action=folder]');if(folderButton)folderButton.hidden=!status.folderSupported;
 const reconnectButton=document.querySelector('[data-cache-action=reconnect]');if(reconnectButton)reconnectButton.hidden=!status.folderSupported;
 const rows=document.getElementById('p79CacheRows');if(!rows)return;const data=boundedManagementMemory()?await managementSystemMetadata():await all();const v=viewerKey();rows.innerHTML=Object.keys(SYSTEM_LABELS).map(sys=>{const r=data.filter(x=>x.key===v+'|system|'+sys).sort((a,b)=>b.savedAt-a.savedAt)[0];return `<div class="p79-cache-row" data-cache-system="${sys}"><b>${SYSTEM_LABELS[sys]}</b><div class="p79-cache-meta">最後快取：${fmtTime(r?.savedAt)}<br>大小：${r?fmtBytes(r.size):'--'}</div><div class="p79-cache-state">${r?'✓ 已有本機快取':'○ 尚未下載'}</div></div>`}).join('')
}
async function openCenter(){const b=ensureModal();b.classList.add('open');await refreshModal()}

window.Port79DataCache={showStartupPreview,finishStartupPreview,hasStartupPreview:()=>!!startupPreview,getHistoryPreview,getSchedulePreview,storeSchedulePreview,connectFolder,reconnectFolder,disconnectFolder,retainDeviceData,deviceStatus,flushFolder:()=>folderWrites,openCenter,downloadSystem,downloadAll,clear,all,get,put,currentSystem,viewerKey,getSystemSnapshot,restoreSystemSnapshot};
})();

