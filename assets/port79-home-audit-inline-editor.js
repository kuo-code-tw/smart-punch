/* Home pending-shift audit: render ONLY the original attendance edit/add
 * modal in-place; its existing cloud writer remains the single source of truth.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.P79HomeAuditInlineEditor=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const KEY='port79_attendance_audit_handoff_v1';
const VALID_SIDE=new Set(['IN','OUT']);
let current=null;
const $=id=>root.document?.getElementById(id);
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function validUrl(input){
 try{
  const url=new URL(input,root.location.href);
  if(url.origin!==root.location.origin||!/\/attendance\/(?:index\.html)?$/.test(url.pathname))return null;
  url.searchParams.set('entry','manage');
  url.searchParams.set('homeInline','1');
  return url;
 }catch(_){return null;}
}
function prepare(row,side,createdAt=Date.now()){
 if(!row||!VALID_SIDE.has(side))return null;
 const date=String(row.date||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||
    new Date(Date.parse(date+'T00:00:00Z')).toISOString().slice(0,10)!==date)
  throw Error('未取得正確的班表日期');
 const own=side==='IN'?row.clockInEvents:row.clockOutEvents;
 const other=side==='IN'?row.clockOutEvents:row.clockInEvents;
 if(!Array.isArray(own)||!Array.isArray(other))throw Error('正式考勤資料尚未完整核對');
 if(own.length>1||other.length>1)throw Error('這一班有多筆打卡，不能自動決定要修改哪一筆');
 if(own.length===1&&!String(own[0]?.id||'').trim())throw Error('原始卡缺少紀錄編號，禁止誤判為缺卡');
 if(other.length===1&&!String(other[0]?.id||'').trim())throw Error('配對卡缺少原始編號，禁止自動新增');
 if(!String(row.empId||row.attNo||row.name||'').trim())throw Error('缺少員工身分');
 return {
  source:'home-early-audit',createdAt,side,date,
  shift:row.shift,empId:row.empId,attNo:row.attNo,name:row.name,
  clockInEvents:row.clockInEvents,clockOutEvents:row.clockOutEvents
 };
}
function close(force=false){
 const c=current;
 if(!c)return;
 if(c.writing&&!force){c.status('考勤正在寫入正式雲端，請先確認儲存結果。');return false;}
 current=null;
 if(c.timer)root.clearInterval(c.timer);
 if(c.observer)c.observer.disconnect();
 if(c.frame){c.frame.onload=null;c.frame.removeAttribute('src');}
 if(c.host?.parentNode)c.host.parentNode.removeChild(c.host);
 try{root.sessionStorage.removeItem(KEY);}catch(_){}
 return true;
}
function open({url,row=null,side='',onStatus=()=>{},onSynced=async()=>{}}={}){
 const location=validUrl(url);
 if(!location){onStatus('沒有正式考勤管理權限或編輯來源不安全，未修改資料。');return false;}
 const dialog=$('p79DashEarlyPunchDialog');
 if(!dialog?.open){onStatus('請先開啟出勤待核明細。');return false;}
 close();
 if(current)return false;
 let payload=null;
 try{payload=prepare(row,side);}catch(e){onStatus(String(e?.message||e));return false;}
 if(row&&!payload){onStatus('未指定上下班打卡類型，已停止操作。');return false;}
 try{
  if(payload)root.sessionStorage.setItem(KEY,JSON.stringify(payload));
  else root.sessionStorage.removeItem(KEY);
 }catch(e){onStatus('無法安全交接指定紀錄；沒有變更資料。');return false;}
 const host=root.document.createElement('section');
 host.id='p79EarlyInlineEditor';
 host.setAttribute('role','region');
 host.setAttribute('aria-label','出勤待核原地考勤修正');
 host.innerHTML='<div class="p79-early-inline-head"><span>📝 '+h(row?row.name+'｜'+row.date+'｜'+(side==='IN'?'上班卡':'下班卡'):'新增出勤')+'</span>'+
  '<button type="button" data-early-inline-close>返回待核明細 ✕</button></div>'+
  '<p class="p79-early-inline-loading" role="status">正在載入原本考勤管理的修改／補卡表單…</p>'+
  '<iframe title="原本考勤管理打卡編輯表單" hidden></iframe>';
 dialog.appendChild(host);
 const frame=host.querySelector('iframe');
 const loading=host.querySelector('.p79-early-inline-loading');
 const headline=host.querySelector('.p79-early-inline-head span');
 const instance={
  host,frame,loading,timer:0,observer:null,writing:0,
  failed:false,synced:false,syncing:false,seenAnyWrite:false,modalOpened:false,requestedGeneric:false,hiddenSince:0,
  status(message){if(current!==instance)return;loading.textContent=String(message);headline.textContent='📝 '+String(message);onStatus(String(message));}
 };
 current=instance;
 const status=message=>instance.status(message);
 const childReady=()=>{
  if(current!==instance)return;
  let win,doc;
  try{
   win=frame.contentWindow;doc=win.document;
   const source=new URL(win.location.href);
   if(source.origin!==root.location.origin||!/\/attendance\/(?:index\.html)?$/.test(source.pathname))return;
  }catch(_){status('來源驗證失敗，停止載入；沒有修改考勤資料。');return;}
  if(!doc?.body)return;
  if(!doc.getElementById('p79InlineAuditOnlyStyle')){
   const style=doc.createElement('style');
   style.id='p79InlineAuditOnlyStyle';
   style.textContent='html,body{background:transparent!important;min-height:100%!important;overflow:hidden!important}'+
    'body>*:not(#editRecordModal):not(#addRecordModal):not(#toastContainer){display:none!important}'+
    '#editRecordModal,#addRecordModal{z-index:2147483600!important}'+
    '#editRecordModal:not(.hidden),#addRecordModal:not(.hidden){display:flex!important}'+
    '#editRecordModal .max-w-md,#addRecordModal .max-w-md{max-width:560px!important}';
   doc.head?.appendChild(style);
  }
  if(typeof win.postToCloud==='function'&&!win.__p79InlineAuditCloudWrapped){
   const original=win.postToCloud;
   win.__p79InlineAuditCloudWrapped=true;
   win.postToCloud=function(request,...rest){
    const watching=['addRecord','updateRecord','editRecord'].includes(String(request?.action||''));
    if(watching){instance.writing++;instance.seenAnyWrite=true;status('正在將正式考勤及配對資料同步到雲端…');}
    let response;
    try{response=original.call(this,request,...rest);}
    catch(e){if(watching){instance.writing=Math.max(0,instance.writing-1);instance.failed=true;status('正式考勤儲存失敗：'+String(e.message||e));}throw e;}
    if(watching)Promise.resolve(response).then(data=>{
     instance.writing=Math.max(0,instance.writing-1);
     if(data?.ok===true&&data.localOnly!==true&&!instance.failed)instance.synced=true;
     else{instance.failed=true;instance.synced=false;status('尚未確認雲端同步成功，請核對原表單的待同步狀態。');}
     if(instance.writing===0&&instance.synced&&!instance.failed&&!instance.syncing){
      instance.syncing=true;
      status('考勤已成功回傳；正在重新核對班表出勤待核及統計…');
      Promise.resolve().then(()=>onSynced()).then(()=>{
       if(current===instance){status('正式考勤、待核明細同步完成。');close(true);}
      },err=>status('雲端已回傳成功，但待核重新核對失敗：'+String(err?.message||err)));
     }
    },error=>{instance.writing=Math.max(0,instance.writing-1);instance.failed=true;status('雲端同步錯誤：'+String(error?.message||error));});
    return response;
   };
  }
  const addModal=doc.getElementById('addRecordModal');
  const editModal=doc.getElementById('editRecordModal');
  const active=!!(addModal&&!addModal.classList.contains('hidden'))||
               !!(editModal&&!editModal.classList.contains('hidden'));
  if(active){
   if(!instance.modalOpened){
    instance.modalOpened=true;
    frame.hidden=false;loading.hidden=true;
    status('請直接修改日期、時間及狀態，完成後按原本的儲存／確認補卡。');
    loading.hidden=true;
    const Observer=win.MutationObserver||root.MutationObserver;
    if(Observer){
     instance.observer=new Observer(()=>{
      const still=!!(addModal&&!addModal.classList.contains('hidden'))||
                  !!(editModal&&!editModal.classList.contains('hidden'));
      if(!still&&!instance.seenAnyWrite&&!instance.hiddenSince)instance.hiddenSince=Date.now();
      if(!still&&instance.seenAnyWrite&&instance.writing>0)status('正在等候正式雲端儲存回覆…');
     });
     for(const node of [addModal,editModal])if(node)instance.observer.observe(node,{attributes:true,attributeFilter:['class']});
    }
   }
  }else if(instance.modalOpened&&!instance.seenAnyWrite){
   if(!instance.hiddenSince)instance.hiddenSince=Date.now();
   // Original addRecord queues postToCloud in a Promise microtask AFTER it
   // closes its modal. Do not destroy the iframe before that write begins.
   if(Date.now()-instance.hiddenSince>1100)close(true);
  }
  else if(!row&&typeof win.openManualAddModal==='function'&&
          typeof win.getAdminAttendanceEmployees==='function'&&
          win.getAdminAttendanceEmployees().length>0&&!instance.requestedGeneric){
   instance.requestedGeneric=true;
   try{win.openManualAddModal();}catch(e){status('正式補卡表單無法開啟：'+String(e?.message||e));}
  }
 };
 const deadline=Date.now()+60000;
 frame.onload=()=>{
  if(current!==instance)return;
  try{if(frame.contentWindow?.location.origin!==root.location.origin)throw Error('跨來源');}
  catch(_){status('正式考勤頁來源不一致，未修改資料。');return;}
  childReady();
 };
 instance.timer=root.setInterval(()=>{
  if(current!==instance)return;
  if(Date.now()>deadline){
   root.clearInterval(instance.timer);instance.timer=0;
   if(!instance.modalOpened)status('原本考勤表單讀取逾時；沒有跳轉或修改資料，請返回後再試。');
   return;
  }
  childReady();
 },400);
 host.querySelector('[data-early-inline-close]').addEventListener('click',()=>{
  if(instance.writing){status('正式雲端同步中；請確認結果後再關閉，避免遺漏寫入。');return;}
  close(true);
 });
 frame.src=location.href;
 status('正在載入原本考勤管理的正式表單，原本出勤待核明細不會跳頁。');
 return true;
}
return {open,close,prepare,validUrl,isWriting:()=>!!current?.writing};
});
