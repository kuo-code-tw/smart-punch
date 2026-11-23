/* Pending-duty editor: never read an iframe DOM from the parent.
 * The original attendance page owns and opens both existing modals, then
 * reports progress over a same-origin, frame-bound postMessage channel.
 */
(function(root,factory){
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.P79HomeAuditInlineEditor=api;
})(typeof window!=='undefined'?window:globalThis,function(root){
'use strict';
const TYPE='p79-attendance-inline-v2',VALID_SIDE=new Set(['IN','OUT']);
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
 const date=String(row.date||''),stamp=Date.parse(date+'T00:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(stamp)||
    new Date(stamp).toISOString().slice(0,10)!==date)
  throw Error('班表日期不正確');
 const own=side==='IN'?row.clockInEvents:row.clockOutEvents;
 const other=side==='IN'?row.clockOutEvents:row.clockInEvents;
 if(!Array.isArray(own)||!Array.isArray(other))throw Error('考勤資料尚未完整核對');
 if(own.length>1||other.length>1)throw Error('同一班有多筆候選卡，不能自動選擇');
 if([...own,...other].some(e=>!String(e?.id||'').trim()))
  throw Error('正式卡缺少原始編號，禁止錯配或重複補卡');
 if(!String(row.empId||row.attNo||row.name||'').trim())
  throw Error('缺少員工身分');
 return {source:'home-early-audit',createdAt,side,date,shift:row.shift,
  empId:row.empId,attNo:row.attNo,name:row.name,
  clockInEvents:row.clockInEvents,clockOutEvents:row.clockOutEvents};
}
function newNonce(){
 const bytes=new Uint8Array(16);
 if(!root.crypto?.getRandomValues)throw Error('安全亂數不可用，無法開啟正式考勤表單');
 root.crypto.getRandomValues(bytes);
 return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function close(force=false){
 const c=current;
 if(!c)return true;
 if((c.writing||c.saving)&&!force){
  c.status('正式考勤同步尚未完成，請先確認結果。');
  return false;
 }
 current=null;
 if(c.timer)root.clearTimeout(c.timer);
 if(c.reportTimer)root.clearTimeout(c.reportTimer);
 root.removeEventListener?.('message',c.onMessage);
 if(c.frame){c.frame.onload=null;c.frame.removeAttribute('src');}
 if(c.host?.parentNode)c.host.parentNode.removeChild(c.host);
 return true;
}
function open({url,row=null,side='',onStatus=()=>{},onSynced=async()=>{}}={}){
 const location=validUrl(url);
 if(!location){onStatus('缺少正式考勤權限，或考勤表單來源不符；沒有修改資料。');return false;}
 const dialog=$('p79DashEarlyPunchDialog');
 if(!dialog?.open){onStatus('請先開啟出勤待核明細。');return false;}
 if(!close())return false;
 let payload=null,nonce;
 try{
  payload=prepare(row,side);
  if(row&&!payload)throw Error('尚未指定要修改的上班或下班卡');
  nonce=newNonce();
 }catch(e){onStatus(String(e?.message||e));return false;}
 // One-time message nonce is for pairing this iframe instance, not a login
 // credential. SSO stays in the original URL fragment and is never posted.
 location.searchParams.set('p79InlineNonce',nonce);
 const host=root.document.createElement('section');
 host.id='p79EarlyInlineEditor';
 host.setAttribute('role','region');
 host.setAttribute('aria-label','出勤待核直接修改正式考勤');
 host.innerHTML='<div class="p79-early-inline-head"><span>📝 正在載入考勤管理原始表單</span>'+
  '<button type="button" data-early-inline-close>返回待核明細 ✕</button></div>'+
  '<p class="p79-early-inline-loading" role="status">正在確認員工與正式考勤修改權限…</p>'+
  '<iframe title="正式考勤原本修改與補卡表單" class="p79-early-inline-starting" aria-hidden="true" referrerpolicy="same-origin"></iframe>';
 dialog.appendChild(host);
 const frame=host.querySelector('iframe'),loading=host.querySelector('.p79-early-inline-loading'),
  headline=host.querySelector('.p79-early-inline-head span');
 const instance={
  frame,host,loading,headline,payload,nonce,opened:false,writing:false,saving:false,ready:false,
  timer:0,reportTimer:0,initConfirmed:false,failed:false,onMessage:null,
  status(message){
   if(current!==instance)return;
   const value=String(message||'');
   headline.textContent='📝 '+value;
   if(!instance.opened)loading.textContent=value;
   onStatus(value);
  }
 };
 current=instance;
 instance.onMessage=event=>{
  if(current!==instance||event.source!==frame.contentWindow||
     event.origin!==root.location.origin)return;
  const message=event.data;
  if(!message||message.type!==TYPE||message.nonce!==nonce)return;
  const info=String(message.message||'').slice(0,450);
  switch(message.action){
   case 'ready':
    if(instance.opened||instance.initConfirmed||instance.failed)return;
    if(!instance.ready){
     instance.ready=true;
     root.clearTimeout(instance.timer);
     // The heavy attendance page has acknowledged its secure channel.
     // Allow its original cloud/identity checks to complete rather than
     // misreporting a 25-second page-load failure.
     instance.timer=root.setTimeout(()=>{
      if(current===instance&&!instance.opened&&!instance.failed)
       instance.status('已連接考勤原始頁面，但正式員工與打卡資料尚未核對完成；請檢查登入權限及雲端連線，未修改任何資料。');
     },65000);
     instance.status('正在核對原始員工與打卡紀錄，載入考勤管理原本的表單…');
    }
    // If WebView2 discarded the first init while loading, a repeated
    // ready from this exact nonce-bound child safely retries the handoff.
    frame.contentWindow.postMessage({type:TYPE,action:'init',nonce,payload},root.location.origin);
    break;
   case 'opened':
    if(instance.opened)return;
    instance.opened=true;
    frame.classList.remove('p79-early-inline-starting');
    frame.removeAttribute('aria-hidden');
    loading.hidden=true;
    root.clearTimeout(instance.timer);
    instance.status('請直接修改／補卡，儲存後會同步考勤與待核明細。');
    break;
   case 'writing':
    instance.writing=true;
    instance.status('正式考勤正在寫入雲端；請勿關閉表單。');
    break;
   case 'saved':
    if(instance.saving)return;
    instance.writing=false;instance.saving=true;
    instance.status('雲端已確認儲存，正在重新核對出勤待核明細…');
    Promise.resolve().then(()=>onSynced()).then(()=>{
     if(current===instance){
      instance.writing=false;instance.saving=false;
      instance.status('考勤及待核明細同步完成。');
      close(true);
     }
    },error=>{
     if(current===instance){
      instance.saving=false;
      instance.status('考勤已儲存，但重新核對待核明細未完成：'+String(error?.message||error));
     }
    });
    break;
   case 'error':
    instance.writing=false;
    instance.failed=true;
    root.clearTimeout(instance.timer);
    instance.status('正式考勤未確認同步：'+(info||'請查看表單中的錯誤提示。'));
    break;
   case 'cancelled':
    if(!instance.writing&&!instance.saving)close();
    break;
   case 'progress':
    instance.initConfirmed=true;
    if(info)instance.status(info);
    break;
  }
 };
 root.addEventListener('message',instance.onMessage);
 host.querySelector('[data-early-inline-close]').addEventListener('click',()=>close());
 instance.timer=root.setTimeout(()=>{
  if(current!==instance||instance.opened)return;
  instance.status(instance.ready?
   '原本考勤表單尚未完成員工／打卡資料核對。請確認正式考勤權限與雲端連線；沒有修改任何資料。':
   '考勤原始頁面尚未回覆安全載入訊號，可能登入狀態失效或 WebView2 阻止內嵌。未寫入任何考勤資料。');
 },25000);
 // Keep the 1x1 offscreen frame rendering (not display:none/hidden)
 // so WebView2 can initialize it before we receive 'opened'.
 // Never read the child DOM or location across an isolated frame.
 frame.src=location.href;
 instance.status('正在載入考勤管理完全相同的修改／補卡表單，原待核清單不跳頁。');
 return true;
}
return {open,close,prepare,validUrl,isWriting:()=>!!(current?.writing||current?.saving)};
});
