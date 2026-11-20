(function(){
 'use strict';
 if(window.__port79FolderProgress)return;window.__port79FolderProgress=true;
 const SYSTEMS=['attendance','workhours','leave','schedule','efficiency','hr','history'];
 const names={attendance:'考勤',workhours:'工時',leave:'請假',schedule:'排班',efficiency:'碼頭與船舶',hr:'人資',history:'歷史資料'};
 let running=false,sessionKey='',completed=0,errors=0,completedInMemoryKey='',completedInMemoryAt=0;
 const STORE='p79-windows-last-download-v1',TWO_HOURS=2*60*60*1000,ATTEMPT_GRACE=20*60*1000;
 function session(){
  try{
   const s=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
   const token=String(sessionStorage.getItem('port79_user_token')||sessionStorage.getItem('port79_admin_token')||'');
   if(!s||!token||!document.getElementById('systems')?.classList.contains('show')||!['admin','superadmin'].includes(String(s.adminRole||'').toLowerCase())||s.punchOnly===true)return null;
   return {key:String(s.empId||'').toUpperCase()+'@'+s.adminRole,scope:JSON.stringify(s.dataScope||{})};
  }catch{return null}
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
 function view(label,detail,count,show=true){
  const root=div();if(show)root.style.display='block';
  root.querySelector('.p79-desktop-label').textContent=label;root.querySelector('.p79-desktop-detail').textContent=detail;
  root.querySelector('progress').value=Math.min(SYSTEMS.length,Math.max(0,count));
 }
 function record(key){try{const all=JSON.parse(localStorage.getItem(STORE)||'{}');return all[key]||{}}catch{return{}}}
 function save(key,value){try{const all=JSON.parse(localStorage.getItem(STORE)||'{}');all[key]={...all[key],...value};localStorage.setItem(STORE,JSON.stringify(all))}catch{}}
 async function start(force=false){
  if(running||!navigator.onLine)return;
  const id=session(),api=window.Port79DataCache;
  if(!id||!api||typeof api.downloadAll!=='function')return;
  const key=id.key+'|'+id.scope,last=record(key),now=Date.now();
  if(!force&&((completedInMemoryKey===key&&now-completedInMemoryAt<TWO_HOURS)||(last.completed&&now-last.completed<TWO_HOURS)||(last.attempt&&now-last.attempt<ATTEMPT_GRACE)))return;
  running=true;completed=0;errors=0;sessionKey=key;save(key,{attempt:now});
  view('正在下載電腦本機資料','進入系統不需等下載完成；已完成 0／7 個系統',0);
  try{
   const results=await api.downloadAll((sys,index,total,state,error,detail)=>{
    if(!session()||sessionKey!==key)return;
    if(state==='done'||state==='error'){completed=Math.max(completed,index+1);if(state==='error')errors++;}
    const msg=(detail||names[sys]||sys)+(state==='error'?'（下載失敗）':'');
    view('正在下載本機資料｜'+completed+'／'+total+' 個系統',msg,completed);
   });
   if(!session()||sessionKey!==key)return;
   errors=results.filter(x=>!x.ok).length;
   if(!errors){completedInMemoryKey=key;completedInMemoryAt=Date.now();save(key,{completed:completedInMemoryAt});view('✅ 本機快取下載完成','共 7 個系統；下次開啟會先讀取本機資料',SYSTEMS.length);}
   else view('⚠ 本機快取部分未完成','成功 '+(results.length-errors)+'／'+results.length+'，未完成 '+errors+' 項；原資料均保留',SYSTEMS.length);
  }catch(error){view('❌ 本機下載未完成',String(error&&error.message||error),completed)}
  finally{running=false}
 }
 window.addEventListener('port79-desktop-force-sync',()=>void start(true));
 const interval=setInterval(()=>{if(document.body&&session()&&!running)void start(false)},1200);
 window.addEventListener('pagehide',()=>clearInterval(interval));
 setTimeout(()=>{if(session())void start(false)},1000);
})();
