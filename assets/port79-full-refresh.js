(function(g){
'use strict';
function createReader({context,fetchImpl,identity,assertCurrent,timeoutMs=30000}){
 return async function read(action,params={}){
  assertCurrent();const url=new URL(context.gas());if(url.origin!=='https://script.google.com'||!url.pathname.startsWith('/macros/s/'))throw Error('雲端來源設定不正確');
  const token=context.token();if(!token)throw Error('請先登入');
  url.searchParams.set('action',action);url.searchParams.set('token',token);url.searchParams.set('gcToken',token);url.searchParams.set('fresh','1');url.searchParams.set('_',String(Date.now()));
  Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,String(value)));
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
  try{const response=await fetchImpl(url.toString(),{method:'GET',cache:'no-store',signal:ctl.signal});const data=await response.json();
   if(!response.ok||data?.ok!==true||data.retryable||data.fromCache===true)throw Error(data?.error||'雲端尚未確認最新資料');
   assertCurrent();if(context.identity()!==identity)throw Error('登入或查詢範圍已變更，請再重新整理');return data;
  }finally{clearTimeout(timer);}
 };
}
function createRunner({check,run,notify=()=>{},setFresh=()=>{}}){
 let running=null;
 return function refresh(){if(running)return running;
  running=Promise.resolve().then(async()=>{check();setFresh(true);notify('loading','正在完整讀取雲端資料…');try{if(await run()!==true)throw Error('雲端資料尚未全部更新');check();notify('success','雲端資料已全部更新 '+new Date().toLocaleTimeString('zh-TW',{hour12:false}));return true;}catch(error){notify('error','更新未完成：'+(error?.name==='AbortError'?'雲端讀取逾時，請重試':String(error?.message||error)));return false;}finally{setFresh(false);}}).catch(error=>{notify('error',String(error?.message||error));return false;}).finally(()=>{running=null;});return running;
 };
}
const api={createReader,createRunner};if(typeof module==='object'&&module.exports){module.exports=api;return;}g.P79FullRefresh=api;
const sys=()=>document.body.dataset.p79System||'',element=id=>document.getElementById(id);
function isEditing(){return [...document.querySelectorAll('dialog[open],[role="dialog"],.modal')].some(node=>node.getClientRects().length&&getComputedStyle(node).visibility!=='hidden');}
function check(){const context=g.P79ManagementContext;if(sys()==='history'){if(typeof g.p79RefreshHistoryAll!=='function')throw Error('歷史資料頁仍在初始化');return;}
 if(!context||!context.canRead())throw Error('請先登入並確認本系統查詢權限');
 if(context.hasPendingChanges()!==false||isEditing())throw Error('有編輯中或尚未儲存的內容，請先完成儲存再重新整理，原資料已保留');}
function notify(state,message){const b=element('p79FullRefreshButton'),status=element('p79FullRefreshStatus');if(b){b.disabled=state==='loading';b.textContent=state==='loading'?'↻ 更新中…':'↻ 重新整理';}if(status){status.textContent=message;status.dataset.state=state;}}
async function refreshCurrentSystem(){
 if(sys()==='history'){await g.p79RefreshHistoryAll();return true;}
 const context=g.P79ManagementContext,identity=context.identity(),scope=JSON.stringify(context.scope?.()||{});
 const assertCurrent=()=>{check();if(context.identity()!==identity||JSON.stringify(context.scope?.()||{})!==scope)throw Error('查詢範圍已變更，請重新整理目前範圍');};
 const read=createReader({context,fetchImpl:(...args)=>g.fetch(...args),identity,assertCurrent});
 const snapshot=await context.readFresh(read,['people','organization','permissions','leave','cover','schedule','overtime','attendance','efficiency','history']);
 assertCurrent();if(snapshot?.ok!==true||snapshot.confirmedFresh!==true||snapshot.fromCache)throw Error('雲端回覆不完整');
 if(await context.applySnapshot(snapshot)!==true)throw Error('最新資料尚未套用完成');
 if(sys()==='attendance'||sys()==='workhours'){
  if(await p79StartupAttendanceCurrentMonthSync(false)!==true)throw Error('考勤月份明細讀取未完成，請再試一次');assertCurrent();p79RenderOnlyVisibleAttendanceView();
  if(sys()==='workhours'){renderAttendanceStatsTable();renderOvertimeStats();}
 }else if(sys()==='schedule'){
  if(typeof scheduleCanShowLiveAttendance==='function'&&scheduleCanShowLiveAttendance()&&await refreshScheduleAttendanceState(true)!==true)throw Error('班表已更新，但即時出勤狀態尚未完成更新');
 }else if(sys()==='hr'){
  await p79ReadCanonicalOrgOptions();assertCurrent();p79ApplyHrEmployeesPayload(snapshot.data,false,'cloud');
 }else if(sys()==='efficiency'){
  const active=activeEfficiencyTabName(),month=element(active==='dispatch'?'dispatchMonth':active==='ranking'?'rankingMonth':'filterMonth')?.value||context.scope?.().month;
  if(/^\d{4}-\d{2}$/.test(month||'')){
   const history=await read('historyGetMonthData',{type:'vessel',month});if(!Array.isArray(history.records)||!Array.isArray(history.shipMasters))throw Error('船舶歷史明細不完整');mergeEfficiencyCloudData(history);
   const roster=await read('getScheduleDataSecure',{month});currentOperationScheduleStore().apply(month,roster);operationScheduleReads.set(month,{at:Date.now(),status:'ready'});
  }
  invalidateWorkloadIndex();renderEfficiencyTabFast();saveLocal();
 }
 assertCurrent();return true;
}
const refresh=createRunner({check,run:refreshCurrentSystem,notify,setFresh:value=>{g.P79FullRefreshRunning=value;}});api.refresh=refresh;g.p79FullRefresh=refresh;
function mount(){if(element('p79FullRefreshButton'))return;const host=document.querySelector('#p79SevenTop .action');if(!host)return;
 const box=document.createElement('div');box.style.cssText='display:flex;align-items:center;gap:6px;flex-wrap:wrap';
 const button=document.createElement('button');button.id='p79FullRefreshButton';button.type='button';button.textContent='↻ 重新整理';button.title='重新讀取本系統所有相關雲端資料（目前月份與查詢範圍），保留待同步紀錄';button.addEventListener('click',refresh);
 const status=document.createElement('span');status.id='p79FullRefreshStatus';status.setAttribute('role','status');status.style.cssText='font-size:12px;max-width:320px;white-space:normal';box.append(button,status);host.prepend(box);
}
mount();const observer=new MutationObserver(mount);observer.observe(document.documentElement,{childList:true,subtree:true});
})(typeof window==='undefined'?globalThis:window);
