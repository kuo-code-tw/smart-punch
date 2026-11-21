(function(){
 'use strict';
 // Public release metadata is the only download source. The ZIP is never
 // fetched with an employee token, and no private cloud data is transmitted.
 const DOWNLOAD_URL='https://github.com/kuo-code-tw/smart-punch/releases/latest/download/Port79-Windows-Lite.zip';
 const RELEASE_API='https://api.github.com/repos/kuo-code-tw/smart-punch/releases/latest';
 const RELEASE_PREFIX='https://github.com/kuo-code-tw/smart-punch/releases/download/';
 const allowedRoles=new Set(['admin','superadmin']);
 const link=document.getElementById('p79WindowsDownloadLink');
 const bar=document.getElementById('sessionBar');
 const systems=document.getElementById('systems');
 if(!link||!bar||!systems)return;
 let lastLookup=0,lookupBusy=false;
 function managerSession(){
  try{
   const session=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
   const token=String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'').trim();
   return !!token&&!!session&&!session.punchOnly&&
    allowedRoles.has(String(session.adminRole||session.role||'').toLowerCase())&&
    bar.classList.contains('show')&&systems.classList.contains('show');
  }catch(_){return false;}
 }
 function placeInVisibleToolbar(){
  const tools=document.getElementById('p79HomeCompactActions')||
   document.querySelector?.('#p79WorkspaceTopbar .p79-toolbar-tools');
  if(!tools||link.parentNode===tools)return;
  const user=tools.querySelector('.p79-toolbar-user');
  tools.insertBefore(link,user||null);
 }
 // Resolve an immutable, unique versioned ZIP by querying Github's /latest
 // metadata. A fixed legacy tag and a repeatedly named ZIP cannot distinguish
 // an old browser download from the current release.
 async function refreshOfficialRelease(){
  if(!managerSession()||typeof window.fetch!=='function'||lookupBusy||
     Date.now()-lastLookup<60000)return;
  lastLookup=Date.now();lookupBusy=true;
  try{
   const response=await window.fetch(RELEASE_API+'?v='+lastLookup,{
    method:'GET',cache:'no-store',credentials:'omit',
    headers:{'Accept':'application/vnd.github+json'}
   });
   if(!response?.ok)throw Error('Release metadata unavailable');
   const release=await response.json();
   const tag=String(release?.tag_name||'');
   const match=/^port79-windows-lite-([0-9]{4})([0-9]{2})([0-9]{2})-([a-f0-9]{12})$/.exec(tag);
   if(!match||release.draft===true)throw Error('Unexpected release version');
   const version=match[4];
   // Numeric version is YYYYMMDD plus the same SHA prefix in decimal.
   // Preserve the full immutable GitHub release tag only for URL validation.
   const human=match[1]+match[2]+match[3]+Number.parseInt(version.slice(0,8),16).toString().padStart(10,'0');
   const uniqueName='Port79-Windows-Lite-'+version+'.zip';
   const named=Array.isArray(release.assets)?release.assets.find(a=>a?.name===uniqueName):null;
   const stable=Array.isArray(release.assets)?release.assets.find(a=>a?.name==='Port79-Windows-Lite.zip'):null;
   const chosen=named||stable;
   const expected=RELEASE_PREFIX+tag+'/'+(named?uniqueName:'Port79-Windows-Lite.zip');
   if(!chosen||chosen.browser_download_url!==expected||
      !/^sha256:[a-f0-9]{64}$/.test(String(chosen.digest||''))||
      !(Number(chosen.size)>0&&Number(chosen.size)<31457280))throw Error('Release asset not verified');
   if(!managerSession())return;
   link.href=expected;
   link.textContent='⬇ 系統下載 '+human;
   link.title='下載 79號碼頭正式系統，版本 '+human+'（已核對發布檔案完整性）';
  }catch(_){
   // GitHub API can be rate limited. Its releases/latest redirect still tracks
   // the newest official package, never the mutable 2026-11-20 legacy tag.
   if(!managerSession())return;
   link.href=DOWNLOAD_URL;
   link.textContent='⬇ 系統下載（最新）';
   link.title='下載 GitHub 最新 Windows 正式版；版本查詢暫時不可用';
  }finally{lookupBusy=false;}
 }
 function update(){
  link.hidden=!managerSession();
  if(!link.hidden){
   placeInVisibleToolbar();
   void refreshOfficialRelease();
  }
 }
 link.href=DOWNLOAD_URL;
 link.addEventListener('click',event=>{
  if(!managerSession()){event.preventDefault();update();}
 });
 const observer=new MutationObserver(update);
 observer.observe(bar,{attributes:true,attributeFilter:['class']});
 observer.observe(systems,{attributes:true,attributeFilter:['class']});
 window.addEventListener('pageshow',update);
 // This also rechecks the latest release while the manager stays signed in.
 const retry=window.setInterval?.(update,600);
 window.addEventListener('pagehide',()=>window.clearInterval?.(retry));
 document.addEventListener('visibilitychange',update);
 update();
})();
