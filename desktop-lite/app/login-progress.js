(function(){
 'use strict';
 if(window.__port79FolderProgress)return;window.__port79FolderProgress=true;
 const SYSTEMS=['attendance','workhours','leave','schedule','efficiency','hr','history'];
 const names={attendance:'考勤',workhours:'工時',leave:'請假',schedule:'排班',efficiency:'碼頭與船舶',hr:'人資',history:'歷史資料'};
 let running=false,sessionKey='',processed=0,successes=0,errors=0,completedInMemoryKey='',completedInMemoryAt=0,lastFailureKey='',lastNativeMessage='',lastActivityAt=0,lastHeartbeatAt=0,activeSystem='',activeDetail='',leftPage=false,monthCompleted=0,monthTotal=0;
 const STORE='p79-windows-last-download-v1',TWO_HOURS=2*60*60*1000,ATTEMPT_GRACE=20*60*1000;
 let autoDismissTimer=null;
 const SUCCESS_NOTICE_MS=6000;
 function session(){
  try{
   const s=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
   const token=String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'');
   if(!s||!token||!document.getElementById('systems')?.classList.contains('show')||!['admin','superadmin'].includes(String(s.adminRole||'').toLowerCase())||s.punchOnly===true)return null;
   return {key:String(s.empId||'').toUpperCase()+'@'+s.adminRole,scope:JSON.stringify([s.systemPermissions||{},s.dataScope||{},s.dataScopeJobs||{}])};
  }catch{return null}
 }
 function nativeProgress(phase,title,detail,count){
  // Only progress is sent; never send cloud tokens, employee IDs or business records.
  const months=(phase==='downloading'||phase==='stalled')&&activeSystem==='考勤'&&monthTotal>0;
  const payload={kind:'port79-cache-status-v1',phase,title,detail,completed:count,total:SYSTEMS.length,
   monthCompleted:months?monthCompleted:0,monthTotal:months?monthTotal:0};
  const wire=JSON.stringify(payload);if(wire===lastNativeMessage)return;lastNativeMessage=wire;
  try{if(typeof window.chrome?.webview?.postMessage==='function')window.chrome.webview.postMessage(wire)}catch(_){}
 }
 function useNativeComputerFolder(){
  // In the Windows app WebView2 already persists IndexedDB under
  // local-data/BrowserProfile. The website folder picker is unrelated to it.
  // Show true local cache state instead of incorrectly saying '未連接'.
  const api=window.Port79DataCache;
  if(!api||!window.chrome?.webview||typeof api.getFolderSyncStatus!=='function')return;
  if(api.__port79DesktopStatusMapped)return;
  const original=api.getFolderSyncStatus.bind(api);
  api.__port79DesktopStatusMapped=true;
  api.getFolderSyncStatus=async function(){
   const result=await original();
   if(result?.state&&result.state!=='idle'||!session())return result;
   let savedAt=0;
   if(typeof api.getSystemSnapshot==='function'){
    try{
     const rows=await Promise.all(SYSTEMS.map(sys=>api.getSystemSnapshot(sys).catch(()=>null)));
     for(const row of rows)savedAt=Math.max(savedAt,Number(row?.savedAt)||0);
    }catch(_){}
   }
   return {state:savedAt?'done':'idle',label:savedAt?'本機快取已保存':'已連接，待下載',folder:'Windows local-data/BrowserProfile',savedAt};
  };
  const open=api.openCenter?.bind(api);
  if(open)api.openCenter=async function(...args){
   const r=await open(...args);
   const modal=document.getElementById('p79CacheBackdrop');
   if(modal){
    for(const a of ['folder','reconnect','disconnect']){
     const control=modal.querySelector('[data-cache-action="'+a+'"]');
     if(control)control.hidden=true;
    }
    const status=modal.querySelector('#p79DeviceStatus');
    if(status)status.textContent='Windows 電腦版已自動使用 local-data/BrowserProfile 的 IndexedDB 快取；不需選擇資料夾。';
    const notes=modal.querySelectorAll('.p79-cache-note');
    for(const note of notes){
     if(note.textContent?.includes('電腦：請先建立並選擇')){
      note.textContent='Windows 電腦版會自動保存已下載的本機快取，不必選取資料夾。電腦本機快取不是完整備份；新增、修改與審批仍以正式雲端回覆為準。';
     }
    }
   }
   return r;
  };
  // The status bar can refresh as soon as the native cache integration is ready.
  try{window.dispatchEvent(new Event('p79-folder-sync-changed'))}catch(_){}
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
  if(autoDismissTimer!==null){clearTimeout(autoDismissTimer);autoDismissTimer=null;}
  const root=div();if(show)root.style.display='block';
  root.querySelector('.p79-desktop-label').textContent=label;root.querySelector('.p79-desktop-detail').textContent=detail;
  // Progress shows confirmed successful downloads, never just attempted/failed modules.
  const currentBar=root.querySelector('progress'),showMonths=(phase==='downloading'||phase==='stalled')&&activeSystem==='考勤'&&monthTotal>0;
  currentBar.max=showMonths?monthTotal:SYSTEMS.length;
  currentBar.value=showMonths?monthCompleted:Math.min(SYSTEMS.length,Math.max(0,successes));
  nativeProgress(phase,label,detail,Math.min(SYSTEMS.length,Math.max(0,successes)));
  // A successful download is a temporary notification, not a permanent overlay.
  // Keep partial failures visible so the operator can read the reason.
  if(phase==='complete'){
   autoDismissTimer=setTimeout(()=>{
    if(root.querySelector('.p79-desktop-label').textContent===label)root.style.display='none';
    autoDismissTimer=null;
   },SUCCESS_NOTICE_MS);
  }
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
  if(window.__port79CachedSessionRefreshPending===true){nativeProgress('waiting','正在核對管理員登入權限','首頁登入權限核對完成後才開始下載，避免用舊帳號範圍下載幾十個月份。',0);return;}
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
  running=true;leftPage=false;processed=0;successes=0;errors=0;monthCompleted=0;monthTotal=0;sessionKey=key;lastFailureKey='';lastActivityAt=now;lastHeartbeatAt=now;activeSystem='考勤';activeDetail='正在核對雲端資料';save(key,{attempt:now});
  useNativeComputerFolder();
  view('正在下載本機資料','已處理 0／7 個系統；下載不會阻止你使用首頁。',0);
  try{
   const results=await api.downloadAll((sys,index,total,state,error,detail)=>{
    if(!session()||sessionKey!==key)return;
    lastActivityAt=Date.now();lastHeartbeatAt=lastActivityAt;activeSystem=names[sys]||sys;activeDetail=detail||((state==='loading'?'開始下載：':'正在處理：')+activeSystem);
    if(sys==='attendance'&&state==='detail'){
     const match=String(detail||'').match(/(\d+)\s*\/\s*(\d+)\s*月/);
     if(match){
      const count=Number(match[1]),totalMonths=Number(match[2]);
      if(totalMonths>0&&totalMonths<=240&&count>=0&&count<=totalMonths){
       monthTotal=totalMonths;monthCompleted=Math.max(monthCompleted,count);
      }
     }
    }
    if(state==='done'||state==='reused'||state==='error'||state==='skipped'){
     processed=Math.max(processed,index+1);
     if(state==='done'||state==='reused')successes++;else if(state==='error')errors++;
    }
    const msg=(detail||names[sys]||sys)+(state==='error'?'（失敗）':state==='skipped'?'（未執行）':'')+'｜已處理 '+processed+'／'+total+'；成功 '+successes+' 項';
    view('正在下載 '+(names[sys]||sys),msg,processed);
   });
   if(!session()||sessionKey!==key)return;
   errors=results.filter(x=>!x.ok&&!x.skipped).length;
   const skipped=results.filter(x=>x.skipped).length;
   const size=readableSize(await cachedBytes(api));
   const stored=size?'｜已儲存本機快取約 '+size+'（不是網路下載量）':'';
   if(!errors&&!skipped){
    try{if(typeof Event==='function')window.dispatchEvent?.(new Event('p79-folder-sync-changed'))}catch(_){}
    completedInMemoryKey=key;completedInMemoryAt=Date.now();save(key,{completed:completedInMemoryAt});
    successes=results.filter(x=>x.ok).length;
    view('✅ 本機資料下載完成','成功 '+results.length+'／'+results.length+' 個系統（不含碼頭儲量）'+stored,SYSTEMS.length,'complete');
   }else{
    try{if(typeof Event==='function')window.dispatchEvent?.(new Event('p79-folder-sync-changed'))}catch(_){}
    lastFailureKey=key;
    const first=results.find(x=>!x.ok&&!x.skipped)||results.find(x=>!x.ok);
    const reason=first?(names[first.system]||first.system)+'：'+String(first.error||'未知錯誤').replace(/(?:userToken|adminToken|token)=[^&\\s]+/gi,'憑證=已隱藏').slice(0,140):'未知';
    view('⚠ 本機資料未全部完成','成功 '+successes+'／'+results.length+'，實際失敗 '+errors+' 項，未執行 '+skipped+' 項｜第一個錯誤：'+reason+stored+'；原快取保留',SYSTEMS.length,'partial');
   }
  }catch(error){
   lastFailureKey=key;view('❌ 下載中斷，原快取保留',String(error&&error.message||error),processed,'failed');
  }finally{running=false;}
 }
 // These seven downloads are sequential. The first (attendance) can contain
 // dozens of months; a completed-system counter can remain at 0 for minutes.
 // A heartbeat indicates an active wait WITHOUT inventing success or bytes.
 function heartbeat(){
  if(!running||leftPage||!session())return;
  const now=Date.now(),waitSeconds=Math.floor((now-lastActivityAt)/1000);
  if(waitSeconds<12||now-lastHeartbeatAt<12000)return;
  lastHeartbeatAt=now;
  const explanation=waitSeconds>=70?'雲端讀取較慢，正在等待原系統逾時／重試結果':'請求仍在處理；系統進度只在實際完成後增加';
  const detail=activeDetail+'｜已等待 '+waitSeconds+' 秒｜'+explanation+'｜已處理 '+processed+'／7 系統';
  nativeProgress(waitSeconds>=70?'stalled':'downloading','正在等待 '+activeSystem+' 雲端資料',detail,successes);
 }
 window.addEventListener('port79-desktop-force-sync',()=>void start(true));
 let priorSessionKey='';
 function poll(){
  if(running){heartbeat();return;}
  const id=session();
  if(!id){
   if(priorSessionKey){priorSessionKey='';nativeProgress('idle','等待管理員登入','登入後才下載私人資料庫；目前尚未開始下載。',0);}
   return;
  }
  const key=id.key+'|'+id.scope;
  if(key!==priorSessionKey){priorSessionKey=key;nativeProgress('waiting','管理員已登入，準備下載','登入驗證完成後，開始依序下載七大系統。',0);}
  if(!running)void start(false);
 }
 useNativeComputerFolder();
 const homePage=!!document.getElementById('systems');
 nativeProgress(homePage?'idle':'waiting',homePage?'等待管理員登入':'請回首頁查看下載狀態',homePage?'登入後才下載私人資料庫；目前尚未開始下載。':'本機資料仍保留；切換系統頁面會中斷首頁的下載工作，請回首頁重新下載。',0);
 const interval=setInterval(()=>{if(document.body)poll()},1200);
 window.addEventListener('pagehide',()=>{
  leftPage=true;clearInterval(interval);
  if(running){
   // Do not block returning to the homepage for 20 minutes after a real page switch.
   save(sessionKey,{attempt:0});
   nativeProgress('interrupted','下載已中斷：切換頁面','成功 '+successes+'／7、已處理 '+processed+'／7 系統；本機快取保留。返回首頁可重新下載。',successes);
  }
 });
 setTimeout(poll,1000);
})();
