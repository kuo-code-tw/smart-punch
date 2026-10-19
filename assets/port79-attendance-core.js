(function(){
'use strict';

/*
  PORT79 Attendance V5 Clean Core
  核心原則：
  1. 畫面立即改（optimistic）
  2. 所有雲端寫入只走一條序列佇列
  3. Delta 只做增量，不做整月覆蓋
  4. 待同步本機修改永遠優先於雲端舊快照
  5. 狀態明確：待同步→同步中→已同步/失敗
*/

const OUTBOX_KEY='port79_attendance_v5_outbox';
const STATE_KEY='port79_attendance_v5_state';
const ACTIVE_MS=30000;
const IDLE_MS=60000;
const MAX_BACKOFF=15000;
// 刪除失敗不應每 15 秒重新佔用 GAS；保留資料並採漸進退避（5分鐘至1小時）。
function p79AttendanceRetryDelay(payload, attempts) {
  if(String(payload?.action||'')==='deleteRecord'){
    return Math.min(3600000, Math.max(300000, 300000*Math.pow(2,Math.min(Math.max(0,attempts-1),4))));
  }
  if (['updateRecord','editRecord'].includes(String(payload?.action||''))) {
    return Math.min(3600000,300000*Math.pow(2,Math.min(Math.max(0,attempts-1),4)));
  }
  if(['addRecord','queueEmployeePunch','persistEmployeePunch'].includes(String(payload?.action||''))) {
    // 新打卡重試採 8→16→30 秒，避免過去最多 120 秒的等待；每次仍只走一條寫入佇列。
    return Math.min(30000,8000*Math.pow(2,Math.min(Math.max(0,attempts-1),2)));
  }
  return Math.min(120000,15000*Math.pow(2,Math.min(Math.max(0,attempts-1),3)));
}

const ATTENDANCE_WRITE_ACTIONS = new Set([
  'addRecord','updateRecord','editRecord','deleteRecord',
  'queueEmployeePunch','persistEmployeePunch',
  'syncRecords','repairAttendanceRecords'
]);
function isV5AttendanceWrite(payload){
  return ATTENDANCE_WRITE_ACTIONS.has(String(payload?.action||''));
}


let writing=false;
let deltaBusy=false;
let deltaTimer=null;
let deltaResetRepairBusy=false;
// V5.11：每次頁面生命週期從 0 開始追最新 Delta，避免舊 sessionStorage 游標高於雲端最新序號後永遠收不到事件。
let lastSeq=0;
try{sessionStorage.setItem('port79_attendance_v5_delta_seq','0')}catch(e){}
let lastDoneAt=0;
let currentOpText='準備同步';
let activeSyncRecordId='';
let syncBatchTotal=0;
let syncBatchDone=0;
let syncBatchStartedAt=0;
let lastStatusUiSignature='';
const rejectedPunchById=new Map();

function token(){
  return String(
    sessionStorage.getItem('port79_user_token') ||
    sessionStorage.getItem('port79_admin_token') ||
    sessionStorage.getItem('port79_gc_superadmin_token') ||
    ''
  ).trim();
}
function gasUrl(){
  try{return typeof getActiveGasUrl==='function'?getActiveGasUrl():String(sysConfig?.gasUrl||'')}catch(e){return ''}
}
const EMERGENCY_OUTBOX_KEY=OUTBOX_KEY+'_emergency';
let queueOverlay=null,queueStorage='local';
function readQueue(){
  if(queueOverlay)return queueOverlay.slice();
  try{const raw=sessionStorage.getItem(EMERGENCY_OUTBOX_KEY);if(raw){const a=JSON.parse(raw);if(Array.isArray(a)){queueStorage='session';return a;}}}catch(e){}
  try{const a=JSON.parse(localStorage.getItem(OUTBOX_KEY)||'[]');return Array.isArray(a)?a:[]}catch(e){return []}
}
function saveQueue(q){
  // Never truncate or silently discard unconfirmed punches when storage is full.
  queueOverlay=q.slice();
  const raw=JSON.stringify(q);
  try{
    localStorage.setItem(OUTBOX_KEY,raw);queueStorage='local';queueOverlay=null;
    try{sessionStorage.removeItem(EMERGENCY_OUTBOX_KEY)}catch(e){}
  }catch(error){
    try{sessionStorage.setItem(EMERGENCY_OUTBOX_KEY,raw);queueStorage='session';queueOverlay=null;}
    catch(backupError){queueStorage='memory';console.error('考勤待傳資料只能暫留目前頁面，請勿關閉，正在持續重試雲端',backupError);}
  }
  updateUi();
  return queueStorage!=='memory';
}
function opKey(payload){
  const a=String(payload?.action||'');
  const id=String(payload?.record?.id ?? payload?.id ?? '');
  if(id&&['updateRecord','editRecord'].includes(a)){
    const r=payload.record||{},person=String(r.attNo||r.empId||r.name||'').trim().toUpperCase();
    const m=String(payload.originalTimeStr||r.timeStr||'').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if(person&&m){
      const day=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
      return `updateRecord:${id}:${encodeURIComponent(person)}:${day}:${encodeURIComponent(String(r.status||''))}`;
    }
  }
  return `${a}:${id||JSON.stringify(payload||{})}`;
}
function desc(payload){
  try{
    if(typeof getCloudPayloadDescription==='function')return getCloudPayloadDescription(payload)
  }catch(e){}
  const a=String(payload?.action||'');
  const n=String(payload?.record?.name||'');
  if(a==='updateRecord'||a==='editRecord')return `修改考勤 ${n}`;
  if(a==='addRecord')return `新增考勤 ${n}`;
  if(a==='deleteRecord')return `刪除考勤`;
  return a||'考勤資料';
}
function enqueue(payload){
  const q=readQueue();
  const key=opKey(payload);
  const item={
    key,payload,
    createdAt:Date.now(),
    attempts:0,
    nextRetryAt:0,
    state:'pending'
  };
  const isEdit=p=>['updateRecord','editRecord'].includes(String(p?.action||''));
  const sameEdit=x=>isEdit(x?.payload)&&isEdit(payload)&&opKey(x.payload)===key;
  const matches=x=>x.key===key||sameEdit(x);
  const previous=q.find(x=>matches(x)&&x.paused&&samePayload(x.payload,payload));
  const next=q.filter(x=>!matches(x));
  next.push(previous||item);
  saveQueue(next);
  return next.length;
}
function samePayload(a,b){return JSON.stringify(a)===JSON.stringify(b)}
function p79ClearMatchingLegacyEdit(payload){
 if(!['updateRecord','editRecord'].includes(String(payload?.action||'')))return;
 try{
  const raw=localStorage.getItem('sp_cloud_outbox_v1');if(!raw)return;
  const q=JSON.parse(raw);if(!Array.isArray(q))return;
  const keep=q.filter(item=>{
   const old=item?.payload;if(!['updateRecord','editRecord'].includes(String(old?.action||'')))return true;
   if(!cloudRecordConfirmsItem({payload:old},payload.record))return true;
   return false;
  });
  if(keep.length!==q.length)localStorage.setItem('sp_cloud_outbox_v1',JSON.stringify(keep));
 }catch(e){console.warn('舊版考勤待傳核對未完成，原內容保留',e);}
}
function p79NotifyAttendanceWrite(payload){
 p79ClearMatchingLegacyEdit(payload);
 try{localStorage.setItem('port79_attendance_sync_notice_v1',JSON.stringify({id:payloadRecordId(payload),action:payload.action,at:Date.now()}));}catch(e){}
}
window.addEventListener('storage',event=>{
 if(event.key===OUTBOX_KEY){updateUi();return;}
 if(event.key==='port79_attendance_sync_notice_v1')scheduleDelta(100);
});
function remove(key,payload){
  const q=readQueue(),next=q.filter(x=>x.key!==key||(payload&&!samePayload(x.payload,payload)));
  if(next.length===q.length)return false;
  saveQueue(next);if(payload)p79NotifyAttendanceWrite(payload);return true;
}
function pendingForId(id){
  const s=String(id??'');
  return readQueue().some(x=>String(x?.payload?.record?.id ?? x?.payload?.id ?? '')===s);
}

function payloadRecordId(payload){
  return String(payload?.record?.id ?? payload?.id ?? '');
}

function queueInfoForId(id){
  const wanted=String(id??'');
  if(!wanted)return null;

  const q=readQueue();
  const idx=q.findIndex(x=>payloadRecordId(x?.payload)===wanted);
  if(idx>=0){
    const item=q[idx];
    return {
      index:idx+1,
      total:q.length,
      state:item.paused?'paused':String(item?.state||'pending'),
      paused:!!item.paused,
      description:desc(item?.payload),
      lastError:String(item?.lastError||'')
    };
  }

  if(writing && activeSyncRecordId===wanted){
    const total=Math.max(1,syncBatchTotal||1);
    const index=Math.min(total,Math.max(1,syncBatchDone+1));
    return {
      index,
      total,
      state:'syncing',
      description:currentOpText,
      lastError:''
    };
  }
  return null;
}

function normalizeCompareValue(value){
  const text=String(value==null?'':value).replace('T',' ').trim();
  const m=text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if(!m)return text;
  return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0')+' '+m[4].padStart(2,'0')+':'+m[5].padStart(2,'0')+':'+String(m[6]||'0').padStart(2,'0');
}

function cloudRecordConfirmsItem(item, cloudRecord){
  const payload=item?.payload||{};
  const action=String(payload.action||'');
  if(action==='deleteRecord')return false;

  const local=payload.record||{};
  const localId=payloadRecordId(payload);
  const cloudId=String(cloudRecord?.id??'');
  if(!localId||localId!==cloudId)return false;

  // New punches must match the saved identity, time and IN/OUT status as well as ID.
  if(action==='addRecord'||action==='persistEmployeePunch'||action==='queueEmployeePunch'){
    for(const field of ['empId','attNo','timeStr','status']){
      if(local[field]!=null&&String(local[field]).trim()!==''&&normalizeCompareValue(local[field])!==normalizeCompareValue(cloudRecord?.[field]))return false;
    }
    return true;
  }

  // Confirm the actual employee/time/direction/content, not the edit timestamp.
  // Multiple retries of an already-saved intent do not require another write.
  if(action==='updateRecord'||action==='editRecord')return p79AttendanceEditAlreadySaved(payload,cloudRecord);

  return false;
}

function confirmCloudRecord(cloudRecord){
  try{if(typeof p79ConfirmWithdrawnAttendanceDrafts==='function')p79ConfirmWithdrawnAttendanceDrafts(cloudRecord)}catch(e){console.warn('撤回草稿核對狀態未保存，備份保留',e)}
  p79ClearMatchingLegacyEdit({action:'updateRecord',record:cloudRecord});
  const id=String(cloudRecord?.id??'');
  if(!id)return false;

  const q=readQueue();
  let removed=0;
  const keep=[];
  q.forEach(item=>{
    if(payloadRecordId(item?.payload)!==id){
      keep.push(item);
      return;
    }
    if(cloudRecordConfirmsItem(item,cloudRecord)){
      removed++;
    }else{
      keep.push(item);
    }
  });

  if(!removed)return false;

  saveQueue(keep);
  try{markRecentAttendanceMutationCloudConfirmed?.(id)}catch(e){}
  lastDoneAt=Date.now();
  currentOpText='同步完成';
  updateUi();
  return true;
}

function p79ArchiveObsoleteAttendanceEdits(items,reason){
 if(!items.length)return 0;
 const q=readQueue();
 const selected=items.filter(item=>q.some(current=>current.key===item.key&&samePayload(current.payload,item.payload)));
 if(!selected.length)return 0;
 const archive=JSON.parse(localStorage.getItem(WITHDRAWN_DRAFTS_KEY)||'[]');
 if(!Array.isArray(archive))throw new Error('舊修改備份格式異常，原佇列保留');
 const at=Date.now();
 const drafts=selected.map((item,i)=>({backupId:at+':obsolete:'+i+':'+item.key,state:'withdrawn',withdrawnAt:at,reason,item:JSON.parse(JSON.stringify(item))}));
 const raw=JSON.stringify([...archive,...drafts]);
 localStorage.setItem(WITHDRAWN_DRAFTS_KEY,raw);
 if(localStorage.getItem(WITHDRAWN_DRAFTS_KEY)!==raw)throw new Error('舊修改備份未完成，原佇列保留');
 const keep=q.filter(current=>!selected.some(item=>current.key===item.key&&samePayload(current.payload,item.payload)));
 if(!saveQueue(keep)){saveQueue(q);throw new Error('待同步狀態無法保存，原修改保留');}
 return selected.length;
}

function confirmCloudDelete(id){
  const wanted=String(id??'');
  if(!wanted)return false;

  p79ArchiveObsoleteAttendanceEdits(readQueue().filter(item=>payloadRecordId(item?.payload)===wanted&&['updateRecord','editRecord'].includes(String(item.payload?.action||''))),'cloud-delete-confirmed');
  const q=readQueue();
  let removed=0;
  const keep=[];
  q.forEach(item=>{
    const same=payloadRecordId(item?.payload)===wanted;
    const isDelete=String(item?.payload?.action||'')==='deleteRecord';
    if(same&&isDelete)removed++;
    else keep.push(item);
  });

  if(!removed)return false;
  saveQueue(keep);
  lastDoneAt=Date.now();
  currentOpText='同步完成';
  updateUi();
  return true;
}

async function p79ReadAttendanceEditCloud(id,signal,context=null){
 const url=gasUrl();if(!url)throw new Error('未設定 GAS URL');
 const response=await fetch(url+(url.includes('?')?'&':'?')+'action=getAttendanceWriteStatus&ids='+encodeURIComponent(id)+'&token='+encodeURIComponent(token())+'&t='+Date.now(),{cache:'no-store',signal});
 const data=await response.json();
 if(!response.ok||!data?.ok||!data.found||typeof data.found!=='object')throw new Error(data?.error||'無法核對雲端考勤，請稍後再試');
 const record=data.found[String(id)];
 if(!record||String(record.id)!==String(id)){
  // Status indexes can miss an older edited row. Read the official month(s)
  // from the saved intent; never infer identity from a reused numeric ID alone.
  const expected=context?.record||context;
  const months=[...new Set([context?.originalTimeStr,expected?.timeStr].map(value=>String(value||'').replace(/\//g,'-').match(/^\d{4}-\d{2}/)?.[0]).filter(Boolean))];
  if(expected&&['empId','attNo'].some(k=>String(expected[k]??'').trim())&&months.length){
   const matches=[];let anySameId=false;
   for(const month of months){
    const fullResponse=await fetch(url+(url.includes('?')?'&':'?')+'action=getAttendanceMainDirect&month='+encodeURIComponent(month)+'&token='+encodeURIComponent(token())+'&t='+Date.now(),{cache:'no-store',signal});
    const full=await fullResponse.json();
    if(!fullResponse.ok||!full?.ok||String(full.month)!==month||!Array.isArray(full.records))throw new Error(full?.error||'正式主表核對失敗，修改草稿已保留');
    anySameId=anySameId||full.records.some(r=>String(r.id)===String(id));
    matches.push(...full.records.filter(r=>String(r.id)===String(id)&&['empId','attNo'].every(k=>!String(expected[k]??'').trim()||normalizeCompareValue(r[k])===normalizeCompareValue(expected[k]))&&((typeof getAttendanceRecordType==='function')?getAttendanceRecordType(r)===getAttendanceRecordType(expected):String(r.status)===String(expected.status))));
   }
   const unique=[...new Map(matches.map(r=>[JSON.stringify(r),r])).values()];
   if(unique.length===1&&/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?$/.test(String(unique[0].timeStr||'').trim()))return unique[0];
   if(!anySameId)throw Object.assign(new Error('正式月份主表已無此紀錄，舊修改已停止送出'),{retryable:false,recordAbsent:true,checkedMonths:months});
   if(unique.length>1)throw Object.assign(new Error('正式主表有多筆相同編號及身分的考勤，無法唯一確認班次；修改草稿保留'),{retryable:false});
  }
  throw Object.assign(new Error('雲端正式主表仍找不到這筆考勤，可能已刪除；修改草稿保留，可撤回這筆修改'),{retryable:false});
 }
 // Older status replies can contain a date without its clock time. Never use
 // that truncated value as the compare-and-swap baseline for a correction.
 if(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(String(record.timeStr||'').trim())){
  const month=String(record.timeStr).trim().replace(/\//g,'-').slice(0,7);
  const fullResponse=await fetch(url+(url.includes('?')?'&':'?')+'action=getAttendanceMainDirect&month='+encodeURIComponent(month)+'&token='+encodeURIComponent(token())+'&t='+Date.now(),{cache:'no-store',signal});
  const full=await fullResponse.json();
  if(!fullResponse.ok||!full?.ok||String(full.month)!==month||!Array.isArray(full.records))throw new Error(full?.error||'正式主表核對失敗，修改草稿已保留');
  const matches=full.records.filter(r=>String(r.id)===String(id)&&['empId','attNo','status'].every(k=>String(r[k]??'').trim()===String(record[k]??'').trim()));
  if(matches.length!==1||!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?$/.test(String(matches[0].timeStr||'').trim()))throw Object.assign(new Error('雲端這筆考勤只有日期、缺少完整打卡時間，無法核對原時間；修改草稿已保留，請管理員先修復正式主表的時間欄位後重新核對'),{retryable:false});
  return matches[0];
 }
 return record;
}
async function p79PrepareAttendanceEdit(id){
 const info=queueInfoForId(id);
 if(info&&!info.paused)throw new Error('這筆考勤尚在同步，請等同步完成後再修改');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{return await p79ReadAttendanceEditCloud(id,controller.signal);}finally{clearTimeout(timer);}
}
function p79AttendanceEditAlreadySaved(payload,cloud){
 const local=payload.record||{};
 if(String(local.id)!==String(cloud.id))return false;
 if(!['timeStr','status','empId','attNo'].every(key=>normalizeCompareValue(local[key])===normalizeCompareValue(cloud[key])))return false;
 // These are generated provenance labels, not a user-authored correction.
 // A blank cloud note must not keep an otherwise identical punch in conflict.
 const note=r=>{
  const text=String(r?.note||'').trim();
  return /^(管理員手動補刷|管理員手動補卡)$/.test(text)?'':text;
 };
 return note(local)===note(cloud);
}

function p79PausedReviewItem(key,payload){
 const item=readQueue().find(x=>x.key===key&&x.paused&&['updateRecord','editRecord'].includes(String(x.payload?.action||'')));
 if(!item||(payload&&!samePayload(item.payload,payload)))throw new Error('這筆待同步修改已變更，請重新開啟明細核對');
 return item;
}
function p79PausedReviewIdentity(payload,cloud){
 const record=payload.record||{};
 if(String(record.id)!==String(cloud.id))return false;
 const fields=['empId','attNo'].filter(k=>String(record[k]??'').trim());
 return fields.length>0&&fields.every(k=>normalizeCompareValue(record[k])===normalizeCompareValue(cloud[k]));
}
const WITHDRAWN_DRAFTS_KEY='port79_attendance_withdrawn_drafts_v1';
function p79ReadWithdrawnAttendanceDrafts(){
 const items=JSON.parse(localStorage.getItem(WITHDRAWN_DRAFTS_KEY)||'[]');
 if(!Array.isArray(items))throw new Error('撤回草稿備份格式異常，原資料保留');
 return items.filter(x=>x.state==='withdrawn');
}
function p79ConfirmWithdrawnAttendanceDrafts(cloud){
 const raw=localStorage.getItem(WITHDRAWN_DRAFTS_KEY);if(!raw)return 0;
 const items=JSON.parse(raw);if(!Array.isArray(items))throw new Error('撤回草稿備份格式異常');
 let count=0;
 for(const saved of items){
  if(saved.state!=='withdrawn'||!p79PausedReviewIdentity(saved.item?.payload||{},cloud)||!p79AttendanceEditAlreadySaved(saved.item.payload,cloud))continue;
  saved.state='cloud-confirmed';saved.confirmedAt=Date.now();count++;
 }
 if(count)localStorage.setItem(WITHDRAWN_DRAFTS_KEY,JSON.stringify(items));
 return count;
}
async function p79CheckWithdrawnAttendanceDraft(backupId){
 if(typeof requireAdminAction!=='function'||!requireAdminAction('attendanceEdit','核對撤回草稿'))throw new Error('沒有考勤核對權限');
 const saved=p79ReadWithdrawnAttendanceDrafts().find(x=>x.backupId===backupId);
 if(!saved)throw new Error('這份草稿已完成或狀態已變更，請重新查看明細');
 const snapshot=JSON.stringify(saved);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const cloud=await p79ReadAttendanceEditCloud(payloadRecordId(saved.item.payload),controller.signal,saved.item.payload);
  const current=p79ReadWithdrawnAttendanceDrafts().find(x=>x.backupId===backupId);
  if(!current||JSON.stringify(current)!==snapshot)throw new Error('核對期間草稿已變更，請重新查看明細');
  if(!p79PausedReviewIdentity(saved.item.payload,cloud))throw new Error('雲端員工身分不符，草稿保留');
  if(p79AttendanceEditAlreadySaved(saved.item.payload,cloud)){
   p79ConfirmWithdrawnAttendanceDrafts(cloud);return {state:'saved'};
  }
  return {state:'different',cloud,draft:saved.item.payload.record,backupId};
 }finally{clearTimeout(timer);}
}

function p79WithdrawPausedAttendanceWrites(expectedItems){
 if(typeof requireAdminAction!=='function'||!requireAdminAction('attendanceEdit','撤回暫停的考勤修改'))throw new Error('沒有考勤修改權限');
 if(writing)throw new Error('目前仍有考勤正在送出，請完成後再撤回');
 if(!Array.isArray(expectedItems)||!expectedItems.length)throw new Error('沒有可撤回的暫停修改');
 const q=readQueue(),selected=new Set();
 for(const expected of expectedItems){
  if(!expected?.payload)throw new Error('缺少待同步修改快照，請重新開啟明細');
  p79PausedReviewItem(expected.key,expected.payload);selected.add(expected.key);
 }
 const archive=JSON.parse(localStorage.getItem(WITHDRAWN_DRAFTS_KEY)||'[]');
 if(!Array.isArray(archive))throw new Error('撤回草稿備份格式異常，原佇列保留');
 const at=Date.now(),drafts=q.filter(x=>selected.has(x.key)).map((item,i)=>({backupId:at+':'+i+':'+item.key,state:'withdrawn',withdrawnAt:at,item:JSON.parse(JSON.stringify(item))}));
 const serialized=JSON.stringify([...archive,...drafts]);
 // Persist and verify recovery data before touching the outbox. No cloud write.
 localStorage.setItem(WITHDRAWN_DRAFTS_KEY,serialized);
 if(localStorage.getItem(WITHDRAWN_DRAFTS_KEY)!==serialized)throw new Error('草稿備份未完成，待同步修改仍保留');
 if(!saveQueue(q.filter(x=>!selected.has(x.key)))){saveQueue(q);throw new Error('撤回狀態無法保存，原修改仍保留');}
 currentOpText='已撤回 '+drafts.length+' 筆修改（草稿已備份，雲端未變更）';updateUi();
 return {ok:true,count:drafts.length};
}
function p79RestoreWithdrawnAttendanceDraft(backupId){
 if(typeof requireAdminAction!=='function'||!requireAdminAction('attendanceEdit','恢復撤回的考勤草稿'))throw new Error('沒有考勤修改權限');
 if(writing)throw new Error('目前仍有考勤正在送出，請完成後再恢復');
 const archive=JSON.parse(localStorage.getItem(WITHDRAWN_DRAFTS_KEY)||'[]');
 if(!Array.isArray(archive))throw new Error('撤回草稿備份格式異常');
 const saved=archive.find(x=>x.backupId===backupId&&x.state==='withdrawn');
 if(!saved)throw new Error('找不到這份撤回草稿，請重新開啟明細');
 const q=readQueue();if(q.some(x=>x.key===saved.item.key))throw new Error('這筆已有待同步修改，請先核對，不會覆蓋');
 const item={...saved.item,paused:true,state:'paused',nextRetryAt:Number.MAX_SAFE_INTEGER,lastError:'由撤回備份恢復，等待核對；不會自動送出'};
 if(!saveQueue([...q,item])){saveQueue(q);throw new Error('無法保存恢復的草稿，備份仍保留');}
 saved.state='restored';saved.restoredAt=Date.now();
 try{localStorage.setItem(WITHDRAWN_DRAFTS_KEY,JSON.stringify(archive));}catch(e){/* The queued copy and original backup both remain recoverable. */}
 updateUi();return {ok:true};
}

async function p79ReviewPausedAttendanceWrite(key){
 const item=p79PausedReviewItem(key),payload=JSON.parse(JSON.stringify(item.payload));
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try {
  const cloud=await p79ReadAttendanceEditCloud(payloadRecordId(payload),controller.signal,payload);
  p79PausedReviewItem(key,payload);
  if(!p79PausedReviewIdentity(payload,cloud))throw new Error('雲端紀錄的員工身分無法確認，草稿保留，請核對人員與紀錄 ID');
  if(p79AttendanceEditAlreadySaved(payload,cloud)){
   if(typeof p79ConfirmWithdrawnAttendanceDrafts==='function')p79ConfirmWithdrawnAttendanceDrafts(cloud);
   if(!remove(key,payload))throw new Error('待同步修改已變更，請重新核對');
   try{markRecentAttendanceMutationCloudConfirmed?.(cloud.id)}catch(e){}
   lastDoneAt=Date.now();updateUi();
   return {state:'saved',cloud};
  }
  return {state:'review',key,payload,cloud};
 } catch(error){
  if(error?.recordAbsent===true){
   const current=p79PausedReviewItem(key,payload);
   p79ArchiveObsoleteAttendanceEdits([current],'official-month-record-absent');
   updateUi();return {state:'obsolete',id:payloadRecordId(payload)};
  }
  throw error;
 } finally {clearTimeout(timer);}
}
async function p79ApplyPausedAttendanceReview(review){
 if(typeof requireAdminAction!=='function'||!requireAdminAction('attendanceEdit','核對並套用考勤修改'))throw new Error('沒有考勤修改權限');
 if(review?.state!=='review')throw new Error('請先核對雲端與草稿');
 p79PausedReviewItem(review.key,review.payload);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 let cloud;
 try{cloud=await p79ReadAttendanceEditCloud(payloadRecordId(review.payload),controller.signal,review.payload);}finally{clearTimeout(timer);}
 p79PausedReviewItem(review.key,review.payload);
 if(!p79PausedReviewIdentity(review.payload,cloud)||!p79AttendanceEditAlreadySaved({record:review.cloud},cloud)||String(review.cloud.manuallyEditedAt||'')!==String(cloud.manuallyEditedAt||''))throw new Error('核對後雲端又有變更，未送出修改；請重新核對，草稿仍保留');
 const record={...review.payload.record,manuallyEdited:true,manuallyEditedAt:new Date().toISOString()};
 const payload={...review.payload,record,originalTimeStr:cloud.timeStr,originalPunchType:typeof getAttendanceRecordType==='function'?getAttendanceRecordType(cloud):cloud.status};
 // The user reviewed both values. Queue replacement and the normal CAS write remain serialized.
 const result=await submitAttendanceWrite(payload,'考勤修改已核對並同步雲端');
 if(result?.ok&&!result.queued){
  const index=records.findIndex(r=>String(r.id)===String(record.id)&&(typeof getAttendanceRecordType!=='function'||getAttendanceRecordType(r)===getAttendanceRecordType(cloud)));
  if(index>=0)records[index]={...records[index],...record};
  try{saveRecords?.();p79RenderOnlyVisibleAttendanceView?.()}catch(e){}
 }
 return result;
}

async function send(payload,timeout=25000){
  const url=gasUrl();
  if(!url) throw new Error('未設定 GAS URL');
  const body={...payload};
  const tk=token();
  if(tk&&!body.token)body.token=tk;

  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    if(['updateRecord','editRecord'].includes(String(payload.action||''))){
      const cloud=await p79ReadAttendanceEditCloud(payloadRecordId(payload),ctrl.signal,payload);
      if(p79AttendanceEditAlreadySaved(payload,cloud))return {ok:true,alreadySaved:true};
      if(normalizeCompareValue(payload.originalTimeStr)!==normalizeCompareValue(cloud.timeStr)||
         (payload.originalPunchType&&String(payload.originalPunchType)!==(typeof getAttendanceRecordType==='function'?getAttendanceRecordType(cloud):String(cloud.status)))){
        throw Object.assign(new Error('雲端時間與編輯時不同（目前：'+String(cloud.timeStr||'')+' '+String(cloud.status||'')+'）；修改草稿已保留，請重新開啟此筆核對後儲存'),{retryable:false});
      }
      // Normalize only equivalent date formatting; never rebase a changed cloud time.
      body.originalTimeStr=cloud.timeStr;

    }
    const r=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(body),
      cache:'no-store',
      signal:ctrl.signal
    });
    const text=await r.text();
    let data=null;
    try{data=JSON.parse(text)}catch(e){throw new Error('GAS 回傳不是 JSON')}
    if(!data?.ok){
      const err=new Error(String(data?.error||'雲端寫入失敗'));
      err.retryable=data?.retryable!==false;
      err.serverData=data;
      err.duplicatePunch=data?.duplicatePunch===true;
      throw err;
    }
    const action=String(payload?.action||'');
    const employeePunch=['queueEmployeePunch','persistEmployeePunch'].includes(action)||
      (action==='addRecord'&&String(payload?.record?.source||'').toLowerCase().includes('employee'));
    if(employeePunch){
      const id=payloadRecordId(payload);
      if(String(data.id||'')!==id)throw new Error('雲端回覆紀錄 ID 不符，尚未確認正式打卡');
      // V49 flushes the official row and original journal before issuing this receipt.
      if(data.punchWriteConfirmed===true && (data.fastLane===true || data.persisted===true))return data;
      const check=await fetch(url+(url.includes('?')?'&':'?')+'action=getAttendanceWriteStatus&ids='+encodeURIComponent(id)+'&token='+encodeURIComponent(tk),{cache:'no-store',signal:ctrl.signal});
      const verified=await check.json();
      if(!check.ok||verified?.ok!==true||!cloudRecordConfirmsItem({payload},verified?.found?.[id])){
        throw new Error('雲端正式主表尚未核對到同一筆打卡，原始時間與待傳紀錄保留');
      }
    }
    return data;
  }finally{
    clearTimeout(timer);
  }
}

function p79PauseAttendanceWrite(payload,error,attempts){
  const edit=['updateRecord','editRecord'].includes(String(payload?.action||''));
  const conflict=/原時間不符|原始時間不符|已由其他分頁修改|已被其他.*修改|TIME_CONFLICT|STALE_RECORD/i.test(String(error?.message||error||''));
  return edit && (conflict || error?.retryable===false || attempts>=3);
}
function p79PunchUploadPriority(item){
  const action=String(item?.payload?.action||'');
  // 新打卡優先於管理員修改與整批修復；僅調整待送出順序，不提前宣告成功。
  if(['addRecord','queueEmployeePunch','persistEmployeePunch'].includes(action))return 0;
  if(['updateRecord','editRecord'].includes(action))return 2;
  if(['syncRecords','repairAttendanceRecords'].includes(action))return 4;
  return 3;
}
function p79OrderedReadyQueue(q,force,now){
  return q.filter(x=>!x.paused&&(force||Number(x.nextRetryAt||0)<=now))
    .map((item,index)=>({item,index}))
    .sort((a,b)=>p79PunchUploadPriority(a.item)-p79PunchUploadPriority(b.item)||a.index-b.index)
    .map(x=>x.item);
}

async function drain(force=false){
  if(writing)return false;
  if(navigator.onLine===false){updateUi();return false}
  let q=readQueue();
  if(!q.length){updateUi();return true}
  if(!p79OrderedReadyQueue(q,force,Date.now()).length){updateUi();return false}

  writing=true;
  syncBatchTotal=Math.max(1,q.length);
  syncBatchDone=0;
  syncBatchStartedAt=Date.now();
  try{
    while(true){
      q=readQueue();
      if(!q.length)break;
      const now=Date.now();
      const item=p79OrderedReadyQueue(q,force,now)[0];
      if(!item)break;

      currentOpText=desc(item.payload);
      activeSyncRecordId=payloadRecordId(item.payload);
      item.state='syncing';
      saveQueue(q.map(x=>x.key===item.key?item:x));
      updateUi();

      try{
        const data=await send(item.payload,45000);
        // 寫入 ACK 不能跳過其他人尚未讀取的 Delta；游標只由讀取結果推進。

        const rid=item?.payload?.record?.id ?? item?.payload?.id;
        const latestConfirmed=remove(item.key,item.payload);
        if(rid!=null&&latestConfirmed){
          try{markRecentAttendanceMutationCloudConfirmed?.(rid)}catch(e){}
        }
        if(String(item?.payload?.action||'')==='deleteRecord'){
            try{confirmCloudDelete(rid);window.p79ApplyConfirmedAttendanceDelete?.(rid)}catch(e){}
        }
        if(String(item?.payload?.action||'')==='addRecord' &&
            String(item?.payload?.record?.source||'').toLowerCase().includes('employee')){
            try{window.p79ConfirmMobilePunchCloudRecord?.(item?.payload?.record?.id);}catch(e){}
        }
        syncBatchDone++;
        lastDoneAt=Date.now();
        currentOpText='同步完成';
        activeSyncRecordId='';

        try{p79RenderOnlyVisibleAttendanceView?.()}catch(e){}

        if(typeof item.payload?._v5Success==='function'){
          try{item.payload._v5Success(data)}catch(e){}
        }
      }catch(err){
        q=readQueue();
        const cur=q.find(x=>x.key===item.key);
        if(!cur||!samePayload(cur.payload,item.payload))continue;

        const nonRetryable = err?.retryable === false;
        const serverData = err?.serverData || {};
        const rid = cur?.payload?.record?.id ?? cur?.payload?.id;

        if(nonRetryable && err?.duplicatePunch===true && String(cur?.payload?.action||'')!=='deleteRecord' && !['updateRecord','editRecord'].includes(String(cur?.payload?.action||''))){
          // V5.10.17：雲端判定為重複刷卡時不可一直重試，
          // 並把剛才 optimistic 加入的本機那一筆回滾。
          remove(cur.key,cur.payload);
          if(rid!=null){
            const ridText=String(rid);
            rejectedPunchById.set(ridText, String(err?.message||'重複刷卡已阻擋'));
            try{window.p79HandleRejectedPunch?.(ridText,String(err?.message||''));}catch(e){}
            records=(Array.isArray(records)?records:[]).filter(r=>String(r?.id??'')!==ridText);
            try{removeAttendanceRecordsFromArchive?.([ridText])}catch(e){}
            try{forgetRecentAttendanceMutation?.(ridText)}catch(e){}
            try{
              if(typeof window.p79ScheduleAttendancePersist==='function')window.p79ScheduleAttendancePersist();
              else saveRecords?.();
            }catch(e){}
          }
          try{updateHomeClockInButtonState?.()}catch(e){}
          try{renderEmpHistoryTable?.()}catch(e){}
          try{p79RenderOnlyVisibleAttendanceView?.()}catch(e){}
          try{showToast(String(err?.message||'重複刷卡已阻擋'),'warning')}catch(e){}
          syncBatchDone++;
          activeSyncRecordId='';
          currentOpText='重複刷卡已阻擋';
          updateUi();
          continue;
        }

        const attempts=Number(cur.attempts||0)+1;
        cur.attempts=attempts;
        cur.state='pending';
        cur.lastError=String(err?.message||err||'失敗');
        cur.paused=p79PauseAttendanceWrite(cur.payload,err,attempts);
        cur.nextRetryAt=cur.paused?Number.MAX_SAFE_INTEGER:Date.now()+p79AttendanceRetryDelay(cur.payload,attempts);
        saveQueue(q.map(x=>x.key===cur.key?cur:x));
        activeSyncRecordId='';
        currentOpText=cur.paused?'已暫停，等待核對':'等待重試';
        updateUi();
        break;
      }
    }
  }finally{
    writing=false;
    if(lastDoneAt)scheduleDelta(100);
    activeSyncRecordId='';
    updateUi();
  }
  return !readQueue().length;
}

// V6.0.12：管理員手動按「快速同步」時使用。
// 同一 record id 絕不並行；不同 record id 最多 4 筆同時送。
async function drainFast(force=true, concurrency=4){
  if(writing)return false;
  if(navigator.onLine===false){updateUi();return false}

  let q=readQueue();
  if(!q.length){updateUi();return true}
  if(!p79OrderedReadyQueue(q,force,Date.now()).length){updateUi();return false}

  writing=true;
  syncBatchTotal=Math.max(1,q.length);
  syncBatchDone=0;
  syncBatchStartedAt=Date.now();

  const processOne=async(item)=>{
    try{
      const data=await send(item.payload,45000);

      // 保留未讀 Delta，讓其他人的同時修改仍可同步。

      const rid=item?.payload?.record?.id ?? item?.payload?.id;
      const latestConfirmed=remove(item.key,item.payload);
      if(rid!=null&&latestConfirmed){
        try{markRecentAttendanceMutationCloudConfirmed?.(rid)}catch(e){}
      }
      if(String(item?.payload?.action||'')==='deleteRecord'){
        try{confirmCloudDelete(rid);window.p79ApplyConfirmedAttendanceDelete?.(rid)}catch(e){}
      }
      syncBatchDone++;
      lastDoneAt=Date.now();

      if(typeof item.payload?._v5Success==='function'){
        try{item.payload._v5Success(data)}catch(e){}
      }
      return {ok:true,item};
    }catch(err){
      const current=readQueue();
      const cur=current.find(x=>x.key===item.key);
      if(!cur||!samePayload(cur.payload,item.payload))return {ok:false,item,error:err,removed:true};

      const nonRetryable=err?.retryable===false;
      const rid=cur?.payload?.record?.id ?? cur?.payload?.id;

      if(nonRetryable && err?.duplicatePunch===true && String(cur?.payload?.action||'')!=='deleteRecord' && !['updateRecord','editRecord'].includes(String(cur?.payload?.action||''))){
        remove(cur.key,cur.payload);
        if(rid!=null){
          const ridText=String(rid);
          rejectedPunchById.set(ridText,String(err?.message||'重複刷卡已阻擋'));
          records=(Array.isArray(records)?records:[]).filter(r=>String(r?.id??'')!==ridText);
          try{removeAttendanceRecordsFromArchive?.([ridText])}catch(e){}
          try{forgetRecentAttendanceMutation?.(ridText)}catch(e){}
        }
        syncBatchDone++;
        return {ok:false,item,error:err,nonRetryable:true};
      }

      const attempts=Number(cur.attempts||0)+1;
      cur.attempts=attempts;
      cur.state='pending';
      cur.lastError=String(err?.message||err||'失敗');
      cur.paused=p79PauseAttendanceWrite(cur.payload,err,attempts);
        cur.nextRetryAt=cur.paused?Number.MAX_SAFE_INTEGER:Date.now()+p79AttendanceRetryDelay(cur.payload,attempts);
      saveQueue(current.map(x=>x.key===cur.key?cur:x));
      return {ok:false,item,error:err,retryable:true};
    }
  };

  try{
    while(true){
      q=readQueue();
      if(!q.length)break;

      const now=Date.now();
      const eligible=p79OrderedReadyQueue(q,force,now);
      if(!eligible.length)break;

      const group=[];
      const usedIds=new Set();
      let hasBulk=false;

      for(const item of eligible){
        if(group.length>=Math.max(1,Number(concurrency)||4))break;

        const action=String(item?.payload?.action||'');
        const rid=payloadRecordId(item?.payload);
        const bulk=action==='syncRecords'||action==='repairAttendanceRecords';

        if(bulk){
          if(group.length===0){
            group.push(item);
            hasBulk=true;
          }
          break;
        }

        if(hasBulk)break;
        const identity=rid||item.key;
        if(usedIds.has(identity))continue;
        usedIds.add(identity);
        group.push(item);
      }

      if(!group.length)break;

      currentOpText=group.length>1
        ? '快速同步 '+group.length+' 筆'
        : desc(group[0]?.payload);
      activeSyncRecordId=group.length===1?payloadRecordId(group[0]?.payload):'';
      updateUi();

      const results=await Promise.all(group.map(processOne));
      if(results.some(r=>r?.retryable===true))break;

      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }finally{
    writing=false;
    if(lastDoneAt)scheduleDelta(100);
    activeSyncRecordId='';
    currentOpText=readQueue().length?(readQueue().every(x=>x.paused)?'已暫停，等待核對':'等待重試'):'同步完成';
    try{p79RenderOnlyVisibleAttendanceView?.()}catch(e){}
    updateUi();
  }

  return !readQueue().length;
}

function mergeDeltaEvent(event){
  const kind=String(event?.kind||'').toLowerCase();
  if(kind==='reset') return false;
  if(kind==='delete'){
    const id=String(event?.id??'');
    if(!id)return false;
    confirmCloudDelete(id);
    if(pendingForId(id))return false;
    records=records.filter(r=>String(r?.id??'')!==id);
    try{forgetRecentAttendanceMutation?.(id)}catch(e){}
    return true;
  }
  const rec=event?.record;
  if(!rec)return false;
  const id=String(rec?.id??'');
  if(id){
    confirmCloudRecord(rec);
    if(pendingForId(id))return false;
  }

  const nr=typeof normalizeAttendanceRecordIdentifiers==='function'
    ? normalizeAttendanceRecordIdentifiers(rec)
    : rec;

  // V6.0.14：本機已刪除的事件，在雲端 delete 尚未完全傳播前可能仍出現在 Delta。
  // tombstone 存在時直接忽略 stale upsert，禁止復活。
  if(typeof isLocallyDeletedAttendanceRecord==='function' && isLocallyDeletedAttendanceRecord(nr)){
    return false;
  }

  // V5.10.35：舊雲端資料可能讓上班與下班共用同一 id。
  // V5 Delta 只能覆蓋「同 id + 同 IN/OUT 類型」的紀錄，避免 OUT 被 IN 吃掉。
  const nrType=typeof getAttendanceRecordType==='function'?getAttendanceRecordType(nr):'';
  const idx=records.findIndex(r=>{
    if(String(r?.id??'')!==String(nr?.id??''))return false;
    if(typeof getAttendanceRecordType!=='function')return true;
    return getAttendanceRecordType(r)===nrType;
  });
  if(idx>=0){
    const precise=typeof p79AttendancePreciseVersion==='function'?p79AttendancePreciseVersion(records[idx],nr):null;
    const currentEdit=Date.parse(String(records[idx].manuallyEditedAt||''))||0;
    const incomingEdit=Date.parse(String(nr.manuallyEditedAt||''))||0;
    const staleEdit=currentEdit>incomingEdit;
    records[idx]=precise||(staleEdit?records[idx]:{...records[idx],...nr});
  }
  else records.unshift(nr);
  return true;
}

async function pollDelta(force=false){
  if(deltaBusy||writing)return false;
  if(navigator.onLine===false)return false;
  if(document.hidden&&!force)return false;
  const url=gasUrl();
  if(!url)return false;

  deltaBusy=true;
  let changed=false;
  try{
    const tk=token();
    let u=url+(url.includes('?')?'&':'?')+
      'action=getAttendanceDelta&since='+encodeURIComponent(String(lastSeq||0))+
      '&limit=100&tail=30&t='+Date.now();
    if(tk)u+='&token='+encodeURIComponent(tk);

    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),25000);
    try{
      const r=await fetch(u,{cache:'no-store',signal:ctrl.signal});
      const data=await r.json();
      if(!data?.ok)throw new Error(data?.error||'Delta 失敗');

      // V5.11：Delta reset/cursor 回退必須立即做權威月份修復。
      const latestSeq=Math.max(0,Number(data.latestSeq??data.deltaSeq??0)||0);
      const resetRequired=data.resetRequired===true || (lastSeq>0 && latestSeq>0 && latestSeq<lastSeq);
      if(resetRequired){
        lastSeq=0;
        try{sessionStorage.setItem('port79_attendance_v5_delta_seq','0')}catch(e){}
        if(!deltaResetRepairBusy){
          deltaResetRepairBusy=true;
          setTimeout(async()=>{
            try{
              if(typeof window.p79AttendanceForceRepair==='function') await window.p79AttendanceForceRepair();
              else if(typeof loadAttendanceCoreSyncData==='function') await loadAttendanceCoreSyncData(false);
            }catch(e){
              console.warn('[PORT79 V5.11] Delta reset 權威修復失敗',e);
            }finally{
              deltaResetRepairBusy=false;
            }
          },0);
        }
      }

      const events=Array.isArray(data.events)?data.events:[];
      for(const ev of events) changed=mergeDeltaEvent(ev)||changed;

      const seq=Math.max(0,Number(data.deltaSeq??data.latestSeq??0)||0);
      if(seq>0){
        lastSeq=Math.max(lastSeq,seq);
        sessionStorage.setItem('port79_attendance_v5_delta_seq',String(lastSeq));
      }

      if(changed){
        try{saveRecords?.()}catch(e){}
        try{p79RenderOnlyVisibleAttendanceView?.()}catch(e){}
      }
    }finally{clearTimeout(timer)}
  }catch(e){
    // Delta 失敗只留待下一輪，不整月重抓，不洗畫面。
  }finally{
    deltaBusy=false;
  }
  return changed;
}
function scheduleDelta(ms){
  clearTimeout(deltaTimer);
  deltaTimer=setTimeout(async()=>{
    const changed=await pollDelta(false);
    scheduleDelta(changed?ACTIVE_MS:IDLE_MS);
  },ms);
}
function startDelta(){
  if(deltaTimer)return true;
  scheduleDelta(500);
  return true;
}

function ensurePanel(){
  let el=document.getElementById('p79AttendanceV5Status');
  if(el)return el;
  el=document.createElement('div');
  el.id='p79AttendanceV5Status';
  el.className='mt-2 flex flex-wrap items-center gap-2 text-[10px] font-black';
  const sync=document.getElementById('cloudSyncStatus');
  if(sync?.parentElement)sync.parentElement.appendChild(el);
  else document.body.prepend(el);
  return el;
}
function p79LatestCloudActivityAt(){
  let readAt=0;
  try{
    readAt=Number(typeof lastCloudLoadSuccessAt!=='undefined'?lastCloudLoadSuccessAt:0)||0;
  }catch(e){}
  return Math.max(Number(lastDoneAt||0),readAt);
}

function updateUi(){
  const el=ensurePanel();
  const q=readQueue();
  const paused=q.filter(x=>x.paused).length;
  const pending=q.length-paused;
  const latestAt=p79LatestCloudActivityAt();
  const latestText=latestAt
    ? new Date(latestAt).toLocaleTimeString('zh-TW',{hour12:false})
    : '--';

  const total=Math.max(
    1,
    Number(syncBatchTotal||0),
    Number(syncBatchDone||0)+pending+(writing?1:0)
  );
  const currentIndex=Math.min(total,Math.max(1,Number(syncBatchDone||0)+1));
  const nextDescription=pending?desc(q.find(x=>!x.paused)?.payload):'';

  const storageWarning=queueStorage==='memory'?'⚠ 儲存空間不足：待傳資料僅留目前頁面，請勿關閉':queueStorage==='session'?'⚠ 已使用分頁備援保留待傳資料，請等待雲端確認':'';
  const mainState = writing
    ? `✍️ 寫入中 ${currentIndex}/${total}｜${currentOpText}`
    : (pending
        ? `🟠 等待寫入 ${pending} 筆｜下一筆：${nextDescription}`
        : (paused?`🟠 ${paused} 筆已暫停｜等待人工核對，不會自動重送`:(latestAt
            ? `✅ 已同步｜${latestText}`
            : '● 待命｜尚未完成首次雲端作業')));

  const html=`
    ${storageWarning?'<strong class="text-red-700">'+storageWarning+'</strong>':''}
    <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">⚡ V5 即時核心</span>
    <span class="rounded-full border ${(pending||paused)?'border-amber-200 bg-amber-50 text-amber-700':'border-emerald-200 bg-emerald-50 text-emerald-700'} px-2 py-1">${pending?`📤 同步佇列 ${pending} 筆`:paused?`🟠 待核對 ${paused} 筆`:'📤 同步佇列已清空'}</span>
    <span class="rounded-full border ${writing?'border-indigo-200 bg-indigo-50 text-indigo-700':((pending||paused)?'border-amber-200 bg-amber-50 text-amber-700':'border-emerald-200 bg-emerald-50 text-emerald-700')} px-2 py-1">${mainState}</span>
    <span class="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-700">📡 即時同步 ${deltaBusy?'讀取中':`監聽正常｜Seq ${lastSeq}`}</span>`;

  const signature=[pending,paused,writing,currentOpText,activeSyncRecordId,syncBatchTotal,syncBatchDone,deltaBusy,lastSeq,latestAt].join('|');
  if(signature!==lastStatusUiSignature){
    el.innerHTML=html;
    lastStatusUiSignature=signature;
  }

  // 頁首狀態也顯示真實進度，不再只寫「待命」。
  try{
    if(typeof setCloudSyncStatus==='function'){
      const opState = window.p79AttendanceOperationState || {};
      const readBusy = opState.busy === true && opState.mode === 'read';
      const readTimedOut = readBusy && (Date.now() - Number(opState.updatedAt || 0) >= 90000);
      // 讀取逾時不可永久佔住「更新中」，失敗也不能顯示假成功。
      if(readTimedOut){
        setCloudSyncStatus('雲端考勤讀取逾時，請重新整理後重試','error','error');
      }else if(readBusy){
        // 有效讀取中由 GET 更新狀態。
      }else if(writing){
        setCloudSyncStatus(`第 ${currentIndex}/${total} 筆｜${currentOpText}`,'loading','write');
      }else if(pending){
        setCloudSyncStatus(`待同步 ${pending} 筆｜下一筆：${nextDescription}`,'warning','idle');
      }else if(paused){
        setCloudSyncStatus(`${paused} 筆修改已暫停，等待核對；不會自動重送`,'warning','idle');
      }else if(opState.mode === 'error'){
        // 最近同步失敗時保留錯誤，直到新的 GET/POST 確實成功。
      }else if(latestAt){
        const prevMode=String(opState.mode||'');
        if(prevMode==='write'){
          setCloudSyncStatus(`雲端考勤已寫入｜${latestText}`,'success','write');
        }else{
          setCloudSyncStatus(`雲端考勤已更新｜${latestText}`,'success','read');
        }
      }else{
        setCloudSyncStatus('目前沒有讀取或寫入','idle','idle');
      }
    }
  }catch(e){}
}

// ---- replace legacy sync API with V5 ----
window.p79V5Enqueue=enqueue;
window.p79V5Drain=drain;
window.p79V5DrainFast=drainFast;
window.p79V5StartDelta=startDelta;
window.p79V5PollDelta=pollDelta;
window.p79V5PendingForId=pendingForId;
window.p79V5PrepareAttendanceEdit=p79PrepareAttendanceEdit;
window.p79V5ReviewPausedWrite=p79ReviewPausedAttendanceWrite;
window.p79V5WithdrawPausedWrites=p79WithdrawPausedAttendanceWrites;
window.p79V5ReadWithdrawnDrafts=p79ReadWithdrawnAttendanceDrafts;
window.p79V5CheckWithdrawnDraft=p79CheckWithdrawnAttendanceDraft;
window.p79V5RestoreWithdrawnDraft=p79RestoreWithdrawnAttendanceDraft;
window.p79V5ApplyPausedReview=p79ApplyPausedAttendanceReview;
window.p79V5QueueInfoForId=queueInfoForId;
window.p79V5ConfirmCloudRecord=confirmCloudRecord;
window.p79V5ConfirmCloudDelete=confirmCloudDelete;
window.p79V5RefreshStatus=updateUi;
window.p79V5ReadPendingQueue=()=>readQueue().map(item=>!writing&&item.state==='syncing'?{...item,state:'pending'}:item);
window.p79V5GetStatus=()=>({
  queueStorage,
  writing,
  pending:readQueue().length,
  runnable:readQueue().filter(x=>!x.paused).length,
  paused:readQueue().filter(x=>x.paused).length,
  currentOpText,
  activeSyncRecordId,
  syncBatchTotal,
  syncBatchDone,
  deltaBusy,
  lastSeq,
  lastDoneAt,
  cloudActivityAt:p79LatestCloudActivityAt()
});


async function submitAttendanceWrite(payload,successMsg,onSuccess,onError){
  const recordId = payload?.record?.id ?? payload?.id;

  // 非考勤寫入交還舊系統；V5 只接管考勤。
  if(!isV5AttendanceWrite(payload)){
    if(typeof window.p79LegacyPostToCloud==='function'){
      return window.p79LegacyPostToCloud(payload,successMsg,onSuccess,onError);
    }
    return {ok:false,error:'非考勤寫入未由 V5 處理'};
  }

  const pausedItem=readQueue().find(x=>x.paused&&x.key===opKey(payload)&&samePayload(x.payload,payload));
  if(pausedItem){
    const reason=String(pausedItem.lastError||'此修改已暫停，請核對雲端時間後重新修改');
    if(typeof onError==='function')try{onError(reason)}catch(e){}
    updateUi();return {ok:false,queued:true,paused:true,error:reason};
  }
  // 沒有其他 writer 時直接送 GAS。
  if(!writing && navigator.onLine !== false&&
      !p79OrderedReadyQueue(readQueue(),false,Date.now()).some(x=>p79PunchUploadPriority(x)<p79PunchUploadPriority({payload}))){
    enqueue(payload);
    writing=true;
    syncBatchTotal=Math.max(1,readQueue().length);
    syncBatchDone=0;
    syncBatchStartedAt=Date.now();
    activeSyncRecordId=recordId!=null?String(recordId):'';
    currentOpText=desc(payload);
    updateUi();

    try{
      const data=await send(payload,45000);
      const latestConfirmed=remove(opKey(payload),payload);
      // 保留未讀 Delta，讓其他人的同時修改仍可同步。

      if(recordId!=null&&latestConfirmed){
        try{markRecentAttendanceMutationCloudConfirmed?.(recordId)}catch(e){}
      }

      if(String(payload?.action||'')==='deleteRecord'){
        try{confirmCloudDelete(recordId);window.p79ApplyConfirmedAttendanceDelete?.(recordId)}catch(e){}
      }
      syncBatchDone++;
      lastDoneAt=Date.now();
      currentOpText='同步完成';
      activeSyncRecordId='';

      try{p79RenderOnlyVisibleAttendanceView?.()}catch(e){}
      try{renderAdminRecordsTable?.()}catch(e){}
      try{renderAdminLiveTable?.()}catch(e){}

      if(successMsg)try{showToast(successMsg,'success')}catch(e){}
      if(typeof onSuccess==='function')try{onSuccess(data)}catch(e){}

      // 直送完成後再補傳之前失敗的考勤。
      setTimeout(()=>drain(false),0);
      return data;
    }catch(err){
      const reason=String(err?.message||err||'雲端寫入失敗');
      const current=readQueue().find(x=>x.key===opKey(payload));
      if(current&&!samePayload(current.payload,payload))return {ok:false,queued:true,error:reason};

      if(err?.retryable===false && err?.duplicatePunch===true){
        remove(opKey(payload),payload);
        const rid=recordId!=null?String(recordId):'';
        if(rid){
          rejectedPunchById.set(rid, reason);
          try{window.p79HandleRejectedPunch?.(rid,reason);}catch(e){}
          records=(Array.isArray(records)?records:[]).filter(r=>String(r?.id??'')!==rid);
          try{removeAttendanceRecordsFromArchive?.([rid])}catch(e){}
          try{forgetRecentAttendanceMutation?.(rid)}catch(e){}
          try{
            if(typeof window.p79ScheduleAttendancePersist==='function')window.p79ScheduleAttendancePersist();
            else saveRecords?.();
          }catch(e){}
        }
        try{updateHomeClockInButtonState?.()}catch(e){}
        try{renderEmpHistoryTable?.()}catch(e){}
        try{p79RenderOnlyVisibleAttendanceView?.()}catch(e){}
        currentOpText='重複刷卡已阻擋';
        updateUi();
        if(typeof onError==='function'){
          try{onError(reason)}catch(e){}
        }else{
          try{showToast(reason,'warning')}catch(e){}
        }
        return {ok:false,queued:false,duplicatePunch:err?.duplicatePunch===true,error:reason};
      }

      // 直送前已持久化；失敗時不能用舊 payload 覆蓋使用者後續修改。
      if(current){
        current.attempts=Number(current.attempts||0)+1;
        current.lastError=reason;current.state='pending';
        current.paused=p79PauseAttendanceWrite(payload,err,current.attempts);
        current.nextRetryAt=current.paused?Number.MAX_SAFE_INTEGER:Date.now()+p79AttendanceRetryDelay(payload,current.attempts);
        saveQueue(readQueue().map(x=>x.key===current.key&&samePayload(x.payload,payload)?current:x));
      }
      currentOpText=current?.paused?'已暫停，等待核對':'等待自動重試';
      updateUi();

      if(typeof onError==='function'){
        try{onError(reason)}catch(e){}
      }else{
        try{showToast(current?.paused?'修改已暫停；請核對雲端時間後重新修改，原修改內容保留':'雲端暫時未完成，這筆考勤已保留並會自動重試','warning')}catch(e){}
      }
      return {ok:false,queued:true,paused:!!current?.paused,error:reason};
    }finally{
      writing=false;
      if(lastDoneAt)scheduleDelta(100);
      activeSyncRecordId='';
      updateUi();
    }
  }

  // 已有另一筆考勤寫入中，才排入唯一 V5 outbox。
  enqueue(payload);
  if(!writing)setTimeout(()=>drain(false),0);
  currentOpText='等待前一筆完成';
  updateUi();
  return {ok:true,queued:true};
}

window.p79V5SubmitAttendanceWrite=submitAttendanceWrite;

// Preserve the original non-attendance writer before replacing the global entry point.
if(!window.p79LegacyPostToCloud && typeof window.postToCloud==='function'){
  window.p79LegacyPostToCloud=window.postToCloud;
}
window.postToCloud=async function(payload,successMsg,onSuccess,onError){
  return submitAttendanceWrite(payload,successMsg,onSuccess,onError);
};

window.flushCloudOutbox=function(force=false){return drain(force)};
window.startAttendanceRevisionWatch=function(){return startDelta()};
window.checkAttendanceCloudRevision=async function(){return false};
window.pollAttendanceDelta=pollDelta;
window.startAttendanceDeltaWatch=startDelta;

// 一般員工手機打卡也統一進 V5 單一寫入通道。


// 舊版佇列已不負責寫入，但仍保留內容供人工安全核對。
// 不能在每次進入考勤頁時清除舊版待同步資料，以免未核對的補卡遺失。

// PORT79 V5 已核實刪除請求一次性整理（2026-10-10）。
// 以上 5 個 ID 已在 companytest.tw@gmail.com 所擁有的正式 GPS考勤資料庫
// (ID 1QlixVO7V0tAdx64n1npQmWCFW8sNvsfdVh-vEtGpakE) 驗證：
// 「考勤永久刪除保護索引」有 ID、「考勤紀錄」主表沒有 ID。
// 只解除這 5 筆已完成的 deleteRecord 本機重試，不觸碰其他雲端/個人 Drive。
// 歷史歸檔實體清除狀態仍須由後端維護，不以這段本機整理冒充已清除歷史歸檔。
const PORT79_VERIFIED_DELETED_IDS_20261010 = new Set(["1791597999970","1791599671136","1791597605356","1791599649935","1791597922198"]);
function p79PruneVerifiedDeletedRecordRetries20261010(){
  if(writing)return 0;
  try{
    const raw=localStorage.getItem(OUTBOX_KEY);
    if(!raw)return 0;
    const queue=JSON.parse(raw);
    if(!Array.isArray(queue))return 0;  // 格式異常時絕不覆寫
    const keep=queue.filter(item=>{
      const payload=item?.payload;
      return !(String(payload?.action||'')==='deleteRecord' &&
        PORT79_VERIFIED_DELETED_IDS_20261010.has(String(payload?.id??payload?.record?.id??'').trim()));
    });
    const removed=queue.length-keep.length;
    if(!removed)return 0;
    localStorage.setItem(OUTBOX_KEY,JSON.stringify(keep));
    lastDoneAt=Date.now();
    currentOpText='已核實刪除的舊請求已整理';
    console.info('[PORT79] 已從本機同步佇列移除經正式永久刪除索引核對的請求：'+removed+' 筆');
    updateUi();
    return removed;
  }catch(e){
    console.warn('[PORT79] 已核實刪除佇列整理未完成，保留所有原始待同步資料',e);
    return 0;
  }
}
window.p79PruneVerifiedDeletedRecordRetries20261010=p79PruneVerifiedDeletedRecordRetries20261010;

function p79ShortenOldPunchRetryWait(){
  // 只修正舊版留下的過長 nextRetryAt；保留所有 payload/ID/attempts，不重送 paused 項目。
  const q=readQueue(), now=Date.now();
  let updated=false;
  for(const item of q){
    const action=String(item?.payload?.action||'');
    if(item?.paused || !['addRecord','queueEmployeePunch','persistEmployeePunch'].includes(action))continue;
    if(Number(item.nextRetryAt||0)>now+30000){item.nextRetryAt=now+30000;updated=true;}
  }
  if(updated)saveQueue(q);
}
document.addEventListener('DOMContentLoaded',()=>{
  p79PruneVerifiedDeletedRecordRetries20261010();
  p79ShortenOldPunchRetryWait();
  updateUi();
  startDelta();
  drain(false);
  setInterval(()=>{if(document.visibilityState==='visible')updateUi();},3000);
},{once:true});
window.addEventListener('online',()=>{drain(true);pollDelta(true)});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden){drain(false);pollDelta(true)}
});
setInterval(()=>{if(!writing)drain(false)},5000);


// ----- V5.4 HARD BRIDGE -----
// 保留非考勤舊 API；任何考勤寫入若繞過 postToCloud，仍會被攔回 V5。
if(!window.p79LegacyPerformCloudRequest && typeof window.performCloudRequest==='function'){
  window.p79LegacyPerformCloudRequest=window.performCloudRequest;
}
if(!window.p79LegacyEnqueueCloudOperation && typeof window.enqueueCloudOperation==='function'){
  window.p79LegacyEnqueueCloudOperation=window.enqueueCloudOperation;
}
if(!window.p79LegacyFlushCloudOutbox && typeof window.flushCloudOutbox==='function'){
  window.p79LegacyFlushCloudOutbox=window.flushCloudOutbox;
}

window.performCloudRequest=async function(payload,timeoutMs=0){
  if(isV5AttendanceWrite(payload)){
    return submitAttendanceWrite(payload,'',null,null);
  }
  if(typeof window.p79LegacyPerformCloudRequest==='function'){
    return window.p79LegacyPerformCloudRequest(payload,timeoutMs);
  }
  return {ok:false,error:'無可用雲端 API'};
};

window.enqueueCloudOperation=function(payload,scheduleRetry=true){
  if(isV5AttendanceWrite(payload)){
    enqueue(payload);
    if(scheduleRetry) setTimeout(()=>drain(false),0);
    return true;
  }
  if(typeof window.p79LegacyEnqueueCloudOperation==='function'){
    return window.p79LegacyEnqueueCloudOperation(payload,scheduleRetry);
  }
  return false;
};

window.flushCloudOutbox=function(force=false){
  // 考勤只跑 V5 outbox。舊 outbox 不再負責考勤。
  return drain(force);
};

window.postRealtimePunchToCloud=function(record,successMsg,onPersistSuccess,onError){
  return submitAttendanceWrite(
    {action:'addRecord',record},
    successMsg,
    data=>{try{onPersistSuccess?.(data)}catch(e){}},
    onError
  );
};

})();

