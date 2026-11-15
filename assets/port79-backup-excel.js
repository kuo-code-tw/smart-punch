/* One-click readable cloud + current-computer Excel backup. No credentials exported. */
(function(g){
'use strict';
const d=g.document;
let readyDownload=null;
function clearDownload(){if(readyDownload)g.URL.revokeObjectURL(readyDownload.url);readyDownload=null;const b=d.getElementById('p79BackupDownload');if(b)b.hidden=true;}
function refreshDownload(){if(readyDownload&&(!allowed()||!readyDownload.same()))clearDownload();}
function offerDownload(blob,c){
 clearDownload();const name='79號碼頭完整備份_'+stamp()+'.zip',url=g.URL.createObjectURL(blob);readyDownload={url,name,same:c.same};
 let b=d.getElementById('p79BackupDownload');if(!b){b=d.createElement('button');b.id='p79BackupDownload';b.type='button';b.textContent='下載';b.style.marginInlineStart='8px';d.getElementById('p79AllBackupButton')?.insertAdjacentElement('afterend',b);b.addEventListener('click',()=>{refreshDownload();if(!readyDownload)return;const a=d.createElement('a');a.href=readyDownload.url;a.download=readyDownload.name;d.body.append(a);a.click();a.remove();state('雲端Excel：已保存｜電腦端：已開始下載 '+readyDownload.name+'，請以瀏覽器下載完成為準；可再次按「下載」。');});}
 b.hidden=false;b.title=name;
}
async function validateArchive(blob){
 if(!blob||blob.size<22)throw Error('壓縮檔尚未完整產生，未提供下載');
 const data=await blob.arrayBuffer(),head=new Uint8Array(data,0,4);if(head[0]!==80||head[1]!==75||head[2]!==3||head[3]!==4)throw Error('壓縮檔格式錯誤，未提供下載');
 const check=await g.JSZip.loadAsync(data,{checkCRC32:true}),files=Object.values(check.files).filter(f=>!f.dir);
 if(!files.length||!files.some(f=>f.name==='電腦端資料/本機資料.xlsx')||!files.some(f=>f.name==='備份說明/備份範圍.xlsx'))throw Error('壓縮檔內容不完整，未提供下載');
 return check;
}
const labels={personnel:'人資',attendance:'出勤',schedule:'排班',leave:'請假',overtime:'加班',workhours:'工時',efficiency:'作業效率',vessel:'船舶',sailing:'船期',audit:'系統稽核',gate:'碼頭進出站',routes:'碼頭航線',yard:'碼頭儲量'};
const columns={empId:'工號',name:'姓名',date:'日期',month:'月份',year:'年度',records:'明細',shipMasters:'船舶主檔',employees:'人員',schedules:'班表',schedule:'排班',assignments:'人員分組',groups:'組別',workDate:'作業日期',workingNo:'作業編號',vessel:'船名',shift:'班別',startTime:'開始時間',endTime:'結束時間',containers:'櫃量',hours:'時數',rows:'資料列',data:'資料',fileName:'檔名',updatedAt:'更新時間',savedAt:'保存時間',systemEmployees:'系統人員'};
function allowed(){try{const s=JSON.parse(g.sessionStorage.getItem('port79_user_session')||'null');return !!s&&!s.punchOnly&&String(s.adminRole||s.role).toLowerCase()==='superadmin';}catch(_){return false;}}
function secret(k){return /密碼|password|passhash|salt|token|secret|credential|apiKey|cookie/i.test(k);}
function clean(x){if(Array.isArray(x))return x.map(clean);if(x&&typeof x==='object'){const out={};for(const k of Object.keys(x))if(!secret(k))out[k]=clean(x[k]);return out;}return x;}
function state(text){let n=d.getElementById('p79BackupExcelStatus');if(!n){n=d.createElement('div');n.id='p79BackupExcelStatus';n.setAttribute('role','status');d.getElementById('p79AllBackupFeedback')?.append(n);}n.textContent=text;}
function stamp(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace(/[-: ]/g,'');}
function bytes(s){return Uint8Array.from(g.atob(s),c=>c.charCodeAt(0));}
function base64(b){let s='';const v=new Uint8Array(b);for(let i=0;i<v.length;i+=16384)s+=String.fromCharCode(...v.subarray(i,i+16384));return g.btoa(s);}
async function hash(b){return Array.from(new Uint8Array(await g.crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');}
async function prepare(){
 if(!allowed())throw Error('僅超級管理員可查看及執行備份');
 if(!g.XLSX||!g.JSZip)throw Error('Excel備份元件尚未載入，請稍後再試');
 state('正在準備本次雲端與電腦端Excel備份…');
 // Do not create an empty destination file before a long cloud backup finishes.
 return {handle:null};
}
async function callOnce(c,payload){
 if(!c.same())throw Error('登入已變更，已停止Excel備份');
 const ctrl=new AbortController(),timer=g.setTimeout(()=>ctrl.abort(),180000);
 try{
  const r=await g.fetch(c.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,action:'historyBackupExcel',gcToken:c.token}),signal:ctrl.signal,redirect:'follow',cache:'no-store'});
  let result;try{result=await r.json();}catch(e){throw Object.assign(Error('雲端回應未完整傳回，將重新核對相同Excel'),{transient:true});}if(!c.same())throw Error('登入已變更，未套用備份結果');
  if(!r.ok||result.ok!==true)throw Object.assign(Error(String(result.error||'Excel備份未完成')),{serverRejected:result.ok===false,transient:[408,429,500,502,503,504].includes(r.status)});
  return result;
 }finally{g.clearTimeout(timer);}
}
function transient(error){
 if(error.serverRejected&&!error.transient)return /Excel正在產生|Excel備份正在準備|備份資料夾正在準備/.test(error.message);
 return !!error.transient||['AbortError','TimeoutError','TypeError'].includes(error.name)||/Failed to fetch|NetworkError|Load failed|網路連線失敗|連線逾時|網路連線中斷|回應未完整傳回/i.test(error.message);
}
async function call(c,payload){
 const delays=[3000,5000,10000,20000,30000];
 for(let attempt=0;;attempt++){
  try{return await callOnce(c,payload);}catch(error){
   if(!c.same()||!allowed()||!transient(error)||attempt>=delays.length)throw error;
   state('雲端暫時無法確認，'+delays[attempt]/1000+'秒後自動重試（'+(attempt+1)+'/'+delays.length+'）；已完成項目保留，核對同一份Excel，不會從頭備份…');
   await new Promise(resolve=>g.setTimeout(resolve,delays[attempt]));
   if(!c.same()||!allowed())throw Error('登入已變更，已停止Excel備份');
  }
 }
}
async function localData(c){
 if(!allowed()||!c.same())throw Error('僅超級管理員可讀取本機備份資料');
 const out={備份說明:[{備份時間:new Date().toISOString(),登入工號:c.actor,資料範圍:'雲端完整備份另列；本檔包含目前瀏覽器的本機資料與待同步資料，不含其他電腦未上傳資料。'}]};
 const cache=g.Port79DataCache;
 if(cache?.all){const viewer=cache.viewerKey();for(const row of await cache.all()){
  if(!row?.key?.startsWith(viewer+'|')||!['api','system'].includes(row.kind)||!row.data||row.cacheEndpoint&&row.cacheEndpoint!==c.endpoint)continue;
  out['快取_'+(labels[row.system]||({hr:'人資',history:'歷史資料'}[row.system])||'系統')+'_'+Object.keys(out).length]=clean(row.data);
 }}
 const keys={gc_groups_v1:'船舶組別',gc_assign_v1:'船舶人員分組',gc_records_v1:'船舶作業明細',gc_ship_masters_v1:'船舶主檔',gc_system_employees_v2:'船舶系統人員',gc_ship_manual_overrides_v3:'船舶手動設定',gc_monthly_manual_corrections_v1:'船舶月報修正',gc_queue_v1:'船舶待同步資料',sp_config_v5:'系統設定'};
 for(const [key,label] of Object.entries(keys)){const raw=g.localStorage.getItem(key);if(raw){try{out[label]=clean(JSON.parse(raw));}catch(_){throw Error(label+'無法解析，未標記電腦端完整備份');}}}
 const suffix=encodeURIComponent(String(c.actor).slice(0,120));for(const [prefix,label] of [['p79_yard_private_v1_','碼頭儲量'],['p79_yard_capacity_overrides_v1_','碼頭容量'],['p79_yard_allowed_container_counts_v1_','碼頭容許櫃量']]){
  const raw=g.localStorage.getItem(prefix+suffix);if(raw){try{out[label]=clean(JSON.parse(raw));}catch(_){throw Error(label+'本機資料無法解析');}}
 }
 if(g.localStorage.getItem('gc_queue_storage_v2')==='indexeddb'&&!g.indexedDB?.databases)throw Error('此瀏覽器無法完整核對待同步資料，未標記電腦端完成');
 if(g.indexedDB?.databases){const dbs=await g.indexedDB.databases();if(dbs.some(x=>x.name==='port79_efficiency_durable_v1')){
  out.船舶待同步資料=await new Promise((resolve,reject)=>{const r=g.indexedDB.open('port79_efficiency_durable_v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;try{const tx=db.transaction('state','readonly'),q=tx.objectStore('state').get('pending-queue');q.onerror=()=>{db.close();reject(q.error);};q.onsuccess=()=>{db.close();resolve(clean(q.result||[]));};}catch(e){db.close();reject(e);}};});
 }}
 if(!c.same())throw Error('登入已變更，未匯出本機資料');return out;
}
function workbook(data){
 const X=g.XLSX,book=X.utils.book_new(),long=[];let seq=0;
 function append(name,rows){
  if(rows.length>1048576)throw Error('本機資料超出單一Excel工作表容量，未截斷資料');
  rows=rows.map((row,r)=>row.map((value,c)=>{const s=value==null?'':typeof value==='object'?JSON.stringify(value):value;if(typeof s==='string'&&s.length>32000){for(let i=0;i<s.length;i+=30000)long.push([name,r+1,c+1,i/30000+1,s.slice(i,i+30000)]);return '完整內容請見「長文字明細」';}return s;}));
  const sh=X.utils.aoa_to_sheet(rows);sh['!cols']=Array.from({length:rows.reduce((n,r)=>Math.max(n,r.length),1)},()=>({wch:22}));X.utils.book_append_sheet(book,sh,(String(++seq)+'_'+name).replace(/[\[\]*?:/\\]/g,'_').slice(0,31));
 }
 function flat(obj,prefix='',result={}){for(const [k,v]of Object.entries(obj||{})){const key=prefix+(columns[k]||k);if(v&&typeof v==='object'&&!Array.isArray(v))flat(v,key+'・',result);else result[key]=Array.isArray(v)?JSON.stringify(v):v;}return result;}
 function add(name,value){
  if(Array.isArray(value)){const list=value.map(x=>x&&typeof x==='object'&&!Array.isArray(x)?flat(x):{資料:x});const cols=[...new Set(list.flatMap(Object.keys))];append(name,[cols.length?cols:['資料']].concat(list.map(r=>cols.map(k=>r[k]??''))));}
  else if(value&&typeof value==='object'){const scalars=[];for(const [k,v]of Object.entries(value)){if(v&&typeof v==='object')add(name+'_'+(columns[k]||k),v);else scalars.push([columns[k]||k,v]);}if(scalars.length)append(name,[['欄位','內容'],...scalars]);}
  else append(name,[['內容'],[value]]);
 }
 for(const [name,value]of Object.entries(clean(data)))add(name,value);
 if(long.length)append('長文字明細',[['來源','列號','欄號','分段','完整文字'],...long]);
 return new Uint8Array(X.write(book,{bookType:'xlsx',type:'array',compression:true}));
}
async function run(batch,c){
 if(!allowed()||!c.same())throw Error('僅超級管理員可取得Excel備份');
 const stateData=batch.excelState||(batch.excelState={zip:new g.JSZip(),completed:{},local:false,cloud:false});
 const zip=stateData.zip;
 const downloaded=stateData.downloaded||(stateData.downloaded={});
 try{
  if(!stateData.local){
   state('雲端分類備份已確認；正在產生目前電腦的Excel…');
   if(!stateData.localBytes)stateData.localBytes=workbook(await localData(c));
   const b=stateData.localBytes,digest=await hash(b);
   zip.file('電腦端資料/本機資料.xlsx',b);
   const receipt=await call(c,{phase:'local',base64:base64(b),hash:digest});if(receipt.verified!==true||receipt.hash!==digest)throw Error('本機Excel雲端回條不完整');
   for(const item of await g.Port79AllBackup.getLocalOriginals())if(item.actor===c.actor){const name=String(item.name||'儲量原檔.xlsx').replace(/[\\/:*?"<>|]/g,'_');zip.file('電腦端資料/原始匯入檔/'+String(item.hash||item.id).replace(/[^a-z0-9]/gi,'').slice(-12)+'_'+name,item.bytes);}
   stateData.local=true;
  }
  const items=batch.items.filter(x=>x.type!=='yardFile');
  for(const item of items){if(stateData.completed[item.type])continue;
   if(!item.result?.verified)throw Error('仍有雲端分類未核對，未標記Excel完成');
   const label=labels[item.type],id=item.result.backupId;
   state('雲端原始備份已確認；正在保存及下載「'+label+'」Excel…');
   const list=await call(c,{phase:'list',type:item.type,backupId:id});
   if(!Number.isInteger(list.total)||list.total<1||list.total>1000)throw Error('Excel來源清單不完整');
   for(let i=0;i<list.total;i++){
    const key=item.type+'|'+id+'|'+i;if(downloaded[key])continue;
    const r=await call(c,{type:item.type,backupId:id,index:i});
    if(!r.verified||r.backupId!==id||r.index!==i||!r.file||!/^[^\\/:*?"<>|]+\.xlsx$/.test(r.file.name))throw Error('Excel檔案回條不完整');
    const b=bytes(r.file.base64);if(await hash(b)!==r.file.hash)throw Error('Excel下載內容校驗不符');
    zip.file('雲端資料/'+label+'/'+r.file.name,b);downloaded[key]=true;
   }
   const done=await call(c,{phase:'complete',type:item.type,backupId:id});if(done.verified!==true)throw Error('雲端Excel尚未確認完整');stateData.completed[item.type]=done;
  }
  stateData.cloud=true;
  zip.file('備份說明/備份範圍.xlsx',workbook({備份清單:Object.entries(stateData.completed).map(([type,r])=>({分類:labels[type],Excel份數:r.files,雲端成功時間:r.backupAt})),說明:[{資料:'電腦端資料僅涵蓋目前瀏覽器可讀取的資料；其他電腦未上傳的資料，必須在該電腦執行備份。'}]}));
  const blob=await zip.generateAsync({type:'blob',compression:'STORE',mimeType:'application/zip'});if(!c.same())throw Error('登入已變更，未提供備份下載');
  state('雲端Excel：已保存｜正在檢查壓縮檔完整性…');
  await validateArchive(blob);if(!c.same())throw Error('登入已變更，未提供備份下載');
  offerDownload(blob,c);
  const completedAt=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
  state('雲端Excel：全部保存完成｜壓縮檔完整性檢查通過｜請按旁邊「下載」儲存到電腦；目前尚未下載｜'+completedAt+'（台灣時間）。重新整理或關閉本頁前請先下載。');
  batch.excelComplete=true;g.Port79SharedBackupStatus?.refresh?.();
 }catch(e){state((stateData.cloud?'雲端Excel：已保存':'雲端Excel：尚未全部完成')+'｜電腦端：尚未完成；'+String(e.message||e)+'。已完成項目保留，可按原按鈕繼續。');throw e;}
}
g.Port79BackupExcel={prepare,run,workbook,clean,allowed,localData,validateArchive,refreshDownload,clearDownload};
})(window);
