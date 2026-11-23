/* Homepage database shortcut: opens the EXISTING browser cache centre.
 * Never starts a download on its own; user chooses an approved folder and
 * explicitly chooses which authorised cache to download. No EXE required. */
(function(){
 'use strict';
 const d=document,win=window;
 const button=d.getElementById('p79HomeDatabaseDownload');
 const bar=d.getElementById('sessionBar');
 const systems=d.getElementById('systems');
 if(!button||!bar||!systems)return;
 function permitted(){
  try{
   const session=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
   const token=String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||sessionStorage.getItem('port79_gc_superadmin_token')||'').trim();
   const role=String(session?.adminRole||session?.role||'').toLowerCase();
   return !!session&&!!token&&session.punchOnly!==true&&
    (role==='admin'||role==='superadmin')&&
    bar.classList.contains('show')&&systems.classList.contains('show');
  }catch(_){return false;}
 }
 function update(){
  // Never couple the database shortcut to the superadmin Windows ZIP setting.
  // That setting hides only #p79WindowsDownloadLink.
  button.hidden=!permitted();
  button.disabled=button.hidden;
 }
 function openDatabase(){
  if(!permitted()){update();return;}
  const cache=win.Port79DataCache;
  if(typeof cache?.openCenter!=='function'){
   win.alert?.('資料庫快取功能尚未載入，請重新整理網頁再試。');
   return;
  }
  try{
   // openCenter builds the modal synchronously, then updates stored snapshots.
   // Do not trigger showDirectoryPicker here: the browser requires an explicit
   // second click on its existing "選擇電腦資料夾" button.
   const opening=cache.openCenter();
   const modal=d.getElementById('p79CacheModal');
   if(modal){
    let note=d.getElementById('p79HomeDatabaseGuide');
    if(!note){
     note=d.createElement('div');note.id='p79HomeDatabaseGuide';
     note.className='p79-home-db-guide';
     note.setAttribute('role','note');
     const status=modal.querySelector('#p79DeviceStatus');
     if(status)modal.insertBefore(note,status);
     else modal.prepend(note);
    }
    const picker=modal.querySelector('[data-cache-action="folder"]');
    const canChoose=typeof win.showDirectoryPicker==='function';
    note.textContent=canChoose?
     '① 點「選擇電腦資料夾」指定保存位置。② 點「快速預載常用資料」或「下載六項基本資料」開始下載。未選資料夾時仍可使用瀏覽器內部快取。資料夾中可能含人員及考勤資料，請使用公司允許的位置；停用資料夾不會刪除已下載檔案。':
     '此瀏覽器無法自行選擇電腦資料夾。可直接使用瀏覽器內部快取；如公司政策允許，可改用支援資料夾選取的 Edge／Chrome。下載正式資料仍須帳號權限。';
    const focus=canChoose&&picker?picker:modal.querySelector('[data-cache-action="persist"]');
    focus?.focus?.({preventScroll:true});
   }
   Promise.resolve(opening).catch(error=>{
    win.alert?.('無法開啟資料庫快取：'+String(error?.message||error));
   });
  }catch(error){
   win.alert?.('無法開啟資料庫快取：'+String(error?.message||error));
  }
 }
 button.addEventListener('click',openDatabase);
 const observer=new MutationObserver(update);
 observer.observe(bar,{attributes:true,attributeFilter:['class']});
 observer.observe(systems,{attributes:true,attributeFilter:['class']});
 win.addEventListener('pageshow',update);
 d.addEventListener('visibilitychange',update);
 const timer=win.setInterval?.(update,2000);
 win.addEventListener('pagehide',()=>{
  observer.disconnect();
  if(timer!=null)win.clearInterval?.(timer);
 });
 update();
})();
