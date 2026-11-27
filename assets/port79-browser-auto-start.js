/* Verified homepage startup, web only. Never auto-open a popup or block login. */
(function(){
 'use strict';
 if(window.chrome?.webview?.postMessage||window.P79BrowserStartup)return;
 const KEY='p79BrowserCacheProgressV1',CHANNEL='p79-browser-cache-progress';
 // History uses direct month requests in history-data/index.html. Its optional
 // catalog is not required by that page or the six startup modules.
 const ORDER=['leave','schedule','efficiency','hr','attendance','workhours'];
 const names={leave:'請假',schedule:'排班',efficiency:'效率',hr:'人資',history:'歷史資料目錄',attendance:'考勤',workhours:'工時'};
 let running=false,closed=false,verifiedToken='',startedKey='',job=null,channel=null;
 try{if(typeof BroadcastChannel==='function')channel=new BroadcastChannel(CHANNEL)}catch(_){}
 function context(){
  try{
   const s=JSON.parse(sessionStorage.getItem('port79_user_session')||'null');
   const token=String(sessionStorage.getItem('port79_user_token')||'').trim();
   const role=String(s?.adminRole||s?.role||'').toLowerCase();
   if(!s||!token||s.punchOnly===true||!['admin','superadmin'].includes(role))return null;
   const permissions=s.systemPermissions||{};
   const allowed=sys=>role==='superadmin'||['view','edit','manage'].includes(String(permissions[sys]||'').toLowerCase());
   const systems=ORDER.filter(allowed);
   return {token,viewer:window.Port79DataCache?.viewerKey?.(),scope:JSON.stringify([permissions,s.dataScope||{},s.dataScopeJobs||{}]),systems,historyOnDemand:allowed('history')};
  }catch(_){return null}
 }
 function same(ctx){
  const now=context();
  return !closed&&window.__port79CachedSessionRefreshPending!==true&&!!now&&now.token===ctx.token&&now.viewer===ctx.viewer&&now.scope===ctx.scope;
 }
 function read(){try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(_){return null}}
 function publish(phase,detail){
  if(!job)return;
  const row={phase,detail:String(detail||'').replace(/(?:userToken|adminToken|token)=[^&\s]+/gi,'憑證=已隱藏').slice(0,180),
   viewer:job.viewer,startedAt:job.startedAt,updatedAt:Date.now(),system:job.system,
   completed:Object.values(job.states).filter(x=>x==='done'||x==='reused'||x==='deferred').length,total:job.total,
   monthCompleted:job.monthCompleted,monthTotal:job.monthTotal,states:{...job.states},historyOnDemand:job.historyOnDemand};
  job.last=row;
  try{localStorage.setItem(KEY,JSON.stringify(row))}catch(_){}
  try{channel?.postMessage(row)}catch(_){}
 }
 async function execute(ctx){
  if(!same(ctx)||running)return;
  const prior=read();
  if(prior?.viewer===ctx.viewer&&['downloading','starting'].includes(prior.phase)&&Date.now()-Number(prior.updatedAt||0)<90000)return;
  const key=ctx.token+'|'+ctx.viewer+'|'+ctx.scope;
  if(startedKey===key)return;
  startedKey=key;running=true;
  job={viewer:ctx.viewer,startedAt:Date.now(),system:'',total:ctx.systems.length,historyOnDemand:ctx.historyOnDemand,
   states:Object.fromEntries(ctx.systems.map(sys=>[sys,'waiting'])),monthCompleted:0,monthTotal:0,last:null};
  publish('starting','先檢查電腦已保存資料，只有缺少或需要重新核對的項目才讀取雲端。');
  const timer=window.setInterval?.(()=>{
   if(same(ctx)&&job?.last)publish(job.last.phase,job.last.detail);
  },10000);
  try{
   const api=window.Port79DataCache;
   const rows=await api.downloadAll((sys,index,total,state,error,detail,month)=>{
    if(!same(ctx)||!job)return;
    if(job.system!==sys){job.monthCompleted=0;job.monthTotal=0;}
    job.system=sys;
    if(state!=='detail')job.states[sys]=state;
    if(month){job.monthCompleted=Number(month.monthCompleted)||0;job.monthTotal=Number(month.monthTotal)||0;}
    const status={loading:'下載中',done:'下載完成',reused:'沿用本機資料',deferred:'按需讀取',error:'未完成',skipped:'尚未下載',detail:'處理月份'};
    publish('downloading',(names[sys]||sys)+'｜'+(detail||status[state]||state)+(error?'｜'+String(error.message||error):''));
   },{quickFirst:true,resumeExisting:true,historyOnDemand:true,prepareWorkhours:true,automaticStartup:true,systems:ctx.systems,startupGuard:()=>same(ctx)});
   if(!same(ctx))return;
   await api.flushFolder?.();
   if(!same(ctx))return;
   const storage=await api.getFolderSyncStatus?.();
   if(!same(ctx))return;
   const failures=rows.filter(x=>!x.ok);
   const storageWarning=['permission','error'].includes(storage?.state);
   job.system='';job.monthCompleted=0;job.monthTotal=0;
   publish(failures.length||storageWarning?'partial':'complete',failures.length?
    '未完成：'+failures.map(x=>names[x.system]+' '+x.error).join('；')+'。原快取保留。':
    storageWarning?'瀏覽器快取已保存，電腦資料夾尚未確認，請重新授權。':
    '啟動資料已處理。'+(rows.some(x=>x.deferred)?'完整歷史考勤按需下載，未重抓。':'已下載或沿用本機。')+(ctx.historyOnDemand?'歷史資料不列入啟動下載，請在歷史中心選月份讀取。':''));
  }catch(error){
   if(same(ctx))publish('failed','背景下載未完成，保留已完成快取：'+String(error?.message||error));
  }finally{
   if(timer!=null)window.clearInterval?.(timer);
   if(!same(ctx)&&job?.last&&['starting','downloading'].includes(job.last.phase))publish('interrupted','登入或權限已變更，停止背景下載。');
   running=false;job=null;
  }
 }
 async function start(expectedToken){
  const ctx=context();
  if(!ctx||ctx.token!==expectedToken||!ctx.systems.length||!same(ctx))return;
  verifiedToken=expectedToken;
  if(window.navigator?.onLine===false||running)return;
  const locks=window.navigator?.locks;
  if(typeof locks?.request==='function'){
   try{return await locks.request('p79-browser-auto-download-v1',{ifAvailable:true},lock=>lock?execute(ctx):undefined)}
   catch(_){return}
  }
  return execute(ctx);
 }
 window.addEventListener?.('online',()=>{if(verifiedToken)void start(verifiedToken)});
 window.addEventListener?.('pagehide',()=>{if(running&&job)publish('interrupted','分頁已離開，已完成資料保留，下次登入繼續。');closed=true;});
 window.P79BrowserStartup={start,busy:()=>running&&!!job&&same({token:verifiedToken,viewer:job.viewer,scope:context()?.scope})};
})();