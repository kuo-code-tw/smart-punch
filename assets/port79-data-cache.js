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
window.addEventListener?.('pagehide',()=>{if(boundedManagementMemory())clearMemory();void flushFolder();});
const inflightReads=new Map();
const readVersions=new Map();
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
function displayScope(){
 try{const s=JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null');
 return JSON.stringify([s?.systemPermissions||{},s?.dataScope||{},s?.dataScopeJobs||{}]);}catch(_){return '';}
}
async function put(row){
 if(currentViewerRow(row))row={...row,displayScope:row.displayScope??displayScope(),cacheEndpoint:row.cacheEndpoint??gasUrl()};
 rememberMemory(row);
 const disk=mirrorSnapshot(row);
 try{await putLocal(row);return true}catch(error){
  // IndexedDB 失敗時不可等待延後計時器；立刻將待寫資料實際落盤作為備援。
  await loadFolder().catch(()=>null);await Promise.resolve();await flushFolder();if(await disk)return true;throw error
 }
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
// Keep the old SHA-256 name only for reading legacy files; new disk writes are
// immediately saved under descriptive Chinese names (no conversion or extra copy).
async function legacyFolderFilename(key){
 const hash=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')+'.json';
}
const FOLDER_API_NAMES={
 getAttendanceCoreData:['考勤','考勤核心'],getAttendanceMonthData:['考勤','月份資料'],
 getAttendanceMonths:['考勤','月份清單'],getAttendanceEmployeeMaster:['人資','考勤員工主檔'],
 getAttendanceMainDirect:['考勤','原始紀錄'],getLeaveData:['請假','請假紀錄'],
 getScheduleDataSecure:['排班','正式班表'],getScheduleData:['排班','班表資料'],
 getData:['共用資料','資料讀取'],gcGetData:['效率','工作報告'],
 getHistoricalDataCatalog:['歷史資料','月份目錄'],historyGetMonthData:['歷史資料','月份內容'],
 hrGetEmployees:['人資','員工資料'],getEmployeeSnapshot:['人資','員工快照']
};
const FOLDER_HISTORY_TYPES={attendance:'考勤',schedule:'排班',vessel:'船舶',sailing:'船期',routes:'碼頭航線',gate:'碼頭進出站',yard:'碼頭儲量'};
function folderSafePart(value,limit=48){
 const invalid='/:*?"<>|'+String.fromCharCode(92);
 const raw=String(value??'').trim();
 const s=Array.from(raw,ch=>ch.charCodeAt(0)<32||invalid.includes(ch)?'－':ch).join('').replace(/\s+/g,'_').replace(/\.+$/,'').slice(0,limit);
 return s||'未命名';
}
async function folderFilename(key){
 const parts=String(key).split('|'),viewer=folderSafePart(parts.shift(),40),kind=parts.shift();
 let category='系統資料',detail='快取';
 if(kind==='system'){
  const sys=parts.shift();category=SYSTEM_LABELS[sys]||'系統資料';
  const extra=parts.map(p=>p==='export'?'原始匯出':/^\d{4}-\d{2}$/.test(p)?'月份'+p:folderSafePart(p,24));
  detail=extra.length?extra.join('_'):'完整快取';
 }else if(kind==='api'){
  try{
   const url=new URL(parts.join('|')),action=url.searchParams.get('action')||'';
   const names=FOLDER_API_NAMES[action]||['系統資料','雲端讀取'];
   category=names[0];detail=names[1];
   const type=url.searchParams.get('type');
   if(action==='historyGetMonthData'&&type&&FOLDER_HISTORY_TYPES[type])category=FOLDER_HISTORY_TYPES[type];
   const descriptors=[];
   for(const param of ['month','year','type','scope','includeEmployees']){
    const value=url.searchParams.get(param);
    if(value!==null&&value!=='')descriptors.push(({month:'月份',year:'年份',type:'分類',scope:'範圍',includeEmployees:'包含員工'})[param]+folderSafePart(value,24));
   }
   if(descriptors.length)detail+='_'+descriptors.join('_');
  }catch(_){detail='雲端讀取'}
 }
 // Short stable suffix prevents distinct accounts/queries with similar readable
 // labels from overwriting each other; it is not used as the visible category.
 const unique=(await legacyFolderFilename(key)).slice(0,12);
 return folderSafePart(category,20)+'_'+folderSafePart(detail,100)+'_帳號'+viewer+'_'+unique+'.json';
}
async function snapshotDirectory(handle,create=false){return handle.getDirectoryHandle('port79-snapshots-v1',{create})}
function currentViewerRow(row){return !!token()&&row?.key?.startsWith(viewerKey()+'|')&&['api','system'].includes(row.kind)&&row.data&&Number.isFinite(row.savedAt)}
// Folder status records actual completed file writes, independently of cloud activity.
const folderPending=new Map(),folderSyncStates=new Map();
function emitFolderSync(){try{if(typeof window.CustomEvent==='function')window.dispatchEvent?.(new window.CustomEvent('p79-folder-sync-changed'))}catch(_){}}
async function folderSyncSetting(viewer,value){
 const db=await openDb(),key='folder-sync|'+viewer;
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(SETTINGS,value===undefined?'readonly':'readwrite'),table=tx.objectStore(SETTINGS);
  if(value===undefined){const r=table.get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)}
  else{table.put({...value,key});tx.oncomplete=()=>resolve(true)}
  tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
async function folderSyncState(handle,viewer){
 let state=folderSyncStates.get(viewer);
 if(state?.handle===handle){await state.loaded;return state;}
 state={handle,savedAt:0,failures:{},loaded:null};folderSyncStates.set(viewer,state);
 state.loaded=(async()=>{try{
  const stored=await folderSyncSetting(viewer);
  const same=stored?.handle&&(stored.handle===handle||typeof handle.isSameEntry==='function'&&await handle.isSameEntry(stored.handle));
  if(same){state.savedAt=Number(stored.savedAt)>0&&Number(stored.savedAt)<=Date.now()+60000?Number(stored.savedAt):0;state.failures=stored.failures&&typeof stored.failures==='object'?stored.failures:{};}
 }catch(_){}finally{state.loaded=null}})();
 await state.loaded;return state;
}
async function recordFolderResult(handle,viewer,key,error=''){
 const state=await folderSyncState(handle,viewer);
 if(error)state.failures[key]=error;
 else{state.savedAt=Date.now();delete state.failures[key];}
 emitFolderSync();
 await folderSyncSetting(viewer,{handle,savedAt:state.savedAt,failures:state.failures}).catch(()=>{});
}
async function getFolderSyncStatus(){
 const viewer=viewerKey(),credential=token();
 if(!credential)return {state:'idle',label:'尚未登入',savedAt:0};
 const handle=await loadFolder();
 if(viewer!==viewerKey()||credential!==token())return {state:'idle',label:'登入已變更',savedAt:0};
 if(!handle)return {state:'idle',label:'未連接',savedAt:0};
 const folder=String(handle.name||'電腦資料夾');
 try{if(await handle.queryPermission({mode:'readwrite'})!=='granted')return {state:'permission',label:'需重新授權',folder,savedAt:0};}
 catch(_){return {state:'error',label:'無法存取',folder,savedAt:0};}
 const state=await folderSyncState(handle,viewer);
 if(viewer!==viewerKey()||credential!==token())return {state:'idle',label:'登入已變更',savedAt:0};
 const error=Object.values(state.failures)[0]||'';
 if(error)return {state:'error',label:'保存失敗',folder,savedAt:state.savedAt,error};
 const pending=folderPending.get(viewer)||0;
 if(pending)return {state:'busy',label:'保存中',folder,savedAt:state.savedAt,pending};
 return {state:state.savedAt?'done':'idle',label:state.savedAt?'已保存':'已連接，待保存',folder,savedAt:state.savedAt};
}
// 電腦資料夾是 IndexedDB 的備份鏡像：瀏覽器資料即時保存，硬碟寫入則按鍵合併。
const FOLDER_QUIET_MS=30000,FOLDER_MAX_MS=120000;
const folderQueue=new Map(),folderKnownPayload=new Map();
let folderQueueTimer=null,folderQueueSince=0;
function scheduleFolderFlush(){
 if(folderQueueTimer!==null)clearTimeout(folderQueueTimer);
 const remaining=Math.max(0,FOLDER_MAX_MS-(Date.now()-folderQueueSince));
 folderQueueTimer=setTimeout(()=>{folderQueueTimer=null;void flushFolder()},Math.min(FOLDER_QUIET_MS,remaining));
}
function mirrorSnapshot(row){
 if(!currentViewerRow(row))return Promise.resolve(false);
 // Do not queue timers or disk operations at all when no folder is connected.
 // On first use only, restore the saved handle from IndexedDB before deciding.
 if(!folderLoaded)return loadFolder().then(handle=>handle&&currentViewerRow(row)?enqueueFolderSnapshot(row):false).catch(()=>false);
 return folderHandle?enqueueFolderSnapshot(row):Promise.resolve(false);
}
function enqueueFolderSnapshot(row){
 const viewer=viewerKey();
 let entry=folderQueue.get(row.key);
 if(!entry){
  entry={row,viewer,waiters:[]};folderQueue.set(row.key,entry);
  if(!folderQueueSince)folderQueueSince=Date.now();
  folderPending.set(viewer,(folderPending.get(viewer)||0)+1);
  emitFolderSync();
 }else if(Number(row.savedAt)>=Number(entry.row.savedAt))entry.row=row;
 const result=new Promise(resolve=>entry.waiters.push(resolve));
 scheduleFolderFlush();
 return result;
}
async function flushFolder(){
 if(folderQueueTimer!==null){clearTimeout(folderQueueTimer);folderQueueTimer=null}
 const batch=[...folderQueue.values()];
 folderQueue.clear();folderQueueSince=0;
 if(!batch.length)return folderWrites;
 // Only the last version of each key enters the disk queue; waiters receive that result.
 const jobs=batch.map(entry=>writeFolderSnapshot(entry.row).then(ok=>{
  entry.waiters.forEach(resolve=>resolve(ok));return ok;
 }).catch(()=>{entry.waiters.forEach(resolve=>resolve(false));return false}).finally(()=>{
  folderPending.set(entry.viewer,Math.max(0,(folderPending.get(entry.viewer)||1)-1));emitFolderSync();
 }));
 await Promise.all(jobs);
 return folderWrites;
}
function writeFolderSnapshot(row){
 if(!currentViewerRow(row))return Promise.resolve(false);
 const viewer=viewerKey();let writeHandle=null;
 folderPending.set(viewer,(folderPending.get(viewer)||0)+1);emitFolderSync();
 const task=folderWrites.then(async()=>{
  if(!currentViewerRow(row))return false;
  const handle=await allowedFolder();if(!handle)return false;writeHandle=handle;
  const dir=await snapshotDirectory(handle,true),name=await folderFilename(row.key);
  const legacyName=await legacyFolderFilename(row.key);
  const payload=JSON.stringify(row.data);
  // An unchanged cloud result may have a newer download timestamp. Never write it again
  // just to refresh that timestamp. Folder status time must mean a real disk commit.
  const prior=folderKnownPayload.get(row.key);
  if(prior?.handle===handle&&prior.data===payload){prior.savedAt=Math.max(prior.savedAt,Number(row.savedAt)||0);return true;}
  // A newer legacy snapshot must not be replaced by stale browser data.
  // Only the new Chinese file is eligible for deduplication; the old hash file
  // remains unchanged and is used as a read fallback.
  for(const existingName of [name,legacyName]){
   try{
    const old=JSON.parse(await(await(await dir.getFileHandle(existingName)).getFile()).text());
    if(old?.format!=='port79-cache'||old.version!==1||old.row?.key!==row.key)continue;
    if(Number(old.row.savedAt)>Number(row.savedAt))return true;
    if(existingName===name&&old.row.kind===row.kind&&old.row.system===row.system&&JSON.stringify(old.row.data)===payload){
     folderKnownPayload.set(row.key,{handle,data:payload,savedAt:Math.max(Number(old.row.savedAt||0),Number(row.savedAt||0))});
     return true;
    }
   }catch(_){}
  }
  const file=await dir.getFileHandle(name,{create:true}),writer=await file.createWritable();
  try{await writer.write(JSON.stringify({format:'port79-cache',version:1,row}));await writer.close()}
  catch(error){try{await writer.abort()}catch(_){}throw error}
  folderKnownPayload.set(row.key,{handle,data:payload,savedAt:Number(row.savedAt)||0});
  await recordFolderResult(handle,viewer,row.key);
  folderMessage='已連接：'+handle.name+'；已自動保存至電腦';
  // 成功記錄只更新「電腦」燈號，不再顯示阻擋畫面的綠色通知。
  return true;
 }).catch(async error=>{
  folderMessage='資料夾保存失敗：'+String(error?.message||error);
  if(writeHandle)await recordFolderResult(writeHandle,viewer,row.key,String(error?.message||error));return false;
 }).finally(()=>{folderPending.set(viewer,Math.max(0,(folderPending.get(viewer)||1)-1));emitFolderSync()});
 folderWrites=task;return task;
}
// 離頁時僅嘗試排空已待寫快取；真正原始資料已在 IndexedDB／正式雲端。
document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden')void flushFolder()});
async function readFolderSnapshot(key,options={}){
 if(!token()||!key.startsWith(viewerKey()+'|'))return null;
 try{
  const handle=await allowedFolder();if(!handle)return null;
  const dir=await snapshotDirectory(handle);
  let row=null;
  // Prefer the freshest valid cache, including legacy SHA-256 files that
  // existed before Chinese names were introduced. Never enumerate other accounts.
  for(const name of [await folderFilename(key),await legacyFolderFilename(key)]){
   try{
    const file=await(await dir.getFileHandle(name)).getFile();
    if(file.size>64*1024*1024)continue;
    const doc=JSON.parse(await file.text()),candidate=doc?.row;
    if(doc.format!=='port79-cache'||doc.version!==1||candidate?.key!==key||!currentViewerRow(candidate)||candidate.savedAt>Date.now()+60000)continue;
    if(!row||Number(candidate.savedAt)>Number(row.savedAt))row=candidate;
   }catch(_){}
  }
  if(!row)return null;
  if(options.expectedViewer&&options.expectedViewer!==viewerKey()||options.expectedToken&&options.expectedToken!==token())return null;
  if(options.hydrate!==false)await putLocal(row).catch(()=>{});return row;
 }catch(_){return null}
}
// Read the seven known account keys directly; never scan another account's files.
async function restoreFolderSystems(){
 const viewer=viewerKey(),credential=token();if(!credential)return [];
 const restored=[];
 for(const sys of Object.keys(SYSTEM_LABELS)){
  const key=viewer+'|system|'+sys;
  const disk=await readFolderSnapshot(key,{hydrate:false,expectedViewer:viewer,expectedToken:credential});
  if(viewer!==viewerKey()||credential!==token())return [];
  if(!disk)continue;
  const local=await get(key).catch(()=>null);
  if(viewer!==viewerKey()||credential!==token())return [];
  const row=local?.savedAt>disk.savedAt?local:disk;
  rememberMemory(row);await putLocal(row).catch(()=>{});restored.push(sys);
 }
 return restored;
}
function announceFolderRestore(systems){
 try{if(typeof window.CustomEvent==='function')window.dispatchEvent?.(new window.CustomEvent('p79-folder-cache-restored',{detail:{systems}}));}catch(_){}
}
async function connectFolder(){
 if(!token())throw new Error('請先登入系統');
 if(typeof window.showDirectoryPicker!=='function')throw new Error('此裝置請使用「保留手機／瀏覽器資料」');
 // Keep the picker as the first awaited operation to preserve user activation.
 const selected=await window.showDirectoryPicker({id:'port79-cloud-cache',mode:'readwrite',startIn:'documents'});
 folderHandle=selected;folderLoaded=true;emitFolderSync();
 // Finish any pre-connection browser writes once, before enumerating the complete cache.
 await flushFolder();
 let remembered=true;try{await folderSetting(selected)}catch(_){remembered=false}
 const restored=await restoreFolderSystems();
 const rows=await all().catch(()=>[]);let saved=0,failed=0;
 for(const row of rows)if(currentViewerRow(row)){if(await writeFolderSnapshot(row))saved++;else failed++}
 const writable=await allowedFolder();if(!writable)throw new Error(folderMessage);
 if(failed)throw new Error('已連接資料夾，但有 '+failed+' 份快取保存失敗；請確認硬碟空間與權限');
 folderMessage='已連接：'+selected.name+'；已找回 '+restored.length+' 個系統快取；已保存 '+saved+' 份快取'+(remembered?'':'；此分頁關閉後需重新選擇');
 announceFolderRestore(restored);return folderMessage;
}
async function reconnectFolder(){
 const h=await loadFolder();if(!h)return connectFolder();
 if(await h.requestPermission({mode:'readwrite'})!=='granted')throw new Error('尚未授權資料夾，仍使用瀏覽器快取');
 const restored=await restoreFolderSystems();folderMessage='已重新連接：'+h.name+'；已找回 '+restored.length+' 個系統快取';emitFolderSync();announceFolderRestore(restored);return folderMessage;
}
async function disconnectFolder(){
 await flushFolder();await folderWrites;folderHandle=null;folderLoaded=true;
 await folderSetting(null).catch(()=>{});folderMessage='已停止使用資料夾；硬碟檔案仍保留';emitFolderSync();return folderMessage;
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
 await flushFolder();clearMemory();
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
// Display-only data: current account/scope, no intervening edit, no permission from payload.
async function getDisplaySnapshot(sys,options={}){
 const scope=displayScope(),viewer=viewerKey(),credential=token();
 let timer,row;
 const timeoutMs=Math.min(10000,Math.max(1500,Number(options.timeoutMs)||1500));
 try{row=await Promise.race([getSystemSnapshot(sys),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs)})]);}finally{clearTimeout(timer)}
 if(!row||!credential||viewer!==viewerKey()||credential!==token()||scope!==displayScope()||row.data?.ok!==true||row.savedAt<mutationStamp()||row.savedAt>Date.now()+60000)return null;
 if(row.displayScope!==undefined&&row.displayScope!==scope)return null;
 if(row.cacheEndpoint&&row.cacheEndpoint!==gasUrl())return null;
 // Legacy snapshots predate scope metadata. Only the same superadmin has unrestricted scope.
 if(row.displayScope===undefined&&!viewer.endsWith('@superadmin'))return null;
 if(options.month&&row.scope?.month&&row.scope.month!==options.month)return null;
 if(options.month&&/^\d{4}-\d{2}$/.test(String(row.data.month||''))&&row.data.month!==options.month)return null;
 if(options.month&&row.scope?.year&&String(row.scope.year)!==options.month.slice(0,4))return null;
 return row;
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
// Explicit export cache: never treat a partial month response as a complete raw export.
const exportSnapshotReads=new Map();
function readExportSnapshotRow(key){
 if(!exportSnapshotReads.has(key)){
  const pending=get(key).catch(()=>null).finally(()=>{if(exportSnapshotReads.get(key)===pending)exportSnapshotReads.delete(key)});
  exportSnapshotReads.set(key,pending);
 }
 return exportSnapshotReads.get(key);
}
function exportSnapshotKey(action,month){return systemKey(action==='getScheduleDataSecure'?'schedule':'attendance')+'|export|'+month;}
function validExportPayload(action,month,data){
 if(data?.ok!==true||String(data.month||'')!==month)return false;
 return action==='getAttendanceMonthRaw'?Array.isArray(data.records):Array.isArray(data.schedules)&&data.schedules.every(r=>String(r.month||'')===month);
}
async function getExportSnapshot(action,month){
 if(!['getAttendanceMonthRaw','getScheduleDataSecure'].includes(action)||!/^\d{4}-\d{2}$/.test(month)||!token())return null;
 const viewer=viewerKey(),credential=token(),valid=row=>row&&currentViewerRow(row)&&row.savedAt>0&&row.savedAt>=mutationStamp()&&row.savedAt<=Date.now()+60000;
 const row=await get(exportSnapshotKey(action,month)).catch(()=>null);
 if(viewer!==viewerKey()||credential!==token())return null;
 const exact=()=>valid(row)&&validExportPayload(action,month,row.data)?{data:row.data,savedAt:row.savedAt}:null;
 if(action==='getScheduleDataSecure'){
  const cached=await getSchedulePreview(month).catch(()=>null);
  if(viewer!==viewerKey()||credential!==token())return null;
  const prior=exact();
  return cached?.savedAt>=mutationStamp()&&cached.data.schedules.length&&(!prior||cached.savedAt>prior.savedAt)?cached:prior;
 }
 const full=await readExportSnapshotRow(systemKey('attendance')),data=full?.data;
 if(viewer!==viewerKey()||credential!==token())return null;
 const prior=exact();
 if(!valid(full)||!data?.fullDatabase||!Array.isArray(data.records)||!Array.isArray(data.months)||!data.months.includes(month)||!data.monthStats?.some(m=>m.month===month&&m.ok===true)||prior&&prior.savedAt>=full.savedAt)return prior;
 const records=data.records.filter(record=>{
  const m=String(record.timeStr||'').match(/^(\d{3,4})[-/](\d{1,2})[-/]/);if(!m)return false;
  const year=Number(m[1])<1911?Number(m[1])+1911:Number(m[1]);
  return year+'-'+m[2].padStart(2,'0')===month;
 });
 return {data:{ok:true,month,records},savedAt:full.savedAt};
}
async function storeExportSnapshot(action,month,data,expectedViewer,expectedToken,readAt=Date.now()){
 if(!/^\d{4}-\d{2}$/.test(month)||!token()||viewerKey()!==expectedViewer||token()!==expectedToken||!['getAttendanceMonthRaw','getScheduleDataSecure'].includes(action))return false;
 const payload={...data,month};if(!validExportPayload(action,month,payload)||readAt<mutationStamp())return false;
 const key=exportSnapshotKey(action,month),snapshot=JSON.parse(JSON.stringify(payload));
 const old=await get(key).catch(()=>null);
 if(viewerKey()!==expectedViewer||token()!==expectedToken||old?.savedAt>readAt)return false;
 await put({key,kind:'system',system:action==='getScheduleDataSecure'?'schedule':'attendance',month,savedAt:readAt,size:safeSize(snapshot),data:snapshot});return true;
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
 if(sys){const u=urlInfo(url).u,scope=Object.fromEntries(['month','year','scope','type'].filter(k=>u?.searchParams.has(k)).map(k=>[k,u.searchParams.get(k)]));await put({key:systemKey(sys),kind:'system',system:sys,scope,savedAt:Date.now(),size:safeSize(data),data});}
}
function jsonResponse(data,cacheState='1'){
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json;charset=UTF-8','X-PORT79-CACHE':cacheState}});
}

async function getHistoryPreview(url){
 const info=urlInfo(url),key=actionKey(url),viewer=viewerKey(),credential=token();
 if(!credential||info.action!=='historyGetMonthData'||!key)return null;
 const row=await get(key).catch(()=>null);
 if(!row||viewer!==viewerKey()||credential!==token()||row.data?.ok!==true||row.savedAt<mutationStamp()||row.savedAt>Date.now()+60000)return null;
 // Historical previews are read-through caches, not permanent snapshots. An expired
 // vessel/attendance/schedule month must reach the formal cloud source again.
 const ttl=cacheFreshTtl(info.action,info.u);
 if(!(ttl>0)||Date.now()-row.savedAt>=ttl)return null;
 if(row.data.month&&row.data.month!==info.u.searchParams.get('month'))return null;
 return {...row.data,sourceLabel:'本機歷史快取 · '+fmtTime(row.savedAt)};
}
const rawFetch=window.fetch.bind(window);
function nativeFetch(input,init){
 const url=typeof input==='string'?input:input?.url||String(input);
 const method=String(init?.method||input?.method||'GET').toUpperCase(),info=urlInfo(url);
 const key=method==='GET'?actionKey(url):null;
 const viewer=viewerKey(),credential=token(),generation=mutationGeneration,startedAt=Date.now(),scope=displayScope();
 const requestCredentials=['token','userToken','gcToken','adminToken'].map(k=>info.u?.searchParams.get(k)).filter(Boolean);
 return rawFetch(input,init).then(response=>{
  if(key){
   readVersions.set(info.action,(readVersions.get(info.action)||0)+1);
   if(response.ok){
    // Parsing and both disk stores run in the background, never on the response path.
    void response.clone().json().then(async data=>{
     if(data?.ok!==true||data.retryable||!requestCredentials.length||requestCredentials.some(t=>t!==credential)||viewer!==viewerKey()||credential!==token()||!credential||generation!==mutationGeneration||scope!==displayScope())return;
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
 // 下載只在用到 試算表 時才執行；來源故障時依序備援，下一次可重新嘗試。
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
     const timer=setTimeout(()=>finish(new Error('試算表 下載超時')),12000);
     function finish(error){
      if(settled)return;
      settled=true;clearTimeout(timer);
      tag.onload=null;tag.onerror=null;
      if(error){tag.remove();reject(error)}
      else resolve();
     }
     tag.onload=()=>window.XLSX?finish(null):finish(new Error('試算表 元件不完整'));
     tag.onerror=()=>finish(new Error('試算表 來源連線失敗'));
     document.head.appendChild(tag);
    });
    if(window.XLSX)return window.XLSX;
   }catch(error){lastError=error}
  }
  throw new Error('所有 試算表 下載來源均無法使用，請檢查網路連線：'+(lastError?.message||''));
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
async function fetchJson(action,params={},sys='',readOptions={}){
 // Only explicit interactive batches use the short bound; scheduled reads
 // and business operations retain the original 60-second timeout.
 const timeoutMs=readOptions?.interactive===true?30000:DOWNLOAD_TIMEOUT_MS;
 // Startup must not hold the whole desktop session on a slow historical
 // catalog. A real failure is still reported as incomplete, never success.
 const boundedTimeoutMs=action==='getHistoricalDataCatalog'&&readOptions?.resumeExisting===true?
  12000:timeoutMs;
 const viewer=viewerKey(),credential=token();
 if(!credential)throw Object.assign(new Error('請先由首頁重新登入，再下載資料'),{code:'P79_AUTH'});
 let url=buildUrl(action,params),lastError;
 const primary=new URL(url),canonical=new URL(CANONICAL_GAS_URL);
 if(!validDownloadGasUrl(primary.toString()))throw new Error('雲端網址設定不正確，請由首頁重新進入系統');
 const labels={getAttendanceMonths:'考勤月份清單',getAttendanceEmployeeMaster:'員工主檔',getAttendanceMonthData:'考勤月份資料',getAttendanceMainDirect:'考勤主表',getLeaveData:'請假',getScheduleDataSecure:'排班',gcGetData:'效率',hrGetEmployees:'人資',getHistoricalDataCatalog:'歷史資料',historyGetMonthData:'歷史月份資料'};
 const label=labels[action]||'雲端資料';
 for(let attempt=0;attempt<4;attempt++){
  const c=new AbortController();let timedOut=false,data;
  const to=setTimeout(()=>{timedOut=true;c.abort()},boundedTimeoutMs);
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
    // A transient server lock may be returned without retryable:true by older deployments.
    // GET requests are read-only and safe to retry; never retry auth/permission failures.
    const busyRead=/雲端目前正在(?:更新|處理)|資料(?:更新中|處理中)|cloud (?:busy|updating)/i.test(message);
    const permission=/沒有.*權限|無權|禁止|拒絕|未授權|permission denied/i.test(message);
    const delay=Number(data.retryAfterMs);
    throw Object.assign(new Error(label+'：'+message),{
     code:auth?'P79_AUTH':'P79_CLOUD',
     retryable:!auth&&!permission&&(data.retryable===true||busyRead),
     busyRetry:!auth&&!permission&&busyRead,
     retryAfterMs:Number.isFinite(delay)&&delay>0?Math.min(5000,Math.max(500,delay)):0
    });
   }
   if(viewerKey()!==viewer||token()!==credential)throw Object.assign(new Error('登入狀態已變更，未保存其他帳號資料'),{code:'P79_AUTH'});
  }catch(error){
   if(timedOut||error?.name==='AbortError')error=Object.assign(new Error(label+'：雲端讀取逾時（'+Math.round(boundedTimeoutMs/1000)+' 秒），請稍後重試'),{retryable:true,code:'P79_TRANSPORT'});
   else if(error?.name==='TypeError')error=Object.assign(new Error(label+'：無法連接雲端，請檢查網路'),{retryable:true,code:'P79_TRANSPORT'});
   lastError=error;
   if(!error.retryable||attempt===3||(attempt>=1&&!error.busyRetry))throw error;
   // Only safe reads are retried. A retired deployment may recover through the
   // same official /exec URL used by the system entrance; never change access.
   const next=new URL(url);
   if(error.status===404||/回傳網頁/.test(error.message)){
    next.protocol=canonical.protocol;next.host=canonical.host;next.pathname=canonical.pathname;
   }
   next.searchParams.set('_',String(Date.now()+attempt+1));url=next.toString();
   if(error.busyRetry){
    const waitMs=error.retryAfterMs||[750,1500,2500][attempt];
    setProgress(label+'：雲端更新中，等待後自動重試（'+(attempt+2)+'/4），已成功的本機資料不會清除…');
    await new Promise(resolve=>setTimeout(resolve,waitMs));
   }else setProgress(label+'連線未完成，正在重試一次…');
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
const attendanceDownloads=new Map();
function downloadAttendanceDatabase(targetSys='attendance',onProgress,readOptions={}){
 const key=viewerKey()+'|'+token()+'|'+gasUrl();
 if(attendanceDownloads.has(key))return attendanceDownloads.get(key);
 const pending=readAttendanceDatabase(targetSys,onProgress,readOptions).finally(()=>{if(attendanceDownloads.get(key)===pending)attendanceDownloads.delete(key)});
 attendanceDownloads.set(key,pending);return pending;
}
function verifyAttendanceDownloadContext(expected){
 if(expected.token!==token()||expected.viewer!==viewerKey())
  throw Object.assign(new Error('登入帳號或憑證確實已變更；未保存舊帳號的考勤資料，請重新登入'),{code:'P79_AUTH'});
 if(expected.scope!==displayScope())
  throw Object.assign(new Error('管理權限範圍在下載期間已更新；為避免不同範圍資料混用，請重新核對後再下載'),{code:'P79_SCOPE'});
 if(expected.stamp!==mutationStamp())
  throw Object.assign(new Error('考勤下載期間偵測到其他資料修改，已保留原快取並停止儲存舊版本；請重新下載考勤'),{code:'P79_MUTATION'});
}
async function readAttendanceDatabase(targetSys='attendance',onProgress,readOptions={}){
 const t=token(),viewer=viewerKey(),scope=displayScope(),stamp=mutationStamp();
 const expected={token:t,viewer,scope,stamp};
 if(!t)throw new Error('找不到登入 Token，請重新由首頁登入');
 const previous=await getDisplaySnapshot('attendance').catch(()=>null);
 const before=await fetchJson('getSyncMeta',{token:t},'',readOptions).catch(error=>{if(['P79_AUTH','P79_TRANSPORT'].includes(error?.code))throw error;return null;});
 onProgress?.('attendance',0,1,'catalog','讀取月份清單');
 const catalog=await fetchJson('getAttendanceMonths',{token:t},'',readOptions);
 if(!Array.isArray(catalog?.months))throw new Error('考勤月份清單格式不正確，請重新下載');
 const months=[...new Set((Array.isArray(catalog?.months)?catalog.months:[]).filter(m=>/^\d{4}-\d{2}$/.test(String(m))))].sort();
 if(!months.length)months.push(ymNow());

 onProgress?.('attendance',0,months.length+1,'master','讀取員工主檔');
 const master=await fetchJson('getAttendanceEmployeeMaster',{token:t},'',readOptions);
 if(!Array.isArray(master?.employees))throw new Error('員工主檔格式不正確，已保留原有快取');
 const employees=master.employees;
 // Incomplete month downloads were previously lost on page navigation.
 // Persist each verified month only under the same account/scope/endpoint
 // and a stable server revision. A changed revision invalidates all chunks.
 const cloudRevision=String(before?.revision||'');
 const monthCheckpointSignature=cloudRevision?JSON.stringify([
  cloudRevision,String(catalog.revision||''),String(master.revision||''),months,employees
 ]):'';
 const checkpointMaxAgeMs=24*60*60*1000;
 async function checkpointMonth(month){
  if(!monthCheckpointSignature)return null;
  const row=await get(systemKey('attendance')+'|checkpoint|'+month).catch(()=>null);
  if(!row||!currentViewerRow(row)||row.kind!=='system'||row.system!=='attendance'||
     row.displayScope!==scope||row.cacheEndpoint!==gasUrl()||
     row.savedAt<stamp||row.savedAt>Date.now()+60000||
     Date.now()-row.savedAt>checkpointMaxAgeMs||
     row.data?.signature!==monthCheckpointSignature||
     !Array.isArray(row.data?.rows)||row.data?.month!==month)return null;
  return row.data.rows;
 }
 async function storeMonthCheckpoint(month,rows){
  if(!monthCheckpointSignature)return;
  verifyAttendanceDownloadContext(expected);
  const data={ok:true,month,rows,signature:monthCheckpointSignature};
  // Checkpoints are a best-effort acceleration, never a prerequisite for
  // valid business data. Browser/test contexts without IndexedDB must still
  // finish a correct full download rather than fail each historical month.
  try{
   await put({key:systemKey('attendance')+'|checkpoint|'+month,
    kind:'system',system:'attendance',savedAt:Date.now(),size:safeSize(data),data});
  }catch(error){
   console.warn('考勤月份快取暫時無法保存；繼續正常下載',String(error?.message||error));
  }
 }
 // The catalog alone has no revision. Compare an explicit cloud revision and the
 // authenticated scoped master, never a timestamp or another viewer's folder.
 const old=previous?.data;
 if(before?.revision&&old?.sourceRevision===String(before.revision)&&old.fullDatabase===true&&
    previous.cacheEndpoint===gasUrl()&&previous.displayScope===scope&&
    JSON.stringify(old.months)===JSON.stringify(months)&&JSON.stringify(old.employees)===JSON.stringify(employees)&&
    months.every(month=>old.monthStats?.some(m=>m.month===month&&m.ok===true))&&Array.isArray(old.records)){
  verifyAttendanceDownloadContext(expected);
   const confirmed=await fetchJson('getSyncMeta',{token:t},'',readOptions).catch(error=>{if(['P79_AUTH','P79_TRANSPORT'].includes(error?.code))throw error;return null;});
  verifyAttendanceDownloadContext(expected);
   if(String(confirmed?.revision||'')===String(before.revision)){
   onProgress?.('attendance',months.length,months.length,'reused','雲端版本未變，重用電腦完整快取');
   if(targetSys==='attendance'||targetSys==='workhours')await applyAttendanceSnapshotToPage(old,true);
   return {...old,reusedCache:true};
   }
 }

 // Native Windows: two bounded read-only workers; browser: existing sequential behavior.
 // Each worker makes at most one GAS request at a time and stores no full snapshot
 // until all months and the final account/version checks succeed.
 const workerCount=window.chrome?.webview?.postMessage?2:1;
 const monthResults=new Array(months.length);
 let nextMonth=0,completedMonths=0,fatal=null;
 async function worker(){
  while(nextMonth<months.length&&!fatal){
   const i=nextMonth++,month=months[i];
   try{
    verifyAttendanceDownloadContext(expected);
    const resumed=await checkpointMonth(month);
    if(resumed){
     verifyAttendanceDownloadContext(expected);
     monthResults[i]={month,rows:resumed,ok:true,reused:true};
     completedMonths++;
     onProgress?.('attendance',completedMonths,months.length,'monthDone',
      `沿用已完成的 ${month} 快取｜${completedMonths}/${months.length} 月`);
     continue;
    }
    onProgress?.('attendance',completedMonths,months.length,'month',`正在讀取 ${month}｜已完成 ${completedMonths}/${months.length} 月`);
    const d=await fetchJson('getAttendanceMonthData',{month,token:t},'',readOptions);
    if(!Array.isArray(d?.records))throw new Error('考勤月份資料格式不正確');
    const direct=await fetchJson('getAttendanceMainDirect',{month,token:t},'',readOptions);
    if(!Array.isArray(direct?.records))throw new Error('考勤主表資料格式不正確');
    verifyAttendanceDownloadContext(expected);
    const rows=direct.records.length?mergeAttendanceRows(d.records.concat(direct.records)):d.records;
    monthResults[i]={month,rows,ok:true};
    await storeMonthCheckpoint(month,rows);
   }catch(e){
    if(['P79_AUTH','P79_SCOPE','P79_TRANSPORT','P79_MUTATION'].includes(e?.code)){
     fatal=fatal||e;return;
    }
    monthResults[i]={month,rows:[],ok:false,error:String(e?.message||e)};
   }
   completedMonths++;
   onProgress?.('attendance',completedMonths,months.length,'monthDone',`已完成 ${month}｜${completedMonths}/${months.length} 月`);
  }
 }
 await Promise.all(Array.from({length:Math.min(workerCount,months.length)},()=>worker()));
 if(fatal)throw fatal;
 verifyAttendanceDownloadContext(expected);
 const monthStats=monthResults.map(x=>({month:x.month,count:x.rows.length,ok:x.ok,...(x.ok?{}:{error:x.error})}));
 const failedMonths=monthStats.filter(x=>!x.ok);
 if(failedMonths.length)throw new Error('考勤／工時未完整下載：'+failedMonths.map(x=>x.month+'（'+x.error+'）').join('、')+'；已保留原有完整快取，請重試');
 // Do record de-duplication once rather than on every month (quadratic cost).
 const allRecords=mergeAttendanceRows(monthResults.flatMap(x=>x.rows));
 const after=await fetchJson('getSyncMeta',{token:t},'',readOptions).catch(error=>{if(['P79_AUTH','P79_TRANSPORT'].includes(error?.code))throw error;return null;});
 verifyAttendanceDownloadContext(expected);
 // A revision may change while a full download is running. Preserve the
 // original completed-data behavior, but mark sourceRevision='' below so it
 // can NEVER be reused as an unchanged cloud revision on the next visit.
 if(cloudRevision&&String(after?.revision||'')!==cloudRevision)
  console.warn('雲端考勤版本於讀取期間變更，完整快取將在下次重新核對');
 const snapshot={
  sourceRevision:before?.revision&&String(before.revision)===String(after?.revision)?String(before.revision):'',
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
// Browser/WebView2 quick warm-up: no executable, no external folder and no
// automatic full-history download. The home screen may call preloadCurrent()
// during login; by default it warms only already verified local snapshots.
// Live preloading happens only when the operator explicitly clicks the quick
// prefetch control in the cache centre.
let quickPreloadPromise=null;
function permittedQuickSystems(){
 let session=null;
 try{session=JSON.parse(sessionStorage.getItem('port79_user_session')||
  sessionStorage.getItem('admin_session')||'null')}catch(_){}
 const role=String(session?.adminRole||session?.role||'').toLowerCase();
 if(!session||session.punchOnly===true||!['admin','superadmin'].includes(role)||!token())return [];
 const permissions=session.systemPermissions||{};
 return ['hr','schedule','leave'].filter(sys=>
   role==='superadmin'||['view','edit','manage'].includes(String(permissions[sys]||'').toLowerCase()));
}
function quickPreloadSameContext(ctx){
 return ctx.viewer===viewerKey()&&ctx.token===token()&&ctx.scope===displayScope()&&
   ctx.gas===gasUrl()&&ctx.stamp===mutationStamp()&&
   window.__port79CachedSessionRefreshPending!==true;
}
async function preloadCurrent(options={}){
 const network=options.network===true;
 if(window.__port79CachedSessionRefreshPending===true)return {status:'verifying',results:[]};
 const systems=permittedQuickSystems();
 if(!systems.length)return {status:'denied',results:[]};
 if(network&&quickPreloadPromise)return quickPreloadPromise;
 const ctx={viewer:viewerKey(),token:token(),scope:displayScope(),gas:gasUrl(),stamp:mutationStamp()};
 const task=(async()=>{
  const results=[];
  for(const sys of systems){
   if(!quickPreloadSameContext(ctx))return {status:'changed',results};
   const cached=await getDisplaySnapshot(sys,{timeoutMs:1200,month:sys==='efficiency'?ymNow():undefined}).catch(()=>null);
   if(!quickPreloadSameContext(ctx))return {status:'changed',results};
   if(cached&&(!network||Date.now()-Number(cached.savedAt||0)<30000)){
    options.onProgress?.(sys,'reused');
    results.push({system:sys,ok:true,reused:true});
    continue;
   }
   if(!network){
    results.push({system:sys,ok:false,skipped:true});
    continue;
   }
   options.onProgress?.(sys,'loading');
   try{
    if(window.navigator?.onLine===false)throw Error('瀏覽器目前離線');
    const data=await downloadSystem(sys,null,{interactive:true});
    if(!quickPreloadSameContext(ctx))return {status:'changed',results};
    if(data?.ok!==true)throw Error('雲端尚未回傳完整資料');
    options.onProgress?.(sys,'done');
    results.push({system:sys,ok:true});
   }catch(error){
    if(!quickPreloadSameContext(ctx))return {status:'changed',results};
    const message=String(error?.message||error);
    options.onProgress?.(sys,'error',message);
    results.push({system:sys,ok:false,error:message});
    if(['P79_AUTH','P79_SCOPE'].includes(error?.code))break;
   }
  }
  return {status:network?'completed':'local',results};
 })();
 if(!network)return task;
 quickPreloadPromise=task;
 try{return await task}finally{if(quickPreloadPromise===task)quickPreloadPromise=null}
}
window.addEventListener?.('port79-home-session-refreshed',()=>{void preloadCurrent().catch(()=>{});});
async function downloadSystem(sys,onProgress,readOptions={}){
 const t=token(),m=ymNow();
 if(sys==='attendance'||sys==='workhours')return downloadAttendanceDatabase(sys,onProgress,readOptions);
 if(sys==='leave')return fetchJson('getLeaveData',{token:t},sys,readOptions);
 if(sys==='schedule')return fetchJson('getScheduleDataSecure',{token:t},sys,readOptions);
 if(sys==='efficiency')return fetchJson('gcGetData',{token:t,month:m,scope:'month'},sys,readOptions);
 if(sys==='hr')return fetchJson('hrGetEmployees',{token:t},sys,readOptions);
 if(sys==='history'){
  // The seven-system startup is a catalog sync, not a bulk download of every
  // historical category. Existing month snapshots remain intact and the
  // History page fetches a requested month when opened. In particular,
  // one slow vessel month may not turn a valid catalog into endless 6/7.
  const catalog=await fetchJson('getHistoricalDataCatalog',{token:t},sys,readOptions);
  if(!catalog||catalog.ok!==true)throw new Error('歷史月份目錄尚未取得');
  if(readOptions?.prefetchHistoricalMonths===true){
   for(const type of ['attendance','schedule','vessel']){
    try{await fetchJson('historyGetMonthData',{token:t,type,month:m},'',readOptions)}
    catch(e){
     if(['P79_AUTH','P79_SCOPE','P79_TRANSPORT'].includes(e?.code))throw e;
    }
   }
  }
  return catalog;
 }
 throw new Error('未知系統：'+sys);
}
// Successfully downloaded independent systems are persisted in IndexedDB, not
// just in lastAllDownload's page-local three-minute memory.
const SYSTEM_REUSE_MAX_AGE_MS=30*60*1000;
// Automatic app startup must resume verified IndexedDB data instead of
// downloading all seven systems again every 30 minutes. This is a bounded
// offline-first resume (24 h), not a claim that the cloud is unchanged;
// the explicit tray/cloud-center refresh still performs live cloud reads.
const SYSTEM_AUTO_RESUME_MAX_AGE_MS=24*60*60*1000;
async function startupCachedSystem(sys,scopeAtStart){
 if(!['attendance','workhours','leave','schedule','efficiency','hr','history'].includes(sys))return null;
 const snapshot=await getDisplaySnapshot(sys,{timeoutMs:3500}).catch(()=>null);
 if(!snapshot||snapshot.data?.ok!==true||snapshot.kind!=='system'||snapshot.system!==sys||
    snapshot.displayScope!==scopeAtStart||!Number.isFinite(Number(snapshot.savedAt)))return null;
 if(Date.now()-Number(snapshot.savedAt)>SYSTEM_AUTO_RESUME_MAX_AGE_MS)return null;
 if(sys==='efficiency'&&snapshot.month!==ymNow())return null;
 if(sys==='schedule'&&snapshot.scope?.month&&snapshot.scope.month!==ymNow())return null;
 if(sys==='attendance'||sys==='workhours'){
  const data=snapshot.data;
  if(!data.fullDatabase||!Array.isArray(data.months)||!Array.isArray(data.monthStats)||
     data.monthStats.length!==data.months.length||data.monthStats.some(x=>x.ok!==true))return null;
 }
 return snapshot;
}

async function reusableSystemDownload(sys,scopeAtStart){
 if(!['leave','schedule','efficiency','hr','history'].includes(sys))return null;
 const snapshot=await getDisplaySnapshot(sys,{timeoutMs:3500}).catch(()=>null);
 if(!snapshot||snapshot.data?.ok!==true||snapshot.displayScope!==scopeAtStart)return null;
 if(Date.now()-Number(snapshot.savedAt)>SYSTEM_REUSE_MAX_AGE_MS)return null;
 if(snapshot.system!==sys||snapshot.kind!=='system')return null;
 // The current month is part of scoped, mutable efficiency results.
 if(sys==='efficiency'&&snapshot.month!==ymNow())return null;
 return snapshot;
}
let lastAllDownload=null;
async function downloadAll(onProgress,options={}){
 // Interactive Windows batches show usable independent system data before the
 // long multi-month attendance scan. The legacy API retains its original order.
 const fastFirst=options?.quickFirst===true;
 const resumeExisting=fastFirst&&options?.resumeExisting===true;
 // Windows does not require a historical catalog to open the management
 // dashboard. History is read on demand for the selected month by the
 // dedicated history-data page, preserving every existing historical cache.
 // Never count optional/unrequested history as a failed 7th system.
 const historyOnDemand=options?.historyOnDemand===true;
 const systems=(fastFirst?['leave','schedule','efficiency','hr','history','attendance','workhours']:
  ['attendance','workhours','leave','schedule','efficiency','hr','history'])
  .filter(sys=>!historyOnDemand||sys!=='history');
 const result=[];
 const readOptions=fastFirst?{interactive:true,...(resumeExisting?{resumeExisting:true}:{})}:{};
 const batchViewer=viewerKey(),batchToken=token(),batchScope=displayScope(),batchGas=gasUrl(),batchStamp=mutationStamp();
 // Within a short same-login retry, keep the six successful snapshots and fetch
 // only modules that actually failed. A new session/scope or later refresh starts fresh.
 const batchKey=[viewerKey(),token(),gasUrl(),displayScope(),mutationStamp()].join('|');
 const prior=lastAllDownload?.key===batchKey&&Date.now()-lastAllDownload.at<180000&&
             lastAllDownload.result.some(row=>!row.ok)?lastAllDownload.result:null;
 let attendanceSnapshot=null,attendanceError=null,connectionError=null,consecutiveTransportFailures=0;
 for(let i=0;i<systems.length;i++){
  const sys=systems[i];
  if(prior?.some(row=>row.system===sys&&row.ok)){
   consecutiveTransportFailures=0;
   result.push({system:sys,ok:true,reused:true});
   onProgress?.(sys,i,systems.length,'reused',null,'此系統先前已完成，沿用快取');
   continue;
  }
  // Startup resumes exact-viewer, exact-scope stored snapshots within 24 h.
  // Manual refresh deliberately does NOT use this long reuse window.
  // In both modes a snapshot failing permission, endpoint or edit checks is
  // reloaded, never silently presented as a verified latest cloud response.
  if(fastFirst&&await (resumeExisting?startupCachedSystem(sys,batchScope):reusableSystemDownload(sys,batchScope))){
   if(batchViewer!==viewerKey()||batchToken!==token()||
      batchScope!==displayScope()||batchGas!==gasUrl()||batchStamp!==mutationStamp())
    throw Object.assign(new Error('登入或管理權限已變更，停止沿用快取'),{code:'P79_SCOPE'});
   consecutiveTransportFailures=0;
   result.push({system:sys,ok:true,reused:true});
   onProgress?.(sys,i,systems.length,'reused',null,resumeExisting?
    '沿用已保存本機資料（24 小時內）；未重抓，雲端最新狀態可手動重新核對':
    '沿用本機已完成的雲端快取（30 分鐘內）');
   continue;
  }
  // Treat remaining untouched modules as skipped after an identity/scope/transport failure.
  if(connectionError){
   result.push({system:sys,ok:false,skipped:true,error:'前一項雲端讀取中斷，尚未下載；原因：'+String(connectionError.message||connectionError)});
   onProgress?.(sys,i,systems.length,'skipped',connectionError);
   continue;
  }
  onProgress?.(sys,i,systems.length,'loading');
  try{
   if(sys==='attendance')attendanceSnapshot=await downloadAttendanceDatabase('attendance',(s,mi,mt,state,label)=>onProgress?.(sys,i,systems.length,'detail',null,`${label||state} ${mi}/${mt}`,{monthCompleted:mi,monthTotal:mt}),readOptions);
   else if(sys==='workhours'&&attendanceError)throw attendanceError;
   else if(sys==='workhours'&&attendanceSnapshot){await saveSystemSnapshot('workhours',attendanceSnapshot);if(currentSystem()==='workhours')await applyAttendanceSnapshotToPage(attendanceSnapshot,true)}
   else{
    const payload=await downloadSystem(sys,null,readOptions);
    if(fastFirst&&['leave','schedule','efficiency','hr','history'].includes(sys)&&payload?.ok===true){
     if(batchViewer!==viewerKey()||batchToken!==token()||batchScope!==displayScope()||
        batchGas!==gasUrl()||batchStamp!==mutationStamp())
      throw Object.assign(new Error('登入權限變更，拒絕保存舊帳號資料'),{code:'P79_SCOPE'});
     await saveSystemSnapshot(sys,payload);
     // Efficiency is month-scoped; do not reuse it after the month changes.
     if(sys==='efficiency'){
      const row=await getSystemSnapshot(sys);
      if(row){row.month=ymNow();await put(row);}
     }
    }
   }
   consecutiveTransportFailures=0;
   result.push({system:sys,ok:true});onProgress?.(sys,i,systems.length,'done');
  }catch(e){
   // Account/scope changes remain fatal. A single module's transport failure
   // must not discard already authenticated independent systems. If two
   // consecutive modules cannot reach GAS, stop to avoid 7 long timeouts.
   if(['P79_AUTH','P79_SCOPE'].includes(e?.code)||
      (e?.code==='P79_TRANSPORT'&&(!fastFirst||++consecutiveTransportFailures>=2)))connectionError=e;
   if(sys==='attendance')attendanceError=e;
   result.push({system:sys,ok:false,error:String(e?.message||e)});
   onProgress?.(sys,i,systems.length,'error',e);
  }
 }
 if(currentSystem()==='attendance'&&attendanceSnapshot)await applyAttendanceSnapshotToPage(attendanceSnapshot,true);
 lastAllDownload={key:batchKey,at:Date.now(),result};
 return result;
}

function ensureStyle(){if(document.getElementById('p79CacheStyle'))return;const s=document.createElement('style');s.id='p79CacheStyle';s.textContent=`
#p79CacheBackdrop{position:fixed;inset:0;z-index:16000;background:rgba(2,6,23,.5);display:none;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(5px)}
#p79CacheBackdrop.open{display:flex}#p79CacheModal{width:min(780px,100%);max-height:min(84vh,820px);overflow:auto;background:#fff;color:#0f172a;border-radius:22px;border:1px solid #e2e8f0;box-shadow:0 30px 80px rgba(2,6,23,.35);padding:18px}
.dark #p79CacheModal{background:#0f172a;color:#e2e8f0;border-color:#334155}.p79-cache-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px}.p79-cache-title{font-size:20px;font-weight:950}.p79-cache-sub{font-size:11px;color:#64748b;margin-top:3px}.dark .p79-cache-sub{color:#94a3b8}.p79-cache-close{border:1px solid #cbd5e1;background:#fff;border-radius:10px;width:36px;height:36px;font-weight:900}.dark .p79-cache-close{background:#111827;color:#e5e7eb;border-color:#475569}
.p79-cache-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.p79-cache-row{border:1px solid #e2e8f0;border-radius:14px;padding:11px 12px;background:#f8fafc}.dark .p79-cache-row{background:#111827;border-color:#334155}.p79-cache-row b{display:block;font-size:13px}.p79-cache-meta{font-size:11px;color:#64748b;margin-top:5px;line-height:1.45}.dark .p79-cache-meta{color:#94a3b8}.p79-cache-state{font-size:11px;font-weight:900;margin-top:5px;color:#047857}.p79-cache-state.error{color:#be123c}.p79-cache-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px;padding-top:14px;border-top:1px solid #e2e8f0}.dark .p79-cache-actions{border-color:#334155}.p79-cache-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:12px;padding:10px 13px;font-size:12px;font-weight:900;cursor:pointer}.p79-cache-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.p79-cache-btn.all{background:#0f766e;border-color:#0f766e;color:#fff}.p79-cache-btn.danger{color:#be123c}.p79-cache-btn:disabled{opacity:.5;cursor:not-allowed}.dark .p79-cache-btn:not(.primary):not(.all){background:#111827;color:#e2e8f0;border-color:#475569}.p79-cache-note{margin-top:12px;padding:10px 12px;border-radius:12px;background:#eff6ff;color:#1e40af;font-size:11px;line-height:1.55}.dark .p79-cache-note{background:rgba(30,64,175,.18);color:#bfdbfe}
@media(max-width:680px){.p79-cache-grid{grid-template-columns:1fr}#p79CacheModal{padding:14px}}
`;document.head.appendChild(s)}

// The web browser must keep cloud downloads in a separate same-origin tab:
// fetches attached to the current management page stop on navigation.
// This tab inherits the opener's authorized sessionStorage (no token in URL).
function startBrowserBackgroundDownload(action,system){
 const key='p79BrowserCacheProgressV1';
 let prior=null;
 try{prior=JSON.parse(localStorage.getItem(key)||'null')}catch(_){}
 if(prior?.viewer===viewerKey()&&prior.phase==='downloading'&&
   Date.now()-Number(prior.updatedAt||0)<90000){
  setProgress('背景下載仍在進行：'+String(prior.detail||'').slice(0,110)+'。請查看右下角進度並保留背景下載分頁。');
  return true;
 }
 const loader=document.querySelector('script[src*="port79-data-cache.js"]');
 if(!loader?.src)return false;
 const url=new URL('port79-browser-background.html',loader.src);
 url.searchParams.set('mode',action);
 if(action==='current')url.searchParams.set('system',system);
 // The direct user click must synchronously open the tab or popup blockers win.
 const tab=window.open(url.href,'port79_browser_cache_download');
 if(!tab){
  setProgress('瀏覽器封鎖了背景下載分頁。請允許此網站開啟彈出式視窗後再按一次下載。');
  return true;
 }
 setProgress('下載已交給背景分頁；可關閉此視窗、切換排班或考勤。請保持背景下載分頁開啟，右下角會顯示目前進度。');
 return true;
}
function ensureModal(){
 ensureStyle();let b=document.getElementById('p79CacheBackdrop');if(b)return b;
 b=document.createElement('div');b.id='p79CacheBackdrop';b.innerHTML=`<div id="p79CacheModal" role="dialog" aria-modal="true"><div class="p79-cache-head"><div><div class="p79-cache-title">☁️ 79號碼頭雲端資料庫</div><div class="p79-cache-sub">本機加速讀取，修改仍透過各系統同步雲端。</div></div><button class="p79-cache-close" type="button">✕</button></div><div id="p79DeviceStatus" class="p79-cache-note" role="status"></div><div class="p79-cache-actions"><button class="p79-cache-btn" data-cache-action="folder">選擇電腦資料夾</button><button class="p79-cache-btn" data-cache-action="reconnect">重新授權資料夾</button><button class="p79-cache-btn" data-cache-action="disconnect">停用資料夾</button><button class="p79-cache-btn" data-cache-action="persist">保留手機／瀏覽器資料</button></div><div class="p79-cache-note">電腦：請先建立並選擇「79號碼頭雲端資料庫」資料夾。手機：按「保留手機／瀏覽器資料」，也可將系統加入主畫面。清除網站資料後，電腦檔案仍保留，但需重新選擇資料夾。資料夾快取不會自行覆寫雲端；請以各系統的儲存／同步狀態確認上傳結果。</div><div id="p79CacheRows" class="p79-cache-grid"></div><div class="p79-cache-actions"><button class="p79-cache-btn primary" data-cache-action="quick">快速預載常用資料（人資／排班／請假）</button><button class="p79-cache-btn" data-cache-action="current">下載目前系統完整資料</button><button class="p79-cache-btn all" data-cache-action="all">下載六項基本資料（歷史按月）</button><button class="p79-cache-btn danger" data-cache-action="clear">清除本機快取</button></div><div class="p79-cache-note">注意：上述六項基本資料下載不包含「碼頭儲量」；歷史月份請到歷史資料中心按月讀取。Yard Excel 數據仍是各瀏覽器獨立的帳號本機資料，Windows 版本不能藉由此下載動作取得網頁版的儲量。系統不會以零或假數字代替缺失數據。</div><div id="p79CacheProgress" class="p79-cache-note">選取資料夾後會先找回目前帳號已有的快取，不必再次下載。同一帳號重新登入會重用既有檔案；首次使用的新帳號需下載其權限範圍內的資料。考勤／工時下載前會核對版本，資料未變時重用完整快取。</div></div>`;
 document.body.appendChild(b);b.querySelector('.p79-cache-close').onclick=()=>b.classList.remove('open');b.addEventListener('click',e=>{if(e.target===b)b.classList.remove('open')});
 b.addEventListener('click',async e=>{const btn=e.target.closest('[data-cache-action]');if(!btn)return;const act=btn.dataset.cacheAction;const buttons=[...b.querySelectorAll('[data-cache-action]')];buttons.forEach(x=>x.disabled=true);try{
   // Windows already has its own background WebView2 worker. Web opens a
   // separate same-origin tab so other system pages remain fully usable.
   if(['all','current','quick'].includes(act)&&!window.chrome?.webview?.postMessage&&
      startBrowserBackgroundDownload(act,currentSystem()))return;
   if(act==='folder'){setProgress(await connectFolder());await refreshModal()}
   if(act==='reconnect'){setProgress(await reconnectFolder());await refreshModal()}
   if(act==='disconnect'){setProgress(await disconnectFolder());await refreshModal()}
   if(act==='persist'){setProgress(await retainDeviceData());await refreshModal()}
   if(act==='clear'){if(confirm('確定清除此瀏覽器的七大系統本機快取？')){await clear();setProgress('已清除瀏覽器快取；硬碟資料夾檔案仍保留，啟用時可重新讀取。');await refreshModal()}}
   if(act==='quick'){
     setProgress('正在預載有權限的常用資料，不下載全部考勤歷史…');
     const result=await preloadCurrent({network:true,onProgress:(sys,phase,error)=>{
       setProgress((phase==='error'?'⚠️ ':phase==='reused'?'✓ ':'⬇️ ')+
         (SYSTEM_LABELS[sys]||sys)+'：'+
         ({loading:'預載中',reused:'沿用近30秒本機資料',done:'完成',error:'未完成'}[phase]||phase)+
         (error?'｜'+error:''));
     }});
     const ok=result.results.filter(x=>x.ok).length;
     const fail=result.results.filter(x=>!x.ok);
     setProgress(result.status==='changed'?'登入身分或權限已變更，已停止預載；原資料不變。':
       result.status==='denied'?'目前帳號沒有可預載的管理資料權限。':
       '常用資料預載完成：'+ok+'/'+result.results.length+' 項'+
       (fail.length?'；未完成：'+fail.map(x=>SYSTEM_LABELS[x.system]+(x.error?' '+x.error:'')).join('、'):'')+
       '。正式申報仍需重新向雲端核對。');
     await refreshModal();
   }
   if(act==='current'){const sys=currentSystem();if(sys==='history'){setProgress('歷史資料請在歷史資料中心選擇月份並按「讀取月份」，已有的歷史快取不會重新下載。');return;}setProgress(`正在下載 ${SYSTEM_LABELS[sys]}…`);const snap=await downloadSystem(sys,(s,i,total,state,label)=>setProgress(`⬇️ ${label||SYSTEM_LABELS[sys]} ${i}/${total}`));setProgress(sys==='attendance'||sys==='workhours'?`✅ ${SYSTEM_LABELS[sys]}完整資料已載入｜考勤 ${Number(snap?.recordCount||0)} 筆｜員工主檔 ${Number(snap?.employeeCount||0)} 人`:`✅ ${SYSTEM_LABELS[sys]} 快取完成。`);await refreshModal()}
   if(act==='all'){
   // Windows has a separate same-origin WebView2 worker that continues across
   // page navigation; keep the existing modal as the single download entry.
   if(window.chrome?.webview?.postMessage){
    window.chrome.webview.postMessage(JSON.stringify({
     kind:'port79-cache-command-v1',action:'download-all'
    }));
    setProgress('已交由 Windows 背景同步；可切換考勤、排班等頁面，原本進度會繼續顯示。');
    return;
   }
   const res=await downloadAll((sys,i,total,state,err,detail)=>{setProgress(detail?`⬇️ ${SYSTEM_LABELS[sys]}｜${detail}`:`${state==='error'?'⚠️':'⬇️'} ${i+1}/${total} ${SYSTEM_LABELS[sys]} ${state==='loading'?'下載中…':state==='done'?'完成':state==='reused'?'沿用成功快取':state==='detail'?'整理中…':'失敗'}`)},{quickFirst:true,historyOnDemand:true});const ok=res.filter(x=>x.ok).length;const bad=res.filter(x=>!x.ok);setProgress(`完成：${ok}/${res.length} 項基本資料；歷史月份按需讀取${bad.length?'；未完成：'+bad.map(x=>SYSTEM_LABELS[x.system]+'：'+x.error).join('；'):''}`);await refreshModal()}
  }catch(err){setProgress(err?.name==='AbortError'?'已取消選擇，原有快取保持不變。':'❌ '+String(err?.message||err))}finally{buttons.forEach(x=>x.disabled=false)}});
 return b;
}
function setProgress(t){const e=document.getElementById('p79CacheProgress');if(e)e.textContent=t}
function cacheCoverage(row){
 if(!row)return '--';
 if(row.data?.fullDatabase)return '完整考勤 '+Number(row.data.months?.length||0)+' 個月';
 const month=String(row.scope?.month||row.month||row.data?.month||'');if(/^\d{4}-\d{2}$/.test(month))return month+' 月份';
 const year=String(row.scope?.year||'');if(/^\d{4}$/.test(year))return year+' 年';
 if(row.system==='history')return '歷史月份目錄；內容依月份另存';
 return '此系統最近一次讀取範圍';
}
async function refreshModal(){
 const status=await deviceStatus(),el=document.getElementById('p79DeviceStatus');
 if(el)el.textContent=(status.folderSupported?status.folder:'此裝置使用手機／瀏覽器內部快取')+'｜本機保留：'+(status.retained?'已獲准':'尚未獲准');
 const folderButton=document.querySelector('[data-cache-action=folder]');if(folderButton)folderButton.hidden=!status.folderSupported;
 const reconnectButton=document.querySelector('[data-cache-action=reconnect]');if(reconnectButton)reconnectButton.hidden=!status.folderSupported;
 const rows=document.getElementById('p79CacheRows');if(!rows)return;const data=(await Promise.all(Object.keys(SYSTEM_LABELS).map(sys=>getSystemSnapshot(sys).catch(()=>null)))).filter(Boolean);const v=viewerKey();rows.innerHTML=Object.keys(SYSTEM_LABELS).map(sys=>{const r=data.filter(x=>x.key===v+'|system|'+sys).sort((a,b)=>b.savedAt-a.savedAt)[0];return `<div class="p79-cache-row" data-cache-system="${sys}"><b>${SYSTEM_LABELS[sys]}</b><div class="p79-cache-meta">最後快取：${fmtTime(r?.savedAt)}<br>大小：${r?fmtBytes(r.size):'--'}<br>保存範圍：${cacheCoverage(r)}</div><div class="p79-cache-state">${r?'✓ 已有本機快取':'○ 尚未下載'}</div></div>`}).join('')
}
async function openCenter(){const b=ensureModal();b.classList.add('open');await refreshModal()}


/**
 * Windows tray's "重新同步六項基本資料（歷史按月）" uses this event.
 * Previously no handler existed, so clicking it silently did nothing.
 * All data reads still go through the authenticated existing GAS routes.
 */
let nativeCloudSyncBusy=false;
async function nativeCloudSyncFromDesktop(){
 // Historical month contents are never required at startup. The history
 // center fetches selected months itself; failure of an unrelated catalog
 // must not block Windows program updates or basic attendance data.
 const historyOnDemand=true;
 const total=historyOnDemand?6:7;
 const done=new Set();
 let lastActivity=Date.now(),lastDetail='正在確認雲端連線',lastMonthCompleted=0,lastMonthTotal=0,pulse=null,fullyCompleted=false;
 function status(phase,detail,completed=done.size,month=null,heartbeat=false){
  if(!heartbeat){
   lastActivity=Date.now();
   lastDetail=String(detail||'');
   lastMonthCompleted=Number.isFinite(Number(month?.monthCompleted))?Math.max(0,Number(month.monthCompleted)):0;
   lastMonthTotal=Number.isFinite(Number(month?.monthTotal))?Math.max(0,Number(month.monthTotal)):0;
  }
  const value={
   kind:'port79-cache-status-v1',phase,
   title:phase==='stalled'?'雲端回應較慢':'雲端資料同步',
   detail:String(detail||'').slice(0,160),
   completed:Math.max(0,Math.min(total,completed)),total,
   monthCompleted:Math.max(0,Math.min(240,lastMonthCompleted)),
   monthTotal:Math.max(0,Math.min(240,lastMonthTotal))
  };
  try{window.chrome?.webview?.postMessage?.(JSON.stringify(value));}catch(e){}
  setProgress((phase==='failed'?'❌ ':phase==='partial'?'⚠️ ':phase==='complete'?'✅ ':'☁️ ')+value.detail);
 }
 if(nativeCloudSyncBusy){
  status('stalled','下載正在進行中，請查看目前系統與月份進度；不會重複啟動。',done.size,null,true);
  return;
 }
 nativeCloudSyncBusy=true;
 status('downloading','正在核對六項基本資料；歷史資料請到歷史中心選月份讀取…',0);
 // A large attendance database can require two cloud reads for each month.
 // Send a truthful waiting heartbeat; do not fabricate completion progress.
 if(typeof setInterval==='function')pulse=setInterval(()=>{
  const elapsed=Date.now()-lastActivity;
  if(elapsed>=12000){
   status('stalled',lastDetail+'｜等待雲端回應 '+Math.round(elapsed/1000)+' 秒；如逾時會顯示原因並繼續安全處理。',done.size,null,true);
  }
 },10000);
 try{
  let session=null;
  try{session=JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null')}catch(_){}
  const role=String(session?.adminRole||session?.role||'').toLowerCase();
  if(!session||session.punchOnly||!['admin','superadmin'].includes(role)||!token()){
   throw new Error('請先以管理員登入，再下載有權限的雲端資料');
  }
  if(window.__port79CachedSessionRefreshPending){
   throw new Error('登入權限正在向雲端確認，請完成後再重新下載');
  }
  const result=await downloadAll((sys,index,count,state,error,detail,month)=>{
   // Progress is a count of successful systems, NOT attempted/skipped ones.
   if(state==='done'||state==='reused')done.add(sys);
   const label=SYSTEM_LABELS[sys]||sys;
   const message=detail?label+'｜'+detail:
    state==='loading'?'正在下載 '+label:
    state==='reused'?label+' 已沿用經驗證的快取':
    state==='done'?label+' 已完成':
    state==='error'||state==='skipped'?label+' 未完成：'+String(error?.message||error||'雲端讀取未完成'):
    '正在下載 '+label;
   status('downloading',message,done.size,month);
  },{quickFirst:true,resumeExisting:window.__port79WorkerResumeOnly===true,historyOnDemand});
  const success=result.filter(x=>x.ok).length,failures=result.filter(x=>!x.ok);
  fullyCompleted=success===total&&!failures.length;
  status(failures.length?(success?'partial':'failed'):'complete',
   failures.length?'已成功 '+success+'/'+total+' 系統；未完成：'+failures.map(x=>(SYSTEM_LABELS[x.system]||x.system)+' '+x.error).join('；').slice(0,105):
    '六項基本資料已完成／沿用本機快取；歷史資料依月份在歷史中心讀取（未重抓）。',
   success);
 }catch(error){
  status('failed','雲端資料未下載：'+String(error?.message||error),done.size);
 }finally{
  if(pulse!==null&&typeof clearInterval==='function')clearInterval(pulse);
  nativeCloudSyncBusy=false;
  try{window.__port79CloudWorkerDone?.(fullyCompleted)}catch(_){}
 }
}
if(typeof window.addEventListener==='function'){
 window.addEventListener('port79-desktop-force-sync',nativeCloudSyncFromDesktop);
 window.__port79NativeCloudSyncReady=true;
}

window.Port79DataCache={preloadCurrent,getDisplaySnapshot,restoreFolderSystems,getFolderSyncStatus,getExportSnapshot,storeExportSnapshot,getHistoryPreview,getSchedulePreview,storeSchedulePreview,connectFolder,reconnectFolder,disconnectFolder,retainDeviceData,deviceStatus,flushFolder,openCenter,downloadSystem,downloadAll,clear,all,get,put,currentSystem,viewerKey,getSystemSnapshot,restoreSystemSnapshot};
if(!window.__p79BrowserBackgroundWorker&&typeof document!=='undefined'&&document?.head?.appendChild&&document?.createElement){
 // Shared by every management page without changing its own navigation flow.
 const src=document.querySelector?.('script[src*="port79-data-cache.js"]')?.src;
 if(src){
  const tag=document.createElement('script');
  tag.src=new URL('port79-browser-download-status.js?v=20261123-bg-status-v1',src).href;
  tag.defer=true;
  document.head.appendChild(tag);
 }
}
})();


