(function(){
 'use strict';
 // Public release metadata is the only download source. The ZIP is never
 // fetched with an employee token, and no private cloud data is transmitted.
 const DOWNLOAD_URL='https://github.com/kuo-code-tw/smart-punch/releases/latest/download/Port79-Windows-Lite.zip';
 const SETTINGS_KEY='p79SystemSettingsV1';
 const DEFAULT_GAS='https://script.google.com/macros/s/AKfycbzPD0v8QQol_7cMuMUFGnjHxo-9jFnRLEwoWQhW-n3g5GlbbHnaL7EhRAtcymUcdYOEzg/exec';
 const RELEASE_API='https://api.github.com/repos/kuo-code-tw/smart-punch/releases/latest';
 const RELEASE_PREFIX='https://github.com/kuo-code-tw/smart-punch/releases/download/';
 const allowedRoles=new Set(['admin','superadmin']);
 const link=document.getElementById('p79WindowsDownloadLink');
 const bar=document.getElementById('sessionBar');
 const systems=document.getElementById('systems');
 if(!link||!bar||!systems)return;
 let lastLookup=0,lookupBusy=false;
 let lastSettingsCheck=0,settingsBusy=false,downloadAllowed=false,lastManagerToken='';
 function managerSession(){
  try{
   const session=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
   const token=String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'').trim();
   return !!token&&!!session&&!session.punchOnly&&
    allowedRoles.has(String(session.adminRole||session.role||'').toLowerCase())&&
    bar.classList.contains('show')&&systems.classList.contains('show');
  }catch(_){return false;}
 }
 function managerToken(){
  return String(sessionStorage.getItem('port79_admin_token')||
   sessionStorage.getItem('port79_user_token')||
   sessionStorage.getItem('port79_gc_superadmin_token')||'').trim();
 }
 function settingsEndpoint(){
  const candidate=String(sessionStorage.getItem('port79_gas_url')||DEFAULT_GAS).trim();
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(candidate)?candidate:DEFAULT_GAS;
 }
 // Fail closed. A missing, invalid or unreachable cloud configuration never enables
 // the homepage entry. GitHub Releases itself remains a public external resource.
 async function refreshCloudDownloadSetting(){
  if(!managerSession()||settingsBusy||Date.now()-lastSettingsCheck<20000)return;
  const token=managerToken();
  if(!token)return;
  settingsBusy=true;lastSettingsCheck=Date.now();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),15000);
  let allowed=false;
  try{
   const target=settingsEndpoint()+'?action=hrGetOrgOptions&token='+encodeURIComponent(token)+'&t='+Date.now();
   const response=await fetch(target,{method:'GET',cache:'no-store',redirect:'follow',signal:controller.signal});
   if(!response.ok)throw Error('Unable to load settings');
   const data=await response.json();
   if(data?.ok===false||!data?.config||typeof data.config!=='object')throw Error('Invalid settings');
   allowed=data.config[SETTINGS_KEY]?.windowsDownload?.enabled===true;
  }catch(_){allowed=false;}
  finally{clearTimeout(timer);settingsBusy=false;}
  if(managerSession()&&token===managerToken()){
   downloadAllowed=allowed;
   update();
  }
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
   // Compact visual version: V + YYMMDD + five decimal revision digits.
   // Immutable GitHub release tags and SHA checks remain unchanged.
   const human='V'+match[1].slice(-2)+match[2]+match[3]+'.'+
    (Number.parseInt(version.slice(0,8),16)%100000).toString().padStart(5,'0');
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
   link.textContent='⬇ 電腦版下載 '+human;
   link.title='下載79號碼頭電腦版，版本 '+human+'（已核對發布檔案完整性）';
  }catch(_){
   // GitHub API can be rate limited. Its releases/latest redirect still tracks
   // the newest official package, never the mutable 2026-11-20 legacy tag.
   if(!managerSession())return;
   link.href=DOWNLOAD_URL;
   link.textContent='⬇ 電腦版下載（最新）';
   link.title='下載 GitHub 最新79號碼頭電腦版；版本查詢暫時不可用';
  }finally{lookupBusy=false;}
 }
 function update(){
  const active=managerSession();
  const token=active?managerToken():'';
  if(token!==lastManagerToken){
   lastManagerToken=token;downloadAllowed=false;lastSettingsCheck=0;
  }
  link.hidden=!(active&&downloadAllowed);
  if(link.hidden){link.removeAttribute('href');link.setAttribute('aria-disabled','true');}
  else{
   link.removeAttribute('aria-disabled');
   if(!link.hasAttribute('href'))link.href=DOWNLOAD_URL;
   placeInVisibleToolbar();
   void refreshOfficialRelease();
  }
  if(active)void refreshCloudDownloadSetting();
 }
 link.removeAttribute('href');
 link.addEventListener('click',event=>{
  if(!managerSession()||!downloadAllowed){event.preventDefault();update();}
 });
 const observer=new MutationObserver(update);
 observer.observe(bar,{attributes:true,attributeFilter:['class']});
 observer.observe(systems,{attributes:true,attributeFilter:['class']});
 window.addEventListener('pageshow',()=>{lastSettingsCheck=0;downloadAllowed=false;update();});
 // This also rechecks the latest release while the manager stays signed in.
 const retry=window.setInterval?.(update,600);
 window.addEventListener('pagehide',()=>window.clearInterval?.(retry));
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){lastSettingsCheck=0;downloadAllowed=false;}
  update();
 });
 update();
})();
