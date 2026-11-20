(function(){
 'use strict';
 // The release file is a public distribution asset. Visibility in this page is
 // limited to signed-in managers; all cloud/business permissions stay unchanged.
 const DOWNLOAD_URL='https://github.com/kuo-code-tw/smart-punch/releases/download/port79-windows-lite-20261120/Port79-Windows-Lite.zip';
 const allowedRoles=new Set(['admin','superadmin']);
 const link=document.getElementById('p79WindowsDownloadLink');
 const bar=document.getElementById('sessionBar');
 const systems=document.getElementById('systems');
 if(!link||!bar||!systems)return;
 function managerSession(){
  try{
   const session=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
   const token=String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'').trim();
   return !!token&&!!session&&!session.punchOnly&&
    allowedRoles.has(String(session.adminRole||session.role||'').toLowerCase())&&
    bar.classList.contains('show')&&systems.classList.contains('show');
  }catch(_){return false;}
 }
 function update(){link.hidden=!managerSession();}
 link.href=DOWNLOAD_URL;
 link.addEventListener('click',event=>{
  if(!managerSession()){event.preventDefault();update();}
 });
 const observer=new MutationObserver(update);
 observer.observe(bar,{attributes:true,attributeFilter:['class']});
 observer.observe(systems,{attributes:true,attributeFilter:['class']});
 window.addEventListener('pageshow',update);
 document.addEventListener('visibilitychange',update);
 update();
})();
