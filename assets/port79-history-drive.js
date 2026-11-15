(function(g){
'use strict';
const d=g.document,$=id=>d.getElementById(id);let serial=0,controller=null,validLink=null;
const context=()=>g.Port79HistoryDriveContext;
function allowed(){try{const s=context().session();return !!s&&!s.punchOnly&&String(s.adminRole||s.role).toLowerCase()==='superadmin'&&!!context().token();}catch(_){return false;}}
function invalidate(){validLink=null;serial++;controller?.abort();controller=null;const link=$('historyDriveOpen');link.hidden=true;link.removeAttribute('href');$('historyDriveStatus').textContent='';}
async function lookup(){
 invalidate();if(!allowed())return;const c=context(),year=$('historyDriveYear').value,month=$('historyDriveMonth').value;
 if(!/^20\d{2}$/.test(year)||(month&&!/^(0[1-9]|1[0-2])$/.test(month))){$('historyDriveStatus').textContent='請選擇有效的備份年份與月份';return;}
 const captured={token:c.token(),endpoint:c.gas(),actor:c.session().empId},request=serial,same=()=>allowed()&&request===serial&&context().token()===captured.token&&context().gas()===captured.endpoint&&context().session().empId===captured.actor&&$('historyDriveYear').value===year&&$('historyDriveMonth').value===month;
 const ctrl=new AbortController();controller=ctrl;const timer=g.setTimeout(()=>ctrl.abort(),30000);$('historyDriveFind').disabled=true;$('historyDriveStatus').textContent='正在核對雲端年月資料夾…';
 try{
  const url=new URL(captured.endpoint);if(url.origin!=='https://script.google.com'||!/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname))throw Error('雲端連線網址不正確');
  for(const [k,v]of Object.entries({action:'historyBackupDriveFolder',year,month,gcToken:captured.token,_:Date.now()}))url.searchParams.set(k,v);
  const response=await g.fetch(url.href,{cache:'no-store',signal:ctrl.signal}),result=await response.json();if(!same())return;
  if(!response.ok||!result.ok)throw Error(result.error||'無法讀取雲端備份位置');
  if(result.year!==year||result.month!==month||result.basis!=='backup-date')throw Error('雲端回傳的備份年月不符');
  if(!result.found){$('historyDriveStatus').textContent='此備份年月尚未建立資料夾；沒有可開啟的雲端備份。';return;}
  const folder=new URL(result.url);if(folder.origin!=='https://drive.google.com'||!/^\/drive\/folders\/[A-Za-z0-9_-]+$/.test(folder.pathname)||folder.search||folder.hash)throw Error('雲端資料夾連結無法核對');
  const link=$('historyDriveOpen');validLink=captured;link.href=folder.href;link.textContent='開啟 '+year+'年'+(month?month+'月':'全年')+'雲端備份下載';link.hidden=false;
  $('historyDriveStatus').textContent='開啟後可在 Google 雲端硬碟選取檔案或資料夾，按「下載」。空資料夾不代表該月資料已完成備份；需使用有權限的 Google 帳號。';
 }catch(error){if(same())$('historyDriveStatus').textContent='查詢未完成：'+(error.name==='AbortError'?'連線逾時，請重新查詢':String(error.message||error));}
 finally{g.clearTimeout(timer);if(controller===ctrl)controller=null;if(request===serial)$('historyDriveFind').disabled=false;}
}
function init(){
 const panel=$('historyDrivePanel');if(!panel)return;panel.hidden=!allowed();if(panel.hidden)return;
 const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(new Date());$('historyDriveYear').value=now.slice(0,4);$('historyDriveMonth').value=now.slice(5,7);
 $('historyDriveFind').addEventListener('click',lookup);for(const id of ['historyDriveYear','historyDriveMonth'])$(id).addEventListener('change',()=>{invalidate();$('historyDriveFind').disabled=false;});
 $('historyDriveOpen').addEventListener('click',event=>{if(!allowed()||!validLink||context().token()!==validLink.token||context().gas()!==validLink.endpoint||context().session().empId!==validLink.actor){event.preventDefault();invalidate();panel.hidden=true;}});
 g.addEventListener('pageshow',()=>{panel.hidden=!allowed();if(panel.hidden)invalidate();});
}
g.Port79HistoryDrive={lookup,allowed};if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
