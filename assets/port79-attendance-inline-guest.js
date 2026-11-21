/* Runs ONLY inside attendance/?homeInline=1.
 * The original attendance modals and postToCloud writer remain in use.
 */
(function(root){
'use strict';
let inline=false,nonce='';
try{
 const url=new URL(root.location.href);
 inline=url.searchParams.get('homeInline')==='1';
 nonce=String(url.searchParams.get('p79InlineNonce')||'');
 if(!inline||!/^[a-f0-9]{32}$/.test(nonce)||root.parent===root)return;
 if(!/\/attendance\/(?:index\.html)?$/.test(url.pathname))return;
}catch(_){return;}
const TYPE='p79-attendance-inline-v2',KEY='port79_attendance_audit_handoff_v1';
const origin=root.location.origin;
let initialized=false,opened=false,writing=0,everWrote=false,synced=false,closedAt=0,genericStarted=false,specific=false;
function send(action,message=''){
 try{root.parent.postMessage({type:TYPE,nonce,action,message:String(message).slice(0,450)},origin);}
 catch(_){}
}
// Show only the original management form and its validation toasts, not the
// original page header/navigation or an empty gray embedded page.
const style=root.document.createElement('style');
style.id='p79AttendanceInlineGuestStyle';
style.textContent=
 'html,body{background:transparent!important;min-height:100%!important;overflow:hidden!important}'+
 'body>*:not(#editRecordModal):not(#addRecordModal):not(#toastContainer){display:none!important}'+
 '#editRecordModal,#addRecordModal{z-index:2147483600!important}'+
 '#editRecordModal:not(.hidden),#addRecordModal:not(.hidden){display:flex!important}'+
 '#editRecordModal .max-w-md,#addRecordModal .max-w-md{max-width:560px!important}'+
 '#addRecordModal .max-w-md,#editRecordModal .max-w-md{max-height:calc(100vh - 28px)!important;overflow-y:auto!important}';
root.document.head.appendChild(style);
const isOpen=()=>{
 const d=root.document;
 const add=d.getElementById('addRecordModal'),edit=d.getElementById('editRecordModal');
 return !!(add&&!add.classList.contains('hidden'))||!!(edit&&!edit.classList.contains('hidden'));
};
function setupWriter(){
 if(root.__p79NativeInlineWriterWrapped||typeof root.postToCloud!=='function')return;
 root.__p79NativeInlineWriterWrapped=true;
 const original=root.postToCloud;
 root.postToCloud=function(payload,...args){
  const action=String(payload?.action||'');
  const watching=initialized&&opened&&['addRecord','updateRecord','editRecord'].includes(action);
  if(watching){writing++;everWrote=true;send('writing');}
  let result;
  try{result=original.call(this,payload,...args);}
  catch(error){
   if(watching){writing=Math.max(0,writing-1);send('error',String(error?.message||error));}
   throw error;
  }
  if(watching)Promise.resolve(result).then(
   data=>{
    writing=Math.max(0,writing-1);
    if(data?.ok===true&&data.localOnly!==true&&!synced){
     synced=true;send('saved');
    }else if(data?.ok!==true||data?.localOnly===true){
     send('error',String(data?.error||data?.warning||'雲端未回報確認；請保留待同步紀錄'));
    }
   },error=>{
    writing=Math.max(0,writing-1);
    send('error',String(error?.message||error));
   });
  return result;
 };
}
root.addEventListener('message',event=>{
 if(event.source!==root.parent||event.origin!==origin)return;
 const msg=event.data;
 if(!msg||msg.type!==TYPE||msg.action!=='init'||msg.nonce!==nonce||initialized)return;
 initialized=true;
 const payload=msg.payload;
 specific=!!payload;
 try{
  if(payload){
   if(payload.source!=='home-early-audit'||!['IN','OUT'].includes(payload.side)||
      !Number.isFinite(payload.createdAt)||Date.now()-payload.createdAt>120000||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.date||'')))
    throw Error('指定員工或考勤資料交接逾時／格式不符');
   root.sessionStorage.setItem(KEY,JSON.stringify(payload));
   if(typeof root.P79AttendanceAuditHandoffStart!=='function')
    throw Error('正式考勤配對功能尚未載入');
   root.P79AttendanceAuditHandoffStart();
  }else{
   root.sessionStorage.removeItem(KEY);
  }
  send('progress',payload?'正在確認指定員工與原始打卡紀錄…':'正在載入原本的新增補卡表單…');
 }catch(error){
  root.sessionStorage.removeItem(KEY);
  send('error',String(error?.message||error));
 }
});
function poll(){
 setupWriter();
 if(!initialized)return;
 if(!opened&&!specific&&!genericStarted){
  // Generic + button uses the original Add Record modal. Row-specific pencil
  // and yellow + are handled only by the original exact-row handoff.
  const pending=root.sessionStorage.getItem(KEY);
  if(!pending&&typeof root.openManualAddModal==='function'){
   try{
    if(typeof isAdminLoggedIn!=='undefined'&&!isAdminLoggedIn)return;
    const employees=typeof root.getAdminAttendanceEmployees==='function'?
     root.getAdminAttendanceEmployees():[];
    if(!Array.isArray(employees)||employees.length===0)return;
    genericStarted=true;
    root.openManualAddModal();
   }catch(error){send('error','原本補卡表單無法開啟：'+String(error?.message||error));}
  }
 }
 const active=isOpen();
 if(active){
  closedAt=0;
  if(!opened){opened=true;send('opened');}
 }else if(opened&&!synced){
  if(!closedAt)closedAt=Date.now();
  // Original form closes before scheduling the cloud write in a microtask.
  if(!everWrote&&Date.now()-closedAt>1500)send('cancelled');
 }
}
root.P79AttendanceInlineReport=send;
const interval=root.setInterval(poll,300);
root.addEventListener('pagehide',()=>root.clearInterval(interval),{once:true});
send('ready');
})(typeof window!=='undefined'?window:globalThis);
