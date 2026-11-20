(function(){
 'use strict';
 if(window.__port79FolderProgress)return;window.__port79FolderProgress=true;
 const SYSTEMS=['attendance','workhours','leave','schedule','efficiency','hr','history'];
 const names={attendance:'考勤',workhours:'工時',leave:'請假',schedule:'排班',efficiency:'碼頭與船舶',hr:'人資',history:'歷史資料'};
 let running=false,sessionKey='',processed=0,successes=0,errors=0,completedInMemoryKey='',completedInMemoryAt=0,lastFailureKey='',lastNativeMessage='';
 const STORE='p79-windows-last-download-v1',TWO_HOURS=2*60*60*1000,ATTEMPT_GRACE=20*60*1000;
 function session(){
  try{
   const s=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
   const token=String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'');
   if(!s||!token||!document.getElementById('systems')?.classList.contains('show')||!['admin','superadmin'].includes(String(s.adminRole||'').toLowerCase())||s.punchOnly===true)return null;
   return {key:String(s.empId||'').toUpperCase()+'@'+s.adminRole,scope:JSON.stringify(s.dataScope||{})};
  }catch{return null}
 }
 function nativeProgress(phase,title,detail,count){
  // Only progress is sent; never send cloud tokens, employee IDs or business records.
  const payload={kind:'port79-cache-status-v1',phase,title,detail,completed:count,total:SYSTEMS.length};
  const wire=JSON.stringify(payload);if(wire===lastNativeMessage)return;lastNativeMessage=wire;
  try{if(typeof window.chrome?.webview?.postMessage==='function')window.chrome.webview.postMessage(wire)}catch(_){}
 }
 function div(){
  let root=document.getElementById('p79WindowsDownloadProgress');if(root)return root;
  root=document.createElement('aside');root.id='p79WindowsDownloadProgress';root.setAttribute('role','status');root.setAttribute('aria-live','polite');
  root.style.cssText='position:fixed;right:14px;bottom:15px;z-index:12000;width:min(345px,calc(100vw - 28px));box-sizing:border-box;background:#fff;color:#12385c;border:1px solid #cbdff3;border-radius:12px;box-shadow:0 12px 38px #15385b33;padding:12px 15px;font:13px/1.5 Microsoft JhengHei,system-ui,sans-serif';
  const label=document.createElement('strong');label.className='p79-desktop-label';label.textContent='正在準備本機快取';root.append(label);
  const detail=document.createElement('div');detail.className='p79-desktop-detail';detail.style.cssText='font-size:12px;color:#54718d;margin:6px 0';root.append(detail);
  const bar=document.createElement('progress');bar.max=SYSTEMS.length;bar.value=0;bar.style.cssText='display:block;width:100%;height:12px;accent-color:#1689e7';root.append(bar);
  const close=document.createElement('button');close.type='button';close.textContent='隱藏進度';close.style.cssText='margin-top:6px;background:transparent;border:0;color:#2872b6;cursor:pointer;font-size:11px';close.addEventListener('click',()=>root.style.display='none');root.append(close);
  document.body.append(root);return root;
 }
 function view(label,detail,count,phase='downloading',show=true){
  const root=div();if(show)root.style.display='block';
  root.querySelector('.p79-desktop-label').textContent=label;root.querySelector('.p79-desktop-detail').textContent=detail;
  root.querySelector('progress').value=Math.min(SYSTEMS.length,Math.max(0,count));
  nativeProgress(phase,label,detail,count);
 }
 function record(key){try{const all=JSON.parse(localStorage.getItem(STORE)||'{}');return all[key]||{}}catch{return{}}}
 function save(key,value){try{const all=JSON.parse(localStorage.getItem(STORE)||'{}');all[key]={...all[key],...value};localStorage.setItem(STORE,JSON.stringify(all))}catch{}}
 async function cachedBytes(api){
  if(typeof api.getSystemSnapshot!=='function')return null;
  try{
   const rows=await Promise.all(SYSTEMS.map(sys=>api.getSystemSnapshot(sys).catch(()=>null)));
   return rows.reduce((sum,row)=>sum+(Number.isFinite(Number(row?.size))?Math.max(0,Number(row.size)):0),0);
  }catch(_){return null;}
 }
 function readableSize(bytes){
  if(!Number.isFinite(bytes)||bytes<=0)return '';
  return bytes>=1048576?(bytes/1048576).toFixed(2)+' MB':(bytes/1024).toFixed(1)+' KB';
 }
 async function start(force=false){
  if(running)return;
  const id=session(),api=window.Port79DataCache;
  if(!id)return;
  if(!navigator.onLine){nativeProgress('waiting','網路離線，尚未下載','已下載的本機快取會保留；連線後才會核對雲端。',0);return;}
  if(!api||typeof api.downloadAll!=='function'){nativeProgress('waiting','等待本機快取模組','登入後會自動開始下載，原登入功能不受影響。',0);return;}
  const key=id.key+'|'+id.scope,last=record(key),now=Date.now();
  if(!force&&((completedInMemoryKey===key&&now-completedInMemoryAt<TWO_HOURS)||(last.completed&&now-last.completed<TWO_HOURS))){
   nativeProgress('cached','近期本機快取已完成','最近兩小時已完成下載；可從系統匣選擇重新下載。',7);return;
  }
  if(!force&&last.attempt&&now-last.attempt<ATTEMPT_GRACE){
   if(lastFailureKey!==key)nativeProgress('waiting','上次下載尚未全部確認','為避免重複雲端請求暫停自動重試；可從系統匣手動重新下載。',0);
   return;
  }
  running=true;processed=0;successes=0;errors=0;sessionKey=key;lastFailureKey='';save(key,{attempt:now});
  view('正在下載本機資料','已處理 0／7 個系統；下載不會阻止你使用首頁。',0);
  try{
   const results=await api.downloadAll((sys,index,total,state,error,detail)=>{
    if(!session()||sessionKey!==key)return;
    if(state==='done'||state==='error'){processed=Math.max(processed,index+1);if(state==='done')successes++;else errors++;}
    const msg=(detail||names[sys]||sys)+(state==='error'?'（失敗）':'')+'｜已處理 '+processed+'／'+total+'；成功 '+successes+' 項';
    view('正在下載 '+(names[sys]||sys),msg,processed);
   });
   if(!session()||sessionKey!==key)return;
   errors=results.filter(x=>!x.ok).length;
   const size=readableSize(await cachedBytes(api));
   const stored=size?'｜已儲存本機快取約 '+size+'（不是網路下載量）':'';
   if(!errors){
    completedInMemoryKey=key;completedInMemoryAt=Date.now();save(key,{completed:completedInMemoryAt});
    view('✅ 本機資料下載完成','成功 '+results.length+'／'+results.length+' 個系統'+stored,SYSTEMS.length,'complete');
   }else{
    lastFailureKey=key;
    view('⚠ 部分資料下載失敗','成功 '+(results.length-errors)+'／'+results.length+'，失敗 '+errors+' 項'+stored+'；原快取保留',SYSTEMS.length,'partial');
   }
  }catch(error){
   lastFailureKey=key;view('❌ 下載中斷，原快取保留',String(error&&error.message||error),processed,'failed');
  }finally{running=false;}
 }
 window.addEventListener('port79-desktop-force-sync',()=>void start(true));
 let priorSessionKey='';
 function poll(){
  const id=session();
  if(!id){
   if(priorSessionKey){priorSessionKey='';nativeProgress('idle','等待管理員登入','登入後才下載私人資料庫；目前尚未開始下載。',0);}
   return;
  }
  const key=id.key+'|'+id.scope;
  if(key!==priorSessionKey){priorSessionKey=key;nativeProgress('waiting','管理員已登入，準備下載','登入驗證完成後，開始依序下載七大系統。',0);}
  if(!running)void start(false);
 }
 nativeProgress('idle','等待管理員登入','登入後才下載私人資料庫；目前尚未開始下載。',0);
 const interval=setInterval(()=>{if(document.body)poll()},1200);
 window.addEventListener('pagehide',()=>clearInterval(interval));
 setTimeout(poll,1000);
})();
