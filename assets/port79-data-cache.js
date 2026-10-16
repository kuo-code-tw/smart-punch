(function(){
'use strict';
if(window.Port79DataCache)return;

const DB_NAME='port79-system-cache-v1';
const DB_VERSION=1;
const STORE='snapshots';

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
// Opt-in management experiment. Production and punch-only pages keep their current cache behavior.
const MANAGEMENT_MEMORY_MAX_ENTRIES=12;
const MANAGEMENT_MEMORY_MAX_PAYLOAD_BYTES=8*1024*1024;
const memoryWeights=new Map();
let memoryPayloadBytes=0;
function boundedManagementMemory(){
 if(window.P79ManagementTestMode!==true)return false;
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
let dbPromise=null;
let mutationGeneration=0;

function currentSystem(){
 const p=location.pathname.toLowerCase();
 if(p.includes('/work-hours/'))return 'workhours';if(p.includes('/attendance/'))return 'attendance';
 if(p.includes('/leave/'))return 'leave';if(p.includes('/schedule/'))return 'schedule';
 if(p.includes('/aqc-efficiency/'))return 'efficiency';if(p.includes('/hr/'))return 'hr';
 if(p.includes('/history-data/'))return 'history';return 'attendance';
}
function token(){try{return String(sessionStorage.getItem('port79_gc_superadmin_token')||sessionStorage.getItem('port79_admin_token')||sessionStorage.getItem('port79_user_token')||'').trim()}catch(e){return''}}
function viewerKey(){
 try{
  const s=JSON.parse(sessionStorage.getItem('port79_user_session')||sessionStorage.getItem('admin_session')||'null');
  const id=String(s?.empId||sessionStorage.getItem('aqc_admin_id')||sessionStorage.getItem('port79_leave_emp_id')||'guest').trim().toUpperCase()||'guest';
  const role=String(s?.adminRole||s?.role||sessionStorage.getItem('aqc_admin_role')||'employee').toLowerCase();
  return id+'@'+role;
 }catch(e){return 'guest@employee'}
}
function gasUrl(){
 try{if(typeof GAS_URL!=='undefined'&&GAS_URL)return String(GAS_URL)}catch(e){}
 try{if(window.GAS_URL)return String(window.GAS_URL)}catch(e){}
 try{for(const k of ['port79_gas_url','gasUrl','GAS_URL']){const v=sessionStorage.getItem(k)||localStorage.getItem(k);if(v&&/script\.google\.com/i.test(v))return v}}catch(e){}
 return '';
}
function ymNow(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function openDb(){
 if(dbPromise)return dbPromise;
 dbPromise=new Promise((resolve,reject)=>{
  const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'})};
  r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{try{db.close()}catch(e){}dbPromise=null};resolve(db)};
  r.onerror=()=>{dbPromise=null;reject(r.error)};
 });
 return dbPromise;
}
async function put(row){
 rememberMemory(row);
 const db=await openDb();
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(row);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)});
}
async function get(key){
 const cached=recallMemory(key);if(cached)return cached;
 const db=await openDb();
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(key);r.onsuccess=()=>{const row=r.result||null;if(row)rememberMemory(row);resolve(row)};r.onerror=()=>reject(r.error)});
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
 const row=await get(systemKey(sys));
 return row&&row.data?row:null;
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

const nativeFetch=window.fetch.bind(window);
function coalescedNetwork(key,input,init,url){
 let p=inflightReads.get(key);
 if(!p){
  const generation=mutationGeneration,startedAt=Date.now();
  p=nativeFetch(input,init).then(async r=>{
   try{
    if(r.ok){
      const d=await r.clone().json();
      if(d&&d.ok!==false&&generation===mutationGeneration&&key===actionKey(url))await storeApi(url,d,'',startedAt);
    }
   }catch(e){}
   return r;
  }).finally(()=>{if(inflightReads.get(key)===p)inflightReads.delete(key)});
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
 if(init?.signal || init?.cache==='no-store' || ['getScheduleDataSecure','getAttendanceMainDirect'].includes(info.action)||info.u?.searchParams.get('fresh')==='1')return nativeFetch(input,init);
 const key=actionKey(url);
 if(!key)return nativeFetch(input,init);

 let cached=null;
 try{cached=await get(key)}catch(e){}
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
 const u=new URL(base);u.searchParams.set('action',action);Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v))});u.searchParams.set('_',Date.now());return u.toString();
}
async function fetchJson(action,params={},sys=''){
 const url=buildUrl(action,params);const c=new AbortController();const to=setTimeout(()=>c.abort(),30000);
 try{const r=await nativeFetch(url,{cache:'no-store',signal:c.signal});const raw=await r.text();if(!r.ok)throw new Error('HTTP '+r.status);let d;try{d=JSON.parse(raw)}catch(e){throw new Error('GAS 回傳不是 JSON')};if(d?.ok===false)throw new Error(d.error||'雲端讀取失敗');await storeApi(url,d,sys);return d}finally{clearTimeout(to)}
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
 const catalog=await fetchJson('getAttendanceMonths',{},'');
 const months=[...new Set((Array.isArray(catalog?.months)?catalog.months:[]).filter(m=>/^\d{4}-\d{2}$/.test(String(m))))].sort();
 if(!months.length)months.push(ymNow());

 onProgress?.('attendance',0,months.length+1,'master','讀取員工主檔');
 const master=await fetchJson('getAttendanceEmployeeMaster',{token:t},'');
 const employees=Array.isArray(master?.employees)?master.employees:[];

 let allRecords=[];const monthStats=[];
 for(let i=0;i<months.length;i++){
  const month=months[i];
  onProgress?.('attendance',i+1,months.length,'month',`讀取 ${month}`);
  try{
   const d=await fetchJson('getAttendanceMonthData',{month},'');
   let rows=Array.isArray(d?.records)?d.records:[];
   try{
    const direct=await fetchJson('getAttendanceMainDirect',{month,token:t},'');
    const directRows=Array.isArray(direct?.records)?direct.records:[];
    if(directRows.length)rows=mergeAttendanceRows(rows.concat(directRows));
   }catch(e){}
   allRecords=mergeAttendanceRows(allRecords.concat(rows));
   monthStats.push({month,count:rows.length,ok:true});
  }catch(e){
   monthStats.push({month,count:0,ok:false,error:String(e?.message||e)});
  }
 }
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
 let attendanceSnapshot=null;
 for(let i=0;i<systems.length;i++){
  const sys=systems[i];onProgress?.(sys,i,systems.length,'loading');
  try{
   if(sys==='attendance')attendanceSnapshot=await downloadAttendanceDatabase('attendance',(s,mi,mt,state,label)=>onProgress?.(sys,i,systems.length,'detail',null,`${label||state} ${mi}/${mt}`));
   else if(sys==='workhours'&&attendanceSnapshot){await saveSystemSnapshot('workhours',attendanceSnapshot);if(currentSystem()==='workhours')await applyAttendanceSnapshotToPage(attendanceSnapshot,true)}
   else await downloadSystem(sys);
   result.push({system:sys,ok:true});onProgress?.(sys,i,systems.length,'done');
  }catch(e){result.push({system:sys,ok:false,error:String(e?.message||e)});onProgress?.(sys,i,systems.length,'error',e)}
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
 b=document.createElement('div');b.id='p79CacheBackdrop';b.innerHTML=`<div id="p79CacheModal" role="dialog" aria-modal="true"><div class="p79-cache-head"><div><div class="p79-cache-title">☁️ 資料快取中心</div><div class="p79-cache-sub">資料存於此瀏覽器 IndexedDB；不是公開 GitHub 資料。</div></div><button class="p79-cache-close" type="button">✕</button></div><div id="p79CacheRows" class="p79-cache-grid"></div><div class="p79-cache-actions"><button class="p79-cache-btn primary" data-cache-action="current">下載目前系統完整資料</button><button class="p79-cache-btn all" data-cache-action="all">下載七大系統完整快取</button><button class="p79-cache-btn danger" data-cache-action="clear">清除本機快取</button></div><div id="p79CacheProgress" class="p79-cache-note">考勤／工時按「下載」會讀取全部考勤月份＋員工主檔，完成後直接套用畫面；其他系統依各自雲端資料建立本機快取。</div></div>`;
 document.body.appendChild(b);b.querySelector('.p79-cache-close').onclick=()=>b.classList.remove('open');b.addEventListener('click',e=>{if(e.target===b)b.classList.remove('open')});
 b.addEventListener('click',async e=>{const btn=e.target.closest('[data-cache-action]');if(!btn)return;const act=btn.dataset.cacheAction;const buttons=[...b.querySelectorAll('[data-cache-action]')];buttons.forEach(x=>x.disabled=true);try{
   if(act==='clear'){if(confirm('確定清除此瀏覽器的七大系統本機快取？')){await clear();setProgress('已清除本機快取。');await refreshModal()}}
   if(act==='current'){const sys=currentSystem();setProgress(`正在下載 ${SYSTEM_LABELS[sys]}…`);const snap=await downloadSystem(sys,(s,i,total,state,label)=>setProgress(`⬇️ ${label||SYSTEM_LABELS[sys]} ${i}/${total}`));setProgress(sys==='attendance'||sys==='workhours'?`✅ ${SYSTEM_LABELS[sys]}完整資料已載入｜考勤 ${Number(snap?.recordCount||0)} 筆｜員工主檔 ${Number(snap?.employeeCount||0)} 人`:`✅ ${SYSTEM_LABELS[sys]} 快取完成。`);await refreshModal()}
   if(act==='all'){const res=await downloadAll((sys,i,total,state,err,detail)=>{setProgress(detail?`⬇️ ${SYSTEM_LABELS[sys]}｜${detail}`:`${state==='error'?'⚠️':'⬇️'} ${i+1}/${total} ${SYSTEM_LABELS[sys]} ${state==='loading'?'下載中…':state==='done'?'完成':state==='detail'?'整理中…':'失敗'}`)});const ok=res.filter(x=>x.ok).length;const bad=res.filter(x=>!x.ok);setProgress(`完成：${ok}/7 個系統${bad.length?'；未完成：'+bad.map(x=>SYSTEM_LABELS[x.system]).join('、'):''}`);await refreshModal()}
  }catch(err){setProgress('❌ '+String(err?.message||err))}finally{buttons.forEach(x=>x.disabled=false)}});
 return b;
}
function setProgress(t){const e=document.getElementById('p79CacheProgress');if(e)e.textContent=t}
async function refreshModal(){
 const rows=document.getElementById('p79CacheRows');if(!rows)return;const data=boundedManagementMemory()?await managementSystemMetadata():await all();const v=viewerKey();rows.innerHTML=Object.keys(SYSTEM_LABELS).map(sys=>{const r=data.filter(x=>x.key===v+'|system|'+sys).sort((a,b)=>b.savedAt-a.savedAt)[0];return `<div class="p79-cache-row" data-cache-system="${sys}"><b>${SYSTEM_LABELS[sys]}</b><div class="p79-cache-meta">最後快取：${fmtTime(r?.savedAt)}<br>大小：${r?fmtBytes(r.size):'--'}</div><div class="p79-cache-state">${r?'✓ 已有本機快取':'○ 尚未下載'}</div></div>`}).join('')
}
async function openCenter(){const b=ensureModal();b.classList.add('open');await refreshModal()}

window.Port79DataCache={openCenter,downloadSystem,downloadAll,clear,all,get,put,currentSystem,viewerKey,getSystemSnapshot,restoreSystemSnapshot};
})();

